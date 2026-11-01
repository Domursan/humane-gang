// Parcours : le Give depuis la fiche d'un membre (/pages/admin/admin.html › Jeu de cartes › Joueurs). Le tiroir ouvre le panier
// avec le membre déjà coché, envoie hg_cards_admin_give_panier après confirmation et n'envoie aucun MP Discord.
// Une RPC refusée laisse le tiroir ouvert et l'erreur dans la confirmation.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scenario.bulkFail = true fait échouer la RPC).
// Lancer : node tests/parcours/admin/parcours-admin-don-carte.cjs
const { ROOT, check, finish, openPage, adminSection, chromium } = require('../../lib/harness.cjs');

const ALICE = '00000002-0000-4000-8000-000000000002';
const drawer = 'dialog.ui-drawer[open]';
/** Appels de hg-notify faits depuis le panel admin (journal du faux client). */
const notifyCalls = (p) => p.evaluate(() => (window.__LOG || []).filter((e) => e[0] === 'fn' && e[1] === 'hg-notify').map((e) => e[2]));
/** Appels de la RPC hg_cards_admin_give_panier (journal du faux client). */
const giveCalls = (p) => p.evaluate(() => (window.__LOG || []).filter((e) => e[0] === 'rpc' && e[1] === 'hg_cards_admin_give_panier').map((e) => e[2]));

/** Ouvre la fiche d'Alice dans Jeu de cartes › Joueurs, puis le tiroir « Give ». */
async function ouvrirDon(p) {
  await adminSection(p, 'fabrique/joueurs');
  await p.evaluate((id) => { location.hash = 'cartes/joueurs/' + id; }, ALICE);
  await p.waitForSelector('[data-act="give-open"]', { timeout: 8000 });
  check((await p.textContent('[data-act="give-open"]')).includes('Give'), 'fiche : le bouton s\'appelle « Give »');
  await p.click('[data-act="give-open"]');
  await p.waitForSelector(`${drawer} [data-vp-card="C2"]`, { timeout: 5000 });
}

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Don réussi : Alice est cochée, deux cartes et des Paillettes, une seule RPC, aucun MP.
  let p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrirDon(p);
  check((await p.textContent('.ui-drawer-title')).trim() === 'Give', 'tiroir : titre « Give »');
  check(await p.isChecked(`${drawer} input[name="acd-bulk-who"][value="${ALICE}"]`), 'tiroir : Alice déjà cochée');
  await p.click(`${drawer} [data-vp-card="C2"]`);
  await p.click(`${drawer} [data-vp-card="C3"]`);
  check(await p.isVisible(`${drawer} [data-gv-vue="panier"]`), 'tiroir étroit : le panier est en étapes');
  await p.click(`${drawer} [data-gv-vue="panier"]`);
  await p.fill('#acd-bulk-paill', '50');
  await p.click(`${drawer} [data-drawer-submit]`);
  await p.waitForSelector('dialog.gv-confirm [data-gv-ok]', { timeout: 5000 });
  check((await giveCalls(p)).length === 0, 'avant confirmation : aucune RPC');
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
  const c = await giveCalls(p);
  check(c.length === 1, 'don réussi : une seule RPC');
  check(JSON.stringify(c[0]?.p_users) === JSON.stringify([ALICE]), 'don réussi : p_users = Alice');
  check(c[0]?.p_paillettes === 50 && c[0]?.p_lignes.length === 2, 'don réussi : 50 Paillettes et deux lignes');
  check((await notifyCalls(p)).length === 0, 'don réussi : aucun MP Discord');
  check(!p.errs.length, 'don réussi : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 2. RPC refusée : l'erreur reste dans la confirmation ; « Retour » ramène au tiroir, toujours rempli.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { bulkFail: true } });
  await ouvrirDon(p);
  await p.click(`${drawer} [data-vp-card="C2"]`);
  await p.click(`${drawer} [data-drawer-submit]`);
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await p.waitForSelector('dialog.gv-confirm .qk-err:not([hidden])', { timeout: 5000 });
  check((await p.textContent('dialog.gv-confirm .qk-err')).includes('plus disponible'), 'RPC refusée : erreur affichée');
  check((await notifyCalls(p)).length === 0, 'RPC refusée : hg-notify non appelée');
  await p.click('dialog.gv-confirm .btn[data-gv-retour]');
  check(await p.locator(drawer).count() === 1 && await p.locator(`${drawer} .gv-ls [data-gv-x]`).count() === 1, 'RPC refusée : le tiroir reste ouvert avec son panier');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
