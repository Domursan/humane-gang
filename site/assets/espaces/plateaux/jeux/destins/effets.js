// ===== Humane Gang — Destins : effets visuels « à toi » et fête de fin (plateaux/jeux/destins/effets.js) =====
/*
 * Rôle : ajoute à la table et à l'encart de fin les effets de la maquette « vrais écrans », déclenchés par les vrais changements :
 *   - « à toi » : quand mon tour commence (jeu.actif devient moi), mon siège et son étiquette « À toi de jouer » pulsent en doré,
 *     ainsi que le bouton « Tourner la roue » (s'il est actif), la petite roue et le panneau d'action (cadre doré).
 *     Le son « Pièce arcade » et le titre d'onglet viennent déjà de commun/tour-signal.js : ils ne sont pas repris ici ;
 *   - fin de partie : la table est démontée quand la partie se termine (vues/partie.js), c'est l'encart de fin (fin.js) qui
 *     affiche alors le bandeau et, pour le gagnant, les confettis. Il ne les montre que si la table a vu la partie en cours dans
 *     cette page (marquerEnCours / avaitEnCours) : ouvrir une partie déjà finie ne rejoue rien.
 * Le premier état reçu n'anime rien, et un tour déjà annoncé ne rejoue pas. Mouvement réduit (body.plat-calme) : pas
 * d'animation (le son de fin reste joué par fin.js). Les classes sont retirées après leur durée (moins de 3 s), les
 * minuteries annulées à detruire().
 * Dépendances : aucune import ; styles : ../../destins.css (classes ds-anim-*). Les sons 'destins' sont joués par table.js
 *   (roue, pas, carte) et fin.js (victoire).
 * Exporte : creerEffets(racine) -> { maj(etat, monId), detruire() } ; marquerEnCours(code) ; avaitEnCours(code) -> boolean.
 */

const DUREE_JOUE = 2400;       // ms : pulsation « à toi » (deux allers-retours, sous les 3 s)
const DUREE_SURLIGNE = 2600;   // ms : cadre doré du panneau d'action
const ETIQUETTE_TOUR = 'À toi de jouer';

/** Parties vues en cours dans cette page (codes), pour savoir si la fin est une vraie fin. */
const vuesEnCours = new Set();

/** Note qu'une partie a été vue en cours sur cette page. */
export function marquerEnCours(code) {
  if (code) vuesEnCours.add(String(code));
}

/**
 * Vrai une seule fois, si la table a vu la partie en cours dans cette page : l'encart de fin joue alors la fête.
 * @param {string} code code de la partie.
 * @returns {boolean}
 */
export function avaitEnCours(code) {
  return vuesEnCours.delete(String(code || ''));
}

/**
 * Effets de la table de Destins.
 * @param {HTMLElement} racine élément de la table (.ds-table) : ses zones sont relues à chaque appel.
 * @returns {{ maj: (etat: object, monId: string|null) => void, detruire: () => void }}
 */
export function creerEffets(racine) {
  const minuteries = new Set();
  let prime = false;     // premier état reçu
  let tourAvant = null;  // clé du tour précédent

  /** Lance fn après ms, en gardant la minuterie pour l'annuler au detruire(). */
  function differer(ms, fn) {
    const t = setTimeout(() => { minuteries.delete(t); fn(); }, ms);
    minuteries.add(t);
  }

  /** Mouvement réduit demandé par le membre (plat-calme) : pas d'animation. */
  const mouvementOk = () => !document.body.classList.contains('plat-calme');

  /** Pose une classe d'animation, puis la retire à la fin. */
  function animer(el, classe, ms) {
    if (!el) return;
    el.classList.add(classe);
    differer(ms, () => el.classList.remove(classe));
  }

  /** Mon siège : celui dont l'étiquette dit « À toi de jouer » (pas le simple « is-tour » de la barre du haut). */
  function monSiege() {
    const etiquette = [...racine.querySelectorAll('.plat-etiquette.is-tour')].find((e) => e.textContent.includes(ETIQUETTE_TOUR));
    return etiquette ? etiquette.closest('.plat-bandeau-joueur') : null;
  }

  /** Tour à moi : siège et étiquette qui pulsent, bouton de la roue, petite roue et panneau surlignés. */
  function aToi() {
    const siege = monSiege();
    if (siege) {
      animer(siege, 'ds-anim-joue', DUREE_JOUE);
      animer(siege.querySelector('.plat-etiquette'), 'ds-anim-joue', DUREE_JOUE);
    }
    const tourner = racine.querySelector('.ds-tourner');
    if (tourner && !tourner.disabled) animer(tourner, 'ds-anim-joue', DUREE_JOUE);
    animer(racine.querySelector('.ds-roue'), 'ds-anim-joue', DUREE_JOUE);
    animer(racine.querySelector('.ds-panneau'), 'ds-anim-surligne', DUREE_SURLIGNE);
  }

  return {
    /**
     * Compare l'état au précédent et lance les effets des vrais changements. À appeler après chaque rendu.
     * @param {object} etat état de la partie (plat.etat).
     * @param {string|null} monId identifiant de mon joueur (null pour un spectateur).
     */
    maj(etat, monId) {
      if (!etat?.partie) return;
      if (etat.partie.statut === 'en_cours') marquerEnCours(etat.partie.code);
      const actif = etat.jeu?.actif ?? null;
      const tour = monId && actif === monId ? `${actif}|${etat.partie.nb_tours ?? 0}` : null;

      if (!prime) {
        prime = true;
        tourAvant = tour;
        return;
      }
      if (mouvementOk() && tour && tour !== tourAvant) aToi();
      tourAvant = tour;
    },

    /** Annule les minuteries (la table est quittée). */
    detruire() {
      minuteries.forEach((t) => clearTimeout(t));
      minuteries.clear();
    },
  };
}
