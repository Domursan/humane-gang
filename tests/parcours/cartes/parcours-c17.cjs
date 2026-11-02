require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours C17 · « Ma carte Champion » (cartes.html, Collection ; panel : Jeux et cartes › Cartes Champions ; migration 082).
// 1. Membre sans carte : fenêtre en trois étapes, aperçu en direct (nom, phrase, édition), proposition envoyée (RPC), statut, retrait. Détail : parcours-champion-v2.
// 2. Carte déjà acceptée cette année : message, pas de formulaire. Fermeture : le focus revient au bouton.
// 3. 360 px : fenêtre sans défilement horizontal, cibles ≥ 44 px.
// 4. Panel : cagnotte (création, annulation) et propositions Champions (validation).
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scénarios champion, pot). Lancer : node tests/parcours/cartes/parcours-c17.cjs
const path = require('path');
const { openPage, check, finish, hscroll, sleep, log, adminSection, chromium } = require('../../lib/harness.cjs');

const F = 'fake-sb-cartes.mjs';
/** Tant que le bouton « Ma carte Champion » est dans le bloc repliable : on l'ouvre s'il est fermé (sans effet quand le bloc n'existe plus). */
(async () => {
  const browser = await chromium.launch();

  const p = await openPage(browser, { page: 'cartes', fixture: F, width: 390, height: 900, scenario: { champion: 'aucune' }, hash: '#collection' });
  await sleep(400);
  await p.click('[data-action="champion"]');
  await sleep(500);
  check(await p.$eval('#cartes-champion', (d) => d.open), 'fenêtre ouverte');
  check(/Ethan · main/i.test(await p.$eval('#champ-preview', (e) => e.innerText)), 'aperçu : pseudo du membre');
  await p.fill('#champ-main', 'Ahri');
  await p.click('.champ-chip:has(input[value="ck3"])');
  await sleep(100);
  check(/CK3 · édition/.test(await p.$eval('#champ-preview', (e) => e.innerText)), 'changement de jeu reflété');
  await p.fill('#champ-main', 'Ahri');
  await p.click('.mc-nav [type=submit]');
  await sleep(100);
  await p.click('.champ-emb:has(input[value="fusee"])');
  await sleep(100);
  await p.click('.mc-nav [type=submit]');
  await sleep(100);
  await p.fill('#champ-flavor', 'Je ne ban jamais Yasuo.');
  await sleep(150);
  const prev = await p.$eval('#champ-preview', (e) => e.innerText);
  check(/main Ahri/i.test(prev) && /Je ne ban jamais Yasuo/i.test(prev) && /CK3 · édition 2026/.test(prev), 'aperçu en direct : main, phrase, jeu et édition');
  check(/23 \/ 60/.test(await p.$eval('#champ-fl-count', (e) => e.innerText)), 'compteur de la phrase');
  await p.click('.champ-submit');
  await sleep(500);
  const call = (await log(p)).find((l) => l[1] === 'hg_champion_propose');
  check(call && call[2].p.game === 'ck3' && call[2].p.main === 'Ahri' && call[2].p.emblem === 'fusee', 'proposition envoyée (jeu, main, emblème)');
  check(/Proposition envoyée/.test(await p.$eval('.champ-body', (e) => e.innerText)) && await p.$('.champ-form') === null, 'statut « en attente », plus de formulaire');
  await p.click('[data-champ="withdraw"]');
  await sleep(400);
  check(await p.$('.champ-form') !== null, 'retrait : formulaire de retour');
  await p.keyboard.press('Escape');
  await sleep(200);
  check(await p.$eval('#cartes-champion', (d) => !d.open) && await p.evaluate(() => document.activeElement?.dataset.action) === 'champion', 'Échap ferme, focus rendu au bouton');
  check(p.errs.length === 0, `aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  const a = await openPage(browser, { page: 'cartes', fixture: F, width: 390, height: 900, scenario: { champion: 'acceptee' }, hash: '#collection' });
  await sleep(400);
  await a.click('[data-action="champion"]');
  await sleep(500);
  check(/est sortie/.test(await a.$eval('.champ-body', (e) => e.innerText)) && await a.$('.champ-form') === null, 'carte acceptée : message, pas de formulaire');
  await a.ctx.close();

  const s = await openPage(browser, { page: 'cartes', fixture: F, width: 360, height: 800, scenario: { champion: 'aucune' }, hash: '#collection' });
  await sleep(400);
  await s.click('[data-action="champion"]');
  await sleep(500);
  check(await s.$eval('#cartes-champion', (d) => d.scrollWidth <= d.clientWidth + 1) && await hscroll(s) === 0, '360 px : pas de défilement horizontal');
  const small = await s.$$eval('#cartes-champion .champ-chip span, #cartes-champion .mc-nav .btn, #champ-main', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
  check(small === 0, '360 px : cibles ≥ 44 px');
  await s.screenshot({ path: path.join(__dirname, '..', '..', 'shots', 'c17-champion-360.png') });
  await s.ctx.close();

  // Panel : cagnotte et champions
  const ad = await openPage(browser, { page: 'admin', fixture: F, width: 1280, height: 900, scenario: { pot: 'ouverte' } });
  await adminSection(ad, 'cartes/cagnotte');
  await sleep(500);
  check(await ad.$$eval('#pots-root .adc-row', (x) => x.length) === 1 && await ad.$('#pot-new') === null, 'panel cagnotte : une ouverte, pas de nouvelle');
  await ad.click('[data-pot-act="cancel"]');
  await sleep(300);
  await ad.click('dialog.hg-dialog button[value="ok"]');
  await sleep(500);
  check((await log(ad)).some((l) => l[1] === 'hg_pot_cancel'), 'annulation appelée');
  check(await ad.$('#pot-new') !== null, 'après annulation : formulaire de création');
  await ad.fill('#pot-t', 'Test cagnotte');
  await ad.click('#pot-new [type=submit]');
  await sleep(500);
  const cr = (await log(ad)).find((l) => l[1] === 'hg_pot_create');
  check(cr && cr[2].p.title === 'Test cagnotte' && cr[2].p.goal === 20000 && /T/.test(cr[2].p.ends_at), 'création envoyée');
  await ad.click('[data-pot-act="rebuild"]');
  await sleep(300);
  check((await log(ad)).some((l) => l[1] === 'hg_eco_bulletin_rebuild'), 'bulletin : reconstruction appelée');
  await adminSection(ad, 'cartes/champions');
  await sleep(500);
  check(/Alice · main Francs/.test(await ad.$eval('#champions-root', (e) => e.innerText)) && await ad.$('#champions-root .hgc') !== null, 'panel champions : proposition avec aperçu');
  await ad.click('[data-champ-act="ok"]');
  await sleep(400);
  check((await log(ad)).some((l) => l[1] === 'hg_champion_review' && l[2].p_accept === true) && /Aucune proposition/.test(await ad.$eval('#champions-root', (e) => e.innerText)), 'validation envoyée, liste vide');
  check(ad.errs.length === 0, `panel : aucune erreur (${ad.errs.join(' | ') || 'rien'})`);
  await ad.ctx.close();

  await browser.close();
  finish();
})();
