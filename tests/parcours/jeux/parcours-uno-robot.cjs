// Parcours : un robot tient la place d'un joueur parti au Uno (idée 6, migration 211, maquette validée du lot 7).
// Table : ce que voient les autres (siège grisé, pastille, étiquette « robot », message sous la barre, texte lu), la fenêtre Quitter
// (texte du robot, retour à l'accueil du Uno après confirmation), le retour (table ouverte avec ma place tenue par le robot : reprise
// d'elle-même, résumé des coups), 3 tours manqués pendant que la table est ouverte (bouton « Reprendre ma place », rien de jouable).
// Accueil du Uno et page Jeux : la ligne de ma partie (« un robot joue pour toi depuis 4 min », étiquette Robot, « Reprendre ma place »).
// Fin : étiquette et note pour une place tenue par le robot, vue de celui qui n'est pas revenu (aucune Paillette, pas de revanche),
// le robot qui vide une main (personne ne gagne). Téléphone 390 px sans défilement horizontal, thème clair, échappement.
// Faux serveurs : fixtures/fake-salons.js (état figé, retouché par patch) et fake-sb-jeux.mjs (page Jeux). Les règles sont testées en SQL
// (tests/bancs/uno/t4_robot.sql). Captures : tests/shots/uno-robot-*.png.
// Lancer : node tests/parcours/jeux/parcours-uno-robot.cjs
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, log, sleep, chromium, FIXTURES, SHOTS } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const MOI = U(2);
const CODE = 'HGUNO-4242';
const SALONS = fs.readFileSync(path.join(FIXTURES, 'fake-salons.js'), 'utf8');
const PAGES = ['uno', 'jeux'].map((slug) => ({ slug, label: slug, mode: 'membres', in_nav: false, sort: 99 }));
const MEMBRE = { uid: MOI, pagesExtra: PAGES };
const BOITE = 'dialog.hg-dialog[open]';
const clair = (mode) => `try { localStorage.setItem('hg_prefs', JSON.stringify({ mode: '${mode}' })); } catch {}`;

/**
 * Script injecté : fake-salons.js, état retouché par patch(etat, R) ; R = window.__ROBOT (revenu, reprises, reponse de hg_uno_reprendre).
 * hg_uno_quitter répond sans rien faire ; hg_uno_mes_parties renvoie mesParties.
 */
const init = (patch, { reponse = null, mesParties = [], mode = 'sombre' } = {}) => ({ content: `${clair(mode)};${SALONS};(() => {
  window.__ROBOT = { revenu: false, reprises: 0, reponse: ${JSON.stringify(reponse)} };
  const patch = ${patch || '(e) => e'}; const prev = window.__FAKE_RPC;
  window.__FAKE_RPC = async (fn, a) => {
    if (fn === 'hg_uno_quitter') return { data: null, error: null };
    if (fn === 'hg_uno_mes_parties') return { data: ${JSON.stringify(mesParties)}, error: null };
    if (fn === 'hg_uno_reprendre') { window.__ROBOT.reprises++; window.__ROBOT.revenu = true; return { data: window.__ROBOT.reponse, error: null }; }
    const r = await prev(fn, a);
    if (!(r && /_etat$/.test(fn) && r.data)) return r;
    const e = patch(JSON.parse(JSON.stringify(r.data)), window.__ROBOT);
    e.partie.version += window.__ROBOT.reprises;   // comme le serveur : reprendre change la version, la table relit
    return { data: e, error: null };
  };
})();` });
const ouvrir = (browser, patch, o = {}, tel = false) => openPage(browser, { page: 'uno', hash: `#partie/${CODE}`, width: tel ? 390 : 1280, height: tel ? 844 : 900, mobile: tel,
  scenario: { ...MEMBRE, salon: 'uno' }, init: init(patch, o) });
const nbRpc = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn).length;
const relire = (p) => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
const message = (p, i = 0) => p.locator('.uno-robot-zone .rb-msg').nth(i).locator('p').innerText();
const il_y_a = (min) => new Date(Date.now() - min * 60000).toISOString();

