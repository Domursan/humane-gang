require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt
// Parcours des fins de Cluedo (CL1, CL2), Risk (RK1), Monopoly (MP1), Destins (DT1) et Shadow Hunters (SH1, SH2), sur les vraies tables et
// le vrai écran de fin : la table s'ouvre en cours, le test pousse l'état final que le serveur renverrait (formes des migrations 126 à 130).
// Vérifie pour chaque issue (gagnant, perdant, joueur parti) : bandeau et texte, confettis, son réel ; puis : rien ne rejoue sur un état
// déjà vu ni en ouvrant une partie déjà finie, quitter ne laisse ni nœud ni minuteur, mouvement réduit (état juste, sons conservés), invité,
// 390 px (pas de défilement, bandeau dans la largeur). Monopoly : l'encart .mo-fin a bien ses styles.
// Faux Supabase : fixtures/fake-sb-fins-contenus.mjs. Les contenus et plateaux viennent des migrations.
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, sleep, chromium, DEPOT } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-fins-contenus.mjs';
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const A = U(2), B = U(3), C = U(4), D = U(5);
const COUL = { Toi: '#FBD32D', Alice: '#E9849D', Bruno: '#7E93C9', 'Chloé': '#D9764B', David: '#6FA37F' };
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

/* ---------- Données réelles, lues dans les migrations ---------- */
const FICHIER = { cluedo: '126_cluedo.sql', shadow: '127_shadow_hunters.sql', destins: '128_destins.sql', monopoly: '129_monopoly.sql', risk: '130_risk.sql' };
const sql = (jeu) => fs.readFileSync(path.join(DEPOT, 'supabase/migrations', FICHIER[jeu]), 'utf8').split('\r\n').join('\n');
function contenus(jeu) {
  const t = sql(jeu); const bloc = t.slice(t.indexOf(`select '${jeu}', c.cle`), t.indexOf(') c(cle, libelle, v, sort)', t.indexOf(`select '${jeu}', c.cle`)));
  const re = /\('([a-z_0-9]+)',\s*'((?:[^']|'')*)',\s*(?:to_jsonb\('((?:[^']|'')*)'::text\)|to_jsonb\((\d+)\)|'((?:[^']|'')*)'::jsonb),\s*\d+\)/g;
  const o = {}; let m;
  while ((m = re.exec(bloc))) o[m[1]] = m[3] !== undefined ? m[3].split("''").join("'") : m[4] !== undefined ? Number(m[4]) : JSON.parse(m[5].split("''").join("'"));
  return o;
}
function plateauMonopoly() {
  const t = sql('monopoly'); const b = t.slice(t.indexOf('function public.hg_plat__mo_case'), t.indexOf('function public.hg_plat__mo_cases_groupe')); const r = [];
  b.replace(/when (\d+) then '(\{[^']*\})'/g, (m, n, v) => { r[Number(n)] = JSON.parse(v); return m; });
  return r;
}
function plateauDestins() {
  const t = sql('destins'); const b = t.slice(t.indexOf('function public.hg_plat__de_case'));
  return b.slice(b.indexOf('array['), b.indexOf('])[n + 1]')).match(/'[a-z]+'/g).map((x) => x.slice(1, -1));
}
function voisinsRisk() {
  const t = sql('risk'); const b = t.slice(t.indexOf('function public.hg_plat__rk_voisins')); const o = {};
  b.slice(0, b.indexOf('else array[]')).replace(/when '([a-z]+)' then array\[([^\]]*)\]/g, (m, id, l) => { o[id] = l.match(/'[a-z]+'/g).map((x) => x.slice(1, -1)); return m; });
  return o;
}

/* ---------- Forme de hg_plat_etat (migration 125) ---------- */
const joueur = (id, pseudo, place, etat, x = {}) => ({ user_id: id, pseudo, couleur: COUL[pseudo], avatar_url: null, invite: false, place, pret: true, parti: false, absent: false, elimine: false, etat, gagne: null, rang: null, paillettes: 0, ...x });
const gagne = (g, rang) => ({ gagne: g, rang: rang ?? (g ? 1 : 2), paillettes: g ? 110 : 30 });
const NOMS = { cluedo: 'Cluedo', shadow: 'Shadow Hunters', destins: 'Destins', monopoly: 'Monopoly', risk: 'Risk' };
const CODES = { cluedo: 'HGCLU-1234', shadow: 'HGSHH-1234', destins: 'HGDES-1234', monopoly: 'HGMON-1234', risk: 'HGRSK-1234' };
const PAGE = { cluedo: 'cluedo', shadow: 'shadow-hunters', destins: 'destins', monopoly: 'monopoly', risk: 'risk' };
function etat(jeu, p, joueurs, j, x = {}) {
  const fin = p.statut === 'terminee';
  return { partie: { id: `partie-${jeu}`, jeu, nom_jeu: NOMS[jeu], code: CODES[jeu], nom: 'Soirée', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: true, nb_places: 6, t_tour: 90, options: {}, tour: A, tour_fin: iso(74), nb_tours: 12, suite: null, raison: null, version: 40, started_at: iso(-2400), ended_at: fin ? iso(-1) : null, ...(fin ? { tour: null, tour_fin: null, version: 41 } : {}), ...p }, maintenant: iso(0), moi: { user_id: ME, joue: true, hote: true, invite: false }, joueurs, jeu: j, journal: [], badges: [], ...x };
}

