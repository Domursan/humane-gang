// =====================================================================
// Sélecteurs visuels de l'admin : une carte (cardPicker) ou un booster (boosterPicker) se choisit sur ses visuels,
// avec recherche, filtres (série, rareté) et « Voir plus ». Utilisé par les fenêtres Give et Drop (admin/quick.js),
// le panier du give (admin/give-panier.js) et les drops (admin-cards/drops.js).
// Mode ajout (option ajout) : un clic ajoute au panier au lieu de choisir ; la quantité s'affiche sur le visuel.
// Carte : cardHtml (cartes-ui.js), taille sm. Booster : même cartouche que la Boutique (cart-box, booster-styles.js,
// booster-themes.js). Les types et les exemplaires restants se lisent avec chargerBoosters et chargerRestants.
// Clavier : Tab entre les visuels (un seul arrêt par grille), flèches pour se déplacer, Début et Fin aux extrémités.
// Restants : une carte à exemplaires limités (max_copies) compte les numéros déjà pris (serial, recyclés compris) ;
// une carte unique est attribuée tant qu'un exemplaire vit (même règle que la page des drops).
// Exporte : ensureVisualCss, chargerBoosters, chargerRestants, cardPicker, boosterPicker, cardVisualHtml,
// boosterVisualHtml, visuelHtml.
// Dépendances : core.js (sb, esc, currentLogo), cartes-ui.js (RARITIES, rarityLabel, cardHtml), booster-styles.js,
// booster-themes.js (themeDecor), admin-cards/helpers.js (fetchAll, nf).
// =====================================================================
import { sb, esc, currentLogo } from '../../commun/core.js';
import { RARITIES, FAMILIES, rarityLabel, cardHtml } from '../cartes/cartes-ui.js';
import { boosterStyleClass } from '../cartes/booster-styles.js';
import { themeDecor } from '../cartes/booster-themes.js';
import { fetchAll, nf } from './cartes/helpers.js';

/** Nombre de cartes affichées à chaque « Voir plus ». */
const PAGE = 60;
/** Feuilles de style du module et des cartouches de booster (chargées une fois). */
/** Feuilles et dossier de chacune (relatif à ce module : les CSS sont à côté des JS de leur espace). */
const FEUILLES = { 'admin-visual-pick.css': './', 'cartes-boosters.css': '../cartes/', 'boosters-styles.css': '../cartes/' };

/** Texte normalisé pour la recherche : minuscules, sans accents. */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Charge les feuilles de style du module et des cartouches (une seule fois). */
export function ensureVisualCss() {
  for (const f of Object.keys(FEUILLES)) {
    if (document.querySelector(`link[data-vp-css="${f}"]`)) continue;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = new URL(`${FEUILLES[f]}${f}`, import.meta.url).href;
    l.dataset.vpCss = f;
    document.head.append(l);
  }
}

/* ---------- Données ---------- */

/**
 * Types de boosters (hg_booster_types), actifs et passés, triés par ordre d'affichage. Lève une erreur si la lecture échoue.
 * @returns {Promise<object[]>} lignes { id, name, size, style, price, description, active, sort }
 */
export async function chargerBoosters() {
  const { data, error } = await sb.from('hg_booster_types').select('id, name, size, style, price, description, active, sort').order('sort');
  if (error) throw error;
  return (data || []).slice().sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));
}

/**
 * Exemplaires restants des cartes à tirage limité, et des cartes uniques (nombre choisi par l'admin, 1 par défaut).
 * @param {object[]} cards cartes (id, rarity, max_copies)
 * @returns {Promise<{restants: Map<string, number>}>} restants : identifiant -> nombre restant (absent = illimitée)
 */
