// ===== Humane Gang — ajout d'une sortie à l'agenda (fichier .ics, RFC 5545) =====
// Génération côté client, sans service ni compte externe. L'UID est stable (identifiant de la sortie) :
// réimporter le fichier met à jour l'événement au lieu de le dupliquer.
/*
 * Rôle : fabrique un fichier .ics (agenda) pour une sortie IRL et le télécharge. Le format suit la RFC 5545.
 * Page : /pages/irl/irl.html, /pages/irl/evenements.html et les pages qui proposent « Ajouter à mon agenda ».
 * Dépendances : reglages/valeurs-lot3.js (durée par défaut d'une sortie sans heure de fin).
 * Exporte : icsText, icsDate, buildIcs, icsFilename, downloadIcs, addToCalendar.
 */
import { dureeDefautMs } from '../../commun/reglages/valeurs-lot3.js';

/** Identifiant du produit, inscrit dans le fichier (PRODID, obligatoire en RFC 5545). */
const PRODID = '-//Humane Gang//Sorties//FR';

/** Valeur TEXT (RFC 5545 §3.3.11) : antislash, point-virgule, virgule et retour à la ligne sont échappés. */
export function icsText(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Date-heure UTC au format AAAAMMJJTHHMMSSZ. */
export function icsDate(d) {
  /** Deux chiffres : 3 devient « 03 ». */
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}

/**
 * Pliage des lignes à 75 octets (RFC 5545 §3.1) : une suite commence par une espace, et un caractère UTF-8 n'est jamais coupé.
 * La première ligne accepte 75 octets, les suivantes 74 (l'espace de tête compte pour le 75e).
 * @param {string} line Ligne à plier.
 * @returns {string} Lignes pliées, séparées par CRLF + espace.
 */
function fold(line) {
  const enc = new TextEncoder();
  const parts = [];
  let cur = '', len = 0, max = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > max) { parts.push(cur); cur = ''; len = 0; max = 74; }
    cur += ch; len += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/**
 * Contenu d'un fichier .ics ne contenant qu'un événement.
 * @param {{ id: string, title: string, start: string, end?: string|null, location?: string|null, description?: string|null, url?: string|null }} ev
 */
export function buildIcs(ev, now = new Date()) {
  const start = new Date(ev.start);
  // Fin absente ou invalide (sinon NaN dans le fichier) : on prend la durée par défaut.
  const endD = ev.end ? new Date(ev.end) : null;
  const end = endD && !Number.isNaN(endD.getTime()) ? endD : new Date(start.getTime() + dureeDefautMs());
  const desc = [ev.description, ev.url ? `Détails sur le site : ${ev.url}` : null].filter(Boolean).join('\n\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.id}@humane-gang`,
    `DTSTAMP:${icsDate(now)}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(ev.title)}`,
  ];
  if (ev.location) lines.push(`LOCATION:${icsText(ev.location)}`);
  if (desc) lines.push(`DESCRIPTION:${icsText(desc)}`);
  if (ev.url) lines.push(`URL:${ev.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Nom de fichier lisible et sans caractères spéciaux. */
export function icsFilename(title) {
  const slug = String(title || 'sortie').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'sortie';
  return `humane-gang-${slug}.ics`;
}

/**
 * Télécharge le fichier via un lien blob. L'URL temporaire est libérée une seconde plus tard,
 * le temps que le navigateur démarre le téléchargement.
 * @param {string} filename Nom proposé pour le fichier.
 * @param {string} content Contenu texte du fichier .ics.
 */
export function downloadIcs(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Raccourci : génère et télécharge l'événement, avec le lien de la page dans la description. */
export function addToCalendar(ev, pageUrl) {
  downloadIcs(icsFilename(ev.title), buildIcs({ ...ev, url: pageUrl }));
}
