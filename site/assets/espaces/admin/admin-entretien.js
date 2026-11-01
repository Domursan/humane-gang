// =====================================================================
// Admin : La Mairie › Technique › Entretien (migration 192). Une page, trois cartes qui se chargent chacune de leur côté :
// - Quotas : base et stockage du plan gratuit, alerte à 80 %, détail par bucket (entretien-sante.js) ;
// - Tâches planifiées : hg_entretien_taches. La base ne rend jamais la commande ni le message d'une tâche : ils peuvent contenir des clés ;
// - Purge de nuit : durées (hg_entretien_reglages, hg_entretien_regler), purge manuelle (entretien-purge.js).
// Droits : permission « reglages » pour voir la page. Durées, purge et « Ignorer cette semaine » : administrateur seulement,
// vérifié en base ; ici le Staff ne voit ni boutons ni champs modifiables.
// Les textes qui parlent d'une durée la lisent dans la réponse de la base : « 3 jours » n'est que la valeur par défaut.
// Dépendances : core.js (sb, toast, errMsg, esc), admin/ui/time.js, entretien-sante.js, entretien-purge.js.
// Exporte : mountEntretienSection (montage).
// =====================================================================
import { sb, toast, errMsg, esc } from '../../commun/core.js';
import { relTime, clock, shortDate, toDate } from './ui/time.js';
import { QUOTA_BASE, QUOTA_STOCKAGE, PLAFOND_IMPORT, SEUIL, estAdmin, nf, mo, pct, stockage, loadQuotas, quotas, suspendues, alertesQuotas, ignorerQuotas } from './entretien-sante.js';
import { ouvrirPurge, lignes } from './entretien-purge.js';

/** Buckets de Supabase : noms lisibles. Les autres gardent leur identifiant. */
const BUCKETS = { 'hg-nj': 'Nouveaux jeux', 'hg-bot-media': 'Médias du bot', 'hg-photos': 'Photos', 'hg-jeux': 'Médias des jeux', 'hg-assets': 'Fichiers du site' };
/** Sous cette taille, un bucket rejoint la ligne « Le reste ». */
const PETIT_BUCKET = 1e6;
/**
 * Tâches pg_cron connues, dans l'ordre d'affichage. edge : fonction edge appelée ensuite. Ce renseignement est écrit ici parce que
 * la commande de la tâche n'est jamais lue. quand : phrase de remplacement quand le planning cron la rend illisible (deux heures UTC).
 */
const TACHES = [
  ['hg-housekeeping', 'Purge de nuit'],
  ['hg-event-cards-hourly', 'Cartes d’événement'],
  ['hg-birthdays-daily', 'Anniversaires', { edge: 'hg-birthdays', quand: 'Chaque jour, 8 h 05 en Suisse' }],
  ['hg-badges-hourly', 'Attribution des badges'],
  ['hg-auctions-close', 'Clôture des enchères'],
  ['hg-challenges-hourly', 'Défis du gang'],
  ['hg-nj-images', 'Images des nouveaux jeux', { edge: 'hg-nj-images' }],
  ['hg-duel-tick', 'Minuteur : Duels'],
  ['hg-lg-tick', 'Minuteur : Loup-Garou'],
  ['hg-ndc-tick', 'Minuteur : Nom de code'],
  ['hg-plat-tick', 'Minuteur : Plateaux'],
  ['hg-uno-tick', 'Minuteur : Uno'],
  ['hg-quests-hourly', 'Quêtes'],
  ['hg-cron-5min', 'Rappels et événements', { edge: 'hg-cron' }],
  ['hg-cards-hourly', 'Récompenses de présence'],
];
const RANG = new Map(TACHES.map(([n, label, o], i) => [n, { rang: i, label, ...o }]));
/** Statuts d'une tâche : libellé et ton de pastille (ui-pill). */
const STATUT = { ok: ['done', 'Réussie'], echec: ['open', 'Échec'], jamais: ['prog', 'Pas encore lancée'], cours: ['prog', 'En cours'], coupee: ['prog', 'Désactivée'] };
const FILTRES = [['toutes', 'Toutes'], ['surveiller', 'À surveiller'], ['ok', 'Réussies']];
const NOMBRES = ['', 'une', 'deux', 'trois', 'quatre', 'cinq'];

