// Faux Supabase de Catan du gang (migration 144) : état en mémoire, enveloppe le faux de base (fake-sb.mjs).
// Scénario (window.__SCN) : phase : 'placement' (défaut) | 'lancer' | 'voleur' | 'action' ; fin : true pour une partie terminée.
// Les règles ne sont PAS rejouées ici : chaque action fait passer l'état à l'étape suivante prévue par le scénario
// (les règles réelles sont testées côté SQL). Chaque appel de fonction RPC est journalisé dans window.__LOG.
// Expose window.__CATAN : { etat() }. Exporte createClient().
const S = window.__SCN || {};
const prefix = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${prefix}/tests/fixtures/fake-sb.mjs`);

/* Géométrie exacte renvoyée par hg_ct__geo (migration 144). */
const GEO = {"hexes":[{"id":0,"q":0,"r":-2,"x":-1.732,"y":-3,"sommets":[0,1,2,3,4,5]},{"id":1,"q":1,"r":-2,"x":0,"y":-3,"sommets":[6,7,8,9,2,1]},{"id":2,"q":2,"r":-2,"x":1.732,"y":-3,"sommets":[10,11,12,13,8,7]},{"id":3,"q":-1,"r":-1,"x":-2.598,"y":-1.5,"sommets":[4,3,14,15,16,17]},{"id":4,"q":0,"r":-1,"x":-0.866,"y":-1.5,"sommets":[2,9,18,19,14,3]},{"id":5,"q":1,"r":-1,"x":0.866,"y":-1.5,"sommets":[8,13,20,21,18,9]},{"id":6,"q":2,"r":-1,"x":2.598,"y":-1.5,"sommets":[12,22,23,24,20,13]},{"id":7,"q":-2,"r":0,"x":-3.464,"y":0,"sommets":[16,15,25,26,27,28]},{"id":8,"q":-1,"r":0,"x":-1.732,"y":0,"sommets":[14,19,29,30,25,15]},{"id":9,"q":0,"r":0,"x":0,"y":0,"sommets":[18,21,31,32,29,19]},{"id":10,"q":1,"r":0,"x":1.732,"y":0,"sommets":[20,24,33,34,31,21]},{"id":11,"q":2,"r":0,"x":3.464,"y":0,"sommets":[23,35,36,37,33,24]},{"id":12,"q":-2,"r":1,"x":-2.598,"y":1.5,"sommets":[25,30,38,39,40,26]},{"id":13,"q":-1,"r":1,"x":-0.866,"y":1.5,"sommets":[29,32,41,42,38,30]},{"id":14,"q":0,"r":1,"x":0.866,"y":1.5,"sommets":[31,34,43,44,41,32]},{"id":15,"q":1,"r":1,"x":2.598,"y":1.5,"sommets":[33,37,45,46,43,34]},{"id":16,"q":-2,"r":2,"x":-1.732,"y":3,"sommets":[38,42,47,48,49,39]},{"id":17,"q":-1,"r":2,"x":0,"y":3,"sommets":[41,44,50,51,47,42]},{"id":18,"q":0,"r":2,"x":1.732,"y":3,"sommets":[43,46,52,53,50,44]}],"sommets":[{"id":0,"x":-1.732,"y":-4,"hexes":[0],"voisins":[1,5],"aretes":[0,5]},{"id":1,"x":-0.866,"y":-3.5,"hexes":[0,1],"voisins":[0,2,6],"aretes":[0,1,10]},{"id":2,"x":-0.866,"y":-2.5,"hexes":[0,1,4],"voisins":[1,3,9],"aretes":[1,2,9]},{"id":3,"x":-1.732,"y":-2,"hexes":[0,3,4],"voisins":[2,4,14],"aretes":[2,3,16]},{"id":4,"x":-2.598,"y":-2.5,"hexes":[0,3],"voisins":[3,5,17],"aretes":[3,4,20]},{"id":5,"x":-2.598,"y":-3.5,"hexes":[0],"voisins":[0,4],"aretes":[4,5]},{"id":6,"x":0,"y":-4,"hexes":[1],"voisins":[1,7],"aretes":[6,10]},{"id":7,"x":0.866,"y":-3.5,"hexes":[1,2],"voisins":[6,8,10],"aretes":[6,7,15]},{"id":8,"x":0.866,"y":-2.5,"hexes":[1,2,5],"voisins":[7,9,13],"aretes":[7,8,14]},{"id":9,"x":0,"y":-2,"hexes":[1,4,5],"voisins":[2,8,18],"aretes":[8,9,21]},{"id":10,"x":1.732,"y":-4,"hexes":[2],"voisins":[7,11],"aretes":[11,15]},{"id":11,"x":2.598,"y":-3.5,"hexes":[2],"voisins":[10,12],"aretes":[11,12]},{"id":12,"x":2.598,"y":-2.5,"hexes":[2,6],"voisins":[11,13,22],"aretes":[12,13,27]},{"id":13,"x":1.732,"y":-2,"hexes":[2,5,6],"voisins":[8,12,20],"aretes":[13,14,24]},{"id":14,"x":-1.732,"y":-1,"hexes":[3,4,8],"voisins":[3,15,19],"aretes":[16,17,23]},{"id":15,"x":-2.598,"y":-0.5,"hexes":[3,7,8],"voisins":[14,16,25],"aretes":[17,18,31]},{"id":16,"x":-3.464,"y":-1,"hexes":[3,7],"voisins":[15,17,28],"aretes":[18,19,35]},{"id":17,"x":-3.464,"y":-2,"hexes":[3],"voisins":[4,16],"aretes":[19,20]},{"id":18,"x":0,"y":-1,"hexes":[4,5,9],"voisins":[9,19,21],"aretes":[21,22,26]},{"id":19,"x":-0.866,"y":-0.5,"hexes":[4,8,9],"voisins":[14,18,29],"aretes":[22,23,36]},{"id":20,"x":1.732,"y":-1,"hexes":[5,6,10],"voisins":[13,21,24],"aretes":[24,25,30]},{"id":21,"x":0.866,"y":-0.5,"hexes":[5,9,10],"voisins":[18,20,31],"aretes":[25,26,39]},{"id":22,"x":3.464,"y":-2,"hexes":[6],"voisins":[12,23],"aretes":[27,28]},{"id":23,"x":3.464,"y":-1,"hexes":[6,11],"voisins":[22,24,35],"aretes":[28,29,45]},{"id":24,"x":2.598,"y":-0.5,"hexes":[6,10,11],"voisins":[20,23,33],"aretes":[29,30,42]},{"id":25,"x":-2.598,"y":0.5,"hexes":[7,8,12],"voisins":[15,26,30],"aretes":[31,32,38]},{"id":26,"x":-3.464,"y":1,"hexes":[7,12],"voisins":[25,27,40],"aretes":[32,33,52]},{"id":27,"x":-4.33,"y":0.5,"hexes":[7],"voisins":[26,28],"aretes":[33,34]},{"id":28,"x":-4.33,"y":-0.5,"hexes":[7],"voisins":[16,27],"aretes":[34,35]},{"id":29,"x":-0.866,"y":0.5,"hexes":[8,9,13],"voisins":[19,30,32],"aretes":[36,37,41]},{"id":30,"x":-1.732,"y":1,"hexes":[8,12,13],"voisins":[25,29,38],"aretes":[37,38,49]},{"id":31,"x":0.866,"y":0.5,"hexes":[9,10,14],"voisins":[21,32,34],"aretes":[39,40,44]},{"id":32,"x":0,"y":1,"hexes":[9,13,14],"voisins":[29,31,41],"aretes":[40,41,53]},{"id":33,"x":2.598,"y":0.5,"hexes":[10,11,15],"voisins":[24,34,37],"aretes":[42,43,48]},{"id":34,"x":1.732,"y":1,"hexes":[10,14,15],"voisins":[31,33,43],"aretes":[43,44,56]},{"id":35,"x":4.33,"y":-0.5,"hexes":[11],"voisins":[23,36],"aretes":[45,46]},{"id":36,"x":4.33,"y":0.5,"hexes":[11],"voisins":[35,37],"aretes":[46,47]},{"id":37,"x":3.464,"y":1,"hexes":[11,15],"voisins":[33,36,45],"aretes":[47,48,59]},{"id":38,"x":-1.732,"y":2,"hexes":[12,13,16],"voisins":[30,39,42],"aretes":[49,50,55]},{"id":39,"x":-2.598,"y":2.5,"hexes":[12,16],"voisins":[38,40,49],"aretes":[50,51,65]},{"id":40,"x":-3.464,"y":2,"hexes":[12],"voisins":[26,39],"aretes":[51,52]},{"id":41,"x":0,"y":2,"hexes":[13,14,17],"voisins":[32,42,44],"aretes":[53,54,58]},{"id":42,"x":-0.866,"y":2.5,"hexes":[13,16,17],"voisins":[38,41,47],"aretes":[54,55,62]},{"id":43,"x":1.732,"y":2,"hexes":[14,15,18],"voisins":[34,44,46],"aretes":[56,57,61]},{"id":44,"x":0.866,"y":2.5,"hexes":[14,17,18],"voisins":[41,43,50],"aretes":[57,58,66]},{"id":45,"x":3.464,"y":2,"hexes":[15],"voisins":[37,46],"aretes":[59,60]},{"id":46,"x":2.598,"y":2.5,"hexes":[15,18],"voisins":[43,45,52],"aretes":[60,61,69]},{"id":47,"x":-0.866,"y":3.5,"hexes":[16,17],"voisins":[42,48,51],"aretes":[62,63,68]},{"id":48,"x":-1.732,"y":4,"hexes":[16],"voisins":[47,49],"aretes":[63,64]},{"id":49,"x":-2.598,"y":3.5,"hexes":[16],"voisins":[39,48],"aretes":[64,65]},{"id":50,"x":0.866,"y":3.5,"hexes":[17,18],"voisins":[44,51,53],"aretes":[66,67,71]},{"id":51,"x":0,"y":4,"hexes":[17],"voisins":[47,50],"aretes":[67,68]},{"id":52,"x":2.598,"y":3.5,"hexes":[18],"voisins":[46,53],"aretes":[69,70]},{"id":53,"x":1.732,"y":4,"hexes":[18],"voisins":[50,52],"aretes":[70,71]}],"aretes":[{"id":0,"a":0,"b":1},{"id":1,"a":1,"b":2},{"id":2,"a":2,"b":3},{"id":3,"a":3,"b":4},{"id":4,"a":4,"b":5},{"id":5,"a":0,"b":5},{"id":6,"a":6,"b":7},{"id":7,"a":7,"b":8},{"id":8,"a":8,"b":9},{"id":9,"a":2,"b":9},{"id":10,"a":1,"b":6},{"id":11,"a":10,"b":11},{"id":12,"a":11,"b":12},{"id":13,"a":12,"b":13},{"id":14,"a":8,"b":13},{"id":15,"a":7,"b":10},{"id":16,"a":3,"b":14},{"id":17,"a":14,"b":15},{"id":18,"a":15,"b":16},{"id":19,"a":16,"b":17},{"id":20,"a":4,"b":17},{"id":21,"a":9,"b":18},{"id":22,"a":18,"b":19},{"id":23,"a":14,"b":19},{"id":24,"a":13,"b":20},{"id":25,"a":20,"b":21},{"id":26,"a":18,"b":21},{"id":27,"a":12,"b":22},{"id":28,"a":22,"b":23},{"id":29,"a":23,"b":24},{"id":30,"a":20,"b":24},{"id":31,"a":15,"b":25},{"id":32,"a":25,"b":26},{"id":33,"a":26,"b":27},{"id":34,"a":27,"b":28},{"id":35,"a":16,"b":28},{"id":36,"a":19,"b":29},{"id":37,"a":29,"b":30},{"id":38,"a":25,"b":30},{"id":39,"a":21,"b":31},{"id":40,"a":31,"b":32},{"id":41,"a":29,"b":32},{"id":42,"a":24,"b":33},{"id":43,"a":33,"b":34},{"id":44,"a":31,"b":34},{"id":45,"a":23,"b":35},{"id":46,"a":35,"b":36},{"id":47,"a":36,"b":37},{"id":48,"a":33,"b":37},{"id":49,"a":30,"b":38},{"id":50,"a":38,"b":39},{"id":51,"a":39,"b":40},{"id":52,"a":26,"b":40},{"id":53,"a":32,"b":41},{"id":54,"a":41,"b":42},{"id":55,"a":38,"b":42},{"id":56,"a":34,"b":43},{"id":57,"a":43,"b":44},{"id":58,"a":41,"b":44},{"id":59,"a":37,"b":45},{"id":60,"a":45,"b":46},{"id":61,"a":43,"b":46},{"id":62,"a":42,"b":47},{"id":63,"a":47,"b":48},{"id":64,"a":48,"b":49},{"id":65,"a":39,"b":49},{"id":66,"a":44,"b":50},{"id":67,"a":50,"b":51},{"id":68,"a":47,"b":51},{"id":69,"a":46,"b":52},{"id":70,"a":52,"b":53},{"id":71,"a":50,"b":53}]};

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ALICE = U(2), BRUNO = U(3);
const CODE = 'HGCAT-1234';
const ok = (data) => ({ data, error: null });
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

const COUTS = { route: { bois: 1, argile: 1 }, colonie: { bois: 1, argile: 1, ble: 1, mouton: 1 }, ville: { ble: 2, pierre: 3 } };
const RESSOURCES = ['bois', 'argile', 'ble', 'mouton', 'pierre', 'bois', 'ble', 'mouton', 'argile', 'bois', 'pierre', 'ble', 'mouton', 'bois', 'argile', 'pierre', 'ble', 'mouton', 'desert'];
const NUMEROS = [5, 2, 6, 3, 8, 10, 9, 12, 11, 4, 8, 10, 9, 4, 5, 6, 3, 11, null];
const TUILES = RESSOURCES.map((res, i) => ({ res, num: NUMEROS[i] }));
const RESSOURCES_DEPART = { bois: 2, argile: 2, ble: 1, mouton: 1, pierre: 0 };

/** Plateau de départ selon le scénario : rien posé, ou quelques bâtiments de mon joueur et des autres. */
function jeuDepart() {
  const phase = S.phase || 'placement';
  const J = {
    geo: GEO, tuiles: TUILES, voleur: 18, colonies: {}, villes: {}, routes: {}, phase, sous: 'colonie', dernier: null, de: null,
    objectif: 10, mes_ressources: { ...RESSOURCES_DEPART }, couts: COUTS,
  };
  if (phase === 'lancer') { J.colonies = { 8: ME }; J.routes = { 14: ME }; }
  if (phase === 'voleur') { J.colonies = { 8: ME }; J.routes = { 14: ME }; J.de = [3, 4]; }
  if (phase === 'action') { J.colonies = { 8: ME, 20: ALICE, 40: BRUNO }; J.routes = { 14: ME, 30: ALICE }; J.de = [5, 2]; }
  return J;
}

const ETAT = {
  partie: { id: 'partie-catan', jeu: 'catan', nom_jeu: 'Catan du gang', code: CODE, nom: 'Partie du vendredi', statut: 'en_cours',
    hote: ME, visibilite: 'privee', invites: true, nb_places: 4, t_tour: 90, options: { objectif: 10 }, tour: ME, tour_fin: iso(90),
    nb_tours: 2, suite: null, raison: null, version: 1, started_at: iso(-600), ended_at: null },
  joueurs: [
    { user_id: ME, pseudo: 'Ethan', couleur: '#4F6A8F', place: 1 },
    { user_id: ALICE, pseudo: 'Alice', couleur: '#D97757', place: 2 },
    { user_id: BRUNO, pseudo: 'Bruno', couleur: '#7E93C9', place: 3 },
  ],
  jeu: jeuDepart(),
  journal: [
    { id: 2, user_id: null, type: 'info', texte: 'L\'île est prête !', prive: false, created_at: iso(-30) },
    { id: 1, user_id: ALICE, type: 'coup', texte: 'Alice fonde une colonie.', prive: false, created_at: iso(-60) },
  ],
};
window.__CATAN = { etat: () => ETAT };

/** Points et compteurs de chacun, recalculés depuis le plateau (forme de hg_plat_etat). */
function joueursRenvoyes() {
  const J = ETAT.jeu;
  const compter = (table, uid) => Object.values(table).filter((u) => u === uid).length;
  const joueurs = ETAT.joueurs.map((j) => {
    const colonies = compter(J.colonies, j.user_id);
    const villes = compter(J.villes, j.user_id);
    const cartes = j.user_id === ME ? Object.values(J.mes_ressources).reduce((s, n) => s + n, 0) : 3;
    return { ...j, avatar_url: null, invite: false, pret: true, parti: false, absent: false, elimine: false, gagne: null,
      rang: null, paillettes: 0, etat: { points: colonies + 2 * villes, colonies, villes, routes: compter(J.routes, j.user_id), cartes } };
  });
  if (S.fin) {
    ETAT.partie.statut = 'terminee'; ETAT.partie.tour = null; ETAT.partie.tour_fin = null; ETAT.partie.ended_at = iso();
    const classes = [...joueurs].sort((a, b) => b.etat.points - a.etat.points);
    classes.forEach((j, i) => { j.rang = i + 1; j.gagne = i === 0; j.etat.rang = i + 1; });
  }
  return joueurs;
}

/** Forme de hg_plat_etat. */
function etatRenvoye() {
  return {
    partie: { ...ETAT.partie }, maintenant: iso(), moi: { user_id: ME, joue: true, hote: true, invite: false },
    joueurs: joueursRenvoyes(), jeu: S.fin ? null : ETAT.jeu, journal: ETAT.journal, badges: [],
  };
}

/** Passe à l'étape suivante prévue après une action de Catan (sans règles). */
function agirCatan(action, args) {
  const J = ETAT.jeu;
  const r = J.mes_ressources;
  const retire = (cout) => { for (const [k, n] of Object.entries(cout)) r[k] -= n; };
  if (action === 'colonie') {
    J.colonies[args.sommet] = ME;
    if (J.phase === 'placement') { J.sous = 'route'; J.dernier = args.sommet; } else retire(COUTS.colonie);
  } else if (action === 'route') {
    J.routes[args.arete] = ME;
    if (J.phase === 'placement') { J.sous = 'colonie'; J.dernier = null; ETAT.partie.tour = ALICE; } else retire(COUTS.route);
  } else if (action === 'ville') {
    delete J.colonies[args.sommet]; J.villes[args.sommet] = ME; retire(COUTS.ville);
  } else if (action === 'lancer') {
    J.de = [3, 4]; J.phase = 'action';
  } else if (action === 'voleur') {
    J.voleur = args.hexe; J.phase = 'action';
  } else if (action === 'echanger') {
    r[args.donne] -= 4; r[args.recoit] += 1;
  } else if (action === 'finir') {
    J.phase = 'lancer'; ETAT.partie.tour = ALICE;
  }
  ETAT.partie.version += 1;
}

const HANDLERS = {
  hg_plat_etat: () => ok((window.__PATCH || ((e) => e))(etatRenvoye())),
  hg_plat_agir: (a) => { agirCatan(a.p_action, a.p_args || {}); return ok({}); },
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

/** Client : celui du faux de base, avec les RPC de Catan en plus (journalisées). */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (HANDLERS[fn]) { window.__LOG.push(['rpc', fn, a]); return HANDLERS[fn](a); }
    return rpc0(fn, a);
  };
  return c;
}
