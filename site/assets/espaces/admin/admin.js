// ===== Humane Gang — administration (point d'entrée) =====
// Coquille (rail, colonnes, routage) : admin/shell.js. Chaque sous-section est montée à sa première visite (registerSub) ;
// les données partagées sont chargées ici, pour les seules sections permises. Les sections « Comptes », « Cartes » et les
// modules autonomes restent à leur place ; le reste est dans assets/js/admin/. Palette « Aller à… » : admin/palette.js.
// Accès : admin, ou Staff avec des permissions. Droits : admin/perms.js (source unique).
// Ce fichier ne fait que brancher : il relie chaque sous-section à son fournisseur (registerSub), charge les données
// nécessaires, puis démarre le routage. Le code des sections est dans leurs propres modules.
import { initPage, $, toast, errMsg } from '../../commun/core.js';
import { mountThemesSection, themeActions } from './admin-themes.js';
import { mountMessagesSection, listMessages, openMessages } from './admin-messages.js';
import { mountLogSection, listLog, openLog } from './admin-log.js';
import { mountBotSection } from './admin-bot.js';
import { initAccounts, refreshAccounts, showAccount, showGhostFiche, emptyDetail, mountAccountsList, mountAccountsInfo } from './admin-accounts.js';
import { ensureGhosts, ghostZoneActions, openNewGhostDrawer } from './admin-ghosts.js';
import { mountAccessSection, refreshAccessSection, accessActions } from './admin-access.js';
import { mountInviteLinks, refreshInviteLinks } from './admin-invite-links.js';
import { eventsSub } from './admin-events.js';
import { mountCardsSection, openCardsTab, mountPlayersList, mountDropsSection } from './admin-cards.js';
import { mountChallengesSection } from './admin-challenges.js';
import { mountQuizSection } from './admin-quiz.js';
import { mountSutomSection } from './admin-sutom.js';
import { mountStaffSection, listStaff, openStaff, infoStaff } from './admin-staff.js';
import { mountSortiesSection, openSortie, listSorties, infoSorties } from './sorties/index.js';
import { mountSouvenirsSection, openSouvenirs, listSouvenirs } from './souvenirs/index.js';
import { mountReglagesSection, reglagesActions } from './reglages/view.js';
import { A } from './comptes/state.js';
import { S, pseudoOf } from './state.js';
import { sectionError } from './common.js';
import { loadMembers, loadInvites, loadEditionDetails, loadBadges, loadIdeas, loadSupport, ensureMembers, ensureInvites, ensureSS, ensureBadges, ensureIdeas, ensureSupport, safe } from './loaders.js';
import { loadCounts, refreshCounts, countTables } from './counts.js';
import './todos.js'; // « À faire » des 7 lieux (registerTodo, admin/lieux.js)
import { bindInvites, renderInvites, renderMembers, inviteActions } from './invites.js';
import { renderSS, ssSub } from './ss-render.js';
import { bindSecretSanta } from './ss-events.js';
import { bindBadges, renderBadges, badgesSub } from './badges.js';
import { ideasSub, renderIdeas } from './ideas.js';
import { supportSub, renderSupport } from './support.js';
import { canSection, anySection, applyPanelAccess, disableSubs, lieuOf } from './perms.js';
// Parties des sections découpées (sous-menus) : importées par espace de noms, pour qu'une fonction absente (module pas
// encore à jour) ne casse pas le panel. Sans elle, la sous-section affiche la section entière (comportement d'origine).
import * as Econ from './cartes/economy.js';       // showEconPart(part)
import * as Reg from './reglages/view.js';        // showReglagesPart(part)
import * as BadgesParts from './badges.js';       // showBadgesPart(part)
import * as Access from './admin-access.js';           // setAccessView(view)
import { initLive, onTableChange } from './live.js';
import { initShell, registerSub, startShell, navigate, setActions } from './shell.js';
import { setupPalette } from './palette.js';
import { initQuick } from './quick.js';

