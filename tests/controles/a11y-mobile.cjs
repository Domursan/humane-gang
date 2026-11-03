// Audit d'accessibilité TÉLÉPHONE de toutes les pages du site (tests/controles/a11y-mobile.cjs).
// Pages couvertes : les trois pages à la racine de site/ (index, 404, offline) et toutes les pages de site/pages/<catégorie>/
// (sauf la planche d'impression collection-a4, exclue). Chaque page est ouverte à 360 et 390 px, en mode tactile (hasTouch, isMobile),
// connectée comme membre (membre de test non administrateur) ET comme administrateur, quand la page est ouverte à tous les membres.
// Une page réservée aux administrateurs (ADMIN_SEUL) n'est contrôlée qu'en administrateur.
// Chaque page est ouverte avec le faux Supabase et le scénario que les parcours utilisent (SPEC) : données de la collection,
// des jeux de plateau, du calendrier, etc. Les jeux à salons (loup-garou, uno, nom-de-code, duels) sont contrôlés à l'accueil
// (membre et admin) ET sur un écran de partie en cours (PARTIES) : le faux serveur tests/fixtures/fake-salons.js (états figés,
// « à moi de jouer ») ou, pour les Échecs et les Dames, le faux de tests/fixtures/fake-sb-duels-plateaux.mjs.
// Contrôles, par page, par rôle et par largeur :
//   - pas de défilement horizontal de la page ;
//   - cibles tactiles d'au moins 44 × 44 px (boutons, liens isolés, cases, onglets, icônes). Exempts : liens
//     dans un texte courant (display inline), éléments masqués ou désactivés ; une case ou un bouton radio
//     se mesure par son étiquette ;
//   - texte lisible : aucun texte de contenu sous 12 px ;
//   - balise meta viewport sans user-scalable=no ni maximum-scale < 2 (zoom permis) ;
//   - champs de formulaire à 16 px au moins (sinon iOS zoome) et type adapté (email, tel) ;
//   - éléments fixes en bas ou en haut : déclaration env(safe-area-inset-*) quand viewport-fit=cover ;
//   - menu du haut (bouton « Menu » à 760 px et moins) : s'ouvre, se referme, cibles mesurées une fois ouvert ;
//   - fenêtres modales (balises dialog) : tiennent dans l'écran, cibles mesurées, refermables (Échap ou bouton Fermer).
// Pages de jeux (liste JEUX) : passage en paysage 740 × 360 : pas de défilement horizontal, barres fixes
// qui occupent plus de 40 % de la hauteur signalées en avis.
// Exceptions documentées (non comptées comme défauts) :
//   - champ piège anti-spam (zone aria-hidden, hors écran) : ni touché ni lu ;
//   - voyant de statut (classe statut-voyant, site/assets/commun/notifs.css) : 24 × 24 px visibles, zone tactile étendue,
//     choix documenté pour ne pas couvrir la photo du menu ;
//   - textes de la planche A4 (collection-a4 n'est pas contrôlée : format d'impression) ;
//   - bouton Menu couvert par une superposition (récap : diaporama plein écran) : signalé comme « navCouvert ».
// Ne mesure pas : barres fixes qui masquent le contenu, clavier virtuel, encoches réelles (à vérifier sur un appareil),
// écrans d'attente des salons (salle, rejoindre), ni les autres jeux de la liste (cluedo, destins… : pas de faux dédié).
// Faux Supabase (tests/fixtures/) : aucune donnée réelle. Écrit tests/shots/a11y-mobile.json.
// Attentes avant chaque mesure (pas de délai fixe) : fin de redirection (une page de jeu sans partie renvoie vers l'accueil,
// le libellé indique alors la page d'arrivée), feuilles de style chargées, barre Staff ajoutée (admin), mise en page stable.
// Lancer : node tests/controles/a11y-mobile.cjs   (ou : npm run test:a11y-mobile)
const fs = require('fs');
const path = require('path');
const { ROOT, SHOTS, check, finish, openPage, sleep, urlPage, chromium } = require('../lib/harness.cjs');

const LARGEURS = [360, 390];
/**
 * Écrans de partie en cours (membre, sans l'accueil du jeu). salon : scénario de tests/fixtures/fake-salons.js ; hash : adresse
 * de la partie ; attend : élément qui prouve que la table est affichée (attente d'état, pas de délai) ; fixture : faux client.
 */
