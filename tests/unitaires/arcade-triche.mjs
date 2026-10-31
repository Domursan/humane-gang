// Codes de triche de l'arcade (eggs/arcade.js) : « domu » (plus de pièges, cœurs) et → → ← ← ↓ ↑ ↓ ↑ (immortel).
// Test des règles des trois mini-jeux, sans navigateur : node tests/unitaires/arcade-triche.mjs
import { JEU as P } from '../../site/assets/espaces/arcade/jeu-paillettes.js';
import { JEU as R } from '../../site/assets/espaces/arcade/jeu-raclette.js';
import { JEU as D } from '../../site/assets/espaces/arcade/jeu-domu.js';
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('OK     ' + m); } else { ko++; console.log('ECHEC  ' + m); } };
/** Joue n secondes ; à chaque image le joueur se place sous le premier objet (pour attraper pièges et bonus). */
function joue(J, triche, n, suivre = true) {
  const s = J.init({ reduit: false }); s.triche = triche;
  let pieges = 0;
  for (let t = 0; t < n && !J.fini(s); t += 1 / 30) {
    const cible = suivre && s.items[0] ? s.items[0].x : null;
    const pas = J.voies && s.items.length ? Math.sign((s.items.find((i) => !i.j)?.voie ?? s.voie) - s.voie) : 0;
    J.update(s, 1 / 30, { cible, fleche: 0, pas });
    pieges += s.items.filter((i) => i.piege || i.corn || i.j === false).length > 0 ? 1 : 0;
  }
  return { s, pieges };
}
for (const [nom, J] of [['Paillettes', P], ['Raclette', R]]) {
  const a = joue(J, { coeurs: true, immortel: false }, 120);
  check(a.pieges === 0 && !J.fini(a.s), `${nom} « domu » : aucun piège en 2 min, partie toujours en cours (score ${J.score(a.s)})`);
  const b = joue(J, { coeurs: false, immortel: true }, 120);
  check(!J.fini(b.s) && J.vies(b.s).left === 3 && b.pieges > 0, `${nom} immortel : des pièges passent, 3 vies gardées`);
  const c = joue(J, { coeurs: false, immortel: false }, 300);
  check(J.fini(c.s), `${nom} sans code : la partie finit (pièges attrapés)`);
}
const d1 = joue(D, { coeurs: true, immortel: false }, 120);
check(d1.pieges === 0 && !D.fini(d1.s), `Domu-mobile « domu » : aucun bouchon en 2 min (score ${D.score(d1.s)})`);
const d2 = joue(D, { coeurs: false, immortel: true }, 120);
check(!D.fini(d2.s), 'Domu-mobile immortel : aucun accrochage en 2 min, même en fonçant dans les bouchons');
const d3 = joue(D, { coeurs: false, immortel: false }, 300);
check(D.fini(d3.s), 'Domu-mobile sans code : accrochage');

// Derniers effets (jeu.dureeFin) : le moteur continue update sans entrées ; rien ne bouge que les effets.
const sansEntree = { cible: null, fleche: 0, pas: 0 };
const r = R.init({ reduit: false }); r.triche = { coeurs: false, immortel: false }; r.vies = 1; r.score = 4;
r.items = [{ corn: true, x: r.x, y: 372, v: 0, a: 0 }, { corn: false, x: r.x, y: 300, v: 200, a: 0 }];
R.update(r, 1 / 30, sansEntree);
const objets = JSON.stringify(r.items);
check(R.fini(r) && r.file.some((f) => f.k === 'coeur'), 'Raclette : dernier cornichon, partie finie, cœur différé en attente');
let eclat = false;
for (let t = 0; t < R.dureeFin(r); t += 1 / 30) { R.update(r, 1 / 30, sansEntree); eclat ||= r.fx.some((f) => f.k === 'demi'); }
check(eclat && r.score === 4 && r.vies === 0 && JSON.stringify(r.items) === objets, 'Raclette : le cœur éclate pendant dureeFin, ni score ni vies ne bougent, les objets s’arrêtent');
const d = D.init({ reduit: false }); d.triche = { coeurs: false, immortel: false };
d.items = [{ j: false, voie: d.voie, y: 350, c: '#5A5A62' }];
D.update(d, 1 / 30, sansEntree);
const scoreD = D.score(d), fumee = d.fx.length;
for (let t = 0; t < D.dureeFin(d); t += 1 / 30) D.update(d, 1 / 30, sansEntree);
check(D.fini(d) && fumee > 0 && d.fx.length === 0 && D.score(d) === scoreD && d.flash === 0, 'Domu-mobile : l’explosion finit pendant dureeFin, score figé');
console.log(`\n${ok} OK, ${ko} ECHEC(S)`);
process.exit(ko ? 1 : 0);
