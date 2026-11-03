// ===== Humane Gang — administration : challenges de la semaine (La Fabrique › Animations) =====
// Rôle : liste des challenges (phase, chiffres, gagnants), création et modification dans le tiroir (heure suisse, récapitulatif
// en direct), annulation, suppression d'un challenge sans participation, fiche de suivi (#fabrique/challenges/<id>) :
// participations avec pseudos, fichiers et voix, retrait avec motif (le membre est notifié, le fichier supprimé), choix du
// gagnant quand personne n'a voté (phase « attente ») ou fin « sans gagnant ».
// Réservé à l'administrateur (RLS hg_is_admin, section 'admin'). Création, modification, annulation, suppression : écriture
// directe sur hg_weekly_challenges ; la base refuse ce qui ne peut plus changer (message affiché tel quel) et le tiroir
// désactive déjà ces champs. À l'ouverture, les fichiers orphelins du bucket (hg_wch_admin_orphelins) sont retirés en fond.
// Dépendances : core.js (sb, toast, esc, avatarHtml), admin-events.js (heure suisse), ui-confirm.js, list-tools.js,
// ui/drawer.js, icons.js, challenge/challenge-commun.js (libellés, dates), challenge/fichiers.js (liens signés, retrait).
// RPC : hg_wch_admin_list, hg_wch_admin_detail, hg_wch_admin_remove, hg_wch_admin_pick, hg_wch_admin_orphelins.
// Exporte : mountWchSection(container), openWch(id).
import { sb, toast, errMsg, esc, $, avatarHtml } from '../../commun/core.js';
import { toZurichInput, fromZurichInput } from './admin-events.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { matches, searchHtml, bindSearch, setCount, emptyHtml, SEARCH_DELAY } from './list-tools.js';
import { openDrawer } from './ui/drawer.js';
import { svg } from '../../commun/icons.js';
import { TYPES, typeOf, nf, quand, dateLongue, dateAn, gainTexte, pluriel, resteParts } from '../challenge/challenge-commun.js';
import { fileLinkHtml, thumbHtml, hydrateMedia, removeEntryFiles } from '../challenge/fichiers.js';

/** Icône à trait. */
const I = (n, s = 18) => svg(n, { size: s, stroke: 1.8 });
/** Bornes des champs (mêmes contraintes que la table hg_weekly_challenges). */
const MAX = { title: 120, how_to: 2000, why: 1000, reward_text: 200, paillettes: 100000 };
/** Pastille de chaque phase, vue de l'admin. */
const PILL = {
  a_venir: ['À venir', 'pill-current'], participation: ['Participation ouverte', 'pill-ok'], vote: ['Vote en cours', 'pill-ok'],
  cloture: ['Dépouillement', 'pill-current'], attente: ['Gagnant à choisir', 'pill-todo'], termine: ['Terminé', ''],
  sans_gagnant: ['Sans gagnant', 'pill-todo'], annule: ['Annulé', 'pill-todo'],
};
const pillHtml = (ph) => { const [l, c] = PILL[ph] || [ph, '']; return `<span class="pill${c ? ` ${c}` : ''}">${esc(l)}</span>`; };
/** Phases où le challenge vit encore (annulable). */
const VIVANT = new Set(['a_venir', 'participation', 'vote']);
/** Phases où une participation peut être retirée. */
const RETRAIT = new Set(['participation', 'vote', 'cloture', 'attente']);
/** Adresse de la section. */
const ROUTE = '#fabrique/challenges';

/* ---------- État ---------- */
// root : conteneur ; rows : challenges (hg_wch_admin_list) ; query : recherche ; detail : fiche ouverte ; purge : orphelins faits.
const W = { root: null, rows: [], query: '', detail: null, purge: false };

/** Bouton en cours : désactivé avec indicateur (pas de second envoi). */
function setBusy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('is-busy', on);
  if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}

/* ---------- Montage ---------- */
/**
 * Monte la section (une fois) : clics délégués, puis retrait en fond des fichiers orphelins.
 * L'affichage (liste ou fiche) est fait par openWch, appelé à chaque visite.
 * @param {HTMLElement} container conteneur #wch-root
 */
export async function mountWchSection(container) {
  if (!container) return;
  W.root = container;
  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  purgeOrphelins();
}

