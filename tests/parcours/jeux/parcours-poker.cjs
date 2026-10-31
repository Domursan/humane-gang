require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours Poker (plateaux, migration 143) : table ovale, sièges, cartes communes vides, « Tes cartes » en grand, dernier
// abattage (cartes montrées et nom des mains), actions Suivre (hg_plat_agir suivre), puis relance à la moitié du pot et
// au pot (hg_plat_agir relancer, montant lu sur le curseur), Se coucher ; 390 px sans défilement horizontal ;
// fin de partie avec une carte par joueur ; aucune erreur JS. Faux Supabase : fixtures/fake-sb-plateaux-cartes.mjs.
const { check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-plateaux-cartes.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const BRUNO = '00000003-0000-4000-8000-000000000003';
/** Dernier appel d'une fonction RPC journalisé par le faux client. */
const dernierRpc = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn).pop();
/** Fait passer la main à moi (le faux l'annonce à la prochaine relecture de la page). */
const mabTour = (p) => p.evaluate((uid) => window.__CARTES.tourDe(uid), ME);
/** Attend qu'un bouton d'action apparaisse dans le panneau. */
const attendreAction = (p, sel) => p.waitForSelector(sel, { timeout: 8000 }).catch(() => {});

(async () => {
  const browser = await chromium.launch();

  // ----- Ordinateur : table, mes cartes, abattage, Suivre, relance, se coucher -----
  let p = await openPage(browser, { page: 'poker', fixture: FIX, scenario: { jeu: 'poker' }, hash: '#partie/HGPOK-1234', width: 1280, height: 900 });
  await p.waitForSelector('.pk-tapis', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.pk-bandeau h1').innerText()) === 'Poker', 'titre : « Poker » dans le bandeau');
  check((await p.locator('.pk-bandeau').innerText()).includes('Tour n° 4'), 'bandeau : « Tour n° 4 » (numéro de la main)');
  check((await p.locator('.pk-siege').count()) === 4, 'quatre sièges autour de la table');
  check((await p.locator('.pk-siege.is-couche').count()) === 1, 'Alice couchée : siège grisé');
  check((await p.locator('.pk-siege .is-donneur').count()) === 1, 'donneur « D » marqué sur un siège');
  check((await p.locator('.pk-emplacement').count()) === 5, 'cinq emplacements de cartes communes vides (préflop)');
  check((await p.locator('.pk-pot strong').innerText()) === '15', 'pot : 15 jetons (blindes et mises)');
  check((await p.locator('.pk-phase').textContent()).includes('Préflop') && (await p.locator('.pk-phase').textContent()).includes('Main n° 4'), 'phase : « Préflop · Main n° 4 »');
  check((await p.locator('.pk-blindes').innerText()).includes('5') && (await p.locator('.pk-blindes').innerText()).includes('10'), 'blindes : 5 / 10');
  const mesCartes = await p.locator('.pk-mes-cartes .cd').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check(mesCartes.length === 2 && mesCartes[0] === 'As de cœur' && mesCartes[1] === 'Roi de cœur', 'tes cartes : As de cœur et Roi de cœur, en grand');
  check((await p.locator('.pk-panneau').textContent()).includes('Avant le flop'), 'force : « Avant le flop » (pas encore de cartes communes)');
  check((await p.locator('.pk-abat-ligne').count()) === 2 && (await p.locator('.pk-abattage').textContent()).includes('Paire'), 'dernier abattage : deux mains montrées, dont une Paire');
  check((await p.locator('.pk-abattage .cd').count()) === 9, 'dernier abattage : cinq cartes communes et deux cartes par joueur révélé (neuf cartes)');
  check((await p.locator('.pk-panneau .pk-titre').innerText()) === 'À toi de parler', 'panneau : « À toi de parler »');
  check((await p.locator('[data-action="suivre"]').innerText()) === 'Suivre 10', 'bouton : « Suivre 10 » (10 à suivre)');
  check((await p.locator('[data-action="se_coucher"]').count()) === 1 && (await p.locator('[data-action="tapis"]').count()) === 1, 'boutons : Se coucher et Tapis');
  check((await p.locator('#pk-relance-curseur').count()) === 1, 'relance : curseur proposé (j\'ai assez de jetons)');
  check((await p.locator('#pk-relance-curseur').getAttribute('min')) === '20', 'relance : minimum 20 (10 + relance minimale 10)');
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/poker-1280.png', fullPage: true });

  // Suivre
  await p.click('[data-action="suivre"]');
  await sleep(600);
  let r = await dernierRpc(p, 'hg_plat_agir');
  check(r && r[2].p_action === 'suivre' && r[2].p_code === 'HGPOK-1234' && Object.keys(r[2].p_args).length === 0, 'suivre : hg_plat_agir(suivre, {}) sur HGPOK-1234');
  await p.waitForFunction(() => document.querySelector('.pk-panneau .pk-titre')?.textContent.includes('Bruno'), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.pk-panneau .pk-titre').innerText()).includes('C\'est à Bruno'), 'après Suivre : c\'est à Bruno de parler');
  check((await p.locator('.pk-siege.is-tour .pk-pseudo').innerText()) === 'Bruno', 'siège de Bruno marqué comme celui qui parle');

  // Relance à la moitié du pot, puis au pot, puis envoi
  await mabTour(p);
  await attendreAction(p, '[data-relancer]');
  check((await p.locator('[data-action="suivre"]').innerText()) === 'Parole', 'mise à suivre nulle : « Parole »');
  const pot = Number(await p.locator('.pk-pot strong').innerText());
  check(pot === 25, 'pot après Suivre : 25 jetons (10 moi, 5 Bruno, 10 Chloé)');
  await p.locator('[data-rapide]').nth(1).click();
  const valeurPot = await p.locator('#pk-relance-curseur').inputValue();
  check(valeurPot === '35' && (await p.locator('#pk-relance-val').innerText()) === '35', 'relance au pot : 10 + 25 = 35 sur le curseur');
  await p.click('[data-relancer]');
  await sleep(600);
  r = await dernierRpc(p, 'hg_plat_agir');
  check(r && r[2].p_action === 'relancer' && r[2].p_args.montant === 35, 'relancer : hg_plat_agir(relancer, { montant: 35 })');

  // Se coucher
  await mabTour(p);
  await attendreAction(p, '[data-action="se_coucher"]');
  await p.click('[data-action="se_coucher"]');
  await sleep(600);
  r = await dernierRpc(p, 'hg_plat_agir');
  check(r && r[2].p_action === 'se_coucher' && Object.keys(r[2].p_args).length === 0, 'se coucher : hg_plat_agir(se_coucher, {})');
  check(p.errs.length === 0, '1280 px : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- Téléphone (390 px) : table ovale, panneau, pas de défilement horizontal -----
  p = await openPage(browser, { page: 'poker', fixture: FIX, scenario: { jeu: 'poker' }, hash: '#partie/HGPOK-1234', width: 390, height: 844, mobile: true, dpr: 2 });
  await p.waitForSelector('.pk-tapis', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.pk-siege').count()) === 4, '390 px : quatre sièges');
  check((await p.locator('.pk-tiroir-chat').evaluate((el) => getComputedStyle(el).display)) === 'block', '390 px : chat en tiroir');
  check((await p.locator('[data-action="suivre"]').boundingBox()).height >= 44, '390 px : boutons d\'action à 44 px au moins');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/poker-390.png', fullPage: true });
  check(p.errs.length === 0, '390 px : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- 360 px : aucune largeur fixe ne déborde -----
  p = await openPage(browser, { page: 'poker', fixture: FIX, scenario: { jeu: 'poker' }, hash: '#partie/HGPOK-1234', width: 360, height: 780 });
  await p.waitForSelector('.pk-tapis', { timeout: 6000 }).catch(() => {});
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal');
  check(p.errs.length === 0, '360 px : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- Partie terminée : une carte par joueur -----
  p = await openPage(browser, { page: 'poker', fixture: FIX, scenario: { jeu: 'poker', fin: true }, hash: '#partie/HGPOK-1234', width: 1280, height: 900 });
  await p.waitForSelector('.pf-carte', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.plat-fin h1').innerText()) === 'Victoire !', 'fin : titre « Victoire ! », à égalité je passe en tête');
  check((await p.locator('.pf-carte').count()) === 4, 'fin : une carte par joueur (quatre)');
  check((await p.locator('.pf-carte.is-gagnant').count()) === 1, 'fin : un seul gagnant mis en avant');
  check((await hscroll(p)) <= 0, 'fin 1280 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/poker-fin-1280.png', fullPage: true });
  check(p.errs.length === 0, 'fin : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})();
