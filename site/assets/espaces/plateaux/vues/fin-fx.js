// ===== Humane Gang — Jeux de plateau : fin de partie, issue et effets (PV1 à PV4) =====
/**
 * Rôle : ce que l'écran de fin (vues/fin.js) et les tables ont besoin de savoir sur la fin d'une partie : vrai rang, issue pour moi,
 *   et la mise en scène commune : victoire (son du jeu, S01, bandeau, confettis), défaite (S02, bandeau sobre), joueur parti ou partie
 *   sans gagnant (S04, bandeau neutre). Seulement si la partie a été vue en cours dans la page, une seule fois (vues/partie.js appelle
 *   vuEnCours à chaque état). Mouvement réduit ou effets coupés : pas d'animation, le son reste.
 * Le vrai rang : hg_plat__terminer ne remplit la colonne rang qu'avec 1 pour le gagnant et 2 pour les autres, sauf Destins et Monopoly
 *   qui l'écrivent eux-mêmes. Blackjack, Poker, Catan et Pictionary gardent le vrai rang dans etat.rang (migrations 143, 144, 145).
 *   Cluedo, Risk et Shadow Hunters n'ont pas de rang : rangsFiables() est faux à partir de trois joueurs, pas de tampon ni de podium.
 * Fraîcheur : un retour de veille n'est pas un direct. Une fin (ou un départ, vues/salle.js) vieille de plus de 30 s ne joue aucun effet ;
 *   l'écart se mesure sur l'heure du serveur (etat.maintenant), l'horloge du téléphone peut être fausse.
 * Un jeu peut dire qu'un gagnant n'a pas de quoi fêter : finFx.sobre(e) rend alors une ligne (Blackjack seul, reparti avec moins qu'à
 *   l'arrivée) et l'issue devient « perdant », sans autre gagnant à citer.
 * Une table qui garde l'écran après la fin (avantFin, voir vues/partie.js) peut appeler effetsFinPlateau elle-même : les effets
 *   démarrent sur la table et vues/fin.js ne les rejoue pas.
 * Dépendances : commun/effets-duels.js.
 * Exporte : vuEnCours, arreterEffetsFin, fxFin, estRecent, rangReel, rangsFiables, classes, gagnantsDe, issuePlateau, effetsFinPlateau.
 */
import { creerEffets, PALETTES, son } from '../../../commun/effets-duels.js';

/** Parties (ids) vues « en cours » dans cette page et dont la fin n'a pas encore été jouée. */
const EN_COURS = new Set();
/** Parties dont les effets ont été lancés, pour le podium de l'écran de fin. */
const JOUES = new Set();

/** Au-delà, un départ ou une fin n'est plus un direct : retour de veille, onglet retrouvé (même limite que Cluedo). */
const LIMITE_DIRECT = 30000;

/**
 * Vrai si l'instant donné date de moins de 30 s, à l'heure du serveur. Instant inconnu : vrai.
 * @param {string|null} [quand] started_at ou ended_at. @param {object} [e] état de la partie (etat.maintenant).
 */
export function estRecent(quand, e) {
  const t = Date.parse(quand);
  if (!Number.isFinite(t)) return true;
  const n = Date.parse(e?.maintenant);
  return (Number.isFinite(n) ? n : Date.now()) - t <= LIMITE_DIRECT;
}

/** Effets de la fin : nettoyés en quittant la partie. Les pièces propres à un jeu peuvent s'y accrocher. */
export const fxFin = creerEffets();
export const arreterEffetsFin = () => fxFin.nettoyer();

/** À appeler à chaque état : retient les parties vues en cours. */
export function vuEnCours(p) {
  if (p?.statut === 'en_cours' && p.id) EN_COURS.add(p.id);
}

/** Vrai rang d'un joueur (voir l'en-tête), null s'il n'en a pas. */
export const rangReel = (j) => j?.etat?.rang ?? j?.rang ?? null;

