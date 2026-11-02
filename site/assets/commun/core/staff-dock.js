// ===== Humane Gang — raccourcis Staff : barre à gauche (admin et Staff, sur toutes les pages sauf /pages/admin/admin.html) =====
/*
 * Rôle : donne aux admins et au Staff un accès direct à cinq sections du panel (Assistance, Boîte à idées, Bot Discord,
 * Drops de cartes, Événement de cartes). Chacun choisit les siens (« Choisir mes raccourcis »). Seuls les raccourcis que
 * la personne peut ouvrir sont proposés : le droit vient de canSection (droits-sections.js), comme dans le panel.
 * Pas affiché sur /pages/admin/admin.html, ni quand l'admin regarde le site « comme un membre » (view-as.js).
 *   Ordinateur (à partir de 720 px) : barre verticale fixe à gauche, étroite, icônes toujours visibles ; le nom de chaque
 *   raccourci sort en bulle à droite de l'icône au survol ou au focus clavier. Le contenu est décalé (html[data-staff-dock] body).
 *   Téléphone (moins de 720 px) : bouton flottant en bas à gauche ; il ouvre la liste au-dessus de lui (Échap ferme).
 * Compteurs : Assistance (demandes « ouverte ») et Boîte à idées (idées « nouvelle ») : une requête de comptage seule,
 * à l'ouverture de la page (même critères que le panel, admin/counts.js). Sans recalcul en direct.
 * Choix : localStorage « hg_staff_dock:<user_id> » = { choix: [identifiants] }.
 * Par défaut : tous les raccourcis permis. Lecture et écriture protégées (stockage bloqué = pas de mémoire).
 * Styles : assets/commun/staff-dock.css, chargée par ce module (les membres simples ne la chargent jamais).
 * Page : toutes les pages (init.js appelle startStaffDock avec le profil connecté). Pas /pages/admin/admin.html.
 * Dépendances : supabase.js (comptages), pages-access.js (page courante), perms.js (droits en cache, canPanel),
 *   droits-sections.js (canSection, mêmes droits que le panel), view-as.js (vue « comme un membre »).
 * Exporte : startStaffDock.
 */
import { sb } from './supabase.js';
import { currentPageSlug } from './pages-access.js';
import { getCachedPerms, canPanel } from './perms.js';
import { canSection } from './droits-sections.js'; // droits seuls, sans les lieux du panel (admin/perms.js)
import { viewAsActive } from './view-as.js';

/* ---------- Constantes ---------- */

/** Feuille de style du module, résolue par rapport à ce fichier (fonctionne sous un préfixe GitHub Pages). */
const CSS_HREF = new URL('../staff-dock.css', import.meta.url).href;

/**
 * Raccourcis possibles. section : section du panel (droits = canSection). href : adresse du panel (lieu/sous-section,
 * voir admin/perms.js LIEUX). compte : clé des compteurs « à traiter » (voir chargerComptes). Les libellés sont ceux
 * des tuiles du panel, sauf « Événement de cartes » (section Événements à thème, où se règlent les captures de cartes).
 */
const RACCOURCIS = [
  { id: 'assistance', label: 'Assistance', section: 'assistance', href: '/pages/admin/admin.html#poste/assistance', icone: 'lifebuoy', compte: 'assistance' },
  { id: 'idees', label: 'Boîte à idées', section: 'idees', href: '/pages/admin/admin.html#poste/idees', icone: 'bulb', compte: 'idees' },
  { id: 'bot', label: 'Bot Discord', section: 'bot', href: '/pages/admin/admin.html#poste/bot', icone: 'robot' },
  { id: 'drops', label: 'Drops de cartes', section: 'drops', href: '/pages/admin/admin.html#fabrique/drops', icone: 'gift' },
  { id: 'evenements', label: 'Événement de cartes', section: 'evenements', href: '/pages/admin/admin.html#fete/evenements', icone: 'sparkle' },
];

