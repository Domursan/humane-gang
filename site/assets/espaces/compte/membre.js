// ===== Humane Gang — carte d'identité d'un membre + annuaire « Le gang » (/pages/compte/membre.html) =====
// Affiche la carte de membre (soi-même par défaut, ou ?id=<uuid> pour un autre membre), ses badges, sa vitrine de cartes,
// et l'annuaire « Le gang ». La carte peut être téléchargée en PNG haute définition.
// Dépendances : core.js (initPage, sb, canAccess), ss-card.js (chargement d'image et téléchargement),
// badge-levels.js (niveaux), cartes-showcase.js (vitrine), icons.js.
// RPC et tables : hg_member_card, hg_members, hg_settings (badges), hg_user_badges, hg_badges ;
// profil gaming et mercis (migration 090) : profil-gaming.js et mercis.js, chargés à la demande.
// N'exporte que renderIdCard (carte haute définition).
import { sb, initPage, esc, $, $$, errMsg, toast, fmtDate, avatarHtml, initials, currentLogo, canAccess } from '../../commun/core.js';
import { loadImage, downloadCanvas } from '../irl/ss-card.js';
import { hasLevels, levelImage, levelLabel, levelPipsHtml, roman } from './badge-levels.js';
import { mountShowcase } from '../cartes/cartes-showcase.js';
import { svg } from '../../commun/icons.js';
import { questTrack } from '../../commun/quest-track.js';
import { avatarPresence } from '../../commun/core/presence.js';
import { isOffline, startOfflinePage, saveOffline, offlineBannerHtml } from '../../commun/offline-store.js'; // Q4 : sa carte hors ligne
import { loadGenerations } from '../cartes/cartes-gen.js';
import { generationLabel } from '../cartes/cartes-ui.js';
import { loadTagLabels, titlesOf } from '../cartes/cartes-jeux.js';

const app = $('#app');
// Q4 : sans réseau, la page montre la carte de membre gardée sur l'appareil (la sienne seulement, aucune requête).
const OFF = isOffline() ? await startOfflinePage() : null;
const me = OFF ? OFF.me : await initPage({ auth: 'member' });

/* ---------- Quel membre afficher : ?id=<uuid>, sinon soi-même ---------- */
const params = new URLSearchParams(location.search);
/** Format d'un identifiant de compte (uuid). Une valeur qui ne correspond pas est ignorée. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rawId = params.get('id');
const targetId = rawId && UUID_RE.test(rawId) ? rawId : me?.id;
const isMe = !!me && targetId === me.id;

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const RAINBOW = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
const PIXEL = '"Silkscreen", ui-monospace, monospace';
const DISPLAY = '"Archivo Black", system-ui, sans-serif';
const BODY = 'Inter, system-ui, sans-serif';
/** Vrai si l'utilisateur demande moins d'animations (prefers-reduced-motion). */
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

