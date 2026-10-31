// ===== Humane Gang — Monopoly : encart de fin (plateaux/jeux/monopoly/fin.js) =====
/*
 * Rôle : HTML de l'encart de fin du Monopoly : classement par fortune (argent, terrains, maisons)
 *   et titres de chacun, groupés par couleur. Le classement général et les récompenses sont à part (écran commun).
 *   Fin vécue en direct (la table vient de se fermer sur cette partie, voir effets.js) : pour le gagnant, bandeau « Partie
 *   terminée », confettis (CSS seulement, sans mouvement réduit) et son « Victoire » ; pour les autres, bandeau sobre « Partie
 *   perdue » et S02 (MP1) ; pour un joueur parti, bandeau neutre et S04. Une seule fois : la fin consommée ne rejoue pas.
 * Dépendances : core.js (esc, initials), ../../api.js (nomDe), commun/sons-jeux.js (jouerSonJeu), commun/effets-duels.js (anime, son),
 *   ../../vues/fin-fx.js (fxFin, gagnantsDe, issuePlateau), ./effets.js (finEnDirect) ; styles : ../../monopoly.css (classes mo-fin, mo-classe…).
 * Exporte : recap(etat, contenus) -> HTML (chaîne).
 *   La fortune vient de etat.jeu.fortunes[user_id] (sinon de joueur.etat.fortune). Les titres viennent de etat.jeu.proprietes.
 */
import { esc, initials } from '../../../../commun/core.js';
import { nomDe } from '../../api.js';
import { jouerSonJeu } from '../../../../commun/sons-jeux.js';
import { anime as finAnimee, son } from '../../../../commun/effets-duels.js';
import { fxFin, gagnantsDe, issuePlateau } from '../../vues/fin-fx.js';
import { finEnDirect } from './effets.js';

