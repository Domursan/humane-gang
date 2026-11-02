/* Service worker du Humane Gang : mode hors ligne (coque du site et derniers contenus lus).
   - Pages (navigation) : réseau d'abord ; sans réponse au bout de 3 s, la copie en cache (le réseau la met à jour en
     arrière-plan) ; en cas d'échec, la copie en cache puis /offline.html.
   - Fichiers immuables (morceaux et feuilles regroupés nommés par empreinte, bibliothèques vendorées versionnées) :
     cache d'abord, jamais revérifiés (une nouvelle version porte une autre adresse).
   - Autre code du site (/assets/**.js, .css, .json) : réseau d'abord, avec revalidation (cache: no-cache) ; la copie en
     cache ne sert que hors ligne. Une page et ses modules restent ainsi de la même version.
   - Autres fichiers du site (/assets/ : images, polices, sons) : copie en cache servie tout de suite, mise à jour en
     arrière-plan (stale-while-revalidate) ; une nouvelle version est utilisée dès le chargement suivant.
   - Bibliothèque jsDelivr épinglée (/npm/, version exacte x.y.z) : cache d'abord ; seules les réponses lisibles et réussies
     (pas les réponses « opaques », dont le statut est inconnu) sont gardées, sauf pour PRECACHE_REMOTE.
   - Pages : la copie en cache est rangée sous l'adresse sans paramètres (?code=, ?c=, ?u=…), pour ne garder ni code
     d'invitation ni identifiant dans le cache.
   - Supabase (données, authentification, fonctions) : jamais interceptée, jamais mise en cache.
     Seule exception (Q4, collection hors ligne) : les images PUBLIQUES des cartes (/storage/v1/object/public/hg-assets/cards/,
     sans jeton ni donnée privée) passent par un cache séparé « hg-cartes-img », servi en premier, plafonné à 1 500 images
     (les plus anciennes partent). Ce cache est rempli aussi par la page Cartes et effacé à la déconnexion.
     Les illustrations des cartes servies par le site (/assets/cartes/) suivent la même stratégie, dans le même cache.
   CACHE_VERSION : incrémenter à chaque changement de JS ou CSS du site ; la publication l'incrémente aussi dans sa copie
   (outils/build/construire.mjs). Règle unique, la même que dans PLAN-DU-DEPOT.md. */

/* ---------- Constantes ---------- */

// Nom du cache : préfixe commun + version. Les caches des anciennes versions (même préfixe) sont supprimés à l'activation.
const CACHE_VERSION = 'v156';
const CACHE_PREFIX = 'hg-coque-';
const CACHE = `${CACHE_PREFIX}${CACHE_VERSION}`;
// Q4 : images des cartes (même nom et même plafond que assets/commun/offline-store.js). Hors du préfixe : gardé d'une version à l'autre.
const IMG_CACHE = 'hg-cartes-img';
const IMG_MAX = 1500;
const CARD_IMG_PATH = '/storage/v1/object/public/hg-assets/cards/';
// Illustrations des cartes rangées dans le site (même cache IMG_CACHE que ci-dessus).
const LOCAL_CARD_PATH = '/assets/cartes/';
// Fichiers dont l'adresse change avec le contenu (outils/build/construire.mjs) : morceaux esbuild <nom>-<empreinte 8>.js,
// feuilles regroupées <sha1 8 hex>.css, bibliothèques vendorées <nom>-<x.y.z>.(m)js.
const IMMUABLE = /^\/assets\/(?:_b\/chunks\/[^/]+-[A-Z0-9]{8}\.js|_b\/css\/[0-9a-f]{8}\.css|vendor\/[^/]+-\d+\.\d+\.\d+\.m?js)$/;
// Navigation : au-delà de ce délai sans réponse du réseau, la copie en cache de la page est servie (si elle existe).
const NAV_DELAI_MS = 3000;

/* ---------- Liste de précache (la coque) ----------
   Fichiers téléchargés à l'installation, pour que le site s'ouvre hors ligne dès la première fois : les pages de la coque
   (accueil, compte, aide, hors ligne, 404, intro) et ce qu'elles chargent au démarrage. La construction
   (outils/build/construire.mjs, section 6) ajoute à cette liste les feuilles, scripts, préchargements et images de ces
   pages (ni icônes ni manifeste). Tout le reste est mis en cache à la première visite (réseau d'abord, voir fetch) :
   pages, modules, feuilles, images, et cartes (illustrations servies par le site comprises). Le panel admin n'est jamais
   précaché pour un membre. Chemins relatifs à la racine du site.
   Un fichier ajouté au site et nécessaire hors ligne dès l'installation doit être ajouté ici. */
