// Parcours : idée J18, l'arcade du jour (onglet « Arcade » de jeux.html, paquet xJ4).
// Les trois mini-jeux sont jouables chaque jour : sélecteur (aria-pressed, « Jeu du jour » sur le tirage du serveur),
// adresse #arcade-<jeu> (choix au chargement, puis changement d'adresse), récompense « une par jour, tous jeux confondus » ; une partie complète (horloge simulée) ouvre et ferme la partie côté serveur (hg_arcade_start,
// hg_arcade_finish), affiche le gain du jour une seule fois ; bouton Pause ; score refusé par le serveur ; 360 px.
// Pas de limite de temps : une partie se termine quand le joueur perd ses trois vies (Paillettes, Raclette) ou au premier accrochage (Domu-mobile).
// Écrans communs dessinés dans le canevas (dataset.ecran) : départ, compte 3-2-1 (pas de compte sans mouvement ni avec « Effets » coupés),
// pause (reprendre et quitter au clic), fin ; boucle hors partie arrêtée quand la borne n'est plus visible.
// Faux Supabase : fixtures/fake-sb.mjs (scénario arcadeGame, arcadeRewarded, arcadeBadScore).
const { check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

/** Écran affiché par la borne. */
const ecran = (p) => p.$eval('#arc-canvas', (c) => c.dataset.ecran);
/** Clique un point du canevas donné en coordonnées logiques (360 × 420). */
async function clicCanevas(p, x, y) {
  const b = await p.locator('#arc-canvas').boundingBox();
  await p.mouse.click(b.x + (x / 360) * b.width, b.y + (y / 420) * b.height);
}

/**
 * Joue une partie complète dans l'horloge simulée (balayage du canevas) jusqu'à la fin (bouton « Jouer » de nouveau actif),
 * renvoie le score affiché.
 */
async function partie(p, pas = 3000) {
  await p.click('#arc-jouer');
  return balaye(p, pas);
}

/** Balaye le canevas jusqu'à la fin de la partie en cours (bouton « Jouer » ou « Rejouer » actif), renvoie le score. */
async function balaye(p, pas = 3000) {
  const box = await p.locator('#arc-canvas').boundingBox();
  for (let i = 0; i < pas && !(await p.locator('#arc-jouer').isEnabled()); i++) {
    await p.mouse.move(box.x + box.width * (0.5 + 0.45 * Math.sin(i * 0.21)), box.y + box.height * 0.85);
    await p.clock.runFor(100);
  }
  await sleep(400);
  return Number(await p.textContent('#arc-score'));
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- Tirage du jour : Raclette ---------- */
  let p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 390, height: 900, scenario: { arcadeGame: 'raclette' } });
  await p.waitForSelector('.arc-choix', { timeout: 5000 }).catch(() => {});
  check((await p.getAttribute('#jeux-tab-arcade', 'aria-selected')) === 'true', 'onglet : « Arcade » sélectionné depuis /pages/jeux/jeux.html#arcade');
  // Les jeux en développement (classe is-dev) ne sont visibles que des admins : on compte les trois jeux publics
  check((await p.locator('.arc-jeu:not(.is-dev)').count()) === 3 && (await p.locator('.arc-jeu:not(.is-dev):not([disabled])').count()) === 3, 'sélecteur : les trois mini-jeux jouables (hors jeux en développement)');
  check(/Raclette/.test(await p.locator('.arc-jeu[aria-pressed="true"]').innerText()) && /jeu du jour/i.test(await p.locator('.arc-jeu[aria-pressed="true"]').innerText()), 'sélecteur : Raclette (jeu du jour) choisi par défaut'); // badge affiché en capitales par la CSS
  check((await p.locator('.arc-jeu:not(.is-dev)[aria-pressed="false"]').count()) === 2, 'sélecteur : les deux autres non choisis (aria-pressed=false)');
  check(/une seule partie par jour/i.test(await p.locator('.arc-tirage').innerText()), 'sélecteur : une seule partie par jour récompensée, tous jeux confondus');
  check((await p.locator('#arc-scores-h').innerText()).includes('Raclette'), 'scores : « Meilleurs scores · Raclette »');
  check((await p.locator('#arc-top .arc-row').count()) === 2, 'scores : tableau de la semaine (2 lignes)');
  check((await p.locator('#arc-gain').innerText()).includes('+5 ✦') && (await p.locator('#arc-gain').innerText()).includes('à gagner aujourd’hui'), 'récompense : « +5 ✦ à gagner aujourd’hui »');
  check(await p.locator('#arc-pause').isDisabled(), 'pause : désactivée avant la partie');
  check(await p.$eval('#arc-canvas', (el) => getComputedStyle(el).touchAction) === 'none', 'canevas : pas de défilement au doigt');
  check(await hscroll(p) <= 0, '390 px : pas de défilement horizontal');
  check(p.errs.length === 0, 'aucune erreur JS au chargement' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  check((await p.locator('.site-header .nav-group[data-menu="jeux"] a.nav-item[href="/pages/jeux/jeux.html#tous"]').count()) === 1, 'menu : « Jeux » déroulant, avec « Tous les jeux » vers la page des jeux');
  await p.ctx.close();

  /* ---------- Partie complète (horloge simulée), pause, gain une fois ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 1280, scenario: { arcadeGame: 'paillettes' } });
  await p.waitForSelector('#arc-jouer', { timeout: 5000 });
  await p.clock.install();
  check((await ecran(p)) === 'depart', 'écrans : départ avant la partie');
  check(await p.$eval('.arc-hud', (h) => getComputedStyle(h).visibility === 'hidden'), 'écrans : le HUD s’efface sur l’écran de départ');
  await p.click('#arc-jouer');
  check((await ecran(p)) === 'compte', 'écrans : le compte 3-2-1 suit le départ');
  await p.clock.runFor(2000);
  check((await ecran(p)) === 'compte' && (await p.textContent('#arc-score')) === '0', 'écrans : le jeu attend la fin du compte');
  check((await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_arcade_start').length === 1, 'serveur : la partie s’ouvre dès le lancement, avant la fin du compte');
  await p.clock.runFor(1500);
  check((await ecran(p)) === 'jeu', 'écrans : la partie commence après GO');
  check(!(await p.locator('#arc-pause').isDisabled()), 'pause : active pendant la partie');
  // Défilement : les flèches restent à la page si le focus est sur un bouton, sont bloquées sur le corps de page
  const fleche = await p.evaluate(() => {
    const touche = (el) => { const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }); el.dispatchEvent(e); return e.defaultPrevented; };
    const b = document.getElementById('arc-pause');
    b.focus();
    const surBouton = touche(b);
    b.blur();
    return { surBouton, surPage: touche(document.body) };
  });
  check(!fleche.surBouton && fleche.surPage, 'clavier : flèche bas libre sur un bouton, bloquée sur le corps de page en partie');
  // Ctrl+P imprime, une touche tenue n'alterne pas : pas de pause
  await p.$eval('#arc-canvas', (c) => {
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', repeat: true, bubbles: true, cancelable: true }));
  });
  check((await ecran(p)) === 'jeu', 'clavier : Ctrl+P et Échap tenu ne mettent pas en pause');
  await p.click('#arc-pause');
  check((await ecran(p)) === 'pause', 'écrans : écran Pause dessiné');
  check(await p.$eval('#arc-canvas', (c) => document.activeElement === c), 'pause : le focus revient au canevas après le bouton');
  const sc1 = await p.textContent('#arc-score');
  const vies1 = await p.textContent('#arc-vies-txt');
  await p.clock.runFor(5000);
  check((await p.textContent('#arc-score')) === sc1 && (await p.textContent('#arc-pause')).trim() === 'Reprendre', 'pause : la partie est figée (score), bouton « Reprendre »');
  check(vies1 === '3 vies sur 3', `pause : vies affichées au départ (« ${vies1} »)`);
  await clicCanevas(p, 180, 300); // « Reprendre » dessiné
  check((await ecran(p)) === 'jeu' && (await p.textContent('#arc-pause')).trim() === 'Pause', 'pause : « Reprendre » sur le canevas relance la partie et remet le bouton à jour');
  const sc = await balaye(p);
  await p.clock.runFor(800);
  check((await ecran(p)) === 'fin', 'écrans : écran de fin dessiné juste après la fin de partie');
  check(!(await p.locator('#arc-jouer').isDisabled()) && (await p.textContent('#arc-msg')).includes('Score'), 'fin : partie terminée par la perte des vies (bouton actif, score affiché)');
  let calls = (await log(p)).filter((e) => e[0] === 'rpc' && /^hg_arcade_(start|finish)$/.test(e[1]));
  check(calls.filter((c) => c[1] === 'hg_arcade_start').length === 1, 'serveur : hg_arcade_start appelé une fois au lancement');
  const fin = calls.find((c) => c[1] === 'hg_arcade_finish');
  check(!!fin && fin[2].p_run === 'run-1' && fin[2].p_score === sc, `serveur : hg_arcade_finish(run-1, ${sc})`);
  check(sc >= 1 && (await p.textContent('#arc-msg')).includes('+5 ✦'), `fin : score ${sc} et gain +5 ✦ affichés`);
  check((await p.locator('#arc-gain').innerText()).includes('reçue aujourd’hui'), 'récompense : « reçue aujourd’hui » après le gain');
  check((await p.textContent('#arc-jouer')).trim() === 'Rejouer', 'bouton : « Rejouer » après la partie');
  check(Number(await p.textContent('#arc-record')) === sc, 'record : mis à jour');
  check((await p.locator('#arc-top .is-me').count()) === 1, 'scores : ma ligne apparaît au tableau');
  const sc2 = await partie(p);
  check(!(await p.textContent('#arc-msg')).includes('✦'), `2e partie (${sc2}) : pas de second gain`);
  // Quitter depuis l'écran de pause : fin normale, le score de ce moment part au serveur
  await p.click('#arc-jouer');
  await p.clock.runFor(3500);
  await p.keyboard.press('p');
  check((await ecran(p)) === 'pause', 'pause : touche P');
  // Rappel de la limite du serveur : après 50 minutes de partie seulement
  await p.evaluate(() => {
    const ecrit = CanvasRenderingContext2D.prototype.fillText;
    window.__textes = new Set();
    CanvasRenderingContext2D.prototype.fillText = function (t, ...r) { window.__textes.add(t); return ecrit.call(this, t, ...r); };
  });
  const rappel = () => p.evaluate(() => { const v = window.__textes.has('Reprends vite : une partie dure 1 h au plus.'); window.__textes.clear(); return v; });
  await p.clock.runFor(100);
  check(!(await rappel()), 'pause : pas de rappel de la limite avant 50 minutes');
  await p.clock.fastForward('50:00');
  await p.clock.runFor(100);
  check(await rappel(), 'pause : après 50 minutes, « Reprends vite : une partie dure 1 h au plus. »');
  await clicCanevas(p, 180, 352); // « Quitter la partie » dessiné
  await p.clock.runFor(100);
  await sleep(200);
  check((await ecran(p)) === 'fin' && (await p.locator('#arc-jouer').isEnabled()) && (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_arcade_finish').length === 3, 'pause : « Quitter » termine la partie (score envoyé, écran de fin)');
  await clicCanevas(p, 100, 334); // double clic : le second tombe sur « Rejouer »
  await p.clock.runFor(100);
  check((await ecran(p)) === 'fin', 'fin : un clic dans les 1,1 s après « Quitter » est ignoré');
  await p.clock.runFor(1100);
  await clicCanevas(p, 100, 334);
  await p.clock.runFor(100);
  check((await ecran(p)) === 'compte', 'fin : « Rejouer » répond ensuite');
  check(p.errs.length === 0, 'aucune erreur JS pendant les parties' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Fin de partie : score envoyé tout de suite, derniers effets sans entrées, puis écran de fin qui s'arrête ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 1280, scenario: { arcadeGame: 'paillettes' },
    init: () => { const r = window.requestAnimationFrame.bind(window); window.__images = 0; window.requestAnimationFrame = (f) => { window.__images += 1; return r(f); }; } });
  await p.waitForSelector('#arc-jouer', { timeout: 5000 });
  await p.clock.install();
  await p.evaluate(async () => {
    const { creeArcade } = await import('/assets/espaces/arcade/arcade.js');
    const c = document.createElement('canvas');
    c.id = 'essai-fin'; c.tabIndex = 0; c.style.cssText = 'position:fixed;top:0;left:0;z-index:99';
    document.body.append(c);
    const t = window.__essai = { fins: [], apres: 0, action: false };
    const jeu = {
      init: () => (t.s = { score: 7, fin: false }), draw() {}, vies: () => null, score: (s) => s.score, fini: (s) => s.fin, dureeFin: () => 0.5,
      update(s, dt, e) { if (t.fins.length) { t.apres += 1; t.action ||= e.action || e.cible !== null; } },
    };
    t.borne = creeArcade({ canvas: c, jeu, onFin: (sc) => t.fins.push(sc) });
    t.borne.demarre();
  });
  const essai = () => p.evaluate(() => ({ fins: window.__essai.fins, apres: window.__essai.apres, action: window.__essai.action, ecran: document.getElementById('essai-fin').dataset.ecran }));
  await p.clock.runFor(3500);
  await p.$eval('#essai-fin', (c) => { window.__essai.s.fin = true; const r = c.getBoundingClientRect(); c.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: r.left + 5, clientY: r.top + 5 })); });
  await p.clock.runFor(100);
  let e1 = await essai();
  check(e1.fins.length === 1 && e1.fins[0] === 7 && e1.ecran === 'jeu', 'dureeFin : onFin part à la mort, l’écran de fin attend');
  await p.$eval('#essai-fin', (c) => c.dispatchEvent(new PointerEvent('pointerdown', { clientX: 5, clientY: 5 })));
  await p.clock.runFor(200);
  e1 = await essai();
  check(e1.apres > 0 && !e1.action && e1.ecran === 'jeu', 'dureeFin : update continue, sans entrées');
  await p.clock.runFor(400);
  e1 = await essai();
  check(e1.ecran === 'fin' && e1.fins.length === 1, 'dureeFin : l’écran de fin s’ouvre ensuite, onFin une seule fois');
  // La page a sa propre borne, dont l'écran de départ s'anime : on l'arrête pour compter les images de l'écran de fin.
  await p.$eval('#arc-partie', (z) => { z.style.display = 'none'; });
  await p.clock.runFor(2000);
  await sleep(100);
  const imgA = await p.evaluate(() => window.__images);
  await p.clock.runFor(1000);
  await sleep(100);
  check((await p.evaluate(() => window.__images)) === imgA, 'écran de fin : plus aucune image quand rien ne bouge');
  await p.evaluate(() => window.__essai.borne.arrete());
  check(p.errs.length === 0, 'fin de partie : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Boucle des écrans : arrêtée quand la borne n'est plus visible ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 1280, height: 400, scenario: { arcadeGame: 'paillettes' },
    init: () => { const r = window.requestAnimationFrame.bind(window); window.__images = 0; window.requestAnimationFrame = (f) => { window.__images += 1; return r(f); }; } });
  await p.waitForSelector('#arc-canvas', { timeout: 5000 });
  const images = async () => { await sleep(200); const a = await p.evaluate(() => window.__images); await sleep(400); return (await p.evaluate(() => window.__images)) - a; };
  await p.$eval('#arc-canvas', (c) => c.scrollIntoView({ block: 'center' }));
  check((await images()) > 3, 'boucle : les écrans s’animent quand la borne est visible');
  await p.$eval('#arc-partie', (z) => { z.style.display = 'none'; });
  check((await images()) === 0, 'boucle : arrêtée quand la borne est masquée');
  await p.$eval('#arc-partie', (z) => { z.style.display = ''; });
  check((await images()) > 3, 'boucle : repart quand la borne revient');
  await p.ctx.close();

  /* ---------- « Effets » coupés : mêmes règles que le mouvement réduit, pas de compte ni de boucle ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 1280, scenario: { arcadeGame: 'paillettes' }, init: () => { localStorage.setItem('hg_prefs', JSON.stringify({ effects: false })); } });
  await p.waitForSelector('#arc-jouer', { timeout: 5000 });
  check((await ecran(p)) === 'depart', '« Effets » coupés : écran de départ');
  await p.click('#arc-jouer');
  check((await ecran(p)) === 'jeu', '« Effets » coupés : pas de compte, la partie part tout de suite');
  check(p.errs.length === 0, '« Effets » coupés : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Échap au clavier après le bouton Pause (canevas de nouveau au focus) ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 1280, scenario: { arcadeGame: 'paillettes' }, reducedMotion: 'reduce' });
  await p.waitForSelector('#arc-jouer', { timeout: 5000 });
  await p.click('#arc-jouer');
  await p.click('#arc-pause');
  await p.keyboard.press('Escape');
  check((await ecran(p)) === 'jeu', 'pause : Échap reprend juste après le bouton Pause');
  await p.ctx.close();

  /* ---------- Domu-mobile, score refusé par le serveur ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 1280, scenario: { arcadeGame: 'domu', arcadeBadScore: true } });
  await p.waitForSelector('#arc-jouer', { timeout: 5000 });
  check((await p.locator('.arc-jeu[aria-pressed="true"]').innerText()).includes('Domu-mobile'), 'sélecteur : Domu-mobile (jeu du jour)');
  await p.clock.install();
  await p.click('#arc-jouer');
  for (let i = 0; i < 950 && !(await p.locator('#arc-jouer').isEnabled()); i++) { await p.keyboard.press(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.clock.runFor(100); }
  await sleep(400);
  check((await p.textContent('#arc-msg')).includes('Score non retenu : Score impossible'), 'serveur : score refusé, message clair');
  check(p.errs.length === 0, 'Domu-mobile : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Adresse #arcade-<jeu> : choix au chargement, puis changement d'adresse et de jeu ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade-domu', width: 1280, scenario: { arcadeGame: 'raclette' } });
  await p.waitForSelector('#arc-jouer', { timeout: 5000 });
  check((await p.getAttribute('.arc-jeu[data-game="domu"]', 'aria-pressed')) === 'true', 'adresse #arcade-domu : Domu-mobile choisi');
  check((await p.locator('.arc-jeu[data-game="raclette"] .arc-tire-badge').isVisible()), 'adresse #arcade-domu : le jeu du jour reste étiqueté');
  await p.evaluate(() => { location.hash = '#arcade-paillettes'; });
  await p.waitForFunction(() => document.querySelector('.arc-jeu[data-game="paillettes"]')?.getAttribute('aria-pressed') === 'true', null, { timeout: 5000 }).catch(() => {});
  check((await p.getAttribute('.arc-jeu[data-game="paillettes"]', 'aria-pressed')) === 'true', 'adresse changée (#arcade-paillettes) pendant que l’onglet est ouvert : Paillettes choisi');
  await p.click('.arc-jeu[data-game="raclette"]');
  await p.waitForFunction(() => document.querySelector('#arc-canvas')?.getAttribute('aria-label')?.includes('Raclette'), null, { timeout: 5000 }).catch(() => {});
  check((await p.getAttribute('#arc-canvas', 'aria-label')).includes('Raclette'), 'sélecteur : cliquer Raclette charge le jeu (canevas)');
  check((await p.locator('.arc-jeu[aria-pressed="true"]').getAttribute('data-game')) === 'raclette', 'sélecteur : Raclette marqué');
  check(p.errs.length === 0, 'adresse et sélecteur : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  /* ---------- 360 px et animation réduite ---------- */
  p = await openPage(browser, { page: 'jeux', hash: '#arcade', width: 360, height: 800, reducedMotion: 'reduce' });
  await p.waitForSelector('#arc-canvas', { timeout: 5000 });
  check(await hscroll(p) <= 0, '360 px : pas de défilement horizontal');
  const tailles = await p.$$eval('.arc button, .jeux-tab', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height));
  check(tailles.every((h) => h >= 44), 'cibles : boutons d’au moins 44 px');
  await p.click('#arc-jouer');
  check((await ecran(p)) === 'jeu', 'animation réduite : pas de compte, la partie part tout de suite');
  await p.ctx.close();

  await browser.close();
  finish();
})();
