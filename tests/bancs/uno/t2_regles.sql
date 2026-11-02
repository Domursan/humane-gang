-- Règles précises : main cachée, +4 contestable, UNO contré, interception, sortie, robot, invités, récompenses.
do $$
declare v_code text; v_id uuid; e jsonb; c bigint; r text; u2 uuid := t_uid(2); u3 uuid := t_uid(3); u1 uuid := t_uid(1); i int;
begin
  delete from hg_wallet_log where reason = 'uno';  -- plafond du jour remis à zéro (les simulations en ont distribué)
  -- Accès
  perform t_ok(t_err(21, 'hg_uno_creer(''{}''::jsonb)') like 'Accès%', 'un membre sans accès ne peut pas créer');
  v_code := t_call(1, 'hg_uno_creer(''{"nb_places":3,"variantes":{"interception":true}}''::jsonb)') #>> '{}';
  v_id := t_pid(v_code);
  perform t_ok(v_code ~ '^HGUNO-[0-9]{4}$', 'code au format HGUNO-####');
  perform t_call(2, format('hg_uno_rejoindre(%L)', v_code));
  perform t_ok(t_err(1, format('hg_uno_lancer(%L)', v_code)) like 'Tous les joueurs%', 'lancement refusé si un joueur n''est pas prêt');
  perform t_call(2, format('hg_uno_pret(%L, true)', v_code));
  perform t_call(3, format('hg_uno_rejoindre(%L)', v_code));
  perform t_call(3, format('hg_uno_pret(%L, true)', v_code));
  perform t_ok(t_err(4, format('hg_uno_rejoindre(%L)', v_code)) like '%complète%', 'partie complète refusée');
  perform t_call(1, format('hg_uno_lancer(%L)', v_code));
  perform t_ok((select count(*) from hg_uno_cartes where partie = v_id and lieu = 'main') = 21, '7 cartes chacun');

  -- Main cachée : lecture directe interdite, l'état ne montre que ma main
  perform t_ok(not has_table_privilege('authenticated', 'public.hg_uno_cartes', 'select'), 'lecture directe des cartes interdite');
  perform t_ok(not has_table_privilege('anon', 'public.hg_uno_parties', 'select'), 'aucune lecture directe pour un visiteur');
  e := t_call(2, format('hg_uno_etat(%L)', v_code));
  perform t_ok(jsonb_array_length(e->'main') = 7 and not exists (select 1 from jsonb_array_elements(e->'main') x
    where (x->>'id')::bigint in (select id from hg_uno_cartes where partie = v_id and user_id <> u2)), 'l''état ne contient que ma main');
  perform t_ok(t_err(4, format('hg_uno_etat(%L)', v_code)) is not null, 'un non-joueur ne lit pas une partie privée');

  -- Mise en place contrôlée : tour à 1, dessus Rouge 5, sens horaire, places 1-2-3.
  update hg_uno_joueurs set place = right(user_id::text, 1)::int where partie = v_id;
  update hg_uno_cartes set lieu = 'pioche', user_id = null where partie = v_id and lieu in ('main', 'defausse');
  update hg_uno_cartes set lieu = 'defausse', ordre = 100 where id = (select id from hg_uno_cartes where partie = v_id and couleur = 'r' and valeur = '5' limit 1);
  update hg_uno_cartes set lieu = 'main', user_id = u1 where id in ((select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and valeur = '+4' limit 1),
    (select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and couleur = 'r' and valeur = '2' limit 1));
  update hg_uno_cartes set lieu = 'main', user_id = u2 where id in (select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and couleur = 'b' and valeur in ('1','3','4') limit 3);
  update hg_uno_cartes set lieu = 'main', user_id = u3 where id in ((select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and couleur = 'g' and valeur = '9' limit 1),
    (select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and couleur = 'r' and valeur = '5' limit 1),
    (select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and couleur = 'y' and valeur = '1' limit 1));
  perform hg_uno__compter(v_id);
  update hg_uno_parties set tour = u1, couleur = 'r', sens = 1, tour_fin = now() + interval '30 seconds', cumul = 0, defi = null, uno_attente = null, a_pioche = false where id = v_id;

  -- Interception par le joueur 3 (Rouge 5 sur Rouge 5)
  c := (select id from hg_uno_cartes where partie = v_id and user_id = u3 and couleur = 'r' and valeur = '5');
  perform t_ok(t_err(2, format('hg_uno_jouer(%L, %s)', v_code, (select id from hg_uno_cartes where partie = v_id and user_id = u2 limit 1))) like 'Ce n''est pas ton tour%', 'hors de son tour : refusé');
  perform t_call(3, format('hg_uno_jouer(%L, %s)', v_code, c));
  perform t_ok((select tour from hg_uno_parties where id = v_id) = u1, 'interception : le tour passe au joueur après l''intercepteur (1)');

  -- Joker +4 illégal (joueur 1 a un Rouge), le joueur 2 conteste avec raison
  c := (select id from hg_uno_cartes where partie = v_id and user_id = u1 and valeur = '+4');
  perform t_ok(t_err(1, format('hg_uno_jouer(%L, %s)', v_code, c)) = 'Choisis une couleur.', 'Joker sans couleur refusé');
  perform t_call(1, format('hg_uno_jouer(%L, %s, %L)', v_code, c, 'b'));
  perform t_ok((select defi->>'cible' from hg_uno_parties where id = v_id) = u2::text, 'défi ouvert pour le joueur 2');
  perform t_ok(t_err(2, format('hg_uno_piocher(%L)', v_code)) like 'Réponds d''abord%', 'il faut répondre au +4 avant de piocher');
  perform t_call(2, format('hg_uno_contester(%L, true)', v_code));
  perform t_ok((select nb_cartes from hg_uno_joueurs where partie = v_id and user_id = u1) = 5, 'contestation gagnée : le poseur pioche 4');
  perform t_ok((select tour from hg_uno_parties where id = v_id) = u2 and (select defis_gagnes from hg_uno_joueurs where partie = v_id and user_id = u2) = 1,
    'le joueur 2 garde son tour et gagne le défi');

  -- Le joueur 2 garde 2 cartes bleues, pose sans dire UNO -> contrable
  update hg_uno_cartes set user_id = null, lieu = 'pioche' where partie = v_id and user_id = u2 and id not in (select id from hg_uno_cartes where partie = v_id and user_id = u2 order by id limit 2);
  perform hg_uno__compter(v_id);
  c := (select id from hg_uno_cartes where partie = v_id and user_id = u2 order by id limit 1);
  perform t_ok(t_err(2, format('hg_uno_uno(%L)', v_code)) like 'Pose d''abord%', 'UNO refusé à 2 cartes');
  perform t_call(2, format('hg_uno_jouer(%L, %s)', v_code, c));
  perform t_ok((select uno_attente from hg_uno_parties where id = v_id) = u2, 'oubli de UNO : le joueur 2 est contrable');
  perform t_ok(t_err(3, format('hg_uno_contrer(%L, %L)', v_code, u2)) like 'Laisse-lui%', 'pas de contre pendant les 3 secondes de grâce');
  update hg_uno_parties set uno_depuis = now() - interval '5 seconds' where id = v_id;
  perform t_call(3, format('hg_uno_contrer(%L, %L)', v_code, u2));
  perform t_ok((select nb_cartes from hg_uno_joueurs where partie = v_id and user_id = u2) = 3, 'contré : 2 cartes de pénalité');
  perform t_ok(t_err(1, format('hg_uno_contrer(%L, %L)', v_code, u2)) like 'Trop tard%', 'on ne contre pas deux fois');

  -- Sortie d'un joueur en cours de partie : il garde sa place et sa main, un robot joue pour lui (migration 211, détail : t4_robot.sql)
  perform t_call(3, format('hg_uno_quitter(%L)', v_code));
  perform t_ok((select parti and not exclu from hg_uno_joueurs where partie = v_id and user_id = u3), 'le joueur 3 a quitté la table : un robot tient sa place');
  perform t_ok(t_invariants(v_id) is null, 'cartes et compteurs cohérents après la sortie');
  perform t_ok((select tour from hg_uno_parties where id = v_id) in (u1, u2)
    or (select tour_fin from hg_uno_parties where id = v_id) <= now() + interval '3 seconds', 'le tour reste à un joueur présent, ou le robot joue dans 3 secondes');

  -- Robot : tours manqués -> le jeu avance seul jusqu'à la fin
  -- Migration 191 : le paiement exige une manche finie et 3 minutes de jeu, conditions posées ici.
  update hg_uno_parties set started_at = now() - interval '10 minutes' where id = v_id;
  perform hg_uno__log(v_id, u1, 'manche', 'Manche du banc.');
  for i in 1..12 loop
    exit when (select statut from hg_uno_parties where id = v_id) <> 'en_cours';
    update hg_uno_parties set tour_fin = now() - interval '1 second' where id = v_id;
    perform hg_uno__essayer(v_id);
  end loop;
  perform t_ok((select statut from hg_uno_parties where id = v_id) = 'terminee', 'le robot a mené la partie à son terme');
  perform t_ok((select count(*) from hg_uno_joueurs where partie = v_id and gagne) = 1, 'un seul gagnant');
  perform t_ok(t_invariants(v_id) is null, 'cartes cohérentes en fin de partie');

  -- Récompenses
  perform t_ok((select count(*) from hg_wallet_log where reason = 'uno' and ref like 'uno:' || v_id || ':%') >= 1, 'Paillettes versées');
  perform t_ok((select paillettes from hg_uno_joueurs where partie = v_id and user_id = u3) = 0, 'pas de Paillettes pour celui qui est parti');

  -- Revanche
  r := t_call(1, format('hg_uno_rejouer(%L)', v_code)) #>> '{}';
  perform t_ok(r ~ '^HGUNO-' and (select etat->>'suite' from hg_uno_parties where id = v_id) = r, 'revanche créée et annoncée');

  -- Invités
  v_code := t_call(1, 'hg_uno_creer(''{"nb_places":4}''::jsonb)') #>> '{}';
  perform t_ok((hg_uno_invite('apercu', v_code) ->> 'inscrits')::int = 1, 'aperçu public de la partie');
  e := hg_uno_invite('rejoindre', v_code, null, '{"pseudo":"Mélo"}');
  perform t_ok(e->>'jeton' is not null, 'un invité rejoint avec un pseudo');
  perform hg_uno_invite('pret', v_code, e->>'jeton', '{"pret":true}');
  perform t_ok((select pret from hg_uno_joueurs where partie = t_pid(v_code) and invite), 'l''invité se déclare prêt');
  begin
    perform hg_uno_invite('etat', v_code, 'mauvais-jeton');
    perform t_ok(false, 'jeton invalide refusé');
  exception when others then perform t_ok(sqlerrm like 'Invitation expirée%', 'jeton invalide refusé'); end;
  perform set_config('request.jwt.claims', '', false);
  perform t_call(1, format('hg_uno_lancer(%L)', v_code));
  perform t_ok(jsonb_array_length(hg_uno_invite('etat', v_code, e->>'jeton') -> 'main') = 7, 'l''invité voit sa main');
  perform t_ok(t_err(2, 'hg_uno_publiques()') is null, 'liste des parties publiques');
  perform t_ok((t_call(1, 'hg_uno_stats()') ->> 'parties')::int >= 1, 'statistiques');
  perform t_ok(t_err(2, 'hg_uno_admin_reglages()') like 'Réservé%', 'réglages admin refusés à un membre');
  perform t_ok(t_err(1, 'hg_uno_admin_reglages()') is null, 'réglages admin pour l''admin');
  perform t_call(1, format('hg_uno_admin_arreter(%L)', v_code));
  perform t_ok((select statut from hg_uno_parties where id = t_pid(v_code)) = 'annulee', 'l''admin arrête une partie');
end $$;
