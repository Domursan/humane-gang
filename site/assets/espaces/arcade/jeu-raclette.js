// ===== Humane Gang — arcade : « Raclette » =====
/*
 * Rôle : des tranches de fromage tombent ; le poêlon les attrape (+1). Chaque tranche attrapée rapporte aussi 1 Paillette
 * (règle gérée par le serveur, migration 182 : rien à coder ici). Les cornichons sont à éviter : chacun coûte
 * une des trois vies. La partie finit à zéro vie ; pas de limite de temps. La vitesse monte par paliers de 10 s (+7 %),
 * sans plafond : la partie finit par devenir injouable.
 * Cadence : au plus une tranche toutes les 0,32 s (3,1 points par seconde, sous le plafond serveur de 6).
 * Sprites dessinés en pixel art (rectangles), comme les paillettes.
 * Effets (fx.js, maquette flash) : fromage attrapé = poussière, onde, « +1 », poêlon qui se soulève, bulles de fonte, sons RA1
 *   puis RA2 ; cornichon = éclaboussure verte, « Beurk ! », RA3, puis le cœur perdu éclate en haut à droite (RA4) ;
 *   tranche au sol = tache de fromage et RA5 ; prises rapprochées = grésillement RA6, discret.
 *   Les effets différés passent par s.file (compteur en secondes dans l'état), jamais par setTimeout : la pause les gèle.
 *   Après la dernière vie, update ne fait plus que les effets, pendant dureeFin : le cœur différé éclate avant l'écran de fin.
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = plus de cornichons et fromage en cœurs ; immortel = cornichons sans effet.
 * Moteur : eggs/arcade.js (creeArcade). Animation réduite : chute plus lente, pas de secousse ni d'effets (sons et textes gardés).
 * Écrans communs : titre, accroche, quip, aide, embleme (aperçu du poêlon, de la tranche et du cornichon), finTexte.
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, coeur } from './arcade.js';
import { sonFlash, poussiere, flotte, onde, eclatCoeur, majFX, dessineFX } from './fx.js';

const VIES = 3, SOL = H - 50, DEMI = 38;
/** Accélération : +7 % de vitesse toutes les 10 s, sans plafond. */
const HAUSSE = 0.07, PALIER_S = 10;
const paliers = (t) => (1 + HAUSSE) ** Math.floor(t / PALIER_S);
const FROMAGE = '#FBD32D', DESSUS = '#FCA301', TROU = '#e2a52c', CROUTE = '#8a5200', CORNICHON = '#5f8f33', CORN_FONCE = '#4f7a2a', CORN_CLAIR = '#8fc35f', POELE = '#2b2f38', MANCHE = '#6b3a12';
const CREME = '#FFF1BE';
/** Grésillement RA6 : prise à moins de 0,5 s de la précédente, au plus une fois toutes les 1,2 s. */
const RAPPROCHE_S = 0.5, GRESIL_PAUSE_S = 1.2;
const borne = (v, a, b) => Math.min(b, Math.max(a, v));
const alea = (a, b) => a + Math.random() * (b - a);

/** Rectangle plein (sprite en pixel art). */
function rect(ctx, x, y, w, h, couleur) { ctx.fillStyle = couleur; ctx.fillRect(x, y, w, h); }

/** Tranche de fromage (30 x 16) centrée en (x0, y0), légère oscillation selon l'angle a. */
function tranche(ctx, x0, y0, a) {
  const w = 30, h = 16, x = Math.round(x0 - w / 2), y = Math.round(y0 - h / 2 + Math.sin(a) * 1.5);
  rect(ctx, x, y, w, h, FROMAGE); rect(ctx, x, y, w, 4, DESSUS); rect(ctx, x + 6, y + 7, 4, 4, TROU); rect(ctx, x + 19, y + 9, 4, 4, TROU); rect(ctx, x, y + h, w, 2, CROUTE);
}

/** Cornichon (piège) centré en (x, y). */
function cornichon(ctx, x, y) {
  rect(ctx, x - 4, y - 11, 8, 22, CORN_FONCE); rect(ctx, x - 6, y - 9, 12, 18, CORNICHON); rect(ctx, x - 3, y - 6, 2, 2, CORN_CLAIR); rect(ctx, x + 1, y, 2, 2, CORN_CLAIR);
}

/**
 * Poêlon : manche, poêle, fromage déjà fondu au fond. Centré en x, bord haut de la poêle à yPoele.
 * bump (0 à 0,35 s) : le fromage se soulève juste après une prise.
 */
