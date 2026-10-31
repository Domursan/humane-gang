require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours du socle des duels et plateaux (maquette validée, oct. 2026), sur les vraies vues, état écrit par le test :
//  Duels : AB1, AB2, FO1, FO2 (textes, sons, pas de confettis, gains), spectateur, DF1, DF2, TP1 avec et sans le compte de la migration 185,
//    tic CH1 à mon tour et pas au tour de l'autre, SA3 (décompte, titre d'onglet, rien d'orphelin en quittant).
//  Plateaux : PV1, PV2, PV3, PV4 (vrai rang, tampon, podium, sons), SA1, SA2, SA3, CH2, table qui garde l'écran (avantFin).
//  Partout : rien ne rejoue sur un état déjà vu ni en ouvrant une partie déjà finie ; mouvement réduit : état juste, sons conservés ; 390 px.
// Faux Supabase : fixtures/fake-sb-fins.mjs. La table du Morpion est la vraie ; celle des plateaux est remplacée par une table minimale.
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-fins.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ALICE = U(2), BRUNO = U(3), CHLOE = U(4);
const CODE = 'HGMO-1234', CODEP = 'HGBJK-1234';
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

/** Avant la page : état de départ, relevé des fréquences jouées et des sources de son. */
const init = (e) => ({ content: `window.__FIN = { etat: ${JSON.stringify(e)} };
  window.__F = []; window.__SONS = 0;
  localStorage.setItem('hg_duel_invite:' + 'HGMO-1234', 'jeton'); localStorage.setItem('hg_plat_invite:' + 'HGBJK-1234', 'jeton');
  (() => { const AC = window.AudioContext; if (!AC) return;
    const o = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { window.__SONS += 1; const n = o.call(this); const f = n.frequency; const s = f.setValueAtTime.bind(f);
      f.setValueAtTime = (v, t) => { window.__F.push(Math.round(v)); return s(v, t); }; return n; };
    const b = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () { window.__SONS += 1; return b.call(this); };
  })();` });

const jd = (id, pseudo, place, x = {}) => ({ user_id: id, pseudo, couleur: '#7E93C9', avatar_url: null, invite: false, robot: false, place, manches: 0, nuls: 0, coups: 0, essais: 0, trouve_en: null, fin: null, pret: true, radar: 0, rang: null, gagne: null, paillettes: 0, ...x });
const partieD = (x) => ({ id: 'id-mo', code: CODE, jeu: 'morpion', variante: 'classique', nom: 'Morpion', statut: 'en_cours', hote: ME, defie: null, defi_expire: null, robot: 0, visibilite: 'publique', invites: 0, commence: 'moi', format: 3, t_coup: 30, options: {}, restant: null, manche: 1, phase: null, grille: '.........', w: 3, h: 3, n: 3, petites: null, cible: null, tour: BRUNO, tour_fin: iso(30), premier: ME, nb_coups: 0, dernier: null, vainqueur: null, version: 1, historique: [], suite: null, forfait: null, abandon: null, ...x });
const etatD = (p, js, x = {}) => ({ partie: partieD(p), maintenant: iso(0), moi: { user_id: ME, joue: true, spectateur: false, defie: false, hote: true, invite: false, place: 1 }, joueurs: js, defie_pseudo: null, mastermind: null, bataille: null, quiestce: null, pfc: null, echecs: null, pions: {}, journal: [], ...x });
const deux = (g, a = 0, b = 0, x = {}) => [jd(ME, 'Toi', 1, { manches: a, gagne: g === ME, paillettes: 0, ...x.moi }), jd(BRUNO, 'Bruno', 2, { manches: b, gagne: g === BRUNO, ...x.bruno })];
const M1 = { manche: 1, gagnant: ME, coups: 5, grille: '111.22...', ligne: [0, 1, 2] };
const finD = (p, js, x) => etatD({ statut: 'terminee', tour: null, tour_fin: null, version: 9, ...p }, js, x);

const ouvrirDuel = (browser, e, o = {}) => openPage(browser, { page: 'duels', fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODE}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e) });

