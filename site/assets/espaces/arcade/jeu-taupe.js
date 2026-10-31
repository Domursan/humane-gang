// ===== Humane Gang — arcade : « Tape-taupe » (les membres sortent des terriers) =====
/*
 * Rôle : neuf terriers ; des membres du gang (avatars ronds à l'initiale) sortent un instant puis rentrent. On les tape
 * (clic, doigt, ou espace sur la case du curseur aux flèches) : +1 point, avec un « Paf ! ».
 * Pièges : parfois un cornichon sort à la place. Le taper coûte une vie. Un membre raté (rentré sans être tapé) ne coûte
 * rien, sauf cinq ratés de suite : une vie. Trois vies ; pas de limite de temps. Le rythme accélère par paliers de 10 s
 * (+7 %), sans plafond ; la durée de sortie raccourcit avec lui.
 * Cadence : une sortie au plus toutes les 0,25 s (plancher technique), donc au plus 4 points dans une même seconde,
 * sous le plafond serveur de 5 points par seconde. Au plus trois avatars sortis en même temps.
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = plus de cornichons, les avatars deviennent des cœurs ;
 * immortel = aucune vie perdue.
 * Moteur : eggs/arcade.js (creeArcade ; jeu « directions » et action). Animation réduite : rythme plus lent, pas de particules.
 * Effets flash (maquette validée, sons TA1 à TA6) : la terre gicle à chaque sortie, un marteau frappe, membre écrasé avec
 * étoiles qui tournent et « Paf ! » en étoile, éclaboussure verte du cornichon, cœur qui éclate, compteur RATÉS en bas.
 * Tout cela est visuel : le score, les vies et les terriers changent dès le clic, la fin de partie n'attend aucun effet
 * (s.attente ne sert qu'aux effets ; après le dernier cœur, update ne fait plus avancer qu'eux, pendant dureeFin).
 * Le membre tapé reste affiché un instant (t.coup) alors que le terrier suit son cycle normal : ce sursis n'a aucun effet
 * sur la cadence ni sur les collisions.
 * Écrans communs : titre, accroche, quip, aide, embleme, finTexte.
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, coeur, etoile } from './arcade.js';
import { sonFlash, poussiere, etoiles, flotte, onde, eclatCoeur, majFX, dessineFX } from './fx.js';

const VIES = 3, SERIE_RATEE = 5, TERRIERS = 9;
/** Centres des terriers (3 × 3). */
const XS = [70, 180, 290], YS = [125, 225, 325];
/** Hauteur dont un avatar sort du terrier, et durée de la montée ou de la descente (secondes). */
const ALT = 30, MONTEE = 0.12;
/** Rythme : une sortie toutes les « intervalle » secondes, plancher à 0,25 s ; sortie tenue de 1,6 s, divisée par les paliers. */
const PLANCHER_SORTIE = 0.25;
/** Accélération : +7 % toutes les 10 s, sans plafond. */
const HAUSSE = 0.07, PALIER_S = 10;
const paliers = (t) => (1 + HAUSSE) ** Math.floor(t / PALIER_S);
const CORNICHON_P = 0.2;
const LETTRES = ['D', 'S', 'N', 'W', 'Z', 'T'];
/** Couleurs du site par initiale, et couleur de l'initiale (sombre sur les fonds clairs). */
const COULEUR = {
  D: ['#9E3543', '#F2EFEA'], S: ['#2B5AE2', '#F2EFEA'], N: ['#4E2398', '#F2EFEA'],
  W: ['#FCA301', '#14122a'], Z: ['#FE3104', '#F2EFEA'], T: ['#FBD32D', '#14122a'],
};
const TERRE = '#5B4330', TROU = '#120D09', HERBE = '#211D3A', CONTOUR = '#0E0E10', CORNI = '#159946', CORNI_FONCE = '#0E6B31';
const OR = '#FBD32D', COUR = '#9E3543', SABLE = '#E2C77E', ROUGE_V = '#FF5A6A';
const TITRE = '"Archivo Black", system-ui, sans-serif', PIXEL = '"Silkscreen", ui-monospace, monospace';
const MOTTE = [TERRE, '#7A5C43', '#3d2c1e'], SPLAT = [CORNI, CORNI_FONCE, '#7FD36B', '#D9F0A0'];
/** Effets (secondes) : le marteau touche après IMPACT, sursaut de sortie, membre tapé tenu puis retiré, Paf !, cœur. */
const IMPACT = 0.1, SAILLIE = 0.16, TENUE = 0.38, RETRAIT = 0.16, DUREE_PAF = 0.55, COEUR_APRES = 0.22, COEUR_RATES = 0.45;

