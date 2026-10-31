// ===== Humane Gang — Pictionary : encart de fin (plateaux/jeux/pictionary/fin.js) =====
/*
 * Rôle : HTML de l'encart de fin de Pictionary : le classement aux points de chacun, au vrai rang : deux joueurs à égalité partagent
 *   le leur (le classement et les récompenses communs sont dans l'écran de fin partagé, vues/fin.js).
 *   finFx : couleurs et textes de la fin de Pictionary (PI1, PV1 à PV3).
 * Dépendances : core.js (esc), commun/effets-duels.js (PALETTES), ../../vues/commun.js (avatarHtml, pseudoHtml),
 *   ../../vues/fin-fx.js (rangReel).
 * Exporte : recap(etat, contenus) -> HTML (chaîne) ; finFx (voir vues/fin.js).
 *   etat.joueurs[i].etat.points : points de chaque joueur ; joueurs triés du plus au moins de points.
 */
import { esc } from '../../../../commun/core.js';
import { PALETTES } from '../../../../commun/effets-duels.js';
import { avatarHtml, pseudoHtml } from '../../vues/commun.js';
import { rangReel } from '../../vues/fin-fx.js';

/** Points d'un joueur en toutes lettres. */
const pointsDe = (j) => {
  const n = Number(j?.etat?.points) || 0;
  return `${n} point${n > 1 ? 's' : ''}`;
};

/** Fin de Pictionary : accent S08, confettis aux couleurs des crayons. */
export const finFx = {
  ac: 'S08',
  c: '#E8CC85',
  conf: PALETTES.pi,
  ligne: (e) => pointsDe((e.joueurs || []).find((j) => j.user_id === e.moi?.user_id)),
  mesure: (j) => pointsDe(j),
  perdu: (j) => `à ${pointsDe(j)}`,
};

/**
 * Encart de fin : points de chaque joueur, du plus au moins.
 * @param {object} etat état final de la partie (plat.etat).
 * @returns {string} HTML.
 */
export function recap(etat) {
  const joueurs = (etat?.joueurs || [])
    .filter((j) => !j.parti)
    .map((j) => ({ ...j, points: Number(j.etat?.points) || 0 }))
    .sort((a, b) => b.points - a.points || (Number(a.place) || 0) - (Number(b.place) || 0));
  const sansGagnant = !joueurs.some((j) => j.points > 0);   // tout le monde à zéro : le serveur ne désigne personne
  const lignes = joueurs.map((j, i) => `<li class="pi-fin-ligne">
      <span class="pi-rang" aria-hidden="true">${sansGagnant ? '–' : esc(rangReel(j) ?? i + 1)}</span>
      ${avatarHtml(j, 32)}
      <span class="pi-fin-nom">${pseudoHtml(j)}</span>
      <span class="pi-points"><span class="visually-hidden">Points : </span>${esc(j.points)} pt${j.points > 1 ? 's' : ''}</span>
    </li>`).join('');
  return `<section class="pi-fin" aria-labelledby="pi-fin-titre">
    <h2 id="pi-fin-titre" class="pi-bloc-titre">Points</h2>
    ${lignes ? `<ol class="pi-fin-liste">${lignes}</ol>` : '<p class="pi-vide small muted">Aucun point à afficher.</p>'}
  </section>`;
}
