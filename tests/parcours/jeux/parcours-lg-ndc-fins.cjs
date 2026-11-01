require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours des fins du Loup-Garou et de Nom de code (maquette validée, oct. 2026), sur les vraies vues, état écrit par le test :
//  Loup-Garou : LG1, LG2 (ciel, son, bandeau), vainqueur solo, partie arrêtée, joueur de l'autre camp, meneur, invité.
//    Secrets : le bandeau de fin est le même pour tous et ne nomme aucun rôle ; à l'aube, seule la victime a sa carte ; un vivant reste caché.
//  Nom de code : ND1 (mots, forfait), ND2, équipe qui touche l'assassin, victoire, spectateur, invité, joueur parti, plus aucune
//    « Partie perdue » pour l'équipe qui gagne.
//  Partout : rien ne rejoue sur un état déjà vu ni en ouvrant une partie déjà finie, rien d'orphelin en quittant ; mouvement réduit : état
//    juste, sons conservés ; 390 px sans défilement horizontal.
// Faux Supabase : fixtures/fake-sb-lg-ndc.mjs. Sons reconnus à leurs fréquences (S35 : 523, 659, 784, 1047 ; S36 : 300, 520 ; S02 : 392, 311).
// Lancer une moitié : node parcours-lg-ndc-fins.cjs lg (ou ndc).
const path = require('path');
const { check, finish, openPage, hscroll, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-lg-ndc.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ALICE = U(2), BRUNO = U(3), CHLOE = U(4), DAVID = U(5), EMMA = U(6);
const CODEL = 'HGLG-4242', CODEN = 'HGNDC-4242';
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

/** Avant la page : état de départ, relevé des fréquences jouées, jetons d'invité. */
const init = (e) => ({ content: `window.__FIN = { etat: ${JSON.stringify(e)} };
  window.__F = []; window.__SONS = 0;
  localStorage.setItem('hg_lg_invite:${CODEL}', 'jeton'); localStorage.setItem('hg_ndc_invite:${CODEN}', 'jeton');
  (() => { const AC = window.AudioContext; if (!AC) return;
    const o = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { window.__SONS += 1; const n = o.call(this); const f = n.frequency; const s = f.setValueAtTime.bind(f);
      f.setValueAtTime = (v, t) => { window.__F.push(Math.round(v)); return s(v, t); }; return n; };
    const b = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () { window.__SONS += 1; return b.call(this); };
  })();` });

const pousser = (p, e) => p.evaluate((x) => window.__FIN.pousser(x), e);
const freq = (p) => p.evaluate(() => window.__F);
const sons = (p) => p.evaluate(() => window.__SONS);
const raz = (p) => p.evaluate(() => { window.__F = []; window.__SONS = 0; });
const contient = (l, ...v) => v.every((x) => l.includes(x));
const texte = (p, s) => p.$eval(s, (n) => n.textContent).catch(() => null);
const nb = (p, s) => p.$$eval(s, (l) => l.length);

/* ---------- Loup-Garou (formes de hg_lg_etat) ---------- */
const CAMP = { voyante: 'village', villageois: 'village', 'loup-garou': 'loups' };
/** Joueur tel que le serveur l'envoie : rôle caché s'il est vivant, sauf le mien ; tout est visible à la fin (fini). */
const jl = (id, pseudo, place, role, vivant, cause, manche, fini, gagne = null) => ({ user_id: id, pseudo, couleur: '#7E93C9', avatar_url: null, invite: false, place, pret: true, vu_role: true, vivant, mort_cause: cause, mort_manche: manche, capitaine: false, peut_voter: vivant, gagne, paillettes: fini ? 40 : null,
  role: fini || !vivant || id === ME ? role : null, camp: fini || id === ME ? CAMP[role] : null, etat_mj: null });
const moiL = (role, x = {}) => ({ user_id: ME, meneur: false, hote: true, joueur: true, vivant: true, role, role_initial: role, camp: CAMP[role], amoureux: null, envoute: false, allies: [], pouvoir_perdu: false, action: null, ...x });
const partieL = (x) => ({ id: 'partie-lg', code: CODEL, nom: 'Loups du vendredi', mode: 'classique', visibilite: 'privee', statut: 'en_cours', phase: 'debat', manche: 2, phase_fin: iso(60), pause_reste: null, maintenant: iso(0), nb_joueurs: 6, invites: false, t_nuit: 60, t_jour: 90, t_vote: 45, annonce_discord: false, composition: { voyante: 1, 'loup-garou': 2, villageois: 3 }, vainqueur: null, version: 1, hote: ME, hote_pseudo: 'Toi', corbeau: null, mvp: null, started_at: iso(-900), ended_at: null, centre: null, ...x });
const ligne = (id, manche, phase, type, txt) => ({ id, manche, phase, type, texte: txt, prive: false, at: iso(-60) });
const etatL = (p, joueurs, moi, journal = []) => ({ partie: partieL(p), joueurs, moi, votes: null, journal, restants: [], actions_mj: null, attendus: null });
/** Partie à six : Toi (rôle donné), Alice et Chloé villageoises, Bruno loup, David et Emma déjà morts. g : camp gagnant à la fin. */
const assis = (role, f = false, g = null) => {
  const gagne = (c) => (g === null ? null : g === c);
  return [jl(ME, 'Toi', 1, role, true, null, null, f, gagne(CAMP[role])), jl(ALICE, 'Alice', 2, 'villageois', true, null, null, f, gagne('village')), jl(BRUNO, 'Bruno', 3, 'loup-garou', true, null, null, f, gagne('loups')),
    jl(CHLOE, 'Chloé', 4, 'villageois', true, null, null, f, gagne('village')), jl(DAVID, 'David', 5, 'villageois', false, 'loups', 1, f, gagne('village')), jl(EMMA, 'Emma', 6, 'loup-garou', false, 'vote', 1, f, gagne('loups'))];
};
const enCoursL = (role = 'villageois', moi = {}) => etatL({}, assis(role), moiL(role, moi));
const finL = (vainqueur, role = 'villageois', moi = {}, x = {}) => etatL({ statut: 'terminee', phase: 'fin', phase_fin: null, vainqueur, version: 9, ended_at: iso(0), ...x }, assis(role, true, vainqueur), moiL(role, moi), [ligne(1, 2, 'fin', 'fin', 'Fin de la partie.')]);

const ouvrirL = (browser, e, o = {}) => openPage(browser, { page: 'loup-garou', fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODEL}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e) });

