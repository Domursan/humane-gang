// Flappy Domu (eggs/jeu-flappy.js) : partie de 120 s avec un joueur « intelligent », cadence des points,
// codes « domu » (coeurs) et « immortel », et fin de partie sans jouer. Sans navigateur : node tests/unitaires/arcade-flappy.mjs
import { JEU as F } from '../../site/assets/espaces/arcade/jeu-flappy.js';
import { simule } from '../lib/faux-canevas.mjs';

// Hasard reproductible (générateur de Park-Miller) : le test donne toujours le même résultat.
let graine = 7;
Math.random = () => (graine = (graine * 16807) % 2147483647) / 2147483647;

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('OK     ' + m); } else { ko++; console.log('ECHEC  ' + m); } };

/** Joueur « intelligent » : bat des ailes pour rester dans le passage du prochain tuyau (ou au centre si aucun). */
function intelligent(s) {
  const p = s.tuyaux.find((q) => !q.passe);
  const cible = p ? p.haut + p.ouverture / 2 : 210;
  return { action: !s.debut || (s.y > cible + 10 && s.vy >= 0) };
}
/** Joueur « mal » : bat des ailes sans arrêt, ce qui le fait cogner le plafond. */
const malJoue = () => ({ action: true });
/** Aucune entrée : le joueur ne fait rien. */
const rien = () => ({});

// 1. Joueur intelligent : 120 s sans exception, il tient la partie et marque des points.
let a;
try {
  a = simule(F, { secondes: 120, reduit: true, entree: intelligent }); // reduit : pas de particules, qui consommeraient le hasard fixé
  check(a.s.score > 0 && !F.fini(a.s), `joueur intelligent : 120 s sans exception, partie en cours (score ${a.s.score})`);
} catch (e) {
  ko++; console.log('ECHEC  joueur intelligent : exception ' + e.message);
}
if (a) {
  check(F.vies(a.s) === null, 'une seule vie : vies() renvoie null');
  check(Number.isInteger(F.score(a.s)) && F.score(a.s) >= 0, 'score entier positif');
  check(F.score(a.s) >= 20, `score plausible sur 120 s (${F.score(a.s)} points)`);
}

// 2. Cadence : sous 1 point par seconde (cible), et loin du plafond serveur de 2 par seconde.
const tot = a.t, rate = F.score(a.s) / tot;
check(a.maxParSeconde <= 1 && rate < 1, `cadence : max ${a.maxParSeconde} point sur une fenêtre de 1 s, moyenne ${rate.toFixed(2)} par seconde (< 1)`);

// 3a. Code « domu » : les tuyaux ne tuent plus ; un cœur qui flotte ne meurt pas en 120 s.
const d = simule(F, { secondes: 120, triche: { coeurs: true, immortel: false }, entree: rien });
check(!F.fini(d.s), '« domu » : aucun tuyau dangereux, le cœur flottant survit 120 s');
// 3b. Code « domu » avec joueur intelligent : cadence toujours sous le plafond serveur (2 par seconde).
const dI = simule(F, { secondes: 120, triche: { coeurs: true, immortel: false }, entree: intelligent });
const rateD = F.score(dI.s) / dI.t;
check(dI.maxParSeconde <= 2 && rateD < 2 && F.score(dI.s) > 0, `« domu » : cadence max ${dI.maxParSeconde} sur 1 s, moyenne ${rateD.toFixed(2)} par seconde (<= 2), ${F.score(dI.s)} cœurs ramassés`);

// 3c. Code « immortel » : même en jouant mal, la partie continue 120 s.
const im = simule(F, { secondes: 120, triche: { coeurs: false, immortel: true }, entree: malJoue });
check(!F.fini(im.s) && im.t >= 120, `« immortel » : la partie ne finit pas en 120 s en jouant mal (score ${F.score(im.s)})`);
// Témoin : sans code, le même jeu finit vite.
const sansCode = simule(F, { secondes: 120, entree: malJoue });
check(F.fini(sansCode.s) && sansCode.t < 5, 'sans code, le même jeu mal joué finit vite (cogne le plafond)');

// 4. Sans code et sans jouer, la partie finit (tuyau, sol ou plafond).
const seul = simule(F, { secondes: 600, entree: rien });
check(F.fini(seul.s) && seul.t < 600, `sans code et sans jouer : la partie finit (à ${seul.t.toFixed(1)} s)`);

// 5. Derniers effets (dureeFin) : l'éclat du cœur finit de se jouer, le score ne bouge plus.
const scoreMort = seul.s.score, ecoule = seul.s.ecoule;
for (let t = 0; t < F.dureeFin(seul.s); t += 1 / 30) F.update(seul.s, 1 / 30, { action: false });
check(seul.s.fx.length === 0 && seul.s.flash === 0 && seul.s.score === scoreMort && seul.s.ecoule === ecoule, 'dureeFin : éclat terminé, partie figée');

console.log(`\n${ok} OK, ${ko} ECHEC(S)`);
process.exit(ko ? 1 : 0);
