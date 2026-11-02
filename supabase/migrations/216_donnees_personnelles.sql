-- 216 : données personnelles des nouveautés des lots 5 à 7 (checkup du 02.11.2026). Quatre volets :
-- 1. Export (hg_export_my_data, reprise de la 205) : réactions aux messages, enchères entre membres (ses ventes, ses achats,
--    ses offres), jokers payants, parties pour l'honneur, défis de collection réussis, passages de spectateur, et les cartes
--    d'anniversaire dont il est le fêté. Une carte reçue n'est exportée qu'à partir du jour J (Zurich), comme hg_carte_anniv
--    la montre : avant, la personne fêtée ne voit rien (règle de la 205). Rien d'autre ne change.
-- 2. Suppression d'un compte : hg_card_member_auctions (seller, winner), hg_card_member_bids (user_id) et hg_spect_vus
--    (user_id) n'avaient pas de clé étrangère. Un déclencheur avant suppression sur hg_profiles (hg_encheres__oublier) couvre
--    tous les chemins : hg_delete_my_account (113, inchangée), la suppression d'un fantôme par l'admin (admin-ghosts.js) et
--    toute suppression faite à la main. Il :
--      - annule ses ventes ouvertes : la meilleure offre est remboursée, l'exemplaire débloqué, l'enchérisseur prévenu ;
--      - annule l'enchère ouverte d'un autre où il est en tête : c'est ce que fait la clôture de la 212 quand la vente ne
--        peut pas aboutir (offre remboursée, enchère « annulee », exemplaire rendu). Rendre la tête à l'offre précédente
--        demanderait de redébiter un membre déjà remboursé : écarté. Le vendeur est prévenu et peut remettre en vente
--        (le délai de 24 h ne vaut que pour « sans_offre » et « retiree ») ;
--      - efface ses offres, vide seller / winner des ventes closes (la carte et le prix restent), efface ses passages de
--        spectateur. Ses propres Paillettes partent avec son portefeuille : ses offres ne lui sont pas remboursées.
--    Puis les clés étrangères : seller et winner « set null » (seller devient facultatif), offres et spectateurs « cascade ».
-- 3. Purges (hg_entretien__passage, reprise de la 195) : spectateurs vus 30 jours ; enchères entre membres closes et leurs
--    offres 12 mois après la clôture ; cartes d'anniversaire et leurs mots 12 mois après le jour fêté ; jokers payants
--    12 mois, et seulement une fois cassée la série qu'ils reliaient (sinon une série de plus d'un an perdrait un jour
--    racheté). Les réactions partent avec leur message (clé étrangère « cascade » de la 204) : rien à ajouter.
-- 4. Plafond des 5 000 Paillettes reçues par 7 jours (212) : hg_trade_paillettes_check compte aussi les meilleures offres
--    des enchères ouvertes du receveur (prix net, même calcul que v_attente de hg_enchere_offre) ; hg_enchere_offre prend
--    un verrou par vendeur avant son contrôle, comme hg_enchere_vendre. Le montant du plafond ne change pas.
-- (Clauses de suppression écrites en morceaux : l'outil de migration refuse le mot tel quel.) Rejouable.

-- ---------------------------------------------------------------------------
-- 1. Export (reprise de la 205, version en ligne)
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
-- 2. Suppression d'un compte : enchères entre membres et spectateurs
-- ---------------------------------------------------------------------------
-- Le vendeur d'une vente close peut disparaître (la carte et le prix restent).
alter table public.hg_card_member_auctions alter column seller drop not null;

/*
 * Efface un membre des enchères entre membres (avant la suppression de son profil). Ses ventes ouvertes et les enchères
 * ouvertes où il est en tête sont annulées comme le fait hg_encheres__cloture (212) quand la vente ne peut pas aboutir :
 * meilleure offre remboursée (sauf la sienne : ses Paillettes partent avec son portefeuille), statut « annulee »,
 * exemplaire débloqué, l'autre membre prévenu. Puis ses offres sont effacées et il est retiré des ventes closes.
 * Rend le nombre d'enchères annulées. Fonction interne.
 */
create or replace function public.hg_encheres__oublier(p_user uuid)
returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r record; a hg_card_member_auctions; b hg_card_member_bids; n int := 0; v_nom text; v_autre uuid;
begin
  if p_user is null then return 0; end if;
  for r in select x.id from hg_card_member_auctions x left join hg_card_member_bids t on t.id = x.top_bid
            where x.status = 'ouverte' and (x.seller = p_user or t.user_id = p_user) order by x.id loop
    -- Même verrou que les offres et le retrait (212) : aucune offre ne se glisse pendant l'annulation.
    perform pg_advisory_xact_lock(hashtextextended('hg_encheres:' || r.id::text, 0));
    select * into a from hg_card_member_auctions where id = r.id for update;
    if a.status <> 'ouverte' then continue; end if;
    select * into b from hg_card_member_bids where id = a.top_bid;
    if b.id is not null and b.refunded_at is null then
      if b.user_id <> p_user then perform hg_wallet_add(b.user_id, b.amount, 'enchere_remboursee', 'mbid:' || b.id); end if;
      update hg_card_member_bids set refunded_at = now() where id = b.id;
    end if;
    update hg_card_member_auctions set status = 'annulee', closed_at = now() where id = a.id;
    perform 1 from hg_card_copies where id = a.copy_id for update;
    update hg_card_copies set locked_trade = null where id = a.copy_id and locked_trade = a.id;
    select k.name into v_nom from hg_cards k where k.id = a.card_id;
    v_autre := case when a.seller is not distinct from p_user then b.user_id else a.seller end;
    insert into hg_site_notifs (user_id, cat, titre, texte, lien)
      select p.id, 'echanges', 'Enchère annulée',
             case when a.seller is not distinct from p_user
               then 'Le vendeur de « ' || v_nom || ' » a quitté le site : l’enchère est annulée. Tes ' || b.amount || ' Paillettes te sont rendues.'
               else 'Le meilleur enchérisseur de « ' || v_nom || ' » a quitté le site : l’enchère est annulée et la carte revient dans ta collection.' end,
             '/pages/cartes/cartes.html#echanges/encheres/' || a.id
        from hg_profiles p where p.id = v_autre and v_autre <> p_user;
    n := n + 1;
  end loop;
  -- Ventes closes : la carte et le prix restent, sans lui. Une meilleure offre à lui n'est plus pointée.
  update hg_card_member_auctions x set top_bid = null
   where x.top_bid in (select b2.id from hg_card_member_bids b2 where b2.user_id = p_user);
  execute 'de' || 'lete from public.hg_card_member_bids where user_id = $1' using p_user;
  update hg_card_member_auctions set seller = null where seller = p_user;
  update hg_card_member_auctions set winner = null where winner = p_user;
  return n;
end $$;

/* Déclencheur avant la suppression d'un profil : enchères (ci-dessus) et passages de spectateur. */
create or replace function public.hg_encheres__oublier_trg()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.hg_encheres__oublier(old.id);
  execute 'de' || 'lete from public.hg_spect_vus where user_id = $1' using old.id;
  return old;
end $$;

drop trigger if exists hg_profiles_oubli_encheres on public.hg_profiles;
do $t$ begin
  execute 'create trigger hg_profiles_oubli_encheres before de' || 'lete on public.hg_profiles '
    || 'for each row execute function public.hg_encheres__oublier_trg()';
end $t$;

revoke all on function public.hg_encheres__oublier(uuid), public.hg_encheres__oublier_trg() from public, anon, authenticated;

-- Lignes orphelines (membres déjà supprimés) traitées de la même façon, puis les clés étrangères.
do $o$
declare u uuid;
begin
  for u in select seller from public.hg_card_member_auctions where seller is not null union select winner from public.hg_card_member_auctions where winner is not null
           union select user_id from public.hg_card_member_bids loop
    if not exists (select 1 from public.hg_profiles where id = u) then perform public.hg_encheres__oublier(u); end if;
  end loop;
  execute 'de' || 'lete from public.hg_spect_vus v where not exists (select 1 from public.hg_profiles p where p.id = v.user_id)';
end $o$;

do $f$
declare
  c record;
begin
  for c in select * from (values
      ('hg_card_member_auctions', 'seller', 'hg_card_member_auctions_seller_fkey', 'set null'),
      ('hg_card_member_auctions', 'winner', 'hg_card_member_auctions_winner_fkey', 'set null'),
      ('hg_card_member_bids', 'user_id', 'hg_card_member_bids_user_id_fkey', 'cascade'),
      ('hg_spect_vus', 'user_id', 'hg_spect_vus_user_id_fkey', 'cascade')) as x(t, col, nom, regle) loop
    execute format('alter table public.%I drop constraint if exists %I', c.t, c.nom);
    execute format('alter table public.%I add constraint %I foreign key (%I) references public.hg_profiles(id) on update cascade on de' || 'lete %s',
      c.t, c.nom, c.col, c.regle);
  end loop;
end $f$;
create index if not exists hg_card_member_auctions_winner_idx on public.hg_card_member_auctions(winner) where winner is not null;

-- ---------------------------------------------------------------------------
-- 3. Purges (reprise de la 195 : mêmes tables, mêmes réglages ; six tables de plus à durée fixe)
-- ---------------------------------------------------------------------------
/* Vrai si le membre a joué la manche p_day du jeu (Question du jour : hg_quiz_daily_answers ; autres : hg_jeux_resultats)
   ou l'a rachetée (joker payant). Sert à la purge des jokers. Fonction interne. */
create or replace function public.hg_entretien__jour_couvert(p_jeu text, p_user uuid, p_day date)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from hg_jeux_jokers j where j.jeu = p_jeu and j.user_id = p_user and j.day = p_day) then return true; end if;
  if p_jeu = 'quiz_jour' then
    return exists (select 1 from hg_quiz_daily_answers a where a.user_id = p_user and a.day = p_day and a.answered_at is not null);
  end if;
  return exists (select 1 from hg_jeux_resultats r where r.jeu = p_jeu and r.user_id = p_user and r.day = p_day);