// État de la page. journal : durée du journal, connue après le premier chargement (3 : valeur par défaut, le temps du chargement).
const E = { root: null, journal: 3, quotas: 'charge', taches: { etat: 'charge', msg: '', data: null, filtre: 'toutes' }, regl: { etat: 'charge', msg: '', data: null, err: {} }, detail: null };

/** « n jour » ou « n jours ». */
const jours = (n) => `${n} ${n > 1 ? 'jours' : 'jour'}`;
/** Durée d'exécution : « 0,03 s ». */
const secondes = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
/** Bouton « Réessayer » d'une carte. */
const reessayer = (nom) => `<button class="btn btn-ghost btn-sm" type="button" data-ent-reessai="${nom}">Réessayer</button>`;
const carte = (nom) => E.root?.querySelector(`[data-ent-carte="${nom}"]`);

/* ---------- Quotas ---------- */

/** Indicateur d'un quota : chiffre, pourcentage, barre. */
function jaugeHtml(titre, octets, quota, unite, stockageOui) {
  const p = pct(octets, quota), tone = p >= SEUIL ? 'bad' : 'ok', m = mo(octets);
  return `<div class="eco-ind qt-ind" data-tone="${tone}">
    <span class="eco-dot"><i></i>${tone === 'bad' ? 'Alerte' : 'Normal'}</span>
    <strong class="qt-nom">${esc(titre)}</strong>
    <span class="eco-big">${esc(m)} Mo</span>
    <span class="eco-sub small">${p} % de ${esc(unite)}</span>
    <div class="qt-bar" role="meter" aria-label="${esc(titre)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, p)}" aria-valuetext="${esc(m)} Mo sur ${esc(unite)}, ${p} %">
      <span class="qt-rempli" style="width:${Math.min(100, p)}%"></span><span class="qt-seuil" style="left:${SEUIL}%"></span>${stockageOui ? `<span class="qt-seuil qt-plafond" style="left:${(100 * PLAFOND_IMPORT) / QUOTA_STOCKAGE}%"></span>` : ''}
    </div>
    <p class="qt-leg small muted">${stockageOui ? '<span>Plafond d’import 700 Mo</span>' : ''}<span>Alerte à ${SEUIL} %</span></p>
  </div>`;
}

/** Ligne du détail par bucket. */
function bucketHtml(nom, code, octets, top, valeur) {
  return `<li><span class="qt-sn">${esc(nom)} <code class="ent-code">${esc(code)}</code></span>
    <span class="er-track" aria-hidden="true"><span style="width:${Math.max(1, Math.round((100 * octets) / top))}%"></span></span><strong>${esc(valeur)}</strong></li>`;
}

/** Détail du stockage : gros buckets, puis les petits regroupés dans « Le reste ». */
function bucketsHtml(buckets, ouvert) {
  const tri = [...buckets].sort((a, b) => Number(b.octets) - Number(a.octets));
  const gros = tri.filter((b) => Number(b.octets) >= PETIT_BUCKET), petits = tri.filter((b) => Number(b.octets) < PETIT_BUCKET);
  const top = Math.max(1, Number(tri[0]?.octets || 0)), reste = petits.reduce((s, b) => s + Number(b.octets || 0), 0);
  return `<details class="eco-more" id="ent-buckets"${ouvert ? ' open' : ''}><summary>Détail du stockage par bucket</summary>
    <ul class="er-bars qt-bars">${gros.map((b) => bucketHtml(BUCKETS[b.bucket_id] || b.bucket_id, b.bucket_id, Number(b.octets), top, `${mo(b.octets)} Mo`)).join('')}${petits.length
      ? bucketHtml('Le reste', `${petits.length} ${petits.length > 1 ? 'buckets' : 'bucket'}`, reste, top, reste < PETIT_BUCKET ? 'moins de 1 Mo' : `${mo(reste)} Mo`) : ''}</ul></details>`;
}

