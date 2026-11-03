# Audit de sécurité : Humane Gang

Date : 23/10/2026. Branche `securite`. Périmètre : base Supabase (projet `zqbdzokyhgavgmqgiwuw`), front statique (GitHub Pages, humane-gang.com), fonctions edge (`supabase/functions/`), bot Discord, dépendances CDN.

## Résumé

- Aucune faille critique ni haute confirmée.
- 18 constats : 3 moyens, 11 bas, 4 informatifs.
- L'audit de la base a été fait en lecture seule sur la production (aucun DDL, aucune migration appliquée).
- Corrigé dans le dépôt, côté front : SRI du chargeur Leaflet partagé ; effacement de la copie hors ligne à la déconnexion depuis la page Compte et le panel admin.
- Migration à appliquer par le propriétaire : `supabase/migrations/105_securite.sql` (retrait de privilèges inutiles). Elle a été validée sur une copie de test (voir plus bas), pas appliquée.
- Décisions à prendre par le propriétaire : voir la section « À décider ».

## Constats

Gravité : haute / moyenne / basse / info. « Corrigé » = correctif dans le dépôt ; « Migration 105 » = à appliquer ; « À décider » = choix du propriétaire.

| # | Gravité | Constat | Lieu | Preuve | Correctif |
|---|---|---|---|---|---|
| 1 | Moyenne | `anon` et `authenticated` ont INSERT, UPDATE, TRUNCATE, REFERENCES et TRIGGER sur des tables sans politique qui les accorde. La RLS les bloque aujourd'hui, mais une politique future mal écrite ouvrirait l'écriture directe ; TRUNCATE n'est pas soumis à la RLS. | Base, `public.hg_*` (16 couples de privilèges) | `information_schema.role_table_grants` en production. Test à blanc : `update hg_wallets` par un membre renvoie « 0 ligne » avant, « permission denied » après | Migration 105 (bloc DO) |
| 2 | Basse | `hg_role_grants(uuid, text)` est exécutable par `authenticated` et renvoie les rôles d'un autre membre. Elle n'est appelée que par `hg_page_ok` (SECURITY DEFINER). | Base, `public.hg_role_grants` | `has_function_privilege` : `t` pour authenticated. Test à blanc : `t` avant, « permission denied » après | Migration 105 (`revoke execute`) |
| 3 | Moyenne | ~~Pas d'empreinte SRI sur `supabase-js` chargé depuis jsDelivr.~~ Périmé : `supabase-js`, `qrcode-generator` et `html-to-image` sont désormais servis par le site lui-même (`site/assets/vendor/`, version figée, contrôlée par `tests/controles/vendor-check.cjs`). Le seul script encore chargé depuis jsDelivr est Leaflet 1.9.4, avec empreinte SRI. | `site/assets/vendor/`, `site/assets/commun/leaflet-load.js` | Lecture du code | Corrigé (bibliothèques locales) |
| 4 | Moyenne | Protection contre les mots de passe fuités désactivée dans Auth. | Réglage du tableau de bord Supabase | Advisor de sécurité Supabase | À décider (réglage du tableau de bord, pas de code) |
| 5 | Basse | Pas de SRI sur `qrcode-generator@1.4.4` (admin : codes et liens d'invitation). | `site/assets/espaces/admin/cartes/codes.js`, `admin-invite-links.js` | Lecture du code | À décider |
| 6 | Basse | Le chargeur Leaflet partagé (pages/jeux/jeux.html, pages/admin/admin.html) ne vérifiait pas l'empreinte du script ni de la feuille de style. | `site/assets/commun/leaflet-load.js` | Lecture du code | Corrigé : mêmes empreintes que `irl-history.js`, `crossOrigin` ajouté |
| 7 | Basse | Déconnexion depuis la page Compte et le panel admin : la copie hors ligne (IndexedDB « hg-offline ») n'était pas effacée, contrairement au menu d'en-tête. Risque sur un poste partagé. | `site/assets/commun/core/supabase.js` (`signOutDevice`) | Lecture du code comparée à `core/header.js` | Corrigé : `clearOffline()` avant `signOut` |
| 8 | Basse | La clé `service_role` sert de secret HMAC dans `hg-support` (signature des liens). Si la clé change, les liens cassent ; si elle fuit, la signature est compromise avec elle. | `supabase/functions/hg-support/index.ts` | Lecture du code | À décider |
| 9 | Basse | Politiques `*_own` sur les tables `d_*` : vérifiées en lecture seule, non modifiées. | Base, politiques `d_*` | `pg_policies` | À décider (à relire avec le propriétaire) |
| 10 | Basse | Dans le bucket `hg-assets`, le dossier `cine/` accepte l'écriture de tout membre. | Base, `storage.objects` | `pg_policies` | À décider |
| 11 | Basse | Bucket `d-files` public, vide aujourd'hui. Latent : tout fichier déposé deviendrait public. | Base, `storage.buckets` | Requête sur `storage.buckets` et `storage.objects` | À décider (passer en privé avant tout dépôt) |
| 12 | Basse | Extension `pg_net` installée dans le schéma `public`. | Base | `pg_extension` | À décider (déplacer dans un schéma dédié) |
| 13 | Basse | `hg_client_error` (télémétrie d'erreurs) a un plafond global de 500 par heure : un visiteur peut saturer la télémétrie pour tous. | Base, fonction `hg_client_error` | Lecture de la fonction | À décider |
| 14 | Basse | Privilège DELETE accordé à `anon` et `authenticated` sur les tables sans politique de suppression. Sans politique, la RLS refuse la suppression, mais une politique future pourrait l'ouvrir. Non traité par la migration 105 (voir « À décider »). | Base, `public.hg_*` | `information_schema.role_table_grants` | À décider |
| 15 | Info | CORS `*` sur les fonctions edge partagées. Acceptable tant que les fonctions n'utilisent pas de cookies. | `supabase/functions/_shared/discord.ts` | Lecture du code | Aucun |
| 16 | Info | Pas de `frame-ancestors` dans la CSP (la protection contre l'affichage dans une iframe repose sur l'hébergeur GitHub Pages). | Pages HTML (meta CSP) | Lecture des pages | Aucun (une meta ne peut pas le porter) |
| 17 | Info | ~~CSP : `script-src` autorise `/npm/` de jsDelivr en entier.~~ Périmé : `script-src` est restreint à `https://cdn.jsdelivr.net/npm/leaflet@1.9.4/` sur les pages concernées (aucun autre paquet npm ne peut s'exécuter). `sw.js` ne met en cache jsDelivr que cette adresse. | Pages HTML, `site/sw.js` | Lecture des CSP ; `parcours-securite-front` refuse tout autre paquet | Corrigé |
| 18 | Info | `hg_has_perm` et `hg_is_staff` sont exécutables par `anon`. Elles ne renvoient rien d'exploitable sans session. | Base | `has_function_privilege` | Laissé en l'état |

## Ce qui a été vérifié sans problème

- RLS activée sur les tables sensibles du modèle (profils, staff, portefeuilles, événements, accès aux pages).
- Fonctions SECURITY DEFINER : `search_path` fixé ; `hg_wallet_add`, `hg_card_give`, `hg_award_badges` non exécutables par `authenticated`. `hg_battle_attack`, `hg_booster_gift`, `hg_card_gift`, `hg_trade_propose`, `hg_thank`, `hg_proof_review`, `hg_quote_author_*`, `hg_group_remove`, `hg_gaming_get`, `hg_friendship`, `hg_open_direct`, `hg_ss_is_santa_of`, `hg_toggle_reaction` contrôlent bien l'appelant.
- Mode dieu, contrôles admin et « voir en tant que » : vérifiés côté serveur (`hg_god_mode`, `hg_set_god_mode`, `hg_admin_view_as`, `hg_has_perm` dans les politiques). Les masques côté client ne sont pas la protection.
- Migrations 072 à 079 : appliquées en production (`list_migrations`). Aucun correctif nouveau pour ces failles.
- Fonctions edge Discord : signature Ed25519 vérifiée avec une fenêtre de temps (`MAX_SKEW_S`).
- Secret du cron : comparé par SHA-256 (`cronAuthorized`).
- Front : `esc()` (`core/util.js`) utilisé pour l'échappement dans les rendus examinés ; pas de `javascript:` trouvé dans les liens examinés ; pas de secret côté client ; redirection de connexion (`compte.js`) validée par regex.
- Service worker : Supabase jamais mis en cache.
- CSP présente sur les 27 pages HTML.

## Limites de l'audit

- L'échantillonnage XSS a porté sur les rendus `innerHTML` et `insertAdjacentHTML` les plus exposés, pas sur l'ensemble du code.
- Les empreintes SRI de Leaflet (reprises de `irl-history.js`) n'ont pas pu être revérifiées : jsDelivr répond 403 depuis l'environnement d'audit, et le registre npm était injoignable. Il faut les contrôler en local avant la mise en production.
- La migration 105 a été validée sur un modèle minimal reproduisant les rôles Supabase, la RLS et la chaîne SECURITY DEFINER (PostgreSQL 16 jetable), pas sur une copie complète du schéma de production. Résultats : T4 et T5 passent de « 0 ligne » ou « true » à « permission denied » ; T1, T2, T3, T6 et T7 inchangés (T7 : refus avant et après). Le bloc DO ne retire un privilège que s'il n'existe aucune politique qui l'accorde.
- Après la migration, `hg_pages` garde INSERT, UPDATE, REFERENCES, TRIGGER et TRUNCATE pour `authenticated` : la politique `pages_admin` est de type `ALL`, donc le bloc la considère comme couvrant ces privilèges. C'est voulu mais à relire.

## Tests

- `npm run -s check` : 444 fichiers JavaScript sans erreur ; publication sans problème.
- Tests navigateur : `parcours-j1` (40 OK), `parcours-collection-hors-ligne` (28 OK), `parcours-connexion` (9 OK), `parcours-session` (13 OK).
- `parcours-securite-front` : 26 OK, 1 ECHEC préexistant (la CSP de `pages/jeux/jeux.html` autorise YouTube, le test attend `script-src` limité à `'self'` et `/npm/`). Non introduit par ces changements, non corrigé ici.
- `parcours-j1` : le faux Leaflet ne correspond pas à l'empreinte SRI. Le test ignore donc `integrity` pour ses propres pages ; la production garde la SRI.

## À décider

1. ~~**SRI sur `supabase-js` et `qrcode-generator`**~~ : réglé, les fichiers sont hébergés dans `site/assets/vendor/` et la CSP ne vise plus que Leaflet sur jsDelivr (02.11.2026).
2. **Mots de passe fuités** : activer la protection dans le tableau de bord Supabase (Auth > Passwords). Réglage, pas de code.
3. **Clé `service_role` comme secret HMAC** (`hg-support`) : créer un secret dédié (`HG_SUPPORT_HMAC_SECRET`) et migrer les liens existants.
4. **Politiques `*_own` sur `d_*`, dossier `cine/` de `hg-assets`** : confirmer que l'écriture publique ou les politiques sont voulues.
5. **Bucket `d-files`** : le passer en privé avant d'y déposer des fichiers.
6. **Privilège DELETE** : le retirer des tables sans politique de suppression. Non inclus dans la migration 105 car le retrait peut toucher des usages prévus par le propriétaire. Pour `hg_pages`, les privilèges TRUNCATE, REFERENCES et TRIGGER restent (politique `ALL`).
7. **`pg_net` dans `public`** : le déplacer dans un schéma dédié.
8. **Plafond de `hg_client_error`** : le passer par visiteur ou par IP, plutôt que global.
9. **`supabase/migrations/README.md`** : périmé (indique 072 à 079 « à appliquer » alors qu'elles sont appliquées). Non modifié.
10. **Test CSP `parcours-securite-front`** : mettre à jour l'attendu (YouTube dans `pages/jeux/jeux.html`) ou retirer YouTube de la CSP.

## Audit du 29/10/2026 (correctifs)

Rapport complet hors dépôt. Corrigé par la migration `176_audit_correctifs.sql` et par `hg-birthdays` :

- **Loup-Garou** : `hg_lg_parties.etat` (victime des loups pendant le réveil) n'est plus lisible par les joueurs ni diffusé en temps réel ; un mort non loup ne lit plus le canal `loups` ; une étape ne saute plus quand deux appels arrivent ensemble.
- **Uno** : `hg_uno_parties.defi` (dont `legal`) et `pioche_carte` ne sont plus lisibles ni diffusés.
- **Photos** : une photo ou un moment masqué n'est plus lisible dans le bucket `hg-photos` (sauf l'auteur et le Staff « souvenirs » ou « support »).
- **Invitations** (5 jeux à salon) : codes à 4 chiffres, donc plus de 15 codes inconnus essayés en 10 minutes depuis un même appareil sont refusés (`hg_invite__frein`, table `hg_invite_essais`, empreinte de l'adresse gardée une heure au plus).
- **Privilèges** : la migration 105 était bien appliquée ; les quatre tables créées depuis (`hg_jeux_bonus`, `hg_jeux_resultats`, `hg_presence`, `hg_site_notifs`) perdent les écritures directes inutiles.
- **Bot** : le pseudo est échappé (Markdown) dans l'annonce et le MP d'anniversaire.

Reste à faire par le propriétaire : activer la protection contre les mots de passe fuités (tableau de bord Supabase › Authentication › Sign In / Providers › Email › « Prevent use of leaked passwords »).
Les points 3 et 5 de la liste ci-dessus sont réglés (clé `hg_support_hash_key`, bucket `d-files` privé).

## Challenges de la semaine (migration 218, 03/11/2026)

- **Bucket privé `hg-challenges`** (25 Mo, images, vidéos, sons, PDF, texte brut, zip, documents bureautiques ; jamais HTML ni SVG). Chemin `<challenge_id>/<nom aléatoire>.<ext>` : le dossier du membre n'est pas dans le chemin, car les chemins sont donnés aux votants pendant le vote anonyme. Le propriétaire est `storage.objects.owner_id`, posé par l'API de stockage.
- **Dépôt** : membre, challenge en participation qui attend un fichier, nom et extension contrôlés, 20 fichiers par challenge et 200 au total par membre (`hg_wch__obj_depot_ok`, fonction à part pour éviter la récursion des politiques). **Lecture** : propriétaire, admin, ou membre quand le fichier appartient à une participation d'un challenge non annulé dont la participation est finie (`hg_wch__obj_visible`). **Suppression** : propriétaire et admin.
- **Tables** : aucune lecture ni écriture directe des membres (RLS admin seulement) ; tout passe par les RPC `hg_wch_*`. Les voix des autres ne sortent jamais d'une RPC de membre ; pendant le vote, ni auteur ni nombre de voix.
- **Fichiers orphelins** : SQL ne peut pas effacer un objet du stockage (`storage.protect_delete`). Les fichiers sans participation (purge à 12 mois, retrait, compte supprimé) sont listés par `hg_wch_admin_orphelins` et retirés par le panel après une purge manuelle (Entretien).
- **Reste à surveiller** : le nom d'origine du fichier (`file_name`) est rendu pendant le vote ; un membre qui y met son pseudo se dévoile.
