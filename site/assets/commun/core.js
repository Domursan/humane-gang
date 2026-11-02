// ===== Humane Gang — socle commun (à importer dans chaque page) =====
// Point d'entrée : le code est découpé dans assets/js/core/ ; ce fichier ré-exporte les mêmes noms qu'avant,
// les pages n'ont donc rien à changer dans leurs imports.
// Ordre volontaire : les modules de préférences et de thème (et leur cache) sont évalués AVANT le client Supabase
// (module à « await » de premier niveau), pour appliquer les couleurs sans flash pendant le chargement de supabase-js.
// Dépendances : utilitaires purs -> préférences / calcul des thèmes -> effets -> thème -> client Supabase
// -> profil, pages, fonctions -> préférences (panneau), mode sans limite, badges -> en-tête, pied -> initialisation.
/*
 * Rôle : ce fichier ne contient aucune logique. Il rassemble, en un seul endroit, tout ce qu'une page
 * peut importer depuis le socle. Les pages font « import { ... } from './core.js' » ou « '../core.js' » (admin).
 * Le détail de chaque élément est dans assets/js/core/<nom>.js ; les utilitaires sans dépendance
 * sont dans assets/commun/utils.js et ne passent pas par ici.
 * Exporte : tous les noms listés ci-dessous (ré-exports uniquement).
 */

/* ---------- Configuration, son et utilitaires ---------- */
export { LOGO_SRC } from './config.js';
export { playSound, playTurnSound } from './sound.js';
export { esc, $, $$, fmtDate, fmtDateTime, daysUntil, initials, avatarHtml, errMsg } from './core/util.js';
export { toast } from './core/ui.js';

/* ---------- Préférences et thèmes ---------- */
export { PREF_MODES, PREF_DEFAULTS, getPrefs } from './core/prefs-state.js';
export {
  DEFAULT_THEME, THEME_EFFECTS, THEME_COLOR_KEYS, isValidMd, todayMd, mdInRange, pickTheme, isHex, luminance, contrast,
  themeVars,
} from './core/theme-calc.js';
export { effectsEnabled, motionAllowed } from './core/effects.js';
export { paintTheme, getActiveTheme, getSiteTheme, currentLogo, logoAttrs } from './core/theme.js';
export { applyTheme } from './core/theme-load.js';
export { openPrefs, setPrefs } from './core/prefs.js';

/* ---------- Session, profil et droits ---------- */
export { sb, hasSession, isNavCancel, authLanding, signOutDevice } from './core/supabase.js';
export { cleCompte, lireLocal, ecrireLocal } from './core/comptes-etat.js'; // clés locales rangées par compte (jeux)
export { getUser, getProfile, requireMember, requireAdmin } from './core/profile.js';
export { loadMyPerms, getCachedPerms, canPanel, hasPerm, clearPerms } from './core/perms.js';
export { callFn, notify } from './core/functions.js';
export { currentPageSlug, loadMyPages, getMyPages, canAccess, pageLabel, pageHref } from './core/pages-access.js';

/* ---------- Mode sans limite (admin) ---------- */
export { GOD_MINUTES, GOD_PHRASE, GOD_LIFTS, getGodMode, isGodMode, godTag, godLimitAttr, godLimit, setGodMode, disableGodMode, openGodDialog } from './core/godmode.js';

/* ---------- Messages, en-tête, pied et badges ---------- */
export { refreshUnread } from './core/unread.js';
export { updateHeaderProfile, updateNav, renderHeader } from './core/header.js';
export { renderFooter, cookieNotice } from './core/footer.js';
export { checkNewBadges, celebrateBadges } from './core/badges.js';

/* ---------- Initialisation de page ---------- */
export { initPage } from './core/init.js';
