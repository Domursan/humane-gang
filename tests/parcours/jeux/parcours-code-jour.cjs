// Parcours : Code du jour (/pages/jeux/duels.html#jour), faux Supabase fake-sb-duels-plateaux.mjs (réponses des RPC dans
// window.__DUELS.rpc : hg_duel_jour, hg_duel_jour_essayer ; code secret « royg »).
// Effets de la maquette des jeux quotidiens : après un essai, pions et indices cachés puis révélés un par un ; essai gagnant =
// bilan caché puis tampon de points (11 moins le numéro de l'essai) ; dernier essai raté = tampon « 0 PT » ; jour déjà fini à
// l'ouverture = tampon posé sans animation d'entrée ; le mode daltonien (nouveau dessin) garde le tampon.
// Lancer : node tests/parcours/jeux/parcours-code-jour.cjs
const { check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');

/** Script d'initialisation : état du jour côté « serveur » et notation des essais (secret royg). */
const init = (etatJour) => ({ content: `
  window.__DUELS = { possibles: [], appels: [], etat: null, rpc: {} };
  const SECRET = 'royg';
  const J = ${JSON.stringify(etatJour)};
  const note = (essai) => {
    let bien = 0; const resteS = [], resteE = [];
    for (let i = 0; i < 4; i++) { if (essai[i] === SECRET[i]) bien++; else { resteS.push(SECRET[i]); resteE.push(essai[i]); } }
    let mal = 0; for (const c of resteE) { const k = resteS.indexOf(c); if (k >= 0) { mal++; resteS.splice(k, 1); } }
    return { bien, mal };
  };
  const etat = () => {
    const trouve = J.essais.find((e) => e.bien === 4);
    const fini = !!trouve || J.essais.length >= 10;
    return { jour: '2026-10-31', essais: J.essais, trouve_en: trouve ? trouve.n : null, fini, serie: 0, secret: fini ? SECRET : null,
      classement: [], trouveurs: trouve ? 1 : 0, gain: fini ? 170 : null };
  };
  window.__DUELS.rpc.hg_duel_jour = () => etat();
  window.__DUELS.rpc.hg_duel_jour_essayer = (a) => {
    const s = note(a.p_essai);
    J.essais.push({ n: J.essais.length + 1, essai: a.p_essai, bien: s.bien, mal: s.mal });
    return etat();
  };` });

/** Choisit quatre couleurs dans la palette puis valide l'essai. */
async function jouer(p, lettres) {
  for (const c of lettres) await p.locator('[data-act="pal"][data-c="' + c + '"]').click();
  await p.locator('[data-act="valider"]').click();
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- Essais successifs : un raté, puis le bon code ---------- */
  let p = await openPage(browser, { page: 'duels', hash: '#jour', fixture: 'fake-sb-duels-plateaux.mjs', width: 1280, height: 900, init: init({ essais: [] }) });
  await p.waitForSelector('.duels-jour .mm-palette', { timeout: 6000 }).catch(() => {});
  check(await p.locator('.duels-jour-bilan').count() === 0, 'ouverture : jour en cours, pas de bilan');
  await jouer(p, 'pbrr'); // aucun bien placé
  await p.waitForSelector('.mm-plateau .mm-indices-txt', { timeout: 3000 }).catch(() => {});
  check(await p.locator('.mm-plateau .mm-rangee .mm-indices-txt.jour-cache').count() === 1, 'essai : le texte des indices est caché le temps de la séquence');
  await sleep(2600);
  check(await p.locator('.duels-jour .jour-cache').count() === 0, 'essai : tout est révélé à la fin de la séquence');
  check(await p.locator('.mm-plateau > .mm-rangee:nth-child(1) .mm-pion.fxj-pop').count() === 4, 'essai : pions posés un à un (animation)');
  check(await p.locator('.fxj-tampon').count() === 0, 'essai non gagnant : pas de fin de partie');
  await jouer(p, 'royg'); // code trouvé au 2e essai
  await p.waitForSelector('.duels-jour-bilan', { timeout: 3000 }).catch(() => {});
  check(await p.locator('.duels-jour-bilan.jour-cache').count() === 1 && await p.locator('.fxj-tampon').count() === 0, 'code trouvé : bilan caché le temps des pions et des indices');
  await p.waitForSelector('.duels-jour-bilan .fxj-tampon', { timeout: 5000 }).catch(() => {});
  check((await p.locator('.duels-jour-bilan .fxj-tampon').innerText().catch(() => '')) === '9 PTS', 'code trouvé au 2e essai : tampon « 9 PTS » (11 moins 2)');
  check(await p.locator('.duels-jour-bilan.fxj-entree').count() === 1 && await p.locator('.duels-jour-bilan.jour-cache').count() === 0, 'code trouvé : le bilan apparaît avec son entrée animée');
  await p.locator('[data-act="dalto"]').click();
  await sleep(200);
  check(await p.locator('.duels-jour-bilan .fxj-tampon').count() === 1 && await p.locator('.duels-jour-bilan.fxj-entree').count() === 0, 'nouveau dessin (daltonien) : tampon gardé, sans rejouer l’entrée');
  check(p.errs.length === 0, `aucune erreur JS ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Jour déjà fini à l'ouverture : tampon sans animation ---------- */
  const trois = [{ n: 1, essai: 'pbrr', bien: 0, mal: 0 }, { n: 2, essai: 'rrrr', bien: 1, mal: 0 }, { n: 3, essai: 'royg', bien: 4, mal: 0 }];
  p = await openPage(browser, { page: 'duels', hash: '#jour', fixture: 'fake-sb-duels-plateaux.mjs', width: 1280, height: 900, init: init({ essais: trois }) });
  await p.waitForSelector('.duels-jour-bilan', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.duels-jour-bilan .fxj-tampon').innerText().catch(() => '')) === '8 PTS', 'jour déjà trouvé (3e essai) : tampon « 8 PTS » à l’ouverture');
  check(await p.locator('.duels-jour-bilan.fxj-entree').count() === 0 && await p.locator('.duels-jour .jour-cache, .duels-jour [class*="fxj-pop"]').count() === 0, 'jour déjà fini : aucun effet à l’ouverture');
  check(p.errs.length === 0, `aucune erreur JS (jour fini) ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Dix essais ratés : tampon « 0 PT » ---------- */
  const rates = Array.from({ length: 9 }, (_, i) => ({ n: i + 1, essai: 'pbrr', bien: 0, mal: 0 }));
  p = await openPage(browser, { page: 'duels', hash: '#jour', fixture: 'fake-sb-duels-plateaux.mjs', width: 1280, height: 900, init: init({ essais: rates }) });
  await p.waitForSelector('.duels-jour .mm-palette', { timeout: 6000 }).catch(() => {});
  await jouer(p, 'pbrr');
  await p.waitForSelector('.duels-jour-bilan .fxj-tampon', { timeout: 6000 }).catch(() => {});
  check((await p.locator('.duels-jour-bilan .fxj-tampon').innerText().catch(() => '')) === '0 PT' && await p.locator('.duels-jour-bilan .fxj-tampon.is-rate').count() === 1, '10e essai raté : tampon « 0 PT »');
  await p.ctx.close();

  await browser.close();
  finish();
})();
