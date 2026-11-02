// ===== Humane Gang — Destins : la table de jeu (plateaux/jeux/destins/table.js) =====
/*
 * Rôle : affiche une partie de Destins en cours (jeu de la vie : études, métier, mariage, maison, retraite).
 *   Bandeau (joueurs, chrono, quitter), chemin de vie avec les pions, roue et « Tourner la roue » en bas du plan,
 *   panneau de choix selon la phase, ma fiche (avec Rembourser), carte Événement, classement, journal, chat
 *   (à droite sur ordinateur, en tiroir sur téléphone).
 *   Animations (jamais bloquantes, jamais rejouées sans changement) : chaque nouvel état est comparé au précédent.
 *   Un tour de roue fait apparaître une grande roue qui s'arrête sur la vraie valeur, le pion saute case par case
 *   jusqu'à sa nouvelle case, une carte Événement tirée se retourne, l'argent qui change compte jusqu'à sa valeur.
 *   Sons (commun/sons-jeux.js, id « destins ») : roulette au tour de roue, résultat à l'arrêt, un pas par case, carte Événement.
 *   Effets « à toi » (siège, bouton de la roue, panneau surligné) : ./effets.js, après chaque rendu (try/catch).
 *   Le signal « à toi de jouer » (son, titre d'onglet) reste dans commun/tour-signal.js.
 *   La mise en page est dans assets/espaces/plateaux/destins.css ; ici, le contenu, les actions et les animations.
 * Dépendances : commun/tour-signal.js (creerSignalTour), commun/sons-jeux.js (jouerSonJeu), core.js (esc, initials, toast), ../../api.js (plat, erreurTexte, nomDe, imageExiste),
 *   ../../vues/commun.js (bandeauHtml, brancherChrono, journalHtml, imagePlateau, envoyer, moiJoueur, joueurDe),
 *   ../../vues/chat.js (creerChat, tiroirChat), ./plateau.js (plateauHtml, POSITIONS, LIBELLES, legendeHtml, ...), ./effets.js (creerEffets).
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire() }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 */
import { esc, initials, toast } from '../../../../commun/core.js';
import { plat, erreurTexte, nomDe, imageExiste } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, imagePlateau, envoyer, moiJoueur, joueurDe, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { brancherSpectateur } from '../../vues/spectateur.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { jouerSonJeu } from '../../../../commun/sons-jeux.js';
import { plateauHtml, legendeHtml, POSITIONS, LIBELLES, NOM_ZONE, zoneDeCase, caseSuivante, pasEntre } from './plateau.js';
import { creerEffets } from './effets.js';

const JEU = 'destins';        // id des sons (commun/sons-jeux.js)
const ECRAN_GRAND = '(min-width: 761px)';
const MOUVEMENT_REDUIT = '(prefers-reduced-motion: reduce)';
const NB_CASES = POSITIONS.length;
const SAISIE_MIN = 25000;   // montant à réunir pour rembourser un prêt
const ASSURANCE = { habitation: 20000, auto: 10000 };
const ROUE_COULEURS = ['#9E3543', '#E2C77E', '#8FBF9A', '#7FA3D6', '#D98BA0', '#A98BD4', '#CE9B6C', '#6F9C86', '#B5573F', '#4F6E96'];
const ANGLE_CASE = 36;      // une valeur de la roue = 36 degrés
const TOURS = 5;            // tours complets avant de s'arrêter
const ROUE_MS = 2600;       // durée de la rotation de la grande roue
const PAS_MS = 230;         // durée d'un saut de pion
const ARGENT_MS = 900;      // durée du compte de l'argent
const CARTE_MS = 1900;      // durée pendant laquelle la carte retournée reste visible

