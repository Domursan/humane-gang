// Parcours navigateur du lot B : Bataille navale et Qui est-ce ? contre le robot, puis défi entre deux membres (téléphone), fins.
const { ouvrir, shot, fermer, psql, uid } = require('./lib.js');
const q = (n, sql) => { const r = psql(uid(n), sql); if (!r.ok) throw new Error(r.message); return r.text; };
const su = (sql) => { const r = psql(null, 'reset role; ' + sql); if (!r.ok) throw new Error(r.message); return r.text; };
(async () => {
  const a = await ouvrir(2, '');
  await shot(a, '30-accueil-5-jeux');
  await a.goto('http://localhost:8080/pages/jeux/duels.html#creer/bataille'); await a.waitForTimeout(1500);
  await shot(a, '31-creer-bataille');
  // Bataille contre le robot : placement
  const c1 = JSON.parse(q(2, `select to_jsonb(hg_duel_creer('{"jeu":"bataille","adversaire":"robot","robot":2,"commence":"moi"}'::jsonb))`));
  await a.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c1}`); await a.waitForTimeout(2500);
  await shot(a, '32-bn-placement-vide', false);
  await a.locator('[data-act="hasard"]').first().click(); await a.waitForTimeout(1200);
  await shot(a, '33-bn-placement-hasard', false);
  await a.locator('[data-act="valider"]').first().click(); await a.waitForTimeout(2500);
  for (let i = 0; i < 4; i++) {
    const c = a.locator('[data-role="tir"]:not([disabled])').nth(i * 7);
    if (await c.count()) { await c.click(); await a.waitForTimeout(1500); }
  }
  const radar = a.locator('[data-act="radar"]').first();
  if (await radar.count() && await radar.isEnabled()) { await radar.click(); await a.waitForTimeout(300); await a.locator('[data-role="tir"]:not([disabled])').nth(40).click(); await a.waitForTimeout(1500); }
  console.log('tirs BN', su(`select count(*) from hg_duel_tirs t join hg_duel_parties p on p.id = t.partie where p.code = '${c1}'`));
  await shot(a, '34-bn-jeu', false);
  // Qui est-ce contre le robot
  const c2 = JSON.parse(q(2, `select to_jsonb(hg_duel_creer('{"jeu":"quiestce","adversaire":"robot","robot":2,"commence":"moi"}'::jsonb))`));
  await a.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c2}`); await a.waitForTimeout(3000);
  await shot(a, '35-qec-debut', false);
  const qb = a.locator('[data-act="question"]:visible').first();
  if (await qb.count()) { await qb.click(); await a.waitForTimeout(2500); } else console.log('pas de question');
  const auto = a.locator('[data-act="auto"]:visible').first();
  if (await auto.count()) { await auto.click(); await a.waitForTimeout(1500); }
  await shot(a, '36-qec-apres-question', false);
  // Fin : je devine faux deux fois de suite ? On force la fin par le serveur
  const des = a.locator('[data-act="designer"]:visible').first();
  if (await des.count() && await des.isEnabled()) {
    await des.click(); await a.waitForTimeout(400);
    await a.locator('[data-act="carte"]:not([disabled])').first().click();
    await a.locator('dialog.hg-dialog[open] .btn-primary').click(); await a.waitForTimeout(2500);
  } else console.log('pas de bouton designer');
  await shot(a, '37-qec-apres-designation', false);
  // Défi entre membres au téléphone (bataille), placement puis fin forcée
  const c3 = JSON.parse(q(2, `select to_jsonb(hg_duel_creer('{"jeu":"bataille","adversaire":"membre","membre":"${uid(3)}","commence":"moi","format":1}'::jsonb))`));
  q(3, `select hg_duel_rejoindre('${c3}')`);
  const b = await ouvrir(3, '', 390);
  await b.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c3}`); await b.waitForTimeout(2500);
  await shot(b, '38-bn-placement-tel');
  q(2, `select hg_duel_placer('${c3}', hg_duel_flotte_hasard('${c3}'))`);
  q(3, `select hg_duel_placer('${c3}', hg_duel_flotte_hasard('${c3}'))`);
  q(2, `select hg_duel_tirer('${c3}', 44)`);
  await b.waitForTimeout(3500);
  await shot(b, '39-bn-jeu-tel');
  const c4 = JSON.parse(q(2, `select to_jsonb(hg_duel_creer('{"jeu":"quiestce","adversaire":"membre","membre":"${uid(3)}","commence":"lui","format":1}'::jsonb))`));
  q(3, `select hg_duel_rejoindre('${c4}')`);
  q(3, `select hg_duel_question_libre('${c4}', 'Ton personnage aime-t-il la raclette ?')`);
  await b.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c4}`); await b.waitForTimeout(3000);
  await shot(b, '40-qec-tel');
  await a.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c4}`); await a.waitForTimeout(3000);
  await shot(a, '41-qec-question-libre-recue', false);
  // Fins
  su(`select hg_duel__fin_manche(id, '${uid(2)}') from hg_duel_parties where code = '${c3}' and statut = 'en_cours'`);
  await a.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c3}`); await a.waitForTimeout(3000);
  await shot(a, '42-bn-fin');
  su(`select hg_duel__fin_manche(id, '${uid(3)}') from hg_duel_parties where code = '${c4}' and statut = 'en_cours'`);
  await b.goto(`http://localhost:8080/pages/jeux/duels.html#partie/${c4}`); await b.waitForTimeout(3000);
  await shot(b, '43-qec-fin-tel');
  await fermer();
})().catch(async (e) => { console.log('ERREUR', e.message.slice(0, 400)); await fermer(); process.exit(1); });
