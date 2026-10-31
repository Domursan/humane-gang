// ===== Humane Gang — Duels : table du Morpion (classique 3×3, ultime, gomoku 15×15) =====
/*
 * Rôle : dessine le plateau dans le cadre commun (vues/commun.js) et envoie les coups (duel.jouer).
 *   Croix bleues = place 1 (#6FB3F2), ronds dorés = place 2 (#E8B04B). Le dernier coup s'anime (la marque se pose : agrandissement et fondu) ;
 *   au gomoku il est aussi marqué d'un point.
 *   Ultime : case = grille * 9 + position (partie.grille : 81 caractères). Les petites grilles gagnées sont
 *   recouvertes, la nulle est grisée, la grille imposée est entourée d'or (ou tout est libre si cible est null).
 *   Après chaque manche, la grille finale reste affichée quelques secondes avec la ligne gagnante barrée.
 *   Une case vide est un <button type="button"> (désactivée hors de mon tour), une marque un <span role="img">.
 *   Effets (ajouts à la maquette validée) : à mon tour, mon nom pulse en doré et les cases libres s'éclairent un instant ;
 *   chaque marque nouvelle joue le son 1 (craie) ; fin de manche : la ligne se trace, les cases gagnantes brillent, bandeau
 *   « Manche gagnée ! » avec le score, et confettis pour le gagnant (son 2 ; perdant : son 3 ; nulle : son 4). Le premier état
 *   reçu n'anime rien. Coupés par mouvement réduit (body.duels-calme ou prefers-reduced-motion), sauf les sons.
 *   Le signal « à toi de jouer » (son + titre d'onglet) reste celui du cadre (commun/tour-signal.js).
 *   Fin de duel (effetsFin, sur la petite grille de vues/fin.js, la table n'est plus affichée) : gagnant fêté ; MR1, défaite : la
 *   ligne adverse se trace en rose, mes marques s'éteignent, bandeau sobre ; MR2, nulle : une vague passe sur la grille, puis « = »,
 *   bandeau neutre, S17. Après l'effet, la vraie grille revient. Mouvement réduit : la grille reste telle quelle, les sons restent.
 * Dépendances : core.js (esc, toast, motionAllowed), ../api.js (duel, erreurTexte), ./commun.js (creerCadre, nomJoueur),
 *   ../../../commun/grille-clavier.js, ../../../commun/sons-jeux.js (jouerSonJeu), ../../../commun/effets-duels.js (anime),
 *   ./fin-fx.js (vuEnCours, effetsFinDuel, fxFin).
 * Exporte : effetsFin (fin de duel, via ./fin-fx.js) ; creer(root, ctx) → { maj(etat), message(msg), detruire() } (contrat de vues/partie.js).
 */
import { esc, toast, motionAllowed } from '../../../commun/core.js';
import { duel, erreurTexte } from '../api.js';
import { creerCadre, nomJoueur } from './commun.js';
import { voisinGrille } from '../../../commun/grille-clavier.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { anime } from '../../../commun/effets-duels.js';
import { vuEnCours, effetsFinDuel, fxFin } from './fin-fx.js';

const CROIX = '#6FB3F2';
const ROND = '#E8B04B';
const DUREE_RECAP = 3500;
const DELAI_FIN = 450;    // bandeau, confettis et son de fin de manche : après le tracé de la ligne
const DUREE_TOUR = 2600;  // pulsation de mon nom et éclairage des cases libres (moins de 3 s)
const DUREE_FIN = 3400;   // effets de la grille de fin : la vraie grille revient ensuite, sous le bandeau déjà parti
const SON_MARQUE = 1;     // son « marque posée (craie) » de la maquette
const COULEURS_CONFETTI = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398', '#E2C77E'];
const POS = ['en haut à gauche', 'en haut', 'en haut à droite', 'à gauche', 'au centre', 'à droite',
  'en bas à gauche', 'en bas', 'en bas à droite'];
