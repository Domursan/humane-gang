// ===== Cartes : recyclage à paramètres (fenêtre « Recycler mes cartes » de l'onglet Collection) =====
// Le membre choisit ce qu'il garde (1 à 3 exemplaires, une brillante de chaque carte) et ce qui ne doit jamais partir
// (raretés, brillantes, numérotées, favoris, liste de souhaits, familles, séries). Le total se met à jour à chaque choix,
// puis une dernière confirmation. Il reste toujours au moins un exemplaire de chaque carte.
// Jamais recyclés : cartes Identité et uniques, exemplaires en échange ou en vitrine.
// Le site calcule la liste et l'envoie à hg_card_recycle (migration 074), qui garde ses propres refus. Aucune migration.
// Réglages retenus sur l'appareil seulement (localStorage). Tout texte venant de la base passe par esc().
// Exporte : planRecyclage (calcul pur), openRecyclage(ctx).
import { esc, toast, errMsg } from '../../commun/core.js';
import { pluralCount } from '../../commun/utils.js';
import { fmtPaillettes } from '../../commun/paillettes.js';
import { RARITIES, FAMILIES } from './cartes-ui.js';

const nf = new Intl.NumberFormat('fr-CH');
const CLE = 'hg_recyclage';
const RARES = RARITIES.filter((r) => r.id !== 'identite' && r.id !== 'unique');
const DEPART = { garde: 1, gardeSh: true, sh: false, num: true, fav: true, wish: true, rar: [], fam: [], ser: [], retenir: true };

/** Fenêtre, contexte, réglages, plan en cours. */
const R = { dlg: null, ctx: null, o: null, plan: null, busy: false };

/** Réglages retenus sur cet appareil, bornés ; les réglages de départ si rien n'est retenu. */
function lireReglages() {
  let v = null;
  try { v = JSON.parse(localStorage.getItem(CLE) || 'null'); } catch { /* stockage bloqué ou valeur illisible */ }
  if (!v || typeof v !== 'object') return { ...DEPART, rar: new Set(), fam: new Set(), ser: new Set() };
  const liste = (x) => new Set(Array.isArray(x) ? x.filter((e) => typeof e === 'string').slice(0, 200) : []);
  return { garde: [1, 2, 3].includes(v.garde) ? v.garde : 1, gardeSh: v.gardeSh !== false, sh: !!v.sh, num: v.num !== false, fav: v.fav !== false, wish: v.wish !== false,
    rar: liste(v.rar), fam: liste(v.fam), ser: liste(v.ser), retenir: true };
}

/** Écrit ou efface les réglages retenus. */
function ecrireReglages(o) {
  try {
    if (!o.retenir) { localStorage.removeItem(CLE); return; }
    localStorage.setItem(CLE, JSON.stringify({ ...o, rar: [...o.rar], fam: [...o.fam], ser: [...o.ser] }));
  } catch { /* stockage bloqué */ }
}

/**
 * Exemplaires à recycler selon les réglages. Les exemplaires gardés sont d'abord ceux qui ne peuvent pas partir
 * (échange, vitrine), puis les brillants, puis les plus anciens.
 * @param {object[]} copies mes exemplaires
 * @param {(id: string) => object|undefined} cardOf carte d'après son identifiant
 * @param {{garde: number, gardeSh: boolean, sh: boolean, num: boolean, fav: boolean, wish: boolean, rar: Set, fam: Set, ser: Set}} o réglages
 * @param {{favs: Set, wish: Set, vitrine: Set, value: (cp: object, k: object) => number}} p
 * @returns {{ids: number[], total: number, parRarete: Map<string, number>}}
 */
