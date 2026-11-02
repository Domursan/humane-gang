// ===== Cartes : enchères entre membres (idée 33, migration 212) =====
// Onglet « Enchères » des Échanges (monté par cartes-trades.js) : la liste des cartes en vente, la page d'une enchère et
// « Mes enchères » (historique des 30 derniers jours). Mise en vente depuis la fiche d'une carte de « Mes cartes » (openVente).
// Moteur de l'enchère de la semaine (C11, cartes-enchere.js) : l'offre est débitée tout de suite et rendue si quelqu'un fait
// mieux ; une offre dans les 30 dernières secondes prolonge de 30 s (10 minutes de plus au plus) ; 10 % du prix sont détruits.
// Mises à jour : la liste et l'enchère se relisent toutes les 20 s quand elles sont affichées ; le compte à rebours suit
// l'heure du serveur (clé now) ; la page d'une enchère écoute son canal temps réel seulement pendant ses 10 dernières minutes.
// RPC : hg_encheres_liste, hg_enchere_vue, hg_enchere_offre, hg_enchere_vendre, hg_enchere_retirer, hg_encheres_historique.
// Exporte : mountEncheres(el, ctx), openVente(opts), mesVentes(), restant(ms), restantCourt(ms).
//   ctx = { id?: enchère à ouvrir, onCount?: (n) => void, refresh?: async () => {} }.
import { sb, esc, toast, errMsg, avatarHtml } from '../../commun/core.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { paillSym } from '../../commun/paillettes.js';
import { cardHtml, rarityLabel, fmtP } from './cartes-ui.js';
import { lotResume } from './enchere-lot.js';

const TZ = 'Europe/Zurich';
const DUREES = [[5, '5 min'], [10, '10 min'], [60, '1 h'], [1440, '24 h']];
const RELIRE_MS = 20000;
const CANAL_MS = 10 * 60000; // temps réel : seulement pendant les 10 dernières minutes
const FILTRES = [['toutes', 'Toutes'], ['gagnees', 'Gagnées'], ['vendues', 'Vendues'], ['perdues', 'Perdues']];
const ICON_HORLOGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/></svg>';
const ICON_RETOUR = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

// État gardé d'une ouverture de l'onglet à l'autre (vue, filtre). Les minuteurs s'arrêtent quand le panneau disparaît.
const Q = { vue: 'liste', id: null, liste: null, enchere: null, hist: null, filtre: 'toutes', err: '', busy: false, montant: '', decalage: 0,
  box: null, ctx: null, tick: null, relire: null, canal: null, canalId: null };

/** Heure du serveur estimée (ms), d'après la clé now de la dernière lecture. */
const maintenant = () => Date.now() + Q.decalage;
const recaler = (data) => { const t = Date.parse(data?.now); if (Number.isFinite(t)) Q.decalage = t - Date.now(); };

