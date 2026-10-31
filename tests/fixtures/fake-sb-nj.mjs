// Faux client Supabase des jeux du jour « devine en 6 essais » (migration 137) : Carte mystère, Jeu vidéo, Pochette,
// Réplique, Pays, Plat. Enveloppe un faux existant (fake-sb.mjs par défaut, ou window.__SCN.jeuxBase) chargé depuis le
// site de test, et répond aux RPC hg_nj_etat et hg_nj_essai avec un état en mémoire (window.__NJ). Les autres appels
// passent au faux de base. Scénario (window.__SCN) : noRound (pas de manche aujourd'hui), jeuxBase.
// Réponses, indices et distances suivent les règles du serveur (hg_nj__juste, hg_nj_geo) ; « Réponse inconnue » si hors liste.
// Exporte createClient().
const S = window.__SCN || {};
const prefix = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${prefix}/tests/fixtures/${S.jeuxBase || 'fake-sb.mjs'}`);

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ok = (data) => ({ data, error: null });
const err = (message) => ({ data: null, error: { message } });
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); // jour de Zurich, comme le site

/* ---------- Villes (capitales) pour les distances ---------- */
const VILLE = {
  'Argentine': { lat: -34.6, lon: -58.38 }, 'Brésil': { lat: -15.79, lon: -47.88 }, 'Chili': { lat: -33.45, lon: -70.67 },
  'Chine': { lat: 39.9, lon: 116.4 }, 'Pérou': { lat: -12.05, lon: -77.04 }, 'Thaïlande': { lat: 13.75, lon: 100.5 },
  'Japon': { lat: 35.68, lon: 139.69 }, 'Italie': { lat: 41.9, lon: 12.5 }, 'Mexique': { lat: 19.43, lon: -99.13 },
};
const R = Math.PI / 180;
function distance(a, b) {
  const dLat = (b.lat - a.lat) * R, dLon = (b.lon - a.lon) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function cap(a, b) {
  const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
}
const FLECHES = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
/** Distance, direction et proximité d'un essai (comme hg_nj_geo). */
function geo(a, b) {
  const k = distance(a, b);
  return { km: Math.round(k), dir: k < 1 ? '✓' : FLECHES[Math.floor(((cap(a, b) + 22.5) % 360) / 45)], pct: Math.max(0, Math.round(100 - k / 200)) };
}

/* ---------- Contenu des six jeux (une manche par jeu) ---------- */
const CONTENU = {
  carte: { titre: 'Le chalet', image: '/assets/cartes/abysses/001.png', choix: ['Le chalet', 'Xali', 'Wae', 'Serge'], media: { rarete: 'rare' },
    indices: ['Série : Abysses', 'Rareté : rare · famille lieu', 'Carte n°1 sur 12 de la série', 'Commence par « L » · 9 caractères'], details: { serie: 'Abysses', numero: 1 } },
  jv: { titre: 'Stardew Valley', image: '/assets/images/jeux/geo.webp', choix: ['Celeste', 'Hades', 'Stardew Valley', 'Undertale'], media: { fx: 0.3, fy: 0.6 },
    indices: ['Sorti en 2016', 'Simulation de ferme', 'Un fermier quitte la ville'], details: { editeur: 'ConcernedApe' } },
  pochette: { titre: 'Abbey Road', image: '/assets/images/jeux/geo.webp', choix: ['Abbey Road', 'Random Access Memories', 'Thriller'], media: {},
    indices: ['Groupe britannique', 'Sorti en 1969', 'Une photo sur un passage piéton'], details: { artiste: 'The Beatles' } },
  replique: { titre: 'Le Dîner de cons', image: null, choix: ['Le Dîner de cons', 'Intouchables', 'Les Visiteurs', 'Le Prestige'],
    media: { citation: 'Tu sais ce que j’en pense, de ce dîner.', contexte: 'Comédie française, 1998' },
    indices: ['Comédie', 'Un dîner entre amis'], details: { annee: 1998 } },
  pays: { titre: 'Chili', image: '/assets/images/jeux/geo.webp', cible: 'Chili', choix: ['Argentine', 'Brésil', 'Chili', 'Chine', 'Pérou'],
    media: { svg: 'M30 0 L60 10 L55 60 L70 120 L40 190 L25 150 L20 80 Z', vb: '0 0 100 200' },
    indices: ['Continent : Amérique du Sud', 'Population : environ 19,6 millions', 'Langue officielle : espagnol'], details: { capitale: 'Santiago' } },
  // Plat (migration 152) : on devine le NOM du plat ; un essai raté donne la distance entre les pays des deux plats.
  plat: { titre: 'Pad thaï', image: '/assets/images/jeux/geo.webp', cible: 'Thaïlande', pays: 'Thaïlande', choix: ['Empanadas', 'Pad thaï', 'Pizza', 'Ramen', 'Tacos', 'Tom yum'], media: {},
    indices: ['Nouilles de riz sautées', 'Cacahuètes et citron vert', 'Pays d’origine : Thaïlande', 'Commence par « P » · 8 caractères'], details: { plat: 'Pad thaï' } },
};
/** Pays d'origine des plats proposés (distances du Plat du jour). */
const PAYS_PLAT = { Empanadas: 'Argentine', 'Pad thaï': 'Thaïlande', Pizza: 'Italie', Ramen: 'Japon', Tacos: 'Mexique', 'Tom yum': 'Thaïlande' };
/** Parties en cours : essais, terminée, gagnée. */
const J = window.__NJ = Object.fromEntries(Object.keys(CONTENU).map((k) => [k, { essais: [], finished: false, solved: false }]));
// Scénario dejaFini : <jeu> : ce jeu est déjà gagné en 2 essais à l'ouverture (retour sur une partie finie).
if (S.dejaFini && CONTENU[S.dejaFini]) Object.assign(J[S.dejaFini], { essais: [{ t: CONTENU[S.dejaFini].choix.find((c) => c !== CONTENU[S.dejaFini].titre), ok: false }, { t: CONTENU[S.dejaFini].titre, ok: true }], finished: true, solved: true });
const BOARD = () => [{ user_id: U(2), pseudo: 'Alice', color: '#D97757', points: 14, wins: 3 }, { user_id: ME, pseudo: 'Ethan', color: '#4F6A8F', points: 9, wins: 2 }];

/** État d'un jeu, tel que renvoyé par hg_nj_etat. */
function etat(jeu) {
  const c = CONTENU[jeu], g = J[jeu];
  const n = g.essais.length, erreurs = n - (g.solved ? 1 : 0), fini = g.finished;
  const nInd = fini ? c.indices.length : Math.min(erreurs, c.indices.length);
  const media = jeu === 'pays' ? { svg: c.media.svg, vb: c.media.vb } : jeu === 'replique' ? { citation: c.media.citation, contexte: c.media.contexte }
    : jeu === 'jv' ? { fx: c.media.fx, fy: c.media.fy } : jeu === 'carte' ? { rarete: c.media.rarete } : {};
  const img = jeu === 'pays' ? (fini || erreurs >= 3 ? c.image : null) : jeu === 'replique' ? null : c.image;
  return {
    jeu, day: today, round: S.noRound ? null : 16, image: S.noRound ? null : img, media,
    indices: c.indices.slice(0, nInd), indices_total: c.indices.length,
    photo_bientot: jeu === 'pays' && !fini && erreurs < 3 && !!c.image,
    essais: g.essais.map((x) => ({ ...x })), erreurs, solved: g.solved, finished: fini,
    score: g.solved ? 7 - n : 0, reward: fini ? (g.solved ? 10 : 3) : null, gain: 10, consolation: 3,
    reponse: fini ? { titre: c.titre, reponse: c.titre, pays: c.pays, details: c.details, image: c.image } : undefined,
    choix: [...c.choix].sort((a, b) => a.localeCompare(b, 'fr')), board: BOARD(), hier: null,
  };
}

/** Un essai : texte choisi dans la liste, ou null pour passer. */
function essai(jeu, texte) {
  const c = CONTENU[jeu], g = J[jeu];
  if (S.noRound) return err('Pas de manche aujourd’hui.');
  if (g.finished) return err('Tu as déjà terminé la partie du jour. Reviens demain !');
  if (texte === null) { g.essais.push({ t: null, ok: false }); }
  else {
    if (!c.choix.includes(texte)) return err('Réponse inconnue : choisis-la dans la liste.');
    if (g.essais.some((x) => x.t === texte)) return err('Tu as déjà proposé cette réponse.');
    const juste = texte === c.titre;
    const x = { t: texte, ok: juste };
    if (!juste && jeu === 'pays') Object.assign(x, geo(VILLE[texte], VILLE[c.cible]));
    if (!juste && jeu === 'plat') Object.assign(x, geo(VILLE[PAYS_PLAT[texte]], VILLE[c.cible]));
    g.essais.push(x);
    if (juste) { g.solved = true; g.finished = true; }
  }
  if (g.essais.length >= 6) g.finished = true;
  return ok(etat(jeu));
}

/* ---------- RPC ---------- */
const JEU_OK = (p) => Object.keys(CONTENU).includes(p);
const HANDLERS = {
  hg_nj_etat: (a) => (JEU_OK(a.p_jeu) ? ok(etat(a.p_jeu)) : err('Jeu inconnu')),
  hg_nj_essai: (a) => (JEU_OK(a.p_jeu) ? essai(a.p_jeu, a.p_texte ?? null) : err('Jeu inconnu')),
};

/** Client : celui du faux de base, avec les RPC des jeux du jour en plus. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (HANDLERS[fn]) { window.__LOG.push(['rpc', fn, a]); return HANDLERS[fn](a); }
    return rpc0(fn, a);
  };
  return c;
}
