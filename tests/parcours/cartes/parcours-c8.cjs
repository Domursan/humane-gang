// Parcours C8 : variantes « OG » et « 2e gen » des cartes membres.
// Faux Supabase : fixtures/fake-sb-cartes.mjs, scénario c2 (C1 = carte d'Ethan, OG ; C6 = carte d'Alice, 2e gen) ;
// genHidden : aucune génération affichée (préférence coupée). Contrôles : bandeau « OG » (or) et « 2e gen » (argent),
// liseré double pour les OG, rien sur les cartes lieu / objet, contraste du bandeau ≥ 4,5:1, bandeau lisible en petit
// format, libellé d'accessibilité ; fiche membre « Membre depuis … · OG » ; case « Afficher ma génération » du compte.
// Lancer : node tests/parcours/cartes/parcours-c8.cjs
const { choisirFiltre, ROOT, check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

/** Contraste WCAG entre deux couleurs « rgb(r, g, b) ». */
function contrast(a, b) {
  const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width: 1280, height: 900 });
  await p.evaluate(() => { location.hash = 'collection'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await choisirFiltre(p, '#cartes-set', 'SET1');
  await sleep(200);
  const band = (id) => p.$eval(`[data-card="${id}"].hgc .hgc-gen`, (n) => n.textContent.trim()).catch(() => null);
  check(await band('C1') === 'OG', 'carte d’Ethan : bandeau « OG »');
  check(await band('C6') === '2e gen', 'carte d’Alice : bandeau « 2e gen »');
  check(await band('C3') === null && await band('C4') === null, 'cartes lieu et objet : pas de bandeau');
  check(await p.$eval('[data-card="C1"].hgc', (n) => n.classList.contains('hgc-og')), 'carte OG : classe hgc-og (double filet)');
  check(/OG/.test(await p.getAttribute('[data-card="C1"].hgc', 'aria-label')), 'libellé d’accessibilité : « OG »');
  for (const id of ['C1', 'C6']) {
    const [fg, bg] = await p.$eval(`[data-card="${id}"].hgc .hgc-gen`, (n) => [getComputedStyle(n).color, getComputedStyle(n).backgroundColor]);
    const c = contrast(fg, bg);
    check(c >= 4.5, `contraste du bandeau ${id} : ${c.toFixed(1)}:1`);
  }
  check(!p.errs.length, 'collection : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Petit format (téléphone, cartes 112 px) : le bandeau reste dans la carte et lisible
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width: 360, height: 800 });
  await p.evaluate(() => { location.hash = 'collection'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await choisirFiltre(p, '#cartes-set', 'SET1');
  await sleep(200);
  const r = await p.$eval('[data-card="C1"].hgc', (n) => { const c = n.getBoundingClientRect(); const b = n.querySelector('.hgc-gen').getBoundingClientRect(); return { inside: b.left >= c.left && b.right <= c.right, fs: parseFloat(getComputedStyle(n.querySelector('.hgc-gen')).fontSize), w: c.width }; });
  check(r.inside && r.fs >= 8, `360 px : bandeau dans la carte (${Math.round(r.w)} px), texte ${r.fs} px`);
  check(await hscroll(p) === 0, '360 px : pas de défilement horizontal');
  await p.ctx.close();

  // Préférence coupée : aucun bandeau
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true, genHidden: true }, width: 1280, height: 900 });
  await p.evaluate(() => { location.hash = 'collection'; }); // la barre d'onglets est masquée : on change d'onglet par l'adresse
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await choisirFiltre(p, '#cartes-set', 'SET1');
  await sleep(200);
  check(await p.$$eval('.hgc-gen', (x) => x.length) === 0, 'génération masquée : aucun bandeau');
  await p.ctx.close();

  // Fiche membre : « Membre depuis … · OG »
  p = await openPage(browser, { page: 'membre', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width: 1280, height: 900 });
  await p.waitForSelector('.idc-fields', { timeout: 6000 }).catch(() => {});
  const since = await p.$$eval('.idc-field', (f) => f.map((x) => x.textContent.replace(/\s+/g, ' ').trim()).find((t) => /Membre depuis/.test(t)) || '');
  check(/· OG$/.test(since), `fiche membre : « ${since} »`);
  check(/Pilier de LoL/.test(await p.textContent('.idc-fields')), 'fiche membre : titre « Pilier de LoL » (C7)');
  check(!p.errs.length, 'fiche membre : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Compte : case « Afficher ma génération »
  p = await openPage(browser, { page: 'compte', fixture: 'fake-sb-cartes.mjs', scenario: { c2: true }, width: 1280, height: 900 });
  await p.waitForSelector('#pf-show-gen', { timeout: 6000 }).catch(() => {});
  check(!!(await p.$('#pf-show-gen')) && await p.isChecked('#pf-show-gen'), 'compte : case « Afficher ma génération » cochée');
  await p.uncheck('#pf-show-gen');
  await p.click('#profile-form button[type=submit]');
  await sleep(500);
  const upd = await p.evaluate(() => (window.__LOG || []).filter((l) => l[0] === 'update' || (l[0] === 'from' && l[1] === 'hg_profiles')).map((l) => JSON.stringify(l)).join(' '));
  const prof = await p.evaluate(() => window.__DB.hg_profiles[0].show_generation);
  check(prof === false || /show_generation":false/.test(upd), 'compte : préférence enregistrée (show_generation = false)');
  check(!p.errs.length, 'compte : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await browser.close();
  finish();
})();
