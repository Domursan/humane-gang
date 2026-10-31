require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours des fins de duels spéciaux (maquette validée, oct. 2026), sur les vraies vues, état écrit par le test :
//  BN1 Bataille navale : ma flotte s'enfonce (ma grille, même à la place 2), son « Coulé », bandeau sobre.
//  PC1 Pierre-feuille-ciseaux : les deux mains sur l'écran de fin (pièce neuve), ma main s'affaisse, S16, phrase du vrai lancer.
//  QE1 Qui est-ce ? : mon portrait désigné, S39, S16, vrai prénom ; ma mauvaise proposition ne désigne rien.
//  Partout : gagnant inchangé, spectateur et invité, rien ne rejoue sur un état déjà vu ni à l'ouverture d'un duel fini,
//  abandon sans effet de jeu, quitter ne laisse rien, mouvement réduit : état juste, sons conservés ; 390 px.
// Faux Supabase : fixtures/fake-sb-fins-qec.mjs.
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-fins-qec.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const BRUNO = U(3), ALICE = U(2);
const CODES = { bataille: 'HGBN-1234', pfc: 'HGPF-1234', quiestce: 'HGQE-1234' };
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

// Fréquences propres à chaque son. S26 (bataille-navale 3) : 277 ; S16 : 392, 330, 262 ; S39 (qui-est-ce 3) : 220 ; victoires : 1047, 1319.
const init = (e, jeu, plateau) => ({ content: `window.__FIN = { etat: ${JSON.stringify(e)}, plateau: ${JSON.stringify(plateau || null)}, delaiPlateau: 300 };
  window.__F = [];
  localStorage.setItem('hg_duel_invite:${CODES[jeu]}', 'jeton');
  (() => { const AC = window.AudioContext; if (!AC) return;
    const o = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { const n = o.call(this); const f = n.frequency; const s = f.setValueAtTime.bind(f);
      f.setValueAtTime = (v, t) => { window.__F.push(Math.round(v)); return s(v, t); }; return n; };
  })();` });

const jd = (id, pseudo, place, x = {}) => ({ user_id: id, pseudo, couleur: '#7E93C9', avatar_url: null, invite: false, robot: false, place, manches: 0, nuls: 0, coups: 0, essais: 0, trouve_en: null, fin: null, pret: true, radar: 0, rang: null, gagne: null, paillettes: 0, ...x });
const partie = (jeu, x) => ({ id: `id-${jeu}`, code: CODES[jeu], jeu, variante: jeu === 'quiestce' ? 'quartier' : 'classique', nom: { bataille: 'Bataille navale', pfc: 'Pierre-feuille-ciseaux', quiestce: 'Qui est-ce ?' }[jeu], statut: 'en_cours', hote: ME, defie: null, defi_expire: null, robot: 0, visibilite: 'publique', invites: 0, commence: 'moi', format: 1, t_coup: 30, options: {}, restant: null, manche: 1, phase: jeu === 'bataille' ? 'jeu' : null, grille: null, w: 10, h: 10, n: 0, petites: null, cible: null, tour: BRUNO, tour_fin: iso(30), premier: ME, nb_coups: 0, dernier: null, vainqueur: null, version: 1, historique: [], suite: null, forfait: null, abandon: null, ...x });
const etat = (jeu, p, js, x = {}) => ({ partie: partie(jeu, p), maintenant: iso(0), moi: { user_id: ME, joue: true, spectateur: false, defie: false, hote: true, invite: false, place: js.find((j) => j.user_id === ME)?.place ?? 1 }, joueurs: js, defie_pseudo: null, mastermind: null, bataille: null, quiestce: null, pfc: null, echecs: null, pions: {}, journal: [], ...x });
const duo = (g, place = 1, x = {}) => {
  const l = [jd(ME, 'Toi', place, { gagne: g === ME, manches: g === ME ? 1 : 0 }), jd(BRUNO, 'Bruno', 3 - place, { gagne: g === BRUNO, manches: g === BRUNO ? 1 : 0, ...x })];
  return place === 1 ? l : l.reverse();   // l'état range les joueurs par place, comme hg_duel_etat
};
const fin = (jeu, g, js, x = {}, p = {}) => etat(jeu, { statut: 'terminee', tour: null, tour_fin: null, vainqueur: g, version: 9, historique: [{ manche: 1, gagnant: g, coups: 5 }], ...p }, js, x);
const spect = { moi: { user_id: ALICE, joue: false, spectateur: true, defie: false, hote: false, invite: false, place: null } };
const inv = { moi: { user_id: ME, joue: true, spectateur: false, defie: false, hote: false, invite: true, place: 1 } };

