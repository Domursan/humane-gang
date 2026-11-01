// Faux client Supabase des jeux du paquet xJ3 : Framed (J9), Heardle (J10), quêtes à preuve (J11), Bataille (J15).
// Enveloppe un faux existant (fake-sb.mjs par défaut, ou window.__SCN.jeuxBase, ex. 'fake-sb-cartes.mjs') chargé depuis le
// site de test, et répond aux RPC de la migration 085 avec un état en mémoire (window.__J3). Les autres appels passent au faux
// de base. Scénario (window.__SCN) : jeuxBase, framedDone (partie déjà finie), noRound (pas de manche),
// heardleCancelled, proofQuests (quêtes à preuve dans hg_card_quests_me), saveFailTitle (hg_framed_film_save refuse ce titre),
// uid / staff comme le faux de base.
// Exporte createClient().
const S = window.__SCN || {};
const prefix = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${prefix}/tests/fixtures/${S.jeuxBase || 'fake-sb.mjs'}`);

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const uid = () => S.uid || ME;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // jour de Zurich, comme le site
const ok = (data) => ({ data, error: null });
const err = (message) => ({ data: null, error: { message } });

/* ---------- État ---------- */
const FILMS = [
  { id: 'f-nope', title: 'Nope', year: 2022, seen_on: '2024-04-14', viewers: 7 },
  { id: 'f-interstellar', title: 'Interstellar', year: 2014, seen_on: '2025-03-09' },
  { id: 'f-inception', title: 'Inception', year: 2010, seen_on: '2024-11-03' },
  { id: 'f-inconnus', title: 'Les Inconnus, le film', year: 1995, seen_on: '2025-02-02' },
  { id: 'f-prestige', title: 'Le Prestige', year: 2006, seen_on: '2024-09-15' },
];
const TRACKS = [
  { id: 't-lyon', title: 'Alors on danse', artist: 'Stromae', youtube_id: 'VHoT4N43jK8', start_s: 12, shared_on: '#musique, mars 2023', proposed_by: 'Alice' },
  { id: 't-papa', title: 'Papaoutai', artist: 'Stromae' },
  { id: 't-daft', title: 'One More Time', artist: 'Daft Punk' },
];
const J = window.__J3 = {
  framed: { guesses: [], solved: false, finished: false, answer: 'f-nope' },
  heardle: { guesses: [], solved: false, finished: false, answer: 't-lyon' },
  proposals: [],
  proofs: {},
  queue: [
    { id: 'pr-1', user_id: U(2), pseudo: 'Alice', color: '#D97757', quest_code: 'p_mc_ferme', label: 'Construis une ferme automatique sur le serveur Minecraft', game: 'Minecraft', reward: 400,
      week: today, paths: [`${U(2)}/a.webp`, `${U(2)}/b.webp`], note: '12 fours en ligne, alimentés par la mine du nord.', share: true, status: 'en_attente', attempts: 1, updated_at: new Date(Date.now() - 2 * 3600e3).toISOString(), own: false },
    { id: 'pr-2', user_id: ME, pseudo: 'Ethan', color: '#4F6A8F', quest_code: 'p_aoe_classee', label: 'Gagne une partie classée d’Age of Empires 2', game: 'Age of Empires 2', reward: 400,
      week: today, paths: [`${ME}/c.webp`], note: null, share: false, status: 'en_attente', attempts: 1, updated_at: new Date(Date.now() - 5 * 3600e3).toISOString(), own: true },
  ],
  battleCfg: { actif: true, gains: false, gain: 10, defense_gain: 5, cap_jour: 3, cap_defense: 3, meme_adversaire: 2, max_jour: 20 },
  deck: null,
  battles: [],
  framedFilms: FILMS.map((f, i) => ({ ...f, frames: i === 0 ? [1, 2, 3, 4, 5, 6].map((n) => `framed/${f.id}/${n}.webp`) : [], active: true, day: i === 0 ? today : null })),
  heardleTracks: TRACKS.map((t) => ({ ...t, status: 'valide', day: t.id === 't-lyon' ? today : null })).concat([{ id: 't-prop', title: 'Le morceau du RDV', artist: 'Groupe', youtube_id: 'abcdefghijk', start_s: 30, status: 'propose', proposed_pseudo: 'Bruno' }]),
};
// framedTirage : 'pleine' : un film servi, un inactif, un à 2 images, un seul bon. 'epuisee' : aucun bon.
J.framedRounds = new Map();
if (S.framedTirage) {
  J.framedRounds.set('2020-01-01', { film_id: 'f-nope', created_by: 'x' });
  J.framedFilms = FILMS.map((f, i) => ({ ...f, day: null, active: i === 0 || i === 2 || (i === 3 && S.framedTirage === 'pleine'),
    frames: [1, 2, 3, 4, 5, 6].slice(0, i === 2 ? 2 : 6).map((n) => `framed/${f.id}/${n}.webp`) }));
}
if (S.framedDone) Object.assign(J.framed, { guesses: ['f-prestige', ''], solved: false, finished: false });

/* ---------- Framed et Heardle ---------- */
/**
 * Historique du Heardle (hg_heardle_historique) : 23 manches passées, de la plus récente à la plus ancienne. Manche n :
 * Ethan trouve en (n % 3) + 1 essais, sauf la 20 (ratée) et la 21 (pas jouée) ; Alice trouve du premier coup ; Bruno passe tout.
 */
const heardleHistorique = () => {
  const joueur = (id, pseudo, color, essais, points) => ({ user_id: id, pseudo, color, avatar_url: null, solved: essais.endsWith('o'), essais, points });
  const manches = Array.from({ length: 23 }, (_, i) => {
    const n = 23 - i;
    const d = new Date(`${today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (i + 1));
    const joueurs = [joueur(U(2), 'Alice', '#2B5AE2', 'o', 150)];
    if (n === 20) joueurs.push(joueur(ME, 'Ethan', '#4F6A8F', 'xxxxxx', 10));
    else if (n !== 21) joueurs.push(joueur(ME, 'Ethan', '#4F6A8F', 'x'.repeat(n % 3) + 'o', 150 - 10 * (n % 3)));
    joueurs.push(joueur(U(3), 'Bruno', '#159946', 'ssssss', null));
    joueurs.sort((a, b) => (b.solved - a.solved) || (a.essais.length - b.essais.length));
    return { day: d.toISOString().slice(0, 10), round: n, title: n === 23 ? 'Tout va bien' : `Morceau ${n}`, artist: n === 23 ? 'Orelsan' : `Artiste ${n}`,
      youtube_id: 'VHoT4N43jK8', start_s: 12, shared_on: '#musique', proposed_by: 'Alice', joueurs };
  });
  return { moi: { joues: 22, trouves: 21, moyenne: 2.0, serie: 3 }, manches };
};