const ease = (k) => 1 - (1 - Math.min(1, Math.max(0, k))) ** 3;
/** Monte de 0 à 1 en dépassant un peu l'arrivée. */
function rebond(k) {
  const q = Math.min(1, Math.max(0, k)) - 1, c = 1.70158;
  return 1 + (c + 1) * q ** 3 + c * q ** 2;
}

/**
 * Disque en pixel art : lignes de 3 px, largeur arrondie en escalier, centré en (x, y).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} rx demi-largeur
 * @param {number} ry demi-hauteur
 * @param {string} couleur remplissage
 */
function disque(ctx, x, y, rx, ry, couleur) {
  ctx.fillStyle = couleur;
  for (let dy = -ry; dy < ry; dy += 3) {
    const bas = dy + 3 > ry ? ry : dy + 3;
    const l = rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)));
    ctx.fillRect(Math.round(x - l), Math.round(y + dy), Math.round(2 * l), Math.round(bas - dy));
  }
}

/**
 * Trace le terrier (le trou sombre au fond, la motte devant). Dessiné avant et après l'avatar.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y niveau du sol
 * @param {'fond' | 'devant'} part partie à tracer
 */
function terrier(ctx, x, y, part) {
  if (part === 'fond') { disque(ctx, x, y, 38, 15, TROU); return; }
  disque(ctx, x, y + 9, 42, 15, TERRE);
  ctx.fillStyle = '#7A5C43';
  ctx.fillRect(Math.round(x - 30), Math.round(y + 12), 6, 3);
  ctx.fillRect(Math.round(x + 18), Math.round(y + 15), 6, 3);
}

/**
 * Trace l'avatar d'un membre : disque coloré, contour sombre, reflet et initiale.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {string} lettre initiale (D, S, N, W, Z ou T)
 */
function avatar(ctx, x, y, lettre) {
  const [fond, texte] = COULEUR[lettre];
  disque(ctx, x, y, 27, 27, CONTOUR);
  disque(ctx, x, y, 24, 24, fond);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(Math.round(x - 16), Math.round(y - 16), 6, 6);
  ctx.fillStyle = texte; ctx.font = '26px "Archivo Black", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(lettre, x, y + 2);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
}

/**
 * Trace un cornichon vert en pixel art (à ne pas taper).
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 */
function cornichon(ctx, x, y) {
  disque(ctx, x, y, 27, 10, CORNI_FONCE);
  disque(ctx, x, y, 25, 8, CORNI);
  ctx.fillStyle = CORNI_FONCE;
  ctx.fillRect(Math.round(x - 16), Math.round(y - 3), 4, 3);
  ctx.fillRect(Math.round(x - 2), Math.round(y + 2), 4, 3);
  ctx.fillRect(Math.round(x + 9), Math.round(y - 4), 4, 3);
  ctx.fillStyle = '#7A4A22'; ctx.fillRect(Math.round(x + 24), Math.round(y - 2), 6, 4);
}

/**
 * Trace le marteau de bois et de velours.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} px pied du manche
 * @param {number} py pied du manche
 * @param {number} th angle (radians)
 */
function marteau(ctx, px, py, th) {
  const r = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  ctx.save(); ctx.translate(px, py); ctx.rotate(th);
  r(-3, -54, 6, 54, '#6b3a12'); r(-3, -54, 2, 54, '#8a5200');
  r(-15, -70, 30, 24, COUR); r(-15, -70, 30, 4, '#c0485a'); r(-15, -58, 30, 4, SABLE); r(-15, -50, 30, 4, '#6e1f2c');
  ctx.strokeStyle = CONTOUR; ctx.lineWidth = 2; ctx.strokeRect(-15, -70, 30, 24);
  ctx.restore();
}

/**
 * Trace le « Paf ! » en étoile.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {number} x centre
 * @param {number} y centre
 * @param {number} sc échelle
 */
