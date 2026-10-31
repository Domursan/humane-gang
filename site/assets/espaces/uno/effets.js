// ===== Humane Gang — Uno : effets de la table et sons (maquette validée, oct. 2026) =====
/*
 * Rôle : les briques visuelles des coups, sans aucune connaissance des règles ni de l'état de la partie :
 * vol d'une carte (calque fixe posé sur <body>), impact sur la défausse, onde de couleur et teinte du tapis,
 * tour de l'anneau arc-en-ciel, pluie de petites cartes. vues/table.js et vues/fin.js décident quand les jouer.
 * Tout se nettoie : chaque nœud créé a sa fin programmée, et nettoyer() / detruire() retirent ce qui reste.
 * Mouvement réduit ou option calme : aucun visuel ici (la teinte du tapis reste, c'est un état).
 * Styles : table.css (.uno-calque, .uno-fx-*, .uno-onde-tapis). Sons : commun/sons-jeux.js, groupe « uno ».
 * Dépendances : commun/sons-jeux.js, ./cartes.js (COULEURS).
 * Exporte : mouvementReduit, son, rejouer, presse, boite, creerEffets.
 */
import { jouerSonJeu, reveillerSons, sonsPrets } from '../../commun/sons-jeux.js';
import { COULEURS } from './cartes.js';

/** Vrai si les animations sont coupées (préférence système ou option calme du membre). */
const mqReduit = window.matchMedia('(prefers-reduced-motion: reduce)');
export const mouvementReduit = () => document.body.classList.contains('uno-calme') || mqReduit.matches;

// Les sons viennent surtout des états du serveur, hors de tout geste : le contexte audio se réveille sur le geste lui-même (iOS l'exige).
document.addEventListener('pointerdown', reveillerSons, { capture: true, passive: true });
document.addEventListener('keydown', reveillerSons, { capture: true, passive: true });
if (navigator.userActivation?.hasBeenActive) reveillerSons();   // arrivée à la table après un clic dans la salle

/**
 * Joue un son du groupe « uno » (UN1 à UN14).
 * Sauté si le contexte audio ne tourne pas : le navigateur garderait les sons en attente et les jouerait tous d'un coup.
 */
export function son(code) {
  if (sonsPrets()) jouerSonJeu('uno', code);
}

/** Relance une animation CSS portée par une classe. */
export const rejouer = (n, cls) => { if (!n) return; n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };

/** Petit enfoncement d'un bouton au clic. */
export function presse(n) {
  if (!n || mouvementReduit()) return;
  rejouer(n, 'uno-fx-presse');
  n.addEventListener('animationend', () => n.classList.remove('uno-fx-presse'), { once: true });
}

/** Centre et largeur d'un élément à l'écran. */
export function boite(n) {
  const r = n.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: n.offsetWidth || r.width };
}

