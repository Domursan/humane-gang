// ===== Humane Gang — arcade : « Casse-briques » =====
/*
 * Rôle : une balle rebondit sur la raquette (souris, doigt ou flèches) et casse des cartes à jouer aux couleurs de l'arc-en-ciel
 * du logo, une rangée par couleur. Certaines cartes sont « blindées » (deux coups, bord sable). Quand tout tombe, niveau suivant :
 * la balle accélère (+7 % par niveau, sans plafond) et un autre motif apparaît. Trois vies. La balle reste posée sur la raquette jusqu'à une action
 * (clic, appui, espace) au départ et après chaque vie perdue. Une carte sur douze lâche une Paillette : la rattraper = +15.
 * Points : 10 par carte, 20 pour une blindée (à sa destruction). Cadence : les points rejoignent le compteur au plus à
 * 14 par seconde (compteur qui défile), donc une tunnel de cartes ne dépasse jamais la cadence serveur (40 par seconde).
 * Codes de triche (s.triche, eggs/arcade.js) : coeurs = la balle et les Paillettes deviennent des cœurs ; immortel = la balle
 * rebondit aussi sur le bas, aucune vie perdue. Les deux codes font rebondir la balle en bas : elle ne peut plus se perdre.
 * Moteur : eggs/arcade.js (creeArcade ; jeu.action = true). Animation réduite : balle un peu plus lente, pas de secousse ni d'éclats.
 * Effets et sons (fx.js, maquette flash) : CB1 rebond raquette (elle s'allume, anneau, poussière), CB2 rebond mur, CB3 carte cassée
 * (note plus aiguë vers le haut, morceaux, « +10 »), CB4 blindée fissurée (métal), CB5 Paillette « +15 » et étoiles, CB6 balle perdue
 * (le cœur du HUD éclate), CB7 niveau suivant (les cartes tombent en 0,45 s au plus, touchables une fois posées, le bandeau glisse). Traînée derrière la balle, texte de lancement qui
 * pulse. Animation réduite : aucun mouvement ni éclat, seulement les textes « + » et les sons.
 * Contient aussi les textes des écrans communs (titre, accroche, quip, aide, embleme, finTexte).
 * Exporte : JEU (règles du mini-jeu pour creeArcade).
 */
import { W, H, paillette, coeur } from './arcade.js';
import { sonFlash, poussiere, etoiles, flotte, onde, rayons, eclats, eclatCoeur, majFX, dessineFX } from './fx.js';

const NC = 8, NR = 6, CW = 28, CH = 36, ECART_X = 8, ECART_Y = 6;
const X0 = (W - (NC * CW + (NC - 1) * ECART_X)) / 2, Y0 = 44;
const PY = H - 34, PH = 10, DEMI = 36, R = 5, VITESSE_RAQ = 300;
const VIES = 3, V0 = 210;
/** Accélération de la balle : +7 % par niveau, sans plafond (la balle finit par être injouable). */
const HAUSSE = 0.07;
const CADENCE = 14, VAL_CARTE = 10, VAL_BLINDEE = 20, VAL_PAILLETTE = 15, UNE_SUR = 12;
const CHUTE = 105, TRAINEE = 0.18, DUREE_ENTREE = 0.25, DECALE_ENTREE = 0.015;
const COULEURS = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
const ROUGE_V = '#E0404B', OR = '#FBD32D', COURONNE = '#9E3543', SABLE = '#E2C77E', SABLE_FONCE = '#B8985A', BORD = '#F2EFEA', NUIT = '#14122a';
const borne = (v, a, b) => Math.min(b, Math.max(a, v));
const facile = (k) => 1 - (1 - k) ** 3;
const alea = (a, b) => a + Math.random() * (b - a);

/**
 * Motifs des niveaux : valeur 0 (vide), 1 (carte) ou 2 (carte blindée), selon la ligne r et la colonne c.
 * Un niveau sur six reprend le premier motif ; des blindées s'ajoutent aux niveaux suivants (voir grille).
 */
const MOTIFS = [
  (r) => (r === 0 ? 2 : 1),
  (r, c) => ((r + c) % 2 === 0 ? (c % 3 === 0 ? 2 : 1) : 0),
  (r, c) => (Math.abs(c - 3.5) <= r * 0.8 + 0.5 ? ((r + c) % 4 === 0 ? 2 : 1) : 0),
  (r, c) => (r === 0 || r === NR - 1 || c === 0 || c === NC - 1 ? (r === 0 || r === NR - 1 ? 2 : 1) : 0),
  (r, c) => ((c + r * 2) % 3 === 1 ? 0 : (r === 2 ? 2 : 1)),
  (r, c) => (r === 2 || r === 3 || c === 3 || c === 4 ? ((r + c) % 5 === 0 ? 2 : 1) : 0),
];

