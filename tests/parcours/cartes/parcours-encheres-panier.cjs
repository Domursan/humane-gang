// Parcours : enchère du Staff dont le lot est un panier, comme le give (migration 215).
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario c2 + lotEnchere (« Le coffre d’automne » : 2 000 Paillettes,
// La méga-usine du gang brillante, 2 cartes épiques, toute la série « Le gang joue », 2 boosters Doré et 1 Diamant).
// Contrôles membre : encart de la Boutique (pile, « Dans le lot : … »), vue détaillée (7 éléments, pastille « Lot », règle
// de la remise), Staff créateur qui ne peut pas enchérir, gagnant (ce qu'il a reçu, bonus de série, liens), sans offre
// (rien n'est créé), encart de Échanges › Enchères (résumé du lot), 390 px sans défilement horizontal.
// Contrôles admin : composition du lot (panier du give sans étape Membres), carte unique réservée par une autre enchère
// grisée, lot de Paillettes seules refusé, mise sous les Paillettes du lot signalée, aperçu pour les membres, confirmation,
// hg_auction_create avec le lot, liste (ligne « Lot : », « Ouvre après la fin de … », « Sans offre : rien n’a été créé »).
// Lancer : node tests/parcours/cartes/parcours-encheres-panier.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim()).catch(() => '');
const goTab = (p, id) => p.evaluate((id) => { if (location.hash === '#' + id) location.hash = ''; location.hash = id; }, id);
const calls = async (p, fn) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === fn).map((l) => l[2]);
const sansErreur = (p, quoi) => check(!p.errs.length, `${quoi} : aucune erreur JS` + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));

