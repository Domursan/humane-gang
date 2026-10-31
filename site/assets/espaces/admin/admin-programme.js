// ===== Humane Gang — administration : La Fête foraine › Jeux › Programmation (migration 183, route fete/programmation) =====
// Rôle : voir d'un coup d'œil ce qui est prévu pour les jeux du jour. En haut, une ligne par jeu à date (jusqu'où il est
// programmé, jours vides sur 14 jours, alerte sous 7 jours d'avance, bouton vers son écran). Au milieu, le calendrier du
// mois : une pastille par jeu à date sur chaque jour ; un clic montre le détail du jour. En bas, la réserve des jeux
// automatiques (alerte sous 14 jours) et les jeux générés, qui n'ont rien à programmer.
// Écran de lecture seule : on programme toujours dans l'écran de chaque jeu.
// Les réponses (mot, titre, question) n'entrent dans le DOM que si « Afficher les réponses » est cochée, car les admins
// jouent aussi : c'est une protection contre le coup d'œil, la RPC les envoie de toute façon à qui a le droit de les lire.
// Ce choix vit dans une variable : il disparaît au rechargement de la page.
// Droits : hg_jeux_programme ne renvoie que les jeux permis (admin/perms.js montre la sous-section avec « souvenirs » ou « quiz »).
// Données : RPC hg_jeux_programme(p_from, p_days), 92 jours au plus. Un appel couvre les 92 jours à venir (lignes du haut),
// un autre la grille du mois affiché. Styles : admin-programme.css (reprend .pl-nav, .pl-card… de admin-planning.css).
// Dépendances : core.js, admin/shell.js (navigate).
// Exporte : programmeSub ({ main, open }), branché par admin.js sur « fete/programmation ».
import { sb, esc, errMsg, toast } from '../../commun/core.js';
import { navigate } from './shell.js';

/* ---------- Constantes ---------- */
const TZ = 'Europe/Zurich';
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const HORIZON = 92;      // jours à venir lus pour les lignes du haut (le maximum de la RPC)
const AVANCE_MIN = 7;    // alerte sous ce nombre de jours d'avance
const RESERVE_MIN = 14;  // alerte des jeux automatiques sous ce nombre de jours de réserve
const FENETRE = 14;      // jours comptés pour « jours vides »
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
// mois : premier jour du mois affiché ; sel : jour ouvert ; voir : réponses affichées (jamais enregistré) ; seq : ignore les
// réponses d'une période abandonnée.
const P = { root: null, today: '', jeux: null, prog: new Map(), mois: '', sel: null, voir: false, seq: 0 };

const aDate = () => P.jeux.filter((j) => j.mode === 'date');

/** Première et dernière case de la grille du mois affiché. */
function grille() {
  const [y, m] = P.mois.split('-').map(Number);
  const dernier = new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
  return { first: lundiDe(P.mois), last: ajoute(lundiDe(dernier), 6) };
}

/** Lit une période et remplace ce qu'on en savait (un jour retiré entre-temps disparaît). */
async function lire(from, jours) {
  const { data, error } = await sb.rpc('hg_jeux_programme', { p_from: from, p_days: jours });
  if (error) throw error;
  const to = ajoute(from, jours - 1);
  for (const j of data?.jeux || []) {
    if (!P.prog.has(j.cle)) P.prog.set(j.cle, new Map());
    const m = P.prog.get(j.cle);
    for (const k of [...m.keys()]) if (k >= from && k <= to) m.delete(k);
    for (const d of j.jours || []) m.set(d.day, d);
  }
  return data;
}

/**
 * Lit les 92 jours à venir (avec `tout`) et la grille du mois, puis dessine.
 * @param {boolean} tout Vrai à chaque visite ; faux quand on change seulement de mois.
 * @param {string} [moisAvant] Mois à retrouver si le changement de mois échoue (l'écran reste alors en place).
 */
