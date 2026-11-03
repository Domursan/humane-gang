// ===== Humane Gang — challenge de la semaine : carte de l'accueil =====
// Rôle : la carte « Challenge de la semaine » posée à côté du bloc « Défi du gang » de l'accueil (les deux côte à côte
// sur ordinateur, l'un sous l'autre sur téléphone). Visible quand un challenge est à venir, ouvert, en vote, ou terminé
// depuis moins de 3 jours (c'est hg_wch_page qui choisit le challenge « courant ») ; sinon rien n'est ajouté.
// Chargée à la demande par accueil.js (import dynamique), seulement si la page du challenge est accessible.
// Dépendances : core.js (sb, esc), icons.js, challenge-commun.js. RPC : hg_wch_page. Exporte : mountChallengeHome.
import { sb, esc } from '../../commun/core.js';
import { svg } from '../../commun/icons.js';
import { phasePill, typeOf, quand, unitsHtml, tickRebours, gainTexte, pluriel } from './challenge-commun.js';

/** Adresse de la page du challenge. */
const PAGE = '/pages/compte/challenge.html';

/**
 * Lit le challenge courant et pose la carte à côté du bloc des défis.
 * @param {HTMLElement} defiEl bloc « Défi du gang » de l'accueil (#defi), qui reste à sa place dans la page
 * @param {{id: string}} me membre connecté
 * @returns {Promise<void>}
 */
export async function mountChallengeHome(defiEl, me) {
  if (!defiEl?.parentElement) return;
  const { data, error } = await sb.rpc('hg_wch_page');
  if (error) { console.warn('[challenge]', error.message || error); return; }
  const c = data?.current;
  if (!c || c.phase === 'annule') return;

  const t = typeOf(c.answer_type);
  const gain = gainTexte(c);
  const nb = Number(c.entries_count) || 0;
  let info = '', cible = '', titreCd = '', lien = 'Voir le challenge', pied = gain ? `<strong>${esc(gain)}</strong> pour le gagnant` : '';

  if (c.phase === 'a_venir') {
    info = `${t.attendu} · participation dès le ${quand(c.starts_at)}`;
    cible = c.starts_at; titreCd = 'Début de la participation dans';
  } else if (c.phase === 'participation') {
    const mes = (c.my_entries || []).length;
    info = `${t.attendu} · jusqu’au ${quand(c.ends_at)}`;
    cible = c.ends_at; titreCd = 'Fin de la participation dans';
    lien = mes ? 'Voir ma participation' : 'Participer';
    if (mes) pied += `${pied ? ' · ' : ''}tu as participé`;
  } else if (c.phase === 'vote') {
    info = `${pluriel(nb, 'participation')} · vote jusqu’au ${quand(c.vote_ends_at)}`;
    cible = c.vote_ends_at; titreCd = 'Fin du vote dans';
    lien = c.can_vote ? 'Voter' : 'Voir les participations';
    if (c.can_vote && !c.my_vote) pied += `${pied ? ' · ' : ''}tu as participé, ta voix n’est pas encore donnée`;
    else if (c.can_vote) pied += `${pied ? ' · ' : ''}ta voix est donnée`;
  } else {
    // Après le vote : gagnant(s) ou état d'attente, sans compte à rebours.
    const ws = c.winners || [];
    lien = 'Voir le résultat';
    if (c.phase === 'termine' && ws.length) {
      const noms = ws.map((w) => w.pseudo || 'un membre');
      info = ws.length > 1 ? `Gagnants ex æquo : ${noms.join(', ')}` : `Gagnant : ${noms[0]}${ws[0].chosen_by_admin ? ' (choisi par l’admin)' : ` · ${pluriel(Number(ws[0].votes) || 0, 'voix', 'voix')}`}`;
      pied = ws.some((w) => w.user_id === me?.id) ? '<strong>Bravo, tu as gagné !</strong>' : '';
    } else if (c.phase === 'sans_gagnant') {
      info = 'Terminé sans gagnant.'; pied = '';
    } else {
      info = 'Vote terminé · résultat bientôt.';
    }
  }

  const sec = document.createElement('section');
  sec.className = 'card home-chl';
  sec.id = 'chl-home';
  sec.setAttribute('aria-labelledby', 'chl-home-title');
  sec.innerHTML = `<h2 class="card-title" id="chl-home-title">${svg('trophy', { size: 20, stroke: 1.8 })} Challenge de la semaine</h2>
    <div class="chl-home">
      <div class="defi-top"><p class="defi-title">${esc(c.title)}</p>${phasePill(c.phase)}</div>
      <p class="small muted">${esc(info)}</p>
      ${cible ? `<div class="cd-units chl-home-cd" role="timer" data-cd="${esc(cible)}" data-cd-label="${esc(titreCd)}">${unitsHtml(cible)}</div>` : ''}
      ${pied ? `<p class="small defi-count">${pied}</p>` : ''}
      <div class="btn-row"><a class="btn btn-primary" href="${PAGE}">${esc(lien)}</a></div>
    </div>`;
  tickRebours(sec); // pose le libellé lu (« Fin du vote dans 1 jour, … »)

  // Le bloc des défis et la carte côte à côte. Bloc des défis masqué (aucun défi) : la carte prend toute la largeur.
  const duo = document.createElement('div');
  duo.className = 'grid home-duo';
  defiEl.before(duo);
  duo.append(defiEl, sec);

  if (cible) {
    const timer = setInterval(() => {
      if (!sec.isConnected) { clearInterval(timer); return; }
      if (tickRebours(sec)) clearInterval(timer);
    }, 30000);
  }
}

