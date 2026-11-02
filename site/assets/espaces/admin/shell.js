// ===== Humane Gang — administration : coquille du panel (en-tête, fil d'Ariane, zone principale) =====
//
// Structure (/pages/admin/admin.html) : en-tête unique (#shell-top : logo, « Tout le panel », « Voir le site », voyant, menu compte)
// puis le corps (#shell-body) : liste facultative (#shell-col, sous-sections « liste + détail ») | zone principale (#app) |
// panneau d'infos facultatif (#shell-info). Sur téléphone, une barre du bas (#shell-tabs) : Plateau et les lieux.
// Il n'y a plus de rail ni de colonne de navigation : tout passe par le plateau (#plateau), les pages de lieu (#<lieu>)
// et la palette « Tout le panel » (admin/palette.js).
// Les sections (<section class="admin-section">) restent dans #shell-parking jusqu'à leur première visite, puis sont
// déplacées dans le conteneur de leur sous-section.
//
// ---------- API des sous-sections ----------
//   registerSub('lieu/sous-section', {
//     group?: 'id',             // sous-sections partageant un même conteneur (ex. les onglets du Jeu de cartes : group 'cartes')
//     main?: (el) => …,         // appelé UNE fois par groupe, à la première visite ; el = conteneur du groupe.
//                               // La section (id = `section` de LIEUX) y est déjà placée. Peut être async.
//     open?: (el, { id, tab }) => …, // appelé à chaque visite, après main ; id/tab = segments /id/onglet de l'URL
//     list?: (el) => …,         // liste à gauche (colonne « liste + détail ») : appelé une fois par sous-section
//     info?: (el) => …,         // panneau d'infos à droite (affiché ≥ 1440 px seulement) : appelé une fois par sous-section
//   })
// Le plateau : registerPlateau (admin/lieux.js) pose son contenu dans #plateau-root ; sans lui, les 7 lieux en cartes.
// Actions de zone : #zone-actions (à droite du titre) est vidé à chaque visite ; open() y pose ses boutons (setActions).
// setCount(sous-section, n) : compteur « à traiter » d'une tuile de la page du lieu. La pastille du lieu (plateau, barre du
// bas) et le total de la page du lieu sont le nombre d'éléments « À faire » du lieu (lieux.js, todoCount ; l'événement
// « hg:todo-changed » les repeint). Les droits viennent de admin/perms.js (LIEUX, canSection).
// ------------------------------------------------------

import { $, sb, esc, signOutDevice, openPrefs, openGodDialog, disableGodMode, isGodMode, getGodMode, clearPerms } from '../../commun/core.js';
import { autresComptes } from '../../commun/core/comptes-etat.js';
import { svg as iconSvg } from '../../commun/icons.js';
import { LIEUX, visibleLieux, canSection } from './perms.js';
import { resolve } from './router.js';
import { panelIcon } from './panel-icons.js';
import { renderPlateau, renderLieu, plateauMount, todoCount } from './lieux.js';

// Deux seuils d'affichage : mobile (≤ 760 px) et large (≥ 1440 px, panneau d'infos visible).
const MOBILE = matchMedia('(max-width: 760px)');
const WIDE = matchMedia('(min-width: 1440px)');

// Groupes de sous-sections (un conteneur par groupe) : groupe -> { el, ready }.
const groups = new Map();
// Fournisseurs enregistrés : 'lieu/sous-section' -> { group, main, open, list, info }.
const providers = new Map();
// Liste (colonne) et panneau d'infos : un emplacement par sous-section, créé à la première visite.
const slots = { list: new Map(), info: new Map() };
// Compteurs « à traiter » : sous-section -> nombre.
const counts = new Map();
// Numéro de la dernière navigation : une réponse lente d'une visite précédente est ignorée.
let seq = 0;
// Vrai une fois le routage démarré (startShell).
let started = false;
// Profil de l'administrateur connecté (pseudo, droits).
let profile = null;
// Clé de la sous-section affichée (ex. « fabrique/defis »), ou null.
let curKey = null;
// Éléments de la coquille, remplis par initShell.
let el = {};

/**
 * Enregistre le fournisseur d'une sous-section (voir l'API en tête de fichier).
 * Un groupe sans `group` forme son propre conteneur.
 */
export function registerSub(key, provider = {}) {
  providers.set(key, { group: key, ...provider });
}