export async function chargerRestants(cards) {
  const uniques = cards.filter((k) => k.rarity === 'unique').map((k) => k.id);
  const [numerotes, vivantes] = await Promise.all([
    fetchAll(() => sb.from('hg_card_copies').select('card_id, serial').not('serial', 'is', null)),
    uniques.length ? fetchAll(() => sb.from('hg_card_copies').select('card_id').in('card_id', uniques).is('recycled_at', null)) : [],
  ]);
  const plusGrand = new Map();
  for (const c of numerotes) plusGrand.set(c.card_id, Math.max(plusGrand.get(c.card_id) || 0, Number(c.serial) || 0));
  const vivantesParCarte = new Map();
  for (const x of vivantes) vivantesParCarte.set(x.card_id, (vivantesParCarte.get(x.card_id) || 0) + 1);
  const restants = new Map();
  for (const k of cards) {
    // Unique : hors boosters, mais plusieurs exemplaires numérotés possibles. Restants = max − plus grand numéro donné.
    if (k.rarity === 'unique') restants.set(k.id, Math.max(0, (Number(k.max_copies) || 1) - Math.max(plusGrand.get(k.id) || 0, vivantesParCarte.get(k.id) || 0)));
    else if (k.max_copies) restants.set(k.id, Math.max(0, Number(k.max_copies) - (plusGrand.get(k.id) || 0)));
  }
  return { restants };
}

/**
 * Libellé d'une carte épuisée : « Déjà attribuée » pour une unique à un exemplaire, « Tous les exemplaires sont attribués »
 * pour une unique à plusieurs exemplaires, « Épuisée » pour une carte à tirage limité.
 * @param {object} k carte (rarity, max_copies)
 * @returns {string}
 */
export function libelleEpuisee(k) {
  if (k?.rarity !== 'unique') return 'Épuisée';
  return Number(k.max_copies) > 1 ? 'Tous les exemplaires sont attribués' : 'Déjà attribuée';
}

/* ---------- Rendus ---------- */

/** Cartouche d'un booster (même markup que la Boutique), à l'échelle donnée par la classe .vp-cart. */
function cartHtml(t) {
  const style = boosterStyleClass(t.style);
  const deco = themeDecor(style);
  return `<span class="vp-cart" aria-hidden="true"><span class="cart-box ${esc(style)}">`
    + `<span class="cart-body">${deco ? deco.body : ''}</span><span class="cart-notch"></span>`
    + `<span class="cart-label"><span class="cart-label-fl"></span><span class="cart-scr">${deco ? deco.scr : `<img src="${esc(currentLogo())}" alt="">`}</span></span>`
    + '<span class="cart-lbl1">LE GANG</span>'
    + `<span class="cart-lbl2">${esc(String(t.name || '').toUpperCase())}</span>`
    + '<span class="cart-stripe"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="cart-ridge"></span>'
    + `<span class="cart-foot">${esc(nf(Number(t.size) || 5))} CARTES</span>${deco ? deco.over : ''}</span></span>`;
}

/** Aperçu d'une carte (taille sm), pour un récapitulatif. */
export const cardVisualHtml = (k) => cardHtml(k, { size: 'sm' });
/** Aperçu d'un booster, pour un récapitulatif. */
export const boosterVisualHtml = (t) => cartHtml(t);
/** Aperçu selon la sorte de don : carte, booster, ou rien. */
export function visuelHtml(kind, obj) {
  if (!obj) return '';
  if (kind === 'carte') return cardVisualHtml(obj);
  if (kind === 'boosters') return boosterVisualHtml(obj);
  return '';
}

/* ---------- Clavier : déplacement dans une grille de visuels ---------- */

/** Une seule case de la grille est atteignable à Tab (celle qui est choisie, sinon la première). */
function roving(grille, sel) {
  const items = [...grille.querySelectorAll(sel)];
  const cible = items.find((b) => b.getAttribute('aria-pressed') === 'true' && !b.disabled) || items.find((b) => !b.disabled);
  items.forEach((b) => { b.tabIndex = b === cible ? 0 : -1; });
}

