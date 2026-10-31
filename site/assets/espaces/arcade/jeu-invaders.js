// ===== Humane Gang — arcade : « Space Invaders » =====
/*
 * Rôle : une armée de cornichons en pixel art (5 rangées de 8) avance en bloc, de côté, puis descend d'un cran au bord,
 * de plus en plus vite quand il en reste peu. Le vaisseau tire vers le haut : un seul tir à la fois, au plus un toutes
 * les 0,35 s. Les cornichons lâchent des gouttes de vinaigre : chaque goutte qui touche le vaisseau coûte une vie
 * (trois vies). Trois abris en briques sable s'abîment sous les tirs et sous les cornichons. Parfois une soucoupe-raclette
 * passe en haut (50 points). Points : 30 pour la rangée du haut, 20 pour les deux suivantes, 10 pour les deux du bas.
 * Quand tout est détruit, vague suivante (plus rapide : +7 % par vague, sans plafond ; la vague affichée est le palier). La partie finit à zéro vie, ou quand les cornichons
 * atteignent le bas. Pas de limite de temps.
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = les cornichons deviennent des cœurs et ne tirent plus, le vaisseau
 * aussi devient un cœur ; immortel = les gouttes ne font rien, et si les cornichons atteignent le bas, la vague recommence.
 * Commandes : souris ou doigt (le vaisseau suit), flèches gauche et droite ; tir à l'appui (espace, flèche haut, clic ou
 * doigt), tir continu tant que la touche ou le doigt reste appuyé.
 * Effets (maquette jInvaders, sons IN1 à IN7 via fx.js) : tir avec étincelles, cornichon qui éclate avec son « +points »,
 * soucoupe-raclette qui fond en fromage, briques d'abri qui s'effritent, goutte qui grésille sur le vaisseau (il clignote, le cœur
 * du HUD éclate), nouvelle vague qui descend du haut. Son de marche (IN3) : au plus un par pas de la formation, espacé d'au moins 0,15 s.
 * Partie finie : tout s'arrête, sauf les effets, pendant dureeFin (le dernier cœur éclate avant l'écran de fin).
 * Animation réduite : formation plus lente, pas de secousse ni d'animations ; état et sons conservés, textes « +points » gardés.
 * Moteur : eggs/arcade.js (creeArcade ; jeu.action = true).
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, coeur } from './arcade.js';
import { sonFlash, poussiere, etoiles, flotte, onde, rayons, eclats, eclatCoeur, majFX, dessineFX } from './fx.js';

const VIES = 3;
/** Accélération par vague : +7 %, sans plafond (le plancher technique de la formation reste en place). */
const HAUSSE = 0.07;
/* Formation : 8 colonnes × 5 rangées ; cornichon de 7 × 10 pixels à l'échelle 3. */
const COLS = 8, LIGNES = 5, TOTAL = COLS * LIGNES;
const PIX = 3, AW = 7 * PIX, AH = 10 * PIX;
const ESP_X = 34, ESP_Y = 36, X0 = 50, Y0 = 70;
const PAS = 8, DECAL = 12;
/** Quand le bas de la formation atteint cette ligne, les cornichons ont gagné. */
const LIGNE_BAS = H - 62;
/** Points par rangée, de la plus haute à la plus basse. */
const VALEUR = [30, 20, 20, 10, 10];
/* Vaisseau et tirs */
const VAISS_Y = H - 40, VAISS_L = 9 * PIX, VAISS_H = 5 * PIX, MARGE = 16;
const VIT_VAISS = 220, VIT_TIR = 200, CADENCE = 0.35;
/* Abris */
const ABRI_Y = H - 112, CELL = 4, ABRI_L = 11 * CELL;
/* Soucoupe-raclette */
const SOUC_Y = 40, SOUC_VIT = 70, SOUC_POINTS = 50;
const OR = '#FBD32D', SABLE = '#E2C77E', ROUGE = '#9E3543', VINAIGRE = '#D9F0A0', FROMAGE = '#FCA301';
const FLASH = 'rgba(224, 64, 75, ';
/** Intervalle minimal entre deux sons de marche (IN3), pour les pas très rapprochés en fin de vague. */
const MARCHE_MIN = 0.15;