const PARTIES = [
  { pg: 'uno', nom: 'table en cours', salon: 'uno', hash: '#partie/HGUNO-4242', attend: '.uno-avatar-moi' },
  { pg: 'nom-de-code', nom: 'grille en cours', salon: 'nom-de-code', hash: '#partie/HGNDC-4242', attend: '.ndc-bouton-arreter' },
  { pg: 'loup-garou', nom: 'plateau de nuit', salon: 'loup-garou', hash: '#partie/HGLG-4242', attend: '.lg-pl-table' },
  { pg: 'duels', nom: 'Échecs en cours', salon: 'duel-echecs', fixture: 'fake-sb-duels-plateaux.mjs', hash: '#partie/HGEC-1001', attend: '[data-sq]' },
  { pg: 'duels', nom: 'Dames en cours', salon: 'duel-dames', fixture: 'fake-sb-duels-plateaux.mjs', hash: '#partie/HGDA-2002', attend: '[data-sq]' },
  // Jeux de plateau (pages réservées aux administrateurs) : faux des tests, parties en cours
  { pg: 'blackjack', nom: 'table en cours', role: 'admin', fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'blackjack' }, hash: '#partie/HGBJK-1234', attend: '.bj-barre' },
  { pg: 'poker', nom: 'table en cours', role: 'admin', fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'poker' }, hash: '#partie/HGPOK-1234', attend: '.pk-barre' },
  { pg: 'catan', nom: 'plateau en cours', role: 'admin', fixture: 'fake-sb-catan.mjs', hash: '#partie/HGCAT-1234', attend: '.ct-barre' },
  { pg: 'pictionary', nom: 'dessin en cours', role: 'admin', fixture: 'fake-sb-pictionary.mjs', hash: '#partie/HGPIC-1234', attend: '.pi-barre' },
];
/**
 * Défauts réels du site relevés sur les écrans de partie, admis TEMPORAIREMENT : ils ne font pas échouer le contrôle, mais
 * sont comptés et signalés (« exceptions documentées »). Une règle ne vise qu'un élément précis (motif sur sa description) d'une
 * page et d'une partie : tout autre élément trop petit fait toujours échouer. À retirer une fois corrigé (commentaire « À corriger »).
 */
const EXCEPTIONS = [
  // Dames : exception permanente. 10 cases × 44 px = 440 px > 360 px : le damier ne peut pas atteindre 44 px de case en
  // largeur. Cases de 35,4 px à 360 px et 38,4 px à 390 px (damier pleine largeur, bordure de 1 px : maximum atteignable).
  { page: 'duels', partie: 'Dames en cours', type: 'cible', motif: /duels-dames-case/,
    comment: 'Exception permanente : damier de 10 cases, 10 × 44 px = 440 px > 360 px. Cases à 35,4 px en 360 px et 38,4 px en 390 px (maximum de la largeur).' },
];
/**
 * Retire du relevé les défauts admis par EXCEPTIONS (écran de partie seulement). Renvoie la liste retirée, pour le compte rendu.
 * scan.petites et scan.texte sont réduits ; le reste du relevé n'est pas touché.
 */
function appliquerExceptions(pg, partie, scan) {
  const retires = [];
  if (!scan || !partie) return retires;
  const regles = EXCEPTIONS.filter((x) => x.page === pg && x.partie === partie);
  const garder = (liste, type) => liste.filter((it) => {
    const r = regles.find((x) => x.type === type && x.motif.test(it.el));
    if (r) { retires.push({ type, el: it.el, comment: r.comment }); return false; }
    return true;
  });
  scan.petites = garder(scan.petites, 'cible');
  scan.texte = garder(scan.texte, 'texte');
  return retires;
}
const HAUTEUR = { 360: 740, 390: 844 };
const PAYSAGE = { width: 740, height: 360 };
const MIN_CIBLE = 44, MIN_TEXTE = 12, MIN_CHAMP = 16;
/** Pages de jeux : contrôle supplémentaire en paysage. */
const JEUX = new Set(['blackjack', 'catan', 'cluedo', 'destins', 'duels', 'jeux', 'loup-garou', 'monopoly', 'nom-de-code', 'pictionary', 'poker', 'risk', 'shadow-hunters', 'uno']);
/** Planche d'impression : hors contrôle (format A4 mis à l'échelle). */
const EXCLUES = new Set(['collection-a4']);
/** Pages réservées aux administrateurs (mode « admin » du faux site, plateaux non déclarés) : pas de contrôle en membre. */
const ADMIN_SEUL = new Set(['admin', 'cartes', 'jeux', 'blackjack', 'poker', 'catan', 'pictionary', 'cluedo', 'destins', 'monopoly', 'risk', 'shadow-hunters']);
/** Membre de test non administrateur (même identifiant que les parcours : U(2) dans fixtures/fake-sb.mjs). */
const MEMBRE = { uid: '00000002-0000-4000-8000-000000000002' };
/** Fixture et scénario de chaque page, comme les parcours les ouvrent (défaut : fake-sb.mjs, scénario vide). */
const SPEC = {
  admin: {}, cartes: { fixture: 'fake-sb-cartes.mjs' }, jeux: { fixture: 'fake-sb-jeux.mjs' },
  blackjack: { fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'blackjack' } },
  poker: { fixture: 'fake-sb-plateaux-cartes.mjs', scenario: { jeu: 'poker' } },
  catan: { fixture: 'fake-sb-catan.mjs' }, pictionary: { fixture: 'fake-sb-pictionary.mjs' },
  membre: { fixture: 'fake-sb-social.mjs' },
  calendrier: { fixture: 'fake-sb-vd.mjs' }, cine: { fixture: 'fake-sb-vd.mjs' },
  citations: { fixture: 'fake-sb-contenus.mjs' }, playlist: { fixture: 'fake-sb-contenus.mjs' }, recap: { fixture: 'fake-sb-contenus.mjs' },
  challenge: { fixture: 'fake-sb-challenge.mjs' }, // challenge de la semaine (migration 218), en phase de participation
};

