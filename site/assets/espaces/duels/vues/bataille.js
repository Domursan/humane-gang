// ===== Humane Gang — Duels : table Bataille navale (#partie/CODE, jeu bataille) =====
/*
 * Rôle : une table Bataille navale dans le cadre commun (vues/commun.js).
 *   Phase 'placement' : je pose mes 5 navires sur une grille 10 × 10 (sélection, pivot, aperçu, « Au hasard »,
 *   « Valider ma flotte »). Une fois prêt, j'attends l'autre ; le serveur pose la flotte au hasard si le temps est écoulé.
 *   Phase 'jeu' : « Ta flotte » (mes navires + tirs reçus) et « Flotte de X » (mes tirs, cases cliquables à mon tour),
 *   radar (une fois par manche), salve (tirs restants), restants des deux côtés dans la colonne latérale.
 *   Spectateur : les deux grilles avec les tirs, aucune action.
 *   Effets (ajouts visuels et sonores, sur les seuls nouveaux tirs ou tours) : « à toi » (face et cases libres),
 *   tir dans l'eau, touché, coulé (secousse et bandeau), tir reçu (viseur). Fin de duel (effetsFin, appelé par fin.js) : victoire ;
 *   défaite (BN1) : ma flotte s'enfonce case par case sur l'écran de fin, son « Coulé », bandeau sobre.
 *   Le signal « à toi » (son et titre) reste dans commun.js. Mouvement réduit : pas d'animation, les sons restent.
 *   Exporte aussi : effetsFin.
 * Dessin : navires vus de dessus en SVG (symboles définis une fois dans la vue), feu et éclaboussure sur les cases.
 * Accessibilité : chaque case de tir est un <button> avec aria-label « B7 : pas encore visée » ; l'état n'est
 *   jamais donné par la couleur seule (icônes et texte). Animations coupées par body.duels-calme.
 * Dépendances : core.js (esc, toast, motionAllowed), ../api.js (duel, erreurTexte, FLOTTE, nomCase), ./commun.js (creerCadre, nomJoueur),
 *   ./fin-fx.js (effetsFinDuel, fxFin), ../../../commun/effets-duels.js (anime).
 * Exporte : creer.
 */
import { esc, toast, motionAllowed } from '../../../commun/core.js';
import { duel, erreurTexte, FLOTTE, nomCase } from '../api.js';
import { creerCadre, nomJoueur, deJoueur, deNom } from './commun.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';
import { voisinGrille } from '../../../commun/grille-clavier.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { anime as animePermis } from '../../../commun/effets-duels.js';
import { effetsFinDuel, fxFin } from './fin-fx.js';

const TAILLE = 10;
const NB_CASES = 100;
/** Motifs (symboles SVG) et longueur de chaque navire. */
const SYMBOLE = { porte_avions: 'hA', cuirasse: 'hB', croiseur: 'hC', sous_marin: 'hS', torpilleur: 'hT' };
/** Largeur de chaque symbole (unités : 44 par case). */
const LARGEUR_SYMBOLE = { hA: 220, hB: 176, hC: 132, hS: 132, hT: 88 };
const MESSAGE_REFUS = {
  hors: 'Le navire dépasse de la grille.',
  chevauche: 'Un autre navire occupe déjà cette place.',
  contact: 'Trop près d’un autre navire.',
};
const RANG_LETTRES = 'ABCDEFGHIJ';

/* ---------- Géométrie et placements ---------- */

/** Cases d'un navire posé à partir de `debut` (case la plus petite) ; null si la ligne sort de la grille. */
function casesDe(debut, longueur, horizontal) {
  const col = debut % TAILLE;
  const ligne = Math.floor(debut / TAILLE);
  if (horizontal ? col + longueur > TAILLE : ligne + longueur > TAILLE) return null;
  return Array.from({ length: longueur }, (_, i) => (horizontal ? debut + i : debut + i * TAILLE));
}
/** Vrai si les cases forment une ligne horizontale (une seule case compte comme horizontale). */
function estHorizontal(cases) {
  return cases.length < 2 || cases[1] - cases[0] === 1;
}
/** Voisinage de 8 cases (diagonales comprises), limité à la grille. */
function voisines(c) {
  const col = c % TAILLE;
  const ligne = Math.floor(c / TAILLE);
  const res = [];
  for (let dl = -1; dl <= 1; dl += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (!dl && !dc) continue;
      const l = ligne + dl;
      const k = col + dc;
      if (l >= 0 && l < TAILLE && k >= 0 && k < TAILLE) res.push(l * TAILLE + k);
    }
  }
  return res;
}
/**
 * Vérifie un placement candidat contre les autres navires.
 * @returns {string|null} clé de MESSAGE_REFUS, ou null si le placement est permis.
 */
function verifier(cases, autres, contactOk) {
  if (!cases) return 'hors';
  const occupees = new Set(autres.flat());
  if (cases.some((c) => occupees.has(c))) return 'chevauche';
  if (!contactOk && cases.some((c) => voisines(c).some((v) => occupees.has(v)))) return 'contact';
  return null;
}
/** Style CSS (calc) d'un navire sur la grille : coordonnées depuis le coin de la grille. */
function geometrie(cases) {
  const l = cases.length;
  const debut = Math.min(...cases);
  const col = debut % TAILLE;
  const ligne = Math.floor(debut / TAILLE);
  const lbl = 'var(--bn-lbl)';
  const c = 'var(--bn-cell)';
  if (estHorizontal(cases)) {
    return {
      rotation: '',
      style: `left:calc(${lbl} + ${col} * ${c});top:calc(${lbl} + ${ligne} * ${c});width:calc(${l} * ${c});height:${c}`,
    };
  }
  // Vertical : boîte horizontale centrée sur la colonne, puis tournée de 90°.
  const cx = `calc(${lbl} + ${col} * ${c} + ${c} / 2)`;
  const cy = `calc(${lbl} + ${ligne} * ${c} + ${l} * ${c} / 2)`;
  return {
    rotation: ' bn-tourne',
    style: `left:calc(${cx} - ${l} * ${c} / 2);top:calc(${cy} - ${c} / 2);width:calc(${l} * ${c});height:${c}`,
  };
}
/** SVG d'un navire (symbole partagé défini dans l'en-tête de la vue). */
function coque(type, cases, { coule = false, fantome = '' } = {}) {
  const sym = SYMBOLE[type] || 'hT';
  const g = geometrie(cases);
  const classes = `bn-coque${g.rotation}${coule ? ' is-coule' : ''}${fantome ? ' ' + fantome : ''}`;
  return `<svg class="${classes}" style="${g.style}" viewBox="0 0 ${LARGEUR_SYMBOLE[sym]} 44" preserveAspectRatio="none" aria-hidden="true" focusable="false"><use href="#bn-${sym}"></use></svg>`;
}
/** Nom lisible d'un navire d'après son type. */
function nomNavire(type) {
  return (FLOTTE.find((f) => f.type === type) || { nom: 'Navire' }).nom;
}
/** Longueur d'un navire d'après son type. */
function longueurNavire(type) {
  return (FLOTTE.find((f) => f.type === type) || { longueur: 1 }).longueur;
}
/** Type du navire posé sur la case c (dans un ensemble {type: cases}), ou null. */
function typeEn(pose, c) {
  for (const t of Object.keys(pose)) if (pose[t].includes(c)) return t;
  return null;
}

