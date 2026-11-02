-- 212 : enchères de cartes entre membres (idée 33). Chaque membre met en vente une de ses cartes, pour 5 min, 10 min, 1 h
-- ou 24 h ; la plus haute offre gagne. L'enchère de la semaine du Staff (C11, migrations 081 et 097) ne change pas.
--
-- Moteur repris de hg_auction_bid (097) : l'offre est débitée tout de suite, l'offre dépassée est remboursée dans la même
-- transaction ; verrou consultatif par enchère ; plafond d'une offre = la moitié du solde de lundi (hg_auction_cap).
-- Règles (maquette du lot 7, validée le 02.11.2026) :
--   - Vente : carte échangeable, ni identité ni carte qui représente un membre ; l'exemplaire n'est ni bloqué, ni en vitrine.
--     Il est bloqué comme pour un échange (hg_card_copies.locked_trade = id de l'enchère) jusqu'à la fin : aucune fonction ne
--     peut alors le recycler, le donner ni l'échanger. Deux cartes en vente à la fois au plus. Mise de départ 10 à 100 000,
--     puis 10 de plus au moins. Retrait possible tant que personne n'a fait d'offre. Un exemplaire revenu sans offre (ou
--     retiré) se remet en vente 24 h plus tard.
--   - Offre : pas sur sa propre carte ; compte de 7 jours au moins (réglage echanges.anciennete_jours, comme pour donner des
--     Paillettes dans un échange) ; pas de fantôme ; la moitié du solde de lundi au plus ; le prix net du vendeur entre
--     dans son plafond de 5 000 Paillettes reçues par 7 jours (echanges.paillettes_max_semaine), avec les ventes qu'il a
--     déjà en tête ailleurs.
--   - Prolongation : une offre dans les 30 dernières secondes repousse la fin à 30 s d'ici, 10 minutes de plus au total.
--   - Fin : la carte va au meilleur enchérisseur ; le vendeur reçoit le prix moins 10 % (arrondi en faveur du vendeur),
--     les 10 % sont détruits (journal enchere_vente, réf. menc:<id>). Sans offre, la carte est rendue.
--   - Alerte : une fois par enchère, quand il reste 5 minutes au plus, les membres qui ont la carte dans leur liste de
--     souhaits (sauf le vendeur) reçoivent une notification du site (préférence carte_proposee.site, catégorie souhaits).
--   - Le plafond de 5 000 reçues par 7 jours compte désormais les ventes aux enchères (hg_trade_paillettes_check, 074).
-- Lecture : liste et vue publiques entre membres (pseudos des enchérisseurs) ; le Staff « cartes » voit toutes les offres
-- (hg_encheres_admin). La table des enchères est lisible par les membres (aucune donnée privée) et publiée en temps réel :
-- la page d'une enchère n'écoute son canal que pendant ses 10 dernières minutes.
-- Clôture : à chaque lecture (liste, vue, historique) et par la tâche hg-auctions-close, qui passe de toutes les 5 minutes à
-- chaque minute (même tâche, aucune de plus) : hg_auction_close appelle hg_encheres__cloture.
-- Rejouable : if not exists, create or replace, blocs do.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.hg_card_member_auctions (
  id uuid primary key default gen_random_uuid(),
  seller uuid not null,
  copy_id bigint not null,
  card_id uuid not null references public.hg_cards(id),
  duree_min smallint not null check (duree_min in (5, 10, 60, 1440)),
  min_bid integer not null check (min_bid between 10 and 100000),
  step integer not null default 10 check (step between 1 and 10000),
  starts_at timestamptz not null default now(),
  fin_prevue timestamptz not null,
  ends_at timestamptz not null,
  hard_end_at timestamptz not null,
  status text not null default 'ouverte' check (status in ('ouverte', 'vendue', 'sans_offre', 'retiree', 'annulee')),
  top_bid bigint,
  winner uuid,
  price integer,
  fee integer,
  alerte_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at >= fin_prevue and hard_end_at >= ends_at)
);
comment on table public.hg_card_member_auctions is 'Enchères de cartes entre membres (idée 33, migration 212). L''exemplaire est bloqué par locked_trade = id. fin_prevue : fin choisie ; ends_at : fin réelle (prolongations, hard_end_at au plus).';
create unique index if not exists hg_card_member_auctions_copy_open on public.hg_card_member_auctions(copy_id) where status = 'ouverte';
create index if not exists hg_card_member_auctions_status_idx on public.hg_card_member_auctions(status, ends_at);
create index if not exists hg_card_member_auctions_seller_idx on public.hg_card_member_auctions(seller, created_at desc);

