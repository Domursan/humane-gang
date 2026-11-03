// ===== Humane Gang — challenge de la semaine (/pages/compte/challenge.html, membres) =====
// Rôle : la page du challenge en cours, selon sa phase (hg_wch_phase) : à venir (compte à rebours, consignes),
// participation (formulaire, mes participations, retrait), vote (participations anonymes dans un ordre propre à chacun,
// bouton « Voter » / « Ta voix », lecture seule pour qui n'a pas participé), dépouillement, attente du choix de l'admin,
// terminé (gagnant mis en avant, classement, archives), sans gagnant ; sans challenge : état vide et archives.
// Toutes les données passent par les RPC de la migration 218 (les membres n'ont aucun accès direct aux tables).
// Dépendances : core.js (initPage, sb, esc, toast, avatarHtml), icons.js, ui-confirm.js, challenge-commun.js (textes, dates,
// compte à rebours), fichiers.js (contrôle, envoi et aperçu des fichiers du bucket hg-challenges).
// RPC : hg_wch_page, hg_wch_enter, hg_wch_withdraw, hg_wch_vote. N'exporte rien.
import { sb, initPage, esc, $, errMsg, toast, avatarHtml } from '../../commun/core.js';
import { svg } from '../../commun/icons.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { phasePill, typeOf, nf, quand, jourCourt, jourHeure, dateAn, semaineDu, periode, rebours, tickRebours, gainTexte, pluriel } from './challenge-commun.js';
import { WCH_MAX_BYTES, fileSize, kindOf, acceptOf, prepareEntryFile, uploadEntryFile, removeEntryFiles, mediaHtml, thumbHtml, hydrateMedia } from './fichiers.js';

const me = await initPage({ auth: 'member' });
const app = $('#app');

/** Icône à trait (taille en px). */
const I = (n, s = 20) => svg(n, { size: s, stroke: 1.8 });
/** Longueurs maximales (mêmes bornes que la base). */
const MAX_LEGENDE = 200, MAX_TEXTE = 2000;
/** Phases après la fin du vote. */
const APRES = new Set(['cloture', 'attente', 'termine', 'sans_gagnant']);

/* ---------- État de la page ---------- */
// data : réponse de hg_wch_page ; pending : fichier choisi et préparé, pas encore envoyé ({ prepared, url } ; url = aperçu
// local d'une image, à libérer) ; busy : envoi en cours ; lastLoad : instant du dernier chargement (relecture bornée).
const ST = { data: null, pending: null, busy: false, lastLoad: 0 };

/* ---------- Chargement ---------- */
/** Lit le challenge et les archives, puis dessine la page. En cas d'erreur, un message et « Réessayer ». */
async function load() {
  ST.lastLoad = Date.now();
  try {
    const { data, error } = await sb.rpc('hg_wch_page');
    if (error) throw error;
    ST.data = { current: data?.current || null, archives: Array.isArray(data?.archives) ? data.archives : [] };
    render();
  } catch (e) {
    app.innerHTML = tete('Autres') + `<div class="empty chl-empty" role="alert"><p><strong>Impossible de charger le challenge.</strong></p>
      <p>${esc(errMsg(e))}</p><div class="btn-row"><button class="btn btn-ghost" type="button" data-action="retry">Réessayer</button></div></div>`;
  }
  app.removeAttribute('aria-busy');
}

/* ---------- Morceaux communs ---------- */
/** En-tête de la page : surtitre et titre. */
const tete = (eyebrow) => `<div class="page-head"><div><p class="eyebrow">${esc(eyebrow)}</p><h1 class="page-title">Challenge de la semaine</h1></div></div>`;

