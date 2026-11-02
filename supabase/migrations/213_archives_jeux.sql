-- ===== Humane Gang — migration 213 : manches passées jouables « pour l'honneur » (idée 13) =====
-- Demande d'Ethan (lot 5, validé le 02.11.2026).
-- 1. Les 30 dernières manches de 16 jeux du jour se rejouent pour l'honneur : Sutom, Framed, Heardle, Code du jour, les
--    6 jeux « devine » (carte, jv, pochette, replique, pays, plat), les 5 grilles (connexions, motscroises, motmele,
--    anagramme, nerdle) et le Sudoku (grille tirée de la date). Pas la Question du jour ni « Qui a dit ça ? ».
-- 2. Sans récompense : une partie passée n'appelle jamais hg_jeux_fin (ni Paillettes, ni points, ni classement, ni série,
--    ni bonus « 16 jeux »). Elle est gardée dans hg_jeux_honneur, une table à part, seulement pour l'afficher.
-- 3. Mêmes protections que la manche du jour : la réponse d'une manche n'est renvoyée qu'une fois la partie finie
--    (le jour même, ou pour l'honneur). Liste : hg_jeux_archive(jeu) ; partie : hg_jeux_honneur_etat(jeu, jour) et
--    hg_jeux_honneur_essai(jeu, jour, essai), qui renvoient l'état sous la forme de l'état du jour de chaque jeu.
-- 4. Ce qui était déjà public est refermé : l'historique du Heardle (hg_heardle_historique) cache titre, artiste et vidéo
--    tant que la manche n'est pas jouée ; « Hier · titre » (hg_daily_hier : Framed et Heardle ; « hier » de hg_nj_etat)
--    n'est renvoyé qu'à ceux qui ont joué la manche d'hier ; les images d'un Framed passé (stockage, hg_jeux_obj_visible)
--    ne se lisent plus que jusqu'à l'image dévoilée, comme le jour même.
-- Rejouable.

-- ---------------------------------------------------------------------
-- 1. Table des parties pour l'honneur
-- ---------------------------------------------------------------------
-- essais : liste des essais (Sutom : mots ; Framed, Heardle, jeux devine : identifiants ou réponses, '' = passer ;
-- Code du jour : { n, essai, bien, mal }) ; etat : état d'une grille (comme hg_nj_gparties.etat) ; erreurs : essais refusés
-- (Sutom) ou erreurs (grilles) ; palier : essais (ou palier de la grille) de la partie finie ; score : points sur 10, pour
-- information seulement (jamais crédités).
create table if not exists public.hg_jeux_honneur (
  jeu text not null,
  day date not null,
  user_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  essais jsonb not null default '[]'::jsonb,
  etat jsonb not null default '{}'::jsonb,
  erreurs int not null default 0,
  fini boolean not null default false,
  reussi boolean not null default false,
  palier int,
  score int,
  debut timestamptz not null default now(),
  termine_at timestamptz,
  secondes numeric(9, 2),
  primary key (jeu, day, user_id)
);
alter table public.hg_jeux_honneur enable row level security;
revoke all on table public.hg_jeux_honneur from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Outils internes
-- ---------------------------------------------------------------------
-- Jeux qui ont des manches passées jouables (clés de hg_jeux_resultats).
create or replace function public.hg_jeux__honneur_liste()
returns text[] language sql immutable set search_path = public as $$
  select array['sutom', 'framed', 'heardle', 'code_jour', 'nj_carte', 'nj_jv', 'nj_pochette', 'nj_replique', 'nj_pays',
    'nj_plat', 'nj_connexions', 'nj_motscroises', 'nj_motmele', 'nj_anagramme', 'nj_nerdle', 'nj_sudoku'] $$;

-- Mêmes droits que la manche du jour du jeu : membre (Sutom, Framed, Heardle), page du jeu ouverte (jeux nj), Duels
-- (Code du jour). Lève une erreur sinon.
create or replace function public.hg_jeux__honneur_acces(p_jeu text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (coalesce(p_jeu, '') = any (hg_jeux__honneur_liste())) then raise exception 'Jeu inconnu'; end if;
  if p_jeu = 'code_jour' then
    if not hg_duel_peut() or exists (select 1 from hg_duel_invites where user_id = auth.uid()) then
      raise exception 'Accès réservé.' using errcode = '42501';
    end if;
  elsif not hg_is_member() then
    raise exception 'Réservé aux membres';
  elsif p_jeu like 'nj\_%' and not hg_nj_acces(substr(p_jeu, 4)) then
    raise exception 'Ce jeu n''est pas encore ouvert pour toi.';
  end if;
end $$;

-- Les 30 dernières manches d'un jeu avant aujourd'hui (minuit à Zurich), avec leur numéro.
create or replace function public.hg_jeux__honneur_jours(p_jeu text)
returns table (day date, num int) language plpgsql stable security definer set search_path = public as $$
declare d date := hg_jeux_today();
begin
  if p_jeu = 'sutom' then
    return query select w.day, greatest(w.day - date '2026-10-26' + 1, 1)::int from hg_sutom_words w
      where w.day < hg_sutom_day() and w.word is not null order by w.day desc limit 30;
  elsif p_jeu = 'framed' then
    return query select r.day, (select count(*) from hg_framed_rounds x where x.day <= r.day)::int from hg_framed_rounds r
      where r.day < d order by r.day desc limit 30;
  elsif p_jeu = 'heardle' then
    return query select r.day, (select count(*) from hg_heardle_rounds x where x.day <= r.day and not x.cancelled)::int from hg_heardle_rounds r
      where r.day < d and not r.cancelled order by r.day desc limit 30;
  elsif p_jeu = 'code_jour' then
    return query select j.jour, (select count(*) from hg_duel_jour x where x.jour <= j.jour)::int from hg_duel_jour j
      where j.jour < hg_duel__aujourdhui() order by j.jour desc limit 30;
  elsif p_jeu = 'nj_sudoku' then
    return query select g::date, (g::date - date '2026-10-25')::int
      from generate_series(d - 1, greatest(d - 30, date '2026-10-26'), interval '-1 day') g;
  elsif p_jeu in ('nj_connexions', 'nj_motscroises', 'nj_motmele', 'nj_anagramme', 'nj_nerdle') then
    return query select g.day, (select count(*) from hg_nj_grilles x where x.jeu = g.jeu and x.day <= g.day)::int from hg_nj_grilles g
      where g.jeu = substr(p_jeu, 4) and g.day < d order by g.day desc limit 30;
  elsif p_jeu like 'nj\_%' then
    return query select r.day, (select count(*) from hg_nj_rounds x where x.jeu = r.jeu and x.day <= r.day)::int from hg_nj_rounds r
      where r.jeu = substr(p_jeu, 4) and r.day < d order by r.day desc limit 30;
  end if;
end $$;

-- Vrai si le membre a fini la manche le jour même (partie notée, ou partie du jeu terminée).
create or replace function public.hg_jeux__honneur_reel(p_jeu text, p_day date, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from hg_jeux_resultats r where r.jeu = p_jeu and r.day = p_day and r.user_id = p_user)
    or case
      when p_jeu = 'sutom' then exists (select 1 from hg_sutom_games g where g.day = p_day and g.user_id = p_user and g.finished_at is not null)
      when p_jeu = 'code_jour' then exists (select 1 from hg_duel_jour_essais e where e.jour = p_day and e.user_id = p_user and e.bien = 4)
        or (select count(*) from hg_duel_jour_essais e where e.jour = p_day and e.user_id = p_user) >= 10
      when p_jeu = 'nj_sudoku' then exists (select 1 from hg_nj_solo s where s.jeu = 'sudoku' and s.variante = p_day::text and s.user_id = p_user and s.gagne)
      when p_jeu in ('nj_connexions', 'nj_motscroises', 'nj_motmele', 'nj_anagramme', 'nj_nerdle') then
        exists (select 1 from hg_nj_gparties g where g.jeu = substr(p_jeu, 4) and g.day = p_day and g.user_id = p_user and g.fini)
      else exists (select 1 from hg_daily_games g where g.game = p_jeu and g.day = p_day and g.user_id = p_user and g.finished) end $$;

-- Réponse d'une manche, affichée dans la liste une fois la manche jouée (jamais avant).
create or replace function public.hg_jeux__honneur_titre(p_jeu text, p_day date)
returns text language plpgsql stable security definer set search_path = public as $$
declare g hg_nj_grilles; r hg_nj_rounds;
begin
  if p_jeu = 'sutom' then return (select word from hg_sutom_words where day = p_day); end if;
  if p_jeu = 'framed' then return (select f.title from hg_framed_rounds x join hg_framed_films f on f.id = x.film_id where x.day = p_day); end if;
  if p_jeu = 'heardle' then return (select t.artist || ' — ' || t.title from hg_heardle_rounds x join hg_heardle_tracks t on t.id = x.track_id where x.day = p_day); end if;
  if p_jeu = 'code_jour' then return (select secret from hg_duel_jour where jour = p_day); end if;
  if p_jeu = 'nj_sudoku' then return 'Niveau ' || (hg_nj__sudoku(p_day)->>'niveau'); end if;
  if p_jeu in ('nj_connexions', 'nj_motscroises', 'nj_motmele', 'nj_anagramme', 'nj_nerdle') then
    select * into g from hg_nj_grilles where jeu = substr(p_jeu, 4) and day = p_day;
    return case g.jeu
      when 'connexions' then (select string_agg(x->>'titre', ' · ' order by o) from jsonb_array_elements(g.secret->'groupes') with ordinality t(x, o))
      when 'motmele' then g.public->>'theme'
      when 'anagramme' then (select string_agg(x->>'mot', ' · ' order by o) from jsonb_array_elements(g.secret->'mots') with ordinality t(x, o))
      when 'nerdle' then g.secret->>'calcul'
      else null end;
  end if;
  select * into r from hg_nj_rounds where jeu = substr(p_jeu, 4) and day = p_day;
  if r.jeu is null then return null; end if;
  return hg_nj__contenu(r)->>'libelle';
end $$;

-- Partie d'un jeu « devine » (Framed, Heardle, jeux nj) pour un jour : celle du jour même si elle est finie, sinon celle
-- pour l'honneur, sinon une partie vide.
create or replace function public.hg_jeux__honneur_partie(p_jeu text, p_day date)
returns table (guesses text[], solved boolean, finished boolean, score int, reel boolean)
language sql stable security definer set search_path = public as $$
  select x.guesses, x.solved, x.finished, x.score, x.reel from (
    select 1 as o, g.guesses, coalesce(g.solved, false) as solved, true as finished, coalesce(g.score, 0)::int as score, true as reel
      from hg_daily_games g where g.game = p_jeu and g.day = p_day and g.user_id = auth.uid() and g.finished
    union all
    select 2, array(select jsonb_array_elements_text(h.essais)), h.reussi, h.fini, coalesce(h.score, 0), false
      from hg_jeux_honneur h where h.jeu = p_jeu and h.day = p_day and h.user_id = auth.uid()
    union all
    select 3, '{}'::text[], false, false, 0, false) x
  order by x.o limit 1 $$;

-- Un essai d'un jeu « devine » pour l'honneur (copie de hg_daily_apply, sans hg_jeux_fin).
create or replace function public.hg_jeux__honneur_appliquer(p_jeu text, p_day date, p_answer text, p_guess text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); h hg_jeux_honneur; v_essais jsonb; v_n int; v_ok boolean;
begin
  if hg_jeux__honneur_reel(p_jeu, p_day, me) then raise exception 'Tu as déjà joué cette manche le jour même.'; end if;
  insert into hg_jeux_honneur (jeu, day, user_id) values (p_jeu, p_day, me) on conflict do nothing;
  select * into h from hg_jeux_honneur where jeu = p_jeu and day = p_day and user_id = me for update;
  if h.fini then raise exception 'Tu as déjà terminé cette manche.'; end if;
  if p_guess is not null and h.essais ? p_guess then raise exception 'Tu as déjà proposé cette réponse.'; end if;
  v_ok := p_guess is not null and p_guess = p_answer;
  v_essais := h.essais || to_jsonb(coalesce(p_guess, ''));
  v_n := jsonb_array_length(v_essais);
  update hg_jeux_honneur set essais = v_essais,
    fini = v_ok or v_n >= 6, reussi = v_ok,
    palier = case when v_ok or v_n >= 6 then v_n end,
    score = case when v_ok then hg_jeux_score(true, v_n) when v_n >= 6 then 0 end,
    termine_at = case when v_ok or v_n >= 6 then now() end,
    secondes = case when v_ok or v_n >= 6 then least(round(extract(epoch from now() - h.debut)::numeric, 2), 9999999) end
    where jeu = p_jeu and day = p_day and user_id = me;
end $$;

-- ---------------------------------------------------------------------
-- 3. Une partie par famille de jeux (p_jouer : appliquer l'essai p avant de renvoyer l'état)
-- ---------------------------------------------------------------------
-- Sutom : même vérification des mots que hg_sutom_guess. L'essai renvoie la forme de hg_sutom_guess, l'état celle de hg_sutom_state.
create or replace function public.hg_jeux__honneur_sutom(p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); w hg_sutom_words; g hg_sutom_games; h hg_jeux_honneur; v_reel boolean; v_mots text[];
  v_x text; v_n int; v_ok boolean; v_fin boolean;
begin
  select * into w from hg_sutom_words where day = p_day;
  if w.word is null then raise exception 'Pas de grille ce jour-là.'; end if;
  select * into g from hg_sutom_games where day = p_day and user_id = me;
  v_reel := g.finished_at is not null or hg_jeux__honneur_reel('sutom', p_day, me);
  if p_jouer then
    if v_reel then raise exception 'Tu as déjà joué cette grille le jour même.'; end if;
    v_x := hg_sutom_norm(p->>'mot');
    if v_x is null then raise exception 'Écris un mot avec des lettres seulement'; end if;
    if length(v_x) <> length(w.word) then raise exception 'Le mot fait % lettres', length(w.word); end if;
    if left(v_x, 1) <> left(w.word, 1) then raise exception 'Le mot commence par %', left(w.word, 1); end if;
    insert into hg_jeux_honneur (jeu, day, user_id) values ('sutom', p_day, me) on conflict do nothing;
    select * into h from hg_jeux_honneur where jeu = 'sutom' and day = p_day and user_id = me for update;
    if h.fini then raise exception 'Tu as déjà fini cette grille.'; end if;
    if h.erreurs >= 200 then raise exception 'Trop d''essais refusés sur cette grille'; end if;
    if v_x <> w.word and not exists (select 1 from hg_sutom_dict where word = v_x)
       and not exists (select 1 from hg_sutom_bank where word = v_x)
       and not exists (select 1 from hg_sutom_words where word = v_x and day < hg_sutom_day()) then
      update hg_jeux_honneur set erreurs = erreurs + 1 where jeu = 'sutom' and day = p_day and user_id = me;
      return jsonb_build_object('valid', false, 'message', 'Ce mot n’est pas dans le dictionnaire');
    end if;
    if h.essais ? v_x then return jsonb_build_object('valid', false, 'message', 'Tu as déjà essayé ce mot'); end if;
    v_ok := v_x = w.word;
    v_n := jsonb_array_length(h.essais) + 1;
    v_fin := v_ok or v_n >= 6;
    update hg_jeux_honneur set essais = essais || to_jsonb(v_x), fini = v_fin, reussi = v_ok,
      palier = case when v_fin then v_n end, score = case when v_fin then hg_jeux_score(v_ok, v_n) end,
      termine_at = case when v_fin then now() end,
      secondes = case when v_fin then least(round(extract(epoch from now() - h.debut)::numeric, 2), 9999999) end
      where jeu = 'sutom' and day = p_day and user_id = me;
    return jsonb_build_object('valid', true, 'word', v_x, 'colors', hg_sutom_colors(w.word, v_x), 'solved', v_ok, 'finished', v_fin,
      'tries', v_n, 'gain', 0, 'honneur', true,
      'answer', case when v_fin then w.word end, 'definition', case when v_fin then w.definition end);
  end if;
  if g.finished_at is not null then
    v_mots := g.guesses; v_fin := true; v_ok := coalesce(g.solved, false);
  else
    select * into h from hg_jeux_honneur where jeu = 'sutom' and day = p_day and user_id = me;
    v_mots := array(select jsonb_array_elements_text(coalesce(h.essais, '[]'::jsonb)));
    v_fin := coalesce(h.fini, false) or v_reel; v_ok := coalesce(h.reussi, false);
  end if;
  return jsonb_build_object('day', p_day, 'available', true, 'num', greatest(p_day - date '2026-10-26' + 1, 1),
    'length', length(w.word), 'first', left(w.word, 1), 'max', 6,
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', x, 'colors', hg_sutom_colors(w.word, x)) order by o)
                         from unnest(v_mots) with ordinality t(x, o)), '[]'::jsonb),
    'solved', v_ok, 'finished', v_fin, 'word', case when v_fin then w.word end, 'definition', case when v_fin then w.definition end,
    'gain', null, 'honneur', true, 'du_jour', v_reel);
