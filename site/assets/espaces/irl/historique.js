// ===== Humane Gang — Historique, la frise des souvenirs (/pages/irl/historique.html) =====
// Frise chronologique : éditions du Secret Santa (avec « qui a offert à qui »), sorties IRL passées avec leurs photos,
// et « moments cultes » ajoutés à la main (avec image, réactions, modification et suppression).
// Dépendances : core.js, photos.js (images), image-compress.js, reactions.js, admin-ghosts.js (fantômes, admin, chargé à la demande),
// ui-confirm.js, ss-pairs.js (paires), reglages/valeurs-lot3.js (délai avant qu'un événement soit « passé »).
// Tables et RPC : hg_members, hg_ss_editions, hg_ss_progress, hg_events, hg_event_rsvps, hg_photos, hg_moments.
// N'exporte rien.
import { sb, initPage, toast, errMsg, esc, $, $$, fmtDate, avatarHtml, godLimit, godTag } from '../../commun/core.js';
import { uploadImage, removeObjects, signedUrls, openLightbox, uuid, thumbHtml, gridPath, selectPhotos } from './photos.js';
import { prepareImage } from '../../commun/image-compress.js';
import { loadReactions, reactionBarHtml } from '../../commun/reactions.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { svg } from '../../commun/icons.js';
import { pluralCount } from '../../commun/utils.js';
import { fetchPairs, peopleByPseudo, pairsHtml } from './ss-pairs.js';
import { chargerReglagesLot3, delaiPassee } from '../../commun/reglages/valeurs-lot3.js';
import { lireQuota, restants, messageSouvenir } from '../../commun/eco-quota.js';
import { reportButtonHtml, hiddenNoteHtml } from '../../commun/report.js'; // A6 : « Signaler » un moment

/* ---------- Initialisation : session membre, réglages, droits ---------- */
// me = personne connectée (la page exige un membre). isAdmin : l'admin voit plus de choses (fantômes, modifications d'autrui).
const me = await initPage({ auth: 'member' });
await chargerReglagesLot3();
const isAdmin = !!me?.is_admin;

/* ---------- Constantes et icônes ---------- */
// Nombre de vignettes de photos affichées par sortie (le reste est résumé par « +N »).
const THUMBS = 4;
const STATUS_LABEL = { revelation: 'Révélation', termine: 'Terminé' };
const KIND_LABEL = { ss: 'Secret Santa', irl: 'Sortie IRL', moment: 'Moment culte' };
const FILTER_LABEL = { all: 'tout', ss: 'Secret Santa', irl: 'IRL et albums', moment: 'moments cultes' };

const I = {
  gift: svg('gift', { size: 18, stroke: 1.8 }),
  pin: svg('pin', { size: 18, stroke: 1.8 }),
  star: svg('star', { size: 18, stroke: 1.8 }),
  people: svg('people', { size: 16, stroke: 1.8 }),
  arrow: svg('arrow', { size: 16, stroke: 2 }),
  edit: svg('edit2', { size: 16, stroke: 1.8 }),
  trash: svg('trash2', { size: 16, stroke: 1.8 }),
};

/* État de la page : données chargées, filtre actif. */
const S = { members: new Map(), people: new Map(), editions: [], progress: new Map(), pairs: new Map(), events: [], present: new Map(), photos: new Map(), moments: [], urls: new Map(), filter: 'all' };
/** Personne à partir de son identifiant ; « Ancien membre » si elle n'est plus dans l'annuaire. */
const member = (id) => S.members.get(id) || { pseudo: 'Ancien membre' };
/** Date SQL (AAAA-MM-JJ) à midi local, pour éviter un décalage d'un jour. */
const dayDate = (d) => new Date(`${d}T12:00:00`); // date SQL → midi local (évite les décalages de fuseau)

/* ---------- Données ---------- */
/**
 * Charge toute la frise : membres, éditions, sorties passées, moments, réactions, présences, photos, paires et URLs d'images.
 * Les requêtes sont groupées en Promise.all pour limiter les allers-retours. Lève une erreur si une requête de base échoue.
 */