async function charge(tout, moisAvant) {
  const seq = ++P.seq;
  if (!P.mois) P.mois = `${clefJour.format(Date.now()).slice(0, 8)}01`;
  const { first, last } = grille();
  try {
    const [haut] = await Promise.all([tout ? lire(clefJour.format(Date.now()), HORIZON) : null, lire(first, ecart(first, last) + 1)]);
    if (seq !== P.seq) return;
    if (haut) { P.today = haut.today; P.jeux = haut.jeux || []; }
    P.sel ??= P.today;
    if (tout) dessine(); else repeintCalendrier();
  } catch (e) {
    if (seq !== P.seq) return;
    if (!tout && P.jeux) { P.mois = moisAvant; toast(`Mois indisponible : ${errMsg(e)}`, 'error'); return; }
    P.root.innerHTML = `<div class="empty">Programmation indisponible : ${esc(errMsg(e))}</div>`;
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
    <button type="button" class="btn btn-ghost btn-sm" data-pg="ouvrir" data-route="${esc(j.route)}" aria-label="Programmer ${esc(j.titre)}">Programmer</button>
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
  const auj = j.jour_courant || P.today; // GeoGuessr change de jour à 6 h
  if (k < auj) return 'Pas de manche';
  if (j.filet) return k === auj ? 'Tirage au premier passage du jour' : 'Tirage automatique le jour même';
  return 'Rien de prévu : pas de manche';
}

/** Détail du jour choisi, jeu par jeu. Le titre n'entre dans la page que si « Afficher les réponses » est cochée. */
function detail() {
  const k = P.sel;
  const u = versUtc(k);
  const lignes = aDate().map((j) => {
    const d = P.prog.get(j.cle)?.get(k);
    const s = d?.statut || 'vide';
    const info = !d ? texteVide(j, k)
      : s === 'auto' ? 'Tirage automatique' : s === 'annule' ? 'Manche annulée' : d.par ? `Programmé par ${d.par}` : 'Programmé';
    const rep = d?.titre ? (P.voir ? `<span class="pg-rep">${esc(d.titre)}</span>` : '<span class="small muted">Réponse masquée</span>') : '';
    return `<li><span class="pg-p pg-p-${s}" aria-hidden="true">${esc(LETTRE[j.cle] || '?')}</span>
      <div class="pg-dett"><b>${esc(j.titre)}</b> <span class="small">${esc(STATUTS[s])}</span>
        <span class="small muted">${esc(info)}</span>${rep}</div></li>`;
  }).join('');
  return `<h3 class="pl-card-h" id="pg-detail-h">${esc(maj(fmtLong.format(u)))}${k === P.today ? ' <span class="small muted">(aujourd’hui)</span>' : ''}</h3>
    <ul class="pg-det">${lignes}</ul>`;
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
          <label class="pg-voir"><input type="checkbox" data-pg="voir"${P.voir ? ' checked' : ''}> Afficher les réponses</label>
        </div>
        ${calendrier()}
        ${legende()}
      </section>
      <section class="pl-card" id="pg-detail" aria-labelledby="pg-detail-h" aria-live="polite">${detail()}</section>
    </div>` : ''}
    ${reserves.length || generes.length ? `<section class="pl-card" aria-labelledby="pg-h-auto">
      <h3 class="pl-card-h" id="pg-h-auto">Jeux automatiques</h3>
      <p class="small muted">Tirés le jour même dans leur réserve : rien à programmer. Une réserve compte les jours encore inédits. Épuisée, elle ressert les plus anciens ; l’Anagramme, lui, s’arrête.</p>
      ${reserves.length ? `<ul class="pg-autos">${reserves.map(ligneAuto).join('')}</ul>` : ''}
      ${generes.length ? `<ul class="pg-autos pg-gen">${generes.map(ligneAuto).join('')}</ul>` : ''}</section>` : ''}
  </div>`;
}

/** Changement de mois : titre, grille et détail seulement, pour garder le focus et les annonces des zones « aria-live ». */
function repeintCalendrier() {
  P.root.querySelector('#pg-mois').textContent = maj(fmtMois.format(versUtc(P.mois)));
  P.root.querySelector('.pg-grid').outerHTML = calendrier();
  P.root.querySelector('#pg-detail').innerHTML = detail();
}

/* ---------- Actions ---------- */
/** Clics de l'écran : mois, jour, réponses, vers l'écran d'un jeu. */
function surClic(e) {
  const b = e.target.closest('[data-pg]');
  if (!b) return;
  const act = b.dataset.pg;
  if (act === 'ouvrir') { navigate(b.dataset.route); return; }
  if (act === 'jour') {
    P.sel = b.dataset.day;
    for (const x of P.root.querySelectorAll('[data-pg="jour"]')) {
      x.classList.toggle('is-sel', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    }
    P.root.querySelector('#pg-detail').innerHTML = detail();
    return;
  }
  if (act === 'prec' || act === 'suiv' || act === 'auj') {
    const avant = P.mois;
    if (act === 'auj') { P.mois = `${P.today.slice(0, 8)}01`; P.sel = P.today; }
    else { const u = versUtc(P.mois); u.setUTCMonth(u.getUTCMonth() + (act === 'suiv' ? 1 : -1)); P.mois = u.toISOString().slice(0, 8) + '01'; }
    charge(false, avant);
  }
}

/** Case « Afficher les réponses » : seul le détail contient des réponses. */
function surChangement(e) {
  if (e.target.dataset.pg !== 'voir') return;
  P.voir = e.target.checked;
  const box = P.root.querySelector('#pg-detail');
  if (box) box.innerHTML = detail();
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
  P.root.addEventListener('keydown', surTouche);
}

/** À chaque visite : relit tout (on revient souvent de l'écran d'un jeu, où l'on vient de programmer). */
function open() {
  if (P.root) return charge(true);
}

/** Fournisseur de la sous-section La Fête foraine › Jeux › Programmation (admin/shell.js). */
export const programmeSub = { main, open };