const PRECACHE = [
  '/index.html', '/404.html', '/offline.html', '/pages/compte/accueil.html', '/pages/compte/compte.html', '/pages/infos/aide.html',
  '/sw.js',
  // Feuilles que le socle commun ajoute pendant l’exécution, pour tous les membres (pas de balise dans les pages).
  // Les feuilles ajoutées seulement quand elles servent (raccourcis Staff, bandeau d’état) ne sont pas ici.
  '/assets/commun/en-ligne.css', '/assets/commun/notifs.css',
  // Logo de la marque (en-tête des pages de la coque).
  '/assets/images/marque/logo-96.webp', '/assets/images/marque/logo-192.webp',
  // Polices (hébergées dans assets/fonts, plus de Google Fonts)
  '/assets/fonts/archivo-black-latin.woff2', '/assets/fonts/inter-latin-400.woff2', '/assets/fonts/inter-latin-500.woff2', '/assets/fonts/inter-latin-700.woff2',
  '/assets/fonts/silkscreen-400.woff2',
];

// Bibliothèque versionnée (épinglée) : mise en cache si le réseau le permet, sans bloquer l'installation.
const PRECACHE_REMOTE = []; // vide : plus aucune bibliothèque externe épinglée (tout est dans assets/vendor)

/* ---------- Cycle de vie : installation et activation ---------- */

/** Installation : remplit le cache avec la liste PRECACHE puis prend la main sans attendre la fermeture des onglets. */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Un fichier absent ne doit pas faire échouer toute l'installation.
    await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
    await Promise.allSettled(PRECACHE_REMOTE.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

/** Activation : supprime les anciens caches du site (même préfixe, autre version) puis contrôle les onglets ouverts. */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

/* ---------- Interception des requêtes (fetch) ----------
   Choisit la stratégie selon le type de requête. Une requête sans stratégie passe directement au réseau. */

/** Gestionnaire fetch : classe chaque requête GET et choisit la stratégie de cache correspondante. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Images publiques des cartes (Q4) : cache séparé, servi en premier (le nom de fichier change à chaque nouvelle image).
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith(CARD_IMG_PATH) && !url.search) {
    event.respondWith(cardImage(req, event));
    return;
  }
  // Données et authentification : toujours en direct.
  if (url.hostname.endsWith('.supabase.co')) return;

  const sameOrigin = url.origin === self.location.origin;

  if (req.mode === 'navigate' && sameOrigin) {
    event.respondWith(networkFirst(req, false, event, NAV_DELAI_MS));
    return;
  }

  // Illustrations des cartes servies par le site (/assets/cartes/, 4 135 fichiers) : même stratégie que les images
  // de Supabase (cache hg-cartes-img, servi en premier, plafonné à IMG_MAX).
  if (sameOrigin && url.pathname.startsWith(LOCAL_CARD_PATH)) { event.respondWith(cardImage(req, event)); return; }

  // Fichiers immuables (morceaux et feuilles nommés par empreinte, bibliothèques vendorées versionnées) : leur contenu
  // ne change jamais sous la même adresse, inutile de les revérifier à chaque chargement.
  if (sameOrigin && IMMUABLE.test(url.pathname)) { event.respondWith(cacheFirst(req)); return; }
  // Code (JS, CSS) : toujours la version en ligne quand le réseau répond, pour que la page et ses modules
  // restent de la même version après une mise à jour ; le cache ne sert qu'hors ligne.
  if (sameOrigin && url.pathname.includes('/assets/') && /\.(m?js|css|json)$/.test(url.pathname)) { event.respondWith(networkFirst(req, true)); return; }
  // Images, polices, sons : le cache d'abord, rafraîchi en arrière-plan.
  if (sameOrigin && url.pathname.includes('/assets/')) { event.respondWith(staleWhileRevalidate(req, event)); return; }
  if (isPinnedLibrary(url)) event.respondWith(cacheFirst(req));
});

/* ---------- Stratégies de cache ---------- */

/**
 * Fichier jsDelivr d'une version exacte (ex. /npm/@supabase/auth-js@2.65.0/+esm) : son contenu ne change pas.
 * Une adresse sans version exacte (plage, « latest », /gh/…) n'est jamais mise en cache.
 * @param {URL} url Adresse demandée.
 * @returns {boolean}
 */
function isPinnedLibrary(url) {
  return url.origin === 'https://cdn.jsdelivr.net' && /^\/npm\/(@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+\//.test(url.pathname);
}

/**
 * Clé de cache d'une page : l'adresse sans paramètres ni fragment. Les paramètres (code d'invitation, conversation,
 * membre…) ne sont donc jamais conservés dans le cache, et hors ligne la copie de la page sert pour toute variante.
 * @param {Request} req Requête de navigation.
 * @returns {string}
 */
function pageKey(req) {
  const u = new URL(req.url);
  return u.origin + u.pathname;
}

/**
 * Réseau d'abord : essaie le réseau et garde une copie. Hors ligne, sert la copie en cache, sinon /offline.html.
 * Avec un délai : si le réseau n'a pas répondu à temps et qu'une copie existe, la copie est servie et le réseau
 * continue en arrière-plan pour la rafraîchir (connexion lente mais pas coupée).
 * @param {Request} req Requête à traiter.
 * @param {boolean} [revalidate] Si vrai, demande au serveur de vérifier la version (évite le cache HTTP du navigateur).
 * @param {FetchEvent} [event] Événement fetch, pour finir la mise à jour du cache après la réponse (waitUntil).
 * @param {number} [delai] Délai en millisecondes avant de servir la copie ; 0 : attendre le réseau.
 * @returns {Promise<Response>} La réponse réseau, la copie en cache, ou une erreur réseau.
 */
async function networkFirst(req, revalidate = false, event = null, delai = 0) {
  const cache = await caches.open(CACHE);
  // Navigation : rangée sous l'adresse sans paramètres (voir pageKey).
  const key = req.mode === 'navigate' ? pageKey(req) : req;
  // revalidate : demande au serveur si le fichier a changé (réponse 304 légère sinon), sans se fier au cache HTTP.
  const reseau = fetch(req, revalidate ? { cache: 'no-cache' } : undefined).then((res) => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  if (event) event.waitUntil(reseau.catch(() => {}));
  try {
    const copie = delai ? await cache.match(key) : null;
    if (!copie) return await reseau;
    return await Promise.race([reseau, new Promise((ok) => { setTimeout(() => ok(copie), delai); })]);
  } catch (e) {
    return (await cache.match(key)) || (await cache.match('/offline.html')) || Response.error();
  }
}

/**
 * Cache d'abord : sert la copie en cache si elle existe, sinon va sur le réseau et garde la réponse.
 * Sert à la bibliothèque jsDelivr épinglée, dont la version ne change jamais.
 * @param {Request} req Requête à traiter.
 * @returns {Promise<Response>} La copie en cache ou la réponse réseau.
 */
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Réponse opaque (statut inconnu, peut-être une erreur) : gardée seulement pour la liste PRECACHE_REMOTE.
  if (res.ok || (res.type === 'opaque' && PRECACHE_REMOTE.includes(req.url))) cache.put(req, res.clone());
  return res;
}

/**
 * Périmé puis mis à jour : sert tout de suite la copie en cache (si elle existe) et met à jour le cache en arrière-plan.
 * Sans copie, attend le réseau.
 * @param {Request} req Requête à traiter.
 * @param {FetchEvent} event Événement fetch, pour prolonger le travail d'arrière-plan (waitUntil).
 * @returns {Promise<Response>} La copie en cache, ou la réponse réseau.
 */
async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { event.waitUntil(update); return hit; }
  return (await update) || Response.error();
}

/**
 * Image de carte (Q4) : la copie du cache hg-cartes-img si elle existe, sinon la copie de la précache (CACHE, cartes
 * de base rangées dans le site) ; sinon le réseau en mode CORS (réponse lisible, pas de réponse opaque), gardée dans
 * hg-cartes-img, plafonné à IMG_MAX images (les plus anciennes sont retirées).
 * @param {Request} req Requête de l'image.
 * @param {FetchEvent} event Événement fetch (le rangement du cache se poursuit après la réponse).
 * @returns {Promise<Response>}
 */
async function cardImage(req, event) {
  const cache = await caches.open(IMG_CACHE);
  const hit = (await cache.match(req.url)) || (await (await caches.open(CACHE)).match(req.url));
  if (hit) return hit;
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) {
      event.waitUntil((async () => {
        await cache.put(req.url, res.clone());
        const keys = await cache.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - IMG_MAX))) await cache.delete(k);
      })());
    }
    return res;
  } catch (e) {
    return fetch(req); // repli : la requête d'origine (échoue aussi hors ligne, comme avant)
  }
}

