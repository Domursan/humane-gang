// =====================================================================
// Cartes admin : onglet « Enchères » (idée C11, migration 081 ; lot en panier, migration 215).
// Planifier une enchère dont le lot se compose comme un give (admin/give-panier.js, option lot) : Paillettes, cartes à
// l'unité, série ou type entier, brillantes ou non, boosters. Le lot est figé à la création et n'est créé qu'à la fin,
// pour le gagnant. Par défaut du vendredi 18 h au dimanche 18 h ; une seule enchère du Staff à la fois (dates sans
// chevauchement, contrôlé par le serveur). La mise de départ doit dépasser les Paillettes du lot.
// Cartes uniques : déjà attribuées ou déjà dans une autre enchère, elles sont grisées (le serveur les refuse aussi).
// Annuler une enchère prévue ou ouverte (la meilleure offre est remboursée), historique des 50 dernières.
// Règles réglables par enchère (migration 097) : à la création et ensuite (« Modifier les règles »), via enchere-regles.js.
// RPC : hg_auctions_admin, hg_auction_create, hg_auction_update, hg_auction_cancel (Staff « cartes », journal admin).
// Enchères entre membres (idée 33, migration 212) : hg_encheres_admin, lecture seule (qui a enchéri sur la carte de qui).
// Exporte : mountAuctionsTab(el), nextWeekend(now), creerEnchereLot(host, o) (aussi utilisé par la fenêtre du plateau,
// quick.js). Les cartes viennent de C (state.js).
// =====================================================================
import { paillSym } from '../../../commun/paillettes.js';
import { sb, toast, esc, errMsg } from '../../../commun/core.js';
import { confirmBox } from '../../../commun/ui-confirm.js';
import { C } from './state.js';
import { act, check, fmtWhen, nf } from './helpers.js';
import { DEFAULT_RULES, rulesFieldsHtml, readRules, rulesSummary } from '../../cartes/enchere-regles.js';
import { creerGive } from '../give-panier.js';
import { chargerBoosters, chargerRestants, libelleEpuisee } from '../visual-pick.js';
import { ensureLotCss, lotQuand, lotResume, lotDetail, lotTeaserHtml } from '../../cartes/enchere-lot.js';

const X = { el: null, list: null, err: '', edit: null, membres: null, errM: '', compo: null };
const STATUS = { prevue: 'Prévue', ouverte: 'Ouverte', close: 'Terminée', annulee: 'Annulée' };
/** Valeur d'un champ datetime-local (heure locale). */
const toLocal = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
/** « vendredi 6 novembre, 18 h » (heure locale, comme les champs de date). */
const jourHeure = (v) => {
  const d = new Date(v);
  const jour = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return `${jour}, ${d.getHours()} h${d.getMinutes() ? ` ${String(d.getMinutes()).padStart(2, '0')}` : ''}`;
};
/**
 * Prochain week-end d'enchère : vendredi 18 h → dimanche 18 h (heure locale du navigateur).
 * @param {Date} [now]
 * @returns {{start: Date, end: Date}}
 */
export function nextWeekend(now = new Date()) {
  const start = new Date(now);
  start.setHours(18, 0, 0, 0);
  start.setDate(start.getDate() + ((5 - start.getDay() + 7) % 7));
  if (start <= now) start.setDate(start.getDate() + 7);
  const end = new Date(start); end.setDate(end.getDate() + 2);
  return { start, end };
}

/* ---------- Composition d'une enchère en lot (page et fenêtre du plateau) ---------- */
/**
 * Monte dans host (placé dans un <form>) : le panier du give en mode lot, « Quand et à partir de combien », les autres
 * règles et l'aperçu pour les membres.
 * @param {HTMLElement} host
 * @param {object} o idp : préfixe des identifiants ; cards (avec set_name), sets, restants (chargerRestants), types
 *   (chargerBoosters), typesErreur ; encheres : liste de hg_auctions_admin (cartes uniques déjà réservées)
 * @returns {{give: object, lire: () => {erreur: string, p: object, phrase: string}, erreur: (m: string) => void}}
 */
