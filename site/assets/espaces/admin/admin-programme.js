// ===== Humane Gang — administration : La Fête foraine › Jeux › Programmation (migrations 183 et 184, route fete/programmation) =====
// Rôle : voir et programmer les jeux du jour au même endroit. En haut, une ligne par jeu à date (jusqu'où il est programmé,
// jours vides sur 14 jours, alerte sous 7 jours d'avance, bouton qui ouvre son premier jour vide, lien vers son écran complet).
// Au milieu, le calendrier du mois : une pastille par jeu à date ; un clic ouvre le détail du jour : ce qui est prévu pour
// chaque jeu, et les actions permises (programmer, remplacer, retirer, annuler). En bas, la réserve des jeux automatiques
// (alerte sous 14 jours) et les jeux générés, qui n'ont rien à programmer.
// Écritures : les RPC d'origine de chaque jeu, qui gardent leurs règles et leurs droits (hg_sutom_program, hg_heardle_round_save,
// hg_framed_round_save, hg_quiz_daily_plan). Listes de choix : les lectures et filtres des écrans d'origine (admin-jeux-medias.js,
// admin-quiz-jour.js). regle() n'évite que des boutons voués au refus : le serveur reste seul juge.
// GeoGuessr : hg_geo_programme (migration 184) donne un jour à une photo de la réserve et rend l'ancienne en une transaction ;
// il reçoit la manche affichée et refuse si le jour a changé. hg_geo_reserve lit la réserve ; hg_geo_active désactive ou réactive,
// sans réécrire les autres champs.
// Après une écriture ou un refus, tout est relu : lignes, grille, détail, listes de choix. Un refus garde le formulaire et sa saisie.
// « Masquer les réponses » (pour un admin qui joue) retire le contenu du DOM. Ce choix vit dans une variable : il disparaît au
// rechargement de la page.
// Droits : les RPC ne renvoient que les jeux permis (admin/perms.js montre la sous-section avec « souvenirs » ou « quiz »).
// Données : hg_jeux_programme(p_from, p_days), 92 jours au plus : un appel pour les 92 jours à venir (lignes du haut), un autre
// pour la grille du mois ; hg_jeux_programme_jour(p_day) : le contenu du jour ouvert. Les réponses tardives sont ignorées : P.seq pour
// les périodes, P.seqDet pour le détail, P.gen pour les listes de choix.
// Styles : admin-programme.css (reprend .pl-nav, .pl-card… de admin-planning.css).
// Dépendances : core.js, ui-confirm.js, irl/photos.js (signedUrl), admin-jeux-medias.js, admin-quiz-jour.js.
// Exporte : programmeSub ({ main, open }), branché par admin.js sur « fete/programmation ».
import { sb, esc, errMsg, toast } from '../../commun/core.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { signedUrl } from '../irl/photos.js';
import { filmsLibres, morceauxLibres, urlEcoute, urlsImages } from './admin-jeux-medias.js';
import { questionsProgrammables, libelleQuestion } from './admin-quiz-jour.js';

/* ---------- Constantes ---------- */
const TZ = 'Europe/Zurich';
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HORIZON = 92;      // jours à venir lus pour les lignes du haut (le maximum de la RPC)
const AVANCE_MIN = 7;    // alerte sous ce nombre de jours d'avance
const RESERVE_MIN = 14;  // alerte des jeux automatiques sous ce nombre de jours de réserve
const FENETRE = 14;      // jours comptés pour « jours vides »
const VIE_URL = 9 * 60 * 1000; // durée d'usage d'une image signée : 10 minutes côté stockage, une minute de marge
/** Lettre de chaque jeu à date dans les pastilles. */
const LETTRE = { sutom: 'S', heardle: 'H', framed: 'F', geo: 'G', quiz: 'Q' };
/** Statuts d'une pastille, dans l'ordre de la légende. */
const STATUTS = { programme: 'Programmé', auto: 'Automatique', vide: 'Vide', annule: 'Annulé' };

/* ---------- Dates (jours civils à l'heure suisse) ---------- */
const clefJour = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
/** Jour civil « AAAA-MM-JJ » → Date UTC à midi (arithmétique des jours sans fuseau). */
const versUtc = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const ajoute = (k, n) => { const u = versUtc(k); u.setUTCDate(u.getUTCDate() + n); return u.toISOString().slice(0, 10); };
const lundiDe = (k) => ajoute(k, -((versUtc(k).getUTCDay() + 6) % 7));
const ecart = (a, b) => Math.round((versUtc(b) - versUtc(a)) / 864e5);
const fmtMois = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtLong = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const fmtCourt = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const maj = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/* ---------- État ---------- */
// today : jour renvoyé par la base ; jeux : réponse la plus récente ; prog : cle → (jour → entrée), fusion des périodes lues ;
// mois : premier jour du mois demandé ; affiche : celui dont la grille est à l'écran ; sel : jour ouvert ; det : contenu du jour
// ouvert ({ day, data, urls, expire } ou { day, erreur }) ; form : clé du jeu dont le formulaire est ouvert ; err : dernier message
// d'erreur ({ cle, msg }) ; choix : listes de choix lues (clé → options) ; gen : numéro de ces listes ; occupe : une écriture en cours ;
// masque : réponses masquées (jamais enregistré) ; seq et seqDet : numéros de la dernière lecture demandée.
const P = { root: null, today: '', jeux: null, prog: new Map(), mois: '', affiche: '', sel: null, det: null, form: null, err: null, choix: {}, gen: 0, occupe: false, masque: false, seq: 0, seqDet: 0 };

const aDate = () => P.jeux.filter((j) => j.mode === 'date');

/** Première et dernière case de la grille du mois affiché. */
function grille() {
  const [y, m] = P.mois.split('-').map(Number);
  const dernier = new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
  return { first: lundiDe(P.mois), last: ajoute(lundiDe(dernier), 6) };
}

