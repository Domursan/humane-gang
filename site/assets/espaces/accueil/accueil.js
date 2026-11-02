// ===== Accueil : le QG du Humane Gang (/pages/compte/accueil.html) =====
// Page d'accueil. Visiteur : présentation et connexion. Membre : tuiles (Secret Santa, IRL, Historique),
// fil d'activité (pastilles et « Voir plus », idée 74), anniversaires à venir (30 jours, carte commune : carte-anniv.js),
// défi du gang, bandeaux (récap, événement en cours) et boîte à idées.
// Chaque tuile et chaque bloc se charge séparément : une erreur n'empêche pas les autres.
// Dépendances : core.js (sb, initPage, canAccess, textes réglables), icons.js, dyn-events.js (événement en cours, chargé à la demande),
// accueil-ce-jour.js (tuile « Ce jour-là »).
// Tables et RPC : hg_settings (site_textes), hg_ss_editions, hg_ss_participants, hg_ss_progress, hg_events, hg_event_rsvps,
// hg_moments, hg_activity, hg_members, hg_challenges_active, hg_ideas, hg_profiles. N'exporte rien.
import { sb, initPage, esc, $, fmtDate, fmtDateTime, avatarHtml, errMsg, toast, logoAttrs, canAccess, pageLabel, applyTheme, getSiteTheme } from '../../commun/core.js';
import { viewAsActive } from '../../commun/core/view-as.js';
import { svg } from '../../commun/icons.js';
import { prochainsAnniversaires } from './anniversaires-liste.js';
import { tourState } from '../../commun/core/tour-etat.js'; // Q1 : visite guidée au premier passage (tour.js ne se charge que si une visite est due)
import { SITE_DEFAULTS, siteIdentite } from '../../commun/core/site-defaults.js'; // textes d'origine (repli des textes réglables)
const D = SITE_DEFAULTS.textes;

/* ---------- Conteneur et session : me = personne connectée, ou null pour un visiteur ---------- */
const app = $('#app');
const me = await initPage({ auth: 'optional' });

/* ---------- Textes réglables (hg_settings.site_textes, lot 2) : repli sur les textes d'origine ---------- */
// Lisible par les visiteurs (migration 051). Une clé absente ou vide garde le texte d'origine.
const TX = await (async () => {
  try {
    const { data, error } = await sb.from('hg_settings').select('value').eq('key', 'site_textes').maybeSingle();
    if (error) throw error;
    return data?.value && typeof data.value === 'object' ? data.value : {};
  } catch (e) { console.warn('[accueil] textes non lus, valeurs par défaut :', e?.message || e); return {}; }
})();
/** Texte réglé (clé simple) ou repli. */
const txt = (key, fallback) => (typeof TX[key] === 'string' && TX[key].trim() ? TX[key].trim() : fallback);
/** Libellé réglé dans un objet (ex. rsvp_libelles.oui) ou repli. */
const txtIn = (key, sub, fallback) => (TX[key] && typeof TX[key][sub] === 'string' && TX[key][sub].trim() ? TX[key][sub].trim() : fallback);

