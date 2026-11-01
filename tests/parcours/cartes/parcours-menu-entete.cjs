// Parcours : pastille du menu « Le jeu de cartes » dans l'en-tête de la page Cartes (base.css, .nav-top.is-pill).
// Page ouverte sur « Échanges » (compte Staff) : l'entrée est la page courante, la pastille est posée au chargement. La barre Staff
// arrive ensuite à gauche et décale la page (comme le compteur, qui élargit l'entrée) : la pastille restait de travers, débordait sur
// « IRL » et laissait le début du texte dehors. header.js la replace maintenant quand la barre change de taille (suivrePastille).
// Avant aussi : à l'ouverture du menu, le texte prenait la couleur sable de « .is-open », la même que la pastille (texte jaune sur jaune,
// donc illisible) et le badge « à faire » se fondait dans la pastille.
// Contrôles à 1280 et 1024 px, avec et sans badge : texte lisible sur la pastille (contraste 4,5 au moins), badge distinct,
// pastille qui couvre toute l'entrée sans toucher « IRL », rien ne déborde.
// Lancer : node tests/parcours/cartes/parcours-menu-entete.cjs
const { ROOT, check, finish, openPage, sleep, chromium } = require('../../lib/harness.cjs');

/** Contraste WCAG entre deux couleurs « rgb(r, g, b) ». */
const contraste = (a, b) => {
  const lum = (c) => { const [r, g, v] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * v; };
  const [h, l] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (h + 0.05) / (l + 0.05);
};

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  for (const w of [1280, 1024]) {
    for (const badge of [true, false]) {
      const p = await openPage(browser, { page: 'cartes', fixture: 'fake-sb-cartes.mjs', width: w, height: 900, hash: '#echanges' });
      await sleep(1200);
      const etiquette = `${w} px, ${badge ? 'avec' : 'sans'} badge`;
      if (!badge) await p.evaluate(() => { const b = document.querySelector('.nav-top > .cpt-badge'); if (b) b.hidden = true; });
      const mesure = () => p.evaluate(() => {
        const [top, suivant] = [...document.querySelectorAll('.nav-top')], pill = document.querySelector('.nav-pill');
        const r = top.getBoundingClientRect(), pr = pill.getBoundingClientRect(), sr = suivant.getBoundingClientRect();
        const badgeEl = top.querySelector('.cpt-badge');
        const nu = [...top.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
        const rg = document.createRange(); rg.selectNodeContents(nu || top);
        const tr = rg.getBoundingClientRect();
        return {
          ouvert: top.parentElement.classList.contains('is-open'), couleur: getComputedStyle(top).color, fond: getComputedStyle(pill).backgroundColor,
          badgeVisible: !!badgeEl && !badgeEl.hidden, badgeFond: badgeEl ? getComputedStyle(badgeEl).backgroundColor : '', badgeTexte: badgeEl ? getComputedStyle(badgeEl).color : '',
          pillCouvre: pr.left <= r.left + 1 && pr.right >= r.right - 1 && pr.left <= tr.left && pr.right >= tr.right, pillAvantIRL: pr.right <= sr.left, texteAvantIRL: r.right <= sr.left,
          pageDebord: document.documentElement.scrollWidth > innerWidth,
        };
      });
      const m0 = await mesure();
      check(m0.pillCouvre && m0.pillAvantIRL && m0.texteAvantIRL && !m0.pageDebord, `${etiquette}, page courante : la pastille posée au chargement couvre l'entrée et s'arrête avant « IRL »`);
      await p.hover('.nav-top >> nth=0');
      await sleep(700);
      const m = await mesure();
      check(m.ouvert, `${etiquette} : le menu s'ouvre au survol`);
      check(contraste(m.couleur, m.fond) >= 4.5, `${etiquette} : texte lisible sur la pastille (${m.couleur} sur ${m.fond}, contraste ${contraste(m.couleur, m.fond).toFixed(1)})`);
      if (badge) check(m.badgeVisible && contraste(m.badgeFond, m.fond) >= 3 && contraste(m.badgeTexte, m.badgeFond) >= 4.5, `${etiquette} : badge distinct de la pastille, chiffre lisible`);
      check(m.pillCouvre, `${etiquette} : la pastille couvre l'entrée entière`);
      check(m.pillAvantIRL && m.texteAvantIRL, `${etiquette} : la pastille et l'entrée s'arrêtent avant « IRL »`);
      check(!m.pageDebord, `${etiquette} : aucun défilement horizontal`);
      await p.context().close();
    }
  }
  await browser.close();
  finish();
})();
