# Humane Gang

Le site du Humane Gang : le QG du groupe pour le Secret Santa, les sorties IRL, les souvenirs, la messagerie, le jeu de cartes à collectionner (avec son Arène) et les jeux du gang.

- **En ligne** : https://humane-gang.com/
- **Auteur et administrateur** : Domursan
- **Plan du site** : [PLAN-DU-SITE.md](PLAN-DU-SITE.md)
- **Plan du dépôt** (où est quoi, où ranger un fichier) : [PLAN-DU-DEPOT.md](PLAN-DU-DEPOT.md)

---

## Ce que fait le site

| Espace | Pour qui | En bref |
| --- | --- | --- |
| Accueil | Membres | Fil d'activité, défis du gang, quêtes de la semaine, question du jour |
| Secret Santa | Membres | Inscription, tirage, carte de la cible, liste de souhaits, messages secrets |
| Sorties IRL | Membres | Propositions de sorties, sondages de date, réponses, carte des lieux |
| Historique | Membres | Frise des rencontres passées, éditions du Secret Santa, albums photo |
| Messages | Membres | Messagerie privée entre membres (et avec son Santa, anonymement) |
| Jeu de cartes | Membres | Boosters, collection, échanges, fabrication, drops, classement, Arène |
| Jeux | Membres | Missions quotidiennes, jeux quotidiens (GeoGuessr, « Qui a dit ça ? », question du jour, Sutom, Framed, Heardle…), jeux flash (Arcade) |
| Événements | Membres | Images à attraper qui traversent le site pendant un événement |
| Calendrier et ciné | Membres | Calendrier du gang, séances du ciné-club, playlist |
| Compte | Membres | Profil, infos personnelles, notifications, badges, export et suppression des données |
| Aide et tutos | Tous | Tutos illustrés, accès à l'assistance |
| Administration | Admin et Staff | Gestion complète du site, sans toucher au code |

Un bot Discord prévient les membres (MP et annonces) : tirage, sorties, anniversaires, échanges, belles cartes, etc.

---

## Comment c'est construit

- **Front-end** : HTML, CSS et JavaScript « vanilla » (modules ES), sans framework. Une seule étape de build : `outils/build/construire.mjs` (esbuild) assemble `site/` dans `_site/`, qui est ce que GitHub Pages publie. Chaque page HTML charge son script `assets/espaces/<espace>/<page>.js` (par exemple `assets/espaces/irl/historique.js`, via `site-boot.js`).
- **Hébergement** : GitHub Pages, branche `main`.
- **Back-end** : Supabase (base Postgres, authentification, stockage de fichiers, temps réel).
  - Les règles d'accès sont dans la base (RLS) : le navigateur n'a que la clé publique.
  - Les règles métier sensibles (tirage, ouverture de boosters, échanges, badges, Arène…) sont des fonctions SQL `hg_*`.
- **Fonctions edge** (Deno, sur Supabase) : le bot Discord et les tâches programmées (`supabase/functions/`).
- **Tâches programmées** (pg_cron) : badges, récompenses de présence du jeu de cartes, défis du gang, expiration des offres d’échange et alertes du tableau (toutes les heures), anniversaires (8 h, heure suisse), rappels et tâches de fond toutes les 5 minutes.
- **Application installable** : `manifest.webmanifest` et le service worker `sw.js` (cache hors ligne, notifications push).

---

## Menus et pages

### Barre de menus

| Menu | Contenu (fichier) |
| --- | --- |
| Le jeu de cartes | `pages/cartes/cartes.html` : Ouverture, Inventaire, Boutique, Mes cartes, Classement, Échanges, Arène |
| IRL | `pages/irl/secret-santa.html`, `pages/irl/irl.html`, `pages/irl/historique.html` |
| Jeux | `pages/jeux/jeux.html` : Missions quotidiennes, puis les jeux quotidiens (une partie par jour : GeoGuessr, Qui a dit ça ?, Question du jour, Sutom HG, Framed, Heardle…), puis les jeux flash à volonté (Arcade : Paillettes, Raclette, Domu-mobile…) |
| Calendrier | `pages/irl/calendrier.html` |
| Autres | Les pages du menu qui ne sont rangées nulle part ailleurs (liste venant de la base) |

