// Faux serveur des jeux (migration 084) pour les tests Playwright : question du jour (J4), Sutom (J8),
// et leurs sections admin. Script injecté avant la page par openPage({ init: 'fake-jeux.js' }) ; il s'accroche au faux
// client fake-sb.mjs par window.__FAKE_SETUP (base) et window.__FAKE_RPC (RPC). Mêmes formes de réponse que la base.
// Scénario (window.__SCN.jeux) : { deja: true } question déjà jouée dans le quiz ; { vide: true } aucune question,
// aucune compétition, aucun mot ; { fini: true } grille Sutom déjà finie ; { repondue: true } question du jour déjà répondue (juste).
// Expose window.__JEUX (état, pour les vérifications des tests).
(() => {
  const ME = '11111111-1111-4111-8111-111111111111';
  const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
  const SC = () => (window.__SCN && window.__SCN.jeux) || {};
  const now = Date.now();
  const iso = (j) => new Date(now + j * 864e5).toISOString();
  const day = (j) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now + j * 864e5)); // jour de Zurich
  const ok = (data) => ({ data, error: null });
  const ko = (message) => ({ data: null, error: { message } });

  // Semaine : lundi … dimanche, aujourd'hui = jeudi dans les données de démonstration.
  const semaine = (aujourdhui) => ['ok', 'ok', 'joker', aujourdhui, 'future', 'future', 'future'].map((state, i) => ({ day: day(i - 3), state }));
  const J = {
    jour: {
      day: day(0), closes_at: iso(1), bonus: 10, paliers: [[7, 50], [30, 200], [100, 1000]], already_played: false, answered: false,
      question: { id: 'qd-1', prompt: 'En quelle année est né le Tzatzikistan ?', type: 'choix_unique', difficulty: 'facile', category: 'Vie du gang', image_url: null,
        options: [{ id: 'a', text: '2021' }, { id: 'b', text: '2022' }, { id: 'c', text: '2023' }, { id: 'd', text: '2024' }] },
      streak: { current: 30, start: day(-31), jokers: [day(-1)], joker_left: 0, week: semaine('today') },
    },
    board: { month: day(0).slice(0, 8) + '01', rows: [
      { rank: 1, user_id: U(2), pseudo: 'Alice', color: '#6FA37F', avatar_url: null, bonnes: 22, repondues: 22 },
      { rank: 2, user_id: U(3), pseudo: 'Bruno', color: '#9A88C4', avatar_url: null, bonnes: 21, repondues: 22 },
      { rank: 3, user_id: U(4), pseudo: 'Chloé', color: '#7E93C9', avatar_url: null, bonnes: 19, repondues: 20 },
      ...Array.from({ length: 9 }, (_, i) => ({ rank: 4 + i, user_id: i === 8 ? ME : `x-${i}`, pseudo: i === 8 ? 'Ethan' : `Membre ${i + 4}`, color: '#ABA7A0', avatar_url: null, bonnes: 18 - i, repondues: 20 })),
    ], me: { rank: 12, bonnes: 10, repondues: 20 } },
    calendar: Array.from({ length: 28 }, (_, i) => ({ day: day(i - 7), question_id: i < 8 ? 'qd-1' : null, prompt: i < 8 ? 'En quelle année est né le Tzatzikistan ?' : null,
      difficulty: 'facile', category: 'Vie du gang', picked_by: i === 7 ? 'Ethan' : null, auto: i < 7, answered: i < 8 ? 9 : 0, correct: i < 8 ? 7 : 0 })),
    sutom: { word: 'RACLETTE', definition: 'Plat sacré du gang. Existe aussi en version « soirée raclette sans raclette ».', guesses: [], finished: false, solved: false, streak: 9 },
    dict: new Set(['RESTAURE', 'RATELIER', 'RECALEES', 'REGLETTE', 'RELEVENT', 'RAQUETTE', 'RACLETTE']),
    bank: [{ word: 'RACLETTE', definition: 'Plat sacré du gang.', active: true, last_day: day(0) }, { word: 'GOBELET', definition: 'Fait maison pour Lyon 2026.', active: true, last_day: null }],
    planned: [{ day: day(0), word: 'RACLETTE', definition: 'Plat sacré du gang.', picked_by: null }],
    calls: [],
  };
  window.__JEUX = J;

  /** Couleurs Sutom (2 bien placée, 1 mal placée, 0 absente), lettres doubles comptées comme la base. */
  function colors(w, g) {
    const res = Array(w.length).fill('0'); const rest = [];
    for (let i = 0; i < w.length; i++) if (g[i] === w[i]) res[i] = '2'; else rest.push(w[i]);
    for (let i = 0; i < w.length; i++) if (res[i] !== '2') { const j = rest.indexOf(g[i]); if (j >= 0) { res[i] = '1'; rest.splice(j, 1); } }
    return res.join('');
  }
  const norm = (p) => String(p || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

  window.__FAKE_SETUP = (DB) => {
    DB.hg_pages = DB.hg_pages.filter((x) => x.slug !== 'jeux'); // la base de test la réserve aux admins : ici elle est ouverte à tous
    DB.hg_pages.push({ slug: 'jeux', label: 'Jeux', mode: 'membres', in_nav: true, sort: 10 });
    const s = SC();
    if (s.deja) J.jour.already_played = true;
    if (s.repondue) Object.assign(J.jour, { answered: true, my_response: 'b', correct: true, explanation: 'Un Worldle de mars 2022 qui a mal tourné.', solution: '2022', stats: { answered: 12, correct: 9 } });
    if (s.vide) { J.jour.question = null; J.sutom = null; }
    if (s.fini) Object.assign(J.sutom, { guesses: ['RACLETTE'], finished: true, solved: true });
  };

  window.__FAKE_RPC = (fn, a) => {
    if (!/^hg_(quiz_daily|sutom)_/.test(fn) && fn !== 'hg_admin_reponses') return undefined;
    J.calls.push([fn, a]);
    const s = SC();
    if (s.fail === fn) return ko('Failed to fetch');
    /* ----- J4 ----- */
    if (fn === 'hg_quiz_daily_today') return ok(JSON.parse(JSON.stringify(J.jour)));
    if (fn === 'hg_quiz_daily_board') return ok(J.board);
    if (fn === 'hg_quiz_daily_answer') {
      if (J.jour.answered) return ko('Tu as déjà répondu à la question du jour');
      const juste = a.p_response === 'b';
      J.jour.streak = { ...J.jour.streak, current: 31, week: semaine('ok') };
      Object.assign(J.jour, { answered: true, my_response: a.p_response, correct: juste, explanation: 'Un Worldle de mars 2022 qui a mal tourné.', solution: '2022', stats: { answered: 12, correct: juste ? 9 : 8 } });
      return ok({ correct: juste, reward: J.jour.already_played ? 0 : (juste ? 50 : 0), bonus: 10, paliers: [{ palier: 30, paillettes: 200 }].filter(() => juste), copied: !J.jour.already_played,
        explanation: J.jour.explanation, solution: '2022', stats: J.jour.stats, streak: J.jour.streak });
    }
    if (fn === 'hg_quiz_daily_calendar') return ok({ today: day(0), days: J.calendar });
    if (fn === 'hg_quiz_daily_plan') {
      const d = J.calendar.find((x) => x.day === a.p_day);
      if (!d || a.p_day < day(0)) return ko('Choisis un jour entre aujourd’hui et dans un an');
      Object.assign(d, a.p_question ? { question_id: a.p_question, prompt: 'Question programmée', picked_by: 'Ethan', auto: false } : { question_id: null, prompt: null, picked_by: null });
      return ok(null);
    }
    /* ----- J8 ----- */
    if (fn === 'hg_sutom_state') {
      const g = J.sutom;
      if (!g) return ok({ day: day(0), available: false });
      return ok({ day: day(0), available: true, num: 42, length: g.word.length, first: g.word[0], max: 6,
        guesses: g.guesses.map((w) => ({ word: w, colors: colors(g.word, w) })), solved: g.solved, finished: g.finished,
        word: g.finished ? g.word : null, definition: g.finished ? g.definition : null, streak: g.streak, gain: g.finished ? 10 : null });
    }
    if (fn === 'hg_sutom_guess') {
      const g = J.sutom, x = norm(a.p_word);
      if (g.finished) return ko('Tu as déjà fini la grille du jour');
      if (x.length !== g.word.length) return ko(`Le mot fait ${g.word.length} lettres`);
      if (x[0] !== g.word[0]) return ko(`Le mot commence par ${g.word[0]}`);
      if (!J.dict.has(x)) return ok({ valid: false, message: 'Ce mot n’est pas dans le dictionnaire' });
      if (g.guesses.includes(x)) return ok({ valid: false, message: 'Tu as déjà essayé ce mot' });
      g.guesses.push(x);
      const solved = x === g.word, fin = solved || g.guesses.length >= 6;
      Object.assign(g, { solved, finished: fin });
      if (fin) g.streak += 1;
      return ok({ valid: true, word: x, colors: colors(g.word, x), solved, finished: fin, tries: g.guesses.length, gain: fin ? (solved ? 10 : 3) : 0,
        answer: fin ? g.word : null, definition: fin ? g.definition : null, streak: fin ? g.streak : null });
    }
    if (fn === 'hg_admin_reponses') return SC().admin ? ok(a.p_jeu === 'sutom' && J.sutom ? { titre: 'Sutom : réponses', sections: [{ titre: 'Mot du jour', lignes: [{ label: 'Mot', valeur: J.sutom.word, ton: 'ok' }, { label: 'Définition', valeur: J.sutom.definition || '—' }] }] } : { titre: 'Réponses', note: 'Rien à révéler.', sections: [] }) : ko('Réservé aux administrateurs');
    if (fn === 'hg_sutom_solution') return ok(SC().admin && J.sutom ? { word: J.sutom.word, definition: J.sutom.definition, day: day(0) } : null);
    if (fn === 'hg_sutom_admin') return ok({ today: day(0), dict: 130528, bank: J.bank, planned: J.planned });
    if (fn === 'hg_sutom_bank_save') {
      const w = norm(a.p_word);
      if (!/^[A-Z]{5,9}$/.test(w)) return ko('Un mot de 5 à 9 lettres, sans espace ni tiret');
      const b = J.bank.find((x) => x.word === w);
      if (b) Object.assign(b, { definition: a.p_definition, active: a.p_active }); else J.bank.push({ word: w, definition: a.p_definition, active: true, last_day: null });
      return ok(w);
    }
    if (fn === 'hg_sutom_program') {
      if (!a.p_word) { J.planned = J.planned.filter((p) => p.day !== a.p_day); return ok(null); }
      if (!a.p_day || a.p_day <= day(0)) return ko('Choisis un jour entre demain et dans un an');
      J.planned.push({ day: a.p_day, word: norm(a.p_word), definition: a.p_definition, picked_by: 'Ethan' });
      return ok(null);
    }
    return ok(null);
  };
})();
