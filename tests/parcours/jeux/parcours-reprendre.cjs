// Parcours : barre « Reprendre ma partie » de la page Jeux (reprendre.js, migration 197), faux Supabase fixtures/fake-sb-jeux.mjs.
// États : aucune partie (la page ne change pas, aucun squelette), une, plusieurs, beaucoup (6 au bureau, 3 au téléphone, puis « Voir mes N autres
// parties »), chargement (squelette seulement si des parties à la dernière visite), erreur et « Réessayer ». Textes de chaque jeu, adresses,
// échappement, vue de départ seulement, un seul appel serveur, cibles de 44 px, 360 px sans défilement horizontal, thème clair.
// Lancer : node tests/parcours/jeux/parcours-reprendre.cjs
const { check, finish, openPage, hscroll, chromium } = require('../../lib/harness.cjs');
const FIX = 'fake-sb-jeux.mjs';
const MEMOIRE = 'hg_jeux_parties:';
const dans = (s) => new Date(Date.now() + s * 1000).toISOString();

const ECHECS = { espace: 'duel', jeu: 'echecs', nom_jeu: 'Échecs', code: 'HGEC-1001', nom: 'Échecs', statut: 'en_cours', robot: false, adversaire: 'Léo', defi_en_attente: false, tour_fin: dans(42), a_toi: true };
const LG = { espace: 'lg', jeu: 'loup-garou', nom_jeu: 'Loup-Garou', code: 'HGLG-3310', nom: 'Les veillées', statut: 'en_cours', phase: 'nuit', manche: 2, mode: 'auto', nb_joueurs: 8, vivants: 6, a_toi: true };
const UNO = { espace: 'uno', jeu: 'uno', nom_jeu: 'Uno', code: 'HGUNO-4821', nom: 'Uno du vendredi', statut: 'en_cours', inscrits: 4, mes_cartes: 3, tour_pseudo: 'Mia', a_toi: false };
const MONO = { espace: 'plat', jeu: 'monopoly', nom_jeu: 'Monopoly', code: 'HGMON-2204', nom: 'Monopoly de Sacha', statut: 'en_cours', inscrits: 3, tour_pseudo: 'Noé', a_toi: false };
const NDC = { espace: 'ndc', jeu: 'nom-de-code', nom_jeu: 'Nom de code', code: 'HGNDC-7714', nom: 'Mots du dimanche', statut: 'en_cours', inscrits: 6, tour_equipe: 'rose', a_toi: false };
const PLUS = [
  { espace: 'duel', jeu: 'p4', nom_jeu: 'Puissance 4', code: 'HGP4-1', nom: 'Puissance 4', statut: 'attente', adversaire: 'Lina', defi_en_attente: true, a_toi: false },
  { espace: 'duel', jeu: 'morpion', nom_jeu: 'Morpion', code: 'HGMO-1', nom: 'Morpion', statut: 'en_cours', robot: true, adversaire: 'Robot', a_toi: false },
  { espace: 'plat', jeu: 'blackjack', nom_jeu: 'Blackjack', code: 'HGBJK-1', nom: 'Table de Maya', statut: 'attente', inscrits: 2, a_toi: false },
  { espace: 'plat', jeu: 'shadow', nom_jeu: 'Shadow Hunters', code: 'HGSHH-1', nom: 'Table du samedi', statut: 'en_cours', inscrits: 5, tour_pseudo: 'Karim', a_toi: false },
  { espace: 'uno', jeu: 'uno', nom_jeu: 'Uno', code: 'HGUNO-1', nom: 'Uno rapide', statut: 'attente', inscrits: 3, mes_cartes: 7, a_toi: false },
  { espace: 'plat', jeu: 'risk', nom_jeu: 'Risk', code: 'HGRSK-1', nom: 'Risk du mois', statut: 'en_cours', inscrits: 4, tour_pseudo: 'Zoé', a_toi: false },
  { espace: 'duel', jeu: 'mastermind', nom_jeu: 'Mastermind', code: 'HGMM-1', nom: 'Mastermind', statut: 'en_cours', adversaire: 'Théo', a_toi: false },
];
const CINQ = [ECHECS, LG, UNO, MONO, NDC], TOUTES = [...CINQ, ...PLUS];

