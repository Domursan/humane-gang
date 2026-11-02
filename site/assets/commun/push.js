// ===== Humane Gang — notifications push sur cet appareil (F9) =====
// Bloc « Notifications sur cet appareil » de la page Mon compte. Abonnement Web Push du navigateur (clé VAPID
// publique lue dans hg_settings), enregistré dans hg_push_subscriptions. Masqué si le navigateur ne gère pas le push.
/*
 * Rôle : permet au membre d'activer ou de désactiver les notifications push sur CET appareil, depuis la page Mon compte.
 * Page : /pages/compte/compte.html (bloc « Notifications sur cet appareil »).
 * Dépendances : core.js (client Supabase, toast, errMsg), sw.js (service worker qui reçoit les notifications).
 * Tables / RPC : hg_settings (clé 'push_vapid_public'), hg_push_subscriptions (une ligne par appareil).
 * Changer de compte (comptes-etat.js) : un navigateur n'a qu'un abonnement ; il reste au compte qui l'a activé, noté sur l'appareil
 * quand deux comptes y sont rangés. Sur l'autre compte, le bloc le dit et propose de reprendre les notifications pour lui.
 * Exporte : mountPushBlock.
 */
import { sb, toast, errMsg } from './core.js';
import { lireComptes, ecrireComptes } from './core/comptes-etat.js';

/* ---------- Constantes ---------- */

/** Délai maximal (ms) pour attendre le service worker avant d'abandonner le bloc. */
const READY_TIMEOUT_MS = 4000;

/* ---------- Prise en charge et clés ---------- */

/**
 * Le navigateur sait-il gérer les notifications push ? (contexte sécurisé, service worker, PushManager, Notification).
 * @returns {boolean}
 */
const supported = () => window.isSecureContext && 'serviceWorker' in navigator
  && 'PushManager' in window && 'Notification' in window;

/**
 * Clé publique VAPID (hg_settings, valeur JSON chaîne). Null si absente ou illisible.
 * @returns {Promise<string|null>}
 */
async function loadPublicKey() {
  try {
    const { data, error } = await sb.from('hg_settings').select('value').eq('key', 'push_vapid_public').maybeSingle();
    if (error || typeof data?.value !== 'string' || !data.value) return null;
    return data.value;
  } catch { return null; }
}

/** Base64url → Uint8Array (format attendu par pushManager.subscribe). */
function keyBytes(b64url) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Service worker prêt, ou null si l'enregistrement ne répond pas dans le délai. */
async function readyRegistration() {
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS)),
    ]);
  } catch { return null; }
}

/**
 * Affiche le bloc dans `container` (élément déjà présent dans la page) pour le membre `me`.
 * Sans prise en charge du navigateur, le conteneur reste masqué.
 */
export async function mountPushBlock(container, me) {
  if (!container) return;
  if (!supported()) { container.hidden = true; return; }
  container.hidden = false;
  container.innerHTML = `
    <div class="card stack" id="push-card">
      <h2 class="card-title">Notifications sur cet appareil</h2>
      <p class="small muted">Reçois une alerte quand un message arrive, même lorsque le site est fermé. Le réglage concerne ce navigateur et cet appareil uniquement.</p>
      <p class="small muted" id="push-state" role="status">Vérification…</p>
      <div class="btn-row"><button class="btn btn-ghost" type="button" id="push-toggle" disabled>Chargement…</button></div>
    </div>`;

  const btn = container.querySelector('#push-toggle');
  const stateEl = container.querySelector('#push-state');
  const vapid = await loadPublicKey();
  const reg = await readyRegistration();

  /**
   * Met à jour le message d'état et le bouton.
   * @param {string} text Message affiché.
   * @param {{disabled?: boolean, label?: string|null}} [o] disabled : bouton désactivé ; label : nouveau libellé (null = inchangé).
   */
  function setState(text, { disabled = false, label = null } = {}) {
    stateEl.textContent = text;
    btn.disabled = disabled;
    if (label !== null) btn.textContent = label;
  }

  /**
   * Relit l'état réel de l'abonnement sur cet appareil et adapte le message et le bouton.
   * Les cas « indisponible » et « bloqué par le navigateur » désactivent le bouton.
   */
  async function refresh() {
    if (!vapid || !reg) {
      setState('Notifications indisponibles pour le moment.', { disabled: true, label: 'Activer' });
      return;
    }
    if (Notification.permission === 'denied') {
      setState('Les notifications sont bloquées pour ce site. Réactive-les dans les réglages du navigateur.', { disabled: true, label: 'Activer' });
      return;
    }
    const sub = await reg.pushManager.getSubscription();
    const autre = sub ? autreProprio() : null;
    if (autre) setState(`Activées sur cet appareil pour ${autre.pseudo}, ton autre compte.`, { label: 'Les recevoir sur ce compte' });
    else if (sub) setState('Activées sur cet appareil.', { label: 'Désactiver' });
    else setState('Désactivées sur cet appareil.', { label: 'Activer' });
  }

  /** Compte en attente sur l'appareil qui a activé les notifications (null : celui de la page, ou inconnu). */
  function autreProprio() {
    const st = lireComptes();
    return st?.push && st.push !== me.id ? st.autres.find((a) => a.id === st.push) || null : null;
  }
  /** Note sur l'appareil le compte qui reçoit les notifications (seulement si deux comptes y sont rangés). */
  function noterProprio(id) {
    const st = lireComptes();
    if (st) ecrireComptes({ ...st, push: id });
  }

  /**
   * Demande l'autorisation, crée l'abonnement du navigateur, puis l'enregistre en base.
   * Si l'enregistrement échoue, l'abonnement est annulé pour ne pas rester orphelin.
   * @throws {Error} Erreur de la base si l'enregistrement échoue.
   */
  async function enable() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications non autorisées.', 'error'); return; }
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) });
    const json = sub.toJSON();
    const { error } = await sb.from('hg_push_subscriptions').upsert(
      { user_id: me.id, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' },
    );
    if (error) { await sub.unsubscribe().catch(() => {}); throw error; }
    noterProprio(me.id);
    toast('Notifications activées sur cet appareil.', 'ok');
  }

  /**
   * Supprime la ligne de cet appareil en base, puis annule l'abonnement du navigateur.
   * La base passe en premier : si elle échoue, l'abonnement reste actif et le message d'erreur est affiché.
   * @throws {Error} Erreur de la base si la suppression échoue.
   */
  async function disable() {
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const { error } = await sb.from('hg_push_subscriptions').delete().eq('endpoint', sub.endpoint);
    if (error) throw error;
    await sub.unsubscribe().catch(() => {});
    noterProprio(null);
    toast('Notifications désactivées sur cet appareil.', 'ok');
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const sub = await reg.pushManager.getSubscription();
      // Abonnement de l'autre compte : il est retiré du navigateur (sa ligne en base ne sert plus), puis repris pour ce compte
      if (sub && autreProprio()) { await sub.unsubscribe().catch(() => {}); await enable(); }
      else if (sub) await disable(); else await enable();
    } catch (e) {
      toast(`Notifications : ${errMsg(e)}`, 'error');
    } finally {
      await refresh();
    }
  });

  await refresh();
}
