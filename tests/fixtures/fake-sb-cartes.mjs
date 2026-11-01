// Faux client Supabase avec état et données de la collection de cartes (copie de visuel-carte/fake-sb.mjs).
// Sert aux tests de la collection et du panel Jeu de cartes (fixture 'fake-sb-cartes.mjs' passée à openPage() dans lib/harness.cjs).
// Sert au test d'ouverture de booster dans /pages/cartes/cartes.html (hg_open_booster, hg_cards_me, …).
// Exporte createClient(). Lit window.__SCN ; expose window.__DB, window.__LOG et window.__CARDS (configuration du jeu).
// Boosters typés (SPEC booster-system), seulement si scenario.types = true : RPC hg_booster_types_me, hg_booster_buy (p_type),
// hg_booster_open, hg_booster_gift (p_type), hg_booster_gifts_me (type_id/type_name). Sans types, les deux premières
// répondent PGRST202 (repli). Clés du scénario : types, typeOverrides { id: {…} }, stock { id: n }, typePity { id: n },
// boughtWeek { id: n }, collectorMissing N. État lisible : window.__DB.hg_booster_types / hg_booster_stock /
// hg_booster_pity / hg_booster_purchases, et window.__SB (le client factice, pour page.evaluate).

/* ---------- Scénario et constantes ---------- */
const S = window.__SCN || {};
const ME = '11111111-1111-4111-8111-111111111111';
/** Identifiant factice du membre n (même format que ME, pour les données de test). */
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
// Dates relatives à maintenant : iso(d) donne la date décalée de d jours.
const now = Date.now(), iso = (d) => new Date(now + d * 864e5).toISOString();
// Membres de test : Ethan (le membre connecté, admin) et cinq autres.
const people = [['Ethan', ME], ['Alice', U(2)], ['Bruno', U(3)], ['Chloé', U(4)], ['David', U(5)], ['Emma', U(6)]];
// Codes des badges automatiques (attribués par le site, pas par un admin).
const AUTO = ['premier_noel','veteran','lutin_express','sur_le_fil','liste_parfaite','toujours_la','organisateur','globe_trotter','paparazzi','boite_a_idees','fondateur','fidele','chasseur_bugs','saisonnier','cupidon'];
// Image SVG 16 × 16 d'une citrouille, utilisée comme image de badge et d'événement.
const PUMPKIN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="3" y="4" width="10" height="10" fill="#E8862A"/><rect x="2" y="6" width="12" height="6" fill="#E8862A"/><rect x="7" y="1" width="2" height="3" fill="#3C7A3A"/><rect x="5" y="7" width="2" height="2" fill="#1a1a1a"/><rect x="9" y="7" width="2" height="2" fill="#1a1a1a"/><rect x="5" y="11" width="6" height="1" fill="#1a1a1a"/></svg>');
// Base simulée : données de départ, une clé par table Supabase.
const DB = {
  hg_profiles: people.map(([p, id], i) => ({ id, pseudo: p, is_admin: id === ME, color: '#4F6A8F', avatar_url: null, created_at: iso(-300 + i), joined_on: i === 1 ? '2019-03-12' : null, birthday: null })),
  // S.themeSetting : réglage du thème (forçage) ; S.themes : thèmes supplémentaires (test du thème Raclette)
  hg_settings: [{ key: 'theme', value: S.themeSetting || { mode: 'auto' } }, { key: 'bot', value: { notify: {} } }],
  hg_themes: [...((S.themes || []).some((t) => t.slug === 'classique') ? [] : [{ slug: 'classique', name: 'Classique', is_default: true, active: true, effect: 'aucun', emojis: [], colors: {} }]), ...(S.themes || [])],
  hg_badges: [...AUTO.map((c, i) => ({ code: c, name: c.replace(/_/g, ' '), description: 'Badge automatique', image_url: null, sort: i * 10 })),
    { code: 'roi_karaoke', name: 'Roi du karaoké', description: 'A chanté plus fort que tout le monde', image_url: null, sort: 200 },
    { code: 'citrouille', name: 'Chasseur de citrouilles', description: 'A attrapé des citrouilles d\'Halloween', image_url: PUMPKIN, sort: 210, levels_enabled: true, metric: 'event_captures', event_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      levels: [{ level: 1, threshold: 1, name: 'Bronze' }, { level: 2, threshold: 3, name: 'Argent' }, { level: 3, threshold: 10, name: 'Or' }] },
    { code: 'flocon', name: 'Flocon d\'or', description: 'A attrapé un flocon de Noël', image_url: null, sort: 220, levels_enabled: false, levels: [] }],
  hg_user_badges: [{ user_id: U(2), badge_code: 'roi_karaoke', awarded_at: iso(-3), level: 1 },
    { user_id: ME, badge_code: 'fidele', awarded_at: iso(-200), level: 2 }, { user_id: ME, badge_code: 'citrouille', awarded_at: iso(-1), level: 1 },
    { user_id: ME, badge_code: 'flocon', awarded_at: iso(-305), level: 1 }, { user_id: U(2), badge_code: 'citrouille', awarded_at: iso(-1), level: 2 }],
  hg_invites: [
    { code: 'HG-ABCD', created_by: ME, used_by: null, created_at: iso(-2), link_id: null },
    { code: 'HG-K7P2QX', created_by: ME, used_by: U(3), used_at: iso(-1), created_at: iso(-1.2), link_id: 'L1', expires_at: iso(1) },
    { code: 'HG-M3N8RT', created_by: ME, used_by: null, created_at: iso(-0.3), link_id: 'L1', expires_at: iso(1.7) },
    { code: 'HG-ZZ22AA', created_by: ME, used_by: null, created_at: iso(-4), link_id: 'L1', expires_at: iso(-2) },
  ],
  hg_invite_links: [
    { id: 'L1', token: 'a1b2c3d4e5f6a1b2c3d4e5f6', label: 'Soirée raclette', active: true, max_codes: 10, codes_generated: 3, expires_at: iso(20), created_by: ME, created_at: iso(-5) },
    { id: 'L2', token: 'ffff0000ffff0000ffff0000', label: 'Ancien lien Discord', active: false, max_codes: null, codes_generated: 0, expires_at: null, created_by: ME, created_at: iso(-40) },
  ],
  hg_ss_editions: S.editions || [
    { id: 'E25', year: 2025, status: 'inscriptions', budget: '20 CHF', drawn_at: null, shared_fields: [] },
    { id: 'E24', year: 2024, status: 'termine', budget: '20 CHF', drawn_at: iso(-300), shared_fields: [] },
  ],
  hg_ss_participants: people.map(([, id]) => ({ edition_id: 'E25', user_id: id, joined_at: iso(-5) })),
  hg_ss_exclusions: [{ edition_id: 'E25', user_a: U(2), user_b: U(3) }],
  hg_ss_assignments: [{ edition_id: 'E24', giver_id: ME, receiver_id: U(2) }, { edition_id: 'E24', giver_id: U(2), receiver_id: ME }],
  hg_dyn_events: [
    { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'La citrouille d\'Halloween', description: 'Des citrouilles se baladent sur le site toute la semaine.', image_url: PUMPKIN, emoji: '🎃',
      starts_at: iso(-2), ends_at: iso(5), probability: 1, max_per_page: 2, max_per_user: 20, max_total: null, duration_ms: 7000, size_px: 88,
      badge_code: 'citrouille', announce: true, announced_start_at: iso(-2), announced_end_at: null, active: true, created_by: ME, created_at: iso(-3) },
    { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Flocons de Noël', description: 'Attrape les flocons !', image_url: null, emoji: '❄️',
      starts_at: iso(-320), ends_at: iso(-300), probability: 0.1, max_per_page: 1, max_per_user: null, max_total: 50, duration_ms: 6000, size_px: 64,
      badge_code: 'flocon', announce: true, announced_start_at: iso(-320), announced_end_at: iso(-300), active: true, created_by: ME, created_at: iso(-330) },
    { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'Œufs de Pâques', description: null, image_url: null, emoji: '🥚',
      starts_at: iso(150), ends_at: iso(152), probability: 0.05, max_per_page: 3, max_per_user: null, max_total: null, duration_ms: 5000, size_px: 56,
      badge_code: null, announce: false, announced_start_at: null, announced_end_at: null, active: true, created_by: ME, created_at: iso(-1) },
  ],
  hg_dyn_captures: [],
  hg_pages: [['accueil','Accueil','membres',false],['secret-santa','Secret Santa','membres',true],['irl','IRL','membres',true],['historique','Historique','membres',true],['messages','Messages','membres',true],['evenements','Événements','membres',false],['membre',"Carte d'identité & annuaire",'membres',false],['recap','Récap annuel','membres',false],['cartes','Cartes à collectionner','admin',true]].map(([slug,label,mode,in_nav],sort)=>({slug,label,mode,in_nav,sort})),
  hg_page_access: S.access || [],
  hg_ideas: [], hg_support: [], hg_activity: [], hg_messages: [], hg_events: [], hg_event_rsvps: [], hg_photos: [], hg_profile_info: [],
  hg_card_trades: S.trades || [], hg_card_trade_items: S.tradeItems || [], // S.trades, S.tradeItems : offres d'échange (parcours-compteurs.cjs, parcours-echanges-expiration.cjs)
  // Drops de cartes (card-drops.js, admin-cards/drops.js) : scénario S.drops / S.dropClaims (dates ISO)
  // Drops de cartes : ce que la page reçoit (scénario S.drops et S.dropClaims).
  hg_card_drops: S.drops || [], hg_card_drop_claims: S.dropClaims || [],
  // Dons de boosters entre membres (migration 067) : scénario S.boosterGifts, lignes au format de la table.
  hg_booster_gifts: S.boosterGifts || [],
};
// Le badge « Fidèle » a des niveaux, pour la page de badges.
Object.assign(DB.hg_badges.find((b) => b.code === 'fidele'), { name: 'Fidèle', description: 'Membre du gang depuis des années', levels_enabled: true, metric: 'anciennete_annees',
  levels: [{ level: 1, threshold: 1, name: 'Bronze' }, { level: 2, threshold: 3, name: 'Argent' }, { level: 3, threshold: 5, name: 'Or', image_url: PUMPKIN }] });
