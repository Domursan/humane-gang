// Admin : le plateau (accueil du panel) et la page de chaque lieu (admin/perms.js, LIEUX).
// - Page de lieu (#<lieu>) : bandeau à la couleur du lieu, zone « À faire maintenant » remplie par le registre
//   registerTodo, puis toutes les pages du lieu en tuiles groupées (icône, libellé, ligne d'aide, compteur).
// - Plateau (#plateau) : registerPlateau(mountFn) pose le contenu de l'accueil ; sans fournisseur, les lieux permis
//   disposés sur une grille de 12 colonnes (renderPlateau, async : charge la disposition une seule fois par session).
//
// Registre « À faire » :
//   registerTodo(lieuId, async () => [{ title, meta?, actions: [{ label, href? , onClick? }] }])
//   Appelé à chaque visite de la page du lieu. Vide : « Rien à faire ici pour l'instant. » Plusieurs fournisseurs par lieu : possibles.
//   Les fournisseurs d'un lieu tournent en parallèle ; un fournisseur qui échoue ne fait que perdre ses éléments.
// Pastille « à traiter » d'un lieu = nombre d'éléments « À faire » de ce lieu (todoCount). Calculé à l'ouverture du
// plateau (loadTodoCounts) et à chaque visite de la page du lieu (renderLieu) ; les deux préviennent par
// l'événement « hg:todo-changed » (shell.js repeint les pastilles).
// Plateau :
//   registerPlateau((root, { lieux, countOf, totalOf }) => …)   root = #plateau-root (vidé avant l'appel).
// Disposition (migration 111) : hg_admin_plateau_get() → { v, cells } ou null ; hg_admin_plateau_set(p) avec
//   p = { cells: { <lieu>: { x, y, w, h } } }, null pour la disposition par défaut. Case : x 0..11, w 2..12, x + w <= 12,
//   y 0..40, h 1..6 ; une case avec un bouton fait deux lignes au moins (la Mairie peut n'en faire qu'une).
//   Mode « Modifier la disposition » (≥ 900 px) : glisser une case, poignée pour la redimensionner, flèches au clavier.
//
// Exporte : registerTodo, registerPlateau, plateauMount, renderPlateau, renderLieu, todoCount, loadTodoCounts.
// Dépend de core.js (esc, sb, toast), admin/perms.js (LIEUX, canSub), admin/panel-icons.js (panelIcon). Ne dépend pas de shell.js.

import { esc, sb, toast } from '../../commun/core.js';
import { panelIcon } from './panel-icons.js';
import { LIEUX, canSub } from './perms.js';

// Fournisseurs « À faire » : lieuId -> [fonction]. Un fournisseur qui échoue ne bloque pas les autres.
const TODO = new Map();
/**
 * Enregistre un fournisseur « À faire » pour un lieu (voir l'API en tête de fichier).
 * @param {string} lieuId Identifiant du lieu (ex. « poste »).
 * @param {() => Promise<Array<{title: string, meta?: string, actions: Array<{label: string, href?: string, onClick?: () => void}>}>>} fn
 */
export function registerTodo(lieuId, fn) {
  const list = TODO.get(lieuId) || [];
  list.push(fn);
  TODO.set(lieuId, list);
}

/** Éléments « À faire » d'un lieu : ceux de tous ses fournisseurs (en parallèle), dans l'ordre d'enregistrement. */
async function todoItems(lieuId) {
  const parts = await Promise.all((TODO.get(lieuId) || []).map((fn) => Promise.resolve()
    .then(fn)
    .then((r) => r || [])
    .catch((e) => { console.warn('[lieu]', lieuId, e); return []; })));
  return parts.flat();
}

// Nombre d'éléments « À faire » par lieu (lieuId -> n), pour la pastille du plateau et le total de la page du lieu.
const TODO_N = new Map();
// Premier élément « À faire » de chaque lieu (ligne d'info en direct sur le plateau).
const TODO_FIRST = new Map();
/** Nombre d'éléments « À faire » d'un lieu (0 tant qu'il n'a pas été compté). */
export const todoCount = (lieuId) => TODO_N.get(lieuId) || 0;
const repaint = () => document.dispatchEvent(new CustomEvent('hg:todo-changed'));

/**
 * Recompte les éléments « À faire » de tous les lieux (en parallèle) puis prévient le panel (pastilles).
 * Appelé au chargement des compteurs (counts.js) ; une page de lieu se recompte à sa propre visite.
 */
export async function loadTodoCounts() {
  await Promise.all(LIEUX.map(async (l) => { const it = await todoItems(l.id); TODO_N.set(l.id, it.length); TODO_FIRST.set(l.id, it[0] || null); }));
  paintInfo();
  repaint();
}

