// Parcours : défi de collection de la semaine (idée 62, migration 210), en tête des « Quêtes de la semaine »
// (onglet Ouverture de /pages/cartes/cartes.html). Faux Supabase : fixtures/fake-sb-cartes.mjs, scenario.defi.
// 1. En cours (3/5) : encadré avant la liste des quêtes, libellé, barre (aria), récompense « 1 booster Série », pastille
//    « En cours », phrase « Compté tout seul… », pas de bouton.
// 2. Réussi (5/5) : « Réclamer le booster » ; le clic appelle hg_card_defi_claim, met 1 booster Série en stock,
//    affiche « Booster reçu » et un message ; aucune Paillette en plus.
// 3. Reçu : pastille « Booster reçu », encadré grisé. 4. Défi d'échange : récompense Classique, phrase des échanges.
// 5. Aucun défi : pas d'encadré, les quêtes restent. 6. 390 px, thèmes sombre et clair : pas de défilement horizontal,
//    bouton de 44 px, texte du sur-titre lisible (contraste ≥ 4,5).
// 7. Admin › Jeu de cartes › Quêtes (fixtures/fake-sb.mjs) : genre « Défi de collection », booster et série, enregistrement.
// Lancer : node tests/parcours/cartes/parcours-defi-collection.cjs
const { openPage, adminSection, check, finish, hscroll, sleep, chromium } = require('../../lib/harness.cjs');

const FIXTURE = 'fake-sb-cartes.mjs';
const ouvrir = (b, defi, o = {}) => openPage(b, { page: 'cartes', hash: '#ouverture', fixture: FIXTURE, scenario: { types: true, defi }, ...o });
/** État de l'encadré du défi. */
const lire = (p) => p.evaluate(() => {
  const d = document.querySelector('#cartes-quests .cq-defi');
  if (!d) return null;
  const bar = d.querySelector('[role=progressbar]');
  return {
    avantListe: d.nextElementSibling?.classList.contains('cq-list'),
    kicker: d.querySelector('.cq-defi-k')?.textContent.trim(),
    titre: d.querySelector('.cq-defi-t')?.textContent.trim(),
    compte: d.querySelector('.cq-count')?.textContent.trim(),
    aide: d.querySelector('.cq-defi-aide')?.textContent.trim(),
    act: d.querySelector('.cq-act')?.textContent.trim(),
    bouton: !!d.querySelector('[data-action="defi-claim"]'),
    recu: d.classList.contains('is-claimed'),
    aria: bar && [bar.getAttribute('aria-valuenow'), bar.getAttribute('aria-valuemax')].join('/'),
  };
});

