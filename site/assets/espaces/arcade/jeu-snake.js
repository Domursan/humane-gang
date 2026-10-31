// ===== Humane Gang — arcade : « Snake » (le serpent des raclettes) =====
/*
 * Rôle : le serpent avance sur une grille et tourne à chaque flèche, glissement ou appui du doigt (appui : il tourne
 * vers le côté appuyé par rapport à la tête). Il mange des raclettes (fromage fondu sur une pomme de terre) : +10 points
 * et il grandit. Un mur ou sa propre queue finit la partie. Pas de limite de temps.
 * Cadence : une raclette n'apparaît qu'1,7 s après la précédente mangée (REPAS_MIN) : au plus un repas toutes les 1,7 s,
 * soit 5,9 points par seconde au plus, sous le plafond serveur de 12 points par seconde. Un repas seul fait 10 points
 * dans une seconde, jamais deux.
 * Vitesse : le serpent avance plus vite par paliers de 10 s (+7 %), sans plafond ; un plancher technique (0,03 s par
 * case, ~33 cases par seconde) rend la partie injouable bien avant.
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = la nourriture devient des cœurs ; immortel = les murs font passer
 * de l'autre côté et se mordre ne tue pas.
 * Moteur : eggs/arcade.js (creeArcade ; jeu « directions » et action pour tourner au doigt). Animation réduite : pas plus lent.
 * Effets (maquette flash validée) : sons SN1 à SN6, éclats de fromage et « +10 » au repas, vague de lumière le long du corps,
 * flèche tapée allumée sous le plateau, raclette qui flotte. À la mort : éclair, secousse, serpent qui clignote puis se
 * dissout en pixels arc-en-ciel depuis la queue, pendant dureeFin (2,75 s au plus) ; fini() est vrai dès la mort, le moteur
 * envoie le score tout de suite et le score ne bouge plus. Animation réduite : aucun effet, pas de dissolution, sons conservés.
 * Écrans communs : titre, accroche, quip, aide, embleme (aperçu du serpent et de la raclette), finTexte.
 * Exporte : JEU (règles du mini-jeu pour creeArcade), COLS et LIGNES (taille de la grille).
 */
import { W, H, coeur } from './arcade.js';
import { sonFlash, poussiere, flotte, onde, rayons, majFX, dessineFX } from './fx.js';

/** Grille : cases de 18 px, 18 colonnes × 20 lignes, centrée dans le canevas. */
export const COLS = 18, LIGNES = 20, CASE = 18;
const OX = (W - COLS * CASE) / 2, OY = (H - LIGNES * CASE) / 2;
const POINTS = 10;
/** Délai minimal entre deux raclettes (secondes) : au plus un repas toutes les 1,7 s. */
const REPAS_MIN = 1.7;
/** Accélération : +7 % de vitesse toutes les 10 s, sans plafond. */
const HAUSSE = 0.07, PALIER_S = 10;
const paliers = (t) => (1 + HAUSSE) ** Math.floor(t / PALIER_S);
/** Plancher technique : durée minimale d'une case (secondes). */
const PAS_PLANCHER = 0.03;
const ARC = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
const DIRS = { haut: { x: 0, y: -1, nom: 'haut' }, bas: { x: 0, y: 1, nom: 'bas' }, gauche: { x: -1, y: 0, nom: 'gauche' }, droite: { x: 1, y: 0, nom: 'droite' } };
const FOND_A = '#171528', FOND_B = '#1C1A33', PLATEAU = '#0E0E10', SABLE = '#E2C77E';
const OR = '#FBD32D', ROUGE_V = '#FF5A6A', BORD = '#F2EFEA';
/** Flèches affichées sous le plateau : celle qu'on vient de taper s'allume. */
const FLECHES = [['gauche', '←'], ['haut', '↑'], ['bas', '↓'], ['droite', '→']];
/** Mort : clignotement, pas de dissolution par case, dissolution totale au plus (serpent long), retombée des derniers pixels. */
const CLIGNOTE = 0.45, PAS_DISSOUT = 0.08, DISSOUT_MAX = 1.6, RETOMBEE = 0.7;
const COULEURS_REPAS = ['#FBD32D', '#E0A526', '#B9854A', '#fff'], COULEURS_MORT = ['#fff', ROUGE_V, OR];
const RACLETTE = ['..JJ.j', '.JJJJJ', 'JJjJJJ', 'JJJJjJ', 'PPpPPp', '.PpPP.'];
const COULEUR_RACLETTE = { J: '#FBD32D', j: '#E0A526', P: '#B9854A', p: '#7A4A22' };

/**
 * Mélange deux couleurs hexadécimales.
 * @param {string} hex couleur de départ (#RRGGBB)
 * @param {string} vers couleur d'arrivée (#RRGGBB)
 * @param {number} k part de la couleur d'arrivée, de 0 à 1
 * @returns {string} couleur #RRGGBB
 */
