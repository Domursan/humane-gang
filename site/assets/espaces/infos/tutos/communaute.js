// Tutos du groupe « Vie du gang » — données pures (aucun import), lisibles dans le navigateur ET dans Node.
// Libellés relus dans messages.js, accueil.js, membre.js, compte.js, assistance.js et la base (hg_badges, migration 041).
/*
 * Structure d'un groupe : { id, title, icon, tutos: [...] }.
 * Structure d'un tuto : { slug, title, summary, page (page HTML concernée), steps: [{ title, text }], tips: [texte], keywords: [mots de recherche] }.
 * La page d'aide (aide.js) affiche ces données ; elle ne les modifie pas.
 */
export default {
  id: 'communaute',
  title: 'Vie du gang',
  icon: '💬',
  tutos: [
    {
      slug: 'envoyer-un-message-prive',
      title: 'Envoyer un message privé',
      summary: "Écris à un membre en tête à tête, sans passer par le groupe.",
      page: "/pages/compte/messages.html",
      steps: [
        { title: "Ouvre Messages", text: "Depuis le menu, ouvre la page Messages. Les conversations en cours sont listées à gauche (sur mobile, sur tout l'écran)." },
        { title: "Clique sur « Nouveau message »", text: "Le bouton est en haut de la page. Une fenêtre s'ouvre avec le champ « Chercher un membre… »." },
        { title: "Choisis le membre", text: "Tape son pseudo pour filtrer la liste, puis clique sur son nom. La conversation s'ouvre tout de suite." },
        { title: "Écris ton message", text: "Tape dans le champ « Écris à … » en bas. Entrée envoie le message ; Maj + Entrée ajoute une ligne. Un message fait 4000 caractères au maximum." },
        { title: "Reviens à la liste", text: "Sur mobile, la flèche « Retour aux conversations » en haut ramène à la liste. Les conversations non lues affichent un compteur." },
      ],
      tips: [
        "Tu peux aussi écrire depuis la carte d'un membre, avec le bouton « Envoyer un message ».",
        "Les messages peuvent être consultés par l'admin : ne mets rien que tu ne voudrais pas voir lu.",
      ],
      keywords: ["message", "messages", "messagerie", "écrire", "conversation", "privé", "dm", "chat"],
    },
    {
      slug: 'lire-le-fil-d-activite',
      title: "Lire le fil d'activité",
      summary: "Suis en un coup d'œil ce qui se passe dans le gang sur l'accueil.",
      page: "/pages/compte/accueil.html",
      steps: [
        { title: "Ouvre l'accueil", text: "La page d'accueil est le QG du Humane Gang. Le bloc « Fil d'activité » se trouve dans la rangée du bas de l'accueil, à côté des anniversaires." },
        { title: "Lis les entrées", text: "Chaque ligne indique un événement récent : une inscription, une sortie, un souvenir, un badge gagné… Le plus récent est en haut." },
        { title: "Repère l'heure", text: "Sous chaque entrée, le temps écoulé (« il y a 2 heures », « hier »…). Survole-le pour voir la date complète." },
        { title: "Ouvre une fiche", text: "Clique sur le pseudo d'un membre pour ouvrir sa carte de membre." },
      ],
      tips: [
        "Le fil affiche les 10 dernières entrées. Les entrées système (sans photo) viennent du site lui-même.",
      ],
      keywords: ["fil", "activité", "accueil", "actualité", "dernières", "nouveautés", "feed"],
    },
    {
      slug: 'partager-son-anniversaire',
      title: 'Partager son anniversaire',
      summary: "Fais apparaître ton anniversaire sur l'accueil du gang, sans jamais révéler ton année de naissance.",
      page: "/pages/compte/compte.html",
      steps: [
        { title: "Ouvre ton compte", text: "Depuis le menu, ouvre la page Compte." },
        { title: "Renseigne la date", text: "Dans le bloc « Profil », remplis « Date d'anniversaire ». Ce champ reste privé : seul l'admin le voit." },
        { title: "Coche le partage", text: "Coche « Partager le jour et le mois de mon anniversaire avec le gang (accueil, bot) ». Seuls le jour et le mois sont visibles, jamais l'année." },
        { title: "Enregistre", text: "Clique sur « Enregistrer » dans le bloc « Profil »." },
        { title: "Vérifie sur l'accueil", text: "Ton anniversaire apparaît dans « Anniversaires de … » sur l'accueil, le jour J avec la mention « Aujourd'hui »." },
      ],
      tips: [
        "Sans partage coché, ton anniversaire reste visible par toi et l'admin uniquement.",
        "Si le bloc « Anniversaires » est vide, c'est qu'aucun membre n'a partagé de date ce mois-ci : l'accueil te propose alors de partager la tienne.",
      ],
      keywords: ["anniversaire", "birthday", "date", "fête", "partager", "jour", "mois"],
    },
    {
      slug: 'voir-la-fiche-d-un-membre',
      title: "Voir la fiche d'un membre",
      summary: "Ouvre la carte d'identité d'un membre et parcours l'annuaire du gang.",
      page: "/pages/compte/membre.html",
      steps: [
        { title: "Ouvre l'annuaire", text: "Ouvre la page Carte de membre (ta carte s'affiche). Plus bas, la section « Le gang » liste tous les membres par ordre alphabétique." },
        { title: "Clique sur un membre", text: "Chaque ligne affiche son avatar, son pseudo et « depuis » avec le mois et l'année d'arrivée. Clique pour ouvrir sa carte." },
        { title: "Lis sa carte", text: "La carte affiche son pseudo, sa date d'arrivée, son anniversaire s'il l'a partagé, ses badges et ses statistiques (Secret Santa, sorties, photos, moments)." },
        { title: "Écris-lui", text: "Sur la carte d'un autre membre, le bouton « Envoyer un message » ouvre directement la conversation privée." },
      ],
      tips: [
        "Le membre actuellement affiché est surligné dans la liste « Le gang ».",
        "La carte d'un membre n'est accessible qu'une fois connecté.",
      ],
      keywords: ["fiche", "membre", "carte", "annuaire", "gang", "profil", "identité", "qui"],
    },
    {
      slug: 'telecharger-sa-carte-d-identite',
      title: "Télécharger sa carte d'identité",
      summary: "Récupère ta carte de membre en image haute définition, à partager ou garder.",
      page: "/pages/compte/membre.html",
      steps: [
        { title: "Ouvre ta carte", text: "Depuis le menu, ouvre « Carte de membre » ou clique sur « Voir ma carte d'identité » dans la page Compte. Le titre affiché est « Ma carte »." },
        { title: "Passe la souris (facultatif)", text: "Sur ordinateur, déplace le pointeur sur la carte : elle s'incline et un reflet holographique suit la souris. Sur téléphone, cet effet est désactivé." },
        { title: "Clique sur « Télécharger la carte »", text: "Le bouton est sous la carte. Le libellé passe à « Préparation… » le temps de générer l'image." },
        { title: "Récupère le fichier", text: "Le navigateur télécharge un PNG de 2000 × 1260 px, au format carte bancaire, nommé « carte-hg-ton-pseudo-numéro.png »." },
      ],
      tips: [
        "Le numéro de membre à quatre chiffres figure en haut à droite de la carte.",
        "Ton avatar, ta couleur et tes badges sont repris sur la carte téléchargée.",
      ],
      keywords: ["carte", "identité", "télécharger", "png", "image", "badge", "numéro", "membre"],
    },
    {
      slug: 'gagner-des-badges',
      title: 'Gagner des badges',
      summary: "Découvre comment obtenir chaque badge du gang : les critères sont ceux du site.",
      page: "/pages/compte/membre.html",
      steps: [
        { title: "Ouvre tes badges", text: "Sur ta carte de membre, la section « Badges » liste ceux que tu as obtenus, avec la date d'obtention." },
        { title: "Participe au Secret Santa", text: "« Premier Noël » : une édition révélée ou terminée. « Vétéran » : {{badges.criteres.veteran_editions|5}} Secret Santa. « Liste parfaite » : au moins un souhait avant le tirage, un seul suffit. « Lutin express » : cadeau envoyé le premier de l'édition. « Sur le fil » : cadeau envoyé le dernier jour." },
        { title: "Viens aux sorties", text: "« Toujours là » : présent à {{badges.criteres.toujours_la_sorties|5}} sorties IRL. « Organisateur » : avoir créé une sortie. « Globe-trotter » : des sorties dans {{badges.criteres.globe_trotter_lieux|3}} lieux différents." },
        { title: "Partage et participe", text: "« Paparazzi » : {{badges.criteres.paparazzi_photos|50}} photos ajoutées aux albums. « Boîte à idées » : une idée retenue par l'admin. « Chasseur de bugs » : un bug signalé via l'assistance et traité." },
        { title: "Ancienneté et fidélité", text: "« Fidèle » : {{badges.criteres.fidele_annees|3}} ans dans le gang depuis la date d'arrivée. « Membre fondateur » : arrivé dès la première année du gang. « Ancienneté » : badge à niveaux, voir le tuto dédié. « Saisonnier » : connecté pendant les {{badges.criteres.saisonnier_themes|7}} thèmes." },
      ],
      tips: [
        "Les badges sont attribués automatiquement, environ une fois par heure : patiente un peu après avoir rempli le critère.",
        "« Cupidon du gang » est donné à celui qui a recruté un membre avec son code d'invitation.",
      ],
      keywords: ["badge", "badges", "critère", "obtenir", "gagner", "trophée", "récompense", "vétéran", "fidèle"],
    },
    {
      slug: 'monter-les-niveaux-d-anciennete',
      title: "Monter les niveaux de l'Ancienneté",
      summary: "Le badge Ancienneté grandit avec toi : un nouveau niveau à chaque palier d'années dans le gang.",
      page: "/pages/compte/membre.html",
      steps: [
        { title: "Repère le badge", text: "Sur ta carte de membre, cherche le badge « Ancienneté » dans la section « Badges »." },
        { title: "Lis ton niveau", text: "Le niveau actuel s'affiche sous le badge avec son nom ({{anciennete.noms_texte|Bronze, Argent, Or, Platine ou Diamant}}) et des pastilles de progression." },
        { title: "Connais les paliers", text: "{{anciennete.paliers_texte|Bronze à 1 an dans le gang, Argent à 2 ans, Or à 5 ans, Platine à 10 ans, Diamant à 20 ans}}." },
        { title: "Compte depuis ta date d'arrivée", text: "Les années se comptent depuis la date d'arrivée renseignée dans le gang, pas depuis la création de ton compte si elles diffèrent." },
      ],
      tips: [
        "Le niveau se met à jour tout seul : rien à faire, il suffit d'attendre le palier.",
        "Le nom du palier est indiqué à côté du badge, et le même badge reste affiché sur ta carte téléchargée.",
      ],
      keywords: ["ancienneté", "niveau", "niveaux", "bronze", "argent", "or", "platine", "diamant", "années", "palier"],
    },
    {
      slug: 'demander-de-l-aide',
      title: "Demander de l'aide",
      summary: "Envoie une demande à l'admin depuis la page Assistance, même sans compte.",
      page: "/pages/infos/assistance.html",
      steps: [
        { title: "Ouvre Assistance", text: "La page Assistance s\'ouvre depuis la page Aide et tutos (bouton « Contacter l\'assistance »), avec ou sans connexion." },
        { title: "Indique ton pseudo", text: "Connecté, ton pseudo est rempli tout seul. Sans compte, tape le pseudo que tu utilises dans le gang." },
        { title: "Choisis un sujet", text: "Dans la liste « Sujet » : {{support.sujets_texte|« Problème de compte / connexion », « Secret Santa », « Sortie IRL », « Bug sur le site », « Mes données personnelles » ou « Autre »}}." },
        { title: "Décris ton problème", text: "Dans « Message » ({{support.message_min_texte|10 caractères}} minimum), explique ce qui se passe, ce que tu as essayé et sur quelle page." },
        { title: "Indique ton pseudo Discord", text: "Champ « Ton pseudo Discord pour la réponse ». Obligatoire sans compte, facultatif connecté. Clique sur « Envoyer la demande »." },
      ],
      tips: [
        "Une fois connecté, la section « Mes demandes » en bas de page suit l'état de tes demandes : Ouverte, En cours ou Traitée, et les réponses.",
        "Pour ajouter une précision, envoie une nouvelle demande : il n'y a pas de réponse directe dans l'ancienne.",
      ],
      keywords: ["aide", "assistance", "support", "question", "problème", "demande", "contact", "admin"],
    },
    {
      slug: 'signaler-un-bug',
      title: 'Signaler un bug',
      summary: "Dis-nous ce qui ne marche pas, et gagne peut-être le badge « Chasseur de bugs ».",
      page: "/pages/infos/assistance.html",
      steps: [
        { title: "Ouvre le formulaire", text: "Depuis la page Aide et tutos, clique sur « Signaler un bug » : le sujet est déjà choisi." },
        { title: "Vérifie le sujet", text: "Dans la liste « Sujet », « Bug sur le site » doit être sélectionné." },
        { title: "Décris le bug", text: "Dans « Message », dis sur quelle page tu étais, ce que tu as fait et ce qui s'est passé. Un message précis se corrige plus vite." },
        { title: "Envoie", text: "Clique sur « Envoyer la demande ». L'écran confirme « Demande envoyée »." },
        { title: "Suis le traitement", text: "Connecté, la demande apparaît dans « Mes demandes » avec son statut. Une fois traitée, tu peux recevoir la réponse." },
      ],
      tips: [
        "Le badge « Chasseur de bugs » est donné quand un bug signalé ce sujet est traité par l'admin.",
        "Si le site ne se charge pas du tout, ajoute ton navigateur et ton appareil dans le message.",
      ],
      keywords: ["bug", "erreur", "bogue", "signaler", "plante", "cassé", "problème", "chasseur"],
    },
    {
      slug: 'proposer-une-idee',
      title: 'Proposer une idée',
      summary: "Une sortie, une fonctionnalité, un thème : envoie ton idée à l'admin depuis l'accueil.",
      page: "/pages/compte/accueil.html#idees",
      steps: [
        { title: "Ouvre l'accueil", text: "Fais défiler jusqu'au bloc « Une idée pour le gang ? » tout en bas de l'accueil." },
        { title: "Écris ton idée", text: "Dans « Ton idée », décris ta proposition : une sortie, une fonctionnalité du site, un thème… 2000 caractères maximum." },
        { title: "Envoie", text: "Clique sur « Envoyer l'idée ». Un message confirme que ton idée a été transmise à l'admin." },
      ],
      tips: [
        "Seul l'admin lit les idées, pas les autres membres.",
        "Si l'admin retient ton idée, tu gagnes le badge « Boîte à idées ».",
      ],
      keywords: ["idée", "idées", "proposer", "suggestion", "boîte", "fonctionnalité", "sortie", "thème"],
    },
    {
      slug: 'calendrier-du-gang',
      title: 'Suivre le calendrier du gang',
      summary: "Toutes les sorties, séances ciné, rendez-vous des groupes et anniversaires sur un seul mois, et dans ton agenda.",
      page: "/pages/irl/calendrier.html",
      steps: [
        { title: "Ouvre Calendrier", text: "Depuis le menu, ouvre la page Calendrier. Chaque jour porte des pastilles de couleur : sable pour les sorties IRL, vert pour les soirées, prune pour le ciné, bleu pour les groupes, rose pour les anniversaires, rouille pour le site." },
        { title: "Choisis un jour", text: "Touche un jour : la liste de ses rendez-vous s'affiche dessous, avec un bouton « Ouvrir » vers la sortie, la séance ou la page concernée." },
        { title: "Filtre", text: "Les boutons en haut masquent ou affichent un type de rendez-vous. Ton choix est gardé sur cet appareil." },
        { title: "Ajoute un rendez-vous récurrent", text: "« Rendez-vous récurrent » crée par exemple « Campagne CK3 chaque jeudi à 20 h ». Tu peux le modifier, le retirer ou annuler une seule date depuis la liste du jour." },
        { title: "Abonne-toi dans ton agenda", text: "« S'abonner dans mon agenda » donne ton adresse personnelle à coller dans Google Agenda ou Calendrier : les rendez-vous du gang s'y ajoutent et se mettent à jour tout seuls." },
      ],
      tips: [
        "Ton adresse d'abonnement est personnelle. Si tu l'as partagée par erreur, crée-en une nouvelle depuis la même fenêtre : l'ancienne cesse de fonctionner.",
        "Les anniversaires n'apparaissent que pour les membres qui partagent leur date, jamais avec l'année.",
      ],
      keywords: ["calendrier", "agenda", "ics", "abonnement", "rendez-vous", "récurrent", "ck3", "soirée", "anniversaire", "mois"],
    },
    {
      slug: 'cine-club',
      title: 'Participer au ciné-club',
      summary: "Propose des films, vote pour la séance du dimanche, puis note le film vu.",
      page: "/pages/irl/cine.html",
      steps: [
        { title: "Ouvre Ciné-club", text: "Depuis le menu, ouvre la page Ciné-club. En haut, la prochaine séance : le vote en cours ou le film choisi." },
        { title: "Vote", text: "Clique sur « Voter » sous le film de ton choix. Tu peux changer d'avis jusqu'à la clôture. S'il y a trop peu de votants, la séance est reportée d'une semaine." },
        { title: "Dis si tu viens", text: "« Je serai là » ajoute ton nom à la liste des présents ; le bouton « Salon vocal » ouvre le salon Discord de la séance." },
        { title: "Propose un film", text: "« Proposer un film » l'ajoute à la liste d'attente (titre, année, une phrase pour donner envie). Le « + » aide le projectionniste à choisir les prochains films en lice." },
        { title: "Note après la séance", text: "Dans « Films vus », « Noter » ouvre ta note (1 à 5 étoiles) et un avis court. Coche « Contient un spoiler » pour flouter ton texte. Et si le livre est mieux, dis-le !" },
      ],
      tips: [
        "Le lien de la séance est toujours un salon Discord : jamais de lien de visionnage.",
        "Tu peux avoir 5 films en attente à la fois.",
      ],
      keywords: ["ciné", "cinéma", "film", "vote", "séance", "dimanche", "projectionniste", "avis", "note", "livre"],
    },
    {
      slug: 'commandes-discord',
      title: 'Utiliser les commandes Discord',
      summary: "Consulte ton solde, une carte, la prochaine sortie ou une question du gang sans ouvrir le site.",
      page: "/pages/compte/compte.html",
      steps: [
        { title: "Fais enregistrer ton ID Discord", text: "Les commandes te reconnaissent grâce à ton identifiant Discord, que seul le Staff enregistre. Vérifie sur la page Mon compte qu'il est bien rempli ; sinon, demande-le via l'assistance." },
        { title: "Tape / dans un salon", text: "Sur le serveur du gang, tape / puis choisis /paillettes, /carte, /sortie ou /quiz dans la liste du bot." },
        { title: "Lis la réponse", text: "Les réponses personnelles ne sont visibles que de toi (« Seul·e toi peux voir ce message »). /sortie public:True montre la prochaine sortie à tout le salon." },
        { title: "Réponds avec les boutons", text: "/sortie propose J'y vais / Peut-être / Non ; /quiz propose les réponses. Ce sont les mêmes règles et les mêmes gains que sur le site, avec une seule tentative au quiz." },
      ],
      tips: [
        "Pour /carte, commence à taper le nom : la liste se complète toute seule.",
      ],
      keywords: ["discord", "commande", "slash", "bot", "paillettes", "carte", "sortie", "quiz", "solde"],
    },
    {
      slug: 'challenge-de-la-semaine',
      title: 'Challenge de la semaine',
      summary: "Envoie ta participation au thème de la semaine, puis vote pour ta préférée parmi celles des autres.",
      page: "/pages/compte/challenge.html",
      steps: [
        { title: "Ouvre le challenge", text: "Depuis la carte « Challenge de la semaine » de l'accueil, ou le menu Autres. Tu y lis le nom, les consignes (« Comment »), le « Pourquoi » et le gain du gagnant." },
        { title: "Envoie ta participation", text: "Pendant la participation, choisis le fichier demandé (image, vidéo, son, PDF ou texte selon le challenge, 25 Mo au plus), ajoute une légende si tu veux, puis clique sur « Envoyer ma participation ». Les images sont compressées avant l'envoi." },
        { title: "Change d'avis si besoin", text: "Tant que la participation est ouverte, « Retirer » dans « Mes participations » supprime la tienne : tu peux en envoyer une autre. Les participations des autres restent cachées jusqu'au vote." },
        { title: "Vote", text: "À la fin de la participation, le vote s'ouvre pour les participants : les participations sont anonymes et mélangées. Clique sur « Voter » sous ta préférée ; tu peux changer ta voix jusqu'à la fin, jamais voter pour la tienne." },
        { title: "Découvre le résultat", text: "À la fin du vote, les pseudos et les voix s'affichent. La participation la plus votée gagne et reçoit les Paillettes automatiquement ; en cas d'égalité, chaque gagnant reçoit le gain complet." },
      ],
      tips: [
        "Seuls les membres qui ont participé votent : les autres regardent les participations sans voter.",
        "Tu reçois une notification à l'ouverture du vote et au résultat (réglable dans Mon compte › Mes notifications).",
      ],
      keywords: ["challenge", "semaine", "concours", "participation", "vote", "voter", "gagnant", "photo", "paillettes"],
    },
  ],
};