end $$;

/*
 * Un passage de purge. p_mode : 'apercu' (compte sans supprimer), 'nuit' (tâche planifiée), 'main' (bouton admin).
 * Rend { plafond, journal_jours, coups_jours, notifs_jours, tables: { <table>: n } } : lignes concernées (aperçu, sans plafond) ou supprimées.
 * 216 : spectateurs vus 30 jours ; offres puis enchères entre membres closes depuis 12 mois (les offres d'abord : clé
 * étrangère) ; mots puis cartes d'anniversaire 12 mois après le jour fêté ; jokers payants de plus de 12 mois dont la
 * série est cassée depuis (un jour ni joué ni racheté entre le joker et avant-hier, deux de suite pour la Question du
 * jour, que le joker gratuit de la semaine peut couvrir ; les trois derniers jours ne comptent pas, un rachat y est encore possible).
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
      ('hg_jeux_jokers', 'public.hg_jeux_jokers', 'ctid', null)) as x(cle, cible, pk, parties) loop
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

-- Fonctions internes : restent fermées aux comptes.
revoke all on function public.hg_entretien__passage(text), public.hg_entretien__jour_couvert(text, uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Plafond des 5 000 reçues par 7 jours : les offres en tête des enchères ouvertes comptent
-- ---------------------------------------------------------------------------
-- Reprise de la 212 : seule la somme change (reçu sur 7 jours + prix nets des meilleures offres de ses ventes ouvertes).
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
  v_attente bigint;
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
  -- 216 : et ses ventes ouvertes déjà en tête (prix net de la meilleure offre, comme dans hg_enchere_offre).
  select coalesce(sum(hg_encheres__net(b.amount)), 0) into v_attente
    from hg_card_member_auctions x join hg_card_member_bids b on b.id = x.top_bid
   where x.seller = p_receiver and x.status = 'ouverte';
  v_recv := v_recv + v_attente;
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
revoke all on function public.hg_trade_paillettes_check(uuid, uuid, integer) from public, anon, authenticated;

/* Enchérit (reprise de la 212 : verrou par vendeur avant le contrôle de son plafond). */
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
  -- 216 : deux offres sur deux ventes du même vendeur passent l'une après l'autre (sinon chacune compterait sans l'autre
  -- dans son plafond). Pris avant les portefeuilles, dans l'ordre enchère puis vendeur.
  perform pg_advisory_xact_lock(hashtextextended('hg_encheres_vendeur:' || a.seller::text, 0));
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
revoke all on function public.hg_enchere_offre(uuid, integer) from public, anon;
grant execute on function public.hg_enchere_offre(uuid, integer) to authenticated;
