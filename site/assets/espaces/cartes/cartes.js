// ===== Cartes à collectionner — page joueur =====
// RPC : hg_cards_me, hg_cards_daily, hg_open_booster_req, hg_card_recycle, hg_card_craft, hg_card_leaderboard,
// hg_serie_manquantes (migration 209 : « Il te manque N cartes », lue seulement pour une série choisie à 1-5 cartes de la fin).
// Boosters typés (migration 069, SPEC booster-system) : hg_booster_types_me (types, stocks, limites), hg_booster_buy (p_type, p_qty : achat mis en stock),
// hg_booster_open (p_type, p_mode stock|gratuit, p_set pour la série), hg_booster_gift (p_type : don à un membre), hg_booster_gifts_me (dons envoyés et reçus), hg_members.
// Règle de conception : la Boutique n'achète que des boosters (ils vont dans l'inventaire) ; on les ouvre dans l'onglet Ouverture (un seul, ou plusieurs d'un coup).
// Sans hg_booster_types_me (migration pas encore déployée), la page garde l'ancien mode : un seul booster classique et un stock générique (repli, voir typed()).
// Lecture : hg_card_sets, hg_cards, hg_card_copies, hg_card_wishlist, hg_wallet_log. Rendu : cartes-ui.js.
// Collection d'un autre membre (lecture seule) : /pages/cartes/cartes.html#collection/<id> ; RPC hg_members pour le pseudo, sa liste de souhaits (« Lui proposer »).
// Paillettes (icône, solde LCD) : paillettes.js. Tout le texte de l'interface est en français ; tout texte venant de la base passe par esc().
// Succès « Pentakill » (F9, migration 101) : hg_pentakill_check après un booster de 5 cartes ; bannière (cartes-pentakill.js).
// Fichier de la page /pages/cartes/cartes.html : il n'exporte rien. boot() (en bas) lance la page.
// Plan : données, squelette, solde, onglets, boosters (cartouches, ouverture, révélation), collection,
// recyclage, fiche détail, collection d'un autre membre, classement, échanges, Arène, historique, événements, démarrage.
// Arène (onglet arene) : le module jeux/arene-v2.js est chargé et monté à la première ouverture de l'onglet (mountArene) ; il affiche l'Arène v2 ou, si elle n'est pas ouverte, l'Arène actuelle (jeux/bataille.js).
// La barre d'onglets est masquée (CSS) : la navigation est dans le menu du haut (core/header.js). Les onglets restent la
// mécanique qui affiche le bon panneau, pilotée par l'adresse (/pages/cartes/cartes.html#<onglet>) et par les boutons internes ;
// le titre visible de la section (#cartes-section-h) dit où l'on est.
import { sb, initPage, toast, errMsg, esc, $, fmtDate, avatarHtml, playSound, motionAllowed, effectsEnabled, notify, currentLogo, getPrefs, setPrefs } from '../../commun/core.js';
import { RARITIES, RARITIES_TIRAGE, rarityLabel, rarityRank, FAMILIES, familyLabel, cardHtml, cardBackHtml, fmtP, serialLabel } from './cartes-ui.js';
import { fmtPaillettes, pastilleHtml, lcdSet, lcdDelta, lcdBlink } from '../../commun/paillettes.js';
import { pluralCount } from '../../commun/utils.js';
import { createZoom, ICON_ZOOM, ICON_STAR, TINT as RARITY_TINT } from './cartes-zoom.js';
import { keepPlace, holdHeight } from './cartes-place.js';
import { isOffline, startOfflinePage, saveOffline, cacheCardImages, offlineAllowed, clearOffline, offlineBannerHtml } from '../../commun/offline-store.js'; // Q4 : collection hors ligne
import { openProof, proofCss } from '../accueil/quest-proofs.js';
import { defiHtml, claimDefi } from './cartes-defi.js';
import { boosterStyleClass } from './booster-styles.js';
// Décors des cartouches à thème (booster-themes.js, ≈ 45 Ko) : importés seulement si un type de booster porte un thème
// (cart--theme-…), avant le premier dessin (loadTypes). Sans eux, themeDecor rend null (logo à l'écran) et pas d'animation.
let THEMES = null;
const themeDecor = (cls) => THEMES?.themeDecor(cls) ?? null;
const playOpeningFx = (...args) => THEMES?.playOpeningFx(...args);
/** Importe booster-themes.js si l'un des types en a besoin (une seule fois ; jamais d'erreur). */
async function chargerThemes(types) {
  if (THEMES || !(types || []).some((t) => boosterStyleClass(t?.style).startsWith('cart--theme-'))) return;
  THEMES = await import('./booster-themes.js').catch(() => null);
}
import { onShelf, openNow, saleBadgeHtml, saleLimitHtml, closedBoxHtml, closedRowHtml, discountHtml } from './cartes-saisons.js';
// Succès « Pentakill » (F9, migration 101) : contrôle serveur après un booster de 5 cartes, bannière à la fin de la révélation.
import { pentakillCheck, showPentakill } from './cartes-pentakill.js';
// Idées du gang, paquet C2 (migration 081) : générations OG / 2e gen (C8), regroupement par jeu (C7), codes cadeaux (C9),
// Atelier (C10), enchère (C11). Le tableau « Je cherche / Je donne » (C12) est dans cartes-trades.js.
import { loadGenerations } from './cartes-gen.js';
import { hasTags, tagGroupsHtml, loadTagLabels } from './cartes-jeux.js';
import { initCodes, codeBoxHtml, codeFromHash, openCode } from './cartes-codes.js';
// Atelier (C10), enchère (C11) et propositions (C6) : chargés après le premier affichage (voir le démarrage, en bas).
let atelier = null;
let enchere = null;
import { LOT as COL_LOT, SEUIL as COL_SEUIL, lotsAnticipes, gardeFocus, mesurerGroupes, attrGroupe } from './cartes-lots.js';
import { foldText } from '../../commun/core/recherche-lien.js';
import { refreshCompteurs } from '../../commun/core/badges-compteur.js';

/* ---------- Constantes et outils de formatage ---------- */
// me : profil du membre connecté (initPage vérifie qu'il y a une session membre avant la suite).
// Q4 : sans réseau, la page démarre depuis la copie gardée sur l'appareil (lecture seule, aucune requête).
const OFF = isOffline() ? await startOfflinePage() : null;
const me = OFF ? OFF.me : await initPage({ auth: 'member' });
const app = $('#app');
const nf = new Intl.NumberFormat('fr-CH'); // nombres à la suisse (1'234)
/** Pourcentage à deux décimales maximum, ex. « 12,5 % ». */
const pct = (v) => `${new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 2 }).format(v)} %`;
// Onglets : [identifiant, libellé]. L'ordre est celui du menu (header.js) et des flèches clavier.
const TABS = [['ouverture', 'Ouverture'], ['inventaire', 'Inventaire'], ['boutique', 'Boutique'], ['collection', 'Mes cartes'], ['classement', 'Classement'], ['echanges', 'Échanges'], ['arene', 'Arène']];
// Onglets qui montrent des boosters : redessinés ensemble après une ouverture ou un achat (renderBoosters).
const BOOSTER_TABS = ['ouverture', 'inventaire', 'boutique'];
// Icônes des onglets (SVG décoratifs de la barre d'onglets, masquée sur toutes les tailles d'écran : voir TABS).
const TAB_ICON = {
  ouverture: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  inventaire: '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M3 4h18v4H3zM10 12h4"/>',
  boutique: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v2a2.7 2.7 0 0 1-5.3 0 2.7 2.7 0 0 1-5.4 0A2.7 2.7 0 0 1 4 11z"/><path d="M5.5 13.5V20h13v-6.5"/>',
  collection: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  classement: '<path d="M5 21v-8M12 21V6M19 21v-11"/>',
  echanges: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  arene: '<path d="M5 5l9 9M19 5l-9 9"/><path d="M4 16l4 4M20 16l-4 4"/>',
};
// Libellés des sources d'une carte (colonne source de hg_card_copies).
const SOURCE_LABEL = { booster: 'Booster', cadeau: 'Cadeau', admin: 'Attribuée par le gang', fabrication: 'Fabriquée', evenement: 'Événement', echange: 'Échange', sortie: 'J’y étais', atelier: 'Atelier' };
// Libellés du journal des Paillettes (hg_wallet_log.reason), affichés dans l'historique.
const REASON_LABEL = {
  quotidien: 'Passage du jour', booster: 'Boosters achetés', remboursement: 'Remboursement Collectionneur', booster_don: 'Booster offert', recyclage: 'Recyclage', fabrication: 'Fabrication',
  serie_complete: 'Série complétée', reponse_sortie: 'Réponse à une sortie', presence: 'Présence à une sortie', photo: 'Photo partagée',
  moment: 'Moment culte', badge: 'Badge obtenu', capture: 'Capture d’événement', sortie_creee: 'Sortie créée',
  cadeau_santa: 'Cadeau Secret Santa', echange: 'Échange de cartes', admin: 'Ajustement du gang',
  quete: 'Quête de la semaine', defi: 'Défi du gang', don_admin: 'Don du gang',
  framed: 'Framed du ciné-club', heardle: 'Heardle du gang', bataille: 'Arène de cartes', bataille_def: 'Défense tenue (Arène)',
  cagnotte: 'Cagnotte du gang', cagnotte_remboursee: 'Cagnotte remboursée', cagnotte_annulee: 'Cagnotte annulée', // C13 (migration 082)
  code: 'Code cadeau', atelier: 'Atelier', enchere: 'Offre d’enchère', enchere_remboursee: 'Enchère dépassée (remboursée)',
  enchere_vente: 'Carte vendue aux enchères', // idée 33 (migration 212) : prix moins 10 %
  enchere_lot: 'Lot d’enchère remporté', // migration 215 : Paillettes du lot de l'enchère du Staff
};
// Couleur de lueur de l'écran de console selon la rareté (maquette « cartouche ») : table partagée avec cartes-zoom.js (RARITY_TINT = TINT).
// Tint (couleur d'accent) de la console selon la rareté ; repli sur la couleur de l'identité.
const tintOf = (r) => RARITY_TINT[r] || '#FBD32D';
// Ouverture groupée (onglet Ouverture, « Ouvrir 5 », « Tout ouvrir ») : au-delà de ce nombre de boosters, le résumé remplace la révélation carte à carte ; délai entre deux cartes révélées.
const MULTI_COUNT = 5;
const MULTI_STEP_MS = 110;
// Valeur du sélecteur « Toutes les séries » (Collection) : toutes les séries ouvertes, groupées.
const ALL = '__all__';
/** Enveloppe une fonction de rendu pour qu'elle garde la place de l'utilisateur (défilement de la page et des zones data-keep) et le focus. */
const kept = (fn) => (...args) => keepPlace(() => { const r = fn(...args); restoreFocus(); return r; });
/** Attend un rechargement après une action réussie : un échec ne fait pas échouer l'action (avertissement discret). Ne lève jamais d'erreur. */
async function refreshAfter(reload = refreshData) {
  try { await reload(); } catch (e) { console.warn('[rafraîchissement]', e); toast('Affichage pas à jour : recharge la page'); }
}
/** Vrai si l'erreur signale une fonction absente (migration pas encore déployée) plutôt qu'un échec passager. */
const isMissingFn = (e) => e?.code === 'PGRST202' || /Could not find the function/i.test(String(e?.message || ''));

/**
 * Clé d'un bouton ou champ de la page : son action (et son type), son onglet, ou son identifiant. null si aucune.
 * @param {EventTarget|null} el élément
 * @returns {{action?: string, type?: string|null, tabGo?: string, tab?: string, id?: string}|null}
 */
function keyOf(el) {
  if (!el?.dataset) return null;
  if (el.dataset.action) return { action: el.dataset.action, type: el.dataset.type ?? null };
  if (el.dataset.tabGo) return { tabGo: el.dataset.tabGo };
  if (el.dataset.tab) return { tab: el.dataset.tab };
  return el.id ? { id: el.id } : null;
}
/**
 * Élément de la page correspondant à une clé de keyOf. Pas de sélecteur CSS construit à partir des valeurs (ids, types).
 * @param {object|null} key clé
 * @returns {HTMLElement|null}
 */
function elementOf(key) {
  if (!key) return null;
  if (key.id) return document.getElementById(key.id);
  return [...app.querySelectorAll('[data-action],[data-tab],[data-tab-go]')].find((el) => {
    if (key.action) return el.dataset.action === key.action && (el.dataset.type ?? null) === (key.type ?? null);
    if (key.tabGo) return el.dataset.tabGo === key.tabGo;
    return el.dataset.tab === key.tab;
  }) || null;
}
/**
 * Rend le focus après un redessin. Si le focus est perdu (élément remplacé, ou désactivé pendant une action) et qu'il était
 * sur un bouton ou un champ de la page (S.focusHint), il revient à l'élément de même data-action (et data-type) s'il existe
 * et n'est pas désactivé ; sinon à fallback() (cible propre à l'action, ex. la zone de révélation). Ne touche jamais au
 * focus placé hors de la page ni sur un élément actif.
 * @param {() => HTMLElement|null} [fallback] cible de repli
 */
function restoreFocus(fallback = null) {
  const a = document.activeElement;
  if (a && a !== document.body && (!app.contains(a) || !a.disabled)) return;
  const el = elementOf(S.focusHint);
  const target = el && !el.disabled ? el : (fallback?.() ?? null);
  if (target && !target.disabled) target.focus({ preventScroll: true });
}

/* ---------- État de la page ----------
   S regroupe tout l'état : données chargées (sets, cards, copies, state), onglet et filtres, ouverture en cours
   (reveal, busy), collection d'un membre (peer), échanges (tradeApi). */
const S = {
  state: null, sets: [], cards: [], cardsById: new Map(),
  otherSets: new Map(), // séries fermées ou pas encore ouvertes dont un membre possède des cartes (drops, dons…)
  copies: [], wish: new Set(), favs: new Set(), favBusy: false, log: [],
  uniqueTaken: null, // cartes uniques : Map id -> exemplaires déjà attribués (null = inconnu)
  tab: 'ouverture', setId: ALL, filters: { rarity: '', family: '', type: '', vues: new Set(), group: '', q: '' }, jeuOpen: null, filtresOuverts: false,
  // Collection très longue (idée Q5) : nombre de cartes dessinées (lot affiché), remis à zéro à chaque changement de filtre.
  colLimit: 0,
  reveal: null, busy: false, detailId: null, tradesMounted: false,
  // Ouverture groupée en cours ou interrompue (voir openStockMulti) : type, série, identifiants des demandes, avancement ; null sinon.
  x5: null,
  lcdShown: null, lcdAnim: false, quests: null, shownIds: [], zoomIds: null,
  peer: null, returnY: 0, tradeApi: null, tradesReady: null,
  // Boosters en stock : quantité choisie pour l'achat (Boutique), demande en cours (identifiant stable pour ne pas payer deux fois),
  // dernier achat réussi (lien « Les ouvrir » sous l'article, { id } du type ; null sinon).
  buyQty: 1, buyReq: null, bought: null,
  // Dons de boosters (Inventaire) : valeurs du formulaire (type = identifiant du type de booster), confirmation affichée, liste des dons et des membres (null = pas encore chargé).
  giftForm: { to: '', qty: 1, msg: '', type: '' }, giftConfirm: false, gifts: null, members: null,
  giftReq: null, // demande de don en cours (identifiant stable tant que le don n'a pas abouti, voir giftConfirm)
  // Boosters typés : types et stocks du membre (hg_booster_types_me, null = repli), fin de la semaine, quantités par type (sauf classique : buyQty).
  // typesErr : dernier chargement en échec passager (réseau…) ; sans fonction absente, c'est le repli (typed() faux).
  types: null, weekEndsAt: null, typeQty: {}, typesErr: false,
  // Dernier bouton ou champ de la page qui a eu le focus (son action, son type ou son id) : rendu après un redessin (restoreFocus).
  focusHint: null,
  // Choix de la série avant l'ouverture d'un booster « Série » : { from (bouton d'origine), onPick (reçoit l'identifiant de la série) }.
  seriePick: null,
  // Q4 : page dessinée depuis la copie hors ligne (lecture seule : seule la collection est consultable).
  offline: !!OFF,
};
/** Configuration du jeu (tarifs, taux, durées) renvoyée par hg_cards_me. Vide avant le premier chargement. */
const cfg = () => S.state?.config || {};
/** Vrai pour un admin en mode sans limite (pas de coûts ni de délais). */
const isGod = () => !!S.state?.god;
/** Solde en Paillettes. */
const bal = () => Number(S.state?.paillettes ?? 0);
/** Vrai si une série a commencé (ou n'a pas de date de début). */
const started = (s) => !s.starts_at || new Date(s.starts_at) <= new Date();

/* ---------- Boosters typés : interrupteur et lectures ---------- */
// Vrai quand hg_booster_types_me a répondu : la page affiche les 9 types. Sinon (migration pas encore déployée),
// elle garde l'ancien mode (un booster classique, stock générique, hg_open_booster_req, hg_booster_buy sans p_type).
const typed = () => Array.isArray(S.types) && S.types.length > 0;
/** Vrai quand les types n'ont pas pu être chargés pour une raison passagère (ni types ni repli : la Boutique l'indique). */
const typesDown = () => !typed() && S.typesErr;
/** Type de booster d'après son identifiant (null en mode repli ou si le type est inconnu). */
const typeOf = (id) => (typed() ? S.types.find((t) => t.id === id) || null : null);
/**
 * Type du booster gratuit du jour : le serveur marque free_daily le type du jour (celui du thème, sinon celui réglé
 * « gratuit chaque jour » dans l'admin ; migration 162). Il peut être hors vente (free_only) : il reste ouvrable, mais
 * la Boutique ne le montre pas (onShelf). Sinon le Classique.
 */
const freeType = () => (typed() ? S.types.find((t) => t.free_daily) || typeOf('classique') : null);
/** Vrai si un type se donne à un membre : les boosters Collectionneur (pool « manquantes ») ne s'offrent pas. */
const giftable = (t) => t.pool !== 'manquantes';
/** Types dont le membre a du stock, dans l'ordre d'affichage (vide en mode repli). */
const stockedTypes = () => (typed() ? S.types.filter((t) => Number(t.stock) > 0) : []);
/** Nombre de boosters en stock pour un type (mode repli : seul le classique a un stock, le générique). */
const stockOf = (id) => (typed() ? Math.max(0, Number(typeOf(id)?.stock) || 0) : (id === 'classique' ? giftCount() : 0));
/** Nombre total de boosters en stock, tous types confondus. */
const stockTotal = () => (typed() ? S.types.reduce((a, t) => a + Math.max(0, Number(t.stock) || 0), 0) : giftCount());
/** Quantité choisie pour l'achat en stock d'un type (le classique garde S.buyQty, comme avant). */
const qtyFor = (id) => (id === 'classique' ? S.buyQty : (S.typeQty[id] || 1));
/** Identifiant du sélecteur de quantité d'un type (« shop-qty » pour le classique, comme avant). */
const qtySelId = (id) => (id === 'classique' ? 'shop-qty' : `shop-qty-${id}`);

/**
 * Charge les cartes possédées hors des séries ouvertes (série fermée, ou pas encore ouverte : drop, don de l'admin…)
 * et leurs séries, pour qu'elles apparaissent dans la collection.
 * @param {Iterable<string>} cardIds identifiants des cartes possédées
 * @returns {Promise<void>} lève la première erreur de lecture
 */
async function loadOwnedOutside(cardIds) {
  const missing = [...new Set(cardIds)].filter((id) => !S.cardsById.has(id));
  for (let i = 0; i < missing.length; i += 150) {
    const r = await sb.from('hg_cards').select('*').in('id', missing.slice(i, i + 150));
    if (r.error) throw r.error;
    for (const c of r.data || []) S.cardsById.set(c.id, c);
  }
  const open = new Set(S.sets.map((x) => x.id));
  const need = [...new Set([...new Set(cardIds)].map((id) => S.cardsById.get(id)?.set_id).filter((id) => id && !open.has(id) && !S.otherSets.has(id)))];
  if (!need.length) return;
  const r = await sb.from('hg_card_sets').select('*').in('id', need);
  if (r.error) throw r.error;
  for (const st of r.data || []) S.otherSets.set(st.id, st);
}

/**
 * Groupes « hors série ouverte » : une entrée par série fermée ou pas encore ouverte où le membre possède des cartes.
 * Seules les cartes possédées sont montrées ; ces groupes ne comptent pas dans la progression.
 * @param {(cardId: string) => object[]} copiesFn exemplaires possédés d'une carte
 * @param {(card: object) => boolean} keepFn filtres de la collection
 * @returns {Array<{set: object, scored: number, have: number, shown: object[], extra: true, owned: number}>}
 */
function outsideGroups(copiesFn, keepFn) {
  const open = new Set(S.sets.map((x) => x.id));
  const bySet = new Map();
  for (const c of S.cardsById.values()) {
    if (open.has(c.set_id) || !S.otherSets.has(c.set_id) || !copiesFn(c.id).length) continue;
    if (!bySet.has(c.set_id)) bySet.set(c.set_id, []);
    bySet.get(c.set_id).push(c);
  }
  return [...bySet.entries()]
    .map(([id, cards]) => ({ set: S.otherSets.get(id), cards: cards.sort((a, b) => (a.number ?? 0) - (b.number ?? 0)) }))
    .sort((a, b) => (a.set.sort ?? 0) - (b.set.sort ?? 0))
    .map(({ set, cards }) => ({ set, scored: 0, have: 0, owned: cards.length, shown: cards.filter(keepFn), extra: true }));
}
/** En-tête d'un groupe « hors série ouverte » (pas de barre de progression : la série n'est pas ouverte). */
const outsideHead = (g, hid) => `<div class="cz-group-head">
      <h2 class="cz-group-title" id="${hid}">${esc(g.set.name)}</h2>
      <p class="cz-group-count">${nf.format(g.owned)} carte${g.owned > 1 ? 's' : ''} possédée${g.owned > 1 ? 's' : ''} · série pas ouverte</p>
    </div>
    <p class="muted small">Cartes obtenues hors des boosters (drop, don…) : la série n'est pas ouverte, elles ne comptent pas dans la progression.</p>`;
/**
 * Index carte → exemplaires de l'utilisateur (idée Q5). Recalculé seulement quand S.copies change
 * (nouveau tableau après un rechargement, ou longueur différente) : ouverture, recyclage, échange.
 */
const copyIndex = { src: null, len: -1, map: new Map() };
/** Liste vide partagée (jamais modifiée) pour une carte sans exemplaire. */
const NO_COPIES = Object.freeze([]);
/**
 * Exemplaires de l'utilisateur pour une carte (lecture par l'index : le coût ne grimpe plus avec cartes × exemplaires).
 * @param {string} cardId identifiant de la carte
 * @returns {object[]} exemplaires (ne pas modifier le tableau renvoyé)
 */
const copiesOf = (cardId) => {
  const list = S.copies || NO_COPIES;
  if (copyIndex.src !== list || copyIndex.len !== list.length) {
    const map = new Map();
    for (const cp of list) {
      const a = map.get(cp.card_id);
      if (a) a.push(cp); else map.set(cp.card_id, [cp]);
    }
    copyIndex.src = list; copyIndex.len = list.length; copyIndex.map = map;
  }
  return copyIndex.map.get(cardId) || NO_COPIES;
};

/* ---------- Collection très longue (idée Q5) : dessin par lots ----------
   COL_LOT et COL_SEUIL viennent de cartes-lots.js (partagés avec le sélecteur d'échange). */
/** Noms des cartes sans accents ni majuscules, pour la recherche (calculés une fois par carte). */
const foldedNames = new Map();
/**
 * Vrai si la carte correspond à la recherche (comparaison sans accents, comme la recherche du site).
 * @param {object} c carte
 * @param {string} q recherche déjà repliée (foldText)
 * @returns {boolean}
 */
function matchQuery(c, q) {
  if (!q) return true;
  let n = foldedNames.get(c.id);
  if (n === undefined) { n = foldText(`${c.name ?? ''} ${c.number ?? ''}`); foldedNames.set(c.id, n); }
  return n.includes(q);
}
/**
 * Coupe les groupes au lot affiché : au-delà de COL_SEUIL cartes, seules les `limit` premières sont dessinées.
 * Les compteurs des groupes (possédées / total) restent ceux de toute la série.
 * @param {object[]} groups groupes avec leurs cartes affichées (shown)
 * @param {number} limit nombre de cartes à dessiner (0 = un lot)
 * @returns {{groups: object[], drawn: number, total: number, batched: boolean}}
 */
function sliceGroups(groups, limit) {
  const total = groups.reduce((a, g) => a + g.shown.length, 0);
  if (total <= COL_SEUIL) return { groups, drawn: total, total, batched: false };
  let left = Math.max(COL_LOT, limit || 0);
  const out = [];
  for (const g of groups) {
    if (left <= 0) break;
    out.push(g.shown.length <= left ? g : { ...g, shown: g.shown.slice(0, left) });
    left -= g.shown.length;
  }
  const drawn = Math.min(total, Math.max(COL_LOT, limit || 0));
  return { groups: out, drawn, total, batched: true };
}
/**
 * Pied de la grille quand elle est dessinée par lots : « 120 cartes affichées sur 842 », barre et « Afficher 120 de plus ».
 * Le bouton se déclenche aussi tout seul en approchant du bas (sentinelle surveillée, voir lotsCol et lotsPeer).
 * @param {{drawn: number, total: number, batched: boolean}} sl découpage
 * @param {'col'|'peer'} which collection concernée
 * @returns {string} HTML (vide si tout est dessiné)
 */
function moreHtml(sl, which) {
  if (!sl.batched) return '';
  const rest = sl.total - sl.drawn;
  const pctShown = Math.round(sl.drawn / sl.total * 100);
  return `<div class="cz-more">
      <p class="cz-more-count" role="status"><strong>${pluralCount(sl.drawn, 'carte affichée', 'cartes affichées', nf.format)}</strong> sur ${nf.format(sl.total)}</p>
      <div class="progress cz-more-bar" aria-hidden="true"><span style="width:${pctShown}%"></span></div>
      ${rest > 0 ? `<button type="button" class="btn btn-ghost cz-more-btn" data-action="more-cards" data-which="${which}">+ Afficher ${nf.format(Math.min(COL_LOT, rest))} de plus</button>
      <p class="muted small">Se déclenche aussi tout seul en approchant du bas.</p>
      <div class="cz-sentinel" data-sentinel="${which}" aria-hidden="true"></div>` : ''}
    </div>`;
}
/* Chargement anticipé (cartes-lots.js) : le lot suivant arrive quand il reste ~1,5 écran à défiler, un lot par image,
   sans déplacer le focus ni le défilement. Le remplissage de l'écran est assuré par planifier() après chaque dessin. */
const lotsCol = lotsAnticipes({
  sentinelle: () => document.querySelector('#cartes-p-collection [data-sentinel="col"]'),
  charger: () => showMore('col', false),
});
const lotsPeer = lotsAnticipes({
  sentinelle: () => document.querySelector('#cartes-peer [data-sentinel="peer"]'),
  charger: () => showMore('peer', false),
});
/**
 * Dessine le lot suivant de la collection (la sienne ou celle d'un membre).
 * @param {'col'|'peer'} which collection concernée
 * @param {boolean} [byButton=true] true si on a cliqué « Afficher plus » : le focus va sur la première carte ajoutée ;
 *   false pour le chargement anticipé, qui garde le focus et le défilement tels quels
 * @returns {boolean} true si un lot a été dessiné
 */
function showMore(which, byButton = true) {
  const peer = which === 'peer';
  if (peer && !S.peer) return false;
  const ids = peer ? S.peer.shownIds : S.shownIds;
  const before = Math.max(COL_LOT, (peer ? S.peer.limit : S.colLimit) || 0);
  if (before >= ids.length) return false;
  if (peer) S.peer.limit = before + COL_LOT; else S.colLimit = before + COL_LOT;
  const first = ids[before];
  const sel = first ? `[data-action="${peer ? 'peer-pick' : 'open-card'}"][data-card="${CSS.escape(first)}"], [data-action="${peer ? 'peer-zoom' : 'zoom-card'}"][data-card="${CSS.escape(first)}"]` : null;
  if (peer) {
    const root = $('#cartes-peer');
    if (byButton) renderPeer(sel);
    else gardeFocus(root, () => renderPeer(null));
  } else {
    if (byButton) {
      renderCollection();
      if (sel) document.querySelector(`#cartes-p-collection :is(${sel})`)?.focus({ preventScroll: true });
    } else gardeFocus(document.getElementById('cartes-p-collection'), () => renderCollection());
  }
  return true;
}
/** En-tête explicatif de la série « Hors série » (cartes uniques). */
const HORS_SERIE_NOTE = '<p class="cartes-hs-note">Cartes uniques : hors boosters, en nombre limité (exemplaires numérotés), à gagner lors d\'un événement ou offertes par l\'admin.</p>';
/**
 * Mention d'une carte unique qu'on ne possède pas, si on le sait : « Déjà attribuée » (un seul exemplaire),
 * « Pas encore attribuée », « n / max exemplaires attribués », ou « Tous les exemplaires sont attribués ».
 * @param {object} c carte
 * @returns {string} mention, ou chaîne vide si la carte n'est pas unique, est possédée, ou si l'info est inconnue
 */
