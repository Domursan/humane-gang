# Déploiement des fonctions edge (Humane Gang)

**Le plus simple : depuis GitHub.** Modifier `supabase/functions/a-deployer.txt` (une fonction par ligne) sur main les déploie aussi. Onglet « Actions » › « Déployer une fonction » › « Run workflow » › choisir la fonction.
Le workflow `.github/workflows/deploy-functions.yml` déploie la version de main avec le bon `verify_jwt` (tableau ci-dessous).
Il demande une fois le secret GitHub `SUPABASE_ACCESS_TOKEN` (jeton personnel Supabase, Account › Access Tokens).

Les fonctions importent le dossier partagé `_shared/` (modèles des messages du bot, annonces des événements).
Chaque déploiement doit donc envoyer `index.ts` **et** les fichiers partagés, en gardant les chemins relatifs
(`index.ts` importe `../_shared/templates.ts`, qui importe `./bot-templates.json` ; `hg-notify` et `hg-cron`
importent aussi `../_shared/dyn-announce.ts`).

| Fonction | Fichiers à envoyer | verify_jwt |
|---|---|---|
| `hg-notify` | `hg-notify/index.ts`, `_shared/discord.ts`, `_shared/templates.ts`, `_shared/bot-templates.json`, `_shared/dyn-announce.ts`, `_shared/mentions.ts`, `_shared/channels.ts`, `_shared/bot-media.ts`, `_shared/reglages.ts`, `_shared/presence.ts`, `_shared/notif-prefs.ts` | `true` |
| `hg-support` | `hg-support/index.ts`, `_shared/discord.ts`, `_shared/templates.ts`, `_shared/bot-templates.json` | `false` |
| `hg-birthdays` | `hg-birthdays/index.ts`, `_shared/discord.ts`, `_shared/cron-auth.ts`, `_shared/templates.ts`, `_shared/bot-templates.json`, `_shared/mentions.ts`, `_shared/channels.ts`, `_shared/presence.ts`, `_shared/notif-prefs.ts` | `false` |
| `hg-cron` | `hg-cron/index.ts`, `_shared/cine-announce.ts` (migration 087), `_shared/discord.ts`, `_shared/cron-auth.ts`, `_shared/templates.ts`, `_shared/bot-templates.json`, `_shared/dyn-announce.ts`, `_shared/mentions.ts`, `_shared/channels.ts`, `_shared/reglages.ts`, `_shared/presence.ts`, `_shared/notif-prefs.ts`, `_shared/saisons-cron.ts` | `false` |
| `hg-album` | `hg-album/index.ts`, `_shared/discord.ts` (CORS et réponse JSON ; aucun appel Discord, pas de jeton) ; dépendances `npm:fflate`, `npm:@supabase/supabase-js` | `true` |
| `hg-archive` | `hg-archive/index.ts`, `hg-archive/lib.ts`, `_shared/discord.ts` (CORS) ; dépendances `npm:fflate`, `npm:@supabase/supabase-js` ; migration 093 (RPC `hg_archive_year`) appliquée avant | `true` |
| `hg-push` | `hg-push/index.ts`, `_shared/cron-auth.ts`, `_shared/notif-prefs.ts`, `_shared/ton-tour.ts`, `_shared/discord.ts`, `_shared/templates.ts`, `_shared/bot-templates.json` | `false` |
| `hg-discord` | `hg-discord/index.ts`, `hg-discord/handler.ts`, `hg-discord/lib.ts` (pas de `_shared`) | `false` |
| `hg-calendar` | `hg-calendar/index.ts`, `hg-calendar/feed.ts` (pas de `_shared`) | `false` |
| `hg-nj-images` | `hg-nj-images/index.ts`, `_shared/cron-auth.ts` ; migrations 137 et 139 appliquées avant | `false` |

`_shared/discord.ts` (client Discord : MP, salon, 429) est commun aux quatre fonctions ; `_shared/cron-auth.ts` contrôle
l'en-tête `x-cron-secret` de `hg-cron` et `hg-birthdays`.

