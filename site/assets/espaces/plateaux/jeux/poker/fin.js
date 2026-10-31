// ===== Humane Gang — Poker : encart de fin (plateaux/jeux/poker/fin.js) =====
/*
 * Rôle : une carte par joueur dans l'écran de fin : vrai rang (etat.rang : le dernier qui reste est 1er, puis l'ordre d'élimination ;
 *   la colonne rang ne vaut que 1 ou 2, voir vues/fin-fx.js), pseudo dans sa couleur, jetons finaux et mention « éliminé » ou « en lice ».
 *   Le classement, les Paillettes et les badges sont dans l'écran de fin commun (../../vues/fin.js).
 *   finFx : couleurs et textes de la fin du Poker (PK1, PV1 à PV3). Deux joueurs éliminés sur la même main reçoivent du serveur la place
 *   la plus basse (1, 3, 3) : classer les remet à 1 + le nombre de joueurs strictement mieux classés (1, 2, 2). Propre au Poker : les
 *   autres jeux calculent déjà leur rang ainsi, ou n'écrivent que 1 et 2.
 * Dépendances : core.js (esc, initials), commun/effets-duels.js (PALETTES), ../../vues/fin-fx.js (rangReel).
 * Exporte : recap(etat, contenus) -> HTML (chaîne) ; finFx (voir vues/fin.js).
 *   etat.joueurs[i] = { pseudo, couleur, invite, rang, elimine, parti, etat: { jetons, rang } }.
 */
import { esc, initials } from '../../../../commun/core.js';
import { PALETTES } from '../../../../commun/effets-duels.js';
import { rangReel } from '../../vues/fin-fx.js';

/** Couleur de profil sûre (sinon texte clair). */
const couleurDe = (j) => (/^#[0-9a-f]{6}$/i.test(j?.couleur || '') && !j?.invite ? j.couleur : '#F2EFEA');

/** Rang en français : 1er, 2e… */
const rangTexte = (r) => (r === 1 ? '1er' : `${r}e`);

/** Nombre de jetons, format suisse. */
const jetons = (n) => Math.round(Number(n) || 0).toLocaleString('fr-CH');

/** Fin du Poker : accent S06, or et bordeaux. Un joueur éliminé n'a plus de jetons : sa marche donne son rang. */
export const finFx = {
  ac: 'S06',
  c: '#E2C77E',
  conf: PALETTES.pk,
  ligne: 'Dernier joueur à table',
  mesure: (j) => (Number(j.etat?.jetons) > 0 ? `${jetons(j.etat.jetons)} jetons` : rangTexte(rangReel(j) ?? 2)),
  perdu: (j) => (j.elimine ? 'éliminé' : `à ${jetons(j.etat?.jetons)} jetons`),
  classer: (joueurs) => joueurs.map((j) => {
    const r = rangReel(j);
    if (r == null) return j;
    const devant = joueurs.filter((k) => rangReel(k) != null && rangReel(k) < r).length;
    return { ...j, etat: { ...j.etat, rang: devant + 1 } };
  }),
};

/**
 * Encart de fin : une carte par joueur, classée par rang.
 * @param {object} etat état final de la partie (plat.etat).
 * @returns {string} HTML.
 */
export function recap(etat) {
  const joueurs = [...(etat?.joueurs || [])].sort((a, b) => (rangReel(a) ?? 99) - (rangReel(b) ?? 99)
    || (Number(b.etat?.jetons) || 0) - (Number(a.etat?.jetons) || 0));
  if (!joueurs.length) return '';
  const cartes = joueurs.map((j, i) => {
    const rang = rangReel(j) ?? i + 1;
    const etiquette = rang === 1 ? 'Gagnant' : j.elimine ? 'Éliminé' : 'En lice';
    return `<li class="pf-carte${rang === 1 ? ' is-gagnant' : ''}${j.elimine ? ' is-elimine' : ''}${j.parti ? ' is-parti' : ''}">
        <span class="pf-rang">${esc(rangTexte(rang))} · ${esc(etiquette)}</span>
        <span class="pf-disque" style="background:${esc(couleurDe(j))}" aria-hidden="true">${esc(initials(j.pseudo || '?'))}</span>
        <strong class="pf-pseudo">${esc(j.pseudo || '?')}${j.invite ? ' <span class="pf-etiquette">invité</span>' : ''}</strong>
        <span class="pf-jetons"><span class="visually-hidden">Jetons finaux : </span>${esc(jetons(j.etat?.jetons))}</span>
        <span class="pf-muet small">jetons à la fin</span>
      </li>`;
  }).join('');
  return `<section class="pf-bloc" aria-labelledby="pf-fin-titre">
    <h2 id="pf-fin-titre" class="pf-bloc-titre">Les joueurs</h2>
    <ol class="pf-grille">${cartes}</ol>
  </section>`;
}
