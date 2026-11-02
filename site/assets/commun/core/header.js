// En-tête commun : marque, barre de menus déroulants, et photo de profil qui ouvre un menu en arc (outils du membre).
/*
 * Rôle : construit la barre du haut de chaque page (refonte du 23/10, maquette « Humane Gang · nouveau menu »).
 *   - Barre horizontale : « Le jeu de cartes », « IRL », « Jeux », « Calendrier » et « Autres » (pages restantes
 *     accessibles), chacun ouvrant un menu déroulant ; « Arcade » ouvre un sous-menu (Paillettes, Raclette, Domu-mobile).
 *     « Jeux » propose les raccourcis vers les sections de la page Jeux (Tous les jeux, quotidiens, flash, duels, spéciaux) ;
 *     une section n'est proposée que si le membre y voit au moins un jeu (mêmes règles que jeux.js).
 *     Un lien n'apparaît que si le membre a accès à sa page (pages-access.js) ; un menu vide disparaît.
 *   - À droite, la photo de profil seule. Un clic ouvre un quart de cercle d'icônes autour d'elle, sur deux rangées :
 *     Messages, Recherche, Mon compte ; puis Aide et tutos, Affichage, Mode sans limite (admin), Admin ou Staff,
 *     Changer de compte (admin et Staff, ou deux comptes déjà sur l'appareil ; comptes.js), Déconnexion. La pastille des messages non lus est aussi posée sur la photo.
 *   - Vue « comme un membre » (admin, view-as.js) : menus et pages du membre ; Admin, Staff et Sans limite sont masqués.
 *   - Téléphone (760 px et moins) : bouton « Menu » qui déplie les menus en accordéon ; même arc, en plus petit.
 * Les boutons gardent leurs classes historiques (.nav-msg, .nav-search-open, .nav-help, .prefs-open, .nav-god,
 * .nav-logout, .nav-account) : unread.js, search.js, godmode.js, shortcuts.js et tour.js les retrouvent.
 * Page : toutes les pages (renderHeader est appelée par init.js, updateNav une fois les pages connues).
 * Dépendances : supabase.js (déconnexion), profile.js, perms.js (Staff/admin), pages-access.js (liens), view-as.js,
 * theme.js (logo), prefs.js, godmode.js, util.js, icons.js, search.js, shortcuts.js, site-defaults.js.
 * Exporte : updateHeaderProfile, updateNav, renderHeader.
 */
import { signOutDevice } from './supabase.js';
import { getCachedProfile } from './profile.js';
import { getCachedPerms, canPanel, clearPerms } from './perms.js';
import { getMyPages, canAccess, pageLabel, pageHref } from './pages-access.js';
import { viewAsActive } from './view-as.js';
import { logoAttrs } from './theme.js';
import { openPrefs } from './prefs.js';
import { paintGod, openGodDialog, disableGodMode, isGodMode } from './godmode.js';
import { avatarHtml, esc, reducedMotion } from './util.js';
import {
  ICON_MSG, ICON_DOOR, ICON_PREFS, ICON_BOLT, ICON_USER, ICON_HELP, ICON_MENU, ICON_SEARCH, ICON_CHEVRON, ICON_CHEVRON_RIGHT, ICON_SHIELD,
  ICON_STATUT, ICON_COMPTES,
} from './icons.js';
import { autresComptes } from './comptes-etat.js';
import { bindRechercheLien, ouvreRecherche } from './recherche-lien.js';
import { bindShortcuts } from './shortcuts.js';
import { siteIdentite, navLibelle } from './site-defaults.js';
import { MENUS, menuKey } from './menu-def.js';

/* ---------- Structure du menu ---------- */

// Menus de la barre : définis dans menu-def.js (partagés avec l'éditeur des libellés du panel admin).
/** Pages déjà rangées dans un menu (ou atteintes autrement) : jamais répétées dans « Autres ». */
// Les jeux à page propre (Loup-Garou, Uno…) sont rangés dans la page Jeux (cartes), pas dans le menu.
const PLACED = new Set(['cartes', 'jeux', 'loup-garou', 'uno', 'duels', 'nom-de-code', 'cluedo', 'shadow-hunters', 'destins', 'monopoly', 'risk', 'blackjack', 'poker', 'catan', 'pictionary', 'secret-santa', 'irl', 'historique', 'calendrier', 'messages', 'accueil', 'aide', 'compte', 'admin']);
// Libellés courts pour « Autres » (le libellé complet reste celui de hg_pages ailleurs).
const NAV_SHORT = { membre: 'Annuaire', recap: 'Récap de l’année' };

/** Vrai si le lien est accessible (sans profil : aucun lien de page). */
// strict : la page doit être déclarée dans hg_pages (sinon masquée, même si canAccess laisse passer les pages inconnues).
/** Couleur de la traînée arc-en-ciel de chaque menu (pastille glissante de la barre, refonte Pixel Pop). */
const MENU_C = { cartes: '#FBD32D', irl: '#FCA301', jeux: '#2FD16B', calendrier: '#3D7BFF', autres: '#8B5CF6' };
const menuC = (id) => ` style="--menu-c: ${MENU_C[id] || 'var(--esp)'}"`;
const allowed = (it, profile) => !!profile && (!it.page || canAccess(it.page)) && (!it.strict || !!pageLabel(it.page));

