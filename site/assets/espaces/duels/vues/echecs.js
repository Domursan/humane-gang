// ===== Humane Gang — Duels : table des Échecs (#partie/CODE, jeu echecs) =====
/*
 * Rôle : dessine l'échiquier 8 × 8 dans le cadre commun (vues/commun.js) et envoie les coups (duel.jouer).
 *   Blancs = echecs.blanc (celui qui commence la manche). Je joue les noirs si je ne suis pas echecs.blanc : le plateau
 *   est alors retourné. Les pièces sont les symboles pleins (♚ ♛ ♜ ♝ ♞ ♟) : blancs clairs avec contour sombre, noirs
 *   sombres avec liseré clair, pour rester lisibles sur les deux couleurs de cases (les symboles creux, eux, se perdent).
 * Coups : cliquer une pièce (ou la glisser à la souris), puis la case d'arrivée. Les arrivées possibles viennent de
 *   hg_duel_possibles, seulement pendant mon tour. Promotion : petite fenêtre (Dame, Tour, Fou, Cavalier).
 * Clavier : flèches pour se déplacer d'une case, Entrée ou Espace pour choisir (bouton natif), Échap pour annuler.
 * Dernier coup surligné ; roi en échec en rouge ; « Échec ! » annoncé (aria-live) ; pièces prises de chaque côté.
 * Coordonnées a-h et 1-8 sur les bords. Les cases sont des boutons : une seule case est dans l'ordre de tabulation.
 * Effets (maquette validée) : à mon tour, mon nom pulse et les pièces qui peuvent prendre s'éclairent ; un nouveau coup fait
 *   glisser la pièce de sa case de départ à son arrivée, la pièce prise disparaît, la ligne « Pris par… » pulse, et un échec
 *   fait clignoter le roi et afficher le bandeau « Échec ! » (sons « Pièce posée », « Pièce prise », « Échec »). Une pièce
 *   choisie s'éclaire, avec « Annuler la sélection ». Déclenché par la comparaison avec l'état précédent (même partie,
 *   nb_coups qui augmente) ; le premier état n'anime rien. Pas d'animation si le mouvement est réduit ou si les duels sont
 *   en mode calme. Le son « à toi de jouer » reste celui de commun/tour-signal.js. Le « Échec et mat » et la « Nulle » de fin
 *   de partie sont affichés par vues/fin.js, hors de ce fichier (la table ne voit plus l'état terminé).
 *   Défaite au mat (EC1, effetsFin) : mon roi tombe sur la petite grille, gong grave, bandeau sobre. Abandon et forfait (EC2) ne
 *   passent pas ici : vues/fin.js joue effetsCause de ./fin-fx.js, sans fanfare ni « Échec et mat ».
 * Dépendances : core.js (toast, motionAllowed), sons-jeux.js (jouerSonJeu), ../api.js (duel, erreurTexte), ../plateau-commun.js (chargerCss), ./commun.js (creerCadre, nomJoueur),
 *   ../../../commun/effets-duels.js (anime), ./fin-fx.js (vuEnCours, effetsFinDuel, fxFin).
 * Exporte : creer, effetsFin (fin de duel, via ./fin-fx.js).
 */
import { toast, motionAllowed } from '../../../commun/core.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { anime } from '../../../commun/effets-duels.js';
import { vuEnCours, effetsFinDuel, fxFin } from './fin-fx.js';
import { duel, erreurTexte } from '../api.js';
import { chargerCss } from '../plateau-commun.js';
import { creerCadre, nomJoueur } from './commun.js';

chargerCss('echecs');

