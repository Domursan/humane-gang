// Traitement d'images des lots Framed et GeoGuessr (utilisé par importer-lots.mjs). Aucun accès réseau, aucun secret.
// Framed : six images 16:9 (l'écran .jf-img est en 16/9 avec object-fit: cover : tout autre format y serait coupé).
//   Images 1 à 4 : recadrages emboîtés, du détail au plan large. Ils évitent la zone du titre, notée pour chaque affiche
//   dans lots/framed.json (champ zones ; relue sur planche, aucune détection automatique n'est fiable sur des affiches de
//   260 px), et les petits textes (noms, slogans) détectés ici. La position suit l'intérêt de l'image : contraste, peau, couleur.
//   Image 5 : toute la largeur de l'affiche, autour de l'image 4, avec le moins de titre possible.
//   Image 6 : l'affiche entière, posée sur son propre fond flouté (la première image où le titre est forcément visible).
import sharp from 'sharp';

/** Format de sortie : dans la plage de l'admin (framed-crops.js : 512 à 1280 px). */
export const SORTIE = { l: 800, h: 450, qualite: 72 };
/** Largeur de la photo GeoGuessr : MAX_SIDE de image-compress.js. */
export const GEO = { l: 1600, qualite: 78 };
/** En dessous, l'affiche n'a pas assez de pixels pour six images. */
export const MIN_LARGEUR = 180;
export const MIN_HAUTEUR = 200;
/** Largeur d'analyse (les affiches font souvent 260 px de large). */
const ANALYSE_L = 360;
/** Plus petit recadrage conservé, en pixels de l'image d'origine : en dessous, plus rien n'est lisible. */
const MIN_RECADRAGE_PX = 104;
/** Part de la largeur du plus petit recadrage. */
const MIN_RECADRAGE_PART = 0.26;
/** Marge autour d'une zone de titre, en part de l'affiche. */
const MARGE_ZONE = 0.012;
/** Réductions essayées pour l'image 4 quand le titre laisse trop peu de place. */
const REDUCTIONS = [1, 0.85, 0.72, 0.6, 0.5];

/**
 * Image en niveaux de gris, saturation et teinte chair à la largeur d'analyse.
 * @param {Buffer} buf Image source.
 * @returns {Promise<{l: number, h: number, gris: Uint8Array, sat: Uint8Array, peau: Uint8Array}>}
 */
async function pixels(buf) {
  const { data, info } = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#808080' })
    .resize({ width: ANALYSE_L, kernel: 'lanczos3' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, gris = new Uint8Array(n), sat = new Uint8Array(n), peau = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 3], v = data[i * 3 + 1], b = data[i * 3 + 2];
    const mx = Math.max(r, v, b), mn = Math.min(r, v, b);
    gris[i] = (r * 77 + v * 150 + b * 29) >> 8;
    sat[i] = mx - mn;
    peau[i] = r > 90 && v > 40 && b > 20 && r > v && r > b && r - Math.min(v, b) > 15 && Math.abs(r - v) > 15 ? 1 : 0;
  }
  return { l: info.width, h: info.height, gris, sat, peau };
}

/**
 * Petits textes probables : contours rapprochés sur une ligne (lissage RLSA), composantes en forme de ligne de texte.
 * @param {number} l Largeur.
 * @param {number} h Hauteur.
 * @param {Uint8Array} gris Niveaux de gris.
 * @param {(x0: number, y0: number, x1: number, y1: number) => void} marquer Reçoit chaque boîte.
 */
function lignesTexte(l, h, gris, marquer) {
  const SEUIL = 42, TROU = 9, MIN_RUN = 18;
  const bord = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) for (let x = 1; x < l - 1; x++) {
    if (Math.abs(gris[y * l + x + 1] - gris[y * l + x - 1]) > SEUIL) bord[y * l + x] = 1;
  }
  const run = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    let debut = -1, dernier = -99, nb = 0;
    const clore = () => {
      if (debut >= 0 && dernier - debut >= MIN_RUN && nb / (dernier - debut) >= 0.2) run.fill(1, y * l + debut, y * l + dernier + 1);
      debut = -1; nb = 0;
    };
    for (let x = 0; x < l; x++) {
      if (!bord[y * l + x]) continue;
      if (x - dernier > TROU) clore();
      if (debut < 0) debut = x;
      dernier = x; nb++;
    }
    clore();
  }
  const vu = new Uint8Array(l * h), pile = [];
  for (let d = 0; d < l * h; d++) {
    if (!run[d] || vu[d]) continue;
    let x0 = l, x1 = 0, y0 = h, y1 = 0, nb = 0;
    pile.push(d); vu[d] = 1;
    while (pile.length) {
      const p = pile.pop(), x = p % l, y = (p - x) / l;
      nb++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - l, p + l]) {
        if (q < 0 || q >= l * h || vu[q] || !run[q]) continue;
        vu[q] = 1; pile.push(q);
      }
    }
    const lg = x1 - x0 + 1, ht = y1 - y0 + 1;
    if (lg < 22 || ht < 4 || ht > h * 0.3 || lg / ht < 1.4 || nb / (lg * ht) < 0.3) continue;
    marquer(x0, y0, x1, y1);
  }
}

