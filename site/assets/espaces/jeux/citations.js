// ===== Humane Gang — Jeux › « Qui a dit ça ? » (idée J3) =====
/*
 * Rôle : une citation courte du Discord, en grand, et quatre membres en choix : on touche le bon. Bonne réponse =
 * Paillettes (moteur du quiz : hg_quiz_answer, une réponse par citation). Après réponse : la bonne personne, le
 * contexte et la part du gang qui a trouvé. Une citation n'est jamais montrée à son auteur.
 * Les membres proposent des citations (3 par jour au plus) ; l'auteur donne son accord ou refuse depuis cet onglet ;
 * le Staff « quiz » publie (panel › Jeux et cartes › Citations).
 * Effets (maquette des jeux quotidiens) : bonne réponse = halo vert sur le choix + son Q1 ; mauvaise = choix secoué + son Q2,
 * puis la bonne personne s'allume, avant l'affichage du résultat. Pas de tampon de fin : le gain quotidien (première citation
 * du jour seulement) n'est pas connu du client.
 * Onglet : /pages/jeux/jeux.html#citations. Contrat : mount(panel, ctx).
 * Dépendances : core.js (avatarHtml, errMsg, motionAllowed), jeux/commun.js, jeux/effets-jour.js.
 * Données : RPC hg_quote_list, hg_quiz_answer, hg_quote_propose, hg_quote_mine, hg_quote_author_reply, hg_members.
 */
import { avatarHtml, errMsg, motionAllowed } from '../../commun/core.js';
import { chargerCss, nf } from './commun.js';
import { sonJour, rejoue, secouer, finDePartie } from './effets-jour.js';
import { boutonReponses } from '../../commun/core/admin-reponses.js';
import { serieHtml, jokerHtml } from './serie-jeux.js'; // série commune et joker payant (migrations 206 et 207)

/* ---------- Constantes ---------- */
const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', expert: 'Expert' };
const STATUT = { nouvelle: 'En attente de l’auteur', accord_auteur: 'En attente du Staff', refusee: 'Refusée', publiee: 'Publiée' };
const PLUS = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2"/></svg>';

/* ---------- État ---------- */
// panel, ctx ; list : citations jouables (hg_quote_list) ; cur : identifiant de la citation affichée ;
// membres : pour le formulaire (chargés à la première ouverture) ; busy : réponse en cours.
let C = null;
const q = (sel) => C.panel.querySelector(sel);

/* ---------- Montage ---------- */
/**
 * Monte l'onglet « Qui a dit ça ? ».
 * @param {HTMLElement} panel Panneau vide de l'onglet.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte de la page.
 */
export async function mount(panel, ctx) {
  chargerCss('citations');
  C = { panel, ctx, list: [], cur: null, membres: null, busy: false };
  panel.innerHTML = `<div class="jg cit">
    <header class="sj-tete">
      <div><h2 class="jg-title">Qui a dit ça ?</h2>
      <p class="small muted jg-sub">Une phrase culte du Discord : retrouve qui l’a dite. Une seule réponse par citation.</p></div>
      ${serieHtml('citations')}${jokerHtml('citations')}
    </header>
    <div id="cit-consent"></div>
    <div class="jg-grid2">
      <div class="jg-col">
        <section class="jg-card cit-card" id="cit-card" aria-label="Citation"><p class="jg-empty-row">Chargement…</p></section>
      </div>
      <div class="jg-col">
        <button class="btn btn-ghost cit-propose-btn" type="button" id="cit-propose" aria-expanded="false" aria-controls="cit-form">${PLUS}Proposer une citation</button>
        <form class="jg-card cit-form" id="cit-form" hidden novalidate>
          <div class="field"><label for="cit-quote">La citation</label>
            <textarea id="cit-quote" rows="3" maxlength="280" required placeholder="« KC > G2, c’est mathématique »"></textarea>
            <span class="small muted"><span id="cit-count">0</span> / 280 · salons publics du Discord seulement, rien qui gêne ou vise quelqu’un.</span></div>
          <div class="field"><label for="cit-author">Qui l’a dite ?</label>
            <select id="cit-author" required><option value="">Choisis un membre…</option></select></div>
          <div class="field"><label for="cit-context">Contexte (facultatif)</label>
            <input id="cit-context" type="text" maxlength="200" placeholder="Salon nouvel an, décembre 2024"></div>
          <p class="small muted cit-left" id="cit-left"></p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Envoyer la proposition</button>
            <button class="btn btn-ghost" type="button" data-cit="cancel">Annuler</button></div>
        </form>
        <p class="small muted cit-note">Chaque citation est validée par le Staff et son auteur avant publication.</p>
        <details class="jg-card cit-mine" id="cit-mine" hidden><summary class="jg-h3">Mes propositions</summary><ul class="cit-mine-list" id="cit-mine-list"></ul></details>
        <details class="jg-card cit-history" id="cit-history" hidden><summary class="jg-h3">Déjà jouées <span class="small muted" id="cit-done-n"></span></summary><ul class="cit-mine-list" id="cit-done"></ul></details>
      </div>
    </div>
  </div>`;
  panel.addEventListener('click', onClick);
  q('#cit-form').addEventListener('submit', proposer);
  boutonReponses(panel.querySelector('.cit > header'), 'citations', () => C?.cur ?? null);
  q('#cit-quote').addEventListener('input', () => { q('#cit-count').textContent = nf(q('#cit-quote').value.length); });
  await Promise.all([charger(), chargerMine()]);
}

