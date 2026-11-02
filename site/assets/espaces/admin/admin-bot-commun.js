// ===== Humane Gang — administration : bot Discord, éléments communs aux onglets (admin-bot.js) =====
// Constantes (salons, mentions, médias, limites), icônes, aperçu Discord façon Discord, pièces jointes et helpers.
// Rien ici n’agit seul : chaque onglet (admin-bot-*.js) importe ce dont il a besoin.

import { sb, errMsg, esc, $, currentLogo } from '../../commun/core.js';
import { svg } from '../../commun/icons.js';

// Types de notifications du bot : [clé, libellé, ce qui part et où]. Chaque type peut être activé ou coupé.
export const NOTIFY = [
  ['draw', 'Tirage du Secret Santa', 'annonce + MP aux participants'],
  ['gift', 'Cadeaux', 'MP « envoyé » / « reçu »'],
  ['irl', 'Nouvelles sorties IRL', 'annonce dans le salon'],
  ['birthday', 'Anniversaires', 'chaque matin : MP + annonce si partagé'],
  ['support', 'Demandes d\'assistance', 'MP à toi'],
  ['messages', 'Nouveaux messages', 'MP au destinataire (pas à chaque message d\'une discussion en cours)'],
  ['card_pull', 'Belle carte obtenue', 'annonce dans le salon : carte légendaire, mythique, identité ou unique, obtenue ou fabriquée'],
  ['card_wish', 'MP : carte de ta liste de souhaits obtenue', 'MP aux membres qui ont la carte dans leur liste de souhaits et ont activé l\'alerte'],
  ['card_trade', 'Échange conclu', 'annonce dans le salon (désactivée par défaut)'],
  ['trade_offer', 'MP : nouvelle offre d\'échange', 'MP au destinataire d\'une offre ou contre-proposition'],
  ['card_gift_admin', 'MP : carte offerte par l\'admin', 'MP au membre qui reçoit une carte de l\'admin ou du Staff (Cartes)'],
  ['card_drop', 'Drop lancé', 'annonce dans le salon quand un drop est lancé avec « Annoncer sur Discord »'],
  ['lg_party', 'Partie de Loup-Garou', 'annonce dans le salon quand un membre crée une partie avec « Annoncer sur le Discord du gang »'],
  ['uno_party', 'Partie de Uno', 'annonce dans le salon quand un membre crée une partie de Uno avec « Annoncer sur le Discord du gang »'],
  ['plat_party', 'Partie de jeu de plateau', 'annonce dans le salon quand un membre crée une partie de Cluedo, Shadow Hunters, Destins, Monopoly ou Risk avec « Annoncer sur le Discord du gang »'],
  ['ndc_party', 'Partie de Nom de code', 'annonce dans le salon quand un membre crée une partie de Nom de code avec « Annoncer sur le Discord du gang »'],
  ['duel_defi', 'MP : défi de duel', 'MP au membre défié à un duel (Puissance 4, Morpion, Mastermind, Bataille navale, Qui est-ce ?) s\'il accepte la catégorie « Jeux »'],
  ['ton_tour', 'C’est ton tour', 'duels, Uno et plateaux : le membre est prévenu quand le jeu a dû jouer pour lui, sur le site, en push ou en MP (pas de copie aux admins)'],
  ['quiz_daily', 'Publier la question du jour', 'chaque matin dans le salon « Question du jour » (à couper pendant les vacances)'],
  ['unwrap', 'Tour de passage au déballage', 'annonce « C’est au tour de … » pendant la soirée déballage du Secret Santa (désactivé par défaut)'],
];
// Seules les clés de NOTIFY, pour parcourir les cases à cocher.
export const NOTIFY_KEYS = NOTIFY.map(([k]) => k);
// Annonces publiées dans le salon d'annonces, avec leur mention (bot.mentions[type], défaut « none »)
export const MENTION_TYPES = [
  ['draw', 'Tirage du Secret Santa'], ['irl', 'Nouvelles sorties IRL'], ['birthday', 'Anniversaires'],
  ['dyn', 'Événements dynamiques'], ['card_pull', 'Belle carte obtenue'], ['card_trade', 'Échange conclu'],
  ['card_drop', 'Drop lancé'], ['quiz', 'Question du jour'], ['cine', 'Ciné-club'], ['loup_garou', 'Partie de Loup-Garou'], ['uno', 'Partie de Uno'], ['nom_de_code', 'Partie de Nom de code'], ['plateaux', 'Partie de jeu de plateau'],
];
// Modes de mention possibles pour une annonce : aucune, le rôle, ou @everyone.
export const MENTION_MODES = [['none', 'Aucune'], ['role', 'Le rôle'], ['everyone', '@everyone']];
// Pièces jointes du message manuel : même liste blanche et même limite que hg-bot-media et _shared/bot-media.ts
export const MEDIA_BUCKET = 'hg-bot-media', MEDIA_MAX_FILES = 4, MEDIA_MAX_BYTES = 10 * 1024 * 1024;
export const MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'application/pdf']);
// Valeur de l'attribut accept du champ de fichiers : les types de la liste blanche.
export const MEDIA_ACCEPT = [...MEDIA_TYPES].join(',');
// Un identifiant Discord (salon, rôle, membre) est un nombre de 17 à 20 chiffres.
export const DISCORD_ID = /^\d{17,20}$/;
// Longueurs maximales : titre et corps d'un message type (TITLE_MAX, BODY_MAX), titre et corps du message manuel.
// CONFIRM_ABOVE : à partir de ce nombre de destinataires, l'envoi demande confirmation.
export const TITLE_MAX = 256, BODY_MAX = 4096, MANUAL_TITLE_MAX = 200, MANUAL_BODY_MAX = 2000, CONFIRM_ABOVE = 5;
// Nombre maximum de destinataires d'un message manuel.
export const MAX_RECIPIENTS = 100;
// Salons connus (réglages « salons ») : 25 au plus, nom de 1 à 50 caractères ; par type d'annonce : 5 salons au plus ; annonce libre : 10.
export const SALONS_MAX = 25, SALON_NAME_MAX = 50, CHAN_MAX = 5, ANN_MAX = 10;