/** Flèches, Début et Fin dans une grille : on saute de case en case ; les cases désactivées sont sautées. */
function navGrille(e, sel) {
  const t = e.target.closest(sel);
  if (!t) return;
  const grille = t.closest('.vp-grid');
  const items = [...grille.querySelectorAll(sel)].filter((b) => !b.disabled);
  const i = items.indexOf(t);
  if (i < 0) return;
  // Nombre de colonnes : position de la première case située sur une autre ligne.
  const haut = items.findIndex((b) => b.offsetTop !== items[0].offsetTop);
  const cols = haut < 0 ? items.length : haut;
  const pas = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -i, End: items.length - 1 - i }[e.key];
  if (pas === undefined) return;
  e.preventDefault();
  const cible = items[Math.min(items.length - 1, Math.max(0, i + pas))];
  grille.querySelectorAll(sel).forEach((b) => { b.tabIndex = b === cible ? 0 : -1; });
  cible.focus();
}

/* ---------- Sélecteur de carte ---------- */

/**
 * Sélecteur visuel d'une carte : grille de cartes, recherche, série, rareté, « Voir plus », brillante si la carte le permet.
 * @param {HTMLElement} host conteneur (vidé et rempli)
 * @param {object} o
 *   cards : cartes proposées (déjà filtrées : actives) ; sets : séries (id, name, sort) ;
 *   restants : Map identifiant -> restants (chargerRestants) ; bloque : (carte) => motif (chaîne) qui interdit le choix, ou '' ;
 *   idp : préfixe des identifiants HTML (unique par fenêtre) ; value : carte choisie au départ ; onChange : appelée au choix ou à la brillance ;
 *   types : ajoute le filtre « Type » ; ajout : (carte) => void, active le mode ajout ; quantite : (carte) => nombre au panier ; onFiltre : appelée quand les filtres changent.
 * @returns {{value: () => {card: string, name: string, obj: object|null, shiny: boolean}, set: (id: string) => void, focus: () => void, rafraichir: () => void, filtres: () => {set: string, rar: string, fam: string}, lotHost: HTMLElement|null}}
 */