// L'administrateur est membre depuis quatre ans (ancienneté des badges).
DB.hg_profiles[0].created_at = iso(-4 * 365);
// Captures de démonstration : quelques joueurs ont attrapé des citrouilles, puis des flocons.
for (const [u, n] of [[U(2), 4], [ME, 2], [U(3), 1]]) for (let i = 0; i < n; i++) DB.hg_dyn_captures.push({ event_id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: u, captured_at: iso(-1 + i / 10) });
for (const [u, n] of [[U(4), 6], [ME, 3], [U(5), 2], [U(2), 1]]) for (let i = 0; i < n; i++) DB.hg_dyn_captures.push({ event_id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: u, captured_at: iso(-310 + i / 10) });
// Rend la base et le journal lisibles par les tests (page.evaluate).
window.__DB = DB; window.__LOG = [];
/* ---------- Collection de cartes (données factices) ---------- */
// ---- données cartes (factices) ----
{
  // Deux séries : « Première édition » et « Saison 2 » (ouverte seulement si le scénario ne demande pas set2Open).
  const sets = [{ id: 'SET1', code: 'hg1', name: 'Première édition', description: 'Les premiers membres du gang.', starts_at: null, ends_at: null, active: true, sort: 1 },
                { id: 'SET2', code: 'hg2', name: 'Saison 2', description: null, starts_at: S.set2Open ? null : iso(30), ends_at: null, active: true, sort: 2 }];
  // Raretés des douze cartes de la première série, dans l'ordre des numéros.
  const R = ['commune','commune','commune','peu_commune','peu_commune','rare','rare','epique','legendaire','mythique','identite','commune'];
  // Familles des douze cartes de la première série (membre, moment, lieu, objet, évènement), même ordre que R.
  const F = ['membre','moment','lieu','objet','evenement','membre','lieu','objet','moment','membre','membre','objet'];
  // Cartes de la première série, construites à partir de R et F.
  const cards = R.map((r, i) => ({ id: 'C' + (i + 1), set_id: 'SET1', number: i + 1, name: ['Ethan','La Fontaine','Café du Marché','Pompe à essence','Soirée pizza','Alice','Grapeseed','Cocktail','Braquage raté','Bruno','Carte identité Chloé','Tracteur'][i], family: F[i], rarity: r,
    image_url: null, flavor: 'Un souvenir qui fait sourire le gang.', member_id: null, can_shiny: i !== 0, tradeable: true, craftable: r !== 'identite', max_copies: r === 'identite' ? 3 : null, active: true }));
  // Une carte de la série « Saison 2 » (identifiant C13).
  cards.push({ id: 'C13', set_id: 'SET2', number: 1, name: 'Saison deux', family: 'moment', rarity: 'rare', image_url: null, flavor: null, can_shiny: true, tradeable: true, craftable: true, max_copies: null, active: true });
  // S.bigCards : N cartes supplémentaires « Carte test N » (pagination de la liste admin)
  for (let i = 0; i < (S.bigCards || 0); i++) cards.push({ ...cards[0], id: 'B' + i, number: 1000 + i, name: 'Carte test ' + i, rarity: 'commune', family: 'objet', max_copies: null, member_id: null });
  // Scénario « uniques » (parcours-cartes-uniques.cjs) : série « Hors série » et une carte unique C14 (un seul exemplaire).
  // S.uniqueTaken : Alice a déjà son exemplaire ; S.uniqueOwned : c'est moi qui le possède.
  if (S.uniques) {
    sets.push({ id: 'SETHS', code: 'hors-serie', name: 'Hors série', description: 'Cartes uniques, en un seul exemplaire : à gagner lors d\'un événement ou offertes par l\'admin.', starts_at: null, ends_at: null, active: true, sort: 9999 });
    cards.push({ id: 'C14', set_id: 'SETHS', number: 1, name: 'La Carte unique', family: 'unique', rarity: 'unique', image_url: null, flavor: 'Il n\'en existe qu\'une.',
      member_id: null, can_shiny: false, tradeable: true, craftable: false, max_copies: 1, active: true });
    // Unique à plusieurs exemplaires (S.uniqueMulti = { taken: n }) : C15, 3 exemplaires numérotés, n déjà donnés à Alice (1, 2, 3…).
    if (S.uniqueMulti) cards.push({ id: 'C15', set_id: 'SETHS', number: 2, name: 'La Carte à trois', family: 'unique', rarity: 'unique', image_url: null, flavor: 'Il en existe trois.',
      member_id: null, can_shiny: false, tradeable: true, craftable: false, max_copies: 3, active: true });
  }
  // Scénario « drop d'une série fermée » : série SETX inactive, carte CX1 que le membre connecté a attrapée (drop).
  if (S.closedDrop) {
    sets.push({ id: 'SETX', code: 'foret', name: 'La forêt enchantée', description: null, starts_at: null, ends_at: null, active: false, sort: 50 });
    cards.push({ id: 'CX1', set_id: 'SETX', number: 1, name: 'Libellule', family: 'objet', rarity: 'peu_commune', image_url: null, flavor: null,
      member_id: null, can_shiny: true, tradeable: true, craftable: true, max_copies: null, active: true });
  }
  // Scénario « bigCollection » (parcours-collection-longue.cjs, idée Q5) : 2 000 cartes réparties en 4 séries ouvertes,
  // 5 000 exemplaires pour le membre connecté (doublons gardés pour la fabrication). Les noms contiennent « Raclette » 1 fois sur 50.
  if (S.bigCollection) {
    const RR = ['commune', 'commune', 'peu_commune', 'rare', 'epique', 'legendaire'];
    for (let k = 0; k < 4; k++) sets.push({ id: 'SETB' + k, code: 'big' + k, name: 'Grande série ' + (k + 1), description: null, starts_at: null, ends_at: null, active: true, sort: 10 + k });
    for (let i = 0; i < 2000; i++) cards.push({ id: 'G' + i, set_id: 'SETB' + (i % 4), number: Math.floor(i / 4) + 1, name: (i % 50 === 7 ? 'Raclette fondue ' : 'Carte géante ') + i, family: F[i % F.length], rarity: RR[i % RR.length],
      image_url: null, flavor: null, member_id: null, can_shiny: true, tradeable: true, craftable: true, max_copies: null, active: true });
  }
  DB.hg_card_sets = sets; DB.hg_cards = cards;
// Scénario « cardImages » (parcours admin des visuels) : quelques cartes avec une image (le visuel du site, pas le logo).
if (S.cardImages) for (const id of ['C1', 'C2', 'C3', 'C4', 'C7']) { const k = cards.find((c) => c.id === id); if (k) k.image_url = PUMPKIN; }
  // Mes exemplaires : C1 x3 (dont une brillante), C2 x1, C3 x2, C7 x1 brillante, C11 (identite) x1 numéroté, C9 x1 (en échange)
  /** Fabrique un exemplaire possédé par le membre connecté ; extra remplace les champs par défaut. */
  const cp = (id, card, extra = {}) => ({ id, card_id: card, owner_id: ME, shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null, ...extra });
  DB.hg_card_copies = [cp(1,'C1'), cp(2,'C1',{shiny:true}), cp(3,'C1'), cp(4,'C2'), cp(5,'C3'), cp(6,'C3',{source:'fabrication'}), cp(7,'C7',{shiny:true}), cp(8,'C11',{serial:1, max_copies:3}), cp(9,'C9',{locked_trade:'T1'}), cp(10,'C5'), cp(11, 'C5', {shiny: true})];
  if (S.bigCollection) for (let i = 0; i < 5000; i++) DB.hg_card_copies.push(cp(10000 + i, 'G' + ((i * 7) % 1800), { shiny: i % 97 === 0 }));
  // Liste de souhaits du membre connecté : la carte C4.
  DB.hg_card_wishlist = [{ user_id: ME, card_id: 'C4', created_at: iso(-1) }];
  // Favoris du membre connecté (migration 078) : C1 et C3 (possédées). S.favorites remplace la liste de départ.
  DB.hg_card_favorites = (S.favorites || [{ card_id: 'C1' }, { card_id: 'C3' }]).map((f) => ({ user_id: ME, card_id: f.card_id, created_at: iso(-1) }));
  // Carte unique : un seul exemplaire existe, à Alice (S.uniqueTaken) ou à moi (S.uniqueOwned).
  if (S.uniqueTaken) DB.hg_card_copies.push({ id: 501, card_id: 'C14', owner_id: U(2), shiny: false, serial: 1, source: 'admin', obtained_at: iso(-1), locked_trade: null, recycled_at: null });
  if (S.closedDrop) DB.hg_card_copies.push({ id: 601, card_id: 'CX1', owner_id: ME, shiny: false, serial: null, source: 'drop', obtained_at: iso(0), locked_trade: null, recycled_at: null });
  if (S.uniqueOwned) DB.hg_card_copies.push({ id: 502, card_id: 'C14', owner_id: ME, shiny: false, serial: 1, source: 'evenement', obtained_at: iso(-1), locked_trade: null, recycled_at: null });
  // Unique à plusieurs exemplaires (S.uniqueMulti.taken) : les numéros 1 à n sont à Alice.
  if (S.uniqueMulti) for (let i = 1; i <= S.uniqueMulti.taken; i++) DB.hg_card_copies.push({ id: 510 + i, card_id: 'C15', owner_id: U(2), shiny: false, serial: i, source: 'admin', obtained_at: iso(-1), locked_trade: null, recycled_at: null });
  // Scénario « echanges » (parcours-echanges-filtres.cjs) : Alice (U(2)) a des doublons et des cartes d'une autre série ;
  // j'ai aussi une carte de la série « Saison 2 ». Ailleurs, rien ne change.
  if (S.echanges) {
    /** Comme cp, pour un exemplaire possédé par Alice (scénario echanges). */
    const cpa = (id, card, extra = {}) => ({ id, card_id: card, owner_id: U(2), shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null, ...extra });
    DB.hg_card_copies.push(cpa(101,'C1'), cpa(102,'C1'), cpa(103,'C5'), cpa(104,'C8', { serial: 3 }), cpa(105,'C13'), cpa(106,'C12'), cpa(107,'C12'), cpa(108,'C9', { shiny: true }),
      { id: 12, card_id: 'C13', owner_id: ME, shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null });
  }
  // Scénario « bigTrade » (parcours-echanges-filtres.cjs, idée Q5) : Alice a 400 exemplaires de plus (12 cartes en
  // rotation). Son côté « Ses cartes » dans l'éditeur dépasse le seuil de lots (300) : dessin par lots de 120.
  if (S.bigTrade) for (let i = 0; i < 400; i++) DB.hg_card_copies.push({ id: 30000 + i, card_id: 'C' + (1 + (i % 12)), owner_id: U(2), shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null });
  // Scénario « suggest » (parcours-echanges-suggeres.cjs) : échanges possibles.
  //  - moi : souhaits C4 et C1 ; doublons C1 (x3), C3 (x2), C5 (x2) ;
  //  - Alice : C1 x2 (un doublon que je souhaite) et souhaits C1, C5 (mes doublons) => échange gagnant-gagnant ;
  //  - Bruno : C4 x2 (un doublon que je souhaite) et aucun souhait ;
  //  - Chloé : souhait C3 (un de mes doublons), rien à offrir ;
  //  - David (fantôme) : souhaite C3 mais n'apparaît jamais.
  if (S.suggest) {
    const cpo = (id, card, owner, extra = {}) => ({ id, card_id: card, owner_id: owner, shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null, ...extra });
    DB.hg_card_copies.push(cpo(101, 'C1', U(2)), cpo(102, 'C1', U(2)), cpo(201, 'C4', U(3)), cpo(202, 'C4', U(3)));
    DB.hg_card_wishlist.push({ user_id: ME, card_id: 'C1', created_at: iso(-1) },
      { user_id: U(2), card_id: 'C1', created_at: iso(-1) }, { user_id: U(2), card_id: 'C5', created_at: iso(-1) },
      { user_id: U(4), card_id: 'C3', created_at: iso(-1) });
    // David : fantôme, il ne doit pas apparaître dans les suggestions.
    DB.hg_profiles.find((p) => p.id === U(5)).is_ghost = true;
    DB.hg_card_wishlist.push({ user_id: U(5), card_id: 'C3', created_at: iso(-1) });
  }
  // Journal initial des Paillettes ; le journal du bas du bloc le remplace.
  DB.hg_wallet_log = [{ user_id: ME, delta: 20, reason: 'quotidien', created_at: iso(-1) }, { user_id: ME, delta: -100, reason: 'booster', created_at: iso(-3) }, { user_id: ME, delta: 15, reason: 'reponse_sortie', created_at: iso(-5) }];
  // Portefeuille du membre connecté : Paillettes (S.bal), pity (S.pity), cadeaux (S.gift).
  DB.hg_wallets = [{ user_id: ME, paillettes: S.bal ?? 230, pity_epique: S.pity ?? 3, daily_streak: 2, last_daily: null, gift_boosters: S.gift ?? 0 }];
// Panel admin (polish cartes) : quêtes, défis et journal des Paillettes
// Quêtes de la semaine (panel admin, Jeu de cartes › Quêtes).
DB.hg_card_quests_templates = [
  { code: 'boosters_5', label: 'Ouvrir 5 boosters', metric: 'boosters_ouverts', target: 5, reward: 80, active: true, sort: 1 },
  { code: 'photo_1', label: 'Ajouter une photo', metric: 'photos_ajoutees', target: 1, reward: 30, active: true, sort: 2 },
];
// Défi de test (panel admin, Défis).
DB.hg_challenges = [{ id: '00000000-0000-4000-8000-0000000000c1', title: 'Vingt sorties ce trimestre', description: null, metric: 'sorties_tenues', target: 20, reward: 100, starts_at: iso(-10), ends_at: iso(80), active: true }];
// Journal des Paillettes de la fin : il remplace celui du début (une seule entrée gardée).
DB.hg_wallet_log = [{ user_id: ME, delta: 100, reason: 'booster', ref: null, created_at: iso(-1) }];
}
/* ---------- Types de boosters (SPEC booster-system §1) : données et états du faux backend ---------- */
// Les neuf types, valeurs définitives de la spec. Taux en pourcentage ; chaque ligne fait 100.
// S.typeOverrides = { id: { champ: valeur } } remplace des champs d'un type (fusion superficielle, scénario de test).
const TAUX = (commune, peu, rare, epique, legendaire, mythique, identite) => ({ commune, peu_commune: peu, rare, epique, legendaire, mythique, identite });
const TYPES_BASE = [
  { id: 'classique', name: 'Classique', price: 100, size: 5, rates: TAUX(60, 25, 10, 4, 0.88, 0.1, 0.02), shiny_rate: 3, pity_epique: 20, pool: 'tous', weekly_limit: null, free_daily: true, style: 'cart--classique', sort: 10 },
  { id: 'serie', name: 'Série', price: 150, size: 5, rates: TAUX(60, 25, 10, 4, 0.88, 0.1, 0.02), shiny_rate: 3, pity_epique: 20, pool: 'serie', weekly_limit: null, free_daily: false, style: 'cart--serie', sort: 20 },
  { id: 'argente', name: 'Argenté', price: 250, size: 5, rates: TAUX(45, 30, 14.88, 8, 2, 0.1, 0.02), shiny_rate: 4, pity_epique: 20, pool: 'tous', weekly_limit: null, free_daily: false, style: 'cart--argente', sort: 30 },
  { id: 'dore', name: 'Doré', price: 350, size: 5, rates: TAUX(34, 31, 18.68, 12, 4, 0.3, 0.02), shiny_rate: 4, pity_epique: 20, pool: 'tous', weekly_limit: null, free_daily: false, style: 'cart--dore', sort: 40 },
  { id: 'diamant', name: 'Diamant', price: 500, size: 5, rates: TAUX(15, 28, 25, 20, 10, 1.98, 0.02), shiny_rate: 10, pity_epique: 0, pool: 'tous', weekly_limit: 5, free_daily: false, style: 'cart--diamant', sort: 50 },
  { id: 'quitte_double', name: 'Quitte ou double', price: 500, size: 5, rates: TAUX(90, 1.5, 1.5, 1.5, 3.98, 1.5, 0.02), shiny_rate: 10, pity_epique: 0, pool: 'tous', weekly_limit: 5, free_daily: false, style: 'cart--quitte', sort: 60 },
  { id: 'holographique', name: 'Holographique', price: 1000, size: 5, rates: TAUX(0, 20, 20, 20, 20, 20, 0), shiny_rate: 10, pity_epique: 0, pool: 'tous', weekly_limit: 1, free_daily: false, style: 'cart--holo', sort: 80 },
  { id: 'collectionneur', name: 'Collectionneur', price: 500, size: 10, rates: TAUX(60, 25, 10, 4, 0.5, 0.4, 0.1), shiny_rate: 3, pity_epique: 20, pool: 'manquantes', weekly_limit: null, free_daily: false, style: 'cart--collection', sort: 70 },
  { id: 'identite', name: 'Identité', price: 10000, size: 5, rates: TAUX(45, 25, 10, 4, 0.5, 0.5, 15), shiny_rate: 3, pity_epique: 0, pool: 'tous', weekly_limit: null, free_daily: false, style: 'cart--identite', sort: 90 },
];
// Table des types (toujours présente ; les RPC typées n'répondent que si scenario.types est vrai).
DB.hg_booster_types = TYPES_BASE.map((t) => ({ description: null, active: true, ...t, ...(S.typeOverrides?.[t.id] ?? {}) }));
// Scénario « boostersPast » (parcours admin des visuels) : un booster d'événement passé (inactif), listé à part dans les sélecteurs.
if (S.boostersPast) DB.hg_booster_types.push({ id: 'noel2025', name: 'Noël 2025', price: 300, size: 5, rates: TAUX(60, 25, 10, 4, 0.88, 0.1, 0.02), shiny_rate: 3, pity_epique: 0, pool: 'tous', weekly_limit: null, free_daily: false, style: 'cart--theme-noel', sort: 100, active: false, description: 'Le booster de l’hiver dernier, plus disponible à la vente.' });
// Stock par type (S.stock = { dore: 2, serie: 1 }), compteurs de garantie épique (S.typePity = { dore: 7 }),
// achats de la semaine (S.boughtWeek = { holographique: 1 }, comptés dans la limite). Tout pour le membre connecté.
// Le stock générique (wallet gift_boosters, S.gift) est compté dans « classique ».
DB.hg_booster_stock = Object.entries(S.stock || {}).map(([type_id, qty]) => ({ user_id: ME, type_id, qty }));
DB.hg_booster_pity = Object.entries(S.typePity || {}).map(([type_id, count]) => ({ user_id: ME, type_id, count }));
DB.hg_booster_purchases = Object.entries(S.boughtWeek || {}).map(([type_id, qty], i) => ({ id: i + 1, user_id: ME, type_id, qty, cost: 0, created_at: new Date().toISOString() }));
// Demandes de don déjà traitées (p_request), pour l'idempotence de hg_booster_gift typé.
DB.hg_booster_gift_refs = [];

