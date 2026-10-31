// ===== Humane Gang — Catan du gang : encart de fin (plateaux/jeux/catan/fin.js) =====
/*
 * Rôle : encart de fin de Catan du gang : le bilan de chacun, au vrai rang (points, colonies, villes, routes, cartes restantes).
 *   Le classement et les récompenses sont à part, dans l'écran de fin commun (plateaux/vues/fin.js).
 *   finFx : couleurs et textes de la fin de Catan (CT1, PV1 à PV3).
 * Dépendances : core.js (esc), commun/effets-duels.js (PALETTES), ../../vues/fin-fx.js (rangReel).
 * Exporte : recap(etat) -> HTML (chaîne) ; finFx (voir vues/fin.js).
 *   etat.joueurs[i].etat = { points, colonies, villes, routes, cartes, rang } ; etat.jeu.objectif (10 ou 8).
 */
import { esc } from '../../../../commun/core.js';
import { PALETTES } from '../../../../commun/effets-duels.js';
import { rangReel } from '../../vues/fin-fx.js';

/** Couleur de profil sûre (sinon crème). */
const couleurDe = (j) => (/^#[0-9a-f]{6}$/i.test(j?.couleur || '') ? j.couleur : '#F2EFEA');
/** Pluriel simple : « 1 ville », « 2 villes ». */
const nombre = (n, mot, pluriel) => `${n} ${n > 1 ? pluriel : mot}`;

/** Points d'un joueur en toutes lettres. */
const pointsDe = (j) => nombre(Number(j?.etat?.points) || 0, 'point', 'points');

/** Fin de Catan : accent S07, confettis aux couleurs des terrains. */
export const finFx = {
  ac: 'S07',
  c: '#E8B04B',
  conf: PALETTES.ct,
  ligne: (e) => pointsDe((e.joueurs || []).find((j) => j.user_id === e.moi?.user_id)),
  mesure: (j) => pointsDe(j),
  perdu: (j) => `à ${pointsDe(j)}`,
};

/**
 * Encart de fin : bilan de chaque joueur, du premier au dernier.
 * @param {object} etat état final de la partie (plat.etat).
 * @returns {string} HTML.
 */
export function recap(etat) {
  const joueurs = (etat?.joueurs || []).filter((j) => !j.parti).map((j) => {
    const e = j.etat || {};
    return { j, points: Number(e.points) || 0, colonies: Number(e.colonies) || 0, villes: Number(e.villes) || 0,
      routes: Number(e.routes) || 0, cartes: Number(e.cartes) || 0, rang: Number(rangReel(j)) || null };
  }).sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99) || b.points - a.points);

  const lignes = joueurs.map(({ j, points, colonies, villes, routes, cartes, rang }, i) => {
    const place = rang ?? i + 1;
    const gagnant = place === 1 ? ' <span class="ct-invite">gagnant</span>' : '';
    const tag = j.invite ? ' <span class="ct-invite">invité</span>' : '';
    return `<li class="ct-fin-ligne${place === 1 ? ' is-gagnant' : ''}">
      <span class="ct-fin-rang">${esc(place)}${place === 1 ? 'er' : 'e'}</span>
      <strong class="ct-fin-pseudo" style="color:${esc(couleurDe(j))}">${esc(j.pseudo || '?')}${tag}${gagnant}</strong>
      <span class="ct-fin-points">${esc(points)} point${points > 1 ? 's' : ''}</span>
      <span class="ct-fin-detail">${esc([nombre(colonies, 'colonie', 'colonies'), nombre(villes, 'ville', 'villes'), nombre(routes, 'route', 'routes'), nombre(cartes, 'carte', 'cartes') + ' en main'].join(' · '))}</span>
    </li>`;
  }).join('');

  return `<div class="ct-fin">
    <section class="ct-bloc" aria-labelledby="ct-fin-titre">
      <h2 id="ct-fin-titre" class="ct-bloc-titre">Le bilan</h2>
      <ol class="ct-fin-liste">${lignes || '<li class="ct-note">Aucun joueur classé.</li>'}</ol>
    </section>
  </div>`;
}