// Fournisseur du plateau (registerPlateau). null : les 7 lieux en cartes (renderPlateau).
let plateauFn = null;
/** Pose le fournisseur du plateau : appelé avec (root, { lieux, countOf, totalOf }) à chaque visite. */
export function registerPlateau(mountFn) { plateauFn = mountFn; }
/** Fournisseur du plateau enregistré, ou null. */
export const plateauMount = () => plateauFn;

// Actions rapides du plateau : bouton, lieu qui le porte, sous-section (droit et adresse de repli).
// Un clic émet « hg:quick » (détail : { action }) ; sans écouteur qui l'annule (preventDefault), on ouvre la page.
const QUICK = [
  { action: 'give', label: 'Give', aria: 'Give, ouvrir la fenêtre de don', lieu: 'fabrique', sub: 'gestion', solid: true },
  { action: 'drop', label: 'Lancer un drop', aria: 'Lancer un drop', lieu: 'fabrique', sub: 'drops', solid: false },
  { action: 'enchere', label: 'Nouvelle enchère', aria: 'Nouvelle enchère', lieu: 'ventes', sub: 'encheres', solid: true },
];
// Bouton principal de chaque lieu (lien vers la page qui sert le plus), affiché si la page est permise.
const MAIN = {
  place: { label: 'Inviter quelqu’un', sub: 'invitations' },
  poste: { label: 'Répondre', sub: 'assistance' },
  camp: { label: 'Nouvelle sortie', sub: 'sorties' },
  fete: { label: 'Nouvel événement', sub: 'evenements' },
};
// Ordre du chemin qui relie les lieux sur le plateau (tracé entre les centres des cases).
const ROAD = ['place', 'poste', 'ventes', 'fete', 'fabrique', 'camp', 'mairie'];

/** Sous-section de LIEUX par identifiant (pour canSub). */
const subOf = (id) => LIEUX.flatMap((l) => l.subs).find((s) => s.id === id);

/* ----- Disposition du plateau : grille de 12 colonnes (admin-lieux.css : grid-auto-rows et gap identiques) ----- */
const COLS = 12, MAX_Y = 40, MAX_H = 6, MIN_W = 2;
const ROW_H = 150, GAP = 20;
/** Disposition par défaut : trois cases par ligne (largeur 4, hauteur 2), la Mairie sur toute la largeur en bas. */
const DEFAULT_LAYOUT = {
  place: { x: 0, y: 0, w: 4, h: 2 }, poste: { x: 4, y: 0, w: 4, h: 2 }, ventes: { x: 8, y: 0, w: 4, h: 2 },
  camp: { x: 0, y: 2, w: 4, h: 2 }, fabrique: { x: 4, y: 2, w: 4, h: 2 }, fete: { x: 8, y: 2, w: 4, h: 2 },
  mairie: { x: 0, y: 4, w: COLS, h: 1 },
};
/**
 * Disposition par défaut quand certains lieux sont absents (droits du compte) : les cases restantes se resserrent,
 * 4 en 2 + 2, 5 en 3 + 2, 6 en 3 + 3 (largeur 12 / nombre par ligne), la Mairie en bande pleine en dessous.
 * Les lieux absents sont rangés plus bas (resolveLayout) : ils ne sont pas affichés, mais la disposition reste complète.
 * @param {string[]} ids Lieux affichés
 */
function compactLayout(ids) {
  if (ids.length >= LIEUX.length) return copyLayout(DEFAULT_LAYOUT);
  const hors = Object.keys(DEFAULT_LAYOUT).filter((id) => id !== 'mairie' && ids.includes(id));
  const rangs = { 1: [1], 2: [2], 3: [3], 4: [2, 2], 5: [3, 2], 6: [3, 3] }[hors.length] || [];
  const cells = {};
  let i = 0, y = 0;
  for (const k of rangs) {
    for (let j = 0; j < k; j++) cells[hors[i++]] = { x: j * (COLS / k), y, w: COLS / k, h: 2 };
    y += 2;
  }
  if (ids.includes('mairie')) cells.mairie = { x: 0, y, w: COLS, h: 1 };
  return resolveLayout(cells);
}
/** Hauteur minimale : une case avec un bouton tient sur deux lignes ; la Mairie (sans bouton) peut n'en faire qu'une. */
const minH = (id) => (id === 'mairie' ? 1 : 2);
const LEAD_TEXT = 'Pastille = ce qui attend une action. Cliquer le nom d’un lieu pour l’ouvrir en entier.';
const EDIT_HINT = 'Glisser une case pour la déplacer, ou sa poignée (en bas à droite) pour la redimensionner. '
  + 'Au clavier : flèches pour déplacer, Maj + flèches pour redimensionner. Rouge : la place est prise ou sort du plateau.';
