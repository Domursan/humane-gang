// Parcours : don groupé (/pages/admin/admin.html › Jeu de cartes › Économie › « Don groupé… ») et boosters offerts (/pages/cartes/cartes.html).
// Le tiroir envoie hg_cards_admin_bulk_give (p_users = null pour « Tout le gang ») après une confirmation ;
// une RPC refusée laisse le tiroir ouvert avec l'erreur. Dans cartes.html, un stock de boosters offerts
// affiche un bouton qui appelle hg_open_booster_req avec p_offert = true, sans Paillettes ni délai.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scenario.bulkFail, scenario.gift, scenario.reqRpc).
// Dans /pages/cartes/cartes.html (repli sans types), le stock de boosters offerts est dans la tuile « Boosters en stock » (#cartes-stock) de l'onglet Ouverture.
// Lancer : node tests/parcours/admin/parcours-admin-don-groupe.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, log, chromium } = require('../../lib/harness.cjs');

/* ---------- Aides de test ---------- */
const ALICE = '00000002-0000-4000-8000-000000000002';
const BRUNO = '00000003-0000-4000-8000-000000000003';
const drawer = 'dialog.ui-drawer[open]';
/** Clique sur le bouton de validation du tiroir ouvert. */
const submit = (p) => p.click(`${drawer} [data-drawer-submit]`);
/** Clique sur « ok » de la boîte de confirmation (dialogue hg-dialog). */
const confirmOk = (p) => p.click('dialog.hg-dialog[open] button[value="ok"]');
/** Appels de la RPC hg_cards_admin_bulk_give (journal du faux client). */
const bulkCalls = async (p) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === 'hg_cards_admin_bulk_give').map((l) => l[2]);
/** Texte du récapitulatif du don groupé (chaîne vide si absent). */
const recap = (p) => p.textContent('#acd-bulk-recap').catch(() => '');
/** Attend ms millisecondes. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ouvre le tiroir « Don groupé… » depuis Jeu de cartes › Économie. */
async function ouvrirDonGroupe(p) {
  await adminSection(p, 'fabrique/economie');
  await p.waitForSelector('[data-act="bulk-open"]', { timeout: 8000 });
  await p.click('[data-act="bulk-open"]');
  await p.waitForSelector(`${drawer} #acd-bulk-kind`, { timeout: 5000 });
}