async function load() {
  const pastLimit = new Date(Date.now() - delaiPassee()).toISOString();
  // Fantômes (admin) : module et lecture lancés avec les autres requêtes, pas après (un aller-retour de moins).
  const ghostsQ = me?.is_admin ? import('../admin/admin-ghosts.js').then((g) => g.ghostDirectory()) : null;
  const [m, ed, ev, mo, ghosts] = await Promise.all([
    sb.rpc('hg_members'),
    sb.from('hg_ss_editions').select('*').in('status', ['revelation', 'termine']).order('year', { ascending: false }),
    sb.from('hg_events').select('id,title,location,starts_at').not('starts_at', 'is', null).lt('starts_at', pastLimit).order('starts_at', { ascending: false }),
    sb.from('hg_moments').select('*').order('happened_on', { ascending: false }),
    ghostsQ,
  ]);
  const err = [m, ed, ev, mo].find((r) => r.error)?.error;
  if (err) throw err;
  S.members = new Map((m.data || []).map((x) => [x.id, x]));
  if (ghosts) for (const [id, g] of ghosts) S.members.set(id, g); // l'admin voit les fantômes, pas les membres
  S.editions = ed.data || [];
  S.events = ev.data || [];
  S.moments = mo.data || [];
  await loadReactions('moment', S.moments.map((x) => x.id), me.id); // une requête pour toutes les réactions de la page
  // Moments devenus des cartes (migration 080, C5) : pastille « En carte ». Sans la colonne, aucune pastille.
  const mc = await sb.from('hg_cards').select('id,moment_id').eq('active', true).not('moment_id', 'is', null);
  S.momentCards = new Map(mc.error ? [] : (mc.data || []).filter((k) => k.moment_id).map((k) => [k.moment_id, k.id]));

  const ids = S.events.map((e) => e.id);
  const [prog, rs, ph, pairs] = await Promise.all([
    Promise.all(S.editions.map((e) => sb.rpc('hg_ss_progress', { p_edition: e.id }))),
    ids.length ? sb.from('hg_event_rsvps').select('event_id,user_id').eq('status', 'oui').in('event_id', ids) : { data: [] },
    ids.length ? selectPhotos((cols) => sb.from('hg_photos').select(cols).in('event_id', ids).order('created_at', { ascending: true })) : { data: [] }, // Q3 : vignettes et dimensions
    Promise.all(S.editions.map((e) => fetchPairs(e.id))), // une requête par édition affichée (hg_ss_reveal)
  ]);
  const err2 = [...prog, rs, ph].find((r) => r.error)?.error;
  if (err2) throw err2;
  S.progress = new Map(S.editions.map((e, i) => {
    const d = prog[i].data;
    return [e.id, Array.isArray(d) ? d[0] : d];
  }));
  S.pairs = new Map(S.editions.map((e, i) => [e.id, pairs[i]]));
  S.people = peopleByPseudo(S.members);
  S.present = new Map();
  for (const r of rs.data || []) S.present.set(r.event_id, [...(S.present.get(r.event_id) || []), r.user_id]);
  S.photos = new Map();
  for (const p of ph.data || []) S.photos.set(p.event_id, [...(S.photos.get(p.event_id) || []), p]);

  const paths = [
    ...[...S.photos.values()].flatMap((l) => l.slice(0, THUMBS).map(gridPath)), // vignette 480 px si elle existe (Q3)
    ...S.moments.map((x) => x.image_path),
  ];
  S.urls = await signedUrls(paths);
}

/* ---------- Construction de la frise ---------- */
/**
 * Transforme les données en une liste d'éléments { kind, date, year, html }, triée du plus récent au plus ancien.
 * Une édition sans date d'échange est placée au 24 décembre de son année.
 * @returns {Array<{kind: string, date: Date, year: number, html: string}>}
 */
function items() {
  const out = [];
  for (const e of S.editions) {
    const date = e.exchange_date ? dayDate(e.exchange_date) : new Date(e.year, 11, 24, 12);
    out.push({ kind: 'ss', date, year: e.year, html: ssCard(e) });
  }
  for (const e of S.events) {
    const date = new Date(e.starts_at);
    out.push({ kind: 'irl', date, year: date.getFullYear(), html: irlCard(e) });
  }
  for (const m of S.moments) {
    const date = dayDate(m.happened_on);
    out.push({ kind: 'moment', date, year: date.getFullYear(), html: momentCard(m) });
  }
  return out.sort((a, b) => b.date - a.date);
}

/**
 * Carte d'une édition du Secret Santa : date, nombre de participants, budget, statut et paires.
 * @param {object} e l'édition (hg_ss_editions)
 * @returns {string} HTML
 */
