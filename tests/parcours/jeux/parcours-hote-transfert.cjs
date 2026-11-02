// Parcours du transfert d'hôte (migration 199, règles testées en SQL) : message d'une salle d'attente dont l'hôte a disparu, vu par le
// nouvel hôte, la table et l'ancien hôte, au Uno, au Blackjack, à Nom de code et au Loup-Garou ; meneur parti, en salle, à l'écran
// « Rejoindre » et en cours de partie ; pseudo échappé ; téléphone sans débordement ; revanche Uno ouverte à tout membre.
// Faux serveur : fixtures/fake-salons.js et fake-sb-plateaux-cartes.mjs, l'état renvoyé est retouché par window.__PATCH.
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, log, sleep, chromium, FIXTURES } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const MOI = U(2), BRUNO = U(3), SACHA = U(9);
const OUVERT = ['uno', 'nom-de-code', 'loup-garou'].map((slug, i) => ({ slug, label: slug, mode: 'membres', in_nav: false, sort: 900 + i }));
const MEMBRE = { uid: MOI, pagesExtra: OUVERT };
const SALONS = fs.readFileSync(path.join(FIXTURES, 'fake-salons.js'), 'utf8');

/** Retouche de l'état, à la manière du serveur : salle ouverte, hôte et transfert donnés par le scénario. */
const RETOUCHE = `(() => {
  const S = window.__SCN || {};
  const salle = (e) => { const p = e.partie, h = S.hote; if (S.statut) { p.statut = S.statut; p.tour = null; p.tour_fin = null; p.started_at = null; }
    if (p.statut === 'terminee') { p.ended_at = new Date().toISOString(); p.suite = S.suite || null; }
    if (h) { p.hote = h; }
    if (e.moi) { e.moi.user_id = e.moi.user_id || S.uid; e.moi.hote = p.hote === e.moi.user_id; if ('meneur' in e.moi) e.moi.meneur = false; }
    if (S.mode) p.mode = S.mode;
    if (S.hote_passe !== undefined) e.hote_passe = S.hote_passe; if (S.meneur_parti) e.meneur_parti = true; if (S.visiteur) e.moi = null; return e; };
  window.__PATCH = salle;
  const prev = window.__FAKE_RPC;
  window.__FAKE_RPC = async (fn, a) => {
    if (fn === 'hg_uno_rejouer') return { data: 'HGUNO-7777', error: null };
    if (fn === 'hg_uno_rejoindre') return { data: 'HGUNO-7777', error: null };
    const r = typeof prev === 'function' ? await prev(fn, a) : undefined;
    if (r?.data && (/_etat$/.test(fn) || (/_invite$/.test(fn) && a.p_action === 'etat'))) return { data: salle(JSON.parse(JSON.stringify(r.data))), error: null };
    return r;
  };
})();`;

const passe = (nouveau, nom, o = {}) => ({ ancien: SACHA, ancien_nom: 'Sacha', nouveau, nouveau_nom: nom, meneur: false, ...o });
const TOUT = (extra) => ({ ...MEMBRE, statut: 'attente', ...extra });
const UNO = (s, o = {}) => ({ page: 'uno', hash: '#partie/HGUNO-4242', scenario: { ...TOUT(s), salon: 'uno' }, ...o });
const NDC = (s) => ({ page: 'nom-de-code', hash: '#partie/HGNDC-4242', scenario: { ...TOUT(s), salon: 'nom-de-code' } });
const LG = (s, o = {}) => ({ page: 'loup-garou', hash: '#partie/HGLG-4242', scenario: { ...TOUT(s), salon: 'loup-garou' }, ...o });
const BJ = (s) => ({ page: 'blackjack', hash: '#partie/HGBJK-1234', fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'blackjack', statut: 'attente', ...s } });