const FICHIERS = 'abcdefgh';
/** Symbole plein de chaque pièce (lettre minuscule). U+FE0E demande l'affichage en texte, pas en emoji. */
const SYMBOLE = { k: '♚︎', q: '♛︎', r: '♜︎', b: '♝︎', n: '♞︎', p: '♟︎' };
/** Nom de chaque pièce et accord (féminin : dame, tour). */
const PIECE = { k: ['roi', false], q: ['dame', true], r: ['tour', true], b: ['fou', false], n: ['cavalier', false], p: ['pion', false] };
/** Pièces de promotion proposées, dans l'ordre d'affichage. */
const PROMO = [['q', 'Dame'], ['r', 'Tour'], ['b', 'Fou'], ['n', 'Cavalier']];
/** Nombre de pièces de chaque type au départ, par camp. */
const DEPART = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
/** Durée pendant laquelle on attend l'état après un envoi réussi, au cas où le temps réel tarde (ms). */
const ATTENTE_MS = 5000;
const DIRS_CAVALIER = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIRS_ROI = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIRS_TOUR = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIRS_FOU = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Vrai pour une pièce blanche (majuscule). */
const estBlanc = (ch) => ch !== '.' && ch === ch.toUpperCase();
/** Nom d'une case, a8 = 0 ... h1 = 63. */
const nomCase = (i) => `${FICHIERS[i % 8]}${8 - Math.floor(i / 8)}`;
/** Grille de 64 caractères, complétée par des cases vides. */
const grilleDe = (e) => String(e?.partie?.grille || '').padEnd(64, '.').slice(0, 64);
/** Camp joué par le membre connecté : 'blanc', 'noir', ou null (spectateur). */
const campDe = (e) => (e?.moi?.joue ? (e.echecs?.blanc === e.moi.user_id ? 'blanc' : 'noir') : null);

/**
 * La case i est-elle attaquée par les blancs (parBlancs = true) ou par les noirs ?
 * Sert à repérer le roi en échec ; le serveur valide ensuite chaque coup.
 */
function attaquee(g, i, parBlancs) {
  const r = Math.floor(i / 8), c = i % 8;
  const at = (rr, cc) => (rr < 0 || rr > 7 || cc < 0 || cc > 7 ? '.' : g[rr * 8 + cc]);
  // Un pion blanc attaque vers le haut : l'attaquant est sur la ligne suivante (r + 1). Un pion noir : ligne r - 1.
  const dr = parBlancs ? 1 : -1;
  for (const dc of [-1, 1]) if (at(r + dr, c + dc) === (parBlancs ? 'P' : 'p')) return true;
  for (const [a, b] of DIRS_CAVALIER) if (at(r + a, c + b) === (parBlancs ? 'N' : 'n')) return true;
  for (const [a, b] of DIRS_ROI) if (at(r + a, c + b) === (parBlancs ? 'K' : 'k')) return true;
  const glisse = (dirs, lettres) => dirs.some(([a, b]) => {
    let rr = r + a, cc = c + b;
    while (rr >= 0 && rr <= 7 && cc >= 0 && cc <= 7) {
      const ch = g[rr * 8 + cc];
      if (ch !== '.') return lettres.includes(ch);
      rr += a; cc += b;
    }
    return false;
  });
  const [tour, fou, dame] = parBlancs ? ['R', 'B', 'Q'] : ['r', 'b', 'q'];
  return glisse(DIRS_TOUR, [tour, dame]) || glisse(DIRS_FOU, [fou, dame]);
}

/** Index du roi du camp au trait s'il est en échec, sinon -1. */
function roiEnEchec(e) {
  const p = e.partie;
  if (p.statut !== 'en_cours') return -1;
  const g = grilleDe(e);
  const blancTrait = e.echecs?.blanc === p.tour;
  const i = g.indexOf(blancTrait ? 'K' : 'k');
  return i >= 0 && attaquee(g, i, !blancTrait) ? i : -1;
}

/** Pièces prises : celles de l'adversaire qui manquent sur l'échiquier (lettres minuscules). */
function pris(g) {
  const compte = { blanc: {}, noir: {} };
  for (const ch of g) {
    if (ch === '.') continue;
    const camp = estBlanc(ch) ? 'blanc' : 'noir';
    compte[camp][ch.toLowerCase()] = (compte[camp][ch.toLowerCase()] || 0) + 1;
  }
  // Une promotion peut faire disparaître un pion sans qu'une pièce soit prise : le total est alors borné à 0.
  const manquantes = (camp) => Object.entries(DEPART).flatMap(([t, n]) => Array(Math.max(0, n - (compte[camp][t] || 0))).fill(t));
  return { parBlancs: manquantes('noir'), parNoirs: manquantes('blanc') };
}

