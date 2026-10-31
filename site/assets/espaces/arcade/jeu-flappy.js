// ===== Humane Gang — arcade : « Flappy Domu » =====
/*
 * Rôle : le cœur du logo bat des ailes entre des tuyaux (sable et ardoise) qui défilent de droite à gauche. Il laisse
 * derrière lui une traînée arc-en-ciel à six bandes qui suit sa trajectoire et s'estompe. 1 point par tuyau franchi.
 * Une seule vie : un contact avec un tuyau, le sol ou le plafond finit la partie. Pas de limite de temps. Le passage
 * rétrécit un peu (jusqu'à 112 px, vers 120 s) et la vitesse monte par paliers de 10 s (+7 %), sans plafond : au départ
 * au plus 0,44 point par seconde (le plafond serveur est de 2 par seconde).
 * Commandes : espace, flèche haut, clic ou appui = battement d'ailes (impulsion vers le haut). Avant le premier
 * battement, le cœur flotte sur place : la gravité attend cet appui.
 * Codes de triche (s.triche, eggs/arcade.js) :
 *   coeurs = plus de tuyaux dangereux : ils deviennent des alignements de deux petits cœurs à ramasser (1 point chacun),
 *   et le héros devient un cœur rouge ; immortel = les tuyaux ne comptent plus, le cœur rebondit sur le sol et le plafond.
 * Effets (maquette validée, scènes FLa à FLd) : petit nuage et son à chaque battement, « +1 » et anneau doré à chaque
 * tuyau franchi, son à chaque palier de vitesse ; au contact le cœur éclate en morceaux rouges et arc-en-ciel, avec un
 * son propre au sol et un autre pour les tuyaux et le plafond. Ces effets vivent dans s.fx (fx.js) et ne retardent
 * jamais la fin de partie : fini() est vrai dès le contact, puis update ne fait plus avancer qu'eux, pendant dureeFin.
 * Animation réduite : tout va un peu plus lentement, ni particules, ni secousse, ni flash ; les sons et le « +1 » restent.
 * Moteur : eggs/arcade.js (creeArcade ; jeu.action = true : espace, flèche haut, clic ou appui).
 * Dépendances : ./arcade.js (W, H, coeur), ./fx.js (effets et sons).
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, coeur } from './arcade.js';
import { sonFlash, poussiere, flotte, onde, rayons, majFX, dessineFX } from './fx.js';

/** Dessus du sol (le sol occupe le bas du canevas). */
const SOL = H - 36;
/** Position horizontale du cœur : il ne bouge pas, le décor défile. */
const HX = 96;
/** Zone de contact du cœur (plus petite que son dessin de 26 × 22). */
const DEMI_W = 10, DEMI_H = 9;
/** Rayon d'attraction d'un cœur ramassé (code « domu »). */
const RAYON_C = 7;
/** Physique (px et secondes) : gravité, impulsion d'un battement, chute maximale. */
const GRAVITE = 900, BATTEMENT = 300, CHUTE_MAX = 520;
/** Distance (px) entre deux tuyaux, largeur d'un tuyau, hauteur de son rebord, débord du rebord. */
const ESPACE = 240, PW = 46, REBORD = 18, DEBORD = 5;
/** Accélération : +7 % de vitesse toutes les 10 s, sans plafond. */
const HAUSSE = 0.07, PALIER_S = 10;
const paliers = (t) => (1 + HAUSSE) ** Math.floor(t / PALIER_S);
/** Au-delà de cette seconde, le passage ne rétrécit plus. */
const PLAFOND = 120;
/** Ouverture d'un passage : de 150 px au départ jusqu'à 112 px. */
const OUVERTURE_MAX = 150, OUVERTURE_MIN = 112;
/** Traînée : six bandes (ordre du logo), épaisseur d'une bande en px. */
const ARC = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
const BANDE = 3;
/** Couleurs : cœur (contour noir, intérieur #B0102A), tuyaux sable et ardoise du site. */
const CONTOUR = '#0A0A0C', ROUGE = '#B0102A', REFLET = '#D9405A';
const SABLE = '#E2C77E', SABLE_OMBRE = '#9E8A4E', SABLE_CLAIR = '#F4E6B4';
const ARDOISE = '#4A5263', ARDOISE_CLAIR = '#5E6779', ARDOISE_FONCE = '#2C313D', CONTOUR_TUYAU = '#14122a';
const SOL_TRAIT = '#3A4150';
/** Couleurs des effets : or (tuyau franchi), or pâle, rouge vif (cœur qui éclate). */
const OR = '#FBD32D', OR_PALE = '#FFF1BE', ROUGE_VIF = '#FF5A6A';
/** Délais (ms) entre le son du choc et celui du cœur qui éclate (FL4) : tuyau ou plafond, puis sol. */
const ECLAT_CHOC = 110, ECLAT_SOL = 140;

