// ===== Humane Gang — lot d'une enchère du Staff (migration 215), partagé par la Boutique et l'admin =====
// Le lot se compose comme un give : Paillettes, cartes à l'unité, séries ou types entiers, boosters. Ce module le décrit :
// résumé chiffré (« 2 000 ✦, 63 cartes, 3 boosters »), contenu en phrase (encart de la Boutique), pile de visuels (encart),
// liste détaillée (page de l'enchère) et détail court (liste de l'admin).
// Forme du lot (hg_auction_current.auction.lot, ou construite par le panier de l'admin) :
//   { nom, paillettes, cartes, boosters, lignes: [{ type: 'carte'|'lot'|'booster', titre, qte, shiny, n?, card?, type_booster? }] }
// Styles : enchere-lot.css (chargée une fois par ensureLotCss).
// Exporte : ensureLotCss, lotQuand, lotResume, lotContenu, lotDetail, lotPileHtml, lotTeaserHtml, lotItemsHtml.
import { esc, currentLogo } from '../../commun/core.js';
import { paillSym } from '../../commun/paillettes.js';
import { cardHtml, rarityLabel } from './cartes-ui.js';
import { boosterStyleClass } from './booster-styles.js';
import { themeDecor } from './booster-themes.js';

const nf = new Intl.NumberFormat('fr-CH');
/** Nombre suivi du mot au singulier ou au pluriel. */
const plur = (n, one, many) => `${nf.format(n)} ${n > 1 ? many : one}`;
/** Première lettre en minuscule (titre d'une ligne dans une phrase). */
const bas = (s) => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
const CSS_HREF = new URL('./enchere-lot.css', import.meta.url).href;

const IDEES_HREF = new URL('./cartes-idees.css', import.meta.url).href;
const TZ = 'Europe/Zurich';

