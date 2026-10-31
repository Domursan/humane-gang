// Faux client Supabase de la page « Jeux » (/pages/jeux/jeux.html) et de ses sous-sections admin (migration 083).
// Enveloppe fake-sb.mjs (chargé depuis le dépôt) : ajoute la page « jeux » au menu et simule les RPC GeoGuessr (J1),
// « Qui a dit ça ? » (J3), avec les mêmes règles que la base (une tentative, plafonds, masquage).
// Scénario (window.__SCN) : geoNone (pas de manche), geoPlayed (manche déjà jouée), quotesNone, quoteConsent (une citation
// attend l'accord du membre), jeuxFail (toutes les RPC des jeux échouent).
// Exporte createClient().
const base = await import(`${location.origin}${window.__HG_RACINE || ''}/tests/fixtures/fake-sb.mjs`);

const S = window.__SCN || {};
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
/** Jour de Zurich, AAAA-MM-JJ. */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ok = (data) => ({ data, error: null });
const ko = (message) => ({ data: null, error: { message } });

/** Distance haversine en mètres (comme hg_geo_dist). */
function dist(a, b, c, d) {
  const r = (x) => (x * Math.PI) / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return Math.round(2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(h))));
}

/** État simulé des jeux. */
const G = {
  rounds: [
    { id: 'geo-today', day: today(), number: 18, image_path: `${ME}/geo/r1.webp`, lat: 45.7606, lon: 4.8593, label: 'Gare de la Part-Dieu', event_id: 'eeeeeeee-0000-4000-8000-000000000001', event_title: 'RDV Lyon 2026', active: true, photo_id: null, guesses: 0 },
    { id: 'geo-old', day: '2026-10-01', number: 4, image_path: `${ME}/geo/old.webp`, lat: 46.2, lon: 6.14, label: 'Jet d’eau', event_id: null, event_title: null, active: true, photo_id: null, guesses: 2 },
    { id: 'geo-res', day: null, number: 0, image_path: `${ME}/geo/res.webp`, lat: 46.5, lon: 6.6, label: 'Lausanne gare', event_id: null, event_title: null, active: true, photo_id: null, guesses: 0 },
  ],
  guesses: [
    { round: 'geo-today', user_id: U(2), pseudo: 'Alice', color: '#E2C77E', score: 4940, distance_m: 120 },
    { round: 'geo-today', user_id: U(3), pseudo: 'Bruno', color: '#9A88C4', score: 3905, distance_m: 2100 },
  ],
  quotes: S.quotesNone ? [] : [
    { id: 'qt-1', quote: 'MERCI DE PAS TROLL la liste de courses', difficulty: 'facile', reward: 10, good: 'b', context: 'Salon nouvel an, décembre 2024',
      options: [['a', 'Alice', U(2), '#E0909A'], ['b', 'Bruno', U(3), '#E2C77E'], ['c', 'Chloé', U(4), '#CF7055'], ['d', 'David', U(5), '#6FA37F']], rate: 62 },
    { id: 'qt-2', quote: 'KC > G2, c’est mathématique', difficulty: 'moyen', reward: 10, good: 'c', context: 'Worlds 2025',
      options: [['a', 'Emma', U(6), '#7E93C9'], ['b', 'Alice', U(2), '#E0909A'], ['c', 'David', U(5), '#6FA37F'], ['d', 'Bruno', U(3), '#E2C77E']], rate: 40 },
  ],
  props: [],
  consent: S.quoteConsent ? [{ id: 'pr-c', quote: 'Le livre est mieux', context: 'Ciné-club', proposed_by: 'Alice', created_at: new Date().toISOString() }] : [],
  queue: [
    { id: 'pr-1', quote: 'On part à 8 h pile', context: 'Sortie ski', status: 'accord_auteur', author: 'Bruno', proposed_by: 'Alice', publiable: true, refused_by: null },
    { id: 'pr-2', quote: 'Je ramène la raclette', context: null, status: 'nouvelle', author: 'Chloé', proposed_by: 'Alice', publiable: false, refused_by: null },
  ],
};
if (S.geoNone) G.rounds = G.rounds.filter((r) => r.id !== 'geo-today' && r.id !== 'geo-res');
if (S.geoPlayed) G.guesses.push({ round: 'geo-today', user_id: ME, pseudo: 'Ethan', color: '#4F6A8F', score: 4210, distance_m: 800, lat: 45.765, lon: 4.85, reward: 42 });
window.__JEUX = G;

