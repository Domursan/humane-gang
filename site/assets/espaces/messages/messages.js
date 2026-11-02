// ===== Humane Gang — messagerie (/pages/compte/messages.html) : conversations directes + messages anonymes du Secret Santa =====
// Page réservée aux membres. Deux colonnes : la liste des conversations, et le fil de la conversation ouverte.
// Dépendances : core.js (Supabase, notifications), sound.js (son), icons.js.
// Tables et RPC : hg_members, hg_my_conversations, hg_get_messages, hg_send_message, hg_mark_read, hg_open_direct ;
// groupes (migration 090) : messages-groupes.js (hg_group_*, hg_event_conv_open). Lien direct : ?event=<sortie>.
// Recherche (migration 203) : hg_search_messages, champ en haut de la liste ; la loupe du fil cherche dans les messages chargés.
// Réactions (migration 204) : hg_message_reactions_get, hg_message_react ; jamais dans l'assistance, aucune notification.
// Temps réel : canal privé « conv:<id> » (Supabase Realtime), avec actualisation périodique de secours.
// N'exporte rien.
import * as core from '../../commun/core.js';
import { sb, initPage, toast, errMsg, esc, $, avatarHtml, notify } from '../../commun/core.js';
import { svg } from '../../commun/icons.js';
import * as G from './messages-groupes.js'; // groupes et discussions de sortie (migration 090)
import { reportButtonHtml } from '../../commun/report.js'; // A6 : « Signaler » un message
import { avatarPresence } from '../../commun/core/presence.js'; // pastille « en ligne » (migration 153)

const me = await initPage({ auth: 'member' });
const app = $('#app');

const MAX_LEN = 4000;
const POLL_THREAD_MS = 4000;
const POLL_LIST_MS = 15000;
const POLL_SAFETY_MS = 60000; // interrogation de secours quand le temps réel est actif
const MOBILE = matchMedia('(max-width: 760px)');

/* ---------- Icônes (SVG à trait) ---------- */
const I = {
  plus: svg('plus', { size: 18, stroke: 2 }),
  back: svg('back', { size: 20, stroke: 2 }),
  send: svg('send2', { size: 20, stroke: 2 }),
  mask: svg('mask2', { size: 20, stroke: 1.8 }),
  chat: svg('chat', { size: 28, stroke: 1.6 }),
  lock: svg('lock2', { size: 14, stroke: 2 }),
  help: svg('info', { size: 14, stroke: 2 }),
  group: svg('users2', { size: 18, stroke: 2 }),
  users: svg('users2', { size: 20, stroke: 2 }),
  search: svg('search2', { size: 20, stroke: 2 }),
  up: svg('up', { size: 20, stroke: 2 }),
  down: svg('down', { size: 20, stroke: 2 }),
  close: svg('close', { size: 20, stroke: 2 }),
  smile: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/></svg>',
};
/** Les six réactions proposées sous un message (comme sous les souvenirs, avec 👍 au lieu de 👏). */
const REACTIONS = ['❤️', '😂', '👍', '😮', '🔥', '🎉'];
const LONG_PRESS_MS = 450; // appui long (téléphone) : choix d'une réaction, ou qui a réagi
const SEARCH_MIN = 3;      // lettres au moins pour chercher

/* ---------- État ---------- */
const S = {
  convs: [],           // hg_my_conversations()
  members: new Map(),  // id -> {pseudo, avatar_url, color}
  current: null,       // id de la conversation ouverte
  msgs: [],            // messages de la conversation ouverte
  lastId: 0,
  sending: false,
  loadingThread: false,
  reacts: new Map(),   // réactions de la conversation ouverte : id du message -> Map(émoji -> { mine, qui: [noms] })
  reactsKey: '',       // empreinte des réactions lues (pour ne redessiner qu'en cas de changement)
  search: { q: '', etat: '', res: null, err: '', seq: 0 }, // recherche dans toutes mes conversations
  find: null,          // loupe du fil : { ids: [identifiants trouvés], i: position courante }
};
let threadTimer = null, listTimer = null;
// Canal Supabase Realtime de la conversation ouverte (Broadcast privé « conv:<id> ») ; ok = abonnement confirmé
const RT = { thread: null, threadOk: false };
let pendingPull = false;

/* ---------- Outils ---------- */
const memberOf = (id) => S.members.get(id) || null;
/** Conversation à partir de son identifiant, ou null. */
const convOf = (id) => S.convs.find((c) => c.id === id) || null;
/** Côté Secret Santa : 'target' = je suis la cible (mon Santa est anonyme), 'santa' = je suis le Santa (je reste anonyme). */
function santaSide(c) { return c?.kind === 'santa' ? (c.other_id ? 'santa' : 'target') : null; }
/** Vrai pour une conversation d'assistance (ouverte quand l'admin ou le Staff prend en charge une demande). */
const isSupport = (c) => c?.kind === 'support';
/** Joue un son de notification (chargé à la demande, sans bloquer la page). */
function playSound(name) { import('../../commun/sound.js').then((m) => m.playSound?.(name)).catch(() => {}); }
/** Met à jour le compteur de messages non lus dans l'en-tête ; silencieux si la fonction n'existe pas. */
function refreshUnread() { try { core.refreshUnread?.(); } catch {} }

const timeFmt = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
const dayYearFmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const shortFmt = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit' });
const shortYearFmt = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short' });
const fullFmt = new Intl.DateTimeFormat('fr-CH', { dateStyle: 'full', timeStyle: 'short' });
/** Début du jour (minuit local) d'une date, en millisecondes. Sert à comparer des jours entiers. */
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
/** Nombre de jours calendaires entre aujourd'hui et la date donnée (0 = aujourd'hui, 1 = hier). */
const dayDiff = (d) => Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);