/** Temps restant de la liste : « 0:42 », « 6 min 10 s », « 18 h 05 min ». */
export function restant(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (h) return `${h} h ${p(m)} min`;
  if (m) return `${m} min ${p(sec)} s`;
  return `0:${p(sec)}`;
}
/** Compte à rebours de la page d'une enchère : « 0:42 », « 6:10 », « 18 h 05 ». */
export function restantCourt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h} h ${p(m)}` : `${m}:${p(sec)}`;
}
/** « il y a 12 s », « il y a 4 min », sinon l'heure. */
function ago(iso) {
  const s = Math.max(0, (maintenant() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'à l’instant';
  if (s < 60) return `il y a ${Math.floor(s)} s`;
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  return quand(iso);
}
/** « aujourd’hui 21 h 14 », « hier 9 h 05 », « 29 oct. 18 h 00 ». */
function quand(iso, avecHeure = true) {
  const d = new Date(iso);
  const jour = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(x);
  const p = Object.fromEntries(new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).formatToParts(d).map((x) => [x.type, x.value]));
  const heure = `${Number(p.hour)} h ${p.minute}`;
  const auj = new Date(maintenant()), hier = new Date(maintenant() - 86400000);
  const j = jour(d) === jour(auj) ? 'aujourd’hui' : jour(d) === jour(hier) ? 'hier' : new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: TZ }).format(d);
  return avecHeure ? `${j} ${heure}` : j;
}
const dureeLabel = (min) => (DUREES.find(([m]) => m === Number(min)) || [0, `${min} min`])[1];
const finDe = (x) => new Date(x.ends_at).getTime() - maintenant();

/* ---------- Données ---------- */
/** Nombre d'enchères ouvertes (compteur de l'onglet), sans erreur visible. */
export async function compter() {
  try {
    const { data, error } = await sb.rpc('hg_encheres_liste');
    if (error) throw error;
    recaler(data);
    Q.liste = data || null;
    return (data?.encheres || []).length;
  } catch { return null; }
}
/** Mes ventes en cours : Map(exemplaire -> enchère), pour la fiche d'une carte. Vide si la lecture échoue. */
export async function mesVentes() {
  try {
    const { data, error } = await sb.rpc('hg_encheres_liste');
    if (error) throw error;
    return new Map((data?.me?.ventes || []).map((v) => [String(v.copy_id), v.id]));
  } catch { return new Map(); }
}
async function chargerListe() {
  try {
    const { data, error } = await sb.rpc('hg_encheres_liste');
    if (error) throw error;
    recaler(data); Q.liste = data || {}; Q.err = '';
  } catch (e) { Q.err = `Impossible de charger les enchères : ${errMsg(e)}`; }
  Q.ctx?.onCount?.((Q.liste?.encheres || []).length);
}
async function chargerEnchere() {
  try {
    const { data, error } = await sb.rpc('hg_enchere_vue', { p_id: Q.id });
    if (error) throw error;
    recaler(data); Q.enchere = data || null; Q.err = '';
  } catch (e) { Q.err = `Impossible de charger cette enchère : ${errMsg(e)}`; Q.enchere = null; }
}
async function chargerHistorique() {
  try {
    const { data, error } = await sb.rpc('hg_encheres_historique');
    if (error) throw error;
    Q.hist = Array.isArray(data) ? data : []; Q.err = '';
  } catch (e) { Q.err = `Impossible de charger tes enchères : ${errMsg(e)}`; Q.hist = []; }
}

/* ---------- Rendu ---------- */
/** Liste des enchères ouvertes, avec l'encart de l'enchère de la semaine. */
function listeHtml() {
  const L = Q.liste || {};
  const sem = L.semaine ? `<a class="card en-semaine" href="#boutique"><span class="eyebrow">Enchère de la semaine</span>
      <span class="en-semaine-txt">${esc(L.semaine.name || '')}${L.semaine.lot ? ` : ${esc(lotResume(L.semaine.lot))}` : ''} · fin ${esc(quand(L.semaine.ends_at))}${L.semaine.top ? ` · meilleure offre ${esc(fmtP(L.semaine.top))}` : ''}</span>
      <span class="en-semaine-lien">Voir dans la Boutique</span></a>` : '';
  const items = L.encheres || [];
  const liste = Q.err ? `<p class="empty">${esc(Q.err)}</p>` : !items.length
    ? '<p class="empty">Aucune carte aux enchères en ce moment. Mets une de tes cartes en vente depuis « Mes cartes ».</p>'
    : `<ul class="en-liste">${items.map((x) => {
      const reste = finDe(x), chaud = reste < 60000;
      const n = Number(x.n) || 0;
      return `<li class="card en-ligne${chaud ? ' is-chaud' : ''}">
        <div class="en-mini">${cardHtml(x.card || {}, { size: 'sm', shiny: !!x.card?.shiny })}</div>
        <div class="en-info"><strong class="en-nom">${esc(x.card?.name || '')}</strong>
          <span class="small muted">${x.mine ? 'Ta carte' : `Vendue par ${esc(x.vendeur?.pseudo || 'un membre')}`} · ${n ? `${n} offre${n > 1 ? 's' : ''}` : 'aucune offre'}</span>
          <span class="en-prix">${x.top ? `${esc(fmtP(x.top.amount))} <span class="small muted">· ${x.top.mine ? 'toi' : esc(x.top.pseudo || 'membre')}</span>` : `<span class="small muted">Mise de départ</span> ${esc(fmtP(x.min_bid))}`}</span>
          <span class="en-reste${chaud ? ' is-chaud' : ''}">${ICON_HORLOGE}<span>Fin dans <span data-en-left="${esc(x.ends_at)}">${esc(restant(reste))}</span></span></span></div>
        <button type="button" class="btn ${chaud ? 'btn-sand' : 'btn-ghost'} en-voir" data-en="voir" data-id="${esc(x.id)}">Voir l’enchère<span class="visually-hidden"> ${esc(x.card?.name || '')}</span></button></li>`;
    }).join('')}</ul>`;
  return `<div class="en-tete"><div><h3 class="en-titre" id="en-titre" tabindex="-1">Enchères des membres</h3><p class="small muted">Une carte, une durée, la plus haute offre gagne. Tes Paillettes sont bloquées pendant l’enchère et rendues si quelqu’un fait mieux.</p></div>
    <button type="button" class="btn btn-ghost" data-en="hist">Mes enchères</button></div>${sem}${liste}`;
}

/** Page d'une enchère (formes de .c2-auc, cartes-enchere.js). */
function enchereHtml() {
  const retour = `<button type="button" class="c2-back" data-en="liste">${ICON_RETOUR}Enchères</button>`;
  if (!Q.enchere) return `<section class="c2-auc en-auc">${retour}<p class="empty">${esc(Q.err || 'Chargement…')}</p></section>`;
  const { enchere: x, bids = [], me = {} } = Q.enchere;
  const k = x.card || {};
  const ouverte = x.status === 'ouverte' && finDe(x) > 0;
  const vendeur = x.vendeur?.pseudo || 'un membre';
  const prolongee = new Date(x.ends_at) > new Date(x.fin_prevue);
  const top = x.top;
  const lead = !!top?.mine;
  const cap = Number(me.cap) || 0;
  const min = Number(x.next_min) || 0;
  const boite1 = ouverte
    ? `<p class="small muted">Fin dans</p><p class="c2-auc-big en-chrono${prolongee ? ' is-chaud' : ''}" data-en-left="${esc(x.ends_at)}" data-court aria-live="off">${esc(restantCourt(finDe(x)))}</p>
      ${prolongee ? '<p class="en-prolonge" role="status">Prolongée de 30 s : une offre est arrivée dans les dernières secondes.</p>' : `<p class="small muted">Durée choisie : ${esc(dureeLabel(x.duree_min))}</p>`}`
    : `<p class="small muted">Terminée</p><p class="c2-auc-big">${esc(quand(x.closed_at || x.ends_at))}</p>`;
  const prix = x.status === 'vendue' ? x.price : top?.amount;
  const qui = x.status === 'vendue' ? { pseudo: x.winner, mine: x.won, ...(top || {}) } : top;
  const boite2 = prix
    ? `<p class="small muted">${x.status === 'vendue' ? 'Prix final' : 'Meilleure offre'}</p><p class="c2-auc-big c2-auc-price" aria-live="polite">${esc(fmtP(prix))}</p>
      <p class="c2-auc-who">${avatarHtml(qui || {}, 22)}<span>${esc(qui?.pseudo || 'membre')}${qui?.mine ? ' (toi)' : ''}</span></p>`
    : `<p class="small muted">Meilleure offre</p><p class="c2-auc-big">—</p><p class="small muted">Mise de départ : ${esc(fmtP(x.min_bid))}</p>`;
  let bas = '';
  if (x.status === 'vendue' && x.won) {
    bas = `<p class="card c2-auc-done en-done is-gagne" role="status">Tu as remporté « ${esc(k.name)} » pour ${esc(fmtP(x.price))}. La carte est dans ta collection. ${esc(vendeur)} reçoit ${esc(fmtP(x.net))} (10 % de frais de vente disparaissent).</p>
      <div class="btn-row"><a class="btn btn-sand" href="#collection">Voir dans Mes cartes</a></div>`;
  } else if (x.status === 'vendue' && x.mine) {
    bas = `<p class="card c2-auc-done en-done is-gagne" role="status">« ${esc(k.name)} » est vendue à ${esc(x.winner || 'un membre')} pour ${esc(fmtP(x.price))}. Tu reçois ${esc(fmtP(x.net))} : 10 % de frais de vente disparaissent.</p>`;
  } else if (x.status === 'vendue') {
    bas = `<p class="card c2-auc-done en-done" role="status">${esc(x.winner || 'Un membre')} a remporté « ${esc(k.name)} » pour ${esc(fmtP(x.price))}.${me.depasse ? ` Tes ${esc(fmtP(me.depasse.amount))} t’ont été rendues.` : ''}</p>`;
  } else if (!ouverte && x.status !== 'retiree' && x.status !== 'annulee' && !top) {
    bas = `<p class="card c2-auc-done en-done" role="status">${x.mine ? `Aucune offre : « ${esc(k.name)} » revient dans ta collection. Tu peux la remettre en vente dans 24 h.` : 'Enchère terminée sans offre.'}</p>`;
  } else if (x.status === 'retiree') {
    bas = `<p class="card c2-auc-done en-done" role="status">${x.mine ? `Tu as retiré « ${esc(k.name)} » de la vente.` : 'La carte a été retirée de la vente.'}</p>`;
  } else if (x.status === 'annulee') {
    bas = '<p class="card c2-auc-done en-done" role="status">Enchère annulée : la meilleure offre a été remboursée.</p>';
  } else if (!ouverte) {
    bas = '<p class="card c2-auc-done en-done" role="status">Enchère terminée : le résultat arrive dans un instant.</p>';
  } else if (x.mine) {
    bas = top ? '<p class="card c2-auc-done en-done">Une offre a été faite : tu ne peux plus retirer ta carte. Tu reçois le prix final moins 10 %.</p>'
      : `<div class="card c2-auc-done en-done"><p>Personne n’a encore fait d’offre. Tu peux encore retirer ta carte.</p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-en="retirer"${Q.busy ? ' disabled' : ''}>Retirer de la vente</button></div></div>`;
  } else {
    const peut = !lead && cap >= min && !Q.busy;
    const note = lead ? '<p class="small c2-auc-note" role="status">Tu as la meilleure offre. Tes Paillettes te seront rendues si quelqu’un fait mieux.</p>'
      : cap < min ? `<p class="small c2-auc-note" role="status">Ton maximum (${esc(fmtP(cap))}) est sous l’offre minimale.</p>` : '';
    const depasse = !lead && me.depasse && top ? `<p class="c2-auc-err" role="alert">${esc(top.pseudo || 'Un membre')} a fait mieux : ${esc(fmtP(top.amount))}. Tes ${esc(fmtP(me.depasse.amount))} te sont rendues.</p>` : '';
    const valeur = lead ? min : (Q.montant || String(min));
    bas = `<form class="card c2-auc-form" data-en-form="offre" novalidate>
        <label for="en-montant" class="c2-auc-lab">Ton offre · minimum ${esc(fmtP(min))}</label>
        <div class="en-rapides" role="group" aria-label="Offres rapides">${[10, 25, 50].map((d) => `<button type="button" class="btn btn-ghost en-rapide" data-en="plus" data-d="${d}"${peut ? '' : ' disabled'}>+${d}</button>`).join('')}</div>
        <div class="c2-auc-row"><input id="en-montant" type="number" inputmode="numeric" min="${min}" max="${Math.max(min, cap)}" step="1" value="${esc(valeur)}"
          aria-describedby="en-aide${Q.err ? ' en-err' : ''}"${peut ? '' : ' disabled'}><button type="submit" class="btn btn-sand"${peut ? '' : ' disabled'}>${Q.busy ? 'Envoi…' : 'Enchérir'}</button></div>
        ${Q.err ? `<p class="c2-auc-err" id="en-err" role="alert">${esc(Q.err)}</p>` : depasse}
        ${note}
        <p class="small muted" id="en-aide">Tes Paillettes sont bloquées tout de suite et rendues si quelqu’un fait mieux. Ton maximum : ${esc(fmtP(cap))} (la moitié de ton solde de lundi).</p></form>`;
  }
  const regles = [`Mise de départ ${fmtP(x.min_bid)}, puis au moins ${fmtP(x.step)} de plus que la meilleure offre.`,
    'Une offre dans les 30 dernières secondes prolonge de 30 s (10 minutes de plus au plus).', 'Plafond : la moitié de ton solde de lundi.',
    `${vendeur} ne peut pas enchérir sur sa propre carte.`, `À la fin, la carte va à la meilleure offre ; ${vendeur} reçoit le prix moins 10 %.`];
  const offres = bids.length ? `<ul class="c2-auc-bids">${bids.slice(0, 10).map((b) => `<li class="c2-auc-bid">${avatarHtml(b, 24)}<span class="c2-auc-who">${esc(b.pseudo || 'membre')}${b.mine ? ' <span class="muted small">(toi)</span>' : ''}</span>
      <strong>${esc(fmtP(b.amount))}</strong><span class="muted small">${esc(ago(b.created_at))}</span></li>`).join('')}</ul>` : '<p class="muted small">Aucune offre.</p>';
  return `<section class="c2-auc en-auc" aria-labelledby="en-auc-h">${retour}
      <div class="c2-auc-title"><div><p class="eyebrow">${x.mine ? 'Ta carte aux enchères' : `Enchère de ${esc(vendeur)}`}</p><h2 id="en-auc-h" class="c2-auc-name" tabindex="-1">${esc(k.name || '')}</h2></div><span class="pill">${esc(rarityLabel(k.rarity))}</span></div>
      <div class="c2-auc-top"><div class="c2-auc-card">${cardHtml(k, { size: 'md', shiny: !!k.shiny })}</div>
        <div class="c2-auc-boxes"><div class="card c2-auc-box">${boite1}</div><div class="card c2-auc-box">${boite2}</div></div></div>
      ${bas}
      <details class="card c2-auc-rulesbox"><summary>Règles de cette enchère</summary><ul class="small c2-auc-rules">${regles.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>
      <h3 class="c2-auc-sub">Dernières offres</h3>
      ${offres}
    </section>`;
}

/** Une ligne de « Mes enchères » : statut, phrase et prix. */
function histLigneHtml(x) {
  const k = x.card || {};
  let st, cl = '', txt;
  if (x.role === 'vendeur') {
    if (x.status === 'vendue') { st = 'Vendue'; cl = 'gagne'; txt = `Vendue à ${x.winner || 'un membre'} · tu as reçu ${fmtP(x.net)}`; }
    else if (x.status === 'ouverte') { st = 'En cours'; txt = x.top ? `Meilleure offre ${fmtP(x.top)}` : 'Aucune offre pour l’instant'; }
    else if (x.status === 'retiree') { st = 'Retirée'; txt = 'Revenue dans ta collection'; }
    else if (x.status === 'annulee') { st = 'Annulée'; txt = 'Revenue dans ta collection'; }
    else { st = 'Sans offre'; txt = 'Revenue dans ta collection'; }
  } else if (x.status === 'vendue' && x.won) { st = 'Gagnée'; cl = 'gagne'; txt = `Achetée à ${x.vendeur || 'un membre'}`; }
  else if (x.status === 'ouverte') { st = 'En cours'; txt = x.top_mine ? 'Tu as la meilleure offre' : `${fmtP(x.top)} · tes ${fmtP(x.mon_offre)} t’ont été rendues`; }
  else if (x.status === 'vendue') { st = 'Perdue'; txt = `${x.winner || 'Un membre'} a gagné · tes ${fmtP(x.mon_offre)} t’ont été rendues`; }
  else { st = 'Annulée'; txt = `Tes ${fmtP(x.mon_offre)} t’ont été rendues`; }
  const prix = x.status === 'vendue' ? x.price : x.status === 'ouverte' ? x.top : null;
  return `<li class="card en-ligne"><div class="en-mini">${cardHtml(k, { size: 'sm', shiny: !!k.shiny })}</div>
      <div class="en-info"><strong class="en-nom">${esc(k.name || '')}</strong><span class="en-statut${cl ? ' is-' + cl : ''}">${esc(st)}</span><span class="small muted">${esc(txt)}</span></div>
      <div class="en-droite"><strong>${prix ? esc(fmtP(prix)) : '—'}</strong><span class="small muted">${esc(quand(x.quand, false))}</span></div></li>`;
}
/** Filtre de l'historique. */
function garde(x) {
  if (Q.filtre === 'gagnees') return x.role === 'acheteur' && x.status === 'vendue' && x.won;
  if (Q.filtre === 'vendues') return x.role === 'vendeur' && x.status === 'vendue';
  if (Q.filtre === 'perdues') return x.role === 'acheteur' && x.status !== 'ouverte' && !x.won;
  return true;
}
function histHtml() {
  const L = (Q.hist || []).filter(garde);
  const corps = Q.err ? `<p class="empty">${esc(Q.err)}</p>` : !Q.hist ? '<p class="empty">Chargement…</p>'
    : !L.length ? `<p class="empty">${Q.filtre === 'toutes' ? 'Aucune enchère ces 30 derniers jours.' : 'Aucune enchère dans ce filtre.'}</p>`
    : `<ul class="en-liste en-hist">${L.map(histLigneHtml).join('')}</ul>`;
  return `<div class="en-tete"><div><h3 class="en-titre" id="en-titre" tabindex="-1">Mes enchères</h3><p class="small muted">Tes ventes et tes offres des 30 derniers jours.</p></div>
      <button type="button" class="btn btn-ghost" data-en="liste">Toutes les enchères</button></div>
    <div class="en-filtres" role="group" aria-label="Filtrer">${FILTRES.map(([id, t]) => `<button type="button" class="btn btn-ghost en-filtre" data-en="filtre" data-f="${id}" aria-pressed="${Q.filtre === id}">${t}</button>`).join('')}</div>
    ${corps}`;
}

/** Redessine la vue courante ; le focus revient sur l'élément qui l'avait (ou sur focusSel). */
function dessiner(focusSel = null) {
  if (!Q.box?.isConnected) return;
  const garder = focusSel || (document.activeElement && Q.box.contains(document.activeElement) && document.activeElement.id ? '#' + document.activeElement.id : null);
  Q.box.innerHTML = Q.vue === 'enchere' ? enchereHtml() : Q.vue === 'hist' ? histHtml() : listeHtml();
  if (garder) Q.box.querySelector(garder)?.focus({ preventScroll: true });
  canal();
}

/* ---------- Temps réel (10 dernières minutes d'une enchère) ---------- */
function couperCanal() {
  if (!Q.canal) return;
  try { Promise.resolve(sb.removeChannel(Q.canal)).catch(() => {}); } catch { /* sans effet */ }
  Q.canal = null; Q.canalId = null;
}
/** Branche le canal de l'enchère affichée quand il lui reste 10 minutes au plus ; le coupe sinon. */
function canal() {
  const x = Q.vue === 'enchere' ? Q.enchere?.enchere : null;
  const utile = x && x.status === 'ouverte' && finDe(x) > 0 && finDe(x) <= CANAL_MS && Q.box?.isConnected;
  if (!utile) { couperCanal(); return; }
  if (Q.canal && Q.canalId === x.id) return;
  couperCanal();
  try {
    let attente = null;
    Q.canalId = x.id;
    Q.canal = sb.channel(`enchere:${x.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'hg_card_member_auctions', filter: `id=eq.${x.id}` }, () => {
        if (attente) return;
        attente = setTimeout(() => { attente = null; relireVue(); }, 150);
      })
      .subscribe();
  } catch (e) { Q.canal = null; Q.canalId = null; console.warn('[enchères] temps réel indisponible', e); }
}