/* ---------- Notifications push (F9) ----------
   Le serveur envoie « Nouveau message » + nom de la conversation (jamais le contenu, jamais l'expéditeur
   d'un Secret Santa). Un clic ouvre la messagerie sur la conversation concernée.
   « C'est ton tour » (migration 200) : la charge porte le lien de la partie, un clic ouvre la partie. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const title = String(data.title || 'Humane Gang').slice(0, 80);
  const options = {
    body: String(data.body || '').slice(0, 120),
    tag: String(data.tag || 'hg-message').slice(0, 120),
    icon: new URL('/assets/images/marque/icon-192.png', self.registration.scope).href,
    data: { conversation_id: data.conversation_id || null, lien: data.lien || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* Clic sur la notification : ouvre la partie ou la messagerie sur la conversation, dans un onglet déjà ouvert si possible. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conv = event.notification.data?.conversation_id;
  const lien = event.notification.data?.lien;
  const target = new URL(/^\/pages\/jeux\/[a-z0-9-]+\.html[?#][\w=/-]+$/.test(lien || '') ? lien : '/pages/compte/messages.html', self.registration.scope);
  if (conv && /^[0-9a-f-]{36}$/i.test(conv)) target.searchParams.set('c', conv);
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (win) {
      if ('navigate' in win) await win.navigate(target.href).catch(() => {});
      return win.focus();
    }
    return self.clients.openWindow(target.href);
  })());
});