/**
 * Menu « Jeux » : raccourcis vers les sections de la page Jeux (ancres lues par jeux.js, qui fait défiler jusqu'à la section).
 * Le titre du menu garde le libellé réglé pour l'ancien lien direct (menu-def.js : { id: 'jeux', href, page: 'jeux' }).
 * section : id de SECTIONS (espaces/jeux/catalogue.js) ; l'entrée n'apparaît que si la section a un jeu visible.
 * Le catalogue (≈ 19 Ko) n'est chargé qu'à l'approche du menu (survol, focus, toucher) ou sur les pages Jeux : d'ici là,
 * les entrées de section restent cachées (budget de performance mobile).
 */
const JEUX_ITEMS = [
  { label: 'Tous les jeux', href: '/pages/jeux/jeux.html#tous', page: 'jeux' },
  { label: 'Jeux quotidiens', href: '/pages/jeux/jeux.html#quotidien', page: 'jeux', section: 'quotidien' },
  { label: 'Jeux flash', href: '/pages/jeux/jeux.html#flash', page: 'jeux', section: 'flash' },
  { label: 'Duels / multijoueurs', href: '/pages/jeux/jeux.html#multi', page: 'jeux', section: 'multi' },
  { label: 'Jeux spéciaux', href: '/pages/jeux/jeux.html#speciaux', page: 'jeux', section: 'speciaux' },
];
/** Cartes du catalogue des jeux, une fois chargé (null avant). */
let cartesJeux = null;
let cartesJeuxP = null;
/** Charge le catalogue des jeux (une fois), puis montre les entrées de section du menu « Jeux » qui ont un jeu visible. */
function chargerJeux(header) {
  cartesJeuxP ||= import('../../espaces/jeux/catalogue.js').then((m) => { cartesJeux = m.CARTES; }).catch(() => { cartesJeuxP = null; });
  cartesJeuxP.then(() => {
    if (!cartesJeux) return;
    const profile = getCachedProfile();
    header.querySelectorAll('.nav-menu [data-section]').forEach((a) => { a.hidden = !sectionVisible(a.dataset.section, profile); });
  });
}
/** Vrai si le membre voit au moins un jeu de la section (comme carteVisible de jeux.js : jeux en préparation pour les admins). */
function sectionVisible(id, profile) {
  if (!cartesJeux) return false;
  const admin = !!profile?.is_admin && !viewAsActive();
  return cartesJeux.some((c) => c.section === id && (c.bientot || c.admin ? admin : !c.page || (canAccess(c.page) && !!pageLabel(c.page))));
}

/**
 * Entrées du menu « Autres » : pages du menu (in_nav) accessibles et pas encore rangées, dans l'ordre de la base.
 * @returns {Array<{label: string, href: string}>}
 */
function otherItems() {
  const mine = getMyPages();
  if (!mine) return [];
  return mine.filter((p) => p.in_nav && !PLACED.has(p.slug))
    .map((p) => ({ label: navLibelle(p.slug) || NAV_SHORT[p.slug] || p.label || p.slug, href: pageHref(p.slug), page: p.slug }));
}

/** Vrai si le lien pointe vers la page affichée (avec son ancre si le lien en a une). */
function isHere(href) {
  const [file, hash] = href.split('#');
  const norm = (p) => p.replace(/\/$/, '/index.html');
  if (norm(new URL(file, location.href).pathname) !== norm(location.pathname)) return false;
  return !hash || location.hash.slice(1).split(/[/?]/)[0] === hash;
}
const curAttr = (href) => (isHere(href) ? ' aria-current="page"' : '');

/** Libellé d'une entrée : celui réglé pour sa page (nav_libelles) quand l'entrée mène à sa propre page. */
const libelleEntree = (it) => navLibelle(menuKey(it)) || (it.page && it.href === pageHref(it.page) && navLibelle(it.page)) || it.label;

/** Lien d'un menu déroulant. */
// data-cpt : pastille de compteur (badges-compteur.js), posée toute seule après le rendu du menu.
const linkHtml = (it) => `<a class="nav-item" href="${esc(it.href)}"${it.cpt ? ` data-cpt="${esc(it.cpt)}"` : ''}${curAttr(it.href)}>${esc(libelleEntree(it))}</a>`;

/**
 * Contenu d'un menu déroulant (liens, filets, sous-menu Arcade). Les filets en tête ou en fin sont retirés.
 * @param {object[]} items Entrées du menu.
 * @param {string} id Identifiant du menu (pour les id du sous-menu).
 * @param {object|null} profile Profil courant.
 * @returns {string} HTML, vide si aucune entrée accessible.
 */
function itemsHtml(items, id, profile) {
  const out = [];
  for (const it of items) {
    if (it.sep) { if (out.length && out[out.length - 1] !== 'sep') out.push('sep'); continue; }
    if (!allowed(it, profile)) continue;
    if (it.sub) {
      const subs = it.sub.filter((s) => allowed(s, profile));
      if (!subs.length) continue;
      const on = subs.some((s) => isHere(s.href)) || isHere('/pages/jeux/jeux.html#arcade');
      out.push(`<div class="nav-sub">
          <button class="nav-item nav-sub-btn${on ? ' is-current' : ''}" type="button" aria-expanded="false" aria-controls="nav-sub-${id}">${esc(navLibelle(menuKey(it)) || it.label)}${ICON_CHEVRON_RIGHT}</button>
          <div class="nav-submenu" id="nav-sub-${id}" hidden>${subs.map(linkHtml).join('')}</div>
        </div>`);
      continue;
    }
    out.push(linkHtml(it));
  }
  while (out[out.length - 1] === 'sep') out.pop();
  return out.map((x) => (x === 'sep' ? '<span class="nav-sep" role="separator"></span>' : x)).join('');
}