/**
 * Construit les cartes d'un niveau : une rangée par couleur, motif du niveau, blindées en plus aux niveaux suivants.
 * @param {number} niveau numéro du niveau (à partir de 1)
 * @returns {Array<{x: number, y: number, r: number, c: string, blindee: boolean, coups: number, fele: boolean}>}
 */
function grille(niveau) {
  const motif = MOTIFS[(niveau - 1) % MOTIFS.length];
  const bonus = Math.min(0.35, (niveau - 1) * 0.05);
  const cartes = [];
  for (let r = 0; r < NR; r++) {
    for (let c = 0; c < NC; c++) {
      const v = motif(r, c);
      if (!v) continue;
      const blindee = v === 2 || Math.random() < bonus;
      cartes.push({ x: X0 + c * (CW + ECART_X), y: Y0 + r * (CH + ECART_Y), r, c: COULEURS[r], blindee, coups: blindee ? 2 : 1, fele: false });
    }
  }
  return cartes;
}

/**
 * Vitesse de la balle à un niveau : +7 % à chaque niveau, sans plafond ; un peu plus lente en animation réduite.
 * @param {number} niveau
 * @param {boolean} reduit
 * @returns {number} pixels logiques par seconde
 */
function vitesse(niveau, reduit) {
  return V0 * (1 + HAUSSE) ** (niveau - 1) * (reduit ? 0.8 : 1);
}

/**
 * Dessine une carte à jouer : fond blanc (ou sable si blindée), couleur de la rangée, indice et symbole blancs.
 * Une blindée déjà touchée montre une fissure.
 * @param {CanvasRenderingContext2D} ctx contexte du canevas
 * @param {object} b carte (voir grille)
 * @param {number} [dy] décalage vertical (arrivée d'un niveau)
 */
function carte(ctx, b, dy = 0) {
  const { x } = b, y = b.y + dy;
  ctx.fillStyle = b.blindee ? (b.fele ? SABLE_FONCE : SABLE) : BORD;
  ctx.fillRect(x, y, CW, CH);
  ctx.fillStyle = b.c; ctx.fillRect(x + 2, y + 2, CW - 4, CH - 4);
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillRect(x + 4, y + 4, 3, 4);
  const cx = x + CW / 2, cy = y + CH / 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 4, cy);
  ctx.closePath(); ctx.fill();
  if (b.fele) {
    ctx.strokeStyle = NUIT; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 6, y + 4); ctx.lineTo(x + 13, y + 14); ctx.lineTo(x + 10, y + 20); ctx.lineTo(x + 20, y + 32); ctx.stroke();
  }
}

/**
 * Progression de la chute d'une carte à l'arrivée d'un niveau (< 1 : encore en l'air, 1 ou plus : posée). Au plus 0,45 s en tout.
 * @param {object} s état de la partie
 * @param {object} b carte
 * @returns {number} avancement, 1 si aucune animation
 */
function chute(s, b) {
  if (s.reduit || s.entree <= -9) return 1;
  return (s.ecoule - s.entree - (b.r + (b.x - X0) / 36) * DECALE_ENTREE) / DUREE_ENTREE;
}

/**
 * Lance la balle depuis la raquette, vers le haut et d'un côté au hasard.
 * @param {object} s état de la partie
 */
function lance(s) {
  const sens = Math.random() < 0.5 ? -1 : 1;
  s.vx = s.vit * 0.25 * sens;
  s.vy = -Math.sqrt(Math.max(s.vit * s.vit - s.vx * s.vx, 0));
  s.attente = false;
}

/**
 * Une vie perdue : la balle revient sur la raquette jusqu'à la prochaine action (flash rouge et secousse sauf animation réduite).
 * @param {object} s état de la partie
 */
function perdBalle(s) {
  s.vies--;
  s.flash = 0.35;
  if (!s.reduit) s.secousse = 0.3;
  sonFlash('CB6');
  eclatCoeur(s, W - 14 - (VIES - 1 - s.vies) * 18, 15, 8);
  poussiere(s, s.bx, H - 6, 8, ['#fff', ROUGE_V], 90, 0.5, 3);
  s.tr = [];
  s.attente = true; s.vx = 0; s.vy = 0;
  s.bx = s.px; s.by = PY - R - 1;
}