/* ---------- Refus d'accès (redirection depuis une page interdite : ?refus=<slug>) ---------- */
{
  const params = new URLSearchParams(location.search);
  const refus = params.get('refus');
  if (refus !== null) {
    const label = pageLabel(refus);
    toast(`Tu n'as pas accès à cette page${label ? ` (${label})` : ''}.`, 'error');
    params.delete('refus');
    const qs = params.toString();
    try { history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`); } catch {}
  }
}

/* ---------- Icônes (SVG à trait) ---------- */
/* Emojis des rubriques (demandés par Ethan) */
const EMOJI = { ss: '🎁', irl: '📍', hist: '📜', admin: '🛠️' };
/** Pastille d'icône d'une tuile (emoji de la rubrique). */
const tileIcon = (k) => `<span class="tile-icon tile-icon-${k}" aria-hidden="true">${EMOJI[k]}</span>`;
const ICON = {
  bulb: svg('bulb', { size: 20, stroke: 1.7 }),
  arrow: svg('arrow', { size: 20, stroke: 1.7 }),
  cake: svg('cake', { size: 20, stroke: 1.7 }),
  pulse: svg('pulse', { size: 20, stroke: 1.7 }),
  flag: svg('flag', { size: 20, stroke: 1.7 }),
};

/* Classe de pastille et libellé de chaque statut Secret Santa. Les libellés peuvent être réglés dans l'admin (ss_statuts). */
const STATUS_PILL = { inscriptions: 'pill-current', tirage: 'pill-current', envoi: 'pill-current', revelation: 'pill-ok', termine: 'pill-todo' };
const STATUS_TEXT = D.ss_statuts;
/** [libellé, classe de pastille] d'un statut Secret Santa (libellés réglables : site_textes.ss_statuts). */
const STATUS = new Proxy({}, { get: (_, k) => (k in STATUS_TEXT ? [txtIn('ss_statuts', k, STATUS_TEXT[k]), STATUS_PILL[k]] : undefined) });
const RSVP_TEXT = D.rsvp_libelles;
const RSVP = new Proxy({}, { get: (_, k) => (k in RSVP_TEXT ? txtIn('rsvp_libelles', k, RSVP_TEXT[k]) : undefined) });

/* Formateur « il y a 3 heures », en français. */
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
/**
 * Temps écoulé depuis une date, en français (« il y a 5 minutes », « hier »…).
 * @param {string} d date ISO
 * @returns {string}
 */
function ago(d) {
  const s = (new Date(d) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, n] of units) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
  return 'à l\'instant';
}
/** Date « AAAA-MM-JJ » lue en heure locale (évite le décalage d'un jour que donnerait new Date(texte)). */
const parseDay = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
/** Mois abrégés pour la date d'un anniversaire (« 3 nov. »). */
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/* ---------- « Intro vue » dans le profil (indicateur affiché dans l'admin ; l'intro se rejoue une fois par jour) ---------- */
/**
 * Marque l'intro comme vue dans le profil (indicateur visible dans l'admin). Une seule fois : sans effet si déjà marqué.
 * Une erreur d'écriture est ignorée, ce n'est pas bloquant.
 */
function syncIntro() {
  if (!me || me.intro_seen) return;
  sb.from('hg_profiles').update({ intro_seen: true }).eq('id', me.id).then(() => {}, () => {});
}

/* ======================================================================
   Visiteur non connecté
   ====================================================================== */
/**
 * Accueil pour un visiteur non connecté : présentation du gang, bouton de connexion et tuiles sans données.
 * Le bouton « Revoir l'intro » efface le jour de l'intro puis renvoie à /index.html.
 */
function renderGuest() {
  const logo = logoAttrs();
  app.innerHTML = `
    <section class="home-hero home-hero-guest">
      <img class="home-hero-logo" src="${esc(logo.src)}"${logo.srcset ? ` srcset="${esc(logo.srcset)}" sizes="88px"` : ''} width="88" height="88" alt="" data-on-error="remove">
      <p class="eyebrow">Humane Gang</p>
      <h1 class="page-title">${esc(txt('accueil_titre', D.accueil_titre))}</h1>
      <p class="home-lead">${esc(txt('accueil_lead', D.accueil_lead))}</p>
      <div class="btn-row home-hero-actions">
        <a class="btn btn-primary" href="/pages/compte/compte.html?next=/pages/compte/accueil.html">${esc(txt('accueil_cta_connexion', D.accueil_cta_connexion))}</a>
        <button class="btn btn-ghost" type="button" id="replay">Revoir l'intro</button>
      </div>
      <p class="small muted">${esc(txt('accueil_note_invitation', D.accueil_note_invitation))}</p>
    </section>
    <section class="grid home-tiles" aria-label="Ce qui t'attend">
      <div class="card card-ss tile">
        ${tileIcon('ss')}
        <h2 class="tile-label">Secret Santa</h2>
        <p class="tile-sub">Inscriptions, tirage au sort, liste de souhaits et révélation finale.</p>
      </div>
      <div class="card card-irl tile">
        ${tileIcon('irl')}
        <h2 class="tile-label">IRL</h2>
        <p class="tile-sub">Les prochaines sorties, qui vient, et l'album photo de chaque rencontre.</p>
      </div>
      <div class="card card-hist tile">
        ${tileIcon('hist')}
        <h2 class="tile-label">Historique</h2>
        <p class="tile-sub">La frise du gang : éditions passées, sorties et moments cultes.</p>
      </div>
    </section>`;
  $('#replay').addEventListener('click', () => {
    try { localStorage.removeItem('hg_intro_day'); } catch {}
    location.href = '/index.html';
  });
}

/* ======================================================================
   Membre connecté
   ====================================================================== */
/* Blocs conditionnels du haut (compte à rebours, bandeau d'événement) : s'ils étaient affichés à la dernière visite,
   leur place est réservée pendant le chargement, pour ne pas repousser les tuiles. Préférence locale, sans effet si absente. */
const BLOCS_KEY = 'hg_accueil_blocs';
/** Hauteur (px) du bloc à la dernière visite dans ce navigateur, 0 s'il n'était pas affiché. */
function blocVu(cle) { try { return Math.max(0, Math.round(Number(JSON.parse(localStorage.getItem(BLOCS_KEY) || '{}')[cle]) || 0)); } catch { return 0; } }
/** Mémorise la hauteur de chaque bloc affiché, une fois le chargement terminé (0 : absent). */
function noterBlocs() {
  const h = (id) => { const el = $(`#${id}`); return el && !el.hidden ? Math.round(el.getBoundingClientRect().height) : 0; };
  try { localStorage.setItem(BLOCS_KEY, JSON.stringify({ countdown: h('countdown'), dyn: h('dyn-banner') })); } catch { /* sans importance */ }
}
/**
 * Bloc conditionnel : réservé (squelette, classe is-attente) si vu la dernière fois, sinon masqué comme avant.
 * @param {string} id identifiant de l'élément
 * @param {string} cle clé dans BLOCS_KEY
 * @param {string} sq contenu du squelette
 */
function blocAttente(id, cle, sq) {
  const h = blocVu(cle);
  if (!h) return `<div id="${id}" hidden></div>`;
  return `<div id="${id}" class="${id === 'countdown' ? 'countdown' : 'recap-banner dyn-banner'} is-attente" style="min-height:${h}px" aria-hidden="true">${sq}</div>`;
}

/**
 * Squelette de l'accueil d'un membre : titre, bandeaux, tuiles (avec des blocs en attente), fil, anniversaires, boîte à idées.
 * Les données arrivent ensuite, tuile par tuile.
 */
function renderMemberShell() {
  app.innerHTML = `
    <section class="page-head home-head">
      <div>
        <p class="eyebrow">Salut ${esc(me.pseudo)}</p>
        <h1 class="page-title">${esc(txt('accueil_titre', D.accueil_titre))}</h1>
      </div>
      ${blocAttente('countdown', 'countdown', '<p class="cd-title home-sk home-sk-court"></p><div class="cd-units"><span class="home-sk home-sk-num"></span><span class="home-sk home-sk-num"></span><span class="home-sk home-sk-num"></span><span class="home-sk home-sk-num"></span></div>')}
    </section>
    ${recapBanner()}
    <div id="saison-home" hidden></div>
    ${blocAttente('dyn-banner', 'dyn', '<span class="home-sk home-sk-rond"></span><span class="home-sk-txt"><span class="home-sk home-sk-long"></span><span class="home-sk home-sk-court"></span></span>')}
    <section class="card home-defi" id="defi" aria-labelledby="defi-title" hidden></section>
    <div id="qdj-home" hidden></div>

    <section class="card tile-theme" id="tile-theme" aria-labelledby="theme-title" hidden></section>
    <section class="grid home-tiles" aria-label="Rubriques">
      <a class="card card-ss tile tile-link" href="/pages/irl/secret-santa.html" id="tile-ss">
        ${tileIcon('ss')}
        <span class="tile-arrow">${ICON.arrow}</span>
        <h2 class="tile-label">Secret Santa</h2>
        <div class="tile-body"><span class="skeleton"></span><span class="skeleton short"></span></div>
      </a>
      <a class="card card-irl tile tile-link" href="/pages/irl/irl.html" id="tile-irl">
        ${tileIcon('irl')}
        <span class="tile-arrow">${ICON.arrow}</span>
        <h2 class="tile-label">IRL</h2>
        <div class="tile-body"><span class="skeleton"></span><span class="skeleton short"></span></div>
      </a>
      <a class="card card-hist tile tile-link" href="/pages/irl/historique.html" id="tile-hist">
        ${tileIcon('hist')}
        <span class="tile-arrow">${ICON.arrow}</span>
        <h2 class="tile-label">Historique</h2>
        <div class="tile-body"><span class="skeleton"></span><span class="skeleton short"></span></div>
      </a>
      ${me.is_admin && !viewAsActive() ? `<a class="card card-admin tile tile-link" href="/pages/admin/admin.html" id="tile-admin">
        ${tileIcon('admin')}
        <span class="tile-arrow">${ICON.arrow}</span>
        <h2 class="tile-label">Admin</h2>
        <div class="tile-body"><span class="skeleton"></span><span class="skeleton short"></span></div>
      </a>` : ''}
      <section class="card card-hist home-day" id="tile-day" data-home-block="ce_jour_la" data-home-label="Ce jour-là" data-home-kind="tile" aria-labelledby="day-title" hidden></section>
    </section>

    <section class="row home-row">
      <div class="card home-feed">
        <div class="feed-head"><h2 class="card-title">${ICON.pulse} Fil d'activité</h2><div class="feed-tools" id="feed-tools"></div></div>
        <ul class="feed" id="feed" aria-live="polite"><li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li></ul>
      </div>
      <div class="card home-bdays">
        <h2 class="card-title">${ICON.cake} Anniversaires à venir</h2>
        <ul class="bdays" id="bdays"><li class="skeleton-row"></li></ul>
      </div>
    </section>

    ${ideasHtml()}`;
}

/* ---------- Boîte à idées ---------- */
/** Bloc « Une idée pour le gang ? » (formulaire de la boîte à idées). */
function ideasHtml() {
  return `
    <section class="card home-ideas" id="idees" aria-labelledby="ideas-title">
      <form class="stack" id="idea-form" novalidate>
        <div class="ideas-head">
          <h2 class="card-title" id="ideas-title">${ICON.bulb} Une idée pour le gang ?</h2>
          <p class="small muted">${txt('idees_aide', '') ? esc(txt('idees_aide', '')) : 'Une sortie, une fonctionnalité pour le site, un thème… Ton message est <strong>lu uniquement par l\'admin</strong>.'}</p>
        </div>
        <div class="field">
          <label for="idea-body">Ton idée</label>
          <textarea id="idea-body" maxlength="2000" rows="3" required placeholder="Et si on organisait…"></textarea>
          <span class="small muted ideas-count" id="idea-count" aria-live="polite">0 / 2000</span>
        </div>
        <p class="form-error" id="idea-error" role="alert" hidden></p>
        <div class="btn-row"><button class="btn btn-sand" type="submit">Envoyer l'idée</button></div>
      </form>
    </section>`;
}

/**
 * Lien « /pages/compte/accueil.html#idees » (aide, tutos, compte…) : montre la boîte à idées même si le membre l'a retirée de son
 * accueil personnalisé, puis y fait défiler et place le curseur dans le champ.
 * @param {boolean} [focus] true : place aussi le curseur dans « Ton idée ».
 */
function allerAuxIdees(focus = false) {
  if (location.hash !== '#idees') return;
  if (!$('#idees')) {
    app.insertAdjacentHTML('beforeend', ideasHtml());
    bindIdeas();
  }
  $('#idees')?.scrollIntoView({ block: 'start' });
  if (focus) $('#idea-body')?.focus({ preventScroll: true });
}

/**
 * Boîte à idées : compteur de caractères, envoi à la table hg_ideas (lue seulement par l'admin), et message de confirmation.
 */
function bindIdeas() {
  const form = $('#idea-form'), ta = $('#idea-body'), count = $('#idea-count'), err = $('#idea-error');
  /** Affiche ou efface le message d'erreur de la boîte à idées. */
  const showErr = (m) => { err.textContent = m; err.hidden = !m; };
  ta.addEventListener('input', () => { count.textContent = `${ta.value.length} / 2000`; if (ta.value.trim()) showErr(''); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = ta.value.trim();
    if (!body) { showErr('Écris ton idée avant de l\'envoyer.'); ta.focus(); return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; const label = btn.textContent; btn.textContent = 'Envoi…'; showErr('');
    const { error } = await sb.from('hg_ideas').insert({ user_id: me.id, body });
    btn.disabled = false; btn.textContent = label;
    if (error) { showErr(`Envoi impossible : ${errMsg(error)}`); return; }
    ta.value = ''; count.textContent = '0 / 2000';
    toast('Merci, ton idée a été transmise à l\'admin.', 'ok');
  });
}

/** Message discret quand un bloc ne charge pas ; l'erreur technique reste lisible pour la personne. */
const failBox = (e) => `<p class="small muted">Impossible de charger ces infos (${esc(errMsg(e))}).</p>`;

/* ---------- Tuile Secret Santa + compte à rebours ---------- */
/**
 * Tuile Secret Santa : dernière édition, statut, date, participation de la personne, et compte à rebours si l'échange approche.
 * Sans édition, la tuile affiche un message d'attente.
 */
async function loadSecretSanta() {
  const body = $('#tile-ss .tile-body');
  try {
    const { data: ed, error } = await sb.from('hg_ss_editions').select('*').order('year', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    if (!ed) { body.innerHTML = `<p class="tile-main">${esc(txt('ss_pas_edition', D.ss_pas_edition))}</p><p class="tile-sub">L'admin lancera la prochaine bientôt.</p>`; return; }
    const [st, cls] = STATUS[ed.status] || [ed.status, 'pill-todo'];
    const [{ data: mine }, { data: prog }] = await Promise.all([
      sb.from('hg_ss_participants').select('user_id').eq('edition_id', ed.id).eq('user_id', me.id).maybeSingle(),
      sb.rpc('hg_ss_progress', { p_edition: ed.id }),
    ]);
    const p = Array.isArray(prog) ? prog[0] : prog;
    const when = ed.exchange_date ? `Échange le ${fmtDate(parseDay(ed.exchange_date))}`
      : ed.send_deadline ? `Envoi avant le ${fmtDate(parseDay(ed.send_deadline))}` : 'Dates à venir';
    const part = mine ? 'Tu participes' : (ed.status === 'inscriptions' ? 'Tu n\'es pas encore inscrit·e' : 'Tu ne participes pas');
    body.innerHTML = `
      <p class="tile-main">Édition ${esc(ed.year)}</p>
      <p><span class="pill ${cls}">${esc(st)}</span></p>
      <p class="tile-sub">${esc(when)}</p>
      <p class="tile-sub">${esc(part)}${p?.participants ? ` · ${esc(p.participants)} participant${p.participants > 1 ? 's' : ''}` : ''}</p>`;
    if (ed.exchange_date && !['revelation', 'termine'].includes(ed.status)) startCountdown(parseDay(ed.exchange_date), ed.year);
  } catch (e) { body.innerHTML = failBox(e); }
}

let cdTimer;
/**
 * Compte à rebours jusqu'à l'échange des cadeaux. Disparaît un jour après la date ; affiche « C'est le jour » le jour même.
 * @param {Date} target date et heure de l'échange
 * @param {number|string} year année de l'édition
 */
function startCountdown(target, year) {
  const box = $('#countdown');
  /** Une unité du compte à rebours : nombre sur deux chiffres et libellé. */
  const unit = (n, l) => `<div class="cd-unit"><span class="cd-num display">${String(n).padStart(2, '0')}</span><span class="cd-lbl">${l}</span></div>`;
  /** Met à jour le compte à rebours : le décompte, ou le message du jour J. */
  const tick = () => {
    const ms = target - Date.now();
    if (ms <= -86400000) { box.hidden = true; box.classList.remove('is-attente'); clearInterval(cdTimer); return; }
    box.hidden = false; box.classList.remove('is-attente');
    if (ms <= 0) { box.innerHTML = `<p class="cd-title">Secret Santa ${esc(year)}</p><p class="cd-today display">C'est le jour de l'échange</p>`; clearInterval(cdTimer); return; }
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    box.innerHTML = `<p class="cd-title">Échange des cadeaux ${esc(year)} dans</p>
      <div class="cd-units" role="timer" aria-label="${d} jours, ${h} heures et ${m} minutes">${unit(d, d > 1 ? 'jours' : 'jour')}${unit(h, 'h')}${unit(m, 'min')}${unit(sec, 's')}</div>`;
  };
  // Minuteur en pause quand l'onglet est caché ; repris (et mis à jour tout de suite) au retour
  const run = () => { clearInterval(cdTimer); if (!document.hidden) cdTimer = setInterval(tick, 1000); };
  tick();
  run();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); run(); });
}

/* ---------- Haut de l'accueil (Pixel Pop) : thème en cours + carré des rubriques ---------- */
/**
 * Fin d'un thème de saison : son jour « MM-DD » à 23 h 59, cette année ou l'an prochain s'il est déjà passé
 * (plage à cheval sur deux années, comme l'hiver). Null pour un thème sans date de fin (thème choisi par l'admin).
 * @param {string|null} md jour de fin « MM-DD »
 * @returns {Date|null}
 */
function finDuTheme(md) {
  const m = /^(\d{2})-(\d{2})$/.exec(md || '');
  if (!m) return null;
  const now = new Date();
  const fin = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]), 23, 59, 59);
  if (fin < now) fin.setFullYear(fin.getFullYear() + 1);
  return fin;
}