/** Tracés des icônes (viewBox 0 0 24 24, trait courant). Définis ici pour ne pas dépendre de icons.js (qui n'a pas tous ces noms). */
const PICTO = {
  lifebuoy: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M5.6 5.6l3.3 3.3M15.1 15.1l3.3 3.3M18.4 5.6l-3.3 3.3M8.9 15.1l-3.3 3.3"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  robot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 16.5h6"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8S9 3.5 7.5 5.5 9 8 12 8zM12 8s3-4.5 4.5-2.5S15 8 12 8z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

/* ---------- Fabriques de HTML ---------- */

/**
 * Icône SVG décorative (aria-hidden) d'un nom de PICTO.
 * @param {string} nom Clé de PICTO.
 * @returns {string} Balise <svg>.
 */
function ico(nom) {
  return `<svg class="sd-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PICTO[nom] || ''}</svg>`;
}

/* ---------- Préférences (localStorage, par membre) ---------- */

/**
 * Clé localStorage du membre.
 * @param {string} uid Identifiant du membre.
 * @returns {string}
 */
const cle = (uid) => `hg_staff_dock:${uid}`;

/**
 * Lit les préférences du membre. Renvoie null si absentes ou illisibles.
 * @param {string} uid Identifiant du membre.
 * @returns {{choix?: unknown}|null}
 */
function lirePrefs(uid) {
  try {
    const v = JSON.parse(localStorage.getItem(cle(uid)) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}

/**
 * Écrit les préférences du membre. Un échec n'est pas grave : le choix vaut alors pour cette page seulement.
 * @param {string} uid Identifiant du membre.
 * @param {{choix: string[]}} v Préférences à garder.
 */
function ecrirePrefs(uid, v) {
  try { localStorage.setItem(cle(uid), JSON.stringify(v)); } catch { /* stockage bloqué : rien à garder */ }
}

/* ---------- Compteurs ---------- */

/**
 * Compteurs « à traiter » des raccourcis que la personne peut voir. Une requête de comptage par compteur, sans charger
 * les lignes. Un compteur qui échoue reste absent (le raccourci s'affiche sans chiffre).
 * @returns {Promise<{assistance?: number, idees?: number}>}
 */
async function chargerComptes() {
  const out = {};
  const jobs = [];
  if (canSection('assistance')) {
    jobs.push(sb.from('hg_support').select('id', { count: 'exact', head: true }).eq('status', 'ouverte')
      .then((r) => { if (r.error) throw r.error; out.assistance = r.count ?? 0; }));
  }
  if (canSection('idees')) {
    jobs.push(sb.from('hg_ideas').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle')
      .then((r) => { if (r.error) throw r.error; out.idees = r.count ?? 0; }));
  }
  await Promise.all(jobs.map((p) => p.catch((e) => console.warn('[raccourcis Staff]', e?.message || e))));
  return out;
}

/* ---------- Construction et affichage ---------- */

/**
 * Construit la barre (nav) et la fenêtre de choix. Les raccourcis permis sont les seuls créés.
 * @param {Array<object>} permis Raccourcis que la personne peut ouvrir (sous-ensemble de RACCOURCIS).
 * @returns {{nav: HTMLElement, dialog: HTMLDialogElement}}
 */
function construire(permis) {
  const nav = document.createElement('nav');
  nav.id = 'staff-dock';
  nav.className = 'sd';
  nav.setAttribute('aria-label', 'Raccourcis Staff');
  const items = permis.map((r) => `<li data-id="${r.id}"><a href="${r.href}">${ico(r.icone)}<span class="sd-label">${r.label}</span><span class="sd-count" hidden></span></a></li>`).join('');
  nav.innerHTML = `
    <button type="button" class="sd-fab" aria-expanded="false" aria-controls="sd-body" aria-label="Ouvrir les raccourcis Staff" title="Raccourcis Staff">${ico('sliders')}<span class="sd-fab-n" hidden></span></button>
    <div class="sd-body" id="sd-body">
      <ul class="sd-links" id="sd-links">${items}</ul>
      <button type="button" class="sd-config" aria-haspopup="dialog" aria-controls="sd-dialog">${ico('sliders')}<span class="sd-label">Choisir mes raccourcis</span></button>
    </div>`;
  const dialog = document.createElement('dialog');
  dialog.id = 'sd-dialog';
  dialog.className = 'sd-dialog';
  dialog.setAttribute('aria-labelledby', 'sd-dlg-h');
  dialog.innerHTML = `
    <form method="dialog" class="sd-dlg-form">
      <h2 id="sd-dlg-h">Mes raccourcis Staff</h2>
      <p class="sd-dlg-note">Coche les raccourcis à afficher. Ton choix ne vaut que pour ce navigateur.</p>
      <fieldset class="sd-dlg-set">
        <legend class="sd-dlg-leg">Raccourcis disponibles</legend>
        ${permis.map((r) => `<label class="sd-opt"><input type="checkbox" name="sd-pick" value="${r.id}"> <span>${r.label}</span></label>`).join('')}
      </fieldset>
      <div class="sd-dlg-actions"><button type="submit" class="sd-dlg-ok">Fermer</button></div>
    </form>`;
  return { nav, dialog };
}

/**
 * Ajoute la feuille de style du module, une seule fois.
 */
function chargerCss() {
  if (document.querySelector('link[data-staff-dock]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = CSS_HREF;
  l.dataset.staffDock = '';
  document.head.append(l);
}

/** Pages de partie (plateaux, jeux de cartes, quiz) : pas de bouton flottant sur téléphone. */
const PAGES_PARTIE = new Set(['blackjack', 'catan', 'cluedo', 'destins', 'duels', 'loup-garou', 'monopoly', 'nom-de-code', 'pictionary', 'poker', 'quiz', 'risk', 'shadow-hunters', 'uno', 'simulateur']);

/**
 * Lance le panneau Staff sur la page, si la personne a accès au panel et n'est pas en vue « comme un membre ».
 * Les droits sont déjà en cache (init.js attend loadMyPerms). Ne lève jamais d'erreur vers la page.
 * @param {object|null} profil Profil connecté (null pour un visiteur).
 * @returns {Promise<void>}
 */
export async function startStaffDock(profil) {
  if (!profil || currentPageSlug() === 'admin' || viewAsActive()) return;
  if (!canPanel(getCachedPerms())) return;
  const permis = RACCOURCIS.filter((r) => canSection(r.section));
  if (!permis.length || document.getElementById('staff-dock')) return;

  chargerCss();
  /* Pages de partie : sur téléphone, le bouton flottant recouvrirait les actions du jeu (masqué en CSS) */
  if (PAGES_PARTIE.has(currentPageSlug())) document.documentElement.dataset.sdPartie = '';
  const uid = profil.id;
  const prefs = lirePrefs(uid) || {};
  const valides = permis.map((r) => r.id);
  const etat = {
    // Sans choix enregistré, tous les raccourcis permis sont affichés ; un choix vide reste un choix (barre sans liens)
    choix: Array.isArray(prefs.choix) ? prefs.choix.filter((id) => valides.includes(id)) : valides.slice(),
  };

  const { nav, dialog } = construire(permis);
  document.body.append(nav, dialog);
  const fab = nav.querySelector('.sd-fab');
  const config = nav.querySelector('.sd-config');
  const comptes = { };

  /** Redessine la barre et la fenêtre à partir de l'état (sans requête). */
  const appliquer = () => {
    document.documentElement.dataset.staffDock = 'on';
    let total = 0;
    for (const li of nav.querySelectorAll('.sd-links li')) {
      const r = RACCOURCIS.find((x) => x.id === li.dataset.id);
      li.hidden = !etat.choix.includes(li.dataset.id);
      const n = r?.compte ? comptes[r.compte] : undefined;
      const badge = li.querySelector('.sd-count');
      if (!li.hidden && n > 0) { total += n; badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = false; badge.setAttribute('aria-label', `${n} à traiter`); } else { badge.hidden = true; }
    }
    for (const box of dialog.querySelectorAll('input[name="sd-pick"]')) box.checked = etat.choix.includes(box.value);
    const fabN = nav.querySelector('.sd-fab-n');
    fabN.hidden = total === 0;
    fabN.textContent = total > 99 ? '99+' : String(total);
    ecrirePrefs(uid, { choix: etat.choix.slice() });
  };

  /**
   * Ouvre ou ferme la liste sur téléphone (le bouton flottant est caché sur ordinateur).
   * @param {boolean} ouvert Vrai pour ouvrir.
   */
  const liste = (ouvert) => {
    nav.dataset.open = ouvert ? '1' : '0';
    fab.setAttribute('aria-expanded', String(ouvert));
  };

  fab.addEventListener('click', () => liste(fab.getAttribute('aria-expanded') !== 'true'));
  config.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  });
  dialog.addEventListener('change', (e) => {
    const box = e.target;
    if (!(box instanceof HTMLInputElement) || box.name !== 'sd-pick') return;
    etat.choix = [...dialog.querySelectorAll('input[name="sd-pick"]:checked')].map((b) => b.value).filter((id) => valides.includes(id));
    appliquer();
  });
  // Fermer la fenêtre rend le focus au bouton « Choisir mes raccourcis »
  dialog.addEventListener('close', () => config.focus());
  // Échap : referme la liste sur téléphone (et rend le focus au bouton), sinon retire le focus de la barre
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (nav.dataset.open === '1' && getComputedStyle(fab).display !== 'none') { liste(false); fab.focus(); }
    else if (nav.contains(document.activeElement)) document.activeElement.blur();
  });
  // Téléphone : toucher à côté de la liste la referme
  document.addEventListener('pointerdown', (e) => {
    if (nav.dataset.open === '1' && !nav.contains(e.target)) liste(false);
  });

  appliquer();
  // Compteurs : après l'affichage, sans retarder la barre
  chargerComptes().then((c) => { Object.assign(comptes, c); appliquer(); }).catch((e) => console.warn('[raccourcis Staff]', e));
}
