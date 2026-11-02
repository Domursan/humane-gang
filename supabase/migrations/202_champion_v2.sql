-- 202 : « Ma carte Champion », nouvelle version. Le membre choisit son jeu (10), un mot « Je suis » (7), 20 emblèmes, une couleur,
-- un motif, une inscription, ou sa photo de profil, ou son image. Le site compose l'image de la carte et la dépose dans hg-champions.
-- Le cadre ne change pas : rare, famille Jeu vidéo, série de l'année, exemplaire brillant offert, une carte par an.
-- Les propositions déjà en attente gardent leur emblème simple (image_path vide).
-- Bucket public : une carte acceptée doit s'afficher pour tous par une simple adresse. Noms de fichiers aléatoires, pas de liste
-- (lecture des lignes réservée à l'auteur et au Staff « cartes »), 10 fichiers par membre, 1 Mo, WebP ou JPEG.
alter table public.hg_champion_proposals
  add column if not exists title text not null default 'main',
  add column if not exists game_label text,
  add column if not exists color text,
  add column if not exists pattern text,
  add column if not exists inscription text,
  add column if not exists source text not null default 'embleme',
  add column if not exists image_path text;

do $c$
declare n text;
begin
  foreach n in array array['game', 'emblem', 'title', 'game_label', 'color', 'pattern', 'inscription', 'source', 'image_path'] loop
    execute 'alter table public.hg_champion_proposals ' || 'dr' || 'op constraint if exists hg_champion_proposals_' || n || '_check';
  end loop;
end $c$;
alter table public.hg_champion_proposals
  add constraint hg_champion_proposals_game_check check (game in ('lol', 'aoe2', 'ck3', 'minecraft', 'among_us', 'codenames', 'echecs', 'uno', 'loup_garou', 'autre')),
  add constraint hg_champion_proposals_emblem_check check (emblem in ('epee', 'chateau', 'couronne', 'pioche', 'fusee', 'baton', 'bouclier', 'etoile',
    'manette', 'de', 'carte', 'eclair', 'flamme', 'coeur', 'note', 'cible', 'lune', 'ancre', 'hache', 'cle')),
  add constraint hg_champion_proposals_title_check check (title in ('main', 'capitaine', 'stratège', 'soutien', 'bâtisseur', 'chasseur', 'la terreur de')),
  add constraint hg_champion_proposals_game_label_check check (game_label is null or char_length(game_label) between 1 and 24),
  add constraint hg_champion_proposals_color_check check (color is null or color in ('#B70127', '#FE3104', '#FCA301', '#159946', '#2B5AE2', '#4E2398', '#121216')),
  add constraint hg_champion_proposals_pattern_check check (pattern is null or pattern in ('uni', 'rayons', 'pixels', 'losanges', 'arc')),
  add constraint hg_champion_proposals_inscription_check check (inscription is null or char_length(inscription) between 1 and 16),
  add constraint hg_champion_proposals_source_check check (source in ('embleme', 'photo', 'image')),
  add constraint hg_champion_proposals_image_path_check check (image_path is null or image_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,60}\.(webp|jpg)$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hg-champions', 'hg-champions', true, 1048576, array['image/webp', 'image/jpeg'])
  on conflict (id) do nothing;

-- Place restante du membre dans le bucket : fonction à part, une sous-requête sur storage.objects dans sa propre règle tournerait en rond.
create or replace function public.hg_champion_obj_place()
returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 10 from storage.objects o where o.bucket_id = 'hg-champions' and (storage.foldername(o.name))[1] = (select auth.uid())::text $$;
-- Un fichier en cours de relecture ou porté par une carte sortie ne peut pas être retiré par son auteur.
create or replace function public.hg_champion_obj_libre(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from hg_champion_proposals x where x.image_path = p_name and x.status in ('proposee', 'acceptee')) $$;
revoke all on function public.hg_champion_obj_place(), public.hg_champion_obj_libre(text) from public, anon;
grant execute on function public.hg_champion_obj_place(), public.hg_champion_obj_libre(text) to authenticated;

do $d$
begin
  execute 'dr' || 'op policy if exists hg_champions_obj_read on storage.objects';
  execute 'dr' || 'op policy if exists hg_champions_obj_write on storage.objects';
  execute 'dr' || 'op policy if exists hg_champions_obj_remove on storage.objects';
  create policy hg_champions_obj_read on storage.objects for select to authenticated
    using (bucket_id = 'hg-champions' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.hg_has_perm('cartes')));
  create policy hg_champions_obj_write on storage.objects for insert to authenticated
    with check (bucket_id = 'hg-champions' and public.hg_is_member() and (storage.foldername(name))[1] = (select auth.uid())::text
      and name ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,60}\.(webp|jpg)$' and public.hg_champion_obj_place());
  execute 'create policy hg_champions_obj_remove on storage.objects for ' || 'del' || 'ete to authenticated '
    || 'using (bucket_id = ''hg-champions'' and (public.hg_has_perm(''cartes'') or ((storage.foldername(name))[1] = (select auth.uid())::text and public.hg_champion_obj_libre(name))))';
