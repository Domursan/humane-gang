// Parcours de la table de Shadow Hunters (maquette validée du 9 novembre) : la vraie table, avec les vrais contenus lus dans la
// migration 127 et un état de la forme de hg_plat_etat + hg_plat__shadow_vue (migrations 125 et 127), poussé par le test.
// Vérifie : la dernière carte Lumière ou Ténèbres piochée s'affiche avec son effet (et suit la pioche suivante) ; les lieux sont
// rangés par zone selon le tirage de la partie, avec leur effet, ma zone marquée ; les joueurs révélés montrent personnage,
// pouvoir et PV « x / max » (fiche et médaillon), « À portée » pour qui je peux attaquer, rien pour un personnage caché ;
// ma fiche et celles des autres sont dans la même colonne, l'une sous l'autre ; équipements lisibles sans clic ; lieux possibles
// au choix du lieu ; téléphone : l'action puis la dernière carte puis la table, sans défilement horizontal.
// Faux Supabase : fixtures/fake-sb-fins-contenus.mjs.
const fs = require('fs');
const path = require('path');
const { check, finish, openPage, hscroll, sleep, chromium, DEPOT } = require('../../lib/harness.cjs');

const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const A = U(2), B = U(3), C = U(4), D = U(5);
const CODE = 'HGSHH-1234';
const COUL = { Toi: '#FBD32D', Alice: '#E9849D', Bruno: '#7E93C9', 'Chloé': '#D9764B', David: '#6FA37F' };
const iso = (s = 0) => new Date(Date.now() + s * 1000).toISOString();

/** Contenus du jeu, lus dans la migration 127 (lieux, personnages, cartes). */
function contenus() {
  const t = fs.readFileSync(path.join(DEPOT, 'supabase/migrations/127_shadow_hunters.sql'), 'utf8').split('\r\n').join('\n');
  const deb = t.indexOf("select 'shadow', c.cle");
  const bloc = t.slice(deb, t.indexOf(') c(cle, libelle, v, sort)', deb));
  const re = /\('([a-z_0-9]+)',\s*'((?:[^']|'')*)',\s*(?:to_jsonb\('((?:[^']|'')*)'::text\)|to_jsonb\((\d+)\)|'((?:[^']|'')*)'::jsonb),\s*\d+\)/g;
  const o = {}; let m;
  while ((m = re.exec(bloc))) o[m[1]] = m[3] !== undefined ? m[3].split("''").join("'") : m[4] !== undefined ? Number(m[4]) : JSON.parse(m[5].split("''").join("'"));
  return o;
}
const CONTENUS = contenus();

const PV = { emi: 10, georges: 14, vampire: 13, loupgarou: 14, allie: 8 };
const camp = (p) => (['emi', 'franklin', 'georges'].includes(p) ? 'hunter' : ['inconnu', 'vampire', 'loupgarou'].includes(p) ? 'shadow' : 'neutre');
const joueur = (id, pseudo, place, etat) => ({ user_id: id, pseudo, couleur: COUL[pseudo], avatar_url: null, invite: false, place, pret: true, parti: false, absent: false, elimine: false, etat, gagne: null, rang: null, paillettes: 0 });
const et = (perso, revele, lieu, degats, equip = []) => ({ revele, perso: revele ? perso : null, camp: revele ? camp(perso) : null, degats, lieu, equip, pouvoir: false, ange: false });
// Tirage des zones qui n'est pas l'ordre par défaut : la table doit suivre celui de la partie.
const ZONES = [['foret', 'ermite'], ['porte', 'sanctuaire'], ['cimetiere', 'monastere']];
const ligne = (id, uid, type, texte) => ({ id, user_id: uid, type, texte, prive: false, created_at: iso(-id) });
const JOURNAL = [ligne(3, ME, 'soin', 'Toi soigne 2 Blessures.'), ligne(2, ME, 'carte', 'Toi pioche : Eau bénite.'), ligne(1, ME, 'deplacer', 'Toi va à : Cimetière.')];

/** Mon tour (Georges, caché, au Cimetière) ; Alice (Emi) et Bruno (Loup-garou) révélés ; Chloé et David cachés. */
function etat(jeu = {}, journal = JOURNAL) {
  const js = [
    joueur(ME, 'Toi', 1, et('georges', false, 'cimetiere', 6, ['L:toge'])),
    joueur(A, 'Alice', 2, et('emi', true, 'monastere', 4, ['T:hache'])),
    joueur(B, 'Bruno', 3, et('loupgarou', true, 'foret', 5)),
    joueur(C, 'Chloé', 4, et('vampire', false, 'porte', 1)),
    joueur(D, 'David', 5, et('allie', false, 'ermite', 2)),
  ];
  const pv = Object.fromEntries(js.map((j) => [j.user_id, j.etat.revele ? PV[j.etat.perso] : null]));
  return {
    partie: { id: 'partie-shadow', jeu: 'shadow', nom_jeu: 'Shadow Hunters', code: CODE, nom: 'Soirée', statut: 'en_cours', hote: ME, visibilite: 'privee', invites: true, nb_places: 6, t_tour: 90, options: {}, tour: ME, tour_fin: iso(74), nb_tours: 12, suite: null, raison: null, version: 40, started_at: iso(-2400), ended_at: null },
    maintenant: iso(0), moi: { user_id: ME, joue: true, hote: true, invite: false }, joueurs: js, journal, badges: [],
    jeu: { phase: 'attaque', actif: ME, zones: ZONES, des: { d6: 5, d4: 3, type: 'deplacement' }, options: null, carte: null, attaques: 0, composition: { hunter: 2, shadow: 2, neutre: 1 },
      pioches: { vision: 9, lumiere: 11, tenebres: 10 }, vision: null, morts: [], pv,
      moi: { perso: 'georges', camp: 'hunter', pv: 14, connus: {}, vision_main: null, portee: [A] }, ...jeu },
  };
}

