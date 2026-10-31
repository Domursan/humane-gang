// Parcours : Questions du gang dans le panel admin (Jeu de cartes › Questions du gang), sur le faux Supabase.
// (a) création d'une question de chaque type (choix unique, choix multiple, vrai ou faux, réponse écrite, nombre),
//     contrôle de la base simulée (types, choix, clés) ;
// (b) modification (énoncé, clé gardée), désactivation (et filtre « Inactives »), suppression avec confirmation ;
// (c) récompense pré-remplie selon la difficulté (valeur lue dans hg_settings), récompenses par défaut enregistrées ;
// (d) erreur du serveur affichée dans le formulaire ; exemples prêts à l'emploi ; filtres par difficulté ;
// (e) onglet « Réponses et statistiques » ; Staff avec la permission « quiz » ; aucune erreur JS.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/admin/parcours-admin-quiz.cjs
const { ROOT, check, finish, openPage, adminSection, chromium } = require('../../lib/harness.cjs');

/** Identifiant de test du membre n (U(2) = Alice, comme dans le faux client). */
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
/** Lit la base simulée. */
const db = (p, fn, arg) => p.evaluate(fn, arg);
/** Clique sur le bouton « ok » de la boîte de confirmation modale. */
const confirmOk = async (p) => {
  await p.waitForSelector('dialog[open] button[value="ok"]', { timeout: 5000 });
  await p.click('dialog[open] button[value="ok"]');
  await p.waitForTimeout(300);
};
/** Attend la fermeture du tiroir (le formulaire est retiré du document). */
const drawerGone = (p) => p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
/** Ligne de la liste dont l'énoncé contient le texte donné. */
const rowWith = (p, text) => p.locator('#adq-list .adq-row', { hasText: text });
/** Choix N (a, b, c…) du formulaire ouvert. */
const choice = (id) => `dialog.ui-drawer[open] .adq-choice[data-id="${id}"]`;

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  /* (a) Création d'une question de chaque type */
  // Récompenses par défaut lues dans hg_settings (valeurs du scénario, différentes de celles de la migration)
  const scenario = { settings: [{ key: 'quiz', value: { recompenses: { facile: 60, moyen: 120, difficile: 260, expert: 800 } } }] };
  const p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario });
  await adminSection(p, 'fete/questions');
  await p.waitForSelector('#adq-list .empty', { timeout: 5000 });
  check((await p.textContent('#adq-list')).includes('Aucune question'), '(a) liste vide au départ');
  check((await p.inputValue('#adq-rw-expert')) === '800', '(c) récompense par défaut « expert » lue dans hg_settings (800)');
  check((await p.inputValue('#adq-rw-facile')) === '60', '(c) récompense par défaut « facile » lue dans hg_settings (60)');
  check(await p.isVisible('#adq-tab-q') && (await p.getAttribute('#adq-tab-q', 'aria-selected')) === 'true', '(a) onglet Questions ouvert par défaut');

  // 1. Choix unique : Suisse, Berne bonne réponse, difficulté facile
  await p.click('[data-adq="new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  check((await p.inputValue('#adq-qtype')) === 'choix_unique', '(a) type par défaut : choix unique');
  check(await p.locator('dialog.ui-drawer[open] .adq-choice').count() === 2, '(a) deux choix vides au départ');
  check(await p.getAttribute('dialog.ui-drawer[open] .adq-choice-correct', 'type') === 'radio', '(a) choix unique : cases radio');
  await p.fill('#adq-prompt', 'Quelle est la capitale de la Suisse ?');
  await p.fill(`${choice('a')} .adq-choice-text`, 'Zurich');
  await p.fill(`${choice('b')} .adq-choice-text`, 'Berne');
  await p.click(`${choice('b')} .adq-choice-correct`);
  await p.click('dialog.ui-drawer[open] [data-adq="add-choice"]');
  await p.fill(`${choice('c')} .adq-choice-text`, 'Genève');
  await p.selectOption('#adq-difficulty', 'facile');
  check((await p.inputValue('#adq-reward')) === '60', '(c) difficulté « facile » : récompense pré-remplie à 60');
  await p.fill('#adq-explanation', 'Berne est la capitale fédérale.');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  let rows = await db(p, () => window.__DB.hg_quiz_questions);
  let keys = await db(p, () => window.__DB.hg_quiz_keys);
  const q1 = rows.find((r) => r.prompt === 'Quelle est la capitale de la Suisse ?');
  check(!!q1 && q1.qtype === 'choix_unique' && q1.difficulty === 'facile' && q1.reward === 60 && q1.active === true, '(a) choix unique créé : type, difficulté, récompense, active');
  check(!!q1 && JSON.stringify(q1.options.map((o) => o.id)) === '["a","b","c"]', '(a) identifiants des choix générés : a, b, c');
  check(!!q1 && JSON.stringify(keys.find((k) => k.question_id === q1.id)?.answer) === '{"correct":["b"]}', '(a) clé : la bonne réponse est b');

  // 2. Choix multiple : fleuves, deux bonnes réponses, difficulté difficile
  await p.click('[data-adq="new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.fill('#adq-prompt', 'Lesquels de ces fleuves prennent leur source en Suisse ?');
  await p.selectOption('#adq-qtype', 'choix_multiple');
  check(await p.getAttribute('dialog.ui-drawer[open] .adq-choice-correct', 'type') === 'checkbox', '(a) choix multiple : cases à cocher');
  for (const [id, text] of [['a', 'Le Rhône'], ['b', 'Le Rhin']]) await p.fill(`${choice(id)} .adq-choice-text`, text);
  await p.click('dialog.ui-drawer[open] [data-adq="add-choice"]');
  await p.click('dialog.ui-drawer[open] [data-adq="add-choice"]');
  await p.fill(`${choice('c')} .adq-choice-text`, 'Le Danube');
  await p.fill(`${choice('d')} .adq-choice-text`, 'Le Tibre');
  await p.click(`${choice('a')} .adq-choice-correct`);
  await p.click(`${choice('b')} .adq-choice-correct`);
  await p.selectOption('#adq-difficulty', 'difficile');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  keys = await db(p, () => window.__DB.hg_quiz_keys);
  const q2 = rows.find((r) => r.qtype === 'choix_multiple');
  check(!!q2 && q2.difficulty === 'difficile' && q2.reward === 260 && q2.options.length === 4, '(a) choix multiple créé : 4 choix, difficile, récompense 260');
  check(!!q2 && JSON.stringify(keys.find((k) => k.question_id === q2.id)?.answer) === '{"correct":["a","b"]}', '(a) clé : les bonnes réponses sont a et b');

  // 3. Vrai ou faux : vrai, facile
  await p.click('[data-adq="new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.fill('#adq-prompt', 'Le mont Everest est le plus haut sommet de la Terre au-dessus de la mer.');
  await p.selectOption('#adq-qtype', 'vrai_faux');
  check(await p.locator('dialog.ui-drawer[open] input[name="adq-vf"]').count() === 2, '(a) vrai ou faux : deux réponses Vrai et Faux');
  await p.click('dialog.ui-drawer[open] input[name="adq-vf"][value="vrai"]');
  await p.selectOption('#adq-difficulty', 'facile');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  keys = await db(p, () => window.__DB.hg_quiz_keys);
  const q3 = rows.find((r) => r.qtype === 'vrai_faux');
  check(!!q3 && JSON.stringify(keys.find((k) => k.question_id === q3.id)?.answer) === '{"correct":["vrai"]}', '(a) vrai ou faux créé : clé « vrai »');

  // 4. Réponse écrite : Canberra, validation à la main désactivée, moyen
  await p.click('[data-adq="new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.fill('#adq-prompt', 'Quelle est la capitale de l\'Australie ?');
  await p.selectOption('#adq-qtype', 'texte');
  await p.fill('#adq-accepted', 'Canberra\n  canberra  ');
  await p.check('#adq-secret');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  keys = await db(p, () => window.__DB.hg_quiz_keys);
  const q4 = rows.find((r) => r.qtype === 'texte');
  check(!!q4 && JSON.stringify(keys.find((k) => k.question_id === q4.id)?.answer) === '{"accepted":["Canberra","canberra"],"manual":false}',
    '(a) réponse écrite créée : réponses acceptées une par ligne (sans espaces de bord), validation à la main désactivée');
  check(!!q4 && q4.secret === true, '(a) case « Question bonus secrète » : hg_quiz_set_secret appliqué après l\'enregistrement');
  check(await rowWith(p, 'Australie').locator('.adq-secret').count() === 1, '(a) pastille « Secrète » affichée dans la liste');

  // 5. Nombre : 26 cantons, tolérance 0, facile
  await p.click('[data-adq="new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.fill('#adq-prompt', 'Combien de cantons compte la Suisse ?');
  await p.selectOption('#adq-qtype', 'nombre');
  await p.fill('#adq-value', '26');
  await p.selectOption('#adq-difficulty', 'facile');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  keys = await db(p, () => window.__DB.hg_quiz_keys);
  const q5 = rows.find((r) => r.qtype === 'nombre');
  check(!!q5 && JSON.stringify(keys.find((k) => k.question_id === q5.id)?.answer) === '{"value":26,"tolerance":0}', '(a) nombre créé : valeur 26, tolérance 0');
  check(rows.length === 5, `(a) cinq questions, une de chaque type (${rows.length})`);

  /* (b) Modification, désactivation, suppression */
  await rowWith(p, 'capitale de la Suisse').locator('[data-adq="edit"]').click();
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.waitForTimeout(200);
  check((await p.inputValue('#adq-prompt')) === 'Quelle est la capitale de la Suisse ?', '(b) modification : énoncé pré-rempli');
  check(await p.isChecked(`${choice('b')} .adq-choice-correct`), '(b) modification : la bonne réponse (Berne) est pré-cochée');
  check((await p.inputValue('#adq-difficulty')) === 'facile', '(b) modification : difficulté pré-remplie');
  await p.fill('#adq-prompt', 'Quelle est la capitale fédérale de la Suisse ?');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  keys = await db(p, () => window.__DB.hg_quiz_keys);
  const e1 = rows.find((r) => r.id === q1.id);
  check(e1.prompt === 'Quelle est la capitale fédérale de la Suisse ?', '(b) modification enregistrée (énoncé)');
  check(JSON.stringify(keys.find((k) => k.question_id === q1.id).answer) === '{"correct":["b"]}', '(b) modification : la clé est conservée');

  await rowWith(p, 'capitale fédérale').locator('[data-adq="toggle"]').click();
  await p.waitForTimeout(400);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  check(rows.find((r) => r.id === q1.id).active === false, '(b) question désactivée depuis la liste');
  check((await rowWith(p, 'capitale fédérale').locator('[data-adq="toggle"]').textContent()).trim() === 'Activer', '(b) le bouton propose « Activer »');
  check(await rowWith(p, 'capitale fédérale').locator('.adq-off').count() === 1, '(b) pastille « Inactive » affichée');
  check((await db(p, (id) => window.__DB.hg_quiz_keys.find((k) => k.question_id === id).answer.correct[0], q1.id)) === 'b', '(b) désactiver garde la clé');
  await p.selectOption('#adq-f-statut', 'inactive');
  check(await p.locator('#adq-list .adq-row').count() === 1, '(b) filtre « Inactives » : une seule question');
  await p.selectOption('#adq-f-statut', '');

  await rowWith(p, 'cantons').locator('[data-adq="del"]').click();
  await confirmOk(p);
  await p.waitForTimeout(400);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  keys = await db(p, () => window.__DB.hg_quiz_keys);
  check(rows.length === 4 && !rows.some((r) => r.qtype === 'nombre'), '(b) suppression après confirmation : la question disparaît');
  check(!keys.some((k) => k.question_id === q5.id), '(b) suppression : la clé part avec elle');
  check(await db(p, () => window.__LOG.some((x) => x[0] === 'quiz_remove')), '(b) suppression passée par hg_quiz_remove');

  // Case secrète décochée à la modification : la pastille disparaît
  await rowWith(p, 'Australie').locator('[data-adq="edit"]').click();
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.waitForTimeout(200);
  check(await p.isChecked('#adq-secret'), '(b) modification : la case secrète reflète la question');
  await p.uncheck('#adq-secret');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await drawerGone(p);
  await p.waitForTimeout(300);
  rows = await db(p, () => window.__DB.hg_quiz_questions);
  check(rows.find((r) => r.qtype === 'texte').secret === false, '(b) case secrète décochée : la question n\'est plus secrète');
  check(await rowWith(p, 'Australie').locator('.adq-secret').count() === 0, '(b) pastille « Secrète » retirée');

  /* (d) Filtres et exemples */
  await p.selectOption('#adq-f-diff', 'facile');
  check(await p.locator('#adq-list .adq-row').count() === 2, '(d) filtre « Facile » : deux questions (choix unique, vrai ou faux)');
  await p.selectOption('#adq-f-diff', '');
  check(await p.locator('#adq-list .adq-row').count() === 4, '(d) sans filtre : les quatre questions');

  await p.click('[data-adq="examples"]');
  await p.waitForSelector('.adq-example', { timeout: 5000 });
  check(await p.locator('.adq-example').count() === 5, '(d) exemples : un par type (cinq)');
  await p.click('.adq-example:has-text("Réponse écrite")');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.waitForTimeout(200);
  check((await p.inputValue('#adq-prompt')).includes('Australie'), '(d) exemple « Réponse écrite » : énoncé pré-rempli');
  check((await p.inputValue('#adq-qtype')) === 'texte' && (await p.isVisible('#adq-accepted')), '(d) exemple : type réponse écrite, zone des réponses affichée');
  check((await p.inputValue('#adq-accepted')).trim() === 'Canberra', '(d) exemple : réponse acceptée pré-remplie');
  check((await db(p, () => window.__DB.hg_quiz_questions.length)) === 4, '(d) un exemple ne crée rien avant « Créer la question »');
  await p.click('dialog.ui-drawer[open] .ui-drawer-x');
  await drawerGone(p);

  // Validation côté formulaire : énoncé trop court, rien n'est envoyé
  await p.click('[data-adq="new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
  await p.fill('#adq-prompt', 'Ou');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await p.waitForTimeout(200);
  check((await p.textContent('#adq-error')).includes('entre 3 et 500 caractères'), '(d) énoncé trop court : message affiché, rien envoyé');
  await p.click('dialog.ui-drawer[open] .ui-drawer-x');
  await drawerGone(p);

  /* (c) Récompenses par défaut modifiables et enregistrées */
  await p.fill('#adq-rw-expert', '900');
  await p.click('[data-adq="save-rewards"]');
  await p.waitForTimeout(400);
  const settings = await db(p, () => window.__DB.hg_settings.find((s) => s.key === 'quiz')?.value?.recompenses?.expert);
  check(settings === 900, '(c) récompenses par défaut enregistrées dans hg_settings (expert = 900)');
  await p.fill('#adq-rw-facile', '-5');
  await p.click('[data-adq="save-rewards"]');
  await p.waitForTimeout(200);
  check((await db(p, () => window.__DB.hg_settings.find((s) => s.key === 'quiz')?.value?.recompenses?.facile)) === 60, '(c) valeur négative refusée (facile reste 60)');
  await p.fill('#adq-rw-facile', '60');

  /* (e) Onglet statistiques (en attente), puis retour aux questions */
  await p.click('#adq-tab-s');
  await p.waitForFunction(() => (document.querySelector('#adq-stats-root')?.textContent || '').trim().length > 0, null, { timeout: 5000 });
  check((await p.textContent('#adq-stats-root')).trim().length > 0, '(e) onglet « Réponses et statistiques » : statistiques affichées');
  check(await p.isVisible('#adq-pan-s') && !(await p.isVisible('#adq-pan-q')), '(e) seul l\'onglet statistiques est visible');
  await p.click('#adq-tab-q');
  check(await p.isVisible('#adq-pan-q') && !(await p.isVisible('#adq-pan-s')), '(e) retour à l\'onglet Questions');

  check(p.errs.length === 0, '(a-e) aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
  await p.ctx.close();

  /* (d) Erreur du serveur affichée dans le formulaire */
  {
    const e = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { quizError: 'Coche la ou les bonnes réponses' } });
    await adminSection(e, 'jeux/questions');
    await e.waitForSelector('#adq-list .empty', { timeout: 5000 });
    await e.click('[data-adq="new"]');
    await e.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
    await e.fill('#adq-prompt', 'Question avec une erreur serveur');
    await e.fill(`${choice('a')} .adq-choice-text`, 'Oui');
    await e.fill(`${choice('b')} .adq-choice-text`, 'Non');
    await e.click(`${choice('a')} .adq-choice-correct`);
    await e.click('dialog.ui-drawer[open] [data-drawer-submit]');
    await e.waitForTimeout(400);
    check((await e.textContent('#adq-error')).includes('Coche la ou les bonnes réponses'), '(d) erreur du serveur affichée telle quelle dans le formulaire');
    check(await e.isVisible('dialog.ui-drawer[open]'), '(d) le formulaire reste ouvert après une erreur');
    check((await db(e, () => window.__DB.hg_quiz_questions.length)) === 0, '(d) rien n\'est créé après une erreur');
    await e.click('dialog.ui-drawer[open] .ui-drawer-x');
    await drawerGone(e);
    check(e.errs.length === 0, '(d) erreur serveur : aucune erreur JS' + (e.errs.length ? ' (' + e.errs.join(' | ') + ')' : ''));
    await e.ctx.close();
  }

  /* (d) Case secrète : erreur du serveur à hg_quiz_set_secret ; la question est enregistrée, pas recréée au renvoi */
  {
    const e = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { quizSecretError: 'Réglage secret indisponible' } });
    await adminSection(e, 'jeux/questions');
    await e.waitForSelector('#adq-list .empty', { timeout: 5000 });
    await e.click('[data-adq="new"]');
    await e.waitForSelector('dialog.ui-drawer[open] #adq-prompt', { timeout: 5000 });
    await e.fill('#adq-prompt', 'Question secrète en erreur');
    await e.fill(`${choice('a')} .adq-choice-text`, 'Oui');
    await e.fill(`${choice('b')} .adq-choice-text`, 'Non');
    await e.click(`${choice('a')} .adq-choice-correct`);
    await e.check('#adq-secret');
    await e.click('dialog.ui-drawer[open] [data-drawer-submit]');
    await e.waitForTimeout(400);
    check((await e.textContent('#adq-error')).includes('pas pu être appliquée'), '(d) erreur de hg_quiz_set_secret affichée dans le formulaire');
    check(await e.isVisible('dialog.ui-drawer[open]'), '(d) secret : le formulaire reste ouvert après l\'erreur');
    check((await db(e, () => window.__DB.hg_quiz_questions.length)) === 1, '(d) secret : la question est tout de même enregistrée');
    check(await e.locator('#adq-list .adq-row').count() === 1, '(d) secret : la liste montre la question enregistrée');
    await e.click('dialog.ui-drawer[open] [data-drawer-submit]');
    await e.waitForTimeout(400);
    check((await db(e, () => window.__DB.hg_quiz_questions.length)) === 1, '(d) secret : un nouvel envoi modifie la question, sans doublon');
    await e.click('dialog.ui-drawer[open] .ui-drawer-x');
    await drawerGone(e);
    check(e.errs.length === 0, '(d) secret en erreur : aucune erreur JS' + (e.errs.length ? ' (' + e.errs.join(' | ') + ')' : ''));
    await e.ctx.close();
  }

  /* (a) Staff avec la permission « quiz » : la section est proposée, sans les autres sous-sections du domaine */
  {
    const s = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { uid: U(2), staff: ['quiz'] } });
    // Les sous-menus de chaque domaine restent dans le DOM (un seul affiché à la fois) : on lit les liens permis.
    await s.evaluate(() => { location.hash = '#fete'; });
    await s.waitForSelector('#lieu-root .lieu-tile', { timeout: 5000 }).catch(() => {});
    const subs = await s.$$eval('#lieu-root .lieu-tile', (as) => as.map((a) => a.dataset.sub));
    // « citations » (Qui a dit ça ?) et « programmation » (Question du jour) relèvent aussi du droit « quiz » (SECTION_PERM)
    check(JSON.stringify(subs) === JSON.stringify(['programmation', 'questions', 'citations']), `(a) Staff « quiz » : domaine Autres jeux = ${subs.join(', ')}`);
    const lieux = await s.$$eval('.plateau-lieu', (as) => as.map((a) => a.getAttribute('href')));
    check(!lieux.includes('#fabrique'), '(a) Staff « quiz » : La Fabrique de cartes absente du plateau');
    await adminSection(s, 'jeux/questions');
    check(await s.isVisible('#quiz') && await s.isVisible('#adq-list'), '(a) Staff « quiz » : section affichée');
    check(s.errs.length === 0, '(a) Staff « quiz » : aucune erreur JS' + (s.errs.length ? ' (' + s.errs.join(' | ') + ')' : ''));
    await s.ctx.close();
  }

  await browser.close();
  finish();
})();
