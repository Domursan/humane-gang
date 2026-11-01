// Parcours : Le jeu de cartes › Gestion globale (admin.html, #fabrique/gestion ; admin-gestion.js).
// (a) Give : membres (recherche, pastilles, « Tout le gang »), type de don (Paillettes, Cartes, Booster), montant, carte
//     (recherche, brillante), motif, « Annoncer au membre » ; contrôle, confirmation, puis une seule RPC
//     hg_cards_admin_bulk_give avec les bons paramètres ; RPC refusée : message dans le bloc, pas de don.
// (b) Résumé de l’économie : hg_eco_health (Paillettes en circulation, variation sur 7 jours, alerte expliquée avec lien),
//     hg_booster_type_stats (boosters ouverts sur 7 jours), hg_auctions_admin (enchère ouverte) ; une source en échec
//     affiche « – » et son erreur, sans chiffre inventé.
// (c) Derniers gives : les lignes « don_groupe » de hg_admin_log (10 au plus), pas les autres actions.
// (d) 390 px : une colonne, sans défilement horizontal, cibles ≥ 44 px ; captures en 1280 et 390 px.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scenario.bulkFail, ecoFail, boostersFail, gestionEncheres, journalDons).
// Lancer : node tests/parcours/admin/parcours-admin-gestion.cjs
const path = require('path');
const { ROOT, SHOTS, check, finish, openPage, adminSection, hscroll, log, chromium } = require('../../lib/harness.cjs');

/* ---------- Aides de test ---------- */
const ALICE = '00000002-0000-4000-8000-000000000002';
const BRUNO = '00000003-0000-4000-8000-000000000003';
const confirmOk = (p) => p.click('dialog.hg-dialog[open] button[value="ok"]');
/** Appels de la RPC hg_cards_admin_bulk_give (journal du faux client). */
const bulkCalls = async (p) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === 'hg_cards_admin_bulk_give').map((l) => l[2]);
/** Texte du récapitulatif du bloc Give. */
const recap = (p) => p.textContent('#gest-recap').catch(() => '');
/** Nombre de cases de membres visibles dans la liste. */
const lignesMembres = (p) => p.$$eval('#gest-list .acd-bulk-row', (rows) => rows.filter((r) => !r.hidden && r.getClientRects().length).length);
/** Attend que le résumé de l’économie ait fini de charger (trois tuiles, plus de « Chargement »). */
const attendreEco = (p) => p.waitForFunction(() => {
  const s = document.getElementById('gest-eco');
  return !!s && s.querySelectorAll('.acd-tile').length >= 3 && !s.textContent.includes('Chargement');
}, null, { timeout: 8000 }).catch(() => {});
/** Attend que le journal ait fini de charger. */
const attendreJournal = (p) => p.waitForFunction(() => {
  const s = document.getElementById('gest-journal');
  return !!s && !s.textContent.includes('Chargement');
}, null, { timeout: 8000 }).catch(() => {});
/** Ouvre la section et attend son chargement complet. */
async function ouvrir(p) {
  await adminSection(p, 'fabrique/gestion');
  await p.waitForSelector('#gest-list .acd-bulk-row', { timeout: 8000 });
  await attendreEco(p);
  await attendreJournal(p);
}

