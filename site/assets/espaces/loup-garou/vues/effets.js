// ===== Humane Gang — Loup-Garou : effets visuels et sonores des moments de la partie =====
/*
 * Rôle : animations ajoutées aux écrans de partie, déclenchées par les VRAIS changements de l'état (jamais à l'ouverture
 * de la page) :
 *   - passage nuit / jour : ciel, lune ou soleil, titre ; à l'aube la victime tremble et sa carte se retourne au-dessus de son siège
 *     (morts de la nuit, causes CAUSES_NUIT : le titre ne dit ni la cause ni le rôle) ;
 *   - votes : chaque nouveau vote vole en jeton vers le joueur visé avec un compteur, puis tampon « Éliminé » si éliminé ;
 *   - résultat de la voyante : carte retournée au-dessus du siège sondé (écran de la voyante seulement, son état seul) ;
 *   - révélation du rôle en grande carte (écran de révélation, appel grandeCarte) ;
 *   - à toi d'agir : le siège et le panneau sont mis en évidence (l'anneau et la pastille sont posés par table.js).
 * Les sons viennent de commun/sons-jeux.js (id « loup-garou »). Mouvement réduit ou effets coupés (motionAllowed) :
 * aucune animation, les sons restent. Chaque effet a un calque en pointer-events:none ; les minuteurs et les éléments
 * ajoutés au corps de page sont annulés et retirés à arreter().
 * Dépendances : commun/core.js (motionAllowed), commun/sons-jeux.js, roles.js (roleById, ROLES), ui.js (estNuit), actions.js (doitAgir, comptesVote).
 * Exporte : creerEffets, changements.
 */
import { motionAllowed } from '../../../commun/core.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { roleById, ROLES } from '../roles.js';
import { estNuit } from '../ui.js';
import { doitAgir } from './actions.js';

const JEU = 'loup-garou';

/** Morts de la nuit (hg_lg__tuer, migration 119) ; vote, chasseur et meneur n'en sont pas. */
const CAUSES_NUIT = ['loups', 'poison', 'loup_blanc', 'chagrin'];

/** Vrai si les animations sont permises (préférence « effets » et pas de mouvement réduit). */
const anime = () => motionAllowed();

/** Élément HTML avec classe et texte (jamais de HTML venu des données). */
function elt(tag, cls, texte) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (texte != null) d.textContent = texte;
  return d;
}

/** Poids d'un vote : le Capitaine compte double (comme comptesVote). */
const poidsDe = (e, uid) => ((e?.joueurs || []).find((j) => j.user_id === uid)?.capitaine ? 2 : 1);

/**
 * Ce qui a changé entre deux états consécutifs (fonction pure, sans effet de bord).
 * @param {object|null} avant état précédent (même partie)
 * @param {object} e état actuel
 * @returns {{nuit: boolean|null, victimes: Array, votes: Array, elimines: string[], atoi: boolean, sonde: object|null}}
 */
