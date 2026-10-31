// ===== Humane Gang — arcade : « Domu-mobile » =====
/*
 * Rôle : la voiture avance seule sur trois voies ; on change de voie pour éviter les bouchons et attraper les jerricans.
 * La vitesse monte par paliers de 10 s (+7 %), sans plafond : la route finit par devenir injouable. Score : 1 point par seconde
 * de route + 3 par jerrican. Premier accrochage : « T’es en retard ! », fin de partie. Pas de limite de temps.
 * Plafond serveur : 8 points par seconde ; ici, au plus 1 + 3 × 2,2 = 7,7 par seconde (un jerrican au plus toutes les 0,45 s).
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = plus de bouchons, jerricans et voiture en cœurs ; immortel = bouchons traversés.
 * Effets (maquette jDomu, fx.js) : dérapage au changement de voie (poussière, voiture qui s’incline), « +3 » doré et anneau au
 * jerrican, « BIP ! » du klaxon quand un bouchon entre sur la route, accrochage (éclair, étoiles, fumée, voiture qui tourne),
 * traits de vitesse et « VITESSE +7 % » à chaque palier. Le moteur (DO3) ne sonne qu’une fois, au départ.
 * L’accrochage finit la partie aussitôt ; l’explosion se joue ensuite pendant dureeFin, route arrêtée.
 * Moteur : eggs/arcade.js (creeArcade ; jeu « à voies » : flèche, appui à gauche ou à droite, glisser).
 * Animation réduite : route plus lente, pas de secousse, pas de dérapage, pas de traits ni d’anneau (sons et textes gardés).
 * Écrans communs : titre, accroche, quip, aide, embleme et finTexte (le bandeau de fin est dessiné par l’écran commun).
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, coeur } from './arcade.js';
import { sonFlash, poussiere, etoiles, flotte, onde, rayons, majFX, dessineFX } from './fx.js';

const VOIES = 3, LV = W / VOIES, CY = H - 70;
/** Accélération : +7 % de vitesse toutes les 10 s, sans plafond. */
const HAUSSE = 0.07, PALIER_S = 10;
const paliers = (t) => (1 + HAUSSE) ** Math.floor(t / PALIER_S);
/** Intervalle entre deux rangées : plancher atteint vers 81 s (cadence des jerricans et bouchons). */
const PLAFOND_RYTHME = 81;
/** Le klaxon d’un bouchon sonne quand il entre dans la partie haute de la route. */
const ENTREE_KLAXON = CY - 170;
const ROUTE = '#26262A', LIGNE = '#E2C77E', VOITURE = '#9E3543', VITRE = '#7E93C9', BOUCHON = ['#5A5A62', '#7A4F8F', '#4F6A8F'], JERRY = '#CF7055';
const OR = '#FBD32D', BORD = '#F2EFEA', FUMEE = ['#6a6a72', '#3c3c44'];
const TITRE = '"Archivo Black", system-ui, sans-serif', PIX = '"Silkscreen", ui-monospace, monospace';
const xVoie = (v) => LV * v + LV / 2;
/** Mouvement réduit demandé par le système (pour l’emblème, qui n’a pas l’état du jeu). */
const doux = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Voiture centrée en (x, y) ; l’appelant applique la rotation. */
function voiture(c, x, y) {
  c.fillStyle = VOITURE; c.fillRect(x - 20, y - 32, 40, 64);
  c.fillStyle = VITRE; c.fillRect(x - 14, y - 22, 28, 14);
  c.fillStyle = OR; c.fillRect(x - 18, y - 34, 8, 4); c.fillRect(x + 10, y - 34, 8, 4);
  c.fillStyle = '#121212'; c.fillRect(x - 24, y - 24, 4, 14); c.fillRect(x + 20, y - 24, 4, 14);
  c.fillRect(x - 24, y + 12, 4, 14); c.fillRect(x + 20, y + 12, 4, 14);
}

/** Jerrican centré en (x, y). */
function dessineJerrican(c, x, y) {
  c.fillStyle = JERRY; c.fillRect(x - 10, y - 13, 20, 26);
  c.fillStyle = BORD; c.fillRect(x - 6, y - 17, 8, 5); c.fillRect(x - 6, y - 4, 12, 3);
}

/** Bouchon (autre véhicule) centré en (x, y). */
function dessineBouchon(c, x, y, col) {
  c.fillStyle = col; c.fillRect(x - 22, y - 30, 44, 60);
  c.fillStyle = '#121212'; c.fillRect(x - 16, y + 12, 32, 10);
  c.fillStyle = '#E0909A'; c.fillRect(x - 20, y + 24, 8, 4); c.fillRect(x + 12, y + 24, 8, 4);
}

