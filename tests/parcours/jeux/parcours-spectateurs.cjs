// Parcours : mode spectateur et son chat (idée 7, migration 214, maquette validée du lot 7).
// Uno vu par un spectateur : message « Tu regardes en spectateur », « Arrêter de regarder » (fenêtre non rouge, hg_spect_arreter, retour
// à l'accueil), aucune main ni commande, sièges comme les joueurs (place tenue par le robot comprise), chat des spectateurs seul (le chat
// de la table n'est jamais affiché), écriture. Uno vu par un joueur : compteur dans la barre, onglets Table / Spectateurs (Table au départ,
// Spectateurs en lecture seule, flèches du clavier) ; sans spectateurs admis, ni compteur ni onglets. Fin vue par un spectateur : pas de
// revanche. Accueil du Uno et de Monopoly : bloc « En direct » (lignes, compteur, « Regarder », liste vide). Page Jeux : bloc « En direct »
// seulement s'il y a des parties. Blackjack vu par un spectateur : barre, message, panneau, chat. Téléphone 390 px sans défilement
// horizontal, thème clair, échappement. Les règles (rien de caché chez le spectateur, 20 au plus, parties privées) sont testées en SQL :
// tests/bancs/uno/t5_spectateurs.sql et tests/bancs/plateaux/t_spectateurs.sql. Captures : tests/shots/spect-*.png.
// Lancer : node tests/parcours/jeux/parcours-spectateurs.cjs
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, log, chromium, FIXTURES, SHOTS } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const MOI = U(2);
const CODE = 'HGUNO-4242';
const SALONS = fs.readFileSync(path.join(FIXTURES, 'fake-salons.js'), 'utf8');
const PAGES = ['uno', 'jeux', 'monopoly'].map((slug) => ({ slug, label: slug, mode: 'membres', in_nav: false, sort: 99 }));
const MEMBRE = { uid: MOI, pagesExtra: PAGES };
const BOITE = 'dialog.hg-dialog[open]';
const theme = (mode) => `try { localStorage.setItem('hg_prefs', JSON.stringify({ mode: '${mode}' })); } catch {}`;
const il_y_a = (min) => new Date(Date.now() - min * 60000).toISOString();

/** Messages de la partie : un de la table (jamais montré à un spectateur), un des spectateurs (pseudo échappé). */
const MESSAGES = [
  { id: 1, user_id: U(3), pseudo: 'Bruno', texte: 'Message de la table', created_at: il_y_a(2), spect: false },
  { id: 2, user_id: U(7), pseudo: 'Léo<i>x</i>', couleur: '#C9A0DC', texte: 'Allez Alice !', created_at: il_y_a(1), spect: true },
];
const DIRECT = [
  { code: 'HGUNO-1111', nom: 'Uno du vendredi', mode: 'manche', manche: 2, joueurs: ['Alice', 'Bruno', 'Chloé', 'David'], spectateurs: 3 },
  { code: 'HGUNO-2222', nom: 'Uno <b>rapide</b>', mode: 'manche', manche: 1, joueurs: ['Mia', 'Noé', 'Sacha'], spectateurs: 1 },
  { code: 'HGUNO-3333', nom: 'La grande table', mode: 'points', manche: 3, joueurs: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'], spectateurs: 0 },
];

/** Script injecté (Uno) : fake-salons.js, état retouché par patch, messages, En direct ; hg_uno_message et hg_spect_arreter répondent. */
const init = (patch, { mode = 'sombre', direct = DIRECT } = {}) => ({ content: `${theme(mode)};${SALONS};(() => {
  const patch = ${patch || '(e) => e'}; const prev = window.__FAKE_RPC;
  window.__FAKE_RPC = async (fn, a) => {
    if (fn === 'hg_uno_messages') return { data: ${JSON.stringify(MESSAGES)}, error: null };
    if (fn === 'hg_uno_message' || fn === 'hg_spect_arreter') return { data: null, error: null };
    if (fn === 'hg_uno_en_direct') return { data: ${JSON.stringify(direct)}, error: null };
    const r = await prev(fn, a);
    if (!(r && /_etat$/.test(fn) && r.data)) return r;
    return { data: patch(JSON.parse(JSON.stringify(r.data))), error: null };
  };
})();` });
const ouvrir = (browser, patch, o = {}, tel = false, hash = `#partie/${CODE}`) => openPage(browser, { page: 'uno', hash, width: tel ? 390 : 1280,
  height: tel ? 844 : 900, mobile: tel, scenario: { ...MEMBRE, salon: 'uno' }, init: init(patch, o) });
const appels = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn);

