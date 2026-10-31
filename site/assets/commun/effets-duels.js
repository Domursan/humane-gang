// ===== Humane Gang — effets communs des duels, plateaux et salles (maquette validée, oct. 2026) =====
/**
 * Rôle : les briques partagées par les fiches de jeux : son du groupe « duels », bandeau, confettis, jetons en vol, décompte,
 *   tic de chrono, départ d'une partie, classes d'effet. Aucune règle ici : la vue décide quand jouer, ce module décide comment.
 *
 * À LIRE AVANT D'ÉCRIRE UN EFFET
 *   import { creerEffets, son, anime, PALETTES } from '…/commun/effets-duels.js';
 *   const fx = creerEffets();               // un par vue ; dans detruire() de la vue : fx.nettoyer();
 *   son('S16');                             // le son reste en mouvement réduit
 *   fx.bandeau('Partie perdue', 'Alice gagne', { ton: 'd' });   // ton : '' fête, 'd' sobre, 'n' neutre ; { couleur, haut } en plus
 *   fx.confettis(PALETTES.bj);              // liste de couleurs, nombre facultatif
 *   fx.plus(() => …, 300);                  // setTimeout annulé par fx.nettoyer() (fx.moins(t) pour un seul)
 *   fx.cascade(cases, (c, i) => …, 110);    // l'un après l'autre (d'un coup sans animation)
 *   fx.classe(el, 'fxd-pop', 500);          // pose une classe puis la retire ; relance l'animation si elle y était
 *   fx.rendre(cases, ['fxd-chute'], 1400);  // après ms, retire classes et décalage : la vraie grille revient, avec un bref retour
 *   fx.vol(el, ms);                         // ajoute un nœud sur <body> : retiré après ms ou par fx.nettoyer()
 *   fx.jetons('bj-anim-jeton', 6, de, vers);// petits nœuds de classe donnée, d'un élément à un autre
 *   fx.compte(['3', '2', '1'], 300);        // gros chiffres au milieu de l'écran
 *   if (premiereFois(`fin:${id}`)) …        // vrai une seule fois par clé dans la page (retour d'onglet, reconnexion, état déjà vu)
 *   const tic = creerTicChrono(); tic(reste, monTour, echeance, elChrono);   // à chaque peinture du chrono : S14 à 5…2 s, S15 à 1 s
 *   departPartie('Bonne partie');           // SA3 : 3, 2, 1, S20, bandeau, titre d'onglet ; survit au changement de vue
 *
 * Tout ce qui bouge ne se joue qu'avec anime() vrai. Les méthodes de fx le vérifient déjà : sans animation, elles ne posent rien
 * (cascade traite tout d'un coup) et le résultat doit donc venir de l'état réel, jamais de l'effet.
 * Un effet ne bloque rien : calques en pointer-events: none, jamais d'await sur une animation dans un chemin d'action.
 * Classes prêtes (les poser avec fx.classe) : fxd-eteint, fxd-vague, fxd-bris, fxd-chute, fxd-pris, fxd-secoue, fxd-brille (--fx-c),
 *   fxd-pop, fxd-tampon, fxd-tic ; pièces : <svg class="fxd-trace"><line/></svg> et <span class="fxd-egal">=</span> (dans un parent
 *   position: relative). Mouvement coupé : elles n'animent plus.
 * Déjà ailleurs, à ne pas recopier : compteur (nombre qui défile) dans espaces/jeux/effets-jour.js ; fin d'un duel dans
 *   espaces/duels/vues/fin-fx.js ; fin d'un plateau dans espaces/plateaux/vues/fin-fx.js.
 *
 * Dépendances : core.js (motionAllowed), sons-jeux.js.
 * Exporte : anime, son, premiereFois, PALETTES, creerEffets, creerTicChrono, departPartie.
 */
import { motionAllowed } from './core.js';
import { jouerSonJeu, reveillerSons, sonsPrets } from './sons-jeux.js';

