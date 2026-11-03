// Parcours : plateau d'action du panel (/pages/admin/admin.html) : accueil par défaut, 7 lieux, page de lieu avec tuiles, fil d'Ariane
// et retour, anciennes adresses, Staff partiel, téléphone 390 px sans défilement horizontal, aucune erreur JavaScript.
// (a) administrateur : #plateau par défaut, 7 lieux sur le plan (chemin, pastilles, actions rapides) ; ouverture de La Fabrique (19 tuiles) ; une tuile
//     mène à la page (fil « Plateau › Lieu › Page », retour au lieu) ; le fil ramène au plateau.
// (b) anciennes adresses : #pilotage/…, #membres/…, #irl/…, #event/…, #cartes/…, #jeux/…, #comptes, #apercu, #reglages.
// (c) Staff { cartes, journal } : seuls les lieux permis (Mairie, Fabrique, Salle des ventes) sont sur le plateau.
// (d) téléphone 390 px : barre du bas (Plateau et lieux), pas de défilement horizontal ; captures tests/shots/.
// (e) plan du plateau : 7 cases, nom du lieu = lien (nom accessible avec le nombre à traiter), pastille, actions rapides
//     (Give, Lancer un drop, Nouvelle enchère) selon les droits, évènement hg:quick, repli vers la page, téléphone sans chemin.
// (f) disposition (migration 111) : grille de 12 colonnes ; mode « Modifier la disposition » (bureau) : liens inertes,
//     clavier (flèches, Maj + flèches, refus annoncé), glisser et poignée à la souris (vert, rouge puis retour), Enregistrer
//     (sept cases), rechargement, Annuler, « Disposition par défaut » (confirmation, envoie null), Staff, erreurs,
//     cases petites sans débordement, téléphone et tablette sans bouton, sortie du mode sous 900 px.
// Faux Supabase (fixtures/fake-sb.mjs). Lancer : node tests/parcours/admin/parcours-admin-plateau.cjs
const path = require('path');
const { ROOT, SHOTS, check, finish, openPage, hscroll, sleep, chromium, log } = require('../../lib/harness.cjs');

// Heure figée (10 h à Zurich) : sans elle, le secret « nuit » (arcade/core.js, entre 3 h et 3 h 59 à Zurich) affiche un toast
// « Secret trouvé » qui recouvre la poignée de la Mairie à ces heures-là. Le test ne dépend plus de l’heure réelle.
const HEURE = '2026-10-28T09:00:00Z';

