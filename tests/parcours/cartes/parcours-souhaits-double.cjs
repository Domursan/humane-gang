// Parcours : « Tu l'as en double » dans la collection d'un membre (idée 55, lot 6).
// 1. Collection d'Alice (#collection/<id>) : bloc « Sa liste de souhaits » sous l'en-tête, ses souhaits, ceux que j'ai en double d'abord.
// 2. Repères « Tu l’as en double » (avec « Lui proposer ») et « Tu l’as » (un seul exemplaire, sans bouton).
// 3. « Lui proposer » : l'éditeur d'offre s'ouvre avec Alice, mon exemplaire (simple plutôt que brillant) coché dans « Je donne »,
//    en tête de la grille ; les cartes demandées dans sa collection restent cochées dans « Je demande ».
// 4. « Lui proposer les 3 cartes » : un exemplaire de chaque carte en double coché.
// 5. Liste vide, aucune carte en double chez moi. 6. Téléphone 390 px, thème clair : pas de défilement horizontal ; aucune erreur.
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario « echanges » et souhaitsAlice. Mes exemplaires : C1 ×3 (2 brillant),
// C2 ×1, C3 ×2 (5, 6), C5 ×2 (10, 11 brillant) ; donc C1 → 3, C3 → 6, C5 → 10.
// Lancer : node tests/parcours/cartes/parcours-souhaits-double.cjs
const path = require('path');
const { SHOTS, check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const ALICE = '00000002-0000-4000-8000-000000000002';
const SCN = (souhaitsAlice) => ({ echanges: true, set2Open: true, souhaitsAlice });
const ouvrir = (browser, souhaits, o = {}) => openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, hash: '#collection/' + ALICE, scenario: SCN(souhaits), ...o });
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim());
/** Cartes du bloc, dans l'ordre affiché (data-card de la carte, lue dans cardHtml). */
const ordre = (p) => p.$$eval('.pv-souhaits .pv-cell', (x) => x.map((c) => c.querySelector('[data-action="peer-give"]')?.dataset.card || c.querySelector('.hgc-name, .hgc-title')?.textContent.trim() || '?'));
const tagsDe = (p, i) => p.$$eval('.pv-souhaits .pv-cell', (x, i) => [...x[i].querySelectorAll('.pv-tag')].map((t) => t.textContent.trim()), i);
const coches = (p, side) => p.$$eval(`#trd-grid-${side} button[data-side=${side}][aria-pressed=true]`, (x) => x.map((b) => b.dataset.id).sort());
const premiere = (p, side) => p.$eval(`#trd-grid-${side} button[data-side=${side}]`, (b) => b.dataset.id);
const attendreEditeur = async (p) => { await p.waitForSelector('#trd-edit[open]', { timeout: 5000 }).catch(() => {}); await sleep(250); };

