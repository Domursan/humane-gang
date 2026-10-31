// ===== Humane Gang — Risk : effets visuels et sons (plateaux/jeux/risk/effets.js) =====
/*
 * Rôle : ajoute à l'écran de Risk les effets de la maquette « vrais écrans », déclenchés par les vrais changements entre deux états :
 *   - « à toi de jouer » : mon nom et son étiquette pulsent en doré, la bannière de phase se met en valeur, mes territoires
 *     cliquables clignotent (le son « Pièce arcade » et le titre d'onglet viennent déjà de commun/tour-signal.js : non repris ici) ;
 *   - renforts posés (phase placement ou renforts) : la pastille d'un territoire grossit avec un « +1 » par troupe, son « Troupe posée » ;
 *   - bataille (nouveau combat) : son « Dés qui roulent » au lancer ; les dés gagnants s'entourent d'un anneau doré, chaque
 *     comparaison s'allume à son tour, puis le bloc Bataille secoue avec le son « Choc de bataille » s'il y a des pertes ;
 *   - territoire conquis (propriétaire changé) : son « Territoire conquis », le territoire clignote, bandeau « Territoire conquis » ;
 *   - fin de partie (voir jouerFin) : le gagnant a le bandeau « Victoire ! », les confettis et le son « Victoire du monde » ;
 *     le perdant « Partie perdue » et S02, sobre (RK1) ; le joueur parti un bandeau neutre et S04. N'est annoncée que si la
 *     partie a été vue en cours dans cette page ; une partie déjà finie à l'ouverture ne déclenche rien.
 *   Le premier état reçu n'anime rien. Mouvement réduit (body.plat-calme ou prefers-reduced-motion) : pas d'animation, les sons restent.
 *   Les animations durent moins de 3 s ; les classes sont retirées après leur durée, les éléments ajoutés au body retirés,
 *   les minuteries annulées à detruire() ; celles de la fin passent par fxFin, nettoyé en quittant la partie.
 * Dépendances : commun/sons-jeux.js (jouerSonJeu, sons 'risk' 1 à 5), commun/effets-duels.js (anime, son), core.js (esc),
 *   ../../vues/fin-fx.js (fxFin, gagnantsDe, issuePlateau) ; styles : ../../risk.css (classes rk-anim-*).
 *   table.js appelle maj() après chaque rendu ; fin.js appelle jouerFin() depuis recap().
 * Exporte : creerEffets(el, { nomTerritoire, nomJoueur }) -> { maj(etat, monId), detruire() } ; jouerFin(etat).
 */
import { esc } from '../../../../commun/core.js';
import { jouerSonJeu } from '../../../../commun/sons-jeux.js';
import { anime as finAnimee, son } from '../../../../commun/effets-duels.js';
import { fxFin, gagnantsDe, issuePlateau } from '../../vues/fin-fx.js';

const JEU = 'risk';
const CALME = '(prefers-reduced-motion: reduce)';
const COULEURS = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398', '#E2C77E'];
const PHASES_RENFORTS = ['placement', 'renforts'];
const PAS_MAX = 3;                     // « +1 » animés au plus par territoire (le reste s'affiche d'un coup)
const DELAI_PAS = 450;                 // ms entre deux « +1 »
const DUREE_JOUE = 2400;               // ms : pulsation « à toi » (2 tours de 1,2 s)
const DUREE_SURLIGNE = 2600;           // ms : bannière mise en valeur
const DUREE_TERR = 2200;               // ms : territoires cliquables qui clignotent
const DUREE_PLUS = 1300;               // ms : durée d'un « +1 » à l'écran
const DUREE_BANC = 2700;               // ms : bandeau « Victoire ! » ou « Territoire conquis »
const DELAI_GAGNANTS = 2500;           // ms : après l'arrêt des dés
const DELAI_PAIRE = 3400;              // ms : première comparaison allumée (après son apparition)
const ECART_PAIRE = 200;               // ms entre deux comparaisons
const DUREE_PAIRE = 1300;              // ms
const DELAI_BILAN = 4200;              // ms : bilan qui secoue
const DELAI_CONQUETE = 2500;           // ms : après les dés
/** Parties vues en cours dans cette page (partie.id) : une fin n'est annoncée que si elle a été vue arriver. */
const vuesEnCours = new Set();

/** Mouvement réduit demandé par le membre (plat-calme) ou par le système : pas d'animation (les sons restent). */
const mouvementOk = () => !document.body.classList.contains('plat-calme') && !window.matchMedia(CALME).matches;

/** Centre horizontal et haut d'un élément, en coordonnées de la fenêtre. */
function centre(elt) {
  const r = elt.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top };
}

/**
 * Ajoute un calque au body (bulle « +1 », bandeau, confetti). Non fixé au tapis : le retrait est à la charge de l'appelant.
 * @returns {HTMLElement}
 */
