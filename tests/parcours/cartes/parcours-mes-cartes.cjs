// Parcours : page Mes cartes (onglet Collection), refonte du 02.11.2026.
// 1. Ma chance et Atelier côte à côte au bureau, l'un sous l'autre au téléphone, repliés à chaque arrivée, sans mémoire.
// 2. Toutes les séries à l'arrivée, barre de progression, compte des séries complètes, recherche gardée, filtres fermés.
// 3. Filtres cumulables : série, rareté, famille, type, pastilles ; compteur du bouton, « Tout effacer ».
// 4. Recyclage : réglages, exclusions, bilan en direct, dernière confirmation, appel de hg_card_recycle, réglages retenus.
// 5. Téléphone : pas de défilement horizontal. 6. Aucune erreur JS.
// Faux Supabase : fixtures/fake-sb-cartes.mjs.
// Lancer : node tests/parcours/cartes/parcours-mes-cartes.cjs
const { check, finish, openPage, hscroll, chromium, choisirFiltre, basculerVue, sleep } = require('../../lib/harness.cjs');

const shown = (p) => p.$$eval('.cz-cell .cz-zoom', (els) => els.map((e) => e.dataset.card));
const ouvrir = (browser, width) => openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width, height: 900, scenario: { luck: 'beaucoup', c2: true, set2Open: true, bal: 900 } });
const collection = async (p) => {
  await p.evaluate(() => { location.hash = 'collection'; });
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await p.waitForSelector('[data-luck]', { timeout: 5000 }).catch(() => {});
  await p.waitForSelector('[data-atelier]', { timeout: 5000 }).catch(() => {});
};
const boite = (p, s) => p.$eval(s, (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, b: r.bottom }; });

