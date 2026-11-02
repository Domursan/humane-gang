// ===== Humane Gang — Uno : la table de jeu « Nuit arc-en-ciel » (#partie, partie en cours) =====
/*
 * Rôle : affiche une partie en cours. Barre du haut (nom, code, sens, chrono, son, chat), autres joueurs autour
 * de la table (photo de profil, anneau doré et pastille « Joue » pour celui qui joue), tapis vert, flèches dorées qui
 * tournent dans le sens du jeu, pioche (on pioche en cliquant dessus ; elle pulse « Pioche ! » quand on n'a pas le choix)
 * et défausse, ma main en éventail (2 arcs au-delà de 12 cartes, triée par couleur ou par valeur), puis ma ligne :
 * moi, Passer, UNO ! (seulement juste après avoir posé l'avant-dernière carte), Contre-UNO rouge avec le nom de la cible.
 * Effets et sons des coups (maquette validée, scènes UNa à UNn, sons UN1 à UN13 ; briques dans uno/effets.js) : l'état arrive
 * du serveur sans événements, alors chaque nouvel état est comparé au précédent et aux nouvelles lignes du journal (planifier),
 * ce qui donne une courte suite d'étapes (derouler) : carte qui vole jusqu'à la défausse, jeton Passe, Inversion, cartes vers un
 * siège ou ma main, annonces UNO, Contre-UNO, Bluff, Raté, Main vide. Ma propre carte part dès le clic, avant la réponse du
 * serveur (poseLocale), et revient en main si le serveur refuse.
 * Les effets ne retardent rien : l'état (tour, chrono, couleur, boutons, cartes jouables) est peint tout de suite ; seuls la
 * défausse et les compteurs de cartes suivent le vol. Une rafale ne joue que le dernier coup ; lignes périmées (reprise après une
 * veille, reconnexion) ou onglet masqué : aucun effet, l'état est juste. Mouvement réduit : pas d'animation, sons conservés.
 * Les zones sont mises à jour sur place (sièges, ma ligne, main par identifiant) : un nouvel état ne coupe pas une animation.
 * Sur ordinateur : table à gauche, chat à droite. Sous 760 px : une colonne, les joueurs défilent en bande, la main est
 * un éventail compressé sur 2 rangées (un appui fait remonter la carte, un second la joue) et le chat s'ouvre en volet.
 * La mise en page est dans assets/espaces/uno/table.css ; ici, seulement le contenu et les actions.
 * Une seule action à la fois (anti double clic). Après chaque action : ctx.suivi.rafraichir().
 * Dépendances : core.js (esc, avatarHtml, toast), uno/api.js (uno, erreurTexte), uno/cartes.js (carteHtml, dosHtml, nomCarte, COULEURS),
 *   uno/effets.js, ./chat.js (creerChat), commun/tour-signal.js, uno.css (.uno-btn, .uno-roue, .uno-roue-voile, .uno-invite-tag).
 * Exporte : creer(root, ctx) -> { maj(etat), conclure(etat), message(msg), detruire() }.
 *   conclure : dernier état avant l'écran de fin ; joue le dernier coup et rend une promesse tenue quand il est fini.
 *   ctx = { code, naviguer, moi, suivi } ; suivi = retour de suivrePartie (rafraichir, secondesRestantes, etat, decalage).
 */
import { esc, avatarHtml, toast } from '../../../commun/core.js';
import { uno, erreurTexte } from '../api.js';
import { carteHtml, dosHtml, nomCarte, COULEURS, ICONE_PASSE } from '../cartes.js';
import { creerEffets, mouvementReduit, son, rejouer, presse, boite } from '../effets.js';
import { creerChat } from './chat.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';
import { boutonQuitter, DEPART, ACTION_EN_COURS, confirmerDepart, tableLibre } from '../../../commun/quitter.js';
import { creerSignalTour } from '../../../commun/tour-signal.js';

const RAYON = 16;
const CIRCONFERENCE = 2 * Math.PI * RAYON;
const ECRAN_GRAND = '(min-width: 761px)';
const JOURNAL_MAX = 15;
const GRACE_UNO = 3000;            // ms avant de pouvoir contrer un oubli de UNO (règle serveur, migration 171)
const NB_FLECHES = 8;
const CLE_TRI = 'hg_uno_tri';
const COULEURS_ROUE = [['r', 'Rouge', 'q-r'], ['b', 'Bleu', 'q-b'], ['g', 'Vert', 'q-g'], ['y', 'Jaune', 'q-y']];
const ORDRE_COULEUR = { r: 0, y: 1, g: 2, b: 3, k: 4 };
const ORDRE_VALEUR = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'passe', 'inv', '+2', 'joker', '+4'];
const HEX = /^#[0-9a-f]{6}$/i;
const LIGNE_FRAICHE = 6000;        // ms : une ligne du journal plus ancienne n'a plus d'effet (reprise après une veille)
const VOL_POSE = 420;              // ms : ma carte vers la défausse (maquette)
const VOL_POSE_FORT = 640;         // ms : dernière carte, tour complet
const VOL_ADVERSAIRE = 480;        // ms : carte d'un adversaire, retournée à mi-vol
const CLOTURE = 1500;              // ms : la table reste visible après la dernière carte
const CARTES_MAX = 12;             // au-delà, les cartes arrivent sans vol
const DELAI_ACTION = 9000;         // ms : au-delà, l'action est abandonnée et l'état relu (il fait foi)
const ROUGE_COUP = '#FF5A5A';
const ORANGE_BLOQUE = '#FF8A4C';

const ETOILE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true"><path d="M12 2l2.4 7.2H22l-6 4.6 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.6h7.6z"></path></svg>';
const ICONE_SENS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7"></path><path d="M20 4v4h-4"></path></svg>';
const ICONE_CHAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"></path></svg>';
const ICONE_BLOQUE = '<svg width="78" height="78" viewBox="0 0 24 24" fill="none" stroke="#FF4D4D" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M5.6 18.4L18.4 5.6"></path></svg>';

/** Couleur d'affichage d'un joueur : sa couleur de profil, gris pour un invité. */
const couleurJoueur = (j) => (j?.invite ? '#9A968F' : (HEX.test(j?.couleur || '') ? j.couleur : '#F2EFEA'));
const nbCartes = (n) => (n === 1 ? '1 carte' : `${n ?? 0} cartes`);
/** Chrono « 0:18 », ou un tiret quand il n'y a pas de tour en cours. */
const chrono = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const ligneJournal = (j) => `<li class="uno-journal-ligne">${esc(j.texte)}</li>`;
const lireTri = () => { try { return localStorage.getItem(CLE_TRI) === 'valeur' ? 'valeur' : 'couleur'; } catch { return 'couleur'; } };
const garderTri = (t) => { try { localStorage.setItem(CLE_TRI, t); } catch { /* stockage indisponible */ } };

/** Photo de profil (ou initiales) dans son anneau ; l'anneau devient doré et se vide avec le chrono pour le joueur actif. */
function avatar(j, taille) {
  const img = avatarHtml({ pseudo: j?.pseudo, color: j?.invite ? '#3A3A40' : j?.couleur, avatar_url: j?.avatar_url }, taille);
  return `<span class="uno-av" style="--c:${couleurJoueur(j)}">${img}</span>`;
}

/** Trie une main : par couleur (puis valeur) ou par valeur (puis couleur). */
function trier(cartes, mode) {
  const v = (c) => { const i = ORDRE_VALEUR.indexOf(c.valeur); return i < 0 ? 99 : i; };
  const co = (c) => ORDRE_COULEUR[c.couleur] ?? 9;
  return [...cartes].sort((a, b) => (mode === 'valeur'
    ? v(a) - v(b) || co(a) - co(b) || a.id - b.id
    : co(a) - co(b) || v(a) - v(b) || a.id - b.id));
}

/**
 * Positions (en % de la table) des autres joueurs, sur l'anneau : le premier à gauche, le dernier à droite.
 * Un seul adversaire : en haut. Moi, en bas, je ne suis pas placé ici.
 * @param {number} n nombre d'adversaires.
 * @returns {Array<{x:number, y:number}>}
 */
function placer(n) {
  const etendue = n <= 1 ? 0 : Math.min(212, 40 + 36 * (n - 1));
  return Array.from({ length: n }, (_, k) => {
    const phi = (n <= 1 ? 90 : 90 + etendue / 2 - k * (etendue / (n - 1))) * Math.PI / 180;
    return { x: 50 + 40 * Math.cos(phi), y: 50 - 34 * Math.sin(phi) };
  });
}