(async () => {
  const browser = await chromium.launch();

  // ---------- 1. En cours ----------
  let p = await ouvrir(browser, 'cours');
  await p.waitForSelector('#cartes-quests .cq-defi', { timeout: 8000 }).catch(() => {});
  let e = await lire(p);
  check(!!e, 'en cours : encadré du défi affiché');
  check(e?.avantListe, 'en cours : encadré juste avant la liste des quêtes');
  check(/^Défi de collection · jusqu’au (lundi) \d+ \S+$/i.test(e?.kicker || ''), `en cours : sur-titre (« ${e?.kicker} »)`);
  check(e?.titre === 'Obtiens 5 cartes de la série « Espace et planètes »', `en cours : libellé (« ${e?.titre} »)`);
  check(e?.compte === '3 / 5 · récompense : 1 booster Série', `en cours : compte et récompense (« ${e?.compte} »)`);
  check(e?.aria === '3/5', 'en cours : barre de progression annoncée (3 sur 5)');
  check(e?.act === 'En cours' && !e.bouton, 'en cours : pastille « En cours », pas de bouton');
  check(e?.aide === 'Compté tout seul : boosters, échanges, cadeaux et cartes sauvages de la semaine.', 'en cours : phrase du comptage');
  check(await p.evaluate(() => document.querySelectorAll('#cartes-quests .cq-item').length) === 2, 'en cours : les quêtes habituelles restent');
  check(p.errs.length === 0, `en cours : aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  // ---------- 2. Réussi, réclamation ----------
  p = await ouvrir(browser, 'fini');
  await p.waitForSelector('[data-action="defi-claim"]', { timeout: 8000 }).catch(() => {});
  e = await lire(p);
  check(e?.bouton && e.act === 'Réclamer le booster', 'réussi : bouton « Réclamer le booster »');
  const solde = await p.evaluate(() => window.__DB.hg_wallets[0].paillettes);
  await p.click('[data-action="defi-claim"]');
  await p.waitForFunction(() => document.querySelector('#cartes-quests .cq-defi.is-claimed'), null, { timeout: 8000 }).catch(() => {});
  e = await lire(p);
  const log = await p.evaluate(() => window.__LOG.filter((x) => x[0] === 'rpc' && x[1] === 'hg_card_defi_claim').length);
  check(log === 1, 'réussi : hg_card_defi_claim appelée une fois');
  check(await p.evaluate(() => window.__DB.hg_booster_stock.find((x) => x.type_id === 'serie')?.qty) === 1, 'réussi : 1 booster Série en stock');
  check(e?.recu && e.act === 'Booster reçu' && !e.bouton, 'réussi : « Booster reçu » après la réclamation');
  check(await p.evaluate(() => [...document.querySelectorAll('.toast, [role=status]')].some((t) => /1 booster Série/.test(t.textContent))), 'réussi : message « 1 booster Série »');
  check(await p.evaluate(() => window.__DB.hg_wallets[0].paillettes) === solde, 'réussi : aucune Paillette créée');
  check(p.errs.length === 0, `réussi : aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  // ---------- 3. Reçu ----------
  p = await ouvrir(browser, 'recu');
  await p.waitForSelector('#cartes-quests .cq-defi', { timeout: 8000 }).catch(() => {});
  e = await lire(p);
  check(e?.recu && e.act === 'Booster reçu' && !e.bouton, 'reçu : pastille, encadré grisé, pas de bouton');
  await p.ctx.close();

  // ---------- 4. Défi d'échange ----------
  p = await ouvrir(browser, 'echange');
  await p.waitForSelector('#cartes-quests .cq-defi', { timeout: 8000 }).catch(() => {});
  e = await lire(p);
  check(e?.titre === 'Échange des cartes avec 2 membres différents' && e.compte === '1 / 2 · récompense : 1 booster Classique', 'échange : libellé et récompense Classique');
  check(e?.aide === 'Compté tout seul : chaque offre acceptée avec un nouveau membre.', 'échange : phrase des échanges');
  await p.ctx.close();

  // ---------- 5. Aucun défi ----------
  p = await ouvrir(browser, 'aucun');
  await p.waitForSelector('#cartes-quests .cq-list', { timeout: 8000 }).catch(() => {});
  check(await lire(p) === null, 'aucun défi : pas d’encadré');
  check(await p.evaluate(() => document.querySelectorAll('#cartes-quests .cq-item').length) === 2, 'aucun défi : les quêtes restent');
  await p.ctx.close();

  // ---------- 6. Téléphone, sombre et clair ----------
  for (const mode of ['sombre', 'clair']) {
    const prefs = mode === 'clair' ? { mode: 'clair' } : {};
    p = await ouvrir(browser, 'fini', { width: 390, height: 844, touch: true, init: { content: `try{localStorage.setItem('hg_prefs',${JSON.stringify(JSON.stringify(prefs))})}catch(e){}` } });
    await p.waitForSelector('[data-action="defi-claim"]', { timeout: 8000 }).catch(() => {});
    await sleep(300);
    check(await hscroll(p) === 0, `390 px ${mode} : pas de défilement horizontal`);
    const m = await p.evaluate(() => {
      const b = document.querySelector('[data-action="defi-claim"]').getBoundingClientRect();
      const k = document.querySelector('.cq-defi-k'), box = document.querySelector('.cq-defi');
      const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = (c) => { const v = rgb(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const a = lum(getComputedStyle(k).color), z = lum(getComputedStyle(box).backgroundColor);
      return { h: b.height, contraste: (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05), taille: parseFloat(getComputedStyle(k).fontSize) };
    });
    check(m.h >= 44, `390 px ${mode} : bouton de 44 px au moins (${m.h})`);
    check(m.contraste >= 4.5, `390 px ${mode} : sur-titre lisible (contraste ${m.contraste.toFixed(2)})`);
    check(m.taille >= 12, `390 px ${mode} : sur-titre de 12 px au moins`);
    await p.ctx.close();
  }

  // ---------- 7. Admin › Jeu de cartes › Quêtes : le Staff ajoute un défi ----------
  p = await openPage(browser, { page: 'admin', width: 1280 });
  await adminSection(p, 'fabrique/cartes');
  await adminSection(p, 'fabrique/quetes');
  await p.waitForSelector('#acd-panel .acd-item', { timeout: 5000 }).catch(() => {});
  await p.click('[data-act="quest-new"]');
  await p.waitForSelector('#acd-quest-form', { timeout: 5000 });
  check(await p.locator('#aq-defi').isHidden() && await p.locator('#aq-reward-f').isVisible(), 'admin : quête par défaut (Paillettes, pas de booster)');
  await p.fill('#aq-code', 'defi_test');
  await p.fill('#aq-label', 'Obtiens 4 cartes de la série « {serie} »');
  await p.selectOption('#aq-metric', 'cartes_serie');
  await p.selectOption('#aq-kind', 'defi');
  check(await p.locator('#aq-defi').isVisible() && await p.locator('#aq-reward-f').isHidden(), 'admin : défi → booster et série, plus de Paillettes');
  await p.fill('#aq-target', '4');
  await p.click('dialog.ui-drawer[open] [data-drawer-submit]');
  await p.waitForSelector('dialog.ui-drawer', { state: 'detached', timeout: 5000 }).catch(() => {});
  await sleep(300);
  const cree = await p.evaluate(() => window.__DB.hg_card_quests_templates.find((q) => q.code === 'defi_test'));
  check(cree && cree.defi === true && cree.metric === 'cartes_serie' && cree.target === 4 && cree.set_id === null && !!cree.reward_booster,
    `admin : défi enregistré (defi, série de la semaine, booster ${cree?.reward_booster})`);
  check(await p.evaluate(() => /Défi de collection/.test(document.querySelector('#acd-panel').textContent)), 'admin : le défi est signalé dans la liste');
  check(p.errs.length === 0, `admin : aucune erreur (${p.errs.join(' | ') || 'rien'})`);
  await p.ctx.close();

  await browser.close();
  finish();
})();
