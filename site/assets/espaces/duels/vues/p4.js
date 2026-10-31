// ===== Humane Gang — Duels : table Puissance 4 (#partie/CODE, jeu p4) =====
/*
 * Rôle : dessine la grille (classique 7 × 6, grande 9 × 7, Pop Out) et la rangée de boutons de colonne au-dessus.
 * Ordinateur : un clic joue. Téléphone : toucher une colonne la sélectionne, puis « Valider la colonne N ».
 * Pop Out : bouton bascule « Retirer un jeton » / « Poser un jeton » ; en mode retrait, les colonnes où mon jeton est
 * au bas sont jouables (action 'retire').
 * Le jeton posé tombe (animation) quand un nouveau coup arrive, jamais à l'ouverture de la table.
 * Fin de manche : les 4 cases gagnantes de la manche qui vient de finir restent visibles et clignotent quelques
 * secondes, avant que la grille de la manche suivante n'apparaisse.
 * Manche nulle (P43) : la grille pleine reste visible le même temps, sans bloquer le coup suivant, avec S17 et un bandeau bref.
 * Les boutons de colonne sont créés une seule fois par partie (le focus clavier survit aux mises à jour).
 * Effets (classes et CSS dans ../p4.css ; sons « puissance-4 » de commun/sons-jeux.js) : son et rebond du jeton qui tombe
 *   (nouveau coup seulement), « à toi de jouer » (mon nom pulse, colonnes libres éclairées), son « colonne choisie » et
 *   « Valider » qui pulse sur téléphone, ligne gagnante qui brille ; à la victoire d'une manche, bandeau « Manche gagnée ! »
 *   et confettis pour le gagnant. Fin de duel : effetsFin, appelé par vues/fin.js (la table n'est plus affichée à ce moment) :
 *   P41, défaite : la ligne adverse brille, mes jetons tombent de la petite grille puis y reviennent, S16 ; P42, nulle : vague, S17.
 *   Mouvement réduit ou préférence « effets » coupée (motionAllowed) : pas d'animation, les sons restent.
 * Contrat : export function creer(root, ctx) → { maj(etat), message(msg), detruire() } (vues/partie.js).
 * Lecture de la grille : texte ligne par ligne, ligne 0 en haut ; '1' = jeton de la place 1 (rouge), '2' = place 2 (jaune).
 * Dépendances : core.js (toast, motionAllowed), ../api.js (duel, erreurTexte), ./commun.js (creerCadre, nomJoueur),
 *   ../../../commun/grille-clavier.js (voisinGrille), ../../../commun/sons-jeux.js (jouerSonJeu),
 *   ../../../commun/effets-duels.js (anime, son), ./fin-fx.js (effetsFinDuel, fxFin).
 * Exporte : creer, effetsFin.
 */
import { toast, motionAllowed } from '../../../commun/core.js';
import { duel, erreurTexte } from '../api.js';
import { creerCadre, nomJoueur } from './commun.js';
import { voisinGrille } from '../../../commun/grille-clavier.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { anime, son } from '../../../commun/effets-duels.js';
import { effetsFinDuel, fxFin } from './fin-fx.js';

/** Couleur des jetons par place, et leur nom affiché dans la légende. */
const COULEUR = { 1: '#D93A3F', 2: '#F2B705' };
const NOM = { 1: 'rouge', 2: 'jaune' };
/** Durée d'affichage de la grille de la manche qui vient de finir (ms). */
const DUREE_MANCHE = 2600;
/** Durée pendant laquelle on attend l'état après un envoi réussi (ms), au cas où le temps réel tarde. */
const DUREE_ATTENTE = 5000;

/** Vrai sur ordinateur (souris, pointeur fin) : un clic joue directement. */
const ordinateur = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
/** Délai du bandeau et des confettis après le tracé de la ligne gagnante (ms). */
const DELAI_BANDEAU = 450;
const COULEURS_CONF = ['#D93A3F', '#F2B705', '#E2C77E', '#159946', '#2B5AE2', '#4E2398'];

