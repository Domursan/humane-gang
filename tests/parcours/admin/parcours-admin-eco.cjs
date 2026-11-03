// Parcours : alertes économie (idée A7, migration 093) dans « À faire » de La Fabrique de cartes, et éditeur de boosters.
// (a) admin : bloc « Santé de l'économie » (4 indicateurs, feux), alerte rouge expliquée (« Diamant rapporte 112 % »)
//     avec le lien vers le réglage, tuile et ligne « À traiter » ; « Ignorer cette semaine » (hg_eco_alerts_ignore).
// (b) Économie › Recyclage et fabrication : groupe « Alertes économie » (seuils) ; page de La Fabrique ≤ 2 000 px.
// (c) Éditeur de boosters : rendement recalculé en direct ; avertissement avant d'enregistrer un type déséquilibré ;
//     cartes Identité comptées à 0 (non recyclables).
// (d) Staff sans « cartes » : ni bloc ni appel à hg_eco_health. (e) 375 px sans défilement horizontal.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/admin/parcours-admin-eco.cjs
const { check, finish, openPage, hscroll, adminSection, log, sleep, chromium } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;

(async () => {
  const browser = await chromium.launch();
  try {
    /* ---------- (a) À faire de La Fabrique : alertes, lien, suspension ---------- */
    let p = await openPage(browser, { page: 'admin' });
    await p.evaluate(() => { location.hash = '#fabrique'; });
    await p.waitForSelector('.lieu-todo-item', { timeout: 6000 }).catch(() => {});
    const todo = await p.textContent('[data-lieu-todo]');
    check(/Le booster Diamant rapporte 112 % de son prix au recyclage/.test(todo) && /672/.test(todo), '(a) « À faire » : alerte rouge expliquée (« Diamant rapporte 112 % »)');
    check(await p.getAttribute('.lieu-todo a[href="#fabrique/boosters"]', 'href') === '#fabrique/boosters', '(a) « À faire » : lien vers le réglage des boosters');
    check((await p.textContent('[data-lieu-badge="fabrique"]')).trim() === '1', '(a) pastille de La Fabrique : 1 à traiter');
    check((await p.textContent('.lieu-tile[data-sub="economie"] .nav-count')).trim() === '1', '(a) tuile Paillettes et dons : compteur 1');
    check((await p.textContent('.lieu-total')).includes('à traiter'), '(a) bandeau du lieu : total « à traiter »');
    const tab = await p.$$eval('.lieu-tile', (as) => as.length);
    check(tab === 19, `(a) page de La Fabrique : 19 tuiles (${tab})`);
    await p.click('.lieu-todo [data-lieu-act="0.1"]');
    await sleep(900);
    check((await log(p)).some((l) => l[0] === 'eco_ignore' && l[1] === 7), '(a) « Ignorer cette semaine » : hg_eco_alerts_ignore(7)');
    await p.evaluate(() => { location.hash = '#plateau'; });
    await sleep(200);
    await p.evaluate(() => { location.hash = '#fabrique'; });
    await p.waitForSelector('[data-lieu-todo] .lieu-todo-empty', { timeout: 6000 }).catch(() => {});
    check((await p.textContent('[data-lieu-todo]')).includes('Rien à faire ici'), '(a) alertes suspendues : plus dans « À faire »');
    const h = await p.evaluate(() => document.getElementById('app').scrollHeight);
    check(h <= 2000, `(b) page du lieu ≤ 2 000 px (${h})`);
    check(p.errs.length === 0, '(a) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));

    /* ---------- (b) seuils ---------- */
    await adminSection(p, 'fabrique/recyclage');
    await sleep(500);
    const legends = await p.$$eval('#acd-econ-form fieldset:not([hidden]) legend', (l) => l.map((x) => x.textContent.trim()));
    check(legends.includes('Alertes économie') && await p.isVisible('#acd-e-alertes_booster_pct'), `(b) seuils dans Recyclage et fabrication (${legends.join(', ')})`);
    check(await p.inputValue('#acd-e-alertes_booster_pct') === '100', '(b) seuil par défaut 100 %');
    await p.ctx.close();

    /* ---------- (c) éditeur de boosters ---------- */
    p = await openPage(browser, { page: 'admin' });
    await adminSection(p, 'fabrique/boosters');
    await sleep(800);
    const ok = await p.evaluate(async () => {
      const m = await import('/assets/espaces/admin/cartes/boosters.js');
      const rec = { commune: 5, peu_commune: 10, rare: 25, epique: 60, legendaire: 150, mythique: 400, identite: 1000, shiny_multiplier: 3 };
      const v1 = m.recycleValue(m.effectiveRates({ identite: 100 }), 5, 0, rec);
      const v2 = m.recycleValue(m.effectiveRates({ commune: 60, peu_commune: 25, rare: 10, epique: 4, legendaire: 0.88, mythique: 0.1, identite: 0.02 }), 5, 3, rec);
      return { v1, v2: Math.round(v2 * 100) / 100 };
    });
    check(ok.v1 === 0, `(c) cartes Identité comptées à 0 au recyclage (${ok.v1})`);
    check(ok.v2 === 64.24, `(c) même valeur que hg_booster_ev en base (64,24 : ${ok.v2})`);
    const edit = p.locator('[data-bt="edit"]').first();
    if (await edit.count()) {
      await edit.click();
      await p.waitForSelector('#abt-live', { timeout: 5000 });
      await p.fill('#abt-price', '10');
      
      await sleep(300);
      check(await p.isVisible('.abt-bad'), '(c) rendement recalculé en direct : « Machine à Paillettes »');
      await p.click('[data-drawer-submit]');
      await p.waitForSelector('dialog.hg-dialog[open]', { timeout: 4000 }).catch(() => {});
      check(/Booster déséquilibré/.test(await p.textContent('dialog.hg-dialog').catch(() => '')), '(c) avertissement avant d’enregistrer');
      await p.click('dialog.hg-dialog button[value="cancel"]').catch(() => {});
      await sleep(300);
      check(!(await log(p)).some((l) => l[0] === 'rpc' && l[1] === 'hg_booster_type_save'), '(c) annuler : rien n’est enregistré');
    } else check(false, '(c) bouton « Modifier » d’un type introuvable');
    check(p.errs.length === 0, '(c) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));
    await p.ctx.close();

    /* ---------- (d) Staff sans « cartes » ---------- */
    p = await openPage(browser, { page: 'admin', scenario: { uid: U(2), staff: ['support'] } });
    await p.evaluate(() => { location.hash = '#fabrique'; });
    await sleep(400);
    check(!(await p.isVisible('[data-lieu-todo] .lieu-todo-item')) && !(await log(p)).some((l) => l[0] === 'rpc' && l[1] === 'hg_eco_health'), '(d) Staff « support » : ni alerte « À faire » ni appel');
    await p.ctx.close();

    /* ---------- (e) 375 px ---------- */
    p = await openPage(browser, { page: 'admin', width: 375, height: 812 });
    await p.evaluate(() => { location.hash = '#fabrique'; });
    await p.waitForSelector('.lieu-todo-item', { timeout: 6000 }).catch(() => {});
    check(await hscroll(p) <= 0, '(e) 375 px : pas de défilement horizontal');
    await p.ctx.close();
  } catch (e) {
    check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]);
  } finally {
    await browser.close();
  }
  finish();
})();
