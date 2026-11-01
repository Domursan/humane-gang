// Parcours : drops de cartes (une carte à attraper, les X premiers qui cliquent la gagnent).
// Admin (/pages/admin/admin.html › Jeu de cartes › Drops) : lancer un drop (RPC hg_drop_create avec bornes), voir la liste, l'arrêter.
// Membre (toutes les pages) : la carte traverse la page (card-drops.js, trajectoires de dyn-events.js), revient à
// intervalles, clic pendant le vol → hg_drop_claim → révélation (dans le coin) ; plus de vol après le gain ; « trop
// tard » si l'exemplaire est parti ; masquage ; pas de carte pour un visiteur ; 390 px sans défilement ; mouvement réduit
// (carte fixe dans le coin, aucun vol).
// Une carte en vol est cliquée après pause de son animation (figée à l'endroit où elle est) : le clic est réel.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (scenario.drops, scenario.dropLate, scenario.guest).
// Lancer : node tests/parcours/compte/parcours-drops.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const ME = '11111111-1111-4111-8111-111111111111';
const CARD = 'C2'; // « La Fontaine », commune, brillante possible
/** Date ISO décalée de ms millisecondes. */
const iso = (ms) => new Date(Date.now() + ms).toISOString();
/** Drop de test : une carte à attraper, valable une heure ; les champs de over remplacent les valeurs par défaut. */
const drop = (over = {}) => ({ id: 'dr-1', card_id: CARD, shiny: false, quantity: 1, starts_at: iso(-60e3), ends_at: iso(3600e3),
  announce: true, created_by: ME, ...over });