const REGLES = {
  classique: ['Chacun joue à son tour sur une case libre.',
    'Aligne 3 marques : ligne, colonne ou diagonale.',
    'Le premier alignement gagne la manche ; si la grille est pleine, c’est nul.'],
  ultime: ['Gagne une petite grille en alignant 3 marques.',
    'La case jouée envoie l’adversaire dans la grille du même numéro.',
    'Aligne 3 petites grilles pour gagner la partie.'],
  gomoku: ['Chacun pose une marque sur une case libre, à son tour.',
    'Aligne exactement 5 marques : ligne, colonne ou diagonale.',
    'Le dernier coup est marqué d’un point.'],
};

/** Marque d'une case : '1' croix bleue, '2' rond doré. tracee : apparition animée (dernier coup). */
function svgMarque(c, tracee) {
  const trace = tracee ? ' is-trace' : '';
  return c === '1'
    // Deux traits séparés (et non un seul chemin à deux morceaux) : certains navigateurs ne traçaient que le premier.
    ? `<svg class="morpion-marque${trace}" viewBox="0 0 32 32" aria-hidden="true"><path d="M8 8L24 24" fill="none" stroke="${CROIX}" stroke-width="4" stroke-linecap="round"/><path d="M24 8L8 24" fill="none" stroke="${CROIX}" stroke-width="4" stroke-linecap="round"/></svg>`
    : `<svg class="morpion-marque${trace}" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="10" fill="none" stroke="${ROND}" stroke-width="4"/></svg>`;
}

/** Grande marque semi-transparente posée sur une petite grille gagnée. */
function svgGrande(c) {
  return c === '1'
    ? `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 6L26 26M26 6L6 26" fill="none" stroke="${CROIX}" stroke-width="3" stroke-linecap="round"/></svg>`
    : `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="none" stroke="${ROND}" stroke-width="3"/></svg>`;
}

/** Libellé (aria-label) d'une case vide. */
function libelleCase(variante, w, i) {
  if (variante === 'ultime') return `Grille ${Math.floor(i / 9) + 1}, case ${(i % 9) + 1}`;
  if (variante === 'gomoku') return `Ligne ${Math.floor(i / w) + 1}, colonne ${(i % w) + 1}`;
  return `Case ${i + 1}`;
}

/**
 * Barre la ligne gagnante (du centre de la première case au centre de la dernière) par-dessus le plateau.
 * @param {HTMLElement} cadreEl conteneur positionné qui contient les cases et le svg.
 * @param {number[]} cases indices des cases gagnantes.
 */
function tracerBarre(cadreEl, cases) {
  const svg = cadreEl.querySelector('.morpion-barre');
  const pts = (cases || []).map((i) => cadreEl.querySelector(`[data-case="${Number(i)}"]`)).filter(Boolean);
  if (!svg || pts.length < 2) return;
  const base = cadreEl.getBoundingClientRect();
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return [r.left - base.left + r.width / 2, r.top - base.top + r.height / 2];
  };
  const [x1, y1] = centre(pts[0]);
  const [x2, y2] = centre(pts[pts.length - 1]);
  svg.setAttribute('viewBox', `0 0 ${base.width} ${base.height}`);
  svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  svg.hidden = false;
}