Un lien n'apparaît que si le membre a accès à la page, et un menu vide disparaît. Les libellés se règlent dans Administration › Site › Menu et pied de page ; les pages accessibles dans Administration › Membres › Accès aux pages.

### Menu en arc (photo de profil)

Un clic sur la photo ouvre un quart de cercle d'icônes :
- rangée proche : Messages (`pages/compte/messages.html`), Recherche (Ctrl ou Cmd + K), Mon compte (`pages/compte/compte.html`) ;
- rangée extérieure : Aide et tutos (`pages/infos/aide.html`), Affichage (préférences), Sans limite (administrateur seul), Admin ou Staff (`pages/admin/admin.html`), Déconnexion.

### Pages principales

| Page | Rôle |
| --- | --- |
| `index.html` | Intro animée au défilement, une fois par jour, puis redirection vers l'accueil |
| `pages/infos/rejoindre.html` | Ouverture d'un lien d'invitation |
| `pages/compte/compte.html` | Connexion, inscription, profil, notifications, export et suppression des données |
| `pages/compte/accueil.html` | Accueil des membres |
| `pages/irl/secret-santa.html` | Secret Santa de l'édition en cours |
| `pages/irl/irl.html` | Sorties IRL : prochaine sortie, dates à caler, sorties passées, carte des lieux |
| `pages/irl/historique.html` | Frise des années, éditions passées du Secret Santa, albums photo |
| `pages/irl/recap.html` | Récap de l'année, du membre et du gang |
| `pages/compte/messages.html` | Conversations privées |
| `pages/cartes/cartes.html` | Jeu de cartes : boosters, collection, classement, échanges, Arène, drops |
| `pages/jeux/jeux.html` | Les jeux du gang, un onglet par jeu (`pages/jeux/jeux.html#<jeu>`) |
| `pages/irl/calendrier.html` | Calendrier du gang |
| `pages/irl/cine.html` | Ciné-club : vote de la séance du dimanche |
| `pages/irl/citations.html` | Mur des citations |
| `pages/irl/playlist.html` | Playlist du gang |
| `pages/jeux/quiz.html` | Questions du gang |
| `pages/irl/evenements.html` | Événements à thème (images à attraper) et classement des chasseurs |
| `pages/compte/membre.html` | Carte de membre d'un joueur |
| `pages/cartes/collection-a4.html` | Planche imprimable d'une collection (paramètres dans l'adresse) |
| `pages/jeux/secret.html` | Le carnet des secrets (page cachée, hors menu) |
| `pages/infos/aide.html` | Aide et tutos |
| `pages/infos/assistance.html` | Formulaire d'aide (bug, question, idée) et suivi des demandes |
| `pages/infos/legal.html` | Mentions légales, confidentialité, cookies |
| `pages/admin/admin.html` | Administration (voir plus bas) |
| `offline.html`, `404.html` | Page hors connexion, page introuvable |
| `pages/jeux/simulateur.html` | Simulateur de téléphone, outil de développement (non publié) |
| `affiches/` | Affiches A3 imprimables : badges, Paillettes, cartes, boosters |

---

## Administration

Tout se règle depuis **Administration** (`pages/admin/admin.html`), sans toucher au code. L'adresse d'une section est `pages/admin/admin.html#domaine/sous-section`.

### Le plateau et les sept lieux

L'accueil du panel est le **plateau** (`#plateau`) : une carte par lieu permis à la personne. Chaque lieu regroupe des sous-sections, et ses pastilles indiquent ce qui est à traiter.