const board = () => [{ user_id: U(2), pseudo: 'Alice', points: 14, wins: 3 }, { user_id: ME, pseudo: 'Ethan', points: 9, wins: 2 }];
/**
 * Tirage du jour, mêmes règles que hg_framed__jour (migration 188) : une ligne déjà là prime ; sinon un film actif, 3 images au
 * moins, jamais servi ; created_by null ; aujourd'hui seulement ; réserve épuisée : rien n'est écrit.
 */
function framedJour() {
  if (!S.framedTirage) return true;
  if (J.framedRounds.has(today)) return J.framedRounds.get(today);
  const servis = new Set([...J.framedRounds.values()].map((r) => r.film_id));
  const f = J.framedFilms.find((x) => x.active && x.frames.length >= 3 && !servis.has(x.id));
  if (!f) return null;
  const r = { film_id: f.id, created_by: null };
  J.framedRounds.set(today, r); J.framed.answer = f.id;
  return r;
}
function framedState() {
  if (S.noRound || !framedJour()) return { day: today, round: null, next_day: null, board: board(), hier: null };
  const g = J.framed, k = g.finished ? 6 : Math.min(6, g.guesses.length + 1);
  const film = FILMS.find((f) => f.id === g.answer);
  return { day: today, round: 18, total_frames: 6, frames: [1, 2, 3, 4, 5, 6].slice(0, k).map((n) => `framed/${film.id}/${n}.webp`),
    guesses: g.guesses.map((id) => { const f = FILMS.find((x) => x.id === id); return f ? { id, title: f.title, year: f.year } : { id: '' }; }),
    solved: g.solved, finished: g.finished, score: g.solved ? 7 - g.guesses.length : 0, reward: g.finished ? (g.solved ? 10 : 3) : null, gain: 10, consolation: 3,
    film: g.finished ? film : null, films: FILMS.map(({ id, title, year, seen_on }) => ({ id, title, year, seen_on })), board: board(),
    hier: { round: 17, title: 'Le Dîner de cons', solvers: 9, avg: 2.4 } };
}
const STEPS = [1, 2, 4, 7, 11, 16];
function heardleState() {
  if (S.heardleCancelled) return { day: today, round: null, cancelled: true, next_day: null, board: board(), hier: null };
  const g = J.heardle, t = TRACKS.find((x) => x.id === g.answer);
  return { day: today, round: 7, youtube_id: t.youtube_id, start_s: t.start_s, seconds: g.finished ? 16 : STEPS[Math.min(g.guesses.length, 5)], steps: STEPS,
    guesses: g.guesses.map((id) => { const x = TRACKS.find((y) => y.id === id); return x ? { id, title: x.title, artist: x.artist } : { id: '' }; }),
    solved: g.solved, finished: g.finished, score: g.solved ? 7 - g.guesses.length : 0, reward: g.finished ? (g.solved ? 10 : 3) : null, gain: 10, consolation: 3,
    track: g.finished ? { ...t } : null, tracks: TRACKS.map(({ id, title, artist }) => ({ id, title, artist })), board: board(), hier: null };
}
function apply(g, id) {
  if (g.finished) return 'Tu as déjà terminé la partie du jour. Reviens demain !';
  if (id && g.guesses.includes(id)) return 'Tu as déjà proposé cette réponse.';
  g.guesses.push(id || '');
  if (id === g.answer) { g.solved = true; g.finished = true; } else if (g.guesses.length >= 6) g.finished = true;
  return null;
}

