// Parcours : idée J3 · « Qui a dit ça ? » (/pages/jeux/jeux.html#citations et admin #fete/citations), faux Supabase
// fake-sb-jeux.mjs. Citation en grand, quatre membres en choix, réponse unique, bonne réponse / ton choix, contexte et
// part du gang ; citation suivante ; proposition d'une citation ; accord de l'auteur ; 360 px ; panel : publier, refuser.
// Effets : mauvaise réponse = choix secoué puis résultat ; bonne réponse = halo vert puis résultat ; pas d'effet à l'ouverture
// (citation déjà répondue rouverte depuis l'historique) ; fin de partie sur la première citation du jour seulement (jour_gain, migration 181).
// Lancer : node tests/parcours/jeux/parcours-j3.cjs
const path = require('path');
const { SHOTS, check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');
const FIX = 'fake-sb-jeux.mjs';

(async () => {
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#citations', width: 360, height: 900 });
  await p.waitForSelector('.cit-opt', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.cit-quote').innerText()).includes('MERCI DE PAS TROLL'), 'citation affichée en grand');
  check(await p.locator('.cit-opt').count() === 4 && await p.locator('.cit-opt .avatar').count() === 4, 'quatre membres avec avatar');
  check(!(await p.locator('#cit-card').innerText()).includes('Salon nouvel an'), 'contexte caché avant la réponse');
  const minH = await p.evaluate(() => Math.min(...[...document.querySelectorAll('.cit-opt')].map((b) => b.getBoundingClientRect().height)));
  check(minH >= 44, 'boutons-avatars ≥ 44 px');
  // Mauvaise réponse
  await p.locator('.cit-opt[data-opt="a"]').click();
  await p.waitForSelector('.cit-opt[data-opt="a"].fxj-secoue', { timeout: 1500 }).catch(() => {});
  check(await p.locator('.cit-opt[data-opt="a"].fxj-secoue').count() === 1 && await p.locator('#cit-card .jg-status').count() === 0, 'effet : mauvaise réponse secouée avant le résultat');
  await p.waitForSelector('#cit-card .jg-status', { timeout: 4000 }).catch(() => {});
  await p.waitForSelector('#cit-card .jg-status .fxj-tampon', { timeout: 3000 }).catch(() => {});
  await sleep(1400); // les Paillettes défilent
  check(await p.locator('#cit-card .jg-status .fxj-tampon').innerText() === '0 PT' && (await p.locator('#cit-card .jg-status').innerText()).includes('+50'), '1re citation du jour : tampon « 0 PT » et +50 Paillettes (migration 181)');
  const txt = await p.locator('#cit-card').innerText();
  check(txt.includes('Raté, c’était Bruno.') && txt.includes('Salon nouvel an'), 'raté : bonne personne et contexte');
  check(await p.locator('.cit-opt.is-good').count() === 1 && await p.locator('.cit-opt.is-wrong').count() === 1, 'états : bonne réponse et ton choix');
  check(txt.includes('62 % du gang a trouvé'), 'part du gang qui a trouvé');
  check(await p.locator('.cit-opt:disabled').count() === 4, 'une seule réponse : choix désactivés');
  check((await log(p)).filter((l) => l[1] === 'hg_quiz_answer').length === 1, 'réponse envoyée par hg_quiz_answer');
  // Suivante, bonne réponse
  await p.locator('[data-cit="next"]').click();
  await sleep(300);
  check((await p.locator('.cit-quote').innerText()).includes('KC > G2'), 'citation suivante');
  await p.locator('.cit-opt[data-opt="c"]').click();
  await p.waitForSelector('.cit-opt[data-opt="c"].fxj-bon', { timeout: 1500 }).catch(() => {});
  check(await p.locator('.cit-opt[data-opt="c"].fxj-bon').count() === 1, 'effet : bonne réponse en halo vert');
  await p.waitForSelector('#cit-card .jg-status', { timeout: 4000 }).catch(() => {});
  check(await p.locator('.fxj-tampon').count() === 0, '2e citation du jour : pas de fin de partie');
  await sleep(1400);
  check((await p.locator('#cit-card').innerText()).includes('Bravo, c’était bien David'), 'bonne réponse : bravo');
  check((await p.locator('#cit-history summary').innerText()).includes('(2)'), 'historique : 2 citations jouées');
  await p.locator('#cit-history summary').click();
  await p.locator('[data-cit="show"]').first().click();
  await sleep(300);
  check(await p.locator('#cit-card [class*="fxj-"]').count() === 0, 'rouvrir une citation déjà répondue : aucun effet');
  // Proposer une citation
  await p.locator('#cit-propose').click();
  await p.waitForFunction(() => document.querySelectorAll('#cit-author option').length > 1, null, { timeout: 4000 }).catch(() => {});
  check(await p.locator('#cit-propose').getAttribute('aria-expanded') === 'true' && !(await p.locator('#cit-form').isHidden()), 'formulaire de proposition ouvert');
  await p.locator('#cit-quote').fill('Le livre est mieux');
  await p.locator('#cit-author').selectOption({ index: 2 });
  await p.locator('#cit-context').fill('Ciné-club');
  await p.locator('#cit-form [type="submit"]').click();
  await sleep(600);
  const pr = (await log(p)).filter((l) => l[0] === 'quote_propose').pop();
  check(pr && pr[1] === 'Le livre est mieux' && pr[3] === 'Ciné-club', 'proposition envoyée');
  check(await p.locator('#cit-form').isHidden() && !(await p.locator('#cit-mine').isHidden()), 'proposition : formulaire fermé, « Mes propositions » visible');
  check(await hscroll(p) <= 0, '360 px : pas de défilement horizontal');
  await p.screenshot({ path: path.join(SHOTS, 'jeux-citations-360.png'), fullPage: true }).catch(() => {});
  check(p.errs.length === 0, `aucune erreur JS ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Accord de l'auteur ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#citations', width: 390, scenario: { quoteConsent: true } });
  await p.waitForSelector('.cit-consent', { timeout: 4000 }).catch(() => {});
  check((await p.locator('.cit-consent').innerText()).includes('Le livre est mieux'), 'auteur : citation à valider');
  await p.locator('[data-cit="accord"]').click();
  await sleep(500);
  check((await log(p)).some((l) => l[0] === 'quote_reply' && l[2] === true) && await p.locator('.cit-consent').count() === 0, 'auteur : accord envoyé');
  await p.ctx.close();

  /* ---------- Aucune citation ---------- */
  p = await openPage(browser, { page: 'jeux', fixture: FIX, hash: '#citations', width: 390, scenario: { quotesNone: true } });
  await sleep(600);
  check((await p.locator('#cit-card').innerText()).includes('Pas encore de citation'), 'aucune citation : message');
  await p.ctx.close();

  /* ---------- Panel ---------- */
  p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await adminSection(p, 'fete/citations');
  await p.waitForSelector('#ajx-cit-list .ajx-row', { timeout: 4000 }).catch(() => {});
  check(await p.locator('#ajx-cit-list .ajx-row').count() === 2, 'panel : file des citations');
  check(await p.locator('[data-ajx="cit-pub"]').nth(1).isDisabled(), 'panel : publication bloquée sans accord de l’auteur');
  await p.locator('[data-ajx="cit-pub"]').first().click();
  await p.waitForSelector('#ajx-pub-q', { timeout: 3000 }).catch(() => {});
  await p.locator('#ajx-pub-q').fill('On part à 8 h pile, promis');
  await p.locator('[data-drawer-submit]').click();
  await sleep(600);
  const pub = (await log(p)).filter((l) => l[0] === 'quote_publish').pop();
  check(pub && pub[1].p_quote === 'On part à 8 h pile, promis' && pub[1].p_reward === 10, 'panel : publication avec reformulation');
  await p.locator('[data-ajx="cit-ref"]').first().click();
  await p.locator('dialog[open]').getByRole('button', { name: 'Refuser' }).click().catch(() => {});
  await sleep(500);
  check((await log(p)).some((l) => l[0] === 'quote_refuse'), 'panel : refus confirmé');
  check(p.errs.length === 0, `panel : aucune erreur JS ${p.errs.join(' | ')}`);
  await p.ctx.close();
  await browser.close();
  finish();
})();
