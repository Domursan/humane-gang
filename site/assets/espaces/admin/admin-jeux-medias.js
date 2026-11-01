// ===== Humane Gang — administration : Framed (films et affiches) (J9) et Heardle du gang (J10) =====
/*
 * Rôle : Jeux et cartes › Framed et Heardle. Deux parties :
 *  - Framed : éléments à deviner (films vus au ciné-club, affiches et tutos du site) avec jusqu'à 6 images envoyées dans le
 *    bucket privé hg-jeux (framed/<id>/<n>.webp, compressées par image-compress.js), et calendrier des manches. Les 6 images
 *    peuvent être découpées dans une affiche du site ou une image importée (admin/framed-crops.js), et les affiches du site
 *    peuvent être ajoutées en masse.
 *  - Heardle : propositions des membres à valider ou écarter, morceaux (lien YouTube, instant de départ), calendrier,
 *    annulation d'une manche (vidéo supprimée ou bloquée).
 * Droits : Staff « souvenirs » et administrateur (contrôlés aussi par les RPC, journalisées).
 * Route : #fete/framed-heardle (branchée par admin.js). Section : <section id="jeux-medias">, conteneur #jeux-medias-root.
 * RPC : hg_framed_admin, hg_framed_film_save, hg_framed_round_save, hg_heardle_admin, hg_heardle_track_save, hg_heardle_round_save.
 * Exporte : mountJeuxMediasSection, et pour la page Programmation (admin-programme.js) : filmsLibres, morceauxLibres, urlEcoute, urlsImages.
 */
import { sb, toast, errMsg, esc } from '../../commun/core.js';
import { prepareImage } from '../../commun/image-compress.js';
import { cropsFromImage, loadImage, loadManifest, norm } from './framed-crops.js';

const BUCKET = 'hg-jeux';
const dfmt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Zurich' });
const day = (d) => (d ? dfmt.format(new Date(d + 'T12:00:00Z')) : '');
/** Identifiant d'un film (UUID v4). crypto.randomUUID n'existe que dans un contexte sécurisé (pas en http hors localhost). */
const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
let root = null;
// picker : sélecteur d'image source ouvert ({ q }) ; bulk : ajout en masse (confirm, puis run) ; manifest : affiches du site
const S = { part: 'framed', F: null, H: null, edit: null, editT: null, urls: {}, files: {}, busy: false, picker: null, bulk: null, manifest: null };

/** Films programmables : proposés, avec 3 images au moins, sans manche (un élément ne revient jamais). */
export const filmsLibres = (F) => F.films.filter((f) => f.active && f.frames.length >= 3 && !f.day);
/** Morceaux programmables : validés et sans manche. */
export const morceauxLibres = (H) => H.tracks.filter((t) => t.status === 'valide' && !t.day);
/** Adresse YouTube d'un morceau, à son instant de départ. */
export const urlEcoute = (t) => `https://www.youtube.com/watch?v=${encodeURIComponent(t.youtube_id)}&t=${Number(t.start_s) || 0}s`;
/**
 * Adresses signées (10 min) d'images du bucket privé des jeux.
 * @param {string[]} paths Chemins dans le bucket.
 * @returns {Promise<Array<{path: string, signedUrl: string}>>}
 */
export async function urlsImages(paths) {
  if (!paths.length) return [];
  const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 600);
  return data || [];
}

/**
 * Monte la section.
 * @param {HTMLElement} el Conteneur #jeux-medias-root.
 */
export async function mountJeuxMediasSection(el) {
  root = el;
  root.addEventListener('click', onClick);
  root.addEventListener('submit', onSubmit);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  await load();
}

/** Charge les deux parties et la liste des affiches du site (un échec ne bloque pas le reste). */
async function load() {
  const [f, h, m] = await Promise.all([sb.rpc('hg_framed_admin'), sb.rpc('hg_heardle_admin'), loadManifest().catch(() => null)]);
  S.manifest = m;
  S.F = f.error || !f.data ? { error: f.error ? errMsg(f.error) : 'Données indisponibles' } : f.data;
  S.H = h.error || !h.data ? { error: h.error ? errMsg(h.error) : 'Données indisponibles' } : h.data;
  render();
}