/* Sprites en pixel art (une lettre par pixel, voir PAL_*). */
const PAL_CORN = { o: '#1F3A18', g: '#5FA83A', l: '#A8DC74', d: '#2F6B2A', k: '#0E0E10' };
const CORNICHON = [
  '..ooo..',
  '.ogggo.',
  'oglllgo',
  'ogkgkgo',
  'ogggggo',
  'ogdgdgo',
  'oggdggo',
  'ogdggdo',
  '.odddo.',
  '..ooo..',
];
const PAL_VAISS = { c: SABLE, r: ROUGE };
const VAISSEAU = [
  '....c....',
  '...ccc...',
  '..rrrrr..',
  'rrrrrrrrr',
  'rrrrrrrrr',
];
/** Masque d'un abri : « # » = une brique (deux coups pour la détruire). */
const MASQUE_ABRI = [
  '..#######..',
  '.#########.',
  '###########',
  '###########',
  '###########',
  '###.....###',
  '###.....###',
];
/** Couleur d'une brique selon ses coups restants (index = points de vie). */
const COULEUR_ABRI = [null, '#8A7444', SABLE];

/**
 * Découpe une grille de pixels en rectangles horizontaux de même couleur (un dessin plus léger).
 * @param {string[]} grille lignes de lettres
 * @param {object} palette lettre → couleur
 * @returns {{x: number, y: number, w: number, c: string}[]} segments en pixels de grille
 */
function segments(grille, palette) {
  const out = [];
  grille.forEach((ligne, y) => {
    let i = 0;
    while (i < ligne.length) {
      const c = ligne[i];
      let j = i;
      while (j < ligne.length && ligne[j] === c) j++;
      if (palette[c]) out.push({ x: i, y, w: j - i, c: palette[c] });
      i = j;
    }
  });
  return out;
}
const SEG_CORN = segments(CORNICHON, PAL_CORN);
const SEG_VAISS = segments(VAISSEAU, PAL_VAISS);

/**
 * Dessine un sprite découpé en segments.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {{x: number, y: number, w: number, c: string}[]} segs segments du sprite
 * @param {number} x coin haut gauche
 * @param {number} y coin haut gauche
 * @param {number} p taille d'un pixel
 */
function dessineSegments(ctx, segs, x, y, p) {
  for (const g of segs) { ctx.fillStyle = g.c; ctx.fillRect(x + g.x * p, y + g.y * p, g.w * p, p); }
}

/**
 * Borne une valeur entre deux bornes.
 * @param {number} v valeur
 * @param {number} a minimum
 * @param {number} b maximum
 * @returns {number}
 */
const borne = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Deux rectangles (x, y, largeur, hauteur) se chevauchent-ils ?
 * @returns {boolean}
 */