const KEY_DIR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const inFrame = (c) => c.x >= 0 && c.x + c.w <= COLS && c.w >= MIN_W && c.y >= 0 && c.y <= MAX_Y && c.h >= 1 && c.h <= MAX_H;
const clash = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const copyLayout = (L) => Object.fromEntries(Object.entries(L).map(([k, c]) => [k, { x: c.x, y: c.y, w: c.w, h: c.h }]));
const labelOf = (id) => LIEUX.find((l) => l.id === id)?.label || id;
const describe = (id, c) => `${labelOf(id)} : colonne ${c.x + 1}, ligne ${c.y + 1}, largeur ${c.w}, hauteur ${c.h}`;

/**
 * Disposition complète (tous les lieux) à partir d'une disposition enregistrée, éventuellement incomplète.
 * Une case absente, invalide, trop petite ou qui chevauche une case déjà placée passe sous les autres.
 * @param {string[]} [devant] Lieux placés en premier : en cas de chevauchement, ce sont les autres qui se déplacent.
 */
function resolveLayout(cells, devant = []) {
  const out = {}, placed = [], rest = [];
  for (const id of [...devant, ...LIEUX.map((l) => l.id).filter((x) => !devant.includes(x))]) {
    const r = cells?.[id];
    const c = r && [r.x, r.y, r.w, r.h].every(Number.isInteger) ? { x: r.x, y: r.y, w: r.w, h: r.h } : null;
    if (c && c.h >= minH(id) && inFrame(c) && !placed.some((p) => clash(p, c))) { out[id] = c; placed.push(c); }
    else rest.push(id);
  }
  let row = placed.reduce((m, c) => Math.max(m, c.y + c.h), 0), col = 0;
  for (const id of rest) {
    if (id === 'mairie') {
      if (col) { row += 2; col = 0; }
      out[id] = { x: 0, y: row, w: COLS, h: 1 };
      row += 1;
    } else {
      out[id] = { x: col * 4, y: row, w: 4, h: 2 };
      if (++col === 3) { col = 0; row += 2; }
    }
  }
  return out;
}
/** Disposition à afficher pour une valeur enregistrée (null : la disposition par défaut). */
const layoutOf = (p) => (p && p.cells ? resolveLayout(p.cells) : copyLayout(DEFAULT_LAYOUT));

// Disposition connue (serveur ou défaut), gardée en mémoire ; null tant qu'elle n'a pas été lue avec succès.
let LAYOUT = null;
let LOADING = null;   // lecture en cours (une seule à la fois)
let ROOT = null;      // #plateau-root courant
let EDIT = null;      // { draft } pendant le mode disposition, sinon null
let DRAG = null;      // glissement ou redimensionnement en cours (souris, tactile, stylet)
const WIDE = matchMedia('(min-width: 900px)');
let SAVED = false;     // la disposition vient d'un enregistrement (« Modifier la disposition »), pas de la disposition par défaut
let SHOWN_IDS = LIEUX.map((l) => l.id); // lieux affichés sur le plateau (droits du compte)
const shown = () => (SAVED && LAYOUT) || compactLayout(SHOWN_IDS);

/** Lit la disposition une fois (puis la garde). En cas d'erreur : disposition par défaut, et LAYOUT reste null (voir enterEdit). */
function loadLayout() {
  if (LAYOUT) return Promise.resolve(LAYOUT);
  LOADING ||= sb.rpc('hg_admin_plateau_get')
    .then(({ data, error }) => {
      if (error) throw error;
      LAYOUT = layoutOf(data);
      SAVED = !!(data && data.cells);
      return LAYOUT;
    })
    .catch((e) => { console.warn('[plateau] disposition non chargée :', e?.message || e); return copyLayout(DEFAULT_LAYOUT); })
    .finally(() => { LOADING = null; });
  return LOADING;
}

/** Style de placement d'une case (grid-column / grid-row, lignes à partir de 1). */
const cellPos = (c) => `grid-column: ${c.x + 1} / span ${c.w}; grid-row: ${c.y + 1} / span ${c.h};`;

/** Une case du plateau : nom du lieu (lien), pastille du nombre à traiter, actions rapides du lieu, poignée (mode disposition). */
function cellHtml(l, c) {
  const quick = QUICK.filter((q) => q.lieu === l.id && canSub(subOf(q.sub)));
  const main = MAIN[l.id] && canSub(subOf(MAIN[l.id].sub)) ? MAIN[l.id] : null;
  return `<div class="plateau-cell" data-lieu="${esc(l.id)}" style="--lieu: ${esc(l.color)}; ${cellPos(c)}">
      <a class="plateau-lieu" href="#${esc(l.id)}">
        <span class="plateau-head">
          <span class="plateau-ico" aria-hidden="true">${panelIcon(l.icon)}</span>
          <span class="plateau-pastille" data-lieu-badge="${esc(l.id)}" aria-hidden="true" hidden></span>
        </span>
        <span class="plateau-name">${esc(l.label)}</span>
        <span class="plateau-tag">${esc(l.tagline)}</span>
        <span class="visually-hidden" data-lieu-count="${esc(l.id)}" hidden></span>
      </a>
      <p class="plateau-info small" data-lieu-info="${esc(l.id)}" hidden></p>
      ${quick.length || main ? `<div class="plateau-quick" role="group" aria-label="Actions rapides : ${esc(l.label)}">${main ? `<a class="plateau-act" href="#${esc(l.id)}/${esc(main.sub)}">${esc(main.label)}</a>` : ''}${quick.map((q) => `<button type="button" class="plateau-act${q.solid ? '' : ' plateau-act--line'}" data-quick="${q.action}"${q.aria !== q.label ? ` aria-label="${esc(q.aria)}"` : ''}>${esc(q.label)}</button>`).join('')}</div>` : ''}
      <span class="plateau-handle" aria-hidden="true"></span>
    </div>`;
}