export function creerEnchereLot(host, { idp, cards = [], sets = [], restants = new Map(), types = null, typesErreur = '', encheres = [] }) {
  ensureLotCss({ encart: true });
  const reservees = new Set();
  for (const a of encheres) {
    if (a.status !== 'prevue' && a.status !== 'ouverte') continue;
    if (a.card_id) reservees.add(a.card_id);
    for (const id of a.lot_uniques || []) reservees.add(id);
  }
  /** Carte unique déjà attribuée, ou déjà dans une enchère : grisée dans le catalogue. */
  const bloque = (k) => (k.rarity !== 'unique' ? '' : reservees.has(k.id) ? 'Déjà dans une enchère'
    : restants.has(k.id) && restants.get(k.id) <= 0 ? libelleEpuisee(k) : '');
  const { start, end } = nextWeekend();
  host.innerHTML = `<div id="${idp}-panier" class="enp-panier"></div>
    <fieldset class="enp-quand"><legend>Quand et à partir de combien</legend>
      <div class="acd-grid-2">
        <div class="field"><label for="${idp}-start">Début</label><input id="${idp}-start" name="starts_at" type="datetime-local" value="${toLocal(start)}" required></div>
        <div class="field"><label for="${idp}-end">Fin</label><input id="${idp}-end" name="ends_at" type="datetime-local" value="${toLocal(end)}" required></div>
        <div class="field"><label for="${idp}-mise">Mise de départ (${paillSym()})</label><input id="${idp}-mise" name="min_bid" type="number" inputmode="numeric" min="1" max="100000" value="${DEFAULT_RULES.min_bid}" aria-describedby="${idp}-mise-h">
          <p class="c2-auc-err enp-err" id="${idp}-mise-e" role="alert" hidden></p>
          <p class="small muted" id="${idp}-mise-h">Au-dessus des Paillettes du lot.</p></div>
      </div>
      <p class="small muted enp-defaut">Par défaut, du vendredi 18 h au dimanche 18 h. Une seule enchère du Staff à la fois : ses dates ne peuvent pas chevaucher celles d’une autre.</p>
    </fieldset>
    <details class="enp-regles"><summary>Autres règles : pas, plafond, prolongation</summary>${rulesFieldsHtml(`${idp}-new`, DEFAULT_RULES, { sansMise: true })}</details>
    <section class="enp-apercu" aria-labelledby="${idp}-ap-h" hidden><h4 id="${idp}-ap-h" class="enp-ap-t">Aperçu pour les membres</h4><div class="enp-ap-cadre" data-enp-apercu inert></div></section>
    <p class="form-error enp-form-err" role="alert" hidden></p>`;
  const $ = (s) => host.querySelector(s);
  const form = host.closest('form');
  let give = null;
  const mise = () => { const v = Number(String($(`#${idp}-mise`).value).trim()); return Number.isInteger(v) ? v : NaN; };
  const miseErreur = (p) => `La mise de départ doit dépasser les Paillettes du lot (${nf(p)} ${paillSym()}) : sinon le gagnant repart avec plus de Paillettes qu’il n’en a payé.`;

  /** Contrôle complet : lot, dates, mise. Rend l'erreur, les paramètres de hg_auction_create et la phrase de confirmation. */
  function lire() {
    const l = give.lire();
    const s = $(`#${idp}-start`).value, e = $(`#${idp}-end`).value, m = mise();
    const r = readRules(form);
    let erreur = l.erreur;
    if (!erreur && (!s || !e || new Date(e) <= new Date(s))) erreur = 'La fin doit être après le début.';
    if (!erreur && !(m >= 1 && m <= 100000)) erreur = 'Mise de départ : de 1 à 100 000.';
    if (!erreur && l.paillettes >= m) erreur = miseErreur(l.paillettes);
    const p = { ...r, min_bid: String(m), nom: l.nom, paillettes: l.paillettes, lignes: l.lignes, annonce: l.annonce,
      starts_at: s ? new Date(s).toISOString() : '', ends_at: e ? new Date(e).toISOString() : '' };
    const phrase = erreur ? '' : `« ${l.nom} » aux enchères du ${jourHeure(s)} au ${jourHeure(e)}. Mise de départ ${nf(m)} ${paillSym()}, puis ${nf(Number(r.step) || 0)} ${paillSym()} de plus au moins.`;
    return { erreur, p, phrase, apercu: l.apercu };
  }

  /** Mise sous les Paillettes du lot, valeur des boosters, aperçu : suivent chaque changement. */
  function maj() {
    if (!give) return;
    const l = give.lire();
    const m = mise();
    const trop = l.paillettes > 0 && Number.isInteger(m) && l.paillettes >= m;
    const err = $(`#${idp}-mise-e`), champ = $(`#${idp}-mise`);
    err.textContent = trop ? miseErreur(l.paillettes) : ''; err.hidden = !trop;
    champ.setAttribute('aria-describedby', `${idp}-mise-h${trop ? ` ${idp}-mise-e` : ''}`);
    if (trop) champ.setAttribute('aria-invalid', 'true'); else champ.removeAttribute('aria-invalid');
    const valeur = l.apercu.lignes.filter((x) => x.type === 'booster').reduce((s, x) => s + (Number(x.type_booster?.price) || 0) * x.qte, 0);
    $(`#${idp}-mise-h`).textContent = `Au-dessus des Paillettes du lot.${valeur && !trop ? ` Valeur des boosters en boutique : ${nf(valeur)} ${paillSym()}.` : ''}`;
    const r = lire();
    const ap = $('.enp-apercu');
    ap.hidden = !!r.erreur;
    if (!r.erreur) {
      const s = $(`#${idp}-start`).value;
      $('[data-enp-apercu]').innerHTML = lotTeaserHtml(r.apercu, { etatHtml: esc(`Ouverture ${lotQuand(new Date(s).toISOString())}`), top: 'aucune offre', bouton: 'Voir' });
    }
    if (!r.erreur) erreur('');
  }
  /** Erreur sous le formulaire (et dans le récapitulatif du lot). */
  function erreur(m) {
    const e = $('.enp-form-err');
    e.textContent = m || ''; e.hidden = !m;
  }

  give = creerGive($(`#${idp}-panier`), { membres: [], cards, sets, restants, types, typesErreur, idp, lot: true, bloque, onChange: maj });
  host.addEventListener('input', (e) => { if (e.target.closest('.enp-quand, .enp-regles')) maj(); });
  maj();
  return { give, lire, erreur };
}

