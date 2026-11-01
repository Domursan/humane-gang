-- Échanges de cartes : expiration des offres sans réponse (idée 53) et alerte « une carte de ta liste est proposée » (idée 54).
-- À appliquer après 192 (hg_entretien__duree).
--
-- Expiration :
--   Statut « expiree » dans hg_card_trades, colonnes expire_le (échéance) et preavis_at (préavis parti).
--   expire_le est posée à la création par la valeur par défaut de la colonne, y compris pour une contre-proposition, qui est une offre
--   neuve (hg_trade_propose ne change donc pas). Un don reçoit aussi cette valeur : elle ne sert à rien, son statut n'est pas « proposee ».
--   Réglage cards.trade_expiry_days : 7 jours par défaut, de 1 à 60. Une valeur illisible vaut 7. Changer le délai ne vaut que pour les
--   nouvelles offres : l'échéance est écrite une fois pour toutes. Les offres ouvertes à l'activation ont 7 jours à partir de maintenant.
--   Le passage ferme une offre comme hg_trade_cancel : même verrouillage, cartes libérées. Rien d'autre n'en dépend : les compteurs lisent
--   le statut « proposee », et une offre liée (parent_id) a déjà été remplacée au moment de la contre-proposition.
--   Une offre échue reste acceptable jusqu'au passage suivant (au plus une heure).
--   Pas de préavis pour une offre dont la durée de vie ne dépasse pas 24 h (délai réglé à 1 jour) : il partirait dès sa création.
--
-- Alerte :
--   Seul le tableau d'échanges déclenche l'alerte, jamais une offre entre deux membres, qui reste privée. Il n'y a pas d'acte « mettre au
--   tableau » : une carte y est quand un membre inscrit en a au moins deux exemplaires dont un libre (règle de hg_trade_board).
--   hg_tableau_mises garde donc ce qui y est déjà ; une ligne nouvelle est une mise au tableau, et elle n'alerte qu'une fois.
--   Elle reste tant que le membre est inscrit avec au moins deux exemplaires : une carte bloquée le temps d'une offre, puis rendue,
--   n'alerte pas de nouveau. Ce qui est au tableau à l'activation est noté sans alerte.
--   Le plafond (3 par jour et par destinataire, jour de Zurich) est compté dans hg_tableau_alertes, pas dans hg_site_notifs où le membre
--   peut supprimer ses notifications. Une alerte au-delà de 3 par jour est perdue, sans report au lendemain.
--   La préférence carte_proposee.site est activée par défaut.
--   Le membre qui s'inscrit au tableau déclenche l'alerte tout de suite, pour ses seules cartes. Un nouveau double d'un inscrit attend
--   le passage horaire.
--
-- Notifications écrites directement dans hg_site_notifs : hg_site_notif ne garde pas un lien qui part de la racine du site, et la base
-- ne connaît pas l'adresse du site. Les catégories sont celles du panneau : « echanges » (Échange) et « souhaits » (Cartes).
-- Tâche pg_cron hg-echanges-hourly : aucune clé, aucun appel réseau. Rejouable.

-- =====================================================================
-- 1. Offres : statut, échéance, préavis
-- =====================================================================
alter table public.hg_card_trades drop constraint if exists hg_card_trades_status_check;
alter table public.hg_card_trades add constraint hg_card_trades_status_check
  check (status in ('proposee', 'acceptee', 'refusee', 'annulee', 'remplacee', 'expiree'));

alter table public.hg_card_trades add column if not exists expire_le timestamptz;
alter table public.hg_card_trades add column if not exists preavis_at timestamptz;
comment on column public.hg_card_trades.expire_le is 'Échéance d''une offre « proposee » : sans réponse, elle passe à « expiree » (migration 193).';
comment on column public.hg_card_trades.preavis_at is 'Préavis de 24 h envoyé aux deux membres : une seule fois par offre (migration 193).';