function ssCard(e) {
  const p = S.progress.get(e.id);
  const n = p?.participants ?? 0;
  const date = e.exchange_date ? fmtDate(dayDate(e.exchange_date)) : `Décembre ${e.year}`;
  return `<article class="tl-card tl-card-ss">
    <div class="tl-kind">${I.gift}<span>Secret Santa · ${esc(date)}</span></div>
    <h3 class="tl-title">Secret Santa ${esc(e.year)}</h3>
    <div class="tl-tags">
      <span class="pill">${I.people}${pluralCount(n, 'participant', 'participants')}</span>
      ${e.budget ? `<span class="pill">Budget ${esc(e.budget)}</span>` : ''}
      <span class="pill ${e.status === 'termine' ? 'pill-ok' : 'pill-current'}">${esc(STATUS_LABEL[e.status] || e.status)}</span>
    </div>
    ${pairsBlock(e)}
  </article>`;
}

/** Bloc dépliable « Qui a offert à qui » ; rien quand l'édition n'a pas de paires enregistrées. */
function pairsBlock(e) {
  const pairs = S.pairs.get(e.id) || [];
  if (!pairs.length) return '';
  const label = e.status === 'termine' ? 'Qui a offert à qui ?' : 'Qui offrait à qui ?';
  return `<details class="ssp-details" data-edition="${esc(e.id)}">
      <summary>${label}</summary>
      <div class="ssp-body">${pairsHtml(pairs, S.people, { mePseudo: me.pseudo })}</div>
    </details>`;
}

/**
 * Carte d'une sortie IRL passée : lieu, présents, vignettes de l'album et lien vers /pages/irl/irl.html.
 * Les présents dont le compte n'est pas connu (fantômes) sont ignorés.
 * @param {object} e la sortie (hg_events)
 * @returns {string} HTML
 */