/**
 * Barre de menus : un bouton par menu (avec son menu déroulant), ou un lien direct (Calendrier).
 * @param {object|null} profile Profil courant.
 * @returns {string} HTML de la barre (vide sans profil).
 */
function navHtml(profile) {
  if (!profile) return '';
  return MENUS.map((m) => {
    // Jeux : menu déroulant des sections de la page Jeux (titre : libellé réglé de l'ancien lien direct)
    if (m.id === 'jeux' && m.href) {
      if (!allowed(m, profile)) return '';
      const inner = JEUX_ITEMS.map((it) => (it.section
        ? linkHtml(it).replace('<a class="nav-item"', `<a class="nav-item" data-section="${it.section}"${sectionVisible(it.section, profile) ? '' : ' hidden'}`)
        : linkHtml(it))).join('');
      return `<div class="nav-group" data-menu="${m.id}">
        <button class="nav-top${isHere(m.href) ? ' is-current' : ''}"${menuC(m.id)} type="button" aria-expanded="false" aria-controls="nav-menu-${m.id}">${esc(navLibelle(menuKey(m)) || navLibelle(m.page) || m.label)}${ICON_CHEVRON}</button>
        <div class="nav-menu" id="nav-menu-${m.id}" hidden>${inner}</div>
      </div>`;
    }
    if (m.href) {
      if (!allowed(m, profile)) return '';
      return `<a class="nav-top" href="${esc(m.href)}"${menuC(m.id)}${curAttr(m.href)}>${esc(navLibelle(menuKey(m)) || navLibelle(m.page) || m.label)}</a>`;
    }
    const items = m.auto ? otherItems() : m.items;
    const inner = itemsHtml(items, m.id, profile);
    if (!inner) return '';
    const on = items.some((it) => (it.href && isHere(it.href)) || it.sub?.some((s) => isHere(s.href)));
    return `<div class="nav-group" data-menu="${m.id}">
        <button class="nav-top${on ? ' is-current' : ''}"${menuC(m.id)} type="button" aria-expanded="false" aria-controls="nav-menu-${m.id}">${esc(navLibelle(menuKey(m)) || navLibelle(m.id) || m.label)}${ICON_CHEVRON}</button>
        <div class="nav-menu" id="nav-menu-${m.id}" hidden>${inner}</div>
      </div>`;
  }).join('');
}

/* ---------- Pastille glissante (refonte Pixel Pop) ---------- */

/** Entrée de la barre qui correspond à la page affichée (ou null). */
const navCourant = (header) => header.querySelector('.nav .nav-top.is-current, .nav .nav-top[aria-current="page"]');
/**
 * Glisse la pastille de couleur derrière une entrée de la barre (survol, focus), ou derrière l'entrée de la page
 * affichée ; cachée sans entrée et dans le menu replié du téléphone. Couleur : --menu-c de l'entrée.
 * @param {HTMLElement} header En-tête.
 * @param {HTMLElement|null} [el] Entrée visée (par défaut celle de la page affichée).
 */
function movePill(header, el = navCourant(header)) {
  const pill = header.querySelector('.nav-pill');
  const box = header.querySelector('.container');
  if (!pill || !box) return;
  header.querySelectorAll('.nav-top.is-pill').forEach((x) => { if (x !== el) x.classList.remove('is-pill'); });
  if (!el || !el.offsetParent || matchMedia('(max-width: 760px)').matches) { pill.hidden = true; return; }
  const r = el.getBoundingClientRect(), c = box.getBoundingClientRect();
  const montre = pill.hidden;
  pill.hidden = false;
  if (montre) pill.classList.add('no-anim'); // première apparition : sur place, sans glisser depuis la gauche
  Object.assign(pill.style, { left: `${r.left - c.left}px`, top: `${r.top - c.top}px`, width: `${r.width}px`, height: `${r.height}px`,
    background: getComputedStyle(el).getPropertyValue('--menu-c').trim() || 'var(--esp)' });
  if (montre) requestAnimationFrame(() => pill.classList.remove('no-anim'));
  el.classList.add('is-pill');
}

/**
 * Replace la pastille quand la barre bouge sans événement de souris : barre Staff qui arrive à gauche et décale la page,
 * compteur « à faire » qui élargit une entrée, police chargée après coup. Sans cela, la pastille posée avant reste de travers :
 * elle déborde sur « IRL » et le texte de l'entrée sort de la pastille. À rappeler quand la barre est redessinée.
 * @param {HTMLElement} header En-tête.
 */
function suivrePastille(header) {
  if (typeof ResizeObserver !== 'function') return;
  header._pastilleObs?.disconnect();
  const nav = header.querySelector('.nav');
  if (!nav) return;
  const ro = new ResizeObserver(() => movePill(header, header.querySelector('.nav-top.is-pill') || undefined));
  header._pastilleObs = ro;
  ro.observe(nav);
  nav.querySelectorAll('.nav-top').forEach((t) => ro.observe(t));
}

/* ---------- Menus déroulants ---------- */