/**
 * Une carte touchée : une blindée perd un coup (fissure) ; sinon elle disparaît, rapporte ses points et peut lâcher une Paillette.
 * Les points vont dans le compteur à rythme borné (voir paye).
 * @param {object} s état de la partie
 * @param {object} b carte touchée
 */
function touche(s, b) {
  const cx = b.x + CW / 2;
  if (b.coups > 1) {
    b.coups--; b.fele = true;
    const cy = b.y + CH;
    poussiere(s, cx, cy, 6, [SABLE, '#fff', OR], 90, 0.4, 3);
    onde(s, cx, cy, 4, 26, SABLE, 0.3, 2);
    rayons(s, cx, cy, 6, 6, 22, '#fff', 0.25);
    if (!s.reduit) s.secousse = Math.max(s.secousse, 0.12);
    sonFlash('CB4');
    return;
  }
  s.briques = s.briques.filter((x) => x !== b);
  const pts = b.blindee ? VAL_BLINDEE : VAL_CARTE, cy = b.y + CH / 2;
  s.aCompter += pts;
  flotte(s, cx, cy - 6, `+${pts}`, b.blindee ? SABLE : b.c === '#4E2398' ? '#9A88C4' : b.c, 18);
  onde(s, cx, cy, 6, 38, b.c, 0.35, 2);
  for (let i = 0; i < 8; i++) {
    eclats(s, cx, cy, 1, [i % 3 === 0 && b.blindee ? SABLE : b.c], { v: 95, vie: 0.8, w: alea(7, 12), h: alea(7, 13) });
  }
  poussiere(s, cx, cy, 6, [b.c, '#fff'], 80, 0.45, 3);
  sonFlash('CB3', b.r);
  if (Math.random() * UNE_SUR < 1) s.chutes.push({ x: cx, y: cy, t: 0 });
}

/**
 * Un pas de simulation (petit, pour que la balle ne traverse jamais une carte) : murs, raquette, cartes, bas de l'écran.
 * @param {object} s état de la partie
 * @param {number} h durée du pas en secondes
 */
function pas(s, h) {
  s.bx += s.vx * h; s.by += s.vy * h;
  if (s.bx < R) { s.bx = R; s.vx = Math.abs(s.vx); sonFlash('CB2'); }
  else if (s.bx > W - R) { s.bx = W - R; s.vx = -Math.abs(s.vx); sonFlash('CB2'); }
  if (s.by < R) { s.by = R; s.vy = Math.abs(s.vy); sonFlash('CB2'); }
  // Raquette : l'angle dépend du point d'impact (bord = angle fort, centre = presque vertical).
  if (s.vy > 0 && s.by + R >= PY && s.by + R <= PY + PH + 6 && Math.abs(s.bx - s.px) <= DEMI + R) {
    const u = borne((s.bx - s.px) / DEMI, -1, 1);
    // Au centre, la balle ne doit pas remonter à la verticale (elle ferait des allers-retours sans fin) : angle minimal.
    const mini = s.vit * 0.3;
    s.vx = s.vit * 0.8 * u;
    if (Math.abs(s.vx) < mini) s.vx = (Math.random() < 0.5 ? -1 : 1) * mini;
    s.vy = -Math.sqrt(Math.max(s.vit * s.vit - s.vx * s.vx, 0));
    s.by = PY - R - 0.01;
    onde(s, s.bx, PY, 4, 24, '#fff', 0.25, 2);
    poussiere(s, s.bx, PY, 4, [SABLE, '#fff'], 50, 0.3, 2, 100);
    s.flashRaq = s.ecoule;
    sonFlash('CB1');
  }
  // Cartes : une seule par pas, du côté où la balle est entrée.
  for (const b of s.briques) {
    if (chute(s, b) < 1) continue; // la balle ignore une carte qui tombe encore
    const l = b.x - R, d = b.x + CW + R, t = b.y - R, bas = b.y + CH + R;
    if (s.bx > l && s.bx < d && s.by > t && s.by < bas) {
      const ox = Math.min(s.bx - l, d - s.bx), oy = Math.min(s.by - t, bas - s.by);
      if (ox < oy) {
        const gauche = s.bx < b.x + CW / 2;
        s.vx = gauche ? -Math.abs(s.vx) : Math.abs(s.vx);
        s.bx = gauche ? l - 0.01 : d + 0.01;
      } else {
        const haut = s.by < b.y + CH / 2;
        s.vy = haut ? -Math.abs(s.vy) : Math.abs(s.vy);
        s.by = haut ? t - 0.01 : bas + 0.01;
      }
      touche(s, b);
      break;
    }
  }
  // Bas de l'écran : rebond avec les codes de triche, sinon une vie perdue.
  if (s.by - R > H) {
    if (s.triche?.coeurs || s.triche?.immortel) { s.by = H - R; s.vy = -Math.abs(s.vy); sonFlash('CB2'); }
    else perdBalle(s);
  }
}

