// Parcours des grilles du jour, deuxième lot : Anagramme (mots trouvés, mauvais mot sans le dévoiler, Mélanger, tuiles,
// Passer, fin et copie) et Mots croisés (grille 9 × 9, clavier : lettres, Retour arrière, Tab, Maj+Tab, flèches ; envoi
// automatique de la grille pleine avec cases fausses en rouge, puis grille juste ; « Vérifier » en 1280 px ; saisie gardée
// après rechargement). Faux Supabase : fixtures/fake-sb-grilles.mjs (Anagramme : MAISON, CHOCOLAT, PARAPLUIE, TABLE, LUNETTES ;
// Mots croisés : 9 × 9, lettres de test). Captures 390 et 1280 px dans tests/shots/, 360 px sans défilement horizontal.
const fs = require('fs');
const { check, finish, openPage, hscroll, log, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');

/** Erreurs de la page (toutes : seule la page testée est ouverte). */
const mesErreurs = (p) => p.errs;
/** Presse-papiers simulé : le texte copié va dans window.__CLIP. */
const CLIP_FAUX = () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__CLIP = t; } }, configurable: true }); };
/** Texte de la zone « live » de la grille. */
const live = (p) => p.locator('.ng-live').textContent();
/** Appels faits au serveur pour un type d'essai. */
const essais = async (p, fn = 'hg_nj_grille_essai') => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn);
/** Ouvre un onglet de grille du jour, attend le titre. */
const ouvre = (browser, hash, extra = {}) => openPage(browser, { page: 'jeux', fixture: 'fake-sb-grilles.mjs', hash, width: 390, height: 900, ...extra })
  .then(async (p) => { await p.waitForSelector('.ng-title', { timeout: 6000 }).catch(() => {}); await sleep(200); return p; });
const pause = () => sleep(40);

/* Solution de test des mots croisés : même formule que le faux (MC_SOL). */
const LET = 'ABCDEFGHIJKLMNOPRSTUVWXY';
const solution = (r, c) => LET[(r * 7 + c * 3) % 24];
/** Cases blanches du motif 9 × 9 : lignes paires pleines, lignes impaires « #.#.#.#.# ». */
const blanche = (r, c) => r % 2 === 0 || c % 2 === 0;
const cellulesBlanches = () => { const out = []; for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (blanche(r, c)) out.push([r, c]); return out; };