// Bruno (joueurs[1]) est parti il y a 4 minutes.
const AUTRES = `(e) => { e.joueurs[1].parti = true; e.joueurs[1].parti_at = '${il_y_a(4)}'; return e; }`;
// Moi parti, tant que je n'ai pas repris ma place.
const RETOUR = '(e, R) => { if (!R.revenu) { e.moi.parti = true; e.joueurs[0].parti = true; } return e; }';
// Ma place passe au robot pendant que la table est ouverte (window.__ABSENT).
const MANQUES = '(e, R) => { if (window.__ABSENT) { e.partie.version += 1; if (!R.revenu) { e.moi.parti = true; e.joueurs[0].parti = true; } } return e; }';
// Partie finie : Alice (moi) gagne, Bruno parti (le robot a joué ses 9 derniers tours).
const FIN = `(e, R, moiParti) => { const p = e.partie; p.statut = 'terminee'; p.tour = null; p.tour_fin = null; p.vainqueur = e.moi.user_id; e.main = [];
  e.joueurs.forEach((j, i) => { j.rang = [1, 3, 2, 4][i]; j.gagne = i === 0; j.nb_cartes = [0, 4, 2, 6][i]; j.main_points = [0, 47, 12, 66][i]; j.paillettes = [180, 0, 50, 50][i]; });
  e.joueurs[1].parti = true; e.joueurs[1].tours_robot = 9; return e; }`;
