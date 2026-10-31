// Parcours des grilles du jour (Connexions, Mot mêlé, Nerdle du gang) : Connexions gagnée (un essai « à un mot près », un
// « Quatre mots au plus », copie du résultat), Connexions perdue en 4 erreurs, Mot mêlé trouvé jusqu'au bout (glisser, deux
// appuis, clavier, ligne invalide), Nerdle gagné en 2 essais (calcul faux refusé sans essai, clavier physique, copie), pas
// de grille, 360 et 390 px sans défilement horizontal, captures 1280 et 390 px, aucune erreur JS.
// Faux Supabase : fixtures/fake-sb-grilles.mjs (Connexions : Fruits, Instruments, Félins, Météo ; Mot mêlé : 6 mots ; Nerdle : 12+35=47).
const { check, finish, openPage, hscroll, log, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');

/** Erreurs de la page qui concernent ce parcours (les autres onglets ne sont pas ouverts). */
const mesErreurs = (p) => p.errs.filter((e) => !/nj-(motscroises|anagramme|demineur|sudoku|2048|carte|jv|pochette|replique|pays|plat)\.js/.test(e));
/** Presse-papiers simulé : le texte copié va dans window.__CLIP. */
const CLIP_FAUX = () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__CLIP = t; } }, configurable: true }); };
/** Texte du message de la grille (zone aria-live). */
const live = (p) => p.locator('.ng-live').textContent();
/** Appels faits au serveur pour les essais d'un jeu (p). */
const essais = async (p, fn = 'hg_nj_grille_essai') => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn);
/** Ouvre un onglet de grille du jour, attend le titre. */
const ouvre = (browser, hash, extra = {}) => openPage(browser, { page: 'jeux', fixture: 'fake-sb-grilles.mjs', hash, width: 390, height: 900, ...extra })
  .then(async (p) => { await p.waitForSelector('.ng-title', { timeout: 6000 }).catch(() => {}); await sleep(200); return p; });