create table if not exists public.hg_card_member_bids (
  id bigint generated always as identity primary key,
  auction_id uuid not null references public.hg_card_member_auctions(id),
  user_id uuid not null,
  amount integer not null check (amount between 1 and 1000000),
  refunded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists hg_card_member_bids_auction_idx on public.hg_card_member_bids(auction_id, created_at desc);
create index if not exists hg_card_member_bids_user_idx on public.hg_card_member_bids(user_id, created_at desc);

alter table public.hg_card_member_auctions enable row level security;
alter table public.hg_card_member_bids enable row level security;
revoke all on public.hg_card_member_auctions, public.hg_card_member_bids from public, anon, authenticated;
-- Lecture seule des enchères par les membres : sert au canal temps réel (filtre id=eq.<id>). Les offres restent fermées.
grant select on public.hg_card_member_auctions to authenticated;
do $p$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'hg_card_member_auctions' and policyname = 'hg_card_member_auctions_lecture') then
    create policy hg_card_member_auctions_lecture on public.hg_card_member_auctions for select to authenticated using (public.hg_is_member());
  end if;
end $p$;
do $r$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hg_card_member_auctions') then
    alter publication supabase_realtime add table public.hg_card_member_auctions;
  end if;
end $r$;

-- ---------------------------------------------------------------------------
-- 2. Outils internes
-- ---------------------------------------------------------------------------
/* Réglage des échanges (074) : { max : Paillettes reçues par 7 jours, jours : ancienneté pour donner des Paillettes }. */
create or replace function public.hg_encheres__reglage()
returns table (max_semaine int, anciennete_jours int)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(case when (v->>'paillettes_max_semaine') ~ '^[0-9]{1,9}$' then (v->>'paillettes_max_semaine')::int end, 5000),
         coalesce(case when (v->>'anciennete_jours') ~ '^[0-9]{1,4}$' then (v->>'anciennete_jours')::int end, 7)
    from (select coalesce((select value from hg_settings where key = 'echanges'), '{}'::jsonb) as v) s
$$;

/* Paillettes reçues par échange ou vente aux enchères sur 7 jours glissants. */
create or replace function public.hg_encheres__recu_semaine(p_user uuid)
returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(sum(delta), 0) from hg_wallet_log
   where user_id = p_user and reason in ('echange', 'enchere_vente') and delta > 0 and created_at > now() - interval '7 days'
$$;

/* Part du vendeur : le prix moins 10 % (les 10 % arrondis à l'unité inférieure sont détruits). */
create or replace function public.hg_encheres__net(p_prix integer)
returns integer
language sql immutable set search_path = public, pg_temp as $$
  select p_prix - p_prix / 10
$$;

/* Carte d'une enchère, telle qu'envoyée aux pages (cardHtml). */
create or replace function public.hg_encheres__carte(p_card uuid, p_copy bigint)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('id', k.id, 'name', k.name, 'rarity', k.rarity, 'family', k.family, 'image_url', k.image_url,
      'flavor', k.flavor, 'caption', k.caption, 'number', k.number, 'max_copies', k.max_copies, 'set_id', k.set_id,
      'set_name', (select s.name from hg_card_sets s where s.id = k.set_id),
      'shiny', coalesce(c.shiny, false), 'serial', c.serial)
    from hg_cards k left join hg_card_copies c on c.id = p_copy
   where k.id = p_card
$$;

/* Pseudo, couleur et avatar d'un membre (avatarHtml). */
create or replace function public.hg_encheres__membre(p_user uuid)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('pseudo', p.pseudo, 'color', p.color, 'avatar_url', p.avatar_url) from hg_profiles p where p.id = p_user
$$;

/*
 * Alerte « une carte de ta liste est aux enchères » : une fois par enchère, quand il reste 5 minutes au plus.
 * Membres qui ont la carte dans leur liste, sauf le vendeur et les fantômes, préférence carte_proposee.site. Rend le nombre
 * de notifications écrites.
 */
