// Faux client Supabase des grilles du jour (migration 140) : Connexions, Mot mêlé, Nerdle du gang, Anagramme, Mots croisés. Enveloppe un faux existant
// (fake-sb.mjs par défaut, ou window.__SCN.jeuxBase) chargé depuis le site de test, et répond aux RPC hg_nj_grille_etat et
// hg_nj_grille_essai avec un état en mémoire (window.__NG). Les autres appels passent au faux de base.
// Scénario (window.__SCN) : noGrille (pas de grille aujourd'hui), jeuxBase.
// Les règles suivent le serveur : 4 mots distincts et connus, 4 erreurs = perdu ; ligne droite, mot de la grille ;
// calcul juste de 8 caractères, couleurs v/j/g comme hg_nj__couleurs ; « Ce n'est pas un calcul juste… » sans essai compté.
// Exporte createClient().
const S = window.__SCN || {};
const prefix = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${prefix}/tests/fixtures/${S.jeuxBase || 'fake-sb.mjs'}`);

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ok = (data) => ({ data, error: null });
const err = (message) => ({ data: null, error: { message } });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // jour de Zurich, comme le site

/* ---------- Contenu : Connexions (4 groupes, 16 mots mélangés) ---------- */
const CONNEXIONS = {
  groupes: [
    { titre: 'Fruits', mots: ['POMME', 'POIRE', 'PRUNE', 'FIGUE'], niveau: 1 },
    { titre: 'Instruments', mots: ['PIANO', 'VIOLON', 'FLÛTE', 'HARPE'], niveau: 2 },
    { titre: 'Félins', mots: ['LYNX', 'PUMA', 'OCELOT', 'SERVAL'], niveau: 3 },
    { titre: 'Météo', mots: ['ORAGE', 'GRÊLE', 'BRUME', 'ÉCLAIR'], niveau: 4 },
  ],
  mots: ['HARPE', 'ORAGE', 'PUMA', 'POMME', 'BRUME', 'LYNX', 'PIANO', 'FIGUE', 'ÉCLAIR', 'VIOLON', 'SERVAL', 'PRUNE', 'GRÊLE', 'OCELOT', 'POIRE', 'FLÛTE'],
};

/* ---------- Contenu : Mot mêlé (grille 12 × 12, mots placés en ligne droite, reste au hasard et fixe) ---------- */
const MM_MOTS = { CASSEROLE: [0, 0, 0, 8], FOURCHETTE: [9, 1, 0, 10], COUTEAU: [11, 0, 5, 6], LOUCHE: [2, 11, 7, 11], SPATULE: [10, 3, 10, 9], ECUMOIRE: [2, 0, 9, 0] };
const T = 12;
/** Cases d'un segment (même règle que le serveur : pas de sens, du départ à l'arrivée). */
function cases(r1, c1, r2, c2) {
  const n = Math.max(Math.abs(r2 - r1), Math.abs(c2 - c1)), dr = Math.sign(r2 - r1), dc = Math.sign(c2 - c1);
  return Array.from({ length: n + 1 }, (_, k) => [r1 + dr * k, c1 + dc * k]);
}
const MM = (() => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const lettres = 'AEIOUNRSTLCDMPBGHVF';
  const g = Array.from({ length: T }, () => Array(T).fill(''));
  for (const [m, [r1, c1, r2, c2]] of Object.entries(MM_MOTS)) {
    cases(r1, c1, r2, c2).forEach(([r, c], k) => { g[r][c] = m[k]; });
  }
  for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) if (!g[r][c]) g[r][c] = lettres[Math.floor(rnd() * lettres.length)];
  return { lignes: g.map((l) => l.join('')), positions: MM_MOTS, theme: 'Ustensiles de cuisine' };
})();

/* ---------- Contenu : Nerdle (calcul de 8 caractères) ---------- */
const NERDLE_SOL = '12+35=47';

/* ---------- Contenu : Anagramme (cinq mots ; lettres mélangées à la main, définitions neutres) ---------- */
const ANA = [
  { mot: 'MAISON', lettres: 'NISAOM', def: 'Lieu où l’on vit en famille' },
  { mot: 'CHOCOLAT', lettres: 'TOCALOCH', def: 'Gourmandise brune faite à partir de cacao' },
  { mot: 'PARAPLUIE', lettres: 'IUPRAPELA', def: 'Il protège de la pluie' },
  { mot: 'TABLE', lettres: 'ELBAT', def: 'Meuble sur lequel on pose les assiettes' },
  { mot: 'LUNETTES', lettres: 'TESLNUTE', def: 'Elles corrigent la vue' },
].map((m) => ({ ...m, n: m.mot.length }));

/* ---------- Contenu : Mots croisés (9 × 9 : lignes paires pleines, colonnes paires pleines ; lettres de test) ---------- */
const MC_W = 9, MC_H = 9;
const MC_MOTIF = Array.from({ length: MC_H }, (_, r) => (r % 2 === 0 ? '#########' : '#.#.#.#.#'));
/** Solution à plat (une lettre ou « . » par case), comme la colonne secret.solution du serveur. */
const MC_SOL = Array.from({ length: MC_H * MC_W }, (_, q) => {
  const r = Math.floor(q / MC_W), c = q % MC_W;
  return MC_MOTIF[r][c] === '#' ? 'ABCDEFGHIJKLMNOPRSTUVWXY'[(r * 7 + c * 3) % 24] : '.';
});
const mcBlanche = (r, c) => r >= 0 && r < MC_H && c >= 0 && c < MC_W && MC_MOTIF[r][c] === '#';
/** Vue publique : numéros et définitions calculés comme le fait la migration (mots de deux lettres ou plus, lecture ligne par ligne). */
const MC_PUB = (() => {
  const numeros = [], defs = { h: [], v: [] };
  let n = 0;
  for (let r = 0; r < MC_H; r++) for (let c = 0; c < MC_W; c++) {
    if (!mcBlanche(r, c)) continue;
    const debutH = !mcBlanche(r, c - 1) && mcBlanche(r, c + 1);
    const debutV = !mcBlanche(r - 1, c) && mcBlanche(r + 1, c);
    if (!debutH && !debutV) continue;
    n++;
    numeros.push([r, c, n]);
    if (debutH) { let len = 0; while (mcBlanche(r, c + len)) len++; defs.h.push({ n, r, c, len, def: `Définition de test ${n}` }); }
    if (debutV) { let len = 0; while (mcBlanche(r + len, c)) len++; defs.v.push({ n, r, c, len, def: `Définition de test ${n}` }); }
  }
  return { w: MC_W, h: MC_H, motif: MC_MOTIF, numeros, defs };
})();

/** Parties en mémoire : une par jeu. */
const J = window.__NG = {
  connexions: { debut: null, fini: false, gagne: false, erreurs: 0, score: 0, secondes: null, reward: null, essais: [], trouves: [] },
  motmele: { debut: null, fini: false, gagne: false, erreurs: 0, score: 0, secondes: null, reward: null, trouves: [] },
  nerdle: { debut: null, fini: false, gagne: false, erreurs: 0, score: 0, secondes: null, reward: null, essais: [], indices: [] },
  anagramme: { debut: null, fini: false, gagne: false, erreurs: 0, score: 0, secondes: null, reward: null, mots: {} },
  motscroises: { debut: null, fini: false, gagne: false, erreurs: 0, score: 0, secondes: null, reward: null },
};
const BOARD = (jeu) => ({
  semaine: [{ user_id: U(2), pseudo: 'Alice', color: '#D97757', points: 14, wins: 3 }, { user_id: ME, pseudo: 'Ethan', color: '#4F6A8F', points: 9, wins: 2 }],
  jour: jeu === 'nerdle' ? [{ user_id: U(2), pseudo: 'Alice', color: '#D97757', secondes: 74.2, score: 6 }] : [],
});

/** Vue publique de la grille (ce que le client voit pendant la partie). */
function grilleVue(jeu) {
  const g = J[jeu];
  if (jeu === 'connexions') return { mots: CONNEXIONS.mots, trouves: g.trouves.map((i) => CONNEXIONS.groupes[i]) };
  if (jeu === 'motmele') {
    const trouves = Object.fromEntries(g.trouves.map((m) => [m, MM.positions[m]]));
    return { theme: MM.theme, taille: T, grille: MM.lignes, mots: Object.keys(MM.positions).sort(), trouves };
  }
  if (jeu === 'anagramme') return { mots: ANA.map(({ lettres, def, n }) => ({ lettres, def, n })) };
  if (jeu === 'motscroises') return MC_PUB;
  return { longueur: 8 };
}

/** État renvoyé par hg_nj_grille_etat. */
function etat(jeu) {
  const g = J[jeu];
  if (S.noGrille) return { jeu, day: today, grille: null, board: BOARD(jeu) };
  const etatPartie = { connexions: { essais: g.essais, trouves: g.trouves }, motmele: { trouves: g.trouves }, anagramme: { mots: g.mots }, motscroises: {} }[jeu] || { essais: g.essais, indices: g.indices };
  const partie = g.debut ? {
    etat: etatPartie,
    erreurs: g.erreurs, fini: g.fini, gagne: g.gagne, score: g.score, secondes: g.secondes, debut: g.debut, reward: g.reward,
  } : null;
  const out = { jeu, day: today, numero: 16, grille: grilleVue(jeu), partie, gain: 10, board: BOARD(jeu) };
  if (g.fini) {
    out.solution = jeu === 'connexions' ? { groupes: CONNEXIONS.groupes }
      : jeu === 'motmele' ? { positions: MM.positions }
        : jeu === 'anagramme' ? { mots: ANA.map(({ mot, def }) => ({ mot, def })) }
          : jeu === 'motscroises' ? { solution: MC_SOL }
            : { calcul: NERDLE_SOL };
  }
  return out;
}

/** Démarre la partie au premier essai (horodatage du début). */
function demarre(jeu) {
  if (!J[jeu].debut) J[jeu].debut = new Date(Date.now() - 1000).toISOString();
}
/** Termine la partie : secondes, Paillettes (10 si score > 0). */
function termine(jeu, gagne, score) {
  const g = J[jeu];
  g.fini = true; g.gagne = gagne; g.score = score;
  g.secondes = Math.round((Date.now() - Date.parse(g.debut)) / 10) / 100;
  g.reward = score > 0 ? 10 : 0;
}

/** Couleurs d'un essai (même règle que hg_nj__couleurs : v, j, g ; multiplicités respectées). */
function couleurs(essai, sol) {
  const n = sol.length, res = Array(n).fill('g'), reste = [];
  for (let i = 0; i < n; i++) { if (essai[i] === sol[i]) res[i] = 'v'; else reste.push(sol[i]); }
  for (let i = 0; i < n; i++) {
    if (res[i] !== 'v') { const j = reste.indexOf(essai[i]); if (j >= 0) { res[i] = 'j'; reste[j] = '#'; } }
  }
  return res.join('');
}

/** Calcul juste de huit caractères (chiffres, + - * / =, un seul =, résultat entier égal à la droite). */
function calculJuste(s) {
  if (s.length !== 8 || s.split('=').length !== 2) return false;
  const [l, r] = s.split('=');
  if (!/^\d+$/.test(r) || /^0\d/.test(r) || !/^[0-9+*/-]+$/.test(l) || /(^|[-+*/])0\d/.test(l)) return false;
  const v = evalue(l);
  return v !== null && Number.isInteger(v) && v === Number(r);
}
/** Évalue une suite de nombres et d'opérateurs + - * / (priorités usuelles), sans eval (le site bloque eval). */
function evalue(e) {
  const jetons = e.match(/\d+|[-+*/]/g);
  if (!jetons || jetons.join('') !== e) return null;
  let i = 0;
  const terme = () => {
    let v = Number(jetons[i++]);
    while (jetons[i] === '*' || jetons[i] === '/') {
      const op = jetons[i++], n = Number(jetons[i++]);
      if (op === '/' && n === 0) return NaN;
      v = op === '*' ? v * n : v / n;
    }
    return v;
  };
  let v = terme();
  while (jetons[i] === '+' || jetons[i] === '-') {
    const op = jetons[i++], n = terme();
    v = op === '+' ? v + n : v - n;
  }
  return i === jetons.length ? v : null;
}

/* ---------- Essais ---------- */
function essaiConnexions(p) {
  const g = J.connexions;
  if (S.noGrille) return err('Pas de grille aujourd’hui.');
  if (g.fini) return err('Tu as déjà terminé la grille du jour. Reviens demain !');
  const sel = [...new Set((p.mots || []).map((m) => String(m).trim().toUpperCase()))];
  if (sel.length !== 4) return err('Choisis exactement 4 mots.');
  if (sel.some((m) => !CONNEXIONS.mots.includes(m))) return err('Mot inconnu.');
  const cle = [...sel].sort().join('|');
  if (g.essais.some((e) => [...e].sort().join('|') === cle)) return err('Tu as déjà essayé ces 4 mots.');
  demarre('connexions');
  g.essais.push(sel);
  let res = null, best = 0;
  for (let i = 0; i < CONNEXIONS.groupes.length; i++) {
    const gr = CONNEXIONS.groupes[i];
    const n = sel.filter((m) => gr.mots.includes(m)).length;
    if (n === 4) { g.trouves.push(i); res = { ok: true, groupe: gr }; best = 4; break; }
    best = Math.max(best, n);
  }
  if (!res) { g.erreurs++; res = { ok: false, presque: best === 3 }; }
  if (g.trouves.length === 4) termine('connexions', true, 5 - g.erreurs);
  else if (g.erreurs >= 4) termine('connexions', false, 0);
  return ok({ resultat: res, etat: etat('connexions') });
}

function essaiMotmele(p) {
  const g = J.motmele;
  if (S.noGrille) return err('Pas de grille aujourd’hui.');
  if (g.fini) return err('Tu as déjà terminé la grille du jour. Reviens demain !');
  const [r1, c1, r2, c2] = ['r1', 'c1', 'r2', 'c2'].map((k) => Number(p[k]));
  if ([r1, c1, r2, c2].some((x) => !Number.isInteger(x)) || Math.min(r1, c1, r2, c2) < 0 || Math.max(r1, c1, r2, c2) > T - 1) return err('Sélection invalide.');
  demarre('motmele');
  let res = { ok: false };
  if ((r1 === r2 || c1 === c2 || Math.abs(r2 - r1) === Math.abs(c2 - c1)) && !(r1 === r2 && c1 === c2)) {
    const lu = cases(r1, c1, r2, c2).map(([r, c]) => MM.lignes[r][c]).join('');
    const mot = Object.keys(MM.positions).includes(lu) ? lu : Object.keys(MM.positions).includes([...lu].reverse().join('')) ? [...lu].reverse().join('') : null;
    if (mot && !g.trouves.includes(mot)) { g.trouves.push(mot); res = { ok: true, mot }; }
  }
  if (g.trouves.length === Object.keys(MM.positions).length) termine('motmele', true, 5);
  return ok({ resultat: res, etat: etat('motmele') });
}

function essaiNerdle(p) {
  const g = J.nerdle;
  if (S.noGrille) return err('Pas de grille aujourd’hui.');
  if (g.fini) return err('Tu as déjà terminé la grille du jour. Reviens demain !');
  if (p.indice) {
    // Indice (migration 149) : première case pas encore trouvée en vert ni révélée, 3 au plus.
    if (g.indices.length >= 3) return err('Tu as déjà pris les 3 indices du jour.');
    demarre('nerdle');
    const pos = [...Array(8).keys()].find((j) => !g.indices.some((x) => x.pos === j) && !g.essais.some((e) => e.calcul[j] === NERDLE_SOL[j]));
    if (pos === undefined) return err('Toutes les cases sont déjà trouvées.');
    g.indices.push({ pos, ch: NERDLE_SOL[pos] });
    return ok({ resultat: { indice: { pos, ch: NERDLE_SOL[pos] } }, etat: etat('nerdle') });
  }
  const calcul = String(p.calcul || '').replace(/×/g, '*').replace(/÷/g, '/').trim();
  if (!calculJuste(calcul)) return err('Ce n\'est pas un calcul juste de 8 caractères.');
  demarre('nerdle');
  const couls = couleurs(calcul, NERDLE_SOL);
  g.essais.push({ calcul, couleurs: couls });
  const n = g.essais.length;
  if (calcul === NERDLE_SOL) termine('nerdle', true, Math.max(1, 7 - n - g.indices.length));
  else if (n >= 6) termine('nerdle', false, 0);
  return ok({ resultat: { ok: calcul === NERDLE_SOL, couleurs: couls }, etat: etat('nerdle') });
}

function essaiAnagramme(p) {
  const g = J.anagramme;
  if (S.noGrille) return err('Pas de grille aujourd’hui.');
  if (g.fini) return err('Tu as déjà terminé la grille du jour. Reviens demain !');
  const i = Number(p.i);
  if (!Number.isInteger(i) || i < 0 || i >= ANA.length) return err('Mot inconnu.');
  if (g.mots[i]) return err('Déjà joué.');
  demarre('anagramme');
  let res;
  if (p.passer) {
    g.mots[i] = 'passe';
    res = { ok: false, passe: true, mot: ANA[i].mot };
  } else if (String(p.mot || '').toUpperCase() === ANA[i].mot) {
    g.mots[i] = 'trouve';
    res = { ok: true, mot: ANA[i].mot };
  } else {
    g.erreurs++;
    res = { ok: false };
  }
  if (Object.keys(g.mots).length === ANA.length) {
    const score = Object.values(g.mots).filter((v) => v === 'trouve').length;
    termine('anagramme', score === ANA.length, score);
  }
  return ok({ resultat: res, etat: etat('anagramme') });
}

function essaiMotscroises(p) {
  const g = J.motscroises;
  if (S.noGrille) return err('Pas de grille aujourd’hui.');
  if (g.fini) return err('Tu as déjà terminé la grille du jour. Reviens demain !');
  const lignes = Array.isArray(p.lignes) ? p.lignes : null;
  if (!lignes || lignes.length !== MC_H) return err('Grille incomplète.');
  const lu = lignes.map((l) => String(l).padEnd(MC_W, ' ').slice(0, MC_W).toUpperCase()).join('');
  const sol = MC_SOL.join('');
  if (lu.length !== sol.length) return err('Grille incomplète.');
  demarre('motscroises');
  const verifier = !!p.verifier;
  // Même règle que le serveur : une case remplie fausse compte ; une case vide compte seulement avec « Vérifier ».
  const faux = [];
  for (let q = 0; q < sol.length; q++) {
    if (sol[q] !== '.' && lu[q] !== sol[q] && (verifier || lu[q] !== ' ')) faux.push(q);
  }
  if (!faux.length && !lu.includes(' ')) {
    termine('motscroises', true, Math.max(1, 5 - g.erreurs));
    return ok({ resultat: { ok: true }, etat: etat('motscroises') });
  }
  if (verifier) g.erreurs++;
  return ok({ resultat: { ok: false, faux }, etat: etat('motscroises') });
}

/* ---------- RPC ---------- */
const JEU_OK = (p) => ['connexions', 'motmele', 'nerdle', 'anagramme', 'motscroises'].includes(p);
const HANDLERS = {
  hg_nj_grille_etat: (a) => (JEU_OK(a.p_jeu) ? ok(etat(a.p_jeu)) : err('Jeu inconnu')),
  hg_nj_grille_essai: (a) => {
    if (!JEU_OK(a.p_jeu)) return err('Jeu inconnu');
    if (a.p_jeu === 'connexions') return essaiConnexions(a.p || {});
    if (a.p_jeu === 'motmele') return essaiMotmele(a.p || {});
    if (a.p_jeu === 'anagramme') return essaiAnagramme(a.p || {});
    if (a.p_jeu === 'motscroises') return essaiMotscroises(a.p || {});
    return essaiNerdle(a.p || {});
  },
};

// Scénario nerdleFini : la partie du jour est déjà gagnée à l'ouverture (pas d'effet de fin attendu).
if (S.nerdleFini) {
  Object.assign(J.nerdle, { debut: new Date(Date.now() - 60000).toISOString(), essais: [{ calcul: NERDLE_SOL, couleurs: Array(8).fill('v') }] });
  termine('nerdle', true, 10);
}

/** Client : celui du faux de base, avec les RPC des grilles du jour en plus. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (HANDLERS[fn]) { window.__LOG.push(['rpc', fn, a]); return HANDLERS[fn](a); }
    return rpc0(fn, a);
  };
  return c;
}
