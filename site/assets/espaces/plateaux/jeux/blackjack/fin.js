// ===== Humane Gang — Blackjack : encart de fin (plateaux/jeux/blackjack/fin.js) =====
/*
 * Rôle : une carte par joueur dans l'écran de fin : vrai rang (etat.rang, la colonne rang ne vaut que 1 ou 2 : voir vues/fin-fx.js),
 *   pseudo dans sa couleur, jetons finaux et écart avec les jetons de départ. Le classement, les Paillettes et les badges sont dans
 *   l'écran de fin commun (../../vues/fin.js). finFx : couleurs et textes de la fin du Blackjack (BJ1, PV1 à PV3).
 *   Le serveur fait gagner le meilleur tapis, même sous les jetons de départ : seul et reparti avec moins, pas de fête (sobre) ; à
 *   plusieurs, le bandeau ne dit que la banque a payé que si le gagnant a vraiment gagné des jetons. Tout le monde à zéro : pas de rang.
 * Dépendances : core.js (esc, initials), commun/effets-duels.js (PALETTES), ../../vues/fin-fx.js (gagnantsDe, rangReel).
 * Exporte : recap(etat, contenus) -> HTML (chaîne) ; finFx (voir vues/fin.js).
 *   etat.joueurs[i] = { pseudo, couleur, invite, rang, parti, etat: { jetons, rang } } ; etat.partie.options.jetons = départ.
 */
import { esc, initials } from '../../../../commun/core.js';
import { PALETTES } from '../../../../commun/effets-duels.js';
import { gagnantsDe, rangReel } from '../../vues/fin-fx.js';

/** Couleur de profil sûre (sinon texte clair). */
const couleurDe = (j) => (/^#[0-9a-f]{6}$/i.test(j?.couleur || '') && !j?.invite ? j.couleur : '#F2EFEA');

/** Rang en français : 1er, 2e… */
const rangTexte = (r) => (r === 1 ? '1er' : `${r}e`);

/** Nombre de jetons, format suisse, avec signe pour un écart. */
const jetons = (n) => Math.round(Number(n) || 0).toLocaleString('fr-CH');

/** Jetons de départ de la partie. */
const departDe = (e) => Number(e?.partie?.options?.jetons) || 1000;

/** Fin du Blackjack : accent S05, or sur tapis vert ; podium et phrase de fin en jetons. */
export const finFx = {
  ac: 'S05',
  c: '#E2C77E',
  conf: PALETTES.bj,
  ligne: (e) => (Math.max(...(e.joueurs || []).map((j) => Number(j.etat?.jetons) || 0)) > departDe(e) ? 'La banque a payé' : ''),
  sobre: (e) => {
    const js = e.joueurs || [];
    const n = Number(js[0]?.etat?.jetons) || 0;
    return js.length === 1 && n < departDe(e) ? `Partie finie avec ${jetons(n)} jetons` : '';
  },
  mesure: (j) => (rangReel(j) === 1 ? `${jetons(j.etat?.jetons)} jetons` : jetons(j.etat?.jetons)),
  perdu: (j) => `à ${jetons(j.etat?.jetons)} jetons`,
};

/**
 * Encart de fin : une carte par joueur, classée par rang (puis jetons).
 * @param {object} etat état final de la partie (plat.etat).
 * @returns {string} HTML.
 */
export function recap(etat) {
  const depart = departDe(etat);
  const joueurs = [...(etat?.joueurs || [])].sort((a, b) => (rangReel(a) ?? 99) - (rangReel(b) ?? 99)
    || (Number(b.etat?.jetons) || 0) - (Number(a.etat?.jetons) || 0));
  if (!joueurs.length) return '';
  const gagnants = finFx.sobre(etat) ? [] : gagnantsDe(joueurs);
  const sansGagnant = !gagnantsDe(joueurs).length;   // à zéro jeton pour tous, tout le monde a le rang 1 sans avoir gagné
  const cartes = joueurs.map((j, i) => {
    const total = Number(j.etat?.jetons) || 0;
    const ecart = total - depart;
    const rang = rangReel(j) ?? i + 1;
    const gagnant = gagnants.includes(j);
    const signe = ecart > 0 ? `+${jetons(ecart)}` : ecart < 0 ? `−${jetons(-ecart)}` : '±0';
    return `<li class="bf-carte${gagnant ? ' is-gagnant' : ''}${j.parti ? ' is-parti' : ''}">
        <span class="bf-rang">${esc(sansGagnant ? '–' : rangTexte(rang))}${gagnant ? ' · Gagnant' : ''}</span>
        <span class="bf-disque" style="background:${esc(couleurDe(j))}" aria-hidden="true">${esc(initials(j.pseudo || '?'))}</span>
        <strong class="bf-pseudo">${esc(j.pseudo || '?')}${j.invite ? ' <span class="bf-etiquette">invité</span>' : ''}</strong>
        <span class="bf-jetons"><span class="visually-hidden">Jetons finaux : </span>${esc(jetons(total))}</span>
        <span class="bf-ecart small">${esc(signe)} depuis le départ (${esc(jetons(depart))})</span>
      </li>`;
  }).join('');
  return `<section class="bf-bloc" aria-labelledby="bf-fin-titre">
    <h2 id="bf-fin-titre" class="bf-bloc-titre">Les jetons de chacun</h2>
    <ol class="bf-grille">${cartes}</ol>
  </section>`;
}
