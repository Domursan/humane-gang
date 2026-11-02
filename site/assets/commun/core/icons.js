// Icônes SVG en ligne du socle (en-tête, pied de page, dialogues). Décoratives : aria-hidden.
/*
 * Rôle : contient les icônes SVG (chaînes HTML prêtes à insérer) utilisées par l'en-tête, le pied de page
 * et les dialogues communs. Chaque icône est une constante ICON_<NOM> ; elle n'a pas de texte alternatif
 * (aria-hidden), le libellé est donné par le bouton ou le lien qui la contient.
 * Page : toutes les pages (via header.js, footer.js, search.js, etc.).
 * Dépendances : aucune.
 * Exporte : ICON_MSG, ICON_DOOR, ICON_PREFS, ICON_BOLT, ICON_USER, ICON_ALERT, ICON_CLOSE, ICON_SEARCH, ICON_HELP, ICON_MENU,
 *   ICON_CHEVRON, ICON_CHEVRON_RIGHT, ICON_SHIELD, ICON_STATUT, ICON_COMPTES.
 * Les icônes utilisent currentColor : elles prennent la couleur du texte qui les entoure.
 */

export const ICON_MSG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>';
export const ICON_DOOR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4H6v16h8"/><path d="M10 12h10M17 9l3 3-3 3"/></svg>';
export const ICON_PREFS = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
export const ICON_BOLT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';
export const ICON_USER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
export const ICON_ALERT = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18.2v.01"/></svg>';
export const ICON_CLOSE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
export const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>';
export const ICON_HELP = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1.1.9-1.1 1.7v.4"/><path d="M12 17.2v.01"/></svg>';
// Menu repliable (téléphone) : trois traits qui deviennent une croix quand le menu est ouvert (voir base.css).
export const ICON_MENU = '<svg class="nav-toggle-ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path class="bar bar-1" d="M4 8h16"/><path class="bar bar-2" d="M4 12h16"/><path class="bar bar-3" d="M4 16h16"/></svg>';
// Nouveau menu (23/10) : chevrons des menus déroulants et bouclier du lien Admin dans le menu en arc.
export const ICON_CHEVRON = '<svg class="nav-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
export const ICON_CHEVRON_RIGHT = '<svg class="nav-chev-r" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';
export const ICON_SHIELD = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/></svg>';
export const ICON_STATUT = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
// Changer de compte (comptes.js) : deux silhouettes et deux flèches, dans le menu en arc.
export const ICON_COMPTES = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3.3 2.5-5.4 5.5-5.4 1.3 0 2.4.4 3.3 1"/><path d="M15 12h6M18.5 9.5 21 12l-2.5 2.5"/><path d="M21 17h-6M17.5 14.5 15 17l2.5 2.5"/></svg>';
