// Admin : quotas du plan gratuit de Supabase, pour la page Entretien et l'« À faire » de La Mairie.
// Lit hg_entretien_quotas() (migration 192 ; droit « reglages », vérifié en base) et calcule les alertes à 80 %.
// « Ignorer cette semaine » : hg_entretien_ignorer, administrateur seulement (modèle : eco-health.js).
// Tous les calculs se font en octets. Affichage : 1 Mo = 1 000 000 octets, comme les quotas de Supabase (500 Mo et 1 Go).
// Le plafond d'import vaut 700 Mo au sens de outils/images/importer-lots.mjs (700 × 1024 × 1024 octets) et ne porte que sur le stockage.
// Utilisé par admin-entretien.js (page) et todos.js (« À faire »), counts.js (hg:entretien-changed).
// Dépend de core.js (sb, toast, errMsg), core/profile.js et perms.js.
import { sb, toast, errMsg } from '../../commun/core.js';
import { getCachedProfile } from '../../commun/core/profile.js';
import { canSection } from './perms.js';

/** Quota de la base (plan gratuit Supabase), en octets. */
export const QUOTA_BASE = 500e6;
/** Quota du stockage (plan gratuit Supabase), en octets. */
export const QUOTA_STOCKAGE = 1e9;
/** Plafond d'import de outils/images/importer-lots.mjs (PLAFOND_TOTAL), comparé au seul stockage. */
export const PLAFOND_IMPORT = 700 * 1024 * 1024;
/** Seuil d'alerte, en pourcentage du quota. */
export const SEUIL = 80;

const H = { data: null, error: null };

/** Vrai pour l'administrateur : durées, purge et « Ignorer cette semaine ». */
export const estAdmin = () => !!getCachedProfile()?.is_admin;
/** Nombre avec espace fine insécable entre les milliers. */
export const nf = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Octets en Mo, une décimale : « 412,3 ». */
export const mo = (o) => (Number(o) / 1e6).toFixed(1).replace('.', ',');
/** Pourcentage arrondi de `o` sur `quota`. */
export const pct = (o, quota) => Math.round((100 * Number(o)) / quota);
/** Place occupée par tous les buckets, en octets. */
export const stockage = (d) => (d?.buckets || []).reduce((s, b) => s + Number(b.octets || 0), 0);

/** Charge les quotas (si la personne a le droit). Une erreur est gardée pour l'affichage. */
export async function loadQuotas() {
  if (!canSection('entretien')) return;
  try {
    const { data, error } = await sb.rpc('hg_entretien_quotas');
    if (error) throw error;
    H.data = data || null;
    H.error = null;
  } catch (e) { H.error = errMsg(e); }
}

/** Dernière réponse et erreur éventuelle. */
export const quotas = () => ({ data: H.data, error: H.error });

/** Les alertes sont-elles suspendues (« Ignorer cette semaine ») ? */
export const suspendues = () => !!H.data?.ignore_until && new Date(H.data.ignore_until) > new Date();

/**
 * Alertes du moment (sans tenir compte de la suspension), base d'abord.
 * @returns {Array<{key: string, title: string, text: string}>}
 */
export function alertesQuotas() {
  const d = H.data;
  if (!d) return [];
  const out = [];
  const base = Number(d.base_octets || 0), stock = stockage(d);
  if (pct(base, QUOTA_BASE) >= SEUIL) {
    out.push({ key: 'base', title: `La base de données est pleine à ${pct(base, QUOTA_BASE)} %.`,
      text: `${mo(base)} Mo sur 500 Mo, seuil ${SEUIL} %. La purge empêche la base de grossir, sans la faire rétrécir.` });
  }
  if (pct(stock, QUOTA_STOCKAGE) >= SEUIL) {
    out.push({ key: 'stockage', title: `Le stockage est plein à ${pct(stock, QUOTA_STOCKAGE)} %.`,
      text: `${mo(stock)} Mo sur 1 Go, seuil ${SEUIL} %.${stock > PLAFOND_IMPORT ? ' Le plafond d’import interne de 700 Mo est dépassé : les imports d’images s’arrêtent.' : ''}` });
  }
  return out;
}

/** Éléments « À faire » de La Mairie : une ligne par alerte non suspendue ; la première porte « Ignorer cette semaine » pour l'administrateur. */
export function quotasTodoItems() {
  if (!canSection('entretien') || !H.data || suspendues()) return [];
  return alertesQuotas().map((a, i) => ({
    title: a.title,
    meta: a.text,
    actions: [
      { label: 'Ouvrir Entretien', href: '#mairie/entretien' },
      ...(i === 0 && estAdmin() ? [{ label: 'Ignorer cette semaine', onClick: () => ignorerQuotas(7) }] : []),
    ],
  }));
}

/** Suspend les alertes pendant `jours` jours (0 : les reprend), recharge et prévient le panel (« À faire », page). */
export async function ignorerQuotas(jours) {
  try {
    const { error } = await sb.rpc('hg_entretien_ignorer', { p_days: jours });
    if (error) throw error;
    toast(jours ? 'Alertes de quotas suspendues pour 7 jours' : 'Alertes de quotas reprises', 'ok');
    await loadQuotas();
    document.dispatchEvent(new CustomEvent('hg:entretien-changed'));
  } catch (ex) { toast(errMsg(ex), 'error'); }
}
