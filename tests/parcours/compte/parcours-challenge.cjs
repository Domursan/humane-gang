// Parcours : challenge de la semaine, côté membre (/pages/compte/challenge.html et carte de l'accueil, migration 218).
// Couvre : participation (fichier image compressé puis envoyé dans <challenge_id>/<nom>.<ext>, barre d'envoi, quota atteint,
// retrait avec suppression du fichier), refus d'un type interdit (SVG), fichier retiré du bucket si l'enregistrement échoue ;
// vote anonyme (aucun pseudo ni nom de fichier, sa propre participation sans bouton, « Voter » puis « Ta voix ») ;
// non-participant en lecture seule ; résultat (gagnant, voix, classement, archives) ; aucun challenge (état vide) ;
// carte de l'accueil ; téléphone 390 px sans défilement horizontal ; aucune erreur console.
// Faux Supabase : tests/fixtures/fake-sb-challenge.mjs (état dans window.__WCH, journal window.__LOG).
// Lancer : node tests/parcours/compte/parcours-challenge.cjs
const { check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-challenge.mjs';
const CUR = 'c0000000-0000-4000-8000-000000000001';
// Petite image PNG valide (2 × 2 px), décodable par le navigateur pour la compression.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
/** Ouvre la page du challenge avec un scénario. */
const ouvrir = (browser, wch, o = {}) => openPage(browser, { page: 'challenge', fixture: FIX, scenario: { wch, ...(o.scenario || {}) }, ...o });
/** Attend que la page ait fini de charger (aria-busy retiré). */
const pret = (p) => p.waitForFunction(() => !document.getElementById('app').hasAttribute('aria-busy'), null, { timeout: 8000 });
/** Bouton principal de la boîte de confirmation ouverte. */
const confirmer = async (p, motif) => {
  await p.waitForSelector('dialog.hg-dialog[open]', { timeout: 4000 });
  if (motif) await p.fill('dialog.hg-dialog[open] input', motif);
  await p.click('dialog.hg-dialog[open] .dialog-actions button:last-child');
};

(async () => {
  const browser = await chromium.launch();

  /* ---------- Participation : envoi d'une image ---------- */
  let p = await ouvrir(browser, { phase: 'participation', type: 'image', max: 1 });
  await pret(p);
  check(await p.textContent('h1.page-title') === 'Challenge de la semaine', 'page : titre');
  check(await p.textContent('#chl-name') === 'La nuit en une image', 'participation : nom du challenge');
  check(await p.locator('.chl-hero .pill-ok', { hasText: 'Participation ouverte' }).count() === 1, 'participation : pastille « Participation ouverte »');
  check(await p.locator('.chl-cd-t', { hasText: 'Fin de la participation dans' }).count() === 1, 'participation : compte à rebours de fin');
  check(await p.locator('.chl-gain-n').count() === 1 && /500/.test(await p.textContent('.chl-gain-n')), 'participation : gain 500 Paillettes affiché');
  check(await p.inputValue('#chl-pseudo') === 'Ethan' && await p.$eval('#chl-pseudo', (i) => i.readOnly), 'participation : pseudo du compte, non modifiable');
  check(/4 participations envoyées/.test(await p.textContent('.chl-hidden')), 'participation : nombre de participations cachées');
  check(!/Bruno|Chloé|David|Emma/.test(await p.textContent('#app')), 'participation : aucune participation des autres visible');

  // Type refusé : un SVG n'est jamais accepté
  await p.setInputFiles('#chl-file-input', { name: 'dessin.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') });
  await p.waitForSelector('#chl-file-error:not([hidden])', { timeout: 4000 });
  check(/« dessin\.svg » refusé/.test(await p.textContent('#chl-file-error')), 'fichier : SVG refusé avec un message en français');

  // Envoi sans fichier : message
  await p.click('#chl-submit');
  check(/Choisis une image/.test(await p.textContent('#chl-file-error')), 'envoi sans fichier : message « Choisis une image »');

  // Image valide : aperçu, envoi, participation enregistrée
  await p.setInputFiles('#chl-file-input', { name: 'ma-nuit.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('#chl-file-list li', { timeout: 5000 });
  check(/ma-nuit\.png/.test(await p.textContent('#chl-file-list')), 'fichier : aperçu du fichier choisi');
  check(await p.textContent('#chl-file-add-t') === 'Changer d’image', 'fichier : le bouton devient « Changer d’image »');
  await p.fill('#chl-legende', 'Vue de ma fenêtre');
  check(await p.textContent('#chl-legende-n') === '17 / 200', 'légende : compteur 17 / 200');
  await p.click('#chl-submit');
  await p.waitForSelector('.chl-mine li', { timeout: 6000 });
  let L = await log(p);
  const up = L.find((x) => x[0] === 'wch-upload');
  check(!!up && new RegExp(`^${CUR}/[A-Za-z0-9_-]{8,64}\\.webp$`).test(up[1]), 'envoi : fichier compressé en WebP, chemin <challenge_id>/<nom>.webp (sans uid)');
  const enter = L.find((x) => x[0] === 'rpc' && x[1] === 'hg_wch_enter');
  check(!!enter && enter[2].p_path === up?.[1] && enter[2].p_caption === 'Vue de ma fenêtre' && enter[2].p_mime === 'image/webp', 'envoi : hg_wch_enter reçoit le chemin, le type et la légende');
  check(/Ta participation est envoyée/.test(await p.textContent('#chl-form')), 'quota atteint : encadré « Ta participation est envoyée »');
  check(await p.locator('#chl-quota.is-full').count() === 1, 'quota atteint : pastille 1 sur 1');

  // Retrait : confirmation, participation retirée, fichier supprimé du bucket
  await p.click('[data-action="withdraw"]');
  await confirmer(p);
  await p.waitForSelector('#chl-submit', { timeout: 6000 });
  L = await log(p);
  check(L.some((x) => x[0] === 'rpc' && x[1] === 'hg_wch_withdraw'), 'retrait : hg_wch_withdraw appelé');
  check(L.some((x) => x[0] === 'wch-remove' && x[1].includes(up?.[1])), 'retrait : fichier supprimé du bucket');
  check(await p.locator('.chl-mine li').count() === 0, 'retrait : plus de participation dans « Mes participations »');
  check(await hscroll(p) <= 0, 'participation : pas de défilement horizontal (bureau)');
  check(!p.errs.length, `participation : aucune erreur console ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Échec de l'enregistrement : le fichier envoyé est retiré ---------- */
  p = await ouvrir(browser, { phase: 'participation', fail: true });
  await pret(p);
  await p.setInputFiles('#chl-file-input', { name: 'nuit.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('#chl-file-list li', { timeout: 5000 });
  await p.click('#chl-submit');
  await p.waitForSelector('#chl-file-error:not([hidden])', { timeout: 5000 });
  L = await log(p);
  const up2 = L.find((x) => x[0] === 'wch-upload');
  check(!!up2 && L.some((x) => x[0] === 'wch-remove' && x[1].includes(up2[1])), 'échec : le fichier déposé est retiré du bucket');
  check(/Envoi impossible : La participation est fermée/.test(await p.textContent('#chl-file-error')), 'échec : message de la base affiché');
  check(await p.isEnabled('#chl-submit') && await p.textContent('#chl-submit') === 'Envoyer ma participation', 'échec : bouton d’envoi rétabli');
  await p.ctx.close();

  /* ---------- Texte : zone de texte, pas de fichier ---------- */
  p = await ouvrir(browser, { phase: 'participation', type: 'texte', max: 2 });
  await pret(p);
  check(await p.locator('#chl-texte').count() === 1 && await p.locator('#chl-file-input').count() === 0, 'texte : zone de texte, aucun champ de fichier');
  await p.fill('#chl-texte', 'La nuit tombe sur le lac.');
  await p.click('#chl-submit');
  await p.waitForSelector('.chl-mine li', { timeout: 6000 });
  L = await log(p);
  const e3 = L.find((x) => x[0] === 'rpc' && x[1] === 'hg_wch_enter');
  check(!!e3 && e3[2].p_path === null && e3[2].p_body === 'La nuit tombe sur le lac.' && !L.some((x) => x[0] === 'wch-upload'), 'texte : envoyé sans fichier');
  check(/1<\/strong> participation sur 2/.test(await p.innerHTML('#chl-quota')), 'texte : quota 1 sur 2, formulaire toujours ouvert');
  await p.ctx.close();

  /* ---------- Vote : participant ---------- */
  p = await ouvrir(browser, { phase: 'vote' });
  await pret(p);
  check(await p.locator('.chl-entry').count() === 5, 'vote : 5 participations affichées');
  const grille = await p.textContent('.chl-entries');
  check(!/Bruno|Chloé|David|Emma|Ethan/.test(grille), 'vote : aucun pseudo dans la grille (anonyme)');
  check(!/photo-/.test(await p.textContent('#app')), 'vote : aucun nom de fichier d’origine affiché');
  check(await p.locator('.chl-entry.is-own .chl-own').count() === 1 && await p.locator('.chl-entry.is-own [data-action="vote"]').count() === 0, 'vote : sa propre participation sans bouton de vote');
  check(/Tu n’as pas encore voté/.test(await p.textContent('.chl-note')), 'vote : note « pas encore voté »');
  const btn = p.locator('.chl-entry:not(.is-own) [data-action="vote"]').first();
  const n = Number((await btn.getAttribute('aria-label')).match(/n° (\d+)/)[1]);
  await btn.click();
  await p.waitForSelector('.chl-entry.is-voted', { timeout: 5000 });
  L = await log(p);
  check(L.some((x) => x[0] === 'rpc' && x[1] === 'hg_wch_vote'), 'vote : hg_wch_vote appelé');
  check(await p.locator('[data-action="vote"][aria-pressed="true"]').count() === 1 && /Ta voix/.test(await p.textContent('.chl-entry.is-voted .chl-vote')), 'vote : bouton « Ta voix » pressé');
  check((await p.textContent('.chl-note')).includes(`Ta voix : participation n° ${n}.`), 'vote : note « Ta voix : participation n° N »');
  check(await hscroll(p) <= 0, 'vote : pas de défilement horizontal');
  check(!p.errs.length, `vote : aucune erreur console ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Vote : non-participant, lecture seule ---------- */
  p = await ouvrir(browser, { phase: 'vote', mine: 0 });
  await pret(p);
  check(/Seuls les participants votent/.test(await p.textContent('.chl-note')), 'non-participant : note « Seuls les participants votent »');
  check(await p.locator('[data-action="vote"]').count() === 0 && await p.locator('.chl-entry').count() === 4, 'non-participant : participations visibles, aucun bouton de vote');
  await p.ctx.close();

  /* ---------- Téléphone 390 px ---------- */
  for (const ph of ['participation', 'vote', 'termine']) {
    p = await ouvrir(browser, { phase: ph }, { width: 390, height: 844, mobile: true });
    await pret(p);
    check(await hscroll(p) <= 0, `téléphone (${ph}) : pas de défilement horizontal`);
    const petits = await p.evaluate(() => [...document.querySelectorAll('#app button, #app a.btn, #app summary')].filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 43.5).map((b) => b.textContent.trim().slice(0, 30)));
    check(!petits.length, `téléphone (${ph}) : cibles tactiles ≥ 44 px ${petits.join(' | ')}`);
    await p.ctx.close();
  }

  /* ---------- Résultat ---------- */
  p = await ouvrir(browser, { phase: 'termine' });
  await pret(p);
  check(/Chloé/.test(await p.textContent('.chl-win-who')), 'résultat : gagnante Chloé');
  check(/3 voix/.test(await p.textContent('.chl-win-voix')), 'résultat : 3 voix');
  check(/500 Paillettes versées/.test(await p.textContent('.chl-win-gain')), 'résultat : gain versé affiché');
  check(await p.locator('.chl-rank li').count() === 4, 'résultat : classement des 4 autres participations, avec pseudos');
  check(/Bruno/.test(await p.textContent('.chl-rank')), 'résultat : pseudos révélés dans le classement');
  check(await p.locator('.chl-arch-item').count() === 2, 'archives : deux challenges précédents (l’annulé n’y est pas)');
  check(/Sans gagnant/.test(await p.textContent('.chl-arch')), 'archives : challenge sans gagnant');
  check(!p.errs.length, `résultat : aucune erreur console ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Sans challenge ---------- */
  p = await ouvrir(browser, { phase: 'vide' });
  await pret(p);
  check(/Pas de challenge en ce moment/.test(await p.textContent('.chl-empty')), 'vide : état vide');
  check(await p.locator('.chl-arch-item').count() === 2, 'vide : archives affichées');
  await p.ctx.close();

  /* ---------- Carte de l'accueil ---------- */
  p = await openPage(browser, { page: 'accueil', fixture: FIX, scenario: { wch: { phase: 'participation' } } });
  await p.waitForSelector('#chl-home', { timeout: 8000 }).catch(() => {});
  check(await p.locator('#chl-home').count() === 1, 'accueil : carte « Challenge de la semaine » présente');
  check(await p.locator('.home-duo #chl-home').count() === 1 && await p.locator('.home-duo #defi').count() === 1, 'accueil : carte à côté du bloc des défis');
  check(await p.getAttribute('#chl-home .btn-primary', 'href') === '/pages/compte/challenge.html' && await p.textContent('#chl-home .btn-primary') === 'Participer', 'accueil : bouton « Participer » vers la page');
  check(!p.errs.length, `accueil : aucune erreur console ${p.errs.join(' | ')}`);
  await p.ctx.close();
  p = await openPage(browser, { page: 'accueil', fixture: FIX, scenario: { wch: { phase: 'vide', archives: false } } });
  await sleep(800);
  check(await p.locator('#chl-home').count() === 0, 'accueil : pas de carte sans challenge');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