// Icônes SVG : recherche, envoi, annuler, ajouter.
export const ICON = {
  search: svg('search2', { stroke: 2 }),
  send: svg('send', { stroke: 2 }),
  undo: svg('undo', { stroke: 2 }),
  plus: svg('plus', { stroke: 2 }),
};
// État d'un destinataire possible : libellé et classe CSS (ID Discord manquant, refus des MP, compte sans profil).
export const STATUS = {
  ok: ['Discord OK', 'pill-ok'],
  nodiscord: ['Pas d\'ID Discord', 'pill-warn'],
  optout: ['A refusé les MP du bot', 'pill-warn'],
  noprofile: ['Compte sans profil', 'pill-todo'],
};
// Résultat d'un envoi (envoyé, échec, ignoré) : libellé et classe CSS.
// Types d'envoi automatiques (hg_bot_log.kind) : libellés en français pour l'historique.
export const KIND_LABEL = { 'auto:cron': 'Annonce auto · Planning', 'auto:anniversaire': 'Annonce auto · Anniversaires', 'auto:tirage': 'Annonce auto · Tirage',
  'auto:evenement': 'Annonce auto · Événement', 'auto:drop': 'Annonce auto · Drop', 'auto:sortie': 'Annonce auto · Sortie',
  'auto:carte': 'Annonce auto · Belle carte', 'auto:echange': 'Annonce auto · Échange' };
/** Libellé d'un type d'envoi (repli sur le code brut si inconnu). */
export const kindLabel = (k) => KIND_LABEL[k] ?? k;
export const RESULT = { sent: ['Envoyé', 'pill-ok'], failed: ['Échec', 'bm-pill-fail'], skipped: ['Ignoré', 'pill-todo'] };

/** Renvoie les données d'une réponse Supabase, ou lève l'erreur si la requête a échoué. */
export function check(res) { if (res.error) throw res.error; return res.data; }
/** Comparaison sans accents ni casse. */
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Heure seule (HH:MM), pour l'aperçu Discord.
export const timeFmt = new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' });
// Date et heure complètes, pour l'historique.
export const logFmt = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** Vrai si la valeur est une chaîne non vide (les espaces seuls ne comptent pas). */
export const filled = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Réglages du bot normalisés. Salons connus : liste sans doublon (nom par défaut « Salon <id> »). Salons par type :
 * tableau d'IDs valides, 5 au plus. L'ancienne forme (une chaîne par type) devient un tableau d'un élément ; un salon
 * référencé mais absent de la liste y est ajouté, pour ne rien perdre. Liste vide des anniversaires : birthday_channel_id.
 * @param {object} raw Valeur stockée de hg_settings.bot.
 * @returns {object} Copie de raw avec salons et channels normalisés.
 */