/** Heure relative courte pour la liste des conversations. */
function relTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const min = Math.floor((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `${min} min`;
  const dd = dayDiff(d);
  if (dd === 0) return timeFmt.format(d);
  if (dd === 1) return 'hier';
  if (dd < 7) return weekdayFmt.format(d);
  return d.getFullYear() === new Date().getFullYear() ? shortFmt.format(d) : shortYearFmt.format(d);
}
/**
 * Libellé d'une date pour le séparateur de jour : « Aujourd’hui », « Hier », ou la date complète.
 * @param {string} ts date ISO du message
 * @returns {string}
 */
function dayLabel(ts) {
  const d = new Date(ts), dd = dayDiff(d);
  if (dd === 0) return 'Aujourd’hui';
  if (dd === 1) return 'Hier';
  const s = (d.getFullYear() === new Date().getFullYear() ? dayFmt : dayYearFmt).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Texte → HTML : échappé, URLs http(s) transformées en liens, sauts de ligne conservés (CSS pre-wrap). */
const URL_RE = /\bhttps?:\/\/[^\s<>"']+/gi;
/** Échappe le texte et transforme les adresses http ou https en liens sûrs, ouvrant un nouvel onglet. */
function linkify(text) {
  const src = String(text ?? '');
  let out = '', last = 0;
  for (const m of src.matchAll(URL_RE)) {
    let url = m[0];
    const trail = /[.,;:!?)\]}»]+$/.exec(url); // ponctuation finale = hors du lien
    if (trail) url = url.slice(0, -trail[0].length);
    out += esc(src.slice(last, m.index));
    let ok = false;
    try { const u = new URL(url); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch {}
    out += ok ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>` : esc(url);
    last = m.index + url.length;
  }
  return out + esc(src.slice(last));
}

/* ---------- Recherche : texte sans accents ni majuscules, et surlignage ---------- */
/**
 * Texte « plié » (sans accents, en minuscules) et, pour chaque caractère plié, sa position dans le texte d'origine.
 * @param {string} s texte d'origine
 * @returns {{t: string, pos: number[]}} pos a un élément de plus que t (fin du texte)
 */
function plie(s) {
  let t = '', i = 0;
  const pos = [];
  for (const ch of String(s ?? '')) {
    const n = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (let k = 0; k < n.length; k++) { t += n[k]; pos.push(i); }
    i += ch.length;
  }
  pos.push(i);
  return { t, pos };
}
/**
 * Passages du texte qui contiennent le mot cherché (sans tenir compte des accents ni des majuscules).
 * @param {string} s texte
 * @param {string} q mot cherché
 * @returns {Array<[number, number]>} débuts et fins dans le texte d'origine
 */
function passages(s, q) {
  const { t, pos } = plie(s), k = plie(q).t;
  const out = [];
  if (!k) return out;
  for (let j = t.indexOf(k); j >= 0; j = t.indexOf(k, j + k.length)) out.push([pos[j], pos[j + k.length]]);
  return out;
}
/** Texte échappé, avec le mot cherché surligné (<mark>). */
function surligneHtml(s, q) {
  const src = String(s ?? '');
  let out = '', last = 0;
  for (const [a, b] of passages(src, q)) { out += `${esc(src.slice(last, a))}<mark class="msg-mark">${esc(src.slice(a, b))}</mark>`; last = b; }
  return out + esc(src.slice(last));
}
/** Extrait d'un message pour la liste des résultats : centré sur le mot trouvé quand il est loin dans le message. */
function extrait(body, q) {
  const s = String(body ?? '').replace(/\s+/g, ' ');
  const i = passages(s, q)[0]?.[0] ?? 0;
  return i > 34 ? `…${s.slice(s.lastIndexOf(' ', i - 20) + 1)}` : s;
}

/* ---------- Données ---------- */
/** Charge l'annuaire des membres (pseudo, avatar, couleur) dans S.members. Lève une erreur si la RPC échoue. */
async function loadMembers() {
  const { data, error } = await sb.rpc('hg_members');
  if (error) throw error;
  S.members = new Map((data || []).map((m) => [m.id, m]));
}
/** Charge la liste de mes conversations (hg_my_conversations) dans S.convs. Lève une erreur si la RPC échoue. */
async function loadConvs() {
  const { data, error } = await sb.rpc('hg_my_conversations');
  if (error) throw error;
  S.convs = data || [];
}
/**
 * Lit tous les messages d'une conversation qui suivent l'identifiant after, par pages de 500.
 * Limite : 20 pages au plus (10 000 messages par passe).
 * @param {string} conv identifiant de la conversation
 * @param {number} after identifiant du dernier message déjà connu (0 = depuis le début)
 * @returns {Promise<Array<object>>} messages, dans l'ordre
 */
async function fetchMessages(conv, after) {
  const all = [];
  for (let i = 0; i < 20; i++) { // pages de 500 (limite côté base)
    const { data, error } = await sb.rpc('hg_get_messages', { p_conv: conv, p_after: after, p_limit: 500 });
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < 500) break;
    after = rows[rows.length - 1].id;
  }
  return all;
}
/** Marque une conversation comme lue côté serveur, puis remet son compteur à zéro localement. */
async function markRead(conv) {
  const { error } = await sb.rpc('hg_mark_read', { p_conv: conv });
  if (error) { console.warn('[hg_mark_read]', error); return; }
  const c = convOf(conv); if (c) c.unread = 0;
  refreshUnread();
}

/* ---------- Squelette ---------- */
/**
 * Dessine la structure de la page : en-tête, colonne des conversations, zone du fil (vide au départ),
 * et la note sur la consultation des messages par l’admin. Le bouton « Nouveau message » est branché ici.
 */
function renderShell() {
  app.innerHTML = `
    <div class="page-head msg-head">
      <div>
        <div class="eyebrow">Entre nous</div>
        <h1 class="page-title">Messages</h1>
      </div>
      <div class="btn-row msg-head-actions">
        <button class="btn btn-ghost" type="button" id="msg-new-group">${I.group}<span>Nouveau groupe</span></button>
        <button class="btn btn-primary" type="button" id="msg-new" aria-label="Nouveau message">${I.plus}<span>Nouveau message</span></button>
      </div>
    </div>
    <div class="msg-app" id="msg-app" data-view="list">
      <section class="msg-side" aria-labelledby="msg-side-t">
        <h2 id="msg-side-t" class="visually-hidden">Conversations</h2>
        <form class="msg-cherche" id="msg-cherche" role="search">
          <label class="visually-hidden" for="msg-q">Chercher dans mes messages</label>
          <span class="msg-cherche-ic" aria-hidden="true">${I.search}</span>
          <input id="msg-q" type="search" placeholder="Chercher dans mes messages…" autocomplete="off" maxlength="80">
          <button type="button" class="btn btn-ghost msg-icon-btn" id="msg-q-x" aria-label="Effacer la recherche" hidden>${I.close}</button>
        </form>
        <ul class="msg-convs" id="msg-convs"></ul>
      </section>
      <section class="msg-main" id="msg-main" aria-labelledby="msg-thread-t">
        <div class="msg-placeholder">
          <span class="msg-placeholder-icon">${I.chat}</span>
          <h2 id="msg-thread-t">Choisis une conversation</h2>
          <p class="muted">Ou écris à un membre avec « Nouveau message ».</p>
        </div>
      </section>
    </div>
    <p class="muted small msg-admin-note">${I.lock}<span>Les messages peuvent être consultés par l’admin. <a href="/pages/infos/legal.html#confidentialite">En savoir plus</a></span></p>`;
  $('#msg-new').addEventListener('click', openNewDialog);
  $('#msg-new-group').addEventListener('click', () => G.openGroupCreate({ members: S.members, me, onCreated: reopen }));
  bindSearch();
}
/** Recharge la liste puis ouvre (ou rouvre) la conversation id : après création, ajout, renommage ou sourdine. */
async function reopen(id) {
  try { await loadConvs(); } catch (e) { toast(errMsg(e), 'error'); }
  renderConvs();
  if (id && convOf(id)) await openConv(id, { focus: false });
}

/* ---------- Liste des conversations ---------- */
/**
 * Avatar d'une conversation. Dans un Secret Santa, la cible voit un masque (le Santa reste anonyme),
 * et le Santa voit son propre avatar avec un petit masque.
 * @param {object} c la conversation
 * @param {number} [size=44] taille en pixels
 * @returns {string} HTML
 */
function convAvatar(c, size = 44) {
  if (G.isGroup(c)) return G.groupAvatarHtml(c, S.members, size);
  const side = santaSide(c);
  if (side === 'target') return `<span class="msg-av msg-av-santa" style="width:${size}px;height:${size}px" aria-hidden="true">${I.mask}</span>`;
  const m = memberOf(c.other_id) || { pseudo: c.title };
  if (isSupport(c)) return `<span class="msg-av-wrap">${avatarHtml(m, size)}<span class="msg-av-badge is-support" aria-hidden="true">${I.help}</span></span>`;
  // Conversation simple : pastille « en ligne » (jamais pour le Secret Santa : l'anonymat d'abord)
  return side === 'santa'
    ? `<span class="msg-av-wrap">${avatarHtml(m, size)}<span class="msg-av-badge" aria-hidden="true">${I.mask}</span></span>`
    : (c.other_id ? avatarPresence(avatarHtml(m, size), c.other_id) : avatarHtml(m, size));
}
/** Étiquette d'une conversation dans la liste : Secret Santa, assistance, groupe ou sortie (vide pour une conversation simple). */
function convTagHtml(c) {
  const side = santaSide(c);
  return side === 'target' ? '<span class="msg-tag">Anonyme</span>' : side === 'santa' ? '<span class="msg-tag">Tu es son Santa</span>'
    : isSupport(c) ? '<span class="msg-tag is-support">Assistance</span>'
    : G.isGroup(c) ? `<span class="msg-tag is-group">${c.event_id ? 'Sortie' : 'Groupe'} · ${Number(c.members_count) || 0}${G.muteLabel(c.muted_until) ? ' · en sourdine' : ''}</span>` : '';
}
/** Dessine la liste des conversations (aperçu, heure, non-lus, étiquette Secret Santa) et branche les clics. Pendant une recherche : les résultats. */
function renderConvs() {
  const ul = $('#msg-convs'); if (!ul) return;
  if (S.search.q) { renderResults(ul); return; }
  ul.removeAttribute('aria-label');
  if (!S.convs.length) {
    ul.innerHTML = `<li class="msg-convs-empty"><div class="empty">Aucune conversation pour l’instant.<br>Lance-toi avec « Nouveau message ».</div></li>`;
    return;
  }
  ul.innerHTML = S.convs.map((c) => {
    const side = santaSide(c);
    const unread = c.id === S.current ? 0 : (c.unread || 0);
    const preview = c.last_body ? `${c.last_mine ? 'Toi : ' : ''}${c.last_body}` : 'Pas encore de message';
    const tag = convTagHtml(c);
    return `<li>
      <button type="button" class="msg-conv${side ? ' is-santa' : ''}${unread ? ' is-unread' : ''}" data-conv="${esc(c.id)}"${c.id === S.current ? ' aria-current="true"' : ''}>
        ${convAvatar(c)}
        <span class="msg-conv-body">
          <span class="msg-conv-top"><span class="msg-conv-title">${esc(c.title)}</span><time class="msg-conv-time" datetime="${esc(c.last_message_at)}">${esc(relTime(c.last_message_at))}</time></span>
          <span class="msg-conv-bottom"><span class="msg-conv-preview">${esc(preview.replace(/\s+/g, ' '))}</span>${unread ? `<span class="msg-unread" aria-label="${unread} non lu${unread > 1 ? 's' : ''}">${unread > 99 ? '99+' : unread}</span>` : ''}</span>
          ${tag}
        </span>
      </button>
    </li>`;
  }).join('');
  ul.querySelectorAll('[data-conv]').forEach((b) => b.addEventListener('click', () => openConv(b.dataset.conv)));
}

/* ---------- Recherche dans toutes mes conversations (hg_search_messages, migration 203) ---------- */
let searchTimer = null;
/** Branche le champ de recherche en haut de la liste : recherche 300 ms après la frappe, Échap ou la croix pour effacer. */
function bindSearch() {
  const input = $('#msg-q'), clear = $('#msg-q-x');
  input.addEventListener('input', () => {
    clear.hidden = !input.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); clearSearch(); } });
  $('#msg-cherche').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(searchTimer); runSearch(); });
  clear.addEventListener('click', () => { clearSearch(); input.focus(); });
}
/** Vide le champ et revient à la liste des conversations. */
function clearSearch() {
  clearTimeout(searchTimer);
  $('#msg-q').value = ''; $('#msg-q-x').hidden = true;
  runSearch();
}
/** Lance la recherche du texte saisi. Seule la réponse de la dernière recherche lancée est affichée. */
async function runSearch() {
  const q = ($('#msg-q')?.value || '').trim();
  const seq = ++S.search.seq;
  Object.assign(S.search, { q, res: null, err: '', etat: !q ? '' : q.length < SEARCH_MIN ? 'court' : 'charge' });
  renderConvs();
  if (S.search.etat !== 'charge') return;
  try {
    const { data, error } = await sb.rpc('hg_search_messages', { p_q: q, p_conv: null });
    if (error) throw error;
    if (seq !== S.search.seq) return;
    Object.assign(S.search, { res: Array.isArray(data) ? data : [], etat: '' });
  } catch (e) {
    if (seq !== S.search.seq) return;
    Object.assign(S.search, { etat: 'erreur', err: errMsg(e) });
  }
  renderConvs();
}
/** Résultats de la recherche dans la colonne de gauche (à la place des conversations). Un clic ouvre le message à sa place. */
function renderResults(ul) {
  const { q, etat, res, err } = S.search;
  ul.setAttribute('aria-label', 'Résultats de la recherche');
  if (etat === 'court') { ul.innerHTML = `<li class="msg-res-info">Tape au moins ${SEARCH_MIN} lettres.</li>`; return; }
  if (etat === 'charge') { ul.innerHTML = '<li class="msg-res-info" role="status"><span class="msg-spinner" aria-hidden="true"></span> Recherche…</li>'; return; }
  if (etat === 'erreur') { ul.innerHTML = `<li class="msg-res-info" role="alert">La recherche n’a pas abouti : ${esc(err)}</li>`; return; }
  if (!res?.length) {
    ul.innerHTML = `<li class="msg-res-info" role="status">Aucun message ne contient « ${esc(q)} ».<br><span class="small muted">La recherche couvre tes conversations, tes groupes et l’assistance.</span></li>`;
    return;
  }
  const n = res.length;
  ul.innerHTML = `<li class="msg-res-info" role="status">${n === 1 ? '1 message trouvé' : n >= 50 ? '50 messages trouvés, les plus récents' : `${n} messages trouvés`}</li>`
    + res.map((r) => {
      const c = convOf(r.conversation_id) || { id: r.conversation_id, kind: r.conv_kind, title: r.conv_title };
      return `<li>
        <button type="button" class="msg-conv msg-res${santaSide(c) ? ' is-santa' : ''}" data-res-conv="${esc(c.id)}" data-res-msg="${esc(r.message_id)}">
          ${convAvatar(c)}
          <span class="msg-conv-body">
            <span class="msg-conv-top"><span class="msg-conv-title">${esc(c.title)}</span><time class="msg-conv-time" datetime="${esc(r.created_at)}">${esc(relTime(r.created_at))}</time></span>
            <span class="msg-res-txt"><b>${esc(r.mine ? 'Toi' : r.sender_label)} :</b> ${surligneHtml(extrait(r.body, q), q)}</span>
            ${convTagHtml(c)}
          </span>
        </button>
      </li>`;
    }).join('');
  ul.querySelectorAll('[data-res-conv]').forEach((b) => b.addEventListener('click', () => openFound(b.dataset.resConv, Number(b.dataset.resMsg))));
}
/** Ouvre la conversation d'un résultat et amène le message trouvé au milieu du fil, encadré. */
async function openFound(conv, msgId) {
  await openConv(conv, { focus: false });
  if (S.current !== conv) return;
  showRow($(`#msg-thread .msg-row[data-id="${msgId}"]`));
}
/** Fait défiler le fil jusqu'à une bulle (un peu sous le haut) et l'encadre ; retire l'encadré précédent. */
function showRow(row) {
  const box = $('#msg-thread'); if (!box) return;
  box.querySelectorAll('.msg-row.is-trouve').forEach((r) => r.classList.remove('is-trouve'));
  if (!row) return;
  row.classList.add('is-trouve');
  box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - 80;
}

/* ---------- Fil ---------- */
/**
 * En-tête du fil : retour (mobile), avatar, titre et sous-titre selon le côté Secret Santa.
 * @param {object} c la conversation
 * @returns {string} HTML
 */
function threadHeadHtml(c) {
  const side = santaSide(c);
  const sub = side === 'target' ? 'Secret Santa · son identité reste secrète jusqu’à la révélation'
    : side === 'santa' ? 'Secret Santa · tu apparais comme « Ton Santa »'
    : isSupport(c) ? 'Assistance · conversation privée avec le Staff'
    : G.isGroup(c) ? `${G.groupSubtitle(c)}${G.muteLabel(c.muted_until) ? ` · ${G.muteLabel(c.muted_until).toLowerCase()}` : ''}`
    : 'Conversation privée';
  return `
    <header class="msg-thread-head${side ? ' is-santa' : ''}">
      <button class="btn btn-ghost msg-icon-btn msg-back" type="button" id="msg-back" aria-label="Retour aux conversations">${I.back}</button>
      ${convAvatar(c, 40)}
      <div class="msg-thread-who">
        <h2 id="msg-thread-t" class="msg-thread-title">${esc(c.title)}</h2>
        <p class="msg-thread-sub">${esc(sub)}</p>
      </div>
      <button class="btn btn-ghost msg-icon-btn" type="button" id="msg-find" aria-label="Chercher dans cette conversation" aria-expanded="false" aria-controls="msg-cherche-fil">${I.search}</button>
      ${G.isGroup(c) ? `<button class="btn btn-ghost msg-icon-btn" type="button" id="msg-group-info" aria-label="Membres et réglages du groupe">${I.users}</button>` : ''}
    </header>`;
}
/**
 * Dessine le fil d'une conversation ouverte : en-tête, zone des messages (en attente), et formulaire d'envoi.
 * Le texte d'invite change selon le côté Secret Santa, pour ne jamais révéler l'identité du Santa.
 * @param {object} c la conversation
 */
function renderThreadShell(c) {
  const main = $('#msg-main');
  const side = santaSide(c);
  const ph = side === 'target' ? 'Écris à ton Santa…' : side === 'santa' ? `Écris à ${c.title.replace(/^Ta cible : /, '')} (anonyme)…`
    : isSupport(c) ? 'Écris ta réponse…' : G.isGroup(c) ? 'Écris au groupe…' : `Écris à ${c.title}…`;
  main.innerHTML = `
    ${threadHeadHtml(c)}
    ${isSupport(c) ? '<section class="msg-support-sum" id="msg-support-sum" aria-label="Résumé de la demande d’assistance"><p class="msg-support-load">Chargement de la demande…</p></section>' : ''}
    <div class="msg-thread" id="msg-thread" role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages" tabindex="0">
      <div class="msg-loading" role="status"><span class="msg-spinner" aria-hidden="true"></span> Chargement…</div>
    </div>
    <form class="msg-compose" id="msg-compose" novalidate>
      <label class="visually-hidden" for="msg-input">Ton message</label>
      <textarea id="msg-input" rows="1" maxlength="${MAX_LEN}" placeholder="${esc(ph)}" aria-describedby="msg-hint msg-count"></textarea>
      <button class="btn btn-primary msg-send" type="submit" id="msg-send" aria-label="Envoyer" disabled>${I.send}</button>
      <div class="msg-compose-foot">
        <span id="msg-hint" class="msg-hint">Entrée pour envoyer · Maj + Entrée pour aller à la ligne</span>
        <span class="msg-adm">Les messages peuvent être consultés par l’admin.</span>
        <span id="msg-count" class="msg-count" aria-live="polite">0 / ${MAX_LEN}</span>
      </div>
    </form>`;
  $('#msg-back').addEventListener('click', backToList);
  S.find = null;
  $('#msg-find').addEventListener('click', () => ($('#msg-cherche-fil') ? closeFind() : openFind()));
  $('#msg-group-info')?.addEventListener('click', () => G.openGroupPanel(c.id, { members: S.members, me,
    onChange: () => reopen(c.id), onLeft: async () => { backToList(); await reopen(null); } }));
  if (isSupport(c)) loadSupportSummary(c.id);
  const ta = $('#msg-input');
  ta.addEventListener('input', onInput);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('#msg-compose').addEventListener('submit', (e) => { e.preventDefault(); send(); });
}
/* ---------- Résumé d'une demande d'assistance (en haut de la conversation) ---------- */
/** Libellés et tons des statuts d'une demande d'assistance. */
const SUPPORT_STATE = { ouverte: ['Ouverte', 'is-open'], encours: ['En cours', 'is-progress'], traitee: ['Traitée', 'is-done'] };
const sumDateFmt = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/**
 * Charge (hg_support_summary) et affiche le résumé de la demande : sujet, statut, auteur, date et message d'origine.
 * Un long message est replié (« Lire toute la demande »).
 * @param {string} conv identifiant de la conversation d'assistance
 */
async function loadSupportSummary(conv) {
  const box = $('#msg-support-sum'); if (!box) return;
  let d;
  try {
    const { data, error } = await sb.rpc('hg_support_summary', { p_conv: conv });
    if (error) throw error;
    d = data;
  } catch (e) {
    if (S.current === conv) box.innerHTML = `<p class="msg-support-load">Résumé indisponible : ${esc(errMsg(e))}</p>`;
    return;
  }
  if (S.current !== conv || !$('#msg-support-sum')) return;
  if (!d || d.missing) { box.innerHTML = `<p class="msg-support-load">La demande d’origine n’existe plus.</p>`; return; }
  const [label, tone] = SUPPORT_STATE[d.status] || SUPPORT_STATE.ouverte;
  const msg = String(d.message || '');
  const long = msg.length > 280;
  const by = d.taken_by ? ` · prise en charge par ${esc(d.taken_by)}` : '';
  box.innerHTML = `
    <div class="msg-support-top"><span class="msg-support-eyebrow">${I.help} Demande d’assistance</span><span class="msg-support-state ${tone}">${esc(label)}</span></div>
    <h3 class="msg-support-subject">${esc(d.subject || '')}</h3>
    <p class="msg-support-meta">Envoyée par ${esc(d.author || 'un membre')} le ${esc(sumDateFmt.format(new Date(d.created_at)))}${by}</p>
    ${long
      ? `<details class="msg-support-msg"><summary><span class="msg-support-text">${esc(msg.slice(0, 260))}…</span><span class="msg-support-more">Lire toute la demande</span></summary><p class="msg-support-text">${esc(msg)}</p></details>`
      : `<p class="msg-support-text">${esc(msg)}</p>`}`;
}

/** Ajuste la hauteur de la zone de saisie, le compteur de caractères, et l'état du bouton d'envoi. */
function onInput() {
  const ta = $('#msg-input'); if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 200)}px`;
  const n = ta.value.length;
  const cnt = $('#msg-count');
  cnt.textContent = `${n} / ${MAX_LEN}`;
  cnt.classList.toggle('is-near', n > MAX_LEN * 0.9);
  $('#msg-send').disabled = S.sending || !ta.value.trim();
}

/**
 * Bulle d'un message. Le nom de l'expéditeur n'apparaît que pour le premier message d'un groupe.
 * Un message « sameGroup » (même auteur, moins de 5 min, même jour) est collé au précédent.
 * @param {object} m le message
 * @param {object|null} prev le message précédent (pour regrouper)
 * @param {object} c la conversation
 * @returns {string} HTML
 */
function bubbleHtml(m, prev, c) {
  if (m.system) return G.systemRowHtml(m);
  const isSanta = !m.mine && santaSide(c) === 'target' && m.sender_label === 'Ton Santa';
  const sameGroup = prev && !prev.system && prev.mine === m.mine && prev.sender_label === m.sender_label
    && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000 && dayDiff(prev.created_at) === dayDiff(m.created_at);
  const label = !m.mine && !sameGroup
    ? `<span class="msg-sender${isSanta ? ' is-santa' : ''}">${isSanta ? I.mask : ''}${esc(m.sender_label)}</span>` : '';
  const d = new Date(m.created_at);
  // Groupe : avatar et pseudo de l'auteur (couleur du membre) pour les messages des autres.
  const who = G.isGroup(c) && !m.mine && m.sender_id ? memberOf(m.sender_id) : null;
  const glabel = who && !sameGroup ? `<span class="msg-sender msg-sender-grp" style="--who:${esc(/^#[0-9a-f]{6}$/i.test(who.color || '') ? who.color : 'var(--muted)')}">${esc(m.sender_label)}</span>` : '';
  const hidden = S.hidden?.has(Number(m.id)); // A6 : message masqué par le Staff
  const bubble = `<div class="msg-bubble"><span class="visually-hidden">${m.mine ? 'Toi' : esc(m.sender_label)} : </span><span class="msg-text">${linkify(m.body)}</span>
      <time class="msg-time" datetime="${esc(m.created_at)}" title="${esc(fullFmt.format(d))}">${esc(timeFmt.format(d))}</time></div>`;
  // Message d'un autre membre (sauf conversation d'assistance) : menu « … » avec « Signaler »
  const canReport = !m.mine && !hidden && c?.kind !== 'support';
  // Réactions (sauf assistance et message masqué) : bouton au survol (bureau), appui long sur la bulle (téléphone)
  const add = canReact(c) && !hidden
    ? '<button type="button" class="msg-react-add" aria-label="Réagir à ce message" aria-haspopup="true" aria-expanded="false">' + I.smile + '</button>' : '';
  const line = canReport ? `<div class="msg-line">${bubble}${add}${reportButtonHtml('message', m.id, 'message')}</div>`
    : add ? `<div class="msg-line">${m.mine ? add + bubble : bubble + add}</div>` : bubble;
  return `<div class="msg-row ${m.mine ? 'is-mine' : 'is-other'}${isSanta ? ' is-santa' : ''}${sameGroup ? ' is-cont' : ''}${who ? ' is-grp' : ''}${hidden ? ' is-hidden' : ''}" data-id="${esc(m.id)}">
    ${who ? `<span class="msg-row-av" aria-hidden="true">${sameGroup ? '' : avatarHtml(who, 28)}</span><div class="msg-row-col">${glabel}` : label}
    ${line}
    ${add ? `<div class="msg-reacts">${reactsHtml(m.id)}</div>` : ''}
    ${hidden && m.mine ? '<span class="small muted msg-hidden-note">Masqué par le Staff : l’autre personne ne le voit plus.</span>' : ''}
    ${who ? '</div>' : ''}
  </div>`;
}
/**
 * HTML d'une suite de messages, avec un séparateur à chaque changement de jour.
 * @param {Array<object>} list messages à afficher
 * @param {object|null} prevMsg message qui précède la liste (pour le regroupement)
 * @param {object} c la conversation
 * @returns {string} HTML
 */
function messagesHtml(list, prevMsg, c) {
  let html = '', prev = prevMsg;
  for (const m of list) {
    if (!prev || dayDiff(prev.created_at) !== dayDiff(m.created_at)) {
      html += `<div class="msg-day" role="separator"><span>${esc(dayLabel(m.created_at))}</span></div>`;
    }
    html += bubbleHtml(m, prev, c);
    prev = m;
  }
  return html;
}
/** Remplace tout le contenu du fil par les messages chargés, ou par un texte d'accueil s'il n'y en a aucun. */
function renderMessages() {
  const box = $('#msg-thread'); if (!box) return;
  const c = convOf(S.current);
  if (!S.msgs.length) {
    const side = santaSide(c);
    box.innerHTML = `<div class="msg-thread-empty">${side === 'target'
      ? 'Ton Santa ne t’a pas encore écrit. Tu peux lui poser une question : il ne saura pas que tu as deviné, et tu ne sauras pas qui il est.'
      : side === 'santa' ? 'Ta cible ne saura pas que c’est toi : tes messages s’affichent comme « Ton Santa ».'
      : G.isGroup(c) ? 'Aucun message pour l’instant. Lance la discussion !'
      : 'Aucun message pour l’instant. Dis bonjour !'}</div>`;
    return;
  }
  box.innerHTML = messagesHtml(S.msgs, null, c);
  scrollBottom(true);
}
/**
 * Ajoute de nouveaux messages en bas du fil. Ne fait défiler que si mon message vient d'être envoyé,
 * ou si la personne était déjà en bas (pour ne pas la déranger en pleine lecture).
 * @param {Array<object>} list nouveaux messages
 */
function appendMessages(list) {
  const box = $('#msg-thread'); if (!box || !list.length) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (!S.msgs.length) box.innerHTML = '';
  const prev = S.msgs[S.msgs.length - 1] || null;
  box.insertAdjacentHTML('beforeend', messagesHtml(list, prev, convOf(S.current)));
  S.msgs.push(...list);
  if (list.some((m) => m.mine)) scrollBottom(true);
  else if (nearBottom) scrollBottom();
}
/**
 * Fait défiler le fil jusqu'en bas.
 * @param {boolean} [instant=false] true : sans animation
 */
function scrollBottom(instant = false) {
  const box = $('#msg-thread'); if (!box) return;
  box.scrollTo({ top: box.scrollHeight, behavior: instant ? 'auto' : 'smooth' });
}

/* ---------- Réactions (migration 204) ----------
   Lues par hg_message_reactions_get (membres de la conversation seulement ; le Santa s'affiche « Ton Santa »),
   posées ou retirées par hg_message_react. Aucune notification, aucun non-lu, la conversation ne remonte pas. */
const listeFr = new Intl.ListFormat('fr', { type: 'conjunction' });
/** Vrai si l'on peut réagir dans cette conversation (jamais dans l'assistance). */
function canReact(c) { return !!c && !isSupport(c); }
/** Qui a mis une réaction, en toutes lettres : « Bruno, Léo et toi ». */
function quiTexte(x) { return listeFr.format(x.mine ? [...x.qui, 'toi'] : x.qui); }
/**
 * Puces des réactions d'un message, dans l'ordre de la palette : émoji, nombre, et « j'ai réagi » (aria-pressed).
 * @param {number|string} id identifiant du message
 * @returns {string} HTML
 */
function reactsHtml(id) {
  const e = S.reacts.get(Number(id)); if (!e) return '';
  return REACTIONS.filter((emo) => e.has(emo)).map((emo) => {
    const x = e.get(emo), n = x.qui.length + (x.mine ? 1 : 0);
    return `<button type="button" class="msg-react" data-react="${esc(emo)}" aria-pressed="${x.mine}" aria-label="${esc(`${emo} : ${quiTexte(x)}. ${x.mine ? 'Retirer ta réaction' : 'Réagir aussi'}`)}">${esc(emo)}<span aria-hidden="true">${n}</span></button>`;
  }).join('');
}
/**
 * Lit les réactions d'une conversation dans S.reacts. Rien pour l'assistance.
 * @param {string} conv identifiant de la conversation
 * @returns {Promise<boolean>} true si elles ont changé depuis la dernière lecture
 */
async function loadReactions(conv) {
  if (!canReact(convOf(conv))) return false;
  const { data, error } = await sb.rpc('hg_message_reactions_get', { p_conv: conv });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const key = JSON.stringify(rows);
  if (S.current !== conv || key === S.reactsKey) return false;
  const map = new Map();
  for (const r of rows) {
    const id = Number(r.message_id);
    if (!map.has(id)) map.set(id, new Map());
    const e = map.get(id);
    if (!e.has(r.emoji)) e.set(r.emoji, { mine: false, qui: [] });
    if (r.mine) e.get(r.emoji).mine = true; else e.get(r.emoji).qui.push(r.label);
  }
  S.reacts = map; S.reactsKey = key;
  return true;
}
/** Relit les réactions de la conversation ouverte (avec l'actualisation du fil) et redessine les puces si elles ont changé. */
async function pollReactions() {
  const conv = S.current;
  if (!conv || S.loadingThread || S.reactBusy) return;
  try { if (await loadReactions(conv) && !S.reactBusy) paintReactions(); } catch (e) { console.warn('[messages] réactions', e); }
}
/** Redessine les puces de réactions d'une bulle, ou de tout le fil. */
function paintReactions(row = null) {
  const box = $('#msg-thread'); if (!box) return;
  for (const r of row ? [row] : box.querySelectorAll('.msg-row')) {
    const el = r.querySelector('.msg-reacts');
    if (el) el.innerHTML = reactsHtml(r.dataset.id);
  }
}
/** Pose ou retire localement ma réaction emo sur le message id. */
function basculeLocal(id, emo) {
  const e = S.reacts.get(id) || new Map();
  const x = e.get(emo) || { mine: false, qui: [] };
  x.mine = !x.mine;
  if (x.mine || x.qui.length) e.set(emo, x); else e.delete(emo);
  if (e.size) S.reacts.set(id, e); else S.reacts.delete(id);
}
/**
 * Pose ou retire ma réaction (affichée tout de suite, annulée si le serveur refuse), puis remet le focus sur la puce.
 * @param {HTMLElement} row la bulle (.msg-row)
 * @param {string} emo l'émoji
 * @param {HTMLElement|null} [fallback] élément à focaliser si la puce a disparu
 */
async function react(row, emo, fallback = null) {
  const conv = S.current, id = Number(row?.dataset.id);
  if (!conv || !id || !REACTIONS.includes(emo)) return;
  const refocus = () => (row.querySelector(`.msg-react[data-react="${emo}"]`) || fallback)?.focus();
  basculeLocal(id, emo); paintReactions(row); refocus();
  S.reactBusy = (S.reactBusy || 0) + 1;
  try {
    const { error } = await sb.rpc('hg_message_react', { p_message: id, p_emoji: emo });
    if (error) throw error;
    S.reactsKey = ''; // la prochaine lecture redessine avec l'état du serveur
  } catch (e) {
    if (S.current === conv) { basculeLocal(id, emo); paintReactions(row); }
    toast(`Réaction impossible : ${errMsg(e)}`, 'error');
  } finally { S.reactBusy--; }
}
/**
 * Ouvre la palette des six réactions au-dessus de la bulle (en dessous s'il n'y a pas la place).
 * @param {HTMLElement} row la bulle (.msg-row)
 * @param {HTMLElement|null} [opener] bouton qui l'a ouverte (reçoit le focus à la fermeture)
 */
function openPicker(row, opener = null) {
  closePicker();
  const e = S.reacts.get(Number(row.dataset.id));
  const p = document.createElement('div');
  p.className = 'msg-react-pick'; p.setAttribute('role', 'group'); p.setAttribute('aria-label', 'Choisir une réaction');
  p.innerHTML = REACTIONS.map((emo) => `<button type="button" data-pick="${esc(emo)}" aria-pressed="${!!e?.get(emo)?.mine}" aria-label="${esc(emo)}">${esc(emo)}</button>`).join('');
  row.classList.add('is-pick'); row.append(p);
  const box = $('#msg-thread');
  if (box && row.getBoundingClientRect().top - box.getBoundingClientRect().top < 64) p.classList.add('is-bas');
  opener?.setAttribute('aria-expanded', 'true');
  S.picker = { row, p, opener };
  p.querySelector('button').focus();
}
/** Ferme la palette ouverte ; refocus : rend le focus au bouton qui l'a ouverte. */
function closePicker(refocus = false) {
  const k = S.picker; if (!k) return;
  S.picker = null;
  k.p.remove(); k.row.classList.remove('is-pick');
  k.opener?.setAttribute('aria-expanded', 'false');
  if (refocus) k.opener?.focus();
}
/** Bulle « qui a réagi » sous une puce (survol, focus, ou appui long au téléphone). */
function showQui(chip) {
  hideQui();
  const row = chip.closest('.msg-row'), x = S.reacts.get(Number(row?.dataset.id))?.get(chip.dataset.react);
  if (!x) return;
  const qui = quiTexte(x);
  const t = document.createElement('div');
  t.className = 'msg-react-qui'; t.setAttribute('role', 'status');
  t.innerHTML = `<b>${esc(chip.dataset.react)}</b> ${esc(qui.charAt(0).toUpperCase() + qui.slice(1))}`;
  chip.parentElement.append(t);
}
/** Retire la bulle « qui a réagi ». */
function hideQui() { $('#msg-thread .msg-react-qui')?.remove(); }
/** Écouteurs des réactions, posés une fois sur la page (le fil est redessiné souvent). */
function bindReactions() {
  let press = null; // appui long en cours (téléphone)
  app.addEventListener('pointerdown', (e) => {
    clearTimeout(press?.t); press = null;
    if (e.pointerType === 'mouse') return;
    const chip = e.target.closest('.msg-react'), bub = e.target.closest('.msg-bubble');
    const row = (chip || bub)?.closest('.msg-row');
    if (!row || (!chip && !row.querySelector('.msg-react-add'))) return;
    const p = { x: e.clientX, y: e.clientY, fired: false };
    p.t = setTimeout(() => {
      p.fired = true;
      if (chip) { showQui(chip); setTimeout(hideQui, 4000); } else openPicker(row);
    }, LONG_PRESS_MS);
    press = p;
  });
  app.addEventListener('pointermove', (e) => { if (press && !press.fired && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) clearTimeout(press.t); });
  for (const ev of ['pointerup', 'pointercancel']) app.addEventListener(ev, () => { if (press && !press.fired) clearTimeout(press.t); });
  app.addEventListener('contextmenu', (e) => { if (press?.fired) e.preventDefault(); });
  app.addEventListener('click', (e) => {
    if (press?.fired) { press = null; e.preventDefault(); return; } // relâchement d'un appui long
    const inPick = e.target.closest('.msg-react-pick'), add = e.target.closest('.msg-react-add');
    if (S.picker && !inPick && add !== S.picker.opener) closePicker();
    if (add) { const row = add.closest('.msg-row'); if (S.picker?.row === row) closePicker(true); else openPicker(row, add); return; }
    const pick = e.target.closest('[data-pick]');
    if (pick && S.picker) { const { row, opener } = S.picker; closePicker(); react(row, pick.dataset.pick, opener); return; }
    const chip = e.target.closest('.msg-react');
    if (chip) react(chip.closest('.msg-row'), chip.dataset.react);
  });
  app.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.picker) { e.preventDefault(); closePicker(true); } });
  app.addEventListener('mouseover', (e) => { const chip = e.target.closest('.msg-react'); if (chip && !chip.parentElement.querySelector('.msg-react-qui')) showQui(chip); });
  app.addEventListener('mouseout', (e) => { const chip = e.target.closest('.msg-react'); if (chip && !chip.contains(e.relatedTarget)) hideQui(); });
  app.addEventListener('focusin', (e) => { if (e.target.matches?.('.msg-react')) showQui(e.target); });
  app.addEventListener('focusout', (e) => { if (e.target.matches?.('.msg-react')) hideQui(); });
}

/* ---------- Loupe : chercher dans la conversation ouverte ----------
   Tous les messages de la conversation sont déjà chargés : la recherche se fait sur place, sans accents ni majuscules.
   Mêmes règles que la recherche générale : 3 lettres au moins, messages masqués et messages système exclus. */
let findTimer = null;
/** Ouvre la barre de recherche sous l'en-tête du fil. */
function openFind() {
  const head = $('.msg-thread-head'); if (!head || $('#msg-cherche-fil')) return;
  head.insertAdjacentHTML('afterend', `
    <form class="msg-cherche-fil" id="msg-cherche-fil" role="search">
      <label class="visually-hidden" for="msg-q-fil">Chercher dans cette conversation</label>
      <input id="msg-q-fil" type="search" placeholder="Chercher dans cette conversation…" autocomplete="off" maxlength="80">
      <span class="msg-cherche-nb" id="msg-cherche-nb" role="status"></span>
      <button type="button" class="btn btn-ghost msg-icon-btn" id="msg-find-prev" aria-label="Résultat précédent" disabled>${I.up}</button>
      <button type="button" class="btn btn-ghost msg-icon-btn" id="msg-find-next" aria-label="Résultat suivant" disabled>${I.down}</button>
      <button type="button" class="btn btn-ghost msg-icon-btn" id="msg-find-close" aria-label="Fermer la recherche">${I.close}</button>
    </form>`);
  $('#msg-find').setAttribute('aria-expanded', 'true');
  const input = $('#msg-q-fil');
  input.addEventListener('input', () => { clearTimeout(findTimer); findTimer = setTimeout(runFind, 200); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(findTimer); if (!S.find) runFind(); else stepFind(e.shiftKey ? 1 : -1); }
  });
  $('#msg-cherche-fil').addEventListener('submit', (e) => e.preventDefault());
  $('#msg-find-prev').addEventListener('click', () => stepFind(-1));
  $('#msg-find-next').addEventListener('click', () => stepFind(1));
  $('#msg-find-close').addEventListener('click', closeFind);
  input.focus();
}
/** Ferme la barre, retire le surlignage, et rend le focus à la loupe. */
function closeFind() {
  clearTimeout(findTimer);
  clearMarks();
  S.find = null;
  $('#msg-cherche-fil')?.remove();
  const b = $('#msg-find'); b?.setAttribute('aria-expanded', 'false'); b?.focus();
}
/** Cherche le texte saisi dans les messages du fil, les surligne, et va au plus récent. */
function runFind() {
  clearMarks();
  const q = ($('#msg-q-fil')?.value || '').trim();
  if (q.length < SEARCH_MIN) { S.find = null; majFind(); return; }
  const ids = S.msgs.filter((m) => !m.system && !S.hidden?.has(Number(m.id)) && passages(m.body, q).length).map((m) => Number(m.id));
  const box = $('#msg-thread');
  for (const id of ids) { const t = box?.querySelector(`.msg-row[data-id="${id}"] .msg-text`); if (t) marque(t, q); }
  S.find = { ids, i: ids.length - 1 };
  majFind();
}
/** Met à jour le compteur (« 2 sur 5 »), les flèches, et amène le résultat courant à l'écran. */
function majFind() {
  const f = S.find, nb = $('#msg-cherche-nb'); if (!nb) return;
  nb.textContent = !f ? '' : f.ids.length ? `${f.i + 1} sur ${f.ids.length}` : 'Aucun';
  $('#msg-find-prev').disabled = !f || f.i <= 0;
  $('#msg-find-next').disabled = !f || f.i >= f.ids.length - 1;
  showRow(f?.ids.length ? $(`#msg-thread .msg-row[data-id="${f.ids[f.i]}"]`) : null);
}
/** Résultat précédent (-1, plus ancien) ou suivant (+1, plus récent). */
function stepFind(d) {
  const f = S.find; if (!f?.ids.length) return;
  f.i = Math.min(f.ids.length - 1, Math.max(0, f.i + d));
  majFind();
}
/** Surligne le mot cherché dans les textes d'un élément (sans toucher aux liens ni à la mise en forme). */
function marque(el, q) {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const s = node.textContent, ps = passages(s, q);
    if (!ps.length) continue;
    const frag = document.createDocumentFragment();
    let last = 0;
    for (const [a, b] of ps) {
      frag.append(s.slice(last, a));
      const mk = document.createElement('mark'); mk.className = 'msg-mark'; mk.textContent = s.slice(a, b);
      frag.append(mk); last = b;
    }
    frag.append(s.slice(last));
    node.replaceWith(frag);
  }
}
/** Retire le surlignage et l'encadré du fil. */
function clearMarks() {
  const box = $('#msg-thread'); if (!box) return;
  box.querySelectorAll('mark.msg-mark').forEach((mk) => { const p = mk.parentNode; mk.replaceWith(mk.textContent); p.normalize(); });
  box.querySelectorAll('.msg-row.is-trouve').forEach((r) => r.classList.remove('is-trouve'));
}

