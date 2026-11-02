// ===== Humane Gang — règles d'une enchère (migration 097), partagé par l'admin et la page des enchères =====
// Rôle : champs du formulaire de règles (mise de départ, pas, mise maximale, plafond en % du solde du lundi, prolongation,
// offres par membre, gagnant précédent exclu), lecture du formulaire, et résumé lisible des règles pour les membres.
// Un champ laissé vide = aucune limite (mise maximale, plafond, offres par membre).
// Exporte : DEFAULT_RULES, rulesFieldsHtml(id, rules, opts), readRules(form), rulesSummary(rules).

import { paillSym } from '../../commun/paillettes.js';

/** Règles par défaut (identiques au comportement d'avant 097). */
export const DEFAULT_RULES = {
  min_bid: 500, step: 50, max_bid: null, cap_pct: 50, extend_min: 5, extend_cap_min: 60, max_bids_user: null, block_last_winner: true,
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const val = (v) => (v === null || v === undefined ? '' : esc(v));
const nf = new Intl.NumberFormat('fr-CH');

/**
 * Champs du formulaire de règles.
 * @param {string} id préfixe unique des identifiants (plusieurs formulaires sur une page)
 * @param {object} [rules] règles actuelles (défaut : DEFAULT_RULES)
 * @param {{lockMin?: boolean, sansMise?: boolean}} [opts] lockMin : mise de départ figée (une offre existe déjà) ;
 *   sansMise : pas de champ « Mise de départ » (le formulaire d'enchère en lot la demande à part, près des dates)
 * @returns {string} HTML
 */
export function rulesFieldsHtml(id, rules = DEFAULT_RULES, opts = {}) {
  const r = { ...DEFAULT_RULES, ...rules };
  const f = (name, label, attrs, help) => `<div class="field"><label for="${id}-${name}">${label}</label>
      <input id="${id}-${name}" name="${name}" type="number" inputmode="numeric" ${attrs} value="${val(r[name])}"${help ? ` aria-describedby="${id}-${name}-h"` : ''}>
      ${help ? `<p class="small muted" id="${id}-${name}-h">${help}</p>` : ''}</div>`;
  return `<fieldset class="enr-rules"><legend>Règles de l’enchère</legend>
    <div class="acd-grid-2">
      ${opts.sansMise ? '' : f('min_bid', `Mise de départ (${paillSym()})`, `min="1" max="100000" required${opts.lockMin ? ' readonly' : ''}`, opts.lockMin ? 'Figée : une offre a déjà été faite.' : '')}
      ${f('step', `Pas minimal entre deux offres (${paillSym()})`, 'min="1" max="10000" required', '')}
      ${f('max_bid', `Mise maximale par offre (${paillSym()})`, 'min="1" max="1000000" placeholder="Aucune"', 'Vide : pas de maximum.')}
      ${f('cap_pct', 'Plafond d’un membre (% de son solde du lundi)', 'min="1" max="100" placeholder="Aucun"', 'Vide : seul son solde compte. 50 = la moitié.')}
      ${f('max_bids_user', 'Nombre d’offres par membre', 'min="1" max="1000" placeholder="Illimité"', 'Vide : illimité.')}
      ${f('extend_min', 'Prolongation anti-dernière seconde (min)', 'min="0" max="60" required', 'Une offre dans les N dernières minutes prolonge de N minutes. 0 : aucune.')}
      ${f('extend_cap_min', 'Prolongation totale au plus (min)', 'min="0" max="1440" required', '')}
    </div>
    <label class="check"><input type="checkbox" name="block_last_winner" ${r.block_last_winner ? 'checked' : ''}> Le gagnant de la dernière enchère ne peut pas enchérir</label>
  </fieldset>`;
}

/**
 * Lit les règles d'un formulaire contenant rulesFieldsHtml. Les champs vides sont envoyés vides (le serveur les lit
 * comme « aucune limite »).
 * @param {HTMLFormElement} form
 * @returns {object}
 */
export function readRules(form) {
  const fd = new FormData(form);
  const s = (k) => String(fd.get(k) ?? '').trim();
  return {
    min_bid: s('min_bid'), step: s('step'), max_bid: s('max_bid'), cap_pct: s('cap_pct'), max_bids_user: s('max_bids_user'),
    extend_min: s('extend_min') || '0', extend_cap_min: s('extend_cap_min') || '0', block_last_winner: fd.get('block_last_winner') === 'on',
  };
}

/**
 * Règles en phrases courtes, pour les membres.
 * @param {object} r règles (clé rules de hg_auction_current)
 * @returns {string[]}
 */
export function rulesSummary(r) {
  if (!r) return [];
  const p = (n) => `${nf.format(n)} ${paillSym()}`;
  const out = [`Mise de départ ${p(r.min_bid)}, puis au moins ${p(r.step)} de plus que la meilleure offre.`];
  if (r.max_bid) out.push(`Mise maximale : ${p(r.max_bid)}.`);
  out.push(r.cap_pct ? `Plafond : ${r.cap_pct} % de ton solde de lundi.` : 'Pas de plafond lié à la semaine : ton solde suffit.');
  if (r.max_bids_user) out.push(`${r.max_bids_user} offre${r.max_bids_user > 1 ? 's' : ''} au plus par membre.`);
  out.push(r.extend_min > 0
    ? `Une offre dans les ${r.extend_min} dernières minutes prolonge de ${r.extend_min} minutes (${r.extend_cap_min} min au plus).`
    : 'Pas de prolongation : l’enchère finit à l’heure prévue.');
  if (r.block_last_winner) out.push('Le gagnant de la dernière enchère ne peut pas enchérir.');
  return out;
}