/** Lit une période, sans rien changer : la réponse n'entre dans l'état que si elle est encore attendue (fusionne). */
async function lire(from, jours) {
  const { data, error } = await sb.rpc('hg_jeux_programme', { p_from: from, p_days: jours });
  if (error) throw error;
  return data;
}

/** Remplace ce qu'on savait d'une période (un jour retiré entre-temps disparaît). */
function fusionne(from, jours, data) {
  const to = ajoute(from, jours - 1);
  for (const j of data?.jeux || []) {
    if (!P.prog.has(j.cle)) P.prog.set(j.cle, new Map());
    const m = P.prog.get(j.cle);
    for (const k of [...m.keys()]) if (k >= from && k <= to) m.delete(k);
    for (const d of j.jours || []) m.set(d.day, d);
  }
}

/**
 * Lit les 92 jours à venir (avec `tout`) et la grille du mois demandé, puis dessine.
 * @param {boolean} tout Vrai à chaque visite ; faux quand on change seulement de mois.
 * @returns {Promise<boolean>} Vrai si le mois est affiché. Sinon l'écran reste sur le mois d'avant, ou la lecture a été dépassée.
 */
async function charge(tout) {
  const seq = ++P.seq;
  if (!P.mois) P.mois = `${clefJour.format(Date.now()).slice(0, 8)}01`;
  const { first, last } = grille();
  const nb = ecart(first, last) + 1;
  const auj = clefJour.format(Date.now());
  try {
    const [haut, mois] = await Promise.all([tout ? lire(auj, HORIZON) : null, lire(first, nb)]);
    if (seq !== P.seq) return false;
    if (haut) { fusionne(auj, HORIZON, haut); P.today = haut.today; P.jeux = haut.jeux || []; }
    fusionne(first, nb, mois);
    P.sel ??= P.today;
    P.affiche = P.mois;
    if (tout) dessine(); else repeintCalendrier();
    if (aDate().length && (tout || P.det?.day !== P.sel)) chargeDetail();
    return true;
  } catch (e) {
    if (seq !== P.seq) return false;
    if (!tout && P.jeux) { P.mois = P.affiche; toast(`Mois indisponible : ${errMsg(e)}`, 'error'); return false; }
    P.root.innerHTML = `<div class="empty">Programmation indisponible : ${esc(errMsg(e))}</div>`;
    return false;
  }
}

/* ---------- Lignes du haut ---------- */
/** Statut d'un jeu un jour donné : celui de sa ligne, ou « vide ». */
const statutDe = (cle, k) => P.prog.get(cle)?.get(k)?.statut || 'vide';
/** Un jour couvert a une manche prête (annulée : non). */
const couvert = (cle, k) => ['programme', 'auto'].includes(statutDe(cle, k));

/** Dernier jour d'affilée couvert depuis aujourd'hui, ou null. Aujourd'hui vide est sauté : le tirage peut ne pas avoir eu lieu. */
function jusquAu(cle) {
  const fin = ajoute(P.today, HORIZON - 1);
  let k = couvert(cle, P.today) ? P.today : ajoute(P.today, 1);
  if (!couvert(cle, k)) return null;
  while (k < fin && couvert(cle, ajoute(k, 1))) k = ajoute(k, 1);
  return k;
}
/** Prochain jour couvert après aujourd'hui, ou null. */
function prochain(cle) {
  for (let i = 1; i < HORIZON; i++) if (couvert(cle, ajoute(P.today, i))) return ajoute(P.today, i);
  return null;
}
/** Jours vides (ou annulés) parmi les 14 prochains, aujourd'hui compris. */
function vides(cle) {
  let n = 0;
  for (let i = 0; i < FENETRE; i++) if (!couvert(cle, ajoute(P.today, i))) n++;
  return n;
}

/** Une ligne de jeu à date. */
function ligneJeu(j) {
  const fin = jusquAu(j.cle);
  const suite = fin ? null : prochain(j.cle);
  const etat = fin ? `Programmé jusqu’au ${fmtCourt.format(versUtc(fin))}`
    : suite ? `Rien de prévu avant le ${fmtCourt.format(versUtc(suite))}` : 'Rien de prévu';
  const nb = vides(j.cle);
  const alerte = !fin || ecart(P.today, fin) < AVANCE_MIN;
  const filet = j.filet
    ? `Sinon, tirage automatique : ${pluriel(j.reserve ?? 0, 'élément inédit', 'éléments inédits')} en réserve`
    : `Sans manche, pas de partie ce jour-là : ${pluriel(j.reserve ?? 0, 'élément disponible', 'éléments disponibles')}`;
  return `<li class="pg-row${alerte ? ' is-alerte' : ''}" data-jeu="${esc(j.cle)}">
    <span class="pg-rowl" aria-hidden="true">${esc(LETTRE[j.cle] || '?')}</span>
    <div class="pg-rowt"><h4 class="pg-rown">${esc(j.titre)}</h4>
      <p class="pg-rows">${esc(etat)} · ${esc(pluriel(nb, 'jour vide', 'jours vides'))} sur ${FENETRE}</p>
      <p class="small muted pg-rowf">${esc(filet)}</p>
      ${alerte ? `<p class="pg-alerte"><span aria-hidden="true">△</span> Moins de ${AVANCE_MIN} jours d’avance</p>` : ''}</div>
    <div class="pg-rowb"><button type="button" class="btn btn-ghost btn-sm" data-pg="ligne" data-cle="${esc(j.cle)}" aria-label="Programmer ${esc(j.titre)} : premier jour vide">Programmer</button>
      <a class="small pg-lien" href="#${esc(j.route)}" aria-label="Écran complet : ${esc(j.titre)}">Écran complet</a></div>
  </li>`;
}

/* ---------- Calendrier ---------- */
/** Pastille d'un jeu sur un jour. */
function pastille(j, k) {
  const s = statutDe(j.cle, k);
  return `<span class="pg-p pg-p-${s}">${esc(LETTRE[j.cle] || '?')}</span>`;
}