/** Bloc « Gain du gagnant » (Paillettes, lot facultatif), ou '' sans gain. */
function gainHtml(c) {
  const pa = Number(c.reward_paillettes) || 0;
  const lot = String(c.reward_text || '').trim();
  if (!pa && !lot) return '';
  const verse = APRES.has(c.phase);
  const quandVerse = pa ? (verse ? 'Versé à la fin du vote.' : 'Versées automatiquement à la fin du vote.') : 'Remis par l’admin à la fin du vote.';
  return `<div class="chl-gain">
      <h3 class="chl-h">Gain du gagnant</h3>
      ${pa ? `<p class="chl-gain-n">${nf.format(pa)} <span>Paillettes</span></p>` : ''}
      ${lot ? `<p class="chl-gain-lot">${pa ? '+ ' : ''}${esc(lot)}</p>` : ''}
      <p class="small muted">${quandVerse} Ex æquo : chacun reçoit le gain complet.</p>
    </div>`;
}
/** Colonnes Comment, Pourquoi et Gain (sans les colonnes vides), ou ''. */
function colsHtml(c) {
  const items = [
    c.how_to ? `<div class="chl-col"><h3 class="chl-h">Comment</h3><p>${esc(c.how_to)}</p></div>` : '',
    c.why ? `<div class="chl-col"><h3 class="chl-h">Pourquoi</h3><p>${esc(c.why)}</p></div>` : '',
    gainHtml(c),
  ].filter(Boolean);
  return items.length ? `<div class="chl-cols">${items.join('')}</div>` : '';
}
/** Les trois étapes (participation, vote, résultat), l'étape en cours mise en avant. */
function stepsHtml(c) {
  const cur = { a_venir: -1, participation: 0, vote: 1 }[c.phase] ?? 2;
  const jours = Math.max(1, Math.round((new Date(c.vote_ends_at) - new Date(c.ends_at)) / 864e5));
  const ph = [
    ['Participation', periode(c.starts_at, c.ends_at)],
    ['Vote des participants', `${pluriel(jours, 'jour')}, jusqu’au ${jourCourt(c.vote_ends_at)}`],
    ['Résultat', gainTexte(c) ? 'gain versé à la fin du vote' : 'à la fin du vote'],
  ];
  return `<ol class="chl-steps" aria-label="Étapes du challenge">${ph.map(([t, s], i) => `<li class="${i < cur ? 'is-done' : i === cur ? 'is-on' : ''}"${i === cur ? ' aria-current="step"' : ''}><span class="chl-step-n">${i + 1}</span><span class="chl-step-txt"><strong>${t}</strong><span class="small muted">${esc(s)}</span></span></li>`).join('')}</ol>`;
}
/** En-tête du challenge : pastilles, nom, compte à rebours, consignes (dépliées pendant la participation), étapes. */
function heroHtml(c) {
  const t = typeOf(c.answer_type);
  let cd = '';
  if (c.phase === 'a_venir') cd = rebours('Début de la participation dans', c.starts_at);
  else if (c.phase === 'participation') cd = rebours('Fin de la participation dans', c.ends_at);
  else if (c.phase === 'vote') cd = rebours('Fin du vote dans', c.vote_ends_at);
  const cols = colsHtml(c);
  const ouvert = c.phase === 'participation' || c.phase === 'a_venir';
  return `<section class="card chl-hero" aria-labelledby="chl-name">
    <div class="chl-hero-head">
      <div class="chl-hero-txt">
        <div class="chl-pills">${phasePill(c.phase)}<span class="pill">${I('star', 16)} ${esc(t.attendu)}</span><span class="pill">${esc(pluriel(Number(c.max_entries) || 1, 'participation'))} par membre</span></div>
        <h2 class="chl-name" id="chl-name">${esc(c.title)}</h2>
      </div>
      ${cd}
    </div>
    ${cols ? (ouvert ? cols : `<details class="chl-consignes"><summary>Revoir les consignes et le gain</summary>${cols}</details>`) : ''}
    ${stepsHtml(c)}
  </section>`;
}
/** Carte de note (icône, texte en gras puis précision). */
const note = (ico, strong, txt, small, cls = '') => `<section class="card chl-note${cls ? ` ${cls}` : ''}" aria-label="${esc(strong.replace(/[.:]$/, ''))}">${I(ico, 22)}<div>
    <p><strong>${esc(strong)}</strong>${txt ? ` ${esc(txt)}` : ''}</p>${small ? `<p class="small muted">${esc(small)}</p>` : ''}</div></section>`;

