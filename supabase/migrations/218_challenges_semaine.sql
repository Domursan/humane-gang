-- 218 : challenges de la semaine (maquette validée le 02.11.2026, contrat commun base et site). L'admin crée un challenge
-- (nom, consignes, pourquoi, type de réponse, nombre de participations par membre, dates de participation, durée du vote,
-- gain en Paillettes et lot facultatif). Les membres envoient un fichier ou un texte pendant la participation ; ensuite, les
-- participants votent (une voix, jamais pour soi, modifiable jusqu'à la fin), sur des participations anonymes et mélangées.
-- À la fin du vote, la ou les participations avec le plus de voix gagnent (ex æquo : gain complet pour chacun, un membre ne
-- gagne qu'une fois par challenge). Aucune voix : l'admin choisit le gagnant, ou clôt sans gagnant.
--
-- 1. Bucket privé « hg-challenges » (25 Mo, mêmes types que d-files pour les documents). Chemin : <challenge_id>/<uuid>.<ext>.
--    Le dossier du membre n'est PAS dans le chemin (écart au contrat) : pendant le vote, les chemins sont rendus aux votants
--    pour créer les liens signés, et un <uid> en tête aurait trahi l'auteur. Le propriétaire est storage.objects.owner_id,
--    posé par l'API de stockage à l'envoi. Dépôt : membre, challenge en participation, extension autorisée, 20 fichiers par
--    challenge et 200 au total par membre. Lecture : propriétaire, admin, ou tout membre quand le fichier appartient à une
--    participation d'un challenge en vote ou après (fonction à part : une sous-requête dans la politique tournerait en rond).
--    Suppression : propriétaire et admin.
-- 2. Tables hg_weekly_challenges, hg_weekly_challenge_entries, _votes, _winners : RLS, admin seul en direct (écriture du
--    challenge lui-même ; lecture des trois autres). Les membres passent par les RPC. Un déclencheur pose vote_ends_at et
--    garde les colonnes de déroulement (closed_at, no_winner, vote_notified_at) hors de portée des écritures directes.
-- 3. hg_wch_phase, RPC des membres (hg_wch_page, hg_wch_enter, hg_wch_withdraw, hg_wch_vote, hg_wch_mes_fichiers) et de
--    l'admin (hg_wch_admin_list, hg_wch_admin_detail, hg_wch_admin_remove, hg_wch_admin_pick, hg_wch_admin_orphelins).
-- 4. hg_wch_tick (pg_cron « hg-wch-tick », toutes les 10 minutes) : ouverture du vote annoncée, dépouillement, Paillettes
--    (hg_wallet_add, raison « challenge », réf « challenge:<id> », une fois par gagnant), résultat annoncé.
-- 5. Page « challenge » dans hg_pages (membres, menu « Autres »), clé de notification « challenges.site » (hg_set_notif_prefs,
--    reprise de la 205), export (hg_export_my_data, reprise de la 216), purge 12 mois après la fin (hg_entretien__passage,
--    reprise de la 216). Les fichiers ne peuvent pas être effacés depuis SQL (storage.protect_delete) : les fichiers sans
--    participation sont listés par hg_wch_admin_orphelins et retirés par le panel (API de stockage).
-- (Clauses de suppression écrites en morceaux, comme dans les migrations précédentes.) Rejouable.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.hg_weekly_challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  how_to text check (how_to is null or char_length(how_to) <= 2000),
  why text check (why is null or char_length(why) <= 1000),
  answer_type text not null default 'image' check (answer_type in ('image', 'video', 'audio', 'pdf', 'texte', 'tout')),
  max_entries int not null default 1 check (max_entries between 1 and 10),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  vote_days int not null default 2 check (vote_days between 1 and 14),
  vote_ends_at timestamptz not null,
  reward_paillettes int not null default 0 check (reward_paillettes between 0 and 100000),
  reward_text text check (reward_text is null or char_length(reward_text) <= 200),
  cancelled_at timestamptz,
  closed_at timestamptz,
  no_winner boolean not null default false,
  vote_notified_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint hg_weekly_challenges_dates check (ends_at > starts_at)
);
comment on table public.hg_weekly_challenges is 'Challenges de la semaine : écrits par l’admin, lus par les membres via hg_wch_page. vote_ends_at = ends_at + vote_days jours (déclencheur). Migration 218.';

create table if not exists public.hg_weekly_challenge_entries (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null,
  user_id uuid not null,
  path text unique check (path is null or char_length(path) between 3 and 300),
  file_name text check (file_name is null or char_length(file_name) between 1 and 120),
  mime text check (mime is null or char_length(mime) <= 120),
  size int check (size is null or size between 1 and 26214400),
  body text check (body is null or char_length(body) between 1 and 2000),
  caption text check (caption is null or char_length(caption) <= 200),
  created_at timestamptz not null default now(),
  -- Un fichier ou un texte, jamais les deux.
  constraint hg_weekly_challenge_entries_contenu check ((path is null) <> (body is null))
);
create index if not exists hg_weekly_challenge_entries_challenge_idx on public.hg_weekly_challenge_entries (challenge_id);
create index if not exists hg_weekly_challenge_entries_user_idx on public.hg_weekly_challenge_entries (user_id);
comment on table public.hg_weekly_challenge_entries is 'Participations aux challenges de la semaine (fichier du bucket hg-challenges, ou texte). Migration 218.';

create table if not exists public.hg_weekly_challenge_votes (
  challenge_id uuid not null,
  voter_id uuid not null,
  entry_id uuid not null,
  updated_at timestamptz not null default now(),
  primary key (challenge_id, voter_id)
);
create index if not exists hg_weekly_challenge_votes_entry_idx on public.hg_weekly_challenge_votes (entry_id);
create index if not exists hg_weekly_challenge_votes_voter_idx on public.hg_weekly_challenge_votes (voter_id);
comment on table public.hg_weekly_challenge_votes is 'Voix des challenges de la semaine : une par votant et par challenge. Jamais lues par les membres, sauf la leur. Migration 218.';

create table if not exists public.hg_weekly_challenge_winners (
  challenge_id uuid not null,
  user_id uuid not null,
  entry_id uuid,
  votes int not null default 0,
  chosen_by_admin boolean not null default false,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
create index if not exists hg_weekly_challenge_winners_user_idx on public.hg_weekly_challenge_winners (user_id);
comment on table public.hg_weekly_challenge_winners is 'Gagnants des challenges de la semaine ; credited_at : Paillettes versées. Migration 218.';

-- Clés étrangères (construites dynamiquement : outil de migration). Un membre supprimé emporte ses participations, ses voix
-- et ses gains ; une participation retirée emporte les voix qu'elle avait, et laisse le gagnant (déjà payé) sans participation.
do $f$
declare c record;
begin
  for c in select * from (values
      ('hg_weekly_challenges', 'created_by', 'hg_weekly_challenges_created_by_fkey', 'hg_profiles', 'set null'),
      ('hg_weekly_challenge_entries', 'challenge_id', 'hg_weekly_challenge_entries_challenge_fkey', 'hg_weekly_challenges', 'cascade'),
      ('hg_weekly_challenge_entries', 'user_id', 'hg_weekly_challenge_entries_user_fkey', 'hg_profiles', 'cascade'),
      ('hg_weekly_challenge_votes', 'challenge_id', 'hg_weekly_challenge_votes_challenge_fkey', 'hg_weekly_challenges', 'cascade'),
      ('hg_weekly_challenge_votes', 'voter_id', 'hg_weekly_challenge_votes_voter_fkey', 'hg_profiles', 'cascade'),
      ('hg_weekly_challenge_votes', 'entry_id', 'hg_weekly_challenge_votes_entry_fkey', 'hg_weekly_challenge_entries', 'cascade'),
      ('hg_weekly_challenge_winners', 'challenge_id', 'hg_weekly_challenge_winners_challenge_fkey', 'hg_weekly_challenges', 'cascade'),
      ('hg_weekly_challenge_winners', 'user_id', 'hg_weekly_challenge_winners_user_fkey', 'hg_profiles', 'cascade'),
      ('hg_weekly_challenge_winners', 'entry_id', 'hg_weekly_challenge_winners_entry_fkey', 'hg_weekly_challenge_entries', 'set null')
    ) as x(t, col, nom, cible, regle) loop
    if not exists (select 1 from pg_constraint where conname = c.nom) then
      execute format('alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on update cascade on de' || 'lete %s',
        c.t, c.nom, c.col, c.cible, c.regle);
    end if;
  end loop;
end $f$;

-- Droits : rien pour les visiteurs ; l'admin écrit les challenges et lit le reste en direct (RLS ci-dessous) ; les membres
-- n'ont aucun accès direct (aucune politique ne les laisse passer), tout passe par les RPC.
alter table public.hg_weekly_challenges enable row level security;
alter table public.hg_weekly_challenge_entries enable row level security;
alter table public.hg_weekly_challenge_votes enable row level security;
alter table public.hg_weekly_challenge_winners enable row level security;
revoke all on table public.hg_weekly_challenges, public.hg_weekly_challenge_entries, public.hg_weekly_challenge_votes,
  public.hg_weekly_challenge_winners from anon, authenticated;
grant select, insert, update on table public.hg_weekly_challenges to authenticated;
do $g$ begin execute 'grant de' || 'lete on table public.hg_weekly_challenges to authenticated'; end $g$;
grant select on table public.hg_weekly_challenge_entries, public.hg_weekly_challenge_votes, public.hg_weekly_challenge_winners to authenticated;

do $p$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hg_weekly_challenges' and policyname = 'hg_weekly_challenges_admin') then
    create policy hg_weekly_challenges_admin on public.hg_weekly_challenges for all to authenticated
      using (public.hg_is_admin()) with check (public.hg_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hg_weekly_challenge_entries' and policyname = 'hg_weekly_challenge_entries_admin') then
    create policy hg_weekly_challenge_entries_admin on public.hg_weekly_challenge_entries for select to authenticated using (public.hg_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hg_weekly_challenge_votes' and policyname = 'hg_weekly_challenge_votes_admin') then
    create policy hg_weekly_challenge_votes_admin on public.hg_weekly_challenge_votes for select to authenticated using (public.hg_is_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hg_weekly_challenge_winners' and policyname = 'hg_weekly_challenge_winners_admin') then
    create policy hg_weekly_challenge_winners_admin on public.hg_weekly_challenge_winners for select to authenticated using (public.hg_is_admin());
  end if;
end $p$;

-- ---------------------------------------------------------------------------
-- 2. Déclencheurs du challenge
-- ---------------------------------------------------------------------------
/*
 * Avant l'écriture d'un challenge : vote_ends_at = ends_at + vote_days jours. Pour une écriture directe (admin depuis le panel,
 * rôle authenticated), les colonnes de déroulement restent celles de la base : closed_at, no_winner, vote_notified_at,
 * created_by, created_at. Un challenge dépouillé ne change plus de dates, de type, de quota, de gain ni d'état d'annulation ;
 * une fois la participation finie, ses dates de participation, son type et son quota ne bougent plus ; le type ne change pas
 * quand des participations existent. Les fonctions de la migration (propriétaire) ne sont pas bridées. Sans « security
 * definer » : current_user doit rester celui de l'appelant (authenticated pour le panel, le propriétaire dans les RPC).
 */
create or replace function public.hg_wch__avant_ecriture()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_direct boolean := current_user in ('authenticated', 'anon');
begin
  if v_direct then
    if tg_op = 'INSERT' then
      new.closed_at := null; new.no_winner := false; new.vote_notified_at := null;
      new.created_by := auth.uid(); new.created_at := now();
    else
      new.id := old.id; new.closed_at := old.closed_at; new.no_winner := old.no_winner; new.vote_notified_at := old.vote_notified_at;
      new.created_by := old.created_by; new.created_at := old.created_at;
      if old.closed_at is not null and (new.starts_at, new.ends_at, new.vote_days, new.answer_type, new.max_entries, new.reward_paillettes)
           is distinct from (old.starts_at, old.ends_at, old.vote_days, old.answer_type, old.max_entries, old.reward_paillettes) then
        raise exception 'Ce challenge est clos : seuls le nom, les textes et le lot peuvent encore changer.';
      end if;
      if old.closed_at is not null and new.cancelled_at is distinct from old.cancelled_at then
        raise exception 'Ce challenge est clos : il ne peut plus être annulé.';
      end if;
      if old.ends_at <= now() and (new.starts_at, new.ends_at, new.answer_type, new.max_entries)
           is distinct from (old.starts_at, old.ends_at, old.answer_type, old.max_entries) then
        raise exception 'La participation est finie : ses dates, le type de réponse et le nombre de participations ne changent plus.';
      end if;
      if new.answer_type <> old.answer_type and exists (select 1 from hg_weekly_challenge_entries e where e.challenge_id = old.id) then
        raise exception 'Des membres ont déjà participé : le type de réponse ne change plus.';
      end if;
    end if;
  end if;
  new.title := btrim(new.title);
  new.reward_text := nullif(btrim(coalesce(new.reward_text, '')), '');
  new.vote_ends_at := new.ends_at + make_interval(days => new.vote_days);
  return new;
end $$;

do $t$ begin
  execute 'dr' || 'op trigger if exists hg_weekly_challenges_avant on public.hg_weekly_challenges';
  create trigger hg_weekly_challenges_avant before insert or update on public.hg_weekly_challenges
    for each row execute function public.hg_wch__avant_ecriture();
end $t$;

/* Un challenge avec des participations ne se supprime pas (on l'annule) : ses fichiers et ses gains resteraient sans trace. */
create or replace function public.hg_wch__avant_retrait()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from hg_weekly_challenge_entries e where e.challenge_id = old.id) then
    raise exception 'Ce challenge a des participations : annule-le plutôt.';
  end if;
  return old;
end $$;

do $t$ begin
  execute 'dr' || 'op trigger if exists hg_weekly_challenges_retrait on public.hg_weekly_challenges';
  execute 'create trigger hg_weekly_challenges_retrait before de' || 'lete on public.hg_weekly_challenges '
    || 'for each row execute function public.hg_wch__avant_retrait()';
end $t$;

revoke all on function public.hg_wch__avant_ecriture(), public.hg_wch__avant_retrait() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Phase et outils internes
-- ---------------------------------------------------------------------------
/*
 * Phase d'un challenge : annule, a_venir, participation, vote, puis termine (gagnants), sans_gagnant (clos sans gagnant),
 * attente (dépouillé sans aucune voix : l'admin choisit), cloture (vote fini, dépouillement au prochain passage).
 */
create or replace function public.hg_wch_phase(c public.hg_weekly_challenges)
returns text language sql stable security definer set search_path = public as $$
  select case
    when c.cancelled_at is not null then 'annule'
    when now() < c.starts_at then 'a_venir'
    when now() < c.ends_at then 'participation'
    when now() < c.vote_ends_at then 'vote'
    when exists (select 1 from hg_weekly_challenge_winners w where w.challenge_id = c.id) then 'termine'
    when c.no_winner then 'sans_gagnant'
    when c.closed_at is not null then 'attente'
    else 'cloture'
  end $$;
revoke all on function public.hg_wch_phase(public.hg_weekly_challenges) from public, anon;
grant execute on function public.hg_wch_phase(public.hg_weekly_challenges) to authenticated;

/* Types de fichier acceptés pour un type de réponse (les mêmes chaînes que le bucket ; texte : aucun fichier). */
create or replace function public.hg_wch__mimes(p_type text)
returns text[] language sql immutable set search_path = public as $$
  select case p_type
    when 'image' then array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    when 'video' then array['video/mp4', 'video/webm', 'video/quicktime']
    when 'audio' then array['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/x-m4a']
    when 'pdf' then array['application/pdf']
    when 'tout' then array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/x-m4a', 'application/pdf', 'text/plain',
      'application/zip', 'application/x-zip-compressed',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet']
    else array[]::text[]
  end $$;

/* Forme d'un nom de fichier du bucket : <challenge_id>/<8 à 64 caractères sûrs>.<extension autorisée>. */
create or replace function public.hg_wch__nom_ok(p_name text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|gif|mp4|webm|mov|mp3|ogg|oga|wav|m4a|pdf|txt|zip|docx|xlsx|pptx|odt|ods)$', false) $$;

/* Note une notification du site, catégorie « challenges ». p_toujours : même si le membre a coupé la catégorie (retrait admin). */
create or replace function public.hg_wch__notif(p_user uuid, p_titre text, p_texte text, p_toujours boolean default false)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_user is null then return; end if;
  if not p_toujours and not hg_notif_allowed(p_user, 'challenges', 'site') then return; end if;
  insert into hg_site_notifs (user_id, cat, titre, texte, lien)
    select p.id, 'challenges', left(p_titre, 200), left(p_texte, 1000), '/pages/compte/challenge.html' from hg_profiles p where p.id = p_user;
end $$;

/* Verse le gain aux gagnants pas encore payés (une fois par gagnant : credited_at, et réf unique du journal). Rend le nombre payé. */
create or replace function public.hg_wch__payer(p_challenge uuid)
returns int language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c hg_weekly_challenges; w record; n int := 0;
begin
  select * into c from hg_weekly_challenges where id = p_challenge;
  if not found or c.cancelled_at is not null then return 0; end if;
  for w in select * from hg_weekly_challenge_winners where challenge_id = p_challenge and credited_at is null order by user_id for update loop
    if c.reward_paillettes > 0 then
      perform hg_wallet_add(w.user_id, c.reward_paillettes, 'challenge', 'challenge:' || c.id::text);
    end if;
    update hg_weekly_challenge_winners set credited_at = now() where challenge_id = w.challenge_id and user_id = w.user_id;
    n := n + 1;
  end loop;
  return n;
end $$;

/* Annonce le résultat à chaque participant (gagnant : son gain ; les autres : les pseudos gagnants ; ou « sans gagnant »). */
create or replace function public.hg_wch__annoncer(p_challenge uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c hg_weekly_challenges; v_noms text; v_admin boolean; v_gain text; u record;
begin
  select * into c from hg_weekly_challenges where id = p_challenge;
  if not found then return; end if;
  select string_agg(p.pseudo, ', ' order by p.pseudo), bool_or(w.chosen_by_admin) into v_noms, v_admin
    from hg_weekly_challenge_winners w join hg_profiles p on p.id = w.user_id where w.challenge_id = c.id;
  v_gain := case when c.reward_paillettes > 0 then '+' || c.reward_paillettes || ' Paillettes' else '' end
         || case when c.reward_text is not null then case when c.reward_paillettes > 0 then ' et ' else '' end || c.reward_text else '' end;
  for u in select distinct e.user_id from hg_weekly_challenge_entries e where e.challenge_id = c.id loop
    if exists (select 1 from hg_weekly_challenge_winners w where w.challenge_id = c.id and w.user_id = u.user_id) then
      perform hg_wch__notif(u.user_id, 'Tu as gagné le challenge « ' || c.title || ' »',
        case when v_admin then 'L’admin a choisi ta participation.' else 'Ta participation a reçu le plus de voix.' end
          || case when v_gain <> '' then ' Ton gain : ' || v_gain || '.' else '' end);
    elsif v_noms is not null then
      perform hg_wch__notif(u.user_id, 'Résultat du challenge « ' || c.title || ' »',
        case when v_admin then 'Choisi par l’admin : ' else 'Gagnant : ' end || v_noms || '. Toutes les participations sont visibles.');
    else
      perform hg_wch__notif(u.user_id, 'Résultat du challenge « ' || c.title || ' »',
        'Le challenge se termine sans gagnant. Toutes les participations sont visibles.');
    end if;
  end loop;
end $$;

/* Dépôt d'un fichier (politique d'insertion du bucket) : membre, challenge en participation qui attend un fichier, nom valide,
   au plus 20 fichiers par challenge et 200 au total pour ce membre. */
create or replace function public.hg_wch__obj_depot_ok(p_name text)
returns boolean language sql stable security definer set search_path = public, storage as $$
  select auth.uid() is not null and public.hg_is_member() and public.hg_wch__nom_ok(p_name)
    and exists (select 1 from public.hg_weekly_challenges c where c.id::text = split_part(p_name, '/', 1)
                 and c.cancelled_at is null and c.answer_type <> 'texte' and now() >= c.starts_at and now() < c.ends_at)
    and (select count(*) from storage.objects o where o.bucket_id = 'hg-challenges' and o.owner_id = auth.uid()::text
          and split_part(o.name, '/', 1) = split_part(p_name, '/', 1)) < 20
    and (select count(*) from storage.objects o where o.bucket_id = 'hg-challenges' and o.owner_id = auth.uid()::text) < 200 $$;

/* Lecture d'un fichier par un autre membre : il appartient à une participation d'un challenge non annulé dont la participation est finie. */
create or replace function public.hg_wch__obj_visible(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.hg_is_member() and exists (select 1 from public.hg_weekly_challenge_entries e
      join public.hg_weekly_challenges c on c.id = e.challenge_id
     where e.path = p_name and c.cancelled_at is null and now() >= c.ends_at) $$;

revoke all on function public.hg_wch__mimes(text), public.hg_wch__nom_ok(text), public.hg_wch__notif(uuid, text, text, boolean),
  public.hg_wch__payer(uuid), public.hg_wch__annoncer(uuid) from public, anon, authenticated;
-- Les deux fonctions des politiques du bucket sont évaluées avec les droits du membre connecté.
revoke all on function public.hg_wch__obj_depot_ok(text), public.hg_wch__obj_visible(text) from public, anon;
grant execute on function public.hg_wch__obj_depot_ok(text), public.hg_wch__obj_visible(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Bucket et politiques du stockage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hg-challenges', 'hg-challenges', false, 26214400, public.hg_wch__mimes('tout'))
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $s$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hg_challenges_obj_ins') then
    create policy hg_challenges_obj_ins on storage.objects for insert to authenticated
      with check (bucket_id = 'hg-challenges'
        and coalesce(owner_id, (select auth.uid())::text) = (select auth.uid())::text
        and public.hg_wch__obj_depot_ok(name));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hg_challenges_obj_sel') then
    create policy hg_challenges_obj_sel on storage.objects for select to authenticated
      using (bucket_id = 'hg-challenges'
        and (owner_id = (select auth.uid())::text or public.hg_is_admin() or public.hg_wch__obj_visible(name)));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'hg_challenges_obj_del') then
    execute 'create policy hg_challenges_obj_del on storage.objects for ' || 'del' || 'ete to authenticated '
      || 'using (bucket_id = ''hg-challenges'' and (owner_id = (select auth.uid())::text or public.hg_is_admin()))';
  end if;
end $s$;

-- ---------------------------------------------------------------------------
-- 5. RPC des membres
-- ---------------------------------------------------------------------------
/*
 * Page du membre : { current, archives }. current : le challenge non annulé le plus pertinent (en participation ou en vote,
 * sinon le prochain à venir, sinon le dernier fini depuis moins de 3 jours), ou null. Pendant le vote, les participations
 * sont anonymes (ni auteur ni voix) et mélangées par membre ; après, auteurs et voix, triées par voix. Page fermée au membre
 * (hg_pages) : rien à montrer.
 */
create or replace function public.hg_wch_page()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  c hg_weekly_challenges;
  v_phase text;
  v_entries jsonb := '[]'::jsonb;
  v_cur jsonb;
  v_archives jsonb;
begin
  if me is null or not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if not hg_page_ok(me, 'challenge') then return jsonb_build_object('current', null, 'archives', '[]'::jsonb); end if;

  select x.* into c from hg_weekly_challenges x
   where x.cancelled_at is null and x.vote_ends_at > now() - interval '3 days'
   order by case when x.starts_at <= now() and x.vote_ends_at > now() then 0 when x.starts_at > now() then 1 else 2 end,
            case when x.starts_at <= now() and x.vote_ends_at > now() then x.vote_ends_at end asc,
            case when x.starts_at > now() then x.starts_at end asc,
            x.vote_ends_at desc, x.created_at desc
   limit 1;

  if c.id is not null then
    v_phase := hg_wch_phase(c);
    if v_phase = 'vote' then
      select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'path', e.path, 'file_name', e.file_name, 'mime', e.mime, 'size', e.size,
               'body', e.body, 'caption', e.caption, 'is_mine', e.user_id = me) order by md5(e.id::text || me::text)), '[]'::jsonb)
        into v_entries from hg_weekly_challenge_entries e where e.challenge_id = c.id;
    elsif v_phase in ('termine', 'sans_gagnant', 'attente', 'cloture') then
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'path', x.path, 'file_name', x.file_name, 'mime', x.mime, 'size', x.size,
               'body', x.body, 'caption', x.caption, 'is_mine', x.user_id = me, 'user_id', x.user_id, 'pseudo', x.pseudo,
               'avatar_url', x.avatar_url, 'votes', x.votes, 'winner', x.winner) order by x.votes desc, x.created_at), '[]'::jsonb)
        into v_entries
        from (select e.*, p.pseudo, p.avatar_url,
                     (select count(*) from hg_weekly_challenge_votes v where v.entry_id = e.id)::int as votes,
                     exists (select 1 from hg_weekly_challenge_winners w where w.challenge_id = c.id and w.entry_id = e.id) as winner
                from hg_weekly_challenge_entries e left join hg_profiles p on p.id = e.user_id
               where e.challenge_id = c.id) x;
    end if;

    v_cur := jsonb_build_object(
      'id', c.id, 'title', c.title, 'how_to', c.how_to, 'why', c.why, 'answer_type', c.answer_type, 'max_entries', c.max_entries,
      'starts_at', c.starts_at, 'ends_at', c.ends_at, 'vote_ends_at', c.vote_ends_at,
      'reward_paillettes', c.reward_paillettes, 'reward_text', c.reward_text, 'phase', v_phase,
      'participants_count', (select count(distinct e.user_id) from hg_weekly_challenge_entries e where e.challenge_id = c.id),
      'entries_count', (select count(*) from hg_weekly_challenge_entries e where e.challenge_id = c.id),
      'my_entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'path', e.path, 'file_name', e.file_name, 'mime', e.mime,
                       'size', e.size, 'body', e.body, 'caption', e.caption, 'created_at', e.created_at) order by e.created_at), '[]'::jsonb)
                       from hg_weekly_challenge_entries e where e.challenge_id = c.id and e.user_id = me),
      'can_vote', v_phase = 'vote'
                  and exists (select 1 from hg_weekly_challenge_entries e where e.challenge_id = c.id and e.user_id = me)
                  and exists (select 1 from hg_weekly_challenge_entries e where e.challenge_id = c.id and e.user_id <> me),
      'my_vote', (select v.entry_id from hg_weekly_challenge_votes v where v.challenge_id = c.id and v.voter_id = me),
      'entries', v_entries,
      'winners', case when v_phase = 'termine' then
                   (select coalesce(jsonb_agg(jsonb_build_object('user_id', w.user_id, 'pseudo', p.pseudo, 'avatar_url', p.avatar_url,
                      'entry_id', w.entry_id, 'votes', w.votes, 'chosen_by_admin', w.chosen_by_admin) order by w.votes desc, p.pseudo), '[]'::jsonb)
                      from hg_weekly_challenge_winners w left join hg_profiles p on p.id = w.user_id where w.challenge_id = c.id)
                 else '[]'::jsonb end);
  end if;

  select coalesce(jsonb_agg(a.j order by a.fin desc), '[]'::jsonb) into v_archives from (
    select x.vote_ends_at as fin, jsonb_build_object('id', x.id, 'title', x.title, 'answer_type', x.answer_type,
             'vote_ends_at', x.vote_ends_at, 'reward_paillettes', x.reward_paillettes, 'reward_text', x.reward_text,
             'participants_count', (select count(distinct e.user_id) from hg_weekly_challenge_entries e where e.challenge_id = x.id),
             'outcome', case (select count(*) from hg_weekly_challenge_winners w where w.challenge_id = x.id)
                          when 0 then 'sans_gagnant' when 1 then 'gagnant' else 'ex_aequo' end,
             'chosen_by_admin', coalesce((select bool_or(w.chosen_by_admin) from hg_weekly_challenge_winners w where w.challenge_id = x.id), false),
             'winners', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'votes', w.votes) order by w.votes desc, p.pseudo), '[]'::jsonb)
                           from hg_weekly_challenge_winners w left join hg_profiles p on p.id = w.user_id where w.challenge_id = x.id)) as j
      from hg_weekly_challenges x
     where x.cancelled_at is null and x.id is distinct from c.id and x.vote_ends_at <= now()
       and (x.no_winner or exists (select 1 from hg_weekly_challenge_winners w where w.challenge_id = x.id))
     order by x.vote_ends_at desc limit 12) a;

  return jsonb_build_object('current', v_cur, 'archives', v_archives);