function melange(hex, vers, k) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(vers.slice(i, i + 2), 16));
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/** Ombre et tête calculées une fois (pas d'allocation par image). */
const OMBRE = ARC.map((c) => melange(c, '#000000', 0.3));
const TETE = melange(ARC[0], '#FFFFFF', 0.4);

/**
 * Trace une raclette en pixel art (6 × 6 pixels de 3 px) dans la case dont le coin haut gauche est (x, y).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x coin de la case
 * @param {number} y coin de la case
 */
function raclette(ctx, x, y) {
  for (let r = 0; r < RACLETTE.length; r++) {
    const ligne = RACLETTE[r];
    for (let c = 0; c < ligne.length; c++) {
      const couleur = COULEUR_RACLETTE[ligne[c]];
      if (!couleur) continue;
      ctx.fillStyle = couleur;
      ctx.fillRect(x + c * 3, y + r * 3, 3, 3);
    }
  }
}

/** Centre d'une case, en coordonnées du canevas. */
const centre = (x, y) => ({ x: OX + x * CASE + CASE / 2, y: OY + y * CASE + CASE / 2 });

/** Rectangle plein. */
function pave(ctx, x, y, w, h, couleur) { ctx.fillStyle = couleur; ctx.fillRect(x, y, w, h); }

/**
 * Tourne le serpent : la commande est mise en file (deux au plus) ; demi-tour et répétition sont refusés.
 * @param {object} s état de la partie
 * @param {{x: number, y: number, nom: string}} d direction demandée
 */
function tourne(s, d) {
  if (s.file.length >= 2) return;
  const derniere = s.file.length ? s.file[s.file.length - 1] : s.dir;
  if ((d.x === derniere.x && d.y === derniere.y) || (d.x === -derniere.x && d.y === -derniere.y)) return;
  s.file.push(d);
  s.touche = { k: d.nom, t: s.T };
  sonFlash('SN1');
}

/**
 * Place une raclette sur une case libre (pas sur le serpent).
 * @param {object} s état de la partie
 */
function placeRaclette(s) {
  for (let essai = 0; essai < 300; essai++) {
    const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * LIGNES);
    if (!s.corps.some((c) => c.x === x && c.y === y)) { s.nourriture = { x, y }; return; }
  }
}

/**
 * Mort du serpent : le jeu s'arrête ici, le score ne bouge plus ; le serpent se dissout ensuite (voir dissout).
 * @param {object} s état de la partie
 * @param {string} message cause de la mort (titre de l'écran de fin)
 * @param {string} son code du son
 * @param {{x: number, y: number}} p case du choc
 */
function mort(s, message, son, p) {
  s.mort = message; s.mortT = s.T;
  s.pasDissout = Math.min(PAS_DISSOUT, DISSOUT_MAX / s.corps.length);
  if (!s.reduit) { s.secousse = 0.3; s.flash = 0.3; }
  const q = centre(p.x, p.y);
  onde(s, q.x, q.y, 6, 40, ROUGE_V, 0.4, 3);
  poussiere(s, q.x, q.y, 10, COULEURS_MORT, 110, 0.5, 3);
  rayons(s, q.x, q.y, 8, 8, 30, '#fff', 0.3);
  sonFlash(son);
}

/**
 * Dissolution : après le clignotement, les cases partent en pixels une à une depuis la queue ; s.dissous sonne la fin.
 * @param {object} s état de la partie
 */
function dissout(s) {
  if (s.reduit) return; // le moteur ne joue pas dureeFin : pas de dissolution
  const age = s.T - s.mortT - CLIGNOTE, n = s.corps.length;
  const parties = Math.floor(age / s.pasDissout);
  while (parties > s.retire && s.retire < n) {
    const i = n - 1 - s.retire, c = s.corps[i], q = centre(c.x, c.y);
    poussiere(s, q.x, q.y, 5, [ARC[i % ARC.length], OMBRE[i % ARC.length]], 70, 0.7, 4, 340);
    s.retire++;
  }
  if (s.retire >= n && age >= s.pasDissout * n + RETOMBEE) s.dissous = true;
}

/**
 * Un pas du serpent : applique la commande en attente, gère murs, queue et repas.
 * @param {object} s état de la partie
 */
