// Parcours : « Changer de compte » (core/comptes.js, core/comptes-etat.js ; maquette validée le 02.11.2026).
// Deux comptes sur le même navigateur, sans être déconnecté : ajout dans une boîte, refus du même compte, bascule (rechargement,
// même page), retrait, déconnexion avec deux comptes, onglet figé quand le compte change ailleurs, session expirée,
// membre sans droit (pas d'entrée), clés de jeux par compte, déconnexion « de cet appareil seulement ».
// Faux Supabase : fixtures/fake-sb.mjs (scénario comptes : e-mail -> compte ; jetons factices « rt:<id>:<n> »).
// Lancer : node tests/parcours/compte/parcours-changer-compte.cjs
const { check, finish, openPage, log, sleep, chromium, ORIGIN, PREFIX } = require('../../lib/harness.cjs');

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ALICE = U(2); // membre simple du faux serveur (compte ajouté, comme un compte de test)
const SCN = { comptes: { 'alice@exemple.test': ALICE }, password: 'mot-de-passe-test' };

/** Comptes rangés sur l'appareil (localStorage hg_comptes), ou null. */
const comptes = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('hg_comptes') || 'null'));
/** Compte de la session simulée. */
const compteSession = (p) => p.evaluate(() => localStorage.getItem('hg_test_uid'));
/**
 * Note les déconnexions du client du site (« signOut:<scope> »), y compris d'une page à l'autre (window.__LOG repart à zéro
 * à chaque page). Une fois par contexte ; recharge la page.
 */
async function ecouterSignOut(p) {
  const rec = [];
  await p.exposeFunction('__recSortie', (x) => { rec.push(x); });
  await p.ctx.addInitScript(() => {
    let arr = [];
    Object.defineProperty(window, '__LOG', { configurable: true, get: () => arr, set: (v) => {
      arr = v; const push = arr.push.bind(arr);
      arr.push = (...xs) => { for (const x of xs) if (x[0] === 'auth' && x[1] === 'signOut') window.__recSortie(`signOut:${x[2]}`); return push(...xs); };
    } });
  });
  await p.reload(); await sleep(1500);
  return rec;
}
/** Ouvre le menu de la photo. */
async function ouvrirArc(p) {
  if (await p.$eval('.nav-me', (b) => b.getAttribute('aria-expanded') !== 'true')) await p.click('.nav-me');
  await sleep(350);
}
/** Ouvre « Comptes sur cet appareil ». */
async function ouvrirPanneau(p) {
  await ouvrirArc(p);
  await p.click('.me-fan .nav-comptes');
  await p.waitForSelector('#cc-panel', { timeout: 4000 });
}
/** Ajoute Alice depuis le panneau (boîte « Ajouter un compte »), puis attend le rechargement sur son compte. */
async function ajouterAlice(p, mdp = SCN.password) {
  await ouvrirPanneau(p);
  await p.click('#cc-panel .cc-ajout');
  await p.waitForSelector('dialog.cc-dlg #ad-email');
  await p.fill('#ad-email', 'alice@exemple.test');
  await p.fill('#ad-pass', mdp);
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('dialog.cc-dlg button[type=submit]')]);
  await sleep(1300);
}