/**
 * Affiche la liste (sans id) ou la fiche d'un challenge (#fabrique/challenges/<id>).
 * @param {string} [id] identifiant du challenge
 */
export async function openWch(id) {
  if (!W.root) return;
  if (id) return openFiche(id);
  W.detail = null;
  W.root.innerHTML = `<div class="adc">
    <div class="adc-head">
      <p class="small muted">Un challenge par semaine : les membres envoient un fichier, puis les participants votent. Le gain est versé au gagnant à la fin du vote.</p>
      <button class="btn btn-primary" type="button" data-action="wch-new">+ Nouveau challenge</button>
    </div>
    ${searchHtml({ id: 'wch-search', label: 'Rechercher un challenge', placeholder: 'Nom, consignes ou gagnant…' })}
    <div class="adc-list" id="wch-list" aria-live="polite"><div class="empty">Chargement des challenges…</div></div>
  </div>`;
  bindSearch(W.root.querySelector('#wch-search'), (q) => { W.query = q; renderList(); }, SEARCH_DELAY);
  await reloadList();
}

/** Fichiers du bucket sans participation (plus d'un jour) : retirés par lots de 100, sans bloquer l'affichage. */
async function purgeOrphelins() {
  if (W.purge) return;
  W.purge = true;
  try {
    const { data, error } = await sb.rpc('hg_wch_admin_orphelins', { p_limite: 500 });
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    for (let i = 0; i < list.length; i += 100) await removeEntryFiles(list.slice(i, i + 100));
  } catch (e) { console.warn('[challenges] fichiers orphelins', e?.message || e); }
}

/* ---------- Liste ---------- */
/** Recharge la liste (hg_wch_admin_list) puis la redessine. */
async function reloadList() {
  const list = $('#wch-list', W.root);
  try {
    const { data, error } = await sb.rpc('hg_wch_admin_list');
    if (error) throw error;
    W.rows = Array.isArray(data) ? data : [];
    renderList();
  } catch (e) {
    if (list) list.innerHTML = `<div class="empty">Impossible de charger les challenges : ${esc(errMsg(e))}</div>`;
  }
}