/** Signe les images du film ouvert seulement : le catalogue compte plusieurs milliers d'images, et une adresse signée expire en 10 min. */
async function signerFilm(f) {
  for (const r of await urlsImages(f?.frames || [])) if (r.signedUrl) S.urls[r.path] = r.signedUrl;
}

/** Dessine la section. */
function render() {
  root.innerHTML = `<div class="jm">
    <div class="jm-tabs" role="group" aria-label="Jeu">
      <button type="button" class="jm-chip" data-part="framed" aria-pressed="${S.part === 'framed'}">Framed (films et affiches)</button>
      <button type="button" class="jm-chip" data-part="heardle" aria-pressed="${S.part === 'heardle'}">Heardle du gang</button>
    </div>
    ${S.part === 'framed' ? framedHtml() : heardleHtml()}</div>`;
}

/* ---------- Framed ---------- */
function framedHtml() {
  const F = S.F;
  if (F.error) return `<div class="empty">${esc(F.error)}</div>`;
  const usable = filmsLibres(F);
  const rounds = F.rounds.map((r) => `<li class="jm-row"><span class="jm-day">${esc(day(r.day))}</span><span class="jm-t">${esc(r.title)}</span>
      <span class="small muted">${esc(r.players)} joueur${r.players > 1 ? 's' : ''}</span>
      ${r.day >= F.today && !r.players ? `<button type="button" class="btn btn-ghost" data-act="f-unround" data-day="${esc(r.day)}">Retirer</button>` : ''}</li>`).join('');
  const films = F.films.map((f) => `<li class="jm-row"><span class="jm-t"><strong>${esc(f.title)}</strong>${f.year ? ` (${esc(f.year)})` : ''}${f.active ? '' : ' <span class="pill">masqué</span>'}</span>
      <span class="small muted">${f.seen_on ? `vu le ${esc(day(f.seen_on))} · ` : ''}${esc(f.frames.length)}/6 images${f.day ? ` · manche du ${esc(day(f.day))}` : ''}</span>
      <button type="button" class="btn btn-ghost" data-act="f-edit" data-id="${esc(f.id)}">Modifier</button></li>`).join('');
  return `<section class="jm-sec" aria-labelledby="jm-f-cal"><h3 id="jm-f-cal">Calendrier des manches</h3>
      <p class="small muted">Un jour sans manche, le premier passage tire au sort un élément jamais servi, avec 3 images au moins ; sans élément disponible, pas de partie. Un élément ne revient jamais ; la manche du jour ne change plus dès qu’un membre a joué.</p>
      <form class="jm-inline" id="jm-f-round"><label for="jm-f-day">Jour</label><input type="date" id="jm-f-day" class="input" min="${esc(F.today)}" value="${esc(F.today)}" required>
        <label for="jm-f-film">Film ou affiche</label><select id="jm-f-film" class="input" required>${usable.map((f) => `<option value="${esc(f.id)}">${esc(f.title)}</option>`).join('') || '<option value="">Aucun élément prêt (3 images au moins)</option>'}</select>
        <button type="submit" class="btn btn-primary" ${usable.length ? '' : 'disabled'}>Programmer</button></form>
      <ul class="jm-list">${rounds || '<li class="empty">Aucune manche programmée.</li>'}</ul></section>
    <section class="jm-sec" aria-labelledby="jm-f-films"><div class="jm-sec-h"><h3 id="jm-f-films">Films et affiches (${esc(F.films.length)})</h3>
      <button type="button" class="btn btn-primary" data-act="f-new">+ Nouveau film</button></div>
      ${bulkHtml()}
      ${S.edit ? filmFormHtml() : ''}
      <ul class="jm-list">${films || '<li class="empty">Aucun film.</li>'}</ul></section>`;
}

