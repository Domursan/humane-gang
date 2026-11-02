// ===== Cartes : enchère hebdomadaire d'une carte unique (idée C11, migration 081) =====
// Encart en tête de la Boutique (carte, meilleure offre, temps restant) qui s'ouvre sur la vue détaillée : carte en grand,
// compte à rebours, meilleure offre, champ d'offre (minimum et plafond affichés) et 10 dernières offres.
// Enchérir bloque les Paillettes tout de suite ; l'ancien meilleur enchérisseur est remboursé aussitôt (serveur).
// Mise à jour : relecture toutes les 20 s quand la Boutique est affichée, compte à rebours chaque seconde.
// Règles propres à chaque enchère (migration 097) affichées aux membres ; le Staff « cartes » les règle ici même
// (« Régler cette enchère », formulaire partagé enchere-regles.js).
// Lot en panier (migration 215) : l'encart et la vue montrent le lot (enchere-lot.js) ; à la fin, le gagnant voit ce
// qu'il a reçu (auction.remise). Le Staff qui a créé l'enchère ne peut pas enchérir dessus (me.createur).
// RPC : hg_auction_current (clôt aussi les enchères échues), hg_auction_bid, hg_auction_update.
// Exporte : initEnchere(ctx), drawEnchere(). ctx = { app, visible: () => boolean, refresh: async () => {} }.
import { sb, esc, toast, errMsg, avatarHtml } from '../../commun/core.js';
import { cardHtml, fmtP } from './cartes-ui.js';
import { rulesFieldsHtml, readRules, rulesSummary } from './enchere-regles.js';
import { ensureLotCss, lotTeaserHtml, lotItemsHtml } from './enchere-lot.js';

let C = null;
const E = { data: null, detail: false, busy: false, err: '', amount: '', timer: null, tick: null, edit: false };
const nf = new Intl.NumberFormat('fr-CH');
const TZ = 'Europe/Zurich';

/** Temps restant lisible : « 2 j 03 h », « 03 h 12 min », « 4 min 05 s ». */
export function remaining(ms) {
  if (ms <= 0) return 'terminée';
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (d) return `${d} j ${p(h)} h`;
  if (h) return `${p(h)} h ${p(m)} min`;
  return `${m} min ${p(sec)} s`;
}
/** « dimanche 18 h » / « dimanche 18 h 07 ». */
function when(iso) {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-CH', { weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${parts.weekday} ${Number(parts.hour)} h${parts.minute !== '00' ? ' ' + parts.minute : ''}`;
}
/** « il y a 4 min », « il y a 1 h », sinon la date courte. */
function ago(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ }).format(new Date(iso));
}
const a = () => E.data?.auction || null;
const open = () => a()?.status === 'ouverte';

/** Encart de la Boutique (vue repliée). */
function teaserHtml(x) {
  const top = x.top ? `${fmtP(x.top.amount)} · ${esc(x.top.pseudo || 'membre')}` : 'aucune offre';
  const state = x.status === 'ouverte' ? `Fin dans <strong data-c2-left>${esc(remaining(new Date(x.ends_at) - Date.now()))}</strong>`
    : x.status === 'prevue' ? `Ouverture ${esc(when(x.starts_at))}`
    : x.winner ? `Remportée par ${esc(x.winner)} pour ${esc(fmtP(x.price))}` : 'Terminée sans offre';
  if (x.lot) {
    const topTxt = x.status === 'close' ? '' : x.top ? `${fmtP(x.top.amount)} · ${x.top.pseudo || 'membre'}` : 'aucune offre';
    return lotTeaserHtml(x.lot, { etatHtml: state, top: topTxt, bouton: x.status === 'ouverte' ? 'Voir l’enchère' : 'Voir' });
  }
  return `<section class="card c2-auc-teaser" aria-labelledby="c2-auc-t">
      <div class="c2-auc-mini">${cardHtml(x.card || {}, { size: 'sm' })}</div>
      <div class="c2-auc-tinfo">
        <p class="eyebrow">Enchère de la semaine</p>
        <h2 id="c2-auc-t" class="c2-auc-tname">${esc(x.card?.name || 'Carte unique')}</h2>
        <p class="small">${state}</p>
        ${x.status !== 'close' ? `<p class="small muted">Meilleure offre : ${top}</p>` : ''}
        <button type="button" class="btn btn-sand" data-c2="auc-open">${x.status === 'ouverte' ? 'Voir l’enchère' : 'Voir'}</button>
      </div>
    </section>`;
}