const ICON = {
  msg: svg('msg', { size: 20, stroke: 1.8 }),
  download: svg('download', { size: 20, stroke: 1.8 }),
  users: svg('users2', { size: 20, stroke: 1.8 }),
  badge: svg('badge', { size: 20, stroke: 1.8 }),
  // Barres de stats (idée 18, « Mes stats de jeux ») : dessin local, icons.js n'en a pas
  stats: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

/** Les cinq statistiques de la carte : clé des données, libellé au singulier, libellé au pluriel. */
const STATS = [
  ['secret_santa', 'Secret Santa', 'Secret Santa'],
  ['sorties', 'Sortie', 'Sorties'],
  ['organisees', 'Organisée', 'Organisées'],
  ['photos', 'Photo', 'Photos'],
  ['moments', 'Moment', 'Moments'],
];

/** Numéro de membre sur quatre chiffres, avec des zéros devant (ex. 0042). */
const num4 = (n) => String(Math.max(0, Number(n) || 0)).padStart(4, '0');
/**
 * Anniversaire lisible (« 1er mars ») à partir de « JJ.MM » (format stocké).
 * @param {string} dm date au format JJ.MM
 * @returns {string} libellé, ou chaîne vide si la valeur est absente ou invalide
 */
function birthdayLabel(dm) {
  const m = /^(\d{2})\.(\d{2})$/.exec(String(dm || ''));
  if (!m) return '';
  const d = Number(m[1]), mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${d === 1 ? '1er' : d} ${MONTHS[mo - 1]}` : '';
}
/** « mars 2019 », ou la date complète « 12 mars 2019 » si l'admin a saisi la date d'arrivée réelle (joined_on). */
function sinceLabel(d, joined) {
  const j = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(joined || ''));
  if (j) { const day = Number(j[3]); return `${day === 1 ? '1er' : day} ${MONTHS[Number(j[2]) - 1]} ${j[1]}`; }
  if (!d) return '—';
  const x = new Date(d);
  return `${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
/** Code-barres décoratif déterministe (largeurs 1–3) à partir d'une chaîne (ici le numéro de membre, répété) : le code-barres encode le numéro. */
function barcode(id) {
  const h = String(id || '0').replace(/-/g, '');
  return [...h].slice(0, 28).map((c) => (parseInt(c, 16) % 3) + 1);
}
/** Couleur de la carte : seule une couleur hexadécimale à six chiffres est acceptée, sinon la couleur par défaut. */
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? c : '#9E3543');

/* =========================================================
   Rendu de la page
   ========================================================= */
/**
 * Dessine le squelette de la page (titre, carte en attente, zone des badges, annuaire en attente).
 * La vraie carte remplace ensuite ces blocs quand les données sont là.
 */
function shell() {
  app.innerHTML = `
    <section class="page-head mb-head">
      <div>
        <p class="eyebrow">Carte d'identité HG</p>
        <h1 class="page-title" id="mb-title">${isMe ? 'Ma carte' : 'Carte de membre'}</h1>
      </div>
    </section>
    <section class="mb-layout" id="mb-main" aria-live="polite">
      <div class="mb-card-col"><div class="idc-wrap"><div class="idc idc-skeleton" aria-hidden="true"></div></div></div>
      <div class="card mb-badges"><span class="skeleton-line"></span><span class="skeleton-line short"></span></div>
    </section>
    <div class="mb-actions" id="mb-actions" hidden></div>
    <div class="mb-social" id="mb-friend" hidden></div>
    <div class="mb-social"><div id="mb-gaming" hidden></div><div id="mb-thanks" hidden></div></div>
    <section class="mb-skills" id="mb-skills" hidden></section>
    ${canAccess('cartes') ? '<section class="mb-showcase" id="mb-showcase" hidden></section>' : ''}
    <section class="mb-gang" aria-labelledby="gang-title">
      <h2 class="mb-section-title" id="gang-title">${ICON.users} Le gang</h2>
      <div id="gang-skill-filter" hidden></div>
      <div id="gm-who" hidden></div>
      <ul class="gang-grid" id="gang"><li class="gang-skel"></li><li class="gang-skel"></li><li class="gang-skel"></li></ul>
    </section>`;
}

/** Nombre maximum de badges affichés sur la carte ; au-delà, une pastille « +n ». Réglable : hg_settings.badges.max_carte (repli 8). */
let IDC_BADGES_MAX = 8;
/** Lit dans les réglages le nombre de badges affichés sur la carte. Sans réglage valide, on garde 8. */
async function loadBadgeMax() {
  try {
    const { data, error } = await sb.from('hg_settings').select('value').eq('key', 'badges').maybeSingle();
    const n = Number(data?.value?.max_carte);
    if (!error && Number.isInteger(n) && n >= 1) IDC_BADGES_MAX = n;
  } catch { /* repli : 8 */ }
}

/**
 * Rangée des badges obtenus sur la carte (images déjà résolues par addBadgeLevels : niveau atteint pour
 * les badges à niveaux). Chaîne vide si aucun badge. Les images cassées retombent sur les initiales.
 */
function idcBadgesHtml(c) {
  const list = Array.isArray(c.badges) ? c.badges : [];
  if (!list.length) return '';
  const shown = list.length <= IDC_BADGES_MAX ? list : list.slice(0, IDC_BADGES_MAX - 1);
  const rest = list.length - shown.length;
  const items = shown.map((b) => {
    const name = b.name || b.code || '';
    const label = b.lv ? `${name} · ${levelLabel(b.lv, b.level)}` : name;
    return `<li class="idc-bdg" title="${esc(label)}">${b.lv ? `<span class="idc-bdg-lvl" aria-hidden="true">${roman(b.level)}</span>` : ''}${b.image_url
      ? `<img src="${esc(b.image_url)}" alt="${esc(label)}" loading="lazy" decoding="async" data-on-error="initials" data-fallback-class="idc-bdg-init" data-fallback="${esc(initials(name))}">`
      : `<span class="idc-bdg-init" role="img" aria-label="${esc(label)}">${esc(initials(name))}</span>`}</li>`;
  }).join('');
  const more = rest > 0 ? `<li class="idc-bdg idc-bdg-more" title="${rest} autre${rest > 1 ? 's' : ''} badge${rest > 1 ? 's' : ''}">+${rest}</li>` : '';
  return `<ul class="idc-badges" aria-label="Badges obtenus (${list.length})">${items}${more}</ul>`;
}

/**
 * HTML de la carte d'identité : logo, numéro, photo, pseudo, dates, badges, statistiques, code-barres décoratif.
 * Les boutons (message, téléchargement, modifier le profil) changent selon qu'il s'agit de moi ou d'un autre membre.
 * @param {object} c carte renvoyée par la RPC hg_member_card
 * @returns {string} HTML
 */
function cardHtml(c) {
  const bday = birthdayLabel(c.birthday_dm);
  const stats = c.stats || {};
  const bars = barcode(num4(c.member_number).repeat(7)).map((w, i) => `<i style="flex-grow:${w}" class="${i % 2 ? 'gap' : ''}"></i>`).join('');
  const bdg = idcBadgesHtml(c);
  return `
    <div class="idc-wrap" id="idc-wrap">
      <article class="idc" id="idc" style="--member:${esc(safeColor(c.color))}" aria-label="Carte de membre de ${esc(c.pseudo)}">
        <div class="idc-face">
          <header class="idc-top">
            <img class="idc-logo" src="${esc(currentLogo())}" alt="" data-on-error="hide">
            <div class="idc-brand">
              <span class="idc-brand-name">HUMANE GANG</span>
              <span class="idc-brand-sub">Carte de membre</span>
            </div>
            <div class="idc-no">
              <span class="idc-k">N° de membre</span>
              <strong class="idc-no-val">${esc(num4(c.member_number))}</strong>
            </div>
          </header>
          <div class="idc-rainbow" aria-hidden="true">${RAINBOW.map((r) => `<span style="background:${r}"></span>`).join('')}</div>
          <div class="idc-body">
            <div class="idc-photo">${c.avatar_url
              ? `<img src="${esc(c.avatar_url)}" alt="" crossorigin="anonymous" loading="lazy" decoding="async" data-on-error="initials" data-fallback-class="idc-initials" data-fallback="${esc(initials(c.pseudo))}">`
              : `<span class="idc-initials">${esc(initials(c.pseudo))}</span>`}</div>
            <dl class="idc-fields">
              <div class="idc-field idc-field-pseudo"><dt class="idc-k">Pseudo</dt><dd class="idc-pseudo">${esc(c.pseudo)}</dd></div>
              <div class="idc-field"><dt class="idc-k">Membre depuis</dt><dd>${esc(sinceLabel(c.member_since, c.joined_on))}${c.gen ? ` · <span class="idc-gen idc-gen-${esc(c.gen)}">${esc(generationLabel(c.gen))}</span>` : ''}</dd></div>
              ${c.titles?.length ? `<div class="idc-field"><dt class="idc-k">Titre${c.titles.length > 1 ? 's' : ''}</dt><dd class="idc-titles">${c.titles.map((t) => `<span class="pill pill-sand">${esc(t)}</span>`).join(' ')}</dd></div>` : ''}
              ${bday ? `<div class="idc-field"><dt class="idc-k">Anniversaire</dt><dd>${esc(bday)}</dd></div>` : ''}
            </dl>
            ${bdg ? `<div class="idc-badges-zone"><span class="idc-k">Badges</span>${bdg}</div>` : ''}
          </div>
          <ul class="idc-stats" aria-label="Statistiques">
            ${STATS.map(([k, one, many]) => { const n = Number(stats[k]) || 0; return `<li><strong>${n}</strong><span>${n > 1 ? many : one}</span></li>`; }).join('')}
          </ul>
          <footer class="idc-foot" aria-hidden="true">
            <span class="idc-chip"><i></i><i></i><i></i><i></i></span>
            <span class="idc-barcode">${bars}</span>
          </footer>
        </div>
        <div class="idc-holo" aria-hidden="true"></div>
        <div class="idc-glare" aria-hidden="true"></div>
      </article>
    </div>
    <div class="btn-row mb-actions">
      ${isMe ? '' : `<a class="btn btn-primary" href="/pages/compte/messages.html?to=${encodeURIComponent(c.id)}">${ICON.msg} Envoyer un message</a>`}
      <button class="btn ${isMe ? 'btn-primary' : 'btn-ghost'}" type="button" id="dl-card">${ICON.download} Télécharger la carte</button>
      ${isMe ? '<a class="btn btn-ghost" href="/pages/compte/compte.html">Modifier mon profil</a>' : ''}
      ${isMe && canAccess('jeux') ? `<a class="btn btn-ghost" id="mb-stats-jeux" href="/pages/jeux/jeux.html#mes-stats">${ICON.stats} Mes stats de jeux</a>` : ''}
    </div>`;
}

/**
 * Liste complète des badges de la page (avec niveaux et dates), ou un message s'il n'y en a aucun.
 * @param {object} c carte du membre
 * @returns {string} HTML
 */
function badgesHtml(c) {
  const list = Array.isArray(c.badges) ? c.badges : [];
  return `
    <h2 class="mb-section-title">${ICON.badge} Badges <span class="mb-count">${list.length}</span></h2>
    ${list.length ? `<ul class="badge-grid">
      ${list.map((b) => `
        <li class="badge-item" title="${esc(b.description || b.name)}">
          <span class="badge-img">${b.lv ? `<span class="badge-lvl" aria-hidden="true">${roman(b.level)}</span>` : ''}${b.image_url ? `<img src="${esc(b.image_url)}" alt="" loading="lazy" decoding="async" data-on-error="text" data-fallback="${esc(initials(b.name))}">` : esc(initials(b.name))}</span>
          <span class="badge-name">${esc(b.name)}</span>
          ${b.lv ? `${levelPipsHtml(b.lv, b.level, { max: 5 })}<span class="lvl-name">${esc(levelLabel(b.lv, b.level))}</span>` : ''}
          ${b.description ? `<span class="badge-desc">${esc(b.description)}</span>` : ''}
          ${b.awarded_at ? `<span class="badge-date">${esc(fmtDate(b.awarded_at))}</span>` : ''}
        </li>`).join('')}
    </ul>` : `<p class="empty">${isMe ? 'Pas encore de badge. Participe au Secret Santa, viens aux sorties, poste des photos…' : 'Pas encore de badge pour ce membre.'}</p>`}`;
}

/* ---------- Effet holographique (tilt 3D + reflet) ---------- */
/**
 * Active l'effet holographique : la carte s'incline vers le pointeur (souris uniquement, pas au doigt).
 * Sans effet si le mouvement est réduit.
 */
function bindHolo() {
  const wrap = $('#idc-wrap'), card = $('#idc');
  if (!wrap || !card || reduced()) return;
  let raf = 0, last = null;
  /** Applique l'inclinaison calculée d'après la position du pointeur (une fois par image). */
  const apply = () => {
    raf = 0;
    if (!last) return;
    const r = wrap.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (last.x - r.left) / r.width));
    const py = Math.min(1, Math.max(0, (last.y - r.top) / r.height));
    card.style.setProperty('--ry', `${((px - 0.5) * 16).toFixed(2)}deg`);
    card.style.setProperty('--rx', `${(-(py - 0.5) * 12).toFixed(2)}deg`);
    card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
    card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
  };
  wrap.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    card.classList.add('is-active');
    last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = requestAnimationFrame(apply);
  });
  wrap.addEventListener('pointerleave', () => {
    last = null;
    card.classList.remove('is-active');
    ['--rx', '--ry'].forEach((k) => card.style.setProperty(k, '0deg'));
  });
}