/** Case d'un jour. */
function caseJour(k, jeux) {
  const u = versUtc(k);
  const auj = k === P.today;
  const hors = k.slice(0, 7) !== P.mois.slice(0, 7);
  const etats = jeux.map((j) => `${j.titre} : ${STATUTS[statutDe(j.cle, k)].toLowerCase()}`).join(', ');
  return `<li><button type="button" class="pg-day${auj ? ' is-today' : ''}${hors ? ' is-out' : ''}${P.sel === k ? ' is-sel' : ''}" data-pg="jour" data-day="${k}"
    aria-pressed="${P.sel === k}"${auj ? ' aria-current="date"' : ''} aria-label="${esc(`${maj(fmtLong.format(u))}${auj ? ' (aujourd’hui)' : ''}. ${etats}`)}">
    <span class="pg-num">${u.getUTCDate()}</span>
    <span class="pg-ps" aria-hidden="true">${jeux.map((j) => pastille(j, k)).join('')}</span></button></li>`;
}

/** Grille du mois. */
function calendrier() {
  const jeux = aDate();
  const { first, last } = grille();
  const cases = [];
  for (let k = first; k <= last; k = ajoute(k, 1)) cases.push(caseJour(k, jeux));
  return `<div class="pg-grid">
    <div class="pg-dow" aria-hidden="true">${JOURS.map((d) => `<span>${d}</span>`).join('')}</div>
    <ol class="pg-days" aria-label="Jours du mois">${cases.join('')}</ol></div>`;
}

/** Légende : les lettres des jeux, puis les quatre statuts (forme et couleur). */
function legende() {
  return `<div class="pg-legend">
    <ul class="pg-leg" aria-label="Lettres des jeux">${aDate().map((j) => `<li><b>${esc(LETTRE[j.cle] || '?')}</b> ${esc(j.titre)}</li>`).join('')}</ul>
    <ul class="pg-leg" aria-label="États d’un jour">${Object.entries(STATUTS).map(([s, l]) => `<li><span class="pg-p pg-p-${s}" aria-hidden="true">A</span> ${esc(l)}</li>`).join('')}</ul>
  </div>`;
}

/** Ce que dit le détail d'un jour pour un jeu sans ligne. */
function texteVide(j, k) {
  const auj = courant(j);
  if (k < auj) return 'Pas de manche';
  if (j.filet) return k === auj ? 'Tirage au premier passage du jour' : 'Tirage automatique le jour même';
  return 'Rien de prévu : pas de manche';
}

/** Jour en cours d'un jeu : GeoGuessr et la Question du jour changent à 6 h. */
const courant = (j) => P.det?.data?.courants?.[j.cle] || j.jour_courant || P.today;
/** Contenu du jeu `cle` sur le jour ouvert, ou null. */
const contenuDe = (cle) => P.det?.data?.jeux?.[cle] || null;
const compteur = (n, un, plusieurs) => (n ? pluriel(n, un, plusieurs) : '');

/**
 * Ce qui reste possible pour un jeu un jour donné, d'après les règles des écrans d'origine.
 * @returns {{libre: boolean, retirer: boolean, raison: string, annule: string|null}} libre : programmer ou remplacer ; retirer : vider
 *   le jour ; annule : action encore possible sur une manche figée (« annuler », « desactiver » ou « reactiver »).
 */
function regle(j, k, x) {
  const auj = courant(j);
  const passe = k < auj;
  const heardle = j.cle === 'heardle';
  const annule = passe || !x ? null : heardle ? (x.cancelled ? null : 'annuler') : j.cle === 'geo' ? (x.active ? 'desactiver' : 'reactiver') : null;
  const fige = (raison) => ({ libre: false, retirer: false, raison, annule });
  if (passe) return fige('Jour passé.');
  if (j.cle === 'sutom' && k === auj) return fige('Le mot du jour ne change plus.');
  if (j.cle === 'quiz' && k === auj && x?.vus) return fige('Déjà vue par des membres : elle ne change plus.');
  if (x?.joueurs || x?.tentatives) return fige('Déjà jouée : la manche ne change plus.');
  if (heardle && k === auj && x) return fige(x.cancelled ? '' : 'Manche du jour : on peut seulement l’annuler.');
  return { libre: true, retirer: !(heardle && x?.cancelled), raison: '', annule };
}

/** Contenu réel d'un jeu, par type de jeu. Rien n'entre dans la page si les réponses sont masquées. */
function contenu(j) {
  const x = contenuDe(j.cle);
  const titre = P.prog.get(j.cle)?.get(P.sel)?.titre;
  if (!x && !titre) return '';
  if (P.masque) return '<span class="small muted">Réponse masquée</span>';
  if (!x) return `<p>${esc(titre)}</p>`;
  const urls = P.det.urls;
  if (j.cle === 'sutom') return `<p><strong>${esc(x.word)}</strong></p>${x.definition ? `<p class="small muted">${esc(x.definition)}</p>` : ''}`;
  if (j.cle === 'heardle') {
    return `<p><strong>${esc(x.artist)} — ${esc(x.title)}</strong></p>
      <p class="small muted">Départ à ${esc(String(x.start_s ?? 0))} s · <a href="${esc(urlEcoute(x))}" target="_blank" rel="noopener">Écouter l’extrait</a></p>`;
  }
  if (j.cle === 'framed') {
    const imgs = (x.frames || []).map((p, i) => (urls[p] ? `<img src="${esc(urls[p])}" alt="Image ${i + 1}" loading="lazy">` : '')).join('');
    return `<p><strong>${esc(x.title)}</strong>${x.year ? ` (${esc(String(x.year))})` : ''}</p>${imgs ? `<div class="pg-imgs">${imgs}</div>` : ''}`;
  }
  if (j.cle === 'geo') {
    const u = urls[x.image_path];
    return `<p><strong>${esc(x.label)}</strong></p>${x.event_title ? `<p class="small muted">${esc(x.event_title)}</p>` : ''}
      ${u ? `<img class="pg-geo" src="${esc(u)}" alt="Photo de la manche" loading="lazy">` : ''}`;
  }
  const bonnes = new Set(x.bonnes || []);
  const options = Array.isArray(x.options) && x.options.length && x.bonnes
    ? `<ul class="pg-opts">${x.options.map((o) => (bonnes.has(String(o.id))
      ? `<li class="is-bonne"><span aria-hidden="true">✓</span> <strong>${esc(o.text ?? o.id)}</strong> <span class="visually-hidden">(bonne réponse)</span></li>`
      : `<li><span aria-hidden="true">·</span> ${esc(o.text ?? o.id)}</li>`)).join('')}</ul>`
    : x.solution ? `<p class="small">Réponse : <strong>${esc(x.solution)}</strong></p>` : '';
  return `<p><strong>${esc(x.prompt)}</strong></p>${options}${x.explanation ? `<p class="small muted">${esc(x.explanation)}</p>` : ''}`;
}

