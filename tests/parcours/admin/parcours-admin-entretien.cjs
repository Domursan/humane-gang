// Parcours : page Entretien (La Mairie › Technique, migration 192).
// (a) admin : tuile, page, quotas, tâches, purge ; filtres ; aucune commande ni aucun message de tâche ; durée réglée reprise dans les textes.
// (b) alertes à 80 % : page et « À faire », plafond d'import calculé en octets, « Ignorer cette semaine », « Reprendre les alertes ».
// (c) Staff « reglages » : page en lecture seule, ni purge ni « Ignorer » ; Staff sans « reglages » : pas de page ; membre refusé.
// (d) purge avec aperçu : focus sur Annuler, Échap, plafond, rien à purger, aperçu impossible, purge réussie, purge refusée.
// (e) durée hors bornes refusée (client, puis serveur), retour à la valeur par défaut.
// (f) états chargement, vide, erreur avec Réessayer ; valeurs échappées ; clé déclarée, hors de la liste « Clés avancées ».
// (g) 390 px au doigt : pas de défilement horizontal, cibles de 44 px, textes de 12 px, champs de 16 px.
// (h) migration : aucune lecture de cron.job.command ni de return_message.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/admin/parcours-admin-entretien.cjs
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, adminSection, log, sleep, chromium, DEPOT } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const NBSP = '\u202f';
const appels = async (p, fn) => (await log(p)).filter((l) => l[0] === 'rpc' && l[1] === fn).length;
const textes = (p, sel) => p.$eval(sel, (e) => e.textContent.replace(/[ \t\r\n]+/g, ' ').trim()); // garde l'espace fine des milliers
const ouvrir = async (p, attendu = '[data-ent-carte="purge"] form') => { await adminSection(p, 'mairie/entretien'); await p.waitForSelector(attendu, { timeout: 6000 }); };
/** Appel direct d'une fonction de la base, comme le ferait un compte depuis la console. */
const rpc = (p, fn, args) => p.evaluate(async ([f, a]) => { const { sb } = await import('/assets/commun/core.js'); const r = await sb.rpc(f, a); return { data: r.data, msg: r.error?.message || '' }; }, [fn, args]);