function ajouterCorps(classe, html = '') {
  const d = document.createElement('div');
  d.className = classe;
  d.innerHTML = html;
  d.setAttribute('aria-hidden', 'true');
  document.body.append(d);
  return d;
}

/** Pluie de confettis, en calques du body, retirés seuls (moins de 3 s) ou en quittant la partie. */
function confettis(nombre = 60) {
  for (let i = 0; i < nombre; i += 1) {
    const d = document.createElement('i');
    d.className = 'rk-anim-conf';
    d.setAttribute('aria-hidden', 'true');
    d.style.left = `${Math.random() * 100}vw`;
    d.style.background = COULEURS[i % COULEURS.length];
    d.style.animationDuration = `${(1.2 + Math.random() * 1).toFixed(2)}s`;
    d.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
    fxFin.vol(d, 2600);
  }
}

/** Instantané des éléments à comparer d'un état à l'autre. */
function instantane(e, monId) {
  const j = e.jeu || {};
  const terr = {};
  Object.entries(j.territoires || {}).forEach(([id, t]) => { terr[id] = { j: t?.j ?? null, a: t?.a ?? 0 }; });
  return {
    tour: !!monId && j.actif === monId,
    phase: j.phase || '',
    combat: j.combat || null,
    cleCombat: JSON.stringify(j.combat || null),
    terr,
  };
}

/**
 * Effets de la table de Risk.
 * @param {HTMLElement} el section de la table (.rk-table) : ses zones sont relues à chaque appel.
 * @param {{ nomTerritoire?: (id: string) => string, nomJoueur?: (uid: string) => string }} [noms] noms affichés dans les bandeaux.
 * @returns {{ maj: (etat: object, monId: string|null) => void, detruire: () => void }}
 */
export function creerEffets(el, { nomTerritoire = (t) => t, nomJoueur = () => '' } = {}) {
  const minuteries = new Set();
  const ajoutes = new Set();           // calques ajoutés au body, retirés à detruire()
  let prev = null;                     // instantané de l'état précédent
  let monIdCourant = null;             // mon identifiant (pour « est à toi »)

  /** Lance fn après ms, minuterie gardée pour être annulée à detruire(). */
  function differer(ms, fn) {
    const t = setTimeout(() => { minuteries.delete(t); fn(); }, ms);
    minuteries.add(t);
  }

  /** Pose une classe d'animation, puis la retire à la fin. */
  function animer(elt, classe, ms) {
    elt.classList.add(classe);
    differer(ms, () => elt.classList.remove(classe));
  }

  /** Calque du body retiré après ms (et oublié à detruire()). */
  function calque(classe, html, ms) {
    const d = ajouterCorps(classe, html);
    ajoutes.add(d);
    differer(ms, () => { d.remove(); ajoutes.delete(d); });
    return d;
  }

  /** Bouton d'un territoire sur la carte. */
  const territoire = (id) => el.querySelector(`[data-terr="${CSS.escape(id)}"]`);

  /** « À toi de jouer » : mon nom, mon étiquette, la bannière et mes territoires cliquables pulsent. */
  function effetTour() {
    const moi = el.querySelector('.plat-bandeau-joueur.is-tour');
    if (moi) {
      animer(moi, 'rk-anim-joue', DUREE_JOUE);
      const etiquette = moi.querySelector('.plat-etiquette');
      if (etiquette) animer(etiquette, 'rk-anim-joue', DUREE_JOUE);
    }
    const banniere = el.querySelector('.rk-banniere');
    if (banniere) animer(banniere, 'rk-anim-surligne', DUREE_SURLIGNE);
    el.querySelectorAll('.rk-terr:not([disabled])').forEach((t) => animer(t, 'rk-anim-terr', DUREE_TERR));
  }

  /**
   * Renforts posés : chaque territoire qui gagne des troupes voit sa pastille grossir, avec un « +1 » par troupe (3 au plus).
   * @param {{ id: string, avant: number, apres: number }[]} liste
   */
  function effetPose(liste) {
    liste.forEach(({ id, avant, apres }) => {
      const bouton = territoire(id);
      const pastille = bouton?.querySelector('.rk-pastille');
      if (!bouton || !pastille) return;
      const pas = Math.min(apres - avant, PAS_MAX);
      pastille.textContent = String(avant);
      for (let k = 1; k <= pas; k += 1) {
        differer(300 + k * DELAI_PAS, () => {
          pastille.textContent = String(avant + k);
          animer(pastille, 'rk-anim-pop', 350);
          const r = centre(bouton);
          const bulle = calque('rk-anim-plus', '+1', DUREE_PLUS);
          bulle.style.left = `${r.x - 8}px`;
          bulle.style.top = `${r.y - 20}px`;
        });
      }
      differer(300 + pas * DELAI_PAS + 400, () => { pastille.textContent = String(apres); });
    });
  }

  /** Bataille : dés au lancer, anneau sur les dés gagnants, comparaisons qui s'allument, bilan qui secoue. */
  function effetBataille(c, visuel) {
    const bloc = el.querySelector('[data-bataille]');
    const pertes = (c.pertes_att || 0) + (c.pertes_def || 0) > 0;
    jouerSonJeu(JEU, 2);
    if (!visuel || !bloc) {
      if (pertes) jouerSonJeu(JEU, 3);
      return;
    }
    differer(DELAI_GAGNANTS, () => {
      bloc.querySelectorAll('.rk-de.is-gagne').forEach((d) => animer(d, 'rk-anim-gagne', 2100));
    });
    bloc.querySelectorAll('.rk-paire').forEach((p, i) => {
      differer(DELAI_PAIRE + i * ECART_PAIRE, () => animer(p, 'rk-anim-surligne', DUREE_PAIRE));
    });
    if (pertes) {
      differer(DELAI_BILAN, () => {
        jouerSonJeu(JEU, 3);
        animer(bloc, 'rk-anim-choc', 1200);
      });
    }
  }

  /** Territoire conquis : son, clignotement du territoire et bandeau. */
  function effetConquete(c, visuel) {
    const texte = c.nouveau === monIdCourant ? `${nomTerritoire(c.id)} est à toi` : `${nomTerritoire(c.id)} est conquis par ${nomJoueur(c.nouveau)}`;
    differer(visuel ? DELAI_CONQUETE : 0, () => {
      jouerSonJeu(JEU, 4);
      if (!visuel) return;
      const bouton = territoire(c.id);
      if (bouton) animer(bouton, 'rk-anim-terr', DUREE_TERR);
      calque('rk-anim-banc', `Territoire conquis<small>${esc(texte)}</small>`, DUREE_BANC);
    });
  }

  return {
    /** Nouvel état de la partie (après chaque rendu). Le premier état ne joue rien. */
    maj(e, monId) {
      if (!e?.partie) return;
      monIdCourant = monId ?? null;
      if (e.partie.statut === 'en_cours' && e.partie.id != null) vuesEnCours.add(e.partie.id);
      const now = instantane(e, monId);
      const avant = prev;
      prev = now;
      if (!avant) return;
      const visuel = mouvementOk();

      if (now.tour && !avant.tour && visuel) effetTour();

      if (PHASES_RENFORTS.includes(now.phase)) {
        const pose = [];
        Object.keys(now.terr).forEach((id) => {
          const b = avant.terr[id];
          const a = now.terr[id];
          if (b && a.a > b.a) pose.push({ id, avant: b.a, apres: a.a });
        });
        if (pose.length) {
          jouerSonJeu(JEU, 1);
          if (visuel) effetPose(pose);
        }
      }

      if (now.combat && now.cleCombat !== avant.cleCombat) effetBataille(now.combat, visuel);

      const conquis = Object.keys(now.terr)
        .filter((id) => avant.terr[id] && avant.terr[id].j != null && now.terr[id].j != null && avant.terr[id].j !== now.terr[id].j)
        .map((id) => ({ id, nouveau: now.terr[id].j }));
      if (conquis.length) effetConquete(conquis[0], visuel);
    },
    /** Arrête les minuteries et retire les calques ajoutés (à la sortie de la table). */
    detruire() {
      minuteries.forEach((t) => clearTimeout(t));
      minuteries.clear();
      ajoutes.forEach((d) => d.remove());
      ajoutes.clear();
      prev = null;
    },
  };
}

