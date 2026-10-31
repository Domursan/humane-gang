// ===== Humane Gang — arcade : « Tetris du gang » =====
/*
 * Rôle : le Tetris classique. Plateau de 10 × 20 cases de 19 px ; à droite, un panneau « Suivante » (la pièce suivante)
 * et le nombre de lignes. Sept pièces (I O T S Z J L) tirées par sacs de sept, aux couleurs de l'arc-en-ciel du logo
 * (le sable pour la L). Cases à reflet façon pixel. Rotation avec décalage contre les murs (0, -1, +1, -2, +2 cases).
 * Fantôme : contour pâle de l'endroit où la pièce tomberait. Pose : la pièce se verrouille après une demi-seconde posée.
 * Points : 1 par pièce posée ; 1 ligne = 10, 2 = 30, 3 = 50, 4 = 80. La vitesse monte de 7 % toutes les 10 lignes, sans
 * plafond (un plancher technique de 0,05 s par case la borne, bien au-delà de ce qu'un joueur suit).
 * Le panneau affiche le niveau de vitesse (« VITESSE », un niveau par tranche de 10 lignes).
 * Pas de limite de temps : la partie finit quand une nouvelle pièce ne peut pas apparaître.
 * Commandes : clavier ← → (la pièce file si la flèche reste tenue), ↑ ou espace = rotation, ↓ = chute immédiate,
 *   ↓ tenue = descente rapide ; souris : clic = rotation ; doigt : glisser à gauche ou à droite = une case,
 *   glisser vers le bas = chute immédiate, appui = rotation.
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = toutes les cases deviennent des cœurs rouges (il n'y a pas de
 *   piège à retirer) ; immortel = quand le plateau déborde, les 6 lignes du bas sont effacées au lieu de finir la partie
 *   (ces lignes ne rapportent rien).
 * Cadence serveur : une pièce au plus toutes les 0,25 s (4 points par seconde pour les pièces seules) ; le plafond
 * serveur est de 60 points par seconde, les lignes restant sous la moitié de cette cadence en jeu normal.
 * Effets (maquette jTetris, scènes TEa à TEe, sons TE1 à TE7 via fx.js) : déplacement et rotation sonores, pose avec flash
 *   blanc et poussière, chute d'un coup avec traînées, onde et secousse, ligne pleine qui clignote puis tombe en pixels
 *   (la chute des pièces est en pause pendant ce temps, le score et le compte de lignes sont ceux de la pose), Tetris à
 *   4 lignes en arc-en-ciel avec « TETRIS ! », tremblement et flash, niveau de vitesse qui s'allume avec « Plus vite ! ».
 * Moteur : eggs/arcade.js (creeArcade). Animation réduite : chute un peu plus lente, lignes effacées d'un coup, aucun
 *   mouvement ni particule (sons et textes conservés).
 * Exporte : JEU (règles du mini-jeu pour creeArcade), FORMES, COLONNES, RANGEES (pour les tests).
 */
import { coeur } from './arcade.js';
import { sonFlash, poussiere, etoiles, flotte, onde, majFX, dessineFX } from './fx.js';

/** Plateau : 10 colonnes × 20 rangées. */
export const COLONNES = 10, RANGEES = 20;
const CASE = 19, BX = 24, BY = 36, PX = 236, PANNEAU = 108;
const COULEURS = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398', '#E2C77E'];
const POINTS_LIGNES = [0, 10, 30, 50, 80];
/** Secondes posée avant verrouillage ; secondes entre deux pièces (cadence serveur) ; secondes par case en descente rapide. */
const DELAI_POSE = 0.5, DELAI_APPARITION = 0.25, DESCENTE_RAPIDE = 0.05;
/** Répétition des flèches tenues : délai avant la répétition, puis cadence. */
const DAS = 0.17, CADENCE_REPETITION = 0.05;
/** Accélération : +7 % de vitesse par niveau (tranche de 10 lignes), sans plafond. */
const HAUSSE = 0.07;
/** Nombre de remises à zéro du délai de pose après rotation ou déplacement à terre (anti-blocage). */
const REPRISES_MAX = 15;
const DECALAGES = [0, -1, 1, -2, 2];
/** Effacement : secondes par clignotement, secondes de chute des rangées du dessus. */
const DUREE_CLIGNOTE = 0.09, DUREE_CHUTE_LIGNES = 0.28;