Point d'entrée : `index.ts` pour toutes.

## Avec l'outil MCP `deploy_edge_function`
`files` (noms relatifs au dossier de la fonction) :
```
[
  { "name": "index.ts",                    "content": "<supabase/functions/hg-notify/index.ts>" },
  { "name": "../_shared/templates.ts",     "content": "<supabase/functions/_shared/templates.ts>" },
  { "name": "../_shared/bot-templates.json","content": "<supabase/functions/_shared/bot-templates.json>" }
]
```
avec `entrypoint_path: "index.ts"` et `verify_jwt` selon le tableau. Même chose pour `hg-support` et `hg-birthdays`.
Pour `hg-notify` et `hg-cron`, ajouter aussi :
```
  { "name": "../_shared/dyn-announce.ts",  "content": "<supabase/functions/_shared/dyn-announce.ts>" }
```
Pour `hg-notify`, `hg-cron` et `hg-birthdays`, ajouter aussi (salons par type, `_shared/channels.ts`, et mentions) :
```
  { "name": "../_shared/channels.ts",      "content": "<supabase/functions/_shared/channels.ts>" },
  { "name": "../_shared/mentions.ts",      "content": "<supabase/functions/_shared/mentions.ts>" }
```
(`hg-notify` et `hg-cron` importent aussi `../_shared/reglages.ts` ; `hg-notify` importe `../_shared/bot-media.ts`.)
Pour `hg-album`, ajouter `{ "name": "../_shared/discord.ts", "content": "<supabase/functions/_shared/discord.ts>" }` (en plus de `index.ts`).

## Avec la CLI
```
supabase functions deploy hg-notify
supabase functions deploy hg-support --no-verify-jwt
supabase functions deploy hg-birthdays --no-verify-jwt
supabase functions deploy hg-cron --no-verify-jwt
```
(la CLI embarque automatiquement `_shared/`).

