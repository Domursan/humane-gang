// Parcours de la pastille de connexion (idée 3, logique à la fausse horloge : unitaires/check-salon-etat.mjs) : sur les vraies tables
// Uno, duel, Blackjack, Loup-Garou et Nom de code, rien en temps normal, coupure courte sans effet, coupure longue, retour,
// onglet caché, invité, boutons toujours actifs, place au bureau et au téléphone, plus rien en quittant la table ;
// erreur du serveur (pas du réseau), canal qui ne revient pas (pastille effacée, canal neuf, recul), canal fermé.
// Faux Supabase : le canal est piloté par window.__fakeRealtime.status(), les relectures sont cassées par window.__panne
// (true : réseau ; un texte : réponse d'erreur du serveur).
const { check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const OUVERT = ['uno', 'nom-de-code', 'loup-garou', 'duels', 'blackjack'].map((slug, i) => ({ slug, label: slug, mode: 'membres', in_nav: false, sort: 900 + i }));
const MEMBRE = { uid: U(2), pagesExtra: OUVERT, realtime: true };
const TABLES = [
  { nom: 'Uno', page: 'uno', hash: '#partie/HGUNO-4242', init: 'fake-salons.js', scenario: { ...MEMBRE, salon: 'uno' }, attend: '.uno-fan-carte' },
  { nom: 'Duel', page: 'duels', hash: '#partie/HGEC-1001', init: 'fake-salons.js', fixture: 'fake-sb-duels-plateaux.mjs', scenario: { ...MEMBRE, salon: 'duel-echecs' }, attend: '[data-sq]' },
  { nom: 'Blackjack', page: 'blackjack', hash: '#partie/HGBJK-1234', fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'blackjack', realtime: true }, attend: '.bj-barre' },
  { nom: 'Loup-Garou', page: 'loup-garou', hash: '#partie/HGLG-4242', init: 'fake-salons.js', scenario: { ...MEMBRE, salon: 'loup-garou' }, attend: '.lg-pl-table' },
  { nom: 'Nom de code', page: 'nom-de-code', hash: '#partie/HGNDC-4242', init: 'fake-salons.js', scenario: { ...MEMBRE, salon: 'nom-de-code' }, attend: '.ndc-bouton-arreter' },
];
const UNO = TABLES[0];

const ouvrir = async (browser, t, o = {}) => {
  const { nom, attend, ...r } = t;
  const p = await openPage(browser, { width: 1280, height: 900, ...r, ...o, scenario: { ...t.scenario, ...o.scenario } });
  await p.waitForSelector(attend, { timeout: 10000 });
  // Relectures en panne à la demande, avec le vrai message du client Supabase quand le réseau manque.
  await p.evaluate(async () => {
    const { sb } = await import('/assets/commun/core.js');
    const rpc = sb.rpc.bind(sb);
    sb.rpc = (fn, a) => (window.__panne && /_(etat|invite)$/.test(fn)
      ? Promise.resolve({ data: null, error: { message: window.__panne === true ? 'TypeError: Failed to fetch' : window.__panne } })
      : rpc(fn, a));
  });
  await sleep(100);   // le SUBSCRIBED du faux canal
  return p;
};
const panne = (p, v) => p.evaluate((x) => { window.__panne = x; }, v);
/** Compte les canaux ouverts et retirés ; window.__muet : le canal ne confirme plus, window.__dernier reçoit ses statuts. */
const espionCanaux = (p) => p.evaluate(async () => {
  const { sb } = await import('/assets/commun/core.js');
  const channel = sb.channel.bind(sb), removeChannel = sb.removeChannel.bind(sb);
  window.__canaux = 0; window.__retraits = 0;
  sb.channel = (...a) => {
    window.__canaux++;
    const ch = channel(...a), sub = ch.subscribe.bind(ch);
    ch.subscribe = (cb) => { if (!window.__muet) return sub(cb); window.__dernier = cb; return ch; };
    return ch;
  };
  sb.removeChannel = (ch) => { window.__retraits++; return removeChannel(ch); };
});
const statut = (p, s) => p.evaluate((x) => window.__fakeRealtime.status(x), s);
const pastilles = (p) => p.locator('.salon-etat').count();
const etat = (p) => p.locator('.salon-etat').getAttribute('data-etat', { timeout: 500 }).catch(() => null);
const texte = (p) => p.locator('.salon-etat').innerText({ timeout: 500 }).catch(() => '');
const cacher = (p, oui) => p.evaluate((x) => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => x });
  document.dispatchEvent(new Event('visibilitychange'));
}, oui);

