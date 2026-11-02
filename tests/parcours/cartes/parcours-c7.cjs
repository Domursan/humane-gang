// Parcours C7 : série « Le gang joue », regroupement « par jeu » de la Collection et titres « Pilier de … ».
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario c2 (série SETJ : 4 cartes Minecraft dont 3 possédées, 4 cartes LoL
// toutes possédées). Contrôles : le sélecteur « Grouper » n'apparaît que si des cartes ont un tag ; vue par jeu (groupe
// ouvert = premier incomplet, compteur 3 / 4, ligne LoL « Titre obtenu », titres « Pilier de LoL ») ; ouvrir un autre
// groupe ; « Chercher un échange » mène à l'onglet Échanges ; 360 px sans défilement horizontal ; aucune erreur JS.
// Lancer : node tests/parcours/cartes/parcours-c7.cjs
const { choisirFiltre, ROOT, check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim()).catch(() => '');

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  for (const [width, label] of [[1280, 'ordinateur'], [360, '360 px']]) {
    const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width, height: 900 });
    await p.evaluate(() => { location.hash = 'collection'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
    await p.evaluate(() => { const d = document.querySelector('#cartes-filtres'); if (d) d.open = true; }); // téléphone : les filtres sont repliés
    await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
    await choisirFiltre(p, '#cartes-set', 'SET1');
    await sleep(150);
    check(!(await p.$('#cartes-f-group')), `${label} : pas de « Grouper » pour une série sans tag`);
    await choisirFiltre(p, '#cartes-set', 'SETJ');
    await sleep(150);
    check(!!(await p.$('#cartes-f-group')), `${label} : « Grouper » proposé pour « Le gang joue »`);
    await p.selectOption('#cartes-f-group', 'jeu');
    await p.waitForSelector('.c2-jeux', { timeout: 3000 });
    check(/Série « Le gang joue »/.test(await txt(p, '.c2-jeux-title')), `${label} : titre de la vue par jeu`);
    check((await txt(p, '.c2-jeu-open .c2-jeu-name')) === 'Minecraft' && (await txt(p, '.c2-jeu-open .c2-jeu-n')) === '3 / 4', `${label} : Minecraft ouvert, 3 / 4`);
    check(await p.$$eval('.c2-jeu-open .cz-cell', (x) => x.length) === 4, `${label} : les 4 cartes de Minecraft`);
    check(/il te manque Le coffre des trouvailles/.test(await txt(p, '.c2-jeu-hint')), `${label} : « il te manque … »`);
    check(/Titre obtenu/.test(await txt(p, '.c2-jeu-row[data-tag=lol]')), `${label} : LoL « Titre obtenu »`);
    check(await p.$$eval('.c2-jeu-row[data-tag=lol] .c2-pip:not(.is-off)', (x) => x.length) === 4, `${label} : 4 pastilles pleines pour LoL`);
    check(/Pilier de LoL/.test(await txt(p, '.c2-titres')), `${label} : titre « Pilier de LoL »`);
    const h = await p.$eval('.c2-jeu-row', (b) => b.getBoundingClientRect().height);
    check(h >= 44, `${label} : lignes de jeu ≥ 44 px (${h})`);
    check(await hscroll(p) === 0, `${label} : pas de défilement horizontal`);
    await p.click('.c2-jeu-row[data-tag=lol]');
    await sleep(150);
    check((await txt(p, '.c2-jeu-open .c2-jeu-name')) === 'LoL', `${label} : clic sur LoL, le groupe s'ouvre`);
    check(!!(await p.$('.c2-jeu-row[data-tag=minecraft]')), `${label} : Minecraft passe en ligne`);
    await p.click('.c2-jeu-row[data-tag=minecraft]');
    await sleep(100);
    await p.click('[data-action=jeu-trade]');
    await sleep(300);
    check(await p.getAttribute('#cartes-tab-echanges', 'aria-selected') === 'true', `${label} : « Chercher un échange » ouvre l'onglet Échanges`);
    check(!p.errs.length, `${label} : aucune erreur JS` + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.ctx.close();
  }
  // Admin : champ « Tag de jeu » dans l'éditeur de carte, suggestions des tags existants
  const a = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width: 1280, height: 900 });
  await a.evaluate(() => { location.hash = 'cartes/cartes'; });
  await sleep(1200);
  await a.click('[data-act=card-new]').catch(() => {});
  await sleep(500);
  check(!!(await a.$('#acc-tag')), 'admin : champ « Tag de jeu » dans l’éditeur');
  check(await a.$$eval('#acc-tag-list option', (o) => o.map((x) => x.value).join(',')) === 'lol,minecraft', 'admin : tags existants proposés');
  check(!a.errs.length, 'admin : aucune erreur JS' + (a.errs.length ? ' (' + a.errs.join(' | ') + ')' : ''));
  await browser.close();
  finish();
})();
