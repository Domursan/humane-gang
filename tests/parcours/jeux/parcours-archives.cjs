// Parcours : manches passées des jeux du jour, jouables « pour l'honneur » (idée 13, migration 213).
// Faux Supabase : fixtures/fake-archives.js (hg_jeux_archive, hg_jeux_honneur_etat, hg_jeux_honneur_essai), avec fake-jeux.js
// (Sutom), fake-sb-nj.mjs (Pays, Plat), fake-sb-grilles.mjs (Connexions), fake-sb-solo.mjs (Sudoku), fake-sb-jeux3.mjs
// (Framed, Heardle : scénario heardleCache) et fake-sb-duels-plateaux.mjs (Code du jour).
// Vérifie : liste « Grilles passées » sous le jeu (réponse cachée tant que pas jouée, Jouer / Revoir / Reprendre, Voir les
// 7 manches), grille d'images pour les jeux à image, manche passée ouverte depuis l'adresse (#sutom-AAAA-MM-JJ, #jour/AAAA-MM-JJ) :
// en-tête « pour l'honneur, sans Paillettes », lien « Grille du jour » à la place de la série, classement remplacé par une
// note, partie jouée par hg_jeux_honneur_essai (jamais l'essai du jour, jamais de série relue), liste mise à jour, retour à la
// grille du jour ; historique Heardle : titre caché et bouton Jouer ; 390 px sans défilement horizontal, boutons de 44 px.
// Lancer : node tests/parcours/jeux/parcours-archives.cjs
const { SHOTS, FIXTURES, check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');
const fs = require('fs');
const path = require('path');

const lire = (f) => fs.readFileSync(path.join(FIXTURES, f), 'utf8');
const SUTOM = { content: `${lire('fake-jeux.js')}\n${lire('fake-archives.js')}` };
const ARCH = 'fake-archives.js';
const jourZ = (j) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + j * 864e5));
const HIER = jourZ(-1), AVANT_HIER = jourZ(-2), J3 = jourZ(-3);
const texte = async (p, sel) => ((await p.locator(sel).first().innerText().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
const appels = (p) => p.evaluate(() => (window.__ARCH?.calls || []).map((c) => c[0]));
const mode = (m) => `try { localStorage.setItem('hg_prefs', JSON.stringify({ mode: '${m}' })); } catch {}`;
const avecMode = (init, m) => ({ content: `${mode(m)}\n${init.content}` });

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(SHOTS, { recursive: true });

  /* ---------- Sutom : liste des grilles passées ---------- */
  let p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 1280, height: 900, init: avecMode(SUTOM, 'sombre') });
  await p.waitForSelector('.jeux-zone .ar .jhh-ligne', { timeout: 8000 }).catch(() => {});
  check(await texte(p, '.ar .jhh-h') === 'Grilles passées', `Sutom : section « Grilles passées » (${await texte(p, '.ar .jhh-h')})`);
  check(await p.locator('.ar .jhh-ligne').count() === 5, 'Sutom : 5 grilles montrées au départ');
  check(/Voir les 7 manches/.test(await texte(p, '.ar .jhh-plus')), 'Sutom : bouton « Voir les 7 manches »');
  const l2 = p.locator('.ar .jhh-ligne').nth(1);
  check(await l2.evaluate((x) => x.classList.contains('is-ajouer')), 'Sutom : grille d’avant-hier « à jouer »');
  check(/\?\?\?/.test(await l2.innerText()) && /réponse cachée jusqu’à ta partie/.test(await l2.innerText()), 'Sutom : réponse cachée « ??? »');
  check(await l2.locator('a.ar-btn').getAttribute('href') === `#sutom-${AVANT_HIER}` && (await l2.locator('a.ar-btn').innerText()).trim() === 'Jouer', 'Sutom : bouton « Jouer » vers #sutom-AAAA-MM-JJ');
  check((await p.locator('.ar .jhh-ligne').nth(0).innerText()).includes('Réponse 40') && /Revoir/.test(await p.locator('.ar .jhh-ligne').nth(0).innerText()), 'Sutom : grille jouée hier, réponse et « Revoir »');
  check(/Reprendre/.test(await p.locator('.ar .jhh-ligne').nth(2).innerText()), 'Sutom : grille commencée « Reprendre »');
  check(!(await p.locator('.ar').innerText()).includes('PARAPLUIE'), 'Sutom : la réponse d’avant-hier n’est nulle part');
  check(await p.locator('.jeux-zone + .jeux-classement').isVisible(), 'Sutom : classement du jour visible pour la grille du jour');
  check(await p.locator('.su-head [data-sj]').count() === 1, 'Sutom : pastille de série sur la grille du jour');
  await p.locator('.ar').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(SHOTS, 'archives-sutom-liste-1280-sombre.png'), fullPage: false });
  await p.locator('.ar .jhh-plus').click();
  check(await p.locator('.ar .jhh-ligne').count() === 7, 'Sutom : « Voir les 7 manches » montre tout');

  /* ---------- Sutom : grille passée jouée pour l'honneur ---------- */
  await p.locator(`.ar a.ar-btn[href="#sutom-${AVANT_HIER}"]`).click();
  await p.waitForFunction(() => /pour l’honneur/.test(document.querySelector('.su-head p')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  const sous = await texte(p, '.su-head p');
  check(/^Grille n°\d+ · \S+ \d+ \S+ · pour l’honneur, sans Paillettes$/.test(sous), `Sutom passé : sous-titre « Grille n° · jour · pour l’honneur » (${sous})`);
  check(await p.locator('.su-head a.ar-retour[href="#sutom"]').count() === 1 && await p.locator('.su-head [data-sj]').count() === 0, 'Sutom passé : « Grille du jour » à la place de la série');
  check(await p.locator('.su [data-sjk]').count() === 0, 'Sutom passé : pas d’encart joker');
  check(await p.locator('.jeux-zone + .jeux-classement').isHidden(), 'Sutom passé : classement du jour caché');
  check(/pas de classement ni de Paillettes/.test(await texte(p, '.jeux-zone .ar-note')), 'Sutom passé : note à la place du classement');
  let c = await appels(p);
  check(c.includes('hg_jeux_honneur_etat'), 'Sutom passé : état lu par hg_jeux_honneur_etat');
  const seriesAvant = c.filter((x) => x === 'hg_jeux_series').length;
  await p.keyboard.type('ARAPLUIE');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.su-end', { timeout: 8000 }).catch(() => {});
  await sleep(2200); // finDePartie relirait les séries après 1,3 s : rien ne doit partir
  c = await appels(p);
  check(c.includes('hg_jeux_honneur_essai') && !c.includes('hg_sutom_guess'), 'Sutom passé : essai par hg_jeux_honneur_essai, jamais hg_sutom_guess');
  check(!c.some((x) => /^hg_jeux_fin/.test(x)), 'Sutom passé : aucune fin de jeu notée');
  check(c.filter((x) => x === 'hg_jeux_series').length === seriesAvant, 'Sutom passé : la série n’est pas relue (rien à nourrir)');
  check(/PARAPLUIE/.test(await texte(p, '.su-end')) && /pour l’honneur/.test(await texte(p, '.su-end')), 'Sutom passé : mot dévoilé à la fin, « pour l’honneur »');
  check(await p.locator('.su-end .fxj-tampon, .su-end [class*="tampon"]').count() === 0, 'Sutom passé : pas de tampon de points');
  await p.waitForFunction((d) => /PARAPLUIE/.test(document.querySelector(`.ar a[href="#sutom-${d}"]`)?.closest('li')?.textContent || ''), AVANT_HIER, { timeout: 4000 }).catch(() => {});
  check(/PARAPLUIE/.test(await p.locator(`.ar a[href="#sutom-${AVANT_HIER}"]`).locator('xpath=ancestor::li').innerText().catch(() => '')), 'Sutom passé : la liste montre la réponse après la partie');
  await p.locator('.su-head a.ar-retour').click();
  await p.waitForSelector('.su-head [data-sj]', { timeout: 6000 }).catch(() => {});
  check(await p.locator('.su-head [data-sj]').count() === 1 && await p.locator('.jeux-zone + .jeux-classement').isVisible() && await p.locator('.jeux-zone .ar-note').isHidden(), 'Retour à la grille du jour : série, classement, note retirée');
  await p.close();

  /* ---------- Sutom passé au téléphone, clair ---------- */
  p = await openPage(browser, { page: 'jeux', hash: `#sutom-${AVANT_HIER}`, width: 390, height: 844, init: avecMode(SUTOM, 'clair') });
  await p.waitForSelector('.su-head .ar-retour', { timeout: 8000 }).catch(() => {});
  await p.waitForSelector('.ar .jhh-ligne', { timeout: 6000 }).catch(() => {});
  check(await p.locator('.su-head .ar-retour').count() === 1, '390 : grille passée ouverte directement depuis l’adresse');
  check((await hscroll(p)) <= 0, '390 : pas de défilement horizontal');
  const bb = await p.locator('.ar .ar-btn').first().boundingBox();
  check(bb && bb.height >= 44, `390 : bouton Jouer / Revoir de 44 px au moins (${bb && Math.round(bb.height)})`);
  const rb = await p.locator('.su-head .ar-retour').boundingBox();
  check(rb && rb.height >= 44, `390 : « Grille du jour » de 44 px au moins (${rb && Math.round(rb.height)})`);
  await p.screenshot({ path: path.join(SHOTS, 'archives-sutom-passe-390-clair.png'), fullPage: false });
  await p.locator('.ar').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(SHOTS, 'archives-sutom-liste-390-clair.png'), fullPage: false });
  await p.close();

  /* ---------- Captures : liste en clair (1280), grille passée en sombre (390) ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 1280, height: 900, init: avecMode(SUTOM, 'clair') });
  await p.waitForSelector('.ar .jhh-ligne', { timeout: 8000 }).catch(() => {});
  await p.locator('.ar').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(SHOTS, 'archives-sutom-liste-1280-clair.png'), fullPage: false });
  await p.close();
  p = await openPage(browser, { page: 'jeux', hash: `#sutom-${AVANT_HIER}`, width: 390, height: 844, init: avecMode(SUTOM, 'sombre') });
  await p.waitForSelector('.su-head .ar-retour', { timeout: 8000 }).catch(() => {});
  check((await hscroll(p)) <= 0, '390 sombre : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'archives-sutom-passe-390-sombre.png'), fullPage: false });
  await p.close();

  /* ---------- Aucune grille passée ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 1280, height: 900, init: SUTOM, scenario: { archives: { vide: true } } });
  await p.waitForSelector('.ar', { timeout: 8000 }).catch(() => {});
  check(/Pas encore de grille passée : la première arrive demain/.test(await texte(p, '.ar')), 'Aucune grille passée : message « la première arrive demain »');
  await p.screenshot({ path: path.join(SHOTS, 'archives-sutom-vide-1280.png'), fullPage: false });
  await p.close();

  /* ---------- Pays du jour : liste, manche passée jouée ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-nj.mjs', hash: '#pays', width: 1280, height: 900, init: ARCH });
  await p.waitForSelector('.ar .jhh-ligne', { timeout: 8000 }).catch(() => {});
  check(await texte(p, '.ar .jhh-h') === 'Manches passées' && await p.locator(`.ar a[href="#pays-${AVANT_HIER}"]`).count() === 1, 'Pays : « Manches passées » et lien #pays-AAAA-MM-JJ');
  await p.goto(p.url().replace(/#.*$/, `#pays-${AVANT_HIER}`));
  await p.waitForFunction(() => /MANCHE PASSÉE/.test(document.querySelector('.nj-kicker')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  check(/MANCHE PASSÉE/.test(await texte(p, '.nj-kicker')) && /pour l’honneur/.test(await texte(p, '.nj-head-t')), 'Pays passé : en-tête « manche passée, pour l’honneur »');
  check(await p.locator('.nj-board').count() === 0 && await p.locator('.nj-head [data-sj]').count() === 0 && await p.locator('.nj-head .ar-retour[href="#pays"]').count() === 1, 'Pays passé : ni classement de la semaine, ni série ; lien « Manche du jour »');
  await p.locator('#nj-input').fill('Chili');
  await p.locator('#nj-input').dispatchEvent('input');
  await p.locator('[data-act="valider"]').click();
  await p.waitForSelector('.nj-fin', { timeout: 6000 }).catch(() => {});
  c = await appels(p);
  check(/Chili/.test(await texte(p, '.nj-fin')) && c.includes('hg_jeux_honneur_essai') && !c.includes('hg_nj_essai'), 'Pays passé : trouvé par hg_jeux_honneur_essai, jamais hg_nj_essai');
  check(!/crédités/.test(await texte(p, '.nj-fin')), 'Pays passé : pas de Paillettes créditées');
  await p.close();

  /* ---------- Plat du jour : grille d'images ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-nj.mjs', hash: '#plat', width: 1280, height: 900, init: avecMode({ content: lire(ARCH) }, 'sombre') });
  await p.waitForSelector('.ar-framed .geo-arch', { timeout: 8000 }).catch(() => {});
  check(await p.locator('.ar-framed .geo-arch').count() === 7, 'Plat : grille de 7 manches passées');
  check(await p.locator(`.ar-framed a.geo-arch[href="#plat-${AVANT_HIER}"]`).count() === 1 && /À jouer/.test(await p.locator(`.ar-framed a[href="#plat-${AVANT_HIER}"]`).innerText()), 'Plat : case « À jouer » vers #plat-AAAA-MM-JJ');
  check(!/Raclette/.test(await texte(p, '.ar-framed')), 'Plat : réponse pas jouée absente');
  await p.locator('.ar-framed').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(SHOTS, 'archives-plat-grille-1280-sombre.png'), fullPage: false });
  await p.close();

  /* ---------- Connexions : grille passée ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-grilles.mjs', hash: `#connexions-${AVANT_HIER}`, width: 1280, height: 900, init: ARCH });
  await p.waitForFunction(() => /GRILLE PASSÉE/.test(document.querySelector('.ng-kicker')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  check(/GRILLE PASSÉE/.test(await texte(p, '.ng-kicker')) && await p.locator('.ng-board').count() === 0 && await p.locator('.ng-head .ar-retour[href="#connexions"]').count() === 1, 'Connexions passée : en-tête, pas de classement, lien « Grille du jour »');
  check(!/Jusqu’à/.test(await texte(p, '.ng-pills')), 'Connexions passée : pas de pastille de Paillettes');
  await p.waitForSelector('.ar .jhh-ligne', { timeout: 6000 }).catch(() => {});
  check(await texte(p, '.ar .jhh-h') === 'Grilles passées', 'Connexions : liste « Grilles passées »');
  await p.close();

  /* ---------- Sudoku : grille passée ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: `#sudoku-${AVANT_HIER}`, width: 1280, height: 900, init: ARCH });
  await p.waitForFunction(() => /grille passée/.test(document.querySelector('.sol-eyebrow')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  check(/pour l’honneur/.test(await texte(p, '#su-sub')) && await p.locator('#su-retour').isVisible() && await p.locator('#su-board-carte').isHidden(), 'Sudoku passé : sous-titre, « Grille du jour », classement caché');
  check(await p.locator('.sol-pills [data-sj]').isHidden(), 'Sudoku passé : pastille de série cachée');
  await p.close();

  /* ---------- Framed : grille d'images, manche passée ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#framed', width: 1280, height: 900, init: ARCH });
  await p.waitForSelector('.ar-framed .geo-arch', { timeout: 8000 }).catch(() => {});
  check(await p.locator('.ar-framed .geo-arch').count() === 7, 'Framed : grille des manches passées');
  await p.locator(`.ar-framed a[href="#framed-${J3}"]`).click();
  await p.waitForFunction(() => /pour l’honneur/.test(document.querySelector('.jd-sub')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  check(/pour l’honneur/.test(await texte(p, '.jd-sub')) && await p.locator('.jd-board-box').count() === 0 && await p.locator('.jd-head .ar-retour').count() === 1, 'Framed passé : en-tête, pas de classement, lien « Image du jour »');
  await p.close();

  /* ---------- Heardle : titre caché dans l'historique ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#heardle', width: 1280, height: 900, scenario: { heardleCache: true }, init: ARCH });
  await p.waitForSelector('.jhh-liste', { timeout: 8000 }).catch(() => {});
  await p.locator('[data-hist="tout"]').click().catch(() => {});
  const cachee = p.locator('.jhh-ligne.is-ajouer');
  check(await cachee.count() === 1 && /\?\?\?/.test(await cachee.innerText()) && !/Morceau 21/.test(await texte(p, '.jhh')), 'Heardle : manche pas jouée sans titre « ??? »');
  check(await cachee.locator('a.ar-btn').innerText().then((t) => t.trim()) === 'Jouer' && /^#heardle-\d{4}-\d{2}-\d{2}$/.test(await cachee.locator('a.ar-btn').getAttribute('href')), 'Heardle : bouton « Jouer » vers #heardle-AAAA-MM-JJ');
  check(await cachee.locator('button.jhh-tete').count() === 0, 'Heardle : la ligne cachée ne s’ouvre pas');
  await cachee.scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(SHOTS, 'archives-heardle-cache-1280.png'), fullPage: false });
  await p.close();

  /* ---------- Code du jour (page Duels) ---------- */
  const duels = { content: `window.__DUELS = { possibles: [], appels: [], etat: null, rpc: {} };
    window.__DUELS.rpc.hg_duel_jour = () => ({ jour: '${jourZ(0)}', essais: [], trouve_en: null, fini: false, serie: 0, secret: null, classement: [], trouveurs: 0, gain: null });
    ${lire(ARCH)}` };
  p = await openPage(browser, { page: 'duels', hash: '#jour', fixture: 'fake-sb-duels-plateaux.mjs', width: 1280, height: 900, init: duels });
  await p.waitForSelector('.ar .jhh-ligne', { timeout: 8000 }).catch(() => {});
  check(await p.locator(`.ar a[href="#jour/${AVANT_HIER}"]`).count() === 1, 'Code du jour : liste des codes passés, lien #jour/AAAA-MM-JJ');
  check(/Rouge · Vert · Bleu · Jaune/.test(await p.locator('.ar .jhh-ligne').nth(0).innerText()), `Code du jour : code joué écrit en couleurs (${(await p.locator('.ar .jhh-titre b').first().innerText())})`);
  await p.locator(`.ar a[href="#jour/${AVANT_HIER}"]`).click();
  await p.waitForFunction(() => /pour l’honneur/.test(document.querySelector('.duels-jour-expl')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  check(/pour l’honneur/.test(await texte(p, '.duels-jour-expl')) && await p.locator('.duels-jour-tete [data-sj]').count() === 0 && await p.locator('.duels-jour-classement').count() === 0 && await p.locator('.duels-jour .ar-note').count() === 1, 'Code passé : en-tête, ni série ni classement, note');
  for (const ch of 'royg') await p.locator(`[data-act="pal"][data-c="${ch}"]`).click();
  await p.locator('[data-act="valider"]').click();
  await p.waitForSelector('.duels-jour-bilan', { timeout: 6000 }).catch(() => {});
  await sleep(2500);
  c = await appels(p);
  check(c.includes('hg_jeux_honneur_essai') && !c.includes('hg_duel_jour_essayer'), 'Code passé : essai par hg_jeux_honneur_essai, jamais l’essai du jour');
  check(/pour l’honneur/.test(await texte(p, '.duels-jour-bilan')) && await p.locator('.duels-jour-bilan .fxj-tampon, .duels-jour-bilan [class*="tampon"]').count() === 0, 'Code passé : bilan sans tampon de points');
  await p.screenshot({ path: path.join(SHOTS, 'archives-code-passe-1280.png'), fullPage: false });
  await p.close();

  await browser.close();
  finish();
})();
