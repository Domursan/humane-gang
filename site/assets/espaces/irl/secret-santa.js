// ===== Humane Gang — page Secret Santa (/pages/irl/secret-santa.html) =====
// Une édition par an. Étapes : inscriptions, tirage, envoi des cadeaux, révélation, terminée.
// Le membre voit : son inscription, sa liste de souhaits, la carte de sa cible (retournable, téléchargeable),
// la liste de souhaits de la cible et ce qu'il faut savoir sur elle, la messagerie anonyme, son envoi,
// l'avancement global, puis la révélation des paires.
// Dépendances : core.js (Supabase, LOGO_SRC, notifications), ss-card.js (cartes), profile-fields.js (infos de la cible),
// ui-confirm.js, ss-pairs.js (paires), reglages-valeurs-lot3.js (limite de souhaits), utils.js (liens sûrs).
// Tables et RPC : hg_ss_editions, hg_ss_participants, hg_ss_wishes, hg_ss_progress, hg_members, hg_ss_my_target,
// hg_ss_target_info, hg_ss_reveal, hg_open_santa. N'exporte rien.
import { sb, initPage, toast, errMsg, esc, $, fmtDate, fmtDateTime, daysUntil, avatarHtml, notify, LOGO_SRC, isGodMode, godTag, lireLocal, ecrireLocal } from '../../commun/core.js';
import { renderCardFront, renderCardBack, downloadCanvas } from './ss-card.js';
import { INFO_GROUPS, INFO_LABEL } from '../compte/profile-fields.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { svg } from '../../commun/icons.js';
import { safeUrl } from '../../commun/utils.js';
import { pairsHtml, peopleByPseudo } from './ss-pairs.js';
import { chargerReglagesLot3, reglage } from '../admin/reglages-valeurs-lot3.js';

// me = personne connectée (la page exige un membre). Les réglages du lot 3 sont chargés avant le premier rendu.
const me = await initPage({ auth: 'member' });
await chargerReglagesLot3();
const app = $('#app');

/* Étapes de l'édition, dans l'ordre : [statut, libellé affiché dans la barre d'étapes]. */
const STEPS = [['inscriptions', 'Inscriptions'], ['tirage', 'Tirage'], ['envoi', 'Envoi'], ['revelation', 'Révélation']];
/** Ordre des statuts d'une édition, du premier au dernier. */
const ORDER = ['inscriptions', 'tirage', 'envoi', 'revelation', 'termine'];
/** Statuts où le tirage est fait : chaque inscrit a alors une cible. */
const DRAWN = ['envoi', 'revelation', 'termine'];

/* ---------- Icônes (SVG à trait) ---------- */
const I = {
  check: svg('check', { size: 14, stroke: 3 }),
  flip: svg('flip', { size: 18, stroke: 2 }),
  download: svg('download3', { size: 18, stroke: 2 }),
  trash: svg('trash3', { size: 18, stroke: 2 }),
  link: svg('link3', { size: 14, stroke: 2 }),
  chat: svg('chat2', { size: 18, stroke: 2 }),
  gift: svg('gift2', { size: 20, stroke: 2 }),
  box: svg('box', { size: 20, stroke: 2 }),
};

/* ---------- État ---------- */
/* État de la page : édition, ma participation, membres, ma liste de souhaits, ma cible et sa liste, avancement, révélation. */
const S = {
  ed: null,
  mine: null,           // ma ligne hg_ss_participants
  participants: [],     // lignes hg_ss_participants
  members: new Map(),   // id -> {pseudo, avatar_url, color}
  myWishes: [],
  target: null,         // {receiver_id, pseudo, avatar_url}
  targetWishes: [],
  targetInfo: {},       // infos diverses de la cible (filtrées par shared_fields côté base)
  progress: null,       // {participants, sent, received}
  reveal: [],
  revealed: false,      // carte déjà retournée une fois (mémorisé localement)
};

/* ---------- Utilitaires ---------- */
/** Nom de domaine d'une adresse, sans « www. », pour l'afficher sous un souhait. Chaîne vide si l'adresse est invalide. */
function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
/** Clé du stockage local : carte déjà retournée, pour cette édition seulement ; rangée par compte (comptes-etat.js). */
const seenKey = () => `hg_ss_seen_${S.ed?.id}`;
/** Vrai si j'ai déjà retourné ma carte pour cette édition. Faux si le stockage est indisponible. */
function readSeen() { return lireLocal(seenKey()) === '1'; }
/** Mémorise que ma carte a été retournée. Une erreur de stockage est ignorée. */
function writeSeen() { ecrireLocal(seenKey(), '1'); }
/** Membre à partir de son identifiant ; valeurs par défaut s'il est inconnu. */
const memberOf = (id) => S.members.get(id) || { pseudo: 'Membre', avatar_url: null, color: null };
/** Position du statut actuel dans l'ordre des étapes. */
const stepIndex = () => ORDER.indexOf(S.ed.status);
/** Vrai si le tirage est fait (chacun a une cible). */
const isDrawn = () => DRAWN.includes(S.ed.status);
/** Vrai pendant la révélation et après. */
const isReveal = () => ['revelation', 'termine'].includes(S.ed.status);
/** Mode sans limite (admin) : inscription libre quel que soit le statut, envoi/réception modifiables. */
const god = () => !!me?.is_admin && isGodMode();
/** Libellé lisible d'un statut, utilisé dans les messages. */
const STATUS_TXT = { inscriptions: 'inscriptions ouvertes', tirage: 'tirage en préparation', envoi: 'envoi des cadeaux', revelation: 'révélation', termine: 'terminée' };

