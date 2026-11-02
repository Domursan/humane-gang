// ===== Humane Gang — Sorties IRL (/pages/irl/irl.html) =====
// Page des sorties : prochaine sortie en grand, sorties à venir, sondages de dates, sorties passées avec leur album photo,
// et l'historique (irl-history.js, monté ici). Réponses (je viens, peut-être, pas dispo), votes, photos et ZIP.
// Dépendances : core.js, photos.js (envoi, albums, visionneuse), reactions.js, image-compress.js, ics.js (agenda),
// irl-history.js (historique), admin-ghosts.js (fantômes, admin, chargé à la demande), ui-confirm.js, reglages/valeurs-lot3.js (délais, bornes).
// Tables : hg_members, hg_events, hg_event_rsvps, hg_event_dates, hg_event_date_votes, hg_photos. N'exporte rien.
import { sb, initPage, toast, errMsg, esc, $, $$, fmtDateTime, daysUntil, avatarHtml, notify, isGodMode, godTag } from '../../commun/core.js';
import { uploadImage, removeObjects, signedUrls, openLightbox, uuid, thumbHtml, downloadAlbum, gridPath, uploadAlbumPhoto, insertPhotoRow, selectPhotos } from './photos.js';
import { loadReactions } from '../../commun/reactions.js';
import { prepareImage } from '../../commun/image-compress.js';
import { addToCalendar } from './ics.js';
import { mountHistory } from './irl-history.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { svg } from '../../commun/icons.js';
import { pluralCount, pad } from '../../commun/utils.js';
import { chargerReglagesLot3, delaiPassee, bornesSondage } from '../../commun/reglages/valeurs-lot3.js';
import { lireQuota, restants, messagePhotos, messageSortie } from '../../commun/eco-quota.js';
import { loadSortieCards, sortieCardHtml, onSortieCardClick } from './irl-carte.js';
import { setCompteurs } from '../../commun/core/badges-compteur.js';

/* ---------- Initialisation : session membre, réglages, droits ---------- */
// me = personne connectée (la page exige un membre). isAdmin : l'admin voit les fantômes et peut tout modifier.
const me = await initPage({ auth: 'member' });
await chargerReglagesLot3();
const isAdmin = !!me?.is_admin;
/** Mode sans limite actif (admin) : on peut répondre aux sorties passées. */
const god = () => isAdmin && isGodMode(); // mode sans limite : RSVP sur les sorties passées

/** Nombre de miniatures visibles avant le bouton « +n » de l'album. */
const ALBUM_PREVIEW = 12;           // miniatures affichées avant « +n »
/** Réponses possibles à une sortie : valeur enregistrée et libellé affiché. */
const RSVP = [
  ['oui', 'Je viens'],
  ['peut-etre', 'Peut-être'],
  ['non', 'Pas dispo'],
];
/** Couleurs des tuiles de date sans image de couverture. Chaque sortie garde toujours la même couleur. */
const TINTS = ['var(--sand)', 'var(--rust)', 'var(--sage)', 'var(--slate)', 'var(--plum)', 'var(--rose)'];

/* Icônes SVG utilisées dans la page. */
const I = {
  cal: svg('cal', { size: 18, stroke: 1.8 }),
  pin: svg('pin', { size: 18, stroke: 1.8 }),
  user: svg('user2', { size: 18, stroke: 1.8 }),
  people: svg('people', { size: 18, stroke: 1.8 }),
  edit: svg('edit2', { size: 16, stroke: 1.8 }),
  trash: svg('trash2', { size: 16, stroke: 1.8 }),
  upload: svg('upload2', { size: 18, stroke: 1.8 }),
  check: svg('check', { size: 16, stroke: 2.2 }),
  download: svg('download2', { size: 18, stroke: 1.8 }),
  chat: svg('chat', { size: 16, stroke: 1.8 }),
};

/* ---------- État ---------- */
/* État de la page : membres, sorties, réponses, dates de sondage, votes, photos, URLs signées, albums dépliés. */
const S = { members: new Map(), events: [], rsvps: [], dates: [], votes: [], photos: [], urls: new Map(), expanded: new Set() };
let hx;   // historique des rencontres (monté plus bas, une fois les helpers définis)

/**
 * Charge toutes les données de la page en une seule vague de requêtes : membres, sorties, réponses, dates et votes, photos.
 * Lève une erreur si une requête échoue. L'admin voit aussi les membres fantômes.
 */
async function load() {
  // Q3 : les photos ne sont lues que pour les sorties commencées (les seules qui ont un album), colonnes utiles seulement.
  const evQ = Promise.resolve(sb.from('hg_events').select('*').order('starts_at', { ascending: true }));
  const phQ = evQ.then((r) => {
    const ids = (r.data || []).filter((e) => new Date(e.starts_at) <= Date.now()).map((e) => e.id);
    return ids.length ? selectPhotos((cols) => sb.from('hg_photos').select(cols).in('event_id', ids).order('created_at', { ascending: true })) : { data: [], error: r.error || null };
  });
  // Fantômes (admin) : module et lecture lancés avec les autres requêtes, pas après (sinon un aller-retour de plus
  // retarde le premier rendu, et la liste repousse le bas de la page une fois affichée).
  const ghostsQ = isAdmin ? import('../admin/admin-ghosts.js').then((g) => g.ghostDirectory()) : null;
  const [m, ev, rs, dt, vt, ph, ghosts] = await Promise.all([
    sb.rpc('hg_members'),
    evQ,
    sb.from('hg_event_rsvps').select('*'),
    sb.from('hg_event_dates').select('*').order('proposed_at', { ascending: true }),
    sb.from('hg_event_date_votes').select('*'),
    phQ,
    ghostsQ,
  ]);
  const err = [m, ev, rs, dt, vt, ph].find((r) => r.error)?.error;
  if (err) throw err;
  S.members = new Map((m.data || []).map((x) => [x.id, x]));
  if (ghosts) for (const [id, g] of ghosts) S.members.set(id, g); // l'admin voit les fantômes, pas les membres
  S.events = ev.data || [];
  S.rsvps = rs.data || [];
  S.dates = dt.data || [];
  S.votes = vt.data || [];
  S.photos = ph.data || [];
  await loadSortieCards(S.events); // cartes « J’y étais » (migration 080, C4)
}

