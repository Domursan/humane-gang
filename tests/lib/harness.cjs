// Harnais commun des tests (tests/lib/harness.cjs).
// Outils communs aux tests : site servi depuis le dépôt sans serveur, faux Supabase (tests/fixtures/),
// compteurs de résultats (check / finish), ouverture de page et de panel admin.
// Aucun test ne doit atteindre la vraie base : toute requête vers *.supabase.co est interceptée
// et signalée, et finish() échoue si l'une a été tentée.
// Utilisé par les smoke*.cjs et les parcours-*.cjs via require('./lib/harness.cjs'). Rien à lancer seul : voir tests/README.md.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

/* ---------- Constantes : chemins (dépôt, tests, fixtures, captures) et adresse du faux site ---------- */
const TESTS = path.resolve(__dirname, '..');
// Racine du site publié : le dossier site/ du dépôt (les pages sont rangées dans site/pages/<catégorie>/).
const ROOT = process.env.HG_ROOT ? path.resolve(process.env.HG_ROOT) : path.resolve(TESTS, '..', 'site');
/** Dépôt complet (sources hors site/ : supabase/, docs/…). */
const DEPOT = path.resolve(ROOT, '..');
/**
 * Adresse d'une page à partir de son nom court (ex. 'jeux' -> '/pages/jeux/pages/jeux/jeux.html', 'index' -> '/index.html').
 * @param {string} slug nom de la page, sans .html
 * @returns {string}
 */
function urlPage(slug) {
  if (fs.existsSync(path.join(ROOT, `${slug}.html`))) return `/${slug}.html`;
  const pagesDir = path.join(ROOT, 'pages');
  for (const cat of fs.existsSync(pagesDir) ? fs.readdirSync(pagesDir) : []) {
    if (fs.existsSync(path.join(pagesDir, cat, `${slug}.html`))) return `/pages/${cat}/${slug}.html`;
  }
  return `/${slug}.html`;
}
const FIXTURES = path.join(TESTS, 'fixtures');
const SHOTS = path.join(TESTS, 'shots');
fs.mkdirSync(SHOTS, { recursive: true }); // créé avant toute capture (absent d'une copie fraîche)
const ORIGIN = 'http://hg.test';
// Préfixe de chemin : HG_PREFIX=/human-gang sert le site comme GitHub Pages (https://humane-gang.com/).
// Tout chemin hors préfixe (ex. /assets/… à la racine) répond 404, comme en ligne : un chemin absolu cassé se voit.
/** Préfixe de chemin : le site peut être servi sous /human-gang/ comme sur GitHub Pages. */
const PREFIX = (process.env.HG_PREFIX || '').replace(/\/+$/, '');
/** Type MIME envoyé au navigateur, selon l'extension du fichier. */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

/** Compteurs de résultats et liste des requêtes vers le vrai Supabase (remplie par openPage). */
let fails = 0, passes = 0;
const EXTERNAL = [];

/** Affiche un résultat. Compte les échecs pour finish(). */
function check(cond, msg) {
  if (cond) passes++; else fails++;
  console.log((cond ? 'OK     ' : 'ECHEC ') + msg);
  return !!cond;
}

/** Termine le script : code de sortie non nul si un contrôle a échoué ou si le vrai Supabase a été sollicité. */
function finish() {
  if (EXTERNAL.length) { fails++; console.log('ECHEC requêtes vers le vrai Supabase interceptées : ' + EXTERNAL.join(', ')); }
  console.log(`\n${passes} OK, ${fails} ECHEC(S)`);
  process.exitCode = fails ? 1 : 0;
}

/** Attend ms millisecondes (laisse le temps aux animations et au rendu). */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/**
 * Ouvre une page du site dans un contexte isolé.
 * fixture : fichier de tests/fixtures/ qui remplace le client supabase-js.
 * scenario : objet visible par le faux client sous window.__SCN (ex. { guest: true }).
 * reducedMotion : 'reduce' pour désactiver les animations (préférence système).
 * touch : true pour un écran tactile (page.tap possible).
 * mobile / dpr : téléphone émulé (isMobile, deviceScaleFactor), ex. { mobile: true, dpr: 2.6 }.
 * hash : fragment d'adresse à l'ouverture (ex. '#cartes/quetes').
 * Mesure de performance (tests/controles/perf-budget.cjs) : delay(octets) → millisecondes d'attente avant chaque réponse du site
 * (réseau lent simulé), cpu : ralentissement du processeur (×N, protocole Chrome), init : script ajouté avant le chargement.
 * Le contexte renvoyé (page.ctx) compte les requêtes servies et leurs octets : page.ctx.__net = { requetes, octets }.
 */