/* ---------- Chargement ---------- */
/** Lit les citations jouables et affiche la première non répondue (ou celle en cours). */
async function charger() {
  const { sb, esc } = C.ctx;
  const { data, error } = await sb.rpc('hg_quote_list');
  if (!C) return;
  if (error) { q('#cit-card').innerHTML = `<p class="jg-empty-row">Citations indisponibles : ${esc(errMsg(error))}</p>`; return; }
  C.list = Array.isArray(data) ? data : [];
  if (!C.cur || !C.list.some((x) => x.id === C.cur)) C.cur = C.list.find((x) => !x.answered)?.id || null;
  rendre();
  rendreHistorique();
}

/** Mes propositions, les citations qui attendent mon accord, et le nombre de propositions restantes. */
async function chargerMine() {
  const { sb, esc } = C.ctx;
  const { data, error } = await sb.rpc('hg_quote_mine');
  if (!C || error) return;
  const d = data || {};
  C.restantes = d.restantes;
  q('#cit-left').textContent = d.restantes == null ? '' : `Encore ${nf(d.restantes)} proposition${d.restantes > 1 ? 's' : ''} possible${d.restantes > 1 ? 's' : ''} aujourd’hui.`;
  const av = Array.isArray(d.a_valider) ? d.a_valider : [];
  q('#cit-consent').innerHTML = av.map((x) => `<section class="jg-card cit-consent" aria-label="Citation à valider">
      <p class="small jg-sand cit-consent-h">${esc(x.proposed_by)} propose une phrase de toi pour « Qui a dit ça ? »</p>
      <blockquote class="cit-quote cit-quote-sm"><p class="jg-display">« ${esc(x.quote)} »</p></blockquote>
      ${x.context ? `<p class="small muted">${esc(x.context)}</p>` : ''}
      <p class="small">Tu es d’accord pour qu’elle soit jouée ? Tu ne la verras pas dans le jeu.</p>
      <div class="btn-row"><button class="btn btn-primary" type="button" data-cit="accord" data-id="${esc(x.id)}">D’accord</button>
        <button class="btn btn-ghost" type="button" data-cit="refus" data-id="${esc(x.id)}">Refuser</button></div>
    </section>`).join('');
  const pr = Array.isArray(d.proposees) ? d.proposees : [];
  q('#cit-mine').hidden = !pr.length;
  q('#cit-mine-list').innerHTML = pr.map((x) => `<li><span class="cit-li-q">« ${esc(x.quote)} »</span>
      <span class="small muted">${esc(x.author)} · <span class="cit-st cit-st-${esc(x.status)}">${esc(STATUT[x.status] || x.status)}</span></span></li>`).join('');
}