/** Faux si le classement n'est que 1, 2, 2, 2 : le jeu ne donne pas de rang. */
export const rangsFiables = (js) => js.length <= 2 || js.some((j) => j.etat?.rang != null || Number(j.rang) > 2);

/** Joueurs classés : vrai rang croissant, puis place ; les sans rang à la fin. */
export const classes = (joueurs) => [...joueurs].sort((a, b) => (rangReel(a) ?? 99) - (rangReel(b) ?? 99) || (a.place ?? 99) - (b.place ?? 99));

/** Gagnants de la partie, d'après le serveur (gagne, ou colonne rang à 1). */
export const gagnantsDe = (joueurs) => joueurs.filter((j) => j.gagne === true || j.rang === 1);

/**
 * Issue de la partie pour moi.
 * @param {object} e état de la partie.
 * @param {{sobre?: (e: object) => string}} [fx] finFx du jeu : sobre(e) non vide, le gagnant n'a rien à fêter.
 * @returns {'gagnant'|'perdant'|'neutre'|'parti'|null} null si elle n'est pas terminée ; neutre : pas de gagnant.
 */
export function issuePlateau(e, fx = {}) {
  if (e?.partie?.statut !== 'terminee') return null;
  const js = e.joueurs || [];
  const moi = js.find((j) => j.user_id === e.moi?.user_id);
  if (!moi || moi.parti) return 'parti';
  const g = gagnantsDe(js);
  if (!g.length) return 'neutre';
  return g.includes(moi) && !fx.sobre?.(e) ? 'gagnant' : 'perdant';
}

/** « Alice gagne » ou « Alice, Bruno gagnent ». */
const ligneGagnants = (js) => {
  const g = gagnantsDe(classes(js));
  return g.length ? `${g.map((j) => j.pseudo).join(', ')} ${g.length > 1 ? 'gagnent' : 'gagne'}` : '';
};

/**
 * Effets de fin d'une partie vue en direct (PV1, PV2, PV4). Le podium (PV3) est joué par vues/fin.js.
 * @param {object} e état de la partie terminée.
 * @param {{ac?: string, ligne?: ((e: object) => string)|string, conf?: string[], c?: string, apres?: (issue: string) => void}} [o]
 *   ac : son d'ouverture du gagnant (S05…, sinon S04) ; ligne : sous le bandeau de victoire ; conf : confettis (PALETTES) ; c : couleur du
 *   bandeau ; apres : effet du jeu, lancé avec le bandeau ; sobre : voir issuePlateau.
 * @returns {boolean} vrai si les effets sont joués, ici ou plus tôt par la table. Faux pour une fin qui n'est plus récente.
 */
export function effetsFinPlateau(e, o = {}) {
  const id = e?.partie?.id;
  if (!EN_COURS.delete(id)) return JOUES.delete(id);
  const issue = issuePlateau(e, o);
  if (!issue || !estRecent(e.partie.ended_at, e)) return false;
  JOUES.add(id);
  const couleur = o.c || '';
  const lance = (fn) => fxFin.plus(() => { fn(); o.apres?.(issue); }, 320);
  if (issue === 'gagnant') {
    son(o.ac || 'S04');
    fxFin.plus(() => son('S01'), 260);
    const ligne = typeof o.ligne === 'function' ? o.ligne(e) : o.ligne;
    lance(() => { fxFin.bandeau('Victoire !', ligne || 'Tu gagnes la partie', { couleur }); fxFin.confettis(o.conf || PALETTES.bj); });
  } else if (issue === 'perdant') {
    son('S02');
    lance(() => fxFin.bandeau('Partie perdue', o.sobre?.(e) || ligneGagnants(e.joueurs || []), { ton: 'd', couleur }));
  } else {
    son('S04');
    lance(() => fxFin.bandeau('Partie terminée', ligneGagnants(e.joueurs || []), { ton: 'n', couleur }));
  }
  return true;
}