/** Squelette statique de la table (les parties variables sont remplies à chaque mise à jour). */
function squelette(idChat) {
  return `
  <header class="uno-barre">
    <div class="uno-barre-titre">
      <h1 class="uno-nom" tabindex="-1" data-nom>Partie</h1>
      <span class="uno-code" data-code></span>
    </div>
    <p class="uno-sens" data-sens-bloc><span class="uno-sens-icone" aria-hidden="true">${ICONE_SENS}</span><span data-sens>Sens horaire</span></p>
    <div class="uno-chrono" role="timer" aria-label="Temps restant pour jouer">
      <svg class="uno-anneau" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="${RAYON}" fill="none" stroke="#2A2A2F" stroke-width="4"></circle>
        <circle data-anneau cx="20" cy="20" r="${RAYON}" fill="none" stroke="#E2C77E" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="0 ${CIRCONFERENCE.toFixed(2)}" transform="rotate(-90 20 20)"></circle>
      </svg>
      <span class="uno-chrono-texte" data-chrono>–</span>
      <span class="visually-hidden" aria-live="polite" data-chrono-annonce></span>
    </div>
    <button type="button" class="btn btn-ghost uno-bouton-chat" data-chat-bouton aria-controls="${idChat}" aria-expanded="true">${ICONE_CHAT}<span class="uno-chat-libelle">Masquer le chat</span></button>
    ${boutonQuitter('Quitter la table', { attrs: 'data-quitter' })}
  </header>

  <div class="uno-corps">
    <section class="uno-plateau" aria-label="Table de jeu">
      <ol class="uno-sieges" aria-label="Autres joueurs" data-sieges></ol>
      <div class="uno-tapis">
        <div class="uno-ovale" aria-hidden="true"></div>
        <div class="uno-onde-tapis" aria-hidden="true" data-onde><u></u><i></i></div>
        <div class="uno-fleches" aria-hidden="true" data-fleches>${'<i></i>'.repeat(NB_FLECHES)}</div>
        <div class="uno-tapis-centre">
          <p class="uno-pilules">
            <span class="uno-pilule" data-couleur hidden></span>
            <span class="uno-pilule uno-pilule-cumul" data-cumul hidden></span>
          </p>
          <div class="uno-pile">
            <div class="uno-pile-bloc">
              <button type="button" class="uno-pioche" data-cle="pioche" data-pioche aria-label="Piocher">
                <span class="uno-pile-dos" aria-hidden="true">${dosHtml()}${dosHtml()}${dosHtml()}</span>
                <span class="uno-pioche-bulle" data-bulle hidden></span>
              </button>
              <span class="uno-legende">Pioche · <span data-pioche-nb>0</span></span>
            </div>
            <div class="uno-pile-bloc">
              <div class="uno-defausse" data-dessus></div>
              <span class="uno-legende">Défausse</span>
            </div>
          </div>
          <p class="uno-dernier" data-dernier></p>
        </div>
        <div class="uno-annonce" data-annonce aria-hidden="true"></div>
      </div>
    </section>

    <aside class="uno-chat" id="${idChat}" aria-label="Chat de la table">
      <div class="uno-chat-tete">
        <h2 class="uno-chat-titre">Chat de la table</h2>
        <button type="button" class="btn btn-ghost uno-chat-fermer" data-chat-fermer>Fermer le chat</button>
      </div>
      <div class="uno-chat-zone" data-chat></div>
    </aside>
  </div>

  <section class="uno-bas" aria-label="Tes cartes">
    <div class="uno-defi" data-defi hidden aria-live="polite"></div>
    <div class="uno-main-zone">
      <div class="uno-main-tete">
        <p class="uno-indice" data-indice hidden>Interception possible</p>
        <p class="uno-aide-tel" data-aide-tel>Touche une carte pour l'agrandir, touche-la encore pour la jouer.</p>
        <div class="uno-tri" role="group" aria-label="Trier ma main">
          <button type="button" data-tri="couleur">Par couleur</button>
          <button type="button" data-tri="valeur">Par valeur</button>
        </div>
      </div>
      <div class="uno-main-cartes" data-main></div>
    </div>
    <div class="uno-bas-ligne">
      <div class="uno-moi" data-moi></div>
      <div class="uno-commandes">
        <button type="button" class="btn btn-ghost uno-cmd" data-cle="passer" data-passer hidden>Passer</button>
        <button type="button" class="uno-contre" data-cle="contrer" data-contrer hidden></button>
        <button type="button" class="uno-btn" data-cle="uno" data-uno title="Disponible juste après avoir posé ton avant-dernière carte">${ETOILE}<span>UNO !</span>${ETOILE}</button>
      </div>
    </div>
  </section>

  <section class="uno-journal-zone" aria-labelledby="uno-journal-titre">
    <h2 class="uno-journal-titre" id="uno-journal-titre">Journal</h2>
    <ol class="uno-journal" aria-live="polite" aria-relevant="additions" data-journal></ol>
  </section>
  <p class="visually-hidden" aria-live="polite" data-annonce-tour></p>`;
}