/* ---------- Scénario ---------- */
(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Deux membres, des boosters offerts : une seule RPC, p_users = les deux ids, confirmation demandée.
  let p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  check((await recap(p)).includes('Choisis au moins un membre'), 'sans destinataire : le récapitulatif le demande');
  await p.selectOption('#acd-bulk-kind', 'boosters');
  await p.waitForSelector(`${drawer} [data-vp-type="classique"]`, { timeout: 5000 });
  await p.fill('#acd-bulk-amount', '2');
  await p.check(`${drawer} input[name="who"][value="${ALICE}"]`);
  await p.check(`${drawer} input[name="who"][value="${BRUNO}"]`);
  check(/2 membres recevront 2 boosters Classique chacun/.test(await recap(p)), 'récapitulatif : « 2 membres recevront 2 boosters Classique chacun »');
  check((await p.textContent('#acd-bulk-count')).includes('2 choisis'), 'compteur : 2 choisis');
  await submit(p);
  await p.waitForSelector('dialog.hg-dialog[open] button[value="ok"]', { timeout: 5000 }).catch(() => {});
  check(!!(await p.$('dialog.hg-dialog[open]')), 'confirmation demandée avant l\'envoi');
  check((await bulkCalls(p)).length === 0, 'avant confirmation : aucune RPC');
  await confirmOk(p);
  await p.waitForSelector(drawer, { state: 'detached', timeout: 5000 }).catch(() => {});
  const b1 = await bulkCalls(p);
  check(b1.length === 1, 'boosters : une seule RPC hg_cards_admin_bulk_give');
  check(b1[0]?.p_kind === 'boosters' && b1[0]?.p_amount === 2, 'boosters : type et montant envoyés (2)');
  check(Array.isArray(b1[0]?.p_users) && b1[0].p_users.length === 2 && b1[0].p_users.includes(ALICE) && b1[0].p_users.includes(BRUNO), 'boosters : p_users = les deux membres choisis');
  check(b1[0]?.p_card === null && b1[0]?.p_shiny === false, 'boosters : pas de carte ni de brillance');
  check(b1[0]?.p_booster === 'classique', 'boosters : p_booster = classique (booster choisi par défaut)');
  check(b1[0]?.p_announce === true, 'fil coché (défaut) : p_announce = true');
  check(!p.errs.length, 'boosters : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 2. Tout le gang : p_users = null, cases des membres désactivées, fil décoché, note transmise.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  await p.click(`${drawer} label:has(#acd-bulk-all)`);
  check(await p.isDisabled(`${drawer} input[name="who"][value="${ALICE}"]`), 'tout le gang : les cases membres sont désactivées');
  check(/Tout le gang \(\d+ membres\) recevra/.test(await recap(p)), 'tout le gang : le récapitulatif le dit');
  await p.fill('#acd-bulk-amount', '500');
  await p.click(`${drawer} label:has(input[name="announce"])`);
  await p.fill('#acd-bulk-note', 'Anniversaire du gang');
  await submit(p);
  await confirmOk(p).catch(() => {});
  await p.waitForSelector(drawer, { state: 'detached', timeout: 5000 }).catch(() => {});
  const b2 = await bulkCalls(p);
  check(b2.length === 1 && b2[0].p_users === null, 'tout le gang : p_users = null');
  check(b2[0]?.p_kind === 'paillettes' && b2[0]?.p_amount === 500, 'tout le gang : 500 Paillettes');
  check(b2[0]?.p_announce === false, 'fil décoché : p_announce = false');
  check(b2[0]?.p_note === 'Anniversaire du gang', 'note transmise à la RPC');
  check(!p.errs.length, 'tout le gang : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 3. Une carte, 3 exemplaires brillants, recherche « fontaine » : p_card = C2, p_shiny = true.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  await p.selectOption('#acd-bulk-kind', 'carte');
  check(await p.isVisible('#acd-bulk-cardbox'), 'carte : le choix de carte apparaît');
  await p.waitForSelector(`${drawer} [data-vp-card="C2"]`, { timeout: 5000 });
  await p.fill('#acd-bulk-cp-q', 'fontaine');
  const options = await p.$$eval(`${drawer} [data-vp-card]`, (o) => o.map((x) => x.dataset.vpCard));
  check(options.length === 1 && options[0] === 'C2', 'recherche « fontaine » : une seule carte proposée (visuels)');
  await p.click(`${drawer} [data-vp-card="C2"]`);
  await p.fill('#acd-bulk-amount', '3');
  await p.click(`${drawer} label:has(input[name="shiny"])`);
  await p.check(`${drawer} input[name="who"][value="${BRUNO}"]`);
  check(/1 membre recevra 3 exemplaires de « La Fontaine » \(brillante\)/.test(await recap(p)), 'récapitulatif carte : nom et brillance');
  await submit(p);
  await confirmOk(p);
  await p.waitForSelector(drawer, { state: 'detached', timeout: 5000 }).catch(() => {});
  const b3 = await bulkCalls(p);
  check(b3.length === 1 && b3[0]?.p_kind === 'carte' && b3[0]?.p_card === 'C2', 'carte : p_card = C2');
  check(b3[0]?.p_amount === 3 && b3[0]?.p_shiny === true, 'carte : 3 exemplaires, brillante');
  check(JSON.stringify(b3[0]?.p_users) === JSON.stringify([BRUNO]), 'carte : un seul destinataire');
  await p.ctx.close();

  // 4. Validation : pas de destinataire, aucune RPC, pas de confirmation.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  await submit(p);
  await p.waitForSelector(`${drawer} .form-error:not([hidden])`, { timeout: 3000 }).catch(() => {});
  check(!!(await p.$(`${drawer} .form-error:not([hidden])`)), 'sans destinataire : erreur affichée dans le tiroir');
  check(!(await p.$('dialog.hg-dialog[open]')), 'sans destinataire : pas de confirmation');
  check((await bulkCalls(p)).length === 0, 'sans destinataire : aucune RPC');
  await p.ctx.close();

  // 5. RPC refusée : erreur dans le tiroir, qui reste ouvert.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { bulkFail: true } });
  await ouvrirDonGroupe(p);
  await p.selectOption('#acd-bulk-kind', 'carte');
  await p.waitForSelector(`${drawer} [data-vp-card="C1"]`, { timeout: 5000 });
  await p.click(`${drawer} [data-vp-card="C1"]`);
  await p.check(`${drawer} input[name="who"][value="${ALICE}"]`);
  await submit(p);
  await confirmOk(p);
  await p.waitForSelector(`${drawer} .form-error:not([hidden])`, { timeout: 5000 }).catch(() => {});
  check(/Plus assez d'exemplaires/.test(await p.textContent(`${drawer} .form-error`).catch(() => '')), 'RPC refusée : message clair dans le tiroir');
  check(await p.locator(drawer).count() === 1, 'RPC refusée : le tiroir reste ouvert');
  await p.ctx.close();

  // 6. Mobile 390 px : tiroir sans défilement horizontal.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844 });
  await ouvrirDonGroupe(p);
  check(await hscroll(p) <= 0, 'mobile 390 px : tiroir sans défilement horizontal');
  await p.ctx.close();

  // 7. Cartes : stock de boosters offerts (2) : bouton visible, RPC avec p_offert, sans débit de Paillettes.
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, scenario: { reqRpc: true, gift: 2 } });
  // Les boosters offerts sont sur l'onglet Ouverture (ouvert par défaut), dans la tuile « Boosters en stock » (#cartes-stock).
  check(await p.isVisible('#cartes-stock'), 'booster offert : bloc visible avec un stock de 2');
  await p.waitForSelector('#cartes-stock [data-action=open-stock-multi][data-count=all]', { timeout: 5000 }).catch(() => {});
  check((await p.textContent('#cartes-stock [data-action=open-stock-multi][data-count=all]')).includes('Tout ouvrir (2)'), 'booster offert : « Tout ouvrir (2) » sur la tuile de stock');
  check((await p.textContent('#cartes-stock [data-action=open-gift]')).includes('Ouvrir 1'), 'booster offert : bouton « Ouvrir 1 » sur la tuile de stock');
  await p.click('[data-action=open-gift]');
  await p.waitForSelector('[data-action=reveal-all], [data-action=close-reveal]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-action=reveal-all]').catch(() => {});
  await p.waitForSelector('[data-action=close-reveal]', { timeout: 5000 }).catch(() => {});
  const ouv = (await log(p)).find((l) => l[0] === 'rpc' && l[1] === 'hg_open_booster_req');
  check(!!ouv && ouv[2]?.p_offert === true && !ouv[2]?.p_free && typeof ouv[2]?.p_request === 'string', 'booster offert : hg_open_booster_req avec p_offert = true, sans p_free, id de demande');
  check(!(await log(p)).some((l) => l[0] === 'rpc' && l[1] === 'hg_open_booster'), 'booster offert : pas de repli sur l\'ancienne RPC payante');
  check(await p.evaluate(() => window.__DB.hg_wallets[0].paillettes) === 230, 'booster offert : aucune Paillettes débitées');
  check(await p.evaluate(() => window.__DB.hg_wallets[0].gift_boosters) === 1, 'booster offert : stock passé à 1');
  check(!p.errs.length, 'booster offert : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 8. Sans stock : aucun bloc de boosters offerts.
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 390, scenario: { reqRpc: true } });
  await sleep(300);
  check(!(await p.$('#cartes-stock [data-action=open-gift]')), 'sans stock : pas de bouton d\'ouverture de booster offert');
  check(await hscroll(p) <= 0, 'cartes 390 px : sans défilement horizontal');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
