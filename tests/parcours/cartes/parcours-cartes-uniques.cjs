// Parcours : cartes uniques (rareté « unique », hors série, hors boosters, nombre d'exemplaires choisi par l'admin : 1 par défaut).
// Collection (/pages/cartes/cartes.html) : la série « Hors série » a son en-tête explicatif ; la carte unique s'affiche avec son style
// « unique » et « Exemplaire unique », sa mention « Pas encore / Déjà attribuée », pas de bouton recycler ni fabriquer,
// et la rareté n'apparaît pas dans les chances des boosters.
// Admin (/pages/admin/admin.html) : la série « Hors série » est listée ; choisir « Unique » pré-sélectionne la série, verrouille
// l'exemplaire maximum (1 par défaut, modifiable) et décoche la fabrication ; l'enregistrement garde ces valeurs.
// Don et Drop : une carte unique dont tous les exemplaires sont attribués est désactivée dans la liste ; avec 1 exemplaire
// sur 3 attribué, elle reste choisissable. Collection : « n / max exemplaires attribués ».
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénarios uniques (série + carte C14), uniqueTaken (Alice l'a), uniqueOwned (moi).
// Lancer : node tests/parcours/cartes/parcours-cartes-uniques.cjs   (HG_ROOT / HG_PREFIX comme les autres parcours)
const { ROOT, check, finish, openPage, adminSection, hscroll, sleep, chromium } = require('../../lib/harness.cjs');
/** Ouvre un onglet de Cartes par son adresse : les onglets internes sont masqués (nouvel en-tête). */
const goTab = (p, id) => p.evaluate((id) => { if (location.hash === '#' + id) location.hash = ''; location.hash = id; }, id);

const FIXTURE = 'fake-sb-cartes.mjs';
const ALICE = '00000002-0000-4000-8000-000000000002';
const HS = { uniques: true }; // scénario : la série Hors série et la carte unique C14 existent
/** Clique sur le bouton de validation du tiroir ouvert. */
const submitDrawer = (p) => p.click('dialog.ui-drawer[open] [data-drawer-submit]');
/** Attend que le tiroir soit fermé. */
const waitClosed = (p) => p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  // 1. Collection : Hors série, carte unique non possédée, personne ne l'a encore.
  let p = await openPage(browser, { page: 'cartes', fixture: FIXTURE, width: 1280, height: 900, scenario: HS });
  await goTab(p, 'collection');
  await p.waitForSelector('#cartes-set', { timeout: 5000 });
  const series = await p.$$eval('#cartes-set option', (o) => o.map((x) => [x.value, x.textContent]));
  check(series.some(([v, t]) => v === 'SETHS' && t === 'Hors série'), 'sélecteur de série : « Hors série » est listée');
  await p.selectOption('#cartes-set', 'SETHS');
  await p.waitForSelector('.hgc-unique', { timeout: 5000 }).catch(() => {});
  const note = await p.textContent('.cartes-hs-note').catch(() => '');
  check(/Cartes uniques : hors boosters, en nombre limité \(exemplaires numérotés\), à gagner lors d'un événement ou offertes par l'admin\./.test(note), 'Hors série : en-tête explicatif affiché (« ' + note.trim() + ' »)');
  check(await p.$$eval('.hgc-unique', (x) => x.length) === 1, 'la carte unique s\'affiche avec le style « unique »');
  const fam = await p.textContent('.hgc-unique .hgc-fam');
  check(fam.includes('Exemplaire unique'), 'ligne sous l\'image : « Exemplaire unique » (' + fam + ')');
  const label = await p.getAttribute('.hgc-unique', 'aria-label');
  check(/Unique/.test(label) && /pas encore obtenue/.test(label), 'libellé d\'accessibilité : rareté Unique, pas encore obtenue (' + label + ')');
  check((await p.textContent('.cartes-uniq-state')).trim() === 'Pas encore attribuée', 'vignette : « Pas encore attribuée » (personne ne l\'a)');
  const rareOpts = await p.$$eval('#cartes-f-rarity option', (o) => o.map((x) => x.value));
  check(rareOpts.includes('unique'), 'filtre Rareté : l\'option « Unique » existe');
  await p.selectOption('#cartes-f-rarity', 'unique');
  await sleep(150);
  check(await p.$$eval('.cz-cell', (x) => x.length) === 1, 'filtre Rareté « Unique » : seule la carte unique reste');
  await p.selectOption('#cartes-f-rarity', '');
  await sleep(150);
  check(!p.errs.length, 'collection : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));

  // Fiche détail : ni fabriquer, ni recycler ; message clair.
  await p.click('.cz-cell [data-action="open-card"][data-card="C14"]');
  await p.waitForSelector('#cartes-detail[open]', { timeout: 5000 });
  check(await p.$$eval('#cartes-detail [data-action="craft"]', (x) => x.length) === 0, 'fiche : aucun bouton « Fabriquer »');
  check(await p.$$eval('#cartes-detail [data-action="recycle"]', (x) => x.length) === 0, 'fiche : aucun bouton « Recycler »');
  const fiche = await p.textContent('#cartes-detail-info');
  check(/Une carte unique ne se fabrique pas/.test(fiche), 'fiche : message « Une carte unique ne se fabrique pas »');
  check(/Pas encore attribuée/.test(fiche), 'fiche : « Pas encore attribuée » affiché');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);

  // Chances des boosters (onglet Boutique, tableau replié par défaut) : la rareté unique n'y figure pas.
  await goTab(p, 'boutique');
  await sleep(300);
  await p.click('.shop-odds summary');
  await p.waitForSelector('.cartes-odds', { state: 'visible', timeout: 5000 });
  const chances = await p.$$eval('.cartes-odds tbody th', (x) => x.map((e) => e.textContent.trim()));
  check(!chances.some((t) => /unique/i.test(t)) && chances.includes('Mythique'), 'chances des boosters : pas de ligne « Unique » (' + chances.join(', ') + ')');
  await p.ctx.close();

  // 2. Carte unique que je possède : pas de bouton recycler, mention « Ne se recycle pas ».
  p = await openPage(browser, { page: 'cartes', fixture: FIXTURE, width: 1280, height: 900, scenario: { uniques: true, uniqueOwned: true } });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', 'SETHS');
  await p.waitForSelector('.hgc-unique', { timeout: 5000 }).catch(() => {});
  check(await p.$$eval('.hgc-unique', (x) => x.length) === 1 && await p.$$eval('.cartes-uniq-state', (x) => x.length) === 0, 'carte possédée : pas de mention d\'attribution');
  check(await p.$$eval('.hgc-unique .hgc-pied-s', (x) => x[0]?.textContent.trim()) === '1/1', 'carte possédée : numéro d\'exemplaire « 1/1 »');
  await p.click('.cz-cell [data-action="open-card"][data-card="C14"]');
  await p.waitForSelector('#cartes-detail[open]', { timeout: 5000 });
  const copie = await p.textContent('#cartes-detail .cartes-copies');
  check(/Ne se recycle pas/.test(copie) && await p.$$eval('#cartes-detail [data-action="recycle"]', (x) => x.length) === 0, 'mon exemplaire : « Ne se recycle pas », aucun bouton recycler');
  check(await p.$$eval('#cartes-detail [data-action="craft"]', (x) => x.length) === 0, 'mon exemplaire : aucun bouton fabriquer');
  await p.keyboard.press('Escape');
  await p.ctx.close();

  // 3. Un autre membre a déjà l'exemplaire : « Déjà attribuée », et la mise en page tient à 390 px sans défilement.
  p = await openPage(browser, { page: 'cartes', fixture: FIXTURE, width: 390, height: 844, scenario: { uniques: true, uniqueTaken: true } });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', 'SETHS');
  await p.waitForSelector('.cartes-uniq-state', { timeout: 5000 }).catch(() => {});
  check((await p.textContent('.cartes-uniq-state').catch(() => '')).trim() === 'Déjà attribuée', 'vignette : « Déjà attribuée » (Alice l\'a)');
  check(await hscroll(p) === 0, 'mobile 390 px : aucun défilement horizontal');
  check(!p.errs.length, 'mobile : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 4. Animation : le reflet doré ne bouge pas si la préférence « réduire les animations » est active.
  p = await openPage(browser, { page: 'cartes', fixture: FIXTURE, width: 1280, height: 900, reducedMotion: 'reduce', scenario: HS });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', 'SETHS');
  await p.waitForSelector('.hgc-sheen', { timeout: 5000 }).catch(() => {});
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.hgc-sheen') || document.body).animationName);
  check(anim === 'none', 'réduire les animations : le reflet unique est fixe (animation « ' + anim + ' »)');
  await p.ctx.close();

  // 5. Admin : Hors série listée ; choisir « Unique » verrouille la carte ; l'enregistrement garde ces valeurs.
  p = await openPage(browser, { page: 'admin', fixture: FIXTURE, width: 1280, height: 900, scenario: HS });
  await adminSection(p, 'fabrique/series');
  const seriesAdmin = await p.textContent('.acd-setgrid').catch(() => '');
  check(seriesAdmin.includes('Hors série'), 'admin › Séries : « Hors série » est listée');
  await adminSection(p, 'fabrique/cartes');
  await p.waitForSelector('[data-act="card-new"]', { timeout: 5000 });
  await p.click('[data-act="card-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #acc-rarity', { timeout: 5000 });
  check(await p.isHidden('#acc-unique-help'), 'éditeur : aide « Unique » masquée tant que la rareté n\'est pas choisie');
  await p.selectOption('#acc-rarity', 'unique');
  check(await p.inputValue('#acc-family') === 'unique', 'éditeur : rareté unique → famille « Unique » proposée');
  await sleep(150);
  check(await p.inputValue('#acc-set') === 'SETHS', 'éditeur : choisir « Unique » pré-sélectionne « Hors série »');
  check(await p.inputValue('#acc-max') === '1' && await p.getAttribute('#acc-max', 'readonly') === null, 'éditeur : exemplaires maximum modifiable, 1 par défaut');
  check(await p.isDisabled('dialog.ui-drawer[open] input[name="craftable"]') && !(await p.isChecked('dialog.ui-drawer[open] input[name="craftable"]')), 'éditeur : « Fabricable » décoché et désactivé');
  check(await p.isVisible('#acc-unique-help'), 'éditeur : aide « Unique » affichée');
  await p.selectOption('#acc-family', 'lieu'); // une carte « Membre » exige un membre lié : on choisit une autre famille
  await p.fill('#acc-name', 'Carte unique de test');
  await p.fill('#acc-max', '');
  await submitDrawer(p);
  check(/nombre d.exemplaires/.test(await p.textContent('dialog.ui-drawer[open] .form-error').catch(() => '')), 'éditeur : unique sans nombre d\'exemplaires → refusée');
  await p.fill('#acc-max', '3');
  await submitDrawer(p);
  await waitClosed(p);
  const creee = await p.evaluate(() => window.__DB.hg_cards.find((k) => k.name === 'Carte unique de test'));
  check(!!creee && creee.rarity === 'unique' && creee.max_copies === 3 && creee.craftable === false && creee.set_id === 'SETHS',
    'enregistrement : rareté unique, 3 exemplaires choisis, non fabricable, série Hors série');
  check(!p.errs.length, 'admin cartes : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // 6. Don et Drop : une carte unique déjà attribuée ne peut pas être redonnée ni lancée.
  p = await openPage(browser, { page: 'admin', fixture: FIXTURE, width: 1280, height: 900, scenario: { uniques: true, uniqueTaken: true } });
  await adminSection(p, 'fabrique/joueurs');
  await p.evaluate((id) => { location.hash = 'cartes/joueurs/' + id; }, ALICE);
  await p.waitForSelector('[data-act="give-open"]', { timeout: 8000 });
  await p.click('[data-act="give-open"]');
  await p.waitForSelector('dialog.ui-drawer[open] [data-vp-card="C14"]', { state: 'attached', timeout: 5000 });
  await p.click('dialog.ui-drawer[open] [data-vp-card="C14"]');
  const donAlerte = await p.textContent('dialog.ui-drawer[open] .gv-warn').catch(() => '');
  check(/Dépassement/.test(donAlerte) && /aucun restant/.test(donAlerte), 'Give : la carte unique déjà attribuée reste donnable, avec une alerte de dépassement (« ' + donAlerte + ' »)');
  await p.keyboard.press('Escape');
  await waitClosed(p);
  await adminSection(p, 'fabrique/drops');
  await p.waitForSelector('[data-action="drop-new"]', { timeout: 8000 });
  await p.click('[data-action="drop-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #drop-pick [data-vp-card="C14"]', { timeout: 5000 });
  const dropOpt = await p.$eval('#drop-pick [data-vp-card="C14"]', (b) => ({ dis: b.disabled, cap: b.closest('.vp-tile').querySelector('.vp-cap').textContent })).catch(() => null);
  check(dropOpt && dropOpt.dis && /Déjà attribuée/.test(dropOpt.cap), 'Drop : la carte unique déjà attribuée est désactivée (« ' + (dropOpt && dropOpt.cap) + ' »)');
  await p.keyboard.press('Escape');
  await p.ctx.close();

  // 7. Unique à 3 exemplaires : 1 donné sur 3 → toujours choisissable (Don, Drop), mention « 1 / 3 » ; 3 donnés sur 3 → bloquée.
  const MULTI = { uniques: true, uniqueMulti: { taken: 1 } };
  p = await openPage(browser, { page: 'cartes', fixture: FIXTURE, width: 1280, height: 900, scenario: MULTI });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', 'SETHS');
  await p.waitForSelector('.cz-cell:has([data-card="C15"])', { timeout: 5000 });
  const etat1 = await p.textContent('.cz-cell:has([data-card="C15"]) .cartes-uniq-state').catch(() => '');
  check(etat1.trim() === '1 / 3 exemplaires attribués', 'collection : unique à 3 exemplaires, 1 attribué → « 1 / 3 exemplaires attribués » (« ' + etat1.trim() + ' »)');
  const fam3 = await p.textContent('.cz-cell:has([data-card="C15"]) .hgc-fam').catch(() => '');
  check(fam3.includes('Édition de 3') && !fam3.includes('Exemplaire unique'), 'carte à 3 exemplaires : « Édition de 3 » (« ' + fam3 + ' »)');
  await p.ctx.close();
  p = await openPage(browser, { page: 'cartes', fixture: FIXTURE, width: 1280, height: 900, scenario: { uniques: true, uniqueMulti: { taken: 3 } } });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', 'SETHS');
  await p.waitForSelector('.cz-cell:has([data-card="C15"])', { timeout: 5000 });
  const etat3 = await p.textContent('.cz-cell:has([data-card="C15"]) .cartes-uniq-state').catch(() => '');
  check(etat3.trim() === 'Tous les exemplaires sont attribués', 'collection : 3 attribués sur 3 → « Tous les exemplaires sont attribués » (« ' + etat3.trim() + ' »)');
  await p.ctx.close();

  p = await openPage(browser, { page: 'admin', fixture: FIXTURE, width: 1280, height: 900, scenario: MULTI });
  await adminSection(p, 'fabrique/joueurs');
  await p.evaluate((id) => { location.hash = 'cartes/joueurs/' + id; }, ALICE);
  await p.waitForSelector('[data-act="give-open"]', { timeout: 8000 });
  await p.click('[data-act="give-open"]');
  await p.waitForSelector('dialog.ui-drawer[open] [data-vp-card="C15"]', { state: 'attached', timeout: 5000 });
  await p.click('dialog.ui-drawer[open] [data-vp-card="C15"]');
  check(!(await p.$('dialog.ui-drawer[open] .gv-warn')), 'Give : unique à 3 exemplaires dont 1 attribué, un de plus sans alerte');
  await p.keyboard.press('Escape');
  await waitClosed(p);
  await adminSection(p, 'fabrique/drops');
  await p.waitForSelector('[data-action="drop-new"]', { timeout: 8000 });
  await p.click('[data-action="drop-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #drop-pick [data-vp-card="C15"]', { timeout: 5000 });
  const drop1 = await p.$eval('#drop-pick [data-vp-card="C15"]', (b) => ({ dis: b.disabled, cap: b.closest('.vp-tile').querySelector('.vp-cap').textContent })).catch(() => null);
  check(drop1 && !drop1.dis && /2 restants/.test(drop1.cap), 'Drop : unique à 3 exemplaires dont 1 attribué reste lançable, « 2 restants » (« ' + (drop1 && drop1.cap) + ' »)');
  await p.keyboard.press('Escape');
  await waitClosed(p);
  await p.ctx.close();

  p = await openPage(browser, { page: 'admin', fixture: FIXTURE, width: 1280, height: 900, scenario: { uniques: true, uniqueMulti: { taken: 3 } } });
  await adminSection(p, 'fabrique/joueurs');
  await p.evaluate((id) => { location.hash = 'cartes/joueurs/' + id; }, ALICE);
  await p.waitForSelector('[data-act="give-open"]', { timeout: 8000 });
  await p.click('[data-act="give-open"]');
  await p.waitForSelector('dialog.ui-drawer[open] [data-vp-card="C15"]', { state: 'attached', timeout: 5000 });
  await p.click('dialog.ui-drawer[open] [data-vp-card="C15"]');
  check(/Dépassement/.test(await p.textContent('dialog.ui-drawer[open] .gv-warn').catch(() => '')), 'Give : unique 3 attribués sur 3, alerte de dépassement');
  await p.keyboard.press('Escape');
  await waitClosed(p);
  await adminSection(p, 'fabrique/drops');
  await p.waitForSelector('[data-action="drop-new"]', { timeout: 8000 });
  await p.click('[data-action="drop-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #drop-pick [data-vp-card="C15"]', { timeout: 5000 });
  const drop3 = await p.$eval('#drop-pick [data-vp-card="C15"]', (b) => ({ dis: b.disabled })).catch(() => null);
  check(drop3 && drop3.dis, 'Drop : unique 3 attribués sur 3 → bloquée dans le sélecteur');
  await p.keyboard.press('Escape');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
