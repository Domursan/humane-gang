// ===== Humane Gang — arcade : « Paillettes » (le jeu de la page 404, sur le moteur commun) =====
/*
 * Rôle : des paillettes tombent ; le chapeau du gang les attrape. 1 point par paillette, rien si on en rate une.
 * Dans l'arcade, chaque prise rapporte aussi 1 Paillette (règle gérée par le serveur, migration 182 : rien à coder ici).
 * Trois vies (cœurs). Pièges : la « fausse paillette » (étoile violet sombre à huit pointes acérées, contour et cœur rouges) et, à partir
 * de 30 s, le « grêlon » (cristal bleu pâle hexagonal, plus rapide). Attraper un piège coûte une vie.
 * La partie finit à zéro vie ; pas de limite de temps. La vitesse de chute monte par paliers de 10 s (+7 %), sans plafond :
 * la partie finit par devenir injouable. Les pièges plafonnent (PLAFOND, 25 % des chutes) ; cadence des paillettes : au plus une
 * toutes les 0,3 s (3,3 par seconde, sous le plafond serveur de 6 points par seconde).
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = plus de pièges et paillettes en cœurs ; immortel = pièges sans effet.
 * Effets (maquette flash, fx.js) : éclat doré et chapeau écrasé à la prise, pièges brisés, cœur qui éclate, poussière au sol ;
 * sons PA1 à PA6 (PA6 à chaque palier de vitesse). Le cœur éclate 0,22 s après le piège, tout de suite si c'était le dernier.
 * Moteur : eggs/arcade.js (creeArcade). Animation réduite : chute plus lente, pas d'étincelles ni de secousse ; sons et textes gardés.
 * Écrans communs : titre, accroche, quip, aide, embleme (chapeau et paillettes), finTexte.
 * Sert aussi à la page /404.html (jeu404.js).
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, paillette, coeur } from './arcade.js';
import { sonFlash, poussiere, etoiles, flotte, onde, eclatCoeur, majFX, dessineFX } from './fx.js';

const VIES = 3, SOL = H - 52, DEMI = 36;
/** Durée de l'écrasement du chapeau à la prise, et délai entre le piège et le cœur qui éclate (secondes). */
const ECRASE = 0.18, DELAI_COEUR = 0.22;
/** Au-delà de cette seconde, les pièges ne deviennent plus fréquents (la vitesse, elle, continue de monter). */
const PLAFOND = 60;
/** Accélération : +7 % de vitesse toutes les 10 s, sans plafond. */
const HAUSSE = 0.07, PALIER_S = 10;
const paliers = (t) => (1 + HAUSSE) ** Math.floor(t / PALIER_S);
const OR = '#FBD32D', OR_CLAIR = '#FFF1BE', COURONNE = '#9E3543', BANDE = '#E2C77E', BORD = '#F2EFEA';
const VIOLET = '#4A2070', ROUGE = '#FF5A6A', GLACE = '#CFEAF7', GLACE_FONCE = '#5FA8D3';
const borne = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Fausse paillette : étoile violet sombre à huit pointes acérées, contour et cœur rouges (forme et couleur bien différentes de l'or).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} r rayon des pointes
 */
function fausse(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * i) / 8 - Math.PI / 2, k = i % 2 ? 0.55 : 1;
    ctx.lineTo(x + Math.cos(a) * r * k, y + Math.sin(a) * r * k);
  }
  ctx.closePath();
  ctx.fillStyle = VIOLET; ctx.fill();
  ctx.strokeStyle = ROUGE; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = ROUGE; ctx.beginPath(); ctx.arc(x, y, r * 0.3, 0, Math.PI * 2); ctx.fill();
}

/**
 * Grêlon : cristal hexagonal bleu pâle, bordure bleue et reflet blanc (forme géométrique, pas une étoile).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} r rayon
 */
function greleon(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI * i) / 3;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fillStyle = GLACE; ctx.fill();
  ctx.strokeStyle = GLACE_FONCE; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.3); ctx.lineTo(x - r * 0.1, y - r * 0.6); ctx.stroke();
}