/* ---------- Helpers ---------- */
/** Membre à partir de son identifiant ; « Ancien membre » s'il n'est plus dans l'annuaire. */
const member = (id) => S.members.get(id) || { pseudo: 'Ancien membre' };
/** Pseudo d'un membre à partir de son identifiant. */
const pseudo = (id) => member(id).pseudo;
/** Vrai si je peux modifier la sortie : je l'ai créée, ou je suis admin. */
const canEdit = (ev) => ev.created_by === me.id || isAdmin;
/** Couleur de tuile stable pour un identifiant : la même sortie garde toujours la même couleur. */
const tint = (id) => TINTS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % TINTS.length];
/** Photos d'une sortie, dans l'ordre d'envoi. */
const photosOf = (id) => S.photos.filter((p) => p.event_id === id);
/** Dates proposées d'un sondage. */
const datesOf = (id) => S.dates.filter((d) => d.event_id === id);
/** Votes d'une date de sondage. */
const votesOf = (dateId) => S.votes.filter((v) => v.date_id === dateId);

/**
 * Réponses d'une sortie, rangées par statut. Les présences de comptes inconnus (fantômes) sont ignorées.
 * @param {string} eventId identifiant de la sortie
 * @returns {{oui: string[], 'peut-etre': string[], non: string[], mine: string|null}} ids des personnes, et ma réponse
 */
function rsvpOf(eventId) {
  const r = { oui: [], 'peut-etre': [], non: [], mine: null };
  for (const x of S.rsvps) {
    if (x.event_id !== eventId || !S.members.has(x.user_id)) continue; // présence d'un compte inconnu (fantôme) : ignorée
    r[x.status]?.push(x.user_id);
    if (x.user_id === me.id) r.mine = x.status;
  }
  return r;
}
/**
 * Range les sorties en quatre groupes : prochaine, à venir, sondages (sans date), passées.
 * Une sortie ajoutée après coup (retro) est toujours « passée », même si elle est récente.
 * @returns {{next: object|null, upcoming: object[], polls: object[], past: object[]}}
 */
function classify() {
  const now = Date.now();
  const dated = S.events.filter((e) => e.starts_at);
  // Une rencontre ajoutée après coup (retro) est toujours « passée », même si elle date d'il y a moins de 6 h.
  const isPast = (e) => e.retro || new Date(e.starts_at).getTime() < now - delaiPassee();
  const future = dated.filter((e) => !isPast(e))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const past = dated.filter(isPast)
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
  const polls = S.events.filter((e) => !e.starts_at).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return { next: future[0] || null, upcoming: future.slice(1), polls, past };
}
/** Libellé du moment d'une sortie : « En cours », « Aujourd'hui », « Demain », ou « Dans N jours ». */
function whenLabel(iso) {
  const t = new Date(iso).getTime();
  if (t <= Date.now()) return 'En cours';
  const d = daysUntil(iso);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Demain';
  return `Dans ${d} jours`;
}
/** Petite tuile de date (jour de la semaine, numéro, mois) à côté du titre. Décorative : masquée des lecteurs d'écran. */
function dateTile(iso) {
  const d = new Date(iso);
  const wd = new Intl.DateTimeFormat('fr-CH', { weekday: 'short' }).format(d).replace('.', '');
  const mo = new Intl.DateTimeFormat('fr-CH', { month: 'short' }).format(d);
  const yr = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return `<div class="date-tile" aria-hidden="true"><span>${esc(wd)}</span><strong>${d.getDate()}</strong><span>${esc(mo)}${yr}</span></div>`;
}
/**
 * Lignes d'information d'une sortie : date, lieu, et qui l'a proposée.
 * @param {object} ev la sortie
 * @param {{creator?: boolean}} [opts] creator : afficher l'auteur
 * @returns {string} HTML, vide si rien à afficher
 */
function meta(ev, { creator = true } = {}) {
  const li = [];
  if (ev.starts_at) {
    const y = new Date(ev.starts_at).getFullYear();
    li.push(`<li>${I.cal}<span>${esc(fmtDateTime(ev.starts_at))}${y !== new Date().getFullYear() ? ` ${y}` : ''}</span></li>`);
  }
  if (ev.location) li.push(`<li>${I.pin}<span>${esc(ev.location)}</span></li>`);
  if (creator && ev.created_by) li.push(`<li>${I.user}<span>Proposée par ${esc(pseudo(ev.created_by))}</span></li>`);
  return li.length ? `<ul class="meta">${li.join('')}</ul>` : '';
}
/**
 * Boutons de gestion d'une sortie (modifier, supprimer, et « Qui était là ? » pour les sorties passées).
 * Rien si je n'ai pas le droit de modifier.
 */
function ownerActions(ev, { who = false } = {}) {
  if (!canEdit(ev)) return '';
  return `<div class="owner-actions">
    ${who ? `<button type="button" class="btn btn-ghost btn-sm" data-act="who" data-id="${esc(ev.id)}" data-key="who:${esc(ev.id)}">${I.people}<span>Qui était là ?</span></button>` : ''}
    <button type="button" class="btn btn-ghost btn-sm" data-act="edit" data-id="${esc(ev.id)}" data-key="edit:${esc(ev.id)}">${I.edit}<span>Modifier</span></button>
    <button type="button" class="btn btn-danger btn-sm" data-act="delete" data-id="${esc(ev.id)}">${I.trash}<span>Supprimer</span></button>
  </div>`;
}
/**
 * Boutons de réponse (« Je viens », « Peut-être », « Pas dispo ») et compteurs. En mode complet, la liste des présents.
 * @param {object} ev la sortie
 * @param {{compact?: boolean}} [opts] compact : sans la liste des personnes
 * @returns {string} HTML
 */
