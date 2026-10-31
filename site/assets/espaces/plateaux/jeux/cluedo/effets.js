// ===== Humane Gang — Cluedo : effets visuels et sons (plateaux/jeux/cluedo/effets.js) =====
/*
 * Rôle : ajoute à la table et à l'écran de fin les effets de la maquette « vrais écrans », déclenchés par les vrais changements
 *   entre deux états :
 *   - « à toi » (mon tour, ou une carte à montrer) : mon nom et son étiquette pulsent, mes pièces voisines et la mienne
 *     s'éclairent, le panneau d'action se met en valeur. Le son « Pièce arcade » et le titre d'onglet viennent déjà de
 *     commun/tour-signal.js : ils ne sont pas repris ici ;
 *   - un pion change de pièce : il glisse de l'ancienne à la nouvelle, et le son « Pas sur le plateau » (1) joue ;
 *   - une hypothèse est posée (la phase passe de « hypothese » à « montrer » ou « apres ») : son « Hypothèse posée » (3) ;
 *   - une carte est montrée (nouvelle entrée d'historique avec la personne qui a montré) : son « Carte montrée » (2) ; la
 *     carte choisie, relevée au clic sur « Montrer », se retourne face cachée pour celle qui la montre, et le tampon
 *     « Montrée en secret » apparaît pour tous ;
 *   - une accusation fausse (nouvelle accusation non juste) : son « Éliminé » (5) ;
 *   - fin : une partie vue en direct passe à « terminée » : animerFin() (appelé par fin.js) retourne les trois cartes de la
 *     solution une à une (2 s), puis le bandeau arrive à 2,3 s. Quelqu'un a résolu l'enquête (raison « enquete ») : son
 *     « Solution révélée » (4), « Enquête résolue » avec le nom, confettis pour lui seul (CL2). Personne n'a résolu (raison
 *     « dernier » : le dernier enquêteur en lice gagne sans avoir rien trouvé ; « aucun » existe côté serveur mais n'est pas
 *     atteignable) : son « Éliminé » (5), « Affaire classée », sans confettis (CL1). Le dernier enquêteur lui-même gagne la
 *     partie : son « Solution révélée » (4), bandeau neutre « Dernier enquêteur en lice », sans confettis.
 *   Le premier état reçu n'anime rien. Une fin n'est animée que si l'écran de fin suit la fermeture d'une table en cours,
 *   quel que soit le temps passé sur le dernier geste (une page de fin ouverte plus tard, ou rechargée, ne rejoue rien). Mouvement réduit (body.plat-calme ou prefers-reduced-motion) :
 *   pas d'animation, les sons restent. Les éléments ajoutés sont retirés après leur durée (moins de 3 s, sauf la fin, 4,3 s),
 *   les minuteries annulées à detruire() ; celles de la fin passent par fxFin, nettoyé en quittant la partie. Aucun de ces
 *   éléments ne capte le clic (pointer-events: none).
 * Dépendances : commun/sons-jeux.js (jouerSonJeu, sons 'cluedo' 1 à 5), commun/effets-duels.js (anime, PALETTES),
 *   ../../vues/fin-fx.js (fxFin, gagnantsDe, issuePlateau) ; styles : ../../cluedo.css (classes ch-anim-*).
 *   Le plan porte data-suspect et data-piece sur chaque pion (plateau.js). table.js appelle maj() après chaque rendu ;
 *   fin.js appelle animerFin() après avoir inséré l'encart de fin.
 * Exporte : creerEffets(table, code) -> { maj(etat, monId), detruire() } ; animerFin(etat).
 */
import { jouerSonJeu } from '../../../../commun/sons-jeux.js';
import { anime as finAnimee, PALETTES } from '../../../../commun/effets-duels.js';
import { fxFin, gagnantsDe, issuePlateau } from '../../vues/fin-fx.js';
import { centrePiece } from './plateau.js';

