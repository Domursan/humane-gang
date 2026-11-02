// Faux client Supabase des idées V8 (calendrier), V9 (ciné-club) et D3 (commandes slash) : tests/parcours/irl/parcours-v8.cjs, parcours-v9.cjs,
// parcours-d3.cjs. Reprend le faux client du site (fake-sb.mjs, chargé depuis le dépôt) et ajoute les RPC de la migration 087,
// avec les mêmes contrôles que la base (plafonds, bornes, droits) pour que les erreurs affichées soient réalistes.
// Scénario (window.__SCN) : discord (ID Discord enregistré), cineEmpty (aucune séance ni film), cineHost (le membre connecté est projectionniste),
// calFail (hg_calendar en erreur), calEmpty (aucun rendez-vous dans le mois). Expose window.__VD (état simulé) en plus de window.__DB et window.__LOG.
// Exporte createClient(). Servi à la place de supabase-js (voir lib/harness.cjs).
const base = await import(`${location.origin}/tests/fixtures/fake-sb.mjs`);
const S = window.__SCN || {};
const DB = window.__DB;
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const uid = () => S.uid || ME;
const now = Date.now(), iso = (d) => new Date(now + d * 864e5).toISOString();
const TZ = 'Europe/Zurich';
const dayZ = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
const ok = (data) => ({ data, error: null });
const err = (message) => ({ data: null, error: { message } });
const perms = () => { const p = DB.hg_profiles.find((x) => x.id === uid()); const st = (DB.hg_staff || []).find((s) => s.user_id === uid() && s.active); return { admin: !!p?.is_admin, list: st?.perms || [] }; };
const hasPerm = (k) => perms().admin || perms().list.includes(k);

/* ---------- Pages ---------- */
for (const [slug, label, sort] of [['calendrier', 'Calendrier', 10], ['cine', 'Ciné-club', 11]]) {
  if (!DB.hg_pages.some((p) => p.slug === slug)) DB.hg_pages.push({ slug, label, mode: 'membres', in_nav: true, sort });
}
DB.hg_profiles.find((p) => p.id === U(2)).share_birthday = true;
// Scénario discord : le membre connecté a un ID Discord enregistré (ligne « Commandes Discord disponibles » du compte).
if (S.discord) DB.hg_profiles.find((p) => p.id === (S.uid || ME)).discord_id = '111111111111111111';

/* ---------- État simulé ---------- */
const id = (n) => `f0000000-0000-4000-8000-00000000000${n}`;
const VD = window.__VD = {
  slots: DB.hg_gang_slots = [
    { id: 'a1000000-0000-4000-8000-000000000001', title: 'Campagne CK3 Serge', kind: 'groupe', weekday: 4, every_weeks: 1, at_time: '20:00:00', starts_on: dayZ(iso(-30)), ends_on: null, link: null, created_by: ME, archived_at: null },
    { id: 'a1000000-0000-4000-8000-000000000002', title: 'F1 du dimanche', kind: 'autre', weekday: 7, every_weeks: 2, at_time: '14:00:00', starts_on: dayZ(iso(-30)), ends_on: null, link: 'https://discord.com/channels/123456789012345678/123456789012345679', created_by: U(3), archived_at: null },
  ],
  skips: [],
  token: 'a'.repeat(64),
  cfg: { seuil: 4, jour: 0, heure: '20:30', cloture_heures: 22, host_ids: S.cineHost ? [ME] : [U(2)] },
  films: S.cineEmpty ? [] : [
    { id: id(1), title: 'Nope', year: 2022, pitch: 'Le ciel ne sera plus jamais le même', proposed_by: U(2), status: 'en_lice', created_at: iso(-9) },
    { id: id(2), title: 'Spotlight', year: 2015, pitch: null, proposed_by: U(3), status: 'en_lice', created_at: iso(-8) },
    { id: id(3), title: 'Dune : deuxième partie', year: 2024, pitch: null, proposed_by: U(4), status: 'vu', seen_on: dayZ(iso(-7)), created_at: iso(-20) },
    { id: id(4), title: 'Le Seigneur des anneaux', year: 2001, pitch: 'Pour les fans du livre', proposed_by: U(5), status: 'attente', created_at: iso(-3) },
    { id: id(5), title: 'Amélie Poulain', year: 2001, pitch: null, proposed_by: ME, status: 'attente', created_at: iso(-2) },
  ],
  plus: [{ film: id(4), user: U(2) }, { film: id(4), user: U(3) }],
  session: S.cineEmpty ? null : { id: 'c1000000-0000-4000-8000-000000000001', starts_at: iso(3), closes_at: iso(2), status: 'vote', film_id: null, voice_link: 'https://discord.com/channels/123456789012345678/123456789012345680', host_id: U(2), postponed: 0, postponed_at: null, films: [id(1), id(2)] },
  votes: S.cineEmpty ? [] : [{ user: U(2), film: id(1) }, { user: U(3), film: id(1) }, { user: U(4), film: id(2) }],
  presence: S.cineEmpty ? [] : [U(2)],
  reviews: S.cineEmpty ? [] : [
    { film: id(3), user: U(6), stars: 5, body: 'Visuellement fou. Le ver des sables mérite un Oscar.', book_better: true, spoiler: false, hidden: false, updated_at: iso(-6) },
    { film: id(3), user: U(4), stars: 4, body: 'À la fin, Paul devient empereur.', book_better: false, spoiler: true, hidden: false, updated_at: iso(-6.5) },
  ],
  commands: { paillettes: true, carte: true, sortie: true, quiz: true },
};
const isHost = () => VD.cfg.host_ids.includes(uid()) || hasPerm('evenements');
const filmById = (f) => VD.films.find((x) => x.id === f);

