// Parcours : carte d'anniversaire commune (idée 52, migration 205).
// (a) J−2, vue d'un autre membre : la ligne de Chloé dans « Anniversaires à venir » propose de signer ; mots déjà écrits lisibles,
//     mot de moins de 15 caractères refusé sans appel, signature puis « Modifier mon mot » (champ prérempli).
// (b) J−2, vue de Chloé : rien (ni ligne, ni bandeau). (c) « Voir le site comme… » : rien non plus.
// (d) Jour J, Chloé : bandeau « Joyeux anniversaire », mur des mots ; avec un seul mot, pas de bandeau. 390 px sans défilement.
// (e) Compte de Chloé après le jour J : « Mes souvenirs », case de refus enregistrée ; ligne « cartes communes » des notifications.
// Faux Supabase : fixtures/fake-sb-anniv.mjs. Lancer : node tests/parcours/compte/parcours-carte-anniv.cjs
const { check, finish, openPage, hscroll, chromium, SHOTS } = require('../../lib/harness.cjs');

const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const FX = 'fake-sb-anniv.mjs';
/** Date de Zurich décalée de n jours (« AAAA-MM-JJ »). */
const jour = (n) => { const t = new Date(Date.now() + n * 864e5); return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(t); };
const dm = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`;
const MOTS = [
  { auteur_id: U(3), texte: 'Joyeux anniversaire ! Encore merci pour la rando au lac.' },
  { auteur_id: U(5), texte: 'Bon anniv ! Promis, cette année je te bats au Uno.' },
  { auteur_id: U(6), texte: 'La meilleure voisine de raclette du gang. Belle année !' },
];
const scn = (n, mots, extra = {}) => ({ bdays: { [U(4)]: dm(jour(n)) }, cartes: [{ id: 41, fete_id: U(4), jour: jour(n), mots }], ...extra });
const attendre = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 6000 }).then(() => true, () => false);
const ligne = '#bdays .bday[data-membre="' + U(4) + '"]';

(async () => {
  const browser = await chromium.launch();
  try {
    /* (a) J−2, Ethan signe la carte de Chloé */
    {
      const p = await openPage(browser, { page: 'accueil', fixture: FX, scenario: scn(2, MOTS.slice(0, 2)) });
      await p.emulateMedia({ colorScheme: 'dark' });
      check(await attendre(p, (s) => !!document.querySelector(`${s} .bday-carte`), ligne), '(a) ligne de Chloé : carte commune');
      check((await p.textContent(`${ligne} .bday-carte`)).includes('Sa carte commune : 2 mots'), '(a) texte : 2 mots');
      await p.screenshot({ path: `${SHOTS}/anniv-ligne-1280.png` });
      await p.click(`${ligne} .bday-carte .btn`);
      check(await attendre(p, () => !!document.querySelector('#anv-dlg[open]')), '(a) boîte « Signer la carte » ouverte');
      check((await p.$$('#anv-dlg .anv-mot')).length === 2, '(a) les 2 mots déjà écrits sont lisibles');
      check((await p.textContent('#anv-dlg')).includes('découvrira la carte ce jour-là'), '(a) rappel de la surprise');
      await p.screenshot({ path: `${SHOTS}/anniv-signer-1280.png` });
      await p.fill('#anv-txt', 'Joyeux anniv !');
      await p.click('#anv-dlg [type=submit]');
      check(await p.isVisible('#anv-err') && (await p.getAttribute('#anv-txt', 'aria-invalid')) === 'true', '(a) moins de 15 caractères : message, champ signalé');
      check(!(await p.evaluate(() => window.__LOG.some((l) => l[1] === 'hg_carte_anniv_signer'))), '(a) moins de 15 caractères : aucun appel');
      await p.fill('#anv-txt', 'Plein de belles choses pour ton anniversaire, et une sortie surprise en décembre…');
      const n = (await p.inputValue('#anv-txt')).length;
      check((await p.textContent('#anv-nb')) === `${n} / 280`, `(a) compteur de caractères (${n} / 280)`);
      await p.click('#anv-dlg [type=submit]');
      check(await attendre(p, () => !document.querySelector('#anv-dlg')), '(a) boîte fermée après la signature');
      check(await attendre(p, (s) => document.querySelector(`${s} .bday-carte`)?.textContent.includes('Tu as signé sa carte commune · 3 mots'), ligne), '(a) ligne : signée, 3 mots');
      check((await p.textContent(`${ligne} .bday-carte .btn`)).trim() === 'Modifier mon mot', '(a) bouton « Modifier mon mot »');
      await p.click(`${ligne} .bday-carte .btn`);
      await attendre(p, () => !!document.querySelector('#anv-dlg[open]'));
      check((await p.inputValue('#anv-txt')).startsWith('Plein de belles choses'), '(a) modifier : mon mot prérempli');
      check((await p.$$('#anv-dlg .anv-mot')).length === 2, '(a) modifier : mon mot n’est pas dans la liste des autres');
      await p.click('#anv-dlg [data-anv-annuler]');
      check(await attendre(p, () => !document.querySelector('#anv-dlg')), '(a) Annuler ferme la boîte');
      check(!(await p.$('.anv-ban')), '(a) pas de bandeau pour Ethan');
      check(!p.errs.length, '(a) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
      await p.ctx.close();
    }
    /* (a bis) 390 px, clair */
    {
      const p = await openPage(browser, { page: 'accueil', fixture: FX, scenario: scn(2, MOTS.slice(0, 2)), width: 390, height: 844 });
      await attendre(p, (s) => !!document.querySelector(`${s} .bday-carte`), ligne);
      await p.locator(ligne).scrollIntoViewIfNeeded();
      check(await hscroll(p) === 0, '(a) 390 px : pas de défilement horizontal');
      const h = await p.$eval(`${ligne} .bday-carte .btn`, (b) => b.getBoundingClientRect().height);
      check(h >= 44, `(a) 390 px : bouton de 44 px au moins (${h})`);
      await p.screenshot({ path: `${SHOTS}/anniv-ligne-390.png` });
      await p.click(`${ligne} .bday-carte .btn`);
      await attendre(p, () => !!document.querySelector('#anv-dlg[open]'));
      check(await hscroll(p) === 0, '(a) 390 px : boîte sans défilement horizontal');
      await p.screenshot({ path: `${SHOTS}/anniv-signer-390.png` });
      await p.ctx.close();
    }
    /* (b) J−2, Chloé ne voit rien */
    {
      const p = await openPage(browser, { page: 'accueil', fixture: FX, scenario: { ...scn(2, MOTS), uid: U(4) } });
      await attendre(p, () => window.__LOG?.some((l) => l[1] === 'hg_carte_anniv_ouvertes'));
      await p.waitForTimeout(300);
      check(!(await p.$('.bday-carte')) && !(await p.$('.anv-ban')), '(b) Chloé avant le jour J : ni ligne ni bandeau');
      const r = await p.evaluate(async () => (await import('/assets/commun/core.js')).sb.rpc('hg_carte_anniv', { p_carte: 41 }));
      check(!!r.error && /Surprise/.test(r.error.message), '(b) lecture directe refusée avant le jour J');
      await p.ctx.close();
    }
    /* (c) « Voir le site comme… » : la carte ne s'affiche pas */
    {
      const p = await openPage(browser, { page: 'accueil', fixture: FX, scenario: scn(2, MOTS),
        init: { content: `sessionStorage.setItem('hg_view_as', JSON.stringify({ id: '${U(2)}', pseudo: 'Alice', is_admin: false, roles: [], pages: [] }))` } });
      await attendre(p, () => !!document.querySelector('.view-as-bar'));
      await p.waitForTimeout(800);
      check(!(await p.$('.bday-carte')) && !(await p.$('.anv-ban')), '(c) vue « comme Alice » : aucune carte');
      check(!(await p.evaluate(() => window.__LOG.some((l) => l[1] === 'hg_carte_anniv_ouvertes'))), '(c) vue « comme Alice » : aucune lecture de carte');
      await p.ctx.close();
    }
    /* (d) Jour J, Chloé : bandeau et mur ; un seul mot : pas de bandeau */
    {
      const p = await openPage(browser, { page: 'accueil', fixture: FX, scenario: { ...scn(0, MOTS), uid: U(4) } });
      await p.emulateMedia({ colorScheme: 'dark' });
      check(await attendre(p, () => !!document.querySelector('.anv-ban')), '(d) jour J : bandeau');
      check((await p.textContent('.anv-ban h2')).includes('Joyeux anniversaire Chloé'), '(d) bandeau : prénom');
      check((await p.textContent('.anv-ban')).includes('3 membres du gang'), '(d) bandeau : nombre de mots');
      await p.screenshot({ path: `${SHOTS}/anniv-bandeau-1280.png` });
      await p.click('#anv-ban-ouvrir');
      check(await attendre(p, () => document.querySelectorAll('#anv-mur[open] .anv-carte').length === 3), '(d) mur : 3 mots');
      check((await p.textContent('#anv-mur')).includes('Mes souvenirs'), '(d) mur : renvoi à « Mes souvenirs »');
      await p.screenshot({ path: `${SHOTS}/anniv-mur-1280.png` });
      await p.click('#anv-mur [data-anv-fermer]');
      check(await attendre(p, () => !document.querySelector('#anv-mur')), '(d) Fermer');
      check(!p.errs.length, '(d) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
      await p.ctx.close();
      const t = await openPage(browser, { page: 'accueil', fixture: FX, scenario: { ...scn(0, MOTS), uid: U(4) }, width: 390, height: 844 });
      await attendre(t, () => !!document.querySelector('.anv-ban'));
      check(await hscroll(t) === 0, '(d) 390 px : bandeau sans défilement horizontal');
      await t.screenshot({ path: `${SHOTS}/anniv-bandeau-390.png` });
      await t.click('#anv-ban-ouvrir');
      await attendre(t, () => !!document.querySelector('#anv-mur[open]'));
      check(await hscroll(t) === 0, '(d) 390 px : mur sans défilement horizontal');
      await t.screenshot({ path: `${SHOTS}/anniv-mur-390.png` });
      await t.ctx.close();
      const u = await openPage(browser, { page: 'accueil', fixture: FX, scenario: { ...scn(0, MOTS.slice(0, 1)), uid: U(4) } });
      await attendre(u, () => window.__LOG?.some((l) => l[1] === 'hg_carte_anniv_ouvertes'));
      await u.waitForTimeout(300);
      check(!(await u.$('.anv-ban')), '(d) un seul mot : pas de bandeau');
      await u.ctx.close();
      // Jour J vu d'un autre membre : « Carte remise ce matin »
      const v = await openPage(browser, { page: 'accueil', fixture: FX, scenario: scn(0, MOTS) });
      await attendre(v, (s) => !!document.querySelector(`${s} .bday-carte`), ligne);
      check((await v.textContent(`${ligne} .bday-carte`)).includes('Carte remise ce matin · 3 mots'), '(d) autres membres le jour J : « Carte remise ce matin »');
      await v.ctx.close();
    }
    /* (e) Compte de Chloé : « Mes souvenirs » et refus */
    {
      const p = await openPage(browser, { page: 'compte', fixture: FX, scenario: { ...scn(-5, MOTS), uid: U(4) } });
      check(await attendre(p, () => !document.querySelector('#souvenirs')?.hidden), '(e) « Mes souvenirs » affiché');
      check((await p.textContent('#souvenirs')).includes('Ta carte d’anniversaire'), '(e) ma carte dans les souvenirs');
      await p.click('#souvenirs [data-anv-souv]');
      check(await attendre(p, () => document.querySelectorAll('#anv-mur[open] .anv-carte').length === 3), '(e) relire la carte depuis le compte');
      await p.keyboard.press('Escape');
      check(await p.isChecked('#pf-carte-anniv'), '(e) case « carte commune » cochée par défaut');
      await p.uncheck('#pf-carte-anniv');
      await p.click('#profile-form [type=submit]');
      check(await attendre(p, (id) => window.__DB.hg_profiles.find((x) => x.id === id)?.carte_anniv === false, U(4)), '(e) refus enregistré dans le profil');
      check(await attendre(p, () => !!document.querySelector('.np-sw[data-key="anniversaires.site"]')), '(e) notifications : ligne « cartes communes » (site)');
      check(!p.errs.length, '(e) aucune erreur JS' + (p.errs.length ? ` (${p.errs.join(' | ')})` : ''));
      await p.ctx.close();
      const q = await openPage(browser, { page: 'compte', fixture: FX, scenario: { uid: U(5) } });
      await attendre(q, () => window.__LOG?.some((l) => l[1] === 'hg_carte_anniv_souvenirs'));
      await q.waitForTimeout(300);
      check(await q.$eval('#souvenirs', (s) => s.hidden), '(e) sans carte : « Mes souvenirs » masqué');
      await q.ctx.close();
    }
  } finally {
    await browser.close();
  }
  finish();
})();
