// Parcours : idée J1 · GeoGuessr du gang (/pages/jeux/jeux.html#geo et admin #fete/geoguessr), faux Supabase fake-sb-jeux.mjs
// et faux Leaflet (fixtures/fake-leaflet.js, servi à la place du CDN).
// Photo de la manche ; pas de réponse avant le vote ; épingle posée puis validée (une seule tentative) ; résultat :
// score, distance, Paillettes, lieu et lien vers l'album ; classements jour / semaine ; archive pour l'honneur ;
// manche déjà jouée ; pas de manche ; carte indisponible ; 390 px sans défilement horizontal ; panel admin.
// Effets après le vote : résultat sans tampon à 1,5 s puis tampon de points (fin de partie) ; rien à l'ouverture d'une manche
// déjà jouée (tampon sans animation) ; une manche « pour l'honneur » n'a pas de tampon.
// Lancer : node tests/parcours/jeux/parcours-j1.cjs
const path = require('path');
const fs = require('fs');
const { FIXTURES, SHOTS, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const FIX = 'fake-sb-jeux.mjs';
const LEAF = fs.readFileSync(path.join(FIXTURES, 'fake-leaflet.js'));

/* Le faux fichier n'a pas l'empreinte SRI du vrai Leaflet (leaflet-load.js la demande) : le navigateur le
 * refuserait, et le premier chargement (CDN réel) produirait aussi une erreur. Dans ce test seulement, l'attribut
 * integrity est ignoré dès le premier chargement ; la production garde la SRI. */
const SANS_SRI = () => {
  for (const C of [HTMLScriptElement, HTMLLinkElement]) {
    Object.defineProperty(C.prototype, 'integrity', { configurable: true, get() { return ''; }, set() {} });
  }
};

/** Ouvre une page avec le faux Leaflet (route ajoutée puis rechargement). */
async function ouvrir(browser, opts) {
  const p = await openPage(browser, { fixture: FIX, init: SANS_SRI, ...opts });
  await p.ctx.route('**/leaflet@1.9.4/dist/leaflet.js', (r) => r.fulfill({ body: LEAF, contentType: 'text/javascript' }));
  await p.ctx.route('**/leaflet@1.9.4/dist/leaflet.css', (r) => r.fulfill({ body: '', contentType: 'text/css' }));
  await p.reload();
  await sleep(1200);
  return p;
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- Manche du jour, vote et résultat (390 px) ---------- */
  let p = await ouvrir(browser, { page: 'jeux', hash: '#geo', width: 390, height: 900 });
  await p.waitForSelector('#geo-map.leaflet-container', { timeout: 6000 }).catch(() => {});
  check((await p.locator('#geo-sub').innerText()).includes('Manche n°18'), 'manche : numéro affiché');
  check(await p.locator('#geo-img').getAttribute('src').then((s) => !!s), 'manche : photo signée affichée');
  const before = await p.evaluate(() => document.querySelector('#jeux-panel-geo').innerText);
  check(!/Part-Dieu|Lyon/.test(before), 'pas de réponse affichée avant le vote');
  check(await p.locator('.geo-valider').isDisabled(), 'valider désactivé sans épingle');
  await p.evaluate(() => window.__fakeMapClick(45.7640, 4.8357));
  await sleep(200);
  check(!(await p.locator('.geo-valider').isDisabled()), 'épingle posée : valider actif');
  check((await p.locator('#geo-status').innerText()).includes('Épingle posée'), 'épingle : message d’état');
  await p.locator('.geo-valider').click();
  await p.waitForSelector('#geo-result:not([hidden])', { timeout: 4000 }).catch(() => {});
  check(await p.locator('#geo-result .fxj-tampon').count() === 0, 'effets : le tampon de points n’est pas là avant la fin de la séquence');
  await p.waitForSelector('#geo-result .fxj-tampon', { timeout: 4000 }).catch(() => {});
  check(/^\d+ PTS?$/.test(await p.locator('#geo-result .fxj-tampon').innerText().catch(() => '')) && await p.locator('#geo-result.fxj-entree').count() === 1, 'effets : après le vote, tampon de points et entrée animée');
  await sleep(1400); // le score des Paillettes finit de défiler
  const res = await p.locator('#geo-result').innerText();
  check(/\/ 5 000/.test(res) && /km/.test(res), 'résultat : score sur 5 000 et distance');
  check(res.includes('Gare de la Part-Dieu') && res.includes('RDV Lyon 2026'), 'résultat : lieu et sortie d’origine');
  check(await p.locator('#geo-result a.geo-album').getAttribute('href').then((h) => h.startsWith('/pages/irl/irl.html#event-')), 'résultat : lien vers l’album');
  check(/\+\d+/.test(await p.locator('#geo-result [data-geo-gain]').innerText().catch(() => '')) && await p.locator('#geo-result .fxj-gain').count() === 0, 'résultat : Paillettes gagnées, affichées une seule fois');
  check(await p.locator('#geo-actions').isHidden(), 'après le vote : plus de bouton valider');
  const map = await p.evaluate(() => { const items = window.__fakeMap.items.flatMap((x) => x.layers || []); return { markers: items.filter((x) => x.kind === 'marker').length, lines: items.filter((x) => x.kind === 'line').length, fit: !!window.__fakeMap.bounds }; });
  check(map.markers === 2 && map.lines === 1 && map.fit, 'carte : deux épingles, une ligne, cadrage');
  const calls = (await log(p)).filter((l) => l[1] === 'hg_geo_guess');
  check(calls.length === 1 && Math.abs(calls[0][2].p_lat - 45.764) < 1e-6, 'une seule tentative envoyée avec l’épingle');
  await sleep(500);
  check((await p.locator('#geo-board').innerText()).includes('Ethan'), 'classement du jour : mon score apparaît');
  check(await p.locator('#geo-board li.is-me').count() === 1, 'classement : ma ligne mise en avant');
  await p.locator('[data-geo="scope"][data-scope="semaine"]').click();
  await sleep(400);
  check((await p.locator('#geo-board-h').innerText()).includes('semaine') && await p.locator('[data-scope="semaine"]').getAttribute('aria-pressed') === 'true', 'classement : bascule Semaine');
  check(await hscroll(p) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'jeux-geo-390.png'), fullPage: true }).catch(() => {});
  // Archive : manche passée pour l'honneur
  await p.locator('#geo-archive summary').click();
  await p.waitForSelector('.geo-arch', { timeout: 4000 }).catch(() => {});
  check(await p.locator('.geo-arch').count() === 1 && (await p.locator('.geo-arch').innerText()).includes('À jouer'), 'archive : manche passée à jouer');
  await p.locator('.geo-arch').click();
  await sleep(600);
  check((await p.locator('#geo-sub').innerText()).includes('pour l’honneur'), 'archive : mode « pour l’honneur »');
  check(!(await p.locator('.geo-back').isHidden()), 'archive : bouton « Manche du jour »');
  await p.evaluate(() => window.__fakeMapClick(46.2, 6.14));
  await p.locator('.geo-valider').click();
  await sleep(2800);
  check((await p.locator('#geo-result').innerText()).includes('Pour l’honneur'), 'archive : résultat sans Paillettes');
  check(await p.locator('#geo-result .fxj-tampon').count() === 0, 'archive : pas de fin de partie pour une manche pour l’honneur');
  await p.locator('.geo-back').click();
  await sleep(600);
  check((await p.locator('#geo-sub').innerText()).includes('une tentative par jour') && !(await p.locator('#geo-result').isHidden()), 'retour à la manche du jour (déjà jouée)');
  check(p.errs.length === 0, `aucune erreur JS ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Déjà jouée, pas de manche, carte indisponible ---------- */
  p = await ouvrir(browser, { page: 'jeux', hash: '#geo', width: 1280, scenario: { geoPlayed: true } });
  await sleep(500);
  check(!(await p.locator('#geo-result').isHidden()) && /4.210/.test(await p.locator('#geo-result').innerText()), 'déjà jouée : résultat directement');
  check(await p.locator('#geo-actions').isHidden(), 'déjà jouée : pas de nouvelle tentative');
  check(await p.locator('#geo-result .fxj-tampon').count() === 1 && await p.locator('#geo-result.fxj-entree').count() === 0, 'déjà jouée : tampon posé sans animation d’entrée');
  await p.evaluate(() => { location.hash = 'aujourdhui'; }); // colonne d'onglets masquée : navigation par adresse
  await sleep(800);
  check((await p.locator('[data-badge="geo"]').innerText()).includes('Fait') && (await p.locator('#jeux-bal-v').innerText()).includes('+42'), 'tableau de bord : GeoGuessr fait, +42 du jour');
  check(p.errs.length === 0, `aucune erreur JS (déjà jouée) ${p.errs.join(' | ')}`);
  await p.ctx.close();
  p = await ouvrir(browser, { page: 'jeux', hash: '#geo', width: 390, scenario: { geoNone: true } });
  check((await p.locator('#geo-play').innerText()).includes('Pas de manche aujourd’hui'), 'pas de manche : message');
  check(p.errs.length === 0, `aucune erreur JS (pas de manche) ${p.errs.join(' | ')}`);
  await p.ctx.close();
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#geo', width: 390 });
  await sleep(1500);
  check((await p.locator('#geo-status').innerText()).includes('Carte indisponible') && await p.locator('[data-geo="retry-map"]').count() === 1, 'carte injoignable : message et « Réessayer »');
  await p.ctx.close();

  /* ---------- Panel : manches GeoGuessr ---------- */
  p = await ouvrir(browser, { page: 'admin', width: 1280, height: 900 });
  await adminSection(p, 'fete/geoguessr');
  await p.waitForSelector('#ajx-geo-list .ajx-row', { timeout: 4000 }).catch(() => {});
  check(await p.locator('#ajx-geo-list .ajx-row').count() === 3, 'panel : 3 manches listées');
  check((await p.locator('#ajx-geo-stats').innerText()).includes('en réserve'), 'panel : réserve comptée');
  await p.locator('#ajx-geo-list .ajx-row').filter({ hasText: 'Lausanne' }).locator('[data-ajx="geo-toggle"]').click();
  await sleep(500);
  const tg = (await log(p)).filter((l) => l[0] === 'geo_save').pop();
  check(tg && tg[1] === 'geo-res' && tg[2].active === false, 'panel : désactiver une manche');
  await p.locator('[data-ajx="geo-new"]').click();
  await p.waitForSelector('dialog.ui-drawer #ajx-geo-event', { timeout: 4000 }).catch(() => {});
  check(await p.locator('#ajx-geo-event option').count() >= 2, 'panel : sorties proposées');
  await p.locator('#ajx-geo-event').selectOption({ index: 1 });
  await p.waitForSelector('.ajx-photo', { timeout: 4000 }).catch(() => {});
  check(await p.locator('.ajx-photo').count() >= 1, 'panel : photos de la sortie à choisir');
  await sleep(300);
  await p.evaluate(() => window.__fakeMapClick(46.52, 6.63));
  check(await p.locator('#ajx-geo-lat').inputValue() === '46.52', 'panel : clic sur la carte → latitude');
  await p.locator('#ajx-geo-label').fill('Gare de Lausanne');
  await p.locator('[data-drawer-submit]').click();
  await sleep(500);
  check(await p.locator('dialog.ui-drawer[open]').count() === 1, 'panel : sans photo choisie, le tiroir reste ouvert');
  await p.keyboard.press('Escape');
  check(p.errs.filter((e) => !/Choisis une photo/.test(e)).length === 0, `panel : aucune erreur JS ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Panel : un Staff sans « souvenirs » ne voit pas la sous-section ---------- */
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, scenario: { uid: '00000002-0000-4000-8000-000000000002', staff: ['quiz'] } });
  await p.evaluate(() => { location.hash = '#fete'; });
  await p.waitForSelector('#lieu-root .lieu-tile', { timeout: 5000 }).catch(() => {});
  check(await p.locator('#lieu-root .lieu-tile[data-sub="geoguessr"]').count() === 0, 'Staff « quiz » : pas de page GeoGuessr');
  check(await p.locator('#lieu-root .lieu-tile[data-sub="citations"]').count() === 1, 'Staff « quiz » : page Citations');
  await p.ctx.close();

  await browser.close();
  finish();
})();
