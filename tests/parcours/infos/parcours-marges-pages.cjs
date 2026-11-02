// Parcours idée 71 : marges de page communes (jetons --page-pad, --page-top, --page-bas de base.css, un seul seuil à 600 px).
// Couvre : à 1280 et 390 px, l'en-tête de page (.page-head, et .ntf-tete des notifications) a le même haut et le même bas
// partout (48 / 28 au bureau, 28 / 20 au téléphone), le surtitre n'a pas de marges, les côtés du contenu valent 24 / 16 px ;
// l'accueil, les jeux et les mentions placent leur titre comme l'aide ; Notifications garde sa largeur de lecture (860 px) ;
// à 700 px (entre 601 et 760), Messages et Calendrier ont l'en-tête du bureau et le calendrier affiche sa grille ; à 600 px, la liste.
// Duels, Uno et admin ne sont pas concernés. Pas de défilement horizontal, aucune erreur console.
// Lancer : node tests/parcours/infos/parcours-marges-pages.cjs
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const U2 = '00000002-0000-4000-8000-000000000002';
const OUVERT = ['cartes', 'jeux', 'calendrier'].map((slug, i) => ({ slug, label: slug, mode: 'membres', in_nav: false, sort: 900 + i }));
const PAGES = [['accueil', '.page-head'], ['jeux', '.page-head'], ['messages', '.page-head'], ['notifications', '.ntf-tete'], ['calendrier', '.page-head', 'fake-sb-vd.mjs'], ['legal', '.page-head'], ['aide', '.page-head']];

// Mesures : marges de l'en-tête, du surtitre et du contenu ; distance entre le bas de l'en-tête du site et le haut du titre.
const mesure = (p, sel) => p.evaluate((sel) => {
  const head = document.querySelector(sel); if (!head) return null;
  const cs = getComputedStyle(head), ey = head.querySelector('.eyebrow'), ecs = ey && getComputedStyle(ey);
  const t = head.querySelector('.page-title'), hb = document.querySelector('.site-header').getBoundingClientRect().bottom;
  const main = document.querySelector('main.container, main .container, main');
  return { top: cs.paddingTop, bas: cs.paddingBottom, eyM: ecs ? `${ecs.marginTop} ${ecs.marginBottom}` : '-', cote: getComputedStyle(main).paddingLeft,
    titre: t ? Math.round(t.getBoundingClientRect().top + scrollY - hb) : null, larg: Math.round(head.parentElement.getBoundingClientRect().width) };
}, sel);

(async () => {
  const browser = await chromium.launch();
  const R = {};
  for (const w of [1280, 390]) {
    const [top, bas, cote] = w > 600 ? ['48px', '28px', '24px'] : ['28px', '20px', '16px'];
    for (const [slug, sel, fixture = 'fake-sb.mjs'] of PAGES) {
      const p = await openPage(browser, { page: slug, fixture, scenario: { uid: U2, pagesExtra: OUVERT }, width: w, height: 900, mobile: w < 800, reducedMotion: 'reduce' });
      await p.waitForSelector(`${sel} .page-title`, { timeout: 8000 }); await sleep(600);
      const m = R[`${slug}-${w}`] = await mesure(p, sel);
      check(m.top === top && m.bas === bas, `${slug} ${w} px : en-tête ${top} / ${bas} (${m.top} / ${m.bas})`);
      check(m.eyM === '0px 0px', `${slug} ${w} px : surtitre sans marges (${m.eyM})`);
      check(m.cote === cote, `${slug} ${w} px : marge de côté ${cote} (${m.cote})`);
      if (slug === 'notifications' && w === 1280) check(m.larg <= 860, `notifications : largeur de lecture gardée (${m.larg} px ≤ 860)`);
      check(await hscroll(p) <= 0, `${slug} ${w} px : pas de défilement horizontal`);
      check(p.errs.length === 0, `${slug} ${w} px : aucune erreur console` + (p.errs.length ? ' : ' + p.errs.join(' | ') : ''));
      await p.ctx.close();
    }
    // Même structure d'en-tête (surtitre + titre) : le titre tombe au même endroit
    for (const slug of ['accueil', 'legal']) check(R[`${slug}-${w}`].titre === R[`aide-${w}`].titre, `${w} px : titre de ${slug} placé comme celui de l'aide (${R[`${slug}-${w}`].titre} / ${R[`aide-${w}`].titre} px)`);
  }

  /* ---------- 700 px : en-tête du bureau, grille du calendrier ; 600 px : liste ---------- */
  for (const [slug, fixture] of [['messages', 'fake-sb.mjs'], ['calendrier', 'fake-sb-vd.mjs']]) {
    const p = await openPage(browser, { page: slug, fixture, scenario: { uid: U2, pagesExtra: OUVERT }, width: 700, height: 900, mobile: true, reducedMotion: 'reduce' });
    await p.waitForSelector('.page-head .page-title', { timeout: 8000 }); await sleep(600);
    const m = await mesure(p, '.page-head');
    check(m.top === '48px' && m.bas === '28px', `${slug} 700 px : en-tête du bureau 48 / 28 (${m.top} / ${m.bas})`);
    if (slug === 'calendrier') {
      await p.waitForSelector('#cal-grid [data-day]', { timeout: 8000 });
      check(await p.locator('.cal-grid-wrap').isVisible() && !(await p.locator('#cal-liste').isVisible()) && !(await p.locator('.cal-vue').isVisible()), 'calendrier 700 px : grille, ni liste ni choix Liste / Grille');
    }
    check(await hscroll(p) <= 0, `${slug} 700 px : pas de défilement horizontal`);
    await p.ctx.close();
  }
  const p = await openPage(browser, { page: 'calendrier', fixture: 'fake-sb-vd.mjs', width: 600, height: 900, mobile: true, reducedMotion: 'reduce' });
  await p.waitForSelector('#cal-liste .cal-jour', { timeout: 8000 });
  check(await p.locator('#cal-liste').isVisible() && !(await p.locator('.cal-grid-wrap').isVisible()) && await p.locator('.cal-vue').isVisible(), 'calendrier 600 px : liste et choix Liste / Grille');
  await p.ctx.close();

  await browser.close();
  finish();
})();