// Sections facultatives (modules autonomes) : chargées en parallèle de l'identité. Un module absent ou sans sa fonction de
// montage retire sa sous-section du panel (disableSubs) au lieu de casser le démarrage.
const OPTIONAL = [
  { sub: 'secrets', url: './admin-eggs.js', fn: 'mountEggsSection' },   // Autres jeux › Secrets (hg_settings.eggs)
  { sub: 'arcade', url: './admin-arcade.js', fn: 'mountArcadeSection' }, // Autres jeux › Arcade (pages 404, hg_arcade_admin_board)
  { sub: 'modeles-reponse', url: './admin-modeles-reponse.js', fn: 'mountModelesReponseSection' }, // La Poste › Modèles de réponse (migration 194)
  { sub: 'fil', url: './admin-fil.js', fn: 'mountFilSection' },         // Pilotage › Assistance › Fil d'activité (hg_activity)
  { sub: 'champs', url: './admin-champs.js', fn: 'mountChampsSection' }, // Membres › Comptes › Champs du profil (profile_fields)
  { sub: 'geoguessr', url: './admin-jeux.js', fn: 'mountGeoSection' },         // Autres jeux › GeoGuessr (migration 083)
  { sub: 'citations', url: './admin-jeux.js', fn: 'mountCitationsSection' },   // Autres jeux › Citations « Qui a dit ça ? »
  { sub: 'preuves', url: './admin-proofs.js', fn: 'mountProofsSection' },               // Autres jeux › Preuves de quêtes (J11)
  { sub: 'framed-heardle', url: './admin-jeux-medias.js', fn: 'mountJeuxMediasSection' }, // Autres jeux › Framed et Heardle (J9, J10)
  { sub: 'bataille', url: './admin-bataille.js', fn: 'mountBatailleSection' },          // Le jeu de cartes › Arène (J15)
  { sub: 'gestion', url: './admin-gestion.js', fn: 'mountGestionSection' },            // Le jeu de cartes › Gestion globale (Give, résumé, derniers gives)
  { sub: 'social', url: './admin-social.js', fn: 'mountSocialSection' }, // Membres › Comptes › Vie sociale (hg_settings.social, migration 090)
  { sub: 'parrainage', url: './admin-social.js', fn: 'mountParrainageSection' },   // Membres › Entraide › Parrainage (idée P8)
  { sub: 'competences', url: './admin-social.js', fn: 'mountCompetencesSection' }, // Membres › Entraide › Compétences (idée P7)
  { sub: 'accueil', url: './admin-social.js', fn: 'mountAccueilSection' },         // Membres › Comptes › Accueil des membres (idées P9, P6)
  { sub: 'erreurs', url: './admin-errors.js', fn: 'mountErrorsSection' }, // Pilotage › Site › Erreurs du site (hg_client_errors, A9)
  { sub: 'entretien', url: './admin-entretien.js', fn: 'mountEntretienSection' }, // La Mairie › Technique › Entretien (migration 192)
  { sub: 'archives', url: './admin-archive.js', fn: 'mountArchiveSection' }, // Pilotage › Site › Archives (fonction hg-archive, A8)
  { sub: 'loup-garou', url: './admin-loup-garou.js', fn: 'mountLoupGarouSection' }, // La Fête foraine › Jeux › Loup-Garou (Paillettes, badges, parties ; administrateur)
  { sub: 'uno', url: './admin-uno.js', fn: 'mountUnoSection' }, // La Fête foraine › Jeux › Uno (Paillettes, badges, parties en cours ; administrateur)
  { sub: 'nom-de-code', url: './admin-ndc.js', fn: 'mountNdcSection' }, // La Fête foraine › Jeux › Codenames (mots, Paillettes, badges, parties ; administrateur)
  { sub: 'duels', url: './admin-duels.js', fn: 'mountDuelsSection' },
  { sub: 'plateaux', url: './admin-plateaux.js', fn: 'mountPlateauxSection' }, // La Fête foraine › Jeux › Jeux de plateau (noms, Paillettes, badges, parties ; administrateur) // La Fête foraine › Jeux › Duels (Puissance 4, Morpion, Mastermind ; administrateur)
  { sub: 'rdv', url: './admin-vd.js', fn: 'mountRdvSection' },          // Event › Calendrier et cinéma (idées V8, V9)
  { sub: 'commandes', url: './admin-vd.js', fn: 'mountCommandesSection' }, // Pilotage › Bot › Commandes slash (idée D3)
  { sub: 'roles', url: './admin-roles.js', fn: 'mountRolesSection' },          // Membres › Comptes › Rôles (migration 103)
  { sub: 'membres-irl', url: './admin-roles.js', fn: 'mountMembresIrlSection' }, // IRL › Membres IRL (migration 103)
];
const optionalP = Promise.all(OPTIONAL.map(async (o) => {
  try { const m = await import(o.url); return [o.sub, typeof m[o.fn] === 'function' ? m[o.fn] : null]; }
  catch (e) { console.warn('[panel] module facultatif indisponible :', o.url, e?.message); return [o.sub, null]; }
}));

