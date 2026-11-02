// Client Supabase du socle. Chargé en dernier (import dynamique de supabase-js, module évalué après les
// préférences et le thème en cache, voir core.js).
/*
 * Rôle : crée l'unique client Supabase du site (sb) et fournit deux petites aides :
 * hasSession (y a-t-il une session ouverte ?) et isNavCancel (faut-il ignorer cette erreur, due à une navigation ?).
 * Page : toutes les pages (tous les autres fichiers du socle importent sb depuis ici).
 * Dépendances : config.js (URL et clé publique), supabase-js servi localement (/assets/vendor, version 2.45.4).
 * Changer de compte (comptes-etat.js) : le client passe ses requêtes par fetchGarde (rien ne part d'un onglet figé, ni avec
 * le jeton d'un autre compte que celui de la page) ; clientTemporaire() connecte ou retire un second compte sans toucher à
 * la session du site.
 * Exporte : sb, hasSession, isNavCancel, authLanding, signOutDevice, clientTemporaire, revoquerSession.
 */
import { SUPABASE_URL, SUPABASE_KEY } from '../config.js';
import { memoEffacer } from './memoire.js';
import { fetchGarde, signalerCompte, sujetJeton, comptePage, lireComptes, effacerComptes } from './comptes-etat.js';

// supabase-js est chargé ici et non par une balise <script> : le fichier local porte la version (2.45.4).
const { createClient } = await import('../../vendor/supabase-js-2.45.4.mjs');

/**
 * Verrou simple en mémoire à la place du verrou navigateur (Navigator LockManager) :
 * celui-ci provoquait l'erreur « Acquiring an exclusive Navigator LockManager lock … immediately failed »
 * et bloquait le chargement quand plusieurs requêtes partaient en même temps.
 * Les opérations d'authentification sont exécutées l'une après l'autre dans cette file.
 * (Les paramètres _name et _timeout sont ceux attendus par supabase-js, non utilisés ici.)
 */
const memoryLock = (() => {
  let queue = Promise.resolve();
  return async (_name, _timeout, fn) => {
    const run = queue.then(() => fn());
    queue = run.catch(() => {}); // une erreur n'arrête pas la file
    return run;
  };
})();

/* ---------- Retour d'un lien reçu par e-mail (confirmation d'inscription, mot de passe oublié) ----------
   Flux PKCE : le lien ramène sur /pages/compte/compte.html avec ?code=<uuid>, échangeable contre une session seulement avec le
   « code_verifier » gardé par CE navigateur au moment de la demande. Un lien fabriqué par quelqu'un d'autre
   (session d'un autre compte en #access_token=…, ou ?code= sans verifier) n'ouvre donc aucune session (fixation refusée).
   La lecture de l'adresse n'est active que sur /pages/compte/compte.html, seule page de retour des e-mails ; ailleurs l'adresse
   est ignorée. Sur /pages/compte/compte.html, ?code=HG-XXXX est un code d'invitation et non un code d'authentification : la lecture
   est coupée dans ce cas, pour ne pas consommer le verifier d'une inscription en attente. */
const PROJECT_REF = new URL(SUPABASE_URL).hostname.split('.')[0];
/** Clé de stockage du verifier PKCE (nom imposé par supabase-js : sb-<projet>-auth-token-code-verifier). */
const VERIFIER_KEY = `sb-${PROJECT_REF}-auth-token-code-verifier`;
/** Pages qui reçoivent les retours d'e-mail. */
const URL_SESSION_PAGES = new Set(['/pages/compte/compte.html']);
const _here = new URL(location.href);
const _page = _here.pathname; // adresse complète (les pages sont rangées par dossier)
const _code = _here.searchParams.get('code') || '';
const _isAuthCode = /^[0-9a-f-]{36}$/i.test(_code);
let _verifier = false;
try { _verifier = !!localStorage.getItem(VERIFIER_KEY); } catch { /* stockage bloqué : pas d'échange possible */ }
const detectSessionInUrl = URL_SESSION_PAGES.has(_page) && (!_code || _isAuthCode);

/** Client Supabase partagé par tout le site : session persistante, rafraîchissement automatique du jeton, flux PKCE. */
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl, flowType: 'pkce', lock: memoryLock },
  global: { fetch: fetchGarde },
});

/* ---------- Changer de compte : un seul compte actif pour tout le navigateur ----------
   supabase-js prévient les autres onglets quand la session change. Un onglet dont le compte change ailleurs se fige
   (comptes-etat.js) au lieu d'agir au nom du nouveau compte ; le temps réel ne reçoit jamais le jeton d'un autre compte. */
sb.auth.onAuthStateChange((_event, session) => { if (session?.user?.id) signalerCompte(session.user.id); });
if (typeof sb.realtime?.setAuth === 'function') {
  const setAuth = sb.realtime.setAuth.bind(sb.realtime);
  sb.realtime.setAuth = (jeton) => {
    const sub = sujetJeton(jeton);
    if (sub && comptePage() && sub !== comptePage()) { signalerCompte(sub); return undefined; }
    return setAuth(jeton);
  };
}

/**
 * Client Supabase à part, sans session gardée (rien dans la clé du site, aucun renouvellement en fond) : connexion d'un
 * second compte, vérification ou fermeture de sa session. À jeter après usage.
 * @returns {object}
 */
export function clientTemporaire() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hg-compte-temporaire' },
  });
}

