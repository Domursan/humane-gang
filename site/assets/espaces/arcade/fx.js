// ===== Humane Gang — arcade : petits effets dessinés et sons des jeux flash (maquette validée en oct. 2026) =====
/**
 * Rôle : particules, étoiles, anneaux, rayons, textes qui montent et cœur qui éclate, dessinés dans le canevas des jeux.
 *   Les effets vivent dans l'état de la partie (s.fx). Le jeu appelle majFX(s, dt) dans update et dessineFX(ctx, s) dans
 *   draw (dessineFX(ctx, s, true) pour ceux à poser au-dessus de tout : textes, cœur du HUD).
 *   Avec s.reduit (mouvement réduit ou effets coupés), rien n'est créé, sauf les textes, qui informent le joueur.
 * Dépendances : ./arcade.js (etoile, coeur), ../../commun/sons-jeux.js (jouerSonJeu).
 * Exporte : sonFlash, poussiere, etoiles, flotte, onde, rayons, eclats, eclatCoeur, majFX, dessineFX.
 */
import { etoile, coeur } from './arcade.js';
import { jouerSonJeu } from '../../commun/sons-jeux.js';

const POLICE = '"Archivo Black", system-ui, sans-serif';

/**
 * Joue un son des jeux flash.
 * @param {string} code code de la maquette (SO1, PA1, TE5…)
 * @param {*} [x] réglage propre au son (CB3 : rangée de la carte)
 */
export const sonFlash = (code, x) => jouerSonJeu('flash', code, x);

/** Ajoute un effet à la partie. */
function ajoute(s, o) {
  if (s.reduit && !o.garde) return;
  (s.fx ||= []).push({ t: 0, vie: .6, vx: 0, vy: 0, g: 0, rot: 0, vr: 0, haut: false, ...o });
}

/** Éclats carrés autour d'un point. cols : couleurs ; v : vitesse ; g : gravité. */
export function poussiere(s, x, y, n, cols, v = 90, vie = .5, taille = 3, g = 220) {
  for (let i = 0; i < n; i += 1) {
    const a = (Math.PI * 2 * i) / n + Math.random(), sp = v * (.5 + Math.random() * .7);
    ajoute(s, { k: 'p', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - v * .35, g, c: cols[i % cols.length], s: taille, vie });
  }
}

/** Petites étoiles qui partent en cercle. */
export function etoiles(s, x, y, n, c, v = 80, vie = .6) {
  for (let i = 0; i < n; i += 1) {
    const a = (Math.PI * 2 * i) / n - 1;
    ajoute(s, { k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 120, c, s: 5 + Math.random() * 3, vie });
  }
}

/** Texte qui monte (« +1 », « Paf ! ») ; gardé sans mouvement, immobile. */
export function flotte(s, x, y, txt, c = '#FBD32D', taille = 18) {
  ajoute(s, { k: 'txt', garde: true, haut: true, x, y, vy: s.reduit ? 0 : -40, txt, c, taille, vie: .95 });
}

/** Anneau qui s'élargit. */
export function onde(s, x, y, r0, r1, c, vie = .4, lw = 2) { ajoute(s, { k: 'ring', x, y, r0, r1, c, vie, lw }); }

/** Rayons qui partent du centre. */
export function rayons(s, x, y, n, r0, r1, c, vie = .4) { ajoute(s, { k: 'ray', x, y, n, r0, r1, c, vie }); }

/** Morceaux rectangulaires qui tournent (carte cassée, confettis, fromage). */
export function eclats(s, x, y, n, cols, { v = 100, vie = .8, g = 420, w = 10, h = 10 } = {}) {
  for (let i = 0; i < n; i += 1) {
    ajoute(s, { k: 'rect', x: x + (Math.random() - .5) * 16, y: y + (Math.random() - .5) * 16, vx: (Math.random() - .5) * v * 2,
      vy: -Math.random() * v * 1.3, g, vr: (Math.random() - .5) * 16, rot: Math.random() * 6, w: w * (.7 + Math.random() * .6),
      h: h * (.7 + Math.random() * .6), c: cols[i % cols.length], vie });
  }
}

/** Cœur du HUD qui éclate en deux moitiés. */
export function eclatCoeur(s, x, y, r = 8) {
  onde(s, x, y, 3, 28, '#FF5A6A', .4, 2);
  poussiere(s, x, y, 9, ['#E0303F', '#FF5A6A', '#B0102A'], 90, .55, 3, 260);
  [-1, 1].forEach((cote) => ajoute(s, { k: 'demi', cote, haut: true, x, y, r, vx: cote * 50, vy: -90, g: 420, vr: cote * 4, c: '#E0303F', vie: .8 }));
}

/** Fait avancer les effets. */
export function majFX(s, dt) {
  if (!s.fx?.length) return;
  for (const f of s.fx) { f.t += dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += f.g * dt; f.rot += f.vr * dt; }
  s.fx = s.fx.filter((f) => f.t < f.vie);
}

/** Dessine les effets (haut = true : ceux posés au-dessus de tout). */
export function dessineFX(c, s, haut = false) {
  for (const f of s.fx || []) {
    if (f.haut !== haut) continue;
    const k = f.t / f.vie, e = 1 - (1 - k) ** 3;
    c.globalAlpha = Math.max(0, 1 - k * k);
    if (f.k === 'p') { c.fillStyle = f.c; c.fillRect(f.x - f.s / 2, f.y - f.s / 2, f.s, f.s); }
    else if (f.k === 'star') { c.fillStyle = f.c; etoile(c, f.x, f.y, f.s * (1 - k * .4)); c.fill(); }
    else if (f.k === 'txt') {
      c.font = `${f.taille}px ${POLICE}`; c.textAlign = 'center'; c.lineWidth = 4; c.strokeStyle = 'rgba(8,8,11,.85)';
      c.strokeText(f.txt, f.x, f.y); c.fillStyle = f.c; c.fillText(f.txt, f.x, f.y); c.textAlign = 'start';
    } else if (f.k === 'ring') {
      c.strokeStyle = f.c; c.lineWidth = f.lw; c.beginPath(); c.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * e, 0, 7); c.stroke();
    } else if (f.k === 'ray') {
      c.strokeStyle = f.c; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < f.n; i += 1) {
        const a = (Math.PI * 2 * i) / f.n, r0 = f.r0 + (f.r1 - f.r0) * e * .6, r1 = f.r0 + (f.r1 - f.r0) * e;
        c.moveTo(f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0); c.lineTo(f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1);
      }
      c.stroke();
    } else if (f.k === 'rect') {
      c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.fillStyle = f.c; c.fillRect(-f.w / 2, -f.h / 2, f.w, f.h); c.restore();
    } else if (f.k === 'demi') {
      c.save(); c.translate(f.x, f.y); c.rotate(f.rot); c.beginPath(); c.rect(f.cote < 0 ? -f.r * 2 : 0, -f.r * 2, f.r * 2, f.r * 4); c.clip();
      coeur(c, 0, 0, f.r, f.c); c.restore();
    }
    c.globalAlpha = 1;
  }
}
