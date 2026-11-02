// Parcours « Mes stats » (idée 18, migration 208) : vue /pages/jeux/jeux.html#mes-stats, faux Supabase fixtures/fake-sb-stats.mjs.
// (a) 1280 px : une seule RPC hg_jeux_mes_stats(p_periode) par affichage ; tuiles (parties, moyenne, Paillettes avec les bonus,
//     meilleure série), « Ton rival » (le membre juste au-dessus), tableau jeu par jeu (19 jeux, trié par parties, ligne sans partie,
//     date d'arrivée d'un jeu, temps manquants), liens Duels / Uno / Plateaux ; pas d'onglet ni de ligne du tableau de bord ;
//     période « 7 jours » puis « Ce mois » (premier : pas de rival) ; capture sombre et claire.
// (b) 390 px : pas de défilement horizontal, tableau en fiches, cibles ≥ 44 px.
// (c) Nouveau membre : « Pas encore de chiffres » et lien vers les jeux du jour. (d) Chargement : squelettes et aria-busy.
// (e) Erreur : message, « Réessayer » relance. (f) « Ma carte » : bouton « Mes stats de jeux » pour soi, absent sur la carte d'un autre.
// Lancer : node tests/parcours/jeux/parcours-mes-stats.cjs
const path = require('path');
const { check, finish, openPage, hscroll, log, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');
const FIX = 'fake-sb-stats.mjs';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const erreurs = (p) => p.errs.filter((e) => !/integrity|leaflet@/i.test(e));
const appels = (p) => log(p).then((l) => l.filter((x) => x[0] === 'rpc' && x[1] === 'hg_jeux_mes_stats').map((x) => x[2]?.p_periode));
const attendre = (p, sel) => p.waitForSelector(sel, { timeout: 6000 }).catch(() => {});
const texte = (p, sel) => p.locator(sel).first().innerText().catch(() => '');
const clair = `try { localStorage.setItem('hg_prefs', JSON.stringify({ mode: 'clair' })); } catch {}`;

(async () => {
  const browser = await chromium.launch();

  /* ---------- (a) Grand écran : la vue complète ---------- */
  let p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#mes-stats', width: 1280, height: 900 });
  await attendre(p, '.ms-t');
  check((await appels(p)).join(',') === 'tout', 'une seule RPC hg_jeux_mes_stats, période « tout » par défaut');
  check(await p.locator('#jeux-panel-mes-stats').isVisible() && await p.locator('#jeux-panel-mes-stats').getAttribute('aria-labelledby') === 'ms-h' && await p.locator('#ms-h').count() === 1, 'panneau « Mes stats » visible, nommé par son titre');
  check(await p.locator('#jeux-tab-mes-stats').count() === 0 && await p.locator('.jeux-row[data-open="mes-stats"]').count() === 0, 'pas d’onglet ni de ligne du tableau de bord : ce n’est pas un jeu');
  check(await p.title() === 'Mes stats · Jeux · Humane Gang', `titre de l’onglet du navigateur (${await p.title()})`);
  check(!(await p.locator('#jeux-retour').isHidden()), 'lien « Tous les jeux » affiché');
  check(/Depuis le \d+\S* \S+, date des premiers résultats enregistrés · visible par toi seul/.test(await texte(p, '.ms-tete .small')), `sous-titre : date des premiers résultats, visible par toi seul (${await texte(p, '.ms-tete .small')})`);
  const tuiles = await p.locator('.ms-tuile').allInnerTexts();
  check(tuiles.length === 4 && /PARTIES\s+88\s+77 réussies/i.test(tuiles[0]), `tuile Parties : 88, 77 réussies (${tuiles[0]?.replace(/\s+/g, ' ')})`);
  check(/MOYENNE\s+7,9/i.test(tuiles[1]) && /\/ 10/.test(tuiles[1]), 'tuile Moyenne : 7,9 / 10');
  check(/12\s?760/.test(tuiles[2]) && /dont 2 bonus « 16 jeux »/.test(tuiles[2]), `tuile Paillettes : 12 760 (parties + bonus), dont 2 bonus (${tuiles[2]?.replace(/\s+/g, ' ')})`);
  check(/7 jours/.test(tuiles[3]) && /Connexions et Sutom du gang/.test(tuiles[3]), `tuile Meilleure série : 7 jours, Connexions et Sutom du gang (${tuiles[3]?.replace(/\s+/g, ' ')})`);
  const rival = await texte(p, '.ms-rival');
  check(/Bruno est juste devant toi : 704 pts, 9 de plus\./.test(rival) && /Toi : 695 pts, 4e sur 11 depuis le début/.test(rival), `rival : Bruno 704 pts, 9 de plus ; moi 4e sur 11 (${rival.replace(/\s+/g, ' ')})`);
  check(await p.locator('.ms-rival .avatar').count() === 1, 'rival : avatar affiché');
  check(await p.locator('.ms-t tbody tr').count() === 19, '19 lignes, une par jeu');
  const premiers = await p.locator('.ms-t tbody tr th').allInnerTexts();
  check(/^Connexions/.test(premiers[0]) && /^Réplique du jour/.test(premiers[1]) && /^Sutom du gang/.test(premiers[2]) && /^Anagramme/.test(premiers[3]), `tri par parties (7, 7, 7, 6) puis nom (${premiers.slice(0, 3).map((t) => t.split('\n')[0]).join(' / ')})`);
  const sutom = await texte(p, '.ms-t tbody tr:has(th:has-text("Sutom du gang"))');
  check(/7\s+6\s+7,3 \/ 10\s+10/.test(sutom.replace(/\n/g, ' ')) && /7 · record 7/.test(sutom), `ligne Sutom : 7 parties, 6 réussies, 7,3 / 10, meilleur 10, série 7 · record 7 (${sutom.replace(/\s+/g, ' ')})`);
  check(/1\s?095 ✦ · 3,2 essais en moyenne · 1 min 35 en moyenne/.test(sutom), `ligne Sutom : Paillettes, essais, temps moyen sous le nom (${sutom.replace(/\s+/g, ' ')})`);
  check(await p.locator('.ms-t tbody tr:has(th:has-text("Sutom du gang")) .ms-jeu img[src$="/sutom.webp"]').count() === 1, 'ligne Sutom : image du jeu');
  const vide = await texte(p, '.ms-t tbody tr.is-vide');
  check(/Qui a dit ça \?/.test(vide) && /Pas encore de partie notée/.test(vide) && !/✦/.test(vide), '« Qui a dit ça ? » : ligne sans partie, sans Paillettes');
  const qdj = await texte(p, '.ms-t tbody tr:has(th:has-text("Question du jour"))');
  check(/depuis le \d+\S* \S+\.?/.test(qdj) && /temps non noté/.test(qdj) && !/essai/.test(qdj), `Question du jour : « depuis le … », temps non noté, pas d’essais (${qdj.replace(/\s+/g, ' ')})`);
  const code = await texte(p, '.ms-t tbody tr:has(th:has-text("Code du jour"))');
  check(/3 min 00 en moyenne \(4 parties chronométrées\)/.test(code), `Code du jour : temps noté sur 4 parties sur 6 (${code.replace(/\s+/g, ' ')})`);
  const grille = await texte(p, '.ms-t tbody tr:has(th:has-text("Connexions"))');
  check(!/essai/.test(grille) && /2 min 20 en moyenne/.test(grille), `Connexions (grille) : pas d’essais, temps moyen (${grille.replace(/\s+/g, ' ')})`);
  const liens = await p.locator('.ms-liens a').evaluateAll((as) => as.map((a) => `${a.textContent.trim()}=${a.getAttribute('href')}`));
  check(liens.join(' ') === 'Duels=/pages/jeux/duels.html#stats Uno=/pages/jeux/uno.html#stats Plateaux=/pages/jeux/blackjack.html#stats', `liens vers les autres stats (${liens.join(' ')})`);
  check(await p.locator('.ms-t thead').isVisible(), '1280 px : en-tête du tableau visible');
  await p.screenshot({ path: path.join(SHOTS, 'mes-stats-1280.png'), fullPage: true });
  // Période « 7 jours » : nouvelle RPC, bouton enfoncé, chiffres changés
  await p.click('[data-ms-per="7"]');
  await p.waitForFunction(() => /\b20\b/.test(document.querySelector('.ms-tuile')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  check((await appels(p)).join(',') === 'tout,7', 'période « 7 jours » : une RPC de plus, p_periode = 7');
  check(await p.locator('[data-ms-per="7"]').getAttribute('aria-pressed') === 'true' && await p.locator('[data-ms-per="tout"]').getAttribute('aria-pressed') === 'false', 'période : bouton « 7 jours » enfoncé');
  check(/20\s+17 réussies/.test((await p.locator('.ms-tuile').first().innerText()).replace(/\n/g, ' ')), '7 jours : tuile Parties = 20');
  check(/Les 7 derniers jours, depuis le/.test(await texte(p, '.ms-tete .small')), '7 jours : sous-titre adapté');
  check(/2e sur 9 sur 7 jours/.test(await texte(p, '.ms-rival')), '7 jours : rang sur la période');
  await p.click('[data-ms-per="7"]');
  await sleep(300);
  check((await appels(p)).length === 2, 'même période cliquée deux fois : pas de nouvelle RPC');
  await p.click('[data-ms-per="mois"]');
  await p.waitForFunction(() => /Personne devant toi/.test(document.querySelector('.ms-rival')?.textContent || ''), null, { timeout: 6000 }).catch(() => {});
  check(/Personne devant toi : tu es 1er sur 10 ce mois-ci, avec 246 pts\./.test(await texte(p, '.ms-rival')), `ce mois, premier : pas de rival (${(await texte(p, '.ms-rival')).replace(/\s+/g, ' ')})`);
  check(/dont 1 bonus « 16 jeux »/.test((await p.locator('.ms-tuile').nth(2).innerText())), 'ce mois : 1 bonus');
  check(erreurs(p).length === 0, `aucune erreur JS (1280) ${erreurs(p).join(' | ')}`);
  await p.ctx.close();

  // Thème clair : capture seulement (contraste vérifié à l'œil et par a11y-mobile)
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#mes-stats', width: 1280, height: 900, init: clair });
  await attendre(p, '.ms-t');
  await sleep(400);
  check(await p.evaluate(() => document.documentElement.dataset.theme === 'clair' || document.documentElement.dataset.mode === 'clair' || getComputedStyle(document.body).backgroundColor !== 'rgb(0, 0, 0)'), 'thème clair appliqué');
  await p.screenshot({ path: path.join(SHOTS, 'mes-stats-clair-1280.png'), fullPage: true });
  await p.ctx.close();

  /* ---------- (b) Téléphone ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#mes-stats', width: 390, height: 844, mobile: true, touch: true });
  await attendre(p, '.ms-t');
  check(await hscroll(p) <= 0, '390 px : pas de défilement horizontal');
  check(await p.locator('.ms-t thead').evaluate((t) => getComputedStyle(t).position === 'absolute'), '390 px : en-tête du tableau masqué (fiches)');
  check(await p.locator('.ms-t tbody tr:first-child td[data-k="Parties"]').evaluate((td) => getComputedStyle(td, '::before').content.includes('Parties')), '390 px : chaque cellule porte son libellé');
  check(await p.locator('.ms-tuiles').evaluate((g) => getComputedStyle(g).gridTemplateColumns.split(' ').length === 2), '390 px : tuiles sur deux colonnes');
  const minH = await p.evaluate(() => Math.min(...[...document.querySelectorAll('[data-ms-per], .ms-liens a, #jeux-retour')].filter((b) => b.getClientRects().length > 0).map((b) => b.getBoundingClientRect().height)));
  check(minH >= 44, `390 px : cibles ≥ 44 px (min ${Math.round(minH)})`);
  const minFont = await p.evaluate(() => Math.min(...[...document.querySelectorAll('.ms *')].filter((e) => e.textContent.trim() && e.getClientRects().length).map((e) => parseFloat(getComputedStyle(e).fontSize))));
  check(minFont >= 12, `390 px : textes ≥ 12 px (min ${minFont})`);
  await p.screenshot({ path: path.join(SHOTS, 'mes-stats-390.png'), fullPage: true });
  check(erreurs(p).length === 0, `aucune erreur JS (390) ${erreurs(p).join(' | ')}`);
  await p.ctx.close();

  /* ---------- (c) Nouveau membre ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#mes-stats', width: 390, height: 844, scenario: { statsVide: true }, init: clair });
  await attendre(p, '.ms-vide');
  const v = await texte(p, '.ms-vide');
  check(/Pas encore de chiffres\./.test(v) && /après ta première partie d’un jeu du jour/.test(v), 'nouveau membre : « Pas encore de chiffres »');
  check(await p.locator('.ms-vide a[href="/pages/jeux/jeux.html#quotidien"]').count() === 1, 'nouveau membre : lien « Voir les jeux du jour »');
  check(await p.locator('.ms-tuile, .ms-t, .ms-rival').count() === 0, 'nouveau membre : ni tuiles, ni tableau, ni rival');
  check(/^Visible par toi seul$/.test((await texte(p, '.ms-tete .small')).trim()), 'nouveau membre : sous-titre « Visible par toi seul »');
  await p.screenshot({ path: path.join(SHOTS, 'mes-stats-vide-390.png'), fullPage: true });
  await p.ctx.close();

  /* ---------- (d) Chargement ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#mes-stats', width: 1280, height: 900, scenario: { statsLent: true } });
  await attendre(p, '.ms-sk');
  check(await p.locator('.ms-sk').count() === 5 && await p.locator('.ms[aria-busy="true"]').count() === 1, 'chargement : 5 squelettes et aria-busy');
  check(await p.locator('#ms-h').count() === 1 && /Chargement/.test(await texte(p, '.ms-tete .small')), 'chargement : titre et période déjà en place');
  await attendre(p, '.ms-t');
  check(await p.locator('.ms-sk').count() === 0 && await p.locator('.ms[aria-busy="true"]').count() === 0, 'après chargement : squelettes retirés');
  await p.ctx.close();

  /* ---------- (e) Erreur puis « Réessayer » ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#mes-stats', width: 1280, height: 900, scenario: { statsFailOnce: true } });
  await attendre(p, '[data-ms-retry]');
  check(/Tes stats n’ont pas pu se charger\./.test(await texte(p, '.ms-vide[role="alert"]')), 'erreur : message dans un rôle alert');
  await p.click('[data-ms-retry]');
  await attendre(p, '.ms-t');
  check(await p.locator('.ms-t').count() === 1 && (await appels(p)).length === 2, '« Réessayer » : deuxième RPC, chiffres affichés');
  check(erreurs(p).length === 0, `aucune erreur JS (erreur relancée) ${erreurs(p).join(' | ')}`);
  await p.ctx.close();

  /* ---------- (f) Ma carte : l'entrée ---------- */
  p = await openPage(browser, { page: 'membre', fixture: FIX, width: 1280, height: 900 });
  await attendre(p, '#dl-card');
  check(await p.locator('#mb-stats-jeux').count() === 1 && await p.locator('#mb-stats-jeux').getAttribute('href') === '/pages/jeux/jeux.html#mes-stats', 'Ma carte : bouton « Mes stats de jeux » vers #mes-stats');
  check(/Mes stats de jeux/.test(await texte(p, '#mb-stats-jeux')) && await p.locator('#mb-stats-jeux svg').count() === 1, 'Ma carte : libellé et icône');
  check(await p.locator('#mb-stats-jeux').evaluate((a) => a.previousElementSibling?.textContent.includes('Modifier mon profil')), 'Ma carte : à côté de « Modifier mon profil »');
  await p.screenshot({ path: path.join(SHOTS, 'mes-stats-carte-1280.png') });
  await p.goto(`${p.url().split('?')[0]}?id=${U(2)}`);
  await attendre(p, '#dl-card');
  check(await p.locator('#mb-stats-jeux').count() === 0, 'carte d’un autre membre : pas de bouton (stats privées)');
  check(erreurs(p).length === 0, `aucune erreur JS (Ma carte) ${erreurs(p).join(' | ')}`);
  await p.ctx.close();

  await browser.close();
  finish();
})();