/** Formulaire « Programmer » d'un jeu. */
function formulaire(j) {
  const id = `pg-f-${j.cle}`;
  const c = P.choix[j.cle];
  const pied = (ok) => `<div class="btn-row"><button type="submit" class="btn btn-primary btn-sm"${ok ? '' : ' disabled'}>Enregistrer</button>
    <button type="button" class="btn btn-ghost btn-sm" data-pg="fermer" data-cle="${esc(j.cle)}">Fermer</button></div>`;
  if (!c) return '<p class="small muted">Chargement des choix…</p>';
  if (j.cle === 'sutom') {
    return `<form class="pg-form" data-pg-form="sutom" novalidate>
      <div class="field"><label for="${id}">Mot (5 à 9 lettres)</label><input class="input" id="${id}" name="mot" maxlength="9" autocomplete="off" list="${id}-l" required>
        <datalist id="${id}-l">${c.map((o) => `<option value="${esc(o.v)}"></option>`).join('')}</datalist></div>
      <div class="field"><label for="${id}-d">Définition (facultative : celle de la banque sinon)</label><input class="input" id="${id}-d" name="def" maxlength="300"></div>
      ${pied(true)}</form>`;
  }
  const nom = { heardle: 'Morceau validé', framed: 'Film ou affiche', geo: 'Photo de la réserve', quiz: 'Question' }[j.cle];
  const vide = { heardle: 'Aucun morceau libre', framed: 'Aucun élément prêt (3 images au moins)', geo: 'Aucune photo en réserve', quiz: 'Aucune question disponible' }[j.cle];
  return `<form class="pg-form" data-pg-form="${esc(j.cle)}" novalidate>
    <div class="field"><label for="${id}">${esc(nom)}</label><select class="input" id="${id}" name="choix" required>
      <option value="">${esc(c.length ? 'Choisir…' : vide)}</option>${c.map((o) => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}</select></div>
    ${pied(c.length > 0)}</form>`;
}

/** Boutons d'un jeu, ou la raison de leur absence. */
function actions(j) {
  const k = P.sel;
  const x = contenuDe(j.cle);
  if (P.form === j.cle) return formulaire(j);
  if (!P.det || P.det.erreur) return '';
  const r = regle(j, k, x);
  const cle = `data-cle="${esc(j.cle)}"`;
  const nom = esc(j.titre);
  const b = [];
  if (r.libre) {
    b.push(`<button type="button" class="btn btn-ghost btn-sm" data-pg="programmer" ${cle} aria-label="${x ? 'Remplacer' : 'Programmer'} : ${nom}">${x ? 'Remplacer' : 'Programmer'}</button>`);
    if (x && r.retirer) b.push(`<button type="button" class="btn btn-ghost btn-sm" data-pg="retirer" ${cle} aria-label="Retirer : ${nom}">Retirer</button>`);
  }
  if (r.annule === 'annuler') b.push(`<button type="button" class="btn btn-ghost btn-sm" data-pg="annuler" ${cle} aria-label="Annuler la manche : ${nom}">Annuler la manche</button>`);
  if (r.annule === 'desactiver') b.push(`<button type="button" class="btn btn-ghost btn-sm" data-pg="desactiver" ${cle} aria-label="Désactiver : ${nom}">Désactiver</button>`);
  if (r.annule === 'reactiver') b.push(`<button type="button" class="btn btn-ghost btn-sm" data-pg="reactiver" ${cle} aria-label="Réactiver : ${nom}">Réactiver</button>`);
  const raison = r.raison && (x || k >= courant(j)) ? `<p class="small muted">${esc(r.raison)}</p>` : '';
  return `${raison}${b.length ? `<div class="btn-row pg-acts${b.length === 1 ? ' is-un' : ''}">${b.join('')}</div>` : ''}`;
}

/** Bloc d'un jeu dans le détail du jour. */
function blocJeu(j) {
  const k = P.sel;
  const d = P.prog.get(j.cle)?.get(k);
  const x = contenuDe(j.cle);
  const s = d?.statut || 'vide';
  const auteur = x?.par || d?.par;
  const info = !d ? texteVide(j, k)
    : s === 'auto' ? 'Tirage automatique' : s === 'annule' ? 'Manche annulée'
      : j.cle === 'geo' ? (x?.auteur ? `Manche créée par ${x.auteur}` : '') : auteur ? `Programmé par ${auteur}` : '';
  const nb = compteur(x?.joueurs ?? x?.tentatives ?? x?.vus ?? 0, j.cle === 'quiz' ? 'membre l’a vue' : 'joueur', j.cle === 'quiz' ? 'membres l’ont vue' : 'joueurs');
  const ligne = [info, nb].filter(Boolean).join(' · ');
  const err = P.err?.cle === j.cle ? P.err.msg : '';
  return `<li id="pg-b-${esc(j.cle)}"><span class="pg-p pg-p-${s}" aria-hidden="true">${esc(LETTRE[j.cle] || '?')}</span>
    <div class="pg-dett"><p class="pg-deth"><b id="pg-t-${esc(j.cle)}" tabindex="-1">${esc(j.titre)}</b> <span class="small">${esc(STATUTS[s])}</span></p>
      ${ligne ? `<p class="small muted">${esc(ligne)}</p>` : ''}
      <div class="pg-cont" data-cle="${esc(j.cle)}">${contenu(j)}</div>
      <p class="form-error pg-err" id="pg-e-${esc(j.cle)}" role="alert"${err ? '' : ' hidden'}>${esc(err)}</p>
      ${actions(j)}</div></li>`;
}

