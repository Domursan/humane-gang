// ===== Humane Gang — Duels : table des Dames (#partie/CODE, jeu dames) =====
/*
 * Rôle : dessine le damier 10 × 10 (cases jouables sombres) dans le cadre commun (vues/commun.js) et envoie les coups
 *   (duel.jouer, action 'chemin:a,b,c'). Pions : ronds crème pour le joueur « 1 », rouge brun pour « 2 » ; les dames
 *   portent une couronne. Le plateau est retourné quand je suis « 2 » (mes pions en bas).
 * Coups : cliquer une pièce qui peut jouer, puis chaque case d'arrivée. Une rafle se construit case après case : chaque
 *   clic avance dans les chemins qui commencent pareil ; dès qu'un seul chemin correspond complètement, il est joué.
 *   Quand un chemin peut encore continuer, « Jouer ici » permet de s'arrêter. « Annuler la sélection » reprend tout.
 * Les arrivées viennent de hg_duel_possibles (pendant mon tour seulement). Prise obligatoire : signalée, et les pièces
 *   qui peuvent prendre sont marquées. Pendant une rafle, les pièces sautées sont surlignées.
 * Clavier : flèches vers la case la plus proche dans la direction (les arrivées de la sélection d'abord), Entrée ou Espace pour choisir, Échap pour annuler.
 * Dernier coup surligné (départ et arrivée). Une seule case est dans l'ordre de tabulation.
 * Effets (maquette validée) : à mon tour, mon nom pulse et les pièces qui peuvent prendre s'éclairent ; un nouveau coup fait
 *   glisser la pièce case après case (rafle comprise) et disparaître chaque pièce prise après son saut, avec les sons
 *   « Glissement » et « Pièce prise » ; une pièce choisie s'éclaire, avec le bouton « Annuler la sélection ». Déclenché par la
 *   comparaison avec l'état précédent (même partie, nb_coups qui augmente) ; le premier état n'anime rien. Pas d'animation
 *   si le mouvement est réduit ou si les duels sont en mode calme. Le son « à toi de jouer » reste celui de commun/tour-signal.js.
 *   La fin de partie (victoire, nulle) est affichée par vues/fin.js, hors de ce fichier. Défaite (DA1, effetsFin) : mes dernières
 *   pièces disparaissent de la petite grille, bandeau sobre, S16. La dernière grille ne les contient plus : la table retient la
 *   dernière position vue en cours, et le chemin du dernier coup dit lesquelles ont été sautées (le serveur n'a rien à fournir).
 * Dépendances : core.js (toast, motionAllowed), sons-jeux.js (jouerSonJeu), ../api.js (duel, erreurTexte), ../plateau-commun.js (chargerCss), ./commun.js (creerCadre, nomJoueur),
 *   ../../../commun/effets-duels.js (anime), ./fin-fx.js (vuEnCours, effetsFinDuel, fxFin), ./fin.js (pionDames).
 * Exporte : creer, effetsFin (fin de duel, via ./fin-fx.js).
 */
import { toast, motionAllowed } from '../../../commun/core.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { anime } from '../../../commun/effets-duels.js';
import { vuEnCours, effetsFinDuel, fxFin } from './fin-fx.js';
import { pionDames } from './fin.js';
import { duel, erreurTexte } from '../api.js';
import { chargerCss } from '../plateau-commun.js';
import { creerCadre, nomJoueur } from './commun.js';
import { voisinSpatial } from '../../../commun/grille-clavier.js';

chargerCss('dames');

const N = 10;
/** Durée pendant laquelle on attend l'état après un envoi réussi, au cas où le temps réel tarde (ms). */
const ATTENTE_MS = 5000;
/** Couronne des dames (SVG décoratif). */
const COURONNE = '<svg class="duels-dames-couronne" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 18h18l1.5-11-5.5 5L12 5l-4 7-5.5-5z"/></svg>';