export function cardPicker(host, { cards = [], sets = [], restants = new Map(), bloque = () => '', idp = 'vp', value = '', onChange = () => {}, types = false, ajout = null, quantite = () => 0, onFiltre = () => {} } = {}) {
  ensureVisualCss();
  const ordreSerie = new Map(sets.map((s) => [s.id, Number(s.sort) || 0]));
  const liste = cards.slice().sort((a, b) => ((ordreSerie.get(a.set_id) ?? 1e9) - (ordreSerie.get(b.set_id) ?? 1e9))
    || ((Number(a.number) || 0) - (Number(b.number) || 0)) || String(a.name).localeCompare(b.name, 'fr'));
  const byId = new Map(cards.map((k) => [k.id, k]));
  const S = { q: '', set: '', rar: '', fam: '', n: PAGE, sel: byId.has(value) && !bloque(byId.get(value)) ? value : '' };
  const seriesAvec = sets.filter((s) => cards.some((k) => k.set_id === s.id)).sort((a, b) => (Number(a.sort) || 0) - (Number(b.sort) || 0));

  const famillesAvec = FAMILIES.filter((f) => cards.some((k) => k.family === f.id));
  host.innerHTML = `<div class="vp vp-cards">
    <div class="vp-filtres${types ? ' vp-filtres-4' : ''}">
      <div class="field"><label for="${idp}-q">Rechercher une carte</label>
        <input id="${idp}-q" type="search" autocomplete="off" placeholder="Nom de la carte"></div>
      <div class="field"><label for="${idp}-set">Série</label>
        <select id="${idp}-set"><option value="">Toutes les séries</option>${seriesAvec.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="${idp}-rar">Rareté</label>
        <select id="${idp}-rar"><option value="">Toutes les raretés</option>${RARITIES.map((r) => `<option value="${esc(r.id)}">${esc(r.label)}</option>`).join('')}</select></div>
      ${types ? `<div class="field"><label for="${idp}-fam">Type</label>
        <select id="${idp}-fam"><option value="">Tous les types</option>${famillesAvec.map((f) => `<option value="${esc(f.id)}">${esc(f.label)}</option>`).join('')}</select></div>` : ''}
    </div>
    <p class="vp-compte small muted" id="${idp}-n" aria-live="polite"></p>
    ${ajout ? `<div id="${idp}-lot"></div>` : ''}
    <div class="vp-grid vp-grid-cartes" role="group" aria-label="Cartes" id="${idp}-grid"></div>
    <button class="btn btn-ghost btn-sm vp-plus" type="button" id="${idp}-plus" hidden></button>
    <div class="vp-choix"${ajout ? ' hidden' : ''}>
      <p class="vp-sum" id="${idp}-sum" aria-live="polite"></p>
      <label class="vp-shiny" id="${idp}-shinyl" hidden><input type="checkbox" name="shiny" id="${idp}-shiny"> <span>Brillante</span></label>
    </div>
  </div>`;
  const grille = host.querySelector(`#${idp}-grid`);
  const shinyOn = () => !!host.querySelector(`#${idp}-shiny`)?.checked;

  /** Liste filtrée (recherche, série, rareté), dans l'ordre d'affichage. */
  const visibles = () => {
    const needle = norm(S.q.trim());
    return liste.filter((k) => (!S.set || k.set_id === S.set) && (!S.rar || k.rarity === S.rar) && (!S.fam || k.family === S.fam) && (!needle || norm(k.name).includes(needle)));
  };
  /** Légende d'une carte : motif de blocage, ou nombre restant si la carte est à tirage limité. */
  const legende = (k) => {
    const motif = bloque(k);
    if (motif) return { txt: motif, off: true };
    const r = restants.get(k.id);
    if (r == null) return { txt: '', off: false };
    return { txt: r <= 0 ? 'Épuisée' : `${nf(r)} restant${r > 1 ? 's' : ''}`, off: false };
  };
  /** Une carte de la grille : visuel (bouton), légende dessous. */
  const tuile = (k) => {
    const n = ajout ? quantite(k) : 0;
    const sel = ajout ? n > 0 : S.sel === k.id;
    const l = legende(k);
    return `<div class="vp-tile${sel ? ' is-sel' : ''}${l.off ? ' is-off' : ''}">${n ? `<span class="vp-n" aria-hidden="true">×${esc(nf(n))}</span>` : ''}${cardHtml(k, {
      size: 'sm', button: true, shiny: !ajout && sel && shinyOn(),
      attrs: `data-vp-card="${esc(k.id)}" aria-pressed="${sel}"${l.off ? ' disabled' : ''}`,
    })}<span class="vp-cap${l.off ? ' is-warn' : ''}">${esc(l.txt)}</span></div>`;
  };
  /** Choix affiché sous la grille, et case « brillante » visible seulement si la carte peut l'être. */
  const majChoix = () => {
    const k = byId.get(S.sel) || null;
    const box = host.querySelector(`#${idp}-shiny`);
    const boite = host.querySelector(`#${idp}-shinyl`);
    const peut = !!(k && k.can_shiny);
    boite.hidden = !peut;
    if (!peut) box.checked = false;
    const r = k && restants.has(k.id) ? legende(k).txt : '';
    host.querySelector(`#${idp}-sum`).innerHTML = k
      ? `Carte choisie : <strong>${esc(k.name)}</strong> · ${esc(rarityLabel(k.rarity))}${r ? ` · ${esc(r)}` : ''}`
      : 'Aucune carte choisie.';
  };
  /** Redessine la grille (page courante), le compteur, « Voir plus » et le choix. */
  const rendreGrille = () => {
    const tout = visibles();
    const page = tout.slice(0, S.n);
    host.querySelector(`#${idp}-n`).textContent = tout.length
      ? `${nf(tout.length)} carte${tout.length > 1 ? 's' : ''}${tout.length > page.length ? `, ${nf(page.length)} affichées` : ''}`
      : 'Aucune carte ne correspond.';
    grille.innerHTML = page.map(tuile).join('');
    const plus = host.querySelector(`#${idp}-plus`);
    plus.hidden = tout.length <= page.length;
    plus.textContent = `Voir plus de cartes (${nf(tout.length - page.length)} de plus)`;
    roving(grille, 'button[data-vp-card]');
    majChoix();
    onFiltre();
  };

  host.addEventListener('input', (e) => {
    if (e.target.id === `${idp}-q`) { S.q = e.target.value; S.n = PAGE; rendreGrille(); }
  });
  host.addEventListener('change', (e) => {
    if (e.target.id === `${idp}-set`) { S.set = e.target.value; S.n = PAGE; rendreGrille(); }
    else if (e.target.id === `${idp}-rar`) { S.rar = e.target.value; S.n = PAGE; rendreGrille(); }
    else if (e.target.id === `${idp}-fam`) { S.fam = e.target.value; S.n = PAGE; rendreGrille(); }
    else if (e.target.id === `${idp}-shiny`) onChange();
  });
  grille.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-vp-card]');
    if (!b || b.disabled) return;
    if (ajout) {
      const id = b.dataset.vpCard, haut = grille.scrollTop;
      ajout(byId.get(id));
      grille.scrollTop = haut;
      grille.querySelector(`[data-vp-card="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    S.sel = b.dataset.vpCard;
    rendreGrille();
    grille.querySelector(`[data-vp-card="${CSS.escape(S.sel)}"]`)?.focus({ preventScroll: true });
    onChange();
  });
  grille.addEventListener('keydown', (e) => navGrille(e, 'button[data-vp-card]'));
  host.querySelector(`#${idp}-plus`).addEventListener('click', () => {
    const premier = S.n;
    S.n += PAGE;
    rendreGrille();
    grille.children[premier]?.querySelector('button')?.focus({ preventScroll: true });
  });

  rendreGrille();
  return {
    value() {
      const k = byId.get(S.sel) || null;
      return { card: k ? k.id : '', name: k ? k.name : '', obj: k, shiny: !!(k && k.can_shiny && shinyOn()) };
    },
    set(id) { if (byId.has(id) && !bloque(byId.get(id))) { S.sel = id; rendreGrille(); } },
    focus() { host.querySelector(`#${idp}-q`)?.focus(); },
    rafraichir: () => { const haut = grille.scrollTop; rendreGrille(); grille.scrollTop = haut; },
    filtres: () => ({ set: S.set, rar: S.rar, fam: S.fam }),
    lotHost: host.querySelector(`#${idp}-lot`),
  };
}

