// ===== Humane Gang — Duels : table Othello (#partie/CODE, jeu othello) =====
/*
 * Rôle : plateau 8 × 8 dans le cadre commun (vues/commun.js). Les cases jouables viennent du serveur
 *   (hg_duel_possibles, seulement quand c'est mon tour) : elles portent un point. Une case hors de cette liste n'est pas envoyée.
 *   Ordinateur : un clic joue. Téléphone : toucher une case la sélectionne, puis « Jouer en c4 » (ou « Annuler »).
 *   Clavier : flèches pour se déplacer dans le plateau (roving tabindex), Entrée ou Espace pour jouer.
 *   Compte des pions de chacun au-dessus du plateau ; dernier coup surligné ; « X ne peut pas jouer : il passe son tour. »
 *   affiché dans le statut et au journal.
 * Effets (classes et CSS dans ../othello.css ; sons « othello » de commun/sons-jeux.js) : le pion posé arrive avec un petit
 *   rebond (son, sauf pour mon propre coup, déjà joué au clic) ; les pions retournés changent de couleur un par un, du plus
 *   proche du coup au plus éloigné (son par pion) ; le compte pulse ; « à toi de jouer » (mon nom pulse, cases marquées
 *   éclairées) ; sur téléphone, la case choisie s'éclaire et « Jouer en … » pulse ; fin de partie : effetsFin (appelé par
 *   vues/fin.js) : son, gagnant qui brille, bandeau selon le résultat avec le compte des pions (OT1). Mouvement réduit ou
 *   préférence « effets » coupée (motionAllowed) : pas d'animation, les sons restent.
 * Grille : 64 caractères, case 0 = a8 ; '1' = pion de celui qui commence la manche (noirs), '2' = blancs, '.' = vide.
 * Contrat (vues/partie.js) : export function creer(root, ctx) → { maj(etat), message(msg), detruire() }, ctx = { code, naviguer, moi, suivi }.
 * Dépendances : core.js (esc, toast, motionAllowed), ../api.js (duel, erreurTexte), ./commun.js (creerCadre, nomJoueur),
 *   ../../../commun/sons-jeux.js (jouerSonJeu), ./fin-fx.js (fxFin, issueDuel, finEnDirect, sonFin).
 * Exporte : creer, effetsFin.
 */
import { esc, toast, motionAllowed } from '../../../commun/core.js';
import { duel, erreurTexte } from '../api.js';
import { creerCadre, nomJoueur } from './commun.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { fxFin, issueDuel, finEnDirect, sonFin } from './fin-fx.js';

/** Durée pendant laquelle on attend l'état après un envoi réussi (ms), au cas où le temps réel tarde. */
const DUREE_ATTENTE = 5000;
/** Durée de l'animation de retournement avant de l'effacer (ms). */
const DUREE_RETOURNE = 700;
/** Retournement en cascade : délai avant le premier pion retourné, puis entre deux pions (ms). */
const DELAI_CASCADE = 350;
const PAS_CASCADE = 230;
const COTE = 8;
const CASES = COTE * COTE;

/** Vrai sur ordinateur (souris, pointeur fin) : un clic joue directement. */
const ordinateur = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Ajoute une classe d'effet à un élément pendant quelques secondes (sans effet si l'élément n'existe plus). */
function flash(el, classe, ms) {
  if (!el) return;
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}
/** Nom d'une case (0 → a8, 7 → h8, 63 → h1). */
const nomCase = (i) => `${'abcdefgh'[i % COTE]}${COTE - Math.floor(i / COTE)}`;
/** Grille complétée à 64 caractères. */
const normaliser = (g) => String(g || '').padEnd(CASES, '.').slice(0, CASES);
/** Pion en CSS (noir pour '1', blanc pour '2'). */
const pionHtml = (v, { pose = false } = {}) => `<i class="duels-oth-pion ${v === '1' ? 'is-noir' : 'is-blanc'}${pose ? ' is-pose' : ''}" aria-hidden="true"></i>`;