// Idées A2, A3, A4 (migration 092) : sous-sections livrées comme fournisseurs complets ({ main, open }). Un module absent
// retire sa sous-section (comme OPTIONAL). Réorganisation (migration 103) : les routes suivent les nouveaux domaines.
const PROVIDERS = [
  { route: 'mairie/planning', url: './planning.js', name: 'planningSub' },       // La Mairie › Planning
  { route: 'fete/programmation', url: './admin-programme.js', name: 'programmeSub' }, // La Fête foraine › Jeux › Programmation (migration 183)
  { route: 'place/relance', url: './comptes/remind.js', name: 'remindSub' },    // La Place du gang › À relancer
  { route: 'fete/mes-jeux', url: './admin-mj.js', name: 'mjSub' },                   // La Fête foraine › Mes jeux
];
const providersP = Promise.all(PROVIDERS.map(async (p) => {
  try { const m = await import(p.url); return [p, m[p.name] && typeof m[p.name] === 'object' ? m[p.name] : null]; }
  catch (e) { console.warn('[panel] module facultatif indisponible :', p.url, e?.message); return [p, null]; }
}));

// Démarrage : l'identité (et les droits) sont lus d'abord ; le reste suit.
const me = await initPage({ auth: 'admin' });
const MOUNT = Object.fromEntries(await optionalP);
disableSubs(...OPTIONAL.filter((o) => !MOUNT[o.sub]).map((o) => o.sub));
const PROV = await providersP;
disableSubs(...PROV.filter(([, v]) => !v).map(([p]) => p.route.split('/')[1]));
applyPanelAccess();
const has = canSection;
initShell({ me }); // rail et colonnes tout de suite ; le routage démarre quand les données sont chargées
setupPalette();    // « Aller à… » (Ctrl/Cmd+K, bouton du rail)
initQuick();       // actions rapides du plateau (hg:quick : Give, enchère, drop ; admin/quick.js)

/* ---------- Comptes : fiche complète de chaque membre (initialisée à la première visite d'une sous-section qui en a besoin) ---------- */
// Promesse de l'initialisation des comptes : créée une seule fois.
let accountsP = null;
/** Initialise la section Comptes si la personne y a droit, une seule fois. Renvoie la promesse, ou undefined. */
function ensureAccounts() {
  if (!accountsP && has('comptes')) accountsP = loadAccountsPanel();
  return accountsP ?? undefined;
}
/**
 * Lance le module Comptes. Après une modification, resynchronise les autres sections concernées
 * (membres, badges, Secret Santa, idées, assistance, statistiques).
 */
function loadAccountsPanel() {
  // Après une modification, on resynchronise les autres sections.
  return initAccounts({
    me,
    onChange: async (kind) => {
      if (kind === 'members') { await refreshAccounts(); if (has('membres')) refreshAccessSection(); await loadMembers(); renderInvites(); refreshInviteLinks(); renderBadges(); if (S.ssLoaded) renderSS(); renderIdeas(); renderSupport(); refreshCounts(); }
      if (kind === 'badges') { await loadBadges(); renderBadges(); }
      if (kind === 'ss') { await loadEditionDetails(); if (S.ssLoaded) renderSS(); refreshCounts(); }
      if (kind === 'ideas') { await loadIdeas(); renderIdeas(); refreshCounts(); }
      if (kind === 'support') { await loadSupport(); renderSupport(); refreshCounts(); }
    },
  });
}
// Fournisseur `open` de Comptes : adresse #place/comptes/<id>[/<onglet>] ; sans identifiant, la zone principale est vide.
// Comptes inscrits et fantômes sont dans la même liste : un fantôme s'ouvre sur sa fiche (code, liaison), sauf avec un onglet.
// #place/comptes/nouveau ouvre le tiroir de création d'un fantôme (adresse transitoire).
/**
 * Affiche une fiche membre (ou la zone vide, ou le tiroir de création d'un fantôme) selon l'adresse.
 * @param {HTMLElement} _el Conteneur du groupe (non utilisé : la fiche va dans sa propre zone).
 * @param {{id?: string, tab?: string}} route Segments de l'adresse.
 */