/* ---------- Chargement ---------- */
/**
 * Charge les inscrits de l'édition (RPC hg_ss_people : pseudo et date d'inscription, sans les dates d'envoi ni de
 * réception des autres, qui trahiraient le Santa), et ma propre ligne de participation (seule ligne lisible).
 */
async function loadParticipants() {
  const [mine, people] = await Promise.all([
    sb.from('hg_ss_participants').select('user_id, sent_at, received_at, joined_at')
      .eq('edition_id', S.ed.id).eq('user_id', me.id).maybeSingle(),
    sb.rpc('hg_ss_people', { p_edition: S.ed.id }),
  ]);
  if (mine.error) throw mine.error;
  if (people.error) throw people.error;
  S.mine = mine.data || null;
  S.participants = (people.data || []).map((p) => (S.mine && p.user_id === me.id ? S.mine : p));
  if (S.mine && !S.participants.some((p) => p.user_id === me.id)) S.participants.push(S.mine);
}
/** Charge ma liste de souhaits pour cette édition. */
async function loadMyWishes() {
  const { data, error } = await sb.from('hg_ss_wishes')
    .select('id, label, url, created_at').eq('edition_id', S.ed.id).eq('user_id', me.id).order('created_at');
  if (error) throw error;
  S.myWishes = data || [];
}
/** Charge l'avancement : nombre d'inscrits, de cadeaux envoyés et de cadeaux reçus. */
async function loadProgress() {
  const { data, error } = await sb.rpc('hg_ss_progress', { p_edition: S.ed.id });
  if (error) throw error;
  S.progress = (Array.isArray(data) ? data[0] : data) || { participants: 0, sent: 0, received: 0 };
}

/**
 * Charge la page : édition la plus récente, membres, inscrits, puis selon le statut la cible et sa liste (tirage fait),
 * l'avancement, et les paires (révélation). Chaque bloc est indépendant : une erreur n'en bloque pas un autre.
 */
