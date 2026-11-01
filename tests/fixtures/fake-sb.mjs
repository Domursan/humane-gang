// Faux client Supabase (supabase-js) avec état, pour les tests hors ligne.
// Servi à la place de cdn.jsdelivr.net/…/supabase-js (voir lib/harness.cjs) : les pages le chargent sans toucher la vraie base.
// Lit window.__SCN (scénario du test) ; expose window.__DB (base), window.__LOG (journal des appels) et window.__fakeRealtime.
// Exporte createClient(). Copie de qa/fake-sb.mjs, complétée par la connexion simulée (signInWithPassword) pour le test de connexion.
// Ne doit jamais être remplacé par le vrai client : il est servi à la place de supabase-js.

/* ---------- Scénario et constantes ---------- */
const S = window.__SCN || {};
const ME = '11111111-1111-4111-8111-111111111111';
/** Identifiant factice du membre n (même format que ME, pour les données de test). */
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
// Dates relatives à maintenant : iso(-2) donne la date d'il y a deux jours, iso(3) celle de dans trois jours.
const now = Date.now(), iso = (d) => new Date(now + d * 864e5).toISOString();
// Fantômes (migration 019) : profils préparés par l'admin, invisibles pour les membres (hg_members les exclut).
const GHOSTS = [{ id: U(7), pseudo: 'Léa', avatar_url: null, color: '#8F5F4F', is_ghost: true }, { id: U(8), pseudo: 'Tom', avatar_url: null, color: '#4F8F7A', is_ghost: true }, { id: U(9), pseudo: 'Nina', avatar_url: null, color: '#7A4F8F', is_ghost: true }];
// Membres de test : Ethan (le membre connecté, admin) et cinq autres.
const people = [['Ethan', ME], ['Alice', U(2)], ['Bruno', U(3)], ['Chloé', U(4)], ['David', U(5)], ['Emma', U(6)]];
// Codes des badges automatiques (attribués par le site, pas par un admin).
const AUTO = ['premier_noel','veteran','lutin_express','sur_le_fil','liste_parfaite','toujours_la','organisateur','globe_trotter','paparazzi','boite_a_idees','fondateur','fidele','chasseur_bugs','saisonnier','cupidon'];
// Image SVG 16 × 16 d'une citrouille, utilisée comme image de badge et d'événement.
const PUMPKIN = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect x="3" y="4" width="10" height="10" fill="#E8862A"/><rect x="2" y="6" width="12" height="6" fill="#E8862A"/><rect x="7" y="1" width="2" height="3" fill="#3C7A3A"/><rect x="5" y="7" width="2" height="2" fill="#1a1a1a"/><rect x="9" y="7" width="2" height="2" fill="#1a1a1a"/><rect x="5" y="11" width="6" height="1" fill="#1a1a1a"/></svg>');
// Base simulée : données de départ, une clé par table Supabase. Les scénarios (S.*) remplacent certaines listes.
const DB = {
  hg_profiles: people.map(([p, id], i) => ({ id, pseudo: p, is_admin: id === ME, color: '#4F6A8F', avatar_url: null, created_at: iso(-300 + i), joined_on: i === 1 ? '2019-03-12' : null, birthday: null })),
  hg_settings: [{ key: 'theme', value: S.themeSetting || { mode: 'auto' } }, { key: 'bot', value: { notify: {} } }],
  // Notifications par catégorie (idée Q6) : scénario notifPrefs = ligne déjà enregistrée pour le membre connecté.
  hg_notif_prefs: S.notifPrefs ? [{ user_id: S.uid || ME, ...S.notifPrefs }] : [],
  // S.themes : thèmes supplémentaires semés par le scénario (test du thème Raclette, parcours-theme-raclette.cjs)
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
  hg_ss_assignments: [{ edition_id: 'E24', giver_id: ME, receiver_id: U(2) }, { edition_id: 'E24', giver_id: U(2), receiver_id: ME },
    // 2023 (terminée, édition fournie par le scénario du parcours parcours-ss-paires) : boucle de 5 dont 3 fantômes (ils ne sont pas dans hg_profiles : un membre ne les voit pas dans hg_members)
    { edition_id: 'E23', giver_id: ME, receiver_id: GHOSTS[0].id }, { edition_id: 'E23', giver_id: GHOSTS[0].id, receiver_id: U(3) },
    { edition_id: 'E23', giver_id: U(3), receiver_id: GHOSTS[1].id }, { edition_id: 'E23', giver_id: GHOSTS[1].id, receiver_id: GHOSTS[2].id },
    { edition_id: 'E23', giver_id: GHOSTS[2].id, receiver_id: ME },
    // 2025 (en cours, status « envoi » quand un scénario le demande) : ne doit jamais apparaître aux membres
    { edition_id: 'E25', giver_id: U(2), receiver_id: U(4) }, { edition_id: 'E25', giver_id: U(4), receiver_id: U(5) },
    { edition_id: 'E25', giver_id: U(5), receiver_id: U(6) }, { edition_id: 'E25', giver_id: U(6), receiver_id: U(2) }],
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
  // Pages du site : slug, libellé, mode (membres ou admin), présence dans la navigation, ordre.
  hg_pages: [...[['accueil','Accueil','membres',false],['secret-santa','Secret Santa','membres',true],['irl','IRL','membres',true],['historique','Historique','membres',true],['messages','Messages','membres',true],['evenements','Événements','membres',false],['membre',"Carte d'identité & annuaire",'membres',false],['recap','Récap annuel','membres',false],['cartes','Cartes à collectionner','admin',true],['quiz','Questions du gang','membres',true],['jeux','Jeux','admin',true],['nj-carte','Jeu · nj-carte','admin',false],['nj-jv','Jeu · nj-jv','admin',false],['nj-pochette','Jeu · nj-pochette','admin',false],['nj-replique','Jeu · nj-replique','admin',false],['nj-pays','Jeu · nj-pays','admin',false],['nj-plat','Jeu · nj-plat','admin',false],['nj-connexions','Jeu · nj-connexions','admin',false],['nj-motscroises','Jeu · nj-motscroises','admin',false],['nj-motmele','Jeu · nj-motmele','admin',false],['nj-anagramme','Jeu · nj-anagramme','admin',false],['nj-nerdle','Jeu · nj-nerdle','admin',false],['nj-demineur','Jeu · nj-demineur','admin',false],['nj-sudoku','Jeu · nj-sudoku','admin',false],['nj-2048','Jeu · nj-2048','admin',false],['arcade-flappy','Jeu · arcade-flappy','admin',false],['arcade-briques','Jeu · arcade-briques','admin',false],['arcade-snake','Jeu · arcade-snake','admin',false],['arcade-tetris','Jeu · arcade-tetris','admin',false],['arcade-invaders','Jeu · arcade-invaders','admin',false],['arcade-taupe','Jeu · arcade-taupe','admin',false],['duel-dames','Jeu · duel-dames','admin',false],['duel-echecs','Jeu · duel-echecs','admin',false],['duel-othello','Jeu · duel-othello','admin',false],['duel-pfc','Jeu · duel-pfc','admin',false],['blackjack','Jeu · blackjack','admin',false],['poker','Jeu · poker','admin',false],['catan','Jeu · catan','admin',false],['pictionary','Jeu · pictionary','admin',false]].map(([slug,label,mode,in_nav],sort)=>({slug,label,mode,in_nav,sort})), ...(S.pagesExtra || [])],
  hg_page_access: S.access || [],
  // S.ideas, S.support, S.adminLog, S.accessLog : données de départ facultatives (tests de recherche et de pagination)
  hg_ideas: S.ideas || [], hg_support: S.support || [], hg_activity: [], hg_messages: S.messages || [], hg_conversations: S.conversations || [], hg_profile_info: [],
  // Assistance en fil (migration 032) : réponses publiques et notes internes. S.replies : données de départ facultatives.
  // Les demandes portent updated_at / taken_by / taken_at / read_at quand le scénario les fournit (absents = demande neuve, non lue).
  hg_support_replies: S.replies || [],
  // Pièces jointes de l'assistance (migration 078) : S.supportFiles, sinon aucune.
  hg_support_files: S.supportFiles || [],
  // Migration 093 (idées A6, A9) : signalements et journal des erreurs du navigateur (scénarios S.reports, S.clientErrors).
  hg_reports: S.reports || [], hg_client_errors: S.clientErrors || [],
  // Journal admin (Pilotage > Journal) : entrées d'exemple ; scénario S.adminLog / S.accessLog pour en fournir d'autres.
  hg_admin_log: S.adminLog || [
    { id: 1, admin_id: ME, action: 'carte_donnee', target_user: U(2), target_ref: 'Série Printemps #12', details: { carte: 'Renard', quantite: 1 }, created_at: iso(-30) },
    { id: 2, admin_id: ME, action: 'ajustement_paillettes', target_user: U(3), target_ref: null, details: { before: 120, after: 150, motif: 'Sortie IRL' }, created_at: iso(-90) },
    { id: 3, admin_id: U(2), action: 'carte_supprimee', target_user: U(4), target_ref: 'Carte #7', details: { carte: 'Hibou' }, created_at: iso(-600) },
  ],
  hg_admin_access_log: S.accessLog || [
    { id: 1, admin_id: ME, conversation_id: 'cccccccc-0000-4000-8000-000000000001', conversation_kind: 'direct', accessed_at: iso(-10) },
  ],
  hg_card_trades: S.trades || [],
  // Sorties IRL : vides par défaut ; un scénario peut fournir S.sorties, S.rsvps, S.eventDates, S.eventVotes, S.photos.
  hg_event_rsvps: S.rsvps || [], hg_event_dates: S.eventDates || [], hg_event_date_votes: S.eventVotes || [], 
  // Staff : catalogue des permissions (migration 026) et membres Staff. Scénario S.staff : le membre connecté (S.uid) est Staff.
  hg_perm_catalog: [['membres','Membres'],['evenements','Sorties IRL'],['souvenirs','Souvenirs et photos'],['secret_santa','Secret Santa'],
    ['cartes','Jeu de cartes'],['badges','Badges'],['themes','Thèmes et événements'],['messages','Messagerie'],['support','Assistance et idées'],
    ['bot','Bot Discord'],['reglages','Réglages du site'],['journal','Journal admin'],['quiz','Questions du gang'],['mj','Maître du jeu']]
    .map(([key, label], i) => ({ key, label, description: 'Description de ' + label.toLowerCase(), sort: (i + 1) * 10 })),
  // Staff de test : scénario staffRows, ou un Staff construit à partir de S.staff pour le membre connecté (S.uid).
  hg_staff: S.staffRows || Array.isArray(S.staff) && S.staff.length ? (S.staffRows || [{ user_id: S.uid, perms: [...S.staff], active: true, note: 'Aide sur les cartes', added_by: ME,
    created_at: iso(-20), updated_at: iso(-20) }]) : [],
  // Souvenirs, photos et réactions (section admin « Souvenirs et photos »)
  // Sorties IRL de test (scénario sorties, sinon une seule sortie).
  hg_events: S.sorties || [{ id: 'eeeeeeee-0000-4000-8000-000000000001', title: 'Raclette de test', location: 'Lausanne', starts_at: iso(-30), created_by: ME }],
  hg_moments: [
    { id: 'mmmmmmmm-0000-4000-8000-000000000001', title: 'Le karaoké de Noël', body: 'Alice a chanté plus fort que tout le monde.', happened_on: iso(-20).slice(0, 10), image_path: null, created_by: U(2), created_at: iso(-20) },
    { id: 'mmmmmmmm-0000-4000-8000-000000000002', title: 'La partie de cartes', body: null, happened_on: iso(-60).slice(0, 10), image_path: `${U(3)}/moments/photo-souvenir.webp`, created_by: U(3), created_at: iso(-60) },
    { id: 'mmmmmmmm-0000-4000-8000-000000000003', title: 'Le sapin du lutin', body: 'Le sapin est tombé deux fois.', happened_on: iso(-400).slice(0, 10), image_path: null, created_by: ME, created_at: iso(-400) },
  ],
  hg_photos: S.photos || [
    { id: 'pppppppp-0000-4000-8000-000000000001', event_id: 'eeeeeeee-0000-4000-8000-000000000001', user_id: U(2), path: `${U(2)}/raclette-1.webp`, caption: 'Le fromage', created_at: iso(-30) },
    { id: 'pppppppp-0000-4000-8000-000000000002', event_id: 'eeeeeeee-0000-4000-8000-000000000001', user_id: ME, path: `${ME}/raclette-2.webp`, caption: null, created_at: iso(-30) },
  ],
  hg_reactions: [
    { id: 'rrrrrrrr-0000-4000-8000-000000000001', target_kind: 'moment', target_id: 'mmmmmmmm-0000-4000-8000-000000000001', user_id: U(3), emoji: '😂', created_at: iso(-19), active: true },
    { id: 'rrrrrrrr-0000-4000-8000-000000000002', target_kind: 'photo', target_id: 'pppppppp-0000-4000-8000-000000000001', user_id: U(4), emoji: '🔥', created_at: iso(-29), active: true },
    { id: 'rrrrrrrr-0000-4000-8000-000000000003', target_kind: 'moment', target_id: 'mmmmmmmm-0000-4000-8000-000000000003', user_id: U(5), emoji: '❤️', created_at: iso(-398), active: true },
    { id: 'rrrrrrrr-0000-4000-8000-000000000004', target_kind: 'moment', target_id: 'mmmmmmmm-0000-4000-8000-000000000001', user_id: U(6), emoji: '👏', created_at: iso(-18), active: false },
  ],
  hg_card_quests_templates: [
    { code: 'boosters_5', label: 'Ouvrir 5 boosters', metric: 'boosters_ouverts', target: 5, reward: 80, active: true, sort: 1 },
    { code: 'echange_1', label: 'Conclure un échange de cartes', metric: 'echanges_conclus', target: 1, reward: 50, active: true, sort: 2 },
    { code: 'photo_1', label: 'Ajouter une photo', metric: 'photos_ajoutees', target: 1, reward: 30, active: true, sort: 3 },
    { code: 'recycle_5', label: 'Recycler 5 cartes', metric: 'cartes_recyclees', target: 5, reward: 40, active: true, sort: 4 },
    { code: 'jour_3', label: 'Passer 3 fois au passage du jour', metric: 'passages_du_jour', target: 3, reward: 30, active: false, sort: 5 },
  ],
  // Questions du gang (migration 061) : questions lues par la section admin ; clés (hg_quiz_keys) lues seulement par hg_quiz_key.
  hg_seasons: [{ id: '2026-T3', label: 'Saison d’été 2026', starts_at: '2026-06-30T22:00:00Z', ends_at: '2026-09-30T22:00:00Z', settled_at: null }], // migration 086 (xJ4)
  hg_quiz_questions: [],
  hg_quiz_keys: [],
  hg_challenges: [
    { id: '00000000-0000-4000-8000-000000000024', title: 'Vingt sorties ce trimestre', description: 'Le gang fixe ensemble vingt sorties IRL.', metric: 'sorties_tenues', target: 20, reward: 100,
      starts_at: iso(-10), ends_at: iso(80), active: false },
  ],
};
// Extension par test (ex. tests/fixtures/fake-jeux.js, injecté par openPage({ init })) : complète la base au chargement.
if (typeof window.__FAKE_SETUP === 'function') window.__FAKE_SETUP(DB, { ME, S });
/* ---------- Boosters paramétrables (onglet admin « Boosters », migrations 069 et 071) ----------
   hg_booster_types : les 9 types seedés par 069, avec les colonnes de 071 (excluded_rarities, excluded_sets) et les valeurs
   du Collectionneur après 071 (sans identité, sans la série « Les OG »). hg_card_sets : quelques séries (code, name).
   Scénario : boosterTypes (remplace la liste), boosterSaveError (message d'erreur de hg_booster_type_save),
   boosterStatsFail (hg_booster_type_stats en erreur). RPC simulées plus bas : hg_booster_type_save, hg_booster_type_stats. */