end $$;

-- Framed : forme de hg_framed_state (sans classement, sans « hier », sans Paillettes). p : { film: uuid | null (passer) }.
create or replace function public.hg_jeux__honneur_framed(p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r hg_framed_rounds; f hg_framed_films; v record; k int; v_num int; v_film uuid;
begin
  select * into r from hg_framed_rounds where day = p_day;
  if r.day is null then raise exception 'Pas de Framed ce jour-là.'; end if;
  if p_jouer then
    v_film := nullif(p->>'film', '')::uuid;
    if v_film is not null and not exists (select 1 from hg_framed_films where id = v_film) then raise exception 'Film inconnu'; end if;
    perform hg_jeux__honneur_appliquer('framed', p_day, r.film_id::text, v_film::text);
  end if;
  select * into f from hg_framed_films where id = r.film_id;
  select * into v from hg_jeux__honneur_partie('framed', p_day);
  k := least(greatest(cardinality(f.frames), 0), case when v.finished then 6 else cardinality(v.guesses) + 1 end);
  select count(*) into v_num from hg_framed_rounds where day <= p_day;
  return jsonb_build_object('day', p_day, 'round', v_num, 'total_frames', cardinality(f.frames),
    'frames', to_jsonb(f.frames[1:k]),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('id', x.gid, 'title', ff.title, 'year', ff.year) order by x.i)
      from unnest(v.guesses) with ordinality x(gid, i) left join hg_framed_films ff on ff.id::text = x.gid), '[]'::jsonb),
    'solved', v.solved, 'finished', v.finished, 'score', v.score, 'reward', null, 'gain', null, 'consolation', null,
    'film', case when v.finished then jsonb_build_object('id', f.id, 'title', f.title, 'year', f.year, 'seen_on', f.seen_on, 'viewers', f.viewers) end,
    'films', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'year', x.year, 'seen_on', x.seen_on) order by x.title)
      from hg_framed_films x where x.active), '[]'::jsonb),
    'board', '[]'::jsonb, 'hier', null, 'honneur', true, 'du_jour', v.reel);
