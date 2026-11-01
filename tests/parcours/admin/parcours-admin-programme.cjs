// Parcours : La Fête foraine › Jeux › Programmation (admin/admin-programme.js, migrations 183 et 184), sur le faux Supabase (fixtures/fake-sb.mjs).
// (a) lignes des jeux à date : « programmé jusqu'au », « rien de prévu », jours vides, alerte sous 7 jours, lien vers l'écran complet ;
// (b) calendrier : mois complet, aujourd'hui marqué, une pastille par jeu et par jour, légende, mois suivant et précédent ;
// (c) détail d'un jour : contenu réel par jeu, visible par défaut ; « Masquer les réponses » le retire du DOM, oublié au rechargement ;
// (d) jeux automatiques : réserve, alerte sous 14 jours, jeux générés « rien à programmer » ;
// (e) clavier : flèches dans la grille, focus gardé ;
// (f) droits : Staff quiz, Staff souvenirs, Staff cartes, refus de la base ; gardes des RPC d'écriture dans le SQL ;
// (g) 390 px : pas de défilement horizontal, cases de 44 px de haut au moins ;
// (h) programmer sur place : chaque jeu, remplacer, retirer avec confirmation, annuler, refus du serveur, jour figé, premier jour vide, sans recharger ;
// (i) courses et listes périmées : réponses tardives, liste périmée, échange GeoGuessr atomique, jour courant avant 6 h, boutons bloqués, saisie gardée, images resignées.
const fs = require('fs');
const path = require('path');
const { ROOT, DEPOT, check, finish, openPage, adminSection, hscroll, chromium, sleep } = require('../../lib/harness.cjs');
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const shots = process.env.SHOTS_DIR;
const ROUTE = 'fete/programmation';
const SUTOM = Array.from({ length: 10 }, (_, n) => ({ n, statut: n ? 'programme' : 'auto', titre: `MOTSECRET${n}`, par: n ? 'Ethan' : null, definition: 'Une <b>définition</b>' }));
const scenario = {
  programme: {
    sutom: SUTOM,                                                     // 9 jours d'avance : pas d'alerte
    heardle: [{ n: 0, statut: 'programme', titre: 'Manche — Du jour', par: 'Bruno' }, { n: 1, statut: 'programme', titre: 'Daft Punk — Secret', par: 'Bruno' }, { n: 2, statut: 'annule', titre: 'Annulé — Secret' }, { n: 3, statut: 'programme', titre: 'Jouée — Déjà', joueurs: 4 }], // 1 jour : alerte
    framed: [{ n: 3, statut: 'programme', titre: 'Le Dîner de cons' }], // rien de prévu pour l'instant
    geo: [{ n: 20, statut: 'programme', titre: 'Lausanne' }, { n: 22, statut: 'annule', titre: 'Éteinte' }], // rien avant le 20e jour ; une manche désactivée
    quiz: [{ n: 1, statut: 'programme', titre: 'Qui a inventé la raclette ?', par: 'Ethan' }, { n: 0, statut: 'auto', titre: 'Question vue', vus: 2 }],
  },
  programmeReserves: { pochette: [10, 80] },
};
const texte = (p, s) => p.textContent(s);
const zday = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(Date.now() + n * 864e5);
/** Ouvre la page Programmation et attend le dessin du détail. */
async function ouvre(p) {
  await adminSection(p, ROUTE);
  await p.waitForSelector('.pg, #programme-root .empty:not(:empty)', { timeout: 5000 });
  await sleep(350);
}
/** Ouvre le jour n (décalage depuis aujourd'hui), dans le mois suivant au besoin. */
async function jour(p, n) {
  const k = zday(n);
  if (!(await p.$(`.pg-day[data-day="${k}"]`))) { await p.click('[data-pg="auj"]'); await sleep(300); }
  if (!(await p.$(`.pg-day[data-day="${k}"]`))) { await p.click('[data-pg="suiv"]'); await sleep(300); }
  await p.click(`.pg-day[data-day="${k}"]`);
  await p.waitForFunction(() => !document.querySelector('#pg-detail').textContent.includes('Chargement du détail'));
}
const bloc = (p, c) => texte(p, `#pg-b-${c}`);
/** Clique sur le bouton de confirmation d'une boîte de dialogue. */
async function confirme(p, valeur = 'ok') {
  await p.waitForSelector(`dialog[open] button[value="${valeur}"]`);
  await p.click(`dialog[open] button[value="${valeur}"]`);
}
const fin = (p) => p.waitForFunction(() => document.activeElement?.id?.startsWith('pg-t-'), null, { timeout: 4000 });
/** Choisit une option d'un formulaire et l'enregistre. */
async function envoie(p, c, valeur) {
  await p.waitForSelector(`#pg-f-${c} option[value="${valeur}"]`, { state: 'attached' });
  await p.selectOption(`#pg-f-${c}`, valeur);
  await p.click(`#pg-b-${c} [type="submit"]`);
}
/** Ouvre le formulaire d'un jeu dans le jour ouvert. */
async function formulaire(p, c) {
  await p.click(`#pg-b-${c} [data-pg="programmer"]`);
  await p.waitForSelector(`#pg-f-${c}`);
}
/** Retarde les réponses de fn : celle-ci, ou la réponse donnée (lue avant, donc périmée). Une fois seulement. */
const retarde = (p, fn, ms, reponse) => p.evaluate(([f, d, r]) => {
  window.__FAKE_RPC = async (x) => {
    if (x !== f) return undefined;
    delete window.__FAKE_RPC;
    await new Promise((ok) => setTimeout(ok, d));
    return r ?? undefined;
  };
}, [fn, ms, reponse ?? null]);

