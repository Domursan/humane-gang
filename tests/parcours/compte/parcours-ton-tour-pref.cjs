// Parcours : ligne « Jeux · c'est ton tour » de Mes notifications (idée 2 du lot 3, migration 200). Présente, activée par défaut sur les
// deux canaux, enregistrée par hg_set_notif_prefs, relue, grisée avec le bot pour Discord ; étiquette des notifications de cette catégorie.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/compte/parcours-ton-tour-pref.cjs
const { ROOT, check, finish, openPage, log, chromium } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'compte', width: 360, height: 800, scenario: { uid: U(2) } });
  await p.waitForSelector('#np-form', { timeout: 8000 }).catch(() => {});
  const ligne = p.locator('.np-row', { hasText: 'c’est ton tour' });
  check(await ligne.count() === 1, 'ligne présente');
  check(/Duels, Uno et plateaux : tu n’es pas sur le site et le jeu a dû jouer pour toi\. Une fois par partie, 5 par jour au plus\./.test(await ligne.textContent()), 'texte de la maquette');
  check(await p.isChecked('[data-key="tours.push"]') && await p.isChecked('[data-key="tours.discord"]'), 'activée par défaut sur les deux canaux');
  check(await p.getAttribute('[data-key="tours.push"]', 'aria-label') === 'C’est ton tour : sur ce téléphone', 'nom accessible, téléphone');
  check(await p.getAttribute('[data-key="tours.discord"]', 'aria-label') === 'C’est ton tour : sur Discord', 'nom accessible, Discord');
  check(/sauf « C’est ton tour »/.test(await p.textContent('.np-quiet')), 'heures calmes : l’exception est dite');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '360 px : pas de défilement horizontal');

  if (!(await p.isChecked('#np-bot'))) await p.check('#np-bot');
  await p.uncheck('#np-bot');
  check(await p.isDisabled('[data-key="tours.discord"]') && !(await p.isDisabled('[data-key="tours.push"]')), 'bot coupé : seul Discord est grisé');
  await p.check('#np-bot');

  await p.uncheck('[data-key="tours.discord"]');
  await p.click('#np-form button[type=submit]');
  await p.waitForTimeout(500);
  const call = (await log(p)).find((l) => l[0] === 'rpc' && l[1] === 'hg_set_notif_prefs');
  check(call?.[2]?.p_prefs?.['tours.discord'] === false && call?.[2]?.p_prefs?.['tours.push'] === true, 'préférence envoyée à hg_set_notif_prefs');
  check(/enregistrées/.test(await p.textContent('.np-status')), 'enregistrement confirmé');
  check(!p.errs.length, 'aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  const q = await openPage(browser, { page: 'compte', width: 1280, scenario: { uid: U(2), notifPrefs: { prefs: { 'tours.push': false } } } });
  await q.waitForSelector('#np-form', { timeout: 8000 }).catch(() => {});
  check(!(await q.isChecked('[data-key="tours.push"]')) && await q.isChecked('[data-key="tours.discord"]'), 'rechargement : préférence relue');
  const nom = await q.evaluate(async () => (await import('/assets/commun/core/presence.js')).catNom('tours'));
  check(nom === 'Jeux', 'étiquette de la notification : Jeux');
  check(!q.errs.length, 'rechargement : aucune erreur JS' + (q.errs.length ? ' (' + q.errs.join(' | ') + ')' : ''));
  await q.ctx.close();

  await browser.close();
  finish();
})();