/* ---------- Cluedo (migration 126) ---------- */
const CL = (() => {
  const mains = { [ME]: ['s:rose', 'a:corde', 'p:cuisine', 'p:hall', 's:violet'], [A]: ['s:leblanc', 'a:poignard', 'p:bal', 'p:salon', 'a:cle'], [B]: ['s:pervenche', 'a:revolver', 'p:veranda', 'p:billard'], [C]: ['s:olive', 'a:matraque', 'p:manger', 'p:bibliotheque'] };
  const base = (x) => ({ phase: 'deplacer', actif: A, pions: { moutarde: 'manger', rose: 'bal', leblanc: 'billard', pervenche: 'salon', olive: 'veranda', violet: 'hall' }, armes: { chandelier: 'cuisine', poignard: 'bal', revolver: 'salon', corde: 'manger', matraque: 'bibliotheque', cle: 'hall' }, historique: [], accusations: [], hypothese: null, mes_cartes: mains[ME], vu: [], ma_piece: 'manger', voisines: ['cuisine', 'bal', 'salon', 'hall'], peut_rester: false, enveloppe: null, mains: null, ...x });
  const js = (f = () => ({})) => [joueur(ME, 'Toi', 1, { suspect: 'moutarde', deplace: false, hypotheses: 3 }, f(ME)), joueur(A, 'Alice', 2, { suspect: 'rose', deplace: false, hypotheses: 2 }, f(A)), joueur(B, 'Bruno', 3, { suspect: 'leblanc', deplace: false, hypotheses: 3 }, f(B))];
  const enveloppe = { suspect: 'moutarde', arme: 'chandelier', piece: 'bureau' };
  const fausse = (par) => ({ par, suspect: 'violet', arme: 'corde', piece: 'bureau', juste: false });
  const finJeu = (acc) => base({ phase: 'apres', accusations: acc, enveloppe, mains, voisines: [] });
  return {
    table: () => etat('cluedo', {}, js(), base()),
    // Raison « dernier » : les autres sont éliminés, le dernier enquêteur gagne sans avoir rien trouvé.
    dernier: (g) => etat('cluedo', { statut: 'terminee', raison: 'dernier' }, js((id) => (id === g ? gagne(true) : { elimine: true, ...gagne(false) })), finJeu([ME, A, B].filter((u) => u !== g).map(fausse))),
    enquete: (g) => etat('cluedo', { statut: 'terminee', raison: 'enquete' }, js((id) => gagne(id === g)), finJeu([{ par: g, ...enveloppe, juste: true }])),
  };
})();

/* ---------- Risk (migration 130) ---------- */
const RK = (() => {
  const voisins = voisinsRisk(); const ids = Object.keys(voisins);
  const CONT = { amn: 'alaska tno groenland alberta ontario quebec ouest est amcentrale', ams: 'venezuela perou bresil argentine', eur: 'islande scandinavie gb europenord europeouest europesud ukraine', afr: 'afnord egypte afest congo afsud madagascar', oce: 'indonesie nouvelleguinee australieouest australieest' };
  const continents = Object.fromEntries(ids.map((id) => [id, Object.keys(CONT).find((k) => CONT[k].split(' ').includes(id)) || 'asi']));
  const terr = Object.fromEntries(ids.map((id, i) => [id, { j: i % 2 ? A : ME, a: 1 + (i % 5) }]));
  const monde = (g) => Object.fromEntries(ids.map((id, i) => [id, { j: g, a: 1 + (i % 4) }]));
  const commun = { actif: A, phase: 'attaque', renforts: 0, echanges: 1, prochain_echange: 6, combat: null, conquete: null, conquis: false, missions: true, pioche: 31, voisins, continents, bonus: { amn: 5, ams: 2, eur: 5, afr: 3, asi: 7, oce: 2 }, missions_fin: null };
  const moi = { cartes: [], mission: { id: 'm3', type: 'm3', cible: null }, a_placer: 0, renforts_prevus: 8 };
  const js = (f = () => ({})) => [joueur(ME, 'Toi', 1, { armee: 'bleu', nb_cartes: 2, a_placer: 0, pret: true }, f(ME)), joueur(A, 'Alice', 2, { armee: 'rouge', nb_cartes: 3, a_placer: 0, pret: true }, f(A)), joueur(B, 'Bruno', 3, { armee: 'vert', nb_cartes: 1, a_placer: 0, pret: true }, f(B))];
  const missions_fin = { [ME]: { id: 'm3', type: 'm3', cible: null }, [A]: { id: 'm6', type: 'm6', cible: null }, [B]: { id: 'm4', type: 'm4', cible: null } };
  return {
    table: () => etat('risk', {}, js(), { ...commun, territoires: terr, moi }),
    fin: (g, raison = 'monde', f = () => ({})) => etat('risk', { statut: 'terminee', raison }, js((id) => ({ ...gagne(id === g), ...f(id) })), { ...commun, territoires: monde(g), moi, missions_fin }),
  };
})();

