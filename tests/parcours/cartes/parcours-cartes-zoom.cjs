// Parcours : Collection des cartes (/pages/cartes/cartes.html).
// 1. « Toutes les séries » : groupes par série (intertitre, possédées / total, barre), compteurs, filtres, choix retenu.
// 2. Loupe sur chaque carte (visible au survol, au focus, et toujours sur écran tactile) ; carte agrandie :
//    ouverture, précédent / suivant (boucle, flèches clavier), Échap, bouton fermer, clic sur le fond, focus rendu.
// 3. Loupe ×2,5 qui suit la souris (ordinateur) ; appui long tactile (CDP) ; pas de loupe sur un simple appui.
// 4. Défilement conservé après une action (filtre, fiche, souhait, carte agrandie, « Toutes les séries », classement).
// 5. Téléphone 390 px : sans défilement horizontal, barre Précédent / Suivant, loupe de 40 px.
// 6. « Réduire les animations » : pas de transition sur la loupe ; aucune erreur console partout.
// 7. Fabrication : une légendaire fabriquée est annoncée (hg-notify card_pull, via « fabrication ») ; une commune non.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (SET1 : 12 cartes dont 1 identité ; SET2 ouverte par scenario.set2Open).
// Lancer : node tests/parcours/cartes/parcours-cartes-zoom.cjs
const fs = require('fs');
const path = require('path');
const { ROOT, SHOTS, check, finish, openPage, hscroll, sleep, log, chromium } = require('../../lib/harness.cjs');
/** Ouvre un onglet de Cartes par son adresse : les onglets internes sont masqués (nouvel en-tête). */
const goTab = (p, id) => p.evaluate((id) => { if (location.hash === '#' + id) location.hash = ''; location.hash = id; }, id);

const SCN = { set2Open: true };
/** Nom de la carte ouverte dans la vue agrandie. */
const nomOuvert = (p) => p.evaluate(() => document.querySelector('#cz-eyebrow')?.textContent || '');

/** Centre d'un élément à l'écran (coordonnées de la fenêtre). */
/** Centre (x, y) de l'élément sel dans la fenêtre. */
const centre = (p, sel) => p.evaluate((s) => {
  const r = document.querySelector(s).getBoundingClientRect();
  return [r.x + r.width / 2, r.y + r.height / 2];
}, sel);

/** Position de défilement (fenêtre) : les tests comparent avant / après une action. */
/** Défilement vertical de la page, arrondi. */
const scrollY = (p) => p.evaluate(() => Math.round(window.scrollY));

