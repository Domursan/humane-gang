# Migrations Supabase (Humane Gang)

Ce dossier contient l'historique des modifications de la base, dans l'ordre. Les fichiers
ont été appliqués à la main (SQL Editor) ou via l'outil de migration ; les noms ne sont pas
renommés, car ils sont déjà référencés en production.

**Dernière migration : `166_plateaux_droits_internes.sql`** (état au 28/10/2026). Le journal des applications
est `supabase/appliquees.txt` (depuis la 138) ; la liste à appliquer est `supabase/appliquer.txt`.

**Schéma de référence** : `supabase/schema/schema_reel_2026-10-21b.sql` reconstitue le schéma `public` tel qu'il
était en base le 21/10/2026, après la migration 131. Il ne couvre donc pas les migrations 132 à 166 : voir
`supabase/schema/README.md`. L'ancien `schema_reel_2026-10-21.sql` est périmé
(il ne couvre pas les migrations 020 à 032). Les migrations 006, 009, 011, 012, 015 et 017
sont des résumés (le SQL exact a été exécuté pendant une session et n'a pas été conservé) : en cas
de différence, c'est le schéma reconstitué qui fait foi.

## Maintenance pendant une migration

Jamais automatique : une migration qui veut l'écran de maintenance porte `-- hg:maintenance` en première ligne. `outils/appliquer-sql.mjs` active alors `site_identite.maintenance_active` juste avant ce fichier et le retire après (même en cas d'échec), sans toucher aux autres champs du réglage.
Si la maintenance était déjà active (admin), elle est laissée telle quelle ; si le retrait échoue, le job finit en échec et prévient le salon Staff (à défaire dans Admin › Site › État du site).

## Numérotation