/* ---------- Participation : formulaire et mes participations ---------- */
/** Pastille « 1 participation sur 2 ». */
function quotaHtml(nb, max) {
  return `<p class="chl-quota${nb >= max ? ' is-full' : ''}" id="chl-quota"><strong>${nb}</strong> participation${nb > 1 ? 's' : ''} sur ${max}</p>`;
}
/** Formulaire « Participer », ou l'encadré « quota atteint ». */
function formHtml(c) {
  const t = typeOf(c.answer_type);
  const nb = (c.my_entries || []).length, max = Number(c.max_entries) || 1;
  if (nb >= max) {
    return `<section class="card stack chl-form" id="chl-form" aria-labelledby="chl-form-t">
      <div class="chl-form-head"><h2 id="chl-form-t">Participer</h2>${quotaHtml(nb, max)}</div>
      <p class="chl-done">${I('check2', 22)} <span>${nb > 1 ? 'Tes participations sont envoyées.' : 'Ta participation est envoyée.'} Tu as atteint le nombre de participations de ce challenge.</span></p>
      <p class="small muted">Pour envoyer ${esc(t.autre)}, retire d’abord la tienne (dans « Mes participations »), avant le ${esc(quand(c.ends_at))}.</p>
    </section>`;
  }
  const champ = c.answer_type === 'texte'
    ? `<div class="field">
        <label for="chl-texte">${esc(t.ton)}</label>
        <textarea id="chl-texte" name="texte" rows="6" maxlength="${MAX_TEXTE}" required></textarea>
        <p class="small muted counter" id="chl-texte-n">0 / ${nf.format(MAX_TEXTE)}</p>
      </div>`
    : `<fieldset class="field sf-field" id="chl-file-field">
        <legend class="sf-legend">${esc(t.ton)}</legend>
        <ul class="sf-prep" id="chl-file-list" aria-label="${esc(t.nom.charAt(0).toUpperCase() + t.nom.slice(1))} à envoyer"></ul>
        <div class="sf-add-row"><button class="btn btn-ghost" type="button" id="chl-file-add" data-action="file-add" aria-describedby="chl-file-hint">${I('upload2', 18)} <span id="chl-file-add-t">${esc(t.choisir)}</span></button></div>
        <input type="file" id="chl-file-input" accept="${esc(acceptOf(c.answer_type))}" hidden>
        <p class="small muted" id="chl-file-hint">${esc(t.hint)}</p>
        <p class="form-error" id="chl-file-error" role="alert" hidden></p>
      </fieldset>`;
  return `<form class="card stack chl-form" id="chl-form" novalidate aria-labelledby="chl-form-t">
      <div class="chl-form-head"><h2 id="chl-form-t">Participer</h2>${quotaHtml(nb, max)}</div>
      <div class="field">
        <label for="chl-pseudo">Tu participes en tant que</label>
        <input id="chl-pseudo" name="pseudo" value="${esc(me.pseudo)}" readonly>
        <p class="small muted hint">Le pseudo de ton compte. Il reste caché pendant le vote.</p>
      </div>
      ${champ}
      <div class="field">
        <label for="chl-legende">Légende <span class="small muted">(facultatif)</span></label>
        <input id="chl-legende" name="legende" maxlength="${MAX_LEGENDE}" autocomplete="off" placeholder="${esc(t.placeholder)}">
        <p class="small muted counter" id="chl-legende-n">0 / ${MAX_LEGENDE}</p>
      </div>
      <p class="form-error" id="chl-form-error" role="alert" hidden></p>
      <div class="btn-row"><button class="btn btn-primary" type="submit" id="chl-submit">Envoyer ma participation</button></div>
      <p class="small muted">Les participations des autres restent cachées jusqu’au vote. Tu peux retirer la tienne tant que la participation est ouverte.</p>
    </form>`;
}
/** Nombre de mots d'un texte. */
const mots = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;
/** Colonne « Mes participations » : mes envois (retrait possible) et le nombre de participations cachées. */
function minesHtml(c) {
  const mes = c.my_entries || [];
  const n = Number(c.entries_count) || 0;
  const li = mes.map((e) => {
    const titre = e.caption || e.file_name || (e.body ? `${String(e.body).slice(0, 60)}${String(e.body).length > 60 ? '…' : ''}` : 'Ma participation');
    const poids = e.path ? fileSize(e.size) : pluriel(mots(e.body), 'mot');
    return `<li>${thumbHtml(e)}<span class="sf-meta"><strong class="sf-nm">${esc(titre)}</strong><span>Envoyée le ${esc(jourHeure(e.created_at))} · ${esc(poids)}</span></span>
      <button class="btn btn-danger btn-sm" type="button" data-action="withdraw" data-id="${esc(e.id)}">Retirer</button></li>`;
  }).join('');
  const cache = n
    ? `<strong>${esc(pluriel(n, 'participation envoyée', 'participations envoyées'))}.</strong> ${n > 1 ? 'Elles restent cachées' : 'Elle reste cachée'} jusqu’au vote, le ${esc(quand(c.ends_at))}.`
    : `<strong>Aucune participation pour l’instant.</strong> Les participations restent cachées jusqu’au vote, le ${esc(quand(c.ends_at))}.`;
  return `<aside class="card stack chl-aside" aria-labelledby="chl-mine-t">
      <h2 id="chl-mine-t">Mes participations</h2>
      ${mes.length ? `<ul class="sf-prep chl-mine">${li}</ul>` : '<p class="small muted">Tu n’as pas encore participé.</p>'}
      <div class="chl-hidden">${I('eyeOff', 20)}<p class="small">${cache}</p></div>
    </aside>`;
}

