// ===== Humane Gang — petit moteur d'arcade (canevas) =====
/*
 * Rôle : boucle, entrées et cycle de vie communs aux mini-jeux de l'arcade (idée J18) : canevas net sur écran haute
 * densité, une image par rafraîchissement, commandes (souris, doigt, glisser, flèches), pause automatique quand
 * l'onglet est masqué, « réduire les animations » ou « Effets » coupés (s.reduit : jeu plus lent, pas de secousse, pas de compte), fin de partie.
 * Écrans communs à tous les mini-jeux, dessinés dans le canevas (maquette des jeux flash, scènes SOa à SOe, sons SO1 à SO7) :
 * départ (titre arc-en-ciel, accroche, emblème, record, aide), compte 3-2-1 puis GO, pause (reprendre, quitter), « On reprend ! »,
 * fin (score, record, tampon « Nouveau record » et confettis). canvas.dataset.ecran dit lequel est affiché ('depart' | 'compte' |
 * 'jeu' | 'pause' | 'fin'). Une boucle d'animation les fait vivre hors partie ; elle s'arrête quand la borne n'est plus visible,
 * et sur l'écran de fin dès que plus rien n'y bouge.
 * Fin de partie : jeu.fini(s) devient vrai à l'instant de la mort, onFin part aussitôt (le score ne se perd pas si le joueur quitte) ;
 * le jeu joue ensuite ses derniers effets pendant jeu.dureeFin(s) secondes, sans entrées, avant l'écran de fin (ignoré avec s.reduit).
 * Après 50 minutes, l'écran de pause prévient qu'une partie dure 1 h au plus (au-delà, le serveur la refuse).
 * Les règles de chaque mini-jeu sont dans eggs/jeu-paillettes.js, eggs/jeu-raclette.js, eggs/jeu-domu.js.
 * Pas de limite de temps : une partie finit quand le jeu le dit (plus de vies, ou accrochage).
 * Codes de triche cachés (pour toute la page, jusqu'au rechargement ; retaper le code l'annule), à taper sur la borne :
 *   « domu » (lettres)                    → s.triche.coeurs : plus aucun piège, tout ce qui s'attrape devient un cœur rouge ;
 *   → → ← ← ↓ ↑ ↓ ↑ (flèches)            → s.triche.immortel : les pièges et accrochages ne coûtent plus rien.
 *   Pendant une partie d'un jeu qui utilise haut et bas (jeu.directions ou jeu.action), flèches et glissements servent
 *   au jeu et ne comptent pas pour les codes (ailleurs, ils comptent) ;
 *   « domu » peut se taper à tout moment.
 *   Chaque mini-jeu lit s.triche (même objet pendant toute la partie : un code tapé en jeu s'applique tout de suite).
 *   Une partie jouée avec un code compte comme les autres (record, classement, Paillettes).
 * Dépendances : ../../commun/paillettes.js, ../../commun/core/effects.js (motionAllowed), ./fx.js (sons et effets).
 * Exporte : W, H (taille logique du canevas), creeArcade(options), etoile(ctx, x, y, r), paillette(ctx, x, y, r, couleur) et coeur(ctx, x, y, r, couleur)
 * (sprites partagés), triche (état des codes).
 */

import { paillettesEmoji } from '../../commun/paillettes.js';
import { motionAllowed } from '../../commun/core/effects.js';
import { sonFlash, majFX, dessineFX } from './fx.js';

/** Taille logique du canevas (pixels CSS) ; la taille réelle suit la densité de l'écran. */
export const W = 360, H = 420;

/**
 * Trace une étoile à quatre branches (la paillette du site).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} r rayon
 */
export function etoile(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.closePath();
}

/**
 * Dessine une Paillette d'or centrée en (x, y) : l'étoile, ou l'emoji du thème affiché (paillette_emoji, ex. 🧀 pour
 * Raclette) à la même place et à peu près à la même taille. Le remplissage couleur ne sert qu'à l'étoile.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} r rayon de l'étoile
 * @param {string} couleur couleur de remplissage de l'étoile
 */
