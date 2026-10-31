// ===== Humane Gang — Cluedo : encart de fin (plateaux/jeux/cluedo/fin.js) =====
/*
 * Rôle : HTML de l'écran de fin du Cluedo (l'enveloppe révélée, les accusations, les mains de chacun).
 *   Le classement et les récompenses sont à part, dans l'écran de fin commun.
 *   Effets de la solution (retournement, bandeau, confettis du gagnant) : ./effets.js (animerFin), lancés après l'insertion de l'encart.
 * Dépendances : core.js (esc), ../../api.js (nomDe), ../../vues/fin-fx.js (fxFin), ./effets.js (animerFin).
 * Exporte : recap(etat, contenus) -> HTML (chaîne).
 *   etat.jeu.enveloppe = {suspect, arme, piece} ; etat.jeu.accusations = [{par, suspect, arme, piece, juste}] ;
 *   etat.jeu.mains = {user_id: ['s:<suspect>' | 'a:<arme>' | 'p:<pièce>']}.
 */
import { esc } from '../../../../commun/core.js';
import { nomDe } from '../../api.js';
import { fxFin } from '../../vues/fin-fx.js';
import { animerFin } from './effets.js';

const LISTE = { s: 'suspects', a: 'armes', p: 'pieces' };

/** Nom affiché d'une carte 's:…', 'a:…' ou 'p:…' (noms lus dans les contenus). */
function nomCarte(carte, contenus) {
  const [type, id] = String(carte).split(/:(.*)/s);
  const liste = LISTE[type];
  return liste ? nomDe(contenus, liste, id) : String(carte);
}

/** Pseudo d'un joueur à partir de son identifiant, ou « ? ». */
function pseudoDe(etat, uid) {
  return (etat?.joueurs || []).find((j) => j.user_id === uid)?.pseudo || '?';
}

/** Carte de l'enveloppe : couleur du type, étiquette et nom. */
function carteEnveloppe(type, libelle, nom, couleur, textesombre) {
  return `<div class="ch-sol" style="background:${couleur};color:${textesombre ? '#121212' : '#F2EFEA'}">` +
    `<small>${esc(libelle)}</small><span>${esc(nom)}</span></div>`;
}

/** Enveloppe révélée, accusations et mains (écran de fin). */
export function recap(etat, contenus) {
  const jeu = etat?.jeu || {};
  const env = jeu.enveloppe;
  const accus = Array.isArray(jeu.accusations) ? jeu.accusations : [];
  const mains = jeu.mains || {};

  const enveloppe = env
    ? `<section class="ch-bloc ch-enveloppe" aria-labelledby="ch-fin-env">
        <h2 id="ch-fin-env" class="ch-bloc-titre">La solution</h2>
        <div class="ch-sol-zone">
          ${carteEnveloppe('Suspect', 'Suspect', nomDe(contenus, 'suspects', env.suspect), '#4F8A4A', false)}
          ${carteEnveloppe('Pièce', 'Pièce', nomDe(contenus, 'pieces', env.piece), '#8C6E45', false)}
          ${carteEnveloppe('Arme', 'Arme', nomDe(contenus, 'armes', env.arme), '#D4A017', true)}
        </div>
        <p class="ch-note">Ces trois cartes étaient cachées dans l'enveloppe depuis le début de la partie.</p>
      </section>`
    : '';

  const lignesAccus = accus.map((a) => {
    const cible = `${nomDe(contenus, 'suspects', a.suspect)}, ${nomDe(contenus, 'pieces', a.piece)}, ${nomDe(contenus, 'armes', a.arme)}`;
    return `<li class="ch-accus${a.juste ? ' is-juste' : ' is-fausse'}">
      <span class="ch-accus-qui">${esc(pseudoDe(etat, a.par))}</span>
      <span class="ch-accus-quoi">${esc(cible)}</span>
      <span class="ch-accus-issue">${a.juste ? 'Juste' : 'Fausse'}</span>
    </li>`;
  }).join('');
  const accusations = `<section class="ch-bloc" aria-labelledby="ch-fin-accus">
    <h2 id="ch-fin-accus" class="ch-bloc-titre">Accusations</h2>
    <ul class="ch-liste-accus">${lignesAccus || '<li class="ch-vide">Aucune accusation.</li>'}</ul>
  </section>`;

  const lignesMains = Object.entries(mains).map(([uid, cartes]) => {
    const liste = (Array.isArray(cartes) ? cartes : []).map((c) => esc(nomCarte(c, contenus))).join(', ');
    return `<li><strong>${esc(pseudoDe(etat, uid))}</strong> : ${liste || 'aucune carte'}</li>`;
  }).join('');
  const maines = `<section class="ch-bloc" aria-labelledby="ch-fin-mains">
    <h2 id="ch-fin-mains" class="ch-bloc-titre">Les mains</h2>
    <ul class="ch-liste-mains">${lignesMains || '<li class="ch-vide">Mains non révélées.</li>'}</ul>
  </section>`;

  // Effets de fin après l'insertion de l'encart (tâche suivante) : seulement si la partie vient de finir sous mes yeux.
  fxFin.plus(() => { try { animerFin(etat); } catch (err) { console.warn('[cluedo] effets de fin', err); } }, 0);

  return `<div class="ch-fin">${enveloppe}${accusations}${maines}</div>`;
}
