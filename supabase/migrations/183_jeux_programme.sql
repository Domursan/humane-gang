-- ===== Humane Gang — migration 183 : vue d'ensemble de la programmation des jeux =====
-- Demande d'Ethan (31.10.2026) : un visuel admin sur ce qui est déjà prévu pour les jeux du jour (La Fête foraine › Jeux ›
-- Programmation, admin/admin-programme.js). Lecture seule : aucune table ni donnée ne change, aucune manche n'est créée
-- (ni hg_sutom_ensure, ni hg_quiz_daily_ensure, ni hg_geo_current, ni hg_nj__manche, ni hg_nj__grille).
--
-- hg_jeux_programme(p_from, p_days) : 92 jours au plus. Renvoie { today, jeux: [...] }, un élément par jeu :
--   { cle, titre, mode, route, jours: [{ day, statut, titre, par }], reserve, reserve_totale }, plus filet pour mode = 'date',
--   et jour_courant pour GeoGuessr, dont la journée change à 6 h (hg_geo_day).
--   mode 'date'    : le jeu suit une programmation (Sutom, Heardle, Framed, GeoGuessr, Question du jour).
--                    statut : 'programme' (choisi par le Staff), 'auto' (tiré ce jour-là), 'annule' (manche annulée ou désactivée).
--                    Un jour sans ligne est un jour vide. filet : vrai si un jour vide est tiré le jour même dans une
--                    réserve (Sutom, GeoGuessr, Question du jour) ; faux s'il n'y a alors pas de manche (Heardle, Framed).
--   mode 'reserve' : tiré chaque jour dans une réserve, sans date future (jours vide).
--   mode 'genere'  : généré chaque jour, rien à programmer (reserve null).
--   reserve : jours que tient la réserve avec des éléments jamais servis ; reserve_totale : la même mesure, éléments déjà servis
--   compris. Une réserve épuisée ressert les plus anciens, sauf GeoGuessr, Heardle, Framed et Anagramme, qui s'arrêtent.
-- Droits, comme les écrans existants : Sutom, Heardle, Framed, GeoGuessr et les réserves (des nombres, jamais de contenu)
-- pour « souvenirs » ; Question du jour pour « quiz » ; un administrateur voit tout. Les titres sont les réponses.

