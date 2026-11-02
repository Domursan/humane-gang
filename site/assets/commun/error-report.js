// ===== Humane Gang — journal des erreurs du navigateur (idée A9) =====
// Rôle : remonter discrètement les erreurs JavaScript des membres (et des visiteurs) vers hg_client_errors,
// sans aucune donnée personnelle : message nettoyé, fichier et ligne, page (chemin seul), famille de navigateur,
// version du site. Pas d'identifiant de membre, pas de pseudo, pas de contenu saisi.
// Page : toutes (importé à la demande par site-boot.js, à la première erreur seulement).
// Règles : une même signature une fois par visite, 5 remontées par visite au plus, erreurs d'extensions et
// « Script error. » ignorées, envoi différé (au repos) pour ne pas ralentir la page. La base nettoie une seconde fois
// et plafonne le total (500 par heure) : voir hg_client_error (migration 093).
// Dépendances : core/supabase.js (sb, chargé seulement au moment d'envoyer). Exporte : reportError.

// Remontées maximales par visite, et signatures déjà envoyées.
const MAX_PAR_VISITE = 5;
const vues = new Set();
let envoyees = 0;

/**
 * Nettoie un texte avant l'envoi : adresses e-mail, adresses web et longues suites de chiffres masquées, 300 caractères.
 * @param {string} s Texte brut.
 * @returns {string}
 */
export function nettoie(s) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail]')
    .replace(/https?:\/\/[^\s'")]+/g, '[adresse]')
    .replace(/\d[\d .-]{4,}\d/g, '[nombre]')
    .trim()
    .slice(0, 300);
}

/**
 * Fichier source réduit au chemin relatif aux assets (« js/cartes.js »), sans requête ni fragment.
 * @param {string} f Adresse du script.
 * @returns {string}
 */
export function fichier(f) {
  const s = String(f || '').split('#')[0].split('?')[0];
  const i = s.indexOf('/assets/');
  return (i >= 0 ? s.slice(i + 8) : s.slice(s.lastIndexOf('/') + 1)).slice(0, 200);
}

/** Famille de navigateur et système, sans numéro de build (« Safari iOS 17 », « Chrome Android », « Firefox »). */
export function navigateur(ua = navigator.userAgent) {
  const ios = /iPhone|iPad|iPod/.test(ua) ? (ua.match(/OS (\d+)_/)?.[1] || '') : null;
  if (ios !== null) return /CriOS/.test(ua) ? 'Chrome iOS' : /FxiOS/.test(ua) ? 'Firefox iOS' : `Safari iOS ${ios}`.trim();
  const android = /Android/.test(ua);
  if (/Edg\//.test(ua)) return 'Edge';
  if (/SamsungBrowser/.test(ua)) return 'Samsung Internet';
  if (/Firefox\//.test(ua)) return android ? 'Firefox Android' : 'Firefox';
  if (/Chrome\//.test(ua)) return android ? 'Chrome Android' : 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari macOS';
  return 'Autre';
}

/** Version du site : nom du cache du service worker (« hg-coque-v47 » → « v47 »), ou null. */
async function versionSite() {
  try {
    const keys = await caches.keys();
    const k = keys.map((x) => x.match(/^hg-coque-(v\d+)$/)?.[1]).filter(Boolean).sort((a, b) => Number(b.slice(1)) - Number(a.slice(1)))[0];
    return k || null;
  } catch { return null; }
}

/** Erreur à ignorer : extension du navigateur, script d'un autre site (« Script error. »), message vide,
 * avertissement « ResizeObserver loop » (sans effet : la mesure est reprise à l'image suivante). */
function ignoree(msg, file) {
  if (!msg || /^(uncaught )?script error\.?$/i.test(msg)) return true;
  if (/^ResizeObserver loop/i.test(msg)) return true;
  return /^(chrome|moz|safari|safari-web)-extension:|^webkit-masked-url:/i.test(String(file || ''));
}

/**
 * Remonte une erreur (une fois par signature et par visite, 5 au plus). Ne lève jamais.
 * @param {{message: string, file?: string, line?: number, col?: number}} e Erreur à remonter.
 */
export function reportError({ message, file = '', line = null, col = null }) {
  try {
    if (envoyees >= MAX_PAR_VISITE || ignoree(message, file)) return;
    const msg = nettoie(message);
    const f = fichier(file);
    const sig = `${msg}|${f}|${line ?? ''}`;
    if (vues.has(sig)) return;
    vues.add(sig);
    envoyees++;
    const envoi = async () => {
      try {
        const { sb } = await import('./core/supabase.js');
        await sb.rpc('hg_client_error', { p: {
          message: msg, file: f, line: Number.isFinite(line) ? line : null, col: Number.isFinite(col) ? col : null,
          page: location.pathname || '/', browser: navigateur(), version: await versionSite(),
        } });
      } catch { /* pas de réseau ou client indisponible : on abandonne sans bruit */ }
    };
    if ('requestIdleCallback' in window) requestIdleCallback(envoi, { timeout: 5000 }); else setTimeout(envoi, 1500);
  } catch { /* jamais d'erreur en cascade */ }
}