/**
 * Trace le chemin entre les centres des cases (SVG derrière les cases) ; redessiné quand le plateau change de taille
 * ou de disposition. Ne fait rien au téléphone (le CSS masque le chemin).
 */
function drawRoad(board) {
  const svg = board.querySelector('.plateau-road');
  if (!svg) return;
  const b = board.getBoundingClientRect();
  const pts = ROAD.map((id) => board.querySelector(`.plateau-cell[data-lieu="${id}"]`)).filter(Boolean).map((c) => {
    const r = c.getBoundingClientRect();
    return [r.left - b.left + r.width / 2, r.top - b.top + r.height / 2];
  });
  svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`);
  svg.innerHTML = pts.length > 1 ? `<path d="M${pts.map((p) => p.map((v) => v.toFixed(1)).join(' ')).join(' L')}"/>` : '';
}

/** Pose la place de chaque case selon la disposition L, puis redessine le chemin. */
function applyLayout(board, L) {
  for (const cell of board.querySelectorAll('.plateau-cell')) {
    const c = L[cell.dataset.lieu];
    if (!c) continue;
    cell.style.gridColumn = `${c.x + 1} / span ${c.w}`;
    cell.style.gridRow = `${c.y + 1} / span ${c.h}`;
  }
  drawRoad(board);
}

/**
 * Plateau (accueil par défaut) : les lieux permis disposés comme un plan (grille de 12 colonnes), reliés par un chemin,
 * et les actions rapides (Give, Lancer un drop, Nouvelle enchère) quand le droit de la section est accordé.
 * Sur téléphone, une colonne. Une disposition enregistrée est lue une fois puis gardée en mémoire.
 * @param {HTMLElement} root Conteneur du plateau (#plateau-root).
 * @param {Array<object>} lieux Lieux permis (visibleLieux).
 */
export async function renderPlateau(root, lieux) {
  EDIT = null;
  DRAG = null;
  ROOT = root;
  SHOWN_IDS = lieux.map((l) => l.id);
  await loadLayout();
  const layout = shown();
  root.innerHTML = `<div class="plateau-top">
      <p class="plateau-lead small muted">${esc(LEAD_TEXT)}</p>
      <div class="plateau-tools">
        <button type="button" class="btn btn-ghost btn-sm plateau-edit-btn" data-plateau-edit>Modifier la disposition</button>
        <div class="plateau-edit-bar" role="toolbar" aria-label="Disposition du plateau" hidden>
          <button type="button" class="btn btn-primary btn-sm" data-plateau-save>Enregistrer</button>
          <button type="button" class="btn btn-ghost btn-sm" data-plateau-cancel>Annuler</button>
          <button type="button" class="btn btn-ghost btn-sm" data-plateau-reset>Disposition par défaut</button>
          <span class="plateau-confirm" data-plateau-confirm role="group" aria-label="Confirmation" hidden>
            <span>Remettre la disposition par défaut ?</span>
            <button type="button" class="btn btn-danger btn-sm" data-plateau-reset-yes>Oui, remettre</button>
            <button type="button" class="btn btn-ghost btn-sm" data-plateau-reset-no>Non</button>
          </span>
        </div>
      </div>
    </div>
    <p class="visually-hidden" aria-live="polite" data-plateau-live></p>
    <div class="plateau-board" aria-label="Plateau des lieux du gang">
      <svg class="plateau-road" aria-hidden="true" focusable="false"></svg>
      ${lieux.map((l) => cellHtml(l, layout[l.id])).join('')}
    </div>`;
  const board = root.querySelector('.plateau-board');
  // Un seul gestionnaire par racine (il est remplacé à chaque visite, pas empilé)
  root.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    if (b.matches('[data-plateau-edit]')) enterEdit();
    else if (b.matches('[data-plateau-cancel]')) { leaveEdit(); focusEditButton(); }
    else if (b.matches('[data-plateau-save]')) saveEdit();
    else if (b.matches('[data-plateau-reset]')) { root.querySelector('[data-plateau-confirm]').hidden = false; root.querySelector('[data-plateau-reset-no]').focus(); }
    else if (b.matches('[data-plateau-reset-no]')) { root.querySelector('[data-plateau-confirm]').hidden = true; root.querySelector('[data-plateau-reset]').focus(); }
    else if (b.matches('[data-plateau-reset-yes]')) resetLayout();
  };
  board.addEventListener('click', (e) => {
    const b = e.target.closest('[data-quick]');
    if (!b) return;
    const q = QUICK.find((x) => x.action === b.dataset.quick);
    const ev = new CustomEvent('hg:quick', { detail: { action: q.action }, cancelable: true });
    document.dispatchEvent(ev);
    if (!ev.defaultPrevented) location.hash = `#${q.lieu}/${q.sub}`;
  });
  board.addEventListener('pointerdown', (e) => dragStart(board, e));
  board.addEventListener('pointermove', (e) => dragMove(board, e));
  board.addEventListener('pointerup', (e) => dragEnd(board, e));
  board.addEventListener('pointercancel', (e) => dragCancel(board, e));
  board.addEventListener('keydown', (e) => keyMove(board, e));
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(() => {
      if (!board.isConnected) { ro.disconnect(); return; }
      drawRoad(board);
    });
    ro.observe(board);
  }
  requestAnimationFrame(() => drawRoad(board));
  paintInfo();
}