/**
 * Crée la table du Morpion.
 * @param {HTMLElement} root conteneur de la vue.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj: Function, message: Function, detruire: Function}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-morpion' });
  // provisoire : case que je viens de jouer, affichée tout de suite (avant la réponse du serveur) ;
  // masque : coup du robot reçu en même temps que le mien, montré un instant après (on voit d'abord son propre coup).
  const st = { etat: null, nbManches: null, recap: null, timer: null, dernierVu: '', envoi: false, vivant: true,
    provisoire: null, masque: null, tMasque: null,
    /* effets : glow (cases gagnantes de la grille finale), tCelebre (bandeau et son), fx (calques ajoutés au body),
       tourAvant (mon tour à l'état précédent), tourDebut (mon tour commence), tTour, tourEnAttente (début de tour pendant
       une grille finale : attend sa fin), affiche (marques déjà à l'écran : sert au son « marque posée ») */
    glow: null, tCelebre: null, fx: [], tourAvant: undefined, tourDebut: false, tTour: null, tourEnAttente: false, affiche: null,
    /* curseur : case de la tabulation (une seule, roving tabindex) ; par : cases affichées (index → élément) ;
       geo : forme de la grille affichée (lignes, colonnes, passage index ↔ ligne/colonne). */
    curseur: 0, par: new Map(), geo: null };

  // Délégation : un seul écouteur sur le plateau, même après les redessins.
  cadre.plateau.addEventListener('click', (ev) => {
    const b = ev.target.closest?.('button[data-case]');
    if (!b || b.disabled || st.envoi) return;
    jouer(Number(b.dataset.case));
  });

  // Clavier : flèches (et Début, Fin) pour passer d'une case à l'autre, marques comprises ; Entrée ou Espace jouent
  // la case (bouton natif). Les cases désactivées sont sautées.
  cadre.plateau.addEventListener('keydown', (ev) => {
    const cel = ev.target.closest?.('[data-case]');
    const geo = st.geo;
    if (!cel || !geo) return;
    const [r, c] = geo.versRC(Number(cel.dataset.case));
    const cible = voisinGrille(ev.key, r, c, geo.lignes, geo.colonnes,
      (rr, cc) => { const el = st.par.get(geo.versI(rr, cc)); return !!el && !el.disabled; });
    if (!cible) return;
    ev.preventDefault();
    allerA(geo.versI(cible[0], cible[1]));
  });

  /** Place le focus (et le curseur) sur la case i. */
  function allerA(i) {
    st.curseur = i;
    st.par.forEach((el, k) => { el.tabIndex = k === i ? 0 : -1; });
    st.par.get(i)?.focus();
  }

  /** Envoie un coup. Les cases restent désactivées jusqu'à la mise à jour de l'état (maj). */
  async function jouer(i) {
    st.envoi = true;
    st.provisoire = i;
    rendre();
    try {
      await duel.jouer(ctx.code, i);
      ctx.suivi?.rafraichir?.();
    } catch (err) {
      st.envoi = false;
      st.provisoire = null;
      toast(erreurTexte(err), 'error');
      rendre();
    }
  }

  /** Quand une manche vient de finir, garde sa grille finale affichée quelques secondes (ligne barrée, cases gagnantes
   *  qui brillent), puis bandeau, confettis et son après DELAI_FIN (le temps que la ligne se trace). */
  function suivreManche(e) {
    const h = e.partie.historique || [];
    if (st.nbManches === null) { st.nbManches = h.length; return; }
    if (h.length <= st.nbManches) return;
    st.nbManches = h.length;
    const d = h[h.length - 1];
    if (!d?.grille) return;
    st.recap = { manche: d.manche, grille: d.grille, petites: d.petites, ligne: d.ligne };
    st.glow = (d.ligne || []).map(Number);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => {
      st.recap = null;
      st.glow = null;
      if (st.tourEnAttente && st.etat) { st.tourEnAttente = false; debutTour(); marquerNom(st.etat); }
      if (st.vivant && st.etat) rendre();
    }, DUREE_RECAP);
    // Issue vue par moi : gagnant (son 2, confettis), perdant (son 3), nulle (son 4), spectateur (aucun son).
    const issue = !e.moi?.joue ? 'spectateur' : !d.gagnant ? 'nulle' : d.gagnant === e.moi.user_id ? 'gagnant' : 'perdant';
    clearTimeout(st.tCelebre);
    st.tCelebre = setTimeout(() => celebrer(e, d, issue), DELAI_FIN);
  }

  /** Fin de manche : son, bandeau « Manche gagnée ! » avec le score, confettis pour le gagnant (sauf mouvement réduit). */
  function celebrer(e, d, issue) {
    if (!st.vivant) return;
    const son = { gagnant: 2, perdant: 3, nulle: 4 }[issue];
    if (son) jouerSonJeu('morpion', son);
    const js = e.joueurs || [];
    const gagnant = js.find((j) => j.user_id === d.gagnant);
    const autre = js.find((j) => j.user_id !== d.gagnant);
    const plusieurs = Number(e.partie.format) > 1;
    let sous = '';
    if (gagnant) {
      sous = plusieurs
        ? `${esc(gagnant.pseudo || '?')} mène ${gagnant.manches ?? 0} – ${autre?.manches ?? 0}`
        : `${esc(gagnant.pseudo || '?')} gagne la manche`;
    } else if (plusieurs) {
      sous = `Score : ${js.find((j) => j.place === 1)?.manches ?? 0} – ${js.find((j) => j.place === 2)?.manches ?? 0}`;
    }
    bandeau(!d.gagnant ? 'Manche nulle' : issue === 'perdant' ? 'Manche perdue' : 'Manche gagnée !', sous);
    if (issue === 'gagnant' && motionAllowed()) confettis();
  }

  /** Bandeau de fin de manche sur la page : calque fixe, sans clic, retiré après 2,3 s. sous est déjà échappé. */
  function bandeau(titre, sous) {
    const b = document.createElement('div');
    b.className = 'morpion-bandeau';
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = `${esc(titre)}${sous ? `<small>${sous}</small>` : ''}`;
    document.body.append(b);
    st.fx.push(b);
    setTimeout(() => b.remove(), 2300);
  }

  /** Confettis : 70 petits rectangles qui tombent (durée et retard au total sous 3 s), retirés d'eux-mêmes. */
  function confettis() {
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.className = 'morpion-confetti';
      c.style.left = `${Math.random() * 100}vw`;
      c.style.background = COULEURS_CONFETTI[i % COULEURS_CONFETTI.length];
      c.style.animationDuration = `${(1.4 + Math.random()).toFixed(2)}s`;
      c.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
      document.body.append(c);
      st.fx.push(c);
      setTimeout(() => c.remove(), 3000);
    }
  }

  /** Mon tour commence : pulsation de mon nom et éclairage des cases libres, retirés après DUREE_TOUR. */
  function debutTour() {
    st.tourDebut = true;
    clearTimeout(st.tTour);
    st.tTour = setTimeout(finTour, DUREE_TOUR);
  }
  function finTour() {
    st.tourDebut = false;
    root.querySelectorAll('.morpion-tour-moi, .morpion-libre').forEach((el) => el.classList.remove('morpion-tour-moi', 'morpion-libre'));
  }
  /** Pulsation sur mon nom dans le cadre (le cadre redessine ses joueurs à chaque état : on l'ajoute après lui). */
  function marquerNom(e) {
    const i = (e.joueurs || []).findIndex((j) => j.user_id === e.moi?.user_id);
    root.querySelectorAll('.duels-face-j')[i]?.classList.add('morpion-tour-moi');
  }

  /** Statut sous la barre. Le spectateur garde le texte posé par le cadre. */
  function statut(e) {
    if (!e.moi?.joue || e.partie.statut !== 'en_cours') return;
    if (cadre.monTour(e)) { cadre.statut('À toi de jouer'); return; }
    const t = (e.joueurs || []).find((j) => j.user_id === e.partie.tour);
    if (t?.robot) cadre.statut('Le robot réfléchit…');
    else cadre.statut(`Au tour de ${t?.pseudo || 'ton adversaire'}`);
  }

  /** Fait défiler le plateau (gomoku sur téléphone) pour que la case jouée reste visible. */
  function defiler(i) {
    const d = cadre.plateau.querySelector('.morpion-defile');
    const c = cadre.plateau.querySelector(`[data-case="${i}"]`);
    if (!d || !c || d.scrollWidth <= d.clientWidth) return;
    const r = c.getBoundingClientRect();
    const dr = d.getBoundingClientRect();
    d.scrollLeft += (r.left + r.width / 2) - (dr.left + dr.width / 2);
  }

  /** Dessine le plateau : partie en cours, ou grille finale d'une manche qui vient de finir. */
  function rendre() {
    const e = st.etat;
    if (!e || !st.vivant) return;
    const p = e.partie;
    const v = REGLES[p.variante] ? p.variante : 'classique';
    const w = v === 'gomoku' ? (Number(p.w) || 15) : 3;
    const N = v === 'ultime' ? 81 : w * w;
    const recap = st.recap;

    const grilleTxt = recap ? recap.grille : p.grille;
    const petitesTxt = recap ? recap.petites : p.petites;
    const g = Array.from({ length: N }, (_, i) => grilleTxt?.[i] || '.');
    const petites = Array.from({ length: 9 }, (_, k) => petitesTxt?.[k] || '.');

    const parPlace = (n) => (e.joueurs || []).find((j) => j.place === n) || null;
    const nom1 = parPlace(1)?.pseudo || '?';
    const nom2 = parPlace(2)?.pseudo || '?';
    const nomDe = (c) => (c === '1' ? nom1 : nom2);

    const monTour = cadre.monTour(e);
    const peut = !recap && monTour && !st.envoi;
    const cible = v === 'ultime' && p.cible != null && p.cible >= 0 && p.cible <= 8 ? Number(p.cible) : null;
    const cibleOk = cible !== null && petites[cible] === '.';
    const jouable = (i) => {
      if (!peut || g[i] !== '.') return false;
      if (v !== 'ultime') return true;
      const k = Math.floor(i / 9);
      return petites[k] === '.' && (!cibleOk || k === cible);
    };

    const dernier = !recap && p.dernier && p.dernier.case != null ? Number(p.dernier.case) : -1;
    const cleDernier = `${p.id}:${p.manche}:${p.nb_coups}:${dernier}`;
    const masque = recap ? null : st.masque;
    const animer = !recap && masque === null && dernier >= 0 && cleDernier !== st.dernierVu;
    if (!recap && masque === null) st.dernierVu = cleDernier;
    const maMarque = String(e.moi?.place ?? '');
    // Son « marque posée » : une marque nouvelle à l'écran (la mienne dès le clic, celle du robot après son délai).
    const marques = new Set();
    for (let i = 0; i < N; i++) if (g[i] === '1' || g[i] === '2') marques.add(i);
    if (st.envoi && st.provisoire !== null && (maMarque === '1' || maMarque === '2')) marques.add(st.provisoire);
    if (masque !== null) marques.delete(masque);
    if (!recap) {
      if (st.affiche === null) st.affiche = marques;
      else {
        if ([...marques].some((i) => !st.affiche.has(i))) jouerSonJeu('morpion', SON_MARQUE);
        st.affiche = marques;
      }
    }
    // Cases gagnantes de la grille finale (manche qui vient de finir) : petites grilles en ultime, cases sinon.
    const brille = recap && st.glow ? new Set(st.glow) : null;

    /** Une case : marque (span) ou case vide (bouton). */
    const caseHtml = (i) => {
      const c = g[i];
      const estDernier = i === dernier;
      if (i === masque) return `<button type="button" class="morpion-case" data-case="${i}" aria-label="${esc(libelleCase(v, w, i))}" disabled></button>`;
      if (c === '.' && st.envoi && st.provisoire === i && (maMarque === '1' || maMarque === '2')) {
        return `<span class="morpion-case is-dernier" data-case="${i}" tabindex="-1" role="img" aria-label="${maMarque === '1' ? 'Croix' : 'Rond'} jouée">${svgMarque(maMarque, true)}</span>`;
      }
      if (c === '1' || c === '2') {
        const etiquette = `${c === '1' ? 'Croix' : 'Rond'} de ${nomDe(c)}`;
        const point = estDernier && v === 'gomoku' ? '<span class="morpion-point" aria-hidden="true"></span>' : '';
        const gl = v !== 'ultime' && brille?.has(i) ? ' morpion-gagnante' : '';
        return `<span class="morpion-case${estDernier ? ' is-dernier' : ''}${gl}" data-case="${i}" tabindex="-1" role="img" aria-label="${esc(etiquette)}">${svgMarque(c, estDernier && animer)}${point}</span>`;
      }
      const ok = jouable(i);
      const flash = ok && st.tourDebut ? ' morpion-libre' : '';
      return `<button type="button" class="morpion-case${flash}" data-case="${i}" aria-label="${esc(libelleCase(v, w, i))}"${ok ? '' : ' disabled'}></button>`;
    };

    /** Une petite grille de l'ultime, avec son voile si elle est gagnée ou nulle. */
    const petiteHtml = (k) => {
      const etat = petites[k];
      const classes = ['morpion-petite'];
      if (etat === '1' || etat === '2') classes.push('is-gagnee');
      if (etat === '=') classes.push('is-nulle');
      if (v === 'ultime' && brille?.has(k)) classes.push('morpion-gagnante');
      if (peut && cibleOk && k === cible) classes.push('is-cible');
      else if (peut && !cibleOk && etat === '.') classes.push('is-libre');
      let voile = '';
      if (etat === '1' || etat === '2') {
        voile = `<div class="morpion-voile is-${etat === '1' ? 'croix' : 'rond'}">${svgGrande(etat)}<span class="morpion-voile-txt">Gagnée par ${esc(nomDe(etat))}</span></div>`;
      } else if (etat === '=') {
        voile = '<div class="morpion-voile is-nulle"><span class="morpion-voile-txt">Nulle</span></div>';
      }
      const cases = Array.from({ length: 9 }, (_, pos) => caseHtml(k * 9 + pos)).join('');
      return `<div class="${classes.join(' ')}">${cases}${voile}</div>`;
    };

    // Consigne au-dessus du plateau (ultime : grille imposée).
    let consigne = '';
    if (recap) {
      consigne = `<p class="morpion-consigne">Manche ${esc(String(recap.manche))} terminée : grille finale.</p>`;
    } else if (v === 'ultime' && p.statut === 'en_cours') {
      if (monTour && cibleOk) consigne = `<p class="morpion-consigne" aria-live="polite"><strong>Tu dois jouer ici</strong> : grille ${cible + 1}, ${POS[cible]}.</p>`;
      else if (monTour) consigne = '<p class="morpion-consigne" aria-live="polite">Tu peux jouer dans n’importe quelle grille libre.</p>';
      else if (cibleOk) consigne = `<p class="morpion-consigne">Grille imposée : grille ${cible + 1}, ${POS[cible]}.</p>`;
    }

    // Légende : symboles selon la place (croix bleues = place 1, ronds dorés = place 2).
    const monPlace = e.moi?.joue ? e.moi.place : null;
    let legende;
    if (monPlace === 1) legende = `Toi : croix bleues · ${esc(nom2)} : ronds dorés`;
    else if (monPlace === 2) legende = `Toi : ronds dorés · ${esc(nom1)} : croix bleues`;
    else legende = `Croix bleues : ${esc(nom1)} · Ronds dorés : ${esc(nom2)}`;

    const note = v === 'classique' && Number(p.format) === 1
      ? '<p class="morpion-note">Le meilleur des 5 est conseillé : à deux bons joueurs, une manche finit souvent en nul.</p>'
      : '';

    const corps = v === 'ultime'
      ? `<div class="morpion-grand">${Array.from({ length: 9 }, (_, k) => petiteHtml(k)).join('')}</div>`
      : `<div class="morpion-grille" style="grid-template-columns: repeat(${w}, var(--mc))">${Array.from({ length: N }, (_, i) => caseHtml(i)).join('')}</div>`;

    // Cote : règle, et pour l'ultime les petites grilles gagnées par chacun.
    let cote = `<h2 class="duels-h3">Règle</h2><ol class="morpion-regle">${REGLES[v].map((t) => `<li>${esc(t)}</li>`).join('')}</ol>`;
    if (v === 'ultime') {
      const n1 = petites.filter((c) => c === '1').length;
      const n2 = petites.filter((c) => c === '2').length;
      cote += `<h2 class="duels-h3">Petites grilles</h2>
        <p class="morpion-score">${nomJoueur(parPlace(1))} : ${n1} grille${n1 > 1 ? 's' : ''} (croix)</p>
        <p class="morpion-score">${nomJoueur(parPlace(2))} : ${n2} grille${n2 > 1 ? 's' : ''} (ronds)</p>`;
    }
    cadre.cote.innerHTML = cote;

    // Garde le focus sur la case où il était (si elle est encore vide et jouable).
    const foc = cadre.plateau.contains(document.activeElement) ? document.activeElement.dataset?.case : undefined;
    cadre.plateau.innerHTML = `<div class="morpion-tab is-${v}">${consigne}<div class="morpion-defile"${v === 'gomoku' ? ' tabindex="0" role="region" aria-label="Plateau du gomoku, défilable"' : ''}><div class="morpion-cadre">${corps}<svg class="morpion-barre" hidden aria-hidden="true"></svg></div></div>
      <p class="morpion-legende">${legende}</p>${note}</div>`;
    // Forme de la grille affichée (ultime : 9 × 9 visuel, les petites grilles de 3 × 3 ; sinon w × w) et cases affichées.
    st.geo = v === 'ultime'
      ? { lignes: 9, colonnes: 9,
        versRC: (i) => [Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3), (Math.floor(i / 9) % 3) * 3 + (i % 9) % 3],
        versI: (r, c) => (Math.floor(r / 3) * 3 + Math.floor(c / 3)) * 9 + (r % 3) * 3 + (c % 3) }
      : { lignes: w, colonnes: w, versRC: (i) => [Math.floor(i / w), i % w], versI: (r, c) => r * w + c };
    st.par = new Map([...cadre.plateau.querySelectorAll('[data-case]')].map((el) => [Number(el.dataset.case), el]));
    const accessible = (i) => { const el = st.par.get(i); return !!el && !el.disabled; };
    // Une seule case dans l'ordre de tabulation : le curseur, ou la première case accessible.
    if (!accessible(st.curseur)) st.curseur = [...st.par.keys()].find(accessible) ?? 0;
    st.par.forEach((el, k) => { el.tabIndex = k === st.curseur ? 0 : -1; });
    if (foc !== undefined) {
      const el = st.par.get(Number(foc));
      if (el && !el.disabled) el.focus({ preventScroll: true });
    }

    const cadreEl = cadre.plateau.querySelector('.morpion-cadre');
    requestAnimationFrame(() => {
      if (!st.vivant) return;
      // Ultime : le serveur renvoie les petites grilles alignées (0-8) ; on barre de centre de grille à centre de grille.
      if (recap?.ligne?.length) tracerBarre(cadreEl, v === 'ultime' ? recap.ligne.map((k) => Number(k) * 9 + 4) : recap.ligne);
      if (animer) defiler(dernier);
    });
  }

  return {
    /** Met à jour la barre, le journal, le chat, le plateau, la colonne latérale et le statut. */
    maj(e) {
      vuEnCours(e.partie);
      st.etat = e;
      st.envoi = false;
      cadre.maj(e);
      suivreManche(e);
      // Mon tour commence (jamais au premier état reçu) ; pendant une grille finale, l'effet attend la fin de l'affichage.
      const monTour = cadre.monTour(e);
      if (st.tourAvant === false && monTour) {
        if (st.recap) st.tourEnAttente = true;
        else debutTour();
      }
      st.tourAvant = monTour;
      if (st.tourDebut) marquerNom(e);
      // Contre le robot, sa réponse arrive avec mon coup : on la montre 450 ms plus tard, pour voir les deux coups l'un après l'autre.
      const prov = st.provisoire;
      st.provisoire = null;
      const d = e.partie?.dernier?.case;
      if (prov !== null && d != null && Number(d) !== prov && !st.recap && e.partie?.grille?.[prov] === String(e.moi?.place)) {
        st.masque = Number(d);
        clearTimeout(st.tMasque);
        st.tMasque = setTimeout(() => { st.masque = null; if (st.vivant && st.etat) rendre(); }, 450);
      }
      rendre();
      statut(e);
    },
    /** Message du chat. */
    message(m) { cadre.message(m); },
    detruire() {
      st.vivant = false;
      clearTimeout(st.timer);
      clearTimeout(st.tMasque);
      clearTimeout(st.tCelebre);
      clearTimeout(st.tTour);
      st.fx.forEach((el) => el.remove());
      cadre.detruire();
    },
  };
}