const uniqueStateOf = (c) => {
  if (c.rarity !== 'unique' || copiesOf(c.id).length || !S.uniqueTaken) return '';
  const max = Number(c.max_copies) || 1;
  const pris = S.uniqueTaken.get(c.id) || 0;
  if (max <= 1) return pris ? 'Déjà attribuée' : 'Pas encore attribuée';
  if (pris >= max) return 'Tous les exemplaires sont attribués';
  return pris ? `${pris} / ${max} exemplaires attribués` : 'Pas encore attribuée';
};
/** Valeur d'une table de réglages pour une rareté (ex. craft.rare), ou null si absente. */
const tableVal = (table, rarity) => { const v = cfg()[table]?.[rarity]; return v == null ? null : Number(v); };
/**
 * Durée lisible : « 3 h 05 min » ou « 12 min » (au moins 1 min).
 * @param {number} ms durée en millisecondes
 */
const fmtDuration = (ms) => {
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${Math.max(1, m)} min`;
};
/** Vrai pendant une action en cours (appel réseau ou séquence d'ouverture) : les boutons restent désactivés. */
const isBusy = () => S.offline || S.busy || !!(S.reveal && S.reveal.phase === 'seq');
/** Nom de la série affichée dans la cartouche (la plus récente à défaut). */
const seriesName = () => S.sets.find((s) => s.id === S.setId)?.name || S.sets.at(-1)?.name || 'Le Gang · Série 1';
// Une seule fenêtre de carte agrandie : elle suit la vue affichée (collection ou collection d'un membre).
// S.zoomIds, si fixé le temps d'un appel à zoom.open, remplace cette liste (cartes d'un booster, voir openBoosterZoom).
const zoom = createZoom({ ids: () => S.zoomIds || (S.peer ? S.peer.shownIds : S.shownIds), info: (id) => (S.peer ? peerZoomInfo(id) : zoomInfo(id)), fav: { toggle: (id) => toggleFav(id) } });

/* ---------- Données ---------- */
/**
 * Lit toutes les lignes d'une requête (l'API renvoie au plus 1000 lignes par appel). Continue tant qu'une page est pleine.
 * @param {() => object} build fonction qui renvoie une nouvelle requête
 * @param {number} [page] taille d'une page
 * @returns {Promise<object[]>}
 */
async function fetchAllRows(build, page = 1000) {
  const out = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await build().range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < page) return out;
  }
}

/* ---------- Chargement des données ---------- */
/**
 * Charge les séries ouvertes (dont la date de début est passée) et leurs cartes actives.
 * Seules les cartes des séries ouvertes sont lues ; les autres sont chargées plus tard si on les possède.
 * @returns {Promise<void>} lève une erreur si la lecture des séries échoue
 */
async function loadStatic() {
  const sets = await sb.from('hg_card_sets').select('*').eq('active', true).order('sort');
  if (sets.error) throw sets.error;
  S.sets = (sets.data || []).filter(started);
  // Seulement les cartes des séries ouvertes (il y en a des milliers au total), en lisant toutes les pages
  const setIds = S.sets.map((x) => x.id);
  S.cards = setIds.length
    ? await fetchAllRows(() => sb.from('hg_cards').select('*').eq('active', true).in('set_id', setIds).order('number').order('id'))
    : [];
  S.cardsById = new Map(S.cards.map((c) => [c.id, c]));
  // Cartes uniques : combien d'exemplaires sont déjà attribués (une lecture légère). En cas d'échec, rien n'est affiché.
  const uniqueIds = S.cards.filter((c) => c.rarity === 'unique').map((c) => c.id);
  S.uniqueTaken = null;
  if (uniqueIds.length) {
    const taken = await sb.from('hg_card_copies').select('card_id, serial').in('card_id', uniqueIds).is('recycled_at', null);
    if (!taken.error) {
      const plusGrand = new Map(), nombre = new Map();
      for (const x of taken.data || []) {
        nombre.set(x.card_id, (nombre.get(x.card_id) || 0) + 1);
        plusGrand.set(x.card_id, Math.max(plusGrand.get(x.card_id) || 0, Number(x.serial) || 0));
      }
      S.uniqueTaken = new Map(uniqueIds.map((id) => [id, Math.max(nombre.get(id) || 0, plusGrand.get(id) || 0)]));
    }
  }
  if (S.setId !== ALL && !S.sets.some((s) => s.id === S.setId) && !S.otherSets.has(S.setId)) S.setId = ALL;
}

/**
 * Charge les types de boosters, leurs stocks et leurs limites de la semaine (hg_booster_types_me).
 * Ne lève jamais d'erreur. Trois cas :
 * - fonction absente (PGRST202 : migration 069 pas déployée) : S.types vide, repli (voir typed()) ;
 * - échec passager (réseau…) : on garde les types déjà chargés, un avertissement discret, et un seul nouvel essai après 3 s ;
 * - réussite : les types remplacent les précédents.
 * @param {boolean} [retry=true] vrai pour programmer le nouvel essai unique
 * @returns {Promise<void>}
 */
async function loadTypes(retry = true) {
  try {
    const { data, error } = await sb.rpc('hg_booster_types_me');
    if (error) throw error;
    const list = Array.isArray(data?.types) ? data.types : [];
    S.types = list.length ? [...list].sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0)) : null;
    await chargerThemes(S.types);
    S.weekEndsAt = data?.week_ends_at ?? null;
    S.typesErr = false;
  } catch (e) {
    console.warn('[types]', e);
    if (isMissingFn(e)) {
      S.types = null;
      S.typesErr = false;
      return;
    }
    S.typesErr = true; // S.types garde la liste précédente, s'il y en a une
    if (retry) {
      toast('Boosters : liste pas à jour, nouvel essai dans quelques secondes');
      setTimeout(async () => {
        await loadTypes(false);
        if (!isBusy()) renderAll();
      }, 3000);
    }
  }
}

/**
 * Recharge l'état du membre : solde et configuration (hg_cards_me), ses exemplaires non recyclés,
 * sa liste de souhaits et le journal des Paillettes. Les cartes qu'il possède mais qui ne sont
 * pas dans une série ouverte sont chargées en plus.
 * @returns {Promise<void>} lève la première erreur rencontrée
 */
async function refreshData() {
  // Les quatre lectures partent en parallèle ; une erreur sur l'une d'elles fait échouer le tout (voir plus bas).
  const [st, cp, wi, lg, , fv] = await Promise.all([
    sb.rpc('hg_cards_me'),
    fetchAllRows(() => sb.from('hg_card_copies').select('id,card_id,owner_id,shiny,serial,source,obtained_at,locked_trade,finish').eq('owner_id', me.id).is('recycled_at', null).order('obtained_at').order('id'))
      .then((data) => ({ data, error: null }), (error) => ({ data: null, error })),
    sb.from('hg_card_wishlist').select('card_id').eq('user_id', me.id),
    sb.from('hg_wallet_log').select('delta,reason,created_at').eq('user_id', me.id).neq('reason', 'booster_requete').order('created_at', { ascending: false }).limit(30),
    loadTypes(), // types de boosters et stocks (ne lève jamais d'erreur : sans elle, la page garde l'ancien mode)
    sb.from('hg_card_favorites').select('card_id').eq('user_id', me.id), // favoris (migration 078)
  ]);
  for (const r of [st, cp, wi, lg]) if (r.error) throw r.error;
  S.state = st.data;
  S.copies = cp.data || [];
  // Cartes possédées hors des séries ouvertes (série fermée, ou pas encore ouverte : drop, don…) : cartes et séries
  await loadOwnedOutside(S.copies.map((c) => c.card_id));
  S.wish = new Set((wi.data || []).map((w) => w.card_id));
  S.log = lg.data || [];
  // Favoris : une erreur de lecture les laisse vides plutôt que de bloquer la collection
  S.favs = new Set(fv?.error ? [] : (fv?.data || []).map((x) => x.card_id));
  saveCollectionOffline(); // Q4 : copie à jour à chaque lecture (sans attendre)
  refreshCompteurs(); // pastilles « Ouverture » et « Échanges » à jour après une action (sans attendre la minute)
}

/* ---------- Copie hors ligne (Q4) ---------- */
/**
 * Garde la collection du membre sur l'appareil : séries ouvertes et leurs cartes (pour la progression), séries et
 * cartes possédées hors séries ouvertes, ses exemplaires et son solde affiché. Ne lève jamais d'erreur.
 */
function saveCollectionOffline() {
  if (S.offline) return;
  if (!offlineAllowed()) { clearOffline(); return; }
  const owned = new Set(S.copies.map((c) => c.card_id));
  const outside = [...S.cardsById.values()].filter((c) => owned.has(c.id) && !S.cards.includes(c));
  saveOffline(me, 'cartes', {
    sets: S.sets, otherSets: [...S.otherSets.values()], cards: [...S.cards, ...outside],
    copies: S.copies.map(({ id, card_id, shiny, serial, source, obtained_at }) => ({ id, card_id, shiny, serial, source, obtained_at })),
    paillettes: bal(),
  });
}
/** Garde les images des cartes possédées pour l'affichage hors ligne (après le premier rendu, sans le ralentir). */
function cacheOwnedImages() {
  if (S.offline) return;
  const owned = new Set(S.copies.map((c) => c.card_id));
  const urls = [...owned].map((id) => S.cardsById.get(id)?.image_url).filter(Boolean);
  const run = () => cacheCardImages(urls);
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 5000 }); else setTimeout(run, 2000);
}

/* ---------- Squelette ---------- */
/**
 * HTML de la page : en-tête, onglets, panneaux (un par onglet), fiche membre, historique et deux fenêtres
 * (détail d'une carte, recyclage de masse). Le contenu des panneaux est rempli ensuite par les fonctions de rendu.
 * @returns {string}
 */
function skeleton() {
  return `
    <section class="page-head cartes-head">
      <div>
        <p class="eyebrow">Jeu de cartes</p>
        <h1 class="page-title">Cartes</h1>
      </div>
      <div class="cartes-wallet" id="cartes-wallet" aria-live="polite"></div>
    </section>
    <div class="pot-slot" id="cartes-pot" hidden></div>
    <nav class="cartes-tabs" id="cartes-tablist" role="tablist" aria-label="Sections du jeu">
      ${TABS.map(([id, label], i) => `<button type="button" role="tab" id="cartes-tab-${id}" class="cartes-tab" data-tab="${id}" data-cpt="cartes.${id}"
        aria-selected="${i === 0}" aria-controls="cartes-p-${id}" tabindex="${i === 0 ? 0 : -1}"><svg class="cartes-tab-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${TAB_ICON[id]}</svg>${label}</button>`).join('')}
    </nav>
    <div class="cartes-section-sel" id="cartes-section-wrap">
      <label for="cartes-section-sel">Section</label>
      <select id="cartes-section-sel" data-section>${TABS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select>
    </div>
    <h2 class="cartes-section-h" id="cartes-section-h" tabindex="-1"></h2>
    ${TABS.map(([id]) => `<section role="tabpanel" id="cartes-p-${id}" class="cartes-panel" aria-labelledby="cartes-tab-${id}" ${id === 'ouverture' ? '' : 'hidden'}>${id === 'echanges' ? '<div id="cartes-trades"></div>' : ''}</section>`).join('')}
    <section class="cartes-peer" id="cartes-peer" hidden></section>
    <p id="cartes-live" class="visually-hidden" aria-live="polite"></p>

    <dialog id="cartes-detail" class="cartes-dialog" aria-labelledby="cartes-detail-title">
      <button type="button" class="cartes-close" data-action="close-dialog" aria-label="Fermer"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <div class="cartes-dialog-body">
        <div class="cartes-big" id="cartes-detail-card"></div>
        <div id="cartes-detail-info"></div>
      </div>
    </dialog>
    <dialog id="cartes-serie-pick" class="cartes-dialog" aria-labelledby="cartes-serie-title">
      <div class="cartes-dialog-pad">
        <h2 id="cartes-serie-title">Quelle série ?</h2>
        <p class="muted small">Le booster ne contiendra que des cartes de la série choisie.</p>
        <fieldset class="serie-pick">
          <legend class="visually-hidden">Série du booster</legend>
          <div id="cartes-serie-list"></div>
        </fieldset>
        <div class="btn-row">
          <button type="button" class="btn btn-ghost" data-action="close-dialog">Annuler</button>
          <button type="button" class="btn btn-primary" data-action="serie-confirm">Ouvrir</button>
        </div>
      </div>
    </dialog>`;
}

/* ---------- En-tête : solde en pastille LCD ---------- */
/** Dessine l'en-tête : solde (pastille LCD), passage du jour, série de jours. */
function renderHeader() {
  const el = $('#cartes-wallet');
  if (!el || !S.state) return;
  if (S.offline) { el.innerHTML = pastilleHtml(bal(), { size: 'lg', id: 'cartes-lcd' }); return; } // Q4 : solde de la copie, sans action
  const s = S.state;
  // Le solde affiché suit les gains par paliers (animateBalance) ; une dépense s'affiche tout de suite.
  if (S.lcdShown == null || bal() < S.lcdShown) S.lcdShown = bal();
  const daily = tableVal('rewards', 'daily') ?? 20;
  el.innerHTML = `
    ${pastilleHtml(S.lcdShown, { size: 'lg', id: 'cartes-lcd' })}
    ${isGod() ? '<span class="pill pill-current">Mode sans limite</span>' : ''}
    ${s.daily_available
      ? `<button type="button" class="btn btn-sand" data-action="daily"><span>Passage du jour (+${fmtPaillettes(daily)})</span></button>
         <span class="cartes-small">Série actuelle : ${nf.format(s.daily_streak)} j</span>`
      : `<span class="pill pill-ok">Passage du jour pris · série de ${nf.format(s.daily_streak)} j</span>`}`;
  if (S.lcdShown < bal() && !S.lcdAnim) animateBalance();
}

/**
 * Anime le solde après un gain : le compteur saute par paliers (4 au plus), chaque palier fait clignoter
 * les segments et affiche +N. Sans mouvement (préférence d'accessibilité), le solde change d'un coup.
 */
function animateBalance() {
  const to = bal();
  const from = S.lcdShown;
  if (!motionAllowed() || to <= from) { S.lcdShown = to; lcdSet($('#cartes-lcd'), to); return; }
  S.lcdAnim = true;
  const gain = to - from;
  const steps = Math.min(4, gain);
  let k = 0;
  /** Un palier du compteur : fait avancer le solde affiché, clignote les segments, puis programme le palier suivant. */
  const tick = () => {
    k += 1;
    const v = k >= steps ? to : from + Math.round(gain * k / steps);
    const cur = $('#cartes-lcd');
    lcdDelta(cur, v - S.lcdShown);
    lcdBlink(cur);
    setTimeout(() => { S.lcdShown = v; lcdSet($('#cartes-lcd'), v); }, 240);
    if (k < steps) setTimeout(tick, 640);
    else setTimeout(() => {
      S.lcdAnim = false;
      if (bal() > S.lcdShown) animateBalance();
    }, 420);
  };
  tick();
}

/* ---------- Onglets et vues ---------- */
/** Met à jour l'état ARIA des onglets (sélectionné ou non), puis affiche la bonne vue. */
function showTab() {
  for (const [id] of TABS) {
    const on = S.tab === id;
    const tab = $(`#cartes-tab-${id}`);
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
  }
  $('#cartes-section-sel').value = S.tab;
  applyView();
}

/**
 * Affiche la vue courante : les onglets (cas normal) ou la collection d'un membre (S.peer), qui remplace les onglets.
 */
function applyView() {
  const peer = !!S.peer;
  $('#cartes-tablist').hidden = peer;
  $('#cartes-section-wrap').hidden = peer;
  // Titre visible de la section affichée (il tient lieu de barre d'onglets)
  const titre = $('#cartes-section-h');
  titre.hidden = peer;
  titre.textContent = TABS.find(([id]) => id === S.tab)?.[1] || '';
  for (const [id] of TABS) $(`#cartes-p-${id}`).hidden = peer || S.tab !== id;
  $('#cartes-peer').hidden = !peer;
}

/**
 * Dessine le panneau de l'onglet courant. Chaque rendu garde la place de l'utilisateur :
 * la page ne remonte pas en haut après une action.
 */
function renderTab() {
  keepPlace(() => {
    if (BOOSTER_TABS.includes(S.tab)) renderBoosters();
    else if (S.tab === 'collection') renderCollection();
    else if (S.tab === 'classement') return renderLeaderboard();
    else if (S.tab === 'echanges') mountTradesOnce();
    else if (S.tab === 'arene') mountArene();
    restoreFocus();
  });
}

/* ---------- Arène (onglet « arene ») : module jeux/arene-v2.js (repli sur jeux/bataille.js) ---------- */
let arene = null;
/** Monte le panneau de l'Arène une seule fois (module chargé à la première ouverture). En cas d'échec, un message ; le prochain affichage réessaie. */
function mountArene() {
  if (arene) return;
  const panel = $('#cartes-p-arene');
  arene = import('../jeux/arene-v2.js')
    .then((m) => m.mount(panel, { sb, me, toast, esc }))
    .catch((e) => {
      console.warn('[arène]', e);
      arene = null;
      panel.innerHTML = '<p class="card">L’Arène n’a pas pu se charger. Change d’onglet puis reviens pour réessayer.</p>';
    });
}

/** Donne le focus au titre de la section affichée (les onglets sont masqués, voir TABS). */
function focusSection() {
  document.getElementById('cartes-section-h')?.focus({ preventScroll: true });
}

/**
 * Change d'onglet puis dessine le nouveau panneau.
 * @param {string} id identifiant de l'onglet (voir TABS)
 */
function setTab(id) {
  keepPlace(() => {
    S.tab = id;
    if (id !== 'boutique') S.bought = null; // le lien « Les ouvrir » ne sert que juste après un achat
    showTab();
    renderTab();
  });
}

/** Redessine toute la page (en-tête, historique, onglets, panneau courant). */
function renderAll() {
  keepPlace(() => {
    renderHeader();
    showTab();
    renderTab();
  });
}

/* ---------- Mise à l'échelle (cartouches et console dessinées à taille fixe) ---------- */
// Un élément .fit porte data-w (largeur de conception) et --h (hauteur de conception) ; son contenu .fit-in est mis à l'échelle.
/**
 * Met à l'échelle les cartouches et consoles à la largeur réelle de leur conteneur (jamais agrandies au-delà de 1).
 * @param {ParentNode} [root] zone à parcourir
 */
/** Échelle d'un cadre .fit d'après sa largeur réelle. Un cadre masqué (largeur 0) garde son échelle : il sera recalculé dès qu'il s'affiche. */
function fitOne(el) {
  const w = Number(el.dataset.w) || 220;
  el.style.setProperty('--w', w);
  if (el.clientWidth > 0) el.style.setProperty('--k', Math.min(1, el.clientWidth / w));
  else if (!el.style.getPropertyValue('--k')) el.style.setProperty('--k', 0);
}
// Recalcule l'échelle quand un cadre change de taille ou réapparaît (onglet rouvert, fenêtre d'enchère fermée…).
// À l'image suivante : changer --k dans le rappel redimensionne le cadre observé (boucle « ResizeObserver loop »).
const FIT_RO = typeof ResizeObserver === 'function'
  ? new ResizeObserver((entries) => requestAnimationFrame(() => entries.forEach((e) => fitOne(e.target))))
  : null;
function fitAll(root = document) {
  root.querySelectorAll('.fit').forEach((el) => {
    fitOne(el);
    if (FIT_RO && !el.dataset.fitObs) { el.dataset.fitObs = '1'; FIT_RO.observe(el); }
  });
}

/* ---------- Cartouche de booster (concept « cartouche de jeu ») ---------- */
/**
 * Classe de variante d'une cartouche (cart--<style>, voir cartes-boosters.css et boosters-styles.css) ;
 * un style absent ou inconnu retombe sur « cart--classique » (liste de référence : booster-styles.js).
 * @param {object|null} type type de booster (champ style)
 * @returns {string}
 */
const styleClass = (type) => boosterStyleClass(type?.style);
/**
 * Sous-titre d'une cartouche typée : le nom du type en capitales ; pour la série, le nom de la série choisie (si connue).
 * @param {object} type type de booster
 * @param {string} [series] nom de la série (booster « Série » déjà ouvert)
 * @returns {string}
 */
const typeLabel = (type, series = '') => (type.id === 'serie' && series ? series : type.name.toUpperCase());

/**
 * HTML d'une cartouche de booster (décor seulement, aria-hidden).
 * Sans type : cartouche d'origine (série active en sous-titre). Avec un type : variante de couleur, sous-titre et taille du type.
 * @param {{free?: boolean, ready?: boolean, type?: object|null, series?: string}} [opts]
 *   free : booster gratuit ; ready : gratuit disponible maintenant ; type : type de booster (typé) ; series : nom de la série ouverte
 * @returns {string}
 */
function cartridgeHtml({ free = false, ready = false, type = null, series = '' } = {}) {
  const n = nf.format(type ? Number(type.size) || 5 : cfg().booster_size ?? 5);
  const style = type ? styleClass(type) : '';
  const cls = ['cart-box', free && !ready ? 'is-idle' : '', style].filter(Boolean).join(' ');
  const sub = type ? typeLabel(type, series) : seriesName();
  // Thèmes à décor dessiné (booster-themes.js) : SVG du corps et de l'écran, calque d'éléments animés ; sinon le logo à l'écran.
  const deco = themeDecor(style);
  return `<div class="${cls}" aria-hidden="true">`
    + `<div class="cart-body">${deco ? deco.body : ''}</div><div class="cart-notch"></div>`
    + `<div class="cart-label"><div class="cart-label-fl"></div><div class="cart-scr">${deco ? deco.scr : `<img src="${esc(currentLogo())}" alt="">`}</div></div>`
    + '<p class="cart-lbl1">LE GANG</p>'
    + `<p class="cart-lbl2">${esc(sub)}</p>`
    + '<div class="cart-stripe"><i></i><i></i><i></i><i></i><i></i><i></i></div>'
    + '<div class="cart-ridge"></div>'
    + `<p class="cart-foot">${n} CARTES</p>`
    + (free && ready ? '<p class="cart-stk">Gratuit du jour</p>' : '')
    + (deco ? deco.over : '')
    + '</div>';
}

/* ---------- Boosters : onglets Ouverture, Inventaire et Boutique ---------- */
/** Passe sur l'onglet Ouverture (là où se joue la révélation) avant d'ouvrir un booster depuis un autre onglet. */
function toOuverture() {
  if (S.tab !== 'ouverture' && !S.peer) setTab('ouverture');
}

/** Nombre de boosters offerts en stock (donnés par le gang, mode repli). */
const giftCount = () => Math.max(0, Number(S.state?.gift_boosters) || 0);

/**
 * Onglet Ouverture : booster gratuit, boosters en stock (un ou plusieurs d'un coup), révélation en cours et quêtes de la semaine.
 * Les boosters s'achètent dans la Boutique ; leur ouverture et leur révélation se font ici.
 */
function drawOuverture() {
  const el = $('#cartes-p-ouverture');
  if (!el) return;
  const c = cfg();
  const busy = isBusy();
  const stocked = stockedTypes();
  // Boosters typés : une tuile par type en stock (la première porte l'identifiant #cartes-stock).
  // Sans stock typé (ou en repli) : la tuile « Boosters en stock » d'origine, avec le lien vers la Boutique.
  const stockTiles = stocked.length
    ? stocked.map((t, i) => typeStockTileHtml(t, i === 0, busy)).join('')
    : legacyStockTileHtml(typed() ? 0 : giftCount(), busy);
  // Tout l'inventaire d'un coup (plusieurs types en stock) ; reprise d'une ouverture groupée interrompue.
  const pending = S.x5 && S.x5.next < S.x5.items.length ? S.x5 : null;
  const globalBtns = [
    typed() && stocked.length >= 2 ? `<button type="button" class="btn btn-sand" data-action="open-all-stock" ${busy ? 'disabled' : ''}>Ouvrir tout l'inventaire (${nf.format(stockTotal())} boosters)</button>` : '',
    pending ? `<button type="button" class="btn btn-primary" data-action="resume-multi" ${busy ? 'disabled' : ''}>Reprendre l'ouverture (${nf.format(pending.items.length - pending.next)} restants)</button>` : '',
  ].join('');
  el.innerHTML = `
    <section class="cart-shelf" aria-labelledby="cartes-shelf-h">
      <h2 id="cartes-shelf-h" class="visually-hidden">Boosters à ouvrir</h2>
      ${globalBtns ? `<div class="cart-global btn-row">${globalBtns}</div>` : ''}
      <div class="cart-tiles">
        <div class="cart-tile" id="cartes-free"></div>
        ${stockTiles}
      </div>
      <p class="muted small">Le booster gratuit revient toutes les ${nf.format(c.free_booster_hours ?? 24)} h. Les boosters en stock s'ouvrent sans Paillettes et sans délai.</p>
    </section>
    <div id="cartes-reveal" tabindex="-1"></div>
    <section class="card cartes-block cq" id="cartes-quests" aria-labelledby="cartes-quests-h"></section>`;
  renderFree();
  renderReveal();
  renderQuests();
  fitAll(el);
}

/**
 * Boutons d'ouverture d'une tuile de stock : « Ouvrir 1 », « Ouvrir 5 » (désactivé sous 5 boosters) et « Tout ouvrir (N) » (dès 2).
 * @param {string} typeId identifiant du type (« classique » en repli)
 * @param {number} n boosters en stock de ce type
 * @param {boolean} busy une action est en cours
 * @param {string} oneAction action du bouton « Ouvrir 1 » (open-stock ; open-gift pour le classique)
 * @returns {string} HTML des boutons
 */
function openButtonsHtml(typeId, n, busy, oneAction) {
  const id = esc(typeId);
  const dis = busy ? 'disabled' : '';
  // « Ouvrir 5 » désactivé sous 5 boosters : l'explication est écrite sous les boutons (et reliée par aria-describedby).
  const short = n < MULTI_COUNT;
  const hintId = esc(`open-hint-${typeId}`);
  const five = short
    ? `<button type="button" class="btn btn-ghost cart-btn" data-action="open-stock-multi" data-type="${id}" data-count="5" disabled title="Il te faut 5 boosters" aria-describedby="${hintId}">Ouvrir 5</button>`
    : `<button type="button" class="btn btn-ghost cart-btn" data-action="open-stock-multi" data-type="${id}" data-count="5" ${dis}>Ouvrir 5</button>`;
  const hint = short ? `<p class="muted small cart-hint" id="${hintId}">Il te faut 5 boosters.</p>` : '';
  const all = n >= 2
    ? `<button type="button" class="btn btn-ghost cart-btn" data-action="open-stock-multi" data-type="${id}" data-count="all" ${dis}>Tout ouvrir (${nf.format(n)})</button>`
    : '';
  return `<button type="button" class="btn btn-primary cart-btn" data-action="${oneAction}" data-type="${id}" ${dis}>Ouvrir 1</button>${five}${all}${hint}`;
}

/**
 * Tuile d'un type de booster en stock (Ouverture) : cartouche du type et ses boutons d'ouverture.
 * Le classique garde l'action « open-gift » (alias de l'ancien bouton du stock générique).
 * @param {object} t type (stock, name, style, size…)
 * @param {boolean} first vrai pour la première tuile de stock (identifiant #cartes-stock)
 * @param {boolean} busy une action est en cours
 * @returns {string}
 */
function typeStockTileHtml(t, first, busy) {
  const action = t.id === 'classique' ? 'open-gift' : 'open-stock';
  return `<div class="cart-tile" ${first ? 'id="cartes-stock"' : ''} data-stock-type="${esc(t.id)}">
          <h2 class="cart-h">Booster ${esc(t.name)}</h2>
          <div class="fit cart-fit" data-w="220" style="--h:290"><div class="fit-in">${cartridgeHtml({ type: t })}</div></div>
          <div class="cart-act">${openButtonsHtml(t.id, Number(t.stock) || 0, busy, action)}</div>
        </div>`;
}

/**
 * Tuile « Boosters en stock » d'origine (repli, ou aucun booster en stock) : bouton d'ouverture ou lien vers la Boutique.
 * En repli, « Ouvrir 5 » et « Tout ouvrir » ouvrent des boosters offerts (hg_open_booster_req, p_offert).
 * @param {number} gift nombre de boosters en stock affiché
 * @param {boolean} busy une action est en cours
 * @returns {string}
 */