/** Taux d'un type, dans l'ordre des raretés (commune → identité). */
const TAUX = (c, pc, r, e, l, m, i) => ({ commune: c, peu_commune: pc, rare: r, epique: e, legendaire: l, mythique: m, identite: i });
DB.hg_booster_types = (S.boosterTypes || [
  ['classique', 'Classique', 100, 5, TAUX(60, 25, 10, 4, 0.88, 0.1, 0.02), 3, 20, 'tous', null, true, 'cart--classique', 10],
  ['serie', 'Série', 150, 5, TAUX(60, 25, 10, 4, 0.88, 0.1, 0.02), 3, 20, 'serie', null, false, 'cart--serie', 20],
  ['argente', 'Argenté', 250, 5, TAUX(45, 30, 14.88, 8, 2, 0.1, 0.02), 4, 20, 'tous', null, false, 'cart--argente', 30],
  ['dore', 'Doré', 350, 5, TAUX(34, 31, 18.68, 12, 4, 0.3, 0.02), 4, 20, 'tous', null, false, 'cart--dore', 40],
  ['diamant', 'Diamant', 500, 5, TAUX(15, 28, 25, 20, 10, 1.98, 0.02), 10, 0, 'tous', 5, false, 'cart--diamant', 50],
  ['quitte_double', 'Quitte ou double', 500, 5, TAUX(90, 1.5, 1.5, 1.5, 3.98, 1.5, 0.02), 10, 0, 'tous', 5, false, 'cart--quitte', 60],
  ['collectionneur', 'Collectionneur', 500, 10, TAUX(60.1, 25, 10, 4, 0.5, 0.4, 0), 3, 20, 'manquantes', null, false, 'cart--collection', 70],
  ['holographique', 'Holographique', 1000, 5, TAUX(0, 20, 20, 20, 20, 20, 0), 10, 0, 'tous', 1, false, 'cart--holo', 80],
  ['identite', 'Identité', 10000, 5, TAUX(45, 25, 10, 4, 0.5, 0.5, 15), 3, 0, 'tous', null, false, 'cart--identite', 90],
].map(([id, name, price, size, rates, shiny_rate, pity_epique, pool, weekly_limit, free_daily, style, sort]) => ({
  id, name, price, size, rates, shiny_rate, pity_epique, pool, weekly_limit, free_daily, style, sort, description: `Booster ${name}.`, active: true,
  excluded_rarities: id === 'collectionneur' ? ['identite'] : [], excluded_sets: id === 'collectionneur' ? ['gang-membres'] : [], updated_at: iso(-1) })));
DB.hg_card_sets = [
  { id: 'SET-OG', code: 'gang-membres', name: 'Les OG', description: null, starts_at: null, ends_at: null, active: true, sort: 1, created_at: iso(-200) },
  { id: 'SET-PR', code: 'printemps', name: 'Printemps', description: null, starts_at: null, ends_at: null, active: true, sort: 2, created_at: iso(-100) },
  { id: 'SET-HA', code: 'halloween', name: 'Halloween', description: null, starts_at: null, ends_at: null, active: true, sort: 3, created_at: iso(-20) },
];
// Clé publique de notification push (valeur factice pour les tests).
DB.hg_settings.push({ key: 'push_vapid_public', value: 'BOOPdSa019_test' });
for (const r of S.settings || []) { DB.hg_settings = DB.hg_settings.filter((x) => x.key !== r.key); DB.hg_settings.push({ ...r }); } // lot 2 : réglages semés par le scénario (scenario.settings)
/* ---------- Droits et profils ---------- */
/** Clés des permissions Staff, dans l'ordre du catalogue. */
const CATALOG_KEYS = DB.hg_perm_catalog.map((c) => c.key);
/** Identifiant de l'utilisateur connecté dans le scénario (ME par défaut). */
const uidNow = () => S.uid || ME;
/** Vrai si l'utilisateur connecté est administrateur dans la base simulée. */
const isAdminNow = () => !!DB.hg_profiles.find((p) => p.id === uidNow())?.is_admin;
// Réponse de refus, comme la base quand la fonction est réservée à l'admin (code 42501).
const denied = { data: null, error: { message: 'Réservé à l\'admin', code: '42501' } };
/** Droits de l'utilisateur connecté : tout le catalogue pour un admin, sinon ses permissions Staff actives. */
const myPermsNow = () => {
  if (isAdminNow()) return { is_admin: true, perms: [...CATALOG_KEYS] };
  const row = DB.hg_staff.find((x) => x.user_id === uidNow() && x.active);
  return { is_admin: false, perms: row ? [...row.perms] : [] };
};
/** Liste des Staff enrichie du pseudo et du nom de l'ajouteur, triée : actifs d'abord, puis par pseudo. */
const staffRowsNow = () => DB.hg_staff.map((x) => {
  const p = DB.hg_profiles.find((q) => q.id === x.user_id) || {};
  const a = DB.hg_profiles.find((q) => q.id === x.added_by);
  return { user_id: x.user_id, pseudo: p.pseudo, avatar_url: p.avatar_url ?? null, color: p.color ?? null, perms: [...x.perms], active: x.active,
    note: x.note, added_by_pseudo: a?.pseudo ?? null, created_at: x.created_at, updated_at: x.updated_at };
}).sort((a, b) => Number(b.active) - Number(a.active) || String(a.pseudo).localeCompare(String(b.pseudo)));
// Image de remplacement pour les URL signées du bucket hg-photos (carré gris, sans réseau).
const PHOTO_SVG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#8a7f9c"/></svg>');
/** Génère un identifiant unique (format UUID) pour les lignes créées pendant un test. */
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
// Le badge « Fidèle » a des niveaux, pour la page de badges.
Object.assign(DB.hg_badges.find((b) => b.code === 'fidele'), { name: 'Fidèle', description: 'Membre du gang depuis des années', levels_enabled: true, metric: 'anciennete_annees',
  levels: [{ level: 1, threshold: 1, name: 'Bronze' }, { level: 2, threshold: 3, name: 'Argent' }, { level: 3, threshold: 5, name: 'Or', image_url: PUMPKIN }] });
// L'administrateur est membre depuis quatre ans (ancienneté des badges).
DB.hg_profiles[0].created_at = iso(-4 * 365);
// Visite guidée (Q1) : scenario.tour = null (jamais vue), '1970-01-01T00:00:00Z' (inscrit avant la visite) ou une date.
if ('tour' in S) { const tp = DB.hg_profiles.find((p) => p.id === (S.uid || ME)); if (tp) tp.tour_done_at = S.tour; }
// Captures de démonstration : quelques joueurs ont attrapé des citrouilles, puis des flocons.
for (const [u, n] of [[U(2), 4], [ME, 2], [U(3), 1]]) for (let i = 0; i < n; i++) DB.hg_dyn_captures.push({ event_id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: u, captured_at: iso(-1 + i / 10) });
for (const [u, n] of [[U(4), 6], [ME, 3], [U(5), 2], [U(2), 1]]) for (let i = 0; i < n; i++) DB.hg_dyn_captures.push({ event_id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: u, captured_at: iso(-310 + i / 10) });
// Scénario badgeCount : le membre de test (ME) obtient exactement N badges (0, 3 par défaut, 20…).
// Les badges ajoutés alternent image et repli (initiales) ; le premier est à niveaux.
if (Number.isInteger(S.badgeCount)) {
  const mine = DB.hg_user_badges.filter((u) => u.user_id === ME);
  DB.hg_user_badges = DB.hg_user_badges.filter((u) => u.user_id !== ME || mine.indexOf(u) < S.badgeCount);
  for (let i = mine.length; i < S.badgeCount; i++) {
    const code = `test_badge_${String(i).padStart(2, '0')}`;
    DB.hg_badges.push({ code, name: `Badge test ${i + 1}`, description: 'Badge de test', image_url: i % 3 ? PUMPKIN : null, sort: 1000 + i,
      levels_enabled: i === 0, levels: i === 0 ? [{ level: 1, threshold: 1, name: 'Bronze' }, { level: 2, threshold: 3, name: 'Argent' }] : [] });
    DB.hg_user_badges.push({ user_id: ME, badge_code: code, awarded_at: iso(-i - 1), level: i === 0 ? 2 : 1 });
  }
}
/* ---------- Secrets, fil d'activité (sections admin Secrets et Fil d'activité, état du site) ----------
   Scénario : eggLog (lignes de hg_egg_log : user_id, egg, period, reward, found_at), activity (lignes de hg_activity :
   id, user_id, kind, text, created_at). Sans eux : tables vides (comportement d'avant). Le réglage « eggs » et
   site_identite (maintenance, bandeau) se sèment avec scenario.settings. */
DB.hg_egg_log = S.eggLog || [];
if (S.activity) DB.hg_activity = S.activity.map((r) => ({ ...r }));
// Rend la base et le journal lisibles par les tests (page.evaluate).
window.__DB = DB; window.__LOG = [];
// Rôles (migration 103, parcours-admin-roles) : rôles de départ et liens membre-rôle. scenario.roles = tableau : rôles remplacés ;
// scenario.roles = true : pages des rôles passées en mode « liste » (comme en ligne). scenario.memberRoles : liens membre-rôle.
DB.hg_roles = (Array.isArray(S.roles) ? S.roles : [
  { id: 'irl', label: 'IRL', description: 'Membres qui participent aux sorties.', color: '#E0909A', pages: ['irl', 'historique'], sort: 1 },
  { id: 'secret-santa', label: 'Secret Santa', description: 'Participants au Secret Santa.', color: '#9A88C4', pages: ['secret-santa'], sort: 2 },
]).map((r) => ({ created_at: iso(-30), updated_at: iso(-30), ...r }));
DB.hg_member_roles = (S.memberRoles ?? []).map((l) => ({ added_by: ME, added_at: iso(-3), ...l }));
if (S.roles) for (const p of DB.hg_pages) if (['irl', 'historique', 'secret-santa'].includes(p.slug)) p.mode = 'liste';
/* ---------- Session ---------- */
// Session : un visiteur (S.guest) n'est connecté qu'après signInWithPassword. La session tient dans
// localStorage, comme le vrai client, pour survivre à la redirection qui suit la connexion.
// Sans clé enregistrée : visiteur (S.guest) = non connecté, membre = connecté. Après une déconnexion, la clé vaut '0'
// (le membre reste alors déconnecté, comme en ligne).
const SESSION_KEY = 'hg_test_session';
/** Vrai si la session est ouverte. La clé localStorage l'emporte sur le scénario (S.guest). */
const signed = () => { try { const v = localStorage.getItem(SESSION_KEY); if (v !== null) return v === '1'; } catch (e) { /* stockage indisponible */ } return !S.guest; };
/** Enregistre l'état de la session dans localStorage (sans effet si le stockage est bloqué). */
const setSigned = (on) => { try { localStorage.setItem(SESSION_KEY, on ? '1' : '0'); } catch (e) { /* stockage indisponible */ } };
// Fonctions SQL exécutables par le rôle anon (sinon : 401 « permission denied » sans session). Relevé en lecture seule
// sur le projet (has_function_privilege('anon', …)). Toute autre RPC appelée sans session est refusée et journalisée.
// Suppressions en cascade, comme les clés étrangères ON DELETE CASCADE de la base : table enfant, colonne, clé parente.
const CASCADE = {
  hg_ss_editions: [['hg_ss_participants', 'edition_id', 'id'], ['hg_ss_exclusions', 'edition_id', 'id'], ['hg_ss_assignments', 'edition_id', 'id'], ['hg_ss_wishes', 'edition_id', 'id'], ['hg_conversations', 'edition_id', 'id']],
  hg_pages: [['hg_page_access', 'page_slug', 'slug']],
};
// Fonctions SQL appelables sans session (rôle anon), comme en ligne.
const ANON_OK = new Set(['hg_client_error', 'hg_support_public', 'hg_auth_user_gone', 'hg_card_rank', 'hg_card_roll', 'hg_cards_admin_audit_del', 'hg_claim_invite_link', 'hg_msg_push_trg', 'hg_msg_realtime_trg']);
// Compléments par paquet (S.extra = nom d'un fichier de tests/fixtures/) : le module reçoit la base et le scénario,
// peut y ajouter ses tables et renvoie { rpc(fn, args) } (réponse ou undefined). Servi depuis le dépôt comme le site.
const EXTRA = S.extra ? (await import(`${location.origin}${window.__HG_RACINE || ''}/tests/fixtures/${S.extra}`)).default({ DB, S, uidNow, ME, U }) : null;
// Compteur utilisé par uid() pour produire des identifiants distincts.
let seq = 0;
/** Lit la colonne c d'une ligne (valeur brute, sans transformation). */
const getv = (r, c) => r[c];
/* ---------- Requête factice (faux .from()). Les filtres sont notés puis appliqués au moment d'exécuter la requête (run). ---------- */
/** Requête factice : chaînage de filtres et d'opérations, exécutée quand on l'attend (await), comme PostgREST. */
class Q {
  /** Prépare une requête sur la table t, en lecture (select) par défaut. */
  constructor(t) { this.t = t; this.f = []; this.one = false; this.op = 'select'; this.payload = null; this.ret = false; }
  /** Choisit les colonnes à lire ; o.head demande seulement le nombre de lignes (count). */
  select(_c, o) { if (this.op !== 'select') this.ret = true; this.head = !!o?.head; return this; }
  /** Filtre : la colonne c vaut v. */
  eq(c, v) { this.f.push((r) => getv(r, c) === v); return this; }
  /** Filtre : la colonne c ne vaut pas v. */
  neq(c, v) { this.f.push((r) => getv(r, c) !== v); return this; }
  /** Filtre : la colonne c est dans la liste v. */
  in(c, v) { this.f.push((r) => v.includes(getv(r, c))); return this; }
  /** Filtre : la colonne c vaut exactement v (null compris). */
  is(c, v) { this.f.push((r) => (getv(r, c) ?? null) === v); return this; }
  /** Filtre négatif : seul l'opérateur « is » est simulé. */
  not(c, op, v) { if (op === 'is') this.f.push((r) => (getv(r, c) ?? null) !== v); return this; }
  // Méthodes sans effet sur les données simulées : elles renvoient la requête telle quelle (tri, limite et OU ne sont pas simulés).
  or() { return this; } order() { return this; } limit() { return this; } gte() { return this; } lte() { return this; } lt() { return this; } gt() { return this; } contains() { return this; }
  // range(a, b) : lignes a à b incluses (pagination) ; appliqué après les filtres.
  range(a, b) { this.rg = [a, b]; return this; }
  // ilike(c, motif) : % et _ joker, insensible à la casse (comme PostgREST).
  ilike(c, pat) {
    const re = new RegExp('^' + String(pat).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
    this.f.push((r) => re.test(String(getv(r, c) ?? '')));
    return this;
  }
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
  /** Exécute la requête sur DB et renvoie { data, error } comme le vrai client. Les cas particuliers (réglages, pages, réponses) sont traités à part. */
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
    if (this.op === 'upsert' && this.t === 'hg_settings') {  // clé primaire : une ligne par clé, remplacée
      const rows = (Array.isArray(this.payload) ? this.payload : [this.payload]);
      for (const r of rows) { const i = tab.findIndex((x) => x.key === r.key); if (i >= 0) tab[i] = { ...r }; else tab.push({ ...r }); }
      return { data: rows, error: null };
    }
    // Scénario botSettingsFail : la lecture des réglages du bot échoue (bandeau « recharge la page », aucune écriture possible).
    if (this.op === 'select' && this.t === 'hg_settings' && S.botSettingsFail) return { data: null, error: { message: 'Failed to fetch' } };
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
        if (r.id === undefined && ['hg_moments', 'hg_photos', 'hg_events', 'hg_support_replies'].includes(this.t)) r.id = uid(); // comme la base (gen_random_uuid)
        if (this.t === 'hg_support_replies' && r.created_at === undefined) r.created_at = new Date().toISOString();
        if (this.t === 'hg_moments' && r.created_at === undefined) r.created_at = new Date().toISOString();
        tab.unshift(r);
      }
      // Déclencheur de la migration 032 : une réponse remet la demande à jour et la prend en charge si elle ne l'est pas
      if (this.t === 'hg_support_replies') for (const r of rows) {
        const sup = (DB.hg_support || []).find((x) => x.id === r.support_id);
        if (!sup) continue;
        const now = new Date().toISOString();
        sup.updated_at = now;
        if (!sup.taken_by) { sup.taken_by = r.author_id; sup.taken_at = now; }
      }
      return { data: this.one ? rows[0] : rows, error: null };
    }
    // Mise à jour : les lignes qui respectent les filtres reçoivent les champs de la charge utile.
    if (this.op === 'update') { const rows = tab.filter(match); rows.forEach((r) => Object.assign(r, this.payload)); return { data: this.one ? rows[0] ?? null : rows, error: null }; }
    // Suppression : retire les lignes filtrées, puis applique les suppressions en cascade (CASCADE).
    if (this.op === 'delete') {
      const gone = tab.filter(match), keep = tab.filter((r) => !match(r));
      tab.length = 0; tab.push(...keep);
      for (const [child, col, key] of CASCADE[this.t] || []) {
        const ids = new Set(gone.map((r) => r[key])), kids = DB[child] || [];
        const kept = kids.filter((r) => !ids.has(r[col]));
        kids.length = 0; kids.push(...kept);
      }
      return { data: null, error: null, count: gone.length };
    }
    // Lecture : les lignes qui respectent les filtres.
    let out = tab.filter(match);
    // Fantômes : leur profil se lit par id comme les autres (ils ne sont pas dans DB.hg_profiles, qui alimente les listes de membres)
    if (this.t === 'hg_profiles' && this.op === 'select' && !out.length) {
      out = (window.__SCN?.ghosts ?? []).map((g) => ({ is_admin: false, color: '#8F5F4F', birthday: null, avatar_url: null, ...g, is_ghost: true }))
        .filter((r) => this.f.every((fn) => fn(r)));
    }
    // Résultat : seulement le nombre (count), une ligne (single) ou la liste, découpée par range() si demandé.
    if (this.head) return { data: null, error: null, count: out.length };
    if (this.one) return { data: out[0] ?? null, error: null };
    return { data: this.rg ? out.slice(this.rg[0], this.rg[1] + 1) : out, error: null };
  }
  /** Permet d'attendre la requête avec await : exécute run() et transmet son résultat. */
  then(res, rej) { return Promise.resolve(this.run()).then(res, rej); }
}
/* ---------- Temps réel simulé ---------- */
// Temps réel simulé. sb.channel(nom).on(type, filtre, cb).subscribe(cb) : le canal s'enregistre ici.
// Par défaut il ne se confirme pas (comme un client sans Realtime) ; scénario realtime: true → SUBSCRIBED.
// window.__fakeRealtime.emit(table, payload) : déclenche les écouteurs « postgres_changes » de cette table
// (payload : { eventType, new, old }, INSERT par défaut). .status(s) : envoie un état à tous les canaux.
// .tables() : tables abonnées par les canaux ouverts.
const RT = { channels: new Set() };
/** Canal temps réel factice : on() enregistre des écouteurs, subscribe() enregistre le canal. */
function makeChannel(name) {
  const ch = {
    name, handlers: [], cb: null,
    /** Ajoute un écouteur (type, filtre, callback). */
    on(type, filter, cb) { this.handlers.push({ type, filter: filter || {}, cb }); return this; },
    /** Enregistre le canal ; avec le scénario realtime, confirme SUBSCRIBED. */
    subscribe(cb) {
      this.cb = typeof cb === 'function' ? cb : null;
      RT.channels.add(this);
      if (S.realtime && this.cb) setTimeout(() => this.cb('SUBSCRIBED'), 0);
      return this;
    },
  };
  return ch;
}
window.__fakeRealtime = {
  /** Tables écoutées par les canaux ouverts. */
  tables: () => [...RT.channels].flatMap((c) => c.handlers.filter((h) => h.type === 'postgres_changes').map((h) => h.filter.table)),
  /** Simule un changement en base sur la table (INSERT par défaut) et prévient les écouteurs de cette table. */
  emit(table, payload = {}) {
    const ev = { schema: 'public', table, commit_timestamp: new Date().toISOString(), eventType: payload.eventType || 'INSERT',
      new: payload.new || {}, old: payload.old || {}, errors: null };
    for (const c of [...RT.channels]) for (const h of c.handlers) {
      if (h.type === 'postgres_changes' && h.filter.table === table && (!h.filter.event || h.filter.event === '*' || h.filter.event === ev.eventType)) h.cb(ev);
    }
  },
  /** Envoie un état de canal (s) à tous les canaux ouverts. */
  status(s) { for (const c of [...RT.channels]) if (c.cb) c.cb(s); },
};