/** MR1 : la ligne adverse se trace en rose sur la petite grille, de sa première à sa dernière case, et mes marques s'éteignent. */
function effetDefaite(root, e, ligne) {
  const mini = root.querySelector('.duels-fin-mini');
  if (!mini || !anime()) return;
  const a = mini.querySelector(`[data-c="${Math.min(...ligne)}"]`);
  const b = mini.querySelector(`[data-c="${Math.max(...ligne)}"]`);
  if (ligne.length && a && b) {
    const r = mini.getBoundingClientRect();
    const pos = (el) => { const c = el.getBoundingClientRect(); return [(c.left + c.width / 2 - r.left) / r.width * 100, (c.top + c.height / 2 - r.top) / r.height * 100]; };
    const [x1, y1] = pos(a).map((v) => v.toFixed(1));
    const [x2, y2] = pos(b).map((v) => v.toFixed(1));
    mini.insertAdjacentHTML('beforeend', `<svg class="fxd-trace" viewBox="0 0 100 100" aria-hidden="true"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"></line></svg>`);
    const trace = mini.lastElementChild;
    fxFin.plus(() => trace.remove(), DUREE_FIN);
  }
  const miennes = [...mini.querySelectorAll(`.duels-fin-marque[data-m="${Number(e.moi?.place)}"]`)];
  miennes.forEach((m) => m.classList.add('fxd-eteint', 'fxd-bris'));
  fxFin.rendre(miennes, ['fxd-eteint', 'fxd-bris'], DUREE_FIN);
}

