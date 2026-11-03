// Admin : droits du panel et plateau des lieux. Source unique des permissions (clé de hg_perm_catalog).
// SECTION_PERM : section (id de <section>) -> permission. « admin » : réservé à l'administrateur (gestion du Staff).
// SECTION_PERM et canSection sont rangés dans commun/core/droits-sections.js (lus aussi par les raccourcis Staff) et réexportés.
// LIEUX : les 7 lieux du plateau (accueil du panel), dans l'ordre d'affichage. Chaque lieu a un id (segment de l'URL,
// #<lieu>), un libellé, une couleur (bandeau et bordure), une icône (clé de admin/panel-icons.js), une phrase d'accroche
// (`tagline`) et ses sous-sections. Chaque sous-section pointe vers une section existante ; les sous-sections du jeu de
// cartes partagent la section #cartes (un onglet chacune). Une sous-section a aussi `heading` (groupe de la page du lieu
// et de la palette), `help` (ligne d'aide de sa tuile) et `icon`. Une sous-section sans droit est masquée et jamais
// montée. Un lieu sans sous-section permise n'apparaît nulle part.
// Utilisé par shell.js (plateau, fil d'Ariane, barre du bas), router.js (routage), lieux.js (pages de lieu), live.js
// (tables visibles) et les sections (canSection). Dépend de core/droits-sections.js (droits des sections) et core/util.js ($$).
// Droits des sections (SECTION_PERM, canSection…) : commun/core/droits-sections.js, réexportés ici pour le panel.
import { canSection, isAdminView } from '../../commun/core/droits-sections.js';
export { SECTION_PERM, canSection, anySection, isAdminView } from '../../commun/core/droits-sections.js';
import { $$ } from '../../commun/core/util.js';

/** Donne le groupe `heading` à chaque sous-section de la liste (titre de groupe sur la page du lieu et dans la palette). */
const under = (heading, subs) => subs.map((s) => ({ ...s, heading }));

