require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours « Ma carte Champion », nouvelle version (migration 202) : trois étapes, étape incomplète refusée, jeu libre, mot « Je suis »,
// 20 emblèmes, couleur, motif, inscription, Inspire-moi, image du membre (type et poids), dépôt dans son dossier, retrait du fichier
// si la proposition est refusée par le serveur ou retirée ; ancienne proposition affichée avec son emblème ; panneau Staff.
// Faux Supabase : fixtures/fake-sb-cartes.mjs. Lancer : node tests/parcours/cartes/parcours-champion-v2.cjs
const os = require('os');
const fs = require('fs');
const path = require('path');
const { openPage, check, finish, hscroll, sleep, log, adminSection, chromium } = require('../../lib/harness.cjs');

const F = 'fake-sb-cartes.mjs';
const ouvrir = async (pg) => {
  await sleep(400);
  await pg.click('[data-action="champion"]');
  await pg.waitForSelector('#champ-title');
  await sleep(200);
};
const suite = (pg) => pg.click('.mc-nav [type=submit]').then(() => sleep(120));
const src = (pg) => pg.$eval('#champ-preview img', (i) => i.getAttribute('src'));
// Petit PNG valide (1 × 1), puis un fichier texte et un fichier trop lourd.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'champ-'));
const png = path.join(dir, 'a.png'), txt = path.join(dir, 'a.txt'), lourd = path.join(dir, 'b.png');
fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
fs.writeFileSync(txt, 'pas une image');
fs.writeFileSync(lourd, Buffer.alloc(2 * 1024 * 1024 + 1));