| Lieu (adresse) | Sous-sections principales |
| --- | --- |
| **La Place du gang** (`#place`) | Membres (comptes, rôles, champs du profil, vie sociale), Relances, Entraide, Accès aux pages, Badges |
| **La Poste** (`#poste`) | Assistance, Modèles de réponse, Boîte à idées, Messagerie, Fil d'activité, Bot Discord, Commandes slash |
| **La Salle des ventes** (`#ventes`) | Enchères, Échanges entre membres |
| **Le Camp IRL** (`#camp`) | Membres IRL, Sorties IRL, Souvenirs et photos, Secret Santa |
| **La Fabrique de cartes** (`#fabrique`) | Gestion globale, Arène (`#fabrique/arene`), Catalogue, Joueurs, Statistiques, Économie, Quêtes, Défis, Drops, Atelier |
| **La Fête foraine** (`#fete`) | Événements à thème, Calendrier et cinéma, Avent, Worlds, Anniversaire, Jeux (questions, Sutom, GeoGuessr, citations, Arcade, Secrets, Mes jeux) |
| **La Mairie** (`#mairie`) | Planning, Journal, Staff, Le site (identité, textes, menu, thème), Technique (état du site, erreurs, archives, clés avancées) |

Une sous-section sans droit n'est ni affichée ni ouverte. Une touche Ctrl/Cmd + K ouvre la palette « Tout le panel ». Les données se mettent à jour en direct, sauf pendant une saisie (un bandeau « Actualiser » apparaît). Détail complet (sections, adresses, anciennes adresses) : `docs/ADMIN-PANEL.md`.

### Rôles et droits

- **Administrateur** : tous les droits. Réservé à l'administrateur, non délégable : promotion d'un administrateur, gestion du Staff, mode sans limite, journal des lectures de messages, adresses e-mail.
- **Staff** : une liste de permissions parmi les 15 du catalogue (`membres`, `evenements`, `souvenirs`, `secret_santa`, `cartes`, `badges`, `themes`, `messages`, `support`, `bot`, `reglages`, `journal`, `quiz`, `preuves`, `mj`). Détail dans `docs/ADMIN-PANEL.md`.
- **Rôles** (Membres › Comptes › Rôles) : un rôle prérègle l'accès à des pages pour les membres qui le portent. Un réglage fait à la main sur une page l'emporte toujours sur le rôle.

### Voir le site comme un membre

Depuis la fiche d'un membre (Membres › Comptes), **Voir le site comme…** ouvre le site avec les menus et les pages de ce membre, sous un bandeau « Revenir au panel ». Admin, Staff et mode sans limite sont masqués dans cette vue. Les données affichées restent celles de l'administrateur.

### Arène v2 (aperçu admin)

Jeu de cartes › **Arène** (`pages/cartes/cartes.html#arene` pour le site, `pages/admin/admin.html#fabrique/arene` pour le panel, lieu La Fabrique de cartes › Arène) contient deux blocs :
- l'**Arène actuelle**, ouverte aux membres, avec ses gains et plafonds ;
- l'**Arène v2**, visible des seuls administrateurs : réglages, aperçu du classement, saisons passées, clôture de saison. Elle ne s'ouvre aux membres que si le réglage `arena.v2_public` est activé. Règles et chiffres : `docs/ARENE.md`.

---

## Arborescence

Seul `site/` est publié (voir [docs/PUBLICATION.md](docs/PUBLICATION.md)) ; le reste du dépôt ne sort pas du GitHub.

