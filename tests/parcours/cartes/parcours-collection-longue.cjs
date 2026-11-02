// Parcours : collection très longue (idée Q5). Faux Supabase fixtures/fake-sb-cartes.mjs, scénario bigCollection :
// 2 000 cartes en 4 séries + les 12 de la première série, 5 000 exemplaires.
// Vérifie : premier dessin rapide (performance.measure « hg-collection »), dessin par lots de 120 avec compteur exact,
// « Afficher 120 de plus » (focus sur la première carte ajoutée), chargement anticipé (le lot suivant arrive quand il
// reste 1,5 écran à défiler, pas avant), focus et défilement gardés par le chargement, remplissage de l'écran sur un grand
// écran, carte agrandie « Suivante » au-delà du lot dessiné, recherche sans accents, recyclage des doublons calculé sur
// toute la collection, pas de défilement horizontal à 360 px.
// Lancer : node tests/parcours/cartes/parcours-collection-longue.cjs
const { choisirFiltre, ROOT, check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');
/** Ouvre un onglet de Cartes par son adresse : les onglets internes sont masqués (nouvel en-tête). */
const goTab = (p, id) => p.evaluate((id) => { if (location.hash === '#' + id) location.hash = ''; location.hash = id; }, id);

const SCN = { bigCollection: true };
const cells = (p) => p.$$eval('#cartes-p-collection .cz-cell', (x) => x.length);
const dernierDessin = (p) => p.evaluate(() => { const m = performance.getEntriesByName('hg-collection'); return m.length ? m[m.length - 1].duration : -1; });

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, scenario: SCN });
  await goTab(p, 'collection');
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 10000 });
  await choisirFiltre(p, '#cartes-set', '__all__');
  await sleep(300);
  const ms = await dernierDessin(p);
  console.log(`       premier dessin « Toutes les séries » : ${ms.toFixed(1)} ms`);
  check(ms >= 0 && ms < 150, `premier dessin sous 150 ms (${ms.toFixed(1)} ms)`);
  const total = await p.evaluate(() => window.__DB.hg_cards.filter((c) => ['SET1', 'SETB0', 'SETB1', 'SETB2', 'SETB3'].includes(c.set_id)).length);
  check(await cells(p) === 120, 'premier lot : 120 cartes dessinées');
  const compteur = (await p.textContent('.cz-more-count')).replace(/\s+/g, ' ');
  check(new RegExp(`^120 cartes affichées sur ${String(total).replace(/\B(?=(\d{3})+$)/g, '.')}$`).test(compteur), `compteur exact (« ${compteur} », ${total} cartes)`);
  check(await p.locator('[data-action=more-cards]').count() === 1, 'bouton « Afficher 120 de plus »');

  // Afficher plus : 240 cartes, le focus va sur la première carte ajoutée
  // Clic par script : un vrai clic ferait défiler la page jusqu'au bouton, et l'approche du bas chargerait déjà le lot suivant.
  await p.evaluate(() => document.querySelector('[data-action=more-cards]').click());
  await sleep(200);
  check(await cells(p) === 240, 'après « Afficher plus » : 240 cartes');
  const focus = await p.evaluate(() => document.activeElement?.closest('.cz-cell') ? [...document.querySelectorAll('#cartes-p-collection .cz-cell')].indexOf(document.activeElement.closest('.cz-cell')) : -1);
  check(focus === 120, `focus sur la première carte ajoutée (case ${focus})`);

  // Carte agrandie : « Suivante » depuis la dernière carte dessinée va au-delà du lot
  const lastId = await p.$$eval('#cartes-p-collection .cz-cell .cz-zoom', (x) => x[x.length - 1].dataset.card);
  await p.evaluate((id) => document.querySelector(`.cz-zoom[data-card="${id}"]`).click(), lastId);
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 });
  const eb1 = await p.textContent('#cz-eyebrow');
  await p.evaluate(() => document.querySelector('#cz-dialog .cz-nav[data-cz=next]').click());
  await sleep(100);
  const eb2 = await p.textContent('#cz-eyebrow');
  check(/ 240 \/ /.test(eb1) && / 241 \/ /.test(eb2), `zoom : « Suivante » passe le lot (${eb1.trim()} → ${eb2.trim()})`);
  await p.keyboard.press('Escape');
  await sleep(150);

  // Recyclage en masse : calculé sur toute la collection, pas sur le lot
  const attendu = await p.evaluate(() => {
    const by = new Map();
    // La version simple et la version brillante d'une carte sont comptées à part (une de chaque est gardée).
    for (const c of window.__DB.hg_card_copies.filter((x) => x.owner_id === '11111111-1111-4111-8111-111111111111')) { const key = c.card_id + '|' + (c.shiny ? 1 : 0); by.set(key, (by.get(key) || []).concat(c)); }
    let n = 0;
    for (const [key, l] of by) { const k = window.__DB.hg_cards.find((x) => x.id === key.split('|')[0]); if (!k || k.rarity === 'identite' || k.rarity === 'unique') continue; n += Math.max(l.filter((x) => !x.locked_trade).length - 1, 0); }
    return n;
  });
  await p.click('[data-action="mass"]');
  await p.waitForSelector('#cartes-recyclage[open] .mc-bilan strong', { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => { for (const v of ['fav', 'wish', 'num']) { const e = document.querySelector(`#cartes-recyclage input[name="rec-opt"][value="${v}"]`); if (e.checked) e.click(); } });
  const massTxt = (await p.textContent('#cartes-recyclage .mc-bilan strong')).replace(/\s+/g, ' ');
  await p.click('#cartes-recyclage [data-rec="fermer"]');
  check(massTxt.replace(/[’'.  ]/g, '').includes(String(attendu) + 'cartes'), `doublons recyclables sur toute la collection (${attendu}) : « ${massTxt.trim().slice(0, 60)} »`);

  // Recherche sans accents : « raclette » (40 cartes) → tout est dessiné, compteur de résultats
  await p.fill('#cartes-f-q', 'RACLÉTTE');
  await sleep(500);
  const n = await cells(p);
  check(n === 40, `recherche « RACLÉTTE » : 40 cartes (${n})`);
  check(/40 résultats/.test(await p.textContent('#cartes-f-q-n')), 'compteur de résultats');
  check(await p.locator('.cz-more').count() === 0, 'sous 300 cartes : pas de lot, rien ne change');
  check(await p.evaluate(() => document.activeElement?.id === 'cartes-f-q'), 'le focus reste dans le champ de recherche');
  await p.fill('#cartes-f-q', '');
  await sleep(500);
  check(await cells(p) === 120, 'recherche vidée : retour au premier lot');

  // Filtres inchangés : rareté épique → toujours par lots si > 300, comptes cohérents
  await choisirFiltre(p, '#cartes-f-rarity', 'epique');
  await sleep(200);
  const epi = await p.$$eval('#cartes-p-collection .hgc', (x) => x.every((c) => c.className.includes('hgc-epique')));
  check(epi, 'filtre rareté : seulement des épiques');
  await choisirFiltre(p, '#cartes-f-rarity', '');
  await sleep(200);

  // Chargement anticipé (cartes-lots.js) : rien tant que la sentinelle est à plus de 2,5 écrans du haut de la fenêtre
  // (il reste plus de 1,5 écran à défiler), puis le lot suivant dès qu'elle y entre. Le focus et le défilement ne bougent pas.
  await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await sleep(300);
  const H = await p.evaluate(() => window.innerHeight);
  /** Place la sentinelle à y pixels du haut de la fenêtre (défilement instantané). */
  const placerSentinelle = (y) => p.evaluate((y) => {
    const s = document.querySelector('#cartes-p-collection .cz-sentinel');
    window.scrollBy({ top: s.getBoundingClientRect().top - y, behavior: 'instant' });
  }, y);
  const focusId = await p.evaluate(() => {
    const b = document.querySelectorAll('#cartes-p-collection .cz-zoom')[3];
    b.focus({ preventScroll: true });
    return b.dataset.card;
  });
  const focusSur = () => p.evaluate(() => document.activeElement?.dataset.card ?? null);
  check(await cells(p) === 120 && await p.locator('.cz-sentinel').count() === 1, 'avant défilement : un lot de 120, sentinelle présente');
  await placerSentinelle(3 * H);
  await sleep(400);
  check(await cells(p) === 120, `sentinelle à 3 écrans : pas de chargement anticipé (${await cells(p)})`);
  check(await focusSur() === focusId, 'focus inchangé quand rien ne se charge');
  await placerSentinelle(2 * H);
  const yAvant = await p.evaluate(() => window.scrollY);
  await sleep(400);
  const apres = await cells(p);
  check(apres > 120 && apres % 120 === 0, `sentinelle à 2 écrans (1,5 écran restant) : lot suivant dessiné (${apres} cartes, par lots de 120)`);
  check(await p.evaluate(() => window.scrollY) === yAvant, 'défilement inchangé par le lot chargé');
  check(await focusSur() === focusId, `focus gardé sur la carte ${focusId} après le lot`);
  check(!p.errs.length, 'chargement anticipé : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Remplissage : sur un grand écran (3000 px), les lots suivants se chargent seuls tant que l'écran n'est pas couvert.
  const g = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 3000, scenario: SCN });
  await goTab(g, 'collection');
  await g.waitForSelector('#cartes-set', { state: 'attached', timeout: 10000 });
  await sleep(900);
  const nG = await cells(g);
  check(nG > 120 && nG % 120 === 0 && await g.evaluate(() => window.scrollY) === 0,
    `grand écran : les lots se chargent sans défiler pour couvrir l’écran (${nG} cartes)`);
  check(!g.errs.length, 'grand écran : aucune erreur JS' + (g.errs.length ? ' (' + g.errs.join(' | ') + ')' : ''));
  await g.ctx.close();

  // Téléphone 360 px : pas de défilement horizontal
  const m = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 360, height: 780, scenario: SCN, mobile: true, dpr: 2 });
  await goTab(m, 'collection');
  await m.waitForSelector('#cartes-set', { state: 'attached', timeout: 10000 });
  await choisirFiltre(m, '#cartes-set', '__all__');
  await sleep(300);
  check(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '360 px : pas de défilement horizontal');
  await m.evaluate(() => document.querySelector('.cz-more')?.scrollIntoView());
  await sleep(200);
  await m.screenshot({ path: require('path').join(require('../../lib/harness.cjs').SHOTS, 'collection-longue-360.png') });
  check(!m.errs.length, '360 px : aucune erreur JS' + (m.errs.length ? ' (' + m.errs.join(' | ') + ')' : ''));
  await m.ctx.close();

  await browser.close();
  finish();
})();
