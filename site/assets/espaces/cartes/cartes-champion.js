// ===== Cartes à collectionner — « Ma carte Champion » (idée C17, Champions du gang ; nouvelle version, migration 202) =====
// Fenêtre ouverte depuis l'onglet Collection (/pages/cartes/cartes.html) : le membre compose sa carte en trois étapes avec un aperçu
// permanent (cardHtml) : son jeu, son visuel, ses mots. Il la propose ; le Staff « cartes » la valide dans le panel (admin-cards/champions.js).
// Acceptée : carte rare de la série « Champions du gang <année> », famille Jeu vidéo, tirable dans les boosters,
// et un exemplaire brillant offert au membre. Une carte par membre et par an ; personne ne crée la carte d'un autre.
// Image : le site la compose sur un canvas au format de la fenêtre des cartes (280 × 160, emblème, photo de profil ou image du membre,
// couleur, motif, inscription) et la dépose dans le bucket hg-champions, dossier du membre. Une proposition sans image garde son
// emblème, images assets/cartes/champions/<id>.svg : pictos génériques dessinés pour le gang (aucun logo de jeu).
// RPC (migrations 082 et 202) : hg_champion_me(), hg_champion_propose(p jsonb), hg_champion_withdraw().
// Tout texte venant de la base ou saisi passe par esc() (cardHtml échappe aussi) ; sur le canvas, fillText n'interprète rien.
// Exporte : GAMES, EMBLEMS, BUCKET, championCardPreview, openChampion(ctx) — ctx : { onClose } (rendu du focus).
import { sb, toast, errMsg, esc } from '../../commun/core.js';
import { prepareImage } from '../../commun/image-compress.js';
import { cardHtml } from './cartes-ui.js';