/* ---------- Données de chaque jeu ---------- */
const suite = (d, n, pas = 1) => Array.from({ length: n }, (_, i) => d + i * pas);
const maFlotte = [['porte_avions', suite(12, 5)], ['cuirasse', suite(31, 4, 10)], ['croiseur', suite(34, 3, 10)], ['sous_marin', suite(71, 3)], ['torpilleur', suite(87, 2)]].map(([type, cases]) => ({ type, cases, coule: true }));
const saFlotte = [['porte_avions', suite(3, 5, 10)], ['cuirasse', suite(60, 4)], ['croiseur', suite(26, 3)], ['sous_marin', suite(58, 3, 10)], ['torpilleur', suite(95, 2)]].map(([type, cases]) => ({ type, cases, coule: true }));
const tir = (c, r, n = null) => ({ case: c, resultat: r, navire: n, valeur: null });
const tirsSur = (f) => [tir(0, 'eau'), ...f.flatMap((n) => n.cases.map((c, i) => tir(c, i === n.cases.length - 1 ? 'coule' : 'touche', n.type)))];
const bnFin = (perdu) => (perdu
  ? { flotte: [], ma_flotte: maFlotte, tirs: { [ME]: [tir(13, 'touche', 'porte_avions'), tir(44, 'eau')], [BRUNO]: tirsSur(maFlotte) }, coules: { [BRUNO]: saFlotte }, restants: { [ME]: [], [BRUNO]: ['porte_avions'] }, tirs_restants: null, contact: false, rejouer: true }
  : { flotte: [], ma_flotte: maFlotte, tirs: { [ME]: tirsSur(saFlotte), [BRUNO]: [tir(44, 'eau')] }, coules: { [BRUNO]: saFlotte }, restants: { [ME]: ['porte_avions'], [BRUNO]: [] }, tirs_restants: null, contact: false, rejouer: true });
const bnCours = { flotte: [], ma_flotte: maFlotte.map((n) => ({ ...n, coule: false })), tirs: { [ME]: [], [BRUNO]: [] }, coules: {}, restants: { [ME]: [], [BRUNO]: [] }, tirs_restants: null, contact: false, rejouer: true };

const lancer = (manche, moi, lui, gagnant) => ({ manche, [ME]: moi, [BRUNO]: lui, gagnant });
const pfcCours = { mon_choix: null, a_choisi: {}, lancers: [] };
const persos = [
  { id: 15, prenom: 'Paula', attributs: { cheveux: 'bruns', longs: true, lunettes: false, chapeau: 'aucun', barbe: false, boucles: false, yeux: 'bleus', peau: 2, haut: '#C4574B' } },
  { id: 22, prenom: 'Willy', attributs: { cheveux: 'blonds', longs: false, lunettes: true, chapeau: 'aucun', barbe: false, boucles: false, yeux: 'bleus', peau: 2, haut: '#4F9A6A' } },
];
const plateau = { persos, questions: [] };
const qeCours = { mon_perso: 15, perso_adverse: null, mes_baisses: [], restants_adverses: { [BRUNO]: 3 }, questions: [], question_en_attente: null, libres: true };
const qeFin = { ...qeCours, perso_adverse: { [ME]: 15, [BRUNO]: 22 } };
// Textes exacts de hg_duel__qec_deviner (migration 122), journal du plus récent au plus ancien.
const ligneBruno = { id: 9, user_id: BRUNO, type: 'devine', texte: 'Bruno pense que c\'est Paula : gagné !' };
const ligneMoi = { id: 9, user_id: ME, type: 'devine', texte: 'Toi pense que c\'est Paula : perdu, c\'était Willy.' };

const COURS = {
  bataille: (js, x = {}) => etat('bataille', {}, js, { bataille: bnCours, ...x }),
  pfc: (js, x = {}) => etat('pfc', {}, js, { pfc: pfcCours, ...x }),
  quiestce: (js, x = {}) => etat('quiestce', {}, js, { quiestce: qeCours, ...x }),
};

