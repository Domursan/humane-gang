// Parcours : recherche dans les messages (idée 67, migration 203).
// (a) 1280 px, champ en haut de la liste : moins de 3 lettres, résultats (mes conversations seulement, ni masqués ni système,
//     assistance incluse, Santa « Ton Santa »), mot surligné et texte échappé, ouverture du message à sa place, aucun résultat,
//     erreur, croix pour effacer.
// (b) loupe du fil : « 2 sur 2 », flèches, surlignage, « Aucun », Échap ferme et rend le focus.
// (c) 390 px : champ, résultat ouvert en plein écran, barre de la loupe sans défilement horizontal.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/compte/parcours-messages-recherche.cjs
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
    { id: K(4), kind: 'direct', created_at: ago(900), last_message_at: ago(5) },
  ],
  convMembers: [
    { conversation_id: K(1), user_id: ME }, { conversation_id: K(1), user_id: U(3) },
    { conversation_id: K(2), user_id: ME }, { conversation_id: K(2), user_id: U(4) },
    { conversation_id: K(3), user_id: ME }, { conversation_id: K(3), user_id: U(2) },
    { conversation_id: K(4), user_id: U(3) }, { conversation_id: K(4), user_id: U(5) },
  ],
  messages: [
    { id: 1, conversation_id: K(1), sender_id: U(3), body: 'On se voit Samedi ?', created_at: ago(300) },
    { id: 2, conversation_id: K(1), sender_id: ME, body: 'Oui, samedi <b>soir</b> chez moi', created_at: ago(200) },
    { id: 3, conversation_id: K(1), sender_id: U(3), body: 'samedi caché', created_at: ago(150), hidden_at: ago(100) },
    { id: 4, conversation_id: K(1), sender_id: U(3), body: 'Bruno parle de samedi', created_at: ago(140), system: true },
    { id: 5, conversation_id: K(1), sender_id: U(3), body: 'Parfait, à plus', created_at: ago(10) },
    { id: 6, conversation_id: K(2), sender_id: U(4), body: 'Tu préfères samedi ou dimanche pour le cadeau ?', created_at: ago(60) },
    { id: 7, conversation_id: K(3), sender_id: ME, body: 'Ma photo a disparu depuis samedi', created_at: ago(120) },
    { id: 8, conversation_id: K(4), sender_id: U(5), body: 'samedi entre nous deux', created_at: ago(5) },
  ],
};
const waitFor = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 }).catch(() => {});
const rpcs = (p, name) => p.evaluate((n) => window.__LOG.filter((l) => l[0] === 'rpc' && l[1] === n).map((l) => l[2]), name);
const taper = async (p, sel, txt) => { await p.fill(sel, ''); await p.type(sel, txt); };