/** Tape une lettre dans une case des mots croisés (clic sur la case, puis touche). */
const tape = async (p, r, c, ch) => {
  await p.click(`.mc-case[data-r="${r}"][data-c="${c}"]`);
  await p.keyboard.press(ch);
  await pause();
};
/** Lettres d'un mot d'anagramme, tapées au clavier, puis validation par le bouton du mot. */
const mot = async (p, i, lettres) => { await p.keyboard.type(lettres); await sleep(60); await p.click(`.ang-mot[data-i="${i}"] [data-act="valider"]`); await sleep(260); };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  /* ---------- Anagramme (390 px) : mauvais mot, Mélanger, tuiles, Passer, fin, copie ---------- */
  let p = await ouvre(browser, '#anagramme');
  check((await p.locator('.ng-title').textContent()) === 'Anagramme', 'anagramme : titre « Anagramme »');
  check((await p.locator('.ang-mot').count()) === 5, 'anagramme : cinq mots');
  check((await p.locator('.ng-pills').textContent()).includes('Trouvés 0 / 5'), 'anagramme : « Trouvés 0 / 5 »');
  check((await p.locator('.adrep-btn').count()) === 1, 'anagramme : bouton « Réponses » (administrateur)');
  check((await p.locator('.ang-mot.is-actif').getAttribute('data-i')) === '0', 'anagramme : premier mot actif au départ');
  check((await p.locator('.ang-mot[data-i="0"] .ang-def').textContent()).includes('Lieu où l’on vit'), 'anagramme : définition du premier mot');
  check((await p.locator('.ang-mot[data-i="0"] .ang-tuile').count()) === 6, 'anagramme : six tuiles pour MAISON');
  check((await p.locator('.ng-regles').textContent()).includes('Cinq mots'), 'anagramme : règles affichées');

  // Mauvais ordre : NOMAIS
  await p.keyboard.type('NOMAIS'); await sleep(80);
  check((await p.locator('.ang-mot[data-i="0"] .ang-case.is-pleine').count()) === 6, 'clavier : six lettres posées dans la réponse');
  check((await p.locator('.ang-mot[data-i="0"] [data-act="valider"]').isDisabled()) === false, '« Valider » actif quand le mot est complet');
  await p.click('.ang-mot[data-i="0"] [data-act="valider"]'); await sleep(300);
  check((await live(p)).includes('Ce n’est pas le bon mot'), 'mauvais mot : message « Ce n’est pas le bon mot »');
  check((await p.locator('.ang-mot[data-i="0"]').getAttribute('class')).includes('is-secoue'), 'mauvais mot : la ligne tremble');
  check((await p.locator('.ang-mot[data-i="0"] .ang-mot-revele').count()) === 0 && !(await p.locator('body').textContent()).includes('MAISON'), 'mauvais mot : le mot n’est pas dévoilé');
  check((await p.locator('.ang-mot[data-i="0"] .ang-case.is-pleine').count()) === 6, 'mauvais mot : la saisie reste en place');
  await p.keyboard.press('Escape'); await sleep(80);
  check((await p.locator('.ang-mot[data-i="0"] .ang-case.is-pleine').count()) === 0, 'Échap : la réponse est vidée');
  // Retour arrière : pose M, A, I, puis efface la dernière
  await p.keyboard.type('MAI'); await p.keyboard.press('Backspace'); await sleep(80);
  check((await p.locator('.ang-mot[data-i="0"] .ang-case.is-pleine').count()) === 2, 'Retour arrière : la dernière lettre est retirée');
  await p.keyboard.press('Escape'); await sleep(80);
  await mot(p, 0, 'MAISON');
  check((await live(p)).includes('Bravo'), 'MAISON : « Bravo » après le bon mot');
  check((await p.locator('.ang-mot[data-i="0"]').getAttribute('class')).includes('is-trouve'), 'MAISON : carte marquée trouvée');
  check((await p.locator('.ang-mot[data-i="0"] .ang-mot-revele').textContent()) === 'MAISON', 'MAISON : le mot s’affiche une fois trouvé');
  check((await p.locator('.ang-mot.is-actif').getAttribute('data-i')) === '1', 'après MAISON : le mot suivant devient actif');
  check((await p.locator('.ng-pills').textContent()).includes('Trouvés 1 / 5'), 'après MAISON : « Trouvés 1 / 5 »');
  await sleep(700);
  check((await p.locator('.ang-mot[data-i="0"].fxj-bon').count()) === 1 && (await p.locator('.ang-mot[data-i="0"] .ang-mot-revele span').count()) === 0, 'anagramme effets : le mot trouvé s’est allumé lettre après lettre, texte final remis');

  // Mélanger et tuiles (CHOCOLAT)
  const avant = (await p.locator('.ang-mot[data-i="1"] .ang-tuile').allTextContents()).sort().join('');
  await p.click('.ang-mot[data-i="1"] [data-act="melanger"]'); await sleep(80);
  const apres = (await p.locator('.ang-mot[data-i="1"] .ang-tuile').allTextContents());
  check(apres.length === 8 && apres.slice().sort().join('') === avant, '« Mélanger » réordonne les huit tuiles sans en changer');
  await p.click('.ang-mot[data-i="1"] .ang-tuile:not(.is-posee)'); await sleep(80);
  check((await p.locator('.ang-mot[data-i="1"] .ang-case.is-pleine').count()) === 1, 'clic sur une tuile : la lettre est posée');
  check((await p.locator('.ang-mot[data-i="1"] .ang-tuile.is-posee').count()) === 1, 'la tuile posée est marquée');
  await p.click('.ang-mot[data-i="1"] .ang-tuile.is-posee', { force: true, timeout: 4000 }).catch(() => {}); await sleep(60);
  check((await p.locator('.ang-mot[data-i="1"] .ang-case.is-pleine').count()) === 1, 'tuile déjà posée : un clic ne fait rien');
  await p.click('.ang-mot[data-i="1"] [data-act="retirer"][data-k="0"]'); await sleep(80);
  check((await p.locator('.ang-mot[data-i="1"] .ang-case.is-pleine').count()) === 0 && (await p.locator('.ang-mot[data-i="1"] .ang-tuile.is-posee').count()) === 0, 'clic sur une lettre posée : elle est retirée');

  // Passer : CHOCOLAT révélé, sans point
  await p.click('.ang-mot[data-i="1"] [data-act="passer"]'); await sleep(260);
  check((await live(p)).includes('Mot passé : CHOCOLAT'), '« Passer » : « Mot passé : CHOCOLAT »');
  check((await p.locator('.ang-mot[data-i="1"]').getAttribute('class')).includes('is-passe'), 'CHOCOLAT : carte marquée passée');
  check((await p.locator('.ang-mot[data-i="1"] .ang-mot-revele').textContent()) === 'CHOCOLAT', 'CHOCOLAT : le mot révélé s’affiche');
  check((await p.locator('.ang-mot.is-actif').getAttribute('data-i')) === '2', 'après Passer : PARAPLUIE devient actif');
  await p.screenshot({ path: SHOTS + '/nj-grilles2-anagramme-390-mi.png', fullPage: true });

  // Le reste : PARAPLUIE, TABLE, LUNETTES
  await mot(p, 2, 'PARAPLUIE');
  check((await live(p)).includes('PARAPLUIE'), 'PARAPLUIE : trouvé');
  await mot(p, 3, 'TABLE');
  await mot(p, 4, 'LUNETTES');
  check((await p.locator('.ng-fin').count()) === 1 && (await p.locator('.ng-fin:not(.is-win)').count()) === 1, 'fin : partie terminée (un mot passé : pas de victoire complète)');
  check((await p.locator('.ng-fin').textContent()).includes('4 mots sur 5 trouvés'), 'fin : « 4 mots sur 5 trouvés »');
  await sleep(1800); // le gain défile après l'entrée de la carte de fin
  await p.waitForFunction(() => document.querySelector('.ng-fin')?.textContent.includes('+10 ✦ crédités'), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.ng-fin').textContent()).includes('Score 4 pts') && (await p.locator('.ng-fin').textContent()).includes('+10 ✦ crédités'), 'fin : « Score 4 pts » et « +10 ✦ crédités »');
  check((await p.locator('.ang-mot-revele').count()) === 5 && (await p.locator('body').textContent()).includes('CHOCOLAT'), 'fin : les cinq mots sont montrés');
  check((await p.locator('.ang-tuile').count()) === 0 && (await p.locator('.ng-clavier').count()) === 0, 'fin : plus de tuiles');
  check((await p.locator('.ng-fin').textContent()).includes('Classement du jour'), 'fin : classement du jour affiché');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]'); await sleep(200);
  check(/^Anagramme #16 4\/5 en \d+:\d\d\n🟩⬛🟩🟩🟩$/.test(await p.evaluate(() => window.__CLIP)), 'copier : « Anagramme #16 4/5 » et une ligne de carrés');
  const envoyes = await essais(p);
  check(envoyes.length === 6, 'serveur : six essais envoyés (un faux, un passé, quatre trouvés)');
  check(envoyes.every((e) => e[2].p_jeu === 'anagramme' && e[2].p.i !== undefined), 'serveur : chaque essai porte le jeu et l’indice du mot (p.i)');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-grilles2-anagramme-390.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'anagramme 390 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Anagramme (1280 px) : deux colonnes, mot en cours ---------- */
  p = await ouvre(browser, '#anagramme', { width: 1280, height: 900 });
  await p.keyboard.type('MAISON'); await sleep(60);
  await p.click('.ang-mot[data-i="0"] [data-act="valider"]'); await sleep(260);
  check((await p.locator('.ng-main').boundingBox()).x < (await p.locator('.ng-aside').boundingBox()).x, '1280 px (anagramme) : jeu à gauche, règles à droite');
  check((await hscroll(p)) <= 0, '1280 px (anagramme) : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-grilles2-anagramme-1280.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'anagramme 1280 px : aucune erreur JS');
  await p.ctx.close();

  p = await ouvre(browser, '#anagramme', { width: 360, height: 800 });
  check((await hscroll(p)) <= 0, '360 px (anagramme) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'anagramme 360 px : aucune erreur JS');
  await p.ctx.close();

  /* ---------- Mots croisés (390 px) : grille 9 × 9, clavier, envoi automatique, grille juste ---------- */
  p = await ouvre(browser, '#mots-croises');
  check((await p.locator('.ng-title').textContent()) === 'Mots croisés', 'mots croisés : titre « Mots croisés »');
  check((await p.locator('.mc-case:not(.is-noire)').count()) === 65 && (await p.locator('.mc-case.is-noire').count()) === 16, 'mots croisés : 65 cases à remplir et 16 cases noires');
  check((await p.locator('.mc-def').count()) === 10, 'mots croisés : dix définitions (cinq horizontales, cinq verticales)');
  check((await p.locator('.mc-grille').getAttribute('style')).includes('--w:9'), 'mots croisés : grille de neuf colonnes');
  check((await p.locator('.ng-pills').textContent()).includes('Grille 9 × 9'), 'mots croisés : « Grille 9 × 9 »');
  check((await p.locator('.adrep-btn').count()) === 1, 'mots croisés : bouton « Réponses » (administrateur)');
  const largeurCase = (await p.locator('.mc-case:not(.is-noire)').first().boundingBox()).width;
  check(largeurCase >= 30, `390 px : cases d’au moins 30 px (mesure ${Math.round(largeurCase)} px)`);
  check((await p.locator('.mc-rappel').textContent()).includes('Horizontalement : Définition de test 1'), 'rappel : première définition active au départ');
  check((await p.locator('.mc-progres').textContent()).includes('Cases remplies : 0 / 65'), 'compteur : « Cases remplies : 0 / 65 »');
  check((await p.locator('[data-act="verifier"]').count()) === 1, 'bouton « Vérifier » présent');
  check((await p.locator('.mc-saisie').getAttribute('aria-label')).includes('Horizontalement 1'), 'saisie : étiquette d’accessibilité avec le mot actif');

  // Définition touchée : ligne 1 (de la première case), puis neuf lettres au clavier
  await p.click('.mc-def[data-m="0"]'); await sleep(80);
  check((await p.locator('.mc-def.is-actif').getAttribute('data-m')) === '0', 'définition touchée : le mot devient actif');
  for (let c = 0; c < 9; c++) await p.keyboard.press(solution(0, c));
  await sleep(80);
  check((await p.locator('.mc-progres').textContent()).includes('Cases remplies : 9 / 65'), 'clavier : neuf lettres saisies (première ligne)');
  check((await p.locator('.mc-lettre').first().textContent()) === solution(0, 0), 'clavier : première case remplie');
  await p.keyboard.press('Backspace'); await sleep(60);
  check((await p.locator('.mc-progres').textContent()).includes('Cases remplies : 8 / 65'), 'Retour arrière : la dernière case est vidée');
  await p.keyboard.press(solution(0, 8)); await sleep(60);
  // Tab : mot suivant (ligne 3, définition n° 6) ; Maj+Tab : retour à la ligne 1
  await p.keyboard.press('Tab'); await sleep(60);
  check((await p.locator('.mc-rappel').textContent()).includes('Définition de test 6'), 'Tab : mot suivant (définition n° 6)');
  await p.keyboard.press('Shift+Tab'); await sleep(60);
  check((await p.locator('.mc-case.is-pos').getAttribute('data-r')) === '0' && (await p.locator('.mc-case.is-pos').getAttribute('data-c')) === '0', 'Maj+Tab : retour au premier mot, première case');
  // Flèches : bas, puis droite (saute la case noire), puis gauche
  await p.keyboard.press('ArrowDown'); await sleep(40);
  check((await p.locator('.mc-case.is-pos').getAttribute('data-r')) === '1', 'flèche bas : la case descend d’une ligne');
  await p.keyboard.press('ArrowRight'); await sleep(40);
  check((await p.locator('.mc-case.is-pos').getAttribute('data-r')) === '1' && (await p.locator('.mc-case.is-pos').getAttribute('data-c')) === '2', 'flèche droite : saute la case noire');
  await p.keyboard.press('ArrowLeft'); await sleep(40);
  check((await p.locator('.mc-case.is-pos').getAttribute('data-c')) === '0', 'flèche gauche : retour à la colonne 1');
  await p.screenshot({ path: SHOTS + '/nj-grilles2-motscroises-390-mi.png', fullPage: true });

  // Grille pleine de fausses lettres : envoi automatique, cases en rouge, sans erreur comptée
  for (const [r, c] of cellulesBlanches()) await tape(p, r, c, 'Z');
  await sleep(200);
  check((await p.locator('.mc-case.is-faux').count()) === 65, 'grille pleine : les 65 cases fausses sont en rouge');
  check((await live(p)).includes('65 cases fausses en rouge'), 'grille pleine : message « 65 cases fausses en rouge »');
  check((await p.locator('.mc-case.is-faux.fxj-secoue').count()) === 65, 'mots croisés effets : les cases fausses sont secouées');
  check((await essais(p)).length >= 1 && (await essais(p))[0][2].p.verifier === undefined, 'serveur : l’envoi automatique n’est pas une vérification');
  check((await hscroll(p)) <= 0, '390 px (mots croisés, en cours) : pas de défilement horizontal');

  // Grille juste, case après case : chaque lettre retire le rouge, la dernière termine la partie
  for (const [r, c] of cellulesBlanches()) await tape(p, r, c, solution(r, c));
  await sleep(250);
  check((await p.locator('.ng-fin.is-win').count()) === 1, 'grille juste : partie terminée');
  check((await p.locator('.mc-case.fxj-saut').count()) > 0, 'mots croisés effets : les lettres des mots justes sautent une à une');
  await sleep(1800); // le gain défile après l'entrée de la carte de fin
  check((await p.locator('.ng-fin').textContent()).includes('Score 5 pts'), 'grille juste : « Score 5 pts » (aucune erreur)');
  await p.waitForFunction(() => document.querySelector('.ng-fin')?.textContent.includes('+10 ✦ crédités'), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.ng-fin').textContent()).includes('+10 ✦ crédités'), 'grille juste : « +10 ✦ crédités »');
  check((await p.locator('.mc-lettre').allTextContents()).filter((t) => t).length === 65, 'fin : la grille complète est montrée');
  check((await p.locator('.mc-case.is-faux').count()) === 0, 'fin : plus aucune case rouge');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]'); await sleep(200);
  check(/^Mots croisés #16 : grille terminée en \d+:\d\d, sans erreur$/.test(await p.evaluate(() => window.__CLIP)), 'copier : « Mots croisés #16 : grille terminée en m:ss, sans erreur »');
  check((await hscroll(p)) <= 0, '390 px (mots croisés, fin) : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-grilles2-motscroises-390.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'mots croisés 390 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  const envoiesMc = await essais(p);
  check(envoiesMc.length >= 2 && envoiesMc.every((e) => Array.isArray(e[2].p.lignes) && e[2].p.lignes.length === 9), 'serveur : chaque essai envoie neuf lignes');
  await p.ctx.close();

  /* ---------- Mots croisés (1280 px) : « Vérifier », deux colonnes, saisie gardée après rechargement ---------- */
  p = await ouvre(browser, '#mots-croises', { width: 1280, height: 900 });
  await tape(p, 0, 0, 'Z');
  await tape(p, 0, 1, solution(0, 1));
  await p.click('[data-act="verifier"]'); await sleep(260);
  check((await p.locator('.mc-case.is-faux').count()) === 1, '« Vérifier » : seule la case fausse et remplie est en rouge (les cases vides ne comptent pas)');
  check((await p.locator('.mc-case.is-faux.fxj-secoue').count()) === 1, 'mots croisés effets : « Vérifier » secoue la case fausse');
  check((await live(p)).includes('1 case fausse en rouge') && (await live(p)).includes('Compte comme une erreur'), '« Vérifier » : message « 1 case fausse en rouge… Compte comme une erreur »');
  check((await p.locator('.ng-main').boundingBox()).x < (await p.locator('.ng-aside').boundingBox()).x, '1280 px (mots croisés) : jeu à gauche, règles à droite');
  await p.reload(); await p.waitForSelector('.mc-grille', { timeout: 6000 }); await sleep(200);
  check((await p.locator('.mc-case[data-r="0"][data-c="0"] .mc-lettre').textContent()) === 'Z' && (await p.locator('.mc-case[data-r="0"][data-c="1"] .mc-lettre').textContent()) === solution(0, 1), 'saisie gardée : les lettres tapées sont là après rechargement');
  check((await p.locator('.mc-progres').textContent()).includes('Cases remplies : 2 / 65'), 'saisie gardée : compteur à 2 / 65');
  await p.screenshot({ path: SHOTS + '/nj-grilles2-motscroises-1280.png', fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px (mots croisés) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'mots croisés 1280 px : aucune erreur JS');
  await p.ctx.close();

  p = await ouvre(browser, '#mots-croises', { width: 360, height: 800 });
  check((await hscroll(p)) <= 0, '360 px (mots croisés) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'mots croisés 360 px : aucune erreur JS');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exitCode = 1; });