const ligne = (i) => Math.floor(i / N);
const colonne = (i) => i % N;
/** Cases jouables : celles dont (ligne + colonne) est impair, comme côté serveur. */
const jouable = (i) => (ligne(i) + colonne(i)) % 2 === 1;
/** Camp d'une pièce : '1' (pions et dames crème), '2' (rouge brun), ou null pour une case vide. */
const camp = (ch) => (ch === '1' || ch === 'A' ? '1' : ch === '2' || ch === 'B' ? '2' : null);
const estDame = (ch) => ch === 'A' || ch === 'B';
const grilleDe = (e) => String(e?.partie?.grille || '').padEnd(100, '.').slice(0, 100);
/** Dernière position vue en cours : { id, manche, grille } (DA1). */
let positionVue = null;
/** Mon camp ('1' ou '2'), ou null pour un spectateur. */
const monCamp = (e) => (e?.moi?.joue ? e.pions?.[e.moi.user_id] || null : null);
const adverse = (c) => (c === '1' ? '2' : c === '2' ? '1' : null);

/** Pièces adverses sautées par un déplacement diagonal de a vers b (la rafle en saute une par segment). */
function sautees(a, b, g, adv) {
  const dl = ligne(b) - ligne(a), dc = colonne(b) - colonne(a);
  const out = [];
  if (dl === 0 || Math.abs(dl) !== Math.abs(dc)) return out;
  const sl = Math.sign(dl), sc = Math.sign(dc);
  let r = ligne(a) + sl, c = colonne(a) + sc;
  while (r !== ligne(b)) {
    const j = r * N + c;
    if (camp(g[j]) === adv) out.push(j);
    r += sl; c += sc;
  }
  return out;
}

/** Chemin (tableau de cases) : une prise est une rafle de plus d'un saut, ou un saut au-dessus d'une pièce adverse. */
const estPrise = (c, g, adv) => c.length > 2 || sautees(c[0], c[1], g, adv).length > 0;

/** Le chemin t est-il le début du chemin c ? */
const prefixe = (c, t) => t.length <= c.length && t.every((x, k) => c[k] === x);

/** Dernier coup : { de, a } ; a est la dernière case du chemin joué. */
function derniere(e) {
  const d = e.partie?.dernier;
  if (!d || d.case == null || !(e.partie.nb_coups > 0)) return null;
  const fin = typeof d.action === 'string' && d.action.startsWith('chemin:')
    ? Number(d.action.split(',').pop()) : Number(d.case);
  return { de: Number(d.case), a: fin };
}

/** Libellé lu par les lecteurs d'écran : position, pièce et camp. */
function libelle(i, ch, mienne, cible) {
  const pos = `ligne ${ligne(i) + 1}, colonne ${colonne(i) + 1}`;
  let t = ch === '.' ? `${pos}, case vide`
    : `${pos}, ${estDame(ch) ? 'dame' : 'pion'} ${camp(ch) === '1' ? 'crème' : 'rouge brun'}${mienne ? ' (à toi)' : ''}`;
  if (cible) t += ', case d’arrivée possible';
  return t;
}

/** Pion d'effet (pion qui saute ou pion pris) : hors du rendu, paint() ne le reprend pas ni ne le retire. */
function fantome(ch) {
  const f = document.createElement('span');
  f.className = 'zz-fantome';
  f.setAttribute('aria-hidden', 'true');
  const p = document.createElement('span');
  p.className = `zz-fantome-pion is-${camp(ch)}`;
  if (estDame(ch)) p.innerHTML = COURONNE;
  f.append(p);
  return f;
}

/** Chemin joué, case après case (l'action vaut « chemin:a,b,c »), ou null. */
function cheminDu(e) {
  const dz = derniere(e);
  if (!dz) return null;
  const act = e.partie.dernier.action;
  const c = typeof act === 'string' && act.startsWith('chemin:') ? act.slice('chemin:'.length).split(',').map(Number) : [dz.de, dz.a];
  return c.length >= 2 && c.every(Number.isInteger) ? c : null;
}

