// Accès aux pages (tables hg_pages / hg_page_access, rpc hg_my_pages).
// Contrôle d'INTERFACE : masque les liens et renvoie vers l'accueil. Les données restent protégées par les
// règles de la base. Les pages non déclarées dans hg_pages (compte, legal, assistance, rejoindre, admin…)
// ne sont pas concernées. En cas d'échec réseau, rien n'est bloqué.
/*
 * Rôle : sait quelles pages le membre connecté peut voir (réglages « accès aux pages » de l'administration),
 * pour construire le menu et renvoyer vers l'accueil une page interdite.
 * Page : toutes les pages (init.js charge la liste puis contrôle la page courante).
 * Dépendances : supabase.js (requêtes), profile.js (savoir si l'on est admin : accès total).
 * Données : table hg_pages (liste déclarée), RPC hg_my_pages (mes pages accessibles). Pendant une vue « comme un membre »
 * (view-as.js), ce sont les pages de ce membre, et l'admin n'a plus l'accès total.
 * Mémoire d'affichage (memoire.js) : primerPages pose les pages gardées avant la relecture ; loadMyPages les garde après.
 * Exporte : currentPageSlug, loadMyPages, primerPages, getMyPages, canAccess, pageLabel, pageMode.
 */
import { sb, hasSession, isNavCancel } from './supabase.js';
import { getCachedProfile } from './profile.js';
import { viewAsActive, viewAsState } from './view-as.js';
import { memoEcrire } from './memoire.js';

/* ---------- État interne ---------- */

/** Données chargées : { declared: Map slug -> page déclarée, mine: liste de mes pages, set: slugs accessibles }. null = inconnu. */
let _pages = null; // { declared: Map slug -> {slug,label,mode,in_nav,sort}, mine: [{slug,label,in_nav,sort}], set: Set }
/** Promesse du chargement en cours, pour ne lancer qu'une seule requête à la fois. */
let _pagesLoading = null;
/** Forme d'un slug valide : minuscules, chiffres et tirets, sans point ni espace. */
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
/**
 * Extrait le slug d'un chemin, d'une URL ou d'un nom de fichier : retire la query, l'ancre, le dossier et « .html ».
 * @param {string|null|undefined} s Par exemple '/irl.html?x=1' ou 'irl'.
 * @returns {string} Par exemple 'irl'.
 */