(async () => {
  const browser = await chromium.launch();

  // 1. Membre sans droit (ni admin ni Staff) : pas d'entrée « Changer de compte », rien de gardé.
  let p = await openPage(browser, { page: 'accueil', scenario: { ...SCN, uid: U(3) } });
  await ouvrirArc(p);
  check(await p.$eval('.me-fan .nav-comptes', (b) => b.hidden && b.closest('.fan-li').hidden).catch(() => false), 'membre sans droit : entrée « Changer de compte » absente du menu');
  check(await comptes(p) === null, 'membre sans droit : rien n\'est gardé sur l\'appareil');
  await p.ctx.close();

  // 2. Admin : entrée juste avant Déconnexion, panneau « 1 / 2 », clés de jeux d'avant.
  p = await openPage(browser, { page: 'jeux', scenario: SCN });
  await p.evaluate(() => { localStorage.setItem('hg_2048_meilleur', '512'); localStorage.setItem('hg-anagramme:2026-11-02', '{"0":"trouve"}'); });
  await ouvrirArc(p);
  const ordre = await p.$$eval('.me-fan .fan-item:not([hidden])', (l) => l.map((b) => [...b.classList].find((c) => c.startsWith('nav-'))));
  check(ordre.at(-2) === 'nav-comptes' && ordre.at(-1) === 'nav-logout', `admin : « Changer de compte » juste avant Déconnexion (${ordre.join(', ')})`);
  await p.click('.me-fan .nav-comptes');
  await p.waitForSelector('#cc-panel', { timeout: 4000 });
  check(/1 \/ 2/.test(await p.textContent('#cc-panel .cc-nb')) && await p.isEnabled('#cc-panel .cc-ajout'), 'panneau : 1 / 2, « Ajouter un compte » possible');
  check(/Ethan[\s\S]*Admin · utilisé maintenant/.test(await p.textContent('#cc-panel .cc-ligne.is-actif')), 'panneau : compte actif coché (Ethan, Admin)');

  // 3. Ajout : mauvais mot de passe, puis même compte refusé (la session ouverte pour rien est refermée).
  await p.click('#cc-panel .cc-ajout');
  await p.waitForSelector('dialog.cc-dlg #ad-email');
  check(await p.inputValue('#ad-email') === '', 'ajout : e-mail jamais pré-rempli');
  check(/ordinateur partagé/.test(await p.textContent('dialog.cc-dlg')), 'ajout : phrase de prudence sur l\'appareil partagé');
  await p.fill('#ad-email', 'alice@exemple.test'); await p.fill('#ad-pass', 'pas-le-bon');
  await p.click('dialog.cc-dlg button[type=submit]'); await sleep(400);
  check(/E-mail ou mot de passe incorrect/.test(await p.textContent('dialog.cc-dlg .cc-err')) && await p.inputValue('#ad-pass') === '', 'ajout : mauvais mot de passe refusé, champ vidé');
  await p.fill('#ad-email', 'moi@test.ch'); await p.fill('#ad-pass', SCN.password);
  await p.click('dialog.cc-dlg button[type=submit]'); await sleep(400);
  check(/déjà connecté sur cet appareil : c’est Ethan/.test(await p.textContent('dialog.cc-dlg .cc-err')), 'ajout : même compte refusé (« Compte déjà sur l’appareil »)');
  const tmp = (await log(p)).filter((l) => l[0] === 'auth-tmp');
  check(tmp.some((l) => l[1] === 'signOut' && l[2] === 'local'), 'même compte : la session ouverte pour rien est refermée');
  check(await compteSession(p) === null && await comptes(p) === null, 'ajout refusé : session du site et appareil inchangés');
  await p.click('dialog.cc-dlg [data-fermer]');

  // 4. Ajout d'Alice et bascule : la page Jeux ne lui est pas ouverte -> accueil avec un seul message ; Ethan reste en attente.
  await ajouterAlice(p);
  check(new URL(p.url()).pathname.endsWith('/pages/compte/accueil.html'), 'bascule vers un compte sans accès à la page : retour à l\'accueil');
  check(await compteSession(p) === ALICE, 'bascule : session du site sur Alice');
  check(/AL/.test(await p.textContent('.nav-me')), 'bascule : photo de l\'en-tête d\'Alice');
  const msg4 = await p.textContent('.toasts').catch(() => '');
  check(/Tu es sur le compte Alice\. La page Jeux ne lui est pas ouverte : te voici à l’accueil\./.test(msg4) && !/Tu n'as pas accès/.test(msg4), 'bascule : un seul message « La page Jeux ne lui est pas ouverte : te voici à l’accueil »');
  let st = await comptes(p);
  check(st?.actif?.id === ALICE && st.autres.length === 1 && st.autres[0].id === ME && /^rt:/.test(st.autres[0].rt || ''), 'appareil : Alice active, Ethan en attente avec sa seule session');
  const brut = await p.evaluate(() => localStorage.getItem('hg_comptes'));
  check(!/@|mot-de-passe|password|email/.test(brut), 'appareil : ni e-mail ni mot de passe gardés');
  check(!(await log(p)).some((l) => l[0] === 'auth' && l[1] === 'signOut'), 'bascule : Ethan n\'est jamais déconnecté');

  // 5. Clés de jeux par compte : Alice ne voit ni le record ni les mots révélés d'Ethan.
  const cles = () => p.evaluate(async () => { const m = await import('/assets/commun/core/comptes-etat.js'); return [m.lireLocal('hg_2048_meilleur'), m.lireLocal('hg-anagramme:2026-11-02')]; });
  check(JSON.stringify(await cles()) === '[null,null]', 'clés de jeux : Alice ne voit pas celles d\'Ethan');

  // 6. Alice (simple membre) voit l'entrée pour revenir, avec la photo d'Ethan ; plafond atteint.
  await ouvrirArc(p);
  check(await p.isVisible('.me-fan .nav-comptes .cc-mini'), 'Alice : entrée visible avec la petite photo de l\'autre compte');
  await p.click('.me-fan .nav-comptes');
  await p.waitForSelector('#cc-panel');
  check(/2 \/ 2/.test(await p.textContent('#cc-panel .cc-nb')) && !(await p.isEnabled('#cc-panel .cc-ajout')), 'panneau : 2 / 2, ajout désactivé');
  check(/elles restent pour|désactivées/.test(await p.textContent('#cc-panel .cc-push')), 'panneau : ligne des notifications de l\'appareil');
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('#cc-panel .cc-passer')]);
  await sleep(1300);
  check(await compteSession(p) === ME && (await comptes(p))?.autres?.[0]?.id === ALICE, 'retour sur Ethan : Alice reste en attente');
  check(new URL(p.url()).pathname.endsWith('/pages/compte/accueil.html') && /Tu es sur le compte Ethan\. Alice reste connecté : touche ta photo pour revenir\./.test(await p.textContent('.toasts').catch(() => '')), 'bascule : même page après le rechargement, message « Alice reste connecté »');
  check(JSON.stringify(await cles()) === '["512","{\\"0\\":\\"trouve\\"}"]', 'clés de jeux : Ethan retrouve les siennes');

  // 7. Autre onglet : il se fige quand le compte change ailleurs ; « Revenir à Ethan » le rend sans recharger.
  const p2 = await p.ctx.newPage();
  p2.errs = []; p2.on('pageerror', (e) => p2.errs.push(e.message));
  await p2.goto(`${ORIGIN}${PREFIX}/pages/compte/accueil.html`); await sleep(1500);
  await ouvrirPanneau(p);
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('#cc-panel .cc-passer')]);
  await sleep(1200);
  await p2.waitForSelector('dialog.cc-dlg', { timeout: 5000 }).catch(() => {});
  check(/Compte changé dans un autre onglet/.test(await p2.textContent('dialog.cc-dlg').catch(() => '')), 'onglet resté sur Ethan : boîte « Compte changé dans un autre onglet »');
  const fige = await p2.evaluate(async () => { const m = await import('/assets/commun/core/comptes-etat.js'); return [m.estFige(), await m.fetchGarde('/x').then(() => 'parti', () => 'bloqué')]; });
  check(fige[0] && fige[1] === 'bloqué', 'onglet figé : plus aucune requête ne part');
  await p2.keyboard.press('Escape'); await sleep(200);
  check(await p2.isVisible('dialog.cc-dlg'), 'onglet figé : la boîte ne se ferme pas avec Échap');
  await p2.click('dialog.cc-dlg [data-cc-onglet="revenir"]'); await sleep(900);
  const apres = await p2.evaluate(async () => { const m = await import('/assets/commun/core/comptes-etat.js'); return [m.estFige(), localStorage.getItem('hg_test_uid'), !!document.querySelector('dialog.cc-dlg')]; });
  check(!apres[0] && apres[1] === ME && !apres[2], '« Revenir à Ethan » : session rendue à Ethan, onglet dégelé sans rechargement');
  await p.waitForSelector('dialog.cc-dlg', { timeout: 5000 }).catch(() => {});
  check(/Compte changé dans un autre onglet/.test(await p.textContent('dialog.cc-dlg').catch(() => '')), 'l\'onglet resté sur Alice se fige à son tour');
  check(!p2.errs.length, 'onglet figé : aucune erreur JS' + (p2.errs.length ? ` (${p2.errs.join(' | ')})` : ''));
  await p2.close();
  await p.reload(); await sleep(1500); // « Continuer avec Ethan » revient à recharger : Ethan actif

  // 8. Retirer Alice : confirmation, session d'Alice fermée sur le serveur, rien ne reste.
  const rtAlice = (await comptes(p))?.autres?.[0]?.rt;
  await ouvrirPanneau(p);
  await p.click('#cc-panel .cc-retirer');
  await p.waitForSelector('dialog.cc-dlg');
  check(/Retirer Alice de cet appareil \?/.test(await p.textContent('dialog.cc-dlg')), 'retrait : confirmation demandée');
  await p.click('dialog.cc-dlg .btn-danger'); await sleep(700);
  const rev = await p.evaluate(() => JSON.parse(localStorage.getItem('hg_test_revoques') || '[]'));
  check(await comptes(p) === null && rev.includes(rtAlice), 'retrait : Alice déconnectée d\'ici (jeton fermé), plus rien de gardé');
  check(await compteSession(p) === ME && !(await p.$('.me-fan .nav-comptes .cc-mini')), 'retrait : Ethan reste actif, plus de petite photo');

  // 9. Déconnexion avec deux comptes : « Déconnecter les deux » (cet appareil seulement), tout est vidé.
  let sorties = await ecouterSignOut(p);
  await ajouterAlice(p); // Alice active
  await ouvrirArc(p);
  await p.click('.me-fan .nav-logout');
  await p.waitForSelector('dialog.cc-dlg [data-cc-deco]');
  check(/Déconnecter Alice[\s\S]*Tu passes sur Ethan[\s\S]*Déconnecter les deux/.test(await p.textContent('dialog.cc-dlg')), 'déconnexion à deux comptes : « Déconnecter Alice » ou « Déconnecter les deux »');
  const rtEthan = (await comptes(p))?.autres?.[0]?.rt;
  await Promise.all([p.waitForURL(/compte\.html/, { timeout: 8000 }).catch(() => {}), p.click('dialog.cc-dlg [data-cc-deco="deux"]')]);
  await sleep(800);
  const rev9 = await p.evaluate(() => JSON.parse(localStorage.getItem('hg_test_revoques') || '[]'));
  check(/compte\.html/.test(p.url()) && await p.isVisible('#pane-login').catch(() => false), 'déconnecter les deux : page de connexion');
  check(await comptes(p) === null && rev9.includes(rtEthan), 'déconnecter les deux : Ethan fermé aussi (jeton), plus rien de gardé');
  check(sorties.join(',') === 'signOut:local', `déconnecter les deux : cet appareil seulement (${sorties.join(', ')})`);
  await p.ctx.close();

  // 10. « Déconnecter Ethan » : on passe sur Alice, seulement cet appareil.
  p = await openPage(browser, { page: 'accueil', scenario: SCN });
  sorties = await ecouterSignOut(p);
  await ajouterAlice(p);
  await ouvrirPanneau(p); // retour sur Ethan
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('#cc-panel .cc-passer')]);
  await sleep(1300);
  await ouvrirArc(p);
  await p.click('.me-fan .nav-logout');
  await p.waitForSelector('dialog.cc-dlg [data-cc-deco="un"]');
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('dialog.cc-dlg [data-cc-deco="un"]')]);
  await sleep(1300);
  check(await compteSession(p) === ALICE && await comptes(p) === null, '« Déconnecter Ethan » : on passe sur Alice, un seul compte reste');
  check(!sorties.includes('signOut:global'), `« Déconnecter Ethan » : jamais « tous les appareils » (${sorties.join(', ') || 'aucun signOut du site'})`);
  await p.ctx.close();

  // 11. Session d'un compte en attente expirée : affichée, clic = se reconnecter (jamais de bascule silencieuse).
  const exp = { actif: { id: ME, pseudo: 'Ethan', role: 'Admin' }, autres: [{ id: ALICE, pseudo: 'Alice', role: 'Membre', rt: `rt:${ALICE}:perime`, vu: Date.now() - 7200e3 }] };
  p = await openPage(browser, { page: 'accueil', scenario: SCN, init: { content: `localStorage.setItem('hg_comptes', ${JSON.stringify(JSON.stringify(exp))}); localStorage.setItem('hg_test_revoques', '["rt:${ALICE}:perime"]');` } });
  await ouvrirPanneau(p);
  check(/dernière visite il y a 2 h/.test(await p.textContent('#cc-panel')), 'panneau : dernière visite du compte en attente');
  await p.click('#cc-panel .cc-passer'); await sleep(700);
  check(/Reconnecter Alice/.test(await p.textContent('dialog.cc-dlg').catch(() => '')) && await compteSession(p) === null, 'session expirée : boîte « Reconnecter Alice », Ethan reste actif');
  check((await comptes(p))?.autres?.[0]?.expire === true, 'session expirée : notée sur l\'appareil');
  await p.click('dialog.cc-dlg [data-fermer]');
  await ouvrirPanneau(p);
  check(/Session expirée/.test(await p.textContent('#cc-panel .cc-ligne.is-expire').catch(() => '')), 'liste : « Session expirée » affiché');
  await p.ctx.close();

  // 12. Session du compte actif expirée : on propose de passer à l'autre.
  const tomb = { actif: { id: ME, pseudo: 'Ethan', role: 'Admin' }, autres: [{ id: ALICE, pseudo: 'Alice', role: 'Membre', rt: `rt:${ALICE}:valable`, vu: Date.now() }] };
  p = await openPage(browser, { page: 'compte', scenario: { ...SCN, guest: true }, init: { content: `localStorage.setItem('hg_comptes', ${JSON.stringify(JSON.stringify(tomb))});` } });
  await p.waitForSelector('dialog.cc-dlg', { timeout: 5000 }).catch(() => {});
  check(/La session de Ethan a expiré/.test(await p.textContent('dialog.cc-dlg').catch(() => '')), 'compte actif tombé : boîte « La session de Ethan a expiré »');
  await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('dialog.cc-dlg [data-cc-exp="passer"]')]);
  await sleep(1500);
  check(await compteSession(p) === ALICE && (await comptes(p))?.autres?.[0]?.expire === true, '« Passer à Alice » : Alice active, Ethan noté expiré');
  await p.ctx.close();

  // 13. Un seul compte : Déconnexion de cet appareil seulement ; Mon compte : « Déconnecter tous mes appareils ».
  p = await openPage(browser, { page: 'accueil', scenario: SCN });
  sorties = await ecouterSignOut(p);
  await ouvrirArc(p);
  await Promise.all([p.waitForURL(/compte\.html/, { timeout: 8000 }).catch(() => {}), p.click('.me-fan .nav-logout')]);
  await sleep(500);
  check(sorties.join(',') === 'signOut:local', `déconnexion : cet appareil seulement (${sorties.join(', ')})`);
  await p.ctx.close();
  p = await openPage(browser, { page: 'compte', scenario: SCN });
  sorties = await ecouterSignOut(p);
  await p.waitForSelector('#logout-all', { timeout: 5000 });
  check(await p.isVisible('#comptes-slot .cc-liste').catch(() => false), 'Mon compte : liste « Comptes sur cet appareil » (admin)');
  await p.click('#logout-all');
  await p.click('dialog.hg-dialog .btn-danger');
  await p.waitForURL(/compte\.html/, { timeout: 8000 }).catch(() => {}); await sleep(500);
  check(sorties.join(',') === 'signOut:global', `Mon compte : « Déconnecter tous mes appareils » (${sorties.join(', ')})`);
  await p.ctx.close();

  await browser.close();
  finish();
})();