const tr = (x, y, r, s, ry) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) rotateY(${ry}deg) scale(${s.toFixed(3)})`;

/**
 * Prépare les effets d'une table.
 * @param {{ table: HTMLElement, plateau: HTMLElement, pile: HTMLElement, ovale: HTMLElement, onde: HTMLElement }} n zones de la table.
 * @returns {object} voler, annulerVols, impact, onde, teinte, vrille, pluie, plus, moins, nettoyer, detruire.
 */
export function creerEffets({ table, plateau, pile, ovale, onde: zoneOnde }) {
  const calque = document.createElement('div');
  calque.className = 'uno-calque';
  calque.setAttribute('aria-hidden', 'true');
  document.body.append(calque);

  const minuteurs = new Set();
  const vols = new Set();
  const fond = zoneOnde.querySelector('u');
  const cercle = zoneOnde.querySelector('i');
  let teinteActuelle = null;

  /** setTimeout suivi, annulé par nettoyer(). */
  function plus(fn, ms) {
    const t = setTimeout(() => { minuteurs.delete(t); fn(); }, ms);
    minuteurs.add(t);
    return t;
  }

  /** Annule un minuteur de plus(). */
  function moins(t) { clearTimeout(t); minuteurs.delete(t); }

  /**
   * Fait voler une carte d'un point à un autre (calque fixe, jamais de défilement horizontal).
   * @param {string} html carte de départ.
   * @param {{x:number,y:number,l:number}} de @param {{x:number,y:number,l:number}} a
   * @param {{duree?:number,r0?:number,r1?:number,rm?:number,arc?:number,e1?:number,gonfle?:number,face?:string}} [o]
   *   face : HTML montré à mi-vol (retournement).
   * @returns {HTMLElement|null} le nœud volant.
   */
  function voler(html, de, a, o = {}) {
    if (mouvementReduit()) return null;
    const d = o.duree || 420;
    const v = document.createElement('div');
    v.className = 'uno-fx-vol';
    v.innerHTML = html;
    calque.append(v);
    const w = v.offsetWidth; const h = v.offsetHeight;
    const x0 = de.x - w / 2; const y0 = de.y - h / 2; const x1 = a.x - w / 2; const y1 = a.y - h / 2;
    const e0 = de.l / w; const e1 = o.e1 || a.l / w;
    const em = Math.max(e0, e1) * (o.gonfle || 1.1);
    const arc = o.arc ?? -40; const r0 = o.r0 || 0; const r1 = o.r1 || 0;
    const rm = o.rm ?? (r0 + r1) / 2 + 12;
    v.animate([
      { transform: tr(x0, y0, r0, e0, 0), offset: 0, easing: 'cubic-bezier(.2,.7,.4,1)' },
      { transform: tr((x0 + x1) / 2, (y0 + y1) / 2 + arc, rm, em, o.face ? 90 : 0), offset: 0.55, easing: 'cubic-bezier(.5,0,.9,.6)' },
      { transform: tr(x1, y1, r1, e1, 0), offset: 1 },
    ], { duration: d, fill: 'forwards' });
    vols.add(v);
    if (o.face) plus(() => { v.innerHTML = o.face; }, d * 0.55);
    plus(() => { v.remove(); vols.delete(v); }, d + 40);
    return v;
  }

  /** Retire les cartes en vol, sauf celle indiquée. */
  function annulerVols(sauf = null) {
    for (const v of [...vols]) if (v !== sauf) { v.remove(); vols.delete(v); }
  }

  /** Impact sur le dessus de la défausse : la carte s'écrase, cercle à sa couleur, poussière. */
  function impact(c, fort) {
    const haut = pile.querySelector('.uno-pile-haut');
    if (!haut || mouvementReduit()) return;
    const b = boite(haut);
    const couleur = c.couleur === 'k' ? '#E2C77E' : (COULEURS[c.couleur]?.hex || '#E2C77E');
    haut.animate([{ scale: fort ? 1.2 : 1.1 }, { scale: 0.96, offset: 0.45 }, { scale: 1 }], { duration: fort ? 300 : 200, easing: 'ease-out' });
    pile.animate([{ translate: `0 ${fort ? 5 : 3}px` }, { translate: '0 0' }], { duration: 170, easing: 'ease-out' });
    const w = haut.offsetWidth; const h = haut.offsetHeight;
    const anneau = document.createElement('div');
    anneau.className = 'uno-fx-cercle';
    anneau.style.cssText = `left:${b.x - w / 2}px;top:${b.y - h / 2}px;width:${w}px;height:${h}px;--c:${couleur}`;
    calque.append(anneau);
    plus(() => anneau.remove(), 520);
    const nb = fort ? 16 : 8;
    for (let i = 0; i < nb; i++) {
      const g = document.createElement('div');
      g.className = 'uno-fx-grain';
      g.style.cssText = `left:${b.x}px;top:${b.y}px;--c:${couleur}`;
      calque.append(g);
      const a = i / nb * Math.PI * 2 + Math.random() * 0.5;
      const r = (fort ? 90 : 56) + Math.random() * 34;
      g.animate([{ transform: 'translate(0,0)', opacity: 1 },
        { transform: `translate(${(Math.cos(a) * r * 0.9).toFixed(1)}px,${(Math.sin(a) * r * 1.2).toFixed(1)}px) rotate(120deg)`, opacity: 0 }],
      { duration: 380, easing: 'cubic-bezier(.1,.7,.3,1)', fill: 'forwards' });
      plus(() => g.remove(), 400);
    }
  }

  /** Teinte légère du tapis (couleur demandée par un Joker), null pour l'enlever. */
  function teinte(c) {
    if (c === teinteActuelle) return;
    teinteActuelle = c;
    const hex = COULEURS[c]?.hex;
    if (hex) fond.style.background = hex;
    fond.style.opacity = hex ? '.16' : '0';
  }

  /** Onde de couleur : part de la défausse, traverse le tapis, l'anneau s'illumine. */
  function onde(c) {
    const hex = COULEURS[c]?.hex;
    const haut = pile.querySelector('.uno-pile-haut');
    if (!hex || !haut || mouvementReduit()) return;
    const r = zoneOnde.getBoundingClientRect();
    const b = boite(haut);
    const t = Math.max(r.width, r.height) * 2.3;
    cercle.style.cssText = `left:${b.x - r.left - t / 2}px;top:${b.y - r.top - t / 2}px;width:${t}px;height:${t}px;background:radial-gradient(circle, transparent 0 52%, ${hex} 66%, ${hex} 70%, transparent 72%)`;
    cercle.animate([{ transform: 'scale(.04)', opacity: 0.95 }, { transform: 'scale(1)', opacity: 0.35 }],
      { duration: 760, easing: 'cubic-bezier(.2,.6,.3,1)' });
    ovale.animate([{ boxShadow: '0 0 0 rgba(0,0,0,0)' }, { boxShadow: `0 0 46px ${hex}`, offset: 0.35 }, { boxShadow: '0 0 0 rgba(0,0,0,0)' }], { duration: 900 });
  }

  /** Un tour de l'anneau arc-en-ciel, à l'envers pour une Inversion vers l'antihoraire. */
  function vrille(inverse) {
    if (mouvementReduit()) return;
    ovale.classList.remove('uno-fx-vrille', 'inverse');
    void ovale.offsetWidth;
    ovale.classList.add('uno-fx-vrille');
    if (inverse) ovale.classList.add('inverse');
    plus(() => ovale.classList.remove('uno-fx-vrille', 'inverse'), 980);
  }

  /** Pluie de petites cartes sur la table. */
  function pluie() {
    if (mouvementReduit()) return;
    const teintes = ['#D93A3F', '#F2B705', '#1F9D55', '#2A6FDB', '#E2C77E'];
    for (let i = 0; i < 34; i++) {
      const c = document.createElement('i');
      c.className = 'uno-fx-pluie';
      c.style.cssText = `left:${Math.random() * 100}%;background:${teintes[i % 5]};animation-duration:${1.1 + Math.random() * 0.9}s;animation-delay:${Math.random() * 0.4}s`;
      plateau.append(c);
      plus(() => c.remove(), 2500);
    }
  }

  /** Arrête tout et retire tous les nœuds d'effet (onglet masqué, reprise, fin de la vue). */
  function nettoyer() {
    minuteurs.forEach(clearTimeout);
    minuteurs.clear();
    vols.clear();
    calque.replaceChildren();
    table.querySelectorAll('.uno-coup, .uno-fx-pluie').forEach((n) => n.remove());
    ovale.classList.remove('uno-fx-vrille', 'inverse');
  }

  return {
    voler, annulerVols, impact, onde, teinte, vrille, pluie, plus, moins, nettoyer,
    detruire() { nettoyer(); calque.remove(); },
  };
}