/** Arguments des appels de la RPC fn dans le journal du faux client. */
const rpcCalls = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn).map((e) => e[2]);
/** Attend qu'une carte soit en vol (ou que le délai timeout expire). */
// Attend qu'une carte soit en vol, fige son trajet à mi-parcours (là où elle est à l'écran) : le clic suivant vise sa position réelle.
const waitFlying = (p, timeout = 15000) => p.waitForSelector('.cd-item.is-flying', { state: 'attached', timeout }).catch(() => {});
/** Met en pause la carte en vol à mi-parcours, pour que le clic suivant vise sa position réelle. */
const freeze = (p) => p.evaluate(() => {
  document.querySelector('.cd-item.is-flying')?.getAnimations().forEach((a) => { a.currentTime = a.effect.getTiming().duration / 2; a.pause(); });
});
/** Position (gauche, haut) de la carte en vol, ou null s'il n'y en a pas. */
const flyingBox = (p) => p.$eval('.cd-item.is-flying', (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; }).catch(() => null);

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  /* ---------- Admin ---------- */
  let p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await adminSection(p, 'fabrique/drops');
  await p.waitForSelector('[data-action="drop-new"]', { timeout: 8000 });
  check((await p.textContent('#drop-list')).includes('Aucun drop'), 'admin : liste vide au départ');

  // Quantité hors bornes : le formulaire refuse, aucun appel
  await p.click('[data-action="drop-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] [data-vp-card="C2"]', { timeout: 5000 });
  await p.fill('#drop-q', 'Fontaine');
  check(await p.locator('dialog.ui-drawer[open] [data-vp-card]').count() === 1, 'admin : recherche « Fontaine » réduit les visuels à 1 carte');
  await p.click('dialog.ui-drawer[open] [data-vp-card="C2"]');
  await p.fill('#drop-qty', '60');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await sleep(300);
  check((await rpcCalls(p, 'hg_drop_create')).length === 0, 'admin : 60 exemplaires refusés côté formulaire (aucun appel)');
  await p.fill('#drop-qty', '3');
  await p.fill('#drop-min', '20');
  await p.click('dialog.ui-drawer[open] label:has(input[name="shiny"])');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
  await sleep(300);
  const created = await rpcCalls(p, 'hg_drop_create');
  check(created.length === 1, 'admin : un seul appel hg_drop_create');
  check(created[0]?.p_card === CARD && created[0]?.p_shiny === true && created[0]?.p_quantity === 3 && created[0]?.p_minutes === 20 && created[0]?.p_announce === true,
    'admin : carte, brillante, 3 exemplaires, 20 minutes, annonce');
  const annonces = await p.evaluate(() => (window.__LOG || []).filter((e) => e[0] === 'fn' && e[1] === 'hg-notify' && e[2]?.event === 'card_drop').map((e) => e[2]));
  check(annonces.length === 1 && /^d0000000-/.test(annonces[0]?.drop_id || ''), 'admin : annonce Discord demandée (hg-notify card_drop avec l\'identifiant du drop)');
  check((await p.textContent('#drop-list')).includes('En cours'), 'admin : le drop apparaît comme en cours');
  check((await p.textContent('#drop-list')).includes('La Fontaine'), 'admin : nom de la carte dans la liste');
  check((await p.textContent('#drop-list')).includes('0 / 3'), 'admin : 0 / 3 attrapés au lancement');

  // Arrêter : confirmation, puis RPC et statut Terminé
  await p.click('[data-action="drop-stop"]');
  await p.waitForSelector('dialog.hg-dialog[open] .btn-danger', { timeout: 5000 });
  await p.click('dialog.hg-dialog[open] .btn-danger');
  await sleep(400);
  const stops = await rpcCalls(p, 'hg_drop_stop');
  check(stops.length === 1 && typeof stops[0]?.p_drop === 'string', 'admin : arrêt → hg_drop_stop appelée une fois');
  check((await p.textContent('#drop-list')).includes('Terminé'), 'admin : le drop arrêté est Terminé');
  // Drop sans annonce Discord : la case décochée, aucun appel de hg-notify
  await p.click('[data-action="drop-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] [data-vp-card="C2"]', { timeout: 5000 });
  await p.click('dialog.ui-drawer[open] [data-vp-card="C2"]');
  await p.fill('#drop-qty', '1');
  await p.click('dialog.ui-drawer[open] label:has(#drop-discord)');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
  await sleep(300);
  check((await rpcCalls(p, 'hg_drop_create')).length === 2, 'admin : second drop lancé');
  check((await p.evaluate(() => (window.__LOG || []).filter((e) => e[0] === 'fn' && e[2]?.event === 'card_drop').length)) === 1, 'admin : « Annoncer sur Discord » décoché → pas d\'annonce');
  check(!p.errs.length, 'admin : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- Membre : la carte apparaît, clic = gain ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { drops: [drop()] } });
  await waitFlying(p);
  const claimBtn = await p.$('.cd-item.is-flying [data-cd-claim]');
  check(!!claimBtn, 'membre : la carte du drop vole sur la page');
  if (claimBtn) {
    const label = await claimBtn.getAttribute('aria-label');
    check(label.includes('La Fontaine'), 'membre : la carte est nommée (bouton accessible)');
    check((await p.textContent('.cd-hint')).includes('Dernier exemplaire'), 'membre : « Dernier exemplaire ! » affiché');
    await freeze(p);
    await p.click('.cd-item.is-flying [data-cd-claim]'); // clic réel pendant le trajet (animation figée)
    await p.waitForSelector('.cd-reveal', { timeout: 5000 }).catch(() => {});
    check((await p.textContent('.cd-reveal-t')).includes('Tu as attrapé « La Fontaine » !'), 'membre : révélation de la carte gagnée');
    const claims = await rpcCalls(p, 'hg_drop_claim');
    check(claims.length === 1 && claims[0]?.p_drop === 'dr-1', 'membre : un seul appel hg_drop_claim pour le bon drop');
    check(await p.$('.cd-item [data-cd-claim]') === null, 'membre : plus de carte à attraper après le gain');
    // Après le gain, la carte ne revient plus (le passage suivant est annulé) : on attend plus que l'intervalle maximal.
    await sleep(17000);
    check(await p.$('.cd-item.is-fly') === null && await p.$('.cd-item.is-flying') === null, 'membre : après le gain, la carte ne vole plus');
    check((await rpcCalls(p, 'hg_drop_claim')).length === 1, 'membre : toujours un seul gain après le passage suivant');
  }
  check(!p.errs.length, 'membre : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- Membre : trop tard (l'exemplaire est parti entre-temps) ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900,
    scenario: { drops: [drop({ quantity: 2 })], dropLate: true } });
  await waitFlying(p);
  await freeze(p);
  await p.click('.cd-item.is-flying [data-cd-claim]');
  await p.waitForSelector('.cd-item [data-cd-claim]', { state: 'detached', timeout: 5000 }).catch(() => {});
  check(await p.$('.cd-item [data-cd-claim]') === null, 'trop tard : la carte disparaît');
  check((await p.textContent('.toasts')).includes('Trop tard, tous les exemplaires sont partis !'), 'trop tard : message clair affiché');
  check(await p.$('.cd-reveal') === null, 'trop tard : aucune révélation');
  await sleep(1500);
  check(await p.$('.cd-item [data-cd-claim]') === null, 'trop tard : la carte ne revient pas à la mise à jour suivante');
  check(!p.errs.length, 'trop tard : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- Membre : masquer la carte sur la page ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { drops: [drop()] } });
  await waitFlying(p);
  await freeze(p);
  await p.click('.cd-item.is-flying [data-cd-hide]');
  await sleep(300);
  check(await p.$('.cd-item') === null, 'masquer : la carte disparaît de la page');
  check((await rpcCalls(p, 'hg_drop_claim')).length === 0, 'masquer : aucun gain enregistré');
  await p.ctx.close();

  /* ---------- Visiteur : aucune carte, aucun appel ---------- */
  p = await openPage(browser, { page: 'index', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { guest: true, drops: [drop()] } });
  await sleep(2000);
  check(await p.$('.cd-item') === null, 'visiteur : aucune carte de drop');
  check((await rpcCalls(p, 'hg_drops_active')).length === 0, 'visiteur : hg_drops_active jamais appelée');
  await p.ctx.close();

  /* ---------- Mouvement : la carte traverse la page, se pose, revient ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { drops: [drop({ quantity: 5 })] } });
  await waitFlying(p);
  check(await p.$('.cd-item.is-flying') !== null, 'mouvement : la carte vole sur la page');
  const a = await flyingBox(p);
  await sleep(500);
  const b = await flyingBox(p);
  check(!!a && !!b && Math.hypot(b[0] - a[0], b[1] - a[1]) > 10, 'mouvement : la carte change de place pendant son trajet');
  check((await p.textContent('.cd-hint')).includes('5 exemplaires restants'), 'mouvement : « X exemplaires restants » affiché pendant le vol');
  await p.waitForSelector('.cd-item.is-flying', { state: 'detached', timeout: 15000 }).catch(() => {});
  check(await p.$('.cd-item.is-flying') === null, 'mouvement : la carte se pose à la fin de son trajet');
  check(await p.$eval('.cd-item', (el) => getComputedStyle(el).display === 'none').catch(() => false), 'mouvement : au repos, la carte est masquée');
  await waitFlying(p, 25000); // intervalle maximal entre deux passages : 16 s
  check(await p.$('.cd-item.is-flying') !== null, 'mouvement : la carte revient à un nouveau passage');
  check(await hscroll(p) <= 0, 'mouvement : pas de défilement horizontal pendant le vol');
  check(!p.errs.length, 'mouvement : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- Carte et image d'événement : jamais en vol en même temps ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { drops: [drop({ quantity: 9 })] } });
  await p.evaluate(() => {
    window.__both = 0; window.__dyn = 0;
    setInterval(() => {
      const c = !!document.querySelector('.cd-item.is-flying'), d = !!document.querySelector('.dyn-fly');
      if (c && d) window.__both++;
      if (d) window.__dyn++;
    }, 100);
  });
  await sleep(45000);
  const both = await p.evaluate(() => window.__both), dyn = await p.evaluate(() => window.__dyn);
  check(dyn > 0, 'cohabitation : une image d\'événement apparaît pendant la fenêtre de test');
  check(both === 0, 'cohabitation : la carte et l\'image ne volent jamais en même temps' + (both ? ` (${both} relevés)` : ''));
  check(!p.errs.length, 'cohabitation : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- Mobile 390 px et mouvement réduit : pas de défilement, carte immobile ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844, reducedMotion: 'reduce',
    scenario: { drops: [drop()] } });
  await p.waitForSelector('.cd-item [data-cd-claim]', { state: 'attached', timeout: 8000 }).catch(() => {});
  check(await hscroll(p) <= 0, '390 px : pas de défilement horizontal');
  const box = await p.$eval('.cd-item [data-cd-claim]', (el) => { const r = el.getBoundingClientRect(); return { right: r.right, left: r.left, w: innerWidth }; }).catch(() => null);
  check(!!box && box.left >= 0 && box.right <= box.w, '390 px : la carte tient dans l\'écran');
  check((await p.$eval('.cd-item', (el) => el.className).catch(() => '')).includes('is-still'), 'mouvement réduit : la carte ne flotte pas');
  const r1 = await p.$eval('.cd-item', (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; }).catch(() => null);
  await sleep(2000);
  const r2 = await p.$eval('.cd-item', (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; }).catch(() => null);
  check(!!r1 && !!r2 && r1[0] === r2[0] && r1[1] === r2[1], 'mouvement réduit : la carte reste à la même place (coin)');
  check(await p.$('.cd-item.is-fly') === null && await p.$('.cd-item.is-flying') === null, 'mouvement réduit : aucun vol');
  check(!p.errs.length, '390 px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