const JEU = 'cluedo';
const DELAI_SORTIE_FIN = 5000;       // ms : au-delà, l'écran de fin ne fait plus suite à la fermeture de la table
const FIN_ATTENDUE = new Map();      // code de partie -> instant où la table a quitté cette partie encore en cours
const DUREE_GLISSE = 700;            // ms : trajet d'un pion d'une pièce à l'autre
const DELAI_RETOURNE = 150;          // ms : la carte montrée se retourne peu après son apparition
const DUREE_VOLANT = 2800;           // ms : la carte montrée disparaît après son retournement
const DELAI_TAMPON = 900;            // ms : le tampon « Montrée en secret » apparaît après le retournement
const DUREE_TAMPON = 2400;           // ms
const DUREE_TOUR = 4800;             // ms : pulsation de mon nom (4 battements de 1,2 s)
const DUREE_SELECTION = 3600;        // ms : pièces éclairées (3 battements de 1,2 s)
const DUREE_PANNEAU = 3900;          // ms : panneau surligné (3 battements de 1,3 s)
const DELAI_BANDEAU_FIN = 2300;      // ms : le bandeau attend la fin des retournements (le dernier finit vers 2,3 s)
const DUREE_RETOURNE_FIN = 4300;     // ms : les cartes retournées laissent la place aux vraies
const COULEUR_FIN = '#C9A24A';

/** Code de partie normalisé (en majuscules). */
const codeDe = (c) => String(c || '').toUpperCase();

/** Mouvement réduit demandé par le membre (plat-calme) ou par le système : pas d'animation. */
const reduit = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const mouvementOk = () => !document.body.classList.contains('plat-calme') && !reduit();

/** Je dois montrer une carte (même test que table.js : jeMontre). */
const montreur = (e, moi) => !!moi && e.jeu?.phase === 'montrer' && e.partie?.tour === moi && !!e.jeu?.hypothese?.a_montrer;
/** C'est à moi : mon tour, ou une carte à montrer (même test que le signal « à toi » de table.js). */
const aToi = (e, moi) => !!moi && (e.jeu?.actif === moi || montreur(e, moi));

/**
 * Pions du plan : pièce de chaque suspect, et élément et position du pion (en fraction de la taille du plan).
 * Les positions ne servent que pour le pion qui arrive : l'ancienne position est recalculée (voir centrePiece),
 * car la disposition du plan peut changer (image du manoir chargée après coup).
 * @returns {Map<string, {el: HTMLElement, piece: string, fx: number, fy: number, w: number, h: number, img: boolean}>}
 */
function mesurerPions(racine) {
  const res = new Map();
  const plan = racine.querySelector('.ch-plan');
  if (!plan) return res;
  const pr = plan.getBoundingClientRect();
  if (!pr.width || !pr.height) return res;
  const img = plan.classList.contains('ch-plan--image');
  plan.querySelectorAll('.ch-pawn[data-suspect]').forEach((p) => {
    const r = p.getBoundingClientRect();
    res.set(p.dataset.suspect, {
      el: p, piece: p.dataset.piece,
      fx: (r.left + r.width / 2 - pr.left) / pr.width,
      fy: (r.top + r.height / 2 - pr.top) / pr.height,
      w: pr.width, h: pr.height, img,
    });
  });
  return res;
}

/**
 * Effets de la table de Cluedo.
 * @param {HTMLElement} table élément de la table (.ch-table) : ses zones sont relues à chaque appel.
 * @param {string} code code de la partie.
 * @returns {{ maj: (etat: object, monId: string|null) => void, detruire: () => void }}
 */