/* ---------- Page ---------- */
/** Formulaire « Nouvelle enchère » : le cadre, puis la composition (creerEnchereLot) une fois les catalogues lus. */
function formHtml() {
  return `<form class="card stack enp-form" id="acd-auc-form" novalidate>
      <h3 class="card-title">Nouvelle enchère</h3>
      <p class="small muted">Le lot se compose comme un give : des Paillettes, des cartes à l’unité, une série ou un type entier, brillantes ou non, et des boosters. Il est créé et donné au gagnant à la fin. Les Paillettes de l’offre gagnante sont détruites.</p>
      <div data-au-compo><p class="small muted">Chargement…</p></div>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Planifier l’enchère</button></div>
    </form>`;
}

/** Enchère active qui précède a (pour « Ouvre après la fin de … »). */
const precedente = (a) => (X.list || []).filter((b) => b.id !== a.id && (b.status === 'prevue' || b.status === 'ouverte') && new Date(b.starts_at) < new Date(a.starts_at))
  .sort((x, y) => new Date(y.starts_at) - new Date(x.starts_at))[0];

function etatHtml(a) {
  if (a.status === 'close') {
    if (a.winner) return `Remportée par ${esc(a.winner)} pour ${nf(a.price)} ${paillSym()}`;
    return a.lot ? 'Sans offre : rien n’a été créé ni donné.' : 'Sans offre : carte en réserve';
  }
  if (a.top) return `Meilleure offre : ${nf(a.top)} ${paillSym()} (${esc(a.top_pseudo || 'membre')})`;
  const avant = a.status === 'prevue' ? precedente(a) : null;
  return avant ? `Ouvre après la fin de « ${esc(avant.card_name)} ».` : 'Pas encore d’offre';
}