/* ---------- Sélecteur de booster ---------- */

/**
 * Sélecteur visuel d'un booster : cartouche, nom, nombre de cartes ; la description s'affiche au survol ou au focus.
 * Les types passés (inactifs) sont dans un groupe à part : « Boosters d’événements passés ».
 * @param {HTMLElement} host conteneur (vidé et rempli)
 * @param {object} o
 *   types : lignes de hg_booster_types ; idp : préfixe des identifiants ; value : identifiant choisi au départ
 *   (repli : premier type actif) ; onChange : appelée au choix ; ajout : (type) => void, active le mode ajout ; quantite : (type) => nombre au panier.
 * @returns {{value: () => {id: string, name: string, obj: object|null}, set: (id: string) => void, focus: () => void, rafraichir: () => void}}
 */
export function boosterPicker(host, { types = [], idp = 'vpb', value = 'classique', onChange = () => {}, ajout = null, quantite = () => 0 } = {}) {
  ensureVisualCss();
  const actifs = types.filter((t) => t.active !== false);
  const passes = types.filter((t) => t.active === false);
  const byId = new Map(types.map((t) => [t.id, t]));
  const S = { sel: byId.has(value) ? value : (actifs[0]?.id ?? '') };

  /** Une cartouche cliquable : visuel, nom, nombre de cartes, description au survol ou au focus. */
  const tuile = (t) => {
    const n = ajout ? quantite(t) : 0;
    const sel = ajout ? n > 0 : S.sel === t.id;
    const desc = t.description ? `<span class="vp-desc" id="${idp}-d-${esc(t.id)}">${esc(t.description)}</span>` : '';
    return `<button type="button" class="vp-type${sel ? ' is-sel' : ''}" data-vp-type="${esc(t.id)}" aria-pressed="${sel}"${t.description ? ` aria-describedby="${idp}-d-${esc(t.id)}"` : ''}>`
      + `${n ? `<span class="vp-n" aria-hidden="true">×${esc(nf(n))}</span>` : ''}${cartHtml(t)}<span class="vp-type-n">${esc(t.name)}</span><span class="vp-type-s">${esc(nf(Number(t.size) || 5))} cartes</span>${desc}</button>`;
  };
  host.innerHTML = `<div class="vp vp-boost" id="${idp}">
    ${actifs.length ? `<div class="vp-grid vp-grid-boost" role="group" aria-label="Boosters" id="${idp}-grid">${actifs.map(tuile).join('')}</div>` : '<p class="small muted">Aucun booster actif.</p>'}
    ${passes.length ? `<p class="vp-sub" id="${idp}-passes">Boosters d’événements passés</p>`
      + `<div class="vp-grid vp-grid-boost vp-grid-past" role="group" aria-labelledby="${idp}-passes" id="${idp}-grid-passes">${passes.map(tuile).join('')}</div>` : ''}
    <p class="vp-sum" id="${idp}-sum" aria-live="polite"${ajout ? ' hidden' : ''}></p>
  </div>`;

  /** Choix affiché sous les grilles : nom, nombre de cartes, description (lisible sans survol). */
  const majSomme = () => {
    const t = byId.get(S.sel) || null;
    host.querySelector(`#${idp}-sum`).innerHTML = t
      ? `Booster choisi : <strong>${esc(t.name)}</strong> · ${esc(nf(Number(t.size) || 5))} cartes${t.description ? ` — ${esc(t.description)}` : ''}`
      : 'Aucun booster choisi.';
  };
  host.querySelectorAll('.vp-grid').forEach((g) => roving(g, 'button[data-vp-type]'));
  majSomme();

  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-vp-type]');
    if (!b) return;
    if (ajout) {
      const id = b.dataset.vpType;
      ajout(byId.get(id));
      host.querySelector(`[data-vp-type="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
      return;
    }
    S.sel = b.dataset.vpType;
    host.querySelectorAll('button[data-vp-type]').forEach((x) => {
      const on = x.dataset.vpType === S.sel;
      x.setAttribute('aria-pressed', String(on));
      x.classList.toggle('is-sel', on);
    });
    b.focus({ preventScroll: true });
    majSomme();
    onChange();
  });
  host.addEventListener('keydown', (e) => navGrille(e, 'button[data-vp-type]'));

  return {
    value() { const t = byId.get(S.sel) || null; return { id: t ? t.id : '', name: t ? t.name : '', obj: t }; },
    set(id) {
      if (!byId.has(id)) return;
      S.sel = id;
      host.querySelectorAll('button[data-vp-type]').forEach((x) => {
        const on = x.dataset.vpType === S.sel;
        x.setAttribute('aria-pressed', String(on));
        x.classList.toggle('is-sel', on);
      });
      majSomme();
    },
    focus() { host.querySelector('button[data-vp-type]')?.focus(); },
    rafraichir() {
      if (!ajout) return;
      const actuelle = host.querySelector(`#${idp}-grid`);
      if (actuelle) actuelle.innerHTML = actifs.map(tuile).join('');
      const passe = host.querySelector(`#${idp}-grid-passes`);
      if (passe) passe.innerHTML = passes.map(tuile).join('');
      host.querySelectorAll('.vp-grid').forEach((g) => roving(g, 'button[data-vp-type]'));
    },
  };
}
