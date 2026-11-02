-- Mode spectateur (migration 214) : un membre regarde une partie publique en cours sans voir aucune main, discute sur le chat
-- des spectateurs (que les joueurs lisent, sans y écrire), voit la place tenue par le robot ; 20 spectateurs au plus ;
-- parties privées, parties sans spectateurs, fantômes refusés ; « Arrêter de regarder ».
do $$
declare v_code text; v_id uuid; e jsonb; m jsonb; l jsonb; c_priv text; c_ferme text; i int; v_err text; n int;
begin
  -- Partie publique de 4 joueurs (profils 1 à 4), lancée. Les profils 5 à 9 regardent.
  v_code := t_call(1, 'hg_uno_creer(''{"nb_places":4,"visibilite":"publique","nom":"Table du banc"}''::jsonb)') #>> '{}';
  v_id := t_pid(v_code);
  perform t_ok((select spectateurs from hg_uno_parties where id = v_id), 'spectateurs admis par défaut');
  for i in 2..4 loop perform t_call(i, format('hg_uno_rejoindre(%L)', v_code)); perform t_call(i, format('hg_uno_pret(%L, true)', v_code)); end loop;
  perform t_call(1, format('hg_uno_lancer(%L)', v_code));

  -- En direct : la partie apparaît chez un membre qui n'y joue pas, pas chez un joueur.
  l := t_call(6, 'hg_uno_en_direct()');
  perform t_ok(exists (select 1 from jsonb_array_elements(l) x where x->>'code' = v_code and jsonb_array_length(x->'joueurs') = 4), 'en direct : la partie et ses 4 joueurs');
  perform t_ok(not exists (select 1 from jsonb_array_elements(t_call(1, 'hg_uno_en_direct()')) x where x->>'code' = v_code), 'en direct : pas chez un joueur de la table');

  -- Le spectateur lit l'état : aucune main, le nombre de cartes de chacun, moi.spectateur, le compteur.
  e := t_call(5, format('hg_uno_etat(%L)', v_code));
  perform t_ok((e->'moi'->>'spectateur')::boolean and not (e->'moi'->>'joue')::boolean, 'état : moi.spectateur');
  perform t_ok(jsonb_array_length(e->'main') = 0, 'état : aucune main chez le spectateur');
  perform t_ok(e->'pioche_carte' = 'null'::jsonb, 'état : pas de carte piochée');
  perform t_ok((select bool_and((j->>'nb_cartes')::int = 7) from jsonb_array_elements(e->'joueurs') j), 'état : nombre de cartes de chacun');
  perform t_ok(e::text !~ '"main": \[\{', 'état : aucune carte de main dans la réponse');
  perform t_ok((e->'spectateurs'->>'admis')::boolean and (e->'spectateurs'->>'nb')::int = 1, 'état : 1 spectateur compté');
  perform t_ok(exists (select 1 from hg_spect_vus where partie = v_id and user_id = t_uid(5) and jeu = 'uno'), 'spectateur noté');
  e := t_call(1, format('hg_uno_etat(%L)', v_code));
  perform t_ok(jsonb_array_length(e->'main') = 7 and not (e->'moi'->>'spectateur')::boolean, 'état : le joueur garde sa main');
  perform t_ok((e->'spectateurs'->>'nb')::int = 1, 'état : le joueur voit le compteur');

  -- Le spectateur ne joue pas.
  v_err := t_err(5, format('hg_uno_piocher(%L)', v_code));
  perform t_ok(v_err is not null, 'spectateur : piocher refusé');

  -- Temps réel : la ligne de la partie lui est lisible (règle de lecture), les cartes jamais.
  perform t_ok((t_call(5, format('(select count(*) from hg_uno_parties where id = %L)', v_id)))::int = 1, 'règle : la partie se lit en spectateur');
  perform t_ok((t_call(5, format('(select count(*) from hg_uno_parties where id = %L)', v_id)))::int = 1, 'règle : relue');
  perform t_ok(t_err(5, format('(select count(*) from hg_uno_cartes where partie = %L)', v_id)) is not null
    or (t_call(5, format('(select count(*) from hg_uno_cartes where partie = %L)', v_id)))::int = 0, 'règle : aucune carte lisible');
  perform t_ok((t_call(7, format('(select count(*) from hg_uno_parties where id = %L)', v_id)))::int = 0, 'règle : un membre qui ne regarde pas ne lit pas la partie');

  -- Chats : le spectateur écrit au chat des spectateurs, le joueur à la table.
  perform t_call(5, format('hg_uno_message(%L, %L)', v_code, 'Belle partie !'));
  perform t_call(1, format('hg_uno_message(%L, %L)', v_code, 'À toi de jouer.'));
  perform t_ok((select spect and pseudo = 'Joueur5' and couleur = '#ABCDEF' from hg_uno_messages where partie = v_id and user_id = t_uid(5)), 'message du spectateur marqué, avec son pseudo');
  perform t_ok(not (select spect from hg_uno_messages where partie = v_id and user_id = t_uid(1)), 'message du joueur : chat de la table');
  m := t_call(5, format('hg_uno_messages(%L)', v_id));
  perform t_ok(jsonb_array_length(m) = 1 and (m->0->>'spect')::boolean and m->0->>'pseudo' = 'Joueur5', 'le spectateur ne lit que le chat des spectateurs');
  m := t_call(2, format('hg_uno_messages(%L)', v_id));
  perform t_ok(jsonb_array_length(m) = 2, 'le joueur lit les deux chats');
  perform t_ok((t_call(5, format('(select count(*) from hg_uno_messages where partie = %L)', v_id)))::int = 1, 'règle : le spectateur ne reçoit pas le chat de la table');
  perform t_ok((t_call(3, format('(select count(*) from hg_uno_messages where partie = %L)', v_id)))::int = 2, 'règle : le joueur reçoit les deux chats');
  perform t_ok(t_err(7, format('hg_uno_message(%L, %L)', v_code, 'coucou')) is not null, 'un membre qui ne regarde pas n''écrit pas');

  -- Place tenue par le robot : le spectateur la voit comme les joueurs.
  update hg_uno_joueurs set parti = true, parti_at = now(), tours_robot = 2 where partie = v_id and user_id = t_uid(2);
  e := t_call(5, format('hg_uno_etat(%L)', v_code));
  perform t_ok((select (j->>'parti')::boolean and (j->>'tours_robot')::int = 2 from jsonb_array_elements(e->'joueurs') j where j->>'user_id' = t_uid(2)::text), 'robot : place tenue visible du spectateur');
  update hg_uno_joueurs set parti = false, parti_at = null, tours_robot = 0 where partie = v_id and user_id = t_uid(2);

  -- 20 spectateurs au plus : 19 autres regardent déjà (avec le profil 5, 20).
  insert into hg_spect_vus(partie, user_id, jeu) select v_id, gen_random_uuid(), 'uno' from generate_series(1, 19);
  v_err := t_err(6, format('hg_uno_etat(%L)', v_code));
  perform t_ok(v_err like '%20 spectateurs%', 'limite : le 21e est refusé (' || coalesce(v_err, 'accepté') || ')');
  perform t_ok(t_err(5, format('hg_uno_etat(%L)', v_code)) is null, 'limite : un spectateur déjà là continue');
  delete from hg_spect_vus where partie = v_id and user_id not in (t_uid(5));
  perform t_ok(t_err(6, format('hg_uno_etat(%L)', v_code)) is null, 'limite : place libérée');
  perform t_ok((t_call(1, format('hg_uno_etat(%L)', v_code))->'spectateurs'->>'nb')::int = 2, 'compteur : 2 spectateurs');
  update hg_spect_vus set vu_at = now() - interval '2 minutes' where partie = v_id and user_id = t_uid(6);
  perform t_ok((t_call(1, format('hg_uno_etat(%L)', v_code))->'spectateurs'->>'nb')::int = 1, 'compteur : un spectateur parti depuis une minute ne compte plus');

  -- Fantôme : refusé.
  update hg_profiles set is_ghost = true where id = t_uid(8);
  perform t_ok(t_err(8, format('hg_uno_etat(%L)', v_code)) is not null, 'fantôme refusé');
  perform t_ok(jsonb_array_length(t_call(8, 'hg_uno_en_direct()')) = 0, 'fantôme : rien en direct');
  update hg_profiles set is_ghost = false where id = t_uid(8);

  -- Partie privée : refusée, absente d'En direct.
  c_priv := t_call(1, 'hg_uno_creer(''{"nb_places":2}''::jsonb)') #>> '{}';
  perform t_call(2, format('hg_uno_rejoindre(%L)', c_priv)); perform t_call(2, format('hg_uno_pret(%L, true)', c_priv));
  perform t_call(1, format('hg_uno_lancer(%L)', c_priv));
  perform t_ok(t_err(5, format('hg_uno_etat(%L)', c_priv)) like '%ne joues pas%', 'partie privée : refusée');
  perform t_ok(not exists (select 1 from jsonb_array_elements(t_call(6, 'hg_uno_en_direct()')) x where x->>'code' = c_priv), 'partie privée : pas en direct');
  perform t_ok((t_call(1, format('hg_uno_etat(%L)', c_priv))->'spectateurs'->>'admis')::boolean = false, 'partie privée : spectateurs non admis');

  -- Partie publique sans spectateurs (case décochée par l'hôte).
  c_ferme := t_call(1, 'hg_uno_creer(''{"nb_places":2,"visibilite":"publique","spectateurs":false}''::jsonb)') #>> '{}';
  perform t_ok(not (select spectateurs from hg_uno_parties where id = t_pid(c_ferme)), 'case décochée enregistrée');
  perform t_call(3, format('hg_uno_rejoindre(%L)', c_ferme)); perform t_call(3, format('hg_uno_pret(%L, true)', c_ferme));
  perform t_call(1, format('hg_uno_lancer(%L)', c_ferme));
  perform t_ok(t_err(5, format('hg_uno_etat(%L)', c_ferme)) like '%n''accepte pas de spectateurs%', 'spectateurs refusés : message clair');
  perform t_ok(not exists (select 1 from jsonb_array_elements(t_call(6, 'hg_uno_en_direct()')) x where x->>'code' = c_ferme), 'spectateurs refusés : pas en direct');

  -- Fin de partie : le spectateur déjà là voit la fin, un nouveau venu non.
  update hg_uno_parties set statut = 'terminee', ended_at = now() where id = v_id;
  e := t_call(5, format('hg_uno_etat(%L)', v_code));
  perform t_ok((e->'moi'->>'spectateur')::boolean and e->'partie'->>'statut' = 'terminee', 'fin : le spectateur voit la fin');
  perform t_ok(jsonb_array_length(e->'badges') = 0, 'fin : pas de badges pour le spectateur');
  perform t_ok(t_err(9, format('hg_uno_etat(%L)', v_code)) is not null, 'fin : un nouveau spectateur est refusé');

  -- Arrêter de regarder : la ligne disparaît, le chat des spectateurs ne se lit plus.
  perform t_call(5, format('hg_spect_arreter(%L)', v_id));
  perform t_ok(not exists (select 1 from hg_spect_vus where partie = v_id and user_id = t_uid(5)), 'arrêter : ligne effacée');
  perform t_ok(t_err(5, format('hg_uno_messages(%L)', v_id)) is not null, 'arrêter : plus de chat');

  -- Droits : outils internes fermés, fonctions du site ouvertes aux membres seulement.
  perform t_ok(not has_function_privilege('authenticated', 'public.hg_spect__vu(uuid, text, boolean)', 'execute'), 'droits : hg_spect__vu fermée');
  perform t_ok(not has_function_privilege('authenticated', 'public.hg_spect__nb(uuid)', 'execute'), 'droits : hg_spect__nb fermée');
  perform t_ok(has_function_privilege('authenticated', 'public.hg_uno_en_direct()', 'execute')
    and not has_function_privilege('anon', 'public.hg_uno_en_direct()', 'execute'), 'droits : hg_uno_en_direct');
  perform t_ok(has_function_privilege('authenticated', 'public.hg_spect_arreter(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.hg_spect_arreter(uuid)', 'execute'), 'droits : hg_spect_arreter');
  perform t_ok(not has_table_privilege('authenticated', 'public.hg_spect_vus', 'select'), 'droits : table des spectateurs fermée');
end $$;
