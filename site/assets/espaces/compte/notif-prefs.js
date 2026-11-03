// ===== Humane Gang — bloc « Mes notifications » de la page Mon compte (idée Q6) =====
/*
 * Rôle : une ligne par catégorie, deux interrupteurs (« Sur ce téléphone » pour le push, « Sur Discord » pour les MP du bot),
 * le grand interrupteur « Le bot peut m'écrire sur Discord » (hg_profiles.bot_optin) et les heures calmes.
 * Page : /pages/compte/compte.html (monté par compte.js à côté du bloc « Notifications sur cet appareil »).
 * Dépendances : core.js (sb, toast, errMsg, esc).
 * Tables / RPC : hg_notif_prefs (lecture de sa ligne), hg_set_notif_prefs (écriture, migration 095), hg_profiles (bot_optin).
 * Réglages par défaut = comportement d'avant : clé absente = autorisé ; « Sorties IRL » sur Discord reprend remind_irl
 * (rappels de sortie) et « Cartes · souhaits » sur Discord reprend notify_card_wish ; la RPC tient ces colonnes à jour.
 * « Carte de ma liste proposée » (migration 193) ne part que sur le site : sa ligne a un seul interrupteur, sous « Cartes · souhaits ».
 * « Anniversaires · cartes communes » (migration 205) : notification du site seulement, une ligne à un interrupteur sous « Anniversaires ».
 * « Challenge de la semaine » (migration 218, clé challenges.site) : notification du site seulement, ligne à un interrupteur.
 * « C’est ton tour » (migration 200) : les heures calmes coupent aussi son MP, voir hg_notif_allowed.
 * Exporte : NOTIF_ROWS, mountNotifPrefs.
 */
import { sb, toast, errMsg, esc } from '../../commun/core.js';
import { loadMyPages, canAccess, pageLabel } from '../../commun/core/pages-access.js';

/**
 * Catégories affichées : [clé, titre, détail, push disponible, page requise (facultatif : la ligne n'apparaît que si la page est déclarée et ouverte au membre)]. Le push n'est envoyé aujourd'hui que pour les messages et « c’est ton tour » :
 * les autres lignes montrent « Bientôt » dans la colonne téléphone au lieu d'un interrupteur sans effet.
 */
export const NOTIF_ROWS = [
  ['messages', 'Messages privés', 'Nouveau message, sans le contenu', true],
  ['sorties', 'Sorties IRL', 'Rappels de tes sorties, 24 h et 2 h avant', false],
  ['echanges', 'Cartes · échanges', 'Offres et contre-propositions', false],
  ['souhaits', 'Cartes · souhaits et cadeaux', 'Carte souhaitée obtenue, don du Staff', false],
  ['santa', 'Secret Santa', 'Tirage, colis envoyé ou reçu, rappel d’envoi', false],
  ['anniversaires', 'Anniversaires', 'Ton message d’anniversaire', false],
  ['quiz', 'Quiz et défis', 'Nouveau défi du gang, résultats', false],
  ['jeux', 'Jeux · duels', 'Un membre te défie à un duel (Puissance 4, Bataille navale…)', false, 'duels'],
  ['tours', 'Jeux · c’est ton tour', 'Duels, Uno et plateaux : tu n’es pas sur le site et le jeu a dû jouer pour toi. Une fois par partie, 5 par jour au plus.', true],
];
/** Heures calmes proposées quand on les active. */
const QUIET_DEFAULT = [23, 8];

/**
 * Valeur affichée d'un interrupteur : la préférence enregistrée, sinon le comportement actuel.
 * @param {object} prefs préférences enregistrées
 * @param {object} me profil (remind_irl, notify_card_wish)
 * @param {string} key clé « catégorie.canal »
 * @returns {boolean}
 */
function current(prefs, me, key) {
  if (typeof prefs[key] === 'boolean') return prefs[key];
  if (key === 'sorties.discord') return !!me.remind_irl;
  if (key === 'souhaits.discord') return !!me.notify_card_wish;
  return true;
}