/**
 * Avance la balle sur une image, en pas de 3 pixels au plus.
 * @param {object} s état de la partie
 * @param {number} dt durée de l'image en secondes
 */
function avance(s, dt) {
  const n = Math.max(1, Math.ceil((s.vit * dt) / 3));
  const h = dt / n;
  for (let i = 0; i < n && !s.attente; i++) pas(s, h);
}

/** Niveau suivant : nouveau motif, balle un peu plus rapide (même direction). */
function niveauSuivant(s) {
  s.niveau++;
  s.briques = grille(s.niveau);
  const nv = vitesse(s.niveau, s.reduit);
  const k = nv / s.vit;
  s.vx *= k; s.vy *= k; s.vit = nv;
  s.niveauT = 1.6;
  s.entree = s.ecoule;
  sonFlash('CB7');
}

/**
 * Compteur de points à rythme borné : les points dus rejoignent le score au plus à CADENCE par seconde.
 * @param {object} s état de la partie
 * @param {number} dt durée de l'image en secondes
 */
function paye(s, dt) {
  if (s.aCompter <= 0) { s.aCompter = 0; s.cumul = 0; return; }
  s.cumul += CADENCE * dt;
  const n = Math.min(s.aCompter, Math.floor(s.cumul));
  s.score += n; s.aCompter -= n; s.cumul -= n;
}

