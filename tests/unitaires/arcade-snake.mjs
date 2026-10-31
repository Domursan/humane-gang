// Test du mini-jeu Snake (eggs/jeu-snake.js) : règles, cadence serveur, codes de triche, sans navigateur : node tests/unitaires/arcade-snake.mjs
import { JEU, COLS, LIGNES } from '../../site/assets/espaces/arcade/jeu-snake.js';
import { fauxCtx } from '../lib/faux-canevas.mjs';

let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('OK     ' + m); } else { ko++; console.log('ECHEC  ' + m); } };
/** Cadence serveur : 12 points par seconde au plus ; la mission vise moins de 6 (un repas = 10 points). */
const SERVEUR = 12;
const PAS = 1 / 30;
const cle = (c) => c.x + ',' + c.y;

/**
 * Joue une partie image par image.
 * @param {object} o triche ; secondes ; entree(s) : entrée de chaque image ; ctx : canevas factice (espion facultatif)
 * @returns {{s: object, t: number, repas: number[]}} état final, durée, instants des repas
 */
function joue({ triche = { coeurs: false, immortel: false }, secondes = 120, entree = () => ({}), ctx = fauxCtx() } = {}) {
  const s = JEU.init({ reduit: false });
  s.triche = triche;
  const repas = [];
  let t = 0, dernier = 0;
  while (t < secondes && !JEU.fini(s)) {
    const e = { cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, action: false, tenu: false, ...entree(s) };
    JEU.update(s, PAS, e);
    if (JEU.score(s) > dernier) { repas.push(t); dernier = JEU.score(s); }
    JEU.draw(ctx, s);
    t += PAS;
  }
  return { s, t, repas };
}

/** Points sur la seconde la plus chargée (un repas = 10 points). */
function pireSeconde(repas) {
  let max = 0;
  for (const r0 of repas) max = Math.max(max, 10 * repas.filter((r) => r >= r0 && r - r0 <= 1).length);
  return max;
}

/**
 * Entrée « intelligente » : plus court chemin (en largeur) vers la raclette, sans toucher le corps ni les murs.
 * @param {object} s état de la partie
 * @returns {{dir?: string}} direction à prendre, ou {} si rien à faire
 */