-- Offres déjà ouvertes : 7 jours à partir de maintenant. Avant la valeur par défaut, pour ne remplir aucune offre fermée.
update public.hg_card_trades set expire_le = now() + interval '7 days' where status = 'proposee' and expire_le is null;

/* Échéance d'une offre créée maintenant, selon le réglage du moment. */
create or replace function public.hg_trade__echeance()
returns timestamptz language sql stable security definer set search_path = public, pg_temp as $$
  select now() + make_interval(days => public.hg_entretien__duree(public.hg_card_cfg() -> 'trade_expiry_days', '{"defaut": 7, "min": 1, "max": 60}'::jsonb))
$$;

alter table public.hg_card_trades alter column expire_le set default public.hg_trade__echeance();
create index if not exists hg_card_trades_echeance_idx on public.hg_card_trades (expire_le) where status = 'proposee';

/* Le site ne dépasse pas les bornes du délai : même contrôle que hg_settings_bounds, dans un déclencheur à part. */
create or replace function public.hg_settings_bounds_echanges()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v jsonb := new.value -> 'trade_expiry_days';
begin
  if current_user not in ('authenticated', 'anon') or new.key <> 'cards' or v is null or jsonb_typeof(v) = 'null' then return new; end if;
  if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> trunc((v #>> '{}')::numeric) or (v #>> '{}')::numeric not between 1 and 60 then
    raise exception 'Réglage « cards.trade_expiry_days » : un nombre entier entre 1 et 60 est attendu.';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'hg_settings_bounds_echanges' and tgrelid = 'public.hg_settings'::regclass) then
    create trigger hg_settings_bounds_echanges before insert or update on public.hg_settings
      for each row execute function public.hg_settings_bounds_echanges();
  end if;
end $$;

-- =====================================================================
-- 2. Tableau : ce qui y est déjà, plafond des alertes
-- =====================================================================
create table if not exists public.hg_tableau_mises (
  card_id uuid not null,
  owner_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (card_id, owner_id)
);
comment on table public.hg_tableau_mises is 'Cartes déjà mises au tableau d''échanges, par membre : une ligne nouvelle alerte une fois (migration 193). Le passage retire les lignes périmées, y compris d''un compte supprimé.';

create table if not exists public.hg_tableau_alertes (
  user_id uuid not null,
  jour date not null,
  n int not null default 0,
  primary key (user_id, jour)
);
comment on table public.hg_tableau_alertes is 'Alertes « carte de ta liste proposée » envoyées par destinataire et par jour de Zurich (migration 193). Gardées deux jours.';

alter table public.hg_tableau_mises enable row level security;
alter table public.hg_tableau_alertes enable row level security;
revoke all on public.hg_tableau_mises, public.hg_tableau_alertes from public, anon, authenticated;

/* Doubles des membres inscrits, selon la règle de hg_trade_board : n exemplaires vivants, dont « libres » ni bloqués ni en vitrine. */
create or replace function public.hg_tableau__doubles(p_owner uuid default null)
returns table (card_id uuid, owner_id uuid, n int, libres int)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.card_id, c.owner_id, count(*)::int,
         count(*) filter (where c.locked_trade is null and not exists (select 1 from hg_card_showcase s where s.copy_id = c.id))::int
    from hg_card_copies c
    join hg_profiles p on p.id = c.owner_id and p.trade_board and not p.is_ghost
    join hg_cards k on k.id = c.card_id and k.active and k.tradeable and k.rarity not in ('identite', 'unique')
   where c.recycled_at is null and (p_owner is null or c.owner_id = p_owner)
   group by c.card_id, c.owner_id
  having count(*) >= 2
$$;

/*
 * Note ce qui vient d'arriver au tableau et prévient ceux qui ont la carte dans leur liste, sauf le membre qui la propose, sans le nommer.
 * p_owner : les cartes d'un seul membre (inscription), null pour tout le tableau. Rend le nombre d'alertes écrites.
 */
create or replace function public.hg_tableau__alertes(p_owner uuid default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plafond constant int := 3;
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
  v_passe int;
  v_rarete text;
  v_n int := 0;
  r record;
begin
  delete from hg_tableau_mises m
   where (p_owner is null or m.owner_id = p_owner)
     and not exists (select 1 from hg_tableau__doubles(p_owner) d where d.card_id = m.card_id and d.owner_id = m.owner_id);

  for r in
    with neuves as (
      insert into hg_tableau_mises (card_id, owner_id)
      select d.card_id, d.owner_id from hg_tableau__doubles(p_owner) d where d.libres >= 1
      on conflict do nothing
      returning card_id, owner_id
    )
    -- Deux membres qui proposent la même carte au même passage : une seule alerte.
    select distinct on (w.user_id, k.id) w.user_id, k.name, k.rarity
      from neuves x
      join hg_card_wishlist w on w.card_id = x.card_id and w.user_id <> x.owner_id
      join hg_profiles p on p.id = w.user_id and not p.is_ghost
      join hg_cards k on k.id = x.card_id
     where public.hg_notif_allowed(w.user_id, 'carte_proposee', 'site')
     order by w.user_id, k.id
  loop
    insert into hg_tableau_alertes as a (user_id, jour, n) values (r.user_id, v_jour, 1)
      on conflict (user_id, jour) do update set n = a.n + 1 where a.n < v_plafond;
    get diagnostics v_passe = row_count;
    if v_passe = 0 then continue; end if;
    v_rarete := public.hg_rarity_label(r.rarity); -- en minuscules dans la base
    insert into hg_site_notifs (user_id, cat, titre, texte, lien)
      values (r.user_id, 'souhaits', 'Une carte de ta liste est proposée',
        left(r.name || ' (' || upper(left(v_rarete, 1)) || substr(v_rarete, 2) || ') vient d’arriver sur le tableau d’échanges.', 1000),
        '/pages/cartes/cartes.html#echanges/tableau');
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- Ce qui est déjà au tableau ne provoque aucune alerte à l'activation.
insert into public.hg_tableau_mises (card_id, owner_id)
  select d.card_id, d.owner_id from public.hg_tableau__doubles(null) d where d.libres >= 1
  on conflict do nothing;

-- Reprise de la migration 081 : s'inscrire au tableau alerte aussitôt pour les cartes de ce membre.
create or replace function public.hg_trade_board_set(p_on boolean, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '\s+', ' ', 'g')), '');
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if v_note is not null and char_length(v_note) > 80 then raise exception 'Ton petit mot fait au plus 80 caractères'; end if;
  update hg_profiles set trade_board = coalesce(p_on, false), trade_board_note = v_note where id = auth.uid();
  if coalesce(p_on, false) then perform public.hg_tableau__alertes(auth.uid()); end if;
  return jsonb_build_object('on', coalesce(p_on, false), 'note', v_note);