/* ---------- Monopoly (migration 129) ---------- */
const MO = (() => {
  const plateau = plateauMonopoly();
  const prop = (proprio, maisons = 0, hypotheque = false) => ({ proprio, maisons, hypotheque });
  const proprietes = { 16: prop(A, 3), 18: prop(A, 3), 1: prop(ME), 3: prop(ME), 6: prop(ME, 1), 15: prop(ME, 0, true) };
  const fortunes = { [A]: 4820, [ME]: 2310, [B]: 0 };
  const commun = { actif: A, des: [3, 4], doubles: 0, rejouer: false, proprietes, carte: null, offre: null, dette: null, fin_prevue: iso(1500), plateau, loyer_ici: null, fortunes, phase: 'gestion' };
  const et = (pos, pion, argent, x = {}) => ({ pos, argent, prison: false, essais: 0, cartes_sortie: 0, faillite: false, pion, ...x });
  const js = (f = () => ({}), fin) => [
    joueur(ME, 'Toi', 1, et(21, 'voiture', 900, fin ? { fortune: fortunes[ME] } : {}), f(ME)),
    joueur(A, 'Alice', 2, et(12, 'chien', 2100, fin ? { fortune: fortunes[A] } : {}), f(A)),
    joueur(B, 'Bruno', 3, et(30, 'chapeau', 0, { faillite: true, ...(fin ? { fortune: 0 } : {}) }), { elimine: true, ...f(B) }),
  ];
  return {
    table: () => etat('monopoly', {}, js(), commun),
    fin: (g, f = () => ({})) => etat('monopoly', { statut: 'terminee', raison: 'temps' }, js((id) => ({ ...gagne(id === g, id === g ? 1 : id === B ? 3 : 2), ...f(id) }), true), commun),
    egalite: () => etat('monopoly', { statut: 'terminee', raison: 'temps' }, js((id) => gagne(id !== ME && id !== B ? true : id === B ? false : false, 1), true).map((j) => (j.user_id === B ? { ...j, gagne: true, rang: 1, elimine: false } : j.user_id === ME ? { ...j, gagne: false, rang: 3 } : j)), commun),
  };
})();

/* ---------- Destins (migration 128) ---------- */
const DE = (() => {
  const plateau = plateauDestins();
  const socle = { assurance_habitation: true, assurance_auto: false, case: 37, voie: 'carriere', voie2: null, argent: 84000, prets: 0, metier: 'policier', salaire: 50000, marie: true, enfants: 0, maisons: [], retraite: false, retraite_lieu: null };
  const js = (f = () => ({}), x = {}) => [joueur(ME, 'Toi', 1, { ...socle, ...x }, f(ME)), joueur(A, 'Alice', 2, { ...socle, case: 44, ...x }, f(A)), joueur(C, 'Chloé', 3, { ...socle, case: 31, ...x }, f(C))];
  const commun = { actif: A, choix: null, roue: 4, roue2: null, carte: null, plateau, phase: 'tourner', fortunes: { [ME]: 310000, [A]: 482000, [C]: 205000 }, prochaine_paie: { [ME]: 2, [A]: 5, [C]: 3 } };
  return {
    table: () => etat('destins', {}, js(), commun),
    fin: (g, f = () => ({})) => etat('destins', { statut: 'terminee', raison: 'retraite', nb_tours: 58 }, js((id) => ({ ...gagne(id === g, id === g ? 1 : 2), ...f(id) }), { case: 90, retraite: true, retraite_lieu: 'maison' }), { ...commun, prochaine_paie: { [ME]: null, [A]: null, [C]: null } }),
  };
})();

/* ---------- Shadow Hunters (migration 127) ---------- */
const SH = (() => {
  const zones = [['ermite', 'porte'], ['monastere', 'cimetiere'], ['foret', 'sanctuaire']];
  const PV = { emi: 10, georges: 14, vampire: 13, loupgarou: 14, allie: 8, bob: 10 };
  const camp = (p) => (['emi', 'franklin', 'georges'].includes(p) ? 'hunter' : ['inconnu', 'vampire', 'loupgarou'].includes(p) ? 'shadow' : 'neutre');
  const et = (perso, revele, lieu, degats) => ({ revele, perso: revele ? perso : null, camp: revele ? camp(perso) : null, degats, lieu, equip: [], pouvoir: false, ange: false });
  const commun = { phase: 'debut', actif: A, zones, des: null, options: null, carte: null, attaques: 0, composition: { hunter: 2, shadow: 2, neutre: 1 }, pioches: { vision: 9, lumiere: 11, tenebres: 10 }, vision: null };
  const moiDe = (perso) => ({ perso, camp: camp(perso), pv: PV[perso], connus: {}, vision_main: null, portee: [] });
  const table = (perso) => etat('shadow', {}, [joueur(ME, 'Toi', 1, et(perso, false, 'cimetiere', 6)), joueur(A, 'Alice', 2, et('emi', true, 'monastere', 4)), joueur(B, 'Bruno', 3, et('loupgarou', false, 'foret', 5)), joueur(D, 'David', 4, et('allie', false, 'ermite', 2))], { ...commun, morts: [], pv: { [ME]: null, [A]: 10, [B]: null, [D]: null }, moi: moiDe(perso) });
  /** Fin : les Hunters ou les Shadows gagnent (raison), Allie vivante gagne aussi ; autre raison : neutre, seuls les joueurs de `seuls`. */
  const fin = (perso, raison, seuls = null, f = () => ({})) => {
    const gagneP = (p, id) => (seuls ? seuls.includes(id) : (raison === 'hunters' && camp(p) === 'hunter') || (raison === 'shadows' && camp(p) === 'shadow') || p === 'allie');
    const j = (id, nom, place, p, lieu) => joueur(id, nom, place, et(p, true, lieu, 3), { ...gagne(gagneP(p, id)), ...f(id) });
    const js = [j(ME, 'Toi', 1, perso, 'cimetiere'), j(A, 'Alice', 2, 'emi', 'monastere'), j(B, 'Bruno', 3, 'loupgarou', 'foret'), j(D, 'David', 4, 'allie', 'ermite')];
    return etat('shadow', { statut: 'terminee', raison, nb_tours: 24 }, js, { ...commun, morts: [], pv: Object.fromEntries(js.map((x) => [x.user_id, PV[x.etat.perso]])), moi: moiDe(perso) });
  };
  return { table, fin };
})();