(async () => {
  const browser = await chromium.launch();

  /* (a) Toutes mes conversations */
  {
    const p = await openPage(browser, { page: 'messages', width: 1280, height: 900, scenario: SCN });
    await waitFor(p, () => !!document.querySelector('#msg-q') && document.querySelectorAll('#msg-convs [data-conv]').length >= 3);
    check(!!(await p.$('.msg-side form[role="search"] #msg-q')), '(a) champ « Chercher dans mes messages » en haut de la liste');
    check((await p.getAttribute('#msg-q', 'placeholder')) === 'Chercher dans mes messages…', '(a) invite du champ');
    check(!(await p.isVisible('#msg-q-x')), '(a) champ vide : pas de croix');
    await taper(p, '#msg-q', 'sa');
    await waitFor(p, () => document.querySelector('#msg-convs')?.textContent.includes('Tape au moins 3 lettres'));
    check((await p.textContent('#msg-convs')).includes('Tape au moins 3 lettres.'), '(a) moins de 3 lettres : consigne');
    check((await rpcs(p, 'hg_search_messages')).length === 0, '(a) moins de 3 lettres : aucune recherche lancée');
    await taper(p, '#msg-q', 'samedi');
    await waitFor(p, () => document.querySelectorAll('#msg-convs [data-res-msg]').length > 0);
    const ids = await p.$$eval('#msg-convs [data-res-msg]', (b) => b.map((x) => Number(x.dataset.resMsg)));
    check(ids.join() === '6,7,2,1', `(a) résultats : mes conversations seulement, ni masqué ni système, du plus récent au plus ancien (${ids.join()})`);
    const args = await rpcs(p, 'hg_search_messages');
    check(args.length === 1 && args[0].p_q === 'samedi' && args[0].p_conv === null, '(a) une seule recherche, après la frappe (hg_search_messages)');
    check((await p.textContent('#msg-convs .msg-res-info')).trim() === '4 messages trouvés', '(a) « 4 messages trouvés »');
    check((await p.getAttribute('#msg-convs', 'aria-label')) === 'Résultats de la recherche', '(a) liste annoncée comme résultats');
    const santa = await p.textContent('[data-res-msg="6"]');
    check(santa.includes('Ton Santa :') && !santa.includes('Chloé'), '(a) Secret Santa : « Ton Santa », jamais son pseudo');
    check((await p.textContent('[data-res-msg="7"]')).includes('Assistance'), '(a) assistance incluse');
    check((await p.textContent('[data-res-msg="2"] .msg-res-txt')).startsWith('Toi :'), '(a) mon message : « Toi : »');
    check((await p.$$eval('[data-res-msg="1"] mark.msg-mark', (m) => m.map((x) => x.textContent))).join() === 'Samedi', '(a) mot surligné (majuscule gardée)');
    check((await p.$$('[data-res-msg="2"] .msg-res-txt b')).length === 1
      && (await p.textContent('[data-res-msg="2"] .msg-res-txt')).includes('<b>soir</b>'), '(a) texte du message échappé');
    check(!(await p.textContent('#msg-convs')).includes('entre nous deux'), '(a) conversation des autres jamais montrée');
    await p.screenshot({ path: `${SHOTS}/msg-recherche-1280.png` });
    // Ouvrir un résultat : la conversation s'ouvre, le message est encadré
    await p.click('[data-res-msg="1"]');
    await waitFor(p, () => !!document.querySelector('#msg-thread .msg-row.is-trouve'));
    check((await p.getAttribute('#msg-thread .msg-row.is-trouve', 'data-id')) === '1', '(a) résultat ouvert à sa place, encadré');
    check((await p.$$('#msg-convs [data-res-msg]')).length === 4, '(a) les résultats restent affichés');
    await p.screenshot({ path: `${SHOTS}/msg-recherche-ouvert-1280.png` });
    // Aucun résultat, puis erreur
    await taper(p, '#msg-q', 'parking');
    await waitFor(p, () => document.querySelector('#msg-convs')?.textContent.includes('Aucun message'));
    check((await p.textContent('#msg-convs')).includes('Aucun message ne contient « parking ».'), '(a) aucun résultat : message clair');
    await p.evaluate(() => { window.__SCN.searchError = 'Réseau indisponible'; });
    await taper(p, '#msg-q', 'dimanche');
    await waitFor(p, () => !!document.querySelector('#msg-convs [role="alert"]'));
    check((await p.textContent('#msg-convs [role="alert"]')).includes('La recherche n’a pas abouti : Réseau indisponible'), '(a) erreur affichée');
    // Croix : retour à la liste
    check(await p.isVisible('#msg-q-x'), '(a) croix visible quand le champ est rempli');
    await p.click('#msg-q-x');
    await waitFor(p, () => document.querySelectorAll('#msg-convs [data-conv]').length >= 3);
    check((await p.$$('#msg-convs [data-conv]')).length === 3 && (await p.inputValue('#msg-q')) === '', '(a) croix : champ vidé, conversations revenues');
    check(await p.evaluate(() => document.activeElement?.id) === 'msg-q', '(a) le focus reste dans le champ');
    check(!p.errs.length, '(a) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
    await p.ctx.close();
  }

  /* (b) Loupe du fil */
  {
    const p = await openPage(browser, { page: 'messages', width: 1280, height: 900, scenario: SCN });
    await waitFor(p, () => !!document.querySelector('#msg-convs [data-conv]'));
    await p.click(`[data-conv="${K(1)}"]`);
    await waitFor(p, () => document.querySelectorAll('#msg-thread .msg-row').length >= 3);
    check((await p.getAttribute('#msg-find', 'aria-label')) === 'Chercher dans cette conversation', '(b) loupe dans l’en-tête du fil');
    await p.click('#msg-find');
    check((await p.getAttribute('#msg-find', 'aria-expanded')) === 'true' && await p.evaluate(() => document.activeElement?.id) === 'msg-q-fil', '(b) barre ouverte, curseur dans le champ');
    await taper(p, '#msg-q-fil', 'SAMEDI');
    await waitFor(p, () => document.querySelector('#msg-cherche-nb')?.textContent === '2 sur 2');
    check((await p.textContent('#msg-cherche-nb')) === '2 sur 2', '(b) « 2 sur 2 » : le plus récent d’abord (masqué et système exclus)');
    check((await p.$$eval('#msg-thread mark.msg-mark', (m) => m.map((x) => x.textContent))).join() === 'Samedi,samedi', '(b) mot surligné dans le fil');
    check((await p.getAttribute('#msg-thread .msg-row.is-trouve', 'data-id')) === '2', '(b) résultat courant encadré');
    check(await p.isDisabled('#msg-find-next') && !(await p.isDisabled('#msg-find-prev')), '(b) flèches : « suivant » grisé au dernier');
    await p.click('#msg-find-prev');
    check((await p.textContent('#msg-cherche-nb')) === '1 sur 2' && (await p.getAttribute('#msg-thread .msg-row.is-trouve', 'data-id')) === '1', '(b) résultat précédent');
    await p.screenshot({ path: `${SHOTS}/msg-loupe-1280.png` });
    check((await rpcs(p, 'hg_search_messages')).length === 0, '(b) la loupe cherche dans les messages déjà chargés');
    await taper(p, '#msg-q-fil', 'xyzw');
    await waitFor(p, () => document.querySelector('#msg-cherche-nb')?.textContent === 'Aucun');
    check((await p.textContent('#msg-cherche-nb')) === 'Aucun' && !(await p.$('#msg-thread mark')), '(b) « Aucun », surlignage retiré');
    await p.press('#msg-q-fil', 'Escape');
    check(!(await p.$('#msg-cherche-fil')) && await p.evaluate(() => document.activeElement?.id) === 'msg-find', '(b) Échap ferme la barre et rend le focus à la loupe');
    check((await p.textContent('#msg-thread .msg-row[data-id="2"] .msg-text')) === 'Oui, samedi <b>soir</b> chez moi', '(b) texte du message intact après la recherche');
    check(!p.errs.length, '(b) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
    await p.ctx.close();
  }

  /* (c) Téléphone */
  {
    const p = await openPage(browser, { page: 'messages', width: 390, height: 844, scenario: SCN });
    await waitFor(p, () => !!document.querySelector('#msg-q') && !!document.querySelector('#msg-convs [data-conv]'));
    check(await p.isVisible('#msg-q'), '(c) 390 px : champ visible au-dessus de la liste');
    await taper(p, '#msg-q', 'samedi');
    await waitFor(p, () => document.querySelectorAll('#msg-convs [data-res-msg]').length === 4);
    check(await hscroll(p) === 0, '(c) résultats : pas de défilement horizontal');
    await p.screenshot({ path: `${SHOTS}/msg-recherche-390.png` });
    await p.click('[data-res-msg="2"]');
    await waitFor(p, () => !!document.querySelector('#msg-thread .msg-row.is-trouve'));
    check((await p.getAttribute('#msg-app', 'data-view')) === 'thread' && (await p.getAttribute('.msg-row.is-trouve', 'data-id')) === '2', '(c) le résultat ouvre le fil en plein écran');
    await p.click('#msg-find');
    await taper(p, '#msg-q-fil', 'samedi');
    await waitFor(p, () => document.querySelector('#msg-cherche-nb')?.textContent === '2 sur 2');
    const bar = await p.evaluate(() => { const f = document.querySelector('#msg-cherche-fil'); return { large: f.scrollWidth <= f.clientWidth, btn: [...f.querySelectorAll('button')].every((b) => b.offsetWidth >= 44 && b.offsetHeight >= 44) }; });
    check(bar.large && bar.btn && await hscroll(p) === 0, '(c) barre de la loupe tenue en 390 px, boutons de 44 px');
    await p.screenshot({ path: `${SHOTS}/msg-loupe-390.png` });
    await p.click('#msg-back');
    await waitFor(p, () => (document.querySelector('#msg-app')?.dataset.view === 'list'));
    check((await p.$$('#msg-convs [data-res-msg]')).length === 4, '(c) retour : les résultats sont toujours là');
    check(!p.errs.length, '(c) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