const PLEIN = { base_octets: 412300000, buckets: [{ bucket_id: 'hg-nj', fichiers: 9, octets: 842000000 }] };
const taches = [
  { jobname: 'hg-cards-hourly', schedule: '23 * * * *', active: true, status: 'failed', start_time: new Date(Date.now() - 35 * 6e4).toISOString(), end_time: new Date(Date.now() - 35 * 6e4 + 40).toISOString(), executions: 72, erreurs: 3 },
  { jobname: 'hg-lg-tick', schedule: '* * * * *', active: false, status: 'succeeded', start_time: new Date(Date.now() - 2 * 864e5).toISOString(), end_time: new Date(Date.now() - 2 * 864e5 + 50).toISOString(), executions: 1440, erreurs: 0 },
  { jobname: 'hg-cron-5min', schedule: '*/5 * * * *', active: true, status: 'running', start_time: new Date().toISOString(), end_time: null, executions: 864, erreurs: 0 },
  { jobname: 'hg-birthdays-daily', schedule: '5 6,7 * * *', active: true, status: 'succeeded', start_time: new Date(Date.now() - 3 * 36e5).toISOString(), end_time: new Date(Date.now() - 3 * 36e5 + 30).toISOString(), executions: 6, erreurs: 0 },
  { jobname: 'hg-housekeeping', schedule: '37 3 * * *', active: true, status: null, start_time: null, end_time: null, executions: 0, erreurs: 0 },
  { jobname: 'hg-echanges-hourly', schedule: '13 * * * *', active: true, status: 'succeeded', start_time: new Date(Date.now() - 2 * 36e5).toISOString(), end_time: new Date(Date.now() - 2 * 36e5 + 30).toISOString(), executions: 24, erreurs: 0 },
  { jobname: 'hg-<img src=x onerror=window.__xss=1>', schedule: '<b>x</b>', active: true, status: 'succeeded', start_time: new Date().toISOString(), end_time: new Date().toISOString(), executions: 1, erreurs: 0 },
];

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- (a) admin ---------- */
    let p = await openPage(browser, { page: 'admin', scenario: { entretien: { taches, reglages: { journal_jours: 7, coups_jours: 60, bornes: { journal_jours: { defaut: 3, min: 1, max: 30 }, coups_jours: { defaut: 30, min: 14, max: 365 } }, dernier: null, derniere_nuit: null } } } });
    await p.evaluate(() => { location.hash = '#mairie'; });
    await p.waitForSelector('.lieu-tile[data-sub="entretien"]', { timeout: 6000 });
    check(/Quotas, tâches planifiées et purge/.test(await textes(p, '.lieu-tile[data-sub="entretien"]')), '(a) tuile Entretien dans La Mairie');
    check(await p.$eval('.lieu-tile[data-sub="entretien"]', (e) => e.nextElementSibling?.dataset.sub) === 'archives', '(a) tuile placée avant Archives');
    await ouvrir(p);
    await p.waitForSelector('.crn-tbl');
    const page = await textes(p, '#entretien-root');
    check(/99,1 Mo/.test(page) && /20 % de 500 Mo/.test(page) && /Normal/.test(page), '(a) base : valeur, pourcentage, état');
    check(/207,0 Mo|206,8 Mo/.test(page) && /de 1 Go/.test(page) && /Plafond d’import 700 Mo/.test(page), '(a) stockage : somme des buckets, plafond d’import');
    check(/Nouveaux jeux hg-nj/.test(page) && /Le reste 1 bucket moins de 1 Mo/.test(page), '(a) détail par bucket, petits buckets regroupés');
    check(/sur les 7 jours gardés au journal/.test(page) && /sur 7 jours/.test(page) && !/3 jours gardés/.test(page), '(a) la durée réglée remplace « 3 jours » dans les textes');
    check((await p.inputValue('#ent-journal')) === '7' && (await p.inputValue('#ent-coups')) === '60', '(a) durées lues en base');
    check(/Purge manuelle/.test(page) && /aucun pour l’instant, la première purge part cette nuit\./.test(page), '(a) purge : dernier passage');
    check(await p.locator('tr.is-ko').count() === 1 && /Échec/.test(await textes(p, 'tr.is-ko')) && /Le message d’erreur reste dans les journaux de Supabase/.test(page), '(a) tâche en échec signalée, sans message');
    const lignes = await p.$$eval('.crn-tbl tbody tr', (l) => l.map((r) => r.querySelector('code').textContent));
    check(lignes[0] === 'hg-cards-hourly' && lignes[1] === 'hg-lg-tick', '(a) tri : échec, tâche coupée, puis le reste');
    check(/Chaque jour, 8 h 05 en Suisse/.test(page) && /Chaque nuit, 3 h 37 UTC/.test(page) && /Toutes les 5 min/.test(page) && /Chaque heure, à hh:23/.test(page), '(a) planning en français');
    check(/Pour les deux tâches marquées « puis fonction edge »/.test(page), '(a) limite du tableau : nombre réel de tâches marquées');
    check(/Échanges : expirations et alertes/.test(page), '(a) tâche des échanges : libellé en clair');
    await p.click('[data-ent-filtre="surveiller"]');
    check(await p.locator('.crn-tbl tbody tr').count() === 3, '(a) filtre « À surveiller » : échec, coupée, jamais lancée');
    await p.click('[data-ent-filtre="ok"]');
    check(await p.locator('.crn-tbl tbody tr').count() === 3, '(a) filtre « Réussies »');
    await p.click('[data-ent-filtre="toutes"]');
    check(!(await p.evaluate(() => window.__xss)) && await p.locator('.crn-tbl img, .crn-tbl td b').count() === 0, '(f) nom et planning de tâche échappés');
    check(p.errs.length === 0, '(a) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));
    await p.ctx.close();

    /* ---------- (b) alertes ---------- */
    p = await openPage(browser, { page: 'admin', scenario: { entretien: { quotas: PLEIN } } });
    await p.evaluate(() => { location.hash = '#mairie'; });
    await p.waitForSelector('.lieu-todo-item', { timeout: 6000 });
    const todo = await textes(p, '[data-lieu-todo]');
    check(/La base de données est pleine à 82 %\./.test(todo) && /412,3 Mo sur 500 Mo, seuil 80 %/.test(todo), '(b) « À faire » : alerte base');
    check(/Le stockage est plein à 84 %\./.test(todo) && /plafond d’import interne de 700 Mo est dépassé/.test(todo), '(b) « À faire » : alerte stockage');
    check((await p.textContent('[data-lieu-badge="mairie"]')).trim() === '2', '(b) pastille de La Mairie : 2');
    check(await p.locator('.lieu-todo a[href="#mairie/entretien"]').count() === 2, '(b) lien vers Entretien');
    check(await p.locator('.lieu-todo button:has-text("Ignorer cette semaine")').count() === 1, '(b) « Ignorer » sur la première ligne seulement');
    await ouvrir(p);
    await p.waitForSelector('.eco-alert');
    check(await p.locator('.eco-alert').count() === 2 && await p.locator('.qt-ind[data-tone="bad"]').count() === 2, '(b) page : deux alertes, deux jauges rouges');
    check(await p.$eval('#ent-buckets', (d) => d.open), '(b) détail ouvert en alerte');
    await p.click('.eco-alert a:has-text("Ouvrir la purge")');
    check((await p.evaluate(() => location.hash)) === '#mairie/entretien', '(b) lien interne : l’adresse ne change pas');
    await p.click('.eco-alert button:has-text("Ignorer cette semaine")');
    await p.waitForSelector('.qt-susp', { timeout: 4000 });
    check(await appels(p, 'hg_entretien_ignorer') === 1 && await p.locator('.eco-alert[data-tone="off"]').count() === 2, '(b) ignorée : alertes éteintes, barres gardées');
    await p.evaluate(() => { location.hash = '#mairie'; });
    await p.waitForSelector('[data-lieu-todo] .lieu-todo-empty, [data-lieu-todo] .lieu-todo-item', { timeout: 6000 });
    check(!/pleine à/.test(await textes(p, '[data-lieu-todo]')), '(b) ignorée : plus dans « À faire »');
    await ouvrir(p, '.eco-alert');
    await p.click('button:has-text("Reprendre les alertes")');
    await p.waitForSelector('.eco-alert[data-tone="bad"]', { timeout: 4000 });
    check(true, '(b) « Reprendre les alertes »');
    await p.ctx.close();
    // Entre le plafond d'import et le seuil : pas d'alerte. 730 Mo reste sous 700 × 1024 × 1024 octets.
    p = await openPage(browser, { page: 'admin', scenario: { entretien: { quotas: { base_octets: 1e6, buckets: [{ bucket_id: 'hg-nj', octets: 790e6 }] } } } });
    await ouvrir(p); await p.waitForSelector('.qt-ind');
    check(await p.locator('.eco-alert').count() === 0, '(b) 79 % : pas d’alerte');
    const repere = await p.$eval('.qt-plafond', (e) => e.style.left);
    check(Math.abs(parseFloat(repere) - 73.4) < 0.01, `(b) repère du plafond d’import calculé en octets (${repere})`);
    await p.ctx.close();
    p = await openPage(browser, { page: 'admin', scenario: { entretien: { quotas: { base_octets: 1e6, buckets: [{ bucket_id: 'hg-nj', octets: 800e6 }] } } } });
    await ouvrir(p); await p.waitForSelector('.eco-alert');
    check(/plafond d’import interne/.test(await textes(p, '.eco-alert')), '(b) stockage à 80 % : plafond dépassé annoncé');
    await p.ctx.close();

    /* ---------- (c) rôles ---------- */
    p = await openPage(browser, { page: 'admin', scenario: { uid: U(2), staff: ['reglages'], entretien: { quotas: PLEIN } } });
    await p.evaluate(() => { location.hash = '#mairie'; });
    await p.waitForSelector('.lieu-todo-item', { timeout: 6000 });
    check(await p.locator('.lieu-todo button:has-text("Ignorer")').count() === 0, '(c) Staff : « À faire » sans « Ignorer »');
    await ouvrir(p);
    await p.waitForSelector('.eco-alert');
    check(await p.locator('[data-ent-ignorer]').count() === 0, '(c) Staff : pas de « Ignorer cette semaine »');
    check(await p.locator('[data-ent-purger]').count() === 0 && await p.locator('.ent-form [type="submit"]').count() === 0 && await p.locator('[data-ent-defaut]').count() === 0, '(c) Staff : ni purge, ni Enregistrer, ni Rétablir');
    check(await p.isDisabled('#ent-journal') && await p.isDisabled('#ent-coups'), '(c) Staff : durées en lecture seule');
    check(/Lecture seule : ton rôle ne permet pas de modifier ces réglages\./.test(await textes(p, '#entretien-root')) && await p.locator('.ent-dern').count() === 1, '(c) Staff : message et dernier passage');
    for (const [fn, a] of [['hg_entretien_purger'], ['hg_entretien_apercu'], ['hg_entretien_ignorer', { p_days: 7 }], ['hg_entretien_regler', { p_journal_jours: 3, p_coups_jours: 30 }]]) {
      check((await rpc(p, fn, a)).msg === 'droit insuffisant', `(c) Staff : ${fn} refusée par la base`);
    }
    await p.ctx.close();
    p = await openPage(browser, { page: 'admin', scenario: { uid: U(2), staff: ['support'] } });
    await p.evaluate(() => { location.hash = '#mairie/entretien'; });
    await sleep(900);
    check(await p.locator('#entretien-root .ent-page').count() === 0 && await p.locator('.lieu-tile[data-sub="entretien"]').count() === 0, '(c) Staff sans « reglages » : pas de page');
    check(await appels(p, 'hg_entretien_quotas') === 0, '(c) Staff sans « reglages » : aucun appel');
    await p.ctx.close();
    p = await openPage(browser, { page: 'admin', scenario: { uid: U(3) } });
    await sleep(800);
    check(/accueil\.html/.test(p.url()) && await p.locator('#entretien-root').count() === 0, '(c) membre : refusé');
    await p.ctx.close();

    /* ---------- (d) purge ---------- */
    p = await openPage(browser, { page: 'admin' });
    await ouvrir(p);
    await p.click('[data-ent-purger]');
    await p.waitForSelector('.pg-tbl');
    check(await p.evaluate(() => document.activeElement.value === 'cancel' && document.activeElement.closest('dialog.pg-dialog') !== null), '(d) focus sur Annuler');
    check(await p.$eval('dialog.pg-dialog', (d) => d.open && d.matches(':modal')), '(d) fenêtre modale');
    const fen = await textes(p, 'dialog.pg-dialog');
    check(fen.includes(`31${NBSP}363`) && /plus de 3 jours/.test(fen) && /plus de 30 jours/.test(fen) && /Jamais purgé : le Loup-Garou/.test(fen) && /Plafond : 50.000 lignes par table et par passage\./.test(fen), '(d) aperçu détaillé');
    check(/Notifications du site\s*plus de 90 jours/.test(fen), '(d) aperçu : ligne des notifications du site, 90 jours');
    check((await textes(p, 'dialog.pg-dialog button[value="ok"]')) === `Purger 31${NBSP}363 lignes`, '(d) bouton chiffré');
    await p.keyboard.press('Escape');
    await sleep(200);
    check(await p.locator('dialog.pg-dialog').count() === 0 && await appels(p, 'hg_entretien_purger') === 0, '(d) Échap : fermée, rien de purgé');
    check(await appels(p, 'hg_entretien_apercu') === 1, '(d) un seul aperçu');
    await p.click('[data-ent-purger]');
    await p.waitForSelector('.pg-tbl');
    await p.click('dialog.pg-dialog button[value="ok"]');
    await p.waitForSelector('.toast', { timeout: 4000 });
    check((await textes(p, '.toast')).includes(`31${NBSP}363 lignes purgées.`), '(d) purge : message');
    await p.waitForFunction(() => /à la main/.test(document.getElementById('entretien-root').textContent), null, { timeout: 4000 });
    check(new RegExp(`aujourd’hui à \\d\\d:\\d\\d, à la main, 31${NBSP}363 lignes\\.`).test(await textes(p, '#entretien-root')), '(d) dernier passage mis à jour');
    check(await appels(p, 'hg_entretien_purger') === 1 && await p.locator('dialog.pg-dialog').count() === 0, '(d) une purge, fenêtre fermée');
    check(await p.evaluate(() => document.activeElement?.hasAttribute('data-ent-purger')), '(d) focus rendu au bouton');
    await p.click('[data-ent-purger]');
    await p.waitForFunction(() => /Rien à purger/.test(document.querySelector('dialog.pg-dialog')?.textContent || ''), null, { timeout: 4000 });
    check(await p.isDisabled('dialog.pg-dialog button[value="ok"]') && (await textes(p, 'dialog.pg-dialog button[value="ok"]')) === 'Purger', '(d) rien à purger : bouton inactif');
    await p.click('dialog.pg-dialog button[value="cancel"]');
    check(p.errs.length === 0, '(d) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', scenario: { entretien: { apercu: { job_run_details: 182400, hg_plat_coups: 18240, hg_uno_coups: 1204, hg_duel_coups: 860, hg_ndc_coups: 2 } } } });
    await ouvrir(p);
    await p.click('[data-ent-purger]');
    await p.waitForSelector('.pg-cap');
    const cap = await textes(p, 'dialog.pg-dialog');
    check(cap.includes(`50${NBSP}000sur 182${NBSP}400`) && cap.includes(`Total de ce passage70${NBSP}306`), '(d) plafond : table plafonnée, total du passage');
    check(/Plafond atteint\. Ce passage retire 50.000 lignes de cette table\. Le reste part aux passages suivants\./.test(cap), '(d) plafond : message');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', scenario: { entretien: { erreurs: { hg_entretien_apercu: 'droit insuffisant' } } } });
    await ouvrir(p);
    await p.click('[data-ent-purger]');
    await p.waitForSelector('dialog.pg-dialog .form-error');
    check(/Aperçu impossible : droit insuffisant\. Rien n’a été supprimé\./.test(await textes(p, 'dialog.pg-dialog .form-error')) && await p.isDisabled('dialog.pg-dialog button[value="ok"]'), '(d) aperçu impossible : purge bloquée');
    await p.evaluate(() => { window.__SCN.entretien.erreurs = {}; });
    await p.click('[data-pg-retry]');
    await p.waitForSelector('.pg-tbl');
    check(!(await p.isDisabled('dialog.pg-dialog button[value="ok"]')), '(d) Réessayer relance l’aperçu');
    await p.evaluate(() => { window.__SCN.entretien.erreurs = { hg_entretien_purger: 'coupure' }; });
    await p.click('dialog.pg-dialog button[value="ok"]');
    await p.waitForSelector('dialog.pg-dialog .form-error');
    check(/Purge impossible : coupure/.test(await textes(p, 'dialog.pg-dialog .form-error')) && await p.locator('dialog.pg-dialog').count() === 1, '(d) purge refusée : fenêtre ouverte, message');
    await p.ctx.close();

    /* ---------- (e) durées ---------- */
    p = await openPage(browser, { page: 'admin' });
    await ouvrir(p);
    await p.fill('#ent-journal', '45');
    check(await p.getAttribute('#ent-journal', 'aria-invalid') === 'true' && (await textes(p, '.field:has(#ent-journal) .form-error')) === 'Entre 1 et 30 jours.', '(e) 45 : refusé à la saisie');
    await p.click('.ent-form [type="submit"]');
    await sleep(200);
    check(await appels(p, 'hg_entretien_regler') === 0 && await p.evaluate(() => document.activeElement.id === 'ent-journal'), '(e) 45 : rien envoyé, focus sur le champ');
    await p.fill('#ent-journal', '2.5');
    await p.click('.ent-form [type="submit"]');
    await sleep(200);
    check(await appels(p, 'hg_entretien_regler') === 0, '(e) 2,5 : refusé');
    await p.fill('#ent-coups', '13');
    check((await textes(p, '.field:has(#ent-coups) .form-error')) === 'Entre 14 et 365 jours.', '(e) coups : bornes propres');
    await p.click('[data-ent-defaut="journal_jours"]');
    await p.click('[data-ent-defaut="coups_jours"]');
    check((await p.inputValue('#ent-journal')) === '3' && (await p.inputValue('#ent-coups')) === '30' && await p.getAttribute('#ent-journal', 'aria-invalid') === null, '(e) « Rétablir la valeur par défaut »');
    check(await appels(p, 'hg_entretien_regler') === 0, '(e) rétablir n’enregistre pas');
    await p.fill('#ent-journal', '10');
    await p.fill('#ent-coups', '90');
    await p.click('.ent-form [type="submit"]');
    await p.waitForSelector('.toast', { timeout: 4000 });
    const reg = (await log(p)).find((l) => l[0] === 'rpc' && l[1] === 'hg_entretien_regler');
    check(reg?.[2]?.p_journal_jours === 10 && reg?.[2]?.p_coups_jours === 90, '(e) durées valides enregistrées');
    await p.waitForFunction(() => /les 10 jours gardés/.test(document.getElementById('entretien-root').textContent), null, { timeout: 4000 });
    check(true, '(e) le tableau suit la nouvelle durée');
    const hors = await rpc(p, 'hg_entretien_regler', { p_journal_jours: 45, p_coups_jours: 30 });
    check(/entre 1 et 30 jours/.test(hors.msg), '(e) serveur : hors bornes refusé');
    await p.ctx.close();

    /* ---------- (f) états ---------- */
    p = await openPage(browser, { page: 'admin', scenario: { entretien: { attente: { hg_entretien_taches: 1500, hg_entretien_reglages: 1500, hg_entretien_quotas: 1500 } } } });
    await adminSection(p, 'mairie/entretien');
    await p.waitForSelector('.ent-page');
    const charge = await textes(p, '#entretien-root');
    check(/Chargement des quotas…/.test(charge) && /Chargement des tâches…/.test(charge) && /Chargement des réglages…/.test(charge), '(f) trois chargements');
    await p.ctx.close();
    p = await openPage(browser, { page: 'admin', scenario: { entretien: { taches: [] } } });
    await ouvrir(p);
    await p.waitForFunction(() => /Aucune tâche planifiée trouvée/.test(document.getElementById('entretien-root').textContent), null, { timeout: 4000 });
    check(/vérifie que l’extension pg_cron est active/.test(await textes(p, '#entretien-root')), '(f) aucune tâche');
    await p.ctx.close();
    const M = 'droit insuffisant';
    p = await openPage(browser, { page: 'admin', scenario: { entretien: { erreurs: { hg_entretien_quotas: M, hg_entretien_taches: M, hg_entretien_reglages: M } } } });
    await adminSection(p, 'mairie/entretien');
    await p.waitForSelector('[data-ent-reessai="regl"]');
    const ko = await textes(p, '#entretien-root');
    check(/Impossible de lire les quotas : droit insuffisant\./.test(ko) && /Impossible de lire les tâches : droit insuffisant\./.test(ko) && /Impossible de charger les réglages : droit insuffisant\./.test(ko), '(f) trois erreurs');
    await p.evaluate(() => { window.__SCN.entretien.erreurs = {}; });
    for (const n of ['quotas', 'taches', 'regl']) await p.click(`[data-ent-reessai="${n}"]`);
    await p.waitForSelector('.crn-tbl'); await p.waitForSelector('.qt-ind'); await p.waitForSelector('.ent-form');
    check(true, '(f) Réessayer sur chaque carte');
    await p.ctx.close();
    p = await openPage(browser, { page: 'admin', scenario: { settings: [{ key: 'entretien', value: { journal_jours: 3 } }], entretien: { quotas: { base_octets: 1e6, buckets: [{ bucket_id: '<i>x</i>', octets: 5e6 }] } } } });
    await ouvrir(p);
    await p.waitForSelector('.qt-bars', { state: 'attached' });
    check(await p.locator('.qt-bars i').count() === 0, '(f) nom de bucket échappé');
    await adminSection(p, 'mairie/reglages');
    await p.waitForFunction(() => /se règle dans/.test(document.getElementById('reglages-root')?.textContent || ''), null, { timeout: 5000 });
    const cles = await textes(p, '#reglages-root');
    check(/Entretien du site \(entretien\) : se règle dans La Mairie › Entretien/.test(cles), '(f) clé déclarée, renvoyée vers sa page');
    await p.ctx.close();

    /* ---------- (g) 390 px au doigt ---------- */
    p = await openPage(browser, { page: 'admin', width: 390, height: 844, mobile: true, scenario: { entretien: { quotas: PLEIN, taches } } });
    await ouvrir(p);
    await p.waitForSelector('.crn-tbl');
    check(await hscroll(p) <= 0, '(g) 390 px : pas de défilement horizontal');
    const mesures = await p.evaluate(() => {
      const vis = (e) => e.getClientRects().length && !e.closest('.visually-hidden');
      const page = document.getElementById('entretien-root');
      return {
        petits: [...page.querySelectorAll('button, a.btn, summary, input')].filter(vis).filter((e) => e.getBoundingClientRect().height < 44).map((e) => (e.textContent || e.id).trim().slice(0, 24)),
        texte: [...page.querySelectorAll('*')].filter(vis).filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())).filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).map((e) => e.textContent.trim().slice(0, 20)),
        champs: [...page.querySelectorAll('input')].map((e) => parseFloat(getComputedStyle(e).fontSize)),
      };
    });
    check(!mesures.petits.length, `(g) cibles de 44 px (${mesures.petits.join(', ')})`);
    check(!mesures.texte.length, `(g) textes de 12 px au moins (${mesures.texte.join(', ')})`);
    check(mesures.champs.every((n) => n >= 16), `(g) champs de 16 px au moins (${mesures.champs.join(', ')})`);
    await p.click('[data-ent-purger]');
    await p.waitForSelector('.pg-tbl');
    const bt = await p.$$eval('dialog.pg-dialog button', (l) => l.map((b) => b.getBoundingClientRect().height));
    check(bt.every((h) => h >= 44) && await hscroll(p) <= 0, `(g) fenêtre : boutons de 44 px (${bt.join(', ')})`);
    await p.ctx.close();

    /* ---------- (h) migration ---------- */
    const sql = fs.readFileSync(path.join(DEPOT, 'supabase/migrations/192_entretien_admin.sql'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    check(!/\.command\b|\bcommand\b|return_message/.test(sql), '(h) migration : ni cron.job.command ni return_message');
    check(!/cron\.schedule|cron\.unschedule/.test(sql), '(h) migration : la tâche pg_cron ne change pas');
  } catch (e) {
    check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]);
  } finally {
    await browser.close();
  }
  finish();
})();
