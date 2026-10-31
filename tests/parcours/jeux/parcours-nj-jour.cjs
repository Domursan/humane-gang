// Parcours NJ (jeux du jour « devine en 6 essais », idées N1 à N6) : Pays du jour, Jeu vidéo du jour et Réplique du jour
// joués jusqu'au bout (un faux essai, un « Passer », la bonne réponse), une partie perdue en 6 essais (Réplique), les autres
// onglets ouverts sans erreur, pas de manche, copie du résultat, 390 et 360 px sans défilement horizontal, aucune erreur JS.
// Faux Supabase : fixtures/fake-sb-nj.mjs (réponses et distances fixes : Chili, Stardew Valley, Le Dîner de cons).
const { check, finish, openPage, hscroll, log, sleep, chromium, SHOTS } = require('../../lib/harness.cjs');

/** Presse-papiers simulé (hors contexte sécurisé, navigator.clipboard est absent) : le texte copié va dans window.__CLIP. */
/** Erreurs de la page qui concernent ce parcours (les modules des autres jeux du jour, pas encore livrés, répondent 404). */
const mesErreurs = (p) => p.errs.filter((e) => !/jeux\/nj-(?!devine|carte|jv|pochette|replique|pays|plat)[a-z0-9-]+\.js/.test(e));

const CLIP_FAUX = () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__CLIP = t; } }, configurable: true }); };