/**
 * Place la section `id` dans le conteneur `host` (sans changer ses droits).
 * Ne fait rien si la section est déjà dans ce conteneur.
 */
export function place(host, id) {
  const s = document.getElementById(id);
  if (s && host && s.parentElement !== host) host.append(s);
}

/** Nombre « à traiter » d'une sous-section (0 si aucun ou non renseigné). */
export const countOf = (sub) => counts.get(sub) || 0;

/**
 * Compteur « à traiter » d'une sous-section (0 = masqué). Met à jour les tuiles et les pastilles des lieux.
 * @param {string} sub Identifiant de sous-section (ex. « idees »).
 * @param {number} n
 */
export function setCount(sub, n) {
  counts.set(sub, n || 0);
  paintCounts();
}

/**
 * Remplit l'en-tête de zone (boutons d'action) ; liste de nœuds ou de chaînes HTML sûres.
 * @param {Array<Node|string>} nodes
 */
export function setActions(nodes = []) {
  const host = document.getElementById('zone-actions');
  if (host) host.replaceChildren(...nodes);
}

/* ---------- Construction (barre du bas, menu compte) ---------- */

/** Initiales d'un pseudo (deux lettres) pour l'avatar. « ? » si le nom est vide. */
function initials(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!w.length) return '?';
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}

/**
 * Construit la barre du bas (mobile) : Plateau, puis les lieux permis (icône colorée, pastille du nombre à traiter),
 * et le pied de l'en-tête (voyant, mode sans limite, avatar).
 */
function buildChrome() {
  const lieux = visibleLieux();
  el.tabs.innerHTML = `<a class="shell-tab" href="#plateau" data-route="plateau">
      <span class="shell-tab-pic">${panelIcon('home')}</span><span class="shell-tab-label">Plateau</span></a>`
    + lieux.map((l) => `<a class="shell-tab" href="#${esc(l.id)}" data-lieu="${esc(l.id)}" style="--lieu: ${esc(l.color)}" aria-label="${esc(l.label)}">
      <span class="shell-tab-pic">${panelIcon(l.icon)}<span class="shell-badge" data-lieu-badge="${esc(l.id)}" hidden></span></span>
      <span class="shell-tab-label">${esc(l.label.replace(/^(La|Le|Les) /, ''))}</span></a>`).join('');
  el.god.innerHTML = iconSvg('bolt', { size: 22, stroke: 1.9 });
  el.avatar.textContent = initials(profile?.pseudo);
  el.avatar.setAttribute('aria-label', `Compte : ${profile?.pseudo || ''}`);
  for (const n of el.menu.querySelectorAll('[data-admin-only]')) n.hidden = !profile?.is_admin;
}

/* ---------- Compteurs ---------- */

/**
 * Affiche les compteurs « à traiter » : sur chaque sous-section (tuiles des pages de lieu), puis le nombre d'éléments
 * « À faire » de chaque lieu (pastilles du plateau et de la barre du bas, total de la page du lieu). Un compteur à 0 est masqué.
 */
function paintCounts() {
  if (!el.shell) return;
  for (const [sub, n] of counts) {
    for (const b of document.querySelectorAll(`.nav-count[data-count="${CSS.escape(sub)}"]`)) {
      b.hidden = !n;
      b.textContent = n || '';
      b.classList.toggle('hot', n > 0);
    }
  }
  for (const l of LIEUX) {
    const total = todoCount(l.id);
    for (const b of document.querySelectorAll(`[data-lieu-badge="${l.id}"]`)) { b.hidden = !total; b.textContent = total || ''; }
    for (const b of document.querySelectorAll(`[data-lieu-count="${l.id}"]`)) { b.hidden = !total; b.textContent = total ? `${total} à traiter` : ''; }
  }
}

// Nombre d'éléments « À faire » recompté (plateau, page de lieu) : on repeint les pastilles.
document.addEventListener('hg:todo-changed', () => paintCounts());

/* ---------- Bouton « Mode sans limite » (réutilise core/godmode.js) ---------- */

