-- ===== Humane Gang — migration 184 : détail d'un jour pour l'écran Programmation =====
-- Demande d'Ethan (31.10.2026) : programmer directement dans le calendrier (La Fête foraine › Jeux › Programmation) et voir ce
-- qui est prévu. L'écriture passe par les RPC d'origine (hg_sutom_program, hg_heardle_round_save, hg_framed_round_save,
-- hg_quiz_daily_plan), qui gardent leurs règles et leurs droits : rien ne change de ce côté. Seul GeoGuessr a sa RPC d'écriture,
-- parce que changer la manche d'un jour touche deux lignes. Aucune table ne change, et hg_geo_round_save reste tel quel.
--
-- 1. hg_jeux_programme_jour(p_day) : le contenu complet d'un jour, quel que soit ce jour (les lectures des écrans d'origine
--    s'arrêtent à 30 jours passés ou à aujourd'hui) et les compteurs de joueurs qui décident ce qui reste modifiable. Lecture seule.
-- 2. hg_geo_reserve() : les manches encore en réserve, pour le formulaire, sans le plafond de 300 lignes de hg_geo_admin_list
--    (jours d'abord, réserve ensuite, donc réserve tronquée). Ni position ni image : le formulaire n'en a pas besoin. Lecture seule.
-- 3. hg_geo_programme(p_day, p_round, p_avant) : donne un jour à une manche de la réserve, ou vide le jour. Voir plus bas.
-- 4. hg_geo_active(p_round, p_active) : désactive ou réactive une manche, sans réécrire ses autres champs.
--
-- hg_jeux_programme_jour(p_day) renvoie { day, courants: { <cle>: jour en cours du jeu }, jeux: { <cle>: objet ou null } }.
-- Une clé absente de jeux : pas le droit. null : rien ce jour-là.
--   sutom   { word, definition, par, joueurs }
--   heardle { track_id, artist, title, youtube_id, start_s, cancelled, par, joueurs }
--   framed  { film_id, title, year, frames, par, joueurs }
--   geo     { id, day, label, image_path, lat, lon, photo_id, event_id, event_title, active, auteur, tentatives }
--           (auteur : qui a créé la manche, pas qui l'a programmée)
--   quiz    { question_id, prompt, qtype, difficulty, category, options, bonnes, solution, explanation, par, vus, reponses }
-- Droits, comme les écrans d'origine : Sutom, Heardle, Framed et GeoGuessr pour « souvenirs » ; Question du jour pour « quiz ».
-- La réponse d'un jour à venir n'est donc lue que par qui peut déjà la lire dans l'écran du jeu.

create or replace function public.hg_jeux_programme_jour(p_day date)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_souvenirs boolean := coalesce(hg_has_perm('souvenirs'), false);
  v_quiz boolean := coalesce(hg_has_perm('quiz'), false);
  v_jeux jsonb := '{}'::jsonb;
  v_courants jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or not (coalesce(hg_is_admin(), false) or v_souvenirs or v_quiz) then
    raise exception 'Réservé à l''admin et au Staff « Souvenirs et photos » ou « Questions du gang »';
  end if;
  if p_day is null then raise exception 'Choisis un jour'; end if;

  if v_souvenirs then
    v_courants := v_courants || jsonb_build_object('sutom', hg_sutom_day(), 'heardle', hg_jeux_today(), 'framed', hg_jeux_today(), 'geo', hg_geo_day());
    v_jeux := v_jeux || jsonb_build_object(
      'sutom', (select jsonb_build_object('word', w.word, 'definition', w.definition, 'par', pr.pseudo,
          'joueurs', (select count(*) from hg_sutom_games g where g.day = w.day))
        from hg_sutom_words w left join hg_profiles pr on pr.id = w.picked_by where w.day = p_day),
      'heardle', (select jsonb_build_object('track_id', r.track_id, 'artist', t.artist, 'title', t.title, 'youtube_id', t.youtube_id, 'start_s', t.start_s,
          'cancelled', r.cancelled, 'par', pr.pseudo,
          'joueurs', (select count(*) from hg_daily_games g where g.game = 'heardle' and g.day = r.day))
        from hg_heardle_rounds r join hg_heardle_tracks t on t.id = r.track_id left join hg_profiles pr on pr.id = r.created_by where r.day = p_day),
      'framed', (select jsonb_build_object('film_id', r.film_id, 'title', f.title, 'year', f.year, 'frames', to_jsonb(f.frames), 'par', pr.pseudo,
          'joueurs', (select count(*) from hg_daily_games g where g.game = 'framed' and g.day = r.day))
        from hg_framed_rounds r join hg_framed_films f on f.id = r.film_id left join hg_profiles pr on pr.id = r.created_by where r.day = p_day),
      'geo', (select jsonb_build_object('id', r.id, 'day', r.day, 'label', r.label, 'image_path', r.image_path, 'lat', r.lat, 'lon', r.lon,
          'photo_id', r.photo_id, 'event_id', r.event_id, 'event_title', e.title, 'active', r.active, 'auteur', pr.pseudo,
          'tentatives', (select count(*) from hg_geo_guesses g where g.round_id = r.id))
        from hg_geo_rounds r left join hg_events e on e.id = r.event_id left join hg_profiles pr on pr.id = r.created_by where r.day = p_day));
  end if;

  if v_quiz then
    v_courants := v_courants || jsonb_build_object('quiz', hg_quiz_daily_day());
    v_jeux := v_jeux || jsonb_build_object(
      'quiz', (select jsonb_build_object('question_id', q.id, 'prompt', q.prompt, 'qtype', q.qtype, 'difficulty', q.difficulty, 'category', q.category,
          'options', q.options, 'bonnes', case when q.qtype in ('choix_unique', 'vrai_faux', 'choix_multiple') then to_jsonb(hg_quiz_ids(k.answer->'correct')) end,
          'solution', hg_quiz_daily_solution_text(q.id), 'explanation', q.explanation, 'par', pr.pseudo,
          'vus', (select count(*) from hg_quiz_daily_answers x where x.day = d.day),
          'reponses', (select count(*) from hg_quiz_daily_answers x where x.day = d.day and x.answered_at is not null))
        from hg_quiz_daily d join hg_quiz_questions q on q.id = d.question_id left join hg_quiz_keys k on k.question_id = q.id
        left join hg_profiles pr on pr.id = d.picked_by where d.day = p_day));
  end if;

  return jsonb_build_object('day', p_day, 'courants', v_courants, 'jeux', v_jeux);
end $$;

-- Manches jouables de la réserve : ce que hg_geo_programme acceptera. Pas de plafond : la réserve reste petite (une photo par manche).
create or replace function public.hg_geo_reserve()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not hg_has_perm('souvenirs') then raise exception 'Réservé au Staff « souvenirs »'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'event_title', e.title) order by r.created_at desc)
    from hg_geo_rounds r left join hg_events e on e.id = r.event_id
    where r.day is null and r.active and not exists (select 1 from hg_geo_guesses g where g.round_id = r.id)), '[]'::jsonb);