/** Attend que le nombre d'essais affichés atteigne k (ou que la partie soit finie). */
const attendEssais = (p, k) => p.waitForFunction((n) => document.querySelectorAll('.nj-try').length === n || !!document.querySelector('.nj-fin'), k, { timeout: 4000 }).catch(() => {});
/** Essais des appels faits au serveur (p_texte). */
const envois = async (p) => (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_nj_essai').map((e) => e[2].p_texte);
/** Saisit un texte dans le champ de réponse. */
const tape = async (p, t) => { await p.fill('#nj-input', t); await sleep(120); };
/** Valide la saisie (clic sur Valider) puis attend le nouvel essai. */
const valide = async (p) => { const n = await p.locator('.nj-try').count(); await p.click('#nj-form [data-act="valider"]'); await attendEssais(p, n + 1); await sleep(150); };
/** Passe (indice débloqué) puis attend le nouvel essai. */
const passe = async (p) => { const n = await p.locator('.nj-try').count(); await p.click('[data-act="passer"]'); await attendEssais(p, n + 1); await sleep(150); };
/** Attend la fin de l'habillage de la carte de fin : tampon posé et gain arrivé à sa valeur finale (ex. « +10 »). */
const attendFin = (p, gain) => p.waitForFunction((g) => { const v = document.querySelector('.nj-gain-v'); return !!document.querySelector('.fxj-tampon') && !!v && v.textContent.startsWith(g + ' '); }, gain, { timeout: 5000 }).catch(() => {});
/** Ouvre un jeu du jour dans son onglet. */
const ouvre = (browser, hash, extra = {}) => openPage(browser, { page: 'jeux', fixture: 'fake-sb-nj.mjs', hash, width: 390, height: 900, ...extra })
  .then(async (p) => { await p.waitForSelector('.nj-title', { timeout: 6000 }).catch(() => {}); await sleep(200); return p; });

(async () => {
  const browser = await chromium.launch();

  /* ---------- Pays du jour (390 px) : faux essai, passer, faux essai (3e erreur : photo), bonne réponse ---------- */
  let p = await ouvre(browser, '#pays');
  check((await p.locator('.nj-title').textContent()) === 'Pays du jour', 'pays : titre « Pays du jour »');
  check((await p.locator('.nj-kicker').textContent()) === 'JEU DU JOUR · N°16', 'pays : en-tête « JEU DU JOUR · N°16 »');
  check((await p.locator('.nj-pills').textContent()).includes('Essai 1 / 6') && (await p.locator('.nj-pills').textContent()).includes('Points max 10'), 'pays : pastilles « Essai 1 / 6 » et « Points max 10 »');
  check((await p.locator('.nj-grille path').getAttribute('d')).startsWith('M30 0'), 'pays : silhouette tracée (SVG du serveur)');
  check((await p.locator('.nj-photo-vide').count()) === 1 && (await p.locator('.nj-photo img').count()) === 0, 'pays : emplacement « Photo débloquée à la 3e erreur »');
  check((await p.locator('.nj-ind').count()) === 3 && (await p.locator('.nj-ind.is-verrouille').count()) === 3, 'pays : 3 indices, tous verrouillés au départ');
  check((await p.locator('[class*="fxj-"]').count()) === 0, 'effets : aucun effet à l’ouverture d’une partie');
  check(await p.locator('#nj-form [data-act="valider"]').isDisabled(), 'pays : « Valider » désactivé tant que rien n’est choisi');
  await tape(p, 'Chi');
  check((await p.locator('#nj-list [role="option"]').count()) === 2, 'pays : « Chi » propose Chili et Chine');
  check(await p.locator('#nj-form [data-act="valider"]').isDisabled(), 'pays : « Chi » (pas une réponse) : « Valider » reste désactivé');
  check((await p.locator('#nj-hint').textContent()).includes('Choisis une réponse'), 'pays : indication « Choisis une réponse dans la liste »');
  await tape(p, 'bresil');
  check((await p.locator('#nj-list').isHidden()), 'pays : « bresil » (sans accent) est exactement Brésil : pas de liste qui recouvre Valider');
  check(!(await p.locator('#nj-form [data-act="valider"]').isDisabled()), 'pays : « bresil » correspond à Brésil : « Valider » actif');
  await valide(p);
  check((await p.locator('.nj-pip.is-miss').count()) === 1 && (await p.locator('.nj-try.is-miss').textContent()).includes('Brésil'), 'essai 1 : Brésil raté, pastille rouge');
  check((await p.locator('.nj-try.is-miss .nj-km').textContent()).includes('2 900 km') || (await p.locator('.nj-try.is-miss .nj-km').textContent()).includes('km'), 'essai 1 : distance affichée');
  check((await p.locator('.nj-try.is-miss .nj-dir').textContent()).trim() !== '', 'essai 1 : flèche de direction affichée');
  check((await p.locator('.nj-prox').count()) === 1, 'essai 1 : barre de proximité affichée');
  check((await p.locator('.nj-ind:not(.is-verrouille)').count()) === 1, 'essai 1 : un indice débloqué');
  check((await p.locator('.nj-pip.fxj-saut').count()) === 1, 'effets : la pastille de l’essai saute');
  check((await p.locator('.jd-combo.fxj-secoue').count()) === 1, 'effets : mauvais essai, le champ est secoué');
  await sleep(450);
  check((await p.locator('.nj-ind.fxj-lueur').count()) === 1, 'effets : l’indice débloqué s’éclaire');
  check((await p.locator('.nj-tries .nj-prox > span').evaluate((s) => s.style.width)) !== '0px', 'effets : la barre de proximité est remplie après son animation');
  check((await p.locator('.nj-pills').textContent()).includes('Essai 2 / 6'), 'essai 1 : « Essai 2 / 6 »');
  await passe(p);
  check((await p.locator('.nj-pip.is-pass').count()) === 1 && (await p.locator('.nj-try.is-pass').count()) === 1, 'passer : pastille grise et essai « Passé »');
  check((await p.locator('.nj-ind:not(.is-verrouille)').count()) === 2, 'passer : deuxième indice débloqué');
  await tape(p, 'Pérou');
  await valide(p);
  check((await p.locator('.nj-photo img').count()) === 1 && (await p.locator('.nj-photo-vide').count()) === 0, '3e erreur : la photo du pays apparaît (« Indice photo »)');
  check((await p.locator('.nj-cap-or').textContent()).includes('Indice photo'), 'photo : légende « Indice photo »');
  check((await p.locator('.nj-photo.fxj-pop').count()) === 1, 'effets : la photo du pays apparaît en pop');
  await tape(p, 'Chil');
  await p.click('#nj-list [role="option"]');
  check((await p.locator('#nj-input').inputValue()) === 'Chili', 'suggestion cliquée : le champ reçoit « Chili »');
  check(!(await p.locator('#nj-form [data-act="valider"]').isDisabled()), 'suggestion cliquée : « Valider » actif');
  await valide(p);
  await attendFin(p, '+10');
  check((await p.locator('.nj-fin .fxj-tampon').textContent()) === '3 PTS' && (await p.locator('.nj-fin.fxj-entree').count()) === 1, 'effets : trouvé, la carte de fin entre et reçoit le tampon « 3 PTS »');
  check((await p.locator('.nj-fin').evaluate((c) => c.style.visibility)) === '', 'effets : la carte de fin est visible');
  check((await p.locator('.fxj-gain').count()) === 0, 'effets : le gain n’est pas affiché en double');
  check((await p.locator('.nj-fin.is-win').count()) === 1, 'fin : bandeau gagné');
  check((await p.locator('.nj-fin').textContent()).includes('Trouvé en 4 essais') && (await p.locator('.nj-fin').textContent()).includes('Chili'), 'fin : « Trouvé en 4 essais » et la réponse « Chili »');
  check((await p.locator('.nj-fin').textContent()).includes('+10 ✦ crédités'), 'fin : « +10 ✦ crédités »');
  check((await p.locator('.nj-det').textContent()).includes('Santiago'), 'fin : détail « Capitale : Santiago »');
  check((await p.locator('.nj-pills').textContent()).includes('Points 3'), 'fin : pastille « Points 3 » (trouvé à l’essai 4)');
  check((await p.locator('#nj-form').count()) === 0, 'fin : le champ de réponse disparaît');
  check((await p.locator('.nj-board .jd-board-row').count()) >= 2, 'classement de la semaine affiché');
  check((await p.locator('.nj-regles .nj-bareme li').count()) === 6, 'barème : 6 cases');
  check((await p.locator('.nj-regles .nj-bp').allInnerTexts()).join(',') === '10,9,8,7,6,5', 'barème : 10 points au 1er essai, 5 au 6e');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]');
  await sleep(200);
  check((await p.evaluate(() => window.__CLIP)) === 'Pays du jour #16 4/6\n🟥⬜🟥🟩⬜⬜', 'copier : texte façon Framed avec carrés');
  const envoyes = await envois(p);
  check(JSON.stringify(envoyes) === JSON.stringify(['Brésil', null, 'Pérou', 'Chili']), 'serveur : essais envoyés dans l’ordre (Brésil, passer, Pérou, Chili)');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: SHOTS + '/nj-pays-390.png', fullPage: true });
  check(mesErreurs(p).length === 0, 'pays : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Pays du jour (1280 px) : une erreur et un passer, photo et indices visibles ---------- */
  p = await ouvre(browser, '#pays', { width: 1280 });
  await tape(p, 'Pérou');
  await valide(p);
  await passe(p);
  check((await p.locator('.nj-main').boundingBox()).x < (await p.locator('.nj-aside').boundingBox()).x, '1280 px (pays) : jeu à gauche, règles à droite');
  await p.screenshot({ path: SHOTS + '/nj-pays-1280.png', fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px (pays) : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'pays 1280 px : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Jeu vidéo (1280 px) : zoom qui se relâche, faux essai, passer, bonne réponse ---------- */
  p = await ouvre(browser, '#jeu-video', { width: 1280 });
  check((await p.locator('.nj-title').textContent()) === 'Jeu vidéo du jour', 'jv : titre « Jeu vidéo du jour »');
  check((await p.locator('.nj-jv img').getAttribute('style')).includes('scale(5)'), 'jv : zoom 5 au départ');
  check((await p.locator('.nj-media.is-loading').count()) === 0 && (await p.locator('.nj-jv img').evaluate((i) => i.complete && i.naturalWidth > 0)), 'jv : capture chargée (pas de cadre en attente)');
  check((await p.locator('.nj-aside').count()) === 1 && (await p.locator('.nj-main').boundingBox()).x < (await p.locator('.nj-aside').boundingBox()).x, '1280 px : jeu à gauche, règles à droite');
  await p.evaluate(() => { document.querySelector('.nj-jv img').dataset.garde = '1'; });
  await tape(p, 'Hades');
  await valide(p);
  check((await p.locator('.nj-jv img[data-garde]').count()) === 1, 'jv : l’image est gardée d’un dessin à l’autre (le zoom se relâche en douceur)');
  check((await p.locator('.nj-jv img').getAttribute('style')).includes('scale(4)'), 'jv : zoom 4 après une erreur');
  await passe(p);
  check((await p.locator('.nj-jv img').getAttribute('style')).includes('scale(3)'), 'jv : zoom 3 après un passer');
  check((await p.locator('.nj-ind:not(.is-verrouille)').count()) === 2, 'jv : deux indices débloqués');
  await tape(p, 'Stardew');
  await p.click('#nj-list [role="option"]');
  await valide(p);
  await attendFin(p, '+10');
  check((await p.locator('.nj-fin.is-win').count()) === 1 && (await p.locator('.nj-fin').textContent()).includes('Trouvé en 3 essais'), 'jv : gagné en 3 essais');
  check((await p.locator('.nj-fin .fxj-tampon').textContent()) === '4 PTS', 'jv : tampon « 4 PTS »');
  check((await p.locator('.nj-jv img').getAttribute('style')).includes('scale(1)'), 'jv : capture nette en fin de partie');
  check((await p.locator('.nj-pills').textContent()).includes('Points 4'), 'jv : « Points 4 » (trouvé à l’essai 3)');
  await p.screenshot({ path: SHOTS + '/nj-jv-1280.png', fullPage: true });
  check((await hscroll(p)) <= 0, '1280 px : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'jv : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Réplique du jour (390 px) : faux essai, passer, bonne réponse ---------- */
  p = await ouvre(browser, '#replique');
  check((await p.locator('.nj-quote p').textContent()).includes('Tu sais ce que j’en pense'), 'replique : citation affichée');
  check((await p.locator('.nj-contexte').textContent()).includes('1998'), 'replique : contexte affiché');
  check((await p.locator('.nj-media').count()) === 0, 'replique : pas d’image');
  await tape(p, 'Les Visiteurs');
  await valide(p);
  await passe(p);
  await tape(p, 'Le Dîner de cons');
  await valide(p);
  await attendFin(p, '+10');
  check((await p.locator('.nj-fin.is-win').count()) === 1 && (await p.locator('.nj-fin').textContent()).includes('Trouvé en 3 essais'), 'replique : gagnée en 3 essais');
  check((await p.locator('.nj-fin').textContent()).includes('Le Dîner de cons'), 'replique : titre révélé');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'replique : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Partie perdue en 6 essais (Réplique) : 3 faux essais, 3 passer, 360 px ---------- */
  p = await ouvre(browser, '#replique', { width: 360 });
  for (const t of ['Intouchables', 'Les Visiteurs', 'Le Prestige']) { await tape(p, t); await valide(p); }
  for (let i = 0; i < 3; i++) await passe(p);
  await attendFin(p, '+3');
  check((await p.locator('.nj-fin .fxj-tampon.is-rate').textContent()) === '0 PT' && (await p.locator('.fxj-confettis').count()) === 0, 'effets : perdu, tampon « 0 PT » rate et pas de confettis');
  check((await p.locator('.nj-fin:not(.is-win)').count()) === 1 && (await p.locator('.nj-fin').textContent()).includes('Pas trouvé cette fois'), 'perdu : « Pas trouvé cette fois » après 6 essais');
  check((await p.locator('.nj-fin').textContent()).includes('Le Dîner de cons'), 'perdu : la réponse est révélée');
  check((await p.locator('.nj-fin').textContent()).includes('+3 ✦ crédités'), 'perdu : consolation « +3 ✦ crédités »');
  check((await p.locator('#nj-form').count()) === 0 && (await p.locator('.nj-pip.is-miss').count()) === 3 && (await p.locator('.nj-pip.is-pass').count()) === 3, 'perdu : 6 pastilles (3 ratées, 3 passées)');
  await p.evaluate(CLIP_FAUX);
  await p.click('[data-act="copier"]');
  await sleep(200);
  check((await p.evaluate(() => window.__CLIP)) === 'Réplique du jour #16 X/6\n🟥🟥🟥⬜⬜⬜', 'perdu : copie « X/6 » avec carrés');
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal');
  check(mesErreurs(p).length === 0, 'perdu : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Les autres onglets : Carte, Pochette, Plat s'ouvrent sans erreur (390 px) ---------- */
  p = await ouvre(browser, '#carte-mystere');
  check((await p.locator('.nj-title').textContent()) === 'Carte mystère', 'carte : titre « Carte mystère »');
  check((await p.locator('.nj-carte img').getAttribute('style')).includes('blur(7px)') === false && (await p.locator('.nj-carte img').getAttribute('style')).includes('blur(14px)'), 'carte : flou de 14 px au départ');
  check((await p.locator('.nj-carte.nj-rare-rare').count()) === 1, 'carte : bordure selon la rareté « rare »');
  check(mesErreurs(p).length === 0, 'carte : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();
  p = await ouvre(browser, '#pochette');
  check((await p.locator('.nj-title').textContent()) === 'Pochette du jour', 'pochette : titre « Pochette du jour »');
  await p.waitForFunction(() => document.querySelector('canvas.nj-pix')?.width === 6, null, { timeout: 4000 }).catch(() => {});
  check((await p.locator('canvas.nj-pix').count()) === 1 && (await p.locator('canvas.nj-pix').getAttribute('width')) === '6', 'pochette : pixelisée à 6 px au départ');
  await tape(p, 'Thriller');
  await p.evaluate(() => { window.__W = []; setInterval(() => { const c = document.querySelector('canvas.nj-pix'); if (c && window.__W[window.__W.length - 1] !== c.width) window.__W.push(c.width); }, 20); });
  await valide(p);
  await p.waitForFunction(() => document.querySelector('canvas.nj-pix')?.width === 10, null, { timeout: 4000 }).catch(() => {});
  check((await p.locator('canvas.nj-pix').getAttribute('width')) === '10', 'pochette : 10 px après une erreur');
  const largeurs = await p.evaluate(() => window.__W);
  check(largeurs.some((w) => w > 6 && w < 10), 'pochette : étapes intermédiaires entre 6 et 10 px (' + largeurs.join(', ') + ')');
  check(mesErreurs(p).length === 0, 'pochette : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();
  p = await ouvre(browser, '#plat');
  check((await p.locator('.nj-title').textContent()) === 'Plat du jour', 'plat : titre « Plat du jour »');
  check((await p.locator('.nj-plat img').count()) === 1 && (await p.locator('#nj-form').count()) === 1, 'plat : photo et champ de réponse');
  check((await p.locator('.nj-form label').textContent()).includes('Nom du plat'), 'plat : libellé « Nom du plat »');
  await tape(p, 'tom yum');
  await p.click('#nj-form [data-act="valider"]');
  await sleep(300);
  check((await p.locator('.nj-try').first().textContent()).includes('Même pays'), 'plat : un plat du même pays (Tom yum) → « Même pays »');
  await tape(p, 'pizza');
  await p.click('#nj-form [data-act="valider"]');
  await sleep(300);
  check(/\d[\d ]* km/.test(await p.locator('.nj-try').nth(1).textContent()), 'plat : un plat d’un autre pays (Pizza) → distance en km');
  await tape(p, 'pad thai');
  await p.click('#nj-form [data-act="valider"]');
  await sleep(300);
  check((await p.locator('.nj-fin').textContent()).includes('Pad thaï') && (await p.locator('.nj-fin').textContent()).includes('Pays d’origine : Thaïlande'), 'plat : trouvé, fin avec le nom du plat et son pays');
  check((await hscroll(p)) <= 0, 'plat : 390 px sans défilement horizontal');
  check(mesErreurs(p).length === 0, 'plat : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Partie déjà finie à l'ouverture : tampon et gain posés, aucun effet ---------- */
  p = await ouvre(browser, '#replique', { scenario: { dejaFini: 'replique' } });
  await sleep(1800);
  check((await p.locator('.nj-fin').count()) === 1 && (await p.locator('.nj-fin .fxj-tampon').textContent()) === '5 PTS', 'déjà finie : tampon « 5 PTS » posé');
  check((await p.locator('.nj-fin').textContent()).includes('+10 ✦ crédités'), 'déjà finie : gain affiché tel quel');
  check((await p.locator('.fxj-entree, .fxj-confettis, .fxj-saut, .fxj-secoue, .fxj-lueur, .fxj-pop').count()) === 0, 'déjà finie : aucune animation ni confettis');
  check(mesErreurs(p).length === 0, 'déjà finie : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  /* ---------- Mouvement réduit : l'état final sans effet ---------- */
  p = await ouvre(browser, '#replique', { reducedMotion: 'reduce' });
  await tape(p, 'Les Visiteurs');
  await valide(p);
  check((await p.locator('.nj-pip.fxj-saut, .jd-combo.fxj-secoue').count()) === 0 && (await p.locator('.nj-pip.is-miss').count()) === 1, 'mouvement réduit : essai pris en compte sans animation');
  await tape(p, 'Le Dîner de cons');
  await valide(p);
  await sleep(300);
  check((await p.locator('.nj-fin.is-win').count()) === 1 && (await p.locator('.nj-fin .fxj-tampon').textContent()) === '5 PTS' && (await p.locator('.fxj-entree, .fxj-confettis').count()) === 0, 'mouvement réduit : fin affichée directement avec son tampon');
  await p.ctx.close();

  /* ---------- Pas de manche aujourd'hui ---------- */
  p = await ouvre(browser, '#pays', { scenario: { noRound: true } });
  check((await p.locator('.nj-vide').textContent()).includes('Pas de manche aujourd’hui, reviens demain'), 'sans manche : « Pas de manche aujourd’hui, reviens demain »');
  check((await p.locator('#nj-form').count()) === 0, 'sans manche : pas de champ de réponse');
  check(mesErreurs(p).length === 0, 'sans manche : aucune erreur JS' + (mesErreurs(p).length ? ' — ' + mesErreurs(p).join(' | ') : ''));
  await p.ctx.close();

  await browser.close();
  finish();
})();