/** Détail du jour choisi, jeu par jeu. */
function detail() {
  const k = P.sel;
  const etat = !P.det ? '<p class="small muted">Chargement du détail…</p>'
    : P.det.erreur ? `<p class="small">Détail indisponible : ${esc(P.det.erreur)}</p>` : '';
  return `<h3 class="pl-card-h" id="pg-detail-h">${esc(maj(fmtLong.format(versUtc(k))))}${k === P.today ? ' <span class="small muted">(aujourd’hui)</span>' : ''}</h3>
    ${etat}<ul class="pg-det">${aDate().map(blocJeu).join('')}</ul>`;
}

/* ---------- Jeux automatiques ---------- */
/** Une ligne de jeu automatique ou généré. */
function ligneAuto(j) {
  if (j.mode === 'genere') return `<li><b>${esc(j.titre)}</b> <span class="small muted">Rien à programmer</span></li>`;
  const n = j.reserve ?? 0;
  const bas = n < RESERVE_MIN;
  return `<li class="${bas ? 'is-alerte' : ''}"><b>${esc(j.titre)}</b> <span class="small">${esc(pluriel(n, 'jour', 'jours'))} de réserve <span class="muted">sur ${esc(String(j.reserve_totale ?? 0))}</span></span>
    ${bas ? `<span class="pg-alerte"><span aria-hidden="true">△</span> Moins de ${RESERVE_MIN} jours</span>` : ''}</li>`;
}

/* ---------- Dessin ---------- */
/** Dessine tout l'écran. */
function dessine() {
  if (!P.jeux.length) {
    P.root.innerHTML = '<div class="empty">Aucun jeu à programmer avec tes droits.</div>';
    return;
  }
  const dates = aDate();
  const reserves = P.jeux.filter((j) => j.mode === 'reserve');
  const generes = P.jeux.filter((j) => j.mode === 'genere');
  P.root.innerHTML = `<div class="pg">
    ${dates.length ? `<section class="pl-card" aria-labelledby="pg-h-dates">
      <h3 class="pl-card-h" id="pg-h-dates">Jeux à programmer</h3>
      <ul class="pg-rows-l">${dates.map(ligneJeu).join('')}</ul></section>
    <div class="pg-cal">
      <section class="pl-card" aria-labelledby="pg-mois">
        <div class="pg-bar">
          <div class="pl-nav">
            <button type="button" class="pl-navb" data-pg="prec" aria-label="Mois précédent"><span aria-hidden="true">‹</span></button>
            <h3 class="pl-title" id="pg-mois" aria-live="polite">${esc(maj(fmtMois.format(versUtc(P.mois))))}</h3>
            <button type="button" class="pl-navb" data-pg="suiv" aria-label="Mois suivant"><span aria-hidden="true">›</span></button>
            <button type="button" class="btn btn-ghost btn-sm" data-pg="auj">Aujourd’hui</button>
          </div>
          <label class="pg-voir"><input type="checkbox" data-pg="masque"${P.masque ? ' checked' : ''}> Masquer les réponses</label>
        </div>
        ${calendrier()}
        ${legende()}
      </section>
      <section class="pl-card" id="pg-detail" aria-labelledby="pg-detail-h">${detail()}</section>
    </div>` : ''}
    ${reserves.length || generes.length ? `<section class="pl-card" aria-labelledby="pg-h-auto">
      <h3 class="pl-card-h" id="pg-h-auto">Jeux automatiques</h3>
      <p class="small muted">Tirés le jour même dans leur réserve : rien à programmer. Une réserve compte les jours encore inédits. Épuisée, elle ressert les plus anciens ; l’Anagramme, lui, s’arrête.</p>
      ${reserves.length ? `<ul class="pg-autos">${reserves.map(ligneAuto).join('')}</ul>` : ''}
      ${generes.length ? `<ul class="pg-autos pg-gen">${generes.map(ligneAuto).join('')}</ul>` : ''}</section>` : ''}
  </div>`;
  marqueOccupe();
}

/** Titre et grille du mois demandé, puis le détail : le focus et les annonces des zones « aria-live » restent en place. */
function repeintCalendrier() {
  P.root.querySelector('#pg-mois').textContent = maj(fmtMois.format(versUtc(P.mois)));
  P.root.querySelector('.pg-grid').outerHTML = calendrier();
  peintDetail();
}

/* ---------- Détail : lecture et affichage ---------- */
/** Ce qui est saisi dans le formulaire ouvert, pour le retrouver après un repeint. */
function saisie() {
  const f = P.root.querySelector('[data-pg-form]');
  if (!f) return null;
  return { cle: f.dataset.pgForm, champs: Object.fromEntries(new FormData(f)), focus: f.contains(document.activeElement) ? document.activeElement.id : '' };
}

/** Remet la saisie ; un choix sorti de la liste revient à « Choisir… ». */
function rendSaisie(s) {
  const f = s && P.root.querySelector(`[data-pg-form="${s.cle}"]`);
  if (!f) return;
  for (const [nom, v] of Object.entries(s.champs)) {
    const el = f.elements[nom];
    if (!el) continue;
    el.value = v;
    if (el.selectedIndex < 0) el.value = '';
  }
  if (s.focus) document.getElementById(s.focus)?.focus();
}