/**
 * Monte la table de jeu dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const code = ctx.code;
  const suivi = ctx.suivi;
  const grand = window.matchMedia(ECRAN_GRAND);
  const idChat = `uno-chat-zone-${code}`;

  const el = document.createElement('section');
  el.className = 'uno-table';
  el.innerHTML = squelette(idChat);
  root.append(el);
  boutonReponses(el.querySelector('.uno-barre'), 'uno', () => etat?.partie?.id ?? null);

  const q = (s) => el.querySelector(s);
  const refs = {
    titre: q('[data-nom]'), nom: q('[data-nom]'), code: q('[data-code]'), sens: q('[data-sens]'), sensBloc: q('[data-sens-bloc]'),
    anneau: q('[data-anneau]'), chrono: q('[data-chrono]'), chronoAnnonce: q('[data-chrono-annonce]'),
    chatBouton: q('[data-chat-bouton]'), chatFermer: q('[data-chat-fermer]'), quitter: q('[data-quitter]'),
    sieges: q('[data-sieges]'), couleur: q('[data-couleur]'), cumul: q('[data-cumul]'), fleches: q('[data-fleches]'),
    pioche: q('[data-pioche]'), bulle: q('[data-bulle]'), piocheNb: q('[data-pioche-nb]'), dessus: q('[data-dessus]'),
    dernier: q('[data-dernier]'), annonce: q('[data-annonce]'), tapis: q('.uno-tapis'),
    moi: q('[data-moi]'), defi: q('[data-defi]'), main: q('[data-main]'), indice: q('[data-indice]'), aideTel: q('[data-aide-tel]'),
    passer: q('[data-passer]'), uno: q('[data-uno]'), contrer: q('[data-contrer]'),
    journal: q('[data-journal]'), annonceTour: q('[data-annonce-tour]'),
  };
  const chat = creerChat(q('[data-chat]'), { code, moi: ctx.moi });
  const signal = creerSignalTour();
  const fx = creerEffets({ table: el, plateau: q('.uno-plateau'), pile: q('.uno-pile'), ovale: q('.uno-ovale'), onde: q('[data-onde]') });

  let etat = null;
  let occupe = false;
  let voile = null;
  let voileRetour = null;
  let dernierTour;
  let lastS;
  let journalPret = false;
  const journalVus = new Set();
  let tri = lireTri();
  let mainAvant = null;              // ids de ma main au rendu précédent (null : premier rendu)
  const enVol = new Set();           // cartes reçues pas encore arrivées dans ma main (animation)
  const retenus = new Map();         // cartes en route vers un siège : pas encore comptées dans son compteur
  let leve = null;                   // téléphone : id de la carte remontée par un premier appui
  const pile = [];                   // défausse montrée : { carte, angle }, trois au plus (seul le dessus vient du serveur)
  let pileRetenue = false;           // une carte vole vers la défausse : le dessus de l'état attend son atterrissage
  let clePile = '';
  let poseLocale = null;             // ma carte partie au clic : { carte, vol, fin (promesse de l'atterrissage) }
  let serie = 0;                     // numéro de la suite d'effets en cours
  const pauses = new Set();          // attentes de la suite d'effets en cours
  const annulations = new Set();     // promesses à tenir quand les effets sont annulés

  /* ---------- Lecture de l'état ---------- */

  const monId = () => etat?.moi?.user_id ?? null;
  const moiJoueur = () => etat?.joueurs?.find((j) => j.user_id === monId()) || null;
  const joueurPar = (uid) => etat?.joueurs?.find((j) => j.user_id === uid) || null;
  const monTour = () => !!etat?.partie && etat.partie.statut === 'en_cours' && etat.partie.tour != null && etat.partie.tour === monId();
  const peutPiocher = () => !!etat && monTour() && !etat.partie.a_pioche && !etat.partie.defi && !occupe;
  const aucunCoup = () => !(etat?.main || []).some((c) => c.jouable);
  /** Millisecondes avant de pouvoir contrer (délai de grâce), 0 si c'est déjà possible. */
  const graceRestante = () => {
    const d = etat?.partie?.uno_depuis;
    if (!d) return 0;
    return Math.max(0, new Date(d).getTime() + GRACE_UNO - (Date.now() + (suivi.decalage?.() || 0)));
  };

  /** Les autres joueurs, en commençant par celui qui joue juste après moi. */
  function autres() {
    const js = etat?.joueurs || [];
    const i = js.findIndex((j) => j.user_id === monId());
    const ordre = i < 0 ? js : [...js.slice(i + 1), ...js.slice(0, i)];
    return ordre.filter((j) => j.user_id !== monId());
  }

  /** Carte que j'ai déjà lancée mais que le serveur compte encore dans ma main. */
  const poseNonConfirmee = () => !!poseLocale && (etat?.main || []).some((c) => c.id === poseLocale.carte.id);
  /** Compteur montré : les cartes encore en vol n'y sont pas ; à la fin des vols, c'est celui du serveur. */
  const nbAffiche = (j) => Math.max(0, (j.nb_cartes || 0) - (retenus.get(j.user_id) || 0));
  const nbAfficheMoi = (m) => Math.max(0, (m.nb_cartes || 0) - enVol.size - (poseNonConfirmee() ? 1 : 0));
  const piocheAffichee = () => {
    let n = (etat?.partie?.pioche ?? 0) + enVol.size;
    for (const r of retenus.values()) n += r;
    return n;
  };
  const ecritTexte = (n, t) => { if (n && n.textContent !== t) n.textContent = t; };
  const htmlPeint = new WeakMap();
  /** Écrit du HTML dans un nœud seulement s'il a changé. */
  const ecritHtml = (n, h) => { if (n && htmlPeint.get(n) !== h) { htmlPeint.set(n, h); n.innerHTML = h; } };

  /* ---------- Rendu (chaque zone se met à jour à part) ---------- */

  function rendreBarre() {
    const p = etat.partie;
    refs.nom.textContent = p.nom || 'Partie';
    refs.code.textContent = p.code || code;
    refs.quitter.hidden = !moiJoueur();
    refs.quitter.disabled = !!moiJoueur()?.exclu;
    const antihoraire = p.sens === -1;
    refs.sens.textContent = antihoraire ? 'Sens antihoraire' : 'Sens horaire';
    refs.sensBloc.classList.toggle('inverse', antihoraire);
  }

  /** Partie fixe d'un siège (le reste est peint par peindreSiege, sans recréer le nœud : ses animations survivent). */
  function siege(j, pos, n) {
    return `<li class="uno-siege${n > 6 ? ' uno-serre' : ''}"
        style="--x:${pos.x.toFixed(1)}%;--y:${pos.y.toFixed(1)}%" data-joueur="${esc(j.user_id)}">
      <span class="uno-siege-photo">${avatar(j, n > 6 ? 44 : 56)}<span data-badge></span>
        <span class="uno-tampon" aria-hidden="true">${ICONE_BLOQUE}</span></span>
      <span class="uno-siege-infos">
        <span class="uno-siege-nom"><strong style="color:${couleurJoueur(j)}">${esc(j.pseudo || '?')}</strong>${j.invite ? ' <span class="uno-invite-tag">invité</span>' : ''}</span>
        <span class="uno-siege-cartes"><span class="uno-mini-dos" aria-hidden="true"></span><span data-nb></span></span>
        <span class="uno-etiquettes"></span>
      </span>
      <span data-lecteur></span>
    </li>`;
  }

  function peindreSiege(j) {
    const li = refs.sieges.querySelector(`[data-joueur="${CSS.escape(String(j.user_id))}"]`);
    if (!li) return;
    const tour = etat.partie.tour === j.user_id && etat.partie.statut === 'en_cours';
    const nb = nbAffiche(j);
    li.classList.toggle('est-tour', tour);
    li.classList.toggle('exclu', !!j.exclu);
    ecritHtml(li.querySelector('.uno-mini-dos'), '<span></span>'.repeat(Math.min(nb, 3)));
    ecritTexte(li.querySelector('[data-nb]'), nbCartes(nb));
    ecritHtml(li.querySelector('[data-badge]'), j.uno ? '<span class="uno-badge-siege">UNO</span>' : '');
    ecritHtml(li.querySelector('.uno-etiquettes'), `${tour ? '<span class="uno-joue">Joue</span>' : ''}${j.exclu ? '<span class="uno-tag">exclu</span>' : ''}`);
    ecritHtml(li.querySelector('[data-lecteur]'), `${tour ? '<span class="visually-hidden">, à son tour</span>' : ''}${j.uno ? '<span class="visually-hidden">, a dit UNO</span>' : ''}`);
  }

  let cleSieges = '';
  function rendreSieges() {
    const liste = autres();
    const cle = liste.map((j) => [j.user_id, j.pseudo, j.couleur, j.avatar_url, j.invite].join('|')).join('#');
    if (cle !== cleSieges) {
      cleSieges = cle;
      const pos = placer(liste.length);
      refs.sieges.innerHTML = liste.map((j, k) => siege(j, pos[k], liste.length)).join('');
    }
    liste.forEach(peindreSiege);
  }

  /** Empile une carte sur la défausse montrée (trois au plus). */
  function empiler(carte, angle) {
    const i = pile.findIndex((x) => x.carte.id === carte.id);
    if (i >= 0) pile.splice(i, 1);
    pile.push({ carte, angle });
    if (pile.length > 3) pile.shift();
  }

  function peindrePile() {
    const taille = grand.matches ? 'l' : '';
    const cle = `${taille}|${pile.map((x) => x.carte.id).join(',')}`;
    if (cle === clePile) return;
    clePile = cle;
    refs.dessus.innerHTML = pile.length
      ? pile.map((x, i) => {
        const haut = i === pile.length - 1;
        return `<span class="${haut ? 'uno-pile-haut' : 'uno-pile-bas'}" style="rotate:${x.angle.toFixed(1)}deg"${haut ? '' : ' aria-hidden="true"'}>${carteHtml(x.carte, { taille })}</span>`;
      }).join('')
      : '<span class="uno-vide">Aucune carte</span>';
  }

  /** Aligne la défausse et la teinte du tapis sur l'état du serveur. */
  function synchroPile() {
    const d = etat.partie.dessus;
    if (!d) pile.length = 0;
    else if (pile[pile.length - 1]?.carte.id !== d.id) empiler(d, pile.length ? (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6) : 0);
    peindrePile();
    fx.teinte(d?.couleur === 'k' ? etat.partie.couleur : null);
  }

  function rendreCentre() {
    const p = etat.partie;
    const coul = COULEURS[p.couleur];
    refs.couleur.hidden = !coul;
    refs.couleur.innerHTML = coul
      ? `<span class="uno-point" style="background:${coul.hex}" aria-hidden="true"></span>Couleur : ${esc(coul.nom)}`
      : '';
    const cumul = Number(p.cumul || 0);
    refs.cumul.hidden = cumul <= 0;
    refs.cumul.textContent = cumul > 0 ? `+${cumul} à piocher` : '';
    ecritTexte(refs.piocheNb, String(piocheAffichee()));
    const peut = peutPiocher();
    const oblige = peut && aucunCoup();   // aucune carte jouable : il faut piocher
    refs.pioche.disabled = !peut;
    refs.pioche.classList.toggle('oblige', oblige);
    refs.bulle.hidden = !oblige;
    refs.bulle.textContent = cumul > 0 ? `Pioche ${cumul} !` : 'Pioche !';
    refs.pioche.setAttribute('aria-label', peut
      ? `${cumul > 0 ? `Piocher ${cumul} cartes` : 'Piocher une carte'}${oblige ? ' : aucune carte jouable' : ''}. Il reste ${p.pioche ?? 0} cartes`
      : `Pioche : ${p.pioche ?? 0} cartes`);
    if (!pileRetenue) synchroPile();
    ecritTexte(refs.dernier, etat.journal?.[0]?.texte || '');
  }

  /** Ma ligne : la partie fixe n'est écrite qu'une fois, ma photo garde ses animations entre deux états. */
  let cleMoi = '';
  function rendreMoi() {
    const m = moiJoueur();
    if (!m) { cleMoi = ''; refs.moi.innerHTML = ''; return; }
    const cle = [m.pseudo, m.couleur, m.avatar_url, m.invite].join('|');
    if (cle !== cleMoi) {
      cleMoi = cle;
      refs.moi.innerHTML = `
      <span class="uno-siege-photo uno-moi-photo">${avatar(m, 52)}<span data-badge></span>
        <span class="uno-tampon" aria-hidden="true">${ICONE_BLOQUE}</span></span>
      <div class="uno-moi-texte">
        <strong style="color:${couleurJoueur(m)}">${esc(m.pseudo || '?')} (toi)</strong>
        <span class="uno-moi-detail"></span>
        <span data-tour></span>
      </div>`;
    }
    const tour = monTour();
    refs.moi.querySelector('.uno-moi-photo').classList.toggle('est-tour', tour);
    ecritHtml(refs.moi.querySelector('[data-badge]'), m.uno ? '<span class="uno-badge-siege">UNO</span>' : '');
    ecritTexte(refs.moi.querySelector('.uno-moi-detail'), nbCartes(nbAfficheMoi(m)));
    ecritHtml(refs.moi.querySelector('[data-tour]'), tour ? '<span class="uno-joue">Ton tour</span>' : '');
  }

  /** Place les cartes de ma main en éventail (positions calculées selon la largeur disponible). */
  function placerMain() {
    const zone = refs.main;
    const boutons = [...zone.querySelectorAll('.uno-fan-carte')];
    const n = boutons.length;
    if (!n) { zone.style.height = ''; return; }
    const W = zone.clientWidth || 600;
    if (grand.matches) {
      const cw = W >= 700 ? 88 : 72; const ch = cw * 1.5;
      const rangs = n > 12 ? [Math.ceil(n / 2), n - Math.ceil(n / 2)] : [n];
      const ecart = 64;                      // décalage vertical entre les 2 arcs
      const creux = 26;                      // profondeur de l'arc
      zone.style.height = `${ch + 22 + creux + (rangs.length - 1) * ecart}px`;
      let i0 = 0;
      rangs.forEach((m, ri) => {
        const etendue = Math.min(W - cw - 24, Math.max(0, (m - 1) * cw * 0.66));
        for (let i = 0; i < m; i++) {
          const k = m > 1 ? i / (m - 1) - 0.5 : 0;
          const x = W / 2 - etendue / 2 + (m > 1 ? i * etendue / (m - 1) : 0) - cw / 2;
          const y = 12 + ri * ecart + k * k * 4 * creux;
          const b = boutons[i0 + i];
          b.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;z-index:${ri * 40 + i + 1};--r:${(k * Math.min(26, 4 + m * 2)).toFixed(1)}deg`;
        }
        i0 += m;
      });
    } else {
      const cw = 52; const ch = 78;
      const rangs = n > 9 ? [Math.ceil(n / 2), n - Math.ceil(n / 2)] : [n];
      zone.style.height = `${ch + 30 + (rangs.length - 1) * (ch + 10)}px`;
      let i0 = 0;
      rangs.forEach((m, ri) => {
        const pas = m > 1 ? Math.min(cw * 0.95, (W - cw) / (m - 1)) : 0;
        const debut = (W - cw - pas * (m - 1)) / 2;
        for (let i = 0; i < m; i++) {
          const k = m > 1 ? i / (m - 1) - 0.5 : 0;
          const b = boutons[i0 + i];
          b.style.cssText = `left:${(debut + i * pas).toFixed(1)}px;top:${(16 + ri * (ch + 10) + Math.abs(k) * 14).toFixed(1)}px;z-index:${ri * 40 + i + 1};--r:${(k * 14).toFixed(1)}deg`;
        }
        i0 += m;
      });
    }
  }

  /** Une carte de la main, avec son bouton. */
  function noeudCarte(c, taille) {
    const n = document.createElement('div');
    n.className = 'uno-fan-carte';
    n.dataset.id = c.id;
    n.innerHTML = carteHtml(c, { taille, bouton: true, jouable: !!c.jouable, attrs: `data-cle="carte-${c.id}"` });
    return n;
  }

  /** Met à jour une carte déjà en main sans recréer son bouton (le focus et la transition restent). */
  function peindreCarte(n, c) {
    const b = n.querySelector('button');
    const ok = !!c.jouable;
    if (b.classList.contains('jouable') === ok) return;
    b.classList.toggle('jouable', ok);
    b.classList.toggle('bloquee', !ok);
    b.setAttribute('aria-label', `${nomCarte(c)}${ok ? '' : ', pas jouable'}`);
    if (ok) b.removeAttribute('aria-disabled'); else b.setAttribute('aria-disabled', 'true');
  }

  /** Ma main : les cartes sont suivies par identifiant, celles qui restent glissent à leur nouvelle place. */
  function rendreMain() {
    const cartes = trier((etat.main || []).filter((c) => c.id !== poseLocale?.carte.id), tri);
    const ids = cartes.map((c) => c.id);
    for (const id of [...enVol]) if (!ids.includes(id)) enVol.delete(id);
    mainAvant = new Set(ids);
    if (leve != null && !ids.includes(leve)) leve = null;

    el.querySelectorAll('[data-tri]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tri === tri)));
    const zone = refs.main;
    if (etat.moi?.joue === false || !cartes.length) {
      ecritHtml(zone, `<p class="uno-vide">${etat.moi?.joue === false ? 'Tu suis la partie sans y jouer.' : 'Aucune carte en main.'}</p>`);
      zone.style.height = '';
    } else {
      htmlPeint.delete(zone);
      const taille = grand.matches ? (zone.clientWidth >= 700 || !zone.clientWidth ? 'l' : '') : 's';
      const cleTaille = taille || 'm';
      const existants = new Map();
      for (const n of [...zone.children]) {
        if (n.dataset.id && n.dataset.taille === cleTaille) existants.set(n.dataset.id, n);
        else n.remove();
      }
      cartes.forEach((c, i) => {
        let n = existants.get(String(c.id));
        if (n) { existants.delete(String(c.id)); peindreCarte(n, c); }
        else { n = noeudCarte(c, taille); n.dataset.taille = cleTaille; }
        n.classList.toggle('arrive', enVol.has(c.id));
        n.classList.toggle('leve', leve === c.id);
        if (zone.children[i] !== n) zone.insertBefore(n, zone.children[i] || null);
      });
      existants.forEach((n) => n.remove());
      zone.setAttribute('aria-label', `Ta main : ${nbCartes(cartes.length)}`);
      placerMain();
    }
    refs.indice.hidden = !(etat.partie.statut === 'en_cours' && !monTour() && cartes.some((c) => c.jouable));
    refs.aideTel.hidden = grand.matches || cartes.length < 2;
  }

  function rendreCommandes() {
    const p = etat.partie;
    const m = moiJoueur();
    const passer = monTour() && p.a_pioche;
    refs.passer.hidden = !passer;
    refs.passer.disabled = occupe;
    refs.passer.classList.toggle('oblige', passer && aucunCoup());
    const peutUno = !!m && m.nb_cartes === 1 && !m.uno && p.statut === 'en_cours';
    refs.uno.disabled = !peutUno || occupe;
    refs.uno.classList.toggle('actif', peutUno && !occupe);
    refs.uno.title = peutUno ? 'Dis UNO avant qu\'on te contre !' : 'Disponible juste après avoir posé ton avant-dernière carte';
    peindreContre();
  }

  /** Bouton Contre-UNO : rouge et pulsant, avec le nom de la cible ; grisé pendant les 3 secondes de grâce. */
  function peindreContre() {
    const p = etat.partie;
    const contrable = p.uno_attente && p.uno_attente !== monId() && etat.moi?.joue !== false ? joueurPar(p.uno_attente) : null;
    refs.contrer.hidden = !contrable;
    if (!contrable) { refs.contrer.dataset.cible = ''; return; }
    const reste = graceRestante();
    const nom = contrable.pseudo || '?';
    refs.contrer.dataset.cible = contrable.user_id;
    refs.contrer.disabled = occupe || reste > 0;
    refs.contrer.classList.toggle('attend', reste > 0);
    const txt = reste > 0 ? `Contre-UNO : ${nom} (${Math.ceil(reste / 1000)} s)` : `Contre-UNO : ${nom} !`;
    if (refs.contrer.textContent !== txt) refs.contrer.textContent = txt;
  }

  function rendreDefi() {
    const d = etat.partie.defi;
    const pour = !!d && d.cible === monId();
    refs.defi.hidden = !pour;
    if (!pour) { ecritHtml(refs.defi, ''); return; }
    const poseur = joueurPar(d.poseur);
    ecritHtml(refs.defi, `
      <p class="uno-defi-texte"><strong>${esc(poseur?.pseudo || 'Un joueur')}</strong> a posé un Joker +4. Contester ?</p>
      <div class="uno-defi-actions">
        <button type="button" class="btn btn-ghost" data-cle="defi-contester" data-defi="oui">Contester</button>
        <button type="button" class="btn btn-primary" data-cle="defi-accepter" data-defi="non">Accepter (+4)</button>
      </div>`);
    refs.defi.querySelectorAll('button').forEach((b) => { b.disabled = occupe; });
  }

  /** Le journal ne s'ajoute qu'en tête : seules les nouvelles lignes sont annoncées (aria-relevant=additions). */
  function rendreJournal() {
    const liste = etat.journal || [];
    if (!journalPret) {
      refs.journal.innerHTML = liste.map(ligneJournal).join('');
      liste.forEach((j) => journalVus.add(j.id));
      journalPret = true;
      return;
    }
    const nouveaux = liste.filter((j) => !journalVus.has(j.id)).reverse();
    for (const j of nouveaux) {
      refs.journal.insertAdjacentHTML('afterbegin', ligneJournal(j));
      journalVus.add(j.id);
    }
    while (refs.journal.children.length > JOURNAL_MAX) refs.journal.lastElementChild.remove();
  }

  /* ---------- Animations ---------- */

  /** Élément « photo » d'un joueur (siège, ou ma ligne). */
  const photoDe = (uid) => (uid === monId() ? refs.moi.querySelector('.uno-siege-photo')
    : refs.sieges.querySelector(`[data-joueur="${CSS.escape(String(uid))}"] .uno-siege-photo`));
  const nomDe = (uid) => joueurPar(uid)?.pseudo || 'Un joueur';
  /** Point d'arrivée vers un siège, ou null s'il n'est pas à l'écran (bande de joueurs repliée, spectateur). */
  function boiteJoueur(uid) {
    const av = photoDe(uid)?.querySelector('.uno-av');
    if (!av || !av.getBoundingClientRect().width) return null;
    return { ...boite(av), l: 44 };
  }

  /** Grande annonce au centre de la table (« UNO ! », « Inversion »). */
  let finAnnonce = 0;
  function annonce(titreHtml, sousTitre) {
    if (mouvementReduit()) return;
    refs.annonce.innerHTML = `${titreHtml}<span class="qui">${esc(sousTitre)}</span>`;
    rejouer(refs.annonce, 'go');
    fx.moins(finAnnonce);
    finAnnonce = fx.plus(() => { refs.annonce.classList.remove('go'); refs.annonce.innerHTML = ''; }, 1650);
  }

  /** « +2 », « +4 », « Bloqué ! » qui jaillit du siège touché. */
  function coup(uid, texte, couleur, bloque = false) {
    const ph = photoDe(uid);
    if (!ph || mouvementReduit()) return;
    const r = ph.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const n = document.createElement('div');
    n.className = 'uno-coup';
    n.textContent = texte;
    n.style.cssText = `top:${r.top - b.top + 10}px;color:${couleur};--lueur:${couleur}`;
    el.append(n);
    const l = n.offsetWidth / 2 + 4;   // reste dans la table, même sur le bord d'un téléphone
    n.style.left = `${Math.max(l, Math.min(b.width - l, r.left - b.left + r.width / 2))}px`;
    requestAnimationFrame(() => n.classList.add('go'));
    rejouer(ph, 'touche');
    if (bloque) rejouer(ph, 'bloque');
    fx.plus(() => { n.remove(); ph.classList.remove('touche', 'bloque'); }, 1500);
  }

  /* ---------- Des états aux effets ---------- */

  /** Attente dans une suite d'effets : annulée avec elle ; très courte en mouvement réduit (les sons gardent leur ordre). */
  const pause = (ms) => new Promise((ok) => {
    const t = setTimeout(() => { pauses.delete(t); ok(); }, mouvementReduit() ? Math.min(ms, 160) : ms);
    pauses.add(t);
  });

  /** Promesse tenue à la prochaine annulation des effets. */
  const surAnnulation = () => new Promise((ok) => { annulations.add(ok); });

  /** Arrête la suite d'effets en cours : plus rien en attente, compteurs et défausse reviennent à l'état (à peindre ensuite). */
  function arreterPlan({ garderPose = false } = {}) {
    serie += 1;
    pauses.forEach(clearTimeout);
    pauses.clear();
    annulations.forEach((ok) => ok());
    annulations.clear();
    enVol.clear();
    retenus.clear();
    fx.annulerVols(garderPose ? poseLocale?.vol : null);
    if (!garderPose) { poseLocale = null; pileRetenue = false; }
  }

  /** Nouvelles lignes du journal, de la plus ancienne à la plus récente. */
  const lignesNouvelles = (e) => (journalPret ? (e.journal || []).filter((j) => !journalVus.has(j.id)).reverse() : []);

  /** Vrai si cette ligne vient d'arriver (comparée à l'heure du serveur) : sinon c'est une reprise, sans effet. */
  function fraiche(j, e) {
    const age = new Date(e.maintenant).getTime() - new Date(j.created_at).getTime();
    return !(age > LIGNE_FRAICHE);
  }

  /**
   * Traduit les nouvelles lignes du journal en étapes d'effets.
   * Seul le dernier coup est joué : une rafale ne s'étire jamais en longue suite d'animations.
   * @param {object} avant état précédent. @param {object} e nouvel état. @param {Array} lignes nouvelles lignes.
   * @returns {Array<object>} étapes (voir etape()).
   */
  function planifier(avant, e, lignes) {
    const p = e.partie;
    const moi = e.moi?.user_id ?? null;
    const iJouer = lignes.map((l) => l.type).lastIndexOf('jouer');
    const lesLignes = iJouer >= 0 ? lignes.slice(iJouer) : lignes.slice(-2);
    const autreManche = avant.partie.manche !== p.manche;
    const finDeMain = lesLignes.find((l) => l.type === 'manche' && /vide sa main/.test(l.texte || ''));
    const nbDe = (uid, etatX) => etatX.joueurs?.find((j) => j.user_id === uid)?.nb_cartes || 0;
    const plan = [];
    /** Joueur dont le compteur a gagné n cartes (quand l'état précédent ne le dit pas). */
    const gagneur = (n) => e.joueurs?.find((j) => nbDe(j.user_id, e) - nbDe(j.user_id, avant) === n)?.user_id ?? null;
    /** Cartes reçues : jamais plus que ce que le compteur a vraiment gagné. */
    const recoit = (uid, n, o = {}) => {
      const gain = Math.max(0, nbDe(uid, e) - nbDe(uid, avant));
      const nb = Math.min(n, gain || n, CARTES_MAX);
      if (uid) plan.push({ t: 'cartes', uid, n: nb, son: 'UN5', pas: 260, ...o });
    };

    for (const l of lesLignes) {
      const t = l.texte || '';
      if (autreManche && l.type !== 'manche') {           // nouvelle donne : mains et défausse sont repartis de zéro
        if (l.type === 'jouer' && poseLocale) plan.push({ t: 'pose', uid: l.user_id, carte: poseLocale.carte, fort: true, nouvelleDonne: true });
        continue;
      }
      if (l.type === 'jouer') {
        if (p.dessus && p.dessus.id !== avant.partie.dessus?.id) {
          plan.push({ t: 'pose', uid: l.user_id, carte: p.dessus, fort: !!finDeMain, depuis: departDeMaMain(p.dessus) });
          if (p.dessus.valeur === 'inv' && p.sens !== avant.partie.sens) plan.push({ t: 'inversion', sens: p.sens === -1 ? -1 : 1 });
        }
      } else if (l.type === 'info' && /passe son tour\.$/.test(t)) {
        plan.push({ t: 'bloque', uid: l.user_id });
      } else if (l.type === 'pioche') {
        const m = t.match(/pioche (\d+) cartes/);
        const n = m ? Number(m[1]) : 1;
        const moiCible = l.user_id === moi;
        recoit(l.user_id, n, n >= 2
          ? { coup: `+${n}`, pas: moiCible ? 300 : (n > 2 ? 200 : 260) }
          : { son: 'UN8', pas: 420 });
      } else if (l.type === 'uno') {
        plan.push({ t: 'uno', uid: l.user_id });
      } else if (l.type === 'contre') {
        const cible = avant.partie.uno_attente ?? gagneur(2);
        plan.push({ t: 'contre', uid: cible });
        recoit(cible, 2, { pas: cible === moi ? 300 : 260 });
      } else if (l.type === 'defi') {
        const raison = /avec raison/.test(t);
        const poseur = avant.partie.defi?.poseur ?? (raison ? gagneur(4) : null);
        const uid = raison ? poseur : l.user_id;
        plan.push({ t: raison ? 'bluff' : 'rate', uid, poseur });
        recoit(uid, raison ? 4 : 6, { pas: uid === moi ? 240 : 200 });
      } else if (l === finDeMain) {
        plan.push({ t: 'mainVide', uid: l.user_id });
      }
    }

    // Mes cartes : déjà dans l'état, mais cachées (.arrive) jusqu'à ce que leur vol arrive.
    const moiRecoit = plan.find((s) => s.t === 'cartes' && s.uid === moi);
    if (moiRecoit && !mouvementReduit()) {
      const ids = new Set((e.main || []).map((c) => c.id));
      const nouvelles = [...ids].filter((id) => !mainAvant?.has(id));
      const garde = !!mainAvant && [...mainAvant].every((id) => ids.has(id) || id === p.dessus?.id);
      moiRecoit.ids = garde && nouvelles.length <= CARTES_MAX ? nouvelles : [];
    }
    return plan;
  }

  /** Point de départ de ma carte si elle est encore dans ma main (le robot a joué pour moi), mesuré avant le rendu. */
  function departDeMaMain(carte) {
    const fan = refs.main.querySelector(`.uno-fan-carte[data-id="${carte.id}"]`);
    if (!fan || poseLocale?.carte.id === carte.id) return null;
    return { de: boite(fan.querySelector('.uc')), r0: parseFloat(fan.style.getPropertyValue('--r')) || 0 };
  }

  /** La carte touche la défausse : elle s'y pose, impact, et onde de couleur pour un Joker. */
  function atterrir(carte, angle, { fort = false, couleur = null } = {}) {
    empiler(carte, angle);
    peindrePile();
    son('UN2');
    fx.impact(carte, fort);
    if (carte.couleur === 'k') {
      son('UN7');
      fx.onde(couleur || etat?.partie?.couleur);
      if (couleur) fx.teinte(couleur);
    }
  }

  /** Lance une carte vers la défausse. Rend le vol et la promesse de son atterrissage. */
  function envoyerSurPile(carte, { depuis = null, uid = null, fort = false, couleur = null } = {}) {
    const a = boite(refs.dessus);
    const r1 = fort ? 0 : (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 6);
    const siegeDe = depuis ? null : boiteJoueur(uid);
    let duree = 0;
    let vol = null;
    son('UN1');
    if (depuis) {
      duree = fort ? VOL_POSE_FORT : VOL_POSE;
      const taille = grand.matches ? (refs.main.clientWidth >= 700 ? 'l' : '') : 's';
      vol = fx.voler(carteHtml(carte, { taille }), depuis.de, a, { duree, r0: depuis.r0, r1, rm: fort ? 200 : depuis.r0 + (r1 > 0 ? 18 : -18), arc: fort ? -70 : -44, gonfle: fort ? 1.3 : 1.1 });
    } else if (siegeDe) {
      duree = fort ? VOL_POSE_FORT : VOL_ADVERSAIRE;
      vol = fx.voler(dosHtml(), siegeDe, a, { duree, r0: -12, r1, rm: fort ? 200 : 6, arc: fort ? -70 : 22, gonfle: fort ? 1.3 : 1.1, face: carteHtml(carte) });
    }
    if (!vol) duree = 0;
    const fin = new Promise((ok) => {
      const poser = () => {
        if (vol && !vol.isConnected) return;   // vol annulé entre-temps
        atterrir(carte, r1, { fort, couleur });
        ok();
      };
      if (duree) fx.plus(poser, duree); else poser();
    });
    return { vol, fin };
  }

  /** Ma carte part dès le clic (ou le choix de la couleur), sans attendre le serveur. */
  function lancerPose(carte, couleur) {
    if (mouvementReduit()) return;
    const fan = refs.main.querySelector(`.uno-fan-carte[data-id="${carte.id}"]`);
    const uc = fan?.querySelector('.uc');
    if (!uc) return;
    arreterPlan();
    synchroPile();                     // une carte adverse encore en vol va directement sur la défausse
    const depuis = { de: boite(uc), r0: parseFloat(fan.style.getPropertyValue('--r')) || 0 };
    const fort = (etat.main || []).length === 1;
    poseLocale = { carte, vol: null, fin: null };
    pileRetenue = true;
    Object.assign(poseLocale, envoyerSurPile(carte, { depuis, fort, couleur }));
  }

  /** Le serveur a refusé : la carte revient en main, la défausse redevient celle de l'état. */
  function annulerPose() {
    if (!poseLocale) return;
    const id = poseLocale.carte.id;
    arreterPlan();
    const i = pile.findIndex((x) => x.carte.id === id);
    if (i >= 0) pile.splice(i, 1);
  }

  /** Des cartes partent de la pioche vers un adversaire, au rythme de la maquette ; son compteur suit. */
  async function versSiege(s) {
    const de = { ...boite(refs.pioche), l: 52 };
    for (let i = 0; i < s.n; i++) {
      if (i) await pause(s.pas);
      son(s.son);
      const a = boiteJoueur(s.uid);
      if (a) fx.voler(dosHtml({ taille: 's' }), de, a, { duree: 420, r1: -10, e1: 0.45, arc: 0 });
      const r = (retenus.get(s.uid) || 0) - 1;
      if (r > 0) retenus.set(s.uid, r); else retenus.delete(s.uid);
      rendreSieges();
      ecritTexte(refs.piocheNb, String(piocheAffichee()));
    }
    await pause(480);
  }

  /** Mes cartes arrivent une par une : un dos vole de la pioche à sa place dans la main. */
  async function versMain(s) {
    const dessusPioche = refs.pioche.querySelector('.ub:nth-child(3)');
    const ids = s.ids || [];
    const n = mouvementReduit() ? s.n : ids.length;
    for (let i = 0; i < n; i++) {
      son('UN8');
      const id = ids[i];
      const fan = id == null ? null : refs.main.querySelector(`.uno-fan-carte[data-id="${id}"]`);
      if (fan && !mouvementReduit()) {
        dessusPioche?.animate([{ translate: '0 0' }, { translate: '0 -7px' }, { translate: '0 0' }], { duration: 200 });
        fx.voler(dosHtml({ taille: grand.matches ? '' : 's' }), boite(refs.pioche), boite(fan.querySelector('.uc')), { duree: s.pas, r1: 8, arc: 0, rm: 4, gonfle: 1 });
      }
      await pause(mouvementReduit() ? 120 : s.pas);
      if (id == null) continue;
      enVol.delete(id);
      refs.main.querySelector(`.uno-fan-carte[data-id="${id}"]`)?.classList.remove('arrive');
      rendreMoi();
      ecritTexte(refs.piocheNb, String(piocheAffichee()));
    }
  }

  /** Une étape d'effets. */
  async function etape(s) {
    const moi = monId();
    switch (s.t) {
      case 'pose': {
        if (poseLocale?.carte.id === s.carte.id) {
          await poseLocale.fin;
          poseLocale = null;
        } else {
          await envoyerSurPile(s.carte, { depuis: s.depuis, uid: s.uid, fort: s.fort }).fin;
        }
        pileRetenue = false;
        if (s.nouvelleDonne) pile.length = 0;   // la défausse repart de la première carte de la nouvelle manche
        synchroPile();
        break;
      }
      case 'bloque': {
        await pause(90);
        const a = boiteJoueur(s.uid);
        const haut = refs.dessus.querySelector('.uno-pile-haut');
        if (a && haut) fx.voler(`<span class="uno-fx-jeton">${ICONE_PASSE(30)}</span>`, { ...boite(haut), l: 44 }, a, { duree: 340, r1: 360, rm: 180, arc: -16, gonfle: 1 });
        await pause(340);
        son('UN3');
        coup(s.uid, 'Bloqué !', ORANGE_BLOQUE, true);
        break;
      }
      case 'inversion':
        son('UN4');
        fx.vrille(s.sens === -1);
        annonce('<span class="uno-txt-or">⟲ Inversion</span>', s.sens === -1 ? 'Le jeu tourne maintenant dans le sens antihoraire' : 'Le jeu tourne maintenant dans le sens horaire');
        break;
      case 'uno':
        son('UN9');
        fx.vrille(false);
        annonce('<span class="uno-txt">UNO !</span>', s.uid === moi ? 'Tu n\'as plus qu\'une carte' : `${nomDe(s.uid)} n'a plus qu'une carte`);
        break;
      case 'contre':
        son('UN10');
        annonce('<span class="uno-txt-rouge">Contre-UNO !</span>', 'Oubli de UNO : 2 cartes de pénalité');
        if (s.uid) coup(s.uid, '+2', ROUGE_COUP);
        break;
      case 'bluff':
        son(s.poseur === moi ? 'UN12' : 'UN11');
        annonce('<span class="uno-txt-or">Bluff !</span>', s.uid === moi ? 'Tu pioches 4 cartes' : `${nomDe(s.uid)} pioche 4 cartes`);
        if (s.uid) coup(s.uid, '+4', ROUGE_COUP);
        break;
      case 'rate':
        son(s.poseur === moi ? 'UN11' : 'UN12');
        son('UN5');
        annonce('<span class="uno-txt-rouge">Raté !</span>', `Pas de bluff : 6 cartes pour ${s.uid === moi ? 'toi' : nomDe(s.uid)}`);
        coup(s.uid, '+6', ROUGE_COUP);
        await pause(500);
        break;
      case 'cartes':
        if (s.coup) {
          await pause(120);
          coup(s.uid, s.coup, ROUGE_COUP);
        }
        if (s.uid === moi) {
          if (s.coup) { son('UN5'); await pause(240); }
          await versMain(s);
        } else {
          await versSiege(s);
        }
        break;
      case 'mainVide':
        son('UN13');
        fx.vrille(false);
        fx.pluie();
        annonce('<span class="uno-txt" style="font-size:.72em">Main vide !</span>', `${nomDe(s.uid)} pose sa dernière carte`);
        break;
      default:
    }
  }

  /** Joue les étapes l'une après l'autre ; une nouvelle suite remplace celle-ci. */
  async function jouerEtapes(plan, n) {
    try {
      for (const s of plan) {
        await etape(s);
        if (n !== serie) return;
      }
    } catch (err) {
      console.warn('[uno] effets', err);
      if (n !== serie) return;
      // Rien ne doit rester caché ou retenu : l'état reprend la main.
      arreterPlan();
      if (etat?.partie) rendreTout();
    }
  }

  /** Lance une suite d'effets. La promesse est tenue à sa fin, ou dès qu'elle est annulée. */
  const derouler = (plan) => (plan.length ? Promise.race([jouerEtapes(plan, serie), surAnnulation()]) : Promise.resolve());

  /* ---------- Flèches dorées qui tournent sur l'anneau, dans le sens du jeu ---------- */

  let phase = 0;
  let t0 = 0;
  let raf = 0;
  let vitesse = null;                // de -1 à 1 : les flèches freinent puis repartent sur une Inversion
  function tournerFleches(now) {
    raf = requestAnimationFrame(tournerFleches);
    if (document.hidden || !etat?.partie) { t0 = now; return; }
    const cible = etat.partie.sens === -1 ? -1 : 1;
    const dt = (now - (t0 || now)) / 1000;
    t0 = now;
    const reduit = mouvementReduit();
    if (vitesse == null || reduit) vitesse = cible;
    else vitesse += (cible - vitesse) * Math.min(1, dt * 2.6);
    if (!reduit) phase += dt * 0.35 * vitesse;
    const dir = vitesse < 0 ? -1 : 1;
    const w = refs.fleches.clientWidth / 2;
    const h = refs.fleches.clientHeight / 2;
    if (!w || !h) return;
    const fleches = refs.fleches.children;
    for (let i = 0; i < fleches.length; i++) {
      const a = phase + (i / NB_FLECHES) * Math.PI * 2;
      const ang = Math.atan2(Math.cos(a) * h * dir, -Math.sin(a) * w * dir) * 180 / Math.PI;
      fleches[i].style.transform = `translate(${(Math.cos(a) * w).toFixed(1)}px, ${(Math.sin(a) * h).toFixed(1)}px) rotate(${ang.toFixed(1)}deg)`;
    }
  }

  /* ---------- Chrono ---------- */

  /** Chrono : anneau, texte, anneau doré du joueur actif, et une annonce discrète à 10 secondes et à zéro. */
  function tic() {
    if (!etat?.partie) return;
    if (!refs.contrer.hidden) peindreContre();
    const s = suivi.secondesRestantes();
    if (s === lastS) return;
    lastS = s;
    const tour = etat.partie.t_tour || 0;
    refs.chrono.textContent = chrono(s);
    const fraction = s == null || !tour ? 0 : Math.min(1, s / tour);
    refs.anneau.setAttribute('stroke-dasharray', `${(fraction * CIRCONFERENCE).toFixed(2)} ${CIRCONFERENCE.toFixed(2)}`);
    el.style.setProperty('--k', fraction.toFixed(3));
    if (s === 10) refs.chronoAnnonce.textContent = 'Il reste 10 secondes.';
    if (s === 0) refs.chronoAnnonce.textContent = 'Temps écoulé.';
    const roueTemps = voile?.querySelector('[data-roue-temps]');
    if (roueTemps) roueTemps.textContent = chrono(s);
  }

  /** Annonce le changement de tour (lecteurs d'écran), sans l'annoncer à l'ouverture de la page. */
  function annoncerTour() {
    const tour = etat.partie.tour;
    if (tour === dernierTour) return;
    const premier = dernierTour === undefined;
    dernierTour = tour;
    if (premier || !tour) return;
    refs.annonceTour.textContent = tour === monId() ? "C'est ton tour." : `Au tour de ${joueurPar(tour)?.pseudo || 'un joueur'}.`;
  }

  /** Élément ayant le focus dans la table (pour le retrouver après un nouveau rendu). */
  function focusCle() {
    const a = document.activeElement;
    return a && el.contains(a) ? (a.dataset?.cle || null) : null;
  }

  function restaurerFocus(cle) {
    const a = document.activeElement;
    if (a && a !== document.body && !el.contains(a)) return; // le focus est ailleurs : on n'y touche pas
    let cible = el.querySelector(`[data-cle="${cle}"]:not([disabled])`);
    if (!cible && cle.startsWith('carte-')) cible = el.querySelector('.uno-main-cartes button[data-carte]:not([disabled])');
    if (!cible) cible = refs.titre;
    cible?.focus({ preventScroll: true });
  }

  function rendreTout(cle = null) {
    if (!etat?.partie) return;
    rendreBarre(); rendreSieges(); rendreCentre(); rendreMoi(); rendreMain();
    rendreCommandes(); rendreDefi(); rendreJournal();
    if (cle) restaurerFocus(cle);
  }

  /* ---------- Chat du volet et des sièges ---------- */

  const chatOuvert = () => (grand.matches ? !el.classList.contains('chat-masque') : el.classList.contains('chat-ouvert'));
  function peindreChatBouton() {
    const ouvert = chatOuvert();
    const libelle = grand.matches
      ? (ouvert ? 'Masquer le chat' : 'Afficher le chat')
      : (ouvert ? 'Fermer le chat' : 'Ouvrir le chat');
    refs.chatBouton.setAttribute('aria-expanded', String(ouvert));
    refs.chatBouton.querySelector('.uno-chat-libelle').textContent = libelle;
  }
  function surBoutonChat() {
    const ouvrir = !chatOuvert();
    if (grand.matches) el.classList.toggle('chat-masque', !ouvrir);
    else el.classList.toggle('chat-ouvert', ouvrir);
    peindreChatBouton();
    requestAnimationFrame(placerMain);
  }
  function surChangementEcran() {
    peindreChatBouton();
    if (etat?.partie) rendreTout(focusCle());
  }

  /* ---------- Fenêtres (roue des couleurs, choix de l'adversaire) ---------- */

  function piegerTab(ev, v) {
    const focusables = [...v.querySelectorAll('button:not([disabled])')];
    if (!focusables.length) return;
    const premier = focusables[0];
    const dernier = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === premier) { ev.preventDefault(); dernier.focus(); }
    else if (!ev.shiftKey && document.activeElement === dernier) { ev.preventDefault(); premier.focus(); }
  }

  function fermerVoile(silencieux = false) {
    if (!voile) return;
    voile.remove();
    voile = null;
    const retour = voileRetour;
    voileRetour = null;
    if (!silencieux && retour?.isConnected) retour.focus();
  }

  function ouvrirVoile(html, retour, titre) {
    fermerVoile(true);
    const v = document.createElement('div');
    v.className = 'uno-roue-voile';
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', titre);
    v.innerHTML = html;
    v.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); fermerVoile(); }
      else if (ev.key === 'Tab') piegerTab(ev, v);
    });
    v.addEventListener('click', (ev) => { if (ev.target === v) fermerVoile(); });
    v.querySelector('[data-annuler]')?.addEventListener('click', () => fermerVoile());
    el.append(v);
    voile = v;
    voileRetour = retour;
    v.querySelector('button')?.focus();
    return v;
  }

  /* ---------- Actions ---------- */

  /** Attend une réponse du serveur, sans jamais rester bloqué. */
  async function avecDelai(promesse) {
    let t = 0;
    try {
      return await Promise.race([promesse, new Promise((_, non) => {
        t = setTimeout(() => non(new Error('Le serveur ne répond pas : la table se remet à jour.')), DELAI_ACTION);
      })]);
    } finally {
      clearTimeout(t);
    }
  }

  /**
   * Lance une action serveur : une seule à la fois, erreurs en toast, puis relecture de l'état.
   * Après une pose, l'action reste en cours jusqu'à la relecture : une autre action partirait d'un état périmé.
   * Une pose locale n'est annulée que par l'action qui l'a lancée ; sans réponse, l'état relu fait foi (le serveur a pu accepter).
   * @param {Function} fn appel serveur. @param {Function} [avant] effet immédiat, sans attendre la réponse.
   */
  async function agir(fn, avant = null) {
    if (occupe || poseNonConfirmee()) return;
    occupe = true;
    const cle = focusCle();
    let pose = null;
    try {
      avant?.();
      pose = poseLocale;
      // Boutons désactivés, sans déplacer le focus : il revient à la fin. Sauf si ma carte vient de quitter la main.
      rendreTout(pose && cle?.startsWith('carte-') ? cle : null);
      await avecDelai(fn());
      if (pose) await avecDelai(suivi.rafraichir());
    } catch (e) {
      if (pose && poseLocale === pose) annulerPose();
      toast(erreurTexte(e), 'error');
    } finally {
      if (pose && poseLocale === pose && poseNonConfirmee()) annulerPose();   // relecture échouée : l'état affiché reste juste
      occupe = false;
      rendreTout(focusCle() || cle);
      suivi.rafraichir();
    }
  }

  function choisirCouleur(carte, retour) {
    const roue = COULEURS_ROUE.map(([c, nom, classe]) =>
      `<button type="button" class="${classe}" data-couleur-choix="${c}"><span>${nom}</span></button>`).join('');
    const v = ouvrirVoile(`
      <h2 id="uno-voile-titre">Choisis la couleur</h2>
      <div class="uno-roue">${roue}<div class="centre">${carteHtml({ couleur: 'k', valeur: 'joker' }, { taille: 's' })}</div></div>
      <p>Touche un quart du cercle · <span data-roue-temps>${chrono(suivi.secondesRestantes())}</span> pour choisir</p>
      <button type="button" class="btn btn-ghost" data-annuler>Annuler</button>`, retour, 'Choisis la couleur');
    son('UN6');
    if (!mouvementReduit()) {
      v.querySelector('.uno-roue').animate([{ transform: 'scale(.6) rotate(-90deg)', opacity: 0 }, { transform: 'scale(1) rotate(0)', opacity: 1 }],
        { duration: 260, easing: 'cubic-bezier(.2,1.3,.4,1)' });
    }
    v.querySelectorAll('[data-couleur-choix]').forEach((b) => b.addEventListener('click', () => {
      const couleur = b.dataset.couleurChoix;
      fermerVoile();
      agir(() => uno.jouer(code, carte.id, { couleur }), () => lancerPose(carte, couleur));
    }));
  }

  function choisirCible(carte, retour) {
    const cibles = autres().filter((j) => !j.exclu);
    if (!cibles.length) { agir(() => uno.jouer(code, carte.id), () => lancerPose(carte)); return; }
    const liste = cibles.map((j) => `<li><button type="button" class="uno-cible" data-cible="${esc(j.user_id)}">
        ${avatar(j, 40)}
        <span class="uno-cible-nom" style="color:${couleurJoueur(j)}">${esc(j.pseudo || '?')}</span>
        <span class="uno-cible-nb">${nbCartes(j.nb_cartes)}</span></button></li>`).join('');
    const v = ouvrirVoile(`
      <h2 id="uno-voile-titre">Avec qui échanger ta main ?</h2>
      <ul class="uno-cibles">${liste}</ul>
      <button type="button" class="btn btn-ghost" data-annuler>Annuler</button>`, retour, 'Avec qui échanger ta main ?');
    v.querySelectorAll('[data-cible]').forEach((b) => b.addEventListener('click', () => {
      const cible = b.dataset.cible;
      fermerVoile();
      agir(() => uno.jouer(code, carte.id, { cible }), () => lancerPose(carte));
    }));
  }

  /** Clic sur une carte : Joker ou +4 -> roue ; 7 en Sept-zéro -> choix de l'adversaire ; sinon on pose. */
  function jouerCarte(carte, bouton) {
    if (occupe || !etat) return;
    if (carte.valeur === 'joker' || carte.valeur === '+4') { choisirCouleur(carte, bouton); return; }
    if (carte.valeur === '7' && etat.partie.variantes?.sept_zero) { choisirCible(carte, bouton); return; }
    agir(() => uno.jouer(code, carte.id), () => lancerPose(carte));
  }

  /* ---------- Écouteurs ---------- */

  refs.pioche.addEventListener('click', () => { if (peutPiocher()) { presse(refs.pioche); agir(() => uno.piocher(code)); } });
  refs.passer.addEventListener('click', () => agir(() => uno.passer(code)));
  refs.quitter.addEventListener('click', async () => {
    if (!await confirmerDepart(DEPART.uno)) return;
    if (!await tableLibre(() => occupe || poseNonConfirmee())) { toast(ACTION_EN_COURS, 'error'); return; }
    agir(() => uno.quitter(code));
  });
  refs.uno.addEventListener('click', () => { presse(refs.uno); agir(() => uno.direUno(code)); });
  refs.contrer.addEventListener('click', () => {
    const cible = refs.contrer.dataset.cible;
    if (cible) { presse(refs.contrer); agir(() => uno.contrer(code, cible)); }
  });
  refs.main.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-carte]');
    if (!b) return;
    const carte = etat?.main?.find((c) => String(c.id) === b.dataset.carte);
    if (!carte) return;
    // Téléphone : un premier appui fait remonter la carte pour la voir en entier, le second la joue.
    // (Le clavier joue directement : detail = 0 pour une activation au clavier.)
    if (!grand.matches && ev.detail !== 0 && leve !== carte.id) {
      leve = carte.id;
      refs.main.querySelectorAll('.uno-fan-carte').forEach((f) => f.classList.toggle('leve', f.dataset.id === String(carte.id)));
      return;
    }
    if (b.getAttribute('aria-disabled') === 'true') return;
    leve = null;
    jouerCarte(carte, b);
  });
  el.querySelectorAll('[data-tri]').forEach((b) => b.addEventListener('click', () => {
    tri = b.dataset.tri;
    garderTri(tri);
    if (etat?.partie) rendreMain();
  }));
  refs.defi.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-defi]');
    if (b) { presse(b); agir(() => uno.contester(code, b.dataset.defi === 'oui')); }
  });
  refs.chatBouton.addEventListener('click', surBoutonChat);
  refs.chatFermer.addEventListener('click', () => {
    el.classList.remove('chat-ouvert');
    peindreChatBouton();
    refs.chatBouton.focus();
  });
  grand.addEventListener('change', surChangementEcran);
  const observateur = typeof ResizeObserver === 'function' ? new ResizeObserver(() => placerMain()) : null;
  observateur?.observe(refs.main);

  /** Onglet masqué : rien ne doit rester en attente, l'état revient d'un coup. */
  function surVisibilite() {
    if (!document.hidden) return;
    arreterPlan();
    fx.nettoyer();
    refs.annonce.classList.remove('go');
    el.querySelectorAll('.touche, .bloque').forEach((n) => n.classList.remove('touche', 'bloque'));
    if (etat?.partie) rendreTout();
  }
  document.addEventListener('visibilitychange', surVisibilite);

  peindreChatBouton();
  const minuterie = setInterval(tic, 250);
  raf = requestAnimationFrame(tournerFleches);

  /** Reçoit un état : peint tout de suite, puis joue les effets du dernier coup. Rend la promesse de leur fin. */
  function recevoir(e) {
    const avant = etat;
    const lignes = lignesNouvelles(e);
    const manche = !!avant && avant.partie.manche !== e.partie.manche;
    const vivant = !!avant && lignes.length > 0 && !document.hidden && fraiche(lignes[lignes.length - 1], e);
    const plan = vivant ? planifier(avant, e, lignes) : [];
    etat = e;
    // Ma carte en vol reste en l'air tant que le serveur ne l'a pas prise, ou si cet état la confirme.
    const garderPose = !!poseLocale && (poseNonConfirmee() || plan.some((s) => s.t === 'pose' && s.carte.id === poseLocale.carte.id));
    if (plan.length) {
      arreterPlan({ garderPose });
      for (const s of plan) {
        if (s.t === 'pose' && !mouvementReduit()) pileRetenue = true;
        if (s.t !== 'cartes' || mouvementReduit()) continue;
        if (s.uid === monId()) (s.ids || []).forEach((id) => enVol.add(id));
        else retenus.set(s.uid, (retenus.get(s.uid) || 0) + s.n);
      }
    } else if (avant && lignes.length) {
      arreterPlan({ garderPose });   // reprise : pas d'effet, l'état est juste
    }
    if (manche) pile.length = 0;  // nouvelle donne : la défausse repart de sa première carte
    rendreTout(focusCle());
    chat.maj(e);
    annoncerTour();
    signal.maj(monTour());
    lastS = undefined;
    tic();
    return derouler(plan);
  }

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (e?.partie) recevoir(e);
    },
    /** Dernier état avant l'écran de fin : joue la dernière carte et laisse la table visible le temps de la voir. */
    async conclure(e) {
      if (!e?.partie) return;
      const n = (e.journal || []).some((j) => j.type === 'manche' && !journalVus.has(j.id) && fraiche(j, e)) && !document.hidden;
      const effets = recevoir(e);
      const s = serie;
      await effets;
      if (n && s === serie) await Promise.race([pause(CLOTURE), surAnnulation()]);
    },
    /** Message du chat (ancien ou nouveau). */
    message(msg) {
      chat.ajouter(msg);
    },
    /** Arrête le chrono, les effets, et retire la table de la page. */
    detruire() {
      clearInterval(minuterie);
      cancelAnimationFrame(raf);
      observateur?.disconnect();
      signal.arreter();
      grand.removeEventListener('change', surChangementEcran);
      document.removeEventListener('visibilitychange', surVisibilite);
      arreterPlan();
      fx.detruire();
      fermerVoile(true);
      chat.detruire();
      el.remove();
    },
  };
}
