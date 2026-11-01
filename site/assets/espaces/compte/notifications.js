// ===== Humane Gang — centre de notifications (migration 195) =====
/*
 * Rôle : historique complet des notifications du site : filtres par catégorie (celles présentes, avec leur nombre), recherche,
 * groupes Aujourd'hui / Cette semaine / Plus ancien, « Tout marquer comme lu », suppression une par une, suppression des lues.
 * Les catégories ne sont pas une liste fermée : une catégorie inconnue a son filtre, sous son propre nom.
 * Page : /pages/compte/notifications.html (membres connectés). Le cadre de la page et son squelette sont dans le HTML.
 * Dépendances : core.js, icons.js, ui-confirm.js, core/presence.js (rendu d'une ligne, lecture, badge et panneau de l'en-tête).
 * RPC : hg_notifs_page (lecture par pages), hg_notif_supprimer, hg_notifs_supprimer_lues ; hg_notifs_lues par presence.js.
 * Les comptes affichés viennent de la base : une action de la page les ajuste, un changement venu du panneau les relit (« hg-notifs »).
 */
import { sb, initPage, toast, errMsg, esc, $ } from '../../commun/core.js';
import { svg } from '../../commun/icons.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { catNom, notifHtml, marquerLues, rafraichirNotifs } from '../../commun/core/presence.js';

/** Lignes par page (la base plafonne à 50). */
const LIMITE = 30;
/** Attente après la frappe avant de chercher (ms). */
const FRAPPE_MS = 250;
/** Libellés des filtres, dans leur ordre d'affichage. Une catégorie absente d'ici vient ensuite, dans l'ordre alphabétique. */
const FILTRES = { souhaits: 'Cartes', echanges: 'Échanges', messages: 'Messages', sorties: 'Sorties', jeux: 'Jeux', annonces: 'Annonces',
  santa: 'Secret Santa', anniversaires: 'Anniversaires', quiz: 'Quiz', info: 'Infos' };
const ORDRE = Object.keys(FILTRES);
const nomFiltre = (c) => FILTRES[c] || catNom(c);
const rang = (c) => (ORDRE.includes(c) ? ORDRE.indexOf(c) : ORDRE.length);
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * État de la page. etat : chargement | liste | vide | sans | erreur. seq : numéro de la dernière lecture, une réponse plus ancienne est ignorée.
 * fini : numéro de la dernière lecture arrivée (différent de seq : une lecture est en route). fond : celle en route est une relecture de fond.
 */
const D = { etat: 'chargement', cat: '', q: '', liste: [], suite: false, comptes: {}, total: 0, tout: 0, non_lues: 0, lues: 0, seq: 0, fini: 0, fond: false };
/** Une lecture de la liste est en route : la page suivante attendra, sa position pourrait ne plus valoir. */
const enLecture = () => D.fini !== D.seq;

/* ---------- Rendu ---------- */

/** Groupe d'une notification, d'après le jour de l'appareil : aujourd'hui, les 6 jours d'avant, le reste. */
function groupe(iso) {
  const t = new Date(iso), n = new Date();
  if (t >= new Date(n.getFullYear(), n.getMonth(), n.getDate())) return 'Aujourd’hui';
  return t >= new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6) ? 'Cette semaine' : 'Plus ancien';
}

/** Un bouton de filtre. n absent : sans nombre (chargement, erreur). */
const filtreHtml = (cat, nom, n) => `<button type="button" class="ntf-filtre" data-ntf-cat="${esc(cat)}" aria-pressed="${cat === D.cat}">${esc(nom)}${n === undefined ? '' : ` <b>${esc(n)}</b>`}</button>`;

/** Boutons d'en-tête et de pied, filtres : tout ce qui dépend des comptes. */
function peindreOutils() {
  const liste = D.etat === 'liste';
  $('#ntf-outils').hidden = D.etat === 'vide';
  const lire = $('#ntf-lire');
  lire.hidden = !liste;
  lire.disabled = !D.non_lues;
  $('#ntf-suppr-lues').hidden = !liste || !D.lues;
  if (D.etat === 'chargement' || D.etat === 'erreur') { $('#ntf-filtres').innerHTML = filtreHtml('', 'Toutes'); return; }
  // La catégorie choisie reste visible même si la recherche n'y trouve rien : sinon plus aucun bouton ne serait actif.
  const cats = [...new Set([...Object.keys(D.comptes), ...(D.cat ? [D.cat] : [])])];
  cats.sort((a, b) => rang(a) - rang(b) || nomFiltre(a).localeCompare(nomFiltre(b), 'fr'));
  $('#ntf-filtres').innerHTML = filtreHtml('', 'Toutes', D.total) + cats.map((c) => filtreHtml(c, nomFiltre(c), D.comptes[c] || 0)).join('');
}