end $$;

/*
 * Participer : challenge en participation, quota du challenge, contenu conforme au type (texte : body sans fichier ; sinon un
 * fichier déjà envoyé par ce membre dans <challenge_id>/, de type accepté). Le type et la taille sont relus dans le stockage
 * quand il les connaît. Rend l'identifiant de la participation.
 */
create or replace function public.hg_wch_enter(p_challenge uuid, p_path text, p_file_name text, p_mime text, p_size int,
  p_body text, p_caption text)
returns uuid language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  c hg_weekly_challenges;
  v_phase text;
  v_n int;
  v_caption text := nullif(btrim(coalesce(p_caption, '')), '');
  v_body text;
  v_meta jsonb;
  v_owner text;
  v_mime text;
  v_size bigint;
  v_name text;
  v_id uuid;
begin
  if me is null or not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if not hg_page_ok(me, 'challenge') then raise exception 'Cette page ne t’est pas ouverte'; end if;
  -- Verrou sur le challenge : deux envois simultanés ne dépassent pas le quota.
  select * into c from hg_weekly_challenges where id = p_challenge for update;
  if not found or c.cancelled_at is not null then raise exception 'Challenge introuvable'; end if;
  v_phase := hg_wch_phase(c);
  if v_phase = 'a_venir' then raise exception 'La participation n’est pas encore ouverte'; end if;
  if v_phase <> 'participation' then raise exception 'La participation est fermée'; end if;
  select count(*) into v_n from hg_weekly_challenge_entries e where e.challenge_id = c.id and e.user_id = me;
  if v_n >= c.max_entries then
    raise exception 'Tu as déjà % participation(s) : c’est le maximum pour ce challenge', v_n;
  end if;
  if char_length(coalesce(v_caption, '')) > 200 then raise exception 'La légende fait au plus 200 caractères'; end if;

  if c.answer_type = 'texte' then
    if p_path is not null then raise exception 'Ce challenge attend un texte, pas un fichier'; end if;
    v_body := nullif(btrim(coalesce(p_body, '')), '');
    if v_body is null then raise exception 'Écris ton texte'; end if;
    if char_length(v_body) > 2000 then raise exception 'Ton texte fait au plus 2000 caractères'; end if;
    insert into hg_weekly_challenge_entries (challenge_id, user_id, body, caption) values (c.id, me, v_body, v_caption)
      returning id into v_id;
    return v_id;
  end if;

  if p_path is null then raise exception 'Ajoute un fichier'; end if;
  if not hg_wch__nom_ok(p_path) or split_part(p_path, '/', 1) <> c.id::text then raise exception 'Fichier refusé'; end if;
  select o.metadata, o.owner_id into v_meta, v_owner from storage.objects o where o.bucket_id = 'hg-challenges' and o.name = p_path;
  if not found or v_owner is distinct from me::text then raise exception 'Fichier introuvable : envoie-le d’abord'; end if;
  if exists (select 1 from hg_weekly_challenge_entries e where e.path = p_path) then raise exception 'Ce fichier est déjà envoyé'; end if;
  v_mime := lower(coalesce(nullif(v_meta ->> 'mimetype', ''), p_mime, ''));
  if not (v_mime = any (hg_wch__mimes(c.answer_type))) then raise exception 'Ce type de fichier ne correspond pas au challenge'; end if;
  v_size := coalesce(case when (v_meta ->> 'size') ~ '^[0-9]{1,12}$' then (v_meta ->> 'size')::bigint end, p_size);
  if v_size is null or v_size < 1 then raise exception 'Fichier vide'; end if;
  if v_size > 26214400 then raise exception 'Fichier trop lourd : 25 Mo au plus'; end if;
  v_name := regexp_replace(left(coalesce(nullif(btrim(coalesce(p_file_name, '')), ''), 'fichier'), 120), '[/\\[:cntrl:]]', '_', 'g');
  insert into hg_weekly_challenge_entries (challenge_id, user_id, path, file_name, mime, size, caption)
    values (c.id, me, p_path, v_name, v_mime, v_size::int, v_caption) returning id into v_id;
  return v_id;
