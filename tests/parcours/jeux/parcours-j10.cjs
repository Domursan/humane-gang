require('fs').mkdirSync(require('path').join(__dirname, '..', '..', 'shots'), { recursive: true }); // tests/shots absent d'une copie fraîche du dépôt : créé avant les captures.
// Parcours J10 : Heardle du gang (/pages/jeux/jeux.html#heardle), avec un lecteur YouTube simulé (aucun appel à YouTube).
// 1 s au départ ; « Écouter » lance le lecteur au bon instant et l'arrête à la durée débloquée ; « Passer » débloque 2 s ;
// une erreur débloque 4 s ; deviner au 3e essai ; fin : morceau et « proposé par » dévoilés ; proposer un morceau ;
// manche annulée ; vidéo refusée par YouTube signalée au serveur ; 360 px sans défilement horizontal ; aucune erreur JS. Faux Supabase : fixtures/fake-sb-jeux3.mjs.
const { check, finish, openPage, hscroll, log, sleep, chromium } = require('../../lib/harness.cjs');

/** Lecteur YouTube simulé : note les appels dans window.__YT. */
const FAKE_YT = () => {
  window.__YT = [];
  window.__HG_FAKE_YT = { Player: class {
    constructor(el, o) { this.o = o; this.t = 0; this.playing = false; window.__YT.push(['new', o.videoId, o.host, o.playerVars.start]); setTimeout(() => o.events.onReady(), 10); }
    seekTo(s) { this.t = s; window.__YT.push(['seek', s]); }
    playVideo() { this.playing = true; this.t0 = performance.now(); window.__YT.push(['play']); }
    pauseVideo() { const d = Math.round(this.getCurrentTime() - this.o.playerVars.start); this.playing = false; window.__YT.push(['pause', d]); }
    getCurrentTime() { return this.playing ? this.o.playerVars.start + (performance.now() - this.t0) / 1000 : this.t; }
    setVolume(v) { window.__YT.push(['vol', v]); }
    mute() { window.__YT.push(['mute']); }
    unMute() { window.__YT.push(['unmute']); }
  } };
};