create or replace function public.hg_encheres__alertes()
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare a record; v_n int := 0; v_k int; v_min int; v_rarete text;
begin
  for a in
    update hg_card_member_auctions x set alerte_at = now()
     where x.id in (select y.id from hg_card_member_auctions y
                     where y.status = 'ouverte' and y.alerte_at is null and y.ends_at > now() and y.ends_at <= now() + interval '5 minutes'
                     for update skip locked)
    returning x.id, x.card_id, x.seller, x.ends_at
  loop
    v_min := greatest(1, ceil(extract(epoch from (a.ends_at - now())) / 60)::int);
    select hg_rarity_label(k.rarity) into v_rarete from hg_cards k where k.id = a.card_id;
    insert into hg_site_notifs (user_id, cat, titre, texte, lien)
      select w.user_id, 'souhaits', 'Une carte de ta liste est aux enchères',
             left('« ' || k.name || ' » (' || upper(left(v_rarete, 1)) || substr(v_rarete, 2) || ') : l’enchère de '
               || coalesce(s.pseudo, 'un membre') || ' finit dans ' || v_min || ' minute' || case when v_min > 1 then 's' else '' end || '.', 1000),
             '/pages/cartes/cartes.html#echanges/encheres/' || a.id
        from hg_card_wishlist w
        join hg_profiles p on p.id = w.user_id and not p.is_ghost
        join hg_cards k on k.id = a.card_id
        left join hg_profiles s on s.id = a.seller
       where w.card_id = a.card_id and w.user_id <> a.seller
         and public.hg_notif_allowed(w.user_id, 'carte_proposee', 'site');
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end $$;

/*
 * Clôture des enchères des membres échues (idempotente : statut « ouverte » et fin passée seulement).
 * Avec une offre : l'exemplaire passe au gagnant (source « echange »), le vendeur reçoit le prix moins 10 %. Si l'exemplaire
 * ne peut pas être remis (il n'est plus bloqué par l'enchère), l'offre est remboursée et l'enchère annulée.
 * Sans offre : l'exemplaire est rendu. Envoie ensuite les alertes de fin proche. Rend le nombre d'enchères closes.
 */
create or replace function public.hg_encheres__cloture()
returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare a hg_card_member_auctions; b hg_card_member_bids; n int := 0; v_k int; v_net int; v_nom text;
begin
  for a in select * from hg_card_member_auctions where status = 'ouverte' and ends_at <= now() order by ends_at for update skip locked loop
    select k.name into v_nom from hg_cards k where k.id = a.card_id;
    select * into b from hg_card_member_bids where id = a.top_bid;
    if b.id is null then
      update hg_card_member_auctions set status = 'sans_offre', closed_at = now() where id = a.id;
      perform 1 from hg_card_copies where id = a.copy_id for update;
      update hg_card_copies set locked_trade = null where id = a.copy_id and locked_trade = a.id;
      insert into hg_site_notifs (user_id, cat, titre, texte, lien)
        select a.seller, 'echanges', 'Enchère terminée sans offre', '« ' || v_nom || ' » revient dans ta collection.', '/pages/cartes/cartes.html#echanges/encheres/' || a.id
          from hg_profiles p where p.id = a.seller;
    else
      begin
        v_net := hg_encheres__net(b.amount);
        perform 1 from hg_wallets where user_id in (a.seller, b.user_id) order by user_id for update;
        perform 1 from hg_card_copies where id = a.copy_id for update;
        update hg_card_copies set owner_id = b.user_id, locked_trade = null, source = 'echange'
         where id = a.copy_id and locked_trade = a.id and recycled_at is null;
        get diagnostics v_k = row_count;
        if v_k <> 1 then raise exception 'Exemplaire introuvable'; end if;
        if not hg_wallet_add(a.seller, v_net, 'enchere_vente', 'menc:' || a.id) then raise exception 'Vente déjà payée'; end if;
        update hg_card_member_auctions set status = 'vendue', closed_at = now(), winner = b.user_id, price = b.amount, fee = b.amount - v_net
         where id = a.id;
        perform hg_card_check_sets(b.user_id);
        insert into hg_site_notifs (user_id, cat, titre, texte, lien)
          select x.uid, 'echanges', x.titre, x.texte, '/pages/cartes/cartes.html#echanges/encheres/' || a.id
            from (values
              (b.user_id, 'Enchère remportée', 'Tu as remporté « ' || v_nom || ' » pour ' || b.amount || ' Paillettes. La carte est dans ta collection.'),
              (a.seller, 'Carte vendue', '« ' || v_nom || ' » est vendue pour ' || b.amount || ' Paillettes. Tu reçois ' || v_net || ' Paillettes.')) x(uid, titre, texte)
            join hg_profiles p on p.id = x.uid;
      exception when others then
        perform hg_wallet_add(b.user_id, b.amount, 'enchere_remboursee', 'mbid:' || b.id);
        update hg_card_member_bids set refunded_at = now() where id = b.id;
        update hg_card_member_auctions set status = 'annulee', closed_at = now() where id = a.id;
        update hg_card_copies set locked_trade = null where locked_trade = a.id;
      end;
    end if;
    n := n + 1;
  end loop;
  perform hg_encheres__alertes();
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Plafond de 5 000 reçues par 7 jours : les ventes aux enchères comptent (reprise de 074, seule la somme change)
-- ---------------------------------------------------------------------------
create or replace function public.hg_trade_paillettes_check(p_payer uuid, p_receiver uuid, p_amount integer)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'public'
as $function$
declare
  v_cfg jsonb := coalesce((select value from hg_settings where key = 'echanges'), '{}'::jsonb);
  v_max int := coalesce(case when (v_cfg->>'paillettes_max_semaine') ~ '^[0-9]{1,9}$' then (v_cfg->>'paillettes_max_semaine')::int end, 5000);
  v_days int := coalesce(case when (v_cfg->>'anciennete_jours') ~ '^[0-9]{1,4}$' then (v_cfg->>'anciennete_jours')::int end, 7);
  v_since timestamptz;
  v_recv bigint;
  v_pseudo text;