// Les 7 lieux, dans l'ordre d'affichage du plateau. Les identifiants de sous-section sont uniques sur tout le panel
// (compteurs de shell.js indexés par identifiant seul) ; une adresse renommée reste valable : voir router.js.
export const LIEUX = [
  { id: 'place', label: 'La Place du gang', color: '#A88BE8', icon: 'place', tagline: 'Les membres, leurs invitations et leurs accès', subs: [
    ...under('Membres', [
      { id: 'comptes', label: 'Comptes', section: 'comptes', help: 'Fiches et statuts des membres', icon: 'user' },
      { id: 'roles', label: 'Rôles', section: 'roles', help: 'IRL, Secret Santa…', icon: 'shield' },
      { id: 'champs', label: 'Champs du profil', section: 'champs', help: 'Questions du formulaire', icon: 'form' },
      { id: 'social', label: 'Vie sociale', section: 'social', help: 'Ce que font les membres', icon: 'heart' },
      { id: 'accueil', label: 'Accueil des membres', section: 'accueil-membres', help: 'Message d’arrivée', icon: 'door' },
    ]),
    ...under('Relances', [
      { id: 'relance', label: 'À relancer', section: 'relance', help: 'Membres à relancer', icon: 'bell' },
      { id: 'invitations', label: 'Invitations', section: 'membres', help: 'Codes et liens d’invitation', icon: 'link' },
    ]),
    ...under('Entraide', [
      { id: 'parrainage', label: 'Parrainage', section: 'parrainage', help: 'Qui a invité qui', icon: 'share' },
      { id: 'competences', label: 'Compétences', section: 'competences', help: 'Ce que chacun sait faire', icon: 'wrench' },
    ]),
    ...under('Accès', [
      { id: 'acces', label: 'Accès aux pages', section: 'acces', part: 'pages', help: 'Qui voit quoi', icon: 'lock' },
      { id: 'acces-matrice', label: 'Matrice membres × pages', section: 'acces', part: 'matrice', help: 'Membres × pages', icon: 'grid' },
    ]),
    ...under('Badges', [
      { id: 'badges', label: 'Catalogue', section: 'badges', part: 'catalogue', help: 'Tous les badges', icon: 'badge' },
      { id: 'badges-attribution', label: 'Attribution', section: 'badges', part: 'attribution', help: 'Donner un badge', icon: 'award' },
      { id: 'badges-criteres', label: 'Critères automatiques', section: 'badges', part: 'criteres', help: 'Règles automatiques', icon: 'bolt' },
    ]),
  ] },
  { id: 'poste', label: 'La Poste', color: '#FCA301', icon: 'poste', tagline: 'Assistance et boîte à idées', subs: [
    ...under('Demandes', [
      { id: 'assistance', label: 'Assistance', section: 'assistance', help: 'Demandes des membres à traiter', icon: 'lifebuoy' },
      { id: 'modeles-reponse', label: 'Modèles de réponse', section: 'modeles-reponse', help: 'Réponses types de l’Assistance', icon: 'modele' },
      { id: 'idees', label: 'Boîte à idées', section: 'idees', help: 'Propositions à relire ou trier', icon: 'bulb' },
    ]),
    ...under('Échanges', [
      { id: 'messagerie', label: 'Messagerie', section: 'messagerie', help: 'Messages privés avec les membres', icon: 'mail' },
      { id: 'fil', label: 'Fil d’activité', section: 'fil', help: 'Ce qui se passe à La Poste', icon: 'pulse' },
    ]),
    ...under('Discord', [
      { id: 'bot', label: 'Bot Discord', section: 'bot', help: 'Envoyer un message du bot', icon: 'robot' },
      { id: 'commandes', label: 'Commandes slash', section: 'commandes', help: 'Activer ou couper les commandes', icon: 'terminal' },
    ]),
  ] },
  { id: 'ventes', label: 'La Salle des ventes', color: '#6F8FE8', icon: 'ventes', tagline: 'Enchères et échanges entre membres', subs: [
    ...under('Enchères', [
      { id: 'encheres', label: 'Enchères', section: 'cartes', tab: 'encheres', help: 'Enchères ouvertes, à venir et passées', icon: 'gavel' },
    ]),
    ...under('Entre membres', [
      { id: 'echanges', label: 'Échanges', section: 'cartes', tab: 'echanges', help: 'Échanges entre membres à surveiller', icon: 'swap' },
    ]),
  ] },
  { id: 'camp', label: 'Le Camp IRL', color: '#FBD32D', icon: 'camp', tagline: 'Les rencontres en vrai : sorties, souvenirs et Secret Santa', subs: [
    ...under('Qui', [
      { id: 'membres-irl', label: 'Membres IRL', section: 'membres-irl', help: 'Qui a le rôle IRL, et qui vient', icon: 'pin' },
    ]),
    ...under('Vivre les sorties', [
      { id: 'sorties', label: 'Sorties IRL', section: 'sorties', help: 'Créer, valider, revoir les sorties', icon: 'calendar' },
      { id: 'souvenirs', label: 'Souvenirs et photos', section: 'souvenirs', help: 'Les photos des sorties passées', icon: 'camera' },
    ]),
    ...under('Rendez-vous', [
      { id: 'secret-santa', label: 'Secret Santa', section: 'secret-santa', help: 'Inscriptions, tirage et règles', icon: 'gift' },
    ]),
  ] },
  { id: 'fabrique', label: 'La Fabrique de cartes', color: '#159946', icon: 'fabrique', tagline: 'Boosters, drops, dons', subs: [
    ...under('Agir', [
      { id: 'gestion', label: 'Gestion globale', section: 'cartes-gestion', help: 'Give cartes et paillettes', icon: 'give' },
      { id: 'drops', label: 'Drops', section: 'drops', help: 'Lancer un drop', icon: 'gift' },
      { id: 'codes', label: 'Codes cadeaux', section: 'cartes', tab: 'codes', help: 'Créer et suivre les codes', icon: 'ticket' },
    ]),
    ...under('Arène', [
      { id: 'arene', label: 'Arène', section: 'bataille', help: 'Duels et classements', icon: 'swords' },
    ]),
    ...under('Catalogue', [
      { id: 'series', label: 'Séries', section: 'cartes', tab: 'series', help: 'Les collections de cartes', icon: 'layers' },
      { id: 'cartes', label: 'Cartes', section: 'cartes', tab: 'cartes', help: 'Toutes les cartes', icon: 'cards' },
      { id: 'boosters', label: 'Boosters', section: 'cartes', tab: 'boosters', help: 'Paquets et tirages types', icon: 'box' },
    ]),
    ...under('Suivi', [
      { id: 'joueurs', label: 'Joueurs', section: 'cartes', tab: 'joueurs', help: 'Inventaires et soldes', icon: 'users' },
      { id: 'stats', label: 'Statistiques', section: 'cartes', tab: 'stats', help: 'Chiffres de l’économie', icon: 'chart' },
    ]),
    ...under('Économie', [
      { id: 'economie', label: 'Paillettes et dons', section: 'cartes', tab: 'economie', part: 'paillettes', help: 'Réserve et dons aux membres', icon: 'coin' },
      { id: 'tirage', label: 'Tirage', section: 'cartes', tab: 'economie', part: 'tirage', help: 'Tirages et probabilités', icon: 'dice' },
      { id: 'recyclage', label: 'Recyclage et fabrication', section: 'cartes', tab: 'economie', part: 'recyclage', help: 'Transformer les doublons', icon: 'refresh' },
      { id: 'limites', label: 'Limites', section: 'cartes', tab: 'economie', part: 'limites', help: 'Plafonds par membre', icon: 'gauge' },
    ]),
    ...under('Animations', [
      { id: 'quetes', label: 'Quêtes', section: 'cartes', tab: 'quetes', help: 'Missions pour les membres', icon: 'flag' },
      { id: 'defis', label: 'Défis du gang', section: 'defis', help: 'Objectifs collectifs', icon: 'trophy' },
      { id: 'challenges', label: 'Challenges de la semaine', section: 'challenges-semaine', help: 'Fichiers des membres et vote', icon: 'award' },
      { id: 'cagnotte', label: 'Cagnotte et bulletin', section: 'cagnotte', help: 'Cagnotte et votes', icon: 'vote' },
      { id: 'champions', label: 'Cartes Champions', section: 'champions', help: 'Cartes des champions', icon: 'star' },
      { id: 'recettes', label: 'Atelier (recettes)', section: 'cartes', tab: 'recettes', help: 'Recettes de fabrication', icon: 'flask' },
    ]),
  ] },
  { id: 'fete', label: 'La Fête foraine', color: '#E0909A', icon: 'fete', tagline: 'Événements et autres jeux', subs: [
    ...under('Événements', [
      { id: 'evenements', label: 'Événements à thème', section: 'evenements', help: 'Soirées et événements à thème', icon: 'spark' },
      { id: 'rdv', label: 'Calendrier et cinéma', section: 'rdv', help: 'Dates et séances du gang', icon: 'calendar' },
      { id: 'avent', label: 'Calendrier de l’Avent', section: 'saisons', part: 'avent', help: 'Cases et cadeaux du mois', icon: 'tree' },
      { id: 'saison-worlds', label: 'Saison des Worlds', section: 'saisons', part: 'worlds', help: 'Saison en cours', icon: 'globe' },
      { id: 'anniv-gang', label: 'Anniversaire du gang', section: 'saisons', part: 'anniv', help: 'Dates et cadeaux', icon: 'cake' },
    ]),
    ...under('Jeux', [
      { id: 'programmation', label: 'Programmation', section: 'jeux-programme', help: 'Ce qui est prévu pour les jeux du jour', icon: 'calendar' },
      { id: 'questions', label: 'Questions du gang', section: 'quiz', help: 'Quiz sur le gang', icon: 'chat' },
      { id: 'sutom', label: 'Sutom du gang', section: 'sutom', help: 'Mot du jour', icon: 'type' },
      { id: 'geoguessr', label: 'GeoGuessr', section: 'jeux-geo', help: 'Lieux à deviner', icon: 'map' },
      { id: 'citations', label: 'Citations « Qui a dit ça ? »', section: 'jeux-citations', help: 'Phrases du gang', icon: 'quote' },
      { id: 'preuves', label: 'Preuves de quêtes', section: 'preuves', help: 'Preuves des quêtes à valider', icon: 'check' },
      { id: 'framed-heardle', label: 'Framed et Heardle', section: 'jeux-medias', help: 'Images et musiques', icon: 'film' },
      { id: 'arcade', label: 'Arcade (pages 404)', section: 'arcade', help: 'Page en 404', icon: 'gamepad' },
      { id: 'secrets', label: 'Secrets', section: 'eggs', help: 'Éléments cachés', icon: 'key' },
      { id: 'mes-jeux', label: 'Mes jeux', section: 'mj', help: 'Ma liste de jeux', icon: 'list' },
      { id: 'loup-garou', label: 'Loup-Garou', section: 'loup-garou', help: 'Paillettes, badges et parties', icon: 'users' },
      { id: 'uno', label: 'Uno', section: 'uno', help: 'Paillettes, badges et parties en cours', icon: 'users' },
      { id: 'nom-de-code', label: 'Nom de code', section: 'nom-de-code', help: 'Paquets de mots, Paillettes, badges et parties en cours', icon: 'users' },
      { id: 'plateaux', label: 'Jeux de plateau', section: 'plateaux', help: 'Cluedo, Shadow Hunters, Destins, Monopoly, Risk : noms, Paillettes, badges, parties', icon: 'users' },
      { id: 'duels', label: 'Duels', section: 'duels', help: 'Puissance 4, Morpion, Mastermind, Bataille navale, Qui est-ce ?', icon: 'users' },
    ]),
  ] },
  { id: 'mairie', label: 'La Mairie', color: '#2EC4B6', icon: 'mairie', tagline: 'Le site et le Staff : tout ce qui règle le fonctionnement', subs: [
    ...under('Organisation', [
      { id: 'planning', label: 'Planning', section: 'planning', help: 'Dates, rendez-vous et tâches', icon: 'calendar' },
      { id: 'journal', label: 'Journal', section: 'journal', help: 'Ce qui s’est passé sur le site', icon: 'book' },
      { id: 'staff', label: 'Staff', section: 'staff', help: 'Qui fait quoi dans l’équipe', icon: 'shield' },
    ]),
    ...under('Le site', [
      { id: 'identite', label: 'Identité et mentions légales', section: 'reglages', part: 'identite', help: 'Nom, logo et mentions obligatoires', icon: 'id' },
      { id: 'textes', label: 'Textes et intro', section: 'reglages', part: 'textes', help: 'Accueil et phrases de présentation', icon: 'doc' },
      { id: 'menu', label: 'Menu et pied de page', section: 'reglages', part: 'menu', help: 'Liens de navigation et bas de page', icon: 'menu' },
      { id: 'theme', label: 'Thème', section: 'theme', help: 'Couleurs et apparence du site', icon: 'palette' },
    ]),
    ...under('Technique', [
      { id: 'etat', label: 'État du site', section: 'reglages', part: 'etat', help: 'En ligne, maintenance, disponibilité', icon: 'pulse' },
      { id: 'erreurs', label: 'Erreurs du site', section: 'erreurs', help: 'Erreurs remontées par le site', icon: 'warn' },
      { id: 'entretien', label: 'Entretien', section: 'entretien', help: 'Quotas, tâches planifiées et purge', icon: 'gauge' },
      { id: 'archives', label: 'Archives', section: 'archives', help: 'Anciennes versions rangées', icon: 'archive' },
      { id: 'reglages', label: 'Clés avancées', section: 'reglages', part: 'cles', help: 'Réglages techniques, à manier avec soin', icon: 'sliders' },
    ]),
  ] },
];