/** Ajoute une feuille de style (une seule fois). */
function feuille(href, cle) {
  if (document.querySelector(`link[data-enp-css="${cle}"]`) || [...document.styleSheets].some((s) => s.href === href)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.enpCss = cle;
  document.head.append(l);
}
/**
 * Charge la feuille du lot (une seule fois). encart : charge aussi celle de l'encart de la Boutique (cartes-idees.css),
 * pour l'aperçu de l'admin.
 */
export function ensureLotCss({ encart = false } = {}) {
  feuille(CSS_HREF, 'lot');
  if (encart) feuille(IDEES_HREF, 'idees');
}

/** « vendredi 18 h » / « vendredi 18 h 30 » (heure de Zurich). */
export function lotQuand(iso) {
  const d = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-CH', { weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday} ${Number(p.hour)} h${p.minute !== '00' ? ' ' + p.minute : ''}`;
}

const lignes = (lot) => lot?.lignes || [];
/** Cartouche de booster à l'échelle du lot : même markup que admin/visual-pick.js (cartHtml), sans charger le code de l'admin sur la page Cartes. */
function cartHtml(t = { name: '', size: 5, style: '' }) {
  const style = boosterStyleClass(t.style);
  const deco = themeDecor(style);
  return `<span class="enp-cart" aria-hidden="true"><span class="cart-box ${esc(style)}">`
    + `<span class="cart-body">${deco ? deco.body : ''}</span><span class="cart-notch"></span>`
    + `<span class="cart-label"><span class="cart-label-fl"></span><span class="cart-scr">${deco ? deco.scr : `<img src="${esc(currentLogo())}" alt="">`}</span></span>`
    + '<span class="cart-lbl1">LE GANG</span>'
    + `<span class="cart-lbl2">${esc(String(t.name || '').toUpperCase())}</span>`
    + '<span class="cart-stripe"><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="cart-ridge"></span>'
    + `<span class="cart-foot">${esc(nf.format(Number(t.size) || 5))} CARTES</span>${deco ? deco.over : ''}</span></span>`;
}

/** « 2 000 ✦, 63 cartes, 3 boosters ». */
export function lotResume(lot) {
  if (!lot) return '';
  return [lot.paillettes > 0 && `${nf.format(lot.paillettes)} ${paillSym()}`, lot.cartes > 0 && plur(lot.cartes, 'carte', 'cartes'),
    lot.boosters > 0 && plur(lot.boosters, 'booster', 'boosters')].filter(Boolean).join(', ');
}

/** Contenu en phrase : « 2 000 Paillettes, Kraken brillante, 2 cartes épiques, toute la série « … », 3 boosters ». */
export function lotContenu(lot) {
  if (!lot) return '';
  const out = lot.paillettes > 0 ? [`${nf.format(lot.paillettes)} Paillettes`] : [];
  // Cartes à l'unité : regroupées par rareté ; une seule carte d'une rareté garde son nom.
  const groupes = new Map();
  for (const l of lignes(lot).filter((x) => x.type === 'carte')) {
    const r = l.card?.rarity || '';
    if (!groupes.has(r)) groupes.set(r, []);
    groupes.get(r).push(l);
  }
  for (const [r, ls] of groupes) {
    const n = ls.reduce((s, l) => s + Number(l.qte || 1), 0);
    out.push(n === 1 ? ls[0].titre : `${nf.format(n)} cartes ${bas(rarityLabel(r))}s`);
  }
  for (const l of lignes(lot).filter((x) => x.type === 'lot')) out.push(bas(l.titre) + (l.qte > 1 ? ` (${nf.format(l.qte)} exemplaires de chaque)` : ''));
  if (lot.boosters > 0) out.push(plur(lot.boosters, 'booster', 'boosters'));
  return out.join(', ');
}

/** Détail court pour l'admin : « Kraken brillante, toute la série « … », 2 Doré, 1 Diamant ». */
export function lotDetail(lot) {
  return lignes(lot).map((l) => (l.type === 'carte' ? `${l.qte > 1 ? `${nf.format(l.qte)} × ` : ''}${l.titre}`
    : l.type === 'lot' ? bas(l.titre) : `${nf.format(l.qte)} ${l.titre}`)).join(', ');
}

/** Pile de visuels de l'encart : la première carte (ou la première série), le premier booster, l'étoile des Paillettes. */
export function lotPileHtml(lot) {
  const carte = lignes(lot).find((l) => l.type === 'carte' && l.card);
  const serie = lignes(lot).find((l) => l.type === 'lot');
  const boost = lignes(lot).find((l) => l.type === 'booster');
  const p1 = carte ? cardHtml(carte.card, { size: 'sm', shiny: !!carte.shiny }) : serie ? `<span class="enp-pile-n">${esc(nf.format(serie.n || 0))}</span>` : '';
  return `<div class="c2-auc-mini enp-pile" aria-hidden="true">${p1 ? `<span class="enp-p enp-p1">${p1}</span>` : ''}${boost ? `<span class="enp-p enp-p2">${cartHtml(boost.type_booster)}</span>` : ''}${lot?.paillettes > 0 ? `<span class="enp-p enp-p3"><span class="enp-etoile">${paillSym()}</span></span>` : ''}</div>`;
}

/**
 * Encart de la Boutique pour une enchère en lot (aussi l'aperçu de l'admin).
 * @param {object} lot
 * @param {{etatHtml?: string, top?: string, bouton?: string}} [o] etatHtml : ligne d'état déjà échappée (« Fin dans … ») ;
 *   top : meilleure offre en texte (vide : ligne masquée) ; bouton : libellé du bouton
 */
export function lotTeaserHtml(lot, { etatHtml = '', top = '', bouton = 'Voir' } = {}) {
  return `<section class="card c2-auc-teaser enp-teaser" aria-labelledby="c2-auc-t">
      ${lotPileHtml(lot)}
      <div class="c2-auc-tinfo">
        <p class="eyebrow">Enchère de la semaine</p>
        <h2 id="c2-auc-t" class="c2-auc-tname">${esc(lot?.nom || '')}</h2>
        <p class="small enp-contenu"><strong>Dans le lot :</strong> ${esc(lotContenu(lot))}</p>
        ${etatHtml ? `<p class="small">${etatHtml}</p>` : ''}
        ${top ? `<p class="small muted">Meilleure offre : ${esc(top)}</p>` : ''}
        <button type="button" class="btn btn-sand" data-c2="auc-open">${esc(bouton)}</button>
      </div>
    </section>`;
}

/** Liste détaillée du lot (page de l'enchère). */
export function lotItemsHtml(lot) {
  const item = (vis, titre, sous) => `<li class="enp-item"><span class="enp-vis">${vis}</span><span class="enp-txt"><strong>${esc(titre)}</strong><span>${esc(sous)}</span></span></li>`;
  const items = [];
  if (lot?.paillettes > 0) items.push(item(`<span class="enp-etoile">${paillSym()}</span>`, `${nf.format(lot.paillettes)} Paillettes`, 'ajoutées au solde du gagnant'));
  for (const l of lignes(lot)) {
    const q = Number(l.qte) || 1;
    if (l.type === 'carte') {
      const k = l.card || {};
      items.push(item(cardHtml(k, { size: 'sm', shiny: !!l.shiny }), `${q > 1 ? `${nf.format(q)} × ` : ''}${k.name || l.titre}`,
        [rarityLabel(k.rarity), l.shiny ? 'brillante' : k.set_name].filter(Boolean).join(' · ')));
    } else if (l.type === 'lot') {
      items.push(item(`<span class="enp-pile-n">${esc(nf.format(l.n || 0))}</span>`, l.titre,
        `${plur(l.n || 0, 'carte', 'cartes')}, ${plur(q, 'exemplaire', 'exemplaires')} de chaque${l.shiny ? ', brillantes' : ''}`));
    } else {
      const t = l.type_booster || {};
      items.push(item(cartHtml(t), `${plur(q, 'booster', 'boosters')} ${t.name || l.titre}`, `${plur(Number(t.size) || 5, 'carte', 'cartes')}${q > 1 ? ' chacun' : ''}`));
    }
  }
  return `<section class="enp-lot" aria-labelledby="enp-lot-h"><h3 class="c2-auc-sub" id="enp-lot-h">Dans le lot <span class="small muted">· ${plur(items.length, 'élément', 'éléments')}</span></h3>
    <ul class="enp-items">${items.join('')}</ul></section>`;
}
