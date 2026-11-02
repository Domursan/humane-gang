-- ===== Humane Gang — migration 206 : une série commune pour chaque jeu du jour (idée 10) =====
-- Demande d'Ethan (lot 5, validé le 02.11.2026).
-- 1. Une seule règle pour les 19 jeux notés (hg_jeux_liste) : un jour compte si la partie du jour est finie, réussie ou
--    ratée, c'est-à-dire s'il a sa ligne dans hg_jeux_resultats (écrite par hg_jeux_fin). La série tient jusqu'à la
--    bascule du jour suivant : minuit à Zurich (hg_jeux_today) pour 17 jeux, 6 h pour la Question du jour
--    (hg_quiz_daily_day) et GeoGuessr (hg_geo_day).
--    La Question du jour garde son propre calcul, avec le joker gratuit de la semaine (hg_quiz_daily_streak_of).
-- 2. hg_jeux_series() : les 19 séries du membre connecté en un seul appel, lu par chaque jeu du jour et par « Ton
--    programme du jour ». Lecture seule.
--    { jeux: { <clé>: { n, joue, jour, bascule ('minuit' | '6h'), fin (heure de la bascule) } } }
-- 3. hg_jeux_resultats commence le 27.10 alors que le Sutom, le Framed et le Heardle comptent depuis le 24.10 : les
--    parties finies du 24 au 26.10 de ces trois jeux y sont recopiées, sans rien payer (aucun appel à hg_wallet_add,
--    « points » reprend ce qui avait été versé à l'époque), pour qu'aucune série ne baisse au passage.
-- Rejouable.

-- ---------------------------------------------------------------------
-- 1. Longueur d'une série
-- ---------------------------------------------------------------------
-- Jours consécutifs joués jusqu'à p_fin compris. Un jour de p_payes (joker payant, migration 207) relie la série sans
-- compter. Fonction interne.
create or replace function public.hg_jeux__serie(p_jours date[], p_payes date[], p_fin date)
returns int language plpgsql immutable set search_path = public as $$
declare d date := p_fin; n int := 0; i int := 0;
begin
  if p_fin is null then return 0; end if;
  while i < 4000 loop
    i := i + 1;
    if d = any (coalesce(p_jours, '{}')) then n := n + 1;
    elsif not (d = any (coalesce(p_payes, '{}'))) then exit;
    end if;
    d := d - 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 2. Les 19 séries du membre connecté
-- ---------------------------------------------------------------------
create or replace function public.hg_jeux_series()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb := '{}'::jsonb; k text; j date; six boolean; jours date[]; joue boolean; n int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  foreach k in array hg_jeux_liste() loop
    six := k in ('quiz_jour', 'geo');
    j := case k when 'quiz_jour' then hg_quiz_daily_day() when 'geo' then hg_geo_day() else hg_jeux_today() end;
    if k = 'quiz_jour' then
      n := coalesce((hg_quiz_daily_streak_of(me, j)->>'current')::int, 0);
      joue := exists (select 1 from hg_quiz_daily_answers a where a.user_id = me and a.day = j and a.answered_at is not null);
    else
      select coalesce(array_agg(x.day), '{}') into jours from hg_jeux_resultats x where x.jeu = k and x.user_id = me and x.day <= j;
      joue := j = any (jours);
      n := hg_jeux__serie(jours, '{}', case when joue then j else j - 1 end);
    end if;
    r := r || jsonb_build_object(k, jsonb_build_object('n', n, 'joue', joue, 'jour', j,
      'bascule', case when six then '6h' else 'minuit' end,
      'fin', ((j + 1)::timestamp + case when six then interval '6 hours' else interval '0 hours' end) at time zone 'Europe/Zurich'));
  end loop;
  return jsonb_build_object('jeux', r);
end $$;

-- ---------------------------------------------------------------------
-- 3. Recopie du 24 au 26.10 (Sutom, Framed, Heardle), sans paiement
-- ---------------------------------------------------------------------
insert into public.hg_jeux_resultats (jeu, day, user_id, reussi, palier, points, score, secondes, created_at)
select 'sutom', g.day, g.user_id, coalesce(g.solved, false), greatest(coalesce(cardinality(g.guesses), 1), 1),
  coalesce((select w.delta from public.hg_wallet_log w where w.user_id = g.user_id and w.reason = 'sutom' and w.ref = 'sutom:' || g.day::text limit 1), 0),
  public.hg_jeux_score(g.solved, greatest(coalesce(cardinality(g.guesses), 1), 1)),
  least(round(extract(epoch from g.finished_at - g.started_at)::numeric, 2), 9999999), g.finished_at
from public.hg_sutom_games g join public.hg_profiles p on p.id = g.user_id
where g.day between date '2026-10-24' and date '2026-10-26' and g.finished_at is not null
on conflict do nothing;

insert into public.hg_jeux_resultats (jeu, day, user_id, reussi, palier, points, score, secondes, created_at)
select g.game, g.day, g.user_id, coalesce(g.solved, false), greatest(coalesce(cardinality(g.guesses), 1), 1),
  coalesce((select w.delta from public.hg_wallet_log w where w.user_id = g.user_id and w.reason = g.game and w.ref = g.game || ':' || g.day::text limit 1), 0),
  public.hg_jeux_score(g.solved, greatest(coalesce(cardinality(g.guesses), 1), 1)),
  least(round(extract(epoch from coalesce(g.updated_at, g.created_at) - g.created_at)::numeric, 2), 9999999), coalesce(g.updated_at, g.created_at)
from public.hg_daily_games g join public.hg_profiles p on p.id = g.user_id
where g.game in ('framed', 'heardle') and g.day between date '2026-10-24' and date '2026-10-26' and g.finished
on conflict do nothing;

revoke all on function public.hg_jeux__serie(date[], date[], date) from public, anon, authenticated;
revoke all on function public.hg_jeux_series() from public, anon;
grant execute on function public.hg_jeux_series() to authenticated;
