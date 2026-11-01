// Parcours : modèles de réponse de l'Assistance (idée 99, migration 194).
// (a) La Poste : tuile après Assistance, page, liste, titres échappés, sous-page ouverte par l'adresse.
// (b) tiroir : compteurs, longueurs, champs obligatoires, création, modification ; suppression avec confirmation, focus rendu.
// (c) états vide et erreur, Réessayer.
// (d) menu au clavier : ouverture, flèches en boucle, Début, Fin, Échap rend le focus au bouton, Tab, clic dehors.
// (e) choix : {prenom} remplacé partout par le pseudo, texte modifiable, rien d'envoyé seul, texte déjà écrit gardé, note interne, envoi à la main.
// (f) droits : Staff « support » voit et édite ; Staff sans « support » n'a ni tuile ni page ; pas de menu Modèles dans la Messagerie.
// (g) 390 px au doigt : menu dans l'écran, pas de défilement horizontal, cibles de 44 px, textes de 12 px, champs de 16 px.
// Faux Supabase (fixtures/fake-sb.mjs). Migration : vérifiée sur PGlite à part. Lancer : node tests/parcours/admin/parcours-admin-modeles-reponse.cjs
const fs = require('fs');
const path = require('path');
const { ROOT, check, finish, openPage, hscroll, adminSection, log, sleep, chromium } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const MODELES = [
  { id: 1, titre: 'Mot de passe oublié', categorie: 'Connexion', texte: 'Salut {prenom}, passe par la page de connexion.' },
  { id: 2, titre: 'Bug bien reçu', categorie: 'Bug', texte: 'Merci {prenom}, à bientôt {prenom} !' },
  { id: 3, titre: '<img src=x onerror=window.__xss=1>', categorie: '<b>x</b>', texte: 'Bonjour.' },
  { id: 4, titre: 'Sans rangement', categorie: '', texte: 'Texte seul.' },
];
const SUPPORT = [
  { id: 'sup-1', user_id: U(2), pseudo: 'Alice', subject: 'Paillettes non créditées', message: 'Rien reçu.', contact: null, status: 'ouverte', created_at: new Date(Date.now() - 6e5).toISOString() },
  { id: 'sup-2', user_id: null, pseudo: 'Ca$&sse', subject: 'Accès', message: 'Page vide.', contact: null, status: 'ouverte', created_at: new Date(Date.now() - 12e5).toISOString() },
];
const SCN = { support: SUPPORT, modelesReponse: MODELES };
const db = (p) => p.evaluate(() => window.__DB.hg_modeles_reponse.map((r) => ({ ...r })));
const actif = (p) => p.evaluate(() => { const e = document.activeElement; return e?.matches('.ui-tpl-btn') ? 'bouton' : e?.matches('.ui-textarea') ? 'zone' : e?.matches('.ui-tpl-item') ? e.firstChild.textContent : e?.tagName; });
const demande = async (p, id) => { await p.evaluate((i) => { location.hash = `#poste/assistance/${i}`; }, id); await p.waitForSelector('.ui-tpl-btn', { timeout: 6000 }); };
const ouvrirMenu = async (p) => { await p.click('.ui-tpl-btn'); await p.waitForSelector('.ui-tpl-menu'); };
const zone = (p) => p.inputValue('#support-root .ui-textarea');
const nbReponses = async (p) => (await log(p)).filter((l) => l[0] === 'insert' && l[1] === 'hg_support_replies').length;