/* ---------- Carte de la citation ---------- */
/** Citation affichée : choix (avant réponse), ou résultat (après). */
function rendre() {
  const { esc } = C.ctx;
  const box = q('#cit-card');
  const x = C.list.find((y) => y.id === C.cur);
  if (!x) {
    const n = C.list.length;
    box.innerHTML = `<h3 class="jg-h3">${n ? 'Tu as répondu à toutes les citations' : 'Pas encore de citation'}</h3>
      <p class="small muted">${n ? 'De nouvelles citations arrivent chaque semaine. Propose les tiennes !' : 'Les premières arrivent bientôt. Propose une phrase culte du Discord !'}</p>`;
    return;
  }
  const good = Array.isArray(x.solution) ? x.solution[0] : x.solution;
  const opts = (x.options || []).map((o) => {
    let cls = '', etat = '&nbsp;';
    if (x.answered) {
      if (o.id === good) { cls = ' is-good'; etat = 'Bonne réponse'; }
      else if (o.id === x.my_response) { cls = ' is-wrong'; etat = 'Ton choix'; }
      else cls = ' is-off';
    }
    const pressed = x.answered && o.id === x.my_response ? ' aria-pressed="true"' : '';
    return `<button class="cit-opt${cls}" type="button" data-cit="answer" data-opt="${esc(o.id)}"${x.answered ? ' disabled' : ''}${pressed}>
        ${avatarHtml({ pseudo: o.text, color: o.color, avatar_url: o.avatar_url }, 46)}
        <span class="cit-opt-name">${esc(o.text)}</span><span class="small cit-opt-state">${etat}</span></button>`;
  }).join('');
  const goodName = (x.options || []).find((o) => o.id === good)?.text || '';
  const statut = !x.answered ? '' : `<div class="jg-status ${x.correct ? 'is-ok' : 'is-ko'}" role="status">
      <p><strong>${x.correct ? `Bravo, c’était bien ${esc(goodName)} !${x.earned ? ` +${nf(x.earned)} Paillettes.` : ''}` : `Raté, c’était ${esc(goodName)}.`}</strong></p>
      ${x.explanation ? `<p class="small muted">${esc(x.explanation)}</p>` : ''}
    </div>`;
  const reste = C.list.some((y) => !y.answered && y.id !== x.id);
  box.innerHTML = `<div class="jg-row cit-pills"><span class="pill cit-cat">Qui a dit ça ?</span><span class="pill">${esc(DIFF[x.difficulty] || 'Facile')}</span>
      <span class="jg-display jg-sand cit-reward" aria-label="${nf(x.reward)} Paillettes">+${nf(x.reward)}</span></div>
    <blockquote class="cit-quote"><p class="jg-display">« ${esc(x.quote)} »</p></blockquote>
    <div class="cit-opts" role="group" aria-label="Qui a dit ça ? Choisis un membre">${opts}</div>
    ${statut}
    <div class="jg-between cit-foot">
      <span class="small muted">${x.answered && x.rate != null ? `${nf(x.rate)} % du gang a trouvé` : 'Une seule réponse possible'}</span>
      ${x.answered ? `<button class="btn btn-ghost" type="button" data-cit="next"${reste ? '' : ' disabled'}>${reste ? 'Citation suivante' : 'Plus de citation pour l’instant'}</button>` : ''}
    </div>`;
}

/** Liste des citations déjà jouées (résultat). */
function rendreHistorique() {
  const { esc } = C.ctx;
  const done = C.list.filter((x) => x.answered);
  q('#cit-history').hidden = !done.length;
  q('#cit-done-n').textContent = `(${nf(done.length)})`;
  q('#cit-done').innerHTML = done.map((x) => {
    const good = Array.isArray(x.solution) ? x.solution[0] : x.solution;
    const nom = (x.options || []).find((o) => o.id === good)?.text || '';
    return `<li><button class="cit-li-btn" type="button" data-cit="show" data-id="${esc(x.id)}"><span class="cit-li-q">« ${esc(x.quote)} »</span>
      <span class="small muted">${esc(nom)} · ${x.correct ? 'trouvé' : 'raté'}</span></button></li>`;
  }).join('');
}

/* ---------- Actions ---------- */
/**
 * Répond à la citation affichée (une seule tentative).
 * @param {string} opt Identifiant du choix.
 */
async function repondre(opt) {
  if (C.busy || !C.cur) return;
  const { sb, toast } = C.ctx;
  const citation = C.cur;
  C.busy = true;
  for (const b of C.panel.querySelectorAll('.cit-opt')) b.disabled = true;
  const { data, error } = await sb.rpc('hg_quiz_answer', { p_question: C.cur, p_response: opt });
  if (!C) return;
  C.busy = false;
  if (error) { toast(errMsg(error), 'error'); await charger(); return; }
  if (data?.correct && data.reward > 0) toast(`Bravo ! +${nf(data.reward)} Paillettes`, 'success');
  await effetReponse(opt, data);
  if (!C) return;
  await charger();
  // Première citation répondue du jour : c'est la partie du jour (points et Paillettes).
  if (C && C.cur === citation && data?.jour_gain > 0) finDePartie(q('#cit-card .jg-status'), { points: data.correct ? 10 : 0, gain: data.jour_gain });
  q('#cit-card .jg-status')?.setAttribute('tabindex', '-1');
  q('#cit-card .jg-status')?.focus();
}

/**
 * Effet juste après la réponse du serveur : halo ou secousse sur le choix, son, puis (si faux) la bonne personne s'allume.
 * Attend la fin de l'effet avant le résultat ; sans mouvement, aucune attente (les sons restent).
 * @param {string} opt Choix du membre.
 * @param {{correct?: boolean, solution?: any}|null} data Réponse de hg_quiz_answer.
 */