/* ---------- Scénario ---------- */
(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Bureau 1280 px : état initial du Give, recherche, pastilles, contrôles.
  let p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrir(p);
  check(!!(await p.$('#gest-give-h')) && !!(await p.$('#gest-eco-h')) && !!(await p.$('#gest-journal-h')), '1280 : trois blocs (Give, Résumé, Derniers gives)');
  check(/Choisis au moins un membre/.test(await recap(p)), 'Give : sans membre, le récapitulatif le demande');
  await p.screenshot({ path: path.join(SHOTS, 'admin-gestion-1280.png') }); // état initial (vue du bureau)
  check(await p.inputValue('#gest-amount') === '100', 'Give : Paillettes par défaut, montant 100');
  check(await p.isHidden('#gest-cardbox'), 'Give : le bloc carte est masqué hors « Cartes »');
  check((await lignesMembres(p)) >= 3, 'Give : la liste des membres actifs est proposée');
  await p.fill('#gest-q', 'bru');
  check((await lignesMembres(p)) === 1, 'recherche « bru » : un seul membre affiché');
  await p.fill('#gest-q', '');
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.check(`input[name="gest-who"][value="${BRUNO}"]`);
  check((await p.$$('#gest-chips .gest-chip')).length === 2, 'deux membres choisis : deux pastilles');
  check(/2 membres recevront 100 Paillettes chacun/.test(await recap(p)), 'récapitulatif : « 2 membres recevront 100 Paillettes chacun »');
  await p.click('#gest-chips .gest-chip >> nth=0');
  check((await p.$$('#gest-chips .gest-chip')).length === 1, 'pastille retirée : un membre reste');
  check(!(await p.isChecked(`input[name="gest-who"][value="${ALICE}"]`)), 'case décochée à la suppression de la pastille');
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  // Donner sans rien changer : confirmation, puis la RPC Paillettes
  await p.fill('#gest-amount', '250');
  await p.fill('#gest-motif', 'Récompense de quête');
  await p.click('#gest-go');
  await p.waitForSelector('dialog.hg-dialog[open] button[value="ok"]', { timeout: 5000 });
  check(!!(await p.$('dialog.hg-dialog[open]')), 'Donner : une confirmation est demandée');
  check((await bulkCalls(p)).length === 0, 'avant confirmation : aucune RPC');
  await confirmOk(p);
  await p.waitForFunction(() => document.querySelectorAll('#gest-chips .gest-chip').length === 0, null, { timeout: 5000 });
  const b1 = await bulkCalls(p);
  check(b1.length === 1, 'Paillettes : une seule RPC hg_cards_admin_bulk_give');
  check(b1[0]?.p_kind === 'paillettes' && b1[0]?.p_amount === 250, 'Paillettes : type et montant (250)');
  check(Array.isArray(b1[0]?.p_users) && b1[0].p_users.length === 2 && b1[0].p_users.includes(ALICE) && b1[0].p_users.includes(BRUNO), 'Paillettes : p_users = les deux membres');
  check(b1[0]?.p_card === null && b1[0]?.p_shiny === false, 'Paillettes : pas de carte ni de brillance');
  check(b1[0]?.p_announce === true, 'Annoncer au membre coché (défaut) : p_announce = true');
  check(b1[0]?.p_note === 'Récompense de quête', 'motif transmis en p_note');
  check((await p.$$('#gest-journal .acd-item')).length === 4, 'journal rechargé après le don (3 dons groupés et 1 carte donnée)');
  check(!p.errs.length, '1280 : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 2. Booster : deux boosters offerts à deux membres (onglet « Booster »).
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrir(p);
  await p.click('[data-gest-kind="boosters"]');
  check(await p.getAttribute('[data-gest-kind="boosters"]', 'aria-pressed') === 'true', 'onglet Booster sélectionné');
  check((await p.textContent('#gest-amount-l')).includes('Boosters par membre'), 'Booster : libellé « Boosters par membre »');
  await p.waitForSelector('[data-vp-type="dore"]', { timeout: 5000 });
  await p.click('[data-vp-type="dore"]');
  check(await p.isVisible('#gest-visual .cart-box.cart--dore'), 'Booster : aperçu de la cartouche dans le récapitulatif');
  await p.fill('#gest-amount', '2');
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.check(`input[name="gest-who"][value="${BRUNO}"]`);
  check(/2 membres recevront 2 boosters Doré chacun/.test(await recap(p)), 'récapitulatif : « 2 membres recevront 2 boosters Doré chacun »');
  await p.click('#gest-go');
  await p.waitForSelector('dialog.hg-dialog[open] button[value="ok"]', { timeout: 5000 });
  await confirmOk(p);
  await p.waitForFunction(() => document.querySelectorAll('#gest-chips .gest-chip').length === 0, null, { timeout: 5000 });
  const b2 = await bulkCalls(p);
  check(b2.length === 1 && b2[0].p_kind === 'boosters' && b2[0].p_amount === 2, 'Booster : une RPC, p_kind = boosters, 2 par membre');
  check(b2[0].p_card === null && b2[0].p_note === null, 'Booster : pas de carte, pas de motif (null)');
  check(b2[0].p_booster === 'dore', 'Booster : p_booster = dore (le booster choisi)');
  check(!p.errs.length, 'Booster : aucune erreur JS');
  await p.ctx.close();

  // 3. Carte : recherche « fontaine », 3 exemplaires brillants, un membre.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrir(p);
  await p.click('[data-gest-kind="carte"]');
  check(await p.isVisible('#gest-cardbox'), 'Cartes : le choix de carte apparaît');
  await p.waitForSelector('#gest-cardbox [data-vp-card="C2"]', { timeout: 5000 });
  await p.fill('#gest-cp-q', 'fontaine');
  const options = await p.$$eval('#gest-cardbox [data-vp-card]', (o) => o.map((x) => x.dataset.vpCard));
  check(options.length === 1 && options[0] === 'C2', 'recherche « fontaine » : une seule carte proposée (visuels)');
  await p.click('#gest-cardbox [data-vp-card="C2"]');
  check(await p.isVisible('#gest-visual .hgc'), 'Carte : aperçu du visuel dans le récapitulatif');
  await p.fill('#gest-amount', '3');
  await p.click('label:has(input[name="shiny"])');
  await p.check(`input[name="gest-who"][value="${BRUNO}"]`);
  check(/1 membre recevra 3 exemplaires de « La Fontaine » \(brillante\)/.test(await recap(p)), 'récapitulatif carte : nom et brillance');
  await p.click('#gest-go');
  await p.waitForSelector('dialog.hg-dialog[open] button[value="ok"]', { timeout: 5000 });
  await confirmOk(p);
  await p.waitForFunction(() => document.querySelectorAll('#gest-chips .gest-chip').length === 0, null, { timeout: 5000 });
  const b3 = await bulkCalls(p);
  check(b3.length === 1 && b3[0].p_kind === 'carte' && b3[0].p_card === 'C2', 'Carte : p_card = C2');
  check(b3[0].p_amount === 3 && b3[0].p_shiny === true, 'Carte : 3 exemplaires, brillante');
  check(JSON.stringify(b3[0].p_users) === JSON.stringify([BRUNO]), 'Carte : un seul destinataire');
  await p.ctx.close();

  // 4. Tout le gang : p_users = null, cases désactivées, fil décoché, motif transmis.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrir(p);
  await p.click('label:has(#gest-all)');
  check(await p.isDisabled(`input[name="gest-who"][value="${ALICE}"]`), 'tout le gang : les cases membres sont désactivées');
  check(/Tout le gang \(\d+ membres\) recevra/.test(await recap(p)), 'tout le gang : le récapitulatif le dit');
  await p.fill('#gest-amount', '500');
  await p.click('label:has(#gest-announce)');
  await p.fill('#gest-motif', 'Anniversaire du gang');
  await p.click('#gest-go');
  await p.waitForSelector('dialog.hg-dialog[open] button[value="ok"]', { timeout: 5000 });
  await confirmOk(p);
  await p.waitForFunction(() => (window.__LOG || []).some((l) => l[0] === 'rpc' && l[1] === 'hg_cards_admin_bulk_give'), null, { timeout: 5000 }).catch(() => {});
  const b4 = await bulkCalls(p);
  check(b4.length === 1 && b4[0].p_users === null, 'tout le gang : p_users = null');
  check(b4[0].p_kind === 'paillettes' && b4[0].p_amount === 500, 'tout le gang : 500 Paillettes');
  check(b4[0].p_announce === false, 'annonce décochée : p_announce = false');
  check(b4[0].p_note === 'Anniversaire du gang', 'motif transmis en p_note');
  await p.ctx.close();

  // 5. Validation : aucun membre, aucune RPC, pas de confirmation.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrir(p);
  await p.click('#gest-go');
  await p.waitForSelector('#gest-err:not([hidden])', { timeout: 3000 }).catch(() => {});
  check(!!(await p.$('#gest-err:not([hidden])')), 'sans membre : erreur affichée dans le bloc Give');
  check(!(await p.$('dialog.hg-dialog[open]')), 'sans membre : pas de confirmation');
  check((await bulkCalls(p)).length === 0, 'sans membre : aucune RPC');
  await p.ctx.close();

  // 6. RPC refusée : message dans le bloc, le formulaire garde son contenu, aucune ligne ajoutée.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { bulkFail: true } });
  await ouvrir(p);
  await p.click('[data-gest-kind="carte"]');
  await p.waitForSelector('#gest-cardbox [data-vp-card="C1"]', { timeout: 5000 });
  await p.click('#gest-cardbox [data-vp-card="C1"]');
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.click('#gest-go');
  await confirmOk(p);
  await p.waitForSelector('#gest-err:not([hidden])', { timeout: 5000 }).catch(() => {});
  check(/Plus assez d'exemplaires/.test(await p.textContent('#gest-err').catch(() => '')), 'RPC refusée : message clair dans le bloc Give');
  check((await p.$$('#gest-chips .gest-chip')).length === 1, 'RPC refusée : la sélection reste');
  await p.ctx.close();

  // 7. Résumé : une alerte expliquée (concentration des gains) avec son lien, et une enchère ouverte.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900,
    scenario: { gestionEncheres: [{ id: 'A1', card_id: 'C2', card_name: 'La Fontaine', status: 'ouverte', starts_at: new Date(Date.now() - 36e5).toISOString(), ends_at: new Date(Date.now() + 36e6).toISOString(), min_bid: 500, step: 50, bids: 0, price: null }] } });
  await ouvrir(p);
  const eco = await p.textContent('#gest-eco');
  check(/48.?250|48.250/.test(eco), 'Résumé : Paillettes en circulation (48 250)');
  check(eco.includes('+2 % sur 7 jours'), 'Résumé : variation « +2 % sur 7 jours » (hg_eco_health)');
  check(eco.includes('Enchères en cours') && eco.includes('La Fontaine'), 'Résumé : enchère ouverte et sa carte');
  check(eco.includes('Un membre a gagné 6 fois la médiane'), 'Résumé : alerte de concentration expliquée');
  check(!!(await p.$('#gest-eco a[href="#fabrique/limites"]')) && !!(await p.$('#gest-eco a[href="#fabrique/stats"]')), 'Résumé : liens vers Économie › Limites et Suivi › Statistiques');
  check(!eco.includes('4 semaines'), 'Résumé : pas de tendance sur 4 semaines (donnée absente)');
  await p.ctx.close();

  // 8. Une source en échec : « – » et son message, les autres blocs restent.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { ecoFail: true, boostersFail: true } });
  await ouvrir(p);
  const eco2 = await p.textContent('#gest-eco');
  check(eco2.includes('Alertes indisponibles'), 'économie en échec : message d\'erreur des alertes');
  check(eco2.includes('Statistiques indisponibles'), 'boosters en échec : message d\'erreur à la place du chiffre');
  check((await p.$$('#gest-eco .acd-tile')).length === 3, 'économie en échec : les trois tuiles restent affichées');
  check(!!(await p.$('#gest-give-h')), 'économie en échec : le bloc Give reste utilisable');
  await p.ctx.close();

  // 9. Derniers gives : dons groupés et cartes données (un destinataire), 10 au plus, avec destinataires et motif.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await ouvrir(p);
  const journal = await p.textContent('#gest-journal');
  const lignes = await p.$$eval('#gest-journal .acd-item', (x) => x.length);
  check(lignes === 4, 'derniers gives : 3 dons groupés et 1 carte donnée (4 lignes)');
  check(journal.includes('Tout le gang (9 membres)') && journal.includes('Anniversaire du gang'), 'derniers gives : « Tout le gang » et le motif');
  check(journal.includes('Alice et Bruno'), 'derniers gives : destinataires nommés (Alice et Bruno)');
  check(journal.includes('Carte donnée') && journal.includes('1 exemplaire de « '), 'derniers gives : la carte donnée a son libellé');
  check(!journal.includes('C1'), 'derniers gives : la carte donnée affiche le nom de la carte, pas son id');
  check(!p.errs.length, 'derniers gives : aucune erreur JS');
  await p.ctx.close();

  // 9b. Carte donnée brillante en deux exemplaires, et une autre action (ajustement) qui ne doit pas apparaître.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { journalDons: [
    { id: 11, admin_id: '11111111-1111-4111-8111-111111111111', action: 'carte_donnee', target_user: '00000002-0000-4000-8000-000000000002', target_ref: 'C2', details: { exemplaires: 2, brillante: true, annonce: true }, created_at: new Date(Date.now() - 6e4).toISOString() },
    { id: 12, admin_id: '11111111-1111-4111-8111-111111111111', action: 'ajustement_paillettes', target_user: '00000003-0000-4000-8000-000000000003', target_ref: 'paillettes', details: {}, created_at: new Date(Date.now() - 3e4).toISOString() },
  ] } });
  await ouvrir(p);
  const j2 = await p.textContent('#gest-journal');
  check((await p.$$eval('#gest-journal .acd-item', (x) => x.length)) === 1, 'carte donnée seule : une ligne (l\'ajustement est exclu)');
  check(j2.includes('Alice') && j2.includes('2 exemplaires de « La Fontaine » (brillante)'), 'carte donnée : destinataire, nombre, carte et brillante');
  check(!j2.includes('Ajustement'), 'carte donnée : pas de ligne d\'une autre action');
  await p.ctx.close();

  // 10. Mobile 390 px : une colonne, sans défilement horizontal, cibles ≥ 44 px.
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844 });
  await ouvrir(p);
  check(await hscroll(p) <= 0, '390 px : sans défilement horizontal');
  const cibles = await p.evaluate(() => ['#gest-go', '[data-gest-kind="carte"]', '#gest-q', '#gest-amount', 'label:has(#gest-all)'].map((s) => {
    const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().height) : 0;
  }));
  check(cibles.every((h) => h >= 44), '390 px : Donner, onglets, champs et « Tout le gang » font au moins 44 px (' + cibles.join(', ') + ')');
  const colonnes = await p.evaluate(() => {
    const a = document.getElementById('gest-give-zone').getBoundingClientRect();
    const b = document.getElementById('gest-eco').getBoundingClientRect();
    return Math.abs(a.left - b.left) < 4;
  });
  check(colonnes, '390 px : les blocs se suivent en une colonne');
  await p.screenshot({ path: path.join(SHOTS, 'admin-gestion-390.png'), fullPage: true });
  check(!p.errs.length, '390 px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