function avance(s) {
  if (s.file.length) s.dir = s.file.shift();
  const t = s.corps[0];
  let x = t.x + s.dir.x, y = t.y + s.dir.y;
  if (x < 0 || y < 0 || x >= COLS || y >= LIGNES) {
    if (!s.triche?.immortel) { mort(s, 'Aïe, un mur !', 'SN4', t); return; }
    x = (x + COLS) % COLS; y = (y + LIGNES) % LIGNES; // immortel : de l'autre côté
  }
  const mange = !!s.nourriture && s.nourriture.x === x && s.nourriture.y === y;
  // La queue quitte sa case, sauf si le serpent mange (il grandit).
  const obstacles = mange ? s.corps : s.corps.slice(0, -1);
  if (!s.triche?.immortel && obstacles.some((c) => c.x === x && c.y === y)) { mort(s, 'Tu t’es mordu la queue !', 'SN5', { x, y }); return; }
  s.corps.unshift({ x, y });
  if (mange) {
    s.score += POINTS; s.nourriture = null; s.reserve = REPAS_MIN;
    s.onde = s.T; s.bouche = s.T; s.sonGrandit = 0.09;
    const q = centre(x, y);
    poussiere(s, q.x, q.y, 12, COULEURS_REPAS, 100, 0.55, 3);
    rayons(s, q.x, q.y, 8, 8, 24, OR, 0.35);
    onde(s, q.x, q.y, 4, 28, OR, 0.35, 2);
    flotte(s, q.x, q.y - 22, '+10', OR, 18);
    sonFlash('SN2');
  } else s.corps.pop();
}