function rsvpBlock(ev, { compact = false } = {}) {
  const r = rsvpOf(ev.id);
  const btns = RSVP.map(([v, label]) => {
    const on = r.mine === v;
    return `<button type="button" class="rsvp-btn rsvp-${v}" data-act="rsvp" data-id="${esc(ev.id)}" data-status="${v}"
      data-key="rsvp:${esc(ev.id)}:${v}" aria-pressed="${on}">${on ? I.check : ''}<span>${label}</span></button>`;
  }).join('');
  const counts = `<p class="rsvp-counts small"><strong>${pluralCount(r.oui.length, 'vient', 'viennent')}</strong> · ${r['peut-etre'].length} peut-être · ${r.non.length} pas dispo</p>`;
  let people = '';
  if (!compact) {
    const yes = r.oui.map((id) => `<li class="person">${avatarHtml(member(id), 28)}<span>${esc(pseudo(id))}</span></li>`).join('');
    const maybe = r['peut-etre'].map((id) => esc(pseudo(id))).join(', ');
    people = `${yes ? `<ul class="people" aria-label="Présents">${yes}</ul>` : '<p class="small muted">Personne n\'a encore confirmé. Lance-toi.</p>'}
      ${maybe ? `<p class="small muted">Peut-être : ${maybe}</p>` : ''}`;
  }
  return `<div class="rsvp-wrap">
    <div class="rsvp" role="group" aria-label="Ta réponse pour ${esc(ev.title)}">${btns}</div>
    ${counts}${people}
  </div>`;
}
/** Bouton « Ajouter à mon agenda » : crée un fichier de calendrier pour la sortie. */
function calButton(ev) {
  return `<button type="button" class="btn btn-ghost btn-sm" data-act="ics" data-id="${esc(ev.id)}" aria-label="Ajouter « ${esc(ev.title)} » à mon agenda">${I.cal}<span>Ajouter à mon agenda</span></button>`;
}
/**
 * Lien « Discussion de la sortie » (groupe de la messagerie, migration 090) : pour l'organisateur et les réponses
 * « oui » / « peut-être ». Le serveur vérifie le droit (hg_event_conv_open) ; ici, seulement l'affichage.
 */
function discussBtn(ev) {
  const mine = rsvpOf(ev.id).mine;
  if (ev.created_by !== me.id && mine !== 'oui' && mine !== 'peut-etre') return '';
  return `<a class="btn btn-ghost btn-sm" href="/pages/compte/messages.html?event=${encodeURIComponent(ev.id)}">${I.chat}<span>Discussion de la sortie</span></a>`;
}
/**
 * Suggestion « Dire merci à l’organisateur » dans les trois jours qui suivent une sortie où j'étais (P4, migration 090).
 * Le lien ouvre la fiche de l'organisateur avec la boîte de merci et la sortie déjà choisie.
 */
function thanksHint(ev) {
  const t = new Date(ev.starts_at).getTime();
  if (!ev.created_by || ev.created_by === me.id || rsvpOf(ev.id).mine !== 'oui' || !(t <= Date.now() && Date.now() - t < 3 * 864e5)) return '';
  return `<p class="irl-thanks small">${esc(pseudo(ev.created_by))} a organisé cette sortie.
    <a class="btn btn-sand btn-sm" href="/pages/compte/membre.html?id=${encodeURIComponent(ev.created_by)}&amp;merci=${encodeURIComponent(ev.id)}">Dire merci à l’organisateur</a></p>`;
}
/** Description d'une sortie, échappée ; vide si absente. */
function descHtml(ev) {
  return ev.description ? `<p class="desc">${esc(ev.description)}</p>` : '';
}

/* ---------- Albums ---------- */
/**
 * Album photo d'une sortie : miniatures (12 au plus, le reste sur demande), ajout de photos, et téléchargement en ZIP.
 * @param {object} ev la sortie
 * @returns {string} HTML
 */
function albumHtml(ev) {
  const list = photosOf(ev.id);
  const expanded = S.expanded.has(ev.id);
  const shown = expanded ? list : list.slice(0, ALBUM_PREVIEW);
  const rest = list.length - shown.length;
  const tiles = shown.map((p, i) => `<li><button type="button" class="thumb" data-act="photo" data-id="${esc(ev.id)}" data-idx="${i}"
      aria-label="Photo ${i + 1} sur ${list.length}${p.user_id ? `, ajoutée par ${esc(pseudo(p.user_id))}` : ''}">${thumbHtml(S.urls.get(gridPath(p)) || S.urls.get(p.path), '', p)}</button></li>`).join('');
  const more = rest > 0 ? `<li><button type="button" class="thumb thumb-more" data-act="expand" data-id="${esc(ev.id)}" aria-label="Afficher les ${rest} autres photos">+${rest}</button></li>` : '';
  const grid = list.length
    ? `<ul class="album" aria-label="Album photo">${tiles}${more}</ul>`
    : '<p class="empty album-empty">Pas encore de photos. Sois le ou la première à en ajouter.</p>';
  const zip = list.length
    ? `<button type="button" class="btn btn-ghost btn-sm" data-act="zip" data-id="${esc(ev.id)}" aria-label="Télécharger les ${list.length} photos de l'album « ${esc(ev.title)} » dans un fichier ZIP">${I.download}<span>Tout télécharger</span></button>`
    : '';
  return `<div class="album-wrap">
    <div class="album-head">
      <h4 class="album-title">Album <span class="muted">· ${pluralCount(list.length, 'photo', 'photos')}</span></h4>
      <div class="btn-row">${zip}
        <label class="btn btn-ghost btn-sm upload-btn">${I.upload}<span>Ajouter des photos</span>
          <input class="visually-hidden" type="file" accept="image/*" multiple data-upload="${esc(ev.id)}">
        </label>
      </div>
    </div>
    ${grid}
    <p class="upload-status small muted" aria-live="polite" data-status-for="${esc(ev.id)}"></p>
  </div>`;
}

