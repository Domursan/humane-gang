// Parcours : carte agrandie de la Collection (/pages/cartes/cartes.html), mise en page de la carte et de sa fiche.
// Bogue corrigé : sur téléphone, quand la fiche est longue, la rangée de la carte était comprimée par la grille qui défile :
// la carte débordait sur la rareté, le titre et la description, et son haut passait sous l'en-tête.
// Vérifie, par mesure (getBoundingClientRect), pour toutes les cartes (familles, raretés, brillantes, manquantes, ×N) :
// 1. Téléphones 320 → 430 px (isMobile, deviceScaleFactor 2.6) : carte entière sous l'en-tête, au-dessus de la rareté et du titre,
//    sans défilement horizontal, après Suivant / Précédent, après un appui long (loupe) et après un pincement.
// 2. Ordinateur (1440 × 900 et 1024 × 640) : carte entière dans sa zone, à gauche de la fiche, sans chevauchement.
// Faux Supabase : fixtures/fake-sb-cartes.mjs (SET1 : 12 cartes, SET2 : 1 carte).
// Lancer : node tests/parcours/cartes/parcours-collection-detail.cjs
const fs = require('fs');
const path = require('path');
const { choisirFiltre, SHOTS, check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');
/** Ouvre un onglet de Cartes par son adresse : les onglets internes sont masqués (nouvel en-tête). */
const goTab = (p, id) => p.evaluate((id) => { if (location.hash === '#' + id) location.hash = ''; location.hash = id; }, id);

const SCN = { set2Open: true };

/** Mesures de la vue agrandie : en-tête, carte, rareté, titre, description, fiche, défilement horizontal. */
const mesures = (p) => p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
  const body = document.querySelector('#cz-dialog .cz-body');
  return {
    eb: document.querySelector('#cz-eyebrow')?.textContent || '',
    top: r('#cz-dialog .cz-top'), card: r('#cz-card .hgc'), rar: r('#cz-info .cz-rar'), title: r('#cz-info .cz-title'),
    flavor: r('#cz-info .cz-flavor'), info: r('#cz-info'), bar: r('#cz-dialog .cz-bar'),
    hs: body.scrollWidth - body.clientWidth, dhs: document.querySelector('#cz-dialog').scrollWidth - innerWidth,
  };
});

/** Problèmes de mise en page relevés (liste vide si tout va bien). mobile : une colonne (carte au-dessus de la fiche). */
function problemes(m, mobile) {
  const pb = [];
  const E = 0.5; // tolérance d'arrondi
  if (!m.card) return ['carte absente'];
  if (m.card.t < m.top.b - E) pb.push('carte sous l\'en-tête (' + Math.round(m.card.t) + ' < ' + Math.round(m.top.b) + ')');
  if (m.hs > 0 || m.dhs > 0) pb.push('défilement horizontal (' + m.hs + ' / ' + m.dhs + ')');
  if (mobile) {
    for (const k of ['rar', 'title', 'flavor', 'info']) {
      if (m[k] && m.card.b > m[k].t + E) pb.push('carte sur « ' + k + ' » (' + Math.round(m.card.b) + ' > ' + Math.round(m[k].t) + ')');
    }
    if (m.card.l < -E || m.card.r > m.top.r + E) pb.push('carte hors largeur');
  } else {
    if (m.card.r > m.info.l + E) pb.push('carte sur la fiche (' + Math.round(m.card.r) + ' > ' + Math.round(m.info.l) + ')');
    if (m.card.b > (m.bar && m.bar.t > 0 ? m.bar.t : 1e9) + E) pb.push('carte sur la barre');
  }
  return pb;
}

/** Parcourt toutes les cartes avec Suivant puis revient avec Précédent ; renvoie les problèmes par carte. */
async function parcourir(p, mobile, total) {
  const fautes = [];
  const sel = mobile ? '#cz-dialog .cz-bar-btn' : '#cz-dialog .cz-nav';
  for (let i = 0; i < total; i++) {
    const m = await mesures(p);
    const pb = problemes(m, mobile);
    if (pb.length) fautes.push(m.eb + ' : ' + pb.join(', '));
    if (mobile) await p.evaluate(() => { const b = document.querySelector('#cz-dialog .cz-body'); b.scrollTop = b.scrollHeight; }); // bas de la fiche, comme le doigt
    await p.click(sel + '[data-cz=next]');
    await sleep(60);
  }
  for (let i = 0; i < 3; i++) {
    await p.click(sel + '[data-cz=prev]');
    await sleep(60);
    const m = await mesures(p);
    const pb = problemes(m, mobile);
    if (pb.length) fautes.push('précédent ' + m.eb + ' : ' + pb.join(', '));
  }
  return fautes;
}

