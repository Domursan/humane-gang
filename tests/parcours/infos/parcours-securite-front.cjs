// Parcours : protections côté navigateur (correctifs de sécurité du 23/10/2026).
// 1. Anti-encadrement (theme-boot.js) : une page du site encadrée par un autre site s'ouvre en pleine fenêtre ;
//    encadrée par le site lui-même (simulateur de téléphone), elle reste affichée.
// 2. CSP : un script jsDelivr hors des bibliothèques prévues est refusé ; /pages/jeux/simulateur.html a sa propre CSP sans script inline.
// 3. Code d'invitation en attente (compte.js, hg_pending_join) : utilisé s'il a moins d'une heure, ignoré et effacé sinon.
// 4 à 9 (ré-audit du 23/10) : session par l'adresse seulement sur /pages/compte/compte.html et en PKCE (F4), ?joinerr= limité aux
//    messages connus (F6), lien de réinitialisation sans effet sur une session existante et mot de passe actuel exigé (F9),
//    désabonnement push à la déconnexion (F5), affiches avec CSP et Leaflet avec empreinte d'intégrité (F3, F7).
// Faux Supabase (fixtures/fake-sb.mjs), rien n'atteint la vraie base. Lancer : node tests/parcours/infos/parcours-securite-front.cjs
const { ROOT, ORIGIN, PREFIX, check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');

const EVIL = 'http://autre-site.test';
/** Ajoute au contexte de la page un « autre site » qui encadre l'adresse donnée. */
async function routeEvil(p, target) {
  await p.ctx.route(`${EVIL}/**`, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><title>autre site</title><iframe id="f" src="${target}" width="800" height="600"></iframe>`,
  }));
}

(async () => {
  const browser = await chromium.launch();
  const base = `${ORIGIN}${PREFIX}`;

  // 1a. Encadrée par un autre site : la fenêtre principale part vers la page du site.
  let p = await openPage(browser, { page: 'legal', scenario: { guest: true } });
  await routeEvil(p, `${base}/pages/infos/legal.html`);
  await p.goto(`${EVIL}/`);
  await p.waitForURL(/\/legal\.html$/, { timeout: 4000 }).catch(() => {});
  // Chrome refuse la redirection de la fenêtre principale sans clic : la page doit alors être masquée et inerte.
  let etat = 'pleine fenêtre';
  if (!p.url().startsWith(`${base}/pages/infos/legal.html`)) {
    const f = p.frames().find((x) => x.url().includes('/pages/infos/legal.html'));
    etat = f ? await f.evaluate(() => `${document.documentElement.style.visibility}/${document.documentElement.inert}`).catch(() => '?') : 'absent';
    // Un clic au centre du cadre ne doit atteindre aucun élément de la page encadrée.
    const hit = f ? await f.evaluate(() => { const e = document.elementFromPoint(400, 300); return e ? e.tagName : 'aucun'; }).catch(() => '?') : '?';
    etat += ` clic:${hit}`;
  }
  check(etat === 'pleine fenêtre' || /^hidden\/true/.test(etat), `cadre d'un autre site : page ouverte en pleine fenêtre ou masquée et inerte (${etat})`);
  await p.ctx.close();

  // 1b. Cadre isolé (sandbox sans navigation de la fenêtre principale) : la page reste masquée.
  p = await openPage(browser, { page: 'legal', scenario: { guest: true } });
  await p.ctx.route(`${EVIL}/**`, (route) => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><iframe id="f" sandbox="allow-scripts allow-same-origin" src="${base}/pages/infos/legal.html" width="800" height="600"></iframe>`,
  }));
  await p.goto(`${EVIL}/`);
  await sleep(1500);
  const fr = p.frames().find((f) => f.url().includes('/pages/infos/legal.html'));
  const vis = fr ? await fr.evaluate(() => document.documentElement.style.visibility).catch(() => '?') : 'absent';
  check(p.url().startsWith(EVIL) && vis === 'hidden', `cadre isolé d'un autre site : page masquée (visibility=${vis})`);
  await p.ctx.close();

  // 1c. Simulateur (même site) : la page encadrée reste visible, sans erreur de CSP.
  p = await openPage(browser, { page: 'simulateur', scenario: {} });
  const csp = [];
  p.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 160)); });
  await p.reload();
  await sleep(2500);
  const frames = p.frames().filter((f) => f !== p.mainFrame());
  const shown = frames.length ? await frames[0].evaluate(() => document.documentElement.style.visibility !== 'hidden' && !!document.body).catch(() => false) : false;
  check(frames.length >= 1 && shown, `simulateur : page du site affichée dans le cadre (${frames.length} cadre(s))`);
  check(await p.locator('#url').count() === 1 && (await p.locator('.screen').count()) >= 1, 'simulateur : script externe chargé (téléphone et barre d\'adresse affichés)');
  check(!csp.length && !p.errs.length, 'simulateur : aucune erreur JS ni CSP' + (csp.length || p.errs.length ? ` (${[...csp, ...p.errs].join(' | ')})` : ''));
  const simCsp = await p.$eval('meta[http-equiv="Content-Security-Policy"]', (m) => m.content).catch(() => '');
  check(/script-src 'self';/.test(simCsp) && !/unsafe-inline'[^;]*;\s*style/.test(simCsp.split('script-src')[1] || ''), 'simulateur : CSP présente, scripts du site seulement');
  await p.ctx.close();

  // 2. CSP des pages : bibliothèque jsDelivr non prévue refusée, bibliothèques prévues autorisées.
  p = await openPage(browser, { page: 'legal', scenario: { guest: true } });
  const res = await p.evaluate(async () => {
    const viol = [];
    document.addEventListener('securitypolicyviolation', (e) => viol.push(e.blockedURI));
    const tryImport = async (u) => { try { await import(u); return 'ok'; } catch (e) { return 'err'; } };
    await tryImport('https://cdn.jsdelivr.net/npm/paquet-inconnu@1.0.0/+esm');
    await tryImport('https://cdn.jsdelivr.net/gh/quelquun/depot@main/x.js');
    await tryImport('https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm');
    await tryImport('https://cdn.jsdelivr.net/npm/@supabase/auth-js@2.65.0/+esm');
    await tryImport('https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet-src.esm.js');
    await new Promise((r) => setTimeout(r, 300));
    return viol;
  });
  check(res.some((u) => u.includes('/gh/')), 'CSP : fichiers GitHub via jsDelivr (/gh/) refusés');
  check(res.some((u) => u.includes('qrcode-generator')) && res.some((u) => u.includes('@supabase')) && res.some((u) => u.includes('paquet-inconnu')), 'CSP : tout paquet jsDelivr autre que Leaflet refusé (supabase-js, qrcode-generator et html-to-image sont servis par site/assets/vendor/)');
  check(!res.some((u) => u.includes('leaflet@1.9.4')), 'CSP : Leaflet 1.9.4 (jsDelivr) autorisé');
  check(await p.evaluate(() => window.top === window.self && document.documentElement.style.visibility !== 'hidden'), 'page normale : affichée, pas de masquage');
  await p.ctx.close();

  // 3a. Code en attente récent (10 min) : appliqué après confirmation de l'e-mail, puis effacé.
  const pendingPage = async (ageMs) => {
    const q = await openPage(browser, { page: 'legal', scenario: { uid: 'nouveau-membre' } });
    await q.evaluate((age) => localStorage.setItem('hg_pending_join', JSON.stringify({ code: 'HG-TEST01', pseudo: 'Nouvelle', at: Date.now() - age })), ageMs);
    await q.goto(`${base}/pages/compte/compte.html`);
    await sleep(2000);
    return q;
  };
  p = await pendingPage(10 * 60000);
  // Succès = appel hg_join visible, ou redirection vers l'accueil déjà faite (elle n'a lieu qu'après un hg_join réussi).
  await p.waitForURL(/\/accueil\.html$/, { timeout: 4000 }).catch(() => {});
  let calls = await p.evaluate(() => (window.__LOG || []).filter((l) => l[0] === 'rpc' && l[1] === 'hg_join').map((l) => l[2])).catch(() => []);
  const joined = calls.some((a) => a?.p_code === 'HG-TEST01') || /\/accueil\.html$/.test(p.url());
  const left = await p.evaluate(() => localStorage.getItem('hg_pending_join'));
  check(joined && left === null, `code en attente de 10 min : rejoint le gang, entrée effacée (${p.url()})`);
  await p.ctx.close();

  // 3b. Code en attente de plus d'une heure : ignoré (pas d'appel hg_join), effacé, formulaire « rejoindre » vide.
  p = await pendingPage(2 * 3600000);
  calls = await p.evaluate(() => (window.__LOG || []).filter((l) => l[0] === 'rpc' && l[1] === 'hg_join'));
  const left2 = await p.evaluate(() => localStorage.getItem('hg_pending_join'));
  const pseudo = await p.inputValue('#jn-pseudo').catch(() => 'absent');
  check(!calls.length && left2 === null && pseudo === '', `code en attente de 2 h : ignoré et effacé, formulaire vide (pseudo="${pseudo}")`);
  check(!p.errs.length, 'compte : aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
  await p.ctx.close();

  // 4. Session par l'adresse (F4) : lue seulement sur compte.html, flux PKCE partout, coupée pour un code d'invitation.
  p = await openPage(browser, { page: 'legal', scenario: { guest: true } });
  let o = await p.evaluate(() => window.__SB_OPTS?.auth || {});
  check(o.detectSessionInUrl === false && o.flowType === 'pkce', `/pages/infos/legal.html : adresse ignorée, flux PKCE (${JSON.stringify(o)})`);
  await p.goto(`${base}/pages/compte/compte.html`); await sleep(1200);
  o = await p.evaluate(() => window.__SB_OPTS?.auth || {});
  check(o.detectSessionInUrl === true && o.flowType === 'pkce', '/pages/compte/compte.html : retour d\'e-mail lu, flux PKCE');
  await p.goto(`${base}/pages/compte/compte.html?code=HG-ABCD12`); await sleep(1200);
  o = await p.evaluate(() => window.__SB_OPTS?.auth || {});
  check(o.detectSessionInUrl === false, '/pages/compte/compte.html?code=HG-… (invitation) : adresse non lue par l\'authentification');
  await p.ctx.close();

  // 5. ?joinerr= (F6) : un texte libre n'est jamais affiché ; un code connu donne son message.
  p = await openPage(browser, { page: 'legal', scenario: { uid: 'nouveau-membre' } });
  await p.goto(`${base}/pages/compte/compte.html?joinerr=${encodeURIComponent('Ton compte est suspendu, écris à @x sur Discord')}`); await sleep(1500);
  let err = await p.textContent('#join-form .form-error').catch(() => '');
  check(!/suspendu/.test(err) && /Impossible de rejoindre le gang/.test(err), `joinerr libre : message générique (« ${err} »)`);
  await p.goto(`${base}/pages/compte/compte.html?joinerr=code`); await sleep(1500);
  err = await p.textContent('#join-form .form-error').catch(() => '');
  check(/Code d.invitation invalide/.test(err), `joinerr=code : message connu (« ${err} »)`);
  await p.ctx.close();

  // 6. ?recovery=1 avec une session déjà ouverte (sans lien d'e-mail) : pas de formulaire sans l'ancien mot de passe.
  p = await openPage(browser, { page: 'compte', scenario: {} });
  await p.goto(`${base}/pages/compte/compte.html?recovery=1`); await sleep(1800);
  check(await p.locator('#recovery-form').count() === 0 && await p.locator('#pw-form').count() === 1, 'recovery=1 sur une session existante : tableau de bord, pas de formulaire de réinitialisation');
  await p.ctx.close();

  // 7. Changement de mot de passe (F9) : mot de passe actuel exigé et vérifié avant updateUser.
  p = await openPage(browser, { page: 'compte', scenario: { password: 'bon-mot-de-passe' } });
  await p.waitForSelector('#pw-form', { timeout: 6000 });
  const pwLog = async () => (await p.evaluate(() => (window.__LOG || []).filter((l) => l[0] === 'auth').map((l) => l[1])));
  await p.fill('#pw-new', 'nouveau-mdp-123'); await p.click('#pw-form button[type=submit]'); await sleep(400);
  err = await p.textContent('#pw-form .form-error').catch(() => '');
  check(/mot de passe actuel/i.test(err) && !(await pwLog()).includes('updateUser'), `sans mot de passe actuel : refusé (« ${err} »)`);
  await p.fill('#pw-current', 'faux'); await p.click('#pw-form button[type=submit]'); await sleep(500);
  err = await p.textContent('#pw-form .form-error').catch(() => '');
  check(/actuel incorrect/.test(err) && !(await pwLog()).includes('updateUser'), `mot de passe actuel faux : refusé, aucun changement (« ${err} »)`);
  await p.fill('#pw-current', 'bon-mot-de-passe'); await p.click('#pw-form button[type=submit]'); await sleep(600);
  const seq = await pwLog();
  check(seq.join(',').endsWith('signInWithPassword,updateUser') && await p.inputValue('#pw-current') === '', `mot de passe actuel juste : vérifié puis changé (${seq.join(' → ')})`);
  check(!p.errs.length, 'compte : aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
  await p.ctx.close();

  // 8. Déconnexion (F5) : la ligne push de l'appareil est supprimée et le navigateur désabonné avant signOut.
  p = await openPage(browser, { page: 'accueil', scenario: {} });
  const rec = [];
  await p.exposeFunction('__rec', (x) => { rec.push(x); });
  await p.ctx.addInitScript(() => {
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/test', unsubscribe: async () => { window.__rec('unsubscribe'); return true; } };
    const reg = { pushManager: { getSubscription: async () => sub } };
    // Le faux site (http://hg.test) n'est pas un contexte sécurisé : service worker et push sont simulés.
    const sw = { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg), controller: null, addEventListener() {} };
    try { Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => sw, configurable: true }); } catch (e) { /* déjà défini */ }
    if (!('PushManager' in window)) window.PushManager = function PushManager() {};
    let arr = [];
    Object.defineProperty(window, '__LOG', { configurable: true, get: () => arr, set: (v) => {
      arr = v; const push = arr.push.bind(arr);
      arr.push = (...xs) => { for (const x of xs) if (x[0] === 'delete' || (x[0] === 'auth' && x[1] === 'signOut')) window.__rec(x[0] === 'delete' ? `delete:${x[1]}` : 'signOut'); return push(...xs); };
    } });
  });
  await p.reload(); await sleep(1500);
  await p.click('.nav-me'); // « Se déconnecter » est dans l'éventail de la photo de profil
  await p.click('.me-fan .nav-logout');
  await p.waitForURL(/compte\.html/, { timeout: 6000 }).catch(() => {});
  await sleep(300);
  check(rec.join(',') === 'delete:hg_push_subscriptions,unsubscribe,signOut', `déconnexion : ligne push supprimée, désabonnement, puis signOut (${rec.join(' → ')})`);
  await p.ctx.close();

  // 9. Affiches (F7) : CSP présente ; Leaflet chargé avec une empreinte d'intégrité (F3).
  const fsx = require('fs'), px = require('path');
  const affDir = px.join(ROOT, 'affiches');
  const sansCsp = fsx.readdirSync(affDir).filter((f) => f.endsWith('.html') && !/http-equiv="Content-Security-Policy"/.test(fsx.readFileSync(px.join(affDir, f), 'utf8')));
  check(!sansCsp.length, 'affiches : CSP sur chaque page' + (sansCsp.length ? ` (manque : ${sansCsp.join(', ')})` : ''));
  p = await openPage(browser, { page: 'affiches/boosters-gamme-a3', scenario: {} });
  const cspAff = [];
  p.on('console', (m) => { if (/Content Security Policy|Refused/i.test(m.text())) cspAff.push(m.text().slice(0, 140)); });
  await p.reload(); await sleep(1500);
  check(!cspAff.length && (await p.locator('body *').count()) > 20, 'affiche avec script en ligne : autorisé par son empreinte, page remplie' + (cspAff.length ? ` (${cspAff.join(' | ')})` : ''));
  await p.ctx.close();
  // Texte source (site/) : dans une version construite, le fichier de _site/ est un relais (voir construire.mjs).
  const irl = fsx.readFileSync(px.join(__dirname, '..', '..', '..', 'site', 'assets/espaces/irl/irl-history.js'), 'utf8');
  check(/s\.integrity = LEAFLET_SRI\.js/.test(irl) && /css\.integrity = LEAFLET_SRI\.css/.test(irl), 'Leaflet : script et feuille de style chargés avec integrity');
  const pages = fsx.readdirSync(ROOT).filter((f) => f.endsWith('.html') && !['offline.html', '/pages/jeux/simulateur.html'].includes(f));
  // /pages/jeux/jeux.html ajoute seulement le lecteur YouTube de Heardle (script iframe_api et ses fichiers sur s.ytimg.com).
  const SCRIPT_OK = { '/pages/jeux/jeux.html': "script-src 'self' https://cdn.jsdelivr.net/npm/leaflet@1.9.4/ https://www.youtube.com https://s.ytimg.com;" };
  const cspLarge = pages.filter((f) => !fsx.readFileSync(px.join(ROOT, f), 'utf8').includes(SCRIPT_OK[f] || "script-src 'self' https://cdn.jsdelivr.net/npm/leaflet@1.9.4/;"));
  check(!cspLarge.length, 'CSP des pages : script-src limité à \'self\' et Leaflet 1.9.4 de jsDelivr (plus YouTube pour Heardle)' + (cspLarge.length ? ` (${cspLarge.join(', ')})` : ''));

  await browser.close();
  finish();
})();
