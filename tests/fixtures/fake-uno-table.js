// Faux serveur du Uno pour le parcours des effets de table (parcours-uno-effets.cjs) : script injecté avant la page par
// openPage({ init: 'fake-uno-table.js' }), accroché au faux client fake-sb.mjs par window.__FAKE_RPC.
// Mêmes formes que hg_uno_etat (migrations 121 et 171). Les règles ne sont PAS rejouées (elles sont testées côté SQL,
// tests/bancs/uno) : une action écrit juste l'état et les lignes de journal que le serveur écrirait.
// Scénario (window.__SCN) : main ([['r','7'], …], défaut : six cartes) ; fin : true pour une partie déjà terminée (je gagne).
// Expose window.__UNO : etat(), relire(), modifier(fn), ligne(uid, type, texte, age), BRUNO, CHLOE, ME, refus, latence,
// muet ('refuse' : hg_uno_jouer ne répond jamais ; 'accepte' : la pose est prise, mais la réponse se perd).
// window.__SONS compte les sons créés (oscillateurs et bruits).
(() => {
  const S = window.__SCN || {};
  const ME = '11111111-1111-4111-8111-111111111111';
  const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
  const BRUNO = U(3); const CHLOE = U(4); const DAVID = U(5);
  const CODE = 'HGUNO-4242';
  const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();
  const ok = (data) => ({ data, error: null });
  const ko = (message) => ({ data: null, error: { message } });

  // Compte les sons : le test vérifie qu'ils restent en mouvement réduit.
  window.__SONS = 0;
  const AC = window.AudioContext;
  if (AC) {
    for (const m of ['createOscillator', 'createBufferSource']) {
      const f = AC.prototype[m];
      AC.prototype[m] = function compte(...a) { window.__SONS += 1; return f.apply(this, a); };
    }
  }

  const noms = { [ME]: 'Moi', [BRUNO]: 'Bruno', [CHLOE]: 'Chloé', [DAVID]: 'David' };
  let idLigne = 10;
  let idCarte = 500;
  const main = (S.main || [['r', '3'], ['r', '7'], ['b', '+2'], ['g', 'inv'], ['k', 'joker'], ['y', '9']])
    .map(([couleur, valeur], i) => ({ id: 100 + i, couleur, valeur, jouable: ['r', 'k'].includes(couleur) }));
  const E = {
    partie: {
      id: 'partie-uno', code: CODE, nom: 'Uno du vendredi', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: false,
      nb_places: 4, t_tour: 60, mode: 'manche', variantes: {}, manche: 1, sens: 1, couleur: 'r', cumul: 0, tour: ME,
      tour_fin: iso(60), pioche: 64, dessus: { id: 77, couleur: 'r', valeur: '9' }, version: 3, uno_attente: null, uno_depuis: null,
      defi: null, a_pioche: false, suite: null, vainqueur: null,
    },
    maintenant: iso(0),
    moi: { user_id: ME, hote: true, invite: false, joue: true },
    joueurs: [ME, BRUNO, CHLOE, DAVID].map((id, i) => ({
      user_id: id, pseudo: noms[id], couleur: ['#4F6A8F', '#7E93C9', '#6FA37F', '#D97757'][i], avatar_url: null, invite: false,
      place: i + 1, pret: true, nb_cartes: i ? [0, 7, 4, 6][i] : main.length, uno: false, exclu: false, points: 0, rang: null, gagne: null,
      paillettes: 0, main_points: 0,
    })),
    main,
    pioche_carte: null,
    journal: [{ id: 1, user_id: BRUNO, type: 'jouer', texte: 'Bruno pose Rouge 9.', created_at: iso(-20) }],
    badges: [],
  };

  const joueur = (id) => E.joueurs.find((j) => j.user_id === id);
  /** Ajoute une ligne au journal ; age en secondes (ligne déjà ancienne : reprise après une veille). */
  const ligne = (uid, type, texte, age = 0) => {
    idLigne += 1;
    E.journal.unshift({ id: idLigne, user_id: uid, type, texte, created_at: iso(-age) });
    E.journal.length = Math.min(E.journal.length, 15);
  };
  const avance = () => { E.partie.version += 1; };

  /** Fin de manche : je gagne si ma main est vide. */
  function finir(gagnant) {
    const p = E.partie;
    ligne(gagnant, 'manche', `${noms[gagnant]} vide sa main et marque 40 points.`);
    p.statut = 'terminee'; p.tour = null; p.tour_fin = null; p.vainqueur = gagnant;
    [gagnant, ...E.joueurs.map((j) => j.user_id).filter((id) => id !== gagnant)].forEach((id, i) => {
      const j = joueur(id); j.rang = i + 1; j.gagne = i === 0; j.main_points = i * 10;
    });
    joueur(ME).paillettes = gagnant === ME ? 210 : 50;
  }

  if (S.fin) { E.main.length = 0; joueur(ME).nb_cartes = 0; finir(ME); }

  async function rpc(fn, a) {
    const p = E.partie;
    if (window.__UNO.latence) await new Promise((fin) => { setTimeout(fin, window.__UNO.latence); });
    switch (fn) {
      case 'hg_uno_etat': return ok({ ...JSON.parse(JSON.stringify(E)), maintenant: iso() });
      case 'hg_uno_messages': return ok([]);
      case 'hg_uno_avancer': return ok(null);
      case 'hg_uno_jouer': {
        if (window.__UNO.refus) return ko('Cette carte ne peut pas être posée.');
        if (window.__UNO.muet === 'refuse') return new Promise(() => {});
        const i = E.main.findIndex((c) => c.id === a.p_carte);
        const [c] = E.main.splice(i, 1);
        joueur(ME).nb_cartes = E.main.length;
        p.dessus = { id: c.id, couleur: c.couleur, valeur: c.valeur };
        p.couleur = c.couleur === 'k' ? a.p_couleur : c.couleur;
        ligne(ME, 'jouer', `Moi pose ${c.couleur} ${c.valeur}.`);
        if (E.main.length === 0) finir(ME); else { p.tour = BRUNO; p.tour_fin = iso(60); }
        avance();
        if (window.__UNO.muet === 'accepte') return new Promise(() => {});
        return ok(null);
      }
      case 'hg_uno_piocher': {
        idCarte += 1;
        E.main.push({ id: idCarte, couleur: 'g', valeur: '2', jouable: false });
        joueur(ME).nb_cartes = E.main.length;
        p.pioche -= 1;
        ligne(ME, 'pioche', 'Moi pioche une carte.');
        p.tour = BRUNO;
        avance();
        return ok(null);
      }
      case 'hg_uno_uno': {
        joueur(ME).uno = true;
        ligne(ME, 'uno', 'Moi crie UNO !');
        avance();
        return ok(null);
      }
      default: return undefined;
    }
  }

  window.__UNO = {
    etat: () => E, ME, BRUNO, CHLOE, DAVID, refus: false, latence: 0, muet: null, ligne, avance,
    /** Fait relire l'état à la page (comme un signal temps réel). */
    relire: () => document.dispatchEvent(new Event('visibilitychange')),
    /** Change l'état à la main puis l'annonce (nouvelle version). */
    modifier(fn) { fn(E); avance(); this.relire(); },
    /** Un adversaire pose une carte : ligne de journal, défausse, compteur. */
    adversaire(uid, couleur, valeur, age = 0) {
      idCarte += 1;
      E.partie.dessus = { id: idCarte, couleur, valeur };
      E.partie.couleur = couleur;
      joueur(uid).nb_cartes -= 1;
      ligne(uid, 'jouer', `${noms[uid]} pose ${couleur} ${valeur}.`, age);
    },
    /** Un joueur reçoit n cartes (en plus de la ligne du journal). */
    recoit(uid, n) {
      const j = joueur(uid);
      j.nb_cartes += n;
      E.partie.pioche -= n;
      if (uid !== ME) return;
      for (let i = 0; i < n; i++) { idCarte += 1; E.main.push({ id: idCarte, couleur: 'y', valeur: '4', jouable: false }); }
    },
    finir,
  };

  const prev = window.__FAKE_RPC;
  window.__FAKE_RPC = async (fn, args) => {
    if (/^hg_uno_/.test(fn)) { const r = await rpc(fn, args); if (r !== undefined) return r; }
    return prev ? prev(fn, args) : undefined;
  };
})();