/** Formes de base des sept pièces (I O T S Z J L), 1 = case pleine. */
const BASES = [
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
];

/**
 * Pivote une matrice carrée d'un quart de tour, dans le sens horaire.
 * @param {number[][]} m matrice carrée
 * @returns {number[][]} matrice pivotée
 */
function pivote(m) {
  return m.map((_, r) => m.map((__, c) => m[m.length - 1 - c][r]));
}

/**
 * Liste les cases pleines d'une matrice.
 * @param {number[][]} m matrice
 * @returns {number[][]} décalages [colonne, rangée] des cases pleines
 */
function cellules(m) {
  const out = [];
  m.forEach((ligne, r) => ligne.forEach((v, c) => { if (v) out.push([c, r]); }));
  return out;
}

/** Les quatre orientations de chaque pièce (FORMES[type][rotation] = liste de [colonne, rangée]). */
export const FORMES = BASES.map((base) => {
  const rots = [];
  let m = base;
  for (let i = 0; i < 4; i++) { rots.push(cellules(m)); m = pivote(m); }
  return rots;
});

/** Plateau vide : RANGEES lignes de COLONNES zéros (0 = vide, sinon type de pièce + 1). */
const vide = () => Array.from({ length: RANGEES }, () => new Array(COLONNES).fill(0));

/**
 * Tire la prochaine pièce dans le sac (les sept types, mélangés) et la retire.
 * @param {object} s état de la partie
 * @returns {number} type de pièce, de 0 (I) à 6 (L)
 */
function tirer(s) {
  if (!s.sac.length) {
    s.sac = [0, 1, 2, 3, 4, 5, 6];
    for (let i = 6; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s.sac[i], s.sac[j]] = [s.sac[j], s.sac[i]];
    }
  }
  return s.sac.pop();
}

/**
 * Vrai si la pièce tient à cette place : dans le plateau et sans toucher une case posée.
 * @param {number[][]} plateau cases posées
 * @param {number} type type de pièce
 * @param {number} rot orientation (0 à 3)
 * @param {number} x colonne de l'origine de la pièce
 * @param {number} y rangée de l'origine de la pièce
 * @returns {boolean}
 */
function libre(plateau, type, rot, x, y) {
  for (const [dx, dy] of FORMES[type][rot]) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || X >= COLONNES || Y < 0 || Y >= RANGEES || plateau[Y][X]) return false;
  }
  return true;
}

/**
 * Fait apparaître la pièce suivante en haut du plateau. Si elle ne tient pas, la partie finit,
 * sauf avec le code « immortel » : on efface alors les 6 lignes du bas (sans les compter).
 * @param {object} s état de la partie
 */
function apparait(s) {
  const type = s.suivante;
  s.suivante = tirer(s);
  const x = Math.floor((COLONNES - BASES[type].length) / 2);
  if (!libre(s.plateau, type, 0, x, 0)) {
    if (!s.triche?.immortel) { s.fin = true; return; }
    s.debordements++;
    s.plateau.splice(RANGEES - 6, 6);
    for (let i = 0; i < 6; i++) s.plateau.unshift(new Array(COLONNES).fill(0));
  }
  s.piece = { type, rot: 0, x, y: 0 };
  s.sol = 0; s.reprises = 0; s.chute = 0;
}

/**
 * Intervalle de chute, en secondes par case : 7 % plus court par niveau (un niveau tous les 10 lignes), sans plafond.
 * @param {object} s état de la partie
 * @returns {number} secondes par case
 */
function intervalleChute(s) {
  const n = Math.floor(s.lignes / 10);
  return Math.max(0.05, (1 / (1 + HAUSSE)) ** n) * s.lent;
}

/**
 * Après un déplacement ou une rotation à terre, remet le délai de pose à zéro (dans la limite de REPRISES_MAX).
 * @param {object} s état de la partie
 */
function reprise(s) {
  if (s.sol > 0 && s.reprises < REPRISES_MAX) { s.sol = 0; s.reprises++; }
}

