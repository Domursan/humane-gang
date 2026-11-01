# Plan du dépôt — Humane Gang

Où est quoi dans le dépôt, à quoi sert chaque dossier, et où ranger un nouveau fichier.
Version : <!-- plan:derniere -->état du dépôt au 1er novembre 2026 (dernière migration : 196)<!-- /plan:derniere -->.
Migrations numérotées de <!-- plan:plage -->001 à 196<!-- /plan:plage --> (quelques numéros manquent ou sont en double : voir `supabase/migrations/README.md`).

Pour les pages du site (adresses, rôles, accès), voir [PLAN-DU-SITE.md](PLAN-DU-SITE.md). Le README décrit le fonctionnement du site ; ce document décrit seulement l'arborescence.

## Arborescence commentée

```
human-gang/
├── README.md              Présentation, mise en route, liste des documents
├── PLAN-DU-SITE.md        Toutes les pages, leurs accès, leur code, les ancres #…
├── PLAN-DU-DEPOT.md       Ce document
├── .gitignore             Fichiers non suivis : node_modules/, tests/shots/, shots/, qa/
├── .github/workflows/     Automatisations GitHub (voir la section dédiée)
│
├── site/                  Tout le site publié (GitHub Pages, domaine humane-gang.com)
│   ├── index.html         Accueil du site = intro animée, qui redirige ensuite
│   ├── 404.html           Redirige les anciennes adresses ; sinon page introuvable + mini-jeux
│   ├── offline.html       Page affichée hors connexion
│   ├── sw.js              Service worker : cache hors ligne, liste PRECACHE, CACHE_VERSION
│   ├── manifest.webmanifest  Fiche de l'application installable
│   ├── CNAME              Nom de domaine
│   │                      (la publication GitHub Pages doit viser ce dossier site/ : docs/PUBLICATION.md
│   │                      décrit la publication de site/ ; la construction de _site/ est dans outils/build)
│   │
│   ├── pages/             Une page = un fichier HTML, rangé par catégorie
│   │   ├── admin/        admin.html (panel d'administration)
│   │   ├── cartes/       cartes.html (jeu de cartes), collection-a4.html (planche imprimable)
│   │   ├── compte/       compte, membre, accueil, messages, notifications
│   │   ├── infos/        aide, assistance, legal, rejoindre
│   │   ├── irl/          irl, calendrier, cine, citations, evenements, historique, playlist, recap, secret-santa
│   │   └── jeux/         jeux (page des onglets), quiz, duels, uno, loup-garou, nom-de-code,
│   │                     les jeux de plateau (blackjack, catan, cluedo, destins, monopoly, pictionary,
│   │                     poker, risk, shadow-hunters), secret, simulateur
│   │
│   ├── affiches/          Affiches A3 imprimables (publiées) : index.html, badges, cartes, boosters, gamme,
│   │                      jeux, paillettes, secrets. affiche.css, affiches.js, gamme.js. img/ : images des affiches.
│   │
│   └── assets/            Ressources chargées par les pages (toujours en chemin absolu : /assets/…)
│       ├── commun/        Code partagé par tout le site (voir ci-dessous)
│       ├── espaces/       Code d'un espace fonctionnel, un dossier par espace (voir la liste ci-dessous)
│       ├── images/        Images du site : framed/ (images des tutos), jeux/, loup-garou/ (rôles, thèmes),
│       │                  marque/ (logo, favicon, icônes), plateaux/ (plateaux des jeux de plateau)
│       ├── cartes/        Images des cartes, un dossier par série (abysses, arcade, chateaux, gang-*, suisse…, 63 séries)
│       └── vendor/        Bibliothèques servies localement : supabase-js, qrcode-generator (voir son README.md)
│
├── supabase/              Base de données et fonctions serveur (Supabase)
│   ├── migrations/        Migrations SQL numérotées : historique du schéma ; README.md : état et doublons
│   ├── appliquer.txt      Liste des migrations à appliquer (une par ligne)
│   ├── appliquees.txt     Journal : ce qui a été appliqué, et le résultat (ok ou erreur)
│   ├── schema/            Schéma reconstitué (schema_reel_2026-10-21b.sql, daté du 21/10) + README.md (comment le régénérer)
│   ├── seed/              Données de départ, dont sutom-dict (dictionnaire du Sutom)
│   ├── functions/         Fonctions edge : hg-* (une par dossier), _shared/ (code commun),
│   │                      a-deployer.txt (fonctions à déployer), DEPLOY.md (déploiement)
│   └── ADMIN.md           Administrateur de secours
│
├── tests/                 Tests automatiques (Playwright) et faux Supabase : rien n'atteint la vraie base
│   ├── README.md          Comment lancer les tests
│   ├── package.json       Scripts npm (check, test, test:a11y, test:perf…) et dépendances
│   ├── run-all.cjs        Lance toute la suite ; ci-resume.cjs : résumé pour la CI
│   ├── parcours/          Tests de parcours (un parcours = un fichier), par catégorie : admin/ cartes/ compte/ infos/ irl/ jeux/
│   ├── unitaires/         Tests de fonctions isolées (arcade, calendrier, Discord, notifications, archive)
│   ├── controles/        Vérifications : syntaxe JS, RPC et tables, publication, accessibilité, budget de performance,
│   │                      vendor, composants du panel
│   ├── bancs/             Bancs SQL et UI : économie des cartes (cartes), jeux (duels, jeux, loup-garou, nom-de-code,
│   │                      plateaux, uno) : règles et simulations, sur une base PostgreSQL locale (voir cartes/README.md)
│   ├── fixtures/         Faux Supabase et faux modules utilisés par les tests
│   ├── lib/               Outils communs aux tests (harness.cjs, faux-canevas.mjs)
│   └── shots/             Captures produites par les tests (non suivies par git)
│
├── docs/                  Documentation technique
│   ├── ADMIN-PANEL.md     Organisation du panel, permissions Staff, ajouter une section
│   ├── ARENE.md           Règles et chiffres de l'Arène v2
│   ├── BOT.md             Installation et fonctionnement du bot Discord
│   ├── LOUP-GAROU.md      Règles et fonctionnement du Loup-Garou
│   ├── PUBLICATION.md     Ce qui est publié par GitHub Pages et ce qui ne l'est pas
│   ├── SAUVEGARDE.md      Sauvegarde chiffrée de la base : secrets, téléchargement, restauration
│   ├── SECURITE.md        Audit de sécurité (constats, décisions à prendre)
│   ├── SPEC.md            Spécification d'origine (document historique)
│   └── captures/qa/       Captures de recette, par chantier (p2-communication, p2-comptes, p2-pilotage)
│
├── outils/                Scripts et données utilisés par les workflows ou à la main (non publiés)
│   ├── build/             construire.mjs : construit _site/ à partir de site/ (JS et CSS regroupés, PRECACHE réécrit) ; package.json (esbuild)
│   ├── appliquer-sql.mjs  Applique les migrations listées dans supabase/appliquer.txt (workflow appliquer-sql) ; maintenance à la demande (-- hg:maintenance)
│   ├── plan-depot.mjs     Met à jour les parties factuelles de ce document (entre marqueurs <!-- plan:… -->) ; appelé par appliquer-sql
│   ├── images/            importer.mjs + a-importer.json (images à importer), rapport.json, maquettes/
│   └── nj/                Générateurs et réserves de mots pour les jeux nj-* (mots croisés, silhouettes, réserves JSON)
│
├── impression/            Supports à imprimer, non publiés : secrets-solutions-a3.html (solutions des secrets)
└── .claude/              Configuration locale de Claude Code (ne pas modifier à la main)
```