/** Une alerte de quotas et ses actions. */
function alerteHtml(a, premiere, stop) {
  const lien = a.key === 'base' ? '<a class="btn btn-sand btn-sm" href="#mairie/entretien" data-ent-aller="ent-purge">Ouvrir la purge</a>'
    : '<a class="btn btn-sand btn-sm" href="#mairie/entretien" data-ent-aller="ent-buckets">Voir le détail</a>';
  const ignorer = premiere && estAdmin() ? `<button type="button" class="btn btn-ghost btn-sm" data-ent-ignorer="${stop ? 0 : 7}">${stop ? 'Reprendre les alertes' : 'Ignorer cette semaine'}</button>` : '';
  return `<div class="eco-alert" data-tone="${stop ? 'off' : 'bad'}"><div class="eco-alert-txt"><strong>${esc(a.title)}</strong><span class="small">${esc(a.text)}</span></div>
    <div class="eco-alert-act">${lien}${ignorer}</div></div>`;
}

/** Dessine la carte Quotas. */
function renderQuotas() {
  const c = carte('quotas');
  if (!c) return;
  const { data: d, error } = quotas();
  const titre = '<h3 class="card-title">Quotas</h3>';
  const note = (s = '') => `<p class="eco-note small muted">Place occupée sur le plan gratuit de Supabase${s}.</p>`;
  if (E.quotas === 'charge') { c.innerHTML = `${titre}${note()}<div class="empty">Chargement des quotas…</div>`; return; }
  if (error || !d) { c.innerHTML = `${titre}${note()}<div class="empty">Impossible de lire les quotas : ${esc(error || 'réponse vide')}. ${reessayer('quotas')}</div>`; return; }
  const al = alertesQuotas(), stop = suspendues(), jour = toDate(d.releve_at);
  const date = jour ? `, relevé le ${String(jour.getDate()).padStart(2, '0')}.${String(jour.getMonth() + 1).padStart(2, '0')}.${jour.getFullYear()}` : '';
  const stock = stockage(d);
  c.innerHTML = `${titre}${note(date)}
    ${al.length && stop ? `<p class="small muted qt-susp">Alertes suspendues jusqu’au ${esc(shortDate(d.ignore_until))}. Les barres restent à jour.</p>` : ''}
    ${al.map((a, i) => alerteHtml(a, i === 0, stop)).join('')}
    <div class="qt-inds">${jaugeHtml('Base de données', d.base_octets, QUOTA_BASE, '500 Mo', false)}${jaugeHtml('Stockage', stock, QUOTA_STOCKAGE, '1 Go', true)}</div>
    ${bucketsHtml(d.buckets || [], E.detail ?? al.length > 0)}`;
}

/* ---------- Tâches planifiées ---------- */

/** État d'une tâche d'après sa dernière exécution. */
function statut(t) {
  if (!t.active) return 'coupee';
  if (!t.status) return 'jamais';
  if (t.status === 'succeeded') return 'ok';
  return t.status === 'failed' ? 'echec' : 'cours';
}

/** Planning cron en français (UTC : c'est l'heure de pg_cron). Une forme inconnue reste brute. */
function quand(t) {
  const fixe = RANG.get(t.jobname)?.quand;
  if (fixe) return fixe;
  const s = String(t.schedule || '').trim();
  if (s === '* * * * *') return 'Chaque minute';
  let m = /^\*\/(\d+) \* \* \* \*$/.exec(s);
  if (m) return `Toutes les ${m[1]} min`;
  m = /^(\d+) \* \* \* \*$/.exec(s);
  if (m) return `Chaque heure, à hh:${m[1].padStart(2, '0')}`;
  m = /^(\d+) (\d+) \* \* \*$/.exec(s);
  if (m) return `${Number(m[2]) < 6 ? 'Chaque nuit' : 'Chaque jour'}, ${m[2]} h ${m[1].padStart(2, '0')} UTC`;
  return s;
}