export function creerEffets(table, code) {
  const minuteries = new Set();
  const corps = new Set();             // éléments ajoutés à la page (volants, tampons) : retirés à detruire()
  let prime = false;                   // premier état reçu
  let avant = null;                    // mesures de l'état précédent
  let codeEnCours = null;              // code de la partie, tant qu'elle est vue en cours
  let montrerClic = null;              // carte choisie au clic sur « Montrer » (style, contenu, place)

  /** Lance fn après ms, en gardant la minuterie pour l'annuler à detruire(). */
  function differer(ms, fn) {
    const t = setTimeout(() => { minuteries.delete(t); fn(); }, ms);
    minuteries.add(t);
  }

  /** Ajoute un élément à la page, retiré après ms. */
  function ephemere(el, ms) {
    document.body.append(el);
    corps.add(el);
    differer(ms, () => { el.remove(); corps.delete(el); });
    return el;
  }

  /** Pose une classe d'animation, puis la retire à la fin. */
  function animer(el, classe, ms) {
    el.classList.add(classe);
    differer(ms, () => el.classList.remove(classe));
  }

  /**
   * Clic sur « Montrer » : on note la carte choisie et sa place à cet instant (la page a pu défiler depuis le rendu).
   * Le clic est écouté après le panneau : son état (sélection) est déjà à jour.
   */
  function surClic(ev) {
    if (!ev.target.closest?.('[data-montrer]')) return;
    const sel = table.querySelector('.ch-carte-choix[aria-pressed="true"]');
    montrerClic = sel
      ? { style: sel.getAttribute('style') || '', html: sel.innerHTML, r: sel.getBoundingClientRect() }
      : null;
  }
  table.addEventListener('click', surClic);

  /** Tour à moi : nom et étiquette qui pulsent, pièces voisines et ma pièce éclairées, panneau surligné. */
  function signalerAToi() {
    const joueur = table.querySelector('.plat-bandeau-joueur.is-tour');
    if (joueur) {
      animer(joueur, 'ch-anim-joue', DUREE_TOUR + 200);
      const etiquette = joueur.querySelector('.plat-etiquette.is-tour');
      if (etiquette) animer(etiquette, 'ch-anim-joue', DUREE_TOUR + 200);
    }
    table.querySelectorAll('.ch-room.ch-sel, .ch-room.ch-hl').forEach((r) => animer(r, 'ch-anim-sel', DUREE_SELECTION + 200));
    const panneau = table.querySelector('.ch-panneau');
    if (panneau) animer(panneau, 'ch-anim-surligne', DUREE_PANNEAU + 200);
  }

  /**
   * Un pion glisse du centre de son ancienne pièce à sa place actuelle (transformation Web Animations, sans toucher au style).
   * @param n pion actuel (mesuré) ; o ancienne pièce ({piece}).
   */
  function glisser(n, o) {
    if (!n.el.animate) return;
    const depart = centrePiece(o.piece, n.img);
    if (!depart) return;
    const dx = (depart.x / 100 - n.fx) * n.w;
    const dy = (depart.y / 100 - n.fy) * n.h;
    n.el.animate([
      { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))` },
      { transform: 'translate(-50%, -50%)' },
    ], { duration: DUREE_GLISSE, easing: 'cubic-bezier(.3,.7,.3,1)' });
  }

  /** Tampon « Montrée en secret » centré sur une zone (coordonnées de la fenêtre). */
  function tampon(r) {
    const t = document.createElement('div');
    t.className = 'ch-anim-tampon';
    t.setAttribute('aria-hidden', 'true');
    t.textContent = 'Montrée en secret';
    t.style.left = `${r.left + r.width / 2}px`;
    t.style.top = `${r.top + r.height / 2}px`;
    ephemere(t, DUREE_TAMPON);
  }

  /** La carte choisie se retourne face cachée (celle qui la montre la voit ; les autres joueurs non). */
  function retourneChoix({ style, html, r }) {
    const v = document.createElement('div');
    v.className = 'ch-anim-vol';
    v.setAttribute('aria-hidden', 'true');
    Object.assign(v.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    const dos = document.createElement('i');
    dos.className = 'ch-anim-dos';
    const libelle = document.createElement('span');
    libelle.textContent = 'Secret';
    dos.append(libelle);
    const face = document.createElement('div');
    face.className = 'ch-carte-choix ch-anim-face';
    face.setAttribute('style', style);
    face.innerHTML = html;                    // contenu produit par table.js (texte échappé)
    v.append(dos, face);
    ephemere(v, DUREE_VOLANT);
    differer(DELAI_RETOURNE, () => v.classList.add('tourne'));
  }

  /**
   * Carte montrée : la carte choisie se retourne pour celle qui la montre, et le tampon apparaît pour tous (son déjà joué).
   * Le panneau a changé depuis le clic : le retournement se fait au centre du panneau, à la taille de la carte, dans la fenêtre.
   */
  function carteMontree() {
    const choisie = montrerClic;
    montrerClic = null;
    const panneau = table.querySelector('.ch-panneau');
    if (!panneau) return;
    const pr = panneau.getBoundingClientRect();
    if (!choisie) { tampon(pr); return; }
    const w = choisie.r.width;
    const h = choisie.r.height;
    const r = {
      left: Math.min(Math.max(pr.left + (pr.width - w) / 2, 8), window.innerWidth - w - 8),
      top: Math.min(Math.max(pr.top + (pr.height - h) / 2, 8), window.innerHeight - h - 8),
      width: w, height: h,
    };
    retourneChoix({ style: choisie.style, html: choisie.html, r });
    differer(DELAI_TAMPON, () => tampon(r));
  }

  return {
    /**
     * Compare l'état à l'état précédent et lance les effets des vrais changements.
     * @param {object} e état de la partie (plat.etat).
     * @param {string|null} moi identifiant de mon joueur (null pour un spectateur).
     */
    maj(e, moi) {
      if (!e?.partie) return;
      const jeu = e.jeu || {};
      const historique = Array.isArray(jeu.historique) ? jeu.historique : [];
      const accusations = Array.isArray(jeu.accusations) ? jeu.accusations : [];
      const pions = mesurerPions(table);
      const tourMoi = aToi(e, moi);
      codeEnCours = e.partie.statut === 'en_cours' ? codeDe(e.partie.code || code) : null;

      if (!prime) {
        prime = true;
        avant = { phase: jeu.phase, tourMoi, nbHisto: historique.length, nbAccus: accusations.length, pions };
        return;
      }

      const anime = mouvementOk();

      /* Pions : celui qui a changé de pièce glisse ; un pas sur le plateau par déplacement. */
      let bouge = false;
      for (const [suspect, n] of pions) {
        const o = avant.pions.get(suspect);
        if (!o || o.piece === n.piece) continue;
        bouge = true;
        if (anime) glisser(n, o);
      }
      if (bouge) jouerSonJeu(JEU, 1);

      /* À moi : nouveau tour ou carte à montrer. */
      if (anime && tourMoi && !avant.tourMoi) signalerAToi();

      /* Hypothèse posée : la phase quitte « hypothese » pour « montrer » ou « apres ». */
      if (avant.phase === 'hypothese' && (jeu.phase === 'montrer' || jeu.phase === 'apres')) jouerSonJeu(JEU, 3);

      /* Carte montrée : nouvelle entrée d'historique, avec la personne qui a montré (sans la carte). */
      const nouvelle = historique.length > avant.nbHisto ? historique[historique.length - 1] : null;
      if (nouvelle && nouvelle.montre_par != null) {
        jouerSonJeu(JEU, 2);
        if (anime) carteMontree();
      } else {
        montrerClic = null;
      }

      /* Accusation fausse : la personne est éliminée. */
      if (accusations.length > avant.nbAccus && !accusations[accusations.length - 1].juste) jouerSonJeu(JEU, 5);

      avant = { phase: jeu.phase, tourMoi, nbHisto: historique.length, nbAccus: accusations.length, pions };
    },

    /** Annule les minuteries et retire les éléments ajoutés (la table est quittée) ; note qu'elle quitte une partie en cours. */
    detruire() {
      if (codeEnCours) FIN_ATTENDUE.set(codeEnCours, Date.now());
      table.removeEventListener('click', surClic);
      minuteries.forEach((t) => clearTimeout(t));
      minuteries.clear();
      corps.forEach((el) => el.remove());
      corps.clear();
    },
  };
}

/**
 * Retourne une carte de la solution (dos « ? » puis face), après delai ms. Posée dans l'enveloppe, et non fixée à l'écran : elle
 * reste sur sa carte quand la page défile, et disparaît avec l'écran.
 */
function retourneSolution(src, delai) {
  const v = document.createElement('div');
  v.className = 'ch-anim-vol';
  v.setAttribute('aria-hidden', 'true');
  Object.assign(v.style, { position: 'absolute', left: `${src.offsetLeft}px`, top: `${src.offsetTop}px`, width: `${src.offsetWidth}px`, height: `${src.offsetHeight}px` });
  const dos = document.createElement('i');
  dos.className = 'ch-anim-dos';
  const point = document.createElement('span');
  point.textContent = '?';
  dos.append(point);
  const face = src.cloneNode(true);
  face.classList.add('ch-anim-face');
  face.removeAttribute('id');
  v.append(dos, face);
  src.parentNode.append(v);
  src.style.visibility = 'hidden';
  fxFin.plus(() => v.classList.add('tourne'), delai);
  fxFin.plus(() => { v.remove(); src.style.visibility = ''; }, DUREE_RETOURNE_FIN);
}

/**
 * Le bandeau de la fin : « Affaire classée » (CL1), « Dernier enquêteur en lice » pour celui qui gagne ainsi, ou « Enquête résolue »
 * avec le nom, confettis pour le gagnant seul (CL2).
 */
function bandeauFin(etat) {
  const gagnant = issuePlateau(etat) === 'gagnant';
  if (etat.partie.raison !== 'enquete') {
    if (gagnant) fxFin.bandeau('Dernier enquêteur en lice', 'Tu gagnes la partie', { ton: 'n' });
    else fxFin.bandeau('Affaire classée', 'Personne n’a trouvé', { ton: 'n' });
    return;
  }
  if (gagnant) {
    fxFin.bandeau('Enquête résolue', 'Tu as trouvé', { couleur: COULEUR_FIN });
    fxFin.confettis(PALETTES.ch);
    return;
  }
  const qui = gagnantsDe(etat.joueurs || [])[0]?.pseudo;
  fxFin.bandeau('Enquête résolue', qui ? `${qui} a trouvé` : 'La solution est révélée', { ton: 'n' });
}

/**
 * Effets de l'écran de fin, si la partie vient de se terminer sous mes yeux (la table vient de se fermer sur une partie en cours).
 * Appelé par fin.js après l'insertion de l'encart de fin. Une seule fois par partie.
 * @param {object} etat état de la partie (etat.partie.code, etat.partie.raison, etat.jeu.enveloppe).
 */
export function animerFin(etat) {
  const code = codeDe(etat?.partie?.code);
  const vu = FIN_ATTENDUE.get(code);
  FIN_ATTENDUE.delete(code);
  if (vu === undefined || Date.now() - vu > DELAI_SORTIE_FIN) return;
  if (etat.partie.statut !== 'terminee' || !etat.jeu?.enveloppe) return;
  jouerSonJeu(JEU, etat.partie.raison === 'enquete' || issuePlateau(etat) === 'gagnant' ? 4 : 5);
  if (!finAnimee()) return;
  [...document.querySelectorAll('.ch-fin .ch-sol')].forEach((s, i) => retourneSolution(s, 400 + i * 500));
  fxFin.plus(() => bandeauFin(etat), DELAI_BANDEAU_FIN);
}