function legacyStockTileHtml(gift, busy) {
  return `<div class="cart-tile" id="cartes-stock">
          <h2 class="cart-h">Boosters en stock</h2>
          <div class="fit cart-fit" data-w="220" style="--h:290"><div class="fit-in">${cartridgeHtml({ free: true, ready: gift > 0 })}</div></div>
          <div class="cart-act">${gift > 0
            ? openButtonsHtml('classique', gift, busy, 'open-gift')
            : `<p class="muted small">Aucun booster en stock.</p>
               <button type="button" class="btn btn-ghost cart-btn" data-tab-go="boutique">Aller à la Boutique</button>`}
          </div>
        </div>`;
}

/**
 * Onglet Inventaire : Paillettes (solde, passage du jour), boosters en stock, booster gratuit,
 * résumé de la collection et historique des Paillettes.
 */
function drawInventaire() {
  const el = $('#cartes-p-inventaire');
  if (!el || !S.state) return;
  const s = S.state;
  const gift = stockTotal();
  const busy = isBusy();
  const freeAt = s.free_booster_at ? new Date(s.free_booster_at) : null;
  const freeReady = !freeAt || freeAt.getTime() <= Date.now();
  const distinct = new Set(S.copies.map((x) => x.card_id)).size;
  const shiny = S.copies.filter((x) => x.shiny).length;
  const doubles = S.copies.length - distinct;
  // Boosters typés : le stock par type (seuls les types en stock) ; en repli : le stock générique d'avant.
  const stocked = stockedTypes();
  const stockRows = typed()
    ? (stocked.length ? stocked.map((t) => `<li><span>${esc(t.name)}</span><strong>${nf.format(t.stock)}</strong></li>`).join('')
      : '')
    : `<li><span>Boosters en stock</span><strong>${nf.format(gift)}</strong></li>`;
  el.innerHTML = `
    <div class="inv-grid">
      <section class="card cartes-block inv-box" aria-labelledby="inv-pail-h">
        <h2 id="inv-pail-h" class="cart-h">Paillettes</h2>
        <p class="inv-big">${fmtPaillettes(bal())}</p>
        <p class="cartes-small">Série de passages : ${pluralCount(Number(s.daily_streak) || 0, 'jour', 'jours', nf.format)}${s.daily_available ? ' · passage du jour disponible' : ' · passage du jour pris'}</p>
      </section>
      <section class="card cartes-block inv-box" aria-labelledby="inv-boost-h">
        <h2 id="inv-boost-h" class="cart-h">Boosters</h2>
        ${typed() && !stocked.length ? '<p class="muted small inv-none">Aucun booster en stock</p>' : ''}
        <ul class="inv-list">
          ${stockRows}
          <li><span>Booster gratuit</span><strong>${freeReady ? 'disponible' : esc(fmtDate(freeAt.toISOString()))}</strong></li>
          <li><span>Boosters ouverts</span><strong>${nf.format(Number(s.boosters_opened) || 0)}</strong></li>
        </ul>
        ${gift > 0 || freeReady ? `<div class="btn-row">
          ${freeReady ? `<button type="button" class="btn btn-primary" data-action="open-free" ${busy ? 'disabled' : ''}>Ouvrir le gratuit</button>` : ''}
          ${gift > 0 && typed() ? `<button type="button" class="btn btn-ghost" data-tab-go="ouverture">Ouvrir mes boosters</button>` : ''}
          ${gift > 0 && !typed() ? `<button type="button" class="btn btn-ghost" data-action="open-gift" ${busy ? 'disabled' : ''}>Ouvrir un booster en stock</button>` : ''}
        </div>` : ''}
      </section>
      <section class="card cartes-block inv-box" aria-labelledby="inv-coll-h">
        <h2 id="inv-coll-h" class="cart-h">Cartes</h2>
        <ul class="inv-list">
          <li><span>Exemplaires</span><strong>${nf.format(S.copies.length)}</strong></li>
          <li><span>Cartes différentes</span><strong>${nf.format(distinct)}</strong></li>
          <li><span>Brillantes</span><strong>${nf.format(shiny)}</strong></li>
          <li><span>Doublons</span><strong>${nf.format(doubles)}</strong></li>
        </ul>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-tab-go="collection">Voir mes cartes</button></div>
      </section>
    </div>
    ${codeBoxHtml()}
    ${giftSectionHtml()}
    ${giftsSectionHtml()}
    <section class="card cartes-block" aria-labelledby="inv-hist-h">
      <h2 id="inv-hist-h">Historique des Paillettes</h2>
      <p class="cartes-small">Les 30 derniers mouvements.</p>
      <div id="cartes-history"></div>
    </section>`;
  renderHistory();
}

/* ---------- Boutique : achat de boosters (ils vont dans l'inventaire) ---------- */
// La Boutique n'achète que des boosters ; on les ouvre dans l'onglet Ouverture, et on les offre depuis l'Inventaire.
/** Introduction de la Boutique (mêmes mots en mode typé et en repli). */
const SHOP_INTRO = 'Achète ici tes boosters : ils vont dans ton inventaire. Ouvre-les quand tu veux dans l\'onglet Ouverture, ou offre-les à un membre depuis l\'Inventaire.';
// Ce que contient un booster selon son tirage (ligne sous le nom de l'article, si le type n'a pas de description).
const POOL_TEXT = {
  tous: 'Cartes tirées dans toutes les séries ouvertes.',
  serie: 'Tu choisis la série à l’ouverture : seules ses cartes peuvent sortir.',
  manquantes: 'Que des cartes que tu n’as pas encore. S’il n’en reste plus, la carte est remboursée.',
};

/**
 * Tableau des chances d'un type (taux par rareté, brillante) dans un repli « Chances », avec la garantie épique si elle existe.
 * @param {object} t type de booster (rates, shiny_rate, pity_epique, name)
 * @returns {string} HTML du repli
 */
function oddsHtml(t) {
  const rates = t.rates || {};
  const total = Object.values(rates).reduce((a, v) => a + Math.max(0, Number(v) || 0), 0) || 1;
  const rows = RARITIES_TIRAGE.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${pct((Number(rates[r.id]) || 0) / total * 100)}</td></tr>`).join('');
  const pity = Number(t.pity_epique) > 0
    ? `<p class="cartes-small">Une Épique ou mieux garantie au bout de ${nf.format(t.pity_epique)} boosters de ce type sans Épique.</p>` : '';
  return `<details class="shop-odds">
            <summary>Chances</summary>
            <table class="cartes-odds">
              <caption class="visually-hidden">Chances d’obtenir chaque rareté dans un booster ${esc(t.name)}</caption>
              <thead><tr><th scope="col">Rareté</th><th scope="col">Chance</th></tr></thead>
              <tbody>${rows}
                <tr><th scope="row">Version brillante (par carte)</th><td>${pct(Number(t.shiny_rate ?? 0))}</td></tr>
              </tbody>
            </table>
            ${pity}
          </details>`;
}

/**
 * Booster classique en repli (migration 069 non déployée) : même article, données de la configuration du jeu.
 * @returns {object} type fictif (id « classique », fallback vrai)
 */
function fallbackType() {
  const c = cfg();
  return {
    id: 'classique', name: 'Booster classique', fallback: true, pool: 'tous', size: c.booster_size ?? 5,
    price: Number(c.booster_price ?? 100), rates: c.rates || {}, shiny_rate: c.shiny_rate ?? 0,
    pity_epique: c.pity_epique ?? 0, weekly_limit: null, description: '',
  };
}

/**
 * Article de la Boutique pour un type de booster : cartouche, nom, prix, taille, description, limite de la semaine,
 * achat (quantité et un bouton « Acheter · total ») et chances. Le classique garde l'identifiant #cartes-paid.
 * Un lien « Les ouvrir » apparaît sous l'article juste après un achat réussi de ce type.
 * @param {object} t type de booster (SPEC : price, size, weekly_limit, remaining_week, pool, rates…) ou fallbackType()
 * @returns {string} HTML de l'article
 */
function shopItemHtml(t) {
  const classic = t.id === 'classique';
  const price = Number(t.price) || 0;
  const limit = t.weekly_limit == null ? '' : `<p class="cartes-small shop-limit">Limite : ${nf.format(t.weekly_limit)} par semaine · il t'en reste ${nf.format(Math.max(0, Number(t.remaining_week) || 0))}</p>`;
  const bought = S.bought && S.bought.id === t.id
    ? '<div class="shop-done"><p class="muted small" role="status">Ajouté à ton inventaire.</p><button type="button" class="btn btn-ghost cart-btn" data-tab-go="ouverture">Les ouvrir</button></div>'
    : '';
  return `<article class="card shop-item" ${classic ? 'id="cartes-paid"' : ''} data-type="${esc(t.id)}">
        <div class="fit cart-fit shop-fit" data-w="220" style="--h:290"><div class="fit-in">${t.fallback ? cartridgeHtml() : cartridgeHtml({ type: t })}</div></div>
        <div class="shop-info">
          ${t.fallback ? '' : saleBadgeHtml(t)}
          <h3 class="cart-h">${esc(t.name)}</h3>
          <p class="shop-price">${pastilleHtml(price, { size: 'sm' })}${t.fallback ? '' : discountHtml(t, S.types || [])} <span class="cartes-small">· ${pluralCount(Number(t.size) || 5, 'carte', 'cartes', nf.format)}</span></p>
          <p class="cartes-small">${esc(t.description || (t.only_set_name ? `Série « ${t.only_set_name} » uniquement.` : POOL_TEXT[t.pool]) || '')}</p>
          ${limit}${t.fallback ? '' : saleLimitHtml(t)}
          <div class="cart-act">
            ${t.fallback || openNow(t) ? stockBoxHtml(price, t.id) : closedBoxHtml(t)}
            ${bought}
          </div>
          ${oddsHtml(t)}
        </div>
      </article>`;
}

/**
 * Dessine la Boutique : l'introduction, puis un article par type de booster (dans l'ordre d'affichage, S.types),
 * ou l'article du classique en repli.
 */
function drawBoutique() {
  const el = $('#cartes-p-boutique');
  if (!el) return;
  let items;
  // Boosters de saison et du soir (migration 080) : hors fenêtre, absents ; hors plage horaire, une ligne compacte à la fin.
  if (typed()) {
    const shelf = S.types.filter(onShelf);
    items = shelf.filter(openNow).map(shopItemHtml).join('');
    const closed = shelf.filter((t) => !openNow(t));
    if (closed.length) items += `<h3 class="shop-later">Le reste de la semaine</h3>${closed.map(closedRowHtml).join('')}`;
  }
  else if (typesDown()) items = '<p class="muted small shop-soon">La boutique n\'est pas disponible pour le moment. Réessaie dans un instant.</p>';
  else items = shopItemHtml(fallbackType());
  el.innerHTML = `
    <div id="cartes-enchere" hidden></div>
    <section class="shop" aria-labelledby="cartes-shop-h">
      <h2 id="cartes-shop-h" class="visually-hidden">Boosters en vente</h2>
      <p class="muted small shop-intro">${esc(SHOP_INTRO)}</p>
      ${items}
    </section>`;
  enchere?.drawEnchere(); // encart ou vue de l'enchère de la semaine (idée C11)
  fitAll(el);
}

/** Redessine les trois onglets de boosters (seul le panneau visible compte, les autres restent à jour). */
function drawBoosters() {
  drawOuverture();
  drawInventaire();
  drawBoutique();
}
// Versions « qui gardent la place » des fonctions de dessin (voir kept).
const renderBoosters = kept(drawBoosters);
const renderBoutique = kept(drawBoutique);
const renderInventaire = kept(drawInventaire);

/* ---------- Boosters : achat dans la Boutique (ils vont dans l'inventaire) ---------- */
/** Options 1 à max d'un sélecteur de quantité, la valeur « selected » étant présélectionnée. */
const qtyOptions = (max, selected) => Array.from({ length: max }, (_, i) => `<option value="${i + 1}"${i + 1 === selected ? ' selected' : ''}>${nf.format(i + 1)}</option>`).join('');

/**
 * Bloc d'achat d'un article de la Boutique : quantité (1 à 10) et un seul bouton « Acheter · total ».
 * Boosters typés : la limite hebdomadaire réduit la quantité permise ; « Limite de la semaine atteinte » quand elle est épuisée.
 * @param {number} price prix d'un booster
 * @param {string} [typeId='classique'] type de booster (mode typé) ; en repli, le classique
 * @returns {string}
 */
function stockBoxHtml(price, typeId = 'classique') {
  const id = esc(typeId);
  // Repli (migration 069 pas encore déployée) : l'achat ne peut pas aboutir, on ne le propose pas.
  if (!typed()) {
    const soon = `shop-soon-${id}`;
    return `<div class="shop-stock">
              <button type="button" class="btn btn-primary cart-btn" data-action="buy-stock" data-type="${id}" disabled aria-describedby="${soon}">Acheter · ${pastilleHtml(price, { size: 'sm' })}</button>
              <p class="muted small shop-stock-miss" id="${soon}">La boutique ouvre bientôt.</p>
            </div>`;
  }
  const t = typeOf(typeId);
  const qty = qtyFor(typeId);
  const cost = price * qty;
  const god = isGod();
  // Limite de la semaine (mode typé ; le mode sans limite l'ignore) : il ne reste que « left » boosters achetables.
  const leftWeek = !god && t?.weekly_limit != null ? Math.max(0, Number(t.remaining_week) || 0) : null;
  // Limite par soirée (migration 080, booster du soir) : la plus petite des deux limites compte.
  const leftWin = !god && t?.per_window_limit != null && t?.remaining_window != null ? Math.max(0, Number(t.remaining_window) || 0) : null;
  const left = leftWin != null && (leftWeek == null || leftWin < leftWeek) ? leftWin : leftWeek;
  const winCap = left != null && left === leftWin;
  const capped = left === 0;
  const overLimit = left != null && qty > left;
  const canBuy = (god || bal() >= cost) && !overLimit;
  const busy = isBusy();
  // Explication du bouton désactivé : écrite sous le bouton, et reliée par aria-describedby.
  const missId = `shop-miss-${id}`;
  let miss = '';
  if (capped) miss = '<p class="muted small shop-soldout" id="' + missId + '">' + (winCap ? 'Limite de la soirée atteinte' : 'Limite de la semaine atteinte') + '</p>';
  else if (overLimit) miss = `<p class="muted small shop-stock-miss" id="${missId}">Il ne te reste que ${pluralCount(left, 'booster', 'boosters', nf.format)} ${winCap ? 'pour cette soirée' : 'cette semaine'}</p>`;
  else if (!god && bal() < cost) miss = `<p class="muted small shop-stock-miss" id="${missId}">Il te manque ${fmtPaillettes(cost - bal())}</p>`;
  const label = god ? 'Acheter · gratuit (mode sans limite)' : `Acheter · ${pastilleHtml(cost, { size: 'sm' })}`;
  return `<div class="shop-stock">
              <label for="${esc(qtySelId(typeId))}">Quantité</label>
              <div class="shop-stock-row">
                <select id="${esc(qtySelId(typeId))}" data-change="shop-qty" data-type="${id}">${qtyOptions(10, qty)}</select>
                <button type="button" class="btn btn-primary cart-btn" data-action="buy-stock" data-type="${id}" ${busy || !canBuy ? 'disabled' : ''}${!canBuy && miss ? ` aria-describedby="${missId}"` : ''}>${label}</button>
              </div>
              ${miss}
            </div>`;
}

/**
 * Change la quantité d'achat d'un type puis redessine la Boutique, en gardant le focus sur le sélecteur.
 * @param {string} value valeur du sélecteur (1 à 10)
 * @param {string} [typeId='classique'] type de booster du sélecteur
 */
function setBuyQty(value, typeId = 'classique') {
  const v = Math.min(10, Math.max(1, Number(value) || 1));
  if (typeId === 'classique') S.buyQty = v;
  else S.typeQty[typeId] = v;
  renderBoutique();
  document.getElementById(qtySelId(typeId))?.focus({ preventScroll: true });
}

/**
 * Achète des boosters : ils vont dans l'inventaire (hg_booster_buy ; p_type en mode typé). L'ouverture se fait ensuite dans l'onglet Ouverture.
 * La même demande garde le même identifiant tant qu'elle n'a pas abouti (S.buyReq) : un double clic ou une relance ne paie pas deux fois.
 * Après un achat réussi, un lien « Les ouvrir » apparaît sous l'article ; l'onglet ne change pas.
 * @param {string} [typeId='classique'] type de booster (ignoré en mode repli)
 * @returns {Promise<void>}
 */
async function buyStock(typeId = 'classique') {
  // Sans les types (repli), l'achat n'est pas proposé : le bouton est désactivé, et on ne l'envoie pas.
  if (isBusy() || !typed()) return;
  const t = typeOf(typeId);
  if (!t) { toast('Ce booster n’est pas disponible pour le moment.', 'error'); return; }
  const qty = qtyFor(typeId);
  S.busy = true;
  renderBoosters();
  if (!S.buyReq || S.buyReq.qty !== qty || S.buyReq.type !== typeId) S.buyReq = { type: typeId, qty, id: newReqId() };
  // 'ok' : acheté ; 'dup' : déjà enregistré par le serveur ; 'error' : échec (rien n'a été acheté).
  let state = 'error';
  try {
    const { error } = await sb.rpc('hg_booster_buy', { p_type: typeId, p_qty: qty, p_request: S.buyReq.id });
    if (error) throw error;
    state = 'ok';
  } catch (e) {
    if (String(e?.message || '').includes('achat_deja_fait')) {
      // Le serveur a déjà enregistré cet achat : on ne le renvoie pas, on recharge l'état.
      S.buyReq = null;
      state = 'dup';
      toast('Cet achat a déjà été pris en compte. Ton stock est à jour.');
    } else {
      toast(errMsg(e), 'error');
    }
  }
  if (state === 'ok') {
    S.buyReq = null;
    toast(`${pluralCount(qty, 'booster ' + t.name, 'boosters ' + t.name, nf.format)} ajouté${qty > 1 ? 's' : ''} à ton inventaire`, 'ok');
    S.bought = { id: typeId }; // lien « Les ouvrir » sous l'article acheté (l'onglet ne change pas)
  }
  // Le rechargement vient après un succès : son échec n'annule pas l'achat.
  if (state !== 'error') await refreshAfter(refreshData);
  S.busy = false;
  renderAll();
  restoreFocus(() => (state === 'ok' ? articleLinkOf(typeId) : null));
}

/** Lien « Les ouvrir » de l'article d'un type dans la Boutique (null si absent). */
const articleLinkOf = (typeId) => [...app.querySelectorAll('#cartes-p-boutique .shop-item')]
  .find((a) => a.dataset.type === typeId)?.querySelector('[data-tab-go="ouverture"]') || null;

/* ---------- Boosters offerts : dons à un autre membre (Inventaire) ---------- */
/** Membre de la liste chargée d'après son identifiant (null si la liste n'est pas chargée ou si le membre est absent). */
const memberOf = (id) => (Array.isArray(S.members) ? S.members.find((m) => m.id === id) || null : null);

/**
 * Garde dans S.giftForm la valeur d'un champ du formulaire de don. Pas de redessin : le focus reste dans le champ.
 * @param {HTMLSelectElement|HTMLTextAreaElement} el champ ([data-gift])
 */
function updateGift(el) {
  const k = el.dataset.gift;
  if (k === 'to') S.giftForm.to = el.value;
  else if (k === 'qty') S.giftForm.qty = Math.min(10, Math.max(1, Number(el.value) || 1));
  else if (k === 'msg') S.giftForm.msg = el.value;
  else if (k === 'type') S.giftForm.type = el.value;
}

/**
 * Section « Offrir des boosters » de l'Inventaire : formulaire (type en mode typé, membre, quantité, mot), ou message si le stock est vide.
 * Mode typé : on choisit le type (seuls ceux en stock sont proposés) ; la quantité ne dépasse pas le stock de ce type.
 * Après « Offrir », la confirmation remplace le bouton (le don ne peut pas être annulé).
 * @returns {string}
 */
function giftFormHtml() {
  // Repli (migration 069 pas déployée) : le don n'est pas proposé, il ne pourrait pas aboutir.
  if (!typed()) return `<p class="muted small">${typesDown() ? 'Les dons de boosters ne sont pas disponibles pour le moment.' : 'Les dons de boosters arrivent bientôt.'}</p>`;
  if (!stockTotal()) {
    return `<p class="muted small inv-gift-empty">Tu n'as aucun booster en stock. Achète-en dans la Boutique pour en offrir.</p>
      <button type="button" class="btn btn-ghost" data-tab-go="boutique">Aller à la Boutique</button>`;
  }
  // Les boosters Collectionneur ne s'offrent pas : seuls les autres types sont proposés.
  const withStock = stockedTypes().filter(giftable);
  if (!withStock.length) return '<p class="muted small inv-gift-empty">Les boosters Collectionneur ne s\'offrent pas.</p>';
  const giftTotal = withStock.reduce((a, t) => a + Math.max(0, Number(t.stock) || 0), 0);
  const f = S.giftForm;
  // Le type choisi doit être en stock et se donner (sinon le premier type qui se donne est pris).
  if (!withStock.some((t) => t.id === f.type)) f.type = withStock[0].id;
  const stock = stockOf(f.type);
  // La quantité ne dépasse jamais le stock (il a pu baisser depuis le dernier choix).
  f.qty = Math.min(Math.max(1, Number(f.qty) || 1), Math.min(10, stock));
  const typeField = `<div class="inv-gift-field">
          <label for="gift-type">Type de booster</label>
          <select id="gift-type" data-gift="type">${withStock.map((t) => `<option value="${esc(t.id)}"${t.id === f.type ? ' selected' : ''}>${esc(t.name)} (${nf.format(t.stock)} en stock)</option>`).join('')}</select>
        </div>`;
  const typeName = typeOf(f.type)?.name || '';
  const total = giftTotal;
  const members = S.members;
  let people;
  if (!members) people = '<option value="" disabled selected>Chargement…</option>';
  else if (members.error) people = '<option value="" disabled selected>Membres indisponibles</option>';
  else people = '<option value="">Choisis un membre</option>'
    + members.map((m) => `<option value="${esc(m.id)}"${m.id === f.to ? ' selected' : ''}>${esc(m.pseudo || '')}</option>`).join('');
  const busy = isBusy();
  const unavailable = !!members?.error;
  const confirm = S.giftConfirm && memberOf(f.to);
  return `<p class="muted small">Tu as ${pluralCount(total, 'booster', 'boosters', nf.format)} en stock.</p>
      <form id="inv-gift-form" class="inv-gift-form" novalidate>
        ${typeField}
        <div class="inv-gift-field">
          <label for="gift-to">Destinataire</label>
          <select id="gift-to" data-gift="to" ${!Array.isArray(members) ? 'disabled' : ''}>${people}</select>
        </div>
        <div class="inv-gift-field">
          <label for="gift-qty">Nombre de boosters</label>
          <select id="gift-qty" data-gift="qty">${qtyOptions(Math.min(10, stock), f.qty)}</select>
        </div>
        <div class="inv-gift-field">
          <label for="gift-msg">Message</label>
          <textarea id="gift-msg" data-gift="msg" maxlength="300" rows="2" placeholder="Un petit mot (facultatif)">${esc(f.msg)}</textarea>
        </div>
        ${confirm ? `<div class="inv-gift-confirm" role="group" aria-label="Confirmer le don">
          <p>Offrir ${pluralCount(f.qty, 'booster', 'boosters', nf.format)}${typeName ? ` ${esc(typeName)}` : ''} à <strong>${esc(confirm.pseudo || '')}</strong> ? Ce don ne peut pas être annulé.</p>
          <button type="button" class="btn btn-primary" data-action="gift-confirm" ${busy ? 'disabled' : ''}>Confirmer</button>
          <button type="button" class="btn btn-ghost" data-action="gift-cancel" ${busy ? 'disabled' : ''}>Annuler</button>
        </div>` : `<div><button type="submit" class="btn btn-primary" data-action="gift-ask" ${busy || unavailable ? 'disabled' : ''}>Offrir</button></div>`}
      </form>`;
}

/** Bloc complet « Offrir des boosters » (formulaire ou message de stock vide). */
function giftSectionHtml() {
  return `<section class="card cartes-block" id="inv-gift" aria-labelledby="inv-gift-h">
      <h2 id="inv-gift-h" tabindex="-1">Offrir des boosters</h2>
      ${giftFormHtml()}
    </section>`;
}

/**
 * Passe du formulaire à la confirmation (le membre doit être choisi). Le focus va sur « Confirmer ».
 */
function askGift() {
  if (!S.giftForm.to) {
    toast('Choisis à qui offrir', 'error');
    $('#gift-to')?.focus();
    return;
  }
  S.giftConfirm = true;
  renderInventaire();
  $('[data-action="gift-confirm"]')?.focus();
}

/** Annule la confirmation et ramène le focus sur le bouton « Offrir ». */
function cancelGift() {
  S.giftConfirm = false;
  renderInventaire();
  $('[data-action="gift-ask"]')?.focus({ preventScroll: true });
}

/**
 * Envoie le don (hg_booster_gift, avec une demande p_request). Une même demande garde le même identifiant tant qu'elle
 * n'a pas abouti (S.giftReq) : un double clic ou une relance n'offre pas deux fois. Un don déjà enregistré (don_deja_fait)
 * compte comme réussi. En cas d'échec, les valeurs du formulaire restent en place.
 * @returns {Promise<void>}
 */
async function giftConfirm() {
  if (S.busy || !typed()) return;
  const f = S.giftForm;
  const pseudo = memberOf(f.to)?.pseudo || 'ce membre';
  const t = typeOf(f.type);
  if (!t || !giftable(t)) { S.giftConfirm = false; renderInventaire(); toast('Ce booster ne peut pas être offert.', 'error'); return; }
  const qty = Math.min(Math.max(1, Number(f.qty) || 1), stockOf(f.type));
  const msg = f.msg.trim() || null;
  const sig = [f.to, t.id, qty, msg || ''].join('|');
  if (!S.giftReq || S.giftReq.sig !== sig) S.giftReq = { sig, id: newReqId() };
  S.busy = true;
  renderInventaire();
  // 'ok' : offert ; 'dup' : déjà offert (demande rejouée) ; 'error' : rien n'a été offert.
  let state = 'error';
  try {
    const { error } = await sb.rpc('hg_booster_gift', { p_to: f.to, p_type: t.id, p_qty: qty, p_message: msg, p_request: S.giftReq.id });
    if (error) throw error;
    state = 'ok';
  } catch (e) {
    if (String(e?.message || '').includes('don_deja_fait')) state = 'dup';
    else toast(errMsg(e), 'error');
  }
  S.giftConfirm = false;
  if (state !== 'error') {
    S.giftReq = null;
    if (state === 'ok') {
      const n = pluralCount(qty, 'booster', 'boosters', nf.format);
      toast(`${n} ${t.name} ${qty > 1 ? 'offerts' : 'offert'} à ${pseudo}`, 'ok');
    } else {
      toast('Don déjà envoyé');
    }
    S.giftForm = { to: '', qty: 1, msg: '', type: f.type };
    // Le rechargement vient après un succès : son échec n'annule pas le don.
    await refreshAfter(refreshData);
    await refreshAfter(loadGifts);
  }
  S.busy = false;
  renderAll();
  restoreFocus(() => (state === 'error' ? $('[data-action="gift-ask"]') : document.getElementById('inv-gift-h')));
}

/**
 * Une ligne de l'historique des dons : envoyé ou reçu, pseudo, nombre, mot éventuel et date.
 * @param {object} x don (id, qty, message, created_at, sent, other_pseudo)
 * @returns {string}
 */
