# Panel d'administration (Humane Gang)

Ce document décrit l'organisation du panel `pages/admin/admin.html` (le plateau et ses sept lieux), le système de
permissions Staff, ce qui reste réservé à l'administrateur, et la marche à suivre pour ajouter une permission ou une
sous-section. Il ne contient aucune donnée personnelle. Pour retrouver l'accès administrateur, voir `supabase/ADMIN.md`.

Sources de vérité : `site/assets/espaces/admin/perms.js` (lieux `LIEUX`, sections `SECTION_PERM`, permissions),
`site/assets/espaces/admin/router.js` (adresses), `site/assets/espaces/admin/shell.js` (coquille), et côté base
`hg_has_perm()` et le catalogue `hg_perm_catalog`.

---

## 1. Organisation du panel

### Le plateau et les sept lieux

L'accueil du panel est le **plateau** (`#plateau`) : une carte par lieu permis à la personne, disposée sur une grille
de 12 colonnes. Chaque lieu a une couleur, une icône, une phrase d'accroche et ses sous-sections.

| Lieu (adresse) | Contenu |
| --- | --- |
| **La Place du gang** (`#place`) | Membres (Comptes, Rôles, Champs du profil, Vie sociale, Accueil des membres), Relances (À relancer, Invitations), Entraide (Parrainage, Compétences), Accès (Accès aux pages, Matrice membres × pages), Badges (Catalogue, Attribution, Critères automatiques) |
| **La Poste** (`#poste`) | Demandes (Assistance, Modèles de réponse, Boîte à idées), Échanges (Messagerie, Fil d'activité), Discord (Bot Discord, Commandes slash) |
| **La Salle des ventes** (`#ventes`) | Enchères, Échanges entre membres |
| **Le Camp IRL** (`#camp`) | Qui (Membres IRL), Vivre les sorties (Sorties IRL, Souvenirs et photos), Rendez-vous (Secret Santa) |
| **La Fabrique de cartes** (`#fabrique`) | Agir (Gestion globale, Drops, Codes cadeaux), Arène, Catalogue (Séries, Cartes, Boosters), Suivi (Joueurs, Statistiques), Économie (Paillettes et dons, Tirage, Recyclage et fabrication, Limites), Animations (Quêtes, Défis du gang, Cagnotte et bulletin, Cartes Champions, Atelier) |
| **La Fête foraine** (`#fete`) | Événements (Événements à thème, Calendrier et cinéma, Calendrier de l'Avent, Saison des Worlds, Anniversaire du gang), Jeux (Questions du gang, Sutom du gang, GeoGuessr, Citations, Preuves de quêtes, Framed et Heardle, Arcade, Secrets, Mes jeux, puis Loup-Garou, Uno, Codenames, Jeux de plateau et Duels, réservés à l'administrateur) |
| **La Mairie** (`#mairie`) | Organisation (Planning, Journal, Staff), Le site (Identité et mentions légales, Textes et intro, Menu et pied de page, Thème), Technique (État du site, Erreurs du site, Entretien, Archives, Clés avancées) |

- **Pages de lieu** (`#<lieu>`) : un bandeau à la couleur du lieu, une zone « À faire maintenant » (registre `registerTodo`,
  `admin/lieux.js`), puis les pages du lieu en tuiles groupées (icône, libellé, ligne d'aide, compteur « à traiter »). Les tuiles d'un groupe se répartissent en lignes de même nombre à une tuile près,
  étirées sur la largeur (6 colonnes au plus, tuile de 250 px au moins, gouttière de 12 px ; recalculé au redimensionnement).
- **Pastilles** : chaque lieu affiche le nombre d'éléments « à traiter » ; un compteur à zéro est masqué.
- **Disposition du plateau** (migration 111) : chaque personne peut déplacer et redimensionner les lieux
  (« Modifier la disposition », à partir de 900 px ; flèches au clavier). La disposition est enregistrée par
  `hg_admin_plateau_set` ; `null` rétablit la disposition par défaut. Sans disposition enregistrée, les lieux absents selon
  les droits ne laissent pas de trou : les cases restantes se resserrent (4 lieux en 2 + 2, 5 en 3 + 2, 6 en 3 + 3, la Mairie en
  bande pleine en bas ; 7 lieux : inchangé) et la route suit. Une disposition enregistrée reste telle quelle.
- **Téléphone** : une barre du bas (Plateau puis les lieux permis).

### Adresses, fil d'Ariane et palette

- URL : `pages/admin/admin.html#<lieu>/<sous-section>[/id[/onglet]]`, par exemple `#place/comptes/<id>/<onglet>` ou
  `#fabrique/cartes`. Une sous-section peut être montée sous plusieurs lieux : l'identifiant de sous-section est unique
  sur tout le panel.
- Un lieu ou une sous-section sans droit renvoie vers la première route permise ; sans aucun droit, rien ne s'ouvre.
- **Anciennes adresses** (`router.js`) :
  - anciens domaines (`#pilotage/…`, `#membres/…`, `#irl/…`, `#event/…`, `#cartes/…`, `#jeux/…`) : la sous-section est
    retrouvée par son identifiant dans tous les lieux ;
  - anciennes ancres de section (`#comptes`, `#cartes`, `#journal`, `#membres` = Invitations…) : `LEGACY` ;
  - renommages (`ALIAS_SUB`, par exemple `bataille` → `arene`) ; adresses retirées ou déplacées (`MOVED`) :
    `#apercu` → plateau, `#reglages` → `#mairie/identite`, fiches fantômes → `#place/comptes`.
- **Palette** « Tout le panel » (`admin/palette.js`) : Ctrl/Cmd+K ou le bouton de l'en-tête. Elle filtre les
  sous-sections permises et les membres.
- **Montage à la demande** : chaque sous-section est montée à sa première visite (`registerSub`, `admin/shell.js`).
- **Temps réel** : un seul canal Supabase Realtime (`admin/live.js`), abonné aux tables publiées (migration 030) dont
  la personne a le droit (`TABLE_PERM`). Les changements sont regroupés (800 ms). Une section en cours de saisie affiche
  « Mises à jour disponibles — Actualiser » au lieu de se recharger.

---

## 2. Système Staff

L'administrateur (`hg_profiles.is_admin`) a tous les droits. Un membre Staff a une liste de permissions
(`hg_staff.perms`) et un drapeau actif. Dans les règles RLS et les fonctions d'administration, `hg_is_admin()` est
remplacé par `hg_has_perm('<clé>')` (migrations 026 et 027). `hg_is_staff()` sert à la lecture des profils et de l'état du panel.

### Catalogue des 15 permissions

| Clé | Ce qu'elle ouvre dans le panel | Tables et stockage (`hg_perm_tables`) |
|---|---|---|
| `membres` | Place du gang (Comptes, Rôles, À relancer, Invitations, Parrainage, Compétences, Accès aux pages), Camp IRL › Membres IRL | `hg_profiles`, `hg_profile_info`, `hg_invites`, `hg_invite_links`, `hg_page_access` |
| `evenements` | Camp IRL › Sorties IRL ; Fête foraine › Calendrier et cinéma | `hg_events`, `hg_event_dates`, `hg_event_rsvps`, `hg_event_date_votes` |
| `souvenirs` | Camp IRL › Souvenirs et photos ; Fête foraine › Sutom, GeoGuessr, Framed et Heardle | `hg_moments`, `hg_photos`, `hg_reactions`, stockage `hg-photos` |
| `secret_santa` | Camp IRL › Secret Santa (éditions, participants, exclusions, tirages, vœux) | `hg_ss_editions`, `hg_ss_participants`, `hg_ss_exclusions`, `hg_ss_wishes`, `hg_ss_assignments` |
| `cartes` | La Fabrique de cartes (toutes les sous-sections, Gestion globale, Arène), Salle des ventes | `hg_card_sets`, `hg_cards`, `hg_card_copies`, `hg_wallets`, `hg_wallet_log`, `hg_card_trades`, `hg_card_trade_items`, `hg_challenges`, `hg_card_quests_templates` |
| `badges` | Place du gang › Badges | `hg_badges`, `hg_user_badges` |
| `themes` | Fête foraine › Événements à thème, Avent, Worlds, Anniversaire du gang ; Mairie › Thème | `hg_themes`, `hg_theme_seen`, `hg_dyn_events`, `hg_dyn_captures` |
| `messages` | Poste › Messagerie (lecture journalisée) | `hg_conversations`, `hg_conversation_members`, `hg_messages` |
| `support` | Poste › Assistance, Modèles de réponse, Boîte à idées | `hg_support`, `hg_support_replies`, `hg_ideas`, `hg_modeles_reponse` |
| `bot` | Poste › Bot Discord, Commandes slash | `hg_bot_log`, `hg_birthday_log` |
| `reglages` | Mairie › Le site (sauf Erreurs et Archives), Mairie › Technique › Entretien (lecture), Poste › Fil d'activité, Place du gang › Champs du profil, Vie sociale, Accueil des membres ; Fête foraine › Arcade et Secrets | `hg_settings` (clés générales), `hg_pages`, `hg_activity` |
| `journal` | Mairie › Journal (actions admin) | `hg_admin_log` |
| `quiz` | Fête foraine › Questions du gang, Citations « Qui a dit ça ? » | — |
| `preuves` | Fête foraine › Preuves de quêtes | — |
| `mj` | Fête foraine › Mes jeux (« Maître du jeu ») | — |

La Mairie › Planning est visible dès qu'une des permissions `quiz`, `cartes`, `themes`, `evenements`, `secret_santa` ou `bot` est accordée ; chaque bloc est filtré par la base.

Le catalogue compte quinze clés : `pronos` et `ludotheque` ont été retirées par la migration 099.

### Réservé à l'administrateur

Ces droits ne se délèguent pas, même à un Staff qui a toutes les permissions :

- **Le drapeau `is_admin`** : promotion ou retrait. Le trigger `hg_profiles_guard` l'annule si l'auteur n'est pas administrateur.
  Procédure dans `supabase/ADMIN.md`.
- **Gestion du Staff** (Mairie › Organisation › Staff) : `hg_staff_list` et `hg_staff_set` exigent `is_admin` (écriture journalisée). La table `hg_staff`
  n'a pas de droit d'écriture direct.
- **Archives** (Mairie › Technique › Archives) : section réservée à l'administrateur.
- **Entretien** (Mairie › Technique › Entretien) : le Staff `reglages` voit quotas et tâches, durées en lecture seule. Durées (`hg_entretien_regler`),
  aperçu et purge manuelle (`hg_entretien_apercu`, `hg_entretien_purger`, journalisés) et « Ignorer cette semaine » (`hg_entretien_ignorer`) exigent `is_admin`.
  La clé `hg_settings.entretien` reste hors de `hg_settings_perm` : aucune écriture directe du Staff. Voir « Vues particulières ».
- **Mode sans limite** : `hg_set_god_mode` et `hg_god_mode()` exigent `is_admin`.
- **Arène v2 ouverte aux membres** : l'option `arena.v2_public` ne se modifie que par l'administrateur (voir « Sections particulières »).
- **Journal des lectures de messages** (`hg_admin_access_log`) : lecture réservée à l'administrateur. Une lecture de
  conversation (`hg_admin_read_conversation`, permission `messages`) y est toujours enregistrée.
- **E-mails des membres** : `hg_admin_accounts` ne renvoie l'adresse que si l'appelant est administrateur.
- **Clés de réglage sensibles** : les clés du propriétaire (suffixe `_owner`) et `admin_initial` n'ont aucune permission (`hg_settings_perm` renvoie `null`),
  seul l'administrateur peut les lire ou les écrire. `push_vapid_public` est public en lecture, en écriture réservée à l'administrateur.
- **Loup-Garou, Uno, Codenames, Jeux de plateau, Duels** : sous-sections réservées à l'administrateur (Fête foraine › Jeux).
- **Table `hg_private`** : RLS activée sans aucune règle. Elle n'est lisible que par les fonctions et triggers serveur.

---

## 3. Vues particulières

### Rôles et accès par rôle (Place du gang › Comptes › Rôles, `#place/roles`)

Source : `site/assets/espaces/admin/admin-roles.js`. Droit : `membres`.

- Un **rôle** (`hg_roles` : identifiant, libellé, description, couleur, pages « sur liste », ordre) pré-règle l'accès à des pages
  pour les membres qui le portent (`hg_member_roles`). Les rôles de départ (IRL, Secret Santa) se modifient dans le panel.
- Un rôle ne donne que des pages en mode « liste » (Place du gang › Accès aux pages).
- **Un réglage à la main** (`hg_page_access`) l'emporte toujours sur les rôles. Retirer un rôle retire seulement ce qu'il donnait.
- `hg_member_access` donne l'accès d'un membre à chaque page avec son origine : administrateur, réglage à la main, rôle,
  page ouverte à tous, ou aucun.
- Écritures par RPC qui vérifient les droits et journalisent dans `hg_admin_log` : `hg_role_save`, `hg_role_remove`, `hg_member_role_set`.

### Voir le site comme un membre (`site/assets/commun/core/view-as.js`)

- Depuis la fiche d'un membre (Place du gang › Comptes), le bouton « Voir le site comme… » ouvre le site dans l'onglet
  avec les menus et les pages de ce membre. La RPC `hg_admin_view_as` renvoie les pages que verrait ce membre (droit `membres`).
- La vue est gardée dans `sessionStorage` (clé `hg_view_as`, propre à l'onglet) et s'affiche avec un bandeau « Tu vois le site comme… ».
  Elle n'est gardée que si le profil connecté est administrateur. Sur le panel, la clé est effacée.
- Dans cette vue, Admin, Staff et Sans limite sont masqués dans le menu en arc (`core/header.js`).
- Les données restent celles de l'administrateur : la base contrôle tout, ce module ne change que l'interface.

### La Fabrique de cartes › Gestion globale (`#fabrique/gestion`)

Source : `site/assets/espaces/admin/admin-gestion.js`, section `cartes-gestion`, droit `cartes`. Trois blocs :
- **Give** : le panier (`give-panier.js`, RPC `hg_cards_admin_give_panier`, migration 196). Un seul don mélange Paillettes, cartes une à une, série entière, type entier et plusieurs sortes de boosters, pour un membre, plusieurs ou tout le gang, tout ou rien. Quantités libres, 100 000 exemplaires au plus par don ; une carte limitée peut dépasser son maximum, le panier et la confirmation l'annoncent. Le même panier sert dans la fenêtre Give du plateau, « Don groupé » (Économie) et le bouton Give de la fiche d'un membre. Pas de MP Discord ;
- **Résumé de l'économie** : santé de l'économie (`hg_eco_health`), statistiques des types de boosters (`hg_booster_type_stats`), enchères (`hg_auctions_admin`), seulement ce que la base renvoie ;
- **Derniers gives**.

### La Poste › Modèles de réponse (`#poste/modeles-reponse`)

Sources : `site/assets/espaces/admin/admin-modeles-reponse.js` (liste, tiroir), `support-modeles.js` (menu « Modèles » de la zone de réponse de l'Assistance),
migration `194_modeles_reponse.sql`, droit `support` pour lire et pour éditer. Table `hg_modeles_reponse` : titre (60 caractères), catégorie « Rangé dans » (30, facultative), texte (2 000).
Toute écriture est journalisée par un déclencheur (`modele_reponse_cree`, `modele_reponse_modifie`, `modele_reponse_supprime`).

- Le menu relit les modèles à chaque ouverture. Choisir un modèle insère son texte, réponse ou note interne, et n'envoie jamais rien.
- Si la zone contient déjà du texte, il est gardé : le modèle s'ajoute à la suite, après une ligne vide, et un message le signale.
- `{prenom}` devient le pseudo du membre (le site ne connaît pas de prénom ; le nom de la variable est conservé).
- Pas de menu dans Messages : le menu n'existe que dans la zone de réponse de l'Assistance.

### La Fête foraine › Jeux › Arcade, pages 404 (`#fete/arcade`)

Source : `site/assets/espaces/admin/admin-arcade.js`, droit `reglages`. Suit les trois mini-jeux des pages 404
(Paillettes, Raclette, Domu-mobile) semaine par semaine : parties jouées, Paillettes versées, règles anti-triche en lecture seule,
et classement des dix meilleurs scores. L'administrateur peut effacer le score d'un membre.

### La Mairie › Technique › Entretien (`#mairie/entretien`)

Sources : `site/assets/espaces/admin/admin-entretien.js`, `entretien-sante.js` (quotas, alertes, « À faire »), `entretien-purge.js` (fenêtre « Purger maintenant »),
migration `192_entretien_admin.sql`, droit `reglages`. Une page, trois cartes :
- **Quotas** (`hg_entretien_quotas`) : base et stockage du plan gratuit (500 Mo, 1 Go ; 1 Mo = 1 000 000 octets), détail par bucket. Alerte à 80 %, reprise dans « À faire » de La Mairie.
  « Ignorer cette semaine » (`hg_entretien_ignorer`) suspend l'alerte, pas les barres. Le plafond d'import de `outils/images/importer-lots.mjs` vaut 700 × 1024 × 1024 octets (734 Mo dans
  l'unité de la page) et ne porte que sur le stockage : le repère de la barre est à 73,4 %. Les quotas et ce plafond sont écrits dans `entretien-sante.js`.
- **Tâches planifiées** (`hg_entretien_taches`) : planning, dernière exécution, durée, statut, erreurs sur la durée gardée au journal. `cron.job.command` et
  `cron.job_run_details.return_message` peuvent contenir des clés : la base ne les lit pas et le panel ne les montre jamais. Libellés et « puis fonction edge » : liste `TACHES` de `admin-entretien.js`, à compléter pour toute nouvelle tâche.
  Un échec dans une fonction edge appelée ensuite ne se voit pas ici.
- **Purge de nuit** : durées dans `hg_settings.entretien` (journal des tâches 1 à 30 jours, 3 par défaut ; coups 14 à 365 jours, 30 par défaut). Une valeur absente ou hors bornes vaut la valeur par défaut, côté serveur.
  La nuit, l'aperçu et la purge manuelle passent par `hg_entretien__passage` : mêmes durées, filtres, tables et plafond (50 000 lignes par table et par passage).
  Les notifications du site (`hg_site_notifs`) y sont purgées à 90 jours, lues ou non (migration 195). Cette durée est fixe, écrite dans `hg_entretien__passage` : elle est annoncée aux membres, sur le centre de notifications et dans la page légale.

### La Fabrique de cartes › Arène (`#fabrique/arene`, ancien `#bataille`)

Source : `site/assets/espaces/admin/admin-bataille.js`, droit `cartes`. Deux blocs :
- **Arène actuelle** (membres) : activation, gains et plafonds de l'Arène de cartes (`hg_settings.cards`), inchangés.
- **Arène v2** (cotes, ligues, saisons) : ses chiffres se règlent ici (`hg_settings.arena`, bornés par le serveur).
  L'option « Ouvrir l'Arène v2 aux membres » (`arena.v2_public`) est réservée à l'administrateur.
  Tant qu'elle n'est pas ouverte, les membres voient l'Arène actuelle et seul l'administrateur voit l'aperçu v2 (bandeau « Aperçu admin »).
  Règles et chiffres : `docs/ARENE.md`. Page membre : `pages/cartes/cartes.html#arene`.

---

## 4. Ajouter une permission

1. **Migration** (numéro = dernier + 1, voir `supabase/migrations/README.md`, idempotente, à ajouter à la table de
   `supabase/migrations/README.md`) :
   - `insert into hg_perm_catalog (key, label, description, sort)` : clé en minuscules `^[a-z_]{2,32}$`.
   - `insert into hg_perm_tables (tbl, perm)` pour chaque table ou `storage:<bucket>` du domaine.
   - Remplacer `hg_is_admin()` par `hg_has_perm('<clé>')` dans les règles RLS et les fonctions d'administration concernées
     (même approche que la migration 027).
   - Si le domaine porte des clés de `hg_settings`, les ajouter à `hg_settings_perm` (migration 029).
   - Publier les tables temps réel utiles (`alter publication supabase_realtime add table …`).
2. **`site/assets/espaces/admin/perms.js`** : ajouter la section dans `SECTION_PERM` (section → clé de permission, ou `null`)
   et la sous-section dans `LIEUX` (dans le lieu voulu, avec son groupe `under(…)`).
3. **`site/assets/espaces/admin/live.js`** : ajouter la table dans `TABLE_PERM` si elle doit être rafraîchie en direct.
4. **`site/pages/admin/admin.html`** : ajouter `<section id="<section>" class="admin-section" aria-labelledby="h-<section>">` dans
   `#shell-parking`, avec son conteneur de racine (`<div id="…-root">`), sur le modèle des sections existantes.
5. **Module** : créer le fichier dans `site/assets/espaces/admin/` (`admin-<nom>.js`, ou un sous-dossier) et le brancher dans
   `site/assets/espaces/admin/admin.js` par `regSub('<sous-section>', { main, open, list, info, group })`. Le lieu est déduit
   de `LIEUX` (`lieuOf`). Les données partagées passent par `once()` ou un `ensure…` de `admin/loaders.js`.
6. **Service worker** : le nouveau fichier est ajouté à `PRECACHE` dans `site/sw.js` (le panel est précaché à part).
   Règle pour `CACHE_VERSION` : incrémenter à chaque changement de JS ou de CSS du site ; la publication l'incrémente aussi dans sa copie.
7. **Tests** : les parcours de navigation (`parcours-admin-nav`, `parcours-admin-coquille`, `parcours-admin-plateau`,
   `parcours-staff`) énumèrent les sections ; ajouter un parcours pour le nouveau lieu (section 6).

## 5. Ajouter une sous-section

- **Dans un lieu existant, avec une permission existante** : ajouter l'entrée dans `LIEUX` (`perms.js`) et l'appel
  `regSub` dans `admin.js`. Aucune migration si les tables sont déjà couvertes. Mettre à jour les parcours de navigation.
- **Avec une nouvelle section** : suivre les étapes 4 à 6 de la section 4, sans la migration si la permission existe déjà.
- **Déplacer ou renommer une sous-section** : garder l'ancienne adresse valable (`ALIAS_SUB` ou `MOVED` dans `admin/router.js`).
  Une sous-section déplacée d'un lieu à un autre reste trouvée par son identifiant.

## 6. Tester

Depuis le dossier `tests/` (les tests servent le site statique et remplacent Supabase par un faux client) :

```sh
npm run check       # syntaxe de tous les fichiers JavaScript et règles de publication
npm run test:rpc    # chaque RPC et table appelée existe dans le schéma ou les migrations
npm test            # suite complète (run-all.cjs)
```

Pour une sous-section, `adminSection(page, 'place/comptes')` (`tests/lib/harness.cjs`) ouvre la route avant les interactions.
Les tests ne touchent jamais la vraie base : toute requête vers `*.supabase.co` est interceptée.

Parcours du panel (`tests/parcours/admin/`) :

| Fichier | Vérifie |
|---|---|
| `parcours-admin-plateau.cjs` | Plateau, pages de lieu, pastilles « à traiter », disposition |
| `parcours-admin-nav.cjs` | Sous-sections montées à la demande, liens directs, palette Ctrl/Cmd+K, navigation mobile |
| `parcours-admin-coquille.cjs` | Coquille du panel, URL directe, redirection des anciennes adresses, Staff restreint, mobile |
| `parcours-admin-direct.cjs` | Temps réel : abonnements selon les droits, bandeau de mise à jour pendant la saisie |
| `parcours-admin-recherche.cjs` | Recherche, « Afficher plus », fiche membre, état d'une action |
| `parcours-admin-roles.cjs` | Rôles et accès par rôle |
| `parcours-admin-p2-pilotage.cjs` | Staff, Journal |
| `parcours-admin-p2-assistance.cjs` | Assistance et Boîte à idées : liste, détail, statut, recherche |
| `parcours-admin-modeles-reponse.cjs` | Modèles de réponse : écran, tiroir, suppression, droits, menu au clavier de l'Assistance, `{prenom}`, téléphone |
| `parcours-admin-p2-sorties.cjs`, `parcours-admin-sorties.cjs` | Sorties IRL : liste, création, modification, inscrits |
| `parcours-admin-souvenirs.cjs` | Souvenirs et photos : création, modification, suppression, réactions |
| `parcours-admin-complements.cjs` | Quêtes, défis, réglages du site, pages |
| `parcours-admin-arcade.cjs` | Arcade des pages 404 : classement, effacement d'un score |
| `parcours-admin-gestion.cjs` | La Fabrique de cartes › Gestion globale |
| `parcours-admin-give-panier.cjs` | Le give en panier : don mélangé, lots, brillance, dépassement, garde-fou, journal, 390 px |
| `parcours-admin-quick.cjs` | Actions rapides du plateau : Give, Nouvelle enchère (lot en panier), Lancer un drop (petites fenêtres) |
| `parcours-staff.cjs` | Section Staff (administrateur), Staff restreint, membre simple redirigé |

Un test ne vérifie que ce que le faux client sait simuler (`tests/fixtures/`). Une RPC absente du faux renvoie `null` sans erreur.