/* ---------- Effets (ajouts visuels, aucun clic intercepté) ---------- */

/** Bandeau fixe au milieu de la page (sans clic, retiré après 2,3 s). Textes fixes ou déjà contrôlés. */
function bandeau(titre, sous) {
  const b = document.createElement('div');
  b.className = 'bn-fx-ban';
  b.setAttribute('aria-hidden', 'true');
  b.append(titre);
  const s = document.createElement('small');
  s.textContent = sous;
  b.append(s);
  document.body.append(b);
  setTimeout(() => b.remove(), 2300);
}
/** Élément d'effet centré sur (x, y), retiré après `ms`. */
function fxEn(classe, x, y, ms) {
  const d = document.createElement('i');
  d.className = `bn-fx ${classe}`;
  d.setAttribute('aria-hidden', 'true');
  d.style.left = `${x}px`;
  d.style.top = `${y}px`;
  document.body.append(d);
  setTimeout(() => d.remove(), ms);
}
/** Centre d'un élément, en coordonnées de la fenêtre. */
function centreDe(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
/** Ajoute une classe d'effet à un élément pendant quelques instants (sans effet si l'élément n'existe plus). */
function flash(el, classe, ms) {
  if (!el) return;
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}

/**
 * BN1, défaite vue en direct : ma flotte réelle de l'écran de fin (ma grille, pas forcément la première) s'enfonce case par case,
 * puis bandeau sobre ; mes cases reprennent ensuite leur état coulé. Mouvement réduit : les cases restent coulées, sans bandeau ; le son reste (joué par effetsFin).
 */
function flotteCoulee(root, e) {
  const js = e.joueurs || [];
  const adv = js.find((j) => j.user_id !== e.moi?.user_id);
  if (animePermis()) {
    const grille = root.querySelectorAll('.duels-fin-bgrille')[js.findIndex((j) => j.user_id === e.moi?.user_id)];
    grille?.querySelectorAll('.is-coule').forEach((c, i) => {
      c.style.setProperty('--bn-d', `${i * 80}ms`);
      c.classList.add('bn-fx-sombre');
    });
    // Puis mes cases reviennent, rouges : la légende de l'écran de fin reste vraie.
    const coulees = [...(grille?.querySelectorAll('.is-coule') || [])];
    fxFin.rendre(coulees, ['bn-fx-sombre'], coulees.length * 80 + 1300);
  }
  fxFin.plus(() => fxFin.bandeau('Flotte coulée', `${adv?.robot ? 'Le robot' : (adv?.pseudo || 'Ton adversaire')} gagne le duel`, { ton: 'd' }), 700);
}

/**
 * Fin de duel vue en direct (appelé par vues/fin.js) : gagnant : son, gagnant qui brille, bandeau et confettis ;
 * perdant : son « Coulé » du site et flotteCoulee. son() n'est appelé qu'une fois, partie vue en direct : c'est là que part l'effet.
 * @param {HTMLElement} root conteneur de l'écran de fin.
 * @param {object} e état du duel terminé.
 */
export function effetsFin(root, e) {
  const p = e.partie || {};
  const tirs = (e.bataille?.tirs?.[e.moi?.user_id] || []).length;
  const format = p.format > 1 ? `Au meilleur des ${p.format}` : 'Manche unique';
  effetsFinDuel(root, e, {
    jeu: 'bataille-navale',
    son: (issue) => {
      if (issue === 'perdant') flotteCoulee(root, e);
      return { gagnant: 5, perdant: 3 }[issue] || null;
    },
    titre: (issue) => (issue === 'gagnant' ? ['Tu gagnes le duel !', `${format} · ${tirs} tir${tirs > 1 ? 's' : ''}`] : null),
  });
}

/* ---------- Dessin ---------- */

/** Définitions SVG partagées (coques, feu, fumée), insérées une fois dans la vue. */
const DEFS = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="bn-acier" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AA4B1"/><stop offset=".5" stop-color="#7D8794"/><stop offset="1" stop-color="#4E5762"/></linearGradient>
  <linearGradient id="bn-pont" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DDE3EA"/><stop offset="1" stop-color="#A9B3BE"/></linearGradient>
  <radialGradient id="bn-tourelle" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#C3CBD5"/><stop offset="1" stop-color="#4B5360"/></radialGradient>
  <symbol id="bn-hA" viewBox="0 0 220 44">
    <path d="M4 8Q4 4 9 4H198Q214 4 218 22Q214 40 198 40H9Q4 40 4 36Z" fill="url(#bn-acier)" stroke="#3E4650" stroke-width="1.3"/>
    <path d="M12 12H190M12 32H190" stroke="#5A6370" stroke-width=".6" opacity=".6"/>
    <rect x="22" y="9" width="168" height="26" rx="3" fill="url(#bn-pont)" stroke="#4B5360" stroke-width=".8"/>
    <path d="M30 22H182" stroke="#F2EFEA" stroke-width="1.3" stroke-dasharray="7 5"/>
    <rect x="70" y="14" width="14" height="16" fill="none" stroke="#6B7480" stroke-width=".8"/>
    <rect x="122" y="5" width="22" height="10" rx="2" fill="#5E6671" stroke="#3A4049" stroke-width=".8"/>
  </symbol>
  <symbol id="bn-hB" viewBox="0 0 176 44">
    <path d="M4 8Q4 4 9 4H154Q170 4 174 22Q170 40 154 40H9Q4 40 4 36Z" fill="url(#bn-acier)" stroke="#3E4650" stroke-width="1.3"/>
    <rect x="42" y="15" width="28" height="4" rx="1" fill="#3A4049"/><rect x="42" y="25" width="28" height="4" rx="1" fill="#3A4049"/>
    <circle cx="40" cy="22" r="9" fill="url(#bn-tourelle)" stroke="#3A4049" stroke-width=".8"/>
    <rect x="76" y="14" width="22" height="16" rx="3" fill="#6B7480" stroke="#3A4049" stroke-width=".8"/>
    <circle cx="92" cy="22" r="3.5" fill="#4B5360"/>
    <rect x="120" y="15" width="28" height="4" rx="1" fill="#3A4049"/><rect x="120" y="25" width="28" height="4" rx="1" fill="#3A4049"/>
    <circle cx="118" cy="22" r="9" fill="url(#bn-tourelle)" stroke="#3A4049" stroke-width=".8"/>
  </symbol>
  <symbol id="bn-hC" viewBox="0 0 132 44">
    <path d="M4 8Q4 4 9 4H110Q126 4 130 22Q126 40 110 40H9Q4 40 4 36Z" fill="url(#bn-acier)" stroke="#3E4650" stroke-width="1.3"/>
    <circle cx="28" cy="22" r="6.5" fill="url(#bn-tourelle)" stroke="#3A4049" stroke-width=".8"/>
    <rect x="50" y="14" width="26" height="16" rx="3" fill="#6B7480" stroke="#3A4049" stroke-width=".8"/>
    <circle cx="86" cy="22" r="4" fill="#4B5360" stroke="#2F3640" stroke-width=".8"/>
    <circle cx="104" cy="22" r="6" fill="url(#bn-tourelle)" stroke="#3A4049" stroke-width=".8"/>
  </symbol>
  <symbol id="bn-hS" viewBox="0 0 132 44">
    <path d="M4 14Q4 11 9 11H106Q126 12 130 22Q126 32 106 33H9Q4 33 4 30Z" fill="url(#bn-acier)" stroke="#3E4650" stroke-width="1.3"/>
    <path d="M14 22H106" stroke="#4B5360" stroke-width=".8" stroke-dasharray="2 3"/>
    <rect x="52" y="6" width="20" height="14" rx="4" fill="#6B7480" stroke="#3A4049" stroke-width=".8"/>
    <rect x="60" y="2" width="3" height="6" fill="#3A4049"/>
  </symbol>
  <symbol id="bn-hT" viewBox="0 0 88 44">
    <path d="M4 10Q4 6 9 6H66Q80 6 84 22Q80 38 66 38H9Q4 38 4 34Z" fill="url(#bn-acier)" stroke="#3E4650" stroke-width="1.3"/>
    <rect x="34" y="16" width="20" height="12" rx="3" fill="#6B7480" stroke="#3A4049" stroke-width=".8"/>
  </symbol>
  <symbol id="bn-feu" viewBox="0 0 30 40">
    <path d="M15 1C18 9 27 14 27 26C27 34 21 39 15 39C9 39 3 34 3 26C3 18 10 15 11 7C13 11 14 13 15 14C16 9 15 5 15 1Z" fill="#C9361F"/>
    <path d="M15 12C17 17 23 20 23 28C23 34 19 37 15 37C11 37 7 34 7 28C7 22 12 20 13 15C14 18 14 19 15 20C16 17 15 14 15 12Z" fill="#F07A2A"/>
    <path d="M15 24C16 27 19 29 19 33C19 36 17 37 15 37C13 37 11 36 11 33C11 30 14 28 15 24Z" fill="#FFD25A"/>
  </symbol>
</defs></svg>`;

/** Icône d'une case touchée (feu) ou d'une case à l'eau (éclaboussure, décorative). */
const ICONE = {
  eau: '<span class="bn-eau" aria-hidden="true"></span>',
  touche: '<svg class="bn-feu" viewBox="0 0 30 40" aria-hidden="true" focusable="false"><use href="#bn-feu"></use></svg>',
  radar: '<span class="bn-radar-ico" aria-hidden="true"></span>',
  rien: '',
};

/**
 * Crée une grille 10 × 10 (labels A-J, 1-10) dans `parent`.
 * role : 'tir' (cases cliquables), 'pose' (placement) ou 'passive' (lecture seule).
 * Retourne { el, cases: Map(c → bouton/span), calque }.
 */
/** Une seule case de la grille dans l'ordre de tabulation (roving tabindex) : celle que l'on désigne. */
function rouler(grille, cible) {
  grille.querySelectorAll('button[data-case]').forEach((n) => { n.tabIndex = n === cible ? 0 : -1; });
}

/** Case active suivante (ou précédente) d'une grille, pour garder le focus quand la case courante devient inactive. */
function caseActiveVoisine(n) {
  const grille = n.closest('.bn-grille');
  if (!grille) return null;
  const cases = [...grille.querySelectorAll('button[data-case]')];
  const pos = cases.indexOf(n);
  return cases.slice(pos + 1).find((x) => !x.disabled) || cases.slice(0, pos).reverse().find((x) => !x.disabled) || null;
}

function creerGrille(parent, { role, titre }) {
  const lettres = [...RANG_LETTRES].map((l) => `<span class="bn-lbl" aria-hidden="true">${l}</span>`).join('');
  let corps = '';
  for (let l = 0; l < TAILLE; l += 1) {
    corps += `<span class="bn-lbl" aria-hidden="true">${l + 1}</span>`;
    for (let k = 0; k < TAILLE; k += 1) {
      const c = l * TAILLE + k;
      corps += role === 'passive'
        ? `<span class="bn-c" role="img" data-case="${c}"></span>`
        : `<button type="button" class="bn-c" data-role="${role}" data-case="${c}"></button>`;
    }
  }
  const el = document.createElement('div');
  el.className = 'bn-grille';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', titre);
  el.innerHTML = `<span class="bn-coin" aria-hidden="true"></span>${lettres}${corps}<div class="bn-calque" aria-hidden="true"></div>`;
  parent.appendChild(el);
  const premiere = el.querySelector('button[data-case]');
  if (premiere) rouler(el, premiere);
  const cases = new Map();
  el.querySelectorAll('[data-case]').forEach((n) => cases.set(Number(n.dataset.case), n));
  return { el, cases, calque: el.querySelector('.bn-calque'), cleCalque: null };
}

/** Met à jour une case seulement si son état a changé (évite de rejouer les animations). */
function peindreCase(n, { etat, classes = '', label, icone = 'rien', actif = false, valeur = null }) {
  const cle = `${etat}|${classes}|${label}|${icone}|${actif}|${valeur}`;
  if (n.dataset.cle === cle) return;
  n.dataset.cle = cle;
  n.dataset.etat = etat;
  n.className = `bn-c${classes ? ' ' + classes : ''}`;
  n.setAttribute('aria-label', label);
  if (n.tagName === 'BUTTON') {
    const avait = document.activeElement === n;
    n.disabled = !actif;
    // Case qui vient d'être visée : le focus passe à une case active voisine (sinon il tomberait hors de la grille).
    if (avait && n.disabled) caseActiveVoisine(n)?.focus();
  }
  n.innerHTML = `${ICONE[icone] || ''}${valeur !== null ? `<span class="bn-valeur" aria-hidden="true">${esc(String(valeur))}</span>` : ''}`;
}

/** Redessine le calque (navires) seulement si sa composition a changé. */
function peindreCalque(grille, morceaux) {
  const cle = morceaux.map((m) => m.html).join('');
  if (grille.cleCalque === cle) return;
  grille.cleCalque = cle;
  grille.calque.innerHTML = morceaux.map((m) => m.html).join('');
}

/* ---------- Table ---------- */

/** Texte d'aide des placements (aperçu et erreurs). */
const TEXTE_OK = 'Position possible';

/**
 * Crée la table Bataille navale.
 * @param {HTMLElement} root conteneur de la vue.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj(etat: object): void, message(msg: object): void, detruire(): void}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-bn' });
  boutonReponses(root.querySelector('.duels-barre-outils'), 'bataille', () => st.etat?.partie?.id ?? null);
  const st = {
    etat: null,
    vue: null,          // 'saisie' | 'attente' | 'spectateur-placement' | 'jeu'
    occupe: false,
    // placement
    pose: {},           // type → cases (flotte en cours de placement)
    choisi: null,       // type sélectionné (à placer ou à déplacer)
    orient: 'h',        // 'h' | 'v' pour le prochain navire
    survol: null,       // case visée (souris, clavier ou tap)
    // jeu
    radar: false,       // mode radar armé
    tirDerniers: null,
    grilles: {},        // 'moi' | 'adv' | 'p1' | 'p2' → grille DOM
    compte: null,       // minuteur de placement
    dernierCompte: null,
  };
  const q = (s) => root.querySelector(s);
  root.insertAdjacentHTML('afterbegin', DEFS);

  /* ----- lectures de l'état ----- */

  /** Mon joueur (ou null pour un spectateur). */
  const moiJ = (e) => cadre.joueurMoi(e);
  /** Joueur adverse (ou null). */
  const advJ = (e) => cadre.adversaire(e);
  /** Vrai si je peux agir dans la phase en cours (joueur, duel en cours, pas d'envoi). */
  const peutAgir = (e) => !!e && !st.occupe && !!e.moi?.joue && e.partie.statut === 'en_cours';
  /** Vrai si je peux poser mes navires. */
  const peutPoser = (e) => peutAgir(e) && e.partie.phase === 'placement' && !moiJ(e)?.pret;
  /** Vrai si c'est à moi de tirer. */
  const peutTirer = (e) => peutAgir(e) && e.partie.phase === 'jeu' && cadre.monTour(e);
  /** Contact autorisé entre navires (réglage de la partie). */
  const contactOk = (e) => !!e?.bataille?.contact;
  /** Cases déjà occupées par les autres navires que `type`. */
  const autres = (type) => Object.keys(st.pose).filter((t) => t !== type).map((t) => st.pose[t]);

  /** Orientation d'un navire posé (true = horizontal). */
  const orientationDe = (type) => (st.pose[type] ? estHorizontal(st.pose[type]) : st.orient === 'h');

  /* ----- placement ----- */

  /** Essaie de poser le navire `choisi` à partir de la case c. Retourne null si ok, sinon la clé du refus. */
  const tenterPose = (type, debut) => {
    const horizontal = orientationDe(type);
    const cases = casesDe(debut, longueurNavire(type), horizontal);
    const refus = verifier(cases, autres(type), contactOk(st.etat));
    if (refus) return refus;
    st.pose[type] = cases;
    return null;
  };

  /** Aperçu : case survolée, navire sélectionné. Retourne { cases(bruts), ok, refus }. */
  const apercu = () => {
    if (!st.choisi || st.survol === null) return null;
    const horizontal = orientationDe(st.choisi);
    const longueur = longueurNavire(st.choisi);
    const cases = casesDe(st.survol, longueur, horizontal);
    if (!cases) {
      // Partie hors grille : on montre les cases qui restent dans la grille, en rouge.
      const brut = Array.from({ length: longueur }, (_, i) => (horizontal ? st.survol + i : st.survol + i * TAILLE));
      return { cases: brut.filter((c) => c >= 0 && c < NB_CASES && (!horizontal || Math.floor(c / TAILLE) === Math.floor(st.survol / TAILLE))), refus: 'hors', horizontal };
    }
    const refus = verifier(cases, autres(st.choisi), contactOk(st.etat));
    return { cases, refus, horizontal };
  };

  /** Message affiché sous la grille de placement (lu par les lecteurs d'écran via le statut). */
  const dire = (t) => cadre.statut(t);

  /** Redessine la grille de placement : navires posés, aperçu, cases cliquables. */
  const peindrePlacement = () => {
    const g = st.grilles.moi;
    if (!g) return;
    const ap = apercu();
    const survolees = new Set(ap ? ap.cases : []);
    for (let c = 0; c < NB_CASES; c += 1) {
      const n = g.cases.get(c);
      const type = typeEn(st.pose, c);
      let classes = '';
      if (type) classes += ' is-navire';
      if (type && type === st.choisi) classes += ' is-choisi';
      if (ap && survolees.has(c)) classes += ap.refus ? ' is-ap-ko' : ' is-ap-ok';
      peindreCase(n, {
        etat: type ? 'navire' : 'vide',
        classes: classes.trim(),
        label: `${nomCase(c)} : ${type ? nomNavire(type) : 'vide'}`,
        actif: true,
      });
    }
    const morceaux = Object.keys(st.pose).map((t) => ({ html: coque(t, st.pose[t], { fantome: st.choisi === t ? 'is-choisi' : '' }) }));
    if (ap && ap.cases.length) {
      morceaux.push({ html: coque(st.choisi, ap.cases, { fantome: ap.refus ? 'is-fantome is-ko' : 'is-fantome' }) });
    }
    peindreCalque(g, morceaux);
    const txt = q('[data-apercu]');
    if (txt) txt.textContent = ap ? (ap.refus ? MESSAGE_REFUS[ap.refus] : TEXTE_OK) : '';
    if (txt) txt.className = `bn-apercu${ap ? (ap.refus ? ' is-ko' : ' is-ok') : ''}`;
  };

  /** Liste des navires à placer (boutons) et compteur. */
  const peindreListe = () => {
    const liste = q('[data-liste]');
    if (!liste) return;
    const items = FLOTTE.map((f) => {
      const pose = !!st.pose[f.type];
      const sel = st.choisi === f.type;
      const statut = sel ? 'En déplacement' : pose ? 'Placé' : 'À placer';
      const minis = Array.from({ length: f.longueur }, () => `<span class="bn-mini${pose ? ' is-pose' : ' is-off'}"></span>`).join('');
      return `<li><button type="button" class="bn-nav${sel ? ' is-choisi' : ''}" data-act="choisir" data-type="${f.type}" aria-pressed="${sel}">
        <span class="bn-nav-nom"><strong>${esc(f.nom)}</strong> <span class="bn-nav-taille">${f.longueur} cases</span></span>
        <span class="bn-minis" aria-hidden="true">${minis}</span>
        <span class="bn-nav-statut">${statut}</span></button></li>`;
    }).join('');
    liste.innerHTML = items;
    const nb = Object.keys(st.pose).length;
    q('[data-compte-pose]').textContent = `${nb} sur ${FLOTTE.length} posés`;
    const valider = q('[data-act="valider"]');
    if (valider) valider.disabled = nb < FLOTTE.length || st.occupe;
    const pivot = q('[data-act="pivoter"]');
    if (pivot) pivot.setAttribute('aria-label', `Pivoter (${orientationLisible()})`);
  };

  const orientationLisible = () => (st.choisi && st.pose[st.choisi] ? (orientationDe(st.choisi) ? 'horizontal' : 'vertical') : (st.orient === 'h' ? 'horizontal' : 'vertical'));

  /** Clic sur une case de la grille de placement. */
  const cliquerPlacement = (c) => {
    if (!peutPoser(st.etat)) return;
    const occupant = typeEn(st.pose, c);
    if (!st.choisi) {
      if (occupant) {
        st.choisi = occupant;
        st.orient = orientationDe(occupant) ? 'h' : 'v';
        dire(`${nomNavire(occupant)} sélectionné. Clique une autre case pour le déplacer, ou pivote-le.`);
      } else {
        dire('Choisis d’abord un navire dans la liste.');
      }
    } else {
      const refus = tenterPose(st.choisi, c);
      if (refus) {
        dire(MESSAGE_REFUS[refus]);
      } else {
        dire(`${nomNavire(st.choisi)} posé en ${nomCase(c)}.`);
        st.choisi = null;
      }
    }
    peindreListe();
    peindrePlacement();
    maj_actions();
  };

  /** Clic dans la liste : sélectionne (ou désélectionne) un navire. */
  const choisirNavire = (type) => {
    st.choisi = st.choisi === type ? null : type;
    if (st.choisi && st.pose[st.choisi]) st.orient = orientationDe(st.choisi) ? 'h' : 'v';
    dire(st.choisi ? `${nomNavire(st.choisi)} sélectionné. Choisis une case de la grille.` : '');
    peindreListe();
    peindrePlacement();
  };

  /** Pivote le navire sélectionné (ou l'orientation du prochain). Si déjà posé, tente la nouvelle orientation. */
  const pivoter = () => {
    if (!peutPoser(st.etat)) return;
    if (st.choisi && st.pose[st.choisi]) {
      const ancien = st.pose[st.choisi];
      const debut = Math.min(...ancien);
      const cases = casesDe(debut, ancien.length, !estHorizontal(ancien));
      const refus = verifier(cases, autres(st.choisi), contactOk(st.etat));
      if (refus) { dire(MESSAGE_REFUS[refus]); return; }
      st.pose[st.choisi] = cases;
    }
    st.orient = st.orient === 'h' ? 'v' : 'h';
    peindreListe();
    peindrePlacement();
  };

  /** Tout effacer du brouillon. */
  const toutEffacer = () => {
    st.pose = {};
    st.choisi = null;
    dire('Flotte effacée.');
    peindreListe();
    peindrePlacement();
    maj_actions();
  };

  /** Placement au hasard (proposition du serveur, non enregistrée avant « Valider »). */
  const auHasard = async () => {
    if (!peutPoser(st.etat)) return;
    st.occupe = true; maj_actions();
    try {
      const flotte = await duel.flotteHasard(ctx.code);
      st.pose = {};
      for (const n of flotte || []) st.pose[n.type] = [...n.cases].sort((a, b) => a - b);
      st.choisi = null;
      dire('Flotte tirée au hasard. Tu peux la modifier avant de valider.');
    } catch (err) {
      toast(erreurTexte(err), 'error');
    } finally {
      st.occupe = false;
      peindreListe(); peindrePlacement(); maj_actions();
    }
  };

  /** Valide ma flotte complète auprès du serveur. */
  const validerFlotte = async () => {
    if (!peutPoser(st.etat) || Object.keys(st.pose).length < FLOTTE.length) return;
    st.occupe = true; maj_actions();
    const navires = FLOTTE.map((f) => ({ type: f.type, cases: st.pose[f.type] }));
    try {
      await duel.placer(ctx.code, navires);
      dire('Flotte en place.');
    } catch (err) {
      toast(erreurTexte(err), 'error');
    } finally {
      st.occupe = false;
      ctx.suivi?.rafraichir();
      maj_actions();
    }
  };

  /* ----- actions (boutons de la phase en cours) ----- */

  /** Met à jour l'état des boutons (Valider, Au hasard, Pivoter) selon la phase. */
  const maj_actions = () => {
    const v = q('[data-act="valider"]');
    if (v) v.disabled = Object.keys(st.pose).length < FLOTTE.length || st.occupe;
    const h = q('[data-act="hasard"]');
    if (h) h.disabled = st.occupe;
    const r = q('[data-act="radar"]');
    if (r) r.disabled = !peutTirer(st.etat) || !!moiJ(st.etat)?.radar || st.occupe;
  };

  /* ----- phase de jeu : grilles de tirs ----- */

  /** Joueurs de gauche (ma flotte, ou joueur 1 en spectateur) et de droite (flotte adverse, ou joueur 2). */
  const cotes = (e) => {
    const js = e.joueurs || [];
    const gauche = moiJ(e) || js.find((j) => j.place === 1) || null;
    const droite = advJ(e) || js.find((j) => j.place === 2) || null;
    return { gauche, droite };
  };
  /** Cases tirées par un joueur, indexées par case. */
  const tirsDe = (e, userId) => {
    const m = new Map();
    for (const t of (e.bataille?.tirs?.[userId] || [])) m.set(t.case, t);
    return m;
  };
  /** Cases du carré 3 × 3 autour des radars que j'ai lancés. */
  const carresRadar = (mesTirs) => {
    const s = new Set();
    for (const t of mesTirs.values()) {
      if (t.resultat !== 'radar') continue;
      const col = t.case % TAILLE;
      const ligne = Math.floor(t.case / TAILLE);
      for (let l = ligne - 1; l <= ligne + 1; l += 1) {
        for (let k = col - 1; k <= col + 1; k += 1) {
          if (l >= 0 && l < TAILLE && k >= 0 && k < TAILLE) s.add(l * TAILLE + k);
        }
      }
    }
    return s;
  };
  /** Vrai si la case peut recevoir mon tir maintenant. */
  const cibleLibre = (c, mesTirs) => peutTirer(st.etat) && !mesTirs.has(c);

  /** Peint la grille « Flotte de X » (mes tirs sur l'adversaire, navires coulés en dessous). */
  const peindreTirs = (e, g, lib, mesTirs, coules) => {
    const carre = carresRadar(mesTirs);
    for (let c = 0; c < NB_CASES; c += 1) {
      const t = mesTirs.get(c);
      const nom = nomCase(c);
      const libre = cibleLibre(c, mesTirs);
      let etat = 'pas'; let icone = 'rien'; let label = `${nom} : pas encore visée`; let classes = '';
      if (t) {
        if (t.resultat === 'eau') { etat = 'eau'; icone = 'eau'; label = `${nom} : à l’eau`; }
        else if (t.resultat === 'touche') { etat = 'touche'; icone = 'touche'; label = `${nom} : touché`; classes = 'is-touche'; }
        else if (t.resultat === 'coule') { etat = 'coule'; icone = 'touche'; label = `${nom} : coulé, ${nomNavire(t.navire)}`; classes = 'is-touche is-coule'; }
        else if (t.resultat === 'radar') {
          etat = 'radar'; icone = 'radar';
          label = `${nom} : radar, ${t.valeur ?? '?'} case${t.valeur > 1 ? 's' : ''} de navire dans le carré`;
          classes = 'is-radar';
        }
      }
      if (!t && carre.has(c)) classes += ' is-carre';
      if (!t && libre) classes += ' is-cible';
      peindreCase(lib.cases.get(c), {
        etat, classes: classes.trim(), label, icone, actif: !t && libre,
        valeur: t?.resultat === 'radar' ? (t.valeur ?? '?') : null,
      });
    }
    const morceaux = (coules || []).map((n) => ({ html: coque(n.type, n.cases, { coule: true }) }));
    peindreCalque(lib, morceaux);
  };

  /** Peint la grille « Ta flotte » (mes navires, tirs reçus de l'adversaire). */
  const peindreMaFlotte = (e, g, lib, recus, coules, maFlotte) => {
    const cases = new Set((maFlotte || []).flatMap((n) => n.cases));
    for (let c = 0; c < NB_CASES; c += 1) {
      const t = recus.get(c);
      const nom = nomCase(c);
      const navire = cases.has(c);
      let etat = navire ? 'navire' : 'vide'; let icone = 'rien'; let label = `${nom} : ${navire ? 'navire intact' : 'vide'}`; let classes = navire ? 'is-navire' : '';
      if (t) {
        if (t.resultat === 'eau') { etat = 'eau'; icone = 'eau'; label = `${nom} : à l’eau`; }
        else if (t.resultat === 'touche') { etat = 'touche'; icone = 'touche'; label = `${nom} : navire touché`; classes = 'is-touche is-navire'; }
        else if (t.resultat === 'coule') { etat = 'coule'; icone = 'touche'; label = `${nom} : navire coulé`; classes = 'is-touche is-coule is-navire'; }
        else if (t.resultat === 'radar') { etat = 'radar'; icone = 'radar'; label = `${nom} : radar adverse`; classes = 'is-radar'; }
      }
      peindreCase(g.cases.get(c), { etat, classes, label, icone, actif: false });
    }
    const morceaux = [
      ...(maFlotte || []).map((n) => ({ html: coque(n.type, n.cases, { coule: !!n.coule }) })),
      ...(coules || []).map((n) => ({ html: coque(n.type, n.cases, { coule: true }) })),
    ];
    peindreCalque(lib, morceaux);
  };

  /** Restants : liste des navires à flot de chaque joueur, et coulés en clair. */
  const peindreCote = (e) => {
    const cote = cadre.cote;
    const { gauche, droite } = cotes(e);
    const b = e.bataille || {};
    const bloc = (j) => {
      if (!j) return '';
      const restants = b.restants?.[j.user_id] || [];
      const nb = restants.length;
      const lignes = FLOTTE.map((f) => {
        const a = restants.includes(f.type);
        return `<li class="bn-rest${a ? '' : ' is-coule'}"><span>${esc(f.nom)}</span>
          <span class="bn-rest-etat">${a ? 'à flot' : 'coulé'}</span></li>`;
      }).join('');
      return `<section class="bn-bloc"><h3 class="bn-titre-bloc">Navires restants ${deJoueur(j)}
        <span class="bn-sous">${nb} sur ${FLOTTE.length}</span></h3><ul class="bn-restes">${lignes}</ul></section>`;
    };
    const rejouer = b.rejouer
      ? '<p class="bn-rappel">Un tir réussi permet de rejouer.</p>'
      : '';
    const variante = e.partie.variante === 'salve'
      ? '<p class="bn-rappel">Salve : autant de tirs par tour que de navires à flot.</p>'
      : '<p class="bn-rappel">Un tir par tour.</p>';
    cote.innerHTML = `<div class="bn-cote">${variante}${rejouer}${bloc(gauche)}${bloc(droite)}</div>`;
  };

  /* ----- vues (construction du DOM, une fois par vue) ----- */

  /** Construit le DOM de la vue demandée dans le plateau du cadre. */
  const construire = (vue) => {
    const pl = cadre.plateau;
    st.vue = vue;
    st.grilles = {};
    st.dernierCompte = null;
    if (vue === 'saisie') {
      pl.innerHTML = `<div class="bn-zone bn-zone-saisie">
        <section class="card bn-panneau" aria-labelledby="bn-titre-grille">
          <div class="bn-entete"><h2 id="bn-titre-grille" class="duels-h3">Ma grille</h2>
            <span class="bn-sous">Clique une case pour poser le navire</span></div>
          <div class="bn-conteneur" data-grille-pose></div>
          <p class="bn-apercu" data-apercu aria-live="off"></p>
          <p class="bn-legende"><span class="bn-pastille is-ok" aria-hidden="true"></span>Position possible
            <span class="bn-pastille is-ko" aria-hidden="true"></span>Trop près ou hors grille</p>
        </section>
        <section class="card bn-panneau" aria-labelledby="bn-titre-navires">
          <div class="bn-entete"><h2 id="bn-titre-navires" class="duels-h3">Tes navires</h2>
            <span class="bn-sous" data-compte-pose></span></div>
          <ul class="bn-liste" data-liste></ul>
          <p class="bn-compte">Temps restant : <span data-compte-txt aria-live="off"></span></p>
          <div class="bn-boutons">
            <button type="button" class="btn btn-ghost" data-act="pivoter">Pivoter (R)</button>
            <button type="button" class="btn btn-ghost" data-act="effacer">Tout effacer</button>
            <button type="button" class="btn btn-ghost bn-pleine" data-act="hasard">Au hasard</button>
            <button type="button" class="btn btn-primary bn-pleine" data-act="valider">Valider ma flotte</button>
          </div>
        </section>
      </div>`;
      st.grilles.moi = creerGrille(q('[data-grille-pose]'), { role: 'pose', titre: 'Ma grille de placement' });
    } else if (vue === 'attente') {
      pl.innerHTML = `<div class="bn-zone">
        <section class="card bn-panneau" aria-labelledby="bn-titre-attente">
          <div class="bn-entete"><h2 id="bn-titre-attente" class="duels-h3">Ta flotte</h2></div>
          <div class="bn-conteneur" data-grille-attente></div>
          <p class="bn-attente" data-attente></p>
        </section></div>`;
      st.grilles.moi = creerGrille(q('[data-grille-attente]'), { role: 'passive', titre: 'Ta flotte' });
    } else if (vue === 'spectateur-placement') {
      pl.innerHTML = `<div class="bn-zone"><section class="card bn-panneau">
        <p class="bn-attente" data-attente></p></section></div>`;
    } else {
      pl.innerHTML = `<div class="bn-duo" data-duo>
        <section class="card bn-panneau bn-tirs" aria-labelledby="bn-titre-g">
          <div class="bn-entete"><h2 id="bn-titre-g" class="duels-h3" data-titre-g></h2><span class="bn-sous" data-sous-g></span></div>
          <div class="bn-conteneur" data-grille-g></div>
        </section>
        <section class="card bn-panneau bn-tirs" aria-labelledby="bn-titre-d">
          <div class="bn-entete"><h2 id="bn-titre-d" class="duels-h3" data-titre-d></h2>
            <button type="button" class="btn btn-ghost bn-radar" data-act="radar" data-radar hidden>Radar (1 par manche)</button></div>
          <p class="bn-sous" data-salve hidden></p>
          <div class="bn-conteneur" data-grille-d></div>
        </section>
      </div>`;
      st.grilles.gauche = creerGrille(q('[data-grille-g]'), { role: 'passive', titre: 'Ta flotte' });
      st.grilles.droite = creerGrille(q('[data-grille-d]'), { role: 'tir', titre: 'Flotte adverse' });
    }
  };

  /** Peint la phase de jeu : grilles, titres, radar, salve. */
  const peindreJeu = (e) => {
    const { gauche, droite } = cotes(e);
    const b = e.bataille || {};
    const spectateur = !e.moi?.joue;
    const titreG = q('[data-titre-g]');
    const titreD = q('[data-titre-d]');
    const sousG = q('[data-sous-g]');
    if (titreG) titreG.textContent = spectateur ? `Flotte ${deNom(gauche?.pseudo || '?')}` : 'Ta flotte';
    if (sousG) sousG.textContent = gauche ? `Les tirs ${deNom(droite?.pseudo || '?')}` : '';
    if (titreD) titreD.textContent = `Flotte ${deNom(droite?.pseudo || '?')}`;

    const tirsGauche = tirsDe(e, droite?.user_id);   // tirs reçus par ma flotte
    const tirsDroite = tirsDe(e, gauche?.user_id);   // mes tirs (ou ceux de p1)
    const maFlotte = spectateur ? [] : (b.ma_flotte || []);
    const coulesG = b.coules?.[gauche?.user_id] || [];
    const coulesD = b.coules?.[droite?.user_id] || [];

    if (st.grilles.gauche) peindreMaFlotte(e, st.grilles.gauche, st.grilles.gauche, tirsGauche, coulesG, maFlotte);
    if (st.grilles.droite) peindreTirs(e, st.grilles.droite, st.grilles.droite, tirsDroite, coulesD);

    q('[data-duo]')?.classList.toggle('is-mon-tour', !spectateur && cadre.monTour(e));
    const radar = q('[data-radar]');
    const salve = q('[data-salve]');
    if (radar) {
      radar.hidden = spectateur;
      radar.disabled = !peutTirer(e) || !!gauche?.radar || st.occupe;
      radar.setAttribute('aria-pressed', String(st.radar));
      radar.textContent = gauche?.radar
        ? 'Radar utilisé cette manche'
        : (st.radar ? 'Annuler le radar' : 'Radar (1 par manche)');
    }
    if (salve) {
      const reste = e.partie.restant;
      const afficher = !spectateur && e.partie.variante === 'salve' && cadre.monTour(e) && typeof reste === 'number';
      salve.hidden = !afficher;
      salve.textContent = afficher ? `Encore ${reste} tir${reste > 1 ? 's' : ''} ce tour` : '';
    }
    peindreCote(e);
  };

  /* ----- tirs ----- */

  const TEXTE_TIR = { eau: 'À l’eau', touche: 'Touché !', coule: 'Coulé !' };

  /** Tir sur la case c (ou radar si le mode radar est armé). */
  const tirer = async (c) => {
    const e = st.etat;
    if (!peutTirer(e) || st.occupe) return;
    const mesTirs = tirsDe(e, cotes(e).gauche?.user_id);
    if (!cibleLibre(c, mesTirs)) return;
    st.occupe = true; maj_actions();
    try {
      if (st.radar) {
        const n = await duel.radar(ctx.code, c);
        st.radar = false;
        toast(`Radar : ${n} case${n > 1 ? 's' : ''} de navire dans le carré de ${nomCase(c)}.`);
      } else {
        const r = await duel.tirer(ctx.code, c);
        toast(TEXTE_TIR[r] || 'Tir envoyé.');
      }
    } catch (err) {
      toast(erreurTexte(err), 'error');
    } finally {
      st.occupe = false;
      ctx.suivi?.rafraichir();
    }
  };

  /** Active ou désactive le mode radar (une fois par manche). */
  const basculerRadar = () => {
    if (!peutTirer(st.etat) || moiJ(st.etat)?.radar) return;
    st.radar = !st.radar;
    peindreJeu(st.etat);
    maj_actions();
  };

  /* ----- effets (sur les seuls changements entre deux états) ----- */

  /** Clés « joueur:case » de tous les tirs d'un état. */
  const clesTirs = (e) => {
    const s = new Set();
    for (const [uid, liste] of Object.entries(e?.bataille?.tirs || {})) for (const t of liste) s.add(`${uid}:${t.case}`);
    return s;
  };
  /** Vrai si c'est mon tour de tirer dans cet état (phase de jeu). */
  const monTourDe = (e) => !!e && e.partie.phase === 'jeu' && cadre.monTour(e);

  /**
   * Joue les effets des changements entre l'état précédent et le nouveau.
   * Premier état reçu : rien (ouverture de page ou rechargement). Sons joués même si le mouvement est réduit.
   */
  const effets = (avant, e) => {
    if (!avant || !e.moi || st.vue !== 'jeu') return;
    const anime = motionAllowed();
    const { gauche, droite } = cotes(e);
    const moi = String(gauche?.user_id);
    const adv = String(droite?.user_id);
    const avantTirs = clesTirs(avant);
    const coulesD = e.bataille?.coules?.[droite?.user_id] || [];

    /** Secousse du navire adverse coulé (la coque est la n-ième du calque, dans le même ordre que `coules`). */
    const secouer = (type) => {
      if (!anime) return;
      const idx = coulesD.findIndex((c) => c.type === type);
      const coque = st.grilles.droite?.calque.querySelectorAll('.bn-coque')[idx];
      if (!coque) return;
      coque.classList.add('bn-fx-secoue');
      setTimeout(() => coque.classList.remove('bn-fx-secoue'), 2000);
    };
    /** Un tir sur la grille adverse (mes tirs, ou ceux de p1 en spectateur). */
    const tirSur = (t) => {
      const n = st.grilles.droite?.cases.get(t.case);
      if (!n?.isConnected) return;
      const o = anime ? centreDe(n) : null;
      if (t.resultat === 'eau') {
        if (anime) { fxEn('bn-fx-plouf', o.x, o.y, 1100); setTimeout(() => fxEn('bn-fx-plouf', o.x, o.y, 1000), 260); }
        jouerSonJeu('bataille-navale', 1);
      } else if (t.resultat === 'touche') {
        if (anime) { n.classList.add('bn-fx-touche'); setTimeout(() => n.classList.remove('bn-fx-touche'), 2600); fxEn('bn-fx-boom', o.x, o.y, 900); }
        jouerSonJeu('bataille-navale', 2);
      } else if (t.resultat === 'coule') {
        if (anime) fxEn('bn-fx-boom', o.x, o.y, 900);
        secouer(t.navire);
        if (anime) bandeau('Coulé !', `Le ${nomNavire(t.navire).toLowerCase()} adverse est au fond`);
        jouerSonJeu('bataille-navale', 3);
      }
    };
    /** Un tir de l'adversaire sur ma grille : viseur, puis impact (ou éclaboussure) ; le son est un ping de sonar. */
    const tirRecu = (t) => {
      const n = st.grilles.gauche?.cases.get(t.case);
      if (!n?.isConnected) return;
      if (anime) {
        const o = centreDe(n);
        fxEn('bn-fx-viseur', o.x, o.y, 1150);
        setTimeout(() => fxEn(t.resultat === 'eau' ? 'bn-fx-plouf' : 'bn-fx-boom', o.x, o.y, 800), 900);
      }
      jouerSonJeu('bataille-navale', 4);
    };

    // Tirs nouveaux (quatre au plus, les plus récents), un après l'autre.
    const nouveaux = [];
    for (const [uid, liste] of Object.entries(e.bataille?.tirs || {})) {
      for (const t of liste) if (!avantTirs.has(`${uid}:${t.case}`) && t.resultat !== 'radar') nouveaux.push({ uid, t });
    }
    nouveaux.slice(-4).forEach(({ uid, t }, i) => {
      setTimeout(() => {
        if (uid === moi) tirSur(t);
        else if (uid === adv) tirRecu(t);
      }, i * 450);
    });

    // « À toi de tirer » : mon nom et les cases libres s'éclairent au passage à mon tour.
    if (!monTourDe(avant) && monTourDe(e) && anime) {
      const idx = (e.joueurs || []).findIndex((j) => j.user_id === e.moi.user_id);
      const face = root.querySelectorAll('.duels-face-j')[idx];
      flash(face, 'bn-fx-joue', 5000);
      st.grilles.droite?.el.querySelectorAll('.bn-c.is-cible').forEach((c) => flash(c, 'bn-fx-libre', 4000));
    }
  };

  /* ----- mise à jour ----- */

  /** Texte de statut (lu par les lecteurs d'écran) selon la phase. */
  const statutDe = (e) => {
    const adv = advJ(e);
    if (e.partie.phase === 'placement') {
      if (!e.moi?.joue) return 'Tu regardes ce duel en spectateur. Les flottes sont en cours de placement.';
      if (moiJ(e)?.pret) return `Flotte en place. En attente ${deNom(adv?.pseudo || 'ton adversaire')}…`;
      return 'Place ta flotte.';
    }
    if (!e.moi?.joue) return 'Tu regardes ce duel en spectateur.';
    if (st.radar) return 'Radar armé : clique la case centrale du carré.';
    if (cadre.monTour(e)) return 'À toi de tirer.';
    return `À ${adv?.pseudo || 'ton adversaire'} de tirer.`;
  };

  /* ----- compte à rebours du placement (texte visible ; annonces seulement aux seuils) ----- */

  /** Met à jour le compte du placement et annonce 60, 30, 10 et 5 secondes. */
  function tic() {
    const e = st.etat;
    if (!e || st.vue !== 'saisie') return;
    const s = ctx.suivi?.secondesRestantes(moiJ(e)?.fin);
    if (s === null || s === undefined) return;
    const el = q('[data-compte-txt]');
    if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if ([60, 30, 10, 5].includes(s) && st.dernierCompte !== s) {
      st.dernierCompte = s;
      dire(`Plus que ${s} seconde${s > 1 ? 's' : ''} pour placer ta flotte.`);
    }
  }
  const minuteur = setInterval(tic, 500);

  /* ----- gestes (délégation sur la racine de la vue) ----- */

  /** Clics : cases de placement ou de tir, puis boutons de la phase. */
  const surClic = (ev) => {
    const cellule = ev.target.closest('[data-role]');
    if (cellule && !cellule.disabled) {
      const c = Number(cellule.dataset.case);
      if (cellule.dataset.role === 'pose') cliquerPlacement(c);
      else if (cellule.dataset.role === 'tir') tirer(c);
      return;
    }
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'choisir') choisirNavire(b.dataset.type);
    else if (act === 'pivoter') pivoter();
    else if (act === 'effacer') toutEffacer();
    else if (act === 'hasard') auHasard();
    else if (act === 'valider') validerFlotte();
    else if (act === 'radar') basculerRadar();
  };

  /** Flèches (et Début, Fin) : case par case dans la grille de placement ou de tir ; les cases inactives sont sautées. */
  const surFleche = (ev) => {
    const cel = ev.target.closest?.('button[data-case]');
    const grille = cel?.closest('.bn-grille');
    if (!cel || !grille) return;
    const caseDe = (k) => grille.querySelector(`button[data-case="${k}"]`);
    const c = Number(cel.dataset.case);
    const cible = voisinGrille(ev.key, Math.floor(c / TAILLE), c % TAILLE, TAILLE, TAILLE,
      (r, k) => { const n = caseDe(r * TAILLE + k); return !!n && !n.disabled; });
    if (!cible) return;
    ev.preventDefault();
    const n = caseDe(cible[0] * TAILLE + cible[1]);
    rouler(grille, n);
    n.focus();
  };

  /** Le focus qui entre dans une grille devient sa case de tabulation (roving tabindex). */
  const surRoulage = (ev) => {
    const cel = ev.target.closest?.('button[data-case]');
    const grille = cel?.closest('.bn-grille');
    if (grille) rouler(grille, cel);
  };

  /** Touches : R pivote, Échap annule le radar ou la sélection, flèches déplacent dans la grille. */
  const surTouche = (ev) => {
    if (ev.key === 'Escape') {
      if (st.radar) { st.radar = false; peindreJeu(st.etat); maj_actions(); }
      if (st.choisi) { st.choisi = null; dire(''); peindreListe(); peindrePlacement(); }
      return;
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) { surFleche(ev); return; }
    if ((ev.key === 'r' || ev.key === 'R') && st.vue === 'saisie' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
      ev.preventDefault();
      pivoter();
    }
  };

  /** Survol ou focus d'une case de placement : l'aperçu suit. */
  const surSurvol = (ev) => {
    if (st.vue !== 'saisie') return;
    const cellule = ev.target.closest('[data-role="pose"]');
    if (!cellule) return;
    const c = Number(cellule.dataset.case);
    if (st.survol === c) return;
    st.survol = c;
    peindrePlacement();
  };

  /** Sortie de la grille de placement : l'aperçu disparaît. */
  const surSortie = (ev) => {
    if (st.vue !== 'saisie') return;
    const g = q('[data-grille-pose]');
    if (g && !g.contains(ev.relatedTarget) && st.survol !== null) {
      st.survol = null;
      peindrePlacement();
    }
  };

  root.addEventListener('click', surClic);
  root.addEventListener('keydown', surTouche);
  root.addEventListener('mouseover', surSurvol);
  root.addEventListener('focusin', surSurvol);
  root.addEventListener('focusin', surRoulage);
  root.addEventListener('mouseout', surSortie);

  return {
    /** Nouvel état : barre et chat via le cadre, puis la vue de la phase. */
    maj(e) {
      const avant = st.etat;
      st.etat = e;
      // Bataille : en placement, j'ai à agir tant que ma flotte n'est pas prête ; en jeu, c'est mon tour de tirer.
      const aAgir = e.partie.phase === 'placement'
        ? !!e.moi?.joue && e.partie.statut === 'en_cours' && !moiJ(e)?.pret
        : undefined;
      cadre.maj(e, aAgir);
      let vue;
      if (e.partie.phase === 'placement') {
        vue = !e.moi?.joue ? 'spectateur-placement' : (moiJ(e)?.pret ? 'attente' : 'saisie');
      } else {
        vue = 'jeu';
      }
      if (vue !== st.vue) construire(vue);
      if (vue === 'saisie') {
        peindreListe();
        peindrePlacement();
      } else if (vue === 'attente') {
        const adv = advJ(e);
        peindreMaFlotte(e, st.grilles.moi, st.grilles.moi, new Map(), [], e.bataille?.ma_flotte || []);
        q('[data-attente]').textContent = `Flotte en place. En attente ${deNom(adv?.pseudo || 'ton adversaire')}…`;
      } else if (vue === 'spectateur-placement') {
        const js = (e.joueurs || []).map((j) => `${j.pseudo} : ${j.pret ? 'flotte prête' : 'place sa flotte…'}`);
        q('[data-attente]').textContent = js.join(' · ');
      } else {
        if (!cadre.monTour(e) || e.moi?.joue !== true) st.radar = false;
        peindreJeu(e);
      }
      maj_actions();
      cadre.statut(statutDe(e));
      tic();
      effets(avant, e);
    },
    /** Message du chat (relayé au cadre). */
    message(m) { cadre.message(m); },
    detruire() {
      clearInterval(minuteur);
      root.removeEventListener('click', surClic);
      root.removeEventListener('keydown', surTouche);
      root.removeEventListener('mouseover', surSurvol);
      root.removeEventListener('focusin', surSurvol);
      root.removeEventListener('focusin', surRoulage);
      root.removeEventListener('mouseout', surSortie);
      cadre.detruire();
    },
  };
}
