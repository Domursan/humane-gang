// ===== Humane Gang — catalogue de l'onglet « Jeux » (/pages/jeux/jeux.html, vue « Tous les jeux ») =====
/*
 * Rôle : déclare les cartes de la page d'accueil des jeux, rangées en sections. La page (jeux.js) n'affiche une carte
 * que si le membre y a droit :
 *   - page : slug de hg_pages dont l'accès conditionne la carte (canAccess + page déclarée, comme le menu) ;
 *   - bientot : jeu pas encore sorti, visible des seuls admins (pastille « En préparation », pas de lien) ;
 *   - admin : jeu en développement, jouable par les seuls admins (pastille « En développement », lien actif).
 * Une section vide pour le membre n'est pas affichée.
 * Champs d'une carte :
 *   id      identifiant unique (minuscules, chiffres, tirets) ;
 *   titre   nom affiché ;
 *   texte   une ligne de description ;
 *   section id de SECTIONS ;
 *   href    lien (une ancre « #geo » ouvre l'onglet du jeu dans cette page) ;
 *   onglet  facultatif : id de l'onglet de /pages/jeux/jeux.html dont le résumé du jour donne la pastille (« Fait », « À jouer ») ;
 *   image   facultatif : image 3:2 (/assets/images/jeux/…) ; sans image, une vignette avec l'icône et la couleur ;
 *   icone   facultatif : contenu SVG (viewBox 0 0 24 24, trait) ; couleur : variable CSS ou hexadécimal.
 * Exporte : SECTIONS, CARTES, BONUS_IDS, BONUS (les 16 jeux du bonus), LIBELLE_ETAT (libellés des états).
 */

/**
 * Sections de la page, dans l'ordre. « quotidien » : une seule partie par jour (la même pour tout le gang, ou une nouvelle
 * énigme chaque jour) ; « flash » : jouables à volonté. Les jeux quotidiens sont ceux de l'onglet « Chaque jour »
 * (onglets.js, champ rythme), hors Arcade, et le Code du jour (duels.html) ; les 16 qui comptent pour le bonus « tous les
 * jeux » sont dans hg_jeux_liste() (migration 157).
 */
export const SECTIONS = [
  { id: 'quotidien', titre: 'Jeux quotidiens', texte: 'Une nouvelle partie chaque jour.' },
  { id: 'flash', titre: 'Jeux flash', texte: 'Des parties à volonté, quand tu veux.' },
  { id: 'multi', titre: 'Jeux multijoueurs', texte: 'À deux ou en équipe, en direct.' },
  { id: 'speciaux', titre: 'Jeux spéciaux', texte: 'Les grandes parties du gang.' },
];

const IMG = '/assets/images/jeux/';