/**
 * Lit la page dans le navigateur. o = { rootSel, minCible, minTexte, minChamp, rootAttr }.
 * Tout est calculé ici (getBoundingClientRect, getComputedStyle), le résultat est renvoyé à Node.
 */
function scanDom(o) {
  const de = document.documentElement;
  const vw = de.clientWidth, vh = innerHeight;
  const root = o.rootSel ? document.querySelector(o.rootSel) : document.body;
  const out = { total: 0, petites: [], texte: [], champs: [], fixes: [], debords: [], hscroll: 0, fieldsTotal: 0 };
  if (!root) return out;
  out.hscroll = Math.max(de.scrollWidth, document.body.scrollWidth) - de.clientWidth;
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0);
  const short = (el) => {
    const t = (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.value || el.placeholder || '')
      .toString().trim().replace(/\s+/g, ' ').slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') + (t ? ' « ' + t + ' »' : '');
  };
  const clippedAncestor = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'visible' && ox !== 'clip') return true;
    }
    return false;
  };

  // 1. Cibles tactiles
  const SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=checkbox], ' +
    '[role=switch], [role=radio], [role=menuitem], [role=option], [role=link], [onclick], label:has(input)';
  const vues = new Set();
  const etiquetteDe = (el) => el.closest('label') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
  for (const el of root.querySelectorAll(SEL)) {
    if (el.disabled || !visible(el)) continue;
    if (el.closest('[aria-hidden="true"]')) continue; // champ piège (anti-spam) et décor : ni touché ni lu
    // Voyant de statut : 24 × 24 px visibles, zone tactile étendue au doigt (site/assets/commun/notifs.css, choix documenté : pas 44 px,
    // pour ne pas couvrir la photo du menu). Exempt de la règle des 44 px ; à revoir si le design change.
    if (el.classList.contains('statut-voyant')) continue;
    const cs = getComputedStyle(el);
    if (el.tagName === 'A' && cs.display === 'inline') continue; // lien dans un texte courant : exempt
    let cible = el;
    // Case, bouton radio ou champ caché (fichier, bascule) : la cible tactile est son étiquette.
    const r0 = el.getBoundingClientRect();
    const cache = el.tagName === 'INPUT' && (r0.width <= 2 || r0.height <= 2 || el.type === 'checkbox' || el.type === 'radio');
    if (cache) {
      const lab = etiquetteDe(el);
      if (lab && getComputedStyle(lab).display !== 'inline') cible = lab;
      else if (r0.width <= 2 || r0.height <= 2) continue; // champ caché sans étiquette visible : rien à toucher
    }
    if (cible.tagName === 'LABEL' && getComputedStyle(cible).display === 'inline') continue;
    if (vues.has(cible)) continue;
    vues.add(cible);
    const r = cible.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (r.bottom <= 0 || r.right <= 0) continue; // hors de la page (lien d'évitement, champ décalé hors écran)
    out.total++;
    if (r.width < o.minCible - 0.5 || r.height < o.minCible - 0.5) {
      out.petites.push({ el: short(cible), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  // 2. Texte de contenu sous la taille minimale (hors planche d'impression A4 : mise à l'échelle par transform)
  for (const el of root.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
    if (el.closest('.a4-sheets')) continue;
    let own = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { own = true; break; }
    if (!own || !visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px >= o.minTexte) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue; // texte masqué visuellement (lecteur d'écran seul)
    out.texte.push({ el: short(el), px });
  }

  // 3. Champs de formulaire : taille de police et type
  for (const el of root.querySelectorAll('input, select, textarea')) {
    const t = (el.type || '').toLowerCase();
    if (el.tagName === 'INPUT' && ['hidden', 'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file', 'image'].includes(t)) continue;
    if (!visible(el)) continue;
    out.fieldsTotal++;
    const px = parseFloat(getComputedStyle(el).fontSize);
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase();
    const hint = [el.name, el.id, ac, el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' ').toLowerCase();
    const problemes = [];
    if (px < o.minChamp) problemes.push('police ' + px + ' px (16 px minimum)');
    if (/(^|[^a-z])(e-?mail|courriel)/.test(hint) || ac === 'email') { if (t !== 'email') problemes.push('type=email attendu (actuel : ' + (t || 'text') + ')'); }
    else if (/(^|[^a-z])(tel|telephone|téléphone|phone|mobile)/.test(hint) || ac === 'tel' || ac.startsWith('tel-')) { if (t !== 'tel') problemes.push('type=tel attendu (actuel : ' + (t || 'text') + ')'); }
    out.champs.push({ el: short(el), type: t || 'text', px, problemes });
  }

  // 4. Éléments fixes (en-tête, barres du bas) et encoches
  const vp = document.querySelector('meta[name="viewport"]');
  const viewportFit = /viewport-fit\s*=\s*cover/.test(vp ? vp.content : '');
  const safeDans = (rules, el) => {
    for (const ru of rules) {
      if (ru instanceof CSSMediaRule || ru instanceof CSSSupportsRule) { if (safeDans(ru.cssRules, el)) return true; continue; }
      if (ru instanceof CSSStyleRule && ru.style.cssText.includes('safe-area')) {
        try { if (el.matches(ru.selectorText)) return true; } catch (e) { /* sélecteur non applicable */ }
      }
    }
    return false;
  };
  const sheetsSafe = (el) => {
    if ((el.getAttribute('style') || '').includes('safe-area')) return true;
    for (const sh of document.styleSheets) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      if (safeDans(rules, el)) return true;
    }
    return false;
  };
  for (const el of root.querySelectorAll('*')) {
    if (getComputedStyle(el).position !== 'fixed' || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4) continue;
    const bord = r.top <= 2 ? 'haut' : (r.bottom >= vh - 2 && r.top > vh / 2 ? 'bas' : '');
    const plein = r.height >= vh - 2; // superposition plein écran (voile, fenêtre) : pas une barre
    if (plein) continue;
    out.fixes.push({ el: short(el), bord, hauteur: Math.round(r.height), pourcentHauteur: Math.round(100 * r.height / vh),
      encocheOk: !bord || !viewportFit || sheetsSafe(el) });
  }
  out.viewportFit = viewportFit;

  // 5. Éléments qui dépassent à droite (cause du défilement horizontal)
  for (const el of root.querySelectorAll('*')) {
    if (!(el instanceof HTMLElement) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.right <= vw + 1) continue;
    if (clippedAncestor(el)) continue;
    out.debords.push({ el: short(el), droite: Math.round(r.right) });
    if (out.debords.length >= 5) break;
  }
  out.vw = vw;
  return out;
}

/** Résumé d'un scan : liste des défauts (vide si rien à signaler), pour un test par page et largeur. */
function defauts(s) {
  const d = [];
  if (s.hscroll > 0) d.push(`défilement horizontal ${s.hscroll} px`);
  if (s.petites.length) d.push(`${s.petites.length} cible(s) < 44 px`);
  if (s.texte.length) d.push(`${s.texte.length} texte(s) < 12 px`);
  const champsKo = s.champs.filter((c) => c.problemes.some((p) => /^police|^type=email|^type=tel/.test(p)));
  if (champsKo.length) d.push(`${champsKo.length} champ(s) à corriger`);
  const encKo = s.fixes.filter((f) => !f.encocheOk);
  if (encKo.length) d.push(`${encKo.length} élément(s) fixe(s) sans safe-area`);
  const barresHautes = s.fixes.filter((f) => f.bord && f.pourcentHauteur > 25);
  if (barresHautes.length) d.push(`${barresHautes.length} barre(s) fixe(s) occupant plus de 25 % de l'écran`);
  if (s.debords.length) d.push(`${s.debords.length} élément(s) hors écran à droite`);
  return d;
}

/** Ce qui doit être signalé en détail (échantillon) dans la sortie. */
function exemples(s) {
  const e = [];
  for (const c of s.petites.slice(0, 4)) e.push(`cible ${c.w}×${c.h} : ${c.el}`);
  for (const t of s.texte.slice(0, 3)) e.push(`texte ${t.px} px : ${t.el}`);
  for (const c of s.champs.filter((c) => c.problemes.length).slice(0, 3)) e.push(`champ : ${c.el} → ${c.problemes.join(', ')}`);
  for (const f of s.fixes.filter((f) => !f.encocheOk).slice(0, 2)) e.push(`fixe sans safe-area : ${f.el}`);
  for (const d of s.debords.slice(0, 2)) e.push(`dépasse à droite (${d.droite} px) : ${d.el}`);
  return e;
}

const OPTS = { minCible: MIN_CIBLE, minTexte: MIN_TEXTE, minChamp: MIN_CHAMP };
/** Nombre de pages ouvertes en même temps (navigateurs séparés, chacun dans son contexte isolé). */
const PARALLELE = 4;

/**
 * Relevés de la mise en page, jusqu'à ce qu'ils soient identiques pendant quatre passages (environ 250 ms) : les tailles
 * des cibles sont alors finales. Écrit pour page.evaluate : ne fait référence à rien hors de la page.
 */
function attendreMiseEnPage() {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let last = '', n = 0;
    const releve = () => [...document.querySelectorAll('a[href], button, input, select, textarea, summary, label, [role=button], [role=tab], [role=link], [role=checkbox], [role=switch], [role=radio], [role=menuitem], [role=option], h1, h2, h3')]
      .map((e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }).join('|');
    const tick = () => {
      const s = releve();
      n = s === last ? n + 1 : 0; last = s;
      if (n >= 4 || Date.now() - t0 > 6000) resolve(n >= 4);
      else setTimeout(tick, 60);
    };
    tick();
  });
}

