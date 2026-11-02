// ===== Humane Gang : bouton Quitter des tables et fenêtres de départ =====
/*
 * Rôle : un seul bouton (même icône, même allure) et une seule fenêtre (ui-confirm.js, annuler = « Rester ») pour partir d'une
 *   table. Le mot et la phrase suivent ce que fait le serveur, cas par cas ; rien n'est promis que le SQL ne fasse pas :
 *   salle : hg_uno_quitter, hg_plat_quitter, hg_ndc_quitter (l'hôte passe au premier membre par place, sinon annulée), hg_lg_quitter
 *   (hôte : annulée pour tous) ; duels : hg_duel_quitter, hg_duel__terminer ; Nom de code : hg_ndc__depart ; Uno : hg_uno__exclure_en_jeu ;
 *   plateaux : hg_plat_quitter (sans retour depuis la migration 198).
 * Page : salles d'attente et tables de Uno, duels, plateaux, Nom de code, Loup-Garou.
 * Dépendances : core.js (esc), ui-confirm.js (confirmBox).
 * Exporte : boutonQuitter, libelleQuitter, DEPART, departSalle, departDefi, departDuel, departNomDeCode, confirmerDepart,
 *   ACTION_EN_COURS, tableLibre, sortieInvite.
 */
import { esc } from './core.js';
import { confirmBox } from './ui-confirm.js';

/** Icône de sortie, identique partout. */
const ICONE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>';

/**
 * HTML du bouton commun.
 * @param {string} texte libellé (masqué au téléphone dans la barre de Uno et de Nom de code, lu par les lecteurs d'écran).
 * @param {{classe?: string, attrs?: string}} [o] classe en plus ; attributs écrits par le code, jamais par un joueur (ex. 'data-quitter').
 * @returns {string}
 */
export function boutonQuitter(texte, { classe = '', attrs = '' } = {}) {
  return `<button type="button" class="btn btn-ghost qt-btn${classe ? ` ${esc(classe)}` : ''}" ${attrs}>${ICONE}<span>${esc(texte)}</span></button>`;
}

/** Change le mot d'un bouton déjà posé (l'hôte d'une salle peut changer, ou rester seul). */
export function libelleQuitter(bouton, texte) {
  const s = bouton?.querySelector('span');
  if (s && s.textContent !== texte) s.textContent = texte;
}

/** Cas sans donnée du jeu. titre : fenêtre ; texte : conséquence ; ok : bouton de la fenêtre, et mot du bouton de la table. */
export const DEPART = {
  salle: { titre: 'Quitter la salle ?', texte: 'Tu peux revenir avec le code tant que la partie n’a pas commencé et qu’il reste une place.', ok: 'Quitter la salle' },
  hoteSeul: { titre: 'Annuler la partie ?', texte: 'Aucun autre membre ne peut devenir hôte : la partie est annulée.', ok: 'Annuler la partie' },
  hoteLoupGarou: { titre: 'Annuler la partie ?', texte: 'La partie est annulée pour tout le monde.', ok: 'Annuler la partie' },
  uno: { titre: 'Quitter la table ?', texte: 'Tes cartes repartent sous la pioche, tu ne peux plus revenir dans cette partie et tu ne reçois pas de Paillettes.', ok: 'Quitter la table' },
  plateau: { titre: 'Quitter la partie ?', texte: 'Le jeu joue pour toi jusqu’à la fin et tu ne reçois pas de Paillettes.', ok: 'Quitter la partie' },
  poker: { titre: 'Quitter la partie ?', texte: 'Tes jetons restent à la table, le jeu joue pour toi jusqu’à la fin et tu ne reçois pas de Paillettes.', ok: 'Quitter la partie' },
};

/**
 * Salle d'attente : le premier membre par place devient hôte (les invités ne le deviennent jamais), sinon la partie est annulée.
 * @param {object} etat état de la partie.
 * @param {{annuleTout?: boolean}} [o] annuleTout : Loup-Garou, l'hôte qui part annule toujours.
 * @returns {{titre: string, texte: string, ok: string}}
 */
export function departSalle(etat, { annuleTout = false } = {}) {
  if (!etat?.moi?.hote) return DEPART.salle;
  if (annuleTout) return DEPART.hoteLoupGarou;
  const suivant = (etat.joueurs || [])
    .filter((j) => !j.invite && !j.parti && j.user_id !== etat.moi.user_id)
    .sort((a, b) => (a.place ?? 0) - (b.place ?? 0))[0];
  if (!suivant) return DEPART.hoteSeul;
  return { ...DEPART.salle, texte: `${suivant.pseudo} devient l’hôte et la partie reste ouverte.` };
}