/** Ferme tous les menus déroulants (et sous-menus) de l'en-tête, sauf `keep`. */
function closeMenus(header, keep = null) {
  header.querySelectorAll('.nav-group').forEach((g) => { if (g !== keep) setMenu(g, false); });
}
/**
 * Ouvre ou ferme un menu déroulant. Fermer referme aussi son sous-menu.
 * @param {HTMLElement} group Élément .nav-group.
 * @param {boolean} open true pour ouvrir.
 */
function setMenu(group, open) {
  const btn = group.querySelector('.nav-top');
  const menu = group.querySelector('.nav-menu');
  if (!btn || !menu) return;
  btn.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
  group.classList.toggle('is-open', open);
  if (!open) group.querySelectorAll('.nav-sub').forEach((s) => setSub(s, false));
}
/** Ouvre ou ferme le sous-menu (Arcade). */
function setSub(sub, open) {
  sub.querySelector('.nav-sub-btn')?.setAttribute('aria-expanded', String(open));
  const m = sub.querySelector('.nav-submenu');
  if (m) m.hidden = !open;
  sub.classList.toggle('is-open', open);
}
/** Vrai sur ordinateur avec une souris (survol possible). */
const hoverMode = () => matchMedia('(hover: hover) and (pointer: fine) and (min-width: 761px)').matches;

/**
 * Branche les menus déroulants : clic, survol (ordinateur), Échap, flèches haut/bas, clic à l'extérieur.
 * La délégation d'événements survit aux remplacements de la barre par updateNav.
 * @param {HTMLElement} header En-tête.
 */
function bindMenus(header) {
  const nav = header.querySelector('.nav');
  nav.addEventListener('click', (e) => {
    const top = e.target.closest('.nav-top[aria-expanded]');
    if (top) {
      const g = top.closest('.nav-group');
      // À la souris sur ordinateur, le survol a déjà ouvert le menu : le clic le laisse ouvert.
      const byHover = e.pointerType === 'mouse' && hoverMode();
      const open = byHover || top.getAttribute('aria-expanded') !== 'true';
      closeMenus(header, g);
      setMenu(g, open);
      return;
    }
    const sb = e.target.closest('.nav-sub-btn');
    if (sb) { setSub(sb.closest('.nav-sub'), (e.pointerType === 'mouse' && hoverMode()) || sb.getAttribute('aria-expanded') !== 'true'); return; }
    // Un lien suivi : on referme tout (la page change, ou seulement l'ancre sur la même page).
    if (e.target.closest('a')) { closeMenus(header); setNavOpen(header, false); }
  });
  // Survol (ordinateur) : le menu s'ouvre à l'entrée, se ferme peu après la sortie.
  let leaveTimer = 0;
  // Pastille glissante : suit l'entrée survolée ou qui a le focus, revient sur la page affichée en sortant de la barre
  nav.addEventListener('pointerover', (e) => { const t = e.target.closest('.nav-top'); if (t) movePill(header, t); });
  // Menu « Jeux » : catalogue chargé à l'approche (souris, doigt, clavier), avant l'ouverture
  for (const ev of ['pointerover', 'pointerdown', 'focusin']) nav.addEventListener(ev, (e) => { if (e.target.closest('.nav-group[data-menu="jeux"]')) chargerJeux(header); });
  nav.addEventListener('pointerleave', () => movePill(header));
  nav.addEventListener('focusin', (e) => { const t = e.target.closest('.nav-top'); if (t) movePill(header, t); });
  nav.addEventListener('pointerover', (e) => {
    if (!hoverMode() || e.pointerType !== 'mouse') return;
    const g = e.target.closest('.nav-group');
    if (g) { clearTimeout(leaveTimer); if (!g.classList.contains('is-open')) { closeMenus(header, g); setMenu(g, true); } }
    const s = e.target.closest('.nav-sub');
    if (s && !s.classList.contains('is-open')) setSub(s, true);
  });
  nav.addEventListener('pointerout', (e) => {
    if (!hoverMode() || e.pointerType !== 'mouse') return;
    if (e.relatedTarget && nav.contains(e.relatedTarget) && e.relatedTarget.closest('.nav-group') === e.target.closest('.nav-group')) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => { if (!nav.querySelector('.nav-group:focus-within')) closeMenus(header); }, 250);
  });
  // Clavier : Échap referme et rend le focus au bouton ; flèches haut/bas parcourent les liens du menu ouvert.
  nav.addEventListener('keydown', (e) => {
    const g = e.target.closest('.nav-group');
    if (!g) return;
    if (e.key === 'Escape' && g.classList.contains('is-open')) {
      e.stopPropagation();
      setMenu(g, false);
      g.querySelector('.nav-top').focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (e.target.classList.contains('nav-top') && !g.classList.contains('is-open')) setMenu(g, true);
    const list = [...g.querySelectorAll('.nav-menu .nav-item')].filter((x) => x.offsetParent !== null);
    if (!list.length) return;
    e.preventDefault();
    const i = list.indexOf(e.target);
    const next = e.key === 'ArrowDown' ? list[(i + 1) % list.length] : list[(i - 1 + list.length) % list.length];
    next.focus();
  });
  // Le focus quitte un menu (Tab) : il se referme.
  nav.addEventListener('focusout', (e) => {
    const g = e.target.closest('.nav-group');
    if (g && !g.contains(e.relatedTarget)) setMenu(g, false);
  });
}
/** Écouteurs de la fenêtre posés une seule fois (l'en-tête peut être reconstruit) : ils visent l'en-tête courant. */
let _winBound = false;
function bindWindow() {
  if (_winBound) return;
  _winBound = true;
  const cur = () => document.querySelector('.site-header');
  // Clic hors de la barre : les menus déroulants se ferment.
  document.addEventListener('click', (e) => { const h = cur(); if (h && !h.querySelector('.nav')?.contains(e.target)) closeMenus(h); });
  window.addEventListener('resize', () => { const h = cur(); if (h?.classList.contains('fan-open')) layoutFan(h); if (h) movePill(h); });
  // Ancre changée sur la même page (ex. /pages/cartes/cartes.html#boutique) : le menu marque l'entrée courante.
  window.addEventListener('hashchange', () => { if (cur()) updateNav(); });
}

