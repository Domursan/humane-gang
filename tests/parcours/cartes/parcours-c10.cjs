// Parcours C10 : Atelier (recettes de fabrication) dans l'onglet Collection.
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario c2 (recette « La méga-usine du gang » : La base du gang + 2 cartes
// Minecraft au choix + 200 ✦ ; je possède 2 Portails, 1 Usine, 1 Base). Contrôles : panneau « Atelier », ingrédients
// choisis (le dernier exemplaire marqué « ! »), bouton désactivé tant que « Oui, j'utilise mon dernier … » n'est pas coché,
// confirmation, appel hg_card_recipe_craft (3 exemplaires, p_confirm_last), seconde recette repliée puis ouverte ;
// 360 px sans défilement ; admin : liste et refus d'une carte fabricable.
// Lancer : node tests/parcours/cartes/parcours-c10.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim()).catch(() => '');

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, bal: 900 }, width: 360, height: 800 });
  await p.evaluate(() => { location.hash = 'collection'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
  await p.waitForSelector('[data-atelier]', { timeout: 5000 }).catch(() => {});
  check(await p.$eval('[data-atelier]', (d) => !d.open), 'Atelier replié à l’arrivée');
  await p.click('[data-atelier] summary');
  check(/Atelier/.test(await txt(p, '[data-atelier] .luck-h')) && /2 recettes actives/.test(await txt(p, '[data-atelier] .luck-intro')), 'panneau « Atelier », 2 recettes actives');
  check((await txt(p, '.c2-rec-open .c2-rec-name')) === 'La méga-usine du gang', 'recette ouverte : La méga-usine du gang');
  check(await p.$$eval('.c2-rec-open .c2-ing:not(.is-miss)', (x) => x.length) === 3, '3 ingrédients choisis');
  check(await p.$$eval('.c2-rec-open .c2-ing.is-last', (x) => x.length) >= 1, 'dernier exemplaire marqué');
  check(await p.isDisabled('.c2-rec-go'), 'bouton désactivé sans la confirmation du dernier exemplaire');
  check(/Fabriquer · 200/.test(await txt(p, '.c2-rec-go')), 'bouton « Fabriquer · 200 ✦ »');
  await p.check('[data-c2=rec-last]');
  await sleep(150);
  check(!(await p.isDisabled('.c2-rec-go')), 'confirmation cochée : bouton actif');
  check(await hscroll(p) === 0, '360 px : pas de défilement horizontal');
  const h = await p.$eval('.c2-rec-go', (b) => b.getBoundingClientRect().height);
  check(h >= 44, `bouton ≥ 44 px (${h})`);
  await p.click('.c2-rec-go');
  await p.waitForSelector('dialog.hg-dialog[open]', { timeout: 3000 });
  await p.click('dialog.hg-dialog[open] button[value=ok]');
  await sleep(700);
  const call = (await log(p)).find((l) => l[1] === 'hg_card_recipe_craft');
  check(call && call[2].p_recipe === 'R1' && call[2].p_copies.length === 3 && call[2].p_confirm_last === true, 'hg_card_recipe_craft : R1, 3 exemplaires, dernier confirmé');
  check(await p.evaluate(() => window.__DB.hg_card_copies.some((c) => c.card_id === 'J9' && c.source === 'atelier')), 'carte obtenue (source atelier)');
  check(await p.evaluate(() => window.__DB.hg_wallets[0].paillettes) === 700, '200 ✦ débitées');
  await p.click('.c2-rec-row');
  await sleep(150);
  check((await txt(p, '.c2-rec-open .c2-rec-name')) === 'L’Empereur de Serge' && /Il te manque/.test(await txt(p, '.c2-rec-why')), 'seconde recette : ouverte, il manque des cartes');
  check(!p.errs.length, 'cartes : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Ingrédient possédé mais exposé en vitrine : le message le dit (au lieu de « il te manque »)
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, c2vitrine: true, bal: 900 }, width: 360, height: 800 });
  await p.evaluate(() => { location.hash = 'collection'; });
  await p.waitForSelector('.c2-rec-why', { timeout: 5000 }).catch(() => {});
  const whyV = await txt(p, '.c2-rec-why');
  check(/« La base du gang » \(dans ta vitrine : retire-la de ta vitrine pour pouvoir l’utiliser\)/.test(whyV) && await p.isDisabled('.c2-rec-go'), `carte en vitrine : raison affichée (${whyV})`);
  check(!p.errs.length, 'vitrine : aucune erreur JS');
  await p.ctx.close();

  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width: 1280, height: 900 });
  await adminSection(p, 'fabrique/recettes');
  await p.waitForSelector('[data-rc=new]', { timeout: 5000 });
  check(/La méga-usine du gang/.test(await txt(p, '#acd-recettes')), 'admin : recettes listées');
  await p.click('[data-rc=new]');
  await p.fill('#rc-name', 'Essai');
  await p.selectOption('#rc-out', 'J1');
  await p.selectOption('#ri-tag-0', 'minecraft');
  await p.click('#acd-rec-form button[type=submit]');
  await sleep(500);
  check(/Fabricable/.test(await txt(p, '#acd-rec-form .form-error')), 'admin : carte obtenue fabricable refusée, message clair');
  await p.selectOption('#rc-out', 'J9');
  await p.click('[data-rc=in-add]');
  check(await p.$$eval('.acd-rec-in', (x) => x.length) === 2 && await p.inputValue('#rc-name') === 'Essai', 'admin : ingrédient ajouté, saisies gardées');
  await p.selectOption('#ri-tag-1', 'lol');
  await p.click('#acd-rec-form button[type=submit]');
  await sleep(500);
  const s = (await log(p)).filter((l) => l[1] === 'hg_card_recipe_save').at(-1);
  check(s && s[2].p.output_card === 'J9' && JSON.stringify(s[2].p.inputs) === '[{"tag":"minecraft","qty":1},{"tag":"lol","qty":1}]', 'admin : recette envoyée (2 ingrédients par tag)');
  check(!p.errs.length, 'admin : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await browser.close();
  finish();
})();