export const JEU = {
  id: 'snake',
  titre: 'Snake',
  accroche: 'Un serpent arc-en-ciel affamé',
  quip: 'Le serpent digère en silence.',
  directions: true,
  action: true,
  aide: 'Flèches ou glisse le doigt pour tourner ; touche le côté où tu veux aller. Mange les raclettes, évite les murs et ta queue.',
  aideBorne: 'FLÈCHES OU GLISSE : TOURNER',
  init: ({ reduit }) => {
    const milieu = Math.floor(COLS / 2), ligne = Math.floor(LIGNES / 2);
    return {
      reduit, pas: reduit ? 0.26 : 0.2,
      ecoule: 0, aTemps: 0, score: 0,
      corps: [{ x: milieu, y: ligne }, { x: milieu - 1, y: ligne }, { x: milieu - 2, y: ligne }], // tête en premier
      dir: DIRS.droite, file: [], nourriture: null, reserve: REPAS_MIN, mort: null, secousse: 0,
      T: 0, flash: 0, palier: 0, onde: -9, bouche: -9, sonGrandit: 0, touche: null, mortT: 0, pasDissout: PAS_DISSOUT, retire: 0, dissous: false,
    };
  },
  update(s, dt, e) {
    s.T += dt;
    s.secousse = Math.max(0, s.secousse - dt);
    s.flash = Math.max(0, s.flash - dt);
    majFX(s, dt);
    if (s.sonGrandit > 0) { s.sonGrandit -= dt; if (s.sonGrandit <= 0) sonFlash('SN3'); }
    if (s.mort) { dissout(s); return; }
    s.ecoule += dt;
    const palier = Math.floor(s.ecoule / PALIER_S);
    if (palier > s.palier) { s.palier = palier; sonFlash('SN6'); }
    if (e.dir) tourne(s, DIRS[e.dir]);
    if (e.action && e.cible !== null && e.cibleY !== null) {
      // Appui : tourne vers le côté appuyé, par rapport à la tête (au doigt).
      const t = s.corps[0];
      const dx = e.cible - (OX + t.x * CASE + CASE / 2), dy = e.cibleY - (OY + t.y * CASE + CASE / 2);
      tourne(s, Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? DIRS.gauche : DIRS.droite) : (dy < 0 ? DIRS.haut : DIRS.bas));
    }
    if (!s.nourriture) { s.reserve -= dt; if (s.reserve <= 0) placeRaclette(s); }
    const pas = Math.max(PAS_PLANCHER, s.pas / paliers(s.ecoule));
    s.aTemps += dt;
    while (s.aTemps >= pas && !s.mort) { s.aTemps -= pas; avance(s); }
  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    ctx.fillStyle = PLATEAU; ctx.fillRect(OX - 6, OY - 6, COLS * CASE + 12, LIGNES * CASE + 12);
    for (let y = 0; y < LIGNES; y++) for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? FOND_A : FOND_B;
      ctx.fillRect(OX + x * CASE, OY + y * CASE, CASE, CASE);
    }
    // Le cadre clignote en rouge pendant la dissolution.
    ctx.strokeStyle = s.mort && !s.reduit && !s.dissous && Math.floor((s.T - s.mortT) / 0.1) % 2 === 0 ? ROUGE_V : SABLE;
    ctx.lineWidth = 2;
    ctx.strokeRect(OX - 5, OY - 5, COLS * CASE + 10, LIGNES * CASE + 10);
    if (s.nourriture) {
      const f = s.nourriture, q = centre(f.x, f.y), bob = s.reduit ? 0 : Math.sin(s.T * 5) * 1.5;
      if (s.triche?.coeurs) coeur(ctx, q.x, q.y + bob, 7);
      else raclette(ctx, OX + f.x * CASE, OY + f.y * CASE + bob);
      if (!s.reduit && Math.floor(s.T * 3) % 2 === 0) { // petits reflets
        pave(ctx, q.x + 7, q.y - 11 + bob, 2, 2, '#fff');
        pave(ctx, q.x - 10, q.y - 4 + bob, 2, 2, '#fff');
      }
    }
    // Corps : couleurs de l'arc-en-ciel du logo qui se succèdent ; la tête est plus claire. La queue part la première.
    const age = s.T - s.mortT, blanc = !!s.mort && !s.reduit && age < CLIGNOTE && Math.floor(age / PAS_DISSOUT) % 2 === 0;
    const reste = s.corps.length - s.retire;
    for (let i = reste - 1; i >= 0; i--) {
      const c = s.corps[i], px = OX + c.x * CASE, py = OY + c.y * CASE;
      if (i === 0) {
        const k = (s.T - s.bouche) / 0.16, m = !s.reduit && k >= 0 && k < 1 ? 2 : 0; // la tête gonfle quand elle mange
        pave(ctx, px + 1 - m, py + 1 - m, CASE - 2 + m * 2, CASE - 2 + m * 2, blanc ? '#fff' : TETE);
        continue;
      }
      const k = s.T - s.onde - i * 0.035, g = !s.reduit && k > 0 && k < 0.14 ? 2 : 0; // vague de lumière
      pave(ctx, px + 1 - g, py + 1 - g, CASE - 2 + g * 2, CASE - 2 + g * 2, blanc ? '#fff' : ARC[i % ARC.length]);
      if (!blanc) pave(ctx, px + 1, py + CASE - 4, CASE - 2, 3, OMBRE[i % ARC.length]);
      if (g) pave(ctx, px + 1 - g, py + 1 - g, CASE - 2 + g * 2, CASE - 2 + g * 2, 'rgba(255,255,255,.45)');
    }
    // Deux yeux à l'avant de la tête, dans le sens de la marche.
    if (reste > 0) {
      const t = s.corps[0], { x: hx, y: hy } = centre(t.x, t.y);
      const d = s.dir, perp = d.x !== 0 ? [0, 1] : [1, 0];
      for (const k of [-1, 1]) {
        const cx = hx + d.x * 4 + perp[0] * k * 4, cy = hy + d.y * 4 + perp[1] * k * 4;
        pave(ctx, cx - 3, cy - 3, 6, 6, BORD);
        pave(ctx, cx - 1 + d.x, cy - 1 + d.y, 2, 2, '#0E0E10');
      }
    }
    // Sous le plateau : la flèche tapée s'allume.
    ctx.font = '12px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    FLECHES.forEach(([nom, signe], i) => {
      const allumee = s.touche?.k === nom && s.T - s.touche.t < 0.3, x0 = W / 2 - 46 + i * 24;
      ctx.globalAlpha = allumee ? 1 : 0.28;
      pave(ctx, x0, 399, 20, 18, allumee ? OR : '#3A3A44');
      ctx.fillStyle = allumee ? '#08080B' : BORD;
      ctx.fillText(signe, x0 + 10, 413);
    });
    ctx.globalAlpha = 1; ctx.textAlign = 'start';
    dessineFX(ctx, s);
    ctx.restore();
    if (s.flash > 0) pave(ctx, 0, 0, W, H, `rgba(224, 64, 75, ${s.flash})`);
    dessineFX(ctx, s, true);
  },
  /** Aperçu de l'écran de départ : le serpent ondule vers une raclette. */
  embleme(ctx, x, y, T) {
    for (let i = 4; i >= 1; i--) pave(ctx, x - 3 - i * 17, y + 6 + Math.sin(T * 4 + i) * 3, 16, 16, ARC[i % ARC.length]);
    pave(ctx, x, y + 6, 16, 16, TETE);
    pave(ctx, x + 14, y + 10, 5, 5, BORD);
    pave(ctx, x + 16, y + 12, 2, 2, '#0E0E10');
    raclette(ctx, x + 40, y - 6);
  },
  /** Écran de fin : la cause de la mort. */
  finTexte: (s) => ({ t: s.mort || 'Tu t’es mordu la queue !', d: 'Ça arrive aux meilleurs serpents.' }),
  score: (s) => s.score,
  /* Pas de vies : la partie finit au premier mur ou au premier coup de queue. */
  vies: () => null,
  fini: (s) => s.mort !== null,
  /* Clignotement, dissolution puis retombée des derniers pixels, avant l'écran de fin (2,75 s au plus). */
  dureeFin: (s) => CLIGNOTE + s.pasDissout * s.corps.length + RETOMBEE,
};