/* ---------- Photo de profil et menu en arc ---------- */

/**
 * Icônes du menu en arc, dans l'ordre (les trois premières forment la rangée proche de la photo).
 * L'entrée Admin est toujours présente mais masquée tant que les droits ne sont pas connus (updateNav).
 * @param {object} profile Profil courant.
 * @returns {string} HTML des entrées.
 */
function fanHtml(profile) {
  const item = (cls, tag, attrs, icon, label, extra = '') => `<li class="fan-li">
      <${tag} class="fan-item ${cls}" ${attrs}><span class="fan-ico">${icon}</span>${extra}<span class="fan-label">${esc(label)}</span></${tag}></li>`;
  return [
    item('nav-msg', 'a', `href="/pages/compte/messages.html"${curAttr('/pages/compte/messages.html')} aria-label="Messages"`, ICON_MSG, 'Messages', '<span class="nav-badge" hidden></span>'),
    // Statut et notifications : au téléphone seulement (le voyant de la photo n'est plus cliquable). Caché par layoutFan
    // sur ordinateur ; son libellé et son compteur sont tenus à jour par presence.js (peindreVoyant).
    item('nav-statut-open', 'button', 'type="button" aria-controls="notif-panel" aria-label="Statut et notifications" hidden', ICON_STATUT, 'Statut', '<span class="nav-badge" hidden></span>'),
    item('nav-search-open', 'button', 'type="button" aria-haspopup="dialog" aria-label="Rechercher (Ctrl ou Cmd + K)"', ICON_SEARCH, 'Recherche'),
    item('nav-account', 'a', `href="/pages/compte/compte.html"${curAttr('/pages/compte/compte.html')} aria-label="Mon compte"`, ICON_USER, 'Mon compte'),
    item('nav-help', 'a', `href="/pages/infos/aide.html"${curAttr('/pages/infos/aide.html')} aria-label="Aide et tutos"`, ICON_HELP, 'Aide et tutos'),
    item('prefs-open', 'button', 'type="button" aria-haspopup="dialog" aria-label="Préférences d’affichage"', ICON_PREFS, 'Affichage'),
    profile.is_admin && !viewAsActive() ? item('nav-god', 'button', 'type="button" aria-pressed="false" aria-label="Activer le mode sans limite"', ICON_BOLT, 'Sans limite') : '',
    item('nav-admin', 'a', `href="/pages/admin/admin.html"${curAttr('/pages/admin/admin.html')} hidden`, ICON_SHIELD, profile.is_admin ? 'Admin' : 'Staff'),
    // Changer de compte : masqué tant que les droits ne sont pas connus (syncComptes) ; la petite photo de l'autre compte y est posée
    item('nav-comptes', 'button', 'type="button" aria-haspopup="dialog" aria-controls="cc-panel" aria-expanded="false" aria-label="Changer de compte" hidden', ICON_COMPTES, 'Changer de compte'),
    item('nav-logout', 'button', 'type="button" aria-label="Se déconnecter"', ICON_DOOR, 'Déconnexion'),
  ].join('');
}

/** Rayons (px) des deux rangées et taille des boutons, selon la largeur d'écran. */
const fanGeom = () => (matchMedia('(max-width: 760px)').matches
  ? { telephone: true, r1: 96, pas: 92, size: 46 }   // téléphone : rangées de 3 sur des arcs concentriques (pas entre arcs)
  : { telephone: false, r1: 110, r2: 205, size: 52 });

/**
 * Place les icônes visibles en quart de cercle (vers le bas et la gauche) autour de la photo : 3 sur la rangée proche,
 * le reste sur la rangée extérieure, réparties de 0° (à gauche) à 90° (en bas).
 * @param {HTMLElement} header En-tête.
 */