/* =========================================================
   Export PNG haute définition (2000 × 1260, ratio carte bancaire)
   ========================================================= */
/** Dimensions de l'image téléchargeable : 2000 × 1260, au ratio d'une carte bancaire. */
const CW = 2000, CH = 1260;

/** Attend les polices de la carte (au plus quatre secondes) pour que l'image ne sorte pas en police de secours. */
async function waitCardFonts() {
  if (!document.fonts?.load) return;
  const all = Promise.all([
    document.fonts.load(`400 100px ${DISPLAY}`, 'HG'),
    document.fonts.load(`400 60px ${PIXEL}`, '0123'),
    document.fonts.load(`700 60px ${PIXEL}`, '0123'),
    document.fonts.load(`500 40px ${BODY}`, 'Aa'),
    document.fonts.load(`700 40px ${BODY}`, 'Aa'),
  ]).catch(() => {});
  await Promise.race([all, new Promise((r) => setTimeout(r, 4000))]);
}
/** Chemin d'un rectangle aux coins arrondis (sans remplissage). */
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/** Cadre « pixel » : rectangle aux coins en escalier. */
function pixelRect(ctx, x, y, w, h, s) {
  ctx.beginPath();
  ctx.moveTo(x + 2 * s, y); ctx.lineTo(x + w - 2 * s, y); ctx.lineTo(x + w - 2 * s, y + s); ctx.lineTo(x + w - s, y + s);
  ctx.lineTo(x + w - s, y + 2 * s); ctx.lineTo(x + w, y + 2 * s); ctx.lineTo(x + w, y + h - 2 * s); ctx.lineTo(x + w - s, y + h - 2 * s);
  ctx.lineTo(x + w - s, y + h - s); ctx.lineTo(x + w - 2 * s, y + h - s); ctx.lineTo(x + w - 2 * s, y + h); ctx.lineTo(x + 2 * s, y + h);
  ctx.lineTo(x + 2 * s, y + h - s); ctx.lineTo(x + s, y + h - s); ctx.lineTo(x + s, y + h - 2 * s); ctx.lineTo(x, y + h - 2 * s);
  ctx.lineTo(x, y + 2 * s); ctx.lineTo(x + s, y + 2 * s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + 2 * s, y + s); ctx.closePath();
}
/** Espacement entre lettres pour le texte suivant. Ignoré si le navigateur ne le gère pas. */
const spacing = (ctx, px) => { if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`; };
/**
 * Choisit la plus grande taille de police (de start à min) pour que le texte tienne dans maxW.
 * Si même la taille minimale ne suffit pas, le texte est raccourci avec « … ».
 * @returns {number|{size: number, text: string}} la taille si elle suffit, sinon la taille et le texte raccourci
 */
function fitText(ctx, text, maxW, font, start, min) {
  let s = start;
  for (; s > min; s -= 4) { ctx.font = font(s); if (ctx.measureText(text).width <= maxW) return s; }
  ctx.font = font(min);
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return { size: min, text: t === text ? t : `${t}…` };
}
/** Dessine une image en « couverture » dans la zone : elle remplit la zone, rognée au centre, sans déformation. */
function coverDraw(ctx, img, x, y, w, h) {
  const r = Math.max(w / img.width, h / img.height);
  const iw = img.width * r, ih = img.height * r;
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

/**
 * Dessine la carte de membre en haute définition sur un canvas (pour le téléchargement en PNG).
 * Les images (logo, photo, badges) sont chargées avec CORS, sinon le canvas ne peut pas être exporté.
 * @param {HTMLCanvasElement} canvas canvas à remplir
 * @param {object} c carte du membre (RPC hg_member_card, badges déjà complétés par addBadgeLevels)
 * @returns {Promise<void>}
 */
export async function renderIdCard(canvas, c) {
  const color = safeColor(c.color);
  const badges = (Array.isArray(c.badges) ? c.badges : []).slice(0, 6);
  const [, logo, avatar, ...bImgs] = await Promise.all([
    waitCardFonts(),
    loadImage(currentLogo(), { cors: true }),
    c.avatar_url ? loadImage(c.avatar_url, { cors: true }) : Promise.resolve(null),
    ...badges.map((b) => (b.image_url ? loadImage(b.image_url, { cors: true }) : Promise.resolve(null))),
  ]);
  canvas.width = CW; canvas.height = CH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CW, CH);

  // Fond + découpe arrondie
  ctx.save();
  rr(ctx, 0, 0, CW, CH, 64); ctx.clip();
  const g = ctx.createLinearGradient(0, 0, CW, CH);
  g.addColorStop(0, '#221A1D'); g.addColorStop(0.55, '#141316'); g.addColorStop(1, '#0C0C0F');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, CH);
  const halo = ctx.createRadialGradient(CW * 0.78, CH * 0.2, 10, CW * 0.78, CH * 0.2, 900);
  halo.addColorStop(0, `${color}33`); halo.addColorStop(1, `${color}00`);
  ctx.fillStyle = halo; ctx.fillRect(0, 0, CW, CH);
  // trame pixel discrète
  ctx.fillStyle = 'rgba(242,239,234,0.025)';
  for (let y = 0; y < CH; y += 20) for (let x = (y / 20) % 2 ? 0 : 10; x < CW; x += 20) ctx.fillRect(x, y, 6, 6);
  // reflet holographique figé
  const holo = ctx.createLinearGradient(0, 0, CW, CH);
  RAINBOW.forEach((r, i) => holo.addColorStop(i / (RAINBOW.length - 1), `${r}14`));
  ctx.fillStyle = holo; ctx.fillRect(0, 0, CW, CH);

  // En-tête
  ctx.imageSmoothingEnabled = false;
  if (logo) { const s = 170, r = Math.min(s / logo.width, s / logo.height); ctx.drawImage(logo, 90, 70 + (s - logo.height * r) / 2, logo.width * r, logo.height * r); }
  ctx.imageSmoothingEnabled = true;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#F2EFEA'; ctx.font = `400 74px ${DISPLAY}`; spacing(ctx, 2);
  ctx.fillText('HUMANE GANG', 300, 150);
  ctx.fillStyle = '#E2C77E'; ctx.font = `700 38px ${PIXEL}`; spacing(ctx, 6);
  ctx.fillText('CARTE DE MEMBRE', 302, 214);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ABA7A0'; ctx.font = `400 30px ${PIXEL}`; spacing(ctx, 4);
  ctx.fillText('N° DE MEMBRE', CW - 90, 120);
  ctx.fillStyle = '#F2EFEA'; ctx.font = `700 108px ${PIXEL}`; spacing(ctx, 6);
  ctx.fillText(num4(c.member_number), CW - 86, 226);
  spacing(ctx, 0);

  // Bande arc-en-ciel
  const bw = CW / RAINBOW.length;
  RAINBOW.forEach((r, i) => { ctx.fillStyle = r; ctx.fillRect(Math.floor(i * bw), 286, Math.ceil(bw) + 1, 26); });

  // Photo
  const ax = 90, ay = 380, as = 420;
  ctx.fillStyle = color; pixelRect(ctx, ax - 18, ay - 18, as + 36, as + 36, 14); ctx.fill();
  ctx.fillStyle = '#0E0E10'; pixelRect(ctx, ax - 6, ay - 6, as + 12, as + 12, 10); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, as, as); ctx.clip();
  if (avatar) coverDraw(ctx, avatar, ax, ay, as, as);
  else {
    ctx.fillStyle = color; ctx.fillRect(ax, ay, as, as);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = ay; y < ay + as; y += 28) ctx.fillRect(ax, y, as, 14);
    ctx.fillStyle = '#F2EFEA'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `400 170px ${DISPLAY}`;
    ctx.fillText(initials(c.pseudo), ax + as / 2, ay + as / 2 + 6);
  }
  ctx.restore();

  // Champs
  const fx = 610, fw = 760;
  /** Dessine une étiquette de champ : petit texte gris en majuscules. */
  const label = (t, y) => { ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ABA7A0'; ctx.font = `400 28px ${PIXEL}`; spacing(ctx, 4); ctx.fillText(t.toUpperCase(), fx, y); spacing(ctx, 0); };
  label('Pseudo', 420);
  ctx.fillStyle = '#F2EFEA';
  const pseudo = String(c.pseudo || '?');
  const fit = fitText(ctx, pseudo, fw, (s) => `400 ${s}px ${DISPLAY}`, 120, 56);
  ctx.fillText(typeof fit === 'object' ? fit.text : pseudo, fx, 540);
  ctx.fillStyle = color; ctx.fillRect(fx, 570, 120, 10);
  label('Membre depuis', 650);
  ctx.fillStyle = '#F2EFEA'; ctx.font = `700 52px ${BODY}`; ctx.fillText(sinceLabel(c.member_since, c.joined_on) + (c.gen ? ` · ${generationLabel(c.gen)}` : ''), fx, 715);
  const bday = birthdayLabel(c.birthday_dm);
  if (bday) { label('Anniversaire', 795); ctx.fillStyle = '#F2EFEA'; ctx.font = `700 52px ${BODY}`; ctx.fillText(bday, fx, 860); }

  // Badges (jusqu'à 6)
  const bx = 1440, by = 380;
  ctx.textAlign = 'left'; ctx.fillStyle = '#ABA7A0'; ctx.font = `400 28px ${PIXEL}`; spacing(ctx, 4);
  ctx.fillText(`BADGES · ${(c.badges || []).length}`, bx, 420); spacing(ctx, 0);
  if (!badges.length) { ctx.fillStyle = 'rgba(242,239,234,0.4)'; ctx.font = `500 34px ${BODY}`; ctx.fillText('À débloquer…', bx, 500); }
  badges.forEach((b, i) => {
    const cx = bx + 75 + (i % 3) * 160, cy = by + 150 + Math.floor(i / 3) * 170, r = 66;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(226,199,126,0.5)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#1F1F23'; ctx.fill(); ctx.clip();
    const im = bImgs[i];
    if (im) coverDraw(ctx, im, cx - r, cy - r, r * 2, r * 2);
    else { ctx.fillStyle = '#E2C77E'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 46px ${BODY}`; ctx.fillText(initials(b.name), cx, cy + 2); }
    ctx.restore();
    if (b.lv) { // pastille de niveau (I, II, III…) en bas à droite du badge
      const t = roman(b.level);
      ctx.font = `700 30px ${PIXEL}`;
      const w = Math.max(48, ctx.measureText(t).width + 24), h = 40, x = cx + r - w + 14, y = cy + r - h + 10;
      ctx.fillStyle = '#141316'; pixelRect(ctx, x - 4, y - 4, w + 8, h + 8, 4); ctx.fill();
      ctx.fillStyle = '#E2C77E'; pixelRect(ctx, x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#121212'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x + w / 2, y + h / 2 + 2);
    }
  });

  // Statistiques
  const sy = 905, sh = 150, gap = 20, sw = (CW - 180 - gap * 4) / 5;
  STATS.forEach(([k, one, many], i) => {
    const x = 90 + i * (sw + gap), n = Number(c.stats?.[k]) || 0;
    ctx.fillStyle = 'rgba(242,239,234,0.05)'; pixelRect(ctx, x, sy, sw, sh, 8); ctx.fill();
    ctx.fillStyle = RAINBOW[i]; ctx.fillRect(x + 16, sy + 16, 30, 8);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#F2EFEA'; ctx.font = `700 64px ${PIXEL}`; ctx.fillText(String(n), x + 16, sy + 98);
    ctx.fillStyle = '#ABA7A0'; ctx.font = `500 28px ${BODY}`; ctx.fillText(n > 1 ? many : one, x + 18, sy + 134);
  });

  // Pied : puce, code-barres (encode le numéro de membre, affiché dans l'en-tête)
  const fy = 1110;
  ctx.fillStyle = '#C9A962'; pixelRect(ctx, 90, fy, 130, 96, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(90, fy + 48); ctx.lineTo(220, fy + 48); ctx.moveTo(155, fy); ctx.lineTo(155, fy + 96); ctx.stroke();
  let x = 280;
  const bars = barcode(num4(c.member_number).repeat(7)), unit = 640 / bars.reduce((a, b) => a + b, 0);
  ctx.fillStyle = 'rgba(242,239,234,0.75)';
  bars.forEach((w, i) => { if (i % 2 === 0) ctx.fillRect(x, fy + 8, w * unit, 80); x += w * unit; });
  ctx.restore();

  // Liseré
  ctx.strokeStyle = 'rgba(242,239,234,0.14)'; ctx.lineWidth = 4;
  rr(ctx, 2, 2, CW - 4, CH - 4, 62); ctx.stroke();
}

