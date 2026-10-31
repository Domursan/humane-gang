// ===== Humane Gang — administration : Questions du gang, onglet « Question du jour » (J4) =====
// Rôle : calendrier de la question du jour (7 jours passés, 21 jours à venir). Les jours passés montrent la question
// et le score du gang ; les jours à venir peuvent recevoir une question programmée (sinon : tirage automatique parmi les
// questions faciles et moyennes, au premier passage du jour, à 6 h). Aujourd'hui n'est modifiable que si personne
// n'a encore vu la question.
// RPC : hg_quiz_daily_calendar, hg_quiz_daily_plan (permission « quiz », migration 084). Questions : table
// hg_quiz_questions (lecture Staff « quiz »).
// Dépendances : core.js (sb, toast, esc, errMsg).
// Exporte : mountQuizJour(container), et pour la page Programmation (admin-programme.js) : questionsProgrammables, libelleQuestion.
import { sb, toast, esc, errMsg } from '../../commun/core.js';

const JOUR = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DIFF = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile', expert: 'Expert' };

/**
 * Questions proposées en question du jour : actives et non secrètes. Le serveur refuse celles à valider à la main.
 * @returns {Promise<object[]>}
 */
export async function questionsProgrammables() {
  const { data, error } = await sb.from('hg_quiz_questions').select('id, prompt, difficulty, qtype, active, secret').eq('active', true).order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).filter((x) => !x.secret);
}
/** Libellé d'une question dans une liste de choix. */
export const libelleQuestion = (q) => `${q.prompt.slice(0, 90)} (${DIFF[q.difficulty] || q.difficulty})`;

/**
 * Monte l'onglet dans son conteneur.
 * @param {HTMLElement} root Conteneur.
 * @returns {Promise<void>}
 */
export async function mountQuizJour(root) {
  if (!root) return;
  const S = { cal: null, questions: [] };

  /** Charge le calendrier et les questions programmables. */
  async function charge() {
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.parse(today) - 7 * 864e5).toISOString().slice(0, 10);
    const [c, q] = await Promise.all([
      sb.rpc('hg_quiz_daily_calendar', { p_from: from, p_days: 28 }),
      questionsProgrammables().catch(() => []),
    ]);
    if (c.error) throw c.error;
    S.cal = c.data || { days: [] };
    S.questions = q;
  }

  /** Une ligne du calendrier. */
  function ligne(d) {
    const passe = d.day < S.cal.today;
    const auj = d.day === S.cal.today;
    const quand = `${JOUR.format(new Date(`${d.day}T12:00:00Z`))}${auj ? ' (aujourd’hui)' : ''}`;
    const qui = d.prompt ? (d.auto ? 'tirage automatique' : `programmée par ${esc(d.picked_by || 'le Staff')}`) : '';
    const score = d.answered ? `${d.correct} / ${d.answered} juste${d.correct > 1 ? 's' : ''}` : '';
    const modifiable = !passe && !(auj && d.answered);
    const opts = S.questions.map((q) => `<option value="${esc(q.id)}"${q.id === d.question_id ? ' selected' : ''}>${esc(libelleQuestion(q))}</option>`).join('');
    const form = modifiable ? `<div class="adqj-plan">
        <label class="visually-hidden" for="adqj-${d.day}">Question du ${esc(quand)}</label>
        <select class="input" id="adqj-${d.day}" data-day="${d.day}"><option value="">Tirage automatique</option>${opts}</select>
        <button type="button" class="btn btn-ghost btn-sm" data-plan="${d.day}">Enregistrer</button></div>` : '';
    return `<li class="adqj-row${auj ? ' is-today' : ''}${passe ? ' is-past' : ''}">
      <div class="adqj-day">${esc(quand)}</div>
      <div class="adqj-q">${d.prompt ? `<span>${esc(d.prompt)}</span>` : '<span class="muted">Tirage automatique au premier passage du jour</span>'}
        ${qui || score ? `<span class="small muted">${[qui, score].filter(Boolean).join(' · ')}</span>` : ''}</div>
      ${form}</li>`;
  }

  /** Dessine l'onglet. */
  function dessine() {
    root.innerHTML = `<section class="card stack adqj">
      <div><h3 class="card-title">Question du jour</h3>
        <p class="small muted">Chaque matin à 6 h, une question de la banque est mise en avant sur l’accueil et dans Jeux. Sans programmation, le site tire une question facile ou moyenne, jamais tombée en question du jour et peu répondue. Les questions à valider à la main et les questions secrètes ne peuvent pas être choisies.</p></div>
      <ol class="adqj-list">${(S.cal.days || []).map(ligne).join('')}</ol>
    </section>`;
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-plan]');
    if (!b || b.disabled) return;
    const day = b.dataset.plan;
    const v = root.querySelector(`select[data-day="${day}"]`)?.value || null;
    b.disabled = true;
    try {
      const { error } = await sb.rpc('hg_quiz_daily_plan', { p_day: day, p_question: v });
      if (error) throw error;
      toast(v ? 'Question du jour programmée' : 'Retour au tirage automatique', 'ok');
      await charge();
      dessine();
    } catch (x) {
      toast(errMsg(x), 'error');
      b.disabled = false;
    }
  });

  root.innerHTML = '<div class="empty">Chargement du calendrier…</div>';
  try {
    await charge();
    dessine();
  } catch (x) {
    root.innerHTML = `<div class="empty">Calendrier indisponible : ${esc(errMsg(x))}</div>`;
  }
}
