// ===== Humane Gang — Destins : encart de fin (plateaux/jeux/destins/fin.js) =====
/*
 * Rôle : HTML de l'encart de fin de Destins : podium (fortune estimée de chacun) et « Le chemin de chacun »
 *   (métier, mariage, enfants, retraite). Le classement et les récompenses sont à part, dans l'écran de fin commun.
 *   Fin vue en direct (la table a vu la partie en cours sur cette page : effets.js, avaitEnCours) : pour le gagnant, bandeau
 *   « Victoire ! », confettis, son Victoire ; pour le perdant, bandeau sobre « Partie perdue » et S02 (DT1) ; pour un joueur parti,
 *   bandeau neutre et S04. Le podium ne change pas. Sous mouvement réduit, bandeaux et confettis ne s'affichent pas, le son reste.
 * Dépendances : core.js (esc), ../../api.js (nomDe), commun/sons-jeux.js (jouerSonJeu), commun/effets-duels.js (anime, son),
 *   ../../vues/fin-fx.js (fxFin, gagnantsDe, issuePlateau), ./effets.js (avaitEnCours).
 * Exporte : recap(etat, contenus) -> HTML (chaîne).
 *   etat.jeu.fortunes = {user_id: fortune estimée} ; etat.joueurs[i].etat = {metier, marie, enfants, maisons, argent, prets, retraite, retraite_lieu, pari}.
 */
import { esc } from '../../../../commun/core.js';
import { nomDe } from '../../api.js';
import { jouerSonJeu } from '../../../../commun/sons-jeux.js';
import { anime as finAnimee, son } from '../../../../commun/effets-duels.js';
import { fxFin, gagnantsDe, issuePlateau } from '../../vues/fin-fx.js';
import { avaitEnCours } from './effets.js';

/** Montant en euros, format français. */
const euros = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} €`;
/** Somme à rendre par prêt (voir les règles : 20 000 € empruntés, 25 000 € à rendre). */
const PRET_A_RENDRE = 25000;
/** Couleurs des confettis (palette de la maquette). */
const COULEURS_CONFETTI = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398', '#E2C77E'];

/**
 * Bandeau « Victoire ! » et confettis de la fête de fin (CSS seul : aucun script, rien à nettoyer).
 * @returns {string} HTML.
 */
function feteHtml() {
  const confettis = Array.from({ length: 60 }, (_, i) =>
    `<i class="ds-anim-conf" style="left:${(i * 37) % 100}vw;background:${COULEURS_CONFETTI[i % COULEURS_CONFETTI.length]};` +
    `animation-duration:${(1.2 + (i % 5) * 0.25).toFixed(2)}s;animation-delay:${((i % 4) * 0.1).toFixed(1)}s"></i>`).join('');
  return `<div class="ds-anim-fete" aria-hidden="true"><p class="ds-anim-banc">Victoire !<small>La fortune la plus grande gagne</small></p>${confettis}</div>`;
}

/** « Alice a la plus grande fortune » ; à égalité : « Alice et Bruno ont la plus grande fortune ». */
function ligneFin(etat) {
  const g = gagnantsDe(etat.joueurs || []).map((j) => j.pseudo);
  if (!g.length) return '';
  return g.length > 1 ? `${g.slice(0, -1).join(', ')} et ${g[g.length - 1]} ont la plus grande fortune` : `${g[0]} a la plus grande fortune`;
}

/**
 * Effets d'une fin vue en direct. Son et bandeau sobre partent d'ici ; la fête du gagnant est dans le HTML de l'encart.
 * @param {object} etat état final de la partie.
 * @returns {string} HTML de la fête, vide si elle n'est pas pour moi.
 */
