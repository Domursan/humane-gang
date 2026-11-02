// ===== Cartes à collectionner — paramètres de « Imprimer ma planche » (idée C16) =====
// Fenêtre ouverte depuis l'onglet Collection (/pages/cartes/cartes.html) : le membre choisit les cartes, la mise en page et l'en-tête,
// voit le nombre de cartes et de pages A4, puis génère la planche. Aucune page n'est préparée avant « Générer ma planche ».
// Elle part de la série et des filtres affichés à l'écran. Tous les réglages tiennent dans l'adresse de collection-a4.html :
// lirePlanche, requetePlanche et filtrerPlanche sont partagés avec cette page, pour que le bilan annoncé soit celui de la planche.
// « Changer les paramètres » (planche) revient ici avec ?planche=1 et les mêmes réglages : voir repriseDemandee.
// Lectures : aucune, la fenêtre compte sur les données déjà chargées par la page. Tout texte venant de la base passe par esc().
// Exporte : openPlanche(ctx), repriseDemandee(), lirePlanche(q), requetePlanche(o), filtrerPlanche(cards, o, etat), pagesPlanche(n, par).
import { esc } from '../../commun/core.js';
import { RARITIES, FAMILIES, rarityRank } from './cartes-ui.js';

const nf = new Intl.NumberFormat('fr-CH');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITRE_MAX = 40;
const PAGES_ALERTE = 20;
const PAR_PAGE = [9, 16, 30];
const TRIS = [['numero', 'Numéro'], ['rarete', 'Rareté'], ['famille', 'Famille']];
const CARTES = [['all', 'Toutes'], ['own', 'Possédées'], ['miss', 'Manquantes'], ['dup', 'Doublons'], ['fav', 'Favoris'], ['wish', 'Liste de souhaits']];

/**
 * Réglages lus dans une adresse (valeurs bornées). Une ancienne adresse n'a que set, theme et missing.
 * @param {URLSearchParams} q
 * @returns {{set: string, theme: string, par: number, tri: string, rarete: string, famille: string, cartes: string, titre: string, compteur: boolean}}
 */
export function lirePlanche(q) {
  const set = q.get('set');
  const par = Number(q.get('par'));
  const cartes = q.get('cartes');
  const dans = (val, liste) => (liste.some((x) => x.id === val) ? val : '');
  return {
    set: set === 'all' || UUID.test(set || '') ? set : 'all',
    theme: q.get('theme') === 'sombre' ? 'sombre' : 'clair',
    par: PAR_PAGE.includes(par) ? par : 30,
    tri: TRIS.some(([t]) => t === q.get('tri')) ? q.get('tri') : 'numero',
    rarete: dans(q.get('rarete'), RARITIES),
    famille: dans(q.get('famille'), FAMILIES),
    cartes: CARTES.some(([c]) => c === cartes) ? cartes : (q.get('missing') === '0' ? 'own' : 'all'),
    titre: (q.get('titre') || '').replace(/\p{Cc}/gu, ' ').trim().slice(0, TITRE_MAX),
    compteur: q.get('compteur') !== '0',
  };
}

/**
 * Adresse (partie requête) de réglages : seules les valeurs différentes du défaut sont écrites, sauf set, theme, cartes et missing.
 * @param {object} o réglages (lirePlanche)
 * @returns {URLSearchParams}
 */
export function requetePlanche(o) {
  const q = new URLSearchParams();
  q.set('set', o.set); q.set('theme', o.theme); q.set('cartes', o.cartes); q.set('missing', o.cartes === 'own' ? '0' : '1');
  if (o.par !== 30) q.set('par', o.par);
  if (o.tri !== 'numero') q.set('tri', o.tri);
  if (o.rarete) q.set('rarete', o.rarete);
  if (o.famille) q.set('famille', o.famille);
  if (o.titre) q.set('titre', o.titre);
  if (!o.compteur) q.set('compteur', '0');
  return q;
}

/**
 * Cartes de la planche, filtrées puis triées (tri stable : l'ordre reçu reste à égalité).
 * @param {object[]} cards cartes des séries retenues
 * @param {object} o réglages
 * @param {{own: (id: string) => boolean, dup: (id: string) => boolean, fav: (id: string) => boolean, wish: (id: string) => boolean}} etat
 * @returns {object[]}
 */