/** Vue détaillée. */
function detailHtml(x) {
  const me = E.data.me || {};
  const left = new Date(x.ends_at) - Date.now();
  const top = x.top;
  const lead = top?.mine;
  const cap = Number(me.cap) || 0;
  const min = Number(x.next_min) || 0;
  const rules = E.data.rules || null;
  const noBidsLeft = me.bids_left === 0;
  const blockMsg = !open() ? '' : me.createur ? 'Tu as créé cette enchère : tu ne peux pas enchérir dessus.'
    : me.last_winner ? 'Tu as gagné la dernière enchère : laisse sa chance aux autres cette fois.'
    : lead ? 'Tu as la meilleure offre. Tes Paillettes te seront rendues si quelqu’un fait mieux.'
    : noBidsLeft ? 'Tu as utilisé toutes tes offres pour cette enchère.'
    : cap < min ? `Ton maximum (${fmtP(cap)}) est sous l’offre minimale.` : '';
  const canBid = open() && !me.createur && !me.last_winner && !lead && !noBidsLeft && cap >= min && !E.busy;
  const form = open() ? `<form class="card c2-auc-form" data-c2-form="bid" novalidate>
        <label for="c2-auc-amount" class="c2-auc-lab">Ton offre · minimum ${esc(fmtP(min))}</label>
        <div class="c2-auc-row">
          <input id="c2-auc-amount" type="number" inputmode="numeric" min="${min}" max="${Math.max(min, cap)}" step="1" value="${esc(E.amount || String(min))}"
            aria-describedby="c2-auc-help${E.err ? ' c2-auc-err' : ''}" ${canBid ? '' : 'disabled'}>
          <button type="submit" class="btn btn-sand" ${canBid ? '' : 'disabled'}>${E.busy ? 'Envoi…' : 'Enchérir'}</button>
        </div>
        ${E.err ? `<p class="c2-auc-err" id="c2-auc-err" role="alert">${esc(E.err)}</p>` : ''}
        ${blockMsg ? `<p class="small c2-auc-note" role="status">${esc(blockMsg)}</p>` : ''}
        <p class="small muted" id="c2-auc-help">Tes Paillettes sont bloquées tout de suite et rendues si quelqu’un fait mieux. Ton maximum : ${esc(fmtP(cap))}${me.bids_left != null ? ` · offres restantes : ${esc(String(me.bids_left))}` : ''}.</p>
      </form>` : x.lot ? finLotHtml(x) : `<p class="card c2-auc-done">${x.status === 'prevue' ? `L’enchère ouvre ${esc(when(x.starts_at))}.`
        : x.winner ? `${x.won ? 'Tu as remporté' : `${esc(x.winner)} a remporté`} « ${esc(x.card?.name || '')} » pour ${esc(fmtP(x.price))}.` : 'Enchère terminée sans offre : la carte reste en réserve.'}</p>`;
  const bids = (E.data.bids || []).map((b) => `<li class="c2-auc-bid">${avatarHtml(b, 24)}<span class="c2-auc-who">${esc(b.pseudo || 'membre')}${b.mine ? ' <span class="muted small">(toi)</span>' : ''}</span>
      <strong>${esc(fmtP(b.amount))}</strong><span class="muted small">${esc(ago(b.created_at))}</span></li>`).join('');
  const regles = rules ? [...rulesSummary(rules), ...(x.lot ? ['À la fin, le lot est créé et donné au gagnant : cartes dans sa collection, boosters dans son stock, Paillettes sur son solde. Les Paillettes de l’offre gagnante sont détruites.'] : [])] : [];
  return `<section class="c2-auc${x.lot ? ' enp-auc' : ''}" aria-labelledby="c2-auc-h">
      <button type="button" class="c2-back" data-c2="auc-close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>Boutique</button>
      <div class="c2-auc-title"><div><p class="eyebrow">Enchère de la semaine</p><h2 id="c2-auc-h" class="c2-auc-name">${esc(x.lot ? x.lot.nom : x.card?.name || '')}</h2></div><span class="pill pill-sand">${x.lot ? 'Lot' : 'Unique'}</span></div>
      ${x.lot ? `${lotItemsHtml(x.lot)}${boitesLotHtml(x, left)}` : `<div class="c2-auc-top">
        <div class="c2-auc-card">${cardHtml(x.card || {}, { size: 'md', serial: x.status === 'close' && x.winner ? 1 : null })}</div>
        <div class="c2-auc-boxes">
          <div class="card c2-auc-box"><p class="small muted">${open() ? 'Fin dans' : x.status === 'prevue' ? 'Ouverture' : 'Terminée'}</p>
            <p class="c2-auc-big" data-c2-left aria-live="off">${open() ? esc(remaining(left)) : esc(when(x.status === 'prevue' ? x.starts_at : x.ends_at))}</p>
            ${open() ? `<p class="small muted">${esc(when(x.ends_at))}</p>` : ''}</div>
          <div class="card c2-auc-box"><p class="small muted">Meilleure offre</p>
            <p class="c2-auc-big c2-auc-price" aria-live="polite">${top ? esc(fmtP(top.amount)) : '—'}</p>
            ${top ? `<p class="c2-auc-who">${avatarHtml(top, 22)}<span>${esc(top.pseudo || 'membre')}${top.mine ? ' (toi)' : ''}</span></p>` : `<p class="small muted">Mise de départ : ${esc(fmtP(x.min_bid))}</p>`}</div>
        </div>
      </div>`}
      ${form}
      ${rules ? `<details class="card c2-auc-rulesbox"${E.data.can_admin ? ' open' : ''}><summary>Règles de cette enchère</summary>
        <ul class="small c2-auc-rules">${regles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
      ${E.data.can_admin && (x.status === 'ouverte' || x.status === 'prevue') ? adminHtml(x, rules) : ''}
      <h3 class="c2-auc-sub">Dernières offres</h3>
      ${bids ? `<ul class="c2-auc-bids">${bids}</ul>` : '<p class="muted small">Aucune offre pour l’instant.</p>'}
    </section>`;
}

/** Nombre suivi du mot au singulier ou au pluriel. */
const plur = (n, one, many) => `${nf.format(n)} ${n > 1 ? many : one}`;

/** Lot : les deux cases (fin ou ouverture, meilleure offre ou prix final), sous le contenu du lot. */
function boitesLotHtml(x, left) {
  const top = x.top, fini = x.status === 'close';
  // Prolongation : fin actuelle moins la fin prévue (fin au plus tard moins la prolongation totale permise).
  const cap = Number(E.data.rules?.extend_cap_min) || 0;
  const prolo = fini && x.hard_end_at ? Math.round((new Date(x.ends_at) - (new Date(x.hard_end_at) - cap * 60000)) / 60000) : 0;
  const b1 = open() ? `<p class="small muted">Fin dans</p><p class="c2-auc-big" data-c2-left aria-live="off">${esc(remaining(left))}</p><p class="small muted">${esc(when(x.ends_at))}</p>`
    : x.status === 'prevue' ? `<p class="small muted">Ouverture</p><p class="c2-auc-big">${esc(when(x.starts_at))}</p>`
    : `<p class="small muted">Terminée</p><p class="c2-auc-big">${esc(when(x.ends_at))}</p>${prolo > 0 ? `<p class="small muted">Prolongée de ${esc(String(prolo))} min</p>` : ''}`;
  const b2 = top ? `<p class="small muted">${fini ? 'Prix final' : 'Meilleure offre'}</p><p class="c2-auc-big c2-auc-price" aria-live="polite">${esc(fmtP(top.amount))}</p>
      <p class="c2-auc-who">${avatarHtml(top, 22)}<span>${esc(top.pseudo || 'membre')}${top.mine ? ' (toi)' : ''}</span></p>`
    : `<p class="small muted">Meilleure offre</p><p class="c2-auc-big c2-auc-price" aria-live="polite">—</p><p class="small muted">Mise de départ : ${esc(fmtP(x.min_bid))}</p>`;
  return `<div class="c2-auc-boxes enp-boxes"><div class="card c2-auc-box">${b1}</div><div class="card c2-auc-box">${b2}</div></div>`;
}

/** Lot : ce que voit le membre quand l'enchère n'est pas ouverte (prévue, gagnée, remportée par un autre, sans offre). */
function finLotHtml(x) {
  const nom = x.lot.nom || '';
  if (x.status === 'prevue') return `<p class="card c2-auc-done">L’enchère ouvre ${esc(when(x.starts_at))}.</p>`;
  if (!x.winner) return '<p class="card c2-auc-done en-done" role="status">Enchère terminée sans offre : le lot n’est pas distribué. Rien n’a été créé, ni Paillettes, ni cartes, ni boosters. Le Staff pourra le remettre en vente.</p>';
  if (!x.won) return `<p class="card c2-auc-done">${esc(x.winner)} a remporté « ${esc(nom)} » pour ${esc(fmtP(x.price))}.</p>`;
  const r = x.remise || {};
  const lignes = x.lot.lignes || [];
  const li = [];
  if (Number(r.paillettes) > 0) li.push(`<li><strong>${esc(plur(Number(r.paillettes), 'Paillette', 'Paillettes'))}</strong> ajoutées à ton solde</li>`);
  if (Number(r.cartes) > 0) {
    const vedette = lignes.find((l) => l.type === 'carte')?.titre;
    const nouv = Number(r.nouvelles) || 0;
    const dont = [vedette, nouv ? `${nf.format(nouv)} que tu n’avais pas` : ''].filter(Boolean).join(' et ');
    li.push(`<li><strong>${esc(plur(Number(r.cartes), 'carte', 'cartes'))}</strong> dans ta collection${dont ? `, dont ${esc(dont)}` : ''}</li>`);
  }
  if (Number(r.boosters) > 0) {
    const detail = lignes.filter((l) => l.type === 'booster').map((l) => `${nf.format(Number(l.qte) || 1)} ${l.type_booster?.name || l.titre}`).join(', ');
    li.push(`<li><strong>${esc(plur(Number(r.boosters), 'booster', 'boosters'))}</strong>${detail ? ` (${esc(detail)})` : ''} à ouvrir quand tu veux</li>`);
  }
  for (const s of r.series || []) li.push(`<li>La série « ${esc(s)} » est complète : tu reçois aussi son <strong>bonus de série</strong></li>`);
  return `<div class="card c2-auc-done en-done is-gagne enp-gagne" role="status"><p><strong>Tu as remporté « ${esc(nom)} » pour ${esc(fmtP(x.price))}.</strong> Tout est déjà chez toi :</p>
      <ul class="enp-recu">${li.join('')}</ul></div>
      <div class="btn-row">${Number(r.boosters) > 0 ? '<a class="btn btn-sand" href="#ouverture">Ouvrir mes boosters</a>' : ''}<a class="btn btn-ghost" href="#collection">Voir dans Mes cartes</a></div>`;
}

/** Staff « cartes » : réglage des règles de cette enchère, directement sur la page. */
function adminHtml(x, rules) {
  if (!E.edit) return `<div class="btn-row"><button type="button" class="btn btn-ghost" data-c2="auc-edit" aria-expanded="false">Régler cette enchère</button></div>`;
  return `<form class="card c2-auc-admin" data-c2-form="rules" novalidate>
      <h3 class="c2-auc-sub">Régler cette enchère <span class="small muted">(visible par le Staff seulement)</span></h3>
      ${rulesFieldsHtml('c2-auc-r', rules || {}, { lockMin: !!x.top })}
      <div class="btn-row"><button type="submit" class="btn btn-sand" ${E.busy ? 'disabled' : ''}>Enregistrer</button>
        <button type="button" class="btn btn-ghost" data-c2="auc-edit" aria-expanded="true">Fermer</button></div>
    </form>`;
}

/** Enregistre les règles (Staff). La fin et le début ne changent pas d'ici (onglet Enchères de l'admin). */
async function saveRules(form) {
  const x = a();
  if (!x || E.busy) return;
  E.busy = true;
  try {
    const { error } = await sb.rpc('hg_auction_update', { p_id: x.id, p: { ...readRules(form), starts_at: x.starts_at, ends_at: x.ends_at } });
    if (error) throw error;
    toast('Règles de l’enchère enregistrées', 'ok');
    E.edit = false;
  } catch (e) { toast(errMsg(e), 'error'); }
  E.busy = false;
  await loadEnchere();
}

/** Dessine l'encart ou la vue détaillée dans #cartes-enchere (posé par la Boutique). */
export function drawEnchere() {
  const el = document.getElementById('cartes-enchere');
  if (!el || !C) return;
  const x = a();
  if (!x) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  if (x.lot) ensureLotCss();
  el.innerHTML = E.detail ? detailHtml(x) : teaserHtml(x);
  const shop = el.parentElement?.querySelector('.shop');
  if (shop) shop.hidden = E.detail;
}

/** Relit l'enchère (sans erreur visible si la fonction n'existe pas encore). */
export async function loadEnchere() {
  try {
    const { data, error } = await sb.rpc('hg_auction_current');
    if (error) throw error;
    E.data = data || null;
  } catch (e) {
    console.warn('[enchère]', e?.message || e);
    E.data = null;
  }
  const keep = document.activeElement?.id;
  drawEnchere();
  if (keep) document.getElementById(keep)?.focus({ preventScroll: true });
}

/** Envoie une offre. */
async function bid(amount) {
  const x = a();
  if (!x || E.busy) return;
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < Number(x.next_min)) { E.err = `L’offre minimale est de ${fmtP(x.next_min)}.`; drawEnchere(); document.getElementById('c2-auc-amount')?.focus(); return; }
  if (n > Number(E.data.me?.cap || 0)) { E.err = `Ton maximum pour cette enchère : ${fmtP(E.data.me?.cap || 0)}.`; drawEnchere(); document.getElementById('c2-auc-amount')?.focus(); return; }
  E.busy = true; E.err = ''; drawEnchere();
  try {
    const { error } = await sb.rpc('hg_auction_bid', { p_auction: x.id, p_amount: n });
    if (error) throw error;
    toast(`Offre de ${fmtP(n)} enregistrée`, 'ok');
    E.amount = '';
    await C.refresh();
  } catch (e) {
    E.err = errMsg(e);
  }
  E.busy = false;
  await loadEnchere();
  document.getElementById(E.err ? 'c2-auc-amount' : 'c2-auc-h')?.focus?.();
}

/** Met à jour les comptes à rebours affichés (sans redessiner). */
function tick() {
  const x = a();
  if (!x || x.status !== 'ouverte') return;
  const left = new Date(x.ends_at) - Date.now();
  document.querySelectorAll('#cartes-enchere [data-c2-left]').forEach((n) => { n.textContent = remaining(left); });
  if (left <= 0 && !E.busy) { E.data.auction.status = 'close'; loadEnchere(); }
}

/**
 * Branche les écouteurs, charge l'enchère et lance les mises à jour. Une seule fois.
 * @param {{app: HTMLElement, visible: () => boolean, refresh: () => Promise<void>}} ctx
 */
export function initEnchere(ctx) {
  if (C) return;
  C = ctx;
  ctx.app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c2^="auc-"]');
    if (!b || b.disabled) return;
    if (b.dataset.c2 === 'auc-open') { E.detail = true; drawEnchere(); document.getElementById('c2-auc-h')?.setAttribute('tabindex', '-1'); document.getElementById('c2-auc-h')?.focus(); }
    if (b.dataset.c2 === 'auc-edit') { E.edit = !E.edit; drawEnchere(); document.querySelector(E.edit ? '#c2-auc-r-min_bid' : '[data-c2="auc-edit"]')?.focus(); return; }
    if (b.dataset.c2 === 'auc-close') { E.detail = false; E.err = ''; drawEnchere(); document.querySelector('[data-c2="auc-open"]')?.focus(); }
  });
  ctx.app.addEventListener('submit', (e) => {
    if (e.target.matches?.('[data-c2-form="rules"]')) { e.preventDefault(); saveRules(e.target); return; }
    if (!e.target.matches?.('[data-c2-form="bid"]')) return;
    e.preventDefault();
    bid(e.target.querySelector('#c2-auc-amount')?.value);
  });
  ctx.app.addEventListener('input', (e) => { if (e.target.id === 'c2-auc-amount') { E.amount = e.target.value; } });
  loadEnchere();
  demarrer();
  // Page quittée : plus de minuterie ; retour depuis le cache de navigation : on les relance.
  window.addEventListener('pagehide', arreter);
  window.addEventListener('pageshow', (e) => { if (e.persisted && C) demarrer(); });
}

/** Lance le compte à rebours (1 s) et la relecture (20 s) ; ils s'arrêtent seuls si l'écran disparaît. */
function demarrer() {
  arreter();
  E.tick = setInterval(() => { if (!C?.app.isConnected) { arreter(); return; } if (!document.hidden && C.visible()) tick(); }, 1000);
  E.timer = setInterval(() => {
    if (!C?.app.isConnected) { arreter(); return; }
    if (!document.hidden && C.visible() && !E.busy && document.activeElement?.id !== 'c2-auc-amount' && !E.edit) loadEnchere();
  }, 20000);
}

/** Arrête les deux minuteries (écran disparu ou page quittée). */
function arreter() {
  clearInterval(E.tick); clearInterval(E.timer); E.tick = null; E.timer = null;
}