/** Ajoute une classe d'effet un instant, puis la retire. */
function passager(el, classe, ms) {
  if (!el) return;
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}

/**
 * Monte la table des Dames dans root.
 * @param {HTMLElement} root conteneur de la vue (vidé par le cadre commun).
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj: Function, message: Function, detruire: Function}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-dames' });
  cadre.plateau.innerHTML = `
    <div class="duels-dames-jeu">
      <p class="duels-dames-info" data-info aria-live="polite"></p>
      <div class="duels-dames-plateau" data-damier role="group" aria-label="Damier : flèches pour te déplacer, Entrée pour choisir une case"></div>
      <div class="duels-dames-actions" data-actions></div>
      <p class="duels-dames-legende" data-legende></p>
    </div>`;
  const q = (s) => cadre.plateau.querySelector(s);
  const el = { info: q('[data-info]'), damier: q('[data-damier]'), actions: q('[data-actions]'), legende: q('[data-legende]') };

  const st = {
    etat: null, flip: null, cases: new Array(100).fill(null), curseur: 1,
    /** Coups jouables : tableaux de cases (chemins), ou null pendant le chargement. */
    coups: null, cle: null,
    sel: null, trajet: [], attente: false, timer: null, glisseFait: false,
    infoTxt: '', actionsHtml: '', regle: false, vivant: true, aTo: false,
  };

  /** Chemins possibles (tableaux de cases) reçus du serveur. */
  const chemins = () => st.coups || [];
  /** Vrai si je peux jouer maintenant. */
  const actif = () => {
    const e = st.etat;
    return !!e && e.partie.statut === 'en_cours' && cadre.monTour(e) && !st.attente;
  };
  /** Chemins compatibles avec la sélection et le trajet déjà fait, prochaines cases et fin possible. */
  function etatTrajet() {
    const t = st.trajet;
    const cand = st.sel === null ? [] : chemins().filter((c) => prefixe(c, t));
    const suite = new Set(cand.filter((c) => c.length > t.length).map((c) => c[t.length]));
    const fin = cand.some((c) => c.length === t.length);
    return { suite, fin, encore: suite.size > 0 };
  }
  /** Cases de départ des chemins (pièces qui peuvent jouer). */
  const departs = () => new Set(chemins().map((c) => c[0]));

  /** Crée les cases (les claires sont des cadres décoratifs). Une fois par orientation. */
  function construire(flip) {
    st.flip = flip;
    st.curseur = flip ? 98 : 1;
    st.cases = new Array(100).fill(null);
    el.damier.replaceChildren();
    for (let d = 0; d < 100; d++) {
      const i = flip ? 99 - d : d;
      if (jouable(i)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'duels-dames-case is-sombre';
        b.dataset.sq = String(i);
        el.damier.append(b);
        st.cases[i] = b;
      } else {
        const s = document.createElement('span');
        s.className = 'duels-dames-case is-claire';
        s.setAttribute('aria-hidden', 'true');
        el.damier.append(s);
      }
    }
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
      st.coups = (liste || []).map((s) => (Array.isArray(s) ? s : String(s).split(',')).map(Number));
    } catch (err) {
      if (!st.vivant || st.cle !== cle) return;
      st.coups = [];
      toast(erreurTexte(err), 'error');
    }
    paint();
    prisesVues();
  }

  /** Envoie la rafle (ou le déplacement) : départ et chemin complet. */
  async function envoyer(trajet) {
    st.attente = true;
    st.sel = null;
    st.trajet = [];
    paint();
    try {
      await duel.jouer(ctx.code, trajet[0], `chemin:${trajet.join(',')}`);
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

  /** Annule la sélection en cours. */
  function annuler() {
    st.sel = null;
    st.trajet = [];
    paint();
  }

  /** Clic sur une case : départ d'une pièce, ou case suivante du trajet (la rafle se joue quand elle est complète). */
  function surCase(i) {
    if (!actif()) return;
    st.curseur = i;
    if (st.sel !== null) {
      const r = etatTrajet();
      if (r.suite.has(i)) {
        st.trajet = [...st.trajet, i];
        const suite = etatTrajet();
        if (suite.fin && !suite.encore) { envoyer(st.trajet); return; }
        paint();
        return;
      }
      if (i === st.sel) { annuler(); return; }
    }
    if (departs().has(i)) { st.sel = i; st.trajet = [i]; paint(); effetChoix(i); }
  }

  /** Place le curseur (et le focus) sur une case. */
  function allerA(i) {
    st.curseur = i;
    paint();
    st.cases[i]?.focus();
  }

  /** Dessine le damier, les pièces, les messages et les boutons. */
  function paint() {
    const e = st.etat;
    if (!st.vivant || !e || st.flip === null) return;
    const g = grilleDe(e);
    const mien = monCamp(e);
    const adv = adverse(mien);
    const ok = actif();
    const r = etatTrajet();
    const dep = ok ? departs() : new Set();
    const prisesPossibles = ok && chemins().some((c) => estPrise(c, g, adv));
    const debuts = prisesPossibles ? new Set(chemins().filter((c) => estPrise(c, g, adv)).map((c) => c[0])) : new Set();
    // Pièces sautées par le trajet déjà fait : surlignées pendant la rafle.
    const sautes = new Set();
    if (st.sel !== null) for (let k = 0; k + 1 < st.trajet.length; k++) sautees(st.trajet[k], st.trajet[k + 1], g, adv).forEach((j) => sautes.add(j));
    const dern = derniere(e);

    for (let i = 0; i < 100; i++) {
      const b = st.cases[i];
      if (!b) continue;
      const ch = g[i];
      let pion = b.querySelector('.duels-dames-pion');
      if (ch === '.') pion?.remove();
      else {
        if (!pion) {
          pion = document.createElement('span');
          pion.setAttribute('aria-hidden', 'true');
          b.append(pion);
        }
        pion.className = `duels-dames-pion is-${camp(ch)}`;
        pion.innerHTML = estDame(ch) ? COURONNE : '';
      }
      const cible = ok && st.sel !== null && r.suite.has(i);
      b.classList.toggle('is-sel', st.sel === i);
      b.classList.toggle('is-trajet', st.sel !== null && st.trajet.includes(i) && st.sel !== i);
      b.classList.toggle('is-cible', cible);
      b.classList.toggle('is-saute', sautes.has(i));
      b.classList.toggle('is-prise', debuts.has(i) && st.sel === null);
      b.classList.toggle('is-mienne', ok && dep.has(i));
      b.classList.toggle('is-dernier', !!dern && (i === dern.de || i === dern.a));
      b.tabIndex = i === st.curseur ? 0 : -1;
      b.setAttribute('aria-disabled', String(!ok));
      b.setAttribute('aria-label', libelle(i, ch, mien !== null && camp(ch) === mien && ok, cible));
    }

    // Message : prise obligatoire, ou possibilité d'arrêter la rafle ici.
    let info = '';
    if (ok && prisesPossibles && st.sel === null) info = 'Prise obligatoire : prends le plus de pièces possible.';
    if (st.sel !== null && r.fin && r.encore) info = 'Tu peux t’arrêter ici, ou continuer la rafle.';
    if (info !== st.infoTxt) { st.infoTxt = info; el.info.textContent = info; }

    // Boutons : annuler la sélection, jouer ici (rafle qui peut s'arrêter).
    let actions = '';
    if (st.sel !== null) actions += '<button type="button" class="btn btn-ghost duels-dames-annuler" data-annuler>Annuler la sélection</button>';
    if (st.sel !== null && r.fin && r.encore) actions += '<button type="button" class="btn btn-primary duels-dames-jouer" data-jouer-ici>Jouer ici</button>';
    if (actions !== st.actionsHtml) { st.actionsHtml = actions; el.actions.innerHTML = actions; }

    // Légende : joueur et couleur de ses pions, nombre de pièces restantes.
    const compte = { '1': 0, '2': 0 };
    for (const ch of g) { const c = camp(ch); if (c) compte[c] += 1; }
    const js = e.joueurs || [];
    const j1 = js.find((j) => e.pions?.[j.user_id] === '1') || null;
    const j2 = js.find((j) => e.pions?.[j.user_id] === '2') || null;
    const lg = (j, couleur, nomCouleur, n) => `<span class="duels-dames-legende-j"><span class="duels-dames-pastille is-${couleur}" aria-hidden="true"></span>${nomCouleur} : ${nomJoueur(j)}${j && j.user_id === e.moi?.user_id ? ' (toi)' : ''}, ${n} pièce${n > 1 ? 's' : ''}</span>`;
    el.legende.innerHTML = `${lg(j1, '1', 'Pions crème', compte['1'])}<span aria-hidden="true">·</span>${lg(j2, '2', 'Pions rouge brun', compte['2'])}`;
  }

  /** Son de la table (aucun son après le départ de la page). */
  const son = (n) => { if (st.vivant) jouerSonJeu('dames', n); };
  /** Animations permises : préférence « effets », mouvement réduit et réglage calme des duels. */
  const animer = () => st.vivant && motionAllowed() && !document.body.classList.contains('duels-calme');

  /** Pièce choisie : sa case s'éclaire, « Annuler la sélection » pulse, tic de sélection. */
  function effetChoix(i) {
    son(3);
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

  /** Éclaire les pièces qui peuvent prendre et le message « Prise obligatoire » (une seule fois, coups connus). */
  function prisesVues() {
    if (!st.aTo || !st.coups) return;
    st.aTo = false;
    if (!animer()) return;
    if (el.info.textContent) passager(el.info, 'zz-joue', 5000);
    st.cases.forEach((c) => { if (c?.classList.contains('is-prise')) passager(c, 'zz-libre', 4000); });
  }

  /** La pièce posée sur la case d'arrivée glisse case après case le long du chemin joué (départ compris). */
  function glisser(chemin, duree) {
    const arrivee = st.cases[chemin[chemin.length - 1]];
    const pion = arrivee?.querySelector('.duels-dames-pion');
    if (!pion) return;
    const rf = arrivee.getBoundingClientRect();
    const d = chemin.map((c) => {
      const r = st.cases[c]?.getBoundingClientRect();
      return r ? [r.left - rf.left, r.top - rf.top] : [0, 0];
    });
    const t = ([x, y]) => `translate(${x}px,${y}px)`;
    const n = chemin.length - 1;
    const images = [{ transform: t(d[0]), offset: 0 }];
    for (let k = 1; k <= n; k++) {
      images.push({ transform: t(d[k - 1]), offset: (k - 1) / n });
      images.push({ transform: t(d[k]), offset: (k - 0.2) / n }); // arrivée sur la case, puis une courte pause
    }
    images.push({ transform: 'translate(0px,0px)', offset: 1 });
    const an = pion.animate(images, { duration: duree, easing: 'ease-in-out' });
    setTimeout(() => an.cancel(), duree + 200);
  }

  /** Coup joué : glissement, puis chaque pièce sautée disparaît après son saut (sons « Pièce prise »). */
  function animerCoup(prevG, chemin) {
    const n = chemin.length - 1;
    const mover = camp(prevG[chemin[0]]);
    if (!mover) return;
    const adv = adverse(mover);
    const duree = Math.min(2400, 600 + 600 * n);
    son(2);
    if (animer()) glisser(chemin, duree);
    for (let s = 0; s < n; s++) {
      for (const j of sautees(chemin[s], chemin[s + 1], prevG, adv)) {
        const t = ((s + 0.8) / n) * duree; // la pièce atteint la case suivante ; la pièce sautée disparaît à cet instant
        setTimeout(() => son(1), t);
        const c = st.cases[j];
        if (!c || !animer()) continue;
        const f = fantome(prevG[j]);
        c.append(f);
        f.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.25)', opacity: 1, offset: 0.4 }, { transform: 'scale(.2)', opacity: 0 }],
          { duration: 520, delay: t, easing: 'ease-in', fill: 'both' });
        setTimeout(() => f.remove(), t + 600);
      }
    }
  }

  /** Vrais changements seulement : nouveau coup (même partie, nb_coups augmenté) et début de mon tour. */
  function effets(prec, e) {
    if (!prec || !st.vivant || !e.partie) return;
    const p = e.partie, q = prec.partie;
    if (p.id === q.id && p.nb_coups > q.nb_coups) {
      const chemin = cheminDu(e);
      if (chemin) animerCoup(grilleDe(prec), chemin);
    }
    if (p.statut === 'en_cours' && cadre.monTour(e) && !cadre.monTour(prec)) effetATo();
  }

  /** Statut sous la barre : à moi, au tour de l'autre, ou le robot. */
  function statut(e) {
    if (!e.moi?.joue) return;
    if (e.partie.statut !== 'en_cours') { cadre.statut(''); return; }
    if (cadre.monTour(e)) { cadre.statut('À toi de jouer'); return; }
    const adv2 = cadre.adversaire(e);
    cadre.statut(adv2?.robot ? 'Le robot réfléchit…' : `Au tour de ${adv2?.pseudo || 'ton adversaire'}`);
  }

  // Clics : cases, boutons « Annuler » et « Jouer ici ».
  cadre.plateau.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('[data-sq]');
    if (b) { surCase(Number(b.dataset.sq)); return; }
    if (ev.target.closest?.('[data-annuler]')) { annuler(); st.cases[st.curseur]?.focus(); return; }
    if (ev.target.closest?.('[data-jouer-ici]') && st.sel !== null && etatTrajet().fin) envoyer(st.trajet);
  });

  // Clavier : flèches vers la case la plus proche dans la direction (géométrie de l'écran, donc le sens est juste même
  // retourné). Pendant une sélection, les flèches visent d'abord les arrivées possibles, qui sont en diagonale.
  // Entrée ou Espace jouent la case (bouton natif), Échap annule la sélection.
  cadre.plateau.addEventListener('keydown', (ev) => {
    const b = ev.target.closest?.('[data-sq]');
    if (!b) return;
    if (ev.key.startsWith('Arrow')) {
      ev.preventDefault();
      const toutes = [...el.damier.querySelectorAll('[data-sq]')];
      const suite = st.sel !== null ? etatTrajet().suite : null;
      const cible = (suite && suite.size ? voisinSpatial(ev.key, b, toutes.filter((x) => suite.has(Number(x.dataset.sq)))) : null)
        || voisinSpatial(ev.key, b, toutes);
      if (cible) allerA(Number(cible.dataset.sq));
      return;
    }
    if (ev.key === 'Escape' && st.sel !== null) { ev.preventDefault(); annuler(); }
  });

  /** Statut, règles, chargement des coups après chaque mise à jour de la partie. */
  return {
    /** Met à jour la table avec l'état du duel. */
    maj(e) {
      vuEnCours(e.partie);
      if (e.partie.statut === 'en_cours') positionVue = { id: e.partie.id, manche: e.partie.manche, grille: grilleDe(e) };
      const prec = st.etat;
      st.etat = e;
      st.attente = false;
      clearTimeout(st.timer);
      cadre.maj(e);
      const flip = monCamp(e) === '2';
      if (st.flip === null || flip !== st.flip) construire(flip);
      if (!st.regle) {
        st.regle = true;
        cadre.cote.innerHTML = `<h2 class="duels-h3">Règles</h2>
          <p class="duels-dames-regle">Les pions avancent en diagonale et prennent en sautant. Une pièce qui peut prendre doit le faire.</p>
          <p class="duels-dames-regle">Prise obligatoire : on prend le plus de pièces possible. Les dames se déplacent loin sur leur diagonale.</p>
          <p class="duels-dames-regle">Nulle après 25 coups de chaque côté sans prise ni mouvement de pion.</p>`;
      }
      if (st.sel !== null && !cadre.monTour(e)) { st.sel = null; st.trajet = []; }
      chargerCoups(e);
      statut(e);
      paint();
      effets(prec, e);
    },
    message(m) { cadre.message(m); },
    detruire() {
      st.vivant = false;
      clearTimeout(st.timer);
      cadre.detruire();
    },
  };
}