begin
  if coalesce(p_amount, 0) <= 0 then return; end if;
  -- Ancienneté : la plus récente des deux dates (compte Auth, profil) ; un fantôme repris garde ainsi la date de reprise.
  select greatest(p.created_at, coalesce(u.created_at, p.created_at)) into v_since
    from hg_profiles p left join auth.users u on u.id = p.id
   where p.id = p_payer;
  if v_since is null or v_since > now() - make_interval(days => v_days) then
    if p_payer = auth.uid() then
      raise exception 'Ton compte doit avoir au moins % jours pour donner des Paillettes dans un échange', v_days;
    end if;
    raise exception 'Ce membre est trop récent pour donner des Paillettes dans un échange (au moins % jours)', v_days;
  end if;
  -- 212 : les ventes aux enchères (enchere_vente) comptent dans le même plafond.
  v_recv := hg_encheres__recu_semaine(p_receiver);
  if v_recv + p_amount > v_max then
    if p_receiver = auth.uid() then
      raise exception 'Plafond atteint : tu peux encore recevoir % Paillettes par échange cette semaine (plafond %)',
        greatest(v_max - v_recv, 0), v_max;
    end if;
    select pseudo into v_pseudo from hg_profiles where id = p_receiver;
    raise exception 'Plafond atteint : % peut encore recevoir % Paillettes par échange cette semaine (plafond %)',
      coalesce(v_pseudo, 'ce membre'), greatest(v_max - v_recv, 0), v_max;
  end if;
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Membres : vendre, retirer, enchérir
-- ---------------------------------------------------------------------------
/* Met un exemplaire aux enchères. p_duree en minutes (5, 10, 60, 1440), p_depart : mise de départ. Rend l'id de l'enchère. */
create or replace function public.hg_enchere_vendre(p_copy bigint, p_duree integer, p_depart integer)
returns uuid
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); c hg_card_copies; k hg_cards; v_id uuid; v_fin timestamptz; v_n int;
begin
  if not hg_is_member() or exists (select 1 from hg_profiles where id = me and is_ghost) then raise exception 'Réservé aux membres'; end if;
  if p_duree is null or p_duree not in (5, 10, 60, 1440) then raise exception 'Durée : 5 min, 10 min, 1 h ou 24 h'; end if;
  if p_depart is null or p_depart < 10 then raise exception 'La mise de départ est de 10 Paillettes au moins'; end if;
  if p_depart > 100000 then raise exception 'La mise de départ est de 100 000 Paillettes au plus'; end if;
  -- Un vendeur à la fois : le compte des ventes en cours ne change pas entre le contrôle et l'ajout.
  perform pg_advisory_xact_lock(hashtextextended('hg_encheres_vendeur:' || me::text, 0));
  perform 1 from hg_card_copies where id = p_copy for update;
  select * into c from hg_card_copies where id = p_copy;
  if c.id is null or c.owner_id is distinct from me or c.recycled_at is not null then raise exception 'Cette carte ne t’appartient plus'; end if;
  select * into k from hg_cards where id = c.card_id;
  if k.rarity = 'identite' then raise exception 'Une carte d’identité ne se met pas aux enchères'; end if;
  if k.member_id is not null or k.family = 'membre' then raise exception 'Une carte qui représente un membre ne se met pas aux enchères'; end if;
  if not k.tradeable then raise exception 'Cette carte ne s’échange pas : elle ne se met pas aux enchères'; end if;
  if c.locked_trade is not null then raise exception 'Cet exemplaire est déjà bloqué par un échange ou une enchère'; end if;
  if exists (select 1 from hg_card_showcase s where s.copy_id = c.id) then raise exception 'Retire d’abord cette carte de ta vitrine'; end if;
  select count(*) into v_n from hg_card_member_auctions where seller = me and status = 'ouverte';
  if v_n >= 2 then raise exception 'Deux cartes en vente à la fois au plus'; end if;
  if exists (select 1 from hg_card_member_auctions x where x.copy_id = c.id and x.status in ('sans_offre', 'retiree') and x.closed_at > now() - interval '24 hours') then
    raise exception 'Cet exemplaire se remet en vente 24 h après la fin de sa dernière enchère';
  end if;
  v_fin := now() + make_interval(mins => p_duree);
  insert into hg_card_member_auctions(seller, copy_id, card_id, duree_min, min_bid, fin_prevue, ends_at, hard_end_at)
    values (me, c.id, c.card_id, p_duree, p_depart, v_fin, v_fin, v_fin + interval '10 minutes') returning id into v_id;
  update hg_card_copies set locked_trade = v_id where id = c.id and owner_id = me and recycled_at is null and locked_trade is null;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'Cet exemplaire est déjà bloqué par un échange ou une enchère'; end if;
  if p_duree <= 5 then perform hg_encheres__alertes(); end if; -- une enchère de 5 minutes alerte tout de suite
  return v_id;