/**
 * Cœur du logo en pixel art : 13 × 11 pixels, affichés à 2 px par pixel (26 × 22).
 * k = contour noir, r = intérieur, h = reflet, . = vide.
 */
const COEUR_PX = [
  '..kkk...kkk..',
  '.kkrrk.krrkk.',
  'krhrrkkkrrrrk',
  'krrrrrrrrrrrk',
  'kkrrrrrrrrrkk',
  '.krrrrrrrrrk.',
  '..krrrrrrrk..',
  '...krrrrrk...',
  '....krrrk....',
  '.....krk.....',
  '......k......',
];

/**
 * Vitesse de défilement (px/s) selon le temps écoulé : paliers de 10 s (+7 %), sans plafond.
 * @param {number} ecoule secondes de jeu
 * @returns {number}
 */
function vitesse(ecoule) {
  return 105 * paliers(ecoule);
}

/**
 * Crée un tuyau (passage vertical) qui arrive à droite de l'écran.
 * @param {number} ecoule secondes de jeu (le passage rétrécit avec le temps, jusqu'à OUVERTURE_MIN)
 * @returns {{x: number, haut: number, ouverture: number, passe: boolean, coeurs: {y: number, pris: boolean}[]}}
 */
function nouveauTuyau(ecoule) {
  const ouverture = Math.max(OUVERTURE_MIN, OUVERTURE_MAX - Math.min(ecoule, PLAFOND) * 0.38);
  const haut = 30 + Math.random() * (SOL - ouverture - 60);
  const milieu = haut + ouverture / 2;
  return {
    x: W + DEBORD, haut, ouverture, passe: false,
    // Code « domu » : deux petits cœurs au centre du passage, à la place du tuyau.
    coeurs: [{ y: milieu - 20, pris: false }, { y: milieu + 20, pris: false }],
  };
}

/**
 * Dessine le cœur du logo en pixel art, centré en (x, y).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 */
function coeurPixel(ctx, x, y) {
  const x0 = Math.round(x) - 13, y0 = Math.round(y) - 11;
  for (let j = 0; j < COEUR_PX.length; j++) {
    for (let i = 0; i < 13; i++) {
      const c = COEUR_PX[j][i];
      if (c === '.') continue;
      ctx.fillStyle = c === 'k' ? CONTOUR : c === 'r' ? ROUGE : REFLET;
      ctx.fillRect(x0 + i * 2, y0 + j * 2, 2, 2);
    }
  }
}

/**
 * Dessine le corps d'un tuyau (ardoise, stries, contour sombre).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x bord gauche
 * @param {number} y haut du corps
 * @param {number} h hauteur du corps
 */
