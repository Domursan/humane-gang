// Parcours : bloc « Mes notifications » de Mon compte (idée Q6, migration 095).
// Réglages par défaut (rien de coupé, souhaits et rappels repris du profil), enregistrement par hg_set_notif_prefs,
// relecture d'une ligne enregistrée, grand interrupteur « Le bot peut m'écrire » qui grise la colonne Discord, heures calmes, 360 px.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/compte/parcours-notifications.cjs
const { ROOT, check, finish, openPage, log, chromium } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'compte', width: 360, height: 800, scenario: { uid: U(2) } });
  await p.waitForSelector('#np-form', { timeout: 8000 }).catch(() => {});
  check(await p.isVisible('#np-form'), 'bloc « Mes notifications » affiché');
  check(await p.locator('#np-form [role=rowheader]').count() === 10, '8 catégories, « Carte de ma liste proposée » et « Annonces du Staff »');
  check(await p.isChecked('[data-key="messages.push"]') && await p.isChecked('[data-key="echanges.discord"]'), 'par défaut : messages et échanges actifs');
  check(!(await p.isChecked('[data-key="souhaits.discord"]')), 'souhaits sur Discord : repris du profil (coupé par défaut)');
  check(await p.locator('#profile-form #pf-bot, #profile-form #pf-notify-wish').count() === 0, 'anciennes cases retirées du Profil');
  check(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), '360 px : pas de défilement horizontal');

  // Grand interrupteur : le bot ne peut plus écrire → colonne Discord grisée
  const bot = await p.isChecked('#np-bot');
  if (!bot) await p.check('#np-bot');
  await p.uncheck('#np-bot');
  check(await p.isDisabled('[data-key="echanges.discord"]'), 'bot coupé : interrupteurs Discord désactivés');
  await p.check('#np-bot');
  check(!(await p.isDisabled('[data-key="echanges.discord"]')), 'bot rétabli : interrupteurs Discord actifs');

  // Yanninho coupe les offres d'échange sur Discord, active les souhaits et les heures calmes 23 h – 8 h
  await p.uncheck('[data-key="echanges.discord"]');
  await p.check('[data-key="souhaits.discord"]');
  await p.check('#np-quiet');
  check(await p.isVisible('#np-qs'), 'heures calmes : choix des heures affiché');
  await p.click('#np-form button[type=submit]');
  await p.waitForTimeout(500);
  const j = await log(p);
  const call = j.find((l) => l[0] === 'rpc' && l[1] === 'hg_set_notif_prefs');
  check(!!call && call[2].p_prefs['echanges.discord'] === false && call[2].p_prefs['souhaits.discord'] === true, 'hg_set_notif_prefs : catégories envoyées');
  check(!!call && call[2].p_quiet_start === 23 && call[2].p_quiet_end === 8, 'heures calmes 23 h – 8 h envoyées');
  check(!!call && Object.keys(call[2].p_prefs).every((k) => /^[a-z]+\.(push|discord)$/.test(k) || k === 'carte_proposee.site'), 'clés « catégorie.canal » seulement');
  check(/enregistrées/.test(await p.textContent('.np-status')), 'confirmation affichée');
  check(!p.errs.length, 'aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  // Relecture : une ligne enregistrée est réaffichée (scénario avec une ligne déjà en base)
  const q = await openPage(browser, { page: 'compte', width: 1280, scenario: { uid: U(2), notifPrefs: { prefs: { 'echanges.discord': false, 'messages.push': false }, quiet_start: 22, quiet_end: 7 } } });
  await q.waitForSelector('#np-form', { timeout: 8000 }).catch(() => {});
  check(!(await q.isChecked('[data-key="echanges.discord"]')) && !(await q.isChecked('[data-key="messages.push"]')), 'rechargement : catégories coupées relues');
  check(await q.isChecked('#np-quiet') && await q.inputValue('#np-qs') === '22' && await q.inputValue('#np-qe') === '7', 'rechargement : heures calmes relues');
  check(!q.errs.length, 'rechargement : aucune erreur JS' + (q.errs.length ? ' (' + q.errs.join(' | ') + ')' : ''));
  await q.ctx.close();

  await browser.close();
  finish();
})();