/** Options d'heure (00:00 à 23:00) d'un sélecteur, avec la valeur choisie. */
const hourOptions = (sel) => Array.from({ length: 24 }, (_, h) => `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');

/**
 * HTML du bloc.
 * @param {object} me profil
 * @param {{prefs: object, quiet_start: number|null, quiet_end: number|null}} row préférences
 * @returns {string}
 */
function blockHtml(me, row) {
  const prefs = row.prefs || {};
  const quietOn = row.quiet_start != null;
  const [qs, qe] = quietOn ? [row.quiet_start, row.quiet_end] : QUIET_DEFAULT;
  const sw = (key, label) => `<input class="pref-switch np-sw" type="checkbox" role="switch" data-key="${key}" aria-label="${esc(label)}"${current(prefs, me, key) ? ' checked' : ''}>`;
  const ligneCarteProposee = `<div class="np-row" role="row">
      <div class="np-cat" role="rowheader"><b>Cartes · carte de ma liste proposée</b><span>Un membre la met en échange. 3 alertes par jour au plus.</span></div>
      <div class="np-cell np-site" role="cell"><span class="np-soon">Sur le site</span>${sw('carte_proposee.site', 'Carte de ma liste proposée : sur le site')}</div></div>`;
  // Cartes d'anniversaire communes (migration 205) : notification du site seulement, sous « Anniversaires ».
  const ligneCartesAnniv = `<div class="np-row" role="row">
      <div class="np-cat" role="rowheader"><b>Anniversaires · cartes communes</b><span>Une carte s’ouvre pour un membre, rappel la veille si tu n’as pas signé.</span></div>
      <div class="np-cell np-site" role="cell"><span class="np-soon">Sur le site</span>${sw('anniversaires.site', 'Cartes d’anniversaire communes : sur le site')}</div></div>`;
  // Challenge de la semaine (migration 218) : notification du site seulement, si la page est ouverte au membre.
  const ligneChallenges = pageLabel('challenge') && canAccess('challenge') ? `<div class="np-row" role="row">
      <div class="np-cat" role="rowheader"><b>Challenge de la semaine</b><span>Ouverture du vote, résultat. Un retrait de ta participation par l’admin est toujours signalé.</span></div>
      <div class="np-cell np-site" role="cell"><span class="np-soon">Sur le site</span>${sw('challenges.site', 'Challenge de la semaine : sur le site')}</div></div>` : '';
  const rows = NOTIF_ROWS.filter(([, , , , page]) => !page || (pageLabel(page) && canAccess(page))).map(([k, t, d, push]) => { const nom = k === 'tours' ? 'C’est ton tour' : t; return `<div class="np-row" role="row">
      <div class="np-cat" role="rowheader"><b>${esc(t)}</b><span>${esc(d)}</span></div>
      <div class="np-cell" role="cell">${push ? sw(`${k}.push`, `${nom} : sur ce téléphone`) : '<span class="np-soon">Bientôt</span>'}</div>
      <div class="np-cell np-discord" role="cell">${sw(`${k}.discord`, `${nom} : sur Discord`)}</div></div>${k === 'souhaits' ? ligneCarteProposee : ''}${k === 'anniversaires' ? ligneCartesAnniv : ''}`; }).join('');
  return `<form class="card stack np-card" id="np-form" novalidate aria-labelledby="np-title">
      <h2 class="card-title" id="np-title">Mes notifications</h2>
      <label class="np-master switch-row">
        <span class="switch-txt"><strong>Le bot peut m’écrire sur Discord</strong><small>Coupe tous les MP du bot d’un coup</small></span>
        <input class="pref-switch" type="checkbox" role="switch" id="np-bot"${me.bot_optin ? ' checked' : ''}>
      </label>
      <div class="np-table" role="table" aria-label="Notifications par catégorie">
        <div class="np-head" role="row"><span role="columnheader"><span class="visually-hidden">Catégorie</span></span><span role="columnheader">Sur ce téléphone</span><span role="columnheader">Sur Discord</span></div>
        ${rows}${ligneChallenges}
        <div class="np-row" role="row">
          <div class="np-cat" role="rowheader"><b>Annonces du Staff</b><span>Toujours actives</span></div>
          <div class="np-cell" role="cell"><span class="np-soon">Toujours</span></div>
          <div class="np-cell" role="cell"><span class="np-soon">Toujours</span></div>
        </div>
      </div>
      <div class="np-quiet">
        <label class="switch-row np-quiet-row">
          <span class="switch-txt"><strong>Heures calmes</strong><small>Aucune notification sur ce téléphone pendant ce créneau ; les MP Discord ne changent pas, sauf « C’est ton tour ».</small></span>
          <input class="pref-switch" type="checkbox" role="switch" id="np-quiet"${quietOn ? ' checked' : ''}>
        </label>
        <div class="np-hours"${quietOn ? '' : ' hidden'}>
          <label for="np-qs">De</label><select id="np-qs">${hourOptions(qs)}</select>
          <label for="np-qe">à</label><select id="np-qe">${hourOptions(qe)}</select>
          <span class="small muted">(heure de Zurich)</span>
        </div>
      </div>
      <p class="small muted">La colonne « Sur ce téléphone » agit seulement si les notifications sont activées sur cet appareil (bloc « Notifications sur cet appareil »).</p>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Enregistrer</button></div>
      <p class="small np-status" role="status" aria-live="polite"></p>
    </form>`;
}

/** Grise la colonne Discord quand le bot ne peut plus écrire (le réglage reste enregistré). */
function syncMaster(form) {
  const off = !form.querySelector('#np-bot').checked;
  form.classList.toggle('is-bot-off', off);
  for (const el of form.querySelectorAll('.np-discord .np-sw')) el.disabled = off;
}

/**
 * Monte le bloc dans `container` pour le membre `me`. `onProfile` reçoit le profil mis à jour (bot_optin) après enregistrement.
 * @param {HTMLElement|null} container zone du bloc
 * @param {object} me profil du membre
 * @param {(p: object) => void} [onProfile]
 * @returns {Promise<void>}
 */
export async function mountNotifPrefs(container, me, onProfile = () => {}) {
  if (!container || !me) return;
  let row = { prefs: {}, quiet_start: null, quiet_end: null };
  try {
    const { data, error } = await sb.from('hg_notif_prefs').select('prefs, quiet_start, quiet_end').eq('user_id', me.id).maybeSingle();
    if (!error && data) row = data;
  } catch {}
  try { await loadMyPages(); } catch {}
  container.innerHTML = blockHtml(me, row);
  container.hidden = false;
  const form = container.querySelector('#np-form');
  syncMaster(form);
  form.addEventListener('change', (e) => {
    if (e.target.id === 'np-bot') syncMaster(form);
    if (e.target.id === 'np-quiet') form.querySelector('.np-hours').hidden = !e.target.checked;
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = form.querySelector('.np-status');
    const prefs = {};
    for (const el of form.querySelectorAll('.np-sw')) prefs[el.dataset.key] = el.checked;
    const quiet = form.querySelector('#np-quiet').checked;
    const qs = Number(form.querySelector('#np-qs').value), qe = Number(form.querySelector('#np-qe').value);
    if (quiet && qs === qe) { status.textContent = 'Les heures calmes doivent commencer et finir à des heures différentes.'; return; }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true; status.textContent = 'Enregistrement…';
    try {
      const { error } = await sb.rpc('hg_set_notif_prefs', { p_prefs: prefs, p_quiet_start: quiet ? qs : null, p_quiet_end: quiet ? qe : null });
      if (error) throw error;
      const bot = form.querySelector('#np-bot').checked;
      const patch = { bot_optin: bot };
      // La RPC a recopié « Sorties » et « Souhaits » sur Discord dans le profil : on garde la copie locale à jour.
      Object.assign(me, { remind_irl: prefs['sorties.discord'], notify_card_wish: prefs['souhaits.discord'] });
      if (bot !== !!me.bot_optin) {
        const { data, error: e2 } = await sb.from('hg_profiles').update(patch).eq('id', me.id).select().single();
        if (e2) throw e2;
        Object.assign(me, data);
      }
      onProfile(me);
      status.textContent = 'Notifications enregistrées.';
      toast('Notifications enregistrées.', 'ok');
    } catch (err) {
      status.textContent = '';
      toast(errMsg(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });
}