// Sous 900 px, le mode disposition se ferme (sans enregistrer).
WIDE.addEventListener('change', () => { if (!WIDE.matches) leaveEdit(); });

/* ----- Mode disposition ----- */

/** Affiche ou masque les commandes du mode disposition (lead, bouton d'entrée, barre, cases). */
function setEditUi(on) {
  ROOT.querySelector('.plateau-lead').textContent = on ? EDIT_HINT : LEAD_TEXT;
  ROOT.querySelector('[data-plateau-edit]').hidden = on;
  ROOT.querySelector('.plateau-edit-bar').hidden = !on;
  ROOT.querySelector('[data-plateau-confirm]').hidden = true;
  ROOT.querySelector('.plateau-board').classList.toggle('plateau-board--edit', on);
}
/** Liens et boutons d'une case : inertes en mode disposition (ni clic, ni tabulation). La poignée reste active. */
function setInert(cell, on) {
  for (const el of cell.children) if (!el.classList.contains('plateau-handle')) el.inert = on;
}
/** Désactive ou réactive la barre (pendant un enregistrement). */
function setBusy(on) {
  ROOT?.querySelectorAll('.plateau-edit-bar button').forEach((b) => { b.disabled = on; });
}
const focusEditButton = () => ROOT?.querySelector('[data-plateau-edit]')?.focus();
/** Annonce pour lecteurs d'écran (région aria-live du plateau). */
const say = (msg) => { const el = ROOT?.querySelector('[data-plateau-live]'); if (el) el.textContent = msg; };

/**
 * Entre dans le mode disposition (≥ 900 px) avec une copie de travail de la disposition.
 * Refusé tant que la disposition enregistrée n'a pas été lue : l'enregistrement l'écraserait par la disposition par défaut.
 */
async function enterEdit() {
  if (!WIDE.matches || !ROOT || EDIT) return;
  const root = ROOT;
  if (!LAYOUT) await loadLayout();
  if (root !== ROOT || !root.isConnected || EDIT) return;
  if (!LAYOUT) { toast('Disposition enregistrée illisible pour le moment : réessaie dans un instant.', 'error'); return; }
  const board = root.querySelector('.plateau-board');
  EDIT = { draft: copyLayout(shown()) };
  setEditUi(true);
  board.querySelectorAll('.plateau-cell').forEach((cell) => {
    cell.tabIndex = 0;
    cell.setAttribute('role', 'group');
    cell.setAttribute('aria-label', labelOf(cell.dataset.lieu));
    setInert(cell, true);
  });
  applyLayout(board, EDIT.draft);
  say('Mode disposition. Flèches : déplacer la case sélectionnée. Maj + flèches : la redimensionner.');
  board.querySelector('.plateau-cell')?.focus({ preventScroll: true });
}

/** Quitte le mode disposition sans rien enregistrer : la disposition connue reprend. */
function leaveEdit() {
  if (!EDIT || !ROOT) return;
  EDIT = null;
  DRAG = null;
  const board = ROOT.querySelector('.plateau-board');
  board.querySelectorAll('.plateau-cell').forEach((cell) => {
    cell.removeAttribute('tabindex');
    cell.removeAttribute('role');
    cell.removeAttribute('aria-label');
    cell.style.transform = '';
    cell.classList.remove('plateau-cell--drag');
    setInert(cell, false);
  });
  board.querySelector('.plateau-ghost')?.remove();
  setBusy(false);
  setEditUi(false);
  applyLayout(board, shown());
  say('');
}