end $$;

/* Retire une vente tant que personne n'a fait d'offre : l'exemplaire est rendu. */
create or replace function public.hg_enchere_retirer(p_id uuid)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); a hg_card_member_auctions;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hg_encheres:' || coalesce(p_id::text, ''), 0));
  select * into a from hg_card_member_auctions where id = p_id for update;
  if not found or a.seller <> me then raise exception 'Enchère introuvable'; end if;
  if a.status <> 'ouverte' or a.ends_at <= now() then raise exception 'L’enchère est terminée'; end if;
  if a.top_bid is not null then raise exception 'Une offre a été faite : la carte ne peut plus être retirée'; end if;
  update hg_card_member_auctions set status = 'retiree', closed_at = now() where id = a.id;
  perform 1 from hg_card_copies where id = a.copy_id for update;
  update hg_card_copies set locked_trade = null where id = a.copy_id and locked_trade = a.id;
end $$;

/* Enchérit (moteur de hg_auction_bid, 097). */
create or replace function public.hg_enchere_offre(p_id uuid, p_montant integer)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); a hg_card_member_auctions; top hg_card_member_bids; v_min int; v_cap int; bal int; v_bid bigint;
  v_end timestamptz; v_since timestamptz; r record; v_recv bigint; v_attente bigint; v_net int; v_vendeur text; v_nom text;
