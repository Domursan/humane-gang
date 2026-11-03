// =====================================================================
// Cartes admin : constantes (libellés, réglages par défaut, description des réglages de l'économie).
// Rien ici n'appelle la base : ce sont des valeurs fixes et des listes de libellés.
// Dépendances : icons.js (svg), cartes-ui.js (RARITIES_TIRAGE, rarityLabel : libellés des raretés).
// Exporte : TZ, ICON, TABS, RARITY_IDS, REASON_LABEL, CFG_DEFAULT, ECON.
// =====================================================================
import { paillSym } from '../../../commun/paillettes.js';
import { svg } from '../../../commun/icons.js';
import { RARITIES_TIRAGE, rarityLabel } from '../../cartes/cartes-ui.js';

/* Fuseau horaire d'affichage des dates (Suisse). */
export const TZ = 'Europe/Zurich';
/* Icônes SVG des boutons de la section : ajouter, modifier, supprimer, activer, désactiver. */
export const ICON = {
  plus: svg('plus', { stroke: 2 }),
  edit: svg('edit', { stroke: 2 }),
  trash: svg('trash', { stroke: 2 }),
  off: svg('off', { stroke: 2 }),
  on: svg('check2', { stroke: 2 }),
};
/* Onglets de la section, sous la forme [identifiant, libellé]. */
export const TABS = [['series', 'Séries'], ['cartes', 'Cartes'], ['quetes', 'Quêtes'], ['economie', 'Économie'], ['boosters', 'Boosters'], ['joueurs', 'Joueurs'], ['stats', 'Statistiques'], ['echanges', 'Échanges'],
  ['codes', 'Codes cadeaux'], ['recettes', 'Atelier'], ['encheres', 'Enchères']]; // idées C9, C10, C11 (migration 081)