(async () => {
  // admin.js : une sous-section optionnelle n'est chargée qu'une fois
  const optionnels = [...fs.readFileSync(path.join(ROOT, 'assets/espaces/admin/admin.js'), 'utf8').matchAll(/{ sub: '([^']+)', url:/g)].map((m) => m[1]);
  check(optionnels.includes('modeles-reponse') && new Set(optionnels).size === optionnels.length, `admin.js : aucune sous-section en double (${optionnels.length})`);

  const browser = await chromium.launch();
  try {
    /* ---------- (a) La Poste, page ---------- */
    let p = await openPage(browser, { page: 'admin', scenario: SCN });
    await p.evaluate(() => { location.hash = '#poste'; });
    await p.waitForSelector('.lieu-tile[data-sub="modeles-reponse"]', { timeout: 6000 });
    check(await p.$eval('.lieu-tile[data-sub="assistance"]', (e) => e.nextElementSibling?.dataset.sub) === 'modeles-reponse', '(a) tuile placée juste après Assistance');
    check(/Réponses types de l’Assistance/.test(await p.textContent('.lieu-tile[data-sub="modeles-reponse"]')), '(a) ligne d’aide de la tuile');
    check((await p.$eval('.lieu-tile[data-sub="modeles-reponse"] svg', (s) => s.innerHTML)).includes('M5 4h14v16H5z'), '(a) icône de la tuile');
    await adminSection(p, 'poste/modeles-reponse');
    await p.waitForSelector('.tpl-liste .bt-item');
    check((await p.textContent('#zone-title')).trim() === 'Modèles de réponse', '(a) titre de la page');
    check((await p.locator('.tpl-liste .bt-item').count()) === 4, '(a) quatre modèles listés');
    check(/Le Staff les choisit/.test(await p.textContent('#modeles-reponse-root')) && (await p.textContent('#modeles-reponse-root code')) === '{prenom}', '(a) texte d’explication');
    check(await p.evaluate(() => getComputedStyle(document.querySelector('.tpl-liste')).position === 'static' && document.querySelector('.tpl-liste').offsetWidth <= 720), '(a) liste statique de 720 px au plus, après la feuille du bot');
    check(!(await p.evaluate(() => window.__xss)) && !(await p.locator('#modeles-reponse-root img').count()) && (await p.locator('.tpl-liste .bt-item-label').nth(2).textContent()).includes('<img'), '(a) titre échappé');

    /* ---------- (b) Tiroir ---------- */
    await p.locator('.tpl-liste .bt-item').first().click();
    await p.waitForSelector('dialog.ui-drawer[open]');
    const tir = 'dialog.ui-drawer[open]';
    check((await p.textContent(`${tir} .ui-drawer-title`)).trim() === 'Mot de passe oublié', '(b) tiroir : titre');
    check(await p.locator('.tpl-liste .bt-item').first().getAttribute('aria-current') === 'true', '(b) ligne ouverte marquée');
    check(await p.getAttribute('#tpl-titre', 'maxlength') === '60' && await p.getAttribute('#tpl-cat', 'maxlength') === '30' && await p.getAttribute('#tpl-texte', 'maxlength') === '2000', '(b) longueurs 60, 30, 2000');
    const compteurs = () => p.$$eval(`${tir} .bt-count`, (c) => c.map((x) => x.textContent));
    check((await compteurs()).join() === `19 / 60,${MODELES[0].texte.length} / 2000`, '(b) compteurs ' + (await compteurs()).join());
    await p.fill('#tpl-texte', 'z'.repeat(2000));
    await p.locator('#tpl-texte').press('End');
    await p.keyboard.type('trop');
    check((await p.inputValue('#tpl-texte')).length === 2000 && (await compteurs())[1] === '2000 / 2000', '(b) texte bloqué à 2000');
    await p.fill('#tpl-titre', '   ');
    await p.click(`${tir} [data-drawer-submit]`);
    await sleep(150);
    check((await p.locator(tir).count()) === 1 && (await db(p))[0].titre === 'Mot de passe oublié', '(b) nom vide refusé, tiroir ouvert');
    await p.fill('#tpl-titre', 'Mot de passe');
    await p.fill('#tpl-texte', '  \n ');
    await p.click(`${tir} [data-drawer-submit]`);
    await sleep(150);
    check((await p.locator(tir).count()) === 1 && (await db(p))[0].titre === 'Mot de passe oublié', '(b) texte vide refusé');
    await p.fill('#tpl-texte', '  Nouveau texte {prenom}  ');
    await p.fill('#tpl-cat', 'Compte');
    await p.click(`${tir} [data-drawer-submit]`);
    await p.waitForSelector(tir, { state: 'detached' });
    await sleep(200);
    const m1 = (await db(p)).find((m) => m.id === 1);
    check(m1.titre === 'Mot de passe' && m1.categorie === 'Compte' && m1.texte === 'Nouveau texte {prenom}', '(b) modification écrite, espaces retirés');
    check(/Mot de passe/.test(await p.locator('.tpl-liste .bt-item').first().textContent()), '(b) liste relue');
    check(await p.evaluate(() => document.activeElement?.dataset.i) === '0', '(b) focus rendu à la ligne');
    check(!(await p.locator('.tpl-liste [aria-current]').count()), '(b) marque retirée');

    await p.click('[data-tpl-nouveau]');
    await p.waitForSelector(tir);
    check((await p.textContent(`${tir} [data-drawer-submit]`)).trim() === 'Créer' && !(await p.locator(`${tir} [data-tpl-suppr]`).count()), '(b) nouveau modèle : Créer, pas de suppression');
    await p.fill('#tpl-titre', 'Fin de semaine');
    await p.fill('#tpl-texte', 'Bon week-end {prenom}');
    await p.click(`${tir} [data-drawer-submit]`);
    await p.waitForSelector(tir, { state: 'detached' });
    await sleep(200);
    const cree = (await db(p)).find((m) => m.titre === 'Fin de semaine');
    check(cree && cree.id === 5 && cree.categorie === '' && cree.texte === 'Bon week-end {prenom}', '(b) création écrite');
    check((await p.locator('.tpl-liste .bt-item').count()) === 5, '(b) nouveau modèle listé');

    await p.locator('.tpl-liste .bt-item', { hasText: 'Fin de semaine' }).click();
    await p.waitForSelector(tir);
    await p.click('[data-tpl-suppr]');
    await p.waitForSelector('dialog.hg-dialog[open]');
    check(/disparaîtra du menu/.test(await p.textContent('dialog.hg-dialog[open]')), '(b) confirmation de suppression');
    await p.keyboard.press('Escape');
    await sleep(200);
    check((await db(p)).length === 5 && (await p.locator(tir).count()) === 1, '(b) Échap : rien de supprimé, tiroir ouvert');
    await p.click('[data-tpl-suppr]');
    await p.locator('dialog.hg-dialog[open] button', { hasText: 'Supprimer' }).click();
    await p.waitForSelector(tir, { state: 'detached' });
    await sleep(200);
    check((await db(p)).length === 4 && (await p.locator('.tpl-liste .bt-item').count()) === 4, '(b) suppression confirmée');
    check(await p.evaluate(() => document.activeElement?.matches('[data-tpl-nouveau]')), '(b) focus sur « Nouveau modèle »');
    check(!p.errs.length, '(a-b) aucune erreur JS ' + p.errs.slice(0, 3).join(' | '));
    await p.ctx.close();

    /* ---------- (c) Vide, erreur ---------- */
    p = await openPage(browser, { page: 'admin', scenario: { ...SCN, modelesReponse: [] } });
    await adminSection(p, 'poste/modeles-reponse');
    await p.waitForSelector('#modeles-reponse-root .empty');
    check(/Aucun modèle pour l’instant\. Crée le premier/.test(await p.textContent('#modeles-reponse-root .empty')) && (await p.isVisible('[data-tpl-nouveau]')), '(c) vide : message et bouton');
    await demande(p, 'sup-1');
    await ouvrirMenu(p);
    check(/Aucun modèle pour l’instant/.test(await p.textContent('.ui-tpl-menu')) && !(await p.locator('.ui-tpl-item').count()), '(c) menu vide : message');
    await p.keyboard.press('Escape');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', scenario: { ...SCN, modelesReponseEchec: true } });
    await adminSection(p, 'poste/modeles-reponse');
    await p.waitForSelector('[data-tpl-reessayer]');
    check(/Impossible de charger/.test(await p.textContent('#modeles-reponse-root')), '(c) erreur affichée');
    await demande(p, 'sup-1');
    await p.click('.ui-tpl-btn');
    await sleep(200);
    check(!(await p.locator('.ui-tpl-menu').count()) && await p.getAttribute('.ui-tpl-btn', 'aria-expanded') === 'false', '(c) lecture impossible : menu fermé');
    await adminSection(p, 'poste/modeles-reponse');
    await p.evaluate(async () => { window.__SCN.modelesReponseEchec = false; });
    await p.click('[data-tpl-reessayer]');
    await p.waitForSelector('.tpl-liste .bt-item');
    check(true, '(c) Réessayer recharge');
    await p.ctx.close();

    /* ---------- (d) Menu au clavier ---------- */
    p = await openPage(browser, { page: 'admin', width: 1440, scenario: SCN });
    await demande(p, 'sup-1');
    check(await p.$eval('.ui-box-tools', (t) => t.firstElementChild.matches('.ui-tpl')), '(d) bouton en tête des outils');
    check(await p.getAttribute('.ui-tpl-btn', 'aria-haspopup') === 'menu' && await p.getAttribute('.ui-tpl-btn', 'type') === 'button', '(d) bouton de menu, sans envoi du formulaire');
    await p.focus('.ui-tpl-btn');
    await p.keyboard.press('ArrowDown');
    await p.waitForSelector('.ui-tpl-menu');
    check(await p.getAttribute('.ui-tpl-btn', 'aria-expanded') === 'true' && (await actif(p)) === 'Mot de passe oublié', '(d) flèche bas : ouvert sur le premier');
    check(await p.evaluate(() => { const m = document.querySelector('.ui-tpl-menu').getBoundingClientRect(), b = document.querySelector('.ui-box').getBoundingClientRect(), c = document.elementFromPoint(m.left + 20, m.top + 20); return m.bottom <= b.bottom && m.top >= 0 && !!c?.closest('.ui-tpl-menu'); }), '(d) menu au-dessus de la zone, visible');
    check((await p.locator('.ui-tpl-item small').allTextContents()).join() === 'Connexion,Bug,<b>x</b>', '(d) catégories échappées, ligne sans catégorie sans vide');
    check(/Le texte reste modifiable avant l’envoi\./.test(await p.textContent('.ui-tpl-gerer')), '(d) rappel du menu');
    await p.keyboard.press('ArrowDown');
    check((await actif(p)) === 'Bug bien reçu' && await p.locator('.ui-tpl-item.is-actif').count() === 1, '(d) flèche bas');
    await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
    check((await actif(p)) === 'Sans rangement', '(d) flèche haut en boucle');
    await p.keyboard.press('ArrowDown');
    check((await actif(p)) === 'Mot de passe oublié', '(d) flèche bas en boucle');
    await p.keyboard.press('End');
    check((await actif(p)) === 'Sans rangement', '(d) Fin');
    await p.keyboard.press('Home');
    check((await actif(p)) === 'Mot de passe oublié', '(d) Début');
    await p.keyboard.press('Escape');
    check(!(await p.locator('.ui-tpl-menu').count()) && (await actif(p)) === 'bouton' && await p.getAttribute('.ui-tpl-btn', 'aria-expanded') === 'false', '(d) Échap : fermé, focus au bouton');
    await p.keyboard.press('ArrowUp');
    await p.waitForSelector('.ui-tpl-menu');
    check((await actif(p)) === 'Sans rangement', '(d) flèche haut : ouvert sur le dernier');
    await p.keyboard.press('Tab');
    check(!(await p.locator('.ui-tpl-menu').count()) && (await actif(p)) !== 'bouton' && (await p.evaluate(() => document.activeElement?.closest('.ui-box-tools') !== null)), '(d) Tab : fermé, focus sur l’outil suivant');
    await ouvrirMenu(p);
    await p.click('.ui-thread-log', { position: { x: 5, y: 5 } });
    check(!(await p.locator('.ui-tpl-menu').count()), '(d) clic dehors : fermé');
    await ouvrirMenu(p);
    await p.click('.ui-tpl-btn');
    check(!(await p.locator('.ui-tpl-menu').count()) && (await actif(p)) === 'bouton', '(d) second clic : fermé');
    await ouvrirMenu(p);
    await p.keyboard.press('ArrowDown');
    await p.evaluate(async () => { const { renderSupport } = await import('/assets/espaces/admin/support.js'); renderSupport(); });
    check((await actif(p)) === 'Bug bien reçu', '(d) mise à jour en direct : focus gardé dans le menu');
    await p.keyboard.press('Escape');

    /* ---------- (e) Choix ---------- */
    const lues = async () => (await log(p)).filter((l) => l[0] === 'select' && l[1] === 'hg_modeles_reponse').length;
    const avant = await lues();
    await p.evaluate(() => window.__DB.hg_modeles_reponse.push({ id: 9, titre: 'Tout neuf', categorie: '', texte: 'Neuf' }));
    await ouvrirMenu(p);
    check((await p.locator('.ui-tpl-item').count()) === 5 && (await lues()) === avant + 1, '(e) liste relue à chaque ouverture');
    await p.keyboard.press('Escape');
    await p.evaluate(() => { window.__DB.hg_modeles_reponse.length = 4; });

    await ouvrirMenu(p);
    await p.keyboard.press('ArrowDown');
    await p.keyboard.press('Enter');
    check((await zone(p)) === 'Merci Alice, à bientôt Alice !', '(e) {prenom} remplacé partout par le pseudo : ' + await zone(p));
    check((await actif(p)) === 'zone' && !(await p.locator('.ui-tpl-menu').count()), '(e) focus dans la zone, menu fermé');
    check(await p.getAttribute('#support-root .ui-textarea', 'rows') === '4', '(e) zone agrandie');
    check((await nbReponses(p)) === 0, '(e) rien d’envoyé');
    await p.keyboard.type(' Merci.');
    check((await zone(p)) === 'Merci Alice, à bientôt Alice ! Merci.', '(e) texte modifiable, curseur à la fin');
    await ouvrirMenu(p);
    await p.locator('.ui-tpl-item').first().click();
    check((await zone(p)) === 'Merci Alice, à bientôt Alice ! Merci.\n\nSalut Alice, passe par la page de connexion.', '(e) texte déjà écrit gardé, modèle ajouté à la suite');
    await p.waitForSelector('.toast, [role="status"]', { timeout: 2000 }).catch(() => {});
    check(/ajouté à la suite/.test(await p.evaluate(() => document.body.textContent)), '(e) le Staff en est prévenu');
    check((await nbReponses(p)) === 0, '(e) toujours rien d’envoyé');
    await p.fill('#support-root .ui-textarea', '   \n ');
    await ouvrirMenu(p);
    await p.locator('.ui-tpl-item').nth(3).click();
    check((await zone(p)) === 'Texte seul.', '(e) zone sans vrai texte : remplie directement');

    await p.click('.ui-note-toggle');
    await p.fill('#support-root .ui-textarea', '');
    await ouvrirMenu(p);
    await p.locator('.ui-tpl-item').first().click();
    check((await zone(p)) === 'Salut Alice, passe par la page de connexion.', '(e) note interne : même zone');
    await p.click('.ui-send');
    await p.waitForFunction(() => document.querySelector('#support-root .ui-textarea').value === '');
    const notes = await p.evaluate(() => window.__DB.hg_support_replies.map((r) => ({ ...r })));
    check(notes.length === 1 && notes[0].internal === true && notes[0].body === 'Salut Alice, passe par la page de connexion.', '(e) note envoyée à la main');
    await p.click('.ui-note-toggle');
    await ouvrirMenu(p);
    await p.locator('.ui-tpl-item').nth(1).click();
    await p.fill('#support-root .ui-textarea', 'Merci Alice, c’est noté.');
    await p.click('.ui-send');
    await p.waitForFunction(() => document.querySelector('#support-root .ui-textarea').value === '');
    const rep = await p.evaluate(() => window.__DB.hg_support_replies.map((r) => ({ ...r })));
    check(rep.length === 2 && rep.some((r) => r.internal === false && r.body === 'Merci Alice, c’est noté.'), '(e) réponse modifiée puis envoyée à la main');

    await demande(p, 'sup-2');
    await ouvrirMenu(p);
    await p.locator('.ui-tpl-item').nth(1).click();
    check((await zone(p)) === 'Merci Ca$&sse, à bientôt Ca$&sse !', '(e) pseudo repris tel quel, sans membre inscrit');
    check(!(await p.evaluate(() => window.__xss)) && !(await p.locator('.ui-tpl img').count()), '(e) menu : rien d’interprété');

    /* ---------- (f) Messagerie : pas de menu ---------- */
    await adminSection(p, 'poste/messagerie');
    await sleep(300);
    check(!(await p.locator('#messages-root .ui-tpl-btn, #messagerie .ui-tpl-btn').count()), '(f) pas de menu Modèles dans la Messagerie');
    check(!p.errs.length, '(d-e) aucune erreur JS ' + p.errs.slice(0, 3).join(' | '));
    await p.ctx.close();

    /* ---------- (f) Droits ---------- */
    p = await openPage(browser, { page: 'admin', scenario: { ...SCN, uid: U(2), staff: ['support'] } });
    await adminSection(p, 'poste/modeles-reponse');
    await p.waitForSelector('.tpl-liste .bt-item');
    await p.locator('.tpl-liste .bt-item').nth(1).click();
    await p.waitForSelector('dialog.ui-drawer[open]');
    await p.fill('#tpl-cat', 'Bogue');
    await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
    await p.waitForSelector('dialog.ui-drawer[open]', { state: 'detached' });
    check((await db(p)).find((m) => m.id === 2).categorie === 'Bogue', '(f) Staff support : édite');
    await demande(p, 'sup-1');
    await ouvrirMenu(p);
    check((await p.locator('.ui-tpl-item').count()) === 4, '(f) Staff support : menu');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', scenario: { ...SCN, uid: U(2), staff: ['cartes'] } });
    await p.evaluate(() => { location.hash = '#poste/modeles-reponse'; });
    await sleep(500);
    check(!(await p.locator('.lieu-tile[data-sub="modeles-reponse"]').count()) && !(await p.isVisible('#modeles-reponse').catch(() => false)), '(f) Staff sans support : ni tuile ni page');
    check(!(await log(p)).some((l) => l[1] === 'hg_modeles_reponse'), '(f) Staff sans support : table jamais lue');
    await p.ctx.close();

    /* ---------- (g) 390 px au doigt ---------- */
    p = await openPage(browser, { page: 'admin', width: 390, height: 780, mobile: true, scenario: SCN });
    await demande(p, 'sup-1');
    await sleep(300);
    await p.tap('.ui-tpl-btn');
    await p.waitForSelector('.ui-tpl-menu');
    const menu = await p.evaluate(() => {
      const m = document.querySelector('.ui-tpl-menu').getBoundingClientRect();
      const cibles = [...document.querySelectorAll('.ui-tpl-btn, .ui-tpl-item')].map((e) => e.getBoundingClientRect().height);
      const textes = [...document.querySelectorAll('.ui-tpl-item, .ui-tpl-item small, .ui-tpl-gerer')].map((e) => parseFloat(getComputedStyle(e).fontSize));
      return { dedans: m.left >= 0 && m.right <= innerWidth && m.top >= 0, cibles: Math.min(...cibles), texte: Math.min(...textes) };
    });
    check(menu.dedans, '(g) menu dans l’écran');
    check(menu.cibles >= 44, `(g) cibles de 44 px (${menu.cibles})`);
    check(menu.texte >= 12, `(g) textes de 12 px (${menu.texte})`);
    check((await hscroll(p)) <= 0, '(g) zone de réponse sans défilement horizontal');
    check(await p.evaluate(() => { const b = document.querySelector('#support-root .ui-box').getBoundingClientRect(); return [...document.querySelectorAll('.ui-box-tools > *')].every((e) => e.getBoundingClientRect().right <= b.right); }), '(g) outils dans la zone, Envoyer compris');
    await p.tap('.ui-tpl-item');
    check((await zone(p)).startsWith('Salut Alice'), '(g) choix au doigt');
    check(await p.$eval('#support-root .ui-textarea', (t) => parseFloat(getComputedStyle(t).fontSize) >= 16), '(g) zone de réponse en 16 px');
    await adminSection(p, 'poste/modeles-reponse');
    await p.waitForSelector('.tpl-liste .bt-item');
    check((await hscroll(p)) <= 0, '(g) page sans défilement horizontal');
    check(await p.evaluate(() => [...document.querySelectorAll('[data-tpl-nouveau], .tpl-liste .bt-item')].every((e) => e.getBoundingClientRect().height >= 44)), '(g) page : cibles de 44 px');
    await p.locator('.tpl-liste .bt-item').first().tap();
    await p.waitForSelector('dialog.ui-drawer[open]');
    check(await p.evaluate(() => [...document.querySelectorAll('#tpl-titre, #tpl-cat, #tpl-texte')].every((e) => parseFloat(getComputedStyle(e).fontSize) >= 16)), '(g) tiroir : champs de 16 px');
    check(await p.evaluate(() => [...document.querySelectorAll('[data-tpl-suppr], dialog.ui-drawer[open] [data-drawer-submit]')].every((e) => e.getBoundingClientRect().height >= 44)), '(g) tiroir : boutons de 44 px');
    check(await p.evaluate(() => { const d = document.querySelector('dialog.ui-drawer[open]'); return d.scrollWidth <= d.clientWidth; }), '(g) tiroir sans défilement horizontal');
    check(!p.errs.length, '(g) aucune erreur JS ' + p.errs.slice(0, 3).join(' | '));
    await p.ctx.close();
  } finally {
    await browser.close();
  }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