```
.
├── site/                   Le site publié (GitHub Pages)
│   ├── index.html          Intro d'entrée (redirige vers l'accueil)
│   ├── 404.html, offline.html   Pages d'erreur et hors connexion
│   ├── pages/              Une page = un fichier, rangé par catégorie
│   │   ├── admin/          Panel d'administration (admin.html)
│   │   ├── cartes/        Jeu de cartes (cartes.html, collection-a4.html)
│   │   ├── compte/         Compte et messages (accueil, compte, membre, messages)
│   │   ├── infos/          Aide, assistance, légal, rejoindre
│   │   ├── irl/            Sorties et événements (irl, calendrier, cine, secret-santa…)
│   │   └── jeux/           Les jeux (jeux.html, un fichier par jeu)
│   ├── affiches/           Affiches A3 imprimables (badges, Paillettes, cartes, boosters)
│   ├── assets/
│   │   ├── commun/         Socle partagé : core/ (session, en-tête, pied de page, thème), base.css, config.js (URL et clé publique Supabase)
│   │   ├── espaces/        Scripts et styles de chaque page, par catégorie (admin/, irl/, jeux/…)
│   │   ├── cartes/         Images des cartes, par série (adresse publique « /assets/cartes/… », chemins enregistrés en base)
│   │   ├── images/         Logo, favicon, visuels
│   │   └── vendor/         Bibliothèques tierces
│   ├── sw.js               Service worker (cache hors ligne, notifications push)
│   ├── manifest.webmanifest   Application installable
│   └── CNAME               Nom de domaine (humane-gang.com)
├── outils/                 Outils de développement : build du site (build/construire.mjs), images, SQL, nj
├── impression/             Documents à imprimer qui ne sont pas publiés (solutions des secrets)
├── supabase/
│   ├── migrations/         Historique du schéma (numérotées, appliquées dans l'ordre)
│   ├── schema/             Schéma reconstitué de la base (source de vérité)
│   ├── seed/               Données initiales (dictionnaire du Sutom)
│   ├── functions/          Fonctions edge (bot Discord, tâches programmées) + _shared/
│   └── ADMIN.md            Administrateur de secours
├── docs/                   Documentation (voir la liste plus bas) et captures de recette (docs/captures/qa)
├── tests/                  Tests automatiques (Playwright), faux Supabase, bancs SQL (bancs/) et contrôles (controles/)
└── .github/workflows/      Intégration continue et publication du site (publier-site.yml)
```

Les adresses publiques des pages suivent la catégorie (`humane-gang.com/pages/cartes/cartes.html`, etc.). Les images des cartes sont enregistrées en base avec des chemins absolus (`/assets/cartes/…`) : ne pas déplacer `site/assets/cartes/` sans mettre la base à jour.

---

## Travailler sur le site

### Voir le site en local
Le site est statique : n'importe quel petit serveur suffit, depuis la racine du dépôt.
```
npx serve .          # ou : python3 -m http.server 8000
```
Puis ouvrir l'adresse indiquée (par exemple http://localhost:3000 ou :8000). Le site se connecte à la vraie base Supabase.

### Ajouter ou modifier une page
1. Copier une page existante (par exemple `pages/irl/historique.html`) et changer le titre et le script chargé.
2. Le script commence toujours par :
   ```js
   import { sb, initPage } from './core.js';
   const me = await initPage({ auth: 'member' }); // 'member', 'admin' ou 'optional'
   ```
   L'en-tête, le pied de page, le thème et la vérification de connexion sont alors automatiques.
3. Toujours passer les textes venant de la base par `esc()` avant de les insérer dans le HTML.
4. Ajouter les nouveaux fichiers JS et CSS à la liste `PRECACHE` de `sw.js`.
5. Un menu ou un lien de page se règle ensuite dans le panel (Menu et pied de page, Accès aux pages).

### Mettre en ligne une nouvelle version
1. Incrémenter `CACHE_VERSION` dans `site/sw.js` à chaque changement de JS ou CSS du site ; la publication l'incrémente aussi dans sa copie (`outils/build/construire.mjs`). Règle unique, la même que dans `PLAN-DU-DEPOT.md`. Sans ça, les membres gardent l'ancienne version en cache.
2. Lancer les vérifications et les tests (voir plus bas).
3. Pousser sur `main` : le workflow `publier-site.yml` construit `_site/` à partir de `site/` puis publie `_site/` sur GitHub Pages en une à deux minutes. Détails : [docs/PUBLICATION.md](docs/PUBLICATION.md).

