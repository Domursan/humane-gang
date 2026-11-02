// ===== Humane Gang — envoi « c'est ton tour » (idée 2 du lot 3, migration 200) =====
// Rôle : recevoir l'appel de hg_tour__signaler et prévenir un membre absent : push s'il a un appareil, sinon MP Discord.
// La notification du site, les plafonds et la présence sont réglés en base avant l'appel : rien de tout cela ici.
// Préférences relues à l'envoi (catégorie « tours », heures calmes comprises sur les deux canaux). Un push qui n'arrive sur aucun
// appareil retombe sur le MP. Pas de copie aux admins : chaque MP serait doublé.
// Dépendances : ./notif-prefs.ts, ./templates.ts (mdSafe) ; le push et le MP sont fournis par l'appelant (hg-push).
// Exporte : TonTour, lireTonTour, texteMP, pushPret, envoyerTonTour.
import { loadNotifPrefs, notifAllowed } from './notif-prefs.ts';
import { mdSafe } from './templates.ts';

/** Corps de l'appel de hg_tour__signaler. */
export type TonTour = { type: 'ton_tour'; user_id: string; titre: string; suite: string; lien: string; tag: string };
/** Ce que fait l'appelant : db (clé service), envoi aux appareils d'un membre, MP Discord, adresse du site. */
type Moyens = {
  // deno-lint-ignore no-explicit-any
  db: { from: (t: string) => any };
  push: (subs: Record<string, unknown>[], payload: string) => Promise<{ sent: number; failed: number; removed: number }>;
  dm: (discordId: string, message: Record<string, unknown>) => Promise<unknown>;
  site: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Lien d'une partie : un chemin du site, jamais une adresse externe. */
const LIEN = /^\/pages\/jeux\/[a-z0-9-]+\.html(\?code=[A-Z0-9-]+|#partie\/[A-Z0-9-]+)$/;

/**
 * Valide le corps de l'appel.
 * @param {Record<string, unknown>} b corps JSON
 * @returns {TonTour | null} null si un champ manque ou n'a pas la forme attendue
 */
export function lireTonTour(b: Record<string, unknown>): TonTour | null {
  const [user_id, titre, suite, lien, tag] = ['user_id', 'titre', 'suite', 'lien', 'tag'].map((k) => String(b?.[k] ?? ''));
  if (b?.type !== 'ton_tour' || !UUID.test(user_id) || !titre || !LIEN.test(lien) || !/^hg-tour-[0-9a-f-]{36}$/i.test(tag)) return null;
  return { type: 'ton_tour', user_id, titre: titre.slice(0, 200), suite: suite.slice(0, 200), lien, tag };
}

/**
 * Texte du MP : titre, suite et lien. Le titre contient un pseudo ou un nom de partie, donc son Markdown est neutralisé.
 * @param {TonTour} t appel validé
 * @param {string} site adresse du site, sans « / » final
 * @returns {string}
 */
export const texteMP = (t: TonTour, site: string) => `${mdSafe(t.titre)}. ${t.suite}${site ? `\n${site}${t.lien}` : ''}`.slice(0, 2000);

/**
 * Prépare la signature du push. Clés absentes ou mal formées : faux, et le MP prend le relais.
 * @param {() => Promise<T | null>} lire lit les clés
 * @param {(cles: T) => boolean} preparer les installe, lève si elles sont mal formées
 * @returns {Promise<boolean>}
 */
export async function pushPret<T>(lire: () => Promise<T | null>, preparer: (cles: T) => boolean) {
  try {
    const cles = await lire();
    return !!cles && preparer(cles);
  } catch (e) {
    console.warn('[ton-tour] clés VAPID', String((e as Error)?.message ?? e).slice(0, 200));
    return false;
  }
}

/**
 * Prévient le membre. Les erreurs de Discord sont levées : l'appelant les note.
 * @param {TonTour} t appel validé
 * @param {Moyens} m moyens d'envoi
 * @returns {Promise<{ canal: 'push' | 'discord' | null, sent?: number, failed?: number, removed?: number }>}
 */
export async function envoyerTonTour(t: TonTour, m: Moyens) {
  const prefs = (await loadNotifPrefs(m.db, [t.user_id])).get(t.user_id);
  let bilan = { sent: 0, failed: 0, removed: 0 };
  if (notifAllowed(prefs, 'tours', 'push')) {
    const { data: subs } = await m.db.from('hg_push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', t.user_id);
    if (subs?.length) {
      bilan = await m.push(subs, JSON.stringify({ title: 'Humane Gang', body: t.titre, lien: t.lien, tag: t.tag }));
      if (bilan.sent > 0) return { canal: 'push' as const, ...bilan };
    }
  }
  if (!notifAllowed(prefs, 'tours', 'discord')) return { canal: null, ...bilan };
  const { data: p } = await m.db.from('hg_profiles').select('discord_id, bot_optin').eq('id', t.user_id).maybeSingle();
  if (!p?.bot_optin || !/^\d{17,20}$/.test(String(p.discord_id ?? ''))) return { canal: null, ...bilan };
  await m.dm(String(p.discord_id), { content: texteMP(t, m.site), allowed_mentions: { parse: [] } });
  return { canal: 'discord' as const, ...bilan };
}