/**
 * Monte la table Othello dans root.
 * @param {HTMLElement} root conteneur de la vue (vidé par le cadre commun).
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj: Function, message: Function, detruire: Function}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-othello' });
  cadre.plateau.innerHTML = `
    <div class="duels-oth-jeu">
      <div class="duels-oth-compte" data-compte></div>
      <div class="duels-oth-plateau" data-grille role="group" aria-label="Plateau Othello, 8 cases sur 8. Flèches pour te déplacer, Entrée pour jouer."></div>
    </div>
    <div class="duels-oth-actions" data-actions></div>`;
  const q = (s) => cadre.plateau.querySelector(s);
  const el = { grille: q('[data-grille]'), compte: q('[data-compte]'), actions: q('[data-actions]') };

  const st = {
    etat: null, grille: null, cases: [], foc: 27, choix: null,
    envoi: false, attente: false, possibles: null, versionPoss: null,
    flip: new Set(), pose: -1, flipTimer: null, regle: false, timers: [], compteHtml: '',
    version: null, monTourAvant: false, coupLocal: null, fxAtoi: false,
  };

  /** Crée les 64 cases une seule fois (le focus clavier survit aux mises à jour). */
  function construire() {
    el.grille.innerHTML = Array.from({ length: CASES }, (_, i) =>
      `<button type="button" class="duels-oth-case" data-i="${i}" tabindex="-1" aria-label="${nomCase(i)}"></button>`).join('');
    st.cases = [...el.grille.children];
    st.cases[st.foc].tabIndex = 0;
  }

  /** Vrai si je peux poser un pion sur cette case maintenant. */
  function peutJouer(i) {
    const e = st.etat;
    if (!e || st.envoi || st.attente || e.partie.statut !== 'en_cours' || !cadre.monTour(e)) return false;
    return !!st.possibles && st.possibles.has(i) && st.grille[i] === '.';
  }

  /** Envoie le coup puis relit l'état. */
  async function jouer(i) {
    if (!peutJouer(i)) return;
    // Son du pion posé pour mon propre coup : joué ici, pas à l'arrivée du coup (un seul son par coup).
    jouerSonJeu('othello', 1);
    st.coupLocal = i;
    st.envoi = true; st.choix = null; peindre();
    try {
      await duel.jouer(ctx.code, i, 'pose');
      st.attente = true;
      st.timers.push(setTimeout(() => { st.attente = false; peindre(); }, DUREE_ATTENTE));
    } catch (err) {
      st.coupLocal = null;
      toast(erreurTexte(err), 'error');
    } finally {
      st.envoi = false;
      ctx.suivi?.rafraichir();
      peindre();
    }
  }

  /** Clic sur une case : joue (ordinateur), sélectionne ou désélectionne (téléphone), ou explique pourquoi c'est refusé. */
  function surCase(i) {
    st.foc = i;
    if (!peutJouer(i)) {
      const e = st.etat;
      if (e && cadre.monTour(e) && st.possibles && st.grille[i] === '.') {
        toast('Coup impossible ici : il faut encadrer au moins un pion adverse.', 'error');
      }
      return;
    }
    if (ordinateur()) { jouer(i); return; }
    st.choix = st.choix === i ? null : i;
    peindre();
    if (st.choix !== null) fxChoix(i);
  }

  /** Téléphone : la case choisie s'éclaire et le bouton « Jouer en … » pulse (le son joue au moment de jouer). */
  function fxChoix(i) {
    if (!motionAllowed()) return;
    flash(st.cases[i], 'is-choix-fx', 3000);
    flash(el.actions.querySelector('[data-valider]'), 'is-joue-fx', 4000);
  }

  /** « À toi de jouer » : mon nom pulse et les cases marquées d'un point s'éclairent, une fois les coups possibles reçus. */
  function lancerAtoi() {
    if (!st.fxAtoi || !st.possibles || !st.etat || !cadre.monTour(st.etat)) return;
    st.fxAtoi = false;
    if (!motionAllowed()) return;
    flash(root.querySelector('.duels-face-j.is-tour'), 'is-a-toi-fx', 5000);
    st.cases.forEach((c) => { if (c.classList.contains('is-possible')) flash(c, 'is-libre-fx', 4000); });
  }

  /**
   * Effets d'un coup qui vient d'arriver (après peindre) : pion posé (son, sauf mon coup déjà joué au clic), puis les pions
   * retournés changent de couleur un par un, du plus proche du coup au plus éloigné (son par pion), puis le compte pulse.
   * Mouvement réduit : pas de cascade, les couleurs sont déjà les nouvelles.
   */
  function fxCoup(dernier, monCoup, retournes) {
    if (!monCoup) jouerSonJeu('othello', 1);
    if (!motionAllowed()) return;
    const ligne = (i) => Math.floor(i / COTE);
    const colonne = (i) => i % COTE;
    const ordre = retournes
      .map((i) => ({ i, d: Math.max(Math.abs(colonne(i) - colonne(dernier)), Math.abs(ligne(i) - ligne(dernier))) }))
      .sort((a, b) => a.d - b.d);
    ordre.forEach(({ i }, k) => {
      const pion = st.cases[i]?.querySelector('.duels-oth-pion');
      if (!pion) return;
      // La couleur d'avant reste affichée jusqu'au moment du retournement.
      pion.classList.toggle('is-noir');
      pion.classList.toggle('is-blanc');
      st.timers.push(setTimeout(() => {
        pion.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(.08)' }, { transform: 'scaleX(1)' }], { duration: 520, easing: 'ease-in-out' });
        jouerSonJeu('othello', 2);
        st.timers.push(setTimeout(() => {
          pion.classList.toggle('is-noir');
          pion.classList.toggle('is-blanc');
        }, 260));
      }, DELAI_CASCADE + k * PAS_CASCADE));
    });
    st.timers.push(setTimeout(() => {
      jouerSonJeu('othello', 3);
      el.compte.querySelectorAll('.duels-oth-chip-n').forEach((n, k) => {
        st.timers.push(setTimeout(() => {
          n.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.5)', color: '#E2C77E' }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
        }, k * 150));
      });
    }, DELAI_CASCADE + ordre.length * PAS_CASCADE));
  }

  /** Demande au serveur les coups jouables, une fois par version du duel, quand c'est mon tour. */
  function chargerPossibles(e) {
    if (e.partie.statut !== 'en_cours' || !cadre.monTour(e)) { st.possibles = null; st.versionPoss = null; return; }
    const v = e.partie.version;
    if (st.versionPoss === v) return;
    st.versionPoss = v;
    st.possibles = null;
    duel.possibles(ctx.code).then((liste) => {
      if (st.versionPoss !== v || !st.etat) return;
      st.possibles = new Set(Array.isArray(liste) ? liste : []);
      peindre();
      statut(st.etat);
      lancerAtoi();
    }).catch((err) => {
      if (st.versionPoss !== v) return;
      st.possibles = new Set();
      toast(erreurTexte(err), 'error');
      peindre();
    });
  }

  /** Déplace le focus clavier sur la case i. */
  function allerA(i) {
    st.foc = i;
    st.cases.forEach((c, j) => { c.tabIndex = j === i ? 0 : -1; });
    st.cases[i].focus();
  }

  /** Dessine les cases, le compte, la sélection et les boutons du bas (sans recréer les cases). */
  function peindre() {
    const e = st.etat;
    if (!e || !st.cases.length) return;
    const p = e.partie;
    const g = st.grille;
    const peut = !!e.moi?.joue && p.statut === 'en_cours' && cadre.monTour(e) && !!st.possibles;
    const dernier = p.dernier && typeof p.dernier.case === 'number' ? p.dernier.case : -1;

    st.cases.forEach((cel, i) => {
      const v = g[i] === '1' || g[i] === '2' ? g[i] : '';
      const possible = peut && st.possibles.has(i) && !v;
      if (cel.dataset.v !== v) {
        cel.dataset.v = v;
        cel.innerHTML = v ? pionHtml(v, { pose: i === st.pose }) : '';
      }
      const libelle = `${nomCase(i)}, ${v ? (v === '1' ? 'pion noir' : 'pion blanc') : (possible ? 'vide, coup possible' : 'vide')}`;
      if (cel.getAttribute('aria-label') !== libelle) cel.setAttribute('aria-label', libelle);
      cel.classList.toggle('is-possible', possible);
      cel.classList.toggle('is-choix', st.choix === i);
      cel.classList.toggle('is-dernier', i === dernier);
      cel.classList.toggle('is-retourne', st.flip.has(i));
      if (!ordinateur()) cel.setAttribute('aria-pressed', String(st.choix === i));
      else cel.removeAttribute('aria-pressed');
      cel.tabIndex = i === st.foc ? 0 : -1;
    });

    // Compte des pions : noirs d'abord (celui qui commence la manche).
    const pions = e.pions || {};
    const joueurs = e.joueurs || [];
    const compte = (c) => [...g].filter((x) => x === c).length;
    const chip = (c, nom) => {
      const j = joueurs.find((x) => String(pions[x.user_id]) === c);
      return `<p class="duels-oth-chip"><span class="duels-oth-pastille ${c === '1' ? 'is-noir' : 'is-blanc'}" aria-hidden="true"></span>
        <span class="duels-oth-chip-nom">${j ? nomJoueur(j) : esc(nom)}</span>
        <strong class="duels-oth-chip-n" aria-label="${compte(c)} pions ${esc(nom)}">${compte(c)}</strong></p>`;
    };
    const html = `${chip('1', 'noirs')}${chip('2', 'blancs')}`;
    if (html !== st.compteHtml) { st.compteHtml = html; el.compte.innerHTML = html; }

    // Boutons du téléphone : jouer la case sélectionnée, ou annuler la sélection.
    let actions = '';
    if (peut && !ordinateur() && st.choix !== null) {
      const ok = peutJouer(st.choix);
      actions = `<button type="button" class="btn btn-primary duels-oth-valider" data-valider${ok ? '' : ' disabled'}>Jouer en ${nomCase(st.choix)}</button>
        <button type="button" class="btn btn-ghost" data-annuler>Annuler</button>`;
    }
    if (actions !== el.actions.dataset.k) {
      el.actions.dataset.k = actions;
      el.actions.innerHTML = actions;
    }
  }

  /** Statut sous la barre : à moi, au tour de l'autre, le robot, ou le passage de tour. */
  function statut(e) {
    if (!e.moi?.joue) return;
    if (e.partie.statut !== 'en_cours') { cadre.statut(''); return; }
    const dernierJournal = (e.journal || [])[0]?.texte || '';
    const passe = /passe son tour/.test(dernierJournal) ? `${dernierJournal} ` : '';
    if (cadre.monTour(e)) {
      if (!st.possibles) { cadre.statut(`${passe}À toi de jouer…`); return; }
      const sans = st.possibles.size === 0 ? ' Aucun coup possible : fin de la manche.' : '';
      cadre.statut(`${passe}À toi de jouer.${sans} ${ordinateur() ? 'Clique sur une case marquée d’un point.' : 'Touche une case marquée d’un point, puis « Jouer en… ».'}`);
      return;
    }
    const adv = cadre.adversaire(e);
    cadre.statut(`${passe}${adv?.robot ? 'Le robot réfléchit…' : `Au tour de ${adv?.pseudo || 'ton adversaire'}`}`);
  }

  // Clics délégués : cases, valider, annuler.
  el.grille.addEventListener('click', (ev) => {
    const cel = ev.target.closest('.duels-oth-case');
    if (cel) surCase(Number(cel.dataset.i));
  });
  el.grille.addEventListener('focusin', (ev) => {
    const cel = ev.target.closest('.duels-oth-case');
    if (cel && Number(cel.dataset.i) !== st.foc) {
      st.foc = Number(cel.dataset.i);
      st.cases.forEach((c, j) => { c.tabIndex = j === st.foc ? 0 : -1; });
    }
  });
  // Clavier : flèches et Début / Fin de ligne.
  el.grille.addEventListener('keydown', (ev) => {
    const i = st.foc;
    const deplacer = {
      ArrowLeft: i % COTE ? i - 1 : null,
      ArrowRight: i % COTE < COTE - 1 ? i + 1 : null,
      ArrowUp: i >= COTE ? i - COTE : null,
      ArrowDown: i < CASES - COTE ? i + COTE : null,
      Home: i - (i % COTE),
      End: i - (i % COTE) + COTE - 1,
    };
    if (!(ev.key in deplacer)) return;
    ev.preventDefault();
    if (deplacer[ev.key] !== null) allerA(deplacer[ev.key]);
  });
  el.actions.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-valider]')) { if (st.choix !== null) jouer(st.choix); return; }
    if (ev.target.closest('[data-annuler]')) { st.choix = null; peindre(); }
  });
  // Échap annule la case choisie (téléphone), comme le bouton « Annuler » ; le focus revient sur la case du plateau.
  cadre.plateau.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape' || st.choix === null) return;
    ev.preventDefault();
    st.choix = null;
    peindre();
    st.cases[st.foc]?.focus();
  });

  return {
    /** Met à jour la table avec l'état du duel (cadre commun, plateau, compte, statut). */
    maj(e) {
      if (!st.cases.length) construire();
      st.etat = e;
      st.attente = false;
      cadre.maj(e);

      if (!st.regle) {
        st.regle = true;
        cadre.cote.innerHTML = `<h2 class="duels-h3">Règles</h2>
          <p class="duels-oth-regle">Chacun pose un pion à son tour. Pour poser, il faut encadrer au moins un pion adverse : les pions encadrés deviennent les tiens.</p>
          <p class="duels-oth-regle">Si tu ne peux pas jouer, tu passes ton tour. La manche finit quand plus personne ne peut jouer : le plus de pions gagne.</p>`;
      }

      // Nouveau coup : la version a changé et la grille aussi (un passage de tour seul ne joue ni pion ni son).
      const nouveau = st.version !== null && e.partie.version !== st.version;
      // Pions qui changent de couleur pendant ce coup : marqués (classe) et retournés en cascade après le rendu.
      const nouvelle = normaliser(e.partie.grille);
      const coup = nouveau && st.grille !== null && st.grille !== nouvelle;
      const retournes = [];
      if (st.grille) {
        for (let i = 0; i < CASES; i++) {
          if (st.grille[i] !== '.' && nouvelle[i] !== '.' && st.grille[i] !== nouvelle[i]) retournes.push(i);
        }
      }
      st.flip = new Set(retournes);
      if (st.flip.size) {
        clearTimeout(st.flipTimer);
        st.flipTimer = setTimeout(() => { st.flip = new Set(); peindre(); }, DUREE_RETOURNE);
        st.timers.push(st.flipTimer);
      }
      st.grille = nouvelle;
      const dernier = e.partie.dernier && typeof e.partie.dernier.case === 'number' ? e.partie.dernier.case : -1;
      // Pion qui arrive : seulement pour un coup nouveau (pas à l'ouverture).
      st.pose = coup ? dernier : -1;
      const monCoup = coup && st.coupLocal === dernier;
      if (nouveau) st.coupLocal = null;
      // Mon tour vient de commencer (passage de « pas mon tour » à « mon tour » sur un nouveau coup).
      const debutTour = nouveau && cadre.monTour(e) && !st.monTourAvant;
      st.monTourAvant = cadre.monTour(e);
      st.version = e.partie.version;
      if (debutTour) st.fxAtoi = true;

      if (!cadre.monTour(e)) st.choix = null;
      chargerPossibles(e);
      peindre();
      if (coup) fxCoup(dernier, monCoup, retournes);
      statut(e);
      lancerAtoi();
    },
    message(m) { cadre.message(m); },
    detruire() {
      st.timers.forEach((t) => clearTimeout(t));
      clearTimeout(st.flipTimer);
      cadre.detruire();
    },
  };
}

