require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours C14 · Ma chance en chiffres (onglet Collection de cartes.html, migration 082).
// 1. Sans la migration : aucun encart. 2. Moins de 100 cartes : « Pas encore assez de tirages ».
// 3. 312 cartes : verdict, 6 raretés (identité cachée sans tirage), brillantes, 2 garanties, série sans Épique,
//    meilleure ouverture (5 cartes), repli mémorisé, partage = téléchargement d'un PNG (sans feuille de partage).
// 4. 360 px : pas de défilement horizontal. Faux Supabase : fixtures/fake-sb-cartes.mjs (scénario luck).
// Lancer : node tests/parcours/cartes/parcours-c14.cjs
const path = require('path');
const { openPage, check, finish, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const F = 'fake-sb-cartes.mjs';
/** Ouvre la page Cartes sur l'onglet Collection. */
async function collection(browser, scenario, width = 390) {
  const p = await openPage(browser, { page: 'cartes', fixture: F, width, height: 900, scenario, hash: '#collection' });
  await sleep(600);
  return p;
}
(async () => {
  const browser = await chromium.launch();

  const a = await collection(browser, {});
  check(await a.$eval('#cartes-luck-slot', (e) => !e.innerHTML.trim()), 'sans migration : encart vide');
  check(a.errs.length === 0, `sans migration : aucune erreur (${a.errs.join(' | ') || 'rien'})`);
  await a.ctx.close();

  const b = await collection(browser, { luck: 'peu' });
  check(/Pas encore assez de tirages/.test(await b.$eval('.luck-pill', (e) => e.innerText)), 'moins de 100 cartes : verdict en attente');
  check(/verdict à partir de 100 cartes/.test(await b.$eval('.luck-intro', (e) => e.textContent)), 'seuil de 100 cartes expliqué');
  await b.ctx.close();

  const p = await collection(browser, { luck: 'beaucoup' });
  check(await p.$eval('[data-luck]', (d) => !d.open), 'encart replié à l’arrivée');
  await p.click('.luck-sum');
  check(/Légèrement chanceux/.test(await p.$eval('.luck-pill', (e) => e.innerText)), 'verdict « Légèrement chanceux »');
  check(await p.$$eval('.luck-row', (r) => r.length) === 6, '6 raretés (identité cachée sans tirage)');
  check(/60,0 %/.test(await p.$eval('.luck-row', (r) => r.innerText)) && /57,8 %/.test(await p.$eval('.luck-row', (r) => r.innerText)), 'commune : 60,0 % → 57,8 %');
  check(await p.$$eval('.luck-row .luck-up', (r) => r.length) >= 3, 'raretés au-dessus de l’attendu en vert');
  check(/3,8 %/.test(await p.$eval('[data-luck]', (e) => e.innerText)), 'taux de brillantes');
  check(await p.$$eval('.luck-pity li', (r) => r.length) === 2 && /dans\s+7\s+boosters/.test(await p.$eval('.luck-pity', (e) => e.innerText)), 'garanties en cours (Classique : 7)');
  check(/Plus longue série sans Épique : 18 boosters/.test(await p.$eval('[data-luck]', (e) => e.innerText)), 'plus longue série sans Épique');
  check(await p.$$eval('.luck-best .hgc', (r) => r.length) === 5, 'meilleure ouverture : 5 cartes');
  check(/cadeaux, drops ni fabrications/.test(await p.$eval('.luck-note', (e) => e.innerText)), 'note : seules les cartes de booster comptent');
  check(await p.evaluate(() => document.querySelector('#cartes-luck-slot').compareDocumentPosition(document.querySelector('#cartes-set')) & Node.DOCUMENT_POSITION_FOLLOWING), 'encart en tête de la Collection');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.click('[data-luck-act="share"]')]);
  check(dl && dl.suggestedFilename() === 'ma-chance-hg.png', 'partage : image PNG téléchargée');
  // Repli gardé pendant la visite
  await p.click('.luck-sum');
  await sleep(150);
  await p.evaluate(() => { location.hash = 'classement'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
  await sleep(300);
  await p.evaluate(() => { location.hash = 'collection'; });
  await sleep(500);
  check(await p.$eval('[data-luck]', (d) => !d.open), 'état replié gardé après un changement d’onglet');
  check(await p.$eval('.luck-sum', (s) => s.getBoundingClientRect().height >= 44), 'résumé cliquable ≥ 44 px');
  check(p.errs.length === 0, `aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  const n = await collection(browser, { luck: 'beaucoup' }, 360);
  check(await hscroll(n) === 0, '360 px : pas de défilement horizontal');
  await n.screenshot({ path: path.join(__dirname, '..', '..', 'shots', 'c14-ma-chance-360.png'), fullPage: true });
  await n.ctx.close();

  await browser.close();
  finish();
})();