const pousser = (p, e) => p.evaluate((x) => window.__FIN.pousser(x), e);
const freq = (p) => p.evaluate(() => window.__F);
const raz = (p) => p.evaluate(() => { window.__F = []; window.__SONS = 0; });
const contient = (l, ...v) => v.every((x) => l.includes(x));

/** Ouvre une table de Morpion en cours, réveille le son par un geste, joue la fin donnée, et vérifie. */
async function finDuel(browser, fin, o = {}) {
  const p = await ouvrirDuel(browser, etatD({}, deux(null)), o);
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, fin);
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
  await sleep(250);
  return p;
}

/* ---------- Plateaux ---------- */
const TABLE = `import { brancherChrono } from '/assets/espaces/plateaux/vues/commun.js';
export function creer(root, ctx) { root.innerHTML = '<div class="faux-table"><span class="plat-chrono" data-chrono></span></div>'; const c = brancherChrono(root, ctx.suivi);
  return { maj() {}, message() {}, detruire() { c(); root.innerHTML = ''; }, avantFin(e) { window.__AVANT = e.partie.statut; return new Promise((ok) => { setTimeout(ok, window.__DELAI_FIN || 0); }); } }; }`;
const jp = (id, pseudo, place, rang, x = {}) => ({ user_id: id, pseudo, couleur: '#D9764B', avatar_url: null, invite: false, place, pret: true, parti: false, absent: false, elimine: false, etat: { jetons: 100, mise: 0, mains: [], resultat: null, ...(rang ? { rang } : {}) }, gagne: rang ? rang === 1 : null, rang: rang ? (rang === 1 ? 1 : 2) : null, paillettes: rang ? 20 : 0, ...x });
const etatP = (p, js, x = {}) => ({ partie: { id: 'id-bj', jeu: 'blackjack', nom_jeu: 'Blackjack', code: CODEP, nom: 'Table du vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: true, nb_places: 4, t_tour: 60, options: { manches: 8, jetons: 1000 }, tour: ALICE, tour_fin: iso(40), nb_tours: 3, suite: null, raison: null, version: 1, started_at: iso(-600), ended_at: null, ...p }, maintenant: iso(0), moi: { user_id: ME, joue: true, hote: true, invite: false }, joueurs: js, jeu: null, journal: [], badges: [], ...x });
const quatre = (r) => [jp(ME, 'Toi', 1, r[0]), jp(ALICE, 'Alice', 2, r[1]), jp(BRUNO, 'Bruno', 3, r[2]), jp(CHLOE, 'Chloé', 4, r[3])];
const finP = (js, x) => etatP({ statut: 'terminee', tour: null, tour_fin: null, version: 9, ended_at: iso(0) }, js, x);

async function ouvrirPlateau(browser, e, o = {}) {
  const p = await openPage(browser, { page: 'blackjack', fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODEP}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e) });
  await p.route('**/jeux/blackjack/table.js', (r) => r.fulfill({ contentType: 'text/javascript', body: TABLE }));
  await p.reload();
  return p;
}
async function finPlateau(browser, fin, o = {}) {
  const p = await ouvrirPlateau(browser, etatP({}, quatre([])), o);
  await p.waitForSelector('.faux-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, fin);
  await p.waitForSelector('.plat-fin h1', { timeout: 4000 }).catch(() => {});
  await sleep(500);
  return p;
}

(async () => {
  const browser = await chromium.launch();
  let p;

  // ----- AB1 : Bruno abandonne, manche 1 jouée -----
  p = await finDuel(browser, finD({ manche: 2, vainqueur: ME, abandon: BRUNO, historique: [M1] }, deux(ME, 1, 0, { moi: { paillettes: 40 } })));
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Bruno a abandonné', 'AB1 : titre « Bruno a abandonné »');
  check((await p.locator('.duels-fin-sous').innerText()) === 'Tu gagnes le duel par abandon.', 'AB1 : sous-titre');
  check((await p.locator('.duels-fin-joueur.is-parti').innerText()).includes('Bruno'), 'AB1 : Bruno atténué');
  check((await p.locator('.fxd-ban').innerText()).includes('Abandon adverse'), 'AB1 : bandeau neutre « Abandon adverse »');
  check(await p.locator('.fxd-ban.n').count() === 1, 'AB1 : bandeau de ton neutre');
  check(await p.locator('.duels-finfx-conf').count() === 0 && await p.locator('.fxd-confettis').count() === 0, 'AB1 : pas de confettis');
  check(await p.locator('.duels-fin-ico.is-anime').count() === 1, 'AB1 : le drapeau s’anime');
  check(contient(await freq(p), 523, 659), 'AB1 : son S09');
  check((await p.locator('[data-gains]').innerText()).includes('+40 Paillettes'), 'AB1 : gains réels de l’état');
  await p.screenshot({ path: __dirname + '/../../shots/socle-ab1-1280.png' });
  await raz(p);
  await pousser(p, finD({ manche: 2, vainqueur: ME, abandon: BRUNO, historique: [M1], version: 10 }, deux(ME, 1, 0, { moi: { paillettes: 40 } })));
  await sleep(300);
  check((await freq(p)).length === 0, 'AB1 : un nouvel état ne rejoue rien');
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await p.locator('.fxd-ban').count() === 0, 'AB1 : quitter l’écran retire le bandeau');
  check(p.errs.length === 0, 'AB1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // Partie déjà finie à l'ouverture : texte juste, aucun effet.
  p = await ouvrirDuel(browser, finD({ manche: 2, vainqueur: ME, abandon: BRUNO, historique: [M1] }, deux(ME, 1, 0)));
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 6000 }).catch(() => {});
  await sleep(500);
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Bruno a abandonné' && await p.locator('.fxd-ban').count() === 0 && (await freq(p)).length === 0, 'AB1 déjà fini : texte juste, sans effet ni son');
  await p.ctx.close();

  // ----- AB2 : j'abandonne avant la fin de la première manche -----
  p = await finDuel(browser, finD({ vainqueur: BRUNO, abandon: ME }, deux(BRUNO)));
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Tu as abandonné', 'AB2 : titre');
  check((await p.locator('.duels-fin-sous').innerText()) === 'Bruno gagne le duel.', 'AB2 : sous-titre');
  check((await p.locator('.duels-fin-chiffres [aria-hidden]').innerText()) === '0 – 0', 'AB2 : le score réel, 0 – 0');
  check((await p.locator('[data-gains]').innerText()).includes('avant la fin de la première manche'), 'AB2 : la raison de l’absence de Paillettes');
  check(contient(await freq(p), 330) && await p.locator('.fxd-ban').count() === 0, 'AB2 : son S10, sans bandeau');
  check(await p.locator('.duels-fin-bandeau.is-perdu').count() === 1, 'AB2 : bannière de perdant');
  await p.ctx.close();

  // ----- FO1 et FO2 : forfait, une manche finie, le perdant touche ses Paillettes -----
  p = await finDuel(browser, finD({ manche: 2, vainqueur: ME, forfait: BRUNO, historique: [M1] }, deux(ME, 1, 0)));
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Bruno ne joue plus', 'FO1 : titre');
  check((await p.locator('.duels-fin-sous').innerText()).includes('par forfait : 3 coups manqués'), 'FO1 : sous-titre');
  check((await p.locator('.fxd-ban').innerText()).includes('Forfait'), 'FO1 : bandeau');
  check(contient(await freq(p), 294), 'FO1 : son S11');
  await p.ctx.close();
  p = await finDuel(browser, finD({ manche: 2, vainqueur: BRUNO, forfait: ME, historique: [M1] }, deux(BRUNO, 1, 0, { moi: { paillettes: 20 } })));
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Forfait', 'FO2 : titre');
  check((await p.locator('.duels-fin-sous').innerText()).includes('Tu as manqué 3 coups d’affilée. Bruno gagne le duel.'), 'FO2 : sous-titre');
  check((await p.locator('[data-gains]').innerText()).includes('+20 Paillettes'), 'FO2 : gains réels du perdant');
  check(contient(await freq(p), 294), 'FO2 : son S11');
  await p.ctx.close();

  // ----- Spectateur d'un abandon -----
  const spect = { moi: { user_id: ALICE, joue: false, spectateur: true, defie: false, hote: false, invite: false, place: null } };
  p = await ouvrirDuel(browser, etatD({}, deux(null), spect));
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await pousser(p, finD({ vainqueur: BRUNO, abandon: ME }, deux(BRUNO), spect));
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
  await sleep(250);
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Toi a abandonné', 'spectateur : titre neutre');
  check((await p.locator('.duels-fin-sous').innerText()) === 'Bruno gagne le duel par abandon.', 'spectateur : sous-titre');
  check((await p.locator('.fxd-ban').innerText()).includes('Abandon'), 'spectateur : bandeau neutre');
  await p.ctx.close();

  // ----- Invité, abandon de l'adversaire : résultat et effets, pas de Paillettes ni de liens -----
  const inv = { moi: { user_id: ME, joue: true, spectateur: false, defie: false, hote: false, invite: true, place: 1 } };
  p = await finDuel(browser, finD({ manche: 2, vainqueur: ME, abandon: BRUNO, historique: [M1] }, deux(ME, 1, 0), inv), { invite: true });
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Bruno a abandonné', 'invité : titre');
  check((await p.locator('.fxd-ban').innerText()).includes('Abandon adverse'), 'invité : bandeau');
  check(!(await p.locator('[data-gains]').isVisible()) || !(await p.locator('[data-gains]').innerText()).includes('Paillettes'), 'invité : aucune ligne de Paillettes');
  check(p.errs.length === 0, 'invité : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- DF1, DF2 : défi vu dans la salle -----
  const defi = etatD({ statut: 'attente', defie: BRUNO, defi_expire: iso(60), tour: null, tour_fin: null }, [jd(ME, 'Toi', 1)], { defie_pseudo: 'Bruno' });
  p = await ouvrirDuel(browser, defi);
  await p.waitForSelector('.duels-salle', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, { ...defi, partie: { ...defi.partie, statut: 'annulee', version: 2 }, journal: [{ id: 2, user_id: BRUNO, type: 'info', texte: 'Bruno refuse le défi.' }] });
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 4000 }).catch(() => {});
  await sleep(200);
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Défi refusé', 'DF1 : titre « Défi refusé »');
  check((await p.locator('.duels-fin-sous').innerText()) === 'Bruno a refusé ton défi.', 'DF1 : sous-titre');
  check((await p.locator('.duels-fin-chiffres [aria-hidden]').innerText()) === '–', 'DF1 : pas de score');
  check(contient(await freq(p), 523, 440), 'DF1 : son S13');
  check(await p.locator('.duels-fin-joueur').count() === 1, 'DF1 : Bruno n’a jamais été un joueur, seul Toi apparaît');
  await p.ctx.close();
  p = await ouvrirDuel(browser, { ...defi, partie: { ...defi.partie, statut: 'annulee', defi_expire: iso(-60) } });
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Défi expiré', 'DF2 : titre « Défi expiré »');
  check((await p.locator('.duels-fin-sous').innerText()) === 'Bruno n’a pas répondu à temps.', 'DF2 : sous-titre');
  await p.screenshot({ path: __dirname + '/../../shots/socle-df2-1280.png' });
  await p.ctx.close();
  p = await ouvrirDuel(browser, etatD({ statut: 'annulee', tour: null, tour_fin: null }, [jd(ME, 'Toi', 1)]));
  await p.waitForSelector('.duels-fin-bandeau h1', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Duel annulé', 'duel annulé sans défi : titre inchangé');
  await p.ctx.close();

  // ----- TP1 : le jeu a joué pour moi -----
  const avecLigne = (n, id, manques) => etatD({ version: n, tour: ME }, deux(null, 0, 0, { moi: manques ? { manques } : {} }), { journal: [{ id, user_id: ME, type: 'auto', texte: 'Temps écoulé : le jeu joue pour Toi.' }] });
  p = await ouvrirDuel(browser, etatD({}, deux(null), { journal: [{ id: 3, user_id: ME, type: 'auto', texte: 'Temps écoulé : le jeu joue pour Toi.' }] }));
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await sleep(200);
  check(await p.locator('.duels-toast-temps').count() === 0, 'TP1 : une ligne déjà là à l’ouverture ne fait rien');
  await raz(p);
  await pousser(p, avecLigne(2, 4, 2));
  await p.waitForSelector('.duels-toast-temps', { timeout: 4000 }).catch(() => {});
  check((await p.locator('.duels-toast-temps').innerText()).includes('le jeu a joué pour toi'), 'TP1 : message bref');
  check(await p.locator('.duels-manques i').count() === 3 && await p.locator('.duels-manques i.on').count() === 2, 'TP1 : 2 points sur 3');
  check((await p.locator('.duels-manques').getAttribute('aria-label')) === '2 coups manqués sur 3', 'TP1 : compte lisible par un lecteur d’écran');
  check(contient(await freq(p), 880, 660), 'TP1 : son S12');
  await p.screenshot({ path: __dirname + '/../../shots/socle-tp1-1280.png' });
  await pousser(p, avecLigne(3, 4, 2));
  await sleep(250);
  check(await p.locator('.duels-toast-temps').count() === 1, 'TP1 : même ligne, pas de second message');
  await pousser(p, avecLigne(4, 5, null));
  await sleep(250);
  check(await p.locator('.duels-toast-temps').count() === 2 && await p.locator('.duels-toast-temps').nth(1).locator('.duels-manques').count() === 0, 'TP1 : sans la migration 185, message sans les points');
  check(p.errs.length === 0, 'TP1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- CH1 : tic à mon tour seulement -----
  p = await ouvrirDuel(browser, etatD({ tour: BRUNO, tour_fin: iso(30) }, deux(null)));
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, etatD({ tour: BRUNO, tour_fin: iso(3), version: 2 }, deux(null)));
  await sleep(1500);
  check(await p.locator('.duels-chrono.is-urgent').count() === 1 && !(await freq(p)).includes(1250), 'CH1 : au tour de l’autre, rose sans tic');
  await p.evaluate(() => { window.__TIC = 0; new MutationObserver(() => { if (document.querySelector('.duels-chrono.fxd-tic')) window.__TIC += 1; }).observe(document.querySelector('.duels-chrono'), { attributes: true, attributeFilter: ['class'] }); });
  await raz(p);
  await pousser(p, etatD({ tour: ME, tour_fin: iso(3), version: 3 }, deux(null)));
  await sleep(3400);
  const f = await freq(p);
  check(f.filter((x) => x === 1250).length === 3 && f.filter((x) => x === 1568).length === 1, 'CH1 : S14 à 3 et 2 s, S15 à 1 s, une fois par seconde — joué : ' + f.join(','));
  check((await p.evaluate(() => window.__TIC)) >= 3, 'CH1 : le chrono bat à chaque tic');
  await p.ctx.close();

  // Spectateur : le rose du chrono, jamais le tic.
  p = await ouvrirDuel(browser, etatD({ tour: ME, tour_fin: iso(30) }, deux(null), spect));
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, etatD({ tour: ME, tour_fin: iso(3), version: 2 }, deux(null), spect));
  await sleep(1500);
  check(!(await freq(p)).includes(1250), 'CH1 : spectateur, pas de tic');
  await p.ctx.close();

  // TP1 en 390 px : le message tient dans l'écran et ne passe pas sous le bouton des amis.
  p = await ouvrirDuel(browser, etatD({}, deux(null)), { width: 390, mobile: true });
  await p.waitForSelector('.duels-table', { timeout: 6000 }).catch(() => {});
  await pousser(p, avecLigne(2, 4, 2));
  await p.waitForSelector('.duels-toast-temps', { timeout: 4000 }).catch(() => {});
  await sleep(400);
  const boite = await p.locator('.duels-toast-temps').boundingBox();
  check(boite && boite.x >= 0 && boite.x + boite.width <= 390, '390 px, TP1 : le message tient dans la largeur');
  check((await hscroll(p)) <= 0, '390 px, TP1 : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/socle-tp1-390.png' });
  await p.ctx.close();

  // ----- SA3 : l'adversaire rejoint -----
  const salle = etatD({ statut: 'attente', tour: null, tour_fin: null }, [jd(ME, 'Toi', 1)]);
  p = await ouvrirDuel(browser, salle);
  await p.waitForSelector('.duels-salle', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, etatD({ tour: ME, tour_fin: iso(30), version: 2 }, deux(null)));
  await p.waitForSelector('.fxd-compte', { timeout: 3000 }).catch(() => {});
  check((await p.locator('.fxd-compte').first().innerText()) === '3', 'SA3 : décompte');
  check((await p.title()).startsWith('C’est parti !'), 'SA3 : titre d’onglet « C’est parti ! »');
  check(contient(await freq(p), 523, 659, 784, 1047), 'SA3 : son S20');
  check(await p.locator('.duels-table').count() === 1, 'SA3 : la table est déjà là, rien n’attend le décompte');
  await p.waitForSelector('.fxd-ban', { timeout: 2000 }).catch(() => {});
  const banSa3 = await p.locator('.fxd-ban').innerText();
  check(banSa3.toLowerCase().includes('bruno a rejoint'), 'SA3 : bandeau « Bruno a rejoint » — lu : ' + banSa3);
  await p.screenshot({ path: __dirname + '/../../shots/socle-sa3-1280.png' });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await p.locator('.fxd-ban, .fxd-compte').count() === 0 && !(await p.title()).includes('C’est parti'), 'SA3 : quitter retire le bandeau et rend le titre');
  check(p.errs.length === 0, 'SA3 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- Mouvement réduit (duels) : état juste, sons conservés, aucun effet posé -----
  p = await finDuel(browser, finD({ manche: 2, vainqueur: ME, abandon: BRUNO, historique: [M1] }, deux(ME, 1, 0)), { reducedMotion: 'reduce' });
  check((await p.locator('.duels-fin-bandeau h1').innerText()) === 'Bruno a abandonné', 'réduit : texte juste');
  check(await p.locator('.fxd-ban').count() === 0 && await p.locator('.duels-fin-ico.is-anime').count() === 0, 'réduit : ni bandeau ni animation');
  check(contient(await freq(p), 523, 659), 'réduit : le son reste');
  await p.ctx.close();

  // ----- 390 px -----
  p = await finDuel(browser, finD({ vainqueur: BRUNO, abandon: ME }, deux(BRUNO)), { width: 390, mobile: true });
  check((await hscroll(p)) <= 0, '390 px, abandon : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/socle-ab2-390.png' });
  await p.ctx.close();

  // ----- PV1 : je gagne, 1er sur 4 -----
  p = await finPlateau(browser, finP(quatre([1, 2, 3, 4])));
  check((await p.evaluate(() => window.__AVANT)) === 'terminee', 'table : avantFin reçoit l’état final');
  check((await p.locator('.plat-fin h1').innerText()) === 'Victoire !', 'PV1 : titre « Victoire ! »');
  check((await p.locator('.plat-fin-tampon').innerText()) === '1er sur 4', 'PV1 : tampon');
  check((await p.locator('.plat-fin-sous').innerText()) === 'Tu gagnes la partie avec 100 jetons.', 'PV1 : sous-titre');
  check((await p.locator('.fxd-ban').innerText()).includes('Victoire !'), 'PV1 : bandeau');
  check(await p.locator('.fxd-confettis').count() === 1, 'PV1 : confettis');
  check(contient(await freq(p), 523, 659, 784, 1047), 'PV1 : son S01');
  const rangs = await p.locator('.plat-classement tbody th').allInnerTexts();
  check(rangs.join(',') === '1,2,3,4', 'PV1 : classement au vrai rang, 1, 2, 3, 4 (avant : 1, 2, 2, 2)');
  check(await p.locator('.plat-podium.is-anime .plat-marche').count() === 3, 'PV3 : trois marches animées');
  check((await p.locator('.plat-marche.m1').innerText()).includes('Toi'), 'PV3 : la grande marche au premier');
  await sleep(900);
  check((await p.evaluate(() => window.__SONS)) >= 12, 'PV3 : S03 après la victoire');
  await p.screenshot({ path: __dirname + '/../../shots/socle-pv1-1280.png' });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await p.locator('.fxd-ban, .fxd-confettis').count() === 0, 'PV1 : quitter retire bandeau et confettis');
  check(p.errs.length === 0, 'PV1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // Une table qui ne rend pas la main ne retient pas l'écran de fin au-delà de 4 s.
  p = await ouvrirPlateau(browser, etatP({}, quatre([])));
  await p.waitForSelector('.faux-table', { timeout: 6000 }).catch(() => {});
  await p.evaluate(() => { window.__DELAI_FIN = 60000; });
  await pousser(p, finP(quatre([1, 2, 3, 4])));
  await sleep(1500);
  check(await p.locator('.faux-table').count() === 1 && await p.locator('.plat-fin h1').count() === 0, 'avantFin : la table reste pendant son effet');
  await p.waitForSelector('.plat-fin h1', { timeout: 5000 }).catch(() => {});
  check((await p.locator('.plat-fin h1').count()) === 1, 'avantFin : l’écran de fin arrive quand même, au plus tard à 4 s');
  await p.ctx.close();

  // ----- PV2 : je perds, 3e sur 4 -----
  p = await finPlateau(browser, finP(quatre([3, 1, 2, 4])));
  check((await p.locator('.plat-fin h1').innerText()) === 'Défaite', 'PV2 : titre « Défaite »');
  check((await p.locator('.plat-fin-tampon').innerText()) === '3e sur 4', 'PV2 : tampon, vrai rang');
  check((await p.locator('.plat-fin-sous').innerText()) === 'Alice gagne la partie. Tu finis 3e, à 100 jetons.', 'PV2 : sous-titre');
  check((await p.locator('.fxd-ban.d').innerText()).includes('Partie perdue'), 'PV2 : bandeau sobre');
  check(await p.locator('.fxd-confettis').count() === 0, 'PV2 : pas de confettis');
  check(contient(await freq(p), 392, 311), 'PV2 : son S02');
  await p.screenshot({ path: __dirname + '/../../shots/socle-pv2-1280.png' });
  await p.ctx.close();

  // ----- Invité sur un plateau : titre et effets justes, pas de colonne Paillettes -----
  p = await finPlateau(browser, finP(quatre([2, 1, 3, 4]), { moi: { user_id: ME, joue: true, hote: false, invite: true } }), { invite: true });
  check((await p.locator('.plat-fin h1').innerText()) === 'Défaite' && (await p.locator('.plat-fin-tampon').innerText()) === '2e sur 4', 'invité : titre et rang');
  check((await p.locator('.plat-classement thead').innerText()).includes('Paillettes') === false, 'invité : pas de colonne Paillettes');
  check(p.errs.length === 0, 'invité plateau : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- PV4 : joueur parti (pas de spectateur sur les plateaux) -----
  const parti = quatre([4, 1, 2, 3]); parti[0].parti = true;
  p = await finPlateau(browser, finP(parti));
  check((await p.locator('.plat-fin h1').innerText()) === 'Partie terminée', 'PV4 : titre neutre');
  check((await p.locator('.plat-fin-sous').innerText()) === 'Alice gagne la partie.', 'PV4 : sous-titre');
  check(await p.locator('.plat-fin-tampon').count() === 0, 'PV4 : pas de tampon');
  check(await p.locator('.fxd-ban.n').count() === 1 && await p.locator('.fxd-confettis').count() === 0, 'PV4 : bandeau neutre, sans fête');
  await p.ctx.close();

  // ----- Un jeu sans classement (rang 1, 2, 2, 2) : pas de faux rang -----
  const sansRang = quatre([]).map((j, i) => ({ ...j, gagne: i === 1, rang: i === 1 ? 1 : 2 }));
  p = await finPlateau(browser, finP(sansRang));
  check((await p.locator('.plat-fin h1').innerText()) === 'Défaite', 'sans rang : titre juste');
  check(await p.locator('.plat-fin-tampon').count() === 0 && await p.locator('.plat-podium').count() === 0, 'sans rang : ni tampon ni podium');
  check((await p.locator('.plat-fin-sous').innerText()) === 'Alice gagne la partie.', 'sans rang : pas de « Tu finis 2e »');
  await p.ctx.close();

  // ----- Partie déjà finie à l'ouverture -----
  p = await ouvrirPlateau(browser, finP(quatre([1, 2, 3, 4])));
  await p.waitForSelector('.plat-fin h1', { timeout: 6000 }).catch(() => {});
  await sleep(500);
  check((await p.locator('.plat-fin h1').innerText()) === 'Victoire !' && await p.locator('.fxd-ban').count() === 0 && (await freq(p)).length === 0, 'déjà finie : titre juste, sans effet ni son');
  check(await p.locator('.plat-podium').count() === 1 && await p.locator('.plat-podium.is-anime').count() === 0, 'déjà finie : podium posé, sans animation');
  await p.ctx.close();

  // ----- Mouvement réduit (plateaux) -----
  p = await finPlateau(browser, finP(quatre([1, 2, 3, 4])), { reducedMotion: 'reduce' });
  check((await p.locator('.plat-fin h1').innerText()) === 'Victoire !', 'réduit : titre juste');
  check(await p.locator('.fxd-ban, .fxd-confettis').count() === 0, 'réduit : ni bandeau ni confettis');
  check(contient(await freq(p), 523, 659, 784, 1047), 'réduit : le son reste');
  await p.ctx.close();

  // ----- 390 px, podium -----
  p = await finPlateau(browser, finP(quatre([1, 2, 3, 4])), { width: 390, mobile: true });
  check((await hscroll(p)) <= 0, '390 px, podium : pas de défilement horizontal');
  await sleep(2600);
  await p.screenshot({ path: __dirname + '/../../shots/socle-pv3-390.png', fullPage: true });
  await p.ctx.close();

  // ----- Salle : SA1, SA2, SA3 ; CH2 -----
  const pret = (j, v) => ({ ...j, pret: v });
  const att = { statut: 'attente', tour: null, tour_fin: null, started_at: null };
  const [a, b, c] = quatre([]);
  p = await ouvrirPlateau(browser, etatP({ ...att, version: 1 }, [pret(a, true), pret(b, false)]));
  await p.waitForSelector('.plat-joueurs', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, etatP({ ...att, version: 2 }, [pret(a, true), pret(b, false), pret(c, false)]));
  await p.waitForSelector('.plat-joueur.plat-arrive', { timeout: 3000 }).catch(() => {});
  check((await p.locator('.plat-joueur.plat-arrive').innerText()).includes('Bruno'), 'SA1 : la ligne du nouveau joueur glisse');
  check(contient(await freq(p), 660, 880), 'SA1 : son S18');
  await raz(p);
  await pousser(p, etatP({ ...att, version: 3 }, [pret(a, true), pret(b, true), pret(c, false)]));
  await sleep(300);
  check((await freq(p)).length === 0 && await p.locator('.plat-joueur.plat-arrive').count() === 0 || (await p.evaluate(() => window.__SONS)) === 0, 'SA1 : un changement sans arrivée ne sonne pas');
  await pousser(p, etatP({ ...att, version: 4 }, [pret(a, true), pret(b, true), pret(c, true)]));
  await sleep(300);
  check((await p.evaluate(() => window.__SONS)) === 4, 'SA2 : S19 pour l’hôte quand tout le monde est prêt');
  await raz(p);
  await pousser(p, etatP({ tour: ME, tour_fin: iso(3), version: 5, started_at: iso(0) }, [a, b, c]));
  await p.waitForSelector('.faux-table', { timeout: 4000 }).catch(() => {});
  check(contient(await freq(p), 523, 659, 784, 1047), 'SA3 : son S20');
  check((await p.title()).startsWith('C’est parti !'), 'SA3 : titre d’onglet');
  await sleep(3200);
  const f2 = await freq(p);
  check(f2.filter((x) => x === 1250).length >= 2 && f2.includes(1568), 'CH2 : tic à mon tour sur un plateau');
  check(p.errs.length === 0, 'salle : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})();