// Configuration du jeu lue par la page : prix, taux, recyclage, fabrication, récompenses quotidiennes.
window.__CARDS = { config: { booster_price: 100, booster_size: 5, free_booster_hours: 24, shiny_rate: 3, pity_epique: 10,
  rates: { commune: 60, peu_commune: 25, rare: 10, epique: 4, legendaire: 0.88, mythique: 0.1, identite: 0.02 },
  recycle: { commune: 5, peu_commune: 10, rare: 25, epique: 60, legendaire: 150, mythique: 400, identite: 1000, shiny_multiplier: 3 },
  craft: { commune: 40, peu_commune: 80, rare: 200, epique: 500, legendaire: 1500, shiny_multiplier: 4 }, rewards: { daily: 20, streak_bonus: 5, streak_max: 7 }, max_open_trades: 10 } };

// Compteur utilisé pour produire des identifiants distincts.
let seq = 0;
/**
 * Suggestions d'échanges calculées comme la RPC hg_trade_suggestions (même règle) : membres actifs, doublons
 * vivants, exemplaire libre le plus ancien. Renvoie le même format que la RPC (user_id, want, give, both…).
 * @returns {object[]} lignes triées : deux sens d'abord, puis nombre de cartes, puis pseudo
 */
function suggestionsFromDb() {
  const me = ME;
  const members = new Set(DB.hg_profiles.filter((p) => !p.is_ghost).map((p) => p.id));
  const ok = (c) => { const k = DB.hg_cards.find((x) => x.id === c.card_id); return !!k && k.active !== false && !!k.tradeable; };
  const live = DB.hg_card_copies.filter((c) => !c.recycled_at && ok(c));
  const wish = new Set(DB.hg_card_wishlist.filter((w) => w.user_id === me).map((w) => w.card_id));
  // Mes doublons et l'exemplaire libre le plus ancien de chaque carte (ce que je mets dans l'offre).
  const mine = live.filter((c) => c.owner_id === me);
  const cnt = new Map(); for (const c of mine) cnt.set(c.card_id, (cnt.get(c.card_id) || 0) + 1);
  const giveCopy = new Map();
  for (const c of mine) if ((cnt.get(c.card_id) || 0) >= 2 && c.locked_trade == null && (!giveCopy.has(c.card_id) || Number(c.id) < Number(giveCopy.get(c.card_id)))) giveCopy.set(c.card_id, c.id);
  // Ce que je demande : doublons des autres pour mes souhaits, un exemplaire libre par carte.
  const want = new Map(); const tot = new Map(); const free = new Map();
  for (const c of live) {
    if (c.owner_id === me || !members.has(c.owner_id) || !wish.has(c.card_id)) continue;
    const k = c.owner_id + '|' + c.card_id;
    tot.set(k, (tot.get(k) || 0) + 1);
    if (c.locked_trade == null && (!free.has(k) || Number(c.id) < Number(free.get(k)))) free.set(k, c.id);
  }
  for (const [k, n] of tot) {
    if (n < 2 || !free.has(k)) continue;
    const [uid, card] = k.split('|');
    if (!want.has(uid)) want.set(uid, []);
    want.get(uid).push({ card_id: card, copy_id: Number(free.get(k)) });
  }
  // Ce qu'ils donnent : leurs souhaits qui tombent sur mes doublons.
  const give = new Map();
  for (const w of DB.hg_card_wishlist) {
    if (w.user_id === me || !members.has(w.user_id) || !giveCopy.has(w.card_id)) continue;
    if (!give.has(w.user_id)) give.set(w.user_id, []);
    give.get(w.user_id).push({ card_id: w.card_id, copy_id: Number(giveCopy.get(w.card_id)) });
  }
  const uids = new Set([...want.keys(), ...give.keys()]);
  const rows = [...uids].map((uid) => {
    const p = DB.hg_profiles.find((x) => x.id === uid);
    const w = want.get(uid) || [], g = give.get(uid) || [];
    return { user_id: uid, pseudo: p.pseudo, avatar_url: p.avatar_url, color: p.color, want: w, give: g,
      both: w.length > 0 && g.length > 0, n_want: w.length, n_give: g.length };
  });
  rows.sort((a, b) => Number(b.both) - Number(a.both) || (b.n_want + b.n_give) - (a.n_want + a.n_give) || a.pseudo.localeCompare(b.pseudo, 'fr'));
  return rows;
}
/* ---------- Boosters typés (scénario S.types) : aides communes aux RPC hg_booster_* ---------- */
// Raretés dans l'ordre croissant ; « épique ou mieux » = rang 3 et plus.
const RARETES = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire', 'mythique', 'identite'];
/** Rang d'une rareté (-1 si inconnue, « unique » par exemple). */
const rangRarete = (r) => RARETES.indexOf(r);
// Compteurs des boosters typés : identifiants d'exemplaires (au-delà des autres fausses données) et nombre de tirages.
let copieTypee = 3000;
let ouvertures = 0;
/** Réponse d'erreur au format de supabase-js. */
const erreur = (message) => ({ data: null, error: { message } });
/** Réponse d'une fonction absente (migration 069 non appliquée) : même erreur que PostgREST, pour tester le repli. */
const absente = (fn) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
/** Type de booster actif d'après son identifiant, ou undefined. */
const typeBooster = (id) => DB.hg_booster_types.find((t) => t.id === id && t.active !== false);
/** Nom d'un type, même désactivé (historique des dons). */
const nomType = (id) => DB.hg_booster_types.find((t) => t.id === id)?.name ?? null;
/** Portefeuille du membre connecté. */
const portefeuille = () => DB.hg_wallets.find((x) => x.user_id === ME);
/**
 * Lundi 00:00 à Zurich de la semaine courante, en millisecondes (comme les quêtes).
 * Heure murale de Zurich lue via Intl, puis convertie : le décalage est celui de l'instant courant.
 */
