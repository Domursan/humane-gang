// Changer de compte : compte de la page, garde entre onglets, comptes rangés sur l'appareil, clés locales par compte.
/*
 * Rôle : module feuille (aucun import), lu par supabase.js, init.js, header.js et les jeux.
 *   - Compte de la page : fixé par init.js au démarrage (fixerComptePage). Si la session du navigateur passe à un autre
 *     compte dans un autre onglet, cet onglet se fige : plus aucune requête ne part (fetchGarde, posé sur le client
 *     Supabase), puis la boîte « Compte changé dans un autre onglet » s'ouvre (comptes.js, chargé à la demande).
 *     Une requête qui porterait le jeton d'un autre compte que celui de la page est bloquée avant de partir.
 *   - Comptes de l'appareil (2 au plus, admin et Staff, voir comptes.js) : localStorage « hg_comptes ».
 *   - Clés locales des jeux rangées par compte (cleCompte, lireLocal, ecrireLocal) : « <clé>@<identifiant> ».
 * Stockage : localStorage « hg_comptes » = { v: 1, actif: Fiche, autres: [Fiche + { rt, vu, expire }], push: id|null }
 *   avec Fiche = { id, pseudo, color, avatar_url, role }. rt : jeton de renouvellement de la session du compte en attente
 *   (le même jeton que supabase-js garde pour le compte actif). Jamais d'e-mail ni de mot de passe. N'existe que
 *   sur un appareil où un second compte a été ajouté ; effacé quand il ne reste qu'un compte.
 *   sessionStorage « hg_comptes_arrivee » = { de, vers, page, label } : message affiché après une bascule (une fois).
 * Aucun jeton n'est jamais écrit dans la console, une adresse ou un message d'erreur.
 * Exporte : fixerComptePage, comptePage, surChangementCompte, signalerCompte, debutBascule, finBascule, estFige,
 *   sujetJeton, fetchGarde, lireComptes, ecrireComptes, effacerComptes, autresComptes, cleCompte, lireLocal, ecrireLocal,
 *   migrerClesLocales, CLE_COMPTES, CLE_ARRIVEE.
 */

/** Clé localStorage des comptes de l'appareil. */
export const CLE_COMPTES = 'hg_comptes';
/** Clé sessionStorage du message d'arrivée après une bascule. */
export const CLE_ARRIVEE = 'hg_comptes_arrivee';
/** Clés locales des jeux qui dépendent du compte (rangées « <clé>@<identifiant> »). */
const CLES_JEUX = /^(hg-anagramme:|hg-motscroises:|hg_2048_meilleur$|hg_arcade_best_|hg_cluedo_carnet:|hg_ss_seen_)/;
const UUID = /^[0-9a-f-]{36}$/i;

/* ---------- Compte de la page et garde ---------- */

const G = { uid: null, fige: false, bascule: false, surChange: null };

/**
 * Indique le compte affiché par cette page (null pour un visiteur). Appelée par init.js au démarrage.
 * @param {string|null} uid
 */
export function fixerComptePage(uid) { G.uid = UUID.test(String(uid || '')) ? uid : null; }
/** Compte de la page (ou null). */
export const comptePage = () => G.uid;
/** Fonction appelée une fois quand le compte change ailleurs (init.js : ouvre la boîte de comptes.js). */
export function surChangementCompte(fn) { G.surChange = fn; }
/** Vrai si la page est figée (le compte a changé dans un autre onglet). */
export const estFige = () => G.fige;
/** Bascule demandée depuis cette page : les requêtes d'un autre compte restent bloquées, sans boîte. */
export function debutBascule() { G.bascule = true; G.fige = false; }
/** Fin d'une bascule sans rechargement (retour au compte de la page, ou échec). */
export function finBascule() { G.bascule = false; }

/**
 * La session du navigateur appartient à `uid` : si ce n'est pas le compte de la page, la page se fige (une seule fois).
 * Sans compte de page (visiteur) ou sans compte (déconnexion), rien ne change.
 * @param {string|null} uid
 */
export function signalerCompte(uid) {
  if (!G.uid || !uid || uid === G.uid || G.bascule || G.fige) return;
  G.fige = true;
  try { G.surChange?.(uid); } catch { /* la page reste figée */ }
}

/**
 * Identifiant du compte porté par un jeton d'accès (champ « sub »), sans le vérifier. Null pour la clé publique ou un texte illisible.
 * @param {string} jwt
 * @returns {string|null}
 */
export function sujetJeton(jwt) {
  try {
    const p = String(jwt || '').split('.')[1];
    if (!p) return null;
    const json = atob(p.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (p.length % 4)) % 4));
    const sub = JSON.parse(json)?.sub;
    return typeof sub === 'string' && UUID.test(sub) ? sub : null;
  } catch { return null; }
}

