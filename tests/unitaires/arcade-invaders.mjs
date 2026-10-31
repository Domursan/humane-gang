// Space Invaders de l'arcade (eggs/jeu-invaders.js) : règles, codes de triche et cadence serveur, sans navigateur.
// Lancer : node tests/unitaires/arcade-invaders.mjs
import { JEU } from '../../site/assets/espaces/arcade/jeu-invaders.js';
import { simule } from '../lib/faux-canevas.mjs';

// Hasard reproductible : le test donne toujours le même résultat.
let graine = 20261026;
Math.random = () => { graine = (Math.imul(graine, 1664525) + 1013904223) >>> 0; return graine / 4294967296; };

/** Cadence maximale de points par seconde acceptée par le serveur. */
const SERVEUR = 40;
const COLS = 8, LIGNES = 5, ESP_X = 34, AW = 21;
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('OK     ' + m); } else { ko++; console.log('ECHEC  ' + m); } };

/** Colonne vivante la plus proche du vaisseau (le « joueur intelligent » s'y place et tire sans arrêt). */
function vise(s) {
  let meilleur = null, d = Infinity;
  for (let c = 0; c < COLS; c++) {
    let vivant = false;
    for (let l = 0; l < LIGNES; l++) if (s.vivants[l * COLS + c]) vivant = true;
    if (!vivant) continue;
    const x = s.fx + c * ESP_X + AW / 2;
    if (Math.abs(x - s.x) < d) { d = Math.abs(x - s.x); meilleur = x; }
  }
  return meilleur;
}
/** Joueur intelligent : se place sous la colonne la plus proche et tire en continu. */
const malin = (s) => ({ cible: vise(s), tenu: true });
/** Joueur passif : ne bouge pas et ne tire pas. */
const immobile = () => ({});

/**
 * Joue une partie en notant le score avant chaque image (pour mesurer les cadences).
 * @returns {{s: object, t: number, hist: number[][], info: object}} état final, durée, [temps, score], mesures
 */
function joue(triche, secondes, entree) {
  const hist = [];
  const info = { maxGouttes: 0, tirs: [], prec: null, vieMin: 3 };
  const r = simule(JEU, {
    secondes, triche,
    entree: (s, t) => {
      hist.push([t, s.score]);
      info.maxGouttes = Math.max(info.maxGouttes, s.gouttes.length);
      if (s.tir && s.tir !== info.prec) info.tirs.push(t);
      info.prec = s.tir;
      info.vieMin = Math.min(info.vieMin, s.vies);
      return entree(s, t);
    },
  });
  hist.push([r.t, r.s.score]);
  return { ...r, hist, info };
}

/** Plus forte hausse de points sur une seconde glissante. */
function pic1s(hist) {
  let max = 0;
  for (let i = 0, j = 0; i < hist.length; i++) {
    while (hist[i][0] - hist[j][0] > 1) j++;
    max = Math.max(max, hist[i][1] - hist[j][1]);
  }
  return max;
}

/** Le score dépasse-t-il à un instant la cadence serveur cumulée (points autorisés × durée) ? */
const depasse = (hist) => hist.some(([t, sc]) => sc > SERVEUR * t + 1e-9);

// 1. Joueur intelligent pendant 120 s : pas d'exception, score plausible.
const a = joue({ coeurs: false, immortel: false }, 120, malin);
const scoreA = a.s.score;
check(Number.isInteger(scoreA) && scoreA > 0, `120 s de jeu intelligent : score entier positif (${scoreA} points en ${a.t.toFixed(1)} s, vague ${a.s.vague})`);

// 2. Cadence : cumul sous 40 points par seconde ; tirs espacés d'au moins 0,35 s.
const cadenceA = scoreA / a.t;
check(!depasse(a.hist) && cadenceA < 20, `cadence du joueur intelligent : ${cadenceA.toFixed(1)} points/s en moyenne, cumul jamais au-dessus de 40 × durée`);
let ecartMin = Infinity;
for (let i = 1; i < a.info.tirs.length; i++) ecartMin = Math.min(ecartMin, a.info.tirs[i] - a.info.tirs[i - 1]);
check(ecartMin >= 0.35 - 1e-9, `tirs espacés d'au moins 0,35 s (écart minimal ${ecartMin.toFixed(3)} s sur ${a.info.tirs.length} tirs)`);

// Pire cas : joueur intelligent en code « immortel » (la partie ne s'arrête pas, les vagues s'enchaînent).
const pire = joue({ coeurs: false, immortel: true }, 120, malin);
const cadencePire = pire.s.score / pire.t;
check(!depasse(pire.hist), `pire cas (immortel, 120 s) : cumul jamais au-dessus de 40 × durée (${pire.s.score} points, vague ${pire.s.vague})`);
console.log(`INFO   moyenne ${cadencePire.toFixed(1)} points/s ; plus forte hausse sur 1 s : ${pic1s(pire.hist)} points (une soucoupe seule vaut 50)`);

// 3a. Code « domu » : aucune goutte pendant 120 s, aucune vie perdue.
const c = joue({ coeurs: true, immortel: false }, 120, malin);
check(c.info.maxGouttes === 0 && c.info.vieMin === 3, `code « domu » : aucune goutte de vinaigre en 120 s (vies gardées : ${c.info.vieMin}/3)`);

// 3b. Code « immortel » : la partie ne finit pas en 120 s, même en jouant mal.
const im = joue({ coeurs: false, immortel: true }, 120, immobile);
check(!JEU.fini(im.s) && im.t >= 120 - 1e-6 && im.info.vieMin === 3, `code « immortel » : partie toujours en cours après 120 s en jouant mal (vies : ${im.s.vies}/3)`);

// 4. Sans code et sans jouer, la partie finit.
const f = joue({ coeurs: false, immortel: false }, 300, immobile);
check(JEU.fini(f.s) && f.t < 300, `sans code et sans jouer : la partie finit (après ${f.t.toFixed(1)} s, score ${f.s.score})`);

// 5. Derniers effets (dureeFin) : le dernier cœur éclate, plus rien ne compte ; la formation ne bouge plus.
const m = JEU.init({ reduit: false });
m.triche = { coeurs: false, immortel: false };
m.vies = 1; m.attente = 0; m.tirE = 9;
m.gouttes = [{ x: m.x, y: 379 }];
const vide = { cible: null, fleche: 0, action: false, tenu: false };
JEU.update(m, 0.016, vide);
const formX = m.formX, gouttes = m.gouttes.length;
check(JEU.fini(m) && m.coeurs.length === 1, 'dernière goutte : partie finie, cœur différé en attente');
let eclat = false;
for (let t = 0; t < JEU.dureeFin(m); t += 0.016) { JEU.update(m, 0.016, vide); eclat ||= m.fx.some((x) => x.k === 'demi'); }
check(eclat && m.vies === 0 && m.score === 0 && m.formX === formX && m.gouttes.length === gouttes, 'dureeFin : le cœur éclate, score, vies et formation figés');

console.log(`\n${ok} OK, ${ko} ECHEC(S)`);
process.exit(ko ? 1 : 0);