| Fichier | Rôle | Statut |
|---|---|---|
| `001_hg_core_schema.sql` | Tables, fonctions et triggers de base. Contient une ancienne version de `hg_delete_my_account` (remplacée par 021) | appliqué |
| `002_hg_rls_storage.sql` | Policies RLS, buckets de stockage, compte admin initial | appliqué ; l'adresse admin n'est plus en dur (voir ci-dessous) |
| `003_a_coller_dans_supabase.sql` | Règles « supprimer », suppression de compte, verrou des tables `d_*` | appliqué à la main ; rejouable depuis la version corrigée |
| `005_admin_assets_select.sql` | Lecture admin des assets | appliqué |
| `006_themes_infos_admin.sql` | Thèmes, infos de profil (résumé) | appliqué, SQL exact absent |
| `009_messagerie_badges_recap.sql` | Messagerie, badges, récap (résumé) | appliqué, SQL exact absent |
| `011_admin_v4.sql` | Administration v4 (résumé) | appliqué, SQL exact absent |
| `012_niveaux_events_irl.sql` | Niveaux de badges, sorties IRL (résumé) | appliqué, SQL exact absent |
| `013_members_joined_on.sql` | Date d'arrivée des membres | appliqué |
| `014_badge_progress.sql` | Progression des badges | appliqué |
| `015_mode_sans_limite.sql` | Mode « sans limite » (résumé) | appliqué, SQL exact absent |
| `016_inscription_egale_arrivee.sql` | Inscription et arrivée | appliqué |
| `017_acces_pages.sql` | Accès aux pages (résumé) | appliqué, SQL exact absent |
| `018_cartes_tables.sql` | Tables du jeu de cartes (les policies sont dans le schéma reconstitué) | appliqué |
| `018_cartes_fonctions.sql` | Fonctions du jeu de cartes | appliqué |
| `019_comptes_fantomes.sql` | Comptes fantômes | appliqué |
| `021_securite_cartes.sql` | Sécurité, contraintes, journaux admin, corrections du jeu de cartes | appliqué à la main (contraintes `hg_profiles_*_format` et `hg_admin_log` présentes en production) |
| `042_dons_groupes.sql` | Boosters offerts (`hg_wallets.gift_boosters`, `hg_open_booster_req` avec `p_offert`), don groupé (`hg_cards_admin_bulk_give`) | appliqué (outil de migration, 21/10) |
| `026_staff.sql` | Catalogue des 12 permissions (`hg_perm_catalog`), table `hg_staff`, fonction `hg_has_perm()` | appliqué |
| `027_staff_regles.sql` | Table `hg_perm_tables` (table ou stockage vers permission) ; `hg_is_admin()` remplacé par `hg_has_perm()` dans les règles RLS et les fonctions du panel | appliqué |
| `028_staff_ajustements.sql` | Journal des lectures de messages et e-mails réservés à l'administrateur ; modération des réactions (permission `souvenirs`) | appliqué |
| `029_staff_lectures.sql` | Lecture des profils par tout Staff ; permission de chaque clé de `hg_settings` (`hg_settings_perm`) ; `hg_admin_accounts` | appliqué |
| `030_admin_temps_reel.sql` | Publication `supabase_realtime` du panel (assistance, idées, profils, Staff, journal, cartes, sorties, souvenirs, Secret Santa) | appliqué |
| `031_corrections_ambiguites.sql` | Colonnes ambiguës corrigées dans `hg_admin_ghosts` et `hg_admin_conversations` | appliqué |
| `032_assistance_fil.sql` | Prise en charge et fil de réponses de l'assistance | **absent de cette branche** : ajouté par une autre branche |
| `038_quete_photo_avatar.sql` → `043_drops.sql` | Quête photo d'avatar, don admin dans le fil, `039b_rarete_libelle.sql` (libellé des raretés), choix d'annonce, critères des badges, dons groupés, drops | appliqués (outil de migration, 21/10). `039b` a été appliqué sans fichier : le fichier a été reconstitué le 23/10 depuis l'historique de production (texte identique) |
| `050_reglages_lot1.sql` → `054b_reglages_bot_planning_correctif.sql` | Réglages admin, lots 1 à 5 (les `b` sont les correctifs, enregistrés en production sous `052_corrige`, `053_corrige`, `054_corrige`) | appliqués (21/10) |
| `055_drops_plafond.sql` → `066_assistance_conversation.sql` | Plafond des drops, salons des annonces, échanges suggérés, affiches, quêtes, quiz, cartes uniques, easter eggs, annonce des drops, famille « Unique », assistance en conversation. 061, 062 et 066 ont été appliqués en plusieurs morceaux (`061a`…`061f`, `062a`…`062c`, `066a`…`066c`) ; `063_page_quiz.sql` a été appliqué à la main (absent de l'historique de l'outil) | appliqués (22/10) |
| `068_quiz_vrai_faux_et.sql` | Questions vrai/faux (choix « Vrai » et « Faux » manquants), « & » lu comme « et » | appliqué en production |
| `069_types_boosters.sql` | Types de boosters (9 types, stock par type, garantie et limites par type), achat, ouverture, dons de boosters par type ; remplace le 067 (brouillon jamais appliqué) ; `hg_wallets.gift_boosters` versé dans le stock « classique » | appliqué (outil de migration, 22/10) |
| `070_bot_multi_salons.sql` | Bot Discord : détail par salon des envois (`hg_bot_log.channels`), annonces dans plusieurs salons | appliqué (outil de migration, 22/10) |
| `071_boosters_admin.sql` | Boosters paramétrables par l'admin et le Staff « cartes » : raretés et séries exclues par type (`excluded_rarities`, `excluded_sets`), RPC `hg_booster_type_save` et `hg_booster_type_stats`, journal des ouvertures `hg_booster_opens` ; Collectionneur sans identité ni série « Les OG » (`gang-membres`) | appliqué (outil de migration, 23/10) |
| `072_securite_economie.sql` | Sécurité, paquet A (audit du 23/10) : économie (Paillettes, badges) | 23/10 : à appliquer (dans l'ordre 072 → 075) ; état actuel non journalisé |
| `073_securite_profils_staff.sql` | Sécurité (audit du 23/10, paquet B) : garde des profils élargie (I1, I5), fantôme rattaché seulement par lien nominatif (I2), plus d'accès direct du Staff aux messages (I4) ni d'écriture directe sur l'économie (M5), audit `hg_wallets`, bornes des récompenses `hg_settings`, clés inconnues réservées à l'admin, buckets `photos`/`hg-assets`/`d-files`, `hg_backup_027` retirée | 23/10 : à appliquer (après 072) ; état actuel non journalisé |
| `074_securite_echanges.sql` | Sécurité, paquet C : verrous des exemplaires (dons, échanges, recyclage), captures d'événement, fantômes refusés comme destinataires, plafond et ancienneté des Paillettes échangées (réglage `echanges`), ancienne ouverture payante `hg_open_booster` refusée, liens d'invitation plafonnés, abonnements push contrôlés | 23/10 : à appliquer (après 073 ; puis le front `cartes.js`, `admin-invite-links.js`) ; état actuel non journalisé |
| `075_securite_annonces.sql` | Sécurité, paquet D : annonces | 23/10 : à appliquer (après 074) ; état actuel non journalisé |
| `078_assistance_pj_favoris.sql` | Assistance : pièces jointes (bucket privé `hg-support-files`, table `hg_support_files`, RPC `hg_support_add`) ; cartes en favoris (`hg_card_favorites`, RPC `hg_card_favorite_set`, nettoyage à la sortie de la collection). Aucune récompense | 23/10 : à appliquer (après 075) ; état actuel non journalisé |
**État réel au 23/10/2026** : l'outil de migration de production connaît 038 → 071 (plus les migrations `airpe_*` et
`domursan_01_schema` des autres applications du projet). 001 → 037 et 063 ont été appliqués à la main.