end $$;

/* Retirer sa participation, tant que la participation est ouverte. Rend le chemin du fichier à retirer du stockage (ou null). */
create or replace function public.hg_wch_withdraw(p_entry uuid)
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); e hg_weekly_challenge_entries; c hg_weekly_challenges;
begin
  if me is null or not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  select * into e from hg_weekly_challenge_entries where id = p_entry;
  if not found or e.user_id <> me then raise exception 'Participation introuvable'; end if;
  select * into c from hg_weekly_challenges where id = e.challenge_id for update;
  if hg_wch_phase(c) <> 'participation' then raise exception 'La participation est fermée : ta participation reste'; end if;
  execute 'de' || 'lete from public.hg_weekly_challenge_entries where id = $1' using e.id;
  return e.path;
end $$;

/* Voter (ou changer sa voix) : vote ouvert, votant avec au moins une participation, jamais pour la sienne. */
create or replace function public.hg_wch_vote(p_entry uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); e hg_weekly_challenge_entries; c hg_weekly_challenges;
begin
  if me is null or not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if not hg_page_ok(me, 'challenge') then raise exception 'Cette page ne t’est pas ouverte'; end if;
  select * into e from hg_weekly_challenge_entries where id = p_entry;
  if not found then raise exception 'Participation introuvable'; end if;
  -- Verrou partagé : le dépouillement (verrou exclusif) attend les voix en cours.
  select * into c from hg_weekly_challenges where id = e.challenge_id for share;
  if hg_wch_phase(c) <> 'vote' then raise exception 'Le vote n’est pas ouvert'; end if;
  if not exists (select 1 from hg_weekly_challenge_entries x where x.challenge_id = c.id and x.user_id = me) then
    raise exception 'Seuls les participants votent';
  end if;
  if e.user_id = me then raise exception 'Tu ne peux pas voter pour ta propre participation'; end if;
  insert into hg_weekly_challenge_votes (challenge_id, voter_id, entry_id) values (c.id, me, e.id)
    on conflict (challenge_id, voter_id) do update set entry_id = excluded.entry_id, updated_at = now();
