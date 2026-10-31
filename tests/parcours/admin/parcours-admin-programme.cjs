// Parcours : La Fête foraine › Jeux › Programmation (admin/admin-programme.js, migration 183), sur le faux Supabase (fixtures/fake-sb.mjs).
// (a) lignes des jeux à date : « programmé jusqu'au », « rien de prévu », jours vides, alerte sous 7 jours, bouton Programmer ;
// (b) calendrier : mois complet, aujourd'hui marqué, une pastille par jeu et par jour, légende, mois suivant et précédent ;
// (c) détail d'un jour ; réponses absentes de la page par défaut, visibles avec la case, oubliées au rechargement ;
// (d) jeux automatiques : réserve, alerte sous 14 jours, jeux générés « rien à programmer » ;
// (e) clavier : flèches dans la grille, focus gardé après un clic ; lecture seule (aucune RPC d'écriture) ;
// (f) droits : Staff quiz (une seule ligne), Staff cartes (pas de page, adresse redirigée), erreur de la RPC ;
// (g) 375 px : pas de défilement horizontal, cases de 44 px de haut au moins ; (h) Programmer ouvre le bon écran et le bon onglet.
const { ROOT, check, finish, openPage, adminSection, hscroll, chromium, sleep } = require('../../lib/harness.cjs');
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const shots = process.env.SHOTS_DIR;
const ROUTE = 'fete/programmation';
const SUTOM = Array.from({ length: 10 }, (_, n) => ({ n, statut: n ? 'programme' : 'auto', titre: `MOTSECRET${n}`, par: n ? 'Ethan' : null }));
const scenario = {
  programme: {
    sutom: SUTOM,                                                     // 9 jours d'avance : pas d'alerte
    heardle: [{ n: 1, statut: 'programme', titre: 'Daft Punk — Secret', par: 'Bruno' }, { n: 2, statut: 'annule', titre: 'Annulé — Secret' }], // 1 jour : alerte
    framed: [],                                                       // rien de prévu
    geo: [{ n: 20, statut: 'programme', titre: 'Lausanne' }],         // rien avant le 20e jour
    quiz: [],
  },
  programmeReserves: { pochette: [10, 80] },
};
const texte = (p, s) => p.textContent(s);
const zday = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(Date.now() + n * 864e5);
/** Ouvre la page Programmation et attend le dessin. */
async function ouvre(p) {
  await adminSection(p, ROUTE);
  await p.waitForSelector('.pg, #programme-root .empty:not(:empty)', { timeout: 5000 });
  await sleep(300);
}

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  try {
    let p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario });
    await p.evaluate(() => { location.hash = '#fete'; });
    await p.waitForSelector('#lieu-root a[href="#fete/programmation"]', { timeout: 5000 });
    check((await texte(p, '#lieu-root a[href="#fete/programmation"]')).includes('Programmation'), '(a) tuile « Programmation » dans Jeux');
    await ouvre(p);
    check((await texte(p, '#zone-title')).trim() === 'Programmation', '(a) titre de page');

    /* ---------- (a) lignes ---------- */
    const ligne = (c) => texte(p, `.pg-row[data-jeu="${c}"]`);
    check(await p.$$eval('.pg-row', (l) => l.length) === 5, '(a) une ligne par jeu à date (5)');
    check(/Programmé jusqu’au/.test(await ligne('sutom')) && !(await ligne('sutom')).includes('Moins de 7'), '(a) Sutom : programmé, sans alerte');
    check((await ligne('sutom')).includes('4 jours vides sur 14'), `(a) Sutom : 4 jours vides sur 14 (${(await ligne('sutom')).replace(/\s+/g, ' ')})`);
    check((await ligne('heardle')).includes('Moins de 7 jours d’avance'), '(a) Heardle : alerte sous 7 jours');
    check((await ligne('heardle')).includes('13 jours vides'), '(a) Heardle : le jour annulé compte comme vide');
    check((await ligne('heardle')).includes('pas de partie'), '(a) Heardle : sans filet, il le dit');
    check((await ligne('framed')).includes('Rien de prévu') && (await ligne('framed')).includes('Moins de 7'), '(a) Framed : rien de prévu, alerte');
    check((await ligne('geo')).includes('Rien de prévu avant le'), '(a) GeoGuessr : prochaine manche lointaine signalée');
    check((await ligne('quiz')).includes('tirage automatique'), '(a) Question du jour : tirage automatique annoncé');

    /* ---------- (b) calendrier ---------- */
    const cases = await p.$$eval('.pg-day', (c) => c.length);
    check(cases >= 28 && cases <= 42 && cases % 7 === 0, `(b) mois complet en semaines (${cases} cases)`);
    check(await p.$$eval('.pg-dow span', (s) => s.length) === 7, '(b) 7 colonnes');
    check(await p.getAttribute('.pg-day.is-today', 'data-day') === zday(0), '(b) aujourd’hui marqué');
    check(await p.$eval('.pg-day.is-today', (b) => b.getAttribute('aria-current')) === 'date', '(b) aujourd’hui : aria-current');
    check(await p.$$eval('.pg-day.is-today .pg-p', (x) => x.map((e) => e.textContent).join('')) === 'SHFGQ', '(b) une pastille lettrée par jeu');
    check(await p.$$eval('.pg-day.is-today .pg-p-auto', (x) => x.length) === 1, '(b) Sutom d’aujourd’hui : automatique');
    const lab = await p.getAttribute('.pg-day.is-today', 'aria-label');
    check(lab.includes('Sutom du gang : automatique') && lab.includes('Framed : vide'), '(b) état de chaque jeu dans le nom accessible');
    const styles = await p.$$eval('.pg-legend .pg-p', (x) => x.map((e) => { const c = getComputedStyle(e); return `${c.borderTopStyle}|${c.backgroundImage !== 'none'}|${c.backgroundColor !== 'rgba(0, 0, 0, 0)'}`; }));
    check(new Set(styles).size === 4, `(b) quatre formes de pastille, lisibles sans la couleur (${styles.join(', ')})`);
    const t1 = await texte(p, '#pg-mois');
    await p.click('[data-pg="suiv"]'); await sleep(350);
    const t2 = await texte(p, '#pg-mois');
    check(t2 !== t1, `(b) mois suivant (${t2})`);
    check(await p.evaluate(() => document.activeElement?.dataset.pg) === 'suiv', '(e) focus gardé sur « mois suivant »');
    await p.click('[data-pg="prec"]'); await sleep(350);
    check(await texte(p, '#pg-mois') === t1, '(b) retour au mois précédent');
    const range = await p.evaluate(() => window.__LOG.filter((l) => l[1] === 'hg_jeux_programme').map((l) => l[2].p_days));
    check(range.length >= 2 && range.every((n) => n >= 1 && n <= 92), `(b) périodes lues : 92 jours au plus (${[...new Set(range)]})`);

    /* ---------- (c) détail et réponses ---------- */
    const k1 = zday(1);
    if (!(await p.$(`.pg-day[data-day="${k1}"]`))) { await p.click('[data-pg="suiv"]'); await sleep(350); }
    await p.click(`.pg-day[data-day="${k1}"]`); await sleep(100);
    const det = await texte(p, '#pg-detail');
    check(det.includes('Sutom du gang') && det.includes('Programmé par Ethan') && det.includes('Heardle') && det.includes('Framed'), '(c) détail du jour, jeu par jeu');
    check(det.includes('Réponse masquée'), '(c) réponse masquée par défaut');
    const html = await p.innerHTML('#programme-root');
    check(!html.includes('MOTSECRET') && !html.includes('Daft Punk') && !html.includes('Lausanne'), '(c) aucune réponse dans la page par défaut');
    check(await p.getAttribute(`.pg-day[data-day="${k1}"]`, 'aria-pressed') === 'true', '(c) jour choisi marqué');
    check(await p.evaluate((k) => document.activeElement?.dataset.day === k, k1), '(e) focus gardé sur le jour');
    await p.check('[data-pg="voir"]'); await sleep(100);
    const det2 = await texte(p, '#pg-detail');
    check(det2.includes('MOTSECRET1') && det2.includes('Daft Punk — Secret'), '(c) réponses affichées avec la case');
    if (shots) await p.screenshot({ path: `${shots}/programme.png`, fullPage: true });
    await p.click(`.pg-day[data-day="${k1}"]`); await sleep(100);
    check((await texte(p, '#pg-detail')).includes('MOTSECRET1') && await p.isChecked('[data-pg="voir"]'), '(c) case gardée pendant la page');
    const h = await p.evaluate(() => document.getElementById('app').scrollHeight);
    check(h <= 1400, `(c) hauteur ≤ 1 400 px (${h})`);
    const stock = await p.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    check(!/reponse|programme|voir/i.test(stock), '(c) rien d’enregistré dans le navigateur');
    await p.reload(); await p.waitForFunction(() => document.getElementById('shell')?.dataset.route);
    await ouvre(p);
    check(!(await p.isChecked('[data-pg="voir"]')) && !(await p.innerHTML('#programme-root')).includes('MOTSECRET'), '(c) case oubliée au rechargement');

    /* ---------- (d) automatiques ---------- */
    const autos = await texte(p, '#pg-h-auto + p + .pg-autos');
    check(autos.includes('Carte mystère') && autos.includes('300 jours de réserve'), '(d) réserve en jours');
    check(/Pochette du jour[\s\S]*10 jours de réserve[\s\S]*Moins de 14 jours/.test(autos), '(d) alerte sous 14 jours');
    check((autos.match(/Moins de 14/g) || []).length === 1, '(d) alerte sur ce seul jeu');
    const gen = await texte(p, '.pg-gen');
    check(['Nerdle du gang', 'Code du jour', 'Sudoku du jour'].every((g) => gen.includes(g)) && gen.includes('Rien à programmer'), '(d) jeux générés : rien à programmer');

    /* ---------- (e) clavier, lecture seule ---------- */
    const premiers = await p.$$eval('.pg-day', (b) => b.slice(0, 9).map((x) => x.dataset.day));
    await p.focus('.pg-day');
    await p.keyboard.press('ArrowRight');
    check(await p.evaluate(() => document.activeElement?.dataset.day) === premiers[1], '(e) flèche droite : jour suivant');
    await p.keyboard.press('ArrowDown');
    check(await p.evaluate(() => document.activeElement?.dataset.day) === premiers[8], '(e) flèche bas : semaine suivante');
    await p.keyboard.press('Enter'); await sleep(100);
    check(await p.$eval('.pg-day.is-sel', (b) => b.matches(':focus')), '(e) Entrée ouvre le jour, focus gardé');
    const contour = await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
    check(contour !== 'none', `(e) focus clavier visible (${contour})`);
    const ecritures = await p.evaluate(() => window.__LOG.filter((l) => l[0] === 'rpc' && /(_save|_program|_plan)$/.test(l[1])).map((l) => l[1]));
    check(ecritures.length === 0, `(e) lecture seule : aucune RPC d’écriture (${ecritures})`);
    check(p.errs.length === 0, '(a-e) aucune erreur JS' + (p.errs.length ? ' : ' + p.errs.slice(0, 3).join(' | ') : ''));

    /* ---------- (h) bouton Programmer ---------- */
    await p.click('.pg-row[data-jeu="quiz"] [data-pg="ouvrir"]');
    await p.waitForFunction(() => location.hash === '#fete/questions/jour');
    await p.waitForSelector('#adq-tab-j[aria-selected="true"]', { timeout: 5000 });
    check(true, '(h) Question du jour : onglet ouvert');
    await ouvre(p);
    await p.click('.pg-row[data-jeu="heardle"] [data-pg="ouvrir"]');
    await p.waitForFunction(() => location.hash === '#fete/framed-heardle/heardle');
    await p.waitForSelector('[data-part="heardle"][aria-pressed="true"]', { timeout: 5000 });
    check(true, '(h) Heardle : son onglet ouvert');
    await ouvre(p);
    await p.click('.pg-row[data-jeu="sutom"] [data-pg="ouvrir"]');
    await p.waitForFunction(() => location.hash === '#fete/sutom');
    check(true, '(h) Sutom : son écran');
    await p.ctx.close();

    /* ---------- (f) droits ---------- */
    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { ...scenario, uid: U(2), staff: ['quiz'] } });
    await ouvre(p);
    const lignes = await p.$$eval('.pg-row', (l) => l.map((x) => x.dataset.jeu));
    check(JSON.stringify(lignes) === '["quiz"]', `(f) Staff quiz : Question du jour seulement (${lignes})`);
    check(await p.$$eval('.pg-day.is-today .pg-p', (x) => x.length) === 1 && !(await p.$('#pg-h-auto')), '(f) Staff quiz : une pastille, pas de réserves');
    check(p.errs.length === 0, '(f) Staff quiz : aucune erreur JS');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { ...scenario, uid: U(2), staff: ['cartes'] } });
    await p.evaluate(() => { location.hash = '#fete'; }); await sleep(400);
    check(await p.locator('a[href="#fete/programmation"]').count() === 0, '(f) Staff cartes : pas de tuile');
    await p.evaluate(() => { location.hash = '#fete/programmation'; }); await sleep(500);
    check(await p.evaluate(() => location.hash) !== '#fete/programmation' && !(await p.isVisible('#jeux-programme')), '(f) Staff cartes : adresse redirigée, section masquée');
    check(await p.evaluate(() => !window.__LOG.some((l) => l[1] === 'hg_jeux_programme')), '(f) Staff cartes : RPC jamais appelée');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario, init: () => { window.__FAKE_RPC = (fn) => (fn === 'hg_jeux_programme' ? { data: null, error: { message: 'Réservé à l’admin', code: '42501' } } : undefined); } });
    await ouvre(p);
    check((await texte(p, '#programme-root')).includes('Programmation indisponible : '), '(f) refus de la base : écran vide propre');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario, init: () => { window.__FAKE_RPC = (fn) => (fn === 'hg_jeux_programme' ? { data: { today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(Date.now()), jeux: [] }, error: null } : undefined); } });
    await ouvre(p);
    check((await texte(p, '#programme-root')).includes('Aucun jeu à programmer avec tes droits'), '(f) aucun jeu permis : écran vide propre');
    await p.ctx.close();

    /* ---------- (g) téléphone ---------- */
    p = await openPage(browser, { page: 'admin', width: 375, height: 812, scenario });
    await ouvre(p);
    check(await hscroll(p) <= 0, '(g) 375 px : pas de défilement horizontal');
    const mini = await p.$$eval('.pg-day', (b) => Math.min(...b.map((x) => x.getBoundingClientRect().height)));
    check(mini >= 44, `(g) cases d’au moins 44 px de haut (${Math.round(mini)})`);
    check(await p.$$eval('.pg-days li', (l) => { const tops = new Set(l.slice(0, 7).map((x) => Math.round(x.getBoundingClientRect().top))); return tops.size === 1; }), '(g) la semaine tient sur une ligne');
    await p.click('.pg-day.is-today');
    await p.check('[data-pg="voir"]'); await sleep(100);
    check(await hscroll(p) <= 0, '(g) détail ouvert : pas de défilement horizontal');
    if (shots) await p.screenshot({ path: `${shots}/programme-mobile.png`, fullPage: true });
    check(p.errs.length === 0, '(g) aucune erreur JS');
    await p.ctx.close();
  } catch (e) { check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]); }
  finally { await browser.close(); }
  finish();
})();