export const BUCKET = 'hg-champions';
/** Jeux proposés (identifiant, libellé) : liste blanche, identique à celle de la base. */
export const GAMES = [['lol', 'LoL'], ['aoe2', 'AoE2'], ['ck3', 'CK3'], ['minecraft', 'Minecraft'], ['among_us', 'Among Us'], ['codenames', 'Nom de code'], ['echecs', 'Échecs'], ['uno', 'Uno'], ['loup_garou', 'Loup-Garou'], ['autre', 'Autre']];
/** Mots « Je suis » : liste blanche, identique à celle de la base. */
const TITLES = ['main', 'capitaine', 'stratège', 'soutien', 'bâtisseur', 'chasseur', 'la terreur de'];
/** Emblèmes (identifiant, libellé, tracé 24 × 24) : liste blanche, identique à celle de la base et aux images des cartes. */
export const EMBLEMS = [
  ['epee', 'Épée', 'M20 4 9.5 14.5M20 4h-4.5M20 4v4.5M7 12.5l4.5 4.5M9.2 14.8 5 19M3.5 20.5 5 19'],
  ['chateau', 'Château', 'M4 21V8h3v3h3V8h4v3h3V8h3v13zM10 21v-4a2 2 0 0 1 4 0v4'],
  ['couronne', 'Couronne', 'M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5zM5 21h14'],
  ['pioche', 'Pioche', 'M3 10.5c3.5-6 14.5-6 18 0M12 7v14'],
  ['fusee', 'Fusée', 'M12 2.5c3 2.8 4 6.6 4 10.5l-1.8 4h-4.4L8 13c0-3.9 1-7.7 4-10.5zM8 13l-3 3v3l3.2-2M16 13l3 3v3l-3.2-2M12 9.5v.01M10.5 20.5h3'],
  ['baton', 'Bâton magique', 'M5 19 14.5 9.5M16.5 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM20.5 3.5v.01M21 12v.01M12 3v.01'],
  ['bouclier', 'Bouclier', 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
  ['etoile', 'Étoile', 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z'],
  ['manette', 'Manette', 'M7 8h10a4 4 0 0 1 4 4l.6 4.2a2.2 2.2 0 0 1-4 1.5L16 16H8l-1.6 1.7a2.2 2.2 0 0 1-4-1.5L3 12a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M15.5 12h.01M17.5 13.5h.01'],
  ['de', 'Dé', 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01'],
  ['carte', 'Carte', 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM12 8.5l2.5 3.5-2.5 3.5-2.5-3.5z'],
  ['eclair', 'Éclair', 'M13 2 5 13.5h6L10 22l9-12h-6.5z'],
  ['flamme', 'Flamme', 'M12 2.5c1 3.5 6 6 6 11.5a6 6 0 0 1-12 0c0-2.5 1.3-4 2.5-5 .2 2 1 3 2 3.5C10 9 10.5 5.5 12 2.5z'],
  ['coeur', 'Cœur', 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z'],
  ['note', 'Note', 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'],
  ['cible', 'Cible', 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM12 12h.01'],
  ['lune', 'Lune', 'M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z'],
  ['ancre', 'Ancre', 'M12 7a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zM12 7v15M4 13c0 5 4 8 8 8s8-3 8-8M4 13l-1.5 3M4 13l3 2M20 13l1.5 3M20 13l-3 2M8 10h8'],
  ['hache', 'Hache', 'M14 3 5 21M9.5 5.5c3.5-2 8-.5 10 3-2.5-.5-5.5.5-7 3.5z'],
  ['cle', 'Clé', 'M15 3a6 6 0 1 1-5.3 8.8L3 18.5V21h3v-2h2v-2h2l1.7-1.7A6 6 0 0 1 15 3zM16.5 7.5h.01'],
];
const COLORS = [['#B70127', 'Rouge'], ['#FE3104', 'Orange'], ['#FCA301', 'Ambre'], ['#159946', 'Vert'], ['#2B5AE2', 'Bleu'], ['#4E2398', 'Violet'], ['#121216', 'Noir']];
const PATTERNS = [['uni', 'Uni'], ['rayons', 'Rayons'], ['pixels', 'Pixels'], ['losanges', 'Losanges'], ['arc', 'Arc-en-ciel']];
const SOURCES = [['embleme', 'Un emblème'], ['photo', 'Ma photo de profil'], ['image', 'Mon image']];
const RAINBOW = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
/** Idées de « Inspire-moi » : écrites ici, aucun appel extérieur. */
const PHRASES = ['Je ne ban jamais Yasuo.', 'Trois tours et ça passe.', 'Plus quatre, sans regret.', 'Un mot, huit cartes.', 'Je joue, donc je râle.', 'La dernière partie, promis.',
  'Ce n’était pas ma faute.', 'J’ai un plan, il est mauvais.', 'Toujours premier à quitter.', 'Le lag m’a poussé.', 'Perdre, c’est apprendre vite.', 'Je gagne quand je veux.'];
const MAIN_MAX = 24;
const FLAVOR_MAX = 60;
const INS_MAX = 16;
const FILE_MAX = 2 * 1024 * 1024;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Format de la fenêtre des cartes : l'image est composée dans ces unités. */
const W = 280, H = 160;
const STEPS = ['Mon jeu', 'Mon visuel', 'Mes mots'];

const gameLabel = (id) => (GAMES.find(([g]) => g === id)?.[1] || 'Jeu vidéo');
const embPath = (id) => (EMBLEMS.find(([e]) => e === id) || EMBLEMS[7])[2];
const embIcon = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
/** Identifiant de fichier aléatoire (lettres et chiffres). */
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
/** Adresse publique d'une image composée. */
const publicUrl = (path) => sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

/** État de la fenêtre : réponse de hg_champion_me, formulaire, étape, images décodées, envoi en cours, contexte. */
const C = {
  me: null, step: 1, busy: false, ctx: null, dlg: null, images: { photo: null, image: null }, preview: '',
  form: { game: 'lol', game_label: '', title: 'main', main: '', source: 'embleme', emblem: 'epee', color: '#B70127', pattern: 'uni', flavor: '', inscription: '' },
};

/**
 * Carte Champion telle qu'elle sortira (même rendu que la vraie carte) : objet carte pour cardHtml.
 * Une ancienne proposition, sans image composée, montre son emblème.
 * @param {{pseudo: string, year: number, game: string, game_label?: string, title?: string, main: string, emblem: string, flavor?: string, image_path?: string, src?: string}} f
 * @returns {object}
 */
export function championCardPreview(f) {
  const emblem = EMBLEMS.some(([e]) => e === f.emblem) ? f.emblem : 'etoile';
  return {
    name: `${f.pseudo || 'Moi'} · ${f.title || 'main'} ${f.main || '…'}`, rarity: 'rare', family: 'jeu',
    image_url: f.src || (f.image_path ? publicUrl(f.image_path) : `/assets/cartes/champions/${emblem}.svg`),
    flavor: f.flavor || '', caption: `${(f.game === 'autre' && f.game_label) || gameLabel(f.game)} · édition ${f.year}`, set_name: `Champions ${f.year}`,
  };
}

/** Dessine le motif sur le fond : traits blancs discrets, ou arc-en-ciel de la charte. */
function drawPattern(x, p) {
  x.fillStyle = 'rgba(255, 255, 255, .09)';
  if (p === 'rayons') {
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, b = (i + .5) * Math.PI / 6;
      x.beginPath(); x.moveTo(W / 2, H / 2); x.lineTo(W / 2 + 320 * Math.cos(a), H / 2 + 320 * Math.sin(a)); x.lineTo(W / 2 + 320 * Math.cos(b), H / 2 + 320 * Math.sin(b)); x.fill();
    }
  } else if (p === 'pixels') {
    for (let i = 0; i < 46; i++) {
      x.fillStyle = `rgba(255, 255, 255, ${.05 + (i % 4) * .03})`;
      x.fillRect((i * 37) % W, (i * 53) % H, 14, 14);
    }
  } else if (p === 'losanges') {
    for (let c = 0; c < 9; c++) for (let l = 0; l < 6; l++) {
      const cx = c * 36 + (l % 2) * 18, cy = l * 32;
      x.beginPath(); x.moveTo(cx, cy - 16); x.lineTo(cx + 11, cy); x.lineTo(cx, cy + 16); x.lineTo(cx - 11, cy); x.fill();
    }
  } else if (p === 'arc') {
    x.lineWidth = 9;
    RAINBOW.forEach((col, i) => {
      x.strokeStyle = col;
      x.beginPath(); x.moveTo(-20, 150 - i * 9); x.quadraticCurveTo(W / 2, 40 - i * 9, W + 20, 150 - i * 9); x.stroke();
    });
  }
}

/**
 * Compose l'image de la carte. Le centre (152 unités de large) reste visible à toutes les tailles de carte :
 * les petites cartes ont une fenêtre plus haute et coupent les côtés.
 * @param {typeof C.form} f formulaire
 * @param {number} k échelle du canvas
 * @returns {HTMLCanvasElement}
 */
function compose(f, k) {
  const c = document.createElement('canvas');
  c.width = W * k; c.height = H * k;
  const x = c.getContext('2d');
  x.scale(k, k);
  x.fillStyle = f.color; x.fillRect(0, 0, W, H);
  drawPattern(x, f.pattern);
  const g = x.createRadialGradient(W / 2, H * .45, 10, W / 2, H / 2, W * .62);
  g.addColorStop(0, 'rgba(255, 255, 255, .18)'); g.addColorStop(1, 'rgba(0, 0, 0, .42)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const img = f.source === 'embleme' ? null : C.images[f.source];
  const ins = f.inscription.trim();
  if (img) {
    const S = 140, ox = (W - S) / 2, oy = (H - S) / 2;
    const r = Math.max(S / img.width, S / img.height), w = img.width * r, h = img.height * r;
    x.save();
    x.beginPath(); x.roundRect(ox, oy, S, S, 8); x.clip();
    x.drawImage(img, ox + (S - w) / 2, oy + (S - h) / 2, w, h);
    x.restore();
    x.strokeStyle = '#fff'; x.lineWidth = 2;
    x.beginPath(); x.roundRect(ox, oy, S, S, 8); x.stroke();
  } else {
    const s = 4, top = ins ? 12 : (H - 24 * s) / 2;
    x.save();
    x.translate((W - 24 * s) / 2, top); x.scale(s, s);
    x.strokeStyle = '#fff'; x.lineWidth = 1.6; x.lineCap = 'round'; x.lineJoin = 'round';
    x.stroke(new Path2D(embPath(f.emblem)));
    x.restore();
  }
  if (ins) {
    let size = 18;
    x.font = `${size}px "Archivo Black", Impact, sans-serif`;
    while (size > 9 && x.measureText(ins).width > 148) { size -= 1; x.font = `${size}px "Archivo Black", Impact, sans-serif`; }
    x.textAlign = 'center'; x.fillStyle = '#fff';
    x.shadowColor = 'rgba(0, 0, 0, .75)'; x.shadowBlur = 6;
    x.fillText(ins, W / 2, 146);
  }
  return c;
}

/** Bandeau d'état (proposition en attente, acceptée, refusée). */
function statusHtml(cur, year) {
  if (!cur) return '';
  if (cur.status === 'proposee') return `<p class="champ-status" role="status"><strong>Proposition envoyée.</strong> Le Staff la relit avant la sortie ; tu recevras ton exemplaire brillant dès qu’elle est validée.</p>
    <button type="button" class="btn btn-ghost" data-champ="withdraw">Retirer ma proposition</button>`;
  if (cur.status === 'acceptee' && Number(cur.year) === Number(year)) return `<p class="champ-status champ-ok" role="status"><strong>Ta carte Champion ${esc(year)} est sortie !</strong> Ton exemplaire brillant est dans ta collection. Tu pourras la refaire l’an prochain.</p>`;
  if (cur.status === 'refusee') return `<p class="champ-status champ-ko" role="status"><strong>Le Staff a demandé une modification.</strong>${cur.review_note ? ` « ${esc(cur.review_note)} »` : ''} Tu peux proposer une nouvelle version.</p>`;
  return '';
}

/** Une pastille à choix unique. */
const chipHtml = (name, value, label, on) => `<label class="champ-chip"><input type="radio" name="${name}" value="${esc(value)}" ${on ? 'checked' : ''}><span>${esc(label)}</span></label>`;

/** Étape 1 : le jeu, le mot « Je suis », le main. */
function step1() {
  const f = C.form;
  return `<fieldset class="champ-fs"><legend class="champ-lg">Jeu</legend>
      <div class="champ-chips">${GAMES.map(([id, label]) => chipHtml('champ-game', id, label, f.game === id)).join('')}</div>
    </fieldset>
    ${f.game === 'autre' ? `<div class="field"><label for="champ-game-label">Nom du jeu</label>
      <input id="champ-game-label" maxlength="${MAIN_MAX}" autocomplete="off" required value="${esc(f.game_label)}"></div>` : ''}
    <fieldset class="champ-fs"><legend class="champ-lg">Je suis</legend>
      <div class="champ-chips">${TITLES.map((t) => chipHtml('champ-word', t, t, f.title === t)).join('')}</div>
    </fieldset>
    <div class="field"><label for="champ-main">Mon champion, ma faction, mon rôle</label>
      <input id="champ-main" name="main" maxlength="${MAIN_MAX}" autocomplete="off" required value="${esc(f.main)}" placeholder="Ahri, Francs, dynastie de Serge…" aria-describedby="champ-main-help">
      <span class="small muted" id="champ-main-help">Du texte, jamais un logo.</span></div>`;
}

/** Étape 2 : la source de l'image, la couleur, le motif. */
function step2() {
  const f = C.form;
  const body = f.source === 'embleme'
    ? `<fieldset class="champ-fs"><legend class="champ-lg">Emblème · ${EMBLEMS.length} au choix</legend>
        <div class="champ-embs">${EMBLEMS.map(([id, label, d]) => `<label class="champ-emb" title="${esc(label)}"><input type="radio" name="champ-emblem" value="${id}" ${f.emblem === id ? 'checked' : ''}><span class="champ-emb-i">${embIcon(d)}<span class="visually-hidden">${esc(label)}</span></span></label>`).join('')}</div>
      </fieldset>`
    : f.source === 'image'
      ? `<div class="mc-depot"><button type="button" class="btn btn-ghost" data-champ="pick">${C.images.image ? 'Choisir une autre image' : 'Choisir une image'}</button>
          <input type="file" id="champ-file" accept="${FILE_TYPES.join(',')}" hidden aria-label="Mon image">
          <p>JPG, PNG ou WebP, 2 Mo au plus. Aucun logo ni personne sans son accord : le Staff relit avant la sortie.</p></div>`
      : `<p class="mc-aide">${C.me?.avatar_url ? 'Ta photo de profil sert d’image à ta carte.' : 'Tu n’as pas encore de photo de profil : ajoute-la dans Mon compte, ou choisis une autre image.'}</p>`;
  return `<fieldset class="champ-fs"><legend class="champ-lg">Image de ma carte</legend>
      <div class="champ-chips">${SOURCES.map(([id, label]) => chipHtml('champ-source', id, label, f.source === id)).join('')}</div>
    </fieldset>
    ${body}
    <fieldset class="champ-fs"><legend class="champ-lg">Couleur</legend>
      <div class="mc-couleurs">${COLORS.map(([c, label]) => `<label title="${esc(label)}"><input type="radio" name="champ-color" value="${c}" ${f.color === c ? 'checked' : ''}><span style="background:${c}"><span class="visually-hidden">${esc(label)}</span></span></label>`).join('')}</div>
    </fieldset>
    <fieldset class="champ-fs"><legend class="champ-lg">Motif</legend>
      <div class="champ-chips">${PATTERNS.map(([id, label]) => chipHtml('champ-pattern', id, label, f.pattern === id)).join('')}</div>
    </fieldset>`;
}

/** Étape 3 : la phrase, l'inscription. */
function step3() {
  const f = C.form;
  return `<div class="mc-ligne"><div class="field"><label for="champ-flavor">Ma phrase · ${FLAVOR_MAX} caractères</label>
      <input id="champ-flavor" name="flavor" maxlength="${FLAVOR_MAX}" autocomplete="off" value="${esc(f.flavor)}" placeholder="Je ne ban jamais Yasuo." aria-describedby="champ-fl-count"></div>
      <button type="button" class="btn btn-ghost" data-champ="inspire">Inspire-moi</button></div>
    <span class="small muted" id="champ-fl-count" aria-live="polite">${f.flavor.length} / ${FLAVOR_MAX}</span>
    <div class="field"><label for="champ-ins">Inscription sur l’image · ${INS_MAX} caractères, facultatif</label>
      <input id="champ-ins" maxlength="${INS_MAX}" autocomplete="off" value="${esc(f.inscription)}" placeholder="Depuis 2019"></div>
    <p class="mc-aide">Le Staff relit avant la sortie. Tu reçois un exemplaire brillant offert. Une carte par an.</p>`;
}

/** Formulaire de l'étape en cours, avec ses boutons. */
function formHtml() {
  const n = C.step;
  return `<ol class="mc-etapes">${STEPS.map((t, i) => `<li class="${i + 1 === n ? 'is-on' : i + 1 < n ? 'is-fait' : ''}"${i + 1 === n ? ' aria-current="step"' : ''}>${esc(t)}</li>`).join('')}</ol>
    <form class="champ-form" data-champ-form novalidate>
      ${n === 1 ? step1() : n === 2 ? step2() : step3()}
      <div class="mc-nav">${n > 1 ? '<button type="button" class="btn btn-ghost" data-champ="back">Retour</button>' : ''}
        <button type="submit" class="btn btn-sand${n === 3 ? ' champ-submit' : ''}" ${C.busy ? 'disabled' : ''}>${n < 3 ? 'Continuer' : C.busy ? 'Envoi…' : 'Proposer ma carte'}</button></div>
    </form>`;
}

/** Aperçu de la composition en cours (image à deux fois la taille de la fenêtre de carte). */
function draftPreview() {
  C.preview = compose(C.form, 2).toDataURL('image/webp', .85);
  return cardHtml(championCardPreview({ ...C.form, src: C.preview, pseudo: C.me.pseudo, year: C.me.year }), { size: 'md' });
}

/** Contenu de la fenêtre. */
function bodyHtml() {
  const m = C.me;
  if (!m) return '<p class="muted" aria-live="polite">Chargement…</p>';
  const cur = m.current;
  const head = `<p class="eyebrow">Champions du gang</p>
    <h2 id="champ-title" class="champ-title" tabindex="-1">Ma carte Champion</h2>`;
  if (m.can_propose) {
    return `${head}${statusHtml(cur, m.year)}
      <div class="mc-ch"><div class="mc-ch-g"><div class="champ-preview" id="champ-preview" aria-live="polite">${draftPreview()}</div><p>Aperçu en direct</p></div>
        <div class="mc-ch-d">${formHtml()}</div></div>`;
  }
  const shown = cur && cur.status !== 'refusee' && cur.status !== 'retiree' ? { ...cur, pseudo: m.pseudo, year: cur.year } : { ...C.form, pseudo: m.pseudo, year: m.year };
  return `${head}<div class="champ-preview" id="champ-preview" aria-live="polite">${cardHtml(championCardPreview(shown), { size: 'md' })}</div>
    ${statusHtml(cur, m.year)}`;
}

/** Redessine la fenêtre ; focus (sélecteur) reçoit le focus. */
function render(focus = null) {
  const body = C.dlg?.querySelector('.champ-body');
  if (!body) return;
  C.dlg.classList.toggle('mc-champ', !!C.me?.can_propose);
  body.innerHTML = bodyHtml();
  if (focus) body.querySelector(focus)?.focus({ preventScroll: true });
}

/** Met à jour l'aperçu sans redessiner le formulaire (le curseur reste dans le champ). */
function updatePreview() {
  const el = C.dlg?.querySelector('#champ-preview');
  if (el && C.me) el.innerHTML = draftPreview();
  const cnt = C.dlg?.querySelector('#champ-fl-count');
  if (cnt) cnt.textContent = `${C.form.flavor.length} / ${FLAVOR_MAX}`;
}

/** Lit hg_champion_me. */
async function load() {
  const { data, error } = await sb.rpc('hg_champion_me');
  if (error) throw error;
  C.me = data && typeof data === 'object' ? data : null;
  if (!C.me) throw new Error('Les cartes Champions ne sont pas encore disponibles.');
}

/** Charge la photo de profil pour le canvas (adresse publique, autorisée en lecture croisée). */
async function loadPhoto() {
  if (C.images.photo || !C.me?.avatar_url) return C.images.photo;
  const i = new Image();
  i.crossOrigin = 'anonymous';
  i.src = C.me.avatar_url;
  await i.decode();
  C.images.photo = i;
  return i;
}

/** Contrôle et décode l'image choisie par le membre (réduite, métadonnées retirées). */
async function pickFile(file) {
  if (!FILE_TYPES.includes(file.type)) { toast('Choisis une image JPG, PNG ou WebP', 'error'); return; }
  if (file.size > FILE_MAX) { toast('Image trop lourde : 2 Mo au plus', 'error'); return; }
  try {
    const small = await prepareImage(file, { max: 600, strip: true });
    C.images.image = await createImageBitmap(small.blob);
    render('[data-champ="pick"]');
  } catch (e) { toast(errMsg(e), 'error'); }
}

/** Change de source d'image ; la photo de profil se charge à la demande. */
async function setSource(source) {
  C.form.source = source;
  if (source === 'photo') {
    try { await loadPhoto(); } catch { C.images.photo = null; toast('Impossible de lire ta photo de profil', 'error'); C.form.source = 'embleme'; }
  }
  render(`[name="champ-source"][value="${C.form.source}"]`);
}

/** Ce qui manque avant de passer à l'étape suivante : [message, champ], ou null. */
function missing(step) {
  const f = C.form;
  if (step >= 1) {
    if (f.game === 'autre' && !f.game_label.trim()) return ['Écris le nom du jeu', '#champ-game-label', 1];
    if (!f.main.trim()) return ['Écris ton main (champion, civilisation…)', '#champ-main', 1];
  }
  if (step >= 2 && f.source !== 'embleme' && !C.images[f.source]) return [f.source === 'image' ? 'Choisis ton image' : 'Ajoute une photo de profil, ou choisis une autre image', '[name="champ-source"]:checked', 2];
  return null;
}

/** Passe à l'étape n (l'étape en cours doit être complète pour avancer). */
function go(n) {
  if (n > C.step) {
    const pb = missing(C.step);
    if (pb) { toast(pb[0], 'error'); C.dlg.querySelector(pb[1])?.focus(); return; }
  }
  C.step = n;
  render('.mc-etapes + .champ-form input, .mc-etapes + .champ-form button');
}

/** Dépose l'image composée dans le dossier du membre ; renvoie son chemin. */
async function uploadImage() {
  await document.fonts?.load?.('18px "Archivo Black"');
  const canvas = compose(C.form, 3);
  const png = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!png) throw new Error('Impossible de préparer l’image');
  const img = await prepareImage(new File([png], 'champion.png', { type: 'image/png' }), { max: W * 3, strip: true });
  const path = `${C.me.user_id}/${rid()}.${img.ext === 'jpg' ? 'jpg' : 'webp'}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, img.blob, { contentType: img.contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw error;
  return path;
}

/** Envoie la proposition. */
async function submit() {
  if (C.busy) return;
  const f = C.form;
  f.main = f.main.trim(); f.flavor = f.flavor.trim(); f.inscription = f.inscription.trim(); f.game_label = f.game_label.trim();
  const pb = missing(2);
  if (pb) { C.step = pb[2]; render(pb[1]); toast(pb[0], 'error'); return; }
  C.busy = true;
  render('.champ-submit');
  let path = null;
  try {
    path = await uploadImage();
    const { error } = await sb.rpc('hg_champion_propose', { p: { game: f.game, game_label: f.game === 'autre' ? f.game_label : null, title: f.title, main: f.main, emblem: f.emblem,
      flavor: f.flavor || null, color: f.color, pattern: f.pattern, inscription: f.inscription || null, source: f.source, image_path: path } });
    if (error) throw error;
    toast('Proposition envoyée au Staff', 'ok');
    await load();
    C.busy = false;
    render('#champ-title');
  } catch (e) {
    if (path) sb.storage.from(BUCKET).remove([path]).catch(() => {});
    C.busy = false;
    toast(errMsg(e), 'error');
    render('.champ-submit');
  }
}

/** Retire la proposition en attente, et son image. */
async function withdraw(btn) {
  btn.disabled = true;
  const path = C.me?.current?.image_path;
  try {
    const { error } = await sb.rpc('hg_champion_withdraw');
    if (error) throw error;
    if (path) sb.storage.from(BUCKET).remove([path]).catch(() => {});
    await load();
    C.step = 1;
    toast('Proposition retirée', 'ok');
    render('#champ-title');
  } catch (e) { btn.disabled = false; toast(errMsg(e), 'error'); }
}

/** Remplit la phrase avec une idée au hasard, jamais la même deux fois de suite. */
function inspire() {
  const list = PHRASES.filter((p) => p !== C.form.flavor);
  C.form.flavor = list[Math.floor(Math.random() * list.length)];
  const el = C.dlg.querySelector('#champ-flavor');
  if (el) el.value = C.form.flavor;
  updatePreview();
}

/** Crée la fenêtre une seule fois (dialog modal, plein écran sur téléphone). */
function ensureDialog() {
  if (C.dlg) return C.dlg;
  const d = document.createElement('dialog');
  d.id = 'cartes-champion';
  d.className = 'cartes-dialog champ-dlg';
  d.setAttribute('aria-labelledby', 'champ-title');
  d.innerHTML = `<button type="button" class="cartes-close" data-champ="close" aria-label="Fermer"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
    <div class="cartes-dialog-pad champ-body"></div>`;
  (document.getElementById('app') || document.body).append(d);
  d.addEventListener('click', (e) => {
    const t = e.target.closest('[data-champ]');
    if (!t || t.disabled) return;
    const a = t.dataset.champ;
    if (a === 'close') d.close();
    else if (a === 'withdraw') withdraw(t);
    else if (a === 'back') go(C.step - 1);
    else if (a === 'inspire') inspire();
    else if (a === 'pick') d.querySelector('#champ-file')?.click();
  });
  d.addEventListener('input', (e) => {
    const t = e.target, f = C.form;
    if (t.id === 'champ-main') f.main = t.value.slice(0, MAIN_MAX);
    else if (t.id === 'champ-game-label') f.game_label = t.value.slice(0, MAIN_MAX);
    else if (t.id === 'champ-flavor') f.flavor = t.value.slice(0, FLAVOR_MAX);
    else if (t.id === 'champ-ins') f.inscription = t.value.slice(0, INS_MAX);
    else return;
    updatePreview();
  });
  d.addEventListener('change', (e) => {
    const t = e.target, f = C.form;
    if (t.id === 'champ-file') { if (t.files?.[0]) pickFile(t.files[0]); return; }
    if (t.name === 'champ-source') { setSource(t.value); return; }
    if (t.name === 'champ-game') { f.game = t.value; render(`[name="champ-game"][value="${t.value}"]`); return; }
    if (t.name === 'champ-word') f.title = t.value;
    else if (t.name === 'champ-emblem') f.emblem = t.value;
    else if (t.name === 'champ-color') f.color = t.value;
    else if (t.name === 'champ-pattern') f.pattern = t.value;
    else return;
    updatePreview();
  });
  d.addEventListener('submit', (e) => { e.preventDefault(); if (C.step < 3) go(C.step + 1); else submit(); });
  d.addEventListener('close', () => { C.ctx?.onClose?.(); });
  C.dlg = d;
  return d;
}

/**
 * Ouvre la fenêtre « Ma carte Champion ».
 * @param {{ onClose?: () => void }} [ctx] onClose : rendu du focus au bouton d'origine
 * @returns {Promise<void>}
 */
export async function openChampion(ctx = {}) {
  C.ctx = ctx;
  C.step = 1;
  const d = ensureDialog();
  C.me = null;
  render();
  if (!d.open) d.showModal();
  try {
    await load();
    await document.fonts?.load?.('18px "Archivo Black"');
    render('#champ-title');
  } catch (e) {
    const body = d.querySelector('.champ-body');
    const msg = e?.code === 'PGRST202' ? 'Les cartes Champions arrivent bientôt.' : errMsg(e);
    if (body) body.innerHTML = `<h2 id="champ-title" class="champ-title">Ma carte Champion</h2><p class="empty">${esc(msg)}</p>`;
  }
}