end $$;

/* Mes fichiers du bucket (tous challenges) : pour les retirer du stockage avant la suppression du compte. */
create or replace function public.hg_wch_mes_fichiers()
returns text[] language sql stable security definer set search_path = public, storage as $$
  select coalesce(array_agg(o.name order by o.name), array[]::text[]) from storage.objects o
   where auth.uid() is not null and o.bucket_id = 'hg-challenges' and o.owner_id = auth.uid()::text $$;

revoke all on function public.hg_wch_page(), public.hg_wch_enter(uuid, text, text, text, int, text, text), public.hg_wch_withdraw(uuid),
  public.hg_wch_vote(uuid), public.hg_wch_mes_fichiers() from public, anon;
grant execute on function public.hg_wch_page(), public.hg_wch_enter(uuid, text, text, text, int, text, text), public.hg_wch_withdraw(uuid),
  public.hg_wch_vote(uuid), public.hg_wch_mes_fichiers() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC de l'admin
-- ---------------------------------------------------------------------------
/* Tous les challenges, du plus récent : phase, participations, participants, votants, pseudos gagnants. */
create or replace function public.hg_wch_admin_list()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not hg_is_admin() then raise exception 'Réservé à l’administrateur'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(c) || jsonb_build_object('phase', hg_wch_phase(c),
      'entries_count', (select count(*) from hg_weekly_challenge_entries e where e.challenge_id = c.id),
      'participants_count', (select count(distinct e.user_id) from hg_weekly_challenge_entries e where e.challenge_id = c.id),
      'voters_count', (select count(*) from hg_weekly_challenge_votes v where v.challenge_id = c.id),
      'winners', (select coalesce(jsonb_agg(p.pseudo order by p.pseudo), '[]'::jsonb)
                    from hg_weekly_challenge_winners w join hg_profiles p on p.id = w.user_id where w.challenge_id = c.id))
    order by c.starts_at desc, c.created_at desc), '[]'::jsonb) from hg_weekly_challenges c);