/* ---------- Ouvertures ---------- */
const ouvrir = (browser, jeu, e, o = {}) => openPage(browser, { page: 'duels', fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODES[jeu]}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e, jeu, plateau) });
const pousser = (p, e) => p.evaluate((x) => window.__FIN.pousser(x), e);
const freq = (p) => p.evaluate(() => window.__F);
const raz = (p) => p.evaluate(() => { window.__F = []; });
/** Nouvel état de l'écran de fin : relu au plus tôt 3 s après la lecture précédente (secours du suivi), redessin prouvé par le lien de revanche. */
async function redessiner(p, e) {
  await raz(p);
  await sleep(3200);
  await pousser(p, { ...e, partie: { ...e.partie, suite: 'HGZZ-1234', version: 10 } });
  await p.waitForSelector('a.duels-fin-revanche', { timeout: 3000 }).catch(() => {});
  check(await p.locator('a.duels-fin-revanche').count() === 1, 'l’écran de fin a bien été redessiné');
  await sleep(150);
}

/** Table en cours, geste qui réveille le son, puis l'état de fin donné. */
async function jouerFin(browser, jeu, finE, o = {}) {
  const p = await ouvrir(browser, jeu, COURS[jeu](finE.joueurs.map((j) => ({ ...j, gagne: null, manches: 0 })), o.moi ? { moi: o.moi } : {}), o);
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await sleep(100);
  await raz(p);
  await pousser(p, finE);
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
  return p;
}
const ban = (p) => p.locator('.fxd-ban');
const sans = (p, nom) => check(p.errs.length === 0, `${nom} : aucune erreur JS` + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));