/** Pourquoi la case c ne peut pas être posée pour le lieu id (null si elle est libre et dans le cadre). Seules les cases affichées gênent. */
function problem(id, c) {
  if (!inFrame(c)) return 'dépasse le plateau';
  const other = LIEUX.find((l) => l.id !== id && SHOWN_IDS.includes(l.id) && clash(EDIT.draft[l.id], c));
  return other ? `chevauche « ${other.label} »` : null;
}

/** Mesures de la grille en pixels (case, écart, ligne), pour placer l'aperçu pendant un glissement. */
function metrics(board) {
  const cs = getComputedStyle(board);
  const padL = parseFloat(cs.paddingLeft) || 0, padR = parseFloat(cs.paddingRight) || 0, padT = parseFloat(cs.paddingTop) || 0;
  const gap = parseFloat(cs.columnGap) || GAP, rowGap = parseFloat(cs.rowGap) || GAP;
  const rowH = parseFloat(cs.gridAutoRows) || ROW_H;
  const colW = (board.clientWidth - padL - padR - gap * (COLS - 1)) / COLS;
  return { padL, padT, gap, rowH, colW, pitch: colW + gap, rowPitch: rowH + rowGap };
}

/** Aperçu de la place visée : vert si libre, rouge si elle chevauche une case ou sort du plateau. */
function showGhost(board, c, ok) {
  const m = metrics(board);
  let g = board.querySelector('.plateau-ghost');
  if (!g) {
    g = document.createElement('div');
    g.className = 'plateau-ghost';
    g.setAttribute('aria-hidden', 'true');
    board.append(g);
  }
  g.classList.toggle('plateau-ghost--ko', !ok);
  Object.assign(g.style, {
    left: `${m.padL + c.x * m.pitch}px`,
    top: `${m.padT + c.y * m.rowPitch}px`,
    width: `${c.w * m.colW + (c.w - 1) * m.gap}px`,
    height: `${c.h * m.rowH + (c.h - 1) * m.gap}px`,
  });
}

/** Début d'un glissement (case = déplacer ; poignée = redimensionner). Le pointeur est capturé par la case. */
function dragStart(board, e) {
  if (!EDIT || e.button !== 0) return;
  const cell = e.target.closest('.plateau-cell');
  if (!cell || !board.contains(cell)) return;
  const id = cell.dataset.lieu;
  const orig = EDIT.draft[id];
  DRAG = {
    kind: e.target.closest('.plateau-handle') ? 'resize' : 'move', id, cell, pid: e.pointerId,
    sx: e.clientX, sy: e.clientY, orig, m: metrics(board), cand: orig, reason: null,
  };
  cell.setPointerCapture(e.pointerId);
  cell.classList.add('plateau-cell--drag');
  cell.focus({ preventScroll: true });
  e.preventDefault();
}

/** Glissement : la case suit le pointeur, l'aperçu montre la place visée (encadrée au pas de la grille). */
function dragMove(board, e) {
  if (!DRAG || e.pointerId !== DRAG.pid) return;
  const d = DRAG;
  const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
  let cand;
  if (d.kind === 'move') {
    cand = { x: Math.round(d.orig.x + dx / d.m.pitch), y: Math.round(d.orig.y + dy / d.m.rowPitch), w: d.orig.w, h: d.orig.h };
    d.cell.style.transform = `translate(${dx}px, ${dy}px)`;
  } else {
    cand = {
      x: d.orig.x, y: d.orig.y,
      w: clamp(Math.round(d.orig.w + dx / d.m.pitch), MIN_W, COLS),
      h: clamp(Math.round(d.orig.h + dy / d.m.rowPitch), minH(d.id), MAX_H),
    };
  }
  d.cand = cand;
  d.reason = problem(d.id, cand);
  showGhost(board, cand, !d.reason);
}

/** Fin du glissement : posée si libre ; sinon la case reprend sa place. */
function dragEnd(board, e) {
  if (!DRAG || e.pointerId !== DRAG.pid) return;
  const d = DRAG;
  DRAG = null;
  d.cell.style.transform = '';
  d.cell.classList.remove('plateau-cell--drag');
  board.querySelector('.plateau-ghost')?.remove();
  if (d.reason) { say(`Impossible : ${labelOf(d.id)} ${d.reason}. La case reprend sa place.`); return; }
  if (!same(d.cand, d.orig)) {
    EDIT.draft[d.id] = d.cand;
    applyLayout(board, EDIT.draft);
    say(describe(d.id, d.cand));
  }
}

/** Glissement interrompu (le navigateur reprend le pointeur) : la case revient à sa place. */
function dragCancel(board, e) {
  if (!DRAG || e.pointerId !== DRAG.pid) return;
  DRAG.cell.style.transform = '';
  DRAG.cell.classList.remove('plateau-cell--drag');
  DRAG = null;
  board.querySelector('.plateau-ghost')?.remove();
}

