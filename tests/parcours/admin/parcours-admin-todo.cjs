// Parcours : « À faire » des 7 lieux du panel (admin/todos.js, admin/lieux.js). Pastille du plateau = nombre d'éléments.
// (a) fixture par défaut : seule La Fabrique a un élément (alerte économie du fixture) ; les 6 autres : « Rien à faire ».
// (b) données complètes : chaque lieu liste ses éléments attendus (titre, liens, boutons) ; pastilles du plateau et total
//     de la page = nombre d'éléments ; les liens mènent à la bonne page (#lieu/sous-section) ; aucune erreur JavaScript.
// (c) une RPC en erreur n'empêche ni la page ni les autres éléments : la source en erreur n'affiche rien.
// (d) Staff { cartes } : seuls ses lieux ; aucune requête vers les sources d'un droit qu'il n'a pas (hg_client_errors, hg_events…).
// Faux Supabase : fixtures/fake-sb.mjs + fixtures/fake-sb-todo.mjs (scenario.extra). Lancer : node tests/parcours/admin/parcours-admin-todo.cjs
const { check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');

const iso = (h) => new Date(Date.now() + h * 3600e3).toISOString();
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const LIEUX = ['place', 'poste', 'ventes', 'camp', 'fabrique', 'fete', 'mairie'];

/** Données complètes : une source par élément attendu (voir fixtures/fake-sb-todo.mjs). */
const DONNEES = {
  extra: 'fake-sb-todo.mjs',
  todo: {
    proposals: 3,
    auctions: [
      { id: 'a1', card_name: 'Le Four à raclette', status: 'ouverte', ends_at: iso(5), starts_at: iso(-20) },   // fin dans 5 h : affichée
      { id: 'a2', card_name: 'Hibou', status: 'ouverte', ends_at: iso(72), starts_at: iso(-20) },              // fin dans 3 jours : non
    ],
    proofs: 2,
    relance: 3,
    sutom: [0, 1],                  // 2 mots programmés sur 7 : 5 jours libres
    framed: [],                     // aucune manche : 3 jours libres
    heardle: [{ n: 0, cancelled: false }, { n: 1, cancelled: true }], // aujourd'hui seulement : 2 jours libres
  },
  support: [
    { id: 'sup-1', user_id: U(2), pseudo: 'Alex', subject: 'Planning qui ne charge pas', message: 'Bonjour', status: 'ouverte', created_at: iso(-3), updated_at: iso(-3) },
    { id: 'sup-2', user_id: U(3), pseudo: 'Noa', subject: 'Question sur les boosters', message: 'Salut', status: 'ouverte', created_at: iso(-1), updated_at: iso(-1) },
    { id: 'sup-3', user_id: U(4), pseudo: 'Sam', subject: 'Résolu', message: 'Merci', status: 'fermee', created_at: iso(-30), updated_at: iso(-30) },
  ],
  ideas: [
    { id: 'idee-1', user_id: U(2), body: 'Une soirée jeux', status: 'nouvelle', created_at: iso(-2) },
    { id: 'idee-2', user_id: U(3), body: 'Un tournoi', status: 'nouvelle', created_at: iso(-1) },
    { id: 'idee-3', user_id: U(4), body: 'Déjà lue', status: 'lue', created_at: iso(-50) },
  ],
  trades: [
    { id: 'tr-1', from_user: U(2), to_user: U(3), status: 'proposee', from_paillettes: 0, to_paillettes: 0, created_at: iso(-5 * 24) }, // 5 jours : affiché
    { id: 'tr-2', from_user: U(3), to_user: U(4), status: 'proposee', from_paillettes: 0, to_paillettes: 0, created_at: iso(-24) },     // 1 jour : non
  ],
  sorties: [{ id: 'ev-sans-date', title: 'Pique-nique au lac de Joux', location: 'Lac', starts_at: null, retro: false, created_by: U(2) }],
  editions: [{ id: 'E26', year: 2026, status: 'tirage', budget: '20 CHF', drawn_at: null, shared_fields: [] }],
  clientErrors: [
    { id: 1, signature: 'sig-1', message: 'Erreur A', file: 'a.js', line: 1, col: 1, pages: [], browsers: {}, days: {}, count: 3, first_seen: iso(-5), last_seen: iso(-1), status: 'nouvelle' },
    { id: 2, signature: 'sig-2', message: 'Erreur B', file: 'b.js', line: 2, col: 2, pages: [], browsers: {}, days: {}, count: 1, first_seen: iso(-2), last_seen: iso(-2), status: 'nouvelle' },
    { id: 3, signature: 'sig-3', message: 'Erreur C', file: 'c.js', line: 3, col: 3, pages: [], browsers: {}, days: {}, count: 1, first_seen: iso(-9), last_seen: iso(-9), status: 'corrigee' },
  ],
};

/** Éléments « À faire » affichés sur la page du lieu courante : titre, liens et boutons. */
const elements = (p) => p.$$eval('.lieu-todo-item', (lis) => lis.map((li) => ({
  titre: li.querySelector('.lieu-todo-title')?.textContent.trim() || '',
  liens: [...li.querySelectorAll('.lieu-todo-actions a')].map((a) => a.getAttribute('href')),
  boutons: [...li.querySelectorAll('.lieu-todo-actions a, .lieu-todo-actions button')].map((b) => b.textContent.trim()),
})));

/** Pastilles du plateau : lieu -> nombre affiché (0 si masquée). */
const pastilles = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('.plateau-lieu')].map((a) => {
  const b = a.querySelector('[data-lieu-badge]');
  return [a.getAttribute('href').slice(1), b && !b.hidden ? Number(b.textContent) : 0];
})));