/** Liste groupée, avec « Voir plus » s'il reste une page. */
function listeHtml() {
  const jours = [...new Set(D.liste.map((n) => groupe(n.created_at)))];
  const sections = jours.map((j) => `<section class="ntf-groupe"><h2 class="ntf-jour">${esc(j)}</h2><ul class="notif-liste">${D.liste.filter((n) => groupe(n.created_at) === j)
    .map((n) => `<li class="ntf-rangee">${notifHtml(n)}<button type="button" class="ntf-suppr" data-ntf-suppr="${esc(n.id)}" aria-label="${esc(`Supprimer : ${n.titre}`)}">${svg('trash2')}</button></li>`).join('')}</ul></section>`).join('');
  return sections + (D.suite ? `<button type="button" class="btn btn-ghost btn-sm ntf-plus" id="ntf-plus"${enLecture() ? ' disabled' : ''}>Voir plus</button>` : '');
}

/** Corps de la page selon l'état. */
function peindreCorps() {
  const corps = $('#ntf-corps');
  if (D.etat === 'liste') corps.innerHTML = listeHtml();
  if (D.etat === 'chargement') corps.innerHTML = `<div class="ntf-groupe" aria-busy="true"><p class="visually-hidden">Chargement de tes notifications…</p><ul class="notif-liste">${'<li><span class="ntf-sk"></span></li>'.repeat(5)}</ul></div>`;
  if (D.etat === 'vide') corps.innerHTML = '<p class="empty">Aucune notification pour l’instant. Les offres, messages et rappels arriveront ici.</p>';
  if (D.etat === 'sans') corps.innerHTML = `<div class="empty ntf-sans"><p class="small">Aucune notification ne correspond à « ${esc(D.q)} ».</p><button type="button" class="btn btn-ghost btn-sm" id="ntf-effacer">Effacer la recherche</button></div>`;
  if (D.etat === 'erreur') corps.innerHTML = '<div class="ntf-alerte" role="alert"><p><strong>Impossible de charger tes notifications.</strong></p><p class="small muted">Vérifie ta connexion, puis réessaie.</p><button type="button" class="btn btn-ghost btn-sm" id="ntf-reessayer">Réessayer</button></div>';
}

function peindre() { peindreOutils(); peindreCorps(); }

/** Annonce pour les lecteurs d'écran. */
const annonce = (txt) => { $('#ntf-statut').textContent = txt; };

/* ---------- Lecture ---------- */

/** Une page : la première, ou celle qui suit la ligne « avant ». */
async function lire(avant = null) {
  const { data, error } = await sb.rpc('hg_notifs_page', { p_cat: D.cat || null, p_q: D.q || null,
    p_avant_at: avant?.created_at ?? null, p_avant_id: avant?.id ?? null, p_limite: LIMITE });
  if (error) throw error;
  return data;
}

/** Garde les comptes et la présence d'une suite. */
function poser(r) {
  Object.assign(D, { suite: !!r.suite, comptes: r.comptes || {}, total: Number(r.total) || 0, tout: Number(r.tout) || 0,
    non_lues: Number(r.non_lues) || 0, lues: Number(r.lues) || 0 });
}

/** Grise « Voir plus » ou le rend à nouveau disponible, s'il est affiché. */
function griserPlus(oui) {
  const plus = $('#ntf-plus');
  if (plus) plus.disabled = oui;
}

/**
 * Relit la liste depuis le début.
 * @param {{garder?: boolean}} [options] garder : relecture de fond, autant de lignes que déjà affichées, et un échec laisse la liste en place.
 */
async function charger({ garder = false } = {}) {
  const seq = ++D.seq;
  const voulu = garder ? D.liste.length : 0;
  griserPlus(true);
  D.fond = garder;
  try {
    let r = await lire();
    const liste = [...(r?.liste || [])];
    while (seq === D.seq && r?.suite && liste.length < voulu) { r = await lire(liste[liste.length - 1]); liste.push(...(r?.liste || [])); }
    if (seq !== D.seq) return;
    D.fini = seq;
    if (!r) throw new Error('Réponse vide');
    poser(r);
    // Dernière ligne de la catégorie partie : retour à « Toutes ».
    if (D.cat && !D.q && !liste.length && D.tout) { D.cat = ''; await charger(); return; }
    D.liste = liste;
    D.etat = !D.tout ? 'vide' : liste.length ? 'liste' : 'sans';
    peindre();
    if (!garder && (D.q || D.cat)) annonce(pluriel(D.cat ? D.comptes[D.cat] || 0 : D.total, 'notification'));
  } catch (e) {
    if (seq !== D.seq) return;
    D.fini = seq;
    if (garder) { griserPlus(false); console.warn('[notifications]', e?.message || e); return; }
    D.etat = 'erreur';
    peindre();
  }
}

/** Page suivante, ajoutée à la liste. Le focus va sur la première ligne ajoutée. */
async function voirPlus(bouton) {
  if (enLecture()) return;
  const seq = D.seq, deja = D.liste.length;
  bouton.disabled = true;
  try {
    const r = await lire(D.liste[deja - 1]);
    if (seq !== D.seq || D.liste.length !== deja) return; // la liste a bougé : cette page ne suit plus la dernière ligne
    poser(r);
    D.liste.push(...(r.liste || []));
    peindre();
    document.querySelectorAll('.ntf-suppr')[deja]?.focus();
  } catch (e) {
    if (seq !== D.seq) return;
    bouton.disabled = false;
    toast(errMsg(e), 'error');
  }
}