const FIN_PARTI = `(e, R) => { (${FIN})(e, R); e.joueurs[0].parti = true; e.joueurs[0].tours_robot = 4; e.joueurs[0].gagne = false; e.joueurs[0].paillettes = 0; e.moi.parti = true; return e; }`;
const FIN_ROBOT = `(e, R) => { (${FIN})(e, R); e.joueurs.forEach((j) => { j.gagne = false; j.parti = false; }); e.joueurs[1].parti = true; e.joueurs[1].rang = 1; e.joueurs[0].rang = 3;
  e.joueurs[1].nb_cartes = 0; e.joueurs[0].nb_cartes = 3; e.partie.vainqueur = e.joueurs[1].user_id; e.joueurs[0].paillettes = 50; return e; }`;

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const suivre = (p) => { p.on('pageerror', (e) => erreurs.push(e.message)); return p; };

  /* ---------- Ce que voient les autres ---------- */
  let p = suivre(await ouvrir(browser, AUTRES));
  await p.waitForSelector('.uno-siege.is-robot', { timeout: 8000 }).catch(() => {});
  const siege = p.locator('.uno-siege', { hasText: 'Bruno' });
  check(await siege.evaluate((e) => e.classList.contains('is-robot') && !e.classList.contains('exclu')), 'autres : le siège de Bruno est tenu par le robot, pas exclu');
  check((await siege.locator('.rb-pastille').count()) === 1 && (await siege.locator('.uno-etiquettes .rb-tag').innerText()) === 'robot', 'autres : pastille et étiquette « robot »');
  check((await siege.locator('[data-nb]').innerText()) === '7 cartes', 'autres : il garde ses cartes');
  check((await siege.innerText()).includes('un robot joue à sa place'), 'autres : texte lu par les lecteurs d’écran');
  check(await siege.locator('.uno-av').evaluate((e) => getComputedStyle(e.querySelector('.avatar')).filter.includes('grayscale')), 'autres : photo grisée');
  check((await message(p)) === 'Bruno est parti : un robot joue sa main. Bruno peut la reprendre tant que la partie n’est pas finie.', 'autres : message sous la barre');
  check(await p.locator('.uno-robot-zone .rb-msg').evaluate((e) => e.getAttribute('role') === 'status' && !e.classList.contains('is-moi')), 'autres : bloc simple, annoncé');
  check((await p.locator('.uno-siege.is-robot').count()) === 1 && (await p.locator('.uno-fan-carte button.jouable').count()) > 0, 'autres : je joue normalement');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-autres-1280.png') });
  // Deux joueurs partis : noms réunis.
  await p.evaluate(() => { window.__DEUX = true; });
  await p.close();
  p = suivre(await ouvrir(browser, `(e) => { (${AUTRES})(e); e.joueurs[2].parti = true; e.joueurs[2].parti_at = '${il_y_a(1)}'; e.joueurs[2].pseudo = 'Chlo<b>é</b>'; return e; }`));
  await p.waitForSelector('.uno-robot-zone .rb-msg', { timeout: 8000 }).catch(() => {});
  check((await message(p)) === 'Bruno et Chlo<b>é</b> sont partis : un robot joue leurs mains. Ils peuvent les reprendre tant que la partie n’est pas finie.', 'autres : deux partis, pseudo échappé');
  await p.close();

  // Téléphone.
  p = suivre(await ouvrir(browser, AUTRES, {}, true));
  await p.waitForSelector('.uno-siege.is-robot', { timeout: 8000 }).catch(() => {});
  check(!(await hscroll(p)), 'autres au téléphone : pas de défilement horizontal');
  check((await p.locator('.uno-siege.is-robot .rb-pastille').boundingBox())?.width >= 20, 'autres au téléphone : pastille visible');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-autres-390.png') });
  await p.close();

  /* ---------- Quitter : la fenêtre du robot, puis retour à l'accueil ---------- */
  p = suivre(await ouvrir(browser, null));
  await p.waitForSelector('.uno-barre [data-quitter]', { timeout: 8000 });
  await p.click('.uno-barre [data-quitter]');
  await p.waitForSelector(BOITE, { timeout: 3000 });
  check((await p.locator(`${BOITE} .dialog-title`).innerText()) === 'Quitter la table ?', 'quitter : titre');
  check((await p.locator(`${BOITE} p`).innerText()) === 'Un robot joue ta main jusqu’à ton retour. Reviens avant la fin de la partie pour la reprendre. Si tu n’es pas revenu à la fin, tu ne reçois pas de Paillettes.', 'quitter : texte du robot');
  check((await p.locator(`${BOITE} .btn-ghost`).innerText()) === 'Rester' && (await p.locator(`${BOITE} .btn-danger`).innerText()) === 'Quitter la table', 'quitter : « Rester » et « Quitter la table »');
  await p.click(`${BOITE} .btn-danger`);
  await p.waitForSelector('.uno-acc', { timeout: 8000 }).catch(() => {});
  check((await nbRpc(p, 'hg_uno_quitter')) === 1, 'quitter : départ envoyé');
  check((await p.evaluate(() => location.hash)) === '' && (await p.locator('.uno-acc').count()) === 1, 'quitter : retour à l’accueil du Uno');
  await p.close();

  /* ---------- Le retour : table ouverte, ma place est reprise d'elle-même ---------- */
  p = suivre(await ouvrir(browser, RETOUR, { reponse: { tours: 2, resume: 'posé Jaune 9 et pioché une carte' }, mode: 'clair' }));
  await p.waitForFunction(() => document.querySelector('.uno-robot-zone .rb-msg.is-moi')?.textContent.includes('repris'), null, { timeout: 8000 }).catch(() => {});
  check((await nbRpc(p, 'hg_uno_reprendre')) === 1, 'retour : hg_uno_reprendre demandé une fois');
  check((await message(p)) === 'Tu as repris ta place. Pendant ton absence, le robot a posé Jaune 9 et pioché une carte.', 'retour : message du résumé');
  check(await p.locator('.uno-robot-zone .rb-msg').evaluate((e) => e.classList.contains('is-moi')), 'retour : bloc mis en avant');
  check((await p.locator('.uno-siege.is-robot').count()) === 0 && (await p.locator('.uno-fan-carte button.jouable').count()) > 0, 'retour : ma main est jouable, aucun siège robot');
  check(!(await p.locator('.uno-barre [data-quitter]').isDisabled()), 'retour : Quitter est à nouveau possible');
  check((await p.evaluate(() => document.documentElement.dataset.mode)) === 'clair', 'retour : thème clair posé');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-retour-1280-clair.png') });
  // Mon prochain coup efface le message.
  await p.click('.uno-fan-carte button.jouable >> nth=0');
  await sleep(600);
  check((await p.locator('.uno-robot-zone .rb-msg').count()) === 0, 'retour : le message part avec mon premier coup');
  await p.close();

  p = suivre(await ouvrir(browser, RETOUR, { reponse: { tours: 0, resume: null } }, true));
  await p.waitForFunction(() => document.querySelector('.uno-robot-zone .rb-msg.is-moi')?.textContent.includes('repris'), null, { timeout: 8000 }).catch(() => {});
  check((await message(p)) === 'Tu as repris ta place. Le robot n’a pas eu à jouer pour toi.', 'retour sans coup du robot : texte');
  check(!(await hscroll(p)), 'retour au téléphone : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-retour-390.png') });
  await p.close();

  /* ---------- 3 tours manqués pendant que la table est ouverte : un bouton, rien de jouable ---------- */
  p = suivre(await ouvrir(browser, MANQUES));
  await p.waitForSelector('.uno-fan-carte button', { timeout: 8000 });
  await p.evaluate(() => { window.__ABSENT = true; });
  await relire(p);
  await p.waitForSelector('[data-reprendre]', { timeout: 8000 }).catch(() => {});
  check((await nbRpc(p, 'hg_uno_reprendre')) === 0, '3 manqués : pas de reprise sans geste de ma part');
  check((await message(p)) === 'Tu as manqué 3 tours : un robot joue ta main. Reprends ta place pour rejouer toi-même.', '3 manqués : message');
  check((await p.locator('[data-reprendre]').innerText()) === 'Reprendre ma place' && (await p.locator('[data-reprendre]').boundingBox())?.height >= 44, '3 manqués : bouton de 44 px');
  check((await p.locator('.uno-fan-carte button.jouable').count()) === 0 && await p.locator('[data-pioche]').isDisabled(), '3 manqués : ni carte jouable ni pioche');
  check(await p.locator('.uno-barre [data-quitter]').isDisabled(), '3 manqués : Quitter éteint');
  await p.click('[data-reprendre]');
  await p.waitForFunction(() => document.querySelector('.uno-robot-zone .rb-msg')?.textContent.includes('repris'), null, { timeout: 8000 }).catch(() => {});
  check((await nbRpc(p, 'hg_uno_reprendre')) === 1 && (await message(p)) === 'Tu as repris ta place. Le robot n’a pas eu à jouer pour toi.', '3 manqués : le bouton reprend la place');
  check((await p.locator('.uno-fan-carte button.jouable').count()) > 0, '3 manqués : ma main est à nouveau jouable');
  await p.close();

  /* ---------- Accueil du Uno : ma partie tenue par le robot ---------- */
  const LIGNE = { code: CODE, nom: 'Uno du vendredi', statut: 'en_cours', inscrits: 4, mes_cartes: 6, tour_pseudo: 'Chloé', mon_tour: false, robot_depuis: il_y_a(4) };
  p = suivre(await openPage(browser, { page: 'uno', scenario: { ...MEMBRE, salon: 'uno' }, init: init(null, { mesParties: [LIGNE] }) }));
  await p.waitForSelector('.uno-acc-ligne', { timeout: 8000 });
  check((await p.locator('.uno-acc-ligne .uno-acc-sous').innerText()) === 'En cours · un robot joue pour toi depuis 4 min · il te reste 6 cartes', 'accueil : sous-titre');
  check((await p.locator('.uno-acc-etiquette.rb-etiq').innerText()).trim() === 'Robot' && (await p.locator('.uno-acc-etiquette.rb-etiq svg').count()) === 1, 'accueil : étiquette Robot avec son icône');
  check(/^Reprendre ma place\s+Uno du vendredi$/.test((await p.locator('.uno-acc-ligne .uno-acc-bouton').textContent()).trim()) && (await p.locator('.uno-acc-ligne .uno-acc-bouton').getAttribute('href')) === `#partie/${CODE}`, 'accueil : « Reprendre ma place » vers la table');
  check((await p.locator('.uno-acc-ligne .uno-acc-bouton').boundingBox())?.height >= 44, 'accueil : cible de 44 px');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-accueil-1280.png') });
  await p.close();

  /* ---------- Page Jeux : barre « Reprendre ma partie » ---------- */
  const JX = { espace: 'uno', jeu: 'uno', nom_jeu: 'Uno', code: CODE, nom: 'Uno du vendredi', statut: 'en_cours', inscrits: 4, mes_cartes: 6, tour_pseudo: 'Chloé', a_toi: false, robot_depuis: il_y_a(4) };
  p = suivre(await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux.mjs', width: 390, height: 844, mobile: true, scenario: { mesParties: [JX] } }));
  await p.waitForSelector('.rp .rp-ligne', { timeout: 8000 });
  check((await p.locator('.rp-sous').innerText()) === 'Uno · En cours · un robot joue pour toi depuis 4 min · il te reste 6 cartes', 'page Jeux : sous-titre');
  check((await p.locator('.rp-etiquette.rb-rp').innerText()) === 'Robot' && await p.locator('.rp-ligne').evaluate((e) => e.classList.contains('is-tour')), 'page Jeux : étiquette Robot, ligne mise en avant');
  check(/^Reprendre ma place/.test((await p.locator('.rp-bouton').textContent()).trim()) && await p.locator('.rp-bouton').evaluate((e) => e.classList.contains('btn-sand')), 'page Jeux : bouton « Reprendre ma place »');
  check(!(await hscroll(p)), 'page Jeux au téléphone : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-jeux-390.png') });
  await p.close();

  /* ---------- Fin de partie ---------- */
  p = suivre(await ouvrir(browser, FIN));
  await p.waitForSelector('.uno-tableau', { timeout: 8000 });
  const ligneBruno = p.locator('.uno-tableau tbody tr', { hasText: 'Bruno' });
  check((await ligneBruno.locator('.rb-tag').innerText()) === 'robot', 'fin : étiquette robot dans le tableau');
  check((await p.locator('.rb-note').innerText()) === 'Bruno est parti : un robot a joué ses 9 derniers tours. Sa main ne gagne ni Paillettes ni victoire.', 'fin : note sous le tableau');
  check((await p.locator('.uno-fin-recompense p').innerText()).startsWith('180 Paillettes gagnées'), 'fin : mes gains intacts');
  check((await p.locator('[data-rejouer]').count()) === 1, 'fin : revanche proposée à celle qui est restée');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-fin-1280.png'), fullPage: true });
  await p.close();

  p = suivre(await ouvrir(browser, FIN_PARTI, { mode: 'clair' }, true));
  await p.waitForSelector('.uno-fin-recompense', { timeout: 8000 });
  check((await p.locator('.uno-fin-recompense p').innerText()) === 'Aucune Paillette : tu n’étais pas revenu à la fin, le robot a fini la partie à ta place.', 'fin, parti : texte des gains');
  check((await p.locator('.uno-fin-pailles.rb-zero').innerText()) === '+0' && (await p.locator('.uno-fin-pailles').getAttribute('aria-label')) === '0 Paillette', 'fin, parti : +0');
  check((await p.locator('[data-rejouer]').count()) === 0 && (await p.locator('.uno-fin-actions a').count()) === 1, 'fin, parti : pas de revanche, retour à l’accueil');
  check((await p.locator('.rb-note').count()) === 2, 'fin, parti : une note par place tenue par le robot');
  check(!(await hscroll(p)), 'fin au téléphone : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'uno-robot-fin-390-clair.png'), fullPage: true });
  await p.close();

  p = suivre(await ouvrir(browser, FIN_ROBOT));
  await p.waitForSelector('.uno-fin', { timeout: 8000 });
  check((await p.locator('.uno-titre').innerText()) === 'Personne ne gagne : le robot a vidé la main de Bruno.', 'fin, robot gagnant : titre');
  check((await p.locator('.uno-fin-recompense p').innerText()).startsWith('50 Paillettes gagnées'), 'fin, robot gagnant : ma participation reste');
  await p.close();

  check(erreurs.length === 0, `aucune erreur JS (${erreurs.join(' | ')})`);
  await browser.close();
  finish();
})();