let themeTimer;
/**
 * Tuile « Thème en cours » : affichée quand le site porte un thème spécial (Halloween, Noël…), avec sa date de fin et
 * un compte à rebours. Rien pour le thème par défaut : le carré des rubriques reprend alors toute la largeur.
 */
async function loadTheme() {
  const box = $('#tile-theme');
  if (!box) return;
  await applyTheme().catch(() => null); // même chargement que le socle (une seule requête)
  const t = getSiteTheme();
  if (!t || t.is_default) { box.hidden = true; placerHaut(); return; }
  const fin = finDuTheme(t.end_md);
  const emoji = (Array.isArray(t.emojis) && t.emojis[0]) || '✨';
  const pad = (n) => String(n).padStart(2, '0');
  box.innerHTML = `
    <div class="theme-txt">
      <p class="theme-tag">Thème en cours</p>
      <h2 class="theme-nom" id="theme-title">Thème ${esc(t.name)}</h2>
      <p class="theme-desc">Le site se met aux couleurs de la saison : logo, couleurs et effets.</p>
      ${fin ? `<p class="theme-fin">Fin le ${esc(fmtDate(fin))} à 23:59</p><p class="theme-cd" id="theme-cd" role="timer"></p>` : ''}
    </div>
    <div class="theme-scene" aria-hidden="true"><span class="theme-emoji">${esc(emoji)}</span></div>`;
  box.hidden = false;
  placerHaut();
  if (!fin) return;
  const cd = $('#theme-cd');
  const tick = () => {
    const s = Math.max(0, Math.floor((fin - Date.now()) / 1000));
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mi = Math.floor((s % 3600) / 60);
    cd.textContent = `${d} J ${pad(h)}:${pad(mi)}:${pad(s % 60)}`;
    cd.setAttribute('aria-label', `Encore ${d} jour${d > 1 ? 's' : ''}, ${h} heures et ${mi} minutes`);
    if (!s) clearInterval(themeTimer);
  };
  const run = () => { clearInterval(themeTimer); if (!document.hidden) themeTimer = setInterval(tick, 1000); };
  tick();
  run();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); run(); });
}