export function normalizeBot(raw) {
  const bot = { ...raw };
  const salons = [], seen = new Set();
  const addSalon = (id, nom) => {
    if (typeof id !== 'string' || !DISCORD_ID.test(id) || seen.has(id)) return;
    seen.add(id);
    salons.push({ id, nom: filled(nom) ? nom.trim().slice(0, SALON_NAME_MAX) : `Salon ${id}` });
  };
  for (const s of Array.isArray(bot.salons) ? bot.salons : []) addSalon(s?.id, s?.nom);
  const stored = bot.channels && typeof bot.channels === 'object' && !Array.isArray(bot.channels) ? bot.channels : {};
  /** Liste d'IDs valides, sans doublon, 5 au plus (une chaîne seule devient une liste). */
  const ids = (v) => [...new Set((Array.isArray(v) ? v : [v]).filter((x) => typeof x === 'string' && DISCORD_ID.test(x)))].slice(0, CHAN_MAX);
  const channels = {};
  for (const [k] of MENTION_TYPES) {
    let list = ids(stored[k]);
    if (!list.length && k === 'birthday') list = ids(bot.birthday_channel_id);
    if (list.length) { channels[k] = list; list.forEach((id) => addSalon(id, null)); }
  }
  return { ...bot, salons, channels };
}

/** Texte d'aide sous le choix de mention : ce qui se passe selon que le salon est choisi et qu'un rôle est configuré. */
export function mentionHint(on, hasRole) {
  return !on ? 'Active la publication dans le salon pour choisir une mention.'
    : hasRole ? 'Le rôle notifie ses membres ; @everyone notifie tout le serveur.'
      : 'Aucun rôle configuré : renseigne son ID dans les réglages du bot pour le mentionner.';
}
/**
 * Choix de mention d'un formulaire : « Le rôle » n'est proposé que si un rôle est configuré, le choix est grisé si on est faux.
 * @param {HTMLSelectElement} sel Liste des mentions.
 * @param {HTMLElement} hint Texte d'aide sous la liste.
 * @param {boolean} on Vrai si une publication dans un salon est prévue.
 * @param {string|null} roleId Rôle configuré (mention_role_id).
 */
export function syncMentionSelect(sel, hint, on, roleId) {
  const hasRole = !!roleId;
  sel.querySelector('option[value="role"]').disabled = !hasRole;
  if (!hasRole && sel.value === 'role') sel.value = 'none';
  sel.disabled = !on;
  hint.textContent = mentionHint(on, hasRole);
}

/**
 * HTML du champ « Pièces jointes » d'un formulaire. p : préfixe des identifiants (bm- ou ann-). Le comportement est dans attachmentUI.
 * @param {string} p
 * @returns {string}
 */
export function attachFieldHtml(p) {
  return `<div class="field bm-files" id="${p}files">
    <span class="label" id="${p}files-l">Pièces jointes <span class="muted small">(facultatif · ${MEDIA_MAX_FILES} fichiers maximum · 10 Mo chacun)</span></span>
    <div class="bm-drop" id="${p}drop" role="button" tabindex="0" aria-describedby="${p}files-l ${p}file-err">
      <span class="bm-drop-main">Glisse des fichiers ici ou <span class="bm-drop-link">choisis-les</span></span>
      <span class="muted small">Images, GIF, vidéos, sons, PDF</span>
    </div>
    <input type="file" id="${p}file-input" multiple accept="${MEDIA_ACCEPT}" hidden>
    <p class="bm-file-err" id="${p}file-err" role="alert" hidden></p>
    <ul class="bm-file-list" id="${p}file-list" aria-labelledby="${p}files-l"></ul>
  </div>`;
}

/**
 * Pièces jointes d'un formulaire (champ construit par attachFieldHtml) : ajout par clic, Entrée ou glisser-déposer,
 * retrait, aperçu d'image, téléversement dans hg-bot-media. onChange est appelé après chaque ajout, retrait ou vidage.
 * @param {HTMLElement} root Conteneur du formulaire.
 * @param {string} p Préfixe des identifiants (ex. « bm- »).
 * @param {() => void} onChange Rappel après un changement de la liste.
 * @returns {{files: () => {file: File, url: string|null}[], clear: () => void, upload: (done: string[]) => Promise<string[]>}}
 */