/* ---------- Actions ---------- */
async function relireVue(focusSel = null) {
  if (Q.vue === 'enchere') await chargerEnchere();
  else if (Q.vue === 'hist') await chargerHistorique();
  else await chargerListe();
  dessiner(focusSel);
}
async function ouvrir(vue, id = null) {
  Q.vue = vue; Q.id = id; Q.err = ''; Q.montant = '';
  if (vue === 'enchere') Q.enchere = null;
  dessiner();
  await relireVue(vue === 'enchere' ? '#en-auc-h' : '#en-titre');
}
async function encherir(valeur) {
  const x = Q.enchere?.enchere;
  if (!x || Q.busy) return;
  const n = Math.floor(Number(valeur));
  const cap = Number(Q.enchere.me?.cap) || 0;
  if (!Number.isFinite(n) || n < Number(x.next_min)) { Q.err = `L’offre minimale est de ${fmtP(x.next_min)}.`; dessiner('#en-montant'); return; }
  if (n > cap) { Q.err = `Ton maximum pour cette enchère : ${fmtP(cap)}.`; dessiner('#en-montant'); return; }
  Q.busy = true; Q.err = ''; dessiner();
  try {
    const { data, error } = await sb.rpc('hg_enchere_offre', { p_id: x.id, p_montant: n });
    if (error) throw error;
    toast(data?.prolongee ? `Offre de ${fmtP(n)} enregistrée : l’enchère est prolongée de 30 s` : `Offre de ${fmtP(n)} enregistrée`, 'ok');
    Q.montant = '';
    try { await Q.ctx?.refresh?.(); } catch (e) { console.warn('[enchères] solde', e); }
  } catch (e) { Q.err = errMsg(e); }
  Q.busy = false;
  await chargerEnchere();
  dessiner(Q.err ? '#en-montant' : '#en-auc-h');
}
async function retirer() {
  const x = Q.enchere?.enchere;
  if (!x || Q.busy) return;
  if (!(await confirmBox('Retirer ta carte de la vente ?', `« ${x.card?.name || ''} » revient dans ta collection. Tu pourras la remettre en vente dans 24 h.`, { ok: 'Retirer de la vente', cancel: 'Garder en vente' }))) return;
  Q.busy = true; dessiner();
  try {
    const { error } = await sb.rpc('hg_enchere_retirer', { p_id: x.id });
    if (error) throw error;
    toast('Carte retirée de la vente', 'ok');
    try { await Q.ctx?.refresh?.(); } catch (e) { console.warn('[enchères] collection', e); }
  } catch (e) { toast(errMsg(e), 'error'); }
  Q.busy = false;
  await relireVue('#en-auc-h');
}

