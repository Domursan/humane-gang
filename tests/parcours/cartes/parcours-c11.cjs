// Parcours C11 : enchère hebdomadaire d'une carte unique (onglet Boutique).
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario c2 (enchère ouverte, « Le gobelet du RDV n° 1 », meilleure offre
// 1300 d'Alice, plafond 4100). Contrôles : encart en tête de la Boutique, vue détaillée (carte, « Fin dans », meilleure
// offre, minimum 1350, 4 dernières offres), offre trop basse refusée sans appel, offre valide envoyée puis affichée comme
// mienne, retour à la Boutique ; 360 px sans défilement ; admin : liste, planification d’un lot (vendredi 18 h par défaut).
// Lancer : node tests/parcours/cartes/parcours-c11.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim()).catch(() => '');

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, types: true, bal: 9000 }, width: 360, height: 800 });
  await p.evaluate(() => { location.hash = 'boutique'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
  await p.waitForSelector('.c2-auc-teaser', { timeout: 5000 }).catch(() => {});
  check(/Le gobelet du RDV n° 1/.test(await txt(p, '.c2-auc-teaser')) && /Fin dans 03 h 1\d min/.test(await txt(p, '.c2-auc-teaser')), 'encart : carte et temps restant');
  await p.click('[data-c2=auc-open]');
  await p.waitForSelector('.c2-auc', { state: 'visible', timeout: 5000 }).catch(() => {});
  await sleep(200);
  check(await p.isVisible('.c2-auc') && await p.isHidden('.shop'), 'vue détaillée affichée (boutique masquée)');
  check(/1.300/.test(await txt(p, '.c2-auc-price')) && /Alice/.test(await txt(p, '.c2-auc-boxes')), 'meilleure offre : 1 300 ✦, Alice');
  check(/minimum 1.350/.test(await txt(p, '.c2-auc-lab')), 'offre minimale 1 350 ✦');
  check(await p.$$eval('.c2-auc-bid', (x) => x.length) === 4, '4 dernières offres');
  check(await hscroll(p) === 0, '360 px : pas de défilement horizontal');
  await p.fill('#c2-auc-amount', '1000');
  await p.click('.c2-auc-form button[type=submit]');
  await sleep(200);
  check(/minimale/.test(await txt(p, '.c2-auc-err')) && !(await log(p)).some((l) => l[1] === 'hg_auction_bid'), 'offre trop basse : message, rien envoyé');
  await p.fill('#c2-auc-amount', '1400');
  await p.click('.c2-auc-form button[type=submit]');
  await sleep(700);
  const bid = (await log(p)).find((l) => l[1] === 'hg_auction_bid');
  check(bid && bid[2].p_auction === 'A1' && bid[2].p_amount === 1400, 'hg_auction_bid : 1400 sur A1');
  check(/\(toi\)/.test(await txt(p, '.c2-auc-boxes')) && /meilleure offre/.test(await txt(p, '.c2-auc-note')), 'mon offre en tête, message « Tu as la meilleure offre »');
  check(await p.isDisabled('.c2-auc-form button[type=submit]'), 'déjà en tête : bouton désactivé');
  await p.click('[data-c2=auc-close]');
  await sleep(200);
  check(await p.isVisible('.shop') && await p.isVisible('.c2-auc-teaser'), 'retour à la Boutique');
  check(!p.errs.length, 'cartes : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, uniques: true }, width: 1280, height: 900 });
  await adminSection(p, 'ventes/encheres');
  await p.waitForSelector('#acd-auc-form', { timeout: 5000 });
  check(/Le gobelet du RDV n° 1/.test(await txt(p, '#acd-encheres')) && /Ouverte/.test(await txt(p, '#acd-encheres')), 'admin : enchère en cours listée');
  const start = await p.inputValue('#au-start');
  check(new Date(start).getDay() === 5 && /T18:00$/.test(start), `admin : début proposé vendredi 18 h (${start})`);
  // Lot en panier (migration 215) : la carte unique C14 seule, nommée ; confirmation dans la fenêtre du give.
  await p.waitForSelector('#au-panier [data-vp-card="C14"]', { timeout: 5000 });
  await p.click('#au-panier [data-vp-card="C14"]');
  await p.fill('#au-motif', 'Le gobelet du RDV n° 2');
  await p.click('#acd-auc-form button[type=submit]');
  await p.waitForSelector('dialog.gv-confirm[open] [data-gv-ok]', { timeout: 5000 }).catch(() => {});
  await p.click('dialog.gv-confirm[open] [data-gv-ok]').catch(() => {});
  await sleep(500);
  const c = (await log(p)).find((l) => l[1] === 'hg_auction_create');
  // Les règles partent en chaînes (readRules, enchere-regles.js) : le serveur les lit comme entiers.
  check(c && c[2].p.lignes?.[0]?.card === 'C14' && c[2].p.nom === 'Le gobelet du RDV n° 2' && Number(c[2].p.min_bid) === 500 && Number(c[2].p.step) === 50, 'admin : hg_auction_create (lot : carte unique C14, 500 / 50)');
  check(!p.errs.length, 'admin : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await browser.close();
  finish();
})();
