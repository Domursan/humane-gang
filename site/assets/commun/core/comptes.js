// Changer de compte : deux comptes connectés sur le même appareil, et passer de l'un à l'autre (maquette validée le 02.11.2026).
/*
 * Rôle : panneau « Comptes sur cet appareil » (photo de l'en-tête et page Mon compte), ajout d'un second compte dans une boîte
 *   sans quitter la page, bascule (rechargement sur la même page, ou à l'accueil si elle n'est pas ouverte au compte choisi),
 *   retrait d'un compte, déconnexion avec deux comptes, onglet figé quand le compte change ailleurs, session expirée.
 * Règles :
 *   - 2 comptes au plus par appareil ; un seul compte actif pour tout le navigateur.
 *   - Réservé aux admins et au Staff : c'est le compte qui AJOUTE qui doit avoir le droit (admin ou au moins une permission du panel).
 *     Le compte ajouté peut être un simple membre (compte de test) : il voit l'entrée tant que la paire est sur l'appareil, pour
 *     revenir, mais ne peut pas en ajouter d'autre. C'est un choix d'interface : la base ne voit qu'une connexion ordinaire.
 *   - Le compte en attente ne tourne pas en fond : rien n'est demandé pour lui avant qu'on passe dessus.
 *   - Une session n'est jamais remplacée en silence : session expirée = message et choix.
 * Stockage : voir comptes-etat.js (localStorage « hg_comptes » : fiche d'affichage et jeton de renouvellement du compte en attente).
 *   Aucun jeton n'est écrit dans la console, une adresse ou un message.
 * Page : toutes les pages (chargé à la demande par header.js, init.js, compte.js et admin/shell.js).
 * Dépendances : supabase.js (client, client temporaire, déconnexion), comptes-etat.js, profile.js, perms.js, pages-access.js,
 *   view-as.js, godmode.js, memoire.js, ui.js, util.js ; à la demande ui-confirm.js, offline-store.js. Styles : comptes.css.
 * Exporte : peutAjouter, ouvrirPanneau, fermerPanneau, boiteAjout, deconnexion, ongletFige, auDemarrage, monterComptesAppareil.
 */
import { sb, clientTemporaire, revoquerSession, signOutDevice } from './supabase.js';
import { lireComptes, ecrireComptes, comptePage, debutBascule, finBascule, migrerClesLocales, CLE_ARRIVEE } from './comptes-etat.js';
import { getCachedProfile } from './profile.js';
import { getCachedPerms, canPanel, clearPerms } from './perms.js';
import { currentPageSlug, pageLabel } from './pages-access.js';
import { viewAsActive } from './view-as.js';
import { isGodMode, setGodMode } from './godmode.js';
import { memoEffacer } from './memoire.js';
import { toast } from './ui.js';
import { avatarHtml, esc } from './util.js';

/* ---------- Constantes ---------- */

/** Comptes au plus sur un appareil. */
const MAX = 2;
const IC_PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14"/></svg>';
const IC_X = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const IC_OK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const IC_FLECHE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 12h15M14 7l5 5-5 5"/></svg>';
const IC_ALERTE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18.2v.01"/></svg>';

/* ---------- Styles ---------- */