/** Couleurs de confettis par jeu (maquette). */
export const PALETTES = {
  bj: ['#E2C77E', '#2E8052', '#E5484D', '#FBF8F2'],
  pk: ['#E2C77E', '#9E3543', '#2E8052', '#FBF8F2'],
  ct: ['#2F6B4A', '#CF7055', '#E2C77E', '#B9C9A6', '#5E6672'],
  pi: ['#D93A3F', '#3B6FE0', '#2FA35B', '#F2B705', '#E8CC85'],
  ri: ['#7FA3D6', '#D8A75E', '#D93A3F', '#F2EFEA'],
  ch: ['#E2C77E', '#4F8A4A', '#D4A017', '#8C6E45'],
  sh: ['#7FA3D6', '#E0909A', '#E2C77E', '#8FBF9A'],
  mo: ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#E2C77E'],
  du: ['#D93A3F', '#F2B705', '#E2C77E', '#159946', '#2B5AE2', '#4E2398'],
};

// Les sons viennent surtout des états du serveur, hors de tout geste : le contexte audio se réveille sur le geste lui-même (iOS l'exige).
// Au tactile, iOS ne compte le geste qu'à son relâchement : pointerup et click, en plus de pointerdown.
['pointerdown', 'pointerup', 'click', 'keydown'].forEach((t) => document.addEventListener(t, reveillerSons, { capture: true, passive: true }));
if (navigator.userActivation?.hasBeenActive) reveillerSons();   // arrivée après un clic dans la page

/** Vrai si les animations sont permises : préférence « effets », mouvement réduit, réglage calme des duels ou des plateaux. */
export const anime = () => motionAllowed()
  && !document.body.classList.contains('duels-calme') && !document.body.classList.contains('plat-calme');

/**
 * Joue un son du groupe « duels » (S01 à S20).
 * Sauté si le contexte audio ne tourne pas : le navigateur garderait les sons en attente et les jouerait tous d'un coup.
 * @param {string} code S01 à S20
 */
export function son(code) {
  if (sonsPrets()) jouerSonJeu('duels', code);
}

const CLES = new Set();
/** Vrai la première fois qu'on donne cette clé dans la page : garde d'un effet contre un état déjà vu. */
export function premiereFois(cle) {
  if (CLES.has(cle)) return false;
  CLES.add(cle);
  return true;
}