/** Pseudos des gagnants d'une ligne de la liste (tableau de pseudos ou d'objets). */
const gagnants = (r) => (r.winners || []).map((w) => (typeof w === 'string' ? w : w?.pseudo)).filter(Boolean);
/** « A », « A et B », « A, B et C ». */
const liste = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} et ${a[a.length - 1]}` : a[0] || '');

/** Ligne d'information sous un challenge, selon sa phase. */
function infoOf(r) {
  const n = Number(r.entries_count) || 0, m = Number(r.participants_count) || 0;
  const parts = `${pluriel(n, 'participation')} de ${pluriel(m, 'membre')}`;
  switch (r.phase) {
    case 'a_venir': return `Commence le ${quand(r.starts_at)} : rien n’est visible avant.`;
    case 'participation': return n ? parts : 'Aucune participation pour l’instant.';
    case 'vote': return `${parts} · ${pluriel(Number(r.voters_count) || 0, 'votant')}`;
    case 'cloture': return 'Vote terminé : dépouillement dans quelques minutes.';
    case 'attente': return 'Aucune voix : choisis le gagnant dans la fiche.';
    case 'termine': {
      const g = gagnants(r);
      return g.length > 1 ? `Ex æquo : ${liste(g)}` : `Gagnant : ${g[0] || '—'}`;
    }
    case 'sans_gagnant': return n ? 'Terminé sans gagnant : rien n’a été versé.' : 'Aucune participation : rien n’a été versé.';
    case 'annule': return r.cancelled_at ? `Annulé le ${dateAn(r.cancelled_at)}.` : 'Annulé.';
    default: return '';
  }
}

/** Redessine la liste selon la recherche. */
function renderList() {
  const list = $('#wch-list', W.root);
  if (!list) return;
  const noms = ['challenge', 'challenges'];
  if (!W.rows.length) {
    list.innerHTML = '<div class="empty">Aucun challenge pour le moment. Crée le premier avec « Nouveau challenge ».</div>';
    setCount($('#wch-search-count', W.root), 0, 0, '', noms);
    return;
  }
  const rows = W.rows.filter((r) => matches(W.query, r.title, r.how_to, r.why, ...gagnants(r)));
  setCount($('#wch-search-count', W.root), rows.length, W.rows.length, W.query, noms);
  if (!rows.length) { list.innerHTML = emptyHtml(W.query, 'Aucun challenge.'); return; }
  list.innerHTML = rows.map((r) => {
    const id = esc(r.id);
    const gain = gainTexte(r);
    const vote = Number(r.vote_days) || Math.max(1, Math.round((new Date(r.vote_ends_at) - new Date(r.ends_at)) / 864e5));
    return `<article class="card adc-row" aria-labelledby="wch-r-${id}">
      <div class="adc-row-head"><h3 class="adc-row-title" id="wch-r-${id}">${esc(r.title)}</h3>${pillHtml(r.phase)}</div>
      <p class="small muted">${esc(typeOf(r.answer_type).label)} · ${esc(pluriel(Number(r.max_entries) || 1, 'participation'))} par membre${gain ? ` · ${esc(gain)}` : ''}</p>
      <p class="small muted">Participation du ${esc(dateLongue(r.starts_at))} au ${esc(dateLongue(r.ends_at))} · vote ${esc(pluriel(vote, 'jour'))}</p>
      <p class="small">${esc(infoOf(r))}</p>
      <div class="btn-row">
        ${r.phase !== 'a_venir' && r.phase !== 'annule' ? `<a class="btn btn-ghost" href="${ROUTE}/${id}" aria-label="Suivre « ${esc(r.title)} »">Suivre</a>` : ''}
        ${r.phase !== 'annule' ? `<button class="btn btn-ghost" type="button" data-action="wch-edit" data-id="${id}">Modifier</button>` : ''}
        ${VIVANT.has(r.phase) ? `<button class="btn btn-danger btn-sm" type="button" data-action="wch-cancel" data-id="${id}">Annuler le challenge</button>` : ''}
        ${!Number(r.entries_count) ? `<button class="btn btn-danger btn-sm" type="button" data-action="wch-del" data-id="${id}">Supprimer</button>` : ''}
      </div>
    </article>`;
  }).join('');
}

/* ---------- Formulaire (tiroir) ---------- */
/** Valeur par défaut d'un nouveau challenge : lundi prochain 18:00 → lundi suivant 18:00 (heure suisse). */
function datesParDefaut() {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  const jour = toZurichInput(d.toISOString()).slice(0, 10);
  const start = fromZurichInput(`${jour}T18:00`);
  const end = new Date(new Date(start).getTime() + 7 * 864e5).toISOString();
  return [start, fromZurichInput(`${toZurichInput(end).slice(0, 10)}T18:00`)];
}

/** Champs figés selon l'état du challenge (mêmes règles que le trigger de la base). */
function figes(r) {
  if (!r) return new Set();
  const out = new Set();
  const clos = !!r.closed_at || ['termine', 'sans_gagnant', 'attente'].includes(r.phase);
  if (new Date(r.ends_at) <= Date.now()) ['starts_at', 'ends_at', 'answer_type', 'max_entries'].forEach((k) => out.add(k));
  if (Number(r.entries_count) > 0) out.add('answer_type');
  if (clos) ['starts_at', 'ends_at', 'answer_type', 'max_entries', 'vote_days', 'reward_paillettes'].forEach((k) => out.add(k));
  return out;
}

/**
 * Tiroir de création (r null) ou de modification d'un challenge.
 * @param {object|null} r ligne existante (hg_weekly_challenges + entries_count, phase), ou null
 */
function openForm(r = null) {
  const isNew = !r;
  const [ds, de] = datesParDefaut();
  const v = r || { title: '', how_to: '', why: '', answer_type: 'image', max_entries: 1, starts_at: ds, ends_at: de, vote_days: 2, reward_paillettes: 300, reward_text: '' };
  const fz = figes(r);
  const dis = (k) => (fz.has(k) ? ' disabled aria-describedby="wch-fige"' : '');
  const types = Object.entries(TYPES).map(([k, t]) => `<option value="${k}"${k === v.answer_type ? ' selected' : ''}>${esc(t.label)}</option>`).join('');
  openDrawer({
    title: isNew ? 'Nouveau challenge' : 'Modifier le challenge',
    subtitle: isNew ? 'Les membres le voient sur l’accueil et dans le menu Autres dès sa création, avec un compte à rebours jusqu’au début.' : v.title,
    submitLabel: isNew ? 'Créer le challenge' : 'Enregistrer les modifications',
    wide: true,
    body: `<div class="adc-form" id="wch-form">
      <div class="adc-grid">
        <div class="field adc-wide"><label for="wch-title">Nom</label><input id="wch-title" type="text" maxlength="120" required autocomplete="off" value="${esc(v.title ?? '')}"><p class="small muted counter" id="wch-title-n">${esc(String((v.title || '').length))} / 120</p></div>
        <div class="field adc-wide"><label for="wch-how">Comment : les consignes</label><textarea id="wch-how" rows="3" maxlength="${MAX.how_to}">${esc(v.how_to ?? '')}</textarea></div>
        <div class="field adc-wide"><label for="wch-why">Pourquoi</label><textarea id="wch-why" rows="2" maxlength="${MAX.why}">${esc(v.why ?? '')}</textarea></div>
        <div class="field"><label for="wch-type">Type de réponse attendue</label><select id="wch-type"${dis('answer_type')}>${types}</select></div>
        <div class="field"><label for="wch-max">Participations par membre</label><input id="wch-max" type="number" min="1" max="10" step="1" inputmode="numeric" value="${esc(String(v.max_entries ?? 1))}"${dis('max_entries')}><p class="small muted">De 1 à 10.</p></div>
        <div class="field"><label for="wch-start">Début de la participation (heure suisse)</label><input id="wch-start" type="datetime-local" value="${toZurichInput(v.starts_at)}"${dis('starts_at')}></div>
        <div class="field"><label for="wch-end">Fin de la participation (heure suisse)</label><input id="wch-end" type="datetime-local" value="${toZurichInput(v.ends_at)}"${dis('ends_at')}></div>
        <div class="field"><label for="wch-vote">Durée du vote (jours)</label><input id="wch-vote" type="number" min="1" max="14" step="1" inputmode="numeric" value="${esc(String(v.vote_days ?? 2))}"${dis('vote_days')}><p class="small muted">Le vote commence à la fin de la participation.</p></div>
        <div class="field"><label for="wch-pa">Gain : Paillettes</label><input id="wch-pa" type="number" min="0" max="${MAX.paillettes}" step="1" inputmode="numeric" value="${esc(String(v.reward_paillettes ?? 0))}"${dis('reward_paillettes')}><p class="small muted">Versées automatiquement au gagnant à la fin du vote.</p></div>
        <div class="field adc-wide"><label for="wch-lot">Lot en plus <span class="small muted">(facultatif, remis à la main)</span></label><input id="wch-lot" type="text" maxlength="${MAX.reward_text}" autocomplete="off" value="${esc(v.reward_text ?? '')}" placeholder="ex. un resto offert"></div>
      </div>
      ${fz.size ? `<p class="small muted" id="wch-fige">${I('lock', 16)} Les champs grisés ne changent plus : ${r.closed_at || ['termine', 'sans_gagnant', 'attente'].includes(r.phase) ? 'le challenge est clos' : new Date(r.ends_at) <= Date.now() ? 'la participation est finie' : 'des membres ont déjà participé'}.</p>` : ''}
      <p class="chl-recap" id="wch-recap" aria-live="polite"></p>
      <p class="form-error" id="wch-error" role="alert" hidden></p>
    </div>`,
    onSubmit: (form) => save(form, r),
  });
  const f = document.getElementById('wch-form');
  if (!f) return;
  const maj = () => {
    $('#wch-title-n', f).textContent = `${$('#wch-title', f).value.length} / ${MAX.title}`;
    $('#wch-recap', f).innerHTML = recapHtml(f);
  };
  f.addEventListener('input', maj);
  f.addEventListener('change', maj);
  maj();
}

/** Lit et contrôle le formulaire. */
function readForm(f) {
  const title = $('#wch-title', f).value.trim();
  const how_to = $('#wch-how', f).value.trim();
  const why = $('#wch-why', f).value.trim();
  const answer_type = $('#wch-type', f).value;
  const max_entries = Number($('#wch-max', f).value);
  const starts_at = fromZurichInput($('#wch-start', f).value);
  const ends_at = fromZurichInput($('#wch-end', f).value);
  const vote_days = Number($('#wch-vote', f).value);
  const reward_paillettes = Number($('#wch-pa', f).value || 0);
  const reward_text = $('#wch-lot', f).value.trim();
  if (!title || title.length > MAX.title) return { error: `Donne un nom (${MAX.title} caractères au plus).` };
  if (how_to.length > MAX.how_to) return { error: `Les consignes dépassent ${nf.format(MAX.how_to)} caractères.` };
  if (why.length > MAX.why) return { error: `Le « pourquoi » dépasse ${nf.format(MAX.why)} caractères.` };
  if (!TYPES[answer_type]) return { error: 'Choisis le type de réponse attendue.' };
  if (!Number.isInteger(max_entries) || max_entries < 1 || max_entries > 10) return { error: 'Le nombre de participations par membre va de 1 à 10.' };
  if (!starts_at || !ends_at) return { error: 'Indique le début et la fin de la participation.' };
  if (new Date(ends_at) <= new Date(starts_at)) return { error: 'La fin de la participation doit être après son début.' };
  if (!Number.isInteger(vote_days) || vote_days < 1 || vote_days > 14) return { error: 'La durée du vote va de 1 à 14 jours.' };
  if (!Number.isInteger(reward_paillettes) || reward_paillettes < 0 || reward_paillettes > MAX.paillettes) return { error: `Le gain va de 0 à ${nf.format(MAX.paillettes)} Paillettes.` };
  if (reward_text.length > MAX.reward_text) return { error: `Le lot fait ${MAX.reward_text} caractères au plus.` };
  return { row: { title, how_to: how_to || null, why: why || null, answer_type, max_entries, starts_at, ends_at, vote_days, reward_paillettes, reward_text: reward_text || null } };
}

/** Récapitulatif en direct sous le formulaire (dates en heure suisse, gain). */
function recapHtml(f) {
  const s = fromZurichInput($('#wch-start', f).value), e = fromZurichInput($('#wch-end', f).value);
  const jours = Number($('#wch-vote', f).value) || 0;
  if (!s || !e || new Date(e) <= new Date(s) || jours < 1) return `${I('cal')} <span>Indique des dates valides pour voir le déroulé.</span>`;
  const fin = new Date(new Date(e).getTime() + jours * 864e5).toISOString();
  const gain = gainTexte({ reward_paillettes: Number($('#wch-pa', f).value) || 0, reward_text: $('#wch-lot', f).value });
  return `${I('cal')} <span>Participation du <strong>${esc(quand(s))}</strong> au <strong>${esc(quand(e))}</strong>, puis vote jusqu’au <strong>${esc(quand(fin))}</strong>. ${gain ? `Le gagnant reçoit ${esc(gain)} ; ex æquo, chacun reçoit le gain complet.` : 'Pas de gain.'}</span>`;
}

/** Enregistre (insertion ou mise à jour des seuls champs modifiables) ; false garde le tiroir ouvert. */
async function save(f, r) {
  const err = $('#wch-error', f);
  const res = readForm(f);
  if (res.error) { err.textContent = res.error; err.hidden = false; return false; }
  err.hidden = true;
  const row = { ...res.row };
  for (const k of figes(r)) delete row[k]; // champs figés : jamais renvoyés (la base les refuserait)
  try {
    const { error } = r
      ? await sb.from('hg_weekly_challenges').update(row).eq('id', r.id)
      : await sb.from('hg_weekly_challenges').insert(row);
    if (error) throw error;
    toast(r ? 'Challenge mis à jour.' : `Challenge créé. La participation ouvre le ${quand(row.starts_at)}.`, 'ok');
    await (W.detail ? openFiche(W.detail.challenge.id) : reloadList());
  } catch (ex) {
    err.textContent = errMsg(ex);
    err.hidden = false;
    return false;
  }
}

/** Ligne complète d'un challenge pour le tiroir (la liste a déjà toutes les colonnes ; sinon lecture directe). */
async function rowFor(id) {
  const fromList = W.rows.find((x) => x.id === id);
  if (fromList) return fromList;
  const { data, error } = await sb.from('hg_weekly_challenges').select('*').eq('id', id).maybeSingle();
  if (error || !data) return null;
  const d = W.detail?.challenge?.id === id ? W.detail : null;
  return { ...data, phase: d?.challenge?.phase, entries_count: d ? d.entries.length : 0 };
}

/* ---------- Fiche de suivi ---------- */
/** Ouvre la fiche d'un challenge (hg_wch_admin_detail). */
async function openFiche(id) {
  W.root.innerHTML = '<div class="adc chl-fiche"><div class="empty">Chargement du challenge…</div></div>';
  try {
    const { data, error } = await sb.rpc('hg_wch_admin_detail', { p_challenge: id });
    if (error) throw error;
    if (!data?.challenge) throw new Error('Challenge introuvable');
    W.detail = { challenge: data.challenge, entries: Array.isArray(data.entries) ? data.entries : [], voters: Number(data.voters_count) || 0, winners: data.winners || [] };
    renderFiche();
  } catch (e) {
    W.root.innerHTML = `<div class="adc chl-fiche"><a class="btn btn-ghost btn-sm chl-back" href="${ROUTE}">← Tous les challenges</a><div class="empty">Impossible de charger ce challenge : ${esc(errMsg(e))}</div></div>`;
  }
}

/** Reste avant une date, en clair (« 1 j 6 h », « 3 h 12 min »). */
function resteCourt(iso) {
  const [d, h, m] = resteParts(iso);
  return d ? `${d} j ${h} h` : `${h} h ${m} min`;
}

/** Dessine la fiche ouverte. */
function renderFiche() {
  const { challenge: c, entries, voters, winners } = W.detail;
  const ph = c.phase;
  const t = typeOf(c.answer_type);
  const gain = gainTexte(c);
  const membres = new Set(entries.map((e) => e.user_id)).size;
  const total = entries.reduce((s, e) => s + (Number(e.votes) || 0), 0);
  const choix = ph === 'attente';
  const winIds = new Set(winners.map((w) => w.entry_id));
  const stats = [[nf.format(entries.length), 'participations'], [nf.format(membres), 'membres']];
  if (ph === 'vote') stats.push([nf.format(total), `voix sur ${pluriel(membres, 'participant')}`], [resteCourt(c.vote_ends_at), 'avant la fin du vote']);
  else if (ph === 'participation') stats.push([resteCourt(c.ends_at), 'avant la fin de la participation']);
  else if (ph !== 'a_venir') stats.push([nf.format(total), `voix de ${pluriel(voters, 'votant')}`]);
  const fin = ['vote', 'participation', 'a_venir'].includes(ph) ? `vote jusqu’au ${dateLongue(c.vote_ends_at)}` : `vote terminé le ${dateLongue(c.vote_ends_at)}`;
  const gagnantsTxt = winners.length ? `<p class="small">${I('trophy', 16)} ${winners.length > 1 ? 'Gagnants ex æquo' : 'Gagnant'} : ${winners.map((w) => `<strong>${esc(w.pseudo || 'un membre')}</strong>${w.chosen_by_admin ? ' (choisi par l’admin)' : ''}`).join(', ')}${gain ? ` · ${esc(gain)}${winners.every((w) => w.credited_at) ? ' versé' : ''}` : ''}</p>` : '';

  const rows = entries.map((e, i) => {
    const fichier = e.path ? fileLinkHtml(e) : `<span class="sf-item">${thumbHtml(e)}<span class="sf-name">Texte · ${esc(pluriel(String(e.body || '').trim().split(/\s+/).filter(Boolean).length, 'mot'))}</span></span>`;
    const leg = e.caption || (e.body ? String(e.body).slice(0, 140) : '');
    const fin = choix
      ? `<label class="chl-adm-pick"><input type="radio" name="wch-gagnant" value="${esc(e.id)}" data-pseudo="${esc(e.pseudo || 'ce membre')}"> Gagnant</label>`
      : `<span class="chl-adm-v"><strong>${nf.format(Number(e.votes) || 0)}</strong> voix${winIds.has(e.id) ? ` ${I('trophy', 16)}` : ''}</span>${RETRAIT.has(ph) ? `<button class="btn btn-danger btn-sm" type="button" data-action="wch-rm" data-id="${esc(e.id)}" aria-label="Retirer la participation de ${esc(e.pseudo || 'ce membre')}">Retirer</button>` : '<span></span>'}`;
    return `<li class="chl-adm-row">
      <span class="chl-adm-who">${avatarHtml({ pseudo: e.pseudo, avatar_url: e.avatar_url, color: e.color }, 32)}<strong>${esc(e.pseudo || 'Un membre')}</strong></span>
      ${fichier}
      <span class="chl-adm-leg small">${esc(leg)}<span class="muted"> · N° ${i + 1} · envoyée le ${esc(dateLongue(e.created_at))}</span></span>
      ${fin}
    </li>`;
  }).join('');

  W.root.innerHTML = `<div class="adc chl-fiche">
    <a class="btn btn-ghost btn-sm chl-back" href="${ROUTE}">← Tous les challenges</a>
    <article class="card adc-row" aria-labelledby="wch-f-t">
      <div class="adc-row-head"><h3 class="adc-row-title" id="wch-f-t">${esc(c.title)}</h3>${pillHtml(ph)}</div>
      <p class="small muted">${esc(t.label)} · ${esc(pluriel(Number(c.max_entries) || 1, 'participation'))} par membre${gain ? ` · ${esc(gain)}` : ''} · participation du ${esc(dateLongue(c.starts_at))} au ${esc(dateLongue(c.ends_at))} · ${esc(fin)}</p>
      <dl class="chl-stats">${stats.map(([v, l]) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      ${gagnantsTxt}
      <div class="btn-row">
        <a class="btn btn-ghost" href="/pages/compte/challenge.html" target="_blank" rel="noopener">Voir la page des membres</a>
        ${ph !== 'annule' ? `<button class="btn btn-ghost" type="button" data-action="wch-edit" data-id="${esc(c.id)}">Modifier</button>` : ''}
        ${VIVANT.has(ph) ? `<button class="btn btn-danger btn-sm" type="button" data-action="wch-cancel" data-id="${esc(c.id)}">Annuler le challenge</button>` : ''}
      </div>
    </article>
    ${choix ? `<section class="card chl-pick" aria-labelledby="wch-pick-t">${I('warn', 22)}<div><h3 id="wch-pick-t">Aucune voix : choisis le gagnant</h3><p class="small">Personne n’a voté pendant ${esc(pluriel(Number(c.vote_days) || 1, 'jour'))}. Choisis la participation gagnante dans la liste : son auteur reçoit ${gain ? esc(gain) : 'le titre'} tout de suite et une notification. Les membres voient « Choisi par l’admin » à côté du gagnant.</p></div></section>` : ''}
    <section class="card" aria-labelledby="wch-parts-t">
      <div class="adc-row-head"><h3 class="adc-row-title" id="wch-parts-t">Participations</h3><span class="small muted">${ph === 'vote' || ph === 'participation' ? 'Pseudos et voix visibles par l’admin seulement pendant le challenge' : 'Pseudos et voix'}</span></div>
      ${entries.length ? `<ul class="chl-adm-list">${rows}</ul>` : '<p class="small muted">Aucune participation.</p>'}
      ${choix ? `<div class="btn-row chl-pick-actions"><button class="btn btn-primary" type="button" data-action="wch-pick" id="wch-pick-go" disabled>Choisis un gagnant</button><button class="btn btn-ghost" type="button" data-action="wch-nowin">Terminer sans gagnant</button></div>` : ''}
    </section>
  </div>`;
  hydrateMedia(W.root);
}

/* ---------- Actions ---------- */
/** Choix d'un gagnant : le bouton reprend le pseudo choisi. */
function onChange(e) {
  if (e.target.name !== 'wch-gagnant') return;
  const b = $('#wch-pick-go', W.root);
  if (b) { b.disabled = false; b.textContent = `Désigner gagnant : ${e.target.dataset.pseudo}`; }
}

/** Clics de la section (nouveau, modifier, annuler, supprimer, retirer, choisir). */
async function onClick(e) {
  const t = e.target.closest('[data-action]');
  if (!t || t.disabled) return;
  const a = t.dataset.action, id = t.dataset.id;
  if (a === 'wch-new') return openForm(null);
  if (a === 'wch-edit') { const r = await rowFor(id); if (r) openForm(r); else toast('Challenge introuvable.', 'error'); return; }
  if (a === 'wch-cancel') return cancelChallenge(t, id);
  if (a === 'wch-del') return deleteChallenge(t, id);
  if (a === 'wch-rm') return removeEntry(t, id);
  if (a === 'wch-pick') return pick(t, W.root.querySelector('input[name="wch-gagnant"]:checked'));
  if (a === 'wch-nowin') return pick(t, null);
}

/** Titre d'un challenge (liste ou fiche). */
const titreDe = (id) => W.rows.find((x) => x.id === id)?.title || W.detail?.challenge?.title || 'ce challenge';

/** Annule un challenge (cancelled_at) : il disparaît de la page des membres, rien n'est versé. */
async function cancelChallenge(btn, id) {
  const ok = await confirmBox(`Annuler le challenge « ${titreDe(id)} » ?`,
    'Il disparaît de la page des membres et de l’accueil, le vote s’arrête et aucun gain n’est versé. Les participations restent visibles ici. Cette action est définitive.',
    { ok: 'Annuler le challenge', danger: true });
  if (!ok) return;
  setBusy(btn, true);
  const { error } = await sb.from('hg_weekly_challenges').update({ cancelled_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast(errMsg(error), 'error'); setBusy(btn, false); return; }
  toast('Challenge annulé.', 'ok');
  await (W.detail ? openFiche(id) : reloadList());
}

/** Supprime un challenge sans participation. */
async function deleteChallenge(btn, id) {
  const ok = await confirmBox(`Supprimer le challenge « ${titreDe(id)} » ?`, 'Il n’a aucune participation : il disparaît complètement. Cette action est définitive.',
    { ok: 'Supprimer le challenge', danger: true });
  if (!ok) return;
  setBusy(btn, true);
  const { error } = await sb.from('hg_weekly_challenges').delete().eq('id', id);
  if (error) { toast(errMsg(error), 'error'); setBusy(btn, false); return; }
  toast('Challenge supprimé.', 'ok');
  await reloadList();
}

/** Retire une participation (motif obligatoire, envoyé au membre), puis supprime son fichier. */
async function removeEntry(btn, entryId) {
  const e = W.detail?.entries.find((x) => x.id === entryId);
  if (!e) return;
  const qui = e.pseudo || 'ce membre';
  const v = Number(e.votes) || 0;
  const voix = v ? ` ${v > 1 ? `Ses ${v} voix sont annulées : les membres qui l’avaient choisie peuvent` : 'Sa voix est annulée : le membre qui l’avait choisie peut'} voter pour une autre.` : '';
  const motif = await confirmBox(`Retirer la participation de ${qui} ?`,
    `Elle disparaît de la page et du vote.${voix} ${qui} reçoit une notification avec le motif.${e.path ? ' Le fichier est supprimé.' : ''} Cette action est définitive.`,
    { ok: 'Retirer la participation', danger: true, input: { label: `Motif envoyé à ${qui}`, placeholder: 'ex. image qui n’est pas de toi', required: true } });
  if (!motif) return;
  if (String(motif).length < 3 || String(motif).length > 300) { toast('Le motif fait de 3 à 300 caractères.', 'error'); return; }
  setBusy(btn, true);
  const { data, error } = await sb.rpc('hg_wch_admin_remove', { p_entry: entryId, p_reason: String(motif) });
  if (error) { toast(errMsg(error), 'error'); setBusy(btn, false); return; }
  await removeEntryFiles([typeof data === 'string' && data ? data : e.path]);
  toast(`Participation de ${qui} retirée.`, 'ok');
  await openFiche(W.detail.challenge.id);
}

/** Désigne le gagnant (radio cochée) ou termine sans gagnant (input null). */
async function pick(btn, input) {
  const c = W.detail?.challenge;
  if (!c) return;
  if (input) {
    const ok = await confirmBox(`Désigner ${input.dataset.pseudo} gagnant ?`,
      `${gainTexte(c) ? `${input.dataset.pseudo} reçoit ${gainTexte(c)} tout de suite et` : `${input.dataset.pseudo} reçoit`} une notification. Les membres voient « Choisi par l’admin ». Cette action est définitive.`,
      { ok: 'Désigner le gagnant' });
    if (!ok) return;
  } else {
    const ok = await confirmBox('Terminer sans gagnant ?', 'Aucun gain n’est versé. Les membres voient « Sans gagnant ». Cette action est définitive.', { ok: 'Terminer sans gagnant', danger: true });
    if (!ok) return;
  }
  setBusy(btn, true);
  const { error } = await sb.rpc('hg_wch_admin_pick', { p_challenge: c.id, p_entry: input ? input.value : null });
  if (error) { toast(errMsg(error), 'error'); setBusy(btn, false); return; }
  toast(input ? 'Gagnant désigné.' : 'Challenge terminé sans gagnant.', 'ok');
  await openFiche(c.id);
}

