// Q4 · Collection hors ligne (assets/commun/offline-store.js, cartes.js, membre.js), faux Supabase.
// Le site de test n'a pas de service worker (http://hg.test n'est pas un contexte sûr) : la coupure du réseau est simulée
// par navigator.onLine = false et le scénario « offline » du faux Supabase, qui note toute requête tentée.
// - Cartes, 390 px : premier chargement en ligne (copie gardée), puis rechargement hors ligne : bandeau daté, onglet
//   Collection seul actif (Ouverture, Inventaire, Boutique, Classement, Échanges grisés), même nombre de cartes,
//   carte agrandie disponible, recyclage masqué, aucune requête, pas de défilement horizontal.
// - Carte de membre : la sienne s'affiche hors ligne ; celle d'un autre non.
// - Déconnexion : copie effacée (la page Cartes hors ligne dit alors qu'il n'y a pas de copie).
// - Réglage coupé (site_identite.cartes_hors_ligne = false) : rien n'est gardé.
// Lancer : node tests/parcours/cartes/parcours-collection-hors-ligne.cjs
const path = require('path');
const { basculerVue, ORIGIN, PREFIX, SHOTS, check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

/** Coupe le « réseau » pour les prochains chargements de la page (navigator.onLine faux, faux Supabase en mode offline). */
const goOffline = (p) => p.ctx.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'onLine', { get: () => false, configurable: true });
  window.__SCN = { ...(window.__SCN || {}), offline: true };
});
/** Requêtes vers la base tentées pendant le hors ligne. */
const offlineReqs = (p) => p.evaluate(() => (window.__LOG || []).filter((l) => l[0] === 'offline-req').map((l) => l.slice(1).join(':')));
/**
 * Lectures communes à toutes les pages (thème, réglages, anniversaire, badges) : elles échouent sans réseau
 * et le site reprend ses valeurs par défaut, comme avant. Tout le reste (collection, cartes, échanges) doit rester à zéro.
 */
const LECTURES_LAYOUT = ['from:hg_settings', 'from:hg_themes', 'rpc:hg_eggs_public'];
/** Nombre de cartes affichées dans la collection. */
const cells = (p) => p.locator('#cartes-p-collection .cz-cell').count();