/** Tuile Admin (administrateur, hors vue « comme un membre ») : demandes d'assistance ouvertes et idées nouvelles. */
async function loadAdminTile() {
  const body = $('#tile-admin .tile-body');
  if (!body) return;
  try {
    const [sup, ide] = await Promise.all([
      sb.from('hg_support').select('id', { count: 'exact', head: true }).eq('status', 'ouverte'),
      sb.from('hg_ideas').select('id', { count: 'exact', head: true }).eq('status', 'nouvelle'),
    ]);
    if (sup.error) throw sup.error;
    if (ide.error) throw ide.error;
    const n = (c, un, plus) => `${c || 0} ${(c || 0) > 1 ? plus : un}`;
    body.innerHTML = `
      <p class="tile-kicker">Assistance</p><p class="tile-main">${esc(n(sup.count, 'demande ouverte', 'demandes ouvertes'))}</p>
      <p class="tile-kicker">Boîte à idées</p><p class="tile-main">${esc(n(ide.count, 'idée nouvelle', 'idées nouvelles'))}</p>`;
  } catch (e) { body.innerHTML = failBox(e); }
}

/**
 * Place le haut de l'accueil : la tuile Admin rejoint la première grille de rubriques ; « Ce jour-là » passe juste
 * dessous (le carré garde quatre zones au plus) ; avec un thème spécial, thème à gauche et rubriques en carré à droite.
 * Rappelée après chaque rangement de l'accueil personnalisé (événement hg:home-arrange de home-blocks.js).
 */
function placerHaut() {
  const top = $('.home-top');
  const groupes = [...app.querySelectorAll('.home-tiles')].filter((g) => !g.classList.contains('home-tiles-suite'));
  const tiles = groupes.find((g) => g.querySelector('#tile-ss, #tile-irl, #tile-hist')) || groupes[0];
  const admin = $('#tile-admin'), day = $('#tile-day'), theme = $('#tile-theme');
  if (tiles && admin && admin.parentElement !== tiles) tiles.append(admin);
  if (tiles && day && tiles.contains(day)) {
    let suite = $('.home-tiles-suite');
    if (!suite) { suite = document.createElement('section'); suite.className = 'grid home-tiles home-tiles-suite'; suite.setAttribute('aria-label', 'Ce jour-là'); }
    suite.append(day);
    (top || tiles).after(suite);
  }
  app.querySelectorAll('.home-tiles').forEach((g) => { if (!g.children.length) g.remove(); });
  const avecTheme = theme && !theme.hidden && tiles?.isConnected;
  if (avecTheme) {
    const box = top || Object.assign(document.createElement('div'), { className: 'home-top' });
    if (!box.contains(tiles)) tiles.before(box); // après un rangement, le haut suit la grille des rubriques
    box.append(theme, tiles);
    tiles.classList.add('is-carre');
    $('.home-tiles-suite') && box.after($('.home-tiles-suite'));
  } else if (top) {
    if (tiles) { tiles.classList.remove('is-carre'); top.before(tiles); }
    if (theme) top.before(theme);
    top.remove();
  }
  majCarre();
}

