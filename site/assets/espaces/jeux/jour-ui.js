// ===== Humane Gang — Question du jour (J4) : affichage commun à l'accueil et à l'onglet « Question du jour » =====
// Carte de la question (réponse sans quitter la page, puis explication et score du gang), carte « Ta semaine »
// (série, joker de la semaine) et classement du mois. Le serveur corrige : la bonne réponse n'arrive qu'après la réponse.
// RPC : hg_quiz_daily_today, hg_quiz_daily_answer, hg_quiz_daily_board (migration 084).
// Styles : assets/espaces/jeux/jeux-jour.css (ajouté une seule fois par un <link>).
// Effets (maquette des jeux quotidiens) : bonne réponse = halo vert + son Q1 ; mauvaise = choix secoué + son Q2, puis la bonne
// réponse s'allume ; ensuite carte de fin (tampon de points) par finDePartie. Rien de tout cela à l'ouverture d'une question déjà
// répondue : le tampon est posé sans animation. Valable aussi pour la version compacte de l'accueil.
// Dépendances : core.js (avatarHtml, errMsg, motionAllowed), ./effets-jour.js. Tout texte venant de la base passe par esc().
// Exporte : mountDaily(el, { sb, esc, toast, compact, meId }).
import { avatarHtml, errMsg, motionAllowed } from '../../commun/core.js';
import { sonJour, rejoue, secouer, finDePartie } from './effets-jour.js';
import { boutonReponses } from '../../commun/core/admin-reponses.js';
import { serieHtml, jokerHtml } from './serie-jeux.js'; // série commune et joker payant (migrations 206 et 207), onglet seulement

/* ---------- Constantes ---------- */
const nf = new Intl.NumberFormat('fr-CH');
const MOIS = new Intl.DateTimeFormat('fr-CH', { month: 'long', timeZone: 'UTC' });
const JOUR_LONG = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', timeZone: 'UTC' });
const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', expert: 'Expert' };
/** Flamme de la série (dessin, sans emoji). */
const FLAMME = '<svg class="qdj-flame" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 1-6 1-8z" fill="currentColor"/></svg>';
const NOMBRE = /^-?\d+([.,]\d+)?$/;

