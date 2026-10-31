// ===== Humane Gang — effets des jeux quotidiens : fin de partie, sons, petites animations =====
/**
 * Rôle : le moment commun aux 19 jeux quotidiens (maquette validée en oct. 2026). Quand une partie vient de se terminer
 *   sous les yeux du membre, finDePartie() fait apparaître la carte de fin, pose le tampon « N PTS », joue le son selon
 *   les points, fait défiler les Paillettes et, à 10 points seulement, lance des confettis. Puis les classements montés
 *   sont rechargés (la tuile de la page Jeux passe au vert).
 *   Les sons suivent la préférence « Sons des jeux » (sons-jeux.js) ; sans mouvement (préférence « effets » coupée ou
 *   mouvement réduit), le résultat s'affiche directement et les sons restent, comme dans les duels.
 * Dépendances : core.js (motionAllowed), sons-jeux.js (jouerSonJeu), paillettes.js (paillSym), ./classement-jeux.js (chargé à la demande).
 * Exporte : sonJour, pointsDeGain, rejoue, secouer, enCascade, compteur, finDePartie.
 */
import { motionAllowed } from '../../commun/core.js';
import { jouerSonJeu } from '../../commun/sons-jeux.js';
import { paillSym } from '../../commun/paillettes.js';

const nf = new Intl.NumberFormat('fr-CH');
const COULEURS = ['#2FD16B', '#FCA301', '#E9849D', '#FFD62A', '#6FB3F2'];

/** Feuille de style des effets, ajoutée une seule fois. */
function styles() {
  if (document.getElementById('fxj-css')) return;
  const s = document.createElement('style');
  s.id = 'fxj-css';
  s.textContent = `
.fxj-carte { position: relative; }
.fxj-carte .fxj-titre-place { padding-right: 76px; }
.fxj-tampon { position: absolute; top: 12px; right: 12px; z-index: 1; font: 400 14px/1 var(--font-pixel, monospace); color: #08080B; background: #2FD16B; padding: 6px 8px; transform: rotate(-4deg); }
.fxj-tampon.is-rate { background: #3A3A40; color: #F1EFE9; }
.fxj-gain { font-weight: 800; font-size: 24px; line-height: 1.15; color: var(--sand); font-variant-numeric: tabular-nums; margin: 2px 0 0; }
.fxj-entree { animation: fxj-pop .4s cubic-bezier(.2, 1.5, .4, 1); }
.fxj-entree .fxj-tampon { animation: fxj-tampon .35s .3s both cubic-bezier(.2, 1.5, .4, 1); }
.fxj-secoue { animation: fxj-secoue .42s; }
.fxj-saut { animation: fxj-saut .35s; }
.fxj-flip { animation: fxj-flip .36s ease-in-out; }
.fxj-lueur { animation: fxj-lueur 1s; }
.fxj-eclat { animation: fxj-eclat .7s both; }
.fxj-pop { animation: fxj-pop .45s cubic-bezier(.2, 1.4, .4, 1); }
.fxj-bon { animation: fxj-bon .7s; }
.fxj-confettis { position: fixed; inset: 0; z-index: 9000; overflow: hidden; pointer-events: none; }
.fxj-confettis i { position: absolute; top: -14px; width: 7px; height: 11px; animation: fxj-tombe linear forwards; }
@keyframes fxj-pop { from { transform: scale(.92); opacity: .3; } }
@keyframes fxj-tampon { from { transform: rotate(-4deg) scale(2.2); opacity: 0; } }
@keyframes fxj-secoue { 20%, 60% { transform: translateX(-6px); } 40%, 80% { transform: translateX(6px); } }
@keyframes fxj-saut { 40% { transform: translateY(-6px) scale(1.08); } }
@keyframes fxj-flip { 50% { transform: rotateX(90deg); } }
@keyframes fxj-lueur { from { background-color: rgba(255, 214, 42, .35); } }
@keyframes fxj-eclat { 40% { background-color: #2FD16B; color: #08080B; } }
@keyframes fxj-bon { 40% { box-shadow: 0 0 0 6px rgba(47, 209, 107, .35); } }
@keyframes fxj-tombe { to { transform: translateY(105vh) rotate(540deg); opacity: .7; } }
@media (prefers-reduced-motion: reduce) { [class*="fxj-"] { animation: none !important; } }
html[data-fx="off"] [class*="fxj-"] { animation: none !important; }`;
  document.head.append(s);
}

/**
 * Joue un son des jeux quotidiens.
 * @param {string} code code de la maquette (F1…, G1…, D1…, C1…, M1…, P1…, Q1…)
 */
export const sonJour = (code) => jouerSonJeu('quotidien', code);

/**
 * Points sur 10 d'une partie d'après les Paillettes gagnées (migration 179 : 200 à 10 points, −15 par point manquant).
 * @param {number} gain Paillettes de la partie
 * @returns {number} points de 0 à 10
 */
export const pointsDeGain = (gain) => Math.max(0, Math.min(10, Math.round((Number(gain) - 50) / 15)));