/* ---------- Calendrier ---------- */
function calendar(from, to) {
  if (S.calFail) return err('Failed to fetch');
  if (S.calEmpty) return ok([]);
  const items = [];
  const inRange = (d) => d >= from && d <= to;
  // Jour de Zurich + 5 (comme le test) : à partir de l'heure UTC, la sortie tombe la veille entre 23 h et minuit à Zurich
  const ev = { id: 'eeeeeeee-0000-4000-8000-0000000000aa', title: 'Raclette sans raclette à Lausanne', starts_at: new Date(`${dayZ(now + 5 * 864e5)}T11:00:00Z`).toISOString() };
  if (inRange(dayZ(ev.starts_at))) items.push({ kind: 'irl', ref: ev.id, title: ev.title, starts_at: ev.starts_at, all_day: false, day: dayZ(ev.starts_at), link: `/pages/irl/irl.html#event-${ev.id}`, meta: { oui: 6, mine: null } });
  if (VD.session && inRange(dayZ(VD.session.starts_at))) {
    const f = filmById(VD.session.film_id);
    items.push({ kind: 'cine', ref: VD.session.id, title: f ? `Ciné : ${f.title}` : 'Ciné-club : vote en cours', starts_at: VD.session.starts_at, all_day: false, day: dayZ(VD.session.starts_at), link: '/pages/irl/cine.html', meta: { status: VD.session.status, presents: VD.presence.length } });
  }
  const bd = dayZ(iso(10));
  if (inRange(bd)) items.push({ kind: 'anniv', ref: `${U(2)}:${bd.slice(0, 4)}`, title: 'Anniversaire de Alice', starts_at: null, all_day: true, day: bd, link: `/pages/compte/membre.html?id=${U(2)}`, meta: { user_id: U(2) } });
  const ss = dayZ(iso(12));
  if (inRange(ss)) items.push({ kind: 'site', ref: 'ss-echange:E25', title: 'Secret Santa 2025 : échange des cadeaux', starts_at: null, all_day: true, day: ss, link: '/pages/irl/secret-santa.html', meta: {} });
  for (const s of VD.slots.filter((x) => !x.archived_at)) {
    for (let d = new Date(`${from}T12:00:00Z`); dayZ(d) <= to; d = new Date(d.getTime() + 864e5)) {
      const day = d.toISOString().slice(0, 10), dow = ((d.getUTCDay() + 6) % 7) + 1;
      if (dow !== s.weekday || day < s.starts_on || (s.ends_on && day > s.ends_on)) continue;
      if (Math.floor((Date.parse(day) - Date.parse(s.starts_on)) / 864e5 / 7) % s.every_weeks) continue;
      if (VD.skips.some((k) => k.slot === s.id && k.day === day)) continue;
      const [h, m] = s.at_time.split(':').map(Number);
      const st = new Date(`${day}T00:00:00Z`); st.setUTCHours(h - 1, m); // approximation : heure d'hiver (UTC+1)
      items.push({ kind: 'groupe', ref: `${s.id}:${day}`, title: s.title, starts_at: st.toISOString(), all_day: false, day, link: s.link || '/pages/irl/calendrier.html',
        meta: { slot_id: s.id, kind: s.kind, by: s.created_by, every_weeks: s.every_weeks, weekday: s.weekday, at_time: s.at_time.slice(0, 5) } });
    }
  }
  return ok(items.sort((a, b) => a.day.localeCompare(b.day) || String(a.starts_at).localeCompare(String(b.starts_at))));
}