function listHtml() {
  if (X.err) return `<p class="empty">${esc(X.err)}</p>`;
  if (!X.list) return '<p class="empty">Chargement…</p>';
  if (!X.list.length) return '<p class="empty">Aucune enchère pour le moment.</p>';
  return `<ul class="acd-list">${X.list.map((a) => {
    const actif = a.status === 'prevue' || a.status === 'ouverte';
    const detail = a.lot && actif ? lotDetail(a.lot) : '';
    return `<li class="acd-item">
      <div class="acd-item-main">
        <p><strong>${esc(a.card_name)}</strong> <span class="pill">${esc(STATUS[a.status] || a.status)}</span></p>
        ${a.lot ? `<p class="small enp-lot-ligne"><strong>Lot :</strong> ${esc(lotResume(a.lot))}${detail ? ` (${esc(detail)})` : ''}</p>` : ''}
        <p class="small muted">${esc(fmtWhen(a.starts_at))} → ${esc(fmtWhen(a.ends_at))} · mise ${nf(a.min_bid)} ${paillSym()}, pas ${nf(a.step)} ${paillSym()} · ${nf(a.bids)} offre${a.bids > 1 ? 's' : ''}</p>
        <p class="small">${etatHtml(a)}</p>
      </div>
      ${actif ? `<div class="btn-row">
        <button class="btn btn-ghost btn-sm" type="button" data-au="edit" data-id="${esc(a.id)}" aria-expanded="${X.edit === a.id}">${X.edit === a.id ? 'Fermer' : 'Modifier les règles'}</button>
        <button class="btn btn-danger btn-sm" type="button" data-au="cancel" data-id="${esc(a.id)}">Annuler</button></div>` : ''}
      ${X.edit === a.id ? editHtml(a) : a.rules ? `<ul class="small muted enr-sum">${rulesSummary(a.rules).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

/** Formulaire de modification d'une enchère prévue ou ouverte (dates et règles). */
function editHtml(a) {
  const id = `au-e-${a.id.slice(0, 8)}`;
  return `<form class="card stack enr-edit" data-au-form="edit" data-id="${esc(a.id)}" novalidate>
      <div class="acd-grid-2">
        <div class="field"><label for="${id}-start">Début</label><input id="${id}-start" name="starts_at" type="datetime-local" value="${toLocal(a.starts_at)}"${a.started ? ' readonly aria-describedby="' + id + '-sh"' : ''}>
          ${a.started ? `<p class="small muted" id="${id}-sh">Déjà ouverte : le début ne change plus.</p>` : ''}</div>
        <div class="field"><label for="${id}-end">Fin</label><input id="${id}-end" name="ends_at" type="datetime-local" value="${toLocal(a.ends_at)}"></div>
      </div>
      ${rulesFieldsHtml(id, a.rules || {}, { lockMin: a.bids > 0 })}
      <div class="btn-row"><button class="btn btn-primary" type="submit">Enregistrer les règles</button></div>
    </form>`;
}

/* Enchères entre membres (idée 33, migration 212) : 50 dernières, avec toutes les offres (qui a enchéri sur qui). Lecture seule. */
const STATUT_MEMBRE = { ouverte: 'Ouverte', vendue: 'Vendue', sans_offre: 'Sans offre', retiree: 'Retirée', annulee: 'Annulée' };
function membresHtml() {
  if (X.errM) return `<p class="empty">${esc(X.errM)}</p>`;
  if (!X.membres) return '<p class="empty">Chargement…</p>';
  if (!X.membres.length) return '<p class="empty">Aucune enchère entre membres pour le moment.</p>';
  return `<ul class="acd-list">${X.membres.map((a) => `<li class="acd-item">
      <div class="acd-item-main">
        <p><strong>${esc(a.card_name)}</strong> <span class="pill">${esc(STATUT_MEMBRE[a.status] || a.status)}</span></p>
        <p class="small muted">Vendue par ${esc(a.seller || 'membre')} · ${esc(fmtWhen(a.created_at))} · fin ${esc(fmtWhen(a.ends_at))} · mise ${nf(a.min_bid)} ${paillSym()}</p>
        ${a.status === 'vendue' ? `<p class="small">Remportée par ${esc(a.winner || 'membre')} pour ${nf(a.price)} ${paillSym()} (${nf(a.fee)} ${paillSym()} de frais détruits)</p>` : ''}
        ${(a.bids || []).length ? `<details><summary class="small">${nf(a.bids.length)} offre${a.bids.length > 1 ? 's' : ''}</summary>
          <ul class="small muted">${a.bids.map((b) => `<li>${esc(b.pseudo || 'membre')} → ${esc(a.seller || 'membre')} : ${nf(b.amount)} ${paillSym()} · ${esc(fmtWhen(b.created_at))}${b.refunded ? ' (dépassée, remboursée)' : ''}</li>`).join('')}</ul></details>`
          : '<p class="small muted">Aucune offre</p>'}
      </div></li>`).join('')}</ul>`;
}

/** Dessine les listes (le formulaire, monté une fois, garde le lot en cours de composition). */
function render() {
  if (!X.el) return;
  const l = X.el.querySelector('[data-au-liste]'), m = X.el.querySelector('[data-au-membres]');
  if (l) l.innerHTML = listHtml();
  if (m) m.innerHTML = membresHtml();
}

async function load() {
  const [s, m] = await Promise.allSettled([sb.rpc('hg_auctions_admin'), sb.rpc('hg_encheres_admin')]);
  try { if (s.status === 'rejected') throw s.reason; X.list = check(s.value) || []; X.err = ''; }
  catch (e) { X.err = `Enchères indisponibles : ${errMsg(e)}`; X.list = []; }
  try { if (m.status === 'rejected') throw m.reason; X.membres = check(m.value) || []; X.errM = ''; }
  catch (e) { X.errM = `Enchères des membres indisponibles : ${errMsg(e)}`; X.membres = []; }
  render();
}

/** (Re)monte la composition d'une nouvelle enchère : catalogue, exemplaires restants, boosters. */
async function monterForm() {
  const f = X.el?.querySelector('#acd-auc-form');
  if (!f) return;
  f.outerHTML = formHtml();
  const host = X.el.querySelector('[data-au-compo]');
  const cards = C.cards.filter((k) => k.active);
  const setsById = new Map(C.sets.map((s) => [s.id, s]));
  cards.forEach((k) => { k.set_name = setsById.get(k.set_id)?.name; });
  const [r, b] = await Promise.allSettled([chargerRestants(cards), chargerBoosters()]);
  if (!host.isConnected) return;
  X.compo = creerEnchereLot(host, {
    idp: 'au', cards, sets: C.sets, restants: r.status === 'fulfilled' ? r.value.restants : new Map(),
    types: b.status === 'fulfilled' ? b.value : null, typesErreur: b.status === 'rejected' ? errMsg(b.reason) : '', encheres: X.list || [],
  });
}

/** Planifie l'enchère : contrôle, confirmation (fenêtre du give), envoi. */
async function planifier() {
  const c = X.compo;
  if (!c) return;
  const r = c.lire();
  if (r.erreur) { c.erreur(r.erreur); c.give.signaler(r.erreur); return; }
  c.erreur('');
  const res = await c.give.confirmerLot({ phrase: r.phrase, envoi: () => sb.rpc('hg_auction_create', { p: r.p }) });
  if (!res) return;
  toast('Enchère planifiée', 'ok');
  await load();
  await monterForm();
}

/**
 * Monte l'onglet « Enchères » dans el.
 * @param {HTMLElement} el conteneur
 */
export function mountAuctionsTab(el) {
  if (!el) return;
  X.el = el;
  X.compo = null;
  el.innerHTML = `<div class="stack">${formHtml()}<section class="stack"><h3>Enchères</h3><div data-au-liste></div></section>
    <section class="stack"><h3>Enchères des membres</h3><p class="small muted">Chaque membre peut vendre ses cartes. Liste des offres : qui a enchéri sur la carte de qui.</p><div data-au-membres></div></section></div>`;
  render();
  el.addEventListener('submit', async (e) => {
    if (e.target.dataset.auForm === 'edit') {
      e.preventDefault();
      const f = new FormData(e.target);
      const p = { ...readRules(e.target), starts_at: new Date(f.get('starts_at')).toISOString(), ends_at: new Date(f.get('ends_at')).toISOString() };
      await act(e.submitter, async () => { check(await sb.rpc('hg_auction_update', { p_id: e.target.dataset.id, p })); toast('Règles enregistrées', 'ok'); X.edit = null; await load(); });
      return;
    }
    if (e.target.id !== 'acd-auc-form') return;
    e.preventDefault();
    const btn = e.submitter;
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try { await planifier(); } catch (ex) { X.compo?.erreur(errMsg(ex)); }
    if (btn?.isConnected) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
  });
  el.addEventListener('click', async (e) => {
    const ed = e.target.closest('[data-au="edit"]');
    if (ed) { X.edit = X.edit === ed.dataset.id ? null : ed.dataset.id; render(); X.el.querySelector(`[data-au="edit"][data-id="${ed.dataset.id}"]`)?.focus(); return; }
    const b = e.target.closest('[data-au="cancel"]');
    if (!b) return;
    const a = (X.list || []).find((x) => x.id === b.dataset.id);
    const suite = a?.lot ? 'La meilleure offre est remboursée. Rien n’est créé ni donné.' : 'La meilleure offre est remboursée. La carte reste en réserve.';
    if (!(await confirmBox('Annuler cette enchère ?', suite, { ok: 'Annuler l’enchère', danger: true }))) return;
    await act(b, async () => { check(await sb.rpc('hg_auction_cancel', { p_id: b.dataset.id })); toast('Enchère annulée', 'ok'); await load(); });
  });
  load().then(monterForm);
}
