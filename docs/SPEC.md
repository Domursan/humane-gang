# Humane Gang — spécification de construction (pour les développeurs)

> Document historique : la spécification d'origine ; l'état actuel est décrit dans README.md, PLAN-DU-SITE.md et ADMIN-PANEL.md.

Site statique vanilla HTML/CSS/JS (modules ES), destiné à GitHub Pages, backend Supabase (projet `Gestion_RP`, id `zqbdzokyhgavgmqgiwuw`).
Tout le texte de l'interface est en **français**. Racine du projet : le dépôt.

## Fichiers déjà fournis (NE PAS réécrire, seulement utiliser ; un ajout mineur est permis s'il est indispensable, en le signalant)
- `site/assets/commun/base.css` — tokens (couleurs désaturées, `--accent`, sections `--ss-*`, `--irl-*`, `--hist-*`, marges de page `--page-pad` / `--page-top` / `--page-bas` avec un seul seuil téléphone à 600 px), composants : `.container .card .card-ss .card-irl .card-hist .grid .row .stack .btn .btn-primary .btn-light .btn-sand .btn-ghost .btn-danger .btn-row .field .check .pill .pill-ok .pill-current .pill-todo .progress .avatar .empty .list-row .page-head .eyebrow .page-title .display .muted .small`.
- `site/assets/commun/config.js` — URL + clé publique Supabase, `LOGO_SRC` (`site/assets/images/marque/logo-1600.webp`).
- `site/assets/commun/core.js` — point d'entrée du socle (ré-exporte les modules de `assets/js/core/` : util, ui, prefs, theme, theme-load, effects, supabase, profile, pages-access, godmode, badges, header, footer, init…) ; exporte `sb` (client Supabase), `initPage({auth:'member'|'admin'|'optional'})` → profil, `requireMember`, `requireAdmin`, `getProfile(force)`, `getUser`, `toast(msg,'ok'|'error')`, `errMsg`, `esc` (échappement HTML — À UTILISER pour toute donnée insérée en innerHTML), `$`, `$$`, `fmtDate`, `fmtDateTime`, `daysUntil`, `avatarHtml(profile,size)`, `callFn(name, body)`, `notify(event, payload)` (bot Discord, ne jette jamais), `SEASONS`, `SEASON_LABELS`, `autoSeason`, `applySeason`, `LOGO_SRC`.
- `supabase/migrations/001_hg_core_schema.sql` et `002_hg_rls_storage.sql` — LE schéma de référence. Lis-les avant de coder.

## Modèle de page
```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Secret Santa · Humane Gang</title>
  <link rel="icon" type="image/png" href="site/assets/images/marque/favicon-64.png">
  <link rel="stylesheet" href="site/assets/commun/base.css">
  <link rel="stylesheet" href="site/assets/espaces/irl/secret-santa.css">   <!-- CSS propre à la page si besoin -->
</head>
<body>
  <main class="container" id="app"> … </main>
  <script type="module" src="site/assets/espaces/irl/secret-santa.js"></script>
</body>
</html>
```
Le JS de page commence par `import { sb, initPage, ... } from './core.js'; const me = await initPage({ auth: 'member' });` — en-tête, pied de page, bandeau cookies et thème saisonnier sont injectés automatiquement.

