// ===== Humane Gang — challenge de la semaine : fichiers des participations (envoi, retrait, affichage) =====
// Rôle : contrôle du fichier choisi selon le type de réponse attendu (answer_type), compression des images (WebP),
// envoi dans le bucket privé « hg-challenges » avec barre de progression, retrait, liens signés courts et aperçus
// (image, vidéo, son, PDF, texte, autre fichier). Partagé par la page du challenge et la fiche de suivi du panel.
// Chemin d'un fichier : <challenge_id>/<32 caractères hexadécimaux>.<ext> (forme exigée par la migration 218, sans l'identifiant
// du membre : rien ne trahit l'auteur pendant le vote). 25 Mo au plus.
// Jamais de HTML ni de SVG (un SVG peut contenir du script) : refusés avant l'envoi, et le bucket les refuse aussi.
// Envoi : XMLHttpRequest vers l'API de stockage (seul moyen de suivre l'avancement), avec le jeton de la session de la page ;
// sans elle (client simulé des tests), repli sur storage.upload du client (progression 0 puis 100 %).
// Dépendances : core.js (sb, esc), config.js (clé publique), core/comptes-etat.js (page figée, compte de la page),
// image-compress.js (prepareImage), challenge-commun.js (textes des types).
// Exporte : WCH_BUCKET, WCH_MAX_BYTES, fileSize, kindOf, acceptOf, prepareEntryFile, uploadEntryFile, removeEntryFiles,
// mediaHtml, thumbHtml, fileLinkHtml, hydrateMedia, signedUrl.
import { sb, esc } from '../../commun/core.js';
import { SUPABASE_KEY } from '../../commun/config.js';
import { estFige, comptePage, sujetJeton } from '../../commun/core/comptes-etat.js';
import { prepareImage } from '../../commun/image-compress.js';
import { svg } from '../../commun/icons.js';
import { typeOf, pluriel } from './challenge-commun.js';

/** Bucket privé des participations (migration 218). */
export const WCH_BUCKET = 'hg-challenges';
/** Taille maximale d'un fichier, en octets (25 Mo, comme le bucket). */
export const WCH_MAX_BYTES = 26214400;
/** Durée de validité d'un lien signé, en secondes (assez pour lire une vidéo de 25 Mo jusqu'au bout). */
const SIGNED_TTL = 600;

/* ---------- Formats acceptés ---------- */
// Extension → [type MIME envoyé au stockage, famille]. Mêmes types que le bucket ; jamais HTML ni SVG.
const EXT = {
  jpg: ['image/jpeg', 'image'], jpeg: ['image/jpeg', 'image'], png: ['image/png', 'image'], webp: ['image/webp', 'image'], gif: ['image/gif', 'image'],
  mp4: ['video/mp4', 'video'], webm: ['video/webm', 'video'], mov: ['video/quicktime', 'video'],
  mp3: ['audio/mpeg', 'audio'], ogg: ['audio/ogg', 'audio'], oga: ['audio/ogg', 'audio'], wav: ['audio/wav', 'audio'], m4a: ['audio/mp4', 'audio'],
  pdf: ['application/pdf', 'pdf'],
  txt: ['text/plain', 'doc'], zip: ['application/zip', 'doc'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'doc'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'doc'],
  pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', 'doc'],
  odt: ['application/vnd.oasis.opendocument.text', 'doc'], ods: ['application/vnd.oasis.opendocument.spreadsheet', 'doc'],
};
/** Extension normalisée dans le chemin du fichier (jpeg → jpg, oga → ogg). */
const EXT_NORM = { jpeg: 'jpg', oga: 'ogg' };
/** Familles acceptées par type de réponse (texte : aucun fichier). */
const FAMILLES = { image: ['image'], video: ['video'], audio: ['audio'], pdf: ['pdf'], texte: [], tout: ['image', 'video', 'audio', 'pdf', 'doc'] };
/** Extensions jamais acceptées, quel que soit le type (contenu actif). */
const INTERDITES = new Set(['svg', 'svgz', 'html', 'htm', 'xhtml', 'xht', 'js', 'mjs']);

/** Extension en minuscules d'un nom de fichier (sans le point), ou ''. */
const extOf = (name) => (/\.([a-z0-9]{1,8})$/i.exec(String(name || ''))?.[1] || '').toLowerCase();

/** Attribut accept du champ de fichier pour un type de réponse. */
export function acceptOf(answerType) {
  const fam = FAMILLES[answerType] || FAMILLES.image;
  const exts = Object.entries(EXT).filter(([, [, f]]) => fam.includes(f));
  return [...new Set([...exts.map(([, [m]]) => m), ...exts.map(([e]) => `.${e}`)])].join(',');
}

