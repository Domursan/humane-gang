// Faux contexte 2D de canevas pour tester les mini-jeux de l'arcade sans navigateur (node).
// Toute méthode appelée ne fait rien ; measureText renvoie une largeur estimée ; les dégradés acceptent addColorStop.
// Exporte : fauxCtx() et simule(JEU, { secondes, triche, entree }) qui joue une partie image par image.
export function fauxCtx() {
  const cible = { canvas: { width: 360, height: 420 } };
  return new Proxy(cible, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/**
 * Joue une partie : init, puis update + draw toutes les 1/30 s.
 * @param {object} JEU mini-jeu
 * @param {{secondes?: number, triche?: object, entree?: (s, t) => object}} o entree(s, t) donne l'entrée de chaque image
 * @returns {{s: object, t: number, maxParSeconde: number}} état final, durée jouée, plus forte cadence de points sur 1 s
 */
export function simule(JEU, { secondes = 60, triche = { coeurs: false, immortel: false }, entree = () => ({}), reduit = false } = {}) {
  const ctx = fauxCtx();
  const s = JEU.init({ reduit });
  s.triche = triche;
  const dt = 1 / 30;
  let t = 0; const hist = [];
  while (t < secondes && !JEU.fini(s)) {
    const e = { cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, action: false, tenu: false, ...entree(s, t) };
    JEU.update(s, dt, e);
    JEU.draw(ctx, s);
    t += dt;
    hist.push([t, JEU.score(s)]);
  }
  let maxParSeconde = 0;
  for (let i = 0, j = 0; i < hist.length; i++) {
    while (hist[i][0] - hist[j][0] > 1) j++;
    maxParSeconde = Math.max(maxParSeconde, hist[i][1] - hist[j][1]);
  }
  return { s, t, maxParSeconde };
}