/** Feuille de style des effets, ajoutée une seule fois. */
function styles() {
  if (document.getElementById('fxd-css')) return;
  const s = document.createElement('style');
  s.id = 'fxd-css';
  s.textContent = `
.fxd-eteint { filter: grayscale(1); opacity: .45; transition: filter .6s, opacity .6s; }
.fxd-vague { animation: fxd-vague .7s ease-in-out both; }
.fxd-bris { animation: fxd-bris .6s both; }
.fxd-chute { animation: fxd-chute .7s ease-in forwards; }
.fxd-pris { animation: fxd-pris .6s both; }
.fxd-secoue { animation: fxd-secoue .42s; }
.fxd-brille { box-shadow: 0 0 0 3px var(--fx-c, #E2C77E), 0 0 26px color-mix(in srgb, var(--fx-c, #E2C77E) 60%, transparent) !important; }
.fxd-pop { animation: fxd-pop .4s cubic-bezier(.2, 1.5, .4, 1); }
.fxd-tampon { animation: fxd-tampon .35s .2s both cubic-bezier(.2, 1.5, .4, 1); }
.fxd-tic { animation: fxd-tic .28s; }
.fxd-trace { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 3; }
.fxd-trace line { stroke: #E0909A; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 150; animation: fxd-traceur .5s ease-out both; }
.fxd-egal { position: absolute; left: 50%; top: 50%; translate: -50% -50%; z-index: 3; pointer-events: none; font: 400 70px 'Archivo Black', system-ui, sans-serif; color: #E2C77E; text-shadow: 0 3px 0 #000; animation: fxd-tampon .35s .9s both cubic-bezier(.2, 1.5, .4, 1); }
.fxd-ban { position: fixed; left: 50%; top: 42%; z-index: 9000; pointer-events: none; transform: translate(-50%, -50%) rotate(-2deg); width: max-content; max-width: min(94vw, 720px); padding: 10px 18px; border-radius: 14px; background: rgba(8, 8, 11, .78); text-align: center; color: #fff; font: 400 clamp(26px, 6vw, 46px)/1.08 'Archivo Black', Inter, sans-serif; text-shadow: 0 4px 0 rgba(0, 0, 0, .6), 0 0 30px var(--fxd-c, #E2C77E); animation: fxd-ban 2.4s cubic-bezier(.2, 1.4, .4, 1) both; }
.fxd-ban small { display: block; margin-top: 6px; font: 700 13px/1.25 Inter, system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; }
.fxd-ban.d { transform: translate(-50%, -50%); color: #E9E5E0; text-shadow: 0 3px 0 rgba(0, 0, 0, .7), 0 0 20px rgba(224, 144, 154, .55); animation-name: fxd-band; }
.fxd-ban.n { transform: translate(-50%, -50%); text-shadow: 0 3px 0 rgba(0, 0, 0, .7); animation-name: fxd-band; }
.fxd-compte { position: fixed; left: 50%; top: 42%; z-index: 9000; pointer-events: none; translate: -50% -50%; font: 400 88px 'Archivo Black', Inter, sans-serif; color: var(--fxd-c, #FBD32D); text-shadow: 0 4px 0 #000; animation: fxd-compte .6s both; }
.fxd-confettis { position: fixed; inset: 0; z-index: 8999; overflow: hidden; pointer-events: none; }
.fxd-confettis i { position: absolute; top: -14px; width: 8px; height: 13px; animation: fxd-tombe linear forwards; }
.fxd-jeton { position: fixed; z-index: 8999; pointer-events: none; transition: transform .8s cubic-bezier(.3, .7, .3, 1), opacity .8s; }
@keyframes fxd-vague { 50% { transform: scale(.82); filter: brightness(1.35); } }
@keyframes fxd-bris { to { transform: scale(.9) rotate(-6deg); } }
@keyframes fxd-chute { to { transform: translateY(620%); opacity: 0; } }
@keyframes fxd-pris { to { transform: scale(.2); opacity: 0; } }
@keyframes fxd-secoue { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
@keyframes fxd-pop { from { transform: scale(.94); opacity: .3; } }
@keyframes fxd-tampon { from { transform: rotate(-3deg) scale(2.2); opacity: 0; } }
@keyframes fxd-tic { 40% { transform: scale(1.08); } }
@keyframes fxd-traceur { from { stroke-dashoffset: 150; } to { stroke-dashoffset: 0; } }
@keyframes fxd-ban { 0% { opacity: 0; transform: translate(-50%, -50%) scale(.5) rotate(-6deg); } 20% { opacity: 1; transform: translate(-50%, -50%) scale(1.06) rotate(-2deg); } 35% { transform: translate(-50%, -50%) scale(1) rotate(-2deg); } 85% { opacity: 1; transform: translate(-50%, -50%) rotate(-2deg); } 100% { opacity: 0; transform: translate(-50%, -50%) rotate(-2deg); } }
@keyframes fxd-band { 0% { opacity: 0; transform: translate(-50%, calc(-50% + 16px)); } 14% { opacity: 1; transform: translate(-50%, -50%); } 86% { opacity: 1; transform: translate(-50%, -50%); } 100% { opacity: 0; transform: translate(-50%, -50%); } }
@keyframes fxd-compte { 0% { transform: scale(1.8); opacity: 0; } 30% { transform: scale(1); opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes fxd-tombe { to { transform: translateY(105vh) rotate(540deg); opacity: .7; } }
@media (prefers-reduced-motion: reduce) { [class*="fxd-"] { animation: none !important; transition: none !important; } }
html[data-fx="off"] [class*="fxd-"], body.duels-calme [class*="fxd-"], body.plat-calme [class*="fxd-"] { animation: none !important; transition: none !important; }`;
  document.head.append(s);
}