/* ---------- Navigation ---------- */
/**
 * Affiche la liste ou le fil. Sur mobile, le fil passe en plein écran (classe msg-fullscreen sur body).
 * @param {'list'|'thread'} v vue demandée
 */
function setView(v) {
  const el = $('#msg-app'); if (el) el.dataset.view = v;
  document.body.classList.toggle('msg-fullscreen', v === 'thread');
}
/** Met l'identifiant de la conversation dans l'adresse (?c=…), sans recharger la page. Pas d'historique ajouté. */
function setUrl(conv) {
  const u = new URL(location.href);
  u.searchParams.delete('to'); u.searchParams.delete('event');
  if (conv) u.searchParams.set('c', conv); else u.searchParams.delete('c');
  history.replaceState(null, '', u.pathname.split('/').pop() + u.search + u.hash);
}
/**
 * Ouvre une conversation : affiche le fil, charge les messages, marque comme lue, et lance le temps réel et les actualisations.
 * @param {string} id identifiant de la conversation
 * @param {{focus?: boolean}} [opts] focus : placer le curseur dans la zone de saisie (hors mobile)
 */
async function openConv(id, { focus = true } = {}) {
  let c = convOf(id);
  if (!c) {
    try { await loadConvs(); } catch (e) { toast(errMsg(e), 'error'); }
    c = convOf(id);
    if (!c) { toast('Conversation introuvable.', 'error'); setUrl(null); return; }
  }
  closePicker();
  S.current = id; S.msgs = []; S.lastId = 0; S.reacts = new Map(); S.reactsKey = '';
  setUrl(id);
  setView('thread');
  renderConvs();
  renderThreadShell(c);
  S.loadingThread = true;
  try {
    const [rows, hid] = await Promise.all([fetchMessages(id, 0),
      sb.rpc('hg_conv_hidden', { p_conv: id }).then((r) => r.data || [], () => []), // A6 : messages masqués
      loadReactions(id).catch((e) => console.warn('[messages] réactions', e))]);
    if (S.current !== id) return;
    S.hidden = new Set((Array.isArray(hid) ? hid : []).map(Number));
    S.msgs = rows;
    S.lastId = rows.length ? rows[rows.length - 1].id : 0;
    renderMessages();
    markRead(id).then(renderConvs);
  } catch (e) {
    $('#msg-thread').innerHTML = `<div class="msg-thread-empty">Chargement impossible : ${esc(errMsg(e))}</div>`;
  } finally { S.loadingThread = false; }
  if (focus && !MOBILE.matches) $('#msg-input')?.focus();
  subscribeThreadRt(id);
  startThreadPolling();
}
/** Quitte le fil : arrête les actualisations et le temps réel de cette conversation, puis revient à la liste. */
function backToList() {
  closePicker();
  S.current = null; S.msgs = []; S.lastId = 0; S.reacts = new Map(); S.reactsKey = ''; S.find = null;
  stopThreadPolling();
  unsubscribeThreadRt();
  setUrl(null);
  setView('list');
  renderConvs();
  const main = $('#msg-main');
  main.innerHTML = `<div class="msg-placeholder"><span class="msg-placeholder-icon">${I.chat}</span><h2 id="msg-thread-t">Choisis une conversation</h2><p class="muted">Ou écris à un membre avec « Nouveau message ».</p></div>`;
  $('#msg-convs button')?.focus();
}