## Règles
- Pas de framework, pas de build. Bibliothèques externes seulement via `cdn.jsdelivr.net/npm/<pkg>@<version exacte>`.
- Toute donnée venant de la base passe par `esc()` avant innerHTML.
- Responsive (téléphone 375px sans scroll horizontal), boutons ≥ 44px, vrais `<button>`/`<label>`.
- Pas d'emoji dans l'interface ; icônes = petits SVG inline à trait.
- Les membres ne voient JAMAIS les infos privées des autres (anniversaire complet, Discord…). L'annuaire = RPC `hg_members()`.
- Attributions Secret Santa : jamais de select direct (bloqué par RLS). Utiliser les RPC `hg_ss_my_target(p_edition)`, `hg_ss_progress(p_edition)`, `hg_ss_reveal(p_edition)`, `hg_ss_draw(p_edition)` (admin).
- Événements bot via `notify(event, payload)` ; noms d'événements : `ss_draw`, `ss_gift_sent` {edition_id}, `ss_gift_received` {edition_id}, `irl_new` {event_id}, `support_new` (envoyé par la fonction hg-support elle-même).
- Stockage : bucket privé `hg-photos` (chemin `<uid>/<event_id>/<fichier>`, afficher via `createSignedUrl`), public `hg-avatars` (`<uid>/avatar.<ext>`), public `hg-assets` (admin : `cartes/base-<année>.png`, `badges/<code>.png`).
- Ne PAS modifier la base Supabase toi-même. Si un changement de schéma est nécessaire, écris-le dans `supabase/migrations/00X_<nom>.sql` (numéro libre ≥ 003) et signale-le dans ton rapport.
- Ne touche qu'aux fichiers de ton périmètre. Rapport final : liste des fichiers créés, migrations ajoutées, points ouverts.