(async () => {
  const browser = await chromium.launch();
  let p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#heardle', width: 390, height: 900 });
  await p.evaluate(FAKE_YT);
  await p.waitForSelector('#jh-play', { timeout: 5000 }).catch(() => {});
  check((await p.locator('#jeux-panel-heardle .jd-title').innerText()).includes('Heardle du gang #7'), 'titre : « Heardle du gang #7 »');
  check((await p.locator('.jd-pts-pill').innerText()).includes('1 s'), 'durée : 1 s débloquée au départ');
  check((await p.locator('.jh-seg.is-now').count()) === 1 && (await p.locator('.jh-seg.is-open').count()) === 0, 'barre : seul le 1er segment est ouvert');
  check((await p.locator('.jh-sleeve').count()) === 1, 'pochette : la vidéo est cachée');
  check((await p.locator('#jh-play').getAttribute('aria-label')) === 'Écouter 1 seconde', 'bouton : « Écouter 1 seconde »');
  await p.click('#jh-play');
  await sleep(1500);
  const yt = await p.evaluate(() => window.__YT);
  check(yt[0][0] === 'new' && yt[0][1] === 'VHoT4N43jK8' && yt[0][2] === 'https://www.youtube-nocookie.com' && yt[0][3] === 12, 'lecteur : vidéo du jour, domaine youtube-nocookie, départ à 12 s');
  check(yt.some((x) => x[0] === 'seek' && x[1] === 12) && yt.some((x) => x[0] === 'play'), 'lecteur : se place au départ et joue');
  const pause = yt.find((x) => x[0] === 'pause');
  check(pause && pause[1] === 1, 'lecteur : coupé au bout de 1 s');
  // Volume : 70 par défaut, appliqué au lecteur ; curseur et valeur affichée ; mémorisé
  check(yt.some((x) => x[0] === 'vol' && x[1] === 70), 'volume : 70 appliqué au lecteur au premier extrait');
  check((await p.locator('#jh-vol').inputValue()) === '70' && (await p.locator('#jh-vol-val').innerText()) === '70', 'volume : curseur réglé sur 70, valeur affichée');
  check((await p.locator('#jh-vol').boundingBox()).height >= 44 && (await p.locator('#jh-mute').boundingBox()).height >= 44, 'volume : curseur et bouton muet ≥ 44 px');
  await p.evaluate(() => { const r = document.querySelector('#jh-vol'); r.value = '40'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  check(await p.evaluate(() => localStorage.getItem('hg_heardle_volume')) === '40', 'volume : 40 mémorisé (hg_heardle_volume)');
  check((await p.locator('#jh-vol-val').innerText()) === '40' && (await p.evaluate(() => window.__YT)).some((x) => x[0] === 'vol' && x[1] === 40), 'volume : 40 affiché et appliqué au lecteur');
  await p.click('#jh-mute');
  check((await p.locator('#jh-mute').getAttribute('aria-pressed')) === 'true' && (await p.evaluate(() => window.__YT)).some((x) => x[0] === 'mute'), 'muet : lecteur coupé, bouton « Rétablir le son »');
  await p.click('#jh-mute');
  check((await p.evaluate(() => window.__YT)).some((x) => x[0] === 'unmute') && (await p.locator('#jh-mute').getAttribute('aria-pressed')) === 'false', 'muet : son rétabli');
  // Passer : 2 s
  await p.click('[data-act="passer"]');
  await p.waitForFunction(() => document.querySelector('.jd-pts-pill')?.textContent.includes('2 s'), null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('.jd-pts-pill').innerText()).includes('2 s'), 'passer : 2 s débloquées');
  check((await p.locator('.jh-seg.is-now.fxj-lueur').count()) === 1, 'effets : le segment débloqué s’éclaire');
  check((await p.locator('.fxj-tampon').count()) === 0, 'effets : pas de tampon avant la fin');
  check((await p.locator('.jd-try').first().innerText()).includes('Passé'), 'essais : « 1 · Passé »');
  check((await p.locator('[data-act="passer"]').innerText()).includes('+2 s'), 'bouton : « Passer · +2 s »');
  // Erreur : 4 s
  await p.fill('#jh-input', 'Daft');
  await sleep(100);
  await p.keyboard.press('Enter');
  await p.click('#jh-form button[type="submit"]');
  await p.waitForFunction(() => document.querySelector('.jd-pts-pill')?.textContent.includes('4 s'), null, { timeout: 3000 }).catch(() => {});
  check((await p.locator('.jd-pts-pill').innerText()).includes('4 s'), 'erreur : 4 s débloquées (durée cohérente avec les essais)');
  check((await p.locator('.jd-try.is-miss').innerText()).includes('Daft Punk — One More Time'), 'essais : « Daft Punk — One More Time · Raté »');
  check((await p.locator('.jd-combo.fxj-secoue').count()) === 1, 'effets : mauvais essai, le champ est secoué');
  // Suggestions par artiste
  await p.fill('#jh-input', 'Stro');
  await sleep(100);
  check((await p.locator('#jh-list [role="option"]').count()) === 2, 'suggestions : 2 morceaux de Stromae');
  await p.keyboard.press('Enter');
  await p.click('#jh-form button[type="submit"]');
  await p.waitForSelector('.jd-end', { timeout: 3000 }).catch(() => {});
  await p.waitForFunction(() => document.querySelector('.fxj-tampon') && /^\+\d+ /.test(document.querySelector('.jd-gain-v')?.textContent || '') && !/^\+0 /.test(document.querySelector('.jd-gain-v').textContent), null, { timeout: 5000 }).catch(() => {});
  check((await p.locator('.jd-end .fxj-tampon').count()) === 1 && (await p.locator('.jh-cover.fxj-pop').count()) === 1, 'effets : trouvé, vidéo dévoilée en pop et tampon posé');
  check((await p.locator('.fxj-gain').count()) === 0, 'effets : le gain n’est pas affiché en double');
  check((await p.locator('.jd-end').innerText()).includes('Trouvé en 3 essais'), 'fin : « Trouvé en 3 essais »');
  check((await p.locator('.jd-end').innerText()).includes('proposé par Alice dans #musique, mars 2023'), 'fin : « proposé par Alice dans #musique, mars 2023 »');
  check((await p.locator('.jh-sleeve').count()) === 0 && (await p.locator('.jh-box.is-open').count()) === 1, 'fin : la vidéo se dévoile');
  check((await hscroll(p)) <= 0, '390 px : pas de défilement horizontal');
  await p.screenshot({ path: __dirname + '/../../shots/j10-heardle.png', fullPage: true });
  // Proposer un morceau (le redessin de la partie finie ne rejoue aucun effet)
  await p.click('[data-act="propose"]');
  check((await p.locator('.jd-end .fxj-tampon').count()) === 1 && (await p.locator('.jd-end.fxj-entree, .fxj-confettis, .jh-cover.fxj-pop').count()) === 0, 'effets : partie déjà finie redessinée, tampon posé sans animation');
  await p.fill('#jh-p-title', 'Le morceau du RDV');
  await p.fill('#jh-p-artist', 'Groupe');
  await p.fill('#jh-p-url', 'https://youtu.be/abcdefghijk');
  await p.fill('#jh-p-where', '#musique, juin 2026');
  await p.click('#jh-propose button[type="submit"]');
  await sleep(300);
  const prop = (await log(p)).find((e) => e[0] === 'rpc' && e[1] === 'hg_heardle_propose');
  check(prop && prop[2].p_youtube === 'https://youtu.be/abcdefghijk' && prop[2].p_shared_on === '#musique, juin 2026', 'proposition : envoyée avec le lien et le salon');
  check(p.errs.length === 0, 'aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();

  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#heardle', scenario: { heardleCancelled: true }, width: 360 });
  check((await p.locator('#jeux-panel-heardle').innerText()).includes('Manche annulée'), 'manche annulée : message clair');
  check((await hscroll(p)) <= 0, '360 px : pas de défilement horizontal');
  await p.ctx.close();
  // Volume mémorisé relu à l'ouverture (25 enregistré avant la visite)
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#heardle', width: 390, init: () => { try { localStorage.setItem('hg_heardle_volume', '25'); } catch { /* stockage bloqué */ } } });
  check((await p.locator('#jh-vol').inputValue()) === '25' && (await p.locator('#jh-vol-val').innerText()) === '25', 'volume : 25 mémorisé relu à l\'ouverture');
  check((await hscroll(p)) <= 0, '390 px avec curseur : pas de défilement horizontal');
  await p.ctx.close();
  // Vidéo que YouTube refuse de lire dans le site (code 150) : le morceau est signalé au serveur (hg_heardle_signaler)
  p = await openPage(browser, { page: 'jeux', fixture: 'fake-sb-jeux3.mjs', hash: '#heardle', width: 390 });
  await p.evaluate(() => { window.__HG_FAKE_YT = { Player: class { constructor(el, o) { setTimeout(() => o.events.onError({ data: 150 }), 10); } } }; });
  await p.waitForSelector('#jh-play', { timeout: 5000 }).catch(() => {});
  await p.click('#jh-play');
  await sleep(800);
  const sig = (await log(p)).filter((e) => e[0] === 'rpc' && e[1] === 'hg_heardle_signaler');
  check(sig.length === 1 && sig[0][2].p_code === 150, 'vidéo bloquée (code 150) : signalée une fois au serveur');
  check(p.errs.length === 0, 'vidéo bloquée : aucune erreur JS' + (p.errs.length ? ' — ' + p.errs.join(' | ') : ''));
  await p.ctx.close();
  await browser.close();
  finish();
})();
