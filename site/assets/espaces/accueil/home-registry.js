// ===== Humane Gang — registre des blocs de l'accueil (idée P9) =====
// Données pures (aucun accès au DOM ni à la base) : partagées par l'accueil (home-blocks.js, home-edit.js)
// et par l'admin (admin-home.js, réglage hg_settings.home_default).
// Chaque bloc : id (identifiant stable, a-z), label, desc (aide courte), page (slug de canAccess, ou null),
// kind ('tile' : tuile de la grille des rubriques ; 'row' : demi-largeur à côté d'un autre ; 'full' : pleine largeur),
// required (non masquable), sel (sélecteurs des éléments existants rendus par accueil.js) ou own (bloc rendu par home-blocks.js).
// Un bloc ajouté par un autre module de l'accueil peut s'inscrire sans toucher ce fichier : il suffit que son élément
// porte data-home-block="<id>" (et data-home-label="<libellé>") dans le squelette de l'accueil.
// Exporte : HOME_BLOCKS, HOME_DEFAULT, HOME_PROFILES, blockMeta.

/** Blocs connus, dans l'ordre d'origine de l'accueil. */
export const HOME_BLOCKS = [
  { id: 'evenement', label: 'Événement en cours', desc: 'bandeau, quand il y en a un', kind: 'full', required: true, sel: ['.recap-banner:not(.dyn-banner)', '#dyn-banner'] },
  { id: 'parrainage', label: 'Semaine d’accueil', desc: 'parrain et filleul, la première semaine', kind: 'full', required: true, own: true, auto: true },
  { id: 'defi', label: 'Défi du gang', desc: 'objectif collectif en cours', kind: 'full', sel: ['#defi'] },
  { id: 'secret_santa', label: 'Secret Santa', desc: 'édition en cours et compte à rebours', kind: 'tile', page: 'secret-santa', sel: ['#tile-ss'] },
  { id: 'irl', label: 'Prochaines sorties', desc: 'IRL : prochaine sortie et réponses', kind: 'tile', page: 'irl', sel: ['#tile-irl'] },
  { id: 'historique', label: 'Historique', desc: 'moments cultes et souvenirs', kind: 'tile', page: 'historique', sel: ['#tile-hist'] },
  { id: 'quetes', label: 'Quêtes de la semaine', desc: 'progression des quêtes', kind: 'full', page: 'cartes', own: true },
  { id: 'quotidien', label: 'Quotidien des cartes', desc: 'passage du jour, booster gratuit', kind: 'full', page: 'cartes', own: true },
  { id: 'quiz', label: 'Questions du gang', desc: 'le quiz du gang', kind: 'full', page: 'quiz', own: true },
  { id: 'fil', label: 'Fil d’activité', desc: '10 dernières entrées', kind: 'row', sel: ['.home-feed'] },
  { id: 'anniversaires', label: 'Anniversaires', desc: 'anniversaires des 30 prochains jours', kind: 'row', sel: ['.home-bdays'] },
  { id: 'idees', label: 'Boîte à idées', desc: 'une idée pour le gang', kind: 'full', sel: ['#idees'] },
];

/** Accueil d'origine (repli quand hg_settings.home_default est absent ou illisible). */
export const HOME_DEFAULT = { ordre: ['evenement', 'defi', 'secret_santa', 'ce_jour_la', 'irl', 'historique', 'fil', 'anniversaires', 'idees'], obligatoires: ['evenement'] };

/** Profils types proposés en un tap (les identifiants absents du site sont ignorés). */
export const HOME_PROFILES = [
  { id: 'cartes', label: 'Fan de cartes', ordre: ['evenement', 'quotidien', 'quetes', 'defi', 'quiz', 'fil', 'secret_santa', 'irl', 'historique', 'anniversaires'] },
  { id: 'irl', label: 'Fan d’IRL', ordre: ['evenement', 'irl', 'ce_soir', 'anniversaires', 'fil', 'secret_santa', 'historique', 'ce_jour_la', 'defi'] },
  { id: 'origine', label: 'Accueil d’origine', ordre: null },
];

/** Métadonnées d'un bloc connu (ou undefined). */
export const blockMeta = (id) => HOME_BLOCKS.find((b) => b.id === id);