export const JEU = {
  id: 'briques',
  titre: 'Casse-briques',
  action: true,
  accroche: 'Des cartes plein la tête',
  quip: 'La balle attend sur la raquette.',
  aide: 'Souris, doigt ou flèches gauche et droite : déplace la raquette ; clic, appui ou espace lance la balle. Casse toutes les cartes, 3 vies.',
  aideBorne: '← → OU SOURIS · ESPACE : LANCER',
  /** Emblème de l'écran de départ : trois cartes, une balle qui tourne et la raquette. */
  embleme(ctx, x, y, T) {
    carte(ctx, { x: x - 14, y: y - 52, c: COULEURS[2], blindee: false, coups: 1, fele: false });
    carte(ctx, { x: x - 52, y: y - 52, c: COULEURS[0], blindee: false, coups: 1, fele: false });
    carte(ctx, { x: x + 24, y: y - 52, c: COULEURS[4], blindee: true, coups: 2, fele: false });
    ctx.fillStyle = BORD; ctx.beginPath(); ctx.arc(x + 20 * Math.sin(T * 2.5), y + 6 + 8 * Math.cos(T * 2.5), R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COURONNE; ctx.fillRect(x - DEMI, y + 36, DEMI * 2, PH);
    ctx.fillStyle = SABLE; ctx.fillRect(x - DEMI, y + 36, DEMI * 2, 2);
  },
  finTexte: (s) => {
    const n = s.briques.length;
    return { t: 'Plus de balle !', d: n <= 1 ? 'Il restait une carte, juste une.' : `Il restait ${n} cartes, juste ${n}.` };
  },
  init: ({ reduit }) => ({
    reduit, lent: reduit ? 0.75 : 1, score: 0, vies: VIES, ecoule: 0, niveau: 1, niveauT: 1.2,
    briques: grille(1), px: W / 2, cible: W / 2, bx: W / 2, by: PY - R - 1, vx: 0, vy: 0,
    vit: vitesse(1, reduit), attente: true, aCompter: 0, cumul: 0,
    chutes: [], fx: [], tr: [], flash: 0, secousse: 0, flashRaq: -9, entree: -9,
  }),
  update(s, dt, e) {
    majFX(s, dt);
    if (s.vies <= 0) return;
    s.ecoule += dt;
    // Raquette : suit le pointeur, ou glisse avec les flèches.
    if (e.cible !== null) s.cible = borne(e.cible, DEMI, W - DEMI);
    if (e.fleche) s.cible = borne(s.cible + e.fleche * VITESSE_RAQ * dt, DEMI, W - DEMI);
    s.px += (s.cible - s.px) * Math.min(1, dt * 16);
    if (s.attente) {
      s.bx = s.px; s.by = PY - R - 1;
      if (e.action) lance(s);
    } else {
      avance(s, dt);
    }
    if (s.briques.length === 0) niveauSuivant(s);
    // Paillettes : elles tombent ; la raquette les attrape.
    for (const p of s.chutes) { p.t += dt; p.y += CHUTE * s.lent * dt; }
    s.chutes = s.chutes.filter((p) => {
      if (p.y >= PY - 6 && p.y <= PY + PH + 6 && Math.abs(p.x - s.px) < DEMI + 6) {
        s.aCompter += VAL_PAILLETTE;
        flotte(s, p.x, PY - 26, '+15', OR, 22);
        etoiles(s, p.x, PY - 6, 8, OR, 110, 0.6);
        poussiere(s, p.x, PY - 4, 8, [OR, '#FFF1BE'], 90, 0.5, 3);
        onde(s, p.x, PY - 4, 4, 34, OR, 0.4, 3);
        s.flashRaq = s.ecoule;
        sonFlash('CB5');
        return false;
      }
      return p.y < H + 10;
    });
    // Traînée de la balle (quelques points, jamais en animation réduite).
    if (!s.reduit) {
      if (!s.attente) s.tr.push({ x: s.bx, y: s.by, t: s.ecoule });
      while (s.tr.length && s.ecoule - s.tr[0].t > TRAINEE) s.tr.shift();
    }
    paye(s, dt);
    s.secousse = Math.max(0, s.secousse - dt);
    s.flash = Math.max(0, s.flash - dt);
    s.niveauT = Math.max(0, s.niveauT - dt);
  },
  draw(ctx, s) {
    const dx = s.secousse > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.save();
    ctx.translate(dx, 0);
    for (const b of s.briques) {
      let dy = 0;
      const k = chute(s, b);
      if (k < 0) continue;
      if (k < 1) dy = -(1 - facile(k)) * 240;
      carte(ctx, b, dy);
    }
    for (const p of s.chutes) {
      if (s.triche?.coeurs) coeur(ctx, p.x, p.y, 7);
      else paillette(ctx, p.x, p.y, 7 * (0.85 + 0.15 * Math.sin(p.t * 6)), OR);
    }
    for (let i = 0; i < s.tr.length; i++) {
      ctx.globalAlpha = (i / s.tr.length) * 0.35; ctx.fillStyle = BORD;
      ctx.beginPath(); ctx.arc(s.tr[i].x, s.tr[i].y, R * 0.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    dessineFX(ctx, s);
    if (s.triche?.coeurs) coeur(ctx, s.bx, s.by, 7);
    else { ctx.fillStyle = BORD; ctx.beginPath(); ctx.arc(s.bx, s.by, R, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = COURONNE; ctx.fillRect(s.px - DEMI, PY, DEMI * 2, PH);
    ctx.fillStyle = SABLE; ctx.fillRect(s.px - DEMI, PY, DEMI * 2, 2);
    ctx.fillStyle = BORD; ctx.fillRect(s.px - DEMI, PY + PH - 2, DEMI * 2, 2);
    const lueur = Math.max(0, 1 - (s.ecoule - s.flashRaq) / 0.2);
    if (lueur > 0 && !s.reduit) { ctx.fillStyle = `rgba(255,255,255,${lueur * 0.6})`; ctx.fillRect(s.px - DEMI, PY, DEMI * 2, PH); }
    ctx.restore();
    if (s.attente && s.vies > 0) {
      ctx.globalAlpha = s.reduit ? 0.75 : 0.45 + 0.3 * Math.sin(s.ecoule * 5); ctx.fillStyle = BORD; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Appuie pour lancer', W / 2, PY - 18); ctx.textAlign = 'start'; ctx.globalAlpha = 1;
    }
    if (s.niveauT > 0) {
      ctx.globalAlpha = Math.min(1, s.niveauT);
      const gl = s.reduit ? 0 : (1 - facile(Math.min(1, (1.6 - s.niveauT) / 0.25))) * -W;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(gl, H / 2 - 22, W, 44);
      ctx.fillStyle = BORD; ctx.font = '18px "Archivo Black", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(`Niveau ${s.niveau}`, W / 2 + gl, H / 2 + 6); ctx.textAlign = 'start';
      ctx.globalAlpha = 1;
    }
    dessineFX(ctx, s, true);
    if (s.flash > 0) { ctx.fillStyle = `rgba(224, 64, 75, ${s.flash})`; ctx.fillRect(0, 0, W, H); }
  },
  score: (s) => s.score,
  vies: (s) => ({ left: s.vies, max: VIES }),
  fini: (s) => s.vies <= 0,
};