function corps(ctx, x, y, h) {
  if (h <= 0) return;
  ctx.fillStyle = CONTOUR_TUYAU; ctx.fillRect(x - 2, y, PW + 4, h);
  ctx.fillStyle = ARDOISE; ctx.fillRect(x, y, PW, h);
  ctx.fillStyle = ARDOISE_CLAIR;
  for (let i = 8; i < PW - 8; i += 10) ctx.fillRect(x + i, y, 3, h);
  ctx.fillStyle = ARDOISE_FONCE; ctx.fillRect(x + PW - 6, y, 6, h);
}

/**
 * Dessine le rebord (sable) d'un tuyau, plus large que le corps.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x bord gauche du corps
 * @param {number} y haut du rebord
 */
function rebord(ctx, x, y) {
  ctx.fillStyle = CONTOUR_TUYAU; ctx.fillRect(x - DEBORD - 2, y - 2, PW + 2 * DEBORD + 4, REBORD + 4);
  ctx.fillStyle = SABLE; ctx.fillRect(x - DEBORD, y, PW + 2 * DEBORD, REBORD);
  ctx.fillStyle = SABLE_OMBRE; ctx.fillRect(x - DEBORD, y + REBORD - 4, PW + 2 * DEBORD, 4);
  ctx.fillStyle = SABLE_CLAIR; ctx.fillRect(x - DEBORD + 3, y + 3, 8, 3);
}

/**
 * Dessine un tuyau complet : une partie haute et une partie basse, avec le passage entre les deux.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {{x: number, haut: number, ouverture: number}} p tuyau
 */
function tuyauDessine(ctx, p) {
  corps(ctx, p.x, 0, p.haut - REBORD);
  rebord(ctx, p.x, p.haut - REBORD);
  const bas = p.haut + p.ouverture;
  rebord(ctx, p.x, bas);
  corps(ctx, p.x, bas + REBORD, SOL - bas - REBORD);
}

/**
 * Dessine le sol défilant (bande sable au-dessus, ardoise foncée, traits qui glissent).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {{sol: number}} s état de la partie
 */
function sol(ctx, s) {
  ctx.fillStyle = ARDOISE_FONCE; ctx.fillRect(0, SOL, W, H - SOL);
  ctx.fillStyle = SABLE; ctx.fillRect(0, SOL, W, 4);
  ctx.fillStyle = SOL_TRAIT;
  for (let x = -s.sol; x < W; x += 24) ctx.fillRect(x, SOL + 12, 12, 4);
}

/**
 * Dessine la traînée arc-en-ciel : six bandes horizontales qui suivent les anciennes positions du cœur et s'estompent.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {{x: number, y: number}[]} pts positions, de la plus ancienne à la plus récente
 */
