// Parcours : expiration des offres d'échange (idée 53) et lien des alertes vers le tableau (idée 54).
// Faux Supabase : fixtures/fake-sb-cartes.mjs (S.trades, S.tradeItems). La logique en base (migration 193) n'est pas jouée ici.
// Contrôles : échéance sous la date, pastille de préavis à moins de 24 h (offre reçue et envoyée), offre sans échéance (base sans la
// migration), historique « Expirée » avec le vrai délai, côté auteur et côté destinataire, sans défilement à 360 px ;
// #echanges/tableau ouvre le Tableau, au chargement comme depuis une page de Cartes déjà ouverte ; réglage du délai (La Fabrique ›
// Limites) ; préférence « carte de ma liste proposée » (Mon compte).
// Lancer : node tests/parcours/cartes/parcours-echanges-expiration.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const ME = '11111111-1111-4111-8111-111111111111';
const ALICE = '00000002-0000-4000-8000-000000000002';
const JOUR = 86400000, HEURE = 3600000;
const dans = (ms) => new Date(Date.now() + ms).toISOString();
const goTab = (p, id) => p.evaluate((id) => { location.hash = id; }, id);
const offre = (id, o) => ({ id, from_user: ALICE, to_user: ME, status: 'proposee', from_paillettes: 0, to_paillettes: 0, message: null, created_at: dans(-JOUR), ...o });
const trades = [
  offre('T-loin', { expire_le: dans(5.5 * JOUR) }),
  offre('T-proche', { expire_le: dans(20 * HEURE) }),
  offre('T-sans', {}),
  offre('T-env', { from_user: ME, to_user: ALICE, expire_le: dans(20 * HEURE) }),
  offre('T-exp', { from_user: ME, to_user: ALICE, status: 'expiree', created_at: dans(-9 * JOUR), expire_le: dans(-2 * JOUR), resolved_at: dans(-2 * JOUR) }),
  offre('T-exp-recue', { status: 'expiree', created_at: dans(-4 * JOUR), expire_le: dans(-JOUR), resolved_at: dans(-JOUR) }),
  offre('T-exp-vide', { from_user: ME, to_user: ALICE, status: 'expiree', created_at: dans(-2 * JOUR), expire_le: dans(-JOUR), resolved_at: dans(-JOUR) }),
];
const tradeItems = [{ trade_id: 'T-exp', copy_id: 1, side: 'from' }];

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { trades, tradeItems }, width: 360, height: 800 });
  await goTab(p, 'echanges');
  await p.waitForSelector('#trd-tab-recues', { timeout: 6000 });
  await p.waitForSelector('.trd-offer', { timeout: 5000 });

  const offres = () => p.$$eval('.trd-offer', (l) => l.map((a) => ({ exp: a.querySelector('.trd-exp')?.textContent || '', pastille: a.querySelector('.pill-exp')?.textContent || '', attente: !!a.querySelector('.pill-current'), etat: !!a.querySelector('.trd-offer-etat') })));
  const recues = await offres();
  check(recues.length === 3, 'trois offres reçues');
  const loin = recues.find((o) => /^Expire dans/.test(o.exp));
  check(!!loin && /^Expire dans \d+ jours, le \d+ \p{L}+\.?$/u.test(loin.exp) && !loin.pastille && !loin.etat, `offre lointaine : phrase seule (${loin?.exp})`);
  const proche = recues.find((o) => o.pastille);
  check(!!proche && /^Expire (demain|aujourd’hui)$/.test(proche.pastille) && proche.attente && proche.etat, `préavis : pastille à côté de « En attente » (${proche?.pastille})`);
  check(/^Se ferme le \d+ [\p{L}.]+ à \d+ h \d\d sans réponse\.$/u.test(proche?.exp || ''), `préavis : date et heure (${proche?.exp})`);
  check(recues.some((o) => !o.exp && o.attente), 'offre sans échéance (base sans la migration) : affichée sans ligne d’échéance');
  check(await hscroll(p) === 0, '360 px : pas de défilement horizontal');

  await p.click('#trd-tab-envoyees');
  await p.waitForSelector('.trd-offer', { timeout: 3000 });
  const env = await offres();
  check(env.length === 1 && !!env[0].pastille && env[0].attente, 'offre envoyée : même préavis');

  await p.click('#trd-tab-historique');
  await p.waitForSelector('.trd-offer', { timeout: 3000 });
  const arts = await p.$$eval('.trd-offer', (l) => l.map((a) => ({ pills: [...a.querySelectorAll('.pill')].map((x) => x.textContent), exp: a.querySelector('.trd-exp')?.textContent || '' })));
  check(arts.length === 3 && arts.every((a) => a.pills.join() === 'Expirée'), 'historique : pastille « Expirée »');
  check(arts.some((a) => a.exp === 'Sans réponse après 7 jours. Tes cartes sont de nouveau libres.'), 'historique : vrai délai et cartes libérées');
  check(arts.some((a) => a.exp === 'Sans réponse après 3 jours.'), 'offre reçue expirée : pas de phrase sur des cartes qui n’étaient pas bloquées');
  check(arts.some((a) => a.exp === 'Sans réponse après 1 jour.'), 'un jour au singulier, offre sans carte donnée');
  check(await hscroll(p) === 0, 'historique, 360 px : pas de défilement horizontal');

  // Lien de l'alerte : page Cartes déjà ouverte, puis au chargement.
  await p.click('#trd-tab-recues');
  await goTab(p, 'echanges/tableau');
  await p.waitForFunction(() => document.querySelector('#trd-tab-tableau')?.getAttribute('aria-selected') === 'true', null, { timeout: 4000 }).catch(() => {});
  check(await p.getAttribute('#trd-tab-tableau', 'aria-selected') === 'true', '#echanges/tableau : page déjà ouverte, onglet Tableau');
  await goTab(p, 'boutique');
  await sleep(200);
  await p.click('#trd-tab-recues', { force: true }).catch(() => {});
  await goTab(p, 'echanges/tableau');
  await sleep(300);
  check(await p.isVisible('#trd-tab-tableau') && await p.getAttribute('#trd-tab-tableau', 'aria-selected') === 'true', '#echanges/tableau : retour depuis un autre onglet');

  const q = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', scenario: { trades }, hash: '#echanges/tableau', width: 1280, height: 800 });
  await q.waitForSelector('#trd-tab-tableau', { timeout: 6000 }).catch(() => {});
  await sleep(300);
  check(await q.getAttribute('#trd-tab-tableau', 'aria-selected') === 'true', '#echanges/tableau : au chargement');

  // Réglage du délai : La Fabrique › Limites, groupe Échanges.
  const a = await openPage(browser, { page: 'admin', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900 });
  await adminSection(a, 'fabrique/limites');
  await a.waitForSelector('#acd-e-trade_expiry_days', { timeout: 8000 });
  check(await a.inputValue('#acd-e-trade_expiry_days') === '7', 'réglage : 7 jours par défaut');
  check(await a.getAttribute('#acd-e-trade_expiry_days', 'min') === '1' && await a.getAttribute('#acd-e-trade_expiry_days', 'max') === '60', 'réglage : bornes 1 à 60');
  check(await a.$eval('#acd-e-trade_expiry_days', (e) => e.closest('fieldset').querySelector('legend').textContent) === 'Échanges', 'réglage : groupe Échanges');
  check(/Un préavis part 24 h avant\./.test(await a.textContent('#acd-e-trade_expiry_days-h')), 'réglage : aide affichée');
  await a.fill('#acd-e-trade_expiry_days', '61');
  await a.click('#acd-econ-form [type="submit"]');
  await sleep(200);
  check(/entre 1 et 60/.test(await a.textContent('#acd-econ-form .form-error')), 'réglage : 61 refusé dans le formulaire');
  await a.fill('#acd-e-trade_expiry_days', '10');
  await a.click('#acd-econ-form [type="submit"]');
  await sleep(400);
  const ecrit = (await log(a)).filter((l) => l[0] === 'upsert' && l[1] === 'hg_settings').at(-1);
  check(ecrit?.[2]?.value?.trade_expiry_days === 10, 'réglage : enregistré dans hg_settings.cards');

  // Préférence : Mon compte, après « Cartes · souhaits et cadeaux ».
  const c = await openPage(browser, { page: 'compte', width: 360, height: 800, scenario: { uid: ALICE } });
  await c.waitForSelector('#np-form', { timeout: 8000 });
  const entetes = await c.$$eval('#np-form [role=rowheader] b', (l) => l.map((b) => b.textContent));
  const rang = entetes.indexOf('Cartes · carte de ma liste proposée');
  check(rang > 0 && entetes[rang - 1] === 'Cartes · souhaits et cadeaux', 'préférence : ligne après « Cartes · souhaits et cadeaux »');
  check(await c.isChecked('[data-key="carte_proposee.site"]'), 'préférence : activée par défaut');
  check(await c.$$eval('.np-site', (l) => l.length === 1 && /Sur le site/.test(l[0].textContent)), 'préférence : une seule case « Sur le site »');
  check(await hscroll(c) === 0, 'préférence, 360 px : pas de défilement horizontal');
  await c.uncheck('[data-key="carte_proposee.site"]');
  await c.click('#np-form button[type=submit]');
  await sleep(300);
  const rpc = (await log(c)).find((l) => l[0] === 'rpc' && l[1] === 'hg_set_notif_prefs');
  check(rpc?.[2]?.p_prefs?.['carte_proposee.site'] === false, 'préférence : envoyée à hg_set_notif_prefs');

  await browser.close();
  finish();
})();
