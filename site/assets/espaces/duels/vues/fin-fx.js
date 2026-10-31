// ===== Humane Gang — Duels : effets de fin partagés =====
/**
 * Rôle : quand un duel vu en direct se termine, joue le son de fin, fait briller le gagnant sur l'écran de fin
 *   (vues/fin.js), puis affiche un bandeau bref au milieu de la page et des confettis pour le gagnant.
 *   Seulement si la table du jeu a reçu un état « en cours » dans cette page (pas en ouvrant un duel déjà fini).
 *   Mouvement réduit, préférence « effets » coupée ou réglage calme des duels : pas d'animation, le son reste.
 *   Le cadre (vues/commun.js) appelle vuEnCours à chaque état : une table n'a plus besoin de le faire.
 *   Abandon, forfait, défi refusé ou expiré : effetsCause remplace les effets du jeu (AB1, AB2, FO1, FO2, DF1, DF2) : ni victoire
 *   normale, ni confettis, ni texte du jeu (TX1). vues/fin.js n'appelle donc pas effetsFin du jeu dans ces cas.
 * Dépendances : ../../../commun/sons-jeux.js (jouerSonJeu), ../../../commun/effets-duels.js.
 *   Une partie quittée pendant sa table n'est plus « vue en direct » : vues/partie.js appelle oublierPartie en sortant.
 * Exporte : vuEnCours(partie), vuEnAttente(partie), oublierPartie(id), finEnDirect(partie), sonFin(jeu, n), arreterEffetsFin(), fxFin, issueDuel(e), causeFin(e), effetsCause(root, e),
 *   effetsFinDuel(root, e, { jeu, son(issue), titre(issue, e) }).
 *   issue = 'gagnant' | 'perdant' | 'nulle' | 'spectateur' (vue par moi). son(issue) rend un numéro du groupe jeu, ou un code S01…S20.
 */
import { jouerSonJeu, sonsPrets } from '../../../commun/sons-jeux.js';
import { anime, creerEffets, son } from '../../../commun/effets-duels.js';

/** Parties (ids) dont une table a reçu un état « en cours » dans cette page. */
const EN_COURS = new Set();
/** Parties (ids) dont la salle d'attente a été vue dans cette page. */
const EN_ATTENTE = new Set();
const COULEURS = ['#D93A3F', '#F2B705', '#E2C77E', '#159946', '#2B5AE2', '#4E2398'];

/** Effets de la fin : nettoyés en quittant le duel (vues/partie.js). Les pièces propres à un jeu peuvent s'y accrocher. */
export const fxFin = creerEffets();
export const arreterEffetsFin = () => fxFin.nettoyer();

/** À appeler par la table à chaque état : retient les parties vues en cours. */
export function vuEnCours(p) {
  if (p?.statut === 'en_cours' && p.id) EN_COURS.add(p.id);
}

/** On quitte le duel : s'il finit plus tard, le rouvrir dans la même page n'est pas une fin vue en direct. */
export function oublierPartie(id) {
  EN_COURS.delete(id);
  EN_ATTENTE.delete(id);
}

/** Vrai une seule fois pour une partie terminée vue en cours dans cette page. */
export const finEnDirect = (p) => p?.statut === 'terminee' && EN_COURS.delete(p.id);

/** Son numéroté d'une fin. Sauté si le contexte audio ne tourne pas, comme son() : il partirait en retard, avec tous les autres. */
export function sonFin(jeu, n) {
  if (sonsPrets()) jouerSonJeu(jeu, n);
}

/** À appeler par la salle à chaque état : retient les parties vues en attente. */
export function vuEnAttente(p) {
  if (p?.statut === 'attente' && p.id) EN_ATTENTE.add(p.id);
}

/** Feuille de style des effets, ajoutée une seule fois. */
function styles() {
  if (document.getElementById('duels-fin-fx-css')) return;
  const s = document.createElement('style');
  s.id = 'duels-fin-fx-css';
  s.textContent = `
.duels-finfx-brille { animation: duels-finfx-pouls 1.2s ease-in-out 4; border-radius: 14px; }
@keyframes duels-finfx-pouls { 50% { box-shadow: 0 0 0 5px #E2C77E, 0 0 36px rgba(226, 199, 126, .85); } }
.duels-finfx-ban { position: fixed; left: 50%; top: 72%; transform: translate(-50%, -50%) scale(.5); opacity: 0; z-index: 9000;
  pointer-events: none; white-space: nowrap; font: 400 clamp(30px, 5vw, 56px) 'Archivo Black', Inter, sans-serif; color: #fff;
  text-shadow: 0 4px 0 rgba(0, 0, 0, .6), 0 0 30px rgba(226, 199, 126, .9); animation: duels-finfx-ban 2.2s cubic-bezier(.2, 1.4, .4, 1) forwards; }
.duels-finfx-ban small { display: block; text-align: center; font: 700 15px Inter, system-ui, sans-serif; letter-spacing: .1em; text-transform: uppercase; }
@keyframes duels-finfx-ban { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5) rotate(-6deg); }
  20% { opacity: 1; transform: translate(-50%, -50%) scale(1.06) rotate(-2deg); } 35% { transform: translate(-50%, -50%) scale(1) rotate(-2deg); }
  85% { opacity: 1; } 100% { opacity: 0; } }
.duels-finfx-conf { position: fixed; top: -10px; width: 8px; height: 14px; z-index: 8999; pointer-events: none; animation: duels-finfx-tombe linear forwards; }
@keyframes duels-finfx-tombe { to { transform: translateY(105vh) rotate(720deg); } }
@media (prefers-reduced-motion: reduce) { .duels-finfx-brille, .duels-finfx-ban, .duels-finfx-conf { animation: none; display: none; } }`;
  document.head.append(s);
}