// Sous-sections retirées au démarrage parce que leur module est absent (ex. section livrée plus tard) : admin.js
// appelle disableSubs avant de construire la coquille. Elles sont alors traitées comme non permises.
const disabled = new Set();
/**
 * Retire des sous-sections du panel (module absent). À appeler avant initShell.
 * @param {...string} ids Identifiants de sous-section (ex. « champs »).
 */
export function disableSubs(...ids) { for (const id of ids) disabled.add(id); }

/** Sous-section permise ? (sous-section = objet de LIEUX, dont la section donne le droit) */
export const canSub = (sub) => !disabled.has(sub.id) && canSection(sub.section);

/**
 * Lieux permis, avec leurs sous-sections permises (sans lieu vide).
 * Une copie : LIEUX n'est jamais modifié.
 */
export function visibleLieux() {
  return LIEUX
    .map((d) => ({ ...d, subs: d.subs.filter(canSub) }))
    .filter((d) => d.subs.length);
}

/** Identifiant de lieu d'une sous-section (ex. « defis » → « fabrique »), ou null. */
export const lieuOf = (subId) => LIEUX.find((l) => l.subs.some((s) => s.id === subId))?.id ?? null;

/**
 * Masque les sections non accessibles et les éléments réservés à l'administrateur.
 * Appelé une fois au démarrage, avant que la coquille ne soit construite.
 */
export function applyPanelAccess() {
  for (const s of $$('.admin-section')) s.hidden = !canSection(s.id);
  if (!isAdminView()) for (const el of $$('[data-admin-only]')) el.hidden = true;
}