/** Défi déjà envoyé à un membre (un duel par code part sans fenêtre : personne n'y perd rien). */
export function departDefi(etat) {
  return { titre: 'Annuler le défi ?', texte: `${etat?.defie_pseudo || 'Ton adversaire'} ne pourra plus l’accepter.`, ok: 'Annuler le défi' };
}

/**
 * Abandon d'un duel en cours. hg_duel__terminer : rien contre le robot ou un invité, rien sans manche finie, sinon la part de
 * participation (celui qui abandonne n'est pas écarté).
 * @param {object} etat état du duel.
 * @returns {{titre: string, texte: string, ok: string}}
 */
export function departDuel(etat) {
  const joueurs = etat?.joueurs || [];
  const nom = joueurs.find((j) => j.user_id !== etat?.moi?.user_id)?.pseudo || 'Ton adversaire';
  const mancheFinie = (etat?.partie?.manche ?? 1) > 1 || joueurs.some((j) => j.manches > 0 || j.nuls > 0);
  let suite = 'Tu ne gardes que les Paillettes de participation.';
  if (etat?.partie?.robot > 0) suite = 'Contre le robot, personne ne reçoit de Paillettes.';
  else if (!mancheFinie) suite = 'Aucune manche n’est terminée : personne ne reçoit de Paillettes.';
  else if (joueurs.some((j) => j.invite)) suite = 'Avec un invité, personne ne reçoit de Paillettes.';
  return { titre: 'Abandonner le duel ?', texte: `${nom} gagne le duel. ${suite}`, ok: 'Abandonner' };
}

/**
 * Départ de Nom de code en cours (hg_ndc__depart) : une équipe qui tombe sous 2 joueurs perd par forfait, sinon l'espion est remplacé.
 * @param {object} etat état de la partie.
 * @returns {{titre: string, texte: string, ok: string}}
 */
export function departNomDeCode(etat) {
  const equipe = etat?.moi?.equipe;
  const restants = (etat?.joueurs || []).filter((j) => j.equipe === equipe && !j.parti).length - 1;
  const forfait = !!equipe && restants < 2;
  return {
    titre: 'Quitter la partie ?',
    texte: forfait
      ? 'Ton équipe n’a plus assez de joueurs après ton départ : elle perd par forfait. Tu ne reçois pas de Paillettes.'
      : 'Tu ne peux plus revenir et tu ne reçois pas de Paillettes. Si tu es l’espion, un autre joueur de ton équipe prend ta place.',
    ok: 'Quitter la partie',
  };
}

/** Départ confirmé alors qu'une action n'a toujours pas de réponse. */
export const ACTION_EN_COURS = 'Ton dernier coup est encore en cours. Réessaie de quitter dans un instant.';

/**
 * Attend la fin de l'action en cours, pour qu'un départ confirmé ne soit pas ignoré sans rien dire.
 * @param {() => boolean} occupee vrai tant qu'une action est en cours.
 * @param {number} [delai] attente maximale (ms).
 * @returns {Promise<boolean>} vrai si la table est libre.
 */
export async function tableLibre(occupee, delai = 5000) {
  const fin = Date.now() + delai;
  while (occupee() && Date.now() < fin) await new Promise((ok) => { setTimeout(ok, 100); });
  return !occupee();
}

/**
 * Écran d'un invité qui vient de quitter une table : son jeton est oublié, plus aucune lecture ne peut aboutir.
 * @param {HTMLElement} root zone d'affichage.
 * @param {string} classe classe de carte du jeu.
 * @param {string} page page du jeu, où revenir après la connexion.
 * @param {string} [quoi] « la partie » ou « le duel ».
 */
export function sortieInvite(root, classe, page, quoi = 'la partie') {
  root.innerHTML = `<section class="card ${esc(classe)}" data-sortie-invite>
    <h1 class="display">Tu as quitté ${esc(quoi)}</h1>
    <p>Merci d'être passé. Tu ne peux plus revenir à cette table.</p>
    <p><a class="btn btn-primary" href="/pages/compte/compte.html?next=${encodeURIComponent(page)}">Me connecter</a></p>
  </section>`;
}

/**
 * Ouvre la fenêtre de départ ; annuler se dit « Rester » partout.
 * @param {{titre: string, texte: string, ok: string}} cas
 * @returns {Promise<boolean>} vrai si le joueur confirme.
 */
export function confirmerDepart(cas) {
  return confirmBox(cas.titre, cas.texte, { ok: cas.ok, cancel: 'Rester', danger: true });
}