function debutSemaine(t = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }).formatToParts(t).map((x) => [x.type, x.value]));
  const mural = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const decalage = mural - (t - (t % 1000));
  const depuisLundi = (['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) + 6) % 7;
  return Date.UTC(+p.year, +p.month - 1, +p.day - depuisLundi) - decalage;
}
/** Boosters achetés cette semaine pour le type (achats et mises en stock ; les dons et cadeaux ne comptent pas). */
const achatsSemaine = (id) => DB.hg_booster_purchases.filter((r) => r.user_id === ME && r.type_id === id && new Date(r.created_at).getTime() >= debutSemaine())
  .reduce((s, r) => s + r.qty, 0);
/** Stock d'un type pour un membre ; le stock générique (gift_boosters) s'ajoute à « classique » du membre connecté. */
function stockDe(id, uid = ME) {
  const n = DB.hg_booster_stock.find((r) => r.user_id === uid && r.type_id === id)?.qty ?? 0;
  return n + (id === 'classique' && uid === ME ? (portefeuille()?.gift_boosters ?? 0) : 0);
}
/** Ajoute n boosters du type au stock d'un membre. */
function ajouterStock(uid, id, n) {
  let r = DB.hg_booster_stock.find((x) => x.user_id === uid && x.type_id === id);
  if (!r) DB.hg_booster_stock.push(r = { user_id: uid, type_id: id, qty: 0 });
  r.qty += n;
}
/** Retire n boosters du stock du membre connecté : d'abord la ligne du type, puis le stock générique (classique). */
function retirerStock(id, n) {
  const r = DB.hg_booster_stock.find((x) => x.user_id === ME && x.type_id === id);
  const pris = Math.min(n, r?.qty ?? 0);
  if (r) r.qty -= pris;
  if (n - pris > 0 && id === 'classique') portefeuille().gift_boosters -= n - pris;
}
/** Compteur de garantie épique du type pour le membre connecté. */
const pityDe = (id) => DB.hg_booster_pity.find((r) => r.user_id === ME && r.type_id === id)?.count ?? 0;
/** Met le compteur de garantie du type à n. */
function fixerPity(id, n) {
  let r = DB.hg_booster_pity.find((x) => x.user_id === ME && x.type_id === id);
  if (!r) DB.hg_booster_pity.push(r = { user_id: ME, type_id: id, count: 0 });
  r.count = n;
}
/**
 * Cartes possibles pour un type : cartes actives des séries actives et commencées, hors « unique » ;
 * pour « serie » seulement la série demandée ; pour « manquantes » seulement celles que le membre ne possède pas
 * (S.collectorMissing = N ne garde que les N premières, pour tester le remboursement).
 */
function poolType(type, set) {
  const maint = Date.now();
  const ouvertes = new Set(DB.hg_card_sets.filter((s) => s.active !== false && (!s.starts_at || new Date(s.starts_at) <= maint)).map((s) => s.id));
  let cartes = DB.hg_cards.filter((c) => c.active !== false && ouvertes.has(c.set_id) && c.rarity !== 'unique');
  if (type.pool === 'serie') cartes = cartes.filter((c) => c.set_id === set);
  if (type.pool === 'manquantes') {
    const possedees = new Set(DB.hg_card_copies.filter((x) => x.owner_id === ME && !x.recycled_at).map((x) => x.card_id));
    cartes = cartes.filter((c) => !possedees.has(c.id));
    if (S.collectorMissing != null) cartes = cartes.slice(0, S.collectorMissing);
  }
  return cartes;
}
/** Carte d'un booster au format de la RPC : exemplaire donné, brillance et champs comme hg_open_booster_req. */
const carteSortie = (c, copie, shiny) => ({ copy_id: copie, card_id: c.id, name: c.name, rarity: c.rarity, family: c.family, image_url: null,
  flavor: c.flavor, number: c.number, shiny, serial: null, max_copies: c.max_copies ?? null });
/** Tire n cartes distinctes de la liste à partir de l'indice k (même règle que la fausse hg_open_booster_req). */
function piocher(k, liste, n) {
  if (!liste.length) return [];
  const nb = Math.min(n, liste.length);
  return Array.from({ length: nb }, (_, i) => liste[(k * n + i) % liste.length]);
}
/** Les types actifs avec leur stock, leurs achats de la semaine et ce qu'il reste (réponse de hg_booster_types_me). */
function typesMoi() {
  const types = DB.hg_booster_types.filter((t) => t.active !== false).sort((a, b) => a.sort - b.sort).map((t) => {
    const achetes = achatsSemaine(t.id);
    const { active, ...champs } = t;
    return { ...champs, stock: stockDe(t.id), pity_count: pityDe(t.id), bought_week: achetes,
      remaining_week: t.weekly_limit == null ? null : Math.max(0, t.weekly_limit - achetes) };
  });
  return { data: { types, free_booster_at: S.freeAt ?? iso(-0.1), week_ends_at: new Date(debutSemaine() + 7 * 864e5).toISOString() }, error: null };
}
/** hg_booster_buy typé : met en stock ; p_type absent = classique. Limite hebdomadaire et Paillettes contrôlées. */
function achatTypee(args) {
  const type = typeBooster(args.p_type ?? 'classique');
  if (!type) return erreur('Type de booster inconnu');
  const q = args.p_qty ?? 1;
  if (q < 1 || q > 10) return erreur('On peut acheter de 1 à 10 boosters à la fois');
  const ref = args.p_request != null ? 'achat:' + args.p_request : null;
  if (ref && DB.hg_wallet_log.some((l) => l.user_id === ME && l.ref === ref)) return erreur('achat_deja_fait');
  const w = portefeuille();
  const deja = achatsSemaine(type.id);
  // Mode sans limite (S.god) : pas de limite, pas de prix, pas d'achat compté.
  if (!S.god && type.weekly_limit != null && deja + q > type.weekly_limit) {
    return erreur(`Limite atteinte : il te reste ${Math.max(0, type.weekly_limit - deja)} booster(s) « ${type.name} » cette semaine`);
  }
  const cout = S.god ? 0 : type.price * q;
  if (w.paillettes < cout) return erreur(`Pas assez de Paillettes (il en faut ${cout})`);
  w.paillettes -= cout;
  if (cout > 0 || ref) DB.hg_wallet_log.unshift({ user_id: ME, delta: -cout, reason: 'booster', ref, created_at: new Date().toISOString() });
  if (!S.god) DB.hg_booster_purchases.push({ id: DB.hg_booster_purchases.length + 1, user_id: ME, type_id: type.id, qty: q, cost: cout, created_at: new Date().toISOString() });
  ajouterStock(ME, type.id, q);
  const restant = type.weekly_limit == null ? null : Math.max(0, type.weekly_limit - achatsSemaine(type.id));
  return { data: { type: type.id, qty: q, cost: cout, stock: stockDe(type.id), paillettes: w.paillettes, remaining_week: restant }, error: null };
}
/**
 * hg_booster_open typé : ouvre un booster du stock, l'achète (mode 'achat') ou prend le gratuit (mode 'gratuit').
 * Garantie épique par type, remboursement des cartes non données (Collectionneur ou pool trop petit),
 * idempotence par p_request (ref « booster:<requête> », comme la RPC).
 */
function ouvrirTypee(args) {
  const type = typeBooster(args.p_type ?? 'classique');
  if (!type) return erreur('Type de booster inconnu');
  const mode = args.p_mode;
  if (!['achat', 'stock', 'gratuit'].includes(mode)) return erreur("Mode d'ouverture inconnu");
  const ref = args.p_request != null ? 'booster:' + args.p_request : null;
  if (ref && DB.hg_wallet_log.some((l) => l.user_id === ME && l.ref === ref)) return erreur('booster_deja_ouvert');
  if (type.pool === 'serie' && !args.p_set) return erreur('Choisis une série');
  if (type.pool === 'serie' && !DB.hg_card_sets.some((s) => s.id === args.p_set)) return erreur('Série inconnue');
  const w = portefeuille();
  if (mode === 'achat' && !S.god) {
    const deja = achatsSemaine(type.id);
    if (type.weekly_limit != null && deja + 1 > type.weekly_limit) {
      return erreur(`Limite atteinte : il te reste ${Math.max(0, type.weekly_limit - deja)} booster(s) « ${type.name} » cette semaine`);
    }
    if (w.paillettes < type.price) return erreur(`Pas assez de Paillettes (il en faut ${type.price})`);
  }
  if (mode === 'stock' && stockDe(type.id) < 1) return erreur('Aucun booster de ce type en stock');
  if (mode === 'gratuit') {
    if (!type.free_daily) return erreur("Ce booster n'est pas gratuit");
    // Libre une fois le délai passé, et une seule fois (marqué par une ligne « booster_gratuit » du journal).
    const libre = new Date(S.freeAt ?? iso(-0.1)).getTime() <= Date.now() && !DB.hg_wallet_log.some((l) => l.user_id === ME && l.reason === 'booster_gratuit');
    if (!libre) return erreur("Le booster gratuit n'est pas encore disponible");
  }
  // Tirage : la liste des cartes possibles, puis la garantie épique si le compteur atteint son seuil.
  const liste = poolType(type, args.p_set);
  const k = ouvertures++;
  const n = type.size;
  let choisies = piocher(k, liste, n);
  if (type.pity_epique > 0 && pityDe(type.id) + 1 >= type.pity_epique && !choisies.some((c) => rangRarete(c.rarity) >= 3)) {
    const epique = liste.find((c) => rangRarete(c.rarity) >= 3 && !choisies.includes(c));
    if (epique) choisies = [...choisies.slice(0, -1), epique];
  }
  const cartes = choisies.map((c, i) => carteSortie(c, copieTypee++, (k * n + i) % 7 === 0));
  for (const c of cartes) DB.hg_card_copies.push({ id: c.copy_id, card_id: c.card_id, owner_id: ME, shiny: c.shiny, serial: null, source: 'booster',
    obtained_at: new Date().toISOString(), locked_trade: null, recycled_at: null });
  if (type.pity_epique > 0) fixerPity(type.id, cartes.some((c) => rangRarete(c.rarity) >= 3) ? 0 : pityDe(type.id) + 1);
  // Paiement : achat (Paillettes, compté dans la limite) ; stock (1 retiré) ; gratuit (une seule fois par délai).
  const created_at = new Date().toISOString();
  if (mode === 'achat' && !S.god) {
    w.paillettes -= type.price;
    DB.hg_wallet_log.unshift({ user_id: ME, delta: -type.price, reason: 'booster', ref, created_at });
    DB.hg_booster_purchases.push({ id: DB.hg_booster_purchases.length + 1, user_id: ME, type_id: type.id, qty: 1, cost: type.price, created_at });
  }
  if (mode === 'stock') retirerStock(type.id, 1);
  if (mode === 'gratuit') DB.hg_wallet_log.unshift({ user_id: ME, delta: 0, reason: 'booster_gratuit', ref, created_at });
  // Remboursement : prix / taille du booster pour chaque carte non donnée (rien en mode sans limite).
  const refund = S.god ? 0 : (type.price / type.size) * (n - cartes.length);
  if (refund > 0) {
    w.paillettes += refund;
    DB.hg_wallet_log.unshift({ user_id: ME, delta: refund, reason: 'remboursement', ref: ref ? ref + ':remb' : null, created_at });
  }
  DB.hg_wallet_log.unshift({ user_id: ME, delta: 0, reason: 'booster_requete', ref, created_at });
  w.boosters_opened = (w.boosters_opened ?? 4) + 1;
  // Annonce : une carte légendaire ou plus écrit une ligne d'activité.
  for (const c of cartes) if (rangRarete(c.rarity) >= 4) DB.hg_activity.unshift({ user_id: ME, kind: 'cartes', text: 'Ethan a obtenu « ' + c.name + ' » !', created_at });
  const best = cartes.reduce((b, c) => (rangRarete(c.rarity) > rangRarete(b) ? c.rarity : b), 'commune');
  return { data: { cards: cartes, best, demandees: n, livrees: cartes.length, type: type.id, mode, stock: stockDe(type.id), refund }, error: null };
}
/** hg_booster_gift typé : donne q boosters d'un type du stock à un membre (le journal garde le type).
 * p_request : une même demande rejouée répond « don_deja_fait » (le don n'est pas refait). Les boosters Collectionneur ne s'offrent pas. */
function donTypee(args) {
  const dest = DB.hg_profiles.find((p) => p.id === args.p_to);
  if (!dest || dest.id === ME || dest.is_ghost) return erreur('Destinataire invalide');
  const type = typeBooster(args.p_type ?? 'classique');
  if (!type) return erreur('Type de booster inconnu');
  if (type.pool === 'manquantes') return erreur('Les boosters Collectionneur ne s\'offrent pas');
  const ref = args.p_request != null ? 'don:' + args.p_request : null;
  if (ref && DB.hg_booster_gift_refs.includes(ref)) return erreur('don_deja_fait');
  const q = args.p_qty ?? 1;
  if (q < 1 || q > 10) return erreur('On peut offrir de 1 à 10 boosters à la fois');
  const n = stockDe(type.id);
  if (n < q) return erreur(`Tu n'as que ${n} booster(s) « ${type.name} » en stock`);
  const msg = (args.p_message ?? '').trim().slice(0, 300) || null;
  if (ref) DB.hg_booster_gift_refs.push(ref);
  retirerStock(type.id, q);
  ajouterStock(dest.id, type.id, q);
  DB.hg_booster_gifts.push({ id: DB.hg_booster_gifts.length + 1, from_user: ME, to_user: dest.id, type_id: type.id, qty: q, message: msg, created_at: new Date().toISOString() });
  return { data: { type: type.id, qty: q, stock: stockDe(type.id) }, error: null };
}

/** Lit la colonne c d'une ligne (valeur brute, sans transformation). */
const getv = (r, c) => r[c];
/* ---------- Requêtes factices (faux .from()) ---------- */
/** Requête factice : chaînage de filtres et d'opérations, exécutée quand on l'attend (await), comme PostgREST. */
class Q {
  /** Prépare une requête sur la table t, en lecture (select) par défaut. */
  constructor(t) { this.t = t; this.f = []; this.one = false; this.op = 'select'; this.payload = null; this.ret = false; }
  /** Choisit les colonnes : sans effet ici, toutes les colonnes sont renvoyées. */
  // o.head : seulement le nombre de lignes (count), comme PostgREST avec { count: 'exact', head: true }
  select(_c, o) { if (this.op !== 'select') this.ret = true; this.head = !!o?.head; return this; }
  /** Filtre : la colonne c vaut v. */
  eq(c, v) { this.f.push((r) => getv(r, c) === v); return this; }
  /** Filtre : la colonne c ne vaut pas v. */
  neq(c, v) { this.f.push((r) => getv(r, c) !== v); return this; }
  /** Filtre : la colonne c est dans la liste v. */
  // Comparaison en texte : PostgREST accepte les identifiants en chaîne (ex. copy_id numériques lus en « in »).
  in(c, v) { const set = new Set(v.map(String)); this.f.push((r) => set.has(String(getv(r, c)))); return this; }
  /** Filtre : la colonne c vaut exactement v (null compris). */
  is(c, v) { this.f.push((r) => (getv(r, c) ?? null) === v); return this; }
  /** Filtre négatif : seul l'opérateur « is » est simulé. */
  not(c, op, v) { if (op === 'is') this.f.push((r) => (getv(r, c) ?? null) !== v); return this; }
  // Méthodes sans effet ici : tri, limite et bornes ne sont pas simulés (range renvoie toutes les lignes).
  or() { return this; } order() { return this; } limit() { return this; } gte() { return this; } lte() { return this; } lt() { return this; } gt() { return this; } range(a, b) { this.rg = [a, b]; return this; } ilike() { return this; } contains() { return this; }
  /** Attend une seule ligne (ou null). */
  maybeSingle() { this.one = true; return this; } single() { this.one = true; return this; }
  /** Prépare une insertion ; la requête s'exécute à l'attente (await). */
  insert(p) { this.op = 'insert'; this.payload = p; return this; }
  /** Prépare une mise à jour ; les lignes filtrées reçoivent la charge utile. */
  update(p) { this.op = 'update'; this.payload = p; return this; }
  /** Prépare un upsert (insertion ou mise à jour selon la clé). */
  upsert(p) { this.op = 'upsert'; this.payload = p; return this; }
  /** Prépare une suppression des lignes filtrées. */
  delete() { this.op = 'delete'; return this; }
  /** Exécute la requête sur DB et renvoie { data, error } comme le vrai client. */
  run() {
    const tab = DB[this.t] || (DB[this.t] = []);
    // Vrai si la ligne respecte tous les filtres de la requête.
    const match = (r) => this.f.every((f) => f(r));
    // Journal des appels : chaque lecture et écriture est notée pour les vérifications des tests.
    window.__LOG.push([this.op, this.t, this.payload]);
    // Upsert sur hg_page_access : une ligne par couple (page, utilisateur), remplacée si elle existe.
    if (this.op === 'upsert' && this.t === 'hg_page_access') {
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]);
      for (const r of rows) { const i = tab.findIndex((x) => x.page_slug === r.page_slug && x.user_id === r.user_id); if (i >= 0) tab[i] = { ...r }; else tab.push({ ...r }); }
      return { data: rows, error: null };
    }
    // Insertion : les lignes reçoivent un identifiant si la table en exige un (comme gen_random_uuid en base).
    if (this.op === 'insert' || this.op === 'upsert') {
      // Scénario guardError : refus de créer une édition tant que la précédente n'est pas terminée.
      if (this.t === 'hg_ss_editions' && S.guardError) return { data: null, error: { message: "Termine d'abord l'édition en cours avant d'en créer une nouvelle" } };
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r) => ({ ...r }));
      for (const r of rows) {
        // Code de badge déjà présent : même erreur que la clé primaire en base (23505).
        if (this.t === 'hg_badges' && tab.some((x) => x.code === r.code)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "hg_badges_pkey"' } };
        // Un lien d'invitation reçoit un identifiant et un jeton simulés.
        if (this.t === 'hg_invite_links') Object.assign(r, { id: 'L' + (++seq + 10), token: 'new' + String(seq).padStart(21, '0'), active: true, codes_generated: 0, created_at: new Date().toISOString() });
        // Séries et défis créés sans identifiant reçoivent un identifiant factice, comme la base.
        if (!r.id && this.t === 'hg_card_sets') r.id = 'SETN' + (++seq);
        if (!r.id && this.t === 'hg_challenges') r.id = '00000000-0000-4000-8000-0000000d' + String(++seq).padStart(4, '0');
        tab.unshift(r);
      }
      return { data: this.one ? rows[0] : rows, error: null };
    }
    // Mise à jour : les lignes qui respectent les filtres reçoivent les champs de la charge utile.
    if (this.op === 'update') { const rows = tab.filter(match); rows.forEach((r) => Object.assign(r, this.payload)); return { data: this.one ? rows[0] ?? null : rows, error: null }; }
    // Suppression : retire les lignes filtrées et renvoie leur nombre (count).
    if (this.op === 'delete') { const keep = tab.filter((r) => !match(r)); const n = tab.length - keep.length; tab.length = 0; tab.push(...keep); return { data: null, error: null, count: n }; }
    // Lecture : les lignes qui respectent les filtres ; une seule si maybeSingle ou single.
    let out = tab.filter(match);
    if (this.rg) out = out.slice(this.rg[0], this.rg[1] + 1); // pagination (fetchAllRows : pages de 1 000 lignes)
    if (this.head) return { data: null, error: null, count: out.length };
    return this.one ? { data: out[0] ?? null, error: null } : { data: out, error: null };
  }
  /** Permet d'attendre la requête avec await : exécute run() et transmet son résultat. */
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
}
// Scénarios des affiches et des tutos : valeurs de réglages surchargées (S.cardsCfg fusionné dans la configuration, S.badgesCfg = hg_settings.badges).
if (S.cardsCfg) Object.assign(window.__CARDS.config, S.cardsCfg);
if (S.badgesCfg) DB.hg_settings.push({ key: 'badges', value: S.badgesCfg });
// S.supportCfg = hg_settings.support ; S.ancienneteLevels = niveaux du badge Ancienneté (hg_badges.levels).
if (S.supportCfg) DB.hg_settings.push({ key: 'support', value: S.supportCfg });
// S.settingsExtra = { clé: valeur } : autres réglages hg_settings (irl, invites…).
if (S.settingsExtra) for (const [key, value] of Object.entries(S.settingsExtra)) DB.hg_settings.push({ key, value });
if (S.ancienneteLevels) DB.hg_badges.push({ code: 'anciennete', name: 'Ancienneté', description: 'Années dans le gang', image_url: null, sort: 999, levels_enabled: true, metric: 'anciennete_annees', levels: S.ancienneteLevels });

// Idées C1 à C6 (migration 080) : lignes ajoutées par le scénario, table par table (S.c080 = { hg_cards: [...], ... }).
if (S.c080) for (const [t, rows] of Object.entries(S.c080)) DB[t] = [...(DB[t] || []), ...rows];

/* ---------- Gestion globale (admin-gestion.js) : économie, boosters, journal des dons ---------- */
// S.ecoFail : hg_eco_health refuse ; S.boostersFail : hg_booster_type_stats refuse. S.journalDons remplace le journal par défaut.
const GESTION_ECO = {
  generated_at: iso(0), ignore_until: null,
  seuils: { paillettes_pct: 25, recyclage_pct: 60, booster_pct: 100, concentration_x: 5 },
  paillettes: { total: 48250, net7: 960, pct: 2, days: [100, 200, 150, 0, 300, -50, 200], level: 'ok' },
  recyclage: { recycled: 12, obtained: 40, pct: 30, days: [0, 0, 0, 0, 0, 0, 0], level: 'ok' },
  boosters: [{ id: 'classique', name: 'Classique', price: 100, ev: 60, ratio: 60, level: 'ok', updated_at: iso(-30) }],
  booster_max: { id: 'classique', name: 'Classique', price: 100, ev: 60, ratio: 60, updated_at: iso(-30) },
  concentration: { earners: 4, median: 410, max: 2460, ratio: 6, level: 'bad',
    top: { user_id: U(2), pseudo: 'Alice', gains: 2460, sources: { quete: 1800, booster: 660 } } },
};
const GESTION_BOOSTERS = { types: [
  { id: 'classique', name: 'Classique', price: 100, active: true, sort: 1, sales: { d7: { boosters: 30, paillettes: 3000 }, d30: { boosters: 80, paillettes: 8000 }, total: { boosters: 300, paillettes: 30000 } },
    opens: { d7: 12, d30: 40, total: 90, cards: 450, refund: 0 }, stock: { total: 5, holders: 2 }, gifts: { d7: 0, d30: 2, total: 2, count: 1 } },
  { id: 'dore', name: 'Doré', price: 250, active: true, sort: 2, sales: { d7: { boosters: 4, paillettes: 1000 }, d30: { boosters: 9, paillettes: 2250 }, total: { boosters: 20, paillettes: 5000 } },
    opens: { d7: 7, d30: 11, total: 18, cards: 90, refund: 0 }, stock: { total: 0, holders: 0 }, gifts: { d7: 0, d30: 0, total: 0, count: 0 } },
], opens_since: iso(-200) };
// Journal : les dons groupés (action « don_groupe ») et une ligne d'une autre action, que la section ne doit pas afficher.
DB.hg_admin_log = S.journalDons || [
  { id: 1, admin_id: ME, action: 'carte_donnee', target_user: U(3), target_ref: 'C1', details: {}, created_at: iso(-0.5) },
  { id: 2, admin_id: ME, action: 'don_groupe', target_user: null, target_ref: 'boosters', created_at: iso(-0.2),
    details: { lot: 'lot-b', montant: 2, carte: null, brillante: false, membres: 2, tout_le_gang: false, annonce: true, note: null, destinataires: [U(2), U(3)] } },
  { id: 3, admin_id: ME, action: 'don_groupe', target_user: null, target_ref: 'paillettes', created_at: iso(-1),
    details: { lot: 'lot-p', montant: 500, carte: null, brillante: false, membres: 9, tout_le_gang: true, annonce: false, note: 'Anniversaire du gang', destinataires: [U(2), U(3), U(4), U(5), U(6), U(7), U(8), U(9), U(1)] } },
  { id: 4, admin_id: ME, action: 'don_groupe', target_user: null, target_ref: 'carte', created_at: iso(-3),
    details: { lot: 'lot-c', montant: 1, carte: 'C2', brillante: true, membres: 1, tout_le_gang: false, annonce: true, note: null, destinataires: [U(3)] } },
];