/** Ouvre la Boutique avec l'enchère du scénario ; detail : ouvre la vue détaillée. */
async function boutique(browser, etat, { width = 1280, detail = true } = {}) {
  const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, types: true, bal: 9000, lotEnchere: etat }, width, height: 900 });
  await goTab(p, 'boutique');
  await p.waitForSelector('.c2-auc-teaser', { timeout: 5000 }).catch(() => {});
  if (detail) { await p.click('[data-c2=auc-open]'); await p.waitForSelector('.c2-auc', { state: 'visible', timeout: 5000 }).catch(() => {}); await sleep(150); }
  return p;
}

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Enchère ouverte : encart puis vue détaillée.
  let p = await boutique(browser, 'cours', { detail: false });
  const encart = await txt(p, '.c2-auc-teaser');
  check(/Le coffre d’automne/.test(encart) && /Dans le lot : 2.000 Paillettes, La méga-usine du gang brillante, 2 cartes épiques, toute la série « Le gang joue », 3 boosters/.test(encart), 'encart : nom et contenu du lot');
  check(/Fin dans/.test(encart) && /4.200 . · Alice/.test(encart), 'encart : temps restant et meilleure offre');
  check(await p.$$eval('.c2-auc-teaser .enp-pile .enp-p', (x) => x.length) === 3, 'encart : pile (carte, booster, Paillettes)');
  await p.click('[data-c2=auc-open]');
  await p.waitForSelector('.c2-auc', { state: 'visible', timeout: 5000 });
  check((await txt(p, '.c2-auc-name')) === 'Le coffre d’automne' && (await txt(p, '.c2-auc-title .pill')) === 'Lot', 'vue : nom du lot et pastille « Lot »');
  check(await p.$$eval('.enp-item', (x) => x.length) === 7 && /7 éléments/.test(await txt(p, '#enp-lot-h')), 'vue : 7 éléments dans le lot');
  const items = await txt(p, '.enp-items');
  check(/2.000 Paillettes ?ajoutées au solde du gagnant/.test(items) && /2 boosters Doré/.test(items) && /9 cartes, 1 exemplaire de chaque/.test(items), 'vue : Paillettes, boosters, série');
  check(/minimum 4.250/.test(await txt(p, '.c2-auc-lab')) && await p.isEnabled('.c2-auc-form button[type=submit]'), 'vue : offre minimale 4 250, bouton actif');
  check(/le lot est créé et donné au gagnant/.test(await p.$eval('.c2-auc-rules', (e) => e.textContent)), 'règles : remise du lot à la fin');
  await p.fill('#c2-auc-amount', '4300');
  await p.click('.c2-auc-form button[type=submit]');
  await sleep(600);
  const bid = (await calls(p, 'hg_auction_bid'))[0];
  check(bid && bid.p_auction === 'A1' && bid.p_amount === 4300, 'offre : hg_auction_bid 4300');
  sansErreur(p, 'enchère ouverte');
  await p.ctx.close();

  // 2. Le Staff qui a créé l'enchère ne peut pas enchérir.
  p = await boutique(browser, 'createur');
  check(/Tu as créé cette enchère : tu ne peux pas enchérir dessus/.test(await txt(p, '.c2-auc-note')) && await p.isDisabled('.c2-auc-form button[type=submit]'), 'créateur : message et bouton désactivé');
  await p.ctx.close();

  // 3. Gagnant : ce qu'il a reçu ; 390 px.
  p = await boutique(browser, 'gagne', { width: 390 });
  const gagne = await txt(p, '.enp-gagne');
  check(/Tu as remporté « Le coffre d’automne » pour 5.100/.test(gagne) && /Tout est déjà chez toi/.test(gagne), 'gagnant : phrase de victoire');
  check(/2.000 Paillettes ajoutées à ton solde/.test(gagne) && /12 cartes dans ta collection, dont La méga-usine du gang brillante et 7 que tu n’avais pas/.test(gagne), 'gagnant : Paillettes et cartes reçues');
  check(/3 boosters \(2 Doré, 1 Diamant\) à ouvrir quand tu veux/.test(gagne) && /« Le gang joue » est complète/.test(gagne), 'gagnant : boosters et bonus de série');
  check(await p.isVisible('a[href="#ouverture"]') && await p.isVisible('a[href="#collection"]'), 'gagnant : liens Ouvrir mes boosters, Voir dans Mes cartes');
  check(/Prix final/.test(await txt(p, '.enp-boxes')) && /Prolongée de 3 min/.test(await txt(p, '.enp-boxes')), 'gagnant : prix final, prolongation');
  check(await hscroll(p) === 0, 'gagnant 390 px : pas de défilement horizontal');
  sansErreur(p, 'gagnant');
  await p.ctx.close();

  // 4. Sans offre : rien n'est créé.
  p = await boutique(browser, 'vide');
  check(/sans offre : le lot n’est pas distribué. Rien n’a été créé/.test(await txt(p, '.c2-auc-done')), 'sans offre : rien n’est créé ni donné');
  await p.ctx.close();

  // 5. Échanges › Enchères : l'encart de la semaine résume le lot.
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { encheres: true, lotEnchere: 'cours', bal: 2000 }, width: 390, height: 844 });
  await goTab(p, 'echanges/encheres');
  await p.waitForSelector('.en-semaine', { timeout: 5000 }).catch(() => {});
  check(/Le coffre d’automne : 2.000 ., 12 cartes, 3 boosters · fin/.test(await txt(p, '.en-semaine-txt')), 'Échanges : encart « nom : résumé du lot »');
  check(await hscroll(p) === 0, 'Échanges 390 px : pas de défilement horizontal');
  await p.ctx.close();

  // 6. Admin : composer le lot, refus, aperçu, confirmation, envoi ; liste.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, uniques: true, lotEnchere: 'cours' }, width: 1280, height: 900 });
  await adminSection(p, 'ventes/encheres');
  await p.waitForSelector('#au-panier [data-vp-card="J4"]', { timeout: 8000 });
  check(!(await p.$('#au-panier [data-gv-vue="membres"]')) && (await txt(p, '#au-panier .gv-panier-h h3')) === 'Le lot', 'admin : panier du give sans étape Membres, titre « Le lot »');
  check(await p.isDisabled('#au-panier [data-vp-card="C14"]'), 'admin : carte unique réservée par une autre enchère grisée');
  const liste = await txt(p, '[data-au-liste]');
  check(/Lot : 2.000 ., 12 cartes, 3 boosters \(La méga-usine du gang brillante/.test(liste), 'liste : ligne « Lot : » avec le détail');
  check(/Ouvre après la fin de « Le coffre d’automne »/.test(liste) && /Sans offre : rien n’a été créé ni donné/.test(liste), 'liste : prévue après la courante, terminée sans offre');
  // Lot de Paillettes seules
  await p.fill('#au-paill', '3000');
  await p.fill('#au-motif', 'Le coffre d’hiver');
  await p.click('#acd-auc-form button[type=submit]');
  await sleep(200);
  check(/Un lot fait seulement de Paillettes n’est pas accepté/.test(await txt(p, '.enp-form-err')) && !(await calls(p, 'hg_auction_create')).length, 'admin : lot de Paillettes seules refusé, rien envoyé');
  check(/La mise de départ doit dépasser les Paillettes du lot \(3.000/.test(await txt(p, '#au-mise-e')) && (await p.getAttribute('#au-mise', 'aria-invalid')) === 'true', 'admin : mise sous les Paillettes du lot signalée');
  check(await p.isHidden('.enp-apercu'), 'admin : pas d’aperçu tant que le lot est refusé');
  await p.click('#au-panier [data-vp-card="J4"]');
  await p.click('#au-panier [data-gv-onglet="boosters"]');
  await p.click('#au-panier [data-vp-type="dore"]');
  await p.click('#au-panier [data-gv-onglet="cartes"]');
  await p.fill('#au-mise', '3500');
  await sleep(150);
  check(await p.isHidden('#au-mise-e') && /Valeur des boosters en boutique : 350/.test(await txt(p, '#au-mise-h')), 'admin : mise valable, valeur des boosters affichée');
  check(await p.isVisible('.enp-apercu') && /Le coffre d’hiver/.test(await txt(p, '.enp-apercu')) && /Dans le lot : 3.000 Paillettes, Le coffre des trouvailles, 1 booster/.test(await txt(p, '.enp-apercu')), 'admin : aperçu pour les membres');
  check(/Le gagnant recevra 3.000 ., 1 carte, 1 booster/.test(await txt(p, '[data-gv-sum]')), 'admin : récapitulatif « Le gagnant recevra … »');
  await p.click('#acd-auc-form button[type=submit]');
  await p.waitForSelector('dialog.gv-confirm[open] [data-gv-ok]', { timeout: 5000 });
  const conf = await txt(p, 'dialog.gv-confirm[open]');
  check(/Confirmer l’enchère/.test(conf) && /« Le coffre d’hiver » aux enchères du vendredi/.test(conf) && /Mise de départ 3.500 ., puis 50 . de plus au moins/.test(conf), 'confirmation : nom, dates, mise');
  check(/Le gagnant reçoit/.test(conf) && /Rien n’est créé maintenant/.test(conf), 'confirmation : ce que reçoit le gagnant, rien créé maintenant');
  await p.click('dialog.gv-confirm[open] [data-gv-ok]');
  await sleep(600);
  const c = (await calls(p, 'hg_auction_create'))[0]?.p || {};
  check(c.nom === 'Le coffre d’hiver' && c.paillettes === 3000 && c.min_bid === '3500' && c.annonce === true, 'hg_auction_create : nom, Paillettes, mise, annonce');
  check(JSON.stringify(c.lignes) === JSON.stringify([{ type: 'carte', card: 'J4', qte: 1, shiny: false }, { type: 'booster', booster: 'dore', qte: 1 }]), 'hg_auction_create : lignes du lot (format du give)');
  check(!c.card_id && c.step === '50' && c.cap_pct === '50', 'hg_auction_create : pas de carte seule, règles par défaut');
  check(/Le coffre d’hiver/.test(await txt(p, '[data-au-liste]')) && (await p.inputValue('#au-motif')) === '', 'après envoi : listée, formulaire vidé');
  sansErreur(p, 'admin');
  await p.ctx.close();

  // 7. Admin 390 px : pas de défilement horizontal.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, lotEnchere: 'cours' }, width: 390, height: 844 });
  await adminSection(p, 'ventes/encheres');
  await p.waitForSelector('#au-panier .vp-tile', { timeout: 8000 });
  check(await hscroll(p) === 0, 'admin 390 px : pas de défilement horizontal');
  sansErreur(p, 'admin 390');
  await p.ctx.close();

  await browser.close();
  finish();
})();