let carreObs;
/**
 * Carré des rubriques : seules les zones visibles comptent, et elles se partagent tout le carré
 * (4 : deux par deux ; 3 : la dernière sur toute la largeur ; 2 : une par rangée ; 1 : tout le carré).
 */
function majCarre() {
  const carre = $('.home-tiles.is-carre');
  if (!carre) return;
  const vis = [...carre.children].filter((el) => !el.hidden);
  vis.forEach((el, i) => {
    const pos = vis.length === 1 ? 'tout' : (vis.length === 2 || (vis.length === 3 && i === 2)) ? 'ligne' : '';
    if (pos) el.dataset.pos = pos; else delete el.dataset.pos;
  });
  carre.dataset.n = String(vis.length);
  if (!carreObs) {
    carreObs = new MutationObserver(() => majCarre());
  }
  carreObs.disconnect();
  carreObs.observe(carre, { childList: true, subtree: false, attributes: true, attributeFilter: ['hidden'] });
  for (const el of carre.children) carreObs.observe(el, { attributes: true, attributeFilter: ['hidden'] });
}

/* ---------- Tuile IRL ---------- */
/**
 * Tuile IRL : prochaine sortie (date, lieu, nombre de présents, réponse de la personne) et nombre de sondages de dates en cours.
 */
async function loadIrl() {
  const body = $('#tile-irl .tile-body');
  try {
    const nowIso = new Date().toISOString();
    const [{ data: next, error }, { count: polls }] = await Promise.all([
      sb.from('hg_events').select('id,title,location,starts_at').gte('starts_at', nowIso).order('starts_at').limit(1).maybeSingle(),
      sb.from('hg_events').select('id', { count: 'exact', head: true }).is('starts_at', null),
    ]);
    if (error) throw error;
    const pollTxt = polls ? `<p class="tile-sub">${polls} sondage${polls > 1 ? 's' : ''} de dates en cours</p>` : '';
    if (!next) {
      body.innerHTML = `<p class="tile-main">Aucune sortie prévue</p><p class="tile-sub">Propose la prochaine !</p>${pollTxt}`;
      return;
    }
    const { data: rsvps } = await sb.from('hg_event_rsvps').select('user_id,status').eq('event_id', next.id);
    const yes = (rsvps || []).filter((r) => r.status === 'oui').length;
    const mine = (rsvps || []).find((r) => r.user_id === me.id);
    body.innerHTML = `
      <p class="tile-kicker">Prochaine sortie</p>
      <p class="tile-main">${esc(next.title)}</p>
      <p class="tile-sub">${esc(fmtDateTime(next.starts_at))}${next.location ? ` · ${esc(next.location)}` : ''}</p>
      <p class="tile-sub">${yes} présent${yes > 1 ? 's' : ''} · ${mine ? esc(RSVP[mine.status] || mine.status) : 'Tu n\'as pas encore répondu'}</p>
      ${pollTxt}`;
  } catch (e) { body.innerHTML = failBox(e); }
}

/* ---------- Tuile Historique ---------- */
/**
 * Tuile Historique : nombre de moments culte, de sorties passées et d'éditions Secret Santa, et le dernier souvenir.
 */