/** Bloque les boutons pendant une écriture. Ceux qu'une autre raison désactive restent désactivés après. */
function marqueOccupe() {
  for (const b of P.root.querySelectorAll('button[data-pg], .pg-form button')) {
    if (P.occupe && !b.disabled) { b.disabled = true; b.dataset.occ = '1'; }
    else if (!P.occupe && b.dataset.occ) { b.disabled = false; delete b.dataset.occ; }
  }
}

/** Redessine le détail du jour, formulaire et saisie compris. */
function peintDetail() {
  const zone = P.root.querySelector('#pg-detail');
  if (!zone) return;
  const s = saisie();
  zone.innerHTML = detail();
  rendSaisie(s);
  marqueOccupe();
  resigne();
}

/** Redessine le bloc d'un seul jeu. */
function peintBloc(cle) {
  const j = aDate().find((x) => x.cle === cle);
  const li = P.root.querySelector(`#pg-b-${cle}`);
  if (j && li) li.outerHTML = blocJeu(j);
  marqueOccupe();
  resigne();
}

/** Signe les images d'un jour. */
async function signe(jeux) {
  const urls = {};
  for (const r of await urlsImages(jeux.framed?.frames || [])) if (r.signedUrl) urls[r.path] = r.signedUrl;
  if (jeux.geo?.image_path) urls[jeux.geo.image_path] = await signedUrl(jeux.geo.image_path);
  return urls;
}

/** Au repeint, resigne les images expirées. Sans réponse du stockage, rien ne change et le prochain repeint réessaie. */
async function resigne() {
  const d = P.det;
  if (P.masque || !d?.urls || d.resigne || Date.now() < d.expire) return;
  d.resigne = true;
  let urls = {};
  try { urls = await signe(d.data?.jeux || {}); } catch { /* images laissées telles quelles */ }
  d.resigne = false;
  if (!Object.values(urls).some(Boolean)) return;
  d.urls = urls;
  d.expire = Date.now() + VIE_URL;
  if (P.det === d) peintDetail();
}

/** Lit le contenu du jour ouvert et signe ses images. Seule la dernière lecture demandée compte. Un formulaire qui n'a plus lieu d'être se ferme. */
async function chargeDetail() {
  const k = P.sel;
  const n = ++P.seqDet;
  let det;
  try {
    const { data, error } = await sb.rpc('hg_jeux_programme_jour', { p_day: k });
    if (error) throw error;
    det = { day: k, data, urls: await signe(data?.jeux || {}), expire: Date.now() + VIE_URL };
  } catch (e) { det = { day: k, erreur: errMsg(e) }; }
  if (n !== P.seqDet) return;
  P.det = det;
  const j = aDate().find((x) => x.cle === P.form);
  if (j && (det.erreur || !regle(j, k, contenuDe(j.cle)).libre)) P.form = null;
  peintDetail();
}

/** Ouvre le jour k dans le détail. */
async function choisitJour(k) {
  P.sel = k;
  P.form = null;
  P.det = null;
  P.err = null;
  for (const x of P.root.querySelectorAll('[data-pg="jour"]')) {
    const on = x.dataset.day === k;
    x.classList.toggle('is-sel', on);
    x.setAttribute('aria-pressed', String(on));
  }
  peintDetail();
  await chargeDetail();
}

/* ---------- Programmer : listes de choix ---------- */
/** Options d'un jeu, avec les filtres de son écran d'origine ({ v: valeur, l: libellé }). */
async function lisChoix(cle) {
  const lis = async (fn) => { const { data, error } = await sb.rpc(fn); if (error) throw error; return data; };
  if (cle === 'sutom') return ((await lis('hg_sutom_admin'))?.bank || []).filter((b) => b.active).map((b) => ({ v: b.word, l: b.word }));
  if (cle === 'heardle') return morceauxLibres(await lis('hg_heardle_admin')).map((t) => ({ v: t.id, l: `${t.artist} — ${t.title}` }));
  if (cle === 'framed') return filmsLibres(await lis('hg_framed_admin')).map((f) => ({ v: f.id, l: f.title }));
  if (cle === 'geo') return ((await lis('hg_geo_reserve')) || []).map((r) => ({ v: r.id, l: r.event_title ? `${r.label} (${r.event_title})` : r.label }));
  return (await questionsProgrammables()).map((q) => ({ v: q.id, l: libelleQuestion(q) }));
}

/** Ouvre le formulaire d'un jeu, dans le jour ouvert. Une liste lue avant une écriture n'entre pas dans le cache (P.gen). */
async function ouvreFormulaire(cle) {
  effaceErreur();
  const avant = P.form;
  P.form = cle;
  if (avant && avant !== cle) peintBloc(avant);
  peintBloc(cle);
  P.root.querySelector(`#pg-b-${cle}`)?.scrollIntoView?.({ block: 'nearest' });
  if (!P.choix[cle]) {
    const k = P.sel;
    const gen = P.gen;
    let liste;
    try { liste = await lisChoix(cle); }
    catch (e) { if (gen === P.gen && P.form === cle) { P.form = null; peintBloc(cle); montreErreur(cle, `Choix indisponibles : ${errMsg(e)}`); } return; }
    if (gen !== P.gen) return;
    P.choix[cle] = liste;
    if (P.form !== cle || P.sel !== k) return;
    peintBloc(cle);
  }
  P.root.querySelector(`#pg-f-${cle}`)?.focus();
}

/** Premier jour vide d'un jeu qu'on peut encore programmer, parmi les 92 à venir, ou null. */
function premierVide(j) {
  const debut = j.cle === 'sutom' ? ajoute(courant(j), 1) : courant(j);
  for (let i = 0; i < HORIZON; i++) { const k = ajoute(debut, i); if (statutDe(j.cle, k) === 'vide') return k; }
  return null;
}

