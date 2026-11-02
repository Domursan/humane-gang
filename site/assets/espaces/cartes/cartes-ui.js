// ===== Cartes à collectionner — composant partagé (rendu d'une carte, raretés, familles) =====
// Utilisé par cartes.js, cartes-trades.js, cartes-showcase.js, admin-cards.js et membre.js (vitrine).
// Styles : assets/espaces/cartes/cartes-card.css (à inclure sur chaque page qui affiche des cartes).
// Côté serveur : tables hg_cards / hg_card_copies, réglages hg_settings.cards, fonctions hg_* (migrations 018).
// Exporte : les listes de raretés et de familles (et leurs libellés), le numéro d'exemplaire, le numéro de carte,
// les générations des membres (setGenerations, generationOf, generationLabel : idée C8),
// le HTML d'une carte (cardHtml), le dos de carte (cardBackHtml) et le format des Paillettes (fmtP).
import { paillSym } from '../../commun/paillettes.js';
import { esc, currentLogo, logoAttrs } from '../../commun/core.js';

/* ---------- Raretés et familles : listes de référence et libellés ---------- */
// Ordre de RARITIES = du plus commun au plus rare (l'ordre compte pour le rang).
export const RARITIES = [
  { id: 'commune', label: 'Commune', short: 'C' },
  { id: 'peu_commune', label: 'Peu commune', short: 'PC' },
  { id: 'rare', label: 'Rare', short: 'R' },
  { id: 'epique', label: 'Épique', short: 'É' },
  { id: 'legendaire', label: 'Légendaire', short: 'L' },
  { id: 'mythique', label: 'Mythique', short: 'M' },
  { id: 'identite', label: 'Identité', short: 'ID' },
  // Unique : un seul exemplaire, hors série. Jamais dans un booster, jamais fabriquée ni recyclée (migration 061, partie B).
  { id: 'unique', label: 'Unique', short: 'U' },
];
// Raretés tirées dans les boosters (taux affichés et réglables) : toutes sauf « unique ».
export const RARITIES_TIRAGE = RARITIES.filter((r) => r.id !== 'unique');
// Accès rapide par identifiant : RARITY['rare'] donne le libellé, le raccourci et le rang (1 = commune).
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, rank: i + 1 }]));
/** Libellé lisible d'une rareté (« Peu commune »). Renvoie l'identifiant brut si inconnu. */
export const rarityLabel = (id) => RARITY[id]?.label || id;
/** Rang d'une rareté (1 pour la commune, 7 pour l'identité, 8 pour l'unique, 0 si inconnue). Sert à compter les gemmes. */
export const rarityRank = (id) => RARITY[id]?.rank || 0;

// Familles de cartes (Membre, Moment, Lieu...).
export const FAMILIES = [
  { id: 'membre', label: 'Membre' },
  { id: 'moment', label: 'Moment' },
  { id: 'lieu', label: 'Lieu' },
  { id: 'objet', label: 'Objet' },
  { id: 'evenement', label: 'Événement' },
  { id: 'jeu', label: 'Jeu vidéo' },
  { id: 'musique', label: 'Musique' },
  { id: 'pays', label: 'Pays' },
  { id: 'plateforme', label: 'Plateforme' },
  { id: 'unique', label: 'Unique' },
];
// Familles dont l'image est montrée en entier sur un fond flouté (pochette, drapeau, logo) au lieu d'être recadrée.
const IMAGE_ENTIERE = new Set(['musique', 'pays', 'plateforme']);
/** Libellé d'une famille (« Jeu vidéo »). Renvoie l'identifiant brut si inconnue. */
export const familyLabel = (id) => FAMILIES.find((f) => f.id === id)?.label || id;

/** Numéro d'exemplaire « N° 03/10 » pour les cartes limitées. */
export function serialLabel(serial, max) {
  if (!serial) return '';
  const w = String(max || serial).length;
  return `N° ${String(serial).padStart(Math.max(2, w), '0')}${max ? '/' + max : ''}`;
}

/** Numéro de la carte dans la série : « 012/100 » (le total est facultatif). */
export function numberLabel(card) {
  if (card.number == null || card.number === '') return '';
  const total = card.set_total;
  const w = Math.max(3, String(total || '').length);
  return String(card.number).padStart(w, '0') + (total ? '/' + total : '');
}