(async () => {
  const browser = await chromium.launch();

  /* ---------- Cartes ---------- */
  {
    const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 390, height: 844, mobile: true, dpr: 2, hash: '#collection' });
    await p.locator('#cartes-p-collection .cz-cell').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(800); // copie IndexedDB écrite après la lecture des données
    const enLigne = await cells(p);
    check(enLigne > 0, `en ligne : ${enLigne} cartes dans la collection`);
    check(!(await p.locator('.offline-banner').count()), 'en ligne : pas de bandeau hors ligne');

    await goOffline(p);
    await p.reload(); await sleep(1500);
    check(await p.locator('.offline-banner').isVisible(), 'hors ligne : bandeau « Hors ligne · lecture seule » visible');
    check(/telle qu’au .+ à \d+ h \d\d/.test(await p.locator('.offline-banner').textContent()), 'hors ligne : bandeau daté (« telle qu’au … à … h … »)');
    check(await p.getAttribute('#cartes-tab-collection', 'aria-selected') === 'true', 'hors ligne : onglet Collection ouvert');
    for (const t of ['ouverture', 'inventaire', 'boutique', 'classement', 'echanges']) {
      check(await p.locator(`#cartes-tab-${t}`).isDisabled(), `hors ligne : onglet ${t} grisé`);
    }
    check(await p.getAttribute('#cartes-tab-echanges', 'title') === 'Disponible quand le réseau revient', 'hors ligne : « Disponible quand le réseau revient »');
    const horsLigne = await cells(p);
    check(horsLigne === enLigne, `hors ligne : même nombre de cartes (${horsLigne} / ${enLigne})`);
    check(!(await p.locator('.mc-actions').isVisible()), 'hors ligne : recyclage, planche et Champion masqués');
    await p.click('#cartes-tab-ouverture', { force: true }).catch(() => {});
    check(await p.getAttribute('#cartes-tab-collection', 'aria-selected') === 'true', 'hors ligne : clic sur Ouverture sans effet');
    await basculerVue(p, 'owned'); await sleep(300);
    check(await cells(p) > 0, 'hors ligne : le filtre « Possédées » fonctionne');
    const zoomBtn = p.locator('#cartes-p-collection .cz-zoom').first();
    if (await zoomBtn.count()) { await zoomBtn.click(); await sleep(500); check(await p.evaluate(() => !!document.querySelector('dialog[open]')), 'hors ligne : carte agrandie'); await p.keyboard.press('Escape'); await sleep(300); }
    check(await hscroll(p) <= 0, 'hors ligne : pas de défilement horizontal à 390');
    await p.screenshot({ path: path.join(SHOTS, 'collection-hors-ligne-390.png') });
    const req = await offlineReqs(p);
    const reqHors = req.filter((r) => !LECTURES_LAYOUT.includes(r));
    check(!reqHors.length, `hors ligne : aucune requête de collection tentée${reqHors.length ? ' — ' + reqHors.join(', ') : ''}`);
    check(!p.errs.length, 'hors ligne : aucune erreur : ' + p.errs.join(' | '));

    // Déconnexion (toujours hors ligne) : la copie est effacée
    await p.click('.site-header .nav-me'); // « Se déconnecter » est dans l'éventail de la photo de profil
    await p.click('.site-header .nav-logout');
    await p.waitForURL(/compte\.html/, { timeout: 8000 }).catch(() => {});
    await p.goto(`${ORIGIN}${PREFIX}/pages/cartes/cartes.html`); await sleep(1200);
    check(/Aucune copie de ta collection/.test(await p.locator('.offline-banner').textContent().catch(() => '')), 'après déconnexion : copie effacée (« Aucune copie de ta collection »)');
    await p.ctx.close();
  }

  /* ---------- Carte de membre ---------- */
  {
    const p = await openPage(browser, { page: 'membre', width: 390, height: 844 });
    await p.locator('.idc:not(.idc-skeleton)').first().waitFor({ timeout: 10000 }).catch(() => {});
    await sleep(600);
    await goOffline(p);
    await p.reload(); await sleep(1500);
    check(await p.locator('.offline-banner').isVisible(), 'membre hors ligne : bandeau visible');
    check(await p.locator('#mb-main .idc').count() > 0, 'membre hors ligne : sa carte de membre affichée');
    check(!(await p.locator('#gang').count()), 'membre hors ligne : pas d’annuaire (données des autres)');
    const reqMembre = (await offlineReqs(p)).filter((r) => !LECTURES_LAYOUT.includes(r));
    check(!reqMembre.length, `membre hors ligne : aucune requête de données tentée${reqMembre.length ? ' — ' + reqMembre.join(', ') : ''}`);
    check(await hscroll(p) <= 0, 'membre hors ligne : pas de défilement horizontal');
    await p.goto(`${ORIGIN}${PREFIX}/pages/compte/membre.html?id=00000002-0000-4000-8000-000000000002`); await sleep(1200);
    check(!(await p.locator('#mb-main .idc').count()) && /seule ta propre carte/.test(await p.textContent('#app')), 'membre hors ligne : la carte d’un autre membre n’est pas montrée');
    check(!p.errs.length, 'membre : aucune erreur : ' + p.errs.join(' | '));
    await p.ctx.close();
  }

  /* ---------- Réglage coupé : rien n'est gardé ---------- */
  {
    const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, scenario: { settingsExtra: { site_identite: { cartes_hors_ligne: false } } } });
    await sleep(1500);
    await goOffline(p);
    await p.reload(); await sleep(1200);
    check(/Aucune copie de ta collection/.test(await p.locator('.offline-banner').textContent().catch(() => '')), 'réglage coupé : aucune copie gardée');
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
