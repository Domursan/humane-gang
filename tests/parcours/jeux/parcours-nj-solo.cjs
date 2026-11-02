// Parcours des jeux solo (/pages/jeux/jeux.html : Démineur #demineur, Sudoku du jour #sudoku, 2048 Paillettes #2048).
// Démineur facile joué jusqu'au bout (cœurs fixés par window.__SCN.demineurCoeurs), drapeau au clic droit et au clavier,
// partie perdue, niveau difficile en écran étroit (30 × 16) ; sudoku rempli avec la solution connue du faux (notes,
// conflit, case donnée protégée), grille du jour déjà terminée (rejeu sans score), grille refusée par le serveur ;
// 2048 : coups au clavier, glissement au doigt, « Terminer et enregistrer » ; 360 px sans défilement horizontal ;
// aucune erreur JS. Faux Supabase : fixtures/fake-sb-solo.mjs (état exposé dans window.__SOLO).
const fs = require('fs');
const { check, finish, openPage, hscroll, log, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');

// Cœurs du démineur facile (9 × 9, 10 cœurs), [ligne, colonne]. Le premier clic est en (0, 0) : aucun cœur dans sa zone 3 × 3.
const COEURS = [[0, 8], [1, 6], [2, 2], [2, 7], [3, 0], [5, 3], [6, 6], [7, 1], [7, 8], [8, 4]];
const idxDe = (r, c, n) => r * n + c;
const SOLUTION = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
const DONNES = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
/** Mémoire des erreurs JS de la page, sans les 404 des modules d'autres missions (onglets.js les déclare, pas encore écrits). */
const MISSIONS_EN_COURS = /nj-(connexions|motscroises|motmele|anagramme|nerdle)\.js/;
const erreursJs = (p) => p.errs.filter((e) => !MISSIONS_EN_COURS.test(e));
/** Temps affiché (mm:ss), comme l'applique le module. */
const mmss = (s) => { const t = Math.floor(s); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
/** Nombre entier lu dans un texte formaté (espaces fines ou non). */
const entier = (t) => Number(String(t).replace(/\D/g, '')) || 0;

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  /* ---------- Démineur : facile, une partie gagnée ---------- */
  let p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#demineur', width: 1280, scenario: { demineurCoeurs: COEURS } });
  await p.waitForSelector('#dm-champ .sol-case', { timeout: 5000 }).catch(() => {});
  check((await p.locator('.sol-titre').first().innerText()).includes('Démineur'), 'démineur : titre affiché');
  check((await p.locator('#dm-champ .sol-case').count()) === 81, 'démineur facile : grille 9 × 9 (81 cases)');
  check((await p.locator('#dm-coeurs').innerText()) === '10', 'démineur facile : 10 cœurs restants');
  check((await p.locator('#dm-gain').innerText()).includes('+10 ✦ par jour'), 'démineur : Paillettes « +10 ✦ par jour »');
  check((await p.locator('#dm-niv-detail').innerText()).includes('9 × 9'), 'démineur : détail du niveau facile');
  check((await p.locator('#dm-board').innerText()).includes('SwanNex'), 'démineur : classement de la semaine (SwanNex)');
  check((await p.locator('#dm-jeu').innerText()).includes('Mode drapeau'), 'démineur : bouton « Mode drapeau »');
  await p.click('#dm-champ .sol-case[data-i="0"]');
  await p.waitForFunction(() => document.querySelector('#dm-statut')?.textContent.includes('Partie en cours'), null, { timeout: 3000 }).catch(() => {});
  let debuts = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut');
  check(debuts.length === 1 && debuts[0][2].p_jeu === 'demineur' && debuts[0][2].p_var === 'facile', 'démineur : hg_nj_solo_debut au premier coup (demineur, facile)');
  check((await p.locator('#dm-chrono').innerText()) !== '', 'démineur : chrono affiché');
  // Clic droit : drapeau arc-en-ciel sur un cœur caché
  await p.click(`#dm-champ .sol-case[data-i="${idxDe(2, 2, 9)}"]`, { button: 'right' });
  check((await p.locator('#dm-coeurs').innerText()) === '9', 'drapeau (clic droit) : compteur à 9');
  check((await p.locator(`#dm-champ .sol-case[data-i="${idxDe(2, 2, 9)}"].is-drapeau .sol-drapeau`).count()) === 1, 'drapeau : arc-en-ciel posé sur la case');
  // Ouvrir toutes les cases sans cœur
  const sansCoeur = [];
  for (let i = 0; i < 81; i++) {
    const r = Math.floor(i / 9), c = i % 9;
    if (!COEURS.some(([a, b]) => a === r && b === c)) sansCoeur.push(i);
  }
  for (const i of sansCoeur) {
    const ouverte = await p.locator(`#dm-champ .sol-case[data-i="${i}"]`).evaluate((el) => el.classList.contains('is-ouverte') || el.classList.contains('is-drapeau'));
    if (!ouverte) await p.click(`#dm-champ .sol-case[data-i="${i}"]`);
  }
  await p.waitForFunction(() => document.querySelector('#dm-fin') && !document.querySelector('#dm-fin').hidden, null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('#dm-statut').innerText()).includes('Gagné'), 'démineur : partie gagnée (toutes les cases sans cœur ouvertes)');
  const fins = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_fin');
  check(fins.length === 1 && fins[0][2].p_res.gagne === true, 'démineur : hg_nj_solo_fin envoyé avec gagne = true');
  await p.waitForSelector('#dm-fin .sol-grand', { timeout: 3000 }).catch(() => {});
  const official = await p.evaluate(() => window.__SOLO.parties.find((x) => x.jeu === 'demineur')?.secondes ?? -1);
  check((await p.locator('#dm-fin .sol-grand').innerText()) === `Gagné en ${mmss(official)}`, `démineur : temps officiel du serveur affiché (${mmss(official)})`);
  check((await p.locator('#dm-fin').innerText()).includes('Paillettes reçues : +10 ✦'), 'démineur : Paillettes reçues (+10 ✦)');
  check((await p.locator('#dm-gain').innerText()).includes('Déjà reçues aujourd’hui'), 'démineur : état « déjà reçues aujourd’hui »');
  check((await p.locator('#dm-board').innerText()).includes('Ethan'), 'démineur : le membre figure au classement après la partie');
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal');
  await p.screenshot({ path: `${SHOTS}/nj-demineur-1280.png`, fullPage: true });

  // Nouvelle partie au clavier : flèches, Entrée (ouvrir), F (drapeau)
  await p.click('#dm-nouv');
  await p.waitForFunction(() => document.querySelector('#dm-statut')?.textContent.includes('Touche une case'), null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('#dm-coeurs').innerText()) === '10', 'nouvelle partie : 10 cœurs, plateau remis à zéro');
  await p.focus('#dm-champ .sol-case[data-i="0"]');
  await p.keyboard.press('ArrowRight');
  check(await p.evaluate(() => document.activeElement?.dataset.i === '1'), 'clavier : flèche droite déplace le focus (case 1)');
  await p.keyboard.press('Enter');
  await sleep(150);
  check(await p.locator('#dm-champ .sol-case[data-i="1"]').evaluate((el) => el.classList.contains('is-ouverte')), 'clavier : Entrée ouvre la case');
  // Un cœur caché (8, 4) : F pose un drapeau, puis la flèche haut déplace le focus
  await p.focus(`#dm-champ .sol-case[data-i="${idxDe(8, 4, 9)}"]`);
  await p.keyboard.press('f');
  check((await p.locator('#dm-coeurs').innerText()) === '9', 'clavier : F pose un drapeau (compteur à 9)');
  await p.keyboard.press('ArrowUp');
  check(await p.evaluate(() => document.activeElement?.dataset.i === '67'), 'clavier : flèche haut déplace le focus (case 67)');

  // Partie perdue : un cœur ouvert
  await p.click('#dm-nouv');
  await p.click('#dm-champ .sol-case[data-i="0"]');
  await p.click(`#dm-champ .sol-case[data-i="${idxDe(0, 8, 9)}"]`);
  await p.waitForFunction(() => document.querySelector('#dm-statut')?.textContent.includes('Boum'), null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('#dm-statut').innerText()).includes('Boum'), 'perdu : un cœur ouvert met fin à la partie');
  check((await p.locator(`#dm-champ .sol-case[data-i="${idxDe(0, 8, 9)}"]`).evaluate((el) => el.classList.contains('is-explose'))), 'perdu : le cœur touché est marqué');
  await p.waitForSelector('#dm-fin .sol-grand', { timeout: 3000 }).catch(() => {});
  check((await p.locator('#dm-fin .sol-grand').innerText()).startsWith('Perdu en'), 'perdu : « Perdu en … » affiché');
  const finPerdu = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_fin').pop();
  check(finPerdu && finPerdu[2].p_res.gagne === false, 'perdu : hg_nj_solo_fin envoyé avec gagne = false');

  // Niveau moyen : 16 × 16 et 40 cœurs
  await p.click('[data-niv="moyen"]');
  await p.waitForFunction(() => document.querySelector('#dm-coeurs')?.textContent === '40', null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('#dm-champ .sol-case').count()) === 256 && (await p.locator('#dm-coeurs').innerText()) === '40', 'niveau moyen : 16 × 16, 40 cœurs');
  check((await p.locator('[data-niv="moyen"]').getAttribute('aria-pressed')) === 'true', 'niveau moyen : bouton choisi (aria-pressed)');
  check(erreursJs(p).length === 0, 'démineur (1280) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  // Démineur sur téléphone : difficile en 30 lignes × 16 colonnes, sans défilement horizontal
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#demineur', width: 360, scenario: { demineurCoeurs: COEURS } });
  await p.waitForSelector('#dm-champ .sol-case', { timeout: 5000 }).catch(() => {});
  await p.click('[data-niv="difficile"]');
  await p.waitForFunction(() => document.querySelector('#dm-coeurs')?.textContent === '99', null, { timeout: 3000 }).catch(() => {});
  const colonnes = await p.evaluate(() => getComputedStyle(document.getElementById('dm-champ')).gridTemplateColumns.split(' ').length);
  check(colonnes === 16, `360 px, difficile : 16 colonnes affichées (${colonnes})`);
  const premiers = await p.evaluate(() => [...document.querySelectorAll('#dm-champ .sol-case')].slice(0, 3).map((b) => Number(b.dataset.i)));
  check(premiers.join(',') === '0,30,60', '360 px, difficile : 30 lignes × 16 colonnes (premiers index 0, 30, 60)');
  check((await p.locator('#dm-champ .sol-case').count()) === 480, 'difficile : 480 cases (16 × 30)');
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal (démineur difficile)');
  await p.screenshot({ path: `${SHOTS}/nj-demineur-360.png`, fullPage: true });
  check(erreursJs(p).length === 0, '360 px (démineur) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Sudoku du jour ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#sudoku', width: 1280 });
  await p.waitForSelector('#su-grille .sol-s', { timeout: 5000 }).catch(() => {});
  check((await p.locator('.sol-s').count()) === 81, 'sudoku : grille 9 × 9 (81 cases)');
  check((await p.locator('.sol-s.is-donnee').count()) === 30, 'sudoku : 30 chiffres donnés, en gras');
  check((await p.locator('.sol-banniere').innerText()).includes('La même grille pour tout le gang aujourd’hui'), 'sudoku : bandeau « La même grille pour tout le gang »');
  check((await p.locator('#su-sub').innerText()).startsWith('Grille du'), 'sudoku : date de la grille');
  check((await p.locator('#su-niveau').innerText()) === 'facile', 'sudoku : niveau facile');
  check((await p.locator('#su-gain').innerText()).includes('+10 ✦ par jour'), 'sudoku : Paillettes « +10 ✦ par jour »');
  // Case donnée : protégée
  await p.click('.sol-s[data-i="0"]');
  await p.keyboard.press('1');
  check((await p.locator('.sol-s[data-i="0"]').innerText()).trim() === '5', 'sudoku : un chiffre donné ne bouge pas');
  check((await log(p)).every((e) => !(e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut')), 'sudoku : pas de partie ouverte tant qu’aucun chiffre n’est posé');
  // Notes : 1 et 9 en petits chiffres, puis le chiffre définitif efface les notes
  await p.click('.sol-s[data-i="2"]');
  await p.keyboard.press('n');
  check((await p.locator('#su-notes').innerText()).includes('activé'), 'notes : mode activé');
  await p.keyboard.press('1');
  await p.keyboard.press('9');
  const notes = await p.locator('.sol-s[data-i="2"] .sol-s-notes').innerText().catch(() => '');
  check(notes.includes('1') && notes.includes('9'), 'notes : petits chiffres 1 et 9 dans la case');
  check((await log(p)).every((e) => !(e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut')), 'notes : ne démarrent pas la partie');
  await p.keyboard.press('n');
  // Conflit : un 5 en ligne 1 (il y a déjà un 5 en case 0), puis le bon chiffre
  await p.click('.sol-s[data-i="3"]');
  await p.keyboard.press('5');
  check(await p.locator('.sol-s[data-i="3"]').evaluate((el) => el.classList.contains('is-conflit')), 'conflit : le 5 en doublon apparaît en rouge');
  await p.keyboard.press('6');
  check(!(await p.locator('.sol-s[data-i="3"]').evaluate((el) => el.classList.contains('is-conflit'))), 'conflit : levé quand le chiffre est juste');
  await p.waitForFunction(() => document.querySelector('#su-statut')?.textContent.includes('Partie en cours'), null, { timeout: 3000 }).catch(() => {});
  let deb = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut');
  check(deb.length === 1 && deb[0][2].p_jeu === 'sudoku', 'sudoku : hg_nj_solo_debut au premier chiffre posé');
  await p.screenshot({ path: `${SHOTS}/nj-sudoku-1280-en-cours.png`, fullPage: true });
  // Remplir le reste avec la solution connue du faux
  for (let i = 0; i < 81; i++) {
    if (DONNES[i] !== '0' || i === 3) continue; // la case 3 est déjà remplie (test du conflit)
    await p.click(`.sol-s[data-i="${i}"]`);
    await p.keyboard.press(SOLUTION[i]);
  }
  await p.waitForSelector('#su-fin .sol-grand', { timeout: 5000 }).catch(() => {});
  const finSu = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_fin').pop();
  check(finSu && finSu[2].p_res.gagne === true && finSu[2].p_res.grille === SOLUTION, 'sudoku : grille complète envoyée au serveur (81 chiffres, solution)');
  const tempsSu = await p.evaluate(() => window.__SOLO.parties.find((x) => x.jeu === 'sudoku')?.secondes ?? -1);
  check((await p.locator('#su-fin .sol-grand').innerText()) === `Grille du jour terminée en ${mmss(tempsSu)}`, `sudoku : temps officiel affiché (${mmss(tempsSu)})`);
  check((await p.locator('.sol-s.fxj-eclat').count()) > 0, 'sudoku effets : une ligne, une colonne ou un bloc complété s’est éclairé');
  check((await p.locator('#su-fin.fxj-entree .fxj-tampon').count()) === 1, 'sudoku effets : la carte de fin gagnée reçoit le tampon et l’entrée');
  await sleep(1800); // le gain défile après l'entrée de la carte de fin
  check((await p.locator('#su-fin').innerText()).includes('Paillettes reçues : +10 ✦'), 'sudoku : Paillettes reçues');
  check((await p.locator('#su-fin .fxj-gain').count()) === 0 && ((await p.locator('#su-fin').innerText()).match(/\+10/g) || []).length === 1, 'sudoku effets : le gain n’est affiché qu’une fois');
  check((await p.locator('#su-board').innerText()).includes('Ethan'), 'sudoku : classement du jour mis à jour');
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal (sudoku)');
  await p.screenshot({ path: `${SHOTS}/nj-sudoku-1280.png`, fullPage: true });
  check(erreursJs(p).length === 0, 'sudoku (1280) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  // Grille du jour déjà terminée : rejeu pour le plaisir, sans score
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#sudoku', width: 390, scenario: { sudokuFait: { secondes: 312 } } });
  await p.waitForSelector('#su-fin', { state: 'attached', timeout: 5000 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector('#su-fin')?.hidden, null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('#su-fin .sol-grand').innerText()) === 'Grille du jour terminée en 05:12', 'déjà terminée : « Grille du jour terminée en 05:12 »');
  check(await p.locator('#su-rejouer').isVisible(), 'déjà terminée : bouton « Rejouer sans score » visible');
  check((await p.locator('#su-fin .fxj-tampon').count()) === 1 && (await p.locator('#su-fin.fxj-entree').count()) === 0 && (await p.locator('.fxj-eclat').count()) === 0, 'déjà terminée : tampon seul, aucune animation à l’ouverture');
  await p.click('.sol-s[data-i="2"]');
  await p.keyboard.press('4');
  await sleep(200);
  check((await log(p)).every((e) => !(e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut')), 'déjà terminée : aucune partie ouverte, rien envoyé');
  await p.click('#su-rejouer');
  check((await p.locator('.sol-s[data-i="2"]').innerText()).trim() === '', 'rejeu : la grille repart des chiffres donnés');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal (sudoku)');
  check(erreursJs(p).length === 0, 'déjà terminée (390) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  // Grille refusée par le serveur : « Grille incorrecte », nouvelle partie chronométrée
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#sudoku', width: 1280, scenario: { sudokuRefuse: true } });
  await p.waitForSelector('#su-grille .sol-s', { timeout: 5000 }).catch(() => {});
  for (let i = 0; i < 81; i++) {
    if (DONNES[i] !== '0') continue;
    await p.click(`.sol-s[data-i="${i}"]`);
    await p.keyboard.press(SOLUTION[i]);
  }
  await p.waitForFunction(() => document.querySelector('#su-fin')?.textContent.includes('Grille incorrecte'), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('#su-fin').innerText()).includes('Grille incorrecte'), 'refusée : « Grille incorrecte » affiché');
  check((await p.locator('#su-grille.fxj-secoue').count()) === 1 && (await p.locator('#su-fin .fxj-tampon').count()) === 0, 'refusée : la grille secoue, pas de carte de fin habillée');
  deb = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut');
  check(deb.length === 2, 'refusée : une nouvelle partie chronométrée est ouverte (2 débuts)');
  check(erreursJs(p).length === 0, 'refusée : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  // Sudoku sur téléphone
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#sudoku', width: 360 });
  await p.waitForSelector('#su-grille .sol-s', { timeout: 5000 }).catch(() => {});
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal (sudoku)');
  await p.screenshot({ path: `${SHOTS}/nj-sudoku-360.png`, fullPage: true });
  check(erreursJs(p).length === 0, '360 px (sudoku) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- 2048 Paillettes ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#2048', width: 1280 });
  await p.waitForSelector('#g-plateau', { timeout: 5000 }).catch(() => {});
  check((await p.locator('#g-score').innerText()) === '0', '2048 : score à 0 au départ');
  check((await p.locator('#g-finir').isDisabled()) === true, '2048 : « Terminer et enregistrer » désactivé avant le premier coup');
  check((await p.locator('.sol-tuile').count()) === 2, '2048 : deux tuiles au départ');
  check((await p.locator('#g-board').innerText()).includes('Domu'), '2048 : meilleurs scores de la semaine (Domu)');
  check((await p.locator('#g-gain').innerText()).includes('+10 ✦ par jour'), '2048 : Paillettes « +10 ✦ par jour »');
  check((await p.locator('.sol-rarete').count()) === 7, '2048 : échelle des raretés (7 niveaux)');
  await p.focus('#g-plateau');
  const touches = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
  for (let k = 0; k < 40; k++) {
    await p.keyboard.press(touches[k % 4]);
    await sleep(40);
    if ((await p.locator('#g-score').innerText()) !== '0') break;
  }
  await sleep(250);
  const score = entier(await p.locator('#g-score').innerText());
  check(score > 0, `2048 : les coups au clavier marquent des points (${score})`);
  deb = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_debut');
  check(deb.length === 1 && deb[0][2].p_jeu === '2048', '2048 : hg_nj_solo_debut au premier coup (une seule fois)');
  check((await p.locator('.sol-tuile[data-rang]').count()) >= 2, '2048 : tuiles de rareté (classe data-rang)');
  // Glissement au doigt (souris) : seuil de 30 px, la page ne défile pas (le focus du plateau a pu la décaler avant)
  const scrollAvant = await p.evaluate(() => window.scrollY);
  const box = await p.locator('#g-plateau').boundingBox();
  const y = box.y + box.height / 2;
  await p.mouse.move(box.x + box.width * 0.8, y);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width * 0.2, y, { steps: 8 });
  await p.mouse.up();
  await sleep(300);
  check((await p.evaluate(() => window.scrollY)) === scrollAvant, 'glissement : la page ne défile pas');
  // Terminer et enregistrer
  const affiche = entier(await p.locator('#g-score').innerText());
  await p.click('#g-finir');
  await p.waitForSelector('#g-fin .sol-grand', { timeout: 5000 }).catch(() => {});
  const finG = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_solo_fin').pop();
  check(finG && finG[2].p_res.gagne === true && finG[2].p_res.score === affiche, `2048 : score envoyé au serveur (${affiche})`);
  const titreFin = await p.locator('#g-fin .sol-grand').innerText();
  check(titreFin.startsWith('Partie enregistrée') && entier(titreFin) === affiche, `2048 : partie enregistrée affichée (${affiche} pts)`);
  check((await p.locator('#g-fin').innerText()).includes('Paillettes reçues : +10 ✦'), '2048 : Paillettes reçues (+10 ✦)');
  check((await p.locator('#g-gain').innerText()).includes('Déjà reçues aujourd’hui'), '2048 : état « déjà reçues aujourd’hui »');
  check((await p.locator('#g-finir').isDisabled()) === true, '2048 : partie finie, bouton désactivé');
  await p.screenshot({ path: `${SHOTS}/nj-2048-1280.png`, fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal (2048)');
  check(erreursJs(p).length === 0, '2048 (1280) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  // 2048 sur téléphone, à 360 px
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#2048', width: 360 });
  await p.waitForSelector('#g-plateau', { timeout: 5000 }).catch(() => {});
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal (2048)');
  const cadre = await p.locator('#g-plateau').boundingBox();
  check(cadre && cadre.width <= 360 - 32 + 1, '360 px : grille 2048 tient dans la marge');
  await p.screenshot({ path: `${SHOTS}/nj-2048-360.png`, fullPage: true });
  check(erreursJs(p).length === 0, '360 px (2048) : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Catalogue et tableau de bord ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash: '#aujourdhui', width: 390 });
  await p.waitForFunction(() => document.body.innerText.includes('Sudoku du jour'), null, { timeout: 5000 }).catch(() => {});
  const hub = await p.locator('#jeux-panels').innerText();
  check(hub.includes('Démineur') && hub.includes('Sudoku du jour') && hub.includes('2048 Paillettes'), 'tableau de bord : les trois jeux solo sont listés');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal (tableau de bord)');
  check(erreursJs(p).length === 0, 'tableau de bord : aucune erreur JS' + (erreursJs(p).length ? ' — ' + erreursJs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Captures à 390 px (téléphone) ---------- */
  for (const [hash, nom, attente] of [['#demineur', 'demineur', '#dm-champ .sol-case'], ['#sudoku', 'sudoku', '#su-grille .sol-s'], ['#2048', '2048', '#g-plateau']]) {
    p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-solo.mjs', hash, width: 390, scenario: { demineurCoeurs: COEURS } });
    await p.waitForSelector(attente, { timeout: 5000 }).catch(() => {});
    check((await hscroll(p)) <= 0, `390 px (${nom}) : pas de défilement horizontal`);
    await p.screenshot({ path: `${SHOTS}/nj-${nom}-390.png`, fullPage: true });
    check(erreursJs(p).length === 0, `390 px (${nom}) : aucune erreur JS`);
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