async function loadHistory() {
  const body = $('#tile-hist .tile-body');
  try {
    const nowIso = new Date().toISOString();
    const [mom, eds, evs, last] = await Promise.all([
      sb.from('hg_moments').select('id', { count: 'exact', head: true }),
      sb.from('hg_ss_editions').select('id', { count: 'exact', head: true }).in('status', ['revelation', 'termine']),
      sb.from('hg_events').select('id', { count: 'exact', head: true }).lt('starts_at', nowIso),
      sb.from('hg_moments').select('title,happened_on').order('happened_on', { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (mom.error) throw mom.error;
    /** Nombre suivi du mot au singulier ou au pluriel (ex. « 2 moments cultes »). */
    const n = (c, s, p) => `${c || 0} ${(c || 0) > 1 ? p : s}`;
    body.innerHTML = `
      <p class="tile-main">${n(mom.count, 'moment culte', 'moments cultes')}</p>
      <p class="tile-sub">${n(evs.count, 'sortie passée', 'sorties passées')} · ${n(eds.count, 'édition Secret Santa', 'éditions Secret Santa')}</p>
      ${last.data ? `<p class="tile-sub">Dernier souvenir : ${esc(last.data.title)}</p>` : ''}`;
  } catch (e) { body.innerHTML = failBox(e); }
}

/* ---------- Annuaire (partagé par le fil et les anniversaires) ---------- */
// Annuaire : réservé aux membres. Chargé seulement pour un membre connecté (sinon 401 côté visiteur).
/* Cache de l'annuaire : la requête n'est faite qu'une fois, puis partagée entre le fil et les anniversaires. */
let membersP = null;
/** Annuaire des membres. La promesse est mise en cache : une seule requête pour toute la page. */
const members = () => (membersP ||= sb.rpc('hg_members').then(({ data, error }) => { if (error) throw error; return data || []; }));

/* ---------- Liens vers la carte d'identité d'un membre ---------- */
/** Pseudo cliquable vers la carte du membre, ou pseudo simple si la page membre n'est pas accessible. */
const memberLink = (m, label = m.pseudo) => (canAccess('membre')
  ? `<a class="member-link" href="/pages/compte/membre.html?id=${encodeURIComponent(m.id)}">${esc(label)}</a>`
  : `<strong class="member-link">${esc(label)}</strong>`);
/**
 * Texte d'une ligne du fil. Si le texte commence par le pseudo, le pseudo devient un lien ; sinon le lien précède le texte.
 * @param {object} a entrée du fil (hg_activity)
 * @param {object|null} m membre concerné, s'il existe
 * @returns {string} HTML
 */
function feedText(a, m) {
  const text = String(a.text ?? '');
  if (!m) return esc(text);
  if (text.startsWith(m.pseudo)) return `${memberLink(m)}${esc(text.slice(m.pseudo.length))}`;
  return `${memberLink(m)} · ${esc(text)}`;
}

/* ---------- Bandeau « Le récap est disponible » (1er décembre → 31 janvier) ---------- */
/**
 * Bandeau du récap annuel, affiché de décembre à janvier seulement (et si la page recap est accessible).
 * @returns {string} HTML, vide hors période
 */
function recapBanner() {
  const d = new Date(), mo = d.getMonth();
  if ((mo !== 11 && mo !== 0) || !canAccess('recap')) return '';
  const y = mo === 11 ? d.getFullYear() : d.getFullYear() - 1;
  return `<a class="recap-banner" href="/pages/irl/recap.html?year=${y}">
      <span class="recap-banner-emoji" aria-hidden="true">✨</span>
      <span class="recap-banner-txt"><strong>Le récap ${y} est disponible</strong><span>Ton année avec le gang en quelques chiffres</span></span>
      <span class="recap-banner-go" aria-hidden="true">${ICON.arrow}</span>
    </a>`;
}

/* ---------- Bandeau « Événement en cours » (événements dynamiques) ---------- */
/**
 * Bandeau « Événement en cours » : affiche le premier événement qui se termine (les autres sont comptés).
 * Le module des événements est chargé à la demande.
 */
async function loadDynBanner() {
  const box = $('#dyn-banner');
  if (!box || !canAccess('evenements')) return;
  try {
    const { getActiveDynEvents } = await import('../../commun/dyn-events.js');
    const list = await getActiveDynEvents();
    if (!list.length) { box.hidden = true; box.classList.remove('is-attente'); return; }
    const ev = [...list].sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at))[0];
    const more = list.length > 1 ? ` (+${list.length - 1} autre${list.length > 2 ? 's' : ''})` : '';
    const vis = ev.image_url
      ? `<img class="dyn-banner-img" src="${esc(ev.image_url)}" alt="" data-on-error="remove" decoding="async">`
      : `<span class="recap-banner-emoji" aria-hidden="true">${esc(ev.emoji || '✨')}</span>`;
    box.innerHTML = `<a class="recap-banner dyn-banner" href="/pages/irl/evenements.html">
        ${vis}
        <span class="recap-banner-txt"><strong>Événement en cours : ${esc(ev.name)}${esc(more)}</strong><span>Jusqu'au ${esc(fmtDateTime(ev.ends_at))} · une image spéciale traverse le site, attrape-la !</span></span>
        <span class="recap-banner-go" aria-hidden="true">${ICON.arrow}</span>
      </a>`;
    box.hidden = false; box.classList.remove('is-attente');
  } catch (e) { console.warn('[événements]', e); box.hidden = true; box.classList.remove('is-attente'); }
}

/* ---------- Fil d'activité ---------- */
/* Pastilles du fil (idée 74) : [clé, libellé, types d'entrée (hg_activity.kind)]. « Tout » ne filtre rien. La pastille choisie
   n'est pas retenue d'une visite à l'autre. */
const FEED_FILTRES = [
  ['tout', 'Tout', null],
  ['gang', 'Le gang', ['join', 'merci', 'sondage', 'sondage_resultat', 'birthday', 'soiree', 'ss_draw', 'parrainage']],
  ['cartes', 'Cartes', ['cartes']],
  ['badges', 'Badges et secrets', ['badge', 'secret', 'saison']],
];
/** Entrées ajoutées par « Voir plus », et plafond du fil sur l'accueil (au-delà : page Historique). */
const FEED_PAS = 10, FEED_MAX = 100;
/** État du fil : pastille choisie, lignes affichées, suite disponible, annuaire. */
const FEED = { filtre: 'tout', rows: [], suite: false, byId: new Map() };

/**
 * Lit une tranche du fil pour la pastille choisie : une ligne de plus que demandé, pour savoir s'il reste une suite.
 * @param {number} from première ligne (0 = la plus récente)
 * @param {number} n nombre de lignes voulues
 * @returns {Promise<{rows: Array<object>, suite: boolean}>}
 */
async function feedTranche(from, n) {
  const kinds = FEED_FILTRES.find((f) => f[0] === FEED.filtre)[2];
  let q = sb.from('hg_activity').select('*'); // ref (migration 090) : lien vers un sondage
  if (kinds) q = q.in('kind', kinds);
  const { data, error } = await q.order('created_at', { ascending: false }).range(from, from + n);
  if (error) throw error;
  const rows = data || [];
  return { rows: rows.slice(0, n), suite: rows.length > n && from + n < FEED_MAX };
}

/** Ligne du fil (avatar de l'auteur, ou logo pour une entrée du site). */
function feedItemHtml(a) {
  const m = a.user_id ? FEED.byId.get(a.user_id) : null;
  const logo = logoAttrs();
  const av = m ? avatarHtml(m, 36) : `<span class="avatar feed-sys" aria-hidden="true" style="width:36px;height:36px"><img src="${esc(logo.src)}"${logo.srcset ? ` srcset="${esc(logo.srcset)}" sizes="36px"` : ''} alt="" data-on-error="remove"></span>`;
  return `<li class="feed-item" data-kind="${esc(a.kind)}"${a.ref ? ` data-ref="${esc(a.ref)}"` : ''}>
        ${av}
        <div class="feed-text">
          <p>${feedText(a, m)}</p>
          <time class="small muted" datetime="${esc(a.created_at)}" title="${esc(fmtDateTime(a.created_at))}">${esc(ago(a.created_at))}</time>
        </div>
      </li>`;
}

/** Pied du fil : « Voir plus », ou la fin du fil (avec le renvoi à la page Historique au plafond). */
function feedPiedHtml() {
  if (FEED.suite) return '<button type="button" class="btn btn-ghost btn-sm feed-plus">Voir plus</button>';
  if (FEED.rows.length >= FEED_MAX) {
    return `<p class="small muted">Tout l’historique est sur la page ${canAccess('historique') ? '<a href="/pages/irl/historique.html">Historique</a>' : 'Historique'}.</p>`;
  }
  if (FEED.rows.length > FEED_PAS) {
    const lib = FEED_FILTRES.find((f) => f[0] === FEED.filtre)[1];
    return `<p class="small muted">C’est tout${FEED.filtre === 'tout' ? '' : ` pour « ${esc(lib)} »`}.</p>`;
  }
  return '';
}

/** Dessine les lignes et le pied du fil, puis rebranche les sondages sur les lignes affichées. */
function feedDessine() {
  const ul = $('#feed');
  const box = ul.closest('.home-feed');
  if (!FEED.rows.length) {
    const lib = FEED_FILTRES.find((f) => f[0] === FEED.filtre)[1];
    ul.innerHTML = FEED.filtre === 'tout'
      ? `<li class="empty">Rien pour l'instant. Le fil se remplira au fil des inscriptions, sorties et souvenirs.</li>`
      : `<li class="empty">Rien dans « ${esc(lib)} » pour l’instant.</li>`;
  } else ul.innerHTML = FEED.rows.map(feedItemHtml).join('');
  let pied = box.querySelector('.feed-pied');
  const html = feedPiedHtml();
  if (!html) pied?.remove();
  else {
    if (!pied) { pied = document.createElement('div'); pied.className = 'feed-pied'; ul.after(pied); }
    pied.innerHTML = html;
  }
  // Sondages libres (migration 090) : cartes de vote à la place des lignes « sondage », boutons de l'en-tête.
  import('./polls.js').then((m) => m.mountPolls({ feed: FEED.rows.length ? ul : null, head: $('#feed-tools'), rows: FEED.rows, members: FEED.byId, reload: loadFeed }))
    .catch((e) => console.warn('[sondages]', e));
}

/** Pastilles au-dessus du fil (posées une fois) : un clic recharge le fil depuis le début pour la pastille choisie. */
function feedPastilles() {
  const box = $('#feed').closest('.home-feed');
  if (box.querySelector('.feed-filtres')) return;
  const bar = document.createElement('div');
  bar.className = 'he-chips feed-filtres';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', 'Afficher dans le fil');
  bar.innerHTML = FEED_FILTRES.map(([k, l]) => `<button type="button" class="he-chip" data-feed-filtre="${k}" aria-pressed="${k === FEED.filtre}">${esc(l)}</button>`).join('');
  box.querySelector('.feed-head').after(bar);
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-feed-filtre]');
    if (!b || b.dataset.feedFiltre === FEED.filtre) return;
    FEED.filtre = b.dataset.feedFiltre;
    bar.querySelectorAll('[data-feed-filtre]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    FEED.rows = [];
    box.querySelector('.feed-pied')?.remove();
    $('#feed').innerHTML = '<li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li>';
    loadFeed();
  });
  // « Voir plus » (et « Réessayer ») : 10 entrées de plus sous les autres, sans recharger la page.
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('.feed-plus');
    if (!b) return;
    const pied = b.closest('.feed-pied');
    const filtre = FEED.filtre;
    b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Chargement…';
    $('#feed').insertAdjacentHTML('beforeend', '<li class="skeleton-row"></li><li class="skeleton-row"></li><li class="skeleton-row"></li>');
    try {
      const { rows, suite } = await feedTranche(FEED.rows.length, FEED_PAS);
      if (filtre !== FEED.filtre) return; // pastille changée entre-temps
      const avant = FEED.rows.length;
      FEED.rows = [...FEED.rows, ...rows];
      FEED.suite = suite;
      feedDessine();
      // Focus sur la première entrée ajoutée (lecteur d'écran : la lecture reprend là)
      const li = $('#feed').children[avant];
      if (li) { li.tabIndex = -1; li.focus({ preventScroll: true }); }
    } catch (err) {
      console.warn('[fil]', err?.message || err);
      $('#feed').querySelectorAll('.skeleton-row').forEach((li) => li.remove());
      pied.innerHTML = '<p class="small muted" role="alert">La suite du fil n’a pas pu être chargée.</p><button type="button" class="btn btn-ghost btn-sm feed-plus">Réessayer</button>';
    }
  });
}

