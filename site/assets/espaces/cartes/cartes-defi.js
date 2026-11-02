// ===== Défi de collection de la semaine (idée 62, migration 210) =====
// Un défi par semaine, le même pour tout le gang, affiché en tête des « Quêtes de la semaine » (onglet Ouverture).
// Les données arrivent avec les quêtes (hg_card_quests_me, champ « defi ») ; la récompense, un booster mis en stock,
// se réclame par hg_card_defi_claim(). Compté tout seul côté serveur : aucune preuve à envoyer.
// Exporte : defiHtml (encadré), claimDefi (réclamation).
import { esc } from '../../commun/core.js';

const nf = new Intl.NumberFormat('fr-CH');
// « lundi 9 novembre » : fin de la semaine du défi, heure suisse.
const jour = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Zurich' });

/* Phrase sous le défi : ce qui le fait avancer, selon le compteur. */
const AIDE = {
  cartes_serie: 'Compté tout seul : boosters, échanges, cadeaux et cartes sauvages de la semaine.',
  nouvelles_serie: 'Compté tout seul : boosters, échanges, cadeaux et cartes sauvages de la semaine.',
  fabriquees_serie: 'Compté tout seul : chaque carte de la série fabriquée cette semaine.',
  partenaires_echange: 'Compté tout seul : chaque offre acceptée avec un nouveau membre.',
  souhaits_obtenus: 'Compté tout seul : boosters, cartes sauvages et fabrication de la semaine.',
  echanges_souhaits: 'Compté tout seul : chaque échange accepté qui t’apporte une carte de ta liste.',
  series_completees: 'Compté tout seul : dès qu’une de tes séries est complète.',
  cartes_offertes: 'Compté tout seul : chaque carte offerte cette semaine.',
};

/**
 * Encadré du défi de la semaine (vide s'il n'y en a pas) : libellé, progression, récompense et état
 * (en cours, à réclamer, reçu).
 * @param {object|null} d défi (code, label, metric, target, progress, done, claimed, booster_name, ends_at)
 * @param {boolean} busy une réclamation est en cours
 * @returns {string}
 */
export function defiHtml(d, busy = false) {
  if (!d || !d.code) return '';
  const target = Math.max(1, Number(d.target) || 1);
  const value = Math.min(Math.max(0, Number(d.progress) || 0), target);
  const pct = Math.round((value / target) * 100);
  const prix = `1 booster ${d.booster_name || 'Classique'}`;
  const fin = d.ends_at ? ` · jusqu’au ${jour.format(new Date(d.ends_at))}` : '';
  const act = d.claimed ? '<span class="pill pill-ok">Booster reçu</span>'
    : d.done ? `<button type="button" class="btn btn-sand cq-btn" data-action="defi-claim" ${busy ? 'disabled' : ''}>Réclamer le booster</button>`
      : '<span class="pill pill-current">En cours</span>';
  return `<div class="cq-defi${d.claimed ? ' is-claimed' : ''}">
      <div class="cq-main">
        <p class="cq-defi-k">Défi de collection${esc(fin)}</p>
        <p class="cq-label cq-defi-t">${esc(d.label)}</p>
        <div class="progress cq-bar" role="progressbar" aria-label="${esc(d.label)}" aria-valuemin="0" aria-valuemax="${target}" aria-valuenow="${value}" aria-valuetext="${nf.format(value)} sur ${nf.format(target)}"><span style="width:${pct}%"></span></div>
        <p class="cartes-small cq-count">${nf.format(value)} / ${nf.format(target)} · récompense : ${esc(prix)}</p>
        <p class="cq-defi-aide">${esc(AIDE[d.metric] || 'Compté tout seul, sans preuve à envoyer.')}</p>
      </div>
      <div class="cq-act">${act}</div>
    </div>`;
}

/**
 * Réclame le booster du défi (hg_card_defi_claim). Renvoie le nom du booster reçu, ou lève l'erreur du serveur.
 * @param {object} sb client Supabase
 * @returns {Promise<string>}
 */
export async function claimDefi(sb) {
  const { data, error } = await sb.rpc('hg_card_defi_claim');
  if (error) throw error;
  return data?.booster_name || 'Classique';
}