/**
 * Crée l'image de la carte puis la télécharge. Le bouton reste désactivé pendant la préparation.
 * @param {HTMLButtonElement} btn bouton « Télécharger la carte »
 * @param {object} card carte du membre
 */
async function onDownload(btn, card) {
  btn.disabled = true;
  const label = btn.innerHTML;
  btn.textContent = 'Préparation…';
  try {
    const canvas = document.createElement('canvas');
    await renderIdCard(canvas, card);
    const slug = String(card.pseudo || 'membre').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'membre';
    await downloadCanvas(canvas, `carte-hg-${slug}-${num4(card.member_number)}.png`);
    toast('Carte téléchargée', 'ok');
    questTrack('carte_identite', 'carte'); // quête « carte d'identité téléchargée »
    import('../../commun/sound.js').then((m) => m.playSound?.('success')).catch(() => {});
  } catch (e) {
    toast(`Téléchargement impossible : ${errMsg(e)}`, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = label;
  }
}

/* ---------- Annuaire ---------- */
/** Charge l'annuaire « Le gang » (membres triés par pseudo) et l'affiche sous la carte. */
async function loadGang() {
  const ul = $('#gang');
  try {
    const { data, error } = await sb.rpc('hg_members');
    if (error) throw error;
    const list = (data || []).slice().sort((a, b) => String(a.pseudo).localeCompare(String(b.pseudo), 'fr'));
    if (!list.length) { ul.innerHTML = '<li class="empty">Personne pour l\'instant.</li>'; return; }
    ul.innerHTML = list.map((m) => `
      <li><a class="gang-item${m.id === targetId ? ' is-current' : ''}" href="/pages/compte/membre.html?id=${encodeURIComponent(m.id)}"${m.id === targetId ? ' aria-current="page"' : ''}>
        ${avatarPresence(avatarHtml(m, 44), m.id)}
        <span class="gang-txt"><strong>${esc(m.pseudo)}${m.id === me.id ? ' <span class="gang-me">toi</span>' : ''}</strong>
          <span class="small muted">depuis ${esc(sinceLabel(m.member_since))}</span></span>
      </a></li>`).join('');
  } catch (e) {
    ul.innerHTML = `<li class="empty">Impossible de charger le gang (${esc(errMsg(e))}).</li>`;
  }
}

/* ---------- Niveaux des badges (hg_user_badges.level + hg_badges.levels) ---------- */
/**
 * Ajoute à chaque badge à niveaux son niveau atteint et son image de niveau (modifie card.badges sur place).
 * En cas d'échec, les badges restent sans niveau : la carte s'affiche quand même.
 * @param {object} card carte du membre
 */
async function addBadgeLevels(card) {
  if (!Array.isArray(card.badges) || !card.badges.length) return;
  try {
    const [ub, bd] = await Promise.all([
      sb.from('hg_user_badges').select('badge_code, level').eq('user_id', card.id),
      sb.from('hg_badges').select('code, image_url, levels_enabled, levels'),
    ]);
    if (ub.error || bd.error) throw ub.error || bd.error;
    const lvl = new Map((ub.data || []).map((r) => [r.badge_code, Number(r.level) || 1]));
    const defs = new Map((bd.data || []).map((r) => [r.code, r]));
    card.badges = card.badges.map((b) => {
      const def = defs.get(b.code);
      if (!hasLevels(def)) return b;
      const level = lvl.get(b.code) || 1;
      return { ...b, level, lv: def, image_url: levelImage(def, level) || b.image_url };
    });
  } catch (e) { console.warn('[niveaux]', e?.message || e); }
}

/* ---------- Hors ligne (Q4) ---------- */
/** Carte de membre depuis la copie de l'appareil, en lecture seule : ni annuaire, ni vitrine, ni carte d'un autre membre. */
function renderOffline() {
  document.body.classList.add('membre-offline');
  const card = isMe ? OFF.copie?.membre?.card : null;
  app.innerHTML = `
    <section class="page-head mb-head"><div><p class="eyebrow">Carte d'identité HG</p><h1 class="page-title" id="mb-title">Ma carte</h1></div></section>
    ${offlineBannerHtml(card ? OFF.copie.membre.at : null, 'ta carte de membre')}
    ${card ? `<section class="mb-layout" id="mb-main"><div class="mb-card-col">${cardHtml(card)}</div><div class="card mb-badges">${badgesHtml(card)}</div></section>`
      : `<div class="card mb-missing"><p class="empty">${me && !isMe ? 'Hors ligne, seule ta propre carte est disponible.' : 'Ta carte de membre n’est pas encore gardée sur cet appareil.'}</p>
        <div class="btn-row"><a class="btn btn-ghost" href="/pages/cartes/cartes.html">Voir ma collection</a></div></div>`}`;
  if (card) { bindHolo(); $('#dl-card')?.addEventListener('click', (e) => onDownload(e.currentTarget, card)); }
  app.removeAttribute('aria-busy');
}

/* ---------- Lancement ---------- */
if (OFF) renderOffline(); else await renderOnline();

/** Lancement en ligne : squelette, annuaire et carte (lecture de la base). */
async function renderOnline() {
  // Le squelette s'affiche tout de suite ; la carte remplace les blocs en attente une fois les données reçues.
  shell();
  // L'annuaire se charge en parallèle de la carte, sans l'attendre.
  const gangP = loadGang();
  import('./skills.js').then((m) => m.mountSkillFilter($('#gang-skill-filter'), { grid: $('#gang'), meId: me.id })).catch(() => {}); // P7 : « Qui sait faire… »
  import('./profil-gaming.js').then((m) => m.mountWhoPlays($('#gm-who'))).catch((e) => console.warn('[gaming]', e)); // « Qui joue à… »
  try {
    const { data, error } = await sb.rpc('hg_member_card', { p_user: targetId });
    if (error) throw error;
    const card = data && typeof data === 'object' ? data : null;
    await loadBadgeMax();
    if (card?.id) await addBadgeLevels(card);
    // Génération OG / 2e gen (idée C8) et titres « Pilier de … » (idée C7) : facultatifs, jamais bloquants.
    if (card?.id) {
      const [gens, tags] = await Promise.all([loadGenerations(), canAccess('cartes') ? loadTagLabels(card.id) : Promise.resolve([])]);
      card.gen = gens.get(card.id) || null;
      card.titles = titlesOf(tags);
    }
    if (!card || !card.id) {
      $('#mb-main').innerHTML = `<div class="card mb-missing"><p class="empty">Ce membre est introuvable : le compte a peut-être été supprimé.</p>
        <div class="btn-row"><a class="btn btn-ghost" href="/pages/compte/membre.html">Voir ma carte</a></div></div>`;
    } else {
      document.title = `${card.pseudo} · Carte de membre · Humane Gang`;
      $('#mb-title').textContent = isMe ? 'Ma carte' : card.pseudo;
      $('#mb-main').innerHTML = `<div class="mb-card-col">${cardHtml(card)}</div><div class="card mb-badges">${badgesHtml(card)}</div>`;
      bindHolo();
      $('#dl-card').addEventListener('click', (e) => onDownload(e.currentTarget, card));
      if (!isMe && canAccess('cartes')) { // collection de ce membre, en lecture seule (/pages/cartes/cartes.html)
        $('#mb-actions').hidden = false;
        $('#mb-actions').innerHTML = `<a class="btn btn-ghost" href="/pages/cartes/cartes.html#collection/${esc(card.id)}">Voir sa collection</a>`;
      }
      if (canAccess('cartes')) mountShowcase($('#mb-showcase'), { userId: card.id, isMe, pseudo: card.pseudo });
      if (!isMe) questTrack('fiche_vue', card.id); // quête « fiches consultées » : jamais sa propre carte
      else saveOffline(me, 'membre', { card }); // Q4 : sa propre carte gardée pour le hors ligne
      // Social (migration 090) : bloc « En jeu » et mercis, chargés à la demande sans retarder la carte.
      import('./profil-gaming.js').then((m) => m.mountGamingBlock($('#mb-gaming'), card.id, isMe)).catch((e) => console.warn('[gaming]', e));
      const merciEv = params.get('merci');
      import('../accueil/mercis.js').then((m) => m.mountThanks($('#mb-thanks'), card, isMe, { eventId: merciEv && UUID_RE.test(merciEv) ? merciEv : null, mePseudo: me.pseudo }))
        .catch((e) => console.warn('[mercis]', e));
      // Idées P6 (souvenirs communs) et P7 (compétences) : modules à part, chargés sans bloquer la carte
      import('./friendship.js').then((m) => m.mountFriendship($('#mb-friend'), { card, isMe, me })).catch((e) => console.warn('[amitié]', e?.message || e));
      import('./skills.js').then((m) => m.mountSkillPills($('#mb-skills'), card.id, isMe)).catch((e) => console.warn('[compétences]', e?.message || e));
    }
  } catch (e) {
    $('#mb-main').innerHTML = `<div class="card mb-missing"><p class="empty">Impossible de charger la carte (${esc(errMsg(e))}).</p></div>`;
  }
  await gangP;
  $$('.idc-skeleton').forEach((n) => n.remove());
  app.removeAttribute('aria-busy');
}