async function openFicheRoute(_el, { id, tab }) {
  if (id === 'nouveau') { location.hash = '#place/comptes'; openNewGhostDrawer(); return; }
  if (!id) { setActions(ghostZoneActions(null)); emptyDetail(); return; } // #place/comptes : la zone principale invite à choisir dans la liste
  await ensureAccounts();
  await ensureGhosts();
  const acc = A.accounts.find((a) => a.id === id);
  if (!acc) { toast('Compte introuvable.', 'error'); navigate('place/comptes'); return; }
  setActions(ghostZoneActions(acc.is_ghost ? null : id));
  if (acc.is_ghost && !tab) { showGhostFiche(id); return; }
  showAccount(id, tab);
}

/* ---------- Écouteurs des sections permises (liés au DOM, sans montage) ---------- */
// Branchés tout de suite, sans attendre la première visite (les boutons sont dans la page).
if (has('membres')) bindInvites(me);
if (has('secret-santa')) bindSecretSanta();
if (has('badges')) bindBadges();

/* ---------- Sous-sections : montage à la première visite ---------- */
// Chaque registerSub relie une adresse (lieu/sous-section) à ses fonctions : main (montage unique),
// open (à chaque visite), list (colonne 2), info (panneau de droite). Voir l'API en tête de admin/shell.js.
// Plateau (#plateau) : contenu par défaut dans admin/lieux.js (renderPlateau) ; les compteurs sont chargés plus bas (loadCounts).
// Lieux : chaque sous-section est enregistrée par son identifiant (regSub, lieu déduit de LIEUX).
// Enregistrement d'une sous-section par son identifiant : le lieu est celui de LIEUX (admin/perms.js).
const regSub = (sub, provider) => registerSub(`${lieuOf(sub)}/${sub}`, provider);
regSub('journal', { main: () => mountLogSection($('#log-root')), open: openLog, list: listLog });
regSub('staff', { main: () => mountStaffSection($('#staff-root')), open: openStaff, list: listStaff, info: infoStaff }); // administrateur seulement
// Membres
regSub('comptes', {
  main: () => ensureAccounts(),
  list: (el) => mountAccountsList(el),
  open: openFicheRoute,
  info: (el) => mountAccountsInfo(el),
});
regSub('invitations', {
  main: () => mountInviteLinks($('#links-root'), { me, pseudoOf, onChange: async () => { await loadInvites(); renderInvites(); refreshCounts(); } }),
  open: () => setActions(inviteActions()), // « + Nouveau code » et « + Nouveau lien » (tiroirs)
});
// Accès aux pages : une section, deux parties (Pages, Matrice membres × pages). La puce de vue de la section reste.
/** Affiche la vue `view` (pages | matrice) ; sans setAccessView, clique la puce de vue de la section. */
const accessView = (view) => {
  if (typeof Access.setAccessView === 'function') Access.setAccessView(view);
  else document.querySelector(`#access-root [data-pa-view="${view}"][aria-pressed="false"]`)?.click();
};
const accessGroup = {
  group: 'acces',
  main: () => { ensureAccounts(); mountAccessSection($('#access-root'), { openMember: (uid) => navigate(`place/comptes/${uid}/acces`) }); },
};
regSub('acces', { ...accessGroup, open: () => { accessView('pages'); setActions(accessActions()); } });
regSub('acces-matrice', { ...accessGroup, open: () => { accessView('matrice'); setActions(accessActions()); } });
if (MOUNT.champs) regSub('champs', { main: () => MOUNT.champs($('#champs-root')) });
if (MOUNT.social) regSub('social', { main: () => MOUNT.social($('#social-root')) });
if (MOUNT.parrainage) regSub('parrainage', { main: () => MOUNT.parrainage($('#parrainage-root')) });
if (MOUNT.competences) regSub('competences', { main: () => MOUNT.competences($('#competences-root')) });
if (MOUNT.accueil) regSub('accueil', { main: () => MOUNT.accueil($('#accueil-root')) });
if (MOUNT.roles) regSub('roles', { main: () => MOUNT.roles($('#roles-root')) }); // rôles : pages données, membres (migration 103)
// IRL (Membres IRL, sorties, souvenirs, Secret Santa)
if (MOUNT['membres-irl']) regSub('membres-irl', { main: () => MOUNT['membres-irl']($('#membres-irl-root')) }); // membres du rôle IRL (migration 103)
regSub('sorties', {
  main: () => mountSortiesSection($('#sorties-root'), { me }),
  open: (el, r) => openSortie(r),
  list: listSorties,
  info: infoSorties,
});
regSub('souvenirs', {
  main: () => mountSouvenirsSection($('#souvenirs-root'), { me }),
  open: (el, r) => openSouvenirs(r),
  list: listSouvenirs,
});
regSub('secret-santa', ssSub);
regSub('evenements', eventsSub({ onBadgesChange: async () => { await loadBadges(); renderBadges(); } }));
if (MOUNT.rdv) regSub('rdv', { main: () => MOUNT.rdv($('#rdv-root')) }); // calendrier (rendez-vous récurrents) et ciné-club
// Badges (Membres) : une section, trois parties (Catalogue, Attribution, Critères automatiques). « + Nouveau badge » : Catalogue
// seulement (ou partout si la section ne sait pas encore se découper).
/** Fournisseur `open` de la partie `part` des badges. */
const badgesOpen = (part) => (el, r) => {
  const split = typeof BadgesParts.showBadgesPart === 'function';
  if (split) BadgesParts.showBadgesPart(part);
  if (!split || part === 'catalogue') badgesSub.open?.(el, r);
};
for (const [sub, part] of [['badges', 'catalogue'], ['badges-attribution', 'attribution'], ['badges-criteres', 'criteres']]) {
  regSub(sub, { ...badgesSub, group: 'badges', open: badgesOpen(part) });
}
// Le jeu de cartes : une seule section (#fabrique) montée une fois ; chaque partie est une sous-section qui ouvre son onglet.
const cardsGroup = { group: 'cartes', main: () => mountCardsSection($('#cards-root'), { tabs: false }) };
for (const tab of ['series', 'cartes', 'boosters', 'quetes', 'stats', 'echanges', 'codes', 'recettes', 'encheres']) {
  regSub(tab, { ...cardsGroup, open: () => openCardsTab(tab) });
}
// Économie : un seul formulaire (un enregistrement), quatre parties. La partie est choisie avant d'ouvrir l'onglet
// (econPanel l'applique au rendu) ; sans showEconPart, l'onglet montre tout le formulaire.
for (const [sub, part] of [['economie', 'paillettes'], ['tirage', 'tirage'], ['recyclage', 'recyclage'], ['limites', 'limites']]) {
  regSub(sub, { ...cardsGroup, open: () => { Econ.showEconPart?.(part); openCardsTab('economie'); } });
}
// Joueurs : liste en colonne 2 ; le membre choisi est dans l'adresse (#fabrique/joueurs/<id>).
regSub('joueurs', { ...cardsGroup, list: mountPlayersList, open: (_el, { id }) => openCardsTab('joueurs', id) });
// Rendez-vous saisonniers (migration 096) : une section, trois parties ; module chargé à la première visite.
const saisonsMod = () => import('./admin-saisons.js');
for (const [sub, part] of [['avent', 'avent'], ['saison-worlds', 'worlds'], ['anniv-gang', 'anniv']]) {
  regSub(sub, { group: 'saisons', main: async () => (await saisonsMod()).mountSaisonsSection($('#saisons-root')),
    open: async () => (await saisonsMod()).showSaisonsPart(part) });
}
regSub('drops', { main: () => mountDropsSection($('#drops-root')) }); // drops : un tirage manuel, les premiers qui cliquent
// Idées C13/C15 (cagnotte, bulletin) et C17 (cartes Champions) : modules chargés à la demande
regSub('cagnotte', { main: () => import('./cartes/pots.js').then((m) => m.mountPotsSection($('#pots-root'))) });
regSub('champions', { main: () => import('./cartes/champions.js').then((m) => m.mountChampionsSection($('#champions-root'))) });
regSub('defis', { main: () => mountChallengesSection($('#challenges-root')) });
// Challenges de la semaine (migration 218, administrateur) : liste, ou fiche de suivi avec #fabrique/challenges/<id> ; module à la demande
const wchMod = () => import('./admin-wch.js');
regSub('challenges', { main: async () => (await wchMod()).mountWchSection($('#wch-root')), open: async (_el, { id }) => (await wchMod()).openWch(id) });
// questions du gang : un onglet réponses et statistiques ; #fete/questions/jour ouvre l'onglet « Question du jour » (Programmation)
regSub('questions', { main: () => mountQuizSection($('#quiz-root')), open: (_el, { id }) => { if (id === 'jour') $('#adq-tab-j')?.click(); } });
regSub('sutom', { main: () => mountSutomSection($('#sutom-root')) }); // Sutom du gang (J8) : banque de mots, programmation
if (MOUNT.secrets) regSub('secrets', { main: () => MOUNT.secrets($('#eggs-root')) }); // easter eggs : hg_settings.eggs et trouvailles
if (MOUNT.arcade) regSub('arcade', { main: () => MOUNT.arcade($('#arcade-root')) }); // arcade des pages 404 : classement et effacement des scores
if (MOUNT['loup-garou']) regSub('loup-garou', { main: () => MOUNT['loup-garou']($('#loup-garou-root')) }); // Loup-Garou : Paillettes, badges, parties (administrateur)
if (MOUNT.uno) regSub('uno', { main: () => MOUNT.uno($('#uno-root')) }); // Uno : Paillettes, badges, parties en cours (administrateur)
if (MOUNT['nom-de-code']) regSub('nom-de-code', { main: () => MOUNT['nom-de-code']($('#nom-de-code-root')) }); // Codenames (administrateur)
if (MOUNT.duels) regSub('duels', { main: () => MOUNT.duels($('#duels-root')) });
if (MOUNT.plateaux) regSub('plateaux', { main: () => MOUNT.plateaux($('#plateaux-root')) }); // Jeux de plateau (administrateur) // Duels : Paillettes, badges, duels en cours (administrateur)
// Page « Jeux » : GeoGuessr, citations (admin-jeux.js)
if (MOUNT.geoguessr) regSub('geoguessr', { main: () => MOUNT.geoguessr($('#geo-admin-root')) });
if (MOUNT.citations) regSub('citations', { main: () => MOUNT.citations($('#citations-admin-root')) });
if (MOUNT.preuves) regSub('preuves', { main: () => MOUNT.preuves($('#proofs-root')) });
// #fete/framed-heardle/heardle (ou /framed) choisit le jeu affiché (liens de la page Programmation)
if (MOUNT['framed-heardle']) regSub('framed-heardle', { main: () => MOUNT['framed-heardle']($('#jeux-medias-root')),
  open: (_el, { id }) => { if (id) document.querySelector(`#jeux-medias-root [data-part="${CSS.escape(id)}"]`)?.click(); } });