function irlCard(e) {
  const present = (S.present.get(e.id) || []).filter((id) => S.members.has(id)); // compte inconnu (fantôme) : ignoré
  const photos = S.photos.get(e.id) || [];
  const shown = photos.slice(0, THUMBS);
  const more = photos.length - shown.length;
  const href = `/pages/irl/irl.html#event-${encodeURIComponent(e.id)}`;
  const thumbs = shown.length ? `<ul class="tl-thumbs">
      ${shown.map((p, i) => `<li><a class="tl-thumb" href="${href}" aria-label="Photo ${i + 1} de l'album ${esc(e.title)}">${thumbHtml(S.urls.get(gridPath(p)), '', p)}</a></li>`).join('')}
      ${more > 0 ? `<li><a class="tl-thumb tl-thumb-more" href="${href}" aria-label="${more} autres photos dans l'album">+${more}</a></li>` : ''}
    </ul>` : '';
  return `<article class="tl-card tl-card-irl">
    <div class="tl-kind">${I.pin}<span>Sortie IRL · ${esc(fmtDate(e.starts_at))}</span></div>
    <h3 class="tl-title">${esc(e.title)}</h3>
    <p class="tl-meta small">${e.location ? `${esc(e.location)} · ` : ''}${present.length ? `${pluralCount(present.length, 'présent', 'présents')} : ${present.map((id) => esc(member(id).pseudo)).join(', ')}` : 'Présents non renseignés'}</p>
    ${thumbs}
    <a class="tl-link" href="${href}">${photos.length ? `Voir l'album (${pluralCount(photos.length, 'photo', 'photos')})` : 'Ajouter des photos à l\'album'} ${I.arrow}</a>
  </article>`;
}

/**
 * Carte d'un moment culte : image (agrandissable), texte, réactions, et boutons Modifier/Supprimer pour l'auteur ou l'admin.
 * @param {object} m le moment (hg_moments)
 * @returns {string} HTML
 */
function momentCard(m) {
  const url = m.image_path ? S.urls.get(m.image_path) : null;
  const author = m.created_by ? member(m.created_by) : null;
  const mine = m.created_by === me.id || isAdmin;
  const inCard = S.momentCards?.has(m.id);
  return `<article class="tl-card tl-card-moment" id="moment-${esc(m.id)}">
    <div class="tl-kind">${I.star}<span>Moment culte · ${esc(fmtDate(dayDate(m.happened_on)))}</span>${inCard ? '<a class="tl-incard" href="/pages/cartes/cartes.html#collection">En carte</a>' : ''}</div>
    <h3 class="tl-title">${esc(m.title)}</h3>
    ${url ? `<button type="button" class="tl-moment-img" data-act="zoom" data-id="${esc(m.id)}" aria-label="Agrandir l'image de « ${esc(m.title)} »"><img src="${esc(url)}" alt="" loading="lazy" decoding="async"></button>` : ''}
    ${m.body ? `<p class="tl-body">${esc(m.body)}</p>` : ''}
    ${m.hidden_at ? hiddenNoteHtml('moment') : ''}
    ${reactionBarHtml('moment', m.id)}
    <div class="tl-foot">
      ${author ? `<span class="tl-author">${avatarHtml(author, 26)}<span class="small muted">Raconté par ${esc(author.pseudo)}</span></span>` : '<span></span>'}
      ${mine ? `<span class="btn-row">
        <button type="button" class="btn btn-ghost btn-sm" data-act="edit" data-id="${esc(m.id)}">${I.edit}<span>Modifier</span></button>
        <button type="button" class="btn btn-danger btn-sm" data-act="delete" data-id="${esc(m.id)}">${I.trash}<span>Supprimer</span></button>
      </span>` : ''}
      ${m.created_by !== me.id ? reportButtonHtml('moment', m.id, m.title) : ''}
    </div>
  </article>`;
}

/**
 * Dessine la frise selon le filtre actif, groupée par année (la plus récente en premier).
 * Affiche un message d'accueil si la frise est vide, ou si la catégorie choisie n'a rien.
 */
function render() {
  const all = items();
  const list = S.filter === 'all' ? all : all.filter((x) => x.kind === S.filter);
  const tl = $('#timeline');
  if (!all.length) {
    tl.innerHTML = `<div class="hist-empty">
      <p class="display hist-empty-title">La frise est encore vierge.</p>
      <p class="muted">Les éditions du Secret Santa, les sorties passées et vos moments cultes s'afficheront ici, année après année. Commence par immortaliser un souvenir.</p>
      <div class="btn-row"><button type="button" class="btn btn-light" data-act="new">+ Ajouter un moment culte</button><a class="btn btn-ghost" href="/pages/irl/irl.html">Voir les sorties IRL</a></div>
    </div>`;
    return;
  }
  if (!list.length) {
    tl.innerHTML = `<p class="empty">Rien dans la catégorie « ${esc(FILTER_LABEL[S.filter])} » pour l'instant.</p>`;
    return;
  }
  const years = new Map();
  for (const it of list) years.set(it.year, [...(years.get(it.year) || []), it]);
  tl.innerHTML = [...years.entries()].sort((a, b) => b[0] - a[0]).map(([y, its]) => `
    <section class="tl-year" aria-labelledby="y-${y}">
      <h2 class="tl-year-title" id="y-${y}"><span>${y}</span><span class="tl-year-count small muted">${pluralCount(its.length, 'souvenir', 'souvenirs')}</span></h2>
      <ol class="tl-items">
        ${its.map((it) => `<li class="tl-item tl-${it.kind}"><span class="tl-dot" aria-hidden="true"></span><span class="visually-hidden">${KIND_LABEL[it.kind]}</span>${it.html}</li>`).join('')}
      </ol>
    </section>`).join('');
}

/** Recharge les données puis redessine ; en cas d'erreur, affiche un message et un toast. */
async function refresh() {
  try { await load(); render(); } catch (e) {
    $('#timeline').innerHTML = '<p class="empty">Impossible de charger l\'historique pour le moment.</p>';
    toast(`Chargement impossible : ${errMsg(e)}`, 'error');
  }
}

/* ---------- Interactions : filtres, clics sur la frise ---------- */
// Boutons de filtre (tout, Secret Santa, IRL, moments) : aria-pressed indique le bouton actif.
$$('.hf').forEach((b) => b.addEventListener('click', () => {
  S.filter = b.dataset.filter;
  $$('.hf').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  render();
  $('#hist-live').textContent = `Filtre : ${FILTER_LABEL[S.filter]}`;
}));

// Délégation sur la frise : un seul écouteur pour les boutons data-act (nouveau, modifier, supprimer, agrandir).
$('#timeline').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const m = S.moments.find((x) => x.id === b.dataset.id);
  if (b.dataset.act === 'new') openMomentDialog();
  else if (b.dataset.act === 'edit' && m) openMomentDialog(m);
  else if (b.dataset.act === 'delete' && m) deleteMoment(m);
  else if (b.dataset.act === 'zoom' && m) openLightbox([{ url: S.urls.get(m.image_path), alt: m.title, caption: m.title }]);
});
$('#btn-moment').addEventListener('click', () => openMomentDialog());

