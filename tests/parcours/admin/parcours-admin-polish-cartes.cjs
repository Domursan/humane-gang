// Parcours : finition du Jeu de cartes et des Défis du gang dans le panel admin (/pages/admin/admin.html), sur le faux Supabase cartes.
// Couvre : séries en grille (interrupteur Active / Masquée, Modifier, création dans le tiroir, annulation),
// éditeur de carte en tiroir large, quêtes et défis en tiroir (ouvrir, annuler, valider), joueurs en liste + détail
// (adresse #fabrique/joueurs/<id>, donner / retirer des Paillettes, donner une carte), aucune erreur console,
// mobile 390 px sans défilement horizontal et tiroir pleine largeur. Captures dans scratchpad/qa/polish-cartes/.
// Les contrôles portent sur l'état du faux (window.__DB) et sur les appels reçus (window.__LOG).
// Lancer : node tests/parcours/admin/parcours-admin-polish-cartes.cjs
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, adminSection, hscroll, chromium } = require('../../lib/harness.cjs');

const QA = '/tmp/claude-0/-home-claude/745c1954-a6f8-5445-b8b6-c526f6aef9c2/scratchpad/qa/polish-cartes';
fs.mkdirSync(QA, { recursive: true });
const ALICE = '00000002-0000-4000-8000-000000000002';
/** Tiroir de dialogue ouvert (dialog.ui-drawer[open]). */
const drawer = (p) => p.locator('dialog.ui-drawer[open]');
/** Titre du tiroir ouvert. */
const drawerTitle = (p) => p.textContent('dialog.ui-drawer[open] .ui-drawer-title');
/** Clique sur le bouton Fermer du tiroir ouvert. */
const closeDrawer = (p) => p.click('dialog.ui-drawer[open] .ui-drawer-foot [data-drawer-close]');
/** Clique sur le bouton de validation du tiroir ouvert. */
const submitDrawer = (p) => p.click('dialog.ui-drawer[open] [data-drawer-submit]');
/** Attend que le tiroir soit fermé (retiré de la page). */
const waitClosed = (p) => p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
/** Exécute fn dans la page avec arg et renvoie son résultat (lecture de la base simulée). */
const db = (p, fn, arg) => p.evaluate(fn, arg);
/** Appels de la RPC fn dans le journal du faux client. */
const calls = (p, fn) => p.evaluate((f) => (window.__LOG || []).filter((x) => x[0] === 'rpc' && x[1] === f), fn);

