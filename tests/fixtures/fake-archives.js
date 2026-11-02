// Faux serveur des manches passées « pour l'honneur » (idée 13, migration 213) pour les tests Playwright :
// hg_jeux_archive(p_jeu), hg_jeux_honneur_etat(p_jeu, p_day), hg_jeux_honneur_essai(p_jeu, p_day, p).
// Script injecté avant la page (openPage({ init: 'fake-archives.js' }), ou à la suite de fake-jeux.js dans un { content }) :
// il s'accroche à window.__FAKE_RPC (faux client fake-sb.mjs, et les faux qui l'enveloppent) en gardant le précédent.
// Données : 7 manches passées par jeu (hier … il y a 7 jours) ; hier jouée et trouvée en 3, avant-hier pas jouée (celle qu'on
// joue dans les tests), il y a 3 jours en cours pour l'honneur. Réponse d'une manche : jamais envoyée avant la fin.
// Sutom d'avant-hier : PARAPLUIE ; Pays : Chili ; Code du jour : royg ; Connexions : groupes A à D.
// Scénario (window.__SCN.archives) : { vide: true } aucune manche passée ; { panne: true } hg_jeux_archive en erreur.
// Expose window.__ARCH : { calls, parties } pour les vérifications des tests.
(() => {
  const SC = () => (window.__SCN && window.__SCN.archives) || {};
  const now = Date.now();
  const day = (j) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now + j * 864e5));
  const ok = (data) => ({ data, error: null });
  const ko = (message) => ({ data: null, error: { message } });
  const copie = (x) => JSON.parse(JSON.stringify(x));
  const REPONSES = { sutom: 'PARAPLUIE', nj_pays: 'Chili', code_jour: 'royg', nj_connexions: 'Groupe A · Groupe B · Groupe C · Groupe D',
    framed: 'Amélie', nj_plat: 'Raclette', nj_sudoku: 'Niveau facile' };
  const A = { calls: [], parties: {} };
  window.__ARCH = A;

  /** Ma partie pour l'honneur d'une manche (créée au premier essai). */
  const partie = (jeu, d) => (A.parties[`${jeu}|${d}`] ||= { essais: [], fini: false, reussi: false });

  function archive(jeu) {
    if (SC().vide) return { jeu, manches: [] };
    const manches = Array.from({ length: 7 }, (_, i) => {
      const d = day(-(i + 1)), num = 40 - i;
      const h = A.parties[`${jeu}|${d}`];
      const joue = i === 0 || i >= 4 || !!h?.fini;
      return { day: d, num, joue, honneur: !!h?.fini, en_cours: i === 2 || (!!h && !h.fini), reussi: joue ? (h ? h.reussi : i !== 5) : null,
        palier: joue ? (h ? h.essais.length : 3) : null, titre: joue ? (h?.fini ? REPONSES[jeu] : jeu === 'code_jour' ? 'rgby' : `Réponse ${num}`) : null,
        trouves: 7, joueurs: 9 };
    });
    return { jeu, manches };
  }

  /* ----- États d'une manche passée, mêmes formes que l'état du jour de chaque jeu ----- */
  const sutomCouleurs = (w, g) => [...g].map((c, i) => (c === w[i] ? '2' : w.includes(c) ? '1' : '0')).join('');
  function etat(jeu, d) {
    const h = partie(jeu, d), fin = h.fini, num = 40 - Math.round((Date.parse(day(0)) - Date.parse(d)) / 864e5) + 1;
    if (jeu === 'sutom') {
      const w = REPONSES.sutom;
      return { day: d, available: true, num, length: w.length, first: w[0], max: 6, guesses: h.essais.map((x) => ({ word: x, colors: sutomCouleurs(w, x) })),
        solved: h.reussi, finished: fin, word: fin ? w : null, definition: fin ? 'Abri portatif.' : null, gain: null, honneur: true, du_jour: false };
    }
    if (jeu === 'nj_pays') {
      return { jeu: 'pays', day: d, round: num, image: null, media: { svg: 'M10 10 L90 10 L50 90 Z', vb: '0 0 100 100' }, indices: ['Amérique du Sud', 'Andes', 'Très long'].slice(0, fin ? 3 : h.essais.filter((x) => !x.ok).length),
        indices_total: 3, photo_bientot: false, essais: h.essais, erreurs: h.essais.filter((x) => !x.ok).length, solved: h.reussi, finished: fin,
        score: fin ? (h.reussi ? 11 - h.essais.length : 0) : null, reward: null, gain: null, consolation: null,
        reponse: fin ? { titre: 'Chili', reponse: 'Chili', details: { capitale: 'Santiago' } } : null, choix: ['Chili', 'Mongolie', 'Suisse'], board: [], hier: null, honneur: true, du_jour: false };
    }
    if (jeu === 'code_jour') {
      const trouve = h.essais.find((e) => e.bien === 4);
      return { jour: d, num, essais: h.essais, trouve_en: trouve ? trouve.n : null, fini: fin, serie: null, secret: fin ? 'royg' : null, classement: [], trouveurs: 3, gain: null, honneur: true, du_jour: false };
    }
    if (jeu === 'nj_connexions') {
      const mots = ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'D4'];
      return { jeu: 'connexions', day: d, numero: num, grille: { mots, trouves: [] }, partie: null, solution: null, gain: 0, board: { semaine: [], jour: [] }, honneur: true, du_jour: false };
    }
    if (jeu === 'nj_sudoku') {
      return { jeu: 'sudoku', variante: d, day: d, gain: 0, recompense_aujourdhui: false, sudoku: { niveau: 'facile', donnes: '0'.repeat(81) }, sudoku_fait: null, board: [], honneur: true, du_jour: false };
    }
    if (jeu === 'framed') {
      return { day: d, round: num, total_frames: 6, frames: ['framed/amelie-1.webp'], guesses: [], solved: false, finished: false, score: null, reward: null, gain: null, consolation: null,
        film: null, films: [{ id: 'f-amelie', title: 'Amélie', year: 2001 }, { id: 'f-nope', title: 'Nope', year: 2022 }], board: [], hier: null, honneur: true, du_jour: false };
    }
    return null;
  }

  function essai(jeu, d, p) {
    const h = partie(jeu, d);
    if (h.fini) return ko('Tu as déjà fini cette manche.');
    if (jeu === 'sutom') {
      const w = REPONSES.sutom, x = String(p.mot || '').toUpperCase();
      if (x.length !== w.length) return ko(`Le mot fait ${w.length} lettres`);
      h.essais.push(x);
      h.reussi = x === w; h.fini = h.reussi || h.essais.length >= 6;
      return ok({ valid: true, word: x, colors: sutomCouleurs(w, x), solved: h.reussi, finished: h.fini, tries: h.essais.length, gain: 0, honneur: true,
        answer: h.fini ? w : null, definition: h.fini ? 'Abri portatif.' : null });
    }
    if (jeu === 'nj_pays') {
      const juste = p.texte === 'Chili';
      h.essais.push({ t: p.texte ?? null, ok: juste });
      h.reussi = juste; h.fini = juste || h.essais.length >= 6;
      return ok(etat(jeu, d));
    }
    if (jeu === 'code_jour') {
      const S = 'royg', e = String(p.essai || '');
      let bien = 0; const rs = [], re = [];
      for (let i = 0; i < 4; i++) { if (e[i] === S[i]) bien++; else { rs.push(S[i]); re.push(e[i]); } }
      let mal = 0; for (const c of re) { const k = rs.indexOf(c); if (k >= 0) { mal++; rs.splice(k, 1); } }
      h.essais.push({ n: h.essais.length + 1, essai: e, bien, mal });
      h.reussi = bien === 4; h.fini = h.reussi || h.essais.length >= 10;
      return ok(etat(jeu, d));
    }
    return ko('Essai non simulé');
  }

  const avant = window.__FAKE_RPC;
  window.__FAKE_RPC = (fn, a = {}) => {
    if (fn === 'hg_jeux_archive' || fn === 'hg_jeux_honneur_etat' || fn === 'hg_jeux_honneur_essai') {
      A.calls.push([fn, copie(a)]);
      if (fn === 'hg_jeux_archive') return SC().panne ? ko('Archives en panne') : ok(archive(a.p_jeu));
      if (!a.p_day || a.p_day >= day(0)) return ko('Cette manche ne fait pas partie des manches passées.');
      if (fn === 'hg_jeux_honneur_etat') { const e = etat(a.p_jeu, a.p_day); return e ? ok(e) : ko('Jeu non simulé'); }
      return essai(a.p_jeu, a.p_day, a.p || {});
    }
    if (/^hg_jeux_(fin|series)|^hg_sutom_guess$|^hg_nj_essai$|^hg_duel_jour_essayer$/.test(fn)) A.calls.push([fn, copie(a)]);
    return typeof avant === 'function' ? avant(fn, a) : undefined;
  };
})();