/**
 * Supprime un moment après confirmation, puis son image si elle appartient à la personne (ou si elle est admin).
 * La suppression de l'image est lancée sans attendre : un échec n'annule pas la suppression du moment.
 * @param {object} m le moment à supprimer
 */
async function deleteMoment(m) {
  if (!(await confirmBox(`Supprimer le moment « ${m.title} » ?`, '', { ok: 'Supprimer', danger: true }))) return;
  const { error } = await sb.from('hg_moments').delete().eq('id', m.id);
  if (error) return toast(`Suppression impossible : ${errMsg(error)}`, 'error');
  if (m.image_path && (isAdmin || m.image_path.startsWith(`${me.id}/`))) removeObjects([m.image_path]).catch(() => {});
  toast('Moment supprimé.', 'ok');
  await refresh();
}

/* ---------- Formulaire moment (ajout et modification) ---------- */
const dlg = $('#moment-dialog');
const form = $('#moment-form');
// Moment en cours de modification (null = ajout d'un nouveau moment).
let editing = null;
$$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));

/** Date du jour au format AAAA-MM-JJ (heure locale), pour le champ date. */
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/**
 * Ouvre la fenêtre d'ajout (sans argument) ou de modification (avec le moment).
 * @param {object|null} [m=null] moment à modifier
 */
function openMomentDialog(m = null) {
  editing = m;
  form.reset();
  $('#mo-dlg-title').textContent = m ? 'Modifier le moment' : 'Ajouter un moment culte';
  $('#mo-submit').textContent = m ? 'Enregistrer' : 'Ajouter';
  form.elements.title.value = m?.title || '';
  form.elements.body.value = m?.body || '';
  form.elements.happened_on.value = m?.happened_on || todayIso();
  godLimit(form.elements.happened_on, 'max', todayIso()); // date future autorisée en mode sans limite (admin)
  $('label[for="mo-date"]').innerHTML = `Date${godTag()}`;
  const cur = $('#mo-image-current');
  cur.hidden = !m?.image_path;
  cur.innerHTML = m?.image_path ? `<label class="check"><input type="checkbox" name="remove_image"><span>Retirer l'image actuelle</span></label>` : '';
  dlg.showModal();
  form.elements.title.focus();
}

// Enregistrement : nouvelle image d'abord (puis la ligne), et suppression de l'ancienne image seulement une fois la ligne à jour.
// En cas d'échec, la nouvelle image envoyée est retirée pour ne pas laisser de fichier orphelin.
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = form.elements;
  const title = f.title.value.trim();
  if (!title) { toast('Donne un titre à ce moment.', 'error'); f.title.focus(); return; }
  if (!f.happened_on.value) { toast('Indique la date du moment.', 'error'); f.happened_on.focus(); return; }
  const payload = { title, body: f.body.value.trim() || null, happened_on: f.happened_on.value };
  const file = f.image.files[0];
  const removeImg = !!f.remove_image?.checked;
  const old = editing?.image_path || null;
  const btn = $('#mo-submit');
  btn.disabled = true;
  let newPath = null;
  try {
    if (file) {
      const img = await prepareImage(file);
      newPath = `${me.id}/moments/${uuid()}.${img.ext}`;
      await uploadImage(newPath, img.blob);
      payload.image_path = newPath;
    } else if (removeImg) payload.image_path = null;

    const reste = editing ? null : restants(await lireQuota(), 'souvenirs'); // souvenirs qui rapportent encore aujourd'hui
    const { error } = editing
      ? await sb.from('hg_moments').update(payload).eq('id', editing.id)
      : await sb.from('hg_moments').insert({ ...payload, created_by: me.id });
    if (error) throw error;
    if (old && (file || removeImg) && (isAdmin || old.startsWith(`${me.id}/`))) removeObjects([old]).catch(() => {});
    toast(editing ? 'Moment mis à jour.' : messageSouvenir(reste, 'Moment ajouté à la frise.'), 'ok');
    dlg.close();
    await refresh();
  } catch (err) {
    if (newPath) removeObjects([newPath]).catch(() => {});
    toast(`Enregistrement impossible : ${errMsg(err)}`, 'error');
  } finally { btn.disabled = false; }
});

await refresh();
// Lien direct vers un moment (« Voir le moment » depuis une carte, migration 080) : on le montre une fois la frise dessinée.
if (location.hash.startsWith('#moment-')) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'center' });
// Secret caché « rembobine » : module chargé à part (/assets/espaces/arcade/pages.js).
import('../arcade/pages.js').then((m) => m.secretsHistorique()).catch(() => {});
