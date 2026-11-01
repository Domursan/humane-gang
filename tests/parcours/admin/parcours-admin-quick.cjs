// Parcours : actions rapides du plateau du panel (assets/espaces/admin/quick.js). Le plateau envoie
// document.dispatchEvent(new CustomEvent('hg:quick', { detail: { action } })) ; ici on déclenche l'événement dans la page.
// Give (hg_cards_admin_bulk_give), Nouvelle enchère (hg_auction_create), Lancer un drop (hg_drop_create + hg-notify card_drop).
// Contrôles : fenêtre modale, Échap ferme et rend le focus, Tab reste dans la fenêtre, validation, appel RPC avec les bons
// arguments (journal window.__LOG du faux client), absence de permission (pas de preventDefault), 390 px sans défilement
// horizontal, aucune erreur JavaScript.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scenario.uniques : carte unique C14 ; scenario.myPerms : droits simulés).
// Lancer : node tests/parcours/admin/parcours-admin-quick.cjs
const { ROOT, check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const ALICE = '00000002-0000-4000-8000-000000000002';
const BRUNO = '00000003-0000-4000-8000-000000000003';
const FIX = 'fake-sb-cartes.mjs';

/** Déclenche l'action du plateau dans la page. Renvoie true si personne n'a annulé l'événement (repli : navigation). */
// cancelable : sans lui, preventDefault() ne fait rien et le repli ne s'annule pas.
const quick = (p, action) => p.evaluate((a) => document.dispatchEvent(new CustomEvent('hg:quick', { detail: { action: a }, cancelable: true })), action);
/** Fenêtre ouverte (dialog.qk-dlg[open]). */
const dlg = (p) => p.locator('dialog.qk-dlg[open]');
/** Attend qu'une fenêtre soit ouverte, puis qu'elle soit affichée (le contenu peut charger). */
const waitDlg = (p) => p.waitForSelector('dialog.qk-dlg[open]', { timeout: 5000 });
/** Attend la fermeture (la fenêtre est retirée du DOM). */
const waitClosed = (p) => p.waitForSelector('dialog.qk-dlg', { state: 'detached', timeout: 5000 }).catch(() => {});
/** Journal des appels d'une RPC (arguments). */
const rpcCalls = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn).map((e) => e[2]);
/** Appels de hg-notify avec l'événement demandé. */
const notifyCalls = async (p, event) => (await log(p)).filter((e) => e[0] === 'fn' && e[1] === 'hg-notify' && e[2]?.event === event).map((e) => e[2]);
/** Met le focus sur un bouton de test (point de départ de la fenêtre, pour vérifier le retour du focus). */
const focusTrigger = (p) => p.evaluate(() => { let b = document.getElementById('qk-test'); if (!b) { b = document.createElement('button'); b.id = 'qk-test'; b.type = 'button'; b.textContent = 'Déclencheur de test'; document.body.append(b); } b.focus(); });

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Give : paillettes à deux membres, avec note, sans annonce au fil. Confirmation puis appel de la RPC.
  let p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await focusTrigger(p);
  let notPrevented = await quick(p, 'give');
  check(notPrevented === false, 'give : l\'événement est annulé (preventDefault), pas de navigation');
  await waitDlg(p);
  check((await p.textContent('dialog.qk-dlg[open] .qk-title')) === 'Give', 'give : titre « Give »');
  check(await p.isVisible('dialog.qk-dlg[open] a.qk-link[href="/pages/admin/admin.html#fabrique/gestion"]'), 'give : lien « Ouvrir la page complète » vers Fabrique › Gestion globale');
  await p.waitForSelector('dialog.qk-dlg[open] .qk-chip', { timeout: 5000 });
  await p.click(`dialog.qk-dlg[open] .qk-chip[data-id="${ALICE}"]`);
  await p.click(`dialog.qk-dlg[open] .qk-chip[data-id="${BRUNO}"]`);
  await p.fill('#qk-g-amt', '250');
  await p.fill('#qk-g-note', 'Merci');
  await p.click('dialog.qk-dlg[open] input[name="announce"]'); // décoché
  check((await p.textContent('dialog.qk-dlg[open] [data-count]')).includes('2 choisis'), 'give : compteur « 2 choisis »');
  check((await p.textContent('dialog.qk-dlg[open] .qk-sum')).includes('2 membres recevront 250 Paillettes'), 'give : récapitulatif « 2 membres recevront 250 Paillettes »');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  check(await p.isHidden('dialog.qk-dlg[open] [data-pane="form"]'), 'give : volet de confirmation affiché');
  check((await p.textContent('dialog.qk-dlg[open] [data-confirm-who]')).includes('Alice') && (await p.textContent('dialog.qk-dlg[open] [data-confirm-who]')).includes('Bruno'), 'give : confirmation liste les destinataires');
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  let calls = await rpcCalls(p, 'hg_cards_admin_bulk_give');
  check(calls.length === 1, 'give : hg_cards_admin_bulk_give appelée une fois');
  check(JSON.stringify(calls[0]?.p_users) === JSON.stringify([ALICE, BRUNO]), 'give : p_users = les deux membres choisis');
  check(calls[0]?.p_kind === 'paillettes' && calls[0]?.p_amount === 250, 'give : p_kind paillettes, p_amount 250');
  check(calls[0]?.p_card === null && calls[0]?.p_shiny === false, 'give : pas de carte, pas de brillance');
  check(calls[0]?.p_announce === false && calls[0]?.p_note === 'Merci', 'give : p_announce false, p_note « Merci »');
  check((await notifyCalls(p, 'card_gift_admin')).length === 0, 'give : aucun MP Discord (comme le tiroir Don groupé)');
  check(!p.errs.length, 'give paillettes : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 2. Give : carte brillante à tout le gang (p_users null), deux exemplaires.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await quick(p, 'give');
  await waitDlg(p);
  await p.click('dialog.qk-dlg[open] [data-kind="carte"]');
  check(await p.isVisible('dialog.qk-dlg[open] .qk-card'), 'give carte : bloc carte affiché');
  check((await p.inputValue('#qk-g-amt')) === '1', 'give carte : montant ramené à 1 (défaut de la carte)');
  await p.click('dialog.qk-dlg[open] [data-vp-card="C2"]');
  await p.click('dialog.qk-dlg[open] input[name="shiny"]');
  await p.click('dialog.qk-dlg[open] input[name="all"]');
  check(await p.isDisabled(`dialog.qk-dlg[open] .qk-chip[data-id="${ALICE}"]`), 'give tout le gang : les cases membres sont désactivées');
  await p.fill('#qk-g-amt', '2');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  calls = await rpcCalls(p, 'hg_cards_admin_bulk_give');
  check(calls[0]?.p_users === null, 'give tout le gang : p_users = null');
  check(calls[0]?.p_kind === 'carte' && calls[0]?.p_card === 'C2' && calls[0]?.p_shiny === true && calls[0]?.p_amount === 2, 'give carte : p_kind carte, p_card C2, brillante, 2 exemplaires');
  check(calls[0]?.p_announce === true && calls[0]?.p_note === null, 'give carte : fil coché par défaut, note vide = null');
  check(!p.errs.length, 'give carte : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 3. Give : validation (aucun membre), boosters avec retour au formulaire, Échap ferme et rend le focus.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await focusTrigger(p);
  await quick(p, 'give');
  await waitDlg(p);
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] .qk-err:not([hidden])', { timeout: 3000 }).catch(() => {});
  check((await p.textContent('dialog.qk-dlg[open] .qk-err')).includes('Choisis au moins un membre'), 'give sans membre : message « Choisis au moins un membre »');
  check(await p.isVisible('dialog.qk-dlg[open] [data-pane="form"]'), 'give sans membre : reste sur le formulaire');
  check((await rpcCalls(p, 'hg_cards_admin_bulk_give')).length === 0, 'give sans membre : aucun appel de RPC');
  await p.click(`dialog.qk-dlg[open] .qk-chip[data-id="${BRUNO}"]`);
  await p.click('dialog.qk-dlg[open] [data-kind="boosters"]');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-back]', { timeout: 3000 });
  await p.click('dialog.qk-dlg[open] [data-qk-back]');
  check(await p.isVisible('dialog.qk-dlg[open] [data-pane="form"]'), 'give : « Retour » revient au formulaire');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  calls = await rpcCalls(p, 'hg_cards_admin_bulk_give');
  check(calls.length === 1 && calls[0]?.p_kind === 'boosters' && calls[0]?.p_amount === 1 && JSON.stringify(calls[0]?.p_users) === JSON.stringify([BRUNO]), 'give boosters : p_kind boosters, 1 booster, Bruno seul');
  check(calls[0]?.p_note === null && calls[0]?.p_announce === true, 'give boosters : note vide, fil coché');
  check(calls[0]?.p_booster === 'classique', 'give boosters : p_booster « classique » par défaut');
  await p.ctx.close();

  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await focusTrigger(p);
  await quick(p, 'give');
  await waitDlg(p);
  await p.keyboard.press('Escape');
  await waitClosed(p);
  check((await p.$$('dialog.qk-dlg')).length === 0, 'Échap : la fenêtre est fermée et retirée du DOM');
  check((await p.evaluate(() => document.activeElement?.id)) === 'qk-test', 'Échap : le focus revient au déclencheur');
  check((await rpcCalls(p, 'hg_cards_admin_bulk_give')).length === 0, 'Échap : aucun don envoyé');
  await p.ctx.close();

  // 4. Focus piégé : Tab reste dans la fenêtre.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await quick(p, 'give');
  await waitDlg(p);
  let escaped = 0;
  for (let i = 0; i < 40; i++) {
    await p.keyboard.press('Tab');
    const inside = await p.evaluate(() => !!document.activeElement?.closest('dialog.qk-dlg'));
    if (!inside) escaped++;
  }
  check(escaped === 0, 'focus piégé : 40 Tab, le focus reste dans la fenêtre');
  await p.keyboard.press('Shift+Tab');
  check(await p.evaluate(() => !!document.activeElement?.closest('dialog.qk-dlg')), 'focus piégé : Maj+Tab reste dans la fenêtre');
  await p.ctx.close();

  // 5. Nouvelle enchère : carte unique C14, règles par défaut, confirmation, hg_auction_create.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: { uniques: true } });
  await focusTrigger(p);
  notPrevented = await quick(p, 'enchere');
  check(notPrevented === false, 'enchère : événement annulé');
  await waitDlg(p);
  check((await p.textContent('dialog.qk-dlg[open] .qk-title')) === 'Nouvelle enchère', 'enchère : titre « Nouvelle enchère »');
  check(await p.isVisible('dialog.qk-dlg[open] a.qk-link[href="/pages/admin/admin.html#fabrique/encheres"]'), 'enchère : lien vers Fabrique › Enchères');
  await p.waitForSelector('#qk-a-card option[value="C14"]', { timeout: 5000, state: 'attached' });
  check((await p.inputValue('#qk-a-start')) !== '' && (await p.inputValue('#qk-a-end')) !== '', 'enchère : début et fin pré-remplis (week-end)');
  check((await p.inputValue('#qk-auc-min_bid')) === '500' && (await p.inputValue('#qk-auc-step')) === '50', 'enchère : mise 500 et pas 50 par défaut');
  // Fin avant le début : refusé avant l'envoi
  await p.fill('#qk-a-end', await p.inputValue('#qk-a-start'));
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] .qk-err:not([hidden])', { timeout: 3000 }).catch(() => {});
  check((await p.textContent('dialog.qk-dlg[open] .qk-err')).includes('La fin doit être après le début'), 'enchère : fin avant début refusée');
  check((await rpcCalls(p, 'hg_auction_create')).length === 0, 'enchère : aucun appel tant que les dates sont fausses');
  await p.fill('#qk-a-end', '2030-01-06T18:00');
  await p.fill('#qk-a-start', '2030-01-04T18:00');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  calls = await rpcCalls(p, 'hg_auction_create');
  const a = calls[0]?.p || {};
  check(calls.length === 1, 'enchère : hg_auction_create appelée une fois');
  check(a.card_id === 'C14', 'enchère : carte C14');
  check(a.starts_at === new Date('2030-01-04T18:00').toISOString() && a.ends_at === new Date('2030-01-06T18:00').toISOString(), 'enchère : dates envoyées en ISO (heure locale saisie)');
  check(a.min_bid === '500' && a.step === '50' && a.block_last_winner === true && a.extend_min === '5', 'enchère : règles par défaut transmises (min_bid, step, block_last_winner, extend_min)');
  check(!p.errs.length, 'enchère : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 6. Enchère sans carte unique disponible (fixture par défaut) : message, pas de formulaire.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await quick(p, 'enchere');
  await waitDlg(p);
  await p.waitForSelector('dialog.qk-dlg[open] .qk-empty', { timeout: 5000 });
  check((await p.textContent('dialog.qk-dlg[open] .qk-empty')).includes('Aucune carte unique disponible'), 'enchère sans carte unique : message et pas de formulaire');
  await p.keyboard.press('Escape');
  await waitClosed(p);
  await p.ctx.close();

  // 7. Lancer un drop : carte C2 brillante, 3 exemplaires, 15 minutes, annonce Discord ; hg-notify card_drop.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await focusTrigger(p);
  notPrevented = await quick(p, 'drop');
  check(notPrevented === false, 'drop : événement annulé');
  await waitDlg(p);
  check((await p.textContent('dialog.qk-dlg[open] .qk-title')) === 'Lancer un drop', 'drop : titre « Lancer un drop »');
  check(await p.isVisible('dialog.qk-dlg[open] a.qk-link[href="/pages/admin/admin.html#fabrique/drops"]'), 'drop : lien vers Fabrique › Drops');
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-card="C2"]', { timeout: 5000 });
  await p.fill('#qk-d-q', 'Ethan');
  check((await p.locator('dialog.qk-dlg[open] [data-vp-card]').count()) === 1, 'drop : recherche filtre les visuels (« Ethan » seulement)');
  await p.fill('#qk-d-q', '');
  await p.click('dialog.qk-dlg[open] [data-vp-card="C2"]');
  await p.fill('#qk-d-qty', '3');
  await p.fill('#qk-d-min', '15');
  await p.click('dialog.qk-dlg[open] input[name="shiny"]');
  check((await p.inputValue('#qk-d-min')) === '15', 'drop : durée saisie 15 minutes');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  check((await p.textContent('dialog.qk-dlg[open] [data-confirm]')).includes('3 exemplaires à attraper pendant 15 min'), 'drop : récapitulatif avec quantité et durée');
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  calls = await rpcCalls(p, 'hg_drop_create');
  check(calls.length === 1, 'drop : hg_drop_create appelée une fois');
  check(calls[0]?.p_card === 'C2' && calls[0]?.p_shiny === true && calls[0]?.p_quantity === 3 && calls[0]?.p_minutes === 15 && calls[0]?.p_announce === true, 'drop : p_card C2, brillante, 3 exemplaires, 15 min, fil coché');
  await p.waitForFunction(() => (window.__LOG || []).some((e) => e[0] === 'fn' && e[1] === 'hg-notify' && e[2]?.event === 'card_drop'), null, { timeout: 5000 }).catch(() => {});
  const nc = await notifyCalls(p, 'card_drop');
  check(nc.length === 1 && typeof nc[0]?.drop_id === 'string' && nc[0].drop_id !== '', 'drop : annonce Discord card_drop avec l\'identifiant du drop');
  check(!p.errs.length, 'drop : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 8. Drop sans annonce Discord, quantité hors bornes refusée, Échap.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await focusTrigger(p);
  await quick(p, 'drop');
  await waitDlg(p);
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-card="C1"]', { timeout: 5000 });
  await p.click('dialog.qk-dlg[open] [data-vp-card="C1"]');
  await p.fill('#qk-d-qty', '0');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] .qk-err:not([hidden])', { timeout: 3000 }).catch(() => {});
  check((await p.textContent('dialog.qk-dlg[open] .qk-err')).includes('Le nombre d\'exemplaires doit être entre 1'), 'drop : quantité 0 refusée avant l\'envoi');
  check((await rpcCalls(p, 'hg_drop_create')).length === 0, 'drop : aucun appel pour une quantité invalide');
  await p.fill('#qk-d-qty', '1');
  await p.click('dialog.qk-dlg[open] input[name="discord"]'); // décochée
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  check((await rpcCalls(p, 'hg_drop_create')).length === 1, 'drop sans Discord : drop lancé');
  check((await notifyCalls(p, 'card_drop')).length === 0, 'drop sans Discord : aucune annonce card_drop');
  await p.ctx.close();

  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await focusTrigger(p);
  await quick(p, 'drop');
  await waitDlg(p);
  await p.keyboard.press('Escape');
  await waitClosed(p);
  check((await p.evaluate(() => document.activeElement?.id)) === 'qk-test', 'drop : Échap ferme et rend le focus');
  await p.ctx.close();

  // 9. Sans la permission « cartes » : pas de preventDefault (la navigation de repli s'applique), pas de fenêtre.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: { myPerms: { is_admin: false, perms: ['membres'] } } });
  for (const action of ['give', 'enchere', 'drop']) {
    const np = await quick(p, action);
    check(np === true, `sans permission « cartes » : ${action} n'est pas annulé (repli)`);
  }
  check((await p.$$('dialog.qk-dlg')).length === 0, 'sans permission : aucune fenêtre ouverte');
  check((await rpcCalls(p, 'hg_cards_admin_bulk_give')).length === 0 && (await rpcCalls(p, 'hg_drop_create')).length === 0, 'sans permission : aucun appel de RPC');
  const np2 = await quick(p, 'inconnue');
  check(np2 === true, 'action inconnue : ignorée');
  await p.ctx.close();

  // 10. 390 px : pas de défilement horizontal de la page, fenêtre dans l'écran, sur les trois fenêtres.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 390, height: 844, mobile: true, dpr: 2, scenario: { uniques: true } });
  for (const action of ['give', 'enchere', 'drop']) {
    await quick(p, action);
    await waitDlg(p);
    await sleep(300);
    const r = await p.evaluate(() => {
      const d = document.querySelector('dialog.qk-dlg[open]');
      const b = d.getBoundingClientRect();
      return { w: innerWidth, left: b.left, right: b.right, dlgOverflow: d.scrollWidth - d.clientWidth };
    });
    check(r.left >= 0 && r.right <= r.w, `390 px ${action} : la fenêtre tient dans l'écran (${Math.round(r.left)}–${Math.round(r.right)})`);
    check(r.dlgOverflow <= 0, `390 px ${action} : pas de défilement horizontal dans la fenêtre`);
    check((await hscroll(p)) === 0, `390 px ${action} : pas de défilement horizontal de la page`);
    await p.keyboard.press('Escape');
    await waitClosed(p);
  }
  check(!p.errs.length, '390 px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 11. Aucune erreur JavaScript sur un parcours complet à 1280 px (ouvrir, fermer, ouvrir les trois).
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: { uniques: true } });
  for (const action of ['give', 'enchere', 'drop']) {
    await quick(p, action);
    await waitDlg(p);
    await p.keyboard.press('Escape');
    await waitClosed(p);
  }
  check(!p.errs.length, 'parcours complet : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 12. Sélecteurs visuels : cartes et boosters se choisissent sur leurs visuels (Give), restants, brillance, filtres,
  //     « Voir plus », clavier, boosters passés, drop (carte unique attribuée non proposable), aperçus dans les récapitulatifs.
  const VISU = { uniques: true, uniqueTaken: true, cardImages: true, bigCards: 80, boostersPast: true };
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: VISU });
  await quick(p, 'give');
  await waitDlg(p);
  await p.click('dialog.qk-dlg[open] [data-kind="carte"]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-card="C2"]', { timeout: 5000 });
  check((await p.locator('dialog.qk-dlg[open] .qk-card .hgc-win-img').count()) > 0, 'visuels : les cartes avec image affichent leur image');
  check((await p.textContent('dialog.qk-dlg[open] .vp-tile:has([data-vp-card="C11"]) .vp-cap')).includes('2 restants'), 'visuels : carte à exemplaires limités (C11) : « 2 restants »');
  check(await p.isHidden('dialog.qk-dlg[open] .vp-shiny'), 'brillante : case masquée tant qu\'aucune carte n\'est choisie');
  await p.click('dialog.qk-dlg[open] [data-vp-card="C1"]');
  check(await p.isHidden('dialog.qk-dlg[open] .vp-shiny'), 'brillante : C1 (non brillante) → case masquée');
  await p.click('dialog.qk-dlg[open] [data-vp-card="C2"]');
  check(await p.isVisible('dialog.qk-dlg[open] .vp-shiny'), 'brillante : C2 (brillante possible) → case visible');
  check((await p.textContent('dialog.qk-dlg[open] .vp-sum')).includes('La Fontaine'), 'choix : « Carte choisie : La Fontaine » sous la grille');
  check(await p.getAttribute('dialog.qk-dlg[open] [data-vp-card="C2"]', 'aria-pressed') === 'true', 'choix : la carte choisie est marquée (aria-pressed)');
  // Filtres : recherche, série, rareté
  await p.fill('#qk-gc-q', 'fontaine');
  check((await p.locator('dialog.qk-dlg[open] [data-vp-card]').count()) === 1, 'filtre recherche « fontaine » : une seule carte');
  await p.fill('#qk-gc-q', '');
  await p.selectOption('#qk-gc-set', 'SET2');
  check((await p.$$eval('dialog.qk-dlg[open] [data-vp-card]', (b) => b.map((x) => x.dataset.vpCard).join(','))) === 'C13', 'filtre série « Saison 2 » : C13 seule');
  await p.selectOption('#qk-gc-set', '');
  await p.selectOption('#qk-gc-rar', 'identite');
  check((await p.$$eval('dialog.qk-dlg[open] [data-vp-card]', (b) => b.map((x) => x.dataset.vpCard).join(','))) === 'C11', 'filtre rareté « Identité » : C11 seule');
  await p.selectOption('#qk-gc-rar', '');
  // Pagination : 60 au départ, puis le reste
  check((await p.locator('dialog.qk-dlg[open] [data-vp-card]').count()) === 60, 'Voir plus : 60 cartes au départ');
  check(await p.isVisible('dialog.qk-dlg[open] #qk-gc-plus'), 'Voir plus : bouton visible');
  await p.click('dialog.qk-dlg[open] #qk-gc-plus');
  check((await p.locator('dialog.qk-dlg[open] [data-vp-card]').count()) === 94, 'Voir plus : les 94 cartes après un clic');
  check(await p.isHidden('dialog.qk-dlg[open] #qk-gc-plus'), 'Voir plus : bouton masqué une fois tout affiché');
  // Clavier : flèche droite, puis Entrée choisit
  await p.focus('dialog.qk-dlg[open] [data-vp-card="C1"]');
  await p.keyboard.press('ArrowRight');
  check((await p.evaluate(() => document.activeElement?.dataset?.vpCard)) === 'C2', 'clavier : flèche droite passe à la carte suivante');
  await p.keyboard.press('Enter');
  check(await p.getAttribute('dialog.qk-dlg[open] [data-vp-card="C2"]', 'aria-pressed') === 'true', 'clavier : Entrée choisit la carte');
  // Boosters : groupe des passés, description au focus, choix d'un booster passé, récapitulatif avec visuel
  await p.click('dialog.qk-dlg[open] [data-kind="boosters"]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-type="dore"]', { timeout: 5000 });
  check((await p.textContent('dialog.qk-dlg[open] [data-vp-type="dore"] .vp-type-s')).includes('5 cartes'), 'boosters : « 5 cartes » sur la cartouche');
  check(await p.isVisible('dialog.qk-dlg[open] .vp-grid-past [data-vp-type="noel2025"]'), 'boosters : le booster passé est listé à part');
  await p.focus('dialog.qk-dlg[open] [data-vp-type="noel2025"]');
  check(await p.isVisible('dialog.qk-dlg[open] [data-vp-type="noel2025"] .vp-desc'), 'boosters : description visible au focus');
  check(await p.getAttribute('dialog.qk-dlg[open] [data-vp-type="classique"]', 'aria-pressed') === 'true', 'boosters : « classique » choisi par défaut');
  await p.click('dialog.qk-dlg[open] [data-vp-type="noel2025"]');
  check(await p.getAttribute('dialog.qk-dlg[open] [data-vp-type="noel2025"]', 'aria-pressed') === 'true', 'boosters : le booster passé se choisit');
  check((await p.textContent('dialog.qk-dlg[open] .vp-boost .vp-sum')).includes('Noël 2025'), 'boosters : « Booster choisi : Noël 2025 » sous les cartouches');
  await p.fill('#qk-g-amt', '2');
  await p.click(`dialog.qk-dlg[open] .qk-chip[data-id="${BRUNO}"]`);
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  check((await p.textContent('dialog.qk-dlg[open] [data-confirm]')).includes('1 membre recevra 2 boosters Noël 2025'), 'boosters : récapitulatif « 2 boosters Noël 2025 »');
  check((await p.locator('dialog.qk-dlg[open] [data-confirm-visual] .cart-box.cart--theme-noel').count()) === 1, 'boosters : la confirmation montre la cartouche du booster');
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  calls = await rpcCalls(p, 'hg_cards_admin_bulk_give');
  check(calls.length === 1 && calls[0]?.p_booster === 'noel2025' && calls[0]?.p_amount === 2 && JSON.stringify(calls[0]?.p_users) === JSON.stringify([BRUNO]), 'boosters : p_booster = noel2025, 2 boosters, Bruno seul');
  check(!p.errs.length, 'visuels give : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 13. Lancer un drop : carte unique attribuée non proposable, brillance, aperçu dans la confirmation.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900, scenario: VISU });
  await quick(p, 'drop');
  await waitDlg(p);
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-card="C2"]', { timeout: 5000 });
  for (let i = 0; i < 5 && await p.isVisible('dialog.qk-dlg[open] #qk-d-plus'); i++) await p.click('dialog.qk-dlg[open] #qk-d-plus');
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-card="C14"]', { timeout: 5000 });
  check(await p.getAttribute('dialog.qk-dlg[open] [data-vp-card="C14"]', 'disabled') !== null, 'drop : carte unique déjà attribuée (C14) non proposable');
  check((await p.textContent('dialog.qk-dlg[open] .vp-tile:has([data-vp-card="C14"]) .vp-cap')).includes('Déjà attribuée'), 'drop : « Déjà attribuée » sous C14');
  await p.click('dialog.qk-dlg[open] [data-vp-card="C14"]', { force: true }).catch(() => {});
  check(await p.getAttribute('dialog.qk-dlg[open] [data-vp-card="C14"]', 'aria-pressed') === 'false', 'drop : cliquer sur C14 ne la choisit pas');
  await p.click('dialog.qk-dlg[open] [data-vp-card="C2"]');
  await p.click('dialog.qk-dlg[open] label:has(input[name="shiny"])');
  await p.fill('#qk-d-qty', '2');
  await p.click('dialog.qk-dlg[open] [data-qk-submit]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-qk-confirm]', { timeout: 3000 });
  check((await p.locator('dialog.qk-dlg[open] [data-confirm-visual] .hgc').count()) === 1, 'drop : la confirmation montre le visuel de la carte');
  check((await p.textContent('dialog.qk-dlg[open] [data-confirm]')).includes('(brillante)'), 'drop : confirmation « (brillante) »');
  await p.click('dialog.qk-dlg[open] [data-qk-confirm]');
  await waitClosed(p);
  calls = await rpcCalls(p, 'hg_drop_create');
  check(calls.length === 1 && calls[0]?.p_card === 'C2' && calls[0]?.p_shiny === true && calls[0]?.p_quantity === 2, 'drop : hg_drop_create avec C2, brillante, 2 exemplaires');
  check(!p.errs.length, 'drop visuels : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 14. 390 px : grilles de 2 à 3 colonnes, pas de défilement horizontal (page ni fenêtre), boosters et cartes.
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 390, height: 844, mobile: true, dpr: 2, scenario: VISU });
  await quick(p, 'give');
  await waitDlg(p);
  await p.click('dialog.qk-dlg[open] [data-kind="carte"]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-card="C2"]', { timeout: 5000 });
  const colonnes = (id) => p.evaluate((sel) => { const g = document.querySelector(sel); return g ? getComputedStyle(g).gridTemplateColumns.split(' ').filter(Boolean).length : 0; }, id);
  const cc = await colonnes('dialog.qk-dlg[open] #qk-gc-grid');
  check(cc >= 2 && cc <= 3, `390 px : grille de cartes en ${cc} colonnes`);
  check((await hscroll(p)) === 0, '390 px : pas de défilement horizontal de la page (cartes)');
  check((await p.evaluate(() => { const d = document.querySelector('dialog.qk-dlg[open]'); return d.scrollWidth - d.clientWidth; })) <= 0, '390 px : pas de défilement horizontal dans la fenêtre (cartes)');
  await p.click('dialog.qk-dlg[open] [data-kind="boosters"]');
  await p.waitForSelector('dialog.qk-dlg[open] [data-vp-type="dore"]', { timeout: 5000 });
  const bc = await colonnes('dialog.qk-dlg[open] #qk-gb-grid');
  check(bc >= 2 && bc <= 3, `390 px : grille de boosters en ${bc} colonnes`);
  check((await hscroll(p)) === 0, '390 px : pas de défilement horizontal de la page (boosters)');
  check((await p.evaluate(() => { const d = document.querySelector('dialog.qk-dlg[open]'); return d.scrollWidth - d.clientWidth; })) <= 0, '390 px : pas de défilement horizontal dans la fenêtre (boosters)');
  check(!p.errs.length, '390 px visuels : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