/** Dernier coup : { de, a } (cases de départ et d'arrivée), ou null. dernier.case = de * 64 + a. */
function derniere(e) {
  const d = e.partie?.dernier;
  if (!d || d.case == null || !(e.partie.nb_coups > 0)) return null;
  const c = Number(d.case);
  return Number.isInteger(c) ? { de: Math.floor(c / 64), a: c % 64 } : null;
}

/** Libellé lu par les lecteurs d'écran pour une case. */
function libelle(i, ch, cible, prise, echec) {
  const nom = nomCase(i);
  let t;
  if (ch === '.') t = `${nom}, case vide`;
  else {
    const [piece, feminin] = PIECE[ch.toLowerCase()];
    const couleur = estBlanc(ch) ? (feminin ? 'blanche' : 'blanc') : (feminin ? 'noire' : 'noir');
    t = `${nom}, ${piece} ${couleur}`;
  }
  if (echec) t += ', en échec';
  if (cible) t += prise ? ', case de prise possible' : ', case d’arrivée possible';
  return t;
}

/** Une liste « Pris par… » : libellé et symboles colorés (les pièces prises gardent leur couleur). */
function listePris(libelleTxt, types, couleur) {
  const s = document.createElement('span');
  s.className = 'duels-echecs-pris-groupe';
  const t = document.createElement('span');
  t.textContent = `${libelleTxt} `;
  const v = document.createElement('span');
  v.className = `duels-echecs-pris-symboles is-${couleur}`;
  v.textContent = types.map((x) => SYMBOLE[x]).join('') || '—';
  s.append(t, v);
  return s;
}

/** Pièce d'effet (pièce prise qui s'efface) : hors du rendu, paint() ne la reprend pas ni ne la retire. */
function fantome(ch) {
  const f = document.createElement('span');
  f.className = 'zz-fantome';
  f.setAttribute('aria-hidden', 'true');
  const s = document.createElement('span');
  s.className = `zz-fantome-piece is-${estBlanc(ch) ? 'blanc' : 'noir'}`;
  s.textContent = SYMBOLE[ch.toLowerCase()];
  f.append(s);
  return f;
}

/** Bandeau bref au centre de l'écran (« Échec ! »), sans interaction. */
function bandeau(titre, sous) {
  const b = document.createElement('div');
  b.className = 'zz-ban';
  b.textContent = titre;
  const s = document.createElement('small');
  s.textContent = sous;
  b.append(s);
  document.body.append(b);
  setTimeout(() => b.remove(), 2300);
}

/** Ajoute une classe d'effet un instant, puis la retire. */
function passager(el, classe, ms) {
  if (!el) return;
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}

