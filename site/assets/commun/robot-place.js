// ===== Humane Gang — Jeux : place tenue par un robot (joueur parti, migration 211) =====
/*
 * Rôle : ce que partagent les écrans quand un robot joue la main d'un joueur parti : l'icône du robot et le texte « depuis 4 min »
 *   des listes de parties (accueil du Uno, barre « Reprendre ma partie » de la page Jeux). Uno seulement pour l'instant ; les
 *   plateaux viendront. Les textes des fenêtres de départ restent dans quitter.js.
 * Exporte : ICONE_ROBOT, depuisTexte.
 */

/** Icône du robot (maquette validée), à poser dans un conteneur qui lui donne sa taille. */
export const ICONE_ROBOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9 17h6"/></svg>';

/**
 * Durée écoulée depuis une date, pour « un robot joue pour toi depuis … » : « moins d’une minute », « 4 min », « 1 h 05 ».
 * @param {string} iso date ISO (heure du serveur).
 * @param {number} [maintenant] instant de référence (ms).
 * @returns {string}
 */
export function depuisTexte(iso, maintenant = Date.now()) {
  const t = new Date(iso).getTime();
  const s = isNaN(t) ? 0 : Math.max(0, Math.floor((maintenant - t) / 1000));
  if (s < 60) return 'moins d’une minute';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const reste = m % 60;
  return reste ? `${h} h ${String(reste).padStart(2, '0')}` : `${h} h`;
}