(async () => {
  const browser = await chromium.launch();

  // ----- Toutes les tables : coupure longue et retour -----
  for (const t of TABLES) {
    const p = await ouvrir(browser, t);
    check((await pastilles(p)) === 0, `${t.nom} : rien en temps normal`);
    await statut(p, 'CHANNEL_ERROR');
    await panne(p, true);
    await sleep(4300);
    check((await etat(p)) === 'coupure' && (await texte(p)) === 'Connexion perdue, on réessaie', `${t.nom} : coupure longue, pastille affichée`);
    await panne(p, false);
    await statut(p, 'SUBSCRIBED');
    await sleep(100);
    check((await etat(p)) === 'retour' && (await texte(p)) === 'Connexion rétablie', `${t.nom} : retour affiché`);
    check(p.errs.length === 0, `${t.nom} : aucune erreur de page ${p.errs.join(' | ')}`);
    await p.context().close();
  }

  // ----- Uno : détail du comportement -----
  let p = await ouvrir(browser, UNO);
  await statut(p, 'TIMED_OUT');
  await sleep(1500);
  await statut(p, 'SUBSCRIBED');
  await sleep(3500);
  check((await pastilles(p)) === 0, 'coupure de moins de 4 s : rien, ni pendant ni après');

  await statut(p, 'CHANNEL_ERROR');
  await p.evaluate(() => { window.__panne = true; });
  await sleep(4300);
  const el = p.locator('.salon-etat');
  check((await el.getAttribute('role')) === 'status' && (await el.getAttribute('aria-live')) === 'polite', 'pastille : role status, aria-live polite');
  check(await p.evaluate(() => document.querySelector('.salon-etat').parentElement === document.body), 'pastille posée dans <body>');
  const b = await el.boundingBox();
  check(b.x === 72 && Math.round(b.y + b.height) === 884, `bureau : en bas à gauche (${b.x}, ${b.y + b.height})`);
  check((await p.locator('.uno-fan-carte button:disabled').count()) === 0 && (await p.locator('.uno-fan-carte button').count()) > 0, 'les boutons de jeu restent actifs');
  await p.evaluate(() => { window.__panne = false; });
  await sleep(4300);
  check((await etat(p)) === 'reprise' && (await texte(p)) === 'Reconnexion…', 'une relecture répond, canal pas revenu : reconnexion');
  await statut(p, 'SUBSCRIBED');
  await sleep(100);
  check((await etat(p)) === 'retour', 'canal revenu : rétablie');
  await sleep(3100);
  check((await pastilles(p)) === 0, 'rétablie disparaît après 3 s');

  // Navigateur hors ligne, canal encore branché
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await sleep(4300);
  check((await etat(p)) === 'coupure', 'navigateur hors ligne : coupure');
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(100);
  check((await etat(p)) === 'retour', 'navigateur revenu : rétablie');

  // Onglet caché
  await sleep(3100);
  await cacher(p, true);
  await statut(p, 'CHANNEL_ERROR');
  await sleep(4300);
  check((await pastilles(p)) === 0, 'onglet caché : aucune pastille');
  await cacher(p, false);
  await sleep(4300);
  check((await pastilles(p)) === 0, 'réveil : pas de pastille pendant que le canal se rebranche');
  await statut(p, 'SUBSCRIBED');
  await sleep(1000);   // fin du délai de réveil

  // Quitter la table
  await statut(p, 'CHANNEL_ERROR');
  await panne(p, true);
  await sleep(4300);
  check((await etat(p)) === 'coupure', 'coupure avant de quitter');
  await p.evaluate(() => { location.hash = ''; });
  await p.waitForFunction(() => !document.querySelector('.uno-fan-carte'), null, { timeout: 5000 });
  await sleep(100);
  check((await pastilles(p)) === 0, 'en quittant la table : plus de pastille');
  await p.evaluate(() => { window.__panne = true; window.dispatchEvent(new Event('offline')); });
  await sleep(4300);
  check((await pastilles(p)) === 0, 'après la table : plus rien ne la fait revenir');
  await p.context().close();

  // ----- Erreur du serveur : il répond, le réseau va bien -----
  p = await ouvrir(browser, UNO);
  await statut(p, 'CHANNEL_ERROR');
  await panne(p, true);
  await sleep(4300);
  check((await etat(p)) === 'coupure', 'relectures sans réseau : coupure');
  await panne(p, 'Partie en cours de reprise.');
  await statut(p, 'SUBSCRIBED');
  await sleep(200);
  check((await etat(p)) === 'retour', 'canal revenu, le serveur répond par une erreur : la pastille ne reste pas collée');
  await p.context().close();

  // ----- Canal tombé, relectures bonnes : pastille effacée, canal neuf -----
  p = await ouvrir(browser, UNO);
  await espionCanaux(p);
  await statut(p, 'CHANNEL_ERROR');
  await sleep(4300);
  check((await etat(p)) === 'reprise' && (await texte(p)) === 'Reconnexion…', 'canal tombé, une relecture vient de réussir : reconnexion, pas de pastille orange');
  await p.waitForSelector('.salon-etat[data-etat="retour"]', { timeout: 16000 });
  check(true, 'relectures bonnes pendant 15 s : la pastille s\'efface');
  await sleep(3200);
  check((await pastilles(p)) === 0, 'plus de pastille, canal toujours tombé');
  check(await p.evaluate(() => window.__retraits === 0 && window.__canaux === 0), 'le client garde son canal le temps de le rebrancher seul');
  await p.waitForFunction(() => window.__retraits === 1, null, { timeout: 12000 });
  check(true, 'au bout de 20 s, le canal tombé est retiré à une relecture');
  check(await p.evaluate(() => window.__canaux === 0), 'pas de canal neuf avant le recul');
  await p.waitForFunction(() => window.__canaux === 1, null, { timeout: 12000 });
  await sleep(200);
  check((await pastilles(p)) === 0, 'canal neuf branché : rien à montrer');

  // Canal fermé pour de bon, aucun nouveau branchement : retiré sans attendre 20 s, recul entre deux canaux neufs
  await p.evaluate(() => { window.__muet = true; window.__t = setInterval(() => window.__dernier?.('CLOSED'), 500); });
  await statut(p, 'CLOSED');
  await p.waitForFunction(() => window.__retraits === 2, null, { timeout: 6000 });
  check(true, 'CLOSED : canal retiré à la relecture suivante');
  await sleep(25000);
  const neufs = await p.evaluate(() => window.__canaux - 1);
  check(neufs >= 1 && neufs <= 3, `canaux neufs espacés par le recul, sans boucle serrée (${neufs} en 25 s)`);
  check(await p.evaluate(() => window.__retraits === window.__canaux || window.__retraits === window.__canaux + 1), 'chaque canal fermé est retiré une fois');
  check((await pastilles(p)) === 0, 'relectures bonnes : toujours rien à montrer');
  check(p.errs.length === 0, `canal neuf : aucune erreur de page ${p.errs.join(' | ')}`);
  await p.context().close();

  // ----- Téléphone -----
  p = await ouvrir(browser, UNO, { width: 390, height: 844 });
  await statut(p, 'CHANNEL_ERROR');
  await sleep(4300);
  const t = await p.locator('.salon-etat').boundingBox();
  const haut = await p.evaluate(() => document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0);
  check(Math.abs(t.x + t.width / 2 - 195) <= 1 && t.y >= haut && t.x >= 0 && t.x + t.width <= 390, `téléphone : sous l'en-tête, centrée (y=${t.y}, en-tête ${haut})`);
  await p.context().close();

  // ----- Invité : pas de canal, seulement les relectures -----
  // Avec son jeton, comme un vrai invité : sans jeton, la table considère qu'il l'a quittée (parcours-quitter.cjs).
  p = await ouvrir(browser, UNO, { scenario: { guest: true, realtime: false } });
  await p.evaluate(() => localStorage.setItem('hg_uno_invite:HGUNO-4242', 'jeton'));
  check(await p.evaluate(() => window.__fakeRealtime.tables().length === 0), 'invité : aucun canal temps réel');
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  await sleep(4300);
  check((await pastilles(p)) === 0, 'invité : le navigateur seul ne déclenche rien');
  await p.evaluate(() => { window.dispatchEvent(new Event('online')); window.__panne = true; });
  await sleep(1000);
  await p.evaluate(() => { window.__panne = false; });
  await sleep(4500);
  check((await pastilles(p)) === 0, 'invité : relecture ratée isolée, rien');
  await p.evaluate(() => { window.__panne = true; });
  await sleep(6500);
  check((await etat(p)) === 'coupure', 'invité : relectures ratées, coupure');
  await p.evaluate(() => { window.__panne = false; });
  await sleep(2300);
  check((await etat(p)) === 'retour', 'invité : la relecture revient, rétablie');
  await p.context().close();

  await browser.close();
  finish();
})();