/** Met à jour le bouton du mode sans limite : état « actif » et libellé avec l'heure de fin. */
function paintGod() {
  const btn = el.god;
  if (!btn) return;
  const { on, until } = getGodMode();
  const left = on && until ? new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' }).format(until) : '';
  btn.setAttribute('aria-pressed', String(on));
  btn.classList.toggle('is-on', on);
  const label = on ? `Mode sans limite actif${left ? ` jusqu'à ${left}` : ''} : désactiver` : 'Activer le mode sans limite';
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

/* ---------- Menu compte ---------- */

/** Ouvre ou ferme le menu du compte. À l'ouverture, le focus va sur son premier lien. */
function setMenu(open) {
  el.menu.hidden = !open;
  el.avatar.setAttribute('aria-expanded', String(open));
  if (open) el.menu.querySelector('a, button')?.focus();
}
/**
 * Branche le menu compte : ouverture par l'avatar, actions (préférences, déconnexion),
 * fermeture par clic extérieur ou Échap, et le bouton « Mode sans limite ».
 */
function bindMenu() {
  el.avatar.addEventListener('click', (e) => { e.stopPropagation(); setMenu(el.menu.hidden); });
  el.menu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-menu]');
    if (!b) return;
    if (b.dataset.menu === 'prefs') { setMenu(false); openPrefs(e); return; }
    if (b.dataset.menu === 'logout') {
      // Deux comptes sur l'appareil : la boîte de comptes.js demande lequel déconnecter
      if (autresComptes().some((a) => a.rt)) { setMenu(false); (await import('../../commun/core/comptes.js')).deconnexion(); return; }
      b.disabled = true;
      await signOutDevice(); // retire aussi l'abonnement push de l'appareil
      try { sessionStorage.removeItem('hg_badges_checked'); } catch { /* stockage bloqué */ }
      clearPerms();
      location.href = '/pages/compte/compte.html';
    }
  });
  document.addEventListener('click', (e) => { if (!el.menu.hidden && !el.menu.contains(e.target) && e.target !== el.avatar) setMenu(false); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.menu.hidden) { setMenu(false); el.avatar.focus(); }
  });
  el.god.addEventListener('click', (e) => {
    if (isGodMode()) disableGodMode(e.currentTarget);
    else openGodDialog(e);
  });
  window.addEventListener('hg:godmode', paintGod);
}

/* ---------- Affichage d'une route ---------- */

/** Marque le lieu courant (barre du bas) et la page du plateau (aria-current). */
function markActive(route) {
  let cur = null;
  for (const a of document.querySelectorAll('.shell-tab')) {
    const on = route === (a.dataset.route || a.dataset.lieu);
    setCurrent(a, on);
    if (on) cur = a;
  }
  // Téléphone : la barre du bas défile ; l'onglet courant reste entier à l'écran (ne reste jamais rogné au bord).
  const bar = el.tabs;
  if (cur && bar && bar.scrollWidth > bar.clientWidth) {
    const b = bar.getBoundingClientRect(), t = cur.getBoundingClientRect();
    if (t.left < b.left + 14) bar.scrollLeft += t.left - b.left - 14;
    else if (t.right > b.right - 14) bar.scrollLeft += t.right - b.right + 14;
  }
}
/** Pose ou retire aria-current sur un lien. */
function setCurrent(a, on) {
  if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
}

/**
 * Fil d'Ariane « Plateau › Lieu › Page » (le dernier élément est la page courante) et bouton retour.
 * @param {Array<{label: string, href?: string}>} parts
 * @param {{href: string, label: string}|null} back Destination du bouton retour (null : masqué).
 */
function paintCrumb(parts, back) {
  el.crumb.innerHTML = parts.map((p, i) => (i === parts.length - 1
    ? `<span aria-current="page">${esc(p.label)}</span>`
    : `<a href="${esc(p.href)}">${esc(p.label)}</a>`)).join('<span class="zone-sep" aria-hidden="true">›</span>');
  el.back.hidden = !back;
  if (back) { el.back.setAttribute('href', back.href); el.back.textContent = back.label; }
}

/** Affiche le plateau : son contenu (registerPlateau, ou les 7 lieux) dans #plateau-root. */
async function showPlateau() {
  el.shell.dataset.screen = 'page';
  el.shell.dataset.list = 'no';
  el.shell.dataset.info = 'no';
  el.shell.dataset.route = 'plateau';
  el.infoPanel.hidden = true;
  el.col.hidden = true;
  for (const g of groups.values()) g.el.hidden = true;
  el.lieuRoot.hidden = true;
  el.plateauRoot.hidden = false;
  el.zoneTitle.textContent = 'Plateau';
  paintCrumb([], null); // pas de fil d'Ariane : le titre est déjà « Plateau » (pas de répétition)
  setActions([]);
  markActive('plateau');
  const fn = plateauMount();
  el.plateauRoot.replaceChildren();
  if (fn) await fn(el.plateauRoot, { lieux: visibleLieux(), countOf, totalOf: (l) => todoCount(l.id) });
  else await renderPlateau(el.plateauRoot, visibleLieux());
  paintCounts();
}