/**
 * Décale la pièce d'une case à gauche (-1) ou à droite (1), si elle peut.
 * @param {object} s état de la partie
 * @param {number} d -1 ou 1
 */
function deplace(s, d) {
  const p = s.piece;
  if (!p || !libre(s.plateau, p.type, p.rot, p.x + d, p.y)) return;
  p.x += d;
  reprise(s);
  sonFlash('TE1');
}

/**
 * Tourne la pièce d'un quart de tour, avec décalage contre les murs (0, -1, +1, -2, +2 cases).
 * @param {object} s état de la partie
 */
function tournePiece(s) {
  const p = s.piece;
  if (!p) return;
  const nr = (p.rot + 1) % 4;
  for (const k of DECALAGES) {
    if (libre(s.plateau, p.type, nr, p.x + k, p.y)) {
      p.rot = nr; p.x += k;
      reprise(s);
      sonFlash('TE2');
      return;
    }
  }
}

/**
 * Fait tomber la pièce jusqu'à la case libre la plus basse, puis la pose.
 * @param {object} s état de la partie
 */
function chuteImmediate(s) {
  const p = s.piece;
  const depart = p.y;
  while (libre(s.plateau, p.type, p.rot, p.x, p.y + 1)) p.y++;
  sonFlash('TE6');
  if (!s.reduit) {
    // Traînées derrière chaque case, onde et secousse à l'arrivée.
    const n = p.y - depart;
    s.trace = { t: 0, rects: FORMES[p.type][p.rot].map(([dx, dy]) => [BX + (p.x + dx) * CASE + CASE / 2 - 2, BY + (depart + dy) * CASE, 4, n * CASE + CASE / 2, COULEURS[p.type]]) };
    s.secousse = Math.max(s.secousse, 0.2);
    onde(s, BX + COLONNES * CASE / 2, BY + (p.y + 2) * CASE, 10, 120, 'rgba(242,239,234,.6)', 0.3, 2);
  }
  pose(s, true);
}

/**
 * Rangée où la pièce tomberait (fantôme).
 * @param {object} s état de la partie
 * @returns {number} rangée d'origine du fantôme
 */
function fantome(s) {
  const p = s.piece;
  let y = p.y;
  while (libre(s.plateau, p.type, p.rot, p.x, y + 1)) y++;
  return y;
}

/**
 * Verrouille la pièce sur le plateau, efface les lignes pleines et compte les points.
 * La pièce suivante n'apparaît qu'après DELAI_APPARITION secondes (cadence serveur).
 * Le score et le compte de lignes sont mis à jour tout de suite ; les lignes pleines restent à l'écran le temps de
 * l'animation (s.eff), pendant laquelle la chute est en pause, puis sont retirées par termineEffacement.
 * @param {object} s état de la partie
 * @param {boolean} [chute] vrai après une chute d'un coup (son TE6 déjà joué)
 */
function pose(s, chute = false) {
  const p = s.piece;
  const cases = FORMES[p.type][p.rot];
  for (const [dx, dy] of cases) s.plateau[p.y + dy][p.x + dx] = p.type + 1;
  s.piece = null;
  s.poses++;
  s.score += 1;
  s.attente = DELAI_APPARITION; s.chute = 0; s.sol = 0;
  if (!chute) sonFlash('TE3');
  if (!s.reduit) {
    s.verr = { t: 0, cases: cases.map(([dx, dy]) => [p.x + dx, p.y + dy]) };
    const bas = Math.max(...cases.map((c) => p.y + c[1]));
    for (const [dx, dy] of cases) {
      if (p.y + dy === bas) poussiere(s, BX + (p.x + dx) * CASE + CASE / 2, BY + (bas + 1) * CASE - 2, 3, ['rgba(242,239,234,.7)', COULEURS[p.type]], 40, 0.35, 3, 60);
    }
  }
  const rangees = [];
  for (let y = 0; y < RANGEES; y++) if (s.plateau[y].every((c) => c)) rangees.push(y);
  const k = rangees.length;
  if (!k) return;
  const avant = Math.floor(s.lignes / 10);
  s.lignes += k;
  s.score += POINTS_LIGNES[k];
  sonFlash(k === 4 ? 'TE5' : 'TE4');
  const monte = Math.floor(s.lignes / 10) > avant;
  s.eff = { rangees, t: 0, phase: 'clignote', nb: k === 4 ? 8 : 6, tetris: k === 4, monte, pts: POINTS_LIGNES[k] };
  if (k === 4) {
    s.bandeau = 1.5;
    if (!s.reduit) { s.secousse = 0.45; s.flash = 0.2; }
  }
  if (s.reduit) termineEffacement(s);
}

