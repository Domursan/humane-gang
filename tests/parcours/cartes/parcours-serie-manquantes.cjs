// Parcours : « Il te manque N cartes pour finir la série » dans Mes cartes (idée 57, lot 6).
// 1. « Toutes les séries » : un rappel sous la série à 1-5 cartes de la fin, aucune lecture de hg_serie_manquantes.
// 2. Le rappel ouvre la série : encadré (titre, série, compteur), une seule lecture, nom et image des manquantes,
//    qui les a en double (le plus d'exemplaires d'abord), deux boutons « Demander à … » au plus.
// 3. Personne ne l'a en double : « Fabriquer » au tarif réel (pas pour une mythique) et « Me prévenir » (liste de souhaits).
// 4. « Demander à … » : l'éditeur d'offre s'ouvre avec ce membre et son exemplaire coché dans « Je demande ».
// 5. Plus de 5 manquantes, série complète : pas d'encadré, pas de lecture. 6. Chargement, erreur puis « Réessayer ».
// 7. Téléphone 390 px, thème clair : pas de défilement horizontal ; aucune erreur.
// Faux Supabase : fixtures/fake-sb-cartes.mjs. Première édition : il me manque C4, C6, C8, C10 (mythique), C12 (C11 Identité ne compte pas).
// Scénario « echanges » : Alice a C12 ×2 ; en plus, Bruno C12 ×3 et C4 ×2, Chloé C12 ×2.
// Lancer : node tests/parcours/cartes/parcours-serie-manquantes.cjs
const path = require('path');
const { SHOTS, check, finish, openPage, hscroll, sleep, chromium, choisirFiltre } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const EN_PLUS = [[701, 'C12', U(3)], [702, 'C12', U(3)], [703, 'C12', U(3)], [704, 'C12', U(4)], [705, 'C12', U(4)], [706, 'C4', U(3)], [707, 'C4', U(3)]]
  .map(([id, card_id, owner_id]) => ({ id, card_id, owner_id }));
