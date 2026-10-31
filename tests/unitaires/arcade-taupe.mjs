// Test du mini-jeu Tape-taupe (eggs/jeu-taupe.js) : règles, cadence serveur, codes de triche, sans navigateur : node tests/unitaires/arcade-taupe.mjs
import { JEU } from '../../site/assets/espaces/arcade/jeu-taupe.js';
import { fauxCtx } from '../lib/faux-canevas.mjs';

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('OK     ' + m); } else { ko++; console.log('ECHEC  ' + m); } };
/** Cadence serveur : 5 points par seconde au plus ; la mission vise moins de 3. */
const SERVEUR = 5;
const PAS = 1 / 30;

/** Le premier avatar tapable (membre, sorti ou en montée, pas encore tapé), ou null. */
function tapable(s) {
  return s.trous.find((t) => (t.etat === 'monte' || t.etat === 'sorti') && t.h >= 0.3 && !t.cornichon && !t.fait) ?? null;
}

/** Entrée « intelligente » : tape chaque membre visible, sans toucher aux cornichons. */
function intelligent(s) {
  const t = tapable(s);
  return t ? { action: true, cible: t.x, cibleY: t.y - 20 } : {};
}

/** Entrée au clavier : amène le curseur sur un membre visible, puis tape avec espace (sans pointeur). */
function clavier(s) {
  const t = tapable(s);
  if (!t) return {};
  const idx = s.trous.indexOf(t);
  const l = Math.floor(idx / 3), c = idx % 3;
  if (s.curseur.l > l) return { dir: 'haut' };
  if (s.curseur.l < l) return { dir: 'bas' };
  if (s.curseur.c > c) return { dir: 'gauche' };
  if (s.curseur.c < c) return { dir: 'droite' };
  return { action: true };
}

/** Entrée « tape tout » : tape chaque avatar visible, cornichons compris. */
function toutTaper(s) {
  const t = s.trous.find((h) => (h.etat === 'monte' || h.etat === 'sorti') && h.h >= 0.3 && !h.fait);
  return t ? { action: true, cible: t.x, cibleY: t.y - 20 } : {};
}

