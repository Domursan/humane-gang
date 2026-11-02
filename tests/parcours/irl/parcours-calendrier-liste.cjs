require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours idée 70 : calendrier du gang en liste sur téléphone (/pages/irl/calendrier.html).
// Couvre : liste par défaut à 390 px (grille et jour choisi masqués) ; seuls les jours qui ont un rendez-vous sont listés,
// plus aujourd'hui (même vide, « Rien de prévu ») ; jours passés repliés derrière « Voir les jours passés », dépliés au clic ;
// lignes avec « Ouvrir » et « Ajouter à mon agenda » ; filtre appliqué à la liste ; bouton Grille (choix retenu sur l'appareil,
// relu à l'ouverture suivante) ; mois vide ; erreur de chargement avec « Réessayer » ; 1280 px : grille seule, pas de choix ;
// 390 px sans défilement horizontal ; aucune erreur console.
// Lancer : node tests/parcours/irl/parcours-calendrier-liste.cjs (à travers le verrou commun des tests navigateur).
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const zurich = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const today = () => zurich(Date.now());
const shot = (p, nom) => p.screenshot({ path: require('path').join(__dirname, '..', '..', 'shots', `cal-liste-${nom}.png`), fullPage: true }).catch(() => {});

(async () => {
  const browser = await chromium.launch();
  const T = today();

  /* ---------- Téléphone 390 px : liste par défaut ---------- */
  let p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', width: 390, height: 844 });
  await p.waitForSelector('#cal-liste .cal-jour', { timeout: 8000 });
  check(await hscroll(p) <= 0, '390 px : pas de défilement horizontal');
  check(await p.locator('#cal-liste').isVisible() && !(await p.locator('.cal-grid-wrap').isVisible()) && !(await p.locator('#cal-day').isVisible()), 'téléphone : la liste remplace la grille et le jour choisi');
  check(await p.getAttribute('#cal-vue-liste', 'aria-pressed') === 'true' && await p.getAttribute('#cal-vue-grille', 'aria-pressed') === 'false', 'bouton « Liste » enfoncé par défaut');
  check(await p.evaluate(() => document.querySelector('#cal-liste').getAttribute('aria-busy')) === 'false', 'liste chargée (aria-busy)');

  // Jours listés : ceux du mois (à partir d'aujourd'hui) qui ont un rendez-vous visible, plus aujourd'hui
  const attendus = await p.evaluate((T) => {
    const jours = new Set([...document.querySelectorAll('#cal-grid [data-day].has-items')].map((b) => b.dataset.day).filter((d) => d >= T));
    jours.add(T);
    return [...jours].sort();
  }, T);
  const listes = await p.evaluate(() => [...document.querySelectorAll('#cal-liste .cal-jour')].map((li) => li.querySelector('.visually-hidden').textContent));
  check(listes.length === attendus.length && listes.length >= 2, `jours listés = jours avec rendez-vous à venir + aujourd'hui (${listes.length})`);
  check(await p.locator('#cal-liste .cal-jour.is-passe').count() === 0, 'aucun jour passé affiché au départ');
  const auj = p.locator('#cal-liste .cal-jour.is-today');
  check(await auj.count() === 1 && /aujourd’hui/.test(await auj.locator('.visually-hidden').textContent()), 'aujourd’hui toujours affiché, annoncé au lecteur d’écran');
  check(/Aujourd’hui/.test(await auj.textContent()), 'étiquette « Aujourd’hui »');
  const nbAuj = await auj.locator('.cal-item').count();
  check(nbAuj > 0 || /Rien de prévu/.test(await auj.textContent()), `aujourd’hui : ${nbAuj} rendez-vous${nbAuj ? '' : ', « Rien de prévu »'}`);
  check((await p.textContent('#cal-liste')).includes('Raclette sans raclette') === (attendus.includes(zurich(Date.now() + 5 * 864e5))), 'la sortie IRL dans 5 jours est listée si elle tombe dans ce mois');
  check(await p.locator('#cal-liste .cal-item a:has-text("Ouvrir")').count() >= 1, 'lignes avec « Ouvrir »');
  check(await p.locator('#cal-liste .cal-item [data-act="ics"]').count() >= 1, 'lignes avec « Ajouter à mon agenda »');
  const box = await p.locator('#cal-liste .cal-item [data-act="ics"]').first().boundingBox();
  check(box && box.height >= 44 && box.width >= 44, `bouton agenda ≥ 44 px (${box && Math.round(box.width)} × ${box && Math.round(box.height)})`);
  await shot(p, '390');

  // Jours passés : repliés, puis dépliés
  const nbPasses = await p.evaluate((T) => [...document.querySelectorAll('#cal-grid [data-day].has-items')].filter((b) => b.dataset.day < T).length, T);
  const btnPasses = p.locator('#cal-liste [data-act="passes"]');
  if (nbPasses) {
    check(await btnPasses.count() === 1 && await btnPasses.getAttribute('aria-expanded') === 'false', 'bouton « Voir les jours passés » replié');
    check(new RegExp(nbPasses > 1 ? `Voir les ${nbPasses} jours passés` : 'Voir le jour passé').test(await btnPasses.textContent()), `nombre de jours passés dans le bouton (${nbPasses})`);
    await btnPasses.click();
    check(await p.locator('#cal-liste .cal-jour.is-passe').count() === nbPasses, 'jours passés dépliés');
    check(/Masquer les jours passés/.test(await btnPasses.textContent()) && await btnPasses.getAttribute('aria-expanded') === 'true', 'bouton « Masquer les jours passés »');
    check(await p.evaluate(() => document.activeElement?.dataset.act) === 'passes', 'le bouton garde le focus');
    const ordre = await p.evaluate(() => [...document.querySelectorAll('#cal-liste .cal-jour')].map((li) => li.classList.contains('is-passe')));
    check(ordre.indexOf(false) > ordre.lastIndexOf(true), 'jours passés avant les jours à venir');
    await shot(p, '390-passes');
    await btnPasses.click();
    check(await p.locator('#cal-liste .cal-jour.is-passe').count() === 0, 'jours passés repliés à nouveau');
  } else {
    check(await btnPasses.count() === 0, 'premier du mois : pas de bouton des jours passés');
  }

  // Filtre « Groupes » : les rendez-vous récurrents disparaissent de la liste
  const avant = await p.locator('#cal-liste .cal-item').count();
  await p.click('#cal-filters [data-filter="groupe"]');
  const apres = await p.locator('#cal-liste .cal-item').count();
  check(apres < avant && !/Campagne CK3 Serge/.test(await p.textContent('#cal-liste')), `filtre Groupes : la liste suit (${avant} → ${apres})`);
  await p.click('#cal-filters [data-filter="groupe"]');
  check(await p.locator('#cal-liste .cal-item').count() === avant, 'filtre rétabli');

  // Bouton Grille : grille et jour choisi reviennent, choix retenu
  await p.click('#cal-vue-grille');
  check(await p.locator('.cal-grid-wrap').isVisible() && await p.locator('#cal-day').isVisible() && !(await p.locator('#cal-liste').isVisible()), 'Grille : la grille et le jour choisi s’affichent, la liste se masque');
  check(await p.getAttribute('#cal-vue-grille', 'aria-pressed') === 'true', 'bouton « Grille » enfoncé');
  check(await p.evaluate(() => localStorage.getItem('hg_cal_vue')) === 'grille', 'choix retenu sur l’appareil');
  await shot(p, '390-grille');
  await p.click('#cal-vue-liste');
  check(await p.locator('#cal-liste').isVisible() && await p.evaluate(() => localStorage.getItem('hg_cal_vue')) === 'liste', 'retour à la liste, choix retenu');

  // Mois suivant : liste du mois, sans jours passés ni « Aujourd'hui »
  await p.click('#cal-next');
  await p.waitForFunction(() => document.querySelector('#cal-liste')?.getAttribute('aria-busy') === 'false' && document.querySelector('#cal-liste .cal-jour'), null, { timeout: 4000 }).catch(() => {});
  check(await p.locator('#cal-liste .cal-jour').count() > 0 && await p.locator('#cal-liste .is-today').count() === 0 && await p.locator('#cal-liste [data-act="passes"]').count() === 0, 'mois suivant : jours à venir seulement, sans « Aujourd’hui »');
  check(new RegExp(await p.evaluate(() => document.querySelector('#cal-title').textContent.toLowerCase())).test(await p.getAttribute('#cal-liste', 'aria-label')), 'libellé accessible de la liste : le mois affiché');
  check(p.errs.length === 0, 'téléphone : aucune erreur console' + (p.errs.length ? ' : ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Choix « Grille » relu à l'ouverture suivante ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', width: 390, height: 844, init: { content: 'localStorage.setItem("hg_cal_vue", "grille")' } });
  await p.waitForSelector('#cal-grid [data-day]', { timeout: 8000 });
  check(!(await p.locator('#cal-liste').isVisible()) && await p.getAttribute('#cal-vue-grille', 'aria-pressed') === 'true', 'choix « Grille » relu : grille à l’ouverture');
  await p.ctx.close();

  /* ---------- Mois vide ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', scenario: { calEmpty: true }, width: 390, height: 844 });
  await p.waitForSelector('#cal-liste .cal-liste-vide', { timeout: 8000 }).catch(() => {});
  check(/Rien de prévu en [a-zéû]+\./.test(await p.textContent('#cal-liste')) && /Rendez-vous récurrent/.test(await p.textContent('#cal-liste')), 'mois vide : message et piste');
  check(await p.locator('#cal-liste .cal-jour').count() === 0, 'mois vide : aucun jour listé');
  await shot(p, '390-vide');
  await p.ctx.close();

  /* ---------- Erreur de chargement ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', scenario: { calFail: true }, width: 390, height: 844 });
  await p.waitForSelector('#cal-liste .cal-error', { timeout: 8000 }).catch(() => {});
  check(/Impossible de charger/.test(await p.textContent('#cal-liste')), 'échec de chargement : message dans la liste');
  check(await p.locator('#cal-liste [data-act="recharger"]:has-text("Réessayer")').count() === 1, 'bouton « Réessayer »');
  await p.evaluate(() => { window.__SCN.calFail = false; });
  await p.click('#cal-liste [data-act="recharger"]');
  await p.waitForSelector('#cal-liste .cal-jour', { timeout: 4000 }).catch(() => {});
  check(await p.locator('#cal-liste .cal-jour').count() > 0, '« Réessayer » recharge le mois');
  await p.ctx.close();

  /* ---------- Ordinateur 1280 px : rien ne change ---------- */
  p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', width: 1280 });
  await p.waitForSelector('#cal-grid [data-day]', { timeout: 8000 });
  check(await p.locator('.cal-grid-wrap').isVisible() && await p.locator('#cal-day').isVisible() && !(await p.locator('#cal-liste').isVisible()), 'ordinateur : grille et jour choisi, pas de liste');
  check(!(await p.locator('.cal-vue').isVisible()), 'ordinateur : pas de choix Liste / Grille');
  check(p.errs.length === 0, 'ordinateur : aucune erreur console' + (p.errs.length ? ' : ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})();
