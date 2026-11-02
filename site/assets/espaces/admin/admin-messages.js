// ===== Humane Gang — administration : messagerie (lecture + modération) =====
// Communication › Messagerie : conversations en colonne 2 (createList, filtres Toutes / Directes / Secret Santa),
// lecture en détail dans la zone principale (createThread en lecture seule). Route : #poste/messagerie[/<id>].
// Métadonnées des conversations via rpc hg_admin_conversations(). Les messages ne sont lus que par rpc
// hg_admin_read_conversation, qui journalise chaque lecture ; la suppression d'un message passe par hg_admin_message_remove (journal admin).
// L'admin voit les vrais expéditeurs, y compris le Santa.
// Dépendances : core.js (Supabase, toast), icons.js (icône corbeille), admin/ui/list.js et admin/ui/thread.js
// (liste et fil), admin/shell.js (boutons d'en-tête), ui-confirm.js (confirmation de suppression).
// RPC seulement (aucun accès direct aux tables) : hg_staff_directory, hg_admin_conversations, hg_admin_read_conversation,
// hg_admin_conversation_info, hg_admin_message_remove ; hg_admin_message_reactions (migration 204, journalisée aussi) :
// réactions en lecture seule sous chaque bulle, avec le vrai membre (« (Santa) » pour le Santa).
// Exporte : mountMessagesSection (zone de lecture), listMessages (colonne 2), openMessages (affichage à chaque visite).
import { sb, toast, errMsg, esc, $ } from '../../commun/core.js';
import { svg } from '../../commun/icons.js';
import { createList } from './ui/list.js';
import { createThread } from './ui/thread.js';
import { setActions } from './shell.js';
import { confirmBox } from '../../commun/ui-confirm.js';

/* ---------- Constantes ---------- */
const PAGE = 200; // messages par lecture journalisée (limite de la RPC : 500)
// Filtres de la colonne 2 : identifiant, libellé et test sur une conversation.
const FILTERS = [
  { id: 'direct', label: 'Directes', test: (c) => c.kind === 'direct' },
  { id: 'santa', label: 'Secret Santa', test: (c) => c.kind === 'santa' },
  { id: 'support', label: 'Assistance', test: (c) => c.kind === 'support' },
  { id: 'group', label: 'Groupes', test: (c) => c.kind === 'group' }, // migration 090 : groupes et discussions de sortie
];
// Format des dates des messages (jour.mois.année heure:minute, heure suisse).
const dtFmt = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Formate une date pour l'affichage ; chaîne vide si la date est absente. */
const fmt = (d) => (d ? dtFmt.format(new Date(d)) : '');
// Icône corbeille (SVG) du bouton « Supprimer » d'un message.
const TRASH = svg('trash', { stroke: 2 });
/** Renvoie les données d'une réponse Supabase, ou lève l'erreur si la requête a échoué. */
function check(res) { if (res.error) throw res.error; return res.data; }

/* ---------- État de la section ---------- */
// État de la section (partagé entre la liste, la lecture et les visites successives)
const M = {
  convs: [], pseudo: new Map(), sel: null, conv: null, msgs: [], lastId: 0, more: false, reacts: [],
  list: null, reader: null, thread: null, mounted: false, token: 0,
  convTok: 0, convsPending: null,
};

/* ---------- Conversations : titres et lignes de la liste ---------- */
/**
 * Titre d'une conversation : « Santa → cible » pour un Secret Santa, membres sinon.
 * @param {object} c Ligne renvoyée par hg_admin_conversations.
 * @returns {string}
 */
function convTitle(c) {
  return c.kind === 'santa'
    ? `${c.santa || 'Santa masqué'} (Santa) → ${c.target || '?'}`
    : (c.members || 'Conversation vide');
}
/**
 * Convertit une conversation en ligne pour la liste (titre, sous-titre, nombre de messages, badge).
 * @param {object} c Ligne renvoyée par hg_admin_conversations.
 * @returns {object} Élément attendu par createList.
 */