/** MR2 : une vague parcourt la petite grille, qui s'éteint, puis un « = » s'y pose. */
function effetNulle(root) {
  const mini = root.querySelector('.duels-fin-mini');
  if (!mini || !anime()) return;
  const cases = [...mini.children].filter((c) => c.dataset.c !== undefined);
  const pas = Math.min(70, 630 / Math.max(1, cases.length)); // le gomoku a 225 cases : même durée totale
  cases.forEach((c, i) => { c.style.animationDelay = `${Math.round(i * pas)}ms`; c.classList.add('fxd-vague'); });
  fxFin.plus(() => cases.forEach((c) => c.classList.add('fxd-eteint')), 750);
  mini.insertAdjacentHTML('beforeend', '<span class="fxd-egal" aria-hidden="true">=</span>');
  const egal = mini.lastElementChild;
  fxFin.plus(() => egal.remove(), DUREE_FIN);
  fxFin.rendre(cases, ['fxd-vague', 'fxd-eteint'], DUREE_FIN);
}

/** Fin de duel vue en direct (appelé par vues/fin.js) : la dernière manche n'est plus jouée sur la table. Gagnant : son, lueur,
 *  bandeau « Duel gagné ! » et confettis. Perdant : MR1, S21 (son 3 du jeu). Nulle : MR2, S17. Spectateur : le gagnant brille. */