(async () => {
  console.log('Racine testée : ' + ROOT);
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // ---------- 1. Toutes les séries ----------
  let p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1440, height: 900, scenario: SCN });
  await goTab(p, 'collection');
  await p.waitForSelector('#cartes-set', { timeout: 5000 });
  const options = await p.$$eval('#cartes-set option', (o) => o.map((x) => [x.value, x.textContent]));
  check(options[0] && options[0][0] === '__all__' && options[0][1] === 'Toutes les séries', 'sélecteur « Série » : première option « Toutes les séries »');
  check(options.length === 3, 'sélecteur : « Toutes les séries » + 2 séries ouvertes (' + options.length + ')');
  await p.selectOption('#cartes-set', '__all__');
  await p.waitForSelector('.cz-group', { timeout: 5000 }).catch(() => {});
  const titres = await p.$$eval('.cz-group-title', (x) => x.map((e) => e.textContent));
  check(JSON.stringify(titres) === JSON.stringify(['Première édition', 'Saison 2']), 'toutes les séries : un intertitre par série (' + titres.join(' | ') + ')');
  const compteurs = await p.$$eval('.cz-group-count', (x) => x.map((e) => e.textContent.trim()));
  check(compteurs[0] === '6 / 11 possédées', 'intertitre Première édition : « 6 / 11 possédées » (' + compteurs[0] + ')');
  check(compteurs[1] === '0 / 1 possédées', 'intertitre Saison 2 : « 0 / 1 possédées » (' + compteurs[1] + ')');
  const barres = await p.$$eval('.cz-group-bar', (x) => x.map((e) => e.getAttribute('aria-valuenow')));
  check(barres[0] === '55' && barres[1] === '0', 'barre de progression par série (' + barres.join(' / ') + ')');
  const resume = await p.textContent('.cartes-progress-label');
  check(/6 \/ 12 cartes obtenues \(toutes les séries\)/.test(resume), 'total : « 6 / 12 cartes obtenues (toutes les séries) » (' + resume + ')');
  const cellules = await p.$$eval('.cz-cell', (x) => x.length);
  const loupes = await p.$$eval('.cz-zoom', (x) => x.length);
  check(cellules === 13 && loupes === 13, 'une loupe par carte affichée (' + loupes + ' loupes / ' + cellules + ' cartes)');
  await p.selectOption('#cartes-f-rarity', 'legendaire');
  await sleep(200);
  check(await p.$$eval('.cz-group', (x) => x.length) === 1, 'filtre Rareté : seules les séries qui ont une carte correspondante');
  check((await p.$$eval('.cz-group-count', (x) => x.map((e) => e.textContent.trim())))[0] === '6 / 11 possédées', 'filtre Rareté : les compteurs ne changent pas');
  await p.selectOption('#cartes-f-rarity', '');
  await sleep(150);
  // Le choix est retenu pendant la session (changement d'onglet puis retour)
  await goTab(p, 'boutique');
  await goTab(p, 'collection');
  check(await p.inputValue('#cartes-set') === '__all__', '« Toutes les séries » retenue après changement d\'onglet');
  await p.selectOption('#cartes-set', 'SET1');
  await sleep(150);
  check(await p.$$eval('.cz-group', (x) => x.length) === 0 && (await p.$$('.cartes-grid .cz-cell')).length === 12, 'une seule série : ses cartes, sans intertitre');
  await p.selectOption('#cartes-set', '__all__');
  await sleep(150);
  check(await p.$$eval('.cz-group', (x) => x.length) === 2, 'retour à « Toutes les séries »');
  await p.screenshot({ path: path.join(SHOTS, 'zoom-1440-toutes-series.png'), fullPage: false });
  check(!p.errs.length, 'toutes les séries : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // ---------- 2. Loupe et carte agrandie ----------
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1440, height: 900, scenario: SCN });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', '__all__');
  await sleep(150);
  // Loupe cachée hors survol (ordinateur), visible au survol de la carte
  await p.mouse.move(5, 5);
  await sleep(200);
  const opHors = await p.$eval('.cz-zoom[data-card="C2"]', (b) => getComputedStyle(b).opacity);
  check(opHors === '0', 'loupe : cachée hors survol sur ordinateur (opacité ' + opHors + ')');
  await p.locator('.cz-cell [data-action=open-card][data-card="C2"]').scrollIntoViewIfNeeded();
  const [cx, cy] = await centre(p, '.cz-cell [data-action=open-card][data-card="C2"]');
  await p.mouse.move(cx, cy);
  await sleep(250);
  const opSurvol = await p.$eval('.cz-zoom[data-card="C2"]', (b) => getComputedStyle(b).opacity);
  check(opSurvol === '1', 'loupe : visible au survol de la carte');
  const taille = await p.$eval('.cz-zoom[data-card="C2"]', (b) => b.getBoundingClientRect().width);
  check(taille === 32, 'loupe : 32 px sur ordinateur (' + taille + ')');
  // La loupe ouvre la carte agrandie et n'ouvre pas la fiche détail
  await p.click('.cz-zoom[data-card="C1"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  check(await p.$eval('#cz-dialog', (d) => d.open), 'clic sur la loupe : carte agrandie ouverte');
  check(!(await p.$eval('#cartes-detail', (d) => d.open)), 'clic sur la loupe : la fiche détail ne s\'ouvre pas');
  check((await nomOuvert(p)) === 'Collection · Première édition · 1 / 13', 'carte agrandie : en-tête « Collection · Première édition · 1 / 13 » (' + (await nomOuvert(p)) + ')');
  check((await p.textContent('#cz-info .cz-title')) === 'Ethan', 'carte agrandie : nom de la carte');
  check((await p.textContent('#cz-info .cz-rar')) === 'Commune', 'carte agrandie : rareté');
  const meta = await p.textContent('#cz-info .cz-meta');
  check(/Membre · Première édition · N° 001\/12/.test(meta), 'carte agrandie : famille, série, numéro (' + meta + ')');
  check((await p.$$('#cz-info .cz-copies li')).length === 3, 'carte agrandie : les 3 exemplaires possédés listés');
  check(await p.isVisible('#cz-info .cz-flavor'), 'carte agrandie : texte d\'ambiance visible');
  const focusOuv = await p.evaluate(() => document.activeElement?.className || '');
  check(/cz-close/.test(focusOuv), 'carte agrandie : le focus arrive sur le bouton Fermer');
  // Précédent / suivant (boutons), boucle, flèches clavier
  await p.click('#cz-dialog .cz-nav[data-cz=next]');
  await sleep(100);
  check((await nomOuvert(p)).endsWith('2 / 13'), 'suivant : carte 2 / 13');
  check((await p.textContent('#cz-info .cz-title')) === 'La Fontaine', 'suivant : nom de la carte suivante');
  await p.keyboard.press('ArrowRight');
  await sleep(80);
  check((await nomOuvert(p)).endsWith('3 / 13'), 'flèche droite : carte 3 / 13');
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowLeft');
  await sleep(80);
  check((await nomOuvert(p)).endsWith('1 / 13'), 'flèche gauche : retour puis boucle vers la carte 1 / 13');
  await p.keyboard.press('ArrowLeft');
  await sleep(80);
  check((await nomOuvert(p)).endsWith('13 / 13'), 'précédent depuis la 1re : boucle vers la dernière (13 / 13)');
  // Précédent depuis la 13e : la 12e (non obtenue) ; son nom et son ambiance restent cachés
  await p.click('#cz-dialog .cz-nav[data-cz=prev]');
  await sleep(80);
  check((await nomOuvert(p)).endsWith('12 / 13'), 'précédent : carte 12 / 13');
  check((await p.textContent('#cz-info .cz-title')) === '???', 'carte non obtenue : nom masqué (???)');
  check(/Pas encore obtenue/.test(await p.textContent('#cz-info')), 'carte non obtenue : « Pas encore obtenue »');
  check((await p.$$('#cz-info .cz-flavor')).length === 0, 'carte non obtenue : ambiance masquée');
  // Échap ferme et rend le focus à la loupe
  await p.keyboard.press('Escape');
  await sleep(150);
  check(!(await p.$eval('#cz-dialog', (d) => d.open)), 'Échap : la carte agrandie se ferme');
  const focusRetour = await p.evaluate(() => document.activeElement?.dataset?.card || '');
  check(focusRetour === 'C1', 'fermeture : le focus revient à la loupe de la carte (' + focusRetour + ')');
  // Bouton fermer
  await p.click('.cz-zoom[data-card="C2"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  await p.click('#cz-dialog .cz-close');
  await sleep(120);
  check(!(await p.$eval('#cz-dialog', (d) => d.open)), 'bouton Fermer : la carte agrandie se ferme');
  // Clic sur le fond
  await p.click('.cz-zoom[data-card="C2"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  await p.mouse.click(6, 450);
  await sleep(120);
  check(!(await p.$eval('#cz-dialog', (d) => d.open)), 'clic sur le fond : la carte agrandie se ferme');
  // Clic sur la carte elle-même : la fiche détail existante s'ouvre toujours
  await p.click('.cartes-grid [data-action=open-card][data-card="C3"]');
  await sleep(150);
  check(await p.$eval('#cartes-detail', (d) => d.open), 'clic sur la carte : la fiche détail existante s\'ouvre');
  await p.keyboard.press('Escape');
  await sleep(120);
  await p.screenshot({ path: path.join(SHOTS, 'zoom-1440-agrandie.png') });
  check(!p.errs.length, 'carte agrandie : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));

  // ---------- 3. Loupe ×2,5 qui suit la souris ----------
  await p.click('.cz-zoom[data-card="C1"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  const [ax, ay] = await centre(p, '#cz-card .hgc');
  await p.mouse.move(ax - 60, ay - 40);
  await p.mouse.move(ax, ay);
  await sleep(120);
  /** Mesure la loupe ouverte (position, taille, copie de la carte) ; null si elle est fermée ou cachée. */
  const lens = () => p.evaluate(() => {
    const l = document.getElementById('cz-lens');
    if (!l || l.hidden) return null;
    const r = l.getBoundingClientRect();
    const c = l.querySelector('.cz-clone');
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width, scale: c ? new DOMMatrix(getComputedStyle(c).transform).a : 0, clone: !!c };
  });
  let L = await lens();
  check(L && L.clone, 'loupe : affichée au survol de la carte agrandie');
  check(L && Math.abs(L.cx - ax) <= 2 && Math.abs(L.cy - ay) <= 2, 'loupe : centrée sur le curseur (' + (L && L.cx.toFixed(0)) + ',' + (L && L.cy.toFixed(0)) + ' / ' + ax.toFixed(0) + ',' + ay.toFixed(0) + ')');
  check(L && Math.abs(L.scale - 2.5) < 0.01, 'loupe : grossissement ×2,5 (' + (L && L.scale.toFixed(2)) + ')');
  check(L && Math.abs(L.w - 240) < 1, 'loupe : diamètre 240 px (' + (L && L.w) + ')');
  await p.mouse.move(ax + 50, ay + 30);
  await sleep(80);
  L = await lens();
  check(L && Math.abs(L.cx - (ax + 50)) <= 2 && Math.abs(L.cy - (ay + 30)) <= 2, 'loupe : suit le curseur quand la souris bouge');
  await p.mouse.move(ax, ay + 300);
  await sleep(60);
  L = await lens();
  check(L && Math.abs(L.cy - (ay + 300)) <= 2, 'loupe : suit le curseur en descendant');
  await p.mouse.move(5, 5);
  await sleep(80);
  check((await lens()) === null, 'loupe : masquée quand la souris quitte la carte');
  await p.keyboard.press('Escape');
  await sleep(100);
  check(!p.errs.length, 'loupe : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Réduire les animations : pas de transition sur la loupe ni sur la carte agrandie
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1440, height: 900, scenario: SCN, reducedMotion: 'reduce' });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', '__all__');
  await sleep(100);
  const duree = await p.$eval('.cz-zoom', (b) => getComputedStyle(b).transitionDuration);
  check(/^0s(, 0s)*$/.test(duree), 'réduire les animations : pas de transition sur la loupe (' + duree + ')');
  await p.click('.cz-zoom[data-card="C1"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  check(await p.$eval('#cz-dialog', (d) => d.open), 'réduire les animations : la carte agrandie s\'ouvre');
  await p.keyboard.press('Escape');
  check(!p.errs.length, 'réduire les animations : aucune erreur JS');
  await p.ctx.close();

  // ---------- 4. Défilement conservé après une action ----------
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { ...SCN, bigCards: 60 } });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', 'SET1'); // série longue (la série par défaut, la plus récente, est courte)
  await sleep(150);
  await p.evaluate(() => window.scrollTo(0, 900));
  await sleep(150);
  const y0 = await scrollY(p);
  check(y0 === 900, 'défilement : page descendue à 900 px (' + y0 + ')');
  await p.selectOption('#cartes-f-rarity', 'commune');
  await sleep(200);
  check((await scrollY(p)) === y0, 'filtre Rareté : défilement conservé (' + (await scrollY(p)) + ')');
  await p.selectOption('#cartes-f-rarity', '');
  await sleep(150);
  // Fiche détail (ouverte à la souris sur une carte visible), souhait, fermeture
  const vis = await p.evaluate(() => {
    const b = [...document.querySelectorAll('.cartes-grid [data-action=open-card]')].find((x) => { const r = x.getBoundingClientRect(); return r.top > 80 && r.bottom < innerHeight - 40; });
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return [r.x + r.width / 2, r.y + r.height / 2];
  });
  check(!!vis, 'défilement : une carte visible à l\'écran');
  await p.mouse.click(vis[0], vis[1]);
  await sleep(200);
  check((await scrollY(p)) === y0, 'ouverture de la fiche détail : défilement conservé (' + (await scrollY(p)) + ')');
  await p.click('.cd-wish');
  await sleep(300);
  check((await scrollY(p)) === y0, 'souhait dans la fiche : défilement conservé (' + (await scrollY(p)) + ')');
  await p.keyboard.press('Escape');
  await sleep(150);
  check((await scrollY(p)) === y0, 'fermeture de la fiche : défilement conservé (' + (await scrollY(p)) + ')');
  // Carte agrandie : ouverture, suivant, fermeture
  await p.evaluate(() => document.querySelector('.cz-zoom[data-card="C5"]').click()); // clic DOM : pas de défilement automatique
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  await p.click('#cz-dialog .cz-nav[data-cz=next]');
  await p.keyboard.press('Escape');
  await sleep(150);
  check((await scrollY(p)) === y0, 'carte agrandie (ouverture, suivant, fermeture) : défilement conservé (' + (await scrollY(p)) + ')');
  // « Toutes les séries » : la page s'allonge, le défilement reste
  await p.selectOption('#cartes-set', '__all__');
  await sleep(200);
  check((await scrollY(p)) === y0, 'choix « Toutes les séries » : défilement conservé (' + (await scrollY(p)) + ')');
  check(!p.errs.length, 'défilement collection : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Classement : rendu asynchrone (texte d'attente), page longue, le défilement ne doit pas remonter
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { ...SCN, lbRows: 40, rpcDelay: 500 } });
  await goTab(p, 'classement');
  await p.waitForSelector('.cartes-lb li', { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => window.scrollTo(0, 99999));
  await sleep(150);
  const yBas = await scrollY(p);
  check(yBas > 300, 'classement : page longue, descendue en bas (' + yBas + ')');
  await p.evaluate(() => document.querySelector('[data-tab=classement]').click()); // rafraîchit le classement
  await sleep(120);
  check((await scrollY(p)) === yBas, 'classement pendant le chargement : défilement conservé (' + (await scrollY(p)) + ')');
  await sleep(700);
  check((await scrollY(p)) === yBas, 'classement après le chargement : défilement conservé (' + (await scrollY(p)) + ')');
  check(!p.errs.length, 'classement : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // ---------- 5. Téléphone 390 px (écran tactile) ----------
  p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844, scenario: SCN, touch: true });
  await goTab(p, 'collection');
  await p.selectOption('#cartes-set', '__all__');
  await sleep(200);
  check((await hscroll(p)) <= 0, 'téléphone : collection sans défilement horizontal (' + (await hscroll(p)) + ')');
  const loupeTactile = await p.$eval('.cz-zoom[data-card="C1"]', (b) => ({ op: getComputedStyle(b).opacity, w: b.getBoundingClientRect().width }));
  check(loupeTactile.op === '1' && loupeTactile.w === 40, 'téléphone : loupe toujours visible, 40 px (' + JSON.stringify(loupeTactile) + ')');
  await p.screenshot({ path: path.join(SHOTS, 'zoom-390-collection.png'), fullPage: true });
  await p.click('.cz-zoom[data-card="C1"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 }).catch(() => {});
  check(await p.$eval('#cz-dialog', (d) => d.open), 'téléphone : carte agrandie ouverte');
  check(await p.isVisible('#cz-dialog .cz-bar'), 'téléphone : barre Précédent / Suivant visible');
  check(!(await p.isVisible('#cz-dialog .cz-nav')), 'téléphone : flèches latérales masquées');
  const dlgScroll = await p.evaluate(() => { const d = document.getElementById('cz-dialog'); return d.scrollWidth - d.clientWidth; });
  check(dlgScroll <= 0 && (await hscroll(p)) <= 0, 'téléphone : fenêtre agrandie sans défilement horizontal');
  await p.click('#cz-dialog .cz-bar-btn:nth-child(2)');
  await sleep(100);
  check((await nomOuvert(p)).endsWith('2 / 13'), 'téléphone : « Suivant » passe à la carte 2 / 13');
  // Appui long tactile (CDP) : loupe sous le doigt ; un simple appui ne l'affiche pas
  const cdp = await p.ctx.newCDPSession(p);
  const [tx, ty] = await centre(p, '#cz-card .hgc');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  await sleep(80);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
  check(await p.$eval('#cz-lens', (l) => l.hidden), 'téléphone : un simple appui n\'affiche pas la loupe');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
  await sleep(750);
  const longue = await p.evaluate(() => {
    const l = document.getElementById('cz-lens');
    if (!l || l.hidden) return null;
    const r = l.getBoundingClientRect();
    const c = l.querySelector('.cz-clone');
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, scale: c ? new DOMMatrix(getComputedStyle(c).transform).a : 0 };
  });
  check(longue && Math.abs(longue.cx - tx) <= 3 && Math.abs(longue.cy - ty) <= 3, 'appui long : loupe posée sous le doigt');
  check(longue && Math.abs(longue.scale - 2.5) < 0.01, 'appui long : loupe ×2,5');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
  check(await p.$eval('#cz-lens', (l) => l.hidden), 'appui long relâché : loupe masquée');
  check(!p.errs.length, 'téléphone : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.screenshot({ path: path.join(SHOTS, 'zoom-390-agrandie.png') });
  await p.ctx.close();

  // ---------- 7. Fabrication : une belle carte fabriquée est annoncée (hg-notify card_pull, via fabrication) ----------
  /** Appels de hg-notify « card_pull » dans le journal j. */
  const pulls = (j) => j.filter((l) => l[0] === 'fn' && l[1] === 'hg-notify' && l[2]?.event === 'card_pull').map((l) => l[2]);
  /** Ouvre la fiche d'une carte possédée depuis la collection (toutes les séries). */
  const ouvrirFiche = async (f, id) => {
    await f.click(`[data-action="open-card"][data-card="${id}"]`);
    await f.waitForSelector('#cartes-detail-title', { timeout: 5000 });
  };
  const f = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { bal: 5000 } });
  await goTab(f, 'collection');
  await f.waitForSelector('#cartes-set', { timeout: 5000 });
  // Légendaire (C9, « Braquage raté ») : fabrication normale -> annonce card_pull avec via fabrication.
  await ouvrirFiche(f, 'C9');
  await f.click('[data-action="craft"][data-shiny="0"]');
  await f.waitForFunction(() => (window.__LOG || []).some((e) => e[0] === 'fn' && e[1] === 'hg-notify' && e[2]?.event === 'card_pull'), null, { timeout: 5000 }).catch(() => {});
  let j = await log(f);
  const annonces = pulls(j);
  check(annonces.length === 1, `fabrication légendaire : hg-notify card_pull appelée une fois (${annonces.length})`);
  check(annonces[0]?.via === 'fabrication' && annonces[0]?.card === 'C9' && annonces[0]?.rarity === 'legendaire', 'fabrication légendaire : carte, rareté et via « fabrication » transmis');
  check(j.some((l) => l[0] === 'rpc' && l[1] === 'hg_card_craft'), 'fabrication légendaire : hg_card_craft appelée');
  // Commune (C1, « Ethan ») : fabrication sans annonce.
  await f.keyboard.press('Escape');
  await f.waitForFunction(() => !document.getElementById('cartes-detail')?.open, null, { timeout: 3000 }).catch(() => {});
  await ouvrirFiche(f, 'C1');
  await f.click('[data-action="craft"][data-shiny="0"]');
  await sleep(700);
  j = await log(f);
  check(pulls(j).length === 1, 'fabrication commune : aucune annonce card_pull (toujours une seule, celle de la légendaire)');
  check(j.filter((l) => l[0] === 'rpc' && l[1] === 'hg_card_craft').length === 2, 'fabrication commune : la fabrication a bien été faite (2 appels à hg_card_craft)');
  check(!f.errs.length, 'fabrication : aucune erreur JS' + (f.errs.length ? ' (' + f.errs.join(' | ') + ')' : ''));
  await f.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