/* ---------- Envoi ---------- */
/**
 * Envoie le message saisi (RPC hg_send_message). Le bot anti-spam est prévenu côté serveur.
 * Après l'envoi, le fil est actualisé tout de suite et la conversation remonte en tête de liste.
 */
async function send() {
  const ta = $('#msg-input');
  const conv = S.current;
  if (!ta || !conv || S.sending) return;
  const body = ta.value.trim();
  if (!body) return;
  if (body.length > MAX_LEN) { toast(`${MAX_LEN} caractères maximum.`, 'error'); return; }
  S.sending = true; $('#msg-send').disabled = true;
  try {
    const { error } = await sb.rpc('hg_send_message', { p_conv: conv, p_body: body });
    if (error) throw error;
    ta.value = ''; onInput();
    notify('message_new', { conversation_id: conv }); // le bot décide (anti-spam côté serveur)
    for (let i = 0; polling && i < 50; i++) await new Promise((r) => setTimeout(r, 100)); // laisse finir une actualisation en cours
    await pollThread();
    const c = convOf(conv);
    if (c) { c.last_body = body.slice(0, 140); c.last_mine = true; c.last_message_at = new Date().toISOString(); }
    S.convs.sort((a, b) => new Date(b.last_message_at) - new Date(a.last_message_at));
    renderConvs();
  } catch (e) {
    toast(`Envoi impossible : ${errMsg(e)}`, 'error');
  } finally {
    S.sending = false; onInput(); ta.focus();
  }
}