/** Jerrican ramassé : « +3 » doré, éclats, étoiles et anneau. Le score est calculé par le jeu (jerry × 3). */
function prendJerrican(s) {
  s.glow = s.T;
  sonFlash('DO2');
  poussiere(s, s.x, CY - 10, 8, [OR, '#FFF1BE', JERRY], 100, 0.5, 3);
  etoiles(s, s.x, CY - 24, 4, OR, 80, 0.5);
  onde(s, s.x, CY, 10, 50, OR, 0.4, 3);
  flotte(s, s.x, CY - 56, '+3', OR, 24);
}

/** Accrochage : éclair blanc, étoiles, rayons, fumée qui monte, voiture qui tourne. */
function accroche(s) {
  if (s.crash) return;
  s.crash = true;
  s.secousse = s.reduit ? 0 : 0.35;
  s.flash = s.reduit ? 0 : 0.28;
  s.ang = s.reduit ? 0 : 0.55;
  sonFlash('DO5');
  const x = s.x, y = CY - 36;
  etoiles(s, x, y, 8, OR, 150, 0.6);
  rayons(s, x, y, 10, 10, 50, '#fff', 0.35);
  onde(s, x, y, 6, 70, '#fff', 0.35, 3);
  poussiere(s, x, y, 14, [VOITURE, '#121212', '#9a98a5'], 150, 0.7, 4, 300);
  poussiere(s, x, y, 16, FUMEE, 60, 0.9, 6, -10);
}