/** Formulaire d'un film (6 emplacements d'image). */
function filmFormHtml() {
  const f = S.edit;
  const slots = Array.from({ length: 6 }, (_, i) => {
    const p = f.frames[i], url = S.files[i] ? URL.createObjectURL(S.files[i]) : p && S.urls[p];
    return `<div class="jm-slot"><span class="small">Image ${i + 1}${i === 0 ? ' (la plus difficile)' : i === 5 ? ' (la plus facile)' : ''}</span>
      ${url ? `<img src="${esc(url)}" alt="Image ${i + 1}">` : '<span class="jm-empty muted small">vide</span>'}
      <input type="file" accept="image/png,image/jpeg,image/webp" data-slot="${i}" aria-label="Image ${i + 1}"></div>`;
  }).join('');
  return `<form class="card jm-form" id="jm-film-form"><h4>${f.id ? 'Modifier le film' : 'Nouveau film'}</h4>
    <div class="jm-grid">
      <div class="field"><label for="jm-title">Titre (la réponse)</label><input id="jm-title" class="input" maxlength="120" required value="${esc(f.title || '')}"></div>
      <div class="field"><label for="jm-year">Année</label><input id="jm-year" class="input" type="number" min="1890" max="2100" value="${esc(f.year || '')}"></div>
      <div class="field"><label for="jm-seen">Vu en séance le</label><input id="jm-seen" class="input" type="date" value="${esc(f.seen_on || '')}"></div>
      <div class="field"><label for="jm-viewers">Spectateurs</label><input id="jm-viewers" class="input" type="number" min="0" max="500" value="${esc(f.viewers ?? '')}"></div>
    </div>
    <label class="check"><input type="checkbox" id="jm-active" ${f.active !== false ? 'checked' : ''}> Proposé dans les suggestions</label>
    <p class="small muted">Quelques images fixes, jamais publiques : des plans sans titre ni générique, de la plus énigmatique à la plus parlante.</p>
    <div class="jm-from"><button type="button" class="btn btn-ghost" data-act="f-from-poster" aria-expanded="${S.picker ? 'true' : 'false'}" aria-controls="jm-picker" ${S.busy ? 'disabled' : ''}>Créer les images depuis une affiche</button></div>
    ${S.picker ? pickerHtml() : ''}
    <div class="jm-slots">${slots}</div>
    <div class="jm-actions"><button type="button" class="btn btn-ghost" data-act="f-cancel">Annuler</button><button type="submit" class="btn btn-primary" ${S.busy ? 'disabled' : ''}>Enregistrer</button></div></form>`;
}

/** Enregistre le film : envoie les nouvelles images puis la fiche. */
async function saveFilm() {
  const f = S.edit, id = f.id || newId();
  S.busy = true;
  try {
    const frames = [...f.frames];
    for (const [i, file] of Object.entries(S.files)) {
      const img = await prepareImage(file, { max: 1280 });
      if (!['webp', 'jpg', 'png'].includes(img.ext)) throw new Error('Format d’image non accepté (WebP, JPEG ou PNG)');
      const path = `framed/${id}/${Number(i) + 1}.${img.ext}`;
      const { error } = await sb.storage.from(BUCKET).upload(path, img.blob, { contentType: img.contentType, upsert: true });
      if (error) throw error;
      frames[i] = path;
      S.urls[path] = null;
    }
    const v = (s) => root.querySelector(s).value.trim();
    const { error } = await sb.rpc('hg_framed_film_save', { p: { id, title: v('#jm-title'), year: v('#jm-year'), seen_on: v('#jm-seen'), viewers: v('#jm-viewers'),
      active: root.querySelector('#jm-active').checked, frames: frames.filter(Boolean) } });
    if (error) throw error;
    toast('Film enregistré.', 'ok');
    S.edit = null; S.files = {};
  } catch (e) { toast(errMsg(e), 'error'); }
  S.busy = false;
  await load();
}

/* ---------- Images depuis une affiche du site ---------- */

/** Sélecteur d'image source : liste des affiches et tutos du site (filtrable) et import d'une image. */
function pickerHtml() {
  const q = S.picker.q || '';
  return `<div class="jm-picker" id="jm-picker" role="group" aria-label="Image source">
    <div class="field"><label for="jm-pk-q">Chercher une affiche ou un tuto du site</label>
      <input type="search" id="jm-pk-q" class="input" value="${esc(q)}" autocomplete="off" placeholder="Titre"></div>
    <ul class="jm-pk-list" id="jm-pk-list">${pickerListHtml(q)}</ul>
    <div class="field"><label for="jm-pk-file">Importer une image…</label>
      <input type="file" id="jm-pk-file" accept="image/png,image/jpeg,image/webp"></div>
    <p class="small muted" id="jm-pk-status" role="status"></p>
    <div class="jm-actions"><button type="button" class="btn btn-ghost" data-act="f-pick-close">Fermer</button></div></div>`;
}