/* ---------- Stockage ---------- */
// Stockage privé hg-bot-media (pièces jointes du message manuel, migration 037) : simulé en mémoire.
// Seules les métadonnées sont gardées (window.__MEDIA[chemin] = { size, type, name }) ; limite de 10 Mo comme le bucket.
/** Faux bucket hg-bot-media : garde en mémoire les métadonnées des pièces jointes, refuse plus de 10 Mo ou un doublon. */
function botMediaBucket() {
  window.__MEDIA = window.__MEDIA || {};
  return {
    /** Téléversement simulé : refuse un fichier de plus de 10 Mo ou déjà présent. */
    upload: async (p, file) => {
      window.__LOG.push(['upload', p]);
      if (file.size > 10485760) return { data: null, error: { message: 'The object exceeded the maximum allowed size' } };
      if (window.__MEDIA[p]) return { data: null, error: { message: 'The resource already exists' } };
      window.__MEDIA[p] = { size: file.size, type: file.type, name: file.name };
      return { data: { path: p }, error: null };
    },
    /** Téléchargement simulé : renvoie un blob vide du bon type si le fichier existe. */
    download: async (p) => (window.__MEDIA[p]
      ? { data: new Blob([''], { type: window.__MEDIA[p].type }), error: null }
      : { data: null, error: { message: 'Object not found' } }),
    /** Suppression simulée des fichiers listés. */
    remove: async (paths) => { window.__LOG.push(['remove-media', paths]); for (const p of paths) delete window.__MEDIA[p]; return { data: [], error: null }; },
  };
}

// Réponse de hg-notify « admin_dm » : un résultat par destinataire, et le salon si demandé (comme la fonction réelle).
/** Réponse simulée de la fonction hg-notify « admin_dm » : un résultat par destinataire. */
// Test du bot (bot_test) : un résultat par salon ; en échec les ids de scenario.botChannelFail.
function botTestResult() {
  const fails = (S.botChannelFail || []).map((id) => ({ id, ok: false, error: 'Le bot ne peut pas écrire dans ce salon.' }));
  return { channel: true, dm: true, channels: [{ id: 'salon-ok', ok: true }, ...fails] };
}
// Annonce libre dans des salons (body.channels) : un résultat par salon, en échec pour les ids de scenario.botChannelFail.
function adminDmResult(body) {
  const recipients = (body.user_ids || []).map((id) => ({ user_id: id, pseudo: DB.hg_profiles.find((x) => x.id === id)?.pseudo ?? null, ok: true, status: 'sent', reason: null }));
  const channels = Array.isArray(body.channels)
    ? body.channels.map((id) => (S.botChannelFail || []).includes(id) ? { id, ok: false, error: 'Le bot ne peut pas écrire dans ce salon.' } : { id, ok: true })
    : undefined;
  return { ok: true, recipients, sent: recipients.length, failed: 0, skipped: 0, channel: body.channel ? true : null, channel_error: null, log_id: 1, log_error: null, ...(channels ? { channels } : {}) };
}

/* ---------- Questions du gang : hg_quiz_save simulée (validations du serveur, messages en français) ---------- */
/** Réponse d'erreur de hg_quiz_save. */
const quizErr = (message) => ({ data: null, error: { message } });
/**
 * Enregistre une question et sa clé comme hg_quiz_save : création si p_id est vide, sinon modification.
 * Les contrôles reprennent ceux de la migration 061 (nombre de choix, bonne réponse, réponses acceptées, valeur).
 * @param {{p_id: string|null, p_question: object, p_key: object}} args Arguments de l'appel.
 */
function quizSave(args) {
  if (S.quizError) return quizErr(S.quizError);
  const q = args.p_question || {}, key = args.p_key || {}, t = q.qtype;
  if (!['choix_unique', 'choix_multiple', 'vrai_faux', 'texte', 'nombre'].includes(t)) return quizErr('Type de question inconnu');
  let opts = Array.isArray(q.options) ? q.options : [];
  if (t === 'vrai_faux') opts = [{ id: 'vrai', text: 'Vrai' }, { id: 'faux', text: 'Faux' }];
  if (t === 'texte' || t === 'nombre') opts = [];
  const ids = opts.map((o) => o.id);
  if (t === 'choix_unique' || t === 'choix_multiple') {
    if (opts.length < 2 || opts.length > 10) return quizErr('Il faut entre 2 et 10 choix');
    if (opts.some((o) => !String(o.text || '').trim())) return quizErr('Chaque choix a besoin d\'un texte (200 caractères au plus)');
  }
  if (t === 'choix_unique' || t === 'choix_multiple' || t === 'vrai_faux') {
    const c = key.correct || [];
    if (!c.length || !c.every((x) => ids.includes(x))) return quizErr('Coche la ou les bonnes réponses');
    if (t !== 'choix_multiple' && c.length !== 1) return quizErr('Une seule bonne réponse pour ce type');
  } else if (t === 'texte') {
    if (!key.manual && !(key.accepted || []).some((a) => String(a).trim())) return quizErr('Donne au moins une réponse acceptée, ou choisis la validation à la main');
  } else if (!/^-?[0-9]+(\.[0-9]+)?$/.test(String(key.value ?? ''))) return quizErr('Donne la valeur attendue');
  const now = new Date().toISOString();
  const fields = { prompt: String(q.prompt || '').trim(), qtype: t, difficulty: q.difficulty || 'moyen', category: q.category || null, options: opts,
    explanation: q.explanation || null, image_url: q.image_url || null, reward: q.reward ?? 0, starts_at: q.starts_at || now, ends_at: q.ends_at ?? null, active: q.active ?? true };
  if (!args.p_id) {
    const row = { id: uid(), ...fields, created_by: ME, created_at: now, updated_at: now };
    DB.hg_quiz_questions.unshift(row);
    DB.hg_quiz_keys.push({ question_id: row.id, answer: key });
    window.__LOG.push(['quiz_save', 'create', t]);
    return { data: row.id, error: null };
  }
  const row = DB.hg_quiz_questions.find((x) => x.id === args.p_id);
  if (!row) return quizErr('Question introuvable');
  Object.assign(row, fields, { updated_at: now });
  const k = DB.hg_quiz_keys.find((x) => x.question_id === row.id);
  if (k) k.answer = key; else DB.hg_quiz_keys.push({ question_id: row.id, answer: key });
  window.__LOG.push(['quiz_save', 'update', t]);
  return { data: row.id, error: null };
}

/* ---------- Questions du gang (/pages/jeux/quiz.html) ----------
   QUIZ : questions de démonstration, une par type, avec leur clé (correction côté faux serveur, jamais renvoyée telle quelle).
   QUIZ_ANS : réponses déjà données par le membre connecté (clé = identifiant de la question). */
const QUIZ = [
  { id: 'qz-1', prompt: 'De quelle couleur est le logo du Humane Gang ?', qtype: 'choix_unique', difficulty: 'facile', category: 'Culture du gang', image_url: null,
    options: [{ id: 'a', text: 'Rouge' }, { id: 'b', text: 'Bleu' }, { id: 'c', text: 'Vert' }], explanation: 'Le logo reprend le bleu de la bannière.', reward: 50,
    key: { correct: ['b'] }, ends_at: null },
  { id: 'qz-2', prompt: 'Le Secret Santa se tire au sort une fois par an.', qtype: 'vrai_faux', difficulty: 'moyen', category: null, image_url: null,
    options: [{ id: 'vrai', text: 'Vrai' }, { id: 'faux', text: 'Faux' }], explanation: null, reward: 100, key: { correct: ['vrai'] }, ends_at: null },
  { id: 'qz-3', prompt: 'Quels langages sont utilisés par le site ? (choisis tout ce qui convient)', qtype: 'choix_multiple', difficulty: 'difficile', category: 'Technique', image_url: null,
    options: [{ id: 'html', text: 'HTML' }, { id: 'css', text: 'CSS' }, { id: 'js', text: 'JavaScript' }, { id: 'cobol', text: 'COBOL' }],
    explanation: 'Le site est en HTML, CSS et JavaScript vanilla.', reward: 250, key: { correct: ['css', 'html', 'js'] }, ends_at: null },
  { id: 'qz-4', prompt: 'Comment s’appelle la monnaie du gang ?', qtype: 'texte', difficulty: 'moyen', category: null, image_url: null,
    options: [], explanation: 'Les Paillettes, notées ✦.', reward: 100, key: { accepted: ['Paillettes'], manual: false }, ends_at: 'soon' },
  { id: 'qz-5', prompt: 'Combien de tutos compte la page d’aide ?', qtype: 'nombre', difficulty: 'expert', category: 'Aide', image_url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#E2C77E"/></svg>'),
    options: [], explanation: null, reward: 500, key: { value: 62, tolerance: 0 }, ends_at: null },
  { id: 'qz-6', prompt: 'Raconte le plus beau souvenir du gang.', qtype: 'texte', difficulty: 'difficile', category: 'Souvenirs', image_url: null,
    options: [], explanation: null, reward: 250, key: { accepted: [], manual: true }, ends_at: null },
  // Question bonus secrète (secret : true) : affichée en tête des ouvertes, avec le libellé « Question secrète »
  { id: 'qz-9', prompt: 'Quel mot se cache derrière la lettre du site ?', qtype: 'texte', difficulty: 'moyen', category: 'Secret', image_url: null,
    options: [], explanation: 'Le mot est dans le code, tout en majuscules.', reward: 300, key: { accepted: ['SECRETS'], manual: false }, ends_at: null, secret: true },
  // Déjà répondues : une juste (qz-7) et une fausse (qz-8)
  { id: 'qz-7', prompt: 'Quel est le jour du Secret Santa ?', qtype: 'choix_unique', difficulty: 'facile', category: null, image_url: null,
    options: [{ id: 'a', text: 'Le 24 décembre' }, { id: 'b', text: 'Le 1er janvier' }], explanation: 'Il se fait avant Noël.', reward: 50, key: { correct: ['a'] }, ends_at: null,
    answer: { response: 'a', is_correct: true, reward: 50, answered_at: 'past' } },
  { id: 'qz-8', prompt: 'Combien de membres au total ?', qtype: 'nombre', difficulty: 'moyen', category: null, image_url: null,
    options: [], explanation: 'Le compte se fait dans l’annuaire.', reward: 100, key: { value: 7, tolerance: 0 }, ends_at: null,
    answer: { response: '3', is_correct: false, reward: 0, answered_at: 'past' } },
];
/** Date d'une réponse déjà donnée (ISO), pour le faux. */
const QUIZ_PAST = iso(-2);
/** Solution d'une question corrigée, comme la base : textes acceptés, valeur, ou identifiants corrects. */
const quizSolution = (q) => (q.qtype === 'texte' ? q.key.accepted : q.qtype === 'nombre' ? q.key.value : q.key.correct);
/** Texte normalisé pour comparer un texte libre : minuscules, sans accents, sans ponctuation. */
const quizNorm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Correction d'une réponse, comme hg_quiz_check : true, false, ou null (texte à valider à la main). */
function quizCheck(q, r) {
  if (q.qtype === 'choix_multiple' || q.qtype === 'choix_unique' || q.qtype === 'vrai_faux') {
    const ids = [...new Set([].concat(r))].sort(), good = [...q.key.correct].sort();
    return ids.length > 0 && ids.join(',') === good.join(',');
  }
  if (q.qtype === 'texte') {
    if (q.key.accepted.some((a) => quizNorm(a) && quizNorm(a) === quizNorm(r))) return true;
    return q.key.manual ? null : false;
  }
  const v = Number(String(r).replace(',', '.'));
  return Number.isFinite(v) && Math.abs(v - q.key.value) <= (q.key.tolerance || 0);
}
/** Question du tableau de démonstration, avec sa réponse éventuelle, pour hg_quiz_list. */
function quizRow(q) {
  const a = q.answer ? { ...q.answer, answered_at: q.answer.answered_at === 'past' ? QUIZ_PAST : new Date().toISOString() } : null;
  const corrected = a && a.is_correct !== null;
  return { id: q.id, prompt: q.prompt, type: q.qtype, difficulty: q.difficulty, category: q.category, options: q.options,
    image_url: q.image_url, reward: q.reward, starts_at: iso(-10), ends_at: q.ends_at === 'soon' ? iso(3) : null, secret: !!q.secret,
    answered: !!a, my_response: a ? a.response : null, correct: a ? a.is_correct : null, earned: a ? a.reward : 0,
    answered_at: a ? a.answered_at : null, explanation: a ? q.explanation : null, solution: corrected ? quizSolution(q) : null };
}

/* ---------- Boosters paramétrables : hg_booster_type_save simulée (contrat de la migration 071, messages en français) ----------
   Création : { create: true, id, name, price, rates, … } (défauts : size 5, shiny_rate 3, pity_epique 0, pool « tous »,
   weekly_limit null, free_daily false, style cart--classique, active true, sort = max + 10, exclusions vides).
   Modification : { id, …seulement les champs changés }. Réponse : { type, created, free_daily_removed_from }. */
/** Raretés tirées (les 7 clés des taux, sans « unique »). */
const BOOSTER_RARITIES = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire', 'mythique', 'identite'];
/** Styles de cartouche permis : 9 d'origine + 30 couleurs + 14 thèmes + 3 de saison (migrations 077 et 080, hg_booster_styles()). */
const BOOSTER_STYLES = ['cart--classique', 'cart--serie', 'cart--argente', 'cart--dore', 'cart--diamant', 'cart--quitte', 'cart--holo', 'cart--collection', 'cart--identite',
  'cart--rubis', 'cart--paprika', 'cart--braise', 'cart--corail', 'cart--framboise', 'cart--dragee', 'cart--fuchsia', 'cart--mauve', 'cart--lavande', 'cart--prune', 'cart--abricot', 'cart--mandarine', 'cart--miel', 'cart--cuivre', 'cart--cacao', 'cart--citron', 'cart--pistache', 'cart--kiwi', 'cart--olive', 'cart--acide', 'cart--menthe', 'cart--lagon', 'cart--petrole', 'cart--azur', 'cart--saphir', 'cart--pervenche', 'cart--amethyste', 'cart--indigo', 'cart--ardoise', 'cart--ivoire',
  'cart--theme-pate', 'cart--theme-saucisse', 'cart--theme-pate-saucisse', 'cart--theme-raclette', 'cart--theme-fondue', 'cart--theme-arene', 'cart--theme-blocs', 'cart--theme-usine', 'cart--theme-noel', 'cart--theme-halloween', 'cart--theme-paques', 'cart--theme-saint-nicolas', 'cart--theme-feux-artifice', 'cart--theme-gateau-anniversaire',
  'cart--esport', 'cart--pate', 'cart--raclette'];
/**
 * Crée ou modifie un type comme hg_booster_type_save(p jsonb) : droits, validations, gratuit du jour unique.
 * L'appel est noté dans le journal : ['booster_type_save', id, p].
 * @param {object} p charge utile envoyée par l'admin
 */