/**
 * Chapeau du gang, écrasé selon sq (de 0 à ECRASE), posé sur le bas du canevas.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} [sq] écrasement restant
 */
function chapeau(ctx, x, sq = 0) {
  const y = H - 30, k = Math.min(1, sq / ECRASE);
  ctx.save();
  ctx.translate(x, H - 6); ctx.scale(1 + 0.18 * k, 1 - 0.22 * k); ctx.translate(-x, -(H - 6));
  ctx.fillStyle = COURONNE; ctx.fillRect(x - 18, y - 24, 36, 20);
  ctx.fillStyle = BANDE; ctx.fillRect(x - 18, y - 8, 36, 4);
  ctx.fillStyle = BORD; ctx.beginPath(); ctx.ellipse(x, y - 2, 34, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Le cœur n° k du HUD éclate (les vies sont affichées en haut à droite). */
function coeurEclate(s, k) {
  eclatCoeur(s, W - 14 - (VIES - 1 - k) * 18, 15, 8);
  sonFlash('PA5');
}

/** Perte d'une vie : flash rouge, secousse (sauf animation réduite), puis cœur qui éclate. */
function perdUneVie(s) {
  s.vies--;
  s.flash = 0.35;
  if (!s.reduit) s.secousse = 0.3;
  s.coeurs.push({ dans: DELAI_COEUR, k: s.vies });
  if (s.vies <= 0) { for (const c of s.coeurs) coeurEclate(s, c.k); s.coeurs.length = 0; } // le moteur s'arrête à cette image
}

/** Paillette attrapée : le chapeau s'écrase, éclat doré et « +1 ». */
function prise(s, p) {
  if (!s.reduit) s.sq = ECRASE;
  poussiere(s, p.x, p.y, 7, [OR, OR_CLAIR], 95, 0.5, 3);
  etoiles(s, p.x, p.y - 4, 3, OR_CLAIR, 70, 0.5);
  onde(s, p.x, p.y, 4, 22, OR, 0.35, 2);
  flotte(s, p.x, p.y - 26, '+1', OR);
  sonFlash('PA1');
}

/** Piège attrapé : il se brise ; avec le code immortel, pas de texte et aucune vie perdue. */
function piege(s, p) {
  const glace = p.piege === 'grele';
  poussiere(s, p.x, p.y, 10, glace ? [GLACE, GLACE_FONCE, '#FFFFFF'] : [VIOLET, ROUGE, '#8A4FD0'], 110, 0.55, 4);
  onde(s, p.x, p.y, 4, 30, glace ? GLACE_FONCE : ROUGE, 0.35, 2);
  sonFlash(glace ? 'PA4' : 'PA3');
  if (s.triche?.immortel) return;
  flotte(s, p.x, p.y - 26, glace ? 'Brrr !' : 'Piégé !', glace ? GLACE : ROUGE, 16);
  perdUneVie(s);
}

/** Chute au sol : poussière, et un son seulement pour une vraie paillette. */
function sol(s, p) {
  poussiere(s, p.x, H - 16, 5, [p.piege ? '#7a6a9a' : OR, '#9a7a20'], 45, 0.4, 2, 140);
  onde(s, p.x, H - 14, 2, 14, 'rgba(251,211,45,.6)', 0.3, 1);
  if (!p.piege) sonFlash('PA2');
}

export const JEU = {
  id: 'paillettes',
  titre: 'Paillettes',
  accroche: 'Le chapeau a soif : chaque prise vaut 1 Paillette.',
  quip: 'Le chapeau fait une pause café.',
  aide: 'Souris, doigt ou flèches gauche et droite : déplace le chapeau pour attraper les paillettes. 3 vies : évite les pièges (fausses paillettes violettes, grêlons).',
  aideBorne: '← → OU SOURIS : BOUGER',
  init: ({ reduit }) => ({ reduit, lent: reduit ? 0.75 : 1, score: 0, vies: VIES, ecoule: 0, pousse: 0, x: W / 2, cible: W / 2, items: [], fx: [], flash: 0, secousse: 0, sq: 0, coeurs: [], palier: 0 }),
  update(s, dt, e) {
    s.ecoule += dt;
    const palier = Math.floor(s.ecoule / PALIER_S);
    if (palier > s.palier) { s.palier = palier; sonFlash('PA6'); }
    if (e.cible !== null) s.cible = borne(e.cible, DEMI - 4, W - DEMI + 4);
    if (e.fleche) s.cible = borne(s.cible + e.fleche * 280 * dt, DEMI - 4, W - DEMI + 4);
    s.x += (s.cible - s.x) * Math.min(1, dt * 14);
    const t = Math.min(s.ecoule, PLAFOND);
    s.pousse += dt;
    if (s.pousse >= Math.max(0.3, 0.7 - Math.min(s.ecoule, 40) * 0.01)) {
      s.pousse = 0;
      // Pièges : 8 % au début, 25 % au plafond (atteint vers 57 s). Le grêlon apparaît après 30 s.
      const piege = !s.triche?.coeurs && Math.random() < Math.min(0.25, 0.08 + t * 0.003);
      const type = !piege ? null : (t >= 30 && Math.random() < 0.4 ? 'grele' : 'fausse');
      s.items.push({
        x: 14 + Math.random() * (W - 28), y: -14,
        v: (90 + Math.random() * 30) * s.lent * paliers(s.ecoule) * (type === 'grele' ? 1.5 : 1),
        r: type === 'fausse' ? 10 + Math.random() * 3 : 7 + Math.random() * 5,
        t: Math.random() * 6, piege: type,
      });
    }
    if (s.triche?.coeurs) s.items = s.items.filter((p) => !p.piege); // code « domu » : plus aucun piège
    for (const p of s.items) { p.y += p.v * dt; p.t += dt; }
    s.items = s.items.filter((p) => {
      if (p.y >= SOL && p.y <= H - 24 && Math.abs(p.x - s.x) < DEMI) {
        if (p.piege) piege(s, p);
        else { s.score++; prise(s, p); }
        return false;
      }
      if (p.y > H - 20) { sol(s, p); return false; }
      return true;
    });
    if (s.coeurs.length) {
      for (const c of s.coeurs) { c.dans -= dt; if (c.dans <= 0) coeurEclate(s, c.k); }
      s.coeurs = s.coeurs.filter((c) => c.dans > 0);
    }
    majFX(s, dt);
    s.sq = Math.max(0, s.sq - dt);
    s.secousse = Math.max(0, s.secousse - dt);
    s.flash = Math.max(0, s.flash - dt);
  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    for (const p of s.items) {
      if (p.piege === 'fausse') fausse(ctx, p.x, p.y, p.r);
      else if (p.piege === 'grele') greleon(ctx, p.x, p.y, p.r);
      else if (s.triche?.coeurs) coeur(ctx, p.x, p.y, p.r * (0.9 + 0.1 * Math.sin(p.t * 6)));
      else paillette(ctx, p.x, p.y, p.r * (0.85 + 0.15 * Math.sin(p.t * 6)), OR);
    }
    chapeau(ctx, s.x, s.sq);
    dessineFX(ctx, s);
    ctx.restore();
    if (s.flash > 0) { ctx.fillStyle = `rgba(224, 64, 75, ${s.flash})`; ctx.fillRect(0, 0, W, H); }
    dessineFX(ctx, s, true);
  },
  /** Emblème de l'écran commun : le chapeau et trois paillettes. T : temps en secondes. */
  embleme(ctx, x, y, T) {
    ctx.save(); ctx.translate(0, y - (H - 30) + 18); chapeau(ctx, x); ctx.restore();
    paillette(ctx, x - 34, y - 26 + Math.sin(T * 3) * 4, 9, OR);
    paillette(ctx, x + 30, y - 40 + Math.cos(T * 3) * 4, 12, OR);
    paillette(ctx, x + 4, y - 14, 6, OR_CLAIR);
  },
  /** Texte de fin de partie, repris par l'écran de fin commun. */
  finTexte: () => ({ t: 'Plus un seul cœur !', d: 'Le chapeau est vide, et un peu vexé.' }),
  score: (s) => s.score,
  vies: (s) => ({ left: s.vies, max: VIES }),
  fini: (s) => s.vies <= 0,
};