/** Clavier : flèches = déplacer d'une case ; Maj + flèches = redimensionner d'une case. Refus annoncé. */
function keyMove(board, e) {
  const cell = e.target.closest?.('.plateau-cell');
  const dir = KEY_DIR[e.key];
  if (!EDIT || !cell || !dir || !board.contains(cell)) return;
  e.preventDefault();
  const id = cell.dataset.lieu;
  const cur = EDIT.draft[id];
  const cand = e.shiftKey
    ? { x: cur.x, y: cur.y, w: clamp(cur.w + dir[0], MIN_W, COLS), h: clamp(cur.h + dir[1], minH(id), MAX_H) }
    : { x: cur.x + dir[0], y: cur.y + dir[1], w: cur.w, h: cur.h };
  if (same(cand, cur)) { say(describe(id, cur)); return; }
  const reason = problem(id, cand);
  if (reason) { say(`Impossible : ${labelOf(id)} ${reason}.`); return; }
  EDIT.draft[id] = cand;
  applyLayout(board, EDIT.draft);
  say(describe(id, cand));
}

/** Enregistre la disposition (les sept cases, pour ne pas effacer celles des lieux que ce compte ne voit pas ; celles que ses cases recouvrent passent dessous). */
async function saveEdit() {
  setBusy(true);
  try {
    const { data, error } = await sb.rpc('hg_admin_plateau_set', { p: { cells: resolveLayout(EDIT.draft, SHOWN_IDS) } });
    if (error) throw error;
    LAYOUT = layoutOf(data);
    SAVED = true;
    leaveEdit();
    toast('Disposition enregistrée', 'ok');
    focusEditButton();
  } catch (e) {
    setBusy(false);
    toast('Enregistrement impossible : ' + (e?.message || 'erreur réseau'), 'error');
  }
}

/** Remet la disposition par défaut (envoie null) après confirmation. */
async function resetLayout() {
  setBusy(true);
  try {
    const { error } = await sb.rpc('hg_admin_plateau_set', { p: null });
    if (error) throw error;
    LAYOUT = copyLayout(DEFAULT_LAYOUT);
    SAVED = false;
    leaveEdit();
    toast('Disposition par défaut rétablie', 'ok');
    focusEditButton();
  } catch (e) {
    setBusy(false);
    toast('Remise par défaut impossible : ' + (e?.message || 'erreur réseau'), 'error');
  }
}

/** Ligne d'info en direct de chaque case : le premier élément « À faire » du lieu (ou rien). */
function paintInfo() {
  document.querySelectorAll('[data-lieu-info]').forEach((p) => {
    const it = TODO_FIRST.get(p.dataset.lieuInfo);
    p.hidden = !it;
    p.textContent = it ? it.title : '';
    p.title = it ? it.title : '';
  });
}

/**
 * Groupes de sous-sections permises, dans l'ordre (un groupe par titre contigu ; sans titre, la liste est seule).
 * @returns {Array<{heading: string|null, subs: Array<object>}>}
 */
function groupsOf(lieu) {
  const runs = [];
  for (const s of lieu.subs) {
    const last = runs[runs.length - 1];
    if (last && last.heading === (s.heading || null)) last.subs.push(s);
    else runs.push({ heading: s.heading || null, subs: [s] });
  }
  return runs;
}

/** Tuile d'une page du lieu : grande, icône, libellé, ligne d'aide, compteur « à traiter » (repeint par shell.js). */
function tileHtml(lieu, s, countOf) {
  const n = countOf(s.id) || 0;
  return `<a class="lieu-tile" href="#${esc(lieu.id)}/${esc(s.id)}" data-sub="${esc(s.id)}" style="--lieu: ${esc(lieu.color)}">
      <span class="lieu-tile-ico" aria-hidden="true">${panelIcon(s.icon)}</span>
      <span class="lieu-tile-txt"><span class="lieu-tile-name">${esc(s.label)}</span>${s.help ? `<span class="lieu-tile-help">${esc(s.help)}</span>` : ''}</span>
      <span class="nav-count lieu-tile-count" data-count="${esc(s.id)}"${n ? '' : ' hidden'}>${n || ''}</span>
    </a>`;
}

/**
 * Répartit les tuiles d'un groupe en lignes de même nombre à une tuile près, étirées sur toute la largeur :
 * autant de colonnes que la largeur en permet (6 au plus, tuile de 250 px au moins, gouttière de 12 px), puis des lignes
 * égales (7 tuiles sur 4 colonnes : 4 + 3). Le CSS (.lieu-tiles--eq) lit --k, le nombre de tuiles de la ligne.
 */
