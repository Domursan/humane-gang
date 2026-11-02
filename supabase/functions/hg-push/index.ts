// ===== Humane Gang — fonction edge « hg-push » : notifications Web Push des nouveaux messages =====
// Rôle : prévenir par notification du téléphone ou du navigateur les membres qui ont reçu un nouveau message.
// Appelée par le trigger hg_msg_push (migration 025) via pg_net, après chaque message inséré dans hg_messages.
// Envoie une notification « Nouveau message » aux AUTRES membres de la conversation, qui ont un abonnement
// enregistré dans hg_push_subscriptions. Le texte ne contient ni le contenu du message, ni l'expéditeur
// quand la conversation est un Secret Santa (le nom affiché est alors « Secret Santa »).
// Sécurité : en-tête « x-cron-secret » égal au secret de hg_private (« cron_secret »), comme hg-cron et
// hg-birthdays. Sans ce secret, la fonction refuse tout (401). verify_jwt doit être false.
// Clés VAPID : publique dans hg_settings (« push_vapid_public », valeur JSON chaîne), privée dans hg_private
// (« push_vapid_private »). Jamais dans le dépôt. Secret facultatif : VAPID_SUBJECT (sinon SITE_URL).
// Abonnements expirés (404 / 410 du service push) : supprimés de hg_push_subscriptions.
// Deuxième appel, type « ton_tour » (hg_tour__signaler, migration 200) : un membre absent dont le jeu a joué un tour reçoit un push,
// ou un MP Discord s'il n'a pas d'appareil. Voir ../_shared/ton-tour.ts. Même secret, DISCORD_BOT_TOKEN en plus pour le MP.
// Dépendances : ../_shared/cron-auth.ts (contrôle du secret) ; ../_shared/ton-tour.ts, ../_shared/discord.ts ; npm:web-push (envoi Web Push) ;
//   tables hg_settings, hg_private, hg_conversation_members, hg_conversations, hg_profiles, hg_push_subscriptions.
// Exporte : rien (point d'entrée Deno.serve).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { cronAuthorized } from '../_shared/cron-auth.ts';
import { sendDM } from '../_shared/discord.ts';
import { loadNotifPrefs, notifAllowed } from '../_shared/notif-prefs.ts';
import { envoyerTonTour, lireTonTour, pushPret } from '../_shared/ton-tour.ts';

// Client avec la clé service role : la fonction lit les abonnements de tous les destinataires.
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
/** Adresse du site sans « / » final ; sert d'adresse de contact VAPID si VAPID_SUBJECT est absent. */
const SITE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
/** Durée de vie d'une notification : 24 h. Au-delà, le service push l'abandonne. */
const TTL_SECONDS = 24 * 3600;
/** Identifiant de conversation ou d'expéditeur attendu : un UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Réponse JSON (sans en-têtes CORS : la fonction n'est appelée que par pg_net).
 * @param {unknown} body Contenu JSON.
 * @param {number} [status] Code HTTP (200 par défaut).
 * @returns {Response} La réponse à renvoyer.
 */
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Clés VAPID : lues une seule fois par exécution. Null si l'une manque (la fonction ne peut alors rien envoyer). */
/**
 * Lit les deux clés VAPID en parallèle (publique dans hg_settings, privée dans hg_private).
 * @returns {Promise<{publicKey: string, privateKey: string} | null>} Les clés, ou null si l'une manque ou si la lecture échoue.
 */
async function vapidKeys(): Promise<{ publicKey: string; privateKey: string } | null> {
  const [pub, priv] = await Promise.all([
    db.from('hg_settings').select('value').eq('key', 'push_vapid_public').maybeSingle(),
    db.from('hg_private').select('value').eq('key', 'push_vapid_private').maybeSingle(),
  ]);
  if (pub.error || priv.error) return null;
  const publicKey = typeof pub.data?.value === 'string' ? pub.data.value : '';
  const privateKey = priv.data?.value ? String(priv.data.value) : '';
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey };
}

/**
 * Envoie une charge à une liste d'abonnements, en parallèle. Un échec d'un appareil n'arrête pas les autres.
 * @param {Record<string, unknown>[]} subs Abonnements (id, endpoint, p256dh, auth).
 * @param {string} payload Contenu JSON de la notification.
 * @returns {Promise<{sent: number, failed: number, removed: number}>} Bilan des envois.
 */
// deno-lint-ignore no-explicit-any
async function envoyer(subs: Record<string, any>[], payload: string) {
  let sent = 0, failed = 0, removed = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
        { TTL: TTL_SECONDS },
      );
      sent++;
    } catch (err) {
      const status = Number((err as { statusCode?: number })?.statusCode ?? 0);
      if (status === 404 || status === 410) {
        // Abonnement expiré ou révoqué par le navigateur : on le retire.
        const { error } = await db.from('hg_push_subscriptions').delete().eq('id', s.id);
        if (!error) removed++;
      } else {
        failed++;
        console.warn('[hg-push] envoi', status || 'erreur', String((err as Error)?.message ?? err).slice(0, 200));
      }
    }
  }));
  return { sent, failed, removed };
}

