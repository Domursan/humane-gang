// ===== Humane Gang — page « Calendrier du gang » (/pages/irl/calendrier.html, idée V8) =====
/*
 * Rôle : vue mois de tous les rendez-vous du gang : sorties IRL, séances du ciné-club, rendez-vous récurrents des
 * groupes (CK3 du jeudi, F1 du dimanche…), anniversaires partagés (jour et mois seulement) et dates du site
 * (Secret Santa, événements déjà lancés). Pastilles de couleur par type (3 au plus, puis « +N »), filtres, liste du jour
 * choisi, export d'un rendez-vous dans son agenda, abonnement personnel (adresse ICS à coller dans son agenda).
 * Rendez-vous récurrents : création, modification et retrait par leur auteur (ou le Staff « evenements »), annulation
 * d'une date précise.
 * Événements ponctuels (Staff « evenements » ou admin, migration 098) : ajout, modification et retrait, avec heure
 * facultative, lieu, lien https et note. Affichés comme les autres éléments « site ».
 * Données : RPC hg_calendar (période ≤ 62 jours), table hg_gang_slots (lecture), RPC hg_gang_slot_save,
 * hg_gang_slot_archive, hg_gang_slot_skip, hg_calendar_token_me, hg_calendar_token_reset (migration 087).
 * Événements ponctuels : RPC hg_cal_can_manage (droit de gestion), hg_cal_event_save, hg_cal_event_remove (migration 098).
 * Téléphone (600 px et moins, seuil commun des pages, idées 70 et 71) : le mois s'affiche en liste des jours qui ont quelque chose (jours passés repliés,
 * aujourd'hui toujours affiché), avec un choix Liste / Grille retenu sur l'appareil. Au-dessus, la grille seule.
 * Fuseau : tout en heure de Zurich. Les filtres et le choix Liste / Grille sont mémorisés dans le navigateur (localStorage, facultatif).
 * Dépendances : core.js, ics.js (export d'un rendez-vous), icons.js, ui-confirm.js, config.js (adresse du flux).
 * Page réservée aux membres (auth: 'member'). N'exporte rien.
 */
import { sb, initPage, esc, $, errMsg, toast, hasPerm } from '../../commun/core.js';
import { addToCalendar } from './ics.js';
import { svg } from '../../commun/icons.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { SUPABASE_URL } from '../../commun/config.js';

/* ---------- Initialisation ---------- */
const me = await initPage({ auth: 'member' });
const app = $('#app');

/* ---------- Constantes ---------- */
const TZ = 'Europe/Zurich';
/** Types affichés : libellé du filtre, libellé long, variable de couleur (base.css). */
const TYPES = {
  irl: { label: 'IRL', long: 'Sortie IRL', color: 'var(--sand)' },
  soiree: { label: 'Soirées', long: 'Soirée', color: 'var(--sage)' },
  cine: { label: 'Ciné', long: 'Ciné-club', color: 'var(--plum)' },
  groupe: { label: 'Groupes', long: 'Rendez-vous', color: 'var(--slate)' },
  anniv: { label: 'Anniv.', long: 'Anniversaire', color: 'var(--rose)' },
  site: { label: 'Site', long: 'Sur le site', color: 'var(--rust)' },
};
const SLOT_KINDS = { groupe: 'Groupe de jeu', soiree: 'Soirée', sport: 'Sport', autre: 'Autre' };
const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MAX_DOTS = 3;
const LS_FILTERS = 'hg_cal_filters';
const LS_VUE = 'hg_cal_vue';
/** Téléphone : seuil de la liste du mois (le même que celui de la grille compacte dans calendrier.css). */
const MQ_TEL = matchMedia('(max-width: 600px)');
const I = {
  prev: svg('prev', { size: 18 }), next: svg('next', { size: 18 }), cal: svg('cal', { size: 18 }), plus: svg('plus', { size: 18 }),
  edit: svg('edit', { size: 16 }), trash: svg('trash', { size: 16 }), copy: svg('copy', { size: 16 }), link: svg('link', { size: 16 }),
  close: svg('close', { size: 20 }), undo: svg('undo', { size: 16 }), down: svg('download', { size: 16 }),
  list: svg('list', { size: 18 }), grid: svg('grid', { size: 18 }),
};
const canStaff = hasPerm('evenements');