end $$;

-- Heardle : forme de hg_heardle_state (sans classement, sans « hier », sans Paillettes). p : { track: uuid | null (passer) }.
create or replace function public.hg_jeux__honneur_heardle(p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r hg_heardle_rounds; t hg_heardle_tracks; v record; v_num int; v_track uuid;
begin
  select * into r from hg_heardle_rounds where day = p_day and not cancelled;
  if r.day is null then raise exception 'Pas de Heardle ce jour-là.'; end if;
  if p_jouer then
    v_track := nullif(p->>'track', '')::uuid;
    if v_track is not null and not exists (select 1 from hg_heardle_tracks where id = v_track) then raise exception 'Morceau inconnu'; end if;
    perform hg_jeux__honneur_appliquer('heardle', p_day, r.track_id::text, v_track::text);
  end if;
  select * into t from hg_heardle_tracks where id = r.track_id;
  select * into v from hg_jeux__honneur_partie('heardle', p_day);
  select count(*) into v_num from hg_heardle_rounds where day <= p_day and not cancelled;
  return jsonb_build_object('day', p_day, 'round', v_num, 'youtube_id', t.youtube_id, 'start_s', t.start_s,
    'seconds', case when v.finished then 16 else hg_heardle_seconds(cardinality(v.guesses)) end,
    'steps', jsonb_build_array(1, 2, 4, 7, 11, 16),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('id', x.gid, 'title', tt.title, 'artist', tt.artist) order by x.i)
      from unnest(v.guesses) with ordinality x(gid, i) left join hg_heardle_tracks tt on tt.id::text = x.gid), '[]'::jsonb),
    'solved', v.solved, 'finished', v.finished, 'score', v.score, 'reward', null, 'gain', null, 'consolation', null,
    'track', case when v.finished then jsonb_build_object('id', t.id, 'title', t.title, 'artist', t.artist, 'shared_on', t.shared_on,
      'proposed_by', (select pr.pseudo from hg_profiles pr where pr.id = t.proposed_by and not pr.is_ghost)) end,
    'tracks', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'artist', x.artist) order by x.title)
      from hg_heardle_tracks x where x.status = 'valide'), '[]'::jsonb),
    'board', '[]'::jsonb, 'hier', null, 'honneur', true, 'du_jour', v.reel);
end $$;