/**
 * Ferme sur le serveur la session d'un compte en attente (jeton de renouvellement), pour cet appareil seulement.
 * Retire aussi l'abonnement push de l'appareil s'il est à ce compte. Au mieux, borné à 4 secondes ; ne jette jamais.
 * @param {string|null} rt Jeton de renouvellement.
 * @param {{push?: boolean}} [o] push : l'abonnement push de l'appareil appartient à ce compte.
 * @returns {Promise<void>}
 */
export async function revoquerSession(rt, { push = false } = {}) {
  if (!rt) return;
  await Promise.race([(async () => {
    try {
      const t = clientTemporaire();
      const { data, error } = await t.auth.refreshSession({ refresh_token: rt });
      if (error || !data?.session) return; // session déjà fermée
      if (push && 'serviceWorker' in navigator) {
        const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager?.getSubscription();
        if (sub) { try { await t.from('hg_push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch { /* réseau */ } await sub.unsubscribe().catch(() => {}); }
      }
      await t.auth.signOut({ scope: 'local' });
    } catch { /* au mieux */ }
  })(), new Promise((r) => setTimeout(r, 4000))]);
}

/**
 * Résultat du retour par lien d'e-mail sur cette page.
 * - fromEmailLink : vrai si une session vient d'être ouverte en échangeant le ?code= du lien (même navigateur que la demande) ;
 * - codeWithoutVerifier : vrai si l'adresse portait un code d'e-mail que ce navigateur ne peut pas échanger
 *   (lien ouvert dans un autre navigateur ou une autre appli que celle de la demande).
 * @type {{fromEmailLink: boolean, codeWithoutVerifier: boolean}}
 */
export const authLanding = { fromEmailLink: false, codeWithoutVerifier: false };
if (detectSessionInUrl && _isAuthCode) {
  if (!_verifier) authLanding.codeWithoutVerifier = true;
  else {
    let initError = null;
    try { initError = (await sb.auth.initialize?.())?.error ?? null; } catch (e) { initError = e; }
    authLanding.fromEmailLink = !initError;
  }
}

// Passage à une autre page (lien, déconnexion, rechargement) : les requêtes en cours sont coupées, ce n'est pas une panne.
let _leaving = false;
addEventListener('pagehide', () => { _leaving = true; });

/**
 * Vrai si une session est ouverte. Sans session, supabase-js envoie la seule clé publique : les RPC membres répondent 401.
 * Ne jette jamais : en cas d'erreur, renvoie false.
 * @returns {Promise<boolean>}
 */
export async function hasSession() {
  try { return !!(await sb.auth.getSession()).data.session; } catch { return false; }
}
/**
 * Erreur causée par la navigation en cours (requête coupée) : à ignorer sans bruit dans la console.
 * @param {*} e Erreur attrapée.
 * @returns {boolean} true si la page est en train de quitter et que l'erreur est une requête coupée.
 */
export const isNavCancel = (e) => _leaving && (e?.name === 'AbortError' || /NetworkError|Failed to fetch|aborted/i.test(String(e?.message ?? e)));

/**
 * Déconnexion de cet appareil : retire d'abord l'abonnement aux notifications push de l'appareil (ligne
 * hg_push_subscriptions, tant que la session permet encore de la supprimer, puis désabonnement du navigateur),
 * pour que le compte suivant sur un appareil partagé ne reçoive pas les alertes du précédent. Puis ferme la session
 * de CET appareil seulement (les autres appareils du membre restent connectés), sauf avec partout : true.
 * Un second compte rangé sur l'appareil (comptes-etat.js) est aussi déconnecté d'ici et oublié, sauf avec garderComptes : true
 * (« Déconnecter Ethan » : on passe ensuite sur l'autre compte).
 * Ne jette jamais : chaque étape est au mieux, et l'ensemble du push est borné à 3 secondes.
 * @param {{partout?: boolean, garderComptes?: boolean}} [o]
 * @returns {Promise<void>}
 */
export async function signOutDevice({ partout = false, garderComptes = false } = {}) {
  const st = lireComptes();
  if (!garderComptes) {
    for (const a of st?.autres || []) await revoquerSession(a.rt, { push: st.push === a.id });
    effacerComptes();
  }
  // Push de l'appareil activé par le compte qui reste (en attente) : il lui reste.
  const pushAutre = garderComptes && st?.push && st.push !== comptePage();
  try {
    if (!pushAutre && 'serviceWorker' in navigator && 'PushManager' in window) {
      await Promise.race([
        (async () => {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager?.getSubscription();
          if (!sub) return;
          try { await sb.from('hg_push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch { /* ligne déjà absente ou réseau */ }
          await sub.unsubscribe().catch(() => {});
        })(),
        new Promise((r) => setTimeout(r, 3000)),
      ]);
    }
  } catch { /* push indisponible : sans effet */ }
  // Copie hors ligne de la collection (IndexedDB) effacée à chaque déconnexion, comme le menu : téléphone prêté,
  // ordinateur partagé. Sans cela, la page Compte et le panel admin la laissaient sur l'appareil.
  try { await (await import('../offline-store.js')).clearOffline(); } catch { /* rien à effacer */ }
  memoEffacer(); // mémoire d'affichage (profil, pages, droits, mode sans limite) : rien ne reste pour le compte suivant
  try { await sb.auth.signOut({ scope: partout ? 'global' : 'local' }); } catch { /* déconnexion locale au mieux */ }
}