const slugOf = (s) => String(s ?? '').split(/[?#]/)[0].split('/').pop().replace(/\.html$/, '');

/** Dossier de chaque page publiée : /pages/<dossier>/<slug>.html. Une page absente de cette table part de /pages/<slug>.html. */
const PAGE_DIR = {
  accueil: 'compte', compte: 'compte', membre: 'compte', messages: 'compte', notifications: 'compte',
  admin: 'admin',
  cartes: 'cartes', 'collection-a4': 'cartes',
  aide: 'infos', assistance: 'infos', legal: 'infos', rejoindre: 'infos',
  calendrier: 'irl', cine: 'irl', citations: 'irl', evenements: 'irl', historique: 'irl', irl: 'irl',
  playlist: 'irl', recap: 'irl', 'secret-santa': 'irl',
  blackjack: 'jeux', catan: 'jeux', cluedo: 'jeux', destins: 'jeux', duels: 'jeux', jeux: 'jeux',
  'loup-garou': 'jeux', monopoly: 'jeux', 'nom-de-code': 'jeux', pictionary: 'jeux', poker: 'jeux', quiz: 'jeux',
  risk: 'jeux', secret: 'jeux', 'shadow-hunters': 'jeux', simulateur: 'jeux', uno: 'jeux',
};
/**
 * Adresse absolue d'une page publiée (ex. 'irl' -> '/pages/irl/irl.html').
 * @param {string} slug Slug ou nom de fichier de la page.
 * @returns {string}
 */
export function pageHref(slug) {
  const s = slugOf(slug);
  return `/pages/${PAGE_DIR[s] ? `${PAGE_DIR[s]}/` : ''}${s}.html`;
}

/* ---------- Page courante ---------- */

/**
 * Slug de la page courante (nom du fichier sans .html ; 'accueil' pour la racine).
 * @returns {string} Par exemple 'irl' ou 'accueil'.
 */
export function currentPageSlug() { return slugOf(location.pathname) || 'accueil'; }

/* ---------- Chargement ---------- */

/**
 * Construit l'état des pages à partir des listes reçues (déclarées, mes pages triées).
 * @param {Array<object>} declared Pages déclarées (hg_pages).
 * @param {Array<object>} mine Mes pages accessibles.
 * @returns {object} État à garder dans _pages.
 */
function poser(declared, mine) {
  const list = (Array.isArray(mine) ? mine : []).filter((p) => p && SLUG_RE.test(p.slug))
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  return {
    declared: new Map((Array.isArray(declared) ? declared : []).map((p) => [p.slug, p])),
    mine: list,
    set: new Set(list.map((p) => p.slug)),
  };
}
/**
 * Pose les pages gardées en mémoire (memoire.js) comme état courant, sans requête. loadMyPages les relit ensuite.
 * @param {{declared: Array<object>, mine: Array<object>}} v Valeur gardée.
 */
export function primerPages(v) {
  _pages = poser(v?.declared, v?.mine);
}
/**
 * Charge (une fois par page) les pages déclarées et mes pages accessibles. Ne jette jamais ; renvoie mes pages ou null.
 * Un échec de relecture garde l'état précédent (la mémoire, s'il y en a une) au lieu de tout ouvrir.
 * Les appels suivants renvoient la même promesse, sauf avec { force: true }.
 * @param {{force?: boolean}} [options] force : recharge même si un chargement a déjà eu lieu.
 * @returns {Promise<Array<object>|null>} Mes pages, ou null si inconnues.
 */
export function loadMyPages({ force = false } = {}) {
  if (_pagesLoading && !force) return _pagesLoading;
  _pagesLoading = (async () => {
    try {
      if (!(await hasSession())) return getMyPages(); // sans session : rien à charger (hg_my_pages est réservée aux membres)
      const va = viewAsActive() ? viewAsState() : null; // vue « comme un membre » : ses pages, pas les miennes
      const [all, mine] = await Promise.all([
        sb.from('hg_pages').select('slug, label, mode, in_nav, sort'),
        va ? Promise.resolve({ data: va.pages, error: null }) : sb.rpc('hg_my_pages'),
      ]);
      if (all.error) throw all.error;
      if (mine.error) throw mine.error;
      // On ignore les entrées mal formées ; l'ordre d'affichage suit le champ sort
      _pages = poser(all.data, mine.data);
      // Mémoire d'affichage : la liste relue sert au prochain démarrage (pas pendant une vue « comme un membre »)
      if (!va) memoEcrire('pages', { declared: all.data ?? [], mine: Array.isArray(mine.data) ? mine.data : [] });
    } catch (e) {
      if (!isNavCancel(e)) console.warn('[accès aux pages]', e?.message || e);
      // Accès inconnus : sans état précédent, canAccess laisse tout passer ; avec la mémoire, on garde ce qu'on sait
    }
    return getMyPages();
  })();
  return _pagesLoading;
}

/* ---------- Lecture ---------- */

/**
 * Mes pages accessibles [{slug,label,in_nav,sort}] triées, ou null si inconnues (non connecté, échec réseau).
 * Renvoie des copies : modifier le résultat ne change pas l'état.
 * @returns {Array<object>|null}
 */
export function getMyPages() { return _pages ? _pages.mine.map((p) => ({ ...p })) : null; }
/**
 * Ai-je accès à cette page ? (slug ou nom de fichier). true si la page n'est pas déclarée ou si les accès sont inconnus.
 * Un admin a toujours accès. Une page absente de hg_pages n'est jamais bloquée (compte, aide, légal...).
 * @param {string} slug Slug ou nom de fichier de la page.
 * @returns {boolean}
 */
export function canAccess(slug) {
  const s = slugOf(slug);
  if (!_pages || (!viewAsActive() && getCachedProfile()?.is_admin)) return true;
  if (!_pages.declared.has(s)) return true;
  return _pages.set.has(s);
}
/**
 * Libellé d'une page déclarée (ou '').
 * @param {string} slug Slug ou nom de fichier de la page.
 * @returns {string}
 */
export function pageLabel(slug) { return _pages?.declared.get(slugOf(slug))?.label || ''; }
/**
 * Mode d'accès d'une page déclarée ('membres', 'liste', 'admin'…), ou '' si inconnue.
 * @param {string} slug Slug ou nom de fichier de la page.
 * @returns {string}
 */
export function pageMode(slug) { return _pages?.declared.get(slugOf(slug))?.mode || ''; }