/** Taille lisible, en français (« 310 Ko », « 1,4 Mo »). */
export function fileSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} o`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`;
  return `${(v / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

/**
 * Famille d'affichage d'une participation : image, video, audio, pdf, texte (sans fichier) ou fichier (autre document).
 * @param {{mime?: string, path?: string|null, body?: string|null}} e participation
 */
export function kindOf(e) {
  if (!e?.path) return 'texte';
  const m = String(e.mime || '');
  if (m.startsWith('image/') && m !== 'image/svg+xml') return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  return 'fichier';
}

/**
 * Prépare le fichier choisi : contrôle du type (selon answer_type), du poids, compression des images (WebP, 1600 px).
 * @param {File} file fichier choisi
 * @param {string} answerType type de réponse du challenge
 * @returns {Promise<{blob: Blob, ext: string, contentType: string, name: string, size: number, original: number, isImage: boolean, kind: string}>}
 * @throws {Error} message en français si le fichier est refusé
 */
export async function prepareEntryFile(file, answerType) {
  const name = String(file?.name || 'fichier');
  const ext = extOf(name);
  const def = EXT[ext];
  const fam = FAMILLES[answerType] || FAMILLES.image;
  if (!file || INTERDITES.has(ext) || /svg|html/i.test(file.type || '') || !def || !fam.includes(def[1])) {
    throw new Error(`« ${name} » refusé : ${typeOf(answerType).refus}.`);
  }
  if (file.size > WCH_MAX_BYTES) {
    throw new Error(`« ${name} » est trop lourd (${fileSize(file.size)}) : 25 Mo maximum. Réduis sa taille ou choisis ${typeOf(answerType).autre}.`);
  }
  const [mime, famille] = def;
  let out = { blob: file, ext: EXT_NORM[ext] || ext, contentType: mime };
  if (famille === 'image') {
    // Le type déclaré par le navigateur peut manquer : l'image est relue avec le type de son extension.
    const img = file.type === mime ? file : new File([file], name, { type: mime });
    out = await prepareImage(img, { max: 1600 });
  }
  if (out.blob.size > WCH_MAX_BYTES) throw new Error(`« ${name} » reste trop lourd après compression : 25 Mo maximum.`);
  return {
    blob: out.blob, ext: out.ext, contentType: out.contentType, name: name.slice(0, 120),
    size: out.blob.size, original: file.size, isImage: famille === 'image', kind: famille === 'doc' ? 'fichier' : famille,
  };
}

/** Nom aléatoire de 32 caractères hexadécimaux (crypto.getRandomValues, disponible même hors contexte sécurisé). */
function randomId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return h;
}

/** Message français d'un refus du stockage (réponse JSON { message } ou statut HTTP). */
function storageError(status, body) {
  const m = String(body?.message || body?.error || '');
  if (status === 413 || /maximum allowed size|too large/i.test(m)) return new Error('Fichier trop lourd pour le stockage : 25 Mo maximum.');
  if (/mime type|not supported/i.test(m)) return new Error('Ce type de fichier est refusé par le stockage.');
  if (status === 401 || status === 403) return new Error('Envoi refusé : reconnecte-toi puis réessaie.');
  return new Error(m ? `Envoi impossible : ${m}` : `Envoi impossible (erreur ${status || 'réseau'}).`);
}

/**
 * Envoie le fichier préparé par XMLHttpRequest, pour suivre la progression. Mêmes en-têtes que storage.upload du client.
 * @returns {Promise<void>}
 */
async function xhrUpload(api, path, prepared, onProgress) {
  if (estFige()) throw new Error('Compte changé dans un autre onglet : rien n’est envoyé.');
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error('Envoi refusé : reconnecte-toi puis réessaie.');
  // Même garde que fetchGarde (core/comptes-etat.js) : jamais le jeton d'un autre compte que celui de la page.
  if (comptePage() && sujetJeton(token) !== comptePage()) throw new Error('Compte changé dans un autre onglet : rien n’est envoyé.');
  await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${api.url}/object/${WCH_BUCKET}/${path}`);
    x.setRequestHeader('Authorization', `Bearer ${token}`);
    x.setRequestHeader('apikey', SUPABASE_KEY);
    x.setRequestHeader('x-upsert', 'false');
    x.setRequestHeader('cache-control', 'max-age=3600');
    x.setRequestHeader('content-type', prepared.contentType);
    x.upload.onprogress = (ev) => { if (ev.lengthComputable) onProgress?.(Math.min(99, Math.round((ev.loaded / ev.total) * 100))); };
    x.onload = () => {
      if (x.status >= 200 && x.status < 300) { onProgress?.(100); resolve(); return; }
      let body = null; try { body = JSON.parse(x.responseText); } catch { /* corps illisible */ }
      reject(storageError(x.status, body));
    };
    x.onerror = () => reject(new Error('Envoi interrompu : vérifie ta connexion puis réessaie.'));
    x.onabort = () => reject(new Error('Envoi annulé.'));
    x.send(prepared.blob);
  });
}