/**
 * DA1 : mes pièces sautées par le dernier coup réapparaissent sur la petite grille, puis disparaissent l'une après l'autre.
 * Seules les pièces du chemin joué comptent : contre le robot, mon coup et sa réponse arrivent dans le même état, et une pièce
 * que je viens de déplacer manque à sa case sans avoir été prise.
 * @param {HTMLElement} root écran de fin.
 * @param {object} e état du duel terminé.
 * @param {string} avant dernière position vue en cours.
 * @param {string} finale dernière grille.
 * @param {string} mien mon camp.
 */
function effetPrises(root, e, avant, finale, mien) {
  if (!anime()) return;
  const chemin = cheminDu(e) || [];
  const prises = new Set(chemin.slice(1).flatMap((c, k) => sautees(chemin[k], c, avant, mien)));
  let rang = 0;
  prises.forEach((i) => {
    const ch = avant[i];
    const cel = root.querySelector(`.duels-fin-mini [data-c="${i}"]`);
    if (camp(finale[i]) === mien || !cel || cel.childElementCount) return;
    cel.insertAdjacentHTML('beforeend', pionDames(ch));
    const delai = 450 + Math.min(rang, 8) * 200;
    rang += 1;
    const pion = cel.lastElementChild;
    pion.style.animationDelay = `${delai}ms`;
    pion.classList.add('fxd-pris');
    fxFin.plus(() => pion.remove(), delai + 700);
  });
}