function boosterTypeSave(p) {
  const err = (message) => ({ data: null, error: { message } });
  if (!myPermsNow().is_admin && !myPermsNow().perms.includes('cartes')) return err('Réservé à l\'admin et au Staff « cartes »');
  if (S.boosterSaveError) return err(S.boosterSaveError);
  if (!p || typeof p !== 'object') return err('Données manquantes');
  window.__LOG.push(['booster_type_save', p.id, JSON.parse(JSON.stringify(p))]);
  const has = (k) => Object.prototype.hasOwnProperty.call(p, k);
  let row = DB.hg_booster_types.find((x) => x.id === p.id);
  const created = p.create === true;
  if (created) {
    if (!/^[a-z0-9_]{2,30}$/.test(String(p.id || ''))) return err('Identifiant invalide : de 2 à 30 caractères parmi a à z, 0 à 9 et _');
    if (row) return err(`Un type « ${p.id} » existe déjà (l'identifiant ne se change pas)`);
    if (!has('name') || !has('price') || !has('rates')) return err('Nom, prix et taux sont obligatoires');
  } else if (!row) return err(`Type inconnu : ${p.id}`);
  const base = row || { size: 5, shiny_rate: 3, pity_epique: 0, pool: 'tous', weekly_limit: null, free_daily: false, style: 'cart--classique', description: null,
    active: true, sort: DB.hg_booster_types.reduce((m, t) => Math.max(m, t.sort), 0) + 10, excluded_rarities: [], excluded_sets: [] };
  const n = { ...base };
  for (const k of ['name', 'price', 'size', 'rates', 'shiny_rate', 'pity_epique', 'pool', 'weekly_limit', 'free_daily', 'style', 'description', 'active', 'sort', 'excluded_rarities', 'excluded_sets']) if (has(k)) n[k] = p[k];
  if (n.weekly_limit === '') n.weekly_limit = null;
  if (typeof n.description === 'string' && !n.description.trim()) n.description = null;
  const name = String(n.name || '').trim();
  if (!name || name.length > 60) return err('Le nom fait de 1 à 60 caractères');
  if (!Number.isInteger(n.price) || n.price < 0) return err('Le prix doit être un entier positif');
  if (!Number.isInteger(n.size) || n.size < 1 || n.size > 10) return err('Un booster contient de 1 à 10 cartes');
  const r = n.rates || {};
  if (Object.keys(r).length !== 7 || !BOOSTER_RARITIES.every((k) => typeof r[k] === 'number' && r[k] >= 0)) return err('Les taux doivent couvrir les 7 raretés');
  const sum = BOOSTER_RARITIES.reduce((s, k) => s + r[k], 0);
  if (sum < 99.99 || sum > 100.01) return err(`Les taux doivent faire 100 % au total (actuellement ${Math.round(sum * 100) / 100} %)`);
  if (typeof n.shiny_rate !== 'number' || n.shiny_rate < 0 || n.shiny_rate > 100) return err('Taux de brillante entre 0 et 100');
  if (!Number.isInteger(n.pity_epique) || n.pity_epique < 0) return err('Garantie épique : entier positif ou nul');
  if (!['tous', 'serie', 'manquantes'].includes(n.pool)) return err('Contenu inconnu');
  if (n.weekly_limit !== null && (!Number.isInteger(n.weekly_limit) || n.weekly_limit < 1)) return err('Limite par semaine : vide ou au moins 1');
  if (!BOOSTER_STYLES.includes(n.style)) return err(`Style inconnu : « ${n.style} »`);
  if (n.description != null && String(n.description).length > 300) return err('Description : 300 caractères au maximum');
  if (!Array.isArray(n.excluded_rarities) || !n.excluded_rarities.every((k) => BOOSTER_RARITIES.includes(k))) return err('Rareté exclue inconnue');
  if (n.excluded_rarities.length >= 7) return err('Toutes les raretés ne peuvent pas être exclues');
  if (n.pity_epique > 0 && ['epique', 'legendaire', 'mythique', 'identite'].every((k) => n.excluded_rarities.includes(k))) return err('La garantie Épique demande au moins une rareté Épique ou mieux non exclue (mets-la à 0)');
  const unknown = (n.excluded_sets || []).find((c) => !DB.hg_card_sets.some((x) => x.code === c));
  if (!Array.isArray(n.excluded_sets) || unknown) return err(`Série inconnue : ${unknown}`);
  Object.assign(n, { name, rates: { ...r }, free_daily: !!n.free_daily, active: n.active !== false, excluded_rarities: [...n.excluded_rarities], excluded_sets: [...n.excluded_sets],
    updated_at: new Date().toISOString(), updated_by: uidNow() });
  if (row) Object.assign(row, n); else { row = { id: p.id, ...n }; DB.hg_booster_types.push(row); }
  const removed = [];
  if (row.free_daily) for (const t of DB.hg_booster_types) if (t.id !== row.id && t.free_daily) { t.free_daily = false; removed.push(t.id); }
  return { data: { type: JSON.parse(JSON.stringify(row)), created, free_daily_removed_from: removed }, error: null };
}

// Idées C1 à C6 (migration 080) : lignes ajoutées par le scénario, table par table (S.c080 = { hg_cards: [...], ... }).
if (S.c080) for (const [t, rows] of Object.entries(S.c080)) DB[t] = [...(DB[t] || []), ...rows];

/* ---------- Client exporté ---------- */
/** Point d'entrée : crée le faux client que les pages utilisent à la place de supabase-js. */
/* ---------- Idées A1 à A4 (migration 092) : import du quiz, planning, maîtres du jeu, membres à relancer ----------
   Scénario : S.remind (réponse de hg_admin_to_remind), S.games / S.gameMasters (jeux), S.botScheduled (annonces programmées),
   S.importError (erreur de l'import réel). Les droits suivent hg_has_perm (admin, ou Staff avec la permission). */
