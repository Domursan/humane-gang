// ===== Humane Gang — Uno : dessin des cartes (style art déco validé en maquette) =====
/*
 * Rôle : produit le HTML d'une carte (face ou dos D « arc-en-ciel doré ») et les libellés lisibles.
 * Styles : assets/espaces/uno/uno.css (classes .uc, .ub). Aucune image : tout est en CSS et SVG.
 * Couleurs : r rouge, y jaune, g vert, b bleu, k noir (Joker). Valeurs : 0-9, +2, inv, passe, joker, +4.
 * Exporte : COULEURS, ICONE_PASSE (aussi le jeton Passe de la table), nomCouleur, nomCarte, carteHtml, dosHtml, pointsCarte.
 */
import { esc } from '../../commun/core.js';

/** Couleurs du jeu : nom, teinte d'affichage. */
export const COULEURS = {
  r: { nom: 'Rouge', hex: '#D93A3F' },
  y: { nom: 'Jaune', hex: '#F2B705' },
  g: { nom: 'Vert', hex: '#1F9D55' },
  b: { nom: 'Bleu', hex: '#2A6FDB' },
  k: { nom: 'Noir', hex: '#17171A' },
};

/** Nom lisible d'une couleur (« Rouge »). */
export const nomCouleur = (c) => COULEURS[c]?.nom || '';

const ICONE_INV = (t) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>`;
export const ICONE_PASSE = (t) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/></svg>`;

/** Nom lisible d'une carte (« Rouge 7 », « Bleu Inversion », « Joker +4 »). */
export function nomCarte(c) {
  if (!c) return '';
  if (c.valeur === 'joker') return 'Joker';
  if (c.valeur === '+4') return 'Joker +4';
  const v = { inv: 'Inversion', passe: 'Passe' }[c.valeur] || c.valeur;
  return `${nomCouleur(c.couleur)} ${v}`;
}

/** Valeur de la carte en points (fin de manche). */
export const pointsCarte = (c) => (/^[0-9]$/.test(c.valeur) ? Number(c.valeur) : ['joker', '+4'].includes(c.valeur) ? 50 : 20);

/**
 * HTML d'une face de carte.
 * @param {{id?:number, couleur:string, valeur:string}} c Carte.
 * @param {{taille?:'s'|'l'|'', bouton?:boolean, jouable?:boolean, classe?:string, attrs?:string}} [o]
 *   bouton : rend un <button> (main du joueur) ; jouable : surligne la carte (sinon assombrie si bouton).
 */
export function carteHtml(c, { taille = '', bouton = false, jouable = false, classe = '', attrs = '' } = {}) {
  const coul = ['r', 'y', 'g', 'b', 'k'].includes(c.couleur) ? c.couleur : 'k';
  const grand = taille === 'l' ? 36 : taille === 's' ? 21 : 30;
  const petit = taille === 'l' ? 16 : taille === 's' ? 11 : 14;
  let centre; let coin;
  if (c.valeur === 'inv') { centre = ICONE_INV(grand); coin = ICONE_INV(petit); }
  else if (c.valeur === 'passe') { centre = ICONE_PASSE(grand); coin = ICONE_PASSE(petit); }
  else if (c.valeur === 'joker') { centre = ''; coin = ''; }
  else { centre = esc(c.valeur); coin = esc(c.valeur); }
  const t = c.valeur.startsWith('+') ? ' class="t"' : '';
  const coins = coin ? `<span class="co tl">${coin}</span>` : '';
  const coinsBas = coin ? `<span class="co br">${coin}</span>` : '';
  const interieur = `<span class="f">${coins}<span class="m"><span${t}>${centre}</span></span>${coinsBas}</span>`;
  const cls = `uc v3 ${coul} ${taille} ${classe}${bouton ? (jouable ? ' jouable' : ' bloquee') : ''}`.replace(/\s+/g, ' ').trim();
  const nom = esc(nomCarte(c));
  if (bouton) {
    return `<button type="button" class="${cls}" data-carte="${c.id}" aria-label="${nom}${jouable ? '' : ', pas jouable'}"${jouable ? '' : ' aria-disabled="true"'} ${attrs}>${interieur}</button>`;
  }
  return `<span class="${cls}" role="img" aria-label="${nom}" ${attrs}>${interieur}</span>`;
}

/** HTML du dos de carte D (bande arc-en-ciel, anneau doré HG). */
export function dosHtml({ taille = '', classe = '', label = 'Dos de carte', attrs = '' } = {}) {
  return `<span class="ub d ${taille} ${classe}" role="img" aria-label="${esc(label)}" ${attrs}><span class="f"><span></span><i><b>HG</b></i></span></span>`;
}