export function filtrerPlanche(cards, o, etat) {
  const garde = { all: () => true, own: etat.own, miss: (id) => !etat.own(id), dup: etat.dup, fav: (id) => etat.own(id) && etat.fav(id), wish: etat.wish }[o.cartes];
  const list = cards.filter((c) => (!o.rarete || c.rarity === o.rarete) && (!o.famille || c.family === o.famille) && garde(c.id));
  const rang = (c) => FAMILIES.findIndex((f) => f.id === c.family);
  if (o.tri === 'rarete') list.sort((a, b) => rarityRank(a.rarity) - rarityRank(b.rarity));
  else if (o.tri === 'famille') list.sort((a, b) => rang(a) - rang(b));
  return list;
}

/** Nombre de pages A4 pour n cartes (au moins une). */
export const pagesPlanche = (n, par) => Math.max(1, Math.ceil(n / par));

/** Vrai si l'adresse demande de rouvrir la fenêtre (retour de la planche par « Changer les paramètres »). */
export const repriseDemandee = () => new URLSearchParams(location.search).get('planche') === '1';

/** Réglages de départ : ceux de la planche quittée, sinon ceux de l'écran. */
function depart(ctx, sets) {
  if (repriseDemandee()) {
    const o = lirePlanche(new URLSearchParams(location.search));
    history.replaceState(null, '', `${location.pathname}${location.hash}`);
    return o;
  }
  const f = ctx.filtres || {};
  const v = f.vues || new Set();
  const cartes = v.has('fav') ? 'fav' : v.has('wish') ? 'wish' : v.has('dupes') ? 'dup' : v.has('owned') === v.has('missing') ? 'all' : v.has('owned') ? 'own' : 'miss';
  return { ...lirePlanche(new URLSearchParams()), set: sets.some((s) => s.id === ctx.setId) ? ctx.setId : 'all', rarete: f.rarity || '', famille: f.family || '', cartes };
}

const chip = (nom, val, label, on) => `<label class="champ-chip"><input type="radio" name="${nom}" value="${val}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
const optionHtml = (val, label, on) => `<option value="${esc(val)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
/** Petite grille dessinée d'un choix « par page ». */
function miniGrille(par) {
  const col = par === 30 ? 6 : Math.sqrt(par);
  return `<i style="grid-template-columns:repeat(${col},1fr);grid-template-rows:repeat(${par / col},1fr)">${'<b></b>'.repeat(par)}</i>`;
}

/** Contenu de la fenêtre. */
function dialogHtml(o, sets, titreDefaut) {
  return `<div class="cartes-dialog-pad"><h2 id="mc-pl-t">Imprimer ma planche</h2>
    <section class="mc-bloc"><h3>Cartes à mettre</h3>
      <div class="mc-selects-2">
        <div class="field"><label for="mc-p-s">Série</label><select id="mc-p-s">${optionHtml('all', 'Toutes les séries', o.set === 'all')}${sets.map((s) => optionHtml(s.id, s.name, s.id === o.set)).join('')}</select></div>
        <div class="field"><label for="mc-p-t">Trier par</label><select id="mc-p-t">${TRIS.map(([v, l]) => optionHtml(v, l, v === o.tri)).join('')}</select></div>
        <div class="field"><label for="mc-p-r">Rareté</label><select id="mc-p-r">${optionHtml('', 'Toutes', !o.rarete)}${RARITIES.map((r) => optionHtml(r.id, r.label, r.id === o.rarete)).join('')}</select></div>
        <div class="field"><label for="mc-p-f">Famille</label><select id="mc-p-f">${optionHtml('', 'Toutes', !o.famille)}${FAMILIES.map((x) => optionHtml(x.id, x.label, x.id === o.famille)).join('')}</select></div>
      </div>
      <div class="mc-chips" role="radiogroup" aria-label="Cartes à mettre">${CARTES.map(([v, l]) => chip('mc-c', v, l, v === o.cartes)).join('')}</div></section>
    <section class="mc-bloc"><h3>Mise en page</h3>
      <div class="mc-taille" role="radiogroup" aria-label="Cartes par page">${PAR_PAGE.map((n) => `<label><input type="radio" name="mc-n" value="${n}"${n === o.par ? ' checked' : ''}><span>${miniGrille(n)}${n} par page</span></label>`).join('')}</div>
      <div class="mc-chips" role="radiogroup" aria-label="Fond">${chip('mc-t', 'clair', 'Fond clair, économie d’encre', o.theme === 'clair')}${chip('mc-t', 'sombre', 'Fond sombre', o.theme === 'sombre')}</div></section>
    <section class="mc-bloc"><h3>En-tête</h3>
      <div class="field"><label for="mc-p-h">Titre</label><input id="mc-p-h" maxlength="${TITRE_MAX}" autocomplete="off" value="${esc(o.titre || titreDefaut)}"></div>
      <label class="mc-case"><input type="checkbox" id="mc-p-c"${o.compteur ? ' checked' : ''}> Afficher le compteur de cartes possédées</label></section>
    <div class="mc-bilan">
      <p class="mc-alerte" data-pl="alerte" hidden>Ça fait beaucoup de pages. Choisir une seule série réduit l’impression et l’attente.</p>
      <p class="mc-bilan-l"><strong data-pl="bilan" aria-live="polite"></strong><span>Rien n’est imprimé à cette étape</span></p>
      <div class="btn-row"><button type="button" class="btn btn-ghost" data-pl="annuler">Annuler</button><button type="button" class="btn btn-primary" data-pl="generer">Générer ma planche</button></div>
    </div></div>`;
}