/** Ligne du tableau. */
function ligneHtml(t) {
  const s = statut(t), info = RANG.get(t.jobname), debut = toDate(t.start_time), fin = toDate(t.end_time);
  const memeJour = debut && debut.toDateString() === new Date().toDateString();
  const duree = s !== 'cours' && debut && fin ? secondes(fin - debut) : '—';
  const n = Number(t.executions || 0), e = Number(t.erreurs || 0);
  return `<tr class="${s === 'echec' ? 'is-ko' : ''}"><th scope="row"><span class="crn-nom">${esc(info?.label || t.jobname)}</span><span class="crn-code"><code class="ent-code">${esc(t.jobname)}</code>${info?.edge ? `<span class="crn-edge" title="Appelle la fonction edge ${esc(info.edge)}">puis fonction edge</span>` : ''}</span></th>
    <td class="crn-quand small muted">${esc(quand(t))}</td>
    <td class="crn-der">${debut ? `<span>${esc(relTime(debut).replace("'", '’'))}</span> <span class="small muted">${esc(memeJour ? clock(debut) : shortDate(debut))}</span>` : '<span class="muted">Jamais</span>'}</td>
    <td class="crn-duree small muted">${esc(duree)}</td>
    <td class="crn-stat"><span class="ui-pill" data-tone="${STATUT[s][0]}">${esc(STATUT[s][1])}</span></td>
    <td class="crn-err">${e ? `<strong class="crn-ko">${e}</strong><span class="small muted"> sur ${esc(nf(n))}</span>` : `<span class="muted">0</span>${n ? `<span class="small muted"> sur ${esc(nf(n))}</span>` : ''}`}</td></tr>`;
}

/** En-tête de la carte Tâches. */
function tachesEntete(nb, extra = '') {
  const gardes = nb > 1 ? `les ${jours(nb)} gardés` : 'le jour gardé';
  return `<div class="ent-head"><div><h3 class="card-title">Tâches planifiées</h3><p class="eco-note small muted">Ce que la base lance toute seule. Erreurs comptées sur ${esc(gardes)} au journal.</p></div>${extra}</div>`;
}

/** Tâches triées : échecs, tâches coupées, puis l'ordre de TACHES ; les tâches inconnues à la fin. */
function trier(liste) {
  const poids = (t) => ({ echec: 0, coupee: 1 }[statut(t)] ?? 2);
  const rang = (t) => RANG.get(t.jobname)?.rang ?? TACHES.length;
  return [...liste].sort((a, b) => poids(a) - poids(b) || rang(a) - rang(b) || String(a.jobname).localeCompare(String(b.jobname)));
}

