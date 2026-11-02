/* Module chargé par toutes les pages, avant le module de la page.
   - Repli des images en erreur : balise <img data-on-error="remove|hide|text|initials">
     (remplace les gestionnaires onerror="" inline, interdits par la CSP).
   - Boutons « Réessayer » : <button data-action="reload"> (remplace onclick="" inline). */
/*
 * Rôle : petits comportements communs à toutes les pages, sans rapport avec une fonctionnalité précise :
 * repli des images cassées, bouton « Réessayer », feuilles de style « print » basculées sur « all »,
 * et enregistrement du service worker (mode hors ligne). Signale aussi l'ouverture depuis l'app installée
 * aux quêtes de la semaine (quest-track.js, importé dynamiquement). Lance enfin les secrets cachés
 * (eggs/core.js) une fois la page chargée, sans la ralentir.
 * Page : toutes les pages (chargé avant le module de chaque page).
 * Dépendances : aucune au démarrage (quest-track.js seulement si l'app est installée ; eggs/core.js après le chargement). Le fichier sw.js (racine du site) est enregistré ici.
 * Note aussi la visite du jour (hg_touch, idée A4 : une écriture par jour au plus, seulement connecté).
 * Pré-chargement au survol (prefetch) : une seule écoute ici, pour toutes les pages.
 * Exporte : rien (effets de bord seulement).
 */

/* ---------- Images en erreur ---------- */

/**
 * Repli des images dont le chargement échoue : selon data-on-error, l'image est retirée, cachée,
 * remplacée par un texte ou par des initiales. Écouteur en phase de capture, car l'événement « error » ne remonte pas.
 */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.onError) return;
  const mode = img.dataset.onError;
  if (mode === 'remove') img.remove();
  else if (mode === 'hide') img.style.visibility = 'hidden';
  else if (mode === 'text') img.replaceWith(document.createTextNode(img.dataset.fallback || ''));
  else if (mode === 'initials') {
    const s = document.createElement('span');
    s.className = img.dataset.fallbackClass || '';
    s.textContent = img.dataset.fallback || '';
    img.replaceWith(s);
  }
}, true);

/* ---------- Journal des erreurs du navigateur (A9) ---------- */
// Écouteurs posés tout de suite ; le module d'envoi (error-report.js) n'est chargé qu'à la première erreur.
/** Transmet une erreur au module d'envoi (import à la demande, sans jamais lever). */
const remonte = (e) => { import('./error-report.js').then((m) => m.reportError(e)).catch(() => {}); };
addEventListener('error', (e) => {
  if (!(e instanceof ErrorEvent)) return; // erreurs de chargement (images, scripts) : pas des erreurs JavaScript
  remonte({ message: e.message || String(e.error || ''), file: e.filename, line: e.lineno, col: e.colno });
});
addEventListener('unhandledrejection', (e) => {
  const r = e.reason;
  // Transition entre pages abandonnée par le navigateur (clic rapide, page pas encore prête) : la page s'affiche
  // simplement sans animation. Rien à corriger, on ne la remonte pas.
  if (/^Transition was (aborted|skipped)/i.test(String(r?.message || ''))) { e.preventDefault(); return; }
  const stack = String(r?.stack || '');
  const at = stack.match(/(https?:\/\/[^\s)]+?):(\d+):(\d+)/);
  remonte({ message: `Unhandled rejection: ${r?.message || r || ''}`, file: at?.[1] || '', line: at ? Number(at[2]) : null, col: at ? Number(at[3]) : null });
});

/* ---------- Bouton « Réessayer » ---------- */

// Délégation : un clic sur n'importe quel [data-action="reload"] recharge la page
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="reload"]')) location.reload();
});

/* ---------- Feuilles de style ---------- */

/* Feuilles chargées en « print » puis basculées sur « all » (remplace onload="" inline). */
document.querySelectorAll('link[data-media-all]').forEach((l) => {
  /** Passe la feuille en « all » : elle s'applique à l'écran. */
  const on = () => { l.media = 'all'; };
  if (l.sheet) on(); else l.addEventListener('load', on, { once: true });
});

/* ---------- App installée (quête « app installée ») ---------- */

/** Vrai si le site tourne comme app installée (fenêtre autonome), et non dans un onglet du navigateur. */
const estAppInstallee = () => {
  try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; }
};
/** Signale l'action « app installée » aux quêtes. Import dynamique : rien ne se charge dans un onglet ordinaire. */
const signaleApp = () => { import('./quest-track.js').then((m) => m.questTrack('app_installee', 'app')).catch(() => {}); };
if (estAppInstallee()) signaleApp();
addEventListener('appinstalled', signaleApp);

/* ---------- Mode hors ligne (service worker) ---------- */