function toItem(c) {
  return {
    id: c.id,
    name: convTitle(c),
    title: c.kind === 'santa' ? `Secret Santa${c.edition_year ? ` ${c.edition_year}` : ''}` : c.kind === 'support' ? 'Assistance' : c.kind === 'group' ? 'Groupe' : 'Conversation directe',
    excerpt: c.messages ? `${c.messages} message${c.messages > 1 ? 's' : ''}` : 'Aucun message',
    at: c.last_message_at,
    status: c.kind === 'santa' ? { id: 'santa', label: 'Secret Santa', tone: 'santa' }
      : c.kind === 'support' ? { id: 'support', label: 'Assistance', tone: 'muted' }
      : c.kind === 'group' ? { id: 'group', label: 'Groupe', tone: 'muted' } : { id: 'direct', label: 'Directe', tone: 'muted' },
    kind: c.kind,
  };
}
// Toutes les conversations au format de la liste.
const convItems = () => M.convs.map(toItem);

/* ---------- Chargement des données ---------- */
/** Charge les pseudos du Staff (id -> pseudo) pour afficher les noms des expéditeurs. */
async function loadPseudos() {
  // Annuaire public du Staff (hg_staff_directory) : accessible à tout Staff, sans lecture complète de hg_profiles
  const rows = check(await sb.rpc('hg_staff_directory')) ?? [];
  M.pseudo = new Map(rows.map((r) => [r.id, r.pseudo]));
}
/** Charge la liste des conversations visibles par l'admin. */
async function loadConvs() {
  // Numéro de requête : une réponse plus ancienne que la dernière demande est ignorée.
  const tok = ++M.convTok;
  M.convsPending = (async () => {
    const data = check(await sb.rpc('hg_admin_conversations')) ?? [];
    if (tok === M.convTok) M.convs = data;
  })();
  return M.convsPending;
}

// Les messages passent par la RPC hg_admin_read_conversation, qui journalise chaque lecture (hg_admin_access_log).
// Une page = une lecture journalisée : on ne charge la suite qu'à la demande.
async function fetchMessages(id, after) {
  return check(await sb.rpc('hg_admin_read_conversation', { p_conv: id, p_after: after, p_limit: PAGE })) ?? [];
}

/* ---------- Affichage des messages et du lecteur ---------- */
/**
 * Nom affiché de l'expéditeur d'un message. Dans un Secret Santa, l'expéditeur est suffixé « (Santa) ».
 * @param {object} m Message brut (sender_id).
 * @param {object|null} conv Conversation en cours (kind, santa_id).
 * @returns {string}
 */
function senderName(m, conv) {
  if (!m.sender_id) return 'Ancien membre';
  const name = M.pseudo.get(m.sender_id) || 'Membre inconnu';
  return conv?.kind === 'santa' && m.sender_id === conv.santa_id ? `${name} (Santa)` : name;
}
// Ordre des réactions, le même que la palette des membres (messages.js).
const REACTIONS = ['❤️', '😂', '👍', '😮', '🔥', '🎉'];
const listeFr = new Intl.ListFormat('fr', { type: 'conjunction' });
/**
 * Puces des réactions d'un message, en lecture seule (même rendu que côté membre) : émoji, nombre, et qui a réagi
 * (bulle d'aide et texte pour les lecteurs d'écran). Le Santa est nommé, suffixé « (Santa) ».
 * @param {number|string} id identifiant du message
 * @returns {string} HTML (vide sans réaction)
 */
function reactsHtml(id) {
  const rows = M.reacts.filter((r) => Number(r.message_id) === Number(id));
  if (!rows.length) return '';
  const who = (r) => (M.conv?.kind === 'santa' && r.user_id === M.conv.santa_id ? `${r.pseudo} (Santa)` : r.pseudo);
  return `<ul class="msg-reacts amsg-reacts" aria-label="Réactions">${REACTIONS.filter((e) => rows.some((r) => r.emoji === e)).map((e) => {
    const qui = listeFr.format(rows.filter((r) => r.emoji === e).map(who));
    const n = rows.filter((r) => r.emoji === e).length;
    return `<li class="msg-react" title="${esc(qui)}">${esc(e)}<span aria-hidden="true">${n}</span><span class="visually-hidden"> : ${esc(qui)}</span></li>`;
  }).join('')}</ul>`;
}
/** Messages de la conversation ouverte au format attendu par createThread. */
function toMessages() {
  return M.msgs.map((m) => ({
    id: m.id,
    type: 'message',
    author: { id: m.sender_id, pseudo: senderName(m, M.conv) },
    body: m.body,
    at: m.created_at,
    mine: false,
  }));
}

/**
 * Dessine la zone de lecture : texte d'accueil si rien n'est choisi, sinon en-tête, bouton « suivants » et fil des messages.
 * Un avertissement rappelle que chaque lecture est journalisée.
 */