/* ---------- Dates (chaînes AAAA-MM-JJ, calculs en UTC à midi pour éviter les décalages) ---------- */
const p2 = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
/** Aujourd'hui à Zurich (AAAA-MM-JJ). */
const todayZ = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)); };
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Jour de la semaine ISO (1 = lundi … 7 = dimanche). */
const isoDow = (s) => ((parse(s).getUTCDay() + 6) % 7) + 1;
/** « samedi 14 novembre » */
const longDay = (s) => { const d = parse(s); return `${WEEKDAYS[isoDow(s) - 1]} ${d.getUTCDate() === 1 ? '1er' : d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
/** Heure à Zurich « 21 h » ou « 20 h 30 ». */
function hour(iso) {
  const [h, m] = new Intl.DateTimeFormat('fr-CH', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)).split(':');
  return `${Number(h)} h${m === '00' ? '' : ` ${m}`}`;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- État ---------- */
const T = todayZ();
const S = {
  y: Number(T.slice(0, 4)), m: Number(T.slice(5, 7)), sel: T,
  items: [], slots: [], loading: true, error: null, canManage: false,
  off: new Set(readFilters()),
  vue: readVue(), passes: false, // téléphone : 'liste' ou 'grille' ; jours passés du mois dépliés dans la liste
};
/** Filtres masqués mémorisés (facultatif : stockage parfois indisponible). */
function readFilters() { try { const v = JSON.parse(localStorage.getItem(LS_FILTERS) || '[]'); return Array.isArray(v) ? v.filter((k) => k in TYPES) : []; } catch { return []; } }
function saveFilters() { try { localStorage.setItem(LS_FILTERS, JSON.stringify([...S.off])); } catch { /* sans importance */ } }
/** Choix Liste / Grille du téléphone, retenu sur l'appareil (liste par défaut). */
function readVue() { try { return localStorage.getItem(LS_VUE) === 'grille' ? 'grille' : 'liste'; } catch { return 'liste'; } }
function saveVue() { try { localStorage.setItem(LS_VUE, S.vue); } catch { /* sans importance */ } }
/** Vrai quand le mois s'affiche en liste (téléphone et choix « Liste »). */
const enListe = () => MQ_TEL.matches && S.vue === 'liste';

/** Type d'affichage d'un rendez-vous (les rendez-vous récurrents « soirée » prennent la couleur des soirées). */
const typeOf = (it) => (it.kind === 'groupe' && it.meta?.kind === 'soiree' ? 'soiree' : it.kind);

/* ---------- Chargement ---------- */
async function load() {
  S.loading = true; S.error = null;
  const from = ymd(S.y, S.m, 1), to = ymd(S.y, S.m, daysInMonth(S.y, S.m));
  try {
    const [cal, slots] = await Promise.all([
      sb.rpc('hg_calendar', { p_from: from, p_to: to }),
      sb.from('hg_gang_slots').select('id, title, kind, weekday, every_weeks, at_time, starts_on, ends_on, link, created_by, archived_at').is('archived_at', null).order('weekday'),
    ]);
    if (cal.error) throw cal.error;
    S.items = Array.isArray(cal.data) ? cal.data : [];
    S.slots = slots.error ? [] : (slots.data || []);
  } catch (e) {
    S.error = errMsg(e); S.items = [];
  }
  S.loading = false;
  render();
}

/* ---------- Rendu ---------- */
const visible = () => S.items.filter((it) => !S.off.has(typeOf(it)));
const byDay = () => {
  const map = new Map();
  for (const it of visible()) { if (!map.has(it.day)) map.set(it.day, []); map.get(it.day).push(it); }
  return map;
};

function renderFilters() {
  $('#cal-filters').innerHTML = Object.entries(TYPES).map(([k, t]) => `<button type="button" class="cal-chip" data-filter="${k}" aria-pressed="${!S.off.has(k)}">
      <span class="cal-dot" style="--c:${t.color}" aria-hidden="true"></span>${esc(t.label)}</button>`).join('');
}

function renderGrid() {
  const grid = $('#cal-grid');
  $('#cal-title').textContent = `${cap(MONTHS[S.m - 1])} ${S.y}`;
  if (S.error) { grid.innerHTML = `<p class="cal-error" role="alert">Impossible de charger le calendrier : ${esc(S.error)}</p>`; return; }
  const map = byDay();
  const first = ymd(S.y, S.m, 1), lead = isoDow(first) - 1, n = daysInMonth(S.y, S.m);
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell is-empty" role="gridcell" aria-hidden="true"></span>');
  for (let d = 1; d <= n; d++) {
    const day = ymd(S.y, S.m, d), list = map.get(day) || [];
    const dots = list.slice(0, MAX_DOTS).map((it) => `<span class="cal-dot" style="--c:${TYPES[typeOf(it)]?.color || 'var(--muted)'}"></span>`).join('');
    const more = list.length > MAX_DOTS ? `<span class="cal-more">+${list.length - MAX_DOTS}</span>` : '';
    const titles = list.slice(0, MAX_DOTS).map((it) => `<span class="cal-ttl" style="--c:${TYPES[typeOf(it)]?.color}">${esc(it.title)}</span>`).join('');
    const label = `${cap(longDay(day))}${day === T ? ', aujourd’hui' : ''} : ${list.length ? `${list.length} rendez-vous` : 'rien de prévu'}`;
    cells.push(`<span role="gridcell" class="cal-gc"><button type="button" class="cal-cell${day === T ? ' is-today' : ''}${day === S.sel ? ' is-sel' : ''}${list.length ? ' has-items' : ''}"
      data-day="${day}" aria-label="${esc(label)}" aria-pressed="${day === S.sel}">
      <span class="cal-num" aria-hidden="true">${d}</span>
      <span class="cal-dots" aria-hidden="true">${dots}${more}</span>
      <span class="cal-ttls" aria-hidden="true">${titles}${more ? `<span class="cal-more">${more.replace(/<[^>]+>/g, '')}</span>` : ''}</span></button></span>`);
  }
  // Lignes de 7 cellules (role="row") pour la grille ARIA
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<div class="cal-row" role="row">${cells.slice(i, i + 7).join('')}</div>`);
  grid.innerHTML = rows.join('');
}