/** Comment la partie a été gagnée, pour le bandeau des autres joueurs. */
function ligneFin(etat) {
  const qui = gagnantsDe(etat.joueurs || []).map((j) => j.pseudo).join(', ');
  if (!qui) return '';
  return { monde: `${qui} a conquis le monde`, mission: `${qui} a rempli sa mission` }[etat.partie.raison] || `${qui} gagne la partie`;
}

/**
 * Fin de partie, sur l'écran de fin : la fête pour le gagnant, un bandeau sobre pour le perdant, neutre pour un joueur parti.
 * N'agit qu'une fois, et seulement si la partie a été vue en cours dans cette page (sinon rien : état déjà fini).
 * @param {object} etat état de la partie (partie, joueurs).
 */
export function jouerFin(etat) {
  const p = etat?.partie;
  if (!p || p.statut !== 'terminee') return;
  if (!vuesEnCours.delete(p.id)) return;
  const issue = issuePlateau(etat);
  if (issue === 'gagnant') {
    jouerSonJeu(JEU, 5);
    if (!finAnimee()) return;
    const sous = { monde: 'Le monde est conquis', mission: 'Mission accomplie' }[p.raison] || 'Partie gagnée';
    fxFin.vol(ajouterCorps('rk-anim-banc', `Victoire !<small>${esc(sous)}</small>`), DUREE_BANC);
    confettis();
  } else if (issue === 'perdant') {
    son('S02');
    fxFin.bandeau('Partie perdue', ligneFin(etat), { ton: 'd' });
  } else {
    son('S04');
    fxFin.bandeau('Partie terminée', ligneFin(etat), { ton: 'n' });
  }
}