/** Table cumulée : somme d'un rectangle en temps constant. */
function cumul(l, h, val) {
  const t = new Float64Array((l + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let ligne = 0;
    for (let x = 1; x <= l; x++) {
      ligne += val((x - 1) + (y - 1) * l);
      t[y * (l + 1) + x] = t[(y - 1) * (l + 1) + x] + ligne;
    }
  }
  return (x, y, w, ht) => t[(y + ht) * (l + 1) + x + w] - t[y * (l + 1) + x + w] - t[(y + ht) * (l + 1) + x] + t[y * (l + 1) + x];
}

/**
 * Analyse une image : titre (zones notées), petits textes et intérêt, sommables par rectangle.
 * @param {Buffer} buf Image source.
 * @param {number[][]} zones Zones du titre [x0, y0, x1, y1], en parts de l'image.
 * @returns {Promise<object>}
 */
async function analyser(buf, zones) {
  const { l, h, gris, sat, peau } = await pixels(buf);
  const texte = new Uint8Array(l * h), titre = new Uint8Array(l * h);
  const remplir = (masque, x0, y0, x1, y1) => {
    for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) masque.fill(1, y * l + Math.max(0, x0), y * l + Math.min(l - 1, x1) + 1);
  };
  lignesTexte(l, h, gris, (x0, y0, x1, y1) => remplir(texte, x0 - 3, y0 - 3, x1 + 3, y1 + 3));
  for (const [x0, y0, x1, y1] of zones) {
    remplir(titre, Math.floor((x0 - MARGE_ZONE) * l), Math.floor((y0 - MARGE_ZONE) * h), Math.ceil((x1 + MARGE_ZONE) * l), Math.ceil((y1 + MARGE_ZONE) * h));
  }
  const interet = new Float32Array(l * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < l - 1; x++) {
    const i = y * l + x;
    const g = Math.abs(gris[i + 1] - gris[i - 1]) + Math.abs(gris[i + l] - gris[i - l]);
    interet[i] = Math.min(g, 60) / 60 + sat[i] / 510 + peau[i] * 0.8;
  }
  return { l, h, texte: cumul(l, h, (i) => texte[i]), titre: cumul(l, h, (i) => titre[i]),
    interet: cumul(l, h, (i) => (titre[i] ? 0 : interet[i])) };
}

/** Pénalité de position (0 à 1) : le haut et le bas des affiches portent noms, logos et générique. */
function bande(y, ht, h) {
  return Math.max(Math.max(0, 0.1 - y / h) / 0.1, Math.max(0, (y + ht) / h - 0.84) / 0.16);
}

/**
 * Meilleure position d'un rectangle dans une zone : le moins de titre, puis le moins de petit texte et le plus d'intérêt.
 * @returns {{x: number, y: number, w: number, h: number, titre: number, texte: number}|null} titre, texte : parts couvertes
 */
function placer(a, w, ht, zone, poidsBande = 2) {
  let meilleur = null;
  const pas = Math.max(2, Math.round(w / 24));
  const xMax = zone.x + zone.w - w, yMax = zone.y + zone.h - ht;
  for (let y = zone.y; y <= yMax + pas - 1; y += pas) {
    for (let x = zone.x; x <= xMax + pas - 1; x += pas) {
      const xx = Math.min(x, xMax), yy = Math.min(y, yMax), s = w * ht;
      const titre = a.titre(xx, yy, w, ht) / s, texte = a.texte(xx, yy, w, ht) / s;
      const score = a.interet(xx, yy, w, ht) / s - titre * 40 - texte * 2 - bande(yy, ht, a.h) * poidsBande;
      if (!meilleur || score > meilleur.score) meilleur = { x: xx, y: yy, w, h: ht, score, titre, texte };
    }
  }
  return meilleur;
}

/** Largeurs des images 1 à 5, en pixels d'analyse : suite géométrique du détail à la largeur entière. */
function largeurs(a, largeurSource) {
  const maxW = Math.min(a.l, Math.floor(a.h * 16 / 9));
  const px = Math.max(MIN_RECADRAGE_PX * (a.l / largeurSource), a.l * MIN_RECADRAGE_PART);
  const k = Math.pow(maxW / Math.min(px, maxW * 0.8), 1 / 4);
  return Array.from({ length: 5 }, (_, i) => Math.round(maxW / k ** (4 - i)));
}

