// Parcours : bouton Quitter commun et fenêtres de départ (commun/quitter.js, ui-confirm.js, annuler = « Rester »).
// Composant : allure, icône, échappement, choix de la phrase selon l'état. Une table par famille : le bon mot sur le bouton, la bonne
// fenêtre et le bon texte, « Rester » n'envoie rien, confirmer envoie le départ. Uno gagne un bouton en cours de partie (icône seule au
// téléphone, nom lisible par les lecteurs d'écran). Duel par code : aucune fenêtre. Loup-Garou en cours : aucun bouton.
// Plateaux : joueur parti, plus d'action proposée (la fermeture côté serveur, migration 198, est testée en SQL : bancs/plateaux/t_socle.sql).
// Quitter reste éteint après le départ. Un départ confirmé pendant une action n'est pas perdu (Uno, Nom de code). Invité : sortie claire
// après son départ (Uno, Nom de code, plateau, duel), plus de relecture. Spectateur d'un duel : pas de bouton Abandonner.
// Aucune fenêtre native sur les tables. Faux serveurs : fixtures/fake-salons.js, fake-sb-plateaux-cartes.mjs, fake-sb-duels-plateaux.mjs,
// fake-sb-catan.mjs, fake-sb-pictionary.mjs.
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, log, sleep, chromium, FIXTURES, ROOT, PREFIX } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const MOI = U(2);
const SALONS = fs.readFileSync(path.join(FIXTURES, 'fake-salons.js'), 'utf8');
const PAGES = ['uno', 'nom-de-code', 'loup-garou', 'duels'].map((slug) => ({ slug, label: slug, mode: 'membres', in_nav: false, sort: 99 }));
const MEMBRE = { uid: MOI, pagesExtra: PAGES };
const salle = `(e) => { const p = e.partie; p.statut = 'attente'; p.tour = null; p.tour_fin = null; p.started_at = null; e.main = [];
  e.joueurs.forEach((j, i) => { j.pret = i !== 2; j.nb_cartes = 0; }); e.moi.hote = true; p.hote = e.moi.user_id; return e; }`;
const texteDe = { salle: 'Tu peux revenir avec le code tant que la partie n’a pas commencé et qu’il reste une place.' };

/** Script injecté : fake-salons.js, puis état retouché par patch (texte d'une fonction) et réponses aux départs. */
const initSalon = (patch) => ({ content: `${SALONS};(() => {
  const patch = ${patch || '(e) => e'}; const prev = window.__FAKE_RPC;
  window.__FAKE_RPC = async (fn, a) => {
    if (/_quitter$/.test(fn)) return { data: null, error: null };
    const r = await prev(fn, a);
    return r && /_etat$/.test(fn) && r.data ? { data: patch(JSON.parse(JSON.stringify(r.data))), error: null } : r;
  };
})();` });

const ouvrirSalon = (browser, salon, page, code, patch, o = {}) => openPage(browser, { page, hash: `#partie/${code}`, width: 1280, height: 900,
  scenario: { ...MEMBRE, salon }, init: initSalon(patch), ...o });

/** Duel de fake-salons.js, retouché. */
const ouvrirDuel = (browser, patch, o = {}) => openPage(browser, { page: 'duels', hash: '#partie/HGEC-1001', fixture: 'fake-sb-duels-plateaux.mjs', width: 1280, height: 900,
  scenario: { ...MEMBRE, salon: 'duel-echecs' },
  init: { content: `${SALONS};(() => { const e = window.__DUELS.etat; (${patch})(e); window.__DUELS.rpc = { hg_duel_quitter: () => null }; })();` }, ...o });

const ouvrirPlateau = (browser, jeu, page, code, patch, o = {}) => openPage(browser, { page, hash: `#partie/${code}`, fixture: 'fake-sb-plateaux-cartes.mjs', width: 1280, height: 900,
  scenario: { jeu }, init: { content: `window.__PATCH = ${patch || '(e) => e'};` }, ...o });

const nbRpc = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn).length;
const BOITE = 'dialog.hg-dialog[open]';

