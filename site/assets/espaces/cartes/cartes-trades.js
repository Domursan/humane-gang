// ===== Cartes à collectionner — échanges entre membres =====
// Chargé par cartes.js : import('./cartes-trades.js').then((m) => m.mountTrades(el, ctx)).
// ctx = { me: profil courant (id, pseudo…), refresh: async () => {}, expose: (api) => {} } ; refresh recharge solde et collection côté page.
// expose reçoit { offer({ to, want }), onglet(id) } : ouvre l'éditeur d'offre avec un membre (utilisé par la collection d'un membre, cartes.js)
// ou un onglet du panneau (#echanges/tableau, lien des alertes de la liste de souhaits).
// Affichage des cartes : cartes-ui.js (cardHtml). Styles : cartes-trades.css (+ cartes-card.css).
// Exporte : mountTrades(el, ctx), la seule fonction appelée par cartes.js. Toute la logique est dans cette fonction :
// les données (S, E) sont partagées par les fonctions imbriquées et réinitialisées à chaque ouverture de la page.
// RPC : hg_members, hg_trade_propose, hg_trade_respond, hg_trade_cancel, hg_card_gift. Tables : hg_card_copies,
// hg_card_trades, hg_card_trade_items, hg_card_wishlist, hg_cards, hg_card_sets, hg_wallets. Notifications : notify().
import { sb, esc, toast, errMsg, avatarHtml, fmtDateTime, getUser, notify, currentLogo } from '../../commun/core.js';
import { cardHtml, rarityRank, rarityLabel, numberLabel, serialLabel, RARITIES, fmtP } from './cartes-ui.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { pluralCount } from '../../commun/utils.js';
import { keepPlace, holdHeight } from './cartes-place.js';
import { LOT, SEUIL, lotsAnticipes, gardeFocus } from './cartes-lots.js';

/* ---------- Constantes ---------- */
// Onglets du panneau : id (utilisé dans les attributs) et libellé affiché.
const TABS = [
  { id: 'recues', label: 'Reçues' },
  { id: 'envoyees', label: 'Envoyées' },
  { id: 'proposer', label: 'Proposer' },
  { id: 'correspondances', label: 'Correspondances' },
  { id: 'historique', label: 'Historique' },
  { id: 'tableau', label: 'Tableau' }, // « Je cherche / Je donne » (idée C12, cartes-tableau.js)
];
// Libellés des statuts d'une offre (colonne status de hg_card_trades).
const STATUS_LABEL = { proposee: 'En attente', acceptee: 'Acceptée', refusee: 'Refusée', annulee: 'Annulée', remplacee: 'Remplacée', expiree: 'Expirée' };
const PAGE = 1000;   // pagination PostgREST (plafond par défaut de la base)
const CHUNK = 100;   // identifiants par requête « in »
// Colonnes lues sur les exemplaires (hg_card_copies) : pas de select('*') pour rester léger.
const COPY_COLS = 'id, card_id, owner_id, shiny, serial, locked_trade, recycled_at';
const JOUR_MS = 86400000;

/* ---------- Petits outils (sans état) ---------- */
/** Convertit une valeur en entier positif ou nul (0 si invalide). Sert aux Paillettes saisies. */
const toInt = (v) => Math.max(0, Math.floor(Number(v) || 0));
/** Texte normalisé pour la recherche : sans accents, en minuscules. */
const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** Comparaison de textes en français (pour trier les pseudos et les noms). */
const cmp = (a, b) => String(a).localeCompare(String(b), 'fr');
/** Renvoie les données d'une réponse Supabase, ou lève l'erreur. */
const unwrap = ({ data, error }) => { if (error) throw error; return data; };
/** Pastille de statut (« En attente », « Cadeau »...). cls ajoute une variante de couleur. */
const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;

/* Échéance d'une offre (colonne expire_le, migration 193), toujours à l'heure de Zurich comme le préavis écrit par la base. */
const ZURICH = 'Europe/Zurich';
/** Jour calendaire à Zurich, sous la forme AAAA-MM-JJ. */
const jourZurich = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: ZURICH, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
/** Nombre de jours calendaires entre deux dates. */
const ecartJours = (a, b) => Math.round((Date.parse(jourZurich(b)) - Date.parse(jourZurich(a))) / JOUR_MS);
/** « 2 nov. » */
const dateCourte = (d) => new Intl.DateTimeFormat('fr-FR', { timeZone: ZURICH, day: 'numeric', month: 'short' }).format(d);
/** « 18 h 40 » */
function heureCourte(d) {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: ZURICH, hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const v = (t) => p.find((x) => x.type === t).value;
  return `${Number(v('hour'))} h ${v('minute')}`;
}
/**
 * Échéance d'une offre en attente : la phrase affichée sous la date et, à moins de 24 h, la pastille de préavis.
 * @param {object} t offre (hg_card_trades)
 * @returns {{exp: string, pastille?: string}|null} null si l'offre n'a pas d'échéance
 */
function echeance(t) {
  if (!t.expire_le) return null;
  const fin = new Date(t.expire_le), now = new Date();
  if (fin - now > JOUR_MS) return { exp: `Expire dans ${pluralCount(ecartJours(now, fin), 'jour', 'jours')}, le ${dateCourte(fin)}` };
  return { pastille: ecartJours(now, fin) > 0 ? 'Expire demain' : 'Expire aujourd’hui', exp: `Se ferme le ${dateCourte(fin)} à ${heureCourte(fin)} sans réponse.` };
}

/**
 * Lit toutes les lignes d'une requête paginée (build() renvoie un nouveau constructeur à chaque page).
 * La base ne renvoie que PAGE lignes d'un coup : on continue tant qu'une page est pleine.
 * @param {() => object} build fonction qui renvoie une nouvelle requête Supabase
 * @returns {Promise<object[]>}
 */
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

/* ---------- Point d'entrée ---------- */
/**
 * Affiche l'onglet « Échanges » dans `el` et charge les données.
 * @param {HTMLElement} el élément hôte (vidé et remplacé)
 * @param {{me?: object, refresh?: () => Promise<void>, expose?: (api: object) => void}} [ctx]
 *   me : profil courant ; refresh : recharge solde et collection côté page ;
 *   expose : reçoit { offer({to, want}) } pour ouvrir l'éditeur depuis la collection d'un membre.
 * @returns {Promise<void>}
 */
