// ===== Humane Gang — notifications par catégorie (idée Q6, migration 095) =====
// Rôle : dire si un membre accepte une notification d'une catégorie sur un canal (push ou MP Discord).
// Table hg_notif_prefs : prefs = { "<catégorie>.<canal>": booléen }, clé absente = autorisé ; heures calmes
// (quiet_start, quiet_end, heure de Zurich) pour le push, et pour le MP de la catégorie « tours » (idée 2, migration 200). Sans ligne : tout est autorisé (comportement d'avant).
// « Annonces du Staff » (admin_dm) n'a pas de catégorie : seul hg_profiles.bot_optin la coupe.
// Dépendances : aucune pour les fonctions pures ; loadNotifPrefs lit la table avec le client de l'appelant (clé service).
// Exporte : NOTIF_CATS, TYPE_CAT, NotifCat, NotifCanal, NotifRow, zurichHour, inQuietHours, notifAllowed, loadNotifPrefs.

/** Catégories connues (même liste blanche que hg_set_notif_prefs). */
export const NOTIF_CATS = ['messages', 'sorties', 'echanges', 'souhaits', 'santa', 'anniversaires', 'quiz', 'jeux', 'tours'] as const;
export type NotifCat = typeof NOTIF_CATS[number];
export type NotifCanal = 'push' | 'discord';
/** Ligne de hg_notif_prefs (les champs absents valent « rien de coupé »). */
export type NotifRow = { user_id: string; prefs?: Record<string, unknown> | null; quiet_start?: number | null; quiet_end?: number | null };

/** Correspondance type d'envoi → catégorie (hg-notify, hg-cron, hg-birthdays, hg-push). */
export const TYPE_CAT: Record<string, NotifCat> = {
  message_new: 'messages',
  push_message: 'messages',
  trade_offer: 'echanges',
  card_wish: 'souhaits',
  card_gift_admin: 'souhaits',
  ss_draw: 'santa',
  ss_gift_sent: 'santa',
  ss_gift_received: 'santa',
  ss_reminder: 'santa',
  irl_new: 'sorties',
  irl_reminder: 'sorties',
  birthday: 'anniversaires',
  duel_defi: 'jeux',
  ton_tour: 'tours',
};

/**
 * Heure (0 à 23) à Zurich pour une date donnée.
 * @param {Date} [now=new Date()]
 * @returns {number}
 */
export function zurichHour(now: Date = new Date()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number(h) % 24;
}

/**
 * Vrai si l'heure tombe dans les heures calmes [start, end[ (le créneau peut passer minuit : 23 → 8).
 * @param {number|null|undefined} start heure de début (0 à 23), null = pas d'heures calmes
 * @param {number|null|undefined} end heure de fin (0 à 23)
 * @param {number} hour heure à tester
 * @returns {boolean}
 */
export function inQuietHours(start: number | null | undefined, end: number | null | undefined, hour: number): boolean {
  if (start == null || end == null || start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

/**
 * Vrai si le membre accepte la catégorie sur ce canal (clé absente = oui). Le push respecte en plus les heures calmes, et le MP aussi pour « tours ».
 * @param {NotifRow|undefined|null} row ligne du membre (absente = tout autorisé)
 * @param {NotifCat} cat catégorie
 * @param {NotifCanal} canal canal
 * @param {Date} [now=new Date()] instant de l'envoi
 * @returns {boolean}
 */
export function notifAllowed(row: NotifRow | undefined | null, cat: NotifCat, canal: NotifCanal, now: Date = new Date()): boolean {
  if (!row) return true;
  if (row.prefs?.[`${cat}.${canal}`] === false) return false;
  if ((canal === 'push' || cat === 'tours') && inQuietHours(row.quiet_start, row.quiet_end, zurichHour(now))) return false;
  return true;
}

/** Client minimal attendu (supabase-js) : from(table).select(cols).in(col, values). */
type Db = { from: (t: string) => any };

/**
 * Charge en une requête les préférences d'une liste de membres. Une erreur (table absente avant la migration 095)
 * donne une carte vide : tout reste autorisé, comme avant.
 * @param {Db} db client avec la clé service
 * @param {string[]} ids membres
 * @returns {Promise<Map<string, NotifRow>>}
 */
export async function loadNotifPrefs(db: Db, ids: string[]): Promise<Map<string, NotifRow>> {
  const out = new Map<string, NotifRow>();
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return out;
  try {
    const { data, error } = await db.from('hg_notif_prefs').select('user_id, prefs, quiet_start, quiet_end').in('user_id', uniq);
    if (error) { console.warn('[notif-prefs] lecture', String(error.message ?? error).slice(0, 200)); return out; }
    for (const r of (data ?? []) as NotifRow[]) out.set(String(r.user_id), r);
  } catch (e) {
    console.warn('[notif-prefs] lecture', String((e as Error)?.message ?? e).slice(0, 200));
  }
  return out;
}