/** Réglages tels qu'ils sont dans la fenêtre. */
function lireFenetre(d, titreDefaut) {
  const val = (nom) => d.querySelector(`[name="${nom}"]:checked`)?.value;
  const titre = d.querySelector('#mc-p-h').value.trim().slice(0, TITRE_MAX);
  return { set: d.querySelector('#mc-p-s').value, tri: d.querySelector('#mc-p-t').value, rarete: d.querySelector('#mc-p-r').value, famille: d.querySelector('#mc-p-f').value,
    cartes: val('mc-c'), par: Number(val('mc-n')), theme: val('mc-t'), titre: titre === titreDefaut ? '' : titre, compteur: d.querySelector('#mc-p-c').checked };
}

/**
 * Ouvre la fenêtre de paramètres de la planche.
 * @param {{sets: object[], cards: () => object[], copiesOf: (id: string) => object[], favs: Set<string>, wish: Set<string>, pseudo: string, setId: string,
 *   filtres?: {rarity?: string, family?: string, vues?: Set<string>}, hasDupes: (id: string) => boolean, onClose?: () => void}} ctx
 *   vues : 'owned', 'missing', 'dupes', 'fav', 'wish' ; setId : série affichée ou « toutes les séries »
 */
export function openPlanche(ctx) {
  const sets = (ctx.sets || []).filter((s) => s.code !== 'secrets');
  const titreDefaut = `Collection de ${ctx.pseudo || ''}`.slice(0, TITRE_MAX);
  const etat = { own: (id) => ctx.copiesOf(id).length > 0, dup: ctx.hasDupes, fav: (id) => ctx.favs.has(id), wish: (id) => ctx.wish.has(id) };
  const d = document.createElement('dialog');
  d.id = 'mc-pl';
  d.className = 'cartes-dialog mc-dlg';
  d.setAttribute('aria-labelledby', 'mc-pl-t');
  d.innerHTML = dialogHtml(depart(ctx, sets), sets, titreDefaut);
  /** Recalcule le bilan à chaque choix. */
  const bilan = () => {
    const o = lireFenetre(d, titreDefaut);
    const ids = new Set(o.set === 'all' ? sets.map((s) => s.id) : [o.set]);
    const n = filtrerPlanche(ctx.cards().filter((c) => ids.has(c.set_id)), o, etat).length;
    const pages = pagesPlanche(n, o.par);
    d.querySelector('[data-pl="bilan"]').textContent = n
      ? `${nf.format(n)} carte${n > 1 ? 's' : ''} · ${nf.format(pages)} page${pages > 1 ? 's' : ''} A4` : 'Aucune carte avec ces réglages';
    d.querySelector('[data-pl="alerte"]').hidden = pages <= PAGES_ALERTE;
    d.querySelector('[data-pl="generer"]').disabled = !n;
  };
  d.addEventListener('change', bilan);
  d.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pl]');
    if (!b || b.disabled) return;
    if (b.dataset.pl === 'annuler') d.close();
    if (b.dataset.pl === 'generer') location.href = `/pages/cartes/collection-a4.html?${requetePlanche(lireFenetre(d, titreDefaut))}`;
  });
  d.addEventListener('close', () => { d.remove(); ctx.onClose?.(); });
  (document.getElementById('app') || document.body).append(d);
  bilan();
  d.showModal();
}