export function attachmentUI(root, p, onChange) {
  const list = []; // { file, url } : url = aperçu d'une image (libéré au retrait)
  const q = (s) => $(`#${p}${s}`, root);
  /** Affiche le message d'erreur des pièces jointes, ou l'efface si msg est vide. */
  const showErr = (msg) => { const box = q('file-err'); box.textContent = msg; box.hidden = !msg; };
  /** Dessine la liste (aperçu ou extension, taille, retirer) et l'état de la zone de dépôt, puis prévient l'appelant. */
  const render = () => {
    q('file-list').innerHTML = list.map((f, i) => {
      const ext = (f.file.name.split('.').pop() || '').slice(0, 4).toUpperCase();
      return `<li class="bm-file">
        <span class="bm-file-thumb">${f.url ? `<img src="${esc(f.url)}" alt="">` : `<span class="bm-file-ext">${esc(ext)}</span>`}</span>
        <span class="bm-file-meta"><span class="bm-file-name">${esc(f.file.name)}</span><span class="small muted">${esc(fmtSize(f.file.size))}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" data-file-remove="${i}" aria-label="Retirer ${esc(f.file.name)}">Retirer</button>
      </li>`;
    }).join('');
    q('drop').setAttribute('aria-disabled', String(list.length >= MEDIA_MAX_FILES));
    onChange();
  };
  /** Ouvre le sélecteur si la limite n'est pas atteinte, sinon affiche l'erreur. */
  const openPicker = () => { if (list.length < MEDIA_MAX_FILES) q('file-input').click(); else showErr(`${MEDIA_MAX_FILES} fichiers maximum par envoi.`); };
  /** Ajoute des fichiers choisis ou glissés, en refusant clairement ceux qui ne passent pas. */
  const add = (picked) => {
    const errors = [];
    for (const file of [...picked]) {
      if (list.length >= MEDIA_MAX_FILES) { errors.push(`${MEDIA_MAX_FILES} fichiers maximum par envoi.`); break; }
      if (!MEDIA_TYPES.has(file.type)) { errors.push(`« ${file.name} » : type de fichier non autorisé (images, GIF, vidéos, sons ou PDF).`); continue; }
      if (file.size > MEDIA_MAX_BYTES) { errors.push(`« ${file.name} » fait ${fmtSize(file.size)} : 10 Mo maximum par fichier.`); continue; }
      if (list.some((f) => f.file.name === file.name && f.file.size === file.size)) continue; // doublon
      list.push({ file, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
    }
    showErr(errors.join(' '));
    render();
  };
  /** Retire une pièce jointe et libère son aperçu. */
  const remove = (i) => {
    const [f] = list.splice(i, 1);
    if (f?.url) URL.revokeObjectURL(f.url);
    showErr('');
    render();
  };
  /** Vide la liste et libère les aperçus. */
  const clear = () => {
    for (const f of list) if (f.url) URL.revokeObjectURL(f.url);
    list.length = 0;
    q('file-input').value = '';
    render();
  };
  // Téléversement dans hg-bot-media (manuel/<date>/<uuid>-<nom>). Les chemins réussis vont dans done.
  const upload = async (done) => {
    const day = dayStamp();
    for (const f of list) {
      const path = `manuel/${day}/${uuid()}-${storageName(f.file.name)}`;
      check(await sb.storage.from(MEDIA_BUCKET).upload(path, f.file, { contentType: f.file.type, upsert: false, cacheControl: '3600' }));
      done.push(path);
    }
    return done;
  };
  // Liaisons : clic ou Entrée/Espace, glisser-déposer, choix du fichier, retrait par ligne.
  const drop = q('drop'), input = q('file-input');
  drop.addEventListener('click', openPicker);
  drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); } });
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); add(e.dataTransfer?.files ?? []); });
  input.addEventListener('change', () => { add(input.files ?? []); input.value = ''; });
  q('file-list').addEventListener('click', (e) => { const b = e.target.closest('[data-file-remove]'); if (b) remove(Number(b.dataset.fileRemove)); });
  return { files: () => list.slice(), clear, upload };
}



/** Message d'erreur lisible, y compris le JSON { error } renvoyé par une fonction edge. */
export async function fnError(e) {
  try {
    const ctx = e?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.clone().json();
      if (body?.error) return String(body.error);
    }
  } catch { /* corps illisible */ }
  return errMsg(e);
}

/* ---------- Rendu des modèles (même logique que supabase/functions/_shared/templates.ts) ---------- */
/**
 * Remplace les variables {nom} d'un modèle par leurs valeurs. Une variable non autorisée devient vide.
 * Même règle que les fonctions edge (templates.ts).
 * @param {string} text Modèle.
 * @param {object} vars Valeurs par nom de variable.
 * @param {Set<string>} [allowed] Variables autorisées (toutes si absent).
 * @returns {string}
 */