/** Année d'arrivée : « 2022 » à partir d'une année ou d'une date ISO. */
function yearOf(v) {
  if (v == null || v === '') return '';
  const m = /^(\d{4})/.exec(String(v));
  return m ? m[1] : String(v);
}

/* ---------- Générations des membres (idée C8) ----------
   Bandeau « OG » (fond or, double filet) ou « 2e gen » (fond argent) sur les cartes liées à un membre (member_id).
   La page charge les générations une fois (cartes-gen.js, RPC hg_card_generations) ; sans elles, rien ne change.
   Même carte, même rareté : seul l'habillage change. */
const GEN = new Map();
/** Enregistre les générations : Map ou liste [{ user_id, gen: 'og'|'gen2' }]. */
export function setGenerations(list) {
  GEN.clear();
  for (const g of (list instanceof Map ? [...list].map(([user_id, gen]) => ({ user_id, gen })) : list || [])) if (g?.user_id && (g.gen === 'og' || g.gen === 'gen2')) GEN.set(g.user_id, g.gen);
}
/** Génération d'un membre (« og », « gen2 ») ou null (inconnue ou masquée par le membre). */
export const generationOf = (memberId) => (memberId ? GEN.get(memberId) || null : null);
/** Libellé d'une génération : « OG » ou « 2e gen ». */
export const generationLabel = (g) => (g === 'og' ? 'OG' : g === 'gen2' ? '2e gen' : '');

/* ---------- Gemmes : pastilles décoratives (une de plus à chaque rareté) ---------- */
// Couleurs de l'arc-en-ciel utilisées par les gemmes de la carte Identité.
const RAINBOW = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
// Gemme pixel 7×7 (losange) et étoile pixel pour la mythique (dessins inline, sans <use>).
const PATH_GEM = 'M3 0h1v1h-1zM2 1h3v1h-3zM1 2h5v1h-5zM0 3h7v1h-7zM1 4h5v1h-5zM2 5h3v1h-3zM3 6h1v1h-1z';
const PATH_STAR = 'M3 0h1v1h-1zM3 1h1v1h-1zM2 2h3v1h-3zM0 3h7v1h-7zM2 4h3v1h-3zM3 5h1v1h-1zM3 6h1v1h-1z';
/**
 * Dessine n gemmes (SVG) pour une rareté : étoile pour la mythique, losange sinon,
 * couleurs de l'arc-en-ciel pour l'identité, reflet blanc et ombre pour les autres.
 * @param {string} r identifiant de rareté
 * @param {number} n nombre de gemmes à dessiner
 * @returns {string} HTML des gemmes
 */
const gemsHtml = (r, n) => Array.from({ length: n }, (_, i) => {
  const myth = r === 'mythique';
  const st = r === 'identite' ? ` style="color:${RAINBOW[i % RAINBOW.length]}"` : '';
  const shade = myth ? '' : '<path d="M2 1h1v1h-1zM1 2h1v1h-1z" fill="#fff" opacity=".85"/><path d="M6 3h1v1h-1zM5 4h1v1h-1zM4 5h2v1h-2zM3 6h1v1h-1z" fill="#000" opacity=".35"/>';
  return `<svg class="hgc-gem" viewBox="0 0 7 7" aria-hidden="true" focusable="false"${st}><path d="${myth ? PATH_STAR : PATH_GEM}" fill="currentColor"/>${shade}</svg>`;
}).join('');
// Sans image dédiée, toutes les cartes (Identité comprise) affichent le logo du gang.

/* ---------- Carte face visible : calques, contenu et HTML ---------- */
/** Calques de la carte : cadre (out), liseré (mid), fond de la face (in) et décors cumulés selon la rareté. */
const LAYERS = '<span class="hgc-layer hgc-out"></span><span class="hgc-layer hgc-mid"></span>'
  + '<span class="hgc-layer hgc-in"><span class="hgc-ln"></span><span class="hgc-ln2"></span>'
  + '<span class="hgc-stud sl"></span><span class="hgc-stud sr"></span><span class="hgc-tab tt"></span><span class="hgc-tab tb"></span>'
  + '<span class="hgc-dia dtl"></span><span class="hgc-dia dtr"></span><span class="hgc-dia dbl"></span><span class="hgc-dia dbr"></span></span>';