function paintReader() {
  if (!M.reader) return;
  if (!M.sel) {
    M.reader.innerHTML = `<div class="empty">Choisis une conversation dans la liste pour la lire.</div>
      <p class="muted small amsg-hint">Les membres voient « Ton Santa » ; ici, le vrai expéditeur est affiché. À utiliser uniquement pour la modération.</p>`;
    M.thread = null;
    return;
  }
  const c = M.conv || {};
  const who = c.kind === 'santa'
    ? `${M.pseudo.get(c.santa_id) || c.santa || 'Santa masqué'} (Santa, anonyme pour sa cible) → ${M.pseudo.get(c.target_id) || c.target || '?'}`
    : (c.members || '');
  M.reader.innerHTML = `
    <div class="amsg-reader-head">
      <div class="amsg-reader-title">
        <h3 class="card-title">${c.kind === 'santa' ? 'Conversation Secret Santa' : c.kind === 'support' ? 'Conversation d’assistance' : c.kind === 'group' ? 'Conversation de groupe' : 'Conversation directe'}</h3>
        <p class="muted small">${esc(who)}</p>
      </div>
      <p class="amsg-audit" role="note">Lecture journalisée : cette consultation est enregistrée</p>
    </div>
    ${M.more ? '<div class="btn-row"><button class="btn btn-ghost" type="button" id="amsg-more">Charger les messages suivants</button></div>' : ''}
    <div class="amsg-thread" id="amsg-thread"></div>`;
  $('#amsg-more', M.reader)?.addEventListener('click', (e) => loadMore(e.currentTarget));
  const host = $('#amsg-thread', M.reader);
  M.thread = createThread(host, {
    messages: toMessages(), composer: false, label: 'Messages de la conversation',
    rowAction: (m) => `${reactsHtml(m.id)}<button class="btn btn-ghost btn-sm amsg-del" type="button" data-row-act="${esc(m.id)}" aria-label="Supprimer le message de ${esc(m.author?.pseudo || '')} du ${esc(fmt(m.at))}">${TRASH}<span>Supprimer</span></button>`,
    onRowAction: (m, b) => del(m, b),
  });
  if (!M.msgs.length) host.insertAdjacentHTML('afterbegin', '<div class="empty">Aucun message dans cette conversation.</div>');
}

/* ---------- Ouverture, pagination et suppression ---------- */
/**
 * Ouvre une conversation : charge ses infos et sa première page de messages.
 * @param {string} id Identifiant de la conversation.
 */
async function openConv(id) {
  // Numéro de requête : si l'admin change de conversation pendant le chargement, la réponse périmée est ignorée.
  const token = ++M.token;
  M.sel = id;
  M.conv = M.convs.find((c) => c.id === id) || null;
  M.msgs = []; M.lastId = 0; M.more = false; M.reacts = [];
  M.list?.select(id);
  if (M.reader) M.reader.innerHTML = '<div class="empty">Chargement des messages…</div>';
  try {
    const [conv, msgs, reacts] = await Promise.all([
      // En-tête par RPC : le Staff n'a plus d'accès direct aux tables de la messagerie (migration 073).
      sb.rpc('hg_admin_conversation_info', { p_conv: id }).then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      fetchMessages(id, 0),
      // Réactions (migration 204) : lecture journalisée elle aussi, une fois par ouverture ; un échec n'empêche pas la lecture.
      sb.rpc('hg_admin_message_reactions', { p_conv: id }).then((r) => { if (r.error) throw r.error; return r.data; })
        .catch((e) => { console.warn('[admin-messages] réactions', e); return []; }),
    ]);
    if (token !== M.token) return;
    M.conv = { ...(M.conv || {}), ...(check(conv) || {}) };
    M.msgs = msgs;
    M.reacts = Array.isArray(reacts) ? reacts : [];
    M.lastId = msgs.length ? msgs[msgs.length - 1].id : 0;
    M.more = msgs.length === PAGE;
    paintReader();
  } catch (e) {
    if (token === M.token && M.reader) M.reader.innerHTML = `<div class="empty">Impossible de charger : ${esc(errMsg(e))}</div>`;
  }
}

/**
 * Charge la page de messages suivante de la conversation ouverte.
 * @param {HTMLButtonElement} btn Bouton « Charger les messages suivants » (désactivé pendant le chargement).
 */