/** Erreurs dues à une navigation en cours (redirection) : la mesure est alors reprise sur la page d'arrivée. */
const TRANSITOIRE = /Execution context was destroyed|frame was detached|Target (page, context or browser )?closed|ERR_ABORTED/i;

/**
 * Attend que la page soit prête à être mesurée, au lieu de délais fixes :
 *   1. fin de redirection : l'adresse ne change plus pendant 1 s (une page de jeu sans partie renvoie vers l'accueil) ;
 *   2. barre des raccourcis Staff (admin, hors panel) : son bouton est ajouté après les droits, par script ;
 *   3. chaque feuille de style de la page chargée (link.sheet renseigné, y compris celles ajoutées par script) ;
 *   4. polices web chargées ;
 *   5. mise en page stable (attendreMiseEnPage).
 * Renvoie l'adresse d'arrivée.
 */
async function attendrePrete(p, { pg, role }) {
  await p.waitForLoadState('load').catch(() => {});
  let adresse = p.url(), depuis = Date.now();
  const fin = Date.now() + 20000;
  while (Date.now() < fin && Date.now() - depuis < 1000) {
    await sleep(100);
    if (p.url() !== adresse) { adresse = p.url(); depuis = Date.now(); }
  }
  await p.waitForLoadState('load').catch(() => {});
  if (role === 'admin' && pg !== 'admin') await p.waitForSelector('#staff-dock .sd-fab', { state: 'attached', timeout: 8000 }).catch(() => {});
  await p.waitForFunction(() => [...document.querySelectorAll('link[rel~="stylesheet"]')].every((l) => l.sheet), null, { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => document.fonts.ready).catch(() => {});
  await p.evaluate(attendreMiseEnPage).catch(() => {});
  return adresse;
}

/**
 * Mesures d'une page prête : défauts de la page entière, menu du haut (ouvert puis refermé), fenêtres modales.
 * Remplit rapport (meta, scan, nav, navCouvert, dialogues). Chaque ouverture ou fermeture est attendue, pas temporisée.
 */
async function mesurer(p, rapport) {
  rapport.meta = await p.evaluate(() => { const m = document.querySelector('meta[name="viewport"]'); return m ? m.content : null; });
  rapport.scan = await p.evaluate(scanDom, { ...OPTS, rootSel: null });

  // Menu du haut : ouvert puis refermé au bouton « Menu »
  const tog = await p.$('.nav-toggle');
  // Atteignable au doigt ? Sinon (ex. récap : diaporama plein écran qui couvre l'en-tête) : signalé à part.
  const couvert = tog && await p.evaluate(() => {
    const t = document.querySelector('.nav-toggle'); const r = t.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!hit && !t.contains(hit);
  });
  if (tog && await tog.isVisible() && couvert) rapport.navCouvert = true;
  else if (tog && await tog.isVisible()) {
    await tog.click();
    const ouvert = await p.waitForFunction(() => document.querySelector('.site-header')?.classList.contains('nav-open') === true, null, { timeout: 3000 }).then(() => true, () => false);
    if (ouvert) await p.evaluate(attendreMiseEnPage).catch(() => {});
    const sNav = await p.evaluate(scanDom, { ...OPTS, rootSel: '.site-header' });
    await tog.click();
    const ferme = await p.waitForFunction(() => document.querySelector('.site-header')?.classList.contains('nav-open') !== true, null, { timeout: 3000 }).then(() => true, () => false);
    rapport.nav = { ouvert, ferme, scan: sNav };
  }

  // Fenêtres modales : ouvertes, mesurées, refermées au clavier (Échap) ou par leur bouton Fermer
  const nd = await p.evaluate(() => document.querySelectorAll('dialog').length);
  for (let i = 0; i < nd; i++) {
    const ok = await p.evaluate((i) => {
      const d = document.querySelectorAll('dialog')[i];
      if (d.open) return false;
      try { d.showModal(); d.setAttribute('data-a11y-root', ''); return true; } catch (e) { return false; }
    }, i);
    if (!ok) continue;
    await p.waitForFunction(() => document.querySelector('dialog[data-a11y-root]')?.open === true, null, { timeout: 3000 }).catch(() => {});
    await p.evaluate(attendreMiseEnPage).catch(() => {});
    const info = await p.evaluate(() => {
      const d = document.querySelector('dialog[data-a11y-root]');
      const r = d.getBoundingClientRect();
      const de = document.documentElement;
      return { id: d.id || d.className || 'dialog', tientEcran: r.left >= -0.5 && r.right <= de.clientWidth + 0.5 };
    });
    const sD = await p.evaluate(scanDom, { ...OPTS, rootSel: 'dialog[data-a11y-root]' });
    await p.keyboard.press('Escape');
    const fermeEchap = await p.waitForFunction(() => !document.querySelector('dialog[data-a11y-root]')?.open, null, { timeout: 3000 }).then(() => true, () => false);
    const boutonFermer = await p.evaluate(() => {
      const d = document.querySelector('dialog[data-a11y-root]');
      return [...d.querySelectorAll('button, [role=button], a')].some((b) => {
        const t = ((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')).toLowerCase();
        return b.getClientRects().length > 0 && /ferm|close|annul|retour|×|✕|✖/.test(t);
      });
    });
    if (!fermeEchap) await p.evaluate(() => { const d = document.querySelector('dialog[data-a11y-root]'); d.close(); });
    await p.evaluate(() => document.querySelectorAll('[data-a11y-root]').forEach((x) => x.removeAttribute('data-a11y-root')));
    rapport.dialogues.push({ ...info, fermeEchap, boutonFermer, scan: sD });
  }
}

/** Nombre d'essais par contrôle : une redirection tardive ou une navigation en cours reprend la mesure sur la page d'arrivée. */
const ESSAIS = 3;

/**
 * Contrôle d'une page, pour un rôle et une largeur. Renvoie { rapport, messages } : messages = [{ ok, msg }] à afficher dans l'ordre.
 * Le libellé indique la page d'arrivée quand la page a redirigé (membre sans partie : accueil). rapport est gardé pour le fichier de sortie.
 * Le paysage (pages de jeux) n'est fait qu'à la première largeur.
 */
async function controler(browser, { pg, role, scenario, fixture, w, hash = '', init = null, attend = null, libelle = null }) {
  const messages = [];
  let rapport = null, p = null, adresse = null;
  const ouvrir = (largeur, hauteur, extra = {}) => openPage(browser, { page: pg, fixture, scenario, hash, init, width: largeur, height: hauteur, mobile: true, dpr: 2, reducedMotion: 'reduce', ...extra });
  for (let essai = 1; essai <= ESSAIS; essai++) {
    rapport = { page: pg, role, fixture, largeur: w, meta: null, scan: null, nav: null, dialogues: [], paysage: null, erreur: null, avis: [], arrivee: null, partie: attend ? libelle : null, exceptions: [] };
    p = await ouvrir(w, HAUTEUR[w]);
    let transitoire = false;
    try {
      adresse = await attendrePrete(p, { pg, role });
      if (attend) {
        // Écran de partie : la table doit être affichée (attente de l'élément, pas de délai) ; sinon le défaut est signalé.
        const vu = await p.waitForSelector(attend, { state: 'visible', timeout: 8000 }).then(() => true, () => false);
        if (!vu) throw new Error(`écran de partie non affiché (élément ${attend} absent)`);
      }
      await mesurer(p, rapport);
    } catch (e) {
      transitoire = TRANSITOIRE.test(e.message);
      if (!transitoire || essai === ESSAIS) rapport.erreur = e.message.split('\n')[0].slice(0, 160);
    }
    if (essai < ESSAIS && (transitoire || p.url() !== adresse)) { await p.ctx.close(); continue; }
    break;
  }
  const arrivee = new URL(p.url()).pathname;
  rapport.arrivee = arrivee;
  const redirigee = !arrivee.endsWith(urlPage(pg));
  const libelleAff = (libelle ? `${pg} · ${libelle} [${role}]` : `${pg} [${role}]`) + (redirigee ? ` → redirigée vers ${arrivee}` : '');
  // Erreurs JavaScript de la page : signalées en avis (le contrôle de fumée les compte, ici elles ne sont pas des défauts d'accessibilité)
  rapport.avis = (p.errs || []).slice(0, 2);
  await p.ctx.close();

  // Écrans de partie : défauts réels admis temporairement (EXCEPTIONS), retirés du relevé et comptés
  rapport.exceptions = appliquerExceptions(pg, rapport.partie, rapport.scan);
  // Une ligne par page et largeur (les défauts de la page entière et des éléments ouverts)
  const tous = [rapport.scan, rapport.nav?.scan, ...rapport.dialogues.map((d) => d.scan)].filter(Boolean);
  const ds = [...new Set(tous.flatMap(defauts))];
  // Zoom permis : pas de user-scalable=no / 0, ni maximum-scale inférieur à 2
  const m = rapport.meta;
  if (m === null) ds.push('balise meta viewport absente');
  else if (/user-scalable\s*=\s*(no|0)\b/i.test(m)) ds.push('zoom bloqué (user-scalable=no)');
  else { const ms = /maximum-scale\s*=\s*([\d.]+)/i.exec(m); if (ms && Number(ms[1]) < 2) ds.push(`zoom limité (maximum-scale=${ms[1]})`); }
  if (rapport.nav && !rapport.nav.ouvert) ds.push('menu du haut ne s\'ouvre pas');
  if (rapport.nav && !rapport.nav.ferme) ds.push('menu du haut ne se referme pas');
  for (const d of rapport.dialogues) {
    if (!d.tientEcran) ds.push(`fenêtre « ${d.id} » dépasse l'écran`);
    if (!d.fermeEchap && !d.boutonFermer) ds.push(`fenêtre « ${d.id} » sans fermeture accessible`);
  }
  if (rapport.erreur) ds.push('analyse impossible : ' + rapport.erreur);
  rapport.defauts = ds;
  const ex = [...(rapport.scan ? exemples(rapport.scan) : []), ...(rapport.nav?.scan ? exemples(rapport.nav.scan).map((x) => 'menu : ' + x) : [])];
  const admis = rapport.exceptions.length ? `  (exceptions documentées : ${rapport.exceptions.length}, voir EXCEPTIONS)` : '';
  messages.push({ ok: ds.length === 0, msg: `${libelleAff} ${w} : ${ds.length ? ds.join(' ; ') : 'OK'}${ex.length && ds.length ? '  [' + ex.slice(0, 3).join(' | ') + ']' : ''}${admis}` });

  // Paysage (pages de jeux) : défilement horizontal et barres fixes trop hautes. Une seule fois par page et rôle.
  if (JEUX.has(pg) && w === LARGEURS[0]) {
    let fini = null;
    for (let essai = 1; essai <= ESSAIS && !fini; essai++) {
      const q = await ouvrir(PAYSAGE.width, PAYSAGE.height);
      try {
        const adr = await attendrePrete(q, { pg, role });
        if (attend) await q.waitForSelector(attend, { state: 'visible', timeout: 8000 }).catch(() => {});
        const s = await q.evaluate(scanDom, { ...OPTS, rootSel: null });
        if (!(q.url() !== adr && essai < ESSAIS)) {
          const hautes = s.fixes.filter((f) => f.pourcentHauteur > 40);
          const pd = [];
          if (s.hscroll > 0) pd.push(`défilement horizontal ${s.hscroll} px`);
          const av = hautes.map((f) => `barre fixe ${f.pourcentHauteur} % de la hauteur : ${f.el}`);
          rapport.paysage = { hscroll: s.hscroll, avis: av };
          fini = { ok: pd.length === 0, msg: `${libelleAff} paysage ${PAYSAGE.width}×${PAYSAGE.height} : ${pd.length ? pd.join(' ; ') : 'OK'}${av.length ? '  (avis : ' + av.join(' ; ') + ')' : ''}` };
        }
      } catch (e) {
        if (essai === ESSAIS || !TRANSITOIRE.test(e.message)) fini = { ok: false, msg: `${libelleAff} paysage : analyse impossible (${e.message.split('\n')[0].slice(0, 120)})` };
      }
      await q.ctx.close();
    }
    if (fini) messages.push(fini);
  }
  return { rapport, messages };
}

/** Exécute les tâches en parallèle (au plus n à la fois), en gardant l'ordre des résultats. */
async function enParallele(taches, n, fn) {
  const out = new Array(taches.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < taches.length) { const k = i++; out[k] = await fn(taches[k]); }
  }));
  return out;
}