/** Affiche la page d'un lieu : bandeau, « À faire », pages en tuiles (render dans #lieu-root). */
function showLieu(lieu) {
  el.shell.dataset.screen = 'page';
  el.shell.dataset.list = 'no';
  el.shell.dataset.info = 'no';
  el.shell.dataset.route = lieu.id;
  el.infoPanel.hidden = true;
  el.col.hidden = true;
  for (const g of groups.values()) g.el.hidden = true;
  el.plateauRoot.hidden = true;
  el.lieuRoot.hidden = false;
  el.zoneTitle.textContent = lieu.label;
  paintCrumb([{ label: 'Plateau', href: '#plateau' }, { label: lieu.label }], { href: '#plateau', label: 'Retour' });
  setActions([]);
  markActive(lieu.id);
  renderLieu(el.lieuRoot, lieu, countOf);
  paintCounts();
}

/**
 * Affiche une sous-section : groupe monté à la première visite (main), puis open ; liste et panneau d'infos.
 * Une visite plus récente annule la précédente (seq).
 * @param {{lieu: object, sub: object, id?: string|null, tab?: string|null}} r Route résolue (voir router.js).
 */
async function showSub(r) {
  const token = ++seq;
  const key = `${r.lieu.id}/${r.sub.id}`;
  const p = providers.get(key) || {};
  curKey = key;
  el.shell.dataset.route = key;
  setActions([]);
  el.plateauRoot.hidden = true;
  el.lieuRoot.hidden = true;
  el.zoneTitle.textContent = r.sub.label;
  markActive(r.lieu.id);
  // Liste (sous-section « liste + détail ») : à gauche sur ordinateur ; sur mobile, la liste occupe l'écran tant qu'aucun
  // élément n'est choisi (/id). Le détail a un bouton « Liste » qui y revient ; les autres pages ont « Lieu ».
  const listed = !!p.list;
  el.shell.dataset.list = listed ? 'yes' : 'no';
  el.col.hidden = !listed;
  el.shell.dataset.screen = MOBILE.matches && listed && !r.id ? 'list' : 'page';
  paintCrumb([{ label: 'Plateau', href: '#plateau' }, { label: r.lieu.label, href: `#${r.lieu.id}` }, { label: r.sub.label }],
    listed && r.id
      ? { href: `#${r.lieu.id}/${r.sub.id}`, label: 'Liste' }
      : { href: `#${r.lieu.id}`, label: 'Retour' });
  // Conteneur du groupe (une seule sous-section visible à la fois ; les déjà montées restent en mémoire)
  const gid = p.group || key;
  let g = groups.get(gid);
  if (!g) {
    const node = document.createElement('div');
    node.className = 'shell-group';
    node.dataset.group = gid;
    el.groupsHost.append(node);
    g = { el: node, ready: null };
    groups.set(gid, g);
  }
  for (const x of groups.values()) x.el.hidden = x !== g;
  // Montage unique du groupe : la section est placée, puis `main` s'exécute (une seule fois).
  if (!g.ready) {
    g.ready = (async () => {
      place(g.el, r.sub.section);
      await p.main?.(g.el);
    })().catch((err) => {
      console.error('[panel]', key, err);
      g.el.innerHTML = '<div class="empty">Cette section n’a pas pu s’afficher. Recharge la page.</div>';
    });
  }
  await g.ready;
  if (token !== seq) return;
  if (p.open) {
    try { await p.open(g.el, { id: r.id, tab: r.tab }); } catch (err) { console.error('[panel]', key, err); }
    if (token !== seq) return;
  }
  // Liste (colonne) et panneau d'infos : une fois par sous-section, seul le courant est affiché
  for (const [k, node] of slots.list) node.hidden = k !== key;
  if (p.list) { const s = slotFor(slots.list, el.listHost, key); if (s.fresh) await p.list(s.node); s.node.hidden = false; }
  for (const [k, node] of slots.info) node.hidden = k !== key;
  if (p.info) { const s = slotFor(slots.info, el.infoHost, key); if (s.fresh) await p.info(s.node); s.node.hidden = false; }
  el.shell.dataset.info = p.info ? 'yes' : 'no';
  el.infoPanel.hidden = !p.info;
  if (token !== seq) return;
  el.zone.scrollTop = 0;
}

