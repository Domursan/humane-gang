require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours V8 : calendrier du gang (/pages/irl/calendrier.html).
// Couvre : lien dans le menu ; mois courant avec pastilles (téléphone) ou titres (ordinateur) ; jour du jour sélectionné ;
// choisir un jour affiche sa liste (sortie IRL avec lien, rendez-vous récurrent) ; filtres (aria-pressed, masquage,
// mémorisés) ; mois suivant / précédent ; flèches du clavier ; « S'abonner » ouvre l'adresse personnelle et la régénère après
// confirmation ; création d'un rendez-vous récurrent (erreur de titre vide, puis succès) ; annulation d'une date ; erreur
// de chargement affichée ; 360 px sans défilement horizontal ; aucune erreur console.
// Lancer : node tests/parcours/irl/parcours-v8.cjs (à travers le verrou commun des tests navigateur).
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const vd = (p, fn, a) => p.evaluate(fn, a);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const plusDays = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));

(async () => {
  const browser = await chromium.launch();

  /* ---------- Ordinateur ---------- */
  let p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', width: 1280 });
  await p.waitForSelector('#cal-grid [data-day]', { timeout: 8000 });
  check(await p.locator('.site-header .nav a[href="/pages/irl/calendrier.html"]').count() === 1, 'menu : lien « Calendrier »');
  check(await p.locator('.site-header .nav a[href="/pages/irl/cine.html"]').count() === 1, 'menu : lien « Ciné-club »');
  const T = today();
  check(await p.getAttribute(`#cal-grid [data-day="${T}"]`, 'aria-pressed') === 'true', 'le jour du jour est sélectionné');
  check(await p.locator(`#cal-grid [data-day="${T}"].is-today`).count() === 1, 'aujourd’hui mis en évidence');
  check(await p.locator('#cal-filters [data-filter]').count() === 6, 'six filtres de type');
  check(await p.locator('.cal-ttls').first().isVisible(), 'ordinateur : titres dans les cases');

  // Jour de la sortie IRL (dans 5 jours, si elle tombe dans ce mois)
  const sortie = plusDays(5);
  if (sortie.slice(0, 7) !== T.slice(0, 7)) await p.click('#cal-next');
  await p.waitForSelector(`#cal-grid [data-day="${sortie}"]`);
  await p.click(`#cal-grid [data-day="${sortie}"]`);
  const dayTxt = await p.textContent('#cal-day');
  check(/Raclette sans raclette/.test(dayTxt) && /Sortie IRL · 12 h · 6 viennent/.test(dayTxt), 'liste du jour : sortie IRL avec heure de Zurich et réponses');
  check(await p.locator('#cal-day a[href^="/pages/irl/irl.html#event-"]').count() === 1, 'lien « Ouvrir » vers la sortie');
  check(/rendez-vous/.test(await p.getAttribute(`#cal-grid [data-day="${sortie}"]`, 'aria-label')), 'case du jour : libellé accessible avec le nombre de rendez-vous');

  // Filtre IRL
  await p.click('#cal-filters [data-filter="irl"]');
  check(await p.getAttribute('#cal-filters [data-filter="irl"]', 'aria-pressed') === 'false', 'filtre IRL désactivé (aria-pressed)');
  check(!/Raclette/.test(await p.textContent('#cal-day')), 'filtre IRL : la sortie disparaît');
  check(await p.evaluate(() => localStorage.getItem('hg_cal_filters')) === '["irl"]', 'filtres mémorisés');
  await p.click('#cal-filters [data-filter="irl"]');

  // Navigation de mois
  const title0 = await p.textContent('#cal-title');
  await p.click('#cal-next');
  await sleep(300);
  const title1 = await p.textContent('#cal-title');
  check(title1 !== title0, `mois suivant (${title1})`);
  await p.click('#cal-prev'); await sleep(300);
  check(await p.textContent('#cal-title') === title0, 'mois précédent');
  await p.click('#cal-today'); await sleep(300);

  // Clavier : flèche droite depuis le jour sélectionné
  const T1 = plusDays(1);
  if (T1.slice(0, 7) === T.slice(0, 7)) {
    await p.focus(`#cal-grid [data-day="${T}"]`);
    await p.keyboard.press('ArrowRight');
    check(await p.evaluate(() => document.activeElement?.dataset.day) === T1, 'flèche droite : jour suivant sélectionné et focalisé');
  }

  // Abonnement
  await p.click('#cal-sub');
  await p.waitForSelector('dialog.cal-dlg[open] #cal-sub-url');
  const url = await p.inputValue('#cal-sub-url');
  check(url.endsWith('/functions/v1/hg-calendar?t=' + 'a'.repeat(64)), 'adresse personnelle d’abonnement');
  check(await p.locator('dialog.cal-dlg[open] a[href^="webcal:"]').count() === 1, 'lien webcal:');
  await p.click('dialog.cal-dlg[open] [data-dlg="reset"]');
  await p.waitForSelector('dialog.hg-dialog:not(.cal-dlg)[open]');
  await p.click('dialog.hg-dialog:not(.cal-dlg)[open] .dialog-actions .btn:last-child');
  await p.waitForFunction(() => document.querySelector('#cal-sub-url')?.value.endsWith('b'.repeat(64)), null, { timeout: 4000 }).catch(() => {});
  check((await p.inputValue('#cal-sub-url')).endsWith('b'.repeat(64)), 'nouvelle adresse après confirmation');
  await p.keyboard.press('Escape');
  await sleep(200);

  // Création d'un rendez-vous récurrent
  await p.click('#cal-add');
  await p.waitForSelector('dialog.cal-dlg[open] #sl-title');
  await p.click('dialog.cal-dlg[open] [type="submit"]');
  check(/titre/.test(await p.textContent('dialog.cal-dlg[open] .cal-form-err')), 'titre vide : erreur affichée');
  await p.fill('#sl-title', 'Age ce soir');
  await p.selectOption('#sl-day', '2');
  await p.fill('#sl-time', '21:00');
  await p.fill('#sl-link', 'javascript:alert(1)');
  await p.click('dialog.cal-dlg[open] [type="submit"]');
  await sleep(300);
  check(/https/.test(await p.textContent('dialog.cal-dlg[open] .cal-form-err')), 'lien non https refusé');
  await p.fill('#sl-link', '');
  await p.click('dialog.cal-dlg[open] [type="submit"]');
  await p.waitForSelector('dialog.cal-dlg', { state: 'detached', timeout: 4000 }).catch(() => {});
  check(await vd(p, () => window.__VD.slots.some((s) => s.title === 'Age ce soir' && s.weekday === 2 && s.at_time === '21:00:00')), 'rendez-vous créé (mardi 21 h)');
  check(/Age ce soir/.test(await p.textContent('#cal-slots')), 'rendez-vous listé dans « Rendez-vous récurrents »');
  check(await p.locator('#cal-slots [data-act="edit-slot"]').count() === 3, 'admin : peut modifier tous les rendez-vous');

  // Annuler une date du CK3 (jeudi) : premier jeudi visible
  const thu = await p.evaluate(() => [...document.querySelectorAll('#cal-grid [data-day]')].map((b) => b.dataset.day).find((d) => new Date(d + 'T12:00:00Z').getUTCDay() === 4));
  await p.click(`#cal-grid [data-day="${thu}"]`);
  check(/Campagne CK3 Serge/.test(await p.textContent('#cal-day')), 'jeudi : la campagne CK3 apparaît');
  await p.click('#cal-day [data-act="skip"]');
  await p.waitForSelector('dialog.hg-dialog[open]');
  await p.click('dialog.hg-dialog[open] .dialog-actions .btn:last-child');
  await sleep(500);
  check(await vd(p, (d) => window.__VD.skips.some((k) => k.day === d), thu), 'date annulée envoyée');
  check(!/Campagne CK3 Serge/.test(await p.textContent('#cal-day')), 'la date annulée disparaît');
  check(p.errs.length === 0, 'ordinateur : aucune erreur console' + (p.errs.length ? ' : ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Téléphone 360 px (grille choisie : la liste par défaut est testée dans parcours-calendrier-liste.cjs) ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', width: 360, height: 780 });
  await p.waitForSelector('#cal-liste .cal-jour', { timeout: 8000 });
  await p.click('#cal-vue-grille');
  await p.waitForSelector('#cal-grid [data-day]', { timeout: 8000 });
  check(await hscroll(p) <= 0, '360 px : pas de défilement horizontal');
  check(await p.locator('.cal-dots').first().isVisible() && !(await p.locator('.cal-ttls').first().isVisible()), 'téléphone : pastilles, pas de titres');
  const box = await p.locator(`#cal-grid [data-day="${today()}"]`).boundingBox();
  check(box && box.height >= 44, `case de jour ≥ 44 px de haut (${box && Math.round(box.height)})`);
  await p.screenshot({ path: require('path').join(__dirname, '..', '..', 'shots', 'v8-calendrier-360.png'), fullPage: true }).catch(() => {});
  check(p.errs.length === 0, 'téléphone : aucune erreur console' + (p.errs.length ? ' : ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Membre simple : ne modifie que ses rendez-vous ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', scenario: { uid: '00000003-0000-4000-8000-000000000003' } });
  await p.waitForSelector('#cal-slots .cal-slot', { timeout: 8000 });
  check(await p.locator('#cal-slots [data-act="edit-slot"]').count() === 1, 'membre : « Modifier » seulement sur son rendez-vous');
  await p.ctx.close();

  /* ---------- Erreur de chargement ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', scenario: { calFail: true } });
  await p.waitForSelector('#cal-grid .cal-error', { timeout: 8000 }).catch(() => {});
  check(/Impossible de charger/.test(await p.textContent('#cal-grid')), 'échec de chargement : message affiché');
  await p.ctx.close();

  await browser.close();
  finish();
})();