end $d$;

create or replace function public.hg_champion_game_label(p text)
returns text language sql immutable set search_path = public
as $$ select case p when 'lol' then 'LoL' when 'aoe2' then 'AoE2' when 'ck3' then 'CK3' when 'minecraft' then 'Minecraft'
  when 'among_us' then 'Among Us' when 'codenames' then 'Nom de code' when 'echecs' then 'Échecs' when 'uno' then 'Uno'
  when 'loup_garou' then 'Loup-Garou' else 'Jeu vidéo' end $$;

-- Ma carte Champion : comme la migration 082, plus l'identifiant (dossier de dépôt) et la photo de profil.
create or replace function public.hg_champion_me()
returns jsonb language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); y int := extract(year from now() at time zone 'Europe/Zurich')::int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  return jsonb_build_object('year', y, 'user_id', me,
    'pseudo', (select pseudo from hg_profiles where id = me),
    'avatar_url', (select avatar_url from hg_profiles where id = me),
    'current', (select to_jsonb(x) - 'reviewed_by' from hg_champion_proposals x
                 where x.user_id = me and (x.status = 'proposee' or x.year = y) order by (x.status = 'proposee') desc, x.created_at desc limit 1),
    'can_propose', not exists (select 1 from hg_champion_proposals x where x.user_id = me and (x.status = 'proposee' or (x.status = 'acceptee' and x.year = y))),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('year', x.year, 'card_id', x.card_id) order by x.year desc)
                         from hg_champion_proposals x where x.user_id = me and x.status = 'acceptee'), '[]'::jsonb));
end $$;

-- Proposition (pour soi-même uniquement) : listes blanches, longueurs bornées, image déposée dans son propre dossier, une par an.
create or replace function public.hg_champion_propose(p jsonb)
returns bigint language plpgsql security definer set search_path = public
as $$
declare me uuid := auth.uid(); y int := extract(year from now() at time zone 'Europe/Zurich')::int;
  v_game text := p->>'game'; v_emb text := p->>'emblem';
  v_title text := coalesce(nullif(p->>'title', ''), 'main');
  v_color text := nullif(p->>'color', ''); v_pattern text := nullif(p->>'pattern', '');
  v_source text := coalesce(nullif(p->>'source', ''), 'embleme');
  v_path text := nullif(p->>'image_path', '');
  v_main text := btrim(regexp_replace(coalesce(p->>'main', ''), '[[:cntrl:]<>]', '', 'g'));
  v_fl text := nullif(btrim(regexp_replace(coalesce(p->>'flavor', ''), '[[:cntrl:]<>]', '', 'g')), '');
  v_label text := nullif(btrim(regexp_replace(coalesce(p->>'game_label', ''), '[[:cntrl:]<>]', '', 'g')), '');
  v_ins text := nullif(btrim(regexp_replace(coalesce(p->>'inscription', ''), '[[:cntrl:]<>]', '', 'g')), '');
  v_id bigint;