/**
 * Emplacement (div) de la liste ou du panneau d'infos d'une sous-section, créé à la première demande.
 * @returns {{node: HTMLDivElement, fresh: boolean}} fresh : vrai si l'emplacement vient d'être créé.
 */
function slotFor(map, host, key) {
  let node = map.get(key);
  if (node) return { node, fresh: false };
  node = document.createElement('div');
  node.className = 'shell-slot';
  node.dataset.key = key;
  host.append(node);
  map.set(key, node);
  return { node, fresh: true };
}

/** Affiche l'écran « Aucune section accessible » quand l'administrateur n'a aucun droit. */
function renderNoAccess() {
  el.shell.dataset.screen = 'page';
  el.shell.dataset.list = 'no';
  el.shell.dataset.info = 'no';
  el.zoneTitle.textContent = 'Aucune section accessible';
  paintCrumb([{ label: 'Panel' }], null);
  for (const g of groups.values()) g.el.hidden = true;
  el.plateauRoot.hidden = true;
  el.lieuRoot.hidden = true;
  el.col.hidden = true;
  el.infoPanel.hidden = true;
  el.noAccess.hidden = false;
}

/**
 * Résout le fragment courant. Si la route doit changer (ancienne adresse, droit manquant), remplace le fragment
 * sans nouvelle entrée d'historique, puis reprend (3 niveaux au plus, pour éviter une boucle).
 */
function sync(depth = 0) {
  const r = resolve(location.hash);
  if (r.redirect !== undefined) {
    if (!r.redirect) { renderNoAccess(); return; }
    history.replaceState(null, '', `#${r.redirect}`);
    if (depth < 3) return sync(depth + 1);
  }
  el.noAccess.hidden = true;
  if (r.plateau) { showPlateau().catch((err) => console.error('[panel] plateau', err)); return; }
  if (!r.sub) { showLieu(r.lieu); return; }
  showSub(r);
}

/**
 * Construit la coquille (en-tête, barre du bas, menu compte) et écoute le routage.
 * Le routage (et le montage de la première page) démarre à startShell(), une fois les données chargées.
 * @param {{me?: object|null}} [opts] me : profil de l'administrateur connecté.
 */
export function initShell({ me = null } = {}) {
  profile = me;
  document.querySelector('.site-header')?.remove();   // en-tête du site : remplacé par l'en-tête du panel
  document.querySelector('.site-footer')?.remove();
  el = {
    shell: $('#shell'), top: $('#shell-top'), god: $('#shell-god'), avatar: $('#shell-avatar'), menu: $('#shell-menu'),
    tabs: $('#shell-tabs'), col: $('#shell-col'), listHost: $('#shell-col-list'), zone: $('#app'),
    zoneTitle: $('#zone-title'), crumb: $('#zone-crumb'), back: $('#zone-back'), groupsHost: $('#shell-groups'),
    plateauRoot: $('#plateau-root'), lieuRoot: $('#lieu-root'), noAccess: $('#shell-noaccess'),
    infoPanel: $('#shell-info'), infoHost: $('#shell-info-host'),
  };
  buildChrome();
  bindMenu();
  paintGod();
  el.avatar.setAttribute('aria-expanded', 'false');
  window.addEventListener('hashchange', () => { if (started) sync(); });
  MOBILE.addEventListener('change', () => { if (started) sync(); });
  WIDE.addEventListener('change', () => { if (started) sync(); });
}

/** Démarre le routage : affiche la route demandée (ou le plateau). Ne fait rien au second appel. */
export function startShell() {
  if (started) return;
  started = true;
  paintCounts();
  sync();
}

/**
 * Ouvre une adresse de la coquille (palette, liens) : le fragment déclenche le routage ; s'il ne change pas, on réaffiche.
 * @param {string} path Adresse sans « # », ex. « place/comptes/<id> ».
 */
export function navigate(path) {
  const h = '#' + path;
  if (location.hash === h) sync(); else location.hash = path;
}

/** Clé de la sous-section affichée (ex. « place/comptes ») ou null. */
export const currentSub = () => curKey;