/* ---------- Rendu ---------- */
/** Image de couverture d'une sortie, ou à défaut une tuile colorée avec le jour et le mois. */
function coverHtml(ev) {
  const url = ev.cover_path ? S.urls.get(ev.cover_path) : null;
  if (url) return `<div class="feat-cover"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></div>`;
  const d = new Date(ev.starts_at);
  return `<div class="feat-cover feat-cover-block" style="--tint:${tint(ev.id)}" aria-hidden="true">
    <span class="fc-day">${d.getDate()}</span>
    <span class="fc-month">${esc(new Intl.DateTimeFormat('fr-CH', { month: 'long' }).format(d))}</span>
  </div>`;
}
/**
 * Carte de la prochaine sortie (grande carte). Si la sortie a commencé, son album s'affiche aussi.
 * Sans prochaine sortie : grande tuile « 0 sortie calée » et, s'il existe, le dernier rendez-vous (il y a N jours).
 * @param {object|null} ev la prochaine sortie, ou null
 * @param {object|null} [last] la dernière sortie passée (état vide seulement)
 * @returns {string} HTML
 */
function renderNext(ev, last = null) {
  if (!ev) {
    const ago = last ? -daysUntil(last.starts_at) : null;
    const lastHtml = last ? `<div class="feat-last">
        <p class="small muted">Le dernier rendez-vous, c'était :</p>
        <p class="feat-last-title">${esc(last.title)}</p>
        ${meta(last, { creator: false })}
        ${ago > 0 ? `<p class="feat-ago"><span>Il y a</span> <strong>${ago}</strong> <span>${ago > 1 ? 'jours' : 'jour'}</span></p>` : ''}
      </div>` : '';
    return `<div class="card card-irl featured feat-empty">
      <div class="feat-cover feat-cover-block feat-zero" aria-hidden="true"><span class="fc-day">0</span><span class="fc-month">sortie calée</span></div>
      <div class="feat-body stack">
        <p class="display feat-empty-title">Rien de calé pour l'instant.</p>
        <p class="muted">Un resto, une rando, un karaoké raté : propose quelque chose et le gang suivra.</p>
        ${lastHtml}
        <div><button type="button" class="btn btn-primary" data-act="new">+ Proposer une sortie</button></div>
      </div>
    </div>`;
  }
  const started = new Date(ev.starts_at).getTime() <= Date.now();
  return `<article class="card card-irl featured" id="event-${esc(ev.id)}">
    ${coverHtml(ev)}
    <div class="feat-body stack">
      <div class="feat-tags"><span class="pill pill-current">Prochaine sortie</span><span class="pill">${esc(whenLabel(ev.starts_at))}</span></div>
      <h3 class="display feat-title">${esc(ev.title)}</h3>
      ${meta(ev)}
      ${descHtml(ev)}
      ${rsvpBlock(ev)}
      <div class="btn-row">${calButton(ev)}${discussBtn(ev)}</div>
      ${ownerActions(ev)}
    </div>
    ${started ? `<div class="feat-album">${albumHtml(ev)}</div>` : ''}
  </article>`;
}
/**
 * Carte d'un sondage de dates : chaque date avec ses votes, la date en tête, et le bouton « Je suis dispo ».
 * L'auteur ou l'admin peut fixer une date. Le classement se fait sur le nombre de votes.
 * @param {object} ev le sondage
 * @returns {string} HTML
 */
function renderPoll(ev) {
  const ds = datesOf(ev.id);
  const counts = ds.map((d) => votesOf(d.id).length);
  const max = Math.max(1, ...counts);
  const top = Math.max(0, ...counts);
  const rows = ds.map((d, i) => {
    const vs = votesOf(d.id);
    const mine = vs.some((v) => v.user_id === me.id);
    const lead = top > 0 && vs.length === top;
    const who = vs.map((v) => esc(pseudo(v.user_id))).join(', ');
    return `<li class="pd${lead ? ' pd-lead' : ''}">
      <div class="pd-main">
        <div class="pd-label"><strong>${esc(fmtDateTime(d.proposed_at))}</strong>${lead ? '<span class="pill pill-ok">En tête</span>' : ''}</div>
        <div class="pd-bar" aria-hidden="true"><span style="width:${Math.round((counts[i] / max) * 100)}%"></span></div>
        <div class="small muted">${pluralCount(vs.length, 'vote', 'votes')}${who ? ` · ${who}` : ''}</div>
      </div>
      <div class="pd-actions">
        <button type="button" class="btn btn-sm vote-btn" data-act="vote" data-date="${esc(d.id)}" data-key="vote:${esc(d.id)}"
          aria-pressed="${mine}" aria-label="${mine ? 'Retirer mon vote' : 'Je suis dispo'} pour le ${esc(fmtDateTime(d.proposed_at))}">${mine ? I.check : ''}<span>${mine ? 'Dispo' : 'Je suis dispo'}</span></button>
        ${canEdit(ev) ? `<button type="button" class="btn btn-ghost btn-sm" data-act="fix" data-id="${esc(ev.id)}" data-date="${esc(d.id)}">Fixer cette date</button>` : ''}
      </div>
    </li>`;
  }).join('');
  return `<article class="card poll" id="event-${esc(ev.id)}">
    <div class="poll-head">
      <div class="stack-sm">
        <span class="pill pill-todo">Sondage de dates</span>
        <h3 class="ev-title">${esc(ev.title)}</h3>
        ${meta(ev)}
      </div>
      ${ownerActions(ev)}
    </div>
    ${descHtml(ev)}
    ${ds.length ? `<ol class="poll-dates">${rows}</ol>` : '<p class="empty">Aucune date proposée pour l\'instant.</p>'}
  </article>`;
}
/** Ligne d'une sortie à venir (version compacte, sans la liste complète des présents). */
function renderUpcoming(ev) {
  return `<article class="card ev-row" id="event-${esc(ev.id)}">
    ${dateTile(ev.starts_at)}
    <div class="ev-main stack-sm">
      <div class="ev-row-head">
        <div class="stack-sm"><h3 class="ev-title">${esc(ev.title)}</h3>${meta(ev)}</div>
        ${ownerActions(ev)}
      </div>
      ${descHtml(ev)}
      ${rsvpBlock(ev, { compact: true })}
      <div class="btn-row">${calButton(ev)}${discussBtn(ev)}</div>
    </div>
  </article>`;
}
/**
 * Ligne d'une sortie passée : présents, album photo, et réponses si le mode sans limite est actif (admin).
 * @param {object} ev la sortie passée
 * @returns {string} HTML
 */
