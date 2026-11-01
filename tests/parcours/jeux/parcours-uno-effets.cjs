require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours des effets du Uno (maquette validée, scènes UNa à UNp) : ma carte vole dès le clic et atterrit sur la défausse, sans
// attendre le serveur ; refus du serveur : elle revient ; carte d'un adversaire ; compteurs cohérents avec les cartes en vol ;
// annonces UNO et Bluff ; rafale et reprise après une veille sans longue suite d'effets ; roue (focus piégé, rendu) ;
// mouvement réduit (pas d'animation, état juste, sons conservés) ; téléphone sans débordement ; podium mis en scène une seule
// fois ; aucun nœud orphelin en quittant la table. Faux serveur : fixtures/fake-uno-table.js (les règles sont testées en SQL).
const { check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

const CODE = 'HGUNO-4242';
const UNO_PAGE = { slug: 'uno', label: 'Uno', mode: 'membres', in_nav: false, sort: 900 };
const ouvrir = (browser, o = {}) => openPage(browser, { page: 'uno', init: 'fake-uno-table.js', hash: `#partie/${CODE}`, width: 1280, height: 900, ...o, scenario: { pagesExtra: [UNO_PAGE], ...(o.scenario || {}) } });
const pret = (p) => p.waitForSelector('.uno-fan-carte button', { timeout: 8000 });
const vols = (p) => p.locator('.uno-calque .uno-fx-vol').count();
const dessus = (p) => p.locator('.uno-pile-haut .uc').getAttribute('aria-label');
const nbSiege = (p, nom) => p.locator('.uno-siege', { hasText: nom }).locator('[data-nb]').innerText();
/** Action du faux serveur, puis relecture de l'état par la page. */
const appels = async (p, fn) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === fn);
const serveur = (p, fn) => p.evaluate(`(() => { const u = window.__UNO; (${fn})(u); u.avance(); u.relire(); })()`);