/** Ajoute une classe d'effet à un élément pendant quelques secondes (sans effet si l'élément n'existe plus). */
function flash(el, classe, ms) {
  if (!el) return;
  el.classList.add(classe);
  setTimeout(() => el.classList.remove(classe), ms);
}
/** Bandeau fixe au milieu de la page (sans clic, retiré après 2,3 s ou en quittant le duel). Textes fixes, sans saisie. */
function bandeau(titre, sous) {
  const b = document.createElement('div');
  b.className = 'duels-p4-bandeau';
  b.append(titre);
  const s = document.createElement('small');
  s.textContent = sous;
  b.append(s);
  fxFin.vol(b, 2300);
}
/** Confettis : 70 petits rectangles qui tombent (calque fixe, retirés après 4 s). */
function confettis() {
  for (let i = 0; i < 70; i++) {
    const d = document.createElement('i');
    d.className = 'duels-p4-conf';
    d.style.left = `${Math.random() * 100}vw`;
    d.style.background = COULEURS_CONF[i % COULEURS_CONF.length];
    d.style.animationDuration = `${1.6 + Math.random() * 1.6}s`;
    d.style.animationDelay = `${Math.random() * 0.5}s`;
    fxFin.vol(d, 4000);
  }
}

/**
 * Monte la table Puissance 4 dans root.
 * @param {HTMLElement} root conteneur de la vue (vidé par le cadre commun).
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj: Function, message: Function, detruire: Function}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-p4' });
  cadre.plateau.innerHTML = `
    <div class="duels-p4-jeu" data-jeu>
      <div class="duels-p4-rangee" data-rangee></div>
      <div class="duels-p4-cadre" data-grille></div>
    </div>
    <p class="duels-p4-legende" data-legende></p>
    <div class="duels-p4-actions" data-actions></div>`;
  const q = (s) => cadre.plateau.querySelector(s);
  const el = { rangee: q('[data-rangee]'), grille: q('[data-grille]'), legende: q('[data-legende]'), actions: q('[data-actions]') };

  const st = {
    etat: null, w: 0, h: 0, cases: [], boutons: [],
    version: null, nbHist: null, choix: null, mode: 'pose', regle: false, curseur: 0,
    envoi: false, attente: false, overlay: null, chute: null, timers: [],
    monTourAvant: false, apres: null, grilleVue: null,
  };

  /** Grille texte complétée à w × h (une case vide par défaut). */
  const cases = (g) => { const n = st.w * st.h; return String(g || '').padEnd(n, '.').slice(0, n); };

  /** Crée les cases et les boutons de colonne pour une grille w × h (une fois par partie). */
  function construire(w, h) {
    st.w = w; st.h = h;
    const colonnes = `repeat(${w}, minmax(0, 1fr))`;
    el.grille.style.gridTemplateColumns = colonnes;
    el.rangee.style.gridTemplateColumns = colonnes;
    el.grille.setAttribute('role', 'img');
    el.grille.setAttribute('aria-label', `Grille de ${w} colonnes sur ${h}`);
    el.grille.innerHTML = Array.from({ length: w * h }, () => '<span class="duels-p4-case"></span>').join('');
    el.rangee.innerHTML = Array.from({ length: w }, (_, c) =>
      `<button type="button" class="duels-p4-colonne" data-col="${c}" aria-label="Colonne ${c + 1}"><span class="duels-p4-fantome" aria-hidden="true"></span></button>`).join('');
    st.cases = [...el.grille.children];
    st.boutons = [...el.rangee.children];
  }

  /** Grille de la manche finie qui bloque les coups (celle d'une manche nulle les laisse libres). */
  const bloquee = () => !!st.overlay && !st.overlay.libre;

  /** Vrai si je peux jouer dans cette colonne maintenant (tour, pas d'envoi en cours, colonne libre ou mon jeton du bas). */
  function peutJouer(c) {
    const e = st.etat;
    if (!e || !cadre.monTour(e) || st.envoi || st.attente || bloquee()) return false;
    const g = cases(e.partie.grille);
    if (st.mode === 'retire' && e.partie.variante === 'popout') return g[(st.h - 1) * st.w + c] === String(e.moi.place);
    return g[c] === '.';
  }

  /** Envoie le coup (pose, ou retrait en Pop Out) puis relit l'état. */
  async function jouer(c) {
    if (!peutJouer(c)) return;
    const action = st.mode === 'retire' && st.etat.partie.variante === 'popout' ? 'retire' : 'pose';
    st.overlay = null; // grille d'une manche nulle encore affichée : le coup la remplace
    st.envoi = true; st.choix = null; peindre();
    try {
      await duel.jouer(ctx.code, c, action);
      st.attente = true;
      st.timers.push(setTimeout(() => { st.attente = false; peindre(); }, DUREE_ATTENTE));
    } catch (err) {
      toast(erreurTexte(err), 'error');
    } finally {
      st.envoi = false;
      ctx.suivi?.rafraichir();
      peindre();
    }
  }

  /** Clic sur une colonne : joue (ordinateur) ou sélectionne (téléphone). */
  function surColonne(c) {
    if (!peutJouer(c)) return;
    if (ordinateur()) { jouer(c); return; }
    st.choix = c;
    peindre();
    fxChoix(c);
  }

  /** Téléphone : colonne choisie (son « colonne choisie », colonne et bouton « Valider » qui s'éclairent). */
  function fxChoix(c) {
    jouerSonJeu('puissance-4', 2);
    if (!motionAllowed()) return;
    flash(st.boutons[c], 'is-libre-fx', 3000);
    flash(el.actions.querySelector('[data-valider]'), 'is-joue-fx', 4000);
  }

  /** « À toi de jouer » : mon nom pulse et les colonnes libres s'éclairent (le son et le titre sont dans le cadre commun). */
  function fxAtoi() {
    if (!motionAllowed()) return;
    flash(root.querySelector('.duels-face-j.is-tour'), 'is-a-toi-fx', 5000);
    st.boutons.forEach((b) => { if (!b.disabled) flash(b, 'is-libre-fx', 4000); });
  }

  /** Case où tombera le jeton posé (au-dessus de la pile), pour l'animation de chute. */
  function trouverChute(c, grille) {
    const g = cases(grille);
    for (let r = 0; r < st.h; r++) {
      const i = r * st.w + c;
      if (g[i] !== '.') return { i, rang: r + 1 };
    }
    return null;
  }

  /** Pose la grille d'une manche finie par-dessus celle du jeu, pendant quelques secondes. */
  function poserOverlay(o) {
    st.overlay = o;
    st.timers.push(setTimeout(() => {
      if (st.overlay !== o) return;
      st.overlay = null;
      peindre();
      if (st.etat) statut(st.etat);
    }, DUREE_MANCHE));
  }

  /** P43 : manche nulle, pas de ligne à montrer. La grille pleine reste visible sans bloquer le coup suivant, S17 pour les joueurs, bandeau bref. */
  function mancheNulle(d, e) {
    poserOverlay({ grille: d.grille, gagnantes: new Set(), texte: '', libre: true, jeu: cases(e.partie.grille) });
    if (e.moi?.joue) son('S17');
    const js = e.joueurs || [];
    const score = Number(e.partie.format) > 1 ? `Score : ${js.find((j) => j.place === 1)?.manches ?? 0} – ${js.find((j) => j.place === 2)?.manches ?? 0}` : '';
    fxFin.bandeau('Manche nulle', score, { ton: 'n' });
  }

  /** Affiche la grille de la manche qui vient de finir, cases gagnantes en évidence, pendant quelques secondes. */
  function montrerManche(d, e) {
    const moiId = e.moi?.user_id;
    if (d?.grille && !d.gagnant && !d.ligne?.length) { mancheNulle(d, e); return; }
    if (!d?.ligne?.length || !d.grille) return;
    poserOverlay({ grille: d.grille, gagnantes: new Set(d.ligne), texte: `Manche ${d.manche} terminée.` });
    // Effets, une fois la grille dessinée : la ligne brille et le son « ligne alignée » joue pour tous ;
    // le gagnant a en plus le bandeau « Manche gagnée ! », la victoire et les confettis.
    jouerSonJeu('puissance-4', 4);
    st.apres = () => {
      const permis = motionAllowed();
      if (permis) d.ligne.forEach((i) => flash(st.cases[i], 'is-ligne-fx', 3800));
      if (d.gagnant && d.gagnant === moiId) {
        st.timers.push(setTimeout(() => {
          jouerSonJeu('puissance-4', 3);
          if (permis) { bandeau('Manche gagnée !', `${d.ligne.length} jetons alignés`); confettis(); }
        }, DELAI_BANDEAU));
      }
    };
  }

  /** Dessine les cases, les boutons de colonne, la légende et les boutons du bas (sans recréer les boutons). */
  function peindre() {
    const e = st.etat;
    if (!e || !st.cases.length) return;
    const p = e.partie;
    const joue = !!e.moi?.joue;
    const place = joue ? e.moi.place : null;
    const enCours = p.statut === 'en_cours';
    const popout = p.variante === 'popout';
    const g = cases(st.overlay ? st.overlay.grille : p.grille);
    const gagnantes = st.overlay ? st.overlay.gagnantes : new Set();

    st.cases.forEach((cel, i) => {
      const ch = g[i] === '1' || g[i] === '2' ? g[i] : '';
      if (cel.dataset.j !== ch) {
        cel.dataset.j = ch;
        const rang = st.chute && st.chute.i === i ? st.chute.rang : 0;
        // data-j : le jeton porte aussi une forme (point pour le rouge, anneau pour le jaune), pas seulement sa couleur.
        cel.innerHTML = ch ? `<i class="duels-p4-jeton${rang ? ' is-chute' : ''}" data-j="${ch}" style="--p4-jeton:${COULEUR[ch]};--rang:${rang}"></i>` : '';
      }
      cel.classList.toggle('is-gagnante', gagnantes.has(i));
    });

    el.rangee.hidden = !joue;
    const bloque = st.envoi || st.attente || bloquee() || !enCours;
    const monTour = joue && cadre.monTour(e);
    // Colonnes libres : celles du vrai jeu, même quand la grille pleine d'une manche nulle reste affichée.
    const gj = st.overlay?.libre ? cases(p.grille) : g;
    const retirer = st.mode === 'retire' && popout;
    const mien = place ? String(place) : null;
    const surOrdi = ordinateur();
    st.boutons.forEach((b, c) => {
      const libre = retirer ? (mien !== null && gj[(st.h - 1) * st.w + c] === mien) : gj[c] === '.';
      b.disabled = bloque || !monTour || !libre;
      if (place) b.style.setProperty('--p4-jeton', COULEUR[place]);
      if (surOrdi) b.removeAttribute('aria-pressed');
      else b.setAttribute('aria-pressed', String(st.choix === c));
    });
    // Une seule colonne dans l'ordre de tabulation (roving tabindex) : la colonne courante, ou la première jouable.
    if (st.boutons[st.curseur]?.disabled) {
      const premiere = st.boutons.findIndex((b) => !b.disabled);
      if (premiere >= 0) st.curseur = premiere;
    }
    st.boutons.forEach((b, c) => { b.tabIndex = c === st.curseur ? 0 : -1; });

    const js = e.joueurs || [];
    const legende = (pl) => {
      const j = js.find((x) => x.place === pl);
      const nom = joue && place === pl ? 'Toi' : nomJoueur(j);
      return `<span class="duels-p4-pastille" style="--p4-jeton:${COULEUR[pl]}" aria-hidden="true"></span><span>${nom} : ${NOM[pl]}</span>`;
    };
    el.legende.innerHTML = `${legende(1)}<span aria-hidden="true">·</span>${legende(2)}`;

    let actions = '';
    if (joue && enCours && popout) {
      actions += `<button type="button" class="btn btn-ghost duels-p4-mode" data-mode>${st.mode === 'pose' ? 'Retirer un jeton' : 'Poser un jeton'}</button>`;
    }
    if (joue && enCours && !surOrdi && st.choix !== null) {
      actions += `<button type="button" class="btn btn-primary duels-p4-valider" data-valider${peutJouer(st.choix) ? '' : ' disabled'}>Valider la colonne ${st.choix + 1}</button>`;
    }
    if (actions !== el.actions.dataset.k) {
      el.actions.dataset.k = actions;
      el.actions.innerHTML = actions;
    }
  }

  /** Statut sous la barre : à moi, au tour de l'autre, ou le robot. */
  function statut(e) {
    if (!e.moi?.joue) return;
    if (bloquee()) { cadre.statut(st.overlay.texte); return; }
    if (e.partie.statut !== 'en_cours') { cadre.statut(''); return; }
    if (cadre.monTour(e)) { cadre.statut('À toi de jouer'); return; }
    const adv = cadre.adversaire(e);
    cadre.statut(adv?.robot ? 'Le robot réfléchit…' : `Au tour de ${adv?.pseudo || 'ton adversaire'}`);
  }

  // Clics délégués sur la table : colonne, valider, bascule Pop Out.
  cadre.plateau.addEventListener('click', (ev) => {
    const col = ev.target.closest('[data-col]');
    if (col) { if (!col.disabled) surColonne(Number(col.dataset.col)); return; }
    if (ev.target.closest('[data-valider]')) { if (st.choix !== null) jouer(st.choix); return; }
    if (ev.target.closest('[data-mode]')) {
      st.mode = st.mode === 'pose' ? 'retire' : 'pose';
      st.choix = null;
      peindre();
    }
  });

  // Clavier : flèches gauche et droite entre les colonnes jouables (Début et Fin aussi), Entrée ou Espace jouent ou
  // sélectionnent la colonne (boutons natifs). Échap annule la colonne choisie sur téléphone.
  cadre.plateau.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && st.choix !== null) { ev.preventDefault(); st.choix = null; peindre(); return; }
    const col = ev.target.closest?.('[data-col]');
    if (!col) return;
    const cible = voisinGrille(ev.key, 0, Number(col.dataset.col), 1, st.w, (_, k) => !st.boutons[k]?.disabled);
    if (!cible) return;
    ev.preventDefault();
    st.curseur = cible[1];
    st.boutons[cible[1]].focus();
    peindre();
  });

  return {
    /** Met à jour la table avec l'état du duel (cadre commun, grille, boutons, légende, statut). */
    maj(e) {
      const p = e.partie;
      if (p.w !== st.w || p.h !== st.h) construire(p.w, p.h);
      st.etat = e;
      st.attente = false;
      cadre.maj(e);

      if (!st.regle) {
        st.regle = true;
        cadre.cote.innerHTML = `<h2 class="duels-h3">Grille</h2>
          <p class="duels-p4-regle">${p.w} × ${p.h} : aligne ${p.n} jetons pour gagner.</p>
          ${p.variante === 'popout' ? '<p class="duels-p4-regle">Pop Out : tu peux aussi retirer ton jeton du bas d’une colonne.</p>' : ''}`;
      }

      // Un coup joué depuis la fin d'une manche nulle : la vraie grille reprend sa place.
      if (st.overlay?.libre && st.overlay.jeu !== cases(p.grille)) st.overlay = null;
      const historique = p.historique || [];
      if (st.nbHist !== null && historique.length > st.nbHist) montrerManche(historique[historique.length - 1], e);
      st.nbHist = historique.length;

      // Nouveau coup : la version a changé et la grille aussi (jamais au premier état reçu). Sert à la chute et au son.
      const nouveau = st.version !== null && p.version !== st.version;
      const grilleTxt = cases(p.grille);
      const coup = nouveau && st.grilleVue !== null && st.grilleVue !== grilleTxt;
      st.grilleVue = grilleTxt;
      // Chute du dernier jeton : seulement si c'est un nouveau coup posé (pas à l'ouverture, pas pendant l'affichage d'une manche).
      st.chute = null;
      if (coup && p.dernier && p.dernier.action !== 'retire' && !st.overlay) {
        st.chute = trouverChute(p.dernier.case, p.grille);
        if (st.chute) jouerSonJeu('puissance-4', 1);
      }
      // Mon tour vient de commencer (passage de « pas mon tour » à « mon tour » sur un nouveau coup).
      const debutTour = nouveau && cadre.monTour(e) && !st.monTourAvant;
      st.monTourAvant = cadre.monTour(e);
      st.version = p.version;

      if (!cadre.monTour(e)) st.choix = null;
      peindre();
      if (st.apres) { const apres = st.apres; st.apres = null; apres(); }
      if (debutTour) fxAtoi();
      statut(e);
      st.chute = null;
    },
    message(m) { cadre.message(m); },
    detruire() {
      st.timers.forEach((t) => clearTimeout(t));
      cadre.detruire();
    },
  };
}