function bam(ctx, x, y, sc) {
  const n = 10;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.12); ctx.scale(sc, sc);
  ctx.beginPath();
  for (let i = 0; i < n * 2; i += 1) {
    const a = (Math.PI * i) / n, r = i % 2 ? 22 : 36;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.8);
  }
  ctx.closePath();
  ctx.fillStyle = COUR; ctx.fill();
  ctx.strokeStyle = OR; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `17px ${TITRE}`; ctx.textAlign = 'center'; ctx.fillStyle = OR;
  ctx.fillText('Paf !', 0, 6);
  ctx.textAlign = 'start';
  ctx.restore();
}

/**
 * Trace le compteur des ratés de suite : il montre s.serie, sans rien décider.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {object} s état de la partie
 * @param {number} T temps de la partie (secondes)
 */
function pips(ctx, s, T) {
  ctx.font = `8px ${PIXEL}`; ctx.fillStyle = '#8d8b99'; ctx.fillText('RATÉS', 12, H - 30);
  // Le cinquième raté remet s.serie à 0 tout de suite : le compteur le garde plein jusqu'au cœur perdu.
  const vue = !s.reduit && T < s.plein ? SERIE_RATEE : s.serie;
  const danger = vue >= SERIE_RATEE && !s.reduit && Math.floor(T * 8) % 2 === 0;
  const kp = (T - s.serieT) / 0.3;
  for (let i = 0; i < SERIE_RATEE; i += 1) {
    const k = i === vue - 1 && kp >= 0 && kp < 1 && !s.reduit ? 1 + 0.4 * Math.sin(kp * Math.PI) : 1;
    ctx.save(); ctx.translate(18 + i * 16, H - 14); ctx.scale(k, k);
    ctx.fillStyle = i < vue ? (danger ? '#fff' : ROUGE_V) : '#3A3A44';
    ctx.fillRect(-6, -6, 12, 12);
    ctx.restore();
  }
}

/**
 * Hauteur d'affichage de l'avatar (t.h, elle, sert aux collisions) : sursaut de sortie, membre tapé tenu un instant.
 * @param {object} s état de la partie
 * @param {object} t terrier
 * @returns {number} hauteur (0 : rien à afficher)
 */
function hauteurVue(s, t) {
  if (s.reduit) return t.etat === 'vide' ? 0 : t.h;
  if (t.coup >= 0) return t.hCoup * (1 - ease((s.ecoule - t.coup - TENUE) / RETRAIT));
  if (t.etat === 'vide') return 0;
  return t.age < SAILLIE && t.etat !== 'rentre' ? rebond(t.age / SAILLIE) : t.h;
}

/**
 * Programme un effet plus tard (jamais une règle). Tout de suite si le mouvement est réduit : dureeFin n'est pas jouée.
 * @param {object} s état de la partie
 * @param {number} d délai (secondes)
 * @param {Function} fn effet
 */
function plus(s, d, fn) {
  if (s.reduit) fn();
  else s.attente.push({ t: s.ecoule + d, fn });
}

/** Le cœur k éclate à sa place dans le bandeau du haut. */
function coeurPerdu(s, k) {
  eclatCoeur(s, W - 14 - (VIES - 1 - k) * 18, 15, 8);
  sonFlash('TA6');
}

/** Secousse et flash rouge (sauf mouvement réduit). */
function choc(s, duree) {
  if (s.reduit) return;
  s.secousse = duree; s.flash = 0.35;
}

/**
 * Le marteau touche un membre : écrasé, Paf !, +1.
 * @param {object} s état de la partie
 * @param {object} t terrier
 */
function pafMembre(s, t) {
  t.sq = s.ecoule; t.paf = s.ecoule;
  flotte(s, t.x + 4, t.y - 100, '+1', OR, 22);
  etoiles(s, t.x, t.y - 40, 6, OR, 100, 0.5);
  onde(s, t.x, t.y - 30, 6, 50, '#fff', 0.3, 3);
  poussiere(s, t.x, t.y - 28, 8, [OR, '#fff'], 90, 0.35, 3);
  if (!s.reduit) s.secousse = 0.12;
  sonFlash('TA2');
}

/**
 * Le marteau touche un cornichon : éclaboussure verte, et le cœur éclate s'il a coûté une vie.
 * @param {object} s état de la partie
 * @param {object} t terrier
 * @param {number | null} k cœur perdu, ou null (code « immortel »)
 */