/**
 * Signe les envois avec les clés VAPID.
 * @param {{publicKey: string, privateKey: string}} keys Clés VAPID.
 * @returns {boolean} false si l'adresse de contact manque.
 */
function preparerVapid(keys: { publicKey: string; privateKey: string }): boolean {
  const subject = Deno.env.get('VAPID_SUBJECT') || SITE;
  if (!subject) return false;
  webpush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  return true;
}

/**
 * Point d'entrée : vérifie le secret, trouve les destinataires, envoie la notification à leurs appareils.
 * Renvoie un compte-rendu { sent, failed, removed } ou une raison d'arrêt (vapid_absent, aucun_destinataire...).
 * @param {Request} req Requête POST de pg_net avec l'en-tête x-cron-secret et le corps { conversation_id, message_id, sender_id }.
 * @returns {Promise<Response>} Compte-rendu JSON.
 */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  if (!(await cronAuthorized(req, db))) return json({ error: 'Non autorisé' }, 401);

  let body: { type?: string; conversation_id?: string; message_id?: number | string; sender_id?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  // « C'est ton tour » : sans clés VAPID, le push ne part pas et le MP prend le relais.
  if (body.type === 'ton_tour') {
    const tour = lireTonTour(body as Record<string, unknown>);
    if (!tour) return json({ error: 'Paramètres invalides' }, 400);
    const signe = await pushPret(vapidKeys, preparerVapid);
    try {
      return json(await envoyerTonTour(tour, {
        db,
        push: (subs, payload) => signe ? envoyer(subs, payload) : Promise.resolve({ sent: 0, failed: 0, removed: 0 }),
        dm: (id, message) => sendDM(id, message),
        site: SITE,
      }));
    } catch (e) {
      console.warn('[hg-push] ton_tour', String((e as Error)?.message ?? e).slice(0, 200));
      return json({ error: 'Envoi impossible' }, 502);
    }
  }

  const conv = String(body.conversation_id ?? '');
  const sender = body.sender_id ? String(body.sender_id) : null;
  if (!UUID.test(conv) || (sender && !UUID.test(sender))) return json({ error: 'Paramètres invalides' }, 400);

  // Sans clés VAPID, rien ne peut être signé : on sort sans erreur (l'envoi est simplement désactivé).
  const keys = await vapidKeys();
  if (!keys) return json({ sent: 0, reason: 'vapid_absent' });

  // Destinataires : les autres membres de la conversation.
  // Sourdine (migration 090) : un membre dont muted_until est dans le futur ne reçoit pas de notification.
  let membersQuery = db.from('hg_conversation_members').select('user_id').eq('conversation_id', conv)
    .or(`muted_until.is.null,muted_until.lt.${new Date().toISOString()}`);
  if (sender) membersQuery = membersQuery.neq('user_id', sender);
  const { data: members, error: membersErr } = await membersQuery;
  if (membersErr) return json({ error: 'Lecture des membres impossible' }, 500);
  const everyone = (members ?? []).map((m) => String(m.user_id));
  if (!everyone.length) return json({ sent: 0, reason: 'aucun_destinataire' });
  // Catégorie « Messages privés » sur le téléphone, heures calmes comprises (idée Q6, migration 095)
  const prefs = await loadNotifPrefs(db, everyone);
  const recipients = everyone.filter((id) => notifAllowed(prefs.get(id), 'messages', 'push'));
  if (!recipients.length) return json({ sent: 0, reason: 'categorie_coupee' });

  // Nom affiché : « Secret Santa » pour un Secret Santa, sinon le pseudo de l'expéditeur (conversation directe).
  const { data: conversation } = await db.from('hg_conversations').select('kind, title').eq('id', conv).maybeSingle();
  let name = 'Conversation';
  if (conversation?.kind === 'santa') {
    name = 'Secret Santa';
  } else if (conversation?.kind === 'group') { // groupe (migration 090) : « Pseudo · Nom du groupe »
    const { data: profile } = sender ? await db.from('hg_profiles').select('pseudo').eq('id', sender).maybeSingle() : { data: null };
    name = [profile?.pseudo, conversation.title || 'Groupe'].filter(Boolean).map(String).join(' · ').slice(0, 120);
  } else if (sender) {
    const { data: profile } = await db.from('hg_profiles').select('pseudo').eq('id', sender).maybeSingle();
    if (profile?.pseudo) name = String(profile.pseudo);
  }

  // Abonnements de tous les destinataires (un membre peut avoir plusieurs appareils).
  const { data: subs, error: subsErr } = await db
    .from('hg_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipients);
  if (subsErr) return json({ error: 'Lecture des abonnements impossible' }, 500);
  if (!subs?.length) return json({ sent: 0, reason: 'aucun_abonnement' });

  // Contact VAPID : obligatoire pour signer les envois.
  if (!preparerVapid(keys)) return json({ error: 'VAPID_SUBJECT ou SITE_URL requis' }, 500);

  // Contenu de la notification : seulement le titre, le nom affiché et l'identifiant de conversation.
  // Le tag regroupe les notifications d'une même conversation dans l'appareil.
  const payload = JSON.stringify({
    title: 'Nouveau message',
    body: name,
    conversation_id: conv,
    tag: `hg-conv-${conv}`,
  });

  return json(await envoyer(subs, payload));
});