function chevauche(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Remet la formation en place : tous les cornichons vivants, au départ, à droite.
 * @returns {{vivants: boolean[], fx: number, fy: number, sens: number, tick: number}}
 */
function formation() {
  return { vivants: new Array(TOTAL).fill(true), formX: X0, fy: Y0, sens: 1, tick: 0 };
}

/**
 * Crée les trois abris, briques pleines (deux coups chacune).
 * @returns {{x: number, y: number, hp: number}[]}
 */
function creeAbris() {
  const briques = [];
  for (let k = 0; k < 3; k++) {
    const gauche = Math.round((W * (k + 1)) / 4 - ABRI_L / 2);
    MASQUE_ABRI.forEach((ligne, j) => {
      for (let i = 0; i < ligne.length; i++) if (ligne[i] === '#') briques.push({ x: gauche + i * CELL, y: ABRI_Y + j * CELL, hp: 2, fl: -9 });
    });
  }
  return briques;
}

/**
 * Bilan de la formation : nombre de cornichons vivants et colonnes / rangée extrêmes.
 * @param {object} s état de la partie
 * @returns {{n: number, minCol: number, maxCol: number, maxRow: number}}
 */
function bilan(s) {
  let n = 0, minCol = COLS, maxCol = -1, maxRow = -1;
  for (let i = 0; i < TOTAL; i++) {
    if (!s.vivants[i]) continue;
    const c = i % COLS, l = (i / COLS) | 0;
    n++;
    if (c < minCol) minCol = c;
    if (c > maxCol) maxCol = c;
    if (l > maxRow) maxRow = l;
  }
  return { n, minCol, maxCol, maxRow };
}

/**
 * Délai entre deux pas de la formation : court quand il reste peu de cornichons, plus court de 7 % à chaque vague (sans plafond).
 * @param {object} s état de la partie
 * @param {number} n cornichons vivants
 * @returns {number} secondes
 */
function intervalle(s, n) {
  const facteur = (1 / (1 + HAUSSE)) ** (s.vague - 1);
  return Math.max(0.03, (0.02 + (0.45 * n) / TOTAL) * facteur * (s.reduit ? 1.4 : 1));
}

/**
 * Fait avancer la formation d'un pas : de côté, ou d'un cran vers le bas et sens inversé au bord.
 * @param {object} s état de la partie
 * @param {{minCol: number, maxCol: number}} b bilan de la formation
 */
function avance(s, b) {
  const gauche = s.formX + b.minCol * ESP_X, droite = s.formX + b.maxCol * ESP_X + AW;
  if ((s.sens > 0 && droite + PAS > W - 8) || (s.sens < 0 && gauche - PAS < 8)) {
    s.fy += DECAL;
    s.sens = -s.sens;
  } else {
    s.formX += s.sens * PAS;
  }
}

/**
 * Un cornichon vivant chevauche-t-il la brique ? (les cornichons rongent les abris qu'ils touchent).
 * @param {object} s état de la partie
 * @param {{x: number, y: number}} c brique
 * @returns {boolean}
 */
function cornichonsSur(s, c) {
  for (let i = 0; i < TOTAL; i++) {
    if (!s.vivants[i]) continue;
    const x = s.formX + (i % COLS) * ESP_X, y = s.fy + ((i / COLS) | 0) * ESP_Y;
    if (chevauche(x, y, AW, AH, c.x, c.y, CELL, CELL)) return true;
  }
  return false;
}

/**
 * Un projectile (rectangle) abîme la première brique qu'il touche.
 * @param {object} s état de la partie
 * @param {number} x coin gauche du projectile
 * @param {number} y coin haut du projectile
 * @param {number} w largeur
 * @param {number} h hauteur
 * @returns {boolean} true si une brique a été touchée
 */
function frappeAbri(s, x, y, w, h) {
  for (let i = 0; i < s.abris.length; i++) {
    const c = s.abris[i];
    if (chevauche(x, y, w, h, c.x, c.y, CELL, CELL)) {
      c.hp--;
      c.fl = s.ecoule;
      poussiere(s, c.x + 2, c.y + 2, 5, [SABLE, '#8A7444', '#fff'], 60, 0.4, 2, 240);
      if (c.hp <= 0) {
        s.abris.splice(i, 1);
        poussiere(s, c.x + 2, c.y + 2, 6, [SABLE, '#8A7444'], 80, 0.5, 3, 300);
      }
      sonFlash('IN6');
      return true;
    }
  }
  return false;
}

/**
 * Un cornichon éclate : éclats verts, flash doré, rayons, anneau et « +points ».
 * @param {object} s état de la partie
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} v points gagnés
 */
function eclateCornichon(s, x, y, v) {
  poussiere(s, x, y, 12, ['#5FA83A', '#A8DC74', '#2F6B2A', '#1F3A18'], 110, 0.55, 4, 260);
  poussiere(s, x, y, 1, [OR], 0, 0.3, 12, 0);
  rayons(s, x, y, 8, 8, 28, '#A8DC74', 0.3);
  onde(s, x, y, 4, 26, '#A8DC74', 0.3, 2);
  flotte(s, x, y - 24, `+${v}`, OR, 16);
  sonFlash('IN2');
}

/**
 * La soucoupe-raclette fond en morceaux de fromage dorés.
 * @param {object} s état de la partie
 * @param {number} x centre
 */
function fondSoucoupe(s, x) {
  eclats(s, x, SOUC_Y, 12, [FROMAGE, OR], { v: 50, vie: 1, g: 320, w: 4, h: 6 });
  rayons(s, x, SOUC_Y, 14, 10, 60, OR, 0.5);
  onde(s, x, SOUC_Y, 6, 70, OR, 0.5, 3);
  etoiles(s, x, SOUC_Y, 8, '#FFF1BE', 90, 0.7);
  flotte(s, x, SOUC_Y + 30, `+${SOUC_POINTS}`, OR, 24);
  sonFlash('IN5');
}

/**
 * Départ d'un tir : son et petites étincelles au canon.
 * @param {object} s état de la partie
 */
function tirPart(s) {
  sonFlash('IN1');
  etoiles(s, s.x, VAISS_Y - 6, 3, '#fff', 40, 0.25);
  onde(s, s.x, VAISS_Y - 6, 2, 12, OR, 0.2, 2);
}

/**
 * Le tir du joueur touche-t-il un cornichon, la soucoupe ou un abri ? Si oui, il est compté et disparaît.
 * @param {object} s état de la partie
 * @returns {boolean} true si le tir a touché quelque chose
 */
function tirTouche(s) {
  const x = s.tir.x - 1, y = s.tir.y;
  for (let i = 0; i < TOTAL; i++) {
    if (!s.vivants[i]) continue;
    const ax = s.formX + (i % COLS) * ESP_X, ay = s.fy + ((i / COLS) | 0) * ESP_Y;
    if (chevauche(x, y, 2, 10, ax, ay, AW, AH)) {
      s.vivants[i] = false;
      const v = VALEUR[(i / COLS) | 0];
      s.score += v;
      eclateCornichon(s, ax + AW / 2, ay + AH / 2, v);
      return true;
    }
  }
  if (s.soucoupe && chevauche(x, y, 2, 10, s.soucoupe.x - 15, SOUC_Y - 6, 30, 12)) {
    s.score += SOUC_POINTS;
    fondSoucoupe(s, s.soucoupe.x);
    s.soucoupe = null;
    return true;
  }
  return frappeAbri(s, x, y, 2, 10);
}

/**
 * Nombre maximum de gouttes en l'air (augmente un peu avec les vagues).
 * @param {object} s état de la partie
 * @returns {number}
 */
function gouttesMax(s) {
  return Math.min(5, 3 + Math.floor((s.vague - 1) / 2));
}

/**
 * Vitesse de chute des gouttes de vinaigre (pixels par seconde) : +7 % par vague, sans plafond.
 * @param {object} s état de la partie
 * @returns {number}
 */
function vitesseGoutte(s) {
  return 120 * (1 + HAUSSE) ** (s.vague - 1) * (s.reduit ? 0.7 : 1);
}

/**
 * Délai avant le prochain tir des cornichons (secondes), plus court de 7 % à chaque vague (sans plafond).
 * @param {object} s état de la partie
 * @returns {number}
 */
function prochainTir(s) {
  const r = (1 + HAUSSE) ** (s.vague - 1);
  return ((0.8 + Math.random() * 0.9) / r) * (s.reduit ? 1.3 : 1);
}

/**
 * Un cornichon tout en bas de sa colonne (au hasard parmi les colonnes vivantes) lâche une goutte de vinaigre.
 * @param {object} s état de la partie
 */
function lacheGoutte(s) {
  if (s.gouttes.length >= gouttesMax(s)) return;
  const colonnes = [];
  for (let c = 0; c < COLS; c++) {
    for (let l = LIGNES - 1; l >= 0; l--) {
      if (s.vivants[l * COLS + c]) { colonnes.push([c, l]); break; }
    }
  }
  if (!colonnes.length) return;
  const [c, l] = colonnes[Math.floor(Math.random() * colonnes.length)];
  s.gouttes.push({ x: s.formX + c * ESP_X + AW / 2, y: s.fy + l * ESP_Y + AH });
}

/**
 * Une goutte touche le vaisseau : une vie de moins (sauf code « immortel »), flash rouge et secousse.
 * @param {object} s état de la partie
 */
function perdUneVie(s, x) {
  s.vies--;
  s.flash = 0.35;
  s.touche = s.ecoule;
  if (!s.reduit) s.secousse = 0.3;
  for (let i = 0; i < 8; i++) {
    poussiere(s, x + (Math.random() - 0.5) * 16, VAISS_Y, 1, i % 2 ? [VINAIGRE] : ['#fff'], 30, 0.7, 3, -10);
  }
  onde(s, x, VAISS_Y, 4, 30, VINAIGRE, 0.4, 2);
  sonFlash('IN6');
  // Le cœur du HUD éclate juste après (position du cœur perdu, comme le HUD commun).
  s.coeurs.push({ t: 0.2, x: W - 14 - (VIES - 1 - s.vies) * 18, y: 15 });
}

/**
 * Vague suivante : formation pleine, plus rapide ; les tirs en cours et les gouttes disparaissent.
 * @param {object} s état de la partie
 */
function vagueSuivante(s) {
  s.vague++;
  Object.assign(s, formation());
  s.gouttes = [];
  s.tir = null;
  s.attente = 1.2;
  if (!s.reduit) s.entree = s.ecoule + 0.2;
  sonFlash('IN7');
}

/**
 * Trace la soucoupe-raclette : galette jaune, dôme de fromage fondu et gouttes de raclette.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 */
function dessineSoucoupe(ctx, x, y) {
  ctx.fillStyle = OR;
  ctx.beginPath(); ctx.ellipse(x, y, 15, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = FROMAGE; ctx.fillRect(x - 7, y - 7, 14, 6);
  ctx.fillStyle = SABLE; ctx.fillRect(x - 10, y - 2, 20, 2);
  ctx.fillStyle = ROUGE; ctx.fillRect(x - 3, y - 6, 2, 2); ctx.fillRect(x + 2, y - 5, 2, 2);
  ctx.fillStyle = FROMAGE; ctx.fillRect(x - 12, y + 3, 2, 4); ctx.fillRect(x + 10, y + 3, 2, 4);
}

export const JEU = {
  id: 'invaders',
  titre: 'Space Invaders',
  accroche: 'Les cornichons attaquent !',
  quip: 'Les cornichons se figent, suspects.',
  action: true,
  aide: 'Souris, doigt ou flèches gauche et droite : déplace le vaisseau. Espace, flèche haut, clic ou doigt : tire (maintiens pour tirer sans arrêt). Évite les gouttes de vinaigre.',
  aideBorne: '← → OU SOURIS · ESPACE : TIRER',
  embleme(ctx, x, y, T) {
    const o = Math.sin(T * 3) * 4;
    dessineSegments(ctx, SEG_CORN, x - 11, y - 34 + o, 3);
    dessineSegments(ctx, SEG_CORN, x - 62, y - 22 - o, 3);
    dessineSegments(ctx, SEG_CORN, x + 40, y - 22 - o, 3);
    dessineSegments(ctx, SEG_VAISS, x - 13, y + 22, 3);
    ctx.fillStyle = OR; ctx.fillRect(x - 1, y - 2, 2, 10);
  },
  finTexte: (s) => (s.perdu
    ? { t: 'Les cornichons ont gagné', d: 'Ils ont atteint le bas, tout vinaigrés.' }
    : { t: 'Les cornichons ont gagné', d: 'Le vaisseau a pris trop de vinaigre.' }),
  init: ({ reduit }) => ({
    reduit, score: 0, vies: VIES, vague: 1, ecoule: 0,
    x: W / 2, cible: W / 2, cd: 0, tir: null,
    gouttes: [], abris: creeAbris(),
    soucoupe: null, prochaineSoucoupe: 14 + Math.random() * 6,
    tirE: 1.2, attente: 0.8, flash: 0, secousse: 0, perdu: false,
    fx: [], coeurs: [], touche: -9, entree: -9, marche: -9, sirene: 0,
    ...formation(),
  }),
  update(s, dt, e) {
    s.ecoule += dt;
    s.flash = Math.max(0, s.flash - dt);
    s.secousse = Math.max(0, s.secousse - dt);
    majFX(s, dt);
    for (let i = s.coeurs.length - 1; i >= 0; i--) {
      const q = s.coeurs[i];
      q.t -= dt;
      if (q.t <= 0) { eclatCoeur(s, q.x, q.y, 8); s.coeurs.splice(i, 1); }
    }
    if (JEU.fini(s)) return; // partie finie : seuls les effets continuent
    // Code « domu » : plus aucune goutte, même celles déjà en l'air.
    if (s.triche?.coeurs && s.gouttes.length) s.gouttes = [];

    // Vaisseau : suit le pointeur (cible) ou les flèches (fleche).
    if (e.cible !== null) s.cible = borne(e.cible, MARGE, W - MARGE);
    if (e.fleche) s.cible = borne(s.cible + e.fleche * VIT_VAISS * dt, MARGE, W - MARGE);
    s.x += (s.cible - s.x) * Math.min(1, dt * 16);

    // Tir : à l'appui, puis en continu ; un seul tir à l'écran, au plus un toutes les 0,35 s.
    s.cd = Math.max(0, s.cd - dt);
    if ((e.action || e.tenu) && !s.tir && s.cd <= 0) { s.tir = { x: s.x, y: VAISS_Y - 10 }; s.cd = CADENCE; tirPart(s); }
    if (s.tir) {
      s.tir.y -= VIT_TIR * dt;
      if (s.tir.y < -10 || tirTouche(s)) s.tir = null;
    }

    // Tout détruit : vague suivante.
    const b = bilan(s);
    if (b.n === 0) { vagueSuivante(s); return; }

    // Formation : un pas toutes les quelques images.
    if (s.attente > 0) s.attente = Math.max(0, s.attente - dt);
    else {
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = intervalle(s, b.n);
        avance(s, b);
        // Marche : un seul son par pas, jamais plus d'un toutes les 0,15 s.
        if (s.ecoule - s.marche >= MARCHE_MIN) { s.marche = s.ecoule; sonFlash('IN3'); }
      }
    }

    // Les cornichons atteignent le bas : fin de partie, ou vague recommencée (code « immortel »).
    const bas = s.fy + b.maxRow * ESP_Y + AH;
    if (bas >= LIGNE_BAS) {
      if (!s.triche?.immortel) { s.perdu = true; return; }
      Object.assign(s, formation());
      s.gouttes = [];
      s.tir = null;
      s.attente = 0.8;
      return;
    }
    if (bas >= ABRI_Y) s.abris = s.abris.filter((c) => !cornichonsSur(s, c));

    // Soucoupe : passe en haut de temps en temps.
    if (s.soucoupe) {
      s.soucoupe.x += s.soucoupe.v * dt;
      s.sirene -= dt;
      if (s.sirene <= 0) { s.sirene = 0.56; sonFlash('IN4'); }
      if (s.soucoupe.x < -30 || s.soucoupe.x > W + 30) s.soucoupe = null;
    } else {
      s.prochaineSoucoupe -= dt;
      if (s.prochaineSoucoupe <= 0) {
        const depuisGauche = Math.random() < 0.5;
        s.soucoupe = { x: depuisGauche ? -20 : W + 20, v: depuisGauche ? SOUC_VIT : -SOUC_VIT };
        s.sirene = 0.56;
        sonFlash('IN4');
        s.prochaineSoucoupe = 16 + Math.random() * 10;
      }
    }

    // Tirs des cornichons (aucun en code « domu », ni pendant une vague qui commence).
    s.tirE -= dt;
    if (s.tirE <= 0) {
      s.tirE = prochainTir(s);
      if (!s.triche?.coeurs && s.attente <= 0) lacheGoutte(s);
    }

    // Gouttes : chutent ; une touche le vaisseau (une vie) ou un abri (une brique).
    const vG = vitesseGoutte(s), immortel = !!s.triche?.immortel;
    s.gouttes = s.gouttes.filter((g) => {
      g.y += vG * dt;
      if (chevauche(g.x - 2, g.y - 4, 4, 8, s.x - VAISS_L / 2, VAISS_Y, VAISS_L, VAISS_H)) {
        if (!immortel) perdUneVie(s, g.x);
        return false;
      }
      if (frappeAbri(s, g.x - 2, g.y - 4, 4, 8)) return false;
      return g.y < H + 10;
    });

  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    for (const c of s.abris) { ctx.fillStyle = !s.reduit && s.ecoule - c.fl < 0.12 ? '#fff' : COULEUR_ABRI[c.hp]; ctx.fillRect(c.x, c.y, CELL - 1, CELL - 1); }
    for (let i = 0; i < TOTAL; i++) {
      if (!s.vivants[i]) continue;
      const x = s.formX + (i % COLS) * ESP_X;
      let y = s.fy + ((i / COLS) | 0) * ESP_Y;
      // Nouvelle vague : les rangées descendent du haut, l'une après l'autre.
      if (s.entree > -9) {
        const k = (s.ecoule - s.entree - ((i / COLS) | 0) * 0.08) / 0.5;
        if (k < 1) y -= (1 - Math.max(0, k)) ** 3 * 280;
      }
      if (s.triche?.coeurs) coeur(ctx, x + AW / 2, y + AH / 2, 10);
      else dessineSegments(ctx, SEG_CORN, x, y, PIX);
    }
    ctx.fillStyle = VINAIGRE;
    for (const g of s.gouttes) ctx.fillRect(g.x - 2, g.y - 4, 4, 8);
    if (!s.reduit) {
      ctx.globalAlpha = 0.4;
      for (const g of s.gouttes) ctx.fillRect(g.x - 1, g.y - 12, 2, 8);
      ctx.globalAlpha = 1;
    }
    if (s.soucoupe) dessineSoucoupe(ctx, s.soucoupe.x, SOUC_Y);
    if (s.tir) {
      ctx.fillStyle = OR; ctx.fillRect(s.tir.x - 1, s.tir.y, 2, 10);
      if (!s.reduit) { ctx.globalAlpha = 0.35; ctx.fillRect(s.tir.x - 1, s.tir.y + 10, 2, 12); ctx.globalAlpha = 1; }
    }
    if (s.triche?.coeurs) coeur(ctx, s.x, VAISS_Y + VAISS_H / 2, 11);
    else {
      // Touché : le vaisseau clignote en blanc pendant 0,6 s.
      const h = s.ecoule - s.touche;
      if (!s.reduit && h >= 0 && h < 0.6 && Math.floor(h / 0.07) % 2 === 0) {
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff'; ctx.fillRect(s.x - VAISS_L / 2, VAISS_Y, VAISS_L, VAISS_H); ctx.globalAlpha = 1;
      } else dessineSegments(ctx, SEG_VAISS, s.x - VAISS_L / 2, VAISS_Y, PIX);
    }
    dessineFX(ctx, s);
    ctx.restore();
    dessineFX(ctx, s, true);
    if (s.attente > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, H / 2 - 26, W, 52);
      ctx.fillStyle = '#F2EFEA'; ctx.font = '18px "Archivo Black", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`Vague ${s.vague}`, W / 2, H / 2 + 7);
      ctx.textAlign = 'start';
    }
    if (s.flash > 0) { ctx.fillStyle = `${FLASH}${s.flash})`; ctx.fillRect(0, 0, W, H); }
  },
  score: (s) => s.score,
  vies: (s) => ({ left: s.vies, max: VIES }),
  fini: (s) => s.perdu || s.vies <= 0,
  /* Le temps que le dernier cœur éclate (0,2 s de délai, 0,55 s d'éclats). */
  dureeFin: (s) => (s.vies <= 0 ? 0.9 : 0.6),
};