/** Solution d'une manche (après le vote). */
const sol = (r) => ({ lat: r.lat, lon: r.lon, label: r.label, event_id: r.event_id, event_title: r.event_title, event_date: '2026-03-14T12:00:00Z' });
/** Ma tentative sur une manche, au format de hg_geo_today. */
function mine(r) {
  const g = G.guesses.find((x) => x.round === r.id && x.user_id === ME);
  return g ? { lat: g.lat, lon: g.lon, distance_m: g.distance_m, score: g.score, reward: g.reward || 0, honor: !!g.honor, solution: sol(r) } : null;
}
/** Une citation au format de hg_quote_list. */
function quoteRow(x) {
  return { id: x.id, quote: x.quote, difficulty: x.difficulty, reward: x.reward,
    options: x.options.map(([id, text, user_id, color]) => ({ id, text, user_id, color, avatar_url: null })),
    answered: !!x.answer, my_response: x.answer || null, correct: x.answer ? x.answer === x.good : null, earned: x.answer === x.good ? x.reward : 0,
    explanation: x.answer ? x.context : null, solution: x.answer ? [x.good] : null, rate: x.answer ? x.rate : null };
}

/** Classement des jeux du jour (hg_jeux_classement, migration 179) : Sutom à 8 points et GeoGuessr à 10, notés aujourd'hui. */
function classement() {
  const jeux = { sutom: { score: 8, points: 170, reussi: true, palier: 3 }, geo: { score: 10, points: 200, reussi: true, palier: 1 } };
  return { jeu: null, day: today(), total_jeux: 16, bonus: 250, max: 200, pas: 15, rate: 50,
    jour: [{ user_id: 'u-moi', pseudo: 'Moi', points: 18, paillettes: 370, parties: 2, reussies: 2 }], semaine: [],
    moi: { faits: 1, bonus: false, jeux } };
}