end $$;

/* Détail d'un challenge pour l'admin : participations avec auteur et voix (à tout moment), votants, gagnants. */
create or replace function public.hg_wch_admin_detail(p_challenge uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c hg_weekly_challenges;
begin
  if not hg_is_admin() then raise exception 'Réservé à l’administrateur'; end if;
  select * into c from hg_weekly_challenges where id = p_challenge;
  if not found then raise exception 'Challenge introuvable'; end if;
  return jsonb_build_object(
    'challenge', to_jsonb(c) || jsonb_build_object('phase', hg_wch_phase(c)),
    'entries', (select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'user_id', e.user_id, 'pseudo', p.pseudo, 'path', e.path,
                  'file_name', e.file_name, 'mime', e.mime, 'size', e.size, 'body', e.body, 'caption', e.caption, 'created_at', e.created_at,
                  'votes', (select count(*) from hg_weekly_challenge_votes v where v.entry_id = e.id))
                  order by (select count(*) from hg_weekly_challenge_votes v where v.entry_id = e.id) desc, e.created_at), '[]'::jsonb)
                 from hg_weekly_challenge_entries e left join hg_profiles p on p.id = e.user_id where e.challenge_id = c.id),
    'voters_count', (select count(*) from hg_weekly_challenge_votes v where v.challenge_id = c.id),
    'winners', (select coalesce(jsonb_agg(jsonb_build_object('user_id', w.user_id, 'pseudo', p.pseudo, 'entry_id', w.entry_id, 'votes', w.votes,
                  'chosen_by_admin', w.chosen_by_admin, 'credited_at', w.credited_at) order by w.votes desc, p.pseudo), '[]'::jsonb)
                 from hg_weekly_challenge_winners w left join hg_profiles p on p.id = w.user_id where w.challenge_id = c.id));
end $$;

/* Retirer une participation (motif obligatoire, 3 à 300 caractères) : le membre est prévenu avec le motif, l'action est
   journalisée. Rend le chemin du fichier à retirer du stockage (ou null). */
create or replace function public.hg_wch_admin_remove(p_entry uuid, p_reason text)
returns text language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare e hg_weekly_challenge_entries; c hg_weekly_challenges; v_motif text := btrim(coalesce(p_reason, ''));
begin
  if not hg_is_admin() then raise exception 'Réservé à l’administrateur'; end if;
  if char_length(v_motif) < 3 then raise exception 'Indique le motif du retrait'; end if;
  if char_length(v_motif) > 300 then raise exception 'Le motif fait au plus 300 caractères'; end if;
  select * into e from hg_weekly_challenge_entries where id = p_entry;
  if not found then raise exception 'Participation introuvable'; end if;
  select * into c from hg_weekly_challenges where id = e.challenge_id for update;
  execute 'de' || 'lete from public.hg_weekly_challenge_entries where id = $1' using e.id;
  perform hg_wch__notif(e.user_id, 'Participation retirée',
    'Ta participation au challenge « ' || c.title || ' » a été retirée par l’admin. Motif : ' || v_motif, true);
  insert into hg_admin_log (admin_id, action, target_user, target_ref, details)
    values (auth.uid(), 'challenge_retrait', e.user_id, 'challenge:' || c.id::text, jsonb_build_object('entry', e.id, 'motif', v_motif));
  return e.path;
end $$;

/* Challenge sans voix (phase « attente ») : p_entry = la participation choisie (gagnant, Paillettes versées), null = sans gagnant. */
create or replace function public.hg_wch_admin_pick(p_challenge uuid, p_entry uuid)
returns void language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c hg_weekly_challenges; e hg_weekly_challenge_entries;
begin
  if not hg_is_admin() then raise exception 'Réservé à l’administrateur'; end if;
  select * into c from hg_weekly_challenges where id = p_challenge for update;
  if not found then raise exception 'Challenge introuvable'; end if;
  if hg_wch_phase(c) <> 'attente' then raise exception 'Ce challenge n’attend pas de choix de l’admin'; end if;
  if p_entry is null then
    update hg_weekly_challenges set no_winner = true where id = c.id;
  else
    select * into e from hg_weekly_challenge_entries where id = p_entry and challenge_id = c.id;
    if not found then raise exception 'Participation introuvable dans ce challenge'; end if;
    insert into hg_weekly_challenge_winners (challenge_id, user_id, entry_id, votes, chosen_by_admin)
      values (c.id, e.user_id, e.id, 0, true) on conflict do nothing;
    perform hg_wch__payer(c.id);
  end if;
  perform hg_wch__annoncer(c.id);
  insert into hg_admin_log (admin_id, action, target_user, target_ref, details)
    values (auth.uid(), 'challenge_choix', e.user_id, 'challenge:' || c.id::text, jsonb_build_object('entry', p_entry));
