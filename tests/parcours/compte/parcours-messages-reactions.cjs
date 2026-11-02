// Parcours : réactions émoji sur les messages (idée 66, migration 204).
// (a) 1280 px : réaction déjà posée (puce, nombre, qui), bouton au survol, palette de six émojis (👍, pas 👏), poser, retirer,
//     réagir aussi à la puce d'un autre, Échap, aucune notification et la conversation ne remonte pas, refus du serveur.
// (b) Secret Santa : la réaction du Santa s'affiche « Ton Santa ». (c) Assistance et message masqué : pas de réactions.
// (d) 390 px : pas de bouton, appui long sur la bulle, puces de 44 px, pas de défilement horizontal.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/compte/parcours-messages-reactions.cjs
const { check, finish, openPage, hscroll, chromium, SHOTS } = require('../../lib/harness.cjs');

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const K = (n) => `c0000000-0000-4000-8000-00000000000${n}`;
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
const SCN = {
  conversations: [
    { id: K(1), kind: 'direct', created_at: ago(900), last_message_at: ago(10) },
    { id: K(2), kind: 'santa', santa_id: U(4), target_id: ME, created_at: ago(900), last_message_at: ago(60) },
    { id: K(3), kind: 'support', title: 'Ma photo ne s’affiche pas', created_at: ago(900), last_message_at: ago(120) },
  ],
  convMembers: [
    { conversation_id: K(1), user_id: ME }, { conversation_id: K(1), user_id: U(3) },
    { conversation_id: K(2), user_id: ME }, { conversation_id: K(2), user_id: U(4) },
    { conversation_id: K(3), user_id: ME }, { conversation_id: K(3), user_id: U(2) },
  ],
  messages: [
    { id: 1, conversation_id: K(1), sender_id: U(3), body: 'Rue de la Gare 12, deuxième étage', created_at: ago(50) },
    { id: 2, conversation_id: K(1), sender_id: ME, body: 'Parfait, merci !', created_at: ago(40) },
    { id: 3, conversation_id: K(1), sender_id: U(3), body: 'Message retiré', created_at: ago(30), hidden_at: ago(20) },
    { id: 4, conversation_id: K(1), sender_id: U(3), body: 'À samedi alors', created_at: ago(10) },
    { id: 5, conversation_id: K(2), sender_id: U(4), body: 'Tu préfères le thé ou le café ?', created_at: ago(70) },
    { id: 6, conversation_id: K(2), sender_id: ME, body: 'Plutôt thé, merci de demander !', created_at: ago(60) },
    { id: 7, conversation_id: K(3), sender_id: U(2), body: 'C’est réglé de mon côté', created_at: ago(120) },
  ],
  messageReactions: [{ message_id: 2, user_id: U(3), emoji: '❤️' }, { message_id: 6, user_id: U(4), emoji: '❤️' }],
};
const waitFor = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 }).catch(() => {});
const chips = (p, id) => p.$$eval(`#msg-thread .msg-row[data-id="${id}"] .msg-react`, (b) => b.map((x) => `${x.dataset.react}${x.querySelector('span').textContent}${x.getAttribute('aria-pressed') === 'true' ? '*' : ''}`).join(' '));
const ouvrir = async (p, conv) => { await waitFor(p, (c) => !!document.querySelector(`[data-conv="${c}"]`), conv); await p.click(`[data-conv="${conv}"]`); await waitFor(p, () => document.querySelectorAll('#msg-thread .msg-row').length >= 2); };