function effetsFin(etat) {
  const issue = issuePlateau(etat);
  if (issue === 'gagnant') {
    jouerSonJeu('destins', 5);
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

/** Lettres de l'avatar : initiales du pseudo. */
const initiales = (pseudo) => String(pseudo || '?').trim().split(/\s+/).slice(0, 2).map((m) => m[0] || '').join('').toUpperCase() || '?';

/** Fortune détaillée d'un joueur : argent, valeur de revente des maisons, moins les prêts à rendre. */
function detailFortune(j, contenus) {
  const e = j?.etat || {};
  const maisons = Array.isArray(e.maisons) ? e.maisons : [];
  const valeurMaisons = maisons.reduce((s, id) => {
    const m = (contenus?.maisons || []).find((x) => x.id === id);
    return s + (Number(m?.vente) || 0);
  }, 0);
  const prets = Number(e.prets) || 0;
  const argent = Number(e.argent) || 0;
  const dettes = prets * PRET_A_RENDRE;
  return { argent, valeurMaisons, nbMaisons: maisons.length, enfants: Number(e.enfants) || 0, dettes };
}

/** Fortune d'un joueur : celle calculée par le serveur, sinon le détail. */
function fortuneDe(j, fortunes, contenus) {
  const d = detailFortune(j, contenus);
  const f = fortunes?.[j.user_id];
  return { total: Number.isFinite(Number(f)) ? Number(f) : d.argent + d.valeurMaisons - d.dettes, detail: d };
}

/** Phrase du chemin de vie d'un joueur : métier → marié → enfants → retraite. */
function cheminTexte(j, contenus) {
  const e = j.etat || {};
  const metier = e.metier ? nomDe(contenus, 'metiers', e.metier) : 'Sans métier';
  const famille = e.marie ? 'marié' : 'célibataire';
  const enfants = `${e.enfants || 0} enfant${(e.enfants || 0) > 1 ? 's' : ''}`;
  let retraite = 'pas encore à la retraite';
  if (e.retraite) {
    const lieu = e.retraite_lieu === 'domaine' ? 'au Domaine des millionnaires' : 'en maison de retraite';
    // pari : résultat de la roue au Domaine (1-4 perdu, 5-10 gagné).
    const pari = e.retraite_lieu !== 'domaine' ? ' (sûr)' : !e.pari ? ' (pari)' : e.pari >= 5 ? ` (pari gagné : ${e.pari} à la roue)` : ` (pari perdu : ${e.pari} à la roue)`;
    retraite = `retraite ${lieu}${pari}`;
  }
  return `${metier} → ${famille} → ${enfants} → ${retraite}`;
}

/** Une ligne du podium. */
function carte(rang, j, total, detail, gagnant) {
  const libelle = gagnant ? `${rang}er · Gagnant` : rang === 2 ? '2e' : '3e';
  const couleur = /^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA';
  const tag = j.invite ? ' <span class="dp-invite">invité</span>' : '';
  return `<div class="dp-podium-carte${gagnant ? ' is-gagnant' : ''}">
    <span class="dp-podium-rang">${esc(libelle)}</span>
    <span class="dp-podium-disque" style="background:${esc(couleur)}" aria-hidden="true">${esc(initiales(j.pseudo))}</span>
    <strong class="dp-podium-pseudo" style="color:${esc(couleur)}">${esc(j.pseudo || '?')}${tag}</strong>
    <span class="dp-podium-total">${esc(euros(total))}</span>
    <span class="dp-podium-detail">${esc(`${detail.enfants} enfant${detail.enfants > 1 ? 's' : ''} · ${detail.nbMaisons} maison${detail.nbMaisons > 1 ? 's' : ''}`)}</span>
  </div>`;
}

/**
 * Encart de fin : podium des trois premiers et chemin de chacun.
 * @param {object} etat état final de la partie (plat.etat).
 * @param {object} contenus contenus du jeu (métiers, maisons…), noms modifiables en admin.
 * @returns {string} HTML.
 */
export function recap(etat, contenus) {
  const joueurs = (etat?.joueurs || []).filter((j) => !j.parti);
  const fortunes = etat?.jeu?.fortunes || {};
  const classes = joueurs
    .map((j) => ({ j, ...fortuneDe(j, fortunes, contenus) }))
    .sort((a, b) => b.total - a.total);

  const podium = classes.slice(0, 3).map((c, i) => carte(i + 1, c.j, c.total, c.detail, i === 0)).join('');
  const podiumHtml = `<section class="dp-bloc" aria-labelledby="dp-fin-podium">
    <h2 id="dp-fin-podium" class="dp-bloc-titre">Podium</h2>
    <div class="dp-podium">${podium || '<p class="dp-vide">Aucun joueur classé.</p>'}</div>
  </section>`;

  const lignes = classes.map(({ j, total, detail }) => {
    const detailTxt = `argent ${euros(detail.argent)}, maisons ${euros(detail.valeurMaisons)}, ${detail.enfants} enfant${detail.enfants > 1 ? 's' : ''}, prêts à rendre ${euros(detail.dettes)}`;
    const couleur = /^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA';
    return `<li class="dp-chemin">
      <strong class="dp-chemin-pseudo" style="color:${esc(couleur)}">${esc(j.pseudo || '?')}${j.invite ? ' <span class="dp-invite">invité</span>' : ''}</strong>
      <span class="dp-chemin-texte">${esc(cheminTexte(j, contenus))}</span>
      <span class="dp-chemin-fortune">${esc(euros(total))}<small>${esc(detailTxt)}</small></span>
    </li>`;
  }).join('');
  const cheminsHtml = `<section class="dp-bloc" aria-labelledby="dp-fin-chemins">
    <h2 id="dp-fin-chemins" class="dp-bloc-titre">Le chemin de chacun</h2>
    <ul class="dp-liste-chemins">${lignes || '<li class="dp-vide">Aucun chemin à afficher.</li>'}</ul>
  </section>`;

  // Effets : une seule fois, et seulement si la partie a été vue en cours sur cette page.
  const fete = avaitEnCours(etat?.partie?.code) ? effetsFin(etat) : '';
  return `<div class="dp-fin">${fete}${podiumHtml}${cheminsHtml}</div>`;
}