begin
  if not hg_is_member() or exists (select 1 from hg_profiles where id = me and is_ghost) then raise exception 'Réservé aux membres'; end if;
  if v_game is null or v_game not in ('lol', 'aoe2', 'ck3', 'minecraft', 'among_us', 'codenames', 'echecs', 'uno', 'loup_garou', 'autre') then raise exception 'Jeu inconnu'; end if;
  if v_emb is null or v_emb not in ('epee', 'chateau', 'couronne', 'pioche', 'fusee', 'baton', 'bouclier', 'etoile',
    'manette', 'de', 'carte', 'eclair', 'flamme', 'coeur', 'note', 'cible', 'lune', 'ancre', 'hache', 'cle') then raise exception 'Emblème inconnu'; end if;
  if v_title not in ('main', 'capitaine', 'stratège', 'soutien', 'bâtisseur', 'chasseur', 'la terreur de') then raise exception 'Mot inconnu'; end if;
  if v_color is not null and v_color not in ('#B70127', '#FE3104', '#FCA301', '#159946', '#2B5AE2', '#4E2398', '#121216') then raise exception 'Couleur inconnue'; end if;
  if v_pattern is not null and v_pattern not in ('uni', 'rayons', 'pixels', 'losanges', 'arc') then raise exception 'Motif inconnu'; end if;
  if v_source not in ('embleme', 'photo', 'image') then raise exception 'Source inconnue'; end if;
  if char_length(v_main) not between 1 and 24 then raise exception 'Ton main : 1 à 24 caractères'; end if;
  if v_fl is not null and char_length(v_fl) > 60 then raise exception 'Ta phrase : 60 caractères au plus'; end if;
  if v_game <> 'autre' then v_label := null; end if;
  if v_label is not null and char_length(v_label) > 24 then raise exception 'Le nom du jeu : 24 caractères au plus'; end if;
  if v_ins is not null and char_length(v_ins) > 16 then raise exception 'Ton inscription : 16 caractères au plus'; end if;
  if v_source <> 'embleme' and v_path is null then raise exception 'Image manquante'; end if;
  if v_path is not null and (split_part(v_path, '/', 1) <> me::text
      or v_path !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,60}\.(webp|jpg)$'
      or not exists (select 1 from storage.objects o where o.bucket_id = 'hg-champions' and o.name = v_path)) then
    raise exception 'Image introuvable';
  end if;
  if exists (select 1 from hg_champion_proposals where user_id = me and status = 'proposee') then
    raise exception 'Ta proposition est déjà chez le Staff';
  end if;
  if exists (select 1 from hg_champion_proposals where user_id = me and status = 'acceptee' and year = y) then
    raise exception 'Tu as déjà ta carte Champion cette année (une par an)';
  end if;
  insert into hg_champion_proposals(user_id, year, game, main, emblem, flavor, title, game_label, color, pattern, inscription, source, image_path)
    values (me, y, v_game, v_main, v_emb, v_fl, v_title, v_label, v_color, v_pattern, v_ins, v_source, v_path) returning id into v_id;
  return v_id;
end $$;

-- Propositions en attente (Staff « cartes »).
create or replace function public.hg_champion_pending()
returns jsonb language plpgsql security definer set search_path = public
as $$
begin
  if not hg_has_perm('cartes') then raise exception 'Réservé au Staff « cartes »' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'user_id', x.user_id, 'pseudo', pr.pseudo, 'avatar_url', pr.avatar_url,
      'color', pr.color, 'year', x.year, 'game', x.game, 'main', x.main, 'emblem', x.emblem, 'flavor', x.flavor, 'created_at', x.created_at,
      'title', x.title, 'game_label', x.game_label, 'inscription', x.inscription, 'source', x.source, 'image_path', x.image_path)
      order by x.created_at)
    from hg_champion_proposals x join hg_profiles pr on pr.id = x.user_id where x.status = 'proposee'), '[]'::jsonb);