(async () => {
  const browser = await chromium.launch();

  /* (a) Bureau */
  {
    const p = await openPage(browser, { page: 'messages', width: 1280, height: 900, scenario: SCN });
    await ouvrir(p, K(1));
    await waitFor(p, () => !!document.querySelector('#msg-thread .msg-react'));
    check(await chips(p, 2) === '❤️1', '(a) réaction de Bruno déjà posée sous mon message');
    check((await p.getAttribute('.msg-row[data-id="2"] .msg-react', 'aria-label')) === '❤️ : Bruno. Réagir aussi', '(a) puce : qui a réagi, en toutes lettres');
    const add = '.msg-row[data-id="1"] .msg-react-add';
    check(await p.$eval(add, (b) => getComputedStyle(b).opacity) === '0', '(a) bouton « Réagir » discret hors survol');
    await p.hover('.msg-row[data-id="1"] .msg-bubble');
    check(await p.$eval(add, (b) => getComputedStyle(b).opacity) === '1', '(a) bouton « Réagir » au survol de la bulle');
    await p.click(add);
    const pal = await p.$$eval('.msg-react-pick button', (b) => b.map((x) => x.textContent));
    check(pal.join('') === '❤️😂👍😮🔥🎉', `(a) palette de six émojis, 👍 et pas 👏 (${pal.join('')})`);
    check((await p.getAttribute(add, 'aria-expanded')) === 'true' && await p.evaluate(() => document.activeElement?.dataset.pick === '❤️'), '(a) palette ouverte, focus sur le premier émoji');
    await p.screenshot({ path: `${SHOTS}/msg-reactions-palette-1280.png` });
    const fnAvant = await p.evaluate(() => window.__LOG.filter((l) => l[0] === 'fn').length);
    const ordreAvant = await p.$$eval('#msg-convs [data-conv]', (b) => b.map((x) => x.dataset.conv).join());
    await p.click('.msg-react-pick [data-pick="👍"]');
    await waitFor(p, () => window.__LOG.some((l) => l[1] === 'hg_message_react'));
    check(!(await p.$('.msg-react-pick')) && await chips(p, 1) === '👍1*', '(a) 👍 posé : palette fermée, puce « 1 » en surbrillance');
    const arg = await p.evaluate(() => window.__LOG.find((l) => l[1] === 'hg_message_react')[2]);
    check(arg.p_message === 1 && arg.p_emoji === '👍', '(a) hg_message_react(1, 👍)');
    check(await p.evaluate(() => window.__DB.hg_message_reactions.some((r) => r.message_id === 1 && r.emoji === '👍')), '(a) réaction enregistrée');
    check(await p.evaluate(() => document.activeElement?.dataset.react === '👍'), '(a) focus sur la nouvelle puce');
    // Puce d'un autre : réagir aussi
    await p.click('.msg-row[data-id="2"] .msg-react[data-react="❤️"]');
    await waitFor(p, () => document.querySelector('.msg-row[data-id="2"] .msg-react')?.getAttribute('aria-pressed') === 'true');
    check(await chips(p, 2) === '❤️2*', '(a) réagir aussi : ❤️ 2');
    check((await p.getAttribute('.msg-row[data-id="2"] .msg-react', 'aria-label')) === '❤️ : Bruno et toi. Retirer ta réaction', '(a) « Bruno et toi »');
    await p.hover('.msg-row[data-id="2"] .msg-react');
    await waitFor(p, () => !!document.querySelector('.msg-react-qui'));
    check((await p.textContent('.msg-react-qui')) === '❤️ Bruno et toi', '(a) survol de la puce : qui a réagi');
    await p.screenshot({ path: `${SHOTS}/msg-reactions-1280.png` });
    // Retirer
    await p.click('.msg-row[data-id="1"] .msg-react[data-react="👍"]');
    await waitFor(p, () => !document.querySelector('.msg-row[data-id="1"] .msg-react'));
    check(await chips(p, 1) === '' && await p.evaluate(() => !window.__DB.hg_message_reactions.some((r) => r.message_id === 1)), '(a) 👍 retiré : puce disparue');
    // Aucune notification, la conversation ne remonte pas
    check(await p.evaluate((n) => window.__LOG.filter((l) => l[0] === 'fn').length === n, fnAvant), '(a) aucune notification envoyée');
    check(await p.$$eval('#msg-convs [data-conv]', (b) => b.map((x) => x.dataset.conv).join()) === ordreAvant
      && await p.evaluate((k) => window.__DB.hg_conversations.find((c) => c.id === k).last_message_at, K(1)) === SCN.conversations[0].last_message_at, '(a) la conversation ne remonte pas');
    // Échap ferme la palette et rend le focus
    await p.hover('.msg-row[data-id="4"] .msg-bubble');
    await p.click('.msg-row[data-id="4"] .msg-react-add');
    await p.keyboard.press('Escape');
    check(!(await p.$('.msg-react-pick')) && await p.evaluate(() => document.activeElement?.closest('.msg-row')?.dataset.id === '4' && document.activeElement.classList.contains('msg-react-add')), '(a) Échap : palette fermée, focus rendu');
    // Refus du serveur : la réaction est retirée et un message s'affiche
    await p.evaluate(() => { window.__SCN.reactError = 'Réseau indisponible'; });
    await p.click('.msg-row[data-id="4"] .msg-react-add');
    await p.click('.msg-react-pick [data-pick="🔥"]');
    await waitFor(p, () => document.body.textContent.includes('Réaction impossible'));
    check(await chips(p, 4) === '' && (await p.textContent('body')).includes('Réaction impossible : Réseau indisponible'), '(a) refus : réaction annulée, message d’erreur');
    check(!p.errs.length, '(a) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
    await p.ctx.close();
  }

  /* (b) Secret Santa, (c) assistance et message masqué */
  {
    const p = await openPage(browser, { page: 'messages', width: 1280, height: 900, scenario: SCN });
    await ouvrir(p, K(1));
    check(!(await p.$('.msg-row[data-id="3"] .msg-react-add')) && !(await p.$('.msg-row[data-id="3"] .msg-reacts')), '(c) message masqué : pas de réactions');
    await ouvrir(p, K(2));
    await waitFor(p, () => !!document.querySelector('.msg-row[data-id="6"] .msg-react'));
    const lab = await p.getAttribute('.msg-row[data-id="6"] .msg-react', 'aria-label');
    check(lab === '❤️ : Ton Santa. Réagir aussi', `(b) Secret Santa : « Ton Santa » (${lab})`);
    await p.hover('.msg-row[data-id="6"] .msg-react');
    await waitFor(p, () => !!document.querySelector('.msg-react-qui'));
    check((await p.textContent('.msg-react-qui')) === '❤️ Ton Santa' && !(await p.textContent('#msg-thread')).includes('Chloé'), '(b) jamais le pseudo du Santa');
    await p.screenshot({ path: `${SHOTS}/msg-reactions-santa-1280.png` });
    await ouvrir(p, K(3));
    await waitFor(p, () => !!document.querySelector('#msg-support-sum'));
    check(!(await p.$('#msg-thread .msg-react-add')) && !(await p.$('#msg-thread .msg-reacts')), '(c) assistance : pas de réactions');
    check(!(await p.evaluate(() => window.__LOG.some((l) => l[1] === 'hg_message_reactions_get' && l[2].p_conv?.endsWith('3')))), '(c) assistance : réactions jamais lues');
    check(!p.errs.length, '(b/c) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
    await p.ctx.close();
  }

  /* (d) Téléphone : appui long */
  {
    const p = await openPage(browser, { page: 'messages', width: 390, height: 844, scenario: SCN, touch: true });
    await ouvrir(p, K(1));
    await waitFor(p, () => !!document.querySelector('#msg-thread .msg-react'));
    check(await p.$eval('.msg-row[data-id="1"] .msg-react-add', (b) => getComputedStyle(b).display) === 'none', '(d) 390 px : pas de bouton, l’appui long le remplace');
    check(await p.$eval('.msg-react', (b) => b.offsetHeight) >= 44, '(d) puces de 44 px de haut');
    const box = await (await p.$('.msg-row[data-id="4"] .msg-bubble')).boundingBox();
    const at = { clientX: box.x + 20, clientY: box.y + 10, pointerType: 'touch', isPrimary: true, bubbles: true };
    await p.dispatchEvent('.msg-row[data-id="4"] .msg-bubble', 'pointerdown', at);
    await p.waitForTimeout(650);
    await p.dispatchEvent('.msg-row[data-id="4"] .msg-bubble', 'pointerup', at);
    check((await p.$$('.msg-react-pick button')).length === 6, '(d) appui long sur la bulle : palette ouverte');
    check(await p.$eval('.msg-react-pick', (x) => { const r = x.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), '(d) palette entière à l’écran');
    await p.screenshot({ path: `${SHOTS}/msg-reactions-390.png` });
    await p.click('.msg-react-pick [data-pick="😂"]');
    await waitFor(p, () => !!document.querySelector('.msg-row[data-id="4"] .msg-react'));
    check(await chips(p, 4) === '😂1*', '(d) 😂 posé');
    // Appui bref sur la bulle : rien ne s'ouvre
    await p.dispatchEvent('.msg-row[data-id="1"] .msg-bubble', 'pointerdown', at);
    await p.dispatchEvent('.msg-row[data-id="1"] .msg-bubble', 'pointerup', at);
    await p.waitForTimeout(600);
    check(!(await p.$('.msg-react-pick')), '(d) appui bref : pas de palette');
    check(await hscroll(p) === 0, '(d) pas de défilement horizontal');
    check(!p.errs.length, '(d) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