begin
  if not hg_is_member() or exists (select 1 from hg_profiles where id = me and is_ghost) then raise exception 'Réservé aux membres'; end if;
  if p_montant is null or p_montant < 1 or p_montant > 1000000 then raise exception 'Montant invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hg_encheres:' || coalesce(p_id::text, ''), 0));
  select * into a from hg_card_member_auctions where id = p_id for update;
  if not found then raise exception 'Enchère introuvable'; end if;
  if a.status <> 'ouverte' or a.ends_at <= now() then raise exception 'L’enchère est terminée'; end if;
  if a.seller = me then raise exception 'Tu ne peux pas enchérir sur ta propre carte'; end if;
  select * into r from hg_encheres__reglage();
  select greatest(p.created_at, coalesce(u.created_at, p.created_at)) into v_since
    from hg_profiles p left join auth.users u on u.id = p.id where p.id = me;
  if v_since is null or v_since > now() - make_interval(days => r.anciennete_jours) then
    raise exception 'Ton compte doit avoir au moins % jours pour enchérir', r.anciennete_jours;
  end if;
  select * into top from hg_card_member_bids where id = a.top_bid;
  if top.user_id = me then raise exception 'Tu as déjà la meilleure offre'; end if;
  v_min := case when top.id is null then a.min_bid else top.amount + a.step end;
  if p_montant < v_min then raise exception 'L’offre minimale est de % Paillettes', v_min; end if;
  insert into hg_wallets(user_id) values (me) on conflict do nothing;
  perform 1 from hg_wallets where user_id in (me, top.user_id) order by user_id for update;
  select paillettes into bal from hg_wallets where user_id = me;
  v_cap := hg_auction_cap(me, 50);
  if p_montant > v_cap then raise exception 'Plafond : % Paillettes (la moitié de ton solde de lundi)', v_cap; end if;
  if p_montant > bal then raise exception 'Pas assez de Paillettes (il en faut %)', p_montant; end if;
  -- Plafond du vendeur : reçu sur 7 jours, plus ses autres ventes déjà en tête, plus cette vente.
  v_recv := hg_encheres__recu_semaine(a.seller);
  select coalesce(sum(hg_encheres__net(b.amount)), 0) into v_attente
    from hg_card_member_auctions x join hg_card_member_bids b on b.id = x.top_bid
   where x.seller = a.seller and x.status = 'ouverte' and x.id <> a.id;
  v_net := hg_encheres__net(p_montant);
  if v_recv + v_attente + v_net > r.max_semaine then
    select pseudo into v_vendeur from hg_profiles where id = a.seller;
    raise exception 'Plafond atteint : % peut encore recevoir % Paillettes cette semaine (plafond %)',
      coalesce(v_vendeur, 'ce membre'), greatest(r.max_semaine - v_recv - v_attente, 0), r.max_semaine;
  end if;
  insert into hg_card_member_bids(auction_id, user_id, amount) values (a.id, me, p_montant) returning id into v_bid;
  if not hg_wallet_add(me, -p_montant, 'enchere', 'mbid:' || v_bid) then raise exception 'Offre déjà enregistrée'; end if;
  if top.id is not null then
    perform hg_wallet_add(top.user_id, top.amount, 'enchere_remboursee', 'mbid:' || top.id);
    update hg_card_member_bids set refunded_at = now() where id = top.id;
    -- L'enchérisseur dépassé est prévenu (utile surtout pour une enchère de 24 h).
    select k.name into v_nom from hg_cards k where k.id = a.card_id;
    insert into hg_site_notifs (user_id, cat, titre, texte, lien)
      select top.user_id, 'echanges', 'Quelqu’un a fait mieux',
             coalesce(p.pseudo, 'Un membre') || ' a offert ' || p_montant || ' Paillettes pour « ' || v_nom || ' ». Tes ' || top.amount || ' Paillettes te sont rendues.',
             '/pages/cartes/cartes.html#echanges/encheres/' || a.id
        from hg_profiles p join hg_profiles t on t.id = top.user_id where p.id = me;
  end if;
  v_end := a.ends_at;
  if a.ends_at - now() < interval '30 seconds' then
    v_end := greatest(a.ends_at, least(now() + interval '30 seconds', a.hard_end_at));
  end if;
  update hg_card_member_auctions set top_bid = v_bid, ends_at = v_end where id = a.id;
  return jsonb_build_object('bid', v_bid, 'amount', p_montant, 'ends_at', v_end, 'prolongee', v_end > a.ends_at);
end $$;

-- ---------------------------------------------------------------------------
-- 5. Membres : lectures
-- ---------------------------------------------------------------------------
/* Enchères ouvertes (fin la plus proche d'abord), résumé de l'enchère de la semaine, et pour moi : ventes en cours
   (me.ventes : [{ id, copy_id }], pour la fiche d'une carte). */
create or replace function public.hg_encheres_liste()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v_sem jsonb;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_encheres__cloture();
  select jsonb_build_object('name', k.name, 'ends_at', s.ends_at, 'top', (select b.amount from hg_card_bids b where b.id = s.top_bid)) into v_sem
    from hg_card_auctions s join hg_cards k on k.id = s.card_id
   where s.status in ('prevue', 'ouverte') and s.starts_at <= now() and s.ends_at > now()
   order by s.ends_at limit 1;
  return jsonb_build_object('now', now(), 'semaine', v_sem,
    'encheres', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'card', hg_encheres__carte(a.card_id, a.copy_id),
        'vendeur', hg_encheres__membre(a.seller), 'mine', a.seller = me, 'ends_at', a.ends_at, 'fin_prevue', a.fin_prevue,
        'duree_min', a.duree_min, 'min_bid', a.min_bid,
        'top', (select jsonb_build_object('amount', b.amount, 'pseudo', p.pseudo, 'mine', b.user_id = me)
                  from hg_card_member_bids b left join hg_profiles p on p.id = b.user_id where b.id = a.top_bid),
        'n', (select count(*) from hg_card_member_bids b where b.auction_id = a.id)) order by a.ends_at)
      from hg_card_member_auctions a where a.status = 'ouverte'), '[]'::jsonb),
    'me', jsonb_build_object('ventes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'copy_id', copy_id))
      from hg_card_member_auctions where seller = me and status = 'ouverte'), '[]'::jsonb)));