### Modifier la base de données
- Le **numéro le plus haut** actuellement présent est `166_plateaux_droits_internes.sql`. Une nouvelle migration prend le numéro suivant (`167_…`), dans `supabase/migrations/`.
- Quelles migrations sont appliquées en production, et les trous de numérotation : [supabase/migrations/README.md](supabase/migrations/README.md). Le schéma réel de référence : `supabase/schema/`.
- L'appliquer sur Supabase (éditeur SQL ou CLI), puis le committer.
- Ne jamais modifier une migration déjà appliquée : en écrire une nouvelle.

### Fonctions edge et bot Discord
- Déployer une fonction edge : [supabase/functions/DEPLOY.md](supabase/functions/DEPLOY.md). Chaque fonction doit être envoyée **avec** les fichiers de `_shared/` qu'elle importe.
- Créer ou régler le bot : [docs/BOT.md](docs/BOT.md).

---

## Tests

Les tests utilisent Playwright et un faux Supabase : aucune donnée réelle n'est touchée.
```
cd tests
npm install
npm run check        # vérification syntaxique des JS et des règles de publication
npm run test:rpc     # chaque fonction et table appelée existe dans le schéma ou les migrations
npm run test:smoke   # toutes les pages s'ouvrent sans erreur
npm test             # suite complète des parcours
```
Un seul parcours se lance avec `node <chemin>` depuis `tests/` (par exemple `node parcours/admin/parcours-admin-nav.cjs`). Le détail de chaque test est dans [tests/README.md](tests/README.md). La première fois, Chromium s'installe avec `npx playwright install chromium`.

Les bancs SQL (PostgreSQL local, sans navigateur) sont dans `tests/bancs/` ; le banc des cartes est décrit dans [tests/bancs/cartes/README.md](tests/bancs/cartes/README.md).

---

## Documentation

| Document | Contenu |
| --- | --- |
| [PLAN-DU-SITE.md](PLAN-DU-SITE.md) | Plan du site : pages, accès, tâches de fond |
| [PLAN-DU-DEPOT.md](PLAN-DU-DEPOT.md) | Plan du dépôt : arborescence commentée, où ranger un nouveau fichier, workflows |
| [docs/ADMIN-PANEL.md](docs/ADMIN-PANEL.md) | Organisation du panel, permissions Staff, ajouter une permission ou une sous-section |
| [docs/ARENE.md](docs/ARENE.md) | Règles et chiffres de l'Arène v2 |
| [docs/SECURITE.md](docs/SECURITE.md) | Audit de sécurité (constats, migration 105, décisions à prendre) |
| [docs/PUBLICATION.md](docs/PUBLICATION.md) | Publication GitHub Pages (dossier site/ uniquement) |
| [docs/BOT.md](docs/BOT.md) | Installation et fonctionnement du bot Discord |
| [docs/SPEC.md](docs/SPEC.md) | Spécification de construction des pages (pour les agents) |
| [supabase/ADMIN.md](supabase/ADMIN.md) | Retrouver l'accès administrateur |
| [supabase/migrations/README.md](supabase/migrations/README.md) | Historique des migrations et leur état |
| [supabase/functions/DEPLOY.md](supabase/functions/DEPLOY.md) | Déploiement des fonctions edge |
| [tests/README.md](tests/README.md) | Tests et leur lancement |

---

## Sécurité et vie privée

- Aucune clé secrète dans le dépôt : seules l'URL et la clé publique Supabase sont dans `site/assets/commun/config.js`.
- Les secrets (jeton du bot Discord, secret des tâches programmées) sont stockés côté Supabase uniquement.
- Les données personnelles sont protégées par les règles d'accès de la base ; chaque membre peut exporter ou supprimer ses données depuis son compte.
- Mentions légales, confidentialité et cookies : `pages/infos/legal.html`. Audit de sécurité : `docs/SECURITE.md`.

---

© Domursan — Humane Gang. Tous droits réservés.
