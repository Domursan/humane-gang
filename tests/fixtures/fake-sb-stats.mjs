// Faux client Supabase de la vue « Mes stats » (/pages/jeux/jeux.html#mes-stats, idée 18, migration 208).
// Enveloppe fake-sb-jeux.mjs (page « Jeux » ouverte aux membres, classement des jeux du jour) et répond à hg_jeux_mes_stats(p_periode)
// avec des chiffres fixes, cohérents avec 7 jours d'historique : 18 jeux joués, « Qui a dit ça ? » sans partie, Question du jour arrivée
// plus tard, Code du jour avec des temps manquants.
// Scénario (window.__SCN) : statsVide (nouveau membre, aucune partie), statsFailOnce (le premier appel échoue, le suivant répond),
// statsLent (réponse après 1,5 s, pour voir le chargement), uid comme le faux de base.
// Exporte createClient().
const S = window.__SCN || {};
const prefix = window.__HG_RACINE || '';
const base = await import(`${location.origin}${prefix}/tests/fixtures/fake-sb-jeux.mjs`);

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
/** Jour de Zurich, AAAA-MM-JJ, décalé de n jours. */
const jour = (n = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + n * 864e5));
const ok = (data) => ({ data, error: null });
const ko = (message) => ({ data: null, error: { message } });

/** Jeu par jeu : clé, parties, réussies, moyenne, meilleur, Paillettes, essais, secondes, sans_temps, série, record, depuis. */
const JEUX = [
  ['sutom', 7, 6, 7.3, 10, 1095, 3.2, 95, 0, 7, 7, jour(-6)], ['nj_connexions', 7, 7, 9.1, 10, 1305, null, 140, 0, 7, 7, jour(-6)],
  ['nj_replique', 7, 7, 9.8, 10, 1375, 1.2, 25, 0, 6, 6, jour(-6)], ['nj_anagramme', 6, 6, 10, 10, 1200, null, 70, 0, 0, 5, jour(-6)],
  ['nj_pays', 6, 6, 9.5, 10, 1155, 1.5, 30, 0, 3, 4, jour(-6)], ['nj_jv', 6, 5, 8, 10, 1020, 2.4, 40, 0, 2, 4, jour(-6)],
  ['nj_plat', 6, 5, 8.3, 10, 1045, 2.2, 35, 0, 6, 6, jour(-6)], ['code_jour', 6, 4, 3.7, 8, 630, 6.5, 180, 2, 1, 3, jour(-6)],
  ['nj_motscroises', 5, 5, 9.8, 10, 985, null, 210, 0, 0, 4, jour(-6)], ['nj_pochette', 5, 4, 6, 9, 700, 4, 50, 0, 0, 3, jour(-6)],
  ['nj_motmele', 5, 5, 9.6, 10, 970, null, 160, 0, 5, 5, jour(-6)], ['nj_nerdle', 4, 4, 6.5, 9, 590, 4.5, 120, 0, 4, 4, jour(-6)],
  ['framed', 4, 4, 7.3, 9, 640, 3.8, 60, 0, 0, 2, jour(-6)], ['heardle', 4, 2, 4, 9, 440, 2, 45, 0, 0, 1, jour(-6)],
  ['nj_sudoku', 3, 3, 8, 9, 510, null, 420, 0, 0, 2, jour(-6)], ['nj_carte', 3, 1, 1.3, 4, 230, 6, 55, 0, 0, 1, jour(-6)],
  ['quiz_jour', 3, 2, 6.7, 10, 450, null, null, 3, 3, 3, jour(-3)], ['geo', 1, 1, 10, 10, 200, null, null, 1, 1, 1, jour(-1)],
  ['citations', 0, 0, null, null, 0, null, null, 0, 0, 0, null],
];
const ligne = ([jeu, parties, reussies, moyenne, meilleur, paillettes, essais, secondes, sans_temps, serie, record, depuis]) =>
  ({ jeu, parties, reussies, moyenne, meilleur, paillettes, essais, secondes, sans_temps, serie, record, depuis });
const RIVAL = { pseudo: 'Bruno', color: '#9A88C4', avatar_url: null, points: 704, ecart: 9 };

/** Réponse de hg_jeux_mes_stats selon la période (7, mois, tout). */
function stats(per) {
  const p = ['7', 'mois', 'tout'].includes(per) ? per : 'tout';
  const vide = { periode: p, day: jour(), de: null, depuis: null, toutes_parties: 0, total: { parties: 0, reussies: 0, moyenne: null, paillettes: 0 }, bonus: { n: 0, paillettes: 0 }, moi: null, rival: null, jeux: JEUX.map(ligne).map((j) => ({ ...j, parties: 0, reussies: 0, moyenne: null, meilleur: null, paillettes: 0, essais: null, secondes: null, sans_temps: 0, serie: 0, record: 0, depuis: null })) };
  if (S.statsVide) return vide;
  if (p === '7') return { periode: p, day: jour(), de: jour(-6), depuis: jour(-6), toutes_parties: 88, total: { parties: 20, reussies: 17, moyenne: 7.1, paillettes: 3120 }, bonus: { n: 0, paillettes: 0 },
    moi: { points: 142, rang: 2, total: 9 }, rival: { ...RIVAL, points: 150, ecart: 8 }, jeux: JEUX.map(ligne).map((j) => ({ ...j, parties: Math.min(j.parties, 2), reussies: Math.min(j.reussies, 2) })) };
  if (p === 'mois') return { periode: p, day: jour(), de: jour().slice(0, 8) + '01', depuis: jour(-6), toutes_parties: 88, total: { parties: 30, reussies: 26, moyenne: 8.2, paillettes: 4800 }, bonus: { n: 1, paillettes: 250 },
    moi: { points: 246, rang: 1, total: 10 }, rival: null, jeux: JEUX.map(ligne).map((j) => ({ ...j, parties: Math.min(j.parties, 3), reussies: Math.min(j.reussies, 3) })) };
  return { periode: p, day: jour(), de: jour(-6), depuis: jour(-6), toutes_parties: 88, total: { parties: 88, reussies: 77, moyenne: 7.9, paillettes: 12260 }, bonus: { n: 2, paillettes: 500 },
    moi: { points: 695, rang: 4, total: 11 }, rival: RIVAL, jeux: JEUX.map(ligne) };
}

/** Client : celui de fake-sb-jeux.mjs, plus hg_jeux_mes_stats. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc = c.rpc;
  let appels = 0;
  c.rpc = async (fn, a = {}) => {
    if (fn !== 'hg_jeux_mes_stats') return rpc(fn, a);
    window.__LOG.push(['rpc', fn, a]);
    appels += 1;
    if (S.statsFailOnce && appels === 1) return ko('Failed to fetch');
    if (S.statsLent) await new Promise((r) => setTimeout(r, 1500));
    return ok(stats(a.p_periode));
  };
  return c;
}