/** Montant en euros, format français. */
const euros = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} €`;
/** Couleur de profil sûre (sinon texte clair). */
const couleurDe = (j) => (/^#[0-9a-f]{6}$/i.test(j?.couleur || '') && !j?.invite ? j.couleur : '#F2EFEA');
/** Pion : initiales du pseudo (deux lettres). */
const initialesPseudo = (pseudo) => initials(pseudo || '?');
/** Vrai si l'utilisateur demande moins de mouvement (préférence du membre, ou réglage du système). */
const reduit = () => document.body.classList.contains('plat-calme') || window.matchMedia(MOUVEMENT_REDUIT).matches;
/** Angle (degrés, sens horaire) qui amène la valeur v sous la pointe, en haut de la roue. */
const angleFinal = (v) => (360 - ((((v - 1) * ANGLE_CASE) + ANGLE_CASE / 2) % 360)) % 360;
/** Cases de la voie non prise (estompées sur le plan). */
function casesHorsVoie(e) {
  const out = [];
  const plage = (a, b) => { for (let i = a; i <= b; i++) out.push(i); };
  if (e.voie === 'universite') plage(11, 20);
  else if (e.voie === 'carriere') plage(1, 10);
  if (e.voie2 === 'famille') plage(62, 71);
  else if (e.voie2 === 'aventure') plage(52, 61);
  return out;
}
/** Chiffres de la grande roue (un par valeur), placés comme sur la maquette. */
const chiffresRoue = () => Array.from({ length: 10 }, (_, i) =>
  `<span class="ds-grande-rayon" style="transform:rotate(${i * ANGLE_CASE + ANGLE_CASE / 2}deg)"><span class="ds-grande-num">${i + 1}</span></span>`).join('');

/** Photographie de l'état utile aux animations (valeurs de roue, cases, argent, carte). */
function instantane(e) {
  const cases = {};
  const argent = {};
  (e?.joueurs || []).forEach((j) => {
    cases[j.user_id] = Number(j.etat?.case ?? 0);
    argent[j.user_id] = Number(j.etat?.argent ?? 0);
  });
  const jeu = e?.jeu || {};
  return {
    roue: jeu.roue ?? null,
    roue2: jeu.roue2 ?? null,
    carte: jeu.carte?.id ? `${jeu.carte.id}|${jeu.carte.pour}|${jeu.carte.case}` : null,
    cases,
    argent,
  };
}

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="ds-bandeau" data-bandeau></header>
  <div class="ds-barre" role="toolbar" aria-label="Actions de la partie">
    <span class="ds-code small muted" data-code></span>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <p class="ds-elimine" data-elimine hidden></p>
  <div class="ds-corps">
    <div class="ds-colonne-plan">
      <div class="ds-plan-wrap">
        <section class="ds-plan-zone" aria-label="Chemin de vie" data-plan></section>
        <div class="ds-scene" data-scene hidden aria-hidden="true">
          <div class="ds-scene-roue" data-scene-roue hidden>
            <p class="ds-scene-titre" data-scene-titre></p>
            <div class="ds-grande-cadre">
              <div class="ds-grande" data-grande>${chiffresRoue()}</div>
              <span class="ds-grande-pointe"></span>
              <span class="ds-grande-moyeu"></span>
            </div>
            <p class="ds-scene-val" data-scene-val></p>
          </div>
          <div class="ds-scene-carte" data-scene-carte hidden>
            <div class="ds-flip" data-flip>
              <div class="ds-face ds-face-dos"><span>?</span></div>
              <div class="ds-face ds-face-avant" data-avant></div>
            </div>
          </div>
        </div>
      </div>
      <div class="ds-bas" data-bas>
        <div class="ds-roue" data-roue aria-hidden="true"><span data-roue-val>-</span></div>
        <div class="ds-bas-info">
          <p class="ds-note" data-roue-texte></p>
          <dl class="ds-prochaines">
            <div><dt>Prochaine case</dt><dd data-prochaine>-</dd></div>
            <div><dt>Jour de paie</dt><dd data-paie>-</dd></div>
          </dl>
          <button type="button" class="ds-btn ds-btn-primary ds-tourner" data-tourner disabled>Tourner la roue</button>
        </div>
        <ul class="dp-legende" aria-label="Couleurs des cases">${legendeHtml()}</ul>
      </div>
    </div>
    <aside class="ds-colonne-cote" aria-label="Action, fiche, carte, classement, journal et chat">
      <section class="ds-panneau" aria-labelledby="ds-tour-titre" aria-live="polite" data-panneau></section>
      <section class="ds-bloc ds-fiche" aria-labelledby="ds-fiche-titre" data-fiche></section>
      <section class="ds-bloc ds-carte-zone" aria-labelledby="ds-carte-titre" data-carte></section>
      <section class="ds-bloc ds-classement-bloc" aria-labelledby="ds-classement-titre" data-classement></section>
      <section class="ds-bloc ds-journal-bloc" aria-labelledby="ds-journal-titre">
        <h2 id="ds-journal-titre" class="ds-bloc-titre">Journal</h2>
        <div data-journal></div>
      </section>
      <div class="ds-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="ds-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de Destins dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const contenus = ctx.contenus || {};
  const grand = window.matchMedia(ECRAN_GRAND);

  const el = document.createElement('section');
  el.className = 'ds-table';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), code: q('[data-code]'), elimine: q('[data-elimine]'), quitter: q('[data-quitter]'),
    plan: q('[data-plan]'), scene: q('[data-scene]'), sceneRoue: q('[data-scene-roue]'), sceneTitre: q('[data-scene-titre]'),
    grande: q('[data-grande]'), sceneVal: q('[data-scene-val]'), sceneCarte: q('[data-scene-carte]'), flip: q('[data-flip]'),
    avant: q('[data-avant]'), bas: q('[data-bas]'), roue: q('[data-roue]'), roueVal: q('[data-roue-val]'), roueTexte: q('[data-roue-texte]'),
    prochaine: q('[data-prochaine]'), paie: q('[data-paie]'), tourner: q('[data-tourner]'),
    carte: q('[data-carte]'), panneau: q('[data-panneau]'),
    fiche: q('[data-fiche]'), classement: q('[data-classement]'), journal: q('[data-journal]'),
    chatZone: q('[data-chat]'), tiroirChatZone: q('[data-tiroir-chat]'), annonce: q('[data-annonce]'),
  };
  refs.code.textContent = `Code ${code}`;
  // Spectateur (migration 214) : « Arrêter de regarder » et message sous la barre ; compteur pour les joueurs.
  const spect = brancherSpectateur({ barre: q('.ds-barre'), quitter: refs.quitter, naviguer: ctx.naviguer });

  let etat = null;
  let occupe = false;
  let arretChrono = null;
  let imageFond = null;                    // URL de l'image du chemin, si elle existe
  const cles = {};                         // clé du dernier rendu de chaque zone
  let choixAssur = { habitation: false, auto: false };   // cases de l'assurance (gardées entre deux rendus)
  let dernierTour = null;                  // pour annoncer « À toi de jouer »
  let detruit = false;

  /* ---------- Animations : file de scènes, pions et argent affichés ---------- */

  let vu = null;                           // photographie du dernier état reçu (null avant le premier)
  const affiche = {};                      // case affichée de chaque pion (suit les sauts)
  const argentAff = {};                    // argent affiché (suit le compte)
  const sautants = new Set();              // pions en train de sauter (classe is-saut)
  const file = [];                         // scènes à jouer, dans l'ordre
  const PLAFOND_FILE = 12;                 // nombre maximal de scènes en attente (évite une file qui grossit sans fin)
  let enJeu = false;
  let animGrande = null;                   // animation de la grande roue
  const minuteries = new Map();            // minuterie -> résolution de son attente

  /** Attente annulable (résolue tout de suite si la table est fermée). */
  function attendre(ms) {
    if (detruit || ms <= 0) return Promise.resolve();
    return new Promise((res) => {
      const t = setTimeout(() => { minuteries.delete(t); res(); }, ms);
      minuteries.set(t, res);
    });
  }

  /** Scènes : roue, pas du pion, carte, argent. Une seule à la fois ; le reste de la page reste utilisable. */
  async function jouerFile() {
    if (enJeu) return;
    enJeu = true;
    try {
      while (file.length && !detruit) {
        try { await file.shift()(); } catch (e) { console.error('Destins : animation', e); }
      }
    } finally {
      enJeu = false;
    }
    if (!detruit) synchroniser();
  }

  /** Remet pions et argent à leurs valeurs réelles (fin des animations). */
  function synchroniser() {
    if (!etat) return;
    (etat.joueurs || []).forEach((j) => {
      affiche[j.user_id] = caseDe(j);
      argentAff[j.user_id] = Number(j.etat?.argent ?? 0);
    });
    rendrePlan();
    majArgent();
  }

  /** Compare le nouvel état au précédent et programme les animations des vrais changements. */
  function suivreChangements() {
    const snap = instantane(etat);
    if (!vu) {
      Object.keys(snap.cases).forEach((uid) => { affiche[uid] = snap.cases[uid]; argentAff[uid] = snap.argent[uid]; });
      vu = snap;
      return;
    }
    // Les scènes déjà en attente sont conservées (une carte Événement ou une roue ne doit pas disparaître) ;
    // la file est plafonnée plus bas. Les pions et l'argent se recalent sur l'état réel à la fin (synchroniser).
    const moiUid = monId();
    const mouvements = [];
    Object.keys(snap.cases).forEach((uid) => {
      if (!(uid in affiche)) affiche[uid] = snap.cases[uid];
      if (vu.cases[uid] !== undefined && vu.cases[uid] !== snap.cases[uid]) mouvements.push(uid);
    });

    // Tour de roue : nouvelle valeur, ou un pion a avancé exactement de la valeur de la roue.
    const roueNouvelle = snap.roue != null && snap.roue !== vu.roue;
    const lanceur = snap.roue == null ? null : (mouvements.find((uid) => {
      const j = joueurDe(etat, uid)?.etat || {};
      return pasEntre(vu.cases[uid], snap.cases[uid], j.voie, j.voie2) === snap.roue;
    }) ?? null);
    if (roueNouvelle || lanceur !== null) {
      const valeur = snap.roue;
      file.push(() => sceneRoue(valeur, lanceur, 'fait tourner la roue'));
    }
    mouvements.forEach((uid) => {
      const vers = snap.cases[uid];
      file.push(() => scenePas(uid, vers));
    });
    if (snap.roue2 != null && snap.roue2 !== vu.roue2) {
      const valeur = snap.roue2;
      file.push(() => sceneRoue(valeur, null, 'tire à nouveau'));
    }
    if (snap.carte && snap.carte !== vu.carte && etat.jeu?.carte) {
      const carte = etat.jeu.carte;
      file.push(() => sceneCarte(carte));
    }
    Object.keys(snap.argent).forEach((uid) => {
      const avant = vu.argent[uid];
      if (avant === undefined || avant === snap.argent[uid]) return;
      if (uid === moiUid) {
        const vers = snap.argent[uid];
        file.push(() => sceneArgent(uid, vers));
      } else {
        argentAff[uid] = snap.argent[uid];
      }
    });
    if (file.length > PLAFOND_FILE) file.splice(0, file.length - PLAFOND_FILE);   // au-delà, on abandonne les plus anciennes
    vu = snap;
    if (file.length) jouerFile();
    else if (!enJeu) synchroniser();
  }

  /** Grande roue : apparaît, tourne et s'arrête sur la valeur réelle, puis se réduit. */
  async function sceneRoue(valeur, lanceur, action) {
    if (valeur == null) return;
    if (reduit()) {          // pas d'animation, mais le résultat se fait entendre
      jouerSonJeu(JEU, 3);
      return;
    }
    const pseudo = lanceur ? pseudoDe(lanceur) : '';
    refs.sceneTitre.textContent = pseudo ? `${pseudo} ${action}` : 'Tour de roue';
    refs.sceneRoue.hidden = false;
    refs.sceneCarte.hidden = true;
    refs.sceneVal.textContent = '';
    refs.sceneVal.classList.remove('is-pop');
    refs.scene.hidden = false;
    refs.scene.classList.remove('is-sortie');
    void refs.scene.offsetWidth;
    refs.scene.classList.add('is-ouverte');
    jouerSonJeu(JEU, 2);     // roulette qui ralentit
    animGrande?.cancel();
    animGrande = refs.grande.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${TOURS * 360 + angleFinal(valeur)}deg)` }],
      { duration: ROUE_MS, easing: 'cubic-bezier(.2,.7,.15,1)', fill: 'forwards' },
    );
    await attendre(350 + ROUE_MS);
    jouerSonJeu(JEU, 3);     // ding à l'arrêt
    refs.sceneVal.textContent = `${valeur} !`;
    refs.sceneVal.classList.add('is-pop');
    await attendre(1000);
    await fermerScene();
  }

  /** Carte Événement : se retourne en grand, reste un instant, puis disparaît. */
  async function sceneCarte(carte) {
    if (reduit()) {          // pas d'animation, mais le son de la carte reste
      jouerSonJeu(JEU, 4);
      return;
    }
    refs.avant.innerHTML = carteFaceHtml(carte);
    refs.sceneRoue.hidden = true;
    refs.sceneCarte.hidden = false;
    refs.flip.classList.remove('is-ouverte');
    refs.scene.hidden = false;
    refs.scene.classList.remove('is-sortie');
    void refs.scene.offsetWidth;
    refs.scene.classList.add('is-ouverte');
    await attendre(450);
    jouerSonJeu(JEU, 4);     // souffle de carte, puis carillon
    refs.flip.classList.add('is-ouverte');
    await attendre(900 + CARTE_MS);
    await fermerScene();
  }

  /** Ferme l'écran de scène (fondu), sans rien bloquer. */
  async function fermerScene() {
    refs.scene.classList.add('is-sortie');
    await attendre(400);
    refs.scene.classList.remove('is-ouverte', 'is-sortie');
    refs.scene.hidden = true;
    refs.sceneRoue.hidden = true;
    refs.sceneCarte.hidden = true;
  }

  /** Pion : saut case par case jusqu'à la case vers (suit le chemin de la voie du joueur). */
  async function scenePas(uid, vers) {
    const j = joueurDe(etat, uid)?.etat || {};
    const voie = j.voie ?? null;
    const voie2 = j.voie2 ?? null;
    const reste = pasEntre(affiche[uid], vers, voie, voie2);
    if (reduit() || reste < 0 || reste > 14) {
      if (reduit() && reste > 0 && reste <= 14) jouerSonJeu(JEU, 1);   // un seul son, pas de saut
      affiche[uid] = vers;
      rendrePlan();
      return;
    }
    let n = affiche[uid];
    for (let k = 0; k < reste && !detruit; k++) {
      n = caseSuivante(n, voie, voie2);
      affiche[uid] = n;
      sautants.add(uid);
      jouerSonJeu(JEU, 1);   // un clic léger par case
      rendrePlan();
      await attendre(PAS_MS);
      sautants.delete(uid);
    }
    affiche[uid] = vers;
    rendrePlan();
  }

  /** Argent de moi : compte jusqu'à la nouvelle valeur. */
  async function sceneArgent(uid, vers) {
    const de = argentAff[uid] ?? vers;
    if (reduit() || de === vers) {
      argentAff[uid] = vers;
      majArgent();
      return;
    }
    const pas = 24;
    for (let k = 1; k <= pas && !detruit; k++) {
      const p = 1 - Math.pow(1 - k / pas, 3);
      argentAff[uid] = Math.round(de + (vers - de) * p);
      majArgent();
      await attendre(ARGENT_MS / pas);
    }
    argentAff[uid] = vers;
    majArgent();
  }

  /** Met à jour le montant affiché dans ma fiche (sans la reconstruire). */
  function majArgent() {
    const uid = monId();
    const cible = refs.fiche.querySelector('[data-argent]');
    if (!cible || uid == null) return;
    cible.textContent = euros(argentAffiche(uid));
  }

  /* ---------- Chat : colonne (ordinateur) ou tiroir (téléphone) ---------- */

  let chat = null;
  const messagesVus = [];
  function monterChat() {
    chat?.detruire();
    refs.chatZone.innerHTML = '';
    refs.tiroirChatZone.innerHTML = '';
    chat = grand.matches
      ? creerChat(refs.chatZone, { code, moi: ctx.moi })
      : tiroirChat(refs.tiroirChatZone, { code, moi: ctx.moi });
    messagesVus.forEach((m) => chat.message(m));
    if (etat) chat.maj(etat);
  }
  monterChat();
  const surEcran = () => monterChat();
  grand.addEventListener('change', surEcran);

  /* ---------- Outils de lecture ---------- */

  const monId = () => moiJoueur(etat)?.user_id ?? null;
  const moiEst = (uid) => !!uid && uid === monId();
  const pseudoDe = (uid) => (uid == null ? '' : (joueurDe(etat, uid)?.pseudo || '?'));
  const nom = (liste, id) => nomDe(contenus, liste, id);
  const jeu = () => etat?.jeu || {};
  const phase = () => jeu().phase;
  const monTour = () => !!monId() && jeu().actif === monId();
  const jeAiSorti = () => !!moiJoueur(etat)?.elimine;
  const peutAgir = () => !moiJoueur(etat)?.parti && !occupe && !jeAiSorti() && etat?.partie?.statut === 'en_cours';
  const acteurPseudo = () => pseudoDe(jeu().actif);
  /** Ma situation (état de mon joueur dans la partie), ou {} si je ne joue pas. */
  const monEtat = () => moiJoueur(etat)?.etat || {};
  /** Case d'un joueur (0 à 90). */
  const caseDe = (j) => Number(j?.etat?.case ?? 0);
  /** Argent affiché d'un joueur (pendant un compte, la valeur en cours). */
  const argentAffiche = (uid) => argentAff[uid] ?? Number(joueurDe(etat, uid)?.etat?.argent ?? 0);
  /** Nombre de cases avant le prochain jour de paie (serveur, sinon vide). */
  const paieDans = () => (jeu().prochaine_paie || {})[monId()];
  /** Nom d'une case (contenu du jeu, sinon nom du type). */
  const nomCase = (n) => {
    const type = jeu().plateau?.[n % NB_CASES];
    return contenus.cases?.find((c) => c.id === type)?.nom || LIBELLES[type]?.nom || `Case ${n % NB_CASES}`;
  };

  /* ---------- Rendu : bandeau et chrono ---------- */

  function rendreBandeau() {
    const titre = esc(contenus.nom || 'Destins');
    const sous = contenus.sous_titre ? esc(contenus.sous_titre) : '';
    const html = bandeauHtml(etat, { titre, sousTitre: sous });
    if (cles.bandeau === html) return;
    cles.bandeau = html;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  function rendreElimine() {
    const on = jeAiSorti();
    refs.elimine.hidden = !on;
    refs.elimine.textContent = on ? 'Tu es sorti du jeu : tu regardes la suite.' : '';
    refs.quitter.disabled = !moiJoueur(etat) || moiJoueur(etat)?.parti === true;
  }

  /* ---------- Rendu : chemin de vie ---------- */

  function rendrePlan() {
    if (!etat) return;
    const j = jeu();
    const pions = (etat.joueurs || []).filter((x) => !x.parti && x.etat).map((x) => ({
      couleur: couleurDe(x), initiale: initialesPseudo(x.pseudo), pseudo: x.pseudo || '?',
      invite: !!x.invite, case: affiche[x.user_id] ?? caseDe(x), saut: sautants.has(x.user_id),
    }));
    const mon = monEtat();
    const moi = monId() != null ? caseDe(moiJoueur(etat)) : null;
    const prochaine = monId() == null ? null : caseSuivante(Number(mon.case ?? 0), mon.voie ?? null, mon.voie2 ?? null);
    const opts = {
      image: imageFond, types: j.plateau || [], pions, prochaine, moi,
      estompees: monId() == null ? [] : casesHorsVoie(mon),
    };
    const cle = JSON.stringify(opts);
    if (cles.plan === cle) return;
    cles.plan = cle;
    refs.plan.innerHTML = `<div class="ds-plan-tete"><span class="ds-tag">Tour ${esc(etat.partie?.nb_tours ?? 0)} · Chemin de vie</span></div>${plateauHtml(opts)}`;
  }

  /* ---------- Rendu : roue (en bas du plan) et prochaines cases ---------- */

  function rendreRoue() {
    const val = jeu().roue;
    const paie = paieDans();
    const suivante = monId() != null ? caseSuivante(Number(monEtat().case ?? 0), monEtat().voie ?? null, monEtat().voie2 ?? null) : null;
    const cle = JSON.stringify([val, paie, suivante]);
    if (cles.roue === cle) return;
    cles.roue = cle;
    refs.roueVal.textContent = val == null ? '-' : String(val);
    refs.roueTexte.innerHTML = val == null
      ? 'Tourne la roue pour avancer.'
      : `Dernier lancer : <strong>${esc(val)}</strong>.`;
    refs.prochaine.textContent = suivante == null ? '-' : nomCase(suivante);
    refs.paie.textContent = paie == null ? '-' : (paie === 0 ? 'Ce tour-ci' : `dans ${paie} case${paie > 1 ? 's' : ''}`);
  }

  /** Bouton « Tourner la roue » : actif seulement quand c'est à moi de tourner. */
  function majBouton() {
    refs.tourner.disabled = !(peutAgir() && monTour() && phase() === 'tourner');
  }

  /* ---------- Rendu : carte Événement ---------- */

  /** Contenu d'une carte Événement (face), à partir de l'état. */
  function carteFaceHtml(c) {
    const ev = (contenus.evenements || []).find((x) => x.id === c.id) || {};
    const pour = c.pour != null ? pseudoDe(c.pour) : '';
    const montant = Number(ev.montant) || 0;
    const sens = ev.effet === 'gain' ? '+' : (ev.effet === 'perte' ? '−' : '');
    const phrase = ev.effet === 'gain' ? 'Tu reçois' : (ev.effet === 'perte' ? 'Tu paies' : '');
    return `<span class="ds-etiquette">Carte événement</span>
      <p class="ds-carte-titre">${esc(ev.texte || 'Un événement.')}</p>
      ${montant && sens ? `<strong class="ds-carte-montant">${esc(sens)}${esc(euros(montant))}</strong>` : ''}
      ${pour ? `<span class="ds-note">${esc(phrase ? `${pour} : ${phrase.toLowerCase()} ce montant.` : pour)}</span>` : ''}`;
  }

  function rendreCarte() {
    const c = jeu().carte;
    const cle = JSON.stringify(c || null);
    if (cles.carte === cle) return;
    cles.carte = cle;
    if (!c?.id) {
      refs.carte.innerHTML = `<div class="ds-carte-cadre ds-carte-dos" aria-hidden="true"><span>?</span></div>
        <h2 id="ds-carte-titre" class="ds-bloc-titre">Carte événement</h2>
        <p class="ds-note">Aucune carte tirée pour l'instant.</p>`;
      return;
    }
    refs.carte.innerHTML = `<h2 id="ds-carte-titre" class="ds-bloc-titre">Carte événement</h2>
      <div class="ds-carte">${carteFaceHtml(c)}</div>`;
  }

  /* ---------- Rendu : fiche, classement, journal ---------- */

  /** Icônes de la fiche (tracé de la maquette). */
  const ICONE = {
    salaire: '<rect x="3" y="6" width="18" height="12" rx="2"></rect><circle cx="12" cy="12" r="2.5"></circle><path d="M7 9.5h.01M17 14.5h.01"></path>',
    famille: '<path d="M12 20s-7-4.3-7-10a3.8 3.8 0 0 1 7-2 3.8 3.8 0 0 1 7 2c0 5.7-7 10-7 10z"></path>',
    maison: '<path d="M3 11l9-7 9 7"></path><path d="M5.5 9.8V20h13V9.8"></path><path d="M10 20v-5h4v5"></path>',
    assurance: '<path d="M12 3l8 3v5.5c0 4.7-3.3 8.2-8 9.5-4.7-1.3-8-4.8-8-9.5V6z"></path><path d="M9 12l2.2 2.2L15.5 10"></path>',
    prets: '<path d="M3 9.5L12 4l9 5.5"></path><path d="M5 10v7M9.5 10v7M14.5 10v7M19 10v7"></path><path d="M3 20h18"></path>',
  };
  const icone = (cle) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[cle]}</svg>`;

  /** Tuile colorée de la fiche. */
  const tuile = (couleur, cle, titre, valeur, detail = '', extra = '', large = false) => `
    <div class="ds-tuile${large ? ' ds-tuile-large' : ''}" style="--c:${couleur}">
      <div class="ds-tuile-tete"><span class="ds-tuile-icone" style="color:${couleur}">${icone(cle)}</span>${esc(titre)}</div>
      <div class="ds-tuile-corps"><strong>${valeur}</strong>${detail ? `<small>${detail}</small>` : ''}</div>
      ${extra}
    </div>`;

  function rendreFiche() {
    const moi = moiJoueur(etat);
    const e = moi?.etat || {};
    const cle = JSON.stringify([moi?.pseudo, e, jeu().actif, monTour(), phase(), etat.partie?.statut, occupe]);
    if (cles.fiche === cle) return;
    cles.fiche = cle;
    if (!moi) { refs.fiche.innerHTML = '<h2 id="ds-fiche-titre" class="ds-bloc-titre">Ma fiche</h2><p class="ds-note">Tu ne joues pas dans cette partie.</p>'; return; }
    const maisons = (e.maisons || []).map((id) => nom('maisons', id)).join(', ') || 'Aucune';
    const famille = `${e.marie ? 'Marié' : 'Célibataire'} · ${e.enfants || 0} enfant${(e.enfants || 0) > 1 ? 's' : ''}`;
    const assur = [e.assurance_habitation ? 'Habitation' : '', e.assurance_auto ? 'Auto' : ''].filter(Boolean).join(', ') || 'Aucune';
    const prets = Number(e.prets) || 0;
    const peutRembourser = monTour() && prets > 0 && (Number(e.argent) || 0) >= SAISIE_MIN && peutAgir();
    const zone = NOM_ZONE[zoneDeCase(caseDe(moi))] || '';
    const metier = e.metier ? nom('metiers', e.metier) : 'Sans métier';
    const suivante = caseSuivante(caseDe(moi), e.voie ?? null, e.voie2 ?? null);
    refs.fiche.innerHTML = `
      <div class="ds-fiche-tete">
        <span class="ds-fiche-disque" style="background:${esc(couleurDe(moi))}" aria-hidden="true">${esc(initialesPseudo(moi.pseudo))}</span>
        <div class="ds-fiche-id">
          <h2 id="ds-fiche-titre" class="ds-fiche-nom">${esc(moi.pseudo || '?')}</h2>
          <span class="ds-muet small">${esc(metier)}</span>
        </div>
        ${zone ? `<span class="ds-zone-pill">${esc(zone)}</span>` : ''}
      </div>
      <div class="ds-argent-carte">
        <span class="ds-argent-etiq"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="8" width="14" height="9" rx="2"></rect><rect x="7" y="5" width="15" height="10" rx="2"></rect><circle cx="14.5" cy="10" r="2"></circle></svg>Argent</span>
        <strong class="ds-argent-val" data-argent>${esc(euros(argentAffiche(moi.user_id)))}</strong>
      </div>
      <div class="ds-tuiles">
        ${tuile('#3E9B5B', 'salaire', 'Salaire', esc(euros(e.salaire || 0)), 'par jour de paie')}
        ${tuile('#D0607E', 'famille', 'Famille', esc(famille))}
        ${tuile('#C9772F', 'maison', 'Maison', esc(maisons), suivante != null ? `Prochaine case : ${esc(nomCase(suivante))}` : '')}
        ${tuile('#2F8F8A', 'assurance', 'Assurance', esc(assur), assur === 'Aucune' ? 'Sans couverture' : 'Couverture active')}
        ${tuile('#B0413E', 'prets', 'Prêts', `${esc(prets)} · ${esc(euros(prets * SAISIE_MIN))}`, 'à rendre', `<div class="ds-pied"><button type="button" class="ds-btn" data-rembourser${peutRembourser ? '' : ' disabled'}>Rembourser un prêt</button></div>`, true)}
      </div>`;
  }

  function rendreClassement() {
    const fortunes = jeu().fortunes || {};
    const lignes = (etat.joueurs || []).filter((j) => !j.parti).map((j) => ({
      j, f: Number(fortunes[j.user_id]) || 0,
    })).sort((a, b) => b.f - a.f);
    const cle = JSON.stringify([lignes.map((l) => [l.j.user_id, l.f]), monId()]);
    if (cles.classement === cle) return;
    cles.classement = cle;
    const max = Math.max(1, ...lignes.map((l) => l.f));
    refs.classement.innerHTML = `<h2 id="ds-classement-titre" class="ds-bloc-titre">Classement provisoire</h2>
      <ol class="ds-classement">${lignes.map((l, i) => {
        const pct = Math.max(0, Math.min(100, (l.f / max) * 100));
        return `<li class="ds-rang${moiEst(l.j.user_id) ? ' is-moi' : ''}">
          <span class="ds-rang-n">${i + 1}</span>
          <span class="ds-rang-disque" style="background:${esc(couleurDe(l.j))}" aria-hidden="true">${esc(initialesPseudo(l.j.pseudo))}</span>
          <span class="ds-rang-nom" style="color:${esc(couleurDe(l.j))}">${esc(l.j.pseudo || '?')}${l.j.invite ? ' <span class="ds-invite">invité</span>' : ''}${moiEst(l.j.user_id) ? ' <span class="ds-muet small">(toi)</span>' : ''}</span>
          <span class="ds-rang-piste" aria-hidden="true"><span class="ds-rang-barre" style="width:${pct.toFixed(1)}%;background:${esc(couleurDe(l.j))}"></span></span>
          <span class="ds-rang-val">${esc(euros(l.f))}</span>
        </li>`;
      }).join('') || '<li class="ds-vide">Pas encore de classement.</li>'}</ol>`;
  }

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  /* ---------- Rendu : panneau d'action ---------- */

  /** Liste de cartes cliquables (métier, maison, voie…). */
  const cartes = (items, attrs) => items.map((it) => `<button type="button" class="ds-carte-choix" ${attrs(it)}>${it.html}</button>`).join('');

  function vueDepart() {
    const voies = (contenus.voies || []).filter((v) => ['universite', 'carriere'].includes(v.id));
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Ton départ</h2>
      <p>Choisis ta voie : études ou travail.</p>
      <div class="ds-choix" role="group" aria-label="Voies de départ">${cartes(voies.map((v) => ({ ...v, html: `<strong>${esc(v.nom)}</strong><span>${esc(v.texte || '')}</span>` })), (v) => `data-voie="${esc(v.id)}"`)}</div>`;
  }

  function vueMetier() {
    const ids = jeu().choix?.metiers || [];
    const items = ids.map((id) => {
      const m = (contenus.metiers || []).find((x) => x.id === id) || { id, nom: id };
      return { id, html: `<strong>${esc(m.nom)}</strong><span>${esc(m.diplome ? `Diplôme : ${m.diplome}` : 'Sans diplôme')}</span><span>${esc(euros(m.salaire))} par tour</span>` };
    });
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Choisis ton métier</h2>
      <div class="ds-choix" role="group" aria-label="Métiers proposés">${cartes(items, (it) => `data-metier="${esc(it.id)}"`)}</div>`;
  }

  function vueAchat() {
    const ids = jeu().choix?.maisons || [];
    const items = ids.map((id) => {
      const m = (contenus.maisons || []).find((x) => x.id === id) || { id, nom: id, prix: 0, vente: 0 };
      return { id, html: `<strong>${esc(m.nom)}</strong><span>Prix ${esc(euros(m.prix))}</span><span>Revente ${esc(euros(m.vente))}</span>` };
    });
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Acheter une maison ?</h2>
      <p>Tu peux acheter une maison, ou passer.</p>
      <div class="ds-choix" role="group" aria-label="Maisons à vendre">${cartes(items, (it) => `data-maison="${esc(it.id)}"`)}</div>
      <div class="ds-pied"><button type="button" class="ds-btn ds-btn-ghost" data-passer>Passer</button></div>`;
  }

  function vueAssurance() {
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Assurances</h2>
      <p>Sans assurance, un coup dur coûte cher. Une assurance coûte une fois pour toutes.</p>
      <form class="ds-form-assur" data-form-assur>
        <label class="ds-coche"><input type="checkbox" name="habitation" ${choixAssur.habitation ? 'checked' : ''}> Assurance habitation (${esc(euros(ASSURANCE.habitation))})</label>
        <label class="ds-coche"><input type="checkbox" name="auto" ${choixAssur.auto ? 'checked' : ''}> Assurance auto (${esc(euros(ASSURANCE.auto))})</label>
        <div class="ds-pied"><button type="submit" class="ds-btn ds-btn-primary">Valider</button></div>
      </form>`;
  }

  function vueVoie2() {
    const ids = jeu().choix?.voies || [];
    const items = ids.map((id) => {
      const v = (contenus.voies || []).find((x) => x.id === id) || { id, nom: id, texte: '' };
      return { id, html: `<strong>${esc(v.nom)}</strong><span>${esc(v.texte || '')}</span>` };
    });
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Prends le chemin</h2>
      <div class="ds-choix" role="group" aria-label="Chemins possibles">${cartes(items, (it) => `data-voie2="${esc(it.id)}"`)}</div>`;
  }

  function vueCible() {
    const cibles = (etat.joueurs || []).filter((x) => !x.parti && !x.elimine && x.user_id !== monId());
    const items = cibles.map((x) => ({ id: x.user_id, html: `<strong style="color:${esc(couleurDe(x))}">${esc(x.pseudo || '?')}</strong><span>${esc(euros(x.etat?.argent))}</span>` }));
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Procès : choisis une cible</h2>
      <p>Qui vises-tu ? Le procès coûte cher à celui qui le perd.</p>
      <div class="ds-choix" role="group" aria-label="Joueurs ciblés">${cartes(items, (it) => `data-cible="${esc(it.id)}"`)}</div>`;
  }

  function vueRetraite() {
    const ids = jeu().choix?.voies || [];
    const items = ids.map((id) => {
      const v = (contenus.voies || []).find((x) => x.id === id) || { id, nom: id === 'domaine' ? 'Domaine des millionnaires' : 'Maison de retraite', texte: '' };
      return { id, html: `<strong>${esc(v.nom)}</strong><span>${esc(v.texte || '')}</span>` };
    });
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Où prends-tu ta retraite ?</h2>
      <div class="ds-choix" role="group" aria-label="Lieux de retraite">${cartes(items, (it) => `data-retraite="${esc(it.id)}"`)}</div>`;
  }

  function vueTourner() {
    return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Ton tour</h2>
      <p>Tourne la roue, sous le chemin de vie, pour avancer.</p>`;
  }

  /** Contenu du panneau selon la phase et mon rôle. */
  function contenuPanneau() {
    if (jeAiSorti()) return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Tu regardes la suite</h2>`;
    if (!monId()) return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">La partie continue</h2><p>${esc(acteurPseudo())} joue.</p>`;
    if (phase() === 'fin' || etat.partie?.statut !== 'en_cours') return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Partie terminée</h2>`;
    if (!monTour()) {
      return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">C'est à ${esc(acteurPseudo())} de jouer</h2>
        <p>${esc(acteurPseudo())} est sur le chemin.</p>`;
    }
    switch (phase()) {
      case 'depart': return vueDepart();
      case 'metier': return vueMetier();
      case 'tourner': return vueTourner();
      case 'achat': return vueAchat();
      case 'assurance': return vueAssurance();
      case 'voie': return vueVoie2();
      case 'cible': return vueCible();
      case 'retraite': return vueRetraite();
      default: return `<h2 id="ds-tour-titre" class="ds-titre" tabindex="-1">Ton tour</h2><p>Attends la suite de la partie.</p>`;
    }
  }

  /** Redessine le panneau si son contenu a changé (pas pendant un envoi, sauf forcé). */
  function rendrePanneau(force = false) {
    if (occupe && !force) return;
    const cle = JSON.stringify([phase(), jeu().actif, monId(), monTour(), jeAiSorti(), etat?.partie?.statut,
      jeu().choix, jeu().roue, choixAssur, !!peutAgir()]);
    if (!force && cles.panneau === cle) return;
    cles.panneau = cle;
    refs.panneau.innerHTML = contenuPanneau();
  }

  /* ---------- Actions ---------- */

  /** Envoie une action de jeu : un seul envoi à la fois, boutons désactivés, puis relecture. */
  function agir(bouton, action, args = {}) {
    if (occupe) return;
    occupe = true;
    envoyer(bouton, async () => {
      try {
        await plat.agir(code, action, args);
      } catch (e) {
        toast(erreurTexte(e), 'error');
      } finally {
        occupe = false;
        cles.panneau = null;
        cles.fiche = null;
        rendrePanneau(true);
        rendreFiche();
        majBouton();
        suivi.rafraichir();
      }
    }, suivi);
  }

  /** Clics du panneau d'action et de la barre du plan (un bouton = une intention envoyée au serveur). */
  function surPanneau(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-voie')) return agir(b, 'voie', { voie: b.dataset.voie });
    if (b.hasAttribute('data-voie2')) return agir(b, 'voie', { voie: b.dataset.voie2 });
    if (b.hasAttribute('data-metier')) return agir(b, 'metier', { metier: b.dataset.metier });
    if (b.hasAttribute('data-maison')) return agir(b, 'acheter', { maison: b.dataset.maison });
    if (b.hasAttribute('data-passer')) return agir(b, 'acheter', {});
    if (b.hasAttribute('data-cible')) return agir(b, 'cible', { cible: b.dataset.cible });
    if (b.hasAttribute('data-retraite')) return agir(b, 'retraite', { lieu: b.dataset.retraite });
    if (b.hasAttribute('data-tourner')) {
      if (!peutAgir()) return;
      return agir(b, 'tourner');
    }
  }

  /** Validation de l'assurance. */
  function surSubmitPanneau(ev) {
    ev.preventDefault();
    const f = ev.target;
    if (!f.hasAttribute('data-form-assur') || occupe) return;
    return agir(ev.submitter || f.querySelector('button[type=submit]'), 'assurer', {
      habitation: !!choixAssur.habitation, auto: !!choixAssur.auto,
    });
  }

  /** Cases de l'assurance : on garde le choix sans relancer le rendu. */
  function surCoche(ev) {
    const c = ev.target;
    if (c.name in choixAssur) choixAssur[c.name] = c.checked;
  }

  /** Clics de la fiche : rembourser un prêt. */
  function surFiche(ev) {
    const b = ev.target.closest('button[data-rembourser]');
    if (!b || b.disabled || occupe) return;
    agir(b, 'rembourser');
  }

  function surQuitter(ev) {
    if (occupe) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  }

  /* ---------- Écouteurs ---------- */

  refs.panneau.addEventListener('click', surPanneau);
  refs.panneau.addEventListener('submit', surSubmitPanneau);
  refs.panneau.addEventListener('change', surCoche);
  refs.bas.addEventListener('click', surPanneau);
  refs.fiche.addEventListener('click', surFiche);
  refs.quitter.addEventListener('click', surQuitter);

  // Image du chemin si elle existe (sinon, le plan est dessiné sur fond uni).
  const urlImage = imagePlateau('destins', 'plateau');
  imageExiste(urlImage).then((ok) => {
    if (!ok || detruit) return;
    imageFond = urlImage;
    cles.plan = null;
    if (etat) rendrePlan();
  });

  /* ---------- Contrat de la vue ---------- */

  const signal = creerSignalTour();
  const effets = creerEffets(el);

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (detruit || !e?.partie) return;
      etat = e;
      rendreBandeau();
      rendreElimine();
      spect.maj(e);
      suivreChangements();
      rendrePlan();
      rendreRoue();
      rendreCarte();
      rendrePanneau();
      rendreFiche();
      rendreClassement();
      rendreJournal();
      majBouton();
      const tour = jeu().actif ?? null;
      if (tour !== dernierTour) {
        if (monTour()) refs.annonce.textContent = 'À toi de jouer.';
        dernierTour = tour;
      }
      chat.maj(e);
      signal.maj(monTour());
      try { effets.maj(e, monId()); } catch (err) { console.warn('[destins] effets visuels', err); }
    },
    /** Message du chat (ancien ou nouveau). */
    message(msg) {
      messagesVus.push(msg);
      if (messagesVus.length > 200) messagesVus.shift();
      chat.message(msg);
    },
    /** Arrête le chrono et les animations, retire le chat et la table de la page. */
    detruire() {
      signal.arreter();
      effets.detruire();
      detruit = true;
      minuteries.forEach((res, t) => { clearTimeout(t); res(); });
      minuteries.clear();
      file.length = 0;
      animGrande?.cancel();
      arretChrono?.();
      grand.removeEventListener('change', surEcran);
      chat?.detruire();
      el.remove();
    },
  };
}