function slotSave(p) {
  const t = String(p?.title || '').trim();
  if (!t || t.length > 80) return err('Titre : de 1 à 80 caractères');
  if (!/^[1-7]$/.test(String(p.weekday))) return err('Jour : de 1 (lundi) à 7 (dimanche)');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(p.at_time || ''))) return err('Heure : format HH:MM');
  if (p.link && !/^https:\/\/\S+$/.test(p.link)) return err('Lien : adresse https:// de 300 caractères au plus');
  if (p.id) {
    const s = VD.slots.find((x) => x.id === p.id);
    if (!s) return err('Rendez-vous introuvable');
    if (s.created_by !== uid() && !hasPerm('evenements')) return err('Seul l’auteur ou le Staff « evenements » peut le modifier');
    Object.assign(s, { title: t, kind: p.kind, weekday: Number(p.weekday), every_weeks: Number(p.every_weeks || 1), at_time: `${p.at_time}:00`, starts_on: p.starts_on || s.starts_on, ends_on: p.ends_on || null, link: p.link || null });
    return ok(s.id);
  }
  if (!hasPerm('evenements') && VD.slots.filter((x) => x.created_by === uid() && !x.archived_at).length >= 5) return err('Tu as déjà 5 rendez-vous récurrents');
  const s = { id: `a1000000-0000-4000-8000-0000000000${String(VD.slots.length + 10).padStart(2, '0')}`, title: t, kind: p.kind || 'groupe', weekday: Number(p.weekday), every_weeks: Number(p.every_weeks || 1),
    at_time: `${p.at_time}:00`, starts_on: p.starts_on || dayZ(new Date()), ends_on: p.ends_on || null, link: p.link || null, created_by: uid(), archived_at: null };
  VD.slots.push(s);
  return ok(s.id);
}

/* ---------- Ciné-club ---------- */
function cineState() {
  const c = VD.session && ['vote', 'fixe'].includes(VD.session.status) ? VD.session : null;
  const plusOf = (f) => VD.plus.filter((p) => p.film === f).length;
  const seenRev = (f) => VD.reviews.filter((r) => r.film === f && !r.hidden);
  return ok({
    cfg: VD.cfg, is_host: isHost(), can_moderate: hasPerm('souvenirs'),
    current: c && { id: c.id, starts_at: c.starts_at, closes_at: c.closes_at, status: c.status, film_id: c.film_id, voice_link: c.voice_link, host_id: c.host_id,
      postponed: c.postponed, postponed_at: c.postponed_at, voters: VD.votes.length, my_vote: VD.votes.find((v) => v.user === uid())?.film || null,
      presence: [...VD.presence],
      films: c.films.map((f) => ({ ...filmById(f), votes: VD.votes.filter((v) => v.film === f).length })) },
    cancelled: null,
    waiting: VD.films.filter((f) => f.status === 'attente').map((f) => ({ ...f, plus: plusOf(f.id), my_plus: VD.plus.some((p) => p.film === f.id && p.user === uid()) }))
      .sort((a, b) => b.plus - a.plus),
    seen: VD.films.filter((f) => f.status === 'vu').map((f) => {
      const rs = seenRev(f.id), st = rs.filter((r) => r.stars);
      const mine = VD.reviews.find((r) => r.film === f.id && r.user === uid());
      return { ...f, avg: st.length ? Math.round((st.reduce((s, r) => s + r.stars, 0) / st.length) * 10) / 10 : null, notes: st.length,
        book_better: rs.filter((r) => r.book_better).length, viewers: 7,
        mine: mine ? { stars: mine.stars, body: mine.body, book_better: mine.book_better, spoiler: mine.spoiler } : null,
        reviews: rs.filter((r) => r.body).map((r) => ({ user_id: r.user, stars: r.stars, body: r.body, spoiler: r.spoiler, book_better: r.book_better, updated_at: r.updated_at })) };
    }),
  });
}

