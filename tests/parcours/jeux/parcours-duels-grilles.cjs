require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours des fins de duels à grille (maquette validée, oct. 2026), sur les vraies vues, état écrit par le test :
//  Morpion MR1, MR2 (classique, ultime, gomoku), couleurs X et O de la table ; Mastermind MM1, MM2, MM3 ; Puissance 4 P41, P42, P43 ;
//  Dames DA1 et damier fidèle ; Échecs EC1, EC2 et échiquier fidèle ; Othello OT1.
//  Partout : rien ne rejoue sur un état déjà vu ni en ouvrant un duel fini ; spectateur, invité ; mouvement réduit : état juste,
//  sons conservés ; 390 px. Captures : tests/shots/duels-grilles-*.png. Faux Supabase : fixtures/fake-sb-fins.mjs.
const path = require('path');
const { check, finish, openPage, hscroll, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-fins.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const BRUNO = '00000003-0000-4000-8000-000000000003';
const CODE = 'HGMO-1234';
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

/** Avant la page : état de départ, relevé des fréquences jouées et des sources de son. */
const init = (e) => ({ content: `window.__FIN = { etat: ${JSON.stringify(e)} };
  window.__F = []; window.__SONS = 0;
  localStorage.setItem('hg_duel_invite:' + '${CODE}', 'jeton');
  (() => { const AC = window.AudioContext; if (!AC) return;
    const o = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { window.__SONS += 1; const n = o.call(this); const f = n.frequency; const s = f.setValueAtTime.bind(f);
      f.setValueAtTime = (v, t) => { window.__F.push(Math.round(v)); return s(v, t); }; return n; };
    const b = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () { window.__SONS += 1; return b.call(this); };
  })();` });

const jd = (id, pseudo, place, x = {}) => ({ user_id: id, pseudo, couleur: '#7E93C9', avatar_url: null, invite: false, robot: false, place, manches: 0, nuls: 0, coups: 0, essais: 0, trouve_en: null, fin: null, pret: true, radar: 0, rang: null, gagne: null, paillettes: 0, ...x });
const partie = (jeu, x) => ({ id: `id-${jeu}`, code: CODE, jeu, variante: 'classique', nom: jeu, statut: 'en_cours', hote: ME, defie: null, defi_expire: null, robot: 0, visibilite: 'publique', invites: 0, commence: 'moi', format: 1, t_coup: 30, options: {}, restant: null, manche: 1, phase: null, grille: '', w: 3, h: 3, n: 3, petites: null, cible: null, tour: BRUNO, tour_fin: iso(30), premier: ME, nb_coups: 2, dernier: null, vainqueur: null, version: 1, historique: [], suite: null, forfait: null, abandon: null, ...x });
/** État d'un duel ; place : ma place (1 ou 2). o.moi remplace e.moi (spectateur). */
const etat = (jeu, p, js, o = {}) => ({ partie: partie(jeu, p), maintenant: iso(0), moi: { user_id: ME, joue: true, spectateur: false, defie: false, hote: true, invite: false, place: js.find((j) => j.user_id === ME)?.place ?? 1, ...o.moi }, joueurs: js, defie_pseudo: null, mastermind: null, bataille: null, quiestce: null, pfc: null, echecs: null, pions: Object.fromEntries(js.map((j) => [j.user_id, String(j.place)])), journal: [], ...o.x });
const deux = (g, a = 0, b = 0, place = 1, x = {}) => [jd(ME, 'Toi', place, { manches: a, gagne: g === ME, ...x.moi }), jd(BRUNO, 'Bruno', 3 - place, { manches: b, gagne: g === BRUNO, ...x.bruno })];
const fin = (p) => ({ statut: 'terminee', tour: null, tour_fin: null, version: 9, ...p });

const ouvrir = (browser, e, o = {}) => openPage(browser, { page: 'duels', fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODE}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e) });
const pousser = (p, e) => p.evaluate((x) => window.__FIN.pousser(x), e);
const freq = (p) => p.evaluate(() => window.__F);
const sons = (p) => p.evaluate(() => window.__SONS);
const raz = (p) => p.evaluate(() => { window.__F = []; window.__SONS = 0; });
const contient = (l, ...v) => v.every((x) => l.includes(x));
const n = (p, s) => p.locator(s).count();
const capture = (p, nom) => p.screenshot({ path: path.join(SHOTS, `duels-grilles-${nom}.png`) });
const sansErreur = (p, nom) => check(p.errs.filter((x) => !x.includes('404')).length === 0, `${nom} : aucune erreur JS ${p.errs.join(' | ')}`);