/* ---------- Client exporté ---------- */
/** Point d'entrée : crée le faux client que les pages utilisent à la place de supabase-js. */
/* ---------- Idées C13 à C17 (migration 082) : cagnotte, Ma chance, bulletin, carte Champion ---------- */
// Scénario : S.pot ('ouverte' | 'atteinte' | 'echouee'), S.luck ('peu' | 'beaucoup'), S.bulletin (true), S.champion ('aucune' | 'proposee' | 'acceptee').
// Sans la clé, la fonction répond PGRST202 (migration pas déployée) : la page doit rester propre.
const absente082 = (fn) => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });
const POT = S.pot ? { id: 7, title: 'Un booster Raclette pour tout le monde', goal: 20000, total: S.pot === 'atteinte' ? 20000 : 13450, status: S.pot,
  starts_at: iso(-6), ends_at: S.pot === 'ouverte' ? iso(9) : iso(-1), reached_at: S.pot === 'atteinte' ? iso(-0.5) : null, closed_at: S.pot === 'ouverte' ? null : iso(-0.5),
  reward_type: 'classique', reward_name: 'Raclette', reward_style: 'cart--classique', reward_qty: 1, min: 10, cap: 5000, contributors: 16, badge: true } : null;
const POT_RECENT = [
  { amount: 500, created_at: iso(-0.0005), anonymous: false, is_me: false, pseudo: 'Alice', avatar_url: null, color: '#C9A227' },
  { amount: 200, created_at: iso(-0.008), anonymous: true, is_me: false, pseudo: null, avatar_url: null, color: null },
  { amount: 150, created_at: iso(-0.05), anonymous: false, is_me: false, pseudo: 'Bruno', avatar_url: null, color: '#4F6A8F' },
  { amount: 1000, created_at: iso(-1.2), anonymous: false, is_me: false, pseudo: 'Chloé', avatar_url: null, color: '#3C7A3A' },
];
let potMine = 0;
const potState = () => ({ pot: POT, mine: potMine, my_left: Math.max(0, Math.min(5000 - potMine, POT.goal - POT.total)), rewarded: POT.status === 'atteinte', recent: POT_RECENT.slice(0, 5) });
const LUCK_RAR = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire', 'mythique', 'identite'];
function luckData() {
  const many = S.luck === 'beaucoup', n = many ? 312 : 40;
  const exp = [60, 25, 10, 4, 0.88, 0.1, 0.02], obs = many ? [57.8, 24.6, 10.9, 5.3, 1.1, 0.3, 0] : [65, 22.5, 7.5, 5, 0, 0, 0];
  return { total: n, min: 100, boosters: many ? 62 : 8, verdict: many ? 'chanceux' : 'pas_assez', high: { count: 21, expected: 5, z: 1.2 },
    rarities: LUCK_RAR.map((id, i) => ({ id, expected: exp[i], observed: obs[i], count: Math.round(n * obs[i] / 100) })),
    shiny: { count: 12, observed: 3.8, expected: 3 },
    pity: [{ type_id: 'classique', name: 'Classique', every: 20, left: 7 }, { type_id: 'serie', name: 'Saison esport', every: 10, left: 3 }],
    dry: many ? { length: 18, ended_at: iso(-70) } : null,
    best: { at: iso(-4), type_name: 'Saison esport', cards: ['C9', 'C8', 'C6', 'C4', 'C2'].map((id, i) => { const k = DB.hg_cards.find((c) => c.id === id); return { card_id: id, name: k.name, rarity: k.rarity, family: k.family, image_url: null, number: k.number, shiny: i === 0 }; }) } };
}
const BUL = { week: '2026-10-19', num: 12, headline: 'La carte « Braquage raté » s’arrache', circulation: 412380, circulation_prev: 400000, delta_pct: 3.1,
  series: [380000, 385000, 383000, 392000, 396000, 395000, 400000, 412380], boosters_sold: { type_id: 'serie', name: 'Saison esport', qty: 64 }, boosters_total: 90,
  opens: 120, trades: 14, top_traded: { card_id: 'C9', name: 'Braquage raté', count: 9 }, top_wished: { card_id: 'C10', name: 'Bruno', count: 11 }, recycled: 140,
  top_recycler: { pseudo: null, count: 86 }, top_set: { name: 'Première édition', count: 4 }, shinies: { count: 23, legendary_plus: 2 },
  pot: { title: 'Un booster Raclette pour tout le monde', total: 13450, goal: 20000, status: 'ouverte' } };
const BUL_OLD = { ...BUL, week: '2026-10-12', num: 11, headline: 'Semaine calme sur le marché des cartes', top_traded: null };
let ecoPublic = false;
let champ = S.champion === 'proposee' ? { id: 3, status: 'proposee', year: 2026, game: 'lol', main: 'Ahri', emblem: 'baton', flavor: 'Je ne ban jamais Yasuo.' }
  : S.champion === 'acceptee' ? { id: 3, status: 'acceptee', year: 2026, game: 'ck3', main: 'Serge', emblem: 'couronne', flavor: null } : null;
const champMe = () => ({ year: 2026, pseudo: 'Ethan', current: champ, can_propose: !champ || ['refusee', 'retiree'].includes(champ.status), cards: champ?.status === 'acceptee' ? [{ year: 2026, card_id: 'CH1' }] : [] });
const IDEES_C3 = {
  hg_pot_current: () => (S.pot ? { data: potState(), error: null } : absente082('hg_pot_current')),
  hg_pot_contribute: (a) => {
    if (!S.pot) return absente082('hg_pot_contribute');
    if (!a.p_request) return { data: null, error: { message: 'Demande invalide' } };
    if (a.p_amount < 10) return { data: null, error: { message: 'Versement minimal : 10 ✦' } };
    const w = DB.hg_wallets[0];
    if (w.paillettes < a.p_amount) return { data: null, error: { message: `Pas assez de Paillettes (il en faut ${a.p_amount})` } };
    w.paillettes -= a.p_amount; potMine += a.p_amount; POT.total += a.p_amount; POT.contributors += 1;
    POT_RECENT.unshift({ amount: a.p_amount, created_at: new Date().toISOString(), anonymous: !!a.p_anonymous, is_me: true, pseudo: a.p_anonymous ? null : 'Ethan', avatar_url: null, color: '#4F6A8F' });
    return { data: { ...potState(), duplicate: false, reached: false }, error: null };
  },
  hg_card_luck_me: () => (S.luck ? { data: luckData(), error: null } : absente082('hg_card_luck_me')),
  hg_eco_bulletins_me: () => (S.bulletin ? { data: { latest: BUL, archive: [{ week: BUL.week, num: 12, headline: BUL.headline }, { week: BUL_OLD.week, num: 11, headline: BUL_OLD.headline }], eco_public: ecoPublic }, error: null } : absente082('hg_eco_bulletins_me')),
  hg_eco_bulletin_get: (a) => ({ data: a.p_week === BUL_OLD.week ? BUL_OLD : BUL, error: null }),
  hg_eco_public_set: (a) => { ecoPublic = !!a.p_on; return { data: ecoPublic, error: null }; },
  hg_champion_me: () => (S.champion ? { data: champMe(), error: null } : absente082('hg_champion_me')),
  hg_champion_propose: (a) => {
    const p = a.p || {};
    if (!p.main) return { data: null, error: { message: 'Ton main : 1 à 24 caractères' } };
    champ = { id: 4, status: 'proposee', year: 2026, game: p.game, main: p.main, emblem: p.emblem, flavor: p.flavor };
    return { data: 4, error: null };
  },
  hg_champion_withdraw: () => { if (champ?.status === 'proposee') champ = { ...champ, status: 'retiree' }; return { data: true, error: null }; },
  // Panel (Staff « cartes ») : cagnottes, bulletin, propositions Champions. window.__POTS et window.__CHAMPS gardent l'état.
  hg_pot_admin: () => ({ data: (window.__POTS = window.__POTS || (S.pot ? [{ ...POT, reward_name: 'Classique', rewarded: 0, contributions: 20, created_at: iso(-6), badge_code: 'cagnotte_2026' }] : [])), error: null }),
  hg_pot_create: (a) => {
    const p = a.p || {};
    if (!(p.goal >= 500)) return { data: null, error: { message: 'Objectif : de 500 à 1 000 000 ✦' } };
    window.__POTS = [{ id: 8, title: p.title, goal: p.goal, total: 0, status: 'ouverte', reward_type: p.reward_type, reward_name: 'Classique', reward_qty: p.reward_qty, badge_code: p.badge ? 'cagnotte_2026' : null,
      starts_at: new Date().toISOString(), ends_at: p.ends_at, reached_at: null, closed_at: null, created_at: new Date().toISOString(), contributors: 0, contributions: 0, rewarded: 0 }, ...(window.__POTS || [])];
    return { data: 8, error: null };
  },
  hg_pot_cancel: (a) => { const x = (window.__POTS || []).find((q) => q.id === a.p_pot); if (x) x.status = 'annulee'; return { data: 3, error: null }; },
  hg_eco_bulletin_rebuild: () => ({ data: { ...BUL }, error: null }),
  hg_champion_pending: () => ({ data: (window.__CHAMPS = window.__CHAMPS || [{ id: 5, user_id: U(2), pseudo: 'Alice', avatar_url: null, color: '#C9A227', year: 2026, game: 'aoe2', main: 'Francs', emblem: 'chateau', flavor: 'Le trébuchet d’abord.', created_at: iso(-1) }]), error: null }),
  hg_champion_review: (a) => { window.__CHAMPS = (window.__CHAMPS || []).filter((x) => x.id !== a.p_id); return { data: { status: a.p_accept ? 'acceptee' : 'refusee' }, error: null }; },
};

/* ---------- Idées du gang, paquet C2 (migration 081) : scénario S.c2 ----------
   C7 série « Le gang joue » (SETJ, tags minecraft / lol), C8 générations (Ethan OG, Alice 2e gen ; S.genHidden : aucune),
   C9 codes (HG-7KQ4-M2XR booster Doré, HG-AAAA-BBBB 300 Paillettes, HG-2345-6789 déjà utilisé),
   C10 recettes de l'Atelier, C11 enchère ouverte, C12 tableau. Sans S.c2, ces fonctions répondent vide (comme avant 081). */