/* ---------- Rafraîchissement ---------- */
let polling = false;
/**
 * Charge les nouveaux messages de la conversation ouverte (depuis S.lastId). Joue un son et marque comme lue
 * si un message arrive de l'autre. Une seule passe à la fois ; une demande pendant une passe en relance une autre.
 */
async function pollThread() {
  const conv = S.current;
  if (!conv || polling || S.loadingThread) return;
  polling = true;
  try {
    const rows = await fetchMessages(conv, S.lastId);
    if (S.current !== conv || !rows.length) return;
    const fresh = rows.filter((r) => r.id > S.lastId);
    if (!fresh.length) return;
    S.lastId = fresh[fresh.length - 1].id;
    appendMessages(fresh);
    const incoming = fresh.filter((m) => !m.mine);
    if (incoming.length) {
      playSound('message');
      const last = fresh[fresh.length - 1], c = convOf(conv);
      if (c) { c.last_body = last.body.slice(0, 140); c.last_mine = last.mine; c.last_message_at = last.created_at; }
      await markRead(conv);
      renderConvs();
    }
  } catch (e) { console.warn('[messages] actualisation', e); }
  finally {
    polling = false;
    if (pendingPull) { pendingPull = false; pollThread(); }
  }
}
/** Empreinte de ce que renderConvs affiche : sert à ne réécrire la liste que si quelque chose a changé. */
const convsKey = () => JSON.stringify([S.current, S.convs.map((c) => [c.id, c.title, c.kind, c.other_id, c.last_body, c.last_mine, c.last_message_at, c.unread])]);
/** Actualise la liste des conversations ; joue un son si un nouveau message non lu apparaît dans une autre conversation. */
async function pollList() {
  try {
    const before = new Map(S.convs.map((c) => [c.id, c.unread || 0]));
    const key = convsKey();
    await loadConvs();
    const gained = S.convs.some((c) => c.id !== S.current && (c.unread || 0) > (before.get(c.id) ?? 0));
    if (gained) { playSound('message'); refreshUnread(); }
    if (convsKey() !== key) renderConvs();
  } catch (e) { console.warn('[messages] liste', e); }
}
/** Lance l'actualisation du fil : cadence rapide sans temps réel, cadence de secours avec temps réel. */
function startThreadPolling() {
  stopThreadPolling();
  const ms = RT.threadOk ? POLL_SAFETY_MS : POLL_THREAD_MS;
  threadTimer = setInterval(() => { if (!document.hidden) { pollThread(); pollReactions(); } }, ms);
}
/** Arrête l'actualisation du fil. */
function stopThreadPolling() { clearInterval(threadTimer); threadTimer = null; }
/** Lance l'actualisation périodique de la liste des conversations (en pause quand l'onglet est caché). */
function startListPolling() {
  clearInterval(listTimer);
  listTimer = setInterval(() => { if (!document.hidden) pollList(); }, POLL_LIST_MS);
}

