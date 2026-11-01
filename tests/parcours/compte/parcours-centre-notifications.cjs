// Parcours : centre de notifications (/pages/compte/notifications.html, migration 195).
// (a) liste : groupes, filtres avec leur nombre, catégorie inconnue, pied ; lien depuis le panneau de l'en-tête.
// (b) filtres et recherche, % littéral, aucun résultat, « Effacer la recherche », texte échappé.
// (c) pagination : « Voir plus » reprend après la dernière ligne, sans doublon ; attend la lecture en route (filtre, recherche, relecture de fond).
// (d) lu : une ligne, « Tout marquer comme lu », badge et panneau à jour ; changement venu du panneau.
// (e) suppression une par une : ligne, comptes, badge, focus, lecture partie avant la suppression ; suppression des lues avec confirmation, annulation comprise.
// (f) états : vide, chargement, erreur avec Réessayer, échec d'une suppression ; visiteur renvoyé vers la connexion.
// (g) 390 px au doigt : filtres sur une ligne qui défile, pas de défilement horizontal, cibles de 44 px, champ de 16 px.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/compte/parcours-centre-notifications.cjs
const { check, finish, openPage, log, sleep, chromium } = require('../../lib/harness.cjs');

const heures = (h) => new Date(Date.now() - h * 36e5).toISOString();
const LIGNES = [
  { id: 9, cat: 'souhaits', titre: 'Une carte de ta liste est proposée', texte: 'Raclette vient d’arriver sur le tableau.', lien: '/pages/cartes/cartes.html', created_at: heures(0.1), lu: false },
  { id: 8, cat: 'echanges', titre: 'Nouvelle offre de Lina', texte: 'Remise de 100% sur le tout', lien: null, created_at: heures(0.2), lu: false },
  { id: 7, cat: 'messages', titre: 'Nouveau message de Karim', texte: null, lien: null, created_at: heures(0.3), lu: true },
  { id: 6, cat: 'echanges', titre: 'Ton offre à Noé expire demain', texte: 'Remise de 100 euros', lien: null, created_at: heures(72), lu: true },
  { id: 5, cat: 'sorties', titre: 'Rappel : Soirée jeux', texte: 'Samedi à 19 h, Lausanne.', lien: null, created_at: heures(96), lu: true },
  { id: 4, cat: 'nouvelle_cat', titre: 'Catégorie jamais vue', texte: null, lien: null, created_at: heures(100), lu: true },
  { id: 3, cat: 'annonces', titre: 'Nouvelle saison de cartes', texte: '<img src=x onerror=window.__xss=1>', lien: null, created_at: heures(12 * 24), lu: true },
  { id: 2, cat: 'echanges', titre: 'Offre acceptée par Lina', texte: 'Tes cartes sont dans ta collection.', lien: null, created_at: heures(41 * 24), lu: true },
];
const textes = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/\s+/g, ' ').trim());
const filtres = (p) => p.$$eval('.ntf-filtre', (l) => l.map((b) => b.textContent.replace(/\s+/g, ' ').trim()));
const rangees = (p) => p.locator('.ntf-rangee').count();
const ouvrir = async (browser, o = {}) => { const p = await openPage(browser, { page: 'notifications', scenario: { notifs: LIGNES }, ...o }); await p.waitForSelector('.ntf-rangee, .ntf .empty, .ntf-alerte', { timeout: 8000 }); return p; };
const appels = async (p, fn) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === fn);
/** hg_notifs_page répond avec ce qu'elle a lu à l'appel, mais window.__retard ms plus tard : une lecture en route peut être périmée. */
const retarder = (p) => p.evaluate(async () => {
  const { sb } = await import('/assets/commun/core.js');
  const rpc = sb.rpc.bind(sb);
  sb.rpc = async (fn, a) => {
    const r = await rpc(fn, a);
    if (fn === 'hg_notifs_page' && window.__retard) await new Promise((ok) => setTimeout(ok, window.__retard));
    return r;
  };
});

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- (a) liste ---------- */
    let p = await ouvrir(browser);
    check((await textes(p, 'h1')) === 'Notifications' && (await textes(p, '.eyebrow')) === 'Mon compte', '(a) titre');
    check(await rangees(p) === 8, '(a) huit lignes');
    check(JSON.stringify(await p.$$eval('.ntf-jour', (l) => l.map((e) => e.textContent))) === JSON.stringify(['Aujourd’hui', 'Cette semaine', 'Plus ancien']), '(a) trois groupes');
    const f = await filtres(p);
    check(f[0] === 'Toutes 8' && f.includes('Cartes 1') && f.includes('Échanges 3') && f.includes('Messages 1') && f.includes('Sorties 1') && f.includes('Annonces 1'), '(a) filtres présents, avec leur nombre : ' + f.join(', '));
    check(!f.some((x) => x.startsWith('Jeux')), '(a) catégorie absente : pas de filtre');
    check(f[f.length - 1] === 'Nouvelle_cat 1', '(a) catégorie inconnue : filtre sous son nom, après les autres');
    check(/Nouvelle_cat/.test(await textes(p, '.ntf-rangee:has(.notif-titre:text("Catégorie jamais vue"))')), '(a) catégorie inconnue : affichée sur la ligne');
    check(/gardées 90 jours, puis supprimées automatiquement/.test(await textes(p, '.ntf-pied')), '(a) pied');
    check(await p.isVisible('#ntf-lire') && await p.isVisible('#ntf-suppr-lues'), '(a) actions visibles');
    check(!(await p.evaluate(() => window.__xss)) && await p.locator('.ntf-rangee img').count() === 0, '(a) texte échappé');
    check(await p.getAttribute('.ntf-suppr >> nth=0', 'aria-label') === 'Supprimer : Une carte de ta liste est proposée', '(a) bouton de suppression nommé');
    await p.click('#statut-btn');
    await p.waitForSelector('.notif-tout');
    check(await p.getAttribute('.notif-tout', 'href') === '/pages/compte/notifications.html' && /Voir tout l’historique/.test(await textes(p, '.notif-tout')), '(a) panneau : lien vers l’historique');
    await p.click('#statut-btn');
    check(p.errs.length === 0, '(a) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));

    /* ---------- (b) filtres et recherche ---------- */
    await p.click('.ntf-filtre:has-text("Échanges")');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 3);
    check(await p.getAttribute('.ntf-filtre:has-text("Échanges")', 'aria-pressed') === 'true' && await p.getAttribute('.ntf-filtre:has-text("Toutes")', 'aria-pressed') === 'false', '(b) filtre actif');
    await p.fill('#ntf-q', '100%');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 1);
    check(/Nouvelle offre de Lina/.test(await textes(p, '#ntf-corps')), '(b) % est un caractère ordinaire');
    const fq = await filtres(p);
    check(fq[0] === 'Toutes 1' && fq.includes('Échanges 1') && fq.length === 2, '(b) nombres selon la recherche : ' + fq.join(', '));
    await p.fill('#ntf-q', 'karim');
    await p.waitForSelector('.ntf-sans');
    check(await p.getAttribute('.ntf-filtre:has-text("Échanges")', 'aria-pressed') === 'true', '(b) recherche vide dans le filtre : le filtre choisi reste affiché');
    await p.click('.ntf-filtre:has-text("Toutes")');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 1);
    check(/Karim/.test(await textes(p, '#ntf-corps')), '(b) recherche dans le titre, sans casse');
    await p.fill('#ntf-q', '<b>rien</b>');
    await p.waitForSelector('.ntf-sans');
    check((await textes(p, '.ntf-sans p')) === 'Aucune notification ne correspond à « <b>rien</b> ».' && await p.locator('.ntf-sans b').count() === 0, '(b) aucun résultat, recherche échappée');
    check(await p.isHidden('#ntf-lire') && await p.isHidden('#ntf-suppr-lues'), '(b) aucun résultat : pas d’action');
    await p.click('#ntf-effacer');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 8);
    check((await p.inputValue('#ntf-q')) === '' && await p.evaluate(() => document.activeElement.id === 'ntf-q'), '(b) recherche effacée, focus dans le champ');
    await p.ctx.close();

    /* ---------- (c) pagination ---------- */
    const beaucoup = Array.from({ length: 65 }, (_, i) => ({ id: i + 1, cat: i % 2 ? 'jeux' : 'messages', titre: `Ligne ${i + 1}`, texte: null, lien: null, created_at: heures(i + 1), lu: true }));
    p = await ouvrir(browser, { scenario: { notifs: beaucoup } });
    check(await rangees(p) === 30 && await p.isVisible('#ntf-plus'), '(c) première page : 30 lignes et « Voir plus »');
    await p.click('#ntf-plus');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 60);
    const plus = (await appels(p, 'hg_notifs_page')).pop()[2];
    check(plus.p_avant_id === 30 && !!plus.p_avant_at && plus.p_limite === 30, '(c) la suite repart de la dernière ligne : ' + JSON.stringify(plus));
    check(await p.evaluate(() => document.activeElement.dataset.ntfSuppr === '31'), '(c) focus sur la première ligne ajoutée');
    await p.click('#ntf-plus');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 65);
    const ids = await p.$$eval('.ntf-suppr', (l) => l.map((b) => b.dataset.ntfSuppr));
    check(new Set(ids).size === 65 && await p.locator('#ntf-plus').count() === 0, '(c) aucune ligne en double, plus de « Voir plus »');
    await p.ctx.close();

    // « Voir plus » pendant un changement de filtre ou de recherche : attend, aucune ligne du mauvais filtre ni en double.
    p = await ouvrir(browser, { scenario: { notifs: beaucoup } });
    await retarder(p);
    const seul = (await appels(p, 'hg_notifs_page')).length;
    await p.evaluate(() => { window.__retard = 300; });
    await p.click('.ntf-filtre:has-text("Jeux")');
    check(await p.isDisabled('#ntf-plus'), '(c) filtre en cours de changement : « Voir plus » grisé');
    await p.evaluate(() => document.getElementById('ntf-plus')?.click());
    await sleep(800);
    let vus = await p.$$eval('.ntf-suppr', (l) => l.map((b) => Number(b.dataset.ntfSuppr)));
    check(vus.length === 30 && vus.every((n) => n % 2 === 0) && new Set(vus).size === 30, `(c) après le filtre : seulement ses lignes, sans doublon (${vus.length})`);
    check((await appels(p, 'hg_notifs_page')).slice(seul).every((l) => l[2].p_avant_id === null), '(c) aucune page suivante demandée pendant la lecture');
    check(await p.isEnabled('#ntf-plus'), '(c) lecture finie : « Voir plus » de nouveau disponible');
    await p.fill('#ntf-q', 'Ligne');
    await p.waitForFunction(() => document.getElementById('ntf-plus')?.disabled, null, { timeout: 2000 });
    await p.evaluate(() => document.getElementById('ntf-plus')?.click());
    await sleep(800);
    vus = await p.$$eval('.ntf-suppr', (l) => l.map((b) => b.dataset.ntfSuppr));
    check(vus.length === 30 && new Set(vus).size === 30, '(c) après la recherche : aucune ligne en double');

    // « Voir plus » parti avant le changement de filtre : sa page est ignorée.
    await p.click('#ntf-plus');
    await p.click('.ntf-filtre:has-text("Toutes")');
    await sleep(1000);
    vus = await p.$$eval('.ntf-suppr', (l) => l.map((b) => b.dataset.ntfSuppr));
    check(vus.length === 30 && new Set(vus).size === 30, '(c) page partie avant le changement de filtre : ignorée');

    // Une relecture de fond ratée rend le bouton.
    await p.evaluate(() => { window.__NTF.panne = 'hg_notifs_page'; document.dispatchEvent(new CustomEvent('hg-notifs')); });
    check(await p.isDisabled('#ntf-plus'), '(c) relecture de fond : « Voir plus » grisé le temps de la lecture');
    await sleep(500);
    check(await p.isEnabled('#ntf-plus'), '(c) relecture de fond ratée : « Voir plus » de nouveau disponible');
    await p.evaluate(() => { window.__NTF.panne = null; });
    check(p.errs.length === 0, '(c) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));
    await p.ctx.close();

    /* ---------- (d) lu ---------- */
    p = await ouvrir(browser);
    await p.waitForSelector('#statut-btn .statut-n:not([hidden])');
    check((await p.textContent('#statut-btn .statut-n')) === '2', '(d) badge : 2 non lues');
    await p.click('.notif-item.is-new >> nth=1');
    await p.waitForFunction(() => document.querySelectorAll('#ntf-corps .is-new').length === 1);
    check((await p.textContent('#statut-btn .statut-n')) === '1', '(d) une ligne lue : badge à 1');
    check((await appels(p, 'hg_notifs_lues')).pop()[2].p_ids[0] === 8, '(d) la bonne ligne');
    await p.click('#ntf-lire');
    await p.waitForFunction(() => !document.querySelector('#ntf-corps .is-new'));
    check(await p.isHidden('#statut-btn .statut-n') && await p.isDisabled('#ntf-lire'), '(d) tout lu : badge retiré, bouton grisé');
    check(await p.evaluate(() => document.activeElement.id === 'ntf-titre'), '(d) focus gardé dans la page');
    await p.ctx.close();

    // Depuis le panneau : la page suit.
    p = await ouvrir(browser);
    await p.click('#statut-btn');
    await p.waitForSelector('[data-notif-act="lire"]:not([disabled])');
    await p.click('[data-notif-act="lire"]');
    await p.waitForFunction(() => !document.querySelector('#ntf-corps .is-new'), null, { timeout: 4000 }).catch(() => {});
    check(await p.locator('#ntf-corps .is-new').count() === 0 && await p.isDisabled('#ntf-lire'), '(d) « Tout marquer comme lu » du panneau : la page suit');
    await p.ctx.close();

    /* ---------- (e) suppression ---------- */
    p = await ouvrir(browser);
    await p.waitForSelector('#statut-btn .statut-n:not([hidden])');
    await p.click('.ntf-suppr[data-ntf-suppr="8"]');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 7);
    check((await filtres(p)).includes('Échanges 2') && (await filtres(p))[0] === 'Toutes 7', '(e) comptes à jour');
    await p.waitForFunction(() => document.querySelector('#statut-btn .statut-n').textContent === '1', null, { timeout: 3000 }).catch(() => {});
    check((await p.textContent('#statut-btn .statut-n')) === '1', '(e) ligne non lue supprimée : badge à 1');
    check(await p.evaluate(() => document.activeElement.dataset.ntfSuppr === '7'), '(e) focus sur la ligne suivante');
    check(await p.evaluate(() => document.getElementById('ntf-statut').textContent) === 'Notification supprimée.', '(e) annonce');
    await p.click('.ntf-suppr[data-ntf-suppr="7"]');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 6);
    check(!(await filtres(p)).some((x) => x.startsWith('Messages')), '(e) catégorie vidée : son filtre disparaît');

    // Relecture partie avant la suppression : la ligne ne revient pas.
    await retarder(p);
    await p.evaluate(() => { window.__retard = 400; document.dispatchEvent(new CustomEvent('hg-notifs')); });
    await sleep(50);   // la relecture a lu, sa réponse n'est pas encore arrivée
    await p.evaluate(() => { window.__retard = 0; });
    await p.click('.ntf-suppr[data-ntf-suppr="9"]');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 5);
    await sleep(700);
    check(await rangees(p) === 5 && await p.locator('.ntf-suppr[data-ntf-suppr="9"]').count() === 0, '(e) relecture partie avant la suppression : la ligne ne revient pas');
    check((await filtres(p))[0] === 'Toutes 5', '(e) relecture partie avant la suppression : comptes justes');
    await p.evaluate(() => { window.__NTF.lignes.push({ id: 9, cat: 'souhaits', titre: 'Une carte de ta liste est proposée', texte: null, lien: null, created_at: new Date().toISOString(), lu: false }); document.dispatchEvent(new CustomEvent('hg-notifs')); });
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 6);

    // Dernière ligne d'un filtre : retour à « Toutes ».
    await p.click('.ntf-filtre:has-text("Sorties")');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 1);
    await p.click('.ntf-suppr');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 5);
    check(await p.getAttribute('.ntf-filtre:has-text("Toutes")', 'aria-pressed') === 'true', '(e) filtre vidé : retour à « Toutes »');

    // Échec d'une suppression : la ligne reste.
    await p.evaluate(() => { window.__NTF.panne = 'hg_notif_supprimer'; });
    await p.click('.ntf-suppr >> nth=0');
    await sleep(250);
    check(await rangees(p) === 5 && await p.isEnabled('.ntf-suppr >> nth=0'), '(e) suppression refusée : la ligne reste');
    await p.evaluate(() => { window.__NTF.panne = null; });

    // Suppression des lues : confirmation.
    await p.click('#ntf-suppr-lues');
    await p.waitForSelector('dialog.hg-dialog');
    check(/Supprimer les notifications lues \?/.test(await textes(p, 'dialog.hg-dialog')) && /Les 4 notifications déjà lues disparaissent de l’historique\. Les non lues restent\./.test(await textes(p, 'dialog.hg-dialog')), '(e) texte de confirmation, nombre réel');
    await p.click('dialog.hg-dialog button:has-text("Annuler")');
    await sleep(150);
    check((await appels(p, 'hg_notifs_supprimer_lues')).length === 0 && await rangees(p) === 5, '(e) annuler : rien de supprimé');
    await p.click('#ntf-suppr-lues');
    await p.click('dialog.hg-dialog button:has-text("Supprimer")');
    await p.waitForFunction(() => document.querySelectorAll('.ntf-rangee').length === 1);
    check(await p.locator('.ntf-rangee .is-new').count() === 1, '(e) seule la non lue reste');
    check(await p.isHidden('#ntf-suppr-lues'), '(e) plus de bouton sans ligne lue');

    // Dernière ligne supprimée : état vide.
    await p.click('.ntf-suppr');
    await p.waitForSelector('.ntf .empty');
    check(/Aucune notification pour l’instant\. Les offres, messages et rappels arriveront ici\./.test(await textes(p, '.ntf .empty')), '(e) dernière ligne : état vide');
    check(await p.isHidden('#ntf-outils') && await p.isVisible('.ntf-pied'), '(e) vide : pas d’outils, pied gardé');
    check(await p.evaluate(() => document.activeElement.id === 'ntf-titre'), '(e) focus sur le titre');
    check(p.errs.length === 0, '(e) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));
    await p.ctx.close();

    /* ---------- (f) états ---------- */
    p = await ouvrir(browser, { scenario: { notifs: [] } });
    check(await p.locator('.ntf .empty').count() === 1 && await p.isHidden('#ntf-outils'), '(f) aucune notification : état vide');
    await p.ctx.close();

    p = await openPage(browser, { page: 'notifications', scenario: { notifs: LIGNES, notifsPanne: 'hg_notifs_page' } });
    await p.waitForSelector('.ntf-alerte', { timeout: 8000 });
    check(/Impossible de charger tes notifications\./.test(await textes(p, '.ntf-alerte')) && await p.getAttribute('.ntf-alerte', 'role') === 'alert', '(f) erreur : message');
    check(JSON.stringify(await filtres(p)) === '["Toutes"]' && await p.isHidden('#ntf-lire'), '(f) erreur : filtre « Toutes » seul, sans nombre');
    await p.evaluate(() => { window.__NTF.panne = null; window.__NTF.attente = 300; });
    await p.click('#ntf-reessayer');
    await p.waitForSelector('.ntf-sk');
    check(await p.locator('#ntf-corps [aria-busy="true"]').count() === 1, '(f) Réessayer : état de chargement');
    await p.waitForSelector('.ntf-rangee');
    check(await rangees(p) === 8, '(f) Réessayer : la liste arrive');
    await p.ctx.close();

    p = await openPage(browser, { page: 'notifications', scenario: { guest: true } });
    await p.waitForURL(/compte\.html/, { timeout: 6000 }).catch(() => {});
    check(new URL(p.url()).pathname === '/pages/compte/compte.html', '(f) visiteur : renvoyé vers la connexion');
    check((await appels(p, 'hg_notifs_page')).length === 0, '(f) visiteur : aucune lecture');
    await p.ctx.close();

    /* ---------- (g) téléphone ---------- */
    p = await ouvrir(browser, { width: 390, height: 844, touch: true, mobile: true });
    const m = await p.evaluate(() => {
      const f = document.getElementById('ntf-filtres'), b = [...document.querySelectorAll('.ntf-filtre')];
      const tailles = [...document.querySelectorAll('.ntf-suppr, .ntf-filtre, #ntf-lire, #ntf-suppr-lues')].map((e) => e.getBoundingClientRect());
      return { page: document.documentElement.scrollWidth <= innerWidth, defile: f.scrollWidth > f.clientWidth, ligne: new Set(b.map((x) => x.getBoundingClientRect().top)).size === 1,
        hauteur: Math.min(...tailles.map((r) => r.height)), champ: parseFloat(getComputedStyle(document.getElementById('ntf-q')).fontSize),
        petit: Math.min(...[...document.querySelectorAll('.ntf .notif-cat, .ntf .notif-quand, .ntf-jour')].map((e) => parseFloat(getComputedStyle(e).fontSize))) };
    });
    check(m.page, '(g) pas de défilement horizontal de la page');
    check(m.defile && m.ligne, '(g) filtres sur une ligne qui défile');
    check(m.hauteur >= 44, `(g) cibles de 44 px (${m.hauteur})`);
    check(m.champ >= 16, `(g) champ de 16 px (${m.champ})`);
    check(m.petit >= 12, `(g) textes de 12 px (${m.petit})`);
    await p.ctx.close();
  } finally {
    await browser.close();
  }
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
