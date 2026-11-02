// Parcours : séries communes des jeux du jour (idée 10, migration 206) et joker payant (idée 9, migration 207).
// Faux Supabase : fixtures/fake-sb.mjs (hg_jeux_series, hg_jeux_joker_payer : scénario { series: { solde, jeux: { <clé>: { n,
// joue, bascule, dans, joker } } } }) + fixtures/fake-jeux.js (Sutom, Question du jour).
// Vérifie : pastille dans Sutom (en attente, en danger, 0 jour), pastille « avant 6 h » de la Question du jour, flamme de
// « Ton programme du jour » (bug corrigé : elle ne s'affichait jamais), offre « Sauver ma série » dans « Ta semaine » avec
// confirmation et case « J✦ », solde trop bas, série trop courte, bandeau de Sutom, pastille du Code du jour (page Duels).
// Lancer : node tests/parcours/jeux/parcours-series.cjs
const { SHOTS, check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const fs = require('fs');
const path = require('path');

const offre = (o) => ({ jour: '2026-10-31', serie: 41, prix: 700, deja: false, possible: true, ...o });
const texte = async (p, sel) => ((await p.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(SHOTS, { recursive: true });

  /* ---------- Sutom : série en attente ---------- */
  let p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 1280, height: 900, init: 'fake-jeux.js',
    scenario: { series: { solde: 1000, jeux: { sutom: { n: 12, dans: 9 } } } } });
  await p.waitForSelector('.su-head .sj', { timeout: 6000 }).catch(() => {});
  let t = await texte(p, '.su-head .sj');
  check(t.includes('12 jours') && t.includes('à jouer avant minuit'), `Sutom : pastille « 12 jours · à jouer avant minuit » (${t})`);
  check(await p.locator('.su-head .sj.is-attente').count() === 1, 'Sutom : état « en attente »');
  check(await p.locator('.jk').count() === 0, 'Sutom : pas d’offre de joker quand la série tient');
  await p.close();

  /* ---------- Sutom : série en danger (moins de 6 h) ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 1280, height: 900, init: 'fake-jeux.js',
    scenario: { series: { jeux: { sutom: { n: 12, dans: 2 } } } } });
  await p.waitForSelector('.su-head .sj', { timeout: 6000 }).catch(() => {});
  t = await texte(p, '.su-head .sj');
  check(await p.locator('.su-head .sj.is-danger').count() === 1 && /en danger · plus que 1 h 5\d|en danger · plus que 2 h/.test(t), `Sutom : « en danger » à moins de 6 h (${t})`);
  await p.close();

  /* ---------- Sutom : pas de série ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 390, height: 844, init: 'fake-jeux.js',
    scenario: { series: { jeux: { sutom: { n: 0 } } } } });
  await p.waitForSelector('.su-head .sj', { timeout: 6000 }).catch(() => {});
  t = await texte(p, '.su-head .sj');
  check(await p.locator('.su-head .sj.is-zero').count() === 1 && t.includes('0 jour'), `Sutom : pastille grise « 0 jour » (${t})`);
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.close();

  /* ---------- Sutom : bandeau « Sauver ma série » ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 390, height: 844, init: 'fake-jeux.js',
    scenario: { series: { solde: 500, jeux: { sutom: { n: 0, joker: offre({ serie: 12, prix: 200 }) } } } } });
  await p.waitForSelector('.jk-bandeau', { timeout: 6000 }).catch(() => {});
  t = await texte(p, '.jk-bandeau');
  check(t.includes('12 jours') && t.includes('hier') && t.includes('200'), `Sutom : bandeau « série de 12 jours arrêtée hier · 200 » (${t})`);
  check(await p.locator('.su-head .sj.is-perdue').count() === 1, 'Sutom : pastille « à sauver »');
  const bb = await p.locator('.jk-bandeau .jk-btn').boundingBox();
  check(bb && bb.height >= 44, `bouton « Sauver ma série » : 44 px de haut au moins (${bb && Math.round(bb.height)})`);
  check((await hscroll(p)) <= 0, '390 px avec bandeau : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'series-sutom-bandeau-390.png'), fullPage: false });
  await p.close();

  /* ---------- Flamme de « Ton programme du jour » (page Jeux) ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#aujourdhui', width: 1280, height: 900, init: 'fake-jeux.js',
    scenario: { series: { jeux: { sutom: { n: 3 }, nj_pays: { n: 23, joue: true }, quiz_jour: { n: 5, bascule: '6h' } } } } });
  await p.waitForFunction(() => { const e = document.getElementById('jeux-serie'); return e && !e.hidden; }, null, { timeout: 8000 }).catch(() => {});
  t = await texte(p, '#jeux-serie');
  check(await p.locator('#jeux-serie:not([hidden])').count() === 1 && t.includes('23 jours'), `programme du jour : flamme avec la plus longue série (${t})`);
  await p.close();

  /* ---------- Question du jour : pastille 6 h, puis offre payée ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#jour', width: 1280, height: 900, init: 'fake-jeux.js',
    scenario: { series: { solde: 1240, jeux: { quiz_jour: { n: 0, bascule: '6h', dans: 14, joker: offre() } } } } });
  await p.waitForSelector('#jeux-panel-jour .qdj-week .jk', { timeout: 8000 }).catch(() => {});
  t = await texte(p, '#jeux-panel-jour .sj');
  check(await p.locator('#jeux-panel-jour .sj.is-perdue').count() === 1 && t.includes('41 jours') && t.includes('6 h'), `Question du jour : pastille « 41 jours · à sauver avant … 6 h » (${t})`);
  t = await texte(p, '#jeux-panel-jour .qdj-week .jk');
  check(t.includes('41 jours') && t.includes('700') && t.includes('un joker payant par semaine'), `« Ta semaine » : offre à 700 avec la règle (${t})`);
  await p.screenshot({ path: path.join(SHOTS, 'series-qdj-offre-1280.png'), fullPage: false });
  // La semaine relue après paiement montre le jour racheté (faux serveur : on la prépare avant le clic)
  await p.evaluate(() => { const w = window.__JEUX.jour.streak.week; w[2] = { ...w[2], state: 'joker', paye: true }; });
  await p.locator('#jeux-panel-jour [data-sjk-payer="quiz_jour"]').click();
  await p.waitForSelector('dialog.hg-dialog[open]', { timeout: 3000 }).catch(() => {});
  t = await texte(p, 'dialog.hg-dialog[open]');
  check(t.includes('Sauver ta série pour 700') && t.includes('1240') === false && /1.?240/.test(t) && /540/.test(t), `confirmation : prix et solde avant / après (${t})`);
  await p.locator('dialog.hg-dialog[open] button', { hasText: 'Payer 700' }).click();
  await sleep(900);
  check((await log(p)).some((l) => l[0] === 'joker_paye' && l[1] === 'quiz_jour' && l[2] === 700), 'paiement : hg_jeux_joker_payer appelé une fois (700)');
  check(await p.locator('#jeux-panel-jour .qdj-week .jk').count() === 0, 'après paiement : l’offre disparaît');
  t = await texte(p, '#jeux-panel-jour .sj');
  check(t.includes('41 jours') && !t.includes('sauver'), `après paiement : la série continue (${t})`);
  t = await texte(p, '#jeux-panel-jour .qdj-day.is-paye');
  check(t.includes('J✦'), `« Ta semaine » : case « J✦ » du jour racheté (${t})`);
  await p.close();

  /* ---------- Question du jour : solde trop bas ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#jour', width: 390, height: 844, init: 'fake-jeux.js',
    scenario: { series: { solde: 300, jeux: { quiz_jour: { n: 0, bascule: '6h', joker: offre() } } } } });
  await p.waitForSelector('#jeux-panel-jour .qdj-week .jk', { timeout: 8000 }).catch(() => {});
  check(await p.locator('#jeux-panel-jour .jk-btn[disabled]').count() === 1, 'solde trop bas : bouton désactivé');
  t = await texte(p, '#jeux-panel-jour .jk-n');
  check(t.includes('Il te manque 400'), `solde trop bas : « Il te manque 400 » (${t})`);
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'series-qdj-solde-390.png'), fullPage: false });
  await p.close();

  /* ---------- Question du jour : série trop courte, et joker déjà utilisé ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#jour', width: 1280, height: 900, init: 'fake-jeux.js',
    scenario: { series: { solde: 2000, jeux: { quiz_jour: { n: 0, bascule: '6h', joker: offre({ serie: 4, prix: null, possible: false }) } } } } });
  await p.waitForSelector('#jeux-panel-jour .qdj-week', { timeout: 8000 }).catch(() => {});
  await sleep(500);
  t = await texte(p, '#jeux-panel-jour .qdj-week');
  check(t.includes('à partir de 7 jours') && await p.locator('#jeux-panel-jour [data-sjk-payer]').count() === 0, 'série de 4 jours : pas d’offre, explication « à partir de 7 jours »');
  await p.close();
  p = await openPage(browser, { page: 'jeux', hash: '#jour', width: 1280, height: 900, init: 'fake-jeux.js',
    scenario: { series: { solde: 2000, jeux: { quiz_jour: { n: 0, bascule: '6h', joker: offre({ deja: true, possible: false }) } } } } });
  await p.waitForSelector('#jeux-panel-jour .qdj-week .jk', { timeout: 8000 }).catch(() => {});
  t = await texte(p, '#jeux-panel-jour .qdj-week .jk');
  check(t.includes('déjà utilisé ton joker payant de la semaine') && await p.locator('#jeux-panel-jour [data-sjk-payer]').count() === 0, 'joker de la semaine déjà pris : pas de bouton');
  await p.close();

  /* ---------- Code du jour (page Duels) ---------- */
  const init = { content: `
    window.__DUELS = { possibles: [], appels: [], etat: null, rpc: {} };
    window.__DUELS.rpc.hg_duel_jour = () => ({ jour: '2026-10-31', essais: [], trouve_en: null, fini: false, serie: 0, secret: null, classement: [], trouveurs: 0, gain: null });` };
  p = await openPage(browser, { page: 'duels', hash: '#jour', fixture: 'fake-sb-duels-plateaux.mjs', width: 1280, height: 900, init,
    scenario: { series: { jeux: { code_jour: { n: 6 } } } } });
  await p.waitForSelector('.duels-jour .sj', { timeout: 8000 }).catch(() => {});
  t = await texte(p, '.duels-jour .sj');
  check(t.includes('6 jours'), `Code du jour : pastille de série commune (${t})`);
  await p.close();

  await browser.close();
  finish();
})();