/** Bouton « Programmer » d'une ligne : va au premier jour vide du jeu et ouvre son formulaire, si rien n'a bougé entre-temps. */
async function vaAuVide(cle) {
  const j = aDate().find((x) => x.cle === cle);
  const k = j && premierVide(j);
  if (!k) { toast('Aucun jour vide sur les 92 prochains jours.', 'ok'); return; }
  const depart = P.sel;
  const mois = `${k.slice(0, 8)}01`;
  if (mois !== P.mois) {
    P.mois = mois;
    if (!(await charge(false))) return; // mois indisponible : charge l'a dit
  }
  if (P.sel !== depart) return; // un autre jour a été ouvert entre-temps
  await choisitJour(k);
  if (P.sel !== k || P.det?.day !== k || P.det.erreur) return;
  const x = contenuDe(cle);
  if (x || !regle(j, k, x).libre) { toast('Ce jour n’est plus libre : regarde son détail.', 'error'); return; }
  await ouvreFormulaire(cle);
}

/* ---------- Programmer : écritures ---------- */
/** Appelle une RPC d'écriture ; un refus devient une exception, avec le message du serveur. */
async function ecris(fn, args) {
  const { error } = await sb.rpc(fn, args);
  if (error) throw error;
}

/** Message du serveur (ou autre) dans le bloc du jeu, sans toucher au formulaire ouvert. */
function montreErreur(cle, msg) {
  P.err = { cle, msg };
  const el = P.root.querySelector(`#pg-e-${cle}`);
  if (!el) { toast(msg, 'error'); return; }
  el.textContent = msg;
  el.hidden = false;
}

function effaceErreur() {
  P.err = null;
  for (const el of P.root.querySelectorAll('.pg-err')) el.hidden = true;
}

/**
 * Relit ce qui dépend d'une écriture : listes de choix, lignes du haut, grille, détail.
 * @param {boolean} refus Vrai après un refus : le formulaire ouvert reste, avec sa saisie, sur une liste relue.
 */
async function actualise(refus) {
  const form = refus ? P.form : null;
  P.form = form;
  P.choix = form ? { [form]: P.choix[form] } : {}; // la liste du formulaire reste à l’écran le temps de la relire
  P.gen++;
  const seq = ++P.seq;
  const { first, last } = grille();
  const nb = ecart(first, last) + 1;
  try {
    const [haut, mois] = await Promise.all([lire(P.today, HORIZON), lire(first, nb)]);
    if (seq === P.seq) {
      fusionne(P.today, HORIZON, haut);
      fusionne(first, nb, mois);
      P.jeux = haut.jeux || P.jeux;
      P.affiche = P.mois;
      P.root.querySelector('.pg-rows-l').innerHTML = aDate().map(ligneJeu).join('');
      repeintCalendrier();
    }
  } catch (e) {
    if (seq === P.seq) P.mois = P.affiche;
    P.root.querySelector('#pg-mois').textContent = maj(fmtMois.format(versUtc(P.mois)));
    toast(`${refus ? 'Refusé' : 'Enregistré'}, mais la vue n’a pas pu être relue : ${errMsg(e)}`, 'error');
  }
  if (form) {
    try { P.choix[form] = await lisChoix(form); }
    catch { P.form = null; P.choix = {}; }
  }
  await chargeDetail();
}

/** Exécute une écriture : un envoi à la fois, boutons bloqués. Une erreur reste affichée dans le bloc du jeu, sur une vue relue. */
async function execute(cle, fn, ok) {
  if (P.occupe) { toast('Une écriture est en cours : attends sa fin.', 'error'); return; }
  P.occupe = true;
  effaceErreur();
  marqueOccupe();
  try {
    let refus = false;
    try { await fn(); toast(ok, 'ok'); }
    catch (e) { refus = true; montreErreur(cle, errMsg(e)); }
    await actualise(refus);
    (refus && P.root.querySelector(`#pg-f-${cle}`) || P.root.querySelector(`#pg-t-${cle}`))?.focus();
  } finally {
    P.occupe = false;
    marqueOccupe();
  }
}

/** Ce que devient l'ancienne photo GeoGuessr quand elle quitte son jour. */
const sortGeo = (x) => (x.active ? 'La photo repart dans la réserve.' : 'La manche désactivée quitte ce jour. Elle ne revient pas dans la réserve : réactive-la depuis l’écran GeoGuessr.');

/** Enregistre le formulaire d'un jeu. Un jour déjà pris demande confirmation (sans nommer le contenu, qui peut être masqué). */
async function enregistre(cle, form) {
  const k = P.sel;
  const j = aDate().find((y) => y.cle === cle);
  if (!j || P.det?.day !== k || P.det.erreur) return;
  const x = contenuDe(cle);
  const el = form.elements;
  const v = (el.choix ?? el.mot).value.trim();
  const def = el.def?.value || null;
  const btn = form.querySelector('[type="submit"]');
  if (!v) { montreErreur(cle, cle === 'sutom' ? 'Écris un mot.' : 'Choisis dans la liste.'); return; }
  if (x) {
    const suite = cle === 'geo' ? sortGeo(x) : 'La manche prévue ce jour-là sera remplacée.';
    const oui = await confirmBox(`Remplacer ${j.titre} du ${fmtCourt.format(versUtc(k))} ?`, suite, { ok: 'Remplacer', cancel: 'Garder', danger: true });
    if (!oui) { btn?.focus(); return; }
    if (P.sel !== k) return;
  }
  const faire = {
    sutom: () => ecris('hg_sutom_program', { p_day: k, p_word: v, p_definition: def }),
    heardle: () => ecris('hg_heardle_round_save', { p_day: k, p_track: v, p_cancel: false }),
    framed: () => ecris('hg_framed_round_save', { p_day: k, p_film: v }),
    geo: () => ecris('hg_geo_programme', { p_day: k, p_round: v, p_avant: x?.id ?? null }),
    quiz: () => ecris('hg_quiz_daily_plan', { p_day: k, p_question: v }),
  }[cle];
  return execute(cle, faire, x ? 'Remplacé.' : 'Programmé.');
}