if (MOUNT.bataille) regSub('arene', { main: () => MOUNT.bataille($('#bataille-root')) });
if (MOUNT.gestion) regSub('gestion', { main: () => MOUNT.gestion($('#gestion-root')) }); // Gestion globale (Give, résumé, derniers gives)
// Pilotage › Assistance (demandes, idées, messagerie, fil)
regSub('assistance', supportSub); // liste en colonne 2, détail et fiche rapide
if (MOUNT['modeles-reponse']) regSub('modeles-reponse', { main: () => MOUNT['modeles-reponse']($('#modeles-reponse-root')) });
regSub('idees', ideasSub);
regSub('messagerie', {
  main: (el) => { el.dataset.fill = ''; mountMessagesSection($('#messages-root')); },
  open: openMessages, list: listMessages, // liste en colonne 2, lecture dans la zone (createThread en lecture seule)
});
if (MOUNT.fil) regSub('fil', { main: () => MOUNT.fil($('#fil-root')) }); // modération du fil d'activité de l'accueil
regSub('bot', { main: () => mountBotSection($('#bot-root')) });
if (MOUNT.commandes) regSub('commandes', { main: () => MOUNT.commandes($('#commandes-root')) }); // commandes slash Discord
// Pilotage › Site (Réglages du site)
// Réglages du site : une section, cinq parties (identité, textes, menu, état du site : un seul formulaire ; clés avancées :
// la liste brute de hg_settings, route d'origine #mairie/reglages). « + Nouvelle clé » : partie Clés avancées seulement.
const reglagesGroup = { group: 'reglages', main: () => mountReglagesSection($('#reglages-root')) };
for (const [sub, part] of [['identite', 'identite'], ['textes', 'textes'], ['menu', 'menu'], ['etat', 'etat'], ['reglages', 'cles']]) {
  regSub(sub, {
    ...reglagesGroup,
    open: () => {
      if (typeof Reg.showReglagesPart !== 'function') { setActions(reglagesActions()); return; } // section entière
      Reg.showReglagesPart(part);
      setActions(part === 'cles' ? reglagesActions() : []);
    },
  });
}
for (const [p, v] of PROV) if (v) registerSub(p.route, v); // Planning, À relancer, Mes jeux (idées A2 à A4)
regSub('theme', { main: () => mountThemesSection($('#theme-root')), open: () => setActions(themeActions()) });
if (MOUNT.erreurs) regSub('erreurs', { main: () => MOUNT.erreurs($('#errors-root')) }); // A9 : erreurs JavaScript regroupées
if (MOUNT.entretien) regSub('entretien', { main: () => MOUNT.entretien($('#entretien-root')) }); // quotas, tâches planifiées, purge
if (MOUNT.archives) regSub('archives', { main: () => MOUNT.archives($('#archives-root')) }); // A8 : archive annuelle (admin)