const TABLE = { cluedo: '.ch-table', risk: '.rk-table .rk-carte', monopoly: '.mo-table', destins: '.ds-table', shadow: '.sh-table' };
const FIN = { cluedo: '.ch-fin .ch-sol', risk: '.rk-fin', monopoly: '.mo-fin', destins: '.dp-fin', shadow: '.sh-fin-titre' };
const INV = { moi: { user_id: ME, joue: true, hote: false, invite: true } };

/* ---------- Outils de page ---------- */
const init = (jeu, e) => ({ content: `window.__FIN = { etat: ${JSON.stringify(e)}, contenus: ${JSON.stringify(contenus(jeu))} };
  window.__F = []; window.__SONS = 0;
  localStorage.setItem('hg_plat_invite:' + ${JSON.stringify(CODES[jeu])}, 'jeton');
  (() => { const AC = window.AudioContext; if (!AC) return;
    const o = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function () { window.__SONS += 1; const n = o.call(this); const f = n.frequency; const s = f.setValueAtTime.bind(f);
      f.setValueAtTime = (v, t) => { window.__F.push(Math.round(v)); return s(v, t); }; return n; };
    const b = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function () { window.__SONS += 1; return b.call(this); };
  })();` });
const ouvrir = (browser, jeu, e, o = {}) => openPage(browser, { page: PAGE[jeu], fixture: FIX, scenario: o.invite ? { guest: true } : {}, hash: `#partie/${CODES[jeu]}`, width: o.width || 1280, height: 900, reducedMotion: o.reducedMotion || 'no-preference', mobile: !!o.mobile, init: init(jeu, e) });
const pousser = (p, e) => p.evaluate((x) => window.__FIN.pousser(x), e);
const freq = (p) => p.evaluate(() => window.__F);
const raz = (p) => p.evaluate(() => { window.__F = []; window.__SONS = 0; });
const contient = (l, ...v) => v.every((x) => l.includes(x));
const sansErreur = (p, nom) => check(p.errs.length === 0, `${nom} : aucune erreur JS${p.errs.length ? ` — ${p.errs.join(' | ')}` : ''}`);

/** Ouvre la vraie table en cours, réveille le son par un geste, pousse l'état final et attend l'écran de fin. */
async function finDe(browser, jeu, enCours, final, o = {}) {
  const p = await ouvrir(browser, jeu, enCours, o);
  await p.waitForSelector(TABLE[jeu], { timeout: 8000 }).catch(() => {});
  await sleep(200);
  await p.mouse.click(5, 300);
  await raz(p);
  await pousser(p, final);
  await p.waitForSelector(FIN[jeu], { timeout: 6000, state: 'attached' }).catch(() => {}); // les vraies cartes du Cluedo sont masquées pendant le retournement
  await sleep(o.apres ?? 450);
  return p;
}
const ban = async (p, sel = '.fxd-ban') => ((await p.locator(sel).count()) ? p.locator(sel).first().innerText() : '');
const conf = (p) => p.locator('.fxd-confettis, .rk-anim-conf, .mo-conf, .ds-anim-conf').count();