(async () => {
  const browser = await chromium.launch();
  const erreurs = [];
  const suivre = (p) => p.on('pageerror', (e) => erreurs.push(e.message));

  // ----- Ordinateur : pose, impact, adversaire -----
  let p = await ouvrir(browser);
  suivre(p);
  await pret(p);
  check((await p.locator('.uno-fan-carte').count()) === 6, 'table ouverte : six cartes en main');
  check((await dessus(p)) === 'Rouge 9', 'défausse : le dessus de l\'état');
  check((await p.locator('.uno-calque').getAttribute('aria-hidden')) === 'true', 'calque des vols masqué aux lecteurs d\'écran');

  // UNa : la réponse du serveur est lente, la carte part quand même tout de suite.
  await p.evaluate(() => { window.__UNO.latence = 700; });
  const sonsAvant = await p.evaluate(() => window.__SONS);
  await p.click('button[data-carte="101"]');
  check((await vols(p)) === 1, 'UNa : la carte vole dès le clic, sans attendre le serveur');
  check((await p.locator('.uno-fan-carte').count()) === 5, 'UNa : elle a quitté l\'éventail');
  check((await p.locator('.uno-moi-detail').innerText()) === '5 cartes', 'UNa : mon compteur suit');
  await sleep(520);
  check((await dessus(p)) === 'Rouge 7', 'UNa : posée sur la défausse à l\'atterrissage, avant la réponse');
  check((await p.locator('.uno-pile-bas').count()) >= 1, 'UNa : la carte d\'avant reste dessous');
  check((await vols(p)) === 0, 'UNa : plus aucun nœud volant après l\'atterrissage');
  check((await p.evaluate(() => window.__SONS)) > sonsAvant, 'UN1 et UN2 : sons joués');
  await sleep(900);
  await p.evaluate(() => { window.__UNO.latence = 0; });
  check((await dessus(p)) === 'Rouge 7' && (await p.locator('.uno-pile-bas').count()) >= 1, 'UNa : confirmé par le serveur, la défausse ne bouge pas');
  check((await p.locator('.uno-calque > *').count()) === 0, 'calque vide après l\'impact');

  // UNb : un adversaire pose.
  await serveur(p, `(u) => { u.adversaire(u.BRUNO, 'b', '4'); u.etat().partie.tour = u.CHLOE; }`);
  await p.waitForSelector('.uno-calque .uno-fx-vol', { timeout: 2000 });
  check((await dessus(p)) === 'Rouge 7', 'UNb : la défausse attend l\'atterrissage');
  check((await p.locator('.uno-siege.est-tour').innerText()).includes('Chloé'), 'UNb : le tour change tout de suite (les effets ne le retardent pas)');
  await p.waitForFunction(() => document.querySelector('.uno-pile-haut .uc')?.getAttribute('aria-label') === 'Bleu 4', null, { timeout: 2000 });
  check((await nbSiege(p, 'Bruno')) === '6 cartes', 'UNb : compteur du siège à jour');

  // Effets sur un siège : les compteurs suivent les vols et finissent sur la valeur du serveur.
  await serveur(p, `(u) => { u.ligne(u.CHLOE, 'pioche', 'Chloé pioche 4 cartes et passe son tour.'); u.recoit(u.CHLOE, 4); }`);
  await sleep(140);
  const pendant = await nbSiege(p, 'Chloé');
  check(pendant !== '8 cartes', `+4 : le compteur ne saute pas d'un coup (${pendant})`);
  check((await p.locator('.uno-coup').count()) === 1, '+4 : le coup jaillit du siège');
  await p.waitForFunction(() => [...document.querySelectorAll('.uno-siege')].some((s) => s.textContent.includes('Chloé') && s.querySelector('[data-nb]').textContent === '8 cartes'), null, { timeout: 3000 });
  check(true, '+4 : le compteur finit sur la valeur du serveur');
  await sleep(1600);
  check((await p.locator('.uno-coup').count()) === 0 && (await p.locator('.uno-calque > *').count()) === 0, '+4 : aucun nœud orphelin');
  check((await p.locator('.uno-siege-photo.touche').count()) === 0, '+4 : la photo ne garde pas la classe d\'animation');

  // Bluff : le résultat se lit dans le journal, pour tout le monde.
  await serveur(p, `(u) => { const e = u.etat(); e.partie.defi = { poseur: u.BRUNO, cible: u.CHLOE }; }`);
  await sleep(250);
  await serveur(p, `(u) => { const e = u.etat(); e.partie.defi = null; u.ligne(u.CHLOE, 'defi', 'Chloé conteste avec raison : Bruno avait une carte de la bonne couleur et pioche 4 cartes.'); u.recoit(u.BRUNO, 4); }`);
  await p.waitForSelector('.uno-annonce.go', { timeout: 2000 });
  check((await p.locator('.uno-annonce').innerText()).includes('Bluff'), 'UNl : annonce Bluff !, même pour un autre joueur');
  check((await p.locator('.uno-annonce').textContent()).includes('Bruno pioche 4 cartes'), 'UNl : le tricheur est nommé');
  await sleep(2200);
  check((await p.locator('.uno-annonce.go').count()) === 0, 'annonce retirée après son passage');
  check((await p.locator('.uno-annonce').innerHTML()) === '', 'annonce vidée');

  // UNc : Passe : le jeton roule jusqu'au siège, puis le tampon tombe.
  await serveur(p, `(u) => { u.adversaire(u.BRUNO, 'r', 'passe'); u.ligne(u.CHLOE, 'info', 'Chloé passe son tour.'); }`);
  await p.waitForSelector('.uno-calque .uno-fx-jeton', { timeout: 2500 });
  check(true, 'UNc : le jeton Passe roule vers le siège');
  await p.waitForSelector('.uno-siege-photo.bloque', { timeout: 2000 });
  check((await p.locator('.uno-coup').innerText()) === 'Bloqué !', 'UNc : Bloqué ! et tampon sur le siège');
  await sleep(1700);

  // UNd : Inversion : l'anneau repart à l'envers, le sens change tout de suite.
  await serveur(p, `(u) => { u.etat().partie.sens = -1; u.adversaire(u.BRUNO, 'r', 'inv'); }`);
  await sleep(100);
  check((await p.locator('.uno-sens.inverse').count()) === 1, 'UNd : le sens affiché change tout de suite');
  await p.waitForSelector('.uno-ovale.uno-fx-vrille.inverse', { timeout: 2000 });
  check((await p.locator('.uno-annonce').innerText()).includes('Inversion'), 'UNd : annonce Inversion et anneau à l\'envers');
  await sleep(2000);

  // UNh : je pioche : une carte vole jusqu'à ma main.
  await serveur(p, `(u) => { u.etat().partie.tour = u.ME; u.etat().main.forEach((c) => { c.jouable = false; }); }`);
  await p.waitForSelector('.uno-pioche.oblige', { timeout: 2000 });
  const mainAvant = await p.locator('.uno-fan-carte').count();
  await p.click('.uno-pioche', { force: true });
  await p.waitForSelector('.uno-calque .uno-fx-vol', { timeout: 2000 });
  check((await p.locator('.uno-fan-carte.arrive').count()) === 1, 'UNh : la carte attend son vol');
  check((await p.locator('.uno-moi-detail').innerText()) === `${mainAvant} cartes`, 'UNh : mon compteur attend l\'arrivée');
  await sleep(600);
  check((await p.locator('.uno-fan-carte.arrive').count()) === 0, 'UNh : carte arrivée');
  check((await p.locator('.uno-moi-detail').innerText()) === `${mainAvant + 1} cartes`, 'UNh : compteur juste à l\'arrivée');

  // UNm : défi raté : six cartes pour moi, en rafale ; une action reste possible pendant les vols.
  await serveur(p, `(u) => { const e = u.etat(); e.partie.tour = u.ME; e.partie.defi = { poseur: u.BRUNO, cible: u.ME }; }`);
  await p.waitForSelector('[data-defi="oui"]', { timeout: 2000 });
  await p.click('.uno-defi-texte');
  await sleep(150);
  check((await appels(p, 'hg_uno_contester')).length === 0, 'défi : un clic sur le texte du bandeau ne répond pas à ma place');
  await serveur(p, `(u) => { const e = u.etat(); e.partie.defi = null; e.partie.tour = u.CHLOE; u.ligne(u.ME, 'defi', 'Moi conteste à tort et pioche 6 cartes.'); u.recoit(u.ME, 6); }`);
  await p.waitForSelector('.uno-annonce.go', { timeout: 2000 });
  check((await p.locator('.uno-annonce').textContent()).includes('6 cartes pour toi'), 'UNm : annonce Raté !');
  check((await p.locator('.uno-fan-carte.arrive').count()) === 6, 'UNm : les six cartes attendent leur vol');
  check((await p.locator('[data-chat-bouton]').isEnabled()), 'UNm : la table reste utilisable');
  await p.waitForFunction(() => !document.querySelector('.uno-fan-carte.arrive'), null, { timeout: 4000 });
  check((await p.locator('.uno-moi-detail').innerText()) === `${mainAvant + 7} cartes`, 'UNm : compteur juste à la fin');
  await p.close();

  // ----- Refus du serveur : la carte revient -----
  p = await ouvrir(browser);
  suivre(p);
  await pret(p);
  await p.evaluate(() => { window.__UNO.refus = true; window.__UNO.latence = 300; });
  await p.click('button[data-carte="100"]');
  check((await p.locator('.uno-fan-carte').count()) === 5, 'refus : la carte part d\'abord');
  await sleep(700);
  check((await p.locator('.uno-fan-carte').count()) === 6, 'refus : la carte revient en main');
  check((await dessus(p)) === 'Rouge 9', 'refus : la défausse redevient celle de l\'état');
  check((await p.locator('.uno-moi-detail').innerText()) === '6 cartes', 'refus : compteur juste');
  await sleep(600);
  check((await p.locator('.uno-calque > *').count()) === 0, 'refus : calque vide');
  await p.evaluate(() => { window.__UNO.refus = false; window.__UNO.latence = 0; });

  // ----- Une pose à la fois : tant que l'état ne l'a pas confirmée, une autre action est refusée -----
  await p.evaluate(() => { window.__UNO.latence = 450; });
  await p.click('button[data-carte="100"]');
  await sleep(650);                     // la réponse est arrivée, la relecture de l'état pas encore
  await p.locator('button[data-carte="101"]').evaluate((n) => n.click());
  await p.locator('.uno-pioche').evaluate((n) => n.click());
  check((await p.locator('.uno-fan-carte').count()) === 5, 'pose en attente de l\'état : la carte ne revient pas, la suivante ne part pas');
  await p.waitForFunction(() => document.querySelector('.uno-pile-haut .uc')?.getAttribute('aria-label') === 'Rouge 3', null, { timeout: 3000 });
  await sleep(600);
  check((await appels(p, 'hg_uno_jouer')).filter((a) => a[2].p_carte === 100).length === 2
    && (await appels(p, 'hg_uno_jouer')).every((a) => a[2].p_carte === 100) && (await appels(p, 'hg_uno_piocher')).length === 0, 'pose en attente de l\'état : aucune seconde action envoyée');
  check((await dessus(p)) === 'Rouge 3' && (await p.locator('.uno-fan-carte').count()) === 5, 'pose en attente de l\'état : la pose acceptée n\'est pas annulée');
  await p.close();

  // ----- Le serveur ne répond pas : l'état relu fait foi, la table ne reste pas bloquée -----
  p = await ouvrir(browser);
  suivre(p);
  await pret(p);
  await p.evaluate(() => { window.__UNO.muet = 'refuse'; });
  await p.click('button[data-carte="100"]');
  await sleep(9400);
  check((await p.locator('.uno-fan-carte').count()) === 6 && (await dessus(p)) === 'Rouge 9', 'sans réponse : pose annulée, l\'état reprend la main');
  await p.evaluate(() => { window.__UNO.muet = 'accepte'; });
  await p.click('button[data-carte="101"]');
  check((await vols(p)) === 1, 'sans réponse : la table n\'est pas restée bloquée, une nouvelle action part');
  await sleep(9600);
  check((await dessus(p)) === 'Rouge 7' && (await p.locator('.uno-fan-carte').count()) === 5, 'accepté sans réponse : la relecture fait foi');
  await p.evaluate(() => { window.__UNO.muet = null; });
  await sleep(700);

  // ----- Rafale et reprise : pas de longue suite d'effets, l'état est juste -----
  await serveur(p, `(u) => { for (const [id, c] of [[u.BRUNO, '1'], [u.CHLOE, '2'], [u.DAVID, '3'], [u.BRUNO, '4'], [u.CHLOE, '5']]) u.adversaire(id, 'g', c); }`);
  await p.waitForSelector('.uno-calque .uno-fx-vol', { timeout: 2000 });
  check((await vols(p)) === 1, 'rafale de cinq coups : une seule carte vole, la dernière');
  await p.waitForFunction(() => document.querySelector('.uno-pile-haut .uc')?.getAttribute('aria-label') === 'Vert 5', null, { timeout: 2000 });
  await sleep(700);
  await serveur(p, `(u) => { u.adversaire(u.DAVID, 'y', '8', 40); }`);
  await sleep(200);
  check((await dessus(p)) === 'Jaune 8', 'reprise après une veille : l\'état est juste tout de suite');
  check((await p.locator('.uno-calque > *').count()) === 0, 'reprise : aucun effet pour une ligne périmée');
  // Retour d'onglet : la même version ne rejoue rien.
  await p.evaluate(() => window.__UNO.relire());
  await sleep(200);
  check((await p.locator('.uno-calque > *').count()) === 0 && (await p.locator('.uno-annonce.go').count()) === 0, 'changement d\'onglet : rien ne rejoue');

  // ----- Roue : focus piégé et rendu ; UNO -----
  await serveur(p, `(u) => { u.etat().partie.tour = u.ME; }`);
  await p.waitForSelector('.uno-moi-photo.est-tour', { timeout: 2000 });
  await p.focus('button[data-carte="104"]');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.uno-roue-voile', { timeout: 2000 });
  check(await p.evaluate(() => document.querySelector('.uno-roue-voile').contains(document.activeElement)), 'UNg : le focus entre dans la roue');
  await p.keyboard.press('Shift+Tab');
  check(await p.evaluate(() => document.activeElement.matches('[data-annuler]')), 'roue : Maj+Tab depuis le premier bouton boucle sur le dernier');
  await p.keyboard.press('Tab');
  check(await p.evaluate(() => document.activeElement.matches('[data-couleur-choix]')), 'roue : Tab depuis le dernier revient au premier');
  await p.keyboard.press('Escape');
  check(await p.evaluate(() => document.activeElement.dataset.carte === '104'), 'roue : Échap rend le focus à la carte');
  await p.keyboard.press('Enter');
  await p.waitForSelector('.uno-roue-voile', { timeout: 2000 });
  await p.click('.uno-roue .q-b');
  check((await vols(p)) === 1, 'UNg : le Joker part dès le choix de la couleur');
  check(await p.evaluate(() => document.querySelector('.uno-main-cartes').contains(document.activeElement)), 'UNg : le focus reste dans la main, pas perdu');
  await sleep(700);
  check((await p.locator('.uno-onde-tapis u').evaluate((n) => Number(getComputedStyle(n).opacity))) > 0, 'UNg : le tapis garde une teinte de la couleur');
  await serveur(p, `(u) => { u.adversaire(u.BRUNO, 'r', '2'); }`);
  await sleep(1300);
  check((await p.locator('.uno-onde-tapis u').evaluate((n) => Number(getComputedStyle(n).opacity))) === 0, 'la teinte s\'en va avec la couleur demandée');
  await p.close();

  // ----- UNO et dernière carte -----
  p = await ouvrir(browser, { scenario: { main: [['r', '3'], ['b', '5']] } });
  suivre(p);
  await pret(p);
  await p.click('button[data-carte="100"]');
  await sleep(600);
  await p.click('.uno-btn', { force: true }); // le bouton pulse : jamais « stable » pour Playwright
  await p.waitForSelector('.uno-annonce.go', { timeout: 2000 });
  check((await p.locator('.uno-annonce').innerText()).includes('UNO'), 'UNj : grande annonce UNO');
  check((await p.locator('.uno-ovale.uno-fx-vrille').count()) === 1, 'UNj : un tour d\'anneau');
  check((await p.locator('.uno-journal').innerText()).includes('crie UNO'), 'annonce lue : ligne ajoutée au journal (aria-live)');
  await p.waitForSelector('.uno-moi-photo .uno-badge-siege', { timeout: 2000 });
  await serveur(p, `(u) => { const e = u.etat(); e.partie.tour = u.ME; e.main[0].jouable = true; }`);
  await p.waitForSelector('button[data-carte="101"].jouable', { timeout: 2000 });
  await sleep(1800);
  await p.click('button[data-carte="101"]');
  await sleep(1000);
  check((await p.locator('.uno-table').count()) === 1, 'UNn : la table reste visible après la dernière carte');
  check((await p.locator('.uno-fx-pluie').count()) > 0, 'UNn : pluie de petites cartes');
  check((await p.locator('.uno-annonce').innerText()).includes('Main vide'), 'UNn : annonce Main vide !');
  await p.waitForSelector('.uno-podium', { timeout: 5000 });
  check((await p.locator('.uno-fx-pluie').count()) === 0 && (await p.locator('.uno-calque').count()) === 0, 'écran de fin : plus aucun nœud de la table');
  check((await p.locator('.uno-fx-tampon').isHidden()), 'UNo : le tampon attend la montée du podium');
  await p.waitForSelector('.uno-fx-tampon.go', { timeout: 3000 });
  check(await p.locator('.uno-podium.uno-fx-cogne').count() === 1, 'UNo : le tampon tombe et le podium encaisse le coup');
  check((await appels(p, 'hg_uno_rejouer')).length === 0, 'UNo : aucune revanche demandée sans clic');
  check((await p.locator('.uno-fx-tampon').innerText()) === 'VICTOIRE', 'UNo : tampon VICTOIRE sur ma marche');
  check((await p.locator('.uno-podium-col.rang-1 .uno-fx-tampon').count()) === 1 && (await p.locator('.uno-fx-tampon').count()) === 1, 'UNo : un seul tampon, sur ma marche');
  await sleep(1100);
  check((await p.locator('.uno-fin-pailles').innerText()) === '+210', 'UNo : les Paillettes ont fini de défiler');
  check((await p.locator('.uno-fin-pailles').getAttribute('aria-label')) === '210 Paillettes', 'UNo : le gain est lu directement');
  await p.screenshot({ path: __dirname + '/../../shots/uno-podium.png', fullPage: true });
  await p.close();

  // ----- Ouverture directe de l'écran de fin (rechargement) : d'un bloc, sans son -----
  p = await ouvrir(browser, { scenario: { fin: true } });
  suivre(p);
  await p.waitForSelector('.uno-podium', { timeout: 8000 });
  check(await p.locator('.uno-fx-tampon').isVisible(), 'ouverture directe : le tampon est déjà là');
  check((await p.locator('.uno-fin-pailles').innerText()) === '+210', 'ouverture directe : le gain est déjà là');
  check((await p.locator('#uno-fin-gain-titre').innerText()) === 'Tes gains', 'ouverture directe : titre « Tes gains »');
  check((await p.evaluate(() => window.__SONS)) === 0, 'ouverture directe : aucun son, la mise en scène ne rejoue pas');
  await p.close();

  // ----- Partie gagnée sans 2 membres (migration 191) : jouable jusqu'au bout, aucun gain promis -----
  p = await ouvrir(browser, { scenario: { fin: true, sansGain: true } });
  await p.waitForSelector('.uno-podium', { timeout: 8000 });
  check((await p.locator('.uno-fin-recompense').innerText()).includes('Aucune Paillette cette fois') && (await p.locator('.uno-fin-pailles').count()) === 0, 'sans gain : « Aucune Paillette cette fois », pas de compteur');
  check(!(await p.locator('.uno-fin-recompense').innerText()).includes('Tu gagnes'), 'sans gain : le titre ne promet rien');
  await p.close();

  // ----- Mouvement réduit : pas d'animation, état juste, sons conservés -----
  p = await ouvrir(browser, { reducedMotion: 'reduce' });
  suivre(p);
  await pret(p);
  const sons0 = await p.evaluate(() => window.__SONS);
  await p.click('button[data-carte="100"]');
  check((await vols(p)) === 0, 'mouvement réduit : pas de vol');
  await p.waitForFunction(() => document.querySelector('.uno-pile-haut .uc')?.getAttribute('aria-label') === 'Rouge 3', null, { timeout: 2000 });
  check((await p.locator('.uno-fan-carte').count()) === 5, 'mouvement réduit : état juste');
  check((await p.evaluate(() => window.__SONS)) > sons0, 'mouvement réduit : sons conservés');
  await serveur(p, `(u) => { const e = u.etat(); e.partie.sens = -1; u.adversaire(u.BRUNO, 'r', 'inv'); }`);
  await sleep(300);
  check((await p.locator('.uno-sens.inverse').count()) === 1, 'mouvement réduit : sens inversé affiché');
  check((await p.locator('.uno-annonce.go').count()) === 0, 'mouvement réduit : pas de grande annonce');
  check((await p.locator('.uno-calque > *').count()) === 0 && (await p.locator('.uno-ovale.uno-fx-vrille').count()) === 0, 'mouvement réduit : aucun nœud ni tour d\'anneau');
  check((await p.locator('.uno-journal').innerText()).includes('Bruno pose'), 'mouvement réduit : le journal annonce le coup');
  await p.close();

  // ----- Téléphone : pas de débordement pendant les effets -----
  p = await ouvrir(browser, { width: 390, height: 844, mobile: true, dpr: 2 });
  suivre(p);
  await pret(p);
  await serveur(p, `(u) => { u.adversaire(u.BRUNO, 'r', '5'); u.ligne(u.CHLOE, 'pioche', 'Chloé pioche 2 cartes et passe son tour.'); u.recoit(u.CHLOE, 2); }`);
  await sleep(760);
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal pendant les vols');
  await serveur(p, `(u) => { u.ligne(u.CHLOE, 'uno', 'Chloé crie UNO !'); }`);
  await sleep(300);
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal pendant une annonce');
  await p.screenshot({ path: __dirname + '/../../shots/uno-tel.png', fullPage: true });
  // Quitter la table retire le calque.
  await p.evaluate(() => { location.hash = '#stats'; });
  await sleep(500);
  check((await p.locator('.uno-calque').count()) === 0, 'quitter la table : le calque est retiré');
  await p.close();

  check(erreurs.length === 0, `aucune erreur JS${erreurs.length ? ` : ${erreurs.slice(0, 3).join(' | ')}` : ''}`);
  await browser.close();
  finish();
})();