/* ---------- Démarrage : seulement les données partagées des sections permises (chaque donnée se charge une fois) ---------- */
// Les réglages du bot et du thème se chargent avec leur section (admin-bot.js, admin-themes.js).
const needMembers = anySection('comptes', 'membres', 'secret-santa', 'badges', 'idees', 'assistance', 'messagerie');
const needSS = has('secret-santa');
const needBadges = anySection('badges', 'evenements', 'comptes', 'membres');
// Chargement en parallèle. Une erreur n'arrête pas le démarrage : elle s'affiche dans la section concernée.
await Promise.all([
  needMembers ? safe(ensureMembers, (e) => toast(`Membres : ${errMsg(e)}`, 'error')) : null,
  has('membres') ? safe(ensureInvites, (e) => { $('#invite-list').innerHTML = sectionError(e); }) : null,
  needSS ? safe(ensureSS, (e) => { $('#ss-root').innerHTML = sectionError(e); }) : null,
  needBadges ? safe(ensureBadges, (e) => { $('#badge-grid').innerHTML = sectionError(e); }) : null,
  has('idees') ? safe(ensureIdeas, (e) => { $('#ideas-root').innerHTML = sectionError(e); }) : null,
  has('assistance') ? safe(ensureSupport, (e) => { $('#support-root').innerHTML = sectionError(e); }) : null,
]);

// Compteurs, puis listes déjà prêtes ; le routage démarre ensuite.
await loadCounts(); // compteurs « à traiter » (plateau) : échanges, alertes économie, demandes, idées
if (has('membres') || has('comptes')) renderMembers();
if (has('membres')) renderInvites();
if (S.ssLoaded) renderSS();
if (has('badges')) renderBadges();
if (has('idees')) renderIdeas();
if (has('assistance')) renderSupport();
startShell();
if (MOUNT.erreurs && has('erreurs')) import('./admin-errors.js').then((m) => m.countNewErrors()).catch(() => {}); // compteur du rail (A9)
initLive(); // temps réel du panel (voyant, compteurs, sections) ; sans effet si indisponible
if (countTables().length) onTableChange('plateau', countTables(), loadCounts); // compteurs du plateau (échanges, journal)
