// Parcours : Assistance en fil (migration 032) — panel admin et « Mes demandes » côté membre.
// (a) admin 1440 px : non lu → lu à l'ouverture, prise en charge (séparateur, « En cours »), réponse publique,
//     note interne (teinte à part), résoudre / rouvrir, compteurs de la liste et de la navigation, temps réel.
//     La conversation privée arrive pendant la saisie : brouillon, Note interne et focus restent, même si un envoi échoue au même moment.
// (b) membre 390 px : « Mes demandes » affiche le statut et la réponse publique, jamais la note interne ; retour à la liste.
// (c) visiteur : pas de « Mes demandes », le formulaire reste en place.
// Faux Supabase (fixtures/fake-sb.mjs, scénario S.support / S.replies). Lancer : node tests/parcours/admin/parcours-admin-assist-fil.cjs
const fs = require('fs');
const path = require('path');
const { ROOT, check, finish, openPage, adminSection, hscroll, countOf, chromium } = require('../../lib/harness.cjs');

/* ---------- Aides de test ---------- */
const ME = '11111111-1111-4111-8111-111111111111';          // admin connecté (fixture)
/** Identifiant de test du membre n (même règle que le faux client : U(2) = Alice, U(3) = Bruno). */
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`; // Alice = U(2), Bruno = U(3)
const QA = process.env.HG_QA_DIR || '/tmp/claude-0/-home-claude/745c1954-a6f8-5445-b8b6-c526f6aef9c2/scratchpad/qa/assist-fil';
fs.mkdirSync(QA, { recursive: true });

/** Date ISO d'il y a min minutes. */
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

// sup-1 : Alice, non lue, ouverte, personne n'a pris la demande
// sup-2 : Bruno a pris la demande (en cours), une réponse publique de l'admin et une note de Bruno (interne)
// sup-3 : traitée et lue
// sup-4 : demande d'Alice déjà en cours par l'admin, avec une réponse publique (vue par le membre)
const SCN = {
  realtime: true,
  support: [
    { id: 'sup-1', user_id: U(2), pseudo: 'Alice', subject: 'Paillettes non créditées', message: 'Je suis venu à la sortie IRL de samedi, je n\'ai pas reçu mes Paillettes.',
      contact: 'alice#0001', status: 'ouverte', taken_by: null, taken_at: null, read_at: null, discord_sent: true, created_at: ago(30), updated_at: ago(5) },
    { id: 'sup-2', user_id: null, pseudo: 'Wae', subject: 'Accès à la page Secret Santa', message: 'Le lien m\'affiche une page vide depuis hier.',
      contact: 'wae', status: 'ouverte', taken_by: U(3), taken_at: ago(60), read_at: ago(50), discord_sent: false, created_at: ago(120), updated_at: ago(20) },
    { id: 'sup-3', user_id: U(3), pseudo: 'Bruno', subject: 'Question sur le tirage', message: 'Est-ce que le tirage est définitif ?',
      contact: null, status: 'traitee', taken_by: ME, taken_at: ago(1500), read_at: ago(1400), discord_sent: true, created_at: ago(1600), updated_at: ago(1400) },
    { id: 'sup-4', user_id: U(2), pseudo: 'Alice', subject: 'Badge « Bienvenue » manquant', message: 'Mon badge de bienvenue n\'apparaît pas.',
      contact: 'alice#0001', status: 'ouverte', taken_by: ME, taken_at: ago(200), read_at: ago(190), discord_sent: true, created_at: ago(240), updated_at: ago(180) },
  ],
  replies: [
    { id: 'rep-1', support_id: 'sup-2', author_id: U(3), body: 'Je regarde le lien.', internal: false, created_at: ago(60) },
    { id: 'rep-2', support_id: 'sup-2', author_id: U(3), body: 'Penser à vérifier la page Secret Santa côté Sheet.', internal: true, created_at: ago(40) },
    { id: 'rep-3', support_id: 'sup-4', author_id: ME, body: 'Merci Alice, je regarde le journal.', internal: false, created_at: ago(170) },
    { id: 'rep-4', support_id: 'sup-4', author_id: ME, body: 'Note : badge attribué à la main, à vérifier côté Discord.', internal: true, created_at: ago(175) },
  ],
};

/** Nombre de lignes de la colonne liste. */
const rows = (p) => p.locator('#shell-col-list .ui-row').count();
/** Lit une ligne de window.__DB par table et identifiant (ou null). */
const dbRow = (p, table, id) => p.evaluate(([t, i]) => { const r = window.__DB[t].find((x) => x.id === i); return r ? { ...r } : null; }, [table, id]);
/** Réponses d'une demande d'assistance, lues dans window.__DB.hg_support_replies. */
const dbReplies = (p, support) => p.evaluate((sid) => window.__DB.hg_support_replies.filter((r) => r.support_id === sid).map((r) => ({ ...r })), support);
/** Puce de filtre de la liste dont le texte contient label. */
const chip = (p, label) => p.locator('#shell-col-list .ui-chip', { hasText: label }).first().textContent();
/** Compteur affiché à côté de « Assistance » dans la navigation. */
const navCount = (p) => countOf(p, 'poste', 'assistance');
/** Attend que la fonction fn, évaluée dans la page avec arg, renvoie une valeur vraie (ms millisecondes au plus). */
const waitFor = (p, fn, arg, ms = 4000) => p.waitForFunction(fn, arg, { timeout: ms }).catch(() => {});
/** Texte du fil de discussion de la demande affichée. */
const thread = (p) => p.locator('#support-root .ui-thread-log').textContent();

/* ---------- Scénario ---------- */
(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  /* (a) Panel admin, 1440 px */
  {
    const p = await openPage(browser, { page: 'admin', width: 1440, height: 900, scenario: SCN });
    await adminSection(p, 'poste/assistance');
    await waitFor(p, () => document.querySelectorAll('#shell-col-list .ui-row').length === 4);

    check(await rows(p) === 4, '(a) liste : quatre demandes');
    check((await navCount(p)) === '3', '(a) navigation : trois demandes à traiter (ouvertes et en cours)');
    check(/Ouvertes\s*1/.test(await chip(p, 'Ouvertes')) && /En cours\s*2/.test(await chip(p, 'En cours')) && /Traitées\s*1/.test(await chip(p, 'Traitées')),
      '(a) compteurs : Ouvertes 1, En cours 2, Traitées 1');
    const order = await p.locator('#shell-col-list .ui-row').evaluateAll((els) => els.map((e) => e.dataset.id));
    check(order.join() === 'sup-1,sup-2,sup-4,sup-3', '(a) tri par activité : ' + order.join(', '));
    check(await p.locator('#shell-col-list .ui-row[data-id="sup-1"].is-unread').count() === 1, '(a) demande non lue : ligne en gras (is-unread)');
    check(await p.locator('#shell-col-list .ui-row[data-id="sup-3"].is-unread').count() === 0, '(a) demande lue : pas de marque de non-lu');

    // Ouverture : non lu → lu (écrit en base) ; le fil montre le message initial et la zone de réponse
    await p.click('#shell-col-list .ui-row[data-id="sup-1"]');
    await waitFor(p, () => location.hash === '#poste/assistance/sup-1');
    await waitFor(p, () => !!document.querySelector('#support-root .ui-composer'));
    await waitFor(p, () => window.__DB.hg_support.find((r) => r.id === 'sup-1')?.read_at != null);
    check((await dbRow(p, 'hg_support', 'sup-1'))?.read_at != null, '(a) ouverture : read_at posé en base');
    check(await p.locator('#shell-col-list .ui-row[data-id="sup-1"].is-unread').count() === 0, '(a) après ouverture : la ligne n\'est plus en gras');
    check(await p.isVisible('#support-root .ui-composer'), '(a) fil : zone de réponse visible');
    check((await thread(p)).includes('Demande ouverte par Alice') && (await thread(p)).includes('pas reçu mes Paillettes'), '(a) fil : message initial et événement d\'ouverture');
    check(await p.inputValue('#support-root .ui-dhead select') === 'ouverte', '(a) en-tête : statut « Ouverte »');
    check((await p.textContent('#support-root .ui-dhead-actions')).includes('Prendre en charge'), '(a) demande sans prise en charge : bouton « Prendre en charge »');
    check((await p.textContent('#support-root .ui-composer .ui-hint')).includes('Mes demandes') && (await p.textContent('#support-root .ui-composer .ui-hint')).includes('notes internes restent dans le panel'),
      '(a) mention sous la zone de réponse (membre et notes internes)');

    // Prendre en charge : taken_by/taken_at en base, séparateur « a pris en charge », statut « En cours »
    await p.click('#support-root .ui-dhead-actions .ui-btn:has-text("Prendre en charge")');
    await waitFor(p, () => window.__DB.hg_support.find((r) => r.id === 'sup-1')?.taken_by != null);
    const s1 = await dbRow(p, 'hg_support', 'sup-1');
    check(s1?.taken_by === ME && s1?.taken_at != null && s1?.status === 'ouverte', '(a) « Prendre en charge » : taken_by et taken_at écrits, statut toujours ouverte');
    check((await thread(p)).includes('Ethan a pris en charge'), '(a) fil : séparateur « Ethan a pris en charge »');
    check(/En cours\s*3/.test(await chip(p, 'En cours')), '(a) compteur « En cours » : 3 après la prise en charge');
    // Membre inscrit : la prise en charge ouvre une conversation privée (hg_support_take), bouton pour l'ouvrir
    const takes = await p.evaluate(() => window.__LOG.filter((l) => l[0] === 'rpc' && l[1] === 'hg_support_take').map((l) => l[2]));
    check(takes.length === 1 && takes[0]?.p_support === 'sup-1', '(a) prise en charge : hg_support_take appelée une fois pour la demande');
    check((await dbRow(p, 'hg_support', 'sup-1'))?.conversation_id === 'conv-sup-1', '(a) conversation privée reliée à la demande');
    check((await p.textContent('#support-root .ui-dhead-actions')).includes('Ouvrir la conversation'), '(a) bouton « Ouvrir la conversation » affiché');
    check((await p.textContent('#support-root .ui-composer .ui-hint')).includes('conversation privée'), '(a) mention : la discussion se fait dans la conversation privée');

    // Réponse publique : bulle admin, écrite en base (internal = false), membre la verra
    await p.fill('#support-root .ui-composer textarea', 'Merci Alice, je regarde le journal des sorties.');
    await p.click('#support-root .ui-composer .ui-send');
    await waitFor(p, () => window.__DB.hg_support_replies.some((r) => r.support_id === 'sup-1'));
    let reps = await dbReplies(p, 'sup-1');
    check(reps.length === 1 && reps[0].internal === false && reps[0].author_id === ME, '(a) réponse publique : écrite en base (internal = false, auteur admin)');
    check(await p.inputValue('#support-root .ui-composer textarea') === '', '(a) après envoi : zone de réponse vidée');
    check(await p.locator('#support-root .ui-msg.is-admin:not(.is-note)').count() === 1, '(a) réponse : bulle admin à droite (is-admin), pas une note');

    // Note interne : teinte à part (is-note), écrite avec internal = true
    await p.click('#support-root .ui-note-toggle');
    check((await p.getAttribute('#support-root .ui-note-toggle', 'aria-pressed')) === 'true', '(a) bascule « Note interne » activée');
    await p.fill('#support-root .ui-composer textarea', 'Vérifier le journal avant de répondre au membre.');
    await p.click('#support-root .ui-composer .ui-send');
    await waitFor(p, () => window.__DB.hg_support_replies.filter((r) => r.support_id === 'sup-1').length === 2);
    reps = await dbReplies(p, 'sup-1');
    check(reps.some((r) => r.internal === true && /vérifier le journal/i.test(r.body)), '(a) note interne : écrite en base (internal = true)');
    check(await p.locator('#support-root .ui-msg.is-note').count() === 1, '(a) note interne : affichée avec la teinte « note » dans le fil');
    await p.click('#support-root .ui-note-toggle');

    // Résoudre → traitée ; Rouvrir → ouverte (sans prise en charge)
    await p.click('#support-root .ui-dhead-actions [data-primary]');
    await waitFor(p, () => window.__DB.hg_support.find((r) => r.id === 'sup-1')?.status === 'traitee');
    check((await dbRow(p, 'hg_support', 'sup-1'))?.status === 'traitee', '(a) « Résoudre » : statut « traitee » en base');
    check((await p.textContent('#support-root .ui-dhead-actions [data-primary]')).includes('Rouvrir'), '(a) après résolution : bouton « Rouvrir »');
    check((await navCount(p)) === '2', '(a) navigation : deux demandes à traiter après résolution');
    await p.click('#support-root .ui-dhead-actions [data-primary]');
    await waitFor(p, () => window.__DB.hg_support.find((r) => r.id === 'sup-1')?.status === 'ouverte');
    check((await dbRow(p, 'hg_support', 'sup-1'))?.status === 'ouverte', '(a) « Rouvrir » : statut « ouverte » en base');

    // Sélecteur de statut : « En cours » prend la demande pour l'admin connecté
    await p.selectOption('#support-root .ui-dhead select', 'encours');
    await waitFor(p, () => window.__DB.hg_support.find((r) => r.id === 'sup-1')?.taken_by != null);
    check((await dbRow(p, 'hg_support', 'sup-1'))?.taken_by === ME, '(a) sélecteur « En cours » : prise en charge écrite en base');

    // Temps réel : une réponse arrivée ailleurs (autre session) apparaît dans le fil, sans rechargement
    check((await p.evaluate(() => window.__fakeRealtime.tables())).includes('hg_support_replies'), '(a) temps réel : la table hg_support_replies est écoutée');
    await p.evaluate(() => {
      window.__DB.hg_support_replies.push({ id: 'rep-live', support_id: 'sup-1', author_id: '00000003-0000-4000-8000-000000000003', body: 'Réponse arrivée en direct.', internal: false, created_at: new Date().toISOString() });
      window.__fakeRealtime.emit('hg_support_replies', { eventType: 'INSERT', new: { id: 'rep-live', support_id: 'sup-1' } });
    });
    await waitFor(p, () => document.querySelector('#support-root .ui-thread-log')?.textContent.includes('Réponse arrivée en direct'), null, 4000);
    check((await thread(p)).includes('Réponse arrivée en direct'), '(a) temps réel : réponse reçue affichée dans le fil');

    // Demande déjà en cours avec réponses : le fil montre la prise en charge, la réponse publique et la note interne
    await p.evaluate(() => { location.hash = '#poste/assistance/sup-4'; });
    await waitFor(p, () => document.querySelector('#support-root .ui-dhead-t')?.textContent.includes('Badge'));
    check((await p.locator('#support-root .ui-msg').count()) === 3, '(a) sup-4 : message, réponse et note (trois bulles)');
    check(await p.locator('#support-root .ui-msg.is-note').count() === 1, '(a) sup-4 : la note interne est marquée');
    check(!(await p.textContent('#support-root .ui-dhead-actions')).includes('Prendre en charge'), '(a) demande déjà prise en charge : pas de bouton « Prendre en charge »');

    // Filtres et recherche
    await p.click('#shell-col-list .ui-chip[data-filter="encours"]');
    check(await rows(p) === 3, '(a) filtre « En cours » : trois lignes (sup-1 pris par l\'admin, sup-2, sup-4)');
    await p.click('#shell-col-list .ui-chip[data-filter="all"]');

    const shot = path.join(QA, 'panel-desktop-1440.png');
    await p.screenshot({ path: shot });
    console.log('    capture : ' + shot);
    check(!p.errs.length, '(a) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.context().close();
  }

  /* (a bis) Conversation privée reliée pendant la saisie */
  {
    const p = await openPage(browser, { page: 'admin', width: 1440, height: 900, scenario: SCN });
    await adminSection(p, 'poste/assistance/sup-1');
    await p.waitForSelector('#support-root .ui-composer textarea');
    await waitFor(p, () => window.__fakeRealtime.tables().includes('hg_support'));
    const TA = '#support-root .ui-composer textarea';
    // Redessin de la demande avec sa conversation, comme après un envoi ou une action ; la mise à jour en direct passe par le bandeau pendant une saisie.
    const lier = (conv) => p.evaluate(async (c) => {
      const [{ S }, { renderSupport }] = await Promise.all([import('/assets/espaces/admin/state.js'), import('/assets/espaces/admin/support.js')]);
      window.__DB.hg_support.find((r) => r.id === 'sup-1').conversation_id = c;
      S.support.find((r) => r.id === 'sup-1').conversation_id = c;
      renderSupport();
    }, conv);
    const brancheEnvoi = () => p.evaluate(async () => {
      const { sb } = await import('/assets/commun/core.js');
      const from = sb.from.bind(sb);
      sb.from = (t) => (t !== 'hg_support_replies' || !window.__echec ? from(t) : { insert: () => ({ select: () => ({ single: () => new Promise((ok) => {
        window.__repondre = () => ok({ data: null, error: { message: 'Envoi refusé' } });
      }) }) }) });
    });

    await p.fill(TA, 'Brouillon à garder');
    await p.click('#support-root .ui-note-toggle');
    await p.focus(TA);
    await lier('conv-direct');
    check((await p.textContent('#support-root .ui-composer .ui-hint')).includes('conversation privée'), '(a bis) conversation reliée : la mention change');
    check(await p.inputValue(TA) === 'Brouillon à garder', '(a bis) conversation reliée : le brouillon reste');
    check((await p.getAttribute('#support-root .ui-note-toggle', 'aria-pressed')) === 'true', '(a bis) conversation reliée : la bascule Note interne reste');
    check(await p.evaluate(() => document.activeElement?.matches('#support-root .ui-composer textarea')), '(a bis) conversation reliée : le focus reste dans la zone de réponse');

    // Mise à jour en direct pendant la saisie : bandeau, puis « Actualiser »
    await lier(null);
    await p.evaluate(() => {
      window.__DB.hg_support.find((r) => r.id === 'sup-1').conversation_id = 'conv-direct';
      window.__fakeRealtime.emit('hg_support', { eventType: 'UPDATE', new: { id: 'sup-1' } });
    });
    await p.waitForSelector('.live-banner button', { timeout: 4000 });
    await p.click('.live-banner button');
    await waitFor(p, () => document.querySelector('#support-root .ui-composer .ui-hint')?.textContent.includes('conversation privée'));
    check((await p.textContent('#support-root .ui-composer .ui-hint')).includes('conversation privée'), '(a bis) « Actualiser » : la mention change');
    check(await p.inputValue(TA) === 'Brouillon à garder' && (await p.getAttribute('#support-root .ui-note-toggle', 'aria-pressed')) === 'true', '(a bis) « Actualiser » : brouillon et Note interne restent');

    // Retour sans conversation, puis « Prendre en charge » : le bouton vit dans l'en-tête, le brouillon reste
    await lier(null);
    await p.click('#support-root .ui-dhead-actions .ui-btn:has-text("Prendre en charge")');
    await waitFor(p, () => window.__DB.hg_support.find((r) => r.id === 'sup-1')?.conversation_id === 'conv-sup-1');
    await waitFor(p, () => document.querySelector('#support-root .ui-composer .ui-hint')?.textContent.includes('conversation privée'));
    check(await p.inputValue(TA) === 'Brouillon à garder' && (await p.getAttribute('#support-root .ui-note-toggle', 'aria-pressed')) === 'true', '(a bis) « Prendre en charge » : brouillon et Note interne restent');

    // Envoi en cours quand la conversation change, puis refusé : le texte reste, la zone redevient utilisable
    await lier(null);
    await brancheEnvoi();
    await p.evaluate(() => { window.__echec = true; });
    await p.click('#support-root .ui-composer .ui-send');
    await waitFor(p, () => typeof window.__repondre === 'function');
    await lier('conv-direct');
    await p.evaluate(() => window.__repondre());
    await waitFor(p, () => !document.querySelector('#support-root .ui-composer textarea')?.readOnly);
    check(await p.inputValue(TA) === 'Brouillon à garder', '(a bis) envoi refusé pendant la mise à jour : le texte reste');
    check(await p.evaluate(() => { const t = document.querySelector('#support-root .ui-composer textarea'); return !t.readOnly && document.activeElement === t; }), '(a bis) envoi refusé : la zone reste utilisable, avec le focus');
    check(await p.evaluate(() => document.body.innerText.includes('Envoi refusé')), '(a bis) envoi refusé : message d\'erreur');
    await p.evaluate(() => { window.__echec = false; });
    await p.click('#support-root .ui-composer .ui-send');
    await waitFor(p, () => window.__DB.hg_support_replies.some((r) => r.support_id === 'sup-1' && r.body === 'Brouillon à garder'));
    check((await dbReplies(p, 'sup-1')).some((r) => r.body === 'Brouillon à garder' && r.internal === true), '(a bis) nouvel essai : la note part');
    check(!p.errs.length, '(a bis) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.context().close();
  }

  /* (b) Membre (Alice) 390 px : « Mes demandes » */
  {
    const p = await openPage(browser, { page: 'assistance', width: 390, height: 844, scenario: { ...SCN, uid: U(2) } });
    await waitFor(p, () => !document.querySelector('#my-support')?.hidden && document.querySelectorAll('#my-support-list .my-support-row').length > 0);
    check(await p.isVisible('#my-support'), '(b) « Mes demandes » visible pour un membre connecté');
    const items = await p.locator('#my-support-list .my-support-row').count();
    check(items === 2, '(b) liste : les deux demandes d\'Alice (' + items + '), pas celles des autres membres');
    const labels = await p.locator('#my-support-list .sp-pill').allTextContents();
    check(labels.includes('Ouverte') && labels.includes('En cours'), '(b) statuts : Ouverte et En cours (' + labels.join(', ') + ')');

    await p.click('#my-support-list .my-support-row[data-id="sup-4"]');
    await waitFor(p, () => document.querySelectorAll('#my-support-thread .my-msg').length >= 2);
    check(await p.isVisible('#my-support-detail'), '(b) détail : la demande s\'ouvre');
    const threadText = await p.textContent('#my-support-thread');
    check(threadText.includes('Merci Alice, je regarde le journal.'), '(b) détail : la réponse publique est visible, signée par le répondant');
    check(threadText.includes('Ethan'), '(b) détail : le pseudo du répondant (Ethan) est affiché');
    check(!threadText.includes('badge attribué à la main'), '(b) détail : la note interne n\'apparaît jamais');
    check(await p.locator('#my-support-thread .my-msg.is-staff').count() === 1, '(b) détail : une seule réponse de l\'équipe');
    check(await p.evaluate(() => location.hash) === '#sup-4', '(b) adresse : la demande ouverte est dans l\'adresse');
    const hs = await hscroll(p);
    check(hs <= 0, `(b) mobile : pas de défilement horizontal (${hs})`);
    await p.screenshot({ path: path.join(QA, 'mes-demandes-mobile-390.png'), fullPage: false });

    await p.click('#my-support-back');
    check(await p.isVisible('#my-support-list-view') && await p.isHidden('#my-support-detail'), '(b) « ← Mes demandes » : retour à la liste');
    check(!p.errs.length, '(b) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.context().close();
  }

  /* (c) Visiteur : pas de « Mes demandes », formulaire inchangé */
  {
    const p = await openPage(browser, { page: 'assistance', width: 1280, height: 900, scenario: { guest: true, support: SCN.support, replies: SCN.replies } });
    check(await p.isHidden('#my-support'), '(c) visiteur : « Mes demandes » masqué');
    check(await p.isVisible('#support-form') && await p.isVisible('#sp-message'), '(c) visiteur : formulaire d\'assistance affiché');
    check(!p.errs.length, '(c) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.context().close();
  }

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exitCode = 1; });