## Pages et périmètres
| Fichier | Rôle | Lot |
|---|---|---|
| `index.html` + `site/assets/espaces/accueil/intro.js` + `site/assets/espaces/accueil/intro.css` | Intro 3D : seul le logo à l'écran, le scroll zoome dans son centre puis fondu vers `pages/compte/accueil.html`. Bouton « Passer l'intro ». Intro sautée si `localStorage hg_intro_seen`. Version réduite si prefers-reduced-motion. | A |
| `pages/compte/accueil.html` | Héros « Le QG du Humane Gang », 3 tuiles (Secret Santa/IRL/Historique) avec infos réelles, fil d'activité (`hg_activity`), compte à rebours vers `exchange_date` de l'édition en cours, anniversaires des 30 prochains jours (via `hg_members().birthday_dm`). Non connecté → invite à se connecter. | A |
| `pages/compte/compte.html` | Connexion / création de compte (e-mail + mot de passe Supabase Auth ; inscription = signUp puis RPC `hg_join(code, pseudo)` ; case politique de confidentialité obligatoire), mot de passe oublié. Connecté : profil (pseudo, avatar upload, couleur, anniversaire, partage anniversaire, ID Discord, opt-in bot), badges obtenus/à débloquer (`hg_badges`, `hg_user_badges`), boîte à idées (insert `hg_ideas`), export JSON (`hg_export_my_data`), suppression (`hg_delete_my_account` puis signOut), déconnexion. Paramètre `?next=` pour rediriger après connexion. Si connecté sans profil (pas encore de code) → formulaire code + pseudo. | A |
| `pages/infos/legal.html` | Sections `#mentions`, `#confidentialite`, `#cookies`, `#droits` (nLPD suisse + RGPD). Placeholders [À COMPLÉTER] pour l'identité de l'éditeur. Hébergeur GitHub Pages (GitHub Inc., 88 Colin P. Kelly Jr. St, San Francisco, CA 94107, USA), Supabase (région UE eu-west-1, Irlande), Discord. auth: optional. | A |
| `pages/irl/secret-santa.html` | Édition en cours (année la plus récente). Étapes (inscriptions → tirage → envoi → révélation). S'inscrire/se désinscrire pendant `inscriptions`. Après tirage : **carte** générée en canvas = image de base (`card_base_url`, sinon carte par défaut dessinée) + pseudo de la cible ; boutons Télécharger (PNG) et Retourner (flip CSS 3D). Liste de souhaits de la cible (lecture), ma liste (CRUD). Boutons « J'ai envoyé » / « J'ai reçu » (update `hg_ss_participants` + `notify`). Avancement via `hg_ss_progress`. Phase révélation : tableau `hg_ss_reveal`. | B |
| `pages/irl/irl.html` | Prochaine sortie mise en avant, RSVP oui/peut-être/non, liste des présents (pseudos via `hg_members`), créer une sortie (formulaire modal/inline, `notify('irl_new')`), sondage de dates (proposer des dates à la création, voter), sorties à venir, sorties passées avec album photo (upload multiple, grille, lightbox simple, suppression de ses photos). | C |
| `pages/irl/historique.html` | Frise par année : éditions SS terminées/révélées (avec révélation), sorties passées (miniatures album), moments cultes (`hg_moments`, ajout par les membres, image optionnelle dans `hg-photos/<uid>/moments/`). Filtres Tout / Secret Santa / IRL / Moments. | C |
| `pages/admin/admin.html` | auth:'admin'. Sections : Membres (via `hg_members`) & codes d'invitation (générer `HG-XXXX`, liste, supprimer non utilisés) ; Secret Santa (créer édition, statut, budget, dates, upload carte de base dans hg-assets puis `card_base_url`, exclusions, lancer tirage `hg_ss_draw` — n'affiche jamais les paires) ; Badges (attribuer/retirer à un membre, upload image) ; Boîte à idées (liste, statut retenue/écartée) ; Assistance (liste `hg_support`, marquer traitée) ; Bot (réglages `hg_settings.bot` : salon annonces, ID Discord admin, toggles) ; Thème (auto/forcé). | D |
| `pages/infos/assistance.html` | Formulaire (pseudo prérempli si connecté, sujet select, message, contact Discord si non connecté) → `callFn('hg-support', {...})`. auth: optional. | D |
| `supabase/functions/hg-support/index.ts`, `hg-notify/index.ts`, `BOT.md` | Fonctions edge Deno : hg-support (insert service role + MP Discord à l'admin via bot), hg-notify (vérifie le JWT, construit le message, envoie MP/annonce selon `hg_settings.bot` et opt-in). Secrets : `DISCORD_BOT_TOKEN`. Guide de création du bot. | D |

## Mise à jour v2 (20.10.2026) — racine : le dépôt (clone git)
- Les emojis sont désormais autorisés là où l'administrateur les demande (tuiles de l'accueil, thèmes).
- Logo : `LOGO_SRC` = `site/assets/images/marque/logo-1600.webp` (pixel art : afficher avec `image-rendering: pixelated`). Favicon `site/assets/images/marque/favicon-64.png`. Les anciens PNG du logo (`Logo.png`, `logo-1600.png`, `logo-512.png`) ont été retirés du dépôt : seuls les WebP sont utilisés.
- Logos des thèmes : `site/assets/images/themes/` (WebP, 1024 px au plus, un fichier par logo, nom en minuscules avec tirets : `classique.webp`, `automne-halloween.webp`, `hiver-noel.webp`, `paques.webp`). Un thème y pointe par son adresse complète dans Admin › Thème › Adresse de l'image (`https://humane-gang.com/assets/images/themes/<fichier>.webp`, colonne `hg_themes.logo_url`). Ajouter un logo : déposer le WebP dans ce dossier, pousser, puis renseigner l'adresse une fois la publication faite. Plus d'hébergement externe (ImgBB).
- Base appliquée (voir `supabase/migrations/006_themes_infos_admin.sql`) : `hg_themes`, `hg_profile_info`, `hg_ss_editions.shared_fields`, rpc `hg_ss_target_info(p_edition)`, rpc `hg_admin_accounts()`, l'admin voit/modifie toutes les données (y compris `hg_ss_assignments`).
- Liste des informations diverses : `site/assets/espaces/compte/profile-fields.js` (`INFO_GROUPS`, `INFO_FIELDS`, `INFO_LABEL`). Ne pas dupliquer cette liste.
- Thèmes : `core.js` expose (après la v2) `applyTheme()` qui charge le thème actif et pose les variables CSS + `data-theme=<slug>` sur <html>, `getActiveTheme()` → objet thème (avec `emojis`, `logo_url`, `effect`), `themeEmoji(i)`, et `currentLogo()` (logo du thème sinon LOGO_SRC).