/** Canevas factice qui compte les appels à bezierCurveTo (utilisés seulement par les cœurs). */
function espion() {
  const compte = { n: 0 };
  const ctx = new Proxy(fauxCtx(), {
    get(t, k) { if (k === 'bezierCurveTo') return () => { compte.n++; }; return Reflect.get(t, k); },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, compte };
}

/**
 * Joue une partie image par image.
 * @returns {{s: object, t: number, points: number[], cornichons: number}} état, durée, instants des points, sorties de cornichons
 */
function joue({ triche = { coeurs: false, immortel: false }, secondes = 120, entree = () => ({}), ctx = fauxCtx() } = {}) {
  const s = JEU.init({ reduit: false });
  s.triche = triche;
  const points = [];
  let t = 0, dernier = 0, cornichons = 0;
  const dejaSortis = new Set();
  while (t < secondes && !JEU.fini(s)) {
    const e = { cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, action: false, tenu: false, ...entree(s) };
    JEU.update(s, PAS, e);
    for (const h of s.trous) {
      if (h.cornichon && h.etat === 'monte' && !dejaSortis.has(h)) { dejaSortis.add(h); cornichons++; }
      if (h.etat === 'vide') dejaSortis.delete(h);
    }
    if (JEU.score(s) > dernier) { points.push(t); dernier = JEU.score(s); }
    JEU.draw(ctx, s);
    t += PAS;
  }
  return { s, t, points, cornichons };
}

/** Points sur la seconde la plus chargée. */
function pireSeconde(points) {
  let max = 0;
  for (const p0 of points) max = Math.max(max, points.filter((p) => p >= p0 && p - p0 <= 1).length);
  return max;
}

// 1. Partie de 120 s avec un joueur qui tape bien : aucune exception, score plausible.
{
  try {
    const r = joue({ secondes: 120, entree: intelligent });
    const sc = JEU.score(r.s);
    check(sc > 0 && Number.isInteger(sc), `120 s « intelligent » sans exception (score ${sc}, durée ${r.t.toFixed(1)} s)`);
    check(!JEU.fini(r.s) || r.t < 120, `partie terminée par les vies ou en cours (vies restantes ${r.s.vies})`);
  } catch (e) {
    check(false, 'partie de 120 s sans exception : ' + e.message);
  }
}

// 2. Cadence : pire seconde et moyenne sous le plafond serveur (5 par seconde).
{
  const r = joue({ secondes: 120, entree: intelligent });
  const pire = pireSeconde(r.points);
  check(pire <= 3 && pire < SERVEUR, `pire seconde mesurée : ${pire} points (serveur : moins de ${SERVEUR}, vise 3)`);
  const moyenne = JEU.score(r.s) / Math.max(r.t, 1);
  check(moyenne < 3, `score / durée = ${moyenne.toFixed(2)} points par seconde (vise moins de 3)`);
}

// 3. Code « coeurs » : plus aucun cornichon pendant 120 s, avatars dessinés en cœurs.
{
  const r = joue({ triche: { coeurs: true, immortel: false }, secondes: 120, entree: intelligent, ctx: espion().ctx });
  check(r.cornichons === 0, `code « coeurs » : aucun cornichon en 120 s (${r.cornichons} sorti(s))`);
  const avec = espion();
  joue({ triche: { coeurs: true, immortel: false }, secondes: 30, entree: intelligent, ctx: avec.ctx });
  const sans = espion();
  joue({ triche: { coeurs: false, immortel: false }, secondes: 30, entree: intelligent, ctx: sans.ctx });
  check(avec.compte.n > 0 && sans.compte.n === 0, 'code « coeurs » : les avatars sont dessinés en cœurs (sans code, aucun cœur)');
}

// 4. Code « immortel » : aucune vie perdue, la partie ne finit pas en 120 s même en ne tapant rien.
{
  const r = joue({ triche: { coeurs: false, immortel: true }, secondes: 120, entree: () => ({}) });
  check(!JEU.fini(r.s) && r.s.vies === 3, `immortel : la partie ne finit pas en 120 s en ne tapant rien (vies ${r.s.vies}, ${r.t.toFixed(1)} s)`);
  const tape = joue({ triche: { coeurs: false, immortel: true }, secondes: 120, entree: toutTaper });
  check(!JEU.fini(tape.s) && tape.s.vies === 3, 'immortel : taper les cornichons ne coûte aucune vie');
}

// 5. Sans code : rater sans rien faire finit la partie (cinq ratés de suite, trois fois) ; taper un cornichon coûte une vie.
{
  const sans = joue({ secondes: 120, entree: () => ({}) });
  check(JEU.fini(sans.s) && sans.t < 120, `sans code, sans taper : la partie finit par cinq ratés de suite (${sans.t.toFixed(1)} s)`);
  const tout = joue({ secondes: 120, entree: toutTaper });
  check(tout.s.vies < 3 || JEU.fini(tout.s), `taper les cornichons : une vie perdue (vies ${tout.s.vies})`);
  check(JEU.fini(tout.s) && JEU.score(tout.s) >= 0, 'taper tout : la partie finit, score conservé');
}

// 6. Clavier : les flèches déplacent le curseur, espace tape la case du curseur.
{
  const r = joue({ secondes: 90, entree: clavier });
  check(r.s.clavier === true && JEU.score(r.s) > 0, `clavier : le curseur tape les membres (score ${JEU.score(r.s)} en ${r.t.toFixed(0)} s)`);
}

// 7. Présentation : titre, aide, vies (3), score initial 0.
{
  const s = JEU.init({ reduit: true });
  check(JEU.id === 'taupe' && JEU.titre === 'Tape-taupe' && typeof JEU.aide === 'string' && JEU.vies(s).max === 3 && JEU.score(s) === 0,
    'identifiant « taupe », titre, aide, trois vies et score initial 0');
}

// 8. Effets : aucun ne touche aux règles, et le dernier cœur finit la partie à l'image même.
{
  const vide = { cible: null, cibleY: null, dir: null, action: false };
  /** Fait sortir un avatar dans le terrier 4 et le tape. */
  const tape = (s, cornichon) => {
    const t = s.trous[4];
    Object.assign(t, { etat: 'sorti', t: 0, h: 1, duree: 5, cornichon, lettre: cornichon ? null : 'D', fait: false, age: 1 });
    JEU.update(s, 0, { ...vide, action: true, cible: t.x, cibleY: t.y - 30 });
    return t;
  };
  const s = JEU.init({ reduit: false });
  const t = tape(s, false);
  check(JEU.score(s) === 1 && t.etat === 'rentre' && !!s.mart, 'membre tapé : point et retour au terrier dès le clic, marteau levé');
  const ctx = fauxCtx();
  JEU.draw(ctx, s);
  for (let i = 0; i < 9; i++) JEU.update(s, PAS, vide);
  check(t.etat === 'vide' && t.sq > 0 && s.fx.length > 0, 'le terrier se vide comme avant, le coup arrive après le marteau avec ses effets');
  JEU.draw(ctx, s);

  const d = JEU.init({ reduit: false });
  d.vies = 1;
  tape(d, true);
  check(JEU.fini(d) && JEU.vies(d).left === 0 && d.attente.length === 1, 'dernier cœur sur un cornichon : la partie finit à l’image même, le coup reste à jouer');
  const scoreFin = JEU.score(d), etats = d.trous.map((q) => q.etat).join();
  let eclat = false;
  for (let i = 0; i < JEU.dureeFin(d) / PAS; i++) { JEU.update(d, PAS, vide); eclat ||= d.fx?.some((f) => f.k === 'demi'); }
  check(eclat && d.attente.length === 0, 'dureeFin : le marteau frappe et le dernier cœur éclate');
  check(JEU.score(d) === scoreFin && JEU.vies(d).left === 0 && d.trous.map((q) => q.etat).join() === etats, 'dureeFin : ni score, ni vies, ni terriers ne bougent');
  check(JEU.finTexte(d).t === 'Plus de cœurs !' && typeof JEU.finTexte(d).d === 'string', 'finTexte : titre et phrase');

  const r = JEU.init({ reduit: true });
  tape(r, false); tape(r, true);
  check(JEU.score(r) === 1 && r.vies === 2 && !r.mart && !(r.fx?.some((f) => f.k !== 'txt')) && r.secousse === 0 && r.flash === 0,
    'mouvement réduit : état juste, ni marteau, ni particules, ni secousse, ni flash');
  JEU.draw(ctx, r);

  const c = JEU.init({ reduit: false });
  c.serie = 4;
  Object.assign(c.trous[0], { etat: 'rentre', t: 0, h: 1, h0: 1, cornichon: false, lettre: 'S', fait: false });
  JEU.update(c, 0.2, vide);
  check(c.serie === 0 && c.vies === 2 && c.plein > c.ecoule && c.attente.length === 1, 'cinquième raté : série remise à zéro et vie perdue tout de suite, compteur gardé plein pour l’effet');
  check(JEU.accroche && JEU.quip && JEU.aide && typeof JEU.embleme === 'function', 'champs des écrans communs');
  JEU.embleme(ctx, 180, 200, 1);
}

console.log(`\n${ok} OK, ${ko} ECHEC(S)`);
process.exit(ko ? 1 : 0);
