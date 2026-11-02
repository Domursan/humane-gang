// Parcours : une carte attrapée dans un drop d'une série fermée (ou pas encore ouverte) apparaît dans la collection.
// Avant : la collection ne montrait que les séries ouvertes, la carte restait invisible.
// Faux Supabase (fixtures/fake-sb-cartes.mjs, scénario closedDrop). Lancer : node tests/parcours/cartes/parcours-drops-collection.cjs
const { choisirFiltre, check, finish, openPage, chromium } = require('../../lib/harness.cjs');

(async () => {
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: 1280, height: 900, scenario: { closedDrop: true }, hash: '#collection' });
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  const opts = await p.$$eval('#cartes-set option', (o) => o.map((x) => x.textContent.trim()));
  check(opts.includes('La forêt enchantée (pas ouverte)'), `menu Série : la série fermée où j'ai une carte est proposée (${opts.join(' | ')})`);
  await choisirFiltre(p, '#cartes-set', '__all__');
  await p.waitForTimeout(300);
  const txt = await p.textContent('#cartes-p-collection');
  check(txt.includes('Libellule'), 'toutes les séries : la carte du drop apparaît');
  check(txt.includes('série pas ouverte'), 'toutes les séries : le groupe indique que la série n\'est pas ouverte');
  await choisirFiltre(p, '#cartes-set', 'SETX');
  await p.waitForTimeout(300);
  check((await p.textContent('#cartes-p-collection')).includes('Libellule'), 'série fermée choisie : la carte du drop apparaît');
  check(!p.errs.length, 'aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();
  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exitCode = 1; });
