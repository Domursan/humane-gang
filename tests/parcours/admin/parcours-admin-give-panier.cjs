// Parcours : le give en panier (assets/espaces/admin/give-panier.js) dans Le jeu de cartes › Gestion globale.
// Un seul don mélange Paillettes, cartes choisies une à une, une série entière, un type entier et plusieurs boosters :
// une seule RPC hg_cards_admin_give_panier, avec une ligne par élément. Contrôles : brillance selon la carte, fusion des lignes,
// quantités, dépassement d'une carte limitée, garde-fou de 100 000 exemplaires, RPC refusée, ligne « panier » du journal,
// étapes à 390 px, cibles de 44 px, sans défilement horizontal.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scenario.bulkFail, uniques, journalDons).
// Lancer : node tests/parcours/admin/parcours-admin-give-panier.cjs
const path = require('path');
const { ROOT, SHOTS, check, finish, openPage, adminSection, hscroll, log, chromium } = require('../../lib/harness.cjs');

const ALICE = '00000002-0000-4000-8000-000000000002';
const BRUNO = '00000003-0000-4000-8000-000000000003';
const FIX = 'fake-sb-cartes.mjs';
const zone = '#gest-give-zone';

/** Appels de la RPC hg_cards_admin_give_panier (journal du faux client). */
const appels = async (p) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === 'hg_cards_admin_give_panier').map((l) => l[2]);
/** Texte du récapitulatif. */
const recap = (p) => p.textContent(`${zone} [data-gv-sum]`);
/** Ouvre Gestion globale et attend le catalogue. */
async function ouvrir(p, carte = 'C2') {
  await adminSection(p, 'fabrique/gestion');
  await p.waitForSelector(`${zone} [data-vp-card="${carte}"]`, { state: 'attached', timeout: 8000 });
}
/** Donner, confirmer, attendre la fin. */
async function donner(p) {
  await p.click('[data-gv-go]');
  await p.waitForSelector('dialog.gv-confirm [data-gv-ok]', { timeout: 5000 });
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await p.waitForSelector('dialog.gv-confirm', { state: 'detached', timeout: 5000 });
}

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Tout dans un seul don : Paillettes, deux cartes, une série, un type, deux boosters.
  let p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await ouvrir(p);
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.check(`input[name="gest-who"][value="${BRUNO}"]`);
  await p.click(`${zone} [data-gv-ajp="1000"]`);
  await p.click(`${zone} [data-gv-ajp="100"]`);
  check(await p.inputValue('#gest-paill') === '1100', 'Paillettes : les raccourcis s\'additionnent (1 100)');
  await p.fill('#gest-paill', '750');
  await p.click(`${zone} [data-vp-card="C2"]`);
  await p.click(`${zone} [data-vp-card="C2"]`);
  check((await p.textContent(`${zone} .vp-tile:has([data-vp-card="C2"]) .vp-n`)).includes('×2'), 'catalogue : la quantité s\'affiche sur la carte');
  await p.click(`${zone} [data-gv-br="0"]`);
  await p.click(`${zone} [data-vp-card="C3"]`);
  await p.fill(`${zone} [data-gv-qte="1"]`, '4');
  await p.dispatchEvent(`${zone} [data-gv-qte="1"]`, 'change');
  // Carte sans version brillante : pas de case
  await p.click(`${zone} [data-vp-card="C1"]`);
  check((await p.textContent(`${zone} .gv-l:has([data-gv-x="2"])`)).includes('Sans version brillante'), 'brillance : carte sans version brillante, pas de case');
  check(!(await p.$(`${zone} [data-gv-br="2"]`)), 'brillance : aucune case sur cette carte');
  // Toute une série
  await p.selectOption('#gest-c-set', 'SET2');
  await p.waitForSelector(`${zone} [data-gv-lot]`, { timeout: 3000 });
  check((await p.textContent(`${zone} [data-gv-lot]`)).includes('Toute la série'), 'filtre série : bouton « Toute la série »');
  await p.click(`${zone} [data-gv-lot]`);
  await p.selectOption('#gest-c-set', '');
  // Tout un type
  await p.selectOption('#gest-c-fam', 'moment');
  await p.waitForSelector(`${zone} [data-gv-lot]`, { timeout: 3000 });
  check((await p.textContent(`${zone} [data-gv-lot]`)).includes('Tout le type'), 'filtre type : bouton « Tout le type »');
  await p.click(`${zone} [data-gv-lot]`);
  await p.selectOption('#gest-c-fam', '');
  check(!(await p.$(`${zone} [data-gv-lot]`)), 'sans filtre : pas de bouton de lot');
  // Deux sortes de boosters
  await p.click(`${zone} [data-gv-onglet="boosters"]`);
  await p.click(`${zone} [data-vp-type="classique"]`);
  await p.click(`${zone} [data-vp-type="dore"]`);
  await p.click(`${zone} [data-vp-type="dore"]`);
  check((await p.textContent(`${zone} [data-gv-onglet="boosters"]`)).includes('2'), 'onglet Boosters : deux lignes annoncées');
  check((await p.$$(`${zone} .gv-l [data-gv-x]`)).length === 7, 'panier : sept lignes');
  check(/2 membres recevront chacun 750 Paillettes/.test(await recap(p)), 'récapitulatif : Paillettes par membre');
  check(/boosters? au total/.test(await recap(p)), 'récapitulatif : total');
  await p.click('[data-gv-go]');
  await p.waitForSelector('dialog.gv-confirm [data-gv-ok]', { timeout: 5000 });
  const conf = await p.textContent('dialog.gv-confirm');
  check(conf.includes('750 Paillettes') && conf.includes('Toute la série') && conf.includes('Tout le type'), 'confirmation : le détail de ce que reçoit chaque membre');
  check(conf.includes('Alice') && conf.includes('Bruno'), 'confirmation : les destinataires');
  check((await p.locator('dialog.gv-confirm .gv-strip .gv-vis').count()) === 7, 'confirmation : les visuels des lignes');
  await p.waitForTimeout(400); // fin de l'ouverture de la fenêtre
  await p.screenshot({ path: path.join(SHOTS, 'admin-give-confirmation.png') });
  check((await appels(p)).length === 0, 'avant confirmation : aucune RPC');
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await p.waitForSelector('dialog.gv-confirm', { state: 'detached', timeout: 5000 });
  const a = await appels(p);
  check(a.length === 1, 'une seule RPC pour tout le panier');
  check(a[0]?.p_paillettes === 750, 'p_paillettes = 750');
  const l = a[0]?.p_lignes || [];
  check(l.some((x) => x.type === 'carte' && x.card === 'C2' && x.qte === 2 && x.shiny === true), 'ligne : C2, 2 exemplaires, brillante');
  check(l.some((x) => x.type === 'carte' && x.card === 'C3' && x.qte === 4 && x.shiny === false), 'ligne : C3, 4 exemplaires');
  check(l.some((x) => x.type === 'lot' && x.set === 'SET2' && x.rarity === null && x.family === null), 'ligne : toute la série SET2');
  check(l.some((x) => x.type === 'lot' && x.family === 'moment' && x.set === null), 'ligne : tout le type moment');
  check(l.some((x) => x.type === 'booster' && x.booster === 'classique' && x.qte === 1) && l.some((x) => x.type === 'booster' && x.booster === 'dore' && x.qte === 2), 'lignes : deux sortes de boosters');
  check(!p.errs.length, 'don complet : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 2. Lignes : deux brillances de la même carte fusionnent ; retirer, tout retirer, annonce.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await ouvrir(p);
  await p.click(`${zone} [data-vp-card="C2"]`);
  await p.click(`${zone} [data-gv-br="0"]`);
  await p.click(`${zone} [data-vp-card="C2"]`);
  check((await p.$$(`${zone} .gv-l [data-gv-x]`)).length === 2, 'même carte, brillante et normale : deux lignes');
  await p.click(`${zone} [data-gv-br="1"]`);
  check((await p.$$(`${zone} .gv-l [data-gv-x]`)).length === 1, 'même brillance : les lignes fusionnent');
  check(await p.inputValue(`${zone} [data-gv-qte="0"]`) === '2', 'fusion : les quantités s\'additionnent');
  await p.click(`${zone} [data-gv-moins="0"]`);
  check(await p.inputValue(`${zone} [data-gv-qte="0"]`) === '1', 'moins : quantité 1');
  await p.click(`${zone} [data-gv-moins="0"]`);
  check(await p.inputValue(`${zone} [data-gv-qte="0"]`) === '1', 'moins : la quantité ne descend pas sous 1');
  await p.click(`${zone} [data-gv-x="0"]`);
  check(!(await p.$(`${zone} .vp-tile:has([data-vp-card="C2"]) .vp-n`)), 'ligne retirée : plus de quantité sur la carte');
  await p.click(`${zone} [data-vp-card="C3"]`);
  await p.click(`${zone} [data-vp-card="C4"]`);
  await p.click(`${zone} [data-gv-vider]`);
  check(!(await p.$(`${zone} .gv-l [data-gv-x]`)), '« Tout retirer » vide le panier');
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  check(/panier est vide/.test(await recap(p)), 'panier vide : le récapitulatif le dit');
  await p.click('[data-gv-go]');
  check(await p.isVisible(`${zone} .gv-err`) && !(await p.$('dialog.gv-confirm')), 'panier vide : erreur, pas de confirmation');
  await p.fill('#gest-paill', '1.5');
  await p.click('[data-gv-go]');
  check((await p.textContent(`${zone} .gv-err`)).includes('nombre entier'), 'Paillettes décimales refusées');
  await p.ctx.close();

  // 3. Dépassement : carte unique déjà attribuée, autorisée, alerte au panier et dans la confirmation.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: { uniques: true, uniqueTaken: true } });
  await adminSection(p, 'fabrique/gestion');
  await p.waitForSelector('#gest-c-set', { timeout: 8000 });
  await p.selectOption('#gest-c-set', 'SETHS');
  await p.waitForSelector(`${zone} [data-vp-card="C14"]`, { timeout: 5000 });
  check(await p.getAttribute(`${zone} [data-vp-card="C14"]`, 'disabled') === null, 'dépassement : la carte épuisée reste proposée');
  await p.click(`${zone} [data-vp-card="C14"]`);
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.check(`input[name="gest-who"][value="${BRUNO}"]`);
  const w = await p.textContent(`${zone} .gv-warn`);
  check(/2 exemplaires demandés, aucun restant/.test(w) && /2 exemplaires iront au-delà du maximum/.test(w), 'dépassement : alerte au panier (« ' + w + ' »)');
  await p.click('[data-gv-go]');
  await p.waitForSelector('dialog.gv-confirm .gv-warn', { timeout: 5000 });
  check((await p.textContent('dialog.gv-confirm .gv-warn')).includes('Dépassement'), 'dépassement : alerte dans la confirmation');
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await p.waitForSelector('dialog.gv-confirm', { state: 'detached', timeout: 5000 });
  check((await appels(p))[0]?.p_lignes[0]?.card === 'C14', 'dépassement : le don part');
  await p.ctx.close();

  // 4. Garde-fou : plus de 100 000 exemplaires, refus avant l'envoi.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await ouvrir(p);
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.click(`${zone} [data-vp-card="C2"]`);
  await p.fill(`${zone} [data-gv-qte="0"]`, '100001');
  await p.dispatchEvent(`${zone} [data-gv-qte="0"]`, 'change');
  check(/donne en plusieurs fois/.test(await recap(p)), 'garde-fou : le récapitulatif l\'explique');
  await p.click('[data-gv-go]');
  check(!(await p.$('dialog.gv-confirm')) && (await appels(p)).length === 0, 'garde-fou : ni confirmation ni RPC');
  await p.ctx.close();

  // 5. RPC refusée : erreur dans la confirmation ; Retour, le panier est intact.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: { bulkFail: true } });
  await ouvrir(p);
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.click(`${zone} [data-vp-card="C2"]`);
  await p.click('[data-gv-go]');
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await p.waitForSelector('dialog.gv-confirm .qk-err:not([hidden])', { timeout: 5000 });
  check((await p.textContent('dialog.gv-confirm .qk-err')).includes('plus disponible'), 'RPC refusée : message clair');
  await p.click('dialog.gv-confirm .btn[data-gv-retour]');
  check((await p.$$(`${zone} .gv-l [data-gv-x]`)).length === 1 && (await p.$$(`${zone} .gest-chip`)).length === 1, 'RPC refusée : le panier et le membre restent');
  await p.ctx.close();

  // 6. Après un don, le panier repart à zéro.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await ouvrir(p);
  await p.check(`input[name="gest-who"][value="${BRUNO}"]`);
  await p.click(`${zone} [data-vp-card="C2"]`);
  await donner(p);
  await p.waitForFunction(() => !document.querySelector('#gest-give-zone .gest-chip'), null, { timeout: 5000 });
  check(!(await p.$(`${zone} .gv-l [data-gv-x]`)), 'après un don : panier vide');
  await p.ctx.close();

  // 7. Journal : une ligne « panier » donne le détail, les totaux et le motif.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: { journalDons: [
    { id: 21, admin_id: '11111111-1111-4111-8111-111111111111', action: 'don_groupe', target_user: null, target_ref: 'panier', created_at: new Date(Date.now() - 6e4).toISOString(),
      details: { lot: 'lot-x', paillettes: 500, exemplaires: 3, boosters: 2, resume: ['500 Paillettes', '3 cartes', '2 boosters Classique'], membres: 2, tout_le_gang: false, annonce: true, note: 'Merci', destinataires: [ALICE, BRUNO] } },
  ] } });
  await ouvrir(p);
  await p.waitForFunction(() => document.querySelectorAll('#gest-journal .acd-item').length === 1, null, { timeout: 5000 });
  const j = await p.textContent('#gest-journal');
  check(j.includes('Alice et Bruno') && j.includes('Panier'), 'journal : destinataires et « Panier »');
  check(j.includes('500 Paillettes · 3 cartes · 2 boosters Classique'), 'journal : le détail du don');
  check(/1.?000 Paillettes, 6 exemplaires, 4 boosters/.test(j), 'journal : les totaux');
  check(j.includes('Motif : Merci'), 'journal : le motif');
  await p.ctx.close();

  // 8. 390 px : trois étapes, sans défilement horizontal, cibles de 44 px, compteurs à jour.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 390, height: 844 });
  await adminSection(p, 'fabrique/gestion');
  await p.waitForSelector(`${zone} [data-gv-vue="membres"]`, { timeout: 8000 });
  check(await p.isVisible(`${zone} [data-gv-vue="ajouter"]`), '390 px : les étapes sont affichées');
  check(await p.isHidden(`${zone} .gv-d`), '390 px, étape Membres : le panier est masqué');
  await p.check(`input[name="gest-who"][value="${ALICE}"]`);
  await p.click(`${zone} [data-gv-vue="ajouter"]`);
  check(await p.isVisible(`${zone} [data-vp-card="C2"]`), '390 px, étape Ajouter : le catalogue est visible');
  await p.click(`${zone} [data-vp-card="C2"]`);
  await p.click(`${zone} [data-vp-card="C3"]`);
  check((await p.textContent(`${zone} [data-gv-vue="panier"]`)).includes('2'), '390 px : le compteur du panier suit');
  check(await hscroll(p) <= 0, '390 px, étape Ajouter : sans défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'admin-give-390-ajouter.png') });
  await p.click(`${zone} [data-gv-vue="panier"]`);
  check(await p.isVisible(`${zone} [data-gv-panier]`), '390 px, étape Panier : le panier est visible');
  check(await hscroll(p) <= 0, '390 px, étape Panier : sans défilement horizontal');
  const petites = await p.evaluate(() => [...document.querySelectorAll('#gest-give-zone [data-gv-panier] button, #gest-give-zone [data-gv-panier] input:not([type=checkbox]), #gest-give-zone [data-gv-vue], [data-gv-go]')]
    .filter((e) => e.getClientRects().length && e.getBoundingClientRect().height < 44).map((e) => e.outerHTML.slice(0, 60)));
  check(!petites.length, '390 px : toutes les cibles font au moins 44 px' + (petites.length ? ' (' + petites.join(' | ') + ')' : ''));
  await p.screenshot({ path: path.join(SHOTS, 'admin-give-390-panier.png') });
  await p.click('[data-gv-go]');
  await p.waitForSelector('dialog.gv-confirm [data-gv-ok]', { timeout: 5000 });
  const fen = await p.evaluate(() => { const b = document.querySelector('dialog.gv-confirm').getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth }; });
  check(fen.l >= 0 && fen.r <= fen.w, '390 px : la confirmation tient dans l\'écran');
  check(!p.errs.length, '390 px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