/** Ouvre la partie en cours, réveille le son par un geste, joue la fin donnée. */
async function finLive(browser, fin, o = {}) {
  const p = await ouvrirL(browser, o.depart || enCoursL(), o);
  await p.waitForSelector(o.attendre || '.lg-pl', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await sleep(120);
  await raz(p);
  await pousser(p, fin);
  await p.waitForSelector('.lg-fin-banniere', { timeout: 4000 }).catch(() => {});
  await sleep(350);
  return p;
}

async function loupGarou(browser) {
  console.log('--- LG1 : le village gagne');
  let p = await finLive(browser, finL('village'));
  check(await texte(p, '#lg-fin-titre') === 'Le village l\'emporte', 'LG1 : le vrai écran de fin est affiché');
  check((await nb(p, '.lg-fin-ciel.jour')) === 1, 'LG1 : ciel de jour posé');
  check((await texte(p, '.fxd-ban.n'))?.startsWith('Le jour se lève'), 'LG1 : bandeau « Le jour se lève »');
  check((await texte(p, '.fxd-ban small')) === 'Le village l\'emporte', 'LG1 : sous-titre du bandeau');
  check(contient(await freq(p), 523, 659, 784, 1047), 'LG1 : son « Le jour se lève » (S35)');
  check(await p.$eval('body', (b) => b.dataset.lgAmbiance) === 'jour', 'LG1 : ambiance de jour');
  await p.screenshot({ path: path.join(SHOTS, 'lg1.png') });
  await raz(p);
  await pousser(p, finL('village', 'villageois', {}, { version: 10 }));
  await sleep(300);
  check((await nb(p, '.lg-fin-banniere')) === 1 && (await sons(p)) === 0, 'LG1 : un état suivant ne rejoue pas le son');
  await sleep(2400);
  check((await nb(p, '.lg-fin-ciel, .fxd-ban')) === 0, 'LG1 : ciel et bandeau retirés après l\'effet');
  await pousser(p, finL('village', 'villageois', {}, { version: 11 }));
  await sleep(300);
  check((await nb(p, '.lg-fin-ciel, .fxd-ban')) === 0, 'LG1 : rien ne rejoue ensuite');
  await p.ctx.close();

  console.log('--- LG2 : les loups gagnent, et même effet pour tous');
  p = await finLive(browser, finL('loups', 'villageois'));
  check((await nb(p, '.lg-fin-ciel.nuit')) === 1, 'LG2 : ciel sombre posé');
  const ban = await texte(p, '.fxd-ban.n');
  check(ban?.startsWith('La nuit reste') && ban.includes('Les loups-garous l\'emportent'), 'LG2 : bandeau neutre « La nuit reste »');
  check((await p.$eval('.fxd-ban', (n) => n.style.getPropertyValue('--fxd-c'))) === '#C2606C', 'LG2 : couleur du bandeau');
  check(contient(await freq(p), 300, 520), 'LG2 : son « Hurlement » (S36)');
  check(await p.$eval('body', (b) => b.dataset.lgAmbiance) === 'nuit', 'LG2 : ambiance de nuit');
  await p.screenshot({ path: path.join(SHOTS, 'lg2.png') });
  await p.ctx.close();

  const loup = await finLive(browser, finL('loups', 'loup-garou'), { depart: enCoursL('loup-garou') });
  check(await texte(loup, '.fxd-ban.n') === ban, 'Secret : le loup gagnant voit le même bandeau que le villageois perdant');
  const pose = await loup.$$eval('.fxd-ban, .lg-fin-ciel', (l) => l.map((n) => `${n.textContent} ${n.className}`).join(' '));
  check(!/voyante|villageois|victoire|défaite/i.test(pose), 'Secret : l\'effet ne nomme ni rôle ni résultat personnel');
  await loup.ctx.close();

  console.log('--- Vues : meneur, invité, solo, partie arrêtée, 390 px');
  const moiMj = { user_id: ME, meneur: true, hote: true, joueur: false, vivant: false, role: null, role_initial: null, camp: null, amoureux: null, envoute: false, allies: [], pouvoir_perdu: false, action: null };
  const horsMoi = (l) => l.map((j) => (j.user_id === ME ? { ...j, user_id: U(7) } : j));
  const dep = etatL({ mode: 'mj' }, horsMoi(assis('villageois')), moiMj);
  dep.actions_mj = []; dep.attendus = [];
  const finMj = finL('loups', 'villageois', moiMj, { mode: 'mj' });
  finMj.joueurs = horsMoi(finMj.joueurs);
  p = await finLive(browser, finMj, { depart: dep, attendre: '#app > *' });
  check(await texte(p, '.fxd-ban.n') === ban, 'Meneur : même effet que les joueurs');
  await p.ctx.close();

  p = await finLive(browser, finL('village'), { invite: true });
  check((await nb(p, '.lg-fin-ciel.jour')) === 1, 'Invité : ciel de jour');
  check((await nb(p, '.lg-invite-fin')) === 1, 'Invité : pied d\'invité conservé');
  await p.ctx.close();

  const TITRES = { loup_blanc: 'Le Loup blanc l\'emporte', flute: 'Le Joueur de flûte l\'emporte', ange: 'L\'Ange l\'emporte', amoureux: 'Les amoureux l\'emportent', personne: 'Personne ne survit' };
  for (const [v, titre] of Object.entries(TITRES)) {
    p = await finLive(browser, finL(v));
    check((await nb(p, '.lg-fin-ciel.neutre')) === 1 && (await nb(p, '.lg-fin-ciel.nuit')) === 0, `${v} : ciel neutre, pas celui des loups`);
    check((await texte(p, '.fxd-ban.n')) === titre && (await nb(p, '.fxd-ban small')) === 0, `${v} : bandeau au vrai titre, sans « La nuit reste »`);
    check((await sons(p)) === 0, `${v} : pas de son imposé`);
    if (v === 'amoureux') await p.screenshot({ path: path.join(SHOTS, 'lg-amoureux.png') });
    await p.ctx.close();
  }

  p = await finLive(browser, finL('annulee'));
  check(await texte(p, '#lg-fin-titre') === 'Partie arrêtée par le meneur', 'Partie arrêtée : écran affiché');
  check((await nb(p, '.lg-fin-ciel, .fxd-ban')) === 0 && (await sons(p)) === 0, 'Partie arrêtée : aucun effet');
  await p.ctx.close();

  p = await finLive(browser, finL('village'), { width: 390, mobile: true });
  check((await nb(p, '.fxd-ban')) === 1, '390 px : bandeau affiché');
  check(!(await hscroll(p)), '390 px : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'lg1-390.png') });
  await p.ctx.close();

  console.log('--- Pas d\'effet sur une partie déjà finie, nettoyage, mouvement réduit');
  p = await ouvrirL(browser, finL('village'));
  await p.waitForSelector('.lg-fin-banniere', { timeout: 6000 }).catch(() => {});
  await sleep(300);
  check((await nb(p, '.lg-fin-ciel, .fxd-ban')) === 0, 'Partie déjà finie : aucun effet à l\'ouverture');
  await p.ctx.close();

  p = await finLive(browser, finL('village'));
  await p.evaluate(() => { location.hash = '#stats'; });
  await sleep(300);
  check((await nb(p, '.lg-fin-ciel, .fxd-ban')) === 0, 'Quitter l\'écran retire tout de suite ciel et bandeau');
  await p.ctx.close();

  p = await finLive(browser, finL('loups'), { reducedMotion: 'reduce' });
  check((await nb(p, '.lg-fin-ciel, .fxd-ban')) === 0, 'Mouvement réduit : ni ciel ni bandeau');
  check(await texte(p, '#lg-fin-titre') === 'Les loups-garous l\'emportent', 'Mouvement réduit : le résultat est à l\'écran');
  check(contient(await freq(p), 300, 520), 'Mouvement réduit : le son reste');
  await p.ctx.close();

  console.log('--- Secrets en cours de partie : aube, vote');
  p = await ouvrirL(browser, etatL({ phase: 'nuit' }, assis('villageois'), moiL('villageois')));
  await p.waitForSelector('.lg-pl', { timeout: 6000 }).catch(() => {});
  await sleep(200);
  const victime = (j) => (j.user_id === CHLOE ? { ...j, vivant: false, mort_cause: 'loups', mort_manche: 2, role: 'villageois' } : j);
  await pousser(p, etatL({ phase: 'debat', version: 2 }, assis('villageois').map(victime), moiL('villageois'), [ligne(1, 2, 'reveil', 'mort', 'Chloé est mort·e. Son rôle était Villageois.')]));
  await sleep(3100);
  check((await nb(p, '.lg-fx-carte')) === 1, 'Aube : une seule carte, celle de la victime');
  check(/Villageois/.test((await texte(p, '.lg-fx-carte')) || ''), 'Aube : elle montre le rôle de la victime morte');
  const pos = await p.evaluate(({ c, b }) => { const r = (s) => document.querySelector(s).getBoundingClientRect(); const k = r('.lg-fx-carte'); return { v: Math.abs(k.left - r(`[data-uid="${c}"]`).left), w: Math.abs(k.left - r(`[data-uid="${b}"]`).left) }; }, { c: CHLOE, b: BRUNO });
  check(pos.v < pos.w, 'Aube : la carte est sur le siège de la victime');
  const siegeBruno = await p.$eval(`[data-uid="${BRUNO}"]`, (n) => n.textContent + n.getAttribute('aria-label'));
  check(!/loup/i.test(siegeBruno), 'Secret : le loup vivant reste caché sur la table');
  await p.ctx.close();

  console.log('--- Aube : toutes les morts de la nuit, sans cause ni rôle');
  const aube = async (cause) => {
    const q = await ouvrirL(browser, etatL({ phase: 'nuit' }, assis('villageois'), moiL('villageois')));
    await q.waitForSelector('.lg-pl', { timeout: 6000 }).catch(() => {});
    await sleep(200);
    const mort = (j) => (j.user_id === CHLOE ? { ...j, vivant: false, mort_cause: cause, mort_manche: 2, role: 'voyante' } : j);
    await pousser(q, etatL({ phase: 'debat', version: 2 }, assis('villageois').map(mort), moiL('villageois')));
    await sleep(500);
    const t = await texte(q, '.lg-fx-titre small');
    await q.ctx.close();
    return t;
  };
  for (const cause of ['poison', 'loup_blanc', 'chagrin']) {
    const t = await aube(cause);
    check(t === 'Chloé ne s’est pas réveillé·e', `Aube, mort par ${cause} : la victime est annoncée, sans cause ni rôle (${t})`);
  }
  for (const cause of ['vote', 'chasseur', 'meneur']) {
    check((await aube(cause)) === 'Tout le monde est en vie', `Aube, mort par ${cause} : pas compté comme mort de la nuit`);
  }

  const voteA = etatL({ phase: 'vote' }, assis('villageois'), moiL('villageois'));
  voteA.votes = [];
  p = await ouvrirL(browser, voteA);
  await p.waitForSelector('.lg-pl', { timeout: 6000 }).catch(() => {});
  await sleep(200);
  await pousser(p, { ...etatL({ phase: 'vote', version: 2 }, assis('villageois'), moiL('villageois')), votes: [{ de: ALICE, pour: BRUNO, manche: 2 }] });
  await sleep(900);
  const calque = await p.$eval('.lg-fx-calque', (n) => n.textContent);
  check((await nb(p, '.lg-fx-jeton')) === 1 && !/loup|villageois|voyante/i.test(calque), 'Vote : un jeton, aucun rôle dans le calque');
  await p.ctx.close();
}

/* ---------- Nom de code (formes de hg_ndc_etat) ---------- */
const MOTS = ['Lune', 'Forêt', 'Fondue', 'Train', 'Piano', 'Neige', 'Pont', 'Tigre', 'Miroir', 'Sac', 'Lac', 'Clé', 'Vigne', 'Roi', 'Mine', 'Ours', 'Fête', 'Sel', 'Mur', 'Bal', 'Cor', 'Nuit', 'Port', 'Ski', 'Vent'];
const ROLE = 'jjjrrr.jrjr.jr.xj.rjr..r.';
const NOM = { j: 'jaune', r: 'rose', x: 'assassin', '.': 'neutre' };
const cartes = (fini, rev = [0, 3]) => MOTS.map((mot, pos) => ({ pos, mot, couleur: fini || rev.includes(pos) ? NOM[ROLE[pos]] : null, revelee: rev.includes(pos), revele_par: null, propositions: [] }));
const jn = (id, pseudo, place, equipe, espion, gagne) => ({ user_id: id, pseudo, couleur: '#7E93C9', avatar_url: null, invite: false, place, equipe, espion, pret: true, parti: false, trouves: 1, gagne, paillettes: gagne === null ? 0 : (gagne ? 110 : 30) });
const partieN = (x) => ({ id: 'partie-ndc', code: CODEN, nom: 'Partie de vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: false, nb_places: 4, t_espion: 90, t_equipe: 120, validation: 'majorite', paquet: 'classique', equipe_debut: 'rose', tour_equipe: 'rose', phase: 'indice', essais: null, tour_fin: iso(80), vainqueur: null, raison: null, assassin: null, suite: null, version: 1, restants: { jaune: 7, rose: 8 }, totaux: { jaune: 8, rose: 9 }, ...x });
const moiN = (x = {}) => ({ user_id: ME, joue: true, hote: true, invite: false, equipe: 'jaune', espion: false, parti: false, ...x });
const etatN = (p, moi, gJaune = null, fini = false) => ({ partie: partieN(p), maintenant: iso(0), moi, joueurs: [jn(ME, 'Toi', 1, 'jaune', false, gJaune), jn(ALICE, 'Alice', 2, 'jaune', true, gJaune), jn(CHLOE, 'Chloé', 3, 'rose', false, gJaune === null ? null : !gJaune), jn(DAVID, 'David', 4, 'rose', true, gJaune === null ? null : !gJaune)], cartes: cartes(fini), indice: null, indices: [], journal: [], badges: [] });
const finN = (v, raison, moi = moiN(), version = 9) => etatN({ statut: 'terminee', phase: null, tour_fin: null, vainqueur: v, raison, assassin: raison === 'assassin' ? (v === 'jaune' ? CHLOE : ME) : null, version, restants: { jaune: v === 'jaune' ? 0 : 5, rose: v === 'rose' ? 0 : 4 } }, moi, moi.equipe ? moi.equipe === 'jaune' && v === 'jaune' : v === 'jaune', true);

const ouvrirN = (browser, e, o = {}) => openPage(browser, { page: 'nom-de-code', fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODEN}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(e) });

/** Ouvre la table en cours, réveille le son par un geste, joue la fin donnée. */
async function finLiveN(browser, fin, o = {}) {
  const p = await ouvrirN(browser, etatN({}, o.moi || moiN()), o);
  await p.waitForSelector('.ndc-table', { timeout: 6000 }).catch(() => {});
  await p.mouse.click(5, 300);
  await sleep(120);
  await raz(p);
  await pousser(p, fin);
  await p.waitForSelector('.ndc-fin-cartes', { timeout: 4000 }).catch(() => {});
  await sleep(250);
  return p;
}

async function nomDeCode(browser) {
  console.log('--- ND2 : l\'autre équipe touche l\'assassin');
  let p = await finLiveN(browser, finN('jaune', 'assassin'));
  check(await texte(p, '.ndc-fin-titre') === 'Ton équipe gagne !', 'ND2 : titre « Ton équipe gagne ! »');
  check((await nb(p, '.ndc-fx-flash, .ndc-fx-banniere')) === 0, 'ND2 : ni flash ni bannière rouge pour l\'équipe qui gagne');
  check((await nb(p, '.fxd-ban, .fxd-confettis')) === 0, 'ND2 : le bandeau attend le son de la victoire');
  check((await sons(p)) > 0, 'ND2 : son de l\'assassin (S37) tout de suite');
  await raz(p);
  await sleep(900);
  check((await texte(p, '.fxd-ban.n'))?.startsWith('Assassin !') && (await texte(p, '.fxd-ban small')) === 'Ton équipe gagne', 'ND2 : bandeau « Assassin ! Ton équipe gagne »');
  check(!(await p.evaluate(() => document.body.textContent.includes('Partie perdue'))), 'ND2 : plus aucune « Partie perdue » pour l\'équipe qui gagne');
  check((await nb(p, '.fxd-confettis')) === 1, 'ND2 : confettis');
  const coul = await p.$$eval('.fxd-confettis i', (l) => new Set(l.map((d) => d.style.background)).size);
  check(coul === 3, 'ND2 : les trois couleurs de la fiche');
  check((await sons(p)) > 0, 'ND2 : son de victoire (S38) après le délai');
  await p.screenshot({ path: path.join(SHOTS, 'nd2.png') });
  await raz(p);
  await pousser(p, finN('jaune', 'assassin', moiN(), 10));
  await sleep(1100);
  check((await sons(p)) === 0, 'ND2 : un état suivant ne rejoue rien');
  await p.ctx.close();

  console.log('--- Mon équipe touche l\'assassin');
  p = await finLiveN(browser, finN('rose', 'assassin'));
  check(await texte(p, '.ndc-fin-titre') === 'Ton équipe perd', 'Assassin perdu : titre');
  check((await texte(p, '.ndc-fx-banniere.rouge'))?.includes('Partie perdue'), 'Assassin perdu : bannière rouge « Partie perdue »');
  check((await nb(p, '.ndc-fx-flash')) === 1 && (await p.$eval('.ndc-fin-cartes', (n) => n.classList.contains('ndc-fx-choc'))), 'Assassin perdu : flash et secousse');
  check((await nb(p, '.fxd-confettis, .ndc-fx-conf')) === 0, 'Assassin perdu : pas de confettis');
  await p.screenshot({ path: path.join(SHOTS, 'nd-assassin-perdu.png') });
  await p.ctx.close();

  console.log('--- ND1 : mon équipe perd');
  p = await finLiveN(browser, finN('rose', 'mots'));
  check((await texte(p, '.fxd-ban.d'))?.startsWith('Ton équipe perd') && (await texte(p, '.fxd-ban small')) === 'Les Roses ont trouvé tous leurs mots', 'ND1 : bandeau sobre et texte');
  check(contient(await freq(p), 392, 311), 'ND1 : S02 joué');
  check((await nb(p, '.fxd-confettis, .ndc-fx-conf, .ndc-fx-banniere')) === 0, 'ND1 : ni confettis ni bannière de victoire');
  await p.screenshot({ path: path.join(SHOTS, 'nd1.png') });
  await p.ctx.close();

  const parti = moiN({ parti: true });
  p = await finLiveN(browser, finN('rose', 'forfait', parti), { moi: parti });
  check((await texte(p, '.fxd-ban small')) === 'Ton équipe n’avait plus assez de joueurs', 'ND1 forfait, joueur parti : texte juste dans le bandeau');
  check(await texte(p, '.ndc-fin-sous') === 'Ton équipe n\'avait plus assez de joueurs.', 'ND1 forfait : sous-titre juste à l\'écran');
  await p.ctx.close();

  console.log('--- Victoire, spectateur, invité, 390 px');
  p = await finLiveN(browser, finN('jaune', 'mots'));
  check((await nb(p, '.ndc-fx-banniere.jaune')) === 1 && (await nb(p, '.ndc-fx-conf')) > 0, 'Victoire : bannière et confettis conservés');
  await p.ctx.close();

  const spect = moiN({ equipe: null });
  p = await finLiveN(browser, finN('jaune', 'assassin', spect), { moi: spect });
  await sleep(900);
  check((await texte(p, '.fxd-ban small')) === 'Victoire des Jaunes', 'Spectateur : texte sans « ton équipe »');
  check((await nb(p, '.ndc-fx-flash, .ndc-fx-banniere')) === 0, 'Spectateur : pas de « Partie perdue »');
  await p.ctx.close();

  const inv = moiN({ invite: true });
  p = await finLiveN(browser, finN('rose', 'mots', inv), { invite: true, moi: inv });
  check((await texte(p, '.fxd-ban.d'))?.startsWith('Ton équipe perd'), 'Invité : ND1');
  await p.ctx.close();

  p = await finLiveN(browser, finN('rose', 'mots'), { width: 390, mobile: true });
  check((await nb(p, '.fxd-ban')) === 1 && !(await hscroll(p)), '390 px : bandeau, pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'nd1-390.png') });
  await p.ctx.close();

  console.log('--- Pas d\'effet sur une partie déjà finie, nettoyage, mouvement réduit');
  p = await ouvrirN(browser, finN('rose', 'assassin'));
  await p.waitForSelector('.ndc-fin-cartes', { timeout: 6000 }).catch(() => {});
  await sleep(1100);
  check((await nb(p, '.fxd-ban, .ndc-fx-banniere, .ndc-fx-flash, .fxd-confettis')) === 0, 'Partie déjà finie : aucun effet à l\'ouverture');
  check(await texte(p, '#ndc-fin-gain-titre') === 'Tes gains', 'Fin : le titre du bloc ne promet aucun gain');
  await p.ctx.close();

  p = await finLiveN(browser, finN('jaune', 'assassin'));
  await p.evaluate(() => { location.hash = '#stats'; });
  await sleep(1100);
  check((await nb(p, '.fxd-ban, .fxd-confettis')) === 0, 'Quitter pendant le délai : le bandeau n\'arrive jamais');
  await p.ctx.close();

  p = await finLiveN(browser, finN('jaune', 'mots'));
  await p.evaluate(() => { location.hash = '#stats'; });
  await sleep(300);
  check((await nb(p, '.ndc-fx-banniere, .ndc-fx-conf')) === 0, 'Quitter retire bannière et confettis tout de suite');
  await p.ctx.close();

  p = await finLiveN(browser, finN('jaune', 'assassin'), { reducedMotion: 'reduce' });
  const avant = await sons(p);
  await sleep(950);
  check(await texte(p, '.ndc-fin-titre') === 'Ton équipe gagne !', 'Mouvement réduit : le résultat est à l\'écran');
  check((await nb(p, '.fxd-ban, .fxd-confettis')) === 0, 'Mouvement réduit : ni bandeau ni confettis');
  check(avant > 0 && (await sons(p)) > avant, 'Mouvement réduit : S37 puis S38 restent');
  await p.ctx.close();

  p = await finLiveN(browser, finN('rose', 'mots'), { reducedMotion: 'reduce' });
  check((await nb(p, '.fxd-ban')) === 0 && (await sons(p)) > 0, 'Mouvement réduit : ND1 sans bandeau, S02 conservé');
  await p.ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const seul = process.argv[2];
  if (seul !== 'ndc') await loupGarou(browser);
  if (seul !== 'lg') await nomDeCode(browser);
  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
