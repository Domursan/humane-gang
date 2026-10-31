// Parcours J8 : Sutom du gang (onglet « Sutom » de la page Jeux, section admin « Sutom du gang »).
// Téléphone 390 px : grille (première lettre donnée), clavier AZERTY à l'écran, essais au clavier physique, mot hors
// dictionnaire refusé sans compter, couleurs + formes (carré rouge, rond jaune) et annonce lecteur d'écran,
// partie gagnée : mot, définition, gain, partage. Le mot n'est jamais dans la page avant la fin.
// Faux Supabase : fixtures/fake-sb.mjs + fixtures/fake-jeux.js. Lancer : node tests/parcours/jeux/parcours-j8.cjs
const { SHOTS, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const path = require('path');
const fs = require('fs');

/** Tape un mot au clavier physique puis Entrée. */
async function tape(p, mot) {
  for (const c of mot.slice(1)) await p.keyboard.press(c);
  await p.keyboard.press('Enter');
  await sleep(250);
}

(async () => {
  const browser = await chromium.launch();
  fs.mkdirSync(SHOTS, { recursive: true });

  let p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 390, height: 844, init: 'fake-jeux.js' });
  await p.waitForSelector('.su-grid', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.su-head').innerText()).includes('Grille n°42 · 8 lettres'), 'en-tête : numéro de grille et longueur');
  check((await p.locator('.su-row').count()) === 6 && (await p.locator('.su-row').first().locator('.su-cell').count()) === 8, 'grille de 6 essais × 8 lettres');
  check((await p.locator('.su-row').first().locator('.su-cell').first().innerText()).trim() === 'R', 'première lettre donnée');
  check(!(await p.content()).includes('RACLETTE'), 'le mot n’est jamais dans la page avant la fin');
  check((await p.locator('.su-admin').count()) === 0, 'joueur ordinaire : pas d’encart solution');
  check((await p.locator('.su-kbd .su-key').count()) === 28, 'clavier : 26 lettres, Effacer et Entrée');
  check((await p.locator('.su-serie').innerText()).includes('9 jours'), 'série affichée');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  // Mot hors dictionnaire (clavier à l'écran) : refusé sans compter
  for (const c of 'ZZZZZZZ') await p.click(`.su-key[data-key="${c}"]`);
  await p.click('.su-key[data-key="Enter"]');
  await sleep(250);
  check((await p.locator('.su-msg').innerText()).includes('pas dans le dictionnaire'), 'mot hors dictionnaire : message');
  check((await p.locator('.su-row').first().evaluate((e) => e.classList.contains('fxj-secoue'))), 'effets : mot refusé, la ligne en cours est secouée');
  for (let i = 0; i < 7; i++) await p.click('.su-key[data-key="Backspace"]');
  // Essais au clavier physique
  await tape(p, 'RESTAURE');
  await sleep(450);
  const demi = p.locator('.su-row').first().locator('.su-cell');
  check((await demi.nth(0).getAttribute('class')).includes('is-2') && !/is-[012]/.test(await demi.nth(7).getAttribute('class')), 'effets : les cases se révèlent une à une (la première colorée, la dernière pas encore)');
  check((await p.locator('.su-key[data-key="U"]').getAttribute('class')).indexOf('is-0') < 0, 'effets : le clavier attend la révélation de la lettre');
  await sleep(2400);
  const l1 = p.locator('.su-row').first().locator('.su-cell');
  check((await l1.nth(0).getAttribute('class')).includes('is-2') && (await l1.nth(1).getAttribute('class')).includes('is-1') && (await l1.nth(2).getAttribute('class')).includes('is-0'), 'couleurs : R bien placée, E mal placée, S absente');
  check((await l1.nth(0).getAttribute('aria-label')) === 'R bien placée', 'lecteur d’écran : « R bien placée »');
  check((await p.locator('.su-msg').innerText()).startsWith('R bien placée, E mal placée, S absente'), 'annonce de l’essai (role status)');
  check((await p.locator('.su-key[data-key="S"]').getAttribute('class')).includes('is-0'), 'clavier : lettre absente grisée');
  await p.screenshot({ path: path.join(SHOTS, 'j8-sutom-390.png'), fullPage: true });
  await tape(p, 'raclette');
  await sleep(700);
  check(!(await p.locator('.su-end').isVisible()), 'effets : la carte de fin attend la fin de la révélation');
  await sleep(3800);
  await p.waitForSelector('.su-end', { timeout: 4000 }).catch(() => {});
  const fin = await p.locator('.su-end').innerText().catch(() => '');
  check(fin.includes('Bravo') && fin.includes('RACLETTE') && fin.includes('Plat sacré'), 'gagné : mot et définition à la sauce du gang');
  check(fin.includes('+10'), 'gagné : +10 Paillettes affiché dans la carte de fin (un seul gain)');
  check(/^[0-9]+ PTS?$/.test(await p.locator('.su-end .fxj-tampon').textContent()) && (await p.locator('.su-end.fxj-entree').count()) === 1, 'effets : tampon de points (calculé d’après le gain du faux serveur) et carte de fin animée');
  check((await p.locator('.su-kbd').count()) === 0, 'fin de partie : clavier retiré');
  // Le presse-papiers du navigateur de test n'est pas fiable (focus) : on capte ce que le bouton écrit.
  await p.evaluate(() => {
    window.__copie = null;
    const faux = { writeText: async (t) => { window.__copie = t; }, readText: async () => window.__copie || '' };
    try { Object.defineProperty(navigator, 'clipboard', { value: faux, configurable: true }); } catch (e) { /* non redéfinissable : on garde le presse-papiers natif */ }
  });
  await p.click('[data-share]');
  await sleep(200);
  const txt = (await p.evaluate(() => window.__copie).catch(() => null)) || '';
  check(txt.startsWith('Sutom du gang #42 2/6') && !txt.includes('RACLETTE') && txt.includes('🟥'), `partage : « Sutom du gang #42 2/6 » à cases, sans le mot (presse-papiers : ${JSON.stringify(txt.slice(0, 40))})`);
  const g = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_sutom_guess').map((e) => e[2].p_word);
  check(g.join(',') === 'RZZZZZZZ,RESTAURE,RACLETTE', 'appels : chaque essai part au serveur (y compris le refusé)');
  check(p.errs.length === 0, 'aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.screenshot({ path: path.join(SHOTS, 'j8-sutom-fin.png'), fullPage: true });
  await p.ctx.close();

  // Partie déjà finie à l'ouverture : carte de fin et gain tout de suite, sans effet d'entrée ni confettis
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 390, init: 'fake-jeux.js', scenario: { jeux: { fini: true } } });
  await p.waitForSelector('.su-end', { timeout: 6000 }).catch(() => {});
  await sleep(300);
  check((await p.locator('.su-end').isVisible()) && (await p.locator('.su-end').innerText()).includes('+10'), 'ouverture d’une partie finie : carte de fin et gain affichés d’emblée');
  check((await p.locator('.su-end .fxj-tampon').count()) === 1 && (await p.locator('.su-end.fxj-entree').count()) === 0 && (await p.locator('.fxj-confettis').count()) === 0, 'ouverture d’une partie finie : tampon posé, aucun effet d’entrée');
  await p.ctx.close();

  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 390, init: 'fake-jeux.js', scenario: { jeux: { vide: true } } });
  await p.waitForSelector('.su .card', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.su').innerText()).includes('Pas de grille aujourd’hui'), 'sans mot : message');
  await p.ctx.close();

  // Compte admin : bouton « Réponses », la solution ne s'affiche qu'au clic, dans la fenêtre spéciale
  p = await openPage(browser, { page: 'jeux', hash: '#sutom', width: 390, init: 'fake-jeux.js', scenario: { jeux: { admin: true } } });
  await p.waitForSelector('.adrep-btn[data-jeu="sutom"]', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.adrep-btn[data-jeu="sutom"]').count()) === 1 && !(await p.content()).includes('RACLETTE'), 'admin : bouton « Réponses » présent, mot absent de la page');
  await p.click('.adrep-btn[data-jeu="sutom"]');
  await p.waitForSelector('dialog.adrep[open] .adrep-l', { timeout: 4000 }).catch(() => {});
  check((await p.locator('dialog.adrep[open]').innerText()).includes('RACLETTE'), 'admin : la solution s’affiche dans la fenêtre « Réponses »');
  await p.mouse.click(5, 5);
  await p.waitForTimeout(200);
  check((await p.locator('dialog.adrep').count()) === 0, 'admin : clic à côté, la fenêtre se ferme');
  check((await hscroll(p)) <= 0 && p.errs.length === 0, 'admin : pas de défilement horizontal ni d’erreur JS');
  await p.screenshot({ path: path.join(SHOTS, 'j8-sutom-admin.png'), fullPage: true });
  await p.ctx.close();

  /* ---------- Admin ---------- */
  p = await openPage(browser, { page: 'admin', width: 1280, init: 'fake-jeux.js' });
  await adminSection(p, 'fete/sutom');
  await p.waitForSelector('.ads', { timeout: 5000 }).catch(() => {});
  check(!(await p.locator('#sutom-root').innerText()).includes('RACLETTE'), 'admin : mots masqués par défaut (pas de spoiler)');
  await p.click('[data-voir]');
  check((await p.locator('#sutom-root').innerText()).includes('RACLETTE'), 'admin : « Afficher les mots » montre la banque et le mot du jour');
  await p.click('[data-banque]');
  check((await p.locator('.ads-mot').count()) === 2 && (await p.locator('.ads-mot').first().innerText()).includes('GOBELET'), 'banque : consultable, triée par ordre alphabétique');
  await p.fill('#ads-q', 'lyon');
  check((await p.locator('.ads-mot').count()) === 1, 'banque : recherche dans les définitions');
  await p.fill('#ads-q', '');
  await p.click('[data-filtre="jamais"]');
  check((await p.locator('.ads-mot').count()) === 1 && (await p.locator('.ads-mot').innerText()).includes('GOBELET'), 'banque : filtre « Jamais servis »');
  await p.click('[data-filtre="tous"]');
  await p.click('[data-edit="RACLETTE"]');
  check((await p.inputValue('#ads-word')) === 'RACLETTE' && (await p.inputValue('#ads-def')).startsWith('Plat'), 'banque : « Modifier » remplit le formulaire');
  await p.setViewportSize({ width: 390, height: 844 });
  check((await hscroll(p)) <= 0, 'banque : pas de défilement horizontal à 390 px');
  await p.screenshot({ path: path.join(SHOTS, 'j8-sutom-banque-390.png'), fullPage: true });
  await p.setViewportSize({ width: 1280, height: 900 });
  await p.fill('#ads-word', 'crêpe');
  await p.fill('#ads-def', 'Spécialité du nouvel an');
  await p.click('[data-form="bank"] [type="submit"]');
  await sleep(400);
  check((await p.locator('#sutom-root').innerText()).includes('CREPE'), 'admin : mot ajouté (normalisé)');
  check(p.errs.length === 0, 'admin : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})();