export function paillette(ctx, x, y, r, couleur) {
  const em = paillettesEmoji();
  if (em) {
    ctx.save();
    ctx.font = `${Math.round(r * 2.3)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(em, x, y);
    ctx.restore();
    return;
  }
  ctx.fillStyle = couleur;
  etoile(ctx, x, y, r);
  ctx.fill();
}

/**
 * Trace un cœur plein (le cœur du gang), centré en (x, y).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} r demi-largeur
 * @param {string} [couleur]
 */
export function coeur(ctx, x, y, r, couleur = '#E0303F') {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.95);
  ctx.bezierCurveTo(x - r * 1.35, y + r * 0.05, x - r * 0.95, y - r * 1.05, x, y - r * 0.4);
  ctx.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.35, y + r * 0.05, x, y + r * 0.95);
  ctx.closePath();
  ctx.fillStyle = couleur; ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.42, y - r * 0.35, r * 0.18, r * 0.12, -0.6, 0, Math.PI * 2); ctx.fill();
}

/** Codes de triche actifs (partagés par toutes les bornes de la page). */
export const triche = { coeurs: false, immortel: false };
const CODES = [
  { cle: 'coeurs', suite: ['d', 'o', 'm', 'u'], nom: 'Mode Domu' },
  { cle: 'immortel', suite: ['ArrowRight', 'ArrowRight', 'ArrowLeft', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp'], nom: 'Immortel' },
];

/* ---------- Écrans communs (départ, compte, pause, fin) ---------- */
const TITRE = '"Archivo Black", system-ui, sans-serif', PIX = '"Silkscreen", ui-monospace, monospace', CORPS = 'Inter, system-ui, sans-serif';
const LOGO = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
const OR = '#FBD32D', SABLE = '#E2C77E', BORD = '#F2EFEA', GRIS = '#8d8b99', NOIR = '#08080B', COUR = '#9E3543';
const nf = new Intl.NumberFormat('fr-CH');
/** Durées du compte (secondes) : un chiffre, puis GO jusqu'au départ réel. */
const PAS_COMPTE = 0.8, FIN_COMPTE = 3.1;
/** Temps laissé au dernier effet d'un jeu sans dureeFin avant l'écran de fin, moment du tampon « Nouveau record », durée de « On reprend ! » (secondes). */
const DELAI_FIN = 0.6, T_RECORD = 1.1, DUREE_REPRISE = 0.6;
/** Écran de fin sourd au clavier et aux clics : après la fin de partie, puis après son ouverture (secondes). */
const GARDE_FIN = 1.1, GARDE_OUVERTURE = 0.5;
/** Passé ce temps, l'animation de l'écran de fin (carte, score, tampon) est terminée (secondes). */
const FIN_ANIMEE = 1.5;
/** Temps de partie à partir duquel l'écran de pause rappelle la limite du serveur (millisecondes). */
const RAPPEL_PAUSE = 50 * 60 * 1000;
/** Entrées vides : ce que voit le jeu pendant ses derniers effets. */
const SANS_ENTREE = Object.freeze({ cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, glisse: false, action: false, tenu: false });
/** Boutons dessinés (coordonnées du canevas). */
const B_REPRENDRE = { x: 60, y: 284, w: 240, h: 38 }, B_QUITTER = { x: 60, y: 336, w: 240, h: 32 };
const B_REJOUER = { x: 46, y: 318, w: 124, h: 32 }, B_REJOUER_SEUL = { x: 46, y: 318, w: 268, h: 32 }, B_AUTRES = { x: 190, y: 318, w: 124, h: 32 };
/** Vrai si (x, y) tombe sur le bouton, avec une marge pour le doigt (sans toucher son voisin). */
const surBouton = (b, x, y) => x >= b.x - 6 && x <= b.x + b.w + 6 && y >= b.y - 6 && y <= b.y + b.h + 6;

const borne01 = (k) => Math.min(1, Math.max(0, k));
const ease = (k) => 1 - (1 - borne01(k)) ** 3;
/** Arrivée avec un léger dépassement. */
const rebond = (k) => { const c = 1.70158, u = borne01(k) - 1; return 1 + (c + 1) * u ** 3 + c * u ** 2; };

/** Écrit un texte centré, avec une ombre franche si `ombre` est donnée. */
function texte(c, s, x, y, police, col, ombre) {
  c.font = police; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  if (ombre) { c.fillStyle = ombre; c.fillText(s, x + 2, y + 2); }
  c.fillStyle = col; c.fillText(s, x, y); c.textAlign = 'start';
}

/** Coupe un texte en lignes de largeur max (police déjà choisie). */
function coupe(c, s, max) {
  const lignes = [];
  let l = '';
  for (const mot of s.split(' ')) {
    const essai = l ? `${l} ${mot}` : mot;
    if (l && c.measureText(essai).width > max) { lignes.push(l); l = mot; } else l = essai;
  }
  if (l) lignes.push(l);
  return lignes;
}

/** Texte centré sur deux lignes au plus : la police rétrécit (jusqu'à 8 px), puis le surplus est coupé. */
function texteLong(c, s, y, taille, famille, col, interligne) {
  let z = taille, lignes = [];
  for (;;) {
    c.font = `${z}px ${famille}`;
    lignes = coupe(c, s, W - 32);
    if (lignes.length <= 2 || z <= 8) break;
    z -= 1;
  }
  if (lignes.length > 2) { lignes = lignes.slice(0, 2); lignes[1] += '…'; }
  lignes.forEach((l, i) => texte(c, l, W / 2, y + i * interligne, `${z}px ${famille}`, col));
}

/** Texte sur une ligne, réduit pour tenir dans la carte de fin. */
function texteAjuste(c, s, y, taille, min, famille, col, ombre) {
  c.font = `${taille}px ${famille}`;
  while (c.measureText(s).width > 270 && taille > min) { taille -= 1; c.font = `${taille}px ${famille}`; }
  texte(c, s, W / 2, y, `${taille}px ${famille}`, col, ombre);
}

/** Titre du jeu, une lettre par couleur du logo, qui ondule. */
function titreLettres(c, titre, y, T, doux) {
  let taille = 38;
  c.font = `${taille}px ${TITRE}`;
  while (c.measureText(titre).width > 320 && taille > 18) { taille -= 2; c.font = `${taille}px ${TITRE}`; }
  let x = (W - c.measureText(titre).width) / 2, j = 0;
  c.textAlign = 'start'; c.textBaseline = 'alphabetic';
  [...titre].forEach((ch, i) => {
    const dy = doux ? 0 : Math.sin(T * 4 + i * 0.55) * 3;
    if (ch !== ' ') {
      c.fillStyle = NOIR; c.fillText(ch, x + 3, y + dy + 3);
      c.fillStyle = ch === '-' ? BORD : LOGO[j % 6]; c.fillText(ch, x, y + dy);
      if (ch !== '-') j += 1;
    }
    x += c.measureText(ch).width;
  });
}

/** Bouton en pixel art (dessiné : le clic est lu par surBouton). */
function boutonPixel(c, { x, y, w, h }, label, plein, col = SABLE) {
  c.fillStyle = plein ? col : '#131318'; c.fillRect(x, y, w, h);
  c.strokeStyle = col; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
  c.fillStyle = plein ? NOIR : '#000'; c.fillRect(x + 2, y + h, w - 2, 3);
  texte(c, label, x + w / 2, y + h / 2 + 4, `12px ${PIX}`, plein ? NOIR : col);
}

/** Écran de départ. */
function dessineDepart(c, o, { jeu, record, doux }) {
  const T = o.t, pop = doux ? 1 : rebond(T / 0.45);
  c.fillStyle = 'rgba(14,12,34,.8)'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, 150); c.scale(pop, pop); c.translate(-W / 2, -150);
  texte(c, 'BORNE D’ARCADE 404', W / 2, 92, `11px ${PIX}`, SABLE);
  titreLettres(c, jeu.titre || 'Arcade', 150, T, doux);
  c.restore();
  if (jeu.accroche) texteLong(c, jeu.accroche, 180, 14, CORPS, BORD, 17);
  c.save();
  if (jeu.embleme) jeu.embleme(c, W / 2, 246, T);
  else { c.fillStyle = OR; etoile(c, W / 2, 246, 26 + (doux ? 0 : Math.sin(T * 5) * 2)); c.fill(); }
  c.restore();
  if (record !== null) texte(c, `RECORD  ${nf.format(record)}`, W / 2, 306, `13px ${PIX}`, OR);
  if (doux || Math.floor(T * 1.6) % 2 === 0) boutonPixel(c, { x: 70, y: 322, w: 220, h: 36 }, '▶\uFE0E APPUIE POUR JOUER', true);
  if (jeu.aideBorne || jeu.aide) texteLong(c, jeu.aideBorne || jeu.aide, 388, 10, PIX, GRIS, 13);
}

/** Compte 3-2-1 puis GO. */
function dessineCompte(c, o) {
  const n = o.n, tn = o.t - o.tn, k = 1 + 0.75 * (1 - ease(tn / 0.26));
  c.fillStyle = 'rgba(14,12,34,.55)'; c.fillRect(0, 0, W, H);
  if (n > 0) {
    const col = LOGO[n === 3 ? 0 : n === 2 ? 1 : 3];
    texte(c, 'PRÊT ?', W / 2, 120, `14px ${PIX}`, SABLE);
    c.strokeStyle = col; c.lineWidth = 4; c.globalAlpha = Math.max(0, 1 - tn / 0.7);
    c.beginPath(); c.arc(W / 2, 220, 40 + tn * 160, 0, 7); c.stroke(); c.globalAlpha = 1;
    c.save(); c.translate(W / 2, 258); c.scale(k, k); texte(c, String(n), 0, 0, `150px ${TITRE}`, col, NOIR); c.restore();
  } else {
    c.strokeStyle = OR; c.lineWidth = 3; c.globalAlpha = Math.max(0, 1 - tn / 0.6);
    c.beginPath();
    for (let i = 0; i < 14; i += 1) {
      const a = (Math.PI * 2 * i) / 14 + tn, r = 110 + tn * 120;
      c.moveTo(W / 2 + Math.cos(a) * 60, 215 + Math.sin(a) * 60); c.lineTo(W / 2 + Math.cos(a) * r, 215 + Math.sin(a) * r);
    }
    c.stroke(); c.globalAlpha = 1;
    c.save(); c.translate(W / 2, 245); c.scale(k, k); texte(c, 'GO !', 0, 0, `86px ${TITRE}`, OR, NOIR); c.restore();
  }
}

/** Écran Pause : le jeu reste visible derrière, le score et les vies sont rappelés. */
function dessinePause(c, o, { jeu, s, doux, presse }) {
  c.fillStyle = 'rgba(14,12,34,.7)'; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
  c.fillStyle = OR; c.fillRect(100, 100, 14, 40); c.fillRect(122, 100, 14, 40);
  texte(c, 'PAUSE', 232, 138, `40px ${TITRE}`, BORD, NOIR);
  texteLong(c, jeu.quip || 'La borne t’attend.', 178, 13, CORPS, '#c9c7d3', 15);
  c.fillStyle = '#131318'; c.fillRect(60, 196, 240, 64);
  c.strokeStyle = '#3A3A44'; c.lineWidth = 2; c.strokeRect(61, 197, 238, 62);
  texte(c, `SCORE  ${nf.format(jeu.score(s))}`, 180, 222, `13px ${PIX}`, BORD);
  const v = jeu.vies(s);
  if (v) {
    for (let i = 0; i < v.max; i += 1) {
      const x = 180 - (v.max - 1) * 11 + i * 22;
      if (i < v.left) coeur(c, x, 243, 6.5);
      else { c.strokeStyle = 'rgba(242,239,234,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(x, 243, 4, 0, 7); c.stroke(); }
    }
  } else texte(c, 'UNE SEULE VIE', 180, 245, `10px ${PIX}`, GRIS);
  if (presse) texte(c, 'Reprends vite : une partie dure 1 h au plus.', W / 2, 277, `13px ${CORPS}`, OR);
  boutonPixel(c, B_REPRENDRE, '▶\uFE0E REPRENDRE', doux || Math.floor(o.t * 1.6) % 2 === 0);
  boutonPixel(c, B_QUITTER, 'QUITTER LA PARTIE', false, '#9a98a5');
  texte(c, 'P OU ÉCHAP : REPRENDRE', W / 2, 396, `10px ${PIX}`, GRIS);
}

/** Écran de fin : carte au centre, score qui monte, record ou écart, tampon si nouveau record. */
function dessineFin(c, o, { doux, autres }) {
  const { f, t: T } = o, kk = doux ? 1 : rebond(T / 0.4), al = doux ? 1 : Math.min(1, T / 0.2);
  c.fillStyle = `rgba(14,12,34,${0.82 * al})`; c.fillRect(0, 0, W, H);
  c.save(); c.globalAlpha = al; c.translate(W / 2, 210); c.scale(kk, kk); c.translate(-W / 2, -210);
  c.fillStyle = '#131318'; c.fillRect(28, 62, 304, 300);
  c.lineWidth = 4;
  if (f.nouveau) { const g = c.createLinearGradient(28, 0, 332, 0); LOGO.forEach((col, i) => g.addColorStop(i / 5, col)); c.strokeStyle = g; } else c.strokeStyle = COUR;
  c.strokeRect(30, 64, 300, 296);
  texte(c, 'FIN DE PARTIE', W / 2, 90, `11px ${PIX}`, GRIS);
  texteAjuste(c, f.t, 126, 25, 14, TITRE, BORD, NOIR);
  texteAjuste(c, f.d, 150, 13, 9, CORPS, '#c9c7d3');
  c.fillStyle = '#2A2A33'; c.fillRect(50, 166, 260, 2);
  texte(c, 'SCORE', W / 2, 190, `11px ${PIX}`, SABLE);
  texte(c, nf.format(Math.round(f.score * (doux ? 1 : ease((T - 0.25) / 0.9)))), W / 2, 240, `46px ${TITRE}`, f.nouveau ? OR : BORD, NOIR);
  if (f.nouveau) {
    if (o.fete) {
      const rt = doux ? 1 : rebond((T - T_RECORD) / 0.35);
      c.save(); c.translate(W / 2, 276); c.rotate(-0.09); c.scale(rt, rt);
      c.fillStyle = OR; c.fillRect(-112, -16, 224, 32);
      c.strokeStyle = NOIR; c.lineWidth = 2; c.strokeRect(-110, -14, 220, 28);
      texte(c, 'NOUVEAU RECORD !', 0, 5, `14px ${PIX}`, NOIR);
      c.restore();
      c.fillStyle = OR; etoile(c, 66, 262, 7 + (doux ? 0 : Math.sin(T * 6) * 1.5)); c.fill();
      c.fillStyle = '#FFF1BE'; etoile(c, 296, 290, 6 + (doux ? 0 : Math.cos(T * 6) * 1.5)); c.fill();
    }
    if (f.rec) texte(c, f.rec, W / 2, 308, `11px ${PIX}`, GRIS);
  } else {
    if (f.rec) texte(c, f.rec, W / 2, 272, `13px ${PIX}`, OR);
    if (f.ecart) texte(c, f.ecart, W / 2, 294, `13px ${CORPS}`, '#c9c7d3');
  }
  boutonPixel(c, autres ? B_REJOUER : B_REJOUER_SEUL, 'REJOUER', true);
  if (autres) boutonPixel(c, B_AUTRES, 'AUTRES JEUX', false);
  c.restore();
}

/** « On reprend ! », posé sur le jeu qui repart. */
function dessineReprise(c, o, doux) {
  const a = doux ? 1 : Math.max(0, 1 - o.t / DUREE_REPRISE);
  c.fillStyle = `rgba(14,12,34,${0.35 * a})`; c.fillRect(0, 0, W, H);
  c.globalAlpha = a; texte(c, 'ON REPREND !', W / 2, 215, `28px ${TITRE}`, OR, NOIR); c.globalAlpha = 1;
}

/**
 * Crée une borne d'arcade sur un canevas pour un mini-jeu.
 * Le mini-jeu est un objet { init(s), update(s, dt, entree), draw(ctx, s), score(s), fini(s), vies(s) } :
 *   s est l'état de la partie (créé par init), entree = { cible, cibleY, fleche, pas, vertical, dir, action, tenu } :
 *   cible : position horizontale visée par le pointeur (ou null), fleche : -1, 0 ou 1 (flèche tenue),
 *   pas : -1 ou 1 pour un changement de voie ponctuel (flèche pressée, appui à gauche ou à droite, glissement), sinon 0.
 *   Options du mini-jeu (facultatives) :
 *   jeu.directions = true : les flèches haut et bas servent au jeu (la page ne défile pas) ; entree.vertical = -1 (haut),
 *     0 ou 1 (bas) tant qu'une flèche est tenue ; entree.dir = 'haut' | 'bas' | 'gauche' | 'droite' pour une flèche
 *     pressée ou un glissement du doigt (une seule image, puis null) ; cibleY = position verticale du pointeur (ou null).
 *   jeu.action = true : espace, flèche haut (si pas jeu.directions), clic ou appui du doigt donnent entree.action = true
 *     pendant une image (saut, tir, rotation…) ; entree.tenu = vrai tant que l'espace ou le doigt reste appuyé.
 *   jeu.tapeSeul = true (avec jeu.action) : au doigt et à la souris, l'action vient d'une TAPE (appui court sans glisser,
 *     au relâcher) et non de l'appui : un glissement ne déclenche pas d'action.
 *   entree.glisse = true pendant l'image où entree.dir vient d'un glissement du doigt (et non d'une flèche du clavier).
 *   Les codes de triche restent actifs : les flèches tapées comptent aussi pour eux.
 *   Textes et dessins des écrans communs (facultatifs, avec une valeur par défaut) : jeu.titre, jeu.accroche, jeu.quip (phrase
 *   de pause), jeu.aideBorne (ligne de commandes de l'écran de départ, sinon jeu.aide), jeu.embleme(ctx, x, y, T) (dessin de l'écran de départ, T en secondes), jeu.finTexte(s) → { t, d }.
 *   jeu.dureeFin(s) (facultatif) : secondes pendant lesquelles update et draw continuent après fini(), le temps des derniers
 *     effets, sans entrées ; update ne doit alors plus toucher au score ni aux vies. Sans cette option, seuls s.fx, s.secousse
 *     et s.flash finissent, pendant 0,6 s.
 * @param {{canvas: HTMLCanvasElement, jeu: object, onHud?: Function, onFin?: Function, onDebut?: Function, onPause?: Function, record?: Function, onAutres?: Function}} o
 *   onHud(score, vies) à chaque image, vies étant { left, max } ou null (pas de vies) ;
 *   onFin(score, s) à la fin ; onDebut() au lancement, avant le compte (le score ne bouge pas pendant le compte) ;
 *   onPause(enPause) quand le joueur met en pause ou reprend (bouton, Échap, P, écran de pause) ;
 *   record() : meilleur score connu de la page (sans cette option, pas de record à l'écran) ;
 *   onAutres() : bouton « Autres jeux » de l'écran de fin (sans cette option, le bouton n'existe pas).
 * @returns {{demarre: Function, arrete: Function, pause: Function, enJeu: Function, dessine: Function}}
 */
export function creeArcade({ canvas, jeu, onHud = () => {}, onFin = () => {}, onDebut = () => {}, onPause = () => {}, record = null, onAutres = null }) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  let etat = 'attente'; // 'attente' | 'compte' | 'jeu' | 'pause' | 'fin'
  /** État d'une partie neuve. s.reduit : mouvement réduit demandé ou « Effets » coupés (lu à chaque partie). */
  const neuf = () => {
    const reduit = !motionAllowed();
    const n = jeu.init({ reduit });
    n.reduit = reduit;
    n.triche = triche;
    return n;
  };
  let s = neuf();
  let ov = { type: 'depart', t: 0 }; // écran posé sur le jeu : 'depart' | 'compte' | 'pause' | 'reprise' | 'delai' | 'fin', ou null
  let compteGarde = null; // compte interrompu par une pause (repris tel quel)
  let finGarde = 0; // heure à laquelle l'écran de fin écoute le clavier et les clics (une touche tenue ou un double clic ne relance pas)
  let debutT = 0; // heure du lancement (le serveur compte la durée d'une partie depuis ce moment, pauses comprises)
  let rappel = 0; // sans mouvement, la boucle dort : minuteur qui affiche le rappel de l'écran de pause
  let enVue = true, arretee = false;
  let dernierT = null, raf = 0;
  const touches = []; // dernières touches (codes de triche)
  let bandeau = null; // { texte, t } : message « code activé » affiché un instant
  const entree = { cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, glisse: false, action: false, tenu: false };
  let depart = null; // appui du doigt (pour reconnaître un glissement)
  let manuelle = false; // pause demandée par le joueur (l'onglet visible ne la lève pas)

  /** Position horizontale (coordonnées du canevas) d'un pointeur. */
  const posX = (e) => {
    const r = canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * W;
  };

  /** Fond de borne : damier sombre en pixel art (le jeu peut le recouvrir, comme la route de Domu-mobile). */
  const fond = () => {
    ctx.fillStyle = '#14122a'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#18162f';
    for (let y = 0; y < H; y += 24) for (let x = (y / 24) % 2 ? 24 : 0; x < W; x += 48) ctx.fillRect(x, y, 24, 24);
  };
  /** Pastilles des codes actifs (coin haut gauche) et message d'activation. */
  const surcouche = () => {
    // Pastilles en haut au centre (le score est en haut à gauche, les vies en haut à droite).
    const n = (triche.coeurs ? 1 : 0) + (triche.immortel ? 1 : 0);
    let x = W / 2 - (n * 22) / 2 + 11;
    if (triche.coeurs) { coeur(ctx, x, 16, 7); x += 22; }
    if (triche.immortel) { ctx.fillStyle = '#FBD32D'; ctx.font = 'bold 18px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('∞', x, 16); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start'; }
    if (bandeau) {
      const a = Math.max(0, 1 - (performance.now() - bandeau.t) / 1800);
      if (a <= 0) { bandeau = null; return; }
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, H / 2 - 26, W, 52);
      ctx.fillStyle = '#F2EFEA'; ctx.font = '18px "Archivo Black", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(bandeau.texte, W / 2, H / 2 + 7); ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }
  };
  /** Pose l'écran courant sur le jeu. */
  const dessineEcran = () => {
    const doux = s.reduit, t = ov.type;
    if (t === 'depart') dessineDepart(ctx, ov, { jeu, record: record ? record() : null, doux });
    else if (t === 'compte') dessineCompte(ctx, ov);
    else if (t === 'pause') dessinePause(ctx, ov, { jeu, s, doux, presse: Date.now() - debutT >= RAPPEL_PAUSE });
    else if (t === 'reprise') dessineReprise(ctx, ov, doux);
    else if (t === 'fin') dessineFin(ctx, ov, { doux, autres: !!onAutres });
  };
  const dessine = () => {
    ctx.clearRect(0, 0, W, H); fond(); jeu.draw(ctx, s);
    if (ov) { dessineEcran(); if (s.fx?.length) dessineFX(ctx, s, 2); } // haut = 2 : les confettis, au-dessus de l'écran de fin
    surcouche();
    const nom = !ov || ov.type === 'reprise' || ov.type === 'delai' ? 'jeu' : ov.type;
    if (canvas.dataset.ecran !== nom) canvas.dataset.ecran = nom;
  };

  /** Note une touche ; si les dernières forment un code, il s'active (ou se désactive). */
  const noteTouche = (k) => {
    touches.push(k.length === 1 ? k.toLowerCase() : k);
    if (touches.length > 8) touches.shift();
    for (const c of CODES) {
      const fin = touches.slice(-c.suite.length);
      if (fin.length === c.suite.length && fin.every((t, i) => t === c.suite[i])) {
        triche[c.cle] = !triche[c.cle];
        touches.length = 0;
        bandeau = { texte: `${c.nom} ${triche[c.cle] ? 'activé' : 'désactivé'}`, t: performance.now() };
        peint();
      }
    }
  };

  /** Vrai s'il reste quelque chose à voir sur l'écran de fin : tampon à venir ou, avec mouvement, carte, confettis, secousse, flash. */
  const finEnCours = () => (ov.f.nouveau && !ov.fete) || (!s.reduit && (ov.t < FIN_ANIMEE || s.fx?.length > 0 || s.secousse > 0 || s.flash > 0));
  /**
   * Vrai si la boucle doit tourner. En partie, toujours. Hors partie, seulement borne visible (onglet affiché, canevas à
   * l'écran) ; sans mouvement, ou sur l'écran de fin, seulement s'il reste quelque chose à faire.
   */
  const animee = () => {
    if (arretee) return false;
    if (etat === 'jeu') return true;
    if (!canvas.isConnected || !enVue || document.hidden) return false;
    if (bandeau) return true;
    return ov?.type === 'fin' ? finEnCours() : !s.reduit;
  };
  /** Relance la boucle si elle dort et qu'elle a de quoi faire. */
  const relance = () => { if (!raf && animee()) raf = requestAnimationFrame(boucle); };
  /** Affiche tout de suite (changement d'écran, y compris sans mouvement, où la boucle dort). */
  const peint = () => { dessine(); relance(); };

  /** Ouvre l'écran de fin (SO5). */
  const ouvreFin = (f) => {
    ov = { type: 'fin', t: 0, f };
    finGarde = Math.max(finGarde, performance.now() + GARDE_OUVERTURE * 1000);
    sonFlash('SO5');
  };
  /** Vrai si l'écran de fin est ouvert et écoute le clavier et les clics. */
  const finPrete = () => ov?.type === 'fin' && performance.now() >= finGarde;
  /** Nouveau record : son SO6 et pluie de confettis, juste quand le tampon tombe. */
  const fete = () => {
    ov.fete = true;
    sonFlash('SO6');
    if (s.reduit) return;
    s.fx ||= [];
    for (let i = 0; i < 46; i += 1) {
      s.fx.push({ k: 'rect', haut: 2, t: 0, vie: 2.6, x: Math.random() * W, y: -Math.random() * 30, vx: (Math.random() - 0.5) * 40, vy: 50 + Math.random() * 80, g: 30,
        vr: (Math.random() - 0.5) * 10, rot: Math.random() * 6, w: 6, h: 10, c: LOGO[i % 6] });
    }
  };

  /** Le compte est fini : le jeu commence vraiment (les touches notées pendant le compte sont oubliées). */
  const lanceJeu = () => {
    etat = 'jeu'; ov = null; dernierT = null;
    entree.pas = 0; entree.dir = null; entree.glisse = false; entree.action = false;
  };

  /** Avance l'écran courant hors partie. */
  const avanceEcran = (dt) => {
    ov.t += dt;
    if (etat === 'pause') return;
    if (etat === 'fin') {
      // Le dernier effet du jeu (éclat, flash, secousse) finit de se jouer : update n'est plus appelé ici.
      majFX(s, dt);
      if (s.secousse > 0) s.secousse = Math.max(0, s.secousse - dt);
      if (s.flash > 0) s.flash = Math.max(0, s.flash - dt);
    }
    if (ov.type === 'delai') { if (ov.t >= ov.duree) ouvreFin(ov.f); return; }
    if (ov.type === 'fin') { if (ov.f.nouveau && !ov.fete && ov.t >= T_RECORD) fete(); return; }
    if (ov.type !== 'compte') return;
    const n = Math.max(0, 3 - Math.floor(ov.t / PAS_COMPTE));
    if (n !== ov.n) { ov.n = n; ov.tn = ov.t; sonFlash(n ? 'SO1' : 'SO2'); }
    if (ov.t >= FIN_COMPTE) lanceJeu();
  };

  /** Une image : avance le jeu ou l'écran, affiche, termine si le jeu le dit. */
  const boucle = (t) => {
    raf = 0;
    if (!animee()) { dernierT = null; return; }
    const ecoule = dernierT === null ? 0 : Math.max(0, (t - dernierT) / 1000);
    dernierT = t;
    if (etat === 'jeu') {
      const dt = Math.min(0.05, ecoule);
      jeu.update(s, dt, entree);
      entree.pas = 0; entree.dir = null; entree.glisse = false; entree.action = false;
      if (ov) { ov.t += dt; if (ov.t >= DUREE_REPRISE) ov = null; } // « On reprend ! » : le jeu tourne déjà dessous
      onHud(jeu.score(s), jeu.vies(s));
      dessine();
      if (jeu.fini(s)) fin();
    } else if (ov?.type === 'delai' && ov.joue) {
      // Derniers effets du jeu : la partie est finie et le score envoyé, update tourne encore, sans entrées.
      const dt = Math.min(0.05, ecoule);
      jeu.update(s, dt, SANS_ENTREE);
      ov.t += dt;
      if (ov.t >= ov.duree) ouvreFin(ov.f);
      dessine();
    } else {
      avanceEcran(Math.min(0.25, ecoule));
      dessine();
    }
    relance();
  };

  /** Lance une partie (sans effet pendant une partie) : le serveur et le HUD partent tout de suite, le jeu après le compte. */
  const demarre = () => {
    if (etat === 'jeu' || etat === 'pause' || etat === 'compte') return;
    s = neuf();
    entree.cible = null; entree.cibleY = null; entree.fleche = 0; entree.pas = 0; entree.vertical = 0; entree.dir = null; entree.action = false; entree.tenu = false;
    dernierT = null; manuelle = false; compteGarde = null; debutT = Date.now();
    onDebut();
    onHud(jeu.score(s), jeu.vies(s));
    canvas.focus({ preventScroll: true });
    if (s.reduit) { lanceJeu(); sonFlash('SO2'); } // sans mouvement, pas de compte
    else { etat = 'compte'; ov = { type: 'compte', t: 0, n: 3, tn: 0 }; sonFlash('SO1'); }
    peint();
  };

  /**
   * Fin de partie, jamais retardée par les effets : le rappel onFin(score) part tout de suite, l'écran de fin arrive après les
   * derniers effets du jeu (jeu.dureeFin), ou tout de suite si le joueur quitte ou sans mouvement.
   * @param {boolean} [quitte] le joueur a quitté depuis l'écran de pause : le score de ce moment compte comme une fin normale
   */
  const fin = (quitte = false) => {
    const score = jeu.score(s), ancien = record ? record() : null; // lu avant onFin, qui met le record à jour
    etat = 'fin'; finGarde = performance.now() + GARDE_FIN * 1000; compteGarde = null; manuelle = false;
    onFin(score, s);
    const nouveau = ancien !== null && score > ancien, ecart = (ancien ?? 0) - score;
    const { t, d } = quitte ? { t: 'Partie quittée', d: 'Ton score compte quand même.' }
      : jeu.finTexte?.(s) || { t: 'Partie terminée', d: score > 0 ? 'Belle partie !' : 'La prochaine sera la bonne.' };
    const f = { t, d, score, nouveau,
      rec: !ancien ? '' : `${nouveau ? 'ANCIEN RECORD' : 'RECORD'}  ${nf.format(ancien)}`,
      ecart: !ancien || nouveau ? '' : ecart > 0 ? `Il t’a manqué ${nf.format(ecart)} point${ecart > 1 ? 's' : ''}.` : 'Record égalé !' };
    const joue = quitte || s.reduit ? 0 : jeu.dureeFin?.(s) || 0;
    ov = { type: 'delai', t: 0, f, joue: joue > 0, duree: joue || DELAI_FIN };
    if (quitte || s.reduit) ouvreFin(f);
    peint();
  };

  /** Pause demandée par le joueur (bouton, Échap, P, écran de pause) : true si la partie est maintenant en pause. */
  const pause = () => {
    if (etat === 'jeu' || etat === 'compte') {
      if (etat === 'compte') compteGarde = ov;
      etat = 'pause'; manuelle = true;
      s.secousse &&= 0; // pas de tremblement sans fin derrière l'écran de pause
      ov = { type: 'pause', t: 0 };
      if (s.reduit) rappel = setTimeout(peint, Math.max(0, debutT + RAPPEL_PAUSE - Date.now()));
      sonFlash('SO3');
      canvas.focus({ preventScroll: true }); // venu du bouton Pause : P et Échap doivent marcher aussitôt
      onPause(true);
      peint();
      return true;
    }
    if (etat === 'pause') {
      manuelle = false; dernierT = null; clearTimeout(rappel);
      if (compteGarde) { etat = 'compte'; ov = compteGarde; compteGarde = null; } else { etat = 'jeu'; ov = { type: 'reprise', t: 0 }; }
      sonFlash('SO4');
      canvas.focus({ preventScroll: true });
      onPause(false);
      peint();
    }
    return false;
  };
  /** Arrête la borne (onglet quitté) sans fin de partie. */
  const arrete = () => {
    arretee = true; cancelAnimationFrame(raf); raf = 0; clearTimeout(rappel); etat = 'attente'; vue?.disconnect();
    document.removeEventListener('visibilitychange', visibilite); document.removeEventListener('keydown', codesClavier, true);
  };

  /** Vrai pendant une partie d'un jeu qui utilise haut et bas (Snake, Tetris, Flappy…) : flèches et glissements jouent. */
  const flechesAuJeu = () => (etat === 'jeu' || etat === 'compte') && !!(jeu.directions || jeu.action);

  /* ---------- Codes de triche : clavier n'importe où sur la page (la borne visible), glissements sur la borne ---------- */
  const codesClavier = (e) => {
    if (!canvas.isConnected || !canvas.offsetParent || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t instanceof Element && t !== canvas && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    // Pendant une partie d'un jeu où haut et bas servent (directions ou action), les flèches ne comptent pas pour
    // les codes : une suite de déplacements activerait « immortel » sans le vouloir. Les lettres comptent toujours.
    if (!(flechesAuJeu() && e.key.startsWith('Arrow'))) noteTouche(e.key);
    // Haut et bas ne servent qu'aux codes : la page ne défile pas pendant qu'on joue ou qu'on tape un code.
    // Jamais avec le focus sur un bouton ou un lien : Espace doit l'activer, les flèches restent à la page.
    const a = document.activeElement, surPage = !a || a === document.body || a === document.documentElement;
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.key === ' ' && jeu.action)) && (a === canvas || (surPage && (etat === 'jeu' || etat === 'compte')))) e.preventDefault();
  };
  document.addEventListener('keydown', codesClavier, true);

  /** Onglet masqué : pause ; de retour : reprise (le temps masqué ne compte pas). Le compte, lui, attend tout seul. */
  const visibilite = () => {
    if (document.hidden) { if (etat === 'jeu') { etat = 'pause'; ov = { type: 'pause', t: 0 }; } return; }
    if (etat === 'pause' && !manuelle) { etat = 'jeu'; ov = null; }
    dernierT = null;
    relance();
  };
  document.addEventListener('visibilitychange', visibilite);
  /** Borne sortie de l'écran ou onglet de la page changé : les écrans hors partie cessent de s'animer. */
  const vue = 'IntersectionObserver' in window ? new IntersectionObserver((lignes) => {
    enVue = lignes[lignes.length - 1].isIntersecting;
    if (enVue) { dernierT = null; relance(); }
  }) : null;
  vue?.observe(canvas);
  /** Entrée ou action au clavier hors partie : lance, ou relance après la fin une fois l'écran ouvert (une touche tenue à la mort ne relance pas). */
  const relanceClavier = (e) => {
    if (etat === 'attente') demarre();
    else if (etat === 'fin' && finPrete() && !e.repeat) demarre();
  };

  /* ---------- Commandes ---------- */
  /** Position verticale (coordonnées du canevas) d'un pointeur. */
  const posY = (e) => {
    const r = canvas.getBoundingClientRect();
    return ((e.clientY - r.top) / r.height) * H;
  };
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || depart) { entree.cible = posX(e); entree.cibleY = posY(e); } });
  canvas.addEventListener('pointerdown', (e) => {
    const x = posX(e);
    depart = { x, y: ((e.clientY - canvas.getBoundingClientRect().top) / canvas.getBoundingClientRect().height) * H, t: performance.now() };
    entree.cible = x; entree.cibleY = posY(e);
    const y = depart.y;
    if (etat === 'pause') {
      if (surBouton(B_REPRENDRE, x, y)) { depart = null; pause(); } else if (surBouton(B_QUITTER, x, y)) { depart = null; fin(true); }
      return;
    }
    if (etat === 'fin') {
      if (!finPrete()) return; // le bouton Quitter chevauche Rejouer et Autres jeux : pas de double clic
      if (surBouton(onAutres ? B_REJOUER : B_REJOUER_SEUL, x, y)) { depart = null; demarre(); } else if (onAutres && surBouton(B_AUTRES, x, y)) { depart = null; onAutres(); }
      return;
    }
    if (etat === 'attente') { demarre(); return; }
    if (etat === 'compte') return;
    if (jeu.action && !jeu.tapeSeul) { entree.action = true; entree.tenu = true; }
    if (jeu.voies) entree.pas = x < W / 2 ? -1 : 1; // jeu à voies : appui à gauche ou à droite
  });
  canvas.addEventListener('pointerup', (e) => {
    // Glissement net sur la borne (doigt) : compte comme une flèche pour les codes de triche.
    if (depart && e.pointerType !== 'mouse') {
      const r = canvas.getBoundingClientRect();
      const gx = posX(e) - depart.x, gy = ((e.clientY - r.top) / r.height) * H - depart.y;
      if (Math.max(Math.abs(gx), Math.abs(gy)) > 30) {
        const k = Math.abs(gx) > Math.abs(gy) ? (gx > 0 ? 'ArrowRight' : 'ArrowLeft') : (gy > 0 ? 'ArrowDown' : 'ArrowUp');
        if (!flechesAuJeu()) noteTouche(k); // glissement qui sert au jeu : pas compté pour les codes
        if (jeu.directions && etat === 'jeu') { entree.dir = { ArrowRight: 'droite', ArrowLeft: 'gauche', ArrowDown: 'bas', ArrowUp: 'haut' }[k]; entree.glisse = true; }
      } else if (jeu.action && jeu.tapeSeul && etat === 'jeu' && performance.now() - depart.t < 350) entree.action = true; // tape
    } else if (depart && jeu.action && jeu.tapeSeul && etat === 'jeu') entree.action = true; // clic de souris
    entree.tenu = false;
    if (depart && jeu.voies) {
      const dx = posX(e) - depart.x;
      if (Math.abs(dx) > 24) entree.pas = dx < 0 ? -1 : 1; // glissement
    }
    depart = null;
    if (e.pointerType !== 'mouse') entree.cible = null;
  });
  canvas.addEventListener('pointercancel', () => { depart = null; entree.tenu = false; });
  canvas.addEventListener('keydown', (e) => {
    // Entrée, ou Espace dans un jeu sans action : lance la partie (ou une nouvelle après la fin). La page ne défile pas.
    if (e.key === 'Enter' || (e.key === ' ' && !jeu.action)) {
      e.preventDefault();
      relanceClavier(e);
      return;
    }
    // Échap ou P : pause ou reprise, comme le bouton de la page (sans effet hors partie).
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return; // Ctrl+P imprime ; une touche tenue n'alterne pas
      if (etat === 'jeu' || etat === 'compte' || etat === 'pause') { e.preventDefault(); pause(); }
      return;
    }
    // Espace (et flèche haut sans jeu.directions) : action du jeu (saut, tir, rotation…).
    if (jeu.action && (e.key === ' ' || (e.key === 'ArrowUp' && !jeu.directions))) {
      e.preventDefault();
      if (etat === 'pause' || etat === 'compte') return;
      if (etat !== 'jeu') { relanceClavier(e); return; }
      if (!e.repeat) entree.action = true;
      entree.tenu = true;
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!jeu.directions) return; // utiles aux codes seulement (codesClavier)
      e.preventDefault();
      if (etat === 'pause' || etat === 'compte' || etat === 'fin') return;
      if (etat !== 'jeu') { demarre(); return; }
      if (!e.repeat) entree.dir = e.key === 'ArrowUp' ? 'haut' : 'bas';
      entree.vertical = e.key === 'ArrowUp' ? -1 : 1;
      return;
    }
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const d = e.key === 'ArrowLeft' ? -1 : 1;
    entree.cible = null;
    if (etat === 'pause' || etat === 'compte' || etat === 'fin') return;
    if (etat !== 'jeu') { demarre(); return; }
    if (!e.repeat) { entree.pas = d; if (jeu.directions) entree.dir = d < 0 ? 'gauche' : 'droite'; }
    entree.fleche = d;
  });
  canvas.addEventListener('keyup', (e) => {
    if ((e.key === 'ArrowLeft' && entree.fleche < 0) || (e.key === 'ArrowRight' && entree.fleche > 0)) entree.fleche = 0;
    if ((e.key === 'ArrowUp' && entree.vertical < 0) || (e.key === 'ArrowDown' && entree.vertical > 0)) entree.vertical = 0;
    if (e.key === ' ' || e.key === 'ArrowUp') entree.tenu = false;
  });
  canvas.addEventListener('blur', () => { entree.fleche = 0; entree.vertical = 0; entree.tenu = false; });

  // Polices des écrans (chargées à la demande : un canevas seul ne les réclame pas à temps).
  document.fonts?.load(`12px ${PIX}`).catch(() => {});
  document.fonts?.load(`12px ${TITRE}`).catch(() => {});
  // Son du titre : seulement après un geste (choix du jeu), le navigateur le bloque sinon.
  if (navigator.userActivation?.hasBeenActive) sonFlash('SO7');
  peint();
  return { demarre, arrete, pause, enJeu: () => etat === 'jeu' || etat === 'pause' || etat === 'compte', dessine, triche };
}