/**
 * Prépare les effets d'une vue. Tout nœud et tout minuteur créés ici disparaissent avec nettoyer().
 * @returns {object} plus, moins, cascade, classe, rendre, vol, bandeau, confettis, jetons, compte, nettoyer.
 */
export function creerEffets() {
  styles();
  const minuteurs = new Set();
  const noeuds = new Set();
  const classes = new Set();   // [élément, classe] à retirer au nettoyage

  /** setTimeout suivi, annulé par nettoyer(). */
  function plus(fn, ms) {
    const t = setTimeout(() => { minuteurs.delete(t); fn(); }, ms);
    minuteurs.add(t);
    return t;
  }
  /** Annule un minuteur de plus(). */
  function moins(t) { clearTimeout(t); minuteurs.delete(t); }

  /** Pose un nœud d'effet sur <body>, retiré après ms. */
  function vol(n, ms) {
    n.setAttribute('aria-hidden', 'true');
    document.body.append(n);
    noeuds.add(n);
    plus(() => { n.remove(); noeuds.delete(n); }, ms);
    return n;
  }

  /** Traite des éléments l'un après l'autre ; sans animation, tout d'un coup. */
  function cascade(liste, fn, pas) {
    const ecart = anime() ? pas : 0;
    liste.forEach((x, i) => { if (ecart) plus(() => fn(x, i), i * ecart); else fn(x, i); });
    return ecart * liste.length;
  }

  /** Pose une classe d'animation sur un élément, la retire après ms. Sans animation : rien. */
  function classe(el, cls, ms = 900) {
    if (!el || !anime()) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    const c = [el, cls];
    classes.add(c);
    plus(() => { el.classList.remove(cls); classes.delete(c); }, ms);
  }

  /**
   * Fin d'un effet qui laisse des éléments cachés ou éteints : leur rend leur état réel, avec un bref retour.
   * @param {Element[]} liste @param {string[]} cls classes à retirer @param {number} ms
   */
  function rendre(liste, cls, ms) {
    plus(() => liste.forEach((el) => {
      el.classList.remove(...cls);
      el.style.animationDelay = '';
      classe(el, 'fxd-pop', 450);
    }), ms);
  }

  /**
   * Bandeau bref au milieu de l'écran (textes posés en textContent). Sans animation : rien, le résultat est dans la page.
   * @param {string} titre @param {string} [sous]
   * @param {{ton?: ''|'d'|'n', couleur?: string, haut?: string, classe?: string}} [o] ton : fête, sobre, neutre ; haut : position CSS top
   */
  function bandeau(titre, sous, { ton = '', couleur = '', haut = '', classe: cls = '' } = {}) {
    if (!anime()) return null;
    const b = document.createElement('div');
    b.className = `fxd-ban ${ton} ${cls}`.trim();
    if (couleur) b.style.setProperty('--fxd-c', couleur);
    if (haut) b.style.top = haut;
    b.append(titre);
    if (sous) { const m = document.createElement('small'); m.textContent = sous; b.append(m); }
    return vol(b, 2500);
  }

  /** Confettis, retirés tout seuls. Sans animation : rien. */
  function confettis(couleurs = PALETTES.du, n = 46) {
    if (!anime()) return;
    const c = document.createElement('div');
    c.className = 'fxd-confettis';
    for (let i = 0; i < n; i += 1) {
      const d = document.createElement('i');
      d.style.left = `${Math.random() * 100}%`;
      d.style.background = couleurs[i % couleurs.length];
      d.style.animationDuration = `${1.3 + Math.random() * 1.2}s`;
      d.style.animationDelay = `${Math.random() * 0.4}s`;
      c.append(d);
    }
    vol(c, 3000);
  }

  /**
   * Jetons qui volent d'un élément à un autre (position fixe, pas de défilement horizontal). Sans animation : rien.
   * @param {string} cls classe du jeu qui dessine le jeton (ex. bj-anim-jeton) @param {number} n
   * @param {Element|null} de @param {Element|null} vers
   */
  function jetons(cls, n, de, vers) {
    if (!anime() || !de || !vers) return;
    const a = de.getBoundingClientRect(); const b = vers.getBoundingClientRect();
    const ax = a.left + a.width / 2 - 11; const ay = a.top + a.height / 2 - 11;
    const dx = b.left + b.width / 2 - 11 - ax; const dy = b.top + b.height / 2 - 11 - ay;
    for (let i = 0; i < n; i += 1) {
      const j = document.createElement('span');
      j.className = `${cls} fxd-jeton`;
      j.style.left = `${ax + i * 2}px`;
      j.style.top = `${ay}px`;
      vol(j, 1500);
      plus(() => { j.style.transform = `translate(${dx}px,${dy}px) scale(.8)`; j.style.opacity = '.25'; }, 40 + i * 90);
    }
  }

  /** Gros chiffres l'un après l'autre au milieu de l'écran. Sans animation : rien. */
  function compte(liste, pas = 300) {
    if (!anime()) return;
    liste.forEach((x, i) => plus(() => {
      const c = document.createElement('div');
      c.className = 'fxd-compte';
      c.textContent = x;
      vol(c, 600);
    }, i * pas));
  }

  /** Arrête tout et retire tout ce qui a été posé (fin de la vue, onglet masqué). */
  function nettoyer() {
    minuteurs.forEach(clearTimeout);
    minuteurs.clear();
    noeuds.forEach((n) => n.remove());
    noeuds.clear();
    classes.forEach(([el, cls]) => el.classList.remove(cls));
    classes.clear();
  }

  return { plus, moins, cascade, classe, rendre, vol, bandeau, confettis, jetons, compte, nettoyer };
}

