// ===== Humane Gang — challenge de la semaine : textes, phases, types de réponse et dates (partagé) =====
// Rôle : tout ce que la page du challenge, la carte de l'accueil et le panel affichent de la même façon : libellés des
// phases (hg_wch_phase), textes de chaque type de réponse (answer_type), dates en heure suisse, compte à rebours, gain.
// Module léger, sans Supabase : la carte de l'accueil le charge sans alourdir la page.
// Dépendances : core/util.js (esc). Exporte : PHASES, phasePill, TYPES, typeOf, nf, quand, jourCourt, dateCourte, dateLongue,
// semaineDu, jourHeure, dateAn, periode, resteParts, unitsHtml, rebours, tickRebours, gainTexte, pluriel, LIVE.
import { esc } from '../../commun/core/util.js';

/** Format des nombres (« 1 000 »), en français de Suisse. */
export const nf = new Intl.NumberFormat('fr-CH');

/** « 1 participation », « 2 participations » : nombre et nom accordé (pluriel en -s par défaut). */
export const pluriel = (n, un, plusieurs = `${un}s`) => `${nf.format(n)} ${Math.abs(n) > 1 ? plusieurs : un}`;

/* ---------- Phases (fonction hg_wch_phase de la base) ---------- */
/** Phase → [libellé de la pastille, classe CSS]. */
export const PHASES = {
  a_venir: ['À venir', 'pill-current'],
  participation: ['Participation ouverte', 'pill-ok'],
  vote: ['Vote en cours', 'pill-ok'],
  cloture: ['Dépouillement en cours', 'pill-current'],
  attente: ['Résultat bientôt', 'pill-current'],
  termine: ['Terminé', ''],
  sans_gagnant: ['Sans gagnant', 'pill-todo'],
  annule: ['Annulé', 'pill-todo'],
};
/** Phases où le challenge vit encore (compte à rebours, participation ou vote). */
export const LIVE = new Set(['a_venir', 'participation', 'vote']);
/** Pastille HTML d'une phase. */
export function phasePill(phase) {
  const [label, cls] = PHASES[phase] || [String(phase || ''), ''];
  return `<span class="pill${cls ? ` ${cls}` : ''}">${esc(label)}</span>`;
}

/* ---------- Types de réponse (answer_type) ---------- */
// label : nom court (listes, archives) ; attendu : pastille de la page ; nom / un / ton : mots des phrases ;
// choisir / changer : bouton du formulaire ; hint : formats sous le bouton ; refus : fin du message de type refusé.
export const TYPES = {
  image: { label: 'Image', attendu: 'Image attendue', nom: 'image', un: 'une image', ton: 'Ton image', autre: 'une autre image',
    choisir: 'Choisir une image', changer: 'Changer d’image',
    hint: 'JPG, PNG, WebP ou GIF · 25 Mo maximum. Les images sont compressées avant l’envoi.',
    refus: 'ce challenge attend une image (JPG, PNG, WebP ou GIF)', placeholder: 'Une phrase sur ton image' },
  video: { label: 'Vidéo', attendu: 'Vidéo attendue', nom: 'vidéo', un: 'une vidéo', ton: 'Ta vidéo', autre: 'une autre vidéo',
    choisir: 'Choisir une vidéo', changer: 'Changer de vidéo',
    hint: 'MP4, WebM ou MOV · 25 Mo maximum.',
    refus: 'ce challenge attend une vidéo (MP4, WebM ou MOV)', placeholder: 'Une phrase sur ta vidéo' },
  audio: { label: 'Audio', attendu: 'Audio attendu', nom: 'son', un: 'un son', ton: 'Ton son', autre: 'un autre son',
    choisir: 'Choisir un son', changer: 'Changer de son',
    hint: 'MP3, OGG, WAV ou M4A · 25 Mo maximum.',
    refus: 'ce challenge attend un son (MP3, OGG, WAV ou M4A)', placeholder: 'Une phrase sur ton son' },
  pdf: { label: 'Document (PDF)', attendu: 'PDF attendu', nom: 'document', un: 'un PDF', ton: 'Ton document', autre: 'un autre document',
    choisir: 'Choisir un PDF', changer: 'Changer de PDF',
    hint: 'PDF · 25 Mo maximum.',
    refus: 'ce challenge attend un document PDF', placeholder: 'Une phrase sur ton document' },
  texte: { label: 'Texte', attendu: 'Texte attendu', nom: 'texte', un: 'un texte', ton: 'Ton texte', autre: 'un autre texte',
    choisir: '', changer: '', hint: '2 000 caractères au plus.', refus: 'ce challenge attend un texte, pas de fichier', placeholder: 'Un titre pour ton texte' },
  tout: { label: 'Tout fichier', attendu: 'Tout fichier accepté', nom: 'fichier', un: 'un fichier', ton: 'Ton fichier', autre: 'un autre fichier',
    choisir: 'Choisir un fichier', changer: 'Changer de fichier',
    hint: 'Image, vidéo, son, PDF, document bureautique, texte ou ZIP · 25 Mo maximum. Les images sont compressées avant l’envoi.',
    refus: 'ce format n’est pas accepté (ni HTML ni SVG)', placeholder: 'Une phrase sur ton fichier' },
};
/** Textes d'un type de réponse (image par défaut si la valeur est inconnue). */
export const typeOf = (t) => TYPES[t] || TYPES.image;