function giftRowHtml(x) {
  const who = `<strong>${esc(x.other_pseudo || 'Un membre')}</strong>`;
  // Mode typé : le nom du type suit le nombre (« 2 boosters Doré »), quand la base le renvoie.
  const n = pluralCount(Number(x.qty) || 0, 'booster', 'boosters', nf.format) + (x.type_name ? ` ${esc(x.type_name)}` : '');
  return `<li>
      <p>${x.sent ? `Tu as offert ${n} à ${who}` : `${who} t'a offert ${n}`}</p>
      ${x.message ? `<q>${esc(x.message)}</q>` : ''}
      <span class="muted small">${esc(fmtDate(x.created_at))}</span>
    </li>`;
}

/** Section « Boosters offerts et reçus » de l'Inventaire (chargement, erreur, liste vide ou liste). */
function giftsSectionHtml() {
  const g = S.gifts;
  let body;
  if (!g) body = '<p class="muted small">Chargement…</p>';
  else if (g.error) body = '<p class="muted small">Historique des dons indisponible pour le moment.</p>';
  else if (!g.length) body = '<p class="muted small">Aucun don pour le moment.</p>';
  else body = `<ul class="inv-gifts-list">${g.map(giftRowHtml).join('')}</ul>`;
  return `<section class="card cartes-block" id="inv-gifts" aria-labelledby="inv-gifts-h">
      <h2 id="inv-gifts-h">Boosters offerts et reçus</h2>
      ${body}
    </section>`;
}

/** Charge les 30 derniers dons envoyés et reçus (hg_booster_gifts_me). Ne lève jamais d'erreur : la section l'indique. */
async function loadGifts() {
  try {
    const { data, error } = await sb.rpc('hg_booster_gifts_me');
    if (error) throw error;
    S.gifts = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[dons]', e);
    S.gifts = { error: true };
  }
  if (S.tab === 'inventaire' && !S.peer) renderInventaire();
}

/** Charge les membres (hg_members) pour le choix du destinataire, sans soi-même. Ne lève jamais d'erreur. */
async function loadMembers() {
  try {
    const { data, error } = await sb.rpc('hg_members');
    if (error) throw error;
    S.members = (data || [])
      .filter((m) => m.id !== me.id)
      .sort((a, b) => String(a.pseudo || '').localeCompare(String(b.pseudo || ''), 'fr'));
  } catch (e) {
    console.warn('[membres]', e);
    S.members = { error: true };
  }
  if (S.tab === 'inventaire' && !S.peer) renderInventaire();
}

/* ---------- Quêtes de la semaine (3 par semaine, lundi 00:00 heure de Zurich) ---------- */
// Chargées à part : un échec de ces quêtes ne bloque pas le reste de la page.
/** Charge les quêtes de la semaine (hg_card_quests_me). En cas d'erreur, la section l'indique sans bloquer la page. */
async function loadQuests() {
  try {
    const { data, error } = await sb.rpc('hg_card_quests_me');
    if (error) throw error;
    S.quests = data || { quests: [] };
  } catch (e) {
    console.warn('[quêtes]', e);
    S.quests = { error: true };
  }
  renderQuests();
}

/**
 * Une ligne de quête : libellé, barre de progression, et état (en cours, à réclamer, reçue).
 * @param {object} q quête (code, label, target, progress, reward, done, claimed)
 * @returns {string}
 */
function questHtml(q) {
  const target = Math.max(1, Number(q.target) || 1);
  const value = Math.min(Math.max(0, Number(q.progress) || 0), target);
  const pctDone = Math.round((value / target) * 100);
  const state = q.claimed
    ? '<span class="pill pill-ok">Récompense reçue</span>'
    : q.proof ? proofState(q)
    : q.done
      ? `<button type="button" class="btn btn-sand cq-btn" data-action="quest-claim" data-code="${esc(q.code)}" ${S.busy ? 'disabled' : ''}>Réclamer · ${fmtPaillettes(q.reward)}</button>`
      : '<span class="pill pill-current">En cours</span>';
  return `<li class="cq-item${q.claimed ? ' is-claimed' : ''}">
      <div class="cq-main">
        <p class="cq-label">${esc(q.label)}${q.proof && q.proof_game ? ` <span class="cq-proof-game">· ${esc(q.proof_game)}</span>` : ''}</p>
        ${q.proof && q.proof_status === 'refusee' && !q.claimed ? `<p class="cq-proof-reason">Preuve refusée : « ${esc(q.proof_reason || '')} »</p>` : ''}
        <div class="progress cq-bar" role="progressbar" aria-label="${esc(q.label)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${value}" aria-valuetext="${nf.format(value)} sur ${nf.format(target)}">
          <span style="width:${pctDone}%"></span>
        </div>
        <p class="cartes-small cq-count">${nf.format(value)} / ${nf.format(target)} · récompense ${fmtPaillettes(q.reward)}</p>
      </div>
      <div class="cq-act">${state}</div>
    </li>`;
}

/**
 * État d'une quête à preuve (J11) : envoyer, en attente, refusée (renvoi possible une fois), validée à réclamer.
 * @param {object} q quête (proof_status, proof_attempts, done)
 * @returns {string}
 */
function proofState(q) {
  proofCss();
  if (q.done) return `<button type="button" class="btn btn-sand cq-btn" data-action="quest-claim" data-code="${esc(q.code)}" ${S.busy ? 'disabled' : ''}>Réclamer · ${fmtPaillettes(q.reward)}</button>`;
  if (q.proof_status === 'en_attente') return '<span class="pill pill-current">En attente de validation</span>';
  if (q.proof_status === 'refusee' && q.proof_attempts >= 2) return '<span class="pill">Refusée</span>';
  return `<button type="button" class="btn btn-primary cq-btn" data-action="quest-proof" data-code="${esc(q.code)}">${q.proof_status === 'refusee' ? 'Renvoyer une preuve' : 'Envoyer une preuve'}</button>`;
}

/** Dessine la section des quêtes : chargement, erreur, liste vide ou liste des quêtes. */
function drawQuests() {
  const box = $('#cartes-quests');
  if (!box) return;
  const Q = S.quests;
  const head = '<h2 id="cartes-quests-h">Quêtes de la semaine</h2>';
  // Encart « Questions du gang » : toujours affiché sous les quêtes, même pendant le chargement ou en erreur
  const encart = '<p class="cq-encart">Questions du gang : gagne des Paillettes en répondant aux questions de l’admin, sur la page <a href="/pages/jeux/quiz.html">Questions du gang</a>.</p>';
  if (!Q) { box.innerHTML = `${head}<p class="muted small">Chargement des quêtes…</p>${encart}`; return; }
  if (Q.error) { box.innerHTML = `${head}<p class="muted small">Quêtes indisponibles pour le moment.</p>${encart}`; return; }
  const list = Q.quests || [];
  // Défi de collection de la semaine (idée 62, cartes-defi.js) : en tête, le même pour tout le gang.
  const defi = defiHtml(Q.defi && { ends_at: Q.ends_at, ...Q.defi }, S.busy);
  if (!list.length) { box.innerHTML = `${head}${defi}<p class="muted small">Aucune quête cette semaine.</p>${encart}`; return; }
  const done = list.filter((q) => q.done).length;
  box.innerHTML = `${head}
    <p class="cartes-small">${nf.format(done)} sur ${nf.format(list.length)} terminée${done > 1 ? 's' : ''}${Q.ends_at ? ` · nouvelles quêtes le lundi suivant (${esc(fmtDate(Q.ends_at))})` : ''}.</p>
    ${defi}
    <ul class="cq-list">${list.map(questHtml).join('')}</ul>
    ${encart}`;
}
const renderQuests = kept(drawQuests);

/** Réclame le booster du défi de collection (hg_card_defi_claim), puis recharge le stock et les quêtes. */
async function claimDefiBooster() {
  if (S.busy) return;
  S.busy = true;
  renderQuests();
  let nom;
  try {
    nom = await claimDefi(sb);
  } catch (e) {
    toast(errMsg(e), 'error');
    S.busy = false;
    await loadQuests();
    return;
  }
  toast(`Défi réussi : 1 booster ${nom} ajouté à ton inventaire`, 'ok');
  await refreshAfter(refreshData);
  S.busy = false;
  await loadQuests();
  renderAll();
}

/**
 * Réclame la récompense d'une quête (hg_card_quest_claim), puis recharge les données.
 * @param {string} code identifiant de la quête
 */
async function claimQuest(code) {
  if (S.busy) return;
  S.busy = true;
  renderQuests();
  let res;
  try {
    res = await sb.rpc('hg_card_quest_claim', { p_code: code });
    if (res.error) throw res.error;
  } catch (e) {
    toast(errMsg(e), 'error');
    S.busy = false;
    await loadQuests();
    renderAll();
    return;
  }
  toast(`Quête terminée : +${fmtP(res.data?.reward ?? 0)}`, 'ok');
  // Le rechargement vient après une réclamation réussie : son échec ne l'annule pas.
  await refreshAfter(refreshData);
  S.busy = false;
  await loadQuests();
  renderAll();
}

// Booster gratuit : cartouche + compte à rebours, ou bouton « Ouvrir » quand il est disponible.
/**
 * Dessine le booster gratuit. Ne redessine que si son état (disponible ou non, occupé ou non) change ;
 * sinon met seulement le compte à rebours à jour, pour ne pas perdre le focus.
 */
function drawFree() {
  const box = $('#cartes-free');
  if (!box || !S.state) return;
  const at = S.state.free_booster_at ? new Date(S.state.free_booster_at).getTime() : 0;
  const ms = at - Date.now();
  const ready = ms <= 0;
  const busy = isBusy();
  if (box.dataset.ready === String(ready) && box.dataset.busy === String(busy)) {
    if (!ready) { const t = box.querySelector('.cartes-timer'); if (t) t.textContent = `Disponible dans ${fmtDuration(ms)}`; }
    return;
  }
  box.dataset.ready = String(ready);
  box.dataset.busy = String(busy);
  box.innerHTML = `
    <h2 class="cart-h">Booster gratuit</h2>
    <div class="fit cart-fit" data-w="220" style="--h:290"><div class="fit-in">${cartridgeHtml({ free: true, ready, type: freeType() })}</div></div>
    <div class="cart-act">${ready
      ? `<button type="button" class="btn btn-primary cart-btn" data-action="open-free" ${busy ? 'disabled' : ''}>Ouvrir le booster gratuit</button>`
      : `<p class="cartes-timer" role="timer">Disponible dans ${fmtDuration(ms)}</p>`}
    </div>`;
  fitAll(box);
}
const renderFree = kept(drawFree);

/* ---------- Ouverture : séquence d'animation (ou révélation directe) ---------- */
// Étapes : 1 cartouche insérée, 2 console « BOOT » et barre, 3 flash de la meilleure rareté,
// puis pour chaque carte i : 4+2i sortie par la fente, 5+2i retournement (révélation de la carte).
/**
 * Numéro de la dernière étape de la séquence d'un booster (la fin d'animation).
 * @param {{cards: object[]}} R ouverture en cours
 * @returns {number}
 */
const lastStep = (R) => 4 + 2 * R.cards.length;
/**
 * Durée (ms) de l'étape s : pause plus longue pour les étapes d'installation, puis alternance rapide.
 * @param {number} s numéro de l'étape
 * @returns {number}
 */
function seqDelay(s) {
  if (s === 0) return 80;
  if (s === 1) return 700;
  if (s === 2) return 1000;
  if (s === 3) return 520;
  return s % 2 === 0 ? 380 : 300;
}

/**
 * Applique à la scène les classes correspondant à l'étape courante (inséré, boot, flash, sorties et retournements).
 * @param {object} R ouverture en cours
 */
function applyStage(R) {
  const root = $('#op-stage');
  if (!root) return;
  root.classList.toggle('is-in', R.step >= 1);
  root.classList.toggle('is-boot', R.step >= 2);
  root.classList.toggle('is-flash', R.step === 3);
  // Thèmes « fête » (feux d'artifice, gâteau) : gerbes ou confettis autour de la cartouche, une seule fois, sans bloquer la révélation.
  if (R.step >= 3 && R.phase === 'seq' && !R.fxDone) { R.fxDone = true; playOpeningFx(root, styleClass(R.type)); }
  // Une carte déjà retournée à la main (voir onBoosterCard) reste retournée à chaque étape.
  root.querySelectorAll('.op-card').forEach((card) => {
    const i = Number(card.dataset.i);
    const done = R.revealed.has(i);
    card.classList.toggle('is-out', done || R.step >= 4 + 2 * i);
    card.classList.toggle('is-flip', done || R.step >= 5 + 2 * i);
  });
}

/**
 * Lance la séquence d'ouverture d'un booster : une étape après l'autre, à intervalle variable (seqDelay).
 * Chaque étape peut être interrompue par « Tout révéler » (skipSeq).
 * @param {object} R ouverture en cours
 */
function startSeq(R) {
  /** Passe à l'étape suivante ; à la fin, termine la séquence. */
  const next = () => {
    R.timer = null;
    if (S.reveal !== R || R.phase !== 'seq') return;
    R.step += 1;
    if (R.step >= lastStep(R)) return finishSeq(R);
    applyStage(R);
    const s = R.step;
    if (s >= 5 && s % 2 === 1) revealCard(R, (s - 5) / 2);
    R.timer = setTimeout(next, seqDelay(s));
  };
  R.timer = setTimeout(next, seqDelay(R.step));
}

/**
 * Marque la carte i comme révélée et joue un son (plus fort pour une rareté à partir de légendaire).
 * @param {object} R ouverture en cours
 * @param {number} i index de la carte
 */
function revealCard(R, i) {
  const card = R.cards[i];
  if (!card || R.revealed.has(i)) return;
  R.revealed.add(i);
  playSound(rarityRank(card.rarity) >= 5 ? 'badge' : 'click');
  setCardControl(R, i);
  showRevealHint();
  if (!R.multi && i === 4) pentaShow(R); // 5e carte retournée : bannière Pentakill si le serveur l'a confirmée
}

/**
 * Termine la séquence : toutes les cartes sont révélées, les boutons se réactivent, le focus va à « Fermer ».
 * @param {object} R ouverture en cours
 */
function finishSeq(R) {
  if (R.timer) clearTimeout(R.timer);
  R.timer = null;
  R.phase = 'done';
  R.step = lastStep(R);
  R.cards.forEach((_, i) => R.revealed.add(i));
  renderBoosters(); // réactive les cartouches et affiche le résumé
  focusRevealEnd();
  pentaShow(R); // révélation sautée : la bannière s'affiche quand même
}

/**
 * Montre la bannière Pentakill d'un booster de 5 cartes, une seule fois, si le serveur l'a confirmée.
 * Appelée à la 5e carte retournée, à la fin de la révélation, ou tout de suite si l'ouverture n'est pas animée.
 * @param {object} R ouverture en cours (R.penta : promesse de pentakillCheck, absente si le booster n'a pas 5 cartes)
 */
function pentaShow(R) {
  if (!R?.penta || R.pentaShown) return;
  R.pentaShown = true;
  R.penta.then((res) => { if (res) showPentakill(res); });
}

/** Début d'une séquence : le focus va sur « Tout révéler » (une touche Entrée suffit pour sauter l'animation). */
function focusRevealAll() {
  $('#cartes-reveal [data-action="reveal-all"]')?.focus({ preventScroll: true });
}

/** Fin d'une ouverture : le focus va sur « Fermer » (le titre du résultat le précède dans l'ordre de lecture). */
function focusRevealEnd() {
  const el = $('#cartes-reveal [data-action="close-reveal"]') || $('#cartes-reveal-h');
  el?.focus({ preventScroll: true });
}

// « Tout révéler » : passe directement à la fin de la séquence.
/** Bouton « Tout révéler » : termine tout de suite l'ouverture en cours (simple ou groupée). */
function skipSeq() {
  const R = S.reveal;
  if (!R || R.phase !== 'seq') return;
  if (R.multi) finishMulti(R);
  else finishSeq(R);
}

/* ---------- Résumé d'une ouverture (pastilles et annonce) ---------- */
/** À partir de ce nombre de cartes, l'annonce regroupe par rareté et ne nomme que quelques belles cartes. */
const SUMMARY_BIG = 25;
/** Nombre maximal de cartes nommées dans l'annonce (rareté épique et plus). */
const SUMMARY_NAMES = 5;

/**
 * Résumé d'une ouverture par rareté : comptes (de la plus commune à la plus rare), brillantes et nouvelles.
 * Sert aux pastilles visibles (summaryHtml) et à l'annonce des lecteurs d'écran (summaryText).
 * @param {object[]} cards cartes obtenues
 * @param {Set<string>} [freshIds] cartes qui n'étaient pas dans la collection avant l'ouverture
 * @returns {{total: number, groups: Array<{id: string, text: string}>, fresh: number, names: string[], more: number}}
 */
function raritySummary(cards, freshIds = new Set()) {
  const by = new Map();
  for (const c of cards) {
    const g = by.get(c.rarity) || { n: 0, shiny: 0 };
    g.n += 1;
    if (c.shiny) g.shiny += 1;
    by.set(c.rarity, g);
  }
  const groups = RARITIES.filter((r) => by.has(r.id)).map((r) => {
    const { n, shiny } = by.get(r.id);
    const label = r.label.toLowerCase();
    let text = `${nf.format(n)} ${n > 1 ? label.replace(/(\S+)$/, '$1s') : label}`;
    if (shiny && shiny === n) text += n > 1 ? ' brillantes' : ' brillante';
    else if (shiny) text += ` dont ${pluralCount(shiny, 'brillante', 'brillantes', nf.format)}`;
    return { id: r.id, text };
  });
  // Belles cartes nommées : épique et plus, sans doublon, la plus rare d'abord.
  const seen = new Set();
  const top = [...cards].sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity))
    .filter((c) => rarityRank(c.rarity) >= rarityRank('epique') && !seen.has(c.card_id) && seen.add(c.card_id));
  const max = cards.length >= SUMMARY_BIG ? Math.min(3, SUMMARY_NAMES) : SUMMARY_NAMES;
  return { total: cards.length, groups, fresh: freshIds.size, names: top.slice(0, max).map((c) => c.name), more: Math.max(0, top.length - max) };
}

/**
 * Pastilles colorées du résumé (« 3 communes », « 1 épique brillante », « 2 nouvelles ») : le texte est toujours présent,
 * la couleur n'est qu'un repère (lisible en mode daltonien).
 * @param {ReturnType<typeof raritySummary>} sum résumé
 * @returns {string} HTML
 */
function summaryHtml(sum) {
  if (!sum.total) return '';
  const chips = sum.groups.map((g) => `<li class="rv-chip rv-${esc(g.id)}"><i aria-hidden="true"></i>${esc(g.text)}</li>`);
  if (sum.fresh) chips.push(`<li class="rv-chip rv-new">${esc(pluralCount(sum.fresh, 'nouvelle', 'nouvelles', nf.format))}</li>`);
  return `<ul class="rv-sum" aria-label="Résumé de l’ouverture">${chips.join('')}</ul>`;
}

/**
 * Texte du résumé pour l'annonce : « 5 cartes : 3 communes, 1 rare, 1 épique brillante, Pick’em des Worlds. 2 nouvelles pour ta collection. »
 * Au-delà de SUMMARY_BIG cartes, seules quelques cartes à partir d'épique sont nommées.
 * @param {ReturnType<typeof raritySummary>} sum résumé
 * @returns {string}
 */
function summaryText(sum) {
  if (!sum.total) return 'Aucune carte.';
  let names = sum.names.join(', ');
  if (names && sum.more) names += ` et ${pluralCount(sum.more, 'autre belle carte', 'autres belles cartes', nf.format)}`;
  return `${pluralCount(sum.total, 'carte', 'cartes', nf.format)} : ${sum.groups.map((g) => g.text).join(', ')}${names ? `, ${names}` : ''}.`
    + (sum.fresh ? ` ${pluralCount(sum.fresh, 'nouvelle pour ta collection', 'nouvelles pour ta collection', nf.format)}.` : '');
}

/**
 * Interrupteur « Révéler mes boosters d'un coup » sous le résultat (le même réglage que dans les Préférences d'affichage).
 * @returns {string} HTML
 */
function revealPrefHtml() {
  return `<label class="switch-row rv-pref"><span class="switch-txt"><strong>Révéler mes boosters d’un coup</strong>`
    + `<small>Sans la séquence animée. Aussi dans les Préférences d’affichage.</small></span>`
    + `<input class="pref-switch" type="checkbox" role="switch" data-change="reveal-direct"${getPrefs().revealDirect ? ' checked' : ''}></label>`;
}

/**
 * Vrai si l'ouverture doit être animée : mouvement permis, préférence « Révéler d'un coup » coupée et au moins une carte.
 * @param {number} n nombre de cartes
 * @returns {boolean}
 */
const animateReveal = (n) => n > 0 && motionAllowed() && !getPrefs().revealDirect;

/* ---------- Révélation groupée (ouverture de plusieurs boosters) ---------- */
/** Titre du résumé d'une ouverture groupée : « 5 boosters · 25 cartes · meilleure : Rare ». */
const multiHead = (R) => `${pluralCount(R.opened, 'booster', 'boosters', nf.format)}${R.opened < R.total ? ` sur ${nf.format(R.total)}` : ''}`
  + ` · ${pluralCount(R.cards.length, 'carte', 'cartes', nf.format)}`
  + (R.best ? ` · meilleure : ${rarityLabel(R.best)}` : '');
/** Ligne sous le résumé : nombre de cartes nouvelles pour la collection et de brillantes. */
const multiSub = (R) => pluralCount(R.fresh, 'nouvelle pour ta collection', 'nouvelles pour ta collection', nf.format)
  + (R.shinies ? ` · ${pluralCount(R.shinies, 'brillante', 'brillantes', nf.format)}` : '');
/** Ligne du résumé pour les boosters déjà ouverts côté serveur (réponse perdue) : leurs cartes sont dans la collection. Vide si aucun. */
const dupText = (R) => (R.dup ? pluralCount(R.dup, 'booster déjà ouvert : ses cartes sont dans ta collection', 'boosters déjà ouverts : leurs cartes sont dans ta collection', nf.format) : '');

// Grille de toutes les cartes obtenues, la plus rare en premier ; les cartes non encore révélées montrent le dos.
/**
 * HTML de la grille d'une ouverture groupée : chaque carte est un dos tant qu'elle n'est pas révélée.
 * @param {object} R ouverture groupée
 * @returns {string}
 */
function multiHtml(R) {
  const done = R.phase !== 'seq';
  const cells = R.cards.map((card, i) => {
    const rank = rarityRank(card.rarity);
    const cls = ['x5-cell', R.revealed.has(i) ? '' : 'is-pending', card.shiny ? 'is-shiny' : '', rank >= 5 ? 'is-top' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" id="x5-c${i}" data-rank="${rank}" role="button" tabindex="0" data-action="booster-card" data-i="${i}" aria-label="${esc(boosterCardLabel(card, R.revealed.has(i)))}">`
      + `<div class="x5-back">${cardBackHtml('sm')}</div>`
      + `<div class="x5-front">${cardHtml(card, { shiny: card.shiny, serial: card.serial, size: 'sm' })}</div></div>`;
  }).join('');
  const list = `<ul class="visually-hidden">${R.cards.map((c) => `<li>${esc(c.name)} : ${esc(rarityLabel(c.rarity))}${c.shiny ? ', brillante' : ''}</li>`).join('')}</ul>`;
  const actions = done
    ? '<button type="button" class="btn btn-primary" data-action="close-reveal">Fermer</button>'
    : '<button type="button" class="btn btn-ghost" data-action="reveal-all">Tout révéler</button>';
  return `
    <section class="card cartes-block" aria-labelledby="cartes-reveal-h">
      <h2 id="cartes-reveal-h">Tes boosters</h2>
      <div class="x5-sum">
        <p class="x5-head">${esc(multiHead(R))}</p>
        <p class="cartes-small">${esc(multiSub(R))}</p>
        ${R.dup ? `<p class="cartes-small">${esc(dupText(R))}</p>` : ''}
        ${done && R.note ? `<p class="muted small">${esc(R.note)}</p>` : ''}
      </div>
      ${done ? summaryHtml(raritySummary(R.cards, R.freshIds)) : ''}
      <div class="x5-grid">${cells}</div>${list}
      ${revealHint(R)}
      <div class="cartes-row">${actions}</div>
      ${done ? revealPrefHtml() : ''}
    </section>`;
}

/**
 * Dessine la révélation groupée dans `box`, et annonce le résumé aux lecteurs d'écran une seule fois à la fin.
 * @param {HTMLElement} box zone de la révélation
 * @param {object} R ouverture groupée
 */
function renderMultiReveal(box, R) {
  if (R.big) { renderBigReveal(box, R); return; }
  box.innerHTML = multiHtml(R);
  if (R.phase !== 'seq' && !R.announced) {
    R.announced = true;
    $('#cartes-live').textContent = `Boosters ouverts. ${summaryText(raritySummary(R.cards, R.freshIds))}`;
  }
}

/** Ferme la révélation (simple ou groupée) et redessine les boosters. */
function closeReveal() {
  if (S.reveal?.timer) clearTimeout(S.reveal.timer);
  S.reveal = null;
  renderBoosters();
}

// Contenu de la scène : cartouche, console, cartes en éventail (dos puis face).
/**
 * HTML de la scène d'ouverture : cartouche, console (BOOT, barre, meilleure rareté) et cartes en éventail.
 * @param {object} R ouverture en cours
 * @returns {string}
 */
function stageHtml(R) {
  const n = R.cards.length;
  const bestName = R.best ? rarityLabel(R.best) : 'aucune';
  const cards = R.cards.map((card, i) => {
    const off = i - (n - 1) / 2;
    return `<div class="op-card" data-i="${i}" role="button" tabindex="0" data-action="booster-card" aria-label="${esc(boosterCardLabel(card, R.revealed.has(i)))}" style="--i:${off};--r:${off * 6}deg;--y:${330 + Math.abs(off) * 4};z-index:${10 + i}">`
      + `<div class="op-inner"><div class="op-face op-back">${cardBackHtml('sm')}</div>`
      + `<div class="op-face op-front">${cardHtml(card, { shiny: card.shiny, serial: card.serial, size: 'sm' })}</div></div></div>`;
  }).join('');
  const bars = Array.from({ length: 8 }, (_, k) => `<i style="--k:${k}"></i>`).join('');
  return `<div class="op-cart" aria-hidden="true">${cartridgeHtml({ type: R.type, series: R.setName })}</div>`
    + '<div class="op-con" aria-hidden="true"><div class="op-con-body"></div><div class="op-slot"></div>'
    + '<div class="op-scr"><div class="op-flash"></div>'
    + '<p class="op-l1">BOOT HG v1.0</p>'
    + `<p class="op-l2">LECTURE DU PAQUET ${n}/${n}</p>`
    + `<div class="op-bar">${bars}</div>`
    + `<p class="op-l3">&gt; MEILLEURE : ${esc(bestName.toUpperCase())}_</p></div>`
    + '<i class="op-led op-led1"></i><i class="op-led op-led2"></i><div class="op-tray"></div></div>'
    + cards;
}

/** Dessine la révélation d'un booster simple (scène animée ou grille directe). Ne fait rien s'il n'y en a pas. */
function renderReveal() {
  const box = $('#cartes-reveal');
  if (!box) return;
  const R = S.reveal;
  if (!R) { box.innerHTML = ''; return; }
  if (R.multi) { renderMultiReveal(box, R); return; }
  const done = R.phase !== 'seq';
  const best = R.best ? rarityLabel(R.best) : '—';
  const body = R.seq
    ? `<div class="fit op-wrap" data-w="400" style="--h:520"><div class="fit-in op-stage" id="op-stage" style="--fc:${tintOf(R.best)}">${stageHtml(R)}</div></div>`
    : `<div class="cartes-booster-grid">${R.cards.map((card, i) => cardHtml(card, { shiny: card.shiny, serial: card.serial, size: 'md', button: true, attrs: `data-action="booster-card" data-i="${i}"` })).join('')}</div>`;
  const list = `<ul class="visually-hidden">${R.cards.map((c) => `<li>${esc(c.name)} : ${esc(rarityLabel(c.rarity))}${c.shiny ? ', brillante' : ''}</li>`).join('')}</ul>`;
  const actions = done
    ? `<p class="muted">Meilleure carte : ${esc(best)}</p>
       <button type="button" class="btn btn-primary" data-action="close-reveal">Fermer</button>`
    : '<button type="button" class="btn btn-ghost" data-action="reveal-all">Tout révéler</button>';
  box.innerHTML = `
    <section class="card cartes-block" aria-labelledby="cartes-reveal-h">
      <h2 id="cartes-reveal-h" tabindex="-1">Ton booster</h2>
      ${done ? summaryHtml(raritySummary(R.cards, R.freshIds)) : ''}
      ${body}${list}
      ${revealHint(R)}
      <div class="cartes-row">${actions}</div>
      ${done ? revealPrefHtml() : ''}
    </section>`;
  if (R.seq) applyStage(R);
  // Pas de scène animée (mouvement réduit) : un flash doux pour les thèmes « fête », seulement si les effets sont permis.
  else if (!R.fxDone && effectsEnabled()) { R.fxDone = true; playOpeningFx(null, styleClass(R.type), { soft: true }); }
  fitAll(box);
  if (done && !R.announced) {
    R.announced = true;
    $('#cartes-live').textContent = `Booster ouvert. ${summaryText(raritySummary(R.cards, R.freshIds))}`;
  }
}

// Identifiant d'une demande d'ouverture (un par booster) : le serveur ne rouvre pas deux fois la même demande.
/** Crée un identifiant de demande (UUID si le navigateur sait en faire, sinon un repli horodaté). */
const newReqId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Appel d'ouverture : hg_open_booster_req (migrations 021 et 042). Plus de repli sur l'ancienne hg_open_booster :
// son chemin payant contournait la Boutique et est refusé depuis la migration 074.
/**
 * Ouvre un booster côté serveur.
 * @param {boolean} free true pour le booster gratuit
 * @param {string} reqId identifiant de la demande (le serveur ne rouvre pas deux fois la même demande)
 * @param {boolean} [offert=false] true pour un booster offert
 * @returns {Promise<object>} résultat : cartes, meilleure rareté, nombre demandé et livré
 */