function splat(s, t, k) {
  t.sq = s.ecoule;
  poussiere(s, t.x, t.y - 26, 16, SPLAT, 130, 0.6, 4, 260);
  onde(s, t.x, t.y - 26, 6, 56, CORNI, 0.35, 3);
  sonFlash('TA3');
  if (k === null) return;
  choc(s, 0.25);
  plus(s, COEUR_APRES, () => coeurPerdu(s, k));
}

/**
 * Trouve le terrier dont l'avatar visible contient le point (x, y).
 * @param {object} s état de la partie
 * @param {number} x point (coordonnées du canevas)
 * @param {number} y point (coordonnées du canevas)
 * @returns {object | null} le terrier, ou null
 */
function trouAvatar(s, x, y) {
  for (const t of s.trous) {
    if (!sorti(t)) continue;
    if (Math.hypot(x - t.x, y - (t.y - t.h * ALT)) <= 34) return t;
  }
  return null;
}

/** true si l'avatar du terrier est assez visible pour être tapé (montée ou sortie). */
function sorti(t) {
  return (t.etat === 'monte' || t.etat === 'sorti') && t.h >= 0.3;
}

/**
 * Un terrier passe en descente (le membre rentre).
 * @param {object} t terrier
 */
function rentre(t) {
  t.etat = 'rentre'; t.t = 0; t.h0 = t.h;
}

/**
 * Une vie perdue : le message ; les effets viennent à part.
 * @param {object} s état de la partie
 * @param {string} texte message affiché
 * @returns {number} indice du cœur perdu
 */
function perdUneVie(s, texte) {
  s.vies--;
  s.message = texte; s.msgT = 1.4;
  return s.vies;
}

/**
 * Un membre est rentré sans être tapé : la série monte ; à cinq, elle repart de zéro et coûte une vie.
 * @param {object} s état de la partie
 */
function rate(s) {
  s.serie++; s.serieT = s.ecoule;
  if (s.serie < SERIE_RATEE) { s.message = `Raté : ${s.serie} de suite`; s.msgT = 1.4; return; }
  s.serie = 0;
  if (s.triche?.immortel) return;
  const k = perdUneVie(s, 'Cinq ratés de suite !');
  s.plein = s.ecoule + COEUR_RATES;
  choc(s, 0.3);
  sonFlash('TA5');
  plus(s, COEUR_RATES, () => coeurPerdu(s, k));
}

/**
 * Tape un terrier : un membre rapporte un point, un cornichon coûte une vie.
 * @param {object} s état de la partie
 * @param {object} t terrier
 */
function frappe(s, t) {
  if (!sorti(t) || t.fait) return;
  t.fait = true;
  t.hCoup = hauteurVue(s, t); t.coup = s.ecoule;
  if (!s.reduit) s.mart = { t0: s.ecoule, x: t.x, y: t.y };
  if (t.cornichon) {
    let k = null;
    if (!s.triche?.immortel) { k = perdUneVie(s, 'Pas le cornichon !'); s.cornichons++; }
    plus(s, IMPACT, () => splat(s, t, k));
  } else {
    s.score++; s.serie = 0;
    plus(s, IMPACT, () => pafMembre(s, t));
  }
  rentre(t);
}

