# Loup-Garou — architecture et contrat technique

Page `pages/jeux/loup-garou.html` (accès selon la page « loup-garou » de Membres › Accès aux pages : **admins seulement** au lancement).
Toute la logique de jeu est côté serveur (migrations `118_loup_garou_tables.sql` et `119_loup_garou_moteur.sql`).
Le navigateur n'envoie que des intentions et relit son état personnalisé.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `pages/jeux/loup-garou.html` | Coquille de la page |
| `site/assets/espaces/loup-garou/loup-garou.js` | Démarrage, routes : (vide) accueil · `#roles` · `#creer` · `#rejoindre/CODE` · `#partie/CODE` · `#stats` ; `?code=HGLG-1234` mène à `#rejoindre/HGLG-1234` |
| `site/assets/espaces/loup-garou/api.js` | Seul accès à Supabase : `lg.*` (fonctions serveur), `messages()`, `suivrePartie()` |
| `site/assets/espaces/loup-garou/ui.js` | Composants partagés : `icone`, `vignetteRole`, `pastilleCamp`, `pseudo`, `avatar`, `chrono`, `libellePhase`, `estNuit`, `libelleCause`, `filAriane`, `ouvrirFenetre`, `confirmer`, `notifier`, `CANAUX` |
| `site/assets/espaces/loup-garou/roles.js` | Catalogue des 39 rôles : `ROLES`, `EXTENSIONS`, `CAMPS`, `roleById` |
| `site/assets/espaces/loup-garou/table.js` | `tableHtml(joueurs, options)` : la table autour du feu de camp |
| `site/assets/espaces/loup-garou/chat.js` | `monterChat(el, s, { canaux, titre })` : salons, non-lus, envoi |
| `site/assets/espaces/loup-garou/partie.js` | Suit une partie et choisit l'écran : salle, révélation, plateau, meneur, fin |
| `assets/js/loup-garou/vues/*.js` | Un module par écran |
| `site/assets/espaces/loup-garou/loup-garou.css` | Décor (village, nuit/jour), composants partagés, table, écran de mort |
| `site/assets/espaces/loup-garou/loup-garou-ecrans.css` | Styles des écrans (assemblés depuis `assets/css/lg/*.css`) |
| `assets/img/loup-garou/` | Illustrations des rôles (`roles/*.webp`), village, feu de nuit et de jour |

## Contrat des écrans

- Écrans simples (`vues/accueil.js`, `catalogue.js`, `creer.js`, `rejoindre.js`, `stats.js`) :
  `export async function afficher(root, { code, naviguer })` ; peut renvoyer une fonction de nettoyage.
  `naviguer('#partie/HGLG-1234')` change d'écran.
- Écrans de partie (`vues/salle.js`, `revelation.js`, `plateau.js`, `meneur.js`, `fin.js`) :
  `export function monter(root, s)` → `{ maj(etat), message(msg), detruire() }`.
  `s = { code, lg, messages(canal, depuis), etat(), secondesRestantes(), rafraichir(), naviguer }`.
  `maj` est appelée à chaque changement de l'état (temps réel + relecture toutes les 4 s) : mettre à jour le DOM
  sans détruire un champ en cours de saisie. Le minuteur s'affiche avec `s.secondesRestantes()` (setInterval 1 s, à arrêter dans `detruire`).
- Ambiance : l'écran pose `document.body.dataset.lgAmbiance = 'nuit' | 'jour'` (et le retire dans `detruire`).
- Règles : tout texte venant de la base passe par `esc()` ; pas de `onclick=""` ni `onerror=""` inline (CSP) ;
  vrais `<button>`, `<a href>`, `<label>` ; cibles ≥ 44 px ; la couleur ne porte jamais seule l'information.

## Fonctions serveur (api.js → `lg.*`)