/** Retirer, annuler, désactiver ou réactiver. Tout ce qui enlève quelque chose demande confirmation. */
async function agit(act, cle, btn) {
  const j = aDate().find((y) => y.cle === cle);
  const k = P.sel;
  const x = contenuDe(cle);
  if (!j || !x) return;
  const quand = fmtCourt.format(versUtc(k));
  const nb = x.joueurs || x.tentatives || 0;
  const deja = nb ? ` ${pluriel(nb, 'joueur l’a', 'joueurs l’ont')} déjà jouée.` : '';
  const sans = cle === 'geo' ? sortGeo(x) : j.filet ? 'Un tirage automatique prendra sa place.' : 'Il n’y aura pas de manche ce jour-là.';
  const q = {
    retirer: [`Retirer ${j.titre} du ${quand} ?`, sans, 'Retirer'],
    annuler: [`Annuler la manche ${j.titre} du ${quand} ?`, `Les membres n’y joueront plus.${deja}`, 'Annuler la manche'],
    desactiver: [`Désactiver la manche ${j.titre} du ${quand} ?`, `Les membres n’y joueront plus.${deja}`, 'Désactiver'],
  }[act];
  if (q && !(await confirmBox(q[0], q[1], { ok: q[2], cancel: 'Garder', danger: true }))) { btn.focus(); return; }
  if (P.sel !== k) return;
  const faire = {
    retirer: () => ({
      sutom: () => ecris('hg_sutom_program', { p_day: k, p_word: null, p_definition: null }),
      heardle: () => ecris('hg_heardle_round_save', { p_day: k, p_track: null, p_cancel: false }),
      framed: () => ecris('hg_framed_round_save', { p_day: k, p_film: null }),
      geo: () => ecris('hg_geo_programme', { p_day: k, p_round: null, p_avant: x.id }),
      quiz: () => ecris('hg_quiz_daily_plan', { p_day: k, p_question: null }),
    }[cle]()),
    annuler: () => ecris('hg_heardle_round_save', { p_day: k, p_track: null, p_cancel: true }),
    desactiver: () => ecris('hg_geo_active', { p_round: x.id, p_active: false }),
    reactiver: () => ecris('hg_geo_active', { p_round: x.id, p_active: true }),
  }[act];
  await execute(cle, faire, { retirer: 'Retiré.', annuler: 'Manche annulée.', desactiver: 'Manche désactivée.', reactiver: 'Manche réactivée.' }[act]);
}

/* ---------- Événements ---------- */
/** Clics de l'écran : mois, jour, programmation. */
function surClic(e) {
  const b = e.target.closest('[data-pg]');
  if (!b) return;
  const act = b.dataset.pg;
  const cle = b.dataset.cle;
  if (act === 'jour') { choisitJour(b.dataset.day); return; }
  if (act === 'ligne') { vaAuVide(cle); return; }
  if (act === 'programmer') { ouvreFormulaire(cle); return; }
  if (act === 'fermer') {
    P.form = null;
    P.err = null;
    peintBloc(cle);
    P.root.querySelector(`#pg-b-${cle} [data-pg="programmer"]`)?.focus();
    return;
  }
  if (['retirer', 'annuler', 'desactiver', 'reactiver'].includes(act)) { agit(act, cle, b); return; }
  if (act === 'auj') { versAujourdhui(); return; }
  if (act === 'prec' || act === 'suiv') {
    const u = versUtc(P.mois);
    u.setUTCMonth(u.getUTCMonth() + (act === 'suiv' ? 1 : -1));
    P.mois = u.toISOString().slice(0, 8) + '01';
    charge(false);
  }
}

/** Bouton « Aujourd'hui » : le jour ne change qu'une fois son mois lu, pour ne jamais écrire sur un jour qui n'est pas affiché. */
async function versAujourdhui() {
  const depart = P.sel;
  P.mois = `${P.today.slice(0, 8)}01`;
  if (await charge(false) && P.sel === depart && P.sel !== P.today) await choisitJour(P.today);
}

/** Envoi d'un formulaire « Programmer ». */
function surEnvoi(e) {
  const f = e.target.closest('[data-pg-form]');
  if (!f) return;
  e.preventDefault();
  enregistre(f.dataset.pgForm, f);
}

/** Case « Masquer les réponses » : seuls les contenus sont redessinés (un formulaire ouvert reste rempli). */
function surChangement(e) {
  if (e.target.dataset.pg !== 'masque') return;
  P.masque = e.target.checked;
  for (const x of P.root.querySelectorAll('.pg-cont')) x.innerHTML = contenu(aDate().find((j) => j.cle === x.dataset.cle));
  resigne();
}

/** Flèches dans la grille : le focus passe d'un jour à l'autre. */
function surTouche(e) {
  const pas = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  const b = e.target.closest?.('[data-pg="jour"]');
  if (!pas || !b) return;
  const cible = P.root.querySelector(`[data-pg="jour"][data-day="${ajoute(b.dataset.day, pas)}"]`);
  if (cible) { e.preventDefault(); cible.focus(); }
}

/* ---------- Fournisseur de la sous-section ---------- */
/** Monte l'écran (une fois) : écouteurs ; les données arrivent avec open. */
function main() {
  P.root = document.getElementById('programme-root');
  if (!P.root) return;
  P.root.addEventListener('click', surClic);
  P.root.addEventListener('change', surChangement);
  P.root.addEventListener('submit', surEnvoi);
  P.root.addEventListener('keydown', surTouche);
}

/** À chaque visite : relit tout, listes de choix comprises (on revient parfois de l'écran complet d'un jeu). */
function open() {
  P.form = null;
  P.err = null;
  P.det = null;
  P.choix = {};
  P.gen++;
  if (P.root) return charge(true);
}

/** Fournisseur de la sous-section La Fête foraine › Jeux › Programmation (admin/shell.js). */
export const programmeSub = { main, open };
