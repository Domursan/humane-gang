// Admin : fenêtre « Purger maintenant » de la page Entretien. confirmBox n'accepte que du texte : cette fenêtre reprend son style
// (.hg-dialog de ui-confirm.css) et son comportement (<dialog> modal, Échap ferme, focus sur « Annuler », retirée à la fermeture).
// Aperçu : hg_entretien_apercu ; purge : hg_entretien_purger (administrateur seulement, journalisées). Les deux passent par la même
// fonction de base que la purge de nuit (migration 192). La fenêtre n'invente aucun chiffre : elle plafonne l'aperçu avec le plafond rendu.
// Après la purge, les fichiers du bucket hg-challenges sans participation (hg_wch_admin_orphelins, migration 218) sont retirés du stockage.
// Utilisé par admin-entretien.js. Dépend de core.js (sb, toast, errMsg, esc) et entretien-sante.js (nf).
import { sb, toast, errMsg, esc } from '../../commun/core.js';
import { nf } from './entretien-sante.js';

/** Tables rendues par la base : libellé et durée qui s'y applique (clé du réglage, ou nombre de jours fixe de la migration 216). */
const TABLES = [
  ['job_run_details', 'Journal des tâches', 'journal_jours'],
  ['hg_plat_coups', 'Coups : Plateaux', 'coups_jours'],
  ['hg_uno_coups', 'Coups : Uno', 'coups_jours'],
  ['hg_duel_coups', 'Coups : Duels', 'coups_jours'],
  ['hg_ndc_coups', 'Coups : Nom de code', 'coups_jours'],
  ['hg_site_notifs', 'Notifications du site', 'notifs_jours'],
  ['hg_spect_vus', 'Spectateurs vus', 30],
  ['hg_card_member_bids', 'Offres des enchères closes', 365],
  ['hg_card_member_auctions', 'Enchères closes', 365],
  ['hg_cartes_anniv_mots', 'Mots des cartes d’anniversaire', 365],
  ['hg_cartes_anniv', 'Cartes d’anniversaire', 365],
  ['hg_jeux_jokers', 'Jokers (série terminée)', 365],
  ['hg_weekly_challenge_votes', 'Voix des challenges finis', 365],
  ['hg_weekly_challenge_winners', 'Gagnants des challenges finis', 365],
  ['hg_weekly_challenge_entries', 'Participations aux challenges finis', 365],
];
const TEXTE = {
  charge: 'L’aperçu compte les lignes concernées.',
  vide: 'Rien à purger pour l’instant : aucune ligne ne dépasse les durées réglées.',
  pret: 'Ces lignes seront supprimées définitivement.',
};

/**
 * Fichiers du bucket hg-challenges qui n'ont plus de participation (purgée, retirée, compte supprimé, envoi abandonné depuis
 * plus d'un jour) : la base ne peut pas les effacer, ils partent ici par l'API de stockage, au mieux, par lots de 100 (migration 218).
 * @returns {Promise<number>} Nombre de fichiers retirés (0 en cas d'échec : la purge des lignes, elle, est faite).
 */
async function fichiersChallenges() {
  try {
    const { data, error } = await sb.rpc('hg_wch_admin_orphelins');
    if (error || !Array.isArray(data) || !data.length) return 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 100) {
      const { error: e } = await sb.storage.from('hg-challenges').remove(data.slice(i, i + 100));
      if (e) break;
      n += Math.min(100, data.length - i);
    }
    return n;
  } catch { return 0; }
}

/** « n ligne » ou « n lignes ». */
export const lignes = (n) => `${nf(n)} ${n > 1 ? 'lignes' : 'ligne'}`;

/**
 * Lignes de l'aperçu et total du passage.
 * @param {{plafond: number, tables: Object<string, number>, journal_jours: number, coups_jours: number, notifs_jours: number}} a Réponse de hg_entretien_apercu.
 */
function calcul(a) {
  const liste = TABLES.filter(([cle]) => cle in (a.tables || {})).map(([cle, nom, duree]) => ({ nom, jours: typeof duree === 'number' ? duree : a[duree], n: Number(a.tables[cle]) || 0 }));
  return { liste, passage: liste.reduce((s, l) => s + Math.min(l.n, a.plafond), 0), plafonnees: liste.filter((l) => l.n > a.plafond).length };
}

/** Tableau de l'aperçu. */
function tableHtml(a, { liste, passage }) {
  const rows = liste.map((l) => `<tr><th scope="row">${esc(l.nom)}<span class="small muted">plus de ${esc(l.jours)} ${l.jours > 1 ? 'jours' : 'jour'}</span></th>
    <td${l.n ? '' : ' class="muted"'}>${l.n > a.plafond ? `${esc(nf(a.plafond))}<span class="small muted">sur ${esc(nf(l.n))}</span>` : esc(nf(l.n))}</td></tr>`).join('');
  return `<table class="pg-tbl"><caption class="visually-hidden">Lignes supprimées par table</caption>
    <thead><tr><th scope="col">Table</th><th scope="col">Lignes qui partiraient</th></tr></thead><tbody>${rows}</tbody>
    <tfoot><tr><th scope="row">Total de ce passage</th><td>${esc(nf(passage))}</td></tr></tfoot></table>`;
}