end $$;

/* Fichiers du bucket sans participation, envoyés il y a plus d'un jour (participation retirée, purgée, compte supprimé, envoi
   abandonné) : le panel les retire par l'API de stockage, SQL ne pouvant pas les effacer. Au plus p_limite (1 à 1000). */
create or replace function public.hg_wch_admin_orphelins(p_limite int default 500)
returns text[] language plpgsql stable security definer set search_path = public, storage, pg_temp as $$
begin
  if not hg_is_admin() then raise exception 'Réservé à l’administrateur'; end if;
  return (select coalesce(array_agg(x.name), array[]::text[]) from (
    select o.name from storage.objects o
     where o.bucket_id = 'hg-challenges' and o.created_at < now() - interval '1 day'
       and not exists (select 1 from public.hg_weekly_challenge_entries e where e.path = o.name)
     order by o.created_at limit least(greatest(coalesce(p_limite, 500), 1), 1000)) x);
end $$;

revoke all on function public.hg_wch_admin_list(), public.hg_wch_admin_detail(uuid), public.hg_wch_admin_remove(uuid, text),
  public.hg_wch_admin_pick(uuid, uuid), public.hg_wch_admin_orphelins(int) from public, anon;
grant execute on function public.hg_wch_admin_list(), public.hg_wch_admin_detail(uuid), public.hg_wch_admin_remove(uuid, text),
  public.hg_wch_admin_pick(uuid, uuid), public.hg_wch_admin_orphelins(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Passage planifié
-- ---------------------------------------------------------------------------
/*
 * Toutes les 10 minutes (pg_cron) : 1. participation finie → vote_notified_at, et les participants sont prévenus si le vote
 * est encore ouvert et compte au moins deux participants ; 2. vote fini → dépouillement (closed_at) : la ou les participations
 * avec le plus de voix gagnent (un membre une seule fois : sa participation la plus ancienne), gain versé, résultat annoncé ;
 * aucune voix → « attente », les admins sont prévenus ; aucune participation → clos sans gagnant ; 3. gagnants pas encore
 * payés (reprise après une erreur) → payés. Idempotent : chaque étape est marquée, et hg_wallet_add ne verse qu'une fois par réf.
 */
create or replace function public.hg_wch_tick()
returns jsonb language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c hg_weekly_challenges;
  r record;
  v_max int;
  v_n int;
  v_votes int := 0;
  v_clos int := 0;
  v_payes int := 0;
begin
  for c in select * from hg_weekly_challenges where cancelled_at is null and vote_notified_at is null and ends_at <= now()
            order by ends_at for update skip locked loop
    update hg_weekly_challenges set vote_notified_at = now() where id = c.id;
    if now() < c.vote_ends_at and (select count(distinct e.user_id) from hg_weekly_challenge_entries e where e.challenge_id = c.id) >= 2 then
      for r in select distinct e.user_id from hg_weekly_challenge_entries e where e.challenge_id = c.id loop
        perform hg_wch__notif(r.user_id, 'Le vote est ouvert : « ' || c.title || ' »',
          'Découvre les participations (anonymes) et vote pour ta préférée, jusqu’à la fin du vote.');
      end loop;
      v_votes := v_votes + 1;
    end if;
  end loop;

  for c in select * from hg_weekly_challenges where cancelled_at is null and closed_at is null and vote_ends_at <= now()
            order by vote_ends_at for update skip locked loop
    select count(*), max(x.n) into v_n, v_max from (
      select e.id, (select count(*) from hg_weekly_challenge_votes v where v.entry_id = e.id)::int as n
        from hg_weekly_challenge_entries e where e.challenge_id = c.id) x;
    if v_n = 0 then
      update hg_weekly_challenges set closed_at = now(), no_winner = true where id = c.id;
    elsif coalesce(v_max, 0) = 0 then
      update hg_weekly_challenges set closed_at = now() where id = c.id;
      for r in select p.id from hg_profiles p where p.is_admin loop
        perform hg_wch__notif(r.id, 'Challenge sans voix : « ' || c.title || ' »',
          'Personne n’a voté. Choisis le gagnant, ou clos le challenge sans gagnant, dans La Fabrique.', true);
      end loop;
    else
      insert into hg_weekly_challenge_winners (challenge_id, user_id, entry_id, votes, chosen_by_admin)
        select distinct on (x.user_id) c.id, x.user_id, x.id, x.n, false
          from (select e.id, e.user_id, e.created_at, (select count(*) from hg_weekly_challenge_votes v where v.entry_id = e.id)::int as n
                  from hg_weekly_challenge_entries e where e.challenge_id = c.id) x
         where x.n = v_max order by x.user_id, x.created_at, x.id
        on conflict do nothing;
      update hg_weekly_challenges set closed_at = now() where id = c.id;
      v_payes := v_payes + hg_wch__payer(c.id);
      perform hg_wch__annoncer(c.id);
    end if;
    v_clos := v_clos + 1;
  end loop;

  for r in select distinct w.challenge_id from hg_weekly_challenge_winners w where w.credited_at is null loop
    v_payes := v_payes + hg_wch__payer(r.challenge_id);
  end loop;

  return jsonb_build_object('votes_ouverts', v_votes, 'clos', v_clos, 'payes', v_payes);
end $$;
revoke all on function public.hg_wch_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'hg-wch-tick') then perform cron.unschedule('hg-wch-tick'); end if;
    perform cron.schedule('hg-wch-tick', '*/10 * * * *', 'select public.hg_wch_tick()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 8. Page, notifications
-- ---------------------------------------------------------------------------
-- Page /pages/compte/challenge.html : ouverte aux membres, dans le menu (rangée dans « Autres », aucun autre menu ne la place).
insert into public.hg_pages (slug, label, mode, in_nav, sort) values ('challenge', 'Challenge de la semaine', 'membres', true, 15)
on conflict (slug) do nothing;

-- Reprise de la migration 205 (version en ligne) : clé « challenges.site » ajoutée à la liste blanche, pour couper les
-- notifications des challenges (vote ouvert, résultat) depuis Mon compte. Le retrait d'une participation est toujours notifié.
create or replace function public.hg_set_notif_prefs(p_prefs jsonb, p_quiet_start int default null, p_quiet_end int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed text[] := array[
    'messages.push', 'messages.discord', 'sorties.push', 'sorties.discord', 'echanges.push', 'echanges.discord',
    'souhaits.push', 'souhaits.discord', 'santa.push', 'santa.discord', 'anniversaires.push', 'anniversaires.discord',
    'quiz.push', 'quiz.discord', 'jeux.push', 'jeux.discord', 'carte_proposee.site', 'tours.push', 'tours.discord', 'anniversaires.site',
    'challenges.site'];
  v_key text;
  v_val jsonb;
  v_row public.hg_notif_prefs;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not exists (select 1 from public.hg_profiles where id = v_uid) then raise exception 'Profil introuvable' using errcode = '42501'; end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then raise exception 'Préférences invalides' using errcode = '22023'; end if;
  if octet_length(p_prefs::text) > 2000 then raise exception 'Préférences trop longues' using errcode = '22023'; end if;
  for v_key, v_val in select key, value from jsonb_each(p_prefs) loop
    if not (v_key = any (v_allowed)) then raise exception 'Catégorie inconnue : %', left(v_key, 40) using errcode = '22023'; end if;
    if jsonb_typeof(v_val) <> 'boolean' then raise exception 'Valeur invalide pour %', v_key using errcode = '22023'; end if;
  end loop;
  if (p_quiet_start is null) <> (p_quiet_end is null) then raise exception 'Heures calmes incomplètes' using errcode = '22023'; end if;
  if p_quiet_start is not null and (p_quiet_start not between 0 and 23 or p_quiet_end not between 0 and 23 or p_quiet_start = p_quiet_end) then
    raise exception 'Heures calmes invalides (0 à 23, début différent de la fin)' using errcode = '22023';
  end if;

  insert into public.hg_notif_prefs as n (user_id, prefs, quiet_start, quiet_end, updated_at)
  values (v_uid, p_prefs, p_quiet_start, p_quiet_end, now())
  on conflict (user_id) do update set prefs = excluded.prefs, quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end, updated_at = now()
  returning * into v_row;

  -- Colonnes encore lues par les fonctions edge (rappels de sortie, alerte de souhait)
  update public.hg_profiles set
    remind_irl = coalesce((p_prefs ->> 'sorties.discord')::boolean, remind_irl),
    notify_card_wish = coalesce((p_prefs ->> 'souhaits.discord')::boolean, notify_card_wish)
  where id = v_uid
    and (remind_irl is distinct from coalesce((p_prefs ->> 'sorties.discord')::boolean, remind_irl)
      or notify_card_wish is distinct from coalesce((p_prefs ->> 'souhaits.discord')::boolean, notify_card_wish));

  return jsonb_build_object('prefs', v_row.prefs, 'quiet_start', v_row.quiet_start, 'quiet_end', v_row.quiet_end, 'updated_at', v_row.updated_at);
end $$;
comment on function public.hg_set_notif_prefs(jsonb, int, int) is 'Enregistre les notifications par catégorie du membre connecté (liste blanche, heures 0 à 23). Migrations 095, 122 (catégorie « jeux »), 193 (carte_proposee.site), 200 (catégorie « tours »), 205 (anniversaires.site) et 218 (challenges.site).';
revoke all on function public.hg_set_notif_prefs(jsonb, int, int) from public, anon;
grant execute on function public.hg_set_notif_prefs(jsonb, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Export (reprise de la 216, version en ligne : seule la clé « challenges » s'ajoute)
-- ---------------------------------------------------------------------------
create or replace function public.hg_export_my_data()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
select jsonb_build_object(
  'profil', (select to_jsonb(p) from hg_profiles p where id = auth.uid()),
  'infos_profil', (select to_jsonb(x) from hg_profile_info x where user_id = auth.uid()),
  'secret_santa_participations', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_ss_participants x where user_id = auth.uid()),
  'souhaits', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_ss_wishes x where user_id = auth.uid()),
  'reponses_irl', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_event_rsvps x where user_id = auth.uid()),
  'sorties_creees', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_events x where created_by = auth.uid()),
  'votes_dates', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_event_date_votes x where user_id = auth.uid()),
  'photos', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_photos x where user_id = auth.uid()),
  'moments_crees', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_moments x where created_by = auth.uid()),
  'messages_envoyes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from hg_messages x where sender_id = auth.uid()),
  -- 216 : ses réactions (message, émoji, date).
  'reactions_messages', (select coalesce(jsonb_agg(jsonb_build_object('message', x.message_id, 'emoji', x.emoji, 'le', x.created_at)
      order by x.created_at), '[]') from hg_message_reactions x where x.user_id = auth.uid()),
  'conversations', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_conversation_members x where user_id = auth.uid()),
  'idees', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_ideas x where user_id = auth.uid()),
  'assistance', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_support x where user_id = auth.uid()),
  'badges', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_user_badges x where user_id = auth.uid()),
  'captures_evenements', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_dyn_captures x where user_id = auth.uid()),
  'cartes_anniversaire_mots', (select coalesce(jsonb_agg(jsonb_build_object('carte', m.carte_id, 'pour', p.pseudo, 'jour', c.jour,
      'texte', m.texte, 'ecrit_le', m.created_at, 'modifie_le', m.updated_at) order by c.jour, m.carte_id), '[]')
      from hg_cartes_anniv_mots m join hg_cartes_anniv c on c.id = m.carte_id left join hg_profiles p on p.id = c.fete_id
     where m.auteur_id = auth.uid()),
  -- 216 : ses cartes reçues, à partir du jour J seulement (avant, la personne fêtée ne voit rien : règle de hg_carte_anniv).
  'cartes_anniversaire_recues', (select coalesce(jsonb_agg(jsonb_build_object('carte', c.id, 'jour', c.jour, 'ouverte_le', c.ouverte_at,
      'mots', (select coalesce(jsonb_agg(jsonb_build_object('de', p.pseudo, 'texte', m.texte, 'ecrit_le', m.created_at, 'modifie_le', m.updated_at)
                 order by m.created_at), '[]') from hg_cartes_anniv_mots m left join hg_profiles p on p.id = m.auteur_id where m.carte_id = c.id))
      order by c.jour), '[]')
      from hg_cartes_anniv c where c.fete_id = auth.uid() and c.jour <= (now() at time zone 'Europe/Zurich')::date),
  -- 216 : jeux (jokers payants, parties pour l'honneur, passages de spectateur).
  'jeux', jsonb_build_object(
    'jokers', (select coalesce(jsonb_agg(jsonb_build_object('jeu', x.jeu, 'jour', x.day, 'prix', x.prix, 'serie', x.serie, 'le', x.created_at)
        order by x.day), '[]') from hg_jeux_jokers x where x.user_id = auth.uid()),
    'parties_honneur', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.debut), '[]') from hg_jeux_honneur x where x.user_id = auth.uid()),
    'spectateur', (select coalesce(jsonb_agg(jsonb_build_object('partie', x.partie, 'jeu', x.jeu, 'vu_le', x.vu_at) order by x.vu_at), '[]')
        from hg_spect_vus x where x.user_id = auth.uid())
  ),
  -- 218 : challenges de la semaine (ses participations, sa voix par challenge, ses gains). Jamais les voix des autres.
  'challenges', jsonb_build_object(
    'participations', (select coalesce(jsonb_agg(jsonb_build_object('challenge', c.id, 'titre', c.title, 'fichier', e.path,
        'nom_fichier', e.file_name, 'type', e.mime, 'taille', e.size, 'texte', e.body, 'legende', e.caption, 'le', e.created_at)
        order by e.created_at), '[]') from hg_weekly_challenge_entries e join hg_weekly_challenges c on c.id = e.challenge_id
       where e.user_id = auth.uid()),
    'voix', (select coalesce(jsonb_agg(jsonb_build_object('challenge', c.id, 'titre', c.title, 'participation', v.entry_id, 'le', v.updated_at)
        order by v.updated_at), '[]') from hg_weekly_challenge_votes v join hg_weekly_challenges c on c.id = v.challenge_id
       where v.voter_id = auth.uid()),
    'gains', (select coalesce(jsonb_agg(jsonb_build_object('challenge', c.id, 'titre', c.title, 'participation', w.entry_id, 'voix', w.votes,
        'choisi_par_admin', w.chosen_by_admin, 'paillettes', c.reward_paillettes, 'lot', c.reward_text, 'verse_le', w.credited_at)
        order by w.created_at), '[]') from hg_weekly_challenge_winners w join hg_weekly_challenges c on c.id = w.challenge_id
       where w.user_id = auth.uid())
  ),
  'jeu_de_cartes', jsonb_build_object(
    'portefeuille', (select to_jsonb(w) from hg_wallets w where user_id = auth.uid()),
    'journal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from hg_wallet_log x where user_id = auth.uid()),
    'exemplaires', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_copies x where owner_id = auth.uid()),
    'echanges', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_trades x where from_user = auth.uid() or to_user = auth.uid()),
    'liste_souhaits', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_wishlist x where user_id = auth.uid()),
    'vitrine', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_showcase x where user_id = auth.uid()),
    -- 216 : enchères entre membres où il est vendeur ou acheteur (sans l'autre membre), ses offres, ses défis réussis.
    'encheres', (select coalesce(jsonb_agg(jsonb_build_object('enchere', a.id, 'role', case when a.seller = auth.uid() then 'vendeur' else 'acheteur' end,
        'carte', k.name, 'exemplaire', a.copy_id, 'statut', a.status, 'duree_min', a.duree_min, 'mise_depart', a.min_bid,
        'prix', a.price, 'frais', a.fee, 'debut', a.starts_at, 'fin', a.ends_at, 'close_le', a.closed_at) order by a.created_at), '[]')
        from hg_card_member_auctions a left join hg_cards k on k.id = a.card_id
       where a.seller = auth.uid() or a.winner = auth.uid()),
    'offres_encheres', (select coalesce(jsonb_agg(jsonb_build_object('enchere', b.auction_id, 'montant', b.amount, 'le', b.created_at,
        'remboursee_le', b.refunded_at) order by b.id), '[]') from hg_card_member_bids b where b.user_id = auth.uid()),
    'defis_collection', (select coalesce(jsonb_agg(to_jsonb(x) - 'user_id' order by x.week), '[]') from hg_quest_defi_claims x where x.user_id = auth.uid())
  )
);
$function$;
revoke all on function public.hg_export_my_data() from public, anon;
grant execute on function public.hg_export_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Purges (reprise de la 216 : trois tables de plus, 12 mois après la fin du challenge)
-- ---------------------------------------------------------------------------
/*
 * Un passage de purge. p_mode : 'apercu' (compte sans supprimer), 'nuit' (tâche planifiée), 'main' (bouton admin).
 * Rend { plafond, journal_jours, coups_jours, notifs_jours, tables: { <table>: n } } : lignes concernées (aperçu, sans plafond) ou supprimées.
 * 216 : spectateurs vus 30 jours ; offres puis enchères entre membres closes depuis 12 mois (les offres d'abord : clé
 * étrangère) ; mots puis cartes d'anniversaire 12 mois après le jour fêté ; jokers payants de plus de 12 mois dont la
 * série est cassée depuis (un jour ni joué ni racheté entre le joker et avant-hier, deux de suite pour la Question du
 * jour, que le joker gratuit de la semaine peut couvrir ; les trois derniers jours ne comptent pas, un rachat y est encore possible).
 * 218 : voix, gagnants puis participations des challenges de la semaine finis (dépouillés ou annulés) depuis 12 mois ; le
 * challenge lui-même reste (titre, dates, gain). Les fichiers deviennent orphelins : hg_wch_admin_orphelins les liste au panel.
 * Sans contrôle de droit : fermée aux comptes, appelée seulement par les fonctions de la migration 192.
 */