## Le dossier `site/assets/commun/` (code partagé)

Code utilisé par toutes les pages. Principaux fichiers : `base.css` (styles de base), `config.js` (adresse et clé publique Supabase), `core/` (socle : en-tête, pied de page, menu, thème, session, profil, recherche, raccourcis, présence, notifications), `core.js` (point d'entrée du socle), `site-boot.js` et `theme-boot.js` (démarrage), `offline-store.js` et `offline.css` (hors ligne), `push.js` (notifications push), `reactions.js`, `report.js` (signalement), `ui-confirm.js` (fenêtres de confirmation), `sound.js`, `icons.js`, `utils.js`, `paillettes.js`, `tour.css` (visite guidée), `leaflet-load.js` (carte).

## Les espaces (`site/assets/espaces/`)

Un espace = un dossier = une fonctionnalité du site. Chaque espace a sa page (ou ses pages) dans `site/pages/`. Le détail des pages et de leurs accès est dans PLAN-DU-SITE.md.

| Espace | Contenu | Fichiers principaux |
| --- | --- | --- |
| `accueil/` | Accueil du membre, intro quotidienne du site, calendrier de l'Avent, anniversaires, saisons, sondages, quêtes | `accueil.js`, `accueil.css`, `intro.js`, `intro-redirect.js`, `avent.js`, `anniv.js`, `saisons.js`, `polls.js`, `quest-proofs.js` |
| `admin/` | Panel d'administration : coquille, navigation, une section par fichier | `admin.js`, `shell.js`, `router.js`, `state.js`, `perms.js`, `admin-*.js` et `admin-*.css` ; sous-dossiers `cartes/`, `comptes/`, `reglages/`, `sorties/`, `souvenirs/`, `ui/` (composants partagés : liste, tiroir, fil, dates) |
| `arcade/` | Mini-jeux de la page 404 et de l'Arcade (Paillettes, Raclette, Domu-mobile, Snake, Tetris…), easter eggs | `jeu404.js`, `jeu-paillettes.js`, `jeu-raclette.js`, `jeu-domu.js`, `core.js`, `api.js`, `eggs.css` |
| `cartes/` | Jeu de cartes à collectionner : ouverture, boutiques, inventaire, échanges, classement, Arène, drops, collection imprimable | `cartes.js`, `cartes.css`, `cartes-*.js`, `booster-*.js`, `card-drops.js`, `collection-a4.js` |
| `compte/` | Mon compte, carte de membre, amitié, profil gaming, badges, préférences de notification | `compte.js`, `membre.js`, `social.js`, `friendship.js`, `profil-gaming.js`, `notif-prefs.js`, `notifications.js`, `badge-levels.js` |
| `duels/` | Duels à deux : bataille, dames, échecs, morpion, Puissance 4, Othello, Mastermind, pierre-feuille-ciseaux, Qui est-ce ? | `duels.js`, `api.js`, `vues/` (un écran par fichier), un `.css` par jeu |
| `infos/` | Aide et tutos, assistance, mentions légales, page d'invitation | `aide.js`, `assistance.js`, `legal.js`, `rejoindre.js`, `support-files.js`, `tutos/` |
| `irl/` | Sorties IRL, calendrier et export ICS, ciné-club, citations, événements, historique, playlist, récap, Secret Santa | `irl.js`, `calendrier.js`, `ics.js`, `cine.js`, `citations.js`, `evenements.js`, `historique.js`, `playlist.js`, `recap.js`, `secret-santa.js`, `ss-*.js` |
| `jeux/` | Page Jeux (onglets), question du jour, GeoGuessr, Qui a dit ça ?, Sutom, Framed, Heardle, jeux nj-* (2048, anagramme, sudoku, mots croisés…), simulateur | `jeux.js`, `onglets.js` (liste des onglets), `commun.js`, `jour.js`, `geo.js`, `citations.js`, `sutom.js`, `framed.js`, `heardle.js`, `nj-*.js`, `donnees/` |
| `loup-garou/` | Loup-Garou multijoueur : salle, rôles, thèmes, chat, meneur, révélation | `loup-garou.js`, `api.js`, `partie.js`, `roles.js`, `themes.js`, `vues/` |
| `messages/` | Messagerie privée et groupes | `messages.js`, `messages-groupes.js` |
| `nom-de-code/` | Codenames en équipes | `nom-de-code.js`, `api.js`, `vues/` |
| `plateaux/` | Jeux de plateau et de cartes (blackjack, catan, cluedo, destins, monopoly, pictionary, poker, risk, shadow-hunters) | `plateaux.js`, `api.js`, un `.css` par jeu, `jeux/<jeu>/` (règles de chaque jeu), `vues/` |
| `quiz/` | Questions du gang | `quiz.js`, `quiz.css` |
| `uno/` | Uno en ligne | `uno.js`, `api.js`, `cartes.js`, `vues/` |

## Workflows GitHub (`.github/workflows/`)

| Fichier | Rôle | Déclenchement |
| --- | --- | --- |
| `publier-site.yml` | Construit `_site/` à partir de `site/` (`outils/build/construire.mjs`, esbuild) puis le publie sur GitHub Pages. Seul `_site/` sort du dépôt. Une publication à la fois. | Envoi sur `main`, ou lancement manuel |
| `ci.yml` | Contrôles et tests : syntaxe JS, présence des fonctions et tables de la base, tests de parcours (4 morceaux en parallèle), accessibilité (axe-core), budget de performance mobile. Tourne sur un faux Supabase : aucune donnée réelle. | Envoi sur `main`, demande de fusion, passage de nuit (2 h 17 UTC), lancement manuel |
| `appliquer-sql.yml` | Applique sur la base les migrations de `supabase/appliquer.txt` qui ne sont pas encore dans `supabase/appliquees.txt` (script `outils/appliquer-sql.mjs`), puis note le résultat. Utilise le secret `SUPABASE_ACCESS_TOKEN`. | Envoi sur `main` qui modifie `supabase/appliquer.txt`, ou lancement manuel |
| `deploy-functions.yml` | Déploie les fonctions edge listées dans `supabase/functions/a-deployer.txt`. Utilise le secret `SUPABASE_ACCESS_TOKEN`. | Envoi sur `main` qui modifie `supabase/functions/a-deployer.txt`, ou lancement manuel (choix de la fonction) |
| `importer-lots.yml` | Importe les lots d'images des jeux (`outils/images/lots/`) : affiches Framed et photos GeoGuessr vers le stockage et la base, compte rendu dans `outils/images/rapport-lots.json`. | Lancement manuel seulement |
| `sauvegarde.yml` | Exporte `public`, `auth` et `storage`, chiffre avec `gpg` et dépose un artefact de 30 jours : voir `docs/SAUVEGARDE.md`. Secrets `SUPABASE_DB_URL` et `HG_BACKUP_PASSPHRASE`. | Chaque nuit, ou à la main |
| `importer-images.yml` | Importe dans le dépôt les images de `outils/images/a-importer.json` (captures Steam, images Wikipédia, adresses), les convertit en .webp et les ajoute par un commit. | Envoi sur `main` qui modifie `a-importer.json` ou `importer.mjs`, ou lancement manuel |
| `rapatrier-cartes.yml` | Rapatrie dans le site les images de cartes stockées ailleurs (`outils/images/rapatrier-cartes.mjs`) : télécharge et convertit en .webp, ajoute par un commit, attend la mise en ligne, puis met à jour les adresses en base. | Envoi sur `main` qui modifie `rapatrier-cartes.mjs`, ou lancement manuel |
| `sonde.yml` | Sonde de santé externe : teste le site et le point de santé de Supabase (public, sans donnée), conclut après 2 échecs à 60 secondes d'écart et prévient le salon Staff une fois à la panne et une fois au retour (secret `DISCORD_CI_WEBHOOK`). | Toutes les 15 minutes, ou lancement manuel |

## Où ranger un nouveau fichier ?

Règles générales :

- **Un espace = un dossier** dans `site/assets/espaces/`. Un nouveau morceau de fonctionnalité va dans son espace ; un nouvel espace n'est créé que pour une nouvelle fonctionnalité.
- **Code partagé** par plusieurs espaces : `site/assets/commun/` (ou `commun/core/` pour le socle).
- **JS et CSS côte à côte** : `monespace/truc.js` et `monespace/truc.css` dans le même dossier.
- **Noms en minuscules avec tirets**, en français quand c'est possible (`secret-santa.js`, `collection-a4.css`, `mots-croises.json`). Pas d'espace, pas de majuscule, pas d'accent.
- **Pages** : `site/pages/<catégorie>/<nom>.html`, dans une catégorie existante (admin, cartes, compte, infos, irl, jeux). Une nouvelle page est référencée dans PLAN-DU-SITE.md.
- **Chemins absolus** dans le code : `/assets/…` et `/pages/…` (jamais de chemin relatif qui remonte d'un dossier à l'autre).
- **Images** : `site/assets/images/<thème>/` ; cartes : `site/assets/cartes/<série>/`.
- **Tests de parcours** : `tests/parcours/<catégorie>/` ; tests de fonction isolée : `tests/unitaires/` ; contrôles globaux : `tests/controles/` ; bancs SQL ou UI d'un jeu : `tests/bancs/<jeu>/` ; faux Supabase et faux modules : `tests/fixtures/`.
- **Migrations** : `supabase/migrations/NNN_nom.sql`, numéro = dernier + 1 (trois chiffres, jamais un numéro déjà pris ; voir `supabase/migrations/README.md`), puis ajouter le chemin dans `supabase/appliquer.txt`. Une migration déjà notée dans `supabase/appliquees.txt` n'est jamais modifiée : on écrit une nouvelle migration (un correctif).
- **Fonctions edge** : `supabase/functions/<nom>/index.ts` (code partagé dans `_shared/`) ; ajouter le nom dans `supabase/functions/a-deployer.txt` pour le déployer.
- **Documentation** : `docs/` pour les documents techniques ; le plan du site et le plan du dépôt restent à la racine.
- **Ne pas publier par erreur** : un fichier `.md`, `.sql`, `.ts`, `.sh` n'est jamais servi par le site ; un fichier publié ne commence jamais par `---`. Voir docs/PUBLICATION.md.

Règle du service worker :

- **`CACHE_VERSION` dans `site/sw.js`** : une seule règle, écrite pareil dans `sw.js` : incrémenter à chaque changement de JS ou de CSS du site ; la publication l'incrémente aussi dans sa copie (`outils/build/construire.mjs`). Un fichier qui doit être disponible hors ligne s'ajoute aussi à la liste `PRECACHE`.

## Lancer les vérifications

Les commandes sont décrites dans `tests/README.md` et dans `tests/package.json` (scripts `check`, `test`, `test:a11y`, `test:perf`…). Les tests servent le site directement depuis le dépôt : pas de serveur à lancer, pas de build (seule la publication construit `_site/`).