export function changements(avant, e) {
  const c = { nuit: null, victimes: [], votes: [], elimines: [], atoi: false, sonde: null };
  const pa = avant?.partie;
  const pn = e?.partie;
  if (!pa || !pn || pa.id !== pn.id) return c;

  // Nuit ↔ jour (le passage « revelation → nuit » ne compte pas : les deux sont nuit).
  if (pn.statut === 'en_cours' && estNuit(pa) !== estNuit(pn)) {
    c.nuit = estNuit(pn);
    if (!c.nuit) {
      c.victimes = (e.joueurs || [])
        .filter((j) => !j.vivant && j.mort_manche === pn.manche && CAUSES_NUIT.includes(j.mort_cause))
        .map((j) => ({ uid: j.user_id, pseudo: j.pseudo, role: j.role }));
    }
  }

  // Votes nouveaux ou changés (dernier vote de chacun, manche courante).
  const memeManche = pa.manche === pn.manche;
  const anciens = new Map();
  if (memeManche) for (const v of avant.votes || []) if (v.manche == pn.manche) anciens.set(v.de, v.pour);
  const derniers = new Map();
  for (const v of e.votes || []) if (v.manche == pn.manche) derniers.set(v.de, v.pour);
  for (const [de, pour] of derniers) {
    if (pour && anciens.get(de) !== pour) {
      c.votes.push({ de, pour, poids: poidsDe(e, de), couleur: couleurDe(e, de) });
    }
  }

  // Éliminés par le vote (vivants avant, morts maintenant).
  for (const j of e.joueurs || []) {
    const a = (avant.joueurs || []).find((x) => x.user_id === j.user_id);
    if (a?.vivant && !j.vivant && j.mort_cause === 'vote') c.elimines.push(j.user_id);
  }

  // À toi d'agir : il vient de commencer.
  c.atoi = doitAgir(e) && !doitAgir(avant);

  // Voyante : son action vient d'être faite, le résultat est dans son journal privé.
  const aAvant = avant.moi?.action;
  const aMaint = e.moi?.action;
  if (aMaint?.type === 'sonder' && aMaint.fait && aMaint.cible && !(aAvant?.type === 'sonder' && aAvant.fait)) {
    const ligne = (e.journal || []).filter((j) => j.type === 'prive' && j.manche == pn.manche
      && /^Nuit \d+ : .+ est [^.]+\.$/.test(j.texte || '')).pop();
    const nomRole = ligne ? ligne.texte.match(/ est ([^.]+)\.$/)[1] : 'Inconnu';
    const r = ROLES.find((x) => x.nom.toLowerCase() === nomRole.toLowerCase());
    c.sonde = { uid: aMaint.cible, nom: r ? r.nom : nomRole, image: r?.image || '' };
  }
  return c;
}

/** Couleur du jeton d'un votant (profil ; invité : gris). */
function couleurDe(e, uid) {
  const j = (e?.joueurs || []).find((x) => x.user_id === uid);
  if (j?.invite) return '#9A968F';
  return /^#[0-9a-f]{6}$/i.test(j?.couleur || '') ? j.couleur : '#888888';
}

/** Contenu d'une carte retournée : dos et face (vignette du rôle + nom). */
function faces(nom, image) {
  const dos = elt('i', 'lg-fx-dos');
  const face = elt('i', 'lg-fx-face');
  if (image) {
    const im = elt('img');
    im.src = image;
    im.alt = '';
    face.append(im);
  }
  face.append(elt('span', '', nom));
  return [dos, face];
}

/**
 * Crée les effets d'un écran.
 * @param {object} [o]
 * @param {HTMLElement} [o.calque] calque en pointer-events:none posé au-dessus de la table (cartes, jetons, tampons).
 * @param {HTMLElement} [o.racine] élément qui contient les sièges (data-uid).
 * @param {HTMLElement} [o.panneau] zone du panneau d'action (surlignage « à toi »).
 * @returns {{appliquer: Function, grandeCarte: Function, arreter: Function}}
 */