/** Ouvre la Collection « Toutes les séries » et la carte agrandie de la première carte. */
async function ouvrir(p, mobile) {
  await goTab(p, 'collection');
  await p.waitForSelector('#cartes-set', { state: 'attached', timeout: 5000 });
  await choisirFiltre(p, '#cartes-set', '__all__');
  await sleep(200);
  if (mobile) await p.tap('.cz-zoom[data-card="C1"]');
  else await p.click('.cz-zoom[data-card="C1"]');
  await p.waitForSelector('#cz-dialog[open]', { timeout: 3000 });
  await sleep(150);
  return Number(((await mesures(p)).eb.match(/\/ (\d+)$/) || [])[1] || 0);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  // ---------- 1. Téléphones ----------
  for (const [w, h] of [[320, 640], [360, 760], [390, 844], [412, 915], [430, 932]]) {
    const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: w, height: h, mobile: true, dpr: 2.6, scenario: SCN });
    const total = await ouvrir(p, true);
    check(total >= 13, w + ' px : toutes les cartes parcourues (' + total + ')');
    const fautes = await parcourir(p, true, total);
    check(!fautes.length, w + ' px : la carte ne chevauche ni l\'en-tête, ni la rareté, ni le titre, ni la description' + (fautes.length ? ' — ' + fautes.join(' | ') : ''));
    if (w === 412) {
      await p.screenshot({ path: path.join(SHOTS, 'collection-detail-412.png') });
      // Appui long : la loupe s'ouvre puis se referme, la mise en page ne bouge pas
      const cdp = await p.ctx.newCDPSession(p);
      const c = (await mesures(p)).card;
      const pt = { x: (c.l + c.r) / 2, y: (c.t + c.b) / 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
      await sleep(650);
      const loupe = await p.$eval('#cz-lens', (e) => !e.hidden);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(100);
      check(loupe, '412 px : appui long, loupe ×2,5 affichée');
      let pb = problemes(await mesures(p), true);
      check(!pb.length, '412 px : après la loupe, carte toujours en place' + (pb.length ? ' — ' + pb.join(', ') : ''));
      // Pincement (zoom natif) puis carte suivante : la mise en page reste juste
      await cdp.send('Input.synthesizePinchGesture', { x: pt.x, y: pt.y, scaleFactor: 2, relativeSpeed: 800, gestureSourceType: 'touch' }).catch(() => {});
      await sleep(300);
      const zoom = await p.evaluate(() => visualViewport.scale); // le pincement synthétique peut rester sans effet en headless : le test vérifie surtout l'état après
      await cdp.send('Input.synthesizePinchGesture', { x: pt.x, y: pt.y, scaleFactor: 0.5, relativeSpeed: 800, gestureSourceType: 'touch' }).catch(() => {});
      await sleep(300);
      await p.evaluate(() => { const b = document.querySelector('#cz-dialog .cz-body'); b.scrollTop = b.scrollHeight; document.querySelector('#cz-dialog .cz-bar-btn[data-cz=next]').click(); });
      await sleep(100);
      pb = problemes(await mesures(p), true);
      check(!pb.length, '412 px : après un pincement (échelle ' + zoom.toFixed(2) + ') et Suivant, carte en place' + (pb.length ? ' — ' + pb.join(', ') : ''));
      check((await p.evaluate(() => document.querySelector('#cz-dialog .cz-body').scrollTop)) === 0, '412 px : Suivant ramène la nouvelle carte en haut');
    }
    check(!p.errs.length, w + ' px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.ctx.close();
  }

  // ---------- 2. Ordinateur ----------
  for (const [w, h] of [[1440, 900], [1024, 640]]) {
    const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: w, height: h, scenario: SCN });
    const total = await ouvrir(p, false);
    const fautes = await parcourir(p, false, total);
    check(!fautes.length, w + ' × ' + h + ' : carte entière dans sa zone, sans chevaucher la fiche' + (fautes.length ? ' — ' + fautes.join(' | ') : ''));
    if (w === 1024) await p.screenshot({ path: path.join(SHOTS, 'collection-detail-1024.png') });
    check(!p.errs.length, w + ' px : aucune erreur JS' + (p.errs.length ? ' (' + p.errs.join(' | ') + ')' : ''));
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
