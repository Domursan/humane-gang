// Contrôle sans navigateur de supabase/functions/_shared/notif-prefs.ts (idée Q6) : correspondance des types,
// clé absente = autorisé, heures calmes (créneau qui passe minuit), lecture tolérante.
// Lancer : node --experimental-strip-types tests/unitaires/check-notif-prefs.mjs
import { NOTIF_CATS, TYPE_CAT, inQuietHours, notifAllowed, zurichHour, loadNotifPrefs } from '../../supabase/functions/_shared/notif-prefs.ts';

let ko = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) ko++; };

for (const [type, cat] of Object.entries(TYPE_CAT)) check(NOTIF_CATS.includes(cat), `type ${type} → catégorie connue ${cat}`);
check(TYPE_CAT.trade_offer === 'echanges' && TYPE_CAT.card_wish === 'souhaits' && TYPE_CAT.card_gift_admin === 'souhaits', 'cartes : échanges et souhaits');
check(TYPE_CAT.ss_gift_sent === 'santa' && TYPE_CAT.irl_new === 'sorties' && TYPE_CAT.message_new === 'messages', 'santa, sorties, messages');
check(!('admin_dm' in TYPE_CAT), 'annonces du Staff : pas de catégorie (toujours actives)');

check(notifAllowed(undefined, 'echanges', 'push'), 'sans ligne : autorisé');
check(notifAllowed({ user_id: 'u', prefs: {} }, 'echanges', 'discord'), 'clé absente : autorisé');
check(!notifAllowed({ user_id: 'u', prefs: { 'echanges.push': false } }, 'echanges', 'push'), 'clé à false : coupé');
check(notifAllowed({ user_id: 'u', prefs: { 'echanges.push': false } }, 'echanges', 'discord'), 'autre canal non touché');

check(inQuietHours(23, 8, 23) && inQuietHours(23, 8, 2) && !inQuietHours(23, 8, 8) && !inQuietHours(23, 8, 12), 'heures calmes 23 h – 8 h');
check(inQuietHours(13, 15, 14) && !inQuietHours(13, 15, 15), 'heures calmes dans la journée');
check(!inQuietHours(null, null, 3), 'sans heures calmes');
// 2026-01-15T22:30Z = 23 h 30 à Zurich (hiver, UTC+1) ; 2026-07-15T21:30Z = 23 h 30 (été, UTC+2)
check(zurichHour(new Date('2026-01-15T22:30:00Z')) === 23 && zurichHour(new Date('2026-07-15T21:30:00Z')) === 23, 'heure de Zurich, été comme hiver');
const quiet = { user_id: 'u', prefs: {}, quiet_start: 23, quiet_end: 8 };
check(!notifAllowed(quiet, 'messages', 'push', new Date('2026-01-15T22:30:00Z')), 'push coupé pendant les heures calmes');
check(notifAllowed(quiet, 'messages', 'discord', new Date('2026-01-15T22:30:00Z')), 'MP Discord non touchés par les heures calmes');
check(notifAllowed(quiet, 'messages', 'push', new Date('2026-01-15T12:00:00Z')), 'push autorisé hors heures calmes');
check(TYPE_CAT.ton_tour === 'tours', 'ton_tour : catégorie tours');
check(!notifAllowed(quiet, 'tours', 'discord', new Date('2026-01-15T22:30:00Z')), 'MP de « tours » coupé pendant les heures calmes');
check(notifAllowed(quiet, 'tours', 'discord', new Date('2026-01-15T12:00:00Z')), 'MP de « tours » autorisé hors heures calmes');

const fakeDb = (rows, error = null) => ({ from: () => ({ select: () => ({ in: async () => ({ data: rows, error }) }) }) });
const m = await loadNotifPrefs(fakeDb([{ user_id: 'a', prefs: { 'santa.discord': false } }]), ['a', 'b', 'a']);
check(m.size === 1 && !notifAllowed(m.get('a'), 'santa', 'discord') && notifAllowed(m.get('b'), 'santa', 'discord'), 'chargement groupé');
const e = await loadNotifPrefs(fakeDb(null, { message: 'relation "hg_notif_prefs" does not exist' }), ['a']);
check(e.size === 0, 'table absente : tout reste autorisé');

console.log(ko ? `${ko} échec(s)` : 'Tout est bon');
process.exit(ko ? 1 : 0);