/* ---------- Quêtes à preuve ---------- */
const PROOF_QUESTS = [
  { code: 'p_mc_ferme', label: 'Construis une ferme automatique sur le serveur Minecraft', proof_game: 'Minecraft', reward: 400 },
  { code: 'p_worldle_1', label: 'Termine un Worldle en 1/6', proof_game: 'Worldle', reward: 300 },
];
function questsMe(baseData) {
  const quests = [...(baseData?.quests || [])];
  for (const q of PROOF_QUESTS) {
    const p = J.proofs[q.code];
    quests.push({ ...q, metric: 'preuve_validee', target: 1, progress: p?.status === 'validee' ? 1 : 0, done: p?.status === 'validee', claimed: p?.status === 'validee',
      proof: true, proof_status: p?.status ?? null, proof_reason: p?.reason ?? null, proof_attempts: p?.attempts ?? 0 });
  }
  return { week: today, ends_at: new Date(Date.now() + 5 * 864e5).toISOString(), ...baseData, quests };
}

/* ---------- Bataille ---------- */
const CARD = (copy_id, name, rarity, family, shiny = false) => ({ copy_id, card_id: 'c' + copy_id, name, rarity, family, shiny, image_url: null, number: copy_id,
  power: ({ commune: 1, peu_commune: 2, rare: 3, epique: 4, legendaire: 5, mythique: 6, identite: 6, unique: 6 })[rarity] + (shiny ? 1 : 0) });
const COPIES = [CARD(1, 'La Domu-mobile', 'epique', 'objet'), CARD(2, 'Xali', 'rare', 'membre'), CARD(3, 'Tzatzikistan', 'legendaire', 'moment'),
  CARD(4, 'Le chalet', 'commune', 'lieu'), CARD(5, 'Raclette 2023', 'commune', 'moment'), CARD(6, 'Serge', 'mythique', 'moment'), CARD(7, 'Ethan', 'identite', 'membre')];