/**
 * Relance une animation CSS sur un élément (sans mouvement : ne fait rien). L'animation est coupée une fois jouée : les
 * onglets masqués gardent leur contenu, et elle repartirait au retour sur l'onglet.
 * @param {Element|null} el élément
 * @param {string} cls classe d'animation (fxj-secoue, fxj-saut, fxj-flip, fxj-lueur, fxj-eclat, fxj-pop, fxj-bon)
 */
export function rejoue(el, cls) {
  if (!el || !motionAllowed()) return;
  styles();
  el.style.animation = '';
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  const fin = (e) => { if (e.target !== el) return; el.style.animation = 'none'; el.removeEventListener('animationend', fin); };
  el.addEventListener('animationend', fin);
}

/** Secoue un élément (mauvais essai). */
export const secouer = (el) => rejoue(el, 'fxj-secoue');

/**
 * Traite des éléments l'un après l'autre. Sans mouvement, tout est traité d'un coup.
 * @param {Array} liste éléments
 * @param {(x: any, i: number) => void} fn action sur chacun
 * @param {number} pas écart en ms
 * @returns {number} durée totale en ms (0 sans mouvement)
 */
export function enCascade(liste, fn, pas) {
  const ecart = motionAllowed() ? pas : 0;
  liste.forEach((x, i) => { if (ecart) setTimeout(() => fn(x, i), i * ecart); else fn(x, i); });
  return ecart * liste.length;
}

/**
 * Fait défiler un nombre dans un élément. Sans mouvement : la valeur finale tout de suite.
 * @param {Element} el élément
 * @param {number} a valeur finale
 * @param {(v: number) => string} ecrire HTML à afficher pour une valeur
 * @param {number} [ms] durée
 * @param {number} [de] valeur de départ
 */
export function compteur(el, a, ecrire, ms = 800, de = 0) {
  if (!motionAllowed()) { el.innerHTML = ecrire(a); return; }
  const t0 = performance.now();
  const pas = (t) => {
    if (!el.isConnected) return;
    const p = Math.max(0, Math.min(1, (t - t0) / ms));
    el.innerHTML = ecrire(Math.round(de + (a - de) * p));
    if (p < 1) requestAnimationFrame(pas);
  };
  requestAnimationFrame(pas);
}

/** Confettis (10 points seulement), retirés tout seuls. */
function confettis() {
  const c = document.createElement('div');
  c.className = 'fxj-confettis';
  c.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 44; i += 1) {
    const b = document.createElement('i');
    b.style.left = `${Math.random() * 100}%`;
    b.style.background = COULEURS[i % COULEURS.length];
    b.style.animationDuration = `${1 + Math.random()}s`;
    b.style.animationDelay = `${Math.random() * .3}s`;
    c.append(b);
  }
  document.body.append(c);
  setTimeout(() => c.remove(), 2500);
}

/**
 * Habille la carte de fin d'un jeu quotidien : tampon de points, ligne de gain et, si animer, tout le moment de fin.
 * À appeler après le dernier dessin de la carte. animer: false pour une partie déjà finie (retour sur la page).
 * @param {Element|null} carte carte de fin déjà dans la page
 * @param {{points: number, gain?: number|null, animer?: boolean, cibleGain?: Element|null}} o points sur 10, Paillettes,
 *   cibleGain : élément déjà affiché qui reçoit le gain (sinon une ligne est ajoutée à la carte)
 */
export function finDePartie(carte, { points, gain = null, animer = true, cibleGain = null }) {
  if (!carte || carte.dataset.fxj) return;
  styles();
  carte.dataset.fxj = '1';
  const p = Math.max(0, Math.min(10, Number(points) || 0));
  carte.classList.add('fxj-carte');
  carte.firstElementChild?.classList.add('fxj-titre-place');
  const tampon = document.createElement('span');
  tampon.className = `fxj-tampon${p ? '' : ' is-rate'}`;
  tampon.textContent = `${p} ${p > 1 ? 'PTS' : 'PT'}`;
  carte.append(tampon);
  const ecrire = (v) => `+${nf.format(v)} ${paillSym()}`;
  let ligne = cibleGain;
  if (gain != null && !ligne) {
    ligne = document.createElement('p');
    ligne.className = 'fxj-gain';
    carte.append(ligne);
  }
  if (gain != null) ligne.innerHTML = ecrire(animer && motionAllowed() ? 0 : gain);
  if (!animer) return;
  sonJour(p === 10 ? 'F1' : p === 0 ? 'F4' : p <= 3 ? 'F3' : 'F2');
  if (motionAllowed()) {
    carte.classList.add('fxj-entree');
    setTimeout(() => { carte.style.animation = 'none'; tampon.style.animation = 'none'; }, 900);
    if (p === 10) confettis();
  }
  if (gain != null) setTimeout(() => { sonJour('F5'); compteur(ligne, gain, ecrire); }, 420);
  setTimeout(() => { import('./classement-jeux.js').then((m) => m.rafraichirClassements()).catch(() => {}); }, 1300);
}