/**
 * Ouvre la fenêtre et lance l'aperçu.
 * @param {(n: number) => void} [onPurge] Appelée après une purge réussie, une fois la fenêtre fermée (n : lignes supprimées).
 */
export function ouvrirPurge(onPurge) {
  const dlg = document.createElement('dialog');
  dlg.className = 'hg-dialog pg-dialog';
  dlg.setAttribute('aria-labelledby', 'pg-t');
  dlg.setAttribute('aria-describedby', 'pg-d');
  dlg.tabIndex = -1;
  dlg.innerHTML = `<form method="dialog" class="stack">
    <h2 id="pg-t" class="dialog-title">Purger maintenant ?</h2>
    <p class="muted" id="pg-d">${TEXTE.charge}</p>
    <div class="pg-corps"><div class="empty">Calcul de l’aperçu…</div></div>
    <p class="pg-info small muted" data-pg-cap><strong>Plafond :</strong> 50 000 lignes par table et par passage.</p>
    <p class="pg-info small muted"><strong>Jamais purgé :</strong> le Loup-Garou (journal, actions, votes) et les parties annulées.</p>
    <div class="btn-row dialog-actions"><button class="btn btn-ghost" type="submit" value="cancel" formnovalidate>Annuler</button><button class="btn btn-danger" type="submit" value="ok" disabled>Purger</button></div>
  </form>`;
  const texte = dlg.querySelector('#pg-d'), corps = dlg.querySelector('.pg-corps'), cap = dlg.querySelector('[data-pg-cap]');
  const annuler = dlg.querySelector('button[value="cancel"]'), ok = dlg.querySelector('button[value="ok"]');
  let enCours = false;

  /** Pose le bouton de purge : sans chiffre, il reste « Purger » et inactif. */
  const bouton = (n) => { ok.disabled = !n; ok.textContent = n ? `Purger ${lignes(n)}` : 'Purger'; };

  /** Aperçu impossible, ou purge refusée : message, et rien n'a bougé (une transaction en base). */
  function erreur(titre, msg, reessai) {
    bouton(0);
    texte.textContent = TEXTE.pret;
    corps.innerHTML = `<p class="form-error" role="alert">${esc(titre)} : ${esc(msg)}. Rien n’a été supprimé.</p>
      ${reessai ? '<div class="btn-row"><button class="btn btn-ghost btn-sm" type="button" data-pg-retry>Réessayer</button></div>' : ''}`;
  }

  /** Lance l'aperçu et dessine son résultat, sans toucher au focus. */
  async function apercu() {
    texte.textContent = TEXTE.charge;
    corps.innerHTML = '<div class="empty">Calcul de l’aperçu…</div>';
    bouton(0);
    try {
      const { data, error } = await sb.rpc('hg_entretien_apercu');
      if (error) throw error;
      if (!dlg.isConnected) return;
      const c = calcul(data);
      texte.textContent = c.passage ? TEXTE.pret : TEXTE.vide;
      corps.innerHTML = tableHtml(data, c);
      if (c.plafonnees) {
        cap.className = 'pg-cap small';
        cap.innerHTML = `<strong>Plafond atteint.</strong> Ce passage retire ${esc(nf(data.plafond))} lignes ${c.plafonnees > 1 ? 'de chacune de ces tables' : 'de cette table'}. Le reste part aux passages suivants.`;
      } else {
        cap.className = 'pg-info small muted';
        cap.innerHTML = `<strong>Plafond :</strong> ${esc(nf(data.plafond))} lignes par table et par passage.`;
      }
      bouton(c.passage);
    } catch (e) { if (dlg.isConnected) erreur('Aperçu impossible', errMsg(e), true); }
  }

  /** Purge : la fenêtre reste ouverte et bloquée jusqu'à la réponse. */
  async function purger() {
    enCours = true;
    ok.disabled = true; annuler.disabled = true;
    ok.textContent = 'Purge en cours…';
    dlg.focus();
    try {
      const { data, error } = await sb.rpc('hg_entretien_purger');
      if (error) throw error;
      const n = Object.values(data?.tables || {}).reduce((s, x) => s + Number(x || 0), 0);
      const f = await fichiersChallenges();
      enCours = false;
      dlg.close('fait');
      toast((n ? `${lignes(n)} ${n > 1 ? 'purgées' : 'purgée'}.` : 'Aucune ligne purgée.')
        + (f ? ` ${nf(f)} ${f > 1 ? 'fichiers de challenge retirés' : 'fichier de challenge retiré'}.` : ''), 'ok');
      onPurge?.(n);
    } catch (e) {
      enCours = false;
      annuler.disabled = false;
      erreur('Purge impossible', errMsg(e), true);
      annuler.focus();
    }
  }

  dlg.querySelector('form').addEventListener('submit', (e) => {
    if (e.submitter?.value !== 'ok') return;
    e.preventDefault();
    if (!ok.disabled) purger();
  });
  corps.addEventListener('click', (e) => { if (e.target.closest('[data-pg-retry]')) apercu(); });
  dlg.addEventListener('cancel', (e) => { if (enCours) e.preventDefault(); }); // Échap pendant la purge : elle ne s'annule pas
  dlg.addEventListener('close', () => dlg.remove(), { once: true });
  document.body.append(dlg);
  dlg.showModal();
  annuler.focus();
  apercu();
}
