// Parcours admin : réactions des messages dans la messagerie du panel (idée 66, migration 204).
// L'admin ne les voit qu'en ouvrant la conversation par l'accès journalisé : puces en lecture seule sous chaque bulle,
// même rendu que côté membre, vrai membre nommé (« (Santa) » pour le Santa), une lecture journalisée de plus par ouverture.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/admin/parcours-admin-messages-reactions.cjs
const { check, finish, openPage, adminSection, chromium, SHOTS } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const iso = (min) => new Date(Date.now() - min * 60000).toISOString();
const SCN = {
  convs: [
    { id: 'conv-direct', kind: 'direct', members: 'Alice, Bruno', messages: 2, last_message_at: iso(12) },
    { id: 'conv-santa', kind: 'santa', santa: 'Alice', target: 'Bruno', santa_id: U(2), target_id: U(3), edition_year: 2025, messages: 1, last_message_at: iso(60) },
  ],
  messages: [
    { id: 1, conversation_id: 'conv-direct', sender_id: U(2), body: 'Tu viens samedi au chalet ?', created_at: iso(14) },
    { id: 2, conversation_id: 'conv-direct', sender_id: U(3), body: 'Oui, je ramène les cartes.', created_at: iso(12) },
    { id: 3, conversation_id: 'conv-santa', sender_id: U(3), body: 'Merci pour l’indice !', created_at: iso(60) },
  ],
  messageReactions: [
    { message_id: 2, user_id: U(2), emoji: '❤️' }, { message_id: 2, user_id: U(2), emoji: '👍' }, { message_id: 2, user_id: U(3), emoji: '❤️' },
    { message_id: 3, user_id: U(2), emoji: '😂' },
  ],
};
const waitFor = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).catch(() => {});
const puces = (p, id) => p.$$eval(`.ui-msg[data-id="${id}"] .amsg-reacts .msg-react`, (l) => l.map((x) => `${x.childNodes[0].textContent}${x.querySelector('[aria-hidden]').textContent}`).join(' '));

(async () => {
  const browser = await chromium.launch();
  const p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: SCN });
  await adminSection(p, 'poste/messagerie');
  check(await p.evaluate(() => !window.__LOG.some((l) => l[1] === 'hg_admin_message_reactions')), 'liste seule : aucune réaction lue');
  await p.evaluate(() => { location.hash = '#poste/messagerie/conv-direct'; });
  await waitFor(p, () => !!document.querySelector('.ui-msg[data-id="2"] .amsg-reacts'));
  check(await puces(p, 2) === '❤️2 👍1', '(a) puces sous la bulle : émoji et nombre, ordre de la palette');
  check(!(await p.$('.ui-msg[data-id="1"] .amsg-reacts')), '(a) message sans réaction : rien');
  check((await p.getAttribute('.ui-msg[data-id="2"] .msg-react', 'title')) === 'Alice et Bruno', '(a) qui a réagi (bulle d’aide)');
  check((await p.textContent('.ui-msg[data-id="2"] .msg-react .visually-hidden')) === ' : Alice et Bruno', '(a) qui a réagi (lecteurs d’écran)');
  check(!(await p.$('.amsg-reacts button')), '(a) lecture seule : aucun bouton de réaction');
  check(await p.$eval('.amsg-reacts .msg-react', (x) => { const s = getComputedStyle(x); return s.borderRadius === '999px' && s.borderTopWidth === '2px'; }), '(a) même rendu que côté membre (puce arrondie, bord de 2 px)');
  check(await p.evaluate(() => window.__READS) === 2, `(a) lecture journalisée : messages et réactions (${await p.evaluate(() => window.__READS)})`);
  await p.screenshot({ path: `${SHOTS}/admin-messages-reactions-1280.png` });
  await p.evaluate(() => { location.hash = '#poste/messagerie/conv-santa'; });
  await waitFor(p, () => !!document.querySelector('.ui-msg[data-id="3"] .amsg-reacts'));
  check((await p.getAttribute('.ui-msg[data-id="3"] .msg-react', 'title')) === 'Alice (Santa)', '(b) Secret Santa : l’admin voit le vrai membre, marqué « (Santa) »');
  check(await p.evaluate(() => window.__READS) === 4, '(b) nouvelle ouverture : de nouveau journalisée');
  check(!(await p.evaluate(() => window.__LOG.some((l) => l[1] === 'hg_message_reactions_get'))), 'jamais la lecture des membres');
  check(!p.errs.length, 'aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
  await p.ctx.close();
  await browser.close();
  finish();
})();