function layoutFan(header) {
  const me = header.querySelector('.nav-me');
  const fan = header.querySelector('.me-fan');
  if (!me || !fan) return;
  const r = me.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const g = fanGeom();
  const { r1, size } = g;
  fan.style.setProperty('--fan-x', `${cx}px`);
  fan.style.setProperty('--fan-y', `${cy}px`);
  fan.style.setProperty('--fan-size', `${size}px`);
  // Entrée « Statut » : seulement au téléphone (même seuil que fanGeom et le menu replié)
  const statut = fan.querySelector('.nav-statut-open');
  if (statut) { const tel = !matchMedia('(min-width: 761px)').matches; statut.hidden = !tel; statut.closest('.fan-li').hidden = !tel; }
  const lis =[...fan.querySelectorAll('.fan-li')].filter((li) => !li.querySelector('.fan-item[hidden]'));
  // Bureau : 3 entrées près de la photo, le reste sur un second arc (inchangé).
  // Téléphone : 3 entrées par arc, arcs concentriques espacés de « pas » (le rayon grandit avec le nombre d'entrées).
  const rows = g.telephone
    ? Array.from({ length: Math.ceil(lis.length / 3) }, (_, k) => lis.slice(3 * k, 3 * k + 3))
    : [lis.slice(0, 3), lis.slice(3)];
  const rayon = (k) => (g.telephone ? r1 + k * g.pas : (k ? g.r2 : r1));
  fan.style.setProperty('--fan-r2', `${rayon(Math.max(0, rows.length - 1)) + size}px`);
  rows.forEach((row, k) => {
    const rad = rayon(k);
    row.forEach((li, i) => {
      const a = row.length > 1 ? (Math.PI / 2) * (i / (row.length - 1)) : Math.PI / 4;
      li.style.setProperty('--x', `${Math.round(cx - rad * Math.cos(a))}px`);
      li.style.setProperty('--y', `${Math.round(cy + rad * Math.sin(a))}px`);
      li.style.setProperty('--d', `${(k * 3 + i) * 18}ms`);
    });
  });
}

/**
 * Ouvre ou ferme le menu en arc. À l'ouverture, le focus va sur la première icône ; à la fermeture, il revient à la photo
 * (seulement si on fermait depuis l'arc, pour ne pas voler le focus après un clic ailleurs).
 * @param {HTMLElement} header En-tête.
 * @param {boolean} open true pour ouvrir.
 * @param {{focus?: boolean}} [o] focus : rendre le focus à la photo à la fermeture.
 */
function setFan(header, open, { focus = false } = {}) {
  const me = header.querySelector('.nav-me');
  const fan = header.querySelector('.me-fan');
  if (!me || !fan) return;
  if (open) {
    closeMenus(header);
    setNavOpen(header, false);
    if (!header.querySelector('.fan-item.nav-comptes')?.hidden) cssComptes();
    layoutFan(header);
  }
  fan.hidden = !open;
  me.setAttribute('aria-expanded', String(open));
  header.classList.toggle('fan-open', open);
  if (open) {
    requestAnimationFrame(() => fan.classList.add('is-in'));
    fan.querySelector('.fan-item:not([hidden])')?.focus({ preventScroll: true });
  } else {
    fan.classList.remove('is-in');
    if (focus) me.focus({ preventScroll: true });
  }
}

/** Contenu de la photo : avatar du membre (la pastille des non-lus est à côté), ou « Connexion » pour un visiteur. */
function meInner(profile) {
  // Étiquette « ADMIN » sous la photo (refonte Pixel Pop), hors vue « comme un membre »
  const tag = profile.is_admin && !viewAsActive() ? '<span class="nav-me-tag" aria-hidden="true">Admin</span>' : '';
  return `${avatarHtml(profile, 40)}<span class="nav-me-badge" hidden></span>${tag}`;
}

/* ---------- Mises à jour publiques ---------- */

/**
 * Met à jour la photo de l'en-tête (et le libellé du bouton). À appeler après une modification du profil.
 * @param {object|null} [profile] Profil à afficher (par défaut le profil en cache).
 */
export function updateHeaderProfile(profile = getCachedProfile()) {
  const me = document.querySelector('.site-header .nav-me');
  if (!me || !profile) return;
  const badge = me.querySelector('.nav-me-badge');
  const keep = badge && !badge.hidden ? badge.textContent : '';
  me.innerHTML = meInner(profile);
  if (keep) { const b = me.querySelector('.nav-me-badge'); b.hidden = false; b.textContent = keep; }
  me.setAttribute('aria-label', `Mon menu (${profile.pseudo})`);
}

/**
 * Remplit la barre de menus (appelée quand les pages accessibles sont connues) et l'entrée Admin du menu en arc.
 * Le bouton « Menu » (téléphone) est masqué s'il n'y a aucun menu à afficher.
 * @param {object|null} [profile] Profil courant (par défaut le profil en cache).
 */
export function updateNav(profile = getCachedProfile()) {
  const header = document.querySelector('.site-header');
  const nav = header?.querySelector('.nav');
  if (!nav) return;
  nav.innerHTML = navHtml(profile);
  requestAnimationFrame(() => movePill(header));
  suivrePastille(header);
  const toggle = header.querySelector('.nav-toggle');
  if (toggle) {
    toggle.hidden = !nav.querySelector('.nav-top');
    if (toggle.hidden) setNavOpen(header, false);
  }
  syncAdmin(header, profile);
}
/**
 * Entrée Admin du menu en arc : « Admin » pour l'admin, « Staff » pour qui a des droits partiels, masquée sinon.
 * @param {HTMLElement} header En-tête.
 * @param {object|null} profile Profil courant.
 */