## Règle pour une nouvelle migration

1. Numéro = **dernier numéro + 1** (le plus haut présent dans ce dossier : 166 au 28/10/2026, donc `167_…`), sur trois
   chiffres. Jamais un numéro déjà pris, même un trou ancien.
2. Nom : `NNN_sujet_en_minuscules.sql`, en français quand c'est possible.
3. Ne jamais modifier une migration déjà notée dans `supabase/appliquees.txt` : on écrit un correctif, qui prend son
   propre numéro.
4. Ajouter le chemin (`supabase/migrations/NNN_sujet.sql`) à la fin de `supabase/appliquer.txt`. Le workflow
   `appliquer-sql` l'applique et note le résultat dans `appliquees.txt`.
5. Rendre la migration rejouable (`if not exists`, `create or replace`, `drop policy if exists`, blocs `do` pour les contraintes).

## État des migrations 079 à 166

Lecture : une ligne par migration. « Journal » : la migration figure dans `appliquees.txt` (appliquée par le workflow,
avec la date). Depuis le 26/10, le journal est tenu pour les migrations 138 et suivantes ; pour 079 à 137, le dépôt ne
dit pas toujours si elles ont été appliquées : le sujet indique ce qui est écrit dans le fichier lui-même.

| N° | Sujet | Journal |
|---|---|---|
| 079 | Sécurité des fonctions edge (ré-audit E2, E5) | non |
| 080 | Idées C1 à C6 (cartes et boosters) | non |
| 081 | Idées C7 à C12 (cartes et économie : tags, codes cadeaux, atelier, enchères, bourse) | non |
| 082 | Idées du gang, paquet C3 (thème Cartes) | non |
| 083 | Page Jeux et idées J1, J2, J3 du catalogue | non |
| 084 | Idées J4, D2, J5, J8 (question du jour, pronostics, Sutom du gang) | non |
| 085 | Idées J9, J10, J11, J15 (Framed, Heardle, preuves de quêtes, Bataille) | non |
| 086 | Idées J16, J18, J19 (saisons de classement, arcade du jour, soirée complète) | non |
| 087 | Idées V8, V9, D3 (calendrier du gang, ciné-club, commandes slash Discord) | non |
| 088 | Idées S1, S2, S3, S6 (contenu et souvenirs) | non |
| 089 | Idées « Contenu et souvenirs », paquet xS2 | non |
| 090 | Idées P1, P3, P4, P5 (profil gaming, conversations de groupe, merci public, sondages) | non |
| 091 | Idées P6 à P9 (social et profils) | non |
| 092 | Idées A1 à A5 (admin et outils ; permission « mj ») | non |
| 093 | Idées A6 à A9 (admin et outils) | non |
| 094 | Idées Q1, Q3 (visite guidée, vignettes des photos) | non |
| 095 | Notifications par catégorie (Q6) | non |
| 096 | Idées T1 à T4 (saisonnier) | non |
| 097 | Règles des enchères, réglables enchère par enchère | non |
| 098 | Événements ponctuels du calendrier, affiches des films du ciné | non |
| 099 | Effacement des fonctionnalités retirées (23/10) | non |
| 100 | Arcade : les trois mini-jeux disponibles tous les jours | non |
| 101 | Secrets « clins d'œil du gang » (catégorie F) | non |
| 102 | Thème saisonnier « Raclette » | non |
| 103 | Réorganisation du panel admin | non |
| 104 | Arène v2 (règles dans `docs/ARENE.md`) | non |
| 105 | Audit de sécurité du 23/10, paquet E (privilèges). Le fichier dit : non appliqué par l'auteur de l'audit, à appliquer par le propriétaire | non |
| 106 | Suite de l'audit de sécurité (validée par le propriétaire) | non |
| 107 | Badge « Gladiateur » (fin de saison de l'Arène v2) | non |
| 108 | **Trou** (aucun fichier) | — |
| 109 | Mot du jour du Sutom visible par l'admin | non |
| 110 | Clé d'empreinte des adresses des visiteurs (assistance), dans Vault | non |
| 111 | Disposition personnelle du plateau du panel admin | non |
| 112 | Don groupé (Give) : tout type de booster | non |
| 113 | Un compte admin ne peut plus se supprimer lui-même | non |
| 114 | Jeux d'arcade sans limite de temps | non |
| 115 | Puissances des cartes réglables depuis le panel | non |
| 116 | Booster série d'une série qui n'a pas toutes les raretés | non |
| 117 | Carte unique avec plusieurs exemplaires numérotés | non |
| 118 | Loup-Garou (1/2) : tables, accès et sécurité | non |
| 119 | Loup-Garou (2/2) : moteur de jeu | non |
| 120 | Loup-Garou : mode invité | non |
| 121 | Uno : tables, moteur, invités, récompenses | non |
| 122 | Duels (Puissance 4, Morpion, Mastermind, Bataille navale, Qui est-ce ?) | non |
| 123 | Nom de code (Codenames) : tables, moteur, invités, récompenses | non |
| 124 | Qui est-ce ?, plateau « Les habitants du quartier » | non |
| 125 | Socle commun des jeux de plateau | non |
| 126 | Cluedo (moteur, sur le socle 125) | non |
| 127 | Shadow Hunters (moteur, sur le socle 125) | non |
| 128 | Destins (moteur, sur le socle 125) | non |
| 129 | Monopoly (moteur, sur le socle 125) | non |
| 130 | Risk (moteur, sur le socle 125) | non |
| 131 | **Doublon.** `131_arcade_plafond_scores.sql` : plafond des scores de l'Arcade | non |
| 131 | **Doublon.** `131_plateaux_robots.sql` : robots des jeux de plateau, « Nom de code » renommé « Codenames » | non |
| 132 | Arcade : score maximum porté à 100 000 | non |
| 133 | Réponses des jeux pour les administrateurs (point d'entrée `hg_adrep_<jeu>`) | non |
| 134 | **Doublon** (5 fichiers) : `134_adrep_duels`, `134_adrep_jour`, `134_adrep_plateaux`, `134_adrep_salons` (réponses admin des jeux) et `134_musiques` (série « Musiques », 1 000 cartes) | non |
| 135 | Heardle : vidéo du jour non lisible dans le site (YouTube refuse la lecture intégrée, codes 100, 101, 150, 153) | non |
| 136 | Socle des nouveaux jeux (réservés aux admins) | non |
| 137 | Jeux du jour « devine en 6 essais » | non |
| 138 | Jeux solo (Démineur, Sudoku du jour, 2048) | oui |
| 139 | Réserves et images des jeux du jour | oui |
| 140 | Grilles du jour (Connexions, Mot mêlé, Anagramme, Nerdle, Mots croisés) | oui |
| 141 | Nouveaux duels (Dames, Échecs, Othello, pierre-feuille-ciseaux) ; relancée 4 fois, cause non notée | oui |
| 142 | Correctif des nouveaux duels (échecs) | oui |
| 143 | Blackjack et Poker sur le moteur des jeux de plateau | oui |
| 144 | Catan (version simplifiée) | oui |
| 145 | Pictionary | oui |
| 146 | Correctif des mots croisés | oui |
| 147 | Import automatique des images des jeux du jour (toutes les heures) | oui |
| 148 | Grilles du jour, deux correctifs | oui |
| 149 | Nerdle du gang : indice à la demande | oui |
| 150 | Accès des nouveaux jeux réglable dans « Accès aux pages » | oui |
| 151 | Blackjack : le journal détaille le jeu de la banque | oui |
| 152 | Plat du jour : on devine le nom du plat | oui |
| 153 | Statut « en ligne / hors ligne » et notifications sur le site | oui |
| 154 | Retrait du thème « Saison des Worlds » | oui |
| 155 | **Trou** (aucun fichier) | — |
| 156 | **Trou** (aucun fichier) | — |
| 157 | Classement des jeux du jour, récompenses à paliers | oui |
| 158 | Quêtes de profil validées par l'état du profil | oui |
| 159 | Liste des membres en ligne | oui |
| 160 | Flappy Domu : vitesse sans plafond, contrôle de score porté à 4 par seconde | oui |
| 161 | Rangement : chemins des pages et des illustrations des cartes | oui |
| 162 | Booster gratuit du jour selon le thème | oui |
| 163 | Emoji de la paillette par thème | oui |
| 164 | Thèmes Saint-Nicolas et Pâté-saucisse, effets « neige-emojis » et « braises » | oui |
| 165 | Referme les fonctions internes des plateaux (143 à 145) | oui |
| 166 | Suite de la 165 : fonctions internes des jeux de cartes et de Catan (143 à 145) | oui |

## Les trous et les doublons

**Trous** (aucun fichier au numéro) :
- **004, 007, 008, 010, 020** : absents du dépôt. Rien ne prouve qu'il s'agissait de migrations
  appliquées ; si c'était le cas, leur effet est dans le schéma reconstitué. Ne pas créer de fichier
  à ces numéros pour les « combler ».
- **057, 108, 155, 156** : absents, sans explication dans le dépôt. Même règle : ne pas les combler.
- **067** : brouillon (stock et dons de boosters) jamais appliqué, remplacé par 069 ; le numéro reste vide.

**Doublons** (plusieurs fichiers pour un même numéro). Ils sont tous rangés par suffixe ou par sujet ; l'ordre
d'application est donné entre parenthèses :
- **018** : `018_cartes_tables.sql` (tables), puis `018_cartes_fonctions.sql` (fonctions, qui les utilisent).
- **039** : `039_don_admin_fil.sql`, puis `039b_rarete_libelle.sql` (correctif appliqué sans fichier, reconstitué le 23/10).
- **052, 053, 054** : chaque réglage a son correctif `052b_…`, `053b_…`, `054b_…` (enregistrés en production sous
  `052_corrige`, `053_corrige`, `054_corrige`).
- **131** : `131_arcade_plafond_scores.sql` (plafond des scores de l'Arcade), puis `131_plateaux_robots.sql`
  (robots des jeux de plateau, renommage de « Nom de code » en « Codenames ») : deux sujets indépendants.
- **134** : cinq fichiers, indépendants entre eux : `134_adrep_duels.sql`, `134_adrep_jour.sql`,
  `134_adrep_plateaux.sql`, `134_adrep_salons.sql` (réponses admin des jeux, qui dépendent de la 133 : point
  d'entrée `hg_adrep_<jeu>`) et `134_musiques.sql` (série « Musiques »). Aucun ne dépend d'un autre.

Pour une nouvelle migration, la règle ci-dessus s'applique : numéro = plus haut + 1, sans combler de trou.

**Relances** : `supabase/appliquer.txt` / `appliquees.txt` notent `# relance 141` (quatre fois, cause non notée) :
la 141 a dû être relancée sans que la raison soit écrite. Noter la cause quand une migration est relancée.

## Rejouabilité

- **003** : chaque policy est précédée de `drop policy if exists`. Il exige désormais la clé
  `hg_settings.domursan_owner` (UUID du propriétaire Domursan, hors dépôt) pour la section 3 ;
  sans cette clé, la migration s'arrête à la section 3 avec un message explicite.
- **002** : le compte admin initial n'est plus écrit dans le dépôt. Il se lit dans
  `hg_settings.admin_initial` (`{"email": ..., "pseudo": ...}`), à insérer hors dépôt sur une base vierge.
- **021** : idempotente (`if not exists`, `create or replace`, `drop policy if exists`, `drop trigger if exists`,
  blocs `do` pour les contraintes). Testée deux fois de suite sans erreur sur une base de test.
- **001, 002, 006 à 019** : non modifiés, sauf 002 (ci-dessus). Certains ne sont pas rejouables tels quels
  (`create table` sans `if not exists`) : pour reconstruire une base vierge, utiliser le schéma reconstitué,
  pas un rejeu de l'historique.

## Pour appliquer 021

1. Relire `021_securite_cartes.sql`.
2. L'appliquer sur la base (une fois). Les contraintes `hg_profiles_color_format`, `hg_profiles_discord_format` et
   `hg_profiles_avatar_bucket` ont été vérifiées sur les données actuelles : aucune ligne en violation.
3. Déployer le front (`cartes.js`, `core.js`) en même temps : `cartes.js` envoie maintenant `p_request`
   à `hg_open_booster`, qui n'existe plus sous l'ancienne signature.
4. Pas de fonction edge à redéployer pour 021, ni de secret à créer.

## Pour appliquer 069

Migration `069_types_boosters.sql` : types de boosters, stock par type, achat, ouverture et dons de boosters (remplace le 067, jamais appliqué).

**Ce qu'elle ajoute**
- Tables `hg_booster_types` (les 9 types : prix, taille, taux, pool, limite par semaine, gratuit), `hg_booster_stock` (stock par membre et type), `hg_booster_pity` (garantie épique par type), `hg_booster_purchases` (achats, base des limites), `hg_booster_gifts` (dons, avec le type). RLS : lecture de ses lignes ; les types sont lisibles par les membres et modifiables par l'admin.
- RPC membres : `hg_booster_types_me()`, `hg_booster_buy(p_type, p_qty, p_request)`, `hg_booster_open(p_type, p_mode, p_request, p_set)`, `hg_booster_gift(p_to, p_type, p_qty, p_message, p_request)`, `hg_booster_gifts_me()`.
- Les types retirés de la vente (`active = false`) restent ouvrables et donnables depuis le stock ; `hg_booster_types_me` les renvoie avec `active: false` tant que le membre en a. Achat et ouverture payée refusés pour eux.
- Les boosters Collectionneur ne s'offrent pas. Le remboursement des cartes non données est calculé sur le prix payé par booster (dernier achat du membre pour ce type), jamais sur le prix actuel.
- Les taux des types sont validés par contrainte (`hg_booster_types_rates_check` : 7 raretés exactement, valeurs >= 0, somme entre 99,99 et 100,01). Les types ne sont modifiables que par les membres ayant la permission « cartes ».
- `hg_cards_me` renvoie en plus `boosters_stock`. `hg_cards_admin_bulk_give` verse les boosters offerts dans le stock « classique ».
- Le stock offert (`hg_wallets.gift_boosters`, migration 042) est versé dans le stock « classique » puis remis à 0.

**Idempotence et rétrocompatibilité**
- Rejouable : `create table if not exists`, `insert … on conflict do nothing` (relancer ne touche pas aux types : une modification faite par un admin est conservée), `create or replace`, policies, contraintes et clés étrangères dans des blocs `do` (`duplicate_object`). Testée sur une base PostgreSQL 16 locale neuve : migration appliquée deux fois, puis une troisième fois dans les contrôles (123 contrôles, 0 échec).
- `hg_open_booster_req` (042) garde sa signature, son chemin gratuit et son chemin offert, mais son chemin payant (`p_free => false`, `p_offert => false`) est refusé : « Les boosters s'achètent maintenant dans la Boutique ». Après la migration, son booster offert (`p_offert => true`) ne voit plus rien : le front doit ouvrir par `hg_booster_open(…, 'stock')`.
- Changement de signature : `hg_booster_gift` passe de 4 à 5 arguments (ajout de `p_request`). L'ancienne version est retirée par la migration. Un appel à 4 arguments reste valide (le dernier a une valeur par défaut).
- Erreurs à connaître pour le front : `don_deja_fait` (même requête de don rejouée par le même membre), « Les boosters Collectionneur ne s'offrent pas », « Ce booster n'est plus en vente » (ouverture payée ou gratuite d'un type retiré), « Les boosters s'achètent maintenant dans la Boutique » (ancien chemin payant).

**Pour appliquer 069**

1. Relire `069_types_boosters.sql`.
2. L'appliquer sur la base (une fois ; rejouable sans risque).
3. **Ordre : 069 d'abord, puis le front** (`cartes.js`, `cartes.css`, `cartes-boosters.css`, `sw.js`). Le front appelle les nouvelles RPC (dont `hg_booster_gift` à 5 arguments) : déployé avant la migration, il passerait en mode de repli (boutique et dons affichés « bientôt »).
4. Pas de fonction edge à redéployer pour 069, ni de secret à créer.

## Pour appliquer 071

Migration `071_boosters_admin.sql` : types de boosters modifiables depuis le panel (onglet « Boosters » des cartes), exclusions de raretés et de séries, Collectionneur sans identité ni « Les OG ».

**Ce qu'elle ajoute**
- `hg_booster_types` : colonnes `excluded_rarities text[]`, `excluded_sets text[]` (codes de `hg_card_sets`), `updated_by uuid` ; contraintes `hg_booster_types_excluded_rarities_check` (sous-ensemble des 7 raretés, pas toutes) et `hg_booster_types_id_format` (`^[a-z0-9_]{2,30}$`) ; index unique partiel `hg_booster_types_one_free` (un seul type `free_daily`).
- Table `hg_booster_opens` (une ligne par ouverture : type, mode, cartes données, remboursement), RLS sans policy : lue seulement par `hg_booster_type_stats`. Les statistiques d'ouverture commencent à l'application de 071.
- Tirage : `hg_booster_pick_one` passe à 6 arguments (séries exclues ; l'ancienne version à 5 arguments est retirée), `hg_booster_draw` et `hg_booster_open` gardent leur signature. Une rareté ou une série exclue n'est jamais tirée, ni par la garantie Épique, ni par le repli « sans restriction » du Collectionneur. Rareté tirée exclue : rareté autorisée inférieure, sinon supérieure. Pool « serie » : une série exclue est refusée à l'ouverture (« Cette série n'est pas disponible pour ce booster »). Remboursement inchangé (prix payé / taille, par carte non donnée).
- `hg_booster_types_me` renvoie en plus `excluded_rarities` et `excluded_sets` pour chaque type.
- RPC admin (`hg_has_perm('cartes')`) : `hg_booster_type_save(p jsonb)` (création avec `create: true`, sinon modification partielle ; id immuable ; un seul type gratuit du jour ; journal `hg_admin_log` action `booster_type` avec avant/après) et `hg_booster_type_stats()` (ventes 7 j / 30 j / total, ouvertures, stock détenu, dons, par type).
- Collectionneur : `excluded_rarities = {identite}`, `excluded_sets = {gang-membres}`, taux identité 0,1 -> 0 et commune 60 -> 60,1 (somme 100). Seulement si l'admin n'a rien modifié : exclusions écrites si elles sont vides et `updated_by` vide ; taux écrits seulement s'ils valent encore exactement ceux de 069.

**Idempotence et rétrocompatibilité**
- Rejouable : `add column if not exists`, `create table if not exists`, contraintes et index dans des blocs `do`, `create or replace`. Relancer 071 n'écrase jamais une modification faite par `hg_booster_type_save` (`updated_by` renseigné). Testée sur PostgreSQL 16 local : 069 puis 071 deux fois, suite 069 adaptée (123 contrôles) et suite 071 (86 contrôles), 0 échec.
- Changements de comportement voulus : le Collectionneur ne donne plus d'identité ni de carte « Les OG » (cartes non données remboursées ; s'il ne manque au membre que des cartes exclues, l'ouverture est refusée sans rien consommer, comme en 069).

**Pour appliquer 071**

1. Relire `071_boosters_admin.sql`.
2. L'appliquer sur la base (après 069 ; rejouable sans risque).
3. Puis le front (onglet admin « Boosters »). Le front membre existant continue de fonctionner sans changement.
4. L'affiche A3 des boosters est statique : la régénérer si les types changent.
5. Pas de fonction edge à redéployer, ni de secret à créer.

## Pour appliquer 074

Migration `074_securite_echanges.sql` (paquet C de l'audit de sécurité du 23/10) : idempotente, rejouable.

- **I3** : `hg_card_gift`, `hg_trade_propose`, `hg_trade_respond`, `hg_trade_cancel`, `hg_card_recycle` verrouillent les
  exemplaires (`for update`, ordre par id) avant de les contrôler, puis les déplacent par un `update` conditionnel
  (propriétaire, `recycled_at is null`, `locked_trade` attendu) dont le nombre de lignes est vérifié.
  `hg_trade_respond` verrouille aussi les exemplaires demandés. `hg_dyn_capture` prend un verrou consultatif par événement.
  Ordre des verrous : offre -> portefeuilles -> exemplaires.
- **m10** : don et offre refusés vers un compte fantôme.
- **M6** : Paillettes dans un échange : le compte qui les donne doit avoir au moins 7 jours (date la plus récente du
  compte Auth et du profil) ; chaque membre reçoit au plus 5 000 Paillettes par échange sur 7 jours glissants.
  Réglage `hg_settings.echanges` : `{"paillettes_max_semaine": 5000, "anciennete_jours": 7}` (permission « réglages »).
  Liens d'invitation : un lien sans limite reçoit 20 codes (en plus de ceux déjà générés) et 30 jours (trigger
  `hg_invite_links_defaults` ; clés facultatives `invites.lien_max_codes_defaut`, `invites.lien_validite_jours_defaut`).
  Les liens actifs sans limite sont mis à jour à l'application ; un lien nominatif (limite fixée) n'est pas touché.
- **M1** : `hg_open_booster(false)` lève « Achète tes boosters dans la Boutique » ; `hg_open_booster(true)` passe par
  `hg_open_booster_req` (même délai du booster gratuit). Le front n'appelle plus `hg_open_booster`.
- **M8** : `hg_push_subscriptions` : contrainte `hg_push_subscriptions_endpoint_check` (FCM, Mozilla, Apple, WNS ; `not valid`
  seulement si une ligne existante ne passe pas) et 5 appareils au plus par membre (trigger : les plus anciens sont retirés).

Ordre : 072, 073, puis 074, puis le front (`site/assets/espaces/cartes/cartes.js`, `site/assets/espaces/admin/admin-invite-links.js`). Aucune fonction
edge à redéployer, aucun secret.

## Pour appliquer 081

Migration `081_idees_c2.sql` (idées du gang C7 à C12, thème « Cartes et économie ») : idempotente, rejouable, rétrocompatible.

- **C7** : colonne `hg_cards.tag` (format `minecraft`, `sea-of-thieves`), RPC `hg_card_tags_complete(p_user)` (titres
  « Pilier de … », calculés, sans Paillettes). Série `le-gang-joue` créée **inactive** avec 24 cartes **inactives**, déjà
  illustrées (6 jeux × 4 ; SVG dans `site/assets/cartes/le-gang-joue/`, chemin absolu dans `image_url`, migration 161) : le Staff valide les
  légendes, puis active la série et les cartes **depuis l'admin**. Rejouer la migration remplit les images manquantes.
- **C8** : `hg_profiles.show_generation` (défaut vrai), réglage `cards.generations.og_before` (défaut 2023-09-01, Économie ›
  Limites), RPC `hg_card_generations()`.
- **C9** : tables `hg_gift_code_batches`, `hg_gift_codes` (codes hachés, `sha256` intégré : pas besoin de pgcrypto),
  `hg_gift_code_claims`, `hg_gift_code_attempts` (10 essais faux par heure). RPC `hg_gift_code_peek`, `hg_gift_code_redeem` ;
  Staff « cartes » : `hg_gift_codes_create` (200 codes, Paillettes ≤ `plafonds.code_paillettes` = 1000), `hg_gift_codes_batches`,
  `hg_gift_codes_batch_active`. Journal « code ».
- **C10** : `hg_card_recipes`, `hg_card_recipe_uses`, `hg_card_copies.consumed_by`, source « atelier » ajoutée à
  `hg_card_copies_source_check` (reconstruite à partir des valeurs existantes). RPC `hg_card_recipes_me`,
  `hg_card_recipe_craft` ; Staff : `hg_card_recipes_admin`, `hg_card_recipe_save` (carte obtenue non fabricable, valeur de
  recyclage ≤ ingrédients + Paillettes). Journal « atelier ».
- **C11** : `hg_card_auctions`, `hg_card_bids`. RPC `hg_auction_current` (clôt aussi les enchères échues), `hg_auction_bid` ;
  `hg_auction_close` (service, idempotente) ; Staff : `hg_auction_create`, `hg_auction_cancel`, `hg_auctions_admin`.
  Journal « enchere » / « enchere_remboursee ».
- **C12** : `hg_profiles.trade_board`, `trade_board_note` (80 caractères), index `hg_card_copies_card_owner_live`.
  RPC `hg_trade_board`, `hg_trade_board_set` ; Staff : `hg_trade_board_note_clear`.

Ordre : 081, puis le front. Aucune fonction edge à redéployer, aucun secret, aucune permission nouvelle (tout passe par « cartes »).

## Pour appliquer 104 (Arène v2)

- **104_arene_v2.sql** : tables `hg_arena_seasons`, `hg_arena_ratings`, `hg_arena_fights`, `hg_arena_results` (fermées aux
  clients, accès par RPC), réglages `hg_settings.arena` (défauts dans `hg_arena_cfg`), saison 1 créée à la fin du script.
  RPC membres (gardées par `hg_arena_gate`, refusées tant que `arena.v2_public` n'est pas vrai, sauf pour l'administrateur) :
  `hg_arena_me`, `hg_arena_attack`, `hg_arena_seen`, `hg_arena_board`. RPC Staff « cartes » : `hg_arena_admin`,
  `hg_arena_settings_save` (ouverture aux membres réservée à l'administrateur), `hg_arena_season_close`.
  Journal « arene_reglages » et « arene_saison_cloturee ».
- Gains : raisons `arene`, `arene_def`, `arene_saison`, `arene_booster` dans `hg_wallet_log`. Le deck de défense est
  celui de l'Arène actuelle (`hg_battle_decks`, `hg_battle_set_deck`), inchangé.
- Aucune permission nouvelle. Les membres ne voient rien tant que l'administrateur n'ouvre pas l'Arène v2 dans le panel.