function renderPast(ev) {
  const r = rsvpOf(ev.id);
  return `<article class="card past" id="event-${esc(ev.id)}">
    <div class="past-head">
      ${dateTile(ev.starts_at)}
      <div class="stack-sm past-info">
        ${ev.retro ? '<span class="pill retro-pill">Ajoutée après coup</span>' : ''}
        <h3 class="ev-title">${esc(ev.title)}</h3>
        ${meta(ev, { creator: false })}
        <p class="small muted past-people">${I.people}<span>${r.oui.length ? `${pluralCount(r.oui.length, 'présent', 'présents')} : ${r.oui.map((id) => esc(pseudo(id))).join(', ')}` : 'Présents non renseignés'}</span></p>
      </div>
      ${ownerActions(ev, { who: true })}
    </div>
    ${thanksHint(ev)}
    ${god() ? `<div class="past-rsvp"><p class="small muted">Répondre à cette sortie passée${godTag()}</p>${rsvpBlock(ev, { compact: true })}</div>` : ''}
    ${sortieCardHtml(ev, { me, members: S.members, pseudo })}
    ${albumHtml(ev)}
  </article>`;
}

/**
 * Dessine toute la page. Signe d'abord les URLs des images en un seul lot, puis charge les réactions des albums affichés.
 * Rétablit le focus sur le bouton qui vient d'être utilisé, pour le clavier.
 */
/**
 * Vrai si une sortie attend quelque chose de moi : un sondage sans mon vote (si elle a des dates proposées),
 * sinon une sortie à venir sans ma réponse (oui, peut-être ou non).
 * @param {object} ev Sortie.
 * @returns {boolean}
 */
function attendMoi(ev) {
  const dates = datesOf(ev.id);
  if (dates.length) return !dates.some((d) => votesOf(d.id).some((v) => v.user_id === me.id));
  return new Date(ev.starts_at) > Date.now() && !S.rsvps.some((r) => r.event_id === ev.id && r.user_id === me.id);
}

async function render() {
  const { next, upcoming, polls, past } = classify();
  // Pastille « à faire » de l'onglet Sorties (badges-compteur.js) : sorties à venir sans ma réponse, sondages sans mon vote
  setCompteurs('irl', { sorties: new Set([...(next ? [next] : []), ...upcoming, ...polls].filter(attendMoi).map((e) => e.id)).size });
  // URLs signées en un seul lot : couvertures + photos des albums affichés
  const albumEvents = [...past, ...(next && new Date(next.starts_at) <= Date.now() ? [next] : [])];
  const paths = [
    ...(next?.cover_path ? [next.cover_path] : []),
    ...past.map((e) => e.cover_path).filter(Boolean),   // miniatures de l'historique
    ...albumEvents.flatMap((e) => photosOf(e.id).flatMap((p) => [p.path, gridPath(p)])), // photo entière (visionneuse) + vignette (grille)
  ];
  S.urls = await signedUrls(paths);
  await loadReactions('photo', albumEvents.flatMap((e) => photosOf(e.id).map((p) => p.id)), me.id); // une requête pour les réactions des albums affichés

  const focusKey = S.focusKey || document.activeElement?.dataset?.key;
  S.focusKey = null;
  $('#next').innerHTML = renderNext(next, past[0] || null);
  $('#polls-section').hidden = !polls.length;
  $('#polls').innerHTML = polls.map(renderPoll).join('');
  $('#upcoming-section').hidden = !upcoming.length;
  $('#upcoming').innerHTML = upcoming.map(renderUpcoming).join('');
  $('#past').innerHTML = past.length
    ? past.map(renderPast).join('')
    : '<p class="empty">Aucune sortie passée pour l\'instant. Les souvenirs arrivent bientôt.</p>';
  hx.render();
  if (focusKey) $(`[data-key="${CSS.escape(focusKey)}"]`)?.focus();
}

/** Recharge les données puis redessine la page ; en cas d'erreur, un message s'affiche. */
async function refresh() {
  try { await load(); await render(); } catch (e) { toast(`Chargement impossible : ${errMsg(e)}`, 'error'); }
}

/**
 * Ouvre la bonne vue selon l'adresse : #historique, ou #event-<id> (fait défiler jusqu'à la sortie et la fait clignoter).
 * Sans effet de défilement si le mouvement est réduit.
 */