/** Va sur la page d'un lieu (fragment) et attend que « À faire » soit rempli. */
async function allerLieu(p, id) {
  await p.evaluate((h) => { location.hash = h; }, '#' + id);
  await sleep(400);
  await p.waitForFunction(() => !document.querySelector('[data-lieu-todo]')?.textContent.includes('Chargement'), null, { timeout: 5000 }).catch(() => {});
  await sleep(150);
}

/** Total affiché dans le bandeau de la page du lieu (0 si masqué). */
const totalPage = (p) => p.evaluate(() => {
  const t = document.querySelector('.lieu-total[data-lieu-count]');
  return t && !t.hidden ? Number(t.textContent.replace(/\D+/g, '')) : 0;
});

const sansErreur = (p) => p.errs.filter((e) => !/Failed to load|404|favicon/.test(e));

(async () => {
  const browser = await chromium.launch();

  /* (a) fixture par défaut : seule La Fabrique a un élément (l'alerte économie du fixture) */
  {
    const p = await openPage(browser, { page: 'admin', width: 1280, height: 900, hash: '#plateau' });
    const pa = await pastilles(p);
    check(JSON.stringify(pa) === JSON.stringify({ place: 0, poste: 0, ventes: 0, camp: 0, fabrique: 1, fete: 0, mairie: 0 }),
      `(a) pastilles du plateau sans données : ${JSON.stringify(pa)}`);
    for (const id of LIEUX) {
      await allerLieu(p, id);
      const els = await elements(p);
      if (id === 'fabrique') {
        check(els.length === 1 && els[0].titre.includes('Diamant') && els[0].liens[0] === '#fabrique/boosters',
          `(a) La Fabrique : l'alerte économie du fixture (${els.map((e) => e.titre).join(' | ')})`);
      } else {
        const vide = await p.textContent('[data-lieu-todo]');
        check(els.length === 0 && vide.includes('Rien à faire ici pour l’instant.'), `(a) ${id} : « Rien à faire ici pour l’instant. »`);
      }
    }
    check(sansErreur(p).length === 0, `(a) aucune erreur JavaScript${sansErreur(p).length ? ' : ' + sansErreur(p).join(' | ') : ''}`);
    await p.ctx.close();
  }

  /* (b) données complètes : éléments, liens, pastilles = nombre d'éléments */
  const attendus = {
    poste: [
      ['Planning qui ne charge pas', ['#poste/assistance/sup-1'], ['Répondre']],
      ['Question sur les boosters', ['#poste/assistance/sup-2'], ['Répondre']],
      ['2 nouvelles idées à relire', ['#poste/idees'], []],
    ],
    ventes: [
      ['Enchère « Le Four à raclette » : fin', ['#ventes/encheres'], []],
      ['Échange entre membres proposé depuis 5 jours', ['#ventes/echanges'], []],
    ],
    fabrique: [
      ['Le booster Diamant', ['#fabrique/boosters'], ['Ignorer cette semaine']],
      ['3 propositions de cartes à relire', ['#fabrique/series'], []],
    ],
    place: [['3 membres à relancer', ['#place/relance'], []]],
    camp: [
      ['Pique-nique au lac de Joux', ['#camp/sorties'], []],
      ['Le tirage du Secret Santa 2026 est à lancer', ['#camp/secret-santa'], []],
    ],
    fete: [
      ['2 preuves de quêtes à valider', ['#fete/preuves'], []],
      ['Sutom : 5 jours sans mot programmé sur les 7 prochains', ['#fete/sutom'], []],
      ['Framed : 3 jours sans manche sur les 3 prochains', ['#fete/framed-heardle'], []],
      ['Heardle : 2 jours sans manche sur les 3 prochains', ['#fete/framed-heardle'], []],
    ],
    mairie: [['2 erreurs nouvelles du site', ['#mairie/erreurs'], []]],
  };
  {
    const p = await openPage(browser, { page: 'admin', width: 1280, height: 900, hash: '#plateau', scenario: DONNEES });
    const pa = await pastilles(p);
    const pastillesOk = Object.entries(attendus).every(([k, v]) => pa[k] === v.length);
    check(pastillesOk, `(b) pastilles du plateau = nombre d'éléments : ${JSON.stringify(pa)}`);
    for (const id of LIEUX) {
      await allerLieu(p, id);
      const els = await elements(p);
      const ok = els.length === attendus[id].length && attendus[id].every(([titre, liens, boutons], i) => {
        const e = els[i];
        return e && e.titre.startsWith(titre) && JSON.stringify(e.liens) === JSON.stringify(liens)
          && boutons.every((b) => e.boutons.includes(b));
      });
      check(ok, `(b) ${id} : ${els.length} élément(s) attendu(s) ${attendus[id].length}${ok ? '' : ' -> ' + JSON.stringify(els)}`);
      const total = await totalPage(p);
      check(total === attendus[id].length, `(b) ${id} : total de la page = ${total} (attendu ${attendus[id].length})`);
    }
    // Les liens mènent à la bonne page : un clic sur « Ouvrir les preuves » et sur « Répondre »
    await allerLieu(p, 'fete');
    await p.click('.lieu-todo-actions a[href="#fete/preuves"]');
    await sleep(500);
    check((await p.evaluate(() => location.hash)) === '#fete/preuves', '(b) lien « Ouvrir les preuves » : #fete/preuves');
    await allerLieu(p, 'poste');
    await p.click('.lieu-todo-actions a[href="#poste/assistance/sup-2"]');
    await sleep(500);
    check((await p.evaluate(() => location.hash)) === '#poste/assistance/sup-2', '(b) lien « Répondre » : #poste/assistance/sup-2');
    check(sansErreur(p).length === 0, `(b) aucune erreur JavaScript${sansErreur(p).length ? ' : ' + sansErreur(p).join(' | ') : ''}`);
    await p.ctx.close();
  }

  /* (c) une RPC en erreur : la source ne montre rien, le reste de la page et les autres sources restent */
  {
    const scen = { ...DONNEES, todo: { ...DONNEES.todo, fail: ['hg_auctions_admin', 'hg_proof_queue', 'hg_admin_to_remind', 'hg_framed_admin'] } };
    const p = await openPage(browser, { page: 'admin', width: 1280, height: 900, hash: '#plateau', scenario: scen });
    const pa = await pastilles(p);
    check(pa.ventes === 1 && pa.fete === 2 && pa.place === 0, `(c) RPC en erreur : enchères, preuves, relances et Framed absents (ventes ${pa.ventes}, fête ${pa.fete}, place ${pa.place})`);
    await allerLieu(p, 'place');
    check((await p.textContent('[data-lieu-todo]')).includes('Rien à faire ici pour l’instant.'), '(c) La Place : relances en erreur, « Rien à faire » affiché');
    await allerLieu(p, 'fete');
    const els = await elements(p);
    check(els.length === 2 && els[0].titre.startsWith('Sutom') && els[1].titre.startsWith('Heardle'),
      `(c) La Fête : Sutom et Heardle restent (${els.map((e) => e.titre).join(' | ')})`);
    // La Fête : 5 tuiles « Événements » et 14 tuiles « Jeux » (perms.js)
    check((await p.$$eval('.lieu-tile', (as) => as.length)) === 20, '(c) La Fête : 20 tuiles (5 Événements, 15 Jeux), page complète');
    await allerLieu(p, 'poste');
    check((await elements(p)).length === 3, '(c) La Poste : ses 3 éléments, indépendants des erreurs des autres lieux');
    check(sansErreur(p).length === 0, `(c) aucune erreur JavaScript${sansErreur(p).length ? ' : ' + sansErreur(p).join(' | ') : ''}`);
    await p.ctx.close();
  }

  /* (d) Staff { cartes } : seuls ses lieux, et aucune requête vers une source d'un droit qu'il n'a pas */
  {
    const p = await openPage(browser, { page: 'admin', width: 1280, height: 900, hash: '#plateau',
      scenario: { ...DONNEES, uid: U(2), staff: ['cartes'] } });
    const lieux = await p.$$eval('.plateau-lieu', (as) => as.map((a) => a.getAttribute('href')));
    // La Mairie reste permise : la section Planning s'ouvre à qui a le droit « cartes » (perms.js, PLANNING_PERMS).
    check(JSON.stringify(lieux) === JSON.stringify(['#ventes', '#fabrique', '#mairie']), `(d) Staff { cartes } : lieux permis ${lieux.join(' ')}`);
    const pa = await pastilles(p);
    check(pa.ventes === 2 && pa.fabrique === 2, `(d) Staff { cartes } : pastilles ventes ${pa.ventes}, fabrique ${pa.fabrique} (2 et 2 attendus)`);
    await allerLieu(p, 'fabrique');
    check((await elements(p)).length === 2, '(d) Staff { cartes } : La Fabrique, 2 éléments');
    const journal = await p.evaluate(() => window.__LOG.filter((e) => e[0] === 'rpc' || e[0] === 'select').map((e) => e[1]));
    const interdits = ['hg_admin_to_remind', 'hg_proof_queue', 'hg_sutom_admin', 'hg_framed_admin', 'hg_heardle_admin', 'hg_client_errors', 'hg_events', 'hg_support', 'hg_ideas'];
    const appelees = interdits.filter((f) => journal.includes(f));
    check(appelees.length === 0, `(d) aucune requête vers une source interdite${appelees.length ? ' : ' + appelees.join(', ') : ''}`);
    check(sansErreur(p).length === 0, `(d) aucune erreur JavaScript${sansErreur(p).length ? ' : ' + sansErreur(p).join(' | ') : ''}`);
    await p.ctx.close();
  }

  await browser.close();
  finish();
})();
