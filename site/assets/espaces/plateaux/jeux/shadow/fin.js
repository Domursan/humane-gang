// ===== Humane Gang — Shadow Hunters : encart de fin (plateaux/jeux/shadow/fin.js) =====
/*
 * Rôle : HTML de l'encart de fin de Shadow Hunters, façon maquette shadow-s7 : grand titre du camp gagnant,
 *   une carte par personnage (portrait, camp, vivant ou mort, PV, victoire, gagnant), et le bilan de la partie.
 *   Le classement et les récompenses sont dans l'écran de fin commun (plateaux/vues/fin.js).
 *   Au passage, la fin est jouée (bandeau au titre du camp, confettis pour les gagnants, son) par ./effets.js, une seule fois, si la table a suivi la partie.
 * Dépendances : core.js (esc), ../../api.js (nomDe), ../../vues/commun.js (imagePlateau),
 *   ./plateau.js (campDe, CAMP_LIBELLE, couleurCamp, PV_MAX, persoVisuelHtml), ./effets.js (jouerFin).
 * Exporte : recap(etat, contenus) -> HTML (chaîne).
 *   etat.joueurs[i] = { user_id, pseudo, elimine, gagne, etat: { revele, perso, camp, degats } } ;
 *   Le titre vient de la liste réelle des gagnants et de leur camp, publics à la fin. etat.partie.raison ne suffit pas : le serveur y
 *   met 'hunters' même si les Shadows gagnent aussi, et 'neutre' pour un ou plusieurs Neutres (migration 127).
 */
import { esc } from '../../../../commun/core.js';
import { nomDe } from '../../api.js';
import { imagePlateau } from '../../vues/commun.js';
import { campDe, CAMP_LIBELLE, couleurCamp, PV_MAX, persoVisuelHtml } from './plateau.js';
import { jouerFin } from './effets.js';

/** Titres et couleurs de la fin de partie. */
const ISSUE = {
  deux: { titre: 'Hunters et Shadows gagnent', couleur: '#E2C77E' },
  hunters: { titre: 'Les Hunters gagnent', couleur: '#7FA3D6' },
  shadows: { titre: 'Les Shadows gagnent', couleur: '#E0909A' },
  neutre: { titre: 'Un Neutre gagne seul', couleur: '#E2C77E' },
  neutres: { titre: 'Des Neutres gagnent', couleur: '#E2C77E' },
  inconnue: { titre: 'Les personnages', bandeau: 'Partie terminée', couleur: '#B7C4DA' },
};

/** Issue d'après les gagnants réels : un camp qui gagne prime sur les Neutres qui gagnent avec lui, montrés sur leur carte. */
function issueDe(etat) {
  const camps = (etat?.joueurs || []).filter((j) => j.gagne).map((j) => j.etat?.camp || campDe(j.etat?.perso));
  const hunters = camps.includes('hunter');
  const shadows = camps.includes('shadow');
  if (hunters && shadows) return ISSUE.deux;
  if (hunters) return ISSUE.hunters;
  if (shadows) return ISSUE.shadows;
  const neutres = camps.filter((c) => c === 'neutre').length;
  if (!neutres) return ISSUE.inconnue;
  return neutres > 1 ? ISSUE.neutres : ISSUE.neutre;
}

/** Encart de fin : grand titre, une carte par personnage, bilan. */
export function recap(etat, contenus) {
  const issue = issueDe(etat);
  try { jouerFin(etat, issue.bandeau || issue.titre, issue.couleur); } catch (err) { console.warn('[shadow] fin', err); }
  const vivants = (etat?.joueurs || []).filter((j) => !j.parti);
  const cartes = vivants.map((j, i) => {
    const s = j.etat || {};
    const perso = s.perso || null;
    const camp = s.camp || campDe(perso);
    const info = (contenus?.personnages || []).find((p) => p.id === perso) || {};
    const nom = perso ? nomDe(contenus, 'personnages', perso) : 'Personnage inconnu';
    const max = perso ? PV_MAX[perso] : null;
    const pv = max != null ? Math.max(0, max - (s.degats ?? 0)) : null;
    const visuel = perso
      ? `<img src="${esc(imagePlateau('shadow', `perso-${perso}`))}" alt="" width="400" height="300" loading="lazy">`
      : persoVisuelHtml(camp);
    const classes = ['sh-fin-carte'];
    if (j.gagne) classes.push('is-gagnant');
    if (j.elimine) classes.push('is-mort');
    return `<li class="${classes.join(' ')}" style="--camp:${couleurCamp(camp)};--i:${i}">
      <div class="sh-fin-visuel">${visuel}<span class="sh-fin-camp">${esc(camp ? CAMP_LIBELLE[camp] : 'Camp inconnu')}</span></div>
      <div class="sh-fin-corps">
        <strong class="sh-fin-nom">${esc(nom)}</strong>
        <span class="sh-fin-joueur">${esc(j.pseudo || '?')}</span>
        <span class="sh-fin-etat">${esc(j.elimine ? 'Mort' : 'Vivant')}${pv != null ? ` · ${esc(pv)} / ${esc(max)} PV` : ''}</span>
        <span class="sh-fin-bilan">${esc(j.gagne ? 'Gagnant' : 'Non gagnant')}</span>
        ${info.victoire ? `<p class="sh-fin-victoire"><span class="sh-label">Victoire :</span> ${esc(info.victoire)}</p>` : ''}
      </div>
    </li>`;
  }).join('');
  const tours = etat?.partie?.nb_tours ?? 0;
  const gagnants = vivants.filter((j) => j.gagne).length;
  return `<div class="sh-fin" style="--sh-fin-couleur:${issue.couleur}">
    <section class="sh-bloc" aria-labelledby="sh-fin-titre" style="background:transparent;border:0;box-shadow:none;padding:0">
      <div class="sh-fin-entete">
        <p class="sh-fin-kicker">Résultat final</p>
        <h2 id="sh-fin-titre" class="sh-fin-titre">${esc(issue.titre)}</h2>
      </div>
      <ul class="sh-fin-cartes">${cartes || '<li class="sh-vide">Aucun personnage.</li>'}</ul>
      <p class="sh-fin-resume">
        <span>Tours joués : ${esc(tours)}</span>
        <span>Joueurs : ${esc(vivants.length)}</span>
        <span>Gagnants : ${esc(gagnants)}</span>
      </p>
    </section>
  </div>`;
}
