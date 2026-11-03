// Parcours : panel, challenges de la semaine (La Fabrique › Animations › Challenges de la semaine, #fabrique/challenges).
// Couvre : liste (phases, chiffres), création dans le tiroir (récapitulatif en heure suisse, valeurs envoyées), champs figés
// à la modification (type de réponse quand des membres ont participé), annulation, suppression d'un challenge sans
// participation, fiche de suivi (pseudos et voix), retrait d'une participation avec motif (fichier supprimé du bucket),
// choix du gagnant quand personne n'a voté, retrait des fichiers orphelins à l'ouverture, téléphone 390 px.
// Faux Supabase : tests/fixtures/fake-sb-challenge.mjs (l'admin connecté est Ethan).
// Lancer : node tests/parcours/admin/parcours-admin-challenge.cjs
const { check, finish, openPage, adminSection, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-challenge.mjs';
const CUR = 'c0000000-0000-4000-8000-000000000001';
const A3 = 'c0000000-0000-4000-8000-000000000004';
const ouvrir = (browser, wch, o = {}) => openPage(browser, { page: 'admin', fixture: FIX, scenario: { wch }, ...o });
const confirmer = async (p, motif) => {
  await p.waitForSelector('dialog.hg-dialog[open]', { timeout: 4000 });
  if (motif) await p.fill('dialog.hg-dialog[open] input', motif);
  await p.click('dialog.hg-dialog[open] .dialog-actions button:last-child');
};
const ligne = (p, titre) => p.locator('#wch-list .adc-row', { hasText: titre });

(async () => {
  const browser = await chromium.launch();

  /* ---------- Liste, création, modification, annulation, suppression ---------- */
  let p = await ouvrir(browser, { phase: 'participation', orphelins: [`${CUR}/0123456789abcdef.webp`] });
  await adminSection(p, 'fabrique/challenges');
  await p.waitForSelector('#wch-list .adc-row', { timeout: 6000 });
  check(await p.textContent('#h-challenges-semaine') === 'Challenges de la semaine', 'section : titre « Challenges de la semaine »');
  check(await p.locator('#wch-list .adc-row').count() === 4, 'liste : 4 challenges');
  check(/Participation ouverte/.test(await ligne(p, 'La nuit en une image').textContent()), 'liste : challenge courant « Participation ouverte »');
  check(/4 participations de 4 membres/.test(await ligne(p, 'La nuit en une image').textContent()), 'liste : chiffres du challenge courant');
  check(/Gagnant : Chloé/.test(await ligne(p, 'Ton plat du dimanche').textContent()), 'liste : gagnant d’un challenge terminé');
  let L = await log(p);
  check(L.some((x) => x[0] === 'rpc' && x[1] === 'hg_wch_admin_orphelins'), 'orphelins : hg_wch_admin_orphelins appelé à l’ouverture');
  check(L.some((x) => x[0] === 'wch-remove' && x[1].includes(`${CUR}/0123456789abcdef.webp`)), 'orphelins : fichiers retirés du bucket');

  // Création
  await p.click('[data-action="wch-new"]');
  await p.waitForSelector('dialog.ui-drawer[open] #wch-title', { timeout: 5000 });
  check(await p.textContent('dialog.ui-drawer[open] .ui-drawer-title') === 'Nouveau challenge', 'création : tiroir « Nouveau challenge »');
  check(await p.inputValue('#wch-max') === '1' && await p.inputValue('#wch-vote') === '2', 'création : 1 participation par membre, vote de 2 jours par défaut');
  await p.fill('#wch-title', 'Ton bureau en une photo');
  await p.fill('#wch-how', 'Une photo de ton bureau, tel quel.');
  await p.selectOption('#wch-type', 'video');
  await p.fill('#wch-pa', '250');
  check(/Participation du .* puis vote jusqu’au .*250 Paillettes/.test(await p.textContent('#wch-recap')), 'création : récapitulatif en direct (dates, gain)');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
  const cree = await p.evaluate(() => window.__DB.hg_weekly_challenges.find((c) => c.title === 'Ton bureau en une photo'));
  check(!!cree && cree.answer_type === 'video' && cree.reward_paillettes === 250 && cree.max_entries === 1 && cree.vote_days === 2, 'création : valeurs envoyées à hg_weekly_challenges');
  check(!!cree && /T(16|17):00:00/.test(cree.starts_at) && new Date(cree.ends_at) - new Date(cree.starts_at) === 7 * 864e5, 'création : lundi 18:00 heure suisse, 7 jours de participation');
  await p.waitForSelector('#wch-list .adc-row:has-text("Ton bureau en une photo")', { timeout: 5000 });
  check(/À venir/.test(await ligne(p, 'Ton bureau en une photo').textContent()), 'création : le nouveau challenge est « À venir »');

  // Modification : type figé (des membres ont participé), le reste modifiable
  await ligne(p, 'La nuit en une image').locator('[data-action="wch-edit"]').click();
  await p.waitForSelector('dialog.ui-drawer[open] #wch-type', { timeout: 5000 });
  check(await p.isDisabled('#wch-type') && await p.isEnabled('#wch-end'), 'modification : type figé, fin de participation modifiable');
  check(/des membres ont déjà participé/.test(await p.textContent('#wch-fige')), 'modification : raison des champs figés');
  await p.fill('#wch-lot', 'deux places de ciné');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
  L = await log(p);
  const maj = L.filter((x) => x[0] === 'update' && x[1] === 'hg_weekly_challenges').pop();
  check(!!maj && maj[2].reward_text === 'deux places de ciné' && !('answer_type' in maj[2]), 'modification : lot envoyé, type figé jamais renvoyé');

  // Suppression d'un challenge sans participation (l'annulé des archives)
  await p.locator(`#wch-list [data-action="wch-del"][data-id="${A3}"]`).click();
  await confirmer(p);
  await sleep(500);
  check(!(await p.evaluate((id) => window.__DB.hg_weekly_challenges.some((c) => c.id === id), A3)), 'suppression : challenge sans participation supprimé');
  check(await p.locator('#wch-list [data-action="wch-del"]').count() === 2, 'suppression : seuls les challenges sans participation restent supprimables (nouveau, mème du mois)');

  // Annulation du challenge en cours
  await ligne(p, 'La nuit en une image').locator('[data-action="wch-cancel"]').click();
  await confirmer(p);
  await sleep(500);
  check(await p.evaluate((id) => !!window.__DB.hg_weekly_challenges.find((c) => c.id === id).cancelled_at, CUR), 'annulation : cancelled_at posé');
  check(/Annulé/.test(await ligne(p, 'La nuit en une image').textContent()), 'annulation : pastille « Annulé »');
  check(!p.errs.length, `liste : aucune erreur console ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Fiche de suivi pendant le vote : retrait avec motif ---------- */
  p = await ouvrir(browser, { phase: 'vote' });
  await adminSection(p, `fabrique/challenges/${CUR}`);
  await p.waitForSelector('.chl-adm-row', { timeout: 6000 });
  check(await p.locator('.chl-adm-row').count() === 5, 'fiche : 5 participations');
  check(/David/.test(await p.textContent('.chl-adm-list')) && /photo-/.test(await p.textContent('.chl-adm-list')), 'fiche : pseudos et noms de fichier visibles par l’admin');
  check(/2 voix/.test(await p.textContent('.chl-stats')) || /voix sur/.test(await p.textContent('.chl-stats')), 'fiche : chiffres (voix, participants)');
  const bruno = p.locator('.chl-adm-row', { hasText: 'Bruno' });
  const path = await bruno.locator('[data-wch-path]').first().getAttribute('data-wch-path');
  await bruno.locator('[data-action="wch-rm"]').click();
  await p.waitForSelector('dialog.hg-dialog[open]', { timeout: 4000 });
  check(/Retirer la participation de Bruno/.test(await p.textContent('dialog.hg-dialog[open]')), 'retrait : confirmation nommée');
  check(/Sa voix est annulée/.test(await p.textContent('dialog.hg-dialog[open]')), 'retrait : la voix reçue est annoncée');
  await confirmer(p, 'image qui n’est pas de toi');
  await p.waitForFunction(() => document.querySelectorAll('.chl-adm-row').length === 4, null, { timeout: 5000 });
  L = await log(p);
  check(L.some((x) => x[0] === 'rpc' && x[1] === 'hg_wch_admin_remove' && x[2].p_reason === 'image qui n’est pas de toi'), 'retrait : motif envoyé à hg_wch_admin_remove');
  check(L.some((x) => x[0] === 'wch-remove' && x[1].includes(path)), 'retrait : fichier supprimé du bucket');
  check(await p.evaluate(() => window.__WCH.notifs.length) === 1, 'retrait : le membre est notifié');
  check(!p.errs.length, `fiche : aucune erreur console ${p.errs.join(' | ')}`);
  await p.ctx.close();

  /* ---------- Aucune voix : choix du gagnant ---------- */
  p = await ouvrir(browser, { phase: 'attente' });
  await adminSection(p, `fabrique/challenges/${CUR}`);
  await p.waitForSelector('.chl-pick', { timeout: 6000 });
  check(/Aucune voix : choisis le gagnant/.test(await p.textContent('.chl-pick')), 'attente : encadré « Aucune voix : choisis le gagnant »');
  check(await p.isDisabled('#wch-pick-go'), 'attente : bouton désactivé tant qu’aucun gagnant n’est choisi');
  await p.locator('.chl-adm-row', { hasText: 'Emma' }).locator('input[type="radio"]').check();
  check(await p.textContent('#wch-pick-go') === 'Désigner gagnant : Emma', 'attente : bouton « Désigner gagnant : Emma »');
  await p.click('#wch-pick-go');
  await confirmer(p);
  await p.waitForSelector('.adc-row-head .pill:has-text("Terminé")', { timeout: 5000 });
  L = await log(p);
  const pick = L.find((x) => x[0] === 'rpc' && x[1] === 'hg_wch_admin_pick');
  check(!!pick && !!pick[2].p_entry, 'attente : hg_wch_admin_pick reçoit la participation choisie');
  check(/Emma.*choisi par l’admin/.test(await p.textContent('.chl-fiche')), 'attente : gagnant « choisi par l’admin » affiché');
  await p.ctx.close();

  /* ---------- Téléphone 390 px ---------- */
  p = await ouvrir(browser, { phase: 'vote' }, { width: 390, height: 844, mobile: true });
  await adminSection(p, `fabrique/challenges/${CUR}`);
  await p.waitForSelector('.chl-adm-row', { timeout: 6000 });
  check(await hscroll(p) <= 0, 'téléphone : fiche sans défilement horizontal');
  await adminSection(p, 'fabrique/challenges');
  await p.waitForSelector('#wch-list .adc-row', { timeout: 6000 });
  check(await hscroll(p) <= 0, 'téléphone : liste sans défilement horizontal');
  await p.ctx.close();

  await browser.close();
  finish();
})().catch((e) => { console.error(e); process.exit(1); });