(async () => {
  const browser = await chromium.launch();

  /* ---------- Bureau 1440 px ---------- */
  let p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1440, height: 900 });
  await adminSection(p, 'fabrique/series');
  await p.waitForSelector('#acd-sets-list .acd-setcard', { timeout: 8000 });
  check(await p.locator('#acd-sets-list .acd-setcard').count() > 0, 'séries : affichées en grille de cartes');
  check(await p.locator('#acd-set-form').count() === 0, 'séries : aucun formulaire déplié dans la page');
  check(await p.locator('.acd-setcard [role="switch"]').first().getAttribute('aria-checked') !== null, 'séries : interrupteur Active / Masquée présent');

  await p.click('[data-act="set-new"]');
  await p.waitForSelector('dialog.ui-drawer[open]', { timeout: 5000 });
  check(await drawerTitle(p) === 'Nouvelle série', 'séries : « Nouvelle série » s\'ouvre dans le tiroir');
  await p.fill('#acs-code', 'annule-moi');
  await closeDrawer(p);
  await waitClosed(p);
  check(await db(p, () => window.__DB.hg_card_sets.some((s) => s.code === 'annule-moi')) === false, 'séries : « Annuler » ferme le tiroir sans créer');

  await p.click('[data-act="set-new"]');
  await p.waitForSelector('dialog.ui-drawer[open]', { timeout: 5000 });
  await p.fill('#acs-code', 'test-serie');
  await p.fill('#acs-name', 'Série de test');
  await submitDrawer(p);
  await waitClosed(p);
  const created = await db(p, () => window.__DB.hg_card_sets.find((s) => s.code === 'test-serie'));
  check(!!created && created.name === 'Série de test' && created.active === true, 'séries : création depuis le tiroir (active par défaut)');
  await p.waitForSelector(`[data-act="set-toggle"][data-id="${created.id}"]`, { timeout: 5000 });

  await p.click(`[data-act="set-toggle"][data-id="${created.id}"]`);
  await p.waitForTimeout(400);
  check(await db(p, (id) => window.__DB.hg_card_sets.find((s) => s.id === id).active, created.id) === false, 'séries : interrupteur écrit « masquée » en base');
  check(await p.getAttribute(`[data-act="set-toggle"][data-id="${created.id}"]`, 'aria-checked') === 'false', 'séries : interrupteur indique Masquée');

  await p.click(`[data-act="set-edit"][data-id="${created.id}"]`);
  await p.waitForSelector('dialog.ui-drawer[open]', { timeout: 5000 });
  check((await drawerTitle(p)).startsWith('Modifier'), 'séries : « Modifier » ouvre le tiroir pré-rempli');
  check(await p.inputValue('#acs-name') === 'Série de test', 'séries : formulaire pré-rempli avec le nom');
  await closeDrawer(p);
  await waitClosed(p);

  /* Éditeur de carte : tiroir large */
  await adminSection(p, 'fabrique/cartes');
  await p.waitForSelector('[data-act="card-new"]', { timeout: 5000 });
  check(await p.locator('#acc-name').count() === 0, 'cartes : éditeur fermé au chargement');
  await p.click('[data-act="card-new"]');
  await p.waitForSelector('dialog.ui-drawer.is-wide[open]', { timeout: 5000 });
  check(await p.isVisible('#acc-card-preview'), 'cartes : éditeur ouvert en tiroir large, aperçu visible');
  await closeDrawer(p);
  await waitClosed(p);

  /* Quêtes */
  await adminSection(p, 'fabrique/quetes');
  await p.waitForSelector('#acd-panel .acd-item', { timeout: 5000 });
  await p.click('[data-act="quest-new"]');
  await p.waitForSelector('dialog.ui-drawer[open]', { timeout: 5000 });
  check(await drawerTitle(p) === 'Nouvelle quête', 'quêtes : formulaire dans le tiroir');
  await closeDrawer(p);
  await waitClosed(p);
  check(await p.locator('#acd-panel .acd-item').count() === 2, 'quêtes : liste intacte après annulation');

  /* Défis du gang */
  await adminSection(p, 'fabrique/defis');
  await p.waitForSelector('#challenges-root [data-action="adc-edit"]', { timeout: 5000 });
  check(await p.locator('#adc-title').count() === 0, 'défis : aucun formulaire déplié au chargement');
  await p.click('#challenges-root [data-action="adc-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adc-title', { timeout: 5000 });
  check(await drawerTitle(p) === 'Nouveau défi', 'défis : « Nouveau défi » ouvre le tiroir');
  await p.fill('#adc-title', 'Dix photos ce mois');
  await p.selectOption('#adc-metric', 'photos_ajoutees');
  await p.fill('#adc-target', '10');
  await p.fill('#adc-reward', '40');
  await submitDrawer(p);
  await waitClosed(p);
  const ch = await db(p, () => window.__DB.hg_challenges.find((c) => c.title === 'Dix photos ce mois'));
  check(!!ch && ch.target === 10 && ch.reward === 40, 'défis : création depuis le tiroir');
  await p.click('#challenges-root [data-action="adc-edit"] >> nth=0');
  await p.waitForSelector('dialog.ui-drawer[open] #adc-title', { timeout: 5000 });
  check(await p.inputValue('#adc-title') !== '', 'défis : « Modifier » pré-remplit le tiroir');
  await closeDrawer(p);
  await waitClosed(p);

  /* Joueurs : liste (colonne 2) + détail */
  await adminSection(p, 'fabrique/joueurs');
  await p.waitForSelector('#shell-col-list .ui-row', { timeout: 8000 });
  check(await p.isVisible('.acd-pl-empty'), 'joueurs : aucun membre choisi, invitation affichée');
  await p.click(`#shell-col-list [data-id="${ALICE}"]`);
  await p.waitForFunction((id) => location.hash === '#fabrique/joueurs/' + id, ALICE, { timeout: 5000 }).catch(() => {});
  check(await p.evaluate(() => location.hash) === '#fabrique/joueurs/' + ALICE, 'joueurs : choisir un membre change l\'adresse');
  await p.waitForSelector('#acd-pl-h', { timeout: 5000 });
  check((await p.textContent('#acd-pl-h')).includes('Alice'), 'joueurs : détail d\'Alice affiché');
  check(await p.locator('[data-act="pay-open"]').count() === 2 && await p.locator('[data-act="give-open"]').count() === 1, 'joueurs : actions Paillettes et carte présentes');

  await p.click('[data-act="pay-open"][data-sign="1"]');
  await p.waitForSelector('dialog.ui-drawer[open] #acd-pay-amount', { timeout: 5000 });
  check(await drawerTitle(p) === 'Donner des Paillettes', 'joueurs : « Donner des Paillettes » ouvre le tiroir');
  await p.fill('#acd-pay-amount', '50');
  await p.fill('#acd-pay-reason', 'Test');
  await submitDrawer(p);
  await waitClosed(p);
  const pay = await calls(p, 'hg_cards_admin_paillettes');
  check(pay.length === 1 && pay[0][2].p_user === ALICE && pay[0][2].p_delta === 50, 'joueurs : Paillettes données à Alice (appel RPC attendu)');

  await p.click('[data-act="pay-open"][data-sign="-1"]');
  await p.waitForSelector('dialog.ui-drawer[open] #acd-pay-amount', { timeout: 5000 });
  check(await drawerTitle(p) === 'Retirer des Paillettes', 'joueurs : « Retirer des Paillettes » ouvre le tiroir');
  await closeDrawer(p);
  await waitClosed(p);

  await p.click('[data-act="give-open"]');
  await p.waitForSelector('dialog.ui-drawer[open] [data-vp-card="C1"]', { timeout: 5000 });
  check(await drawerTitle(p) === 'Give', 'joueurs : « Give » ouvre le tiroir');
  await p.click('dialog.ui-drawer[open] [data-vp-card="C1"]');
  await submitDrawer(p);
  await p.click('dialog.gv-confirm [data-gv-ok]');
  await waitClosed(p);
  check((await calls(p, 'hg_cards_admin_give_panier')).length === 1, 'joueurs : carte donnée (appel RPC attendu)');

  check(await drawer(p).count() === 0, 'joueurs : aucun tiroir resté ouvert');
  check(p.errs.length === 0, 'bureau : aucune erreur console (' + p.errs.join(' | ') + ')');

  /* Captures : clair puis sombre */
  await p.emulateMedia({ colorScheme: 'light' });
  await adminSection(p, 'fabrique/series');
  await p.waitForSelector('#acd-sets-list .acd-setcard', { timeout: 5000 });
  await p.screenshot({ path: path.join(QA, 'bureau-clair-series.png') });
  await p.emulateMedia({ colorScheme: 'dark' });
  await p.screenshot({ path: path.join(QA, 'bureau-sombre-series.png') });
  await p.click('[data-act="set-new"]');
  await p.waitForSelector('dialog.ui-drawer[open]', { timeout: 5000 });
  await p.waitForTimeout(400); // fin de l'ouverture du tiroir (fondu)
  await p.screenshot({ path: path.join(QA, 'bureau-sombre-tiroir-serie.png') });
  await closeDrawer(p);
  await waitClosed(p);
  await adminSection(p, 'fabrique/joueurs');
  await p.click(`#shell-col-list [data-id="${ALICE}"]`);
  await p.waitForSelector('#acd-pl-h', { timeout: 5000 });
  await p.screenshot({ path: path.join(QA, 'bureau-sombre-joueurs.png') });
  await p.emulateMedia({ colorScheme: 'light' });
  await p.screenshot({ path: path.join(QA, 'bureau-clair-joueurs.png') });
  await p.close();

  /* ---------- Mobile 390 px ---------- */
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844 });
  await adminSection(p, 'fabrique/series');
  await p.waitForSelector('#acd-sets-list .acd-setcard', { timeout: 8000 });
  check(await hscroll(p) <= 0, 'mobile séries : pas de défilement horizontal');
  await p.screenshot({ path: path.join(QA, 'mobile-series.png') });
  await p.click('[data-act="set-new"]');
  await p.waitForSelector('dialog.ui-drawer[open]', { timeout: 5000 });
  const w = await drawer(p).evaluate((d) => d.getBoundingClientRect().width);
  check(w >= 385, `mobile tiroir : pleine largeur (${Math.round(w)} px)`);
  check(await hscroll(p) <= 0, 'mobile tiroir : pas de défilement horizontal');
  await p.waitForTimeout(400); // fin de l'ouverture du tiroir (fondu)
  await p.screenshot({ path: path.join(QA, 'mobile-tiroir-serie.png') });
  await closeDrawer(p);
  await waitClosed(p);
  // Mobile : la liste des membres occupe l'écran tant qu'aucun membre n'est choisi (la section reste rangée)
  await p.evaluate(() => { location.hash = 'cartes/joueurs'; });
  await p.waitForSelector('#shell-col-list .ui-row', { timeout: 8000 });
  check(await hscroll(p) <= 0, 'mobile joueurs : liste sans défilement horizontal');
  await p.screenshot({ path: path.join(QA, 'mobile-joueurs-liste.png') });
  check(p.errs.length === 0, 'mobile : aucune erreur console (' + p.errs.join(' | ') + ')');
  await p.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