function goToHash() {
  if (location.hash === '#historique') { if (!hx.isOpen()) hx.setTab('historique'); return; }
  const m = location.hash.match(/^#event-([0-9a-f-]{36})$/i);
  if (!m) return;
  if (hx.isOpen()) hx.setTab('sorties');
  const el = document.getElementById(`event-${m[1]}`);
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

/* ---------- Actions ---------- */
/**
 * Enregistre ma réponse. Cliquer sur la réponse déjà choisie la retire.
 * @param {string} eventId identifiant de la sortie
 * @param {string} status 'oui', 'peut-etre' ou 'non'
 * @param {HTMLButtonElement} btn bouton cliqué (désactivé pendant l'envoi)
 */
async function setRsvp(eventId, status, btn) {
  const mine = rsvpOf(eventId).mine;
  btn.disabled = true;
  try {
    if (mine === status) {
      const { error } = await sb.from('hg_event_rsvps').delete().eq('event_id', eventId).eq('user_id', me.id);
      if (error) throw error;
    } else {
      const { error } = await sb.from('hg_event_rsvps').upsert(
        { event_id: eventId, user_id: me.id, status, updated_at: new Date().toISOString() },
        { onConflict: 'event_id,user_id' });
      if (error) throw error;
    }
    await refresh();
  } catch (e) { toast(`Réponse non enregistrée : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}
/**
 * Ajoute ou retire mon vote pour une date de sondage.
 * @param {string} dateId identifiant de la date
 * @param {HTMLButtonElement} btn bouton cliqué (désactivé pendant l'envoi)
 */
async function toggleVote(dateId, btn) {
  const mine = votesOf(dateId).some((v) => v.user_id === me.id);
  btn.disabled = true;
  try {
    const q = mine
      ? sb.from('hg_event_date_votes').delete().eq('date_id', dateId).eq('user_id', me.id)
      : sb.from('hg_event_date_votes').insert({ date_id: dateId, user_id: me.id });
    const { error } = await q;
    if (error) throw error;
    await refresh();
  } catch (e) { toast(`Vote non enregistré : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}
/**
 * Fixe la date d'un sondage : la sortie prend la date choisie et devient une sortie à date fixée.
 * Demande une confirmation avant.
 */
async function fixDate(eventId, dateId) {
  const d = S.dates.find((x) => x.id === dateId);
  if (!d || !(await confirmBox(`Fixer la sortie au ${fmtDateTime(d.proposed_at)} ?`, '', { ok: 'Fixer la date' }))) return;
  const { error } = await sb.from('hg_events').update({ starts_at: d.proposed_at }).eq('id', eventId);
  if (error) return toast(`Impossible de fixer la date : ${errMsg(error)}`, 'error');
  toast('Date fixée. Le gang peut maintenant répondre.', 'ok');
  await refresh();
}
/**
 * Supprime une sortie après confirmation, puis ses fichiers (couverture et photos, seulement ceux que je peux supprimer).
 * La ligne de la sortie est supprimée en premier ; les fichiers ne le sont qu'ensuite.
 */
async function deleteEvent(eventId) {
  const ev = S.events.find((e) => e.id === eventId);
  if (!ev || !(await confirmBox(`Supprimer « ${ev.title} » ?`, 'Les réponses, votes et photos de l\'album seront supprimés.', { ok: 'Supprimer', danger: true }))) return;
  /** Vrai si le fichier m'appartient (ou si je suis admin) : seuls ces fichiers peuvent être supprimés. */
  const mineOnly = (p) => isAdmin || p.startsWith(`${me.id}/`);
  const files = [ev.cover_path, ...photosOf(eventId).map((p) => p.path)].filter((p) => p && mineOnly(p));
  const { error } = await sb.from('hg_events').delete().eq('id', eventId);
  if (error) return toast(`Suppression impossible : ${errMsg(error)}`, 'error');
  try { await removeObjects(files); } catch (e) { console.warn('[irl] fichiers non supprimés', e); }
  toast('Sortie supprimée.', 'ok');
  await refresh();
}
/**
 * Envoie les photos choisies, une par une : compression, envoi du fichier, puis enregistrement en base.
 * Un échec sur une photo n'arrête pas les suivantes ; le fichier déjà envoyé est alors retiré.
 * @param {string} eventId identifiant de la sortie
 * @param {HTMLInputElement} input champ de fichiers
 */
async function uploadPhotos(eventId, input) {
  const files = [...input.files];
  input.value = '';
  if (!files.length) return;
  const status = $(`[data-status-for="${CSS.escape(eventId)}"]`);
  const label = input.closest('label');
  input.disabled = true; label?.classList.add('is-busy');
  const reste = restants(await lireQuota(), 'photos'); // photos qui rapportent encore des Paillettes aujourd'hui
  let ok = 0;
  for (const [i, f] of files.entries()) {
    if (status) status.textContent = `Compression et envoi ${i + 1} / ${files.length}…`;
    let row = null;
    try {
      row = await uploadAlbumPhoto(f, `${me.id}/${eventId}`); // photo + vignette 480 px (Q3)
      const { error } = await insertPhotoRow({ event_id: eventId, user_id: me.id, ...row });
      if (error) throw error;
      ok++;
    } catch (e) {
      if (row) removeObjects([row.path, row.thumb_path]).catch(() => {});
      toast(`${f.name} : ${errMsg(e)}`, 'error');
    }
  }
  input.disabled = false; label?.classList.remove('is-busy');
  if (status) status.textContent = '';
  if (ok) { toast(messagePhotos(ok, reste, `${pluralCount(ok, 'photo ajoutée', 'photos ajoutées')} à l'album.`), 'ok'); S.expanded.add(eventId); await refresh(); }
}
/**
 * Télécharge toutes les photos de l'album dans un fichier ZIP. Le bouton affiche « Préparation du ZIP… » pendant le calcul.
 * @param {string} eventId identifiant de la sortie
 * @param {HTMLButtonElement} btn bouton « Tout télécharger »
 */
async function zipAlbum(eventId, btn) {
  const ev = S.events.find((x) => x.id === eventId);
  const label = btn.querySelector('span');
  const prev = label.textContent;
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); label.textContent = 'Préparation du ZIP…';
  try {
    await downloadAlbum(eventId, ev?.title);
    toast('Album téléchargé.', 'ok');
  } catch (e) {
    toast(`Téléchargement impossible : ${errMsg(e)}`, 'error');
  } finally {
    btn.disabled = false; btn.removeAttribute('aria-busy'); label.textContent = prev;
  }
}
/**
 * Ouvre la visionneuse sur l'album, à la photo choisie. Suppression proposée seulement à l'auteur ou à l'admin.
 * @param {string} eventId identifiant de la sortie
 * @param {number} idx position de la photo dans l'album
 */
function openPhoto(eventId, idx) {
  const list = photosOf(eventId);
  const items = list.map((p) => ({
    url: S.urls.get(p.path),
    react: p.id,
    alt: `Photo ajoutée par ${pseudo(p.user_id)}`,
    caption: [p.caption, `Ajoutée par ${pseudo(p.user_id)}`, p.hidden_at ? 'masquée par le Staff (visible de toi seul et du Staff)' : ''].filter(Boolean).join(' · '),
    report: p.user_id !== me.id ? p.id : null, // A6 : « Signaler » une photo d'un autre membre
    onDelete: (p.user_id === me.id || isAdmin) ? () => deletePhoto(p) : null,
  })).filter((x) => x.url);
  openLightbox(items, idx);
}
/**
 * Supprime une photo : la ligne en base d'abord, puis le fichier.
 * @param {object} p ligne de la photo (hg_photos)
 * @returns {Promise<boolean>} true si la photo est supprimée
 */
async function deletePhoto(p) {
  const { error } = await sb.from('hg_photos').delete().eq('id', p.id);
  if (error) { toast(`Suppression impossible : ${errMsg(error)}`, 'error'); return false; }
  try { await removeObjects([p.path, p.thumb_path]); } catch (e) { console.warn('[irl] fichier non supprimé', e); }
  toast('Photo supprimée.', 'ok');
  refresh();
  return true;
}

// Délégation : un seul écouteur pour tous les boutons data-act de la page, y compris ceux rendus plus tard.
$('#app').addEventListener('click', (e) => {
  if (onSortieCardClick(e, refresh)) return; // « Il était là aussi » (carte de la sortie)
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const { act, id } = b.dataset;
  S.focusKey = b.dataset.key || null;
  if (act === 'rsvp') setRsvp(id, b.dataset.status, b);
  else if (act === 'vote') toggleVote(b.dataset.date, b);
  else if (act === 'fix') fixDate(id, b.dataset.date);
  else if (act === 'edit') { const ev = S.events.find((x) => x.id === id); if (ev?.retro) hx.openRetro(ev); else openEventDialog(ev); }
  else if (act === 'who') hx.openWho(S.events.find((x) => x.id === id));
  else if (act === 'delete') deleteEvent(id);
  else if (act === 'ics') { const ev = S.events.find((x) => x.id === id); if (ev?.starts_at) addToCalendar({ id, title: ev.title, start: ev.starts_at, location: ev.location, description: ev.description }, new URL(`/pages/irl/irl.html#event-${id}`, location.href).href); }
  else if (act === 'new') openEventDialog();
  else if (act === 'photo') openPhoto(id, Number(b.dataset.idx));
  else if (act === 'zip') zipAlbum(id, b);
  else if (act === 'expand') { S.expanded.add(id); render().then(() => $(`#event-${CSS.escape(id)} .thumb[data-idx="${ALBUM_PREVIEW}"]`)?.focus()); }
});
// Choix de fichiers pour ajouter des photos (champs data-upload).
$('#app').addEventListener('change', (e) => {
  const inp = e.target.closest('input[data-upload]');
  if (inp) uploadPhotos(inp.dataset.upload, inp);
});
$('#btn-new').addEventListener('click', () => openEventDialog());
$('#btn-retro').addEventListener('click', () => hx.openRetro());
window.addEventListener('hashchange', goToHash);

/* ---------- Formulaire de sortie ---------- */
const dlg = $('#event-dialog');
const form = $('#event-form');
let editing = null;

/**
 * Date ISO convertie au format attendu par un champ datetime-local (heure locale, sans fuseau).
 * @param {string} iso date ISO
 * @returns {string} « AAAA-MM-JJTHH:MM », ou chaîne vide
 */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Met à jour les étiquettes et l'état des lignes de dates : au moins deux dates, pas plus que le maximum réglé. */
function updateDateRows() {
  const rows = $$('.date-row', $('#ev-dates'));
  rows.forEach((r, i) => {
    r.querySelector('input').setAttribute('aria-label', `Date proposée ${i + 1}`);
    r.querySelector('button').disabled = rows.length <= 2;
  });
  $('#ev-add-date').disabled = rows.length >= bornesSondage().max;
}
/**
 * Ajoute une ligne de date au formulaire de sondage.
 * @param {string} [value=''] date au format datetime-local
 * @param {string} [id=''] identifiant de la date existante (vide pour une nouvelle)
 */
function addDateRow(value = '', id = '') {
  const row = document.createElement('div');
  row.className = 'date-row';
  row.innerHTML = `<input class="input" type="datetime-local" value="${esc(value)}" data-orig="${esc(value)}" data-id="${esc(id)}">
    <button type="button" class="btn btn-ghost" aria-label="Retirer cette date">${I.trash}</button>`;
  row.querySelector('button').addEventListener('click', () => { row.remove(); updateDateRows(); });
  $('#ev-dates').append(row);
  updateDateRows();
}
/**
 * Passe le formulaire entre « Date fixée » et « Date à caler » (sondage). En sondage, le nombre minimum de dates est rempli d'office.
 * @param {'fixed'|'poll'} mode mode choisi
 */
function setMode(mode) {
  form.elements.when.value = mode;
  $('#ev-fixed').hidden = mode !== 'fixed';
  $('#ev-poll').hidden = mode !== 'poll';
  if (mode === 'poll') { while ($$('.date-row', $('#ev-dates')).length < bornesSondage().min) addDateRow(); }
}
form.addEventListener('change', (e) => { if (e.target.name === 'when') setMode(e.target.value); });
$('#ev-add-date').addEventListener('click', () => { addDateRow(); $('#ev-dates .date-row:last-child input').focus(); });
$$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));

/**
 * Ouvre le formulaire de sortie : création (sans argument) ou modification (avec la sortie).
 * @param {object|null} [ev=null] sortie à modifier
 */
function openEventDialog(ev = null) {
  editing = ev;
  form.reset();
  $('#ev-dates').innerHTML = '';
  $('#ev-dlg-title').textContent = ev ? 'Modifier la sortie' : 'Proposer une sortie';
  $('#ev-submit').textContent = ev ? 'Enregistrer' : 'Créer la sortie';
  const cur = $('#ev-cover-current');
  cur.hidden = !ev?.cover_path;
  cur.innerHTML = ev?.cover_path ? `<label class="check"><input type="checkbox" name="remove_cover"><span>Retirer l'image de couverture actuelle</span></label>` : '';
  if (ev) {
    form.elements.title.value = ev.title || '';
    form.elements.location.value = ev.location || '';
    form.elements.description.value = ev.description || '';
    form.elements.starts_at.value = toLocalInput(ev.starts_at);
    if (!ev.starts_at) datesOf(ev.id).forEach((d) => addDateRow(toLocalInput(d.proposed_at), d.id));
  }
  setMode(ev && !ev.starts_at ? 'poll' : 'fixed');
  dlg.showModal();
  form.elements.title.focus();
}

// Enregistrement d'une sortie : création ou modification, dates du sondage, puis image de couverture.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = form.elements;
  const title = f.title.value.trim();
  const mode = f.when.value;
  if (!title) { toast('Donne un titre à la sortie.', 'error'); f.title.focus(); return; }
  let starts_at = null, pollRows = [];
  if (mode === 'fixed') {
    if (!f.starts_at.value) { toast('Indique une date, ou choisis « Date à caler ».', 'error'); f.starts_at.focus(); return; }
    starts_at = new Date(f.starts_at.value).toISOString();
    // Une nouvelle sortie se crée à l'avance (la base refuse une date passée, sauf « rencontre passée » ou Staff).
    if (!editing && !isAdmin && new Date(starts_at).getTime() < Date.now() - 3600000) {
      toast('Cette date est passée. Pour une rencontre qui a déjà eu lieu, utilise « Ajouter une rencontre passée ».', 'error');
      f.starts_at.focus(); return;
    }
  } else {
    pollRows = $$('.date-row input', $('#ev-dates')).filter((i) => i.value);
    const uniq = new Set(pollRows.map((i) => i.value));
    if (uniq.size !== pollRows.length) { toast('Deux dates proposées sont identiques.', 'error'); return; }
    const { min: sMin, max: sMax } = bornesSondage();
    if (pollRows.length < sMin || pollRows.length > sMax) { toast(`Propose entre ${sMin} et ${sMax} dates.`, 'error'); return; }
  }
  const payload = { title, location: f.location.value.trim() || null, description: f.description.value.trim() || null, starts_at };
  const coverFile = f.cover.files[0];
  const removeCover = !!f.remove_cover?.checked;
  const btn = $('#ev-submit');
  btn.disabled = true;
  try {
    let id = editing?.id;
    let resteSortie = null; // sorties qui rapportent encore des Paillettes cette semaine
    if (editing) {
      const { error } = await sb.from('hg_events').update(payload).eq('id', id);
      if (error) throw error;
    } else {
      resteSortie = restants(await lireQuota(), 'sortie');
      const { data, error } = await sb.from('hg_events').insert({ ...payload, created_by: me.id }).select().single();
      if (error) throw error;
      id = data.id;
    }

    // Dates du sondage
    const existing = editing ? datesOf(id) : [];
    if (mode === 'poll') {
      const keep = new Set(pollRows.filter((i) => i.dataset.id && i.value === i.dataset.orig).map((i) => i.dataset.id));
      const drop = existing.filter((d) => !keep.has(d.id)).map((d) => d.id);
      const add = pollRows.filter((i) => !(i.dataset.id && keep.has(i.dataset.id))).map((i) => ({ event_id: id, proposed_at: new Date(i.value).toISOString() }));
      if (drop.length) { const { error } = await sb.from('hg_event_dates').delete().in('id', drop); if (error) throw error; }
      if (add.length) { const { error } = await sb.from('hg_event_dates').insert(add); if (error) throw error; }
    } else if (existing.length) {
      const { error } = await sb.from('hg_event_dates').delete().eq('event_id', id);
      if (error) throw error;
    }

    // Couverture : on envoie la nouvelle d'abord (chemin unique), on met la ligne à jour, puis on supprime l'ancienne.
    const old = editing?.cover_path || null;
    try {
      if (coverFile) {
        const img = await prepareImage(coverFile);
        const path = `${me.id}/${id}/cover-${uuid().slice(0, 8)}.${img.ext}`;
        await uploadImage(path, img.blob);
        const { error } = await sb.from('hg_events').update({ cover_path: path }).eq('id', id);
        if (error) throw error;
        if (old) removeObjects([old]).catch(() => {});
      } else if (removeCover && old) {
        const { error } = await sb.from('hg_events').update({ cover_path: null }).eq('id', id);
        if (error) throw error;
        removeObjects([old]).catch(() => {});
      }
    } catch (err) { toast(`Sortie enregistrée, mais image non envoyée : ${errMsg(err)}`, 'error'); }

    if (!editing) notify('irl_new', { event_id: id });
    toast(editing ? 'Sortie mise à jour.' : messageSortie(resteSortie, 'Sortie proposée. Le gang est prévenu.'), 'ok');
    dlg.close();
    await refresh();
    if (!editing) { location.hash = `event-${id}`; goToHash(); }
  } catch (err) {
    toast(`Enregistrement impossible : ${errMsg(err)}`, 'error');
  } finally { btn.disabled = false; }
});

/* ---------- Démarrage ---------- */
hx = mountHistory({ me, isAdmin, S, classify, member, pseudo, canEdit, pluralCount, tint, I, refresh });
// Mode sans limite activé : on redessine pour afficher les réponses des sorties passées.
window.addEventListener('hg:godmode', () => { if (isAdmin) render().catch(() => {}); });
await refresh();
goToHash();