async function rpcOpenBooster(free, reqId, offert = false) {
  if (offert) {
    const { data, error } = await sb.rpc('hg_open_booster_req', { p_free: false, p_request: reqId, p_offert: true });
    if (error) throw error;
    if (data == null) throw new Error('Les boosters offerts ne sont pas encore disponibles. Réessaie plus tard.');
    return data;
  }
  const { data, error } = await sb.rpc('hg_open_booster_req', { p_free: !!free, p_request: reqId });
  if (error) throw error;
  return data;
}

// Annonce Discord des belles cartes et alerte des membres qui les souhaitent (vérifiées côté serveur par hg-notify).
/**
 * Envoie les notifications après une ouverture : cartes légendaires, mythiques ou identité, et alerte des
 * membres qui souhaitent ces cartes. Les erreurs sont ignorées (une notification ne doit pas casser l'ouverture).
 * @param {object[]} cards cartes obtenues
 */
function announceCards(cards) {
  for (const c of cards) if (['legendaire', 'mythique', 'identite', 'unique'].includes(c.rarity)) notify('card_pull', { card: c.card_id, rarity: c.rarity, shiny: c.shiny, serial: c.serial }).catch(() => {});
  if (cards.length) notify('card_wish', { cards: cards.map((c) => c.card_id) }).catch(() => {}); // alerte des membres qui souhaitent ces cartes (opt-in)
}

/**
 * Ouverture commune à tous les boosters (repli ou typés) : appel de la RPC, annonces, puis révélation (animée ou directe).
 * La même demande garde le même identifiant tant qu'elle n'a pas abouti (voir S.bootReq) : si la réponse se perd et que
 * l'utilisateur relance, le serveur ne rouvre pas de booster.
 * Un remboursement (cartes déjà toutes possédées, mode typé) est annoncé par un message à la place du « carte livrée sur… ».
 * @param {{key: string, type?: object|null, setName?: string, call: (reqId: string) => Promise<object>}} o
 *   key : mode de la demande (une autre clé remplace l'identifiant gardé) ; type : type de booster (cartouche de la scène) ;
 *   setName : série choisie (cartouche « Série ») ; call : appel de la RPC avec l'identifiant de la demande
 * @returns {Promise<void>}
 */
async function runOpen({ key, type = null, setName = '', call }) {
  if (isBusy()) return;
  S.busy = true;
  renderBoosters();
  let R = null;
  let state = 'error'; // 'ok' : ouvert ; 'dup' : déjà ouvert côté serveur (demande rejouée) ; 'error' : rien d'ouvert
  if (!S.bootReq || S.bootReq.mode !== key) S.bootReq = { mode: key, id: newReqId() };
  const owned = new Set(S.copies.map((c) => c.card_id)); // collection avant l'ouverture : sert à compter les nouvelles cartes
  try {
    const data = await call(S.bootReq.id);
    S.bootReq = null;
    state = 'ok';
    const cards = data?.cards || [];
    // Nombre réellement livré (peut être inférieur au nombre payé si le tirage n'a pas trouvé de carte)
    const asked = Number(data?.demandees) || cards.length;
    const got = Number(data?.livrees) || cards.length;
    const refund = Number(data?.refund) || 0;
    if (refund > 0) {
      // Collectionneur : les cartes déjà toutes possédées sont remboursées au prix d'une carte.
      const missed = asked - got;
      toast(`${pluralCount(missed, 'carte déjà possédée', 'cartes déjà toutes possédées', nf.format)} : ${fmtP(refund)} remboursés`, 'ok');
    } else if (got < asked) {
      toast(`${got} carte${got > 1 ? 's' : ''} livrée${got > 1 ? 's' : ''} sur ${asked} : le tirage n'a pas trouvé de carte pour certains emplacements.`);
    }
    announceCards(cards);
    // Animation seulement si le mouvement est permis, que la préférence « Révéler d'un coup » est coupée et qu'il y a des cartes.
    const seq = animateReveal(cards.length);
    const freshIds = new Set(cards.filter((c) => !owned.has(c.card_id)).map((c) => c.card_id));
    R = { cards, best: data?.best, type, setName, freshIds, revealed: new Set(), announced: false, seq, phase: seq ? 'seq' : 'done', step: 0, timer: null };
    if (!seq) R.cards.forEach((_, i) => R.revealed.add(i));
    if (cards.length === 5) R.penta = pentakillCheck(); // lancé tout de suite, la bannière attend la 5e carte (voir pentaShow)
    S.reveal = R;
  } catch (e) {
    if (String(e?.message || '').includes('booster_deja_ouvert')) {
      // Le serveur a déjà traité cette demande : on ne la renvoie pas, on recharge l'état.
      S.bootReq = null;
      state = 'dup';
      toast('Ce booster a déjà été ouvert. Ton inventaire est à jour.');
    } else {
      toast(errMsg(e), 'error');
    }
  }
  // Le rechargement vient après une ouverture réussie ou déjà faite : son échec ne fait pas échouer l'ouverture.
  if (state !== 'error') await refreshAfter(refreshData);
  S.busy = false;
  renderAll();
  loadQuests(); // l'ouverture d'un booster fait avancer les quêtes
  restoreFocus(() => document.getElementById('cartes-reveal'));
  if (R && S.reveal === R && R.seq && R.phase === 'seq') {
    $('#cartes-live').textContent = 'Ouverture du booster en cours.';
    $('#cartes-reveal')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    focusRevealAll();
    startSeq(R);
  } else if (R && S.reveal === R) { focusRevealEnd(); pentaShow(R); }
}

/**
 * Ouvre le booster gratuit du jour ou un booster offert (mode repli, RPC d'origine), puis lance sa révélation.
 * @param {boolean} free true pour le booster gratuit du jour
 * @param {boolean} [offert=false] true pour un booster du stock offert par le gang
 * @returns {Promise<void>}
 */
function openBooster(free, offert = false) {
  const mode = offert ? 'offert' : 'gratuit';
  return runOpen({ key: mode, call: (reqId) => rpcOpenBooster(free, reqId, offert) });
}

/**
 * Appel de hg_booster_open (boosters typés) : mode « stock » (prend un booster en stock) ou « gratuit ».
 * @param {string} typeId identifiant du type
 * @param {'stock'|'gratuit'} mode mode d'ouverture (l'achat passe par la Boutique : hg_booster_buy)
 * @param {string} reqId identifiant de la demande (le serveur ne rouvre pas deux fois la même demande)
 * @param {string|null} [setId] série (obligatoire pour le type « Série »)
 * @returns {Promise<object>} résultat : cartes, meilleure rareté, nombre demandé et livré, remboursement
 */
async function rpcOpenTyped(typeId, mode, reqId, setId = null) {
  const { data, error } = await sb.rpc('hg_booster_open', { p_type: typeId, p_mode: mode, p_request: reqId, p_set: setId });
  if (error) throw error;
  return data;
}

/**
 * Ouvre un booster d'un type (mode typé), puis lance sa révélation dans la cartouche du type.
 * @param {string} typeId identifiant du type
 * @param {'stock'|'gratuit'} mode mode d'ouverture (l'achat passe par la Boutique : hg_booster_buy)
 * @param {string|null} [setId] série choisie (type « Série »)
 * @returns {Promise<void>}
 */
function openTyped(typeId, mode, setId = null) {
  const type = typeOf(typeId);
  if (!type) { toast('Ce booster n’est pas disponible pour le moment.', 'error'); return Promise.resolve(); }
  const setName = setId ? S.sets.find((s) => s.id === setId)?.name || '' : '';
  return runOpen({ key: `${typeId}|${mode}|${setId || ''}`, type, setName, call: (reqId) => rpcOpenTyped(typeId, mode, reqId, setId) });
}

/**
 * Point d'entrée des boutons d'ouverture typés : pour le type « Série », demande d'abord la série (dialogue), puis ouvre.
 * Les autres types ouvrent tout de suite. Passe sur l'onglet Ouverture avant l'ouverture (jamais avant le dialogue).
 * @param {string} typeId identifiant du type
 * @param {'stock'|'gratuit'} mode mode d'ouverture (l'achat passe par la Boutique : hg_booster_buy)
 * @param {HTMLElement} [from] bouton d'origine (le focus y revient si le dialogue est annulé)
 * @returns {Promise<void>|void}
 */
function openWithPick(typeId, mode, from) {
  if (isBusy()) return;
  const type = typeOf(typeId);
  if (!type) { toast('Ce booster n’est pas disponible pour le moment.', 'error'); return; }
  if (type.pool !== 'serie') { toOuverture(); return openTyped(typeId, mode); }
  askSerie(from, (setId) => { toOuverture(); return openTyped(typeId, mode, setId); });
}

/**
 * Ouvre le dialogue de choix de la série (S.sets : séries ouvertes et commencées). La dernière est présélectionnée,
 * le premier choix reçoit le focus. Confirmer appelle onPick avec l'identifiant de la série ; Échap ou Annuler ferme sans rien ouvrir.
 * @param {HTMLElement|undefined} from bouton d'origine (le focus y revient)
 * @param {(setId: string) => void} onPick reçoit l'identifiant de la série choisie
 */
function askSerie(from, onPick) {
  // Les séries réservées (saison, sorties : migration 080) ne se choisissent pas dans le booster « Série ».
  const sets = S.sets.filter((s) => !s.booster_scope);
  if (!sets.length) { toast('Aucune série n’est ouverte pour le moment.', 'error'); return; }
  const dlg = $('#cartes-serie-pick');
  const last = sets.length - 1;
  $('#cartes-serie-list').innerHTML = sets.map((s, i) => `<label class="serie-opt">
      <input type="radio" name="serie-set" value="${esc(s.id)}"${i === last ? ' checked' : ''}>
      <span><strong>${esc(s.name)}</strong>${s.description ? `<span class="muted small">${esc(s.description)}</span>` : ''}</span>
    </label>`).join('');
  S.seriePick = { from, onPick };
  if (!dlg.open) dlg.showModal();
  $('#cartes-serie-list input[type=radio]')?.focus({ preventScroll: true });
}

/**
 * Confirme le choix de la série : ferme le dialogue puis lance l'ouverture avec la série choisie.
 */
function confirmSerie() {
  const dlg = $('#cartes-serie-pick');
  const pick = dlg.querySelector('input[name=serie-set]:checked');
  const ask = S.seriePick;
  if (!pick || !ask) return;
  S.seriePick = null; // pas de retour du focus : l'ouverture redessine les boutons
  dlg.close();
  ask.onPick(pick.value);
}

/* ---------- Ouverture de plusieurs boosters du stock (onglet Ouverture) ---------- */
// Une ouverture groupée enchaîne des appels hg_booster_open (mode stock), un par booster, chacun avec son identifiant de demande :
// le serveur ne rouvre jamais deux fois la même demande. À la première erreur on s'arrête ; S.x5 garde les demandes restantes,
// et le bouton « Reprendre l'ouverture » les envoie sans rien rouvrir deux fois.
// Tri de la révélation : la carte la plus rare d'abord, les brillantes avant, puis le numéro de la série.
/** Comparaison pour trier les cartes : rareté décroissante, brillantes d'abord, puis numéro croissant. */
const byRarityDesc = (a, b) => (rarityRank(b.rarity) - rarityRank(a.rarity))
  || (Number(!!b.shiny) - Number(!!a.shiny))
  || ((Number(a.number) || 0) - (Number(b.number) || 0));
/** Nombre maximal de meilleures cartes (légendaire et plus, ou nouvelles) listées dans le résumé d'une grosse ouverture. */
const BEST_MAX = 30;

/**
 * Un booster du stock à ouvrir dans une ouverture groupée : hg_booster_open (mode stock) en mode typé,
 * hg_open_booster_req avec p_offert en repli.
 * @param {{type: string, set: string|null, id: string}} it booster (identifiant de demande, série si le type est « Série »)
 * @returns {Promise<object>} résultat de la RPC
 */
const openStockOne = (it) => (typed() ? rpcOpenTyped(it.type, 'stock', it.id, it.set) : rpcOpenBooster(false, it.id, true));

/**
 * Ouvre une suite de boosters du stock, un à un, puis affiche le résultat.
 * Jusqu'à MULTI_COUNT boosters : révélation en cascade, carte par carte. Au-delà : progression « Ouverture : k / N » pendant
 * l'ouverture, puis résumé (par rareté, meilleures cartes et nouvelles) et « Voir toutes les cartes » ; sans animation.
 * @param {Array<{type: string, set: string|null}>|null} items boosters à ouvrir ; null pour reprendre l'ouverture interrompue (S.x5)
 * @param {string} [key=''] identifiant de l'ouverture (type ou « all »)
 * @returns {Promise<void>}
 */
async function runMulti(items, key = '') {
  if (isBusy()) return;
  let st = S.x5;
  if (items) {
    if (!items.length) return;
    st = S.x5 = { key, items: items.map((it) => ({ ...it, id: newReqId() })), next: 0, opened: 0, dup: 0, cards: [], owned: new Set(S.copies.map((c) => c.card_id)) };
  }
  if (!st || st.next >= st.items.length) return;
  const total = st.items.length;
  const big = total > MULTI_COUNT;
  S.busy = true;
  if (big) S.reveal = { multi: true, big: true, phase: 'opening', progress: st.next, total, cards: [], revealed: new Set(), showAll: false, announced: false };
  renderBoosters();
  let stopMsg = '';
  /** Avancement de la grosse ouverture (« Ouverture : k / N »). */
  const progress = () => { if (big) { S.reveal.progress = st.next; renderReveal(); } };
  while (st.next < total) {
    try {
      const data = await openStockOne(st.items[st.next]);
      const cards = data?.cards || [];
      st.cards.push(...cards);
      st.opened += 1;
      st.lastN = cards.length; // taille du dernier booster ouvert : Pentakill seulement si elle vaut 5
      st.next += 1;
      announceCards(cards);
    } catch (e) {
      if (String(e?.message || '').includes('booster_deja_ouvert')) {
        // Le serveur a déjà ouvert ce booster (réponse perdue) : ses cartes sont dans la collection. On le compte et on continue.
        st.next += 1;
        st.dup += 1;
        progress();
        continue;
      }
      stopMsg = errMsg(e);
      break; // à la première erreur, les boosters suivants ne sont pas ouverts
    }
    progress();
  }
  if (st.next >= total) S.x5 = null; // ouverture terminée : rien à reprendre
  let R = null;
  if (st.cards.length || st.dup) {
    const cards = [...st.cards].sort(byRarityDesc);
    const seq = !big && animateReveal(cards.length);
    const freshIds = new Set(cards.filter((c) => !st.owned.has(c.card_id)).map((c) => c.card_id));
    R = {
      multi: true, big, cards, opened: st.opened, total, best: cards[0]?.rarity ?? null,
      fresh: freshIds.size, freshIds,
      shinies: cards.filter((c) => c.shiny).length,
      dup: st.dup,
      note: stopMsg ? `Ouverture interrompue : ${stopMsg}` : '',
      seq, phase: seq ? 'seq' : 'done', progress: st.opened, showAll: false,
      revealed: new Set(), timer: null, announced: false,
    };
    if (!seq) cards.forEach((_, i) => R.revealed.add(i));
    if (st.lastN === 5) R.penta = pentakillCheck(); // le serveur vérifie la dernière ouverture
  }
  S.reveal = R;
  if (stopMsg) {
    const n = st.opened;
    toast(n ? `${n} booster${n > 1 ? 's' : ''} ouvert${n > 1 ? 's' : ''} sur ${total} : ${stopMsg}` : stopMsg, 'error');
  }
  // Le rechargement ne fait pas échouer l'ouverture (voir refreshAfter).
  if (st.opened || st.dup) await refreshAfter(refreshData);
  S.busy = false;
  renderAll();
  restoreFocus(() => document.getElementById('cartes-reveal'));
  loadQuests(); // l'ouverture de boosters fait avancer les quêtes
  if (R) {
    $('#cartes-reveal')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (R.seq) {
      $('#cartes-live').textContent = 'Ouverture des boosters en cours.';
      focusRevealAll();
      startMulti(R);
    } else { focusRevealEnd(); pentaShow(R); }
  }
}

/**
 * Bouton « Ouvrir 5 » ou « Tout ouvrir » d'une tuile de stock. Pour le type « Série », demande d'abord la série (une fois pour tout le lot).
 * @param {string} typeId identifiant du type (« classique » en repli)
 * @param {number} count nombre de boosters voulu (Infinity pour « Tout ouvrir »), plafonné au stock
 * @param {HTMLElement} [from] bouton d'origine (le focus y revient si le dialogue est annulé)
 * @returns {Promise<void>|void}
 */
function openStockMulti(typeId, count, from) {
  if (isBusy()) return;
  const t = typed() ? typeOf(typeId) : null;
  if (typed() && !t) { toast('Ce booster n’est pas disponible pour le moment.', 'error'); return; }
  const n = Math.min(count, stockOf(typeId));
  if (!(n >= 1)) return;
  const make = (setId) => Array.from({ length: n }, () => ({ type: typeId, set: setId }));
  if (t?.pool === 'serie') return askSerie(from, (setId) => runMulti(make(setId), typeId));
  return runMulti(make(null), typeId);
}

/**
 * Bouton « Ouvrir tout l'inventaire » : ouvre tous les boosters en stock, type par type (ordre d'affichage).
 * La série des boosters « Série » est demandée une seule fois.
 * @param {HTMLElement} [from] bouton d'origine
 * @returns {Promise<void>|void}
 */
function openAllStock(from) {
  if (isBusy() || !typed()) return;
  const types = stockedTypes();
  if (!types.length) return;
  const make = (setId) => types.flatMap((t) => Array.from({ length: Number(t.stock) }, () => ({ type: t.id, set: t.pool === 'serie' ? setId : null })));
  if (types.some((t) => t.pool === 'serie')) return askSerie(from, (setId) => runMulti(make(setId), 'all'));
  return runMulti(make(null), 'all');
}

/** Affiche ou masque la grille complète d'une grosse ouverture (bouton « Voir toutes les cartes »). */
function toggleAllCards() {
  const R = S.reveal;
  if (!R?.big) return;
  R.showAll = !R.showAll;
  renderReveal();
  $('#cartes-toggle-all')?.focus({ preventScroll: true });
}

/**
 * Révélation d'une grosse ouverture (plus de MULTI_COUNT boosters) : pendant l'ouverture, la progression « Ouverture : k / N » ;
 * à la fin, le résumé (boosters, cartes par rareté, meilleures cartes et nouvelles), puis la grille complète sur demande.
 * Pas d'animation : la grille s'affiche d'un coup.
 * @param {HTMLElement} box zone de la révélation
 * @param {object} R ouverture groupée (big)
 */
function renderBigReveal(box, R) {
  if (R.phase === 'opening') {
    box.innerHTML = `
    <section class="card cartes-block" aria-labelledby="cartes-reveal-h">
      <h2 id="cartes-reveal-h">Tes boosters</h2>
      <p class="x5-progress" role="status">Ouverture : ${nf.format(R.progress)} / ${nf.format(R.total)}</p>
    </section>`;
    return;
  }
  const counts = new Map();
  for (const c of R.cards) counts.set(c.rarity, (counts.get(c.rarity) || 0) + 1);
  const ranks = RARITIES_TIRAGE.filter((r) => counts.has(r.id)).sort((a, b) => rarityRank(b.id) - rarityRank(a.id))
    .map((r) => `<li><span>${esc(r.label)}</span><strong>${nf.format(counts.get(r.id))}</strong></li>`).join('');
  // Meilleures cartes : légendaire et plus, ou nouvelles pour la collection ; une carte n'est listée qu'une fois.
  const seen = new Set();
  const top = R.cards.filter((c) => {
    if (seen.has(c.card_id)) return false;
    const keep = rarityRank(c.rarity) >= 5 || R.freshIds.has(c.card_id);
    if (keep) seen.add(c.card_id);
    return keep;
  });
  const shown = top.slice(0, BEST_MAX);
  const cell = (c) => cardHtml(c, { shiny: c.shiny, serial: c.serial, size: 'sm' });
  if (!R.announced) {
    R.announced = true;
    $('#cartes-live').textContent = `Boosters ouverts. ${pluralCount(R.opened, 'booster', 'boosters', nf.format)}. ${summaryText(raritySummary(R.cards, R.freshIds))}`;
  }
  box.innerHTML = `
    <section class="card cartes-block" aria-labelledby="cartes-reveal-h">
      <h2 id="cartes-reveal-h">Tes boosters</h2>
      <div class="x5-sum">
        <p class="x5-head">${esc(multiHead(R))}</p>
        <p class="cartes-small">${esc(multiSub(R))}</p>
        ${R.dup ? `<p class="cartes-small">${esc(dupText(R))}</p>` : ''}
        ${R.note ? `<p class="muted small">${esc(R.note)}</p>` : ''}
      </div>
      <ul class="x5-ranks" aria-label="Cartes par rareté">${ranks}</ul>
      <h3 class="cart-h x5-h">Meilleures cartes et nouvelles</h3>
      ${shown.length ? `<div class="cartes-booster-grid">${shown.map(cell).join('')}</div>` : '<p class="muted small">Aucune carte légendaire ni nouvelle cette fois.</p>'}
      ${top.length > shown.length ? `<p class="muted small">${pluralCount(top.length - shown.length, 'autre carte rare ou nouvelle', 'autres cartes rares ou nouvelles', nf.format)}, dans la liste complète.</p>` : ''}
      <div class="cartes-row">
        <button type="button" id="cartes-toggle-all" class="btn btn-ghost" data-action="toggle-all-cards" aria-expanded="${R.showAll}">${R.showAll ? 'Masquer les cartes' : `Voir toutes les cartes (${nf.format(R.cards.length)})`}</button>
        <button type="button" class="btn btn-primary" data-action="close-reveal">Fermer</button>
      </div>
      ${R.showAll ? `<div class="cartes-booster-grid x5-all">${R.cards.map(cell).join('')}</div>` : ''}
    </section>`;
}

// Révélation en cascade, de la carte la plus rare à la moins rare.
/**
 * Lance la révélation en cascade d'une ouverture groupée : une carte toutes les MULTI_STEP_MS.
 * @param {object} R ouverture groupée
 */
function startMulti(R) {
  /** Révèle la carte i, puis programme la suivante (ou termine après la dernière). */
  const step = (i) => {
    R.timer = null;
    if (S.reveal !== R || R.phase !== 'seq') return;
    revealMulti(R, i);
    if (i + 1 >= R.cards.length) return finishMulti(R);
    R.timer = setTimeout(() => step(i + 1), MULTI_STEP_MS);
  };
  R.timer = setTimeout(() => step(0), 350);
}

/**
 * Révèle la carte i d'une ouverture groupée (retire son dos) ; joue un son pour une rareté à partir de légendaire.
 * @param {object} R ouverture groupée
 * @param {number} i index de la carte
 */
function revealMulti(R, i) {
  const card = R.cards[i];
  if (!card || R.revealed.has(i)) return;
  R.revealed.add(i);
  $(`#x5-c${i}`)?.classList.remove('is-pending');
  if (rarityRank(card.rarity) >= 5) playSound('badge');
  setCardControl(R, i);
  showRevealHint();
}

/**
 * Termine l'ouverture groupée : toutes les cartes sont révélées, le résumé s'affiche.
 * @param {object} R ouverture groupée
 */
function finishMulti(R) {
  if (R.timer) clearTimeout(R.timer);
  R.timer = null;
  R.phase = 'done';
  R.cards.forEach((_, i) => R.revealed.add(i));
  renderBoosters(); // réactive les boutons et affiche le résumé (annoncé par renderMultiReveal)
  focusRevealEnd();
  pentaShow(R);
}

/** Réclame le passage du jour (hg_cards_daily) : Paillettes et série de jours consécutifs. */
async function claimDaily() {
  if (S.busy) return;
  S.busy = true;
  let res;
  try {
    res = await sb.rpc('hg_cards_daily');
    if (res.error) throw res.error;
  } catch (e) {
    toast(errMsg(e), 'error');
    S.busy = false;
    renderAll();
    return;
  }
  const data = res.data;
  toast(`+${fmtP(data.gain)} · série de ${pluralCount(data.streak, 'jour', 'jours', nf.format)}`, 'ok');
  await refreshAfter(refreshData);
  S.busy = false;
  renderAll();
}

/* ---------- Collection ---------- */
// Une carte de la collection : la carte (bouton, fiche détail) et, à côté, la loupe qui ouvre la carte agrandie.
/** Code de la série d'une carte (séries ouvertes ou chargées à part), ou ''. */
const setCodeOf = (setId) => (S.sets.find((s) => s.id === setId) || S.otherSets.get(setId))?.code || '';
/**
 * Apparence liée aux exemplaires (migration 080) : finition « fondue » d'une brillante et tampon « J’y étais » des cartes de sortie.
 * @param {object} c carte
 * @param {object[]} cps exemplaires montrés
 * @returns {{finish: string|null, stamp: boolean}}
 */
const lookOf = (c, cps) => ({ finish: cps.find((x) => x.shiny && x.finish)?.finish || null, stamp: cps.length > 0 && setCodeOf(c.set_id) === 'sorties' });
/** Libellé de la brillance d'un exemplaire dans les lignes de détail. */
const shinyWord = (cp) => (cp.shiny ? (cp.finish === 'fondue' ? 'brillante fondue' : 'brillante') : '');

/**
 * Une case de la collection : la carte (ouvre la fiche détail) et le bouton loupe.
 * @param {object} c carte (hg_cards)
 * @returns {string} HTML de la case
 */
function cardCell(c) {
  const cps = copiesOf(c.id);
  const n = cps.length;
  const shinyCp = cps.find((x) => x.shiny);
  const card = cardHtml(c, {
    size: 'md', count: n, shiny: !!shinyCp, ...lookOf(c, cps),
    serial: n === 1 && c.max_copies ? cps[0].serial : null,
    missing: n === 0, button: true,
    attrs: `data-action="open-card" data-card="${esc(c.id)}"`,
  });
  const what = n ? esc(c.name) : 'la carte';
  const state = uniqueStateOf(c);
  // Étoile des favoris : seulement pour une carte possédée (sa propre collection)
  const on = S.favs.has(c.id);
  const star = n ? `<button type="button" class="cz-star${on ? ' is-on' : ''}" data-action="fav" data-card="${esc(c.id)}" aria-pressed="${on ? 'true' : 'false'}" aria-label="${on ? 'Retirer' : 'Ajouter'} ${what} ${on ? 'des' : 'aux'} favoris">${ICON_STAR}</button>` : '';
  return `<div class="cz-cell">${card}${star}`
    + `<button type="button" class="cz-zoom" data-action="zoom-card" data-card="${esc(c.id)}" aria-label="Agrandir ${what}">${ICON_ZOOM}</button>`
    + '<span class="cz-tip" aria-hidden="true">Agrandir</span>'
    + (state ? `<span class="cartes-uniq-state">${esc(state)}</span>` : '') + '</div>';
}

// Fiche d'une carte pour la fenêtre agrandie (cartes-zoom.js) : tout est déjà chargé, aucune requête.
/**
 * Fiche de la collection pour la fenêtre agrandie (cartes-zoom.js).
 * @param {string} id identifiant de la carte
 * @returns {object|null} fiche (carte, exemplaires, série), ou null si la carte est inconnue
 */
function zoomInfo(id) {
  const k = S.cardsById.get(id);
  if (!k) return null;
  const cps = copiesOf(id);
  return {
    card: k,
    count: cps.length,
    favable: cps.length > 0, favOn: S.favs.has(id),
    shiny: cps.some((x) => x.shiny), ...lookOf(k, cps),
    serial: cps.length === 1 && k.max_copies ? cps[0].serial : null,
    missing: cps.length === 0,
    setName: (S.sets.find((s) => s.id === k.set_id) || S.otherSets.get(k.set_id))?.name || '',
    setTotal: S.cards.filter((c) => c.set_id === k.set_id).length,
    lines: cps.map((cp) => [cp.serial ? serialLabel(cp.serial, k.max_copies) : '', shinyWord(cp), SOURCE_LABEL[cp.source] || cp.source, fmtDate(cp.obtained_at)].filter(Boolean).join(' · ')),
  };
}

// Un intertitre par série dans « Toutes les séries » : nom, possédées / total, barre, cartes.
/** Identifiant d'un groupe de la collection (série ouverte ou hors série) pour data-group. */
const cleGroupe = (g) => `${g.extra ? 'x' : 's'}-${g.set?.id ?? ''}`;
/** Hauteurs des groupes mesurées avant le dernier redessin (mesurerGroupes) : estimées à l'identique au rendu suivant. */
let mesuresGroupes = new Map();
/**
 * Intertitre d'une série (vue « Toutes les séries ») : nom, compte possédées / total, barre, cartes.
 * @param {{set: object, scored: number, have: number, shown: object[]}} g série et ses cartes affichées
 * @param {number} i numéro du groupe (sert à relier le titre à sa section)
 */