(async () => {
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'cartes', fixture: F, width: 1280, height: 900, scenario: { champion: 'aucune' }, hash: '#collection' });
  await ouvrir(p);
  check(await p.$$eval('.mc-etapes li', (l) => l.length) === 3, 'trois étapes');
  check(await p.$$eval('[name="champ-game"]', (l) => l.length) === 10 && await p.$$eval('[name="champ-word"]', (l) => l.length) === 7, '10 jeux, 7 mots');
  await suite(p);
  check(await p.$('[name="champ-game"]') !== null, 'étape 1 incomplète : on reste');
  await p.click('.champ-chip:has(input[value="autre"])');
  await sleep(120);
  await p.fill('#champ-main', 'Rose');
  await suite(p);
  check(await p.$('[name="champ-game"]') !== null, 'jeu libre sans nom : on reste');
  await p.fill('#champ-game-label', 'Mon <b>jeu');
  await p.click('.champ-chip:has(input[value="capitaine"])');
  await sleep(120);
  const t1 = await p.$eval('#champ-preview', (e) => e.innerText);
  check(/capitaine Rose/i.test(t1) && /Mon <b>jeu · édition/i.test(t1), 'aperçu : mot, jeu libre, texte échappé');
  await suite(p);
  check(await p.$$eval('[name="champ-emblem"]', (l) => l.length) === 20, '20 emblèmes');
  check(await p.$$eval('[name="champ-color"]', (l) => l.length) === 7 && await p.$$eval('[name="champ-pattern"]', (l) => l.length) === 5, '7 couleurs, 5 motifs');
  const a = await src(p);
  await p.click('.mc-couleurs label:nth-child(5)');
  await sleep(100);
  const b = await src(p);
  await p.click('.champ-chip:has(input[value="rayons"])');
  await sleep(100);
  const c = await src(p);
  check(/^data:image\//.test(a) && a !== b && b !== c, 'couleur et motif changent l’aperçu');
  await p.screenshot({ path: path.join(__dirname, '..', '..', 'shots', 'champion-v2-etape2.png') });
  await p.click('.champ-chip:has(input[value="photo"])');
  await sleep(150);
  check(/pas encore de photo/.test(await p.$eval('.mc-aide', (e) => e.innerText)), 'sans photo de profil : message');
  await suite(p);
  check(await p.$('[name="champ-source"]') !== null, 'sans photo de profil : on reste');
  await p.click('.champ-chip:has(input[value="image"])');
  await sleep(150);
  await p.setInputFiles('#champ-file', txt);
  await sleep(150);
  await suite(p);
  check(await p.$('#champ-file') !== null, 'fichier refusé (type) : on reste');
  await p.setInputFiles('#champ-file', lourd);
  await sleep(150);
  await suite(p);
  check(await p.$('#champ-file') !== null, 'fichier refusé (poids) : on reste');
  await p.setInputFiles('#champ-file', png);
  await sleep(300);
  check(/autre image/.test(await p.$eval('[data-champ="pick"]', (e) => e.innerText)), 'image acceptée');
  await suite(p);
  await p.click('[data-champ="inspire"]');
  await sleep(100);
  check((await p.inputValue('#champ-flavor')).length > 0, 'Inspire-moi remplit la phrase');
  const d = await src(p);
  await p.fill('#champ-ins', 'Depuis 2019');
  await sleep(100);
  check(await src(p) !== d, 'inscription dans l’image');
  await p.click('[data-champ="back"]');
  await sleep(100);
  await suite(p);
  check(await p.inputValue('#champ-ins') === 'Depuis 2019', 'retour : saisie gardée');
  await p.click('.champ-submit');
  await sleep(500);
  const L = await log(p);
  const up = L.find((l) => l[0] === 'upload');
  check(up && /^00000001-[0-9a-f-]{27}\/[a-z0-9]+\.(webp|jpg)$/.test(up[1]), `image déposée dans le dossier du membre (${up?.[1]})`);
  const call = L.find((l) => l[1] === 'hg_champion_propose');
  const q = call?.[2].p;
  check(q && q.game === 'autre' && q.game_label === 'Mon <b>jeu' && q.title === 'capitaine' && q.source === 'image' && q.pattern === 'rayons' && q.color === '#2B5AE2' && q.inscription === 'Depuis 2019' && q.image_path === up[1], 'proposition complète');
  await p.click('[data-champ="withdraw"]');
  await sleep(400);
  check((await log(p)).some((l) => l[0] === 'remove' && JSON.stringify(l[1]).includes(up[1])), 'retrait : fichier retiré');
  check(p.errs.length === 0, `aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  // Le serveur refuse : le fichier ne reste pas.
  const r = await openPage(browser, { page: 'cartes', fixture: F, width: 1280, height: 900, scenario: { champion: 'aucune' }, hash: '#collection' });
  await ouvrir(r);
  await r.evaluate(() => { const o = window.__SB.rpc.bind(window.__SB); window.__SB.rpc = (n, a) => (n === 'hg_champion_propose' ? Promise.resolve({ data: null, error: { message: 'Refus du serveur' } }) : o(n, a)); });
  await r.fill('#champ-main', 'Ahri');
  await suite(r); await suite(r);
  await r.click('.champ-submit');
  await sleep(500);
  const L2 = await log(r);
  const up2 = L2.find((l) => l[0] === 'upload');
  check(up2 && L2.some((l) => l[0] === 'remove' && JSON.stringify(l[1]).includes(up2[1])) && await r.$('.champ-submit') !== null, 'refus du serveur : fichier retiré, formulaire gardé');
  await r.ctx.close();

  // Ancienne proposition, sans image composée : son emblème.
  const o = await openPage(browser, { page: 'cartes', fixture: F, width: 1280, height: 900, scenario: { champion: 'proposee' }, hash: '#collection' });
  await ouvrir(o);
  check(/assets\/cartes\/champions\/baton\.svg$/.test(await src(o)) && /Ethan · main Ahri/i.test(await o.$eval('#champ-preview', (e) => e.innerText)), 'ancienne proposition : emblème et « main »');
  await o.ctx.close();

  // Téléphone
  const t = await openPage(browser, { page: 'cartes', fixture: F, width: 360, height: 800, scenario: { champion: 'aucune' }, hash: '#collection' });
  await ouvrir(t);
  await t.fill('#champ-main', 'Ahri');
  await suite(t);
  check(await t.$eval('#cartes-champion', (e) => e.scrollWidth <= e.clientWidth + 1) && await hscroll(t) === 0, '360 px : pas de défilement horizontal');
  const petits = await t.$$eval('#cartes-champion :is(.champ-chip span, .champ-emb-i, .mc-couleurs > label > span, .mc-nav .btn)', (els) => els.filter((e) => e.getBoundingClientRect().height < 44).length);
  check(petits === 0, `360 px : cibles ≥ 44 px (${petits})`);
  await t.screenshot({ path: path.join(__dirname, '..', '..', 'shots', 'champion-v2-360.png') });
  await t.ctx.close();

  // Panneau Staff : image du membre signalée, refus avec retrait du fichier.
  const ad = await openPage(browser, { page: 'admin', fixture: F, width: 1280, height: 900 });
  await ad.evaluate(() => { window.__CHAMPS = [{ id: 7, user_id: '00000000-0000-4000-8000-000000000002', pseudo: 'Alice', avatar_url: null, color: '#C9A227', year: 2026, game: 'uno', main: 'la pioche', title: 'la terreur de', emblem: 'carte', flavor: null, inscription: 'Depuis 2019', source: 'image', image_path: '00000000-0000-4000-8000-000000000002/abc.webp', created_at: new Date().toISOString() }]; });
  await adminSection(ad, 'cartes/champions');
  await sleep(500);
  const txtAd = await ad.$eval('#champions-root', (e) => e.innerText);
  check(/Alice · la terreur de la pioche/i.test(txtAd) && /Image du membre/.test(txtAd) && /aucun logo/.test(txtAd) && /Depuis 2019/.test(txtAd), 'Staff : titre, source, relecture, inscription');
  await ad.click('[data-champ-act="ko"]');
  await sleep(300);
  await ad.click('dialog.hg-dialog button[value="ok"]');
  await sleep(500);
  const La = await log(ad);
  check(La.some((l) => l[1] === 'hg_champion_review' && l[2].p_accept === false) && La.some((l) => l[0] === 'remove' && JSON.stringify(l[1]).includes('abc.webp')), 'refus : fichier retiré');
  check(ad.errs.length === 0, `panel : aucune erreur (${ad.errs.join(' | ') || 'rien'})`);
  await ad.ctx.close();
  await browser.close();
  fs.rmSync(dir, { recursive: true, force: true });
  finish();
})();