(async () => {
  const browser = await chromium.launch();
  let p;

  // ----- CL1 : raison « dernier », le gagnant n'a rien résolu ; je suis éliminé -----
  p = await finDe(browser, 'cluedo', CL.table(), CL.dernier(A), { apres: 900 });
  check(await p.locator('.ch-anim-vol').count() === 3, 'CL1 : les trois cartes de l’enveloppe se retournent');
  check(await p.locator('.ch-enveloppe .ch-anim-vol.tourne').count() >= 1, 'CL1 : le retournement a commencé, dans l’enveloppe');
  check(await p.locator('.fxd-ban').count() === 0, 'CL1 : pas de bandeau pendant le retournement');
  check(contient(await freq(p), 392, 294, 220) && !(await freq(p)).includes(1047), 'CL1 : son « Éliminé » (S30), pas « Solution révélée »');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-cl-retournement-1280.png` });
  await p.waitForSelector('.fxd-ban', { timeout: 2500 }).catch(() => {});
  check((await ban(p, '.fxd-ban.n')).toLowerCase().includes('affaire classée'), 'CL1 : bandeau neutre « Affaire classée »');
  check((await ban(p)).toLowerCase().includes('personne n’a trouvé'), 'CL1 : « Personne n’a trouvé »');
  check(await conf(p) === 0, 'CL1 : pas de confettis');
  check((await p.locator('.plat-fin h1').innerText()) === 'Défaite', 'CL1 : titre du socle, Défaite');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-cl1-1280.png` });
  await sleep(2400);
  check(await p.locator('.ch-anim-vol, .fxd-ban').count() === 0 && await p.locator('.ch-sol:visible').count() === 3, 'CL1 : à la fin, les vraies cartes reviennent et rien ne reste');
  sansErreur(p, 'CL1');
  await p.ctx.close();

  // Le dernier enquêteur lui-même : il gagne la partie, sans fête (il n'a rien résolu) mais sans « Éliminé » ni « Personne n'a trouvé ».
  p = await finDe(browser, 'cluedo', CL.table(), CL.dernier(ME), { apres: 2600 });
  const banDernier = (await ban(p, '.fxd-ban.n')).toLowerCase();
  check(banDernier.includes('dernier enquêteur en lice') && banDernier.includes('tu gagnes la partie'), 'dernier gagnant : bandeau « Dernier enquêteur en lice »');
  check(!banDernier.includes('affaire classée') && !banDernier.includes('personne n’a trouvé'), 'dernier gagnant : ni « Affaire classée » ni « Personne n’a trouvé »');
  check(await conf(p) === 0, 'dernier gagnant : pas de confettis');
  check(contient(await freq(p), 523, 659, 784, 1047) && !(await freq(p)).includes(220), 'dernier gagnant : « Solution révélée », pas « Éliminé »');
  check((await p.locator('.plat-fin h1').innerText()) === 'Victoire !', 'dernier gagnant : le socle dit bien Victoire');
  await p.ctx.close();

  // Le dernier geste a pris plus de 30 s : la fin reste jouée, pour toute la table.
  p = await ouvrir(browser, 'cluedo', CL.table());
  await p.waitForSelector(TABLE.cluedo, { timeout: 8000 }).catch(() => {});
  await sleep(200);
  await p.mouse.click(5, 300);
  await p.evaluate(() => { const n = Date.now.bind(Date); Date.now = () => n() + 60000; });
  await raz(p);
  await pousser(p, CL.dernier(A));
  await p.waitForSelector(FIN.cluedo, { timeout: 6000, state: 'attached' }).catch(() => {});
  await sleep(450);
  check(await p.locator('.ch-anim-vol').count() === 3 && contient(await freq(p), 392, 294, 220), 'Cluedo : 60 s sans changement de version, retournement et son quand même');
  await p.ctx.close();

  // Table quittée, partie finie entre-temps, écran rouvert plus tard dans la même page : rien ne rejoue.
  p = await ouvrir(browser, 'cluedo', CL.table());
  await p.waitForSelector(TABLE.cluedo, { timeout: 8000 }).catch(() => {});
  await sleep(200);
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(300);
  await p.evaluate(() => { const n = Date.now.bind(Date); Date.now = () => n() + 60000; });
  await p.evaluate((e) => { window.__FIN.etat = e; location.hash = '#partie/HGCLU-1234'; }, CL.dernier(A));
  await p.waitForSelector(FIN.cluedo, { timeout: 6000, state: 'attached' }).catch(() => {});
  await sleep(450);
  check(await p.locator('.ch-fin .ch-sol').count() === 3 && await p.locator('.ch-anim-vol').count() === 0 && (await freq(p)).length === 0, 'Cluedo : fin rouverte plus tard dans la page, sans effet ni son');
  await p.ctx.close();

  // ----- CL2 : Alice a trouvé -----
  p = await finDe(browser, 'cluedo', CL.table(), CL.enquete(A), { apres: 2600 });
  check((await ban(p, '.fxd-ban.n')).toLowerCase().includes('enquête résolue') && (await ban(p)).toLowerCase().includes('alice a trouvé'), 'CL2 : bandeau neutre, avec le nom');
  check(await conf(p) === 0, 'CL2 : pas de confettis pour les autres');
  check(contient(await freq(p), 523, 659, 784, 1047), 'CL2 : son « Solution révélée » (S29)');
  await p.ctx.close();
  p = await finDe(browser, 'cluedo', CL.table(), CL.enquete(ME), { apres: 2600 });
  check((await ban(p)).toLowerCase().includes('tu as trouvé') && await p.locator('.fxd-ban.n, .fxd-ban.d').count() === 0, 'CL2 : le gagnant a le bandeau de fête');
  check(await p.locator('.fxd-confettis').count() === 1, 'CL2 : confettis pour le gagnant');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-cl2-1280.png` });
  await p.ctx.close();

  // Quitter pendant le retournement : rien ne reste, le bandeau n'arrive jamais.
  p = await finDe(browser, 'cluedo', CL.table(), CL.enquete(ME), { apres: 700 });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(2200);
  check(await p.locator('.ch-anim-vol, .fxd-ban, .fxd-confettis').count() === 0, 'Cluedo : quitter pendant le retournement ne laisse ni nœud ni bandeau en retard');
  sansErreur(p, 'Cluedo quitter');
  await p.ctx.close();

  // Mouvement réduit : état juste, son conservé, ni carte volante ni bandeau.
  p = await finDe(browser, 'cluedo', CL.table(), CL.dernier(A), { reducedMotion: 'reduce', apres: 2600 });
  check(await p.locator('.ch-anim-vol, .fxd-ban').count() === 0 && await p.locator('.ch-sol:visible').count() === 3, 'Cluedo réduit : solution visible, sans animation');
  check(contient(await freq(p), 392, 294, 220), 'Cluedo réduit : le son reste');
  await p.ctx.close();

  // Partie déjà finie à l'ouverture.
  p = await ouvrir(browser, 'cluedo', CL.enquete(ME));
  await p.waitForSelector(FIN.cluedo, { timeout: 8000 }).catch(() => {});
  await sleep(2600);
  check(await p.locator('.ch-anim-vol, .fxd-ban, .fxd-confettis').count() === 0 && (await freq(p)).length === 0, 'Cluedo déjà fini : sans effet ni son');
  await p.ctx.close();

  // 390 px : la carte reste accrochée à l'enveloppe et rien ne déborde.
  p = await finDe(browser, 'cluedo', CL.table(), CL.dernier(A), { width: 390, mobile: true, apres: 2600 });
  const boite = await p.locator('.fxd-ban').boundingBox();
  check(boite && boite.x >= 0 && boite.x + boite.width <= 390, '390 px, CL1 : le bandeau tient dans la largeur');
  check((await hscroll(p)) <= 0, '390 px, CL1 : pas de défilement horizontal');
  await p.ctx.close();

  // ----- RK1 -----
  p = await finDe(browser, 'risk', RK.table(), RK.fin(A));
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('partie perdue') && (await ban(p)).toLowerCase().includes('alice a conquis le monde'), 'RK1 : bandeau sobre « Partie perdue », Alice a conquis le monde');
  check(await p.locator('.rk-anim-banc').count() === 0 && await conf(p) === 0, 'RK1 : ni « Victoire ! » ni confettis pour le perdant');
  check(contient(await freq(p), 392, 311) && !(await freq(p)).includes(262), 'RK1 : son S02, pas la victoire');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-rk1-1280.png` });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await p.locator('.fxd-ban').count() === 0, 'RK1 : quitter retire le bandeau');
  sansErreur(p, 'RK1');
  await p.ctx.close();
  p = await finDe(browser, 'risk', RK.table(), RK.fin(A, 'mission'));
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('alice a rempli sa mission'), 'RK1 : gagné par mission, la ligne le dit');
  await p.ctx.close();
  p = await finDe(browser, 'risk', RK.table(), RK.fin(ME));
  check((await ban(p, '.rk-anim-banc')).includes('Victoire !') && (await ban(p, '.rk-anim-banc')).toLowerCase().includes('le monde est conquis'), 'Risk gagnant : la fin reste telle quelle');
  check(await p.locator('.rk-anim-conf').count() > 0, 'Risk gagnant : confettis');
  check(contient(await freq(p), 262, 330, 392, 523, 659), 'Risk gagnant : son « Victoire du monde » (S31)');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-rk-gagnant-1280.png` });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await p.locator('.rk-anim-banc, .rk-anim-conf').count() === 0, 'Risk gagnant : quitter retire bandeau et confettis');
  await p.ctx.close();
  p = await finDe(browser, 'risk', RK.table(), RK.fin(A, 'monde', (id) => (id === ME ? { parti: true } : {})));
  check((await ban(p, '.fxd-ban.n')).toLowerCase().includes('partie terminée') && await conf(p) === 0, 'Risk parti : bandeau neutre, sans fête');
  check((await p.evaluate(() => window.__SONS)) > 0 && !(await freq(p)).includes(311) && !(await freq(p)).includes(262), 'Risk parti : son S04, ni défaite ni victoire');
  await p.ctx.close();
  p = await finDe(browser, 'risk', RK.table(), RK.fin(A), { reducedMotion: 'reduce' });
  check(await p.locator('.fxd-ban').count() === 0 && (await p.locator('.plat-fin h1').innerText()) === 'Défaite', 'Risk réduit : titre juste, sans bandeau');
  check(contient(await freq(p), 392, 311), 'Risk réduit : le son reste');
  await p.ctx.close();
  p = await ouvrir(browser, 'risk', RK.fin(A));
  await p.waitForSelector(FIN.risk, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  check(await p.locator('.fxd-ban').count() === 0 && (await freq(p)).length === 0, 'Risk déjà fini : sans effet ni son');
  await p.ctx.close();

  // ----- Invité (Risk) : la même fin, le bon bandeau -----
  p = await finDe(browser, 'risk', { ...RK.table(), ...INV }, { ...RK.fin(A), ...INV }, { invite: true });
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('alice a conquis le monde'), 'invité : bandeau sobre');
  sansErreur(p, 'invité');
  await p.ctx.close();

  // ----- MP1 -----
  p = await finDe(browser, 'monopoly', MO.table(), MO.fin(A));
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('partie perdue') && (await ban(p)).toLowerCase().includes('alice est la plus riche'), 'MP1 : bandeau sobre, Alice est la plus riche');
  check(await p.locator('.mo-fete').count() === 0 && await conf(p) === 0, 'MP1 : pas de fête pour le perdant');
  check(contient(await freq(p), 392, 311) && !(await freq(p)).includes(523), 'MP1 : son S02, pas la victoire');
  const styles = await p.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    return { fond: cs('.mo-fin').backgroundColor, puces: cs('.mo-classement').listStyleType, ligne: cs('.mo-classe').display, avatar: cs('.mo-classe-avatar').borderRadius, titres: cs('.mo-fin .mo-titres').flexDirection, couleur: cs('.mo-classe-fortune').color };
  });
  check(styles.fond === 'rgb(20, 55, 42)' && styles.puces === 'none' && styles.ligne === 'flex' && styles.avatar === '50%' && styles.titres === 'row' && styles.couleur === 'rgb(226, 199, 126)', `Monopoly : .mo-fin a ses styles — ${JSON.stringify(styles)}`);
  check(await p.locator('.mo-classe.is-gagnant').count() === 1 && (await p.locator('.mo-classe.is-gagnant').innerText()).includes('Alice'), 'Monopoly : le gagnant est marqué dans le classement');
  await p.locator('.mo-fin').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${__dirname}/../../shots/fins-mp1-1280.png` });
  sansErreur(p, 'MP1');
  await p.ctx.close();
  p = await finDe(browser, 'monopoly', MO.table(), MO.fin(ME));
  check((await ban(p, '.mo-fete-banc')).includes('Partie terminée') && await p.locator('.mo-conf').count() === 60 && await p.locator('.fxd-ban').count() === 0, 'Monopoly gagnant : la fête reste telle quelle');
  check(contient(await freq(p), 392, 523, 659, 784), 'Monopoly gagnant : son « Victoire » (S32)');
  await p.ctx.close();
  p = await finDe(browser, 'monopoly', MO.table(), MO.egalite());
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('alice et bruno sont les plus riches'), 'MP1 : égalité, les deux noms au pluriel');
  await p.ctx.close();
  p = await finDe(browser, 'monopoly', MO.table(), MO.fin(A, (id) => (id === ME ? { parti: true } : {})));
  check((await ban(p, '.fxd-ban.n')).toLowerCase().includes('partie terminée') && await p.locator('.mo-fete').count() === 0, 'Monopoly parti : bandeau neutre, sans fête');
  await p.ctx.close();
  p = await finDe(browser, 'monopoly', MO.table(), MO.fin(ME), { reducedMotion: 'reduce' });
  check(await p.locator('.mo-fete, .fxd-ban').count() === 0 && (await p.locator('.plat-fin h1').innerText()) === 'Victoire !', 'Monopoly réduit : titre juste, sans fête');
  check(contient(await freq(p), 392, 523, 659, 784), 'Monopoly réduit : le son reste');
  await p.ctx.close();
  p = await ouvrir(browser, 'monopoly', MO.fin(A));
  await p.waitForSelector(FIN.monopoly, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  check(await p.locator('.mo-fete, .fxd-ban').count() === 0 && (await freq(p)).length === 0, 'Monopoly déjà fini : sans effet ni son');
  await p.ctx.close();
  p = await finDe(browser, 'monopoly', MO.table(), MO.fin(A), { width: 390, mobile: true });
  check((await hscroll(p)) <= 0, '390 px, Monopoly : pas de défilement horizontal');
  await sleep(2600);
  await p.locator('.mo-fin').scrollIntoViewIfNeeded();
  await p.screenshot({ path: `${__dirname}/../../shots/fins-mp1-390.png` });
  await p.ctx.close();

  // ----- DT1 -----
  p = await finDe(browser, 'destins', DE.table(), DE.fin(A));
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('partie perdue') && (await ban(p)).toLowerCase().includes('alice a la plus grande fortune'), 'DT1 : bandeau sobre, Alice a la plus grande fortune');
  check(await p.locator('.ds-anim-fete').count() === 0 && await conf(p) === 0, 'DT1 : pas de fête pour le perdant');
  check(contient(await freq(p), 392, 311), 'DT1 : son S02');
  check(await p.locator('.dp-podium-carte').count() === 3 && (await p.locator('.dp-podium-carte.is-gagnant').innerText()).includes('Alice'), 'DT1 : le podium ne change pas');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-dt1-1280.png` });
  sansErreur(p, 'DT1');
  await p.ctx.close();
  p = await finDe(browser, 'destins', DE.table(), DE.fin(ME));
  check((await ban(p, '.ds-anim-banc')).includes('Victoire !') && await p.locator('.ds-anim-conf').count() === 60, 'Destins gagnant : la fête reste telle quelle');
  check(contient(await freq(p), 523, 659, 784, 1047), 'Destins gagnant : son « Victoire » (S33)');
  await p.ctx.close();
  p = await finDe(browser, 'destins', DE.table(), DE.fin(A, (id) => (id === ME ? { parti: true } : {})));
  check((await ban(p, '.fxd-ban.n')).toLowerCase().includes('partie terminée') && await p.locator('.ds-anim-fete').count() === 0, 'Destins parti : bandeau neutre, sans fête');
  await p.ctx.close();
  p = await finDe(browser, 'destins', DE.table(), DE.fin(ME), { reducedMotion: 'reduce' });
  check(await p.locator('.ds-anim-fete, .fxd-ban').count() === 0 && contient(await freq(p), 523, 659, 784, 1047), 'Destins réduit : pas de fête, le son reste');
  await p.ctx.close();
  p = await ouvrir(browser, 'destins', DE.fin(A));
  await p.waitForSelector(FIN.destins, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  check(await p.locator('.ds-anim-fete, .fxd-ban').count() === 0 && (await freq(p)).length === 0, 'Destins déjà fini : sans effet ni son');
  await p.ctx.close();

  // ----- SH1, SH2 -----
  p = await finDe(browser, 'shadow', SH.table('georges'), SH.fin('georges', 'hunters'));
  check((await ban(p, '.fxd-ban.sh-ban-fin')).toLowerCase().includes('les hunters gagnent') && (await ban(p)).toLowerCase().includes('ton camp l’emporte'), 'SH1 : le bandeau reprend le titre du camp');
  check((await p.locator('.fxd-ban').evaluate((n) => getComputedStyle(n).fontFamily)).includes('Cinzel'), 'SH1 : en Cinzel');
  check((await ban(p)).toLowerCase().includes('ou les hunters') === false, 'SH1 : plus le texte de maquette');
  check(await p.locator('.fxd-confettis').count() === 1, 'SH1 : confettis');
  check(contient(await freq(p), 330, 415, 494, 659), 'SH1 : son « Victoire » (S34)');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-sh1-1280.png` });
  await p.evaluate(() => { location.hash = '#'; });
  await sleep(200);
  check(await p.locator('.fxd-ban, .fxd-confettis').count() === 0, 'SH1 : quitter retire bandeau et confettis');
  sansErreur(p, 'SH1');
  await p.ctx.close();
  p = await finDe(browser, 'shadow', SH.table('vampire'), SH.fin('vampire', 'hunters'));
  check((await ban(p, '.fxd-ban.d.sh-ban-fin')).toLowerCase().includes('les hunters gagnent') && (await ban(p)).toLowerCase().includes('ton camp a perdu'), 'SH2 : le même titre, bandeau sobre');
  check(await conf(p) === 0, 'SH2 : pas de confettis');
  check(contient(await freq(p), 392, 311) && !(await freq(p)).includes(494), 'SH2 : son S02');
  await p.ctx.close();
  // Un Neutre gagne seul : le vrai titre, plus jamais « Shadows, ou Hunters ».
  p = await finDe(browser, 'shadow', SH.table('allie'), SH.fin('allie', 'neutre', [ME]));
  check((await ban(p)).toLowerCase().includes('un neutre gagne seul') && (await ban(p)).toLowerCase().includes('tu l’emportes'), 'Shadow : un Neutre gagne seul, pas de « camp »');
  await p.ctx.close();
  p = await finDe(browser, 'shadow', SH.table('vampire'), SH.fin('vampire', 'neutre', [D]));
  check((await ban(p, '.fxd-ban.d')).toLowerCase().includes('un neutre gagne seul') && (await ban(p)).toLowerCase().includes('ton camp a perdu'), 'Shadow : le Neutre gagne, un Shadow a perdu');
  await p.ctx.close();
  // Hunters et Shadows gagnent ensemble (le serveur écrit « hunters ») : le Shadow ne lit pas « Les Hunters gagnent ».
  p = await finDe(browser, 'shadow', SH.table('vampire'), SH.fin('vampire', 'hunters', [ME, A, B]));
  check((await ban(p, '.fxd-ban.sh-ban-fin')).toLowerCase().includes('hunters et shadows gagnent') && (await ban(p)).toLowerCase().includes('ton camp l’emporte'), 'Shadow : les deux camps gagnent, le bandeau le dit');
  check((await p.locator('.sh-fin-titre').innerText()).toLowerCase().includes('hunters et shadows gagnent'), 'Shadow : les deux camps gagnent, le titre de l’écran aussi');
  await p.ctx.close();
  // Bob et l'Allié gagnent ensemble (raison « neutre ») : ils ne sont pas seuls.
  p = await finDe(browser, 'shadow', SH.table('bob'), SH.fin('bob', 'neutre', [ME, D]));
  check((await ban(p)).toLowerCase().includes('des neutres gagnent') && (await ban(p)).toLowerCase().includes('tu l’emportes'), 'Shadow : deux Neutres gagnent, pas « seul »');
  check((await p.locator('.sh-fin-titre').innerText()).toLowerCase().includes('des neutres gagnent'), 'Shadow : deux Neutres, le titre de l’écran aussi');
  await p.ctx.close();
  p = await finDe(browser, 'shadow', SH.table('georges'), SH.fin('georges', 'hunters', null, (id) => (id === ME ? { parti: true } : {})));
  check((await ban(p, '.fxd-ban.n')).toLowerCase().includes('les hunters gagnent') && await conf(p) === 0, 'Shadow parti : bandeau neutre, sans fête');
  await p.ctx.close();
  p = await finDe(browser, 'shadow', SH.table('georges'), SH.fin('georges', 'hunters'), { reducedMotion: 'reduce' });
  check(await p.locator('.fxd-ban, .fxd-confettis').count() === 0 && (await p.locator('.sh-fin-titre').innerText()).toLowerCase().includes('les hunters gagnent'), 'Shadow réduit : titre juste, sans bandeau');
  check(contient(await freq(p), 330, 415, 494, 659), 'Shadow réduit : le son reste');
  await p.ctx.close();
  p = await ouvrir(browser, 'shadow', SH.fin('georges', 'hunters'));
  await p.waitForSelector(FIN.shadow, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  check(await p.locator('.fxd-ban').count() === 0 && (await freq(p)).length === 0, 'Shadow déjà fini : sans effet ni son');
  await p.ctx.close();
  // 390 px : le bandeau ne déborde plus.
  p = await finDe(browser, 'shadow', SH.table('georges'), SH.fin('georges', 'hunters'), { width: 390, mobile: true, apres: 900 });
  const bs = await p.locator('.fxd-ban').boundingBox();
  check(bs && bs.x >= 0 && bs.x + bs.width <= 390, `390 px, Shadow : le bandeau tient dans la largeur — ${JSON.stringify(bs)}`);
  check((await hscroll(p)) <= 0, '390 px, Shadow : pas de défilement horizontal');
  await p.screenshot({ path: `${__dirname}/../../shots/fins-sh1-390.png` });
  await p.ctx.close();

  await browser.close();
  finish();
})();
