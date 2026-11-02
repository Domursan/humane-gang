// ===== Humane Gang — Jeux à salon : message « l'hôte a changé » des salles d'attente =====
/*
 * Rôle : quand l'hôte d'une salle a disparu 5 minutes (15 pour un meneur humain), le serveur passe la main au premier membre présent (migration 199).
 *   Le message reste affiché tant que la salle est ouverte, sans bouton pour le fermer. Trois lectures : le nouvel hôte
 *   (bloc jaune, .is-moi), l'ancien hôte de retour, le reste de la table. Le serveur ne renvoie hote_passe que pour l'hôte actuel :
 *   un nouveau changement d'hôte efface le message. Loup-Garou : meneur humain parti, en salle (hote_passe.meneur) ou en
 *   cours (meneur_parti, texte seul). Le CSS (.hote-msg) est dans base.css.
 * Dépendances : core.js (esc).
 * Exporte : hoteMsgHtml, majHoteMsg, meneurPartiHtml.
 */
import { esc } from './core.js';

/** Droits rappelés au nouvel hôte, pour une salle sans réglages modifiables. */
export const DROITS_HOTE = 'Tu peux lancer la partie et retirer un joueur.';

const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18h18l-2-10-5 4-2-7-2 7-5-4z"/></svg>';

/** Bloc du message ; texte déjà échappé. */
const bloc = (texte, moi = false) => `<div class="hote-msg${moi ? ' is-moi' : ''}" role="status">${ICONE}<p>${texte}</p></div>`;

/**
 * Message à afficher pour cet état de partie, ou rien.
 * @param {object} e état renvoyé par hg_*_etat.
 * @param {string} [droits] phrase des droits du nouvel hôte.
 * @returns {string} HTML.
 */
export function hoteMsgHtml(e, droits = DROITS_HOTE) {
  const h = e?.hote_passe;
  if (!h) return '';
  const ancien = esc(h.ancien_nom || '?');
  const nouveau = esc(h.nouveau_nom || '?');
  const auto = 'La partie passe en meneur automatique.';
  const moi = e.moi?.user_id;
  if (moi && moi === h.nouveau) {
    return bloc(h.meneur
      ? `Le meneur n’est plus là depuis 15 minutes : tu reprends la salle. ${auto}`
      : `${ancien} n’est plus là depuis 5 minutes : tu deviens l’hôte. ${esc(droits)}`, true);
  }
  if (moi && moi === h.ancien) return bloc(`${nouveau} a repris la salle pendant ton absence. ${h.meneur ? auto : 'Tu restes dans la partie.'}`);
  return bloc(h.meneur
    ? `Le meneur n’est plus là depuis 15 minutes : ${nouveau} reprend la salle. ${auto}`
    : `${ancien} n’est plus là depuis 5 minutes : ${nouveau} devient l’hôte.`);
}

/**
 * Met à jour la zone du message d'une salle : masquée sans message, réécrite seulement si le texte change.
 * @param {?HTMLElement} el zone [data-zone="hote-msg"].
 * @param {object} e état de la partie.
 * @param {string} [droits] phrase des droits du nouvel hôte.
 */
export function majHoteMsg(el, e, droits) {
  if (!el) return;
  const html = hoteMsgHtml(e, droits);
  el.hidden = !html;
  if (el.dataset.cle !== html) { el.dataset.cle = html; el.innerHTML = html; }
}

/**
 * Loup-Garou en cours, meneur humain parti : rien à transférer, la partie avance seule.
 * @param {object} e état de la partie.
 * @returns {string} HTML.
 */
export function meneurPartiHtml(e) {
  return e?.meneur_parti ? bloc('Le meneur n’est plus là : la partie continue toute seule, chaque étape se termine à la fin de son temps.') : '';
}