/* Mode hors ligne : enregistrement du service worker (sw.js, à la racine du site). */
if (window.isSecureContext && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // Nouvelle version du site installée pendant la visite : on recharge une fois pour ne pas mélanger
  // l'ancienne page et les nouveaux fichiers.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

/* ---------- Secrets : les sept lettres cachées (eggs/lettres.js, import dynamique) ---------- */
import('../espaces/arcade/lettres.js').catch(() => {});
/* Secrets F : le drôle de bloc (eggs/creeper.js) et la cueillette de champignons (eggs/champignon.js), membres seulement */
import('../espaces/arcade/creeper.js').catch(() => {});
import('../espaces/arcade/champignon.js').catch(() => {});
/* ---------- Secrets cachés (easter eggs) : chargés après la page, sans la ralentir ---------- */

/** Charge et lance le module des secrets (eggs/core.js). Import dynamique : rien ne se charge avant la fin du démarrage. */
const lanceSecrets = () => { import('../espaces/arcade/core.js').then((m) => m.initEggs()).catch(() => {}); };
/** Planifie le lancement quand le navigateur est au repos (ou après un court délai si l'API manque). */
const auRepos = () => ('requestIdleCallback' in window ? requestIdleCallback(lanceSecrets, { timeout: 2000 }) : setTimeout(lanceSecrets, 800));
if (document.readyState === 'complete') auRepos(); else addEventListener('load', auRepos, { once: true });

/* ---------- Visite du jour (idée A4 « Membres à relancer ») ---------- */
// Une fois par jour et par navigateur (repère local), seulement avec une session : hg_touch note le jour de visite
// (date seule, lue par l'admin et le Staff « Membres » à la semaine près). Import dynamique, après le chargement.
const noteVisite = async () => {
  const jour = new Date().toISOString().slice(0, 10);
  try { if (localStorage.getItem('hg_seen_day') === jour) return; } catch { /* stockage bloqué : on note quand même */ }
  try {
    const { sb } = await import('./core/supabase.js');
    const { data } = await sb.auth.getSession();
    if (!data?.session) return;
    const { error } = await sb.rpc('hg_touch');
    if (!error) { try { localStorage.setItem('hg_seen_day', jour); } catch { /* sans repère : un appel par page, sans effet */ } }
  } catch { /* hors ligne ou fonction absente : sans importance */ }
};
if (document.readyState === 'complete') setTimeout(noteVisite, 1500); else addEventListener('load', () => setTimeout(noteVisite, 1500), { once: true });

/* ---------- Pré-chargement au survol (prefetch) ----------
   Au survol d'un lien interne (environ 200 ms) ou au début d'un toucher, la page est demandée à l'avance
   (<link rel="prefetch">) : seul le HTML est chargé, aucun script n'est exécuté. Pas de Speculation Rules (prerender) :
   la politique CSP du site refuse le JSON en ligne, et le fichier externe n'est pas pris en charge par Chromium ici.
   Exclus : l'administration, les liens qui ouvrent un autre onglet ou téléchargent, ceux qui déclenchent une action
   (?action=, #ancre, déconnexion), et le mode économie de données. */
const PRECHARGES = new Set();

/**
 * Adresse à précharger pour un lien, ou '' si le lien est exclu (autre site, administration, action, ancre…).
 * @param {Element|null} a Lien trouvé sous le pointeur.
 * @returns {string}
 */
function adressePrechargeable(a) {
  if (!a?.href || a.target || a.hasAttribute('download') || /\bnofollow\b/.test(a.rel || '') || a.classList.contains('nav-logout')) return '';
  let u;
  try { u = new URL(a.href, location.href); } catch { return ''; }
  const page = u.pathname === '/index.html' || (u.pathname.startsWith('/pages/') && !u.pathname.startsWith('/pages/admin/'));
  const sansAction = !u.search.includes('action=') && !u.hash && !/deconnexion|logout/i.test(u.pathname + u.search);
  return u.origin === location.origin && page && sansAction ? u.href : '';
}

/**
 * Demande une page à l'avance, une seule fois.
 * @param {string} adresse Adresse à précharger ('' ne fait rien).
 */
function precharge(adresse) {
  if (!adresse || PRECHARGES.has(adresse)) return;
  PRECHARGES.add(adresse);
  const l = document.createElement('link');
  l.rel = 'prefetch';
  l.href = adresse;
  document.head.append(l);
}

let economieDonnees = false;
try { economieDonnees = !!navigator.connection?.saveData; } catch { /* inconnu : on précharge */ }
if (!economieDonnees) {
  let minuterie = 0;
  // Souris : le lien doit rester sous le pointeur 200 ms.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const adresse = adressePrechargeable(e.target.closest?.('a[href]'));
    if (!adresse) return;
    clearTimeout(minuterie);
    minuterie = setTimeout(() => precharge(adresse), 200);
  }, { passive: true });
  document.addEventListener('pointerout', () => clearTimeout(minuterie), { passive: true });
  // Tactile : dès le début du toucher.
  document.addEventListener('touchstart', (e) => {
    precharge(adressePrechargeable(e.target.closest?.('a[href]')));
  }, { passive: true });
}
