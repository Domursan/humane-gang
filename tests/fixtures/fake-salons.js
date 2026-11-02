// Faux serveur des parties à salon (Uno, Codenames, Loup-Garou) pour les contrôles d'écran de partie : script injecté avant la page
// par openPage({ init: 'fake-salons.js' }). Il s'accroche au faux client fake-sb.mjs par window.__FAKE_RPC : chaque RPC du jeu
// reçoit l'état d'une partie EN COURS, avec les mêmes formes que les fonctions SQL (migrations 121 Uno, Codenames, Loup-Garou).
// Scénario (window.__SCN) : salon ('uno' | 'nom-de-code' | 'loup-garou') ; uid (membre connecté, défaut : ME du faux de base).
// Les règles ne sont pas rejouées : l'état est figé, la partie est « à moi de jouer ». Les appels sont journalisés dans window.__LOG.
(() => {
  const S = window.__SCN || {};
  const SALON = S.salon;
  if (!SALON) return;
  const ME = S.uid || '11111111-1111-4111-8111-111111111111';
  const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
  const now = Date.now();
  const iso = (s = 0) => new Date(now + s * 1000).toISOString();
  const ok = (data) => ({ data, error: null });
  const CODE = { uno: 'HGUNO-4242', 'nom-de-code': 'HGNDC-4242', 'loup-garou': 'HGLG-4242' }[SALON];

  /* ---------- Uno (forme de hg_uno_etat, migration 121) ---------- */
  const unoEtat = () => {
    const joueurs = [ME, U(3), U(4), U(5)].map((id, i) => ({
      user_id: id, pseudo: ['Moi', 'Bruno', 'Chloé', 'David'][i], couleur: ['#4F6A8F', '#7E93C9', '#6FA37F', '#D97757'][i],
      avatar_url: null, invite: false, place: i + 1, pret: true, nb_cartes: [5, 7, 4, 6][i], uno: false, exclu: false,
      points: 0, rang: null, gagne: null, paillettes: 0, main_points: null,
    }));
    const main = [['r', '3'], ['r', '7'], ['b', '+2'], ['g', 'inv'], ['k', 'joker'], ['y', '9']].map(([couleur, valeur], i) => ({
      id: 100 + i, couleur, valeur, jouable: ['r', 'k'].includes(couleur) || valeur === '+2',
    }));
    return {
      partie: {
        id: 'partie-uno', code: CODE, nom: 'Uno du vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: false,
        nb_places: 4, t_tour: 60, mode: 'classique', variantes: {}, manche: 2, sens: 1, couleur: 'r', cumul: 0, tour: ME,
        tour_fin: iso(60), pioche: 64, dessus: { id: 77, couleur: 'r', valeur: '7' }, version: 3, uno_attente: null,
        defi: null, a_pioche: false, suite: null, vainqueur: null,
      },
      maintenant: iso(0),
      moi: { user_id: ME, hote: true, invite: false, joue: true },
      joueurs,
      main,
      pioche_carte: null,
      journal: [
        { id: 3, user_id: U(3), type: 'info', texte: 'Bruno pose un 4 bleu.', created_at: iso(-20) },
        { id: 2, user_id: U(4), type: 'info', texte: 'Chloé pioche deux cartes.', created_at: iso(-45) },
        { id: 1, user_id: null, type: 'info', texte: 'Manche 2 : la carte du dessus est un 7 rouge.', created_at: iso(-90) },
      ],
      badges: [],
    };
  };
  const UNO = {
    hg_uno_etat: () => ok(unoEtat()),
    hg_uno_messages: () => ok([]),
    hg_uno_publiques: () => ok([]),
    hg_uno_mes_parties: () => ok([]),
    hg_uno_stats: () => ok({ parties: 0, victoires: 0 }),
    hg_uno_avancer: () => ok(null),
    hg_uno_reprendre: () => ok(null),   // place tenue par le robot (migration 211) : rien à reprendre dans l'état figé
    hg_uno_en_direct: () => ok([]),     // parties à regarder (migration 214)
    hg_spect_arreter: () => ok(null),
    hg_uno_invite: (a) => ok(a.p_action === 'etat' ? unoEtat() : []),   // invité : même état, tous ses appels passent ici
  };

  /* ---------- Codenames (forme de hg_ndc_etat, migration 123) : 5 × 5 cartes, deux équipes jaune et rose ---------- */
  const MOTS = ['Chat', 'Banane', 'Paris', 'Dragon', 'Glace', 'Piano', 'Pyramide', 'Neige', 'Robot', 'Volcan', 'Ticket', 'Lune', 'Clé',
    'Tapis', 'Miroir', 'Pomme', 'Ancre', 'Jungle', 'Bulle', 'Fromage', 'Cœur', 'Onde', 'Radar', 'Nuage', 'Ballon'];
  const COULEUR_CARTE = (i) => ([0, 2, 5, 7, 9, 12, 15, 18, 21].includes(i) ? 'jaune' : [1, 3, 6, 8, 11, 14, 17, 20].includes(i) ? 'rose'
    : i === 23 ? 'assassin' : 'neutre');
  const ndcEtat = () => {
    const joueurs = [
      { user_id: ME, pseudo: 'Moi', couleur: '#4F6A8F', equipe: 'jaune', espion: false },
      { user_id: U(3), pseudo: 'Bruno', couleur: '#7E93C9', equipe: 'jaune', espion: true },
      { user_id: U(4), pseudo: 'Chloé', couleur: '#6FA37F', equipe: 'rose', espion: false },
      { user_id: U(5), pseudo: 'David', couleur: '#D97757', equipe: 'rose', espion: true },
    ].map((j, i) => ({ ...j, avatar_url: null, invite: false, place: i + 1, pret: true, parti: false, trouves: i, gagne: null, paillettes: 0 }));
    const cartes = MOTS.map((mot, pos) => {
      const couleur = COULEUR_CARTE(pos);
      const revelee = pos === 0 || pos === 1;
      return { pos, mot, couleur: revelee ? couleur : null, revelee, revele_par: revelee ? U(4) : null,
        propositions: pos === 3 ? [ME] : [] };
    });
    return {
      partie: {
        id: 'partie-ndc', code: CODE, nom: 'Codenames du vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: false,
        nb_places: 4, t_espion: 90, t_equipe: 120, validation: 'majorite', paquet: 'classique', equipe_debut: 'jaune', tour_equipe: 'jaune',
        phase: 'devine', essais: 1, tour_fin: iso(120), vainqueur: null, raison: null, assassin: null, suite: null, version: 6,
        restants: { jaune: 7, rose: 6 }, totaux: { jaune: 9, rose: 8 },
      },
      maintenant: iso(0),
      moi: { user_id: ME, joue: true, hote: true, invite: false, equipe: 'jaune', espion: false, parti: false },
      joueurs,
      cartes,
      indice: { id: 4, equipe: 'jaune', mot: 'Animal', nombre: 2, trouves: 1, mots: ['Chat'] },
      indices: [{ equipe: 'rose', espion: true, mot: 'Ville', nombre: 1, trouves: 1, mots: ['Paris'] },
        { equipe: 'jaune', espion: true, mot: 'Animal', nombre: 2, trouves: 1, mots: ['Chat'] }],
      journal: [
        { id: 3, user_id: U(3), type: 'indice', texte: 'Bruno donne l\'indice « Animal 2 ».', created_at: iso(-30) },
        { id: 2, user_id: U(4), type: 'revele', texte: 'Chloé révèle « Chat » : rose, hors de l\'équipe.', created_at: iso(-70) },
        { id: 1, user_id: null, type: 'info', texte: 'Les jaunes commencent.', created_at: iso(-200) },
      ],
      badges: [],
    };
  };
  const NDC = {
    hg_ndc_etat: () => ok(ndcEtat()),
    hg_ndc_messages: () => ok([]),
    hg_ndc_publiques: () => ok([]),
    hg_ndc_mes_parties: () => ok([]),
    hg_ndc_stats: () => ok({ parties: 0, victoires: 0 }),
    hg_ndc_avancer: () => ok(null),
  };

  /* ---------- Loup-Garou (forme de hg_lg_etat, migration 119) : nuit de la manche 2, je suis la Voyante ---------- */
  const lgEtat = () => {
    const nom = ['Moi', 'Bruno', 'Chloé', 'David', 'Emma', 'Léa'];
    const roles = ['voyante', 'loup-garou', 'villageois', 'villageois', 'loup-garou', 'villageois'];
    const joueurs = nom.map((pseudo, i) => {
      const mort = i === 3;
      const role = i === 0 ? 'voyante' : roles[i];
      return { user_id: i === 0 ? ME : U(i + 2), pseudo, couleur: ['#4F6A8F', '#7E93C9', '#6FA37F', '#D97757', '#8F5F4F', '#7A4F8F'][i],
        avatar_url: null, invite: false, place: i + 1, pret: true, vu_role: true, vivant: !mort, mort_cause: mort ? 'vote' : null,
        mort_manche: mort ? 1 : null, capitaine: false, peut_voter: !mort, gagne: null, paillettes: 0,
        role: mort ? role : (i === 0 ? role : null), camp: mort || i === 0 ? (role.startsWith('loup') ? 'loups' : 'village') : null, etat_mj: null };
    });
    return {
      partie: { id: 'partie-lg', code: CODE, nom: 'Loups du vendredi', mode: 'classique', visibilite: 'privee', statut: 'en_cours', phase: 'nuit',
        manche: 2, phase_fin: iso(60), pause_reste: null, maintenant: iso(0), nb_joueurs: 6, invites: false, t_nuit: 60, t_jour: 90, t_vote: 45,
        annonce_discord: false, composition: { voyante: 1, 'loup-garou': 2, villageois: 3 }, vainqueur: null, version: 5, hote: ME,
        hote_pseudo: 'Moi', corbeau: null, mvp: null, started_at: iso(-900), ended_at: null, centre: null },
      joueurs,
      moi: { user_id: ME, meneur: false, hote: true, joueur: true, vivant: true, role: 'voyante', role_initial: 'voyante', camp: 'village',
        amoureux: null, envoute: false, allies: [], pouvoir_perdu: false,
        action: { type: 'sonder', fait: null, victime: null, victime_pseudo: null, potions: null, centre: null, dernier_protege: null, meute: null } },
      votes: null,
      journal: [
        { id: 3, manche: 2, phase: 'nuit', type: 'info', texte: 'La nuit tombe sur le village.', prive: false, at: iso(-120) },
        { id: 2, manche: 1, phase: 'vote', type: 'mort', texte: 'David a été éliminé au vote.', prive: false, at: iso(-600) },
        { id: 1, manche: 1, phase: 'nuit', type: 'info', texte: 'Tu as vu le rôle de Chloé : villageoise.', prive: true, at: iso(-700) },
      ],
      restants: [{ role: 'voyante', total: 1, morts: 0 }, { role: 'loup-garou', total: 2, morts: 0 }, { role: 'villageois', total: 3, morts: 1 }],
      actions_mj: null,
      attendus: null,
    };
  };
  const LG = {
    hg_lg_etat: () => ok(lgEtat()),
    hg_lg_messages: () => ok([]),
    hg_lg_publiques: () => ok([]),
    hg_lg_mes_parties: () => ok([]),
    hg_lg_stats: () => ok({ parties: 0, victoires: 0 }),
    hg_lg_avancer: () => ok(null),
  };

  /* ---------- Duels à cases (forme de hg_duel_etat, lue par fake-sb-duels-plateaux.mjs) : Échecs et Dames ---------- */
  const DCODE = { 'duel-echecs': 'HGEC-1001', 'duel-dames': 'HGDA-2002' };
  const DEBUT = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';
  const damier = (pos) => { const g = Array(100).fill('.'); for (const [i, ch] of Object.entries(pos)) g[Number(i)] = ch; return g.join(''); };
  const duelJoueur = (id, pseudo, couleur, place) => ({ user_id: id, pseudo, couleur, avatar_url: null, invite: false, robot: false, place,
    manches: 0, nuls: 0, coups: 0, essais: 0, trouve_en: null, fin: null, pret: true, radar: 0, rang: null, gagne: null, paillettes: 0 });
  const duelEtat = (jeu) => {
    const echecs = jeu === 'duel-echecs';
    const code = DCODE[jeu];
    return {
      partie: { id: 'id-' + code, code, jeu: echecs ? 'echecs' : 'dames', variante: echecs ? 'classique' : 'internationales', nom: echecs ? 'Échecs' : 'Dames',
        statut: 'en_cours', hote: ME, defie: null, defi_expire: null, robot: 0, visibilite: 'privee', invites: 0, commence: 'moi', format: 1,
        t_coup: 60, options: {}, restant: null, manche: 1, phase: null, grille: echecs ? DEBUT : damier({ 34: '2', 43: '1', 61: '1', 9: 'B', 22: 'A' }),
        w: echecs ? 8 : 10, h: echecs ? 8 : 10, n: 0, petites: null, cible: null, tour: ME, tour_fin: iso(60), premier: ME, nb_coups: echecs ? 0 : 9,
        dernier: null, vainqueur: null, version: 1, historique: [], suite: null, forfait: null, abandon: null },
      maintenant: iso(0),
      moi: { user_id: ME, joue: true, spectateur: false, defie: false, hote: true, invite: false, place: 1 },
      joueurs: [duelJoueur(ME, 'Moi', '#4F6A8F', 1), duelJoueur(U(3), 'Alice', '#D97757', 2)],
      defie_pseudo: null, mastermind: null, bataille: null, quiestce: null, pfc: null,
      echecs: echecs ? { blanc: ME, roque: 'KQkq', ep: -1, demi: 0 } : null,
      pions: { [ME]: '1', [U(3)]: '2' }, journal: [],
    };
  };
  if (DCODE[SALON]) {
    window.__DUELS = { possibles: [], etat: duelEtat(SALON), appels: [] };
    if (SALON === 'duel-echecs') { // coups possibles des blancs au début : pions d'une ou deux cases, cavaliers b1 et g1
      const coups = [];
      for (let f = 0; f < 8; f++) coups.push({ de: 48 + f, a: 40 + f, promo: '' }, { de: 48 + f, a: 32 + f, promo: '' });
      coups.push({ de: 57, a: 40, promo: '' }, { de: 57, a: 42, promo: '' }, { de: 62, a: 45, promo: '' }, { de: 62, a: 47, promo: '' });
      window.__DUELS.possibles = coups;
    }
  }

  const HANDLERS = { uno: UNO, 'nom-de-code': NDC, 'loup-garou': LG };
  HANDLERS['duel-echecs'] = {}; HANDLERS['duel-dames'] = {};
  // Pages de jeu déclarées pour les membres (hg_pages, lu par hg_my_pages) : sans cela, le site renvoie vers l'accueil.
  const prevSetup = window.__FAKE_SETUP;
  window.__FAKE_SETUP = (DB, ctx) => {
    if (typeof prevSetup === 'function') prevSetup(DB, ctx);
    for (const slug of ['uno', 'nom-de-code', 'loup-garou', 'duels']) {
      if (!DB.hg_pages.some((x) => x.slug === slug)) DB.hg_pages.push({ slug, label: slug, mode: 'membres', in_nav: false, sort: 99 });
    }
  };
  const prev = window.__FAKE_RPC;
  window.__FAKE_RPC = async (fn, args) => {
    if (typeof prev === 'function') { const r = await prev(fn, args); if (r !== undefined) return r; }
    const h = HANDLERS[SALON]?.[fn];
    if (!h) return undefined;
    window.__LOG?.push(['rpc', fn, args]);
    return h(args);
  };
})();
