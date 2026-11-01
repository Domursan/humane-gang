// Parcours : plateau de l'accueil du panel et tuiles d'une page de lieu (assets/espaces/admin/lieux.js, admin-lieux.css), idée 79.
// - Lieux absents (droits) : la disposition par défaut se resserre (4 en 2 + 2, 5 en 3 + 2, 6 en 3 + 3, Mairie en bande pleine
//   en bas), 7 lieux inchangé ; une disposition enregistrée reste telle quelle ; la route relie les cases affichées.
// - Mode disposition d'un compte qui ne voit pas tous les lieux : seules ses cases gênent, les cases cachées recouvertes passent dessous.
// - Tuiles : autant de colonnes que la largeur en permet (6 au plus), lignes de même nombre à une tuile près, étirées ;
//   3, 5 et 7 tuiles à 1280, 1600 et 1920 px.
// Les sous-ensembles de lieux sont montés par renderPlateau(div, lieux) dans la page, sur le vrai module.
// Lancer : node tests/parcours/admin/parcours-admin-plateau-resserre.cjs
const { ROOT, check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');

const FIX = 'fake-sb-cartes.mjs';
const HORS_MAIRIE = ['place', 'poste', 'ventes', 'camp', 'fabrique', 'fete'];
const BANDE = '{"x":0,"y":4,"w":12,"h":1}';

/** Monte le plateau pour ces lieux dans #plateau-root ; renvoie, par lieu, { x, y, w, h } lus sur le style des cases, et le nombre de points de la route. */
const monter = (p, ids) => p.evaluate(async (liste) => {
  const [{ renderPlateau }, { LIEUX }] = await Promise.all([import('/assets/espaces/admin/lieux.js'), import('/assets/espaces/admin/perms.js')]);
  const root = document.getElementById('plateau-root');
  await renderPlateau(root, LIEUX.filter((l) => liste.includes(l.id)));
  await new Promise((r) => setTimeout(r, 150));
  const cells = {};
  for (const c of root.querySelectorAll('.plateau-cell')) {
    const [a, b] = c.style.gridColumn.split('/ span ').map(Number), [d, e] = c.style.gridRow.split('/ span ').map(Number);
    cells[c.dataset.lieu] = { x: a - 1, y: d - 1, w: b, h: e };
  }
  const trace = root.querySelector('.plateau-road path')?.getAttribute('d') || '';
  return { cells, points: trace ? trace.split('L').length : 0 };
}, ids);
/** « x:largeur » de chaque case d'une rangée, de gauche à droite. */
const rang = (cells, y) => Object.values(cells).filter((c) => c.y === y).sort((a, b) => a.x - b.x).map((c) => `${c.x}:${c.w}`).join(' ');

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'admin', fixture: FIX, width: 1280, height: 900 });
  await p.waitForSelector('.plateau-cell');

  // 1. Disposition par défaut resserrée
  const sept = await monter(p, [...HORS_MAIRIE, 'mairie']);
  check(rang(sept.cells, 0) === '0:4 4:4 8:4' && rang(sept.cells, 2) === '0:4 4:4 8:4' && JSON.stringify(sept.cells.mairie) === BANDE, '7 lieux : disposition inchangée (3 + 3, Mairie en bande en bas)');
  check(sept.points === 7, '7 lieux : la route relie les 7 cases');
  let r = await monter(p, ['place', 'poste', 'ventes', 'camp']);
  check(rang(r.cells, 0) === '0:6 6:6' && rang(r.cells, 2) === '0:6 6:6' && Object.keys(r.cells).length === 4, '4 lieux : 2 + 2, sans trou');
  check(r.points === 4, '4 lieux : la route relie les 4 cases');
  r = await monter(p, ['place', 'poste', 'ventes', 'camp', 'fabrique']);
  check(rang(r.cells, 0) === '0:4 4:4 8:4' && rang(r.cells, 2) === '0:6 6:6', '5 lieux : 3 + 2, la seconde rangée étirée');
  r = await monter(p, HORS_MAIRIE);
  check(rang(r.cells, 0) === '0:4 4:4 8:4' && rang(r.cells, 2) === '0:4 4:4 8:4', '6 lieux sans Mairie : 3 + 3');
  r = await monter(p, ['place', 'poste', 'ventes', 'camp', 'mairie']);
  check(rang(r.cells, 0) === '0:6 6:6' && rang(r.cells, 2) === '0:6 6:6' && JSON.stringify(r.cells.mairie) === BANDE, '4 lieux + Mairie : 2 + 2, Mairie en bande pleine en bas');
  r = await monter(p, ['place', 'poste', 'ventes', 'camp', 'fabrique', 'mairie']);
  check(rang(r.cells, 0) === '0:4 4:4 8:4' && rang(r.cells, 2) === '0:6 6:6' && JSON.stringify(r.cells.mairie) === BANDE, '5 lieux + Mairie : 3 + 2, Mairie en bande pleine');
  r = await monter(p, ['place', 'poste', 'ventes']);
  check(rang(r.cells, 0) === '0:4 4:4 8:4' && Object.keys(r.cells).length === 3, '3 lieux : une rangée de 3');
  const hauts = await p.evaluate(() => [...document.querySelectorAll('#plateau-root .plateau-cell')].map((c) => Math.round(c.getBoundingClientRect().top)));
  check(new Set(hauts).size === 1, '3 lieux : sur une seule ligne à l\'écran');

  // 2. Une disposition enregistrée reste telle quelle (« Modifier la disposition » puis Enregistrer)
  await p.evaluate(async () => {
    const { sb } = await import('/assets/commun/core.js');
    const rpc = sb.rpc.bind(sb);
    sb.rpc = (fn, a) => (fn === 'hg_admin_plateau_set' ? Promise.resolve({ data: (window.__envoi = a.p), error: null }) : rpc(fn, a));
  });
  await monter(p, [...HORS_MAIRIE, 'mairie']);
  await p.click('#plateau-root [data-plateau-edit]');
  await p.click('#plateau-root [data-plateau-save]');
  await sleep(300);
  r = await monter(p, ['place', 'poste', 'ventes', 'camp']);
  check(rang(r.cells, 0) === '0:4 4:4 8:4' && rang(r.cells, 2) === '0:4' && Object.keys(r.cells).length === 4, 'disposition enregistrée : 4 lieux gardent leurs places d\'origine (pas de resserrage)');

  // 3. Compte qui ne voit pas tous les lieux : une case cachée ne gêne pas, et l'enregistrement la replace
  await monter(p, ['place', 'poste']);
  await p.click('#plateau-root [data-plateau-edit]');
  await p.focus('.plateau-cell[data-lieu="poste"]');
  await p.keyboard.press('ArrowRight');
  const live = await p.$eval('[data-plateau-live]', (e) => e.textContent.trim());
  check(live.startsWith('La Poste') && !/Impossible|chevauche/.test(live), `case cachée à cette place : déplacement accepté, aucun lieu invisible nommé (${live})`);
  await p.keyboard.press('ArrowLeft');
  await p.keyboard.press('ArrowLeft');
  check(/^Impossible : .* chevauche « /.test(await p.$eval('[data-plateau-live]', (e) => e.textContent.trim())), 'une case affichée reste un obstacle');
  await p.keyboard.press('ArrowRight');
  await p.click('#plateau-root [data-plateau-save]');
  await sleep(300);
  const envoi = await p.evaluate(() => window.__envoi.cells);
  const noms = Object.keys(envoi);
  const croise = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  check(noms.length === 7 && noms.every((a) => noms.every((b) => a === b || !croise(envoi[a], envoi[b]))), 'enregistrement : les sept cases, sans chevauchement');
  check(envoi.poste.x === 5 && envoi.place.x === 0, 'enregistrement : les cases affichées restent où elles ont été posées');
  check(envoi.ventes.y >= 5 && envoi.ventes.x === 0, `enregistrement : la case cachée recouverte passe sous les autres (${JSON.stringify(envoi.ventes)})`);
  check(envoi.camp.y === 2 && envoi.camp.x === 0, 'enregistrement : une case cachée libre ne bouge pas');
  await p.context().close();

  // 4. Tuiles d'une page de lieu : 3, 5 et 7 tuiles, à 1280, 1600 et 1920 px
  for (const w of [1280, 1600, 1920]) {
    p = await openPage(browser, { page: 'admin', fixture: FIX, width: w, height: 900 });
    await p.waitForSelector('.plateau-cell');
    await p.evaluate(() => { location.hash = 'fabrique'; });
    await p.waitForSelector('.lieu-tiles');
    for (const n of [3, 5, 7]) {
      // Reconstruit un groupe de n tuiles, puis bouge la largeur d'un pixel pour déclencher le recalcul
      await p.evaluate((nb) => {
        const box = document.querySelector('.lieu-tiles'), modele = box.firstElementChild;
        box.replaceChildren(...Array.from({ length: nb }, () => modele.cloneNode(true)));
      }, n);
      await p.setViewportSize({ width: w - 1, height: 900 });
      await sleep(150);
      await p.setViewportSize({ width: w, height: 900 });
      await sleep(250);
      const m = await p.evaluate(() => {
        const box = document.querySelector('.lieu-tiles'), b = box.getBoundingClientRect();
        const rows = new Map();
        for (const t of box.children) { const r = t.getBoundingClientRect(); const k = Math.round(r.top); rows.set(k, [...(rows.get(k) || []), r]); }
        const lignes = [...rows.values()].map((l) => l.sort((x, y) => x.left - y.left));
        return {
          counts: lignes.map((l) => l.length),
          gauche: lignes.every((l) => Math.abs(l[0].left - b.left) < 1.5),
          droite: lignes.every((l) => Math.abs(l[l.length - 1].right - b.right) < 1.5),
          largeurMin: Math.min(...lignes.flat().map((x) => x.width)),
          egales: lignes.every((l) => l.every((x) => Math.abs(x.width - l[0].width) < 1.5)),
          gouttieres: lignes.every((l) => l.slice(1).every((x, i) => Math.abs(x.left - l[i].right - 12) < 1.5)),
          largeur: b.width,
        };
      });
      const colonnes = Math.min(6, Math.floor((m.largeur + 12) / 262));
      const attendu = Math.ceil(n / colonnes);
      check(m.counts.length === attendu && m.counts.reduce((a, b) => a + b, 0) === n, `${w} px, ${n} tuiles : ${colonnes} colonnes au plus, ${attendu} ligne(s) (${m.counts.join(' + ')})`);
      check(Math.max(...m.counts) - Math.min(...m.counts) <= 1 && Math.max(...m.counts) <= colonnes, `${w} px, ${n} tuiles : lignes de même nombre à une tuile près`);
      check(m.gauche && m.droite && m.egales && m.gouttieres, `${w} px, ${n} tuiles : lignes étirées sur toute la largeur, tuiles égales, gouttière de 12 px`);
      check(m.largeurMin >= 249, `${w} px, ${n} tuiles : tuile de 250 px au moins (${Math.round(m.largeurMin)} px)`);
    }
    await p.context().close();
  }

  await browser.close();
  finish();
})();