async function loadMore(btn) {
  const id = M.sel;
  btn.disabled = true;
  try {
    const msgs = await fetchMessages(id, M.lastId);
    if (M.sel !== id) return;
    M.msgs = M.msgs.concat(msgs);
    if (msgs.length) M.lastId = msgs[msgs.length - 1].id;
    M.more = msgs.length === PAGE;
    paintReader();
  } catch (e) {
    btn.disabled = false;
    toast(`Chargement impossible : ${errMsg(e)}`, 'error');
  }
}

/**
 * Demande confirmation avant de supprimer un message. Le texte est tronqué à 300 caractères.
 * @param {string} body Contenu du message.
 * @returns {Promise<boolean>} true si l'admin confirme.
 */
function confirmDelete(body) {
  const q = body.length > 300 ? `${body.slice(0, 300)}…` : body;
  return confirmBox('Supprimer ce message ?', `Le message sera supprimé définitivement pour tous les membres de la conversation.\n\n« ${q} »`, { ok: 'Supprimer', danger: true });
}

/**
 * Supprime un message après confirmation, puis met à jour le fil, le compteur et la liste.
 * @param {object} m Message à supprimer (id, body).
 * @param {HTMLButtonElement} [btn] Bouton d'action, réactivé si la suppression échoue.
 */
async function del(m, btn) {
  if (!(await confirmDelete(m.body))) return;
  if (btn) btn.disabled = true;
  try {
    // Retrait par RPC, noté dans le journal admin (hg_admin_message_remove, migration 073).
    const ok = check(await sb.rpc('hg_admin_message_remove', { p_message: m.id }));
    if (ok !== true) throw new Error('suppression refusée');
    M.msgs = M.msgs.filter((x) => x.id !== m.id);
    const c = M.convs.find((x) => x.id === M.sel);
    if (c) c.messages = Math.max(0, (c.messages || 1) - 1);
    paintReader();
    M.list?.update(convItems());
    toast('Message supprimé', 'ok');
  } catch (e) {
    toast(`Suppression impossible : ${errMsg(e)}`, 'error');
    if (btn) btn.disabled = false;
  }
}

/* ---------- Actualisation ---------- */
/** Recharge les conversations (et les pseudos si besoin) puis rouvre la conversation affichée. */
async function refresh() {
  try {
    await Promise.all([loadConvs(), M.pseudo.size ? null : loadPseudos()]);
    M.list?.update(convItems());
    if (M.sel) await openConv(M.sel);
  } catch (e) {
    toast(`Actualisation impossible : ${errMsg(e)}`, 'error');
  }
}

/* ---------- Points d'entrée (appelés par admin.js) ---------- */
/** Section Messagerie : zone principale (lecture). Montée à la première visite (admin.js). */
export function mountMessagesSection(container) {
  if (!container || M.mounted) return;
  M.mounted = true;
  container.innerHTML = '<div class="amsg-reader" id="amsg-reader" aria-live="polite"></div>';
  M.reader = container.querySelector('#amsg-reader');
  paintReader();
  refresh();
}

/** Colonne 2 : liste des conversations (registerSub list). */
export function listMessages(el) {
  M.list = createList(el, {
    items: convItems(),
    key: 'id',
    label: 'Conversations',
    filters: FILTERS,
    search: { placeholder: 'Rechercher un pseudo…', label: 'Rechercher un pseudo', fields: (it) => `${it.name} ${it.title}` },
    selectedId: M.sel,
    empty: 'Aucune conversation pour l’instant.',
    onSelect: (it) => { location.hash = `#poste/messagerie/${it.id}`; },
  });
}

/** Affichage (registerSub open, à chaque visite) : sélection, actions de l'en-tête. */
export async function openMessages(_el, { id } = {}) {
  setActions(messageActions());
  if (!id) { M.token++; M.sel = null; M.conv = null; M.list?.select(null); paintReader(); return; }
  // Première visite : la liste peut encore se charger. On attend sa réponse avant de dire « introuvable ».
  if (!M.convs.some((c) => c.id === id)) { try { await M.convsPending; } catch { /* erreur déjà signalée par refresh */ } }
  if (!M.convs.some((c) => c.id === id)) { toast('Conversation introuvable.', 'error'); return; }
  openConv(id);
}

/** Bouton « Actualiser » de l'en-tête de la section Messagerie. */
function messageActions() {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn btn-ghost btn-sm'; b.textContent = 'Actualiser';
  b.addEventListener('click', async () => { b.disabled = true; M.pseudo = new Map(); await refresh(); b.disabled = false; });
  return [b];
}