/* ---------- Vote : grille des participations ---------- */
/** Carte d'une participation (aperçu, numéro, légende, pied selon le mode). */
function entryHtml(e, n, c, canVote) {
  const voted = canVote && e.id === c.my_vote;
  let pied = '';
  if (canVote) {
    if (e.is_mine) pied = `<p class="chl-own">${I('user2', 16)} Ta participation · pas de voix pour toi</p>`;
    else if (voted) pied = `<button class="btn btn-primary chl-vote" type="button" aria-pressed="true" data-action="vote" data-id="${esc(e.id)}" aria-label="Ta voix : participation n° ${n}">${I('check', 18)} Ta voix</button>`;
    else pied = `<button class="btn btn-ghost chl-vote" type="button" aria-pressed="false" data-action="vote" data-id="${esc(e.id)}" aria-label="Voter pour la participation n° ${n}">Voter</button>`;
  }
  return `<li class="chl-entry${voted ? ' is-voted' : ''}${canVote && e.is_mine ? ' is-own' : ''}">
      ${mediaHtml(e, n)}
      <div class="chl-entry-body">
        <p class="chl-num">N° ${n}</p>
        <p class="chl-leg">${esc(e.caption || '')}</p>
        ${pied}
      </div>
    </li>`;
}
/** Phase de vote : note (ma voix, ou lecture seule), puis la grille. */
function voteHtml(c) {
  const entries = c.entries || [];
  const canVote = !!c.can_vote;
  const num = new Map(entries.map((e, i) => [e.id, i + 1]));
  const fin = quand(c.vote_ends_at);
  let n = '';
  if (!canVote) {
    n = note('lock', 'Seuls les participants votent.', 'Tu n’as pas participé à ce challenge : tu peux regarder les participations, sans voter.',
      `Le résultat s’affiche ici le ${fin}. Le prochain challenge arrive sur l’accueil.`, 'chl-note-np');
  } else if (num.has(c.my_vote)) {
    n = note('check2', `Ta voix : participation n° ${num.get(c.my_vote)}.`, `Tu peux la changer jusqu’au ${fin} en votant pour une autre.`,
      'Une voix par participant. Les pseudos et les voix s’affichent à la fin du vote.');
  } else {
    n = note('check2', 'Tu n’as pas encore voté.', `Choisis ta participation préférée avant le ${fin}. Tu peux changer ta voix jusqu’à la fin.`,
      'Une voix par participant, jamais pour ta propre participation. Les pseudos et les voix s’affichent à la fin du vote.');
  }
  const grille = entries.length
    ? `<ul class="chl-grid${canVote ? '' : ' is-ro'}">${entries.map((e, i) => entryHtml(e, i + 1, c, canVote)).join('')}</ul>`
    : '<div class="empty">Aucune participation pour ce challenge.</div>';
  return `${n}<section class="chl-entries" aria-labelledby="chl-entries-t">
      <div class="chl-sec-head"><h2 id="chl-entries-t">${entries.length === 1 ? 'La participation' : `Les ${nf.format(entries.length)} participations`}</h2><p class="small muted">Anonymes pendant le vote · ordre mélangé pour chacun</p></div>
      ${grille}
    </section>`;
}