export function creerEffets({ calque = null, racine = null, panneau = null } = {}) {
  const minuteurs = new Set();
  const vivants = new Set();   // éléments ajoutés au corps de page ou au calque, à retirer à l'arrêt

  const plus = (fn, ms) => {
    const id = setTimeout(() => { minuteurs.delete(id); fn(); }, ms);
    minuteurs.add(id);
    return id;
  };
  const son = (n, ms = 0) => plus(() => jouerSonJeu(JEU, n), ms);
  const ajouter = (parent, el) => { parent.append(el); vivants.add(el); return el; };
  const retirerApres = (el, ms) => plus(() => { el.remove(); vivants.delete(el); }, ms);
  const siege = (uid) => (racine && uid ? racine.querySelector(`[data-uid="${CSS.escape(uid)}"]`) : null);

  /** Centre de l'avatar d'un siège, en coordonnées du calque. */
  function centre(seat) {
    const av = seat.querySelector('.lg-siege-av') || seat;
    const r = av.getBoundingClientRect();
    const c = calque.getBoundingClientRect();
    return { x: r.left - c.left + r.width / 2, y: r.top - c.top + r.height / 2, h: r.height };
  }

  /** Voile nuit ou aube (ciel, astre, titre), après un délai. */
  function voile(nuit, titre, sous, delai) {
    plus(() => {
      if (!anime()) return;
      const v = ajouter(document.body, elt('div', `lg-fx-voile ${nuit ? 'lg-fx-nuit' : 'lg-fx-aube'}`));
      retirerApres(v, 3100);
      const astre = ajouter(document.body, elt('div', `lg-fx-astre ${nuit ? 'lg-fx-lune' : 'lg-fx-soleil'}`));
      retirerApres(astre, 3100);
      const t = elt('div', 'lg-fx-titre', titre);
      t.append(elt('small', '', sous));
      ajouter(document.body, t);
      retirerApres(t, 2600);
    }, delai);
  }

  /** Secoue un siège (la victime tremble). */
  function tremble(seat, delai) {
    plus(() => {
      if (!seat || !anime()) return;
      seat.classList.add('lg-fx-tremble');
      plus(() => seat.classList.remove('lg-fx-tremble'), 1100);
    }, delai);
  }

  /** Anneau rouge qui s'élargit autour d'un siège. */
  function onde(seat, delai) {
    plus(() => {
      if (!calque || !seat || !anime()) return;
      const c = centre(seat);
      const o = ajouter(calque, elt('div', 'lg-fx-onde'));
      o.style.left = c.x + 'px';
      o.style.top = c.y + 'px';
      retirerApres(o, 900);
    }, delai);
  }

  /** Carte de rôle retournée au-dessus d'un siège (son « carte retournée » au retournement). */
  function carteSurSiege(seat, nom, image, delai) {
    son(5, delai + 450);
    plus(() => {
      if (!calque || !seat || !anime()) return;
      const c = centre(seat);
      const k = ajouter(calque, elt('div', 'lg-fx-carte'));
      k.style.left = c.x + 'px';
      k.style.top = (c.y - c.h / 2 - 34) + 'px';
      k.append(...faces(nom, image));
      plus(() => k.classList.add('lg-fx-tourne'), 450);
      plus(() => k.classList.add('lg-fx-part'), 2600);
      retirerApres(k, 3400);
    }, delai);
  }

  /** Tampon « Éliminé » sur un siège. */
  function tampon(seat, delai) {
    plus(() => {
      if (!calque || !seat || !anime()) return;
      const c = centre(seat);
      const s = ajouter(calque, elt('div', 'lg-fx-tampon', 'ÉLIMINÉ'));
      s.style.left = c.x + 'px';
      s.style.top = c.y + 'px';
      retirerApres(s, 2200);
    }, delai);
  }

  /**
   * Votes nouveaux pour une même cible : un jeton par vote vole du votant vers la cible, compteur qui monte.
   * Renvoie l'instant (ms, depuis maintenant) où la séquence est finie.
   */
  function votes(cible, groupe, debut, departTotal, eliminee) {
    const dest = siege(cible);
    let compte = null;
    let total = departTotal;
    if (calque && dest && anime()) {
      const c = centre(dest);
      compte = ajouter(calque, elt('div', 'lg-fx-compte', String(total)));
      compte.style.left = (c.x + 30) + 'px';
      compte.style.top = (c.y - 26) + 'px';
    }
    let fin = debut;
    groupe.forEach((v, i) => {
      const depart = debut + i * 650;
      const arrivee = depart + 720;
      plus(() => {
        const origine = siege(v.de);
        if (!calque || !origine || !dest || !anime()) return;
        const o = centre(origine);
        const d = centre(dest);
        const j = ajouter(calque, elt('span', 'lg-fx-jeton'));
        j.style.background = v.couleur;
        j.style.left = (o.x - 13) + 'px';
        j.style.top = (o.y - 13) + 'px';
        requestAnimationFrame(() => requestAnimationFrame(() => {
          j.style.left = (d.x - 13 + (i - 1.5) * 8) + 'px';
          j.style.top = (d.y + 18) + 'px';
          j.style.transform = 'scale(.8)';
        }));
        retirerApres(j, arrivee + 1400 - depart);
      }, depart);
      son(4, arrivee);
      plus(() => {
        total += v.poids;
        if (!compte) return;
        compte.textContent = String(total);
        compte.classList.remove('lg-fx-pop');
        void compte.offsetWidth;
        compte.classList.add('lg-fx-pop');
      }, arrivee);
      fin = arrivee;
    });
    const fini = fin + 600;
    if (compte) retirerApres(compte, fini + 300);
    if (eliminee) {
      onde(dest, fini);
      tremble(dest, fini);
      tampon(dest, fini);
      son(3, fini);
    }
    return fini + 300;
  }

  /** Nombre de voix (pondérées) que la cible a déjà, avant la mise à jour : dernier vote de chacun, manche courante. */
  function voixAvant(avant, e, cible) {
    const derniers = new Map();
    for (const v of avant.votes || []) if (v.manche == e.partie.manche) derniers.set(v.de, v.pour);
    let n = 0;
    for (const [de, pour] of derniers) if (pour === cible) n += poidsDe(e, de);
    return n;
  }

  /**
   * Joue les effets correspondant aux changements entre l'état précédent et l'état actuel.
   * @param {object|null} avant état précédent (null : rien à animer)
   * @param {object} e état actuel
   */
  function appliquer(avant, e) {
    if (!avant || !e?.partie || !e.moi) return;
    const c = changements(avant, e);

    // 1. Votes : les jetons partent d'abord ; la nuit ne tombe qu'ensuite.
    let fin = 0;
    if (c.votes.length) {
      const parCible = new Map();
      for (const v of c.votes) parCible.set(v.pour, [...(parCible.get(v.pour) || []), v]);
      let debut = 500;
      for (const [cible, groupe] of parCible) {
        const eliminee = c.elimines.includes(cible);
        debut = votes(cible, groupe, debut, voixAvant(avant, e, cible), eliminee);
        if (eliminee) c.elimines = c.elimines.filter((u) => u !== cible);
      }
      fin = debut;
    }
    // Éliminés sans jeton dans cette mise à jour : tampon seul.
    if (c.elimines.length) {
      c.elimines.forEach((uid) => { onde(siege(uid), fin + 500); tremble(siege(uid), fin + 500); tampon(siege(uid), fin + 500); });
      son(3, fin + 500);
    }

    // 2. Nuit ou aube.
    if (c.nuit === true) {
      son(1, fin);
      voile(true, 'La nuit tombe', 'Le village s’endort…', fin);
      if (e.moi.camp === 'loups' && e.moi.vivant) son(6, fin + 1600);
    } else if (c.nuit === false) {
      son(2, fin);
      const noms = c.victimes.length
        ? c.victimes.map((v) => `${v.pseudo} ne s’est pas réveillé·e`).join(' · ')
        : 'Tout le monde est en vie';
      voile(false, 'Le jour se lève', noms, fin);
      if (c.victimes.length) {
        son(3, fin + 2300);
        for (const v of c.victimes) {
          const r = roleById(v.role);
          const seat = siege(v.uid);
          tremble(seat, fin + 2300);
          carteSurSiege(seat, r.nom, r.image, fin + 2300);
        }
      }
    }

    // 3. Voyante : carte retournée au-dessus du siège sondé.
    if (c.sonde) carteSurSiege(siege(c.sonde.uid), c.sonde.nom, c.sonde.image, 0);

    // 4. À toi d'agir : le panneau d'action est surligné une fois (l'anneau et la pastille tiennent tant que l'action attend).
    if (c.atoi && anime() && panneau?.firstElementChild) {
      const p = panneau.firstElementChild;
      p.classList.add('lg-fx-surligne');
      plus(() => p.classList.remove('lg-fx-surligne'), 4000);
    }
  }

  /** Grande carte du rôle retournée au début de la partie (écran de révélation). */
  function grandeCarte(roleId) {
    const r = roleById(roleId);
    son(5, 700);
    if (!anime()) return;
    const g = ajouter(document.body, elt('div', 'lg-fx-grande'));
    retirerApres(g, 3700);
    const k = elt('div', 'lg-fx-carte lg-fx-carte-grande');
    k.append(...faces(r.nom, r.image));
    g.append(k);
    plus(() => k.classList.add('lg-fx-tourne'), 700);
  }

  /** Arrête tout : minuteurs annulés, éléments ajoutés retirés. */
  function arreter() {
    minuteurs.forEach((id) => clearTimeout(id));
    minuteurs.clear();
    vivants.forEach((el) => el.remove());
    vivants.clear();
  }

  return { appliquer, grandeCarte, arreter };
}
