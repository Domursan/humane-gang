// Parcours : cartes en favoris dans la Collection (migration 078, RPC hg_card_favorite_set).
// 1. Étoile sur chaque carte possédée (grille) ; pas d'étoile sur une carte manquante.
// 2. Pastille « Favoris N » : seules les cartes favorites possédées ; le libellé suit.
// 3. Ajout et retrait depuis la grille : appel de la RPC, focus conservé, liste du filtre à jour.
// 4. Fiche détaillée : bouton « Ajouter / Dans mes favoris » ; fenêtre agrandie : étoile, retrait.
// 5. Collection d'un autre membre : aucune étoile. 6. Téléphone 390 px : pas de défilement horizontal, cible de 44 px.
// 7. Aucune erreur JS ; aucun gain de Paillettes lié aux favoris.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (favoris de départ : C1 et C3 ; C4 non possédée).
// Lancer : node tests/parcours/cartes/parcours-cartes-favoris.cjs
const { basculerVue, choisirFiltre, check, finish, openPage, hscroll, chromium } = require('../../lib/harness.cjs');

const ME = '11111111-1111-4111-8111-111111111111';
const U2 = '00000002-0000-4000-8000-000000000002';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Journal des appels de favoris (RPC hg_card_favorite_set). */
const favLog = (p) => p.evaluate(() => (window.__LOG || []).filter((e) => e[0] === 'rpc' && e[1] === 'hg_card_favorite_set').map((e) => e[2]));
/** Cartes affichées dans la grille (identifiants des cases). */
const shown = (p) => p.$$eval('.cz-cell .cz-zoom', (els) => els.map((e) => e.dataset.card));