export function planRecyclage(copies, cardOf, o, p) {
  const parCarte = new Map();
  for (const cp of copies) {
    if (!parCarte.has(cp.card_id)) parCarte.set(cp.card_id, []);
    parCarte.get(cp.card_id).push(cp);
  }
  const protege = (cp) => !!cp.locked_trade || p.vitrine.has(Number(cp.id));
  const ids = [], parRarete = new Map();
  let total = 0;
  for (const [id, list] of parCarte) {
    const k = cardOf(id);
    if (!k || k.rarity === 'identite' || k.rarity === 'unique') continue;
    if (o.rar.has(k.rarity) || o.fam.has(k.family) || o.ser.has(k.set_id)) continue;
    if ((o.num && k.max_copies) || (o.fav && p.favs.has(id)) || (o.wish && p.wish.has(id))) continue;
    const brillantes = list.filter((cp) => cp.shiny), simples = list.filter((cp) => !cp.shiny);
    const lots = o.sh ? [[simples, o.garde]] : o.gardeSh ? [[simples, o.garde], [brillantes, 1]] : [[list, o.garde]];
    for (const [lot, n] of lots) {
      const tries = [...lot].sort((a, b) => Number(protege(b)) - Number(protege(a)) || Number(b.shiny) - Number(a.shiny) || Number(a.id) - Number(b.id));
      for (const cp of tries.slice(n)) {
        if (protege(cp)) continue;
        ids.push(cp.id);
        total += p.value(cp, k);
        parRarete.set(k.rarity, (parRarete.get(k.rarity) || 0) + 1);
      }
    }
  }
  return { ids, total, parRarete };
}

const chipHtml = (nom, val, label, on, type = 'checkbox') => `<label class="champ-chip"><input type="${type}" name="${nom}" value="${esc(val)}"${on ? ' checked' : ''}><span>${esc(label)}</span></label>`;
const detailHtml = (plan) => `<ul class="mc-detail">${RARES.filter((r) => plan.parRarete.has(r.id)).map((r) => `<li><span>${esc(r.label)}</span><span>${nf.format(plan.parRarete.get(r.id))}</span></li>`).join('')}</ul>`;
const exclues = (n) => (n ? `${nf.format(n)} exclue${n > 1 ? 's' : ''}` : 'aucune exclue');

/** Recalcule le plan, puis le bilan et les compteurs de la fenêtre (les champs ne sont pas redessinés). */
function majBilan() {
  const c = R.ctx, o = R.o;
  R.plan = planRecyclage(c.copies(), c.card, o, { favs: c.favs(), wish: c.wish(), vitrine: c.vitrine(), value: c.value });
  const n = R.plan.ids.length;
  const b = R.dlg.querySelector('.mc-bilan');
  b.innerHTML = `${n ? `<p class="mc-bilan-l"><strong>${pluralCount(n, 'carte', 'cartes', nf.format)}</strong><span>environ ${fmtPaillettes(R.plan.total)}</span></p>${detailHtml(R.plan)}` : '<p class="mc-bilan-l"><span>Aucune carte à recycler avec ces réglages.</span></p>'}
    <div class="btn-row"><button type="button" class="btn btn-ghost" data-rec="fermer">Annuler</button><button type="button" class="btn btn-primary" data-rec="suite"${n ? '' : ' disabled'}>${n ? `Continuer · ${pluralCount(n, 'carte', 'cartes', nf.format)}` : 'Recycler'}</button></div>`;
  R.dlg.querySelector('[data-rec-n="fam"]').textContent = exclues(o.fam.size);
  R.dlg.querySelector('[data-rec-n="ser"]').textContent = exclues(o.ser.size);
}

/** Écran des réglages. */
function reglagesHtml() {
  const o = R.o;
  return `<h2 id="mc-rec-t" tabindex="-1">Recycler mes cartes</h2>
    <section class="mc-bloc"><h3>Ce que je garde</h3>
      <div class="mc-chips" role="radiogroup" aria-label="Exemplaires gardés par carte">${[1, 2, 3].map((n) => chipHtml('rec-garde', String(n), `${n} exemplaire${n > 1 ? 's' : ''}`, o.garde === n, 'radio')).join('')}</div>
      <label class="mc-case"><input type="checkbox" name="rec-opt" value="gardeSh"${o.gardeSh ? ' checked' : ''}> Garder aussi un exemplaire de chaque brillante</label>
      <p class="mc-aide">Tu gardes toujours au moins un exemplaire. Les cartes Identité, Uniques, en vitrine et en cours d’échange ne sont jamais touchées.</p></section>
    <section class="mc-bloc"><h3>Ne jamais recycler</h3>
      <fieldset class="mc-fs"><legend class="mc-lg">Raretés</legend><div class="mc-chips">${RARES.map((r) => chipHtml('rec-rar', r.id, `${r.label}s`, o.rar.has(r.id))).join('')}</div></fieldset>
      <fieldset class="mc-fs"><legend class="mc-lg">Cartes précises</legend><div class="mc-chips">${chipHtml('rec-opt', 'sh', 'Brillantes', o.sh)}${chipHtml('rec-opt', 'num', 'Numérotées', o.num)}${chipHtml('rec-opt', 'fav', 'Favoris', o.fav)}${chipHtml('rec-opt', 'wish', 'Liste de souhaits', o.wish)}</div></fieldset>
      <details class="mc-plus"><summary>Familles <span data-rec-n="fam"></span></summary><div class="mc-chips">${FAMILIES.map((f) => chipHtml('rec-fam', f.id, f.label, o.fam.has(f.id))).join('')}</div></details>
      <details class="mc-plus"><summary>Séries <span data-rec-n="ser"></span></summary><div class="mc-chips">${R.ctx.sets().map((s) => chipHtml('rec-ser', s.id, s.name, o.ser.has(s.id))).join('')}</div></details>
      <label class="mc-case"><input type="checkbox" name="rec-opt" value="retenir"${o.retenir ? ' checked' : ''}> Retenir ces réglages</label></section>
    <div class="mc-bilan"></div>`;
}