function groupHtml(g, i) {
  const pct = g.scored ? Math.round(g.have / g.scored * 100) : 0;
  const hid = `cz-g-${i}`;
  if (g.extra) return `<section class="cz-group"${attrGroupe(cleGroupe(g), mesuresGroupes)} aria-labelledby="${hid}">${outsideHead(g, hid)}<div class="cartes-grid">${g.shown.map(cardCell).join('')}</div></section>`;
  // Idée 57 : série à 1-5 cartes de la fin, un rappel qui ouvre la série (aucune lecture ici)
  const manque = g.scored - g.have;
  const rappel = !OFF && !S.offline && manque >= 1 && manque <= MQ_SEUIL
    ? `<button type="button" class="mc-lien mq-rappel" data-action="mq-ouvrir" data-set="${esc(g.set.id)}">Il t’en manque ${nf.format(manque)} · qui les a en double ?</button>` : '';
  return `<section class="cz-group"${attrGroupe(cleGroupe(g), mesuresGroupes)} aria-labelledby="${hid}">
    <div class="cz-group-head">
      <h2 class="cz-group-title" id="${hid}">${esc(g.set.name)}</h2>
      <p class="cz-group-count">${nf.format(g.have)} / ${nf.format(g.scored)} possédées</p>
      ${rappel}
    </div>
    ${g.set.code === 'hors-serie' ? HORS_SERIE_NOTE : ''}
    <div class="progress cz-group-bar" role="progressbar" aria-label="Progression de ${esc(g.set.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
    <div class="cartes-grid">${g.shown.map(cardCell).join('')}</div>
  </section>`;
}

/** Types proposés par le filtre « Type » (identifiant, libellé). */
const TYPES_CARTE = [['simple', 'Simple'], ['brillante', 'Brillante'], ['numerotee', 'Numérotée'], ['hors-serie', 'Hors série']];
/** Pastilles « Dans ma collection » (identifiant, libellé). */
const VUES = [['owned', 'Possédées'], ['missing', 'Manquantes'], ['dupes', 'Doublons'], ['fav', 'Favoris'], ['wish', 'Liste de souhaits']];

/** Vrai si la carte est de ce type. Brillante : j'en possède un exemplaire brillant, la brillance étant propre à l'exemplaire. */
function estDeType(c, t) {
  if (t === 'brillante') return copiesOf(c.id).some((cp) => cp.shiny);
  const hs = setCodeOf(c.set_id) === 'hors-serie', num = !!c.max_copies;
  return t === 'numerotee' ? num : t === 'hors-serie' ? hs : !num && !hs;
}

/** Vrai si la carte correspond à une pastille « Dans ma collection ». Un favori doit être encore possédé. */
function passeVue(v, c) {
  const n = copiesOf(c.id).length;
  if (v === 'owned') return n > 0;
  if (v === 'missing') return n === 0;
  if (v === 'dupes') return hasDupes(c.id);
  if (v === 'fav') return n > 0 && S.favs.has(c.id);
  return S.wish.has(c.id);
}

/**
 * Dessine l'onglet Collection : choix de la série, filtres, progression et grille des cartes.
 * Les compteurs de progression ignorent les filtres ; seules les cartes affichées sont filtrées.
 * @param {string} [focusId] id du champ à remettre au focus après le rendu (sans défilement)
 */