export function effetsFin(root, e) {
  const js = e.joueurs || [];
  const p = e.partie || {};
  const score = Number(p.format) > 1
    ? `Score final ${js.find((j) => j.place === 1)?.manches ?? 0} – ${js.find((j) => j.place === 2)?.manches ?? 0}` : 'Le duel est terminé';
  // son() n'est appelé que pour une fin vue en direct, une seule fois : il dit aussi si les effets de la grille doivent jouer.
  let vue = null;
  effetsFinDuel(root, e, {
    jeu: 'morpion',
    son: (issue) => { vue = issue; return { gagnant: 2, perdant: 3, nulle: 'S17' }[issue] || null; },
    titre: (issue) => (issue === 'gagnant' ? ['Duel gagné !', score] : null),
  });
  const d = (p.historique || [])[(p.historique || []).length - 1] || null;
  const quoi = p.variante === 'ultime' ? '3 grilles' : `${Number(p.n) || 3} marques`;
  if (vue === 'perdant') {
    const adv = js.find((j) => j.user_id !== e.moi?.user_id);
    const ligne = d?.gagnant === adv?.user_id ? (d?.ligne || []).map(Number) : [];
    effetDefaite(root, e, ligne);
    const nom = adv?.robot ? 'Le robot' : adv?.pseudo || 'Ton adversaire';
    fxFin.plus(() => fxFin.bandeau('Duel perdu', ligne.length ? `${nom} aligne ${quoi}` : score, { ton: 'd' }), DELAI_FIN);
  } else if (vue === 'nulle') {
    effetNulle(root);
    fxFin.plus(() => fxFin.bandeau('Match nul', d && !d.gagnant ? `Personne n’aligne ${quoi}` : score, { ton: 'n' }), 1000);
  }
}