(async () => {
  const browser = await chromium.launch();
  const p = await ouvrir(browser, 1280);
  await collection(p);

  /* 1. Ma chance et Atelier */
  check(await p.$eval('[data-luck]', (d) => !d.open), '(1) Ma chance repliée à l’arrivée');
  check(await p.$eval('[data-atelier]', (d) => !d.open), '(1) Atelier replié à l’arrivée');
  const [ch, at] = [await boite(p, '#cartes-luck-slot'), await boite(p, '#cartes-atelier')];
  check(Math.abs(ch.y - at.y) < 2 && at.x > ch.x, '(1) bureau : côte à côte');
  check(/réalisable/.test(await p.textContent('[data-atelier] .luck-pill')), '(1) pastille « réalisable » sur l’Atelier');
  await p.click('.luck-sum');
  const h = await p.$eval('[data-atelier]', (d) => d.getBoundingClientRect().height), hl = await p.$eval('[data-luck]', (d) => d.getBoundingClientRect().height);
  check(hl > h, '(1) ouvrir Ma chance n’étire pas l’Atelier');
  await p.evaluate(() => { location.hash = 'classement'; }); await sleep(200);
  await p.evaluate(() => { location.hash = 'collection'; }); await sleep(300);
  check(await p.$eval('[data-luck]', (d) => d.open), '(1) ouverte pendant la visite : gardée');
  check(await p.evaluate(() => localStorage.getItem('hg_luck_open')) === null, '(1) rien de retenu sur l’appareil');
  await p.reload(); await collection(p);
  check(await p.$eval('[data-luck]', (d) => !d.open), '(1) nouvelle arrivée : repliée');

  /* 2. Arrivée sur la collection */
  check(await p.inputValue('#cartes-set') === '__all__', '(2) « Toutes les séries » à l’arrivée');
  check(await p.locator('.cz-group').count() >= 2, '(2) groupes par série');
  check(/\d+ \/ \d+ cartes obtenues/.test(await p.textContent('.cartes-progress-label')), '(2) progression gardée');
  check(/0 \/ 3\s*séries complètes/.test((await p.textContent('.mc-series-ok')).trim()), `(2) compte des séries complètes (${(await p.textContent('.mc-series-ok')).trim()})`);
  check(await p.locator('#cartes-f-q').isVisible(), '(2) recherche visible');
  check(!(await p.locator('#cartes-filtres').isVisible()), '(2) filtres fermés à l’arrivée');
  check(await p.getAttribute('#cartes-filtres-btn', 'aria-expanded') === 'false', '(2) bouton Filtres : aria-expanded');

  /* 3. Filtres */
  const tout = (await shown(p)).length;
  await choisirFiltre(p, '#cartes-f-type', 'numerotee'); await sleep(150);
  check(/Filtres · 1/.test(await p.textContent('#cartes-filtres-btn')), '(3) bouton : 1 filtre actif');
  const nums = await p.evaluate(() => window.__DB.hg_cards.filter((c) => c.max_copies).map((c) => c.id));
  check((await shown(p)).every((id) => nums.includes(id)), '(3) type Numérotée : seulement des cartes numérotées');
  await choisirFiltre(p, '#cartes-f-type', 'simple'); await sleep(150);
  check((await shown(p)).every((id) => !nums.includes(id)), '(3) type Simple : aucune carte numérotée');
  await choisirFiltre(p, '#cartes-f-type', ''); await sleep(150);
  await basculerVue(p, 'owned'); await sleep(150);
  const poss = (await shown(p)).length;
  check(poss > 0 && poss < tout, '(3) Possédées');
  await basculerVue(p, 'fav'); await sleep(150);
  check(JSON.stringify((await shown(p)).sort()) === JSON.stringify(['C1', 'C3']), '(3) Possédées + Favoris : pastilles cumulées');
  check(/Filtres · 2/.test(await p.textContent('#cartes-filtres-btn')), '(3) bouton : 2 filtres actifs');
  check(/2\s*sur/.test(await p.textContent('.mc-actifs')), '(3) nombre de résultats affiché');
  await basculerVue(p, 'fav'); await basculerVue(p, 'missing'); await sleep(150);
  check((await shown(p)).length === tout, '(3) Possédées + Manquantes : tout voir');
  await p.click('[data-action="filtres-effacer"]'); await sleep(150);
  check(!/·/.test(await p.textContent('#cartes-filtres-btn')), '(3) Tout effacer');
  check(await p.locator('#cartes-filtres').isVisible(), '(3) le panneau reste ouvert');
  check(await p.evaluate(() => document.activeElement?.id) === 'cartes-filtres-btn', '(3) focus sur le bouton Filtres');
  await basculerVue(p, 'wish'); await sleep(150);
  const wish = await p.evaluate(() => window.__DB.hg_card_wishlist.map((w) => w.card_id));
  check((await shown(p)).every((id) => wish.includes(id)), '(3) Liste de souhaits');
  await basculerVue(p, 'wish'); await sleep(150);
  await p.fill('#cartes-f-q', 'zzz-rien'); await sleep(400);
  check(/Aucune carte/.test(await p.textContent('#cartes-p-collection')), '(3) aucun résultat');
  await p.fill('#cartes-f-q', ''); await sleep(400);

  /* 4. Recyclage */
  const ME = '11111111-1111-4111-8111-111111111111';
  // Carte en doublon de la fixture : exemplaires simples en plus, ni favori ni souhait
  const dup = await p.evaluate((me) => {
    const db = window.__DB, n = new Map();
    for (const c of db.hg_card_copies) if (c.owner_id === me && !c.shiny && !c.recycled_at) n.set(c.card_id, (n.get(c.card_id) || 0) + 1);
    const id = [...n].find(([, v]) => v > 1)?.[0];
    return { id, rarity: db.hg_cards.find((c) => c.id === id)?.rarity, n: n.get(id) };
  }, ME);
  await p.click('[data-action="mass"]');
  await p.waitForSelector('#cartes-recyclage[open] .mc-bilan', { timeout: 5000 });
  const bilan = () => p.textContent('#cartes-recyclage .mc-bilan');
  check(await p.isChecked('#cartes-recyclage input[value="num"]'), '(4) Numérotées protégées d’office');
  check(await p.isChecked('#cartes-recyclage input[value="fav"]'), '(4) Favoris protégés d’office');
  check(await p.isChecked('#cartes-recyclage input[value="wish"]'), '(4) Liste de souhaits protégée d’office');
  check(/\d+\s*cartes?environ/.test((await bilan()).replace(/\s+/g, '')) || /environ/.test(await bilan()), '(4) bilan de base, Paillettes rendues');
  check(await p.$('#cartes-recyclage .mc-bilan .paill') !== null || !/&lt;|<span/.test(await bilan()), '(4) pastille Paillettes non échappée');
  await p.click('#cartes-recyclage label:has(input[name="rec-garde"][value="3"])');
  const a3 = await bilan();
  await p.click('#cartes-recyclage label:has(input[name="rec-garde"][value="1"])');
  check(a3 !== await bilan(), '(4) nombre d’exemplaires gardés : bilan à jour');
  await p.click(`#cartes-recyclage label:has(input[name="rec-rar"][value="${dup.rarity}"])`);
  check(/Aucune carte à recycler/.test(await bilan()), '(4) exclusion par rareté : plus rien à recycler');
  check(await p.isDisabled('#cartes-recyclage [data-rec="suite"]'), '(4) bouton désactivé');
  await p.click(`#cartes-recyclage label:has(input[name="rec-rar"][value="${dup.rarity}"])`);
  await p.click('#cartes-recyclage [data-rec="suite"]');
  check(/^Recycler \d+ cartes? \?$/.test((await p.textContent('#mc-rec-t')).trim()), '(4) dernière confirmation');
  check(await p.evaluate(() => (window.__LOG || []).filter((e) => e[1] === 'hg_card_recycle').length) === 0, '(4) rien d’envoyé avant la confirmation');
  await p.click('#cartes-recyclage [data-rec="go"]');
  await p.waitForFunction(() => !document.querySelector('#cartes-recyclage').open, null, { timeout: 5000 }).catch(() => {});
  const call = await p.evaluate(() => (window.__LOG || []).find((e) => e[1] === 'hg_card_recycle'));
  check(call && call[2].p_copies.length >= 1, '(4) hg_card_recycle appelé');
  await p.click('[data-action="mass"]');
  await p.waitForSelector('#cartes-recyclage[open] .mc-bilan', { timeout: 5000 });
  await p.click('#cartes-recyclage label:has(input[name="rec-garde"][value="3"])');
  await p.click('#cartes-recyclage [data-rec="fermer"]');
  await p.click('[data-action="mass"]');
  await p.waitForSelector('#cartes-recyclage[open] .mc-bilan', { timeout: 5000 });
  check(await p.isChecked('#cartes-recyclage input[name="rec-garde"][value="3"]'), '(4) réglages retenus sur l’appareil');
  await p.click('#cartes-recyclage [data-rec="fermer"]');

  // Règles du calcul, sur une collection construite
  const r = await p.evaluate(async () => {
    const { planRecyclage } = await import('/assets/espaces/cartes/cartes-recyclage.js');
    const cp = (id, card, x = {}) => ({ id, card_id: card, shiny: false, locked_trade: null, ...x });
    const K = { A: { rarity: 'commune', family: 'objet', set_id: 'S' }, N: { rarity: 'commune', family: 'objet', set_id: 'S', max_copies: 10 }, I: { rarity: 'identite' }, U: { rarity: 'unique' }, F: { rarity: 'rare', family: 'lieu', set_id: 'T' } };
    const o = (x = {}) => ({ garde: 1, gardeSh: true, sh: false, num: true, fav: true, wish: true, rar: new Set(), fam: new Set(), ser: new Set(), ...x });
    const p0 = { favs: new Set(), wish: new Set(), vitrine: new Set(), value: () => 10 };
    const plan = (c, ox, px) => planRecyclage(c, (id) => K[id], o(ox), { ...p0, ...px }).ids.sort((a, b) => a - b);
    return {
      base: plan([cp(1, 'A'), cp(2, 'A'), cp(3, 'A')]),
      seule: plan([cp(1, 'A')]),
      garde2: plan([cp(1, 'A'), cp(2, 'A'), cp(3, 'A')], { garde: 2 }),
      sh1: plan([cp(1, 'A'), cp(2, 'A', { shiny: true })]),
      shSans: plan([cp(1, 'A'), cp(2, 'A', { shiny: true })], { gardeSh: false }),
      shDoublon: plan([cp(1, 'A', { shiny: true }), cp(2, 'A', { shiny: true })]),
      exclueSh: plan([cp(1, 'A'), cp(2, 'A', { shiny: true }), cp(3, 'A', { shiny: true })], { sh: true }),
      echange: plan([cp(1, 'A', { locked_trade: 't' }), cp(2, 'A')]),
      vitrine: plan([cp(1, 'A'), cp(2, 'A')], {}, { vitrine: new Set([2]) }),
      num: plan([cp(1, 'N'), cp(2, 'N')]),
      numLibre: plan([cp(1, 'N'), cp(2, 'N')], { num: false }),
      interdites: plan([cp(1, 'I'), cp(2, 'I'), cp(3, 'U'), cp(4, 'U')]),
      fav: plan([cp(1, 'A'), cp(2, 'A')], {}, { favs: new Set(['A']) }),
      wish: plan([cp(1, 'A'), cp(2, 'A')], {}, { wish: new Set(['A']) }),
      serie: plan([cp(1, 'F'), cp(2, 'F')], { ser: new Set(['T']) }),
      famille: plan([cp(1, 'F'), cp(2, 'F')], { fam: new Set(['lieu']) }),
    };
  });
  const eq = (a, b, m) => check(JSON.stringify(a) === JSON.stringify(b), `(4) ${m} (${JSON.stringify(a)})`);
  eq(r.base, [2, 3], 'garde le plus ancien'); eq(r.seule, [], 'jamais le dernier exemplaire'); eq(r.garde2, [3], 'garder 2');
  eq(r.sh1, [], 'simple et brillante : une de chaque'); eq(r.shSans, [1], 'sans la règle des brillantes : la brillante reste');
  eq(r.shDoublon, [2], 'brillantes en double'); eq(r.exclueSh, [], 'brillantes exclues');
  eq(r.echange, [2], 'exemplaire en échange gardé'); eq(r.vitrine, [1], 'exemplaire en vitrine gardé');
  eq(r.num, [], 'numérotée protégée'); eq(r.numLibre, [2], 'numérotée libérée'); eq(r.interdites, [], 'Identité et Uniques');
  eq(r.fav, [], 'favori protégé'); eq(r.wish, [], 'souhait protégé'); eq(r.serie, [], 'série exclue'); eq(r.famille, [], 'famille exclue');
  check(!p.errs.length, '(6) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));

  /* 5. Téléphone */
  const t = await ouvrir(browser, 390);
  await collection(t);
  const [ch2, at2] = [await boite(t, '#cartes-luck-slot'), await boite(t, '#cartes-atelier')];
  check(at2.y >= ch2.b, '(5) téléphone : l’un sous l’autre');
  await t.click('#cartes-filtres-btn');
  check(await hscroll(t) <= 0, '(5) filtres ouverts : pas de défilement horizontal');
  await t.click('[data-action="mass"]');
  await t.waitForSelector('#cartes-recyclage[open] .mc-bilan', { timeout: 5000 });
  check(await hscroll(t) <= 0, '(5) recyclage : pas de défilement horizontal');
  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
