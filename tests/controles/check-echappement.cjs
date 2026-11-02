// Contrôle d'échappement des gabarits HTML du site (site/assets/, fichiers .js et .mjs).
// Un gabarit HTML est un modèle de chaîne (backticks) qui contient une balise (`<div …`, `</li>`), ou qui est écrit
// dans innerHTML, outerHTML ou insertAdjacentHTML sur la même ligne. Dans un tel gabarit, une interpolation
// `${…}` dont l'expression lit un champ de texte libre (pseudo, title, body, text, name, nom, titre, message,
// description, label) doit passer par esc() : sinon une valeur saisie par un membre (ou une annonce) peut injecter du
// HTML. L'expression est considérée comme échappée dès qu'elle contient « esc( » ; une interpolation qui contient un
// autre gabarit est contrôlée à part (ce gabarit-là est lui-même analysé).
// Faux positifs : LISTE_BLANCHE ci-dessous (fichier, expression, raison). Une ligne « // esc-ok: raison » juste
// au-dessus d'un gabarit l'exempte aussi.
// Sans analyse syntaxique complète : les expressions régulières (littéraux) ne sont pas interprétées ; les chaînes,
// commentaires et `${…}` imbriqués le sont.
//
// Lancer : node tests/controles/check-echappement.cjs   (ou ci.yml « Vérifications »)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'site', 'assets');

/** Champs de texte libre à échapper dans un gabarit HTML. */
const CHAMP = /\.(pseudo|title|body|text|name|nom|titre|message|description|label)\b/;
/** Appels qui renvoient déjà du HTML sûr (leurs arguments sont échappés dans la fonction, convention « …Html() »). */
const RENVOIE_HTML = /\b\w*(Html|html|HTML)\s*\(/;
/** Écriture directe dans le DOM : le gabarit est la valeur affectée (ou l'argument de insertAdjacentHTML). */
const ECRIT_HTML = /(innerHTML|outerHTML)\s*\+?=\s*$|insertAdjacentHTML\([^,]*,\s*$/;

/**
 * Liste blanche : expressions qui ne sont pas des oublis. Chaque entrée : fichier (relatif à site/assets/), morceau
 * de l'expression, et la raison.
 */
const LISTE_BLANCHE = [
  // Constantes du module, jamais saisies : libellés et décors fixes.
  { fichier: 'commun/core/search.js', expr: 'g.title', raison: 'GROUPS : titres fixes des sections de recherche' },
  { fichier: 'espaces/admin/admin-bot-regles.js', expr: 'grpHead(', raison: 'grpHead échappe lui-même le titre (esc(title)) ; titres fixes du module' },
  { fichier: 'commun/core/staff-dock.js', expr: 'r.label', raison: 'RACCOURCIS : libellés fixes' },
  { fichier: 'commun/core/staff-dock.js', expr: 'r.href', raison: 'RACCOURCIS : adresses fixes' },
  { fichier: 'espaces/admin/admin-invite-links.js', expr: 'r.name', raison: 'clé fixe d\'une règle (INVITE_DEFAULTS)' },
  { fichier: 'espaces/admin/badges-criteres.js', expr: 'f.text', raison: 'booléen (type de champ), pas un texte' },
  { fichier: 'espaces/admin/cartes/boosters.js', expr: 'deco.body', raison: 'décor SVG fixe (themeDecor)' },
  { fichier: 'espaces/admin/visual-pick.js', expr: 'deco.body', raison: 'décor SVG fixe (themeDecor)' },
  { fichier: 'espaces/cartes/cartes.js', expr: 'deco.body', raison: 'décor SVG fixe (themeDecor)' },
  { fichier: 'espaces/cartes/enchere-lot.js', expr: 'deco.body', raison: 'décor SVG fixe (themeDecor)' },
  { fichier: 'espaces/admin/admin-bot.js', expr: 'def.title', raison: 'grpHead() échappe son titre (esc(title))' },
  { fichier: 'espaces/admin/admin-saisons.js', expr: 't.name', raison: 'opt() échappe son libellé' },
  { fichier: 'espaces/admin/admin-saisons.js', expr: 'k.name', raison: 'opt() échappe son libellé' },
  { fichier: 'espaces/admin/cartes/list.js', expr: 'selField(', raison: 'selField() échappe chaque libellé' },
  { fichier: 'espaces/compte/profil-gaming.js', expr: 'j.nom', raison: 'booléen (case cochée), pas un texte' },
  { fichier: 'espaces/duels/vues/pfc.js', expr: 'g.nom', raison: 'GESTES : libellés fixes' },
  { fichier: 'espaces/irl/cine.js', expr: 'mine.body', raison: 'booléen dans un libellé fixe' },
  { fichier: 'espaces/jeux/nj-connexions.js', expr: 'g.titre', raison: 'bandeau() échappe g.titre et g.mots' },
  { fichier: 'espaces/jeux/simulateur.js', expr: 'd.name', raison: 'liste fixe d\'appareils du simulateur (outil de test)' },
  { fichier: 'espaces/loup-garou/vues/revelation.js', expr: 'c.label', raison: 'pastilleCamp() échappe le libellé' },
  { fichier: 'espaces/nom-de-code/vues/salle.js', expr: 'EQUIPES', raison: 'constante EQUIPES (noms fixes)' },
  { fichier: 'espaces/nom-de-code/vues/table.js', expr: 'EQUIPES', raison: 'constante EQUIPES (noms fixes)' },
  { fichier: 'espaces/duels/vues/accueil.js', expr: 'pseudo(', raison: 'pseudo() échappe le nom' },
  { fichier: 'espaces/duels/vues/stats.js', expr: 'pseudo(', raison: 'pseudo() échappe le nom' },
];

/** Tous les gabarits d'un fichier : { ligne, fixe (parties fixes), interpolations: [{ expr, ligne }], dansHtml }. */
function gabarits(src) {
  const out = [];
  const ligneDe = (i) => src.slice(0, i).split('\n').length;
  function finChaine(i, q) {
    i++;
    while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    return i + 1;
  }
  /** Lit du code JS jusqu'à la « } » fermante (profondeur 0). Renvoie l'indice de cette « } ». */
  function codeJusquA(i) {
    let profondeur = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '"' || c === "'") { i = finChaine(i, c); continue; }
      if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) return src.length; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
      if (c === '`') { i = gabarit(i); continue; }
      if (c === '{') profondeur++;
      else if (c === '}') { if (profondeur === 0) return i; profondeur--; }
      i++;
    }
    return i;
  }
  /** Lit un gabarit commençant au backtick d'indice i ; renvoie l'indice après le backtick fermant. */
  function gabarit(i) {
    const debut = i;
    const avant = src.slice(src.lastIndexOf('\n', debut - 1) + 1, debut);
    const t = { ligne: ligneDe(debut), fixe: '', interpolations: [], dansHtml: ECRIT_HTML.test(avant) };
    i++;
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        const fin = codeJusquA(i + 2);
        t.interpolations.push({ expr: src.slice(i + 2, fin), ligne: ligneDe(i) });
        i = fin + 1;
        continue;
      }
      t.fixe += src[i];
      i++;
    }
    out.push(t);
    return i + 1;
  }
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = finChaine(i, c); continue; }
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); if (i < 0) break; continue; }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 2; continue; }
    if (c === '`') { i = gabarit(i); continue; }
    i++;
  }
  return out;
}