/** Compte à rebours chaque seconde ; à zéro, relecture (le serveur clôt l'enchère). */
function tic() {
  if (!Q.box?.isConnected) { arreter(); return; }
  if (document.hidden) return;
  let fini = false;
  Q.box.querySelectorAll('[data-en-left]').forEach((n) => {
    const ms = new Date(n.dataset.enLeft).getTime() - maintenant();
    n.textContent = n.hasAttribute('data-court') ? restantCourt(ms) : restant(ms);
    if (ms <= 0) fini = true;
  });
  if (fini && !Q.busy && !Q.attenteFin) { Q.attenteFin = true; setTimeout(() => { Q.attenteFin = false; relireVue(); }, 1200); }
  else canal();
}
function arreter() {
  clearInterval(Q.tick); clearInterval(Q.relire); Q.tick = null; Q.relire = null;
  couperCanal();
}

/**
 * Monte l'onglet « Enchères » dans el (vidé). Peut être appelé à chaque ouverture de l'onglet : la vue et le filtre restent.
 * @param {HTMLElement} el panneau de l'onglet
 * @param {{id?: string, onCount?: (n: number) => void, refresh?: () => Promise<void>}} [ctx]
 */
export async function mountEncheres(el, ctx = {}) {
  arreter();
  const box = document.createElement('div');
  box.className = 'en';
  el.replaceChildren(box);
  Q.box = box; Q.ctx = ctx;
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-en]');
    if (!b || b.disabled) return;
    const a = b.dataset.en;
    if (a === 'voir') return ouvrir('enchere', b.dataset.id);
    if (a === 'liste') return ouvrir('liste');
    if (a === 'hist') return ouvrir('hist');
    if (a === 'filtre') { Q.filtre = b.dataset.f; dessiner(`[data-f="${Q.filtre}"]`); return; }
    if (a === 'retirer') return retirer();
    if (a === 'plus') {
      const x = Q.enchere?.enchere;
      if (!x) return;
      const base = x.top ? Number(x.top.amount) : Number(x.min_bid) - Number(x.step);
      const champ = box.querySelector('#en-montant');
      Q.montant = String(Math.max(Number(x.next_min), base + Number(b.dataset.d)));
      if (champ) { champ.value = Q.montant; champ.focus({ preventScroll: true }); }
    }
  });
  box.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-en-form="offre"]')) return;
    e.preventDefault();
    encherir(e.target.querySelector('#en-montant')?.value);
  });
  box.addEventListener('input', (e) => { if (e.target.id === 'en-montant') { Q.montant = e.target.value; if (Q.err) { Q.err = ''; } } });
  Q.tick = setInterval(tic, 1000);
  Q.relire = setInterval(() => {
    if (!box.isConnected) { arreter(); return; }
    if (document.hidden || Q.busy || Q.vue === 'hist' || document.activeElement?.id === 'en-montant') return;
    relireVue();
  }, RELIRE_MS);
  if (ctx.id) { Q.vue = 'enchere'; Q.id = ctx.id; Q.enchere = null; }
  dessiner();
  await relireVue();
}