function poelon(ctx, x, yPoele, bump = 0) {
  const b = Math.min(1, bump / 0.35) * 5;
  rect(ctx, x + DEMI - 4, yPoele + 10, 30, 6, MANCHE);
  rect(ctx, x - DEMI, yPoele + 6, DEMI * 2, 14, POELE);
  rect(ctx, x - DEMI + 2, yPoele + 2, DEMI * 2 - 4, 6, '#4b4f5b');
  rect(ctx, x - DEMI + 8, yPoele - b, DEMI * 2 - 16, 4 + b, FROMAGE);
  if (b > 0) rect(ctx, x - DEMI + 8, yPoele - b, DEMI * 2 - 16, 2, DESSUS);
}

/** Position du cœur n° k (0 = le plus à gauche) dans le HUD, en haut à droite, comme la maquette. */
const posCoeur = (k) => ({ x: W - 14 - (VIES - 1 - k) * 18, y: 15 });

/** Programme un effet différé : t en secondes, k sa nature (son, bulle, coeur). Avance dans update, gelé en pause. */
function plusTard(s, t, k, extra) { s.file.push({ t, k, ...extra }); }

/** Petite bulle de fonte qui monte du poêlon (rien avec s.reduit). */
function bulle(s, pale) {
  if (s.reduit) return;
  (s.fx ||= []).push({ k: 'p', t: 0, x: s.x + alea(-26, 26), y: H - 38, vx: 0, vy: alea(-34, -18), g: -10, rot: 0, vr: 0, haut: false, c: pale ? CREME : FROMAGE, s: 3, vie: 0.6 });
}

/** Fromage attrapé : poussière, onde, « +1 », poêlon qui se soulève, bulles, RA1 puis RA2 ; RA6 si la prise est rapprochée. */
function prise(s, p) {
  s.score++;
  s.bump = 0.35;
  poussiere(s, p.x, H - 38, 6, [FROMAGE, DESSUS, CREME], 70, 0.45, 3);
  onde(s, p.x, H - 34, 4, 26, FROMAGE, 0.3, 2);
  flotte(s, p.x, H - 70, '+1', FROMAGE);
  sonFlash('RA1');
  for (let i = 0; i < 6; i += 1) plusTard(s, 0.12 + i * 0.09, 'bulle', { pale: i % 2 === 1 });
  plusTard(s, 0.14, 'son', { code: 'RA2' });
  if (s.ecoule - s.dernierePrise < RAPPROCHE_S && s.ecoule - s.dernierGresil > GRESIL_PAUSE_S) { s.dernierGresil = s.ecoule; sonFlash('RA6'); }
  s.dernierePrise = s.ecoule;
}

/** Cornichon attrapé : éclaboussure verte, « Beurk ! », RA3 ; si une vie est perdue, son cœur éclate 220 ms après (RA4). */
function pique(s, p) {
  poussiere(s, p.x, p.y, 10, [CORNICHON, CORN_CLAIR, CORN_FONCE, '#D9F0A0'], 110, 0.55, 4);
  onde(s, p.x, p.y, 4, 30, CORN_CLAIR, 0.35, 2);
  flotte(s, p.x, p.y - 26, 'Beurk !', CORN_CLAIR, 16);
  sonFlash('RA3');
  if (s.triche?.immortel) return;
  s.vies--;
  s.flash = 0.35;
  if (!s.reduit) s.secousse = 0.2;
  plusTard(s, 0.22, 'coeur', posCoeur(s.vies));
}

/** Objet arrivé au sol : tache de fromage et RA5 pour une tranche, petit nuage vert pour un cornichon. */
function sol(s, p) {
  if (p.corn) { poussiere(s, p.x, H - 16, 4, [CORNICHON, CORN_FONCE], 40, 0.4, 2, 140); return; }
  if (!s.reduit) (s.fx ||= []).push({ k: 'rect', t: 0, x: p.x, y: H - 12, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, haut: false, w: 36, h: 5, c: FROMAGE, vie: 1 });
  poussiere(s, p.x, H - 14, 5, [FROMAGE, DESSUS], 50, 0.4, 2, 150);
  sonFlash('RA5');
}

/** Fait avancer les effets différés et déclenche ceux arrivés à échéance. */
function majFile(s, dt) {
  if (!s.file.length) return;
  for (const f of s.file) f.t -= dt;
  const prets = s.file.filter((f) => f.t <= 0);
  if (!prets.length) return;
  s.file = s.file.filter((f) => f.t > 0);
  for (const f of prets) {
    if (f.k === 'son') sonFlash(f.code);
    else if (f.k === 'bulle') bulle(s, f.pale);
    else if (f.k === 'coeur') { eclatCoeur(s, f.x, f.y, 8); sonFlash('RA4'); }
  }
}

