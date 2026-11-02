// Parcours · Paramètres de « Imprimer ma planche » (cartes-planche.js) et planche générée (collection-a4.html).
// 1. Fenêtre : part de la série et des filtres de l'écran, bilan recalculé à chaque choix, avertissement au-delà de 20 pages, rien à générer si aucune carte.
// 2. « Générer ma planche » : tous les réglages dans l'adresse.
// 3. Planche : 9 et 16 par page, tri, rareté, doublons, favoris, souhaits, titre, compteur, valeurs fausses ignorées, rien ne déborde.
// 4. « Changer les paramètres » rouvre la fenêtre avec les mêmes réglages. 360 px : pas de défilement horizontal.
// Faux Supabase : fixtures/fake-sb-cartes.mjs. Lancer : node tests/parcours/cartes/parcours-planche-parametres.cjs
const { openPage, check, finish, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const F = 'fake-sb-cartes.mjs';
const SCENARIO = { luck: 'beaucoup', set2Open: true };
const MOD = '/assets/espaces/cartes/cartes-planche.js';
/** Ouvre la fenêtre sur une petite collection construite ici (le bouton réel est vérifié par c16). */
const ouvrir = (p, opts = {}) => p.evaluate(async ({ MOD, opts }) => {
  const { openPlanche } = await import(MOD);
  const sets = [{ id: 'SET1', name: 'Le Gang · Série 1', code: 'gang' }, { id: 'SETX', name: 'Secrets', code: 'secrets' }];
  const card = (id, n, rarity, family) => ({ id, set_id: 'SET1', number: n, name: id, rarity, family });
  const list = Array.from({ length: opts.n || 12 }, (_, i) => card(`K${i}`, i + 1, i % 2 ? 'rare' : 'commune', i % 3 ? 'lieu' : 'membre'));
  const own = new Set(['K0', 'K1', 'K2', 'K3']);
  openPlanche({ sets, cards: () => list, copiesOf: (id) => (own.has(id) ? [{ id }] : []), favs: new Set(['K0', 'K9']), wish: new Set(['K5']), pseudo: 'Ethan',
    setId: opts.setId ?? '__all__', filtres: { rarity: opts.rarity || '', family: '', vues: new Set(opts.vues || []) }, hasDupes: (id) => id === 'K1', onClose: () => { window.__ferme = true; } });
}, { MOD, opts });
const bilan = (p) => p.$eval('[data-pl="bilan"]', (e) => e.textContent);
const cases = (p) => p.$$eval('.a4-grid > .a4-cell, .a4-grid > .a4-miss', (x) => x.length);
const deborde = (p) => p.$$eval('.a4-page', (pg) => pg.some((x) => { const g = x.querySelector('.a4-grid'), f = x.querySelector('.a4-foot'); return f.getBoundingClientRect().bottom > x.getBoundingClientRect().bottom + 1 || g.scrollHeight > g.clientHeight + 1; }));
const choisir = (p, nom, val) => p.check(`input[name="${nom}"][value="${val}"]`, { force: true });

(async () => {
  const browser = await chromium.launch();

  const c = await openPage(browser, { page: 'cartes', fixture: F, scenario: SCENARIO, width: 1280, height: 900, hash: '#collection' });
  await sleep(500);
  await ouvrir(c);
  check(await c.$eval('#mc-pl', (d) => d.open), 'fenêtre ouverte, rien de généré');
  check(/^12 cartes · 1 page A4$/.test(await bilan(c)), `bilan de départ (${await bilan(c)})`);
  check(await c.$$eval('#mc-p-s option', (o) => o.map((x) => x.value).join()) === 'all,SET1', 'série : secrets absente');
  check(await c.$eval('#mc-p-h', (e) => e.value) === 'Collection de Ethan', 'titre par défaut');
  await choisir(c, 'mc-c', 'own');
  check(/^4 cartes/.test(await bilan(c)), 'possédées');
  await choisir(c, 'mc-c', 'miss');
  check(/^8 cartes/.test(await bilan(c)), 'manquantes');
  await choisir(c, 'mc-c', 'dup');
  check(/^1 carte · 1 page A4$/.test(await bilan(c)), 'doublons, au singulier');
  await choisir(c, 'mc-c', 'fav');
  check(/^1 carte/.test(await bilan(c)), 'favoris : seulement les possédés');
  await choisir(c, 'mc-c', 'wish');
  check(/^1 carte/.test(await bilan(c)), 'liste de souhaits');
  await choisir(c, 'mc-c', 'all');
  await c.selectOption('#mc-p-r', 'mythique');
  check(await bilan(c) === 'Aucune carte avec ces réglages' && await c.$eval('[data-pl="generer"]', (b) => b.disabled), 'aucune carte : génération impossible');
  await c.selectOption('#mc-p-r', 'rare');
  await c.selectOption('#mc-p-f', 'lieu');
  check(/^4 cartes · 1 page A4$/.test(await bilan(c)), `rareté et famille (${await bilan(c)})`);
  await c.click('[data-pl="annuler"]');
  await sleep(100); // l'événement close arrive après le clic
  check(await c.$('#mc-pl') === null && await c.evaluate(() => window.__ferme === true), 'Annuler : fenêtre retirée, page prévenue');

  await ouvrir(c, { setId: 'SET1', rarity: 'rare', vues: ['owned'] });
  check(await c.inputValue('#mc-p-s') === 'SET1' && await c.inputValue('#mc-p-r') === 'rare' && await c.$eval('input[name="mc-c"]:checked', (i) => i.value) === 'own', 'part de la série et des filtres de l’écran');
  await c.click('[data-pl="annuler"]');
  await ouvrir(c, { vues: ['owned', 'missing'] });
  check(await c.$eval('input[name="mc-c"]:checked', (i) => i.value) === 'all', 'Possédées et Manquantes ensemble : toutes');
  await c.click('[data-pl="annuler"]');

  await ouvrir(c, { n: 610 });
  check(/^610 cartes · 21 pages A4$/.test(await bilan(c)) && await c.$eval('[data-pl="alerte"]', (e) => !e.hidden), '21 pages : avertissement');
  await choisir(c, 'mc-c', 'own');
  check(await c.$eval('[data-pl="alerte"]', (e) => e.hidden), '1 page : plus d’avertissement');
  await choisir(c, 'mc-c', 'all');
  await choisir(c, 'mc-t', 'sombre');
  await choisir(c, 'mc-n', '16');
  await c.selectOption('#mc-p-t', 'rarete');
  await c.fill('#mc-p-h', 'Mes <b>cartes</b>');
  await c.uncheck('#mc-p-c');
  await Promise.all([c.waitForNavigation(), c.click('[data-pl="generer"]')]);
  const u = new URL(c.url());
  check(u.pathname.endsWith('collection-a4.html') && u.searchParams.get('par') === '16' && u.searchParams.get('tri') === 'rarete' && u.searchParams.get('theme') === 'sombre'
    && u.searchParams.get('compteur') === '0' && u.searchParams.get('titre') === 'Mes <b>cartes</b>', `réglages dans l’adresse (${u.search})`);
  await sleep(600);
  check(await c.$eval('.a4-title', (e) => e.textContent) === 'Mes <b>cartes</b>' && await c.$('.a4-title b') === null, 'titre échappé');
  check(await c.$('.a4-count') === null, 'compteur retiré');
  check(await c.$('.a4-page.a4-sombre.mc-g16') !== null, 'grille 16 et fond sombre');
  check(/Ta planche · 1 page A4/.test(await c.$eval('.a4-tools', (e) => e.innerText)), 'barre réduite : nombre de pages');
  await Promise.all([c.waitForNavigation(), c.click('.a4-tools a')]);
  check(new URL(c.url()).searchParams.get('planche') === '1', 'Changer les paramètres : retour avec les réglages');
  await sleep(600);
  check(await c.$('#mc-pl[open]') !== null, 'fenêtre rouverte toute seule');
  check(await c.$eval('input[name="mc-n"]:checked', (i) => i.value) === '16' && await c.inputValue('#mc-p-t') === 'rarete' && await c.inputValue('#mc-p-h') === 'Mes <b>cartes</b>', 'fenêtre rouverte avec les mêmes réglages');
  check(!/planche=1/.test(c.url()), 'adresse nettoyée');
  check(c.errs.length === 0, `aucune erreur (${c.errs.join(' | ') || 'rien'})`);
  await c.ctx.close();

  const p = await openPage(browser, { page: 'collection-a4', fixture: F, width: 1280, height: 1000, scenario: { bigCards: 40 } });
  await sleep(600);
  const base = p.url().replace(/\?.*$/, '');
  const va = async (q) => { await p.goto(`${base}?${q}`); await sleep(500); };
  const total = await cases(p);
  await va('set=all&par=9');
  check(await p.$$eval('.a4-page', (x) => x.length) === Math.ceil(total / 9) && await p.$('.a4-page.mc-g9') !== null, `9 par page (${total} cartes)`);
  check(await p.$$eval('.a4-page:first-child .a4-grid > *', (x) => x.length) === 9, '9 cases en page 1');
  check(!await deborde(p), '9 par page : rien ne déborde, en-tête compris');
  await va('set=all&par=16');
  check(!await deborde(p), '16 par page : rien ne déborde, en-tête compris');
  const w = await p.$eval('.a4-cell .hgc', (e) => e.getBoundingClientRect().width);
  check(w > 120, `16 par page : carte agrandie (${Math.round(w)} px)`);
  await va('set=all&par=7&tri=x&rarete=x&famille=<i>&cartes=x&compteur=1');
  check(await cases(p) === total && await p.$('.a4-page.mc-g7') === null && await p.$('.a4-count') !== null, 'valeurs fausses ignorées');
  await va('set=all&cartes=dup');
  const dup = await cases(p);
  check(dup >= 1 && await p.$$eval('.a4-miss', (x) => x.length) === 0, `doublons : aucune manquante (${dup})`);
  await va('set=all&cartes=fav');
  check(await cases(p) === 2, 'favoris possédés');
  await va('set=all&cartes=wish');
  check(await cases(p) === 1 && await p.$$eval('.a4-miss', (x) => x.length) === 1, 'liste de souhaits : C4, manquante');
  await va('set=all&cartes=miss');
  check(await p.$$eval('.a4-cell', (x) => x.length) === 0 && await cases(p) > 0, 'manquantes seulement');
  await va('set=all&rarete=legendaire&missing=1');
  check(await cases(p) < total, 'rareté lue');
  await va('set=all&tri=famille');
  check(await cases(p) === total, 'tri par famille : aucune carte perdue');
  await va('set=all&user=00000002-0000-4000-8000-000000000002&cartes=fav&titre=Faux');
  check(/Collection de Alice/.test(await p.$eval('.a4-head', (e) => e.innerText)) && await p.$('[data-opt="set"]') !== null, 'autre membre : titre et favoris ignorés, options gardées');
  check(p.errs.length === 0, `aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  const n = await openPage(browser, { page: 'cartes', fixture: F, scenario: SCENARIO, width: 360, height: 800, hash: '#collection' });
  await sleep(500);
  await ouvrir(n);
  check(await hscroll(n) === 0 && await n.$eval('#mc-pl', (d) => d.scrollWidth <= d.clientWidth + 1), '360 px : fenêtre sans défilement horizontal');
  await n.ctx.close();

  await browser.close();
  finish();
})();