/**
 * Monte la table des Échecs dans root.
 * @param {HTMLElement} root conteneur de la vue (vidé par le cadre commun).
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj: Function, message: Function, detruire: Function}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-echecs' });
  cadre.plateau.innerHTML = `
    <div class="duels-echecs-jeu">
      <p class="duels-echecs-pris" data-pris></p>
      <div class="duels-echecs-zone">
        <div class="duels-echecs-plateau" data-echiquier role="group" aria-label="Échiquier : flèches pour te déplacer, Entrée pour choisir une case"></div>
        <div class="duels-echecs-promo" data-fenetre-promo role="dialog" aria-label="Choisir la pièce de promotion" hidden></div>
      </div>
      <p class="duels-echecs-annonce" data-annonce aria-live="assertive"></p>
      <p class="duels-echecs-legende" data-legende></p>
      <div class="duels-echecs-actions" data-actions></div>
    </div>`;
  const q = (s) => cadre.plateau.querySelector(s);
  const el = {
    pris: q('[data-pris]'), echiquier: q('[data-echiquier]'), promo: q('[data-fenetre-promo]'),
    annonce: q('[data-annonce]'), legende: q('[data-legende]'), actions: q('[data-actions]'),
  };

  const st = {
    etat: null, flip: null, cases: new Array(64).fill(null), curseur: 52,
    sel: null, coups: null, cle: null,
    attente: false, timer: null, promo: null, glisse: null, glisseFait: false,
    annonce: '', actionsHtml: '', regle: false, vivant: true, aTo: false,
  };

  /** Coups jouables depuis une case (vide si ce n'est pas mon tour ou si la liste n'est pas encore reçue). */
  const coupsDe = (de) => (st.coups || []).filter((m) => m.de === de);
  /** Vrai si je peux jouer maintenant. */
  const jouable = () => {
    const e = st.etat;
    return !!e && e.partie.statut === 'en_cours' && cadre.monTour(e) && !st.attente && !st.promo;
  };

  /** Crée les 64 cases dans l'ordre d'affichage (retournées pour les noirs). Une fois par orientation. */
  function construire(flip) {
    st.flip = flip;
    st.curseur = flip ? 12 : 52;
    st.cases = new Array(64).fill(null);
    el.echiquier.replaceChildren();
    for (let d = 0; d < 64; d++) {
      const i = flip ? 63 - d : d;
      const r = Math.floor(i / 8), c = i % 8;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `duels-echecs-case ${(r + c) % 2 === 0 ? 'is-claire' : 'is-sombre'}`;
      b.dataset.sq = String(i);
      // Coordonnées sur les bords de l'affichage : rangs à gauche, fichiers en bas.
      if (d % 8 === 0) b.append(coordonnee('rang', String(8 - r)));
      if (Math.floor(d / 8) === 7) b.append(coordonnee('fichier', FICHIERS[c]));
      el.echiquier.append(b);
      st.cases[i] = b;
    }
  }
  /** Petite étiquette de coordonnée (décorative : le nom de la case est dans aria-label). */
  function coordonnee(classe, texte) {
    const s = document.createElement('span');
    s.className = `duels-echecs-coord is-${classe}`;
    s.setAttribute('aria-hidden', 'true');
    s.textContent = texte;
    return s;
  }

  /** Demande les coups jouables quand c'est mon tour, une fois par version de la partie. */
  async function chargerCoups(e) {
    const p = e.partie;
    if (!cadre.monTour(e) || p.statut !== 'en_cours') { st.coups = null; st.cle = null; return; }
    const cle = `${p.id}:${p.version}`;
    if (st.cle === cle) return;
    st.cle = cle;
    st.coups = null;
    try {
      const liste = await duel.possibles(ctx.code);
      if (!st.vivant || st.cle !== cle) return;
      st.coups = (liste || []).map((m) => ({ de: Number(m.de), a: Number(m.a), promo: m.promo || '' }));
    } catch (err) {
      if (!st.vivant || st.cle !== cle) return;
      st.coups = [];
      toast(erreurTexte(err), 'error');
    }
    paint();
    prisesVues();
  }

  /** Dessine les cases, la légende, les pièces prises, l'annonce d'échec et les boutons. */
  function paint() {
    const e = st.etat;
    if (!st.vivant || !e || st.flip === null) return;
    const g = grilleDe(e);
    const p = e.partie;
    const ok = jouable();
    const dests = ok && st.sel !== null ? coupsDe(st.sel) : [];
    const cibles = new Map(dests.map((m) => [m.a, m]));
    const dern = derniere(e);
    const roi = roiEnEchec(e);
    const cmp = campDe(e);

    for (let i = 0; i < 64; i++) {
      const b = st.cases[i];
      const ch = g[i];
      const t = ch.toLowerCase();
      let pc = b.querySelector('.duels-echecs-piece');
      if (!pc) {
        pc = document.createElement('span');
        pc.setAttribute('aria-hidden', 'true');
        b.append(pc);
      }
      pc.textContent = ch === '.' ? '' : SYMBOLE[t];
      pc.className = ch === '.' ? 'duels-echecs-piece' : `duels-echecs-piece is-${estBlanc(ch) ? 'blanc' : 'noir'}`;
      const m = cibles.get(i);
      // Prise en passant : pion qui change de colonne vers une case vide.
      const enPassant = !!m && t === 'p' && st.sel % 8 !== i % 8 && ch === '.';
      const prise = !!m && (ch !== '.' || enPassant);
      const mienne = ok && ch !== '.' && (estBlanc(ch) ? 'blanc' : 'noir') === cmp;
      b.classList.toggle('is-cible', !!m && !prise);
      b.classList.toggle('is-prise', !!m && prise);
      b.classList.toggle('is-sel', st.sel === i);
      b.classList.toggle('is-dernier', !!dern && (i === dern.de || i === dern.a));
      b.classList.toggle('is-echec', i === roi);
      b.classList.toggle('is-mienne', mienne && coupsDe(i).length > 0);
      b.tabIndex = i === st.curseur ? 0 : -1;
      b.setAttribute('aria-disabled', String(!ok));
      b.setAttribute('aria-label', libelle(i, ch, !!m, prise, i === roi));
    }

    const { parBlancs, parNoirs } = pris(g);
    el.pris.replaceChildren(listePris('Pris par les blancs :', parBlancs, 'noir'), listePris('Pris par les noirs :', parNoirs, 'blanc'));

    const js = e.joueurs || [];
    const blanc = js.find((j) => j.user_id === e.echecs?.blanc) || null;
    const noir = js.find((j) => j.user_id !== e.echecs?.blanc) || null;
    const legende = (j, couleur, nom) => `<span class="duels-echecs-legende-j"><span class="duels-echecs-pastille is-${couleur}" aria-hidden="true"></span>${nom} : ${nomJoueur(j)}${j && j.user_id === e.moi?.user_id ? ' (toi)' : ''}</span>`;
    el.legende.innerHTML = `${legende(blanc, 'blanc', 'Blancs')}<span aria-hidden="true">·</span>${legende(noir, 'noir', 'Noirs')}`;

    const texteAnnonce = roi >= 0 && p.statut === 'en_cours' ? 'Échec !' : '';
    if (texteAnnonce !== st.annonce) { st.annonce = texteAnnonce; el.annonce.textContent = texteAnnonce; }

    const actions = st.sel !== null && dests.length
      ? '<button type="button" class="btn btn-ghost duels-echecs-annuler" data-annuler>Annuler la sélection</button>' : '';
    if (actions !== st.actionsHtml) { st.actionsHtml = actions; el.actions.innerHTML = actions; }
  }

  /** Son de la table (aucun son après le départ de la page). */
  const son = (n) => { if (st.vivant) jouerSonJeu('echecs', n); };
  /** Animations permises : préférence « effets », mouvement réduit et réglage calme des duels. */
  const animer = () => st.vivant && motionAllowed() && !document.body.classList.contains('duels-calme');

  /** Pièce choisie : sa case s'éclaire, « Annuler la sélection » pulse, son de sélection. */
  function effetChoix(i) {
    son(2);
    if (!animer()) return;
    passager(st.cases[i], 'zz-libre', 3000);
    passager(el.actions.querySelector('[data-annuler]'), 'zz-joue', 4000);
  }

  /** Mon tour : mon nom pulse ; les pièces qui peuvent prendre s'éclairent dès que la liste des coups est reçue. */
  function effetATo() {
    if (!animer()) return;
    passager(root.querySelector('.duels-face-j.is-tour'), 'zz-joue', 5000);
    st.aTo = true;
    prisesVues();
  }

  /** Éclaire les pièces qui peuvent prendre (une seule fois, quand les coups sont connus). */
  function prisesVues() {
    if (!st.aTo || !st.coups) return;
    st.aTo = false;
    if (!animer()) return;
    const g = grilleDe(st.etat);
    const depuis = new Set(st.coups.filter((m) => g[m.a] !== '.').map((m) => m.de));
    depuis.forEach((i) => passager(st.cases[i], 'zz-libre', 4000));
  }

  /** Coup joué : la pièce glisse de sa case de départ à son arrivée ; la pièce prise disparaît au contact. */
  function animerCoup(prevG, de, a, roi) {
    // Prise : pièce sur l'arrivée, ou pion pris en passant (case voisine, vide après le coup).
    const pion = prevG[de].toLowerCase() === 'p';
    const pris = prevG[a] !== '.' ? a : (pion && de % 8 !== a % 8 ? Math.floor(de / 8) * 8 + (a % 8) : -1);
    const capture = pris >= 0 && prevG[pris] !== '.';
    const duree = 900;
    if (animer()) {
      const ca = st.cases[a], cd = st.cases[de];
      const pc = ca?.querySelector('.duels-echecs-piece');
      if (pc && cd && ca) {
        const r1 = cd.getBoundingClientRect(), r2 = ca.getBoundingClientRect();
        pc.animate([{ transform: `translate(${r1.left - r2.left}px,${r1.top - r2.top}px)` }, { transform: 'translate(0,0)' }],
          { duration: duree, easing: 'ease-in-out', fill: 'backwards' });
      }
      if (capture && st.cases[pris]) {
        const f = fantome(prevG[pris]);
        st.cases[pris].append(f);
        f.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.3)' }], { duration: 450, delay: duree, fill: 'both' });
        setTimeout(() => f.remove(), duree + 500);
        passager(root.querySelector('.duels-echecs-pris'), 'zz-joue', 4000);
      }
    }
    setTimeout(() => son(capture ? 1 : 2), duree);
    if (roi >= 0) {
      setTimeout(() => {
        son(3);
        if (!animer()) return;
        passager(st.cases[roi], 'zz-roi', 3800);
        bandeau('Échec !', 'Le roi doit s’échapper');
      }, duree + 300);
    }
  }

  /** Vrais changements seulement : nouveau coup (même partie, nb_coups augmenté) et début de mon tour. */
  function effets(prec, e) {
    if (!prec || !st.vivant || !e.partie) return;
    const p = e.partie, q = prec.partie;
    if (p.id === q.id && p.nb_coups > q.nb_coups) {
      const dz = derniere(e);
      if (dz) animerCoup(grilleDe(prec), dz.de, dz.a, roiEnEchec(e));
    }
    if (p.statut === 'en_cours' && cadre.monTour(e) && !cadre.monTour(prec)) effetATo();
  }

  /** Statut sous la barre : à moi, au tour de l'autre, ou le robot. */
  function statut(e) {
    if (!e.moi?.joue) return;
    if (e.partie.statut !== 'en_cours') { cadre.statut(''); return; }
    if (cadre.monTour(e)) { cadre.statut('À toi de jouer'); return; }
    const adv = cadre.adversaire(e);
    cadre.statut(adv?.robot ? 'Le robot réfléchit…' : `Au tour de ${adv?.pseudo || 'ton adversaire'}`);
  }

  /** Envoie le coup puis attend l'état (le temps réel le renverra). */
  async function envoyer(de, a, action) {
    st.attente = true;
    st.sel = null;
    st.promo = null;
    paint();
    try {
      await duel.jouer(ctx.code, de * 64 + a, action);
      clearTimeout(st.timer);
      st.timer = setTimeout(() => { st.attente = false; paint(); }, ATTENTE_MS);
    } catch (err) {
      st.attente = false;
      toast(erreurTexte(err), 'error');
    } finally {
      ctx.suivi?.rafraichir?.();
      paint();
    }
  }

  /** Une case d'arrivée a été choisie : promotion d'abord, sinon coup normal. */
  function jouerCase(de, a) {
    const options = coupsDe(de).filter((m) => m.a === a);
    if (options.some((m) => m.promo)) { ouvrirPromo(de, a); return; }
    envoyer(de, a, 'pose');
  }

  /** Clic (ou Entrée) sur une case : sélection d'une pièce, ou coup vers une case d'arrivée. */
  function surCase(i) {
    if (!jouable()) return;
    st.curseur = i;
    if (st.sel !== null) {
      if (coupsDe(st.sel).some((m) => m.a === i)) { jouerCase(st.sel, i); return; }
      if (st.sel === i) { st.sel = null; paint(); return; }
    }
    st.sel = estMien(i) && coupsDe(i).length ? i : null;
    paint();
    if (st.sel !== null) effetChoix(st.sel);
  }

  /** Vrai si la case contient une pièce du camp joué par le membre connecté. */
  function estMien(i) {
    const e = st.etat;
    const ch = grilleDe(e)[i];
    const cmp = campDe(e);
    return !!cmp && ch !== '.' && (estBlanc(ch) ? 'blanc' : 'noir') === cmp;
  }

  /** Fenêtre de promotion : quatre pièces, Échap annule (le coup n'est pas joué). */
  function ouvrirPromo(de, a) {
    st.promo = { de, a };
    st.sel = null;
    const couleur = campDe(st.etat) === 'noir' ? 'noir' : 'blanc';
    const titre = document.createElement('p');
    titre.className = 'duels-echecs-promo-titre';
    titre.textContent = 'Promotion : choisis la pièce';
    const choix = document.createElement('div');
    choix.className = 'duels-echecs-promo-choix';
    for (const [k, nom] of PROMO) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost duels-echecs-promo-bouton';
      b.dataset.promo = k;
      const s = document.createElement('span');
      s.className = `duels-echecs-piece is-${couleur}`;
      s.setAttribute('aria-hidden', 'true');
      s.textContent = SYMBOLE[k];
      b.append(s, ` ${nom}`);
      choix.append(b);
    }
    el.promo.replaceChildren(titre, choix);
    el.promo.hidden = false;
    paint();
    choix.querySelector('button').focus();
  }

  /** Ferme la fenêtre de promotion ; rendre = true ramène le focus sur la case d'arrivée. */
  function fermerPromo(rendre) {
    const p = st.promo;
    st.promo = null;
    el.promo.hidden = true;
    el.promo.replaceChildren();
    paint();
    if (p && rendre) st.cases[p.a]?.focus();
  }

  /** Place le curseur (et le focus) sur une case. */
  function allerA(i) {
    st.curseur = i;
    paint();
    st.cases[i]?.focus();
  }

  /** Glisser-déposer à la souris : on mémorise la case de départ au premier mouvement. */
  function surPointeurBas(ev) {
    if (ev.pointerType !== 'mouse' || ev.button !== 0 || !jouable()) return;
    const b = ev.target.closest?.('[data-sq]');
    if (!b) return;
    const i = Number(b.dataset.sq);
    if (!estMien(i) || !coupsDe(i).length) return;
    st.glisseFait = false;
    st.glisse = { de: i, x: ev.clientX, y: ev.clientY, fantome: null };
  }
  function surPointeurDeplace(ev) {
    const g = st.glisse;
    if (!g) return;
    if (!g.fantome) {
      if (Math.hypot(ev.clientX - g.x, ev.clientY - g.y) < 6) return;
      st.sel = g.de;
      const ch = grilleDe(st.etat)[g.de];
      g.fantome = document.createElement('span');
      g.fantome.className = `duels-echecs-fantome is-${estBlanc(ch) ? 'blanc' : 'noir'}`;
      g.fantome.setAttribute('aria-hidden', 'true');
      g.fantome.textContent = SYMBOLE[ch.toLowerCase()];
      document.body.append(g.fantome);
      paint();
    }
    g.fantome.style.left = `${ev.clientX}px`;
    g.fantome.style.top = `${ev.clientY}px`;
  }
  function surPointeurHaut(ev) {
    const g = st.glisse;
    st.glisse = null;
    if (!g?.fantome) return;
    g.fantome.remove();
    st.glisseFait = true; // le clic qui suit (si le relâchement a lieu sur la même case) ne doit pas re-sélectionner
    const cible = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-sq]');
    const a = cible ? Number(cible.dataset.sq) : -1;
    if (a >= 0 && a !== g.de && coupsDe(g.de).some((m) => m.a === a)) jouerCase(g.de, a);
    else paint();
  }

  cadre.plateau.addEventListener('pointerdown', surPointeurBas);
  document.addEventListener('pointermove', surPointeurDeplace);
  document.addEventListener('pointerup', surPointeurHaut);
  document.addEventListener('pointercancel', surPointeurHaut);

  cadre.plateau.addEventListener('click', (ev) => {
    if (st.glisseFait) { st.glisseFait = false; return; }
    const b = ev.target.closest?.('[data-sq]');
    if (b) { surCase(Number(b.dataset.sq)); return; }
    if (ev.target.closest?.('[data-annuler]')) {
      st.sel = null;
      paint();
      st.cases[st.curseur]?.focus();
    }
  });

  // Clavier : flèches = case voisine dans l'affichage (sens inversé pour les noirs).
  cadre.plateau.addEventListener('keydown', (ev) => {
    const b = ev.target.closest?.('[data-sq]');
    if (!b) return;
    const i = Number(b.dataset.sq);
    const ecart = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[ev.key];
    if (ecart) {
      ev.preventDefault();
      const s = st.flip ? -1 : 1;
      const r = Math.floor(i / 8) + ecart[0] * s;
      const c = (i % 8) + ecart[1] * s;
      if (r >= 0 && r <= 7 && c >= 0 && c <= 7) allerA(r * 8 + c);
      return;
    }
    if (ev.key === 'Escape' && st.sel !== null) {
      ev.preventDefault();
      st.sel = null;
      paint();
    }
  });

  // Fenêtre de promotion : un clic choisit la pièce ; Échap la ferme sans jouer.
  el.promo.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-promo]');
    if (!b || !st.promo) return;
    const { de, a } = st.promo;
    st.promo = null;
    el.promo.hidden = true;
    el.promo.replaceChildren();
    envoyer(de, a, b.dataset.promo);
  });
  el.promo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); fermerPromo(true); }
  });

  /** Statut, règles et chargement des coups après chaque mise à jour de la partie. */
  return {
    /** Met à jour la table avec l'état du duel. */
    maj(e) {
      vuEnCours(e.partie);
      const prec = st.etat;
      st.etat = e;
      st.attente = false;
      clearTimeout(st.timer);
      cadre.maj(e);
      const flip = campDe(e) === 'noir';
      if (st.flip === null || flip !== st.flip) construire(flip);
      if (!st.regle) {
        st.regle = true;
        cadre.cote.innerHTML = `<h2 class="duels-h3">Règles</h2>
          <p class="duels-echecs-regle">Le roi ne doit jamais rester en échec. Roque, prise en passant et promotion sont permis.</p>
          <p class="duels-echecs-regle">Mat : le roi est attaqué sans échappatoire. Pat : aucun coup possible sans être en échec, c’est nul.</p>`;
      }
      if (st.sel !== null && !cadre.monTour(e)) st.sel = null;
      if (st.promo && !cadre.monTour(e)) fermerPromo(false);
      chargerCoups(e);
      statut(e);
      paint();
      effets(prec, e);
    },
    message(m) { cadre.message(m); },
    detruire() {
      st.vivant = false;
      clearTimeout(st.timer);
      document.removeEventListener('pointermove', surPointeurDeplace);
      document.removeEventListener('pointerup', surPointeurHaut);
      document.removeEventListener('pointercancel', surPointeurHaut);
      st.glisse?.fantome?.remove();
      cadre.detruire();
    },
  };
}