export function fillVars(text, vars, allowed) {
  return String(text ?? '').replace(/\{([a-z_]+)\}/g, (_m, name) => (allowed && !allowed.has(name) ? '' : String(vars[name] ?? '')));
}
/** Coupe un texte à n caractères ; « … » remplace la fin si nécessaire. */
export const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Liste des variables {nom} d'un texte qui ne sont pas autorisées pour ce modèle (à signaler à l'admin). */
export const unknownVars = (text, allowed) => [...new Set([...String(text ?? '').matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((v) => !allowed.has(v)))];

/** Mini-markdown Discord pour l'aperçu (gras, italique, souligné, barré, code, liens). Le texte est échappé d'abord. */
export function discordMd(text) {
  let h = esc(text);
  h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<]+)/g, (_m, label, url, bare) => `<span class="dc-link">${label ?? bare}</span>`);
  h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/__([^_\n]+)__/g, '<u>$1</u>');
  h = h.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  h = h.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  return h;
}

/**
 * Aperçu façon Discord. `embed` : { color, title, description, fields: [[nom, valeur]], footer, image }, `content` facultatif.
 * `mention` : « @everyone » ou « @rôle » affiché en tête du message (une mention notifie, elle n'est jamais dans l'embed).
 * `files` : [{ name, size, url, image }] : pièces jointes ; une image jointe est affichée dans l'embed (embed.image).
 */
export function discordPreview({ content = '', mention = '', embed, where = '', files = [] }) {
  const now = timeFmt.format(new Date());
  const fields = (embed.fields ?? []).filter(([, v]) => filled(v));
  const others = files.filter((f) => !f.inEmbed);
  return `
    <div class="dc" role="img" aria-label="Aperçu du message Discord">
      ${where ? `<div class="dc-where">${esc(where)}</div>` : ''}
      <div class="dc-msg">
        <img class="dc-avatar" src="${esc(currentLogo())}" alt="">
        <div class="dc-main">
          <div class="dc-head"><span class="dc-name">Humane Gang</span><span class="dc-app">APP</span><span class="dc-time">Aujourd'hui à ${now}</span></div>
          ${mention ? `<div class="dc-content"><span class="dc-mention">${esc(mention)}</span></div>` : ''}
          ${content ? `<div class="dc-content">${discordMd(content)}</div>` : ''}
          <div class="dc-embed" style="--dc-bar:${esc(embed.color || '#9E3543')}">
            ${embed.title ? `<div class="dc-title${embed.url ? ' dc-title-link' : ''}">${discordMd(embed.title)}</div>` : ''}
            ${embed.description ? `<div class="dc-desc">${discordMd(embed.description)}</div>` : ''}
            ${!embed.title && !embed.description && !embed.image ? '<div class="dc-desc dc-empty">(message vide)</div>' : ''}
            ${embed.image ? `<img class="dc-img" src="${esc(embed.image)}" alt="">` : ''}
            ${fields.length ? `<div class="dc-fields">${fields.map(([n, v]) => `<div class="dc-field"><div class="dc-fname">${esc(n)}</div><div class="dc-fval">${discordMd(v)}</div></div>`).join('')}</div>` : ''}
            <div class="dc-footer">${esc(embed.footer || 'Humane Gang')} • Aujourd'hui à ${now}</div>
          </div>
          ${others.length ? `<div class="dc-files">${others.map((f) => `<div class="dc-file"><span class="dc-file-name">${esc(f.name)}</span><span class="dc-file-size">${esc(fmtSize(f.size))}</span></div>`).join('')}</div>` : ''}
        </div>
      </div>
    </div>`;
}

/** Taille lisible d'un fichier, en Ko ou en Mo (virgule décimale). */
export const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} Ko` : `${(n / 1048576).toFixed(1).replace('.', ',')} Mo`);
/** Nom de fichier envoyé au stockage : sans séparateur de chemin, sans « .. » (refusés par la fonction). */
export const storageName = (name) => String(name).normalize('NFC').replace(/[\\/\u0000]/g, '_').replace(/\.{2,}/g, '.').trim().slice(0, 120) || 'fichier';
/** Identifiant aléatoire (crypto.randomUUID n'existe que sur https : le site peut aussi être servi en http local). */
export const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID()
  : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
/** Date du jour au format AAAA-MM-JJ, heure locale. */
export const dayStamp = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale
