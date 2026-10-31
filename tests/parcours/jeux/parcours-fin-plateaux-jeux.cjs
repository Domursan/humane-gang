require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours des fins de Blackjack, Poker, Catan et Pictionary (BJ1, PK1, CT1, PI1), sur les vraies tables et le vrai écran de fin :
//  gagnant, perdant, joueur parti et invité ; la table reste à l'écran le temps de l'effet (jetons, pot, tuiles, cadre), le banquier garde
//  sa carte cachée ; vrai rang dans les encarts (etat.rang, pas la colonne rang qui ne vaut que 1 ou 2) ; podium et phrases de fin.
//  Blackjack seul sous sa mise de départ (pas de fête), gagnant sous sa mise à plusieurs, tout le monde à zéro (ni podium ni rang), action
//  en vol quand la partie finit (la table retenue reste figée), Poker à deux éliminés sur la même main, retour de veille, encart après un
//  échec réseau. Puis : rien ne rejoue sur un état déjà vu ni en ouvrant une partie finie ; quitter retire tout ; mouvement réduit : état juste, sons
//  conservés, pas d'attente ; 390 px sans défilement horizontal. Faux Supabase : fixtures/fake-sb-fins.mjs (état écrit par le test).
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-fins.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ID = { Toi: ME, Alice: U(2), Bruno: U(3), Chloé: U(4) };
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();
const SHOTS = path.join(__dirname, '..', '..', 'shots');

const JEUX = {
  blackjack: { nom: 'Blackjack', code: 'HGBJK-1234', options: { manches: 8, jetons: 1000 } },
  poker: { nom: 'Poker', code: 'HGPOK-1234', options: { jetons: 2000, blinde: 10, montee: 8 } },
  catan: { nom: 'Catan du gang', code: 'HGCAT-1234', options: { objectif: 10 } },
  pictionary: { nom: 'Pictionary', code: 'HGPIC-1234', options: { manches: 2, duree: 80 } },
};

/** Avant la page : état de départ, relevé des fréquences jouées (AudioContext), jeton d'invité. */
const init = (e, code) => ({ content: `window.__FIN = { etat: ${JSON.stringify(e)} }; window.__F = [];
  localStorage.setItem('hg_plat_invite:${code}', 'jeton');
  (() => { const AC = window.AudioContext; if (!AC) return; const o = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { const n = o.call(this); const f = n.frequency; const s = f.setValueAtTime.bind(f);
      f.setValueAtTime = (v, t) => { window.__F.push(Math.round(v)); return s(v, t); };
      Object.defineProperty(f, 'value', { set(v) { window.__F.push(Math.round(v)); s(v, 0); }, get() { return 0; } }); return n; };
  })();` });

const joueur = (pseudo, place, etat, x = {}) => ({ user_id: ID[pseudo], pseudo, couleur: '#7E93C9', avatar_url: null, invite: false, place, pret: true, parti: false, absent: false, elimine: false, etat, gagne: null, rang: null, paillettes: 0, ...x });
const entete = (jeu, x = {}) => ({ id: `partie-${jeu}`, jeu, nom_jeu: JEUX[jeu].nom, code: JEUX[jeu].code, nom: 'Table du vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: true, nb_places: 8, t_tour: 60, options: JEUX[jeu].options, tour: ID.Alice, tour_fin: iso(40), nb_tours: 8, suite: null, raison: null, version: 1, started_at: iso(-600), ended_at: null, ...x });
const etat = (jeu, joueurs, J, x = {}, p = {}) => ({ partie: entete(jeu, p), maintenant: iso(0), moi: { user_id: ME, joue: true, hote: true, invite: false }, joueurs, jeu: J, journal: [], badges: [], ...x });

/** État final : rang réel dans etat.rang, colonne rang à 1 ou 2 (hg_plat__terminer). liste : [pseudo, etat, rang]. */
function fin(jeu, liste, { parti = null, elimines = false, version = 9 } = {}) {
  const js = liste.map(([pseudo, e, rang], i) => joueur(pseudo, i + 1, { ...e, rang }, { gagne: rang === 1, rang: rang === 1 ? 1 : 2, parti: pseudo === parti, elimine: elimines && rang !== 1, paillettes: 20 }));
  return etat(jeu, js, null, {}, { statut: 'terminee', tour: null, tour_fin: null, version, ended_at: iso(0), raison: 'jetons' });
}

/* ---------- Tables : les derniers états avant la fin ---------- */
const mainBJ = (jetons, mise, cartes, statut) => ({ jetons, mise, mains: [{ cartes, mise, statut }], resultat: null });
const jeuBJ = (actif) => ({ phase: 'jeu', actif: ID[actif], main: 0, manche: 8, manches: 8, banque: ['TS', '??'], banque_total: null, sabot: 142, totaux: {} });
const tableBJ = (noms) => etat('blackjack', [joueur(noms[0], 1, mainBJ(3450, 200, ['KD', 'AS'], 'blackjack')), joueur(noms[1], 2, mainBJ(2900, 200, ['9C', '9D'], 'reste')), joueur(noms[2], 3, mainBJ(1200, 100, ['7H', 'QC'], 'joue')), joueur(noms[3], 4, { jetons: 0, mise: 0, mains: [], resultat: null })], jeuBJ(noms[2]));
const finBJ = (noms, o) => fin('blackjack', [[noms[0], { jetons: 3450, mise: 0, mains: [] }, 1], [noms[1], { jetons: 2900, mise: 0, mains: [] }, 2], [noms[2], { jetons: 1200, mise: 0, mains: [] }, 3], [noms[3], { jetons: 0, mise: 0, mains: [] }, 4]], o);

const miseP = (jetons, mise, x = {}) => ({ jetons, mise, engage: mise, couche: false, tapis: false, action: null, ...x });
const jeuPK = (actif, mes) => ({ phase: 'river', actif: ID[actif], donneur: ID[actif], board: ['AS', 'KS', '7D', '7C', '2H'], pot: 1800, mise_max: 200, relance_min: 200, blinde: 200, main: 14, mes_cartes: mes, ma_force: mes ? 'Deux paires' : null, abattage: null, precedente: null });
const tablePK = (noms, mes) => etat('poker', [joueur(noms[0], 1, miseP(6200, 0)), joueur(noms[1], 2, miseP(0, 200, { tapis: true, action: 'tapis' })), joueur(noms[2], 3, { ...miseP(0, 0), rang: 3 }, { elimine: true }), joueur(noms[3], 4, { ...miseP(0, 0), rang: 4 }, { elimine: true })], jeuPK(noms[0], mes));
const finPK = (noms, o) => fin('poker', [[noms[0], { jetons: 8000 }, 1], [noms[1], { jetons: 0 }, 2], [noms[2], { jetons: 0 }, 3], [noms[3], { jetons: 0 }, 4]], { elimines: true, ...o });

const GEO = JSON.parse(/const GEO = (\{.*\});/.exec(fs.readFileSync(path.join(__dirname, '..', '..', 'fixtures', 'fake-sb-catan.mjs'), 'utf8'))[1]);
const RES = ['bois', 'argile', 'ble', 'mouton', 'pierre'];
const jeuCT = { geo: GEO, tuiles: GEO.hexes.map((h, i) => (i === 18 ? { res: 'desert', num: null } : { res: RES[i % 5], num: 2 + (i % 5) })), voleur: 18, colonies: { 8: ME }, villes: {}, routes: { 14: ME }, phase: 'action', sous: null, dernier: null, de: [5, 2], objectif: 10, mes_ressources: { bois: 1, argile: 1, ble: 1, mouton: 1, pierre: 0 }, couts: { route: { bois: 1, argile: 1 } } };
const pts = (n) => ({ points: n, colonies: 2, villes: 1, routes: 5, cartes: 2 });
const tableCT = (noms) => etat('catan', [joueur(noms[0], 1, pts(9)), joueur(noms[1], 2, pts(8)), joueur(noms[2], 3, pts(7)), joueur(noms[3], 4, pts(4))], jeuCT, {}, { tour: ID[noms[0]] });
const finCT = (noms, o) => fin('catan', [[noms[0], pts(10), 1], [noms[1], pts(8), 2], [noms[2], pts(7), 3], [noms[3], pts(4), 4]], o);

const TRAITS = [{ s: 'p1', c: '#B70127', e: 0.02, p: [[0.1, 0.1], [0.9, 0.2], [0.5, 0.8]] }];
const jeuPI = (dess) => ({ phase: 'dessin', dessinateur: ID[dess], manche: 2, manches: 2, duree: 80, tour_n: 8, choix: null, mot: null, trouves: [], traits: TRAITS, precedent: null, indice: '_ _ _ _', canal: 'pict:x' });
const tablePI = (noms) => etat('pictionary', [joueur(noms[0], 1, { points: 40 }), joueur(noms[1], 2, { points: 35 }), joueur(noms[2], 3, { points: 21 }), joueur(noms[3], 4, { points: 21 })], jeuPI(noms[1]));
// Bruno et Chloé à égalité : ils partagent le 3e rang (hg_pi__fin), l'ancien encart comptait 3 et 4.
const finPI = (noms, o) => fin('pictionary', [[noms[0], { points: 42 }, 1], [noms[1], { points: 35 }, 2], [noms[2], { points: 21 }, 3], [noms[3], { points: 21 }, 3]], o);

const GAGNE = ['Toi', 'Alice', 'Bruno', 'Chloé'];
const PERD = ['Alice', 'Bruno', 'Toi', 'Chloé'];

/* ---------- Pilotage ---------- */
const pousser = (p, e) => p.evaluate((x) => window.__FIN.pousser(x), e);
const freq = (p) => p.evaluate(() => window.__F);
const raz = (p) => p.evaluate(() => { window.__F = []; });
const contient = (l, ...v) => v.every((x) => l.includes(x));
const finAffichee = (p) => p.waitForSelector('.plat-fin h1', { timeout: 6000 }).then(() => p.waitForSelector('.plat-recap > *', { timeout: 2000 })).catch(() => {});

/** Ouvre la vraie table, réveille le son par un geste, et renvoie la page prête à recevoir l'état final. */
async function table(browser, jeu, e, sel, o = {}) {
  const p = await openPage(browser, { page: jeu, fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${JEUX[jeu].code}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e, JEUX[jeu].code) });
  await p.waitForSelector(sel, { timeout: 8000 }).catch(() => {});
  check(await p.locator(sel).count() >= 1, `${jeu} : la vraie table est affichée`);
  await p.mouse.click(5, 300);
  await sleep(100);
  await raz(p);
  return p;
}
const rangs = (p, sel) => p.locator(sel).allTextContents();
const texte = (p, sel) => p.locator(sel).first().innerText();

(async () => {
  const browser = await chromium.launch();
  let p;

  // ----- BJ1, je gagne : la table reste, les jetons viennent de la banque vers mon siège, la carte reste cachée -----
  p = await table(browser, 'blackjack', tableBJ(GAGNE), '.bj-tapis');
  await pousser(p, finBJ(GAGNE));
  await sleep(600);
  check(await p.locator('.bj-tapis').count() === 1 && await p.locator('.plat-fin').count() === 0, 'BJ1 : la table reste à l’écran pendant l’effet');
  check(await p.locator('.bj-anim-jeton.fxd-jeton').count() === 6, 'BJ1 : six jetons en vol');
  const volBJ = await p.locator('.bj-anim-jeton.fxd-jeton').first().evaluate((j) => { const m = /translate\((-?[\d.]+)px, *(-?[\d.]+)px/.exec(j.style.transform); const s = document.querySelector('.bj-siege.is-moi').getBoundingClientRect(); return m ? Math.abs(parseFloat(j.style.left) + 11 + Number(m[1]) - (s.left + s.width / 2)) : 999; });
  check(volBJ < 4, 'BJ1 : les jetons vont vers mon siège');
  check(await p.locator('.bj-cartes-banque .cd-dos').count() === 1 && !/\d/.test(await p.locator('.bj-banque-total').innerText()), 'BJ1 : la banque garde sa carte cachée, pas de total');
  check((await texte(p, '.fxd-ban')).includes('Victoire !') && (await texte(p, '.fxd-ban small')).toLowerCase() === 'la banque a payé', 'BJ1 : bandeau « Victoire ! », « La banque a payé »');
  check(await p.locator('.fxd-confettis').count() === 1, 'BJ1 : confettis');
  check(await p.locator('.bj-quitter').isDisabled(), 'BJ1 : plus d’action pendant que la table reste');
  await p.screenshot({ path: path.join(SHOTS, 'fin-bj-table-1280.png') });
  await finAffichee(p);
  check(/Tu gagnes la partie avec 3.450 jetons\./.test(await texte(p, '.plat-fin-sous')), 'BJ1 : « Tu gagnes la partie avec 3 450 jetons. »');
  check((await rangs(p, '.bf-rang')).join('|') === '1er · Gagnant|2e|3e|4e', 'blackjack : les cartes donnent le vrai rang (1er, 2e, 3e, 4e)');
  check((await texte(p, '.plat-marche.m1')).includes('jetons'), 'BJ1 : première marche en jetons');
  await sleep(1500);
  check(contient(await freq(p), 1200, 523, 1319, 880), 'BJ1 : S05, S01 puis S03');
  await p.screenshot({ path: path.join(SHOTS, 'fin-bj-fin-1280.png') });
  // Un état déjà vu ne rejoue rien.
  await raz(p);
  await pousser(p, finBJ(GAGNE, { version: 10 }));
  await sleep(500);
  check((await freq(p)).length === 0 && await p.locator('.bj-anim-jeton').count() === 0, 'BJ1 : un état déjà vu ne rejoue rien');
  check(p.errs.length === 0, 'BJ1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- BJ1, je perds : les jetons repartent vers la banque, le rang est le mien -----
  p = await table(browser, 'blackjack', tableBJ(PERD), '.bj-tapis');
  await pousser(p, finBJ(PERD));
  await sleep(600);
  check(await p.locator('.bj-anim-jeton.fxd-jeton').count() === 5, 'BJ1 perdu : cinq jetons en vol');
  const banqueVol = await p.locator('.bj-anim-jeton.fxd-jeton').first().evaluate((j) => { const m = /translate\((-?[\d.]+)px, *(-?[\d.]+)px/.exec(j.style.transform); const s = document.querySelector('.bj-banque').getBoundingClientRect(); return m ? Math.abs(parseFloat(j.style.left) + 11 + Number(m[1]) - (s.left + s.width / 2)) : 999; });
  check(banqueVol < 4, 'BJ1 perdu : les jetons repartent vers la banque');
  check(await p.locator('.fxd-ban.d').count() === 1 && await p.locator('.fxd-confettis').count() === 0, 'BJ1 perdu : bandeau sobre, pas de confettis');
  await finAffichee(p);
  check((await texte(p, '.plat-fin h1')) === 'Défaite' && /Tu finis 3e, à 1.200 jetons\./.test(await texte(p, '.plat-fin-sous')), 'BJ1 perdu : « Tu finis 3e, à 1 200 jetons. »');
  check((await texte(p, '.plat-fin-tampon')) === '3e sur 4', 'BJ1 perdu : tampon « 3e sur 4 »');
  check((await rangs(p, '.bf-rang')).join('|') === '1er · Gagnant|2e|3e|4e', 'BJ1 perdu : pas « 2e » pour tous les perdants');
  check(contient(await freq(p), 392, 311), 'BJ1 perdu : S02');
  await p.ctx.close();

  // ----- Joueur parti : pas d'effet de table, pas d'attente, S04 -----
  p = await table(browser, 'blackjack', tableBJ(PERD), '.bj-tapis');
  await pousser(p, finBJ(PERD, { parti: 'Toi' }));
  await sleep(400);
  check(await p.locator('.plat-fin').count() === 1 && await p.locator('.bj-anim-jeton').count() === 0, 'parti : écran de fin aussitôt, sans jetons');
  await sleep(100);
  check((await texte(p, '.plat-fin h1')) === 'Partie terminée' && await p.locator('.fxd-ban.n').count() === 1, 'parti : « Partie terminée », bandeau neutre');
  check(contient(await freq(p), 659) && !(await freq(p)).includes(392), 'parti : S04, pas S02');
  await p.ctx.close();

  // ----- Invité à 390 px : effet, pas de défilement horizontal, pas de gains -----
  p = await table(browser, 'blackjack', tableBJ(GAGNE), '.bj-tapis', { invite: true, width: 390, mobile: true });
  await pousser(p, finBJ(GAGNE));
  await sleep(600);
  check(await p.locator('.bj-anim-jeton.fxd-jeton').count() === 6, 'invité 390 px : jetons en vol');
  check((await hscroll(p)) <= 0, 'invité 390 px : pas de défilement horizontal pendant l’effet');
  await p.screenshot({ path: path.join(SHOTS, 'fin-bj-table-390.png') });
  await finAffichee(p);
  check((await texte(p, '.plat-fin h1')) === 'Victoire !' && await p.locator('.plat-recompense').count() === 0, 'invité : victoire, sans Paillettes');
  check((await hscroll(p)) <= 0, 'invité 390 px : écran de fin sans défilement horizontal');
  await p.ctx.close();

  // ----- Quitter pendant l'effet : rien d'orphelin -----
  p = await table(browser, 'blackjack', tableBJ(GAGNE), '.bj-tapis');
  await pousser(p, finBJ(GAGNE));
  await sleep(600);
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(400);
  check(await p.locator('.fxd-jeton, .fxd-ban, .fxd-confettis').count() === 0, 'quitter : jetons, bandeau et confettis retirés');
  await sleep(2200);
  check(await p.locator('.plat-fin').count() === 0, 'quitter : l’écran de fin ne s’impose pas après coup');
  check(p.errs.length === 0, 'quitter : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- Partie déjà finie à l'ouverture : texte juste, sans effet -----
  p = await openPage(browser, { page: 'blackjack', fixture: FIX, hash: '#partie/HGBJK-1234', width: 1280, height: 900, init: init(finBJ(PERD), 'HGBJK-1234') });
  await finAffichee(p);
  await sleep(500);
  check(await p.locator('.fxd-ban').count() === 0 && (await freq(p)).length === 0, 'déjà finie : ni bandeau ni son');
  await p.ctx.close();

  // ----- PK1, je gagne : le pot part vers moi -----
  p = await table(browser, 'poker', tablePK(GAGNE, ['AD', 'QH']), '.pk-tapis');
  await pousser(p, finPK(GAGNE));
  await sleep(600);
  check(await p.locator('.pk-tapis').count() === 1 && await p.locator('.pk-jeton-vol.fxd-jeton').count() === 7, 'PK1 : la table reste, sept jetons partent du pot');
  check((await texte(p, '.fxd-ban small')).toLowerCase() === 'dernier joueur à table', 'PK1 : « Dernier joueur à table »');
  await p.screenshot({ path: path.join(SHOTS, 'fin-pk-table-1280.png') });
  await finAffichee(p);
  check(/Tu gagnes la partie avec 8.000 jetons\./.test(await texte(p, '.plat-fin-sous')), 'PK1 : « Tu gagnes la partie avec 8 000 jetons. »');
  check((await rangs(p, '.pf-rang')).map((t) => t.split(' ')[0]).join('|') === '1er|2e|3e|4e', 'poker : les cartes donnent le vrai rang');
  check((await texte(p, '.plat-marche.m2 small')) === '2e', 'PK1 : un éliminé n’a pas de montant sur sa marche, son rang à la place');
  check(contient(await freq(p), 1200, 523), 'PK1 : S06 et S01');
  check(p.errs.length === 0, 'PK1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- PK1, je perds, déjà éliminé : le pot part vers Alice -----
  p = await table(browser, 'poker', tablePK(PERD, null), '.pk-tapis');
  await pousser(p, finPK(PERD));
  await sleep(600);
  check(await p.locator('.pk-jeton-vol.fxd-jeton').count() === 5, 'PK1 perdu : cinq jetons');
  const volPK = await p.locator('.pk-jeton-vol.fxd-jeton').first().evaluate((j, a) => { const m = /translate\((-?[\d.]+)px, *(-?[\d.]+)px/.exec(j.style.transform); const s = document.querySelector(`.pk-siege[data-uid="${a}"]`).getBoundingClientRect(); return m ? Math.abs(parseFloat(j.style.left) + 11 + Number(m[1]) - (s.left + s.width / 2)) : 999; }, ID.Alice);
  check(volPK < 4, 'PK1 perdu : le pot va au siège d’Alice');
  await finAffichee(p);
  check(/Tu finis 3e, éliminé\./.test(await texte(p, '.plat-fin-sous')), 'PK1 perdu : « Tu finis 3e, éliminé. »');
  await p.ctx.close();

  // ----- CT1, je gagne : les 19 tuiles s'allument l'une après l'autre, puis la fin -----
  p = await table(browser, 'catan', tableCT(GAGNE), '.ct-hex');
  await p.evaluate(() => { window.__T = []; const n = () => document.querySelectorAll('.ct-hex.ct-tuile-fin').forEach((h) => { if (!window.__T.includes(h)) window.__T.push(h); }); new MutationObserver(n).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); });
  const t0 = Date.now();
  await pousser(p, finCT(GAGNE));
  await sleep(1200);
  const enCours = await p.evaluate(() => window.__T.length);
  check(enCours > 3 && enCours < 19, `CT1 : les tuiles s’allument une à une (${enCours} à 1,2 s)`);
  check(await p.locator('.fxd-confettis').count() === 1 && (await texte(p, '.fxd-ban small')).toLowerCase() === '10 points', 'CT1 : confettis, « 10 points »');
  await p.screenshot({ path: path.join(SHOTS, 'fin-ct-table-1280.png') });
  await finAffichee(p);
  check(await p.evaluate(() => window.__T.length) === 19, 'CT1 : les 19 tuiles se sont allumées');
  check(Date.now() - t0 < 4600, 'CT1 : l’écran de fin arrive dans la limite de 4 s');
  check((await texte(p, '.plat-fin-sous')) === 'Tu gagnes la partie avec 10 points.', 'CT1 : « Tu gagnes la partie avec 10 points. »');
  check((await rangs(p, '.ct-fin-rang')).join('|') === '1er|2e|3e|4e', 'catan : le bilan donne le vrai rang');
  check(contient(await freq(p), 784, 1047, 523), 'CT1 : S07 et S01');
  check(p.errs.length === 0, 'CT1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- CT1, je perds : défaite sobre, pas de tuiles, pas d'attente -----
  p = await table(browser, 'catan', tableCT(PERD), '.ct-hex', { width: 390, mobile: true });
  await pousser(p, finCT(PERD));
  await sleep(500);
  check(await p.locator('.plat-fin').count() === 1 && await p.locator('.ct-tuile-fin').count() === 0, 'CT1 perdu : écran de fin aussitôt, sans tuiles');
  await sleep(200);
  check(/Tu finis 3e, à 7 points\./.test(await texte(p, '.plat-fin-sous')) && (await hscroll(p)) <= 0, 'CT1 perdu : « Tu finis 3e, à 7 points. », 390 px sans défilement');
  await p.ctx.close();

  // ----- PI1, je gagne : la dernière toile reçoit son cadre doré -----
  p = await table(browser, 'pictionary', tablePI(GAGNE), '.pi-toile');
  await pousser(p, finPI(GAGNE));
  await sleep(1000);
  check(await p.locator('.pi-toile.pi-toile-fin').count() === 1, 'PI1 : cadre posé sur la dernière toile');
  check((await p.locator('.pi-toile').evaluate((t) => getComputedStyle(t).boxShadow)).includes('232, 204, 133'), 'PI1 : le cadre est doré');
  check((await texte(p, '.fxd-ban small')).toLowerCase() === '42 points', 'PI1 : « 42 points »');
  await p.screenshot({ path: path.join(SHOTS, 'fin-pi-table-1280.png') });
  await finAffichee(p);
  check((await texte(p, '.plat-fin-sous')) === 'Tu gagnes la partie avec 42 points.', 'PI1 : « Tu gagnes la partie avec 42 points. »');
  check((await rangs(p, '.pi-rang')).join('|') === '1|2|3|3', 'pictionary : à égalité, le vrai rang est partagé');
  check(contient(await freq(p), 659, 784, 1047, 523), 'PI1 : S08 et S01');
  check(p.errs.length === 0, 'PI1 : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  // ----- PI1, je perds : pas de cadre -----
  p = await table(browser, 'pictionary', tablePI(PERD), '.pi-toile');
  await pousser(p, finPI(PERD));
  await sleep(500);
  check(await p.locator('.plat-fin').count() === 1, 'PI1 perdu : écran de fin aussitôt');
  await sleep(200);
  check(/Tu finis 3e, à 21 points\./.test(await texte(p, '.plat-fin-sous')), 'PI1 perdu : « Tu finis 3e, à 21 points. »');
  await p.ctx.close();

  // ----- Blackjack seul, reparti avec moins : pas de fête, ligne sobre -----
  const seul = (n) => fin('blackjack', [['Toi', { jetons: n, mise: 0, mains: [] }, 1]]);
  const tableSeul = () => etat('blackjack', [joueur('Toi', 1, mainBJ(200, 100, ['7H', 'QC'], 'joue'))], jeuBJ('Toi'));
  p = await table(browser, 'blackjack', tableSeul(), '.bj-tapis');
  await pousser(p, seul(50));
  await sleep(600);
  check(await p.locator('.fxd-ban.d').count() === 1 && await p.locator('.fxd-confettis').count() === 0, 'seul à 50 jetons : bandeau sobre, pas de confettis');
  check((await p.locator('.fxd-ban small').textContent()) === 'Partie finie avec 50 jetons', 'seul à 50 jetons : « Partie finie avec 50 jetons », pas « La banque a payé »');
  check(await p.locator('.bj-anim-jeton.fxd-jeton').count() === 5, 'seul à 50 jetons : les jetons repartent vers la banque');
  await finAffichee(p);
  check((await texte(p, '.plat-fin h1')) === 'Défaite' && (await texte(p, '.plat-fin-sous')) === 'Partie finie avec 50 jetons.', 'seul à 50 jetons : écran de fin sobre');
  check(await p.locator('.plat-fin-tampon').count() === 0 && await p.locator('.plat-gagnant').count() === 0, 'seul à 50 jetons : ni tampon ni gagnant');
  check(!(await texte(p, '.bf-rang')).toLowerCase().includes('gagnant') && await p.locator('.bf-carte.is-gagnant').count() === 0, 'seul à 50 jetons : la carte ne dit pas « Gagnant »');
  check(contient(await freq(p), 392, 311) && !(await freq(p)).includes(1200), 'seul à 50 jetons : S02, pas S05');
  await p.ctx.close();
  // Seul, reparti avec plus : la fête reste.
  p = await table(browser, 'blackjack', tableSeul(), '.bj-tapis');
  await pousser(p, seul(1500));
  await sleep(600);
  check((await p.locator('.fxd-ban small').textContent()) === 'La banque a payé' && await p.locator('.fxd-confettis').count() === 1, 'seul à 1 500 jetons : victoire, la banque a payé');
  await p.ctx.close();
  // À plusieurs, le gagnant sous sa mise de départ gagne, sans que la banque ait payé.
  p = await table(browser, 'blackjack', tableBJ(GAGNE), '.bj-tapis');
  await pousser(p, fin('blackjack', [['Toi', { jetons: 800 }, 1], ['Alice', { jetons: 500 }, 2], ['Bruno', { jetons: 100 }, 3]]));
  await sleep(600);
  check((await p.locator('.fxd-ban').textContent()).includes('Victoire !') && (await p.locator('.fxd-ban small').textContent()) === 'Tu gagnes la partie', 'à plusieurs, gagnant à 800 sur 1 000 : la banque n’a pas payé');
  await p.ctx.close();

  // ----- Tout le monde à zéro : ni podium ni rang -----
  const zero = (jeu, e) => { const f = fin(jeu, [['Toi', e, 1], ['Alice', e, 1], ['Bruno', e, 1]]); f.joueurs.forEach((j) => { j.gagne = false; j.rang = 2; }); return f; };
  p = await table(browser, 'blackjack', tableBJ(GAGNE), '.bj-tapis');
  await pousser(p, zero('blackjack', { jetons: 0 }));
  await finAffichee(p);
  check((await texte(p, '.plat-fin-sous')) === 'Pas de gagnant désigné.' && await p.locator('.plat-podium').count() === 0, 'blackjack à zéro : pas de gagnant, pas de podium');
  check((await p.locator('.plat-classement tbody th').allTextContents()).join('') === '–––', 'blackjack à zéro : classement sans rang');
  check((await rangs(p, '.bf-rang')).join('') === '–––', 'blackjack à zéro : cartes sans rang');
  await p.ctx.close();
  p = await table(browser, 'pictionary', tablePI(GAGNE), '.pi-toile');
  await pousser(p, zero('pictionary', { points: 0 }));
  await finAffichee(p);
  check(await p.locator('.plat-podium').count() === 0 && (await rangs(p, '.pi-rang')).join('') === '–––', 'pictionary à zéro : ni podium ni rang');
  await p.ctx.close();

  // ----- Action en vol quand la partie finit : la table retenue reste figée -----
  p = await table(browser, 'catan', tableCT(GAGNE), '.ct-hex');
  await p.evaluate(() => { window.__FIN.delai = 500; window.__H = document.querySelector('.ct-hex'); });
  await p.locator('[data-finir]').click();
  await pousser(p, finCT(GAGNE));
  await sleep(1100);
  check(await p.evaluate(() => window.__H.isConnected), 'catan : l’action en vol ne reconstruit pas les tuiles retenues');
  check(await p.locator('.ct-tuile-fin').count() > 0, 'catan : les tuiles continuent de s’allumer');
  await p.locator('[data-finir]').click({ force: true, timeout: 500 }).catch(() => {});
  await sleep(100);
  check(await p.evaluate(() => window.__FIN.agir) === 1, 'catan : plus aucune action pendant la retenue, même l’envoi fini');
  await p.ctx.close();
  p = await table(browser, 'blackjack', tableBJ(PERD), '.bj-tapis');
  await p.evaluate(() => { window.__FIN.delai = 300; });
  await p.locator('[data-action="tirer"]').click();
  await pousser(p, finBJ(PERD));
  await sleep(800);
  await p.locator('[data-action="tirer"]').click({ force: true, timeout: 500 }).catch(() => {});
  await sleep(100);
  check(await p.evaluate(() => window.__FIN.agir) === 1 && await p.locator('.bj-tapis').count() === 1, 'blackjack : plus aucune action pendant la retenue');
  await p.ctx.close();

  // ----- Poker : deux éliminés sur la même main, le serveur écrit 1, 3, 3 -----
  p = await table(browser, 'poker', tablePK(['Alice', 'Bruno', 'Toi', 'Chloé'], null), '.pk-tapis');
  await pousser(p, fin('poker', [['Alice', { jetons: 6000 }, 1], ['Toi', { jetons: 0 }, 3], ['Bruno', { jetons: 0 }, 3]], { elimines: true }));
  await finAffichee(p);
  check((await rangs(p, '.pf-rang')).map((t) => t.split(' ')[0]).join('|') === '1er|2e|2e', 'poker : à égalité, 1er, 2e, 2e sur les cartes');
  check((await p.locator('.plat-classement tbody th').allTextContents()).join('') === '122', 'poker : 1, 2, 2 au classement');
  check((await texte(p, '.plat-fin-tampon')) === '2e sur 3' && /Tu finis 2e/.test(await texte(p, '.plat-fin-sous')), 'poker : mon rang est le 2e');
  await p.ctx.close();

  // ----- Retour de veille : fin ou départ de plus de 30 s, pas d'effet -----
  p = await table(browser, 'blackjack', tableBJ(GAGNE), '.bj-tapis');
  { const f = finBJ(GAGNE); f.partie.ended_at = iso(-600); await pousser(p, f); }
  await sleep(500);
  check(await p.locator('.plat-fin').count() === 1 && await p.locator('.fxd-ban, .fxd-confettis, .fxd-jeton').count() === 0 && (await freq(p)).length === 0, 'veille : fin ancienne, ni bandeau, ni confettis, ni son');
  await p.ctx.close();
  p = await table(browser, 'blackjack', { ...tableBJ(GAGNE), partie: entete('blackjack', { statut: 'attente', tour: null, tour_fin: null, started_at: null }), jeu: null }, '.plat-fin, body');
  await sleep(600);
  await pousser(p, tableBJ(GAGNE));
  await p.waitForSelector('.bj-tapis', { timeout: 4000 }).catch(() => {});
  await sleep(300);
  check(await p.locator('.bj-tapis').count() === 1 && await p.locator('.fxd-compte').count() === 0 && !(await p.title()).includes('C’est parti'), 'veille : départ ancien, pas de 3-2-1');
  await p.ctx.close();

  // ----- Encart perdu par un échec réseau : réessayé à l'état suivant -----
  p = await openPage(browser, { page: 'blackjack', fixture: FIX, hash: '#partie/HGBJK-1234', width: 1280, height: 900, init: init(finBJ(PERD), 'HGBJK-1234') });
  await p.waitForSelector('.bf-carte', { timeout: 6000 }).catch(() => {});
  await p.route(/jeux\/blackjack\/fin\.js$/, (r) => r.abort());
  await p.reload();
  await p.waitForSelector('.plat-fin h1', { timeout: 6000 }).catch(() => {});
  await sleep(500);
  check(await p.locator('.bf-carte').count() === 0, 'réseau : l’encart manque après l’échec');
  await pousser(p, finBJ(PERD, { version: 11 }));
  await p.waitForSelector('.bf-carte', { timeout: 3000 }).catch(() => {});
  check(await p.locator('.bf-carte').count() === 4, 'réseau : l’encart revient à l’état suivant');
  await p.ctx.close();

  // ----- Mouvement réduit : état juste, sons conservés, pas d'attente, rien posé -----
  const REDUIT = [
    ['blackjack', tableBJ(GAGNE), finBJ(GAGNE), '.bj-tapis', 1200, /3.450 jetons/],
    ['poker', tablePK(GAGNE, ['AD', 'QH']), finPK(GAGNE), '.pk-tapis', 1200, /8.000 jetons/],
    ['catan', tableCT(GAGNE), finCT(GAGNE), '.ct-hex', 1047, /10 points/],
    ['pictionary', tablePI(GAGNE), finPI(GAGNE), '.pi-toile', 1047, /42 points/],
  ];
  for (const [jeu, avant, apres, sel, f, re] of REDUIT) {
    p = await table(browser, jeu, avant, sel, { reducedMotion: 'reduce' });
    await pousser(p, apres);
    await sleep(500);
    check(await p.locator('.plat-fin').count() === 1, `${jeu}, mouvement réduit : écran de fin aussitôt`);
    check(await p.locator('.fxd-ban, .fxd-confettis, .fxd-jeton, .ct-tuile-fin, .pi-toile-fin').count() === 0, `${jeu}, mouvement réduit : rien d’animé`);
    await sleep(200);
    check(re.test(await texte(p, '.plat-fin-sous')) && (await texte(p, '.plat-fin h1')) === 'Victoire !', `${jeu}, mouvement réduit : texte juste`);
    check(contient(await freq(p), f, 523), `${jeu}, mouvement réduit : sons conservés`);
    check(p.errs.length === 0, `${jeu}, mouvement réduit : aucune erreur JS` + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
