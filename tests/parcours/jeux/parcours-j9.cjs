require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours J9 : Framed (/pages/jeux/jeux.html#framed) : films du ciné-club, affiches et tutos du site.
// L'onglet s'ouvre depuis l'adresse ; 1 image au départ, les images suivantes verrouillées ; suggestions limitées à la liste
// (formulation neutre) ; une erreur dévoile l'image 2 ; deviner à la 2e image ; fin : film dévoilé, gain, partage ; 360 px
// sans défilement horizontal ; onglets ARIA (flèches) ; aucune erreur JS.
// Admin Framed : une affiche du site remplit les 6 emplacements et le titre ; import d'une image ; ajout en masse des
// affiches manquantes (confirmation sur place, progression, une erreur n'arrête pas le lot).
// Faux Supabase : fixtures/fake-sb-jeux3.mjs (le stockage hg-jeux est noté dans le journal).
const fs = require('fs');
const path = require('path');
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

(async () => {
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#framed', width: 390, height: 900 });
  await p.waitForSelector('.jd-title', { timeout: 5000 }).catch(() => {});
  check((await p.locator('#jeux-tab-framed').getAttribute('aria-selected')) === 'true', 'onglet : Framed sélectionné depuis l’adresse #framed');
  check((await p.locator('#jeux-panel-framed .jd-title').innerText()).includes('Framed du gang #18'), 'titre : « Framed du gang #18 »');
  check((await p.locator('.jf-img img').count()) === 1, 'image : la 1re image est affichée');
  check((await p.locator('.jf-num:not([disabled])').count()) === 1 && (await p.locator('.jf-num[disabled]').count()) === 5, 'images : 1 ouverte, 5 verrouillées');
  check((await p.locator('.jd-pts-pill').innerText()).includes('10 pts possibles'), 'points : 10 possibles à la 1re image');
  check((await p.locator('.jd-note').innerText()).includes('Seules les 5 réponses de la liste'), 'note : seules les réponses de la liste sont proposées');
  check((await p.locator('.jd-sub').innerText()).includes('Devine l’image du jour'), 'en-tête : « Devine l’image du jour »');
  check((await p.locator('.jf-img img').getAttribute('alt')) === 'Image 1 du jour à deviner', 'alt : « Image 1 du jour à deviner »');
  check((await p.locator('.jd-hier').innerText()).includes('Le Dîner de cons'), 'hier : résumé de la manche précédente');
  // Suggestions
  await p.fill('#jf-input', 'In');
  await sleep(150);
  const opts = await p.locator('#jf-list [role="option"]').allInnerTexts();
  check(opts.length === 3 && opts.some((t) => t.includes('Interstellar')) && opts.some((t) => t.includes('vu le')), 'suggestions : 3 films contenant « In », avec la date de séance');
  check((await p.locator('#jf-input').getAttribute('aria-expanded')) === 'true', 'combobox : aria-expanded vrai pendant les suggestions');
  // Mauvaise réponse (clavier)
  await p.fill('#jf-input', 'Prest');
  await sleep(100);
  await p.keyboard.press('Enter');
  await p.click('#jf-form button[type="submit"]');
  await p.waitForFunction(() => document.querySelectorAll('.jf-num:not([disabled])').length === 2, null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('.jf-num:not([disabled])').count()) === 2, 'erreur : l’image 2 est dévoilée');
  check((await p.locator('.jd-try.is-miss').innerText()).includes('Le Prestige'), 'essais : « Le Prestige · Raté »');
  check((await p.locator('.jf-num.is-miss').count()) === 1, 'images : la 1re marquée ratée');
  check((await p.locator('.jf-num.fxj-saut').count()) === 1 && (await p.locator('.jd-combo.fxj-secoue').count()) === 1, 'effets : le numéro saute et le champ est secoué après un mauvais essai');
  check((await p.locator('.fxj-tampon').count()) === 0, 'effets : pas de tampon avant la fin');
  await sleep(100);
  check((await p.locator('.jf-img img').count()) === 2, 'effets : l’image suivante apparaît en fondu sur la précédente');
  await sleep(600);
  check((await p.locator('.jf-img img').count()) === 1, 'effets : l’ancienne image est retirée après le fondu');
  check((await p.locator('[data-act="passer"]').innerText()).includes('image 3'), 'bouton : « Passer · image 3 »');
  // Proposition hors liste refusée côté interface
  await p.fill('#jf-input', 'Titanic');
  await p.click('#jf-form button[type="submit"]');
  check((await p.locator('#jf-hint').innerText()).includes('liste'), 'saisie libre hors liste : message, aucun envoi');
  // Bonne réponse à la 2e image
  await p.fill('#jf-input', 'Nope');
  await sleep(100);
  await p.locator('#jf-list [role="option"]').first().click();
  await p.click('#jf-form button[type="submit"]');
  await p.waitForSelector('.jd-end', { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('.fxj-tampon') && /^\+10 /.test(document.querySelector('.jd-gain-v')?.textContent || ''), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.jd-end .fxj-tampon').count()) === 1 && (await p.locator('.jd-end.fxj-entree').count()) === 1, 'effets : trouvé, la carte de fin entre et reçoit son tampon');
  check((await p.locator('.fxj-gain').count()) === 0, 'effets : le gain n’est pas affiché en double');
  check((await p.locator('.jd-end').innerText()).includes('Trouvé en 2 essais'), 'fin : « Trouvé en 2 essais »');
  check((await p.locator('.jd-end-ans').innerText()).includes('Nope'), 'fin : le film est dévoilé');
  check((await p.locator('.jd-end').innerText()).includes('vu le 14 avril 2024'), 'fin : date de la séance');
  check((await p.locator('.jd-end').innerText()).includes('+10 ✦'), 'fin : gain affiché');
  check((await p.locator('.jf-num:not([disabled])').count()) === 6, 'fin : les 6 images sont visibles');
  // Retour sur la partie finie (redessin sans essai) : tampon posé, aucune animation
  await p.click('.jf-num[data-frame="0"]');
  check((await p.locator('.jd-end .fxj-tampon').count()) === 1 && (await p.locator('.jd-end.fxj-entree, .fxj-confettis').count()) === 0 && /^\+10 /.test(await p.locator('.jd-gain-v').textContent()), 'effets : partie déjà finie, tampon et gain posés sans animation');
  const calls = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_framed_guess');
  check(calls.length === 2 && calls[0][2].p_film === 'f-prestige' && calls[1][2].p_film === 'f-nope', 'appels : 2 essais envoyés avec les bons films');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/j9-framed.png', fullPage: true });
  check(p.errs.length === 0, 'aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // Onglets ARIA et 360 px
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#framed', width: 360, height: 800 });
  // barre d'onglets masquée (navigation par le menu) : la touche est envoyée à l'onglet, comme le clavier le ferait
  const fleche = (id, key) => p.evaluate(([i, k]) => document.getElementById(i).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })), [id, key]);
  await fleche('jeux-tab-framed', 'ArrowRight');
  await sleep(400);
  check((await p.locator('#jeux-tab-heardle').getAttribute('aria-selected')) === 'true' && (await p.evaluate(() => location.hash)) === '#heardle', 'onglets : flèche droite → Heardle, adresse à jour');
  await fleche('jeux-tab-heardle', 'ArrowLeft');
  await sleep(300);
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal');
  check((await p.locator('.site-header .nav-group[data-menu="jeux"] a.nav-item[href="/pages/jeux/jeux.html#tous"]').count()) === 1, 'menu : « Jeux » déroulant, avec « Tous les jeux » vers la page des jeux');
  await p.ctx.close();

  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#framed', scenario: { noRound: true } });
  check((await p.locator('#jeux-panel-framed').innerText()).includes('Pas d’image aujourd’hui'), 'sans manche : « Pas d’image aujourd’hui »');
  await p.ctx.close();

  /* ---------- Admin Framed : affiches du site ---------- */
  const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/espaces/jeux/donnees/framed-affiches.json'), 'utf8'));
  // Titres déjà présents dans le faux (tests/fixtures/fake-sb-jeux3.mjs) : les affiches correspondantes ne sont pas proposées en masse
  const TITRES_FILMS = ['nope', 'interstellar', 'inception', 'les inconnus, le film', 'le prestige'];
  const N = MAN.filter((e) => !TITRES_FILMS.includes(e.title.toLowerCase())).length;
  const saves = async (q) => (await log(q)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_framed_film_save');
  const uploads = async (q) => (await log(q)).filter((e) => e[0] === 'upload');
  const apercus = (q) => q.waitForFunction(() => document.querySelectorAll('.jm-slot img[src^="blob:"]').length === 6, null, { timeout: 20000 }).then(() => true, () => false);

  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-jeux3.mjs', width: 390, height: 844 });
  await adminSection(p, 'jeux/framed-heardle');
  await p.waitForSelector('.jm', { timeout: 5000 }).catch(() => {});
  check((await p.locator('.jm-chip[data-part="framed"]').innerText()).includes('films et affiches'), 'admin : libellé « Framed (films et affiches) »');
  check((await p.locator('[data-act="f-bulk"]').innerText()).trim() === `Ajouter les affiches du site (${N})`, `admin : bouton « Ajouter les affiches du site (${N}) »`);
  await p.click('[data-act="f-new"]');
  await p.click('[data-act="f-from-poster"]');
  check((await p.locator('#jm-pk-list .jm-pk-item').count()) === MAN.length, `sélecteur : les ${MAN.length} affiches et tutos du site`);
  await p.fill('#jm-pk-q', 'GAGNER DES paillettes');
  check((await p.locator('#jm-pk-list .jm-pk-item').count()) === 1, 'recherche : une entrée, sans tenir compte de la casse');
  await p.click('#jm-pk-list .jm-pk-item');
  check(await apercus(p), 'affiche : les 6 emplacements reçoivent une découpe (aperçus)');
  check((await p.inputValue('#jm-title')) === 'Gagner des Paillettes', 'affiche : titre rempli avec le titre de l’affiche');
  check((await p.locator('#jm-picker').count()) === 0, 'affiche : sélecteur refermé après le choix');
  check((await hscroll(p)) <= 0, 'admin 390 px : pas de défilement horizontal');
  await p.click('#jm-film-form button[type="submit"]');
  await p.waitForFunction(() => window.__LOG.some((e) => e[1] === 'hg_framed_film_save'), null, { timeout: 8000 }).catch(() => {});
  const sv = (await saves(p))[0];
  check(sv && sv[2].p.title === 'Gagner des Paillettes' && sv[2].p.frames.length === 6 && sv[2].p.frames.every((f, i) => f.endsWith(`/${i + 1}.webp`)), 'enregistrement : 6 images .webp et le titre');
  check((await uploads(p)).length === 6, 'enregistrement : 6 envois vers hg-jeux');
  check((await p.locator('#jm-f-films').innerText()).includes('(6)'), 'liste : le nouvel élément est compté');
  // Import d'une image (ici une image du site, à la place d'une affiche de film) : aucun titre proposé
  await p.click('[data-act="f-new"]');
  await p.click('[data-act="f-from-poster"]');
  await p.setInputFiles('#jm-pk-file', path.join(ROOT, 'assets/images/framed/les-jeux.webp'));
  check(await apercus(p), 'import : 6 découpes à partir d’un fichier');
  check((await p.inputValue('#jm-title')) === '', 'import : titre laissé vide');
  await p.click('[data-act="f-cancel"]');
  check(p.errs.length === 0, 'admin Framed (390 px) : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // Ajout en masse : confirmation sur place, un appel par affiche manquante, progression, rechargement
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-jeux3.mjs', width: 1280, height: 900 });
  await adminSection(p, 'jeux/framed-heardle');
  await p.waitForSelector('[data-act="f-bulk"]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-act="f-bulk"]');
  check((await p.locator('.jm-bulk').innerText()).includes(`Créer ${N}`), `ajout en masse : confirmation sur place « Créer ${N} »`);
  check((await saves(p)).length === 0, 'ajout en masse : rien n’est envoyé avant confirmation');
  await p.click('[data-act="f-bulk-no"]');
  check((await p.locator('.jm-bulk').count()) === 0, 'ajout en masse : « Annuler » referme la confirmation');
  await p.click('[data-act="f-bulk"]');
  await p.click('[data-act="f-bulk-go"]');
  await p.waitForSelector('#jm-bulk-status', { timeout: 5000 }).catch(() => {});
  check(/\d+ \/ \d+…/.test(await p.locator('#jm-bulk-status').innerText().catch(() => '')), 'ajout en masse : progression « n / N… »');
  await p.waitForFunction((n) => window.__LOG.filter((e) => e[1] === 'hg_framed_film_save').length >= n, N, { timeout: 240000 }).catch(() => {});
  await sleep(1200);
  const bulk = await saves(p);
  check(bulk.length === N, `ajout en masse : ${N} appels de hg_framed_film_save, un par affiche manquante`);
  check(bulk.every((e, i) => e[2].p.title === MAN.filter((m) => !TITRES_FILMS.includes(m.title.toLowerCase()))[i].title && e[2].p.active === true && e[2].p.year === null && e[2].p.frames.length === 6), 'ajout en masse : titre de l’affiche, 6 images, actif, champs vides');
  const up = await uploads(p);
  check(up.length === 6 * N && up.every((e) => /^framed\/[0-9a-f-]{36}\/[1-6]\.webp$/.test(e[1])), `ajout en masse : 6 images .webp par affiche (${6 * N} envois)`);
  check((await p.locator('#jm-f-films').innerText()).includes(`(${5 + N})`), `ajout en masse : liste rechargée, ${5 + N} éléments`);
  check((await p.locator('.toast').allInnerTexts()).some((t) => t.includes(`${N} films ajoutés`)), 'ajout en masse : message final');
  check((await p.locator('[data-act="f-bulk"]').count()) === 0 && (await p.locator('.jm').innerText()).includes('Toutes les affiches du site sont déjà dans la liste.'), 'ajout en masse : plus rien à ajouter');
  check(p.errs.length === 0, 'ajout en masse : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // Une erreur (titre refusé) n'arrête pas le lot : compté, images retirées, les autres sont créées
  p = await openPage(browser, { page: 'admin', fixture: 'fake-sb-jeux3.mjs', width: 1280, height: 900, scenario: { saveFailTitle: 'Les jeux' } });
  await adminSection(p, 'jeux/framed-heardle');
  await p.waitForSelector('[data-act="f-bulk"]', { timeout: 5000 }).catch(() => {});
  await p.click('[data-act="f-bulk"]');
  await p.click('[data-act="f-bulk-go"]');
  await p.waitForFunction((n) => window.__LOG.filter((e) => e[1] === 'hg_framed_film_save').length >= n, N, { timeout: 240000 }).catch(() => {});
  await sleep(1200);
  check((await saves(p)).length === N, 'erreur : le lot va jusqu’au bout (un appel par affiche)');
  check((await p.locator('.toast').allInnerTexts()).some((t) => t.includes(`${N - 1} ajoutés, 1 en échec`)), 'erreur : message « N-1 ajoutés, 1 en échec »');
  const retraits = (await log(p)).filter((e) => e[0] === 'remove');
  check(retraits.length === 1 && retraits[0][1].length === 6, 'erreur : les 6 images de l’affiche refusée sont retirées du stockage');
  check(p.errs.length === 0, 'erreur : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();
  await browser.close();
  finish();
})();