/** Fin de duel vue en direct (appelé par vues/fin.js) : cloches, gagnant qui brille, bandeau et confettis ; perdant : DA1, S16. */
export function effetsFin(root, e) {
  // son() n'est appelé que pour une fin vue en direct, une seule fois : il dit aussi si les effets de la grille doivent jouer.
  let vue = null;
  effetsFinDuel(root, e, {
    jeu: 'dames',
    son: (issue) => { vue = issue; return issue === 'spectateur' ? null : issue === 'perdant' ? 'S16' : 4; },
    titre: (issue) => (issue === 'gagnant' ? ['Partie gagnée !', 'Fin de la partie'] : issue === 'nulle' ? ['Nulle', 'Fin de la partie'] : null),
  });
  const pos = positionVue?.id === e.partie?.id ? positionVue : null;
  if (pos) positionVue = null;
  if (vue !== 'perdant') return;
  const h = e.partie.historique || [];
  const d = h[h.length - 1] || null;
  const mien = monCamp(e);
  const finale = String(d?.grille || e.partie.grille || '').padEnd(100, '.');
  if (pos && (!d || d.manche === pos.manche)) effetPrises(root, e, pos.grille, finale, mien);
  const adv = (e.joueurs || []).find((j) => j.user_id !== e.moi?.user_id);
  const nom = adv?.robot ? 'Le robot' : adv?.pseudo || 'Ton adversaire';
  // Le serveur finit la manche quand le camp suivant n'a plus de coup : plus de pièces, ou pièces bloquées.
  const sous = !d?.gagnant ? 'Fin de la partie' : [...finale].some((c) => camp(c) === mien) ? 'Tu ne peux plus jouer' : `${nom} prend tes dernières pièces`;
  fxFin.plus(() => fxFin.bandeau('Partie perdue', sous, { ton: 'd' }), 300);
}
