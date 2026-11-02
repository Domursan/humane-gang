// Réglages du lot 3 : Secret Santa, sorties IRL, souvenirs et albums.
// Chaque champ est rangé dans une clé de hg_settings (ss, irl, albums, photos). Le défaut de chaque champ
// est la valeur codée en dur jusqu'ici : sans réglage enregistré, le comportement ne change pas.
// Rangé dans commun/ : lu par les pages des membres (Secret Santa, IRL, historique), pas seulement par l'admin.
// Le code lit ces valeurs via assets/commun/reglages/valeurs-lot3.js (repli sur le défaut, bornes vérifiées).
// Types : entier, decimal, bool, texte. « nullable » : vide (null) = pas de limite / valeur absente.

export const DOMAINES_LOT3 = {
  ss: { titre: 'Secret Santa', section: 'irl/secret-santa' },
  irl: { titre: 'Sorties IRL', section: 'irl/sorties' },
  souvenirs: { titre: 'Souvenirs et photos', section: 'irl/souvenirs' },
};

/** Champs : cle = clé de hg_settings, champ = propriété dans la valeur JSON. */
export const CHAMPS_LOT3 = [
  // Secret Santa
  { domaine: 'ss', cle: 'ss', champ: 'min_participants', groupe: 'Tirage', type: 'entier', defaut: 3, min: 2, max: 50,
    label: 'Participants minimum pour le tirage automatique', aide: 'Le tirage automatique est refusé en dessous de ce nombre. Le mode sans limite garde 1.' },
  { domaine: 'ss', cle: 'ss', champ: 'min_participants_manuel', groupe: 'Tirage', type: 'entier', defaut: 2, min: 2, max: 50,
    label: 'Participants minimum pour le tirage manuel', aide: 'Même règle pour le tirage manuel, où l’admin compose les paires.' },
  { domaine: 'ss', cle: 'ss', champ: 'eviter_meme_cible_annee_precedente', groupe: 'Tirage', type: 'bool', defaut: true,
    label: 'Éviter la même cible que l’année précédente', aide: 'Le tirage automatique ne refait pas une paire de l’édition précédente.' },
  { domaine: 'ss', cle: 'ss', champ: 'budget_defaut', groupe: 'Édition', type: 'texte', defaut: null, max: 60, nullable: true,
    label: 'Budget proposé à la création d’une édition', aide: 'Pré-rempli dans le formulaire de création. Vide : rien n’est proposé.' },
  { domaine: 'ss', cle: 'ss', champ: 'souhaits_max', groupe: 'Souhaits', type: 'entier', defaut: null, min: 1, max: 200, nullable: true,
    label: 'Souhaits maximum par personne', aide: 'Vide : pas de limite (comportement actuel). Vérifié à l’ajout d’un souhait sur le site.' },
  // Sorties IRL
  { domaine: 'irl', cle: 'irl', champ: 'delai_passee_heures', groupe: 'Passage dans l’historique', type: 'entier', defaut: 6, min: 1, max: 168,
    label: 'Délai avant qu’une sortie passe dans l’historique (heures)', aide: 'Une sortie reste « à venir » ce nombre d’heures après son début. Vaut pour le site et l’admin.' },
  { domaine: 'irl', cle: 'irl', champ: 'sondage_min', groupe: 'Sondage de dates', type: 'entier', defaut: 2, min: 2, max: 12,
    label: 'Nombre minimum de dates proposées', aide: 'Au moins ce nombre de dates pour un sondage.' },
  { domaine: 'irl', cle: 'irl', champ: 'sondage_max', groupe: 'Sondage de dates', type: 'entier', defaut: 6, min: 2, max: 12,
    label: 'Nombre maximum de dates proposées', aide: 'Au plus ce nombre de dates. Doit être supérieur ou égal au minimum.' },
  { domaine: 'irl', cle: 'irl', champ: 'duree_defaut_heures', groupe: 'Calendrier', type: 'entier', defaut: 2, min: 1, max: 24,
    label: 'Durée par défaut d’une sortie sans heure de fin (heures)', aide: 'Utilisée pour l’export vers l’agenda (fichier .ics).' },
  // Souvenirs et photos
  { domaine: 'souvenirs', cle: 'photos', champ: 'cote_max', groupe: 'Photos', type: 'entier', defaut: 1600, min: 400, max: 4000,
    label: 'Taille maximale d’une photo (pixels, côté le plus long)', aide: 'Les photos sont réduites à cette taille avant l’envoi.' },
  { domaine: 'souvenirs', cle: 'photos', champ: 'qualite', groupe: 'Photos', type: 'decimal', defaut: 0.85, min: 0.5, max: 1,
    label: 'Qualité de compression (0,5 à 1)', aide: '1 : meilleure qualité, fichiers plus lourds. Défaut : 0,85.' },
  { domaine: 'souvenirs', cle: 'albums', champ: 'max_photos', groupe: 'Albums ZIP', type: 'entier', defaut: 400, min: 1, max: 2000,
    label: 'Nombre maximum de photos par album téléchargé', aide: 'Au-delà, le téléchargement en ZIP est refusé et l’album doit être téléchargé par lots.' },
  { domaine: 'souvenirs', cle: 'albums', champ: 'max_mo', groupe: 'Albums ZIP', type: 'entier', defaut: 300, min: 1, max: 2048,
    label: 'Poids maximum d’un album ZIP (Mo)', aide: 'Plafond du fichier ZIP d’un album.' },
];

/** Clés de hg_settings lues par le lot 3 (écriture par l’admin, lecture par le site). */
export const CLES_LOT3 = ['ss', 'irl', 'albums', 'photos'];

/** Descripteurs à fusionner dans le registre de keys.js (libellé et aide des clés, lecture seule pour les clés gérées ailleurs). */
export const KEYS_LOT3 = {
  ss: { label: 'Réglages du Secret Santa', help: 'Minimum de participants, éviter la même cible, budget proposé, souhaits maximum.', managed: '#camp/secret-santa', managedLabel: 'IRL · Secret Santa' },
  irl: { label: 'Réglages des sorties IRL', help: 'Passage dans l’historique, sondage de dates, durée par défaut.', managed: '#camp/sorties', managedLabel: 'IRL · Sorties IRL' },
  albums: { label: 'Réglages des albums', help: 'Nombre de photos et poids maximum d’un album ZIP.', managed: '#camp/souvenirs', managedLabel: 'IRL · Souvenirs et photos' },
  photos: { label: 'Réglages des photos', help: 'Taille et qualité des photos envoyées.', managed: '#camp/souvenirs', managedLabel: 'IRL · Souvenirs et photos' },
};

/** Valeurs par défaut sous forme d'objets { cle: { champ: défaut } }. */
export const DEFAUTS_LOT3 = CHAMPS_LOT3.reduce((acc, c) => {
  (acc[c.cle] ??= {})[c.champ] = c.defaut;
  return acc;
}, {});