/** Centre d'une case de la grille Mot mêlé, en pixels de la page. */
const centre = async (p, r, c) => { const b = await p.locator(`.ng-cell[data-r="${r}"][data-c="${c}"]`).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
/** Glisse de la case a à la case b (souris), en passant par des étapes. */
const glisse = async (p, a, b) => { const A = await centre(p, a[0], a[1]), B = await centre(p, b[0], b[1]); await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(B.x, B.y, { steps: 10 }); await p.mouse.up(); await sleep(250); };
/** Touche une case (deux appuis : départ puis arrivée). */
const touche = async (p, r, c) => { const A = await centre(p, r, c); await p.mouse.click(A.x, A.y); await sleep(200); };
/** Clique une tuile Connexions par son mot. */
const tuile = async (p, m) => { await p.click(`[data-mot="${m}"]`); await sleep(60); };
/** Valide la sélection Connexions puis attend la fin de l'envoi. */
const valide = async (p) => { await p.click('[data-act="valider"]'); await sleep(1500); };

(async () => {
  const browser = await chromium.launch();

  /* ---------- Connexions (390 px) : gagnée ---------- */
  let p = await ouvre(browser, '#connexions');
  check((await p.locator('.ng-title').textContent()) === 'Connexions', 'connexions : titre « Connexions »');
  check((await p.locator('.ng-kicker').textContent()) === 'GRILLE DU JOUR · N°16', 'connexions : en-tête « GRILLE DU JOUR · N°16 »');
  check((await p.locator('[data-mot]').count()) === 16, 'connexions : seize tuiles');
  check(await p.locator('[data-act="valider"]').isDisabled(), 'connexions : « Valider » désactivé avant quatre mots');
  check((await p.locator('.ng-pills').textContent()).includes('Jusqu’à 10 ✦'), 'connexions : Paillettes « Jusqu’à 10 ✦ » avant la fin');
  check((await p.locator('.ng-pills [data-chrono]').count()) === 0, 'connexions : pas de chrono avant le premier essai');
  check((await p.locator('.adrep-btn').count()) === 1, 'connexions : bouton « Réponses » (administrateur) dans l’en-tête');
  check((await p.locator('.ng-err').textContent()).includes('Erreurs restantes'), 'connexions : « Erreurs restantes » affichées');
  check((await p.locator('.ng-dot.is-on').count()) === 4, 'connexions : quatre erreurs restantes au départ');
  check((await p.locator('.ng-regles').textContent()).includes('Seize mots'), 'connexions : « Règles en bref » à droite');
  check((await p.locator('.ng-board .jd-board-row').count()) >= 2, 'connexions : classement de la semaine affiché');

  // À un mot près : trois fruits et un félin.
  for (const m of ['POMME', 'POIRE', 'PRUNE', 'LYNX']) await tuile(p, m);
  check((await p.locator('.ng-tile.is-sel').count()) === 4 && !(await p.locator('[data-act="valider"]').isDisabled()), 'connexions : quatre mots sélectionnés, « Valider » actif');
  await tuile(p, 'PIANO');
  check((await p.locator('.ng-tile.is-sel').count()) === 4 && (await live(p)).includes('Quatre mots au plus'), 'connexions : un cinquième mot refusé (« Quatre mots au plus »)');
  await p.click('[data-act="valider"]');
  await sleep(200);
  check((await p.locator('.ng-tiles.fxj-secoue').count()) === 1, 'connexions effets : « à un mot près », les tuiles sont secouées pendant l’animation');
  await sleep(1300);
  check((await live(p)).includes('À un mot près'), 'connexions : « À un mot près ! » après trois mots sur quatre');
  check((await p.locator('.ng-dot.is-on').count()) === 3, 'connexions : une erreur de plus (trois restantes)');
  check((await p.locator('.ng-tile.is-sel').count()) === 0, 'connexions : la sélection repart à zéro après l’essai');
  check((await p.locator('.ng-chrono, [data-chrono]').count()) === 1, 'connexions : chrono affiché dès le premier essai');

  // Désélectionner
  await tuile(p, 'POMME');
  await p.click('[data-act="vider"]');
  check((await p.locator('.ng-tile.is-sel').count()) === 0, 'connexions : « Désélectionner » vide la sélection');
  await p.screenshot({ path: SHOTS + '/nj-grilles-connexions-390-mi.png', fullPage: true });

  // Mélanger : les tuiles restent les mêmes
  const avant = (await p.locator('[data-mot]').allTextContents()).sort().join();
  await p.click('[data-act="melanger"]');
  await sleep(120);
  check((await p.locator('[data-mot]').allTextContents()).sort().join() === avant && (await p.locator('[data-mot]').count()) === 16, 'connexions : « Mélanger » réordonne sans changer les mots');

  // Fruits, Instruments, Félins, Météo
  let premier = true;
  for (const groupe of [['POMME', 'POIRE', 'PRUNE', 'FIGUE'], ['PIANO', 'VIOLON', 'FLÛTE', 'HARPE'], ['LYNX', 'PUMA', 'OCELOT', 'SERVAL'], ['ORAGE', 'GRÊLE', 'BRUME', 'ÉCLAIR']]) {
    for (const m of groupe) await tuile(p, m);
    if (premier) {
      premier = false;
      await p.click('[data-act="valider"]');
      await sleep(250);
      check((await p.locator('.ng-tile.fxj-saut').count()) >= 2, 'connexions effets : groupe juste, les tuiles choisies sautent');
      await sleep(1250);
      check((await p.locator('.ng-band.fxj-pop').count()) === 1, 'connexions effets : le bandeau du groupe apparaît en pop');
    } else await valide(p);
  }
  await sleep(2000);
  check((await p.locator('.ng-fin.is-win').count()) === 1, 'connexions : fin, grille trouvée');
  check((await p.locator('.ng-fin .fxj-tampon').textContent()) === '4 PTS' && (await p.locator('.ng-fin.fxj-entree').count()) === 1, 'connexions effets : tampon « 4 PTS » et carte de fin animée après la dernière partie jouée');
  check((await p.locator('.ng-fin').textContent()).includes('Score 4 pts') && (await p.locator('.ng-fin').textContent()).includes('+10 ✦ crédités'), 'connexions : score 4 pts et « +10 ✦ crédités »');
  check((await p.locator('.ng-band').count()) === 4 && (await p.locator('.ng-band.is-trouve').count()) === 4, 'connexions : les quatre groupes montrés en fin');
  check((await p.locator('[data-mot]').count()) === 0, 'connexions : plus de tuiles en fin de partie');
  check((await p.locator('.ng-fin').textContent()).includes('Classement du jour'), 'connexions : classement du jour en fin de partie');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]');
  await sleep(200);
  check((await p.evaluate(() => window.__CLIP)) === 'Connexions #16 trouvé, 1 erreur\n⬜⬜⬜⬜ ✗\n🟨🟨🟨🟨 1\n🟩🟩🟩🟩 2\n🟦🟦🟦🟦 3\n🟪🟪🟪🟪 4', 'copier : carrés colorés et numéro du niveau, une ligne par essai');
  check((await p.locator('[data-chrono]').textContent()).match(/^\d+:\d\d$/) !== null, 'connexions : temps final affiché');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-grilles-connexions-390.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'connexions 390 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  const envoyes = await essais(p);
  check(envoyes.length === 5, 'serveur : cinq essais envoyés (le cinquième mot refusé côté client n’est pas envoyé)');
  check(JSON.stringify([...envoyes[0][2].p.mots].sort()) === JSON.stringify(['LYNX', 'POIRE', 'POMME', 'PRUNE']), 'serveur : premier essai = trois fruits et un félin');
  await p.ctx.close();

  /* ---------- Connexions (1280 px) : perdue en 4 erreurs ---------- */
  p = await ouvre(browser, '#connexions', { width: 1280, height: 900 });
  const perdants = [['POMME', 'POIRE', 'PIANO', 'VIOLON'], ['PRUNE', 'FIGUE', 'FLÛTE', 'HARPE'], ['LYNX', 'PUMA', 'ORAGE', 'GRÊLE'], ['OCELOT', 'SERVAL', 'BRUME', 'ÉCLAIR']];
  for (const groupe of perdants) { for (const m of groupe) await tuile(p, m); await valide(p); }
  check((await live(p)).includes('Pas un groupe'), '1280 px : « Pas un groupe cette fois. » pour deux mots de chaque groupe');
  await sleep(1500);
  check((await p.locator('.ng-fin:not(.is-win)').count()) === 1 && (await p.locator('.ng-fin').textContent()).includes('Grille perdue'), '1280 px : grille perdue après quatre erreurs');
  check((await p.locator('.ng-fin .fxj-tampon').textContent()) === '0 PT', '1280 px effets : tampon « 0 PT » après une défaite');
  check((await p.locator('.ng-band.is-rate').count()) === 4, '1280 px : les quatre groupes montrés, aucun trouvé');
  check((await p.locator('.ng-fin').textContent()).includes('Aucune Paillette'), '1280 px : aucune Paillette après une défaite');
  check((await p.evaluate(() => { const m = document.querySelector('.ng'); return m && getComputedStyle(m).gridTemplateColumns.split(' ').length; })) === 2, '1280 px : deux colonnes (jeu à gauche, règles à droite)');
  await p.screenshot({ path: SHOTS + '/nj-grilles-connexions-1280.png', fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'connexions 1280 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Mot mêlé (390 px) : glisser, deux appuis, clavier, ligne invalide ---------- */
  p = await ouvre(browser, '#mot-mele');
  check((await p.locator('.ng-title').textContent()) === 'Mot mêlé', 'mot mêlé : titre « Mot mêlé »');
  check((await p.locator('.ng-cell').count()) === 144, 'mot mêlé : grille 12 × 12 (144 cases)');
  check((await p.locator('.ng-theme').textContent()).includes('Ustensiles de cuisine'), 'mot mêlé : thème affiché');
  check((await p.locator('.ng-liste .ng-label').textContent()).includes('0/6'), 'mot mêlé : « Mots à trouver · 0/6 »');
  check((await p.locator('.ng-regles').textContent()).includes('Trouve tous les mots'), 'mot mêlé : règles affichées');
  // Glisser en cours : aperçu de la ligne
  const A = await centre(p, 0, 0), B = await centre(p, 0, 4);
  await p.mouse.move(A.x, A.y); await p.mouse.down(); await p.mouse.move(B.x, B.y, { steps: 6 }); await sleep(120);
  check((await p.locator('.ng-cell.is-apercu').count()) === 5, 'glisser : aperçu de cinq cases pendant le glissement');
  await p.mouse.up(); await sleep(150);
  check((await p.locator('.ng-cell.is-apercu').count()) === 0 && (await live(p)).includes('Pas un mot'), 'glisser : tronçon non mot relâché, pas de mot trouvé');
  check((await p.locator('.ng-grille.fxj-secoue').count()) === 1, 'mot mêlé effets : un tronçon qui n’est pas un mot secoue la grille');
  await glisse(p, [0, 0], [0, 8]);
  check((await live(p)).includes('Mot trouvé : CASSEROLE'), 'glisser : CASSEROLE trouvé (horizontal)');
  const enCours = await p.locator('.ng-cell.is-trouve').count();
  check(enCours < 9 && (await p.locator('.ng-cell.fxj-saut').count()) > 0, 'mot mêlé effets : les cases du mot trouvé s’allument une à une (' + enCours + ' sur 9 juste après)');
  await sleep(900);
  check((await p.locator('.ng-mots li.is-trouve').count()) === 1 && (await p.locator('.ng-cell.is-trouve').count()) === 9, 'glisser : mot barré dans la liste, neuf cases surlignées');
  check((await p.locator('.ng-liste .ng-label').textContent()).includes('1/6'), 'glisser : compteur à 1/6');
  await p.screenshot({ path: SHOTS + '/nj-grilles-motmele-390-mi.png', fullPage: true });
  // Deux appuis : FOURCHETTE (diagonale, départ puis arrivée)
  await touche(p, 9, 1);
  check((await p.locator('.ng-cell.is-depart').count()) === 1, 'deux appuis : case de départ marquée');
  await touche(p, 0, 10);
  check((await live(p)).includes('Mot trouvé : FOURCHETTE'), 'deux appuis : FOURCHETTE trouvé (diagonale)');
  // Ligne invalide
  await glisse(p, [5, 5], [6, 7]);
  check((await live(p)).includes('hors ligne droite'), 'ligne invalide : refusée sans envoi');
  // Clavier : ECUMOIRE, verticale, de (2,0) vers (9,0)
  await p.focus('.ng-cell[data-r="2"][data-c="0"]');
  await p.keyboard.press('Enter');
  for (let i = 0; i < 7; i++) await p.keyboard.press('ArrowDown');
  await p.keyboard.press('Enter');
  await sleep(300);
  check((await live(p)).includes('Mot trouvé : ECUMOIRE'), 'clavier : ECUMOIRE trouvé (flèches puis Entrée)');
  await glisse(p, [2, 11], [7, 11]);
  check((await live(p)).includes('Mot trouvé : LOUCHE'), 'glisser : LOUCHE trouvé (verticale)');
  await glisse(p, [10, 3], [10, 9]);
  check((await live(p)).includes('Mot trouvé : SPATULE'), 'glisser : SPATULE trouvé (horizontale)');
  await glisse(p, [11, 0], [5, 6]);
  check((await p.locator('.ng-fin').count()) === 1 && (await p.locator('.ng-fin').textContent()).includes('Tous les mots sont trouvés'), 'fin : tous les mots trouvés, fin de partie');
  await sleep(1800); // le gain défile après l'entrée de la carte de fin
  await p.waitForFunction(() => document.querySelector('.ng-fin')?.textContent.includes('+10 ✦ crédités'), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.ng-fin').textContent()).includes('+10 ✦ crédités'), 'fin : « +10 ✦ crédités »');
  check((await p.locator('.ng-cell[role="gridcell"]').count()) === 144 && (await p.locator('.ng-cell.is-trouve').count()) >= 40, 'fin : mots surlignés dans la grille');
  check((await p.locator('.ng-fin').textContent()).includes('Classement du jour'), 'fin : classement du jour affiché');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]');
  await sleep(200);
  check(/^Mot mêlé #16 : 6\/6 mots en \d+:\d\d$/.test(await p.evaluate(() => window.__CLIP)), 'copier : « Mot mêlé #16 : 6/6 mots en m:ss »');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-grilles-motmele-390.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'mot mêlé 390 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Mot mêlé (1280 px) : mi-partie, deux colonnes ---------- */
  p = await ouvre(browser, '#mot-mele', { width: 1280, height: 900 });
  await glisse(p, [0, 0], [0, 8]);
  check((await p.locator('.ng-main').boundingBox()).x < (await p.locator('.ng-aside').boundingBox()).x, '1280 px (mot mêlé) : jeu à gauche, règles à droite');
  await p.screenshot({ path: SHOTS + '/nj-grilles-motmele-1280.png', fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px (mot mêlé) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'mot mêlé 1280 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Nerdle (390 px) : essai, calcul faux refusé, clavier physique, copie ---------- */
  p = await ouvre(browser, '#nerdle');
  check((await p.locator('.ng-title').textContent()) === 'Nerdle du gang', 'nerdle : titre « Nerdle du gang »');
  check((await p.locator('.ng-essais .ng-ligne').count()) === 6, 'nerdle : six lignes d’essai');
  check((await p.locator('.ng-key').count()) === 17, 'nerdle : clavier à l’écran de 17 touches');
  check((await p.locator('.ng-pills').textContent()).includes('Essai 1 / 6'), 'nerdle : « Essai 1 / 6 »');
  // Indice à la demande : la 1re case (1) se montre en pâle dans la ligne en cours, 1/3, « Points max » baisse de 1
  await p.click('[data-act="indice"]');
  await sleep(350);
  check((await p.locator('.ng-ligne.is-saisie .ng-c.is-indice').count()) === 1 && (await p.locator('.ng-ligne.is-saisie .ng-c.is-indice').textContent()) === '1', 'nerdle indice : case 1 révélée en pâle dans la ligne en cours');
  check((await p.locator('[data-act="indice"]').textContent()).includes('1/3') && (await p.locator('.ng-indices').textContent()).includes('case 1'), 'nerdle indice : bouton « 1/3 » et liste des indices');
  check((await p.locator('.ng-pills').textContent()).includes('Essai 1 / 6') && (await p.locator('.ng-pills').textContent()).replace(/\s+/g, ' ').match(/Points max\s*9/), 'nerdle indice : pas d’essai compté, points max 9');
  for (const t of ['1', '0', '+', '3', '7', '=', '4', '7']) await p.click(`.ng-key[data-touche="${t}"]`);
  check((await p.locator('.ng-ligne.is-saisie .ng-c').allTextContents()).join('') === '10+37=47', 'nerdle : saisie affichée dans la ligne en cours');
  await p.click('[data-act="entrer"]');
  await sleep(650);
  const l0 = p.locator('.ng-essais .ng-ligne').first();
  check((await l0.locator('.ng-c.is-v, .ng-c.is-g').count()) > 0 && (await l0.locator('.ng-c.is-v, .ng-c.is-g').count()) < 8 && (await l0.locator('.fxj-flip').count()) > 0, 'nerdle effets : les cases se retournent une à une (pas toutes colorées d’un coup)');
  await sleep(2400);
  const l1 = p.locator('.ng-essais .ng-ligne').first();
  check((await l1.locator('.ng-c.is-v').count()) === 6 && (await l1.locator('.ng-c.is-g').count()) === 2, 'nerdle : couleurs de 10+37=47 (six bonnes places, deux absents)');
  check((await p.locator('.ng-key.is-v').count()) >= 5 && (await p.locator('.ng-key.is-g').count()) >= 1, 'nerdle : touches du clavier colorées');
  check((await p.locator('.ng-pills').textContent()).includes('Essai 2 / 6'), 'nerdle : « Essai 2 / 6 » après un essai');
  check((await p.locator('[data-chrono]').count()) === 1, 'nerdle : chrono affiché');
  // Calcul faux : refusé par le serveur, pas d’essai compté, la saisie reste
  for (const t of ['1', '2', '+', '3', '5', '=', '4', '8']) await p.click(`.ng-key[data-touche="${t}"]`);
  await p.click('[data-act="entrer"]');
  await sleep(350);
  check((await p.locator('.ng-ligne.is-saisie.fxj-secoue').count()) === 1, 'nerdle effets : calcul refusé, la ligne en cours est secouée');
  check((await p.locator('.ng-essais .ng-ligne').count()) === 6 && (await p.locator('.ng-ligne.is-saisie .ng-c').allTextContents()).join('') === '12+35=48', 'nerdle : calcul faux refusé, pas d’essai compté, saisie conservée');
  check((await p.locator('body').textContent()).includes('Ce n\'est pas un calcul juste'), 'nerdle : message « Ce n’est pas un calcul juste » affiché');
  // Clavier physique : Retour arrière pour effacer le 8, puis Entrée
  await p.keyboard.press('Backspace');
  await p.keyboard.press('7');
  await sleep(120);
  check((await p.locator('.ng-ligne.is-saisie .ng-c').allTextContents()).join('') === '12+35=47', 'clavier physique : Retour arrière puis 7 corrige la saisie');
  await p.keyboard.press('Enter');
  await sleep(700);
  check(!(await p.locator('.ng-fin').isVisible()), 'nerdle effets : la carte de fin attend la fin du retournement des cases');
  await sleep(3800);
  check((await p.locator('.ng-fin.is-win').count()) === 1 && (await p.locator('.ng-fin').textContent()).includes('Calcul trouvé'), 'nerdle : calcul trouvé en deux essais');
  check((await p.locator('.ng-fin .fxj-tampon').textContent()) === '4 PTS' && (await p.locator('.ng-fin.fxj-entree').count()) === 1, 'nerdle effets : tampon « 4 PTS » à la fin de la partie jouée');
  check((await p.locator('.ng-calcul').textContent()).includes('12+35=47'), 'fin : calcul révélé');
  await sleep(1800); // le gain défile après l'entrée de la carte de fin
  await p.waitForFunction(() => document.querySelector('.ng-fin')?.textContent.includes('+10 ✦ crédités'), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.ng-fin').textContent()).includes('+10 ✦ crédités'), 'fin : « +10 ✦ crédités »');
  check((await p.locator('.ng-clavier').count()) === 0, 'fin : clavier retiré');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]');
  await sleep(200);
  check((await p.evaluate(() => window.__CLIP)) === 'Nerdle #16 2/6 · 1 indice\n🟩⬛🟩🟩⬛🟩🟩🟩\n🟩🟩🟩🟩🟩🟩🟩🟩', 'copier : carrés verts, ambres et noirs, une ligne par essai');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-grilles-nerdle-390.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'nerdle 390 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Nerdle (1280 px) : mi-partie ---------- */
  p = await ouvre(browser, '#nerdle', { width: 1280, height: 900 });
  for (const t of ['1', '0', '+', '3', '7', '=', '4', '7']) await p.click(`.ng-key[data-touche="${t}"]`);
  await p.click('[data-act="entrer"]');
  await sleep(350);
  check((await p.locator('.ng-main').boundingBox()).x < (await p.locator('.ng-aside').boundingBox()).x, '1280 px (nerdle) : jeu à gauche, règles à droite');
  await p.screenshot({ path: SHOTS + '/nj-grilles-nerdle-1280.png', fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px (nerdle) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'nerdle 1280 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Nerdle déjà fini à l'ouverture : aucun effet joué ---------- */
  p = await ouvre(browser, '#nerdle', { scenario: { nerdleFini: true } });
  await sleep(300);
  check((await p.locator('.ng-fin').isVisible()) && (await p.locator('.ng-fin').textContent()).includes('+10 ✦ crédités'), 'nerdle fini à l’ouverture : carte de fin et gain affichés tout de suite');
  check((await p.locator('.ng-fin .fxj-tampon').textContent()) === '10 PTS' && (await p.locator('.ng-fin.fxj-entree').count()) === 0 && (await p.locator('.fxj-confettis').count()) === 0, 'nerdle fini à l’ouverture : tampon posé mais ni animation d’entrée ni confettis');
  await p.ctx.close();

  /* ---------- Pas de grille aujourd'hui, 360 px ---------- */
  p = await ouvre(browser, '#connexions', { width: 360, height: 800, scenario: { noGrille: true } });
  check((await p.locator('.ng-vide').textContent()).includes('Pas de grille aujourd’hui'), 'sans grille : message « Pas de grille aujourd’hui »');
  check((await hscroll(p)) <= 0, '360 px (sans grille) : pas de défilement horizontal');
  await p.ctx.close();

  p = await ouvre(browser, '#mot-mele', { width: 360, height: 800 });
  check((await hscroll(p)) <= 0, '360 px (mot mêlé) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'mot mêlé 360 px : aucune erreur JS');
  await p.ctx.close();

  p = await ouvre(browser, '#nerdle', { width: 360, height: 800 });
  check((await hscroll(p)) <= 0, '360 px (nerdle) : pas de défilement horizontal');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exitCode = 1; });