/** Écran de la dernière confirmation. */
function confirmeHtml() {
  const n = R.plan.ids.length;
  return `<h2 id="mc-rec-t" tabindex="-1">Recycler ${pluralCount(n, 'carte', 'cartes', nf.format)} ?</h2>
    <p>Tu recevras environ <strong>${fmtPaillettes(R.plan.total)}</strong>. Cette action est définitive : les cartes recyclées ne reviennent pas.</p>
    ${detailHtml(R.plan)}
    <div class="btn-row"><button type="button" class="btn btn-ghost" data-rec="retour">Revenir aux réglages</button><button type="button" class="btn btn-primary" data-rec="go">Recycler ${pluralCount(n, 'carte', 'cartes', nf.format)}</button></div>`;
}

/** Montre un écran et place le focus sur son titre. */
function montrer(html) {
  const pad = R.dlg.querySelector('.cartes-dialog-pad');
  pad.innerHTML = html;
  if (pad.querySelector('.mc-bilan')) majBilan();
  pad.querySelector('#mc-rec-t')?.focus({ preventScroll: true });
}

/** Recycle les exemplaires du plan, puis recharge la page. */
async function recycler(btn) {
  if (R.busy) return;
  R.busy = true;
  btn.disabled = true;
  try {
    await R.ctx.recycle(R.plan.ids);
    R.dlg.close();
  } catch (e) {
    toast(errMsg(e), 'error');
    btn.disabled = false;
  } finally {
    R.busy = false;
  }
}

/** Crée la fenêtre une seule fois. */
function ensureDialog() {
  if (R.dlg) return R.dlg;
  const d = document.createElement('dialog');
  d.id = 'cartes-recyclage';
  d.className = 'cartes-dialog mc-dlg';
  d.setAttribute('aria-labelledby', 'mc-rec-t');
  d.innerHTML = '<div class="cartes-dialog-pad"></div>';
  (document.getElementById('app') || document.body).append(d);
  d.addEventListener('click', (e) => {
    const t = e.target.closest('[data-rec]');
    if (!t || t.disabled) return;
    if (t.dataset.rec === 'fermer') d.close();
    else if (t.dataset.rec === 'suite') montrer(confirmeHtml());
    else if (t.dataset.rec === 'retour') montrer(reglagesHtml());
    else if (t.dataset.rec === 'go') recycler(t);
  });
  d.addEventListener('change', (e) => {
    const t = e.target, o = R.o;
    if (t.name === 'rec-garde') o.garde = Number(t.value);
    else if (t.name === 'rec-opt') o[t.value] = t.checked;
    else if (t.name === 'rec-rar' || t.name === 'rec-fam' || t.name === 'rec-ser') { const s = o[t.name.slice(4)]; if (t.checked) s.add(t.value); else s.delete(t.value); }
    else return;
    ecrireReglages(o);
    majBilan();
  });
  d.addEventListener('close', () => { R.ctx?.onClose?.(); });
  R.dlg = d;
  return d;
}

/**
 * Ouvre la fenêtre de recyclage.
 * @param {{copies: () => object[], card: (id: string) => object|undefined, favs: () => Set, wish: () => Set, vitrine: () => Set, sets: () => object[],
 *   value: (cp: object, k: object) => number, recycle: (ids: number[]) => Promise<void>, onClose?: () => void}} ctx
 */
export function openRecyclage(ctx) {
  R.ctx = ctx;
  R.o = lireReglages();
  const d = ensureDialog();
  if (!d.open) d.showModal();
  montrer(reglagesHtml());
}