/** Fichiers .js et .mjs d'un dossier, récursivement, hors vendor/ (bibliothèques tierces). */
function fichiers(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) { if (ent.name !== 'vendor') fichiers(p, out); } else if (/\.m?js$/.test(ent.name)) out.push(p);
  }
  return out;
}

const problemes = [];
let nbGabarits = 0;
for (const file of fichiers(ASSETS)) {
  const rel = path.relative(ASSETS, file).split(path.sep).join('/');
  const src = fs.readFileSync(file, 'utf8');
  const lignes = src.split('\n');
  for (const t of gabarits(src)) {
    const html = /<\/?[a-zA-Z][\w-]*[\s>/]/.test(t.fixe) || t.dansHtml;
    if (!html) continue;
    nbGabarits++;
    if (/\besc-ok\b/.test(lignes[t.ligne - 2] || '')) continue;
    for (const it of t.interpolations) {
      if (it.expr.includes('`') || it.expr.includes('esc(') || RENVOIE_HTML.test(it.expr)) continue;
      if (!CHAMP.test(it.expr)) continue;
      if (LISTE_BLANCHE.some((e) => e.fichier === rel && it.expr.includes(e.expr))) continue;
      problemes.push(`${rel}:${it.ligne} \${${it.expr.trim().slice(0, 90)}}`);
    }
  }
}

for (const p of problemes) console.log('ECHEC ' + p);
console.log(`\n${nbGabarits} gabarits HTML analysés, ${problemes.length} interpolation(s) sans esc()`);
process.exitCode = problemes.length ? 1 : 0;