/**
 * Envoie un fichier préparé dans le dossier du challenge, sous un nom aléatoire.
 * @param {string} challengeId identifiant du challenge (dossier du fichier)
 * @param {object} prepared résultat de prepareEntryFile
 * @param {(pct: number) => void} [onProgress] avancement de 0 à 100
 * @returns {Promise<string>} chemin du fichier dans le bucket
 */
export async function uploadEntryFile(challengeId, prepared, onProgress) {
  const path = `${challengeId}/${randomId()}.${prepared.ext}`;
  const api = sb.storage.from(WCH_BUCKET);
  onProgress?.(0);
  if (api?.url && typeof XMLHttpRequest !== 'undefined') {
    await xhrUpload(api, path, prepared, onProgress);
  } else {
    const { error } = await api.upload(path, prepared.blob, { contentType: prepared.contentType, upsert: false, cacheControl: '3600' });
    if (error) throw storageError(error.statusCode || 0, error);
    onProgress?.(100);
  }
  return path;
}

/**
 * Retire des fichiers du bucket (envoi échoué, participation retirée). Sans erreur levée.
 * @param {Array<string|null>} paths chemins à retirer (les valeurs vides sont ignorées)
 */
export async function removeEntryFiles(paths) {
  const list = (paths || []).filter(Boolean);
  if (!list.length) return;
  try { await sb.storage.from(WCH_BUCKET).remove(list); } catch { /* au mieux */ }
}

/* ---------- Liens signés ---------- */
// Liens signés gardés le temps de leur validité (évite une requête par rendu).
const signed = new Map();
/**
 * Liens signés de plusieurs fichiers, en un seul appel ; '' pour un fichier illisible.
 * @param {string[]} paths chemins
 * @returns {Promise<Map<string, string>>}
 */
async function signAll(paths) {
  const out = new Map();
  const todo = [];
  for (const p of new Set(paths)) {
    const hit = signed.get(p);
    if (hit && hit.until > Date.now()) out.set(p, hit.url); else todo.push(p);
  }
  if (todo.length) {
    try {
      const { data, error } = await sb.storage.from(WCH_BUCKET).createSignedUrls(todo, SIGNED_TTL);
      if (error) throw error;
      for (const r of data || []) {
        if (!r?.signedUrl || r.error) continue;
        signed.set(r.path, { url: r.signedUrl, until: Date.now() + (SIGNED_TTL - 30) * 1000 });
        out.set(r.path, r.signedUrl);
      }
    } catch { /* lecture refusée : aperçus vides */ }
  }
  return out;
}
/** Lien signé d'un seul fichier, ou ''. */
export async function signedUrl(path) { return (await signAll([path])).get(path) || ''; }

/* ---------- Aperçus ---------- */
/** Icône de document (même tracé que les pièces jointes de l'assistance), à la taille n. */
const icoDoc = (n) => `<svg viewBox="0 0 24 24" width="${n}" height="${n}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>`;
/** Étiquette du petit document (PDF, DOCX, ZIP…). */
const docLabel = (e) => (kindOf(e) === 'pdf' ? 'PDF' : (extOf(e.path) || 'FICHIER').toUpperCase().slice(0, 5));
/** Nombre de mots d'un texte. */
const mots = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

/**
 * Lien vers un fichier (vignette pour une image, icône sinon, nom et poids), rempli ensuite par hydrateMedia.
 * @param {object} e participation (path, file_name, mime, size)
 * @param {string} [label] nom lu par les lecteurs d'écran
 */
export function fileLinkHtml(e, label = '') {
  const img = kindOf(e) === 'image';
  const name = e.file_name || 'fichier';
  return `<a class="sf-item${img ? ' is-img' : ''}" href="#" data-wch-path="${esc(e.path)}" data-wch-link="1"${img ? ' data-wch-img="1"' : ''} target="_blank" rel="noopener" aria-label="${esc(label || `Ouvrir ${name}, ${fileSize(e.size)}`)}">`
    + (img ? '<span class="sf-thumb" aria-hidden="true"><img alt="" loading="lazy" decoding="async"></span>'
      : `<span class="sf-thumb sf-pdf" aria-hidden="true">${icoDoc(20)}<span>${esc(docLabel(e))}</span></span>`)
    + `<span class="sf-name">${esc(name)}</span><span class="sf-size">${esc(fileSize(e.size))}</span></a>`;
}

/**
 * Vignette seule (classement, mes participations) : image signée, ou icône du type.
 * @param {object} e participation
 */
