// Parcours : fil d'activité de l'accueil avec pastilles et « Voir plus » (idée 74).
// (a) Pastilles Tout · Le gang · Cartes · Badges et secrets, « Tout » choisie ; 10 entrées puis « Voir plus » (+10, sans recharger,
//     lecture de la tranche suivante seulement). (b) « Le gang » : seulement les arrivées, mercis, sondages, anniversaires… ;
//     fin du fil « C’est tout pour « Le gang » ». (c) Pastille sans entrée : message. (d) Plafond de 100 entrées puis renvoi à la
//     page Historique. (e) Erreur sur la suite : message et « Réessayer ». (f) 390 px : pastilles à la ligne, pas de défilement.
// Faux Supabase : fixtures/fake-sb.mjs (scénario activity). Lancer : node tests/parcours/compte/parcours-fil-activite.cjs
const { check, finish, openPage, hscroll, chromium, SHOTS } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const GANG = ['join', 'merci', 'sondage_resultat', 'birthday'];
/** n entrées, de la plus récente à la plus ancienne (le faux client ne trie pas) : 1 sur 6 « du gang », 1 sur 6 badge, le reste cartes. */
const fil = (n, kind) => Array.from({ length: n }, (_, i) => {
  const k = kind || (i % 6 === 2 ? GANG[(i / 6 | 0) % GANG.length] : i % 6 === 4 ? 'badge' : 'cartes');
  return { id: n - i, user_id: k === 'join' ? null : U(2 + (i % 5)), kind: k, text: `${k === 'join' ? 'Noé a rejoint le gang' : `Alice entrée ${i + 1} (${k})`}`, ref: null,
    created_at: new Date(Date.now() - (i + 1) * 36e5).toISOString() };
});
const attendre = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);
const nb = (p) => p.$$eval('#feed .feed-item', (l) => l.length);
const kinds = (p) => p.$$eval('#feed .feed-item', (l) => l.map((x) => x.dataset.kind));