/** Lignes du sélecteur : titre et type de chaque affiche du site qui correspond à la recherche. */
function pickerListHtml(q) {
  if (!S.manifest) return '<li class="empty">Liste des affiches indisponible.</li>';
  const n = norm(q);
  return S.manifest.map((e, i) => ({ e, i })).filter(({ e }) => !n || norm(e.title).includes(n))
    .map(({ e, i }) => `<li><button type="button" class="jm-pk-item" data-pick="${i}">
      <img src="${esc(e.src)}" alt="" width="36" height="50" loading="lazy" decoding="async">
      <span class="jm-pk-t">${esc(e.title)}</span><span class="small muted">${e.kind === 'affiche' ? 'Affiche' : 'Tuto'}</span></button></li>`).join('')
    || '<li class="empty">Aucune affiche ne correspond.</li>';
}

/** Garde dans S.edit les valeurs saisies dans le formulaire du film, avant un nouveau dessin. */
function keepForm() {
  if (!S.edit || !root.querySelector('#jm-film-form')) return;
  const v = (s) => root.querySelector(s)?.value;
  Object.assign(S.edit, { title: v('#jm-title'), year: v('#jm-year'), seen_on: v('#jm-seen'), viewers: v('#jm-viewers'), active: root.querySelector('#jm-active')?.checked });
}

/** Ouvre ou ferme le sélecteur d'image source. */
function togglePicker() {
  keepForm();
  S.picker = S.picker ? null : { q: '' };
  render();
  root.querySelector(S.picker ? '#jm-pk-q' : '[data-act="f-from-poster"]')?.focus();
}

/** Écrit un message dans le sélecteur sans le redessiner (la recherche garde le focus). */
function setPickStatus(t) {
  const el = root.querySelector('#jm-pk-status');
  if (el) el.textContent = t;
}

/**
 * Remplit les 6 emplacements d'image avec les découpes d'une image source (affiche du site ou fichier importé).
 * Le titre n'est rempli depuis l'affiche que s'il est vide.
 * @param {() => Promise<HTMLImageElement>} getImg Chargement de l'image.
 * @param {string} seed Graine des découpes (slug ou nom du fichier).
 * @param {string} title Titre proposé (vide pour un fichier importé).
 */
async function fillFromSource(getImg, seed, title) {
  if (S.busy) return;
  keepForm();
  S.busy = true;
  setPickStatus('Création des images…');
  try {
    const blobs = await cropsFromImage(await getImg(), seed);
    S.files = {};
    blobs.forEach((b, i) => { S.files[i] = new File([b], `${seed}-${i + 1}.webp`, { type: 'image/webp' }); });
    if (title && !S.edit.title) S.edit.title = title;
    S.picker = null;
    toast('Six images créées. Vérifie l’ordre, puis enregistre.', 'ok');
  } catch (e) { toast(errMsg(e), 'error'); }
  S.busy = false;
  render();
}

/* ---------- Ajout en masse des affiches du site ---------- */

/** Affiches du site dont le titre n'est pas encore celui d'un film (sans tenir compte de la casse ni des accents). */
function missingEntries() {
  if (!S.manifest || !S.F?.films) return [];
  const titres = new Set(S.F.films.map((f) => norm(f.title)));
  return S.manifest.filter((e) => !titres.has(norm(e.title)));
}

/** Bouton d'ajout en masse, puis confirmation sur place, puis progression. */
function bulkHtml() {
  const B = S.bulk;
  if (B?.phase === 'run') return `<p class="card" role="status" id="jm-bulk-status">${esc(B.done)} / ${esc(B.total)}…${B.failed ? ` · ${esc(B.failed)} en échec` : ''}</p>`;
  if (!S.manifest) return '<p class="small muted">Liste des affiches du site indisponible.</p>';
  const n = missingEntries().length;
  if (B?.phase === 'confirm') return `<div class="card jm-bulk"><p>Créer ${esc(n)} film${n > 1 ? 's' : ''} à partir des affiches et tutos du site ? Chacun reçoit 6 images découpées dans son image, et son titre comme réponse. Ils seront proposés dans les suggestions.</p>
    <div class="jm-actions"><button type="button" class="btn btn-ghost" data-act="f-bulk-no">Annuler</button><button type="button" class="btn btn-primary" data-act="f-bulk-go">Créer ${esc(n)}</button></div></div>`;
  return n
    ? `<div class="jm-from"><button type="button" class="btn btn-ghost" data-act="f-bulk" ${S.busy ? 'disabled' : ''}>Ajouter les affiches du site (${esc(n)})</button></div>`
    : '<p class="small muted">Toutes les affiches du site sont déjà dans la liste.</p>';
}