(async () => {
  // Pages : racine (index, 404, offline) avec le scénario par défaut, puis chaque page de site/pages/<catégorie>/
  const racine = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)).sort();
  const dossierPages = path.join(ROOT, 'pages');
  const categories = fs.readdirSync(dossierPages).filter((c) => fs.statSync(path.join(dossierPages, c)).isDirectory()).sort();
  const pagesRangees = categories.flatMap((c) => fs.readdirSync(path.join(dossierPages, c)).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)));
  const exclues = pagesRangees.filter((pg) => EXCLUES.has(pg));
  const pages = pagesRangees.filter((pg) => !EXCLUES.has(pg)).sort();
  // Tâches : une par page, rôle et largeur. Racine : scénario par défaut (rôle « défaut »).
  const taches = [];
  for (const pg of racine) for (const w of LARGEURS) taches.push({ pg, role: 'défaut', fixture: 'fake-sb.mjs', scenario: {}, w });
  for (const pg of pages) {
    const sp = SPEC[pg] || {};
    const roles = [];
    if (!ADMIN_SEUL.has(pg)) roles.push(['membre', MEMBRE]);
    roles.push(['admin', {}]);
    for (const [role, scn] of roles) for (const w of LARGEURS) {
      taches.push({ pg, role, fixture: sp.fixture || 'fake-sb.mjs', scenario: { ...(sp.scenario || {}), ...scn }, w });
    }
  }
  // Écrans de partie en cours : membre (salons) ou administrateur (jeux de plateau), dans les deux largeurs
  for (const pt of PARTIES) for (const w of LARGEURS) {
    const role = pt.role || 'membre';
    taches.push({ pg: pt.pg, role, fixture: pt.fixture || 'fake-sb.mjs',
      scenario: { ...(pt.scenario || {}), ...(pt.salon ? { salon: pt.salon } : {}), ...(role === 'membre' ? MEMBRE : {}) }, w,
      hash: pt.hash, init: pt.salon ? 'fake-salons.js' : null, attend: pt.attend, libelle: pt.nom });
  }
  const browser = await chromium.launch();
  const resultats = await enParallele(taches, PARALLELE, (t) => controler(browser, t).catch((e) => ({
    rapport: { page: t.pg, role: t.role, largeur: t.w, defauts: ['échec du contrôle : ' + e.message.split('\n')[0].slice(0, 160)], erreur: e.message },
    messages: [{ ok: false, msg: `${t.pg} [${t.role}] ${t.w} : échec du contrôle (${e.message.split('\n')[0].slice(0, 120)})` }],
  })));
  await browser.close();

  // Affichage dans l'ordre des tâches
  for (const { messages } of resultats) for (const m of messages) check(m.ok, m.msg);
  const rapports = resultats.map((r) => r.rapport);

  fs.mkdirSync(SHOTS, { recursive: true });
  const bilan = {
    pages: pages.length + racine.length, pages_site: pages, pages_racine: racine, exclues, largeurs: LARGEURS, controles: rapports.length,
    resultats: rapports.map((r) => ({ page: r.page, role: r.role, fixture: r.fixture, largeur: r.largeur, meta: r.meta, defauts: r.defauts, avis: r.avis, scan: r.scan, nav: r.nav, dialogues: r.dialogues, paysage: r.paysage })),
  };
  fs.writeFileSync(path.join(SHOTS, 'a11y-mobile.json'), JSON.stringify(bilan, null, 2));
  const total = (k) => rapports.reduce((n, r) => n + (r.scan ? r.scan[k].length : 0), 0);
  const pagesHs = new Set(rapports.filter((r) => r.scan && r.scan.hscroll > 0).map((r) => `${r.page} [${r.role}] ${r.largeur}`));
  console.log(`\nAudit mobile : ${pages.length + racine.length} pages (${racine.length} à la racine, ${pages.length} dans site/pages/, ${exclues.length} exclue(s)), ` +
    `${rapports.length} contrôles (360/390 px, membre et admin) ; cibles < 44 px : ${total('petites')} ; textes < 12 px : ${total('texte')} ; ` +
    `défilements horizontaux : ${pagesHs.size}`);
  finish();
})();