/** Calque « fondue » (C3) : nappe de fromage en haut du cadre, coulures et bulles (animées seulement si les effets sont permis). */
const FONDUE = '<span class="hgc-fondue"><i class="d1"></i><i class="d2"></i><i class="d3"></i><i class="d4"></i>'
  + '<b class="b1"></b><b class="b2"></b><b class="b3"></b></span>';

/**
 * HTML d'une carte face visible.
 * card : { name, rarity, family, image_url, flavor, caption?, number, set_total?, set_name?, max_copies, member_since?, finish? }
 * opts : { shiny, serial, count (nb d'exemplaires possédés), size: 'sm'|'md'|'lg', locked, missing, button (true = <button>), attrs (string),
 *          finish ('fondue' : brillante fondue du booster Raclette, migration 080 ; repli : card.finish), stamp (true : tampon « J’y étais ») }
 */
export function cardHtml(card, opts = {}) {
  const r = RARITY[card.rarity] ? card.rarity : 'commune';
  const size = opts.size || 'md';
  const miss = !!opts.missing;
  const ident = r === 'identite';
  // Brillante « fondue » (C3) : le fromage remplace le reflet holographique ; tampon « J’y étais » (C4).
  const fondue = !!opts.shiny && !miss && (opts.finish ?? card.finish) === 'fondue';
  const stamp = !!opts.stamp && !miss;
  const genCls = !miss && generationOf(card.member_id) ? `hgc-${generationOf(card.member_id) === 'og' ? 'og' : 'gen2'}` : '';
  const cls = ['hgc', `hgc-${r}`, `hgc-${size}`, opts.shiny ? 'is-shiny' : '', fondue ? 'is-fondue' : '', miss ? 'is-missing' : '', opts.locked ? 'is-locked' : '', genCls].filter(Boolean).join(' ');
  const name = miss ? '???' : String(card.name ?? '');
  const uniq = r === 'unique';
  const gen = miss ? null : generationOf(card.member_id);
  // Une carte unique se présente comme une pièce à part : « Exemplaire unique » remplace la famille.
  // Un seul exemplaire : « Exemplaire unique » ; plusieurs exemplaires numérotés : « Édition de N ».
  const uniqUn = uniq && (!card.max_copies || Number(card.max_copies) === 1);
  const famLine = [uniq ? (uniqUn ? 'Exemplaire unique' : `Édition de ${card.max_copies}`) : familyLabel(card.family), card.set_name].filter(Boolean).join(' · ');
  const flavor = miss ? '' : card.flavor;
  const caption = miss ? '' : card.caption;
  const ms = yearOf(card.member_since);
  // Ajustement du texte à la place disponible : titre sur 1 ligne réduite ou 2 lignes, ambiance en 3 tailles.
  const plateTxt = ident ? (miss ? '???' : "Carte d'identité") : name;
  const pl = plateTxt.length;
  const plateFit = pl > 28 ? ' hgc-fit-2' : pl > 20 ? ' hgc-fit-1' : '';
  const al = (flavor ? String(flavor).length + 4 : 0) + (caption ? String(caption).length + 12 : 0);
  const ambFit = al > 150 ? ' hgc-fit-2' : al > 100 ? ' hgc-fit-1' : '';

  let win;
  if (miss) {
    win = '<span class="hgc-win"><span class="hgc-q" aria-hidden="true">?</span></span>';
  } else if (ident) {
    const photo = card.image_url ? `<img class="hgc-win-img" src="${esc(card.image_url)}" alt="" aria-hidden="true" loading="lazy" decoding="async">` : `<img class="hgc-win-logo" src="${esc(currentLogo())}" alt="" aria-hidden="true" loading="lazy" decoding="async">`;
    win = `<span class="hgc-win hgc-win-id"><span class="hgc-photo">${photo}</span>`
      + `<span class="hgc-idinfo"><span class="hgc-idk">Pseudo</span><span class="hgc-idv">${esc(name)}</span>`
      + (ms ? `<span class="hgc-idk">Membre depuis</span><span class="hgc-idv">${esc(ms)}</span>` : '') + '</span></span>';
  } else {
    // Musique, pays, plateforme : la pochette, le drapeau ou le logo est montré en entier, sur un fond flouté de la même image.
    win = card.image_url && IMAGE_ENTIERE.has(card.family)
      ? `<span class="hgc-win hgc-win-cover"><img class="hgc-win-blur" src="${esc(card.image_url)}" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer"><img class="hgc-win-img" src="${esc(card.image_url)}" alt="" aria-hidden="true" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
      : card.image_url
      ? `<span class="hgc-win"><img class="hgc-win-img" src="${esc(card.image_url)}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`
      : `<span class="hgc-win"><img class="hgc-win-logo" src="${esc(currentLogo())}" alt="" aria-hidden="true" loading="lazy" decoding="async"></span>`;
  }

  // Unique : le numéro du seul exemplaire est « 1/1 » (sans zéro de remplissage).
  const serialTxt = uniqUn ? (opts.serial && !miss ? '1/1' : '') : (opts.serial ? serialLabel(opts.serial, card.max_copies) : '');
  const count = opts.count > 1 ? `<span class="hgc-count" aria-hidden="true">×${opts.count}</span>` : '';
  const lock = opts.locked ? '<span class="hgc-lock" title="Bloquée par une offre d\'échange">En échange</span>' : '';
  const label = `${name} — ${rarityLabel(r)}${opts.shiny ? (fondue ? ', brillante fondue' : ', brillante') : ''}${stamp ? ', J’y étais' : ''}${opts.serial ? ', ' + serialLabel(opts.serial, card.max_copies) : ''}`
    + `${gen ? ', ' + generationLabel(gen) : ''}${opts.count > 1 ? ', ' + opts.count + ' exemplaires' : ''}${opts.locked ? ', en échange' : ''}${miss ? ' (pas encore obtenue)' : ''}`;
  const tag = opts.button ? 'button' : 'div';
  const typeAttr = opts.button ? ' type="button"' : '';
  const roleAttr = opts.button ? '' : ' role="img"';

  return `<${tag}${typeAttr} class="${cls}" aria-label="${esc(label)}"${roleAttr} ${opts.attrs || ''}>
    <span class="hgc-frame" aria-hidden="true">
      ${LAYERS}
      ${opts.shiny ? (fondue ? FONDUE : '<span class="hgc-holo"></span>') : ''}
      ${uniq ? '<span class="hgc-sheen" aria-hidden="true"></span>' : ''}
      <span class="hgc-gems">${gemsHtml(r, rarityRank(r))}</span>
      <span class="hgc-plate${plateFit}"><span class="hgc-plate-t">${esc(plateTxt)}</span></span>
      ${win}
      ${stamp ? '<span class="hgc-stamp"><span>J’y</span><span>étais</span></span>' : ''}
      ${gen ? `<span class="hgc-gen">${generationLabel(gen)}</span>` : ''}
      <span class="hgc-fam">${esc(famLine)}</span>
      <span class="hgc-amb${ambFit}">${flavor ? `<em class="hgc-flavor">« ${esc(flavor)} »</em>` : ''}${caption ? `<span class="hgc-cap">${esc(caption)}</span>` : ''}</span>
      <span class="hgc-pied"><span class="hgc-pied-n">${esc(miss ? '' : numberLabel(card))}</span><span class="hgc-pied-s">${esc(serialTxt)}</span></span>
    </span>
    ${count}${lock}
  </${tag}>`;
}

/* ---------- Dos de carte et format des Paillettes ---------- */
/** Dos de carte (booster pas encore retourné) : trame rouge, médaillon arc-en-ciel au logo, bandeau noir. */
export function cardBackHtml(size = 'md') {
  const logo = logoAttrs(); // logo par défaut ou de thème du site : versions 96 / 192 px (affiché à 59-69 px)
  return `<div class="hgc hgc-back hgc-${size}" aria-hidden="true"><span class="hgc-frame">`
    + '<span class="hgc-layer hgc-out"></span><span class="hgc-layer hgc-mid"></span>'
    + `<span class="hgc-layer hgc-in"><span class="hgc-medal"><span class="hgc-medal-in"><img class="hgc-back-logo" src="${esc(logo.src)}"${logo.srcset ? ` srcset="${esc(logo.srcset)}" sizes="72px"` : ''} alt=""></span></span>`
    + '<span class="hgc-band-back">Humane Gang</span></span></span></div>';
}

/** Formate un nombre de Paillettes, avec séparateurs de milliers à la suisse et le symbole ✦. */
export const fmtP = (n) => `${new Intl.NumberFormat('fr-CH').format(n || 0)} ${paillSym()}`;