/** Bandeau fixe au milieu de la page (sans clic, retiré après 2,3 s). Textes posés en textContent. */
function bandeau(titre, sous) {
  const b = document.createElement('div');
  b.className = 'duels-finfx-ban';
  b.append(titre);
  if (sous) { const s = document.createElement('small'); s.textContent = sous; b.append(s); }
  fxFin.vol(b, 2300);
}

/** Confettis : 70 rectangles qui tombent, retirés après 4 s. */
function confettis() {
  for (let i = 0; i < 70; i++) {
    const d = document.createElement('i');
    d.className = 'duels-finfx-conf';
    d.style.left = `${Math.random() * 100}vw`;
    d.style.background = COULEURS[i % COULEURS.length];
    d.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    d.style.animationDelay = `${Math.random() * 0.5}s`;
    fxFin.vol(d, 4000);
  }
}

/** Gagnant d'un duel terminé, ou null. */
const gagnantDe = (e) => (e.joueurs || []).find((j) => j.gagne) || (e.joueurs || []).find((j) => j.user_id === e.partie?.vainqueur) || null;

/**
 * Issue du duel pour moi.
 * @param {object} e état du duel terminé.
 * @returns {'gagnant'|'perdant'|'nulle'|'spectateur'}
 */
export function issueDuel(e) {
  const g = gagnantDe(e);
  if (!e.moi?.joue) return 'spectateur';
  if (!g) return 'nulle';
  return g.user_id === e.moi.user_id ? 'gagnant' : 'perdant';
}

/**
 * Raison d'une fin qui ne vient pas du jeu.
 * Le serveur ne stocke pas pourquoi un défi est annulé : le refus et l'annulation laissent une ligne de journal
 * (hg_duel_refuser, hg_duel_quitter), l'expiration aucune, seulement une échéance dépassée (hg_duel_tick, hg_duel_avancer).
 * @param {object} e état du duel.
 * @returns {'abandon'|'forfait'|'refus'|'expire'|'annule'|null} null : fin normale.
 */
export function causeFin(e) {
  const p = e?.partie || {};
  if (p.statut === 'annulee') {
    if (!p.defie) return 'annule';
    const lignes = (e.journal || []).map((x) => String(x.texte || ''));
    if (lignes.some((t) => t.endsWith('refuse le défi.'))) return 'refus';
    if (lignes.some((t) => t === 'Le duel est annulé.')) return 'annule';
    const maintenant = e.maintenant ? new Date(e.maintenant).getTime() : Date.now();
    return p.defi_expire && new Date(p.defi_expire).getTime() <= maintenant ? 'expire' : 'annule';
  }
  if (p.abandon) return 'abandon';
  if (p.forfait) return 'forfait';
  return null;
}

/**
 * Effets d'une fin qui ne vient pas du jeu (une seule fois, partie vue en direct).
 * @param {HTMLElement} root écran de fin (vues/fin.js).
 * @param {object} e état du duel.
 * @returns {boolean} vrai si cette fin n'est pas une fin normale : les effets du jeu ne doivent pas se jouer.
 */
export function effetsCause(root, e) {
  const cause = causeFin(e);
  if (!cause) return false;
  const p = e.partie;
  if (cause === 'refus' || cause === 'expire') {
    if (EN_ATTENTE.delete(p.id)) son('S13');
    return true;
  }
  if (cause === 'annule' || !EN_COURS.delete(p.id)) return true;
  const issue = issueDuel(e);
  const abandon = cause === 'abandon';
  fxFin.classe(root.querySelector('.duels-fin-ico'), 'is-anime', 1000);
  fxFin.classe(root.querySelector('.duels-fin-bandeau'), 'fxd-pop', 500);
  if (issue === 'gagnant') {
    son(abandon ? 'S09' : 'S11');
    fxFin.bandeau(abandon ? 'Abandon adverse' : 'Forfait', 'Duel gagné', { ton: 'n' });
  } else if (issue === 'perdant') {
    son(abandon ? 'S10' : 'S11');
  } else {
    fxFin.bandeau(abandon ? 'Abandon' : 'Forfait', `${gagnantDe(e)?.pseudo || '?'} gagne le duel`, { ton: 'n' });
  }
  return true;
}

/**
 * Effets de fin d'un duel vu en direct.
 * @param {HTMLElement} root écran de fin (vues/fin.js).
 * @param {object} e état du duel terminé.
 * @param {{jeu: string, son: (issue: string) => number|string|null, titre: (issue: string, e: object) => [string, string]|null}} o
 */
export function effetsFinDuel(root, e, o) {
  const p = e.partie || {};
  if (!finEnDirect(p)) return;
  const issue = issueDuel(e);
  const n = o.son(issue);
  if (typeof n === 'string') son(n);
  else if (n) sonFin(o.jeu, n);
  if (!anime()) return;
  styles();
  const g = root.querySelector('.duels-fin-joueur.is-gagnant');
  if (g) fxFin.classe(g, 'duels-finfx-brille', 4800);
  const t = o.titre(issue, e);
  fxFin.plus(() => {
    if (t) bandeau(t[0], t[1]);
    if (issue === 'gagnant') confettis();
  }, 300);
}