/** Dessine la carte Tâches. */
function renderTaches() {
  const c = carte('taches');
  if (!c) return;
  const T = E.taches, d = T.data;
  if (T.etat === 'charge') { c.innerHTML = `${tachesEntete(E.journal)}<div class="empty">Chargement des tâches…</div>`; return; }
  if (T.etat === 'erreur') { c.innerHTML = `${tachesEntete(E.journal)}<div class="empty">Impossible de lire les tâches : ${esc(T.msg)}. ${reessayer('taches')}</div>`; return; }
  const liste = trier(d?.taches || []), nb = d?.jours ?? E.journal;
  if (!liste.length) { c.innerHTML = `${tachesEntete(nb)}<div class="empty">Aucune tâche planifiée trouvée. Si des tâches existent, vérifie que l’extension pg_cron est active.</div>`; return; }
  const st = (t) => statut(t);
  const surveiller = (t) => ['echec', 'coupee', 'jamais'].includes(st(t));
  const tot = liste.reduce((s, t) => s + Number(t.executions || 0), 0), ko = liste.reduce((s, t) => s + Number(t.erreurs || 0), 0);
  const surv = liste.filter(surveiller), actives = liste.filter((t) => t.active).length;
  const pourquoi = surv.some((t) => st(t) !== 'jamais') ? 'échec ou tâche coupée' : surv.length ? 'pas encore lancée' : 'tout va bien';
  const vues = { toutes: liste, surveiller: surv, ok: liste.filter((t) => st(t) === 'ok') };
  const edges = liste.filter((t) => RANG.get(t.jobname)?.edge).length;
  const marquees = edges > 1 ? `les ${NOMBRES[edges] || edges} tâches marquées` : 'la tâche marquée';
  c.innerHTML = `${tachesEntete(nb, `<div class="ent-rel"><span class="small muted">Relevé à ${esc(clock(d.releve_at))}</span><button class="btn btn-ghost btn-sm" type="button" data-ent-actualiser>Actualiser</button></div>`)}
    <div class="eco-inds">
      <div class="eco-ind" data-tone="ok"><span class="eco-dot"><i></i>Actives</span><span class="eco-big">${actives} sur ${liste.length}</span></div>
      <div class="eco-ind" data-tone="ok"><span class="eco-dot"><i></i>Exécutions</span><span class="eco-big">${esc(nf(tot))}</span><span class="eco-sub small">sur ${esc(jours(nb))}</span></div>
      <div class="eco-ind" data-tone="${ko ? 'bad' : 'ok'}"><span class="eco-dot"><i></i>Erreurs</span><span class="eco-big">${esc(nf(ko))}</span><span class="eco-sub small">sur ${esc(jours(nb))}</span></div>
      <div class="eco-ind" data-tone="${surv.length ? 'warn' : 'ok'}"><span class="eco-dot"><i></i>À surveiller</span><span class="eco-big">${surv.length}</span><span class="eco-sub small">${esc(pourquoi)}</span></div></div>
    <div class="ui-filters" role="group" aria-label="Filtrer les tâches">${FILTRES.map(([id, l]) => `<button type="button" class="ui-chip" data-ent-filtre="${id}" aria-pressed="${T.filtre === id}">${esc(l)} <span class="ui-count">${vues[id].length}</span></button>`).join('')}</div>
    <div class="crn-wrap"><table class="crn-tbl"><caption class="visually-hidden">Tâches planifiées</caption>
      <thead><tr><th scope="col">Tâche</th><th scope="col" class="crn-quand">Quand</th><th scope="col">Dernière exécution</th><th scope="col" class="crn-duree">Durée</th><th scope="col">Statut</th><th scope="col">Erreurs</th></tr></thead>
      <tbody>${vues[T.filtre].map(ligneHtml).join('')}</tbody></table></div>
    ${liste.some((t) => st(t) === 'echec') ? '<div class="stf-note">Le message d’erreur reste dans les journaux de Supabase : il peut contenir des clés, le panel ne l’affiche pas.</div>' : ''}
    <p class="stf-note"><strong>Limite du tableau :</strong> « Réussie » veut dire que la tâche a rendu la main.${edges ? ` Pour ${esc(marquees)} « puis fonction edge », un échec dans la fonction appelée ensuite n’apparaît pas ici : voir Erreurs du site et les journaux de Supabase.` : ''}</p>`;
}

/* ---------- Purge de nuit ---------- */

/** Texte du « Dernier passage ». */
function dernierPassage(r) {
  const jour = (iso) => {
    const d = toDate(iso), ecart = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    return `${ecart === 0 ? 'aujourd’hui' : ecart === 1 ? 'hier' : `le ${shortDate(d)}`} à ${clock(d)}`;
  };
  const p = r.dernier;
  if (p?.at) return `${jour(p.at)}, ${p.mode === 'main' ? 'à la main' : 'de nuit'}, ${lignes(Number(p.lignes) || 0)}.`;
  if (r.derniere_nuit) return `${jour(r.derniere_nuit)}, de nuit.`;
  return 'aucun pour l’instant, la première purge part cette nuit.';
}

/** Champ d'une durée. */
function champHtml(id, cle, label, regle, valeur, aide, modifiable, erreur) {
  return `<div class="field rg3-field">
    <label for="${id}">${esc(label)}</label>
    <input id="${id}" name="${cle}" type="number" inputmode="numeric" min="${regle.min}" max="${regle.max}" step="1" autocomplete="off" value="${esc(valeur)}" aria-describedby="${id}-h"${modifiable ? '' : ' disabled'}${erreur ? ' aria-invalid="true"' : ''}>
    <div class="rg3-line"><span class="small muted" id="${id}-h">${esc(aide)}</span>${modifiable ? `<button class="btn btn-ghost btn-sm" type="button" data-ent-defaut="${cle}">Rétablir la valeur par défaut</button>` : ''}</div>
    <p class="form-error" role="alert"${erreur ? '' : ' hidden'}>${esc(erreur || '')}</p></div>`;
}