export function thumbHtml(e) {
  const k = kindOf(e);
  if (k === 'image') return `<span class="sf-thumb" aria-hidden="true"><img alt="" data-wch-path="${esc(e.path)}" data-wch-img="1" loading="lazy" decoding="async"></span>`;
  const ico = { video: svg('play', { size: 20, stroke: 1.8 }), audio: svg('play2', { size: 20, stroke: 1.8 }), texte: svg('edit', { size: 20, stroke: 1.8 }) }[k];
  return `<span class="sf-thumb${ico ? '' : ' sf-pdf'}" aria-hidden="true">${ico || `${icoDoc(20)}<span>${esc(docLabel(e))}</span>`}</span>`;
}

/**
 * Aperçu d'une participation dans sa carte (grille du vote, résultats) : la forme change avec le type, la carte reste la même.
 * Le nom d'origine du fichier (file_name) n'est jamais affiché ici : il pourrait trahir l'auteur pendant le vote.
 * @param {object} e participation (path, file_name, mime, size, body)
 * @param {number} n numéro affiché
 * @param {{zoom?: boolean}} [o] zoom : image cliquable (agrandie dans une fenêtre)
 */
export function mediaHtml(e, n, { zoom = true } = {}) {
  const k = kindOf(e);
  const p = esc(e.path || '');
  if (k === 'image') {
    return zoom
      ? `<button class="chl-media thumb" type="button" data-zoom="${p}" aria-label="Agrandir la participation n° ${n}"><img alt="" data-wch-path="${p}" data-wch-img="1" decoding="async"></button>`
      : `<div class="chl-media"><img alt="" data-wch-path="${p}" data-wch-img="1" decoding="async"></div>`;
  }
  if (k === 'video') return `<div class="chl-media"><video controls preload="metadata" playsinline data-wch-path="${p}" aria-label="Vidéo de la participation n° ${n}"></video><span class="chl-kind" data-kind="Vidéo">${svg('play', { size: 14, stroke: 1.8 })} Vidéo</span></div>`;
  if (k === 'audio') return `<div class="chl-media chl-media-audio"><span class="chl-audio-ico" aria-hidden="true">${svg('play2', { size: 28, stroke: 1.8 })}</span><audio controls preload="metadata" data-wch-path="${p}" aria-label="Audio de la participation n° ${n}"></audio><span class="chl-kind" data-kind="Audio">Audio</span></div>`;
  if (k === 'texte') return `<div class="chl-media chl-media-txt"><blockquote>${esc(e.body || '')}</blockquote><span class="chl-kind">Texte · ${esc(pluriel(mots(e.body), 'mot'))}</span></div>`;
  // Nom neutre (« Participation 3 · PDF ») : le nom d'origine du fichier peut contenir le pseudo de l'auteur.
  const neutre = { ...e, file_name: `Participation ${n} · ${docLabel(e)}` };
  return `<div class="chl-media chl-media-pdf"><span class="sf-thumb sf-pdf" aria-hidden="true">${icoDoc(28)}<span>${esc(docLabel(e))}</span></span>${fileLinkHtml(neutre, `Ouvrir le fichier de la participation n° ${n}, ${docLabel(e)}, ${fileSize(e.size)}`)}</div>`;
}

/** Durée lisible d'un média (« 0:42 », « 1:58 »). */
const duree = (s) => (Number.isFinite(s) && s > 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

/**
 * Remplit une zone rendue avec mediaHtml, thumbHtml ou fileLinkHtml : liens signés (images, vidéos, sons, fichiers),
 * durée des vidéos et des sons une fois lue. Un fichier illisible laisse son lien désactivé.
 * @param {ParentNode} root zone à remplir
 */
export async function hydrateMedia(root) {
  const els = [...(root?.querySelectorAll('[data-wch-path]') || [])].filter((el) => el.dataset.wchPath);
  if (!els.length) return;
  const urls = await signAll(els.map((el) => el.dataset.wchPath));
  for (const el of els) {
    const url = urls.get(el.dataset.wchPath) || '';
    if (el.dataset.wchLink) {
      if (!url) { el.removeAttribute('href'); el.classList.add('is-off'); el.setAttribute('aria-disabled', 'true'); continue; }
      el.href = url;
      const img = el.querySelector('img');
      if (img && el.dataset.wchImg) img.src = url;
      continue;
    }
    if (!url) continue;
    if (el.tagName === 'IMG') { el.src = url; continue; }
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      const kind = el.parentElement?.querySelector('.chl-kind[data-kind]');
      if (kind) el.addEventListener('loadedmetadata', () => { const d = duree(el.duration); if (d) kind.lastChild.textContent = ` ${kind.dataset.kind} · ${d}`; }, { once: true });
      el.src = url;
    }
  }
}