async function load() {
  const { data: ed, error } = await sb.from('hg_ss_editions').select('*')
    .order('year', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  S.ed = ed;
  if (!ed) return;
  S.revealed = readSeen();

  const [, membersRes] = await Promise.all([
    loadParticipants(),
    sb.rpc('hg_members'),
    loadMyWishes(),
  ]);
  if (membersRes.error) throw membersRes.error;
  S.members = new Map((membersRes.data || []).map((m) => [m.id, m]));

  const jobs = [];
  if (isDrawn()) {
    jobs.push(loadProgress().catch((e) => toast(`Avancement indisponible : ${errMsg(e)}`, 'error')));
    if (S.mine) {
      jobs.push((async () => {
        const { data, error: e } = await sb.rpc('hg_ss_my_target', { p_edition: ed.id });
        if (e) throw e;
        S.target = (Array.isArray(data) ? data[0] : data) || null;
        if (S.target) {
          const { data: w, error: we } = await sb.from('hg_ss_wishes')
            .select('id, label, url, created_at').eq('edition_id', ed.id).eq('user_id', S.target.receiver_id).order('created_at');
          if (we) throw we;
          S.targetWishes = w || [];
          const { data: info, error: ie } = await sb.rpc('hg_ss_target_info', { p_edition: ed.id });
          if (ie) console.warn('[hg_ss_target_info]', ie); // non bloquant : la liste de souhaits reste affichée
          S.targetInfo = info && typeof info === 'object' && !Array.isArray(info) ? info : {};
        }
      })().catch((e) => toast(`Impossible de charger ta cible : ${errMsg(e)}`, 'error')));
    }
  }
  if (isReveal()) {
    jobs.push((async () => {
      const { data, error: e } = await sb.rpc('hg_ss_reveal', { p_edition: ed.id });
      if (e) throw e;
      S.reveal = data || [];
    })().catch((e) => toast(`Révélation indisponible : ${errMsg(e)}`, 'error')));
  }
  await Promise.all(jobs);
}

/* ---------- Rendu : squelette ---------- */
/** Page quand il n'existe encore aucune édition. */
function renderEmpty() {
  app.innerHTML = `
    <div class="page-head"><div>
      <div class="eyebrow">Secret Santa</div>
      <h1 class="page-title">Secret Santa</h1>
    </div></div>
    <div class="card card-ss ss-empty">
      <div class="ss-empty-icon" aria-hidden="true">${I.gift}</div>
      <h2>Pas encore d’édition</h2>
      <p class="muted">L’admin la lancera bientôt. Tu seras prévenu·e sur Discord dès l’ouverture des inscriptions.</p>
    </div>`;
}

/**
 * En-tête : numéro de l'édition, barre des étapes (passées, en cours, à venir), et les trois infos (budget, date limite d'envoi, date d'échange).
 * @returns {string} HTML
 */
function headHtml() {
  const idx = stepIndex();
  // Étapes en blocs pixel : passées et en cours en aplat de la couleur d'espace, à venir en creux.
  const pills = STEPS.map(([key, label], i) => {
    const cls = i < idx ? 'is-done' : i === idx ? 'is-current' : 'is-todo';
    const state = i < idx ? 'terminée' : i === idx ? 'en cours' : 'à venir';
    return `<li class="ss-step ${cls}"><span class="ss-step-n" aria-hidden="true">${i < idx ? I.check : i + 1}</span>`
      + `<span class="ss-step-lib">${label}</span><span class="ss-step-st"><span class="ss-step-dot" aria-hidden="true"></span>${state}</span></li>`;
  }).join('');
  // Barre d'avancement de l'édition : étapes atteintes (en cours comprise) sur 4 ; terminée = barre pleine.
  const reached = Math.min(idx + 1, STEPS.length);
  const bar = `<div class="ss-steps-bar" role="progressbar" aria-label="Avancement de l’édition" aria-valuemin="0" aria-valuemax="${STEPS.length}" aria-valuenow="${reached}" aria-valuetext="Étape ${reached} sur ${STEPS.length}">
      <span style="width:${Math.round((reached / STEPS.length) * 100)}%"></span></div>`;
  // Compte à rebours jusqu'à l'échange (date réelle de l'édition) ; rien d'inventé si la date n'est pas fixée.
  const dx = daysUntil(S.ed.exchange_date);
  let count;
  if (!S.ed.exchange_date || dx === null) {
    count = { lab: 'Échange · en attente', big: '', txt: 'Date d’échange pas encore fixée' };
  } else if (dx > 0 && S.ed.status !== 'termine') {
    count = { lab: 'Échange dans', big: `J-${dx}`, txt: `${dx > 1 ? `${dx} jours` : '1 jour'} avant l’échange du ${fmtDate(S.ed.exchange_date)}` };
  } else if (dx === 0) {
    count = { lab: 'Échange', big: 'Jour J', txt: 'L’échange, c’est aujourd’hui' };
  } else {
    count = { lab: 'Échange', big: '', txt: `Échange du ${fmtDate(S.ed.exchange_date)}` };
  }
  const live = count.big === 'Jour J' || (dx !== null && dx > 0 && dx <= 7 && S.ed.status !== 'termine');
  const countHtml = `
      <div class="ss-count${count.big ? '' : ' is-wait'}" role="group" aria-label="Compte à rebours de l’échange">
        <div class="ss-count-lab"><span class="ss-count-dot${live ? ' is-live' : ''}" aria-hidden="true"></span>${esc(count.lab)}</div>
        ${count.big ? `<p class="ss-count-big">${esc(count.big)}</p>` : ''}
        <p class="ss-count-txt">${esc(count.txt)}</p>
      </div>`;
  const dl = daysUntil(S.ed.send_deadline);
  const dlHint = S.ed.send_deadline && S.ed.status === 'envoi' && dl !== null
    ? (dl > 1 ? `dans ${dl} jours` : dl === 1 ? 'demain' : dl === 0 ? 'aujourd’hui' : 'dépassée') : '';
  const facts = [
    ['Budget', S.ed.budget ? esc(S.ed.budget) : '<span class="muted">à définir</span>'],
    ['Envoi avant le', S.ed.send_deadline ? `${esc(fmtDate(S.ed.send_deadline))}${dlHint ? ` <span class="ss-fact-hint">${esc(dlHint)}</span>` : ''}` : '<span class="muted">à définir</span>'],
    ['Échange le', S.ed.exchange_date ? esc(fmtDate(S.ed.exchange_date)) : '<span class="muted">à définir</span>'],
  ].map(([k, v]) => `<div class="ss-fact"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  return `
    <header class="page-head ss-head">
      <div class="ss-head-top">
        <div class="ss-head-title">
          <div class="eyebrow">Édition ${esc(S.ed.year)}</div>
          <h1 class="page-title">Secret Santa</h1>
        </div>
        ${countHtml}
      </div>
      <div class="ss-steps-wrap">
        <ol class="ss-steps" aria-label="Étapes de l’édition">${pills}${S.ed.status === 'termine' ? `<li class="ss-step is-done is-end"><span class="ss-step-n" aria-hidden="true">${I.check}</span><span class="ss-step-lib">Terminée</span><span class="ss-step-st">édition close</span></li>` : ''}</ol>
        ${bar}
      </div>
    </header>
    <dl class="ss-facts">${facts}</dl>`;
}

/**
 * Dessine toute la page selon le statut : inscriptions seules, ou tirage (carte de la cible, messages, envoi, avancement, révélation).
 * Le mode sans limite (admin) affiche aussi le bloc d'inscription pendant le tirage.
 */
function renderAll() {
  if (!S.ed) return renderEmpty();
  const st = S.ed.status;
  let body = '';
  if (!isDrawn()) {
    body = `
      <div class="row ss-section">
        <section class="card card-ss" id="ss-signup" aria-labelledby="ss-signup-t"></section>
        <section class="card" id="ss-people" aria-labelledby="ss-people-t"></section>
      </div>
      <section class="card ss-section" id="ss-mywishes" aria-labelledby="ss-mywishes-t"></section>`;
  } else {
    body = `
      ${god() ? '<section class="card card-ss ss-section" id="ss-signup" aria-labelledby="ss-signup-t"></section>' : ''}
      ${S.mine && S.target ? `
      <section class="ss-target ss-section" aria-labelledby="ss-card-t">
        <div class="ss-card-col" id="ss-card"></div>
        <div class="stack ss-side">
          <section class="card card-ss" id="ss-twishes" aria-labelledby="ss-twishes-t"></section>
          <section class="card" id="ss-msg" aria-labelledby="ss-msg-t"></section>
          <section class="card" id="ss-send" aria-labelledby="ss-send-t"></section>
        </div>
      </section>` : `<section class="card card-ss ss-section" id="ss-notarget"></section>`}
      ${['envoi', 'revelation'].includes(st) ? '<section class="card ss-section" id="ss-unwrap" aria-labelledby="ss-unwrap-t"></section>' : ''}
      <div class="row ss-section">
        <section class="card" id="ss-progress" aria-labelledby="ss-progress-t"></section>
        ${S.mine ? '<section class="card" id="ss-mywishes" aria-labelledby="ss-mywishes-t"></section>' : ''}
      </div>
      ${isReveal() ? '<section class="card card-ss ss-section" id="ss-reveal" aria-labelledby="ss-reveal-t"></section>' : ''}`;
  }
  app.innerHTML = headHtml() + body;
  app.dataset.status = st;

  if (!isDrawn()) { renderSignup(); renderPeople(); renderMyWishes(); return; }
  if (god()) renderSignup();
  if (S.mine && S.target) { renderCard(); renderTargetWishes(); renderSantaMsg(); renderSend(); } else renderNoTarget();
  renderProgress();
  if (S.mine) renderMyWishes();
  if (isReveal()) renderReveal();
  // Soirée déballage (migration 096) : module chargé à la demande, sans bloquer le reste de la page.
  const uw = $('#ss-unwrap');
  if (uw) import('./ss-unwrap.js').then((m) => m.mountUnwrap(uw, { ed: S.ed, me, members: S.members, onReveal: () => location.reload() }))
    .catch((e) => { console.warn('[déballage]', e); uw.remove(); });
}

/* ---------- Inscriptions ---------- */
/**
 * Bloc « Inscription » : nombre d'inscrits, et le bouton s'inscrire / se désinscrire selon le statut.
 * Le texte explique la situation (ouvert, clos, mode sans limite).
 */
function renderSignup() {
  const el = $('#ss-signup'); if (!el) return;
  const open = S.ed.status === 'inscriptions';
  const n = S.participants.length;
  let txt, btn = '';
  if (!open && god()) {
    txt = `Statut actuel : ${esc(STATUS_TXT[S.ed.status] || S.ed.status)}. ${S.mine ? 'Tu es inscrit·e.' : 'Tu n’es pas inscrit·e.'} Le mode sans limite te permet ${S.mine ? 'de te désinscrire' : 'de t’inscrire'} quand même${isDrawn() ? ' : le tirage est déjà fait, refais-le depuis l’administration pour que ça compte' : ''}.`;
    btn = S.mine
      ? `<button class="btn btn-ghost" type="button" id="ss-leave">Se désinscrire${godTag()}</button>`
      : `<button class="btn btn-primary" type="button" id="ss-join">S’inscrire${godTag()}</button>`;
  } else if (open) {
    txt = S.mine
      ? `Tu es inscrit·e depuis le ${esc(fmtDate(S.mine.joined_at))}. Pense à remplir ta liste de souhaits : elle aide ton Santa.`
      : 'Les inscriptions sont ouvertes. Inscris-toi pour participer au tirage.';
    btn = S.mine
      ? '<button class="btn btn-ghost" type="button" id="ss-leave">Se désinscrire</button>'
      : '<button class="btn btn-primary" type="button" id="ss-join">S’inscrire</button>';
  } else {
    txt = S.mine
      ? 'Les inscriptions sont closes et tu fais partie du tirage. Ta cible apparaîtra ici dès qu’il sera fait.'
      : 'Les inscriptions sont closes : le tirage arrive. Tu ne participes pas à cette édition.';
  }
  el.innerHTML = `
    <h2 id="ss-signup-t">${open || god() ? 'Inscription' : 'Tirage en préparation'}</h2>
    <p class="ss-big"><span class="display">${n}</span> ${n > 1 ? 'inscrits' : 'inscrit'}</p>
    <p class="muted">${txt}</p>
    ${btn ? `<div class="btn-row">${btn}</div>` : ''}`;
  $('#ss-join', el)?.addEventListener('click', (e) => join(e.currentTarget));
  $('#ss-leave', el)?.addEventListener('click', (e) => leave(e.currentTarget));
}

/**
 * M'inscrire à l'édition. Si le tirage est déjà fait, la page est rechargée entièrement.
 * @param {HTMLButtonElement} btn bouton « S'inscrire »
 */
async function join(btn) {
  btn.disabled = true;
  try {
    const { error } = await sb.from('hg_ss_participants').insert({ edition_id: S.ed.id, user_id: me.id });
    if (error) throw error;
    await loadParticipants();
    toast('Inscription enregistrée. Bienvenue dans le tirage !', 'ok');
    if (isDrawn()) { await load(); renderAll(); return; }
    renderSignup(); renderPeople(); renderMyWishes();
  } catch (e) { toast(`Inscription impossible : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}
/**
 * Me désinscrire, après confirmation. Si le tirage est fait, la page est rechargée entièrement.
 * La liste de souhaits est conservée.
 * @param {HTMLButtonElement} btn bouton « Se désinscrire »
 */
async function leave(btn) {
  if (!(await confirmBox('Te désinscrire de cette édition ?', 'Ta liste de souhaits est conservée.', { ok: 'Me désinscrire', danger: true }))) return;
  btn.disabled = true;
  try {
    const { error } = await sb.from('hg_ss_participants').delete().eq('edition_id', S.ed.id).eq('user_id', me.id);
    if (error) throw error;
    await loadParticipants();
    if (S.mine) throw new Error('la désinscription a été refusée');
    toast('Tu es désinscrit·e.', 'ok');
    if (isDrawn()) { S.target = null; await load(); renderAll(); return; }
    renderSignup(); renderPeople(); renderMyWishes();
  } catch (e) { toast(`Désinscription impossible : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}

/** Liste des inscrits, avec mon avatar mis en évidence (« toi »). */
function renderPeople() {
  const el = $('#ss-people'); if (!el) return;
  const rows = S.participants.map((p) => {
    const m = memberOf(p.user_id);
    return `<li class="ss-person${p.user_id === me.id ? ' is-me' : ''}">${avatarHtml(m, 36)}<span>${esc(m.pseudo)}</span>${p.user_id === me.id ? '<span class="ss-tag">toi</span>' : ''}</li>`;
  }).join('');
  el.innerHTML = `
    <h2 id="ss-people-t">Les inscrits</h2>
    ${rows ? `<ul class="ss-people">${rows}</ul>` : '<div class="empty">Personne pour l’instant. Lance le mouvement !</div>'}`;
}

/* ---------- Ma liste de souhaits ---------- */
/**
 * Une ligne de souhait : libellé, lien (si l'adresse est sûre), et bouton supprimer si on peut le retirer.
 * @param {object} w souhait
 * @param {{removable: boolean}} opts removable : afficher le bouton supprimer
 * @returns {string} HTML
 */
function wishItem(w, { removable }) {
  const url = safeUrl(w.url);
  const link = url ? `<a class="ss-wish-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${I.link}<span>${esc(hostOf(url))}</span><span class="visually-hidden"> (nouvel onglet)</span></a>` : '';
  const del = removable ? `<button class="btn btn-ghost ss-icon-btn" type="button" data-del="${esc(w.id)}" aria-label="Supprimer « ${esc(w.label)} »">${I.trash}</button>` : '';
  return `<li class="ss-wish"><div class="ss-wish-main"><span class="ss-wish-label">${esc(w.label)}</span>${link}</div>${del}</li>`;
}

/** Ma liste de souhaits, avec le formulaire d'ajout. Visible seulement une fois inscrit, et rappelle qu'elle n'est vue que par mon Santa. */
function renderMyWishes() {
  const el = $('#ss-mywishes'); if (!el) return;
  if (!S.mine) {
    el.innerHTML = `<h2 id="ss-mywishes-t">Ma liste de souhaits</h2>
      <div class="empty">Inscris-toi pour préparer ta liste de souhaits.</div>`;
    return;
  }
  const items = S.myWishes.map((w) => wishItem(w, { removable: true })).join('');
  el.innerHTML = `
    <h2 id="ss-mywishes-t">Ma liste de souhaits</h2>
    <p class="muted small ss-privacy">Visible uniquement par ton Santa. Rien d’autre de ton profil n’est partagé.</p>
    ${items ? `<ul class="ss-wishes">${items}</ul>` : '<div class="empty">Ta liste est vide. Une idée, un lien, une couleur préférée : tout aide.</div>'}
    <form class="ss-wish-form" id="ss-wish-form" novalidate>
      <div class="field">
        <label for="ss-w-label">Souhait</label>
        <input id="ss-w-label" name="label" required maxlength="200" autocomplete="off" placeholder="Ex. un livre de cuisine coréenne">
      </div>
      <div class="field">
        <label for="ss-w-url">Lien (facultatif)</label>
        <input id="ss-w-url" name="url" type="url" inputmode="url" maxlength="2000" autocomplete="off" placeholder="https://…">
      </div>
      <button class="btn btn-primary" type="submit">Ajouter</button>
    </form>`;
  $('#ss-wish-form', el).addEventListener('submit', addWish);
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => delWish(b)));
}

/**
 * Ajoute un souhait. Vérifie le libellé, le lien (http ou https uniquement) et la limite de souhaits réglée.
 * @param {Event} e soumission du formulaire
 */
async function addWish(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const label = f.label.value.trim();
  const rawUrl = f.url.value.trim();
  if (!label) { toast('Écris ton souhait avant de l’ajouter.', 'error'); f.label.focus(); return; }
  if (label.length > 200) { toast('200 caractères maximum.', 'error'); return; }
  const url = rawUrl ? safeUrl(rawUrl) : null;
  if (rawUrl && !url) { toast('Lien invalide : seules les adresses http ou https sont acceptées.', 'error'); f.url.focus(); return; }
  const max = reglage('ss.souhaits_max');
  if (max !== null && S.myWishes.length >= max) { toast(`Tu as atteint la limite de ${max} souhait${max > 1 ? 's' : ''}.`, 'error'); return; }
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const { data, error } = await sb.from('hg_ss_wishes')
      .insert({ edition_id: S.ed.id, user_id: me.id, label, url }).select('id, label, url, created_at').single();
    if (error) throw error;
    S.myWishes.push(data);
    renderMyWishes();
    $('#ss-w-label')?.focus();
    toast('Souhait ajouté.', 'ok');
  } catch (err) { toast(`Ajout impossible : ${errMsg(err)}`, 'error'); btn.disabled = false; }
}

/**
 * Supprime un de mes souhaits.
 * @param {HTMLButtonElement} btn bouton supprimer, qui porte l'identifiant du souhait
 */
async function delWish(btn) {
  const id = btn.dataset.del;
  btn.disabled = true;
  try {
    const { error } = await sb.from('hg_ss_wishes').delete().eq('id', id).eq('user_id', me.id);
    if (error) throw error;
    S.myWishes = S.myWishes.filter((w) => w.id !== id);
    renderMyWishes();
    toast('Souhait supprimé.', 'ok');
  } catch (err) { toast(`Suppression impossible : ${errMsg(err)}`, 'error'); btn.disabled = false; }
}

/* ---------- La carte ---------- */
/**
 * Carte de la cible : carte retournable, face avant (« Tu offres à … ») et face arrière (logo).
 * La génération des deux images est lancée ici ; le téléchargement ne s'active qu'une fois prêt.
 */
function renderCard() {
  const el = $('#ss-card'); if (!el) return;
  el.innerHTML = `
    <div class="ss-card-head">
      <div class="eyebrow">Ta cible</div>
      <h2 id="ss-card-t" class="ss-card-title">${S.revealed ? 'Ta carte' : 'Retourne la carte'}</h2>
    </div>
    <button class="ss-flip" type="button" id="ss-flip" aria-pressed="false" aria-label="Retourner la carte">
      <span class="ss-flip-inner">
        <span class="ss-face ss-face-back"><canvas id="ss-cv-back" width="1000" height="1400" aria-hidden="true"></canvas></span>
        <span class="ss-face ss-face-front"><canvas id="ss-cv-front" width="1000" height="1400" role="img" aria-label="Carte Secret Santa"></canvas></span>
        <span class="ss-card-loading" aria-hidden="true"><span class="ss-spinner"></span></span>
      </span>
    </button>
    <p class="visually-hidden" id="ss-flip-live" aria-live="polite"></p>
    <div class="btn-row ss-card-actions">
      <button class="btn btn-sand" type="button" id="ss-flip-btn">${I.flip}<span>Retourner la carte</span></button>
      <button class="btn btn-ghost" type="button" id="ss-dl" disabled>${I.download}<span>Télécharger la carte</span></button>
    </div>`;

  const flip = $('#ss-flip', el);
  const front = $('#ss-cv-front', el);
  const back = $('#ss-cv-back', el);
  const dl = $('#ss-dl', el);
  // Retourner la carte. La première fois, la cible et sa liste se découvrent (mémorisé localement).
  const toggle = () => {
    const on = !flip.classList.contains('is-flipped');
    flip.classList.toggle('is-flipped', on);
    flip.setAttribute('aria-pressed', String(on));
    $('#ss-flip-live').textContent = on ? `Tu offres à ${S.target.pseudo}.` : 'Carte face cachée.';
    if (on && !S.revealed) {
      S.revealed = true; writeSeen();
      $('#ss-card-t').textContent = 'Ta carte';
      renderTargetWishes();
      renderSantaMsg();
    }
  };
  flip.addEventListener('click', toggle);
  $('#ss-flip-btn', el).addEventListener('click', toggle);
  dl.addEventListener('click', async () => {
    try { await downloadCanvas(front, `carte-secret-santa-${S.ed.year}.png`); }
    catch (e) { toast(`Téléchargement impossible : ${errMsg(e)}`, 'error'); }
  });

  // Date d'échange déjà formatée, passée telle quelle à la carte (le texte est rendu dans l'image).
  const exchangeLabel = S.ed.exchange_date ? fmtDate(S.ed.exchange_date) : '';
  Promise.all([
    renderCardBack(back, { logoSrc: LOGO_SRC, year: S.ed.year }),
    renderCardFront(front, { pseudo: S.target.pseudo, year: S.ed.year, baseUrl: S.ed.card_base_url, logoSrc: LOGO_SRC, budget: S.ed.budget, exchangeLabel }),
  ]).then(([, res]) => {
    flip.classList.add('is-ready');
    dl.disabled = false;
    if (S.ed.card_base_url && !res.usedBase) toast('Image de la carte indisponible : carte par défaut utilisée.', 'error');
  }).catch((e) => toast(`Génération de la carte impossible : ${errMsg(e)}`, 'error'));
}

/**
 * Liste de souhaits de ma cible et ce qu'il faut savoir sur elle. Masquée tant que la carte n'a pas été retournée.
 */
function renderTargetWishes() {
  const el = $('#ss-twishes'); if (!el) return;
  if (!S.revealed) {
    el.innerHTML = `<h2 id="ss-twishes-t">La liste de ta cible</h2>
      <div class="empty">Retourne la carte pour découvrir ta cible et sa liste de souhaits.</div>`;
    return;
  }
  const items = S.targetWishes.map((w) => wishItem(w, { removable: false })).join('');
  el.innerHTML = `
    <div class="ss-target-who">${avatarHtml({ ...memberOf(S.target.receiver_id), pseudo: S.target.pseudo, avatar_url: S.target.avatar_url || memberOf(S.target.receiver_id).avatar_url }, 44)}
      <div><div class="eyebrow">Tu offres à</div><h2 id="ss-twishes-t" class="ss-target-name">${esc(S.target.pseudo)}</h2></div>
    </div>
    ${items ? `<ul class="ss-wishes">${items}</ul>` : `<div class="empty">${esc(S.target.pseudo)} n’a pas encore rempli sa liste. Repasse plus tard, elle peut encore la compléter.</div>`}
    ${targetInfoHtml()}`;
}

/** Bloc « Ce qu'il faut savoir sur <pseudo> » : seulement les champs transmis par l'admin et remplis. */
function targetInfoHtml() {
  const info = S.targetInfo || {};
  /** Vrai si le champ d'information est renseigné. */
  const filled = (k) => typeof info[k] === 'string' ? info[k].trim() !== '' : info[k] != null && info[k] !== '';
  const known = new Set(INFO_GROUPS.flatMap((g) => g.fields.map((f) => f.id)));
  const groups = INFO_GROUPS.map((g) => ({ label: g.label, fields: g.fields.filter((f) => filled(f.id)) })).filter((g) => g.fields.length);
  const extra = Object.keys(info).filter((k) => !known.has(k) && filled(k));
  if (extra.length) groups.push({ label: 'Autres', fields: extra.map((k) => ({ id: k, label: INFO_LABEL[k] || k })) });
  if (!groups.length) return '';
  return `
    <section class="ss-info" aria-labelledby="ss-info-t">
      <h3 id="ss-info-t" class="ss-info-title">Ce qu’il faut savoir sur ${esc(S.target.pseudo)}</h3>
      ${groups.map((g) => `
        <div class="ss-info-group">
          <h4 class="ss-info-glabel">${esc(g.label)}</h4>
          <dl class="ss-info-list">${g.fields.map((f) => `
            <div class="ss-info-item"><dt>${esc(INFO_LABEL[f.id] || f.label)}</dt><dd>${esc(String(info[f.id]).trim())}</dd></div>`).join('')}
          </dl>
        </div>`).join('')}
    </section>`;
}

/* ---------- Messagerie anonyme ---------- */
/** Bloc des messages secrets : écrire à ma cible (après avoir retourné la carte) ou à mon Santa. */
function renderSantaMsg() {
  const el = $('#ss-msg'); if (!el) return;
  el.innerHTML = `
    <h2 id="ss-msg-t">Messages secrets</h2>
    <p class="muted small">${S.revealed
      ? `Pose une question à ${esc(S.target.pseudo)} sans te dévoiler : tu apparais comme « Ton Santa ». Ton Santa peut aussi t’écrire.`
      : 'Retourne la carte pour pouvoir écrire à ta cible. Tu peux déjà écrire à ton Santa : il reste anonyme.'}</p>
    <div class="btn-row">
      ${S.revealed ? `<button class="btn btn-sand" type="button" data-ss-msg="target">${I.chat}<span>Écrire à ma cible (anonyme)</span></button>` : ''}
      <button class="btn btn-ghost" type="button" data-ss-msg="santa">${I.chat}<span>Écrire à mon Santa</span></button>
    </div>`;
  el.querySelectorAll('[data-ss-msg]').forEach((b) => b.addEventListener('click', () => openSantaChat(b, b.dataset.ssMsg)));
}
/**
 * Ouvre (ou crée) la conversation anonyme avec la cible ou le Santa, puis va à la messagerie.
 * @param {HTMLButtonElement} btn bouton cliqué (désactivé pendant l'ouverture)
 * @param {'target'|'santa'} role côté de la conversation
 */
async function openSantaChat(btn, role) {
  btn.disabled = true;
  try {
    const { data, error } = await sb.rpc('hg_open_santa', { p_edition: S.ed.id, p_role: role });
    if (error) throw error;
    const id = Array.isArray(data) ? data[0] : data;
    if (!id) throw new Error('conversation non créée');
    location.href = `/pages/compte/messages.html?c=${encodeURIComponent(id)}`;
  } catch (e) { toast(`Messagerie indisponible : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}

/* ---------- Mon envoi ---------- */
/**
 * Bloc « Mon envoi » : marquer mon cadeau envoyé, et mon cadeau reçu. Les actions se verrouillent après la fin de l'édition
 * (sauf en mode sans limite) ; en mode sans limite, on peut annuler une coche.
 */
function renderSend() {
  const el = $('#ss-send'); if (!el) return;
  const sent = S.mine?.sent_at, rec = S.mine?.received_at;
  // L'envoi se note pendant la phase « envoi », la réception pendant l'envoi ou la révélation (règle de la base) ;
  // en dehors, les cases ne se cochent plus, sauf en mode sans limite.
  const sendOpen = S.ed.status === 'envoi', recOpen = ['envoi', 'revelation'].includes(S.ed.status);
  const closedSent = !sendOpen && !god(), closedRec = !recOpen && !god();
  const tagSent = sendOpen ? '' : godTag(), tagRec = recOpen ? '' : godTag();
  /** Bouton « Annuler » d'une coche, réservé au mode sans limite ; chaîne vide sinon. */
  const undo = (field, label) => (god() && S.mine?.[field] ? `<button class="btn btn-ghost btn-sm" type="button" data-undo="${field}">Annuler « ${label} »${godTag()}</button>` : '');
  el.innerHTML = `
    <h2 id="ss-send-t">Mon envoi</h2>
    <ul class="ss-checks">
      <li class="ss-check${sent ? ' is-done' : ''}">
        <span class="ss-check-icon" aria-hidden="true">${sent ? I.check : I.gift}</span>
        <div class="ss-check-body">
          <strong>Cadeau envoyé</strong>
          <span class="muted small">${sent ? `Le ${esc(fmtDateTime(sent))}` : 'Pas encore'}</span>
        </div>
        <button class="btn ${sent ? 'btn-ghost' : 'btn-primary'}" type="button" id="ss-sent"${sent || closedSent ? ' disabled' : ''}>${sent ? 'Envoyé' : `J’ai envoyé le cadeau${tagSent}`}</button>
      </li>
      <li class="ss-check${rec ? ' is-done' : ''}">
        <span class="ss-check-icon" aria-hidden="true">${rec ? I.check : I.box}</span>
        <div class="ss-check-body">
          <strong>Mon cadeau reçu</strong>
          <span class="muted small">${rec ? `Le ${esc(fmtDateTime(rec))}` : 'Pas encore'}</span>
        </div>
        <button class="btn ${rec ? 'btn-ghost' : 'btn-sand'}" type="button" id="ss-received"${rec || closedRec ? ' disabled' : ''}>${rec ? 'Reçu' : `J’ai reçu le mien${tagRec}`}</button>
      </li>
    </ul>
    ${undo('sent_at', 'envoyé') || undo('received_at', 'reçu') ? `<div class="btn-row">${undo('sent_at', 'envoyé')}${undo('received_at', 'reçu')}</div>` : ''}
    <p class="muted small">Le destinataire est prévenu (notification du site, ou message du bot Discord s’il n’est pas connecté), sans révéler qui tu es.</p>`;
  $('#ss-sent', el).addEventListener('click', (e) => mark(e.currentTarget, 'sent_at', 'ss_gift_sent', 'Envoi noté. Ton destinataire va être prévenu.'));
  $('#ss-received', el).addEventListener('click', (e) => mark(e.currentTarget, 'received_at', 'ss_gift_received', 'Réception notée. Ton Santa va être prévenu.'));
  el.querySelectorAll('[data-undo]').forEach((b) => b.addEventListener('click', () => unmark(b, b.dataset.undo)));
}

/**
 * Coche « envoyé » ou « reçu » : enregistre la date, prévient la personne concernée par le bot, puis met à jour l'avancement.
 * @param {HTMLButtonElement} btn bouton cliqué
 * @param {'sent_at'|'received_at'} field champ à renseigner
 * @param {string} event nom de la notification envoyée au bot
 * @param {string} okMsg message de confirmation
 */
async function mark(btn, field, event, okMsg) {
  if (S.mine?.[field]) return;
  btn.disabled = true;
  try {
    const { data, error } = await sb.from('hg_ss_participants')
      .update({ [field]: new Date().toISOString() })
      .eq('edition_id', S.ed.id).eq('user_id', me.id)
      .select('user_id, sent_at, received_at, joined_at').single();
    if (error) throw error;
    S.mine = data;
    const i = S.participants.findIndex((p) => p.user_id === me.id);
    if (i >= 0) S.participants[i] = data;
    renderSend();
    toast(okMsg, 'ok');
    notify(event, { edition_id: S.ed.id });
    try { await loadProgress(); renderProgress(); } catch {}
  } catch (e) { toast(`Enregistrement impossible : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}

/** Mode sans limite : remet « envoyé » ou « reçu » à « pas encore » (sans notification). */
/**
 * Mode sans limite : remet « envoyé » ou « reçu » à « pas encore ». Aucune notification n'est envoyée.
 * @param {HTMLButtonElement} btn bouton annuler
 * @param {'sent_at'|'received_at'} field champ à effacer
 */
async function unmark(btn, field) {
  if (!god() || !S.mine?.[field]) return;
  btn.disabled = true;
  try {
    const { data, error } = await sb.from('hg_ss_participants')
      .update({ [field]: null })
      .eq('edition_id', S.ed.id).eq('user_id', me.id)
      .select('user_id, sent_at, received_at, joined_at').single();
    if (error) throw error;
    S.mine = data;
    const i = S.participants.findIndex((p) => p.user_id === me.id);
    if (i >= 0) S.participants[i] = data;
    renderSend();
    toast('Remis à « pas encore ».', 'ok');
    try { await loadProgress(); renderProgress(); } catch {}
  } catch (e) { toast(`Enregistrement impossible : ${errMsg(e)}`, 'error'); btn.disabled = false; }
}

/* ---------- Pas de cible / non participant ---------- */
/** Bloc affiché quand il n'y a pas de cible : inscrit sans cible (après le tirage), ou non participant. */
function renderNoTarget() {
  const el = $('#ss-notarget'); if (!el) return;
  el.innerHTML = S.mine
    ? `<h2>Ta cible n’est pas encore disponible</h2>
       <p class="muted">Tu es inscrit·e mais aucune cible ne t’a été attribuée (inscription après le tirage ?). Contacte l’admin via l’<a href="/pages/infos/assistance.html">assistance</a>.</p>`
    : `<h2>Tu ne participes pas à cette édition</h2>
       <p class="muted">Les inscriptions sont closes. Tu peux suivre l’avancement ci-dessous${isReveal() ? ' et découvrir la révélation' : ''}. Rendez-vous l’an prochain !</p>`;
}

/* ---------- Avancement ---------- */
/** Avancement : deux barres (cadeaux envoyés, cadeaux reçus) en pourcentage des inscrits. */
function renderProgress() {
  const el = $('#ss-progress'); if (!el) return;
  const p = S.progress || { participants: 0, sent: 0, received: 0 };
  const pct = p.participants ? Math.round((p.sent / p.participants) * 100) : 0;
  const pctR = p.participants ? Math.round((p.received / p.participants) * 100) : 0;
  el.innerHTML = `
    <h2 id="ss-progress-t">Avancement</h2>
    <p class="ss-big"><span class="display">${pct}</span><span class="ss-pct">%</span></p>
    <div class="progress ss-progress" role="progressbar" aria-label="Cadeaux envoyés" aria-valuemin="0" aria-valuemax="${p.participants}" aria-valuenow="${p.sent}">
      <span style="width:${pct}%"></span>
    </div>
    <div class="progress ss-progress ss-progress-rec" role="progressbar" aria-label="Cadeaux reçus" aria-valuemin="0" aria-valuemax="${p.participants}" aria-valuenow="${p.received}">
      <span style="width:${pctR}%"></span>
    </div>
    <p class="muted">${p.sent} / ${p.participants} ${p.sent > 1 ? 'cadeaux envoyés' : 'cadeau envoyé'} · ${p.received} ${p.received > 1 ? 'reçus' : 'reçu'}</p>`;
}

/* ---------- Révélation ---------- */
/** Bloc de révélation : qui offrait à qui. Les paires viennent de la base (ss-pairs.js). */
function renderReveal() {
  const el = $('#ss-reveal'); if (!el) return;
  const done = S.ed.status === 'termine';
  el.innerHTML = `
    <div class="eyebrow">Les masques tombent</div>
    <h2 id="ss-reveal-t" class="ss-reveal-title">${done ? 'Qui a offert à qui' : 'Qui offrait à qui'}</h2>
    ${pairsHtml(S.reveal, peopleByPseudo(S.members), { mePseudo: me.pseudo, emptyText: done ? 'Paires non enregistrées.' : 'Aucune attribution à afficher.' })}`;
}

/* ---------- Démarrage ---------- */
// Mode sans limite activé ou désactivé : on redessine toute la page.
window.addEventListener('hg:godmode', () => { if (me?.is_admin && S.ed) renderAll(); });
try {
  await load();
  renderAll();
} catch (e) {
  app.innerHTML = `
    <div class="page-head"><div><div class="eyebrow">Secret Santa</div><h1 class="page-title">Secret Santa</h1></div></div>
    <div class="card"><h2>Chargement impossible</h2><p class="muted">${esc(errMsg(e))}</p>
    <div class="btn-row"><button class="btn btn-primary" type="button" data-action="reload">Réessayer</button></div></div>`;
  toast(`Secret Santa : ${errMsg(e)}`, 'error');
}