/** Fait avancer tout ce qui est visuel (sans effet sur les règles). */
function majEffets(s, dt) {
  s.bump = Math.max(0, s.bump - dt);
  s.secousse = Math.max(0, s.secousse - dt);
  s.flash = Math.max(0, s.flash - dt);
  majFile(s, dt);
  majFX(s, dt);
}

export const JEU = {
  id: 'raclette',
  titre: 'Raclette',
  accroche: 'Du fromage oui, des cornichons non ! Chaque fromage rapporte 1 Paillette.',
  quip: 'Le fromage fond tranquillement.',
  aide: 'Souris, doigt ou flèches : déplace le poêlon. Attrape le fromage. 3 vies : chaque cornichon en coûte une !',
  aideBorne: '← → OU SOURIS : LE POÊLON',
  init: ({ reduit }) => ({
    reduit, lent: reduit ? 0.75 : 1, score: 0, vies: VIES, ecoule: 0, pousse: 0, x: W / 2, cible: W / 2, items: [], secousse: 0, flash: 0,
    bump: 0, fx: [], file: [], dernierePrise: -9, dernierGresil: -9,
  }),
  update(s, dt, e) {
    if (s.vies <= 0) { majEffets(s, dt); return; } // partie finie : les objets s'arrêtent, rien ne compte plus
    s.ecoule += dt;
    if (e.cible !== null) s.cible = borne(e.cible, DEMI, W - DEMI);
    if (e.fleche) s.cible = borne(s.cible + e.fleche * 300 * dt, DEMI, W - DEMI);
    s.x += (s.cible - s.x) * Math.min(1, dt * 14);
    s.pousse += dt;
    if (s.pousse >= Math.max(0.32, 0.75 - Math.min(s.ecoule, 36) * 0.012)) {
      s.pousse = 0;
      const corn = !s.triche?.coeurs && Math.random() < Math.min(0.35, 0.15 + Math.min(s.ecoule, 44) * 0.008);
      s.items.push({ corn, x: 18 + Math.random() * (W - 36), y: -16, v: (95 + Math.random() * 35) * s.lent * paliers(s.ecoule), a: Math.random() * 6 });
    }
    if (s.triche?.coeurs) s.items = s.items.filter((p) => !p.corn); // code « domu » : plus aucun cornichon
    for (const p of s.items) { p.y += p.v * dt; p.a += dt * 3; }
    s.items = s.items.filter((p) => {
      if (p.y >= SOL && p.y <= H - 22 && Math.abs(p.x - s.x) < DEMI) {
        if (p.corn) pique(s, p); else prise(s, p);
        return false;
      }
      if (p.y > H - 20) { sol(s, p); return false; }
      return true;
    });
    majEffets(s, dt);
  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 6 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    dessineFX(ctx, s);
    for (const p of s.items) {
      if (p.corn) cornichon(ctx, p.x, p.y);
      else if (s.triche?.coeurs) coeur(ctx, p.x, p.y + Math.sin(p.a) * 1.5, 13);
      else tranche(ctx, p.x, p.y, p.a);
    }
    poelon(ctx, s.x, H - 34, s.reduit ? 0 : s.bump);
    ctx.restore();
    if (s.flash > 0) { ctx.fillStyle = `rgba(224, 64, 75, ${s.flash})`; ctx.fillRect(0, 0, W, H); }
    dessineFX(ctx, s, true);
  },
  /** Emblème de l'écran commun : poêlon, tranche qui oscille et cornichon. T : temps en secondes. */
  embleme(ctx, x, y, T) {
    poelon(ctx, x, y + 10);
    tranche(ctx, x - 14, y - 34 + Math.sin(T * 3) * 4, T);
    cornichon(ctx, x + 38, y - 22 + Math.cos(T * 3) * 3);
  },
  /** Texte de fin de partie, repris par l'écran de fin commun. */
  finTexte: () => ({ t: 'Le poêlon est froid', d: 'Trop de cornichons, pas assez de fromage.' }),
  score: (s) => s.score,
  vies: (s) => ({ left: s.vies, max: VIES }),
  fini: (s) => s.vies <= 0,
  /* Le temps que le dernier cœur éclate (0,22 s de délai, 0,55 s d'éclats). */
  dureeFin: () => 0.9,
};