function traineDessine(ctx, pts) {
  const n = pts.length;
  if (n < 2) return;
  ctx.lineWidth = BANDE; ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
  for (let b = 0; b < ARC.length; b++) {
    const decal = (b - (ARC.length - 1) / 2) * BANDE;
    ctx.strokeStyle = ARC[b];
    for (let i = 0; i < n - 1; i += 3) {
      ctx.globalAlpha = 0.15 + 0.85 * (i / n);
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y + decal);
      for (let k = i + 1; k <= Math.min(n - 1, i + 3); k++) ctx.lineTo(pts[k].x, pts[k].y + decal);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

/**
 * Battement d'ailes : l'impulsion, le petit nuage sous le cœur et le son.
 * @param {object} s état de la partie
 */
function battre(s) {
  s.vy = -BATTEMENT;
  poussiere(s, HX - 6, s.y + 10, 4, ['#fff', '#cfd0ff'], 36, 0.3, 2, 60);
  onde(s, HX, s.y + 8, 3, 15, 'rgba(255,255,255,.7)', 0.22, 1);
  sonFlash('FL1');
}

/**
 * Tuyau franchi : « +1 », anneau et poussière dorés au centre du passage, son.
 * @param {object} s état de la partie
 * @param {{x: number, haut: number, ouverture: number}} p tuyau franchi
 */
function franchi(s, p) {
  const x = p.x + PW / 2, y = p.haut + p.ouverture / 2;
  flotte(s, HX + 34, s.y - 26, '+1', OR);
  onde(s, x, y, 6, 40, OR, 0.4, 2);
  poussiere(s, x, y, 6, [OR, OR_PALE], 70, 0.45, 3);
  sonFlash('FL2');
}

/**
 * Fin de partie : le cœur touche un tuyau, le sol ou le plafond et éclate. La partie finit à l'instant même ;
 * le son de l'éclat, décalé, part d'un minuteur pour ne rien demander au moteur.
 * @param {object} s état de la partie
 * @param {'tuyau'|'sol'|'plafond'} cause ce que le cœur a touché
 */
function meurs(s, cause) {
  s.mort = true;
  if (!s.reduit) { s.flash = 0.35; s.secousse = 0.3; }
  poussiere(s, HX, s.y, 14, [ROUGE, REFLET, CONTOUR], 150, 0.8, 3, 300);
  poussiere(s, HX, s.y, 6, ARC, 120, 0.8, 4, 300);
  onde(s, HX, s.y, 4, 44, ROUGE_VIF, 0.4, 3);
  rayons(s, HX, s.y, 8, 10, 40, OR, 0.3);
  if (cause === 'sol') poussiere(s, HX, SOL, 8, [SABLE, SABLE_OMBRE], 100, 0.5, 3, 200);
  sonFlash(cause === 'sol' ? 'FL5' : 'FL3');
  setTimeout(() => sonFlash('FL4'), cause === 'sol' ? ECLAT_SOL : ECLAT_CHOC);
}

export const JEU = {
  id: 'flappy',
  titre: 'Flappy Domu',
  action: true,
  accroche: 'Un cœur, deux ailes, zéro frein',
  quip: 'Le cœur reprend son souffle.',
  aide: 'Espace, flèche haut, clic ou appui : bats des ailes pour passer entre les tuyaux, sans toucher le sol, le plafond ni un tuyau.',
  aideBorne: 'ESPACE OU CLIC : BATTRE DES AILES',
  /* Emblème de l'écran de départ : le cœur et sa traînée ondulent ensemble. */
  embleme(ctx, x, y, T) {
    for (let b = 0; b < ARC.length; b++) {
      ctx.fillStyle = ARC[b];
      ctx.fillRect(x - 70, y - 9 + b * BANDE + Math.sin(T * 5) * 2, 42, BANDE);
    }
    ctx.save();
    ctx.translate(x - 6, y + Math.sin(T * 5) * 3);
    ctx.scale(2.2, 2.2);
    coeurPixel(ctx, 0, 0);
    ctx.restore();
  },
  finTexte: () => ({ t: 'Aïe !', d: 'Le cœur a fait pouf.' }),
  init: ({ reduit }) => ({
    reduit, lent: reduit ? 0.8 : 1,
    score: 0, ecoule: 0, palier: 0, debut: false, mort: false,
    y: H / 2, vy: 0, traine: [], acc: 0,
    tuyaux: [], depuis: ESPACE - 150, sol: 0,
    fx: [], flash: 0, secousse: 0,
  }),
  update(s, dt, e) {
    const d = dt * s.lent;
    majFX(s, d);
    s.secousse = Math.max(0, s.secousse - d);
    s.flash = Math.max(0, s.flash - d);
    if (s.mort) return;
    const v = vitesse(s.ecoule);
    s.ecoule += d;
    s.sol = (s.sol + v * d) % 24;
    const palier = Math.floor(s.ecoule / PALIER_S);
    if (palier > s.palier) { s.palier = palier; sonFlash('FL6'); }

    // Le cœur : flotte avant le premier battement, puis gravité et impulsions.
    if (e.action) s.debut = true;
    if (!s.debut) {
      s.y = H / 2 + Math.sin(s.ecoule * 3) * 5;
      s.vy = 0;
    } else {
      if (e.action) battre(s);
      s.vy = Math.min(CHUTE_MAX, s.vy + GRAVITE * d);
      s.y += s.vy * d;
    }
    const plafond = s.y - DEMI_H < 0, sol = s.y + DEMI_H > SOL;
    if (s.triche?.immortel) {
      // Code « immortel » : le cœur rebondit sur le sol et le plafond.
      if (sol) { s.y = SOL - DEMI_H; s.vy = -BATTEMENT * 0.8; }
      if (plafond) { s.y = DEMI_H; s.vy = Math.abs(s.vy) * 0.5; }
    } else if (plafond || sol) {
      meurs(s, sol ? 'sol' : 'plafond');
      return;
    }

    // Traînée : les points glissent vers la gauche avec le décor ; un point toutes les 1/30 s.
    for (const q of s.traine) q.x -= v * d;
    s.acc += d;
    if (s.acc >= 1 / 30) { s.acc = 0; s.traine.push({ x: HX, y: s.y }); }
    while (s.traine.length && s.traine[0].x < -10) s.traine.shift();

    // Tuyaux : défilement, apparition à droite, retrait à gauche.
    for (const p of s.tuyaux) p.x -= v * d;
    s.depuis += v * d;
    if (s.depuis >= ESPACE) { s.depuis -= ESPACE; s.tuyaux.push(nouveauTuyau(s.ecoule)); }
    s.tuyaux = s.tuyaux.filter((p) => p.x + PW + DEBORD > -10);

    const coeurs = !!s.triche?.coeurs, immortel = !!s.triche?.immortel;
    for (const p of s.tuyaux) {
      if (!p.passe && p.x + PW < HX - DEMI_W) {
        p.passe = true;
        if (!coeurs) { s.score++; franchi(s, p); }
      }
      if (coeurs) {
        // Code « domu » : les deux petits cœurs se ramassent (1 point chacun), le tuyau ne fait rien.
        for (const c of p.coeurs) {
          if (!c.pris && Math.abs(HX - (p.x + PW / 2)) < DEMI_W + RAYON_C && Math.abs(s.y - c.y) < DEMI_H + RAYON_C) {
            c.pris = true;
            s.score++;
            flotte(s, HX + 34, s.y - 26, '+1', OR);
            poussiere(s, p.x + PW / 2, c.y, 6, [ROUGE, ROUGE_VIF], 70, 0.45, 3);
            sonFlash('FL2');
          }
        }
      } else if (!immortel && HX + DEMI_W > p.x - DEBORD && HX - DEMI_W < p.x + PW + DEBORD
        && (s.y - DEMI_H < p.haut || s.y + DEMI_H > p.haut + p.ouverture)) {
        meurs(s, 'tuyau');
        return;
      }
    }
  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    sol(ctx, s);
    const coeurs = !!s.triche?.coeurs;
    for (const p of s.tuyaux) {
      if (coeurs) { for (const c of p.coeurs) if (!c.pris) coeur(ctx, p.x + PW / 2, c.y, 7); }
      else tuyauDessine(ctx, p);
    }
    traineDessine(ctx, s.traine);
    // Code « domu » : le héros devient un cœur rouge. Une fois mort, il a éclaté : il n'est plus dessiné.
    if (!s.mort) {
      if (coeurs) coeur(ctx, HX, s.y, 12);
      else coeurPixel(ctx, HX, s.y);
    }
    dessineFX(ctx, s);
    ctx.restore();
    if (s.flash > 0) { ctx.fillStyle = `rgba(176, 16, 42, ${s.flash})`; ctx.fillRect(0, 0, W, H); }
    dessineFX(ctx, s, true);
  },
  score: (s) => s.score,
  /* Une seule vie : pas de compteur ; la partie finit au premier contact. */
  vies: () => null,
  fini: (s) => s.mort,
  /* Le temps que les morceaux du cœur retombent. */
  dureeFin: () => 0.9,
};
