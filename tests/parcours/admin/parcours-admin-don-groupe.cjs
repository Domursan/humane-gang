// Parcours : don groupé (/pages/admin/admin.html › Jeu de cartes › Économie › « Don groupé… ») et boosters offerts (/pages/cartes/cartes.html).
// Le tiroir contient le panier (admin/give-panier.js) et envoie hg_cards_admin_give_panier (p_users = null pour « Tout le gang ») après une confirmation ;
// une RPC refusée laisse le tiroir ouvert avec l'erreur. Le détail du panier est dans parcours-admin-give-panier.cjs. Dans cartes.html, un stock de boosters offerts
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
/** Clique sur « Confirmer le don ». */
const confirmOk = (p) => p.click('dialog.gv-confirm [data-gv-ok]');
/** Appels de la RPC hg_cards_admin_give_panier (journal du faux client). */
const bulkCalls = async (p) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === 'hg_cards_admin_give_panier').map((l) => l[2]);
/** Texte du récapitulatif du don (chaîne vide si absent). */
const recap = (p) => p.textContent(`${drawer} [data-gv-sum]`).catch(() => '');
/** Attend ms millisecondes. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ouvre le tiroir « Don groupé… » depuis Jeu de cartes › Économie. */
async function ouvrirDonGroupe(p) {
  await adminSection(p, 'fabrique/economie');
  await p.waitForSelector('[data-act="bulk-open"]', { timeout: 8000 });
  await p.click('[data-act="bulk-open"]');
  await p.waitForSelector(`${drawer} [data-gv-sum]`, { state: 'attached', timeout: 5000 });
}

/* ---------- Scénario ---------- */
(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Deux membres, des boosters : une seule RPC, p_users = les deux ids, confirmation demandée.
  let p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  check((await recap(p)).includes('Choisis au moins un membre'), 'sans destinataire : le récapitulatif le demande');
  await p.check(`${drawer} input[name="acd-bulk-who"][value="${ALICE}"]`);
  await p.check(`${drawer} input[name="acd-bulk-who"][value="${BRUNO}"]`);
  await p.click(`${drawer} [data-gv-vue="ajouter"]`);
  await p.click(`${drawer} [data-gv-onglet="boosters"]`);
  await p.click(`${drawer} [data-vp-type="classique"]`);
  await p.click(`${drawer} [data-gv-vue="panier"]`);
  await p.click(`${drawer} [data-gv-plus="0"]`);
  check(/2 membres recevront chacun 2 boosters/.test(await recap(p)), 'récapitulatif : « 2 membres recevront chacun 2 boosters »');
  await submit(p);
  await p.waitForSelector('dialog.gv-confirm [data-gv-ok]', { timeout: 5000 });
  check((await bulkCalls(p)).length === 0, 'avant confirmation : aucune RPC');
  await confirmOk(p);
  await p.waitForSelector(drawer, { state: 'detached', timeout: 5000 }).catch(() => {});
  const b1 = await bulkCalls(p);
  check(b1.length === 1, 'boosters : une seule RPC hg_cards_admin_give_panier');
  check(JSON.stringify(b1[0]?.p_lignes) === JSON.stringify([{ type: 'booster', booster: 'classique', qte: 2 }]), 'boosters : ligne classique, 2 par membre');
  check(Array.isArray(b1[0]?.p_users) && b1[0].p_users.length === 2 && b1[0].p_users.includes(ALICE) && b1[0].p_users.includes(BRUNO), 'boosters : p_users = les deux membres choisis');
  check(b1[0]?.p_paillettes === 0, 'boosters : aucune Paillette');
  check(b1[0]?.p_announce === true, 'fil coché (défaut) : p_announce = true');
  check(!p.errs.length, 'boosters : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 2. Tout le gang : p_users = null, cases des membres désactivées, fil décoché, note transmise.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  await p.click(`${drawer} label:has([data-gv-all])`);
  check(await p.isDisabled(`${drawer} input[name="acd-bulk-who"][value="${ALICE}"]`), 'tout le gang : les cases membres sont désactivées');
  await p.click(`${drawer} [data-gv-vue="panier"]`);
  await p.fill('#acd-bulk-paill', '500');
  check(/Tout le gang \(\d+ membres\) recevra/.test(await recap(p)), 'tout le gang : le récapitulatif le dit');
  await p.click(`${drawer} label:has(#acd-bulk-ann)`);
  await p.fill('#acd-bulk-motif', 'Anniversaire du gang');
  await submit(p);
  await confirmOk(p);
  await p.waitForSelector(drawer, { state: 'detached', timeout: 5000 }).catch(() => {});
  const b2 = await bulkCalls(p);
  check(b2.length === 1 && b2[0].p_users === null, 'tout le gang : p_users = null');
  check(b2[0]?.p_paillettes === 500 && b2[0]?.p_lignes.length === 0, 'tout le gang : 500 Paillettes, rien d\'autre');
  check(b2[0]?.p_announce === false, 'fil décoché : p_announce = false');
  check(b2[0]?.p_note === 'Anniversaire du gang', 'note transmise à la RPC');
  check(!p.errs.length, 'tout le gang : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 3. Validation : pas de destinataire, aucune RPC, pas de confirmation.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDonGroupe(p);
  await submit(p);
  await p.waitForSelector(`${drawer} .gv-err:not([hidden])`, { timeout: 3000 }).catch(() => {});
  check(!!(await p.$(`${drawer} .gv-err:not([hidden])`)), 'sans destinataire : erreur affichée dans le tiroir');
  check(await p.isVisible(`${drawer} .gv-err`), 'sans destinataire : l\'étape Panier s\'ouvre pour montrer l\'erreur');
  check(!(await p.$('dialog.gv-confirm')), 'sans destinataire : pas de confirmation');
  check((await bulkCalls(p)).length === 0, 'sans destinataire : aucune RPC');
  await p.ctx.close();

  // 4. Mobile 390 px : tiroir sans défilement horizontal.
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
