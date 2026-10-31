require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours Blackjack (plateaux, migration 143) : table et bandeau, mise rapide puis « Miser » (hg_plat_agir miser 100),
// une main jouée (Tirer puis Rester), dernier règlement dans la colonne de droite, classement, 390 px sans défilement
// horizontal, écran de fin avec une carte par joueur, aucune erreur JS. Faux Supabase : fixtures/fake-sb-plateaux-cartes.mjs.
const { check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-plateaux-cartes.mjs';
/** Dernier appel d'une fonction RPC journalisé par le faux client. */
const dernierRpc = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn).pop();

(async () => {
  const browser = await chromium.launch();

  // ----- Ordinateur : table, mise, une main -----
  let p = await openPage(browser, { page: 'blackjack', fixture: FIX, scenario: { jeu: 'blackjack' }, hash: '#partie/HGBJK-1234', width: 1280, height: 900 });
  await p.waitForSelector('.bj-tapis', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.bj-bandeau h1').innerText()) === 'Blackjack', 'titre : « Blackjack » dans le bandeau');
  check((await p.locator('.bj-bandeau').innerText()).includes('Manche 3 sur 8'), 'manche : « Manche 3 sur 8 »');
  check((await p.locator('.bj-siege').count()) === 3, 'trois sièges : Ethan, Alice et Bruno');
  check(/^1.000$/.test(await p.locator('.bj-siege.is-moi .bj-jetons-nombre').innerText()), 'jetons : 1 000 pour moi (format suisse)');
  check((await p.locator('.bj-banque-phase').innerText()) === 'Faites vos jeux', 'banque : « Faites vos jeux » en phase de mise');
  check((await p.locator('.bj-banque .bj-vide').count()) === 1, 'banque : pas encore de cartes en phase de mise');
  check((await p.locator('.bj-panneau h2').innerText()) === 'Fais ta mise', 'panneau : « Fais ta mise » (c\'est à moi de miser)');
  check((await p.locator('#bj-mise-curseur').getAttribute('max')) === '500', 'curseur : plafonné à 500 jetons');
  check((await p.locator('.bj-rapide').count()) === 6, 'six mises rapides : 10, 25, 50, 100, 250, 500');
  check((await p.locator('.bj-classement li').count()) === 3, 'classement aux jetons : trois joueurs');
  const derniere = await p.locator('[aria-labelledby="bj-derniere-titre"]').innerText();
  check(derniere.includes('Alice gagne 25 jetons.') && derniere.includes('La banque a 19.'), 'dernière manche : résultats de la manche précédente');
  check((await p.locator('.bj-table [aria-label]').count()) > 0, 'accessibilité : zones nommées (aria-label)');

  await p.click('[data-rapide="100"]');
  check((await p.locator('#bj-mise-curseur').inputValue()) === '100' && (await p.locator('#bj-mise-val').innerText()) === '100', 'mise rapide 100 : curseur et valeur affichée à 100');
  await p.click('[data-miser]');
  await sleep(600);
  let r = await dernierRpc(p, 'hg_plat_agir');
  check(r && r[2].p_action === 'miser' && r[2].p_args.montant === 100 && r[2].p_code === 'HGBJK-1234', 'miser : hg_plat_agir(miser, { montant: 100 }) sur HGBJK-1234');
  await p.waitForFunction(() => document.querySelector('#bj-action-titre')?.textContent === 'Ton tour', null, { timeout: 4000 }).catch(() => {});
  check((await p.locator('.bj-panneau h2').innerText()) === 'Ton tour', 'après la mise : « Ton tour »');
  check((await p.locator('[data-action="tirer"]').count()) === 1 && (await p.locator('[data-action="rester"]').count()) === 1, 'actions : Tirer et Rester');
  check((await p.locator('[data-action="doubler"]').count()) === 1, 'doubler proposé : deux cartes et assez de jetons');
  check((await p.locator('[data-action="separer"]').count()) === 0, 'séparer absent : pas de paire');
  check((await p.locator('.bj-siege.is-moi .bj-main-info').first().textContent()).includes('17'), 'ma main : total 17');
  check((await p.locator('.bj-cartes .cd').count()) >= 2 && (await p.locator('.bj-siege.is-moi .cd').first().getAttribute('aria-label')) === '10 de cœur', 'cartes : 10 de cœur visible, lisible par un lecteur d\'écran');
  check((await p.locator('.bj-banque .cd-dos').count()) === 1, 'banque : une carte cachée (dos) à côté de la carte visible');
  await p.click('[data-action="tirer"]');
  await sleep(600);
  r = await dernierRpc(p, 'hg_plat_agir');
  check(r && r[2].p_action === 'tirer', 'tirer : hg_plat_agir(tirer)');
  await p.waitForFunction(() => document.querySelector('.bj-siege.is-moi .bj-main-info')?.textContent.includes('18'), null, { timeout: 4000 }).catch(() => {});
  check((await p.locator('.bj-siege.is-moi .bj-main-info').first().textContent()).includes('18'), 'après Tirer : total 18');
  await p.click('[data-action="rester"]');
  await sleep(600);
  r = await dernierRpc(p, 'hg_plat_agir');
  check(r && r[2].p_action === 'rester', 'rester : hg_plat_agir(rester)');
  await p.waitForFunction(() => document.querySelector('#bj-action-titre')?.textContent === 'Fais ta mise', null, { timeout: 4000 }).catch(() => {});
  check((await p.locator('.bj-panneau h2').innerText()) === 'Fais ta mise', 'manche suivante : de nouveau « Fais ta mise »');
  check((await p.locator('[aria-labelledby="bj-derniere-titre"]').innerText()).includes('Ethan gagne 100 jetons.'), 'dernière manche : « Ethan gagne 100 jetons. »');
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/blackjack-1280.png', fullPage: true });
  check(p.errs.length === 0, '1280 px : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- Téléphone (390 px) : table, panneau, pas de défilement horizontal -----
  p = await openPage(browser, { page: 'blackjack', fixture: FIX, scenario: { jeu: 'blackjack' }, hash: '#partie/HGBJK-1234', width: 390, height: 844, mobile: true, dpr: 2 });
  await p.waitForSelector('.bj-tapis', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.bj-siege').count()) === 3, '390 px : trois sièges');
  check((await p.locator('.bj-tiroir-chat').evaluate((el) => getComputedStyle(el).display)) === 'block', '390 px : chat en tiroir');
  check((await p.locator('[data-rapide="500"]').boundingBox()).height >= 44, '390 px : boutons de mise à 44 px au moins');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/blackjack-390.png', fullPage: true });
  check(p.errs.length === 0, '390 px : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- 360 px : aucune largeur fixe ne déborde -----
  p = await openPage(browser, { page: 'blackjack', fixture: FIX, scenario: { jeu: 'blackjack' }, hash: '#partie/HGBJK-1234', width: 360, height: 780 });
  await p.waitForSelector('.bj-tapis', { timeout: 6000 }).catch(() => {});
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal');
  check(p.errs.length === 0, '360 px : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- Partie terminée : une carte par joueur -----
  p = await openPage(browser, { page: 'blackjack', fixture: FIX, scenario: { jeu: 'blackjack', fin: true }, hash: '#partie/HGBJK-1234', width: 1280, height: 900 });
  await p.waitForSelector('.bf-carte', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.plat-fin h1').innerText()) === 'Défaite', 'fin : titre « Défaite », je ne gagne pas');
  check((await p.locator('.bf-carte').count()) === 3, 'fin : une carte par joueur (trois)');
  check((await p.locator('.bf-carte.is-gagnant').innerText()).includes('Alice'), 'fin : Alice, première avec 1 225 jetons, est gagnante');
  check((await p.locator('.bf-carte').first().textContent()).includes('1er'), 'fin : rang « 1er » en tête');
  check((await hscroll(p)) <= 0, 'fin 1280 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/blackjack-fin-1280.png', fullPage: true });
  check(p.errs.length === 0, 'fin : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})();