function cineRpc(fn, a) {
  const c = VD.session;
  switch (fn) {
    case 'hg_cine_state': return cineState();
    case 'hg_cine_vote':
      if (!c || c.status !== 'vote') return err('Le vote est clos');
      if (!c.films.includes(a.p_film)) return err('Ce film n’est pas en lice');
      VD.votes = VD.votes.filter((v) => v.user !== uid()); VD.votes.push({ user: uid(), film: a.p_film }); return ok(null);
    case 'hg_cine_presence_set':
      VD.presence = VD.presence.filter((u) => u !== uid()); if (a.p_on) VD.presence.push(uid()); return ok(null);
    case 'hg_cine_plus': {
      const i = VD.plus.findIndex((p) => p.film === a.p_film && p.user === uid());
      if (i >= 0) { VD.plus.splice(i, 1); return ok(false); }
      VD.plus.push({ film: a.p_film, user: uid() }); return ok(true);
    }
    case 'hg_cine_propose': {
      const t = String(a.p_title || '').trim();
      if (!t || t.length > 120) return err('Titre : de 1 à 120 caractères');
      if (VD.films.some((f) => f.status !== 'retire' && f.title.toLowerCase() === t.toLowerCase() && (f.year || 0) === (a.p_year || 0))) return err('Ce film est déjà proposé');
      if (VD.films.filter((f) => f.proposed_by === uid() && f.status === 'attente').length >= 5) return err('Tu as déjà 5 films en attente : attends qu’un passe à l’écran');
      const f = { id: `f0000000-0000-4000-8000-0000000000${VD.films.length + 10}`, title: t, year: a.p_year, pitch: a.p_pitch, proposed_by: uid(), status: 'attente', created_at: new Date().toISOString() };
      VD.films.push(f); return ok(f.id);
    }
    case 'hg_cine_withdraw': { const f = filmById(a.p_film); if (!f || (f.proposed_by !== uid() && !isHost())) return err('Seul l’auteur ou le projectionniste peut retirer ce film'); f.status = 'retire'; return ok(null); }
    case 'hg_cine_review': {
      const f = filmById(a.p_film); if (f?.status !== 'vu') return err('Les avis s’ouvrent après la séance');
      if (a.p_body && a.p_body.length > 280) return err('Avis : 280 caractères au maximum');
      let r = VD.reviews.find((x) => x.film === a.p_film && x.user === uid());
      if (!r) { r = { film: a.p_film, user: uid(), book_better: false, hidden: false }; VD.reviews.push(r); }
      Object.assign(r, { stars: a.p_stars, body: a.p_body, spoiler: !!a.p_spoiler, updated_at: new Date().toISOString() }); return ok(null);
    }
    case 'hg_cine_book_better': {
      let r = VD.reviews.find((x) => x.film === a.p_film && x.user === uid());
      if (!r) { r = { film: a.p_film, user: uid(), stars: null, body: null, spoiler: false, book_better: false, hidden: false, updated_at: new Date().toISOString() }; VD.reviews.push(r); }
      r.book_better = !r.book_better; return ok(r.book_better);
    }
    case 'hg_cine_review_hide': {
      const r = VD.reviews.find((x) => x.film === a.p_film && x.user === a.p_user); if (!r) return ok(null);
      if (a.p_user === uid()) { r.stars = null; r.body = null; return ok(null); }
      if (!hasPerm('souvenirs')) return err('Réservé au Staff « souvenirs »');
      r.hidden = true; return ok(null);
    }
    case 'hg_cine_session_open': {
      if (!isHost()) return err('Réservé au projectionniste');
      if (c && ['vote', 'fixe'].includes(c.status)) return err('Une séance est déjà programmée');
      if (!Array.isArray(a.p_films) || a.p_films.length < 2 || a.p_films.length > 4) return err('Choisis de 2 à 4 films différents');
      VD.session = { id: 'c1000000-0000-4000-8000-000000000002', starts_at: a.p_starts_at, closes_at: new Date(Date.parse(a.p_starts_at) - 22 * 36e5).toISOString(), status: 'vote', film_id: null,
        voice_link: a.p_voice_link, host_id: uid(), postponed: 0, postponed_at: null, films: [...a.p_films] };
      VD.votes = []; VD.presence = [];
      for (const f of a.p_films) filmById(f).status = 'en_lice';
      return ok(VD.session.id);
    }
    case 'hg_cine_session_admin': {
      if (!isHost()) return err('Réservé au projectionniste');
      if (a.p_action === 'fix') { c.status = 'fixe'; c.film_id = a.p_film; for (const f of c.films) if (f !== a.p_film) filmById(f).status = 'attente'; }
      else if (a.p_action === 'cancel') { c.status = 'annulee'; for (const f of c.films) filmById(f).status = 'attente'; }
      else if (a.p_action === 'link') c.voice_link = a.p_voice_link;
      return ok(null);
    }
    case 'hg_cine_config_set': {
      if (!hasPerm('evenements')) return err('Réservé au Staff « evenements »');
      const p = a.p || {};
      if (p.seuil !== undefined && !(Number.isInteger(p.seuil) && p.seuil >= 1 && p.seuil <= 20)) return err('Seuil de votants : entier de 1 à 20');
      if (p.cloture_heures !== undefined && !(Number.isInteger(p.cloture_heures) && p.cloture_heures >= 1 && p.cloture_heures <= 72)) return err('Clôture du vote : de 1 à 72 heures avant la séance');
      Object.assign(VD.cfg, p); return ok(VD.cfg);
    }
    default: return null;
  }
}