const SCN = { echanges: true, set2Open: true, copiesEnPlus: EN_PLUS };
const ouvrir = (browser, scenario = SCN, o = {}) => openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, hash: '#collection', scenario, ...o });
const txt = (p, sel) => p.textContent(sel).then((t) => (t || '').replace(/\s+/g, ' ').trim());
const appels = (p) => p.evaluate(() => window.__LOG.filter((l) => l[0] === 'rpc' && l[1] === 'hg_serie_manquantes').map((l) => l[2].p_set));
const ligne = (p, nom) => p.$$eval('.mq-ligne', (x, nom) => { const l = x.find((e) => e.querySelector('.mq-txt strong')?.textContent.trim() === nom); return l ? { qui: l.querySelector('.mq-qui').textContent.trim(), boutons: [...l.querySelectorAll('.mq-act button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()) } : null; }, nom);
const attendreMq = (p) => p.waitForSelector('.mq-liste, .mq-erreur', { timeout: 5000 }).catch(() => {});

(async () => {
  const browser = await chromium.launch();
  let p = await ouvrir(browser);
  await p.waitForSelector('.cz-group', { timeout: 5000 });

  /* 1. Toutes les séries : le rappel */
  const rappels = await p.$$eval('.mq-rappel', (x) => x.map((b) => [b.closest('.cz-group-head').querySelector('.cz-group-title').textContent.trim(), b.textContent.trim(), b.dataset.set]));
  check(rappels.length === 1 && rappels[0][0] === 'Première édition' && rappels[0][1] === 'Il t’en manque 5 · qui les a en double ?', '(1) rappel sous « Première édition » seulement (' + JSON.stringify(rappels) + ')');
  check(!(await p.$('.mq')), '(1) pas d’encadré dans « Toutes les séries »');
  check((await appels(p)).length === 0, '(1) aucune lecture de hg_serie_manquantes');
  check(await p.$eval('.mq-rappel', (b) => b.getBoundingClientRect().height >= 44), '(1) rappel : cible 44 px');

  /* 2. Le rappel ouvre la série */
  await p.click('.mq-rappel');
  await attendreMq(p);
  check(await p.inputValue('#cartes-set') === 'SET1', '(2) série choisie : Première édition');
  check(await p.evaluate(() => document.activeElement?.id) === 'mq-h', '(2) le focus va sur le titre de l’encadré');
  check(await txt(p, '#mq-h') === 'Il te manque 5 cartes pour finir la série', '(2) titre (' + (await txt(p, '#mq-h')) + ')');
  check(await txt(p, '.mq-sous') === 'Première édition · 6 / 11', '(2) série et compteur (' + (await txt(p, '.mq-sous')) + ')');
  check(JSON.stringify(await appels(p)) === '["SET1"]', '(2) une seule lecture, pour la série choisie');
  const noms = await p.$$eval('.mq-ligne .mq-txt strong', (x) => x.map((e) => e.textContent.trim()));
  check(JSON.stringify(noms) === JSON.stringify(['Pompe à essence', 'Alice', 'Cocktail', 'Bruno', 'Tracteur']), '(2) cartes manquantes, par numéro, avec leur nom (' + noms.join(', ') + ')');
  check((await p.$$('.mq-ligne .mq-carte .hgc')).length === 5 && (await p.$$('.mq-ligne .hgc.is-missing')).length === 0, '(2) image de chaque carte manquante (pas « ??? »)');
  check(await p.$eval('.cz-group, .cartes-grid', () => true) && (await p.$$('.cartes-grid .hgc.is-missing')).length === 5, '(2) dans la grille, elles restent « ??? »');
  const c12 = await ligne(p, 'Tracteur');
  check(c12?.qui === 'En double chez Bruno, Alice et Chloé.', '(2) C12 : en double chez Bruno (3), Alice et Chloé (' + c12?.qui + ')');
  check(JSON.stringify(c12?.boutons) === '["Demander à Bruno","Demander à Alice"]', '(2) C12 : deux boutons au plus (' + c12?.boutons + ')');
  const c4 = await ligne(p, 'Pompe à essence');
  check(c4?.qui === 'En double chez Bruno.' && JSON.stringify(c4.boutons) === '["Demander à Bruno"]', '(2) C4 : un bouton');
  check(/Une offre par carte/.test(await txt(p, '.mq-pied')), '(2) pied : une offre par carte');
  await p.evaluate(() => document.querySelector('.mq').scrollIntoView());
  await p.screenshot({ path: path.join(SHOTS, 'serie-manquantes-1280.png') });

  /* 3. Personne ne l'a en double */
  const c6 = await ligne(p, 'Alice');
  check(c6?.qui === 'Personne ne l’a en double pour l’instant.', '(3) C6 : personne');
  check(c6?.boutons[0] === 'Fabriquer · 200' && c6?.boutons[1] === 'Me prévenir', '(3) C6 rare : « Fabriquer · 200 » et « Me prévenir » (' + c6?.boutons + ')');
  const c10 = await ligne(p, 'Bruno');
  check(JSON.stringify(c10?.boutons) === '["Me prévenir"]', '(3) C10 mythique : pas de fabrication (' + c10?.boutons + ')');
  // Un filtre ne relit pas la série
  await choisirFiltre(p, '#cartes-f-rarity', 'rare'); await sleep(150);
  check((await appels(p)).length === 1 && !!(await p.$('.mq-liste')), '(3) filtre de rareté : encadré gardé, pas de nouvelle lecture');
  await choisirFiltre(p, '#cartes-f-rarity', ''); await sleep(150);
  // Me prévenir
  await p.click('[data-action="mq-souhait"][data-card="C10"]');
  await sleep(250);
  check(await p.evaluate(() => window.__DB.hg_card_wishlist.some((w) => w.card_id === 'C10' && w.user_id === '11111111-1111-4111-8111-111111111111')), '(3) « Me prévenir » : C10 ajoutée à ma liste de souhaits');
  check(await p.getAttribute('[data-action="mq-souhait"][data-card="C10"]', 'aria-pressed') === 'true' && /Tu seras prévenu/.test(await txt(p, '[data-action="mq-souhait"][data-card="C10"]')), '(3) bouton pressé, « Tu seras prévenu »');
  check(await p.evaluate(() => document.activeElement?.dataset?.card) === 'C10', '(3) le focus reste sur le bouton');
  check((await appels(p)).length === 1, '(3) toujours une seule lecture');
  // Fabriquer : la fiche de la carte (et ses boutons de fabrication)
  await p.click('.mq-ligne [data-action="open-card"][data-card="C6"]');
  await p.waitForSelector('#cartes-detail[open]', { timeout: 3000 }).catch(() => {});
  check(await p.$eval('#cartes-detail', (d) => d.open) && !!(await p.$('#cartes-detail [data-action="craft"]')), '(3) « Fabriquer » ouvre la fiche avec la fabrication');
  await p.keyboard.press('Escape'); await sleep(150);

  /* 4. Demander à Bruno */
  await p.click('.mq-ligne [data-action="mq-demander"][data-card="C12"][data-to="' + U(3) + '"]');
  await p.waitForSelector('#trd-edit[open]', { timeout: 5000 }).catch(() => {});
  await sleep(250);
  check(await txt(p, '#trd-edit-title') === 'Proposer un échange à Bruno', '(4) éditeur d’offre avec Bruno');
  const want = await p.$$eval('#trd-grid-want button[data-side=want][aria-pressed=true]', (x) => x.map((b) => b.dataset.id));
  check(JSON.stringify(want) === '["701"]', '(4) son exemplaire libre de C12 coché dans « Je demande » (' + want + ')');
  check(await p.$eval('#trd-grid-want button[data-side=want]', (b) => b.dataset.id) === '701', '(4) en tête de « Ses cartes »');
  check(!p.errs.length, '(4) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* 5. Série complète, plus de 5 manquantes */
  p = await ouvrir(browser);
  await p.waitForSelector('.cz-group', { timeout: 5000 });
  await choisirFiltre(p, '#cartes-set', 'SET2'); await sleep(250);
  check(!(await p.$('.mq')) && (await appels(p)).length === 0, '(5) série complète (Saison 2) : ni encadré ni lecture');
  await p.ctx.close();
  p = await ouvrir(browser, { ...SCN, sansMesCopies: ['C1', 'C2'] });
  await p.waitForSelector('.cz-group', { timeout: 5000 });
  check(!(await p.$('.mq-rappel')), '(5) 7 manquantes : pas de rappel');
  await choisirFiltre(p, '#cartes-set', 'SET1'); await sleep(250);
  check(!(await p.$('.mq')) && (await appels(p)).length === 0, '(5) 7 manquantes : ni encadré ni lecture');
  await p.ctx.close();

  /* 6. Chargement, erreur, réessayer ; personne en double */
  p = await ouvrir(browser, { set2Open: true, mqDelay: 1500, mqFail: true });
  await p.waitForSelector('.cz-group', { timeout: 5000 });
  await p.click('.mq-rappel[data-set="SET1"]');
  await sleep(200);
  check(/Je cherche qui les a en double/.test(await txt(p, '.mq')) && (await p.$$('.mq-sk')).length === 2, '(6) chargement : message et deux blocs d’attente');
  await p.screenshot({ path: path.join(SHOTS, 'serie-manquantes-chargement.png') });
  await p.waitForSelector('.mq-erreur', { timeout: 5000 }).catch(() => {});
  check(/Impossible de savoir qui les a en double/.test(await txt(p, '.mq')), '(6) erreur : message');
  check(!!(await p.$('.mq-erreur [data-action="mq-reessayer"]')), '(6) erreur : bouton « Réessayer »');
  await p.evaluate(() => { window.__SCN.mqFail = false; window.__SCN.mqDelay = 0; });
  await p.click('[data-action="mq-reessayer"]');
  await attendreMq(p);
  await sleep(150);
  check(!!(await p.$('.mq-liste')) && (await p.$$('.mq-ligne.is-seule')).length === 5, '(6) réessayer : liste, personne ne les a en double');
  check(/Aucun membre ne les a en double/.test(await txt(p, '.mq-pied')), '(6) pied : « Me prévenir » expliqué');
  check((await appels(p)).length === 2, '(6) deux lectures (erreur, puis réessai)');
  // Saison 2, une carte manquante : « Il te manque 1 carte »
  await choisirFiltre(p, '#cartes-set', 'SET2'); await attendreMq(p); await sleep(150);
  check(await txt(p, '#mq-h') === 'Il te manque 1 carte pour finir la série', '(6) une carte : singulier');
  await p.ctx.close();

  /* 7. Téléphone, thème clair */
  p = await ouvrir(browser, SCN, { width: 390, height: 844, init: { content: "try{localStorage.setItem('hg_prefs',JSON.stringify({mode:'clair'}))}catch(e){}" } });
  await p.waitForSelector('.cz-group', { timeout: 5000 });
  await p.click('.mq-rappel');
  await attendreMq(p);
  check((await hscroll(p)) === 0, '(7) téléphone : pas de défilement horizontal');
  check(await p.$$eval('.mq-act button', (x) => x.every((b) => b.getBoundingClientRect().height >= 44)), '(7) boutons de 44 px au moins');
  await p.screenshot({ path: path.join(SHOTS, 'serie-manquantes-390.png') });
  check(!p.errs.length, '(7) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})().catch(async (e) => { console.error(e); process.exitCode = 1; process.exit(1); });