// Spectateur : je ne suis pas à la table (Alice prend ma place), aucune main ; Bruno est parti (un robot joue pour lui).
const SPECT = `(e) => { e.moi = { user_id: e.moi.user_id, hote: false, invite: false, joue: false, spectateur: true };
  e.joueurs[0] = { ...e.joueurs[0], user_id: '${U(6)}', pseudo: 'Alice' }; e.partie.hote = '${U(6)}'; e.partie.tour = '${U(6)}'; e.main = [];
  e.partie.visibilite = 'publique'; e.joueurs[1].parti = true; e.joueurs[1].parti_at = '${il_y_a(4)}';
  e.spectateurs = { admis: true, nb: 4 }; return e; }`;
const JOUEUR = '(e) => { e.partie.visibilite = \'publique\'; e.spectateurs = { admis: true, nb: 4 }; return e; }';
const FIN_SPECT = `(e) => { (${SPECT})(e); const p = e.partie; p.statut = 'terminee'; p.tour = null; p.tour_fin = null; p.vainqueur = e.joueurs[0].user_id;
  e.joueurs.forEach((j, i) => { j.rang = i + 1; j.gagne = i === 0; j.nb_cartes = [0, 4, 2, 6][i]; j.main_points = [0, 47, 12, 66][i]; }); return e; }`;

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const suivre = (p) => { p.on('pageerror', (e) => erreurs.push(e.message)); return p; };

  /* ---------- Uno vu par un spectateur ---------- */
  let p = suivre(await ouvrir(browser, SPECT));
  await p.waitForSelector('.sp-zone .sp-msg', { timeout: 8000 }).catch(() => {});
  check((await p.locator('.sp-zone .sp-msg p').innerText()) === 'Tu regardes en spectateur. 4 membres regardent cette partie.', 'spectateur : message sous la barre');
  check(await p.locator('.sp-zone .sp-msg').evaluate((e) => e.getAttribute('role') === 'status' && !!e.querySelector('svg')), 'spectateur : bloc annoncé, avec l’œil');
  check(await p.locator('.uno-barre [data-sp-arreter]').isVisible() && (await p.locator('.uno-barre [data-sp-arreter]').innerText()).trim() === 'Arrêter de regarder', 'spectateur : bouton « Arrêter de regarder »');
  check(!(await p.locator('.uno-barre [data-quitter]').isVisible()), 'spectateur : pas de bouton Quitter');
  check((await p.locator('.uno-barre .sp-nb-barre').count()) === 0, 'spectateur : pas de compteur dans la barre (il est dans le message)');
  check((await p.locator('.uno-vide').innerText()) === 'Tu regardes la partie. Les mains restent cachées : tu vois le nombre de cartes de chacun, comme les joueurs.', 'spectateur : texte à la place de la main');
  check((await p.locator('.uno-fan-carte').count()) === 0, 'spectateur : aucune carte de main');
  for (const sel of ['.uno-tri', '.uno-moi', '.uno-commandes']) check(!(await p.locator(sel).isVisible()), `spectateur : ${sel} caché`);
  check((await p.locator('.uno-siege').count()) === 4, 'spectateur : les 4 joueurs autour de la table');
  check((await p.locator('.uno-siege', { hasText: 'Chloé' }).locator('[data-nb]').innerText()) === '4 cartes', 'spectateur : nombre de cartes de chacun');
  const robot = p.locator('.uno-siege', { hasText: 'Bruno' });
  check(await robot.evaluate((e) => e.classList.contains('is-robot')) && (await robot.locator('.rb-pastille').count()) === 1 && (await robot.locator('.rb-tag').innerText()) === 'robot', 'spectateur : place tenue par le robot (siège grisé, pastille, étiquette)');
  check((await p.locator('.uno-robot-zone .rb-msg p').innerText()).startsWith('Bruno est parti : un robot joue sa main.'), 'spectateur : message du robot');
  check((await p.locator('.uno-chat-titre').innerText()) === 'Chat des spectateurs' && (await p.locator('.uno-chat').getAttribute('aria-label')) === 'Chat des spectateurs', 'spectateur : chat des spectateurs');
  check((await p.locator('.uno-chat-champ').getAttribute('placeholder')) === 'Écris aux spectateurs' && (await p.locator('.uno-chat-form label').innerText()) === 'Ton message aux spectateurs', 'spectateur : champ « Écris aux spectateurs »');
  const fil = await p.locator('.uno-chat-fil').innerText();
  check(fil.includes('Allez Alice !') && !fil.includes('Message de la table'), 'spectateur : seulement le chat des spectateurs');
  check((await p.locator('.uno-chat-auteur').first().innerText()) === 'Léo<i>x</i>' && (await p.locator('.uno-chat-auteur i').count()) === 0, 'spectateur : pseudo échappé');
  check((await p.locator('.uno-chat-auteur').first().evaluate((e) => e.style.color)) === 'rgb(201, 160, 220)', 'spectateur : couleur de profil du spectateur');
  await p.fill('.uno-chat-champ', 'Belle main');
  await p.click('.uno-chat-envoyer');
  await p.waitForTimeout(300);
  check((await appels(p, 'hg_uno_message')).some((e) => e[2].p_texte === 'Belle main'), 'spectateur : il écrit au chat des spectateurs');
  check(!(await hscroll(p)), 'spectateur 1280 : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'spect-uno-1280.png') });
  // Arrêter de regarder : fenêtre non rouge, puis retour à l'accueil du Uno.
  await p.click('.uno-barre [data-sp-arreter]');
  await p.waitForSelector(BOITE, { timeout: 3000 });
  check((await p.locator(`${BOITE} .dialog-title`).innerText()) === 'Arrêter de regarder ?', 'arrêter : titre');
  check((await p.locator(`${BOITE} p`).innerText()) === 'Tu quittes la table des spectateurs. Tu peux revenir tant que la partie est en cours.', 'arrêter : texte');
  check((await p.locator(`${BOITE} .btn-danger`).count()) === 0 && (await p.locator(`${BOITE} .btn-ghost`).innerText()) === 'Rester', 'arrêter : bouton non rouge, « Rester »');
  await p.screenshot({ path: path.join(SHOTS, 'spect-arreter-1280.png') });
  await p.locator(`${BOITE} button`, { hasText: 'Arrêter de regarder' }).click();
  await p.waitForSelector('.uno-acc', { timeout: 8000 }).catch(() => {});
  check((await appels(p, 'hg_spect_arreter')).some((e) => e[2].p_partie === 'partie-uno'), 'arrêter : hg_spect_arreter(id de la partie)');
  check((await p.locator('.uno-acc').count()) === 1, 'arrêter : retour à l’accueil du Uno');
  await p.close();

  // Téléphone : sombre, puis clair avec le chat ouvert.
  p = suivre(await ouvrir(browser, SPECT, {}, true));
  await p.waitForSelector('.sp-zone .sp-msg', { timeout: 8000 }).catch(() => {});
  check(!(await hscroll(p)), 'spectateur 390 : pas de défilement horizontal');
  const b = await p.locator('.uno-barre [data-sp-arreter]').boundingBox();
  check(b && b.width >= 44 && b.height >= 44, 'spectateur 390 : bouton « Arrêter de regarder » de 44 px');
  await p.screenshot({ path: path.join(SHOTS, 'spect-uno-390.png'), fullPage: true });
  await p.close();
  p = suivre(await ouvrir(browser, SPECT, { mode: 'clair' }, true));
  await p.waitForSelector('.sp-zone .sp-msg', { timeout: 8000 }).catch(() => {});
  await p.click('[data-chat-bouton]');
  await p.waitForTimeout(400);
  check(await p.locator('.uno-chat-champ').isVisible(), 'spectateur 390 clair : chat ouvert, champ visible');
  await p.screenshot({ path: path.join(SHOTS, 'spect-uno-390-clair-chat.png') });
  await p.close();

  /* ---------- Uno vu par un joueur ---------- */
  p = suivre(await ouvrir(browser, JOUEUR));
  await p.waitForSelector('.sp-onglets', { timeout: 8000 }).catch(() => {});
  const compteur = p.locator('.uno-barre .sp-nb-barre');
  check((await compteur.count()) === 1 && (await compteur.getAttribute('title')) === '4 membres regardent la partie' && (await compteur.innerText()).trim().startsWith('4'), 'joueur : compteur dans la barre');
  check((await p.locator('.sp-zone .sp-msg').count()) === 0 && await p.locator('.uno-barre [data-quitter]').isVisible(), 'joueur : pas de message spectateur, Quitter présent');
  const onglets = p.locator('.uno-chat .sp-onglet');
  check((await onglets.count()) === 2 && (await onglets.nth(0).getAttribute('aria-selected')) === 'true', 'joueur : onglets, « Table » choisi au départ');
  check((await p.locator('.uno-chat-titre').innerText()) === 'Chats de la partie' && await p.locator('.uno-chat-titre').evaluate((e) => e.classList.contains('visually-hidden')), 'joueur : titre lu seulement');
  check((await p.locator('.sp-onglet-nb').innerText()) === '4', 'joueur : nombre de spectateurs sur l’onglet');
  const panneauTable = p.locator('[id$="-table"][role="tabpanel"]'), panneauSpect = p.locator('[id$="-spect"][role="tabpanel"]');
  check(await panneauTable.isVisible() && !(await panneauSpect.isVisible()), 'joueur : chat des spectateurs fermé au départ');
  check((await panneauTable.innerText()).includes('Message de la table') && !(await panneauTable.innerText()).includes('Allez Alice'), 'joueur : chat de la table sans les spectateurs');
  await p.screenshot({ path: path.join(SHOTS, 'spect-joueur-1280.png') });
  await onglets.nth(1).click();
  check((await onglets.nth(1).getAttribute('aria-selected')) === 'true' && await panneauSpect.isVisible() && !(await panneauTable.isVisible()), 'joueur : onglet « Spectateurs » ouvert');
  check((await panneauSpect.innerText()).includes('Allez Alice !') && (await panneauSpect.locator('form').count()) === 0, 'joueur : il lit les spectateurs sans champ');
  check((await panneauSpect.locator('.sp-lecture').innerText()) === 'Tu lis le chat des spectateurs sans y écrire. Ils ne voient pas le chat de la table.', 'joueur : phrase de lecture seule');
  await p.screenshot({ path: path.join(SHOTS, 'spect-joueur-onglet-1280.png') });
  await onglets.nth(1).focus();
  await p.keyboard.press('ArrowLeft');
  check((await onglets.nth(0).getAttribute('aria-selected')) === 'true' && await p.evaluate(() => document.activeElement?.dataset.spOnglet === 'table'), 'joueur : flèche gauche, retour à « Table »');
  const tailleOnglet = await onglets.nth(0).boundingBox();
  check(tailleOnglet && tailleOnglet.height >= 44, 'joueur : onglets de 44 px');
  await p.close();
  p = suivre(await ouvrir(browser, JOUEUR, { mode: 'clair' }, true));
  await p.waitForSelector('.sp-onglets', { state: 'attached', timeout: 8000 }).catch(() => {});
  await p.click('[data-chat-bouton]');
  await p.waitForTimeout(300);
  await p.locator('.uno-chat .sp-onglet').nth(1).click();
  check(!(await hscroll(p)) && (await p.locator('.uno-barre .sp-nb-barre').isVisible()) === false, 'joueur 390 clair : pas de défilement, compteur masqué au téléphone');
  await p.screenshot({ path: path.join(SHOTS, 'spect-joueur-onglet-390-clair.png') });
  await p.close();
  // Partie sans spectateurs admis (état de base) : ni compteur ni onglets.
  p = suivre(await ouvrir(browser, null));
  await p.waitForSelector('.uno-chat-fil', { timeout: 8000 }).catch(() => {});
  check((await p.locator('.sp-onglets').count()) === 0 && (await p.locator('.sp-nb-barre').count()) === 0 && (await p.locator('.uno-chat-titre').innerText()) === 'Chat de la table', 'sans spectateurs : ni onglets ni compteur');
  await p.close();

  /* ---------- Fin vue par un spectateur : pas de revanche ---------- */
  p = suivre(await ouvrir(browser, FIN_SPECT));
  await p.waitForSelector('.uno-fin', { timeout: 8000 }).catch(() => {});
  check((await p.locator('[data-rejouer]').count()) === 0 && (await p.locator('.uno-fin-actions a').innerText()) === 'Retour à l\'accueil', 'fin, spectateur : pas de revanche, retour à l’accueil');
  await p.close();

  /* ---------- Accueil du Uno : En direct ---------- */
  p = suivre(await ouvrir(browser, null, {}, false, ''));
  await p.waitForSelector('.sp-direct .uno-acc-ligne', { timeout: 8000 }).catch(() => {});
  const direct = p.locator('.sp-direct');
  check((await direct.locator('h2').innerText()) === 'En direct', 'accueil Uno : bloc « En direct »');
  check(await p.evaluate(() => document.querySelector('#uno-acc-publiques').closest('section').nextElementSibling?.classList.contains('sp-direct')), 'accueil Uno : sous les parties publiques');
  check((await direct.locator('.uno-acc-ligne').count()) === 3, 'accueil Uno : 3 parties');
  const sous = await direct.locator('.uno-acc-sous').allInnerTexts();
  check(sous[0] === 'Alice, Bruno, Chloé, David · manche 2' && sous[2] === '9 joueurs · partie en 500 points', 'accueil Uno : joueurs et avancement');
  check((await direct.locator('.uno-acc-ligne').nth(1).locator('strong').innerText()) === 'Uno <b>rapide</b>', 'accueil Uno : nom échappé');
  check((await direct.locator('.sp-nb').count()) === 2 && (await direct.locator('.sp-nb').first().innerText()).replace(/\s+/g, ' ').trim() === '3 spectateurs', 'accueil Uno : compteur (rien à 0)');
  check((await direct.locator('.uno-acc-bouton').first().getAttribute('href')) === '#partie/HGUNO-1111' && (await direct.locator('.uno-acc-bouton').first().innerText()).startsWith('Regarder'), 'accueil Uno : « Regarder » ouvre la partie');
  check(!(await hscroll(p)), 'accueil Uno 1280 : pas de défilement horizontal');
  await direct.screenshot({ path: path.join(SHOTS, 'spect-accueil-uno-1280.png') });
  await p.close();
  p = suivre(await ouvrir(browser, null, { mode: 'clair', direct: [] }, true, ''));
  await p.waitForFunction(() => /Aucune partie publique en cours/.test(document.querySelector('.sp-direct')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
  check((await p.locator('.sp-direct .uno-acc-aide').innerText()) === 'Aucune partie publique en cours. Les parties privées ne se regardent pas.', 'accueil Uno : rien à regarder');
  check(!(await hscroll(p)), 'accueil Uno 390 : pas de défilement horizontal');
  await p.locator('.sp-direct').screenshot({ path: path.join(SHOTS, 'spect-accueil-uno-vide-390-clair.png') });
  await p.close();
  p = suivre(await ouvrir(browser, null, {}, true, ''));
  await p.waitForSelector('.sp-direct .uno-acc-ligne', { timeout: 8000 }).catch(() => {});
  check(!(await hscroll(p)), 'accueil Uno 390 avec parties : pas de défilement horizontal');
  await p.locator('.sp-direct').screenshot({ path: path.join(SHOTS, 'spect-accueil-uno-390.png') });
  await p.close();

  /* ---------- Accueil de Monopoly : En direct ---------- */
  const MONO = [{ code: 'HGMON-1111', nom: 'Monopoly de Sacha', nb_tours: 14, tour_pseudo: 'Mia', joueurs: ['Sacha', 'Mia', 'Noé'], spectateurs: 2 },
    { code: 'HGMON-2222', nom: 'Monopoly du dimanche', nb_tours: 3, tour_pseudo: null, joueurs: ['Léo', 'Zoé', 'Karim', 'Lina'], spectateurs: 0 }];
  p = suivre(await openPage(browser, { page: 'monopoly', scenario: MEMBRE, init: { content: `window.__FAKE_RPC = async (fn) => (fn === 'hg_plat_en_direct' ? { data: ${JSON.stringify(MONO)}, error: null } : undefined);` } }));
  await p.waitForSelector('.sp-direct .sp-ligne', { timeout: 8000 }).catch(() => {});
  check((await p.locator('.sp-direct h2').innerText()) === 'En direct' && (await p.locator('.sp-direct .sp-ligne').count()) === 2, 'accueil Monopoly : bloc « En direct »');
  check((await p.locator('.sp-direct .sp-sous').first().innerText()) === 'Sacha, Mia, Noé · tour 14 · Mia joue', 'accueil Monopoly : joueurs, tour, qui joue');
  check((await p.locator('.sp-direct .sp-bouton').first().getAttribute('href')) === '#partie/HGMON-1111', 'accueil Monopoly : « Regarder »');
  check((await appels(p, 'hg_plat_en_direct')).some((e) => e[2].p_jeu === 'monopoly'), 'accueil Monopoly : liste du jeu de la page');
  await p.locator('.sp-direct').screenshot({ path: path.join(SHOTS, 'spect-accueil-monopoly-1280.png') });
  await p.close();

  /* ---------- Page Jeux : En direct seulement s'il y a des parties ---------- */
  const JX = [{ jeu: 'uno', code: 'HGUNO-1111', nom: 'Uno du vendredi', mode: 'manche', manche: 2, joueurs: ['Alice', 'Bruno', 'Chloé', 'David'], spectateurs: 3 },
    { jeu: 'monopoly', code: 'HGMON-1111', nom: 'Monopoly de Sacha', nb_tours: 14, joueurs: ['Sacha', 'Mia', 'Noé'], spectateurs: 2 },
    { jeu: 'blackjack', code: 'HGBJK-1111', nom: 'Table de Maya', nb_tours: 5, manches: 8, joueurs: ['Maya', 'Tom', 'Lou', 'Max'], spectateurs: 0 }];
  for (const [tel, mode] of [[false, 'sombre'], [true, 'clair']]) {
    p = suivre(await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux.mjs', width: tel ? 390 : 1280, height: tel ? 844 : 900, mobile: tel,
      scenario: { enDirect: JX }, init: { content: theme(mode) } }));
    await p.waitForSelector('.sp-jeux .rp-ligne', { timeout: 8000 }).catch(() => {});
    check((await p.locator('.sp-jeux .rp-titre').innerText()) === 'En direct' && (await p.locator('.sp-jeux .rp-ligne').count()) === 3, `page Jeux ${tel ? '390' : '1280'} : bloc « En direct »`);
    if (!tel) {
      const s = await p.locator('.sp-jeux .rp-sous').allInnerTexts();
      check(s[0] === 'Uno · Alice, Bruno, Chloé, David · manche 2' && s[2] === 'Blackjack · Maya, Tom, Lou, Max · manche 5 sur 8', 'page Jeux : jeu, joueurs, avancement');
      check((await p.locator('.sp-jeux .rp-bouton').nth(1).getAttribute('href')) === '/pages/jeux/monopoly.html#partie/HGMON-1111', 'page Jeux : lien vers la partie');
    }
    check(!(await hscroll(p)), `page Jeux ${tel ? '390' : '1280'} : pas de défilement horizontal`);
    await p.locator('.sp-jeux').screenshot({ path: path.join(SHOTS, `spect-jeux-${tel ? '390-clair' : '1280'}.png`) });
    await p.close();
  }
  p = suivre(await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux.mjs' }));
  await p.waitForSelector('.jeux-layout', { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(800);
  check((await p.locator('.sp-jeux').count()) === 1 && !(await p.locator('.sp-jeux').isVisible()), 'page Jeux : rien à regarder, pas de bloc');
  check((await appels(p, 'hg_jeux_en_direct')).length >= 1, 'page Jeux : liste lue');
  await p.close();

  /* ---------- Blackjack vu par un spectateur ---------- */
  const BJ = `window.__PATCH = (e) => { const me = e.moi.user_id; e.moi = { user_id: me, joue: false, spectateur: true, hote: false, invite: false };
    e.joueurs = e.joueurs.filter((j) => j.user_id !== me); const a = e.joueurs[0]; a.etat.mains = [{ cartes: ['TH', '6C'], mise: 50, statut: 'joue' }];
    e.jeu = { ...e.jeu, phase: 'jeu', actif: a.user_id, main: 0, banque: ['9H', '??'], totaux: { [a.user_id]: [16] } }; e.partie.tour = a.user_id;
    e.partie.visibilite = 'publique'; e.spectateurs = { admis: true, nb: 2 }; return e; };`;
  for (const [tel, mode] of [[false, 'sombre'], [true, 'sombre'], [true, 'clair']]) {
    p = suivre(await openPage(browser, { page: 'blackjack', fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'blackjack' }, hash: '#partie/HGBJK-1234',
      width: tel ? 390 : 1280, height: tel ? 844 : 900, mobile: tel, init: { content: `${theme(mode)};${BJ}` } }));
    await p.waitForSelector('.bj-tapis', { timeout: 8000 }).catch(() => {});
    await p.waitForSelector('.sp-zone .sp-msg', { timeout: 4000 }).catch(() => {});
    if (!tel) {
      check((await p.locator('.sp-zone .sp-msg p').innerText()) === 'Tu regardes en spectateur. 2 membres regardent cette partie.', 'blackjack : message sous la barre');
      check(!(await p.locator('.bj-barre [data-quitter]').isVisible()) && (await p.locator('.bj-barre [data-sp-arreter]').isVisible()), 'blackjack : « Arrêter de regarder » à la place de Quitter');
      check((await p.locator('.bj-panneau h2').innerText()) === 'C\'est à Alice de jouer' && (await p.locator('.bj-panneau .bj-note').innerText()) === 'Alice décide de sa main. Tu regardes : tu ne peux ni miser ni jouer.', 'blackjack : panneau du spectateur');
      check((await p.locator('.bj-panneau button').count()) === 0, 'blackjack : aucune action');
      check((await p.locator('.bj-banque .cd-dos').count()) === 1, 'blackjack : carte cachée de la banque');
      check((await p.locator('.plat-chat .plat-chat-titre').innerText()) === 'Chat des spectateurs' && (await p.locator('.plat-chat-champ').getAttribute('placeholder')) === 'Écris aux spectateurs', 'blackjack : chat des spectateurs, il peut écrire');
      check(await p.locator('.plat-chat-form').isVisible() && !(await p.locator('[data-lecture]').isVisible()), 'blackjack : champ ouvert au spectateur');
    }
    check(!(await hscroll(p)), `blackjack ${tel ? 390 : 1280} : pas de défilement horizontal`);
    await p.screenshot({ path: path.join(SHOTS, `spect-blackjack-${tel ? '390' : '1280'}${mode === 'clair' ? '-clair' : ''}.png`), fullPage: tel });
    await p.close();
  }
  // Blackjack vu par un joueur : compteur dans la barre, onglets du chat.
  p = suivre(await openPage(browser, { page: 'blackjack', fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'blackjack' }, hash: '#partie/HGBJK-1234',
    init: { content: 'window.__PATCH = (e) => { e.spectateurs = { admis: true, nb: 2 }; return e; };' } }));
  await p.waitForSelector('.bj-barre .sp-nb-barre', { timeout: 8000 }).catch(() => {});
  check((await p.locator('.bj-barre .sp-nb-barre').getAttribute('title')) === '2 membres regardent la partie' && await p.locator('.bj-barre [data-quitter]').isVisible(), 'blackjack, joueur : compteur et Quitter');
  check((await p.locator('.plat-chat .sp-onglet').count()) === 2 && (await p.locator('.plat-chat .sp-onglet').first().getAttribute('aria-selected')) === 'true', 'blackjack, joueur : onglets Table / Spectateurs');
  await p.locator('.plat-chat .sp-onglet').nth(1).click();
  check(await p.locator('.plat-chat .sp-lecture').isVisible() && !(await p.locator('.plat-chat-form').isVisible()), 'blackjack, joueur : spectateurs en lecture seule');
  await p.close();

  check(erreurs.length === 0, `aucune erreur JS (${erreurs.join(' | ')})`);
  await browser.close();
  finish();
})();