/** Temps de la chute de mes jetons, décalage compris, avant leur retour dans la dernière grille (ms). */
const DUREE_CHUTE = 1600;
/** Décalage d'un jeton dans les effets de fin : les jetons partent en ordre dispersé, en moins d'une demi-seconde. */
const decalage = (i) => `${(i * 37) % 500}ms`;

/**
 * Effets de fin de duel, appelés par vues/fin.js une fois l'écran de fin dessiné, pour une partie vue en cours dans cette page
 * (pas à l'ouverture d'un duel déjà terminé). Le gagnant brille. Gagnant et spectateur : son « fin de duel », bandeau et confettis
 * pour le gagnant. Perdant (P41) : la ligne adverse brille, mes jetons tombent de la grille, S16, bandeau sobre.
 * Nulle (P42) : vague sur les jetons, S17, bandeau neutre. Mouvement réduit : la grille reste telle quelle, les sons restent.
 * @param {HTMLElement} root écran de fin.
 * @param {object} e état terminé du duel.
 */
export function effetsFin(root, e) {
  const p = e.partie || {};
  const js = e.joueurs || [];
  // son() n'est appelé que pour une fin vue en direct, une seule fois : il dit aussi si les effets de la grille doivent jouer.
  let vue = null;
  effetsFinDuel(root, e, {
    jeu: 'puissance-4',
    son: (issue) => { vue = issue; return { perdant: 'S16', nulle: 'S17' }[issue] || 5; },
    titre: (issue) => (issue === 'gagnant' ? ['Duel gagné !', 'Le duel est terminé'] : null),
  });
  if (vue !== 'perdant' && vue !== 'nulle') return;
  const mini = anime() ? root.querySelector('.duels-fin-mini') : null;
  const d = (p.historique || [])[(p.historique || []).length - 1] || null;
  const score = `Score final ${js.find((j) => j.place === 1)?.manches ?? 0} – ${js.find((j) => j.place === 2)?.manches ?? 0}`;
  if (vue === 'perdant') {
    const adv = js.find((j) => j.user_id !== e.moi?.user_id);
    const ligne = d?.gagnant === adv?.user_id && d?.ligne?.length;
    mini?.querySelectorAll('.duels-fin-case.is-gagnante').forEach((c) => c.classList.add('fxd-brille'));
    const miens = [...(mini?.querySelectorAll(`.duels-fin-jeton[data-j="${Number(e.moi?.place)}"]`) || [])];
    miens.forEach((j, i) => { j.style.animationDelay = decalage(i); j.classList.add('fxd-chute'); });
    fxFin.rendre(miens, ['fxd-chute'], DUREE_CHUTE); // la dernière grille reste juste : mes jetons y reviennent
    const nom = adv?.robot ? 'Le robot' : adv?.pseudo || 'Ton adversaire';
    fxFin.plus(() => fxFin.bandeau('Duel perdu', ligne ? `${nom} aligne ${d.ligne.length} jetons` : score, { ton: 'd' }), 300);
  } else {
    mini?.querySelectorAll('.duels-fin-jeton').forEach((j, i) => { j.style.animationDelay = decalage(i); j.classList.add('fxd-vague'); });
    const pleine = d && !d.gagnant && !String(d.grille || '').includes('.');
    fxFin.plus(() => fxFin.bandeau('Match nul', pleine ? 'Grille pleine' : score, { ton: 'n' }), 600);
  }
}