(async () => {
  console.log('Racine testée : ' + ROOT);
  const browser = await chromium.launch();
  try {
    let p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario });
    await p.evaluate(() => { location.hash = '#fete'; });
    await p.waitForSelector('#lieu-root a[href="#fete/programmation"]', { timeout: 5000 });
    check((await texte(p, '#lieu-root a[href="#fete/programmation"]')).includes('Programmation'), '(a) tuile « Programmation » dans Jeux');
    await ouvre(p);
    check((await texte(p, '#zone-title')).trim() === 'Programmation', '(a) titre de page');

    /* ---------- (a) lignes ---------- */
    const ligne = (c) => texte(p, `.pg-row[data-jeu="${c}"]`);
    check(await p.$$eval('.pg-row', (l) => l.length) === 5, '(a) une ligne par jeu à date (5)');
    check(/Programmé jusqu’au/.test(await ligne('sutom')) && !(await ligne('sutom')).includes('Moins de 7'), '(a) Sutom : programmé, sans alerte');
    check((await ligne('sutom')).includes('4 jours vides sur 14'), '(a) Sutom : 4 jours vides sur 14');
    check((await ligne('heardle')).includes('Moins de 7 jours d’avance'), '(a) Heardle : alerte sous 7 jours');
    check((await ligne('heardle')).includes('pas de partie'), '(a) Heardle : sans filet, il le dit');
    check((await ligne('framed')).includes('tirage automatique') && !(await ligne('framed')).includes('pas de partie'), '(a) Framed : tirage automatique annoncé');
    check((await ligne('geo')).includes('Rien de prévu avant le'), '(a) GeoGuessr : prochaine manche lointaine signalée');
    check((await ligne('quiz')).includes('tirage automatique'), '(a) Question du jour : tirage automatique annoncé');
    check(await p.$eval('.pg-row[data-jeu="sutom"] a.pg-lien', (a) => a.getAttribute('href')) === '#fete/sutom', '(a) lien vers l’écran complet');

    /* ---------- (b) calendrier ---------- */
    const cases = await p.$$eval('.pg-day', (c) => c.length);
    check(cases >= 28 && cases <= 42 && cases % 7 === 0, `(b) mois complet en semaines (${cases} cases)`);
    check(await p.getAttribute('.pg-day.is-today', 'data-day') === zday(0), '(b) aujourd’hui marqué');
    check(await p.$$eval('.pg-day.is-today .pg-p', (x) => x.map((e) => e.textContent).join('')) === 'SHFGQ', '(b) une pastille lettrée par jeu');
    const lab = await p.getAttribute('.pg-day.is-today', 'aria-label');
    check(lab.includes('Sutom du gang : automatique') && lab.includes('Framed : vide'), '(b) état de chaque jeu dans le nom accessible');
    const styles = await p.$$eval('.pg-legend .pg-p', (x) => x.map((e) => { const c = getComputedStyle(e); return `${c.borderTopStyle}|${c.backgroundImage !== 'none'}|${c.backgroundColor !== 'rgba(0, 0, 0, 0)'}`; }));
    check(new Set(styles).size === 4, '(b) quatre formes de pastille, lisibles sans la couleur');
    const t1 = await texte(p, '#pg-mois');
    await p.click('[data-pg="suiv"]'); await sleep(350);
    check(await texte(p, '#pg-mois') !== t1, '(b) mois suivant');
    check(await p.evaluate(() => document.activeElement?.dataset.pg) === 'suiv', '(e) focus gardé sur « mois suivant »');
    await p.click('[data-pg="prec"]'); await sleep(350);
    check(await texte(p, '#pg-mois') === t1, '(b) retour au mois précédent');
    const range = await p.evaluate(() => window.__LOG.filter((l) => l[1] === 'hg_jeux_programme').map((l) => l[2].p_days));
    check(range.every((n) => n >= 1 && n <= 92), '(b) périodes lues : 92 jours au plus');

    /* ---------- (c) détail ---------- */
    await jour(p, 1);
    check(await p.$eval('#pg-b-sutom strong', (s) => s.textContent) === 'MOTSECRET1', '(c) Sutom : le mot, visible par défaut');
    check((await bloc(p, 'sutom')).includes('Une <b>définition</b>') && !(await p.$('#pg-b-sutom .pg-cont b')), '(c) définition échappée');
    check((await bloc(p, 'sutom')).includes('Programmé par Ethan'), '(c) auteur connu');
    check((await bloc(p, 'heardle')).includes('Daft Punk — Secret') && (await p.getAttribute('#pg-b-heardle a', 'href')).includes('t=30s'), '(c) Heardle : artiste, titre, extrait');
    check((await bloc(p, 'quiz')).includes('Qui a inventé la raclette') && (await texte(p, '#pg-b-quiz .is-bonne')).includes('Ethan'), '(c) Question du jour : question, réponses, la bonne');
    check((await p.$$('#pg-b-quiz .pg-opts li')).length === 2, '(c) Question du jour : toutes les réponses');
    await jour(p, 3);
    check((await bloc(p, 'framed')).includes('Le Dîner de cons') && (await p.$$('#pg-b-framed .pg-imgs img')).length === 3, '(c) Framed : le film et ses images');
    await p.check('[data-pg="masque"]'); await sleep(100);
    let html = await p.innerHTML('#programme-root');
    check(!html.includes('MOTSECRET') && !html.includes('Le Dîner') && !html.includes('<img') && (await texte(p, '#pg-detail')).includes('Réponse masquée'), '(c) masquer : aucun contenu dans la page');
    await jour(p, 1);
    check(!(await p.innerHTML('#programme-root')).includes('MOTSECRET'), '(c) masquage gardé en changeant de jour');
    await p.uncheck('[data-pg="masque"]'); await sleep(100);
    check((await bloc(p, 'sutom')).includes('MOTSECRET1'), '(c) démasquer : contenu revenu');
    await p.check('[data-pg="masque"]');
    const stock = await p.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    check(!/masque|programme/i.test(stock), '(c) rien d’enregistré dans le navigateur');
    await p.reload(); await p.waitForFunction(() => document.getElementById('shell')?.dataset.route);
    await ouvre(p);
    check(!(await p.isChecked('[data-pg="masque"]')) && (await p.innerHTML('#programme-root')).includes('MOTSECRET'), '(c) masquage oublié au rechargement');

    /* ---------- (d) automatiques ---------- */
    const autos = await texte(p, '#pg-h-auto + p + .pg-autos');
    check(autos.includes('300 jours de réserve'), '(d) réserve en jours');
    check(/Pochette du jour[\s\S]*Moins de 14 jours/.test(autos) && (autos.match(/Moins de 14/g) || []).length === 1, '(d) alerte sous 14 jours, sur ce seul jeu');
    check((await texte(p, '.pg-gen')).includes('Rien à programmer'), '(d) jeux générés : rien à programmer');

    /* ---------- (e) clavier ---------- */
    const premiers = await p.$$eval('.pg-day', (b) => b.slice(0, 9).map((x) => x.dataset.day));
    await p.focus('.pg-day');
    await p.keyboard.press('ArrowRight');
    check(await p.evaluate(() => document.activeElement?.dataset.day) === premiers[1], '(e) flèche droite : jour suivant');
    await p.keyboard.press('ArrowDown');
    check(await p.evaluate(() => document.activeElement?.dataset.day) === premiers[8], '(e) flèche bas : semaine suivante');
    await p.keyboard.press('Enter'); await sleep(150);
    check(await p.$eval('.pg-day.is-sel', (b) => b.matches(':focus')), '(e) Entrée ouvre le jour, focus gardé');
    check(await p.evaluate(() => getComputedStyle(document.activeElement).outlineStyle) !== 'none', '(e) focus clavier visible');

    /* ---------- (h) programmer sur place ---------- */
    const url = await p.evaluate(() => { window.__SANS_RELOAD = true; return location.href; });
    // Bouton de ligne : Framed, premier jour vide = aujourd'hui
    await p.click('.pg-row[data-jeu="framed"] [data-pg="ligne"]');
    await p.waitForSelector('#pg-f-framed');
    check(await p.getAttribute('.pg-day.is-sel', 'data-day') === zday(0), '(h) « Programmer » ouvre le premier jour vide du jeu');
    check(await p.evaluate(() => document.activeElement?.id) === 'pg-f-framed', '(h) focus dans le formulaire');
    const options = await p.$$eval('#pg-f-framed option', (o) => o.map((x) => x.textContent));
    check(JSON.stringify(options) === '["Choisir…","Amélie"]', `(h) Framed : seulement les films à 3 images (${options})`);
    check(await p.inputValue('#pg-f-framed') === '', '(h) aucune option présélectionnée');
    await p.click('#pg-b-framed [type="submit"]');
    await p.waitForSelector('#pg-e-framed:not([hidden])');
    check((await texte(p, '#pg-e-framed')).includes('Choisis dans la liste') && await p.evaluate(() => !window.__LOG.some((l) => l[1] === 'hg_framed_round_save')), '(h) rien de choisi : message, aucun envoi');
    await envoie(p, 'framed', 'f1'); await fin(p);
    check((await bloc(p, 'framed')).includes('Amélie') && (await bloc(p, 'framed')).includes('Programmé'), '(h) Framed programmé, détail à jour');
    check(await p.$eval('.pg-day.is-sel .pg-p:nth-child(3)', (x) => x.classList.contains('pg-p-programme')), '(h) calendrier à jour sans recharger');
    check(!(await ligne('framed')).includes('Rien de prévu'), '(h) ligne du haut à jour');
    check(await p.evaluate(() => document.activeElement?.id) === 'pg-t-framed', '(h) focus sur le titre du jeu');

    // Heardle : morceaux validés seulement, remplacer
    await jour(p, 1);
    await formulaire(p, 'heardle');
    check(JSON.stringify(await p.$$eval('#pg-f-heardle option', (o) => o.map((x) => x.value))) === '["","t1"]', '(h) Heardle : seulement les morceaux validés et libres');
    await envoie(p, 'heardle', 't1');
    await p.waitForSelector('dialog[open]');
    check((await texte(p, 'dialog[open]')).includes('Remplacer Heardle') && !(await texte(p, 'dialog[open]')).includes('Daft Punk'), '(h) remplacer : confirmation, sans nommer le contenu');
    await confirme(p, 'cancel'); await sleep(150);
    check((await bloc(p, 'heardle')).includes('Daft Punk') && !!(await p.$('#pg-f-heardle')), '(h) remplacer : « Garder » laisse tout en place');
    await p.click('#pg-b-heardle [type="submit"]');
    await confirme(p); await fin(p);
    check((await bloc(p, 'heardle')).includes('Stromae'), '(h) Heardle remplacé');
    // Sutom : refus du serveur, formulaire gardé, puis réussite
    await p.click('#pg-b-sutom [data-pg="programmer"]');
    await p.waitForSelector('#pg-f-sutom');
    await p.fill('#pg-f-sutom', 'abc');
    await p.click('#pg-b-sutom [type="submit"]');
    await confirme(p);
    await p.waitForSelector('#pg-e-sutom:not([hidden])');
    await p.waitForFunction(() => document.activeElement?.id === 'pg-f-sutom');
    check((await texte(p, '#pg-e-sutom')).includes('5 à 9 lettres') && await p.getAttribute('#pg-e-sutom', 'role') === 'alert', '(h) refus du serveur lisible');
    check(await p.inputValue('#pg-f-sutom') === 'abc', '(h) refus : formulaire gardé');
    await p.fill('#pg-f-sutom', 'fondue');
    await p.click('#pg-b-sutom [type="submit"]'); await confirme(p); await fin(p);
    check(await p.$eval('#pg-b-sutom strong', (s) => s.textContent) === 'FONDUE' && (await bloc(p, 'sutom')).includes('Le plat du gang'), '(h) Sutom remplacé, définition de la banque');
    // Retirer : confirmation, puis annulation de la boîte, puis retrait
    await p.click('#pg-b-sutom [data-pg="retirer"]');
    await confirme(p, 'cancel'); await sleep(150);
    check((await bloc(p, 'sutom')).includes('FONDUE'), '(h) retirer : « Garder » ne change rien');
    await p.click('#pg-b-sutom [data-pg="retirer"]');
    await confirme(p); await fin(p);
    check((await bloc(p, 'sutom')).includes('Tirage automatique le jour même'), '(h) Sutom retiré après confirmation');
    // Question du jour : liste sans secrète, remplacer, retirer
    await p.click('#pg-b-quiz [data-pg="programmer"]');
    await p.waitForSelector('#pg-f-quiz');
    check(!(await texte(p, '#pg-f-quiz')).includes('secrète'), '(h) Question du jour : pas de question secrète');
    await envoie(p, 'quiz', 'q1'); await confirme(p); await fin(p);
    check((await bloc(p, 'quiz')).includes('Qui a gagné la raclette'), '(h) Question du jour remplacée');
    await p.click('#pg-b-quiz [data-pg="retirer"]'); await confirme(p); await fin(p);
    check((await bloc(p, 'quiz')).includes('Tirage automatique le jour même'), '(h) Question du jour retirée');
    // GeoGuessr : réserve, retirer
    await formulaire(p, 'geo');
    check(JSON.stringify(await p.$$eval('#pg-f-geo option', (o) => o.map((x) => x.value))) === '["","g1","g2"]', '(h) GeoGuessr : réserve active seulement');
    await envoie(p, 'geo', 'g1'); await fin(p);
    check((await bloc(p, 'geo')).includes('Gare de Lausanne') && (await bloc(p, 'geo')).includes('Sortie vaudoise') && !!(await p.$('#pg-b-geo img.pg-geo')), '(h) GeoGuessr programmé : lieu et visuel');
    check((await bloc(p, 'geo')).includes('Manche créée par Bruno'), '(h) GeoGuessr : l’auteur est celui de la manche');
    await p.click('#pg-b-geo [data-pg="retirer"]');
    await p.waitForSelector('dialog[open]');
    check((await texte(p, 'dialog[open]')).includes('La photo repart dans la réserve'), '(h) GeoGuessr retiré : la réserve annoncée');
    await confirme(p); await fin(p);
    check(await p.evaluate(() => window.__PG.geo.some((r) => r.id === 'g1' && r.active)), '(h) GeoGuessr retiré : la photo repart dans la réserve');
    await p.click('[data-pg="auj"]'); await sleep(300);
    // Annuler une manche Heardle : confirmation
    await jour(p, 1);
    await p.click('#pg-b-heardle [data-pg="annuler"]');
    await confirme(p); await fin(p);
    check((await bloc(p, 'heardle')).includes('Manche annulée'), '(h) Heardle annulé après confirmation');
    // Manche déjà jouée : figée sauf annulation, avec avertissement
    await jour(p, 3);
    check((await bloc(p, 'heardle')).includes('Déjà jouée') && !(await p.$('#pg-b-heardle [data-pg="programmer"]')) && !(await p.$('#pg-b-heardle [data-pg="retirer"]')), '(h) manche jouée : ni remplacer ni retirer');
    await p.click('#pg-b-heardle [data-pg="annuler"]');
    await p.waitForSelector('dialog[open]');
    check((await texte(p, 'dialog[open]')).includes('4 joueurs l’ont déjà jouée'), '(h) annuler une manche jouée : avertissement');
    await confirme(p, 'cancel'); await sleep(100);
    // Jours figés
    await p.click('[data-pg="auj"]'); await sleep(300);
    check((await bloc(p, 'sutom')).includes('Le mot du jour ne change plus') && !(await p.$('#pg-b-sutom [data-pg="programmer"]')), '(h) Sutom d’aujourd’hui figé');
    check((await bloc(p, 'quiz')).includes('Déjà vue') && !(await p.$('#pg-b-quiz [data-pg="programmer"]')), '(h) question déjà vue figée');
    await p.click(`.pg-day[data-day="${zday(-1)}"]`); await sleep(200);
    check(!(await p.$('#pg-detail [data-pg="programmer"]')), '(h) jour passé : aucune action');
    // Liste vide : on ne peut rien envoyer
    await jour(p, 5);
    await p.click('#pg-b-framed [data-pg="programmer"]');
    await p.waitForSelector('#pg-b-framed [type="submit"]');
    check(await p.isDisabled('#pg-b-framed [type="submit"]'), '(h) plus rien à proposer : Enregistrer désactivé');
    await p.click('#pg-b-framed [data-pg="fermer"]');
    check(await p.evaluate(() => document.activeElement?.dataset.pg) === 'programmer', '(h) Fermer rend le focus au bouton');
    // Heardle : ni « Retirer » sur une manche annulée, ni sur le jour courant, où seule l'annulation reste
    await jour(p, 2);
    check(!(await p.$('#pg-b-heardle [data-pg="retirer"]')) && !!(await p.$('#pg-b-heardle [data-pg="programmer"]')), '(h) Heardle annulé : pas de « Retirer »');
    await jour(p, 0);
    check(!(await p.$('#pg-b-heardle [data-pg="retirer"]')) && !(await p.$('#pg-b-heardle [data-pg="programmer"]')) && !!(await p.$('#pg-b-heardle [data-pg="annuler"]')) && (await bloc(p, 'heardle')).includes('seulement l’annuler'), '(h) Heardle du jour : seulement « Annuler la manche »');
    check(await p.evaluate(() => window.__SANS_RELOAD === true) && p.url() === url, '(h) tout s’est fait sans recharger ni changer d’adresse');
    check(p.errs.length === 0, '(a-h) aucune erreur JS' + (p.errs.length ? ' : ' + p.errs.slice(0, 3).join(' | ') : ''));
    if (shots) await p.screenshot({ path: `${shots}/programme.png`, fullPage: true });
    await p.ctx.close();

    /* ---------- (i) courses, listes périmées, échange GeoGuessr ---------- */
    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario });
    await ouvre(p);
    const compte = (fn) => p.evaluate((f) => window.__LOG.filter((l) => l[1] === f).length, fn);
    const geoDe = (n) => p.evaluate((k) => window.__PG.j.geo.get(k)?.titre, zday(n));
    // Échange atomique : un seul appel, l'ancienne en réserve, la nouvelle sur le jour
    await jour(p, 20);
    await formulaire(p, 'geo');
    const avantRes = await compte('hg_geo_round_save');
    await envoie(p, 'geo', 'g1');
    await p.waitForSelector('dialog[open]');
    check((await texte(p, 'dialog[open]')).includes('La photo repart dans la réserve'), '(i) échange : confirmation');
    await confirme(p); await fin(p);
    check(await geoDe(20) === 'Gare de Lausanne' && await p.evaluate(() => window.__PG.geo.some((r) => r.label === 'Lausanne' && r.active)), '(i) échange : nouvelle sur le jour, ancienne en réserve');
    check(await compte('hg_geo_programme') === 1 && await compte('hg_geo_round_save') === avantRes, '(i) échange : un seul appel, hg_geo_round_save jamais utilisé');
    // Refus de l'échange : rien ne bouge, aucune restauration
    await p.evaluate(() => { window.__PG_REFUS = { hg_geo_programme: 'Photo refusée' }; });
    await formulaire(p, 'geo');
    await envoie(p, 'geo', 'g2'); await confirme(p);
    await p.waitForSelector('#pg-e-geo:not([hidden])');
    await p.waitForFunction(() => document.activeElement?.id === 'pg-f-geo');
    check((await texte(p, '#pg-e-geo')).includes('Photo refusée') && await geoDe(20) === 'Gare de Lausanne' && await compte('hg_geo_programme') === 2, '(i) refus : rien ne bouge, un seul appel');
    check(await p.inputValue('#pg-f-geo') === 'g2', '(i) refus : saisie gardée après relecture');
    await p.evaluate(() => { delete window.__PG_REFUS; });
    await p.click('#pg-b-geo [data-pg="fermer"]');
    // Liste périmée : la photo part ailleurs après l'ouverture du formulaire
    await jour(p, 24);
    await formulaire(p, 'geo');
    await p.waitForSelector('#pg-f-geo option[value="g2"]', { state: 'attached' });
    await p.evaluate((k) => { const G = window.__PG; const r = G.geo.find((x) => x.id === 'g2'); G.geo = G.geo.filter((x) => x !== r); G.j.geo.set(k, { id: r.id, statut: 'programme', titre: r.label, active: true, joueurs: 0, image_path: r.image_path }); }, zday(26));
    const avantLu = await compte('hg_jeux_programme');
    await envoie(p, 'geo', 'g2');
    await p.waitForSelector('#pg-e-geo:not([hidden])');
    await p.waitForFunction(() => !document.querySelector('#pg-f-geo option[value="g2"]') && !!document.querySelector('#pg-f-geo option'));
    check((await texte(p, '#pg-e-geo')).includes('plus en réserve') && await geoDe(26) === 'Lac de Joux', '(i) liste périmée : refusée, la manche reste sur son jour');
    check(await p.inputValue('#pg-f-geo') === '' && await compte('hg_jeux_programme') > avantLu, '(i) refus : vue et liste relues, choix périmé retiré');
    await p.click('#pg-b-geo [data-pg="fermer"]');
    // Tirage du jour entre la lecture et l'envoi : on ne remplace pas ce qu'on n'a pas vu
    await p.click('[data-pg="auj"]'); await sleep(300);
    await formulaire(p, 'geo');
    await p.evaluate((k) => { const G = window.__PG; const r = G.geo.find((x) => x.label === 'Lausanne'); G.geo = G.geo.filter((x) => x !== r); G.j.geo.set(k, { id: r.id, statut: 'programme', titre: 'Tirée au sort', active: true, joueurs: 0, image_path: r.image_path }); }, zday(0));
    await envoie(p, 'geo', await p.$eval('#pg-f-geo option:last-child', (o) => o.value));
    await p.waitForSelector('#pg-e-geo:not([hidden])');
    await p.waitForFunction(() => document.querySelector('#pg-b-geo')?.textContent.includes('Tirée au sort'));
    check((await texte(p, '#pg-e-geo')).includes('a changé') && await geoDe(0) === 'Tirée au sort', '(i) tirage du jour : refusé, la manche tirée reste et s’affiche');
    await p.click('#pg-b-geo [data-pg="fermer"]');
    // Manche désactivée : le texte dit vrai, elle reste désactivée et hors réserve
    await jour(p, 22);
    await p.click('#pg-b-geo [data-pg="retirer"]');
    await p.waitForSelector('dialog[open]');
    check((await texte(p, 'dialog[open]')).includes('ne revient pas dans la réserve'), '(i) manche désactivée : le texte le dit');
    await confirme(p); await fin(p);
    check(await p.evaluate(() => window.__PG.geo.some((r) => r.label === 'Éteinte' && r.active === false)), '(i) manche désactivée : retirée, toujours désactivée');
    await formulaire(p, 'geo');
    check(!(await texte(p, '#pg-f-geo')).includes('Éteinte'), '(i) manche désactivée : pas dans la réserve');
    await p.click('#pg-b-geo [data-pg="fermer"]');
    // Refus de la vraie RPC : manche jouée
    await p.evaluate((k) => { window.__PG.j.geo.set(k, { id: 'jouee', statut: 'programme', titre: 'Jouée', active: true, joueurs: 3 }); }, zday(30));
    const joue = await p.evaluate(async (k) => { const { sb } = await import('/assets/commun/core.js'); return (await sb.rpc('hg_geo_programme', { p_day: k, p_round: null, p_avant: 'jouee' })).error?.message; }, zday(30));
    check(/déjà été jouée/.test(joue || ''), `(i) manche jouée : refusée (${joue})`);
    // Désactiver et réactiver : hg_geo_active seul, sans autre champ ; une manche jouée reste modifiable, comme sur l'écran GeoGuessr
    await p.click('[data-pg="auj"]'); await sleep(300);
    await jour(p, 20);
    const sauvees = await compte('hg_geo_round_save');
    await p.click('#pg-b-geo [data-pg="desactiver"]'); await confirme(p); await fin(p);
    check(await p.evaluate((k) => window.__PG.j.geo.get(k).active === false, zday(20)) && !!(await p.$('#pg-b-geo [data-pg="reactiver"]')) && (await bloc(p, 'geo')).includes('Annulé'), '(i) désactiver : détail à jour');
    await p.click('#pg-b-geo [data-pg="reactiver"]'); await fin(p);
    check(await p.evaluate((k) => window.__PG.j.geo.get(k).active === true, zday(20)) && !!(await p.$('#pg-b-geo [data-pg="desactiver"]')), '(i) réactiver : détail à jour');
    const argsActive = await p.evaluate(() => window.__LOG.filter((l) => l[1] === 'hg_geo_active').map((l) => Object.keys(l[2]).sort().join()));
    check(argsActive.length === 2 && argsActive.every((a) => a === 'p_active,p_round') && await compte('hg_geo_round_save') === sauvees, '(i) désactiver, réactiver : ni jour ni lieu envoyés, hg_geo_round_save jamais appelé');
    const actives = await p.evaluate(async () => { const { sb } = await import('/assets/commun/core.js'); return [(await sb.rpc('hg_geo_active', { p_round: 'jouee', p_active: false })).error?.message, (await sb.rpc('hg_geo_active', { p_round: 'absente', p_active: false })).error?.message]; });
    check(actives[0] === undefined && actives[1] === 'Manche introuvable', `(i) hg_geo_active : manche jouée permise, manche inconnue refusée (${actives})`);
    // Liste de choix tardive, arrivée après une écriture : elle n'entre pas dans le cache
    await p.click('[data-pg="auj"]'); await sleep(300);
    await jour(p, 5);
    await p.click('#pg-b-sutom [data-pg="retirer"]'); await confirme(p); await fin(p); // cache des listes vidé
    await jour(p, 6);
    const lus = await compte('hg_geo_reserve');
    await retarde(p, 'hg_geo_reserve', 500);
    await p.click('#pg-b-geo [data-pg="programmer"]');
    await p.click('#pg-b-sutom [data-pg="retirer"]'); await confirme(p);
    await sleep(800);
    await formulaire(p, 'geo');
    await p.waitForSelector('#pg-f-geo option', { state: 'attached' });
    check(await compte('hg_geo_reserve') === lus + 2, '(i) liste tardive : relue après l’écriture, pas recréée');
    await p.click('#pg-b-geo [data-pg="fermer"]');
    // Détail tardif : une lecture ancienne n'écrase pas la dernière
    await retarde(p, 'hg_jeux_programme_jour', 500, { data: { day: zday(7), courants: {}, jeux: { sutom: { word: 'PERIME', joueurs: 0 }, heardle: null, framed: null, geo: null, quiz: null } }, error: null });
    await p.click(`.pg-day[data-day="${zday(7)}"]`);
    await p.click(`.pg-day[data-day="${zday(8)}"]`);
    await p.click(`.pg-day[data-day="${zday(7)}"]`);
    await sleep(800);
    check(!(await bloc(p, 'sutom')).includes('PERIME') && (await bloc(p, 'sutom')).includes('MOTSECRET7'), '(i) détail tardif ignoré');
    // Boutons bloqués pendant une écriture, rendus après
    await retarde(p, 'hg_sutom_program', 500);
    await p.click('#pg-b-sutom [data-pg="retirer"]'); await confirme(p);
    await p.waitForFunction(() => document.querySelector('[data-pg="suiv"]').disabled);
    check(await p.$$eval('#pg-detail button[data-pg], .pg-row button[data-pg], .pg-day', (b) => b.every((x) => x.disabled)), '(i) écriture en cours : tous les boutons bloqués');
    await fin(p); await sleep(50);
    check(await p.isEnabled('[data-pg="suiv"]') && await p.isEnabled('.pg-row [data-pg="ligne"]'), '(i) écriture finie : boutons rendus');
    // Changement de mois, formulaire ouvert : saisie gardée
    await p.click('[data-pg="auj"]'); await sleep(300);
    await jour(p, 4);
    await p.click('#pg-b-sutom [data-pg="programmer"]');
    await p.waitForSelector('#pg-f-sutom');
    await p.fill('#pg-f-sutom', 'RACLETTE');
    await p.click('[data-pg="suiv"]'); await sleep(350);
    check(await p.inputValue('#pg-f-sutom') === 'RACLETTE', '(i) mois changé : saisie gardée');
    await p.click('[data-pg="prec"]'); await sleep(350);
    await p.click('#pg-b-sutom [data-pg="fermer"]');
    // « Programmer » d'une ligne, puis clic sur un autre jour avant la réponse
    await p.click('[data-pg="auj"]'); await sleep(300);
    await p.evaluate(() => { const r = window.__FAKE_RPC; window.__FAKE_RPC = async (f) => { if (f === 'hg_jeux_programme_jour') await new Promise((ok) => setTimeout(ok, 300)); return r?.(f); }; });
    await p.click('.pg-row[data-jeu="sutom"] [data-pg="ligne"]');
    await sleep(40);
    const autre = await p.$$eval('.pg-day', (b, k) => b.map((x) => x.dataset.day).find((d) => d !== k), await p.getAttribute('.pg-day.is-sel', 'data-day'));
    await p.click(`.pg-day[data-day="${autre}"]`);
    await sleep(800);
    await p.evaluate(() => { delete window.__FAKE_RPC; });
    check(await p.getAttribute('.pg-day.is-sel', 'data-day') === autre && !(await p.$('#pg-f-sutom')), '(i) clic sur un jour pendant « Programmer » : pas de formulaire');
    // « Aujourd'hui » en échec : le jour ouvert ne change pas
    await jour(p, 4);
    await p.click('[data-pg="suiv"]'); await sleep(300);
    const titreAvant = await texte(p, '#pg-mois');
    await p.click('[data-pg="prec"]'); await sleep(300);
    await p.click('[data-pg="suiv"]'); await sleep(300);
    await p.evaluate(() => { window.__FAKE_RPC = (f) => (f === 'hg_jeux_programme' ? { data: null, error: { message: 'Réseau coupé' } } : undefined); });
    await p.click('[data-pg="auj"]'); await sleep(300);
    await p.evaluate(() => { delete window.__FAKE_RPC; });
    check(await texte(p, '#pg-mois') === titreAvant && (await texte(p, '#pg-detail-h')).length > 0 && !(await p.$('.pg-day.is-sel.is-today')) && !(await texte(p, '#pg-detail-h')).includes('aujourd’hui'), '(i) « Aujourd’hui » en échec : mois et jour ouvert inchangés');
    // Réponse de mois tardive, écriture entre-temps : titre et grille d'accord, état intact
    await p.click('[data-pg="auj"]'); await sleep(300);
    await jour(p, 9);
    const titreMois = await texte(p, '#pg-mois');
    await retarde(p, 'hg_jeux_programme', 500, { data: { today: zday(0), jeux: [{ cle: 'sutom', titre: 'Sutom du gang', mode: 'date', jours: [] }] }, error: null });
    await p.click('[data-pg="suiv"]');
    await p.click('#pg-b-sutom [data-pg="retirer"]'); await confirme(p); await fin(p);
    await sleep(600);
    const titreSuite = await texte(p, '#pg-mois');
    check(titreSuite !== titreMois && await p.$eval('.pg-day:not(.is-out)', (b) => new Date(b.dataset.day + 'T12:00Z').toLocaleDateString('fr-CH', { month: 'long', timeZone: 'UTC' })) === titreSuite.toLowerCase().split(' ')[0], '(i) mois tardif et écriture : titre et grille d’accord');
    await p.click('[data-pg="auj"]'); await sleep(300);
    check(await p.$eval(`.pg-day[data-day="${zday(1)}"] .pg-p:nth-child(2)`, (x) => !x.classList.contains('pg-p-vide')), '(i) réponse tardive : l’état n’a pas été touché');
    // Images Framed : resignées au repeint une fois expirées
    await jour(p, 3);
    const signe = await p.evaluate(async () => {
      const { sb } = await import('/assets/commun/core.js');
      const avant = sb.storage.from; let n = 0;
      sb.storage.from = (...a) => { const o = avant.apply(sb.storage, a); const c = o.createSignedUrls; o.createSignedUrls = (...x) => { n++; return c.apply(o, x); }; return o; };
      const m = document.querySelector('[data-pg="masque"]');
      m.click(); m.click();
      await new Promise((ok) => setTimeout(ok, 150));
      const frais = n;
      const reel = Date.now; Date.now = () => reel() + 11 * 60000;
      m.click(); m.click();
      await new Promise((ok) => setTimeout(ok, 200));
      Date.now = reel; sb.storage.from = avant;
      return { frais, expire: n };
    });
    check(signe.frais === 0 && signe.expire >= 1 && (await p.$$('#pg-b-framed .pg-imgs img')).length === 3, `(i) images resignées une fois expirées (${JSON.stringify(signe)})`);
    check(p.errs.length === 0, '(i) aucune erreur JS' + (p.errs.length ? ' : ' + p.errs.slice(0, 3).join(' | ') : ''));
    await p.ctx.close();

    // GeoGuessr avant 6 h : le jour courant est la veille
    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { ...scenario, programme: { ...scenario.programme, geo: [] }, programmeCourants: { geo: -1 } } });
    await ouvre(p);
    await p.click('.pg-row[data-jeu="geo"] [data-pg="ligne"]');
    await p.waitForSelector('#pg-f-geo');
    check(await p.getAttribute('.pg-day.is-sel', 'data-day') === zday(-1), '(i) avant 6 h : le premier jour vide GeoGuessr est la veille');
    await envoie(p, 'geo', 'g1'); await fin(p);
    check(await p.evaluate((k) => window.__PG.j.geo.get(k)?.titre, zday(-1)) === 'Gare de Lausanne', '(i) avant 6 h : la veille reste programmable');
    await jour(p, -2);
    check(!(await p.$('#pg-b-geo [data-pg="programmer"]')), '(i) avant 6 h : l’avant-veille est passée');
    const passe = await p.evaluate(async (k) => { const { sb } = await import('/assets/commun/core.js'); return (await sb.rpc('hg_geo_programme', { p_day: k, p_round: 'g2', p_avant: null })).error?.message; }, zday(-2));
    check(/à venir/.test(passe || ''), `(i) avant 6 h : jour passé refusé par le serveur (${passe})`);
    check(p.errs.length === 0, '(i) avant 6 h : aucune erreur JS');
    await p.ctx.close();

    /* ---------- (f) droits ---------- */
    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { ...scenario, uid: U(2), staff: ['quiz'] } });
    await ouvre(p);
    const lignes = await p.$$eval('.pg-row', (l) => l.map((x) => x.dataset.jeu));
    check(JSON.stringify(lignes) === '["quiz"]', `(f) Staff quiz : Question du jour seulement (${lignes})`);
    check(await p.$$eval('.pg-day.is-today .pg-p', (x) => x.length) === 1 && !(await p.$('#pg-h-auto')), '(f) Staff quiz : une pastille, pas de réserves');
    await p.click('.pg-row[data-jeu="quiz"] [data-pg="ligne"]');
    await p.waitForSelector('#pg-f-quiz');
    await envoie(p, 'quiz', 'q1'); await fin(p);
    check((await bloc(p, 'quiz')).includes('Qui a gagné la raclette'), '(f) Staff quiz : programme la Question du jour');
    const refus = await p.evaluate(async (k) => { const { sb } = await import('/assets/commun/core.js'); return (await sb.rpc('hg_sutom_program', { p_day: k, p_word: 'FONDUE', p_definition: null })).error?.message; }, zday(4));
    check(/souvenirs/.test(refus || ''), `(f) Staff quiz : Sutom refusé par la base simulée (${refus})`);
    check(p.errs.length === 0, '(f) Staff quiz : aucune erreur JS');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { ...scenario, uid: U(2), staff: ['souvenirs'] } });
    await ouvre(p);
    check(!(await p.$('.pg-row[data-jeu="quiz"]')) && !(await p.$('#pg-b-quiz')), '(f) Staff souvenirs : pas de Question du jour');
    const refus2 = await p.evaluate(async (k) => { const { sb } = await import('/assets/commun/core.js'); return (await sb.rpc('hg_quiz_daily_plan', { p_day: k, p_question: 'q1' })).error?.message; }, zday(4));
    check(!!refus2, `(f) Staff souvenirs : Question du jour refusée par la base simulée (${refus2})`);
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario: { ...scenario, uid: U(2), staff: ['cartes'] } });
    await p.evaluate(() => { location.hash = '#fete/programmation'; }); await sleep(500);
    check(await p.evaluate(() => location.hash) !== '#fete/programmation' && !(await p.isVisible('#jeux-programme')), '(f) Staff cartes : adresse redirigée, section masquée');
    check(await p.evaluate(() => !window.__LOG.some((l) => /^hg_jeux_programme/.test(l[1]))), '(f) Staff cartes : RPC jamais appelées');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario, init: () => { window.__FAKE_RPC = (fn) => (fn === 'hg_jeux_programme' ? { data: null, error: { message: 'Réservé à l’admin', code: '42501' } } : undefined); } });
    await ouvre(p);
    check((await texte(p, '#programme-root')).includes('Programmation indisponible : '), '(f) refus de la base : écran vide propre');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario, init: () => { window.__FAKE_RPC = (fn) => (fn === 'hg_jeux_programme_jour' ? { data: null, error: { message: 'Fonction absente' } } : undefined); } });
    await ouvre(p);
    check((await texte(p, '#pg-detail')).includes('Détail indisponible : Fonction absente') && (await bloc(p, 'sutom')).includes('MOTSECRET0') && !(await p.$('#pg-detail [data-pg="programmer"]')), '(f) détail en erreur : le titre reste, sans action');
    await p.ctx.close();

    p = await openPage(browser, { page: 'admin', width: 1280, height: 900, scenario, init: () => { window.__FAKE_RPC = (fn) => (fn === 'hg_jeux_programme' ? { data: { today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(Date.now()), jeux: [] }, error: null } : undefined); } });
    await ouvre(p);
    check((await texte(p, '#programme-root')).includes('Aucun jeu à programmer avec tes droits') && p.errs.length === 0, '(f) aucun jeu permis : écran vide propre');
    await p.ctx.close();

    // Gardes côté SQL : chaque RPC d'écriture vérifie sa permission ; 184 filtre par bloc et ferme anon.
    const sql = (f) => fs.readFileSync(path.join(DEPOT, 'supabase/migrations', f), 'utf8');
    const garde = (f, fn, perm) => { const s = sql(f); const i = s.indexOf(`function public.${fn}(`); return i >= 0 && s.slice(i, i + 700).includes(`hg_has_perm('${perm}')`); };
    check(garde('084_idees_j2.sql', 'hg_sutom_program', 'souvenirs') && garde('085_idees_j3.sql', 'hg_heardle_round_save', 'souvenirs') && garde('085_idees_j3.sql', 'hg_framed_round_save', 'souvenirs')
      && garde('083_idees_j1.sql', 'hg_geo_round_save', 'souvenirs') && garde('084_idees_j2.sql', 'hg_quiz_daily_plan', 'quiz'), '(f) SQL : chaque écriture vérifie sa permission');
    const m184 = sql('184_jeux_programme_jour.sql');
    check(/if v_souvenirs then[\s\S]*'sutom'[\s\S]*if v_quiz then[\s\S]*'quiz'/.test(m184) && ['hg_jeux_programme_jour(date)', 'hg_geo_reserve()', 'hg_geo_programme(date, uuid, uuid)', 'hg_geo_active(uuid, boolean)'].every((x) => m184.includes(`revoke all on function public.${x} from public, anon`)), '(f) SQL 184 : blocs filtrés, anon fermé');
    const sansNotes = m184.replace(/--[^\n]*/g, '');
    const lectures = sansNotes.slice(0, sansNotes.indexOf('function public.hg_geo_programme'));
    check(!/\b(insert|update|delete)\b\s+(into\s+|from\s+)?(public\.)?hg_/i.test(lectures) && !/_ensure|hg_geo_current|hg_nj__/.test(lectures), '(f) SQL 184 : les lectures n’écrivent rien');
    const ecrit = sansNotes.slice(sansNotes.indexOf('function public.hg_geo_programme'), sansNotes.indexOf('function public.hg_geo_active'));
    const active = sansNotes.slice(sansNotes.indexOf('function public.hg_geo_active'));
    check(garde('184_jeux_programme_jour.sql', 'hg_geo_reserve', 'souvenirs') && garde('184_jeux_programme_jour.sql', 'hg_geo_programme', 'souvenirs') && garde('184_jeux_programme_jour.sql', 'hg_geo_active', 'souvenirs'), '(f) SQL 184 : droits de hg_geo_round_save');
    check(JSON.stringify(active.match(/update hg_geo_rounds set [^;]*/g)) === '["update hg_geo_rounds set active = p_active, updated_at = now() where id = p_round"]' && active.includes('hg_admin_audit('), '(f) SQL 184 : hg_geo_active ne change que active et updated_at, avec audit');
    check((ecrit.match(/update hg_geo_rounds set [^;]*/g) || []).length === 2 && (ecrit.match(/update hg_geo_rounds set [^;]*/g) || []).every((u) => /set day = (null|p_day), updated_at = now\(\) where id =/.test(u)) && ecrit.includes("pg_advisory_xact_lock(hashtextextended('hg_geo_day', 0))"), '(f) SQL 184 : seul le jour change, sous le verrou du tirage');

    // Framed tiré au sort : la ligne sans auteur s'affiche « Automatique ».
    p = await openPage(browser, { page: 'admin', width: 1280, scenario: { ...scenario, programme: { ...scenario.programme, framed: [{ n: 0, statut: 'auto', titre: 'Film tiré' }] } } });
    await ouvre(p);
    check((await bloc(p, 'framed')).includes('Automatique') && (await bloc(p, 'framed')).includes('Tirage automatique') && !(await bloc(p, 'framed')).includes('Programmé par'), '(f) Framed : jour tiré affiché Automatique');
    await p.ctx.close();

    /* ---------- (g) téléphone ---------- */
    p = await openPage(browser, { page: 'admin', width: 390, height: 844, scenario });
    await ouvre(p);
    check(await hscroll(p) <= 0, '(g) 390 px : pas de défilement horizontal');
    const mini = await p.$$eval('.pg-day', (b) => Math.min(...b.map((x) => x.getBoundingClientRect().height)));
    check(mini >= 44, `(g) cases d’au moins 44 px de haut (${Math.round(mini)})`);
    await jour(p, 3);
    await formulaire(p, 'framed');
    check(await hscroll(p) <= 0, '(g) formulaire ouvert : pas de défilement horizontal');
    if (shots) await p.screenshot({ path: `${shots}/programme-mobile.png`, fullPage: true });
    check(p.errs.length === 0, '(g) aucune erreur JS');
    await p.ctx.close();
  } catch (e) { check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]); }
  finally { await browser.close(); }
  finish();
})();