function intelligent(s) {
  if (s.mort) return {};
  const tete = s.corps[0], but = s.nourriture;
  const occupe = new Set(s.corps.slice(0, -1).map(cle));
  const libre = (x, y) => x >= 0 && y >= 0 && x < COLS && y < LIGNES && !occupe.has(x + ',' + y);
  const voisins = [[1, 0, 'droite'], [-1, 0, 'gauche'], [0, 1, 'bas'], [0, -1, 'haut']];
  if (!but) {
    // Pas de raclette encore : on erre sans toucher les murs ni la queue.
    const sures = voisins.filter(([dx, dy]) => libre(tete.x + dx, tete.y + dy));
    return sures.length ? { dir: sures[Math.floor(Math.random() * sures.length)][2] } : {};
  }
  const vus = new Set([cle(tete)]);
  const file = [];
  for (const [dx, dy, nom] of voisins) {
    const x = tete.x + dx, y = tete.y + dy;
    if (libre(x, y) && !vus.has(x + ',' + y)) { vus.add(x + ',' + y); file.push({ x, y, nom }); }
  }
  let premier = null;
  while (file.length && premier === null) {
    const n = file.shift();
    if (n.x === but.x && n.y === but.y) { premier = n.nom; break; }
    for (const [dx, dy] of voisins) {
      const x = n.x + dx, y = n.y + dy;
      if (libre(x, y) && !vus.has(x + ',' + y)) { vus.add(x + ',' + y); file.push({ x, y, nom: n.nom }); }
    }
  }
  if (premier === null) {
    const sure = voisins.find(([dx, dy]) => libre(tete.x + dx, tete.y + dy));
    if (!sure) return {};
    premier = sure[2];
  }
  return { dir: premier };
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

// 1. Partie de 120 s avec une entrée intelligente : aucune exception, score plausible.
{
  try {
    const r = joue({ secondes: 120, entree: intelligent });
    const sc = JEU.score(r.s);
    check(sc % 10 === 0 && sc >= 0, `120 s « intelligent » sans exception (score ${sc}, ${r.repas.length} repas, durée ${r.t.toFixed(1)} s)`);
    check(sc >= 10, 'le serpent mange au moins une raclette en 120 s avec une entrée intelligente');
  } catch (e) {
    check(false, 'partie de 120 s sans exception : ' + e.message);
  }
}

// 2. Cadence : un repas au plus toutes les 1,7 s ; score / durée et pire seconde sous le plafond serveur.
{
  const r = joue({ secondes: 120, entree: intelligent });
  let ecart = Infinity;
  for (let i = 1; i < r.repas.length; i++) ecart = Math.min(ecart, r.repas[i] - r.repas[i - 1]);
  check(ecart >= 1.65, `repas espacés d'au moins 1,7 s (écart minimal mesuré ${ecart === Infinity ? '—' : ecart.toFixed(2)} s)`);
  const pire = pireSeconde(r.repas);
  check(pire < SERVEUR, `pire seconde mesurée : ${pire} points (serveur : moins de ${SERVEUR})`);
  const moyenne = JEU.score(r.s) / Math.max(r.t, 1);
  check(moyenne < 6, `score / durée = ${moyenne.toFixed(2)} points par seconde (vise moins de 6)`);
  // Pire cas : le serpent mange la raclette dès qu'elle apparaît ; il faut donc qu'une raclette n'apparaisse
  // jamais moins de 1,7 s après le repas précédent.
  const s = JEU.init({ reduit: false });
  const apparitions = [];
  const repasInstants = [];
  let t = 0, dernier = 0, avant = null;
  while (t < 120 && !JEU.fini(s)) {
    const e = { cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, action: false, tenu: false, ...intelligent(s) };
    JEU.update(s, PAS, e);
    if (avant === null && s.nourriture) apparitions.push(t);
    if (JEU.score(s) > dernier) { repasInstants.push(t); dernier = JEU.score(s); }
    avant = s.nourriture;
    t += PAS;
  }
  let ecartApparition = Infinity;
  for (let i = 0; i < repasInstants.length; i++) {
    const suivante = apparitions.find((a) => a > repasInstants[i]);
    if (suivante !== undefined) ecartApparition = Math.min(ecartApparition, suivante - repasInstants[i]);
  }
  check(ecartApparition >= 1.65, `une raclette n'apparaît jamais moins de 1,7 s après un repas (écart minimal ${ecartApparition === Infinity ? '—' : ecartApparition.toFixed(2)} s)`);
}

// 3. Codes de triche : « coeurs » dessine la nourriture en cœurs ; sans code, aucun cœur.
{
  const avec = espion();
  joue({ triche: { coeurs: true, immortel: false }, secondes: 60, entree: intelligent, ctx: avec.ctx });
  check(avec.compte.n > 0, 'code « coeurs » : la nourriture est dessinée en cœurs');
  const sans = espion();
  joue({ triche: { coeurs: false, immortel: false }, secondes: 60, entree: intelligent, ctx: sans.ctx });
  check(sans.compte.n === 0, 'sans code « coeurs » : aucun cœur dessiné');
}

// 4. « immortel » : les murs font passer de l'autre côté, se mordre ne tue pas ; sans code, la partie finit.
{
  const hasard = () => (Math.random() < 0.08 ? { dir: ['haut', 'bas', 'gauche', 'droite'][Math.floor(Math.random() * 4)] } : {});
  const r = joue({ triche: { coeurs: false, immortel: true }, secondes: 120, entree: hasard });
  check(!JEU.fini(r.s) && r.t >= 120 - PAS, `immortel : la partie ne finit pas en 120 s en jouant mal (${r.t.toFixed(1)} s)`);
  const sans = joue({ triche: { coeurs: false, immortel: false }, secondes: 120, entree: () => ({}) });
  check(JEU.fini(sans.s) && sans.t < 10, `sans code, sans jouer : la partie finit au mur (${sans.t.toFixed(1)} s)`);
  const traverse = joue({ triche: { coeurs: false, immortel: true }, secondes: 10, entree: () => ({}) });
  const tete = traverse.s.corps[0];
  check(!JEU.fini(traverse.s) && tete.x >= 0 && tete.x < COLS && tete.y >= 0 && tete.y < LIGNES, 'immortel : le serpent traverse le mur et reste dans la grille');
}

// 5. Commande au doigt : un appui au-dessus de la tête fait monter le serpent ; un appui derrière ne fait pas de demi-tour.
{
  const depart = JEU.init({ reduit: false }).corps[0];
  const xTete = 18 + depart.x * 18 + 9, yTete = 30 + depart.y * 18 + 9;
  let fait = false;
  const haut = joue({ secondes: 1, entree: () => {
    if (fait) return {};
    fait = true;
    return { action: true, cible: xTete, cibleY: yTete - 60 };
  } });
  check(!JEU.fini(haut.s) && haut.s.corps[0].y < depart.y, `appui au-dessus de la tête : le serpent monte (ligne ${depart.y} → ${haut.s.corps[0].y})`);

  let fait2 = false;
  const arriere = joue({ secondes: 1, entree: () => {
    if (fait2) return {};
    fait2 = true;
    return { action: true, cible: xTete - 80, cibleY: yTete };
  } });
  check(!JEU.fini(arriere.s) && arriere.s.corps[0].x > depart.x, 'appui derrière la tête : pas de demi-tour, le serpent continue vers la droite');
}

// 6. Présentation : titre, texte d'aide, score initial nul.
check(JEU.id === 'snake' && JEU.titre === 'Snake' && typeof JEU.aide === 'string' && JEU.score(JEU.init({ reduit: true })) === 0,
  'identifiant « snake », titre, aide et score initial 0');

// 7. Mort : fin de partie immédiate, le serpent se dissout pendant dureeFin (le moteur continue update), le score ne bouge plus ;
// animation réduite : rien de dessiné en plus.
{
  const s = JEU.init({ reduit: false });
  s.triche = { coeurs: false, immortel: false };
  s.score = 30;
  const ctx = fauxCtx(), neutre = { cible: null, cibleY: null, fleche: 0, pas: 0, vertical: 0, dir: null, action: false, tenu: false };
  while (!s.mort) JEU.update(s, PAS, neutre);
  check(JEU.fini(s) && s.fx.length > 0, 'à la mort : la partie finit à l’image même, le choc lance ses éclats');
  const duree = JEU.dureeFin(s);
  for (let t = 0; t < duree + PAS; t += PAS) { JEU.update(s, PAS, { ...neutre, dir: 'haut' }); JEU.draw(ctx, s); }
  check(s.dissous && s.retire === s.corps.length && duree < 2.8, `dissolution complète pendant dureeFin (${duree.toFixed(2)} s)`);
  check(JEU.score(s) === 30, 'la dissolution ne change pas le score');
  check(!s.fx.some((f) => f.k === 'p'), 'plus aucun pixel en vol à la fin');

  const long = JEU.init({ reduit: false });
  long.triche = s.triche;
  long.corps = Array.from({ length: 200 }, () => ({ x: COLS - 1, y: 0 }));
  JEU.update(long, 0.21, neutre);
  const dureeLong = JEU.dureeFin(long);
  for (let t = 0; t < dureeLong + PAS; t += PAS) JEU.update(long, PAS, neutre);
  check(JEU.fini(long) && long.dissous && dureeLong <= 2.75 + 1e-9, `serpent de 200 cases : dissolution bornée (${dureeLong.toFixed(2)} s)`);

  const doux = JEU.init({ reduit: true });
  doux.triche = s.triche;
  let n = 0;
  while (!JEU.fini(doux) && n < 2000) { JEU.update(doux, PAS, neutre); JEU.draw(ctx, doux); n++; }
  check(JEU.fini(doux) && doux.retire === 0 && !doux.fx?.length && doux.flash === 0 && doux.secousse === 0, 'animation réduite : fin dès la mort, ni effet ni dissolution');
}

// 8. Écrans communs : champs repris de la maquette, cause de la mort à l'écran de fin.
check(!!JEU.accroche && !!JEU.quip && typeof JEU.embleme === 'function', 'accroche, quip et embleme présents');
check(JEU.finTexte({ mort: 'Aïe, un mur !' }).t === 'Aïe, un mur !' && !!JEU.finTexte({ mort: 'x' }).d, 'finTexte reprend la cause de la mort');
JEU.embleme(fauxCtx(), 180, 200, 1);

console.log(`\n${ok} OK, ${ko} ECHEC(S)`);
process.exit(ko ? 1 : 0);