/** Sous-titre d'un rendez-vous : type, heure, détail. */
function subOf(it) {
  const t = typeOf(it), parts = [it.kind === 'groupe' ? SLOT_KINDS[it.meta?.kind] || TYPES.groupe.long : TYPES[t]?.long || ''];
  if (it.starts_at && !it.all_day) parts.push(hour(it.starts_at));
  if (it.kind === 'irl') parts.push(`${it.meta?.oui || 0} ${Number(it.meta?.oui) > 1 ? 'viennent' : 'vient'}`);
  if (it.kind === 'cine' && it.meta?.status === 'vote') parts.push('vote en cours');
  if (it.kind === 'cine' && Number(it.meta?.presents)) parts.push(`${it.meta.presents} présent${it.meta.presents > 1 ? 's' : ''}`);
  if (it.kind === 'groupe' && Number(it.meta?.every_weeks) > 1) parts.push(`toutes les ${it.meta.every_weeks} semaines`);
  return parts.filter(Boolean).join(' · ');
}

const isMineSlot = (slotId) => { const s = S.slots.find((x) => x.id === slotId); return !!s && (s.created_by === me.id || canStaff); };
const safeHref = (l) => (/^https:\/\//.test(l || '') ? l : /^(\/pages\/[a-z0-9-]+\/)?[a-z0-9-]+\.html([?#][\w=:#.-]*)?$/i.test(l || '') ? l : null);

/** Ligne d'un rendez-vous (liste du jour choisi et liste du mois) : titre, sous-titre, « Ouvrir », agenda, actions de l'auteur. */
function itemHtml(it) {
  const evt = it.meta?.source === 'calendrier' ? it.meta : null;
  // Événement ajouté depuis ce calendrier : pas de « Ouvrir » sans lien https (le lien par défaut est la page elle-même)
  const href = evt && !/^https:\/\//.test(it.link || '') ? null : safeHref(it.link), ext = /^https:/.test(href || '');
  const timed = it.starts_at && !it.all_day;
  const slot = it.kind === 'groupe' ? it.meta?.slot_id : null;
  return `<li class="cal-item"><span class="cal-bar" style="--c:${TYPES[typeOf(it)]?.color}" aria-hidden="true"></span>
    <div class="cal-item-txt"><strong>${esc(it.title)}</strong><span class="small muted">${esc(subOf(it))}</span>
      ${evt?.location ? `<span class="small">Lieu : ${esc(evt.location)}</span>` : ''}
      ${evt?.note ? `<span class="small muted cal-item-note">${esc(evt.note)}</span>` : ''}</div>
    <div class="cal-item-act">
      ${href ? `<a class="btn btn-ghost btn-sm" href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${ext ? I.link : ''}<span>Ouvrir</span></a>` : ''}
      ${timed ? `<button type="button" class="btn btn-ghost btn-sm cal-icon" data-act="ics" data-ref="${esc(it.ref)}" aria-label="Ajouter « ${esc(it.title)} » à mon agenda">${I.down}</button>` : ''}
      ${slot && isMineSlot(slot) ? `<button type="button" class="btn btn-ghost btn-sm" data-act="skip" data-slot="${esc(slot)}" data-day="${esc(it.day)}">Annuler cette date</button>` : ''}
      ${evt && S.canManage ? `<button type="button" class="btn btn-ghost btn-sm" data-act="edit-evt" data-ref="${esc(it.ref)}" aria-label="Modifier « ${esc(it.title)} »">${I.edit}<span>Modifier</span></button>
      <button type="button" class="btn btn-ghost btn-sm" data-act="remove-evt" data-ref="${esc(it.ref)}" aria-label="Retirer « ${esc(it.title)} »">${I.trash}<span>Retirer</span></button>` : ''}
    </div></li>`;
}

function renderDay() {
  const box = $('#cal-day');
  const list = (byDay().get(S.sel) || []);
  box.innerHTML = `<h2 class="cal-day-title" id="cal-day-title">${esc(cap(longDay(S.sel)))}</h2>
    ${list.length ? `<ul class="cal-list">${list.map(itemHtml).join('')}</ul>` : '<p class="muted cal-none">Rien de prévu ce jour-là.</p>'}`;
}

/** Téléphone : le mois en liste. Seuls les jours qui ont un rendez-vous sont listés, plus aujourd'hui (même vide) ;
 *  les jours passés du mois sont repliés derrière « Voir les jours passés ». */
function renderListe() {
  const box = $('#cal-liste');
  box.setAttribute('aria-label', `Rendez-vous de ${MONTHS[S.m - 1]} ${S.y}`);
  box.setAttribute('aria-busy', String(S.loading));
  if (S.loading) {
    box.innerHTML = `<ol class="cal-jours" aria-hidden="true">${'<li class="cal-jour cal-jour-sk"><span class="cal-sk cal-jour-date"></span><span class="cal-jour-corps"><span class="cal-sk cal-sk-titre"></span><span class="cal-sk cal-sk-ligne"></span></span></li>'.repeat(4)}</ol>`;
    return;
  }
  if (S.error) { box.innerHTML = `<p class="cal-error" role="alert">Impossible de charger le calendrier : ${esc(S.error)}</p><button type="button" class="btn btn-ghost" data-act="recharger">Réessayer</button>`; return; }
  const map = byDay();
  if (!visible().length) {
    box.innerHTML = `<div class="cal-liste-vide"><p>Rien de prévu en ${esc(MONTHS[S.m - 1])}${S.off.size ? ' avec ces filtres' : ''}.</p>
      <p class="small muted">Un rendez-vous qui revient chaque semaine ? Ajoute-le avec « Rendez-vous récurrent ».</p></div>`;
    return;
  }
  if (T.startsWith(`${S.y}-${p2(S.m)}`) && !map.has(T)) map.set(T, []);
  const jours = [...map.keys()].sort();
  const passes = jours.filter((d) => d < T), avenir = jours.filter((d) => d >= T);
  const jourHtml = (day) => {
    const list = map.get(day), d = parse(day), auj = day === T;
    return `<li class="cal-jour${auj ? ' is-today' : ''}${day < T ? ' is-passe' : ''}">
      <h2 class="cal-jour-date"><span aria-hidden="true"><span class="cal-jour-dow">${WEEKDAYS[isoDow(day) - 1].slice(0, 3)}.</span><span class="cal-jour-num">${d.getUTCDate()}</span></span>
        <span class="visually-hidden">${esc(cap(longDay(day)))}${auj ? ', aujourd’hui' : ''}</span></h2>
      <div class="cal-jour-corps">${auj ? '<p class="cal-jour-auj" aria-hidden="true">Aujourd’hui</p>' : ''}
        ${list.length ? `<ul class="cal-list">${list.map(itemHtml).join('')}</ul>` : '<p class="muted cal-jour-rien">Rien de prévu</p>'}</div></li>`;
  };
  const bouton = passes.length ? `<button type="button" class="btn btn-ghost cal-passes" data-act="passes" aria-expanded="${S.passes}" aria-controls="cal-jours">${S.passes ? 'Masquer les jours passés' : `Voir ${passes.length > 1 ? `les ${passes.length} jours passés` : 'le jour passé'}`}</button>` : '';
  box.innerHTML = `${bouton}<ol class="cal-jours" id="cal-jours">${(S.passes ? jours : avenir).map(jourHtml).join('')}</ol>`;
}

function renderSlots() {
  const box = $('#cal-slots');
  if (!S.slots.length) { box.innerHTML = '<p class="empty">Aucun rendez-vous récurrent pour l’instant.</p>'; return; }
  box.innerHTML = `<ul class="cal-slot-list">${S.slots.map((s) => {
    const mine = s.created_by === me.id || canStaff;
    const every = Number(s.every_weeks) > 1 ? `toutes les ${s.every_weeks} semaines, le ${WEEKDAYS[s.weekday - 1]}` : `chaque ${WEEKDAYS[s.weekday - 1]}`;
    const until = s.ends_on ? ` jusqu’au ${longDay(s.ends_on).replace(/^\S+ /, '')}` : '';
    return `<li class="cal-slot"><span class="cal-bar" style="--c:${s.kind === 'soiree' ? TYPES.soiree.color : TYPES.groupe.color}" aria-hidden="true"></span>
      <div class="cal-item-txt"><strong>${esc(s.title)}</strong><span class="small muted">${esc(`${SLOT_KINDS[s.kind] || ''} · ${every} à ${String(s.at_time).slice(0, 5).replace(':', ' h ').replace(/ h 00$/, ' h')}${until}`)}</span></div>
      ${mine ? `<div class="cal-item-act">
        <button type="button" class="btn btn-ghost btn-sm" data-act="edit-slot" data-id="${esc(s.id)}" aria-label="Modifier « ${esc(s.title)} »">${I.edit}<span>Modifier</span></button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="archive-slot" data-id="${esc(s.id)}" aria-label="Retirer « ${esc(s.title)} » du calendrier">${I.trash}<span>Retirer</span></button></div>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function render() {
  app.setAttribute('aria-busy', String(S.loading));
  renderFilters(); renderGrid(); renderDay(); renderSlots();
  // Téléphone : liste ou grille selon le choix retenu ; au-dessus de 600 px, toujours la grille et le jour choisi.
  const liste = enListe();
  $('#cal-liste').hidden = !liste;
  $('.cal-grid-wrap').hidden = liste; $('#cal-day').hidden = liste;
  for (const b of document.querySelectorAll('.cal-vue [data-vue]')) b.setAttribute('aria-pressed', String(b.dataset.vue === S.vue));
  if (liste) renderListe();
  const n = visible().length;
  $('#cal-status').textContent = `${cap(MONTHS[S.m - 1])} ${S.y} : ${n} rendez-vous affiché${n > 1 ? 's' : ''}.`;
}

/* ---------- Navigation ---------- */
function go(delta) {
  let m = S.m + delta, y = S.y;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  S.y = y; S.m = m; S.passes = false;
  S.sel = T.startsWith(`${y}-${p2(m)}`) ? T : ymd(y, m, 1);
  load();
}

/* ---------- Abonnement (ICS personnel) ---------- */
const feedUrl = (token) => `${SUPABASE_URL}/functions/v1/hg-calendar?t=${encodeURIComponent(token)}`;

async function openSubscribe() {
  const { data: token, error } = await sb.rpc('hg_calendar_token_me');
  if (error || !token) { toast(`Adresse indisponible : ${errMsg(error)}`, 'error'); return; }
  const dlg = document.createElement('dialog');
  dlg.className = 'hg-dialog cal-dlg';
  dlg.setAttribute('aria-labelledby', 'cal-sub-t');
  const paint = (tok) => {
    const url = feedUrl(tok);
    dlg.innerHTML = `<form method="dialog" class="stack">
      <div class="cal-dlg-head"><h2 class="cal-dlg-title" id="cal-sub-t">S’abonner dans mon agenda</h2>
        <button type="submit" class="btn btn-ghost cal-icon" aria-label="Fermer">${I.close}</button></div>
      <p class="small">Colle cette adresse dans Google Agenda (« Autres agendas › À partir de l’URL »), Calendrier (« Fichier › Nouvel abonnement ») ou Outlook. Les rendez-vous du gang s’y ajoutent et se mettent à jour tout seuls.</p>
      <div class="field"><label for="cal-sub-url">Ton adresse personnelle</label>
        <input id="cal-sub-url" readonly value="${esc(url)}"></div>
      <div class="btn-row">
        <button type="button" class="btn btn-sand" data-dlg="copy">${I.copy}<span>Copier l’adresse</span></button>
        <a class="btn btn-ghost" href="${esc(url.replace(/^https:/, 'webcal:'))}">${I.cal}<span>Ouvrir dans mon agenda</span></a>
      </div>
      <p class="small muted">Cette adresse est personnelle : elle donne accès aux titres des rendez-vous (jamais aux adresses ni aux participants). Si tu l’as partagée par erreur, crée-en une nouvelle : l’ancienne cesse de fonctionner.</p>
      <div class="btn-row"><button type="button" class="btn btn-danger" data-dlg="reset">Créer une nouvelle adresse</button></div>
    </form>`;
  };
  paint(token);
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dlg]');
    if (!b) return;
    if (b.dataset.dlg === 'copy') {
      const v = dlg.querySelector('#cal-sub-url').value;
      try { await navigator.clipboard.writeText(v); toast('Adresse copiée'); } catch { dlg.querySelector('#cal-sub-url').select(); toast('Sélectionnée : copie-la avec Ctrl+C'); }
    } else if (b.dataset.dlg === 'reset') {
      if (!(await confirmBox('Créer une nouvelle adresse ?', 'L’ancienne adresse cessera de fonctionner : il faudra coller la nouvelle dans ton agenda.', { ok: 'Créer', danger: true }))) return;
      const r = await sb.rpc('hg_calendar_token_reset');
      if (r.error) { toast(errMsg(r.error), 'error'); return; }
      paint(r.data); toast('Nouvelle adresse créée');
      dlg.querySelector('#cal-sub-url')?.focus();
    }
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  dlg.querySelector('#cal-sub-url')?.focus();
}

/* ---------- Rendez-vous récurrent : formulaire ---------- */
function openSlot(slot = null) {
  const dlg = document.createElement('dialog');
  dlg.className = 'hg-dialog cal-dlg';
  dlg.setAttribute('aria-labelledby', 'cal-slot-t');
  const v = slot || { title: '', kind: 'groupe', weekday: isoDow(S.sel), every_weeks: 1, at_time: '20:00', starts_on: S.sel < T ? T : S.sel, ends_on: '', link: '' };
  dlg.innerHTML = `<form class="stack" novalidate>
    <div class="cal-dlg-head"><h2 class="cal-dlg-title" id="cal-slot-t">${slot ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous récurrent'}</h2>
      <button type="button" class="btn btn-ghost cal-icon" data-close aria-label="Fermer">${I.close}</button></div>
    <div class="field"><label for="sl-title">Titre</label><input id="sl-title" name="title" maxlength="80" required value="${esc(v.title)}" placeholder="Campagne CK3 Serge"></div>
    <div class="cal-form-row">
      <div class="field"><label for="sl-kind">Type</label><select id="sl-kind" name="kind">${Object.entries(SLOT_KINDS).map(([k, l]) => `<option value="${k}"${v.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label for="sl-every">Fréquence</label><select id="sl-every" name="every_weeks">${[1, 2, 3, 4].map((n) => `<option value="${n}"${Number(v.every_weeks) === n ? ' selected' : ''}>${n === 1 ? 'Chaque semaine' : `Toutes les ${n} semaines`}</option>`).join('')}</select></div>
    </div>
    <div class="cal-form-row">
      <div class="field"><label for="sl-day">Jour</label><select id="sl-day" name="weekday">${WEEKDAYS.map((d, i) => `<option value="${i + 1}"${Number(v.weekday) === i + 1 ? ' selected' : ''}>${cap(d)}</option>`).join('')}</select></div>
      <div class="field"><label for="sl-time">Heure</label><input id="sl-time" name="at_time" type="time" required value="${esc(String(v.at_time).slice(0, 5))}"></div>
    </div>
    <div class="cal-form-row">
      <div class="field"><label for="sl-from">À partir du</label><input id="sl-from" name="starts_on" type="date" value="${esc(v.starts_on || '')}"></div>
      <div class="field"><label for="sl-to">Jusqu’au (facultatif)</label><input id="sl-to" name="ends_on" type="date" value="${esc(v.ends_on || '')}"></div>
    </div>
    <div class="field"><label for="sl-link">Lien (facultatif)</label><input id="sl-link" name="link" type="url" maxlength="300" inputmode="url" value="${esc(v.link || '')}" placeholder="https://discord.com/channels/…" aria-describedby="sl-link-h">
      <p class="small muted" id="sl-link-h">Un salon Discord, une page de règles… Adresse en https:// seulement.</p></div>
    <p class="cal-form-err" role="alert" hidden></p>
    <div class="btn-row cal-form-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-sand">${slot ? 'Enregistrer' : 'Ajouter au calendrier'}</button></div>
  </form>`;
  const form = dlg.querySelector('form'), err = dlg.querySelector('.cal-form-err');
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (!String(f.title).trim()) { err.textContent = 'Donne un titre au rendez-vous.'; err.hidden = false; form.title.focus(); return; }
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true; err.hidden = true;
    const payload = { ...(slot ? { id: slot.id } : {}), title: String(f.title).trim(), kind: f.kind, weekday: Number(f.weekday), every_weeks: Number(f.every_weeks),
      at_time: f.at_time, starts_on: f.starts_on || null, ends_on: f.ends_on || null, link: String(f.link || '').trim() || null };
    const { error } = await sb.rpc('hg_gang_slot_save', { p: payload });
    btn.disabled = false;
    if (error) { err.textContent = errMsg(error); err.hidden = false; return; }
    dlg.close(); toast(slot ? 'Rendez-vous modifié' : 'Rendez-vous ajouté au calendrier'); load();
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  dlg.showModal();
  form.title.focus();
}

/* ---------- Événement ponctuel : formulaire (migration 098) ---------- */
/** Ouvre le formulaire d'un événement ponctuel ; ev = { id, title, day, time, location, link, note } pour une modification. */
function openEvent(ev = null) {
  const back = document.activeElement;
  const dlg = document.createElement('dialog');
  dlg.className = 'hg-dialog cal-dlg';
  dlg.setAttribute('aria-labelledby', 'cal-ev-t');
  const v = ev || { title: '', day: S.sel, time: '', location: '', link: '', note: '' };
  dlg.innerHTML = `<form class="stack" novalidate>
    <div class="cal-dlg-head"><h2 class="cal-dlg-title" id="cal-ev-t">${ev ? 'Modifier l’événement' : 'Nouvel événement'}</h2>
      <button type="button" class="btn btn-ghost cal-icon" data-close aria-label="Fermer">${I.close}</button></div>
    <div class="field"><label for="ev-title">Titre</label><input id="ev-title" name="title" maxlength="120" required value="${esc(v.title)}" placeholder="Anniversaire de Léa"></div>
    <div class="cal-form-row">
      <div class="field"><label for="ev-day">Jour</label><input id="ev-day" name="day" type="date" required value="${esc(v.day)}"></div>
      <div class="field"><label for="ev-time">Heure (facultatif)</label><input id="ev-time" name="time" type="time" value="${esc(v.time || '')}" aria-describedby="ev-time-h">
        <p class="small muted" id="ev-time-h">Vide : toute la journée.</p></div>
    </div>
    <div class="field"><label for="ev-loc">Lieu (facultatif)</label><input id="ev-loc" name="location" maxlength="200" value="${esc(v.location || '')}" placeholder="Chez Lila"></div>
    <div class="field"><label for="ev-link">Lien (facultatif)</label><input id="ev-link" name="link" type="url" maxlength="500" inputmode="url" value="${esc(v.link || '')}" placeholder="https://discord.com/channels/…" aria-describedby="ev-link-h">
      <p class="small muted" id="ev-link-h">Adresse en https:// seulement.</p></div>
    <div class="field"><label for="ev-note">Note (facultatif)</label><textarea id="ev-note" name="note" maxlength="500" rows="3">${esc(v.note || '')}</textarea></div>
    <p class="cal-form-err" role="alert" hidden></p>
    <div class="btn-row cal-form-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-sand">${ev ? 'Enregistrer' : 'Ajouter au calendrier'}</button></div>
  </form>`;
  const form = dlg.querySelector('form'), err = dlg.querySelector('.cal-form-err');
  const fail = (m, el) => { err.textContent = m; err.hidden = false; el?.focus(); };
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) dlg.close(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const title = String(f.title).trim(), link = String(f.link || '').trim();
    if (!title) { fail('Donne un titre à l’événement.', form.title); return; }
    if (!f.day) { fail('Choisis le jour.', form.day); return; }
    if (link && !/^https:\/\//.test(link)) { fail('Le lien doit commencer par https://', form.link); return; }
    const btn = form.querySelector('[type="submit"]'); btn.disabled = true; err.hidden = true;
    const payload = { ...(ev ? { id: ev.id } : {}), title, day: String(f.day), time: String(f.time || ''),
      location: String(f.location || '').trim(), link, note: String(f.note || '').trim() };
    const { error } = await sb.rpc('hg_cal_event_save', { p: payload });
    btn.disabled = false;
    if (error) { fail(errMsg(error)); return; }
    dlg.close(); toast(ev ? 'Événement modifié' : 'Événement ajouté');
    if (!ev) { S.y = Number(payload.day.slice(0, 4)); S.m = Number(payload.day.slice(5, 7)); S.sel = payload.day; } // on affiche le mois du nouvel événement
    load();
  });
  dlg.addEventListener('close', () => { dlg.remove(); back?.focus?.(); });
  document.body.append(dlg);
  dlg.showModal();
  form.title.focus();
}

/** Droit de gestion des événements ponctuels (hg_cal_can_manage) : affiche le bouton d'ajout et les actions. */
async function loadCanManage() {
  try {
    const { data, error } = await sb.rpc('hg_cal_can_manage');
    S.canManage = !error && data === true;
  } catch { S.canManage = false; }
  const addEvt = $('#cal-add-evt'); // absent si une ancienne copie de la page est encore en cache
  if (addEvt) addEvt.hidden = !S.canManage;
  render();
}

/* ---------- Événements ---------- */
$('#cal-prev').innerHTML = I.prev; $('#cal-next').innerHTML = I.next;
$('#cal-sub').innerHTML = `${I.cal}<span>S’abonner dans mon agenda</span>`;
$('#cal-add').innerHTML = `${I.plus}<span>Rendez-vous récurrent</span>`;
// Bouton « Ajouter un événement » : créé ici s'il manque (ancienne copie de /pages/irl/calendrier.html en cache).
if (!$('#cal-add-evt')) $('#cal-add')?.insertAdjacentHTML('afterend', '<button type="button" class="btn btn-ghost" id="cal-add-evt" hidden></button>');
$('#cal-add-evt').innerHTML = `${I.plus}<span>Ajouter un événement</span>`;
// Choix Liste / Grille du téléphone : créé ici s'il manque (ancienne copie de la page en cache).
if (!$('#cal-vue-liste')) $('.cal-nav')?.insertAdjacentHTML('beforeend', '<div class="cal-vue" role="group" aria-label="Affichage du mois"><button type="button" class="btn btn-ghost cal-vue-btn" id="cal-vue-liste" data-vue="liste" aria-pressed="false"><span>Liste</span></button><button type="button" class="btn btn-ghost cal-vue-btn" id="cal-vue-grille" data-vue="grille" aria-pressed="false"><span>Grille</span></button></div>');
if (!$('#cal-liste')) $('.cal-grid-wrap')?.insertAdjacentHTML('beforebegin', '<section class="cal-liste" id="cal-liste" aria-label="Rendez-vous du mois" hidden></section>');
$('#cal-vue-liste').insertAdjacentHTML('afterbegin', I.list); $('#cal-vue-grille').insertAdjacentHTML('afterbegin', I.grid);
$('.cal-vue').addEventListener('click', (e) => {
  const b = e.target.closest('[data-vue]'); if (!b || b.dataset.vue === S.vue) return;
  S.vue = b.dataset.vue; saveVue(); render();
});
MQ_TEL.addEventListener('change', render); // rotation ou redimensionnement : liste ou grille selon la largeur
$('#cal-prev').addEventListener('click', () => go(-1));
$('#cal-next').addEventListener('click', () => go(1));
$('#cal-today').addEventListener('click', () => { S.y = Number(T.slice(0, 4)); S.m = Number(T.slice(5, 7)); S.sel = T; load(); });
$('#cal-sub').addEventListener('click', openSubscribe);
$('#cal-add').addEventListener('click', () => openSlot());
$('#cal-add-evt').addEventListener('click', () => openEvent());
$('#cal-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-filter]'); if (!b) return;
  const k = b.dataset.filter;
  if (S.off.has(k)) S.off.delete(k); else S.off.add(k);
  saveFilters(); render();
  $(`#cal-filters [data-filter="${k}"]`)?.focus();
});
$('#cal-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]'); if (!b) return;
  S.sel = b.dataset.day; renderGrid(); renderDay();
  $(`#cal-grid [data-day="${S.sel}"]`)?.focus();
  if (MQ_TEL.matches) $('#cal-day').scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
// Flèches du clavier dans la grille : jour précédent / suivant / semaine.
$('#cal-grid').addEventListener('keydown', (e) => {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
  if (!step || !e.target.closest('[data-day]')) return;
  const d = parse(S.sel); d.setUTCDate(d.getUTCDate() + step);
  const nd = d.toISOString().slice(0, 10);
  e.preventDefault();
  if (nd.slice(0, 7) !== S.sel.slice(0, 7)) return;
  S.sel = nd; renderGrid(); renderDay(); $(`#cal-grid [data-day="${nd}"]`)?.focus();
});
app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'passes') { // liste du mois : déplier ou replier les jours passés
    S.passes = !S.passes; renderListe(); $('#cal-liste [data-act="passes"]')?.focus();
  } else if (act === 'recharger') {
    load();
  } else if (act === 'ics') {
    const it = S.items.find((x) => x.ref === b.dataset.ref); if (!it) return;
    const href = safeHref(it.link);
    addToCalendar({ id: `${it.kind}-${it.ref}`, title: it.title, start: it.starts_at }, href ? new URL(href, location.href).href : location.href);
  } else if (act === 'skip') {
    if (!(await confirmBox('Annuler cette date ?', `${longDay(b.dataset.day)} : le rendez-vous n’aura pas lieu (les autres semaines ne changent pas).`, { ok: 'Annuler la date', cancel: 'Garder' }))) return;
    const { error } = await sb.rpc('hg_gang_slot_skip', { p_id: b.dataset.slot, p_date: b.dataset.day, p_skip: true });
    if (error) toast(errMsg(error), 'error'); else { toast('Date annulée'); load(); }
  } else if (act === 'edit-slot') {
    const s = S.slots.find((x) => x.id === b.dataset.id); if (s) openSlot(s);
  } else if (act === 'archive-slot') {
    const s = S.slots.find((x) => x.id === b.dataset.id); if (!s) return;
    if (!(await confirmBox(`Retirer « ${s.title} » ?`, 'Il disparaît du calendrier de tout le monde, pour toutes les semaines.', { ok: 'Retirer', danger: true }))) return;
    const { error } = await sb.rpc('hg_gang_slot_archive', { p_id: s.id });
    if (error) toast(errMsg(error), 'error'); else { toast('Rendez-vous retiré'); load(); }
  } else if (act === 'edit-evt') {
    const it = S.items.find((x) => x.ref === b.dataset.ref); if (!it) return;
    openEvent({ id: it.meta.event_id, title: it.title, day: it.day, time: it.meta.time || '', location: it.meta.location || '',
      note: it.meta.note || '', link: /^https:\/\//.test(it.link || '') ? it.link : '' });
  } else if (act === 'remove-evt') {
    const it = S.items.find((x) => x.ref === b.dataset.ref); if (!it) return;
    if (!(await confirmBox(`Retirer « ${it.title} » ?`, 'Il disparaît du calendrier de tout le monde.', { ok: 'Retirer', danger: true }))) return;
    const { error } = await sb.rpc('hg_cal_event_remove', { p_id: it.meta.event_id });
    if (error) toast(errMsg(error), 'error'); else { toast('Événement retiré'); load(); }
  }
});

render();
load();
loadCanManage();