/** Dessine la carte Purge. */
function renderPurge() {
  const c = carte('purge');
  if (!c) return;
  const R = E.regl, admin = estAdmin();
  const titre = '<h3 class="card-title" id="ent-purge" tabindex="-1">Purge de nuit</h3><p class="eco-note small muted">Chaque nuit à 3 h 37 UTC, le site supprime le vieux journal des tâches et les journaux de coups des parties terminées.</p>';
  if (R.etat === 'charge') { c.innerHTML = `${titre}<div class="empty">Chargement des réglages…</div>`; return; }
  if (R.etat === 'erreur') { c.innerHTML = `${titre}<div class="empty">Impossible de charger les réglages : ${esc(R.msg)}. ${reessayer('regl')}</div>`; return; }
  const d = R.data, bj = d.bornes.journal_jours, bc = d.bornes.coups_jours;
  c.innerHTML = `${titre}
    ${admin ? '' : '<p class="small muted" role="note">Lecture seule : ton rôle ne permet pas de modifier ces réglages.</p>'}
    <form class="rg3-form ent-form" novalidate>
      <fieldset class="rg3-groupe"><legend>Durées de conservation</legend><div class="ent-duo">
      ${champHtml('ent-journal', 'journal_jours', 'Journal des tâches (jours)', bj, d.journal_jours,
    `De ${bj.min} à ${bj.max} jours. Cette table grossit d’environ 1,5 Mo par jour. Les erreurs du tableau couvrent cette durée. Défaut : ${bj.defaut}.`, admin)}
      ${champHtml('ent-coups', 'coups_jours', 'Journaux de coups (jours)', bc, d.coups_jours,
    `De ${bc.min} à ${bc.max} jours après la fin de la partie : Plateaux, Uno, Duels et Nom de code. Défaut : ${bc.defaut}.`, admin)}
      </div></fieldset>
      ${admin ? '<div class="rg3-actions"><button class="btn btn-primary btn-sm" type="submit">Enregistrer</button></div>' : ''}
    </form>
    ${admin ? `<div class="ent-purge"><div class="ent-purge-t"><strong>Purge manuelle</strong><span class="small muted">Lance tout de suite le même ménage. <span class="pill pill-todo ent-pill">Admin seulement</span></span><span class="small muted"><strong>Dernier passage :</strong> ${esc(dernierPassage(d))}</span></div>
      <button class="btn btn-danger" type="button" data-ent-purger>Purger maintenant</button></div>`
    : `<p class="small muted ent-dern"><strong>Dernier passage :</strong> ${esc(dernierPassage(d))}</p>`}`;
}

/** Vérifie un champ : pose ou retire son message. Rend la valeur entière, ou null si elle est refusée. */
function lireChamp(input) {
  const b = E.regl.data.bornes[input.name], brut = input.value.trim(), n = Number(brut);
  const valide = brut !== '' && Number.isInteger(n) && n >= b.min && n <= b.max;
  const msg = input.closest('.field').querySelector('.form-error');
  msg.textContent = valide ? '' : `Entre ${b.min} et ${b.max} jours.`;
  msg.hidden = valide;
  if (valide) input.removeAttribute('aria-invalid'); else input.setAttribute('aria-invalid', 'true');
  return valide ? n : null;
}

/** Enregistre les deux durées (administrateur) : le serveur revérifie les bornes. */
async function enregistrer(form) {
  const champs = [form.elements.journal_jours, form.elements.coups_jours];
  const [j, c] = champs.map(lireChamp);
  if (j === null || c === null) { champs[j === null ? 0 : 1].focus(); return; }
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  try {
    const { data, error } = await sb.rpc('hg_entretien_regler', { p_journal_jours: j, p_coups_jours: c });
    if (error) throw error;
    E.regl.data = data;
    E.journal = data.journal_jours;
    renderPurge();
    toast('Durées enregistrées', 'ok');
    chargerTaches(); // la période du tableau suit la durée du journal
  } catch (e) {
    btn.disabled = false;
    toast(errMsg(e), 'error');
  }
}

/* ---------- Chargements ---------- */

/** Charge et dessine les quotas. */
async function chargerQuotas() {
  await loadQuotas();
  E.quotas = 'pret';
  renderQuotas();
}