/**
 * Retire du plateau les lignes de l'animation, annonce les points et, si besoin, le niveau de vitesse.
 * @param {object} s état de la partie
 */
function termineEffacement(s) {
  const { rangees, tetris, monte, pts } = s.eff;
  s.plateau = s.plateau.filter((_, y) => !rangees.includes(y));
  for (let i = 0; i < rangees.length; i++) s.plateau.unshift(new Array(COLONNES).fill(0));
  s.eff = null;
  flotte(s, BX + COLONNES * CASE / 2, BY + rangees[0] * CASE + CASE / 2 - 6, `+${pts}`, tetris ? '#FFFFFF' : COULEURS[2], tetris ? 26 : 20);
  if (!s.reduit) s.popT = 0.3;
  if (monte) {
    sonFlash('TE7');
    if (!s.reduit) s.vitT = 1.2;
    etoiles(s, PX + 22, 296, 8, COULEURS[2], 90, 0.7);
    onde(s, PX + 22, 296, 6, 60, COULEURS[2], 0.5, 3);
    flotte(s, PX + 40, 248, 'Plus vite !', COULEURS[2], 14);
  }
}

/**
 * Fait avancer l'animation d'effacement : clignotement, puis chute des rangées au-dessus.
 * @param {object} s état de la partie
 * @param {number} dt secondes écoulées
 */
function avanceEffacement(s, dt) {
  const f = s.eff;
  f.t += dt;
  if (f.phase === 'clignote' && f.t >= f.nb * DUREE_CLIGNOTE) {
    for (const y of f.rangees) {
      for (let x = 0; x < COLONNES; x++) {
        const v = s.plateau[y][x];
        if (!v) continue;
        poussiere(s, BX + x * CASE + CASE / 2, BY + y * CASE + CASE / 2, 3, f.tetris ? COULEURS.slice(0, 6) : [COULEURS[v - 1]], 70, 0.6, 4, 380);
      }
    }
    if (f.tetris) {
      onde(s, BX + COLONNES * CASE / 2, BY + f.rangees[1] * CASE + CASE / 2, 10, 150, '#FFFFFF', 0.5, 3);
      onde(s, BX + COLONNES * CASE / 2, BY + f.rangees[1] * CASE + CASE / 2, 6, 110, COULEURS[2], 0.5, 3);
    }
    f.phase = 'tombe'; f.t = 0;
  } else if (f.phase === 'tombe' && f.t >= DUREE_CHUTE_LIGNES) {
    termineEffacement(s);
  }
}

/**
 * Dessine une case : pleine à reflet pixel, ou cœur rouge avec le code « coeurs ».
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x coin haut gauche
 * @param {number} y coin haut gauche
 * @param {number} t type de pièce (0 à 6), indice de couleur
 * @param {boolean} coeurs vrai pour dessiner un cœur
 */
function dessineCase(ctx, x, y, t, coeurs) {
  if (coeurs) { coeur(ctx, x + CASE / 2, y + CASE / 2, 6.5); return; }
  ctx.fillStyle = COULEURS[t];
  ctx.fillRect(x, y, CASE, CASE);
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.fillRect(x + 3, y + 3, 10, 2); ctx.fillRect(x + 3, y + 3, 2, 10);
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x, y + CASE - 3, CASE, 3); ctx.fillRect(x + CASE - 3, y, 3, CASE);
}

/**
 * Contour pâle d'une case du fantôme.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x coin haut gauche
 * @param {number} y coin haut gauche
 */
function contour(ctx, x, y) {
  ctx.strokeStyle = 'rgba(242,239,234,.4)'; ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 1, y + 1, CASE - 2, CASE - 2);
}

/**
 * Boîte englobante d'une forme, en cases : [colonne, rangée, largeur, hauteur].
 * @param {number[][]} cases décalages [colonne, rangée]
 * @returns {number[]} boîte
 */