function equilibrerTuiles(root) {
  for (const box of root.querySelectorAll('.lieu-tiles')) {
    const tuiles = [...box.children], n = tuiles.length;
    const colonnes = Math.min(6, Math.max(1, Math.floor((box.clientWidth + 12) / 262)));
    const lignes = Math.ceil(n / colonnes);
    let t = 0;
    for (let r = 0; r < lignes; r++) {
      const k = Math.ceil((n - t) / (lignes - r));
      for (let j = 0; j < k; j++) tuiles[t++].style.setProperty('--k', k);
    }
    box.classList.add('lieu-tiles--eq');
  }
}
let tuilesObs = null; // observe la largeur de la page du lieu courant (une seule à la fois)

/** Corps de la page d'un lieu : bandeau, « À faire maintenant » (rempli après), toutes les pages groupées. */
function lieuHtml(lieu, countOf) {
  const total = todoCount(lieu.id);
  const groups = groupsOf(lieu).map((g) => `<section class="lieu-group">
        ${g.heading ? `<h3 class="lieu-group-title">${esc(g.heading)}</h3>` : ''}
        <div class="lieu-tiles">${g.subs.map((s) => tileHtml(lieu, s, countOf)).join('')}</div>
      </section>`).join('');
  return `<div class="lieu" style="--lieu: ${esc(lieu.color)}">
      <section class="lieu-banner" aria-label="${esc(lieu.label)}">
        <p class="lieu-tag">${esc(lieu.tagline)}</p>
        <span class="lieu-total" data-lieu-count="${esc(lieu.id)}"${total ? '' : ' hidden'}>${total} à traiter</span>
      </section>
      <section class="lieu-todo" aria-labelledby="lieu-todo-title">
        <h2 class="lieu-h" id="lieu-todo-title">À faire maintenant</h2>
        <div class="lieu-todo-box" data-lieu-todo><div class="empty">Chargement…</div></div>
      </section>
      <section class="lieu-pages" aria-labelledby="lieu-pages-title">
        <h2 class="lieu-h" id="lieu-pages-title">Toutes les pages de ce lieu</h2>
        ${groups}
      </section>
    </div>`;
}

/** HTML d'un élément « À faire » : titre, précision, actions (liens ou boutons). Les boutons sont liés par index. */
function todoHtml(items) {
  if (!items.length) return '<p class="lieu-todo-empty">Rien à faire ici pour l’instant.</p>';
  return `<ul class="lieu-todo-list">${items.map((it, i) => `<li class="lieu-todo-item">
      <div class="lieu-todo-text"><p class="lieu-todo-title">${esc(it.title)}</p>${it.meta ? `<p class="lieu-todo-meta">${esc(it.meta)}</p>` : ''}</div>
      <div class="lieu-todo-actions">${(it.actions || []).map((a, j) => (a.href
        ? `<a class="btn btn-sand btn-sm" href="${esc(a.href)}">${esc(a.label)}</a>`
        : `<button type="button" class="btn btn-sand btn-sm" data-lieu-act="${i}.${j}">${esc(a.label)}</button>`)).join('')}</div>
    </li>`).join('')}</ul>`;
}

/**
 * Affiche la page d'un lieu dans `root` (vidé d'abord) : bandeau, tuiles, puis « À faire » une fois les fournisseurs prêts.
 * Une visite plus récente (autre lieu) annule le remplissage de celle-ci.
 * @param {HTMLElement} root Conteneur de la page (#lieu-root).
 * @param {object} lieu Lieu permis (visibleLieux).
 * @param {(sub: string) => number} countOf Compteur « à traiter » d'une sous-section.
 */
export async function renderLieu(root, lieu, countOf) {
  root.innerHTML = lieuHtml(lieu, countOf);
  root.dataset.lieu = lieu.id;
  tuilesObs?.disconnect();
  tuilesObs = null;
  equilibrerTuiles(root);
  const pages = root.querySelector('.lieu-pages');
  if (pages && typeof ResizeObserver === 'function') {
    let largeur = pages.clientWidth;
    tuilesObs = new ResizeObserver(() => {
      if (!pages.isConnected) { tuilesObs?.disconnect(); return; }
      if (pages.clientWidth !== largeur) { largeur = pages.clientWidth; equilibrerTuiles(root); } // la hauteur change avec les lignes : ignorée
    });
    tuilesObs.observe(pages);
  }
  const box = root.querySelector('[data-lieu-todo]');
  const items = await todoItems(lieu.id);
  TODO_N.set(lieu.id, items.length);
  repaint();
  if (root.dataset.lieu !== lieu.id || !box.isConnected) return; // une autre page a pris la place
  box.innerHTML = todoHtml(items);
  // Clics des boutons « À faire » (index i = élément, j = action, comme dans todoHtml)
  const acts = items.map((it) => it.actions || []);
  root.onclick = (e) => {
    const b = e.target.closest('[data-lieu-act]');
    if (!b) return;
    const [i, j] = b.dataset.lieuAct.split('.').map(Number);
    acts[i]?.[j]?.onClick?.();
  };
}