/** RPC des jeux : réponse, ou undefined pour laisser répondre le faux client de base. */
function jeux(fn, a = {}) {
  if (fn === 'hg_jeux_classement' && !S.jeuxFail) return ok(classement());
  if (!/^hg_(geo|quote)_/.test(fn) && !(fn === 'hg_quiz_answer' && String(a.p_question).startsWith('qt-'))) return undefined;
  if (S.jeuxFail) return ko('Failed to fetch');
  const d = today();
  switch (fn) {
    case 'hg_geo_today': {
      const r = G.rounds.find((x) => x.day === d);
      const reglages = { plafond: 50, points_par_paillette: 100, echelle_km: 50, bonus: [100, 60, 30] };
      if (!r) return ok({ round: null, day: d, mine: null, reglages });
      return ok({ day: d, round: { id: r.id, day: r.day, number: r.number, image_path: r.image_path }, mine: mine(r), reglages });
    }
    case 'hg_geo_guess': {
      const r = G.rounds.find((x) => x.id === a.p_round);
      if (!r || !r.day || r.day > d) return ko('Cette manche n’est pas ouverte');
      if (a.p_lat == null || a.p_lon == null) return ko('Pose ton épingle sur la carte');
      if (G.guesses.some((x) => x.round === r.id && x.user_id === ME)) return ko('Tu as déjà joué cette manche');
      const honor = r.day < d, m = dist(a.p_lat, a.p_lon, r.lat, r.lon), score = Math.round(5000 * Math.exp(-m / 50000));
      const reward = honor ? 0 : Math.min(50, Math.floor(score / 100));
      G.guesses.push({ round: r.id, user_id: ME, pseudo: 'Ethan', color: '#4F6A8F', score, distance_m: m, lat: a.p_lat, lon: a.p_lon, reward, honor });
      return ok({ round_id: r.id, distance_m: m, score, reward, honor, lat: a.p_lat, lon: a.p_lon, solution: sol(r) });
    }
    case 'hg_geo_board': {
      const rid = a.p_round || G.rounds.find((x) => x.day === d)?.id;
      if (a.p_scope === 'semaine') {
        return ok(G.guesses.filter((g) => !g.honor).map((g) => ({ ...g, manches: 1 })).sort((x, y) => y.score - x.score).map((g, i) => ({ ...g, rank: i + 1 })));
      }
      if (a.p_round && !G.guesses.some((x) => x.round === rid && x.user_id === ME)) return ok([]);
      return ok(G.guesses.filter((g) => g.round === rid && !g.honor).sort((x, y) => y.score - x.score).map((g, i) => ({ ...g, rank: i + 1 })));
    }
    case 'hg_geo_archive':
      return ok(G.rounds.filter((r) => r.day && r.day < d).map((r) => { const m = mine(r); return { id: r.id, day: r.day, number: r.number, image_path: r.image_path, score: m?.score ?? null, distance_m: m?.distance_m ?? null, honor: m?.honor ?? null, label: m ? r.label : null, mine: m }; }));
    case 'hg_geo_admin_list': return ok(G.rounds.map((r) => ({ ...r })));
    case 'hg_geo_round_save': {
      window.__LOG.push(['geo_save', a.p_id, a.p]);
      if (!a.p?.image_path) return ko('Photo de la manche manquante');
      if (a.p_id) Object.assign(G.rounds.find((x) => x.id === a.p_id) || {}, a.p);
      else G.rounds.push({ id: `geo-${G.rounds.length + 1}`, number: 0, guesses: 0, ...a.p });
      return ok(a.p_id || 'geo-new');
    }
    case 'hg_quote_list': return ok(G.quotes.map(quoteRow).sort((x, y) => x.answered - y.answered));
    case 'hg_quiz_answer': {
      const x = G.quotes.find((q) => q.id === a.p_question);
      if (!x) return ko('Cette question n’est pas ouverte');
      if (x.answer) return ko('Tu as déjà répondu à cette question');
      x.answer = a.p_response;
      const c = x.answer === x.good;
      const jour = G.jourFait ? 0 : (c ? 200 : 50); G.jourFait = true; // première citation du jour : la partie du jour (migration 181)
      return ok({ correct: c, reward: c ? x.reward : 0, jour_gain: jour, explanation: x.context, solution: [x.good] });
    }
    case 'hg_quote_propose': {
      window.__LOG.push(['quote_propose', a.p_quote, a.p_author, a.p_context]);
      if (String(a.p_quote || '').trim().length < 3) return ko('La citation doit faire entre 3 et 280 caractères');
      G.props.unshift({ id: `pr-${G.props.length + 10}`, quote: a.p_quote, author: 'Bruno', status: 'nouvelle', created_at: new Date().toISOString() });
      return ok('pr-new');
    }
    case 'hg_quote_mine': return ok({ proposees: G.props, a_valider: G.consent, restantes: Math.max(0, 3 - G.props.length) });
    case 'hg_quote_author_reply': window.__LOG.push(['quote_reply', a.p_id, a.p_ok]); G.consent = G.consent.filter((x) => x.id !== a.p_id); return ok(a.p_ok ? 'accord_auteur' : 'refusee');
    case 'hg_quote_queue': return ok(G.queue);
    case 'hg_quote_publish': window.__LOG.push(['quote_publish', a]); { const x = G.queue.find((q) => q.id === a.p_id); if (x) x.status = 'publiee'; } return ok('qt-new');
    case 'hg_quote_refuse': window.__LOG.push(['quote_refuse', a.p_id]); { const x = G.queue.find((q) => q.id === a.p_id); if (x) x.status = 'refusee'; } return ok(null);
    default: return ok(null);
  }
}

/** Client : celui de fake-sb.mjs, avec la page « jeux » et les RPC des jeux. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const DB = window.__DB;
  // Ces tests parcourent la page comme un membre : la page « Jeux » y est ouverte à tous (la base la réserve aux admins au lancement).
  if (DB?.hg_pages) {
    const jp = DB.hg_pages.find((p) => p.slug === 'jeux');
    if (jp) { jp.mode = 'membres'; jp.in_nav = true; } else DB.hg_pages.push({ slug: 'jeux', label: 'Jeux', mode: 'membres', in_nav: true, sort: 10 });
  }
  const rpc = c.rpc;
  c.rpc = async (fn, args) => {
    const r = jeux(fn, args);
    if (r === undefined) return rpc(fn, args);
    window.__LOG.push(['rpc', fn, args]);
    return r;
  };
  return c;
}
