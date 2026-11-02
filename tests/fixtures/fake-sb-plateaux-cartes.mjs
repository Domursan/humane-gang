// Faux Supabase des jeux de cartes du moteur des plateaux (migration 143) : Blackjack et Poker, en mémoire.
// Enveloppe le faux de base (fake-sb.mjs) et répond aux RPC hg_plat_* d'une partie : état (hg_plat_etat), action (hg_plat_agir),
// création, rejoindre, messages, contenus. Les règles ne sont PAS rejouées ici : chaque action fait passer l'état à l'étape suivante
// prévue par le scénario (les règles réelles sont testées côté SQL, tests/bancs/plateaux/t_*.sql). Chaque appel est journalisé dans
// window.__LOG (['rpc', fonction, arguments]).
// Scénario (window.__SCN) : jeu ('blackjack' par défaut, ou 'poker') ; fin : true pour une partie terminée.
// Expose window.__CARTES : { etat(), tourDe(uid) } pour faire passer la main dans un test (la page se met à jour à la relecture).
// window.__PATCH (facultatif, posé par le test) retouche l'état renvoyé par hg_plat_etat.
// Exporte createClient().
const S = window.__SCN || {};
const prefix = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${prefix}/tests/fixtures/${S.jeuxBase || 'fake-sb.mjs'}`);

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ALICE = U(2), BRUNO = U(3), CHLOE = U(4);
const POKER = S.jeu === 'poker';
const CODE = POKER ? 'HGPOK-1234' : 'HGBJK-1234';
const ok = (data) => ({ data, error: null });
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

/** Joueur de la partie (forme de hg_plat_etat). */
function joueur(id, pseudo, couleur, place, etat, extra = {}) {
  return { user_id: id, pseudo, couleur, avatar_url: null, invite: false, place, pret: true, parti: false, absent: false,
    elimine: false, etat, gagne: null, rang: null, paillettes: 0, ...extra };
}

/** En-tête de partie (forme de hg_plat_etat.partie). */
function entete(extra = {}) {
  return { id: 'partie-cartes', jeu: POKER ? 'poker' : 'blackjack', nom_jeu: POKER ? 'Poker' : 'Blackjack', code: CODE,
    nom: POKER ? 'Table du vendredi' : 'Table du vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: true,
    nb_places: POKER ? 8 : 7, t_tour: 60, options: POKER ? { jetons: 1000, blinde: 10, montee: 8 } : { manches: 8, jetons: 1000 },
    tour: ME, tour_fin: iso(60), nb_tours: POKER ? 4 : 3, suite: null, raison: null, version: 1, started_at: iso(-600), ended_at: null, ...extra };
}

/* ---------- États de départ ---------- */

/** Blackjack : mises en cours, mon tour de miser. */
function blackjackDepart() {
  return {
    partie: entete(),
    joueurs: [
      joueur(ME, 'Ethan', '#4F6A8F', 1, { jetons: 1000, mise: 0, mains: [], resultat: null }),
      joueur(ALICE, 'Alice', '#D97757', 2, { jetons: 1225, mise: 0, mains: [], resultat: null }),
      joueur(BRUNO, 'Bruno', '#7E93C9', 3, { jetons: 740, mise: 0, mains: [], resultat: null }),
    ],
    journal: [
      { id: 4, user_id: null, type: 'info', texte: 'Manche 3 : faites vos jeux !', prive: false, created_at: iso(-30) },
      { id: 3, user_id: ALICE, type: 'info', texte: 'Alice gagne 25 jetons.', prive: false, created_at: iso(-40) },
      { id: 2, user_id: BRUNO, type: 'info', texte: 'Bruno perd 50 jetons.', prive: false, created_at: iso(-41) },
      { id: 1, user_id: null, type: 'info', texte: 'La banque a 19.', prive: false, created_at: iso(-42) },
    ],
    jeu: { phase: 'mise', actif: ME, main: 0, manche: 3, manches: 8, banque: [], banque_total: null, sabot: 196, totaux: {} },
  };
}

/** Poker : préflop, mon tour (suivre ou relancer), blindes posées, dernier abattage à montrer. */
function pokerDepart() {
  return {
    partie: entete(),
    joueurs: [
      joueur(ME, 'Ethan', '#4F6A8F', 1, { jetons: 1000, mise: 0, engage: 0, couche: false, tapis: false, action: null }),
      joueur(ALICE, 'Alice', '#D97757', 2, { jetons: 1000, mise: 0, engage: 0, couche: true, tapis: false, action: 'couché' }),
      joueur(BRUNO, 'Bruno', '#7E93C9', 3, { jetons: 995, mise: 5, engage: 5, couche: false, tapis: false, action: null }),
      joueur(CHLOE, 'Chloé', '#6FA37F', 4, { jetons: 990, mise: 10, engage: 10, couche: false, tapis: false, action: null }),
    ],
    journal: [
      { id: 2, user_id: null, type: 'info', texte: 'Main 4 · blindes 5 / 10.', prive: false, created_at: iso(-20) },
      { id: 1, user_id: null, type: 'info', texte: 'Chacun reçoit 1000 jetons. Que le meilleur bluffeur gagne !', prive: false, created_at: iso(-600) },
    ],
    jeu: {
      phase: 'preflop', actif: ME, donneur: ALICE, board: [], pot: 15, mise_max: 10, relance_min: 10, blinde: 10, main: 4,
      mes_cartes: ['AH', 'KH'], ma_force: null, abattage: null,
      precedente: {
        board: ['2C', '7D', '9S', 'JH', '3C'],
        abattage: [
          { user_id: BRUNO, cartes: ['QS', 'QD'], main: 'Paire' },
          { user_id: CHLOE, cartes: ['AC', '2S'], main: 'Hauteur' },
        ],
      },
    },
  };
}

const ETAT = POKER ? pokerDepart() : blackjackDepart();
window.__CARTES = {
  etat: () => ETAT,
  /** Fait passer la main à uid (la page le voit à la prochaine relecture). */
  tourDe(uid) {
    ETAT.partie.tour = uid; ETAT.partie.tour_fin = iso(60); ETAT.jeu.actif = uid; ETAT.partie.version += 1;
  },
};

/* ---------- Actions (étape suivante prévue, sans règles) ---------- */

/** Passe à la suite après une action du blackjack. */
function agirBlackjack(p_action, args) {
  const moi = ETAT.joueurs.find((j) => j.user_id === ME);
  const J = ETAT.jeu;
  if (p_action === 'miser') {
    moi.etat.mise = args.montant;
    ETAT.joueurs.filter((j) => j.user_id !== ME).forEach((j) => { j.etat.mise = 50; j.etat.mains = []; });
    moi.etat.mains = [{ cartes: ['TH', '7C'], mise: args.montant, statut: 'joue' }];
    J.phase = 'jeu'; J.actif = ME; J.main = 0; J.banque = ['9H', '??']; J.banque_total = null;
    J.totaux = { [ME]: [17] };
  } else if (p_action === 'tirer') {
    moi.etat.mains[0].cartes.push('AD'); J.totaux = { [ME]: [18] };
  } else if (p_action === 'rester') {
    // Règlement : la banque a 16, Ethan gagne sa mise (100), puis manche suivante.
    moi.etat.jetons += args.montant || 100;
    moi.etat.mains = []; moi.etat.mise = 0; moi.etat.resultat = 100;
    ETAT.journal.unshift(
      { id: 100, user_id: null, type: 'info', texte: 'Manche 4 : faites vos jeux !', prive: false, created_at: iso() },
      { id: 99, user_id: ME, type: 'info', texte: 'Ethan gagne 100 jetons.', prive: false, created_at: iso() },
      { id: 98, user_id: null, type: 'info', texte: 'La banque a 16.', prive: false, created_at: iso() });
    ETAT.partie.nb_tours = 4; J.phase = 'mise'; J.manche = 4; J.banque = []; J.banque_total = null; J.totaux = {};
    ETAT.joueurs.forEach((j) => { j.etat.mise = 0; j.etat.mains = []; });
  }
  ETAT.partie.version += 1;
}

/** Passe à Bruno après une action du poker. */
function agirPoker(p_action, args) {
  const moi = ETAT.joueurs.find((j) => j.user_id === ME);
  const mm = ETAT.jeu.mise_max;
  if (p_action === 'suivre') { moi.etat.mise = mm; moi.etat.engage = mm; moi.etat.action = 'suit'; }
  else if (p_action === 'relancer') { moi.etat.mise = args.montant; moi.etat.engage = args.montant; moi.etat.action = 'relance'; ETAT.jeu.mise_max = args.montant; }
  else if (p_action === 'se_coucher') { moi.etat.couche = true; moi.etat.action = 'couché'; }
  else if (p_action === 'tapis') { moi.etat.tapis = true; moi.etat.action = 'tapis'; }
  ETAT.jeu.pot = ETAT.joueurs.reduce((s, j) => s + (Number(j.etat.engage) || 0), 0);
  ETAT.jeu.actif = BRUNO; ETAT.partie.tour = BRUNO; ETAT.partie.tour_fin = iso(60);
  ETAT.partie.version += 1;
}

/** Forme de hg_plat_etat ; fin : partie terminée (classement et jetons finaux). */
function etatRenvoye() {
  const partie = { ...ETAT.partie };
  if (S.fin) {
    partie.statut = 'terminee'; partie.tour = null; partie.tour_fin = null; partie.ended_at = iso();
    const classes = [...ETAT.joueurs].sort((a, b) => (Number(b.etat.jetons) || 0) - (Number(a.etat.jetons) || 0));
    classes.forEach((j, i) => { j.rang = i + 1; j.gagne = i === 0; });
  }
  return {
    partie, maintenant: iso(), moi: { user_id: ME, joue: true, hote: true, invite: false },
    joueurs: ETAT.joueurs, jeu: S.fin ? null : ETAT.jeu, journal: ETAT.journal, badges: [],
  };
}

const HANDLERS = {
  hg_plat_etat: () => ok((window.__PATCH || ((e) => e))(etatRenvoye())),
  hg_plat_agir: (a) => { (POKER ? agirPoker : agirBlackjack)(a.p_action, a.p_args || {}); return ok({}); },
  hg_plat_creer: () => ok(CODE),
  hg_plat_rejoindre: () => ok(CODE),
  hg_plat_rejouer: () => ok(CODE),
  hg_plat_quitter: () => ok(null),
  hg_plat_avancer: () => ok(null),
  hg_plat_pret: () => ok(null),
  hg_plat_message: () => ok(null),
  hg_plat_messages: () => ok([]),
  hg_plat_contenus: () => ok({}),
  hg_plat_mes_parties: () => ok([]),
  hg_plat_publiques: () => ok([]),
};

/** Client : celui du faux de base, avec les RPC des jeux de cartes en plus (journalisées). */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (HANDLERS[fn]) { window.__LOG.push(['rpc', fn, a]); return HANDLERS[fn](a); }
    return rpc0(fn, a);
  };
  return c;
}
