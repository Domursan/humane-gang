// Parcours des places du Uno avec beaucoup d'adversaires (maquette validée du 3 novembre) : de 7 à 12, places en ligne ; de
// 13 à 19 (partie de 20 places), photo et pastille du nombre de cartes ; aucune place n'en recouvre une autre ni le centre de
// la table ; jusqu'à 6, rien ne change ; les places suivent quand la table change de taille ; téléphone : rangée qui défile,
// « N cartes » en toutes lettres. Faux serveur : fixtures/fake-uno-table.js.
const { check, finish, openPage, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const UNO_PAGE = { slug: 'uno', label: 'Uno', mode: 'membres', in_nav: false, sort: 900 };
const NOMS = ['Idola', 'Bouba', 'Terrow', 'AngelS35S', 'Carzy', 'Nagarythe', 'Poufsouffs', 'Wae', 'Mycethyst', 'Izinsalea',
  'Kalimero', 'Zephyrine', 'Oscarine', 'Pimprenelle', 'Rustique', 'Tobogan', 'Ulysse', 'Valkyria', 'Xylo'];

/** Ouvre la table puis la remplit de n adversaires (un sur trois invité, le premier joue). */
async function table(browser, n, width, height) {
  const p = await openPage(browser, { page: 'uno', init: 'fake-uno-table.js', hash: '#partie/HGUNO-4242', width, height, scenario: { pagesExtra: [UNO_PAGE] } });
  await p.waitForSelector('.uno-fan-carte button', { timeout: 8000 });
  await p.evaluate(({ n, NOMS }) => {
    window.__UNO.modifier((E) => {
      const me = E.joueurs[0];
      E.partie.nb_places = 20;
      E.joueurs = [me, ...NOMS.slice(0, n).map((pseudo, i) => ({ ...E.joueurs[1], user_id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
        pseudo, invite: i % 3 === 0, place: i + 2, nb_cartes: 4 + (i % 4) }))];
      E.partie.tour = E.joueurs[1].user_id;
    });
  }, { n, NOMS });
  await p.waitForFunction((n) => document.querySelectorAll('.uno-siege').length === n, n, { timeout: 5000 });
  await sleep(400);
  return p;
}

/** Paires de places qui se recouvrent (de plus de 6 px dans les deux sens) et places posées sur les cartes du centre. */
const mesure = (p) => p.evaluate(() => {
  const b = [...document.querySelectorAll('.uno-siege')].map((li) => li.getBoundingClientRect());
  const recouvre = (a, c, m) => Math.min(a.right, c.right) - Math.max(a.left, c.left) > m && Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top) > m;
  let paires = 0;
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (recouvre(b[i], b[j], 6)) paires++;
  const pile = document.querySelector('.uno-pile')?.getBoundingClientRect();
  const surPile = pile ? b.filter((a) => recouvre(a, pile, 2)).length : 0;
  const plateau = document.querySelector('.uno-plateau').getBoundingClientRect();
  const dehors = b.filter((a) => a.left < plateau.left - 1 || a.right > plateau.right + 1 || a.top < plateau.top - 1 || a.bottom > plateau.bottom + 1).length;
  return { paires, surPile, dehors, h: Math.max(...b.map((a) => a.height)) };
});

(async () => {
  const browser = await chromium.launch();
  try {
    // 10 adversaires, ordinateur : places en ligne, rien ne se recouvre.
    let p = await table(browser, 10, 1280, 900);
    let m = await mesure(p);
    check(await p.locator('.uno-siege.uno-serre').count() === 10, '10 adversaires : places en ligne');
    check(m.paires === 0, `10 adversaires, 1280 px : aucune place recouverte (${m.paires})`);
    check(m.surPile === 0 && m.dehors === 0, `10 adversaires : rien sur la pioche ni hors de la table (${m.surPile}, ${m.dehors})`);
    check(m.h <= 60, `10 adversaires : places basses (${Math.round(m.h)} px)`);
    check(await p.locator('.uno-siege.est-tour .uno-joue').isVisible(), '« Joue » visible sur la place du joueur actif');
    const inv = p.locator('.uno-siege.est-invite').first();
    check(await inv.count() === 1 && /invité/.test(await inv.textContent()), 'invité : le mot reste dans la place (lu par les lecteurs d\'écran)');
    check(/\d cartes/.test(await p.locator('.uno-siege [data-nb]').first().innerText()), '10 adversaires : « N cartes » en toutes lettres');
    // Chat masqué : la table s'élargit, les places suivent sans être recréées.
    const avant = await p.locator('.uno-siege').nth(2).getAttribute('style');
    await p.click('.uno-bouton-chat');
    await sleep(500);
    m = await mesure(p);
    check(m.paires === 0 && m.dehors === 0, `chat masqué : places replacées sans recouvrement (${m.paires}, ${m.dehors})`);
    check(await p.locator('.uno-siege').nth(2).getAttribute('style') !== avant, 'chat masqué : les places glissent à leur nouvelle place');
    await p.ctx.close();

    // 10 adversaires, grand écran (capture d'Ethan).
    p = await table(browser, 10, 1920, 1080);
    m = await mesure(p);
    check(m.paires === 0 && m.surPile === 0, `10 adversaires, 1920 px : aucune place recouverte (${m.paires}, ${m.surPile})`);
    await p.ctx.close();

    // 19 adversaires (le maximum), portable peu haut : photo, pastille, pseudo.
    p = await table(browser, 19, 1280, 800);
    m = await mesure(p);
    check(await p.locator('.uno-siege.uno-mini').count() === 19, '19 adversaires : places réduites à la photo');
    check(m.surPile === 0 && m.dehors === 0, `19 adversaires : rien sur la pioche ni hors de la table (${m.surPile}, ${m.dehors})`);
    const noms = await p.evaluate(() => {
      // Chaque pseudo reste lisible : son centre n'est couvert par aucune autre place.
      const lis = [...document.querySelectorAll('.uno-siege')];
      return lis.filter((li) => {
        const r = li.querySelector('.uno-siege-nom strong').getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el && li.contains(el);
      }).length;
    });
    check(noms === 19, `19 adversaires : les 19 pseudos sont visibles (${noms})`);
    check(await p.locator('.uno-siege.uno-mini .uno-mini-dos').first().isHidden(), '19 adversaires : nombre de cartes en pastille');
    await p.ctx.close();

    // 6 adversaires : grandes places, comme avant.
    p = await table(browser, 6, 1280, 900);
    check(await p.locator('.uno-siege.uno-serre, .uno-siege.uno-mini').count() === 0, '6 adversaires : grandes places inchangées');
    check((await mesure(p)).paires === 0, '6 adversaires : aucune place recouverte');
    await p.ctx.close();

    // Téléphone, 14 adversaires : rangée qui défile, « N cartes » en toutes lettres, pas de défilement de la page.
    p = await table(browser, 14, 390, 844);
    check(await p.evaluate(() => getComputedStyle(document.querySelector('.uno-sieges')).display) === 'flex', 'téléphone : places en rangée');
    check(/\d cartes/.test(await p.locator('.uno-siege [data-nb]').first().innerText()), 'téléphone : « N cartes » en toutes lettres');
    check(await hscroll(p) <= 0, 'téléphone : pas de défilement horizontal de la page');
    check(p.errs.length === 0, 'aucune erreur JS' + (p.errs.length ? ' (' + p.errs.slice(0, 3).join(' | ') + ')' : ''));
    await p.ctx.close();
  } catch (e) {
    check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]);
  } finally {
    await browser.close();
  }
  finish();
})();