async function effetReponse(opt, data) {
  const attente = (ms) => (motionAllowed() ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const choix = C.panel.querySelector(`.cit-opt[data-opt="${CSS.escape(opt)}"]`);
  if (data?.correct) {
    sonJour('Q1');
    rejoue(choix, 'fxj-bon');
    choix?.classList.add('is-good');
    await attente(650);
    return;
  }
  sonJour('Q2');
  secouer(choix);
  choix?.classList.add('is-wrong');
  await attente(450);
  const bon = Array.isArray(data?.solution) ? data.solution[0] : data?.solution;
  const btnBon = bon != null ? C?.panel.querySelector(`.cit-opt[data-opt="${CSS.escape(String(bon))}"]`) : null;
  if (btnBon) { btnBon.classList.add('is-good'); rejoue(btnBon, 'fxj-bon'); }
  await attente(550);
}

/** Ouvre ou ferme le formulaire de proposition ; charge la liste des membres à la première ouverture. */
async function basculerForm(open) {
  const f = q('#cit-form');
  f.hidden = !open;
  q('#cit-propose').setAttribute('aria-expanded', String(open));
  if (!open) { q('#cit-propose').focus(); return; }
  q('#cit-quote').focus();
  if (C.membres) return;
  const { sb, esc } = C.ctx;
  const { data, error } = await sb.rpc('hg_members');
  if (!C || error) return;
  C.membres = (Array.isArray(data) ? data : []).slice().sort((a, b) => String(a.pseudo).localeCompare(String(b.pseudo), 'fr'));
  q('#cit-author').insertAdjacentHTML('beforeend', C.membres.map((m) => `<option value="${esc(m.id)}">${esc(m.pseudo)}</option>`).join(''));
}

/** Envoie une proposition de citation. */
async function proposer(e) {
  e.preventDefault();
  const { sb, toast } = C.ctx;
  const quote = q('#cit-quote').value.trim();
  const author = q('#cit-author').value;
  if (quote.length < 3) { toast('Écris la citation (3 caractères au moins).', 'error'); q('#cit-quote').focus(); return; }
  if (!author) { toast('Choisis qui l’a dite.', 'error'); q('#cit-author').focus(); return; }
  const btn = q('#cit-form [type="submit"]');
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  const { error } = await sb.rpc('hg_quote_propose', { p_quote: quote, p_author: author, p_context: q('#cit-context').value.trim() || null });
  if (!C) return;
  btn.disabled = false; btn.removeAttribute('aria-busy');
  if (error) { toast(errMsg(error), 'error'); return; }
  toast('Proposition envoyée. Merci !', 'success');
  q('#cit-form').reset();
  q('#cit-count').textContent = '0';
  basculerForm(false);
  chargerMine();
}

/**
 * Réponse de l'auteur à une proposition (accord ou refus).
 * @param {string} id Proposition.
 * @param {boolean} ok Accord.
 */
async function repondreAuteur(id, ok) {
  const { sb, toast } = C.ctx;
  const { error } = await sb.rpc('hg_quote_author_reply', { p_id: id, p_ok: ok });
  if (error) { toast(errMsg(error), 'error'); return; }
  toast(ok ? 'Merci ! Le Staff peut maintenant la publier.' : 'C’est noté : elle ne sera pas publiée.', 'ok');
  chargerMine();
}

/** Délégation des clics du panneau. */
function onClick(e) {
  const b = e.target.closest('[data-cit], #cit-propose');
  if (!b || !C) return;
  if (b.id === 'cit-propose') { basculerForm(q('#cit-form').hidden); return; }
  const act = b.dataset.cit;
  if (act === 'answer') repondre(b.dataset.opt);
  else if (act === 'next') {
    const i = C.list.findIndex((x) => x.id === C.cur);
    const nxt = [...C.list.slice(i + 1), ...C.list.slice(0, i)].find((x) => !x.answered);
    if (nxt) { C.cur = nxt.id; rendre(); q('.cit-opt')?.focus(); }
  } else if (act === 'show') { C.cur = b.dataset.id; rendre(); q('#cit-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (act === 'cancel') basculerForm(false);
  else if (act === 'accord') repondreAuteur(b.dataset.id, true);
  else if (act === 'refus') repondreAuteur(b.dataset.id, false);
}

/* ---------- Résumé pour l'onglet « Aujourd'hui » ---------- */
/**
 * Citations encore à deviner, pour le tableau de bord.
 * @param {{sb: object}} ctx Contexte de la page.
 * @returns {Promise<{etat: string, texte: string, badge: string}>}
 */
export async function resume({ sb }) {
  const { data, error } = await sb.rpc('hg_quote_list');
  if (error) throw error;
  const list = Array.isArray(data) ? data : [];
  if (!list.length) return { etat: 'info', texte: 'Pas encore de citation : propose la tienne', badge: '' };
  const n = list.filter((x) => !x.answered).length;
  const ok = list.filter((x) => x.correct).length;
  if (!n) return { etat: 'fait', texte: `${nf(ok)} trouvée${ok > 1 ? 's' : ''} sur ${nf(list.length)}`, badge: 'Fait' };
  return { etat: 'a_jouer', texte: `${nf(n)} citation${n > 1 ? 's' : ''} à deviner`, badge: 'À jouer' };
}