const hasP = (k) => { const m = myPermsNow(); return m.is_admin || m.perms.includes(k); };
const xErr = (message) => ({ data: null, error: { message } });
DB.hg_bot_scheduled = S.botScheduled || [];
DB.hg_games = S.games || [{ slug: 'ck3', name: 'Campagne Serge (CK3)', channel_id: '333333333333333333', active: true }, { slug: 'minecraft', name: 'Minecraft', channel_id: null, active: true }];
DB.hg_game_masters = S.gameMasters || [];
DB.hg_relances = [];
/** Texte normalisé (doublons du quiz), comme hg_quiz_norm. */
const qnorm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function xa1Rpc(fn, args = {}) {
  if (fn === 'hg_touch') return { data: null, error: null };
  if (fn === 'hg_quiz_import') {
    if (!hasP('quiz')) return denied;
    const rows = args.p_rows || [];
    if (rows.length > 300) return xErr('300 lignes au plus par fichier');
    const seen = new Map(); const out = [];
    for (const r of rows) {
      let status = 'pret', error = null, warning = null, similar_to = null;
      if (r.error) { status = 'erreur'; error = r.error; }
      else if (!['facile', 'moyen', 'difficile', 'expert'].includes(r.difficulty || 'moyen')) { status = 'erreur'; error = 'difficulté inconnue'; }
      else {
        const n = qnorm(r.prompt);
        const ex = DB.hg_quiz_questions.find((q) => qnorm(q.prompt) === n);
        if (ex) { status = 'doublon'; similar_to = ex.prompt; } else if (seen.has(n)) { status = 'doublon'; similar_to = `ligne ${seen.get(n)} du fichier`; }
        seen.set(n, r.line);
        if (r.reward && Number(r.reward) > 5000) warning = 'récompense hors limites (0 à 5000) : 100 Paillettes appliquées';
      }
      out.push({ line: r.line, status, error, warning, similar_to, similarity: similar_to ? 100 : 0 });
    }
    if (args.p_dry_run === false) {
      if (S.importError) return xErr(S.importError);
      const bad = out.find((x) => x.status === 'erreur');
      if (bad) return xErr(`Import annulé, rien n’est enregistré : ligne ${bad.line} : ${bad.error}`);
      for (const r of rows) quizSave({ p_id: null, p_question: { ...r, reward: Number(r.reward) <= 5000 && r.reward !== '' ? Number(r.reward || 100) : 100 }, p_key: r.key });
      window.__LOG.push(['quiz_import', rows.length]);
    }
    return { data: { dry_run: args.p_dry_run !== false, created: args.p_dry_run === false ? rows.length : 0, rows: out,
      ready: out.filter((x) => x.status === 'pret').length, duplicates: out.filter((x) => x.status === 'doublon').length, errors: out.filter((x) => x.status === 'erreur').length }, error: null };
  }
  if (fn === 'hg_planning_items') {
    const from = new Date(args.p_from), to = new Date(args.p_to);
    if (to - from > 92 * 864e5) return xErr('Période trop longue (92 jours au plus)');
    const inR = (d) => d && new Date(d) >= from && new Date(d) < to;
    const out = [];
    if (hasP('quiz')) for (const q of DB.hg_quiz_questions) if (inR(q.starts_at)) out.push({ kind: 'quiz', id: q.id, title: q.prompt, start: q.starts_at, end: q.ends_at, status: 'active', route: 'jeux/questions' });
    if (hasP('themes')) for (const e of DB.hg_dyn_events) if (new Date(e.starts_at) < to && new Date(e.ends_at) >= from) out.push({ kind: 'evenement', id: e.id, title: e.name, start: e.starts_at, end: e.ends_at, status: 'active', route: 'event/evenements' });
    if (hasP('evenements')) for (const e of DB.hg_events) if (inR(e.starts_at)) out.push({ kind: 'sortie', id: e.id, title: e.title, start: e.starts_at, end: null, status: 'prevue', detail: e.location, route: 'irl/sorties' });
    if (hasP('cartes')) for (const d of S.planningDrops || []) if (inR(d.start)) out.push({ kind: 'carte_drop', route: 'cartes/drops', status: 'normale', ...d });
    if (hasP('bot')) for (const b of DB.hg_bot_scheduled) if (inR(b.send_at)) out.push({ kind: 'bot', id: b.id, title: b.title || b.body.slice(0, 80), start: b.send_at, end: null,
      status: b.cancelled_at ? 'annulee' : b.sent_at ? 'envoyee' : 'programmee', by: 'Ethan', detail: b.body, channels: b.channels, game: b.game_slug ? 'Campagne Serge (CK3)' : null, route: 'pilotage/bot' });
    return { data: out, error: null };
  }
  // Programmation des jeux (migrations 183 et 184). S.programme : { <cle>: [{ n, statut, titre, par, ... }] } (n : décalage en
  // jours depuis aujourd'hui ; champs du contenu : joueurs, vus, definition…) remplace les jours par défaut ; S.programmeReserves :
  // { <cle>: [reserve, reserve_totale] } ; S.programmeCourants.geo : décalage du jour courant de GeoGuessr (-1 : avant 6 h). Avec
  // S.programme, les listes de choix et les écritures sont simulées avec les règles des RPC (sans lui, d'autres fixtures gardent
  // la main). window.__PG_REFUS : { <rpc>: message } force un refus.
  if (['hg_jeux_programme', 'hg_jeux_programme_jour'].includes(fn) || (S.programme && ['hg_sutom_admin', 'hg_heardle_admin', 'hg_framed_admin', 'hg_geo_admin_list', 'hg_geo_reserve',
    'hg_sutom_program', 'hg_heardle_round_save', 'hg_framed_round_save', 'hg_geo_round_save', 'hg_geo_programme', 'hg_geo_active', 'hg_quiz_daily_plan'].includes(fn))) {
    const ko = (m) => xErr(m);
    if (window.__PG_REFUS?.[fn]) return ko(window.__PG_REFUS[fn]);
    const zday = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(Date.now() + n * 864e5);
    const today = zday(0);
    const geoAuj = zday(S.programmeCourants?.geo ?? 0);
    if (!window.__PG) {
      const std = { sutom: [{ n: 0, statut: 'auto', titre: 'PATATE' }, { n: 1, statut: 'programme', titre: 'FROMAGE', par: 'Ethan' }, { n: 2, statut: 'programme', titre: 'RACLETTE', par: 'Ethan' }],
        heardle: Array.from({ length: 20 }, (_, n) => ({ n, statut: 'programme', titre: `Artiste — Titre ${n}`, par: 'Bruno' })), framed: [], geo: [], quiz: [] };
      const G = { j: {}, n: 0 };
      for (const c of ['sutom', 'heardle', 'framed', 'geo', 'quiz']) {
        G.j[c] = new Map((S.programme?.[c] ?? std[c]).map((x) => [zday(x.n), { joueurs: 0, ...x, id: `r-${++G.n}`, active: x.statut !== 'annule' }]));
      }
      G.tracks = [{ id: 't1', artist: 'Stromae', title: 'Papaoutai', youtube_id: 'oiKj0Z_Xnjc', start_s: 12, status: 'valide', day: null },
        { id: 't2', artist: 'Refusé', title: 'Non validé', youtube_id: 'oiKj0Z_Xnjd', start_s: 0, status: 'propose', day: null }];
      G.films = [{ id: 'f1', title: 'Amélie', active: true, frames: ['framed/f1/1.webp', 'framed/f1/2.webp', 'framed/f1/3.webp'], day: null },
        { id: 'f2', title: 'Deux images', active: true, frames: ['framed/f2/1.webp', 'framed/f2/2.webp'], day: null }];
      G.geo = [{ id: 'g1', day: null, label: 'Gare de Lausanne', event_title: 'Sortie vaudoise', image_path: '11111111-1111-4111-8111-111111111111/geo/a.webp', lat: 46.5, lon: 6.6, photo_id: null, event_id: null, active: true, guesses: 0 },
        { id: 'g2', day: null, label: 'Lac de Joux', event_title: null, image_path: '11111111-1111-4111-8111-111111111111/geo/c.webp', lat: 46.6, lon: 6.2, photo_id: null, event_id: null, active: true, guesses: 0 },
        { id: 'g3', day: null, label: 'Photo désactivée', event_title: null, image_path: '11111111-1111-4111-8111-111111111111/geo/d.webp', lat: 46.7, lon: 6.3, photo_id: null, event_id: null, active: false, guesses: 0 }];
      G.bank = [{ word: 'FONDUE', definition: 'Le plat du gang', active: true }, { word: 'CHALET', definition: null, active: false }];
      if (S.programme) DB.hg_quiz_questions.push({ id: 'q1', prompt: 'Qui a gagné la raclette ?', difficulty: 'facile', qtype: 'choix_unique', active: true, secret: false, created_at: new Date().toISOString() },
        { id: 'q2', prompt: 'Question secrète', difficulty: 'facile', qtype: 'choix_unique', active: true, secret: true, created_at: new Date().toISOString() });
      window.__PG = G;
    }
    const G = window.__PG;
    const lit = (c, k) => { const m = G.j[c]; return m.get(k); };
    if (fn === 'hg_jeux_programme') {
      if (!hasP('souvenirs') && !hasP('quiz')) return denied;
      if (args.p_days < 1 || args.p_days > 92) return ko('Période trop longue (92 jours au plus)');
      const from = args.p_from || today;
      const to = new Date(Date.parse(from) + (args.p_days - 1) * 864e5).toISOString().slice(0, 10);
      const jours = (c) => [...G.j[c]].filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b)).map(([day, x]) => ({ day, statut: x.statut, titre: x.titre, par: c === 'geo' ? undefined : x.par ?? null }));
      const res = (c, d) => { const [reserve, reserve_totale] = S.programmeReserves?.[c] ?? d; return { reserve, reserve_totale }; };
      const date = (cle, titre, route, filet, d, plus) => ({ cle, titre, mode: 'date', route, filet, ...plus, jours: jours(cle), ...res(cle, d) });
      const reserve = (cle, titre, d) => ({ cle, titre, mode: 'reserve', route: null, jours: [], ...res(cle, d) });
      const genere = (cle, titre) => ({ cle, titre, mode: 'genere', route: null, jours: [], reserve: null, reserve_totale: null });
      const jeux = [];
      if (hasP('souvenirs')) jeux.push(date('sutom', 'Sutom du gang', 'fete/sutom', true, [120, 200]), date('heardle', 'Heardle', 'fete/framed-heardle/heardle', false, [12, 40]),
        date('framed', 'Framed', 'fete/framed-heardle/framed', true, [8, 30]), date('geo', 'GeoGuessr', 'fete/geoguessr', true, [15, 22], { jour_courant: geoAuj }));
      if (hasP('quiz')) jeux.push(date('quiz', 'Question du jour', 'fete/questions/jour', true, [60, 90]));
      if (hasP('souvenirs')) jeux.push(reserve('carte', 'Carte mystère', [300, 320]), reserve('jv', 'Jeu vidéo du jour', [90, 100]), reserve('pochette', 'Pochette du jour', [10, 80]),
        reserve('replique', 'Réplique du jour', [90, 100]), reserve('pays', 'Pays du jour', [190, 197]), reserve('plat', 'Plat du jour', [50, 60]), reserve('connexions', 'Connexions', [30, 30]),
        reserve('motscroises', 'Mots croisés', [30, 30]), reserve('motmele', 'Mot mêlé', [30, 30]), reserve('anagramme', 'Anagramme', [500, 500]),
        genere('nerdle', 'Nerdle du gang'), genere('code_jour', 'Code du jour'), genere('sudoku', 'Sudoku du jour'));
      return { data: { today, jeux }, error: null };
    }
    if (fn === 'hg_jeux_programme_jour') {
      if (!hasP('souvenirs') && !hasP('quiz')) return denied;
      const k = args.p_day, jeux = {}, courants = {};
      if (hasP('souvenirs')) {
        Object.assign(courants, { sutom: today, heardle: today, framed: today, geo: geoAuj });
        const s = lit('sutom', k), h = lit('heardle', k), f = lit('framed', k), g = lit('geo', k);
        jeux.sutom = s ? { word: s.titre, definition: s.definition ?? null, par: s.par ?? null, joueurs: s.joueurs } : null;
        jeux.heardle = h ? { track_id: h.id, artist: h.titre.split(' — ')[0], title: h.titre.split(' — ')[1], youtube_id: 'oiKj0Z_Xnjc', start_s: 30, cancelled: h.statut === 'annule', par: h.par ?? null, joueurs: h.joueurs } : null;
        jeux.framed = f ? { film_id: f.id, title: f.titre, year: 2001, frames: f.frames ?? ['framed/x/1.webp', 'framed/x/2.webp', 'framed/x/3.webp'], par: f.par ?? null, joueurs: f.joueurs } : null;
        jeux.geo = g ? { id: g.id, day: k, label: g.titre, image_path: g.image_path ?? '11111111-1111-4111-8111-111111111111/geo/b.webp', lat: 46, lon: 6, photo_id: null, event_id: null, event_title: g.event_title ?? null, active: g.active, auteur: g.auteur ?? null, tentatives: g.joueurs } : null;
      }
      if (hasP('quiz')) {
        courants.quiz = today;
        const q = lit('quiz', k);
        jeux.quiz = q ? { question_id: q.id, prompt: q.titre, qtype: 'choix_unique', difficulty: 'facile', category: null, options: [{ id: 'a', text: 'Bruno' }, { id: 'b', text: 'Ethan' }], bonnes: ['b'], solution: 'Ethan', explanation: null, par: q.par ?? null, vus: q.vus ?? 0, reponses: 0 } : null;
      }
      return { data: { day: k, courants, jeux }, error: null };
    }
    const souv = 'Réservé au Staff « souvenirs »';
    if (fn === 'hg_sutom_admin') return hasP('souvenirs') ? { data: { today, dict: 1, bank: G.bank, planned: [] }, error: null } : ko(souv);
    if (fn === 'hg_heardle_admin') return hasP('souvenirs') ? { data: { today, tracks: G.tracks, rounds: [] }, error: null } : ko(souv);
    if (fn === 'hg_framed_admin') return hasP('souvenirs') ? { data: { today, films: G.films, rounds: [] }, error: null } : ko(souv);
    if (fn === 'hg_geo_admin_list') return hasP('souvenirs') ? { data: G.geo, error: null } : ko(souv);
    if (fn === 'hg_geo_reserve') return hasP('souvenirs') ? { data: G.geo.filter((r) => r.active && !r.guesses).map(({ id, label, event_title }) => ({ id, label, event_title })), error: null } : ko(souv);
    if (fn === 'hg_quiz_daily_plan') {
      if (!hasP('quiz')) return denied;
      if (args.p_day < today) return ko('Choisis un jour entre aujourd\'hui et dans un an');
      const x = G.j.quiz.get(args.p_day);
      if (args.p_day === today && x?.vus) return ko('La question d\'aujourd\'hui a déjà été vue : programme un autre jour');
      if (!args.p_question) { G.j.quiz.delete(args.p_day); return { data: null, error: null }; }
      const q = DB.hg_quiz_questions.find((y) => y.id === args.p_question);
      G.j.quiz.set(args.p_day, { id: q.id, statut: 'programme', titre: q.prompt, par: 'Ethan', vus: 0, joueurs: 0 });
      return { data: null, error: null };
    }
    if (!hasP('souvenirs')) return ko(souv);
    if (fn === 'hg_sutom_program') {
      if (!args.p_day || args.p_day <= today) return ko('Choisis un jour entre demain et dans un an');
      if (!args.p_word) { G.j.sutom.delete(args.p_day); return { data: null, error: null }; }
      const w = String(args.p_word).trim().toUpperCase();
      if (!/^[A-Z]{5,9}$/.test(w)) return ko('Un mot de 5 à 9 lettres, sans espace ni tiret');
      G.j.sutom.set(args.p_day, { id: `r-${++G.n}`, statut: 'programme', titre: w, par: 'Ethan', definition: args.p_definition ?? G.bank.find((b) => b.word === w)?.definition ?? null, joueurs: 0 });
      return { data: null, error: null };
    }
    if (fn === 'hg_heardle_round_save') {
      if (!args.p_day || args.p_day < today) return ko('Choisis aujourd\'hui ou un jour à venir');
      const x = G.j.heardle.get(args.p_day);
      if (args.p_cancel) {
        if (!x) return ko('Pas de manche ce jour-là');
        x.statut = 'annule';
        return { data: null, error: null };
      }
      if (x?.joueurs) return ko('Des membres ont déjà joué cette manche : elle ne change plus');
      if (x?.track) x.track.day = null;
      if (!args.p_track) { G.j.heardle.delete(args.p_day); return { data: null, error: null }; }
      const t = G.tracks.find((y) => y.id === args.p_track);
      if (!t || t.status !== 'valide') return ko('Choisis un morceau validé');
      if (t.day && t.day !== args.p_day) return ko('Ce morceau a déjà sa manche');
      t.day = args.p_day;
      G.j.heardle.set(args.p_day, { id: t.id, track: t, statut: 'programme', titre: `${t.artist} — ${t.title}`, par: 'Ethan', joueurs: 0 });
      return { data: null, error: null };
    }
    if (fn === 'hg_framed_round_save') {
      if (!args.p_day || args.p_day < today) return ko('Choisis aujourd\'hui ou un jour à venir');
      const x = G.j.framed.get(args.p_day);
      if (x?.joueurs) return ko('Des membres ont déjà joué cette manche : elle ne change plus');
      if (x?.film) x.film.day = null;
      if (!args.p_film) { G.j.framed.delete(args.p_day); return { data: null, error: null }; }
      const f = G.films.find((y) => y.id === args.p_film);
      if (f.frames.length < 3) return ko('Ce film a besoin d\'au moins 3 images');
      if (f.day && f.day !== args.p_day) return ko('Ce film a déjà sa manche (un film ne revient pas)');
      f.day = args.p_day;
      G.j.framed.set(args.p_day, { id: f.id, film: f, frames: f.frames, statut: 'programme', titre: f.title, par: 'Ethan', joueurs: 0 });
      return { data: null, error: null };
    }
    // hg_geo_programme : mêmes refus, dans le même ordre, que la migration 184. Tout ou rien, et seul le jour change.
    if (fn === 'hg_geo_programme') {
      const { p_day: d, p_round: nv, p_avant: av } = args;
      if (!d) return ko('Choisis un jour');
      if (d < geoAuj) return ko('Choisis aujourd\'hui ou un jour à venir');
      if (!nv && !av) return ko('Rien à retirer ce jour-là');
      if (nv === av) return ko('Cette manche est déjà sur ce jour');
      const a = G.j.geo.get(d);
      if ((a?.id ?? null) !== (av ?? null)) return ko('Ce jour a changé entre-temps : regarde sa manche avant de recommencer');
      if (a?.joueurs) return ko('Cette manche a déjà été jouée : elle ne change plus de jour');
      const r = nv ? G.geo.find((y) => y.id === nv) : null;
      if (nv && !r && ![...G.j.geo.values()].some((y) => y.id === nv)) return ko('Manche introuvable');
      if (nv && (!r || !r.active)) return ko('Cette photo n\'est plus en réserve');
      if (r?.guesses) return ko('Cette manche a déjà été jouée : elle ne change plus de jour');
      if (a) { G.j.geo.delete(d); G.geo.push({ id: a.id, day: null, label: a.titre, event_title: a.event_title ?? null, image_path: a.image_path, lat: 46, lon: 6, photo_id: null, event_id: null, active: a.active, guesses: 0 }); }
      if (r) {
        G.geo = G.geo.filter((y) => y !== r);
        G.j.geo.set(d, { id: r.id, statut: 'programme', titre: r.label, auteur: 'Bruno', image_path: r.image_path, event_title: r.event_title, active: true, joueurs: 0 });
      }
      return { data: nv ?? null, error: null };
    }
    // hg_geo_active : mêmes refus que la migration 184 ; seule l'activation change (et le statut qui en découle dans le calendrier).
    if (fn === 'hg_geo_active') {
      if (!args.p_round || typeof args.p_active !== 'boolean') return ko('Données manquantes');
      const e = [...G.j.geo].find(([, y]) => y.id === args.p_round);
      const r = e?.[1] ?? G.geo.find((y) => y.id === args.p_round);
      if (!r) return ko('Manche introuvable');
      if (e && e[0] < geoAuj && !r.joueurs) return ko('Choisis aujourd\'hui ou un jour à venir');
      r.active = args.p_active;
      if (e) r.statut = args.p_active ? 'programme' : 'annule';
      return { data: args.p_round, error: null };
    }
    // hg_geo_round_save : une manche du jour (G.j.geo) ou de la réserve (G.geo). Rien n'y remet active à vrai sans qu'on le demande.
    const p = args.p, res = G.geo.find((r) => r.id === args.p_id);
    const jour = [...G.j.geo].find(([, x]) => x.id === args.p_id);
    if (p.day && p.day < geoAuj) return ko('Choisis aujourd\'hui ou un jour à venir');
    if (p.day && G.j.geo.has(p.day) && jour?.[0] !== p.day) return ko('Une manche est déjà programmée ce jour-là');
    if (jour) {
      const [d, x] = jour;
      if (x.joueurs && p.day !== d) return ko('Cette manche a déjà été jouée : seuls le nom du lieu et l\'activation peuvent changer');
      x.active = p.active; x.statut = p.active ? 'programme' : 'annule';
      if (p.day !== d) { G.j.geo.delete(d); if (p.day) G.j.geo.set(p.day, x); else G.geo.push({ id: x.id, day: null, label: x.titre, event_title: null, image_path: p.image_path, lat: p.lat, lon: p.lon, photo_id: null, event_id: null, active: p.active, guesses: 0 }); }
    } else if (res) {
      G.geo = G.geo.filter((r) => r !== res);
      G.j.geo.set(p.day, { id: res.id, statut: 'programme', titre: res.label, auteur: 'Bruno', image_path: res.image_path, event_title: res.event_title, active: true, joueurs: 0 });
    }
    return { data: args.p_id, error: null };
  }
  if (fn === 'hg_bot_schedule_save') {
    if (!hasP('bot')) return denied;
    if (!args.p_body || !args.p_channels?.length) return xErr('Choisis entre 1 et 5 salons');
    const row = args.p_id ? DB.hg_bot_scheduled.find((x) => x.id === args.p_id) : null;
    if (row) Object.assign(row, { title: args.p_title, body: args.p_body, channels: args.p_channels, send_at: args.p_send_at });
    else DB.hg_bot_scheduled.push({ id: uid(), title: args.p_title, body: args.p_body, channels: args.p_channels, send_at: args.p_send_at, sent_at: null, cancelled_at: null, game_slug: null, created_at: new Date().toISOString() });
    window.__LOG.push(['bot_schedule', args.p_send_at]);
    return { data: row?.id || DB.hg_bot_scheduled.at(-1).id, error: null };
  }
  if (fn === 'hg_bot_schedule_cancel') {
    const row = DB.hg_bot_scheduled.find((x) => x.id === args.p_id);
    if (!row) return xErr('Annonce introuvable');
    if (!hasP('bot') && !(row.game_slug && hasP('mj'))) return denied;
    row.cancelled_at = new Date().toISOString();
    return { data: null, error: null };
  }
  if (fn === 'hg_mj_overview') {
    const m = myPermsNow(); const admin = m.is_admin;
    if (!admin && !m.perms.includes('mj')) return denied;
    const mine = DB.hg_games.filter((g) => admin || DB.hg_game_masters.some((x) => x.game_slug === g.slug && x.user_id === uidNow()));
    const pseudo = (id) => DB.hg_profiles.find((p) => p.id === id)?.pseudo || '?';
    return { data: { is_admin: admin, quota_max: 3,
      candidates: admin ? DB.hg_staff.filter((s) => s.active && s.perms.includes('mj')).map((s) => ({ user_id: s.user_id, pseudo: pseudo(s.user_id) })) : [],
      games: mine.map((g) => ({ ...g, masters: admin ? DB.hg_game_masters.filter((x) => x.game_slug === g.slug).map((x) => ({ user_id: x.user_id, pseudo: pseudo(x.user_id) })) : null,
        quota: { used: DB.hg_bot_scheduled.filter((b) => b.game_slug === g.slug && !b.cancelled_at).length, max: 3 },
        upcoming: DB.hg_bot_scheduled.filter((b) => b.game_slug === g.slug).slice().reverse() })) }, error: null };
  }
  if (fn === 'hg_mj_announce') {
    const g = DB.hg_games.find((x) => x.slug === args.p_game);
    const mine = isAdminNow() || (hasP('mj') && DB.hg_game_masters.some((x) => x.game_slug === args.p_game && x.user_id === uidNow()));
    if (!g || !mine) return xErr('Réservé au maître du jeu de ce jeu');
    if (DB.hg_bot_scheduled.filter((b) => b.game_slug === g.slug && !b.cancelled_at).length >= 3) return xErr('Déjà 3 annonces cette semaine pour ce jeu');
    DB.hg_bot_scheduled.push({ id: uid(), title: 'Session ' + g.name, body: args.p_body, channels: [g.channel_id], send_at: args.p_send_at || new Date().toISOString(), sent_at: null, cancelled_at: null, game_slug: g.slug });
    window.__LOG.push(['mj_announce', g.slug, args.p_body]);
    return { data: 'ok', error: null };
  }
  if (fn === 'hg_game_save') {
    if (!isAdminNow()) return denied;
    const g = DB.hg_games.find((x) => x.slug === args.p_slug);
    if (g) Object.assign(g, { name: args.p_name, channel_id: args.p_channel, active: args.p_active });
    else DB.hg_games.push({ slug: args.p_slug, name: args.p_name, channel_id: args.p_channel, active: args.p_active });
    return { data: args.p_slug, error: null };
  }
  if (fn === 'hg_game_master_set') {
    if (!isAdminNow()) return denied;
    DB.hg_game_masters = DB.hg_game_masters.filter((x) => !(x.game_slug === args.p_game && x.user_id === args.p_user));
    if (args.p_on) DB.hg_game_masters.push({ game_slug: args.p_game, user_id: args.p_user });
    return { data: null, error: null };
  }
  if (fn === 'hg_admin_to_remind') {
    if (!hasP('membres')) return denied;
    const R = S.remind || { todo: [], done: [], paused: [] };
    const gone = (id) => DB.hg_relances.find((r) => r.user_id === id);
    return { data: { days: args.p_days, todo: R.todo.filter((m) => !gone(m.id)),
      done: [...R.done, ...R.todo.filter((m) => gone(m.id)?.canal === 'copie' || gone(m.id)?.canal === 'mp').map((m) => ({ ...m, at: new Date().toISOString(), by: 'Ethan', canal: gone(m.id).canal, back: false }))],
      paused: [...R.paused, ...R.todo.filter((m) => gone(m.id)?.canal === 'pause')] }, error: null };
  }
  if (fn === 'hg_relance_mark' || fn === 'hg_relance_pause') {
    if (!hasP('membres')) return denied;
    DB.hg_relances.push({ user_id: args.p_user, canal: fn === 'hg_relance_pause' ? (args.p_pause ? 'pause' : 'reprise') : args.p_canal });
    window.__LOG.push([fn, args.p_user, args.p_canal ?? args.p_pause]);
    return { data: null, error: null };
  }
  if (fn === 'hg_relance_settings') return hasP('membres') ? { data: DB.hg_settings.find((r) => r.key === 'relance')?.value || {}, error: null } : denied;
  if (fn === 'hg_relance_settings_save') {
    if (!hasP('membres')) return denied;
    DB.hg_settings = DB.hg_settings.filter((r) => r.key !== 'relance');
    DB.hg_settings.push({ key: 'relance', value: { modeles: args.p_modeles } });
    return { data: null, error: null };
  }
  return null;
}