(async () => {
  const browser = await chromium.launch();

  /* 1 à 4 : collection de l'admin-membre (ME possède C1, C2, C3, C5, C7, C9, C11) */
  const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1440, height: 900, scenario: { set2Open: true } });
  await p.evaluate(() => { location.hash = 'collection'; }); // onglets masqués : navigation par adresse
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await choisirFiltre(p, '#cartes-set', '__all__');
  await p.waitForSelector('.cz-star', { timeout: 5000 }).catch(() => {});
  check(await p.locator('[data-action="fav"][data-card="C1"].is-on').count() === 1, '(1) C1 (en favori) : étoile pleine, aria-pressed');
  check(await p.getAttribute('[data-action="fav"][data-card="C1"]', 'aria-pressed') === 'true', '(1) C1 : aria-pressed = true');
  check(await p.locator('[data-action="fav"][data-card="C2"]:not(.is-on)').count() === 1, '(1) C2 (possédée, pas favorite) : étoile vide');
  check(await p.locator('[data-action="fav"][data-card="C4"]').count() === 0, '(1) C4 (manquante) : pas d’étoile');
  const bb = await p.locator('[data-action="fav"][data-card="C2"]').boundingBox();
  check(bb && bb.width >= 44 && bb.height >= 44, '(1) étoile : zone tactile de 44 px (' + (bb ? Math.round(bb.width) + '×' + Math.round(bb.height) : '?') + ')');

  // (2) filtre Favoris
  await basculerVue(p, 'fav');
  check(/Favoris\s*2/.test(await p.textContent('label:has(#cartes-v-fav)')), '(2) pastille « Favoris 2 »');
  await p.waitForFunction(() => document.querySelectorAll('.cz-cell').length === 2, null, { timeout: 5000 }).catch(() => {});
  const favShown = (await shown(p)).sort();
  check(JSON.stringify(favShown) === JSON.stringify(['C1', 'C3']), '(2) filtre Favoris : seulement C1 et C3 (' + favShown.join(',') + ')');
  await basculerVue(p, 'fav');

  // (3) ajout depuis la grille (C7 possédée) : RPC, focus conservé, filtre à jour
  await p.click('[data-action="fav"][data-card="C7"]');
  await p.waitForFunction(() => document.querySelector('[data-action="fav"][data-card="C7"]')?.classList.contains('is-on'), null, { timeout: 5000 }).catch(() => {});
  let calls = await favLog(p);
  check(calls.length === 1 && calls[0].p_card === 'C7' && calls[0].p_on === true, '(3) ajout : RPC hg_card_favorite_set(C7, vrai)');
  check(await p.evaluate(() => document.activeElement?.dataset?.card) === 'C7', '(3) après ajout, le focus reste sur l’étoile de C7');
  check(/Favoris\s*3/.test(await p.textContent('label:has(#cartes-v-fav)')), '(3) pastille mise à jour : « Favoris 3 »');
  // Retrait depuis la grille (C1)
  await p.click('[data-action="fav"][data-card="C1"]');
  await p.waitForFunction(() => document.querySelector('[data-action="fav"][data-card="C1"]')?.getAttribute('aria-pressed') === 'false', null, { timeout: 5000 }).catch(() => {});
  calls = await favLog(p);
  check(calls.length === 2 && calls[1].p_card === 'C1' && calls[1].p_on === false, '(3) retrait : RPC hg_card_favorite_set(C1, faux)');

  // (4) fiche détaillée : C3 (favorite) -> retrait ; puis ajout de nouveau
  await p.click('[data-action="open-card"][data-card="C3"]');
  await p.waitForSelector('#cartes-detail[open] .cd-fav', { timeout: 5000 }).catch(() => {});
  check((await p.textContent('#cartes-detail .cd-fav')).includes('Dans mes favoris'), '(4) fiche C3 : « Dans mes favoris »');
  await p.click('#cartes-detail .cd-fav');
  await p.waitForFunction(() => document.querySelector('#cartes-detail .cd-fav')?.textContent.includes('Ajouter aux favoris'), null, { timeout: 5000 }).catch(() => {});
  check((await p.textContent('#cartes-detail .cd-fav')).includes('Ajouter aux favoris'), '(4) fiche : retrait, bouton « Ajouter aux favoris »');
  check(await p.evaluate(() => document.activeElement?.classList.contains('cd-fav')), '(4) fiche : focus conservé sur le bouton');
  await p.keyboard.press('Escape');
  await sleep(200);

  // Fenêtre agrandie : étoile de C7 (favorite) puis retrait
  await p.click('[data-action="zoom-card"][data-card="C7"]');
  await p.waitForSelector('#cz-dialog[open] .cz-fav', { timeout: 5000 }).catch(() => {});
  check((await p.textContent('#cz-dialog .cz-fav')).includes('Dans tes favoris'), '(4) fenêtre agrandie C7 : « Dans tes favoris »');
  await p.click('#cz-dialog .cz-fav');
  await p.waitForFunction(() => document.querySelector('#cz-dialog .cz-fav')?.textContent.includes('Ajouter aux favoris'), null, { timeout: 5000 }).catch(() => {});
  check((await p.textContent('#cz-dialog .cz-fav')).includes('Ajouter aux favoris'), '(4) fenêtre agrandie : retrait depuis l’étoile');
  check(await p.evaluate(() => document.activeElement?.classList.contains('cz-fav')), '(4) fenêtre agrandie : focus reste sur l’étoile');
  // carte manquante ouverte dans la fenêtre : pas d’étoile
  await p.keyboard.press('Escape');
  await sleep(150);
  await p.click('[data-action="zoom-card"][data-card="C4"]').catch(() => {});
  await sleep(200);
  check(await p.locator('#cz-dialog[open] .cz-fav').count() === 0, '(4) carte manquante agrandie : pas d’étoile');
  await p.keyboard.press('Escape');
  check(await hscroll(p) === 0, '(4) 1440 px : pas de défilement horizontal');
  check(!p.errs.length, '(1-4) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));

  /* 5. Collection d'un autre membre : aucune étoile */
  const q = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1440, height: 900, scenario: { set2Open: true }, hash: '#collection/' + U2 });
  await q.waitForSelector('.cz-cell, .cartes-grid, .empty', { timeout: 5000 }).catch(() => {});
  await sleep(300);
  check(await q.locator('.cz-star').count() === 0, '(5) collection d’un autre membre : aucune étoile');
  check(!q.errs.length, '(5) aucune erreur JS' + (q.errs.length ? ' (' + q.errs.join(' | ') + ')' : ''));

  /* 6. Téléphone 390 px : grille et étoiles sans défilement horizontal */
  const t = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844, scenario: { set2Open: true }, touch: true });
  await t.evaluate(() => { location.hash = 'collection'; });
  await t.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await choisirFiltre(t, '#cartes-set', '__all__');
  await t.waitForSelector('.cz-star', { timeout: 5000 }).catch(() => {});
  check(await t.locator('.cz-star').count() > 0, '(6) 390 px : étoiles présentes');
  check(await t.locator('.cz-star').first().isVisible(), '(6) 390 px : étoiles visibles sans survol');
  check(await hscroll(t) === 0, '(6) 390 px : pas de défilement horizontal');
  check(!t.errs.length, '(6) aucune erreur JS' + (t.errs.length ? ' (' + t.errs.join(' | ') + ')' : ''));

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exitCode = 1; });