(async () => {
  const browser = await chromium.launch();

  /* 1. Le bloc */
  let p = await ouvrir(browser, ['C2', 'C4', 'C8', 'C1', 'C3', 'C5']);
  await p.waitForSelector('.pv-souhaits', { timeout: 5000 }).catch(() => {});
  check(await p.$eval('.cartes-peer-head', (h) => h.nextElementSibling?.classList.contains('pv-souhaits')).catch(() => false), '(1) bloc juste sous l’en-tête de sa collection');
  check(await txt(p, '#pvs-h') === 'Sa liste de souhaits', '(1) titre « Sa liste de souhaits »');
  check(await txt(p, '.pv-souhaits .cz-group-count') === '6 cartes · 3 que tu as en double', '(1) compteur (' + (await txt(p, '.pv-souhaits .cz-group-count')) + ')');
  const cells = await p.$$('.pv-souhaits .pv-cell');
  check(cells.length === 6, '(1) six souhaits affichés');
  const o = await ordre(p);
  check(JSON.stringify(o.slice(0, 3)) === '["C5","C1","C3"]', '(1) mes doubles d’abord, la plus rare en tête (' + o.join(',') + ')');

  /* 2. Repères */
  check((await tagsDe(p, 0)).join('|') === 'Tu l’as en double', '(2) C5 : « Tu l’as en double »');
  const tousTags = await p.$$eval('.pv-souhaits .pv-cell', (x) => x.map((c) => [...c.querySelectorAll('.pv-tag')].map((t) => t.textContent.trim()).join('|')));
  check(tousTags.filter((t) => t === 'Tu l’as').length === 1, '(2) C2 (un exemplaire) : « Tu l’as », sans bouton (' + tousTags.join(' / ') + ')');
  check(tousTags.filter((t) => t === '').length === 2, '(2) C4 et C8 (je ne les ai pas) : aucun repère');
  check((await p.$$('.pv-souhaits [data-action="peer-give"]')).length === 3, '(2) trois boutons « Lui proposer »');
  check(await p.getAttribute('.pv-souhaits [data-action="peer-give"][data-card="C5"]', 'aria-label') === 'Proposer Soirée pizza à Alice', '(2) bouton nommé (carte et membre)');
  check(await txt(p, '[data-action="peer-give-all"]') === 'Lui proposer les 3 cartes', '(2) « Lui proposer les 3 cartes »');
  check(await p.$eval('.pvs-btn', (b) => b.getBoundingClientRect().height >= 44), '(2) cible tactile 44 px');
  await p.screenshot({ path: path.join(SHOTS, 'souhaits-double-1280.png') });

  /* 3. « Lui proposer » une carte, avec une carte demandée */
  await p.click('[data-action=peer-pick][data-card="C12"]');
  await sleep(150);
  await p.click('.pv-souhaits [data-action="peer-give"][data-card="C5"]');
  await attendreEditeur(p);
  check(await p.$eval('#trd-edit', (d) => d.open), '(3) éditeur d’offre ouvert');
  check(await txt(p, '#trd-edit-title') === 'Proposer un échange à Alice', '(3) avec Alice');
  check(JSON.stringify(await coches(p, 'give')) === '["10"]', '(3) « Je donne » : mon exemplaire simple de C5 (10), pas le brillant (' + (await coches(p, 'give')).join(',') + ')');
  check(await premiere(p, 'give') === '10', '(3) la carte cochée est en tête de « Tes cartes » (' + (await premiere(p, 'give')) + ')');
  check(JSON.stringify(await coches(p, 'want')) === '["106"]', '(3) « Je demande » : C12 demandée dans sa collection, toujours cochée');
  // Cocher une autre carte ne la fait pas sauter en tête
  const avant = await p.$$eval('#trd-grid-give button[data-side=give]', (x) => x.map((b) => b.dataset.id));
  await p.click(`#trd-grid-give button[data-side=give][data-id="${avant[avant.length - 1]}"]`);
  await sleep(150);
  const apres = await p.$$eval('#trd-grid-give button[data-side=give]', (x) => x.map((b) => b.dataset.id));
  check(JSON.stringify(avant) === JSON.stringify(apres), '(3) une carte cochée ensuite garde sa place');
  await p.ctx.close();

  /* 4. Toutes les cartes en double */
  p = await ouvrir(browser, ['C2', 'C4', 'C8', 'C1', 'C3', 'C5']);
  await p.waitForSelector('[data-action="peer-give-all"]', { timeout: 5000 });
  await p.click('[data-action="peer-give-all"]');
  await attendreEditeur(p);
  check(JSON.stringify(await coches(p, 'give')) === '["10","3","6"]', '(4) un exemplaire de chaque double coché (' + (await coches(p, 'give')).join(',') + ')');
  const tete = await p.$$eval('#trd-grid-give button[data-side=give]', (x) => x.slice(0, 3).map((b) => b.dataset.id).sort());
  check(JSON.stringify(tete) === '["10","3","6"]', '(4) les trois en tête de la grille');
  check(!p.errs.length, '(4) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* 5. Liste vide, puis aucun double */
  p = await ouvrir(browser, []);
  await p.waitForSelector('.pv-souhaits', { timeout: 5000 }).catch(() => {});
  check(await txt(p, '.pv-souhaits .empty') === 'Alice n’a encore rien mis dans sa liste de souhaits.', '(5) liste vide : message');
  check(await txt(p, '.pv-souhaits .cz-group-count') === 'vide', '(5) compteur « vide »');
  await p.ctx.close();
  p = await ouvrir(browser, ['C2', 'C8']);
  await p.waitForSelector('.pv-souhaits', { timeout: 5000 }).catch(() => {});
  check(/Tu n’as aucune de ces cartes en double/.test(await txt(p, '.pv-souhaits')), '(5) aucun double : message');
  check(!(await p.$('[data-action="peer-give-all"], .pv-souhaits [data-action="peer-give"]')), '(5) aucun bouton « Lui proposer »');
  check(await txt(p, '.pv-souhaits .cz-group-count') === '2 cartes', '(5) compteur sans doubles');
  await p.ctx.close();

  /* 6. Téléphone, thème clair */
  p = await ouvrir(browser, ['C2', 'C4', 'C8', 'C1', 'C3', 'C5'], { width: 390, height: 844, init: { content: "try{localStorage.setItem('hg_prefs',JSON.stringify({mode:'clair'}))}catch(e){}" } });
  await p.waitForSelector('.pv-souhaits', { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => { document.querySelector('.pv-souhaits').scrollIntoView(); });
  check((await hscroll(p)) === 0, '(6) téléphone : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'souhaits-double-390.png') });
  check(!p.errs.length, '(6) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})().catch(async (e) => { console.error(e); process.exitCode = 1; process.exit(1); });