/* ---------- Rôles et accès par rôle (migration 103) : hg_role_save, hg_role_remove, hg_member_role_set, hg_member_access, hg_member_access_reset ---------- */
/** RPC des rôles ; undefined pour les autres fonctions. Les écritures sont notées dans window.__LOG. */
function rolesRpc(fn, args = {}) {
  const pageSlugs = () => DB.hg_pages.map((p) => p.slug);
  if (fn === 'hg_role_save') {
    const p = args.p || {};
    const id = String(p.id ?? '').trim().toLowerCase();
    if (!/^[a-z0-9-]{2,30}$/.test(id)) return xErr('Identifiant de rôle invalide');
    const old = DB.hg_roles.find((r) => r.id === id);
    const row = { id, label: String(p.label ?? '').trim() || id, description: p.description ?? '',
      color: /^#[0-9a-f]{6}$/i.test(p.color ?? '') ? p.color : '#7E93C9',
      pages: [...new Set((p.pages ?? []).filter((x) => pageSlugs().includes(x)))], sort: Number(p.sort) || 0,
      created_at: old?.created_at ?? iso(0), updated_at: iso(0) };
    if (old) Object.assign(old, row); else DB.hg_roles.push(row);
    window.__LOG.push(['role_save', id, JSON.parse(JSON.stringify(p))]);
    return { data: row, error: null };
  }
  if (fn === 'hg_role_remove') {
    const id = args.p_id;
    DB.hg_roles = DB.hg_roles.filter((r) => r.id !== id);
    DB.hg_member_roles = DB.hg_member_roles.filter((l) => l.role_id !== id);
    window.__LOG.push(['role_remove', id]);
    return { data: null, error: null };
  }
  if (fn === 'hg_member_role_set') {
    const u = args.p_user, r = args.p_role, on = !!args.p_on;
    if (!DB.hg_roles.some((x) => x.id === r)) return xErr('Rôle inconnu');
    const i = DB.hg_member_roles.findIndex((l) => l.user_id === u && l.role_id === r);
    if (on && i < 0) DB.hg_member_roles.push({ user_id: u, role_id: r, added_by: uidNow(), added_at: iso(0) });
    if (!on && i >= 0) DB.hg_member_roles.splice(i, 1);
    window.__LOG.push(['role_member', u, r, on]);
    return { data: null, error: null };
  }
  if (fn === 'hg_member_access_reset') {
    const u = args.p_user, slug = args.p_slug;
    DB.hg_page_access = DB.hg_page_access.filter((a) => !(a.user_id === u && a.page_slug === slug));
    window.__LOG.push(['acces_reset', u, slug]);
    return { data: null, error: null };
  }
  if (fn === 'hg_member_access') {
    // Même logique que hg_page_ok / hg_member_access (migration 103) : admin, réglage à la main, rôle, ouverte à tous, aucun.
    const u = args.p_user;
    const isAdm = !!DB.hg_profiles.find((p) => p.id === u)?.is_admin;
    const rowsOf = (slug) => DB.hg_page_access.filter((a) => a.page_slug === slug && a.user_id === u);
    const mine = DB.hg_member_roles.filter((l) => l.user_id === u).map((l) => DB.hg_roles.find((r) => r.id === l.role_id)).filter(Boolean);
    const granting = (slug) => mine.filter((r) => (r.pages ?? []).includes(slug)).sort((a, b) => a.sort - b.sort);
    const ok = (p) => {
      if (isAdm) return true;
      const rows = rowsOf(p.slug);
      if (p.mode === 'membres') return !rows.some((a) => a.allowed === false);
      if (p.mode === 'liste') return rows.some((a) => a.allowed === true) || (rows.length === 0 && granting(p.slug).length > 0);
      return false;
    };
    const source = (p) => (isAdm ? 'admin' : rowsOf(p.slug).length ? 'main' : (p.mode === 'liste' && granting(p.slug).length) ? 'role' : p.mode === 'membres' ? 'tous' : 'aucun');
    const data = DB.hg_pages.slice().sort((a, b) => a.sort - b.sort).map((p) => ({
      slug: p.slug, label: p.label, mode: p.mode, allowed: ok(p), source: source(p), roles: granting(p.slug).map((r) => r.label) }));
    return { data, error: null };
  }
  return undefined;
}