/**
 * Crée un film à partir d'une entrée du site : 6 images dans hg-jeux (framed/<id>/<n>.webp), puis la fiche.
 * En cas d'échec, les images déjà envoyées sont retirées du stockage.
 * @param {{slug: string, title: string, src: string}} e Entrée de la liste des affiches.
 */
async function filmFromEntry(e) {
  const id = newId(), frames = [];
  const blobs = await cropsFromImage(await loadImage(e.src), e.slug);
  try {
    for (let n = 1; n <= 6; n++) {
      const path = `framed/${id}/${n}.webp`;
      const { error } = await sb.storage.from(BUCKET).upload(path, blobs[n - 1], { contentType: 'image/webp', upsert: true });
      if (error) throw error;
      frames.push(path);
    }
    const { error } = await sb.rpc('hg_framed_film_save', { p: { id, title: e.title, year: null, seen_on: null, viewers: null, active: true, frames } });
    if (error) throw error;
  } catch (err) {
    if (frames.length) sb.storage.from(BUCKET).remove(frames).catch(() => {});
    throw err;
  }
}

/** Ajout en masse : une affiche après l'autre, progression, erreurs comptées sans arrêter le lot. */
async function bulkRun() {
  if (S.busy) return;
  const list = missingEntries();
  S.busy = true;
  S.bulk = { phase: 'run', done: 0, total: list.length, failed: 0, err: '' };
  render();
  for (const e of list) {
    try { await filmFromEntry(e); } catch (err) { S.bulk.failed++; S.bulk.err = errMsg(err); }
    S.bulk.done++;
    setBulkStatus();
  }
  const { total, failed, err } = S.bulk;
  S.bulk = null;
  S.busy = false;
  toast(failed ? `${total - failed} ajouté${total - failed > 1 ? 's' : ''}, ${failed} en échec (${err}).` : `${total} film${total > 1 ? 's' : ''} ajouté${total > 1 ? 's' : ''}.`, failed ? 'error' : 'ok');
  await load();
}

/** Met à jour la progression sans redessiner la liste. */
function setBulkStatus() {
  const el = root.querySelector('#jm-bulk-status');
  if (el) el.textContent = `${S.bulk.done} / ${S.bulk.total}…${S.bulk.failed ? ` · ${S.bulk.failed} en échec` : ''}`;
}