const DEF = [CARD(11, 'Lyon 2026', 'commune', 'lieu'), CARD(12, 'Le gobelet', 'peu_commune', 'objet', true), CARD(13, 'Wae', 'rare', 'membre'), CARD(14, 'Serge', 'mythique', 'moment'), CARD(15, 'La gare', 'rare', 'lieu')];
const OPP = [{ id: U(2), pseudo: 'Alice', color: '#D97757', has_deck: true }, { id: U(3), pseudo: 'Bruno', color: '#7E93C9', has_deck: false }];
const beats = (a, b) => ({ membre: 'objet', objet: 'lieu', lieu: 'moment', moment: 'membre' })[a] === b;
function battleMe() {
  return { cfg: J.battleCfg, paid_today: 0, defenses_today: 0, deck: J.deck, deck_ids: J.deck?.map((c) => c.copy_id) ?? null, copies: COPIES,
    opponents: OPP.map((o) => ({ ...o, avatar_url: null, attacks_today: J.battles.filter((b) => b.defender.id === o.id).length })),
    history: J.battles, unseen: 0 };
}
function attack(def, ids) {
  if (ids.length !== 5) return err('Choisis exactement 5 cartes');
  const o = OPP.find((x) => x.id === def);
  if (!o?.has_deck) return err('Ce membre n’a pas encore de deck de défense');
  if (J.battles.filter((b) => b.defender.id === def).length >= J.battleCfg.meme_adversaire) return err('Tu as déjà attaqué ce membre 2 fois aujourd’hui');
  const a = ids.map((id) => COPIES.find((c) => c.copy_id === id));
  let wa = 0, wd = 0;
  const duels = a.map((x, i) => {
    const d = DEF[i]; let pa = x.power, pd = d.power, adv = null;
    if (beats(x.family, d.family)) { pa += 2; adv = 'a'; } else if (beats(d.family, x.family)) { pd += 2; adv = 'd'; }
    if (pa > pd) wa++; else if (pd > pa) wd++;
    return { a: pa, d: pd, adv, win: pa > pd ? 'a' : pd > pa ? 'd' : 'nul' };
  });
  const b = { id: 'b' + (J.battles.length + 1), created_at: new Date().toISOString(), role: 'attaque', attacker: { id: uid(), pseudo: 'Ethan' }, defender: { id: o.id, pseudo: o.pseudo },
    attack: a, defense: DEF, duels, wins_a: wa, wins_d: wd, result: wa > wd ? 'victoire' : wd > wa ? 'defaite' : 'egalite', paid: 0, seen: true };
  J.battles.unshift(b);
  return ok(b);
}