/* Identifiants des raretés tirées dans les boosters (taux et recyclage), dans l'ordre de RARITIES. Sans « unique » : jamais tirée, jamais recyclée. */
export const RARITY_IDS = RARITIES_TIRAGE.map((r) => r.id);
const CRAFT_IDS = ['commune', 'peu_commune', 'rare', 'epique', 'legendaire']; // mythique et identite ne se fabriquent jamais
/* Libellés des raisons enregistrées dans le journal des Paillettes (hg_wallet_log). */
export const REASON_LABEL = {
  quete: 'Quête de la semaine', defi: 'Défi du gang', challenge: 'Challenge de la semaine',
  booster: 'Booster', quotidien: 'Passage du jour', recyclage: 'Recyclage', fabrication: 'Fabrication', echange: 'Échange',
  reponse_sortie: 'Réponse à une sortie', sortie_creee: 'Sortie créée', photo: 'Photo publiée', moment: 'Moment publié',
  badge: 'Badge gagné', capture: 'Image attrapée', presence: 'Présence à une sortie', cadeau_santa: 'Cadeau Secret Santa',
  serie_complete: 'Série complète', admin: 'Ajustement admin',
  framed: 'Framed du ciné-club', heardle: 'Heardle du gang', bataille: 'Bataille de cartes', bataille_def: 'Défense tenue (Bataille)',
};
// Valeurs de repli = valeurs actuelles en base (hg_settings.cards, lues le 22/10/2026 ; migration 053 les reprend côté SQL).
// Utilisées seulement si hg_settings.cards est vide, et pour « Rétablir les valeurs par défaut ».
export const CFG_DEFAULT = {
  starting_paillettes: 1000, booster_price: 100, booster_size: 5, free_booster_hours: 24, shiny_rate: 3, pity_epique: 20, max_open_trades: 50, trade_expiry_days: 7,
  rates: { commune: 60, peu_commune: 25, rare: 10, epique: 4, legendaire: 0.88, mythique: 0.1, identite: 0.02 },
  recycle: { commune: 5, peu_commune: 10, rare: 25, epique: 60, legendaire: 150, mythique: 400, identite: 1000, shiny_multiplier: 3 },
  craft: { commune: 100, peu_commune: 150, rare: 200, epique: 750, legendaire: 2000, shiny_multiplier: 6 },
  rewards: { daily: 100, streak_bonus: 20, streak_max: 30, rsvp: 50, presence: 100, photo: 100, moment: 100, gift_sent: 250, badge: 500, capture: 150, event_created: 100, set_complete: 300, citation: 20 },
  quetes_par_semaine: 3,
  quetes_preuve_par_semaine: 2,
  drops: { quantite_max: 50, duree_max_min: 1440, duree_defaut_min: 30 },
  alertes: { paillettes_pct: 25, recyclage_pct: 60, booster_pct: 100, concentration_x: 5 },
  // Plafonds (cards.plafonds) : valeurs des fonctions SQL (hg_eco_cap, hg_jeux_cap et défauts en dur), vérifiées en base le 24/10/2026.
  // Le formulaire « Limites » n'enregistre que les écarts : un champ vide retire la clé, et le SQL reprend ce défaut.
  plafonds: {
    framed_gain: 10, framed_consolation: 3, heardle_gain: 10, heardle_consolation: 3, sutom_trouve: 10, sutom_perdu: 3,
    jeu_du_jour_gain: 5, jeux_du_jour: 3,
    quiz_jour: 10, quiz_serie_7: 50, quiz_serie_30: 200, quiz_serie_100: 1000, citations_jour: 3, citations_semaine: 3,
    photos_jour: 5, souvenirs_jour: 5, sorties_semaine: 1, reponses_semaine: 7, presences_semaine: 7,
    photos_max_jour: 100, souvenirs_max_jour: 20, sorties_max_jour: 20, idees_max_jour: 10, playlist_jour: 3,
    code_paillettes: 1000, badges_manuels_jour: 10, avent_mois: 600,
    bataille_gain: 10, batailles_jour: 3, defense_gain: 5, defenses_jour: 3, bataille_meme_adversaire: 2, batailles_max_jour: 20,
  },
};
/* Plafond de Paillettes (cards.plafonds) : entier de 0 à max (1 000 au plus : bornes de hg_settings_bounds). Vide = défaut. */
const PLAF = (k, l, u, max = 1000, min = 0) => ({ k: `plafonds.${k}`, l, u, int: true, min, max, ph: true });
/* Récompenses en Paillettes avec leur libellé ; les clés correspondent à rewards.* de CFG_DEFAULT. */
const REWARDS = [
  ['daily', 'Passage du jour'], ['streak_bonus', 'Bonus par jour de série (en plus)'], ['streak_max', 'Série maximale (jours)'],
  ['rsvp', 'Réponse « oui » à une sortie'], ['presence', 'Présence à une sortie passée'], ['photo', 'Photo publiée'],
  ['moment', 'Moment publié'], ['gift_sent', 'Cadeau Secret Santa envoyé'], ['badge', 'Badge gagné'],
  ['capture', 'Image attrapée (événement)'], ['event_created', 'Sortie ou événement créé'], ['set_complete', 'Série complète (une fois par série)'],
  ['citation', 'Citation « Qui a dit ça ? » validée (proposée par un membre)'],
];
/* Plafond des récompenses dont la base borne la valeur (hg_quote_review plafonne la citation à 500). */
const REWARD_MAX = { citation: 500 };
// Réglages éditables. k = chemin (« rates.commune ») ; le nom du champ de formulaire remplace chaque point par un tiret bas.
// help = aide courte affichée sous le champ. Défauts : CFG_DEFAULT.
export const ECON = [
  { g: 'Départ', hint: 'Paillettes offertes une seule fois à chaque nouveau joueur.', fields: [
    { k: 'starting_paillettes', l: 'Capital de départ', u: paillSym(), int: true, help: 'Paillettes données à l\'inscription.' },
  ] },
  { g: 'Boosters', fields: [
    { k: 'booster_price', l: 'Prix d\'un booster', u: paillSym(), int: true, help: 'Coût d\'un booster acheté par un membre.' },
    { k: 'booster_size', l: 'Cartes par booster', int: true, min: 1, max: 10, help: 'Nombre de cartes tirées dans un booster (1 à 10).' },
    { k: 'free_booster_hours', l: 'Délai du booster gratuit', u: 'heures', step: 0.5, help: 'Un booster gratuit est offert toutes les N heures.' },
  ] },
  { g: 'Taux de tirage', hint: 'Part de chaque rareté dans un booster. Le total devrait faire 100 %.', rates: true,
    fields: RARITY_IDS.map((r) => ({ k: `rates.${r}`, l: rarityLabel(r), u: '%', step: 0.01 })) },
  { g: 'Brillantes et garantie', fields: [
    { k: 'shiny_rate', l: 'Taux de carte brillante', u: '%', step: 0.1, max: 100, help: 'Chance qu\'une carte tirée soit brillante.' },
    { k: 'pity_epique', l: 'Garantie épique : une carte Épique ou mieux tous les N boosters (0 = aucune)', int: true, help: 'Garantit une carte Épique ou mieux après N boosters sans elle.' },
  ] },
  { g: 'Recyclage', hint: 'Paillettes reçues en recyclant un exemplaire.', fields: [
    ...RARITY_IDS.map((r) => ({ k: `recycle.${r}`, l: rarityLabel(r), u: paillSym(), int: true })),
    { k: 'recycle.shiny_multiplier', l: 'Multiplicateur brillante', u: '×', int: true, min: 1 },
  ] },
  { g: 'Fabrication', hint: 'Coût pour fabriquer une carte précise. Vide = non fabricable. Mythique et Identité ne se fabriquent jamais.', fields: [
    ...CRAFT_IDS.map((r) => ({ k: `craft.${r}`, l: rarityLabel(r), u: paillSym(), int: true, optional: true })),
    { k: 'craft.shiny_multiplier', l: 'Multiplicateur brillante', u: '×', int: true, min: 1, help: 'Coût d\'une version brillante = coût normal × ce nombre.' },
  ] },
  { g: 'Récompenses', hint: 'Gains en Paillettes liés à l\'activité sur le site.', fields: REWARDS.map(([k, l]) => ({
    k: `rewards.${k}`, l, int: true, min: k === 'streak_max' ? 1 : 0, max: REWARD_MAX[k], help: k === 'citation' ? 'Gain de la personne qui a proposé une citation validée par le Staff « souvenirs » (0 à 500).' : undefined })) },
  { g: 'Quêtes de la semaine', hint: 'Les quêtes sont tirées au sort chaque semaine parmi les modèles actifs (onglet Quêtes).', fields: [
    { k: 'quetes_par_semaine', l: 'Quêtes tirées chaque semaine', int: true, min: 0, max: 20, help: 'Nombre de quêtes proposées aux membres. Si moins de modèles sont actifs, on en propose moins.' },
  ] },
  { g: 'Cartes sauvages (drops)', hint: 'Bornes du formulaire « Lancer un drop » (Cartes › Drops).', fields: [
    { k: 'drops.quantite_max', l: 'Exemplaires maximum par drop', int: true, min: 1, max: 1000, help: 'Plafond du nombre de cartes à attraper pour un même drop (de 1 à 1000 ; 50 par défaut). Le formulaire « Lancer un drop » ne dépasse jamais cette valeur.' },
    { k: 'drops.duree_max_min', l: 'Durée maximale d\'un drop', u: 'minutes', int: true, min: 1, max: 10080, help: '1440 = 24 h. Au-delà, le drop ne peut pas être lancé.' },
    { k: 'drops.duree_defaut_min', l: 'Durée proposée par défaut', u: 'minutes', int: true, min: 1, max: 10080, help: 'Valeur pré-remplie dans le formulaire ; ne peut pas dépasser la durée maximale.' },
  ] },
  // Générations des membres (idée C8, migration 081) : bandeau « OG » ou « 2e gen » sur les cartes, aucune récompense.
  { g: 'Générations des membres', hint: 'Arrivés avant cette date (date d’arrivée, sinon création du compte) : « OG » ; après : « 2e gen ». Habillage seulement, même rareté.', fields: [
    { k: 'generations.og_before', l: 'OG si arrivé avant le', date: true, optional: true, help: 'Vide = 1er septembre 2023.' },
  ] },
  { g: 'Échanges', fields: [
    { k: 'max_open_trades', l: 'Offres en cours maximum par personne', int: true, min: 1, help: 'Nombre d\'offres d\'échange qu\'un membre peut avoir ouvertes en même temps.' },
    { k: 'trade_expiry_days', l: 'Délai d’expiration des offres', u: 'jours', int: true, min: 1, max: 60, help: 'Une offre sans réponse se ferme après ce délai. Un préavis part 24 h avant.' },
  ] },
  // Plafonds de Paillettes (cards.plafonds) : chaque groupe reprend un thème du site. Vide = valeur par défaut (affichée en gris).
  { g: 'Jeux quotidiens', hint: 'Paillettes données une fois par jour et par jeu, dans la limite de ce plafond. Vide = valeur par défaut.', fields: [
    PLAF('framed_gain', 'Framed : partie gagnée', paillSym(), 200), PLAF('framed_consolation', 'Framed : partie perdue', paillSym(), 200),
    PLAF('heardle_gain', 'Heardle : partie gagnée', paillSym(), 200), PLAF('heardle_consolation', 'Heardle : partie perdue', paillSym(), 200),
    PLAF('sutom_trouve', 'Sutom : mot trouvé', paillSym(), 100), PLAF('sutom_perdu', 'Sutom : mot non trouvé', paillSym(), 100),
    PLAF('jeu_du_jour_gain', 'Autres jeux quotidiens : Paillettes par jeu déclaré', paillSym(), 50),
    PLAF('jeux_du_jour', 'Autres jeux quotidiens : jeux payés par jour', 'jeux', 10),
  ] },
  { g: 'Quiz et citations', hint: 'Bonus de la question du jour, paliers des séries de réponses, et limites des citations « Qui a dit ça ? ».', fields: [
    PLAF('quiz_jour', 'Question du jour : bonus', paillSym(), 100),
    PLAF('quiz_serie_7', 'Série de 7 bonnes réponses : palier', paillSym()),
    PLAF('quiz_serie_30', 'Série de 30 jours : palier', paillSym()),
    PLAF('quiz_serie_100', 'Série de 100 jours : palier', paillSym()),
    PLAF('citations_jour', 'Citations proposées par membre et par jour', '', 20),
    PLAF('citations_semaine', 'Citations validées récompensées par membre et par semaine', '', 100),
  ] },
  { g: 'Photos et sorties', hint: 'Paillettes données pour une publication, dans la limite de ces plafonds par membre. Au-delà, la publication reste possible, sans Paillettes.', fields: [
    PLAF('photos_jour', 'Photos payées par jour', ''), PLAF('souvenirs_jour', 'Souvenirs payés par jour', ''),
    PLAF('sorties_semaine', 'Sorties créées payées par semaine', ''), PLAF('reponses_semaine', 'Réponses « oui » payées par semaine', ''),
    PLAF('presences_semaine', 'Présences payées par semaine', ''),
  ] },
  { g: 'Limites de publication', hint: 'Plafonds de sécurité : au-delà, le site refuse la publication. Aucune Paillettes en jeu.', fields: [
    PLAF('photos_max_jour', 'Photos publiées par jour', ''), PLAF('souvenirs_max_jour', 'Souvenirs publiés par jour', ''),
    PLAF('sorties_max_jour', 'Sorties créées par jour', ''), PLAF('idees_max_jour', 'Idées envoyées par jour', ''),
    PLAF('playlist_jour', 'Morceaux partagés par jour', ''),
  ] },
  { g: 'Codes cadeaux et badges', fields: [
    PLAF('code_paillettes', 'Paillettes maximum par code cadeau', paillSym()),
    PLAF('badges_manuels_jour', 'Badges attribués à la main par jour (Staff)', '', 100),
  ] },
  { g: 'Calendrier de l’Avent', hint: 'Budget mensuel de Paillettes du calendrier (affiché comme « budget conseillé » dans Saisons › Avent).', fields: [
    PLAF('avent_mois', 'Budget mensuel de Paillettes', paillSym()),
  ] },
  { g: 'Arène actuelle', hint: 'Mêmes plafonds que dans Jeux et cartes › Arène actuelle : un seul réglage, partagé par les deux écrans.', fields: [
    PLAF('bataille_gain', 'Paillettes par victoire en attaque', paillSym(), 100),
    PLAF('batailles_jour', 'Victoires payées par jour', '', 20),
    PLAF('defense_gain', 'Paillettes quand la défense tient', paillSym(), 100),
    PLAF('defenses_jour', 'Défenses payées par jour', '', 20),
    PLAF('bataille_meme_adversaire', 'Attaques par jour contre un même membre', '', 10, 1),
    PLAF('batailles_max_jour', 'Batailles par jour au plus (toutes)', '', 100, 1),
  ] },
  // A7 : seuils du bloc « Santé de l'économie » (Pilotage › Vue d'ensemble), bornés aussi par hg_eco_health.
  { g: 'Alertes économie', hint: 'Seuils des alertes du bloc « Santé de l’économie » (Pilotage › Vue d’ensemble).', fields: [
    { k: 'alertes.paillettes_pct', l: 'Hausse des Paillettes en 7 jours', u: '%', int: true, min: 5, max: 500, help: 'Alerte au-delà (25 % par défaut).' },
    { k: 'alertes.recyclage_pct', l: 'Taux de recyclage de la semaine', u: '%', int: true, min: 10, max: 100, help: 'Cartes recyclées / cartes obtenues ; alerte au-delà (60 % par défaut).' },
    { k: 'alertes.booster_pct', l: 'Rendement d’un booster au recyclage', u: '%', int: true, min: 50, max: 200, help: 'Valeur moyenne au recyclage / prix ; alerte rouge au-delà (100 % par défaut).' },
    { k: 'alertes.concentration_x', l: 'Gains concentrés', u: '× la médiane', step: 0.5, min: 2, max: 50, help: 'Gains de la semaine d’un membre / médiane ; alerte au-delà (5 par défaut).' },
  ] },
];