create or replace function public.hg_jeux_programme(p_from date default null, p_days int default 42)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_today date := hg_jeux_today();
  v_debut date := coalesce(p_from, v_today);
  v_nb int := coalesce(p_days, 42);
  v_fin date;
  v_souvenirs boolean := coalesce(hg_has_perm('souvenirs'), false);
  v_quiz boolean := coalesce(hg_has_perm('quiz'), false);
  v_jeux jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or not (coalesce(hg_is_admin(), false) or v_souvenirs or v_quiz) then
    raise exception 'Réservé à l''admin et au Staff « Souvenirs et photos » ou « Questions du gang »';
  end if;
  if v_nb < 1 or v_nb > 92 then raise exception 'Période trop longue (92 jours au plus)'; end if;
  v_fin := v_debut + v_nb - 1;

  if v_souvenirs then
    -- Sutom : un mot sans auteur a été tiré dans la banque (hg_sutom_ensure).
    v_jeux := v_jeux || jsonb_build_array(jsonb_build_object('cle', 'sutom', 'titre', 'Sutom du gang', 'mode', 'date', 'route', 'fete/sutom', 'filet', true,
      'jours', coalesce((select jsonb_agg(jsonb_build_object('day', w.day, 'statut', case when w.picked_by is null then 'auto' else 'programme' end,
          'titre', w.word, 'par', pr.pseudo) order by w.day)
        from hg_sutom_words w left join hg_profiles pr on pr.id = w.picked_by
        where w.day between v_debut and v_fin), '[]'::jsonb),
      'reserve', (select count(*) from hg_sutom_bank b where b.active and not exists (select 1 from hg_sutom_words x where x.word = b.word)),
      'reserve_totale', (select count(*) from hg_sutom_bank b where b.active)));

    -- Heardle : un morceau ne sert qu'une fois (index unique sur track_id).
    v_jeux := v_jeux || jsonb_build_array(jsonb_build_object('cle', 'heardle', 'titre', 'Heardle', 'mode', 'date', 'route', 'fete/framed-heardle/heardle', 'filet', false,
      'jours', coalesce((select jsonb_agg(jsonb_build_object('day', r.day, 'statut', case when r.cancelled then 'annule' else 'programme' end,
          'titre', t.artist || ' — ' || t.title, 'par', pr.pseudo) order by r.day)
        from hg_heardle_rounds r join hg_heardle_tracks t on t.id = r.track_id left join hg_profiles pr on pr.id = r.created_by
        where r.day between v_debut and v_fin), '[]'::jsonb),
      'reserve', (select count(*) from hg_heardle_tracks t where t.status = 'valide' and not exists (select 1 from hg_heardle_rounds x where x.track_id = t.id)),
      'reserve_totale', (select count(*) from hg_heardle_tracks t where t.status = 'valide')));

    -- Framed : un film ne sert qu'une fois, et il lui faut au moins 3 images (hg_framed_round_save).
    v_jeux := v_jeux || jsonb_build_array(jsonb_build_object('cle', 'framed', 'titre', 'Framed', 'mode', 'date', 'route', 'fete/framed-heardle/framed', 'filet', false,
      'jours', coalesce((select jsonb_agg(jsonb_build_object('day', r.day, 'statut', 'programme', 'titre', f.title, 'par', pr.pseudo) order by r.day)
        from hg_framed_rounds r join hg_framed_films f on f.id = r.film_id left join hg_profiles pr on pr.id = r.created_by
        where r.day between v_debut and v_fin), '[]'::jsonb),
      'reserve', (select count(*) from hg_framed_films f where f.active and cardinality(f.frames) >= 3
        and not exists (select 1 from hg_framed_rounds x where x.film_id = f.id)),
      'reserve_totale', (select count(*) from hg_framed_films f where f.active and cardinality(f.frames) >= 3)));

    -- GeoGuessr : une manche tirée de la réserve reçoit simplement un jour : rien ne la distingue d'une manche programmée,
    -- et created_by est l'auteur de la manche, pas celui qui l'a programmée : pas de « par ».
    v_jeux := v_jeux || jsonb_build_array(jsonb_build_object('cle', 'geo', 'titre', 'GeoGuessr', 'mode', 'date', 'route', 'fete/geoguessr', 'filet', true, 'jour_courant', hg_geo_day(),
      'jours', coalesce((select jsonb_agg(jsonb_build_object('day', r.day, 'statut', case when r.active then 'programme' else 'annule' end,
          'titre', r.label) order by r.day)
        from hg_geo_rounds r
        where r.day between v_debut and v_fin), '[]'::jsonb),
      'reserve', (select count(*) from hg_geo_rounds r where r.day is null and r.active),
      'reserve_totale', (select count(*) from hg_geo_rounds r where r.active)));
  end if;

  if v_quiz then
    -- Question du jour : mêmes critères que hg_quiz_daily_pick. Une ligne sans question est remplacée par un tirage : jour vide.
    v_jeux := v_jeux || jsonb_build_array(jsonb_build_object('cle', 'quiz', 'titre', 'Question du jour', 'mode', 'date', 'route', 'fete/questions/jour', 'filet', true,
      'jours', coalesce((select jsonb_agg(jsonb_build_object('day', d.day, 'statut', case when d.picked_by is null then 'auto' else 'programme' end,
          'titre', q.prompt, 'par', pr.pseudo) order by d.day)
        from hg_quiz_daily d left join hg_quiz_questions q on q.id = d.question_id left join hg_profiles pr on pr.id = d.picked_by
        where d.day between v_debut and v_fin and d.question_id is not null), '[]'::jsonb),
      'reserve', (select count(*) from hg_quiz_questions q
        where q.difficulty in ('facile', 'moyen') and q.starts_at <= now() and hg_quiz_daily_ok(q.id)
          and not exists (select 1 from hg_quiz_daily x where x.question_id = q.id)),
      'reserve_totale', (select count(*) from hg_quiz_questions q
        where q.difficulty in ('facile', 'moyen') and q.starts_at <= now() and hg_quiz_daily_ok(q.id))));
  end if;

  if v_souvenirs then
    -- Carte mystère : mêmes critères que hg_nj__manche.
    v_jeux := v_jeux || (select jsonb_build_array(jsonb_build_object('cle', 'carte', 'titre', 'Carte mystère', 'mode', 'reserve', 'route', null::text, 'jours', '[]'::jsonb,
        'reserve', count(*) filter (where not exists (select 1 from hg_nj_rounds x where x.card_id = c.id)), 'reserve_totale', count(*)))
      from hg_cards c where c.active and c.image_url is not null and c.rarity <> 'identite' and c.member_id is null);

    -- Devinettes à éléments : mêmes critères que hg_nj__manche.
    v_jeux := v_jeux || (select coalesce(jsonb_agg(jsonb_build_object('cle', k.cle, 'titre', k.titre, 'mode', 'reserve', 'route', null::text, 'jours', '[]'::jsonb,
        'reserve', s.libres, 'reserve_totale', s.total) order by k.ordre), '[]'::jsonb)
      from (values ('jv', 'Jeu vidéo du jour', 1), ('pochette', 'Pochette du jour', 2), ('replique', 'Réplique du jour', 3),
                   ('pays', 'Pays du jour', 4), ('plat', 'Plat du jour', 5)) k(cle, titre, ordre)
      cross join lateral (select count(*) filter (where not exists (select 1 from hg_nj_rounds x where x.item_id = i.id)) as libres, count(*) as total
        from hg_nj_items i where i.jeu = k.cle and i.actif
          and (k.cle = 'replique' or (k.cle = 'pays' and i.media ? 'svg') or (k.cle not in ('replique', 'pays') and i.image is not null))) s);

    -- Grilles à contenus : mêmes critères que hg_nj__grille.
    v_jeux := v_jeux || (select coalesce(jsonb_agg(jsonb_build_object('cle', k.cle, 'titre', k.titre, 'mode', 'reserve', 'route', null::text, 'jours', '[]'::jsonb,
        'reserve', s.libres, 'reserve_totale', s.total) order by k.ordre), '[]'::jsonb)
      from (values ('connexions', 'Connexions', 1), ('motscroises', 'Mots croisés', 2), ('motmele', 'Mot mêlé', 3)) k(cle, titre, ordre)
      cross join lateral (select count(*) filter (where not exists (select 1 from hg_nj_grilles x where x.contenu_id = c.id)) as libres, count(*) as total
        from hg_nj_contenus c where c.jeu = k.cle and c.actif) s);

    -- Anagramme : hg_nj__grille prend un mot inédit par longueur (5 à 9 lettres) et refuse moins de 3 longueurs. La réserve
    -- tient donc autant de jours que la 3e longueur la mieux fournie.
    v_jeux := v_jeux || (with dico as (
        select char_length(c.data->>'mot') as lettres, c.data->>'mot' as mot from hg_nj_contenus c
        where c.jeu = 'dico' and c.actif and char_length(c.data->>'mot') between 5 and 9),
      servis as (select distinct y->>'mot' as mot from hg_nj_grilles x, jsonb_array_elements(x.secret->'mots') y where x.jeu = 'anagramme'),
      longueurs as (select d.lettres, count(*) as total, count(*) filter (where s.mot is null) as libres
        from dico d left join servis s on s.mot = d.mot group by d.lettres)
      select jsonb_build_array(jsonb_build_object('cle', 'anagramme', 'titre', 'Anagramme', 'mode', 'reserve', 'route', null::text, 'jours', '[]'::jsonb,
        'reserve', coalesce((select l.libres from longueurs l order by l.libres desc offset 2 limit 1), 0),
        'reserve_totale', coalesce((select l.total from longueurs l order by l.total desc offset 2 limit 1), 0))));

    v_jeux := v_jeux || jsonb_build_array(
      jsonb_build_object('cle', 'nerdle', 'titre', 'Nerdle du gang', 'mode', 'genere', 'route', null::text, 'jours', '[]'::jsonb, 'reserve', null::int, 'reserve_totale', null::int),
      jsonb_build_object('cle', 'code_jour', 'titre', 'Code du jour', 'mode', 'genere', 'route', null::text, 'jours', '[]'::jsonb, 'reserve', null::int, 'reserve_totale', null::int),
      jsonb_build_object('cle', 'sudoku', 'titre', 'Sudoku du jour', 'mode', 'genere', 'route', null::text, 'jours', '[]'::jsonb, 'reserve', null::int, 'reserve_totale', null::int));
  end if;

  return jsonb_build_object('today', v_today, 'jeux', v_jeux);
end $$;

revoke all on function public.hg_jeux_programme(date, int) from public, anon;
grant execute on function public.hg_jeux_programme(date, int) to authenticated;