/**
 * Fil d'activité (hg_activity) : les 10 dernières entrées de la pastille choisie, avec l'avatar de l'auteur quand il existe.
 * Rappelé par les sondages (vote, création) : recharge autant de lignes qu'il y en a déjà d'affichées.
 */
async function loadFeed() {
  const ul = $('#feed');
  feedPastilles();
  const filtre = FEED.filtre;
  try {
    const [tranche, all] = await Promise.all([
      feedTranche(0, Math.min(FEED_MAX, Math.max(FEED_PAS, FEED.rows.length))),
      members().catch(() => []),
    ]);
    if (filtre !== FEED.filtre) return; // pastille changée entre-temps : le chargement suivant dessine
    FEED.byId = new Map(all.map((m) => [m.id, m]));
    FEED.rows = tranche.rows;
    FEED.suite = tranche.suite;
    feedDessine();
  } catch (e) { ul.innerHTML = `<li>${failBox(e)}</li>`; ul.closest('.home-feed').querySelector('.feed-pied')?.remove(); }
}

/* ---------- Anniversaires à venir ---------- */
/**
 * Anniversaires des 30 prochains jours (glissants, passage d'année compris), du plus proche au plus lointain, sans plafond.
 * Celui du jour est mis en évidence. Sans anniversaire, un message invite à partager le sien. Calcul : anniversaires-liste.js.
 */
async function loadBirthdays() {
  const ul = $('#bdays');
  try {
    const list = prochainsAnniversaires(await members(), new Date());
    if (!list.length) {
      ul.innerHTML = `<li class="empty">Pas d'anniversaire dans les 30 prochains jours.<br><a href="/pages/compte/compte.html">Partager le tien</a> (jour et mois seulement)</li>`;
      return;
    }
    ul.innerHTML = list.map((m) => `
      <li class="bday${m.dans === 0 ? ' is-today' : ''}" data-membre="${esc(m.id)}">
        ${avatarHtml(m, 36)}
        <span class="bday-name">${memberLink(m)}</span>
        ${m.dans === 0 ? '<span class="pill pill-current">Aujourd\'hui</span>' : `<span class="bday-date">${m.quand.getDate()} ${MOIS_COURTS[m.quand.getMonth()]}</span>`}
      </li>`).join('');
  } catch (e) { ul.innerHTML = `<li>${failBox(e)}</li>`; }
}

/* ---------- Carte d'anniversaire commune (idée 52, migration 205) ---------- */
/** Carte à signer sous les lignes des membres fêtés (J−3 à J) et bandeau du jour J : module chargé à part (carte-anniv.js). */
async function loadCartesAnniv() {
  try {
    const all = await members().catch(() => []);
    const { mountCartesAnniv } = await import('./carte-anniv.js');
    await mountCartesAnniv({ ul: $('#bdays'), me, membres: new Map(all.map((m) => [m.id, m])) });
  } catch (e) { console.warn('[carte d’anniversaire]', e?.message || e); }
}

/* ---------- Défi du gang : objectif collectif (progression calculée côté serveur) ---------- */
/** Unité affichée après le nombre de chaque type de défi (ex. « 3 sorties tenues »). */
const CHALLENGE_UNIT = {
  sorties_tenues: 'sorties tenues', participations: 'participations', photos_ajoutees: 'photos ajoutées',
  souvenirs_publies: 'souvenirs publiés', boosters_ouverts: 'boosters ouverts', cartes_recyclees: 'cartes recyclées',
  echanges_conclus: 'échanges conclus',
};
/**
 * Libellé d'état d'un défi : atteint (récompense reçue ou à venir), terminé sans succès, ou date limite.
 * @param {object} c défi renvoyé par hg_challenges_active
 * @returns {string}
 */
function challengeStatus(c) {
  if (c.done) return c.credited ? txtIn('defis_libelles', 'atteint_recu', D.defis_libelles.atteint_recu) : txtIn('defis_libelles', 'atteint_verse', D.defis_libelles.atteint_verse);
  if (c.ended) return txtIn('defis_libelles', 'termine', D.defis_libelles.termine);
  // Défi programmé : rien n'est compté avant son début, on l'annonce pour éviter un compteur « bloqué » à 0.
  if (c.starts_at && new Date(c.starts_at) > new Date()) {
    const quand = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(c.starts_at));
    return `Commence le ${quand}`;
  }
  return `Jusqu'au ${fmtDate(c.ends_at)}`;
}
/**
 * Carte d'un défi : titre, état, barre de progression (bornée à l'objectif) et récompense.
 * @param {object} c défi renvoyé par hg_challenges_active
 * @returns {string} HTML
 */