create or replace function public.hg_entretien__passage(p_mode text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot constant int := 50000;
  v_notifs_jours constant int := 90;
  v_spect_jours constant int := 30;
  v_d jsonb := public.hg_entretien__durees();
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
  v_sel text;
  v_tables jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_n bigint;
  t record;
begin
  if p_mode is null or p_mode not in ('apercu', 'nuit', 'main') then raise exception 'Mode de purge inconnu'; end if;

  for t in select * from (values
      ('job_run_details', 'cron.job_run_details', 'runid', null),
      ('hg_plat_coups', 'public.hg_plat_coups', 'id', 'public.hg_plat_parties'),
      ('hg_uno_coups', 'public.hg_uno_coups', 'id', 'public.hg_uno_parties'),
      ('hg_duel_coups', 'public.hg_duel_coups', 'id', 'public.hg_duel_parties'),
      ('hg_ndc_coups', 'public.hg_ndc_coups', 'id', 'public.hg_ndc_parties'),
      ('hg_site_notifs', 'public.hg_site_notifs', 'id', null),
      ('hg_spect_vus', 'public.hg_spect_vus', 'ctid', null),
      ('hg_card_member_bids', 'public.hg_card_member_bids', 'id', 'public.hg_card_member_auctions'),
      ('hg_card_member_auctions', 'public.hg_card_member_auctions', 'id', null),
      ('hg_cartes_anniv_mots', 'public.hg_cartes_anniv_mots', 'ctid', 'public.hg_cartes_anniv'),
      ('hg_cartes_anniv', 'public.hg_cartes_anniv', 'id', null),
      ('hg_jeux_jokers', 'public.hg_jeux_jokers', 'ctid', null),
      ('hg_weekly_challenge_votes', 'public.hg_weekly_challenge_votes', 'ctid', 'public.hg_weekly_challenges'),
      ('hg_weekly_challenge_winners', 'public.hg_weekly_challenge_winners', 'ctid', 'public.hg_weekly_challenges'),
      ('hg_weekly_challenge_entries', 'public.hg_weekly_challenge_entries', 'id', 'public.hg_weekly_challenges')) as x(cle, cible, pk, parties) loop
    if to_regclass(t.cible) is null or (t.parties is not null and to_regclass(t.parties) is null) then continue; end if;

    if t.cle = 'hg_site_notifs' then
      v_sel := format('select l.%I from %s l where l.created_at < now() - make_interval(days => %s)', t.pk, t.cible, v_notifs_jours);
    elsif t.cle = 'hg_spect_vus' then
      v_sel := format('select l.%I from %s l where l.vu_at < now() - make_interval(days => %s)', t.pk, t.cible, v_spect_jours);
    elsif t.cle = 'hg_card_member_bids' then
      v_sel := format($f$select l.%I from %s l join %s a on a.id = l.auction_id
        where a.status <> 'ouverte' and a.closed_at < now() - interval '12 months'$f$, t.pk, t.cible, t.parties);
    elsif t.cle = 'hg_card_member_auctions' then
      v_sel := format($f$select l.%I from %s l where l.status <> 'ouverte' and l.closed_at < now() - interval '12 months'
        and not exists (select 1 from public.hg_card_member_bids b where b.auction_id = l.id)$f$, t.pk, t.cible);
    elsif t.cle = 'hg_cartes_anniv_mots' then
      v_sel := format($f$select l.%I from %s l join %s c on c.id = l.carte_id where c.jour < %L::date - interval '12 months'$f$,
        t.pk, t.cible, t.parties, v_auj);
    elsif t.cle = 'hg_cartes_anniv' then
      v_sel := format($f$select l.%I from %s l where l.jour < %L::date - interval '12 months'$f$, t.pk, t.cible, v_auj);
    elsif t.cle = 'hg_jeux_jokers' then
      v_sel := format($f$select l.%I from %s l where l.day < %L::date - interval '12 months'
        and exists (select 1 from generate_series(l.day + 1, %L::date - 3, interval '1 day') g(x)
                     where not public.hg_entretien__jour_couvert(l.jeu, l.user_id, g.x::date)
                       and (l.jeu <> 'quiz_jour' or (g.x::date < %L::date - 3 and not public.hg_entretien__jour_couvert(l.jeu, l.user_id, g.x::date + 1))))$f$,
        t.pk, t.cible, v_auj, v_auj, v_auj);
    elsif t.cle like 'hg_weekly_challenge_%' then
      -- 218 : challenge fini (annulé, ou dépouillé) depuis 12 mois.
      v_sel := format($f$select l.%I from %s l join %s c on c.id = l.challenge_id
        where coalesce(c.cancelled_at, c.closed_at) < now() - interval '12 months'$f$, t.pk, t.cible, t.parties);
    elsif t.parties is null then
      -- end_time reste vide si le serveur a redémarré pendant la tâche : on se rabat sur start_time.
      v_sel := format('select l.%I from %s l where coalesce(l.end_time, l.start_time) < now() - make_interval(days => %s)',
        t.pk, t.cible, (v_d ->> 'journal_jours')::int);
    else
      v_sel := format($f$select l.%I from %s l join %s p on p.id = l.partie
        where p.statut = 'terminee' and p.ended_at < now() - make_interval(days => %s)$f$, t.pk, t.cible, t.parties, (v_d ->> 'coups_jours')::int);
    end if;

    if p_mode = 'apercu' then
      execute format('select count(*) from (%s) s', v_sel) into v_n;
    else
      execute format('de' || 'lete from %s where %I in (%s limit %s)', t.cible, t.pk, v_sel, v_lot);
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
    end if;
    v_tables := v_tables || jsonb_build_object(t.cle, v_n);
  end loop;

  if p_mode <> 'apercu' then
    perform public.hg_entretien__ecrire(jsonb_build_object('dernier',
      jsonb_build_object('at', now(), 'mode', p_mode, 'lignes', v_total)));
  end if;
  return v_d || jsonb_build_object('plafond', v_lot, 'notifs_jours', v_notifs_jours, 'tables', v_tables);
end $$;

-- Fonction interne : reste fermée aux comptes.
revoke all on function public.hg_entretien__passage(text) from public, anon, authenticated;
