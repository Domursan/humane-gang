-- ===== Humane Gang — migration 208 : « Mes stats » des jeux du jour (idée 18, lot 5) =====
-- Demande d'Ethan (02.11.2026) : une vue « Mes stats » de la page Jeux (/pages/jeux/jeux.html#mes-stats), ouverte depuis
-- « Ma carte », qui lit tout dans hg_jeux_resultats en un seul appel. Visible par le membre seul : la fonction ne lit que
-- auth.uid(), le seul autre membre nommé est le rival (le membre juste au-dessus au classement de la période, même calcul
-- que hg_jeux_classement : somme des points sur 10, puis pseudo).
-- hg_jeux_mes_stats(p_periode) : p_periode = '7' (7 derniers jours), 'mois' (depuis le 1er du mois) ou 'tout' (défaut).
--   total : parties, réussies, moyenne sur 10, Paillettes des parties ; bonus « 16 jeux » (hg_jeux_bonus) à part ;
--   moi / rival : points, rang, nombre de classés sur la période ;
--   jeux : une ligne par jeu de hg_jeux_liste() (19 jeux), même sans partie : parties, réussies, moyenne, meilleur, Paillettes,
--     essais (palier moyen des parties réussies), secondes (temps moyen), sans_temps (parties sans temps noté), depuis, serie, record.
-- Série : un jour compte si la partie du jour est finie, réussie ou ratée (une ligne dans hg_jeux_resultats). Elle est vivante si
-- le dernier jour joué est aujourd'hui ou hier, au jour du jeu : minuit à Zurich (hg_jeux_today), 6 h pour la Question du jour
-- (hg_quiz_daily_day) et GeoGuessr (hg_geo_day). Les séries ne dépendent pas de la période (c'est un état du moment) ;
-- record = plus longue suite de jours joués. Aucune écriture, aucune Paillette. Rejouable.

create or replace function public.hg_jeux_mes_stats(p_periode text default 'tout')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_moi uuid := auth.uid(); v_per text; d date := hg_jeux_today(); d0 date; v_depuis date; v_toutes int;
  v_total jsonb; v_bonus jsonb; v_moi_cl jsonb; v_rival jsonb; v_jeux jsonb;
begin
  if v_moi is null or not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  v_per := case when p_periode in ('7', 'mois', 'tout') then p_periode else 'tout' end;
  d0 := case v_per when '7' then d - 6 when 'mois' then date_trunc('month', d)::date else date '2000-01-01' end;
  -- Premier résultat enregistré (tous membres : la date d'ouverture des stats) et mes parties, toutes périodes.
  select min(day) into v_depuis from hg_jeux_resultats where jeu = any (hg_jeux_liste());
  select count(*)::int into v_toutes from hg_jeux_resultats where user_id = v_moi and jeu = any (hg_jeux_liste());

  -- Totaux de la période
  select jsonb_build_object('parties', count(*), 'reussies', count(*) filter (where reussi),
      'moyenne', round(avg(score)::numeric, 1), 'paillettes', coalesce(sum(points), 0))
    into v_total from hg_jeux_resultats where user_id = v_moi and jeu = any (hg_jeux_liste()) and day >= d0;
  select jsonb_build_object('n', count(*), 'paillettes', coalesce(sum(points), 0))
    into v_bonus from hg_jeux_bonus where user_id = v_moi and day >= d0;

  -- Classement de la période (même calcul que la semaine de hg_jeux_classement) : mon rang, et le membre juste au-dessus.
  with cl as (
    select r.user_id, p.pseudo, p.color, p.avatar_url, sum(r.score)::int as points,
      row_number() over (order by sum(r.score) desc, p.pseudo) as rang
    from hg_jeux_resultats r join hg_profiles p on p.id = r.user_id
    where r.jeu = any (hg_jeux_liste()) and r.day >= d0 and not coalesce(p.is_ghost, false)
    group by r.user_id, p.pseudo, p.color, p.avatar_url)
  select jsonb_build_object('points', m.points, 'rang', m.rang, 'total', (select count(*) from cl)),
      (select jsonb_build_object('pseudo', x.pseudo, 'color', x.color, 'avatar_url', x.avatar_url, 'points', x.points, 'ecart', x.points - m.points)
        from cl x where x.rang = m.rang - 1)
    into v_moi_cl, v_rival from cl m where m.user_id = v_moi;

  -- Jeu par jeu : chiffres de la période, séries sur tout l'historique.
  with mes as (
      select jeu, day, reussi, palier, points, score, secondes from hg_jeux_resultats where user_id = v_moi and jeu = any (hg_jeux_liste())),
    -- Suites de jours consécutifs (« îles ») : jour moins son rang dans le jeu, constant sur une suite
    iles as (select jeu, day, day - (row_number() over (partition by jeu order by day))::int as ile from mes),
    suites as (select jeu, max(day) as fin, count(*)::int as n from iles group by jeu, ile),
    jours as (
      select k as jeu, case k when 'quiz_jour' then hg_quiz_daily_day() when 'geo' then hg_geo_day() else d end as auj
      from unnest(hg_jeux_liste()) as k),
    series as (
      select jo.jeu,
        coalesce((select s.n from suites s where s.jeu = jo.jeu and s.fin >= jo.auj - 1 order by s.fin desc limit 1), 0) as serie,
        coalesce((select max(s.n) from suites s where s.jeu = jo.jeu), 0) as record
      from jours jo),
    periode as (
      select jeu, count(*)::int as parties, count(*) filter (where reussi)::int as reussies,
        round(avg(score)::numeric, 1) as moyenne, max(score)::int as meilleur, coalesce(sum(points), 0)::int as paillettes,
        round((avg(palier) filter (where reussi))::numeric, 1) as essais,
        round(avg(secondes)::numeric)::int as secondes, count(*) filter (where secondes is null)::int as sans_temps,
        min(day) as depuis
      from mes where day >= d0 group by jeu)
  select coalesce(jsonb_agg(jsonb_build_object('jeu', jo.jeu, 'parties', coalesce(p.parties, 0), 'reussies', coalesce(p.reussies, 0),
      'moyenne', p.moyenne, 'meilleur', p.meilleur, 'paillettes', coalesce(p.paillettes, 0), 'essais', p.essais, 'secondes', p.secondes,
      'sans_temps', coalesce(p.sans_temps, 0), 'depuis', p.depuis, 'serie', s.serie, 'record', s.record)
      order by coalesce(p.parties, 0) desc, jo.jeu), '[]'::jsonb)
    into v_jeux
    from jours jo join series s on s.jeu = jo.jeu left join periode p on p.jeu = jo.jeu;

  return jsonb_build_object('periode', v_per, 'day', d, 'de', case when v_per = 'tout' then v_depuis else d0 end, 'depuis', v_depuis,
    'toutes_parties', v_toutes, 'total', v_total, 'bonus', v_bonus, 'moi', v_moi_cl, 'rival', v_rival, 'jeux', v_jeux);
end $$;

revoke all on function public.hg_jeux_mes_stats(text) from public, anon;
grant execute on function public.hg_jeux_mes_stats(text) to authenticated;