/* ---------- RPC ---------- */
const HANDLERS = {
  hg_framed_state: () => ok(framedState()),
  hg_framed_guess: (a) => { if (!framedJour()) return err('Pas de Framed aujourd’hui.'); const m = apply(J.framed, a.p_film); return m ? err(m) : ok(framedState()); },
  hg_heardle_state: () => ok(heardleState()),
  hg_heardle_guess: (a) => { const m = apply(J.heardle, a.p_track); return m ? err(m) : ok(heardleState()); },
  hg_heardle_historique: () => (S.heardleHistErr ? err('Historique en panne') : ok(heardleHistorique())),
  hg_heardle_propose: (a) => { J.proposals.push(a); return ok('t-new'); },
  hg_proof_submit: (a) => {
    const q = PROOF_QUESTS.find((x) => x.code === a.p_quest); if (!q) return err('Cette quête à preuve ne fait pas partie des quêtes de la semaine');
    const p = J.proofs[q.code];
    if (p?.status === 'en_attente') return err('Ta preuve attend déjà la validation du Staff');
    J.proofs[q.code] = { status: 'en_attente', attempts: (p?.attempts || 0) + 1, paths: a.p_paths, note: a.p_note, share: a.p_share };
    return ok({ status: 'en_attente' });
  },
  hg_proof_queue: (a) => ok({ me: uid(), counts: { en_attente: J.queue.filter((x) => x.status === 'en_attente').length, validee: J.queue.filter((x) => x.status === 'validee').length, refusee: J.queue.filter((x) => x.status === 'refusee').length },
    items: J.queue.filter((x) => x.status === a.p_status) }),
  hg_proof_review: (a) => {
    const x = J.queue.find((q) => q.id === a.p_id);
    if (x.user_id === uid()) return err('Tu ne peux pas valider ta propre preuve');
    if (!a.p_ok && !a.p_reason) return err('Indique un motif (200 caractères au plus)');
    Object.assign(x, { status: a.p_ok ? 'validee' : 'refusee', reason: a.p_ok ? null : a.p_reason, reviewer: 'Ethan' });
    return ok({ id: x.id, status: x.status, paid: !!a.p_ok });
  },
  hg_proofs_purge_due: () => ok([]),
  hg_proofs_mark_purged: () => ok(0),
  hg_framed_admin: () => ok({ today, films: J.framedFilms, rounds: J.framedFilms.filter((f) => f.day).map((f) => ({ day: f.day, film_id: f.id, title: f.title, players: 4 })) }),
  hg_framed_film_save: (a) => { const p = a.p; if (S.saveFailTitle && p.title === S.saveFailTitle) return err('Titre refusé (test)'); const f = J.framedFilms.find((x) => x.id === p.id); if (f) Object.assign(f, p); else J.framedFilms.push({ ...p, day: null }); return ok(p); },
  hg_framed_round_save: (a) => { const f = J.framedFilms.find((x) => x.id === a.p_film); if (f) f.day = a.p_day; return ok(null); },
  hg_heardle_admin: () => ok({ today, tracks: J.heardleTracks, rounds: J.heardleTracks.filter((t) => t.day).map((t) => ({ day: t.day, track_id: t.id, title: t.title, artist: t.artist, cancelled: false, players: 3 })) }),
  hg_heardle_track_save: (a) => { const t = J.heardleTracks.find((x) => x.id === a.p.id); if (t) Object.assign(t, a.p); else J.heardleTracks.push({ ...a.p, id: 't' + J.heardleTracks.length }); return ok(a.p); },
  hg_heardle_round_save: (a) => { const t = J.heardleTracks.find((x) => x.id === a.p_track); if (t) t.day = a.p_day; return ok(null); },
  hg_battle_me: () => ok(battleMe()),
  hg_battle_set_deck: (a) => {
    if (a.p_copies.length !== 5) return err('Choisis exactement 5 cartes');
    const cards = a.p_copies.map((id) => COPIES.find((c) => c.copy_id === id));
    if (cards.filter((c) => ['mythique', 'identite', 'unique'].includes(c.rarity)).length > 1) return err('Une seule carte mythique, identité ou unique par main');
    J.deck = cards; return ok(cards);
  },
  hg_battle_attack: (a) => attack(a.p_defender, a.p_copies),
  hg_battle_seen: () => ok(0),
  hg_battle_settings_save: (a) => { for (const [k, v] of Object.entries(a.p)) if (k === 'actif' || k === 'gains') J.battleCfg[k] = v; return ok(J.battleCfg); },
};

/** Client : celui du faux de base, avec les RPC du paquet xJ3 en plus. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  if (window.__DB?.hg_pages && !window.__DB.hg_pages.some((p) => p.slug === 'jeux')) window.__DB.hg_pages.push({ slug: 'jeux', label: 'Jeux', mode: 'membres', in_nav: true, sort: 10 });
  if (window.__DB?.hg_perm_catalog && !window.__DB.hg_perm_catalog.some((p) => p.key === 'preuves')) window.__DB.hg_perm_catalog.push({ key: 'preuves', label: 'Preuves de quêtes', description: 'Valider les preuves', sort: 96 });
  c.rpc = async (fn, a = {}) => {
    if (HANDLERS[fn]) { window.__LOG.push(['rpc', fn, a]); return HANDLERS[fn](a); }
    if (fn === 'hg_card_quests_me' && S.proofQuests) { const r = await rpc0(fn, a); return ok(questsMe(r.data)); }
    return rpc0(fn, a);
  };
  return c;
}