/* ---------- Mise en vente (fiche d'une carte de « Mes cartes ») ---------- */
/** Feuille de style des fenêtres partagées (.hg-dialog), chargée une seule fois. */
function stylesFenetre() {
  if (document.querySelector('link[data-ui-confirm], link[href$="ui-confirm.css"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('../../commun/ui-confirm.css', import.meta.url).href; l.dataset.uiConfirm = '';
  document.head.append(l);
}

/**
 * Fenêtre « Mettre aux enchères » : durée, mise de départ. Un seul exemplaire part (le moins précieux des libres).
 * @param {{card: object, copies: object[], total: number, onDone?: (id: string) => void, onClose?: () => void}} o
 *   copies : exemplaires libres (ni bloqués, ni en vitrine) ; total : nombre d'exemplaires possédés.
 */
export function openVente(o) {
  stylesFenetre();
  const k = o.card;
  const cp = [...(o.copies || [])].sort((a, b) => Number(!!a.shiny) - Number(!!b.shiny) || Number(!!a.serial) - Number(!!b.serial) || Number(b.id) - Number(a.id))[0];
  if (!cp) { toast('Aucun exemplaire libre à mettre en vente.', 'error'); return; }
  const d = document.createElement('dialog');
  d.className = 'hg-dialog en-dlg';
  d.setAttribute('aria-labelledby', 'en-dlg-t');
  const n = Number(o.total) || 1;
  const phrase = n > 1 ? `tu en as ${n} exemplaires, un seul part.` : 'c’est ton seul exemplaire.';
  const V = { duree: 10, depart: '50', err: '', errServ: '', busy: false };
  const dessinerVente = (focusSel) => {
    d.innerHTML = `<form method="dialog" class="stack" novalidate>
      <h2 id="en-dlg-t" class="dialog-title">Mettre aux enchères</h2>
      <div class="en-dlg-carte">${cardHtml(k, { size: 'sm', shiny: !!cp.shiny })}<div><strong>${esc(k.name)}</strong><p class="small muted">${esc(rarityLabel(k.rarity))} · ${esc(phrase)} Il reste bloqué jusqu’à la fin de l’enchère.</p></div></div>
      <fieldset class="en-durees"><legend>Durée</legend>${DUREES.map(([m, t]) => `<label class="en-duree"><input type="radio" name="duree" value="${m}"${V.duree === m ? ' checked' : ''}><span>${t}</span></label>`).join('')}</fieldset>
      <div class="field"><label for="en-depart">Mise de départ (${paillSym()})</label><input id="en-depart" type="number" inputmode="numeric" min="10" max="100000" value="${esc(V.depart)}" aria-describedby="en-depart-h${V.err ? ' en-depart-e' : ''}"${V.err ? ' aria-invalid="true"' : ''}>
        ${V.err ? `<p class="c2-auc-err" id="en-depart-e" role="alert">${esc(V.err)}</p>` : ''}
        <p class="small muted" id="en-depart-h">Les offres montent ensuite de ${esc(fmtP(10))} au moins. Tu reçois le prix final moins 10 %.</p></div>
      <p class="small muted en-dlg-regle">Une fois la première offre faite, tu ne peux plus retirer ta carte. Deux cartes en vente à la fois au plus.</p>
      ${V.errServ ? `<p class="c2-auc-err" role="alert">${esc(V.errServ)}</p>` : ''}
      <div class="btn-row"><button type="button" class="btn btn-ghost" data-en-dlg="annuler">Annuler</button><button type="submit" class="btn btn-sand"${V.busy ? ' disabled' : ''}>${V.busy ? 'Envoi…' : 'Mettre aux enchères'}</button></div>
    </form>`;
    if (focusSel) d.querySelector(focusSel)?.focus();
  };
  dessinerVente();
  d.addEventListener('change', (e) => { if (e.target.name === 'duree') V.duree = Number(e.target.value); });
  d.addEventListener('input', (e) => { if (e.target.id === 'en-depart') V.depart = e.target.value; });
  d.addEventListener('click', (e) => { if (e.target.closest('[data-en-dlg="annuler"]')) d.close(); });
  d.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (V.busy) return;
    const depart = Math.floor(Number(V.depart));
    if (!Number.isFinite(depart) || depart < 10) { V.err = `La mise de départ est de ${fmtP(10)} au moins.`; dessinerVente('#en-depart'); return; }
    if (depart > 100000) { V.err = `La mise de départ est de ${fmtP(100000)} au plus.`; dessinerVente('#en-depart'); return; }
    V.busy = true; V.err = ''; V.errServ = ''; dessinerVente();
    try {
      const { data, error } = await sb.rpc('hg_enchere_vendre', { p_copy: Number(cp.id), p_duree: V.duree, p_depart: depart });
      if (error) throw error;
      toast(`« ${k.name} » est aux enchères pour ${dureeLabel(V.duree)}`, 'ok');
      d.close();
      o.onDone?.(data);
    } catch (err) {
      V.busy = false; V.errServ = errMsg(err); dessinerVente('button[type="submit"]');
    }
  });
  d.addEventListener('close', () => { d.remove(); o.onClose?.(); });
  document.body.append(d);
  d.showModal();
  d.querySelector('input[name="duree"]:checked')?.focus();
}