/** Charge la feuille de style une seule fois. */
function styles() {
  if (document.querySelector('link[data-jeux-css="jour"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('./jeux-jour.css', import.meta.url).href; l.dataset.jeuxCss = 'jour';
  document.head.append(l);
}

/** « 12 jours », « 1 jour ». */
const jours = (n) => `${nf.format(n)} jour${n > 1 ? 's' : ''}`;
/** Date AAAA-MM-JJ → Date à midi UTC (évite les décalages de fuseau). */
const dateDe = (s) => new Date(`${s}T12:00:00Z`);

/**
 * Monte la question du jour dans un élément.
 * @param {HTMLElement} el Conteneur (vidé).
 * @param {{sb: object, esc: Function, toast?: Function, compact?: boolean, meId?: string}} ctx compact : version de
 *   l'accueil (classement en trois lignes et lien vers l'onglet Jeux) ; meId : membre connecté (sa ligne du classement).
 * @returns {Promise<void>}
 */
export async function mountDaily(el, { sb, esc, toast, compact = false, meId = null }) {
  styles();
  const S = { d: null, board: null, busy: false, tout: false, multi: new Set(), retour: null, me: meId };

  /** Texte d'un choix. */
  const txtChoix = (id) => S.d.question.options.find((o) => o.id === id)?.text ?? String(id);
  /** Réponse lisible. */
  const lisible = (r) => (Array.isArray(r) ? r.map(txtChoix).join(', ') : (['choix_unique', 'vrai_faux'].includes(S.d.question.type) ? txtChoix(r) : String(r ?? '')));

  /** En-tête de la carte : pastille et flamme de la série (onglet : pastille commune des jeux du jour, serie-jeux.js). */
  const tete = () => {
    const n = Number(S.d?.streak?.current) || 0;
    if (!compact) return `<div class="qdj-top"><span class="qdj-tag">Question du jour</span>${serieHtml('quiz_jour')}</div>`;
    return `<div class="qdj-top"><span class="qdj-tag">Question du jour</span>
      <span class="qdj-serie" aria-label="Série : ${esc(jours(n))}">${FLAMME}<span>${esc(jours(n))}</span></span></div>`;
  };

  /** Champs de réponse selon le type. */
  function champs(q) {
    if (q.type === 'choix_unique' || q.type === 'vrai_faux') {
      return `<div class="qdj-choices" role="group" aria-label="Choisis ta réponse">${q.options.map((o) =>
        `<button type="button" class="qdj-choice" data-choice="${esc(o.id)}">${esc(o.text || o.id)}</button>`).join('')}</div>`;
    }
    if (q.type === 'choix_multiple') {
      return `<p class="small muted qdj-hint">Plusieurs réponses possibles : choisis toutes les bonnes, puis valide.</p>
        <div class="qdj-choices" role="group" aria-label="Choisis tes réponses">${q.options.map((o) =>
          `<button type="button" class="qdj-choice" data-multi="${esc(o.id)}" aria-pressed="${S.multi.has(o.id)}">${esc(o.text || o.id)}</button>`).join('')}</div>
        <button type="button" class="btn btn-primary qdj-send" data-send>Valider</button>`;
    }
    const nombre = q.type === 'nombre';
    return `<form class="qdj-form" novalidate><label class="visually-hidden" for="qdj-input">Ta réponse${nombre ? ' (un nombre)' : ''}</label>
      <input class="input" id="qdj-input" type="text" maxlength="${nombre ? 20 : 200}" autocomplete="off" ${nombre ? 'inputmode="decimal"' : ''} placeholder="${nombre ? 'Un nombre' : 'Ta réponse'}">
      <button type="submit" class="btn btn-primary">Valider</button></form>`;
  }

  /** Bloc résultat après la réponse : verdict, bonne réponse, explication, score du gang, gains. */
  function resultat() {
    const d = S.d, q = d.question;
    const ok = d.correct === true;
    const st = d.stats ? `<p class="small qdj-stats">${esc(nf.format(d.stats.correct))} membre${d.stats.correct > 1 ? 's' : ''} sur ${esc(nf.format(d.stats.answered))} ${d.stats.correct > 1 ? 'ont' : 'a'} trouvé.</p>` : '';
    const gains = S.retour ? [
      S.retour.bonus ? `+${nf.format(S.retour.bonus)} pour la question du jour` : '',
      S.retour.reward ? `+${nf.format(S.retour.reward)} pour la bonne réponse` : '',
      ...(S.retour.paliers || []).map((p) => `+${nf.format(p.paillettes)} : palier de ${nf.format(p.palier)} jours !`),
    ].filter(Boolean) : [];
    return `<div class="qdj-result ${ok ? 'is-ok' : 'is-ko'}" role="status" tabindex="-1">
      <p class="qdj-verdict">${ok ? 'Bravo, bonne réponse !' : 'Raté, ce n’était pas ça.'}</p>
      <p class="small"><span class="muted">Ta réponse :</span> ${esc(lisible(d.my_response))}</p>
      ${!ok && d.solution ? `<p class="small"><span class="muted">Bonne réponse :</span> ${esc(d.solution)}</p>` : ''}
      ${d.explanation ? `<p class="small qdj-expl">${esc(d.explanation)}</p>` : ''}
      ${st}
      ${gains.length ? `<p class="small qdj-gains">${gains.map((g) => `<span>${esc(g)}</span>`).join('')}</p>` : ''}
      <p class="small muted">Prochaine question demain à 6 h.</p>
    </div>`;
  }

  /** Carte de la question. */
  function carteQuestion() {
    const d = S.d;
    if (!d.question) {
      return `<section class="card qdj-card" aria-label="Question du jour">${tete()}<p class="muted">Pas de question du jour pour le moment. Reviens demain matin !</p></section>`;
    }
    const q = d.question;
    const info = [q.category, DIFF[q.difficulty]].filter(Boolean).join(' · ');
    const deja = d.already_played && !d.answered
      ? '<p class="small qdj-deja">Tu as déjà répondu à cette question dans le quiz : réponds quand même pour garder ta série (tes Paillettes du quiz ne changent pas).</p>' : '';
    const img = q.image_url ? `<img class="qdj-img" src="${esc(q.image_url)}" alt="Illustration de la question" loading="lazy" decoding="async" data-on-error="remove">` : '';
    const corps = d.answered ? resultat() : `${champs(q)}
      <p class="qdj-error small" role="alert" hidden></p>
      <div class="qdj-foot"><span class="small muted">Juste : 10 points (raté : 0) · réponds pour garder ta série</span><span class="qdj-plus">+${esc(nf.format(d.bonus || 0))}</span></div>`;
    return `<section class="card qdj-card" aria-labelledby="qdj-prompt">
      ${tete()}
      <p class="qdj-prompt" id="qdj-prompt">${esc(q.prompt)}</p>
      ${info ? `<p class="small muted qdj-info">${esc(info)}</p>` : ''}
      ${img}${deja}${corps}
    </section>`;
  }

  /**
   * Carte « Ta semaine » : 7 cases (OK, J = joker gratuit, J✦ = joker payé, ? = aujourd'hui, vide = à venir, — = manqué).
   * Onglet seulement : encart « Sauver ma série » (joker payant, serie-jeux.js) quand la série vient de casser.
   */
  function carteSemaine() {
    const st = S.d?.streak;
    if (!st?.week) return '';
    const libelle = { ok: 'répondu', joker: 'joker gratuit utilisé', paye: 'joker payé', today: 'aujourd’hui, pas encore répondu', future: 'à venir', miss: 'manqué' };
    const cases = st.week.map((w, i) => {
      const paye = w.state === 'joker' && w.paye === true;
      const t = paye ? 'J✦' : ({ ok: 'OK', joker: 'J', today: '?', future: '', miss: '–' }[w.state] ?? '');
      return `<li class="qdj-day is-${esc(w.state)}${paye ? ' is-paye' : ''}"><span class="qdj-box" aria-hidden="true">${t}</span><span class="qdj-dl" aria-hidden="true">${LETTRES[i]}</span>
        <span class="visually-hidden">${esc(JOUR_LONG.format(dateDe(w.day)))} : ${libelle[paye ? 'paye' : w.state] || ''}</span></li>`;
    }).join('');
    const jokSemaine = st.week.filter((w) => w.state === 'joker' && !w.paye).map((w) => JOUR_LONG.format(dateDe(w.day)));
    const payeSemaine = st.week.filter((w) => w.state === 'joker' && w.paye === true).map((w) => JOUR_LONG.format(dateDe(w.day)));
    const note = payeSemaine.length ? `J✦ = joker payé ${esc(payeSemaine[0])} : ta série continue.`
      : jokSemaine.length ? `J = joker${compact ? '' : ' gratuit'} utilisé ${esc(jokSemaine[0])} : ta série continue.` : 'Un joker par semaine : un jour d’oubli ne casse pas ta série.';
    return `<section class="card qdj-week" aria-labelledby="qdj-week-h">
      <div class="qdj-between"><h2 class="qdj-h2" id="qdj-week-h">Ta semaine</h2><span class="small muted">${st.joker_left ? '1 joker restant' : (payeSemaine.length && jokSemaine.length ? 'Jokers utilisés' : 'Joker utilisé')}</span></div>
      <ol class="qdj-days">${cases}</ol>
      ${compact ? '' : jokerHtml('quiz_jour', 'semaine', { jokerGratuit: jokSemaine[0] || '' })}
      <p class="small muted">${note}</p>
    </section>`;
  }

  /** Classement du mois : trois lignes sur l'accueil, dix puis tout dans l'onglet. */
  function carteClassement() {
    const b = S.board;
    if (!b) return '';
    const mois = MOIS.format(dateDe(b.month));
    const max = compact ? 3 : (S.tout ? 50 : 10);
    const rows = (b.rows || []).slice(0, max);
    const lien = compact
      ? '<a class="small qdj-link" href="/pages/jeux/jeux.html#jour">Tout le classement</a>'
      : ((b.rows || []).length > 10 ? `<button type="button" class="btn btn-ghost btn-sm qdj-more" data-tout aria-expanded="${S.tout}">${S.tout ? 'Moins' : 'Tout le classement'}</button>` : '');
    const li = rows.map((r) => `<li class="qdj-row${r.user_id === S.me ? ' is-me' : ''}"><span class="qdj-rank">${esc(String(r.rank))}</span>${avatarHtml(r, 26)}<span class="qdj-name">${esc(r.pseudo)}</span><span class="small muted">${esc(nf.format(r.bonnes))} bonne${r.bonnes > 1 ? 's' : ''}</span></li>`).join('');
    const moi = b.me && !rows.some((r) => r.user_id === S.me) ? `<p class="small muted">Toi : ${esc(String(b.me.rank))}e, ${esc(nf.format(b.me.bonnes))} bonne${b.me.bonnes > 1 ? 's' : ''}.</p>` : '';
    return `<section class="card qdj-board" aria-labelledby="qdj-board-h">
      <div class="qdj-between"><h2 class="qdj-h2" id="qdj-board-h">${esc(mois.charAt(0).toUpperCase() + mois.slice(1))}</h2>${lien}</div>
      ${li ? `<ol class="qdj-rows">${li}</ol>` : '<p class="small muted">Personne n’a encore répondu ce mois-ci : à toi de lancer le classement !</p>'}
      ${moi}
    </section>`;
  }

  /**
   * Dessine tout, puis habille la carte de résultat (tampon de points : 10 si juste, 0 sinon).
   * @param {boolean} [animer] true seulement juste après la réponse du membre
   */
  function dessine(animer = false) {
    el.innerHTML = `<div class="qdj${compact ? ' is-compact' : ''}">${carteQuestion()}${carteSemaine()}${carteClassement()}</div>`;
    if (!compact) boutonReponses(el.querySelector('.qdj-top'), 'jour');
    const res = el.querySelector('.qdj-result');
    if (res) finDePartie(res, { points: S.d.correct === true ? 10 : 0, animer });
  }

  /** Attend la fin d'un effet (aucune attente sans mouvement). */
  const attente = (ms) => (motionAllowed() ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

  /** Effet de la réponse : bonne = halo + Q1 ; mauvaise = secousse + Q2, puis la bonne réponse s'allume. */
  async function effetReponse(ok, valeur, solution) {
    const cible = (v) => el.querySelector(`.qdj-choice[data-choice="${CSS.escape(String(v))}"], .qdj-choice[data-multi="${CSS.escape(String(v))}"]`);
    const choisi = Array.isArray(valeur) ? null : cible(valeur);
    const carte = el.querySelector('.qdj-card');
    if (ok) {
      sonJour('Q1');
      rejoue(choisi || carte, 'fxj-bon');
      await attente(650);
      return;
    }
    sonJour('Q2');
    secouer(choisi || carte);
    await attente(450);
    const bonne = [...el.querySelectorAll('.qdj-choice')].find((b) => {
      const id = b.dataset.choice ?? b.dataset.multi;
      return id === String(solution) || b.textContent.trim() === String(solution);
    });
    if (bonne) rejoue(bonne, 'fxj-bon');
    await attente(550);
  }

  /** Envoie la réponse. */
  async function repond(valeur) {
    if (S.busy || !S.d?.question || S.d.answered) return;
    const err = el.querySelector('.qdj-error');
    S.busy = true;
    el.querySelectorAll('.qdj-choice, .qdj-send, .qdj-form button').forEach((b) => { b.disabled = true; });
    try {
      const { data, error } = await sb.rpc('hg_quiz_daily_answer', { p_response: valeur });
      if (error) throw error;
      S.retour = data || {};
      Object.assign(S.d, { answered: true, my_response: valeur, correct: data?.correct ?? false, explanation: data?.explanation ?? null,
        solution: data?.solution ?? null, stats: data?.stats ?? null, streak: data?.streak ?? S.d.streak });
      const gain = (data?.bonus || 0) + (data?.reward || 0) + (data?.paliers || []).reduce((s, p) => s + (p.paillettes || 0), 0);
      if (gain && toast) toast(`+${nf.format(gain)} Paillettes`, 'ok');
      try { const r = await sb.rpc('hg_quiz_daily_board', { p_month: null }); if (!r.error) S.board = r.data; } catch { /* classement inchangé */ }
      await effetReponse(data?.correct === true, valeur, data?.solution);
      dessine(true);
      el.querySelector('.qdj-result')?.focus();
    } catch (e) {
      console.warn('[question du jour]', e);
      el.querySelectorAll('.qdj-choice, .qdj-send, .qdj-form button').forEach((b) => { b.disabled = false; });
      if (err) { err.textContent = errMsg(e); err.hidden = false; }
    } finally {
      S.busy = false;
    }
  }

  // Interactions (délégation : la carte est redessinée après chaque réponse).
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-choice]');
    if (c) { repond(c.dataset.choice); return; }
    const m = e.target.closest('[data-multi]');
    if (m) {
      const id = m.dataset.multi;
      if (S.multi.has(id)) S.multi.delete(id); else S.multi.add(id);
      m.setAttribute('aria-pressed', String(S.multi.has(id)));
      return;
    }
    if (e.target.closest('[data-send]')) {
      if (!S.multi.size) { const err = el.querySelector('.qdj-error'); err.textContent = 'Choisis au moins une réponse.'; err.hidden = false; return; }
      repond([...S.multi]);
      return;
    }
    if (e.target.closest('[data-tout]')) { S.tout = !S.tout; dessine(); el.querySelector('[data-tout]')?.focus(); }
  });
  el.addEventListener('submit', (e) => {
    if (!e.target.matches('.qdj-form')) return;
    e.preventDefault();
    const v = el.querySelector('#qdj-input').value.trim();
    const err = el.querySelector('.qdj-error');
    if (!v) { err.textContent = 'Écris une réponse.'; err.hidden = false; return; }
    if (S.d.question.type === 'nombre' && !NOMBRE.test(v)) { err.textContent = 'Écris un nombre, par exemple 42 ou 3,5.'; err.hidden = false; return; }
    repond(v);
  });

  // Chargement : question du jour et classement du mois en parallèle.
  el.innerHTML = '<div class="card qdj-card"><p class="muted">Chargement de la question du jour…</p></div>';
  const [t, b] = await Promise.allSettled([sb.rpc('hg_quiz_daily_today'), sb.rpc('hg_quiz_daily_board', { p_month: null })]);
  if (t.status !== 'fulfilled' || t.value.error) {
    console.warn('[question du jour]', t.reason || t.value?.error);
    el.innerHTML = '<div class="card qdj-card"><p class="muted">Question du jour indisponible pour le moment.</p></div>';
    return;
  }
  S.d = t.value.data || {};
  if (b.status === 'fulfilled' && !b.value.error) S.board = b.value.data;
  dessine();
  // Joker payant de la Question du jour (serie-jeux.js) : « Ta semaine » est relue pour montrer le jour racheté.
  if (!compact) {
    document.addEventListener('jeux:serie', async (e) => {
      if (e.detail?.cle !== 'quiz_jour' || !el.isConnected) return;
      try { const r = await sb.rpc('hg_quiz_daily_today'); if (!r.error && r.data) { S.d = { ...S.d, streak: r.data.streak }; dessine(); } } catch { /* semaine inchangée */ }
    });
  }
}