export const JEU = {
  id: 'domu',
  titre: 'Domu-mobile',
  accroche: 'Pied au plancher, la route est longue',
  quip: 'La Domu-mobile ronronne au point mort.',
  aide: 'Flèches, appui à gauche ou à droite, ou glisse le doigt : change de voie. Évite les bouchons, attrape les jerricans !',
  aideBorne: '← → OU GLISSE : CHANGER DE VOIE',
  voies: true,
  init: ({ reduit }) => ({
    reduit, lent: reduit ? 0.7 : 1, ecoule: 0, jerry: 0, voie: 1, x: xVoie(1), items: [], pousse: 0.6, defile: 0,
    crash: false, secousse: 0, flash: 0, ang: 0, glow: -9, T: 0, moteur: false, palierN: 0, palierT: -9,
  }),
  update(s, dt, e) {
    s.T += dt;
    majFX(s, dt);
    if (!s.moteur) { s.moteur = true; sonFlash('DO3'); } // moteur : un seul son, au départ
    if (s.crash) { s.secousse = Math.max(0, s.secousse - dt); s.flash = Math.max(0, s.flash - dt); return; }
    s.ecoule += dt;
    const avant = s.voie;
    if (e.pas) s.voie = Math.min(VOIES - 1, Math.max(0, s.voie + e.pas));
    if (s.voie !== avant) { sonFlash('DO1'); poussiere(s, s.x, CY + 40, 5, ['#9a98a5', '#fff'], 40, 0.4, 3, 20); }
    s.x += (xVoie(s.voie) - s.x) * Math.min(1, dt * 16);
    s.ang += ((s.reduit ? 0 : (xVoie(s.voie) - s.x) * 0.004) - s.ang) * Math.min(1, dt * 12);
    const v = 170 * s.lent * paliers(s.ecoule);
    s.defile = (s.defile + v * dt) % 40;
    const palier = Math.floor(s.ecoule / PALIER_S);
    if (palier > s.palierN) { s.palierN = palier; s.palierT = s.T; sonFlash('DO6'); }
    s.pousse -= dt;
    if (s.pousse <= 0) {
      s.pousse = Math.max(0.45, 1.1 - Math.min(s.ecoule, PLAFOND_RYTHME) * 0.008);
      const libre = Math.floor(Math.random() * VOIES);
      for (let i = 0; i < VOIES; i++) {
        if (i === libre) { if (Math.random() < 0.5) s.items.push({ j: true, voie: i, y: -20 }); continue; }
        if (!s.triche?.coeurs && Math.random() < 0.45) s.items.push({ j: false, voie: i, y: -30, c: BOUCHON[Math.floor(Math.random() * BOUCHON.length)] });
      }
    }
    if (s.triche?.coeurs) s.items = s.items.filter((it) => it.j); // code « domu » : plus aucun bouchon
    for (const it of s.items) it.y += v * dt;
    for (const it of s.items) if (!it.j && it.klaxon === undefined && it.y >= ENTREE_KLAXON) { it.klaxon = s.T; sonFlash('DO4'); }
    s.items = s.items.filter((it) => {
      const touche = Math.abs(xVoie(it.voie) - s.x) < LV * 0.45 && Math.abs(it.y - CY) < (it.j ? 26 : 38);
      if (touche && it.j) { s.jerry++; prendJerrican(s); return false; }
      if (touche && !it.j) { if (s.triche?.immortel) return false; accroche(s); }
      return it.y < H + 40;
    });
  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    ctx.fillStyle = ROUTE; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = LIGNE;
    for (let i = 1; i < VOIES; i++) for (let y = -40 + s.defile; y < H; y += 40) ctx.fillRect(LV * i - 2, y, 4, 20);
    // Traits de vitesse pendant 0,9 s après chaque palier (animation : absents en mouvement réduit).
    const k = (s.T - s.palierT) / 0.9;
    if (!s.reduit && k >= 0 && k < 1) {
      ctx.globalAlpha = (1 - k) * 0.55; ctx.fillStyle = '#fff';
      for (let j = 0; j < 14; j++) ctx.fillRect((j * 71 + 13) % W, ((s.T * 900 + j * 97) % (H + 120)) - 60, 2, 46);
      ctx.globalAlpha = 1;
    }
    for (const it of s.items) {
      let x = xVoie(it.voie);
      const sonne = it.klaxon !== undefined;
      if (!s.reduit && sonne && s.T - it.klaxon < 0.6) x += Math.sin(s.T * 60) * 2;
      if (it.j && s.triche?.coeurs) coeur(ctx, x, it.y, 13);
      else if (it.j) dessineJerrican(ctx, x, it.y);
      else dessineBouchon(ctx, x, it.y, it.c);
      if (sonne && s.T - it.klaxon < 0.8) {
        const t = s.T - it.klaxon;
        ctx.globalAlpha = Math.max(0, 1 - t / 0.8);
        if (!s.reduit) {
          ctx.strokeStyle = OR; ctx.lineWidth = 3;
          for (let n = 0; n < 3; n++) { ctx.beginPath(); ctx.arc(x, it.y - 6, 40 + n * 12 + t * 30, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke(); }
        }
        ctx.font = `16px ${TITRE}`; ctx.textAlign = 'center';
        ctx.strokeStyle = '#08080B'; ctx.lineWidth = 4; ctx.strokeText('BIP !', x, it.y - 56);
        ctx.fillStyle = OR; ctx.fillText('BIP !', x, it.y - 56);
        ctx.textAlign = 'start'; ctx.globalAlpha = 1;
      }
    }
    // Lueur dorée autour de la voiture après un jerrican (0,3 s), traces sombres pendant un changement de voie.
    const g = s.T - s.glow;
    if (!s.reduit && g >= 0 && g < 0.3) { ctx.globalAlpha = (1 - g / 0.3) * 0.8; ctx.strokeStyle = OR; ctx.lineWidth = 3; ctx.strokeRect(s.x - 26, CY - 38, 52, 76); ctx.globalAlpha = 1; }
    if (!s.reduit && Math.abs(s.x - xVoie(s.voie)) > 8) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(s.x - 24, CY + 28, 4, 30); ctx.fillRect(s.x + 20, CY + 28, 4, 30); }
    // Domu-mobile (en cœur rouge avec le code « domu »), inclinée pendant le dérapage.
    if (s.triche?.coeurs) coeur(ctx, s.x, CY, 30);
    else { ctx.save(); ctx.translate(s.x, CY); ctx.rotate(s.ang); voiture(ctx, 0, 0); ctx.restore(); }
    dessineFX(ctx, s);
    if (s.flash > 0) { ctx.globalAlpha = (s.flash / 0.28) * 0.6; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    dessineFX(ctx, s, true);
    // « VITESSE +7 % » pendant 1,2 s après un palier (le texte reste en mouvement réduit, sans fondu).
    const v = s.T - s.palierT;
    if (v < 1.2) {
      ctx.globalAlpha = s.reduit ? 1 : Math.min(1, (1.2 - v) * 2);
      ctx.font = `16px ${PIX}`; ctx.textAlign = 'center';
      ctx.strokeStyle = '#08080B'; ctx.lineWidth = 4; ctx.strokeText('VITESSE +7 %', W / 2, 86);
      ctx.fillStyle = OR; ctx.fillText('VITESSE +7 %', W / 2, 86);
      ctx.textAlign = 'start'; ctx.globalAlpha = 1;
    }
    ctx.restore();
  },
  /** Emblème des écrans communs (le même dessin que la maquette). */
  embleme(c, x, y, T) {
    const calme = doux();
    c.save();
    c.fillStyle = LIGNE;
    c.fillRect(x - 54, y - 40, 4, 20);
    c.fillRect(x + 50, y - 40 + (calme ? 0 : (T * 40) % 20), 4, 20);
    dessineJerrican(c, x + 30, y - 30);
    voiture(c, x, y + 4 + Math.sin(T * 6) * 1.5);
    c.restore();
  },
  /** Texte de l’écran de fin commun. */
  finTexte: () => ({ t: 'T’es en retard !', d: 'Le bouchon a gagné cette course.' }),
  score: (s) => Math.floor(s.ecoule) + s.jerry * 3,
  /* Pas de vies : la partie finit au premier accrochage. */
  vies: () => null,
  fini: (s) => s.crash,
  /* Le temps que la fumée de l’accrochage se dissipe. */
  dureeFin: () => 0.9,
};