const JEU = 'monopoly';
const EUR = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} €`;
const COULEUR_OK = /^#[0-9a-f]{6}$/i;
const COULEURS_CONFETTI = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398', '#E2C77E'];

/**
 * Bandeau « Partie terminée » et confettis, en CSS (position fixe, aucun clic intercepté, disparaît seul en 2,9 s).
 * Les positions et durées sont fixes d'un confetti à l'autre : le rendu reste stable.
 * @returns {string} HTML.
 */
function feteHtml() {
  const confettis = Array.from({ length: 60 }, (_, i) => {
    const x = (i * 37) % 100;
    const duree = (1.6 + (((i * 17) % 16) / 10)).toFixed(2);
    const delai = (((i * 13) % 5) / 10).toFixed(1);
    return `<i class="mo-conf" style="left:${x}vw;background:${COULEURS_CONFETTI[i % COULEURS_CONFETTI.length]};animation-duration:${duree}s;animation-delay:${delai}s"></i>`;
  }).join('');
  return `<div class="mo-fete" aria-hidden="true">
    <div class="mo-fete-banc">Partie terminée<small>Le plus riche gagne</small></div>
    <div class="mo-fete-confettis">${confettis}</div>
  </div>`;
}

/** « Alice est la plus riche » ; deux gagnants à égalité : « Alice et Bruno sont les plus riches ». */
function ligneFin(etat) {
  const g = gagnantsDe(etat.joueurs || []).map((j) => j.pseudo);
  if (!g.length) return '';
  return g.length > 1 ? `${g.slice(0, -1).join(', ')} et ${g[g.length - 1]} sont les plus riches` : `${g[0]} est la plus riche`;
}

/**
 * Effets d'une fin vue en direct. Son et bandeau sobre partent d'ici ; la fête du gagnant est dans le HTML de l'encart.
 * @param {object} etat état final de la partie.
 * @returns {string} HTML de la fête, vide si elle n'est pas pour moi.
 */
function effetsFin(etat) {
  const issue = issuePlateau(etat);
  if (issue === 'gagnant') {
    jouerSonJeu(JEU, 5);
    return finAnimee() ? feteHtml() : '';
  }
  if (issue === 'perdant') {
    son('S02');
    fxFin.bandeau('Partie perdue', ligneFin(etat), { ton: 'd' });
  } else if (issue) {
    son('S04');
    fxFin.bandeau('Partie terminée', ligneFin(etat), { ton: 'n' });
  }
  return '';
}

/** Fortune d'un joueur : d'après jeu.fortunes, sinon d'après son état. */
function fortuneDe(etat, j) {
  const f = etat?.jeu?.fortunes?.[j.user_id];
  if (f != null) return Number(f) || 0;
  return Number(j.etat?.fortune) || 0;
}

/** Titres d'un joueur : cases possédées, triées par numéro, avec leur groupe et leur nombre de maisons. */
function titresDe(etat, contenus, uid) {
  const props = etat?.jeu?.proprietes || {};
  const plateau = etat?.jeu?.plateau || [];
  return Object.entries(props)
    .filter(([, p]) => p?.proprio === uid)
    .map(([c, p]) => ({ c: Number(c), p, def: plateau[Number(c)] || {} }))
    .sort((a, b) => a.c - b.c)
    .map((t) => ({
      nom: nomDe(contenus, 'cases', `c${t.c}`) || `Case ${t.c}`,
      groupe: t.def.groupe || '',
      couleur: (contenus.groupes || []).find((g) => g.id === t.def.groupe)?.couleur || (t.def.type === 'gare' ? '#8A93A0' : '#6B6660'),
      maisons: Number(t.p.maisons) || 0,
      hypo: !!t.p.hypotheque,
    }));
}

/** Classement : fortune décroissante (les ruinés en bas). */
function classement(etat) {
  return (etat?.joueurs || [])
    .filter((j) => !j.parti)
    .map((j) => ({ j, fortune: fortuneDe(etat, j) }))
    .sort((a, b) => (Number(!!a.j.elimine) - Number(!!b.j.elimine)) || (b.fortune - a.fortune));
}

/**
 * Classement par fortune et titres de chacun.
 * @param {object} etat état final de la partie.
 * @param {object} contenus contenus du jeu (cases, groupes).
 * @returns {string} HTML.
 */
export function recap(etat, contenus) {
  const liste = classement(etat);
  // Fin en direct : une seule fois (finEnDirect consomme le signal).
  const fete = finEnDirect(etat?.partie?.id) ? effetsFin(etat) : '';
  if (!liste.length) return fete;
  const lignes = liste.map(({ j, fortune }, i) => {
    const titres = titresDe(etat, contenus, j.user_id);
    const couleur = COULEUR_OK.test(j.couleur || '') && !j.invite ? j.couleur : '#F2EFEA';
    const pastilles = titres.map((t) => (
      `<li class="mo-titre${t.hypo ? ' is-hypo' : ''}" style="--c:${esc(t.couleur)}">` +
      `<span class="mo-titre-nom">${esc(t.nom)}</span>` +
      `<span class="mo-titre-info">${t.maisons >= 5 ? 'hôtel' : t.maisons ? `${t.maisons} maison${t.maisons > 1 ? 's' : ''}` : ''}${t.hypo ? ' · hypothèque' : ''}</span></li>`
    )).join('');
    const etiquettes = [j.elimine ? '<span class="mo-etiquette">ruiné</span>' : '', j.invite ? '<span class="mo-etiquette">invité</span>' : ''].join('');
    return `<li class="mo-classe${j.gagne ? ' is-gagnant' : ''}${j.elimine ? ' is-elimine' : ''}">
      <span class="mo-rang" aria-label="Rang ${i + 1}">${i + 1}</span>
      <span class="mo-classe-avatar" style="background:${esc(couleur)}" aria-hidden="true">${esc(initials(j.pseudo))}</span>
      <div class="mo-classe-corps">
        <p class="mo-classe-tete"><strong style="color:${esc(couleur)}">${esc(j.pseudo || '?')}</strong> ${etiquettes}
          <span class="mo-classe-fortune">${esc(EUR(fortune))}</span></p>
        <p class="small muted">Argent ${esc(EUR(j.etat?.argent))} · ${titres.length} terrain${titres.length > 1 ? 's' : ''}</p>
        ${titres.length ? `<ul class="mo-titres" aria-label="Titres de ${esc(j.pseudo || '?')}">${pastilles}</ul>` : '<p class="small muted">Aucun terrain.</p>'}
      </div>
    </li>`;
  }).join('');
  return `${fete}<section class="mo-fin" aria-labelledby="mo-fin-titre">
    <h2 id="mo-fin-titre" class="mo-fin-titre">Classement par fortune</h2>
    <p class="small muted">La fortune compte l'argent, les terrains (à leur prix) et les maisons.</p>
    <ol class="mo-classement">${lignes}</ol>
  </section>`;
}