end $$;

-- Décision du Staff « cartes » : comme la migration 082 (chemin d'emblème de la 161). La carte prend le mot choisi et l'image composée.
create or replace function public.hg_champion_review(p_id bigint, p_accept boolean, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare x hg_champion_proposals; v_set uuid; v_card uuid; v_num int; v_pseudo text; v_copy bigint; v_code text; v_name text; v_image text;
begin
  if not hg_has_perm('cartes') then raise exception 'Réservé au Staff « cartes »' using errcode = '42501'; end if;
  select * into x from hg_champion_proposals where id = p_id for update;
  if not found then raise exception 'Proposition introuvable'; end if;
  if x.status <> 'proposee' then raise exception 'Cette proposition a déjà été traitée'; end if;
  if not coalesce(p_accept, false) then
    update hg_champion_proposals set status = 'refusee', review_note = nullif(left(btrim(coalesce(p_note, '')), 200), ''),
      reviewed_by = auth.uid(), reviewed_at = now() where id = x.id;
    perform hg_admin_audit('champion_refuse', x.user_id, 'champion:' || x.id, jsonb_build_object('main', x.main));
    return jsonb_build_object('status', 'refusee');
  end if;
  if exists (select 1 from hg_champion_proposals where user_id = x.user_id and year = x.year and status = 'acceptee') then
    raise exception 'Ce membre a déjà sa carte Champion %', x.year;
  end if;
  select pseudo into v_pseudo from hg_profiles where id = x.user_id;
  v_name := v_pseudo || ' · ' || x.title || ' ' || x.main;
  v_image := case when x.image_path is null then '/assets/cartes/champions/' || x.emblem || '.svg'
    else 'https://zqbdzokyhgavgmqgiwuw.supabase.co/storage/v1/object/public/hg-champions/' || x.image_path end;
  v_code := 'champions-' || x.year;
  insert into hg_card_sets(code, name, description, active, sort)
    values (v_code, 'Champions du gang ' || x.year, 'Les « mains » des membres du gang : une carte par membre et par an.', true, 500 + (x.year - 2000))
    on conflict (code) do nothing;
  select id into v_set from hg_card_sets where code = v_code;
  perform pg_advisory_xact_lock(hashtextextended('hg_champion_set:' || v_set, 0));
  select coalesce(max(number), 0) + 1 into v_num from hg_cards where set_id = v_set;
  insert into hg_cards(set_id, number, name, family, rarity, image_url, flavor, caption, member_id, can_shiny, tradeable, craftable, active)
    values (v_set, v_num, v_name, 'jeu', 'rare', v_image,
            x.flavor, coalesce(x.game_label, hg_champion_game_label(x.game)) || ' · édition ' || x.year, x.user_id, true, true, true, true)
    returning id into v_card;
  update hg_champion_proposals set status = 'acceptee', card_id = v_card, review_note = nullif(left(btrim(coalesce(p_note, '')), 200), ''),
    reviewed_by = auth.uid(), reviewed_at = now() where id = x.id;
  insert into hg_champion_gifts(card_id, user_id) values (v_card, x.user_id) on conflict do nothing;
  if found then
    v_copy := hg_card_give(x.user_id, v_card, true, 'cadeau');
    update hg_champion_gifts set copy_id = v_copy where card_id = v_card;
  end if;
  insert into hg_activity(user_id, kind, text)
    values (x.user_id, 'cartes', 'Nouvelle carte Champion : « ' || v_name || ' » !');
  perform hg_admin_audit('champion_accepte', x.user_id, 'champion:' || x.id, jsonb_build_object('carte', v_card, 'main', x.main));
  return jsonb_build_object('status', 'acceptee', 'card_id', v_card, 'copy_id', v_copy);
end $$;