end $$;

-- =====================================================================
-- 3. Préférence
-- =====================================================================
-- Reprise de la migration 122, une clé de plus dans la liste blanche.
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
    'quiz.push', 'quiz.discord', 'jeux.push', 'jeux.discord', 'carte_proposee.site'];
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
comment on function public.hg_set_notif_prefs(jsonb, int, int) is 'Enregistre les notifications par catégorie du membre connecté (liste blanche, heures 0 à 23). Migrations 095, 122 (catégorie « jeux ») et 193 (carte_proposee.site).';

-- =====================================================================
-- 4. Passage horaire
-- =====================================================================
/* « 2 nov. à 18 h 40 », à l'heure de Zurich. Même écriture que cartes-trades.js. */
create or replace function public.hg_echanges__date(p_quand timestamptz)
returns text language sql stable set search_path = public, pg_temp as $$
  select extract(day from z)::int || ' '
      || (array['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'])[extract(month from z)::int]
      || ' à ' || extract(hour from z)::int || ' h ' || to_char(z, 'MI')
    from (select p_quand at time zone 'Europe/Zurich' as z) s
$$;

/*
 * Ferme les offres échues, envoie les préavis, puis les alertes du tableau. Tâche pg_cron, fermée aux comptes.
 * Une offre verrouillée (réponse en cours) est sautée et reprise au passage suivant.
 */