/** Charge et dessine les tâches. Une relecture garde le tableau affiché jusqu'à la réponse. */
async function chargerTaches() {
  const T = E.taches;
  try {
    const { data, error } = await sb.rpc('hg_entretien_taches');
    if (error) throw error;
    T.data = data || null; T.etat = 'pret'; T.msg = '';
    if (data?.jours) E.journal = data.jours;
  } catch (e) { T.etat = 'erreur'; T.msg = errMsg(e); }
  renderTaches();
}

/** Charge et dessine les réglages de la purge. */
async function chargerReglages() {
  const R = E.regl;
  try {
    const { data, error } = await sb.rpc('hg_entretien_reglages');
    if (error) throw error;
    R.data = data; R.etat = 'pret'; R.msg = '';
    E.journal = data.journal_jours;
  } catch (e) { R.etat = 'erreur'; R.msg = errMsg(e); }
  renderPurge();
  if (E.taches.etat === 'charge') renderTaches(); // la durée réelle remplace le défaut de l'en-tête
}

/** « Réessayer » d'une carte : repasse par son état de chargement. */
function reessai(nom) {
  if (nom === 'quotas') { E.quotas = 'charge'; renderQuotas(); chargerQuotas(); }
  if (nom === 'taches') { E.taches.etat = 'charge'; renderTaches(); chargerTaches(); }
  if (nom === 'regl') { E.regl.etat = 'charge'; renderPurge(); chargerReglages(); }
}

/** Après une purge : dernier passage, tâches et quotas à jour, focus rendu au bouton. */
async function apresPurge() {
  await Promise.all([chargerReglages(), chargerTaches(), chargerQuotas()]);
  E.root?.querySelector('[data-ent-purger]')?.focus();
}

/* ---------- Événements ---------- */

/** Clics délégués de la page. */
function onClick(e) {
  const lien = e.target.closest('[data-ent-aller]');
  if (lien) {
    e.preventDefault(); // l'adresse de la page ne change pas
    const cible = document.getElementById(lien.dataset.entAller);
    if (cible?.tagName === 'DETAILS') { cible.open = true; E.detail = true; }
    cible?.scrollIntoView({ block: 'start' });
    (cible?.querySelector('summary') || cible)?.focus();
    return;
  }
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.entReessai) { reessai(b.dataset.entReessai); return; }
  if (b.dataset.entIgnorer) { ignorerQuotas(Number(b.dataset.entIgnorer)); return; }
  if (b.dataset.entFiltre) {
    E.taches.filtre = b.dataset.entFiltre;
    renderTaches();
    E.root.querySelector(`[data-ent-filtre="${b.dataset.entFiltre}"]`)?.focus();
    return;
  }
  if (b.hasAttribute('data-ent-actualiser')) { chargerTaches(); return; }
  if (b.dataset.entDefaut) {
    const input = E.root.querySelector(`input[name="${b.dataset.entDefaut}"]`);
    input.value = E.regl.data.bornes[input.name].defaut;
    lireChamp(input);
    return;
  }
  if (b.hasAttribute('data-ent-purger')) ouvrirPurge(apresPurge);
}

/** Point d'entrée (admin.js, première visite de La Mairie › Entretien). */
export async function mountEntretienSection(root) {
  if (!root) return;
  E.root = root;
  root.innerHTML = '<div class="ent-page"><div class="card eco-card" data-ent-carte="quotas"></div><div class="card eco-card" data-ent-carte="taches"></div><div class="card eco-card" data-ent-carte="purge"></div></div>';
  root.addEventListener('click', onClick);
  root.addEventListener('submit', (e) => { e.preventDefault(); if (estAdmin()) enregistrer(e.target); });
  root.addEventListener('input', (e) => { if (e.target.matches('.ent-form input')) lireChamp(e.target); });
  root.addEventListener('toggle', (e) => { if (e.target.id === 'ent-buckets') E.detail = e.target.open; }, true);
  document.addEventListener('hg:entretien-changed', renderQuotas);
  renderQuotas(); renderTaches(); renderPurge();
  await Promise.all([chargerQuotas(), chargerTaches(), chargerReglages()]);
}