// Adresse finale après redirection (le routeur remplace le fragment sans nouvelle entrée d'historique).
const settle = async (p) => { await sleep(350); return p.evaluate(() => location.hash); };

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();

  /* (a) Administrateur : plateau, page de lieu, tuile, fil d'Ariane */
  {
    const p = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900 });
    check((await settle(p)) === '#plateau', '(a) accueil par défaut : #plateau');
    const cartes = await p.$$eval('.plateau-lieu', (as) => as.map((a) => a.getAttribute('href')));
    check(JSON.stringify(cartes) === JSON.stringify(['#place', '#poste', '#ventes', '#camp', '#fabrique', '#fete', '#mairie']),
      `(a) 7 lieux sur le plateau : ${cartes.join(' ')}`);
    check(await p.isVisible('#plateau-root') && await p.isVisible('#zone-title'), '(a) plateau visible, titre de zone');
    check((await p.textContent('#zone-crumb')).trim() === '', '(a) plateau : pas de fil d’Ariane répété (le titre dit déjà Plateau)');
    check(!(await p.isVisible('#zone-back')), '(a) pas de bouton retour sur le plateau');
    check(await p.$('.shell-col:not([hidden])') === null && await p.$('.shell-tabs:visible') === null, '(a) ordinateur : ni colonne de navigation, ni barre du bas');

    await p.click('.plateau-lieu[href="#fabrique"]');
    await sleep(400);
    check((await p.evaluate(() => location.hash)) === '#fabrique', '(a) clic sur La Fabrique de cartes : #fabrique');
    check((await p.textContent('#zone-title')).trim() === 'La Fabrique de cartes', '(a) titre de la page de lieu');
    const tuiles = await p.$$eval('.lieu-tile', (as) => as.length);
    check(tuiles === 19, `(a) page de lieu : 19 tuiles (${tuiles})`);
    const groupes = await p.$$eval('.lieu-group-title', (hs) => hs.map((h) => h.textContent.trim()));
    check(JSON.stringify(groupes) === JSON.stringify(['Agir', 'Arène', 'Catalogue', 'Suivi', 'Économie', 'Animations']),
      `(a) groupes de la page : ${groupes.join(', ')}`);
    await p.waitForFunction(() => !document.querySelector('.lieu-todo-box')?.textContent.includes('Chargement'), null, { timeout: 5000 }).catch(() => {});
    const todo = await p.textContent('.lieu-todo-box');
    check(!todo.includes('Chargement') && (todo.includes('Rien à faire ici pour l’instant.') || todo.includes('Diamant')),
      `(a) « À faire » : alerte économie du fixture ou message d’attente (${todo.trim().slice(0, 60)})`);
    const aide = await p.textContent('.lieu-tile[data-sub="defis"] .lieu-tile-help');
    check(aide.trim() === 'Objectifs collectifs', `(a) ligne d’aide de la tuile Défis : « ${aide.trim()} »`);

    await p.click('.lieu-tile[data-sub="defis"]');
    await sleep(500);
    check((await p.evaluate(() => location.hash)) === '#fabrique/defis', '(a) tuile Défis : #fabrique/defis');
    check(await p.isVisible('#defis'), '(a) la section Défis est affichée');
    check((await p.textContent('#zone-crumb')).replace(/\s*›\s*/g, ' › ').replace(/\s+/g, ' ').trim() === 'Plateau › La Fabrique de cartes › Défis du gang',
      '(a) fil d’Ariane : Plateau › La Fabrique de cartes › Défis du gang');
    check((await p.getAttribute('#zone-back', 'href')) === '#fabrique' && await p.isVisible('#zone-back'), '(a) bouton retour vers le lieu');
    await p.click('#zone-back');
    await sleep(400);
    check((await p.evaluate(() => location.hash)) === '#fabrique', '(a) retour : de retour sur la page de La Fabrique');
    await p.click('#zone-crumb a[href="#plateau"]');
    await sleep(400);
    check((await p.evaluate(() => location.hash)) === '#plateau', '(a) fil d’Ariane « Plateau » : retour au plateau');
    const erreurs = p.errs.filter((e) => !/Failed to load|404|favicon/.test(e));
    check(erreurs.length === 0, `(a) aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`);
    await p.screenshot({ path: path.join(SHOTS, 'plateau-1280.png') });
    await p.click('.plateau-lieu[href="#fabrique"]');
    await sleep(400);
    await p.screenshot({ path: path.join(SHOTS, 'lieu-fabrique-1280.png') });
    await p.ctx.close();
  }

  /* (b) Anciennes adresses : chacune mène à la bonne sous-section */
  {
    const anciennes = [
      ['#mairie/planning', '#mairie/planning'], ['#mairie/identite', '#mairie/identite'], ['#mairie/apercu', '#plateau'],
      ['#place/comptes', '#place/comptes'], ['#place/comptes/0000', '#place/comptes'], ['#place/invitations', '#place/invitations'],
      ['#place/badges-criteres', '#place/badges-criteres'], ['#camp/sorties', '#camp/sorties'], ['#camp/secret-santa', '#camp/secret-santa'],
      ['#fete/rdv', '#fete/rdv'], ['#fete/mes-jeux', '#fete/mes-jeux'], ['#fabrique/defis', '#fabrique/defis'],
      ['#ventes/encheres', '#ventes/encheres'], ['#fabrique/joueurs/0000', '#fabrique/joueurs/0000'], ['#comptes', '#place/comptes'],
      ['#apercu', '#plateau'], ['#reglages', '#mairie/identite'], ['#journal', '#mairie/journal'], ['#membres', '#place/invitations'],
      ['#bataille', '#fabrique/arene'], ['#poste/bot', '#poste/bot'],
    ];
    const ko = [];
    for (const [ancienne, attendue] of anciennes) {
      const p = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, hash: ancienne });
      const finale = await settle(p);
      if (finale !== attendue) ko.push(`${ancienne} -> ${finale} (attendu ${attendue})`);
      await p.ctx.close();
    }
    check(ko.length === 0, `(b) ${anciennes.length} anciennes adresses redirigées${ko.length ? ' : ' + ko.join(' ; ') : ''}`);
  }

  /* (c) Staff { cartes, journal } : seuls ses lieux, dont le Planning (Mairie) */
  {
    const p = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, scenario: { uid: '00000002-0000-4000-8000-000000000002', staff: ['cartes', 'journal'] } });
    const lieux = await p.$$eval('.plateau-lieu', (as) => as.map((a) => a.getAttribute('href')));
    check(JSON.stringify(lieux) === JSON.stringify(['#ventes', '#fabrique', '#mairie']), `(c) Staff : lieux permis = ${lieux.join(' ')}`);
    const pages = await p.evaluate(() => [...document.querySelectorAll('#plateau-root [href]')].length);
    check(pages === 3, `(c) pas de lien vers un lieu interdit (${pages} liens)`);
    await p.click('.plateau-lieu[href="#mairie"]');
    await sleep(400);
    const tuilesM = await p.$$eval('.lieu-tile', (as) => as.map((a) => a.dataset.sub));
    check(JSON.stringify(tuilesM) === JSON.stringify(['planning', 'journal']), `(c) La Mairie pour ce Staff : ${tuilesM.join(', ')}`);
    await p.ctx.close();
  }

  /* (d) Téléphone 390 px : barre du bas, pas de défilement horizontal */
  {
    const p = await openPage(browser, { now: HEURE, page: 'admin', width: 390, height: 844, mobile: true, dpr: 2 });
    check((await settle(p)) === '#plateau', '(d) téléphone : #plateau par défaut');
    const hs = await hscroll(p);
    check(hs <= 0, `(d) téléphone : pas de défilement horizontal (${hs})`);
    check(await p.isVisible('.shell-tabs'), '(d) téléphone : barre du bas visible');
    const onglets = await p.$$eval('.shell-tab', (as) => as.map((a) => a.dataset.lieu || a.dataset.route));
    check(onglets.length === 8 && onglets[0] === 'plateau', `(d) barre du bas : Plateau et ${onglets.length - 1} lieux`);
    check(await p.isVisible('#zone-title'), '(d) téléphone : titre du plateau visible');
    check((await p.$$eval('.plateau-lieu', (as) => as.length)) === 7, '(d) téléphone : 7 cartes de lieu');
    await p.screenshot({ path: path.join(SHOTS, 'plateau-390.png') });
    await p.click('.plateau-lieu[href="#fete"]');
    await sleep(400);
    const hs2 = await hscroll(p);
    check(hs2 <= 0, `(d) page de lieu au téléphone : pas de défilement horizontal (${hs2})`);
    // La Fête foraine : 5 tuiles « Événements » et 14 tuiles « Jeux » (perms.js)
    check((await p.$$eval('.lieu-tile', (as) => as.length)) === 20, '(d) La Fête foraine : 20 tuiles (5 Événements, 15 Jeux)');
    const erreurs = p.errs.filter((e) => !/Failed to load|404|favicon/.test(e));
    check(erreurs.length === 0, `(d) aucune erreur JavaScript${erreurs.length ? ' : ' + erreurs.join(' | ') : ''}`);
    await p.ctx.close();
  }

  /* (e) Plan du plateau : cases, nom accessible, pastilles, actions rapides (droits), repli, téléphone */
  {
    const p = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900 });
    await settle(p);
    check(await p.isVisible('.plateau-board'), '(e) le plan du plateau est affiché');
    check((await p.$$('.plateau-board .plateau-cell')).length === 7, '(e) 7 cases sur le plan');
    check((await p.$$('.plateau-board .plateau-road path')).length === 1, '(e) chemin tracé entre les lieux (bureau)');
    const noms = await p.$$eval('.plateau-cell > .plateau-lieu', (as) => as.map((a) => a.textContent.replace(/\s+/g, ' ').trim()));
    check(noms.length === 7 && noms.every((n) => /^(La |Le )/.test(n) || /Mairie|Place|Poste|Camp|Fabrique|Fête|Salle/.test(n)),
      `(e) chaque case est un lien au nom du lieu : ${noms[0]} …`);
    const quick = await p.$$eval('[data-quick]', (bs) => bs.map((b) => `${b.dataset.quick}:${b.closest('.plateau-cell').dataset.lieu}`));
    check(JSON.stringify(quick.slice().sort()) === JSON.stringify(['drop:fabrique', 'enchere:ventes', 'give:fabrique']),
      `(e) administrateur : trois actions rapides dans leur lieu (${quick.join(' ')})`);
    const badge = await p.$eval('.plateau-cell[data-lieu="fabrique"] [data-lieu-badge]', (b) => ({ vu: !b.hidden, n: b.textContent.trim() }));
    const compte = await p.$eval('.plateau-cell[data-lieu="fabrique"] .plateau-lieu', (a) => a.textContent);
    check(badge.vu && badge.n === '1' && /1 à traiter/.test(compte), `(e) pastille de La Fabrique : ${badge.n}, nom accessible « ${compte.replace(/\s+/g, ' ').trim().slice(-30)} »`);
    const sansPastille = await p.$eval('.plateau-cell[data-lieu="place"] [data-lieu-badge]', (b) => b.hidden);
    check(sansPastille, '(e) pas de pastille quand rien n’attend (La Place du gang)');
    const focus = await p.evaluate(() => { const a = document.querySelector('.plateau-cell .plateau-lieu'); a.focus(); return getComputedStyle(a).outlineStyle; });
    check(focus === 'solid', `(e) lien de case : contour visible au clavier (${focus})`);
    const hsPlan = await hscroll(p);
    check(hsPlan <= 0, `(e) plan au bureau : pas de défilement horizontal (${hsPlan})`);

    // Événement hg:quick : un écouteur qui annule l'événement empêche la navigation de repli
    await p.evaluate(() => document.addEventListener('hg:quick', (e) => { window.__Q = e.detail.action; e.preventDefault(); }));
    await p.click('[data-quick="drop"]');
    await sleep(300);
    check((await p.evaluate(() => window.__Q)) === 'drop' && (await p.evaluate(() => location.hash)) === '#plateau',
      '(e) clic « Lancer un drop » : événement hg:quick (action drop), pas de navigation');
    await p.ctx.close();

    // Avec les fenêtres rapides (admin/quick.js) : le clic ouvre la fenêtre, sans quitter le plateau
    const n = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900 });
    await settle(n);
    await n.click('[data-quick="enchere"]');
    await sleep(400);
    check((await n.locator('dialog[open]').count()) === 1 && (await settle(n)) === '#plateau', '(e) « Nouvelle enchère » ouvre sa fenêtre rapide sur le plateau');
    await n.ctx.close();

    // Give : repli vers la gestion globale (La Fabrique)
    const q = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900 });
    await settle(q);
    await q.click('[data-quick="give"]');
    await sleep(400);
    check((await q.locator('dialog[open]').count()) === 1 && (await settle(q)) === '#plateau', '(e) « Give » ouvre sa fenêtre rapide sur le plateau');
    await q.ctx.close();

    // Membre sans le droit « cartes » : aucune action rapide ; seule la Mairie (journal) est sur le plan
    const m = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, scenario: { uid: '00000002-0000-4000-8000-000000000002', staff: ['journal'] } });
    await settle(m);
    check((await m.$$('[data-quick]')).length === 0, '(e) sans droit « cartes » : aucune action rapide sur le plan');
    check((await m.$$('.plateau-cell')).length === 1, '(e) sans droit « cartes » : une seule case (La Mairie)');
    await m.ctx.close();

    // Staff « cartes » : les trois actions rapides, dans leurs lieux
    const s = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, scenario: { uid: '00000002-0000-4000-8000-000000000002', staff: ['cartes', 'journal'] } });
    await settle(s);
    const qs = await s.$$eval('[data-quick]', (bs) => bs.map((b) => b.dataset.quick));
    check(qs.length === 3, `(e) Staff « cartes » : trois actions rapides (${qs.join(' ')})`);
    await s.ctx.close();

    // Téléphone : une colonne, pas de chemin, actions rapides visibles et dans l'écran
    const t = await openPage(browser, { now: HEURE, page: 'admin', width: 390, height: 844, mobile: true, dpr: 2 });
    await settle(t);
    check((await t.$eval('.plateau-road', (r) => getComputedStyle(r).display)) === 'none', '(e) téléphone : pas de chemin');
    const hsT = await hscroll(t);
    check(hsT <= 0, `(e) téléphone : plan sans défilement horizontal (${hsT})`);
    const dedans = await t.$$eval('.plateau-act', (bs) => bs.every((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= 390; }));
    check(dedans, '(e) téléphone : actions rapides visibles et dans la largeur de l’écran');
    await t.ctx.close();
  }

  /* (f) Disposition du plateau : grille de 12 colonnes, mode disposition, enregistrement, valeur par défaut */
  const egal = (a, b) => JSON.stringify(Object.keys(a).sort().map((k) => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map((k) => [k, b[k]]));
  const pos = (p, id) => p.$eval(`.plateau-cell[data-lieu="${id}"]`, (c) => `${c.style.gridColumn} | ${c.style.gridRow}`);
  const toutes = (p) => p.$$eval('.plateau-cell', (cs) => Object.fromEntries(cs.map((c) => [c.dataset.lieu, `${c.style.gridColumn} | ${c.style.gridRow}`])));
  const live = (p) => p.$eval('[data-plateau-live]', (e) => e.textContent.trim());
  // Boîte d'un élément après défilement (la souris de Playwright ne vise que la fenêtre visible)
  const boite = async (loc) => { await loc.scrollIntoViewIfNeeded(); return loc.boundingBox(); };
  const ghost = (p) => p.evaluate(() => document.querySelector('.plateau-ghost')?.className ?? null);
  const appels = async (p) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_admin_plateau_set');
  const pose = (L) => ({ content: `localStorage.setItem('hg_fake_plateau', ${JSON.stringify(JSON.stringify({ v: 1, cells: L }))});` });
  // Débordement : un contenu de case (nom, ligne d'aide, info, boutons, icône, pastille) hors de sa case, ou une case qui déborde
  const debord = (p) => p.evaluate(() => [...document.querySelectorAll('.plateau-cell')].map((c) => {
    const r = c.getBoundingClientRect();
    const hors = [...c.querySelectorAll('.plateau-name,.plateau-tag,.plateau-info,.plateau-act,.plateau-ico,.plateau-pastille')].filter((k) => {
      const q = k.getBoundingClientRect();
      if (!q.width || !q.height) return false;
      return q.bottom > r.bottom + 0.5 || q.right > r.right + 0.5 || q.top < r.top - 0.5 || q.left < r.left - 0.5;
    }).map((k) => k.className);
    return { lieu: c.dataset.lieu, hors, sh: c.scrollHeight - c.clientHeight, sw: c.scrollWidth - c.clientWidth };
  }));
  {
    const DEFAUT = {
      place: '1 / span 4 | 1 / span 2', poste: '5 / span 4 | 1 / span 2', ventes: '9 / span 4 | 1 / span 2',
      camp: '1 / span 4 | 3 / span 2', fabrique: '5 / span 4 | 3 / span 2', fete: '9 / span 4 | 3 / span 2', mairie: '1 / span 12 | 5 / span 1',
    };
    const p = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 1150 });
    await settle(p);
    check(egal(await toutes(p), DEFAUT), '(f) disposition par défaut : sept cases à leur place (trois par ligne, la Mairie en bas sur toute la largeur)');
    const hauteur0 = await p.$eval('.plateau-board', (b) => b.getBoundingClientRect().height);
    check(await p.isVisible('[data-plateau-edit]'), '(f) bureau 1280 px : bouton « Modifier la disposition » visible');

    // Mode disposition : liens inertes, cases au clavier
    await p.click('[data-plateau-edit]');
    await sleep(300);
    check((await p.$('.plateau-board--edit')) !== null && await p.isVisible('.plateau-edit-bar') && !(await p.isVisible('[data-plateau-edit]')),
      '(f) mode disposition : barre d’enregistrement visible, bouton d’entrée masqué');
    check(await p.$eval('.plateau-cell[data-lieu="place"]', (c) => c.tabIndex === 0 && c.getAttribute('role') === 'group'), '(f) chaque case est une cible du clavier');
    check(await p.$eval('.plateau-cell[data-lieu="place"] .plateau-lieu', (a) => a.inert), '(f) liens des cases inertes en mode disposition');
    const lien = await boite(p.locator('.plateau-cell[data-lieu="place"] .plateau-lieu'));
    await p.mouse.click(lien.x + 20, lien.y + 20);
    await sleep(300);
    check((await p.evaluate(() => location.hash)) === '#plateau', '(f) clic sur le lien d’une case en mode disposition : pas de navigation');
    await p.evaluate(() => document.addEventListener('hg:quick', () => { window.__QQ = true; }));
    const give = await boite(p.locator('.plateau-cell[data-lieu="fabrique"] [data-quick="give"]'));
    await p.mouse.click(give.x + 10, give.y + 10);
    await sleep(200);
    check(!(await p.evaluate(() => window.__QQ)), '(f) bouton « Give » inerte en mode disposition (aucun hg:quick)');

    // Clavier : flèches = déplacer, Maj + flèches = redimensionner ; les refus sont annoncés et ne bougent rien
    await p.focus('.plateau-cell[data-lieu="mairie"]');
    await p.keyboard.press('ArrowDown');
    check((await pos(p, 'mairie')) === '1 / span 12 | 6 / span 1', `(f) clavier : flèche bas, la Mairie descend d’une ligne (${await pos(p, 'mairie')})`);
    check((await live(p)) === 'La Mairie : colonne 1, ligne 6, largeur 12, hauteur 1', `(f) annonce : « ${await live(p)} »`);
    await p.keyboard.press('ArrowUp');
    await p.keyboard.press('ArrowUp');
    check((await pos(p, 'mairie')) === '1 / span 12 | 5 / span 1', '(f) clavier : une case ne passe pas sur une autre (la Mairie reste en ligne 5)');
    check(/^Impossible : La Mairie chevauche « /.test(await live(p)), `(f) chevauchement refusé et annoncé : « ${await live(p)} »`);
    await p.keyboard.press('ArrowRight');
    check((await pos(p, 'mairie')) === '1 / span 12 | 5 / span 1' && /dépasse le plateau/.test(await live(p)), '(f) clavier : sortir des 12 colonnes est refusé');
    await p.keyboard.press('Shift+ArrowLeft');
    check((await pos(p, 'mairie')) === '1 / span 11 | 5 / span 1', `(f) Maj + flèche gauche : la Mairie fait 11 colonnes (${await pos(p, 'mairie')})`);
    await p.keyboard.press('Shift+ArrowRight');
    check((await pos(p, 'mairie')) === '1 / span 12 | 5 / span 1', '(f) Maj + flèche droite : la Mairie revient à 12 colonnes');

    // Souris : glisser une ligne plus bas (vert, posé), puis sur les cases (rouge, la case reprend sa place)
    const m1 = await boite(p.locator('.plateau-cell[data-lieu="mairie"]'));
    const mx = m1.x + m1.width / 2, my = m1.y + 60;
    await p.mouse.move(mx, my);
    await p.mouse.down();
    await p.mouse.move(mx, my + 170, { steps: 6 });
    check((await ghost(p)) === 'plateau-ghost', '(f) glisser : aperçu vert sur une place libre');
    await p.mouse.up();
    await sleep(150);
    check((await pos(p, 'mairie')) === '1 / span 12 | 6 / span 1', `(f) glisser à la souris : la Mairie posée une ligne plus bas (${await pos(p, 'mairie')})`);
    const m2 = await boite(p.locator('.plateau-cell[data-lieu="mairie"]'));
    const mx2 = m2.x + m2.width / 2, my2 = m2.y + 60;
    await p.mouse.move(mx2, my2);
    await p.mouse.down();
    await p.mouse.move(mx2, my2 - 340, { steps: 8 });
    check((await ghost(p) || '').includes('plateau-ghost--ko'), '(f) glisser sur d’autres cases : aperçu rouge');
    await p.mouse.up();
    await sleep(150);
    check((await pos(p, 'mairie')) === '1 / span 12 | 6 / span 1' && await p.$('.plateau-ghost') === null,
      '(f) lâcher sur le rouge : la Mairie reprend sa place, aperçu retiré');
    check(/^Impossible : La Mairie/.test(await live(p)), '(f) lâcher refusé annoncé');

    // Poignée : la Mairie passe à deux lignes (la ligne 7 est libre)
    const h = await boite(p.locator('.plateau-cell[data-lieu="mairie"] .plateau-handle'));
    const hx = h.x + h.width / 2, hy = h.y + h.height / 2;
    await p.mouse.move(hx, hy);
    await p.mouse.down();
    await p.mouse.move(hx, hy + 170, { steps: 6 });
    check((await ghost(p)) === 'plateau-ghost', '(f) poignée : aperçu vert quand la place est libre');
    await p.mouse.up();
    await sleep(150);
    check((await pos(p, 'mairie')) === '1 / span 12 | 6 / span 2', `(f) poignée : la Mairie fait deux lignes (${await pos(p, 'mairie')})`);

    // Enregistrer : une écriture, les sept cases
    const avant = (await appels(p)).length;
    await p.click('[data-plateau-save]');
    await p.waitForFunction(() => !document.querySelector('.plateau-board--edit'), null, { timeout: 5000 }).catch(() => {});
    const ecr = await appels(p);
    const cells = ecr[ecr.length - 1]?.[2]?.p?.cells || {};
    const attendu = {
      place: { x: 0, y: 0, w: 4, h: 2 }, poste: { x: 4, y: 0, w: 4, h: 2 }, ventes: { x: 8, y: 0, w: 4, h: 2 },
      camp: { x: 0, y: 2, w: 4, h: 2 }, fabrique: { x: 4, y: 2, w: 4, h: 2 }, fete: { x: 8, y: 2, w: 4, h: 2 },
      mairie: { x: 0, y: 5, w: 12, h: 2 },
    };
    check(ecr.length === avant + 1 && egal(cells, attendu), `(f) Enregistrer : une écriture avec les sept cases (${JSON.stringify(cells.mairie)})`);
    check(await p.evaluate(() => document.body.innerText.includes('Disposition enregistrée')), '(f) enregistrement : confirmation (toast)');
    check(await p.isVisible('[data-plateau-edit]') && (await pos(p, 'mairie')) === '1 / span 12 | 6 / span 2', '(f) après enregistrement : hors mode, disposition gardée');
    const hauteur1 = await p.$eval('.plateau-board', (b) => b.getBoundingClientRect().height);
    check(hauteur1 > hauteur0 + 100, `(f) le plateau grandit avec la case la plus basse (${Math.round(hauteur0)} → ${Math.round(hauteur1)} px)`);

    // Rechargement : la disposition enregistrée revient
    await p.reload();
    await p.waitForSelector('.plateau-board .plateau-cell', { timeout: 8000 });
    await settle(p);
    check((await pos(p, 'mairie')) === '1 / span 12 | 6 / span 2' && egal(await toutes(p), { ...DEFAUT, mairie: '1 / span 12 | 6 / span 2' }),
      '(f) rechargement : disposition enregistrée restaurée');

    // Annuler : rien n'est envoyé, la disposition enregistrée reprend
    await p.click('[data-plateau-edit]');
    await sleep(300);
    await p.focus('.plateau-cell[data-lieu="mairie"]');
    await p.keyboard.press('ArrowUp');
    check((await pos(p, 'mairie')) === '1 / span 12 | 5 / span 2', '(f) annuler : essai de déplacement (ligne 5)');
    const avantAnnul = (await appels(p)).length;
    await p.click('[data-plateau-cancel]');
    await sleep(200);
    check((await pos(p, 'mairie')) === '1 / span 12 | 6 / span 2' && (await appels(p)).length === avantAnnul && !(await p.$('.plateau-board--edit')),
      '(f) Annuler : la disposition enregistrée reprend, aucun envoi');

    // Disposition par défaut : confirmation en ligne ; Non n'envoie rien ; Oui envoie null
    await p.click('[data-plateau-edit]');
    await sleep(300);
    await p.click('[data-plateau-reset]');
    check(await p.isVisible('[data-plateau-confirm]'), '(f) « Disposition par défaut » demande une confirmation sur place');
    const avantNon = (await appels(p)).length;
    await p.click('[data-plateau-reset-no]');
    check(!(await p.isVisible('[data-plateau-confirm]')) && (await appels(p)).length === avantNon, '(f) confirmation « Non » : rien n’est envoyé');
    await p.click('[data-plateau-reset]');
    await p.click('[data-plateau-reset-yes]');
    await p.waitForFunction(() => !document.querySelector('.plateau-board--edit'), null, { timeout: 5000 }).catch(() => {});
    const reset = await appels(p);
    check(reset.length === avantNon + 1 && reset[reset.length - 1][2].p === null, '(f) « Disposition par défaut » envoie null');
    check((await pos(p, 'mairie')) === '1 / span 12 | 5 / span 1' && egal(await toutes(p), DEFAUT), '(f) la disposition par défaut est affichée');
    await p.reload();
    await p.waitForSelector('.plateau-board .plateau-cell', { timeout: 8000 });
    await settle(p);
    check(egal(await toutes(p), DEFAUT), '(f) rechargement après remise par défaut : disposition par défaut');

    // Sous 900 px : le mode se ferme, le bouton disparaît (tablette)
    await p.click('[data-plateau-edit]');
    await sleep(300);
    await p.setViewportSize({ width: 800, height: 900 });
    await sleep(400);
    check(!(await p.$('.plateau-board--edit')) && (await p.$eval('[data-plateau-edit]', (b) => getComputedStyle(b).display)) === 'none',
      '(f) tablette 800 px : bouton masqué, mode disposition fermé');
    const erreurs1 = p.errs.filter((e) => !/Failed to load|404|favicon/.test(e));
    check(erreurs1.length === 0, `(f) aucune erreur JavaScript${erreurs1.length ? ' : ' + erreurs1.join(' | ') : ''}`);
    await p.ctx.close();
  }

  {
    // Cases petites : tout reste dans sa case (aucun débordement), boutons compris
    const TASSEES = {
      place: { x: 0, y: 0, w: 2, h: 2 }, poste: { x: 2, y: 0, w: 3, h: 2 }, ventes: { x: 5, y: 0, w: 3, h: 3 },
      camp: { x: 8, y: 0, w: 4, h: 2 }, fabrique: { x: 0, y: 2, w: 5, h: 2 }, fete: { x: 5, y: 3, w: 2, h: 2 }, mairie: { x: 0, y: 6, w: 12, h: 1 },
    };
    const MINCES = {
      place: { x: 0, y: 0, w: 2, h: 2 }, poste: { x: 2, y: 0, w: 2, h: 2 }, ventes: { x: 4, y: 0, w: 2, h: 2 },
      camp: { x: 6, y: 0, w: 2, h: 2 }, fabrique: { x: 8, y: 0, w: 2, h: 2 }, fete: { x: 10, y: 0, w: 2, h: 2 }, mairie: { x: 0, y: 2, w: 12, h: 1 },
    };
    for (const [nom, L, largeur] of [['mixte 1280', TASSEES, 1280], ['mixte 1000', TASSEES, 1000], ['minces 1280', MINCES, 1280], ['minces 900', MINCES, 900]]) {
      const p = await openPage(browser, { now: HEURE, page: 'admin', width: largeur, height: 900, init: pose(L) });
      await settle(p);
      const d = await debord(p);
      const ko = d.filter((c) => c.hors.length || c.sh > 1 || c.sw > 1);
      check(d.length === 7 && ko.length === 0, `(f) cases ${nom} : aucun contenu hors de sa case${ko.length ? ' : ' + JSON.stringify(ko) : ''}`);
      check((await p.$$eval('.plateau-act', (bs) => bs.filter((b) => b.getBoundingClientRect().width > 0).length)) >= 5, `(f) cases ${nom} : boutons d’action présents`);
      await p.ctx.close();
    }
    // Disposition enregistrée illisible (case hors du cadre) : repli sur la disposition par défaut
    const bad = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, init: pose({ ...TASSEES, place: { x: 10, y: 0, w: 4, h: 2 } }) });
    await settle(bad);
    // place (x 10, w 4) sort du cadre : elle passe sous la case la plus basse (mairie, ligne 7), les autres gardent leur place
    check(egal(await toutes(bad), {
      place: '1 / span 4 | 8 / span 2', poste: '3 / span 3 | 1 / span 2', ventes: '6 / span 3 | 1 / span 3', camp: '9 / span 4 | 1 / span 2',
      fabrique: '1 / span 5 | 3 / span 2', fete: '6 / span 2 | 4 / span 2', mairie: '1 / span 12 | 7 / span 1',
    }), '(f) case hors du cadre enregistrée : elle passe sous les autres, les autres gardent leur place');
    check((await bad.$$('.plateau-cell')).length === 7, '(f) disposition incohérente : les sept cases restent affichées');
    // Lieu absent de la disposition enregistrée : il passe sous les autres (la Fête, ligne 6)
    const sansFete = {
      place: { x: 0, y: 0, w: 4, h: 2 }, poste: { x: 4, y: 0, w: 4, h: 2 }, ventes: { x: 8, y: 0, w: 4, h: 2 },
      camp: { x: 0, y: 2, w: 4, h: 2 }, fabrique: { x: 4, y: 2, w: 4, h: 2 }, mairie: { x: 0, y: 4, w: 12, h: 1 },
    };
    const manque = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, init: pose(sansFete) });
    await settle(manque);
    check((await pos(manque, 'fete')) === '1 / span 4 | 6 / span 2', `(f) lieu absent de la disposition : il passe sous les autres (${await pos(manque, 'fete')})`);
    await manque.ctx.close();
    await bad.ctx.close();
  }

  {
    // Staff : seules ses cases ; l'enregistrement envoie les sept cases (pas d'effacement des autres)
    const s = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, scenario: { uid: '00000002-0000-4000-8000-000000000002', staff: ['cartes', 'journal'] } });
    await settle(s);
    check((await s.$$('.plateau-cell')).length === 3, '(f) Staff : trois cases visibles');
    await s.click('[data-plateau-edit]');
    await sleep(300);
    await s.focus('.plateau-cell[data-lieu="mairie"]');
    await s.keyboard.press('ArrowDown');
    await s.click('[data-plateau-save]');
    await sleep(400);
    const ecrS = await appels(s);
    const cS = ecrS[ecrS.length - 1]?.[2]?.p?.cells || {};
    check(Object.keys(cS).sort().join(',') === 'camp,fabrique,fete,mairie,place,poste,ventes', '(f) Staff : l’enregistrement envoie les sept cases');
    await s.ctx.close();
  }

  {
    // Erreurs : enregistrement refusé (reste en mode disposition) ; lecture en erreur (disposition par défaut)
    const e = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, scenario: { plateauFail: true } });
    await settle(e);
    await e.click('[data-plateau-edit]');
    await sleep(300);
    await e.focus('.plateau-cell[data-lieu="mairie"]');
    await e.keyboard.press('ArrowDown');
    await e.click('[data-plateau-save]');
    await sleep(400);
    check(await e.$('.plateau-board--edit') !== null && await e.evaluate(() => document.body.innerText.includes('Enregistrement impossible'))
      && !(await e.$eval('[data-plateau-save]', (b) => b.disabled)), '(f) enregistrement refusé : message d’erreur, reste en mode disposition, boutons de nouveau actifs');
    const errE = e.errs.filter((x) => !/Failed to load|404|favicon/.test(x));
    check(errE.length === 0, `(f) enregistrement refusé : aucune erreur JavaScript${errE.length ? ' : ' + errE.join(' | ') : ''}`);
    await e.ctx.close();

    const g = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 900, scenario: { plateauGetFail: true } });
    await settle(g);
    check(egal(await toutes(g), { place: '1 / span 4 | 1 / span 2', poste: '5 / span 4 | 1 / span 2', ventes: '9 / span 4 | 1 / span 2', camp: '1 / span 4 | 3 / span 2', fabrique: '5 / span 4 | 3 / span 2', fete: '9 / span 4 | 3 / span 2', mairie: '1 / span 12 | 5 / span 1' }),
      '(f) lecture de la disposition en erreur : disposition par défaut');
    const errG = g.errs.filter((x) => !/Failed to load|404|favicon/.test(x));
    check(errG.length === 0, `(f) lecture en erreur : aucune erreur JavaScript${errG.length ? ' : ' + errG.join(' | ') : ''}`);
    // « Modifier » sans disposition lue : refusé, sinon Enregistrer écraserait la disposition enregistrée
    await g.click('[data-plateau-edit]');
    await sleep(300);
    check(await g.$('.plateau-board--edit') === null && !(await g.isVisible('[data-plateau-save]')), '(f) lecture en erreur : pas de mode disposition, pas de bouton Enregistrer');
    check(await g.evaluate(() => document.body.innerText.includes('Disposition enregistrée illisible')), '(f) lecture en erreur : message clair');
    check((await appels(g)).length === 0, '(f) lecture en erreur : rien n’est envoyé');
    await g.ctx.close();

    // La lecture revient : « Modifier » la relit, et part de la disposition enregistrée
    const r = await openPage(browser, { now: HEURE, page: 'admin', width: 1280, height: 1150, scenario: { plateauGetFail: true },
      init: pose({ place: { x: 0, y: 0, w: 6, h: 2 }, poste: { x: 6, y: 0, w: 6, h: 2 }, ventes: { x: 0, y: 2, w: 4, h: 2 }, camp: { x: 4, y: 2, w: 4, h: 2 }, fabrique: { x: 8, y: 2, w: 4, h: 2 }, fete: { x: 0, y: 4, w: 4, h: 2 }, mairie: { x: 0, y: 6, w: 12, h: 1 } }) });
    await settle(r);
    await r.evaluate(async () => {
      const { sb } = await import('/assets/commun/core.js');
      const rpc = sb.rpc.bind(sb);
      sb.rpc = (fn, a) => (fn === 'hg_admin_plateau_get' ? Promise.resolve({ data: JSON.parse(localStorage.getItem('hg_fake_plateau')), error: null }) : rpc(fn, a));
    });
    await r.click('[data-plateau-edit]');
    await sleep(300);
    check(await r.$('.plateau-board--edit') !== null && (await pos(r, 'place')) === '1 / span 6 | 1 / span 2', '(f) lecture revenue : le mode disposition part de la disposition enregistrée');
    await r.ctx.close();
  }

  {
    // Téléphone 390 px : pas de bouton, une colonne, pas de défilement horizontal
    const t = await openPage(browser, { now: HEURE, page: 'admin', width: 390, height: 844, mobile: true, dpr: 2 });
    await settle(t);
    check((await t.$eval('[data-plateau-edit]', (b) => getComputedStyle(b).display)) === 'none', '(f) téléphone 390 px : bouton « Modifier la disposition » masqué');
    const cw = await t.$$eval('.plateau-cell', (cs) => cs.map((c) => c.getBoundingClientRect().width));
    check(cw.length === 7 && cw.every((w) => w > 300), `(f) téléphone : une colonne, cases pleine largeur (${Math.round(cw[0])} px)`);
    check((await hscroll(t)) <= 0, '(f) téléphone : pas de défilement horizontal');
    await t.ctx.close();
  }

  await browser.close();
  finish();
})();