const ouvrir = (browser, c, o = {}) => openPage(browser, { width: 1280, height: 900, ...c, ...o, init: { content: `${c.fixture ? '' : SALONS}\n${RETOUCHE}` } });
const message = (p) => p.locator('.hote-msg').innerText({ timeout: 8000 });
const appels = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn);

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const suivre = (p) => { p.on('pageerror', (e) => erreurs.push(e.message)); return p; };

  // ----- Uno : trois lectures -----
  let p = suivre(await ouvrir(browser, UNO({ hote: MOI, hote_passe: passe(MOI, 'Moi') })));
  check((await message(p)) === 'Sacha n’est plus là depuis 5 minutes : tu deviens l’hôte. Tu peux lancer la partie, retirer un joueur et changer les règles.', 'Uno : texte du nouvel hôte');
  check(await p.locator('.hote-msg').evaluate((e) => e.classList.contains('is-moi') && e.getAttribute('role') === 'status'), 'Uno : bloc mis en avant, annoncé aux lecteurs d\'écran');
  check((await p.locator('.hote-msg button').count()) === 0, 'Uno : pas de bouton pour fermer le message');
  check(await p.evaluate(() => document.querySelector('.uno-fil').nextElementSibling.querySelector('.hote-msg') !== null), 'Uno : sous le fil d\'Ariane');
  check(await p.locator('.hote-msg').evaluate((e) => getComputedStyle(e).backgroundColor === 'rgb(251, 211, 45)' && getComputedStyle(e).color === 'rgb(0, 0, 0)'), 'Uno : couleurs de la maquette');
  await p.context().close();

  p = suivre(await ouvrir(browser, UNO({ hote: BRUNO, hote_passe: passe(BRUNO, 'Bruno') })));
  check((await message(p)) === 'Sacha n’est plus là depuis 5 minutes : Bruno devient l’hôte.', 'Uno : texte de la table');
  check(!(await p.locator('.hote-msg').evaluate((e) => e.classList.contains('is-moi'))), 'Uno : table en bloc simple');
  await p.context().close();

  p = suivre(await ouvrir(browser, UNO({ hote: BRUNO, hote_passe: { ...passe(BRUNO, 'Bruno'), ancien: MOI } }), { width: 390, height: 844, mobile: true }));
  check((await message(p)) === 'Bruno a repris la salle pendant ton absence. Tu restes dans la partie.', 'Uno : texte de l\'ancien hôte');
  check(!(await hscroll(p)), 'téléphone : pas de défilement horizontal');
  check((await p.locator('.hote-msg p').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))) >= 12, 'téléphone : texte lisible');
  await p.context().close();

  // Sans transfert : rien, zone masquée.
  p = suivre(await ouvrir(browser, UNO({ hote: MOI, hote_passe: null })));
  await p.waitForSelector('.uno-salle [data-zone="titre"]', { timeout: 8000 });
  await sleep(300);
  check((await p.locator('.hote-msg').count()) === 0 && await p.locator('[data-zone="hote-msg"]').evaluate((e) => e.hidden), 'Uno : pas de message sans transfert');
  await p.context().close();

  // Pseudo piégé : affiché tel quel.
  p = suivre(await ouvrir(browser, UNO({ hote: BRUNO, hote_passe: passe(BRUNO, 'Bruno', { ancien_nom: '<img src=x onerror=window.__xss=1>' }) })));
  check((await message(p)).startsWith('<img src=x'), 'pseudo échappé');
  check((await p.locator('.hote-msg img').count()) === 0 && !(await p.evaluate(() => window.__xss)), 'pseudo sans effet');
  await p.context().close();

  // Invité : voit le message de la table.
  p = suivre(await ouvrir(browser, UNO({ guest: true, realtime: false, hote: BRUNO, hote_passe: passe(BRUNO, 'Bruno') })));
  check((await message(p)) === 'Sacha n’est plus là depuis 5 minutes : Bruno devient l’hôte.', 'Uno : invité');
  await p.context().close();

  // ----- Plateaux et Nom de code -----
  p = suivre(await ouvrir(browser, BJ({ hote_passe: passe('11111111-1111-4111-8111-111111111111', 'Moi'), hote: '11111111-1111-4111-8111-111111111111' })));
  check((await message(p)) === 'Sacha n’est plus là depuis 5 minutes : tu deviens l’hôte. Tu peux lancer la partie et retirer un joueur.', 'Blackjack : texte du nouvel hôte');
  check(await p.evaluate(() => document.querySelector('.plat-fil').nextElementSibling.querySelector('.hote-msg') !== null), 'Blackjack : sous le fil d\'Ariane');
  await p.context().close();

  p = suivre(await ouvrir(browser, NDC({ hote: BRUNO, hote_passe: passe(BRUNO, 'Bruno') })));
  check((await message(p)) === 'Sacha n’est plus là depuis 5 minutes : Bruno devient l’hôte.', 'Nom de code : texte de la table');
  await p.context().close();

  // ----- Loup-Garou -----
  p = suivre(await ouvrir(browser, LG({ hote: BRUNO, hote_passe: passe(BRUNO, 'Bruno') })));
  check((await message(p)) === 'Sacha n’est plus là depuis 5 minutes : Bruno devient l’hôte.', 'Loup-Garou automatique : texte de la table');
  await p.context().close();

  p = suivre(await ouvrir(browser, LG({ hote: MOI, mode: 'auto', hote_passe: passe(MOI, 'Moi', { meneur: true }) })));
  check((await message(p)) === 'Le meneur n’est plus là depuis 15 minutes : tu reprends la salle. La partie passe en meneur automatique.', 'Loup-Garou : le repreneur');
  await p.context().close();

  p = suivre(await ouvrir(browser, LG({ hote: BRUNO, mode: 'auto', hote_passe: passe(BRUNO, 'Bruno', { meneur: true }) })));
  check((await message(p)) === 'Le meneur n’est plus là depuis 15 minutes : Bruno reprend la salle. La partie passe en meneur automatique.', 'Loup-Garou : la table');
  await p.context().close();

  // L'ancien meneur n'est plus joueur : il passe par « Rejoindre », et le message l'y attend.
  p = suivre(await ouvrir(browser, LG({ hote: BRUNO, mode: 'auto', visiteur: true, hote_passe: { ...passe(BRUNO, 'Bruno', { meneur: true }), ancien: MOI } })));
  check((await message(p)) === 'Bruno a repris la salle pendant ton absence. La partie passe en meneur automatique.', 'Loup-Garou : l\'ancien meneur à l\'écran Rejoindre');
  check((await p.locator('#lg-rejoindre-bouton').count()) === 1, 'Loup-Garou : il peut rejoindre comme joueur');
  await p.context().close();

  // En cours : message seul, sans doublon de transfert.
  p = suivre(await ouvrir(browser, LG({ statut: null, meneur_parti: true, mode: 'mj' })));
  check((await message(p)) === 'Le meneur n’est plus là : la partie continue toute seule, chaque étape se termine à la fin de son temps.', 'Loup-Garou en cours : message');
  check(await p.evaluate(() => document.querySelector('.hote-msg').compareDocumentPosition(document.querySelector('.lg-pl-action-zone')) & Node.DOCUMENT_POSITION_FOLLOWING), 'Loup-Garou en cours : au-dessus de l\'action');
  await p.context().close();
  p = suivre(await ouvrir(browser, LG({ statut: null })));
  await p.waitForSelector('.lg-pl-table', { timeout: 8000 });
  await sleep(300);
  check((await p.locator('.hote-msg').count()) === 0 && await p.locator('[data-ref="meneur-parti"]').evaluate((e) => e.hidden), 'Loup-Garou en cours : rien sans meneur parti');
  await p.context().close();

  // ----- Revanche Uno -----
  const FIN = { statut: 'terminee', hote: SACHA };
  p = suivre(await ouvrir(browser, UNO(FIN)));
  await p.waitForSelector('.uno-fin [data-rejouer]', { timeout: 8000 });
  check((await p.locator('.uno-fin [data-rejouer]').innerText()) === 'Revanche', 'Uno, fin : bouton Revanche pour un membre non hôte');
  check((await p.locator('.uno-attente-revanche').count()) === 0, 'Uno, fin : plus d\'attente de l\'hôte');
  await p.click('.uno-fin [data-rejouer]');
  await p.waitForFunction(() => location.hash === '#partie/HGUNO-7777', null, { timeout: 4000 });
  check((await appels(p, 'hg_uno_rejouer')).length === 1, 'Uno, fin : revanche demandée au serveur, la page la suit');
  check((await appels(p, 'hg_uno_rejoindre')).length === 1, 'Uno, fin : la page entre dans la revanche, même lancée par un autre');
  await p.context().close();

  p = suivre(await ouvrir(browser, UNO({ ...FIN, suite: 'HGUNO-7777' })));
  await p.waitForSelector('.uno-fin a[href*="rejoindre/HGUNO-7777"]', { timeout: 8000 });
  check((await p.locator('.uno-fin [data-rejouer]').count()) === 0, 'Uno, fin : revanche déjà lancée, lien pour la rejoindre');
  await p.context().close();

  // L'ancien hôte n'est pas gardé hors d'une revanche lancée par un autre.
  p = suivre(await ouvrir(browser, UNO({ ...FIN, hote: MOI, suite: 'HGUNO-7777' })));
  await p.waitForSelector('.uno-fin a[href*="rejoindre/HGUNO-7777"]', { timeout: 8000 }).catch(() => {});
  check((await p.locator('.uno-fin a[href*="rejoindre/HGUNO-7777"]').count()) === 1 && (await p.locator('.uno-fin [data-rejouer]').count()) === 0, 'Uno, fin : l\'ancien hôte voit le lien de la revanche');
  await p.context().close();

  p = suivre(await ouvrir(browser, UNO({ ...FIN, hote: MOI })));
  await p.waitForSelector('.uno-fin [data-rejouer]', { timeout: 8000 });
  check((await p.locator('.uno-fin [data-rejouer]').innerText()) === 'Rejouer avec la même table', 'Uno, fin : l\'hôte garde son bouton');
  await p.context().close();

  p = suivre(await ouvrir(browser, UNO({ ...FIN, guest: true, realtime: false })));
  await p.waitForSelector('.uno-attente-revanche', { timeout: 8000 });
  check((await p.locator('.uno-attente-revanche').innerText()) === 'En attente d\'un membre pour la revanche.' && (await p.locator('.uno-fin [data-rejouer]').count()) === 0, 'Uno, fin : l\'invité attend un membre');
  await p.context().close();

  check(erreurs.length === 0, `aucune erreur de page : ${erreurs.join(' | ')}`);
  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