end $$;

/* Une enchère (ouverte ou finie) : carte, vendeur, meilleure offre, 10 dernières offres, et pour moi : plafond, solde,
   ma dernière offre dépassée. now : l'heure du serveur (le compte à rebours s'y règle). */
create or replace function public.hg_enchere_vue(p_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); a hg_card_member_auctions; top hg_card_member_bids; mien hg_card_member_bids; v_bal int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_encheres__cloture();
  select * into a from hg_card_member_auctions where id = p_id;
  if not found then raise exception 'Enchère introuvable'; end if;
  select * into top from hg_card_member_bids where id = a.top_bid;
  select * into mien from hg_card_member_bids where auction_id = a.id and user_id = me order by created_at desc limit 1;
  select w.paillettes into v_bal from hg_wallets w where w.user_id = me;
  return jsonb_build_object('now', now(),
    'enchere', jsonb_build_object('id', a.id, 'status', a.status, 'card', hg_encheres__carte(a.card_id, a.copy_id),
      'vendeur', hg_encheres__membre(a.seller), 'mine', a.seller = me, 'starts_at', a.starts_at, 'ends_at', a.ends_at,
      'fin_prevue', a.fin_prevue, 'hard_end_at', a.hard_end_at, 'duree_min', a.duree_min, 'min_bid', a.min_bid, 'step', a.step,
      'next_min', case when top.id is null then a.min_bid else top.amount + a.step end, 'closed_at', a.closed_at,
      'price', a.price, 'net', case when a.price is null then null else a.price - a.fee end,
      'winner', (select p.pseudo from hg_profiles p where p.id = a.winner), 'won', a.winner = me,
      'top', case when top.id is null then null else coalesce(hg_encheres__membre(top.user_id), '{}'::jsonb) || jsonb_build_object('amount', top.amount, 'mine', top.user_id = me) end),
    'bids', (select coalesce(jsonb_agg(coalesce(hg_encheres__membre(b.user_id), '{}'::jsonb) || jsonb_build_object('amount', b.amount, 'created_at', b.created_at,
               'mine', b.user_id = me) order by b.created_at desc), '[]'::jsonb)
             from (select * from hg_card_member_bids where auction_id = a.id order by created_at desc limit 10) b),
    'me', jsonb_build_object('cap', greatest(least(hg_auction_cap(me, 50), coalesce(v_bal, 0)), 0), 'balance', coalesce(v_bal, 0),
      'depasse', case when mien.id is not null and mien.refunded_at is not null and top.user_id is distinct from me
        then jsonb_build_object('amount', mien.amount) end));
end $$;

/* Mes enchères des 30 derniers jours : mes ventes et celles où j'ai fait une offre, les plus récentes d'abord. */
create or replace function public.hg_encheres_historique()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid();
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_encheres__cloture();
  return coalesce((select jsonb_agg(x order by x->>'quand' desc) from (
    select jsonb_build_object('id', a.id, 'card', hg_encheres__carte(a.card_id, a.copy_id), 'status', a.status,
        'role', case when a.seller = me then 'vendeur' else 'acheteur' end,
        'quand', coalesce(a.closed_at, a.ends_at), 'ends_at', a.ends_at, 'price', a.price,
        'net', case when a.price is null then null else a.price - a.fee end,
        'won', a.winner = me,
        'vendeur', (select p.pseudo from hg_profiles p where p.id = a.seller),
        'winner', (select p.pseudo from hg_profiles p where p.id = a.winner),
        'top', (select b.amount from hg_card_member_bids b where b.id = a.top_bid),
        'top_mine', (select b.user_id = me from hg_card_member_bids b where b.id = a.top_bid),
        'mon_offre', (select max(b.amount) from hg_card_member_bids b where b.auction_id = a.id and b.user_id = me)) as x
      from hg_card_member_auctions a
     where (a.seller = me or exists (select 1 from hg_card_member_bids b where b.auction_id = a.id and b.user_id = me))
       and a.created_at > now() - interval '30 days'
     order by a.created_at desc limit 100) s), '[]'::jsonb);
end $$;

