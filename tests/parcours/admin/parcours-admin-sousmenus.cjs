// Parcours : pages des lieux du panel admin (/pages/admin/admin.html) — titres de groupe sur chaque page de lieu, routes de toutes les
// pages, anciennes adresses, palette « Groupe · Libellé », garde de longueur des pages, filtrage Staff, mobile.
// Sur le faux Supabase (fixtures/fake-sb.mjs).
// (a) administrateur : chaque lieu affiche ses titres de groupe dans l'ordre (texte simple, non focalisable, rien de cliquable)
// (b) chaque route de l'arbre s'ouvre (adresse, fil d'Ariane, section visible) ; anciennes adresses redirigées ; palette
// (c) garde de longueur : à 1 280 × 900, #app.scrollHeight ≤ 1 400 px pour chaque page et onglet, sauf EXCEPTIONS
// (d) Staff ['cartes'] : La Salle des ventes, La Fabrique de cartes et La Mairie (Planning) sur le plateau ; pas de Secrets
// (e) 375 px : barre du bas (Plateau et lieux), page de lieu sans défilement horizontal
// Lancer : node tests/parcours/admin/parcours-admin-sousmenus.cjs
const { ROOT, check, finish, openPage, adminSection, hscroll, chromium, sleep } = require('../../lib/harness.cjs');

/** Identifiant de test du membre n (mêmes identifiants que le faux client : U(3) = Bruno). */
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
// Hauteur maximale d'une page (px CSS, zone principale, fenêtre 1 280 × 900).
const MAX_H = 1400;
// Exceptions documentées à la garde de longueur (route -> raison). Toute autre route au-delà de MAX_H échoue.
const EXCEPTIONS = {
  'fete/programmation': 'calendrier, puis détail du jour : la hauteur suit le contenu réel des cinq jeux (images, questions, formulaires)',
  'fete/secrets': 'formulaire des 18 secrets, récompenses et cueillette de saison (admin-eggs.js)',
  'fabrique/gestion': 'Give, résumé et derniers gives : ≈ 1 392 px sur la machine de dev, 1 410 px sur la CI (polices Linux, plus larges) ; marge de polices, à replier plus tard',
  'fabrique/boosters': 'liste des 9 types et statistiques par type (onglet Boosters, chantier séparé : statistiques à replier)',
  'place/invitations': 'codes + liens + règles des codes, à la limite (≈ 1 403 px avec la fixture) : « Règles des codes » à séparer plus tard',
  'place/social': 'Vie sociale (migration 090) : plateformes gaming, jeux, plafonds et sondages ; à replier en blocs',
  'fabrique/limites': 'Limites : quêtes, drops, générations, échanges, puis les plafonds de Paillettes repliés (≈ 1 440 px) ; à répartir en pages plus tard',
  'mairie/menu': 'Menu et pied de page : libellés de tous les menus et de leurs entrées (≈ 1 650 px), en blocs côte à côte',
  'mairie/textes': 'Textes et intro : groupe « Page d’accueil » replié, puis textes des pages, intro et visite (≈ 1 550 px) ; à répartir en pages plus tard',
};

// Arbre attendu : lieu -> [titre de groupe (null : sans titre), [pages]] (dans l'ordre de LIEUX, admin/perms.js).
const TREE = {
  place: [['Membres', ['comptes', 'roles', 'champs', 'social', 'accueil']], ['Relances', ['relance', 'invitations']],
    ['Entraide', ['parrainage', 'competences']], ['Accès', ['acces', 'acces-matrice']], ['Badges', ['badges', 'badges-attribution', 'badges-criteres']]],
  poste: [['Demandes', ['assistance', 'idees']], ['Échanges', ['messagerie', 'fil']], ['Discord', ['bot', 'commandes']]],
  ventes: [['Enchères', ['encheres']], ['Entre membres', ['echanges']]],
  camp: [['Qui', ['membres-irl']], ['Vivre les sorties', ['sorties', 'souvenirs']], ['Rendez-vous', ['secret-santa']]],
  fabrique: [['Agir', ['gestion', 'drops', 'codes']], ['Arène', ['arene']], ['Catalogue', ['series', 'cartes', 'boosters']],
    ['Suivi', ['joueurs', 'stats']], ['Économie', ['economie', 'tirage', 'recyclage', 'limites']],
    ['Animations', ['quetes', 'defis', 'cagnotte', 'champions', 'recettes']]],
  fete: [['Événements', ['evenements', 'rdv', 'avent', 'saison-worlds', 'anniv-gang']],
    ['Jeux', ['programmation', 'questions', 'sutom', 'geoguessr', 'citations', 'preuves', 'framed-heardle', 'arcade', 'secrets', 'mes-jeux', 'loup-garou', 'uno', 'nom-de-code', 'plateaux', 'duels']]],
  mairie: [['Organisation', ['planning', 'journal', 'staff']], ['Le site', ['identite', 'textes', 'menu', 'theme']],
    ['Technique', ['etat', 'erreurs', 'archives', 'reglages']]],
};
const ROUTES = Object.entries(TREE).flatMap(([lieu, groups]) => groups.flatMap(([, subs]) => subs.map((s) => `${lieu}/${s}`)));

