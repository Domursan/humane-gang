// ===== Accueil : liste des anniversaires à venir (calcul pur, sans DOM) =====
/**
 * Rôle : choisir, parmi les membres qui partagent leur anniversaire, ceux qui le fêtent dans les prochains jours.
 * Fenêtre glissante à partir d'aujourd'hui, passage d'année compris. Le 29 février est fêté le 28 les années non bissextiles.
 * Dépendances : aucune (testé sans navigateur par tests/unitaires/check-anniversaires.mjs). Exporte prochainsAnniversaires.
 */

/** Vrai si l'année est bissextile. */
const bissextile = (annee) => new Date(annee, 1, 29).getMonth() === 1;

/**
 * Anniversaires des `fenetre` prochains jours (aujourd'hui compris), du plus proche au plus lointain, puis par pseudo.
 * @param {Array<{pseudo: string, birthday_dm?: string|null}>} membres birthday_dm au format « JJ.MM »
 * @param {Date} now date du jour (heure ignorée)
 * @param {number} [fenetre=30] nombre de jours après aujourd'hui
 * @returns {Array<object>} les membres, avec `quand` (Date de la fête) et `dans` (jours restants, 0 = aujourd'hui)
 */
export function prochainsAnniversaires(membres, now, fenetre = 30) {
  const jour = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return (membres || []).filter((m) => m.birthday_dm).map((m) => {
    const [d, mo] = m.birthday_dm.split('.').map(Number);
    const date = (a) => (d === 29 && mo === 2 && !bissextile(a) ? new Date(a, 1, 28) : new Date(a, mo - 1, d));
    let quand = date(jour.getFullYear());
    if (quand < jour) quand = date(jour.getFullYear() + 1);
    return { ...m, quand, dans: Math.round((quand - jour) / 864e5) };
  }).filter((m) => m.dans <= fenetre).sort((a, b) => a.dans - b.dans || a.pseudo.localeCompare(b.pseudo, 'fr'));
}