/** Cartes, dans l'ordre d'affichage de chaque section. */
export const CARTES = [
  // Jeux quotidiens : une partie par jour (voir SECTIONS)
  { id: 'geo', image: `${IMG}geo.webp`, titre: 'GeoGuessr', texte: 'Devine où la photo a été prise.', section: 'quotidien', href: '#geo', onglet: 'geo', couleur: 'var(--sage)',
    icone: '<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/>' },
  { id: 'citations', image: `${IMG}citations.webp`, titre: 'Qui a dit ça ?', texte: 'Retrouve l’auteur de la citation.', section: 'quotidien', href: '#citations', onglet: 'citations', couleur: 'var(--slate)',
    icone: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>' },
  { id: 'jour', image: `${IMG}jour.webp`, titre: 'Question du jour', texte: 'Une question, une réponse par jour.', section: 'quotidien', href: '#jour', onglet: 'jour', couleur: 'var(--sand)',
    icone: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/>' },
  { id: 'sutom', image: `${IMG}sutom.webp`, titre: 'Sutom du gang', texte: 'Trouve le mot caché, lettre par lettre.', section: 'quotidien', href: '#sutom', onglet: 'sutom', couleur: 'var(--rose)',
    icone: '<rect x="3" y="8" width="5" height="8" rx="1"/><rect x="9.5" y="8" width="5" height="8" rx="1"/><rect x="16" y="8" width="5" height="8" rx="1"/>' },
  { id: 'framed', image: `${IMG}framed.webp`, titre: 'Framed', texte: 'Devine le film à partir d’une image.', section: 'quotidien', href: '#framed', onglet: 'framed', couleur: 'var(--plum)',
    icone: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>' },
  { id: 'heardle', image: `${IMG}heardle.webp`, titre: 'Heardle', texte: 'Reconnais la chanson en quelques notes.', section: 'quotidien', href: '#heardle', onglet: 'heardle', couleur: 'var(--amber)',
    icone: '<path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2"/>' },
  { id: 'code-du-jour', titre: 'Code du jour', texte: 'Un code secret, dix essais, le même pour tous.', section: 'quotidien', href: '/pages/jeux/duels.html#jour', page: 'duels', image: `${IMG}jour.webp` },
  { id: 'arcade-paillettes', image: `${IMG}arcade-paillettes.webp`, titre: 'Paillettes', texte: 'Attrape les Paillettes, évite le reste.', section: 'flash', href: '#arcade-paillettes', couleur: 'var(--sand)',
    icone: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>' },
  { id: 'arcade-raclette', image: `${IMG}arcade-raclette.webp`, titre: 'Raclette', texte: 'Un jeu d’arcade qui sent bon le fromage.', section: 'flash', href: '#arcade-raclette', couleur: 'var(--amber)',
    icone: '<path d="M3 15l9-8 9 8z"/><path d="M7 15v3h10v-3"/><path d="M10 12h.01M14 13h.01"/>' },
  // Nouveaux jeux : accès réglé dans « Accès aux pages » du panel (page : slug de hg_pages, migration 150)
  { id: 'nj-carte', image: `${IMG}nj-carte.webp`, titre: 'Carte mystère', texte: 'Reconnais la carte floutée.', section: 'quotidien', href: '#carte-mystere', onglet: 'carte-mystere', page: 'nj-carte', couleur: 'var(--plum)',
    icone: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M10 9.5a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2V13M12 16.5v.01"/>' },
  { id: 'nj-jv', image: `${IMG}nj-jv.webp`, titre: 'Jeu vidéo du jour', texte: 'Une capture zoomée : quel jeu ?', section: 'quotidien', href: '#jeu-video', onglet: 'jeu-video', page: 'nj-jv', couleur: 'var(--slate)',
    icone: '<rect x="2" y="7" width="20" height="10" rx="4"/><path d="M7 10v4M5 12h4M15 11h.01M18 13h.01"/>' },
  { id: 'nj-pochette', image: `${IMG}nj-pochette.webp`, titre: 'Pochette du jour', texte: 'Retrouve l’album derrière le flou.', section: 'quotidien', href: '#pochette', onglet: 'pochette', page: 'nj-pochette', couleur: 'var(--rose)',
    icone: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>' },
  { id: 'nj-replique', image: `${IMG}nj-replique.webp`, titre: 'Réplique du jour', texte: 'Une réplique culte : quel film ?', section: 'quotidien', href: '#replique', onglet: 'replique', page: 'nj-replique', couleur: 'var(--sand)',
    icone: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h1M12 9h1M8 12h5"/>' },
  { id: 'nj-pays', image: `${IMG}nj-pays.webp`, titre: 'Pays du jour', texte: 'Une silhouette, six essais.', section: 'quotidien', href: '#pays', onglet: 'pays', page: 'nj-pays', couleur: 'var(--sage)',
    icone: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>' },
  { id: 'nj-plat', image: `${IMG}nj-plat.webp`, titre: 'Plat du jour', texte: 'Devine le plat sur la photo.', section: 'quotidien', href: '#plat', onglet: 'plat', page: 'nj-plat', couleur: 'var(--amber)',
    icone: '<path d="M3 13h18a9 9 0 0 1-18 0z"/><path d="M8 9c0-2 2-2 2-4M13 9c0-2 2-2 2-4"/>' },
  { id: 'nj-connexions', image: `${IMG}nj-connexions.webp`, titre: 'Connexions', texte: '16 mots, 4 groupes cachés.', section: 'quotidien', href: '#connexions', onglet: 'connexions', page: 'nj-connexions', couleur: 'var(--sage)',
    icone: '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>' },
  { id: 'nj-motscroises', image: `${IMG}nj-motscroises.webp`, titre: 'Mots croisés', texte: 'Une mini grille par jour.', section: 'quotidien', href: '#mots-croises', onglet: 'mots-croises', page: 'nj-motscroises', couleur: 'var(--sand)',
    icone: '<path d="M3 3h18v18H3z"/><path d="M3 9h18M9 3v18"/>' },
  { id: 'nj-motmele', image: `${IMG}nj-motmele.webp`, titre: 'Mot mêlé', texte: 'Retrouve les mots cachés.', section: 'quotidien', href: '#mot-mele', onglet: 'mot-mele', page: 'nj-motmele', couleur: 'var(--slate)',
    icone: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7l10 10"/>' },
  { id: 'nj-anagramme', image: `${IMG}nj-anagramme.webp`, titre: 'Anagramme', texte: 'Remets les lettres dans l’ordre.', section: 'quotidien', href: '#anagramme', onglet: 'anagramme', page: 'nj-anagramme', couleur: 'var(--rose)',
    icone: '<path d="M4 17l4-10 4 10M5.5 13h5M14 7h6l-6 10h6"/>' },
  { id: 'nj-nerdle', image: `${IMG}nj-nerdle.webp`, titre: 'Nerdle du gang', texte: 'Devine le calcul en 6 essais.', section: 'quotidien', href: '#nerdle', onglet: 'nerdle', page: 'nj-nerdle', couleur: 'var(--plum)',
    icone: '<path d="M5 8h4M7 6v4M15 8h4M5 16h4M15 15h4M15 17h4"/>' },
  { id: 'nj-sudoku', image: `${IMG}nj-sudoku.webp`, titre: 'Sudoku du jour', texte: 'La même grille pour tout le gang.', section: 'quotidien', href: '#sudoku', onglet: 'sudoku', page: 'nj-sudoku', couleur: 'var(--slate)',
    icone: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>' },
  { id: 'nj-demineur', image: `${IMG}nj-demineur.webp`, titre: 'Démineur', texte: 'Évite les cœurs cachés, au chrono.', section: 'flash', href: '#demineur', page: 'nj-demineur', couleur: 'var(--rust)',
    icone: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>' },
  { id: 'nj-2048', image: `${IMG}nj-2048.webp`, titre: '2048 Paillettes', texte: 'Fusionne jusqu’à la légendaire.', section: 'flash', href: '#2048', page: 'nj-2048', couleur: 'var(--sand)',
    icone: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>' },
  { id: 'arcade-flappy', image: `${IMG}arcade-flappy.webp`, titre: 'Flappy Domu', texte: 'Le cœur du gang s’envole.', section: 'flash', href: '#arcade-flappy', page: 'arcade-flappy', couleur: 'var(--rose)' },
  { id: 'arcade-briques', image: `${IMG}arcade-briques.webp`, titre: 'Casse-briques', texte: 'Des cartes en briques.', section: 'flash', href: '#arcade-briques', page: 'arcade-briques', couleur: 'var(--amber)' },
  { id: 'arcade-snake', image: `${IMG}arcade-snake.webp`, titre: 'Snake', texte: 'Mange des raclettes, grandis.', section: 'flash', href: '#arcade-snake', page: 'arcade-snake', couleur: 'var(--sage)' },
  { id: 'arcade-tetris', image: `${IMG}arcade-tetris.webp`, titre: 'Tetris du gang', texte: 'Des pièces arc-en-ciel.', section: 'flash', href: '#arcade-tetris', page: 'arcade-tetris', couleur: 'var(--slate)' },
  { id: 'arcade-invaders', image: `${IMG}arcade-invaders.webp`, titre: 'Space Invaders', texte: 'Les cornichons attaquent.', section: 'flash', href: '#arcade-invaders', page: 'arcade-invaders', couleur: 'var(--sage)' },
  { id: 'arcade-taupe', image: `${IMG}arcade-taupe.webp`, titre: 'Tape-taupe', texte: 'Tape les membres qui sortent.', section: 'flash', href: '#arcade-taupe', page: 'arcade-taupe', couleur: 'var(--rust)' },
  { id: 'arcade-domu', image: `${IMG}arcade-domu.webp`, titre: 'Domu-mobile', texte: 'Conduis, esquive, arrive en premier.', section: 'flash', href: '#arcade-domu', couleur: 'var(--rust)',
    icone: '<path d="M3 15l2-5h11l3 5"/><path d="M3 15h18v2H3z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="16.5" cy="18" r="1.5"/>' },

  // Jeux multijoueurs : pages à part (accès de la page « duels »), ou en préparation (admins seulement)
  { id: 'duels', titre: 'Mes duels', texte: 'Défis reçus, duels en cours, statistiques.', section: 'multi', href: '/pages/jeux/duels.html', page: 'duels', couleur: 'var(--sand)',
    icone: '<path d="M4 4l8 8M4 4h4M4 4v4M20 4l-8 8M20 4h-4M20 4v4M8 16l-4 4M16 16l4 4M9 15l6-6M15 15L9 9"/>' },
  { id: 'puissance4', titre: 'Puissance 4', texte: 'Aligne 4 jetons avant l’autre.', section: 'multi', href: '/pages/jeux/duels.html#creer/p4', page: 'duels', image: `${IMG}p4.webp` },
  { id: 'morpion', titre: 'Morpion', texte: 'Classique, Ultime ou Gomoku.', section: 'multi', href: '/pages/jeux/duels.html#creer/morpion', page: 'duels', image: `${IMG}morpion.webp` },
  { id: 'bataille-navale', titre: 'Bataille navale', texte: 'Cache ta flotte, coule la sienne.', section: 'multi', href: '/pages/jeux/duels.html#creer/bataille', page: 'duels', image: `${IMG}bataille-navale.webp` },
  { id: 'mastermind', titre: 'Mastermind', texte: 'Perce le code secret.', section: 'multi', href: '/pages/jeux/duels.html#creer/mastermind', page: 'duels', image: `${IMG}mastermind.webp` },
  { id: 'nj-dames', image: `${IMG}dames.webp`, titre: 'Dames', texte: 'Prises obligatoires, rafles et dames volantes.', section: 'multi', href: '/pages/jeux/duels.html#creer/dames', page: 'duel-dames', couleur: 'var(--slate)',
    icone: '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="16" r="3"/><path d="M3 3h18v18H3z"/>' },
  { id: 'nj-echecs', image: `${IMG}echecs.webp`, titre: 'Échecs', texte: 'Le grand classique, contre un membre ou le robot.', section: 'multi', href: '/pages/jeux/duels.html#creer/echecs', page: 'duel-echecs', couleur: 'var(--sand)',
    icone: '<path d="M9 21h6M8 18h8M10 18l-1-6h6l-1 6M9 12a3 3 0 1 1 6 0M12 3v3M10.5 4.5h3"/>' },
  { id: 'nj-othello', image: `${IMG}othello.webp`, titre: 'Othello', texte: 'Encadre et retourne les pions.', section: 'multi', href: '/pages/jeux/duels.html#creer/othello', page: 'duel-othello', couleur: 'var(--sage)',
    icone: '<circle cx="8" cy="12" r="4"/><circle cx="16" cy="12" r="4" fill="currentColor"/>' },
  { id: 'nj-pfc', image: `${IMG}pfc.webp`, titre: 'Pierre-feuille-ciseaux', texte: 'En 1, 3 ou 5 manches.', section: 'multi', href: '/pages/jeux/duels.html#creer/pfc', page: 'duel-pfc', couleur: 'var(--rose)',
    icone: '<circle cx="7" cy="16" r="3"/><rect x="12" y="4" width="8" height="10" rx="1"/><path d="M5 4l6 8M11 4l-6 8"/>' },
  { id: 'qui-est-ce', titre: 'Qui est-ce ?', texte: 'Devine son personnage secret.', section: 'multi', href: '/pages/jeux/duels.html#creer/quiestce', page: 'duels', image: `${IMG}qui-est-ce.webp` },
  { id: 'nom-de-code', titre: 'Nom de code', texte: 'Fais deviner tes mots à ton équipe.', section: 'multi', href: '/pages/jeux/nom-de-code.html', page: 'nom-de-code', image: `${IMG}nom-de-code.webp` },

  // Jeux spéciaux : pages à part, visibles selon l'accès de la page
  { id: 'loup-garou', image: `${IMG}loup-garou.webp`, titre: 'Loup-Garou', texte: 'Démasque les loups avant l’aube.', section: 'speciaux', href: '/pages/jeux/loup-garou.html', page: 'loup-garou', couleur: 'var(--slate)',
    icone: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' },
  { id: 'uno', image: `${IMG}uno.webp`, titre: 'Uno', texte: 'Vide ta main avant les autres.', section: 'speciaux', href: '/pages/jeux/uno.html', page: 'uno', couleur: 'var(--rose)',
    icone: '<rect x="4" y="5" width="10" height="15" rx="2" transform="rotate(-10 9 12)"/><rect x="10" y="4" width="10" height="15" rx="2" transform="rotate(8 15 11)"/>' },
  // Jeux de plateau ajoutés ensuite (accès selon leur page, ouverts aux membres depuis novembre 2026)
  { id: 'nj-blackjack', image: `${IMG}blackjack.webp`, titre: 'Blackjack', texte: 'Contre la banque, à qui s’approche de 21.', section: 'speciaux', href: '/pages/jeux/blackjack.html', page: 'blackjack', couleur: 'var(--sage)',
    icone: '<rect x="3" y="5" width="11" height="15" rx="2"/><rect x="10" y="3" width="11" height="15" rx="2"/><path d="M14 9l2 3-2 3-2-3z"/>' },
  { id: 'nj-poker', image: `${IMG}poker.webp`, titre: 'Poker', texte: 'Texas Hold’em, en jetons.', section: 'speciaux', href: '/pages/jeux/poker.html', page: 'poker', couleur: 'var(--rust)',
    icone: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>' },
  { id: 'nj-catan', image: `${IMG}catan.webp`, titre: 'Catan du gang', texte: 'Récolte, construis, atteins 10 points.', section: 'speciaux', href: '/pages/jeux/catan.html', page: 'catan', couleur: 'var(--amber)',
    icone: '<path d="M12 2l8 4.5v9L12 20l-8-4.5v-9z"/><path d="M12 2v18M4 6.5l16 9M20 6.5l-16 9"/>' },
  { id: 'nj-pictionary', image: `${IMG}pictionary.webp`, titre: 'Pictionary', texte: 'Dessine, les autres devinent.', section: 'speciaux', href: '/pages/jeux/pictionary.html', page: 'pictionary', couleur: 'var(--plum)',
    icone: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/>' },
  // Jeux de plateau (migrations 125 à 130) : pages en mode admin au lancement, ouvertes aux membres depuis novembre 2026
  { id: 'cluedo', titre: 'Cluedo', texte: 'Qui a tué le Docteur Lenoir ? Mène l’enquête.', section: 'speciaux', href: '/pages/jeux/cluedo.html', page: 'cluedo', image: `${IMG}cluedo.webp` },
  { id: 'shadow-hunters', titre: 'Shadow Hunters', texte: 'Hunters, Shadows ou Neutres : qui est qui ?', section: 'speciaux', href: '/pages/jeux/shadow-hunters.html', page: 'shadow-hunters', image: `${IMG}shadow-hunter.webp` },
  { id: 'destins', titre: 'Destins', texte: 'Fais tourner la roue de la vie.', section: 'speciaux', href: '/pages/jeux/destins.html', page: 'destins', image: `${IMG}destins.webp` },
  { id: 'monopoly', titre: 'Monopoly', texte: 'Achète, construis, ruine tes amis.', section: 'speciaux', href: '/pages/jeux/monopoly.html', page: 'monopoly', image: `${IMG}monopoly.webp` },
  { id: 'risk', titre: 'Risk', texte: 'Conquiers le monde, ou remplis ta mission.', section: 'speciaux', href: '/pages/jeux/risk.html', page: 'risk', image: `${IMG}risk.webp` },
];

/**
 * Les 16 jeux du jour qui comptent pour le bonus « tous les jeux » (liste de hg_jeux_liste, migration 157) : ids de CARTES.
 * Source unique des compteurs : le tableau de bord « Missions quotidiennes » (jeux.js) et le classement (classement-jeux.js)
 * comptent les mêmes jeux, et le total vient d'ici (le serveur renvoie le même nombre).
 */
export const BONUS_IDS = ['sutom', 'framed', 'heardle', 'code-du-jour', 'nj-carte', 'nj-jv', 'nj-pochette', 'nj-replique',
  'nj-pays', 'nj-plat', 'nj-connexions', 'nj-motscroises', 'nj-motmele', 'nj-anagramme', 'nj-nerdle', 'nj-sudoku'];
/** Cartes des 16 jeux du bonus, dans l'ordre du catalogue. */
export const BONUS = CARTES.filter((c) => BONUS_IDS.includes(c.id));
/** Libellés des états affichés en pastille, identiques dans toutes les vues (« Ouvrir » et « Découvre le jeu » ne sont plus utilisés). */
export const LIBELLE_ETAT = { fait: 'Fait', a_jouer: 'À jouer', en_cours: 'En cours' };