(async () => {
  const browser = await chromium.launch();
  let p;

  // ----- BN1 : défaite, place 1 -----
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }));
  await sleep(150);
  const grilles = p.locator('.duels-fin-bgrille');
  check(await grilles.nth(0).locator('.bn-fx-sombre').count() === 17, 'BN1 : mes 17 cases s’enfoncent');
  check(await grilles.nth(1).locator('.bn-fx-sombre').count() === 0, 'BN1 : la flotte adverse ne bouge pas');
  check((await grilles.nth(0).locator('.bn-fx-sombre').nth(4).evaluate((c) => getComputedStyle(c).animationDelay)) === '0.32s', 'BN1 : case par case, 80 ms d’écart');
  check(await ban(p).count() === 0, 'BN1 : pas encore de bandeau à 150 ms');
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('flotte coulée'), 'BN1 : bandeau « Flotte coulée »');
  check((await ban(p).innerText()).toLowerCase().includes('bruno gagne le duel'), 'BN1 : le vrai gagnant');
  check((await freq(p)).includes(277) && !(await freq(p)).includes(392), 'BN1 : son « Coulé » du site, pas S16');
  check(await p.locator('.duels-finfx-conf').count() === 0, 'BN1 : pas de confettis');
  await p.waitForFunction(() => { const c = [...document.querySelectorAll('.bn-fx-sombre')].pop(); return c && getComputedStyle(c).transform.startsWith('matrix(0.5, 0'); }, null, { timeout: 4000 }).catch(() => {});
  check((await grilles.nth(0).locator('.bn-fx-sombre').last().evaluate((c) => getComputedStyle(c).backgroundColor)) === 'rgb(22, 55, 90)', 'BN1 : la dernière case a sombré (couleur de l’eau)');
  await p.waitForFunction(() => !document.querySelector('.bn-fx-sombre'), null, { timeout: 4000 }).catch(() => {});
  await sleep(700);
  check(await grilles.nth(0).locator('.is-coule').count() === 17, 'BN1, état final : mes 17 cases sont toujours là');
  check((await grilles.nth(0).locator('.is-coule').evaluateAll((l) => l.filter((c) => getComputedStyle(c).backgroundColor === 'rgb(217, 58, 63)' && getComputedStyle(c).transform === 'none').length)) === 17, 'BN1, état final : « Navire coulé : case rouge » est vrai');
  await p.locator('.duels-fin-flottes').screenshot({ path: __dirname + '/../../shots/speciaux-bn1-flottes.png' });
  await redessiner(p, fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }));
  check((await freq(p)).length === 0 && await ban(p).count() === 0, 'BN1 : un nouvel état ne rejoue rien');
  sans(p, 'BN1');
  await p.ctx.close();

  // BN1 : je suis à la place 2 : c'est ma grille, la seconde, qui s'enfonce.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO, 2), { bataille: bnFin(true) }));
  await sleep(150);
  check(await p.locator('.duels-fin-bgrille').nth(1).locator('.bn-fx-sombre').count() === 17 && await p.locator('.duels-fin-bgrille').nth(0).locator('.bn-fx-sombre').count() === 0, 'BN1, place 2 : ma grille, pas la première');
  await p.ctx.close();

  // BN1, capture du bandeau.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }));
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  await sleep(500);
  await p.screenshot({ path: __dirname + '/../../shots/speciaux-bn1-1280.png' });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await ban(p).count() === 0, 'BN1 : quitter retire le bandeau');
  await p.ctx.close();

  // BN1 : quitter avant le bandeau : le minuteur est annulé.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }));
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(1000);
  check(await ban(p).count() === 0, 'BN1 : quitter tout de suite, aucun bandeau orphelin');
  await p.ctx.close();

  // Gagnant : inchangé.
  p = await jouerFin(browser, 'bataille', fin('bataille', ME, duo(ME), { bataille: bnFin(false) }));
  await sleep(500);
  check((await p.locator('.duels-finfx-ban').innerText()).toLowerCase().includes('tu gagnes le duel'), 'BN gagnant : bandeau');
  check((await p.locator('.duels-finfx-ban').innerText()).toLowerCase().includes('manche unique · 18 tirs'), 'BN gagnant : format et tirs');
  check(await p.locator('.duels-finfx-conf').count() === 70 && await p.locator('.duels-fin-joueur.duels-finfx-brille').count() === 1, 'BN gagnant : confettis et brillance');
  check(await p.locator('.bn-fx-sombre').count() === 0 && await ban(p).count() === 0, 'BN gagnant : ni flotte qui sombre ni bandeau sobre');
  check((await freq(p)).includes(1047), 'BN gagnant : son de victoire');
  sans(p, 'BN gagnant');
  await p.ctx.close();

  // Spectateur : ni son ni bandeau de défaite, pas de flotte qui sombre.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: { ...bnFin(true), ma_flotte: [] }, ...spect }), { moi: spect.moi });
  await sleep(900);
  check(await p.locator('.bn-fx-sombre').count() === 0 && await ban(p).count() === 0 && (await freq(p)).length === 0, 'BN spectateur : rien de la défaite');
  await p.ctx.close();

  // Abandon : effets du socle, pas ceux du jeu.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }, { abandon: ME }));
  await sleep(900);
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Tu as abandonné' && await p.locator('.bn-fx-sombre').count() === 0 && await ban(p).count() === 0, 'BN abandon : pas d’effet du jeu');
  await p.ctx.close();

  // Partie déjà finie à l'ouverture.
  p = await ouvrir(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }));
  await p.waitForSelector('.duels-fin-bgrille', { timeout: 6000 }).catch(() => {});
  await sleep(900);
  check(await p.locator('.bn-fx-sombre').count() === 0 && await ban(p).count() === 0 && (await freq(p)).length === 0, 'BN déjà fini : sans effet ni son');
  await p.ctx.close();

  // Mouvement réduit.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true) }), { reducedMotion: 'reduce' });
  await sleep(900);
  check(await p.locator('.bn-fx-sombre').count() === 0 && await ban(p).count() === 0, 'BN réduit : ni animation ni bandeau');
  check(await p.locator('.duels-fin-bgrille').nth(0).locator('.is-coule').count() === 17, 'BN réduit : état juste, flotte coulée');
  check((await freq(p)).includes(277), 'BN réduit : le son reste');
  await p.ctx.close();

  // Invité : pas de grilles, bandeau et son.
  p = await jouerFin(browser, 'bataille', fin('bataille', BRUNO, duo(BRUNO), { bataille: bnFin(true), ...inv }), { invite: true, moi: inv.moi });
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('flotte coulée') && (await freq(p)).includes(277), 'BN invité : bandeau et son');
  sans(p, 'BN invité');
  await p.ctx.close();

  // ----- PC1 : défaite -----
  const lancers = [lancer(1, 'ciseaux', 'feuille', ME), lancer(2, 'feuille', 'feuille', null), lancer(2, 'feuille', 'ciseaux', BRUNO), lancer(3, 'pierre', 'feuille', BRUNO)];
  const pfcFin = (ls = lancers) => ({ mon_choix: null, a_choisi: {}, lancers: ls });
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO), { pfc: pfcFin() }));
  await sleep(100);
  const mains = p.locator('.duels-pfc-finmains');
  check(await mains.count() === 1, 'PC1 : les mains sont posées sur l’écran de fin');
  check(await p.locator('.duels-pfc-finmains + .duels-fin-lancers').count() === 1, 'PC1 : juste au-dessus de la liste des lancers');
  check((await mains.locator('.is-gauche .duels-pfc-face-nom').innerText()) === 'Pierre' && (await mains.locator('.is-droite .duels-pfc-face-nom').innerText()) === 'Feuille', 'PC1 : le vrai dernier lancer, pierre contre feuille');
  check((await mains.locator('.is-droite .duels-pfc-face-titre').innerText()) === 'Bruno', 'PC1 : le vrai adversaire');
  check((await mains.locator('.is-gauche .duels-pfc-svg').evaluate((s) => getComputedStyle(s).animationName)) === 'duels-pfc-baisse', 'PC1 : ma main s’anime');
  check((await mains.locator('.is-droite .duels-pfc-svg').evaluate((s) => getComputedStyle(s).animationName)) === 'none', 'PC1 : la main adverse ne s’affaisse pas');
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('duel perdu') && (await ban(p).innerText()).toLowerCase().includes('la feuille couvre la pierre'), 'PC1 : bandeau sobre, phrase du lancer');
  check((await freq(p)).includes(392) && (await freq(p)).includes(262), 'PC1 : son S16');
  await sleep(900);
  const boiteMains = await mains.boundingBox();
  const boiteBan = await ban(p).boundingBox();
  check(boiteMains.y + boiteMains.height * .6 < boiteBan.y + boiteBan.height, 'PC1 : les mains restent visibles autour du bandeau');
  const fini = await mains.locator('.is-gauche .duels-pfc-svg').evaluate((s) => { const c = getComputedStyle(s); return [c.filter, c.opacity, c.transform !== 'none']; });
  check(fini[0] === 'grayscale(1)' && fini[1] === '0.6' && fini[2], 'PC1 : état final de la main (' + fini.join(' ; ') + ')');
  await p.screenshot({ path: __dirname + '/../../shots/speciaux-pc1-1280.png' });
  await redessiner(p, fin('pfc', BRUNO, duo(BRUNO, 1, { pseudo: 'Bruno B.' }), { pfc: pfcFin() }));   // le pseudo change : fin.js réécrit son bloc
  check(await mains.count() === 1, 'PC1 : les mains survivent au redessin de l’écran');
  check((await mains.evaluate((m) => m.className)) === 'duels-pfc-finmains' && (await freq(p)).length === 0, 'PC1 : reposées sans animation ni son');
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await ban(p).count() === 0 && await mains.count() === 0, 'PC1 : quitter ne laisse rien');
  sans(p, 'PC1');
  await p.ctx.close();

  // Les phrases suivent le geste gagnant réel, à la place 2 aussi.
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO, 2), { pfc: pfcFin([lancer(1, 'ciseaux', 'pierre', BRUNO)]) }));
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('la pierre casse les ciseaux'), 'PC1 : pierre contre ciseaux');
  check((await p.locator('.duels-pfc-finmains .is-gauche .duels-pfc-face-nom').innerText()) === 'Ciseaux', 'PC1, place 2 : ma main à gauche');
  await p.ctx.close();
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO), { pfc: pfcFin([lancer(1, 'feuille', 'ciseaux', BRUNO)]) }));
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('les ciseaux coupent la feuille'), 'PC1 : ciseaux contre feuille');
  await p.ctx.close();

  // Gagnant, spectateur, déjà fini : pas de mains.
  p = await jouerFin(browser, 'pfc', fin('pfc', ME, duo(ME), { pfc: pfcFin([lancer(1, 'pierre', 'ciseaux', ME)]) }));
  await sleep(500);
  check((await p.locator('.duels-finfx-ban').innerText()).toLowerCase().includes('duel gagné') && await p.locator('.duels-pfc-finmains').count() === 0 && (await freq(p)).includes(1319), 'PC gagnant : inchangé');
  await p.ctx.close();
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO), { pfc: pfcFin(), ...spect }), { moi: spect.moi });
  await sleep(700);
  check(await p.locator('.duels-pfc-finmains').count() === 0 && await ban(p).count() === 0 && (await freq(p)).length === 0, 'PC spectateur : rien de la défaite');
  await p.ctx.close();
  p = await ouvrir(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO), { pfc: pfcFin() }));
  await p.waitForSelector('.duels-fin-lancers', { timeout: 6000 }).catch(() => {});
  await sleep(700);
  check(await p.locator('.duels-pfc-finmains').count() === 0 && await ban(p).count() === 0 && (await freq(p)).length === 0, 'PC déjà fini : sans effet ni son');
  await p.ctx.close();

  // Mouvement réduit : les mains restent, état final direct.
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO), { pfc: pfcFin() }), { reducedMotion: 'reduce' });
  await sleep(600);
  const reduit = await p.locator('.duels-pfc-finmains .is-gauche .duels-pfc-svg').evaluate((s) => { const c = getComputedStyle(s); return [c.animationName, c.opacity]; }).catch(() => []);
  check(reduit[0] === 'none' && reduit[1] === '0.6', 'PC réduit : main affaissée sans animation');
  check(await ban(p).count() === 0, 'PC réduit : pas de bandeau');
  check((await freq(p)).includes(392), 'PC réduit : le son reste');
  await p.ctx.close();

  // Invité : pas de bloc de lancers, bandeau et son.
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO), { pfc: pfcFin(), ...inv }), { invite: true, moi: inv.moi });
  await p.waitForSelector('.fxd-ban.d', { timeout: 1500 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('duel perdu') && (await freq(p)).includes(392), 'PC invité : bandeau et son');
  sans(p, 'PC invité');
  await p.ctx.close();

  // 390 px.
  p = await jouerFin(browser, 'pfc', fin('pfc', BRUNO, duo(BRUNO, 1, { pseudo: 'Bruno-avec-un-pseudo-tres-long' }), { pfc: pfcFin() }), { width: 390, mobile: true });
  await sleep(1000);
  check((await hscroll(p)) <= 0, '390 px, PC1 : pas de défilement horizontal');
  const bm = await p.locator('.duels-pfc-finmains').boundingBox();
  check(bm && bm.x >= 0 && bm.x + bm.width <= 390, '390 px, PC1 : les mains tiennent dans la largeur');
  await p.screenshot({ path: __dirname + '/../../shots/speciaux-pc1-390.png' });
  await p.ctx.close();

  // ----- QE1 : Bruno a trouvé mon personnage -----
  const qeFinE = (js, x = {}, pp = {}) => fin('quiestce', BRUNO, js, { quiestce: qeFin, journal: [ligneBruno], ...x }, pp);
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO)));
  check(await p.locator('.duels-fin-perso').count() === 0, 'QE1 : les portraits ne sont pas encore chargés à l’arrivée');
  await p.waitForSelector('.duels-fin-perso.qec-fx-trouve', { timeout: 2000 }).catch(() => {});
  check(await p.locator('.duels-fin-perso').nth(0).evaluate((c) => c.classList.contains('qec-fx-trouve')), 'QE1 : mon portrait est désigné, une fois chargé');
  check((await p.locator('.duels-fin-perso').nth(0).locator('.duels-fin-prenom').innerText()) === 'Paula', 'QE1 : la carte désignée est celle de mon personnage');
  check(await p.locator('.duels-fin-perso').nth(1).evaluate((c) => !c.classList.contains('qec-fx-trouve')), 'QE1 : pas celle de Bruno');
  check(await p.locator('.duels-fin-perso.fxd-secoue').count() === 1, 'QE1 : secousse');
  await p.waitForSelector('.fxd-ban.d', { timeout: 1800 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('personnage découvert') && (await ban(p).innerText()).toLowerCase().includes('bruno a deviné paula'), 'QE1 : bandeau, vrai personnage');
  const fq = await freq(p);
  check(fq.includes(220) && fq.includes(392) && fq.indexOf(220) < fq.indexOf(392), 'QE1 : S39 puis S16 — joué : ' + fq.join(','));
  await sleep(400);
  check((await p.locator('.duels-fin-perso').nth(0).evaluate((c) => getComputedStyle(c).boxShadow)).includes('224, 144, 154'), 'QE1 : contour rose');
  await p.screenshot({ path: __dirname + '/../../shots/speciaux-qe1-1280.png' });
  await redessiner(p, qeFinE(duo(BRUNO, 1, { pseudo: 'Bruno B.' })));   // le pseudo change : fin.js réécrit son bloc
  check(await p.locator('.duels-fin-perso.qec-fx-trouve').count() === 1 && await p.locator('.fxd-secoue').count() === 0 && (await freq(p)).length === 0, 'QE1 : redésigné sans secousse ni son au redessin');
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await ban(p).count() === 0, 'QE1 : quitter retire le bandeau');
  sans(p, 'QE1');
  await p.ctx.close();

  // QE1, place 2 : ma carte est la seconde.
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO, 2)));
  await p.waitForSelector('.duels-fin-perso.qec-fx-trouve', { timeout: 2000 }).catch(() => {});
  check(await p.locator('.duels-fin-perso').nth(1).evaluate((c) => c.classList.contains('qec-fx-trouve')), 'QE1, place 2 : ma carte, la seconde');
  await p.ctx.close();

  // Ma mauvaise proposition : personne n'a deviné mon personnage.
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO), { journal: [ligneMoi] }));
  await p.waitForSelector('.fxd-ban.d', { timeout: 2000 }).catch(() => {});
  check((await ban(p).innerText()).toLowerCase().includes('duel perdu') && (await ban(p).innerText()).toLowerCase().includes('était willy'), 'QE1, mauvaise proposition : le bandeau dit le vrai');
  await sleep(500);
  check(await p.locator('.qec-fx-trouve').count() === 0, 'QE1, mauvaise proposition : aucun portrait désigné');
  check((await freq(p)).includes(392), 'QE1, mauvaise proposition : S16');
  await p.ctx.close();

  // Gagnant, spectateur, déjà fini.
  p = await jouerFin(browser, 'quiestce', fin('quiestce', ME, duo(ME), { quiestce: qeFin, journal: [{ ...ligneBruno, user_id: ME }] }));
  await sleep(500);
  check((await p.locator('.duels-finfx-ban').innerText()).toLowerCase().includes('personnage trouvé') && await ban(p).count() === 0, 'QE gagnant : inchangé');
  await p.ctx.close();
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO), spect), { moi: spect.moi });
  await sleep(1200);
  check(await p.locator('.qec-fx-trouve').count() === 0 && await ban(p).count() === 0 && (await freq(p)).length === 0, 'QE spectateur : rien de la défaite');
  await p.ctx.close();
  p = await ouvrir(browser, 'quiestce', qeFinE(duo(BRUNO)));
  await p.waitForSelector('.duels-fin-perso', { timeout: 6000 }).catch(() => {});
  await sleep(900);
  check(await p.locator('.qec-fx-trouve').count() === 0 && await ban(p).count() === 0 && (await freq(p)).length === 0, 'QE déjà fini : sans effet ni son');
  await p.ctx.close();

  // Mouvement réduit.
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO)), { reducedMotion: 'reduce' });
  await sleep(1400);
  check(await p.locator('.duels-fin-perso').nth(0).evaluate((c) => c.classList.contains('qec-fx-trouve')) && await p.locator('.fxd-secoue').count() === 0, 'QE réduit : portrait désigné, sans secousse');
  check(await ban(p).count() === 0, 'QE réduit : pas de bandeau');
  check((await freq(p)).includes(220) && (await freq(p)).includes(392), 'QE réduit : les sons restent');
  await p.ctx.close();

  // Invité : pas de portraits, le son ne les attend pas.
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO), inv), { invite: true, moi: inv.moi });
  await p.waitForSelector('.fxd-ban.d', { timeout: 1200 }).catch(() => {});
  check((await ban(p).count()) === 1 && (await ban(p).innerText()).toLowerCase().includes('bruno a deviné paula'), 'QE invité : bandeau tout de suite');
  sans(p, 'QE invité');
  await p.ctx.close();

  // 390 px.
  p = await jouerFin(browser, 'quiestce', qeFinE(duo(BRUNO)), { width: 390, mobile: true });
  await p.waitForSelector('.fxd-ban.d', { timeout: 2500 }).catch(() => {});
  await sleep(300);
  check((await hscroll(p)) <= 0, '390 px, QE1 : pas de défilement horizontal');
  const bb = await ban(p).boundingBox();
  check(bb && bb.x >= 0 && bb.x + bb.width <= 390, '390 px, QE1 : le bandeau tient dans la largeur');
  await p.screenshot({ path: __dirname + '/../../shots/speciaux-qe1-390.png' });
  await p.ctx.close();

  await browser.close();
  finish();
})();