/** Titres de groupe et pages d'une page de lieu, dans l'ordre : [[titre|null, [ids]]]. */
const groupsOnPage = (p) => p.$$eval('#lieu-root .lieu-group', (sections) => sections.map((s) => [
  s.querySelector('.lieu-group-title')?.textContent.trim() ?? null,
  [...s.querySelectorAll('.lieu-tile')].map((a) => a.dataset.sub),
]));

/** Hauteur de la zone principale une fois le rendu posé. */
async function zoneHeight(p) {
  await sleep(600);
  return p.evaluate(() => document.getElementById('app').scrollHeight);
}
/** Ouvre une adresse par le fragment (sans attendre de section : onglets de fiche, détails). */
async function goHash(p, h) {
  await p.evaluate((x) => { location.hash = x; }, h);
  await sleep(400);
}

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  try {

  /* ---------- (a) Titres de groupe, administrateur ---------- */
  let p = await openPage(browser, { page: 'admin', width: 1280, height: 900 });
  for (const [lieu, want] of Object.entries(TREE)) {
    await goHash(p, `#${lieu}`);
    await p.waitForSelector('#lieu-root .lieu-group', { timeout: 5000 }).catch(() => {});
    const got = await groupsOnPage(p);
    check(JSON.stringify(got) === JSON.stringify(want), `(a) ${lieu} : groupes = ${JSON.stringify(got.map(([h]) => h))}`);
  }
  await goHash(p, '#fabrique');
  const heads = await p.$$eval('#lieu-root .lieu-group-title', (hs) => hs.map((h) => ({
    tag: h.tagName, tab: h.tabIndex, role: h.getAttribute('role'), inLink: !!h.closest('a, button'),
  })));
  check(heads.length > 0 && heads.every((h) => h.tag === 'H3' && h.tab < 0 && !h.role && !h.inLink),
    `(a) titres de groupe : texte simple, non focalisable (${heads.length} titres)`);
  const look = await p.$eval('#lieu-root .lieu-group-title', (h) => ({ fs: parseFloat(getComputedStyle(h).fontSize), vis: h.getClientRects().length > 0 }));
  check(look.vis && look.fs >= 11, `(a) titre de groupe visible et lisible (${look.fs} px)`);

  /* ---------- (b) Chaque route s'ouvre ; anciennes adresses ; palette ---------- */
  const bad = [];
  for (const r of ROUTES) {
    try { await adminSection(p, r); } catch { bad.push(r); }
  }
  check(!bad.length, `(b) les ${ROUTES.length} pages s'ouvrent (adresse, section visible)${bad.length ? ' — échecs : ' + bad.join(', ') : ''}`);
  await adminSection(p, 'fabrique/tirage');
  check((await p.textContent('#zone-crumb')).replace(/\s*›\s*/g, ' › ').replace(/\s+/g, ' ').trim() === 'Plateau › La Fabrique de cartes › Tirage',
    '(b) fil d’Ariane : Plateau › La Fabrique de cartes › Tirage');
  for (const [from, to] of [['#reglages', '#mairie/identite'], ['#fabrique/economie', '#fabrique/economie'], ['#place/badges', '#place/badges'],
    ['#place/acces', '#place/acces'], ['#mairie/reglages', '#mairie/reglages'], ['#eggs', '#fete/secrets'], ['#fil', '#poste/fil']]) {
    await goHash(p, '#plateau');
    await goHash(p, from);
    await p.waitForFunction((t) => location.hash === t, to, { timeout: 4000 }).catch(() => {});
    check(await p.evaluate(() => location.hash) === to, `(b) ${from} -> ${to}`);
  }
  // Palette : « Groupe · Libellé », recherche sur le titre de groupe
  await p.keyboard.press('Control+k');
  await p.waitForSelector('.apal-backdrop:not([hidden])', { timeout: 5000 });
  await p.fill('#apal-q', 'économie');
  await sleep(200);
  const pal = await p.$$eval('.apal-item .apal-label', (els) => els.map((e) => e.textContent.trim()));
  check(pal.includes('La Fabrique de cartes · Économie · Tirage') || pal.some((x) => /Économie · Tirage/.test(x)), `(b) palette « économie » : ${pal.join(' | ')}`);
  await p.fill('#apal-q', 'matrice');
  await sleep(200);
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => location.hash === '#place/acces-matrice', null, { timeout: 5000 }).catch(() => {});
  check(await p.evaluate(() => location.hash) === '#place/acces-matrice', '(b) palette : « matrice » ouvre Accès › Matrice membres × pages');
  check(p.errs.length === 0, '(a-b) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 5).join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- (c) Garde de longueur, 1 280 × 900 ---------- */
  p = await openPage(browser, { page: 'admin', width: 1280, height: 900 });
  const H = {};
  for (const r of ROUTES) {
    await adminSection(p, r).catch(() => {});
    H[r] = await zoneHeight(p);
    if (r === 'poste/bot') {
      for (const t of ['connexion', 'salons', 'mentions', 'annonces', 'mp', 'modeles', 'regles']) {
        if (!(await p.locator(`#bot-tab-${t}`).count())) { H[`${r} [${t}]`] = -1; continue; }
        await p.click(`#bot-tab-${t}`);
        H[`${r} [${t}]`] = await zoneHeight(p);
      }
    }
  }
  for (const t of ['profil', 'infos', 'ss', 'irl', 'photos', 'contrib', 'badges', 'acces']) {
    await goHash(p, `#place/comptes/${U(3)}/${t}`);
    H[`place/comptes/<Bruno>/${t}`] = await zoneHeight(p);
  }
  const over = Object.entries(H).filter(([r, h]) => h > MAX_H && !EXCEPTIONS[r]);
  const missing = Object.entries(H).filter(([, h]) => h < 0).map(([r]) => r);
  console.log('       hauteurs : ' + Object.entries(H).map(([r, h]) => `${r}=${h}`).join(' · '));
  check(!over.length, `(c) garde de longueur : toutes les pages ≤ ${MAX_H} px${over.length ? ' — trop longues : ' + over.map(([r, h]) => `${r} (${h})`).join(', ') : ''}`);
  check(!missing.length, `(c) onglets du Bot tous mesurés${missing.length ? ' — absents : ' + missing.join(', ') : ''}`);
  for (const r of Object.keys(EXCEPTIONS)) console.log(`       exception : ${r} = ${H[r]} px (${EXCEPTIONS[r]})`);
  check(p.errs.length === 0, '(c) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 5).join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- (d) Staff ['cartes'] ---------- */
  p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { uid: U(2), staff: ['cartes'] } });
  const lieux = await p.$$eval('.plateau-lieu', (as) => as.map((a) => a.getAttribute('href')));
  check(JSON.stringify(lieux) === JSON.stringify(['#ventes', '#fabrique', '#mairie']), `(d) Staff ['cartes'] : plateau = ${lieux.join(' ')} (Planning inclus)`);
  await goHash(p, '#fabrique');
  const st = await groupsOnPage(p);
  check(JSON.stringify(st) === JSON.stringify(TREE.fabrique), `(d) Staff ['cartes'] : La Fabrique complète (${st.map(([h]) => h).join(', ')})`);
  check(await p.locator('#lieu-root a[href="#fete/secrets"], #lieu-root a[href="#poste/fil"]').count() === 0, '(d) Staff : ni Secrets, ni Fil d’activité dans les pages');
  await goHash(p, '#fete/secrets');
  check(await p.evaluate(() => location.hash) !== '#fete/secrets' && !(await p.isVisible('#eggs')), '(d) Staff : #fete/secrets redirigée, section jamais affichée');
  await adminSection(p, 'fabrique/limites');
  check(await p.isVisible('#cartes'), '(d) Staff : Économie › Limites s’ouvre');
  check(p.errs.length === 0, '(d) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 5).join(' | ') + ')' : ''));
  await p.ctx.close();

  /* ---------- (e) Mobile 375 px ---------- */
  p = await openPage(browser, { page: 'admin', width: 375, height: 812 });
  check((await p.$$eval('#shell-tabs .shell-tab', (as) => as.length)) === 8 && await p.isVisible('#shell-tabs'), '(e) 375 px : Plateau et 7 lieux dans la barre du bas');
  let hsMax = 0;
  for (const lieu of Object.keys(TREE)) {
    await p.click(`#shell-tabs .shell-tab[data-lieu="${lieu}"]`);
    await sleep(400);
    hsMax = Math.max(hsMax, await hscroll(p));
  }
  await goHash(p, '#fabrique');
  const mHeads = await p.$$eval('#lieu-root .lieu-group-title', (hs) => hs.filter((h) => h.getClientRects().length).map((h) => h.textContent.trim()));
  check(JSON.stringify(mHeads) === JSON.stringify(TREE.fabrique.map(([h]) => h)), `(e) page de La Fabrique au téléphone : titres de groupe visibles (${mHeads.join(', ')})`);
  check(hsMax <= 0, `(e) pages des 7 lieux sans défilement horizontal (${hsMax})`);
  check(p.errs.length === 0, '(e) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 5).join(' | ') + ')' : ''));
  await p.ctx.close();

  } catch (e) {
    check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]);
  } finally {
    await browser.close();
  }
  finish();
})();