/* ---------- Client ---------- */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc = c.rpc;
  c.rpc = async (fn, a = {}) => {
    window.__LOG.push(['rpc-vd', fn, a]);
    if (fn === 'hg_calendar') return calendar(a.p_from, a.p_to);
    if (fn === 'hg_gang_slot_save') return slotSave(a.p);
    if (fn === 'hg_gang_slot_archive') {
      const s = VD.slots.find((x) => x.id === a.p_id);
      if (!s || (s.created_by !== uid() && !hasPerm('evenements'))) return err('Seul l’auteur ou le Staff « evenements » peut le retirer');
      s.archived_at = new Date().toISOString(); return ok(null);
    }
    if (fn === 'hg_gang_slot_skip') { VD.skips.push({ slot: a.p_id, day: a.p_date }); return ok(null); }
    if (fn === 'hg_calendar_token_me') return ok(VD.token);
    if (fn === 'hg_calendar_token_reset') { VD.token = 'b'.repeat(64); return ok(VD.token); }
    if (fn === 'hg_bot_commands_get') return hasPerm('bot') ? ok({ ...VD.commands }) : err('Réservé au Staff « bot »');
    if (fn === 'hg_bot_commands_set') {
      if (!hasPerm('bot')) return err('Réservé au Staff « bot »');
      for (const [k, v] of Object.entries(a.p || {})) { if (typeof v !== 'boolean') return err(`Valeur invalide pour ${k}`); VD.commands[k] = v; }
      return ok({ ...VD.commands });
    }
    if (fn.startsWith('hg_cine_')) { const r = cineRpc(fn, a); if (r) return r; }
    return rpc(fn, a);
  };
  return c;
}