/**
 * Effets de fin de partie, appelés par vues/fin.js une fois l'écran de fin dessiné. Seulement si cette partie a été vue
 * en cours dans cette page. Même son pour tous, gagnant qui brille, bandeau selon le résultat avec le compte des pions (OT1),
 * neutre pour un spectateur (sauf mouvement réduit).
 * @param {HTMLElement} root écran de fin.
 * @param {object} e état terminé du duel.
 */
export function effetsFin(root, e) {
  const p = e.partie || {};
  if (!finEnDirect(p)) return;
  sonFin('othello', 4);
  if (!motionAllowed()) return;
  fxFin.classe(root.querySelector('.duels-fin-joueur.is-gagnant'), 'duels-oth-fin-fx', 4800);
  const h = p.historique || [];
  const g = normaliser(h[h.length - 1]?.grille || p.grille);
  const mien = String(e.pions?.[e.moi?.user_id]);
  const moi = [...g].filter((c) => c === mien).length;
  const lui = [...g].filter((c) => c === (mien === '1' ? '2' : '1')).length;
  const compte = `${moi} pion${moi > 1 ? 's' : ''} contre ${lui}`;
  const [titre, sous, ton] = {
    gagnant: ['Partie gagnée !', compte, ''],
    perdant: ['Partie perdue', compte, 'd'],
    nulle: ['Partie nulle', `${moi} pion${moi > 1 ? 's' : ''} partout`, 'n'],
  }[issueDuel(e)] || ['Partie terminée', 'Le plus de pions gagne', 'n'];
  fxFin.plus(() => fxFin.bandeau(titre, sous, { ton }), 300);
}