/** Enchaînement emboîté : l'image 4 d'abord (réduite si le titre ne laisse pas la place), les plus serrées dedans, la bande autour. */
function enchainer(a, largeurSource) {
  const t = largeurs(a, largeurSource), rects = new Array(5), h169 = (w) => Math.round(w * 9 / 16);
  const tout = { x: 0, y: 0, w: a.l, h: a.h };
  for (const r of REDUCTIONS) {
    const w = Math.max(Math.round(t[0] * 0.8), Math.round(t[3] * r));
    rects[3] = placer(a, w, h169(w), tout);
    if (rects[3].titre === 0) break;
  }
  const k4 = rects[3].w / t[3];
  for (let i = 2; i >= 0; i--) {
    const w = Math.max(Math.round(t[0] * 0.8), Math.min(rects[i + 1].w - 2, Math.round(t[i] * k4)));
    rects[i] = placer(a, w, h169(w), rects[i + 1], 0);
  }
  const w5 = t[4], h5 = h169(w5), r4 = rects[3];
  const x0 = Math.max(0, r4.x + r4.w - w5), y0 = Math.max(0, r4.y + r4.h - h5);
  const x1 = Math.min(a.l, r4.x + w5), y1 = Math.min(a.h, r4.y + h5);
  rects[4] = placer(a, w5, h5, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, 0.5);
  return rects;
}

/** Image entière posée sur son fond flouté, en 16:9 : object-fit: cover n'en coupe rien. */
async function imageEntiere(pivot) {
  const { l, h, qualite } = SORTIE;
  const fond = await sharp(pivot).resize(l, h, { fit: 'cover' }).blur(18).modulate({ brightness: 0.45 }).toBuffer();
  const avant = await sharp(pivot).resize(l, h, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp(fond).composite([{ input: avant, gravity: 'center' }]).webp({ quality: qualite + 6 }).toBuffer();
}

/**
 * Les six images d'une affiche, de la plus énigmatique à l'affiche entière.
 * @param {Buffer} buf Affiche.
 * @param {number[][]} [zones] Zones du titre [x0, y0, x1, y1], en parts de l'affiche.
 * @returns {Promise<{images: Buffer[], rects: object[], titre: number[]}>} titre : part de titre des images 1 à 5
 */
export async function imagesAffiche(buf, zones = []) {
  const pivot = await sharp(buf, { failOn: 'none' }).rotate().flatten({ background: '#202020' }).png().toBuffer();
  const { width: L, height: H } = await sharp(pivot).metadata();
  const a = await analyser(pivot, zones);
  const rects = enchainer(a, L), k = L / a.l, images = [];
  for (const r of rects) {
    const left = Math.round(r.x * k), top = Math.round(r.y * k);
    const box = { left, top, width: Math.min(Math.round(r.w * k), L - left), height: Math.min(Math.round(r.h * k), H - top) };
    images.push(await sharp(pivot).extract(box).resize(SORTIE.l, SORTIE.h, { fit: 'fill', kernel: 'lanczos3' })
      .sharpen({ sigma: 0.8 }).webp({ quality: SORTIE.qualite }).toBuffer());
  }
  images.push(await imageEntiere(pivot));
  return { images, rects, titre: rects.map((r) => Number(r.titre.toFixed(3))) };
}

/**
 * Motif de refus d'une affiche téléchargée (illisible, trop petite, presque unie), ou null si elle convient.
 * @param {Buffer} buf Affiche téléchargée.
 * @returns {Promise<string|null>}
 */
export async function refusAffiche(buf) {
  try {
    const m = await sharp(buf, { failOn: 'none' }).metadata();
    const s = await sharp(buf, { failOn: 'none' }).flatten({ background: '#ffffff' }).stats();
    if (!m.width || !m.height) return 'image illisible';
    if (m.width < MIN_LARGEUR || m.height < MIN_HAUTEUR) return `trop petite (${m.width} × ${m.height})`;
    if (s.entropy < 2.5) return 'image presque unie';
    return null;
  } catch { return 'image illisible'; }
}

/**
 * Photo GeoGuessr : réduite et réencodée, sans métadonnées (sharp les retire par défaut : ni EXIF ni position).
 * @param {Buffer} buf Photo.
 * @returns {Promise<Buffer>}
 */
export function imagePhoto(buf) {
  return sharp(buf, { failOn: 'none' }).rotate().resize({ width: GEO.l, withoutEnlargement: true, kernel: 'lanczos3' })
    .webp({ quality: GEO.qualite }).toBuffer();
}