const ouvrir = async (browser, e, o = {}) => {
  const p = await openPage(browser, { page: 'shadow-hunters', fixture: 'fake-sb-fins-contenus.mjs', hash: `#partie/${CODE}`, width: o.width || 1280, height: o.height || 900,
    reducedMotion: 'reduce', mobile: !!o.mobile, init: { content: `window.__FIN = { etat: ${JSON.stringify(e)}, contenus: ${JSON.stringify(CONTENUS)} };` } });
  await p.waitForSelector('.sh-table .sh-zone', { timeout: 8000 });
  await sleep(300);
  return p;
};
const texte = async (loc) => ((await loc.count()) ? (await loc.first().innerText()).replace(/\s+/g, ' ') : '');
const sansErreur = (p, nom) => check(p.errs.length === 0, `${nom} : aucune erreur JS${p.errs.length ? ` — ${p.errs.slice(0, 3).join(' | ')}` : ''}`);

(async () => {
  const browser = await chromium.launch();
  let p;
  try {
    p = await ouvrir(browser, etat());

    // 1. Carte piochée : l'effet est affiché, pas seulement le nom.
    const carte = p.locator('.sh-carte-bloc');
    check(await carte.isVisible(), 'dernière carte : le bloc est visible');
    const tCarte = await texte(carte);
    check(tCarte.includes('Eau bénite') && tCarte.includes('Soigne 2 de tes Blessures.') && tCarte.includes('Toi · Lumière'), `dernière carte : nom, effet, qui et pioche (${tCarte})`);

    // 2 et 3. Zones : les paires du tirage, dans l'ordre, chaque lieu avec son effet ; ma zone est marquée.
    const zones = await p.$$eval('.sh-zone', (l) => l.map((z) => [...z.querySelectorAll('.sh-lieu')].map((x) => x.dataset.lieu)));
    check(JSON.stringify(zones) === JSON.stringify(ZONES), `zones : les paires du tirage de la partie (${JSON.stringify(zones)})`);
    const effets = await p.$$eval('.sh-lieu', (l) => l.map((x) => [x.dataset.lieu, x.querySelector('.sh-lieu-effet')?.textContent || '']));
    const attendus = Object.fromEntries(CONTENUS.lieux.map((l) => [l.id, l.texte]));
    check(effets.length === 6 && effets.every(([id, t]) => t === attendus[id]), 'lieux : les 6 effets sont affichés, tels que dans les contenus');
    check(await p.locator('.sh-zone.is-mienne').count() === 1 && await p.locator('.sh-zone.is-mienne [data-lieu="cimetiere"]').count() === 1, 'ma zone (celle du Cimetière) est marquée');
    check((await texte(p.locator('.sh-zone.is-mienne .sh-tag-zone'))) === 'Ta zone', '« Ta zone » est écrit, pas seulement en couleur');
    check(await p.locator('.sh-lieu[data-lieu="monastere"] .sh-pion[data-uid="' + A + '"]').count() === 1, 'pions : Alice est sur le Monastère');

    // 4. Joueurs révélés : personnage, pouvoir, PV sur le total ; un caché ne montre rien.
    const medA = await texte(p.locator(`.sh-med[data-uid="${A}"]`));
    check(medA.includes('Emi · 6/10 PV') && medA.includes('À portée'), `médaillon d'Alice : personnage, PV et « À portée » (${medA})`);
    check((await texte(p.locator(`.sh-med[data-uid="${B}"]`))).includes('Loup-garou · 9/14 PV'), 'médaillon de Bruno : personnage et PV');
    const fiches = p.locator('.sh-gauche .sh-fiches > .sh-fiche');
    check(await fiches.count() === 4, 'fiches : les 4 autres joueurs');
    const fA = await texte(fiches.nth(0));
    const pouvoirEmi = CONTENUS.personnages.find((x) => x.id === 'emi').pouvoir;
    check(fA.includes('Emi') && fA.includes('6 / 10 PV') && fA.includes(pouvoirEmi) && fA.includes('Monastère · zone 3') && fA.includes('À portée'), `fiche d'Alice : personnage, PV, pouvoir, lieu et zone (${fA.slice(0, 160)})`);
    const fC = await texte(fiches.nth(2));
    check(fC.includes('Personnage caché') && !fC.includes('Vampire') && !fC.includes('Pouvoir') && fC.includes('1 blessure'), `fiche de Chloé : rien de caché n'est dévoilé (${fC})`);
    check((await texte(fiches.nth(1))).includes('Forêt hantée · zone 1') && !(await texte(fiches.nth(1))).includes('À portée'), 'fiche de Bruno : zone 1, pas à portée');

    // Équipements lisibles sans clic.
    check(await p.getByText('Tes attaques réussies infligent 1 Blessure de plus.').isVisible(), 'équipement d\'Alice : effet visible sans clic');
    check(await p.locator('.sh-fiche.is-moi').getByText('Les attaques que tu fais et que tu subis infligent 1 Blessure de moins.').isVisible(), 'mon équipement : effet visible sans clic');

    // 5. Mise en page : ma fiche et les autres dans la même colonne, à la suite.
    const boites = await p.evaluate(() => {
      const b = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), bas: Math.round(r.bottom + scrollY) }; };
      return { moi: b(document.querySelector('.sh-fiche.is-moi')), autre: b(document.querySelector('.sh-fiches > .sh-fiche')), panneau: b(document.querySelector('.sh-panneau')) };
    });
    check(boites.moi.x === boites.autre.x && boites.autre.y > boites.moi.bas && boites.autre.y - boites.moi.bas < 40, `les autres joueurs suivent ma fiche dans la même colonne (${JSON.stringify(boites)})`);
    check(Math.abs(boites.moi.y - boites.panneau.y) < 80, 'ma fiche et l\'action sont en haut de la table, côte à côte');
    await p.screenshot({ path: `${__dirname}/../../shots/shadow-table-1280.png`, fullPage: true });

    // La pioche suivante remplace la dernière carte.
    const suite = etat({}, [ligne(5, B, 'carte', 'Bruno pioche : Ange gardien.'), ...JOURNAL]);
    suite.partie.version = 41; // nouvelle version, comme après une action
    await p.evaluate((x) => window.__FIN.pousser(x), suite);
    await p.waitForFunction(() => document.querySelector('.sh-carte-bloc')?.textContent.includes('Ange gardien'), null, { timeout: 4000 }).catch(() => {});
    const tCarte2 = await texte(carte);
    check(tCarte2.includes('Bruno · Lumière') && !tCarte2.includes('Eau bénite') && tCarte2.includes('Les attaques ne te blessent pas'), `dernière carte : suit la pioche de Bruno (${tCarte2})`);
    sansErreur(p, '1280 px');
    await p.ctx.close();

    // Choix du lieu : les lieux possibles sont marqués dans leur zone.
    p = await ouvrir(browser, etat({ phase: 'choisir_zone', des: { d6: 6, d4: 3, type: 'deplacement' }, options: ['foret', 'sanctuaire'] }));
    check(await p.locator('.sh-lieu.is-option').count() === 2 && await p.locator('.sh-lieu.is-choix[data-lieu="foret"]').count() === 1, 'choix du lieu : deux lieux possibles, le premier coché');
    await p.locator('.sh-panneau [data-act="choisir-lieu"][data-lieu="sanctuaire"]').click();
    check(await p.locator('.sh-lieu.is-choix[data-lieu="sanctuaire"]').count() === 1, 'choix du lieu : cocher un autre lieu le marque sur le plateau');
    sansErreur(p, 'choix du lieu');
    await p.ctx.close();

    // Spectateur : aucune fiche « Toi », tous les joueurs dans la colonne.
    const spect = etat();
    spect.moi = { user_id: null, joue: false, hote: false, invite: false };
    spect.jeu.moi = null;
    p = await ouvrir(browser, spect);
    check(await p.locator('.sh-fiches > .sh-fiche').count() === 5 && await p.locator('.sh-fiche.is-moi').count() === 0, 'spectateur : les 5 joueurs, sans fiche « Toi »');
    sansErreur(p, 'spectateur');
    await p.ctx.close();

    // Téléphone : l'action, puis la dernière carte, puis la table ; pas de défilement horizontal.
    p = await ouvrir(browser, etat(), { width: 390, height: 844, mobile: true });
    const ys = await p.evaluate(() => ['.sh-panneau', '.sh-carte-bloc', '.sh-rond', '.sh-zones-bloc', '.sh-fiche.is-moi'].map((s) => Math.round(document.querySelector(s).getBoundingClientRect().top)));
    check(ys.every((y, i) => i === 0 || y > ys[i - 1]), `téléphone : action, dernière carte, table, lieux, joueurs (${ys.join(', ')})`);
    check(await hscroll(p) <= 0, 'téléphone : pas de défilement horizontal');
    await p.screenshot({ path: `${__dirname}/../../shots/shadow-table-390.png`, fullPage: true });
    sansErreur(p, '390 px');
    await p.ctx.close();
  } catch (e) {
    check(false, 'arrêt sur erreur : ' + String(e.message).split('\n')[0]);
  } finally {
    await browser.close();
  }
  finish();
})();
