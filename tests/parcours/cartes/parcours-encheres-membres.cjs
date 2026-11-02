// Parcours idée 33 : enchères entre membres (Cartes › Échanges › Enchères, migration 212).
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario « encheres » (E1 à E4 ouvertes, E5 à E8 terminées ; plafond 800).
// Contrôles : onglet « Enchères (4) », liste (vendeur, « Ta carte », fin proche en évidence, enchère de la semaine),
// enchère dépassée (message, minimum 270), offre trop basse refusée sans appel, offre rapide +25 envoyée, en tête,
// canal temps réel des 10 dernières minutes, enchère prolongée, fins (gagnant, vendeur, sans offre, perdue) par l'adresse,
// « Mes enchères » et ses filtres, mise en vente depuis la fiche (mise trop basse, appel, limite de 2 cartes), retrait,
// admin (qui a enchéri sur qui), 390 px sans défilement horizontal, liste vide, aucune erreur JS.
// SHOTS=<dossier> : captures 1280 et 390, sombre et clair.
// Lancer : node tests/parcours/cartes/parcours-encheres-membres.cjs
const path = require('path');
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim()).catch(() => '');
const goTab = (p, id) => p.evaluate((id) => { if (location.hash === '#' + id) location.hash = ''; location.hash = id; }, id);
/** Identifiant de l'enchère En du scénario (même format que la base : uuid). */
const E = (n) => `eeeeeeee-0000-4000-8000-00000000000${n}`;
const SHOTS = process.env.SHOTS || '';
async function shot(p, nom) {
  if (!SHOTS) return;
  for (const mode of ['sombre', 'clair']) {
    await p.evaluate(async (m) => { (await import(new URL('../../assets/commun/core/prefs.js', location.href).href)).setPrefs({ mode: m }); }, mode).catch((e) => console.log('mode : ' + e.message));
    await sleep(200);
    await p.screenshot({ path: path.join(SHOTS, `${nom}-${mode}.png`), fullPage: true });
  }
  await p.evaluate(async () => { (await import(new URL('../../assets/commun/core/prefs.js', location.href).href)).setPrefs({ mode: 'sombre' }); }).catch(() => {});
}
const calls = async (p, fn) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === fn).map((l) => l[2]);

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { encheres: true, bal: 2000 }, width: 1280, height: 900 });
  await goTab(p, 'echanges');
  await p.waitForSelector('#trd-tab-encheres', { timeout: 5000 }).catch(() => {});
  await p.waitForFunction(() => /\(4\)/.test(document.querySelector('#trd-tab-encheres')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(/Enchères \(4\)/.test(await txt(p, '#trd-tab-encheres')), 'onglet « Enchères (4) » dans Échanges');
  await goTab(p, 'echanges/encheres');
  await p.waitForSelector('.en-liste', { timeout: 5000 }).catch(() => {});
  check(await p.$$eval('.en-liste > .en-ligne', (x) => x.length) === 4, 'liste : 4 enchères ouvertes');
  const liste = await txt(p, '.en-liste');
  check(/Vendue par Alice/.test(liste) && /Ta carte/.test(liste) && /2 offres/.test(liste), 'liste : vendeur, « Ta carte », nombre d’offres');
  check(await p.$$eval('.en-ligne.is-chaud', (x) => x.length) === 2, 'liste : les 2 enchères à moins d’une minute ressortent');
  check(/La Carte unique/.test(await txt(p, '.en-semaine')), 'liste : encart de l’enchère de la semaine');
  await shot(p, 'en-liste-1280');

  // Enchère dépassée (E2, Bruno) : minimum 270, offre trop basse refusée, +25 puis envoi.
  await p.click(`[data-en=voir][data-id="${E(2)}"]`);
  await p.waitForSelector('#en-auc-h', { timeout: 5000 }).catch(() => {});
  await sleep(200);
  check(/Grapeseed/.test(await txt(p, '#en-auc-h')) && /Enchère de Bruno/.test(await txt(p, '.en-auc .eyebrow')), 'enchère : carte et vendeur');
  check(/Chloé a fait mieux/.test(await txt(p, '.en-auc .c2-auc-err')) && /240/.test(await txt(p, '.en-auc .c2-auc-err')), 'dépassé : « Chloé a fait mieux », 240 rendues');
  check(/minimum 270/.test(await txt(p, '.c2-auc-lab')), 'offre minimale 270');
  await shot(p, 'en-depasse-1280');
  await p.fill('#en-montant', '200');
  await p.click('[data-en-form=offre] button[type=submit]');
  await sleep(200);
  check(/minimale/.test(await txt(p, '#en-err')) && !(await calls(p, 'hg_enchere_offre')).length, 'offre trop basse : message, rien envoyé');
  check(await p.evaluate(() => document.activeElement?.id) === 'en-montant', 'offre trop basse : le focus revient sur le champ');
  await p.click('[data-en=plus][data-d="25"]');
  check(await p.inputValue('#en-montant') === '285', 'offre rapide +25 : 285');
  await p.click('[data-en-form=offre] button[type=submit]');
  await sleep(600);
  const of = await calls(p, 'hg_enchere_offre');
  check(of.length === 1 && of[0].p_id === E(2) && of[0].p_montant === 285, 'hg_enchere_offre : 285 sur E2');
  check(/meilleure offre/.test(await txt(p, '.c2-auc-note')) && /\(toi\)/.test(await txt(p, '.c2-auc-boxes')), 'en tête : « Tu as la meilleure offre »');
  check(await p.isDisabled('[data-en-form=offre] button[type=submit]'), 'en tête : bouton désactivé');
  check((await log(p)).some((l) => l[0] === 'channel' && l[1] === 'enchere:' + E(2)), 'temps réel : canal de l’enchère (moins de 10 minutes)');
  await shot(p, 'en-entete-1280');

  // Enchère prolongée (E4).
  await p.click('[data-en=liste]');
  await p.waitForSelector(`[data-en=voir][data-id="${E(4)}"]`, { timeout: 5000 }).catch(() => {});
  check(!(await log(p)).some((l) => l[0] === 'channel' && l[1] === 'enchere:' + E(1)), 'pas de canal pour la liste');
  await p.click(`[data-en=voir][data-id="${E(4)}"]`);
  await p.waitForSelector('.en-prolonge', { timeout: 5000 }).catch(() => {});
  check(/Prolongée de 30 s/.test(await txt(p, '.en-prolonge')), 'prolongée : message « Prolongée de 30 s »');
  await shot(p, 'en-prolongee-1280');

  // Enchère longue (E1) : pas de canal temps réel.
  await p.click('[data-en=liste]');
  await p.waitForSelector(`[data-en=voir][data-id="${E(1)}"]`, { timeout: 5000 }).catch(() => {});
  await p.click(`[data-en=voir][data-id="${E(1)}"]`);
  await p.waitForSelector('#en-auc-h', { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check(!(await log(p)).some((l) => l[0] === 'channel' && l[1] === 'enchere:' + E(1)), 'enchère de 18 h : pas de canal temps réel');

  // Fins d'enchère par l'adresse.
  const fin = async (id, re, msg) => {
    await goTab(p, 'echanges/encheres/' + id);
    await p.waitForFunction((id) => document.querySelector('.en-done') && document.querySelector('[data-en=liste]') && window.__LOG.some((l) => l[1] === 'hg_enchere_vue' && l[2]?.p_id === id), id, { timeout: 5000 }).catch(() => {});
    await sleep(250);
    check(re.test(await txt(p, '.en-done')), msg);
  };
  await fin(E(5), /Tu as remporté « Soirée pizza » pour 300.*Alice reçoit 270/, 'fin gagnant : carte remportée, le vendeur reçoit 270');
  await shot(p, 'en-fin-gagnant-1280');
  await fin(E(6), /est vendue à Alice pour 200.*Tu reçois 180/, 'fin vendeur : vendue, je reçois 180');
  await shot(p, 'en-fin-vendeur-1280');
  await fin(E(7), /Aucune offre/, 'fin sans offre : la carte revient');
  await fin(E(8), /Bruno a remporté.*380/, 'fin perdue : Bruno gagne, mes 380 rendues');

  // Mes enchères et filtres.
  await p.click('[data-en=liste]');
  await p.waitForSelector('[data-en=hist]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-en=hist]');
  await p.waitForSelector('.en-hist', { timeout: 5000 }).catch(() => {});
  const n = () => p.$$eval('.en-hist > li', (x) => x.length).catch(() => 0);
  check(await n() === 7, `Mes enchères : 7 lignes (${await n()})`);
  await shot(p, 'en-historique-1280');
  for (const [f, k, re] of [['gagnees', 1, /Gagnée/], ['vendues', 1, /Vendue à Alice/], ['perdues', 1, /Perdue/]]) {
    await p.click(`[data-en=filtre][data-f=${f}]`);
    await sleep(100);
    check(await n() === k && re.test(await txt(p, '.en-hist')) && await p.getAttribute(`[data-f=${f}]`, 'aria-pressed') === 'true', `filtre ${f} : ${k} ligne`);
  }
  await p.click('[data-en=filtre][data-f=toutes]');

  // Mise en vente depuis la fiche de C3 (2 exemplaires libres).
  await goTab(p, 'collection');
  await p.waitForSelector('[data-action="open-card"][data-card="C3"]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-action="open-card"][data-card="C3"]');
  await p.waitForSelector('#cartes-detail[open] [data-action=vendre]', { timeout: 5000 }).catch(() => {});
  check(await p.isVisible('#cartes-detail [data-action=vendre]'), 'fiche : bouton « Mettre aux enchères »');
  await p.click('#cartes-detail [data-action=vendre]');
  await p.waitForSelector('dialog.en-dlg[open]', { timeout: 5000 }).catch(() => {});
  check(/tu en as 2 exemplaires, un seul part/.test(await txt(p, 'dialog.en-dlg')), 'vente : « un seul part »');
  await p.fill('#en-depart', '5');
  await p.click('dialog.en-dlg button[type=submit]');
  await sleep(150);
  check(/10 ✦ au moins|10.*au moins/.test(await txt(p, '#en-depart-e')) && await p.getAttribute('#en-depart', 'aria-invalid') === 'true' && !(await calls(p, 'hg_enchere_vendre')).length, 'vente : mise trop basse refusée sans appel');
  await shot(p, 'en-vente-erreur-1280');
  await p.check('dialog.en-dlg input[name=duree][value="60"]');
  await p.fill('#en-depart', '60');
  await p.click('dialog.en-dlg button[type=submit]');
  await p.waitForFunction((id) => location.hash === '#echanges/encheres/' + id, E(9), { timeout: 5000 }).catch(() => {});
  const v = await calls(p, 'hg_enchere_vendre');
  check(v.length === 1 && v[0].p_copy === 6 && v[0].p_duree === 60 && v[0].p_depart === 60, `hg_enchere_vendre : exemplaire 6, 1 h, 60 (${JSON.stringify(v[0])})`);
  await p.waitForSelector('#en-auc-h', { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check(/Café du Marché/.test(await txt(p, '#en-auc-h')) && /Ta carte aux enchères/.test(await txt(p, '.en-auc .eyebrow')), 'après la vente : page de mon enchère');
  // Troisième carte : refusée par le serveur (2 au plus), message dans la fenêtre.
  await goTab(p, 'collection');
  await p.waitForSelector('[data-action="open-card"][data-card="C5"]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-action="open-card"][data-card="C5"]');
  await p.waitForSelector('#cartes-detail[open] [data-action=vendre]', { timeout: 5000 }).catch(() => {});
  await p.click('#cartes-detail [data-action=vendre]');
  await p.waitForSelector('dialog.en-dlg[open]', { timeout: 5000 }).catch(() => {});
  await p.click('dialog.en-dlg button[type=submit]');
  await sleep(400);
  check(/déjà 2 cartes en vente/.test(await txt(p, 'dialog.en-dlg [role=alert]')), 'vente : limite de 2 cartes, message du serveur');
  await p.click('dialog.en-dlg [data-en-dlg=annuler]');
  await sleep(150);
  await p.keyboard.press('Escape');
  await sleep(150);
  // Fiche de C2 : l'exemplaire en vente renvoie à l'enchère.
  await goTab(p, 'collection');
  await p.waitForSelector('[data-action="open-card"][data-card="C2"]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-action="open-card"][data-card="C2"]');
  await p.waitForSelector('#cartes-detail[open] [data-action=voir-vente]', { timeout: 5000 }).catch(() => {});
  check(await p.isVisible('#cartes-detail [data-action=voir-vente]'), 'fiche : exemplaire « Aux enchères · voir »');
  await p.click('#cartes-detail [data-action=voir-vente]');
  await p.waitForFunction(() => /La Fontaine/.test(document.querySelector('#en-auc-h')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check(/La Fontaine/.test(await txt(p, '#en-auc-h')), '« voir » ouvre mon enchère E3');
  // Retrait (aucune offre).
  await p.click('[data-en=retirer]');
  await p.waitForSelector('dialog[open] button[value=ok]', { timeout: 5000 }).catch(() => {});
  await p.click('dialog[open] button[value=ok]');
  await sleep(500);
  const r = await calls(p, 'hg_enchere_retirer');
  check(r.length === 1 && r[0].p_id === E(3) && /Tu as retiré/.test(await txt(p, '.en-done')), 'retrait : hg_enchere_retirer E3, message');
  check(!p.errs.length, 'cartes : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 390 px.
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { encheres: true, bal: 2000 }, width: 390, height: 844 });
  await goTab(p, 'echanges/encheres');
  await p.waitForSelector('.en-liste', { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check(await hscroll(p) === 0, '390 px : liste sans défilement horizontal');
  await shot(p, 'en-liste-390');
  await p.click(`[data-en=voir][data-id="${E(2)}"]`);
  await p.waitForSelector('#en-montant', { timeout: 5000 }).catch(() => {});
  await sleep(200);
  check(await hscroll(p) === 0, '390 px : enchère sans défilement horizontal');
  const h = await p.$eval('[data-en=plus][data-d="10"]', (b) => b.getBoundingClientRect().height).catch(() => 0);
  check(h >= 44, `390 px : offres rapides de 44 px au moins (${h})`);
  await shot(p, 'en-depasse-390');
  await p.click('[data-en=liste]');
  await p.waitForSelector('[data-en=hist]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-en=hist]');
  await p.waitForSelector('.en-hist', { timeout: 5000 }).catch(() => {});
  check(await hscroll(p) === 0, '390 px : Mes enchères sans défilement horizontal');
  await shot(p, 'en-historique-390');
  check(!p.errs.length, '390 px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Liste vide.
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { encheres: true, encheresVide: true }, width: 1280, height: 900 });
  await goTab(p, 'echanges/encheres');
  await p.waitForSelector('.en .empty', { timeout: 5000 }).catch(() => {});
  check(/Aucune carte aux enchères/.test(await txt(p, '.en .empty')) && /^Enchères$/.test(await txt(p, '#trd-tab-encheres')), 'liste vide : message, onglet sans nombre');
  await shot(p, 'en-vide-1280');
  check(!p.errs.length, 'liste vide : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Admin : qui a enchéri sur qui.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', scenario: { encheres: true, c2: true, uniques: true }, width: 1280, height: 900 });
  await adminSection(p, 'ventes/encheres');
  await p.waitForFunction(() => /Enchères des membres/.test(document.body.textContent) && /Grapeseed/.test(document.body.textContent), null, { timeout: 5000 }).catch(() => {});
  const adm = await p.evaluate(() => document.body.textContent.replace(/\s+/g, ' '));
  check(/Enchères des membres/.test(adm) && /Chloé → Bruno : 260/.test(adm) && /Vendue par Alice/.test(adm), 'admin : enchères des membres, « Chloé → Bruno : 260 »');
  check(!p.errs.length, 'admin : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await browser.close();
  finish();
})();