function challengeHtml(c) {
  const target = Math.max(1, Number(c.target) || 1);
  const shown = Math.min(Math.max(0, Number(c.progress) || 0), target);
  const pct = Math.round((shown / target) * 100);
  const unit = CHALLENGE_UNIT[c.metric] || '';
  const text = `${shown} sur ${target} ${unit}`;
  return `<li class="defi-item${c.done ? ' is-done' : ''}">
      <div class="defi-top">
        <p class="defi-title">${esc(c.title)}</p>
        <p class="small muted">${esc(challengeStatus(c))}</p>
      </div>
      ${c.description ? `<p class="small muted defi-desc">${esc(c.description)}</p>` : ''}
      <div class="progress defi-bar" role="progressbar" aria-label="${esc(c.title)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${shown}" aria-valuetext="${esc(text)}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="small defi-count"><strong>${esc(String(shown))} / ${esc(String(target))}</strong> ${esc(unit)} · récompense : ${esc(Number(c.reward).toLocaleString('fr-CH'))} Paillettes pour chacun</p>
    </li>`;
}
/** Défi du gang : affiche les défis en cours. Sans défi, le bloc reste masqué. */
async function loadChallenges() {
  const box = $('#defi');
  if (!box) return;
  try {
    const { data, error } = await sb.rpc('hg_challenges_active');
    if (error) throw error;
    const list = Array.isArray(data) ? data : [];
    if (!list.length) return; // pas de défi en cours : le bloc reste masqué
    box.innerHTML = `
      <h2 class="card-title" id="defi-title">${ICON.flag} Défi du gang</h2>
      <ul class="defi-list">${list.map(challengeHtml).join('')}</ul>`;
    box.hidden = false;
  } catch (e) {
    console.warn('[défis]', e);
  }
}

/* ---------- Question du jour (J4) ---------- */
/** Tuile « Question du jour » : seulement si la page Jeux est accessible. Module chargé à la demande (jeux/jour-ui.js). */
async function loadDailyQuestion() {
  const box = $('#qdj-home');
  if (!box || !canAccess('jeux')) return;
  try {
    const { mountDaily } = await import('../jeux/jour-ui.js');
    box.hidden = false;
    await mountDaily(box, { sb, esc, toast, compact: true, meId: me.id });
  } catch (e) {
    console.warn('[question du jour]', e);
    box.hidden = true;
  }
}

/* ---------- Rendez-vous saisonniers (migration 096) ---------- */
/** Calendrier de l'Avent (décembre) et saison des Worlds : module chargé à la demande (saisons.js). */
async function loadSeasonal() {
  try {
    const { mountSeasonal } = await import('./saisons.js');
    await mountSeasonal($('#saison-home'));
  } catch (e) {
    console.warn('[saisons]', e);
  }
}

/* ---------- Visite guidée (Q1) ---------- */
/**
 * Lance la visite (ou son bandeau) quand elle peut s'afficher : le module tour.js n'est chargé que dans ce cas.
 * Même condition que maybeStartTour (core/tour.js) : adresse #visite, visite non coupée et jamais vue ou bandeau à proposer.
 * @param {object} profil Profil du membre connecté.
 */
function lanceVisite(profil) {
  if (!profil) return;
  const due = location.hash === '#visite' || (siteIdentite().visite_active !== false && ['jamais', 'ancien'].includes(tourState(profil)));
  if (due) import('../../commun/core/tour.js').then((m) => m.maybeStartTour(profil)).catch((e) => console.warn('[visite]', e));
}

/* ---------- Tuiles vers des pages interdites : retirées ---------- */
/** Tuile → page protégée qu'elle ouvre (pour retirer les tuiles auxquelles la personne n'a pas accès). */
const TILE_PAGE = { 'tile-ss': 'secret-santa', 'tile-irl': 'irl', 'tile-hist': 'historique', 'tile-day': 'historique' };
/** Retire les tuiles vers des pages interdites. Si toutes les tuiles disparaissent, le bloc entier est retiré. */
function hideForbiddenTiles() {
  for (const [id, slug] of Object.entries(TILE_PAGE)) if (!canAccess(slug)) $(`#${id}`)?.remove();
  const tiles = $('.home-tiles');
  if (tiles && !tiles.children.length) tiles.remove();
}
/** Vrai si la tuile existe encore dans la page (pas retirée par hideForbiddenTiles). */
const tileOn = (id) => !!document.getElementById(id);

/* ---------- Lancement ---------- */
if (!me) {
  renderGuest();
} else {
  syncIntro();
  renderMemberShell();
  hideForbiddenTiles();
  // Accueil personnalisable (idée P9) : ordre, blocs masqués (retirés avant tout chargement) et blocs ajoutés
  const home = await import('./home-blocks.js').then((m) => m.applyHomeLayout(app, me)).catch((e) => { console.warn('[accueil perso]', e?.message || e); return null; });
  placerHaut();
  app.addEventListener('hg:home-arrange', placerHaut);
  if ($('#idea-form')) bindIdeas();
  // Boîte à idées demandée par le lien : montrée tout de suite, puis de nouveau une fois les blocs du dessus chargés
  // (sinon leur contenu la repousse plus bas et le lien semble ne rien faire).
  requestAnimationFrame(() => allerAuxIdees());
  window.addEventListener('hashchange', () => allerAuxIdees(true));
  await Promise.allSettled([
    tileOn('tile-ss') ? loadSecretSanta() : null, tileOn('tile-irl') ? loadIrl() : null, tileOn('tile-hist') ? loadHistory() : null,
    loadTheme(), tileOn('tile-admin') ? loadAdminTile() : null,
    $('#feed') ? loadFeed() : null, ($('#bdays') ? loadBirthdays() : Promise.resolve()).then(loadCartesAnniv), loadDynBanner(), $('#defi') ? loadChallenges() : null, loadDailyQuestion(), loadSeasonal(),
    home?.loadOwn(),
    tileOn('tile-day') ? import('./accueil-ce-jour.js').then((m) => m.loadOnThisDay($('#tile-day'), me)) : null, // module chargé seulement si la tuile existe
  ]);
  // Places réservées restées vides (bloc absent cette fois) : retirées ; la visite suivante réserve selon ce qui s'affiche
  for (const el of app.querySelectorAll('.is-attente')) { el.classList.remove('is-attente'); el.hidden = true; el.innerHTML = ''; el.removeAttribute('aria-hidden'); }
  noterBlocs();
  allerAuxIdees(true);
  lanceVisite(me); // après les tuiles : la visite éclaire des éléments déjà en place
}
app.removeAttribute('aria-busy');