/* ---------- Dates (toujours en heure suisse) ---------- */
const TZ = 'Europe/Zurich';
/** Morceaux d'une date en heure suisse (jour de semaine court, jour, mois long et court, année, heure). */
function parts(iso) {
  const d = new Date(iso);
  const get = (o) => Object.fromEntries(new Intl.DateTimeFormat('fr-CH', { timeZone: TZ, ...o }).formatToParts(d).map((p) => [p.type, p.value]));
  const a = get({ weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const b = get({ month: 'short' });
  return { wd: a.weekday, d: a.day, m: a.month, ms: b.month, y: a.year, hh: a.hour, mm: a.minute };
}
/** « lun. 9 novembre à 18:00 » */
export function quand(iso) { const p = parts(iso); return `${p.wd} ${p.d} ${p.m} à ${p.hh}:${p.mm}`; }
/** « lun. 9 nov. » */
export function jourCourt(iso) { const p = parts(iso); return `${p.wd} ${p.d} ${p.ms}`; }
/** « 9 nov. » */
export function dateCourte(iso) { const p = parts(iso); return `${p.d} ${p.ms}`; }
/** « 9 nov. 2026, 18:00 » (panel) */
export function dateLongue(iso) { const p = parts(iso); return `${p.d} ${p.ms} ${p.y}, ${p.hh}:${p.mm}`; }
/** « Semaine du 2 novembre » */
export function semaineDu(iso) { const p = parts(iso); return `Semaine du ${p.d} ${p.m}`; }
/** « lun. 2 nov. à 21:14 » */
export function jourHeure(iso) { const p = parts(iso); return `${p.wd} ${p.d} ${p.ms} à ${p.hh}:${p.mm}`; }
/** « 4 nov. 2026 » */
export function dateAn(iso) { const p = parts(iso); return `${p.d} ${p.ms} ${p.y}`; }
/** « lun. 2 → lun. 9 nov. » (mois répété seulement s'il change) */
export function periode(a, b) {
  const p = parts(a), q = parts(b);
  return p.ms === q.ms ? `${p.wd} ${p.d} → ${q.wd} ${q.d} ${q.ms}` : `${p.wd} ${p.d} ${p.ms} → ${q.wd} ${q.d} ${q.ms}`;
}

/* ---------- Compte à rebours ---------- */
/** Jours, heures et minutes restant avant iso (zéro si passé). */
export function resteParts(iso, now = Date.now()) {
  const ms = Math.max(0, new Date(iso) - now);
  const min = Math.floor(ms / 60000);
  return [Math.floor(min / 1440), Math.floor((min % 1440) / 60), min % 60];
}
/** Unité du compte à rebours (nombre sur deux chiffres et libellé). */
const unit = (n, l) => `<div class="cd-unit"><span class="cd-num">${String(n).padStart(2, '0')}</span><span class="cd-lbl">${l}</span></div>`;
/** Texte lu par les lecteurs d'écran : « 4 jours, 6 heures et 12 minutes ». */
const lu = ([d, h, m]) => `${pluriel(d, 'jour')}, ${pluriel(h, 'heure')} et ${pluriel(m, 'minute')}`;
/** Les trois unités (jours, h, min) pour la cible iso. */
export function unitsHtml(iso) {
  const [d, h, m] = resteParts(iso);
  return unit(d, d > 1 ? 'jours' : 'jour') + unit(h, 'h') + unit(m, 'min');
}
/**
 * Encadré du compte à rebours de la page : titre, unités (mises à jour par la page grâce à data-cd), date en heure suisse.
 * @param {string} titre ex. « Fin de la participation dans »
 * @param {string} iso instant visé
 */
export function rebours(titre, iso) {
  return `<div class="chl-cd">
    <p class="chl-cd-t">${esc(titre)}</p>
    <div class="cd-units" role="timer" data-cd="${esc(iso)}" aria-label="${esc(lu(resteParts(iso)))}">${unitsHtml(iso)}</div>
    <p class="small muted">${esc(quand(iso))} · heure suisse</p>
  </div>`;
}
/**
 * Met à jour tous les comptes à rebours (data-cd) d'une zone. Renvoie vrai si l'un d'eux est arrivé à zéro.
 * @param {ParentNode} root zone à parcourir
 */
export function tickRebours(root) {
  let fini = false;
  for (const el of root.querySelectorAll('[data-cd]')) {
    const iso = el.dataset.cd;
    if (new Date(iso) <= Date.now()) fini = true;
    el.innerHTML = unitsHtml(iso);
    const base = el.dataset.cdLabel ? `${el.dataset.cdLabel} ` : '';
    el.setAttribute('aria-label', `${base}${lu(resteParts(iso))}`);
  }
  return fini;
}

/* ---------- Gain ---------- */
/** « 500 Paillettes + un resto offert », ou seulement l'un des deux, ou '' sans gain. Texte brut (à échapper). */
export function gainTexte(c) {
  const pa = Number(c?.reward_paillettes) || 0;
  const lot = String(c?.reward_text || '').trim();
  return [pa > 0 ? `${nf.format(pa)} Paillettes` : '', lot].filter(Boolean).join(' + ');
}
