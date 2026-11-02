-- ===== Humane Gang — migration 200 : notification « c'est ton tour » =====
-- Idée 2 du lot 3. Quand le jeu doit jouer pour un membre (premier tour manqué), le membre est prévenu pendant qu'il lui reste 2 tours.
--
-- Déclencheur : passage de hg_*_joueurs.manques de 0 à 1 sur les duels, le Uno et les plateaux. Aucune fonction de jeu n'est reprise.
-- Nom de code et Loup-Garou n'ont pas ces tables. Le placement de la bataille navale et le code du Mastermind ne comptent pas de tour
-- manqué, ils ne déclenchent donc rien. Si l'autre joueur ne joue pas, manques ne bouge pas et rien ne repart.
--
-- Plafonds : 1 par partie, 5 par jour (jour de Zurich, compté dans hg_tour_quota : le membre peut supprimer ses notifications).
-- Au-delà de 5, la notification est perdue, sans report au lendemain. Réarmement : hg_tour_rappels perd sa ligne quand le membre rejoue.
-- « Rejouer », c'est manques remis à 0 par le membre lui-même (auth.uid()), hors passage où le jeu vient de jouer pour lui : le Uno
-- remet manques à 0 puis le rétablit quand le robot pose une carte, et une nouvelle manche de Uno remet tout le monde à 0.
-- Aux plateaux, hg_plat__present retire aussi la ligne : un coup tardif arrive dans la transaction où le jeu vient de jouer pour le membre,
-- le déclencheur ne peut pas les distinguer, et hg_plat__present n'écrit plus rien aux coups suivants (manques déjà à 0).
--
-- Canaux, activés par défaut (clés tours.push et tours.discord de hg_notif_prefs, clé absente = oui) :
--   présent (signal de moins de 2 minutes) : notification du site seule, écrite ici, sans appel réseau ;
--   absent : notification du site, puis hg-push choisit le push s'il y a un appareil, sinon le MP.
-- Les deux canaux coupés : rien du tout, même sur le site. Heures calmes : pas de push ni de MP, la notification du site reste.
-- hg-push est appelée avec x-cron-secret, lu dans hg_private comme le fait hg_msg_push_trg : aucune clé dans ce fichier. hg-notify
-- exige le JWT d'un membre et ne convient pas. Le MP ne passe pas par copierAuxAdmins. Interrupteur admin : bot.notify.ton_tour.
-- Une erreur ici ne bloque jamais le jeu : le déclencheur la note en avertissement.
--
-- Ordre : cette migration avant le site, sinon hg_set_notif_prefs refuse les clés tours.* et Mon compte ne peut plus enregistrer.
-- Puis hg-push (avant son déploiement, l'appel est refusé en 400, sans effet sur le jeu). Rejouable.

create table if not exists public.hg_tour_rappels (
  partie uuid not null,
  user_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  maj_at timestamptz not null default now(),  -- dernier tour manqué connu pour ce membre dans cette partie
  primary key (partie, user_id)
);
create index if not exists hg_tour_rappels_user on public.hg_tour_rappels(user_id, maj_at);
alter table public.hg_tour_rappels enable row level security;
revoke all on public.hg_tour_rappels from public, anon, authenticated;
comment on table public.hg_tour_rappels is 'Parties où le membre a déjà été prévenu que c''est son tour (migration 200). Ligne retirée quand il rejoue. Aucun accès direct.';

create table if not exists public.hg_tour_quota (
  user_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  jour date not null,
  n int not null default 0,
  primary key (user_id, jour)
);
alter table public.hg_tour_quota enable row level security;
revoke all on public.hg_tour_quota from public, anon, authenticated;
comment on table public.hg_tour_quota is 'Notifications « c''est ton tour » du jour, par membre (migration 200, 5 au plus). Aucun accès direct.';

-- =====================================================================
-- 1. Préférences
-- =====================================================================
-- Reprise de la migration 193, deux clés de plus dans la liste blanche.
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
    'quiz.push', 'quiz.discord', 'jeux.push', 'jeux.discord', 'carte_proposee.site', 'tours.push', 'tours.discord'];
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
comment on function public.hg_set_notif_prefs(jsonb, int, int) is 'Enregistre les notifications par catégorie du membre connecté (liste blanche, heures 0 à 23). Migrations 095, 122 (catégorie « jeux »), 193 (carte_proposee.site) et 200 (catégorie « tours »).';