end $$;

-- Programme une manche de la réserve sur un jour (p_round), ou vide le jour (p_round null), en une transaction.
-- p_avant : la manche que l'admin voit sur ce jour (null : il le voit vide). Si le jour a changé entre-temps (tirage du jour,
-- autre admin), rien n'est écrit : on ne remplace que ce qu'on a vu. La manche d'avant repart sans jour ; une manche désactivée
-- reste désactivée, donc hors réserve. Seule la colonne day change : ni lieu, ni position, ni image.
-- Prend le verrou du tirage de hg_geo_current : le tirage du jour passe avant ou après, jamais entre deux lectures d'ici.
-- Droits : ceux de hg_geo_round_save. Refus : jour passé, manche jouée, manche qui n'est plus en réserve ou désactivée.
create or replace function public.hg_geo_programme(p_day date, p_round uuid, p_avant uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_avant hg_geo_rounds; v_round hg_geo_rounds;
begin
  if not hg_has_perm('souvenirs') then raise exception 'Réservé au Staff « souvenirs »'; end if;
  if p_day is null then raise exception 'Choisis un jour'; end if;
  if p_day < hg_geo_day() then raise exception 'Choisis aujourd''hui ou un jour à venir'; end if;
  if p_round is null and p_avant is null then raise exception 'Rien à retirer ce jour-là'; end if;
  if p_round = p_avant then raise exception 'Cette manche est déjà sur ce jour'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hg_geo_day', 0));

  select * into v_avant from hg_geo_rounds where day = p_day for update;
  if v_avant.id is distinct from p_avant then raise exception 'Ce jour a changé entre-temps : regarde sa manche avant de recommencer'; end if;
  if v_avant.id is not null and exists (select 1 from hg_geo_guesses where round_id = v_avant.id) then
    raise exception 'Cette manche a déjà été jouée : elle ne change plus de jour';
  end if;

  if p_round is not null then
    select * into v_round from hg_geo_rounds where id = p_round for update;
    if not found then raise exception 'Manche introuvable'; end if;
    if v_round.day is not null or not v_round.active then raise exception 'Cette photo n''est plus en réserve'; end if;
    if exists (select 1 from hg_geo_guesses where round_id = p_round) then
      raise exception 'Cette manche a déjà été jouée : elle ne change plus de jour';
    end if;
  end if;

  begin
    if v_avant.id is not null then update hg_geo_rounds set day = null, updated_at = now() where id = v_avant.id; end if;
    if p_round is not null then update hg_geo_rounds set day = p_day, updated_at = now() where id = p_round; end if;
  exception when unique_violation then raise exception 'Une manche est déjà programmée ce jour-là';
  end;
  perform hg_admin_audit('geo_manche_programmee', null, coalesce(p_round, p_avant)::text,
    jsonb_build_object('jour', p_day, 'manche', p_round, 'avant', p_avant));
  return p_round;
end $$;

-- Désactive ou réactive une manche. Seuls active et updated_at changent : ni jour, ni lieu, ni position, ni image.
-- Droits et refus de hg_geo_round_save pour ce changement : une manche jouée peut changer d'activation ; une manche d'un jour
-- passé sans tentative est refusée, l'archive ne se réécrit pas.
create or replace function public.hg_geo_active(p_round uuid, p_active boolean)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_round hg_geo_rounds;
begin
  if not hg_has_perm('souvenirs') then raise exception 'Réservé au Staff « souvenirs »'; end if;
  if p_round is null or p_active is null then raise exception 'Données manquantes'; end if;
  select * into v_round from hg_geo_rounds where id = p_round for update;
  if not found then raise exception 'Manche introuvable'; end if;
  if v_round.day < hg_geo_day() and not exists (select 1 from hg_geo_guesses where round_id = p_round) then
    raise exception 'Choisis aujourd''hui ou un jour à venir';
  end if;
  update hg_geo_rounds set active = p_active, updated_at = now() where id = p_round;
  perform hg_admin_audit('geo_manche_modifiee', null, p_round::text,
    jsonb_build_object('jour', v_round.day, 'lieu', v_round.label, 'active', p_active));
  return p_round;
end $$;

revoke all on function public.hg_jeux_programme_jour(date) from public, anon;
revoke all on function public.hg_geo_reserve() from public, anon;
revoke all on function public.hg_geo_programme(date, uuid, uuid) from public, anon;
revoke all on function public.hg_geo_active(uuid, boolean) from public, anon;
grant execute on function public.hg_jeux_programme_jour(date) to authenticated;
grant execute on function public.hg_geo_reserve() to authenticated;
grant execute on function public.hg_geo_programme(date, uuid, uuid) to authenticated;
grant execute on function public.hg_geo_active(uuid, boolean) to authenticated;