/** Ouvre une table en cours, réveille le son par un geste, puis pousse l'état final. */
async function finir(browser, debut, final, o = {}) {
  const p = await ouvrir(browser, debut, o);
  await p.waitForSelector(o.table || '.duels-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, final);
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
  await sleep(o.attente ?? 900);
  return p;
}
/** Un état déjà vu ne rejoue rien. */
async function rienNeRejoue(p, nom, e, classe) {
  const avant = await n(p, classe);
  await raz(p);
  await pousser(p, { ...e, maintenant: iso(1) });
  await sleep(350);
  check((await sons(p)) === 0 && (await n(p, classe)) === avant, `${nom} : un état déjà vu ne rejoue rien`);
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- Morpion ---------- */
  const MO = { grille: '.........' };
  const moTable = () => etat('morpion', MO, deux(null));
  const moD = { manche: 1, gagnant: BRUNO, coups: 6, grille: '112.2.21.', ligne: [2, 4, 6] };
  const moDef = etat('morpion', fin({ grille: moD.grille, vainqueur: BRUNO, historique: [moD] }), deux(BRUNO, 0, 1));
  let p = await finir(browser, moTable(), moDef);
  check((await p.locator('.duels-fin-marque[data-m="1"]').first().evaluate((x) => getComputedStyle(x).color)) === 'rgb(111, 179, 242)', 'Morpion : le X garde le bleu de la table');
  check((await p.locator('.duels-fin-marque[data-m="2"]').first().evaluate((x) => getComputedStyle(x).color)) === 'rgb(232, 176, 75)', 'Morpion : le O garde le doré de la table');
  check(await n(p, '.duels-fin-mini .fxd-trace line') === 1, 'MR1 : la ligne adverse se trace');
  const tr = await p.locator('.fxd-trace line').evaluate((l) => [l.getAttribute('x1'), l.getAttribute('y1'), l.getAttribute('x2'), l.getAttribute('y2')].map(Number));
  check(tr[0] > 70 && tr[1] < 30 && tr[2] < 30 && tr[3] > 70, `MR1 : la ligne va d’un coin à l’autre de la diagonale (${tr})`);
  check((await p.locator('.fxd-trace line').evaluate((l) => getComputedStyle(l).stroke)) === 'rgb(224, 144, 154)', 'MR1 : la ligne est rose');
  check(await n(p, '.duels-fin-marque[data-m="1"].fxd-eteint.fxd-bris') === 3, 'MR1 : mes 3 marques s’éteignent');
  check(await n(p, '.duels-fin-marque[data-m="2"].fxd-eteint') === 0, 'MR1 : les marques adverses restent vives');
  check((await p.locator('.fxd-ban.d').innerText()).toLowerCase().includes('bruno aligne 3 marques'), 'MR1 : bandeau sobre « Bruno aligne 3 marques »');
  check((await p.locator('.fxd-ban.d').innerText()).startsWith('Duel perdu'), 'MR1 : bandeau « Duel perdu »');
  check(contient(await freq(p), 440, 330), 'MR1 : son S21');
  check(await n(p, '.duels-finfx-conf, .fxd-confettis') === 0, 'MR1 : pas de confettis');
  await capture(p, 'mr1');
  await rienNeRejoue(p, 'MR1', moDef, '.fxd-trace');
  check(await n(p, '.fxd-trace') === 1, 'MR1 : un nouvel état ne coupe pas l’effet');
  await sleep(2500);
  check(await n(p, '.fxd-trace, .fxd-eteint, .fxd-bris') === 0, 'MR1, état final : plus d’effet sur la grille');
  check((await p.locator('.duels-fin-marque[data-m="1"]').first().evaluate((x) => [getComputedStyle(x).filter, getComputedStyle(x).opacity].join())) === 'none,1', 'MR1, état final : mes marques ont retrouvé leur couleur');
  check(await n(p, '.duels-fin-mini .duels-fin-marque') === 6 && await n(p, '.duels-fin-case.is-gagnante') === 3, 'MR1, état final : la vraie grille');
  sansErreur(p, 'MR1');
  await p.ctx.close();

  const moN = { manche: 1, gagnant: null, coups: 9, grille: '121122211', ligne: [] };
  const moNul = etat('morpion', fin({ grille: moN.grille, historique: [moN] }), deux(null));
  p = await finir(browser, moTable(), moNul, { attente: 500 });
  check(await n(p, '.duels-fin-mini > .duels-fin-case.fxd-vague') === 9, 'MR2 : la vague passe sur les 9 cases');
  check(await n(p, '.duels-fin-mini > .fxd-egal') === 1, 'MR2 : le « = » se pose');
  check(contient(await freq(p), 600), 'MR2 : son S17');
  await sleep(800);
  check(await n(p, '.duels-fin-mini > .duels-fin-case.fxd-eteint') === 9, 'MR2 : la grille s’éteint');
  check((await p.locator('.fxd-ban.n').innerText()).toLowerCase().includes('personne n’aligne 3 marques'), 'MR2 : bandeau neutre');
  await capture(p, 'mr2');
  await sleep(2400);
  check(await n(p, '.fxd-egal, .fxd-eteint, .fxd-vague') === 0, 'MR2, état final : la vraie grille');
  check((await p.locator('.duels-fin-mini > .duels-fin-case').first().evaluate((x) => getComputedStyle(x).opacity)) === '1', 'MR2, état final : cases visibles');
  sansErreur(p, 'MR2');
  await p.ctx.close();

  // Ultime : la ligne relie les petites grilles.
  const ulD = { manche: 1, gagnant: BRUNO, coups: 30, grille: '.'.repeat(81), petites: '222111...', ligne: [0, 1, 2] };
  const ulE = etat('morpion', fin({ variante: 'ultime', grille: ulD.grille, petites: ulD.petites, vainqueur: BRUNO, historique: [ulD] }), deux(BRUNO, 0, 1));
  p = await finir(browser, etat('morpion', { variante: 'ultime', grille: '.'.repeat(81), petites: '.........' }, deux(null)), ulE);
  check(await n(p, '.duels-fin-mini--ultime .fxd-trace line') === 1, 'MR1, ultime : la ligne relie les petites grilles');
  check((await p.locator('.fxd-ban.d').innerText()).toLowerCase().includes('aligne 3 grilles'), 'MR1, ultime : texte juste');
  await p.ctx.close();

  // Gomoku : 225 cases.
  const goD = { manche: 1, gagnant: null, coups: 225, grille: '12'.repeat(112) + '1', ligne: [] };
  const goE = etat('morpion', fin({ variante: 'gomoku', w: 15, h: 15, n: 5, grille: goD.grille, historique: [goD] }), deux(null));
  p = await finir(browser, etat('morpion', { variante: 'gomoku', w: 15, h: 15, n: 5, grille: '.'.repeat(225) }, deux(null)), goE, { attente: 1300 });
  check((await n(p, '.duels-fin-mini > .fxd-vague')) === 225, 'MR2, gomoku : la vague passe sur toute la grille');
  check((await p.locator('.fxd-ban.n').innerText()).toLowerCase().includes('aligne 5 marques'), 'MR2, gomoku : texte juste');
  await p.ctx.close();

  // Mouvement réduit : état juste, son conservé.
  p = await finir(browser, moTable(), moDef, { reducedMotion: 'reduce' });
  check(await n(p, '.fxd-trace, .fxd-eteint, .fxd-ban') === 0, 'MR1, mouvement réduit : ni trace, ni extinction, ni bandeau');
  check(await n(p, '.duels-fin-marque') === 6, 'MR1, mouvement réduit : la dernière grille est complète');
  check(contient(await freq(p), 440, 330), 'MR1, mouvement réduit : le son reste');
  await p.ctx.close();

  // Duel déjà fini à l'ouverture : aucun effet, aucun son.
  p = await ouvrir(browser, moDef);
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 6000 }).catch(() => {});
  await sleep(900);
  check(await n(p, '.fxd-trace, .fxd-eteint, .fxd-ban') === 0 && (await sons(p)) === 0, 'MR1 : rien à l’ouverture d’un duel déjà fini');
  await p.ctx.close();

  // Spectateur : ni défaite ni son.
  const spec = { moi: { joue: false, spectateur: true, hote: false, place: null } };
  const js3 = () => [jd('00000002-0000-4000-8000-000000000002', 'Alice', 1), jd(BRUNO, 'Bruno', 2, { gagne: true, manches: 1 })];
  p = await finir(browser, etat('morpion', MO, js3(), spec), etat('morpion', fin({ grille: moD.grille, vainqueur: BRUNO, historique: [moD] }), js3(), spec));
  check(await n(p, '.fxd-trace, .fxd-eteint') === 0 && await n(p, '.fxd-ban') === 0 && (await sons(p)) === 0, 'MR1, spectateur : ni effet de défaite ni son');
  check(await n(p, '.duels-fin-joueur.is-gagnant.duels-finfx-brille') === 1, 'Spectateur : le gagnant brille');
  await p.ctx.close();

  // Invité : pas de grille à l'écran, le bandeau et le son restent.
  p = await finir(browser, moTable(), moDef, { invite: true });
  check(await n(p, '.duels-fin') === 1, 'Invité : écran de fin');
  check(await p.locator('[data-grille]').isHidden(), 'Invité : pas de grille');
  check(await n(p, '.fxd-ban.d') === 1 && contient(await freq(p), 440, 330), 'MR1, invité : bandeau et son, sans grille');
  sansErreur(p, 'Invité');
  await p.ctx.close();

  // Quitter l'écran pendant les effets : rien d'orphelin.
  p = await finir(browser, moTable(), moDef, { attente: 120 });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(1300);
  check(await n(p, '.fxd-ban') === 0, 'MR1 : le bandeau ne survit pas au départ de l’écran');
  await p.ctx.close();

  // Abandon : aucun effet du jeu.
  const moAb = etat('morpion', fin({ grille: moD.grille, vainqueur: BRUNO, abandon: ME, historique: [moD] }), deux(BRUNO, 0, 1));
  p = await finir(browser, moTable(), moAb);
  check(await n(p, '.fxd-trace, .fxd-egal') === 0, 'Morpion, abandon : pas d’effet de grille');
  await p.ctx.close();

  /* ---------- Mastermind ---------- */
  const SECRET = 'ryob', MON = 'gbrp';
  const CODES = { [ME]: SECRET, [BRUNO]: MON };
  const mmP = { w: 4, h: 1, n: 4, grille: null, phase: 'jeu', tour: null, tour_fin: null, premier: null, t_coup: 90 };
  const mmEtat = (js, version = 1) => etat('mastermind', { ...mmP, version }, js, { x: { mastermind: { mon_code: MON, mon_code_pret: true, mes_essais: [{ n: 1, essai: 'ggpp', bien: 0, mal: 0 }], essais_adverses: { [BRUNO]: [] } } } });
  const mmAvant = () => mmEtat([jd(ME, 'Toi', 1, { essais: 1, fin: iso(60) }), jd(BRUNO, 'Bruno', 2, { essais: 6, fin: iso(60) })]);
  p = await ouvrir(browser, mmAvant());
  await p.waitForSelector('.mm-plateau', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, mmEtat([jd(ME, 'Toi', 1, { essais: 1, fin: iso(60) }), jd(BRUNO, 'Bruno', 2, { essais: 7, trouve_en: 7, fin: iso(60) })], 2));
  await p.waitForSelector('.fxd-ban.d', { timeout: 3000 }).catch(() => {});
  const mm2 = (await p.locator('.fxd-ban.d').innerText()).toLowerCase();
  check(mm2.includes('bruno perce ton code') && mm2.includes('fais mieux que 7 essais pour gagner'), 'MM2 : sous-titre juste pendant la manche');
  check(contient(await freq(p), 392, 349, 311), 'MM2 : son S27');
  await capture(p, 'mm2');
  // MM3 : le duel finit juste après, même annoncé à la table.
  await raz(p);
  const mmDef = etat('mastermind', fin({ ...mmP, vainqueur: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 7, codes: CODES }] }), deux(BRUNO, 0, 1, 1, { bruno: { trouve_en: 7 } }));
  await pousser(p, mmDef);
  await p.waitForSelector('.duels-fin-pastille', { timeout: 4000 }).catch(() => {});
  await sleep(600);
  check(await n(p, '.duels-fin-pastille.mm-fx-saut') === 8, 'MM3 : les codes se révèlent pion par pion');
  check((await p.locator('.duels-fin-pastille').nth(3).evaluate((x) => x.style.animationDelay)) === '360ms', 'MM3 : un pion après l’autre');
  const mm3 = (await p.locator('.fxd-ban.d').last().innerText()).toLowerCase();
  check(mm3.includes('duel perdu') && mm3.includes('bruno perce en 7 essais'), 'MM3 : bandeau « Duel perdu »');
  check(contient(await freq(p), 392, 349, 311), 'MM3 : son S27');
  check((await p.locator('.duels-fin-code .duels-fin-note').first().innerText()) === 'Le code que tu devais percer', 'MM3 : mon code d’abord, texte juste');
  await capture(p, 'mm3');
  await rienNeRejoue(p, 'MM3', mmDef, '.mm-fx-saut');
  sansErreur(p, 'MM3');
  await p.ctx.close();

  const mmNul = etat('mastermind', fin({ ...mmP, historique: [{ manche: 1, gagnant: null, coups: 10, codes: CODES }] }), deux(null, 0, 0, 1, { moi: { essais: 10 }, bruno: { essais: 10 } }));
  p = await finir(browser, mmAvant(), mmNul, { table: '.mm-plateau' });
  check(await n(p, '.duels-fin-pastille.mm-fx-saut') === 8, 'MM1 : le code se révèle');
  check((await p.locator('.fxd-ban.n').innerText()).toLowerCase().includes('personne n’a percé le code'), 'MM1 : bandeau neutre');
  check(contient(await freq(p), 600), 'MM1 : son S17');
  await capture(p, 'mm1');
  await p.ctx.close();

  p = await finir(browser, mmAvant(), mmNul, { table: '.mm-plateau', reducedMotion: 'reduce' });
  check(await n(p, '.mm-fx-saut, .fxd-ban') === 0 && await n(p, '.duels-fin-pastille') === 8, 'MM1, mouvement réduit : codes visibles, sans effet');
  check(contient(await freq(p), 600), 'MM1, mouvement réduit : le son reste');
  await p.ctx.close();

  const mmG = etat('mastermind', fin({ ...mmP, vainqueur: ME, historique: [{ manche: 1, gagnant: ME, coups: 4, codes: CODES }] }), deux(ME, 1, 0, 1, { moi: { trouve_en: 4 } }));
  p = await finir(browser, mmAvant(), mmG, { table: '.mm-plateau' });
  check((await p.locator('.mm-fx-ban').innerText()).includes('Code percé !'), 'Mastermind, gagnant : bandeau inchangé');
  await p.ctx.close();

  // Plusieurs manches : la manche 1 est fêtée à la table, la victoire finale de la manche 3 l'est aussi.
  const mmM = (js, x) => etat('mastermind', { ...mmP, format: 3, ...x }, js, { x: { mastermind: { mon_code: MON, mon_code_pret: true, mes_essais: [{ n: 1, essai: 'ggpp', bien: 0, mal: 0 }], essais_adverses: { [BRUNO]: [] } } } });
  p = await ouvrir(browser, mmM([jd(ME, 'Toi', 1, { essais: 1, fin: iso(60) }), jd(BRUNO, 'Bruno', 2, { fin: iso(60) })], { manche: 1 }));
  await p.waitForSelector('.mm-plateau', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await pousser(p, mmM([jd(ME, 'Toi', 1, { essais: 1, trouve_en: 1, fin: iso(60) }), jd(BRUNO, 'Bruno', 2, { fin: iso(60) })], { manche: 1, version: 2 }));
  await p.waitForSelector('.mm-fx-ban', { timeout: 3000 }).catch(() => {});
  await sleep(2500);
  await raz(p);
  await pousser(p, etat('mastermind', fin({ ...mmP, format: 3, manche: 3, vainqueur: ME, historique: [{ manche: 1, gagnant: ME, coups: 1, codes: CODES }, { manche: 2, gagnant: BRUNO, coups: 2, codes: CODES }, { manche: 3, gagnant: ME, coups: 3, codes: CODES }] }), deux(ME, 2, 1, 1, { moi: { trouve_en: 3 } })));
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
  await sleep(600);
  check(await n(p, '.mm-fx-ban') === 1 && (await sons(p)) > 0, 'Mastermind, plusieurs manches : la victoire finale est fêtée');
  await p.ctx.close();

  /* ---------- Puissance 4 ---------- */
  const P4 = { w: 7, h: 6, n: 4, grille: '.'.repeat(42), jeu: 'p4' };
  const D = ['.......', '.......', '...2...', '..21...', '.2211..', '2111.2.'].join(''), L = [35, 29, 23, 17];
  const N = ['1122112', '2211221', '1122112', '2211221', '1122112', '2211221'].join('');
  const p4T = () => etat('p4', P4, deux(null));
  const p4Def = etat('p4', fin({ ...P4, grille: D, vainqueur: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 14, grille: D, ligne: L }] }), deux(BRUNO, 0, 1));
  p = await finir(browser, p4T(), p4Def, { table: '.duels-p4-case' });
  check(await n(p, '.duels-fin-case.is-gagnante.fxd-brille') === 4, 'P41 : la ligne adverse brille');
  const miens = [...D].filter((c) => c === '1').length;
  check(await n(p, '.duels-fin-jeton[data-j="1"].fxd-chute') === miens && await n(p, '.duels-fin-jeton[data-j="2"].fxd-chute') === 0, 'P41 : mes jetons tombent, pas les siens');
  const ban = (await p.locator('.fxd-ban.d').innerText()).toLowerCase();
  check(ban.includes('duel perdu') && ban.includes('bruno aligne 4 jetons'), 'P41 : bandeau sobre');
  check(contient(await freq(p), 392, 330, 262), 'P41 : son S16');
  check(!(await freq(p)).includes(988), 'P41 : plus la cloche du gagnant');
  check(await n(p, '.duels-fin-joueur.is-gagnant.duels-finfx-brille') === 1, 'P41 : le gagnant brille');
  await capture(p, 'p41');
  await rienNeRejoue(p, 'P41', p4Def, '.fxd-chute');
  await sleep(1300);
  check(await n(p, '.fxd-chute') === 0, 'P41 : plus de chute en fin d’effet');
  check((await p.locator('.duels-fin-jeton[data-j="1"]').evaluateAll((l) => l.filter((j) => getComputedStyle(j).opacity === '1' && getComputedStyle(j).transform === 'none').length)) === miens, 'P41, état final : mes jetons sont de nouveau dans la grille');
  sansErreur(p, 'P41');
  await p.ctx.close();

  const p4Nul = etat('p4', fin({ ...P4, grille: N, historique: [{ manche: 1, gagnant: null, coups: 42, grille: N, ligne: [] }] }), deux(null));
  p = await finir(browser, p4T(), p4Nul, { table: '.duels-p4-case' });
  check(await n(p, '.duels-fin-jeton.fxd-vague') === 42, 'P42 : vague sur la grille pleine');
  check((await p.locator('.fxd-ban.n').innerText()).toLowerCase().includes('grille pleine'), 'P42 : bandeau neutre');
  check(contient(await freq(p), 600), 'P42 : son S17');
  await capture(p, 'p42');
  await p.ctx.close();

  const p4G = etat('p4', fin({ ...P4, grille: D, vainqueur: ME, historique: [{ manche: 1, gagnant: ME, coups: 14, grille: D, ligne: L }] }), deux(ME, 1, 0));
  p = await finir(browser, p4T(), p4G, { table: '.duels-p4-case' });
  check(await n(p, '.duels-finfx-ban') === 1 && await n(p, '.duels-finfx-conf') > 0, 'Puissance 4, gagnant : bandeau et confettis');
  check((await sons(p)) > 0 && !(await freq(p)).includes(262), 'Puissance 4, gagnant : la cloche S22 reste');
  await p.ctx.close();

  // P43 : manche nulle en cours de duel, c'est à moi de jouer sur la nouvelle grille.
  const p4F5 = { ...P4, format: 5, manche: 3, tour: ME };
  const nulle = { manche: 3, gagnant: null, coups: 42, grille: N, ligne: [] };
  p = await ouvrir(browser, etat('p4', { ...p4F5, tour: BRUNO, grille: N, nb_coups: 41, historique: [{ manche: 1, gagnant: ME }, { manche: 2, gagnant: BRUNO }] }, deux(null, 1, 1)));
  await p.waitForSelector('.duels-p4-case', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, etat('p4', { ...p4F5, manche: 4, nb_coups: 0, version: 5, historique: [{ manche: 1, gagnant: ME }, { manche: 2, gagnant: BRUNO }, nulle] }, deux(null, 1, 1)));
  await p.waitForSelector('.fxd-ban.n', { timeout: 3000 }).catch(() => {});
  const p43 = (await p.locator('.fxd-ban.n').innerText()).toLowerCase();
  check(p43.includes('manche nulle') && p43.includes('score : 1 – 1'), 'P43 : bandeau bref avec le score');
  check(contient(await freq(p), 600), 'P43 : son S17');
  check(await n(p, '.duels-p4-case .duels-p4-jeton') === 42, 'P43 : la grille pleine reste visible');
  check(await n(p, '.duels-p4-colonne:not([disabled])') === 7, 'P43 : le coup suivant n’est pas bloqué');
  await capture(p, 'p43');
  await sleep(2800);
  check(await n(p, '.duels-p4-case .duels-p4-jeton') === 0, 'P43 : la nouvelle grille reprend sa place');
  sansErreur(p, 'P43');
  await p.ctx.close();

  // P43, spectateur : le bandeau, pas le son.
  p = await ouvrir(browser, etat('p4', { ...p4F5, grille: N, historique: [] }, js3(), spec));
  await p.waitForSelector('.duels-p4-case', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, etat('p4', { ...p4F5, manche: 4, nb_coups: 0, historique: [nulle] }, js3(), spec));
  await p.waitForSelector('.fxd-ban.n', { timeout: 3000 }).catch(() => {});
  check((await sons(p)) === 0, 'P43, spectateur : pas de son');
  await p.ctx.close();

  /* ---------- Dames (10 × 10) ---------- */
  const DA = { w: 10, h: 10, n: 0, t_coup: 90 };
  const gd = (o) => { const g = Array(100).fill('.'); Object.entries(o).forEach(([i, c]) => { g[i] = c; }); return g.join(''); };
  const daAvant = gd({ 7: '2', 45: '2', 52: '2', 63: '2', 76: 'B', 23: '1', 16: 'A' }); // je joue le camp 1 : deux dernières pièces
  const daFin = gd({ 12: '2', 45: '2', 52: '2', 63: '2', 76: 'B' });
  const rafle = { user_id: BRUNO, case: 7, action: 'chemin:7,34,12' }; // saute 16 puis 23
  const daT = () => etat('dames', { ...DA, grille: daAvant }, deux(null));
  const daDef = etat('dames', fin({ ...DA, grille: daFin, dernier: rafle, vainqueur: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 58, grille: daFin, ligne: [] }] }), deux(BRUNO, 0, 1));
  p = await finir(browser, daT(), daDef, { table: '.duels-dames-plateau', attente: 420 });
  check(await n(p, '.duels-fin-mini--dames [data-c="23"] .duels-fin-dpion.is-1.fxd-pris') === 1, 'DA1 : mon pion revient sur sa case pour disparaître');
  check(await n(p, '.duels-fin-mini--dames [data-c="16"] .duels-fin-dpion.is-1.fxd-pris .duels-fin-dame') === 1, 'DA1 : ma dame aussi, avec sa couronne');
  check(contient(await freq(p), 392, 330, 262), 'DA1 : son S16');
  check(!(await freq(p)).includes(784), 'DA1 : plus les cloches du gagnant');
  await capture(p, 'da1');
  const daB = (await p.locator('.fxd-ban.d').innerText()).toLowerCase();
  check(daB.includes('partie perdue') && daB.includes('bruno prend tes dernières pièces'), 'DA1 : bandeau sobre');
  await sleep(1500);
  check(await n(p, '.duels-fin-dpion.is-1') === 0, 'DA1 : l’état final vient de la dernière grille');
  check(await n(p, '.duels-fin-mini--dames .duels-fin-case') === 100, 'Damier de fin : 10 × 10');
  check((await p.locator('.duels-fin-mini--dames .duels-fin-case.is-sombre').first().evaluate((x) => getComputedStyle(x).backgroundColor)) === 'rgb(94, 63, 44)', 'Damier de fin : le bois de la table');
  check((await p.locator('.duels-fin-mini--dames [data-c="45"] .duels-fin-dpion').evaluate((x) => getComputedStyle(x).backgroundImage)).includes('194, 90, 67'), 'Damier de fin : pions rouge brun de la table');
  check(await n(p, '.duels-fin-mini--dames [data-c="76"] .duels-fin-dame') === 1, 'Damier de fin : la dame porte sa couronne');
  check((await p.locator('[data-grille]').innerText()).includes('Pions rouge brun : Bruno, 5 pièces'), 'Damier de fin : légende de la table');
  await rienNeRejoue(p, 'DA1', daDef, '.fxd-pris');
  sansErreur(p, 'DA1');
  await p.ctx.close();

  // Contre le robot : mon coup et sa réponse arrivent dans le même état. Ma pièce quitte 58 pour 47, où elle est prise : pas de fantôme en 58.
  const robG = gd({ 56: '2' });
  const robE = etat('dames', fin({ ...DA, grille: robG, dernier: { user_id: BRUNO, case: 38, action: 'chemin:38,56' }, vainqueur: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 40, grille: robG, ligne: [] }] }), deux(BRUNO, 0, 1));
  p = await finir(browser, etat('dames', { ...DA, grille: gd({ 38: '2', 58: '1' }) }, deux(null)), robE, { table: '.duels-dames-plateau', attente: 420 });
  check(await n(p, '.duels-fin-dpion.is-1') === 0, 'DA1, robot : aucun pion fantôme');
  check((await p.locator('.fxd-ban.d').innerText()).toLowerCase().includes('prend tes dernières pièces'), 'DA1, robot : le bandeau reste juste');
  await p.ctx.close();

  // Je joue le camp 2 : damier retourné comme à la table. Pièces bloquées : le texte le dit.
  const daBloque = gd({ 34: '2', 45: '1' });
  const daDef2 = etat('dames', fin({ ...DA, grille: daBloque, vainqueur: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 58, grille: daBloque, ligne: [] }] }), deux(BRUNO, 0, 1, 2));
  p = await finir(browser, etat('dames', { ...DA, grille: daBloque }, deux(null, 0, 0, 2)), daDef2, { table: '.duels-dames-plateau', attente: 500 });
  check((await p.locator('.duels-fin-mini--dames .duels-fin-case').first().getAttribute('data-c')) === '99', 'Damier de fin : retourné quand je joue le camp 2');
  check((await p.locator('.fxd-ban.d').innerText()).toLowerCase().includes('tu ne peux plus jouer'), 'DA1 : texte juste si mes pièces sont bloquées');
  await p.ctx.close();

  p = await finir(browser, daT(), daDef, { table: '.duels-dames-plateau', reducedMotion: 'reduce', attente: 700 });
  check(await n(p, '.fxd-pris, .fxd-ban') === 0, 'DA1, mouvement réduit : ni pièce rajoutée ni bandeau');
  check(contient(await freq(p), 392, 330, 262), 'DA1, mouvement réduit : le son reste');
  await p.ctx.close();

  /* ---------- Échecs ---------- */
  const EC = { w: 8, h: 8, n: 0, t_coup: 90 };
  const pos = (o) => { const g = Array(64).fill('.'); Object.entries(o).forEach(([k, c]) => { g[(8 - Number(k[1])) * 8 + 'abcdefgh'.indexOf(k[0])] = c; }); return g.join(''); };
  const MAT = pos({ e8: 'R', g8: 'k', f7: 'p', g7: 'p', h7: 'p', g6: 'Q', g1: 'K' });
  const bl = (u) => ({ x: { echecs: { blanc: u, roque: '', ep: -1, demi: 0 } } });
  // Je joue les noirs : place 2, pions '2'.
  const ecT = () => etat('echecs', { ...EC, grille: MAT, premier: BRUNO }, deux(null, 0, 0, 2), bl(BRUNO));
  const ecMat = etat('echecs', fin({ ...EC, grille: MAT, premier: BRUNO, vainqueur: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 62, grille: MAT, ligne: [] }] }), deux(BRUNO, 0, 1, 2), bl(BRUNO));
  p = await finir(browser, ecT(), ecMat, { table: '.duels-echecs-plateau, .duels-table' });
  check(await n(p, '.duels-fin-piece.is-noir[data-p="k"].duels-echecs-roi-tombe') === 1, 'EC1 : mon roi tombe');
  check(await n(p, '.duels-fin-piece.is-blanc.duels-echecs-roi-tombe') === 0, 'EC1 : le roi adverse reste debout');
  check(contient(await freq(p), 110) && !(await freq(p)).includes(784), 'EC1 : gong grave S25, plus la fanfare du mat');
  await sleep(250);
  const ec1 = (await p.locator('.fxd-ban.d').innerText()).toLowerCase();
  check(ec1.includes('échec et mat') && ec1.includes('tu perds la partie'), 'EC1 : bandeau sobre');
  await sleep(1000);
  check((await p.locator('.duels-echecs-roi-tombe').evaluate((x) => getComputedStyle(x).transform)) !== 'none', 'EC1 : le roi reste couché');
  check((await p.locator('[data-c="6"] .duels-echecs-roi-tombe').evaluate((x) => getComputedStyle(x).opacity)) === '1', 'EC1, état final : le roi reste visible sur sa case');
  await capture(p, 'ec1');
  check((await p.locator('.duels-fin-mini--echecs .duels-fin-case').first().getAttribute('data-c')) === '63', 'Échiquier de fin : retourné quand je joue les noirs');
  check((await p.locator('.duels-fin-mini--echecs .duels-fin-case.is-sombre').first().evaluate((x) => getComputedStyle(x).backgroundColor)) === 'rgb(181, 136, 99)', 'Échiquier de fin : les cases de la table');
  check((await p.locator('.duels-fin-piece[data-p="q"]').innerText()).startsWith('♛'), 'Échiquier de fin : symboles de la table');
  check(await n(p, '.duels-fin-coord.is-rang') === 8 && await n(p, '.duels-fin-coord.is-fichier') === 8, 'Échiquier de fin : coordonnées');
  await rienNeRejoue(p, 'EC1', ecMat, '.duels-echecs-roi-tombe');
  sansErreur(p, 'EC1');
  await p.ctx.close();

  p = await finir(browser, ecT(), ecMat, { reducedMotion: 'reduce' });
  check(await n(p, '.duels-echecs-roi-tombe, .fxd-ban') === 0, 'EC1, mouvement réduit : ni chute ni bandeau');
  check(contient(await freq(p), 110), 'EC1, mouvement réduit : le son reste');
  await p.ctx.close();

  // EC2 : forfait gagné et abandon perdu, ni fanfare ni « Échec et mat ».
  const ecQ = etat('echecs', fin({ ...EC, grille: MAT, format: 3, manche: 2, vainqueur: ME, forfait: BRUNO, historique: [{ manche: 1, gagnant: ME, coups: 62, grille: MAT, ligne: [] }] }), deux(ME, 1, 0, 1), bl(ME));
  p = await finir(browser, etat('echecs', { ...EC, grille: MAT }, deux(null, 0, 0, 1), bl(ME)), ecQ);
  check(!(await freq(p)).includes(784), 'EC2, forfait : pas de fanfare du mat');
  check(!(await p.locator('body').innerText()).includes('Échec et mat'), 'EC2, forfait : pas de « Échec et mat »');
  await capture(p, 'ec2');
  await p.ctx.close();
  const ecA = etat('echecs', fin({ ...EC, grille: MAT, format: 3, manche: 2, vainqueur: BRUNO, abandon: ME, premier: BRUNO, historique: [{ manche: 1, gagnant: BRUNO, coups: 62, grille: MAT, ligne: [] }] }), deux(BRUNO, 0, 1, 2), bl(BRUNO));
  p = await finir(browser, ecT(), ecA);
  check(!(await freq(p)).includes(784) && await n(p, '.duels-echecs-roi-tombe') === 0, 'EC2, abandon : ni fanfare ni roi qui tombe');
  await p.ctx.close();

  /* ---------- Othello ---------- */
  const g = []; for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) g.push((r * 3 + c * 5) % 8 < 5 ? '1' : '2');
  g[0] = '2'; g[63] = '2';
  const G = g.join('');
  const nb = (c) => [...G].filter((x) => x === c).length;
  const OT = { w: 8, h: 8, n: 0, grille: G };
  const otFin = (uid, a, b, place, o) => etat('othello', fin({ ...OT, vainqueur: uid, historique: [{ manche: 1, gagnant: uid, coups: 60, grille: G, ligne: [] }] }), o?.js || deux(uid, a, b, place), o);
  p = await finir(browser, etat('othello', OT, deux(null, 0, 0, 2)), otFin(BRUNO, 0, 1, 2), { table: '.duels-oth-plateau' });
  const ot1 = (await p.locator('.fxd-ban.d').innerText()).toLowerCase();
  check(ot1.includes('partie perdue') && ot1.includes(`${nb('2')} pions contre ${nb('1')}`), `OT1 : je perds, compte juste (${ot1.replace(/\s+/g, ' ')})`);
  check((await sons(p)) > 0 && !(await freq(p)).includes(262), 'OT1 : même son');
  check(await n(p, '.duels-fin-joueur.is-gagnant.duels-oth-fin-fx') === 1, 'OT1 : le gagnant brille');
  await capture(p, 'ot1-perdu');
  sansErreur(p, 'OT1');
  await p.ctx.close();
  p = await finir(browser, etat('othello', OT, deux(null, 0, 0, 1)), otFin(ME, 1, 0, 1), { table: '.duels-oth-plateau' });
  const ot2 = (await p.locator('.fxd-ban').innerText()).toLowerCase();
  check(ot2.includes('partie gagnée') && ot2.includes(`${nb('1')} pions contre ${nb('2')}`), 'OT1 : je gagne, compte juste');
  check((await sons(p)) > 0, 'OT1 : même son pour le gagnant');
  await capture(p, 'ot1-gagne');
  await p.ctx.close();
  p = await finir(browser, etat('othello', OT, js3(), spec), otFin(BRUNO, 0, 1, 1, { ...spec, js: js3() }), { table: '.duels-oth-plateau' });
  check((await p.locator('.fxd-ban.n').innerText()).toLowerCase().includes('partie terminée'), 'OT1, spectateur : bandeau neutre');
  await p.ctx.close();
  p = await finir(browser, etat('othello', OT, deux(null, 0, 0, 2)), otFin(BRUNO, 0, 1, 2), { table: '.duels-oth-plateau', reducedMotion: 'reduce' });
  check(await n(p, '.fxd-ban, .duels-oth-fin-fx') === 0 && (await sons(p)) > 0, 'OT1, mouvement réduit : pas de bandeau, le son reste');
  await p.ctx.close();

  // Table quittée, duel fini entre-temps, puis rouvert dans la même page : ce n'est plus une fin vue en direct.
  for (const [nom, debut, final, table] of [['Morpion', moTable(), moDef, '.duels-table'], ['Mastermind', mmAvant(), mmG, '.mm-plateau'], ['Othello', etat('othello', OT, deux(null, 0, 0, 2)), otFin(BRUNO, 0, 1, 2), '.duels-oth-plateau']]) {
    p = await ouvrir(browser, debut);
    await p.waitForSelector(table, { timeout: 6000 }).catch(() => {});
    await p.mouse.click(5, 300);
    await p.evaluate(() => { location.hash = '#'; });
    await sleep(500);
    await raz(p);
    await p.evaluate(([e, code]) => { window.__FIN.etat = e; location.hash = '#partie/' + code; }, [final, CODE]);
    await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
    await sleep(800);
    check(await n(p, '.duels-fin-bandeau h1') === 1, nom + ' : l’écran de fin s’ouvre');
    check((await sons(p)) === 0 && await n(p, '.fxd-ban, .fxd-trace, .mm-fx-ban') === 0, nom + ' : rien ne rejoue sur un duel rouvert dans la même page');
    await p.ctx.close();
  }

  /* ---------- 390 px ---------- */
  for (const [nom, debut, final, table] of [['Morpion', moTable(), moDef, '.duels-table'], ['Puissance 4', p4T(), p4Def, '.duels-p4-case'], ['Dames', daT(), daDef, '.duels-dames-plateau'], ['Échecs', ecT(), ecMat, '.duels-table']]) {
    p = await finir(browser, debut, final, { width: 390, mobile: true, table, attente: 600 });
    check((await hscroll(p)) <= 0, `390 px, ${nom} : pas de défilement horizontal`);
    await capture(p, `tel-${nom === 'Puissance 4' ? 'p4' : nom === 'Échecs' ? 'echecs' : nom.toLowerCase()}`);
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