/**
 * Tic des dernières secondes (CH1, CH2, CH3) : S14 à 5, 4, 3 et 2 s, S15 à 1 s, seulement à mon tour.
 * Chaque seconde d'une échéance ne sonne qu'une fois, le chrono peut donc repeindre aussi souvent qu'il veut.
 * @returns {(reste: number|null, monTour: boolean, echeance: string, el: Element|null) => void}
 */
export function creerTicChrono() {
  let vue = null; // échéance suivie
  let dernier = Infinity; // dernière seconde jouée : une horloge recalée qui remonte ne rejoue rien
  let fx = null;
  return (reste, monTour, echeance, el) => {
    if (!monTour || reste == null || reste < 1 || reste > 5) return;
    if (echeance !== vue) { vue = echeance; dernier = Infinity; }
    if (reste >= dernier) return;
    dernier = reste;
    son(reste === 1 ? 'S15' : 'S14');
    if (!el || !anime()) return;
    fx = fx || creerEffets();
    fx.classe(el, 'fxd-tic', 300);
  };
}

const PREFIXE_DEPART = 'C’est parti ! · ';

/**
 * La partie démarre (SA3) : 3, 2, 1 bref, S20, bandeau et titre d'onglet « C'est parti ! ». Rien de bloquant : la table s'affiche
 * derrière. Appelé au moment où la salle se ferme, l'effet vit donc sans vue : il s'arrête tout seul, ou en quittant la partie.
 * @param {string} sous ligne sous le bandeau
 */
export function departPartie(sous) {
  const fx = creerEffets();
  const titre = () => { document.title = document.title.replace(PREFIXE_DEPART, ''); };
  const retour = () => { if (!document.hidden) titre(); };
  const quitter = () => {
    fx.nettoyer();
    titre();
    window.removeEventListener('hashchange', quitter);
    document.removeEventListener('visibilitychange', retour);
  };
  if (!document.title.includes(PREFIXE_DEPART)) document.title = PREFIXE_DEPART + document.title;
  window.addEventListener('hashchange', quitter);
  son('S20');
  fx.compte(['3', '2', '1']);
  fx.plus(() => fx.bandeau('C’est parti !', sous, { ton: 'n' }), 950);
  // Onglet masqué : le titre attend le retour sur la page ; sinon il reste le temps de l'effet.
  fx.plus(() => {
    window.removeEventListener('hashchange', quitter);
    if (document.hidden) document.addEventListener('visibilitychange', retour, { once: true });
    else titre();
  }, 3600);
}