/* ---------- Temps réel (Supabase Realtime, Broadcast privé) ----------
   La base publie sur le canal « conv:<id> » un payload minimal après chaque message (trigger hg_msg_realtime,
   migration 025) : aucun expéditeur n'y figure. Seuls les membres de la conversation peuvent s'abonner (policy).
   Un événement déclenche le rechargement du fil par la RPC habituelle. Sans canal confirmé (échec, indisponible,
   ou client de test sans Realtime), les cadences d'interrogation d'origine restent en vigueur. */
/**
 * Abonne le fil de la conversation au canal temps réel. Un événement déclenche une actualisation immédiate.
 * En cas d'échec, l'actualisation périodique reste en place (aucune perte de messages).
 * @param {string} id identifiant de la conversation
 */
function subscribeThreadRt(id) {
  unsubscribeThreadRt();
  try {
    const ch = sb.channel(`conv:${id}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'new_message' }, requestThreadPull);
    RT.thread = ch;
    ch.subscribe((status) => {
      if (RT.thread !== ch) return; // canal remplacé ou fermé entre-temps
      const ok = status === 'SUBSCRIBED';
      if (RT.threadOk === ok) return;
      RT.threadOk = ok;
      if (ok) requestThreadPull(); // rattrape un message arrivé pendant l'abonnement
      if (S.current) startThreadPolling();
    });
  } catch (e) {
    console.warn('[messages] temps réel indisponible', e);
    RT.thread = null; RT.threadOk = false;
  }
}
/** Ferme le canal temps réel de la conversation précédente, s'il existe. */
function unsubscribeThreadRt() {
  const ch = RT.thread;
  RT.thread = null; RT.threadOk = false;
  if (ch) { try { sb.removeChannel(ch); } catch { /* sans effet */ } }
}
/** Actualisation du fil demandée par le temps réel ; si une passe est en cours, on en relance une à la fin. */
function requestThreadPull() {
  if (polling) { pendingPull = true; return; }
  pollThread();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  pollList();
  pollThread();
  pollReactions();
});

/* ---------- Nouveau message ---------- */
const dlg = $('#msg-new-dlg');
/**
 * Liste des membres proposés dans « Nouveau message », filtrée par la recherche (sans accents, sans casse).
 * @param {string} [q=''] texte de recherche
 */
function renderPick(q = '') {
  const ul = $('#msg-new-list');
  /** Texte normalisé (sans accents, en minuscules) pour la recherche de membres. */
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = [...S.members.values()].filter((m) => m.id !== me.id && norm(m.pseudo).includes(norm(q)))
    .sort((a, b) => String(a.pseudo).localeCompare(String(b.pseudo), 'fr'));
  ul.innerHTML = list.length
    ? list.map((m) => `<li><button type="button" class="msg-pick-btn" data-user="${esc(m.id)}">${avatarHtml(m, 36)}<span>${esc(m.pseudo)}</span></button></li>`).join('')
    : '<li class="muted small msg-pick-empty">Aucun membre trouvé.</li>';
  ul.querySelectorAll('[data-user]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const ok = await openDirect(b.dataset.user);
    if (ok) dlg.close(); else b.disabled = false;
  }));
}
/** Ouvre la fenêtre « Nouveau message » avec la liste complète des membres. */
function openNewDialog() {
  $('#msg-new-search').value = '';
  renderPick();
  dlg.showModal();
  $('#msg-new-search').focus();
}
$('#msg-new-search').addEventListener('input', (e) => renderPick(e.target.value));
$('#msg-new-form').addEventListener('submit', (e) => { if (e.submitter?.value !== 'cancel') e.preventDefault(); });

/**
 * Ouvre (ou crée) une conversation directe avec un membre (RPC hg_open_direct).
 * @param {string} userId identifiant du membre
 * @returns {Promise<boolean>} true si la conversation s'est ouverte
 */
async function openDirect(userId) {
  try {
    if (userId === me.id) throw new Error('Tu ne peux pas t’écrire à toi-même.');
    const { data, error } = await sb.rpc('hg_open_direct', { p_user: userId });
    if (error) throw error;
    const id = Array.isArray(data) ? data[0] : data;
    if (!id) throw new Error('Conversation non créée');
    if (!convOf(id)) await loadConvs();
    await openConv(id);
    return true;
  } catch (e) { toast(`Impossible d’ouvrir la conversation : ${errMsg(e)}`, 'error'); return false; }
}

/* ---------- Démarrage ---------- */
try {
  await Promise.all([loadMembers(), loadConvs()]);
  renderShell();
  renderConvs();
  bindReactions();
  const params = new URLSearchParams(location.search);
  const to = params.get('to'), c = params.get('c'), ev = params.get('event');
  const UUID = /^[0-9a-f-]{36}$/i;
  if (ev && UUID.test(ev)) { const id = await G.openEventConv(ev); if (id) await reopen(id); else setUrl(null); }
  else if (to && UUID.test(to)) {
    // Brouillon prérempli (?brouillon=, ex. « Demander un coup de main » de l'annuaire) : jamais envoyé sans la personne
    if (await openDirect(to)) {
      const draft = (params.get('brouillon') || '').slice(0, 500), input = $('#msg-input');
      if (draft && input && !input.value) { input.value = draft; input.dispatchEvent(new Event('input')); input.focus(); }
    }
  }
  else if (c && UUID.test(c)) await openConv(c, { focus: false });
  else if (!MOBILE.matches && S.convs.length) await openConv(S.convs[0].id, { focus: false });
  startListPolling();
} catch (e) {
  if (String(e?.message) !== 'redirect') {
    app.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Entre nous</div><h1 class="page-title">Messages</h1></div></div>
      <div class="card"><h2>Chargement impossible</h2><p class="muted">${esc(errMsg(e))}</p>
      <div class="btn-row"><button class="btn btn-primary" type="button" id="msg-retry">Réessayer</button></div></div>`;
    $('#msg-retry')?.addEventListener('click', () => location.reload());
    toast(`Messages : ${errMsg(e)}`, 'error');
  }
}