-- Reprise de la migration 095 : les heures calmes coupent aussi le MP de la catégorie « tours », et elle seule.
create or replace function public.hg_notif_allowed(p_user uuid, p_cat text, p_canal text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.hg_notif_prefs;
  v_hour int;
begin
  select * into v_row from public.hg_notif_prefs where user_id = p_user;
  if not found then return true; end if;
  if coalesce((v_row.prefs ->> (p_cat || '.' || p_canal))::boolean, true) = false then return false; end if;
  if (p_canal = 'push' or p_cat = 'tours') and v_row.quiet_start is not null then
    v_hour := extract(hour from (now() at time zone 'Europe/Zurich'))::int;
    if v_row.quiet_start < v_row.quiet_end then
      if v_hour >= v_row.quiet_start and v_hour < v_row.quiet_end then return false; end if;
    elsif v_hour >= v_row.quiet_start or v_hour < v_row.quiet_end then
      return false;
    end if;
  end if;
  return true;
end $$;
comment on function public.hg_notif_allowed(uuid, text, text) is 'Vrai si le membre accepte la catégorie sur ce canal (clé absente = oui ; heures calmes pour le push, et pour le MP de « tours »). Clé service seulement. Migrations 095 et 200.';

-- =====================================================================
-- 2. Envoi
-- =====================================================================
/*
 * Prévient p_user que le jeu vient de jouer pour lui dans cette partie. p_jeu : duel, uno ou plat.
 * Tient ses deux plafonds, écrit la notification du site et appelle hg-push si le membre est absent et joignable.
 * Sans contrôle de droit : fermée aux comptes, appelée seulement par hg_tour__trg.
 */
create or replace function public.hg_tour__signaler(p_jeu text, p_partie uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_plafond constant int := 5;
  v_jour date := (now() at time zone 'Europe/Zurich')::date;
  v_optin boolean;
  v_discord text;
  v_prefs jsonb;
  v_nom text;
  v_code text;
  v_jeu text;
  v_titre text;
  v_texte text;
  v_suite text;
  v_lien text;
  v_passe int;
  v_push boolean;
  v_mp boolean;
  v_absent boolean;
  v_secret text;
begin
  if (select value -> 'notify' ->> 'ton_tour' from hg_settings where key = 'bot') = 'false' then return; end if;
  select bot_optin, discord_id into v_optin, v_discord from hg_profiles where id = p_user and not coalesce(is_ghost, false);
  if not found then return; end if; -- invité sans compte ou compte fantôme
  select prefs into v_prefs from hg_notif_prefs where user_id = p_user;
  if v_prefs ->> 'tours.push' = 'false' and v_prefs ->> 'tours.discord' = 'false' then return; end if;

  if p_jeu = 'duel' then
    select p.code, public.hg_duel__jeu_nom(p.jeu, p.variante),
        (select j.pseudo from hg_duel_joueurs j where j.partie = p.id and j.user_id <> p_user limit 1)
      into v_code, v_jeu, v_nom from hg_duel_parties p where p.id = p_partie and p.statut = 'en_cours';
    if not found then return; end if;
    v_titre := v_jeu || ' contre ' || coalesce(v_nom, 'ton adversaire');
    v_texte := 'Le jeu a joué un coup pour toi.';
    v_suite := 'Encore 2 tours manqués et c’est le forfait.';
    v_lien := '/pages/jeux/duels.html#partie/' || v_code;
  elsif p_jeu = 'uno' then
    select p.code, p.nom into v_code, v_nom from hg_uno_parties p where p.id = p_partie and p.statut = 'en_cours';
    if not found then return; end if;
    v_titre := v_nom;
    v_texte := 'Le jeu a joué pour toi.';
    v_suite := 'Encore 2 tours manqués et tu quittes la table.';
    v_lien := '/pages/jeux/uno.html#partie/' || v_code;
  else
    select p.code, p.nom, case p.jeu when 'cluedo' then 'Cluedo' when 'shadow' then 'Shadow Hunters' when 'destins' then 'Destins'
          when 'monopoly' then 'Monopoly' when 'risk' then 'Risk' when 'blackjack' then 'Blackjack' when 'poker' then 'Poker'
          when 'catan' then 'Catan' when 'pictionary' then 'Pictionary' else 'Jeu de plateau' end,
        (select public.hg_plat__page(p.jeu))
      into v_code, v_nom, v_jeu, v_lien from hg_plat_parties p where p.id = p_partie and p.statut = 'en_cours';
    if not found then return; end if;
    -- Le nom par défaut contient déjà le jeu (« Partie de Catan ») ; un nom choisi par l'hôte ne le dit pas forcément.
    v_titre := case when position(lower(v_jeu) in lower(v_nom)) > 0 then v_nom else v_jeu || ' · ' || v_nom end;
    v_texte := 'Le jeu a joué pour toi.';
    v_suite := 'Encore 2 tours manqués et tu passes en mode absent.';
    v_lien := '/pages/jeux/' || v_lien || '.html#partie/' || v_code;
  end if;
  v_titre := 'À toi de jouer : ' || v_titre;

  -- Une ligne par partie : personne n'est prévenu deux fois tant qu'il n'a pas rejoué.
  delete from hg_tour_rappels where user_id = p_user and maj_at < now() - interval '2 days';
  insert into hg_tour_rappels (partie, user_id) values (p_partie, p_user) on conflict do nothing;
  get diagnostics v_passe = row_count;
  if v_passe = 0 then return; end if;

  delete from hg_tour_quota where user_id = p_user and jour < v_jour;
  insert into hg_tour_quota as q (user_id, jour, n) values (p_user, v_jour, 1)
    on conflict (user_id, jour) do update set n = q.n + 1 where q.n < v_plafond;
  get diagnostics v_passe = row_count;
  if v_passe = 0 then return; end if;

  v_absent := not hg_en_ligne_interne(p_user);
  v_push := v_absent and hg_notif_allowed(p_user, 'tours', 'push')
    and exists (select 1 from hg_push_subscriptions where user_id = p_user);
  v_mp := v_absent and coalesce(v_optin, false) and coalesce(v_discord ~ '^[0-9]{17,20}$', false) and hg_notif_allowed(p_user, 'tours', 'discord');

  -- Écrite directement : hg_site_notif ne garde pas un lien qui part de la racine du site (voir migration 193).
  insert into hg_site_notifs (user_id, cat, titre, texte, lien, par_discord)
    values (p_user, 'tours', left(v_titre, 200), v_texte || ' ' || v_suite, v_lien, v_mp and not v_push);

  if not (v_push or v_mp) then return; end if;
  select value into v_secret from hg_private where key = 'cron_secret';
  if v_secret is null or v_secret = '' then return; end if;
  perform net.http_post(
    url := 'https://zqbdzokyhgavgmqgiwuw.supabase.co/functions/v1/hg-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('type', 'ton_tour', 'user_id', p_user, 'titre', left(v_titre, 200), 'suite', v_suite, 'lien', v_lien,
      'tag', 'hg-tour-' || p_partie::text));
end $$;

/*
 * Déclencheur des trois tables de joueurs. TG_ARGV[0] : duel, uno ou plat.
 * Les colonnes parti, robot, exclu et invite ne sont pas sur toutes les tables : d'où la lecture par to_jsonb.
 */
create or replace function public.hg_tour__trg()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v jsonb := to_jsonb(new);
begin
  if new.manques = 0 then
    -- maj_at = now() : le jeu vient de jouer pour lui dans cette même transaction, ce n'est pas lui qui rejoue.
    if auth.uid() = new.user_id then
      delete from hg_tour_rappels where partie = new.partie and user_id = new.user_id and maj_at < now();
    end if;
    return null;
  end if;
  update hg_tour_rappels set maj_at = now() where partie = new.partie and user_id = new.user_id;
  if old.manques = 0 and new.manques = 1
    and not (coalesce((v ->> 'invite')::boolean, false) or coalesce((v ->> 'robot')::boolean, false)
      or coalesce((v ->> 'parti')::boolean, false) or coalesce((v ->> 'exclu')::boolean, false)
      or coalesce((v ->> 'elimine')::boolean, false)) then
    perform public.hg_tour__signaler(tg_argv[0], new.partie, new.user_id);
  end if;
  return null;
exception when others then
  raise warning 'hg_tour__trg : %', sqlerrm;
  return null;
end $$;

-- Reprise de la migration 125 (identique en production) : le membre a joué lui-même, le rappel de cette partie est réarmé.
create or replace function public.hg_plat__present(p_id uuid, p_user uuid)
returns void language sql security definer set search_path = public as $$
  update hg_plat_joueurs set manques = 0, absent = false where partie = p_id and user_id = p_user and (manques > 0 or absent);
  delete from hg_tour_rappels where partie = p_id and user_id = p_user;
$$;

drop trigger if exists hg_tour_duel on public.hg_duel_joueurs;
create trigger hg_tour_duel after update of manques on public.hg_duel_joueurs
  for each row when (new.manques = 0 or new.manques > old.manques) execute function public.hg_tour__trg('duel');
drop trigger if exists hg_tour_uno on public.hg_uno_joueurs;
create trigger hg_tour_uno after update of manques on public.hg_uno_joueurs
  for each row when (new.manques = 0 or new.manques > old.manques) execute function public.hg_tour__trg('uno');
drop trigger if exists hg_tour_plat on public.hg_plat_joueurs;
create trigger hg_tour_plat after update of manques on public.hg_plat_joueurs
  for each row when (new.manques = 0 or new.manques > old.manques) execute function public.hg_tour__trg('plat');

-- =====================================================================
-- 3. Droits
-- =====================================================================
revoke all on function public.hg_tour__signaler(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.hg_tour__trg() from public, anon, authenticated;

-- Reprises : mêmes droits qu'avant.
revoke all on function public.hg_plat__present(uuid, uuid) from public, anon, authenticated;
revoke all on function public.hg_set_notif_prefs(jsonb, int, int) from public, anon;
grant execute on function public.hg_set_notif_prefs(jsonb, int, int) to authenticated;
revoke all on function public.hg_notif_allowed(uuid, text, text) from public, anon, authenticated;
grant execute on function public.hg_notif_allowed(uuid, text, text) to service_role;