/* Staff « cartes » : 50 dernières enchères des membres et toutes leurs offres (qui a enchéri sur qui). */
create or replace function public.hg_encheres_admin()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if not hg_has_perm('cartes') then raise exception 'Réservé au Staff « cartes »'; end if;
  perform hg_encheres__cloture();
  return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
    select jsonb_build_object('id', a.id, 'card_name', k.name, 'status', a.status, 'created_at', a.created_at, 'ends_at', a.ends_at,
        'duree_min', a.duree_min, 'min_bid', a.min_bid, 'price', a.price, 'fee', a.fee,
        'seller', (select p.pseudo from hg_profiles p where p.id = a.seller),
        'winner', (select p.pseudo from hg_profiles p where p.id = a.winner),
        'bids', (select coalesce(jsonb_agg(jsonb_build_object('pseudo', p.pseudo, 'amount', b.amount, 'created_at', b.created_at,
                   'refunded', b.refunded_at is not null) order by b.created_at desc), '[]'::jsonb)
                 from hg_card_member_bids b left join hg_profiles p on p.id = b.user_id where b.auction_id = a.id)) as x
      from hg_card_member_auctions a join hg_cards k on k.id = a.card_id
     order by a.created_at desc limit 50) s), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Clôture par la tâche des enchères (reprise de 081 : une ligne de plus à la fin)
-- ---------------------------------------------------------------------------
create or replace function public.hg_auction_close()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare a hg_card_auctions; b hg_card_bids; cp bigint; n int := 0; v_name text;
begin
  for a in select * from hg_card_auctions where status in ('prevue', 'ouverte') and ends_at <= now() order by ends_at for update skip locked loop
    select * into b from hg_card_bids where id = a.top_bid;
    if b.id is null then
      update hg_card_auctions set status = 'close', closed_at = now() where id = a.id;
    else
      begin
        cp := hg_card_give(b.user_id, a.card_id, false, 'evenement');
        update hg_card_auctions set status = 'close', closed_at = now(), winner = b.user_id, price = b.amount, copy_id = cp where id = a.id;
        select k.name into v_name from hg_cards k where k.id = a.card_id;
        insert into hg_activity(user_id, kind, text)
          select b.user_id, 'cartes', p.pseudo || ' remporte l’enchère de « ' || v_name || ' » pour ' || b.amount || ' Paillettes !'
            from hg_profiles p where p.id = b.user_id and not p.is_ghost;
        perform hg_card_check_sets(b.user_id);
      exception when others then
        perform hg_wallet_add(b.user_id, b.amount, 'enchere_remboursee', 'bid:' || b.id);
        update hg_card_bids set refunded_at = now() where id = b.id;
        update hg_card_auctions set status = 'annulee', closed_at = now() where id = a.id;
      end;
    end if;
    n := n + 1;
  end loop;
  -- 212 : enchères des membres (clôture et alertes de fin proche).
  n := n + hg_encheres__cloture();
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Droits et tâche
-- ---------------------------------------------------------------------------
-- Fonctions internes : fermées à tous (appelées seulement par les fonctions ci-dessus et la tâche planifiée).
revoke all on function public.hg_encheres__reglage(), public.hg_encheres__recu_semaine(uuid), public.hg_encheres__net(integer),
  public.hg_encheres__carte(uuid, bigint), public.hg_encheres__membre(uuid), public.hg_encheres__alertes(), public.hg_encheres__cloture(),
  public.hg_trade_paillettes_check(uuid, uuid, integer) from public, anon, authenticated;

do $g$
declare f text;
begin
  foreach f in array array['hg_enchere_vendre(bigint, integer, integer)', 'hg_enchere_retirer(uuid)', 'hg_enchere_offre(uuid, integer)',
    'hg_encheres_liste()', 'hg_enchere_vue(uuid)', 'hg_encheres_historique()', 'hg_encheres_admin()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Reprise de 081 : clôture réservée au service (tâche planifiée).
  revoke all on function public.hg_auction_close() from public, anon, authenticated;
  grant execute on function public.hg_auction_close() to service_role;
end $g$;

-- La tâche des enchères (097) passe à chaque minute : elle clôt aussi les enchères des membres (5 minutes au plus court).
do $cron$ begin
  if exists (select 1 from pg_proc where proname = 'schedule' and pronamespace = (select oid from pg_namespace where nspname = 'cron')) then
    perform cron.schedule('hg-auctions-close', '* * * * *', 'select public.hg_auction_close()');
  end if;
end $cron$;