/* ---------- Heardle ---------- */
function heardleHtml() {
  const H = S.H;
  if (H.error) return `<div class="empty">${esc(H.error)}</div>`;
  const props = H.tracks.filter((t) => t.status === 'propose');
  const ok = H.tracks.filter((t) => t.status === 'valide');
  const free = morceauxLibres(H);
  const row = (t, acts) => `<li class="jm-row"><span class="jm-t"><strong>${esc(t.artist)} — ${esc(t.title)}</strong></span>
      <span class="small muted">départ ${esc(t.start_s)} s${t.proposed_pseudo ? ` · proposé par ${esc(t.proposed_pseudo)}` : ''}${t.shared_on ? ` · ${esc(t.shared_on)}` : ''}${t.day ? ` · manche du ${esc(day(t.day))}` : ''}</span>
      <a class="btn btn-ghost" href="${esc(urlEcoute(t))}" target="_blank" rel="noopener">Écouter</a>${acts}</li>`;
  const rounds = H.rounds.map((r) => `<li class="jm-row"><span class="jm-day">${esc(day(r.day))}</span><span class="jm-t">${esc(r.artist)} — ${esc(r.title)}${r.cancelled ? ' <span class="pill">annulée</span>' : ''}</span>
      <span class="small muted">${esc(r.players)} joueur${r.players > 1 ? 's' : ''}</span>
      ${r.day >= H.today && !r.cancelled ? `<button type="button" class="btn btn-ghost" data-act="h-cancel" data-day="${esc(r.day)}">Annuler la manche</button>` : ''}</li>`).join('');
  return `<section class="jm-sec" aria-labelledby="jm-h-cal"><h3 id="jm-h-cal">Calendrier des manches</h3>
      <p class="small muted">Vérifie que la vidéo se lit en Suisse avant de la programmer. Une vidéo supprimée : « Annuler la manche ».</p>
      <form class="jm-inline" id="jm-h-round"><label for="jm-h-day">Jour</label><input type="date" id="jm-h-day" class="input" min="${esc(H.today)}" value="${esc(H.today)}" required>
        <label for="jm-h-track">Morceau</label><select id="jm-h-track" class="input" required>${free.map((t) => `<option value="${esc(t.id)}">${esc(t.artist)} — ${esc(t.title)}</option>`).join('') || '<option value="">Aucun morceau libre</option>'}</select>
        <button type="submit" class="btn btn-primary" ${free.length ? '' : 'disabled'}>Programmer</button></form>
      <ul class="jm-list">${rounds || '<li class="empty">Aucune manche programmée.</li>'}</ul></section>
    <section class="jm-sec" aria-labelledby="jm-h-props"><h3 id="jm-h-props">Propositions des membres (${esc(props.length)})</h3>
      <ul class="jm-list">${props.map((t) => row(t, `<button type="button" class="btn btn-primary" data-act="h-edit" data-id="${esc(t.id)}">Valider…</button><button type="button" class="btn btn-ghost" data-act="h-reject" data-id="${esc(t.id)}">Écarter</button>`)).join('') || '<li class="empty">Aucune proposition en attente.</li>'}</ul></section>
    <section class="jm-sec" aria-labelledby="jm-h-tracks"><div class="jm-sec-h"><h3 id="jm-h-tracks">Morceaux du gang (${esc(ok.length)})</h3>
      <button type="button" class="btn btn-primary" data-act="h-new">+ Nouveau morceau</button></div>
      ${S.editT ? trackFormHtml() : ''}
      <ul class="jm-list">${ok.map((t) => row(t, `<button type="button" class="btn btn-ghost" data-act="h-edit" data-id="${esc(t.id)}">Modifier</button>`)).join('') || '<li class="empty">Aucun morceau.</li>'}</ul></section>`;
}

/** Formulaire d'un morceau. */
function trackFormHtml() {
  const t = S.editT;
  return `<form class="card jm-form" id="jm-track-form"><h4>${t.id ? (t.status === 'propose' ? 'Valider la proposition' : 'Modifier le morceau') : 'Nouveau morceau'}</h4>
    <div class="jm-grid">
      <div class="field"><label for="jm-t-title">Titre</label><input id="jm-t-title" class="input" maxlength="120" required value="${esc(t.title || '')}"></div>
      <div class="field"><label for="jm-t-artist">Artiste</label><input id="jm-t-artist" class="input" maxlength="120" required value="${esc(t.artist || '')}"></div>
      <div class="field"><label for="jm-t-yt">Lien ou identifiant YouTube</label><input id="jm-t-yt" class="input" maxlength="200" required value="${esc(t.youtube_id || '')}"></div>
      <div class="field"><label for="jm-t-start">Départ (secondes)</label><input id="jm-t-start" class="input" type="number" min="0" max="36000" value="${esc(t.start_s ?? 0)}"></div>
      <div class="field"><label for="jm-t-where">Où et quand</label><input id="jm-t-where" class="input" maxlength="60" value="${esc(t.shared_on || '')}" placeholder="#musique, mars 2023"></div>
    </div>
    <div class="jm-actions"><button type="button" class="btn btn-ghost" data-act="h-cancel-edit">Annuler</button><button type="submit" class="btn btn-primary">${t.status === 'propose' ? 'Valider' : 'Enregistrer'}</button></div></form>`;
}

/* ---------- Événements ---------- */
async function rpc(name, args, ok) {
  const { error } = await sb.rpc(name, args);
  if (error) { toast(errMsg(error), 'error'); return; }
  if (ok) toast(ok, 'ok');
  await load();
}

function onClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.part) { S.part = b.dataset.part; render(); return; }
  if (b.dataset.pick !== undefined) { const e = S.manifest?.[Number(b.dataset.pick)]; if (e) fillFromSource(() => loadImage(e.src), e.slug, e.title); return; }
  const a = b.dataset.act;
  if (a === 'f-new') { S.ouverture = null; S.edit = { frames: [], active: true }; S.files = {}; S.picker = null; render(); root.querySelector('#jm-title')?.focus(); }
  if (a === 'f-edit') {
    const film = structuredClone(S.F.films.find((f) => f.id === b.dataset.id));
    S.ouverture = film;
    signerFilm(film).finally(() => {
      if (S.ouverture !== film) return;
      S.edit = film; S.files = {}; S.picker = null; render(); root.querySelector('#jm-title')?.focus();
    });
  }
  if (a === 'f-cancel') { S.ouverture = null; S.edit = null; S.files = {}; S.picker = null; render(); }
  if (a === 'f-from-poster') togglePicker();
  if (a === 'f-pick-close') { S.picker = null; render(); root.querySelector('[data-act="f-from-poster"]')?.focus(); }
  if (a === 'f-bulk') { S.bulk = { phase: 'confirm' }; render(); root.querySelector('[data-act="f-bulk-go"]')?.focus(); }
  if (a === 'f-bulk-no') { S.bulk = null; render(); root.querySelector('[data-act="f-bulk"]')?.focus(); }
  if (a === 'f-bulk-go') bulkRun();
  if (a === 'f-unround') rpc('hg_framed_round_save', { p_day: b.dataset.day, p_film: null }, 'Manche retirée.');
  if (a === 'h-new') { S.editT = { status: 'valide' }; render(); root.querySelector('#jm-t-title')?.focus(); }
  if (a === 'h-edit') { S.editT = { ...S.H.tracks.find((t) => t.id === b.dataset.id) }; render(); root.querySelector('#jm-t-title')?.focus(); }
  if (a === 'h-cancel-edit') { S.editT = null; render(); }
  if (a === 'h-reject') { const t = S.H.tracks.find((x) => x.id === b.dataset.id); rpc('hg_heardle_track_save', { p: { ...t, status: 'retire' } }, 'Proposition écartée.'); }
  if (a === 'h-cancel') rpc('hg_heardle_round_save', { p_day: b.dataset.day, p_track: null, p_cancel: true }, 'Manche annulée.');
}

function onChange(e) {
  if (e.target.id === 'jm-pk-file') {
    // Image importée : découpée comme une affiche, sans titre proposé.
    const f = e.target.files?.[0];
    if (f) fillFromSource(() => loadImage(f), f.name.replace(/\.[^.]+$/, '') || 'image', '');
    return;
  }
  const i = e.target.dataset?.slot;
  if (i === undefined || !e.target.files?.[0]) return;
  // Mémorise les valeurs saisies avant de redessiner l'aperçu.
  keepForm();
  S.files[i] = e.target.files[0];
  render();
}

/** Recherche dans le sélecteur d'affiches : seule la liste est redessinée. */
function onInput(e) {
  if (e.target.id !== 'jm-pk-q' || !S.picker) return;
  S.picker.q = e.target.value;
  const ul = root.querySelector('#jm-pk-list');
  if (ul) ul.innerHTML = pickerListHtml(S.picker.q);
}

async function onSubmit(e) {
  e.preventDefault();
  const id = e.target.id;
  if (id === 'jm-film-form') return saveFilm();
  if (id === 'jm-f-round') return rpc('hg_framed_round_save', { p_day: root.querySelector('#jm-f-day').value, p_film: root.querySelector('#jm-f-film').value }, 'Manche programmée.');
  if (id === 'jm-h-round') return rpc('hg_heardle_round_save', { p_day: root.querySelector('#jm-h-day').value, p_track: root.querySelector('#jm-h-track').value, p_cancel: false }, 'Manche programmée.');
  if (id === 'jm-track-form') {
    const v = (s) => root.querySelector(s).value.trim();
    const t = S.editT;
    const p = { title: v('#jm-t-title'), artist: v('#jm-t-artist'), youtube_id: v('#jm-t-yt'), start_s: Number(v('#jm-t-start')) || 0, shared_on: v('#jm-t-where'), status: 'valide' };
    if (t.id) Object.assign(p, { id: t.id, proposed_by: t.proposed_by || '' });
    S.editT = null;
    return rpc('hg_heardle_track_save', { p }, 'Morceau enregistré.');
  }
}