| Appel | Effet |
| --- | --- |
| `lg.creer({ nom, mode: 'auto'\|'mj', visibilite: 'privee'\|'publique', nb_joueurs, invites, t_nuit, t_jour, t_vote, annonce_discord, composition: { role: n } })` | Renvoie le code. Composition = joueurs (+ 2 cartes si Voleur). En mode `mj`, le créateur est le meneur et ne joue pas. |
| `lg.rejoindre(code, pseudo?)` | Rejoindre (pseudo seulement pour un invité) |
| `lg.quitter(code)`, `lg.pret(code, bool)`, `lg.exclure(code, user)` | Salle d'attente (l'hôte qui quitte annule la partie) |
| `lg.lancer(code)` | Hôte : distribution secrète des rôles et des places |
| `lg.vu(code)` | « J'ai compris » sur la révélation |
| `lg.agir(code, type, { cible, cible2, choix })` | Action de nuit ou réaction (voir les types plus bas) |
| `lg.voter(code, cible)` | Vote du jour (modifiable jusqu'à la fin) |
| `lg.message(code, canal, texte)` | Chat (`salon`, `general`, `loups`, `morts`, `famille`) |
| `lg.avancer(code, forcer?)` | Temps écoulé : le serveur vérifie ; `forcer` = meneur |
| `lg.mj(code, action, { cible, texte, secondes })` | Meneur : `eliminer`, `ressusciter`, `message`, `pause`, `reprendre`, `plus`, `arreter` |
| `lg.etat(code)` | État personnalisé (ci-dessous) |
| `lg.publiques()`, `lg.mesParties()`, `lg.stats(user?)` | Listes et statistiques |
| `lg.adminReglages()`, `lg.adminEnregistrer(p)` | Admin : récompenses en Paillettes |

### Types d'action (`moi.action.type`)

| type | Qui | Paramètres |
| --- | --- | --- |
| `voleur` | Voleur (nuit 1) | `choix`: `'0'`, `'1'` (carte du centre, voir `action.centre`) ou `'garder'` |
| `cupidon` | Cupidon (nuit 1) | `cible`, `cible2` (deux joueurs différents) |
| `chien` | Chien-loup (nuit 1) | `choix`: `'village'` ou `'loups'` |
| `modele` | Enfant sauvage (nuit 1) | `cible` |
| `devorer` | Tout le camp des loups | `cible` (pas un loup) ; `action.meute` = votes de la meute |
| `sonder` | Voyante, Loup-garou voyant | `cible` ; résultat dans le journal privé |
| `proteger` | Salvateur | `cible` (≠ `action.dernier_protege`) |
| `corbeau` | Corbeau | `cible` (+2 voix demain) ou `passer` |
| `envouter` | Joueur de flûte | `cible`, `cible2` |
| `renard` | Renard | `cible` (avec ses deux voisins) |
| `loup_blanc` | Loup blanc (nuits paires) | `cible` (un autre loup) ou `passer` |
| `grand_mechant` | Grand méchant loup | `cible` ou `passer` |
| `sorciere` | Sorcière (réveil) | `choix`: `'vie'` (sauver `action.victime`) ou `'rien'` ; `cible` = poison (facultatif). `action.potions` = { vie, mort } |
| `infecter` | Infect père des loups (réveil) | `choix`: `'oui'` ou `'non'` |
| `chasseur` | Chasseur qui meurt | `cible` |
| `succession` | Capitaine qui meurt | `cible` (nouveau Capitaine) |
| `vote` | Vivants (phase vote) | utiliser `lg.voter` |
| `passer` | Toute action facultative | aucun |

## Forme de `lg.etat(code)`

```json
{
  "partie": { "id", "code", "nom", "mode", "visibilite", "statut": "attente|revelation|en_cours|terminee|annulee",
              "phase": "revelation|nuit_1|nuit|reveil|debat|vote|chasseur|succession|fin", "manche", "phase_fin", "pause_reste",
              "maintenant", "nb_joueurs", "invites", "t_nuit", "t_jour", "t_vote", "annonce_discord", "composition": { "role": n },
              "vainqueur": "village|loups|loup_blanc|flute|ange|amoureux|personne|annulee", "version", "hote", "corbeau", "mvp",
              "started_at", "ended_at", "centre" },
  "joueurs": [ { "user_id", "pseudo", "couleur", "avatar_url", "invite", "place", "pret", "vu_role", "vivant", "mort_cause", "mort_manche",
                 "capitaine", "peut_voter", "gagne", "paillettes", "role (si visible)", "camp (si visible)" } ],
  "moi": { "user_id", "meneur", "hote", "joueur", "vivant", "role", "role_initial", "camp", "amoureux", "envoute",
           "allies": [ { "user_id", "pseudo", "lien": "loup|amoureux|famille", "role" } ],
           "action": { "type", "fait", "victime", "victime_pseudo", "potions", "centre", "dernier_protege", "meute" } | null,
           "pouvoir_perdu" },
  "votes": [ { "de", "pour", "manche" } ] | null,
  "journal": [ { "id", "manche", "phase", "type": "info|mort|vote|phase|prive|meneur|fin", "texte", "prive", "at" } ],
  "restants": [ { "role", "total", "morts" } ],
  "actions_mj": [...] (meneur seulement), "attendus": [ { "user_id", "type" } ] (meneur seulement)
}
```

Un joueur qui n'est pas dans la partie reçoit `{ partie: { code, nom, statut, mode, nb_joueurs, invites, hote_pseudo, joueurs }, moi: null }` (partie en attente) ou une erreur.

**Hôte ou meneur disparu (migration 199).** En salle d'attente, un hôte sans signal de présence depuis 5 minutes passe la main au premier membre arrivé, présent depuis moins de 2 minutes ; passage fait par `hg_lg_tick`, pour tous les jeux à salon. Un meneur humain a droit à 15 minutes : la salle passe alors en meneur automatique et les rôles réservés au meneur deviennent des Villageois. L'état porte alors `hote_passe` (`ancien`, `ancien_nom`, `nouveau`, `nouveau_nom`, `meneur`), tant que la salle est ouverte. En cours de partie, rien n'est transféré : `meneur_parti` vaut vrai tant que le meneur est absent depuis 5 minutes, et la partie avance seule.

## Accès et tests

- `hg_lg_peut()` : accès à la page « loup-garou » (`hg_page_ok`) ou compte listé dans `hg_settings.loup_garou.testeurs`.
- Toutes les tables `hg_lg_*` sont en lecture seule pour le client ; les rôles secrets (`hg_lg_cartes`, `hg_lg_centre`), actions, votes et journal ne sont lisibles qu'à travers `hg_lg_etat`.
- La colonne `hg_lg_parties.etat` (victime des loups pendant le réveil, file des réactions…) n'est pas lisible par le client ni diffusée en temps réel (droit de lecture par colonne, migration 176) : une nouvelle colonne de `hg_lg_parties` n'est lisible que si on l'ajoute à ce droit.
- Canal `loups` : loups (vivants ou morts) et Petite fille vivante ; les autres morts lisent `morts`, pas `loups`.
- « Passer » annule le choix déjà fait à l'étape (sauf les pouvoirs à effet immédiat : Voyante, Renard, Voleur, Cupidon, Chien-loup, Enfant sauvage).
- `hg_lg_tick()` (pg_cron, chaque minute) débloque les parties dont le minuteur est écoulé, lève une pause du meneur au bout de 30 minutes et arrête une partie automatique sans élimination depuis trois manches où plus personne n'agit ni ne vote. `hg_lg__essayer` revérifie l'échéance sous verrou : deux appels simultanés ne font plus sauter une étape.
- Invités : plus de 15 codes inconnus essayés en 10 minutes depuis un même appareil sont refusés (`hg_invite__frein`, commun aux jeux à salon) ; un code inconnu à `rejoindre` renvoie `null`.

## Annonce Discord (facultative)

Option « Annoncer la partie sur le Discord du gang » à la création (désactivée par défaut). Après `hg_lg_creer`, le site
appelle `hg-notify` avec l'événement `lg_party` `{ code }`. Le bot relit tout en base : seul l'hôte peut annoncer, partie
en attente créée il y a moins de 15 min, une seule annonce (réservation `hg_lg_parties.discord_annonce_at`).
Salon : `bot.channels.loup_garou` (sinon le salon d'annonces), mention : `bot.mentions.loup_garou`,
interrupteur : `bot.notify.lg_party`, texte : modèle `lg_party_announce` (modifiable dans Admin › Bot Discord).
La fonction edge doit être redéployée pour que l'annonce parte (voir supabase/functions/DEPLOY.md).

## Accès

La page est déclarée en mode `admin` dans `hg_pages` : invisible et inaccessible aux autres membres.
Pour ouvrir à quelques testeurs : Admin › Pages, passer « Loup-Garou » en mode « liste » et cocher les membres
(le moteur accepte aussi les identifiants listés dans `hg_settings.loup_garou.testeurs`).

## Tests

Voir `tests/loup-garou/README.md` (moteur en SQL sur une base locale, parcours complets dans un navigateur).