function syncAdmin(header, profile) {
  const adm = header.querySelector('.fan-item.nav-admin');
  if (!adm || !profile) return;
  const panel = !viewAsActive() && (profile.is_admin || canPanel(getCachedPerms()));
  adm.hidden = !panel;
  adm.closest('.fan-li').hidden = !panel;
  adm.querySelector('.fan-label').textContent = profile.is_admin ? 'Admin' : 'Staff';
  adm.setAttribute('aria-label', profile.is_admin ? 'Admin' : 'Staff');
  syncComptes(header, profile);
}
/**
 * Entrée « Changer de compte » du menu en arc : pour l'admin et le Staff (comme l'entrée Admin), ou pour tout compte qui a déjà
 * un autre compte sur l'appareil (le compte de test ajouté par un admin, pour revenir). Masquée pendant la vue « comme un membre ».
 * Porte la petite photo de l'autre compte. Les styles (comptes.css) ne sont chargés qu'à l'ouverture du menu, ou tout de suite
 * s'il y a un autre compte (petite photo).
 * @param {HTMLElement} header En-tête.
 * @param {object|null} profile Profil courant.
 */
/** Ajoute la feuille comptes.css (une seule fois). */
function cssComptes() {
  if (document.querySelector('link[href$="/comptes.css"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('../comptes.css', import.meta.url).href;
  document.head.append(l);
}
function syncComptes(header, profile) {
  const it = header.querySelector('.fan-item.nav-comptes');
  if (!it || !profile) return;
  const autre = autresComptes()[0];
  const montre = !viewAsActive() && (!!autre || !!profile.is_admin || canPanel(getCachedPerms()));
  it.hidden = !montre;
  it.closest('.fan-li').hidden = !montre;
  it.querySelector('.cc-mini')?.remove();
  if (!montre) return;
  if (autre) cssComptes(); // petite photo de l'autre compte ; sinon, styles chargés à l'ouverture du menu (setFan)
  if (autre) it.querySelector('.fan-ico').insertAdjacentHTML('afterend', `<span class="cc-mini">${avatarHtml(autre, 26)}</span>`);
  it.setAttribute('aria-label', autre ? 'Changer de compte (2 comptes sur cet appareil)' : 'Changer de compte');
  if (header.classList.contains('fan-open')) layoutFan(header);
}
/**
 * Ouvre ou ferme le menu replié (760 px et moins). Met à jour aria-expanded du bouton « Menu ».
 * @param {HTMLElement} header Élément <header> de la page.
 * @param {boolean} open true pour ouvrir.
 */
function setNavOpen(header, open) {
  header.classList.toggle('nav-open', open);
  header.querySelector('.nav-toggle')?.setAttribute('aria-expanded', String(open));
}

/* ---------- Construction de l'en-tête ---------- */

/**
 * Calendrier de l'Avent : paquet cadeau dans la barre, pour un membre, du 30 novembre au 1er janvier seulement.
 * Hors saison, rien n'est chargé. La règle de date est celle de adventSeason() (espaces/accueil/avent-date.js),
 * recopiée ici pour ne charger aucun module hors saison.
 * @param {HTMLElement} header En-tête posé.
 */
function paquetAvent(header) {
  const d = new Date(), m = d.getMonth(), j = d.getDate();
  if (!(m === 11 || (m === 10 && j === 30) || (m === 0 && j === 1))) return;
  import('../../espaces/accueil/avent-gift.js').then((x) => x.mountGift(header)).catch(() => {});
}

/**
 * En-tête commun. nav:false -> la barre reste vide jusqu'à updateNav (pages accessibles pas encore connues).
 * Un visiteur voit seulement le logo, l'aide et le bouton « Connexion ». Remplace l'en-tête précédent s'il existe.
 * @param {object|null} profile Profil courant, ou null pour un visiteur.
 * @param {{nav?: boolean}} [options] nav : false pour laisser la barre vide au début.
 */
export function renderHeader(profile, { nav = true } = {}) {
  document.querySelector('.site-header')?.remove();
  const toggle = `<button class="nav-icon nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Menu" title="Menu" hidden>${ICON_MENU}</button>`;
  // Conteneur de la photo : presence.js y pose le voyant de statut (et le panneau des notifications) à côté de la photo.
  const right = profile
    ? `<span class="nav-me-wrap">
         <button class="nav-me" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="me-fan">${meInner(profile)}</button>
         <div class="me-fan" id="me-fan" hidden><div class="fan-scrim" aria-hidden="true"></div><div class="fan-disc" aria-hidden="true"></div>
           <ul class="fan-list" aria-label="Mon menu">${fanHtml(profile)}</ul></div>
       </span>`
    : `<a class="nav-icon nav-help" href="/pages/infos/aide.html"${curAttr('/pages/infos/aide.html')} aria-label="Aide et tutos" title="Aide et tutos">${ICON_HELP}</a>
       <a class="nav-account is-guest" href="/pages/compte/compte.html"${curAttr('/pages/compte/compte.html')}>Connexion</a>`;
  // Recherche en pastille « Rechercher Ctrl K » (ordinateur ; au téléphone elle reste dans le menu de la photo)
  const search = `<button class="nav-search-pill" type="button" aria-haspopup="dialog" aria-label="Rechercher (Ctrl ou Cmd + K)">${ICON_SEARCH}<span>Rechercher</span><kbd>Ctrl</kbd><kbd>K</kbd></button>`;
  const logo = logoAttrs();
  const header = document.createElement('header');
  header.className = 'site-header';
  header.innerHTML = `<a class="skip-link" href="#app">Aller au contenu</a>
    <div class="rainbow" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="container">
      <span class="nav-pill" aria-hidden="true" hidden></span>
      <a class="brand" href="/pages/compte/accueil.html"><img class="brand-logo" src="${esc(logo.src)}"${logo.srcset ? ` srcset="${esc(logo.srcset)}" sizes="44px"` : ''} width="44" height="44" alt=""><span>${esc(siteIdentite().nom.toUpperCase())}</span></a>
      <nav class="nav" id="site-nav" aria-label="Navigation principale">${nav ? navHtml(profile) : ''}</nav>
      <div class="nav-tools">${profile ? search : ''}${toggle}${right}</div>
    </div>`;
  // Cible du lien d'évitement : le contenu principal de la page (tabindex -1 : atteignable par script et par le lien)
  const main = document.getElementById('app');
  if (main && !main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
  document.body.prepend(header);
  if (profile) syncAdmin(header, profile);
  if (profile) paquetAvent(header);
  const tg = header.querySelector('.nav-toggle');
  tg.hidden = !header.querySelector('.nav .nav-top');
  tg.addEventListener('click', () => {
    const open = tg.getAttribute('aria-expanded') !== 'true';
    if (open) setFan(header, false);
    setNavOpen(header, open);
  });
  bindMenus(header);
  if (location.pathname.includes('/pages/jeux/')) chargerJeux(header); // pages Jeux : catalogue déjà chargé par la page
  bindWindow();
  header.querySelector('.nav-search-pill')?.addEventListener('click', ouvreRecherche);
  requestAnimationFrame(() => movePill(header));
  suivrePastille(header);
  // Échap : ferme le menu en arc, sinon le menu replié, et rend le focus au bouton qui les a ouverts
  header.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (header.classList.contains('fan-open')) { setFan(header, false, { focus: true }); return; }
    if (tg.getAttribute('aria-expanded') === 'true') { setNavOpen(header, false); tg.focus(); }
  });
  bindShortcuts(profile); // « g » puis une lettre, « / », « ? » (idée Q8 ; rien sur /pages/admin/admin.html)
  if (!profile) return;

  // Menu en arc : la photo l'ouvre et le ferme ; un clic sur le voile, une icône suivie ou le focus qui sort le referme.
  const me = header.querySelector('.nav-me');
  const fan = header.querySelector('.me-fan');
  if (reducedMotion()) fan.classList.add('no-anim');
  me.addEventListener('click', () => setFan(header, me.getAttribute('aria-expanded') !== 'true'));
  fan.querySelector('.fan-scrim').addEventListener('click', () => setFan(header, false, { focus: true }));
  fan.addEventListener('click', (e) => {
    const it = e.target.closest('.fan-item');
    if (!it) return;
    // Recherche, affichage, mode sans limite : leur dialogue s'ouvre, l'arc se ferme sans reprendre le focus.
    // Statut : l'arc se ferme, c'est presence.js qui ouvre le panneau des notifications (clic délégué sur le document).
    if (it.matches('.prefs-open, .nav-god, .nav-search-open, .nav-statut-open, .nav-comptes, a')) setFan(header, false);
    // Changer de compte : panneau « Comptes sur cet appareil », sous la photo (comptes.js, chargé à la demande)
    if (it.matches('.nav-comptes')) import('./comptes.js').then((m) => m.ouvrirPanneau()).catch((x) => console.warn('[comptes]', x?.message || x));
  });
  // Compte ajouté ou retiré (comptes.js) : l'entrée et sa petite photo sont mises à jour
  window.addEventListener('hg:comptes', () => { const h = document.querySelector('.site-header'); if (h) syncComptes(h, getCachedProfile()); });
  fan.addEventListener('focusout', (e) => {
    if (header.classList.contains('fan-open') && e.relatedTarget && !fan.contains(e.relatedTarget) && e.relatedTarget !== me) setFan(header, false);
  });
  // Flèches : passer d'une icône à l'autre dans l'arc.
  fan.addEventListener('keydown', (e) => {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const list = [...fan.querySelectorAll('.fan-item:not([hidden])')];
    const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? 1 : -1;
    list[(i + step + list.length) % list.length].focus();
  });
  // Le contenu de la photo est écrasé par une page (ancien comportement de compte.js) : on le remet.
  new MutationObserver(() => { if (!me.querySelector('.avatar')) updateHeaderProfile(); }).observe(me, { childList: true });

  header.querySelector('.prefs-open').addEventListener('click', openPrefs);
  // Bouton mode sans limite : coupe si actif, ouvre le dialogue d'activation sinon
  header.querySelector('.nav-god')?.addEventListener('click', (e) => {
    if (isGodMode()) disableGodMode(e.currentTarget);
    else openGodDialog(e);
  });
  paintGod();
  bindRechercheLien(header);
  // Déconnexion : on coupe la session (cet appareil seulement), on oublie les droits et les badges vus pour cette session,
  // puis on va à la page de connexion. Avec deux comptes sur l'appareil, comptes.js demande lequel déconnecter.
  header.querySelector('.nav-logout').addEventListener('click', async (e) => {
    if (autresComptes().some((a) => a.rt)) { setFan(header, false); (await import('./comptes.js')).deconnexion(); return; }
    const b = e.currentTarget; b.disabled = true;
    await signOutDevice(); // retire aussi l'abonnement push de l'appareil
    try { sessionStorage.removeItem('hg_badges_checked'); } catch {}
    // Q4 : copie hors ligne de la collection et images des cartes effacées (téléphone prêté, ordinateur partagé)
    try { await (await import('../offline-store.js')).clearOffline(); } catch { /* rien à effacer */ }
    clearPerms();
    location.href = '/pages/compte/compte.html';
  });
}