const appels = (p) => p.evaluate(() => window.__LOG.filter((l) => l[0] === 'rpc' && l[1] === 'hg_jeux_mes_parties').length);
const pret = (p) => p.waitForFunction(() => document.querySelector('#jeux-panel-tous .jx-carte'), null, { timeout: 8000 }).catch(() => {});
const lignes = (p) => p.locator('.rp .rp-ligne');
const sousDe = (p, i) => lignes(p).nth(i).locator('.rp-sous').innerText();

(async () => {
  const browser = await chromium.launch();

  /* ---------- Aucune partie : la page ne change pas ---------- */
  let p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: [] } });
  await pret(p);
  await p.waitForTimeout(300);
  check(await p.locator('.rp').isHidden(), 'aucune partie : pas de barre');
  check(await p.locator('.rp-sk').count() === 0, 'aucune partie : pas de squelette');
  check(await appels(p) === 1, 'un seul appel serveur à l’ouverture');
  await p.close();

  /* ---------- Une partie ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: [UNO] } });
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(await p.locator('.rp-titre').innerText() === 'Reprendre ma partie', 'titre');
  check(/1\s*$/.test(await p.locator('.rp-nb').innerText()), 'nombre de parties : 1');
  check(await sousDe(p, 0) === 'Uno · En cours · 4 joueurs · il te reste 3 cartes · c’est au tour de Mia', 'sous-titre Uno : ' + await sousDe(p, 0));
  check(await lignes(p).first().locator('a').getAttribute('href') === '/pages/jeux/uno.html#partie/HGUNO-4821', 'lien vers la table');
  check(/Reprendre\s+Uno du vendredi/.test(await lignes(p).first().locator('a').textContent()), 'lien nommé pour un lecteur d’écran');
  check(await p.locator('.rp-etiquette').count() === 0 && await p.locator('.rp-ligne.is-tour').count() === 0, 'pas son tour : pas d’étiquette');
  check(await p.locator('.rp-plus').count() === 0, 'une partie : pas de bouton');
  check(await p.locator('.rp + .jeux-layout').count() === 1, 'barre juste au-dessus de la liste des jeux');
  const memo = await p.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('hg_jeux_parties:')).length);
  check(memo === 1, 'mémoire de la visite écrite');
  await p.close();

  /* ---------- Plusieurs parties ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: CINQ } });
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(await lignes(p).count() === 5, 'plusieurs : 5 lignes');
  check(await p.locator('.rp-plus').count() === 0, 'plusieurs : pas de bouton');
  check(/^Contre Léo · à toi de jouer · reste 0:[34]\d$/.test(await sousDe(p, 0)), 'duel : ' + await sousDe(p, 0));
  check(await sousDe(p, 1) === 'Loup-Garou · Nuit 2 · 6 en vie sur 8 · meneur automatique', 'Loup-Garou : ' + await sousDe(p, 1));
  check(await sousDe(p, 3) === 'Monopoly · En cours · 3 joueurs · Tour de Noé', 'plateau : ' + await sousDe(p, 3));
  check(await sousDe(p, 4) === 'Nom de code · En cours · 6 joueurs · tour de l’équipe Rose', 'Nom de code : ' + await sousDe(p, 4));
  check(await p.locator('.rp-ligne.is-tour').count() === 2 && await p.locator('.rp-etiquette').first().innerText() === 'À toi', 'étiquette « À toi »');
  check((await lignes(p).first().locator('a').getAttribute('class')).includes('btn-sand'), 'à toi : bouton plein');
  check((await lignes(p).nth(2).locator('a').getAttribute('class')).includes('btn-ghost'), 'sinon : bouton discret');
  const avant = await lignes(p).first().locator('[data-fin]').innerText();
  await p.waitForTimeout(2200);
  check(await lignes(p).first().locator('[data-fin]').innerText() !== avant, 'le temps restant défile');
  const img = await p.evaluate(() => [...document.querySelectorAll('.rp-vig')].map((i) => i.getAttribute('src')));
  check(img[0].endsWith('/jeux/petit/echecs.webp') && img[1].endsWith('/jeux/petit/loup-garou.webp') && img[4].endsWith('/jeux/petit/nom-de-code.webp'), 'vignettes : ' + img.join());

  // Vue de départ seulement : ni sur un filtre, ni dans un jeu.
  await p.locator('.jx-filtre[data-f="flash"]').click();
  check(await p.locator('.rp').isHidden(), 'filtre Flash : barre cachée');
  await p.locator('.jx-filtre[data-f=""]').click();
  check(await p.locator('.rp').isVisible(), 'filtre Tous : barre revenue');
  await p.evaluate(() => { location.hash = '#aujourdhui'; });
  await p.waitForFunction(() => document.getElementById('jeux-panel-aujourdhui') && !document.getElementById('jeux-panel-aujourdhui').hidden);
  check(await p.locator('.rp').isHidden(), 'tableau de bord : barre cachée');
  const n1 = await appels(p);
  await p.evaluate(() => { location.hash = '#tous'; });
  await p.waitForFunction(() => !document.getElementById('jeux-panel-tous').hidden);
  await p.waitForTimeout(200);
  check(await p.locator('.rp').isVisible() && await appels(p) === n1 + 1, 'retour à la vue de départ : relue');
  await p.close();

  /* ---------- Beaucoup de parties, bureau ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: TOUTES } });
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(await lignes(p).count() === 6, 'bureau : 6 lignes');
  check(await p.locator('.rp-plus').innerText() === 'Voir mes 6 autres parties', 'bouton Voir');
  check(await p.locator('.rp-plus').getAttribute('aria-expanded') === 'false', 'replié');
  check(/12\s*$/.test(await p.locator('.rp-nb').innerText()), 'nombre total');
  await p.locator('.rp-plus').click();
  check(await lignes(p).count() === 12, 'déplié : tout');
  check(await p.locator('.rp-plus').innerText() === 'Réduire' && await p.locator('.rp-plus').getAttribute('aria-expanded') === 'true', 'bouton Réduire');
  check(await p.evaluate(() => document.activeElement?.classList.contains('rp-plus')), 'le focus reste sur le bouton');
  check(await sousDe(p, 5) === 'Contre Lina · en attente de sa réponse', 'défi en attente : ' + await sousDe(p, 5));
  check(await sousDe(p, 6) === 'Contre le robot · à l’autre de jouer', 'robot : ' + await sousDe(p, 6));
  check(await sousDe(p, 7) === 'Blackjack · Salle d’attente · 2 joueurs', 'salle de plateau : ' + await sousDe(p, 7));
  check(await sousDe(p, 11) === 'Contre Théo · chacun joue de son côté', 'mastermind : ' + await sousDe(p, 11));
  check(await p.locator('.rp-ligne a[href="/pages/jeux/shadow-hunters.html#partie/HGSHH-1"]').count() === 1, 'Shadow Hunters : page au bon nom');
  await p.locator('.rp-plus').click();
  check(await lignes(p).count() === 6, 'réduit');
  await p.close();

  /* ---------- Beaucoup de parties, téléphone ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, width: 360, height: 800, mobile: true, touch: true, scenario: { mesParties: TOUTES } });
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(await lignes(p).count() === 3, 'téléphone : 3 lignes');
  check(await p.locator('.rp-plus').innerText() === 'Voir mes 9 autres parties', 'téléphone : bouton Voir');
  check(!(await hscroll(p)), '360 px : pas de défilement horizontal');
  const cibles = await p.evaluate(() => [...document.querySelectorAll('.rp a, .rp button')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check(cibles.every(([l, h]) => l >= 44 && h >= 44), 'cibles de 44 px : ' + JSON.stringify(cibles));
  const tailles = await p.evaluate(() => [...document.querySelectorAll('.rp *')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('.visually-hidden')).map((e) => parseFloat(getComputedStyle(e).fontSize)));
  check(Math.min(...tailles) >= 12, 'texte de 12 px au moins');
  await p.close();

  /* ---------- Une seule ligne de plus : au singulier ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: TOUTES.slice(0, 7) } });
  await p.waitForSelector('.rp .rp-plus', { timeout: 8000 });
  check(await p.locator('.rp-plus').innerText() === 'Voir mon autre partie', 'singulier');
  await p.close();

  /* ---------- Échappement ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: [{ ...MONO, nom: '<img src=x onerror=window.__XSS=1>', tour_pseudo: '<b>Noé</b>' }, { ...ECHECS, adversaire: '<i>Léo</i>' }] } });
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(await p.locator('.rp img:not(.rp-vig), .rp b, .rp i').count() === 0 && !(await p.evaluate(() => window.__XSS)), 'noms échappés');
  await p.close();

  /* ---------- Chargement ---------- */
  // Pas de partie à la dernière visite : rien pendant le chargement.
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: [UNO], mesPartiesAttente: true } });
  await pret(p);
  await p.waitForTimeout(300);
  check(await p.locator('.rp-sk').count() === 0 && await p.locator('.rp').isHidden(), 'chargement sans mémoire : aucun squelette');
  await p.evaluate(() => window.__HG_LIBERE());
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(true, 'puis la liste');
  // Avec des parties à la dernière visite (écrites par le passage ci-dessus, même membre) : deux lignes réservées.
  const cle = await p.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('hg_jeux_parties:')));
  check(cle?.startsWith(MEMOIRE), 'clé de mémoire');
  await p.close();
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: [], mesPartiesAttente: true }, init: `try { localStorage.setItem(${JSON.stringify(cle)}, '1'); } catch {}` });
  await p.waitForSelector('.rp .rp-sk', { timeout: 8000 });
  check(await p.locator('.rp-sk').count() === 2 && await p.locator('.rp-liste').getAttribute('aria-busy') === 'true', 'squelette de deux lignes');
  check(await p.locator('.rp-titre').isVisible() && await p.locator('.rp-nb').count() === 0, 'titre sans nombre');
  await p.evaluate(() => window.__HG_LIBERE());
  await p.waitForFunction(() => document.querySelector('.rp').hidden, null, { timeout: 8000 });
  check(await p.evaluate((k) => localStorage.getItem(k), cle) === null, 'plus de partie : mémoire effacée');
  await p.close();

  /* ---------- Erreur ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: [UNO], mesPartiesKo: true } });
  await p.waitForSelector('.rp-erreur', { timeout: 8000 });
  check(await p.locator('.rp-erreur').getAttribute('role') === 'alert' && (await p.locator('.rp-erreur p').innerText()) === 'Tes parties n’ont pas pu être lues.', 'message d’erreur');
  await p.evaluate(() => { window.__SCN.mesPartiesKo = false; });
  await p.locator('.rp-erreur button').click();
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check(await lignes(p).count() === 1 && await p.locator('.rp-erreur').count() === 0, 'Réessayer : la liste revient');
  await p.close();

  /* ---------- Ouvert directement sur un jeu : aucun appel ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#aujourdhui', scenario: { mesParties: CINQ } });
  await p.waitForFunction(() => document.getElementById('jeux-panel-aujourdhui') && !document.getElementById('jeux-panel-aujourdhui').hidden);
  await p.waitForTimeout(300);
  check(await appels(p) === 0 && await p.locator('.rp').isHidden(), 'hors vue de départ : pas d’appel, pas de barre');
  await p.close();

  /* ---------- Contraste de l'étiquette, clair et sombre ---------- */
  const lumi = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const rapport = (a, b) => { const [h, l] = [lumi(a), lumi(b)].sort((x, y) => y - x); return (h + 0.05) / (l + 0.05); };
  for (const mode of ['sombre', 'clair']) {
    p = await openPage(browser, { page: 'jeux', fixture: FIX, scenario: { mesParties: CINQ }, init: `try { localStorage.setItem('hg_prefs', JSON.stringify({ mode: '${mode}' })); } catch {}` });
    await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
    check(await p.evaluate(() => document.documentElement.dataset.mode) === mode, `mode ${mode} posé`);
    const c = await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.rp-etiquette')); const q = getComputedStyle(document.querySelector('.rp-sous')); const f = getComputedStyle(document.querySelector('.rp-ligne')); return [s.color, s.backgroundColor, q.color, f.backgroundColor]; });
    check(rapport(c[0], c[1]) >= 4.5, `${mode} : étiquette lisible ${rapport(c[0], c[1]).toFixed(1)}`);
    check(rapport(c[2], c[3]) >= 4.5, `${mode} : sous-titre lisible ${rapport(c[2], c[3]).toFixed(1)}`);
    await p.close();
  }

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