const C2 = { gens: [], board: { on: false, note: null }, codesUsed: new Set(['23456789']), batches: [], recipes: [], auctions: [], bid: null };
if (S.c2) {
  DB.hg_card_sets.push({ id: 'SETJ', code: 'le-gang-joue', name: 'Le gang joue', description: 'Objets et lieux des jeux du gang.', starts_at: null, ends_at: null, active: true, sort: 3 });
  const J = (n, name, rarity, tag, extra = {}) => ({ id: 'J' + n, set_id: 'SETJ', number: n, name, family: 'jeu', rarity, tag, image_url: null, flavor: n === 3 ? 'Coordonnées : sur l’ancienne carte, promis.' : null,
    member_id: null, can_shiny: true, tradeable: true, craftable: true, max_copies: null, active: true, ...extra });
  DB.hg_cards.push(J(1, 'Le portail du Torii', 'commune', 'minecraft'), J(2, 'L’usine à fer', 'peu_commune', 'minecraft'), J(3, 'La base du gang', 'rare', 'minecraft'),
    J(4, 'Le coffre des trouvailles', 'epique', 'minecraft'), J(5, 'Le Nexus', 'commune', 'lol'), J(6, 'La tour du milieu', 'peu_commune', 'lol'),
    J(7, 'Le pick’em du gang', 'rare', 'lol'), J(8, 'La balise de vision', 'epique', 'lol'), J(9, 'La méga-usine du gang', 'legendaire', null, { craftable: false }));
  const mine = (id, card) => ({ id, card_id: card, owner_id: ME, shiny: false, serial: null, source: 'booster', obtained_at: iso(-1), locked_trade: null, recycled_at: null });
  DB.hg_card_copies.push(mine(301, 'J1'), mine(302, 'J1'), mine(303, 'J2'), mine(304, 'J3'), mine(305, 'J5'), mine(306, 'J6'), mine(307, 'J7'), mine(308, 'J8'), mine(309, 'C6'));
  DB.hg_cards.find((c) => c.id === 'C1').member_id = ME;
  DB.hg_cards.find((c) => c.id === 'C6').member_id = U(2);
  for (const p of DB.hg_profiles) p.show_generation = !S.genHidden;
  if (!S.genHidden) C2.gens = [{ user_id: ME, gen: 'og', since: '2021-01-01' }, { user_id: U(2), gen: 'gen2', since: '2024-02-01' }];
  DB.hg_card_copies.push({ id: 201, card_id: 'C4', owner_id: U(3), shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null },
    { id: 202, card_id: 'C4', owner_id: U(3), shiny: false, serial: null, source: 'booster', obtained_at: iso(-2), locked_trade: null, recycled_at: null });
  DB.hg_card_wishlist.push({ user_id: U(2), card_id: 'C1', created_at: iso(-1) });
  C2.recipes = [
    { id: 'R1', name: 'La méga-usine du gang', description: null, output_shiny: false, paillettes: 200, starts_at: null, ends_at: null, max_total: null, once_per_user: false, used_total: 0, done: false,
      output: DB.hg_cards.find((c) => c.id === 'J9'),
      inputs: [{ card: 'J3', qty: 1, name: 'La base du gang', rarity: 'rare' }, { tag: 'minecraft', qty: 2, label: 'Minecraft', cards: ['J1', 'J2', 'J3', 'J4'] }] },
    { id: 'R2', name: 'L’Empereur de Serge', description: null, output_shiny: false, paillettes: 0, starts_at: null, ends_at: iso(30), max_total: 5, once_per_user: true, used_total: 1, done: false,
      output: DB.hg_cards.find((c) => c.id === 'C9'), inputs: [{ card: 'C10', qty: 1, name: 'Bruno', rarity: 'mythique' }, { card: 'C2', qty: 2, name: 'La Fontaine', rarity: 'commune' }] },
  ];
  C2.auction = { id: 'A1', status: 'ouverte', starts_at: iso(-1), ends_at: new Date(Date.now() + 3 * 3600e3 + 12 * 60e3).toISOString(), hard_end_at: iso(1), min_bid: 500, step: 50,
    card: { id: 'CU1', name: 'Le gobelet du RDV n° 1', rarity: 'unique', family: 'unique', image_url: null, flavor: 'Le tout premier, fait par Carzy.', number: 7, max_copies: 1 },
    winner: null, won: false, price: null };
  C2.bids = [{ uid: U(2), amount: 1300, created_at: new Date(Date.now() - 4 * 60e3).toISOString() }, { uid: U(4), amount: 1250, created_at: new Date(Date.now() - 9 * 60e3).toISOString() },
    { uid: U(2), amount: 1100, created_at: iso(-0.05) }, { uid: U(5), amount: 900, created_at: iso(-0.6) }];
  C2.batches = [{ id: 'B1', kind: 'booster', amount: 1, type_id: 'dore', shiny: false, lot: { kind: 'booster', amount: 1, type_id: 'dore', type_name: 'Doré' }, codes: 24, max_uses: 1,
    one_per_member: true, expires_at: iso(60), note: 'Gobelets du RDV', active: true, created_at: iso(-1), created_by: 'Ethan', used: 3, codes_used: 3 }];
  C2.recipesAdmin = C2.recipes.map((r) => ({ ...r, output_card: r.output.id, output_name: r.output.name, uses: r.used_total, active: true, sort: 0,
    inputs: r.inputs.map((i) => (i.card ? { card: i.card, qty: i.qty } : { tag: i.tag, qty: i.qty })) }));
  C2.auctionsAdmin = [{ id: 'A1', card_id: 'CU1', card_name: 'Le gobelet du RDV n° 1', starts_at: iso(-1), ends_at: C2.auction.ends_at, min_bid: 500, step: 50, status: 'ouverte', price: null, winner: null, top: 1300, top_pseudo: 'Alice', bids: 4 }];
}
const pseudoOf = (id) => DB.hg_profiles.find((p) => p.id === id)?.pseudo || 'membre';
/** Lot d'un code connu du scénario (forme normalisée), ou null. */
function lotOf(n) {
  if (n === '7KQ4M2XR') return { kind: 'booster', amount: 1, type_id: 'dore', type_name: 'Doré', expires_at: '2026-06-30T21:59:59Z' };
  if (n === 'AAAABBBB') return { kind: 'paillettes', amount: 300 };
  if (n === '23456789') return { kind: 'paillettes', amount: 10 };
  return null;
}
const normCode = (v) => { let x = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (x.length === 10 && x.startsWith('HG')) x = x.slice(2); return x; };
/** Réponses des RPC de la migration 081 (null : pas une RPC de ce paquet). */
function rpcC2(fn, a = {}) {
  const ok = (data) => ({ data, error: null });
  const ko = (message) => ({ data: null, error: { message } });
  switch (fn) {
    case 'hg_card_generations': return ok(C2.gens);
    case 'hg_card_tags_complete': {
      if (!S.c2) return ok([]);
      const uid = a.p_user || ME;
      const tags = [...new Set(DB.hg_cards.filter((c) => c.tag).map((c) => c.tag))];
      return ok(tags.map((t) => { const cs = DB.hg_cards.filter((c) => c.tag === t); const have = cs.filter((c) => DB.hg_card_copies.some((x) => x.card_id === c.id && x.owner_id === uid && !x.recycled_at)).length;
        const label = { minecraft: 'Minecraft', lol: 'LoL' }[t] || t; return { tag: t, label, have, total: cs.length, complete: have === cs.length, title: 'Pilier de ' + label }; }));
    }
    case 'hg_gift_code_peek': case 'hg_gift_code_redeem': {
      const n = normCode(a.p_code); const lot = lotOf(n);
      if (!lot) return ok({ ok: false, error: 'inconnu', message: 'Ce code n’existe pas. Vérifie les 8 signes (sans 0, O, 1, I ni L).' });
      if (C2.codesUsed.has(n)) return ok({ ok: false, error: 'deja', message: 'Déjà utilisé.' });
      const code = `HG-${n.slice(0, 4)}-${n.slice(4)}`;
      if (fn === 'hg_gift_code_peek') return ok({ ok: true, code, lot });
      C2.codesUsed.add(n);
      if (lot.kind === 'booster') ajouterStock(ME, lot.type_id, lot.amount);
      else { const w = DB.hg_wallets[0]; w.paillettes += lot.amount; DB.hg_wallet_log.unshift({ user_id: ME, delta: lot.amount, reason: 'code', ref: 'code:' + n, created_at: new Date().toISOString() }); }
      return ok({ ok: true, code, lot, copy_id: null });
    }
    case 'hg_card_recipes_me': return ok({ recipes: C2.recipes, showcase: S.c2vitrine ? [304] : [] }); // S.c2vitrine : « La base du gang » (304) en vitrine
    case 'hg_card_recipe_craft': {
      const r = C2.recipes.find((x) => x.id === a.p_recipe);
      if (!r) return ko('Cette recette n’est pas disponible');
      const ids = (a.p_copies || []).map(Number);
      const lives = DB.hg_card_copies.filter((x) => x.owner_id === ME && !x.recycled_at);
      for (const id of ids) {
        const cp = lives.find((x) => Number(x.id) === id);
        if (!cp) return ko('Une des cartes choisies ne t’appartient plus');
        if (!a.p_confirm_last && !lives.some((x) => x.card_id === cp.card_id && !ids.includes(Number(x.id)))) return ko('Tu utiliserais ton dernier exemplaire : confirme pour continuer');
      }
      const w = DB.hg_wallets[0];
      if (w.paillettes < r.paillettes) return ko(`Pas assez de Paillettes (il en faut ${r.paillettes})`);
      for (const cp of lives) if (ids.includes(Number(cp.id))) cp.recycled_at = new Date().toISOString();
      w.paillettes -= r.paillettes;
      DB.hg_card_copies.push({ id: 900 + DB.hg_card_copies.length, card_id: r.output.id, owner_id: ME, shiny: false, serial: null, source: 'atelier', obtained_at: new Date().toISOString(), locked_trade: null, recycled_at: null });
      r.used_total += 1;
      return ok({ copy_id: 999, card_id: r.output.id, cost: r.paillettes });
    }
    case 'hg_auction_current': {
      if (!C2.auction) return ok({ auction: null });
      const bids = [...(C2.bid ? [C2.bid] : []), ...C2.bids].slice(0, 10);
      const top = bids[0];
      const x = { ...C2.auction, next_min: top ? top.amount + C2.auction.step : C2.auction.min_bid,
        top: top ? { amount: top.amount, mine: top.uid === ME, pseudo: pseudoOf(top.uid), avatar_url: null, color: '#E2C77E' } : null };
      return ok({ auction: x, bids: bids.map((b) => ({ amount: b.amount, created_at: b.created_at, mine: b.uid === ME, pseudo: pseudoOf(b.uid), avatar_url: null, color: '#E2C77E' })),
        me: { cap: 4100, last_winner: false, balance: DB.hg_wallets[0].paillettes } });
    }
    case 'hg_auction_bid': {
      const top = C2.bid || C2.bids[0];
      const min = top ? top.amount + C2.auction.step : C2.auction.min_bid;
      if (top?.uid === ME) return ko('Tu as déjà la meilleure offre');
      if (a.p_amount < min) return ko(`L’offre minimale est de ${min} Paillettes`);
      if (a.p_amount > 4100) return ko('Plafond : 4100 Paillettes (la moitié de ton solde de lundi)');
      C2.bid = { uid: ME, amount: a.p_amount, created_at: new Date().toISOString() };
      DB.hg_wallets[0].paillettes -= a.p_amount;
      return ok({ bid: 1, amount: a.p_amount, ends_at: C2.auction.ends_at, outbid: top?.uid || null });
    }
    case 'hg_trade_board': {
      if (!S.c2) return ok({ rows: [], total: 0, offset: 0, me: { on: false, note: null }, notes: [] });
      let rows = [
        { id: 'C4', name: 'Pompe à essence', rarity: 'peu_commune', family: 'objet', image_url: null, number: 4, max_copies: null, set_id: 'SET1',
          seekers: [{ id: ME, pseudo: 'Ethan' }, { id: U(4), pseudo: 'Chloé' }], givers: [{ id: U(3), pseudo: 'Bruno', n: 1 }] },
        { id: 'C1', name: 'Ethan', rarity: 'commune', family: 'membre', image_url: null, number: 1, max_copies: null, set_id: 'SET1',
          seekers: [{ id: U(2), pseudo: 'Alice' }], givers: [{ id: ME, pseudo: 'Ethan', n: 2 }] },
        { id: 'C7', name: 'Grapeseed', rarity: 'rare', family: 'lieu', image_url: null, number: 7, max_copies: null, set_id: 'SET1',
          seekers: [{ id: U(2), pseudo: 'Alice' }, { id: U(4), pseudo: 'Chloé' }], givers: [] },
      ];
      if (a.p_rarity) rows = rows.filter((r) => r.rarity === a.p_rarity);
      if (a.p_mine) rows = rows.filter((r) => r.id !== 'C7');
      return ok({ rows, total: rows.length, offset: 0, me: C2.board, notes: [{ id: U(5), pseudo: 'David', note: 'J’échange mes Dorées contre les OG' }] });
    }
    case 'hg_trade_board_set': C2.board = { on: !!a.p_on, note: a.p_note ?? null }; return ok(C2.board);
    case 'hg_trade_board_note_clear': return ok(null);
    case 'hg_gift_codes_create': {
      const n = Math.max(1, Math.min(200, Number(a.p?.count) || 1));
      const codes = Array.from({ length: n }, (_, i) => `HG-${String(2222 + i).slice(-4).replace(/[01]/g, '7')}-ABCD`);
      C2.batches.unshift({ id: 'B' + (C2.batches.length + 1), kind: a.p.kind, amount: a.p.amount, lot: { kind: a.p.kind, amount: a.p.amount, type_id: a.p.type_id, type_name: a.p.type_id }, codes: n, max_uses: a.p.max_uses || 1, one_per_member: !!a.p.one_per_member, expires_at: a.p.expires_at, note: a.p.note, active: true, created_at: new Date().toISOString(), created_by: 'Ethan', used: 0, codes_used: 0 });
      return ok({ batch_id: 'B9', codes });
    }
    case 'hg_gift_codes_batches': return ok(C2.batches);
    case 'hg_gift_codes_batch_active': { const b = C2.batches.find((x) => x.id === a.p_batch); if (b) b.active = !!a.p_active; return ok(null); }
    case 'hg_card_recipes_admin': return ok(C2.recipesAdmin || []);
    case 'hg_card_recipe_save': {
      const out = DB.hg_cards.find((c) => c.id === a.p?.output_card);
      if (out?.craftable && out.rarity !== 'unique') return ko('La carte obtenue est fabricable contre des Paillettes : décoche « Fabricable » dans sa fiche');
      (C2.recipesAdmin ||= []).push({ ...a.p, id: 'R' + Date.now(), output_name: out?.name, uses: 0 });
      return ok('R9');
    }
    case 'hg_auctions_admin': return ok(C2.auctionsAdmin || S.gestionEncheres || []); // S.gestionEncheres : enchères de la Gestion globale
    case 'hg_auction_create': (C2.auctionsAdmin ||= []).unshift({ id: 'A9', card_id: a.p.card_id, card_name: DB.hg_cards.find((c) => c.id === a.p.card_id)?.name, starts_at: a.p.starts_at, ends_at: a.p.ends_at, min_bid: a.p.min_bid, step: a.p.step, status: 'prevue', bids: 0 }); return ok('A9');
    case 'hg_auction_cancel': { const x = (C2.auctionsAdmin || []).find((y) => y.id === a.p_id); if (x) x.status = 'annulee'; return ok(null); }
    default: return null;
  }
}