function drawCollection(focusId) {
  try { performance.mark('hg-collection-start'); } catch {}
  const el = $('#cartes-p-collection');
  const none = '<p class="empty">Aucune série disponible pour le moment.</p>';
  if (!S.sets.length && !S.otherSets.size) { el.innerHTML = none; S.shownIds = []; return; }
  const all = S.setId === ALL;
  const set = all ? null : S.sets.find((s) => s.id === S.setId) || S.otherSets.get(S.setId);
  if (!all && !set) { el.innerHTML = none; S.shownIds = []; return; }
  const f = S.filters;
  const q = foldText(f.q).trim();
  /** Vrai si la carte passe les filtres de la collection (recherche, rareté, famille, possession). */
  const keep = (c) => {
    const n = copiesOf(c.id).length;
    if (q && !matchQuery(c, q)) return false;
    if (f.rarity && c.rarity !== f.rarity) return false;
    if (f.family && c.family !== f.family) return false;
    if (f.type && !estDeType(c, f.type)) return false;
    // Possédées et Manquantes cochées ensemble reviennent à tout voir ; les autres pastilles se cumulent
    if (f.vues.has('owned') !== f.vues.has('missing') && (f.vues.has('owned') ? n === 0 : n > 0)) return false;
    return ['dupes', 'fav', 'wish'].every((v) => !f.vues.has(v) || passeVue(v, c));
  };
  // Filtres fermés à l'arrivée ; le choix tient d'un dessin à l'autre
  const filtresOuverts = !!S.filtresOuverts;
  const filtresActifs = [!all, f.rarity, f.family, f.type, f.group].filter(Boolean).length + f.vues.size;
  // Une entrée par série affichée : ses compteurs (sans filtre) et ses cartes (filtrées).
  /** Compteurs et cartes affichées d'une série ouverte. */
  const openGroup = (s) => {
    const cards = S.cards.filter((c) => c.set_id === s.id);
    const scored = cards.filter((c) => c.rarity !== 'identite');
    return { set: s, scored: scored.length, have: scored.filter((c) => copiesOf(c.id).length > 0).length, shown: cards.filter(keep) };
  };
  // Cartes possédées hors des séries ouvertes (drop, don…) : groupes à part, sans progression
  const extras = outsideGroups(copiesOf, keep);
  // Série complète : toutes les cartes comptées dans la barre sont possédées, séries ouvertes seulement
  const series = S.sets.reduce((a, s) => {
    const sc = S.cards.filter((c) => c.set_id === s.id && c.rarity !== 'identite');
    return sc.length ? { total: a.total + 1, ok: a.ok + Number(sc.every((c) => copiesOf(c.id).length > 0)) } : a;
  }, { total: 0, ok: 0 });
  const outside = !all && !S.sets.some((x) => x.id === set.id);
  const groups = all ? [...S.sets.map(openGroup), ...extras] : outside ? extras.filter((g) => g.set.id === set.id) : [openGroup(set)];
  const scoredAll = groups.reduce((a, g) => a + g.scored, 0);
  const haveAll = groups.reduce((a, g) => a + g.have, 0);
  const pctDone = scoredAll ? Math.round(haveAll / scoredAll * 100) : 0;
  const withCards = groups.filter((g) => g.shown.length);
  // Liste complète (pas seulement le lot dessiné) : sert à « Précédente / Suivante » dans la carte agrandie
  S.shownIds = withCards.flatMap((g) => g.shown.map((c) => c.id));
  const sl = sliceGroups(withCards, S.colLimit);
  // Regroupement par jeu (idée C7) : proposé quand des cartes de la sélection portent un tag.
  const pool = all ? [...S.cards, ...extras.flatMap((g) => g.shown)] : outside ? (extras[0]?.shown || []) : S.cards.filter((c) => c.set_id === set.id);
  const tagged = hasTags(pool);
  const porteeCartes = all ? [...S.cards, ...outsideGroups(copiesOf, () => true).flatMap((g) => g.shown)] : pool;
  const byGame = tagged && f.group === 'jeu';
  if (byGame) S.shownIds = withCards.flatMap((g) => g.shown.filter((c) => c.tag).map((c) => c.id));
  mesuresGroupes = mesurerGroupes(el);
  const body = byGame
    ? tagGroupsHtml({ cards: withCards.flatMap((g) => g.shown), all: pool, copiesOf, cell: cardCell, open: S.jeuOpen,
      title: all ? 'Toutes les séries' : `Série « ${set.name} »` })
    : !withCards.length
    ? '<p class="empty">Aucune carte ne correspond à ces filtres.</p>'
    : (all
      ? `<div class="cz-groups">${sl.groups.map(groupHtml).join('')}</div>`
      : `<div class="cartes-grid">${(sl.groups[0]?.shown || []).map(cardCell).join('')}</div>`) + moreHtml(sl, 'col');
  const vues = VUES.map(([id, label]) => [id, label, porteeCartes.filter((c) => passeVue(id, c)).length]);
  // Idée 57 : une série ouverte choisie, à 1-5 cartes de la fin. L'encadré lit qui les a en double (une seule RPC, au besoin).
  S.mqVue = !all && !outside && !OFF && !S.offline ? vueManquantes(groups[0]) : null;
  el.innerHTML = `
    <div class="mc-duo"><div id="cartes-luck-slot"></div><div id="cartes-atelier" hidden></div></div>
    <section class="card cartes-block">
      <div class="cartes-series mc-series">
        <div class="mc-tete">
          <p class="cartes-progress-label">${nf.format(haveAll)} / ${nf.format(scoredAll)} cartes obtenues</p>
          <p class="mc-series-ok">${nf.format(series.ok)} / ${nf.format(series.total)} <span>série${series.total > 1 ? 's' : ''} complète${series.total > 1 ? 's' : ''}</span></p>
        </div>
        <div class="progress" role="progressbar" aria-label="${all ? 'Progression de la collection' : 'Progression de la série'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctDone}"><span style="width:${pctDone}%"></span></div>
      </div>
      ${set?.code === 'hors-serie' ? HORS_SERIE_NOTE : set?.description ? `<p class="muted small">${esc(set.description)}</p>` : ''}
      <div class="mc-recherche">
        <div class="field cartes-search">
          <label for="cartes-f-q">Chercher une carte</label>
          <div class="cartes-search-box">
            <input id="cartes-f-q" type="search" data-search="col" value="${esc(f.q)}" autocomplete="off" maxlength="60" placeholder="Nom ou numéro" aria-describedby="cartes-f-q-n">
            <span class="muted small" id="cartes-f-q-n">${q ? esc(pluralCount(S.shownIds.length, 'résultat', 'résultats', nf.format)) : ''}</span>
          </div>
        </div>
        <button type="button" class="btn btn-ghost mc-filtres-btn" id="cartes-filtres-btn" data-action="filtres" aria-expanded="${filtresOuverts}" aria-controls="cartes-filtres">Filtres${filtresActifs ? ` · ${nf.format(filtresActifs)}` : ''}</button>
      </div>
      <div class="mc-filtres" id="cartes-filtres"${filtresOuverts ? '' : ' hidden'}>
        <div class="mc-selects">
          <div class="field">
            <label for="cartes-set">Série</label>
            <select id="cartes-set" data-change="set">
              <option value="${ALL}" ${all ? 'selected' : ''}>Toutes les séries</option>
              ${S.sets.map((s) => `<option value="${esc(s.id)}" ${s.id === S.setId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
              ${extras.map((g) => `<option value="${esc(g.set.id)}" ${g.set.id === S.setId ? 'selected' : ''}>${esc(g.set.name)} (pas ouverte)</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="cartes-f-rarity">Rareté</label>
            <select id="cartes-f-rarity" data-filter="rarity">
              <option value="">Toutes</option>
              ${RARITIES.map((r) => `<option value="${r.id}" ${f.rarity === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="cartes-f-family">Famille</label>
            <select id="cartes-f-family" data-filter="family">
              <option value="">Toutes</option>
              ${FAMILIES.map((x) => `<option value="${x.id}" ${f.family === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="cartes-f-type">Type</label>
            <select id="cartes-f-type" data-filter="type">
              <option value="">Tous</option>
              ${TYPES_CARTE.map(([id, label]) => `<option value="${id}" ${f.type === id ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          ${tagged ? `<div class="field">
            <label for="cartes-f-group">Grouper</label>
            <select id="cartes-f-group" data-filter="group">
              <option value="" ${f.group ? '' : 'selected'}>Par numéro</option>
              <option value="jeu" ${f.group === 'jeu' ? 'selected' : ''}>Par jeu</option>
            </select>
          </div>` : ''}
        </div>
        <fieldset class="mc-fs"><legend class="mc-lg">Dans ma collection</legend>
          <div class="mc-chips">${vues.map(([id, label, n]) => `<label class="champ-chip"><input type="checkbox" id="cartes-v-${id}" data-vue="${id}"${f.vues.has(id) ? ' checked' : ''}><span>${label}<b>${nf.format(n)}</b></span></label>`).join('')}</div>
        </fieldset>
        ${filtresActifs ? `<div class="mc-actifs"><span><strong>${nf.format(S.shownIds.length)}</strong> sur ${nf.format(porteeCartes.length)} cartes</span><button type="button" class="mc-lien" data-action="filtres-effacer">Tout effacer</button></div>` : ''}
      </div>
      <div class="mc-actions">
        <button type="button" class="btn btn-ghost" data-action="mass">Recycler mes cartes</button>
        <button type="button" class="btn btn-ghost" data-action="planche">Imprimer ma planche</button>
        <button type="button" class="btn btn-ghost" data-action="champion">Ma carte Champion</button>
      </div>
    </section>
    ${manquantesHtml()}
    ${body}`;
  if (S.mqVue && S.mq?.etat === 'charge' && !S.mq.lance) { S.mq.lance = true; chargerManquantes(S.mq.cle); }
  if (!OFF) import('./cartes-chance.js').then((m) => m.mountLuck($('#cartes-luck-slot'))).catch(() => {}); // « Ma chance » (C14)
  atelier?.drawAtelier(); // panneau de l'Atelier (idée C10)
  // Le focus revient au champ modifié sans faire défiler la page
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  lotsCol.planifier(); // remplit l'écran si la liste ne le couvre pas encore (grand écran, filtre)
  // Durée du dessin (performance.measure « hg-collection ») : suivie par le test de la collection très longue
  try { performance.measure('hg-collection', 'hg-collection-start'); } catch {}
}
const renderCollection = kept(drawCollection); // voir renderBoosters

/** Ouvre ou ferme le panneau des filtres, sans redessiner les cartes. */
function toggleFiltres() {
  S.filtresOuverts = !S.filtresOuverts;
  $('#cartes-filtres').hidden = !S.filtresOuverts;
  $('#cartes-filtres-btn').setAttribute('aria-expanded', String(S.filtresOuverts));
}

/** Efface les filtres et revient à toutes les séries ; la recherche reste. */
function effacerFiltres() {
  Object.assign(S.filters, { rarity: '', family: '', type: '', group: '' });
  S.filters.vues.clear();
  S.setId = ALL;
  S.colLimit = 0;
  renderCollection('cartes-filtres-btn');
}

/* ---------- « Il te manque N cartes pour finir la série » (idée 57) ---------- */
// Seulement quand une série ouverte est choisie et qu'il y manque 1 à MQ_SEUIL cartes. Une seule lecture (hg_serie_manquantes,
// migration 209), refaite si les cartes manquantes changent. « Toutes les séries » ne lit rien : un rappel ouvre la série.
// S.mq = { cle (série et cartes manquantes), set, etat : 'charge' | 'ok' | 'erreur', chez : Map carte → membres, lance } ;
// S.mqVue = ce que l'encadré montre (série, compteurs, cartes manquantes), ou null.
const MQ_SEUIL = 5;
/** Membres qui ont la carte en double : « Demander à … » (deux au plus), une offre par carte. */
const MQ_BOUTONS = 2;

/**
 * Prépare l'encadré d'une série ouverte : null hors du seuil. Change de clé (donc relit) si les cartes manquantes changent.
 * @param {{set: object, scored: number, have: number, extra?: boolean}|undefined} g série affichée
 * @returns {{set: object, have: number, total: number, manq: object[]}|null}
 */
function vueManquantes(g) {
  if (!g || g.extra) return null;
  const manq = S.cards.filter((c) => c.set_id === g.set.id && !['identite', 'unique'].includes(c.rarity) && !copiesOf(c.id).length);
  if (!manq.length || manq.length > MQ_SEUIL) return null;
  const cle = `${g.set.id}|${manq.map((c) => c.id).join(',')}`;
  if (S.mq?.cle !== cle) S.mq = { cle, set: g.set.id, etat: 'charge' };
  return { set: g.set, have: g.have, total: g.scored, manq };
}

/**
 * Une carte manquante : son image et son nom (déjà visibles dans la collection de qui l'a), qui l'a en double, et les actions :
 * « Demander à … », ou bien « Fabriquer » (tarif réel) et « Me prévenir » (liste de souhaits) si personne ne l'a en double.
 * @param {object} c carte
 * @param {object[]} chez membres qui l'ont en double (user_id, pseudo, n, copy_id)
 * @returns {string}
 */
function ligneManquanteHtml(c, chez) {
  const noms = chez.map((x) => esc(x.pseudo));
  const qui = !chez.length ? 'Personne ne l’a en double pour l’instant.'
    : `En double chez ${noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms.at(-1)}` : noms[0]}.`;
  const prix = tableVal('craft', c.rarity);
  const fabricable = c.craftable && !['mythique', 'identite', 'unique'].includes(c.rarity) && prix != null;
  const souhait = S.wish.has(c.id);
  const act = chez.length
    ? chez.slice(0, MQ_BOUTONS).map((x) => `<button type="button" class="btn btn-ghost mq-btn" data-action="mq-demander" data-card="${esc(c.id)}" data-to="${esc(x.user_id)}" data-copy="${esc(String(x.copy_id ?? ''))}" aria-label="Demander ${esc(c.name)} à ${esc(x.pseudo)}">Demander à ${esc(x.pseudo)}</button>`).join('')
    : `${fabricable ? `<button type="button" class="btn btn-ghost mq-btn" data-action="open-card" data-card="${esc(c.id)}" aria-label="Fabriquer ${esc(c.name)} pour ${nf.format(prix)} Paillettes">Fabriquer · ${fmtPaillettes(prix)}</button>` : ''}
       <button type="button" class="cd-wish mq-btn${souhait ? ' is-on' : ''}" data-action="mq-souhait" data-card="${esc(c.id)}" aria-pressed="${souhait}"><svg viewBox="0 0 24 24" width="18" height="18" fill="${souhait ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg><span>${souhait ? 'Tu seras prévenu' : 'Me prévenir'}</span></button>`;
  return `<li class="mq-ligne${chez.length ? '' : ' is-seule'}">
      <div class="mq-carte">${cardHtml(c, { size: 'sm' })}</div>
      <div class="mq-txt"><strong>${esc(c.name)}</strong><span class="mq-meta">n° ${nf.format(c.number)} · ${esc(rarityLabel(c.rarity))}</span><p class="mq-qui">${qui}</p>
        <div class="mq-act">${act}</div></div>
    </li>`;
}

/** Encadré « Il te manque N cartes pour finir la série » (chargement, erreur ou liste), ou '' hors du seuil. */
function manquantesHtml() {
  const V = S.mqVue;
  if (!V || !S.mq) return '';
  const n = V.manq.length;
  const tete = `<div class="mq-tete"><h2 class="mq-titre" id="mq-h" tabindex="-1">Il te manque ${nf.format(n)} carte${n > 1 ? 's' : ''} pour finir la série</h2>
      <p class="mq-sous">${esc(V.set.name)} · <span class="mq-nb">${nf.format(V.have)} / ${nf.format(V.total)}</span></p></div>`;
  let corps;
  if (S.mq.etat === 'charge') corps = '<p class="muted small" aria-live="polite">Je cherche qui les a en double…</p><div class="mq-sk" aria-hidden="true"></div><div class="mq-sk" aria-hidden="true"></div>';
  else if (S.mq.etat === 'erreur') corps = '<div class="mq-erreur" role="alert"><p>Impossible de savoir qui les a en double pour le moment.</p><button type="button" class="btn btn-ghost mq-btn" data-action="mq-reessayer">Réessayer</button></div>';
  else {
    const lignes = V.manq.map((c) => ({ c, chez: S.mq.chez.get(c.id) || [] }));
    const trouv = lignes.some((x) => x.chez.length);
    // La carte porte sa série et son rang (« 037/100 »), comme une carte vue seule
    const total = S.cards.filter((k) => k.set_id === V.set.id).length;
    corps = `<ul class="mq-liste">${lignes.map((x) => ligneManquanteHtml({ ...x.c, set_name: V.set.name, set_total: total }, x.chez)).join('')}</ul>
      <p class="muted small mq-pied">${trouv ? 'Une offre par carte : dans l’offre, tu choisis ce que tu donnes en échange.' : 'Aucun membre ne les a en double. « Me prévenir » les ajoute à ta liste de souhaits : tu es averti dès qu’un membre en a une en double.'}</p>`;
  }
  return `<section class="card cartes-block mq" id="cartes-mq" aria-labelledby="mq-h">${tete}${corps}</section>`;
}

/** Redessine l'encadré seul (la grille ne bouge pas). Un focus qui était dedans y reste (sur le titre si son élément a disparu). */
function redessinerManquantes() {
  const box = $('#cartes-mq');
  if (!box) return;
  const actif = document.activeElement;
  const dedans = !!actif && box.contains(actif);
  keepPlace(() => { box.outerHTML = manquantesHtml(); });
  if (dedans) ((actif.id && document.getElementById(actif.id)) || $('#mq-h'))?.focus({ preventScroll: true });
}

/**
 * Lit qui a les cartes manquantes en double (hg_serie_manquantes), puis redessine l'encadré. Réponse ignorée si la série a changé.
 * @param {string} cle clé de S.mq au moment de l'appel
 */
async function chargerManquantes(cle) {
  let res;
  try {
    const { data, error } = await sb.rpc('hg_serie_manquantes', { p_set: S.mq.set });
    if (error) throw error;
    res = { etat: 'ok', chez: new Map((data?.cartes || []).map((x) => [x.card_id, Array.isArray(x.chez) ? x.chez : []])) };
  } catch (e) {
    console.warn('[manquantes]', e);
    res = { etat: 'erreur' };
  }
  if (S.mq?.cle !== cle) return;
  Object.assign(S.mq, res);
  redessinerManquantes();
}

/** « Réessayer » après une erreur : chargement, puis nouvelle lecture. */
function reessayerManquantes() {
  if (!S.mq) return;
  Object.assign(S.mq, { etat: 'charge', lance: true });
  redessinerManquantes();
  $('#mq-h')?.focus({ preventScroll: true });
  chargerManquantes(S.mq.cle);
}

/**
 * « Demander à … » : l'éditeur d'offre s'ouvre avec ce membre et son exemplaire coché dans « Je demande ».
 * @param {string} to membre
 * @param {string} copy son exemplaire libre (rendu par hg_serie_manquantes)
 */
async function demanderManquante(to, copy) {
  let api = null;
  try { await mountTradesOnce(); api = S.tradeApi; } catch { api = null; }
  if (!api) return toast('Les échanges ne sont pas disponibles pour le moment.', 'error');
  S.tab = 'echanges';
  renderAll();
  api.offer({ to, want: copy ? [copy] : [] });
}

/**
 * « Me prévenir » : ajoute la carte à ma liste de souhaits (ou l'en retire), puis redessine la collection.
 * @param {string} cardId carte
 */
async function souhaitManquante(cardId) {
  if (S.busy) return;
  S.busy = true;
  try {
    if (S.wish.has(cardId)) {
      const { error } = await sb.from('hg_card_wishlist').delete().eq('user_id', me.id).eq('card_id', cardId);
      if (error) throw error;
      S.wish.delete(cardId);
    } else {
      const { error } = await sb.from('hg_card_wishlist').insert({ user_id: me.id, card_id: cardId });
      if (error) throw error;
      S.wish.add(cardId);
      toast('Ajoutée à ta liste de souhaits.', 'ok');
    }
  } catch (e) {
    toast(errMsg(e), 'error');
  } finally {
    S.busy = false;
  }
  renderCollection(); // compteur « Liste de souhaits » des filtres compris
  $(`#cartes-mq [data-action="mq-souhait"][data-card="${CSS.escape(cardId)}"]`)?.focus({ preventScroll: true });
}

/** Rappel de « Toutes les séries » : ouvre la série, l'encadré reçoit le focus. */
function ouvrirSerieManquante(setId) {
  S.setId = setId;
  S.colLimit = 0;
  renderCollection();
  const h = $('#mq-h');
  if (h) { h.scrollIntoView({ block: 'start' }); h.focus({ preventScroll: true }); }
}

/* ---------- Recyclage de masse ---------- */
/**
 * Valeur en Paillettes d'un exemplaire recyclé : tarif de la rareté, multiplié si l'exemplaire est brillant.
 * @param {object} cp exemplaire (hg_card_copies)
 * @param {object} k carte (hg_cards)
 * @returns {number}
 */
function recycleValue(cp, k) {
  const base = tableVal('recycle', k.rarity) ?? 0;
  return base * (cp.shiny ? Number(cfg().recycle?.shiny_multiplier ?? 3) : 1);
}

/** Vrai si j'ai au moins deux exemplaires simples, ou deux brillants, de cette carte (le filtre « Doublons »). */
function hasDupes(cardId) {
  const list = copiesOf(cardId);
  const shiny = list.filter((cp) => cp.shiny).length;
  return shiny >= 2 || list.length - shiny >= 2;
}

/**
 * Recycle les exemplaires choisis (hg_card_recycle), puis recharge l'état et la page.
 * @param {number[]} ids exemplaires
 * @returns {Promise<void>}
 */
async function recycleMass(ids) {
  S.busy = true;
  try {
    const { data, error } = await sb.rpc('hg_card_recycle', { p_copies: ids });
    if (error) throw error;
    toast(`Recyclage terminé : +${fmtP(data)}`, 'ok');
    await refreshData();
  } finally {
    S.busy = false;
    renderAll();
  }
}

/** Ouvre la fenêtre des paramètres de la planche à imprimer. */
async function openPlanche() {
  const m = await import('./cartes-planche.js');
  m.openPlanche({ sets: S.sets, cards: () => S.cards, copiesOf, favs: S.favs, wish: S.wish, pseudo: me.pseudo, setId: S.setId, filtres: S.filters, hasDupes,
    onClose: () => document.querySelector('[data-action="planche"]')?.focus({ preventScroll: true }) });
}

/** Ouvre la fenêtre de recyclage à paramètres. */
async function openMass(from) {
  const m = await import('./cartes-recyclage.js');
  m.openRecyclage({ copies: () => S.copies, card: (id) => S.cardsById.get(id), favs: () => S.favs, wish: () => S.wish, vitrine: () => atelier?.vitrine() || new Set(), sets: () => S.sets,
    value: recycleValue, recycle: recycleMass, onClose: () => document.querySelector('[data-action="mass"]')?.focus({ preventScroll: true }) || from?.focus?.({ preventScroll: true }) });
}

/* ---------- Détail d'une carte ---------- */
/**
 * Ouvre la fiche détail d'une carte dans sa fenêtre.
 * @param {string} cardId identifiant de la carte
 */
function openDetail(cardId) {
  S.detailId = cardId;
  renderDetail();
  const d = $('#cartes-detail');
  if (!d.open) d.showModal();
  chargerVentes(cardId).catch(() => {}); // idée 33 : « Aux enchères » au lieu de « En échange »
}

/**
 * Une ligne « Mes exemplaires » : numéro, brillance, origine, date, et le bouton de recyclage
 * (ou « En échange » / « Ne se recycle pas » selon le cas).
 * @param {object} cp exemplaire
 * @param {object} k carte
 * @returns {string} HTML de la ligne
 */
function copyRow(cp, k) {
  const val = recycleValue(cp, k);
  const parts = [cp.serial ? serialLabel(cp.serial, k.max_copies) : '', cp.shiny ? (cp.finish === 'fondue' ? 'Brillante fondue' : 'Brillante') : '', SOURCE_LABEL[cp.source] || cp.source, fmtDate(cp.obtained_at)].filter(Boolean);
  let action;
  const vente = S.ventes?.get(String(cp.id)); // idée 33 : exemplaire bloqué par une de mes enchères
  if (vente) action = `<button type="button" class="btn btn-ghost cd-btn" data-action="voir-vente" data-id="${esc(vente)}">Aux enchères · voir</button>`;
  else if (cp.locked_trade) action = '<span class="pill pill-todo">En échange</span>';
  else if (k.rarity === 'identite' || k.rarity === 'unique') action = '<span class="muted small">Ne se recycle pas</span>';
  else action = `<button type="button" class="btn btn-ghost cd-btn" data-action="recycle" data-copy="${esc(String(cp.id))}" ${S.busy ? 'disabled' : ''}>Recycler · ${fmtPaillettes(val)}</button>`;
  return `<li><span>${parts.map(esc).join(' · ')}</span>${action}</li>`;
}

/* Enchères entre membres (idée 33, cartes-encheres.js) : une carte échangeable, ni identité ni carte d'un membre, se met en vente
   depuis sa fiche. Un exemplaire part : libre (ni bloqué par un échange ou une enchère, ni en vitrine). */
/** Vrai si la carte peut se mettre aux enchères (le serveur refait le contrôle). */
const vendable = (k) => k.tradeable !== false && k.rarity !== 'identite' && !k.member_id && k.family !== 'membre';
/** Exemplaires libres d'une carte pour une vente. */
const libresPourVente = (cps) => { const vit = atelier?.vitrine() || new Set(); return cps.filter((cp) => !cp.locked_trade && !vit.has(Number(cp.id))); };
/** Section « Enchères » de la fiche (vide si la carte ne se vend pas ou n'est pas possédée). */
function venteSectionHtml(k, cps) {
  if (!cps.length || !vendable(k)) return '';
  const libres = libresPourVente(cps);
  return `<section class="cd-sec">
      <h3 class="cd-h">Enchères</h3>
      ${libres.length
        ? `<ul class="cartes-copies"><li><span>Vends un exemplaire aux autres membres : la plus haute offre gagne.</span><button type="button" class="btn btn-sand cd-btn" data-action="vendre" ${S.busy ? 'disabled' : ''}>Mettre aux enchères</button></li></ul>`
        : '<p class="cd-empty">Tous tes exemplaires sont bloqués (échange, enchère ou vitrine).</p>'}
    </section>`;
}
/** Ouvre la fenêtre de mise en vente ; une fois la carte en vente, la fiche se ferme sur la page de l'enchère. */
async function ouvrirVente(from) {
  const k = S.cardsById.get(S.detailId);
  if (!k) return;
  const cps = copiesOf(k.id);
  const m = await import('./cartes-encheres.js');
  m.openVente({ card: k, copies: libresPourVente(cps), total: cps.length,
    onClose: () => { if (from?.isConnected) from.focus({ preventScroll: true }); },
    onDone: async (id) => {
      $('#cartes-detail')?.close();
      try { await refreshData(); } catch (e) { console.warn('[cartes] vente', e); }
      location.hash = `echanges/encheres/${id}`;
    } });
}
/** Lit mes ventes en cours (exemplaire -> enchère) quand la fiche montre un exemplaire bloqué, puis la redessine. */
async function chargerVentes(cardId) {
  if (!copiesOf(cardId).some((cp) => cp.locked_trade)) return;
  const m = await import('./cartes-encheres.js');
  S.ventes = await m.mesVentes();
  if (S.detailId === cardId && $('#cartes-detail')?.open) renderDetail();
}

/**
 * Dessine la fiche détail de la carte choisie : carte en grand, liste de souhaits, exemplaires, fabrication.
 * Une carte fabricable doit avoir un coût défini ; Identité et Mythique ne se fabriquent pas.
 */
function renderDetail() {
  const k = S.cardsById.get(S.detailId);
  if (!k) return;
  const cps = copiesOf(k.id);
  const n = cps.length;
  const shinyCp = cps.find((x) => x.shiny);
  const god = isGod();
  const costN = tableVal('craft', k.rarity);
  const costS = costN == null ? null : costN * Number(cfg().craft?.shiny_multiplier ?? 4);
  const uniq = k.rarity === 'unique';
  const craftable = !uniq && (god || (k.craftable && k.rarity !== 'mythique' && k.rarity !== 'identite' && costN != null));
  const wished = S.wish.has(k.id);
  /** Vrai si le solde ne suffit pas pour ce coût (jamais en mode sans limite). */
  const short = (cost) => !god && bal() < cost;

  $('#cartes-detail-card').innerHTML = cardHtml(k, {
    size: 'lg', count: n, shiny: !!shinyCp, missing: n === 0, ...lookOf(k, cps),
    serial: n === 1 && k.max_copies ? cps[0].serial : null,
  });
  $('#cartes-detail-info').innerHTML = `
    <h2 id="cartes-detail-title">${esc(k.name)}</h2>
    <p class="cd-meta">${esc(rarityLabel(k.rarity))} · ${esc(familyLabel(k.family))} · n° ${esc(k.number)}${k.max_copies === 1 ? ' · un seul exemplaire' : k.max_copies ? ` · ${nf.format(k.max_copies)} exemplaires au total` : ''}</p>
    <button type="button" class="cd-wish${wished ? ' is-on' : ''}" data-action="wish" aria-pressed="${wished}">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="${wished ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>
      <span>${wished ? 'Dans ma liste de souhaits' : 'Ajouter à ma liste de souhaits'}</span>
    </button>
    ${n ? `<button type="button" class="cd-wish cd-fav${S.favs.has(k.id) ? ' is-on' : ''}" data-action="fav" data-card="${esc(k.id)}" aria-pressed="${S.favs.has(k.id) ? 'true' : 'false'}">${ICON_STAR}<span>${S.favs.has(k.id) ? 'Dans mes favoris' : 'Ajouter aux favoris'}</span></button>` : ''}
    ${k.flavor ? `<p class="cartes-flavor">${esc(k.flavor)}</p>` : ''}
    ${k.moment_id ? `<p><a class="cd-moment" href="/pages/irl/historique.html#moment-${esc(k.moment_id)}">Voir le moment dans l’historique</a></p>` : ''}
    <section class="cd-sec">
      <h3 class="cd-h">Mes exemplaires</h3>
      ${n ? `<ul class="cartes-copies">${cps.map((cp) => copyRow(cp, k)).join('')}</ul>` : `<p class="cd-empty">${esc(uniqueStateOf(k) || 'Pas encore obtenue.')}</p>`}
    </section>
    ${venteSectionHtml(k, cps)}
    <section class="cd-sec">
      <h3 class="cd-h">Fabriquer</h3>
      ${craftable
        ? `<ul class="cartes-copies">
            <li><span>Version normale</span><button type="button" class="btn btn-sand cd-btn" data-action="craft" data-shiny="0" ${S.busy || short(costN) ? 'disabled' : ''}>Fabriquer · ${fmtPaillettes(costN ?? 0)}</button></li>
            ${k.can_shiny ? `<li><span>Version brillante</span><button type="button" class="btn btn-ghost cd-btn" data-action="craft" data-shiny="1" ${S.busy || short(costS) ? 'disabled' : ''}>Fabriquer · ${fmtPaillettes(costS ?? 0)}</button></li>` : ''}
          </ul>
          ${short(costN) ? `<p class="cd-empty">Il te manque ${fmtPaillettes(costN - bal())} pour cette carte.</p>` : ''}`
        : uniq
          ? '<p class="cd-empty">Une carte unique ne se fabrique pas : elle s\'obtient lors d\'un événement ou par un don de l\'admin.</p>'
          : '<p class="cd-empty">Cette carte ne peut pas être fabriquée.</p>'}
    </section>`;
}

/**
 * Ajoute ou retire une carte des favoris du membre (RPC hg_card_favorite_set). Aucune récompense.
 * Redessine la collection, la fiche détail et la fenêtre agrandie ; le focus revient sur l'étoile utilisée.
 * @param {string} cardId identifiant de la carte
 * @param {HTMLElement} [el] bouton cliqué (sert au focus si la fenêtre agrandie n'est pas ouverte)
 * @returns {Promise<void>}
 */
async function toggleFav(cardId, el) {
  if (!cardId || S.favBusy) return;
  const on = !S.favs.has(cardId);
  S.favBusy = true;
  try {
    const { error } = await sb.rpc('hg_card_favorite_set', { p_card: cardId, p_on: on });
    if (error) throw error;
    if (on) S.favs.add(cardId); else S.favs.delete(cardId);
    toast(on ? 'Ajoutée à tes favoris' : 'Retirée de tes favoris', 'ok');
  } catch (e) {
    toast(errMsg(e), 'error');
  } finally {
    S.favBusy = false;
  }
  if (S.tab === 'collection' && !S.peer) renderTab();
  if (S.detailId) renderDetail();
  zoom.refresh();
  // Focus : après le redessin, le bouton reprend le focus (fiche détaillée, sinon étoile de la grille), sauf si la fenêtre agrandie est ouverte
  if ($('#cz-dialog')?.open) return;
  if (S.detailId && $('#cartes-detail')?.open) {
    $('#cartes-detail [data-action="fav"]')?.focus?.({ preventScroll: true });
    return;
  }
  const again = document.querySelector(`[data-action="fav"][data-card="${CSS.escape(cardId)}"]`);
  (again || el)?.focus?.({ preventScroll: true });
}

/**
 * Exécute une action de la fiche détail : souhait (ajout ou retrait), fabrication, recyclage.
 * Recharge les données si l'action change l'inventaire, puis remet le focus sur le bouton utilisé.
 * @param {'wish'|'craft'|'recycle'} action
 * @param {HTMLElement} el bouton cliqué (data-shiny ou data-copy selon l'action)
 * @returns {Promise<void>}
 */
async function detailAction(action, el) {
  if (S.busy || !S.detailId) return;
  S.busy = true;
  renderDetail();
  let refreshed = false;
  try {
    if (action === 'wish') {
      const id = S.detailId;
      if (S.wish.has(id)) {
        const { error } = await sb.from('hg_card_wishlist').delete().eq('user_id', me.id).eq('card_id', id);
        if (error) throw error;
        S.wish.delete(id);
      } else {
        const { error } = await sb.from('hg_card_wishlist').insert({ user_id: me.id, card_id: id });
        if (error) throw error;
        S.wish.add(id);
      }
    } else if (action === 'craft') {
      if (S.cardsById.get(S.detailId)?.rarity === 'unique') throw new Error('Une carte unique ne se fabrique pas.');
      const shiny = el.dataset.shiny === '1';
      const { data, error } = await sb.rpc('hg_card_craft', { p_card: S.detailId, p_shiny: shiny });
      if (error) throw error;
      toast(`Carte fabriquée${shiny ? ' (brillante)' : ''} · −${fmtP(data.cost)}`, 'ok');
      // Belle carte fabriquée : même annonce que pour un booster, avec la mention « fabriqué » (hg-notify lit la source en base).
      if (['legendaire', 'mythique', 'identite', 'unique'].includes(data.rarity)) notify('card_pull', { card: data.card_id, rarity: data.rarity, shiny: data.shiny, serial: data.serial, via: 'fabrication' }).catch(() => {});
      await refreshData();
      refreshed = true;
    } else if (action === 'recycle') {
      if (S.cardsById.get(S.detailId)?.rarity === 'unique') throw new Error('Une carte unique ne se recycle pas.');
      const { data, error } = await sb.rpc('hg_card_recycle', { p_copies: [Number(el.dataset.copy)] });
      if (error) throw error;
      toast(`Recyclé : +${fmtP(data)}`, 'ok');
      await refreshData();
      refreshed = true;
    }
  } catch (e) {
    toast(errMsg(e), 'error');
  } finally {
    S.busy = false;
  }
  renderDetail(); // fiche à jour : boutons réactivés, exemplaire recyclé retiré
  if (refreshed) renderAll();
  else renderTab();
  // renderDetail a remplacé le bouton utilisé : le focus revient à son équivalent, sans défilement
  const again = action === 'wish' ? '.cd-wish'
    : action === 'craft' ? `[data-action="craft"][data-shiny="${el.dataset.shiny}"]`
    : `[data-action="recycle"][data-copy="${el.dataset.copy}"]`;
  $('#cartes-detail')?.querySelector(again)?.focus({ preventScroll: true });
}

/* ---------- Collection d'un autre membre (lecture seule) ---------- */
/* Vue ouverte par l'adresse #collection/<id> ou par un lien du classement (voir routeFromHash). */
// Adresse : /pages/cartes/cartes.html#collection/<id>. Mêmes données et mêmes composants que « Collection » (cartes-zoom.js compris),
// mais rien n'est modifiable : on voit ses cartes, on coche celles qu'on lui demande, puis on ouvre l'éditeur d'offre.
// S.peer = { id, member, copies, byCard, souhaits (ses souhaits, null si illisibles), loading, error, setId, filters, picks (Set de cartes demandées), shownIds }.
/** Forme de l'adresse d'une collection (#collection/<uuid>). */
const PEER_RE = /^#collection\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const PEER_OWNED = [['all', 'Toutes les cartes'], ['owned', 'Possédées par lui'], ['missing', 'Manquantes chez lui'],
  ['dupes', 'Doublons chez lui'], ['dupes_missing', 'Ses doublons que je n’ai pas']];
/** Exemplaires du membre consulté pour une carte (tableau vide si aucun). */
const peerCopies = (cardId) => S.peer?.byCard.get(cardId) || [];

/**
 * Exemplaires d'un membre, par carte, et sa liste de souhaits (RLS : tout membre peut lire hg_card_copies et hg_card_wishlist,
 * migration 018 c). Une liste de souhaits illisible n'empêche pas d'afficher la collection : souhaits vaut alors null.
 */
async function loadPeer(id) {
  const [mem, copies, wi] = await Promise.all([
    sb.rpc('hg_members'),
    fetchAllRows(() => sb.from('hg_card_copies').select('id, card_id, owner_id, shiny, serial, source, obtained_at, locked_trade, finish')
      .eq('owner_id', id).is('recycled_at', null).order('obtained_at').order('id')),
    sb.from('hg_card_wishlist').select('card_id').eq('user_id', id).then((r) => r, () => ({ error: true })),
  ]);
  if (mem.error) throw mem.error;
  const souhaits = wi.error ? null : (wi.data || []).map((w) => w.card_id);
  // ses cartes hors des séries ouvertes (drop, don…) et ses souhaits pas encore chargés
  await loadOwnedOutside([...copies.map((c) => c.card_id), ...(souhaits || [])]);
  const byCard = new Map();
  for (const cp of copies) {
    if (!byCard.has(cp.card_id)) byCard.set(cp.card_id, []);
    byCard.get(cp.card_id).push(cp);
  }
  // Les fantômes ne figurent pas dans hg_members : leur collection reste invisible
  return { member: (mem.data || []).find((m) => m.id === id) || null, copies, byCard, souhaits };
}

/**
 * Ouvre la collection d'un autre membre en lecture seule. Ouvrir sa propre collection revient à l'onglet normal.
 * Si une autre collection est ouverte entre-temps, la réponse tardive est ignorée.
 * @param {string} id identifiant du membre (en minuscules)
 * @returns {Promise<void>}
 */
async function openPeer(id) {
  if (id === me.id) { // sa propre collection : l'onglet normal
    leavePeer();
    S.tab = 'collection';
    cleanHash();
    renderAll();
    return;
  }
  if (!S.peer) S.returnY = window.scrollY;
  S.peer = { id, member: null, copies: [], byCard: new Map(), souhaits: null, loading: true, error: '', setId: ALL,
    filters: { rarity: '', family: '', owned: 'all' }, picks: new Set(), shownIds: [], limit: 0 };
  applyView();
  renderPeer();
  $('#cartes-peer').scrollIntoView({ block: 'start' });
  try {
    const data = await loadPeer(id);
    if (S.peer?.id !== id) return; // une autre collection a été ouverte entre-temps
    Object.assign(S.peer, data, { loading: false, error: data.member ? '' : 'Ce membre est introuvable ou sa collection n’est pas disponible.' });
  } catch (e) {
    if (S.peer?.id !== id) return;
    Object.assign(S.peer, { loading: false, error: errMsg(e) });
  }
  renderPeer();
  $('#cartes-peer-title')?.focus({ preventScroll: true });
}

/** Ferme la collection d'un membre, revient aux onglets et remet la page à sa position d'avant. */
function leavePeer() {
  if (!S.peer) return;
  S.peer = null;
  cleanHash();
  renderAll();
  window.scrollTo({ top: S.returnY, behavior: 'instant' });
}

// L'adresse ne garde pas le #collection/… une fois la vue fermée (sinon un rechargement rouvrirait la vue).
/** Retire #collection/… de l'adresse, sans ajouter d'entrée dans l'historique du navigateur. */
function cleanHash() {
  if (PEER_RE.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
}

/** Onglet demandé par l'adresse : #echanges/tableau (lien des alertes de la liste de souhaits) ouvre les Échanges, puis leur Tableau ;
    #echanges/encheres[/<id>] (idée 33) ouvre leurs Enchères, et l'enchère indiquée. */
const ENCH_ADRESSE = /^#echanges\/encheres(?:\/([0-9a-f-]{36}))?$/i;
const ongletAdresse = () => (location.hash === '#echanges/tableau' || ENCH_ADRESSE.test(location.hash) ? 'echanges' : location.hash.slice(1));

/** Suit l'adresse : #collection/<id> ouvre la collection du membre, #<onglet> ouvre cet onglet, sinon la vue revient aux onglets. */
function routeFromHash() {
  // QR d'un code cadeau (idée C9) : /pages/cartes/cartes.html#code=HG-XXXX-XXXX ouvre la fenêtre déjà remplie, puis l'adresse est nettoyée.
  const code = codeFromHash(location.hash);
  if (code) {
    history.replaceState(null, '', location.pathname + location.search);
    if (S.tab !== 'inventaire') setTab('inventaire');
    openCode(code);
    return;
  }
  const m = PEER_RE.exec(location.hash);
  if (m) { openPeer(m[1].toLowerCase()); return; }
  // Lien direct vers un onglet (/pages/cartes/cartes.html#boutique, #collection…) : on quitte la collection d'un membre s'il y en a une, puis l'onglet s'affiche
  const onglet = ongletAdresse();
  if (TABS.some(([id]) => id === onglet)) {
    if (S.peer) leavePeer();
    if (S.tab !== onglet) setTab(onglet);
    if (location.hash === '#echanges/tableau') S.tradeApi?.onglet('tableau');
    const ench = ENCH_ADRESSE.exec(location.hash);
    if (ench) S.tradeApi?.onglet('encheres', ench[1] || null);
    return;
  }
  leavePeer();
}

/**
 * Filtre de la collection d'un membre : vrai si la carte passe les filtres (rareté, famille, possession).
 * « Doublons chez lui que je n'ai pas » : il en a au moins deux et je n'en ai aucun.
 * @param {object} c carte
 * @returns {boolean}
 */
function peerKeep(c) {
  const f = S.peer.filters;
  const n = peerCopies(c.id).length;
  const mine = copiesOf(c.id).length;
  if (f.rarity && c.rarity !== f.rarity) return false;
  if (f.family && c.family !== f.family) return false;
  if (f.owned === 'owned' && n === 0) return false;
  if (f.owned === 'missing' && n > 0) return false;
  if (f.owned === 'dupes' && n < 2) return false;
  if (f.owned === 'dupes_missing' && !(n >= 2 && mine === 0)) return false;
  return true;
}

// Une carte de sa collection : carte (bouton de sélection si elle la possède), loupe, repères d'échange.
/**
 * Une case de la collection d'un membre : carte, étiquettes (« Tu ne l'as pas », « Doublon chez lui », « Demandée ») et loupe.
 * @param {object} c carte
 * @returns {string} HTML de la case
 */
function peerCell(c) {
  const cps = peerCopies(c.id);
  const n = cps.length;
  const mine = copiesOf(c.id).length;
  const shinyCp = cps.find((x) => x.shiny);
  const on = S.peer.picks.has(c.id);
  const pickable = n > 0;
  const card = cardHtml(c, {
    size: 'md', count: n, shiny: !!shinyCp, ...lookOf(c, cps),
    serial: n === 1 && c.max_copies ? cps[0].serial : null,
    missing: n === 0, button: pickable,
    attrs: pickable ? `data-action="peer-pick" data-card="${esc(c.id)}" aria-pressed="${on}"` : '',
  });
  const tags = [
    n && !mine ? ['Tu ne l’as pas', 'is-need'] : null,
    n >= 2 ? ['Doublon chez lui', 'is-dupe'] : null,
    on ? ['Demandée', 'is-picked'] : null,
  ].filter(Boolean);
  const what = n ? esc(c.name) : 'la carte';
  return `<div class="cz-cell pv-cell${on ? ' is-picked' : ''}">${card}`
    + (tags.length ? `<ul class="pv-tags">${tags.map(([t, cls]) => `<li class="pv-tag ${cls}">${esc(t)}</li>`).join('')}</ul>` : '')
    + `<button type="button" class="cz-zoom" data-action="peer-zoom" data-card="${esc(c.id)}" aria-label="Agrandir ${what}">${ICON_ZOOM}</button>`
    + '<span class="cz-tip" aria-hidden="true">Agrandir</span></div>';
}

/**
 * Intertitre d'une série dans la collection d'un membre (vue « Toutes les séries »).
 * @param {{set: object, scored: number, have: number, shown: object[]}} g série et ses cartes affichées
 * @param {number} i numéro du groupe
 */
function peerGroupHtml(g, i) {
  const pct = g.scored ? Math.round(g.have / g.scored * 100) : 0;
  const hid = `pv-g-${i}`;
  if (g.extra) return `<section class="cz-group"${attrGroupe(cleGroupe(g), mesuresGroupes)} aria-labelledby="${hid}">${outsideHead(g, hid)}<div class="cartes-grid">${g.shown.map(peerCell).join('')}</div></section>`;
  return `<section class="cz-group"${attrGroupe(cleGroupe(g), mesuresGroupes)} aria-labelledby="${hid}">
    <div class="cz-group-head">
      <h2 class="cz-group-title" id="${hid}">${esc(g.set.name)}</h2>
      <p class="cz-group-count">${nf.format(g.have)} / ${nf.format(g.scored)} possédées</p>
    </div>
    <div class="progress cz-group-bar" role="progressbar" aria-label="Progression de ${esc(g.set.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>
    <div class="cartes-grid">${g.shown.map(peerCell).join('')}</div>
  </section>`;
}

/**
 * Fiche d'une carte pour la fenêtre agrandie, vue depuis la collection d'un membre (cartes-zoom.js).
 * @param {string} id identifiant de la carte
 * @returns {object|null} fiche, ou null si la carte ou la collection n'est pas chargée
 */
function peerZoomInfo(id) {
  const P = S.peer;
  const k = S.cardsById.get(id);
  if (!P || !k) return null;
  const cps = peerCopies(id);
  return {
    card: k,
    count: cps.length,
    shiny: cps.some((x) => x.shiny), ...lookOf(k, cps),
    serial: cps.length === 1 && k.max_copies ? cps[0].serial : null,
    missing: cps.length === 0,
    setName: (S.sets.find((s) => s.id === k.set_id) || S.otherSets.get(k.set_id))?.name || '',
    setTotal: S.cards.filter((c) => c.set_id === k.set_id).length,
    lines: cps.map((cp) => [cp.serial ? serialLabel(cp.serial, k.max_copies) : '', shinyWord(cp), SOURCE_LABEL[cp.source] || cp.source, fmtDate(cp.obtained_at)].filter(Boolean).join(' · ')),
    kicker: `Collection de ${P.member?.pseudo || ''}`,
    heading: 'Dans sa collection',
  };
}

/**
 * En-tête de la collection d'un membre : retour, nom, compteurs, sélection et bouton « Proposer un échange ».
 * @param {object} P état de la collection (S.peer)
 */
function peerHead(P) {
  const m = P.member;
  const n = P.picks.size;
  return `<section class="card cartes-peer-head" aria-labelledby="cartes-peer-title">
      <div class="cartes-row"><button type="button" class="btn btn-ghost" data-action="peer-back">← Retour</button></div>
      <div class="cartes-peer-who">${avatarHtml(m, 48)}
        <div>
          <p class="eyebrow">Collection · lecture seule</p>
          <h2 class="cartes-peer-title" id="cartes-peer-title" tabindex="-1">Collection de ${esc(m.pseudo)}</h2>
          <p class="muted small">${pluralCount(P.byCard.size, 'carte différente', 'cartes différentes', nf.format)} · ${pluralCount(P.copies.length, 'exemplaire', 'exemplaires', nf.format)}</p>
        </div>
      </div>
      <p class="muted small">Tu peux voir cette collection, pas la modifier. Clique sur une carte qu’il possède pour la demander, puis propose un échange.</p>
      <div class="cartes-peer-offer">
        <p class="cartes-small" id="peer-sel" aria-live="polite">${pluralCount(n, 'carte sélectionnée', 'cartes sélectionnées', nf.format)}${n ? ' · elles seront pré-cochées dans « Je demande »' : ''}</p>
        <button type="button" class="btn btn-primary" data-action="peer-offer">Proposer un échange</button>
        ${n ? '<button type="button" class="btn btn-ghost" data-action="peer-clear">Vider la sélection</button>' : ''}
        <a class="btn btn-ghost" href="/pages/cartes/collection-a4.html?user=${esc(P.id)}&amp;set=all">Imprimer sa planche</a>
      </div>
    </section>`;
}

/* ---------- Sa liste de souhaits : « Tu l'as en double » (idée 55) ---------- */
// La liste est lisible entre membres (règles de la base, onglet Correspondances) : pas d'option pour la cacher.
/**
 * Mon exemplaire à lui donner pour une carte : libre (pas en échange), simple plutôt que brillant, hors vitrine, le plus récent.
 * @param {string} cardId identifiant de la carte
 * @returns {object|null} exemplaire, ou null si aucun n'est libre
 */
function copieADonner(cardId) {
  const vit = atelier?.vitrine() || new Set();
  const rang = (cp) => Number(!!cp.shiny) * 2 + Number(vit.has(Number(cp.id)));
  return copiesOf(cardId).filter((cp) => !cp.locked_trade).sort((a, b) => rang(a) - rang(b) || Number(b.id) - Number(a.id))[0] || null;
}
/** Vrai si j'ai la carte en double (au moins deux exemplaires, dont un libre) et qu'elle s'échange. */
const enDoubleChezMoi = (c) => c.tradeable !== false && copiesOf(c.id).length >= 2 && !!copieADonner(c.id);

/**
 * Bloc « Sa liste de souhaits » de la collection d'un membre : ses souhaits, celles que j'ai en double d'abord,
 * avec le repère « Tu l'as en double » et « Lui proposer » (offre avec ma carte cochée dans « Je donne »).
 * Rien si la liste n'a pas pu être lue.
 * @param {object} P état de la collection (S.peer), chargé
 * @returns {string}
 */
function peerSouhaitsHtml(P) {
  if (!P.souhaits) return '';
  const qui = P.member.pseudo;
  const voeux = P.souhaits.map((id) => S.cardsById.get(id)).filter(Boolean)
    .sort((a, b) => Number(enDoubleChezMoi(b)) - Number(enDoubleChezMoi(a)) || rarityRank(b.rarity) - rarityRank(a.rarity) || (a.number ?? 0) - (b.number ?? 0));
  const n2 = voeux.filter(enDoubleChezMoi).length;
  /** Une case : la carte, le repère (« Tu l'as en double » ou « Tu l'as ») et le bouton « Lui proposer ». */
  const cell = (c) => {
    const d = enDoubleChezMoi(c), mine = copiesOf(c.id).length;
    const tags = d ? [['Tu l’as en double', 'is-need']] : mine ? [['Tu l’as', '']] : [];
    const serie = S.sets.find((s) => s.id === c.set_id) || S.otherSets.get(c.set_id);
    const vue = { ...c, set_name: serie?.name, set_total: S.cards.filter((k) => k.set_id === c.set_id).length || null };
    return `<div class="cz-cell pv-cell">${cardHtml(vue, { size: 'md' })}`
      + (tags.length ? `<ul class="pv-tags">${tags.map(([t, k]) => `<li class="pv-tag ${k}">${esc(t)}</li>`).join('')}</ul>` : '')
      + (d ? `<button type="button" class="btn btn-ghost pvs-btn" data-action="peer-give" data-card="${esc(c.id)}" aria-label="Proposer ${esc(c.name)} à ${esc(qui)}">Lui proposer</button>` : '')
      + '</div>';
  };
  const corps = !voeux.length
    ? `<p class="empty">${esc(qui)} n’a encore rien mis dans sa liste de souhaits.</p>`
    : `${n2 ? '' : '<p class="muted small">Tu n’as aucune de ces cartes en double pour le moment.</p>'}<div class="cartes-grid">${voeux.map(cell).join('')}</div>`;
  return `<section class="card cartes-block pv-souhaits" aria-labelledby="pvs-h">
      <div class="cz-group-head pvs-tete">
        <h2 class="cz-group-title" id="pvs-h">Sa liste de souhaits</h2>
        <p class="cz-group-count">${voeux.length ? `${pluralCount(voeux.length, 'carte', 'cartes', nf.format)}${n2 ? ` · ${nf.format(n2)} que tu as en double` : ''}` : 'vide'}</p>
      </div>
      ${n2 ? `<p class="muted small">« Lui proposer » ouvre une offre avec ta carte déjà cochée dans « Je donne ». Tu choisis ensuite ce que tu demandes.</p>
      ${n2 > 1 ? `<div class="pvs-tout"><button type="button" class="btn btn-primary" data-action="peer-give-all">Lui proposer les ${nf.format(n2)} cartes</button></div>` : ''}` : ''}
      ${corps}
    </section>`;
}

/**
 * HTML complet de la collection d'un membre : en-tête, série, progression, filtres et grille.
 * @param {object} P état de la collection (S.peer), chargé
 * @returns {string}
 */
function peerHtml(P) {
  const all = P.setId === ALL;
  const set = all ? null : S.sets.find((s) => s.id === P.setId) || S.otherSets.get(P.setId);
  const f = P.filters;
  /** Compteurs et cartes affichées d'une série ouverte. */
  const openGroup = (s) => {
    const cards = S.cards.filter((c) => c.set_id === s.id);
    const scored = cards.filter((c) => c.rarity !== 'identite');
    return { set: s, scored: scored.length, have: scored.filter((c) => peerCopies(c.id).length > 0).length, shown: cards.filter(peerKeep) };
  };
  // Ses cartes hors des séries ouvertes (drop, don…) : groupes à part, sans progression
  const extras = outsideGroups(peerCopies, peerKeep);
  const outside = !!set && !S.sets.some((x) => x.id === set.id);
  const groups = all ? [...S.sets.map(openGroup), ...extras] : outside ? extras.filter((g) => g.set.id === set.id) : [set].filter(Boolean).map(openGroup);
  const scoredAll = groups.reduce((a, g) => a + g.scored, 0);
  const haveAll = groups.reduce((a, g) => a + g.have, 0);
  const pctDone = scoredAll ? Math.round(haveAll / scoredAll * 100) : 0;
  const withCards = groups.filter((g) => g.shown.length);
  P.shownIds = withCards.flatMap((g) => g.shown.map((c) => c.id)); // liste complète, pour la carte agrandie
  const sl = sliceGroups(withCards, P.limit);
  const body = !S.sets.length && !extras.length ? '<p class="empty">Aucune série disponible pour le moment.</p>'
    : !withCards.length ? '<p class="empty">Aucune carte ne correspond à ces filtres.</p>'
      : (all ? `<div class="cz-groups">${sl.groups.map(peerGroupHtml).join('')}</div>`
        : `<div class="cartes-grid">${(sl.groups[0]?.shown || []).map(peerCell).join('')}</div>`) + moreHtml(sl, 'peer');
  return `${peerHead(P)}
    ${peerSouhaitsHtml(P)}
    <section class="card cartes-block">
      <div class="cartes-series">
        <div class="field">
          <label for="peer-set">Série</label>
          <select id="peer-set" data-change="peer-set">
            <option value="${ALL}" ${all ? 'selected' : ''}>Toutes les séries</option>
            ${S.sets.map((s) => `<option value="${esc(s.id)}" ${s.id === P.setId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
            ${extras.map((g) => `<option value="${esc(g.set.id)}" ${g.set.id === P.setId ? 'selected' : ''}>${esc(g.set.name)} (pas ouverte)</option>`).join('')}
          </select>
        </div>
        <div class="cartes-progress">
          <p class="cartes-progress-label">${nf.format(haveAll)} / ${nf.format(scoredAll)} cartes obtenues par ${esc(P.member.pseudo)}${all ? ' (toutes les séries)' : ''}</p>
          <div class="progress" role="progressbar" aria-label="Progression de la collection de ${esc(P.member.pseudo)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctDone}"><span style="width:${pctDone}%"></span></div>
        </div>
      </div>
      <div class="cartes-filters">
        <div class="field">
          <label for="peer-f-rarity">Rareté</label>
          <select id="peer-f-rarity" data-pfilter="rarity">
            <option value="">Toutes</option>
            ${RARITIES.map((r) => `<option value="${r.id}" ${f.rarity === r.id ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="peer-f-family">Famille</label>
          <select id="peer-f-family" data-pfilter="family">
            <option value="">Toutes</option>
            ${FAMILIES.map((x) => `<option value="${x.id}" ${f.family === x.id ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="peer-f-owned">Afficher</label>
          <select id="peer-f-owned" data-pfilter="owned">
            ${PEER_OWNED.map(([v, l]) => `<option value="${v}" ${f.owned === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
      </div>
    </section>
    ${body}`;
}

/** Redessine la vue membre ; focusSel (sélecteur) reçoit le focus après le rendu, sans défilement. */
function renderPeer(focusSel) {
  const el = $('#cartes-peer');
  const P = S.peer;
  if (!el || !P) return;
  keepPlace(() => {
    if (P.loading) el.innerHTML = '<p class="muted" aria-live="polite">Chargement de la collection…</p>';
    else if (P.error) el.innerHTML = `<section class="card cartes-peer-head"><div class="cartes-row"><button type="button" class="btn btn-ghost" data-action="peer-back">← Retour</button></div><p class="empty">${esc(P.error)}</p></section>`;
    else { mesuresGroupes = mesurerGroupes(el); el.innerHTML = peerHtml(P); }
    if (focusSel) el.querySelector(focusSel)?.focus({ preventScroll: true });
  });
  lotsPeer.planifier();
}

/**
 * Coche ou décoche une carte qu'on demande au membre (elle sera pré-cochée dans l'éditeur d'offre).
 * @param {string} cardId identifiant de la carte
 */
function togglePeerPick(cardId) {
  const P = S.peer;
  if (!P) return;
  if (P.picks.has(cardId)) P.picks.delete(cardId); else P.picks.add(cardId);
  renderPeer(`[data-action="peer-pick"][data-card="${CSS.escape(cardId)}"]`);
}

/**
 * Ouvre l'éditeur d'offre (cartes-trades.js) avec ce membre ; les cartes cochées sont pré-cochées dans « Je demande ».
 * @param {string[]} [donner] cartes de sa liste de souhaits à lui proposer : un de mes exemplaires de chacune est coché dans « Je donne »
 */
async function peerOffer(donner = []) {
  const P = S.peer;
  if (!P || P.loading || P.error) return;
  const give = donner.map(copieADonner).filter(Boolean).map((cp) => String(cp.id));
  const want = [];
  let locked = 0;
  for (const cid of P.picks) {
    const cp = peerCopies(cid).find((x) => !x.locked_trade);
    if (cp) want.push(String(cp.id)); else locked++;
  }
  let api = null;
  try { await mountTradesOnce(); api = S.tradeApi; } catch { api = null; }
  if (!api) return toast('Les échanges ne sont pas disponibles pour le moment.', 'error');
  if (locked) toast('Certaines cartes sont déjà en échange : elles ne sont pas pré-cochées.');
  const to = P.id;
  S.peer = null;
  cleanHash();
  S.tab = 'echanges';
  renderAll();
  api.offer({ to, give, want });
}

/* ---------- Classement ---------- */
/** Dessine le classement (hg_card_leaderboard). Les pseudos des autres membres mènent à leur collection. */
async function renderLeaderboard() {
  const el = $('#cartes-p-classement');
  const release = holdHeight(el); // le texte d'attente garde la hauteur : la page ne raccourcit pas
  el.innerHTML = '<p class="muted" aria-live="polite">Chargement du classement…</p>';
  try {
    const { data, error } = await sb.rpc('hg_card_leaderboard');
    if (error) { el.innerHTML = `<p class="empty">${esc(errMsg(error))}</p>`; return; }
    const rows = data || [];
    el.innerHTML = `
      <section class="card">
        <h2>Classement</h2>
        <p class="muted small">Le score additionne la valeur des cartes possédées (une carte brillante compte double).</p>
        ${rows.length ? `<ol class="cartes-lb">
          ${rows.map((r, i) => `<li>
            <span class="cartes-lb-rank">${i + 1}</span>
            <span class="cartes-row">${avatarHtml(r, 36)}
              <span><strong>${r.user_id === me.id ? esc(r.pseudo) : `<a class="cartes-lb-link" href="#collection/${esc(r.user_id)}" title="Voir la collection de ${esc(r.pseudo)}">${esc(r.pseudo)}</a>`}</strong>${r.user_id === me.id ? ' <span class="muted small">(toi)</span>' : ''}<br>
              <span class="cartes-lb-stats">${pluralCount(Number(r.uniques), 'unique', 'uniques', nf.format)} · ${pluralCount(Number(r.copies), 'exemplaire', 'exemplaires', nf.format)} · ${nf.format(Number(r.shinies))} brillantes · ${nf.format(Number(r.identites))} identités · ${nf.format(Number(r.series))} séries</span></span>
            </span>
            <span class="cartes-lb-score">${nf.format(Number(r.score))}</span>
          </li>`).join('')}
        </ol>` : '<p class="empty">Personne n’a encore de carte.</p>'}
      </section>`;
    if (!OFF) import('./cartes-bulletin.js').then((m) => m.mountBulletin(el)).catch(() => {}); // « Le Cours de la Paillette » (C15)
  } finally {
    release();
  }
}

/* ---------- Échanges (module séparé, chargé à la demande) ---------- */
/**
 * Charge le module des échanges (cartes-trades.js) une seule fois, à la première ouverture de l'onglet.
 * @returns {Promise<void>} résolue quand le module est monté (ou remplacé par « Bientôt » si le chargement échoue)
 */
function mountTradesOnce() {
  if (S.tradesMounted) return S.tradesReady;
  S.tradesMounted = true;
  const el = $('#cartes-trades');
  const ctx = {
    me,
    refresh: async () => { await refreshData(); renderAll(); },
    expose: (api) => { S.tradeApi = api; }, // api.offer({ to, want }) ouvre l'éditeur d'offre
  };
  S.tradesReady = import('./cartes-trades.js')
    .then((m) => m.mountTrades(el, ctx))
    .catch(() => { el.innerHTML = '<p class="empty">Bientôt.</p>'; });
  return S.tradesReady;
}

/* ---------- Historique ---------- */
/** Dessine l'historique des 30 derniers mouvements de Paillettes (en vert : gain, en rouge : dépense). */
function renderHistory() {
  const el = $('#cartes-history');
  if (!el) return;
  el.innerHTML = S.log.length
    ? `<ul class="cartes-log">${S.log.map((l) => {
        const d = Number(l.delta);
        return `<li><span>${esc(REASON_LABEL[l.reason] || l.reason)} <span class="muted small">${esc(fmtDate(l.created_at))}</span></span>
          <span class="${d >= 0 ? 'cartes-delta-pos' : 'cartes-delta-neg'}">${d > 0 ? '+' : ''}${fmtPaillettes(d)}</span></li>`;
      }).join('')}</ul>`
    : '<p class="muted small">Aucun mouvement pour le moment.</p>';
}

/* ---------- Cartes d'un booster : retourner, puis voir en grand ---------- */
// Une carte révélée s'ouvre dans la même fenêtre agrandie que la collection (cartes-zoom.js).
// Avant son retournement, un clic (ou Entrée / Espace) la retourne ; le clic suivant l'agrandit.
/**
 * Libellé accessible d'une carte d'un booster : face cachée tant qu'elle n'est pas retournée, puis son nom.
 * @param {object} card carte obtenue (booster)
 * @param {boolean} shown vrai une fois la carte retournée
 * @returns {string}
 */
function boosterCardLabel(card, shown) {
  if (!shown) return 'Carte cachée : touche pour la retourner';
  return `Voir le détail de ${card.name} : ${rarityLabel(card.rarity)}${card.shiny ? ', brillante' : ''}`;
}

/**
 * Met à jour le libellé accessible de la carte i une fois retournée (sans redessiner la scène).
 * @param {object} R ouverture en cours
 * @param {number} i index de la carte
 */
function setCardControl(R, i) {
  const el = R.multi ? $(`#x5-c${i}`) : $(`#op-stage .op-card[data-i="${i}"]`);
  el?.setAttribute('aria-label', boosterCardLabel(R.cards[i], R.revealed.has(i)));
}

/**
 * Indice discret sous les cartes : « Touche une carte pour la voir en grand ». Caché tant qu'aucune carte n'est retournée.
 * @param {object} R ouverture en cours
 * @returns {string} HTML de l'indice
 */
function revealHint(R) {
  return `<p class="muted small cartes-reveal-hint"${R.revealed.size ? '' : ' hidden'}>Touche une carte pour la voir en grand</p>`;
}

/** Affiche l'indice dès qu'une première carte est retournée. */
function showRevealHint() {
  $('#cartes-reveal .cartes-reveal-hint')?.removeAttribute('hidden');
}

/**
 * Ouvre la carte agrandie sur la carte i d'un booster. Les flèches et « Précédent / Suivant » parcourent
 * les cartes de ce booster ou de ce lot (sans doublon), pas la collection.
 * @param {object} R ouverture en cours
 * @param {number} i index de la carte
 * @param {HTMLElement} el carte cliquée (le focus y revient à la fermeture)
 */
function openBoosterZoom(R, i, el) {
  const card = R.cards[i];
  if (!card) return;
  S.zoomIds = [...new Set(R.cards.map((c) => c.card_id))];
  try { zoom.open(card.card_id, el); } finally { S.zoomIds = null; }
}

/**
 * Clic sur une carte d'un booster : si elle n'est pas encore retournée, il la retourne ; sinon elle s'ouvre en grand.
 * @param {HTMLElement} el carte cliquée (data-i = index de la carte)
 */
function onBoosterCard(el) {
  const R = S.reveal;
  if (!R) return;
  const i = Number(el.dataset.i);
  if (!R.revealed.has(i)) {
    if (R.multi) revealMulti(R, i);
    else { revealCard(R, i); applyStage(R); }
    return;
  }
  openBoosterZoom(R, i, el);
}

/**
 * Entrée ou Espace sur une carte de booster (élément à rôle bouton) : même effet qu'un clic.
 * Les vrais boutons gèrent déjà ces touches, on ne les traite pas deux fois.
 * @param {KeyboardEvent} e
 */
function onCardKey(e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  if (!e.target.matches?.('[role=button][data-action=booster-card]')) return;
  e.preventDefault();
  e.target.click();
}

/* ---------- Événements ---------- */
/**
 * Délégation des clics sur la page : onglets et tous les boutons [data-action] (un seul écouteur pour toute la page).
 * @param {MouseEvent} e
 */
function onClick(e) {
  const t = e.target.closest('.cartes-tab[data-tab], [data-tab-go], [data-action]');
  if (!t || t.disabled) return;
  // Q4 : hors ligne, seules la collection, la fiche et la carte agrandie répondent (aucune action sur l'économie).
  if (S.offline && !(t.dataset.tab === 'collection' || ['open-card', 'zoom-card', 'close-dialog', 'filtres', 'filtres-effacer'].includes(t.dataset.action))) return;
  if (t.dataset.tab) { setTab(t.dataset.tab); focusSection(); return; }
  if (t.dataset.tabGo) { setTab(t.dataset.tabGo); focusSection(); return; }
  switch (t.dataset.action) {
    case 'daily': return claimDaily();
    // Boutons d'ouverture : en mode typé, chaque bouton ouvre un type (dialogue de série si besoin) ; en repli, l'ancien chemin.
    case 'open-free': if (typed()) return openWithPick(freeType()?.id || 'classique', 'gratuit', t); toOuverture(); return openBooster(true);
    case 'open-gift': if (typed()) return openWithPick('classique', 'stock', t); toOuverture(); return openBooster(false, true);
    case 'open-stock': return openWithPick(t.dataset.type, 'stock', t);
    case 'serie-confirm': return confirmSerie();
    case 'open-stock-multi': return openStockMulti(t.dataset.type, t.dataset.count === 'all' ? Infinity : Number(t.dataset.count), t);
    case 'open-all-stock': return openAllStock(t);
    case 'resume-multi': return runMulti(null);
    case 'toggle-all-cards': return toggleAllCards();
    case 'quest-claim': return claimQuest(t.dataset.code);
    case 'defi-claim': return claimDefiBooster();
    case 'quest-proof': return openProof(S.quests.quests.find((q) => q.code === t.dataset.code), { uid: me.id, sb, toast, esc, onDone: loadQuests });
    case 'reveal-all': return skipSeq();
    case 'more-cards': return showMore(t.dataset.which);
    case 'close-reveal': return closeReveal();
    case 'open-card': return openDetail(t.dataset.card);
    case 'zoom-card': return zoom.open(t.dataset.card, t);
    case 'booster-card': return onBoosterCard(t);
    case 'mass': return openMass(t);
    case 'planche': return openPlanche();
    case 'filtres': return toggleFiltres();
    case 'filtres-effacer': return effacerFiltres();
    case 'champion': return import('./cartes-champion.js').then((m) => m.openChampion({ onClose: () => { if (t.isConnected) t.focus({ preventScroll: true }); } })); // C17
    case 'jeu-open': S.jeuOpen = t.dataset.tag; renderCollection(); document.getElementById(`c2-jeu-${t.dataset.tag}`)?.scrollIntoView({ block: 'nearest' }); return;
    case 'jeu-trade': setTab('echanges'); focusSection(); return;
    case 'peer-back': leavePeer(); focusSection(); return;
    case 'peer-zoom': return zoom.open(t.dataset.card, t);
    case 'peer-pick': return togglePeerPick(t.dataset.card);
    case 'peer-clear': if (S.peer) { S.peer.picks.clear(); renderPeer('[data-action="peer-offer"]'); } return;
    case 'peer-offer': return peerOffer();
    case 'peer-give': return peerOffer([t.dataset.card]); // idée 55 : sa liste de souhaits, ma carte en double
    case 'peer-give-all': return peerOffer((S.peer?.souhaits || []).filter((id) => { const c = S.cardsById.get(id); return c && enDoubleChezMoi(c); }));
    case 'mq-demander': return demanderManquante(t.dataset.to, t.dataset.copy); // idée 57
    case 'mq-souhait': return souhaitManquante(t.dataset.card);
    case 'mq-reessayer': return reessayerManquantes();
    case 'mq-ouvrir': return ouvrirSerieManquante(t.dataset.set);
    case 'buy-stock': return buyStock(t.dataset.type || 'classique');
    case 'gift-ask': e.preventDefault(); return askGift(); // bouton de type submit : pas d'envoi du formulaire
    case 'gift-confirm': return giftConfirm();
    case 'gift-cancel': return cancelGift();
    case 'wish':
    case 'craft':
    case 'recycle': return detailAction(t.dataset.action, t);
    case 'vendre': return ouvrirVente(t); // idée 33
    case 'voir-vente': $('#cartes-detail')?.close(); location.hash = `echanges/encheres/${t.dataset.id}`; return;
    case 'fav': return toggleFav(t.dataset.card, t);
    case 'close-dialog': return t.closest('dialog')?.close();
  }
}

/**
 * Délégation des changements (sélecteurs de série, filtres de la collection et de la collection d'un membre).
 * @param {Event} e
 */
function onChange(e) {
  const t = e.target;
  if (t.id === 'cartes-section-sel') { setTab(t.value); focusSection(); }
  else if (t.dataset.change === 'set') { S.setId = t.value; S.colLimit = 0; renderCollection('cartes-set'); }
  else if (t.dataset.filter) { S.filters[t.dataset.filter] = t.value; S.colLimit = 0; renderCollection(t.id); }
  else if (t.dataset.vue) { if (t.checked) S.filters.vues.add(t.dataset.vue); else S.filters.vues.delete(t.dataset.vue); S.colLimit = 0; renderCollection(t.id); }
  else if (t.dataset.change === 'peer-set' && S.peer) { S.peer.setId = t.value; S.peer.limit = 0; renderPeer('#peer-set'); }
  else if (t.dataset.pfilter && S.peer) { S.peer.filters[t.dataset.pfilter] = t.value; S.peer.limit = 0; renderPeer('#' + t.id); }
  else if (t.dataset.change === 'reveal-direct') setPrefs({ revealDirect: t.checked });
  else if (t.dataset.change === 'shop-qty') setBuyQty(t.value, t.dataset.type || 'classique');
  else if (t.dataset.gift === 'type') { updateGift(t); cancelGiftConfirm(t); } // la quantité max suit le stock du type
  else if (t.dataset.gift) { updateGift(t); cancelGiftConfirm(t); }
}

/**
 * Un champ du don change pendant la confirmation : la confirmation ne vaut plus, elle est annulée et le formulaire redessiné,
 * le focus restant sur le champ modifié. Sans confirmation affichée, rien à redessiner (la valeur est déjà dans S.giftForm).
 * @param {HTMLElement} [field] champ modifié (son identifiant sert à lui rendre le focus)
 */
function cancelGiftConfirm(field = null) {
  if (!S.giftConfirm) return;
  S.giftConfirm = false;
  renderInventaire();
  if (field?.id) document.getElementById(field.id)?.focus({ preventScroll: true });
}

/**
 * Saisie dans le message du don : mémorisée dans S.giftForm. Si une confirmation est affichée, elle est annulée
 * et le curseur reste à sa place dans le message.
 * @param {Event} e
 */
function onInput(e) {
  const el = e.target;
  if (el.dataset.search === 'col') { searchCollection(el); return; }
  if (!el.dataset.gift) return;
  updateGift(el);
  if (!S.giftConfirm) return;
  const pos = el.selectionStart ?? el.value.length;
  cancelGiftConfirm(el);
  const ta = document.getElementById('gift-msg');
  if (ta) ta.setSelectionRange(pos, pos); // le curseur reste où on tapait
}

/** Minuterie de la recherche dans la collection (on attend une courte pause dans la frappe). */
let searchTimer = null;
/**
 * Saisie dans « Chercher une carte » : la grille se redessine après une courte pause, le curseur reste à sa place.
 * @param {HTMLInputElement} el champ de recherche
 */
function searchCollection(el) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const pos = el.selectionStart ?? el.value.length;
    S.filters.q = el.value.slice(0, 60);
    S.colLimit = 0;
    renderCollection('cartes-f-q');
    const box = document.getElementById('cartes-f-q');
    try { box?.setSelectionRange(pos, pos); } catch {}
  }, 160);
}

/**
 * Envoi du formulaire de don (touche Entrée) : même chemin que le bouton « Offrir ».
 * @param {SubmitEvent} e
 */
function onSubmit(e) {
  if (e.target.id !== 'inv-gift-form') return;
  e.preventDefault();
  askGift();
}

/**
 * Flèches, Début et Fin dans la liste des onglets : déplace la sélection et le focus (motif ARIA « tabs »).
 * @param {KeyboardEvent} e
 */
function onTabKey(e) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  if (S.offline) return; // Q4 : hors ligne, seule la collection est ouverte
  const ids = TABS.map(([id]) => id);
  const i = ids.indexOf(S.tab);
  const n = e.key === 'ArrowRight' ? (i + 1) % ids.length
    : e.key === 'ArrowLeft' ? (i - 1 + ids.length) % ids.length
    : e.key === 'Home' ? 0 : ids.length - 1;
  e.preventDefault();
  setTab(ids[n]);
  focusSection();
}

/* ---------- Démarrage ---------- */
/**
 * Point d'entrée de la page : squelette, écouteurs, chargement des données, routage de l'adresse,
 * quêtes et compte à rebours du booster gratuit. Une erreur de chargement est affichée sans bloquer la page.
 * @returns {Promise<void>}
 */
async function boot() {
  if (OFF) { bootOffline(); return; }
  app.innerHTML = skeleton();
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('input', onInput);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('keydown', onCardKey);
  // Dernier bouton ou champ qui a eu le focus : restoreFocus le lui rend après un redessin.
  app.addEventListener('focusin', (e) => { S.focusHint = keyOf(e.target); });
  $('#cartes-tablist').addEventListener('keydown', onTabKey);
  $('#cartes-detail').addEventListener('close', () => { S.detailId = null; });
  // Dialogue du choix de série : Échap ou Annuler ferme sans rien ouvrir, et le focus revient au bouton d'origine.
  $('#cartes-serie-pick').addEventListener('close', () => {
    const ask = S.seriePick;
    S.seriePick = null;
    if (ask?.from?.isConnected) ask.from.focus({ preventScroll: true });
  });
  window.addEventListener('resize', () => fitAll(app));
  const fromHash = ongletAdresse();
  if (TABS.some(([id]) => id === fromHash)) { S.tab = fromHash; showTab(); } // lien direct vers un onglet : /pages/cartes/cartes.html#boutique
  try {
    await Promise.all([loadStatic(), loadGenerations(), loadTagLabels()]); // générations (C8) et libellés des jeux (C7) : jamais d'erreur
    await refreshData();
    renderAll();
    cacheOwnedImages(); // Q4 : images des cartes possédées gardées pour le hors ligne
    if (new URLSearchParams(location.search).get('planche') === '1') openPlanche(); // retour de la planche : « Changer les paramètres »
    // Cagnotte collective (C13) : encart au-dessus des onglets, module chargé à part
    import('./cartes-cagnotte.js').then((m) => m.mountPot($('#cartes-pot'), { me, balance: bal, refresh: async () => { await refreshData(); renderAll(); } })).catch(() => {});
  } catch (e) {
    app.querySelector('#cartes-wallet').innerHTML = `<p class="empty">${esc(errMsg(e))}</p>`;
    toast(errMsg(e), 'error');
  }
  // Idées du gang (paquet C2) : codes cadeaux, Atelier, enchère. Chaque module se charge seul et ne bloque pas la page.
  const refreshAll = async () => { await refreshAfter(refreshData); renderAll(); };
  initCodes({ app, refresh: refreshAll, goTab: (id) => { setTab(id); focusSection(); } });
  // Atelier et enchère : modules chargés à part (onglets peu visités), dessinés dès qu'ils arrivent.
  import('./cartes-atelier.js').then((m) => {
    m.initAtelier({ app, copies: () => S.copies, card: (id) => S.cardsById.get(id) || null, balance: bal, god: isGod, refresh: refreshAll });
    atelier = m;
    m.drawAtelier();
  }).catch(() => {});
  import('./cartes-enchere.js').then((m) => {
    m.initEnchere({ app, visible: () => S.tab === 'boutique' && !S.peer, refresh: refreshAll });
    enchere = m;
    m.drawEnchere();
  }).catch(() => {});
  window.addEventListener('hashchange', routeFromHash);
  routeFromHash(); // lien direct vers une collection ou retour arrière depuis elle
  loadQuests();
  // Dons et membres : chargés à part, sans bloquer la page (la section Inventaire les attend)
  loadGifts();
  loadMembers();
  // Propositions de cartes (migration 080, C6) : encart sous la Collection quand une série en accepte.
  import('./cartes-propositions.js').then((m) => m.mountProposals(app, me)).catch(() => {});
  app.removeAttribute('aria-busy');
  // Le compte à rebours du booster gratuit se met à jour sans recharger la page
  // Pas de rafraîchissement quand l'onglet est caché ; une mise à jour immédiate au retour
  setInterval(() => { if (S.tab === 'ouverture' && !document.hidden) renderFree(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.tab === 'ouverture') renderFree(); });
}

/**
 * Q4 : démarrage sans réseau. Dessine la collection depuis la copie de l'appareil, en lecture seule : onglets
 * Ouverture, Inventaire, Boutique, Classement et Échanges grisés ; aucun appel à la base.
 * Sans copie (jamais ouverte avec du réseau, ou effacée), un bandeau l'explique.
 */
function bootOffline() {
  const c = OFF.copie?.cartes;
  if (!me || !c) {
    app.innerHTML = `<section class="page-head"><div><p class="eyebrow">Jeu de cartes</p><h1 class="page-title">Cartes</h1></div></section>
      ${offlineBannerHtml(null, 'ta collection')}
      <div class="btn-row"><a class="btn btn-ghost" href="/pages/compte/accueil.html">Aller à l'accueil</a></div>`;
    app.removeAttribute('aria-busy');
    return;
  }
  document.body.classList.add('cartes-offline');
  app.innerHTML = offlineBannerHtml(c.at, 'ta collection') + skeleton();
  app.addEventListener('click', onClick);
  app.addEventListener('change', onChange);
  app.addEventListener('input', onInput);
  app.addEventListener('keydown', onCardKey);
  $('#cartes-tablist').addEventListener('keydown', onTabKey);
  $('#cartes-detail').addEventListener('close', () => { S.detailId = null; });
  window.addEventListener('resize', () => fitAll(app));
  S.sets = Array.isArray(c.sets) ? c.sets : [];
  S.otherSets = new Map((Array.isArray(c.otherSets) ? c.otherSets : []).map((x) => [x.id, x]));
  S.cards = (Array.isArray(c.cards) ? c.cards : []).filter((k) => S.sets.some((x) => x.id === k.set_id));
  S.cardsById = new Map((Array.isArray(c.cards) ? c.cards : []).map((k) => [k.id, k]));
  S.copies = Array.isArray(c.copies) ? c.copies : [];
  S.state = { paillettes: Number(c.paillettes) || 0, config: {} };
  S.uniqueTaken = null;
  S.setId = ALL;
  S.tab = 'collection';
  for (const [id] of TABS) {
    if (id === 'collection') continue;
    const b = $(`#cartes-tab-${id}`);
    b.disabled = true;
    b.setAttribute('aria-disabled', 'true');
    b.title = 'Disponible quand le réseau revient';
  }
  renderAll();
  app.removeAttribute('aria-busy');
}

boot();
// Secret caché « secousse » : module chargé à part (/assets/espaces/arcade/pages.js).
import('../arcade/pages.js').then((m) => m.secretsCartes()).catch(() => {});
// Aperçu admin de la bannière Pentakill (?apercu=pentakill) : une fois, sans appel au serveur ni badge. Ignoré pour les membres.
if (me?.is_admin && new URLSearchParams(location.search).get('apercu') === 'pentakill') showPentakill({ kind: 'rarete', level: 1, new_level: false });
// Calendrier de l'Avent (migration 096) : rappel discret en décembre si une case attend sur l'accueil.
if (new Date().getMonth() === 11) import('../accueil/avent.js').then((m) => m.cartesReminder('#cartes-section-h')).catch(() => {});