async function openPage(browser, { page: slug = 'accueil', fixture = 'fake-sb.mjs', scenario = {}, width = 1280, height = 900, reducedMotion = 'no-preference', hash = '', touch = false, now = null, mobile = false, dpr = 1, delay = null, cpu = 0, init = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion, hasTouch: touch || mobile, isMobile: mobile, deviceScaleFactor: dpr }); // touch : écran tactile (pointeur grossier)
  // Avec now (horloge simulée), le jour de l'intro vient de now : le script d'initialisation s'exécute avant l'horloge.
  const dayKey = now ? (() => { const d = new Date(now); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; })() : null;
  // Préfixe du site servi (HG_PREFIX) : les faux clients des fixtures s'en servent pour atteindre /tests/fixtures/.
  await ctx.addInitScript((p) => { window.__HG_RACINE = p; }, PREFIX);
  await ctx.addInitScript(({ s, dayKey }) => {
    window.__SCN = s;
    try {
      localStorage.setItem('hg_cookie_ok', '1');
      // Intro déjà jouée aujourd'hui (sinon l'accueil y renvoie) ; scenario.intro = true pour la tester
      const d = new Date();
      if (!s.intro) localStorage.setItem('hg_intro_day', dayKey || `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
      // Secret « nuit » (3 h à Zurich) : la chouette traverse le bas de l'écran et peut gêner les clics des tests lancés
      // entre 3 h et 4 h. On le marque comme déjà vu aujourd'hui, sauf avec scenario.nuit = true (et sans horloge simulée).
      if (!s.nuit && !dayKey) {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' })
          .formatToParts(new Date()).map((x) => [x.type, x.value]));
        sessionStorage.setItem(`hg_egg_nuit_${p.year}-${p.month}-${p.day}`, '1');
      }
    } catch (e) { /* stockage bloqué : sans importance pour le test */ }
  }, { s: scenario, dayKey });
  // init : script supplémentaire exécuté avant la page : nom d'un fichier de tests/fixtures/ (ex. fake-jeux.js : RPC des jeux)
  // ou script Playwright (fonction, { content }, { path }).
  if (init) await ctx.addInitScript(typeof init === 'string' && /\.m?js$/.test(init) ? { path: path.join(FIXTURES, init) } : init);
  const fakeBody = fs.readFileSync(path.join(FIXTURES, fixture));
  // polices : part des polices hébergées (assets/fonts) dans le total, comptée à part (perf-budget.cjs)
  const net = ctx.__net = { requetes: 0, octets: 0, polices: { requetes: 0, octets: 0 } };
  // Réponse comptée (requêtes et octets) et retardée si un réseau lent est simulé (delay).
  const serve = async (route, opts) => {
    const n = opts.body ? Buffer.byteLength(opts.body) : 0;
    net.requetes++; net.octets += n;
    if (/\/assets\/fonts\//.test(route.request().url())) { net.polices.requetes++; net.polices.octets += n; }
    if (delay) await sleep(delay(n));
    return route.fulfill(opts);
  };
  // Toute requête de la page passe ici : le site est servi depuis le dépôt, le faux Supabase remplace
  // supabase-js, les autres hôtes externes répondent vide (204). Les requêtes vers *.supabase.co sont notées dans EXTERNAL.
  await ctx.route('**/*', async (route) => {
    const req = route.request(), u = new URL(req.url());
    if (u.origin !== ORIGIN) {
      if (u.hostname.endsWith('supabase.co')) EXTERNAL.push(req.url());
      return route.fulfill({ status: 204, body: '' });
    }
    // supabase-js est servi localement : le module (assets/vendor/supabase-js-2.45.4.mjs, ou sa version regroupée
    // assets/_b/assets/vendor/supabase-js-2.45.4.js) reçoit le faux client. Le script classique préchargé par le HTML publié
    // (assets/vendor/supabase-js-2.45.4.js) reçoit un script vide : le faux client tient déjà sa place, et le compter deux
    // fois fausserait le budget de performance (en ligne, ce script n'est téléchargé qu'une fois).
    if (/^\/assets\/vendor\/supabase-js-[\d.]+\.js$/.test(u.pathname.slice(PREFIX.length))) return serve(route, { body: '/* faux client servi par le module */', contentType: 'text/javascript' });
    if (/\/vendor\/supabase/.test(u.pathname)) return serve(route, { body: fakeBody, contentType: 'text/javascript' });
    if (PREFIX && u.pathname !== PREFIX && !u.pathname.startsWith(PREFIX + '/')) return route.fulfill({ status: 404, body: 'nf' });
    const rel = u.pathname.slice(PREFIX.length) || '/';
    // Les bancs et les fixtures sont sous /tests/ (dossier tests/, hors du site servi) : seul ce préfixe leur est ouvert.
    const sousTests = /^\/tests\//.test(rel);
    const base = sousTests ? TESTS : ROOT;
    // Modèles du bot : publiés depuis supabase/functions/_shared/ (copie faite par publier-site.yml), jamais dans site/.
    const MODELES_BOT = '/assets/espaces/admin/bot-templates.json';
    const modeles = rel === MODELES_BOT ? path.join(DEPOT, 'supabase/functions/_shared/bot-templates.json') : null;
    let f = modeles || path.join(base, decodeURIComponent(sousTests ? rel.slice('/tests'.length) : rel));
    if (!modeles && !f.startsWith(base + path.sep)) return route.fulfill({ status: 403, body: 'interdit' });
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) { // comme GitHub Pages : une adresse inconnue reçoit 404.html, avec le statut 404
      const page404 = path.join(ROOT, '404.html');
      if (fs.existsSync(page404)) return route.fulfill({ status: 404, body: fs.readFileSync(page404), contentType: 'text/html' });
      return route.fulfill({ status: 404, body: 'nf' });
    }
    return serve(route, { body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });
  const page = await ctx.newPage();
  // now : horloge simulée (Playwright) installée avant la navigation, pour tester l'heure de Zurich
  if (now) await page.clock.install({ time: new Date(now) });
  if (cpu > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu }); }
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push('PAGEERR ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errs.push(m.text().slice(0, 200)); });
  page.on('response', (r) => { if (r.status() === 404) page.errs.push('404 ' + r.url()); });
  await page.goto(`${ORIGIN}${PREFIX}${urlPage(slug)}${hash}`); // hash : adresse de départ (lien direct), ex. '#membres/comptes/<id>'
  await sleep(1200);
  page.ctx = ctx;
  return page;
}

/** Décalage horizontal de la page (0 = pas de scroll horizontal). */
/** Décalage horizontal de la page : 0 si aucun défilement horizontal. */
const hscroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

/**
 * Admin : ouvre une page du panel (lieu/sous-section, ex. 'fabrique/defis', 'place/comptes/<id>') et attend qu'elle soit
 * affichée : la coquille annonce la page courante (data-route), et la section est visible. Les anciennes adresses
 * (#cartes/defis…) sont redirigées : seule la sous-section compte pour l'attente.
 */
async function adminSection(page, route) {
  const sub = route.split('/')[1] || route.split('/')[0];
  await page.evaluate((r) => { location.hash = r; }, route);
  await page.waitForFunction((s) => {
    const cur = document.getElementById('shell')?.dataset.route || '';
    if (cur.split('/')[1] !== s && cur !== s) return false;
    const sec = document.querySelector('#shell-groups > .shell-group:not([hidden]) .admin-section');
    return !!sec && sec.getClientRects().length > 0;
  }, sub, { timeout: 8000 });
}

/**
 * Admin : ouvre une section repliable (ui/fold.js : <details data-fold="cle">) si elle est fermée, pour atteindre ce qu'elle
 * contient (champs, boutons). Les sections fermées ont une hauteur nulle : un clic ou une mesure y échouerait.
 * @returns {Promise<boolean>} Faux si la section n'existe pas sur la page.
 */
async function ouvrirRepliable(page, cle) {
  const sel = `details[data-fold="${cle}"]`;
  await page.waitForSelector(sel, { state: 'attached', timeout: 5000 }).catch(() => {}); // la section apparaît après le chargement des données
  if (!(await page.$(sel))) return false;
  if (!(await page.$eval(sel, (d) => d.open))) await page.click(`${sel} > summary`);
  await page.waitForFunction((s) => document.querySelector(s)?.open === true, sel, { timeout: 3000 }).catch(() => {});
  return true;
}

/**
 * Admin : compteur « à traiter » d'une page, lu sur la tuile de sa page de lieu (la coquille ne garde pas de compteur
 * sur la page ouverte). Va sur #<lieu>, lit la pastille de la tuile, puis revient à l'adresse d'origine. Vide si aucun.
 */
async function countOf(page, lieu, sub) {
  const back = await page.evaluate(() => location.hash);
  await page.evaluate((h) => { location.hash = h; }, '#' + lieu);
  await page.waitForSelector(`#lieu-root .lieu-tile[data-sub="${sub}"]`, { timeout: 5000 }).catch(() => {});
  await sleep(150);
  const n = await page.evaluate((s) => document.querySelector(`#lieu-root .lieu-tile[data-sub="${s}"] .nav-count`)?.textContent?.trim() || '', sub);
  await page.evaluate((h) => { location.hash = h; }, back);
  await sleep(300);
  return n;
}

/** Journal des appels du faux client (rpc, from, fn, auth…). */
/** Renvoie le journal des appels du faux client, lu dans la page (window.__LOG). */
const log = (page) => page.evaluate(() => window.__LOG || []);

/** Collection : ouvre le panneau des filtres s'il est fermé, puis choisit une valeur dans une de ses listes. */
async function choisirFiltre(p, sel, val) {
  if (await p.$eval('#cartes-filtres', (d) => d.hidden)) await p.click('#cartes-filtres-btn');
  await p.selectOption(sel, val);
}

/** Collection : ouvre les filtres s'ils sont fermés, puis coche ou décoche une pastille « Dans ma collection ». */
async function basculerVue(p, id) {
  if (await p.$eval('#cartes-filtres', (d) => d.hidden)) await p.click('#cartes-filtres-btn');
  await p.click(`label:has(#cartes-v-${id})`);
}

module.exports = { choisirFiltre, basculerVue, ROOT, DEPOT, urlPage, TESTS, FIXTURES, SHOTS, ORIGIN, PREFIX, check, finish, openPage, adminSection, ouvrirRepliable, countOf, hscroll, log, sleep, chromium };