export function createClient() {
  const cli = {
    auth: {
      // Session : absente si le scénario indique un visiteur (S.guest).
      getSession: async () => ({ data: { session: S.guest ? null : { user: { id: S.uid || ME } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: S.guest ? null : { id: S.uid || ME } } }),
      // Déconnexion sans effet ici.
      signOut: async () => ({}),
    },
    // Commence une requête sur la table t.
    // Scénario offline (Q4) : toute requête tentée est notée (le test vérifie qu'il n'y en a aucune).
    from: (t) => { if (S.offline) window.__LOG.push(['offline-req', 'from', t]); return new Q(t); },
    /** Simule les fonctions SQL (RPC) : chaque nom a sa réponse ; une fonction inconnue renvoie null sans erreur. */
    rpc: async (fn, args) => {
      window.__LOG.push(['rpc', fn, args]);
      if (S.offline) window.__LOG.push(['offline-req', 'rpc', fn]);
      // Idées C13 à C17 (migration 082), seulement avec le scénario correspondant ; sinon la fonction « n'existe pas ».
      if (fn in IDEES_C3) return IDEES_C3[fn](args);

      { const c2 = rpcC2(fn, args); if (c2) return c2; } // idées C2 (migration 081)
      // Secrets cachés (migration 062) : la secousse offre un booster ; l'appel reste dans window.__LOG.
      if (fn === 'hg_egg_found') return { data: { new: true, reward: 0, message: 'Un booster offert t\'attend sur la page Cartes.', card: null, badge: null, found: 1 }, error: null };
      // Succès Pentakill (F9, migration 101) : scenario.pentakill = réponse de hg_pentakill_check ; sinon « pas de Pentakill ».
      if (fn === 'hg_pentakill_check') return { data: S.pentakill || { pentakill: false }, error: null };
      // Migration 072 : réglages « support » et « eggs » lus par RPC, sans les valeurs sensibles (même logique que fake-sb.mjs).
      const reglage = (k) => DB.hg_settings.find((r) => r.key === k)?.value || {};
      if (fn === 'hg_support_public') {
        const v = reglage('support'), out = {};
        for (const k of ['sujets', 'message_min', 'message_max', 'delai_reponse_jours']) if (v[k] !== undefined) out[k] = v[k];
        return { data: out, error: null };
      }
      if (fn === 'hg_eggs_public') {
        const v = reglage('eggs');
        const md = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const today = `${md.find((x) => x.type === 'month').value}-${md.find((x) => x.type === 'day').value}`;
        return { data: { recompenses: v.recompenses || {}, anniversaire_aujourdhui: v.anniversaire_gang === today }, error: null };
      }
      if (fn === 'hg_eco_quota') {
        return { data: S.ecoQuota || { photos: { payees: 0, plafond: 5 }, souvenirs: { payes: 0, plafond: 5 }, sortie: { payees: 0, plafond: 1 } }, error: null };
      }
      // Pages visibles pour l'utilisateur connecté (même logique que fake-sb.mjs).
      if (fn === 'hg_my_pages') {
        if (S.pagesFail) return { data: null, error: { message: 'Failed to fetch' } };
        const uid = S.uid || ME; const adm = DB.hg_profiles.find((p) => p.id === uid)?.is_admin;
        /** Accès de l'utilisateur connecté à la page slug (ligne de hg_page_access), ou undefined. */
        const acc = (slug) => DB.hg_page_access.find((a) => a.page_slug === slug && a.user_id === uid);
        return { data: DB.hg_pages.filter((p) => adm || (p.mode === 'membres' && acc(p.slug)?.allowed !== false) || (p.mode === 'liste' && acc(p.slug)?.allowed === true))
          .sort((a, b) => a.sort - b.sort).map(({ slug, label, in_nav, sort }) => ({ slug, label, in_nav, sort })), error: null };
      }
      if (fn === 'hg_unread_count') return { data: 0, error: null };
      // Secrets cachés (migration 062) : hg_egg_found répond « nouveau » ; hg_eggs_me renvoie le carnet.
      if (fn === 'hg_egg_found') return { data: { new: true, reward: 10, message: 'ok', found: 1 }, error: null };
      if (fn === 'hg_eggs_me') return { data: { found: 1, total: 12, eggs: [{ egg: 'konami', first: new Date().toISOString() }], letters: 0 }, error: null };
      // Configuration du jeu seule (migration 018) : lue par les affiches et les tutos. S.cardsFail = la RPC refuse.
      if (fn === 'hg_card_cfg') {
        if (S.cardsFail) return { data: null, error: { message: 'permission denied for function hg_card_cfg' } };
        return { data: window.__CARDS.config, error: null };
      }
      // Droits codés en dur : admin avec tout le catalogue, pour cette fixture.
      // S.myPerms : droits simulés (ex. { is_admin: false, perms: ['membres'] } pour tester l'absence de la permission « cartes »).
      if (fn === 'hg_my_perms') return { data: S.myPerms || { is_admin: true, perms: ['membres', 'evenements', 'souvenirs', 'secret_santa', 'cartes', 'badges', 'themes', 'messages', 'support', 'bot', 'reglages', 'journal'] }, error: null };
      // Ajustement de Paillettes : seul le membre connecté est crédité.
      if (fn === 'hg_cards_admin_paillettes') {
        if (args.p_user === ME) { DB.hg_wallets[0].paillettes += args.p_delta; return { data: DB.hg_wallets[0].paillettes, error: null }; }
        return { data: 0, error: null };
      }
      // Don de cartes : renvoie le nombre donné ; échoue si le scénario giveFail est fourni.
      if (fn === 'hg_cards_admin_give') {
        if (S.giveFail) return { data: null, error: { message: 'Réservé à l\'admin' } };
        return { data: args.p_count, error: null };
      }
      // Don groupé (migration 042) : p_users null = tout le gang (comptes actifs). scenario.bulkFail = la RPC refuse.
      if (fn === 'hg_cards_admin_bulk_give') {
        if (S.bulkFail) return { data: null, error: { message: 'Plus assez d\'exemplaires pour « Carte test » : il en reste 1, il en faut 4' } };
        const ids = [...new Set(args.p_users ?? DB.hg_profiles.filter((p) => !p.is_ghost).map((p) => p.id))];
        return { data: { membres: ids.length, type: args.p_kind, montant: args.p_amount, annonce: args.p_announce, batch: 'lot-test',
          detail: ids.map((id) => ({ user_id: id, pseudo: DB.hg_profiles.find((p) => p.id === id)?.pseudo ?? '' })) }, error: null };
      }
      // Give en panier (migration 196) : p_users null = tout le gang. scenario.bulkFail = la RPC refuse.
      if (fn === 'hg_cards_admin_give_panier') {
        if (S.bulkFail) return { data: null, error: { message: 'Une carte du panier n\'est plus disponible' } };
        const ids = [...new Set(args.p_users ?? DB.hg_profiles.filter((p) => !p.is_ghost).map((p) => p.id))];
        return { data: { membres: ids.length, paillettes: args.p_paillettes, exemplaires: 0, boosters: 0, annonce: args.p_announce, batch: 'lot-test', resume: [] }, error: null };
      }
      // Gestion globale (admin-gestion.js) : santé de l'économie et statistiques des boosters (lecture seule).
      if (fn === 'hg_eco_health') return S.ecoFail ? { data: null, error: { message: 'Santé de l\'économie indisponible' } } : { data: GESTION_ECO, error: null };
      if (fn === 'hg_booster_type_stats') return S.boostersFail ? { data: null, error: { message: 'Statistiques indisponibles' } } : { data: GESTION_BOOSTERS, error: null };
      // Retrait de cartes : sans effet ici.
      if (fn === 'hg_cards_admin_take') return { data: null, error: null };
      // Annuaire pour le Staff : pseudo, couleur, fantôme ou non.
      if (fn === 'hg_staff_directory') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, avatar_url: p.avatar_url, color: p.color, is_ghost: !!p.is_ghost, joined_on: p.joined_on })), error: null };
      // Liste des membres : les fantômes n'y figurent pas.
      if (fn === 'hg_members') return { data: DB.hg_profiles.filter((p) => !p.is_ghost).map((p) => ({ id: p.id, pseudo: p.pseudo, avatar_url: null, color: p.color, member_since: p.joined_on || p.created_at })), error: null };
      if (fn === 'hg_admin_accounts') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, email: p.pseudo.toLowerCase() + '@ex.ch', is_admin: p.is_admin, created_at: p.created_at, last_sign_in_at: null })), error: null };
      if (fn === 'hg_claim_invite_link') {
        window.__CLAIMS = (window.__CLAIMS || 0) + 1;
        if (S.claimError) return { data: null, error: { message: "Lien d'invitation invalide ou expiré" } };
        return { data: 'HG-Q7W' + 'XYZ'.slice(0, 3), error: null };
      }
      if (fn === 'hg_member_card') { const p = DB.hg_profiles.find((x) => x.id === args.p_user);
        const badges = DB.hg_user_badges.filter((u) => u.user_id === p.id).map((u) => { const b = DB.hg_badges.find((x) => x.code === u.badge_code); return { code: b.code, name: b.name, description: b.description, image_url: b.image_url, awarded_at: u.awarded_at }; });
        return { data: { ...p, member_since: p.joined_on || p.created_at, member_number: 7, badges, stats: { secret_santa: 3, sorties: 5 } }, error: null }; }
      // Événements dynamiques actifs à l'instant présent (entre starts_at et ends_at).
      if (fn === 'hg_dyn_active') {
        if (S.dynFail) return { data: null, error: { message: 'rpc indisponible' } };
        const t = Date.now();
        return { data: DB.hg_dyn_events.filter((e) => e.active && new Date(e.starts_at) <= t && new Date(e.ends_at) > t).map((e) => ({ ...e,
          my_captures: DB.hg_dyn_captures.filter((c) => c.event_id === e.id && c.user_id === ME).length,
          remaining_total: e.max_total == null ? null : e.max_total - DB.hg_dyn_captures.filter((c) => c.event_id === e.id).length })), error: null };
      }
      // Attrape une citrouille : ajoute une capture ; à trois captures, le badge passe au niveau 2.
      if (fn === 'hg_dyn_capture') {
        DB.hg_dyn_captures.push({ event_id: args.p_event, user_id: ME, captured_at: new Date().toISOString() });
        const mine = DB.hg_dyn_captures.filter((c) => c.event_id === args.p_event && c.user_id === ME).length;
        const ub = DB.hg_user_badges.find((u) => u.user_id === ME && u.badge_code === 'citrouille');
        if (ub && mine >= 3) ub.level = 2;
        return { data: { ok: true, mine, badge_new: false }, error: null };
      }
      // Classement des captures d'un événement, du plus au moins.
      if (fn === 'hg_dyn_leaderboard') {
        const m = new Map(); for (const c of DB.hg_dyn_captures.filter((c) => c.event_id === args.p_event)) m.set(c.user_id, (m.get(c.user_id) || 0) + 1);
        return { data: [...m.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => { const p = DB.hg_profiles.find((x) => x.id === id); return { user_id: id, pseudo: p.pseudo, avatar_url: null, captures: n }; }), error: null };
      }
      // Progression des badges de l'utilisateur ; scénario noProgress : la fonction paraît absente.
      if (fn === 'hg_my_badge_progress') { if (S.noProgress) return { data: null, error: { message: 'function not found' } }; return { data: [{ badge_code: 'fidele', metric: 'anciennete_annees', value: 4 }, { badge_code: 'citrouille', metric: 'event_captures', value: DB.hg_dyn_captures.filter((c) => c.user_id === ME && c.event_id === 'aaaaaaaa-0000-4000-8000-000000000001').length }], error: null }; }

      // Compteurs du compte Cartes : Paillettes, pity, bonus quotidien, booster gratuit, cadeaux.
      // S.cardsMeErreur : lecture en erreur (parcours-compteurs.cjs)
      if (fn === 'hg_cards_me') { if (S.cardsMeErreur) return { data: null, error: { message: 'Indisponible' } }; const w = DB.hg_wallets[0]; return { data: { paillettes: w.paillettes, boosters_opened: 4, pity: w.pity_epique, daily_streak: w.daily_streak, daily_available: !w.last_daily, free_booster_at: S.freeAt ?? iso(-0.1), gift_boosters: w.gift_boosters ?? 0, god: !!S.god, config: window.__CARDS.config }, error: null }; }
      // Bonus quotidien : +20 Paillettes et série à 3.
      if (fn === 'hg_cards_daily') { const w = DB.hg_wallets[0]; w.last_daily = 'today'; w.paillettes += 20; return { data: { gain: 20, streak: 3 }, error: null }; }
      // hg_open_booster_req (migration 021), seulement si scenario.reqRpc : idempotence par p_request,
      // solde vérifié, et scenario.x5FailAt = numéro de la tentative qui échoue (rien n'est débité ni enregistré).
      if (fn === 'hg_open_booster_req' && S.reqRpc) {
        const w = DB.hg_wallets[0];
        window.__ATT = (window.__ATT || 0) + 1;
        window.__OK = window.__OK || new Set();
        if (S.x5FailAt && window.__ATT === S.x5FailAt) return { data: null, error: { message: 'Pas assez de Paillettes (il en faut 100)' } };
        if (window.__OK.has(args.p_request)) return { data: null, error: { message: 'booster_deja_ouvert' } };
        // Booster offert (migration 042) : consomme le stock, sans Paillettes ni délai.
        if (args.p_offert && !(w.gift_boosters > 0)) return { data: null, error: { message: 'Aucun booster offert disponible' } };
        if (!args.p_offert && !args.p_free && w.paillettes < 100) return { data: null, error: { message: 'Pas assez de Paillettes (il en faut 100)' } };
        window.__OK.add(args.p_request);
        if (args.p_offert) w.gift_boosters -= 1;
        else if (!args.p_free) w.paillettes -= 100;
        const pool = DB.hg_cards.filter((c) => c.rarity !== 'identite');
        const k = window.__OK.size - 1;
        const cards = piocher(k, pool, 5).map((c, i) => ({ copy_id: 1000 + k * 5 + i, card_id: c.id, name: c.name, rarity: c.rarity, family: c.family, image_url: null, flavor: c.flavor, number: c.number, shiny: (k * 5 + i) % 7 === 0, serial: null, max_copies: null }));
        const ORD = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire', 'mythique'];
        const best = cards.reduce((b, c) => (ORD.indexOf(c.rarity) > ORD.indexOf(b) ? c.rarity : b), 'commune');
        // Comme la vraie RPC : les cartes tirées deviennent des exemplaires du joueur (collection, carte agrandie).
        for (const c of cards) DB.hg_card_copies.push({ id: c.copy_id, card_id: c.card_id, owner_id: ME, shiny: c.shiny, serial: null, source: 'booster', obtained_at: iso(0), locked_trade: null, recycled_at: null });
        return { data: { cards, best, demandees: 5, livrees: 5, offert: !!args.p_offert, offerts_restants: w.gift_boosters }, error: null };
      }
      // Ancienne ouverture hg_open_booster : chemin payant refusé depuis la migration 074 (le front ne l'appelle plus).
      if (fn === 'hg_open_booster' && !args.p_free) return { data: null, error: { message: 'Achète tes boosters dans la Boutique' } };
      // Sans le scénario reqRpc : hg_open_booster_req simplifiée (booster gratuit ou offert), renvoie toujours les cinq mêmes cartes ;
      // le chemin payant est refusé comme en production (069). hg_open_booster(p_free => true) y mène aussi (074).
      if (fn === 'hg_open_booster_req' || fn === 'hg_open_booster') { const w = DB.hg_wallets[0];
        if (!args.p_free && !args.p_offert) return { data: null, error: { message: 'Les boosters s\u2019achètent maintenant dans la Boutique' } };
        const pool = DB.hg_cards.filter((c) => c.rarity !== 'identite').slice(0, 5);
        const cards = pool.map((c, i) => ({ copy_id: 900 + i, card_id: c.id, name: c.name, rarity: i === 4 ? 'legendaire' : c.rarity, family: c.family, image_url: null, flavor: c.flavor, number: c.number, shiny: i === 2, serial: null, max_copies: null }));
        if (args.p_offert) w.gift_boosters = Math.max((w.gift_boosters || 0) - 1, 0);
        // Comme la vraie fonction (hg_open_booster_req) : la jauge épique repart à zéro si la meilleure carte est épique ou plus,
        // sinon elle monte, booster gratuit compris. Ici la meilleure carte est une légendaire.
        const RK = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire', 'mythique'];
        w.pity_epique = RK.indexOf('legendaire') >= 3 ? 0 : w.pity_epique + 1;
        return { data: { cards, best: 'legendaire' }, error: null }; }
      // Échanges possibles (migration 058) : suggestions du membre connecté, dans le format de la RPC réelle.
      // S.suggestions remplace le résultat (scénario de test) ; S.suggFail simule une fonction absente (repli client).
      if (fn === 'hg_trade_suggestions') {
        if (S.suggFail) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.hg_trade_suggestions' } };
        if (S.suggestions) return { data: S.suggestions, error: null };
        return { data: suggestionsFromDb(), error: null };
      }
      // Recyclage : ajoute 5 Paillettes par carte et retire les exemplaires ; échec si le scénario recycleFail est fourni.
      // Favoris (migration 078) : seulement une carte possédée, plafond de 200, retrait sans erreur (miroir de la RPC)
      if (fn === 'hg_card_favorite_set') {
        const own = DB.hg_card_copies.some((c) => c.card_id === args.p_card && c.owner_id === ME && !c.recycled_at);
        if (args.p_on) {
          if (!own) return { data: null, error: { message: 'Seules les cartes de ta collection peuvent être mises en favori' } };
          const has = DB.hg_card_favorites.some((f) => f.card_id === args.p_card);
          if (!has && DB.hg_card_favorites.length >= 200) return { data: null, error: { message: 'Tu as atteint la limite de 200 favoris' } };
          if (!has) DB.hg_card_favorites.push({ user_id: ME, card_id: args.p_card, created_at: iso(0) });
        } else DB.hg_card_favorites = DB.hg_card_favorites.filter((f) => f.card_id !== args.p_card);
        return { data: { on: !!args.p_on, count: DB.hg_card_favorites.length }, error: null };
      }
      if (fn === 'hg_card_recycle') { if (S.recycleFail) return { data: null, error: { message: 'Certaines cartes ne peuvent pas être recyclées (échange en cours ?)' } };
        const ids = args.p_copies; const total = ids.length * 5; DB.hg_wallets[0].paillettes += total; DB.hg_card_copies = DB.hg_card_copies.filter((c) => !ids.includes(c.id)); return { data: total, error: null }; }
      // Fabrication : 40 Paillettes, 160 pour une version brillante ; le scénario god ignore le solde.
      if (fn === 'hg_card_craft') { const w = DB.hg_wallets[0]; const cost = args.p_shiny ? 160 : 40; if (!S.god && w.paillettes < cost) return { data: null, error: { message: `Pas assez de Paillettes (il en faut ${cost})` } }; w.paillettes -= cost; const kc = DB.hg_cards.find((c) => c.id === args.p_card); const cid = 500 + DB.hg_card_copies.length; DB.hg_card_copies.push({ id: cid, card_id: args.p_card, owner_id: ME, shiny: !!args.p_shiny, serial: null, source: 'fabrication', obtained_at: iso(0), locked_trade: null, recycled_at: null });
        // Comme hg_card_craft : copy_id, coût, carte, rareté, brillance et numéro de série de l'exemplaire créé.
        return { data: { copy_id: cid, cost, card_id: args.p_card, rarity: kc?.rarity, shiny: !!args.p_shiny, serial: null }, error: null }; }
      // Délai artificiel du classement (scénario rpcDelay), pour tester le chargement.
      if (fn === 'hg_card_leaderboard' && S.rpcDelay) await new Promise((r) => setTimeout(r, S.rpcDelay));
      // Classement de N lignes (scénario lbRows), pour tester la liste longue.
      if (fn === 'hg_card_leaderboard' && S.lbRows) return { data: Array.from({ length: S.lbRows }, (_, i) => ({ user_id: U(2), pseudo: 'Joueur ' + i, avatar_url: null, uniques: 1, copies: 1, shinies: 0, identites: 0, series: 1, score: 100 - i })), error: null };
      // Classement par défaut : Ethan en tête, puis Alice.
      if (fn === 'hg_card_leaderboard') return { data: [{ user_id: ME, pseudo: 'Ethan', avatar_url: null, uniques: 5, copies: 11, shinies: 3, identites: 1, series: 0, score: 120 }, { user_id: U(2), pseudo: 'Alice', avatar_url: null, uniques: 3, copies: 4, shinies: 0, identites: 0, series: 1, score: 40 }], error: null };
      // Offre d'échange (cartes-trades.js) : l'offre est créée et son id renvoyé, comme la RPC réelle (uuid).
      if (fn === 'hg_trade_propose') { if (S.tradeFail) return { data: null, error: { message: 'Trop d\'offres en cours' } }; const id = '7e57c0de-0000-4000-8000-000000000001';
        DB.hg_card_trades.unshift({ id, from_user: ME, to_user: args.p_to, status: 'proposee', from_paillettes: args.p_give_p, to_paillettes: args.p_want_p, message: args.p_message, parent_id: args.p_parent, expire_le: iso(7), created_at: new Date().toISOString(), resolved_at: null });
        return { data: id, error: null }; }
      // Drops (migration 043) : même logique que la base (fenêtre de temps, un gain par membre, plafond d'exemplaires).
      // Drops actifs que le membre n'a pas encore attrapés, avec le nombre d'exemplaires restants.
      if (fn === 'hg_drops_active') {
        if (S.dropsFail) return { data: null, error: { message: 'rpc indisponible' } };
        const t = Date.now(), me = S.uid || ME;
        const rows = DB.hg_card_drops.filter((d) => new Date(d.starts_at) <= t && new Date(d.ends_at) > t)
          .filter((d) => !DB.hg_card_drop_claims.some((c) => c.drop_id === d.id && c.user_id === me))
          .filter((d) => DB.hg_card_drop_claims.filter((c) => c.drop_id === d.id).length < d.quantity)
          .map((d) => { const k = DB.hg_cards.find((x) => x.id === d.card_id); const set = DB.hg_card_sets.find((x) => x.id === k.set_id);
            return { drop_id: d.id, card_id: k.id, name: k.name, rarity: k.rarity, family: k.family, image_url: k.image_url, flavor: k.flavor, number: k.number,
              max_copies: k.max_copies, set_name: set.name, shiny: !!d.shiny, quantity: d.quantity, remaining: d.quantity - DB.hg_card_drop_claims.filter((c) => c.drop_id === d.id).length, ends_at: d.ends_at }; });
        return { data: rows, error: null };
      }
      // Réclamation d'un drop : vérifie la fenêtre de temps, le doublon et le stock, puis note l'activité.
      if (fn === 'hg_drop_claim') {
        window.__CLAIMS_DROP = (window.__CLAIMS_DROP || 0) + 1;
        const me = S.uid || ME, d = DB.hg_card_drops.find((x) => x.id === args.p_drop), t = Date.now();
        if (S.dropLate) return { data: null, error: { message: 'Trop tard, tous les exemplaires sont partis !' } }; // course perdue : affiché sans attendre
        if (!d || new Date(d.starts_at) > t || new Date(d.ends_at) <= t) return { data: null, error: { message: 'Trop tard : ce drop est terminé.' } };
        if (DB.hg_card_drop_claims.some((c) => c.drop_id === d.id && c.user_id === me)) return { data: null, error: { message: 'Tu as déjà attrapé cette carte.' } };
        const got = DB.hg_card_drop_claims.filter((c) => c.drop_id === d.id).length;
        if (got >= d.quantity) return { data: null, error: { message: 'Trop tard, tous les exemplaires sont partis !' } };
        const k = DB.hg_cards.find((x) => x.id === d.card_id), set = DB.hg_card_sets.find((x) => x.id === k.set_id);
        const copy = 2000 + DB.hg_card_drop_claims.length;
        DB.hg_card_drop_claims.push({ drop_id: d.id, user_id: me, copy_id: copy, claimed_at: new Date().toISOString() });
        if (d.announce !== false) DB.hg_activity.unshift({ user_id: me, kind: 'cartes', text: 'Ethan a attrapé « ' + k.name + ' » !', created_at: new Date().toISOString() });
        return { data: { copy_id: copy, card_id: k.id, name: k.name, rarity: k.rarity, family: k.family, image_url: k.image_url, flavor: k.flavor,
          number: k.number, max_copies: k.max_copies, set_name: set.name, shiny: !!d.shiny, serial: null, remaining: d.quantity - got - 1 }, error: null };
      }
      // Création d'un drop : échec si le scénario dropFail est fourni.
      if (fn === 'hg_drop_create') {
        if (S.dropFail) return { data: null, error: { message: 'Réservé à l\'admin' } };
        const k = DB.hg_cards.find((x) => x.id === args.p_card);
        const id = 'd0000000-0000-4000-8000-' + String(DB.hg_card_drops.length + 1).padStart(12, '0');
        DB.hg_card_drops.unshift({ id, card_id: args.p_card, shiny: !!args.p_shiny, quantity: args.p_quantity, starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + args.p_minutes * 6e4).toISOString(), announce: args.p_announce, created_by: ME });
        return { data: id, error: null };
      }
      // Arrêt d'un drop : il se termine maintenant.
      if (fn === 'hg_drop_stop') {
        const d = DB.hg_card_drops.find((x) => x.id === args.p_drop);
        if (!d || new Date(d.ends_at) <= Date.now()) return { data: null, error: { message: 'Ce drop est déjà terminé.' } };
        d.ends_at = new Date().toISOString();
        return { data: null, error: null };
      }
      // Boosters en stock (migration 067) : achat, don à un membre et historique des dons.
      // Mêmes contrôles et mêmes messages que la base ; S.god rend l'achat gratuit, S.giftsError fait échouer l'historique.
      // Achat : 1 à 10 boosters au prix du booster classique ; un même p_request ne se paie pas deux fois.
      if (fn === 'hg_booster_buy') {
        // Scénario S.types : achat par type (p_type absent = classique) ; sinon l'achat générique d'avant.
        if (S.types) return achatTypee(args);
        const q = args.p_qty ?? 1, w = DB.hg_wallets.find((x) => x.user_id === ME);
        if (q < 1 || q > 10) return { data: null, error: { message: 'On peut acheter de 1 à 10 boosters à la fois' } };
        const ref = args.p_request != null ? 'achat:' + args.p_request : null;
        if (ref && DB.hg_wallet_log.some((l) => l.user_id === ME && l.ref === ref)) return { data: null, error: { message: 'achat_deja_fait' } };
        const cost = S.god ? 0 : (window.__CARDS.config.booster_price ?? 100) * q;
        if (w.paillettes < cost) return { data: null, error: { message: `Pas assez de Paillettes (il en faut ${cost})` } };
        w.paillettes -= cost;
        if (cost > 0 || ref) DB.hg_wallet_log.unshift({ user_id: ME, delta: -cost, reason: 'booster', ref, created_at: new Date().toISOString() });
        w.gift_boosters = (w.gift_boosters ?? 0) + q;
        return { data: { qty: q, cost, stock: w.gift_boosters, paillettes: w.paillettes }, error: null };
      }
      // Don : le destinataire doit exister, être un membre (pas un fantôme) et ne pas être moi ; le stock doit suffire.
      if (fn === 'hg_booster_gift') {
        // Scénario S.types : don d'un type du stock ; sinon le don générique d'avant.
        if (S.types) return donTypee(args);
        const dest = DB.hg_profiles.find((p) => p.id === args.p_to);
        if (!dest || dest.id === ME || dest.is_ghost) return { data: null, error: { message: 'Destinataire invalide' } };
        const q = args.p_qty ?? 1;
        if (q < 1 || q > 10) return { data: null, error: { message: 'On peut offrir de 1 à 10 boosters à la fois' } };
        const w = DB.hg_wallets.find((x) => x.user_id === ME);
        if ((w.gift_boosters ?? 0) < q) return { data: null, error: { message: `Tu n'as que ${w.gift_boosters ?? 0} booster(s) en stock` } };
        const msg = (args.p_message ?? '').trim().slice(0, 300) || null;
        w.gift_boosters -= q;
        let wd = DB.hg_wallets.find((x) => x.user_id === dest.id);
        if (!wd) DB.hg_wallets.push(wd = { user_id: dest.id, paillettes: 0, pity_epique: 0, daily_streak: 0, last_daily: null, gift_boosters: 0 });
        wd.gift_boosters = (wd.gift_boosters ?? 0) + q;
        DB.hg_booster_gifts.push({ id: DB.hg_booster_gifts.length + 1, from_user: ME, to_user: dest.id, qty: q, message: msg, created_at: new Date().toISOString() });
        return { data: { qty: q, stock: w.gift_boosters }, error: null };
      }
      // Historique : les 30 derniers dons envoyés ou reçus, les plus récents d'abord, avec le pseudo de l'autre membre.
      if (fn === 'hg_booster_gifts_me') {
        if (S.giftsError) return { data: null, error: { message: 'rpc indisponible' } };
        return { data: DB.hg_booster_gifts.filter((g) => g.from_user === ME || g.to_user === ME)
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30)
          .map((g) => { const sent = g.from_user === ME, otherId = sent ? g.to_user : g.from_user;
            return { id: g.id, qty: g.qty, message: g.message, created_at: g.created_at, sent, other_id: otherId, other_pseudo: DB.hg_profiles.find((p) => p.id === otherId)?.pseudo ?? '',
              // Scénario S.types : le type du don (les anciens dons sans type sont du classique).
              ...(S.types ? { type_id: g.type_id ?? 'classique', type_name: nomType(g.type_id ?? 'classique') } : {}) }; }), error: null };
      }
      // Boosters typés (migration 069) : sans scenario.types, les deux fonctions « n'existent pas » (repli sur l'ancien mode).
      if (fn === 'hg_booster_types_me') return S.types ? typesMoi() : absente(fn);
      if (fn === 'hg_booster_open') return S.types ? ouvrirTypee(args) : absente(fn);
      // Tirage manuel du Secret Santa : renvoie le nombre de paires reçues.
      if (fn === 'hg_ss_manual_draw') return { data: args.p_pairs.length, error: null };
      return { data: null, error: null };
    },
    // Canal temps réel factice : aucun événement n'est émis.
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {}, removeAllChannels() {},
    // Stockage factice : URL publique en cercle doré, images signées vides.
    storage: { from: () => ({
      getPublicUrl: (p) => ({ data: { publicUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="gold"/></svg>') } }),
      upload: async (p) => { window.__LOG.push(['upload', p]); return { data: { path: p }, error: null }; },
      remove: async (p) => { window.__LOG.push(['remove', p]); return { data: [], error: null }; },
      createSignedUrl: async () => ({ data: { signedUrl: '' } }), createSignedUrls: async () => ({ data: [] }),
    }) },
    /** Fonctions edge simulées : notées dans le journal, avec une réponse pour dyn_announce, sinon une réponse vide. */
    functions: { invoke: async (name, { body } = {}) => { window.__LOG.push(['fn', name, body]); return { data: body?.event === 'dyn_announce' ? { ok: true, sent: true } : {}, error: null }; } },
  };
  // Client exposé pour les tests et les smoke tests (page.evaluate(() => window.__SB.rpc(...))).
  window.__SB = cli;
  return cli;
}