/* ---------- Actions ---------- */

/** Une notification lue depuis la liste : badge et panneau par presence.js, comptes et ligne ici. */
async function marquerUne(el) {
  const n = D.liste.find((x) => String(x.id) === el.dataset.notif);
  if (!n || n.lu || !(await marquerLues([Number(n.id)]))) return;
  n.lu = true;
  D.non_lues = Math.max(0, D.non_lues - 1);
  D.lues += 1;
  el.classList.remove('is-new');
  el.querySelector('.visually-hidden')?.remove();
  peindreOutils();
}

async function toutLire() {
  if (!(await marquerLues())) return;
  for (const n of D.liste) n.lu = true;
  D.lues += D.non_lues;
  D.non_lues = 0;
  peindre();
  $('#ntf-titre').focus(); // le bouton vient de se griser : le focus n'y resterait pas
  annonce('Toutes tes notifications sont lues.');
}

/** Suppression définitive d'une ligne. Le focus passe à la ligne suivante, ou au titre si c'était la dernière. */
async function supprimer(bouton) {
  const id = Number(bouton.dataset.ntfSuppr);
  const i = [...document.querySelectorAll('.ntf-suppr')].indexOf(bouton);
  bouton.disabled = true;
  try {
    const { error } = await sb.rpc('hg_notif_supprimer', { p_id: id });
    if (error) throw error;
  } catch (e) {
    bouton.disabled = false;
    toast(errMsg(e), 'error');
    return;
  }
  const n = D.liste.find((x) => Number(x.id) === id);
  D.liste = D.liste.filter((x) => x !== n);
  if (n) {
    D.tout -= 1; D.total -= 1;
    if (n.lu) D.lues -= 1; else D.non_lues -= 1;
    if (D.comptes[n.cat] > 1) D.comptes[n.cat] -= 1; else delete D.comptes[n.cat];
  }
  annonce('Notification supprimée.');
  rafraichirNotifs();
  // Une lecture partie avant la suppression contient encore la ligne : on la remplace par une lecture neuve.
  const relire = enLecture();
  if (D.liste.length) { peindre(); if (relire) charger({ garder: D.fond }); } else { await charger(); }
  const rangs = document.querySelectorAll('.ntf-suppr');
  (rangs[Math.min(i, rangs.length - 1)] || $('#ntf-titre')).focus();
}

/** Supprime toutes les lues, après confirmation. Les non lues restent. */
async function supprimerLues() {
  const n = D.lues;
  const ok = await confirmBox('Supprimer les notifications lues ?',
    n > 1 ? `Les ${n} notifications déjà lues disparaissent de l’historique. Les non lues restent.` : 'La notification déjà lue disparaît de l’historique. Les non lues restent.',
    { ok: 'Supprimer', danger: true });
  if (!ok) return;
  try {
    const { data, error } = await sb.rpc('hg_notifs_supprimer_lues');
    if (error) throw error;
    const nb = Number(data) || 0;
    toast(nb > 1 ? `${nb} notifications supprimées.` : nb ? '1 notification supprimée.' : 'Aucune notification supprimée.', 'ok');
  } catch (e) {
    toast(errMsg(e), 'error');
    return;
  }
  rafraichirNotifs();
  await charger();
  $('#ntf-titre').focus();
}

/* ---------- Démarrage ---------- */

let frappe = null;
/** Lance la recherche sur le texte du champ, si elle a changé. */
function chercher() {
  clearTimeout(frappe);
  const q = $('#ntf-q').value.trim();
  if (q === D.q) return;
  D.q = q;
  charger();
}

await initPage({ auth: 'member' });

$('#ntf-q').addEventListener('input', () => { clearTimeout(frappe); frappe = setTimeout(chercher, FRAPPE_MS); });
$('#ntf-lire').addEventListener('click', toutLire);
$('#ntf-suppr-lues').addEventListener('click', supprimerLues);
$('#ntf-filtres').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-ntf-cat]');
  if (!b || b.dataset.ntfCat === D.cat) return;
  D.cat = b.dataset.ntfCat;
  charger().then(() => document.querySelector('.ntf-filtre[aria-pressed="true"]')?.focus());
});
$('#ntf-corps').addEventListener('click', (ev) => {
  const suppr = ev.target.closest('[data-ntf-suppr]');
  if (suppr) { supprimer(suppr); return; }
  const plus = ev.target.closest('#ntf-plus');
  if (plus) { voirPlus(plus); return; }
  if (ev.target.closest('#ntf-effacer')) { $('#ntf-q').value = ''; chercher(); $('#ntf-q').focus(); return; }
  if (ev.target.closest('#ntf-reessayer')) { D.etat = 'chargement'; peindre(); charger(); return; }
  const item = ev.target.closest('[data-notif]');
  if (item) marquerUne(item);
});
// Changement venu du panneau de l'en-tête ou du direct.
document.addEventListener('hg-notifs', () => { if (D.etat !== 'chargement') charger({ garder: true }); });

charger();