## Notes
- Secrets inchangés : `DISCORD_BOT_TOKEN`, `SITE_URL` (facultatif), `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (fournis).
- Base : `hg_settings` clé `bot_templates` et table `hg_bot_log` (migration 011, déjà appliquée).
- `bot-templates.json` est aussi lu par l'éditeur de l'administration (`TEMPLATES_URL` dans `site/assets/espaces/admin/admin-bot.js`) : voir le point d'attention ci-dessous.

### Attention : `_shared` n'est pas publié
Seul le dossier `site/` est publié sur GitHub Pages (voir `docs/PUBLICATION.md`). `supabase/functions/_shared/bot-templates.json`
n'est donc plus servi par le site. Les fonctions edge l'importent depuis le dépôt : pas de problème pour elles.
En revanche, l'éditeur de l'administration le lit à une adresse relative qui sort du dossier publié
(`TEMPLATES_URL` dans `site/assets/espaces/admin/admin-bot.js`) : avant la mise en ligne du rangement, il faut une copie
sous `site/` (ou une lecture de l'adresse brute GitHub) et mettre `TEMPLATES_URL` à jour. Sans cela, l'admin affiche
un avertissement et ne peut pas éditer les modèles.

## Rappels, secret cron et anti-doublons : ordre à suivre

1. Appliquer la migration `supabase/migrations/020_bot_rappels.sql` (colonnes seulement, idempotente).
2. Secret des tâches planifiées : ligne `cron_secret` de la table privée `public.hg_private` (voir la fin de la migration 020 ;
   la variable d'environnement `CRON_SECRET`, si elle existe, est prioritaire). Sans secret, `hg-cron` et `hg-birthdays` refusent tout (401).
3. Déployer `hg-notify`, `hg-support`, `hg-birthdays` et `hg-cron` (tableau ci-dessus).
4. Mettre à jour les deux tâches pg_cron pour qu'elles envoient le secret (voir ci-dessous).

Tâches pg_cron (éditeur SQL). Remplacer `<CRON_SECRET>` par la valeur du secret, à l'identique :
```sql
select cron.unschedule('hg-cron-5min');
select cron.schedule(
  'hg-cron-5min',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://zqbdzokyhgavgmqgiwuw.supabase.co/functions/v1/hg-cron',
      headers := '{"Content-Type":"application/json","x-cron-secret":"<CRON_SECRET>"}'::jsonb,
      body := '{}'::jsonb)$$
);
```
Pour `hg-birthdays-daily` : lire la planification actuelle avec `select jobname, schedule, command from cron.job;`,
puis garder la même planification et remplacer la commande par celle de `hg-cron-5min` (URL
`.../functions/v1/hg-birthdays`) en ajoutant le même en-tête `x-cron-secret`. Le secret est alors stocké dans la
commande de la tâche (visible des administrateurs du projet) ; pour éviter cela, on peut le lire depuis Vault.

Journal : chaque passage qui fait quelque chose (annonce, rappel, anniversaire, échec) laisse une ligne dans
`hg_bot_log` (kinds `auto:cron` et `auto:anniversaire`), visible dans l'historique du bot de l'administration.

## Salons des annonces par type (bot.channels) et migration 056

- Réglage : `hg_settings.bot.channels = { <type>: '<ID de salon>' }`, saisi dans la section « Salon par type d'annonce »
  de la page Bot Discord. Types : `draw`, `irl`, `birthday`, `dyn`, `card_pull`, `card_trade`. Un type vide utilise le salon d'annonces.
- Anniversaires : `channels.birthday`, sinon l'ancien réglage `birthday_channel_id` (gardé en miroir par l'admin), sinon le salon d'annonces.
- Les MP et l'annonce manuelle de l'admin (`admin_dm`) ne changent pas.
- Migration `supabase/migrations/056_canaux_annonces.sql` : ajoute `hg_card_trades.notified_at` (nullable, idempotente).
  **L'appliquer avant de redéployer `hg-notify`** : l'anti-doublon des offres d'échange (`trade_offer`) écrit cette colonne.
- Redéployer, dans cet ordre : `hg-notify`, `hg-cron`, `hg-birthdays` (tableau ci-dessus, avec `_shared/channels.ts`), puis `hg-album`
  (il importe désormais `_shared/discord.ts`).
- Tant que ces fonctions ne sont pas redéployées, le site continue de fonctionner : l'ancien comportement (salon d'annonces) reste valable.

## Cartes à collectionner : redéployer hg-notify
Les événements `card_pull` (belle carte obtenue) et `card_trade` (échange conclu) sont dans `hg-notify/index.ts`.
Les modèles `card_pull_announce` et `card_trade_announce` sont dans `_shared/bot-templates.json` et `_shared/templates.ts`.
**Redéployer `hg-notify`** (même fichiers que le tableau ci-dessus, aucun nouveau fichier partagé).
Aucun nouveau secret. Sans redéploiement, le site enverra `card_pull` et la fonction répondra « Événement inconnu ».
Aucune migration nouvelle pour cette fonction. Les règles d'accès (RLS) de la vitrine des cartes sont déjà en base et
figurent dans `supabase/schema/schema_reel_2026-10-21.sql` (section « Policies RLS »). Le fichier
`018_cartes_vitrine_rls.sql` mentionné auparavant n'a jamais existé dans le dépôt.

## hg-cron : tâches planifiées (toutes les 5 minutes)
Annonce automatiquement sur Discord le lancement et la fin des événements dynamiques (`hg_dyn_events` avec
`announce = true`). Idempotente : appelée deux fois, elle n'annonce rien de plus. Sans `DISCORD_BOT_TOKEN` ou sans
salon d'annonces, elle ne marque rien (les annonces partiront dès que le bot sera configuré), sauf la fin d'un
événement terminé depuis plus de 24 h, marquée sans envoi.

Tâche pg_cron à créer (éditeur SQL, une seule fois) :
```sql
select cron.schedule(
  'hg-cron-5min',
  '*/5 * * * *',
  $$select net.http_post(
      url := 'https://zqbdzokyhgavgmqgiwuw.supabase.co/functions/v1/hg-cron',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb)$$
);
```
(même forme que `hg-birthdays-daily` ; pour l'arrêter : `select cron.unschedule('hg-cron-5min');`).

## Album téléchargeable (hg-album)
Fonction `hg-album` : assemble en ZIP, en flux, les photos d'une sortie (bucket privé `hg-photos`), pour le bouton
« Tout télécharger » de l'album (`site/assets/espaces/irl/irl.js`, `downloadAlbum` dans `site/assets/espaces/irl/photos.js`).
- Déployer `supabase/functions/hg-album/index.ts` seul, avec `verify_jwt` à `true` (tableau ci-dessus).
- Aucun secret à créer : la fonction agit avec le JWT de l'appelant et la clé publique envoyée par le site (`apikey`) ;
  elle ne reçoit jamais la clé de service. La RLS (membres) s'applique aux photos, aux sorties et au stockage.
- Plafonds : 400 photos et 300 Mo par ZIP (réponse 413 au-delà). Le ZIP n'est pas compressé (images déjà compressées).
- Si le stockage ne donne pas la taille d'une photo, le plafond est vérifié pendant l'envoi ; le téléchargement est alors
  interrompu côté navigateur (message d'erreur « Téléchargement impossible »).
- Vérification après déploiement : `POST /functions/v1/hg-album` avec `{"event_id": "<uuid>"}` et le JWT d'un membre
  renvoie un ZIP ; sans JWT, 401 ; avec un JWT de non-membre, 403.

## Réactions (migration 023)
Appliquer `supabase/migrations/023_reactions.sql` (idempotente) avant de publier le site : la table `hg_reactions`,
la RPC `hg_toggle_reaction` (bascule par la colonne `active`, sans suppression). Aucune fonction edge à redéployer pour les réactions.

## Notifications push et messagerie temps réel : hg-push (migration 025)

`hg-push` envoie une notification Web Push aux autres membres d'une conversation après chaque message (trigger
`hg_msg_push` de `025_push_realtime.sql`, appel asynchrone par pg_net). Elle ne contient que « Nouveau message » et
le nom de la conversation (« Secret Santa » pour un Secret Santa). Fichiers à envoyer : `hg-push/index.ts` et
`_shared/cron-auth.ts`. `verify_jwt` : `false`. Dépendance : `npm:web-push@3.6.7` (importée par Deno, rien à installer).

Ordre à suivre :
1. Appliquer `supabase/migrations/025_push_realtime.sql` (idempotente). Elle crée la table `hg_push_subscriptions`,
   la policy de messagerie temps réel et les deux triggers. Les triggers ne font rien tant que le secret `cron_secret`
   (table privée `hg_private`, migration 020) est absent.
2. Insérer les clés VAPID (une seule fois, éditeur SQL). Les commandes sont en commentaire en tête de la migration.
   La clé publique va dans `hg_settings` (clé `push_vapid_public`), la clé privée dans `hg_private`
   (clé `push_vapid_private`). Ne jamais les committer.
3. Déployer `hg-push` (tableau ci-dessus).
4. Secret facultatif : `VAPID_SUBJECT` (`mailto:` ou `https:`). Sans lui, `SITE_URL` est utilisé.

Tant que les clés VAPID ne sont pas insérées, la fonction répond `vapid_absent` et n'envoie rien. Le bouton
« Notifications sur cet appareil » de la page Mon compte reste alors indisponible.

## Bot Discord : plusieurs salons par type d'annonce (bot.channels en liste, bot.salons, admin_dm `channels`)

- Réglages (hg_settings.bot) : `salons` = `[{ id, nom }]` (salons connus, 25 au plus) ; `channels` = `{ <type>: ['<ID>', …] }`
  (0 à 5 salons par type). L'ancienne forme `'<ID>'` reste lue. Rétrocompatible : sans `salons`, rien ne change.

### Ordre de mise en production (à respecter)

1. **Appliquer la migration `supabase/migrations/070_bot_multi_salons.sql`** (idempotente : ajoute la colonne `channels` jsonb
   à `hg_bot_log`). Peut être appliquée avant ou juste après les fonctions : sans elle, elles marchent quand même (repli ci-dessous),
   seul le détail par salon n'est pas gardé dans le journal entre-temps.
2. **Déployer `hg-notify`**, avec exactement ces fichiers (imports suivis récursivement), octet pour octet :
   `hg-notify/index.ts`, `_shared/discord.ts`, `_shared/templates.ts`, `_shared/bot-templates.json`, `_shared/dyn-announce.ts`,
   `_shared/mentions.ts`, `_shared/channels.ts`, `_shared/bot-media.ts`, `_shared/reglages.ts`.
3. **Déployer `hg-cron`** : `hg-cron/index.ts`, `_shared/discord.ts`, `_shared/cron-auth.ts`, `_shared/templates.ts`,
   `_shared/bot-templates.json`, `_shared/dyn-announce.ts`, `_shared/mentions.ts`, `_shared/channels.ts`, `_shared/reglages.ts`.
4. **Déployer `hg-birthdays`** : `hg-birthdays/index.ts`, `_shared/discord.ts`, `_shared/cron-auth.ts`, `_shared/templates.ts`,
   `_shared/bot-templates.json`, `_shared/mentions.ts`, `_shared/channels.ts`.
5. **Ensuite seulement, publier le site** (`site/assets/espaces/admin/admin-bot.js` et le reste du front) : la page admin enregistre
   `channels[type]` en **liste** et envoie `admin_dm` avec `channels` ; les anciennes fonctions liraient une liste comme un
   identifiant invalide (annonce dans le salon par défaut, ou nulle part) et ignoreraient `channels` d'`admin_dm`.

Aucun nouveau secret. `_shared/channels.ts` a changé : les trois fonctions doivent être redéployées toutes les trois
(`hg-support`, `hg-album`, `hg-push` ne l'importent pas).

### Comportement

- Chaque annonce part dans chaque salon de son type, en parallèle. Une erreur sur un salon n'arrête pas les autres.
- **Pas de nouvel essai salon par salon.** Une annonce réservée (événement dynamique : `announced_start_at` / `announced_end_at` ;
  carte : `hg_card_copies.announced_at` ; drop : `hg_card_drops.discord_announced_at` ; anniversaire :
  `hg_birthday_log.announce_sent_at`) n'est libérée (ou laissée en attente) **que si aucun salon** n'a reçu le message : le
  prochain passage réessaie alors **tous** les salons. Si au moins un salon l'a reçue, l'annonce est considérée comme faite et
  les salons en échec **ne sont pas réessayés** ; l'échec reste visible dans le journal (ci-dessous) pour un renvoi à la main
  (annonce libre, onglet « Annonces »).
- Journal (`hg_bot_log`, colonne `channels` = `[{ id, ok, error?, ref? }]`, `ref` = annonce concernée quand une ligne en
  regroupe plusieurs) :
  - `hg-cron` (kind `auto:cron`) : détail par salon des annonces de début / fin d'événement du passage (`ref` « début : <nom> »).
  - `hg-birthdays` (kind `auto:anniversaire`) : détail par salon de chaque annonce (`ref` « anniversaire de <pseudo> ») ; en cas
    de réussite partielle, la ligne du membre dans `recipients` a `ok: true` et `reason` « annonce, échec partiel : … ».
  - `hg-notify` : `admin_dm` (kind `manual`) toujours ; annonces automatiques : toujours pour `draw` (`auto:tirage`),
    `dyn_announce` (`auto:evenement`), `card_drop` (`auto:drop`) ; seulement si un salon a échoué pour `irl_new` (`auto:sortie`),
    `card_pull` (`auto:carte`), `card_trade` (`auto:echange`). Quand un salon échoue, le texte (`body`) contient « échec »
    (filtre « Échecs » de l'historique).
  - Repli : si l'insertion échoue **parce que la colonne `channels` manque** (code Postgres 42703, code PostgREST PGRST204, ou
    message citant « channels »), la ligne est réécrite sans cette colonne. Toute autre erreur n'est pas réessayée.
- Réponses de `hg-notify` : `channels: [{ id, ok, error? }]` (draw, irl_new, card_pull, card_trade, card_drop, dyn_announce,
  bot_test avec type, admin_dm). Les champs existants (`announced`, `channel`, `channel_error`, `sent`, `error`) gardent leur sens ;
  `channel` vaut vrai dès qu'un salon a reçu le message. `admin_dm` renvoie en plus `log_error` (texte, ou `null`) si la ligne du
  journal n'a pas pu être écrite (l'envoi, lui, a eu lieu).
- `admin_dm` : `channels` (salons connus : dans `salons` ou égal au salon d'annonces, sinon 400 « Salon inconnu : … ») et
  `channel: true` (salon d'annonces) peuvent être combinés avec `user_ids`. Les doublons (y compris le salon d'annonces cité deux
  fois) sont retirés **avant** la limite de 10 salons. `channel: true` sans salon d'annonces valide → 400.
- `bot_test` sans type : un `announce_channel_id` ou `admin_discord_id` qui n'est pas un identifiant Discord (17 à 20 chiffres)
  est ignoré (jamais placé dans l'adresse de l'API).

## Archive annuelle (hg-archive, idée A8)
Fonction `hg-archive` : ZIP d'une année complète pour l'administrateur (Site › Archives). Appliquer d'abord la migration 093.
- Déployer `hg-archive/index.ts` avec `hg-archive/lib.ts` et `../_shared/discord.ts`, `verify_jwt` à `true`. Aucun secret.
- Entrée `POST { year, parts, part }` ; en-tête de réponse `X-Archive-Parts` (nombre de parties, plafond `hg_settings.albums.max_mo` par partie).
- Vérification : avec le JWT de l'admin, `{"year": 2025, "parts": ["moments"], "part": 1}` renvoie un ZIP (index.html, LISEZ-MOI.txt,
  donnees/annee.json) ; avec le JWT d'un membre, 403.

## Calendrier du gang et commandes slash : hg-calendar et hg-discord (migration 087)

Ordre : appliquer `supabase/migrations/087_idees_vd.sql`, puis déployer les deux fonctions (verify_jwt = false pour les deux).

- `hg-calendar` : flux ICS d'abonnement personnel, `GET …/functions/v1/hg-calendar?t=<jeton>` (jeton de `hg_calendar_tokens`,
  régénérable par le membre). Lecture par la RPC `hg_calendar_feed` (clé service seulement). Aucun nouveau secret (`SITE_URL` facultatif).
  Fichiers MCP : `[{ "name": "index.ts", … }, { "name": "feed.ts", … }]`.
- `hg-discord` : « Interactions Endpoint URL » de l'application Discord (commandes slash). Secrets : `DISCORD_PUBLIC_KEY` (obligatoire,
  sans elle tout est refusé en 401), `DISCORD_GUILD_ID` (recommandé), `SITE_URL` (facultatif). Fichiers MCP : `index.ts`, `handler.ts`, `lib.ts`.
  `register.ts` n'est PAS déployé : c'est le script local d'enregistrement des commandes (voir docs/BOT.md, section 10).
- Tests hors Deno : `node tests/check-hg-discord.mjs` (signature, rejeu, boutons) et `node tests/check-hg-calendar.mjs` (format ICS).
