# Sauvegarde de la base

Le workflow `.github/workflows/sauvegarde.yml` exporte la base chaque nuit à 3 h 11 UTC (et avec le bouton « Run workflow »), chiffre
l'export et le dépose en artefact GitHub pendant 30 jours. Un échec est signalé au salon Staff par le webhook de la CI.

Le dépôt est public : **n'importe qui peut télécharger les artefacts**. Seule la phrase de passe protège les données (comptes,
empreintes de mots de passe, messages). Elle doit être longue, aléatoire, et n'exister que dans le secret GitHub et dans un
gestionnaire de mots de passe. Perdue, les sauvegardes sont illisibles ; divulguée, elles le sont pour tout le monde.

## Ce qui est couvert

| Fichier de l'artefact | Contenu |
| --- | --- |
| `public-<date>.dump.gpg` | Schéma `public` : structure, données et droits |
| `auth-storage-<date>.dump.gpg` | Données de `auth` (comptes) et de `storage` (liste des buckets et des fichiers) |

**Ne sont pas couverts :**

- **Les fichiers du stockage** (photos, avatars…) : `storage.objects` ne contient que leurs références, pas leur contenu.
- La structure de `auth` et de `storage`, qui appartient à Supabase. Donc aussi les 27 politiques posées sur `storage` et le
  déclencheur `hg_auth_user_gone` sur `auth.users` : ils sont dans les migrations (`002`, `003`, `005`, `019`, `037`…).
- Les tâches `pg_cron`, les secrets du coffre (`vault`), les secrets et le code des fonctions edge (le code est dans le dépôt).

## Créer les secrets (une seule fois)

Dans GitHub : Settings › Secrets and variables › Actions › New repository secret.

1. `HG_BACKUP_PASSPHRASE` : générer la phrase avec `openssl rand -base64 32`, puis la ranger dans un gestionnaire de mots de passe.
2. `SUPABASE_DB_URL` : dans Supabase, bouton Connect › **Session pooler**, adresse complétée avec le mot de passe de la base.
   Elle ressemble à `postgresql://postgres.zqbdzokyhgavgmqgiwuw:<mot de passe>@aws-…pooler.supabase.com:5432/postgres`.
   La connexion directe (`db.<ref>.supabase.co`) n'est joignable qu'en IPv6, que les runners GitHub n'ont pas. Le Transaction pooler
   (port 6543) ne convient pas à `pg_dump`. Si le mot de passe contient des caractères spéciaux, les encoder (`@` devient `%40`…).

`DISCORD_CI_WEBHOOK` existe déjà (voir `ci.yml`). Lancer ensuite le workflow à la main (Actions › « Sauvegarde de la base » › Run
workflow) et vérifier que l'artefact apparaît.

GitHub désactive les workflows planifiés d'un dépôt public après 60 jours sans commit : l'onglet Actions propose alors de les réactiver.
Aucune alerte ne part dans ce cas.

## Télécharger

Actions › « Sauvegarde de la base » › choisir une exécution réussie › Artifacts › `sauvegarde-<date>-…`. On obtient un ZIP qui contient
les deux fichiers `.gpg`. Avec la CLI GitHub : `gh run download <numéro d'exécution>`.

## Déchiffrer

Sur un poste de confiance, avec `gpg` installé (il demande la phrase de passe) :

```sh
gpg --output public.dump --decrypt public-<date>.dump.gpg
gpg --output auth-storage.dump --decrypt auth-storage-<date>.dump.gpg
```

Les fichiers `.dump` sont en clair : les supprimer dès la restauration faite, ne jamais les ajouter au dépôt.

## Restaurer

Il faut `pg_restore` et `psql` en version 17 ou plus. À faire de préférence sur un **projet Supabase neuf**, en version 17 : ces commandes
écrasent le schéma `public` de la base visée. La restauration n'a pas encore été essayée en conditions réelles : faire un essai à blanc
sur un projet neuf avant d'en avoir besoin.

```sh
export CIBLE='postgresql://postgres.<ref du projet cible>:<mot de passe>@aws-…pooler.supabase.com:5432/postgres'

# 1. Extensions utilisées (pgcrypto et uuid-ossp sont déjà là sur un projet neuf).
psql "$CIBLE" -c 'create extension if not exists pg_cron;' -c 'create extension if not exists pg_net schema extensions;'

# 2. Comptes et stockage d'abord : les tables de public y font référence.
pg_restore --dbname="$CIBLE" --data-only --no-owner auth-storage.dump

# 3. Schéma public, structure et données.
pg_restore --dbname="$CIBLE" --clean --if-exists --no-owner public.dump
```

Puis, dans cet ordre :

1. Reposer le déclencheur `hg_auth_user_gone` (migration `019`) et les politiques de `storage.objects` (migrations `002`, `003`, `005`,
   `037`, puis celles qui les modifient : `grep -l 'storage\.objects' supabase/migrations/*`).
2. Replanifier les tâches `pg_cron` : les blocs `cron.schedule` des migrations (`grep -l 'cron\.schedule' supabase/migrations/*`).
3. Recopier les secrets du coffre et des fonctions edge, redéployer les fonctions (`docs/` et `supabase/functions/DEPLOY.md`).
4. Remettre les fichiers du stockage, s'ils ont été perdus : ils ne sont pas dans cette sauvegarde.
5. Supprimer les fichiers `.dump`.

Restauration d'une seule table (dans le projet en ligne, avec précaution) :

```sh
pg_restore --dbname="$SUPABASE_DB_URL" --data-only --no-owner --table=hg_profiles public.dump
```

Cette commande ajoute aux lignes existantes : renommer ou vider la table d'abord, sinon les clés primaires entrent en conflit.

## Si la sauvegarde échoue

- `Le secret … manque` : voir « Créer les secrets ».
- `server version mismatch` : Supabase est passé à une version majeure supérieure. Augmenter `PG_MAJEUR` en tête du workflow.
- Erreur de connexion : mot de passe de la base changé, ou adresse qui n'est pas celle du Session pooler.
- Projet en pause (plan gratuit) : le réactiver depuis le tableau de bord Supabase.