export function createClient(_url, _key, opts = {}) {
  // Options passées par core/supabase.js (detectSessionInUrl, flowType…), lisibles par les tests.
  window.__SB_OPTS = JSON.parse(JSON.stringify({ auth: { ...(opts.auth || {}), lock: undefined } }));
  /** Utilisateur de la session simulée (e-mail : S.email, sinon une adresse de test). */
  const who = () => ({ id: S.uid || ME, email: S.email || 'moi@test.ch' });
  return {
    auth: {
      // Ajout par rapport au faux de qa/ : connexion simulée. Un visiteur (S.guest) devient
      // connecté après signInWithPassword réussi, sauf si S.badPassword.
      // Session lue dans l'état simulé.
      getSession: async () => ({ data: { session: signed() ? { user: who(), access_token: 'jeton-factice' } : null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getUser: async () => ({ data: { user: signed() ? who() : null } }),
      signInWithPassword: async ({ email, password } = {}) => {
        window.__LOG.push(['auth', 'signInWithPassword', email]);
        if (S.badPassword || !password || (S.password && password !== S.password)) return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
        setSigned(true);
        return { data: { session: { user: { id: S.uid || ME } }, user: { id: S.uid || ME } }, error: null };
      },
      signOut: async () => { setSigned(false); window.__LOG.push(['auth', 'signOut']); return {}; },
      // Changement de mot de passe (journalisé, sans le mot de passe).
      updateUser: async (attrs = {}) => { window.__LOG.push(['auth', 'updateUser', Object.keys(attrs)]); return { data: { user: who() }, error: null }; },
    },
    // Commence une requête sur la table t.
    // Scénario offline (Q4) : toute requête tentée est notée (le test vérifie qu'il n'y en a aucune).
    from: (t) => { if (S.offline) window.__LOG.push(['offline-req', 'from', t]); return new Q(t); },
    /** Simule les fonctions SQL (RPC) : chaque nom a sa réponse. Sans session, seules les fonctions de ANON_OK répondent ; une fonction inconnue renvoie null sans erreur. */
    rpc: async (fn, args) => {
      window.__LOG.push(['rpc', fn, args]);
      if (S.offline) window.__LOG.push(['offline-req', 'rpc', fn]);
      if (!signed() && !ANON_OK.has(fn)) { // ce que fait PostgREST sans session : 401, « permission denied »
        window.__LOG.push(['rpc-401', fn]);
        return { data: null, error: { message: 'permission denied for function ' + fn, code: '42501' } };
      }
      // Extension par test : RPC simulées en plus (renvoie undefined pour laisser la main aux RPC ci-dessous).
      if (typeof window.__FAKE_RPC === 'function') { const r = await window.__FAKE_RPC(fn, args); if (r !== undefined) return r; }
      if (EXTRA?.rpc) { const r = await EXTRA.rpc(fn, args); if (r) return r; }
      // Notifications par catégorie (idée Q6, migration 095) : liste blanche, heures 0 à 23, une ligne par membre.
      if (fn === 'hg_set_notif_prefs') {
        const uid = S.uid || ME;
        const ok = /^(messages|sorties|echanges|souhaits|santa|anniversaires|quiz)\.(push|discord)$/;
        const pr = args?.p_prefs || {};
        if (Object.entries(pr).some(([k, v]) => !ok.test(k) || typeof v !== 'boolean')) return { data: null, error: { message: 'Catégorie inconnue' } };
        const qs = args?.p_quiet_start ?? null, qe = args?.p_quiet_end ?? null;
        if ((qs == null) !== (qe == null) || (qs != null && (qs < 0 || qs > 23 || qe < 0 || qe > 23 || qs === qe))) return { data: null, error: { message: 'Heures calmes invalides' } };
        const tab = DB.hg_notif_prefs || (DB.hg_notif_prefs = []);
        const row = { user_id: uid, prefs: { ...pr }, quiet_start: qs, quiet_end: qe, updated_at: new Date().toISOString() };
        const i = tab.findIndex((r) => r.user_id === uid);
        if (i >= 0) tab[i] = row; else tab.push(row);
        const prof = DB.hg_profiles.find((x) => x.id === uid);
        if (prof && typeof pr['sorties.discord'] === 'boolean') prof.remind_irl = pr['sorties.discord'];
        if (prof && typeof pr['souhaits.discord'] === 'boolean') prof.notify_card_wish = pr['souhaits.discord'];
        return { data: row, error: null };
      }
      // Disposition du plateau (migration 111) : une valeur par membre, gardée dans localStorage (survit au rechargement).
      // Même nettoyage que la fonction SQL : sept lieux seulement, cases dans le cadre (x 0..11, w 2..12, x+w<=12, y 0..40, h 1..6).
      // Scénarios : plateauGetFail, plateauFail (refus à l'écriture).
      if (fn === 'hg_admin_plateau_get' || fn === 'hg_admin_plateau_set') {
        if (fn === 'hg_admin_plateau_get') {
          if (S.plateauGetFail) return { data: null, error: { message: 'Disposition indisponible' } };
          let v = null;
          try { v = JSON.parse(localStorage.getItem('hg_fake_plateau') || 'null'); } catch (e) { v = null; }
          return { data: v, error: null };
        }
        if (S.plateauFail) return { data: null, error: { message: 'Enregistrement refusé' } };
        const p = args?.p ?? null;
        let out = null;
        if (p !== null) {
          if (!p || typeof p.cells !== 'object' || Array.isArray(p.cells)) return { data: null, error: { message: 'Disposition invalide' } };
          const LIEU_IDS = ['place', 'poste', 'ventes', 'camp', 'fabrique', 'fete', 'mairie'];
          const cells = {};
          for (const [k, c] of Object.entries(p.cells)) {
            if (!LIEU_IDS.includes(k)) continue;
            const { x, y, w, h } = c || {};
            if (![x, y, w, h].every(Number.isInteger) || x < 0 || w < 2 || x + w > 12 || y < 0 || y > 40 || h < 1 || h > 6) {
              return { data: null, error: { message: `Case « ${k} » hors du cadre` } };
            }
            cells[k] = { x, y, w, h };
          }
          out = { v: 1, cells };
        }
        try { localStorage.setItem('hg_fake_plateau', JSON.stringify(out)); } catch (e) { /* stockage indisponible */ }
        return { data: out, error: null };
      }
      // Raccourcis de la Vue d'ensemble (migration 103) : liste ordonnée d'identifiants de sous-section, par membre (privée).
      // null tant que rien n'est enregistré. Scénario : shortcuts (liste de départ), shortcutsFail (écriture refusée).
      // L'écriture garde le même nettoyage que la fonction SQL : identifiants valides, sans doublon, 24 au plus.
      if (fn === 'hg_admin_shortcuts_get' || fn === 'hg_admin_shortcuts_set') {
        const uid = S.uid || ME;
        const store = DB.hg_admin_shortcuts || (DB.hg_admin_shortcuts = {});
        if (fn === 'hg_admin_shortcuts_get') return { data: store[uid] ?? S.shortcuts ?? null, error: null };
        if (S.shortcutsFail) return { data: null, error: { message: 'Raccourcis indisponibles' } };
        const clean = [...new Set((args?.p_items || []).filter((x) => /^[a-z0-9-]{1,40}$/.test(x)))].slice(0, 24);
        store[uid] = clean;
        return { data: clean, error: null };
      }
      // Pages visibles pour l'utilisateur connecté : toutes pour un admin, sinon celles qui lui sont accordées.
      if (fn === 'hg_my_pages') {
        if (S.pagesFail) return { data: null, error: { message: 'Failed to fetch' } };
        const uid = S.uid || ME; const adm = DB.hg_profiles.find((p) => p.id === uid)?.is_admin;
        /** Accès de l'utilisateur connecté à la page slug (ligne de hg_page_access), ou undefined. */
        const acc = (slug) => DB.hg_page_access.find((a) => a.page_slug === slug && a.user_id === uid);
        return { data: DB.hg_pages.filter((p) => adm || (p.mode === 'membres' && acc(p.slug)?.allowed !== false) || (p.mode === 'liste' && acc(p.slug)?.allowed === true))
          .sort((a, b) => a.sort - b.sort).map(({ slug, label, in_nav, sort }) => ({ slug, label, in_nav, sort })), error: null };
      }
      // Voir le site comme un membre (migration 103) : pages du membre, droit « membres » requis.
      if (fn === 'hg_admin_view_as') {
        if (!hasP('membres')) return denied;
        const m = DB.hg_profiles.find((x) => x.id === args.p_user);
        if (!m) return { data: null, error: { message: 'Membre introuvable' } };
        const acc = (slug) => DB.hg_page_access.find((a) => a.page_slug === slug && a.user_id === m.id);
        const pages = DB.hg_pages.filter((p) => m.is_admin || (p.mode === 'membres' && acc(p.slug)?.allowed !== false) || (p.mode === 'liste' && acc(p.slug)?.allowed === true))
          .sort((a, b) => a.sort - b.sort).map(({ slug, label, in_nav, sort }) => ({ slug, label, in_nav, sort }));
        return { data: { id: m.id, pseudo: m.pseudo, is_admin: !!m.is_admin, pages, roles: [] }, error: null };
      }
      if (fn === 'hg_unread_count') return { data: 0, error: null };
      // Migration 076 : écritures du Staff par RPC journalisées (fil, réponses aux sorties, badges).
      if (fn === 'hg_activity_remove') {
        DB.hg_activity = (DB.hg_activity || []).filter((r) => String(r.id) !== String(args?.p_id));
        return { data: null, error: null };
      }
      if (fn === 'hg_rsvp_admin_set') {
        const list = DB.hg_event_rsvps || (DB.hg_event_rsvps = []);
        const i = list.findIndex((r) => r.event_id === args.p_event && r.user_id === args.p_user);
        if (!args.p_status) { if (i >= 0) list.splice(i, 1); }
        else if (i >= 0) list[i] = { ...list[i], status: args.p_status, updated_at: new Date().toISOString() };
        else list.push({ event_id: args.p_event, user_id: args.p_user, status: args.p_status, updated_at: new Date().toISOString(), self_answered: false });
        return { data: null, error: null };
      }
      if (fn === 'hg_badge_award') {
        const list = DB.hg_user_badges || (DB.hg_user_badges = []);
        if (list.some((r) => r.user_id === args.p_user && r.badge_code === args.p_code)) return { data: false, error: null };
        list.push({ user_id: args.p_user, badge_code: args.p_code, awarded_at: new Date().toISOString(), level: 1 });
        return { data: true, error: null };
      }
      // Migration 072 : réglages lus par RPC (sans les valeurs sensibles), inscrits du Secret Santa, gains restants.
      const reglage = (k) => DB.hg_settings?.find((r) => r.key === k)?.value || {};
      if (fn === 'hg_support_public') {
        const v = reglage('support'), out = {};
        for (const k of ['sujets', 'message_min', 'message_max', 'delai_reponse_jours']) if (v[k] !== undefined) out[k] = v[k];
        return { data: out, error: null };
      }
      if (fn === 'hg_eggs_public') {
        const v = reglage('eggs');
        const md = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const today = `${md.find((x) => x.type === 'month').value}-${md.find((x) => x.type === 'day').value}`;
        return { data: { recompenses: v.recompenses || {}, anniversaire_aujourdhui: v.anniversaire_gang === today, ...(S.champi ? { champi: S.champi } : {}) }, error: null };
      }
      if (fn === 'hg_ss_people') {
        return { data: (DB.hg_ss_participants || []).filter((r) => r.edition_id === args.p_edition)
          .sort((a, b) => String(a.joined_at).localeCompare(String(b.joined_at))).map(({ user_id, joined_at }) => ({ user_id, joined_at })), error: null };
      }
      // Cible Secret Santa (scénario ssTarget) : sans scénario, pas de cible (comportement d'avant).
      if (fn === 'hg_ss_my_target' && S.ssTarget) return { data: S.ssTarget, error: null };
      if (fn === 'hg_eco_quota') {
        return { data: S.ecoQuota || { photos: { payees: 0, plafond: 5 }, souvenirs: { payes: 0, plafond: 5 }, sortie: { payees: 0, plafond: 1 } }, error: null };
      }
      // Secrets cachés (migration 062) : hg_egg_found répond « nouveau » (l'appel reste dans __LOG) ; hg_eggs_me renvoie le carnet,
      // avec les secrets déjà trouvés avant la visite (scénario eggsDeja, distinct de eggsVus qui se remplit pendant la visite).
      if (fn === 'hg_eggs_me') return { data: { found: 1, total: 18, eggs: [{ egg: 'konami', first: new Date().toISOString() }, ...Object.keys(S.eggsDeja || {}).map((egg) => ({ egg, first: new Date().toISOString() }))], letters: 0, champis: 0 }, error: null };
      // Suivi des quêtes (quest-track.js) : rien à renvoyer ; l'appel reste dans window.__LOG.
      if (fn === 'hg_quest_track') return { data: null, error: null };
      // Secrets cachés (eggs/api.js) : une réponse par secret ; la première fois, « new » est vrai. Les lettres se comptent (sur 7).
      if (fn === 'hg_egg_found') {
        const code = args.p_egg, vus = (S.eggsVus = S.eggsVus || {});
        const nouveau = !vus[code]; vus[code] = true;
        const lettres = Object.keys(vus).filter((c) => c.startsWith('lettre_')).length;
        const message = code.startsWith('lettre_') ? `Lettre ${code.slice(7)} sur 7 (${lettres}/7)`
          : code === 'jeu404' ? `Paillettes attrapées : ${args.p_extra?.score}` : `Secret trouvé : ${code}`;
        return { data: { new: nouveau, reward: nouveau && code === 'jeu404' ? 5 : 0, message, card: null, badge: null, found: Object.keys(vus).length }, error: null };
      }
      // Annuaire pour le Staff : pseudo, couleur, fantôme ou non. Première définition de hg_staff_directory : celle-ci répond.
      if (fn === 'hg_staff_directory') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, avatar_url: p.avatar_url, color: p.color, is_ghost: !!p.is_ghost, joined_on: p.joined_on })), error: null };
      // Liste des membres : les fantômes n'y figurent pas (ils ne sont pas dans DB.hg_profiles).
      // Messagerie minimale (scénario S.conversations, S.convMembers, S.messages) : liste, fil, lecture, envoi.
      if (fn === 'hg_my_conversations') {
        const me = uidNow();
        const mine = (DB.hg_conversations || []).filter((c) => (S.convMembers || []).some((m) => m.conversation_id === c.id && m.user_id === me));
        return { data: mine.map((c) => {
          const msgs = (DB.hg_messages || []).filter((x) => x.conversation_id === c.id);
          const last = msgs[msgs.length - 1];
          const other = (S.convMembers || []).find((m) => m.conversation_id === c.id && m.user_id !== me)?.user_id || null;
          return { id: c.id, kind: c.kind, title: c.kind === 'support' ? c.title : (DB.hg_profiles.find((p) => p.id === other)?.pseudo || 'Conversation'),
            other_id: other, last_message_at: c.last_message_at, last_body: last?.body ?? null, last_mine: last ? last.sender_id === me : null, unread: 0 };
        }), error: null };
      }
      if (fn === 'hg_get_messages') {
        const me = uidNow();
        return { data: (DB.hg_messages || []).filter((x) => x.conversation_id === args.p_conv && x.id > (args.p_after || 0))
          .map((x) => ({ id: x.id, mine: x.sender_id === me, sender_label: x.sender_id === me ? 'Moi' : (DB.hg_profiles.find((p) => p.id === x.sender_id)?.pseudo || 'Ancien membre'), body: x.body, created_at: x.created_at })), error: null };
      }
      if (fn === 'hg_mark_read') return { data: null, error: null };
      if (fn === 'hg_send_message') {
        const id = 1 + Math.max(0, ...(DB.hg_messages || []).map((x) => x.id || 0));
        DB.hg_messages.push({ id, conversation_id: args.p_conv, sender_id: uidNow(), body: args.p_body, created_at: new Date().toISOString() });
        return { data: id, error: null };
      }
      if (fn === 'hg_support_summary') {
        const c = (DB.hg_conversations || []).find((x) => x.id === args.p_conv);
        if (!c || c.kind !== 'support') return { data: null, error: null };
        const sup = (DB.hg_support || []).find((x) => x.id === c.support_id);
        if (!sup) return { data: { subject: c.title, missing: true }, error: null };
        return { data: { support_id: sup.id, subject: sup.subject, message: sup.message, created_at: sup.created_at, author: sup.pseudo,
          status: sup.status === 'traitee' ? 'traitee' : sup.taken_by ? 'encours' : 'ouverte',
          taken_by: DB.hg_profiles.find((p) => p.id === sup.taken_by)?.pseudo || null, taken_at: sup.taken_at }, error: null };
      }
      // Prise en charge d'une demande (migration 066) : en cours ; conversation privée pour un membre inscrit.
      if (fn === 'hg_support_take') {
        const sup = (DB.hg_support || []).find((x) => x.id === args.p_support);
        if (!sup) return { data: null, error: { message: 'Demande introuvable' } };
        if (sup.status !== 'traitee') { sup.taken_by = sup.taken_by || ME; sup.taken_at = sup.taken_at || new Date().toISOString(); }
        sup.updated_at = new Date().toISOString();
        if (!sup.user_id) return { data: null, error: null };
        if (!sup.conversation_id) {
          sup.conversation_id = 'conv-' + sup.id;
          DB.hg_conversations.push({ id: sup.conversation_id, kind: 'support', title: sup.subject, support_id: sup.id, created_at: new Date().toISOString(), last_message_at: new Date().toISOString() });
        }
        return { data: sup.conversation_id, error: null };
      }
      if (fn === 'hg_members') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, avatar_url: null, color: p.color, member_since: p.joined_on || p.created_at })), error: null };
      // Conversations du scénario (S.convs).
      if (fn === 'hg_admin_conversations') return { data: S.convs || [], error: null };
      if (fn === 'hg_admin_read_conversation') { // lecture journalisée : chaque appel est tracé dans le journal du faux client
        window.__READS = (window.__READS || 0) + 1;
        return { data: DB.hg_messages.filter((m) => m.conversation_id === args.p_conv && m.id > args.p_after).slice(0, args.p_limit), error: null };
      }
      // Inscription : S.joinError simule un refus de hg_join (ex. pseudo réservé à un fantôme, migration 073).
      if (fn === 'hg_join' && S.joinError) return { data: null, error: { message: S.joinError, code: 'P0001' } };
      // Migration 073 : en-tête d'une conversation, retrait d'un message, comptage par édition (le Staff n'a plus d'accès direct aux tables).
      if (fn === 'hg_admin_conversation_info') {
        const c = (DB.hg_conversations || []).find((x) => x.id === args.p_conv) || (S.convs || []).find((x) => x.id === args.p_conv);
        return { data: c ? [{ id: c.id, kind: c.kind, santa_id: c.santa_id ?? null, target_id: c.target_id ?? null, edition_id: c.edition_id ?? null, created_at: c.created_at ?? null }] : [], error: null };
      }
      if (fn === 'hg_admin_message_remove') {
        const i = (DB.hg_messages || []).findIndex((m) => m.id === args.p_message);
        if (i < 0) return { data: null, error: { message: 'Message introuvable' } };
        DB.hg_messages.splice(i, 1);
        return { data: true, error: null };
      }
      if (fn === 'hg_ss_edition_conv_count') return { data: (DB.hg_conversations || []).filter((c) => c.edition_id === args.p_edition).length, error: null };
      // Doublon de hg_staff_directory : cette branche n'est jamais atteinte, la première définition répond d'abord.
      if (fn === 'hg_staff_directory') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, avatar_url: null, color: p.color, is_ghost: !!p.is_ghost, joined_on: p.joined_on || p.created_at })), error: null };
      // Comptes du panel admin : e-mail fabriqué à partir du pseudo.
      if (fn === 'hg_admin_accounts') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, email: p.pseudo.toLowerCase() + '@ex.ch', is_admin: p.is_admin, created_at: p.created_at, last_sign_in_at: null })), error: null };
      // Réclamation d'un lien d'invitation : échoue si le scénario fournit claimError.
      if (fn === 'hg_claim_invite_link') {
        window.__CLAIMS = (window.__CLAIMS || 0) + 1;
        if (S.claimError) return { data: null, error: { message: "Lien d'invitation invalide ou expiré" } };
        return { data: 'HG-Q7W' + 'XYZ'.slice(0, 3), error: null };
      }
      // Carte d'identité d'un membre : profil, badges et statistiques factices.
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
      // Droits de l'utilisateur connecté (admin ou Staff).
      if (fn === 'hg_my_perms') return { data: myPermsNow(), error: null };
      // Vrai si l'utilisateur est admin ou a au moins une permission Staff.
      if (fn === 'hg_is_staff') { const m = myPermsNow(); return { data: m.is_admin || m.perms.length > 0, error: null }; }
      if (fn === 'hg_staff_directory') return { data: DB.hg_profiles.map((p) => ({ id: p.id, pseudo: p.pseudo, avatar_url: p.avatar_url ?? null, color: p.color ?? null, is_ghost: !!p.is_ghost, joined_on: p.joined_on ?? null })), error: null };
      // Liste des Staff : réservée à l'admin.
      if (fn === 'hg_staff_list') return isAdminNow() ? { data: staffRowsNow(), error: null } : denied;
      // Ajoute ou modifie un Staff : réservé à l'admin, permissions vérifiées contre le catalogue.
      if (fn === 'hg_staff_set') {
        if (!isAdminNow()) return denied;
        window.__LOG.push(['staff_set', args.p_user, args.p_perms]);
        if (args.p_user === ME) return { data: null, error: { message: 'Tu es déjà admin' } };
        if (!DB.hg_profiles.some((x) => x.id === args.p_user)) return { data: null, error: { message: 'Membre introuvable' } };
        const perms = [...new Set(args.p_perms || [])];
        const bad = perms.filter((k) => !CATALOG_KEYS.includes(k));
        if (bad.length) return { data: null, error: { message: 'Permission inconnue : ' + bad.join(', ') } };
        const now = new Date().toISOString();
        const row = DB.hg_staff.find((x) => x.user_id === args.p_user);
        if (row) Object.assign(row, { perms, active: args.p_active ?? true, note: args.p_note ?? row.note, updated_at: now });
        else DB.hg_staff.push({ user_id: args.p_user, perms, active: args.p_active ?? true, note: args.p_note ?? '', added_by: ME, created_at: now, updated_at: now });
        return { data: null, error: null };
      }
      // ---- Paquet xJ4 (migration 086) : arcade du jour (J18), saisons (J16), soirées complètes (J19) ----
      // Scénario : arcadeGame ('paillettes' | 'raclette' | 'domu'), arcadeRewarded, arcadeBadScore, arcadePrises (plafond de prises du jour, migration 190) ; saison (remplace le classement) ;
      // night (soirée en cours ou à venir, null = aucune), nightNotStaff. Les appels restent dans window.__LOG.
      // Arcade du panel (migration 103) : tableau de la semaine et effacement d'un score (droit « reglages »).
      // Scénario : arcadeBoardFail (lecture refusée), arcadeClearFail (effacement refusé). Les effacements sont notés dans window.__ARCB.
      if (fn === 'hg_arcade_admin_board' || fn === 'hg_arcade_admin_clear') {
        const m = myPermsNow();
        if (!(m.is_admin || m.perms.includes('reglages'))) return { data: null, error: { message: 'Droit « reglages » requis' } };
        const AB = (window.__ARCB ||= { cleared: [] });
        const lundi = (iso) => { const x = new Date(iso + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
        const jourZ = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // jour de Zurich
        const cetteSemaine = lundi(jourZ);
        const wk = lundi(args.p_week || jourZ);
        if (fn === 'hg_arcade_admin_clear') {
          if (S.arcadeClearFail) return { data: null, error: { message: 'Effacement refusé (test)' } };
          AB.cleared.push(`${args.p_user}|${args.p_game}|${args.p_week}`);
          return { data: null, error: null };
        }
        if (S.arcadeBoardFail) return { data: null, error: { message: 'Arcade indisponible (test)' } };
        const pr = (id) => DB.hg_profiles.find((q) => q.id === id)?.pseudo ?? null;
        const ago = (h) => new Date(Date.now() - h * 36e5).toISOString();
        // Semaine en cours : classements pleins ; semaine précédente : un autre jeu sans score, les autres plus bas.
        const passee = wk !== cetteSemaine;
        const rules = { paillettes: { max: 150, rate: 6, min_s: 25, titre: 'Paillettes' }, raclette: { max: 150, rate: 6, min_s: 25, titre: 'Raclette' }, domu: { max: 600, rate: 8, min_s: 3, titre: 'Domu-mobile' } };
        const scores = passee
          ? { paillettes: [[U(3), 70], [U(2), 55]], raclette: [[U(2), 40]], domu: [] }
          : { paillettes: [[U(2), 120], [U(3), 95], [uidNow(), 80]], raclette: [[U(3), 60], [U(2), 45]], domu: [[uidNow(), 210], [U(2), 150]] };
        const stats = passee ? { paillettes: [6, 20], raclette: [4, 10], domu: [1, 0] } : { paillettes: [14, 60], raclette: [9, 35], domu: [3, 0] };
        const cleared = (u, g) => AB.cleared.includes(`${u}|${g}|${wk}`) || AB.cleared.includes(`${u}|${g}|${args.p_week}`);
        const games = ['paillettes', 'raclette', 'domu'].map((g) => ({ game: g, rules: rules[g], runs: stats[g][0], paid: stats[g][1],
          top: scores[g].filter(([u]) => !cleared(u, g)).map(([u, best], i) => ({ user_id: u, pseudo: pr(u), best, at: ago(2 + i) })).slice(0, 10) }));
        return { data: { week: wk, reward: S.arcadeReward ?? 5, games }, error: null };
      }
      if (fn.startsWith('hg_arcade_') || fn.startsWith('hg_season_') || fn.startsWith('hg_night') ) {
        const X = (window.__X4 ||= { rewarded: !!S.arcadeRewarded, runs: 0, best: 0, here: false, presents: null });
        const pr = (id) => { const p = DB.hg_profiles.find((q) => q.id === id) || {}; return { user_id: id, pseudo: p.pseudo, avatar_url: null, color: p.color || '#4F6A8F' }; };
        const gameOfDay = S.arcadeGame || 'raclette'; // jeu tiré pour la journée (game_of_day)
        const game = ['paillettes', 'raclette', 'domu'].includes(args.p_game) ? args.p_game : gameOfDay; // p_game demandé, sinon celui du jour
        const top = () => [{ ...pr(U(2)), best: 61 }, { ...pr(U(3)), best: 40 }, ...(X.best ? [{ ...pr(uidNow()), best: X.best }] : [])].sort((a, b) => b.best - a.best).slice(0, 5);
        if (fn === 'hg_arcade_board') return { data: { day: iso(0).slice(0, 10), game, game_of_day: gameOfDay, reward: 5, rewarded_today: X.rewarded, my_best: X.best || null, rules: {}, top: top() }, error: null };
        if (fn === 'hg_arcade_start') { X.runs++; return { data: { run: `run-${X.runs}`, game }, error: null }; }
        if (fn === 'hg_arcade_finish') {
          if (S.arcadeBadScore) return { data: { ok: false, error: 'Score impossible', score: 0, reward: 0 }, error: null };
          const sc = Number(args.p_score) || 0, nb = sc > X.best;
          const reward = !X.rewarded && sc >= 1 ? 5 : 0;
          if (reward) X.rewarded = true;
          if (nb) X.best = sc;
          const prises = S.arcadePrises ? Math.min(sc, S.arcadePrises - (X.prises || 0)) : 0;
          X.prises = (X.prises || 0) + prises;
          return { data: { ok: true, score: sc, game, reward, prises, new_best: nb && sc > 0, best: X.best, top: top() }, error: null };
        }
        const cats = [['quiz', 'Questions du gang', 5, 50], ['jeux', 'Jeux du jour', 5, 35], ['quetes', 'Quêtes de la semaine', 10, 40], ['captures', 'Captures et drops', 5, 20], ['cartes', 'Cartes nouvelles', 2, 20], ['defis', 'Défis du gang', 15, 15]]
          .map(([cat, label, pts, cap]) => ({ cat, label, pts, cap }));
        if (fn === 'hg_season_board') {
          const general = [[U(2), 612, false], [U(3), 588, false], [U(4), 571, false], [uidNow(), 540, true], [U(5), 498, true]].map(([id, points, nouveau], i) => ({ rank: i + 1, ...pr(id), points, nouveau }));
          return { data: S.saison || { season: { id: '2026-T4', label: 'Saison d’automne 2026', starts_at: '2026-09-30T22:00:00Z', ends_at: iso(69), settled_at: null },
            cats, rewards: { podium: [300, 200, 100], nouveaux: [150, 100, 50], palier_points: 100, palier_gain: 50 }, participants: 12,
            me: { rank: 4, points: 540, nouveau: true, rank_nouveaux: 1, detail: { quiz: 200 }, week: { quiz: 38, jeux: 25, quetes: 30, captures: 9, cartes: 12, defis: 15 } },
            top: general, top_nouveaux: general.filter((r) => r.nouveau).map((r, i) => ({ ...r, rank: i + 1 })) }, error: null };
        }
        const staff = () => { const m = myPermsNow(); return m.is_admin || m.perms.includes('cartes'); };
        if (fn === 'hg_season_save' || fn === 'hg_season_settle') return staff() ? { data: { id: args.p_id || args.p_season, versements: 3 }, error: null } : { data: null, error: { message: 'Réservé au Staff (cartes)' } };
        if (fn === 'hg_night_current') {
          if (!S.night) return { data: null, error: null };
          if (X.presents === null) X.presents = [...(S.night.presents || [])];
          const live = S.night.live !== false;
          return { data: { id: 'night-1', title: 'Soirée Gartic', starts_at: live ? iso(-0.05) : iso(1), ends_at: live ? iso(0.1) : iso(1.2), threshold: S.night.threshold || 3, reward: 30,
            completed_at: X.presents.length >= (S.night.threshold || 3) ? iso(0) : null, live, here: X.here, presents: X.presents.map(pr), completes_annee: 2, seuil_pct: 60, actifs: 13 }, error: null };
        }
        if (fn === 'hg_night_here') {
          if (!X.here) { X.here = true; X.presents.push(uidNow()); }
          const th = S.night?.threshold || 3, cnt = X.presents.length;
          return { data: { count: cnt, threshold: th, complete: cnt >= th, just_completed: cnt === th, paid: cnt >= th, reward: 30 }, error: null };
        }
        if (fn === 'hg_nights_admin') {
          if (!staff()) return { data: null, error: { message: 'Réservé au Staff (cartes)' } };
          return { data: { defaults: { seuil_pct: 60, recompense: 30, actifs: 10, seuil: 6 }, nights: (X.nights ||= [
            { id: 'n1', title: 'Soirée Gartic', starts_at: iso(-0.05), ends_at: iso(0.1), threshold: 6, reward: 30, source: 'staff', cancelled: false, completed_at: null, presents: 2 }]) }, error: null };
        }
        if (fn === 'hg_night_save') {
          if (!staff()) return { data: null, error: { message: 'Réservé au Staff (cartes)' } };
          (X.nights ||= []).unshift({ id: 'n' + (X.nights.length + 2), title: args.p_title, starts_at: args.p_starts, ends_at: args.p_ends, threshold: args.p_threshold ?? 6, reward: args.p_reward ?? 30, source: 'staff', cancelled: false, completed_at: null, presents: 0 });
          return { data: 'n-new', error: null };
        }
        if (fn === 'hg_night_cancel' || fn === 'hg_night_defaults_set') return staff() ? { data: null, error: null } : { data: null, error: { message: 'Réservé au Staff (cartes)' } };
      }
      if (fn === 'hg_admin_ghosts') return { data: window.__SCN?.ghosts ?? [], error: null }; // fantômes : fournis par le scénario du test
      if (fn === 'hg_challenges_active') return { data: window.__SCN?.defis ?? [], error: null }; // défis en cours (widget de l'accueil) : fournis par le scénario du test
      // Fantômes (état propre à chaque page : le scénario est copié dans window.__SCN)
      if (fn === 'hg_ghost_suggestions') { // correspondances : seulement pour les fantômes encore présents
        const gs = window.__SCN?.ghosts ?? [];
        return { data: (window.__SCN?.suggestions ?? []).filter((s) => gs.some((g) => g.id === s.ghost_id)), error: null };
      }
      // Crée un fantôme dans le scénario (window.__SCN.ghosts).
      if (fn === 'hg_ghost_create') {
        const sc = window.__SCN || (window.__SCN = {});
        const n = (sc.ghosts?.length ?? 0) + 1;
        sc.ghosts = [...(sc.ghosts ?? []), { id: `cccccccc-0000-4000-8000-${String(n).padStart(12, '0')}`, pseudo: args.p_pseudo, avatar_url: null,
          joined_on: args.p_joined_on ?? null, created_at: new Date().toISOString(), invite_code: null, invite_expires_at: null, ghost_note: args.p_note ?? null }];
        return { data: null, error: null };
      }
      // Génère un code d'invitation pour un fantôme.
      if (fn === 'hg_ghost_invite') {
        const g = (window.__SCN?.ghosts ?? []).find((x) => x.id === args.p_ghost);
        if (!g) return { data: null, error: { message: 'Fantôme introuvable' } };
        g.invite_code = 'HG-NEW' + String((window.__SCN.ghosts.indexOf(g) + 1)).padStart(3, '0');
        g.invite_expires_at = new Date(Date.now() + 60 * 864e5).toISOString();
        return { data: { code: g.invite_code }, error: null };
      }
      if (fn === 'hg_ghost_merge') { // transfère (ici : compte fictif) puis supprime le fantôme et ses correspondances
        const sc = window.__SCN || {};
        if (sc.ghosts) sc.ghosts = sc.ghosts.filter((g) => g.id !== args.p_ghost);
        if (sc.suggestions) sc.suggestions = sc.suggestions.filter((s) => s.ghost_id !== args.p_ghost);
        return { data: [{ moved: 3 }], error: null };
      }
      // Questions du gang (migration 061) : admin ou Staff « quiz ». S.quizError : erreur serveur simulée à l'enregistrement.
      if (fn === 'hg_quiz_key' || fn === 'hg_quiz_remove' || fn === 'hg_quiz_save' || fn === 'hg_quiz_set_secret') {
        const m = myPermsNow();
        if (!(m.is_admin || m.perms.includes('quiz'))) return denied;
        if (fn === 'hg_quiz_key') { const k = DB.hg_quiz_keys.find((x) => x.question_id === args.p_id); return { data: k ? k.answer : null, error: null }; }
        if (fn === 'hg_quiz_set_secret') { // migration 062 : S.quizSecretError simule une erreur serveur à cette étape
          if (S.quizSecretError) return quizErr(S.quizSecretError);
          const row = DB.hg_quiz_questions.find((x) => x.id === args.p_id);
          if (!row) return quizErr('Question introuvable');
          row.secret = !!args.p_secret;
          window.__LOG.push(['quiz_secret', args.p_id, row.secret]);
          return { data: null, error: null };
        }
        if (fn === 'hg_quiz_remove') {
          window.__LOG.push(['quiz_remove', args.p_id]);
          DB.hg_quiz_questions = DB.hg_quiz_questions.filter((x) => x.id !== args.p_id);
          DB.hg_quiz_keys = DB.hg_quiz_keys.filter((x) => x.question_id !== args.p_id);
          return { data: null, error: null };
        }
        return quizSave(args);
      }
      // Questions du gang : liste sans la clé ; réponse en une seule tentative, corrigée ici comme le fait la base.
      if (fn === 'hg_quiz_list') {
        if (S.quizFail) return { data: null, error: { message: 'Failed to fetch' } };
        return { data: QUIZ.map(quizRow), error: null };
      }
      if (fn === 'hg_quiz_answer') {
        const q = QUIZ.find((x) => x.id === args.p_question);
        if (!q) return { data: null, error: { message: 'Cette question n’est pas ouverte' } };
        if (q.answer) return { data: null, error: { message: 'Tu as déjà répondu à cette question' } };
        const r = args.p_response;
        if (r == null || r === '' || (Array.isArray(r) && r.length === 0)) return { data: null, error: { message: 'Choisis ou écris une réponse' } };
        const ok = quizCheck(q, r);
        const reward = ok ? q.reward : 0;
        q.answer = { response: r, is_correct: ok, reward, answered_at: new Date().toISOString() };
        return { data: { correct: ok, reward, explanation: ok !== null ? q.explanation : null, solution: ok !== null ? quizSolution(q) : null }, error: null };
      }
      // Boosters paramétrables (migration 071) : réservés à l'admin et au Staff « cartes », comme hg_has_perm('cartes').
      if (fn === 'hg_booster_type_save') return boosterTypeSave(args?.p);
      if (fn === 'hg_booster_type_stats') {
        if (!myPermsNow().is_admin && !myPermsNow().perms.includes('cartes')) return { data: null, error: { message: 'Réservé à l\'admin et au Staff « cartes »' } };
        if (S.boosterStatsFail) return { data: null, error: { message: 'Failed to fetch' } };
        // Chiffres fictifs, décroissants dans l'ordre de la table (forme exacte de la migration 071)
        const v = (i, n) => n * Math.max(0, 9 - i);
        return { data: { generated_at: new Date().toISOString(), opens_since: iso(-1), types: DB.hg_booster_types.map((t, i) => ({
          id: t.id, name: t.name, style: t.style, price: t.price, active: t.active, sort: t.sort,
          sales: { d7: { boosters: v(i, 3), paillettes: v(i, 3) * t.price }, d30: { boosters: v(i, 10), paillettes: v(i, 10) * t.price }, total: { boosters: v(i, 25), paillettes: v(i, 25) * t.price } },
          opens: { d7: v(i, 2), d30: v(i, 8), total: v(i, 20), cards: v(i, 20) * t.size, refund: 0 },
          stock: { total: v(i, 5), holders: Math.min(6, v(i, 1)) }, gifts: { d7: 0, d30: i, total: i, count: i } })) }, error: null };
      }
      // ---------- Migration 093 (idées A6, A7, A9) ----------
      if (fn === 'hg_client_error') return { data: null, error: null }; // l'appel reste dans __LOG (A9)
      const canP = (k) => myPermsNow().is_admin || myPermsNow().perms.includes(k);
      if (fn === 'hg_report') { // A6 : une fois par contenu ; crée la demande « Signalement » ; masquage au 3e membre
        const me = uidNow();
        if (DB.hg_reports.some((r) => r.reporter === me && r.kind === args.p_kind && r.ref_id === String(args.p_ref))) return { data: null, error: { message: 'Tu as déjà signalé ce contenu' } };
        const sid = 'sup-rep-' + (DB.hg_reports.length + 1);
        const pseudo = DB.hg_profiles.find((x) => x.id === me)?.pseudo || 'Membre';
        DB.hg_support.push({ id: sid, user_id: me, pseudo, subject: 'Signalement', message: `Signalement · ${args.p_kind}`, status: 'ouverte', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        const row = { id: 'rep-' + (DB.hg_reports.length + 1), reporter: me, kind: args.p_kind, ref_id: String(args.p_ref), reason: args.p_reason, note: args.p_note, snapshot: {}, support_id: sid, status: 'ouverte', created_at: new Date().toISOString() };
        DB.hg_reports.push(row);
        const n = new Set(DB.hg_reports.filter((r) => r.kind === row.kind && r.ref_id === row.ref_id && r.status === 'ouverte').map((r) => r.reporter)).size;
        return { data: { ok: true, id: row.id, masque: n >= 3 }, error: null };
      }
      if (fn === 'hg_report_resolve') {
        if (!canP('support')) return { data: null, error: { message: 'Réservé au Staff « assistance »' } };
        const r = DB.hg_reports.find((x) => x.id === args.p_report);
        if (!r) return { data: null, error: { message: 'Signalement introuvable' } };
        const tab = { photo: 'hg_photos', moment: 'hg_moments', message: 'hg_messages' }[r.kind];
        const item = (DB[tab] || []).find((x) => String(x.id) === r.ref_id);
        let n = 0, path = null;
        if (args.p_action === 'masquer' && item) Object.assign(item, { hidden_at: new Date().toISOString(), hidden_by: uidNow() });
        if (args.p_action === 'reafficher' && item) Object.assign(item, { hidden_at: null, hidden_by: null });
        if (args.p_action === 'supprimer' && item) { path = item.path || item.image_path || null; DB[tab].splice(DB[tab].indexOf(item), 1); }
        if (args.p_action !== 'reafficher') for (const x of DB.hg_reports.filter((y) => y.kind === r.kind && y.ref_id === r.ref_id && y.status === 'ouverte')) {
          Object.assign(x, { status: args.p_action === 'rien' ? 'rejetee' : 'traitee', action: args.p_action, resolved_at: new Date().toISOString() });
          const sup = DB.hg_support.find((y) => y.id === x.support_id);
          if (sup) sup.status = 'traitee';
          DB.hg_support_replies.push({ id: 'rr' + Math.random(), support_id: x.support_id, author_id: uidNow(), body: 'C’est réglé, merci', internal: false, created_at: new Date().toISOString() });
          n++;
        }
        window.__LOG.push(['report_resolve', args.p_report, args.p_action]);
        return { data: { ok: true, closed: n, path }, error: null };
      }
      if (fn === 'hg_conv_hidden') return { data: (DB.hg_messages || []).filter((m) => m.conversation_id === args.p_conv && m.hidden_at).map((m) => m.id), error: null };
      if (fn === 'hg_eco_health') {
        if (!canP('cartes')) return { data: null, error: { message: 'Réservé à l\'admin et au Staff « cartes »' } };
        const ig = S.ecoIgnore || null;
        return { data: S.ecoHealth || { generated_at: new Date().toISOString(), ignore_until: ig,
          seuils: { paillettes_pct: 25, recyclage_pct: 60, booster_pct: 100, concentration_x: 5 },
          paillettes: { total: 184300, net7: 29400, pct: 19, days: [1200, 2400, 3100, 4200, 5100, 6000, 7400], level: 'warn' },
          recyclage: { recycled: 152, obtained: 400, pct: 38, days: [30, 42, 35, 40, 38, 36, 38], level: 'ok' },
          boosters: [{ id: 'argente', name: 'Argenté', price: 250, ev: 148, ratio: 59, level: 'ok' }, { id: 'dore', name: 'Doré', price: 350, ev: 262, ratio: 75, level: 'ok' },
            { id: 'diamant', name: 'Diamant', price: 600, ev: 672, ratio: 112, level: 'bad' }, { id: 'classique', name: 'Classique', price: 100, ev: 61, ratio: 61, level: 'ok' }],
          booster_max: { id: 'diamant', name: 'Diamant', price: 600, ev: 672, ratio: 112 },
          concentration: { earners: 12, median: 400, max: 840, ratio: 2.1, top: null, level: 'ok' } }, error: null };
      }
      if (fn === 'hg_eco_alerts_ignore') {
        if (!canP('cartes')) return { data: null, error: { message: 'Réservé' } };
        S.ecoIgnore = args.p_days ? new Date(Date.now() + args.p_days * 864e5).toISOString() : null;
        window.__LOG.push(['eco_ignore', args.p_days]);
        return { data: S.ecoIgnore, error: null };
      }
      if (fn === 'hg_client_error_set' || fn === 'hg_client_error_ticket') {
        if (!canP('reglages')) return { data: null, error: { message: 'Réservé au Staff « réglages »' } };
        const e = DB.hg_client_errors.find((x) => x.id === args.p_id);
        if (!e) return { data: null, error: { message: 'Erreur introuvable' } };
        if (fn === 'hg_client_error_set') { e.status = args.p_status; if (args.p_status === 'corrigee') e.fixed_version = e.last_version; return { data: null, error: null }; }
        if (!e.support_id) {
          e.support_id = 'sup-err-' + e.id;
          DB.hg_support.push({ id: e.support_id, user_id: uidNow(), pseudo: 'Ethan', subject: 'Bug sur le site', message: e.message, status: 'ouverte', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
        }
        return { data: e.support_id, error: null };
      }
      if (fn === 'hg_drops_active') return { data: [], error: null }; // pas de drop sur ces pages (voir fake-sb-cartes.mjs)
      // Réclamation d'un drop : toujours refusée, le drop est terminé.
      if (fn === 'hg_drop_claim') return { data: null, error: { message: 'Trop tard : ce drop est terminé.' } };
      // Tirage manuel du Secret Santa : renvoie le nombre de paires reçues.
      if (fn === 'hg_ss_manual_draw') return { data: args.p_pairs.length, error: null };
      if (fn === 'hg_ss_reveal') { // paires d'une édition : seulement en révélation ou terminée (comme la base)
        const ed = DB.hg_ss_editions.find((e) => e.id === args.p_edition);
        if (!['revelation', 'termine'].includes(ed?.status)) return { data: [], error: null };
        /** Pseudo d'un membre ou d'un fantôme à partir de son identifiant. */
        const pseudo = (id) => (DB.hg_profiles.find((p) => p.id === id) || GHOSTS.find((g) => g.id === id) || {}).pseudo;
        const rows = DB.hg_ss_assignments.filter((a) => a.edition_id === args.p_edition).map((a) => ({ giver: pseudo(a.giver_id), receiver: pseudo(a.receiver_id) }));
        return { data: rows.sort((x, y) => x.giver.localeCompare(y.giver, 'fr')), error: null };
      }
      { const x = rolesRpc(fn, args); if (x) return x; } // rôles et accès par rôle (migration 103)
      { const x = xa1Rpc(fn, args); if (x) return x; } // idées A1 à A4 (migration 092)
      return { data: null, error: null };
    },
    // Temps réel et stockage (fichiers) : simulés plus bas.
    channel: (name) => makeChannel(name), removeChannel: (ch) => { RT.channels.delete(ch); }, removeAllChannels() { RT.channels.clear(); },
    // Stockage : hg-bot-media a son propre faux ; les autres buckets répondent avec des images factices.
    storage: { from: (bucket) => (bucket === 'hg-bot-media' ? botMediaBucket() : {
      /** URL publique factice (un petit cercle doré). */
      getPublicUrl: (p) => ({ data: { publicUrl: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="gold"/></svg>') } }),
      upload: async (p) => { window.__LOG.push(['upload', p]); return { data: { path: p }, error: null }; },
      remove: async (p) => { window.__LOG.push(['remove', p]); return { data: [], error: null }; },
      /** URL signée : une image grise de remplacement, sans réseau. */
      createSignedUrl: async () => ({ data: { signedUrl: S.photoUrl || PHOTO_SVG } }), // S.photoUrl : image du site téléchargeable (test des vignettes, Q3)
      createSignedUrls: async (paths = []) => ({ data: paths.map((p) => ({ path: p, signedUrl: S.photoUrl || PHOTO_SVG, error: null })) }),
    }) },
    /** Fonctions edge simulées : notées dans le journal, avec une réponse pour admin_dm et dyn_announce, sinon une réponse vide. */
    functions: { invoke: async (name, { body } = {}) => { window.__LOG.push(['fn', name, body]); if (body?.event === 'admin_dm') return { data: adminDmResult(body), error: null }; if (body?.event === 'bot_test') return { data: botTestResult(), error: null }; return { data: body?.event === 'dyn_announce' ? { ok: true, sent: true } : {}, error: null }; } },
  };
}