(async () => {
  const browser = await chromium.launch();
  try {
    {
      const p = await openPage(browser, { page: 'accueil', scenario: { activity: fil(42) } });
      await p.emulateMedia({ colorScheme: 'dark' });
      check(await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 10), '(a) 10 entrées au départ');
      const chips = await p.$$eval('.feed-filtres .he-chip', (l) => l.map((b) => [b.textContent.trim(), b.getAttribute('aria-pressed')]));
      check(JSON.stringify(chips.map((c) => c[0])) === JSON.stringify(['Tout', 'Le gang', 'Cartes', 'Badges et secrets']), '(a) quatre pastilles dans l’ordre');
      check(chips[0][1] === 'true' && chips.slice(1).every((c) => c[1] === 'false'), '(a) « Tout » choisie');
      check((await p.getAttribute('.feed-filtres', 'role')) === 'group', '(a) groupe de pastilles nommé');
      await p.locator('.home-feed').scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${SHOTS}/fil-tout-1280.png` });
      const avant = await p.evaluate(() => window.__LOG.length);
      await p.click('.feed-plus');
      check(await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 20), '(a) « Voir plus » : 20 entrées');
      check(await p.evaluate(() => document.activeElement?.closest('.feed-item') === document.querySelectorAll('#feed .feed-item')[10]), '(a) focus sur la première entrée ajoutée');
      check((await p.textContent('#feed .feed-item:nth-child(11)')).includes('entrée 11'), '(a) suite dans l’ordre');
      check(await p.evaluate((a) => window.__LOG.length - a, avant) <= 3, '(a) « Voir plus » : sans recharger la page');
      // (b) Le gang
      await p.click('[data-feed-filtre="gang"]');
      check(await attendre(p, () => document.querySelector('[data-feed-filtre="gang"]').getAttribute('aria-pressed') === 'true'
        && [...document.querySelectorAll('#feed .feed-item')].length > 0 && [...document.querySelectorAll('#feed .feed-item')].every((l) => l.dataset.kind !== 'cartes')), '(b) « Le gang » choisie');
      const g = await kinds(p);
      check(g.length === 7 && g.every((k) => GANG.includes(k)), `(b) seulement les entrées du gang (${g.length})`);
      check(!(await p.$('.feed-plus')) && !(await p.$('.feed-pied')), '(b) 7 entrées : ni « Voir plus » ni fin');
      await p.click('[data-feed-filtre="badges"]');
      check(await attendre(p, () => [...document.querySelectorAll('#feed .feed-item')].every((l) => l.dataset.kind === 'badge') && document.querySelectorAll('#feed .feed-item').length === 7), '(b) « Badges et secrets » : les badges');
      check(!p.errs.length, '(a, b) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
      await p.ctx.close();
    }
    {
      // Fin du fil après « Voir plus »
      const p = await openPage(browser, { page: 'accueil', scenario: { activity: fil(14, 'merci') } });
      await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 10);
      await p.click('[data-feed-filtre="gang"]');
      await attendre(p, () => document.querySelector('[data-feed-filtre="gang"]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.feed-plus'));
      await p.click('.feed-plus');
      check(await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 14), '(b) « Voir plus » : 14 entrées');
      check((await p.textContent('.feed-pied')).includes('C’est tout pour « Le gang »'), '(b) fin du fil');
      await p.ctx.close();
    }
    {
      // (c) pastille sans entrée, 390 px clair
      const p = await openPage(browser, { page: 'accueil', scenario: { activity: fil(20, 'cartes') }, width: 390, height: 844 });
      await p.emulateMedia({ colorScheme: 'light' });
      await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 10);
      await p.click('[data-feed-filtre="gang"]');
      check(await attendre(p, () => document.querySelector('#feed .empty')?.textContent.includes('Rien dans « Le gang » pour l’instant.')), '(c) pastille sans entrée : message');
      check(await hscroll(p) === 0, '(f) 390 px : pas de défilement horizontal');
      const ys = await p.$$eval('.feed-filtres .he-chip', (l) => l.map((b) => [Math.round(b.getBoundingClientRect().right), b.getBoundingClientRect().height]));
      check(ys.every(([r, h]) => r <= 390 && h >= 44), '(f) pastilles entières et de 44 px');
      await p.locator('.home-feed').scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${SHOTS}/fil-vide-390.png` });
      await p.click('[data-feed-filtre="tout"]');
      await attendre(p, () => !!document.querySelector('.feed-plus'));
      const w = await p.$eval('.feed-plus', (b) => [b.getBoundingClientRect().width, b.getBoundingClientRect().height]);
      check(w[1] >= 44, `(f) « Voir plus » de 44 px (${w.join(' × ')})`);
      await p.locator('.home-feed').scrollIntoViewIfNeeded();
      await p.screenshot({ path: `${SHOTS}/fil-tout-390.png` });
      await p.ctx.close();
    }
    {
      // (d) plafond de 100 entrées
      const p = await openPage(browser, { page: 'accueil', scenario: { activity: fil(130) } });
      await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 10);
      for (let i = 0; i < 9; i++) {
        await p.click('.feed-plus');
        await attendre(p, (n) => document.querySelectorAll('#feed .feed-item').length === n, 20 + i * 10);
      }
      check(await nb(p) === 100, '(d) 100 entrées au plus');
      check(!(await p.$('.feed-plus')), '(d) plus de « Voir plus » à 100');
      check((await p.textContent('.feed-pied')).includes('Tout l’historique est sur la page Historique'), '(d) renvoi à la page Historique');
      // (e) erreur sur la suite
      await p.click('[data-feed-filtre="cartes"]');
      await attendre(p, () => document.querySelector('[data-feed-filtre="cartes"]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.feed-plus'));
      await p.evaluate(() => { const r = window.__DB.hg_activity; Object.defineProperty(window.__DB, 'hg_activity', { configurable: true, get() { throw new Error('Failed to fetch'); }, set() {} }); window.__remet = () => Object.defineProperty(window.__DB, 'hg_activity', { configurable: true, writable: true, value: r }); });
      await p.click('.feed-plus');
      check(await attendre(p, () => document.querySelector('.feed-pied [role=alert]')?.textContent.includes('La suite du fil n’a pas pu être chargée.')), '(e) erreur : message');
      check((await p.textContent('.feed-plus')).trim() === 'Réessayer' && await nb(p) === 10, '(e) « Réessayer », les entrées restent');
      await p.evaluate(() => window.__remet());
      await p.click('.feed-plus');
      check(await attendre(p, () => document.querySelectorAll('#feed .feed-item').length === 20), '(e) Réessayer : la suite arrive');
      await p.ctx.close();
    }
  } finally {
    await browser.close();
  }
  finish();
})();