-- Jeux « devine » nj : forme de hg_nj_etat (sans classement, sans « hier », sans Paillettes). p : { texte: réponse | null (passer) }.
create or replace function public.hg_jeux__honneur_nj(p_jeu text, p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r hg_nj_rounds; k jsonb; v record; n_err int; fini boolean; num int; essais jsonb; cible jsonb; v_img text; idx jsonb; lib text;
begin
  if not hg_nj_jeu_ok(p_jeu) then raise exception 'Jeu inconnu'; end if;
  select * into r from hg_nj_rounds where jeu = p_jeu and day = p_day;
  if r.jeu is null then raise exception 'Pas de manche ce jour-là.'; end if;
  k := hg_nj__contenu(r);
  if p_jouer then
    if p->>'texte' is not null then
      select c.libelle into lib from hg_nj__candidats(p_jeu) c where hg_nj_norm(p->>'texte') = any (c.cles) limit 1;
      if lib is null then raise exception 'Réponse inconnue : choisis-la dans la liste.'; end if;
      perform hg_jeux__honneur_appliquer('nj_' || p_jeu, p_day, case when hg_nj__juste(k, lib) then lib else chr(1) end, lib);
    else
      perform hg_jeux__honneur_appliquer('nj_' || p_jeu, p_day, chr(1), null);
    end if;
  end if;
  select * into v from hg_jeux__honneur_partie('nj_' || p_jeu, p_day);
  fini := v.finished;
  n_err := coalesce(cardinality(v.guesses), 0) - case when v.solved then 1 else 0 end;
  select count(*) into num from hg_nj_rounds where jeu = p_jeu and day <= p_day;
  if p_jeu in ('pays', 'plat') then
    cible := case when p_jeu = 'pays' then k->'media' else hg_nj__coord(k->>'pays') end;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('t', nullif(x.t, ''), 'ok', hg_nj__juste(k, x.t))
      || case when cible is not null and x.t <> '' and not hg_nj__juste(k, x.t) and hg_nj__coord(x.t) ? 'lat' then
           hg_nj_geo((hg_nj__coord(x.t)->>'lat')::float8, (hg_nj__coord(x.t)->>'lon')::float8, (cible->>'lat')::float8, (cible->>'lon')::float8)
         else '{}'::jsonb end order by x.i), '[]'::jsonb)
    into essais from unnest(v.guesses) with ordinality x(t, i);
  idx := coalesce((select jsonb_agg(e.val order by e.o) from jsonb_array_elements_text(k->'indices') with ordinality e(val, o)
    where fini or e.o <= n_err), '[]'::jsonb);
  v_img := case when p_jeu = 'pays' then case when fini or n_err >= 3 then k->>'image' end
                when p_jeu = 'replique' then null else k->>'image' end;
  return jsonb_build_object('jeu', p_jeu, 'day', p_day, 'round', num,
    'image', v_img,
    'media', case p_jeu
      when 'pays' then jsonb_build_object('svg', k#>'{media,svg}', 'vb', k#>'{media,vb}')
      when 'replique' then jsonb_build_object('citation', k#>'{media,citation}', 'contexte', k#>'{media,contexte}')
      when 'jv' then jsonb_build_object('fx', coalesce(k#>'{media,fx}', '0.5'), 'fy', coalesce(k#>'{media,fy}', '0.5'))
      when 'carte' then jsonb_build_object('rarete', k#>'{media,rarete}')
      else '{}'::jsonb end,
    'indices', idx, 'indices_total', jsonb_array_length(coalesce(k->'indices', '[]'::jsonb)),
    'photo_bientot', p_jeu = 'pays' and not fini and n_err < 3 and k->>'image' is not null,
    'essais', essais, 'erreurs', n_err,
    'solved', v.solved, 'finished', fini, 'score', v.score, 'reward', null, 'gain', null, 'consolation', null,
    'reponse', case when fini then jsonb_build_object('titre', k->>'libelle', 'reponse', k->>'reponse', 'pays', k->>'pays', 'details', k->'details',
      'image', k->>'image') end,
    'choix', coalesce((select jsonb_agg(c.libelle order by c.libelle) from hg_nj__candidats(p_jeu) c), '[]'::jsonb),
    'board', '[]'::jsonb, 'hier', null, 'honneur', true, 'du_jour', v.reel);
end $$;

-- Code du jour : forme de hg_duel_jour (sans classement ni série). p : { essai: 4 lettres parmi r o y g b p }.
create or replace function public.hg_jeux__honneur_code(p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v_secret text; v_reel boolean; h hg_jeux_honneur; v_e text; v_bien int; v_mal int; v_n int;
  v_essais jsonb; v_trouve int; v_fin boolean;
begin
  select secret into v_secret from hg_duel_jour where jour = p_day;
  if v_secret is null then raise exception 'Pas de code ce jour-là.'; end if;
  v_reel := hg_jeux__honneur_reel('code_jour', p_day, me);
  if p_jouer then
    if v_reel then raise exception 'Tu as déjà joué ce code le jour même.'; end if;
    v_e := lower(trim(coalesce(p->>'essai', '')));
    if v_e !~ '^[roygbp]{4}$' then raise exception 'Choisis 4 couleurs.'; end if;
    insert into hg_jeux_honneur (jeu, day, user_id) values ('code_jour', p_day, me) on conflict do nothing;
    select * into h from hg_jeux_honneur where jeu = 'code_jour' and day = p_day and user_id = me for update;
    if h.fini then raise exception 'Tu as déjà fini ce code.'; end if;
    select s.bien, s.mal into v_bien, v_mal from hg_duel__mm_score(v_secret, v_e) s;
    v_n := jsonb_array_length(h.essais) + 1;
    v_fin := v_bien = 4 or v_n >= 10;
    update hg_jeux_honneur set essais = essais || jsonb_build_array(jsonb_build_object('n', v_n, 'essai', v_e, 'bien', v_bien, 'mal', v_mal)),
      fini = v_fin, reussi = v_bien = 4, palier = case when v_fin then v_n end,
      score = case when v_fin then hg_jeux_score(v_bien = 4, v_n) end, termine_at = case when v_fin then now() end,
      secondes = case when v_fin then least(round(extract(epoch from now() - h.debut)::numeric, 2), 9999999) end
      where jeu = 'code_jour' and day = p_day and user_id = me;
  end if;
  if v_reel then
    v_essais := (select jsonb_agg(jsonb_build_object('n', e.n, 'essai', e.essai, 'bien', e.bien, 'mal', e.mal) order by e.n)
      from hg_duel_jour_essais e where e.jour = p_day and e.user_id = me);
  else
    v_essais := (select x.essais from hg_jeux_honneur x where x.jeu = 'code_jour' and x.day = p_day and x.user_id = me);
  end if;
  v_essais := coalesce(v_essais, '[]'::jsonb);
  v_trouve := (select min((e->>'n')::int) from jsonb_array_elements(v_essais) e where (e->>'bien')::int = 4);
  v_fin := v_reel or v_trouve is not null or jsonb_array_length(v_essais) >= 10;
  return jsonb_build_object('jour', p_day, 'num', (select count(*) from hg_duel_jour x where x.jour <= p_day),
    'essais', v_essais, 'trouve_en', v_trouve, 'fini', v_fin, 'serie', null,
    'secret', case when v_fin then v_secret end, 'classement', '[]'::jsonb,
    'trouveurs', (select count(*) from hg_duel_jour_essais e where e.jour = p_day and e.bien = 4),
    'gain', null, 'honneur', true, 'du_jour', v_reel);
end $$;

-- Grilles : mêmes règles que hg_nj_grille_essai (copie de sa version de la migration 179), sans hg_jeux_fin ; forme de
-- hg_nj_grille_etat (sans classement, sans Paillettes). p : comme hg_nj_grille_essai.
create or replace function public.hg_jeux__honneur_grille(p_jeu text, p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); g hg_nj_grilles; pa hg_nj_gparties; h hg_jeux_honneur; res jsonb := '{}'::jsonb; vue jsonb; v_reel boolean;
  sel text[]; gr jsonb; i int; best int := 0; n int; mot text; r1 int; c1 int; r2 int; c2 int; dr int; dc int; lu text := ''; k int;
  sol text; ess jsonb; faux jsonb; total int; v_palier int;
begin
  if p_jeu not in ('connexions', 'motmele', 'anagramme', 'nerdle', 'motscroises') then raise exception 'Jeu inconnu'; end if;
  select * into g from hg_nj_grilles where jeu = p_jeu and day = p_day;
  if g.jeu is null then raise exception 'Pas de grille ce jour-là.'; end if;
  v_reel := hg_jeux__honneur_reel('nj_' || p_jeu, p_day, me);
  if p_jouer then
    if v_reel then raise exception 'Tu as déjà joué cette grille le jour même.'; end if;
    insert into hg_jeux_honneur (jeu, day, user_id) values ('nj_' || p_jeu, p_day, me) on conflict do nothing;
    select * into h from hg_jeux_honneur where jeu = 'nj_' || p_jeu and day = p_day and user_id = me for update;
    if h.fini then raise exception 'Tu as déjà terminé cette grille.'; end if;
    pa.jeu := p_jeu; pa.day := p_day; pa.user_id := me; pa.etat := h.etat; pa.erreurs := h.erreurs; pa.fini := false;
    pa.gagne := false; pa.score := 0; pa.started_at := h.debut;

    if p_jeu = 'connexions' then
      sel := array(select upper(btrim(x)) from jsonb_array_elements_text(p->'mots') x);
      if cardinality(sel) <> 4 or (select count(distinct x) from unnest(sel) x) <> 4 then raise exception 'Choisis exactement 4 mots.'; end if;
      if exists (select 1 from unnest(sel) x where not (g.public->'mots') ? x) then raise exception 'Mot inconnu.'; end if;
      ess := coalesce(pa.etat->'essais', '[]'::jsonb);
      if exists (select 1 from jsonb_array_elements(ess) e where (select array_agg(v order by v) from jsonb_array_elements_text(e) v) = (select array_agg(x order by x) from unnest(sel) x)) then
        raise exception 'Tu as déjà essayé ces 4 mots.';
      end if;
      pa.etat := jsonb_set(pa.etat, '{essais}', ess || jsonb_build_array(to_jsonb(sel)));
      for i in 0..3 loop
        gr := g.secret->'groupes'->i;
        n := (select count(*) from unnest(sel) x where (gr->'mots') ? x);
        if n = 4 then
          pa.etat := jsonb_set(pa.etat, '{trouves}', coalesce(pa.etat->'trouves', '[]'::jsonb) || to_jsonb(i));
          res := jsonb_build_object('ok', true, 'groupe', gr); best := 4; exit;
        end if;
        best := greatest(best, n);
      end loop;
      if best < 4 then pa.erreurs := pa.erreurs + 1; res := jsonb_build_object('ok', false, 'presque', best = 3); end if;
      if jsonb_array_length(coalesce(pa.etat->'trouves', '[]'::jsonb)) = 4 then pa.fini := true; pa.gagne := true; pa.score := 5 - pa.erreurs;
      elsif pa.erreurs >= 4 then pa.fini := true; pa.score := 0; end if;

    elsif p_jeu = 'motmele' then
      r1 := (p->>'r1')::int; c1 := (p->>'c1')::int; r2 := (p->>'r2')::int; c2 := (p->>'c2')::int;
      if r1 is null or c1 is null or r2 is null or c2 is null or least(r1, c1, r2, c2) < 0 or greatest(r1, c1, r2, c2) > 11 then raise exception 'Sélection invalide.'; end if;
      dr := sign(r2 - r1); dc := sign(c2 - c1);
      if not (r1 = r2 or c1 = c2 or abs(r2 - r1) = abs(c2 - c1)) or (r1 = r2 and c1 = c2) then
        res := jsonb_build_object('ok', false);
      else
        n := greatest(abs(r2 - r1), abs(c2 - c1));
        for k in 0..n loop lu := lu || substr(g.public->'grille'->>(r1 + dr * k), c1 + dc * k + 1, 1); end loop;
        mot := case when (g.secret->'positions') ? lu then lu when (g.secret->'positions') ? reverse(lu) then reverse(lu) end;
        if mot is not null and not coalesce(pa.etat->'trouves', '[]'::jsonb) ? mot then
          pa.etat := jsonb_set(pa.etat, '{trouves}', coalesce(pa.etat->'trouves', '[]'::jsonb) || to_jsonb(mot));
          res := jsonb_build_object('ok', true, 'mot', mot);
        else
          res := jsonb_build_object('ok', false);
        end if;
      end if;
      if jsonb_array_length(coalesce(pa.etat->'trouves', '[]'::jsonb)) = jsonb_array_length(g.public->'mots') then
        pa.fini := true; pa.gagne := true; pa.score := 5;
      end if;

    elsif p_jeu = 'anagramme' then
      i := (p->>'i')::int;
      total := jsonb_array_length(g.secret->'mots');
      if i is null or i < 0 or i >= total then raise exception 'Mot inconnu.'; end if;
      if coalesce(pa.etat->'mots'->>(i::text), '') <> '' then raise exception 'Déjà joué.'; end if;
      if pa.etat->'mots' is null then pa.etat := jsonb_set(pa.etat, '{mots}', '{}'::jsonb); end if;
      if coalesce((p->>'passer')::boolean, false) then
        pa.etat := jsonb_set(pa.etat, array['mots', i::text], to_jsonb('passe'::text), true);
        res := jsonb_build_object('ok', false, 'passe', true, 'mot', g.secret->'mots'->i->>'mot');
      elsif upper(hg_nj_norm(p->>'mot')) = g.secret->'mots'->i->>'mot' then
        pa.etat := jsonb_set(pa.etat, array['mots', i::text], to_jsonb('trouve'::text), true);
        res := jsonb_build_object('ok', true, 'mot', g.secret->'mots'->i->>'mot');
      else
        pa.erreurs := pa.erreurs + 1;
        res := jsonb_build_object('ok', false);
      end if;
      if (select count(*) from jsonb_object_keys(coalesce(pa.etat->'mots', '{}'::jsonb))) = total then
        pa.fini := true;
        pa.score := (select count(*) from jsonb_each_text(pa.etat->'mots') e where e.value = 'trouve');
        pa.gagne := pa.score = total;
      end if;

    elsif p_jeu = 'nerdle' then
      sol := g.secret->>'calcul';
      if coalesce((p->>'indice')::boolean, false) then
        if jsonb_array_length(coalesce(pa.etat->'indices', '[]'::jsonb)) >= 3 then raise exception 'Tu as déjà pris les 3 indices.'; end if;
        select q into k from generate_series(1, 8) q
          where not exists (select 1 from jsonb_array_elements(coalesce(pa.etat->'indices', '[]'::jsonb)) x where (x->>'pos')::int = q - 1)
            and not exists (select 1 from jsonb_array_elements(coalesce(pa.etat->'essais', '[]'::jsonb)) e where substr(e->>'calcul', q, 1) = substr(sol, q, 1))
          order by random() limit 1;
        if k is null then raise exception 'Toutes les cases sont déjà trouvées.'; end if;
        pa.etat := jsonb_set(pa.etat, '{indices}', coalesce(pa.etat->'indices', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('pos', k - 1, 'ch', substr(sol, k, 1))));
        res := jsonb_build_object('indice', jsonb_build_object('pos', k - 1, 'ch', substr(sol, k, 1)));
      else
        mot := replace(replace(btrim(p->>'calcul'), '×', '*'), '÷', '/');
        if not hg_nj__nerdle_ok(mot) then raise exception 'Ce n''est pas un calcul juste de 8 caractères.'; end if;
        ess := coalesce(pa.etat->'essais', '[]'::jsonb);
        pa.etat := jsonb_set(pa.etat, '{essais}', ess || jsonb_build_array(jsonb_build_object('calcul', mot, 'couleurs', hg_nj__couleurs(mot, sol))));
        res := jsonb_build_object('ok', mot = sol, 'couleurs', hg_nj__couleurs(mot, sol));
        n := jsonb_array_length(pa.etat->'essais');
        if mot = sol then pa.fini := true; pa.gagne := true; pa.score := greatest(1, 7 - n - jsonb_array_length(coalesce(pa.etat->'indices', '[]'::jsonb)));
        elsif n >= 6 then pa.fini := true; pa.score := 0; end if;
      end if;

    else -- motscroises
      sol := (select string_agg(l, '' order by o) from jsonb_array_elements_text(g.secret->'solution') with ordinality x(l, o));
      lu := upper(coalesce((select string_agg(rpad(l, (g.public->>'w')::int), '' order by o) from jsonb_array_elements_text(p->'lignes') with ordinality x(l, o)), ''));
      if char_length(lu) <> char_length(sol) then raise exception 'Grille incomplète.'; end if;
      faux := coalesce((select jsonb_agg(q - 1) from generate_series(1, char_length(sol)) q
        where substr(sol, q, 1) <> '.' and substr(lu, q, 1) <> substr(sol, q, 1) and substr(lu, q, 1) <> ' '), '[]'::jsonb);
      if jsonb_array_length(faux) = 0 and position(' ' in translate(lu, '.', '')) = 0 then
        pa.fini := true; pa.gagne := true; pa.score := greatest(1, 5 - pa.erreurs); res := jsonb_build_object('ok', true);
      else
        if coalesce((p->>'verifier')::boolean, false) and jsonb_array_length(faux) > 0 then pa.erreurs := pa.erreurs + 1; end if;
        res := jsonb_build_object('ok', false, 'faux', faux);
      end if;
    end if;

    if pa.fini then
      pa.secondes := least(round(extract(epoch from now() - h.debut)::numeric, 2), 9999999);
      -- Même palier que la partie du jour (hg_nj_grille_essai), pour le score sur 10 affiché (jamais crédité).
      v_palier := case p_jeu
        when 'connexions' then pa.erreurs + 1
        when 'motscroises' then pa.erreurs + 1
        when 'nerdle' then jsonb_array_length(coalesce(pa.etat->'essais', '[]'::jsonb)) + jsonb_array_length(coalesce(pa.etat->'indices', '[]'::jsonb))
        when 'anagramme' then 1 + greatest(0, jsonb_array_length(g.secret->'mots') - pa.score)
        when 'motmele' then 1 + greatest(0, floor((coalesce(pa.secondes, 0) - 180) / 120))::int
        else 1 end;
    end if;
    update hg_jeux_honneur set etat = pa.etat, erreurs = pa.erreurs, fini = pa.fini,
      reussi = case when p_jeu = 'anagramme' then pa.score > 0 else pa.gagne end,
      palier = v_palier,
      score = case when pa.fini then hg_jeux_score(case when p_jeu = 'anagramme' then pa.score > 0 else pa.gagne end, v_palier) end,
      termine_at = case when pa.fini then now() end, secondes = pa.secondes
      where jeu = 'nj_' || p_jeu and day = p_day and user_id = me;
  end if;

  -- État : la partie du jour même si elle est finie, sinon celle pour l'honneur.
  if v_reel then
    select * into pa from hg_nj_gparties x where x.jeu = p_jeu and x.day = p_day and x.user_id = me;
    if pa.user_id is not null then pa.score := coalesce((select r.score from hg_jeux_resultats r where r.jeu = 'nj_' || p_jeu and r.day = p_day and r.user_id = me), pa.score); end if;
  else
    select * into h from hg_jeux_honneur x where x.jeu = 'nj_' || p_jeu and x.day = p_day and x.user_id = me;
    pa := null;
    if h.user_id is not null then
      pa.jeu := p_jeu; pa.day := p_day; pa.user_id := me; pa.etat := h.etat; pa.erreurs := h.erreurs; pa.fini := h.fini;
      pa.gagne := h.reussi; pa.score := h.score; pa.started_at := h.debut; pa.secondes := h.secondes;
    end if;
  end if;
  vue := g.public;
  if p_jeu = 'connexions' then
    vue := vue || jsonb_build_object('trouves', coalesce((select jsonb_agg(g.secret->'groupes'->(t.i::int) order by t.o)
      from jsonb_array_elements_text(coalesce(pa.etat->'trouves', '[]'::jsonb)) with ordinality t(i, o)), '[]'::jsonb));
  elsif p_jeu = 'motmele' then
    vue := vue || jsonb_build_object('trouves', coalesce((select jsonb_object_agg(m, g.secret->'positions'->m)
      from jsonb_array_elements_text(coalesce(pa.etat->'trouves', '[]'::jsonb)) m), '{}'::jsonb));
  end if;
  vue := jsonb_build_object('jeu', p_jeu, 'day', p_day, 'numero', (select count(*) from hg_nj_grilles x where x.jeu = p_jeu and x.day <= p_day),
    'grille', vue, 'partie', case when pa.user_id is null and not v_reel then null else jsonb_build_object('etat', coalesce(pa.etat, '{}'::jsonb),
      'erreurs', coalesce(pa.erreurs, 0), 'fini', coalesce(pa.fini, false) or v_reel, 'gagne', coalesce(pa.gagne, false), 'score', pa.score,
      'secondes', pa.secondes, 'debut', pa.started_at, 'reward', null, 'points', pa.score) end,
    'solution', case when coalesce(pa.fini, false) or v_reel then g.secret end,
    'gain', 0, 'board', jsonb_build_object('semaine', '[]'::jsonb, 'jour', '[]'::jsonb), 'honneur', true, 'du_jour', v_reel);
  -- Essai : même forme que hg_nj_grille_essai ({ resultat, etat }).
  return case when p_jouer then jsonb_build_object('resultat', res, 'etat', vue) else vue end;
end $$;

-- Sudoku : la grille du jour p_day (hg_nj__sudoku), vérifiée par le serveur ; la solution n'est jamais renvoyée.
-- p : { debut: true } (premier chiffre posé : le chrono part) ou { grille: 81 chiffres }.
create or replace function public.hg_jeux__honneur_sudoku(p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s jsonb := hg_nj__sudoku(p_day); h hg_jeux_honneur; v_reel boolean; v_ok boolean; v_secs numeric;
begin
  v_reel := hg_jeux__honneur_reel('nj_sudoku', p_day, me);
  if p_jouer then
    if v_reel then raise exception 'Tu as déjà terminé cette grille le jour même.'; end if;
    insert into hg_jeux_honneur (jeu, day, user_id) values ('nj_sudoku', p_day, me) on conflict do nothing;
    select * into h from hg_jeux_honneur where jeu = 'nj_sudoku' and day = p_day and user_id = me for update;
    if h.fini then raise exception 'Tu as déjà terminé cette grille.'; end if;
    if coalesce((p->>'debut')::boolean, false) then
      update hg_jeux_honneur set debut = now() where jeu = 'nj_sudoku' and day = p_day and user_id = me;
      return jsonb_build_object('ok', true);
    end if;
    v_ok := coalesce(p->>'grille', '') = s->>'solution';
    v_secs := least(round(extract(epoch from now() - h.debut)::numeric, 2), 9999999);
    if v_ok then
      update hg_jeux_honneur set fini = true, reussi = true, palier = 1 + greatest(0, floor((v_secs - 300) / 120))::int,
        score = hg_jeux_score(true, 1 + greatest(0, floor((v_secs - 300) / 120))::int), termine_at = now(), secondes = v_secs
        where jeu = 'nj_sudoku' and day = p_day and user_id = me;
    end if;
    return jsonb_build_object('ok', v_ok, 'secondes', case when v_ok then v_secs end, 'reward', 0, 'board', '[]'::jsonb, 'honneur', true);
  end if;
  select * into h from hg_jeux_honneur where jeu = 'nj_sudoku' and day = p_day and user_id = me;
  return jsonb_build_object('jeu', 'sudoku', 'variante', p_day::text, 'day', p_day, 'gain', 0, 'recompense_aujourdhui', false,
    'sudoku', jsonb_build_object('niveau', s->>'niveau', 'donnes', s->>'donnes'),
    'sudoku_fait', case
      when v_reel then (select jsonb_build_object('secondes', x.secondes) from hg_nj_solo x
        where x.user_id = me and x.jeu = 'sudoku' and x.variante = p_day::text and x.gagne limit 1)
      when h.fini then jsonb_build_object('secondes', h.secondes) end,
    'board', '[]'::jsonb, 'honneur', true, 'du_jour', v_reel);
end $$;

-- Aiguillage vers la famille du jeu.
create or replace function public.hg_jeux__honneur_partie_jeu(p_jeu text, p_day date, p jsonb, p_jouer boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform hg_jeux__honneur_acces(p_jeu);
  if p_day is null or not exists (select 1 from hg_jeux__honneur_jours(p_jeu) j where j.day = p_day) then
    raise exception 'Cette manche ne fait pas partie des manches passées.';
  end if;
  return case
    when p_jeu = 'sutom' then hg_jeux__honneur_sutom(p_day, p, p_jouer)
    when p_jeu = 'framed' then hg_jeux__honneur_framed(p_day, p, p_jouer)
    when p_jeu = 'heardle' then hg_jeux__honneur_heardle(p_day, p, p_jouer)
    when p_jeu = 'code_jour' then hg_jeux__honneur_code(p_day, p, p_jouer)
    when p_jeu = 'nj_sudoku' then hg_jeux__honneur_sudoku(p_day, p, p_jouer)
    when p_jeu in ('nj_connexions', 'nj_motscroises', 'nj_motmele', 'nj_anagramme', 'nj_nerdle') then hg_jeux__honneur_grille(substr(p_jeu, 4), p_day, p, p_jouer)
    else hg_jeux__honneur_nj(substr(p_jeu, 4), p_day, p, p_jouer) end;
end $$;

-- ---------------------------------------------------------------------
-- 4. RPC du site
-- ---------------------------------------------------------------------
-- Liste des 30 dernières manches d'un jeu : numéro, jour, ma partie (le jour même ou pour l'honneur), réponse si je l'ai
-- jouée (sinon null), trouvés et joueurs du jour (hg_jeux_resultats). Lecture seule.
-- { jeu, manches: [{ day, num, joue, honneur, en_cours, reussi, palier, titre, trouves, joueurs }] }
create or replace function public.hg_jeux_archive(p_jeu text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  perform hg_jeux__honneur_acces(p_jeu);
  return jsonb_build_object('jeu', p_jeu, 'manches', coalesce((select jsonb_agg(jsonb_build_object(
      'day', m.day, 'num', m.num, 'joue', m.reel or coalesce(h.fini, false), 'honneur', not m.reel and coalesce(h.fini, false),
      'en_cours', not m.reel and h.user_id is not null and not h.fini,
      'reussi', case when m.reel then r.reussi when h.fini then h.reussi end,
      'palier', case when m.reel then r.palier when h.fini then h.palier end,
      'titre', case when m.reel or coalesce(h.fini, false) or p_jeu = 'nj_sudoku' then hg_jeux__honneur_titre(p_jeu, m.day) end,
      'trouves', (select count(*) from hg_jeux_resultats x where x.jeu = p_jeu and x.day = m.day and x.reussi),
      'joueurs', (select count(*) from hg_jeux_resultats x where x.jeu = p_jeu and x.day = m.day)) order by m.day desc)
    from (select j.day, j.num, hg_jeux__honneur_reel(p_jeu, j.day, me) as reel from hg_jeux__honneur_jours(p_jeu) j) m
    left join hg_jeux_resultats r on r.jeu = p_jeu and r.day = m.day and r.user_id = me
    left join hg_jeux_honneur h on h.jeu = p_jeu and h.day = m.day and h.user_id = me), '[]'::jsonb));
end $$;

-- État d'une manche passée (forme de l'état du jour du jeu, avec honneur: true et du_jour : partie jouée le jour même).
create or replace function public.hg_jeux_honneur_etat(p_jeu text, p_day date)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return hg_jeux__honneur_partie_jeu(p_jeu, p_day, null, false);
end $$;

-- Essai sur une manche passée, pour l'honneur : rien n'est payé ni noté. Renvoie ce que renvoie l'essai du jour du jeu
-- (Sutom : la réponse de l'essai ; grilles : { resultat, etat } ; Sudoku : le résultat de la grille ; sinon l'état).
create or replace function public.hg_jeux_honneur_essai(p_jeu text, p_day date, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return hg_jeux__honneur_partie_jeu(p_jeu, p_day, coalesce(p, '{}'::jsonb), true);
end $$;

-- ---------------------------------------------------------------------
-- 5. Ce qui était déjà public, refermé
-- ---------------------------------------------------------------------
-- « Hier · titre » (Framed, Heardle) : seulement pour qui a fini la manche d'hier (le jour même ou pour l'honneur).
-- Version d'origine : migration 085.
create or replace function public.hg_daily_hier(p_game text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when x.ans is null or not (
      exists (select 1 from hg_daily_games g where g.game = p_game and g.day = x.d and g.user_id = auth.uid() and g.finished)
      or exists (select 1 from hg_jeux_honneur h where h.jeu = p_game and h.day = x.d and h.user_id = auth.uid() and h.fini))
    then null else jsonb_build_object('round', x.num, 'title', x.ans,
    'solvers', (select count(*) from hg_daily_games g where g.game = p_game and g.day = x.d and g.solved),
    'avg', (select round(avg(cardinality(g.guesses)), 1) from hg_daily_games g where g.game = p_game and g.day = x.d and g.solved)) end
  from (select hg_jeux_today() - 1 as d,
    case p_game when 'framed' then (select f.title from hg_framed_rounds r join hg_framed_films f on f.id = r.film_id where r.day = hg_jeux_today() - 1)
      else (select t.artist || ' — ' || t.title from hg_heardle_rounds r join hg_heardle_tracks t on t.id = r.track_id where r.day = hg_jeux_today() - 1 and not r.cancelled) end as ans,
    case p_game when 'framed' then (select count(*) from hg_framed_rounds where day <= hg_jeux_today() - 1)
      else (select count(*) from hg_heardle_rounds where day <= hg_jeux_today() - 1 and not cancelled) end as num) x $$;

-- « Hier » des jeux devine (hg_nj_etat, migration 137) : même règle.
do $do$
begin
  if pg_get_functiondef('public.hg_nj_etat(text)'::regprocedure) !~ 'hg_jeux_honneur' then
    perform public.hg__patch('public.hg_nj_etat(text)'::regprocedure,
      'from hg_nj_rounds y where y.jeu = p_jeu and y.day = d - 1));',
      'from hg_nj_rounds y where y.jeu = p_jeu and y.day = d - 1
        and (exists (select 1 from hg_daily_games z2 where z2.game = ''nj_'' || p_jeu and z2.day = d - 1 and z2.user_id = auth.uid() and z2.finished)
          or exists (select 1 from hg_jeux_honneur h2 where h2.jeu = ''nj_'' || p_jeu and h2.day = d - 1 and h2.user_id = auth.uid() and h2.fini))));');
  end if;
end $do$;

-- Historique du Heardle (migration 178) : titre, artiste, vidéo et crédit cachés tant que la manche n'est pas jouée (le
-- jour même ou pour l'honneur). En plus : cache (vrai = pas encore jouée), jouable (dans les 30 dernières manches),
-- honneur ({ solved, fini, essais } de ma partie pour l'honneur).
create or replace function public.hg_heardle_historique()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d date := hg_jeux_today(); me uuid := auth.uid(); serie int := 0; x record;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  -- Série : manches trouvées d'affilée, de la veille vers le passé (une manche non jouée ou ratée l'arrête)
  for x in select coalesce(g.solved, false) as ok from hg_heardle_rounds r
      left join hg_daily_games g on g.game = 'heardle' and g.day = r.day and g.user_id = me and g.finished
      where r.day < d and not r.cancelled order by r.day desc loop
    exit when not x.ok;
    serie := serie + 1;
  end loop;
  return jsonb_build_object(
    'moi', (select jsonb_build_object('joues', count(*), 'trouves', count(*) filter (where g.solved),
        'moyenne', round(avg(cardinality(g.guesses)) filter (where g.solved), 1), 'serie', serie)
      from hg_daily_games g join hg_heardle_rounds r on r.day = g.day and not r.cancelled
      where g.game = 'heardle' and g.user_id = me and g.finished and g.day < d),
    'manches', coalesce((select jsonb_agg(m order by m.day desc) from (
      select r.day,
        (select count(*) from hg_heardle_rounds r2 where r2.day <= r.day and not r2.cancelled) as round,
        case when v.vu then t.title end as title, case when v.vu then t.artist end as artist,
        case when v.vu then t.youtube_id end as youtube_id, case when v.vu then t.start_s end as start_s,
        case when v.vu then t.shared_on end as shared_on,
        case when v.vu then (select p.pseudo from hg_profiles p where p.id = t.proposed_by and not p.is_ghost) end as proposed_by,
        not v.vu as cache,
        exists (select 1 from hg_jeux__honneur_jours('heardle') j where j.day = r.day) as jouable,
        (select jsonb_build_object('solved', h.reussi, 'fini', h.fini,
            'essais', (select string_agg(case when e.gid = '' then 's' when e.gid = r.track_id::text then 'o' else 'x' end, '' order by e.i)
              from jsonb_array_elements_text(h.essais) with ordinality e(gid, i)))
          from hg_jeux_honneur h where h.jeu = 'heardle' and h.day = r.day and h.user_id = me) as honneur,
        coalesce((select jsonb_agg(jsonb_build_object(
            'user_id', p.id, 'pseudo', p.pseudo, 'color', p.color, 'avatar_url', p.avatar_url,
            'solved', g.solved,
            'essais', (select string_agg(case when gs.gid = '' then 's' when gs.gid = r.track_id::text then 'o' else 'x' end, '' order by gs.i)
              from unnest(g.guesses) with ordinality gs(gid, i)),
            'points', (select jr.points from hg_jeux_resultats jr where jr.jeu = 'heardle' and jr.day = r.day and jr.user_id = p.id))
            order by g.solved desc, cardinality(g.guesses), p.pseudo)
          from hg_daily_games g join hg_profiles p on p.id = g.user_id and not p.is_ghost
          where g.game = 'heardle' and g.day = r.day and g.finished), '[]'::jsonb) as joueurs
      from hg_heardle_rounds r join hg_heardle_tracks t on t.id = r.track_id
      cross join lateral (select exists (select 1 from hg_daily_games g where g.game = 'heardle' and g.day = r.day and g.user_id = me and g.finished)
        or exists (select 1 from hg_jeux_honneur h where h.jeu = 'heardle' and h.day = r.day and h.user_id = me and h.fini) as vu) v
      where r.day < d and not r.cancelled) m), '[]'::jsonb));
end $$;

-- Images d'un Framed (stockage hg-jeux, migration 085) : passé ou du jour, seulement jusqu'à l'image dévoilée (partie du
-- jour même, ou partie pour l'honneur) ; toutes une fois la manche finie. Le Staff « souvenirs » voit tout.
create or replace function public.hg_jeux_obj_visible(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select hg_has_perm('souvenirs') or (hg_is_member() and exists (
    select 1 from hg_framed_rounds r join hg_framed_films f on f.id = r.film_id
    cross join lateral (select array_position(f.frames, p_name) as pos) x
    where x.pos is not null and r.day <= hg_jeux_today()
      and x.pos <= greatest(hg_framed_unlocked(r.day, auth.uid(), cardinality(f.frames)),
        coalesce((select case when h.fini then cardinality(f.frames) else jsonb_array_length(h.essais) + 1 end from hg_jeux_honneur h
          where h.jeu = 'framed' and h.day = r.day and h.user_id = auth.uid() and r.day < hg_jeux_today()), 1)))) $$;

-- ---------------------------------------------------------------------
-- 6. Droits
-- ---------------------------------------------------------------------
revoke all on function public.hg_jeux__honneur_liste() from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_acces(text) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_jours(text) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_reel(text, date, uuid) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_titre(text, date) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_partie(text, date) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_appliquer(text, date, text, text) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_sutom(date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_framed(date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_heardle(date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_nj(text, date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_code(date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_grille(text, date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_sudoku(date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux__honneur_partie_jeu(text, date, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.hg_jeux_archive(text) from public, anon;
revoke all on function public.hg_jeux_honneur_etat(text, date) from public, anon;
revoke all on function public.hg_jeux_honneur_essai(text, date, jsonb) from public, anon;
grant execute on function public.hg_jeux_archive(text) to authenticated;
grant execute on function public.hg_jeux_honneur_etat(text, date) to authenticated;
grant execute on function public.hg_jeux_honneur_essai(text, date, jsonb) to authenticated;
