// Parcours : vitrine en image (idée 58), sur la fiche membre (/pages/compte/membre.html), faux Supabase des cartes
// (fixtures/fake-sb-cartes.mjs, scenario.vitrine = exemplaires en vitrine).
// 1. Sa propre fiche : bouton « Créer une image » à côté de « Modifier ma vitrine » ; la fiche d'un autre membre ne l'a pas.
// 2. Fenêtre d'aperçu : image de 1080 × 1350, « Collection d’Ethan », « Ma vitrine » (3 cartes), « Mes plus rares »,
//    4 chiffres, progression par série, aucun pseudo d'un autre membre (cartes de membres écartées), aucun lien.
// 3. « Télécharger l’image » : un fichier PNG de 1080 × 1350 est téléchargé, sans requête vers un autre site.
// 4. Vitrine vide : « Mes plus belles cartes » (les 3 plus rares). 5. 390 px : pas de défilement, boutons de 44 px.
// Lancer : node tests/parcours/compte/parcours-vitrine-image.cjs
const fs = require('fs');
const { openPage, check, finish, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const FIXTURE = 'fake-sb-cartes.mjs';
const AUTRES = ['Alice', 'Bruno', 'Chloé', 'David', 'Emma'];
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const ouvrir = (b, vitrine, o = {}) => openPage(b, { page: 'membre', fixture: FIXTURE, scenario: { vitrine }, ...o });
/** Ouvre la fenêtre de l'image et attend l'aperçu. */
const fenetre = async (p) => {
  await p.waitForSelector('.shw-img', { timeout: 8000 });
  await p.click('.shw-img');
  await p.waitForSelector('dialog.vi-dlg[open] .vimg', { timeout: 8000 }).catch(() => {});
  await sleep(300);
};
/** Contenu de l'image affichée dans la fenêtre. */
const image = (p) => p.evaluate(() => {
  const v = document.querySelector('dialog.vi-dlg[open] .vimg');
  if (!v) return null;
  return {
    w: v.offsetWidth, h: v.offsetHeight, texte: v.textContent.replace(/\s+/g, ' '),
    nom: v.querySelector('.vimg-nom')?.textContent, titres: [...v.querySelectorAll('.vimg-h')].map((x) => x.textContent),
    grandes: v.querySelectorAll('.vimg-grandes .hgc').length, petites: v.querySelectorAll('.vimg-petites .hgc').length,
    chiffres: v.querySelectorAll('.vimg-chiffres li').length, series: v.querySelectorAll('.vimg-series li').length,
    liens: document.querySelectorAll('dialog.vi-dlg[open] a[href]').length,
    apercu: document.querySelector('.vi-apercu').getBoundingClientRect().width,
  };
});

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. Bouton sur sa propre fiche seulement ----------
  let p = await ouvrir(browser, [7, 5, 4]);
  await p.waitForSelector('.shw-slots', { timeout: 8000 }).catch(() => {});
  const btns = await p.evaluate(() => [...document.querySelectorAll('.shw-head .shw-btns button')].map((b) => b.textContent.trim()));
  check(JSON.stringify(btns) === JSON.stringify(['Créer une image', 'Modifier ma vitrine']), `sa fiche : boutons ${btns.join(' / ')}`);
  check(await p.evaluate(() => document.querySelectorAll('.shw-slots .hgc').length) === 3, 'sa fiche : vitrine de 3 cartes');

  // ---------- 2. Fenêtre d'aperçu ----------
  const requetes = [];
  const origine = new URL(p.url()).origin;
  p.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && u.origin !== origine) requetes.push(r.url()); });
  await fenetre(p);
  let e = await image(p);
  check(!!e, 'fenêtre : aperçu affiché');
  check(e?.w === 1080 && e.h === 1350, `fenêtre : image de 1080 × 1350 (${e?.w} × ${e?.h})`);
  check(e?.apercu > 0 && e.apercu <= 560, `fenêtre : aperçu réduit à la fenêtre (${e?.apercu} px)`);
  check(e?.nom === 'Collection d’Ethan', `fenêtre : titre (« ${e?.nom} »)`);
  check(e?.titres.join('|') === 'Ma vitrine|Mes plus rares|Progression par série', `fenêtre : sections (${e?.titres.join(', ')})`);
  check(e?.grandes === 3 && e.petites >= 1 && e.petites <= 5, `fenêtre : 3 grandes cartes, ${e?.petites} petites`);
  check(e?.chiffres === 4 && e.series >= 1 && e.series <= 4, 'fenêtre : 4 chiffres et la progression par série');
  check(AUTRES.every((n) => !e?.texte.includes(n)), 'fenêtre : aucun pseudo d’un autre membre');
  check(e?.liens === 0 && /aucun lien n’est créé/.test(await p.textContent('dialog.vi-dlg[open]')), 'fenêtre : aucun lien, et c’est dit');

  // ---------- 3. Téléchargement ----------
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }).catch(() => null), p.click('dialog.vi-dlg[open] [data-dl]')]);
  check(!!dl, 'téléchargement : un fichier est proposé');
  if (dl) {
    check(dl.suggestedFilename() === 'collection-humane-gang.png', `téléchargement : nom ${dl.suggestedFilename()}`);
    const f = await dl.path();
    const b = fs.readFileSync(f);
    const png = b.slice(1, 4).toString() === 'PNG';
    check(png && b.readUInt32BE(16) === 1080 && b.readUInt32BE(20) === 1350, `téléchargement : PNG de ${b.readUInt32BE(16)} × ${b.readUInt32BE(20)}`);
  }
  check(requetes.length === 0, `aucune requête vers un autre site (${requetes.slice(0, 3).join(' ')})`);
  check(p.errs.length === 0, `aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.keyboard.press('Escape');
  await sleep(200);
  check(await p.evaluate(() => !document.querySelector('dialog.vi-dlg')), 'Échap ferme la fenêtre');

  // ---------- 1 bis. Fiche d'un autre membre : pas de bouton ----------
  await p.goto(p.url().split('?')[0].split('#')[0] + '?id=' + U(2));
  await sleep(1500);
  check(await p.evaluate(() => !document.querySelector('.shw-img')), 'fiche d’un autre membre : pas de « Créer une image »');
  await p.ctx.close();

  // ---------- 4. Vitrine vide ----------
  p = await ouvrir(browser, []);
  await fenetre(p);
  e = await image(p);
  check(e?.titres[0] === 'Mes plus belles cartes' && e.grandes === 3, `vitrine vide : les 3 plus rares (${e?.titres.join(', ')})`);
  check(e?.titres[1] === 'Et aussi', 'vitrine vide : « Et aussi »');
  check(AUTRES.every((n) => !e?.texte.includes(n)), 'vitrine vide : aucun pseudo d’un autre membre');
  await p.ctx.close();

  // ---------- 5. Téléphone, sombre et clair ----------
  for (const mode of ['sombre', 'clair']) {
    const prefs = mode === 'clair' ? { mode: 'clair' } : {};
    p = await ouvrir(browser, [7, 5, 4], { width: 390, height: 844, touch: true, init: { content: `try{localStorage.setItem('hg_prefs',${JSON.stringify(JSON.stringify(prefs))})}catch(e){}` } });
    await fenetre(p);
    check(await hscroll(p) === 0, `390 px ${mode} : pas de défilement horizontal`);
    const m = await p.evaluate(() => ({
      btn: Math.min(...[...document.querySelectorAll('dialog.vi-dlg[open] .vi-actions .btn:not([hidden])')].map((b) => b.getBoundingClientRect().height)),
      larg: document.querySelector('dialog.vi-dlg[open]').getBoundingClientRect().width,
      img: document.querySelector('.shw-img').getBoundingClientRect().height,
    }));
    check(m.btn >= 44 && m.img >= 44, `390 px ${mode} : boutons de 44 px au moins (${m.btn}, ${m.img})`);
    check(m.larg <= 390, `390 px ${mode} : la fenêtre tient dans l’écran (${m.larg})`);
    check(p.errs.length === 0, `390 px ${mode} : aucune erreur (${p.errs.join(' | ') || 'rien'})`);
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
