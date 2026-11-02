// Droits des sections du panel : quelle permission ouvre quelle section (SECTION_PERM) et canSection.
// Module léger, à part de admin/perms.js (lieux, sous-sections, libellés) : les raccourcis Staff (staff-dock.js), affichés sur
// toutes les pages, n'ont besoin que des droits ; admin/perms.js les réexporte pour le panel (même instance).
// Dépend de core/perms.js (permissions en cache, hasPerm).
import { getCachedPerms, hasPerm } from './perms.js';

/** Section (id de <section>) -> permission requise. null : pas de permission. */
export const SECTION_PERM = {
  comptes: 'membres', acces: 'membres', membres: 'membres',
  'secret-santa': 'secret_santa',
  badges: 'badges',
  evenements: 'themes',
  sorties: 'evenements',
  souvenirs: 'souvenirs',
  reglages: 'reglages',
  cartes: 'cartes', drops: 'cartes', defis: 'cartes', quiz: 'quiz',
  sutom: 'souvenirs', // Sutom du gang (J8)
  cagnotte: 'cartes', champions: 'cartes', // idées C13/C15 et C17 (migration 082)
  idees: 'support', assistance: 'support',
  'modeles-reponse': 'support', // idée 99 (migration 194) : réponses types de l'Assistance
  messagerie: 'messages',
  journal: 'journal',
  bot: 'bot',
  theme: 'themes',
  staff: 'admin',
  // Sections ajoutées avec les sous-menus : réglages (clés eggs, profile_fields, table hg_activity) → droit « reglages »
  eggs: 'reglages', fil: 'reglages', champs: 'reglages', social: 'reglages', // social : Vie sociale (migration 090)
  // Page « Jeux » (migration 083) : GeoGuessr (photos des sorties), citations (quiz)
  'jeux-geo': 'souvenirs', 'jeux-citations': 'quiz',
  // Jeux (paquet xJ3) : preuves des quêtes (J11), Framed et Heardle (J9, J10), Bataille (J15)
  preuves: 'preuves', 'jeux-medias': 'souvenirs', bataille: 'cartes',
  // Idées A3 et A4 (migration 092) : Mes jeux (permission « Maître du jeu ») et À relancer. Le Planning (A2) est à part :
  // permis dès qu'une de ses sources l'est (PLANNING_PERMS), chaque bloc étant filtré par la base.
  mj: 'mj', relance: 'membres',
  // Idées « Social et profils » (migration 091) : parrainage et compétences → « membres » ; accueil des membres → « reglages »
  parrainage: 'membres', competences: 'membres', 'accueil-membres': 'reglages',
  // Idées A8 et A9 : Site › Erreurs du site (droit « reglages ») et Archives (administrateur seulement)
  erreurs: 'reglages', archives: 'admin',
  // Entretien (migration 192) : voir la page ; durées, purge et « Ignorer cette semaine » sont réservés à l'administrateur en base
  entretien: 'reglages',
  // Idées V8, V9 (calendrier, ciné-club) et D3 (commandes slash) : migration 087
  rdv: 'evenements', commandes: 'bot',
  saisons: 'themes', // rendez-vous saisonniers (migration 096) : calendrier de l'Avent, saison des Worlds, anniversaire du gang
  // Réorganisation du panel (migration 103) : rôles et Membres IRL → « membres » ; gestion globale des cartes → « cartes » ;
  // arcade (jeux des pages 404) → « reglages ». Les sections pas encore livrées sont retirées (disableSubs, admin.js).
  roles: 'membres', 'membres-irl': 'membres', 'cartes-gestion': 'cartes', arcade: 'reglages',
  // Loup-Garou (La Fête foraine › Jeux) : réservé à l'administrateur (réglages des Paillettes, badges, parties)
  'loup-garou': 'admin',
  // Uno (La Fête foraine › Jeux) : réservé à l'administrateur (réglages des Paillettes, badges, parties en cours)
  uno: 'admin',
  // Duels (La Fête foraine › Jeux) : Puissance 4, Morpion, Mastermind ; réservé à l'administrateur
  duels: 'admin',
  'nom-de-code': 'admin',
  // Jeux de plateau (Cluedo, Shadow Hunters, Destins, Monopoly, Risk) : noms, Paillettes, badges, parties ; administrateur
  plateaux: 'admin',
};

// Planning (idée A2) : visible si l'une de ces permissions est accordée (quiz, cartes, événements, sorties, Secret Santa, bot).
export const PLANNING_PERMS = ['quiz', 'cartes', 'themes', 'evenements', 'secret_santa', 'bot'];
// Programmation des jeux (migration 183) : visible avec l'une de ces permissions ; la base ne renvoie que les jeux permis.
export const PROGRAMME_PERMS = ['souvenirs', 'quiz'];

/**
 * Ai-je accès à cette section ?
 * « admin » exige l'administrateur ; « planning » et « jeux-programme » sont permis si une de leurs sources l'est.
 * @param {string} id Identifiant de section (voir SECTION_PERM).
 */
export function canSection(id) {
  if (id === 'planning') return PLANNING_PERMS.some((k) => hasPerm(k));
  if (id === 'jeux-programme') return PROGRAMME_PERMS.some((k) => hasPerm(k));
  const need = SECTION_PERM[id];
  if (!need) return false;
  if (need === 'admin') return !!getCachedPerms()?.is_admin;
  return hasPerm(need);
}
/** Au moins une des sections est-elle accessible ? (chargement partagé de données) */
export const anySection = (...ids) => ids.some(canSection);
/** Vrai pour l'administrateur (et non pour un membre du Staff). */
export const isAdminView = () => !!getCachedPerms()?.is_admin;