/* ---------- Résultat ---------- */
/** Avatar d'un membre (pseudo, photo éventuelle). */
const av = (w, size) => avatarHtml({ pseudo: w?.pseudo, avatar_url: w?.avatar_url, color: w?.color }, size);
/** Carte d'un gagnant : aperçu, pseudo, légende, voix (ou « Choisi par l'admin »), gain. */
function gagnantHtml(w, e, i, eq, total, c) {
  const pa = Number(c.reward_paillettes) || 0;
  const lot = String(c.reward_text || '').trim();
  let media = `<div class="chl-win-media chl-win-vide" aria-hidden="true">${I('trophy', 48)}</div>`;
  if (e && kindOf(e) === 'image') media = `<div class="chl-win-media"><img alt="" data-wch-path="${esc(e.path)}" data-wch-img="1" decoding="async"></div>`;
  else if (e) media = `<div class="chl-win-media">${mediaHtml(e, i + 1, { zoom: false })}</div>`;
  const gain = pa || lot ? `<p class="chl-win-gain">${I('gift', 18)} <span>${pa ? `<strong>${nf.format(pa)} Paillettes versées</strong>` : ''}${lot ? `${pa ? ' + ' : ''}${esc(lot)} (${w.user_id === me.id ? 'l’admin te contacte' : 'remis par l’admin'})` : ''}</span></p>` : '';
  return `<article class="card chl-win" aria-labelledby="chl-win-${i}">
      ${media}
      <div class="chl-win-body">
        <p class="eyebrow">${I('trophy', 18)} Gagnant${eq ? ' ex æquo' : ''}${w.chosen_by_admin ? ' · Choisi par l’admin' : ''}</p>
        <h2 class="chl-win-who" id="chl-win-${i}">${av(w, 48)}<span>${esc(w.pseudo || 'Un membre')}</span></h2>
        ${e?.caption ? `<p class="chl-win-leg">« ${esc(e.caption)} »</p>` : ''}
        <p class="chl-win-voix">${w.chosen_by_admin ? 'Choisi par l’admin : personne n’avait voté.' : `<strong>${esc(pluriel(Number(w.votes) || 0, 'voix', 'voix'))}</strong> sur ${nf.format(total)}`}</p>
        ${gain}
      </div>
    </article>`;
}
/** Classement des autres participations (rang partagé en cas d'égalité), ou ''. */
function classementHtml(entries, winIds, titre = 'Classement') {
  const autres = entries.filter((e) => !winIds.has(e.id)).sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));
  if (!autres.length) return '';
  let rang = winIds.size, prev = null;
  const li = autres.map((e, i) => {
    const v = Number(e.votes) || 0;
    if (v !== prev) rang = winIds.size + i + 1;
    prev = v;
    return `<li>
        <span class="chl-rank-n">${rang}</span>${thumbHtml(e)}
        <span class="chl-rank-txt"><strong>${av(e, 32)} ${esc(e.pseudo || 'Un membre')}</strong><span class="small muted">${esc(e.caption || e.file_name || '')}</span></span>
        <span class="chl-rank-v">${esc(pluriel(v, 'voix', 'voix'))}</span></li>`;
  }).join('');
  return `<section class="card chl-rank-card" aria-labelledby="chl-rank-t"><h2 id="chl-rank-t">${esc(titre)}</h2><ol class="chl-rank">${li}</ol></section>`;
}
/** Phase terminée : gagnants, classement. */
function resultatHtml(c) {
  const wins = c.winners || [];
  const entries = c.entries || [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const total = entries.reduce((s, e) => s + (Number(e.votes) || 0), 0);
  const eq = wins.length > 1;
  const bandeau = eq && !wins.some((w) => w.chosen_by_admin)
    ? `<p class="chl-eq">${I('users', 20)} <span><strong>Ex æquo, ${esc(pluriel(Number(wins[0].votes) || 0, 'voix', 'voix'))} chacun.</strong> Chacun reçoit le gain complet.</span></p>` : '';
  return `<section class="chl-wins" aria-label="${eq ? 'Gagnants' : 'Gagnant'}">${bandeau}${wins.map((w, i) => gagnantHtml(w, byId.get(w.entry_id), i, eq, total, c)).join('')}</section>`
    + classementHtml(entries, new Set(wins.map((w) => w.entry_id).filter(Boolean)));
}

/* ---------- Archives ---------- */
/** Ligne du gagnant d'un challenge passé. */
function archWinHtml(a) {
  const ws = a.winners || [];
  if (a.outcome === 'sans_gagnant' || !ws.length) return '<p class="chl-arch-win is-none">Sans gagnant</p>';
  const g = gainTexte(a);
  if (ws.length === 1) {
    const w = ws[0];
    return `<p class="chl-arch-win">${av(w, 28)}<span><strong>${esc(w.pseudo)}</strong> · ${a.chosen_by_admin ? 'choisi par l’admin' : esc(pluriel(Number(w.votes) || 0, 'voix', 'voix'))}${g ? ` · ${esc(g)}` : ''}</span></p>`;
  }
  const noms = ws.map((w, i) => `${i ? `${av(w, 28)} ` : ''}<strong>${esc(w.pseudo)}</strong>`);
  const liste = `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
  return `<p class="chl-arch-win">${av(ws[0], 28)}<span>${liste}, ex æquo · ${esc(pluriel(Number(ws[0].votes) || 0, 'voix', 'voix'))}</span></p>`;
}
/** Section « Challenges précédents », ou '' sans archive. */
function archivesHtml(list) {
  if (!list.length) return '';
  return `<section class="chl-arch" aria-labelledby="chl-arch-t">
    <div class="chl-sec-head"><h2 id="chl-arch-t">Challenges précédents</h2></div>
    <ul class="chl-arch-list">${list.map((a) => `<li class="card chl-arch-item"><div class="chl-arch-top"><h3>${esc(a.title)}</h3><span class="pill">${esc(typeOf(a.answer_type).label)}</span></div>
        <p class="small muted">Vote terminé le ${esc(dateAn(a.vote_ends_at))} · ${Number(a.participants_count) ? esc(pluriel(Number(a.participants_count), 'participant')) : 'aucun participant'}</p>
        ${archWinHtml(a)}</li>`).join('')}</ul>
  </section>`;
}

/* ---------- Page ---------- */
/** Dessine la page selon la phase du challenge, puis remplit les aperçus. */
function render() {
  const c = ST.data.current;
  const archives = archivesHtml(ST.data.archives);
  clearPending();
  if (!c) {
    app.innerHTML = tete('Autres') + `<div class="empty chl-empty">${I('trophy', 32)}<p><strong>Pas de challenge en ce moment.</strong></p><p>Le prochain est annoncé ici et sur l’accueil dès que la participation ouvre.</p></div>` + archives;
    return;
  }
  const t = typeOf(c.answer_type);
  const eyebrow = APRES.has(c.phase) ? `Résultat · ${semaineDu(c.starts_at).toLowerCase()}` : semaineDu(c.starts_at);
  let corps = '';
  if (c.phase === 'a_venir') {
    corps = note('cal', `La participation ouvre le ${quand(c.starts_at)}.`, `Prépare ${t.un} : le formulaire apparaît ici à l’ouverture.`,
      `${pluriel(Number(c.max_entries) || 1, 'participation')} par membre, jusqu’au ${quand(c.ends_at)}.`) + archives;
  } else if (c.phase === 'participation') {
    corps = `<div class="support-layout">${formHtml(c)}${minesHtml(c)}</div>`;
  } else if (c.phase === 'vote') {
    corps = voteHtml(c);
  } else if (c.phase === 'cloture') {
    corps = note('clock', 'Le vote est terminé.', 'Les voix sont comptées : le résultat s’affiche ici dans quelques minutes.', 'Le gain est versé au gagnant en même temps.') + archives;
  } else if (c.phase === 'attente') {
    corps = note('clock', 'Personne n’a voté.', 'L’admin choisit le gagnant parmi les participations : le résultat s’affiche ici dès qu’il est désigné.', '') + archives;
  } else if (c.phase === 'sans_gagnant') {
    const n = (c.entries || []).length;
    corps = note('info', 'Ce challenge s’est terminé sans gagnant.', n ? 'Personne n’a reçu de voix et l’admin n’a désigné aucun gagnant.' : 'Personne n’a participé.',
      'Aucun gain n’a été versé. Le prochain challenge arrive sur l’accueil.', 'chl-note-np') + classementHtml(c.entries || [], new Set(), 'Participations') + archives;
  } else {
    corps = resultatHtml(c) + archives;
  }
  app.innerHTML = tete(eyebrow) + heroHtml(c) + corps;
  hydrateMedia(app);
  renderPending();
}

/* ---------- Fichier choisi (avant l'envoi) ---------- */
/** Affiche (ou efface) une erreur du champ de fichier. */
function fileError(msg) {
  const box = $('#chl-file-error');
  if (!box) { formError(msg); return; }
  box.textContent = msg || ''; box.hidden = !msg;
}
/** Affiche (ou efface) une erreur générale du formulaire, et marque le champ fautif. */
function formError(msg, field) {
  const box = $('#chl-form-error');
  if (box) { box.textContent = msg || ''; box.hidden = !msg; }
  app.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  if (msg && field) { field.setAttribute('aria-invalid', 'true'); field.focus(); }
}
/** Libère l'aperçu local et oublie le fichier choisi. */
function clearPending() {
  if (ST.pending?.url) URL.revokeObjectURL(ST.pending.url);
  ST.pending = null;
}
/** Dessine le fichier choisi (vignette, poids avant et après compression, bouton de retrait, barre d'envoi). */
function renderPending() {
  const list = $('#chl-file-list');
  if (!list) return;
  const c = ST.data.current;
  const t = typeOf(c.answer_type);
  const it = ST.pending;
  const addT = $('#chl-file-add-t');
  if (addT) addT.textContent = it ? t.changer : t.choisir;
  if (!it) { list.innerHTML = ''; return; }
  const p = it.prepared;
  const nomType = { image: 'Image', video: 'Vidéo', audio: 'Son', pdf: 'PDF' }[p.kind] || 'Fichier';
  const meta = p.isImage && p.size < p.original ? `${nomType} · ${fileSize(p.original)} → ${fileSize(p.size)} après compression` : `${nomType} · ${fileSize(p.size)}`;
  const thumb = p.isImage ? `<span class="sf-thumb"><img alt="" src="${esc(it.url)}"></span>` : thumbHtml({ path: 'x.' + p.ext, mime: p.contentType, file_name: p.name });
  list.innerHTML = `<li>${thumb}<span class="sf-meta"><strong class="sf-nm">${esc(p.name)}</strong><span>${esc(meta)}</span>
      <span class="chl-up" id="chl-up" hidden><span class="progress" role="progressbar" aria-label="Envoi de ${esc(p.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span style="width:0%"></span></span><span class="chl-up-txt" aria-live="polite">Envoi en cours… 0 %</span></span></span>
      <button class="sf-rm" type="button" data-action="file-rm" aria-label="Retirer ${esc(p.name)}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></li>`;
}
/** Met à jour la barre d'envoi (0 à 100 %). */
function setProgress(pct) {
  const up = $('#chl-up');
  if (!up) return;
  up.hidden = false;
  const bar = up.querySelector('.progress');
  bar.setAttribute('aria-valuenow', String(pct));
  bar.firstElementChild.style.width = `${pct}%`;
  up.querySelector('.chl-up-txt').textContent = `Envoi en cours… ${pct} %`;
}
/** Bouton d'envoi et contrôles du fichier pendant l'envoi. */
function setBusy(on) {
  ST.busy = on;
  const btn = $('#chl-submit');
  if (btn) { btn.disabled = on; btn.textContent = on ? 'Envoi…' : 'Envoyer ma participation'; if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy'); }
  for (const sel of ['#chl-file-add', '.sf-rm']) { const el = $(sel); if (el) el.disabled = on; }
}

/** Fichier choisi : contrôle et compression, puis affichage. Un refus est expliqué sous le bouton. */
async function onFileChosen(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  fileError('');
  const c = ST.data.current;
  try {
    const prepared = await prepareEntryFile(file, c.answer_type);
    clearPending();
    ST.pending = { prepared, url: prepared.isImage ? URL.createObjectURL(prepared.blob) : null };
    renderPending();
  } catch (e) {
    fileError(errMsg(e));
  }
  $('#chl-file-add')?.focus();
}

/** Envoi de la participation : fichier d'abord (s'il y en a un), puis hg_wch_enter. Le fichier est retiré si l'envoi échoue. */
async function onSubmit(ev) {
  ev.preventDefault();
  if (ST.busy) return;
  const c = ST.data.current;
  const t = typeOf(c.answer_type);
  const caption = ($('#chl-legende')?.value || '').trim().slice(0, MAX_LEGENDE);
  formError(''); fileError('');
  let body = null;
  if (c.answer_type === 'texte') {
    body = ($('#chl-texte')?.value || '').trim();
    if (!body) { formError('Écris ton texte avant d’envoyer ta participation.', $('#chl-texte')); return; }
    if (body.length > MAX_TEXTE) { formError(`Ton texte dépasse ${nf.format(MAX_TEXTE)} caractères.`, $('#chl-texte')); return; }
  } else if (!ST.pending) {
    fileError(`Choisis ${t.un} avant d’envoyer ta participation.`);
    $('#chl-file-add')?.focus();
    return;
  }
  setBusy(true);
  const p = ST.pending?.prepared || null;
  let path = null;
  try {
    if (p) {
      if (p.size > WCH_MAX_BYTES) throw new Error('Fichier trop lourd : 25 Mo maximum.');
      path = await uploadEntryFile(c.id, p, setProgress);
    }
    const { error } = await sb.rpc('hg_wch_enter', {
      p_challenge: c.id, p_path: path, p_file_name: p?.name ?? null, p_mime: p?.contentType ?? null, p_size: p?.size ?? null,
      p_body: body, p_caption: caption || null,
    });
    if (error) throw error;
    ST.busy = false;
    toast('Participation envoyée.', 'ok');
    await load();
    $('#chl-mine-t')?.scrollIntoView({ block: 'nearest' });
  } catch (e) {
    // Fichier déposé mais participation refusée : il est retiré du bucket (rien d'orphelin).
    if (path) await removeEntryFiles([path]);
    setBusy(false);
    const up = $('#chl-up'); if (up) up.hidden = true;
    if (p) fileError(`Envoi impossible : ${errMsg(e)}`); else formError(`Envoi impossible : ${errMsg(e)}`);
  }
}

/** Retrait d'une de mes participations (confirmation), puis suppression de son fichier. */
async function onWithdraw(btn) {
  const c = ST.data.current;
  const e = (c.my_entries || []).find((x) => x.id === btn.dataset.id);
  if (!e) return;
  const ok = await confirmBox('Retirer ta participation ?',
    `Elle disparaît du challenge${e.path ? ' et son fichier est supprimé' : ''}. Tu pourras en envoyer une autre tant que la participation est ouverte.`,
    { ok: 'Retirer ma participation', danger: true });
  if (!ok) return;
  btn.disabled = true;
  const { data, error } = await sb.rpc('hg_wch_withdraw', { p_entry: e.id });
  if (error) { toast(`Retrait impossible : ${errMsg(error)}`, 'error'); btn.disabled = false; return; }
  await removeEntryFiles([typeof data === 'string' && data ? data : e.path]);
  toast('Participation retirée.', 'ok');
  await load();
}

/** Voix pour une participation (remplace la précédente). */
async function onVote(btn) {
  const c = ST.data.current;
  const id = btn.dataset.id;
  if (!c.can_vote || id === c.my_vote) return;
  btn.disabled = true;
  const { error } = await sb.rpc('hg_wch_vote', { p_entry: id });
  if (error) { toast(`Vote impossible : ${errMsg(error)}`, 'error'); btn.disabled = false; return; }
  c.my_vote = id;
  const n = (c.entries || []).findIndex((e) => e.id === id) + 1;
  render();
  toast(`Voix enregistrée : participation n° ${n}.`, 'ok');
  app.querySelector(`[data-action="vote"][data-id="${CSS.escape(id)}"]`)?.focus();
}

/* ---------- Image agrandie ---------- */
/** Ouvre l'image d'une participation dans une fenêtre (Échap ou « Fermer » pour revenir). */
function openZoom(btn) {
  const src = btn.querySelector('img')?.src;
  if (!src) return;
  const dlg = document.createElement('dialog');
  dlg.className = 'chl-zoom';
  dlg.setAttribute('aria-label', btn.getAttribute('aria-label')?.replace('Agrandir la', 'La') || 'Participation');
  dlg.innerHTML = `<form method="dialog" class="chl-zoom-bar"><button class="btn btn-ghost" type="submit">Fermer</button></form><img alt="" src="${esc(src)}">`;
  dlg.addEventListener('close', () => { dlg.remove(); btn.focus(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
}

/* ---------- Événements ---------- */
app.addEventListener('click', (e) => {
  const z = e.target.closest('[data-zoom]');
  if (z) { openZoom(z); return; }
  const b = e.target.closest('[data-action]');
  if (!b || b.disabled) return;
  const a = b.dataset.action;
  if (a === 'retry') { app.setAttribute('aria-busy', 'true'); load(); }
  else if (a === 'file-add') $('#chl-file-input')?.click();
  else if (a === 'file-rm') { clearPending(); renderPending(); fileError(''); $('#chl-file-add')?.focus(); }
  else if (a === 'withdraw') onWithdraw(b);
  else if (a === 'vote') onVote(b);
});
app.addEventListener('change', (e) => { if (e.target.id === 'chl-file-input') onFileChosen(e.target); });
app.addEventListener('submit', (e) => { if (e.target.id === 'chl-form') onSubmit(e); });
app.addEventListener('input', (e) => {
  if (e.target.id === 'chl-legende') $('#chl-legende-n').textContent = `${e.target.value.length} / ${MAX_LEGENDE}`;
  if (e.target.id === 'chl-texte') $('#chl-texte-n').textContent = `${nf.format(e.target.value.length)} / ${nf.format(MAX_TEXTE)}`;
});

// Comptes à rebours : mis à jour toutes les 20 s. Arrivé à zéro (changement de phase), ou pendant le dépouillement, la page
// est relue (au plus une fois par minute, jamais pendant un envoi).
setInterval(() => {
  if (!ST.data) return;
  const fini = tickRebours(app);
  const attente = ['cloture', 'attente'].includes(ST.data.current?.phase);
  if ((fini || attente) && !ST.busy && Date.now() - ST.lastLoad > 60000) load();
}, 20000);

await load();