export const JEU = {
  id: 'taupe',
  titre: 'Tape-taupe',
  accroche: 'Tape les membres, pas les cornichons',
  quip: 'Les membres retiennent leur souffle.',
  directions: true,
  action: true,
  aide: 'Clique ou touche un membre qui sort (ou flèches + espace). Un cornichon vert ne se tape pas (-1 vie). Cinq membres ratés de suite : -1 vie.',
  aideBorne: 'CLIC OU TOUCHE · ESPACE : TAPER',
  init: ({ reduit }) => ({
    reduit, lent: reduit ? 0.8 : 1,
    ecoule: 0, score: 0, vies: VIES, serie: 0, pousse: 0.6,
    serieT: -9, plein: -9, cornichons: 0, mart: null, attente: [],
    curseur: { c: 1, l: 1 }, clavier: false,
    trous: Array.from({ length: TERRIERS }, (_, i) => ({
      x: XS[i % 3], y: YS[Math.floor(i / 3)], etat: 'vide', t: 0, h: 0, h0: 0, duree: 1,
      lettre: null, cornichon: false, fait: false, age: 0, coup: -1, hCoup: 0, sq: -9, paf: -9,
    })),
    flash: 0, secousse: 0, message: '', msgT: 0,
  }),
  update(s, dt, e) {
    s.ecoule += dt;
    s.flash = Math.max(0, s.flash - dt);
    s.secousse = Math.max(0, s.secousse - dt);
    s.msgT = Math.max(0, s.msgT - dt);
    majFX(s, dt);
    if (s.attente.some((a) => a.t <= s.ecoule)) {
      const prets = s.attente.filter((a) => a.t <= s.ecoule);
      s.attente = s.attente.filter((a) => a.t > s.ecoule);
      for (const a of prets) a.fn();
    }
    if (s.vies <= 0) return; // partie finie : terriers arrêtés, seuls les effets continuent
    // Flèches : déplacent le curseur de case ; le pointeur n'est plus visé (espace tape la case du curseur).
    if (e.dir) {
      s.clavier = true; e.cible = null; e.cibleY = null;
      const c = s.curseur;
      if (e.dir === 'haut') c.l = Math.max(0, c.l - 1);
      else if (e.dir === 'bas') c.l = Math.min(2, c.l + 1);
      else if (e.dir === 'gauche') c.c = Math.max(0, c.c - 1);
      else if (e.dir === 'droite') c.c = Math.min(2, c.c + 1);
    }
    // Clic ou doigt sur un avatar ; espace sans pointeur tape la case du curseur.
    if (e.action) {
      if (e.cible !== null && e.cibleY !== null) {
        s.clavier = false;
        const t = trouAvatar(s, e.cible, e.cibleY);
        if (t) frappe(s, t);
      } else {
        frappe(s, s.trous[s.curseur.l * 3 + s.curseur.c]);
      }
    }
    // Sorties : une seule à la fois par intervalle (au plus une toutes les 0,5 s).
    const intervalle = (s.reduit ? 1.25 : 1) / (paliers(s.ecoule) * s.lent);
    s.pousse += dt;
    if (s.pousse >= Math.max(PLANCHER_SORTIE, intervalle)) {
      s.pousse = 0;
      const libres = s.trous.filter((t) => t.etat === 'vide');
      if (libres.length) {
        const t = libres[Math.floor(Math.random() * libres.length)];
        const cornichonCeTour = !s.triche?.coeurs && Math.random() < CORNICHON_P;
        t.etat = 'monte'; t.t = 0; t.h = 0; t.h0 = 0;
        t.duree = Math.max(0.4, 1.6 / paliers(s.ecoule)) * (s.reduit ? 1.3 : 1);
        t.cornichon = cornichonCeTour;
        t.lettre = cornichonCeTour ? null : LETTRES[Math.floor(Math.random() * LETTRES.length)];
        t.fait = false; t.age = 0; t.coup = -1; t.sq = -9;
        poussiere(s, t.x, t.y + 4, 8, MOTTE, 60, 0.45, 3, 140);
        onde(s, t.x, t.y + 6, 8, 46, 'rgba(122,92,67,.8)', 0.3, 2);
        sonFlash('TA1');
      }
    }
    // Évolution des terriers : montée, sortie, descente ; un membre rentré sans être tapé compte comme raté.
    for (const t of s.trous) {
      if (t.etat === 'vide') continue;
      t.t += dt; t.age += dt;
      if (t.etat === 'monte') {
        t.h = Math.min(1, t.t / MONTEE);
        if (t.t >= MONTEE) { t.etat = 'sorti'; t.t = 0; t.h = 1; }
      } else if (t.etat === 'sorti') {
        if (t.t >= t.duree) { rentre(t); if (!t.cornichon) sonFlash('TA4'); }
      } else if (t.etat === 'rentre') {
        t.h = t.h0 * Math.max(0, 1 - t.t / MONTEE);
        if (t.t >= MONTEE) {
          if (!t.cornichon && !t.fait) rate(s);
          t.etat = 'vide'; t.h = 0; t.h0 = 0;
        }
      }
    }
  },
  draw(ctx, s) {
    const T = s.ecoule;
    ctx.save();
    if (s.secousse > 0) ctx.translate((Math.random() - 0.5) * 8, 0);
    ctx.fillStyle = HERBE; ctx.fillRect(0, 70, W, 300);
    for (const t of s.trous) terrier(ctx, t.x, t.y, 'fond');
    for (const t of s.trous) {
      const h = hauteurVue(s, t);
      if (h <= 0.02) continue;
      const y = t.y - h * ALT, dz = T - t.sq, sq = dz / 0.2;
      // L'avatar n'apparaît qu'au-dessus de la motte ; le marteau l'écrase contre elle.
      const k = sq >= 0 && sq < 1 && !s.reduit ? 1 - 0.4 * Math.sin(sq * Math.PI) : 1;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, t.y + 4); ctx.clip();
      ctx.translate(t.x, t.y + 4); ctx.scale(1 + (1 - k) * 0.5, k); ctx.translate(-t.x, -(t.y + 4));
      if (t.cornichon) cornichon(ctx, t.x, y);
      else if (s.triche?.coeurs) coeur(ctx, t.x, y, 22);
      else avatar(ctx, t.x, y, t.lettre);
      ctx.restore();
      if (dz >= 0 && dz < 0.5 && !s.reduit && !t.cornichon) {
        ctx.fillStyle = OR;
        for (let i = 0; i < 3; i += 1) {
          const a = T * 9 + i * 2.09;
          etoile(ctx, t.x + Math.cos(a) * 24, y - 30 + Math.sin(a) * 6, 5); ctx.fill();
        }
      }
    }
    for (const t of s.trous) terrier(ctx, t.x, t.y, 'devant');
    if (s.clavier) {
      const c = s.trous[s.curseur.l * 3 + s.curseur.c];
      ctx.strokeStyle = OR; ctx.lineWidth = 2;
      ctx.strokeRect(c.x - 46, c.y - 46, 92, 70);
    }
    for (const t of s.trous) {
      const p = (T - t.paf) / DUREE_PAF;
      if (p < 0 || p >= 1) continue;
      ctx.globalAlpha = Math.min(1, (1 - p) * 3);
      bam(ctx, t.x, t.y - 66, s.reduit ? 1 : 0.6 + 0.5 * rebond(p * 3));
      ctx.globalAlpha = 1;
    }
    if (s.mart) {
      const m = s.mart, k = (T - m.t0) / IMPACT, fin = (T - m.t0 - 0.22) / 0.2;
      if (fin < 1) {
        const th = k < 1 ? 0.7 - 1.35 * ease(k) : -0.65 + Math.max(0, fin) * 0.5;
        ctx.globalAlpha = fin > 0 ? 1 - fin : 1;
        marteau(ctx, m.x + 34, m.y + 42, th);
        ctx.globalAlpha = 1;
      }
    }
    dessineFX(ctx, s);
    pips(ctx, s, T);
    if (s.msgT > 0) {
      ctx.globalAlpha = Math.min(1, s.msgT / 0.4);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, H - 52, W, 30);
      ctx.fillStyle = '#F2EFEA'; ctx.font = `16px ${TITRE}`; ctx.textAlign = 'center';
      ctx.fillText(s.message, W / 2, H - 31);
      ctx.globalAlpha = 1; ctx.textAlign = 'start';
    }
    ctx.restore();
    if (s.flash > 0) { ctx.fillStyle = `rgba(224, 64, 75, ${s.flash})`; ctx.fillRect(0, 0, W, H); }
    dessineFX(ctx, s, true);
  },
  /** Emblème de l'écran commun : un membre sort du terrier, le marteau le guette. T : temps en secondes. */
  embleme(ctx, x, y, T) {
    disque(ctx, x, y + 26, 38, 15, TROU);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, y + 30); ctx.clip();
    avatar(ctx, x, y - 4 + Math.sin(T * 4) * 4, 'D');
    ctx.restore();
    disque(ctx, x, y + 35, 42, 15, TERRE);
    marteau(ctx, x + 48, y + 38, -0.5 + Math.sin(T * 4) * 0.25);
  },
  /** Texte de fin de partie, repris par l'écran de fin commun (les ratés coûtent aussi des cœurs). */
  finTexte: (s) => ({ t: 'Plus de cœurs !', d: s.cornichons >= VIES ? 'Trois cornichons tapés, aïe aïe aïe.' : 'Trois cœurs envolés, aïe aïe aïe.' }),
  score: (s) => s.score,
  vies: (s) => ({ left: s.vies, max: VIES }),
  fini: (s) => s.vies <= 0,
  /* Le temps du marteau, puis du cœur qui éclate. */
  dureeFin: () => 1,
};