/** Aucune fenêtre native : ne doit jamais s'ouvrir sur une table. */
const surveiller = (p) => { p.__natives = 0; p.on('dialog', (d) => { p.__natives++; d.dismiss().catch(() => {}); }); return p; };

/**
 * Le bouton porte le bon mot ; la fenêtre dit le bon texte ; « Rester » n'envoie rien ; confirmer envoie le départ.
 * @param {string} rpc fonction attendue ; sel : bouton de la table ; cas : { titre, texte, ok, mot } (mot : libellé du bouton).
 */
async function parcours(p, nom, sel, cas, rpc) {
  surveiller(p);
  await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
  const b = p.locator(sel).first();
  check((await b.textContent()).trim() === (cas.mot || cas.ok), `${nom} : le bouton dit « ${cas.mot || cas.ok} »`);
  check((await b.locator('svg').count()) === 1 && (await b.evaluate((e) => e.classList.contains('qt-btn'))), `${nom} : composant commun, avec son icône`);
  await b.click();
  await p.waitForSelector(BOITE, { timeout: 3000 }).catch(() => {});
  const lire = (s) => p.locator(`${BOITE} ${s}`).innerText().catch(() => '');
  check((await lire('.dialog-title')) === cas.titre, `${nom} : titre « ${cas.titre} »`);
  check((await lire('p')) === cas.texte, `${nom} : texte exact`);
  check((await lire('.btn-ghost')) === 'Rester' && (await lire('.btn-danger')) === cas.ok, `${nom} : « Rester » et « ${cas.ok} »`);
  check(await p.evaluate(() => document.activeElement?.textContent === 'Rester'), `${nom} : le focus part sur « Rester »`);
  await p.click(`${BOITE} .btn-ghost`);
  await sleep(150);
  check((await p.locator(BOITE).count()) === 0 && (await nbRpc(p, rpc)) === 0, `${nom} : « Rester » ferme sans rien envoyer`);
  await b.click();
  await p.waitForSelector(BOITE, { timeout: 3000 }).catch(() => {});
  await p.click(`${BOITE} .btn-danger`);
  await sleep(400);
  check((await nbRpc(p, rpc)) === 1, `${nom} : confirmer envoie ${rpc}`);
  check(p.__natives === 0, `${nom} : aucune fenêtre native`);
  await p.context().close();
}