create or replace function public.hg_echanges__passage()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_expirees int := 0;
  v_preavis int;
  v_alertes int;
  t record;
begin
  for t in select id from hg_card_trades where status = 'proposee' and expire_le <= now() order by id for update skip locked loop
    update hg_card_trades set status = 'expiree', resolved_at = now() where id = t.id;
    perform 1 from hg_card_copies where locked_trade = t.id order by id for update;
    update hg_card_copies set locked_trade = null where locked_trade = t.id;
    v_expirees := v_expirees + 1;
  end loop;

  with dues as (
    select id from hg_card_trades
     where status = 'proposee' and preavis_at is null and expire_le > now() and expire_le <= now() + interval '24 hours'
       and expire_le - created_at > interval '24 hours'
     order by id for update skip locked
  ), marquees as (
    update hg_card_trades o set preavis_at = now() from dues where o.id = dues.id
    returning o.from_user, o.to_user, o.expire_le
  ), notifs as (
    insert into hg_site_notifs (user_id, cat, titre, texte, lien)
    select n.user_id, 'echanges', n.titre || x.quand, 'Sans réponse, elle se ferme le ' || public.hg_echanges__date(m.expire_le) || '.',
           '/pages/cartes/cartes.html#echanges'
      from marquees m
      join hg_profiles a on a.id = m.from_user
      join hg_profiles b on b.id = m.to_user
      cross join lateral (select case when (m.expire_le at time zone 'Europe/Zurich')::date = (now() at time zone 'Europe/Zurich')::date
                                      then ' aujourd’hui' else ' demain' end as quand) x
      cross join lateral (values (m.from_user, 'Ton offre à ' || b.pseudo || ' expire'),
                                 (m.to_user, 'L’offre de ' || a.pseudo || ' expire')) n(user_id, titre)
    returning 1
  )
  select count(*) / 2 into v_preavis from notifs;

  v_alertes := public.hg_tableau__alertes(null);
  delete from hg_tableau_alertes where jour < (now() at time zone 'Europe/Zurich')::date - 1;
  return jsonb_build_object('expirees', v_expirees, 'preavis', v_preavis, 'alertes', v_alertes);
end $$;

-- =====================================================================
-- 5. Droits et planification
-- =====================================================================
-- Fonctions internes et du déclencheur : fermées aux comptes.
revoke all on function public.hg_trade__echeance() from public, anon, authenticated;
revoke all on function public.hg_settings_bounds_echanges() from public, anon, authenticated;
revoke all on function public.hg_tableau__doubles(uuid) from public, anon, authenticated;
revoke all on function public.hg_tableau__alertes(uuid) from public, anon, authenticated;
revoke all on function public.hg_echanges__date(timestamptz) from public, anon, authenticated;
revoke all on function public.hg_echanges__passage() from public, anon, authenticated;

-- Reprises : mêmes droits qu'avant.
revoke all on function public.hg_trade_board_set(boolean, text) from public, anon;
grant execute on function public.hg_trade_board_set(boolean, text) to authenticated;
revoke all on function public.hg_set_notif_prefs(jsonb, int, int) from public, anon;
grant execute on function public.hg_set_notif_prefs(jsonb, int, int) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'hg-echanges-hourly') then perform cron.unschedule('hg-echanges-hourly'); end if;
    perform cron.schedule('hg-echanges-hourly', '13 * * * *', 'select public.hg_echanges__passage()');
  end if;
end $$;