/** Jeton porté par l'en-tête Authorization d'une requête (ou ''). */
function jetonDe(input, init) {
  try {
    const h = new Headers(init?.headers || (typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined));
    return (h.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  } catch { return ''; }
}

/**
 * fetch du client Supabase : rien ne part d'une page figée, ni une requête signée par un autre compte que celui de la page.
 * L'erreur renvoyée ne contient aucun jeton.
 * @param {RequestInfo} input
 * @param {RequestInit} [init]
 * @returns {Promise<Response>}
 */
export function fetchGarde(input, init) {
  if (G.fige) return Promise.reject(new TypeError('Compte changé dans un autre onglet : rien n’est envoyé.'));
  const sub = G.uid ? sujetJeton(jetonDe(input, init)) : null;
  if (sub && sub !== G.uid) {
    signalerCompte(sub);
    return Promise.reject(new TypeError('Compte changé dans un autre onglet : rien n’est envoyé.'));
  }
  return fetch(input, init);
}

/* ---------- Comptes de l'appareil ---------- */

/** Fiche d'affichage gardée : uniquement pseudo, couleur, photo et rôle affiché. */
function fiche(p) {
  return { id: String(p.id), pseudo: String(p.pseudo || '').slice(0, 32), color: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : null,
    avatar_url: typeof p.avatar_url === 'string' ? p.avatar_url.slice(0, 500) : null, role: ['Admin', 'Staff', 'Membre'].includes(p.role) ? p.role : 'Membre' };
}

/**
 * Comptes rangés sur l'appareil, ou null s'il n'y en a pas (ou contenu illisible).
 * @returns {{v: number, actif: object|null, autres: object[], push: string|null}|null}
 */
export function lireComptes() {
  try {
    const v = JSON.parse(localStorage.getItem(CLE_COMPTES) || 'null');
    if (!v || typeof v !== 'object') return null;
    const actif = v.actif && UUID.test(v.actif.id) ? fiche(v.actif) : null;
    const autres = (Array.isArray(v.autres) ? v.autres : []).filter((a) => a && UUID.test(a.id) && a.id !== actif?.id).slice(0, 1)
      .map((a) => ({ ...fiche(a), rt: typeof a.rt === 'string' && a.rt ? a.rt : null, vu: Number(a.vu) || 0, expire: !!a.expire || !a.rt }));
    return { v: 1, actif, autres, push: UUID.test(v.push || '') ? v.push : null };
  } catch { return null; }
}
/**
 * Range les comptes de l'appareil. Sans autre compte, la clé est effacée (un seul compte : rien à garder).
 * @param {{actif: object|null, autres: object[], push?: string|null}} st
 */
export function ecrireComptes(st) {
  if (!st?.autres?.length) { effacerComptes(); return; }
  const v = { v: 1, actif: st.actif ? fiche(st.actif) : null,
    autres: st.autres.slice(0, 1).map((a) => ({ ...fiche(a), rt: a.rt || null, vu: Number(a.vu) || Date.now(), expire: !!a.expire || !a.rt })),
    push: st.push || null };
  try { localStorage.setItem(CLE_COMPTES, JSON.stringify(v)); } catch { /* stockage bloqué : pas de second compte */ }
}
/** Oublie les comptes de l'appareil. */
export function effacerComptes() { try { localStorage.removeItem(CLE_COMPTES); } catch { /* rien à effacer */ } }
/** Autres comptes rangés sur l'appareil (0 ou 1). */
export const autresComptes = () => lireComptes()?.autres ?? [];

/* ---------- Clés locales par compte ---------- */

/**
 * Nom de la clé locale propre au compte de la page (« <base>@<identifiant> »), ou la base pour un visiteur.
 * @param {string} base
 * @returns {string}
 */
export const cleCompte = (base) => (G.uid ? `${base}@${G.uid}` : base);
/**
 * Lit une clé locale du compte de la page. Sur un appareil à un seul compte, l'ancienne clé sans compte sert encore
 * (valeurs écrites avant le rangement par compte) ; dès qu'un second compte est ajouté, elle est rangée au compte d'alors.
 * @param {string} base
 * @returns {string|null}
 */
export function lireLocal(base) {
  try {
    const v = localStorage.getItem(cleCompte(base));
    if (v !== null || !G.uid || lireComptes()) return v;
    return localStorage.getItem(base);
  } catch { return null; }
}
/**
 * Écrit une clé locale du compte de la page (sans effet si le stockage est bloqué).
 * @param {string} base
 * @param {string} valeur
 */
export function ecrireLocal(base, valeur) { try { localStorage.setItem(cleCompte(base), valeur); } catch { /* stockage bloqué */ } }
/**
 * Range au compte `uid` les anciennes clés des jeux écrites sans compte (appelée quand un second compte est ajouté).
 * @param {string} uid
 */
export function migrerClesLocales(uid) {
  if (!UUID.test(String(uid || ''))) return;
  try {
    const anciennes = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && CLES_JEUX.test(k) && !k.includes('@')) anciennes.push(k); }
    for (const k of anciennes) {
      if (localStorage.getItem(`${k}@${uid}`) === null) localStorage.setItem(`${k}@${uid}`, localStorage.getItem(k));
      localStorage.removeItem(k);
    }
  } catch { /* stockage bloqué */ }
}