export async function mountTrades(el, ctx = {}) {
  el.innerHTML = `
    <div class="trd">
      <div class="trd-sugg" id="trd-sugg" aria-live="polite"></div>
      <div class="trd-tabs" role="tablist" aria-label="Échanges de cartes"></div>
      <div class="trd-panel" id="trd-panel" role="tabpanel"></div>
      <dialog class="trd-dialog" id="trd-edit" aria-labelledby="trd-edit-title"><form class="trd-form" id="trd-form" novalidate></form></dialog>
    </div>`;
  const root = el.querySelector('.trd');
  const tabsEl = root.querySelector('.trd-tabs');
  const panel = root.querySelector('#trd-panel');
  const dlg = root.querySelector('#trd-edit');
  const form = root.querySelector('#trd-form');

  /* ---------- État ----------
     S : données de la page (membres, cartes, exemplaires, échanges, solde, onglet courant...).
     E : état de l'éditeur d'offre (destinataire, cartes choisies, filtres, aperçu...). */
  const S = {
    me: null, members: new Map(), cards: new Map(), copies: new Map(), trades: [], items: new Map(),
    wish: new Map(), balance: 0, tab: location.hash === '#echanges/tableau' ? 'tableau' : 'recues', pickWho: '', setNames: new Map(), setTotal: new Map(),
    peers: new Set(), matchesP: null,
    sugg: [], suggAll: false, // bloc « Échanges possibles » : membres suggérés et affichage « Voir plus »
  };
  const E = { to: '', parent: null, give: new Set(), want: new Set(), giveP: 0, wantP: 0, message: '', busy: false,
    filt: { give: { q: '', set: '', rar: '', dup: false, lim: 0 }, want: { q: '', set: '', rar: '', dup: false, lim: 0 } }, peek: null,
    lots: {} }; // lots : chargement anticipé de chaque colonne (lotsAnticipes), créé à chaque ouverture de l'éditeur

  /* ---------- Données ----------
     Chargement ciblé : mes exemplaires, mes échanges et les cartes qu'ils citent. Les exemplaires d'un membre
     (proposition) et les correspondances sont chargés à la demande. Le cache de session est vidé après chaque
     action sur un échange (resetCache). */
  /** Vide le cache de session (cartes, exemplaires, souhaits, correspondances). Appelée avant chaque rechargement. */
  function resetCache() {
    S.cards = new Map(); S.copies = new Map(); S.setTotal = new Map(); S.wish = new Map();
    S.peers = new Set(); S.matchesP = null;
  }
  /** Lit une table pour une liste d'identifiants (par lots de CHUNK, toutes les pages). */
  async function fetchIn(table, column, ids, select, { filter = (q) => q, order = 'id' } = {}) {
    const uniq = [...new Set(ids.filter((x) => x != null))];
    const out = [];
    for (let i = 0; i < uniq.length; i += CHUNK) {
      const chunk = uniq.slice(i, i + CHUNK);
      out.push(...await fetchAll(() => filter(sb.from(table).select(select).in(column, chunk)).order(order)));
    }
    return out;
  }
  /** Ajoute au cache les cartes absentes (et le total de chaque série rencontrée). */
  async function ensureCards(ids) {
    const missing = [...new Set(ids.filter((x) => x != null))].filter((id) => !S.cards.has(id));
    if (!missing.length) return;
    const rows = await fetchIn('hg_cards', 'id', missing, '*');
    for (const c of rows) S.cards.set(c.id, c);
    const sets = [...new Set(rows.map((c) => c.set_id).filter((x) => x != null))].filter((x) => !S.setTotal.has(x));
    await Promise.all(sets.map(async (sid) => { // nombre de cartes par série (numérotation « 012/100 ») : comptage seul
      const { count, error } = await sb.from('hg_cards').select('id', { count: 'exact', head: true }).eq('set_id', sid);
      if (!error) S.setTotal.set(sid, count || 0);
    }));
  }
  /** Ajoute au cache des exemplaires précis (et leurs cartes). */
  async function ensureCopies(ids) {
    const missing = [...new Set(ids.filter((x) => x != null).map(String))].filter((id) => !S.copies.has(id));
    if (!missing.length) return;
    const rows = await fetchIn('hg_card_copies', 'id', missing, COPY_COLS);
    for (const r of rows) S.copies.set(String(r.id), r);
    await ensureCards(rows.map((r) => r.card_id));
  }
  /** Exemplaires d'un membre (pour proposer un échange) : une seule requête, mise en cache pour la session. */
  async function ensurePeer(uid) {
    if (S.peers.has(uid)) return;
    const rows = await fetchAll(() => sb.from('hg_card_copies').select(COPY_COLS).eq('owner_id', uid).order('id'));
    for (const r of rows) S.copies.set(String(r.id), r);
    await ensureCards(rows.map((r) => r.card_id));
    S.peers.add(uid);
  }

  /**
   * Charge la page : membres, mes exemplaires, mes échanges (et leurs exemplaires), mes souhaits, mon solde, les séries.
   * Les requêtes principales partent en parallèle pour aller plus vite. Lève une erreur si une requête essentielle échoue.
   * @returns {Promise<void>}
   */
  async function load() {
    resetCache();
    const me = S.me.id;
    const [mem, mine, trades, wish, wallet, sets] = await Promise.all([
      sb.rpc('hg_members').then(unwrap),
      fetchAll(() => sb.from('hg_card_copies').select(COPY_COLS).eq('owner_id', me).order('id')),
      fetchAll(() => sb.from('hg_card_trades').select('*').or(`from_user.eq.${me},to_user.eq.${me}`).order('id')),
      fetchAll(() => sb.from('hg_card_wishlist').select('card_id').eq('user_id', me).order('card_id')),
      sb.from('hg_wallets').select('paillettes').eq('user_id', me).maybeSingle().then(unwrap),
      sb.from('hg_card_sets').select('id, name').then(({ data }) => data || []).catch(() => []), // facultatif : sans lui, pas de nom de série
    ]);
    S.setNames = new Map(sets.map((x) => [x.id, x.name]));
    S.members = new Map((mem || []).map((m) => [m.id, m]));
    S.balance = wallet?.paillettes ?? 0;
    S.copies = new Map(mine.map((c) => [String(c.id), c]));
    S.wish = new Map([[me, new Set(wish.map((w) => w.card_id))]]);
    S.trades = trades;
    S.items = new Map(trades.map((t) => [t.id, { from: [], to: [] }]));
    const rows = await fetchIn('hg_card_trade_items', 'trade_id', trades.map((t) => t.id), 'trade_id, copy_id, side', { order: 'trade_id' });
    for (const r of rows) S.items.get(r.trade_id)?.[r.side]?.push(r.copy_id);
    await ensureCopies(rows.map((r) => r.copy_id));
    await ensureCards(mine.map((c) => c.card_id));
  }

  /* ---------- Outils (lecture des données en cache) ---------- */
  /** Fiche d'un membre ; un membre inconnu (ex. compte supprimé) est affiché comme « Membre ». */
  const memberOf = (id) => S.members.get(id) || { id, pseudo: 'Membre', color: null, avatar_url: null };
  /** Pseudo d'un membre. */
  const pseudo = (id) => memberOf(id).pseudo;
  /** Carte d'un exemplaire ; une carte absente du cache (rare) s'affiche comme « Carte inconnue ». */
  const cardOf = (copy) => S.cards.get(copy.card_id) || { name: 'Carte inconnue', rarity: 'commune', family: 'objet', number: null, max_copies: null };
  /** Champs d'affichage en plus de la carte : série, total de la série, arrivée du membre (carte Identité). */
  const shown = (card) => (card.id ? {
    ...card,
    set_name: S.setNames.get(card.set_id), set_total: S.setTotal.get(card.set_id),
    member_since: card.rarity === 'identite' ? (S.members.get(card.member_id)?.member_since ?? null) : null,
  } : card);
  /** Exemplaire par identifiant (les identifiants sont comparés en texte), ou null. */
  const copyOf = (id) => S.copies.get(String(id)) || null;
  /** Vrai si la carte peut être échangée (ni inactive, ni marquée non échangeable). */
  const cardOk = (copy) => { const k = S.cards.get(copy.card_id); return !!k && k.active !== false && k.tradeable !== false; };
  /** Tri : les plus rares d'abord, puis par nom, puis par numéro d'exemplaire. */
  const byCard = (a, b) => {
    const x = cardOf(a), y = cardOf(b);
    return rarityRank(y.rarity) - rarityRank(x.rarity) || cmp(x.name, y.name) || (a.serial || 0) - (b.serial || 0);
  };
  /** Tri : les plus récentes d'abord (date de création). */
  const byDateDesc = (a, b) => new Date(b.created_at) - new Date(a.created_at);
  /** Exemplaires que `owner` peut mettre en jeu : vivants, libres (ou bloqués par l'offre `parent`), carte échangeable. */
  const tradables = (owner, parent = null) => [...S.copies.values()]
    .filter((c) => c.owner_id === owner && !c.recycled_at && (!c.locked_trade || (parent && c.locked_trade === parent)) && cardOk(c))
    .sort(byCard);
  /** Identifiants des exemplaires d'un côté (« from » = ce que donne l'émetteur, « to » = ce que reçoit l'émetteur). */
  const idsOf = (t, side) => S.items.get(t.id)?.[side] || [];
  /** Exemplaires d'un côté, avec leurs données (ceux introuvables sont écartés). */
  const itemsOf = (t, side) => idsOf(t, side).map(copyOf).filter(Boolean);
  /** Un cadeau : offre acceptée sans aucune carte demandée en retour. */
  const isGift = (t) => t.status === 'acceptee' && idsOf(t, 'to').length === 0;
  /** Offres reçues en attente (pour moi), les plus récentes d'abord. */
  const incoming = () => S.trades.filter((t) => t.status === 'proposee' && t.to_user === S.me.id).sort(byDateDesc);
  /** Offres envoyées en attente (par moi), les plus récentes d'abord. */
  const outgoing = () => S.trades.filter((t) => t.status === 'proposee' && t.from_user === S.me.id).sort(byDateDesc);

  /* ---------- Rendu : éléments communs ---------- */
  /** Carte d'un exemplaire en petit format (rendu commun aux listes). */
  const copyCard = (c) => cardHtml(shown(cardOf(c)), { size: 'sm', shiny: c.shiny, serial: c.serial });
  /**
   * Un côté d'une offre : titre, cartes, Paillettes. Affiche « Rien » si le côté est vide.
   * @param {[string, object[], number]} param0 [titre, exemplaires, Paillettes]
   */
  function sideHtml([label, copies, p]) {
    const empty = !copies.length && !p;
    return `<section class="trd-side">
      <h4 class="trd-side-title">${esc(label)}</h4>
      ${copies.length ? `<div class="trd-cards">${copies.map(copyCard).join('')}</div>` : ''}
      ${p ? `<p class="trd-pails">${esc(fmtP(p))}</p>` : ''}
      ${empty ? '<p class="trd-none">Rien</p>' : ''}
    </section>`;
  }
  /** Carte d'une offre : en-tête (membre, date, échéance, statut), deux côtés, message facultatif et boutons d'action. */
  function articleHtml({ who, date, exp = '', badge, sides, message, actions = '' }) {
    return `<article class="card trd-offer">
      <header class="trd-offer-head">
        <div class="trd-who">${avatarHtml(who, 40)}<div><h3>${esc(who.pseudo)}</h3><p class="trd-date">${esc(fmtDateTime(date))}</p>${exp ? `<p class="trd-exp">${esc(exp)}</p>` : ''}</div></div>
        ${badge}
      </header>
      <div class="trd-sides">${sides.map(sideHtml).join('')}</div>
      ${message ? `<blockquote class="trd-msg">${esc(message)}</blockquote>` : ''}
      ${actions ? `<div class="btn-row trd-actions">${actions}</div>` : ''}
    </article>`;
  }
  /** Message « rien à afficher » d'un panneau. */
  const emptyBox = (text) => `<p class="empty">${esc(text)}</p>`;

  /* ---------- Rendu : onglets et panneaux ---------- */
  /** Dessine la barre d'onglets. Le compteur de l'onglet « Reçues » indique le nombre d'offres en attente. */
  function renderTabs() {
    const n = incoming().length;
    tabsEl.innerHTML = TABS.map((t) => {
      const sel = S.tab === t.id;
      const label = t.id === 'recues' && n ? `${t.label} (${n})` : t.label;
      return `<button class="trd-tab" type="button" role="tab" id="trd-tab-${t.id}" data-tab="${t.id}"
        aria-selected="${sel}" aria-controls="trd-panel" tabindex="${sel ? 0 : -1}">${esc(label)}</button>`;
    }).join('');
  }

  /**
   * Carte d'une offre en attente, vue du côté reçu (« in ») ou envoyé (« out »), avec ses boutons d'action.
   * @param {object} t offre (hg_card_trades)
   * @param {'in'|'out'} dir sens de l'offre par rapport à moi
   */
  function offerHtml(t, dir) {
    const who = memberOf(dir === 'in' ? t.from_user : t.to_user);
    const [l1, l2] = dir === 'in'
      ? [`${who.pseudo} te donne`, `${who.pseudo} te demande`]
      : ['Tu donnes', `Tu demandes à ${who.pseudo}`];
    const actions = dir === 'in'
      ? `<button class="btn btn-primary" type="button" data-act="accept" data-id="${esc(t.id)}">Accepter</button>
         <button class="btn btn-ghost" type="button" data-act="counter" data-id="${esc(t.id)}">Contre-proposer</button>
         <button class="btn btn-ghost" type="button" data-act="refuse" data-id="${esc(t.id)}">Refuser</button>`
      : `<button class="btn btn-ghost" type="button" data-act="cancel" data-id="${esc(t.id)}">Annuler l’offre</button>`;
    const fin = echeance(t);
    const attente = pill(STATUS_LABEL.proposee, 'pill-current');
    return articleHtml({
      who, date: t.created_at, exp: fin?.exp,
      badge: fin?.pastille ? `<span class="trd-offer-etat">${pill(fin.pastille, 'pill-exp')}${attente}</span>` : attente,
      sides: [[l1, itemsOf(t, 'from'), t.from_paillettes], [l2, itemsOf(t, 'to'), t.to_paillettes]],
      message: t.message, actions,
    });
  }

  /* ---------- Panneaux (un par onglet) : chacun renvoie du HTML ---------- */
  /** Onglet « Reçues » : offres en attente qu'on m'a faites. */
  function viewRecues() {
    const list = incoming();
    if (!list.length) return emptyBox('Aucune offre reçue en attente.');
    return `<div class="trd-list">${list.map((t) => offerHtml(t, 'in')).join('')}</div>`;
  }
  /** Onglet « Envoyées » : offres en attente que j'ai faites (annulables). */
  function viewEnvoyees() {
    const list = outgoing();
    if (!list.length) return emptyBox('Tu n’as aucune offre en attente.');
    return `<div class="trd-list">${list.map((t) => offerHtml(t, 'out')).join('')}</div>`;
  }

  /** Onglet « Proposer » : choix du membre, puis bouton pour composer une offre (ouvre l'éditeur). */
  function viewProposer() {
    const others = [...S.members.values()].filter((m) => m.id !== S.me.id).sort((a, b) => cmp(a.pseudo, b.pseudo));
    if (!others.length) return emptyBox('Aucun autre membre pour le moment.');
    return `<section class="card">
      <h2>Proposer un échange</h2>
      <p class="muted small">Choisis le membre, puis compose ton offre : les cartes que tu donnes, celles que tu demandes et des Paillettes.</p>
      <div class="trd-picker">
        <div class="field">
          <label for="trd-who">Membre</label>
          <select id="trd-who" class="input">
            <option value="">Choisir un membre…</option>
            ${others.map((m) => `<option value="${esc(m.id)}"${m.id === S.pickWho ? ' selected' : ''}>${esc(m.pseudo)}</option>`).join('')}
          </select>
        </div>
        <button class="btn btn-primary" type="button" data-act="compose" ${S.pickWho ? '' : 'disabled'}>Composer l’offre</button>
        <a class="btn btn-ghost" data-peer-link href="#collection/${esc(S.pickWho)}" ${S.pickWho ? '' : 'hidden'}>Voir sa collection</a>
      </div>
      <p class="trd-hint">Ton solde : ${esc(fmtP(S.balance))}</p>
    </section>`;
  }

  /** Données des correspondances, ciblées : exemplaires des cartes que je souhaite, et souhaits des autres
      pour les cartes que j'ai en double. Mises en cache jusqu'au prochain échange. */
  function loadMatches() {
    return S.matchesP ??= computeMatchData().catch((e) => { S.matchesP = null; throw e; });
  }
  /**
   * Lit ce qu'il faut pour les correspondances : mes exemplaires des cartes souhaitées, et les souhaits
   * des autres pour mes cartes en double. Ajoute les cartes au cache.
   * @returns {Promise<{wanted: object[], wishers: object[]}>}
   */
  async function computeMatchData() {
    const me = S.me.id;
    const counts = new Map();
    for (const c of S.copies.values()) {
      if (c.owner_id === me && !c.recycled_at && cardOk(c)) counts.set(c.card_id, (counts.get(c.card_id) || 0) + 1);
    }
    const dupCards = [...counts].filter(([, n]) => n >= 2).map(([card]) => card);
    const [wanted, wishers] = await Promise.all([
      fetchIn('hg_card_copies', 'card_id', [...(S.wish.get(me) || [])], COPY_COLS, { filter: (q) => q.is('recycled_at', null) }),
      fetchIn('hg_card_wishlist', 'card_id', dupCards, 'user_id, card_id', { order: 'user_id' }),
    ]);
    for (const c of wanted) S.copies.set(String(c.id), c); // pour l'éditeur (« Proposer un échange »)
    await ensureCards([...wanted.map((c) => c.card_id), ...dupCards]);
    return { wanted, wishers };
  }

  /** Correspondances : doublons des autres et souhaits que tu peux satisfaire, regroupés par membre. */
  function computeMatches(data) {
    const me = S.me.id;
    const myWish = S.wish.get(me) || new Set();
    const stats = new Map(); // « propriétaire|carte » -> { total, free: [exemplaires libres] }
    const seen = new Map([...S.copies, ...data.wanted.map((c) => [String(c.id), c])]);
    for (const c of seen.values()) {
      if (c.recycled_at || !c.owner_id || !cardOk(c)) continue;
      const k = `${c.owner_id}|${c.card_id}`;
      const s = stats.get(k) || { total: 0, free: [] };
      s.total++;
      if (!c.locked_trade) s.free.push(c);
      stats.set(k, s);
    }
    const rows = [];
    // « X a une carte que tu souhaites » : X en a au moins deux exemplaires
    for (const [k, s] of stats) {
      const [owner, card] = k.split('|');
      if (owner === me || !S.members.has(owner) || !s.free.length || s.total < 2 || !myWish.has(card)) continue;
      rows.push({ kind: 'want', member: owner, copy: s.free[0] });
    }
    // « X souhaite une carte que tu as en double » : tu en as au moins deux exemplaires
    const wishOf = new Map();
    for (const w of data.wishers) {
      if (!wishOf.has(w.user_id)) wishOf.set(w.user_id, new Set());
      wishOf.get(w.user_id).add(w.card_id);
    }
    for (const [uid, wset] of wishOf) {
      if (uid === me || !S.members.has(uid)) continue;
      for (const card of wset) {
        const mine = stats.get(`${me}|${card}`);
        if (mine && mine.total >= 2 && mine.free.length) rows.push({ kind: 'offer', member: uid, copy: mine.free[0] });
      }
    }
    return rows;
  }
  /** Onglet « Correspondances » : une section par membre, avec les cartes à proposer en échange. */
  function viewCorrespondances(data) {
    const rows = computeMatches(data);
    if (!rows.length) return emptyBox('Aucune correspondance pour le moment. Les correspondances apparaissent quand tes souhaits et les doublons des autres membres se rejoignent.');
    const groups = new Map();
    for (const r of rows) {
      if (!groups.has(r.member)) groups.set(r.member, []);
      groups.get(r.member).push(r);
    }
    const sorted = [...groups.entries()].sort((a, b) => cmp(pseudo(a[0]), pseudo(b[0])));
    return sorted.map(([uid, list]) => {
      const who = memberOf(uid);
      const items = list.sort((a, b) => byCard(a.copy, b.copy)).map((r) => {
        const label = r.kind === 'want'
          ? `${who.pseudo} a une carte que tu souhaites`
          : `${who.pseudo} souhaite une carte que tu as en double`;
        const attr = r.kind === 'want' ? `data-want="${r.copy.id}"` : `data-give="${r.copy.id}"`;
        return `<li class="trd-match">
          ${copyCard(r.copy)}
          <p>${esc(label)}</p>
          <button class="btn btn-ghost" type="button" data-act="open-match" data-to="${esc(uid)}" ${attr}>Proposer un échange</button>
        </li>`;
      }).join('');
      return `<section class="card trd-match-group">
        <header class="trd-who">${avatarHtml(who, 36)}<h2>${esc(who.pseudo)}</h2></header>
        <ul class="trd-match-list">${items}</ul>
      </section>`;
    }).join('');
  }

  /**
   * Une ligne de l'historique : cadeau, offre acceptée, refusée, annulée ou expirée. Les côtés sont présentés
   * du point de vue de « moi » (« Tu donnes » / « Tu reçois »).
   * @param {object} t offre terminée
   */
  function historyHtml(t) {
    const me = S.me.id;
    const other = t.from_user === me ? t.to_user : t.from_user;
    const mine = t.from_user === me ? 'from' : 'to';
    const theirs = mine === 'from' ? 'to' : 'from';
    /** Paillettes d'un côté de l'offre (« from » = émetteur, « to » = destinataire). */
    const pails =(side) => (side === 'from' ? t.from_paillettes : t.to_paillettes);
    const accepted = t.status === 'acceptee';
    let badge, sides, exp = '';
    if (isGift(t)) {
      badge = pill('Cadeau', 'pill-ok');
      sides = [[mine === 'from' ? 'Tu offres' : 'Tu reçois', itemsOf(t, 'from'), 0]];
    } else {
      const [lm, lt] = accepted ? ['Tu donnes', 'Tu reçois'] : ['Proposé : tu donnes', 'Demandé : tu reçois'];
      badge = pill(STATUS_LABEL[t.status] || t.status, accepted ? 'pill-ok' : '');
      sides = [[lm, itemsOf(t, mine), pails(mine)], [lt, itemsOf(t, theirs), pails(theirs)]];
    }
    if (t.status === 'expiree') { // seul celui qui a fait l'offre avait des cartes bloquées
      const jours = Math.max(1, Math.round((new Date(t.expire_le || t.resolved_at) - new Date(t.created_at)) / JOUR_MS));
      exp = `Sans réponse après ${pluralCount(jours, 'jour', 'jours')}.${mine === 'from' && idsOf(t, 'from').length ? ' Tes cartes sont de nouveau libres.' : ''}`;
    }
    return articleHtml({ who: memberOf(other), date: t.resolved_at || t.created_at, exp, badge, sides, message: t.message });
  }
  /** Onglet « Historique » : toutes les offres qui ne sont plus en attente, les plus récentes d'abord. */
  function viewHistorique() {
    const list = S.trades.filter((t) => t.status !== 'proposee')
      .sort((a, b) => new Date(b.resolved_at || b.created_at) - new Date(a.resolved_at || a.created_at));
    if (!list.length) return emptyBox('Aucun échange terminé pour le moment.');
    return `<div class="trd-list">${list.map(historyHtml).join('')}</div>`;
  }

  /** Dessine les onglets puis le panneau de l'onglet courant. L'onglet Correspondances se charge à part. */
  function renderPanel() {
    renderTabs();
    panel.setAttribute('aria-labelledby', `trd-tab-${S.tab}`);
    if (S.tab === 'correspondances') {
      const tab = S.tab;
      const release = holdHeight(panel); // le texte d'attente garde la hauteur : la page ne remonte pas
      panel.innerHTML = '<p class="empty">Recherche des correspondances…</p>';
      loadMatches()
        .then((data) => { if (S.tab === tab) panel.innerHTML = viewCorrespondances(data); })
        .catch((e) => { if (S.tab === tab) panel.innerHTML = `<div class="empty">Impossible de charger les correspondances : ${esc(errMsg(e))}</div>`; })
        .finally(release);
      return;
    }
    if (S.tab === 'tableau') { // tableau « Je cherche / Je donne » (idée C12) : module chargé à la demande
      import('./cartes-tableau.js')
        .then((m) => { if (S.tab === 'tableau') m.mountBoard(panel, { me: S.me, sets: S.setNames, openEditor }); })
        .catch(() => { panel.innerHTML = emptyBox('Le tableau n’est pas disponible pour le moment.'); });
      return;
    }
    const view = { recues: viewRecues, envoyees: viewEnvoyees, proposer: viewProposer, historique: viewHistorique }[S.tab];
    panel.innerHTML = view();
  }
  /** Redessine le panneau en gardant la place de l'utilisateur. */
  const render = () => keepPlace(renderPanel); // le re-rendu garde la place de l'utilisateur

  /* ---------- Échanges possibles (bloc au-dessus des onglets) ----------
     Deux listes : « Ils ont une carte de ta liste » (ils ont en double une carte que je souhaite) et
     « Ils cherchent tes doublons » (ils souhaitent une carte que j'ai en double). Un membre dans les deux
     listes est un échange gagnant-gagnant. Une seule requête (hg_trade_suggestions) ; sans elle, repli sur
     les données de l'onglet Correspondances. */
  /**
   * Normalise une suggestion : { uid, want: [{card_id, copy_id}], give: [...], both }.
   * @param {object} r ligne de hg_trade_suggestions (user_id, want, give, both)
   */
  const normSugg = (r) => ({
    uid: r.user_id, want: Array.isArray(r.want) ? r.want : [], give: Array.isArray(r.give) ? r.give : [],
    both: !!r.both && Array.isArray(r.want) && r.want.length > 0 && Array.isArray(r.give) && r.give.length > 0,
  });
  /**
   * Recalcule les suggestions avec les données de l'onglet Correspondances (repli si la fonction SQL manque).
   * @param {{wanted: object[], wishers: object[]}} data résultat de loadMatches()
   * @returns {object[]} suggestions au même format que normSugg
   */
  function suggestFallback(data) {
    const byUid = new Map();
    const slot = (uid) => { if (!byUid.has(uid)) byUid.set(uid, { uid, want: [], give: [], both: false }); return byUid.get(uid); };
    for (const r of computeMatches(data)) {
      const item = { card_id: r.copy.card_id, copy_id: Number(r.copy.id) };
      if (r.kind === 'want') slot(r.member).want.push(item); else slot(r.member).give.push(item);
    }
    for (const s of byUid.values()) s.both = s.want.length > 0 && s.give.length > 0;
    return [...byUid.values()];
  }
  /**
   * Charge les suggestions : hg_trade_suggestions, ou repli côté client si la fonction n'est pas encore en base.
   * Une réponse vide (null) n'est pas une erreur : aucune suggestion.
   * @returns {Promise<object[]>} suggestions normalisées, les plus utiles d'abord
   */
  async function loadSuggestions() {
    const { data, error } = await sb.rpc('hg_trade_suggestions', { p_limit: 60 });
    if (!error) return (Array.isArray(data) ? data : []).map(normSugg);
    if (!/hg_trade_suggestions|PGRST202|not find|introuvable/i.test(`${error.code || ''} ${error.message || ''}`)) throw error;
    return suggestFallback(await loadMatches());
  }
  /**
   * Ajoute au cache les exemplaires et cartes des suggestions (pour les vignettes et l'éditeur).
   * @param {object[]} list suggestions
   */
  async function ensureSuggestCopies(list) {
    const ids = list.flatMap((m) => [...m.want, ...m.give].map((it) => it.copy_id));
    await ensureCopies(ids);
  }
  /**
   * Charge puis dessine le bloc « Échanges possibles ». En cas d'erreur, un message discret (sans bloquer les onglets).
   * @returns {Promise<void>}
   */
  async function refreshSuggest() {
    const box = root.querySelector('#trd-sugg');
    if (!box) return;
    box.innerHTML = '<p class="trd-hint">Recherche d’échanges possibles…</p>';
    try {
      S.sugg = await loadSuggestions();
      await ensureSuggestCopies(S.sugg);
      drawSuggest();
    } catch (e) {
      box.innerHTML = `<p class="trd-hint">Échanges possibles indisponibles : ${esc(errMsg(e))}</p>`;
    }
  }
  /** Une suggestion (membre) : vignettes des cartes concernées par côté et bouton qui ouvre l'éditeur pré-rempli. */
  function suggestItemHtml(m) {
    const who = memberOf(m.uid);
    const wantIds = m.want.map((it) => String(it.copy_id)).filter(copyOf);
    const giveIds = m.give.map((it) => String(it.copy_id)).filter(copyOf);
    const parts = [];
    if (wantIds.length) parts.push(`<section class="trd-sugg-part">
        <h4 class="trd-side-title">Ils ont une carte de ta liste</h4>
        <div class="trd-cards">${wantIds.map((id) => copyCard(copyOf(id))).join('')}</div></section>`);
    if (giveIds.length) parts.push(`<section class="trd-sugg-part">
        <h4 class="trd-side-title">Ils cherchent tes doublons</h4>
        <div class="trd-cards">${giveIds.map((id) => copyCard(copyOf(id))).join('')}</div></section>`);
    return `<article class="trd-sugg-item${m.both ? ' is-both' : ''}">
      <header class="trd-who">${avatarHtml(who, 36)}<div class="trd-sugg-name"><h3>${esc(who.pseudo)}</h3>${m.both ? pill('Échange gagnant-gagnant', 'pill-ok') : ''}</div></header>
      ${parts.join('')}
      <div class="btn-row"><button class="btn btn-primary" type="button" data-act="sugg-open" data-to="${esc(m.uid)}"
        data-give="${esc(giveIds.join(','))}" data-want="${esc(wantIds.join(','))}">Proposer un échange</button></div>
    </article>`;
  }
  /** Dessine le bloc « Échanges possibles » à partir de S.sugg (6 membres, puis « Voir plus »). */
  function drawSuggest() {
    const box = root.querySelector('#trd-sugg');
    if (!box) return;
    const list = S.sugg;
    if (!list.length) {
      box.innerHTML = `<section class="card trd-sugg-box"><h2>Échanges possibles</h2>
        <p class="muted small">Aucun échange possible pour le moment. Ils apparaissent quand un membre a en double une carte de ta liste de souhaits, ou souhaite une carte que tu as en double.</p></section>`;
      return;
    }
    const shown = S.suggAll ? list : list.slice(0, 6);
    const more = list.length > 6
      ? `<div class="btn-row"><button class="btn btn-ghost" type="button" data-act="sugg-more" aria-expanded="${S.suggAll}">${S.suggAll ? 'Voir moins' : `Voir plus (${list.length - 6})`}</button></div>`
      : '';
    box.innerHTML = `<section class="card trd-sugg-box" aria-labelledby="trd-sugg-title">
      <h2 id="trd-sugg-title">Échanges possibles</h2>
      <p class="muted small">Ces membres ont ce qu’il te faut ou cherchent tes doublons. Ouvre une offre déjà pré-remplie.</p>
      <div class="trd-sugg-list">${shown.map(suggestItemHtml).join('')}</div>
      ${more}
    </section>`;
  }

  /* ---------- Éditeur d'offre (<dialog>) ---------- */
  /** Filtres vides d'une colonne de l'éditeur (recherche, série, rareté, doublons seulement). */
  // lim : nombre de cartes dessinées par colonne quand la liste est longue (lot de cartes-lots.js), remis à zéro à chaque filtre.
  const freshFilter = () => ({ q: '', set: '', rar: '', dup: false, lim: 0 });
  /** Propriétaire des cartes d'un côté : moi pour « give », le destinataire pour « want ». */
  const sideOwner = (side) => (side === 'give' ? S.me.id : E.to);
  /** Exemplaires d'un côté : disponibles, plus ceux déjà dans l'offre (toujours visibles, même filtrés). */
  const sideCopies = (side) => withSelected(side === 'give' ? tradables(S.me.id) : tradables(E.to, E.parent), E[side]);
  /** Ajoute à la liste de base les exemplaires déjà choisis qui n'y figurent pas, puis trie. */
  const withSelected = (base, set) => [...base, ...[...set].map(copyOf).filter((c) => c && !base.includes(c))].sort(byCard);
  /** Nombre d'exemplaires possédés par un membre, par carte (exemplaires recyclés exclus). */
  function ownedCounts(owner) {
    const m = new Map();
    for (const c of S.copies.values()) if (c.owner_id === owner && !c.recycled_at) m.set(c.card_id, (m.get(c.card_id) || 0) + 1);
    return m;
  }
  /**
   * Vrai si l'exemplaire passe les filtres de la colonne (texte, série, rareté, doublons).
   * @param {object} c exemplaire
   * @param {object} f filtres de la colonne
   * @param {Map} counts nombre d'exemplaires par carte (pour « Doublons seulement »)
   */
  function matchesFilter(c, f, counts) {
    const card = cardOf(c);
    const q = f.q.trim();
    if (q && !norm(card.name).includes(norm(q))) return false;
    if (f.set && String(card.set_id) !== f.set) return false;
    if (f.rar && card.rarity !== f.rar) return false;
    if (f.dup && (counts.get(c.card_id) || 0) < 2) return false;
    return true;
  }

  /**
   * Ouvre l'éditeur d'offre (ou de contre-proposition si parent est donné) avec un membre.
   * Charge les exemplaires du membre avant d'afficher la fenêtre.
   * @param {{to: string, parent?: string|null, give?: string[], want?: string[], giveP?: number, wantP?: number, message?: string}} opts
   */
  async function openEditor({ to, parent = null, give = [], want = [], giveP = 0, wantP = 0, message = '' }) {
    if (!to || !S.members.has(to)) return toast('Choisis un membre pour l’échange.', 'error');
    try { await ensurePeer(to); } catch (e) { return toast(errMsg(e), 'error'); }
    Object.assign(E, {
      to, parent, give: new Set(give.map(String)), want: new Set(want.map(String)), giveP, wantP, message, busy: false,
      filt: { give: freshFilter(), want: freshFilter() }, peek: null,
    });
    renderEditor();
    dlg.showModal();
  }

  /**
   * Une colonne de l'éditeur (« Je donne » ou « Je demande ») : titre, filtres, compteur, grille, Paillettes.
   * @param {'give'|'want'} side
   */
  function colHtml(side) {
    const give = side === 'give';
    const to = memberOf(E.to);
    const rarOpts = '<option value="">Toutes</option>' + RARITIES.map((r) => `<option value="${r.id}">${esc(r.label)}</option>`).join('');
    return `
      <fieldset class="trd-col">
        <legend>${give ? 'Je donne' : `Je demande à ${esc(to.pseudo)}`}</legend>
        <div class="trd-flist-head">
          <h4 class="trd-side-title">${give ? 'Tes cartes' : 'Ses cartes'}</h4>
          <p class="trd-fres" id="trd-fres-${side}" aria-live="polite"></p>
        </div>
        <div class="trd-fbar" role="group" aria-label="Filtrer ${give ? 'tes cartes' : 'ses cartes'}">
          <div class="field">
            <label for="trd-q-${side}">Rechercher</label>
            <input id="trd-q-${side}" type="search" placeholder="Nom de la carte" autocomplete="off" data-fside="${side}" data-ffield="q">
          </div>
          <div class="trd-fsels">
            <div class="field"><label for="trd-set-${side}">Série</label><select id="trd-set-${side}" data-fside="${side}" data-ffield="set"></select></div>
            <div class="field"><label for="trd-rar-${side}">Rareté</label><select id="trd-rar-${side}" data-fside="${side}" data-ffield="rar">${rarOpts}</select></div>
          </div>
          <div class="trd-fline">
            <button class="trd-chip" type="button" aria-pressed="false" data-fchip="${side}">Doublons seulement</button>
            <button class="trd-freset" type="button" data-freset="${side}" hidden>Réinitialiser</button>
          </div>
        </div>
        <p class="trd-count" id="trd-n-${side}"></p>
        <div class="trd-grid" id="trd-grid-${side}"></div>
        <div class="field">
          <label for="trd-${give ? 'gp' : 'wp'}">${give ? 'Paillettes que je donne' : 'Paillettes que je demande'}</label>
          <input id="trd-${give ? 'gp' : 'wp'}" type="number" min="0" step="1" inputmode="numeric" value="${give ? E.giveP : E.wantP}">
          ${give ? `<p class="trd-hint">Ton solde : ${esc(fmtP(S.balance))}</p>` : ''}
        </div>
      </fieldset>`;
  }

  /** HTML de la zone d'aperçu (carte en grand et détails). Repliée et collée en haut sur téléphone. */
  function peekHtml() {
    return `<section class="trd-peek" id="trd-peek" data-state="empty" aria-label="Aperçu de la carte">
        <p class="eyebrow trd-peek-tag">Aperçu</p>
        <div class="trd-peek-row">
          <span class="trd-peek-thumb" id="trd-peek-thumb" aria-hidden="true"></span>
          <div class="trd-peek-meta"><strong id="trd-peek-name"></strong><span id="trd-peek-sub"></span></div>
          <button class="trd-peek-toggle" type="button" data-peek-toggle aria-expanded="false" aria-controls="trd-peek-more">Détails</button>
        </div>
        <div class="trd-peek-more" id="trd-peek-more">
          <div class="trd-peek-stage" id="trd-peek-stage" hidden></div>
          <p class="trd-peek-empty" id="trd-peek-empty">Survole une carte pour voir ses détails</p>
          <dl class="trd-peek-dl" id="trd-peek-dl"></dl>
        </div>
      </section>`;
  }

  /** Dessine tout l'éditeur (titre, deux colonnes, aperçu, message, récapitulatif) à partir de E. */
  function renderEditor() {
    const to = memberOf(E.to);
    const isCounter = !!E.parent;
    const title = isCounter ? `Contre-proposition à ${to.pseudo}` : `Proposer un échange à ${to.pseudo}`;
    const note = isCounter
      ? 'Ta contre-proposition remplace l’offre reçue : l’offre d’origine ne sera plus valable.'
      : 'Les cartes que tu donnes sont bloquées le temps que l’offre est en attente.';
    dlg.setAttribute('aria-labelledby', 'trd-edit-title');
    form.innerHTML = `
      <header class="trd-dlg-head">
        <div><p class="eyebrow">${isCounter ? 'Contre-proposition' : 'Nouvelle offre'}</p><h2 id="trd-edit-title">${esc(title)}</h2></div>
        <button class="trd-close" type="button" data-act="close-editor" aria-label="Fermer">×</button>
      </header>
      <div class="trd-dlg-main">
        ${peekHtml()}
        <div class="trd-dlg-body">
          <p class="trd-note">${esc(note)}</p>
          <div class="trd-cols">${colHtml('give')}${colHtml('want')}</div>
          <div class="field">
            <label for="trd-msg">Message (facultatif)</label>
            <textarea id="trd-msg" maxlength="500" rows="3" placeholder="Un mot pour ${esc(to.pseudo)}…">${esc(E.message)}</textarea>
            <p class="trd-hint" id="trd-mcount"></p>
          </div>
          <p class="trd-summary" id="trd-sum"></p>
          <p class="trd-err" id="trd-err" role="alert"></p>
        </div>
      </div>
      <footer class="trd-dlg-foot">
        ${isCounter ? '' : '<button class="btn btn-ghost" type="button" data-act="gift" id="trd-gift">Offrir en cadeau</button>'}
        <button class="btn btn-ghost" type="button" data-act="close-editor">Annuler</button>
        <button class="btn btn-primary" type="submit" id="trd-send">${isCounter ? 'Envoyer la contre-proposition' : 'Envoyer l’offre'}</button>
      </footer>`;
    for (const side of ['give', 'want']) fillSeries(side);
    // Chargement anticipé de chaque colonne : la zone défilante est la grille de la colonne (voir .trd-grid).
    E.lots = {};
    renderPicks();
    for (const side of ['give', 'want']) {
      E.lots[side] = lotsAnticipes({
        zone: form.querySelector(`#trd-grid-${side}`),
        sentinelle: () => form.querySelector(`[data-sentinel="${side}"]`),
        charger: () => chargerLot(side),
      });
      E.lots[side].planifier();
    }
    renderPeek();
    updateSummary();
  }

  /** Menu Série : « Toutes les séries » puis chaque série présente dans la liste de ce côté. */
  function fillSeries(side) {
    const names = new Map();
    for (const c of sideCopies(side)) {
      const card = cardOf(c);
      if (card.set_id != null) names.set(String(card.set_id), S.setNames.get(card.set_id) || 'Série sans nom');
    }
    form.querySelector(`#trd-set-${side}`).innerHTML = '<option value="">Toutes les séries</option>'
      + [...names].sort((a, b) => cmp(a[1], b[1])).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
  }

  /**
   * Une carte cliquable de la grille de l'éditeur. aria-pressed indique si elle est dans l'offre.
   * @param {object} c exemplaire
   * @param {'give'|'want'} side
   */
  function pickHtml(c, side) {
    const on = E[side].has(String(c.id));
    return `<div class="trd-pickwrap${on ? ' is-on' : ''}">${cardHtml(shown(cardOf(c)), {
      size: 'sm', shiny: c.shiny, serial: c.serial, button: true,
      attrs: `aria-pressed="${on}" data-side="${side}" data-id="${c.id}"`,
    })}<span class="trd-tick" aria-hidden="true">✓</span></div>`;
  }
  /** Redessine les deux listes (filtres appliqués ; les cartes de l'offre restent visibles). */
  function renderPicks() { renderSide('give'); renderSide('want'); }
  /**
   * Redessine une liste de l'éditeur : cartes filtrées, compteur « x sur y », bouton « Réinitialiser ».
   * Au-delà de SEUIL cartes, un lot seulement (LOT, cartes-lots.js) ; un bouton « Afficher plus » et une sentinelle
   * ajoutent le lot suivant. Les cartes de l'offre restent toujours dessinées (même hors du lot), donc gardées sélectionnées.
   * Le focus reste sur l'élément qui l'avait (gardeFocus) : un lot qui arrive ne le déplace pas.
   * @param {'give'|'want'} side
   */
  function renderSide(side) {
    gardeFocus(form, () => {
      const f = E.filt[side];
      const all = sideCopies(side);
      const counts = ownedCounts(sideOwner(side));
      const active = !!(f.q.trim() || f.set || f.rar || f.dup);
      const matching = all.filter((c) => E[side].has(String(c.id)) || matchesFilter(c, f, counts));
      const batched = matching.length > SEUIL;
      const lim = Math.max(LOT, f.lim || 0);
      const list = batched ? matching.filter((c, i) => i < lim || E[side].has(String(c.id))) : matching;
      const rest = batched ? Math.max(0, matching.length - lim) : 0;
      const more = rest > 0
        ? `<div class="trd-more"><button type="button" class="btn btn-ghost trd-more-btn" data-lot="${side}">+ Afficher ${Math.min(LOT, rest)} de plus</button><span class="trd-sentinel" data-sentinel="${side}" aria-hidden="true"></span></div>`
        : '';
      const cells = list.map((c) => pickHtml(c, side)).join('');
      form.querySelector(`#trd-grid-${side}`).innerHTML = cells
        ? cells + more
        : `<p class="trd-none">${active ? 'Aucune carte ne correspond aux filtres.' : 'Aucune carte disponible.'}</p>`;
      form.querySelector(`#trd-fres-${side}`).textContent = batched && rest > 0
        ? `${lim} sur ${matching.length} affichées`
        : active
          ? `${matching.length} sur ${all.length} affichées`
          : pluralCount(all.length, 'carte', 'cartes');
      form.querySelector(`[data-freset="${side}"]`).hidden = !active;
      form.querySelector(`[data-fchip="${side}"]`).setAttribute('aria-pressed', String(f.dup));
      E.lots[side]?.planifier(); // la colonne se remplit toute seule si elle ne couvre pas encore sa zone
    });
  }
  /**
   * Dessine le lot suivant d'une colonne (bouton « Afficher plus » ou chargement anticipé). Renvoie false s'il n'y a rien à ajouter.
   * @param {'give'|'want'} side
   * @returns {boolean}
   */
  function chargerLot(side) {
    const f = E.filt[side];
    if (!form.querySelector(`[data-sentinel="${side}"]`)) return false;
    f.lim = Math.max(LOT, f.lim || 0) + LOT;
    renderSide(side);
    return true;
  }
  /**
   * Remet à zéro les filtres d'une colonne et donne le focus à la recherche.
   * @param {'give'|'want'} side
   */
  function resetFilters(side) {
    E.filt[side] = freshFilter();
    form.querySelector(`#trd-q-${side}`).value = '';
    form.querySelector(`#trd-set-${side}`).value = '';
    form.querySelector(`#trd-rar-${side}`).value = '';
    renderSide(side);
    form.querySelector(`#trd-q-${side}`).focus();
  }

  /**
   * Change la carte affichée dans l'aperçu (sans changer la sélection). Ne redessine que si elle a changé.
   * @param {string} id identifiant de l'exemplaire
   */
  function setPeek(id) {
    if (E.peek === id) return;
    E.peek = id;
    renderPeek();
  }
  /** Redessine l'aperçu : carte en grand et tableau de détails (série, numéro, exemplaires possédés, présence dans l'offre). */
  function renderPeek() {
    const root = form.querySelector('#trd-peek');
    if (!root) return;
    const $ = (k) => form.querySelector(`#trd-peek-${k}`);
    const c = E.peek ? copyOf(E.peek) : null;
    if (!c) {
      root.dataset.state = 'empty';
      $('name').textContent = 'Touche une carte pour voir ses détails';
      $('sub').textContent = '';
      $('thumb').innerHTML = '';
      $('stage').hidden = true;
      $('empty').hidden = false;
      $('dl').innerHTML = '';
      return;
    }
    const card = shown(cardOf(c));
    const mine = ownedCounts(S.me.id).get(c.card_id) || 0;
    const theirs = ownedCounts(E.to).get(c.card_id) || 0;
    const owned = c.owner_id === S.me.id
      ? `Tu en possèdes ${mine}`
      : `${mine ? `Tu en possèdes ${mine}` : 'Tu n’en possèdes aucun'} · ${pseudo(E.to)} en a ${theirs}`;
    const place = E.give.has(String(c.id)) ? 'Oui, dans ton offre'
      : E.want.has(String(c.id)) ? `Oui, demandée à ${pseudo(E.to)}` : 'Non';
    const rows = [
      ['Nom', esc(card.name)],
      ['Rareté', esc(rarityLabel(card.rarity))],
      ['Série', esc(card.set_name || '—')],
      ['Numéro', esc(numberLabel(card) || '—')],
      ['Brillante', c.shiny ? 'Oui, cet exemplaire' : 'Non'],
      ...(c.serial ? [['Exemplaire', esc(serialLabel(c.serial, card.max_copies))]] : []),
      ['Exemplaires possédés', esc(owned)],
      ['Dans l’offre', esc(place)],
      ['Texte d’ambiance', card.flavor
        ? `<em>« ${esc(card.flavor)} »</em>${card.caption ? '<br>' + esc(card.caption) : ''}`
        : (card.caption ? esc(card.caption) : '—')],
    ];
    root.dataset.state = 'card';
    $('name').textContent = card.name;
    $('sub').textContent = `${rarityLabel(card.rarity)}${card.set_name ? ' · ' + card.set_name : ''}`;
    $('thumb').innerHTML = `<img src="${esc(card.image_url || currentLogo())}" alt="" decoding="async">`;
    $('stage').hidden = false;
    $('stage').innerHTML = cardHtml(card, { size: 'md', shiny: c.shiny, serial: c.serial });
    $('empty').hidden = true;
    $('dl').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  /** Met à jour les compteurs de sélection, le récapitulatif et le nombre de caractères du message. */
  function updateSummary() {
    const g = E.give.size, w = E.want.size;
    form.querySelector('#trd-n-give').textContent = pluralCount(g, 'carte sélectionnée', 'cartes sélectionnées');
    form.querySelector('#trd-n-want').textContent = pluralCount(w, 'carte sélectionnée', 'cartes sélectionnées');
    form.querySelector('#trd-sum').textContent = `Récapitulatif : tu donnes ${pluralCount(g, 'carte', 'cartes')}${E.giveP ? ` et ${fmtP(E.giveP)}` : ''} ; tu demandes ${pluralCount(w, 'carte', 'cartes')}${E.wantP ? ` et ${fmtP(E.wantP)}` : ''}.`;
    form.querySelector('#trd-mcount').textContent = `${E.message.length} / 500 caractères`;
  }
  /** Affiche un message d'erreur dans l'éditeur (chaîne vide pour l'effacer). */
  function showErr(msg) {
    const box = form.querySelector('#trd-err');
    if (box) box.textContent = msg;
  }
  /** Désactive ou réactive tous les boutons de l'éditeur pendant un envoi. */
  function setEditorBusy(on) {
    form.querySelectorAll('button').forEach((b) => { b.disabled = on; });
  }
  /**
   * Ajoute ou retire une carte de la colonne de l'offre (give ou want), puis met l'aperçu et le récapitulatif à jour.
   * @param {HTMLButtonElement} btn carte cliquée (data-side, data-id)
   */
  function togglePick(btn) {
    const set = E[btn.dataset.side];
    const id = btn.dataset.id;
    const on = !set.has(id);
    if (on) set.add(id); else set.delete(id);
    btn.setAttribute('aria-pressed', String(on));
    btn.parentElement.classList.toggle('is-on', on);
    showErr('');
    E.peek = id;
    renderPeek();
    updateSummary();
  }

  /**
   * Envoie l'offre (hg_trade_propose, ou la contre-proposition si E.parent) ou le cadeau (hg_card_gift).
   * Contrôle d'abord les champs : offre vide, Paillettes insuffisantes, cadeau sans carte.
   * @param {boolean} gift true pour offrir un cadeau (demande de confirmation avant envoi)
   * @returns {Promise<void>}
   */
  async function sendOffer(gift) {
    // E.busy : bloque un second envoi tant que le premier n'a pas répondu.
    if (E.busy) return;
    const isCounter = !!E.parent;
    const to = memberOf(E.to);
    const give = [...E.give].map(Number);
    const want = gift ? [] : [...E.want].map(Number);
    const message = E.message.trim() || null;
    if (gift) {
      if (!give.length) return showErr('Choisis au moins une carte à offrir.');
      const ok = await confirmBox('Offrir ce cadeau ?',
        `Tu offres ${pluralCount(give.length, 'carte', 'cartes')} à ${to.pseudo}. Le cadeau est définitif. Les cartes demandées et les Paillettes ne sont pas prises en compte.`,
        { ok: 'Offrir' });
      if (!ok) return;
    } else {
      if (!give.length && !want.length && !E.giveP && !E.wantP) return showErr('L’offre est vide : ajoute au moins une carte ou des Paillettes.');
      if (E.giveP > S.balance) return showErr(`Pas assez de Paillettes : tu en as ${fmtP(S.balance)}.`);
    }
    E.busy = true; setEditorBusy(true); showErr('');
    const res = gift
      ? await sb.rpc('hg_card_gift', { p_to: E.to, p_copies: give, p_message: message })
      : await sb.rpc('hg_trade_propose', { p_to: E.to, p_give: give, p_want: want, p_give_p: E.giveP, p_want_p: E.wantP, p_message: message, p_parent: E.parent });
    E.busy = false; setEditorBusy(false);
    if (res.error) return showErr(errMsg(res.error));
    if (!gift && res.data) notify('trade_offer', { trade_id: res.data }).catch(() => {}); // MP au destinataire (opt-in)
    dlg.close();
    const msg = gift ? `Cadeau offert à ${to.pseudo}` : isCounter ? 'Contre-proposition envoyée' : `Offre envoyée à ${to.pseudo}`;
    await finish(null, msg);
  }

  /* ---------- Actions sur les offres ---------- */
  /**
   * Accepter (après confirmation) ou refuser une offre reçue (hg_trade_respond).
   * @param {object} t offre
   * @param {boolean} accept true pour accepter, false pour refuser
   */
  async function respond(t, accept) {
    if (accept) {
      const give = itemsOf(t, 'from'), recv = itemsOf(t, 'to');
      const ok = await confirmBox('Accepter cet échange ?',
        `Tu reçois ${pluralCount(give.length, 'carte', 'cartes')}${t.from_paillettes ? ` et ${fmtP(t.from_paillettes)}` : ''} et tu donnes ${pluralCount(recv.length, 'carte', 'cartes')}${t.to_paillettes ? ` et ${fmtP(t.to_paillettes)}` : ''}. L’échange est définitif.`,
        { ok: 'Accepter' });
      if (!ok) return;
    }
    setPanelBusy(true);
    const { error } = await sb.rpc('hg_trade_respond', { p_trade: t.id, p_accept: accept });
    if (!error && accept) notify('card_trade', { trade_id: t.id }).catch(() => {});
    await finish(error, accept ? 'Échange conclu' : 'Offre refusée');
  }
  /**
   * Annule une offre que j'ai envoyée (hg_trade_cancel), après confirmation comme pour l'acceptation.
   * @param {object} t offre
   */
  async function cancelOffer(t) {
    const ok = await confirmBox('Annuler cette offre ?',
      'Ton offre est retirée et les cartes que tu donnes sont à nouveau disponibles. Tu pourras en envoyer une nouvelle.',
      { ok: 'Annuler l’offre' });
    if (!ok) return;
    setPanelBusy(true);
    const { error } = await sb.rpc('hg_trade_cancel', { p_trade: t.id });
    await finish(error, 'Offre annulée');
  }
  /** Désactive ou réactive les boutons du panneau pendant une action sur une offre. */
  function setPanelBusy(on) {
    panel.setAttribute('aria-busy', String(on));
    panel.querySelectorAll('button').forEach((b) => { b.disabled = on; });
  }
  /** Après une action : message, rechargement des données, rendu et refresh de la page. */
  async function finish(error, okMsg) {
    if (error) toast(errMsg(error), 'error');
    else toast(okMsg, 'ok');
    try { await load(); } catch (e) { toast(errMsg(e), 'error'); }
    render();
    refreshSuggest(); // le bloc « Échanges possibles » suit les offres (une offre en attente bloque ses cartes)
    if (!error) { try { await ctx.refresh?.(); } catch (e) { console.warn('[cartes-trades] refresh', e); } }
  }

  /* ---------- Événements ---------- */
  root.addEventListener('click', (e) => {
    const tab = e.target.closest('.trd-tab');
    if (tab && tabsEl.contains(tab)) {
      e.stopPropagation(); // les onglets de la page parente (cartes.js) ne doivent pas réagir à ceux-ci
      S.tab = tab.dataset.tab; render(); tabsEl.querySelector(`[data-tab="${S.tab}"]`)?.focus(); return;
    }
    const chip = e.target.closest('[data-fchip]');
    if (chip) { const side = chip.dataset.fchip; E.filt[side].dup = !E.filt[side].dup; E.filt[side].lim = 0; return renderSide(side); }
    const lot = e.target.closest('[data-lot]');
    if (lot) return chargerLot(lot.dataset.lot);
    const reset = e.target.closest('[data-freset]');
    if (reset) return resetFilters(reset.dataset.freset);
    const tog = e.target.closest('[data-peek-toggle]');
    if (tog) {
      const peek = form.querySelector('#trd-peek');
      const open = !peek.classList.contains('is-open');
      peek.classList.toggle('is-open', open);
      tog.setAttribute('aria-expanded', String(open));
      return;
    }
    const pick = e.target.closest('button[data-side][data-id]');
    if (pick) return togglePick(pick);
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close-editor') return dlg.close();
    if (act === 'gift') return sendOffer(true);
    if (act === 'retry') return start();
    if (act === 'compose') return openEditor({ to: S.pickWho });
    if (act === 'sugg-more') { S.suggAll = !S.suggAll; return drawSuggest(); }
    if (act === 'sugg-open') return openEditor({
      to: b.dataset.to,
      give: b.dataset.give ? b.dataset.give.split(',') : [],
      want: b.dataset.want ? b.dataset.want.split(',') : [],
    });
    if (act === 'open-match') return openEditor({
      to: b.dataset.to,
      give: b.dataset.give ? [b.dataset.give] : [],
      want: b.dataset.want ? [b.dataset.want] : [],
    });
    const t = S.trades.find((x) => x.id === b.dataset.id);
    if (!t) return;
    if (act === 'accept') return respond(t, true);
    if (act === 'refuse') return respond(t, false);
    if (act === 'cancel') return cancelOffer(t);
    if (act === 'counter') return openEditor({
      to: t.from_user, parent: t.id,
      give: idsOf(t, 'to'), want: idsOf(t, 'from'),
      giveP: t.to_paillettes, wantP: t.from_paillettes,
    });
  });
  root.addEventListener('change', (e) => {
    if (e.target.id !== 'trd-who') return;
    S.pickWho = e.target.value;
    const btn = panel.querySelector('[data-act="compose"]');
    if (btn) btn.disabled = !S.pickWho;
    const link = panel.querySelector('[data-peer-link]');
    if (link) { link.hidden = !S.pickWho; link.setAttribute('href', '#collection/' + S.pickWho); }
  });
  tabsEl.addEventListener('keydown', (e) => {
    const i = TABS.findIndex((t) => t.id === S.tab);
    const j = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i - 1 + TABS.length) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    S.tab = TABS[j].id;
    render();
    tabsEl.querySelector(`[data-tab="${S.tab}"]`)?.focus();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); sendOffer(false); });
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); });
  // Aperçu : survol et focus clavier d'une carte des listes (sans changer la sélection)
  const previewFromEvent = (e) => {
    const p = e.target.closest?.('button[data-side][data-id]');
    if (p) setPeek(p.dataset.id);
  };
  form.addEventListener('mouseover', previewFromEvent);
  form.addEventListener('focusin', previewFromEvent);
  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.ffield === 'q') { E.filt[t.dataset.fside].q = t.value; E.filt[t.dataset.fside].lim = 0; return renderSide(t.dataset.fside); }
    if (t.id === 'trd-gp') E.giveP = toInt(t.value);
    else if (t.id === 'trd-wp') E.wantP = toInt(t.value);
    else if (t.id === 'trd-msg') E.message = t.value;
    else return;
    showErr('');
    updateSummary();
  });
  form.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.ffield !== 'set' && t.dataset.ffield !== 'rar') return;
    E.filt[t.dataset.fside][t.dataset.ffield] = t.value;
    E.filt[t.dataset.fside].lim = 0;
    renderSide(t.dataset.fside);
  });

  /* ---------- Démarrage ---------- */
  /**
   * Charge les données puis dessine le panneau. En cas d'erreur, affiche un bouton « Réessayer ».
   * @returns {Promise<void>}
   */
  async function start() {
    panel.innerHTML = '<p class="empty">Chargement des échanges…</p>';
    try {
      if (!S.me) S.me = ctx.me?.id ? ctx.me : { id: (await getUser())?.id };
      if (!S.me?.id) throw new Error('Connexion requise.');
      await load();
      render();
      refreshSuggest();
    } catch (e) {
      panel.innerHTML = `<div class="empty">Impossible de charger les échanges : ${esc(errMsg(e))}
        <div class="btn-row trd-retry"><button class="btn btn-ghost" type="button" data-act="retry">Réessayer</button></div></div>`;
    }
  }
  ctx.expose?.({ offer: (opts) => openEditor(opts), onglet: (id) => { S.tab = id; render(); } });
  await start();
}