/** Fin de duel vue en direct (appelé par vues/fin.js) : son du mat ou de la nulle, gagnant qui brille, bandeau, confettis.
 *  Perdant (EC1) : gong grave S25 (son 3 du jeu), mon roi tombe, bandeau sobre. */
export function effetsFin(root, e) {
  const h = e.partie?.historique || [];
  // Seul le mat donne une manche gagnée sur l'échiquier ; une dernière manche nulle peut clore un duel en plusieurs manches.
  const mat = !!h[h.length - 1]?.gagnant;
  // son() n'est appelé que pour une fin vue en direct, une seule fois : il dit aussi si les effets de la grille doivent jouer.
  let vue = null;
  effetsFinDuel(root, e, {
    jeu: 'echecs',
    son: (issue) => { vue = issue; return issue === 'spectateur' ? null : issue === 'nulle' ? 5 : issue === 'perdant' ? 3 : 4; },
    titre: (issue) => (issue === 'nulle' ? ['Nulle', 'Partie terminée'] : issue === 'perdant' ? null
      : [mat ? 'Échec et mat' : 'Partie gagnée !', 'Partie terminée']),
  });
  if (vue !== 'perdant') return;
  if (mat && anime()) {
    const couleur = String(e.pions?.[e.moi?.user_id]) === '1' ? 'blanc' : 'noir';
    root.querySelector(`.duels-fin-mini .duels-fin-piece.is-${couleur}[data-p="k"]`)?.classList.add('duels-echecs-roi-tombe');
  }
  fxFin.plus(() => fxFin.bandeau(mat ? 'Échec et mat' : 'Partie perdue', mat ? 'Tu perds la partie' : 'Partie terminée', { ton: 'd' }), 500);
}