function boite(cases) {
  const xs = cases.map((c) => c[0]), ys = cases.map((c) => c[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return [x0, y0, Math.max(...xs) - x0 + 1, Math.max(...ys) - y0 + 1];
}


/** Rebond « retour élastique » de 0 à 1 (lettres de TETRIS !). */
const rebond = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2);

/**
 * Dessine le plateau (cases posées, effacement, flash de pose, traînées, pièce et fantôme).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {object} s état de la partie
 * @param {boolean} coeurs vrai pour dessiner des cœurs
 */
function dessinePlateau(ctx, s, coeurs) {
  ctx.fillStyle = '#0E0E10';
  ctx.fillRect(BX, BY, COLONNES * CASE, RANGEES * CASE);
  ctx.fillStyle = 'rgba(242,239,234,.06)';
  for (let x = 1; x < COLONNES; x++) ctx.fillRect(BX + x * CASE, BY, 1, RANGEES * CASE);
  for (let y = 1; y < RANGEES; y++) ctx.fillRect(BX, BY + y * CASE, COLONNES * CASE, 1);
  const f = s.eff;
  const tombe = f && f.phase === 'tombe';
  const pr = tombe ? 1 - (1 - Math.min(1, f.t / DUREE_CHUTE_LIGNES)) ** 3 : 0;
  for (let y = 0; y < RANGEES; y++) {
    if (tombe && f.rangees.includes(y)) continue;
    let dec = 0;
    if (tombe) { let n = 0; for (const r of f.rangees) if (r > y) n++; dec = n * CASE * pr; }
    for (let x = 0; x < COLONNES; x++) {
      const v = s.plateau[y][x];
      if (v) dessineCase(ctx, BX + x * CASE, BY + y * CASE + dec, v - 1, coeurs);
    }
  }
  if (f && f.phase === 'clignote') {
    const kk = Math.floor(f.t / DUREE_CLIGNOTE);
    f.rangees.forEach((r, i) => {
      if (kk % 2) return;
      ctx.fillStyle = f.tetris ? COULEURS[(i + kk / 2) % 6] : 'rgba(255,255,255,.88)';
      ctx.fillRect(BX, BY + r * CASE, COLONNES * CASE, CASE);
    });
  }
  if (s.verr) {
    ctx.fillStyle = `rgba(255,255,255,${(1 - s.verr.t / 0.15) * 0.85})`;
    for (const [cx, cy] of s.verr.cases) ctx.fillRect(BX + cx * CASE, BY + cy * CASE, CASE, CASE);
  }
  if (s.trace) {
    ctx.globalAlpha = 0.6 * (1 - s.trace.t / 0.28);
    for (const [x, y, w, h, c] of s.trace.rects) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
    ctx.globalAlpha = 1;
  }
  const p = s.piece;
  if (p) {
    const gy = fantome(s);
    if (gy !== p.y) for (const [dx, dy] of FORMES[p.type][p.rot]) contour(ctx, BX + (p.x + dx) * CASE, BY + (gy + dy) * CASE);
    for (const [dx, dy] of FORMES[p.type][p.rot]) dessineCase(ctx, BX + (p.x + dx) * CASE, BY + (p.y + dy) * CASE, p.type, coeurs);
  }
  const eclat = f && f.tetris && !s.reduit && Math.floor(f.t * 12) % 2;
  ctx.strokeStyle = eclat ? COULEURS[2] : '#9E3543'; ctx.lineWidth = 2;
  ctx.strokeRect(BX - 1, BY - 1, COLONNES * CASE + 2, RANGEES * CASE + 2);
}

/**
 * Écrit un nombre du panneau, gonflé et doré quand l'échelle dépasse 1.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} y ligne de base
 * @param {string} txt texte
 * @param {number} ech échelle (1 = normale)
 */
function nombrePanneau(ctx, y, txt, ech) {
  ctx.save(); ctx.translate(PX, y); ctx.scale(ech, ech);
  ctx.fillStyle = ech > 1 ? COULEURS[2] : '#F2EFEA';
  ctx.font = '26px "Archivo Black", system-ui, sans-serif';
  ctx.fillText(txt, 0, 0);
  ctx.restore();
}

/**
 * Bandeau « TETRIS ! » : lettres arc-en-ciel qui rebondissent (immobiles en animation réduite).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {object} s état de la partie
 */
function dessineBandeau(ctx, s) {
  const bt = 1 - s.bandeau / 1.5;
  ctx.globalAlpha = bt > 0.75 ? (1 - bt) * 4 : 1;
  const tx = 'TETRIS !';
  ctx.font = '38px "Archivo Black", system-ui, sans-serif';
  const tw = ctx.measureText(tx).width;
  let x0 = BX + COLONNES * CASE / 2 - tw / 2;
  for (let i = 0; i < tx.length; i++) {
    const w = ctx.measureText(tx[i]).width;
    const dy = s.reduit ? 0 : Math.sin(bt * 13.5 + i * 0.7) * 4;
    const ech = s.reduit ? 1 : rebond(bt * 4 - i * 0.1);
    ctx.save(); ctx.translate(x0 + w / 2, BY + 150 + dy); ctx.scale(ech, ech);
    ctx.lineWidth = 6; ctx.strokeStyle = '#08080B'; ctx.strokeText(tx[i], -w / 2, 0);
    ctx.fillStyle = COULEURS[i % 6]; ctx.fillText(tx[i], -w / 2, 0);
    ctx.restore();
    x0 += w;
  }
  ctx.globalAlpha = 1;
}

export const JEU = {
  id: 'tetris',
  titre: 'Tetris du gang',
  accroche: 'Empile, aligne, efface',
  quip: 'Les pièces attendent en haut.',
  directions: true,
  action: true,
  tapeSeul: true,
  aide: 'Clavier : ← → déplacent la pièce (tenues, elle file), ↑ ou espace la tournent, ↓ tenue la fait descendre vite. Souris : un clic tourne la pièce. Doigt : une tape tourne la pièce, glisser à gauche ou à droite la décale d’une case, glisser vers le bas la fait tomber d’un coup.',
  aideBorne: '← → · ↑ TOURNER · ↓ DESCENDRE',
  /** Emblème de l'écran de départ : trois pièces. */
  embleme(ctx, x, y, T) {
    const doux = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [cx, cy] of [[0, 0], [1, 0], [2, 0], [1, -1]]) dessineCase(ctx, x - 76 + cx * CASE, y - 4 + cy * CASE, 2, false);
    for (let i = 0; i < 4; i++) dessineCase(ctx, x + 4, y - 38 + i * CASE + (doux ? 0 : Math.sin(T * 4) * 3), 4, false);
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) dessineCase(ctx, x + 36 + cx * CASE, y + 10 + cy * CASE, 0, false);
  },
  finTexte: () => ({ t: 'Le plateau déborde', d: 'Trop haut, trop vite, trop beau.' }),
  init: ({ reduit }) => {
    const s = {
      reduit, lent: reduit ? 1.4 : 1, plateau: vide(), sac: [], suivante: 0, piece: null,
      attente: 0, chute: 0, sol: 0, reprises: 0, fl: 0, rep: 0,
      lignes: 0, poses: 0, debordements: 0, score: 0, fin: false,
      eff: null, verr: null, trace: null, bandeau: 0, popT: 0, vitT: 0, secousse: 0, flash: 0, fx: [],
    };
    s.suivante = tirer(s);
    return s;
  },
  update(s, dt, e) {
    majFX(s, dt);
    if (s.verr && (s.verr.t += dt) >= 0.15) s.verr = null;
    if (s.trace && (s.trace.t += dt) >= 0.28) s.trace = null;
    s.bandeau = Math.max(0, s.bandeau - dt); s.popT = Math.max(0, s.popT - dt); s.vitT = Math.max(0, s.vitT - dt);
    s.secousse = Math.max(0, s.secousse - dt); s.flash = Math.max(0, s.flash - dt);
    if (s.fin) return;
    // Effacement en cours : la chute est en pause, les flèches tenues ne s'accumulent pas.
    if (s.eff) { avanceEffacement(s, dt); s.fl = e.fleche; s.rep = 0; return; }
    if (!s.piece) {
      s.attente -= dt;
      if (s.attente > 0) { s.fl = e.fleche; s.rep = 0; return; }
      apparait(s);
      if (s.fin) return;
    }
    if (e.action || e.dir === 'haut') tournePiece(s);
    // Clavier (pas et dir sont donnés ensemble à l'appui) ou glisser du doigt (dir seul) : un seul déplacement.
    const d = e.pas || (e.dir === 'gauche' ? -1 : e.dir === 'droite' ? 1 : 0);
    if (d) deplace(s, d);
    if (e.fleche !== s.fl) { s.fl = e.fleche; s.rep = DAS; }
    else if (e.fleche) { s.rep -= dt; while (s.rep <= 0) { s.rep += CADENCE_REPETITION; deplace(s, e.fleche); } }
    if (e.dir === 'bas' && e.glisse) { chuteImmediate(s); return; }
    const p = s.piece;
    const inter = intervalleChute(s);
    const vite = e.vertical > 0 ? Math.min(inter, DESCENTE_RAPIDE) : inter;
    s.chute += dt;
    while (s.chute >= vite) {
      if (!libre(s.plateau, p.type, p.rot, p.x, p.y + 1)) { s.chute = 0; break; }
      p.y++;
      s.chute -= vite;
    }
    if (libre(s.plateau, p.type, p.rot, p.x, p.y + 1)) { s.sol = 0; return; }
    s.sol += dt;
    if (s.sol >= DELAI_POSE) pose(s);
  },
  draw(ctx, s) {
    const coeurs = !!s.triche?.coeurs;
    ctx.save();
    if (s.secousse > 0 && !s.reduit) {
      const a = 8 * Math.min(1, s.secousse * 4);
      ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
    }
    dessinePlateau(ctx, s, coeurs);
    dessineFX(ctx, s);
    // Panneau : pièce suivante et nombre de lignes
    ctx.textAlign = 'left';
    ctx.fillStyle = COULEURS[6];
    ctx.font = '12px "Archivo Black", system-ui, sans-serif';
    ctx.fillText('SUIVANTE', PX, 62);
    ctx.strokeStyle = 'rgba(242,239,234,.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(PX + 0.5, 70.5, PANNEAU - 1, 83);
    const forme = FORMES[s.suivante][0];
    const [x0, y0, lw, lh] = boite(forme);
    const ox = Math.round(PX + (PANNEAU - lw * CASE) / 2 - x0 * CASE);
    const oy = Math.round(70 + (84 - lh * CASE) / 2 - y0 * CASE);
    for (const [dx, dy] of forme) dessineCase(ctx, ox + dx * CASE, oy + dy * CASE, s.suivante, coeurs);
    ctx.fillStyle = COULEURS[6];
    ctx.font = '12px "Archivo Black", system-ui, sans-serif';
    ctx.fillText('LIGNES', PX, 200);
    nombrePanneau(ctx, 232, String(s.lignes), s.popT > 0 ? 1 + 0.35 * Math.sin((1 - s.popT / 0.3) * Math.PI) : 1);
    // Niveau de vitesse : un par tranche de 10 lignes, allumé quand il monte.
    const vf = 1 - s.vitT / 1.2;
    if (s.vitT > 0) {
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(vf * Math.PI * 4));
      ctx.fillStyle = COULEURS[2]; ctx.fillRect(PX - 6, 254, PANNEAU + 4, 58);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = COULEURS[6];
    ctx.font = '12px "Archivo Black", system-ui, sans-serif';
    ctx.fillText('VITESSE', PX, 270);
    nombrePanneau(ctx, 302, String(Math.floor(s.lignes / 10) + 1), s.vitT > 0 && vf < 0.4 ? 1 + 0.4 * Math.sin(vf / 0.4 * Math.PI) : 1);
    ctx.textAlign = 'start';
    if (s.bandeau > 0) dessineBandeau(ctx, s);
    dessineFX(ctx, s, true);
    ctx.restore();
    if (s.flash > 0 && !s.reduit) { ctx.fillStyle = `rgba(255,214,42,${s.flash})`; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
  },
  score: (s) => s.score,
  /* Pas de vies : la partie finit quand une nouvelle pièce ne peut pas apparaître. */
  vies: () => null,
  fini: (s) => s.fin,
};