(async () => {
  const browser = await chromium.launch();

  // ----- Le composant et le choix de la phrase -----
  let p = await openPage(browser, { page: 'jeux', scenario: MEMBRE, width: 1280, height: 900 });
  const r = await p.evaluate(async (racine) => {
    const q = await import(`${racine}/assets/commun/quitter.js`);
    const zone = document.createElement('div');
    zone.innerHTML = q.boutonQuitter('Dehors <b>', { classe: 'x', attrs: 'data-quitter' });
    document.body.append(zone);
    const b = zone.firstChild; const st = getComputedStyle(b);
    const j = (id, pseudo, place, x = {}) => ({ user_id: id, pseudo, place, ...x });
    const moi = { user_id: 'm', hote: true };
    const hote = q.departSalle({ moi, joueurs: [j('m', 'Moi', 1), j('i', 'Invité', 2, { invite: true }), j('c', 'Chloé', 4), j('b', 'Bruno', 3)] });
    const seul = q.departSalle({ moi, joueurs: [j('m', 'Moi', 1), j('i', 'Invité', 2, { invite: true })] });
    const lg = q.departSalle({ moi, joueurs: [j('m', 'Moi', 1), j('b', 'Bruno', 2)] }, { annuleTout: true });
    const lgJ = q.departSalle({ moi: { user_id: 'm', hote: false }, joueurs: [] }, { annuleTout: true });
    const duel = (p, js) => q.departDuel({ moi: { user_id: 'm' }, partie: p, joueurs: [j('m', 'Moi', 1, { manches: 0 }), j('a', 'Alice', 2, { manches: 0 }), ...js] }).texte;
    const eq = (n, x = {}) => Array.from({ length: n }, (_, i) => j(`j${i}`, 'X', i, { equipe: 'jaune', ...x }));
    const ndc = (js) => q.departNomDeCode({ moi: { user_id: 'm', equipe: 'jaune' }, joueurs: js }).texte;
    return {
      classe: b.className, nom: b.querySelector('span').textContent, html: zone.innerHTML.includes('<b>'), icone: b.querySelectorAll('svg').length,
      attr: b.hasAttribute('data-quitter'), haut: Math.round(b.getBoundingClientRect().height), espace: st.whiteSpace, type: b.type,
      hote, seul, lg, lgJ, defi: q.departDefi({ defie_pseudo: 'Léo' }),
      avant: duel({ manche: 1, robot: 0 }, []), nul: duel({ manche: 1, robot: 0 }, [{ user_id: 'z', nuls: 1 }]), apres: duel({ manche: 2, robot: 0 }, []),
      robot: duel({ manche: 2, robot: 2 }, []), invite: duel({ manche: 2, robot: 0 }, [{ user_id: 'z', invite: true }]),
      ndc3: ndc(eq(3)), ndc2: ndc(eq(2)), ndcParti: ndc([...eq(2), ...eq(1, { parti: true })]),
      sans: q.departNomDeCode({ moi: { user_id: 'm', equipe: null }, joueurs: [] }).texte,
    };
  }, PREFIX);
  check(r.classe === 'btn btn-ghost qt-btn x' && r.attr && r.type === 'button', 'composant : classes et attributs');
  check(r.nom === 'Dehors <b>' && !r.html, 'composant : le libellé est échappé');
  check(r.icone === 1 && r.haut >= 44 && r.espace === 'nowrap', 'composant : une icône, 44 px, sur une ligne');
  check(r.hote.ok === 'Quitter la salle' && r.hote.texte === 'Bruno devient l’hôte et la partie reste ouverte.', 'salle, hôte : le premier membre par place, jamais un invité');
  check(r.seul.ok === 'Annuler la partie' && r.seul.texte === 'Aucun autre membre ne peut devenir hôte : la partie est annulée.', 'salle, hôte sans membre : annulée');
  check(r.lg.ok === 'Annuler la partie' && r.lg.texte === 'La partie est annulée pour tout le monde.', 'Loup-Garou, hôte : annulée pour tout le monde');
  check(r.lgJ.ok === 'Quitter la salle' && r.lgJ.texte === texteDe.salle, 'Loup-Garou, joueur : quitter la salle');
  check(r.defi.titre === 'Annuler le défi ?' && r.defi.texte === 'Léo ne pourra plus l’accepter.', 'défi : nomme le membre défié');
  check(r.avant === 'Alice gagne le duel. Aucune manche n’est terminée : personne ne reçoit de Paillettes.', 'duel, aucune manche finie');
  check(r.apres === 'Alice gagne le duel. Tu ne gardes que les Paillettes de participation.', 'duel, une manche finie');
  check(r.nul === r.apres, 'duel : une manche nulle compte comme finie');
  check(r.robot === 'Alice gagne le duel. Contre le robot, personne ne reçoit de Paillettes.', 'duel contre le robot : jamais de Paillettes');
  check(r.invite === 'Alice gagne le duel. Avec un invité, personne ne reçoit de Paillettes.', 'duel avec un invité : jamais de Paillettes');
  check(r.ndc3.startsWith('Tu ne peux plus revenir') && r.ndc3.includes('espion'), 'Nom de code, 3 joueurs dans mon équipe : pas de forfait, espion remplacé');
  check(r.ndc2.includes('forfait'), 'Nom de code, 2 joueurs dans mon équipe : forfait');
  check(r.ndcParti.includes('forfait'), 'Nom de code : un joueur déjà parti ne compte plus');
  check(!r.sans.includes('forfait'), 'Nom de code, sans équipe : pas de forfait');
  await p.context().close();

  // ----- Uno -----
  const QT = { uno: { titre: 'Quitter la table ?', ok: 'Quitter la table', texte: 'Tes cartes repartent sous la pioche, tu ne peux plus revenir dans cette partie et tu ne reçois pas de Paillettes.' } };
  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242');
  await parcours(p, 'Uno en cours', '.uno-barre [data-quitter]', QT.uno, 'hg_uno_quitter');

  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', null, { width: 390, height: 844, mobile: true });
  await p.waitForSelector('.uno-barre [data-quitter]', { timeout: 8000 }).catch(() => {});
  const tel = p.locator('.uno-barre [data-quitter]');
  const boite = await tel.boundingBox();
  check(boite && boite.width >= 44 && boite.height >= 44, 'Uno au téléphone : cible de 44 px');
  check((await tel.locator('span').boundingBox())?.width <= 1, 'Uno au téléphone : icône seule');
  check((await p.getByRole('button', { name: 'Quitter la table' }).count()) === 1, 'Uno au téléphone : nom lu par les lecteurs d’écran');
  check(!(await hscroll(p)), 'Uno au téléphone : pas de défilement horizontal');
  await tel.click();
  await p.waitForSelector(BOITE, { timeout: 3000 }).catch(() => {});
  const large = await p.locator(BOITE).boundingBox();
  check(large && large.width <= 390, 'Uno au téléphone : la fenêtre tient dans l’écran');
  await p.context().close();

  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', '(e) => { e.joueurs[0].exclu = true; return e; }');
  await p.waitForSelector('.uno-barre [data-quitter]', { timeout: 8000 }).catch(() => {});
  check(await p.locator('.uno-barre [data-quitter]').isDisabled(), 'Uno : déjà exclu, le bouton est désactivé');
  await p.context().close();

  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', `(e) => { (${salle})(e); e.moi.hote = false; e.partie.hote = e.joueurs[1].user_id; return e; }`);
  await parcours(p, 'Salle Uno, joueur', '[data-quitter]', { titre: 'Quitter la salle ?', texte: texteDe.salle, ok: 'Quitter la salle' }, 'hg_uno_quitter');
  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', salle);
  await parcours(p, 'Salle Uno, hôte avec successeur', '[data-quitter]', { titre: 'Quitter la salle ?', texte: 'Bruno devient l’hôte et la partie reste ouverte.', ok: 'Quitter la salle' }, 'hg_uno_quitter');
  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', `(e) => { (${salle})(e); e.joueurs = e.joueurs.slice(0, 1); return e; }`);
  await parcours(p, 'Salle Uno, hôte seul', '[data-quitter]', { titre: 'Annuler la partie ?', texte: 'Aucun autre membre ne peut devenir hôte : la partie est annulée.', ok: 'Annuler la partie' }, 'hg_uno_quitter');

  // ----- Départ pendant la fenêtre : la salle vient de démarrer, rien ne part -----
  p = surveiller(await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', `(e) => { (${salle})(e); e.moi.hote = false; e.partie.hote = e.joueurs[1].user_id;
    if (window.__LANCEE) { e.partie.statut = 'en_cours'; } return e; }`));
  await p.waitForSelector('[data-quitter]', { timeout: 8000 }).catch(() => {});
  await p.click('[data-quitter]');
  await p.waitForSelector(BOITE, { timeout: 3000 }).catch(() => {});
  await p.evaluate(() => { window.__LANCEE = true; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(700);
  await p.click(`${BOITE} .btn-danger`, { force: true }).catch(() => {});
  await sleep(300);
  check((await nbRpc(p, 'hg_uno_quitter')) === 0, 'Salle Uno : partie lancée pendant la fenêtre, le départ annoncé n’est pas envoyé');
  await p.context().close();

  // ----- Plateaux : table de chaque texte, salle, joueur parti -----
  const PL = { titre: 'Quitter la partie ?', ok: 'Quitter la partie', texte: 'Le jeu joue pour toi jusqu’à la fin et tu ne reçois pas de Paillettes.' };
  p = await ouvrirPlateau(browser, 'blackjack', 'blackjack', 'HGBJK-1234');
  await parcours(p, 'Blackjack', '.bj-barre [data-quitter]', PL, 'hg_plat_quitter');
  p = await ouvrirPlateau(browser, 'poker', 'poker', 'HGPOK-1234');
  await parcours(p, 'Poker', '[data-quitter]', { ...PL, texte: 'Tes jetons restent à la table, le jeu joue pour toi jusqu’à la fin et tu ne reçois pas de Paillettes.' }, 'hg_plat_quitter');
  p = await openPage(browser, { page: 'pictionary', fixture: 'fake-sb-pictionary.mjs', hash: '#partie/HGPIC-1234', width: 1280, height: 900, scenario: {} });
  await parcours(p, 'Pictionary', '.pi-barre [data-quitter]', PL, 'hg_plat_quitter');
  p = await openPage(browser, { page: 'catan', fixture: 'fake-sb-catan.mjs', hash: '#partie/HGCAT-1234', width: 1280, height: 900, scenario: { phase: 'action' } });
  await parcours(p, 'Catan', '.ct-barre [data-quitter]', PL, 'hg_plat_quitter');

  p = await ouvrirPlateau(browser, 'blackjack', 'blackjack', 'HGBJK-1234', salle.replace('e.main = [];', ''));
  await parcours(p, 'Salle de plateau, hôte avec successeur', '[data-quitter]', { titre: 'Quitter la salle ?', texte: 'Alice devient l’hôte et la partie reste ouverte.', ok: 'Quitter la salle' }, 'hg_plat_quitter');

  p = await ouvrirPlateau(browser, 'blackjack', 'blackjack', 'HGBJK-1234', '(e) => { e.joueurs.find((j) => j.user_id === e.moi.user_id).parti = true; return e; }');
  await p.waitForSelector('.bj-barre [data-quitter]', { timeout: 8000 }).catch(() => {});
  await sleep(300);
  check(await p.locator('.bj-barre [data-quitter]').isDisabled(), 'Plateau, joueur parti : Quitter désactivé');
  check(await p.locator('[data-miser]').isDisabled(), 'Plateau, joueur parti : plus d’action proposée, le retour est fermé');
  await p.context().close();

  // ----- Nom de code -----
  const NDC_T = { titre: 'Quitter la partie ?', ok: 'Quitter la partie' };
  p = await ouvrirSalon(browser, 'nom-de-code', 'nom-de-code', 'HGNDC-4242');
  await parcours(p, 'Nom de code, équipe de 2 : forfait', '.ndc-bouton-quitter', { ...NDC_T, texte: 'Ton équipe n’a plus assez de joueurs après ton départ : elle perd par forfait. Tu ne reçois pas de Paillettes.' }, 'hg_ndc_quitter');
  p = await ouvrirSalon(browser, 'nom-de-code', 'nom-de-code', 'HGNDC-4242', "(e) => { e.joueurs.push({ ...e.joueurs[1], user_id: 'x', pseudo: 'Zoé', espion: false }); return e; }");
  await parcours(p, 'Nom de code, équipe de 3', '.ndc-bouton-quitter', { ...NDC_T, texte: 'Tu ne peux plus revenir et tu ne reçois pas de Paillettes. Si tu es l’espion, un autre joueur de ton équipe prend ta place.' }, 'hg_ndc_quitter');
  p = await ouvrirSalon(browser, 'nom-de-code', 'nom-de-code', 'HGNDC-4242', null, { width: 390, height: 844, mobile: true });
  await p.waitForSelector('.ndc-bouton-quitter', { timeout: 8000 }).catch(() => {});
  check((await p.getByRole('button', { name: 'Quitter la partie' }).count()) === 1, 'Nom de code au téléphone : nom lu par les lecteurs d’écran');
  check(!(await hscroll(p)), 'Nom de code au téléphone : pas de défilement horizontal');
  await p.context().close();
  p = await ouvrirSalon(browser, 'nom-de-code', 'nom-de-code', 'HGNDC-4242', salle);
  await parcours(p, 'Salle Nom de code, hôte', '[data-act="quitter"]', { titre: 'Quitter la salle ?', texte: 'Bruno devient l’hôte et la partie reste ouverte.', ok: 'Quitter la salle' }, 'hg_ndc_quitter');

  // ----- Loup-Garou -----
  const lgSalle = `(e) => { (${salle})(e); return e; }`;
  p = await ouvrirSalon(browser, 'loup-garou', 'loup-garou', 'HGLG-4242', lgSalle);
  await parcours(p, 'Salle Loup-Garou, hôte', '[data-quitter]', { titre: 'Annuler la partie ?', texte: 'La partie est annulée pour tout le monde.', ok: 'Annuler la partie' }, 'hg_lg_quitter');
  p = await ouvrirSalon(browser, 'loup-garou', 'loup-garou', 'HGLG-4242', `(e) => { (${salle})(e); e.moi.hote = false; e.partie.hote = e.joueurs[1].user_id; return e; }`);
  await parcours(p, 'Salle Loup-Garou, joueur', '[data-quitter]', { titre: 'Quitter la salle ?', texte: texteDe.salle, ok: 'Quitter la salle' }, 'hg_lg_quitter');
  p = await ouvrirSalon(browser, 'loup-garou', 'loup-garou', 'HGLG-4242');
  await p.waitForSelector('.lg-pl-table', { timeout: 8000 }).catch(() => {});
  check((await p.locator('.lg-pl-table').count()) === 1 && (await p.locator('.qt-btn, [data-quitter]').count()) === 0, 'Loup-Garou en cours : aucun bouton Quitter');
  await p.context().close();

  // ----- Duels -----
  const AB = { titre: 'Abandonner le duel ?', ok: 'Abandonner' };
  p = await ouvrirDuel(browser, '() => {}');
  await parcours(p, 'Duel, aucune manche finie', '[data-abandon]', { ...AB, texte: 'Alice gagne le duel. Aucune manche n’est terminée : personne ne reçoit de Paillettes.' }, 'hg_duel_quitter');
  p = await ouvrirDuel(browser, '(e) => { e.partie.format = 3; e.partie.manche = 2; e.joueurs[1].manches = 1; }');
  await parcours(p, 'Duel, une manche finie', '[data-abandon]', { ...AB, texte: 'Alice gagne le duel. Tu ne gardes que les Paillettes de participation.' }, 'hg_duel_quitter');

  const attente = (x) => `(e) => { const p = e.partie; p.statut = 'attente'; p.tour = null; p.tour_fin = null; ${x} }`;
  p = await ouvrirDuel(browser, attente(`p.defie = '${U(3)}'; p.defi_expire = new Date(Date.now() + 240000).toISOString(); e.defie_pseudo = 'Léo';`));
  await parcours(p, 'Duel, défi envoyé', '[data-annuler]', { titre: 'Annuler le défi ?', texte: 'Léo ne pourra plus l’accepter.', ok: 'Annuler le défi' }, 'hg_duel_quitter');

  p = surveiller(await ouvrirDuel(browser, attente('p.defie = null;')));
  await p.waitForSelector('[data-annuler]', { timeout: 8000 }).catch(() => {});
  check((await p.locator('[data-annuler]').evaluate((e) => e.classList.contains('qt-btn'))), 'Duel par code : même composant');
  await p.click('[data-annuler]');
  await sleep(300);
  check((await p.locator(BOITE).count()) === 0 && (await nbRpc(p, 'hg_duel_quitter')) === 1 && p.__natives === 0, 'Duel par code : part sans fenêtre');
  await p.context().close();

  // ----- Spectateur d'un duel : .qt-btn ne doit pas l'emporter sur hidden -----
  p = await ouvrirDuel(browser, '(e) => { e.moi.joue = false; e.moi.spectateur = true; }');
  await p.waitForSelector('[data-abandon]', { state: 'attached', timeout: 8000 }).catch(() => {});
  await sleep(300);
  check((await p.locator('[data-abandon]').count()) === 1 && !(await p.locator('[data-abandon]').isVisible()), 'Duel, spectateur : pas de bouton Abandonner');
  await p.context().close();

  // ----- Après le départ, Quitter reste éteint : envoyer() le rallumait après la relecture -----
  p = await ouvrirPlateau(browser, 'blackjack', 'blackjack', 'HGBJK-1234');
  await p.waitForSelector('.bj-barre [data-quitter]', { timeout: 8000 }).catch(() => {});
  await p.click('.bj-barre [data-quitter]');
  await p.click(`${BOITE} .btn-danger`);
  await sleep(500);
  check((await nbRpc(p, 'hg_plat_quitter')) === 1 && await p.locator('.bj-barre [data-quitter]').isDisabled(), 'Plateau : Quitter reste éteint après le départ');
  await p.context().close();
  p = await openPage(browser, { page: 'catan', fixture: 'fake-sb-catan.mjs', hash: '#partie/HGCAT-1234', width: 1280, height: 900, scenario: { phase: 'action' },
    init: { content: `window.__PATCH = (e) => { e.joueurs.find((j) => j.user_id === e.moi.user_id).parti = true; return e; };` } });
  await p.waitForSelector('.ct-barre [data-quitter]', { timeout: 8000 }).catch(() => {});
  await sleep(300);
  check(await p.locator('.ct-barre [data-quitter]').isDisabled(), 'Catan, joueur parti : Quitter désactivé');
  await p.context().close();

  // ----- Départ confirmé pendant une action : il n'est pas perdu -----
  const lent = (fnLente) => ({ content: `${SALONS};(() => {
    const prev = window.__FAKE_RPC;
    window.__FAKE_RPC = async (fn, a) => {
      if (/_quitter$/.test(fn)) return { data: null, error: null };
      if (fn === '${fnLente}') { await new Promise((ok) => { setTimeout(ok, 1200); }); return { data: null, error: null }; }
      return prev(fn, a);
    };
  })();` });
  p = await ouvrirSalon(browser, 'uno', 'uno', 'HGUNO-4242', null, { init: lent('hg_uno_piocher') });
  await p.waitForSelector('[data-pioche]:not([disabled])', { timeout: 8000 }).catch(() => {});
  await p.click('[data-pioche]');
  await p.click('.uno-barre [data-quitter]');
  await p.click(`${BOITE} .btn-danger`);
  check((await nbRpc(p, 'hg_uno_piocher')) === 1, 'Uno : action en cours quand le départ est confirmé');
  await sleep(1800);
  check((await nbRpc(p, 'hg_uno_quitter')) === 1, 'Uno : le départ part quand l\'action est finie');
  await p.context().close();
  p = await ouvrirSalon(browser, 'nom-de-code', 'nom-de-code', 'HGNDC-4242', null, { init: lent('hg_ndc_proposer') });
  await p.waitForSelector('button.ndc-carte:not([disabled])', { timeout: 8000 }).catch(() => {});
  await p.locator('button.ndc-carte').nth(10).click();
  await p.click('.ndc-bouton-quitter');
  await p.click(`${BOITE} .btn-danger`);
  check((await nbRpc(p, 'hg_ndc_proposer')) >= 1, 'Nom de code : action en cours quand le départ est confirmé');
  await sleep(1800);
  check((await nbRpc(p, 'hg_ndc_quitter')) === 1, 'Nom de code : le départ part quand l\'action est finie');
  await p.context().close();

  // ----- Invité : après son départ, son jeton est oublié et la table ne reçoit plus rien -----
  /** Le faux serveur répond à <jeu>_invite comme le vrai : sans jeton, plus d'état. */
  const sortieInvite = async (p, nom, sel, retour) => {
    surveiller(p);
    await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
    await p.click(sel);
    await p.click(`${BOITE} .btn-danger`);
    await p.waitForSelector('[data-sortie-invite]', { timeout: 4000 }).catch(() => {});
    check((await p.locator('[data-sortie-invite] h1').innerText().catch(() => '')).startsWith('Tu as quitté'), `${nom}, invité : écran de sortie`);
    check((await p.locator(sel).count()) === 0, `${nom}, invité : plus de table ni de bouton actif`);
    check((await p.locator('[data-sortie-invite] a').getAttribute('href').catch(() => '')) === `/pages/compte/compte.html?next=${encodeURIComponent(retour)}`, `${nom}, invité : lien de sortie`);
    const lus = async () => (await p.evaluate(() => window.__ETATS || 0));
    const n = await lus();
    await sleep(2600);
    check((await lus()) === n, `${nom}, invité : plus de relecture`);
    await p.context().close();
  };
  const reponseInvite = (etatDe) => `async (a) => { const repond = (data) => ({ data, error: null });
    if (a.p_action === 'etat') { window.__ETATS = (window.__ETATS || 0) + 1;
      if (!a.p_jeton) return { data: null, error: { message: 'Invitation invalide.' } };
      return repond(await (${etatDe})()); }
    return repond(a.p_action === 'messages' ? [] : null); }`;
  const invite = (fn, code, etatDe, avant = '') => ({ content: `${avant};(() => {
    localStorage.setItem('${fn}:${code}', 'jeton');
    const prev = window.__FAKE_RPC; const repondre = ${reponseInvite(etatDe)};
    window.__FAKE_RPC = async (f, a) => (f === '${fn}' ? repondre(a) : prev?.(f, a));
  })();` });
  const parSalon = (fn) => `async () => (await window.__ETAT_SALON('${fn}'))`;
  const avecSalon = `${SALONS};(() => { const prev = window.__FAKE_RPC; window.__ETAT_SALON = async (fn) => (await prev(fn, {})).data; })();`;
  p = await openPage(browser, { page: 'uno', hash: '#partie/HGUNO-4242', width: 1280, height: 900, scenario: { ...MEMBRE, salon: 'uno', guest: true },
    init: invite('hg_uno_invite', 'HGUNO-4242', parSalon('hg_uno_etat'), avecSalon) });
  await sortieInvite(p, 'Uno', '.uno-barre [data-quitter]', '/pages/jeux/uno.html');
  p = await openPage(browser, { page: 'nom-de-code', hash: '#partie/HGNDC-4242', width: 1280, height: 900, scenario: { ...MEMBRE, salon: 'nom-de-code', guest: true },
    init: invite('hg_ndc_invite', 'HGNDC-4242', parSalon('hg_ndc_etat'), avecSalon) });
  await sortieInvite(p, 'Nom de code', '.ndc-bouton-quitter', '/pages/jeux/nom-de-code.html');
  p = await openPage(browser, { page: 'blackjack', hash: '#partie/HGBJK-1234', fixture: 'fake-sb-plateaux-cartes.mjs', width: 1280, height: 900, scenario: { jeu: 'blackjack', guest: true },
    init: invite('hg_plat_invite', 'HGBJK-1234', `async () => { const e = window.__CARTES.etat(); return { ...e, maintenant: new Date().toISOString(), moi: { user_id: '11111111-1111-4111-8111-111111111111', joue: true, hote: false, invite: true }, badges: [] }; }`) });
  await sortieInvite(p, 'Plateau', '.bj-barre [data-quitter]', '/pages/jeux/blackjack.html');
  p = await ouvrirDuel(browser, '() => {}', { scenario: { ...MEMBRE, salon: 'duel-echecs', guest: true },
    init: { content: `${SALONS};(() => { localStorage.setItem('hg_duel_invite:HGEC-1001', 'jeton'); const repondre = ${reponseInvite('async () => window.__DUELS.etat')};
      window.__FAKE_RPC = async (f, a) => (f === 'hg_duel_invite' ? repondre(a) : undefined); })();` } });
  await sortieInvite(p, 'Duel', '[data-abandon]', '/pages/jeux/duels.html');

  // ----- Plus aucune fenêtre native sur les tables -----
  const fichiers = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? fichiers(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const natifs = ['uno', 'duels', 'plateaux', 'nom-de-code', 'loup-garou']
    .flatMap((j) => fichiers(path.join(ROOT, 'assets', 'espaces', j)))
    .filter((f) => /(^|[^\w.])(window\.)?confirm\(/m.test(fs.readFileSync(f, 'utf8')));
  check(natifs.length === 0, `aucun confirm() natif dans les tables${natifs.length ? ` : ${natifs.join(', ')}` : ''}`);

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