/** Ajoute une feuille de style du dossier commun (une fois). */
function feuille(nom) {
  if (document.querySelector(`link[href$="/${nom}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL(`../${nom}`, import.meta.url).href;
  document.head.append(l);
}
const styles = () => { feuille('notifs.css'); feuille('ui-confirm.css'); feuille('comptes.css'); };

/* ---------- État ---------- */

/** Rôle affiché d'un profil. */
const roleDe = (p, perms) => (p?.is_admin ? 'Admin' : canPanel(perms) ? 'Staff' : 'Membre');
/** Fiche du compte de la page (profil en cache), ou null. */
function ficheActive() {
  const p = getCachedProfile();
  return p ? { id: p.id, pseudo: p.pseudo, color: p.color, avatar_url: p.avatar_url, role: roleDe(p, getCachedPerms()) } : null;
}
/**
 * Le compte de la page peut-il ajouter un second compte ? Admin ou Staff (au moins une permission du panel), hors vue « comme un membre ».
 * @returns {boolean}
 */
export function peutAjouter() {
  const p = getCachedProfile();
  return !!p && !viewAsActive() && (!!p.is_admin || canPanel(getCachedPerms()));
}
/** Comptes de l'appareil, avec la fiche à jour du compte de la page. */
function etat() {
  const st = lireComptes() || { actif: null, autres: [], push: null };
  const a = ficheActive();
  if (a) { st.actif = a; st.autres = st.autres.filter((x) => x.id !== a.id); }
  return st;
}
/** « il y a 2 h », d'après une date en millisecondes. */
function ilYa(ms) {
  const m = Math.round((Date.now() - Number(ms || 0)) / 60000);
  if (!ms || m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  if (m < 48 * 60) return `il y a ${Math.round(m / 60)} h`;
  return `il y a ${Math.round(m / 1440)} j`;
}
/** Erreur réseau (et non session refusée) : rien n'est marqué comme expiré. */
const erreurReseau = (e) => !!e && (e.name === 'AuthRetryableFetchError' || e.status === 0 || /fetch|network/i.test(String(e.message || '')));

/* ---------- Bascule ---------- */

/**
 * Adresse où recharger après une bascule : la même page, sauf une partie de jeu ou une conversation, qui appartiennent
 * à l'ancien compte (retour à l'accueil du jeu, à la messagerie).
 * @returns {string}
 */
function adresseApres() {
  const p = location.pathname;
  if (/\/pages\/jeux\/(?!jeux\.html)[\w-]+\.html$/.test(p) || /\/pages\/compte\/messages\.html$/.test(p)) return p;
  return p + location.search + location.hash;
}

/** Vide ce qui appartient au compte qui part : mémoire d'affichage, droits, vue « comme un membre », copie hors ligne. */
async function nettoyer() {
  clearPerms();
  memoEffacer();
  try { ['hg_view_as', 'hg_badges_checked'].forEach((k) => sessionStorage.removeItem(k)); } catch { /* stockage bloqué */ }
  try { await (await import('../offline-store.js')).clearOffline(); } catch { /* rien à effacer */ }
}

/** Voile pendant la bascule (moins d'une seconde) : la page se recharge sur le compte choisi. */
function voile(de, vers) {
  styles();
  document.querySelector('.cc-voile')?.remove();
  const label = pageLabel(currentPageSlug());
  const v = document.createElement('div');
  v.className = 'cc-voile'; v.setAttribute('role', 'status'); v.setAttribute('aria-live', 'polite');
  v.innerHTML = `<div class="cc-voile-boite">
      <div class="cc-voile-avs">${de ? avatarHtml(de, 56) : ''}<span class="cc-voile-fl">${IC_FLECHE}</span>${avatarHtml(vers, 56)}</div>
      <p class="cc-voile-t">Passage au compte ${esc(vers.pseudo)}…</p><p class="small muted">${label ? `La page se recharge, tu restes sur ${esc(label)}.` : 'La page se recharge.'}</p></div>`;
  document.body.append(v);
  return v;
}

/**
 * Passe la session du site sur `cible` (session fraîche obtenue par un client temporaire), range l'ancien compte en attente,
 * vide ce qui lui appartient, puis recharge la page. Le compte qui part n'est jamais déconnecté.
 * @param {object} cible Fiche du compte choisi.
 * @param {{access_token: string, refresh_token: string}} session Session du compte choisi.
 * @returns {Promise<boolean>} Faux si la bascule a échoué (rien n'a changé).
 */
async function passerA(cible, session) {
  const st = etat();
  const actif = st.actif;
  const v = voile(actif, cible);
  if (isGodMode()) { try { await setGodMode(false); } catch { /* coupé au mieux */ } }
  debutBascule();
  sb.auth.stopAutoRefresh?.();
  let cur = null;
  try { cur = (await sb.auth.getSession()).data.session; } catch { /* plus de session : l'ancien compte est noté expiré */ }
  const { error } = await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token });
  if (error) {
    finBascule(); sb.auth.startAutoRefresh?.(); v.remove();
    toast(`Le passage à ${cible.pseudo} n’a pas abouti. Réessaie.`, 'error');
    return false;
  }
  if (!lireComptes() && actif) migrerClesLocales(actif.id); // anciennes clés des jeux : au compte qui était seul
  ecrireComptes({ actif: cible, autres: actif ? [{ ...actif, rt: cur?.refresh_token || null, vu: Date.now() }] : [], push: st.push });
  await nettoyer();
  try { sessionStorage.setItem(CLE_ARRIVEE, JSON.stringify({ de: actif?.pseudo || '', vers: cible.pseudo, page: currentPageSlug(), label: pageLabel(currentPageSlug()) })); } catch { /* sans message */ }
  location.replace(adresseApres());
  return true;
}

/**
 * Ouvre une session fraîche du compte en attente avec son jeton (client temporaire : la session du site n'est pas touchée).
 * Session refusée : le compte est noté « expiré » sur l'appareil. Le nouveau jeton est rangé tout de suite (l'ancien ne sert plus).
 * @param {object} a Compte en attente.
 * @returns {Promise<{session: object|null, reseau: boolean}>}
 */
async function rouvrir(a) {
  try {
    const { data, error } = await clientTemporaire().auth.refreshSession({ refresh_token: a.rt });
    if (!error && data?.session) {
      const st = lireComptes();
      if (st) ecrireComptes({ ...st, autres: st.autres.map((x) => (x.id === a.id ? { ...x, rt: data.session.refresh_token, expire: false } : x)) });
      return { session: data.session, reseau: false };
    }
    if (erreurReseau(error)) return { session: null, reseau: true };
  } catch (e) { if (erreurReseau(e)) return { session: null, reseau: true }; }
  const st = lireComptes();
  if (st) ecrireComptes({ ...st, autres: st.autres.map((x) => (x.id === a.id ? { ...x, rt: null, expire: true } : x)) });
  return { session: null, reseau: false };
}

/** Parties en cours du compte de la page (barre « Reprendre ma partie »). Vide en cas d'erreur. */
async function partiesEnCours() {
  try {
    const { data, error } = await sb.rpc('hg_jeux_mes_parties');
    return error || !Array.isArray(data) ? [] : data.filter((p) => p?.statut === 'en_cours');
  } catch { return []; }
}

/**
 * Passe sur le compte en attente `id` : session expirée = reconnexion ; partie en cours = on prévient d'abord.
 * @param {string} id
 */
async function basculer(id) {
  const st = etat();
  const a = st.autres.find((x) => x.id === id);
  if (!a) return;
  fermerPanneau();
  if (a.expire || !a.rt) { boiteAjout({ reco: a }); return; }
  const parties = await partiesEnCours();
  if (parties.length) {
    const { confirmBox } = await import('../ui-confirm.js');
    const quoi = parties.length === 1 ? `une partie de ${parties[0].nom_jeu || parties[0].nom || 'jeu'}` : `${parties.length} parties`;
    const ok = await confirmBox(`Passer à ${a.pseudo} ?`, `Tu as ${quoi} en cours avec ${st.actif?.pseudo || 'ce compte'}. Elle continue sans toi : si ton tour arrive, le chrono et le robot jouent comme d’habitude.`, { ok: `Passer à ${a.pseudo}` });
    if (!ok) return;
  }
  const r = await rouvrir(a);
  if (r.session) { await passerA(a, r.session); return; }
  if (r.reseau) { toast('Connexion impossible pour le moment. Réessaie.', 'error'); return; }
  boiteAjout({ reco: { ...a, rt: null, expire: true } });
}

/* ---------- Panneau « Comptes sur cet appareil » ---------- */

/**
 * Lignes, bouton d'ajout et pied du panneau (aussi dans Mon compte).
 * @param {object} st État des comptes.
 * @param {{pied?: boolean}} [o] pied : ligne des notifications et « Se déconnecter de tous les comptes ».
 * @returns {string} HTML
 */
function contenuHtml(st, { pied = true } = {}) {
  const a = st.actif, autre = st.autres[0];
  const ligneActive = a ? `<li class="cc-ligne is-actif">${avatarHtml(a, 40)}<span class="cc-nom"><strong>${esc(a.pseudo)}</strong><span class="cc-sous">${esc(a.role)} · utilisé maintenant</span></span><span class="cc-actif">${IC_OK}Actif</span></li>` : '';
  const retirer = autre ? `<button class="cc-retirer" type="button" data-cc="retirer" aria-label="Retirer ${esc(autre.pseudo)} de cet appareil">${IC_X}</button>` : '';
  const ligneAutre = !autre ? '' : autre.expire
    ? `<li class="cc-ligne is-expire"><button class="cc-passer" type="button" data-cc="passer">${avatarHtml(autre, 40)}<span class="cc-nom"><strong>${esc(autre.pseudo)}</strong><span class="cc-sous cc-alerte">${IC_ALERTE}Session expirée</span></span><span class="btn btn-ghost cc-go">Se reconnecter</span></button>${retirer}</li>`
    : `<li class="cc-ligne"><button class="cc-passer" type="button" data-cc="passer">${avatarHtml(autre, 40)}<span class="cc-nom"><strong>${esc(autre.pseudo)}</strong><span class="cc-sous">${esc(autre.role)} · dernière visite ${esc(ilYa(autre.vu))}</span></span><span class="btn btn-primary cc-go">Passer</span></button>${retirer}</li>`;
  const plein = !!autre;
  const ajout = plein
    ? `<button class="btn btn-ghost cc-ajout" type="button" disabled aria-describedby="cc-plein">${IC_PLUS}Ajouter un compte</button><p class="small muted cc-aide" id="cc-plein">2 comptes au plus sur un appareil. Retire-en un pour en ajouter un autre.</p>`
    : peutAjouter() ? `<button class="btn btn-ghost cc-ajout" type="button" data-cc="ajouter">${IC_PLUS}Ajouter un compte</button><p class="small muted cc-aide">Garde un second compte connecté sur cet appareil et passe de l’un à l’autre sans retaper ton mot de passe.</p>` : '';
  return `<ul class="cc-liste">${ligneActive}${ligneAutre}</ul>${ajout}${pied ? `
    <p class="small muted cc-aide cc-push">Notifications sur cet appareil : …</p>
    <button class="btn btn-ghost cc-tout" type="button" data-cc="tout">Se déconnecter de tous les comptes</button>` : ''}`;
}

/**
 * Compte qui reçoit les notifications push de l'appareil (null : aucune). Noté sur l'appareil ; s'il ne l'est pas, la base dit
 * si l'abonnement est au compte de la page (une lecture, à l'ouverture du panneau seulement).
 * @param {object} st
 * @returns {Promise<string|null>}
 */
async function proprioPush(st) {
  try {
    if (!('serviceWorker' in navigator)) return null;
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager?.getSubscription();
    if (!sub) return null;
    if (st.push) return st.push;
    const { data } = await sb.from('hg_push_subscriptions').select('user_id').eq('endpoint', sub.endpoint).maybeSingle();
    const id = data?.user_id || null;
    const s = lireComptes();
    if (id && s) ecrireComptes({ ...s, push: id });
    return id;
  } catch { return null; }
}
/** Écrit la ligne des notifications du panneau. */
async function peindrePush(box, st) {
  const el = box.querySelector('.cc-push');
  if (!el) return;
  const id = await proprioPush(st);
  const qui = [st.actif, ...st.autres].find((x) => x?.id === id);
  el.textContent = !qui ? 'Notifications sur cet appareil : désactivées. À changer dans Mon compte.'
    : qui.id === st.actif?.id ? `Notifications sur cet appareil : pour ${qui.pseudo}. À changer dans Mon compte.`
      : `Notifications sur cet appareil : elles restent pour ${qui.pseudo}. À changer dans Mon compte.`;
}

/** Actions des boutons du panneau et de la carte de Mon compte (délégation). */
function brancher(box, rafraichir) {
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cc]');
    if (!b || b.disabled) return;
    const autre = etat().autres[0];
    if (b.dataset.cc === 'passer' && autre) basculer(autre.id);
    else if (b.dataset.cc === 'retirer' && autre) retirer(autre, rafraichir);
    else if (b.dataset.cc === 'ajouter') { fermerPanneau(); boiteAjout(); }
    else if (b.dataset.cc === 'tout') { fermerPanneau(); deconnexion(); }
  });
}

let _ecouteDoc = false;
/** Ouvre le panneau sous la photo de l'en-tête (même boîte que le panneau des notifications). */
export function ouvrirPanneau() {
  const wrap = document.querySelector('.site-header .nav-me-wrap');
  if (!wrap) return;
  styles();
  fermerPanneau();
  const box = document.createElement('div');
  box.className = 'notif-panel cc-panel'; box.id = 'cc-panel';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'cc-h');
  const peindre = () => {
    const s = etat();
    if (!s.autres.length && !peutAjouter()) { fermerPanneau({ focus: true }); return; }
    box.innerHTML = `<div class="notif-head"><h2 class="notif-h" id="cc-h">Comptes sur cet appareil</h2><span class="cc-nb">${s.autres.length + 1} / ${MAX}</span></div>${contenuHtml(s)}`;
    peindrePush(box, s);
  };
  peindre();
  brancher(box, peindre);
  wrap.append(box);
  document.querySelector('.site-header .nav-comptes')?.setAttribute('aria-expanded', 'true');
  (box.querySelector('.cc-passer') || box.querySelector('.cc-ajout:not([disabled])') || box.querySelector('button'))?.focus({ preventScroll: true });
  if (!_ecouteDoc) {
    _ecouteDoc = true;
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('cc-panel')) fermerPanneau({ focus: true }); });
    document.addEventListener('click', (e) => {
      const p = document.getElementById('cc-panel');
      if (p && !e.composedPath().includes(p) && !e.target.closest?.('.nav-comptes')) fermerPanneau();
    });
  }
}
/**
 * Ferme le panneau (s'il est ouvert).
 * @param {{focus?: boolean}} [o] focus : rendre le focus à la photo.
 */
export function fermerPanneau({ focus = false } = {}) {
  const p = document.getElementById('cc-panel');
  if (!p) return;
  p.remove();
  document.querySelector('.site-header .nav-comptes')?.setAttribute('aria-expanded', 'false');
  if (focus) document.querySelector('.site-header .nav-me')?.focus({ preventScroll: true });
}

/**
 * Carte « Comptes sur cet appareil » de Mon compte (mêmes lignes que le panneau). Masquée pour qui n'a pas la fonction.
 * @param {HTMLElement} slot Emplacement (masqué au départ).
 */
export function monterComptesAppareil(slot) {
  if (!slot) return;
  const peindre = () => {
    const s = etat();
    slot.hidden = !s.autres.length && !peutAjouter();
    if (slot.hidden) return;
    styles();
    slot.innerHTML = `<div class="card stack cc-carte"><h2 class="card-title" id="cc-carte-h">Comptes sur cet appareil <span class="cc-nb">${s.autres.length + 1} / ${MAX}</span></h2>${contenuHtml(s, { pied: false })}</div>`;
  };
  peindre();
  brancher(slot, peindre);
}

/** Met à jour l'entrée du menu en arc après un ajout ou un retrait (header.js écoute cet événement). */
const signalerMenu = () => window.dispatchEvent(new Event('hg:comptes'));

/* ---------- Boîtes ---------- */

/**
 * Pose une boîte (gabarit .hg-dialog de ui-confirm.css) et l'ouvre. Retirée du document à la fermeture.
 * @param {string} corps HTML du formulaire (déjà échappé).
 * @param {{fermable?: boolean}} [o] fermable : false = ni Échap ni clic à côté (onglet figé).
 * @returns {HTMLDialogElement}
 */
function boite(corps, { fermable = true } = {}) {
  styles();
  document.querySelectorAll('dialog.cc-dlg').forEach((d) => d.close());
  const d = document.createElement('dialog');
  d.className = 'hg-dialog cc-dlg';
  d.setAttribute('aria-labelledby', 'cc-dlg-h');
  if (!fermable) { d.setAttribute('data-no-dismiss', ''); d.addEventListener('cancel', (e) => e.preventDefault()); }
  d.innerHTML = corps;
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

/**
 * « Ajouter un compte » : connexion du second compte dans un client à part, sans quitter la page ni déconnecter le premier.
 * reco : compte dont la session a expiré (« Reconnecter <pseudo> »). L'e-mail n'est jamais pré-rempli ni gardé.
 * @param {{reco?: object|null}} [o]
 */
export function boiteAjout({ reco = null } = {}) {
  const st = etat();
  const a = st.actif;
  const texte = reco
    ? `La session de ${reco.pseudo} a expiré sur cet appareil. Retape son e-mail et son mot de passe. ${a?.pseudo || 'Ton compte'} reste connecté.`
    : `${a?.pseudo || 'Ton compte'} reste connecté. Connecte ton autre compte avec son e-mail et son mot de passe : tu passeras ensuite de l’un à l’autre depuis ta photo.`;
  const d = boite(`<form method="dialog" class="stack" novalidate>
    <div class="cc-dlg-tete">${avatarHtml(reco || a || {}, 44)}<h2 class="dialog-title" id="cc-dlg-h">${reco ? `Reconnecter ${esc(reco.pseudo)}` : 'Ajouter un compte'}</h2></div>
    <p class="muted">${esc(texte)}</p>
    <div class="field"><label for="ad-email">E-mail ${reco ? `de ${esc(reco.pseudo)}` : 'de l’autre compte'}</label><input id="ad-email" type="email" autocomplete="username" inputmode="email" required></div>
    <div class="field"><label for="ad-pass">Mot de passe</label><input id="ad-pass" type="password" autocomplete="current-password" required></div>
    <p class="cc-err" role="alert" hidden></p>
    <p class="small muted">Sur un ordinateur partagé, n’ajoute pas de compte : déconnecte-toi plutôt.</p>
    <div class="btn-row cc-dlg-actions"><button class="btn btn-primary" type="submit">${reco ? 'Me reconnecter' : 'Ajouter et passer à ce compte'}</button><button class="btn btn-ghost" type="button" data-fermer>Annuler</button></div>
  </form>`);
  const form = d.querySelector('form'), email = d.querySelector('#ad-email'), pass = d.querySelector('#ad-pass');
  const err = d.querySelector('.cc-err'), ok = d.querySelector('button[type=submit]');
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());
  email.focus();
  const erreur = (msg, champs = false) => {
    err.textContent = msg; err.hidden = !msg;
    for (const c of [email, pass]) { if (champs) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid'); }
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mail = email.value.trim(), mdp = pass.value;
    if (!mail || !mdp) { erreur('Renseigne l’e-mail et le mot de passe.', true); return; }
    ok.disabled = true; ok.textContent = 'Connexion…'; erreur('');
    const t = clientTemporaire();
    let res;
    try { res = await t.auth.signInWithPassword({ email: mail, password: mdp }); } catch (x) { res = { error: x }; }
    pass.value = ''; // le mot de passe ne reste pas dans la page
    const fin = (msg, champs) => { erreur(msg, champs); ok.disabled = false; ok.textContent = reco ? 'Me reconnecter' : 'Ajouter et passer à ce compte'; };
    const session = res?.data?.session;
    if (res?.error || !session) {
      fin(erreurReseau(res?.error) ? 'Connexion impossible pour le moment. Réessaie.' : 'E-mail ou mot de passe incorrect.', !erreurReseau(res?.error));
      return;
    }
    const uid = session.user?.id;
    // Session ouverte pour rien (même compte, mauvais compte, pas de profil) : refermée tout de suite sur le serveur
    const refermer = () => t.auth.signOut({ scope: 'local' }).catch(() => {});
    if (uid === comptePage()) { await refermer(); fin(`Ce compte est déjà connecté sur cet appareil : c’est ${a?.pseudo || 'toi'}.`); return; }
    if (reco && uid !== reco.id) { await refermer(); fin(`Ce compte n’est pas ${reco.pseudo}.`); return; }
    let p = null, perms = null;
    try { p = (await t.from('hg_profiles').select('id,pseudo,color,avatar_url,is_admin').eq('id', uid).maybeSingle()).data; } catch { /* réseau */ }
    if (!p) { await refermer(); fin('Ce compte n’a pas encore rejoint le gang : termine son inscription depuis Mon compte.'); return; }
    try { const r = await t.rpc('hg_my_perms'); if (!r.error && r.data) perms = { is_admin: !!r.data.is_admin, perms: Array.isArray(r.data.perms) ? r.data.perms : [] }; } catch { /* rôle par défaut */ }
    const cible = { id: p.id, pseudo: p.pseudo, color: p.color, avatar_url: p.avatar_url, role: roleDe(p, perms) };
    d.close();
    if (!(await passerA(cible, session))) await refermer();
  });
}

/** Retirer un compte de l'appareil : déconnecté d'ici seulement, après confirmation. */
async function retirer(autre, rafraichir) {
  fermerPanneau();
  const d = boite(`<form method="dialog" class="stack">
    <div class="cc-dlg-tete">${avatarHtml(autre, 44)}<h2 class="dialog-title" id="cc-dlg-h">Retirer ${esc(autre.pseudo)} de cet appareil ?</h2></div>
    <p class="muted">${esc(autre.pseudo)} est déconnecté d’ici seulement : ses parties, ses messages et ses cartes ne bougent pas, et ses autres appareils restent connectés. Pour le remettre, il faudra son e-mail et son mot de passe.</p>
    <div class="btn-row cc-dlg-actions"><button class="btn btn-ghost" type="button" data-fermer>Annuler</button><button class="btn btn-danger" type="submit">Retirer ${esc(autre.pseudo)}</button></div>
  </form>`);
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());
  d.querySelector('.btn-ghost').focus();
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = d.querySelector('.btn-danger'); b.disabled = true;
    const st = lireComptes();
    await revoquerSession(autre.rt, { push: st?.push === autre.id });
    ecrireComptes({ ...(st || {}), autres: (st?.autres || []).filter((x) => x.id !== autre.id), push: st?.push === autre.id ? null : st?.push });
    d.close();
    toast(`${autre.pseudo} est retiré de cet appareil.`, 'ok');
    signalerMenu();
    rafraichir?.();
  });
}

/** Déconnexion de tout (comme avant) : session de l'appareil, second compte, push, copie hors ligne, mémoire. */
async function deconnecterTout() {
  await signOutDevice();
  try { sessionStorage.removeItem('hg_badges_checked'); } catch { /* stockage bloqué */ }
  clearPerms();
  location.href = '/pages/compte/compte.html';
}

/** « Déconnecter Ethan » : le compte de la page est déconnecté de l'appareil, on passe sur l'autre. */
async function deconnecterActif(autre) {
  const r = await rouvrir(autre);
  if (!r.session) {
    if (r.reseau) { toast('Connexion impossible pour le moment. Réessaie.', 'error'); return; }
    toast(`La session de ${autre.pseudo} a expiré : les deux comptes sont déconnectés.`, 'error');
    await deconnecterTout();
    return;
  }
  const actif = etat().actif;
  voile(actif, autre);
  debutBascule();
  await signOutDevice({ garderComptes: true });
  const { error } = await sb.auth.setSession({ access_token: r.session.access_token, refresh_token: r.session.refresh_token });
  const st = lireComptes();
  ecrireComptes({ actif: autre, autres: [], push: st?.push === autre.id ? autre.id : null }); // un seul compte : rien n'est gardé
  await nettoyer();
  if (error) { location.href = '/pages/compte/compte.html'; return; }
  try { sessionStorage.setItem(CLE_ARRIVEE, JSON.stringify({ de: '', vers: autre.pseudo, page: currentPageSlug(), label: pageLabel(currentPageSlug()) })); } catch { /* sans message */ }
  location.replace(adresseApres());
}

/**
 * Déconnexion (en-tête, Mon compte, panel) : avec deux comptes, la boîte demande lequel ; sinon, déconnexion habituelle.
 * @returns {Promise<void>}
 */
export async function deconnexion() {
  const st = etat();
  const autre = st.autres[0];
  if (!autre?.rt) { await deconnecterTout(); return; }
  const a = st.actif || { pseudo: 'ce compte' };
  const d = boite(`<form method="dialog" class="stack">
    <h2 class="dialog-title" id="cc-dlg-h">Te déconnecter ?</h2>
    <p class="muted">Deux comptes sont connectés sur cet appareil. Les autres appareils (ton téléphone, par exemple) ne sont pas touchés.</p>
    <div class="cc-choix">
      <button class="btn btn-ghost cc-choix-b" type="button" data-cc-deco="un">${avatarHtml(a, 32)}<span><strong>Déconnecter ${esc(a.pseudo)}</strong><span class="small muted">Tu passes sur ${esc(autre.pseudo)}</span></span></button>
      <button class="btn btn-danger cc-choix-b" type="button" data-cc-deco="deux"><span class="cc-choix-avs">${avatarHtml(a, 32)}${avatarHtml(autre, 32)}</span><span><strong>Déconnecter les deux</strong><span class="small">Retour à la page de connexion</span></span></button>
    </div>
    <div class="btn-row cc-dlg-actions"><button class="btn btn-ghost" type="button" data-fermer>Annuler</button></div>
  </form>`);
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());
  d.querySelector('[data-fermer]').focus();
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cc-deco]');
    if (!b) return;
    d.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    d.close();
    if (b.dataset.ccDeco === 'un') await deconnecterActif(autre); else await deconnecterTout();
  });
}

/* ---------- Autre onglet ---------- */

/** Vrai si un texte est en cours d'écriture dans la page (champ de saisie non vide). */
function brouillon() {
  return [...document.querySelectorAll('#app textarea, #app input:not([type]), #app input[type="text"], #app [contenteditable="true"]')]
    .some((e) => String(e.value ?? e.textContent ?? '').trim());
}

/**
 * Le compte a changé dans un autre onglet : la page est déjà figée (comptes-etat.js, rien ne part). La boîte propose de
 * continuer avec le nouveau compte (rechargement) ou de revenir à l'ancien (sans recharger : un texte en cours est gardé).
 * @param {string} uid Compte désormais actif dans le navigateur.
 */
export function ongletFige(uid) {
  const st = lireComptes();
  const ancien = ficheActive() || { pseudo: 'l’ancien compte' };
  const nouveau = [st?.actif, ...(st?.autres || [])].find((x) => x?.id === uid) || { pseudo: 'un autre compte' };
  const retour = (st?.autres || []).find((x) => x.id === comptePage() && x.rt);
  const d = boite(`<form method="dialog" class="stack">
    <div class="cc-voile-avs cc-dlg-avs">${avatarHtml(ancien, 44)}<span class="cc-voile-fl">${IC_FLECHE}</span>${avatarHtml(nouveau, 44)}</div>
    <h2 class="dialog-title" id="cc-dlg-h">Compte changé dans un autre onglet</h2>
    <p class="muted">Cet onglet affichait ${esc(ancien.pseudo)}. Tu utilises maintenant ${esc(nouveau.pseudo)} sur cet appareil : rien ne part depuis cet onglet tant que tu n’as pas choisi.</p>
    ${brouillon() && retour ? `<p class="cc-note">Un texte que tu écrivais ici n’est pas encore envoyé : « Revenir à ${esc(ancien.pseudo)} » le garde, « Continuer avec ${esc(nouveau.pseudo)} » recharge la page et l’efface.</p>` : ''}
    <p class="cc-err" role="alert" hidden></p>
    <div class="btn-row cc-dlg-actions"><button class="btn btn-primary" type="button" data-cc-onglet="continuer">Continuer avec ${esc(nouveau.pseudo)}</button>${retour ? `<button class="btn btn-ghost" type="button" data-cc-onglet="revenir">Revenir à ${esc(ancien.pseudo)}</button>` : ''}</div>
  </form>`, { fermable: false });
  d.querySelector('.btn-primary').focus();
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cc-onglet]');
    if (!b) return;
    if (b.dataset.ccOnglet === 'continuer') {
      try { sessionStorage.removeItem('hg_view_as'); } catch { /* stockage bloqué */ }
      location.replace(adresseApres());
      return;
    }
    b.disabled = true;
    const r = await rouvrir(retour);
    const err = d.querySelector('.cc-err');
    if (!r.session) {
      err.textContent = r.reseau ? 'Connexion impossible pour le moment. Réessaie.' : `La session de ${ancien.pseudo} a expiré sur cet appareil.`;
      err.hidden = false;
      if (r.reseau) b.disabled = false; else b.remove();
      return;
    }
    debutBascule();
    let cur = null;
    try { cur = (await sb.auth.getSession()).data.session; } catch { /* rien à garder */ }
    const { error } = await sb.auth.setSession({ access_token: r.session.access_token, refresh_token: r.session.refresh_token });
    finBascule();
    if (error) { err.textContent = 'Le retour n’a pas abouti. Continue avec le nouveau compte.'; err.hidden = false; return; }
    const s = lireComptes();
    const parti = [s?.actif, ...(s?.autres || [])].find((x) => x?.id === uid);
    ecrireComptes({ actif: ficheActive(), autres: parti ? [{ ...parti, rt: cur?.refresh_token || null, vu: Date.now() }] : [], push: s?.push });
    d.close();
    toast(`Tu es de nouveau sur ${ancien.pseudo}.`, 'ok');
  });
}

/* ---------- Au démarrage d'une page ---------- */

/** Session du compte actif expirée : on propose de passer à l'autre, jamais en silence. */
function boiteExpireActif(st, autre) {
  const a = st.actif;
  const d = boite(`<form method="dialog" class="stack">
    <div class="cc-dlg-tete">${avatarHtml(a, 44)}<h2 class="dialog-title" id="cc-dlg-h">La session de ${esc(a.pseudo)} a expiré</h2></div>
    <p class="muted">${esc(a.pseudo)} n’est plus connecté sur cet appareil (mot de passe changé, ou déconnexion depuis un autre appareil). ${esc(autre.pseudo)}, lui, est toujours connecté.</p>
    <div class="btn-row cc-dlg-actions"><button class="btn btn-primary" type="button" data-cc-exp="passer">Passer à ${esc(autre.pseudo)}</button><button class="btn btn-ghost" type="button" data-cc-exp="reco">Reconnecter ${esc(a.pseudo)}</button></div>
  </form>`);
  d.querySelector('.btn-primary').focus();
  d.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cc-exp]');
    if (!b) return;
    if (b.dataset.ccExp === 'reco') {
      d.close();
      const champ = document.getElementById('li-email');
      if (champ) champ.focus(); else location.href = '/pages/compte/compte.html';
      return;
    }
    b.disabled = true;
    const r = await rouvrir(autre);
    if (!r.session) {
      d.close();
      if (r.reseau) { toast('Connexion impossible pour le moment. Réessaie.', 'error'); return; }
      ecrireComptes(null);
      toast(`La session de ${autre.pseudo} a aussi expiré : reconnecte-toi.`, 'error');
      return;
    }
    voile(a, autre);
    const { error } = await sb.auth.setSession({ access_token: r.session.access_token, refresh_token: r.session.refresh_token });
    if (error) { location.reload(); return; }
    ecrireComptes({ actif: autre, autres: [{ ...a, rt: null, expire: true, vu: Date.now() }], push: lireComptes()?.push });
    await nettoyer();
    location.reload();
  });
}

/** Clic sur une notification push de l'autre compte (adresse marquée « notif=1 ») : on propose de passer dessus. */
function boiteNotif(st, autre) {
  const a = st.actif;
  const d = boite(`<form method="dialog" class="stack">
    <div class="cc-dlg-tete">${avatarHtml(autre, 44)}<h2 class="dialog-title" id="cc-dlg-h">Cette notification est pour ${esc(autre.pseudo)}</h2></div>
    <p class="muted">Tu es sur ${esc(a.pseudo)}. Passe sur ${esc(autre.pseudo)} pour la voir.</p>
    <div class="btn-row cc-dlg-actions"><button class="btn btn-primary" type="button" data-cc-notif="passer">Passer à ${esc(autre.pseudo)}</button><button class="btn btn-ghost" type="button" data-fermer>Rester sur ${esc(a.pseudo)}</button></div>
  </form>`);
  d.querySelector('[data-fermer]').addEventListener('click', () => d.close());
  d.querySelector('.btn-primary').focus();
  d.querySelector('[data-cc-notif]').addEventListener('click', () => { d.close(); basculer(autre.id); });
}

/**
 * Au démarrage d'une page (init.js, seulement s'il y a des comptes rangés ou un message d'arrivée) : message après une bascule,
 * fiche du compte actif tenue à jour, session du compte actif expirée, notification de l'autre compte.
 * @param {object|null} profile Profil connecté (null : plus de session).
 */
export function auDemarrage(profile) {
  let arrivee = null;
  try { arrivee = JSON.parse(sessionStorage.getItem(CLE_ARRIVEE) || 'null'); sessionStorage.removeItem(CLE_ARRIVEE); } catch { /* sans message */ }
  const st = lireComptes();
  if (profile && arrivee?.vers) {
    if (arrivee.page === currentPageSlug()) toast(`Tu es sur le compte ${arrivee.vers}.${arrivee.de ? ` ${arrivee.de} reste connecté : touche ta photo pour revenir.` : ''}`, 'ok');
    else {
      // L'accueil a déjà dit « Tu n'as pas accès à cette page » (?refus=) : ce message-ci le remplace
      document.querySelectorAll('.toasts .toast.error').forEach((t) => { if (/^Tu n.as pas accès à cette page/.test(t.textContent || '')) t.remove(); });
      toast(`Tu es sur le compte ${arrivee.vers}. La page ${arrivee.label || arrivee.page} ne lui est pas ouverte : te voici à l’accueil.`, 'ok');
    }
  }
  if (!st) return;
  if (profile) {
    // Fiche du compte actif à jour ; un compte connecté autrement (formulaire de connexion) prend la place de l'actif
    const a = ficheActive();
    const autres = st.autres.filter((x) => x.id !== a.id);
    if (st.actif && st.actif.id !== a.id && !autres.some((x) => x.id === st.actif.id)) autres.push({ ...st.actif, rt: null, expire: true, vu: Date.now() });
    autres.sort((x, y) => Number(!!x.expire) - Number(!!y.expire));
    ecrireComptes({ actif: a, autres: autres.slice(0, MAX - 1), push: st.push });
    signalerMenu();
    const u = new URL(location.href);
    if (u.searchParams.get('notif') === '1') {
      u.searchParams.delete('notif');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      const autre = lireComptes()?.autres.find((x) => x.id === st.push && x.rt);
      if (autre) boiteNotif(etat(), autre);
    }
    return;
  }
  const autre = st.actif && st.autres.find((x) => x.rt);
  if (autre) boiteExpireActif(st, autre);
}
