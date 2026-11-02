-- Mode spectateur aux plateaux (migration 214) : Blackjack, Monopoly, Destins se regardent ; la vue du jeu du spectateur est
-- celle de personne (aucune part privée), le journal sans ligne privée ; chat des spectateurs ; jeux fermés aux spectateurs.
do $$
declare c text; pid uuid; e jsonb; l jsonb; m jsonb; i int; v_err text; c_cl text;
begin
  -- Monopoly public à 2 (profils 1 et 2), lancé ; le profil 5 regarde.
  c := t_call(1, format('hg_plat_creer(%L::jsonb)', '{"jeu":"monopoly","nb_places":2,"visibilite":"publique","nom":"Banc spectateurs"}')) #>> '{}';
  pid := t_pid(c);
  perform t_ok((select spectateurs from hg_plat_parties where id = pid), 'spectateurs admis par défaut');
  perform t_call(2, format('hg_plat_rejoindre(%L)', c)); perform t_call(2, format('hg_plat_pret(%L, true)', c));
  perform t_call(1, format('hg_plat_lancer(%L)', c));
  l := t_call(6, format('hg_plat_en_direct(%L)', 'monopoly'));
  perform t_ok(exists (select 1 from jsonb_array_elements(l) x where x->>'code' = c and jsonb_array_length(x->'joueurs') = 2), 'en direct : la partie et ses joueurs');
  perform t_ok(not exists (select 1 from jsonb_array_elements(t_call(1, format('hg_plat_en_direct(%L)', 'monopoly'))) x where x->>'code' = c), 'en direct : pas chez un joueur');
  perform t_ok(exists (select 1 from jsonb_array_elements(t_call(6, 'hg_jeux_en_direct()')) x where x->>'code' = c and x->>'jeu' = 'monopoly'), 'page Jeux : la partie, avec son jeu');
  e := t_etat(t_uid(5), c);
  perform t_ok((e->'moi'->>'spectateur')::boolean and not (e->'moi'->>'joue')::boolean, 'état : moi.spectateur');
  perform t_ok(e->'jeu' = hg_plat__monopoly_vue(pid, null), 'état : vue du jeu sans part privée');
  perform t_ok(not exists (select 1 from jsonb_array_elements(e->'journal') x where (x->>'prive')::boolean), 'état : aucune ligne privée du journal');
  perform t_ok((e->'spectateurs'->>'nb')::int = 1, 'état : compteur');
  perform t_ok((t_etat(t_uid(1), c)->'spectateurs'->>'nb')::int = 1, 'état : le joueur voit le compteur');
  perform t_ok(t_agir_err(t_uid(5), c, 'lancer_des') is not null, 'spectateur : ne joue pas');
  perform t_ok((t_call(5, format('(select count(*) from hg_plat_parties where id = %L)', pid)))::int = 1, 'règle : la partie se lit en spectateur');
  perform t_ok((t_call(7, format('(select count(*) from hg_plat_parties where id = %L)', pid)))::int = 0, 'règle : pas pour un autre membre');
  perform t_ok(t_err(5, format('(select count(*) from hg_plat_parties where id = %L and etat is not null)', pid)) is not null, 'règle : l''état brut reste fermé');

  -- Chats séparés.
  perform t_call(5, format('hg_plat_message(%L, %L)', c, 'Bonne chance !'));
  perform t_call(1, format('hg_plat_message(%L, %L)', c, 'Je lance.'));
  m := t_call(5, format('hg_plat_messages(%L)', pid));
  perform t_ok(jsonb_array_length(m) = 1 and (m->0->>'spect')::boolean and m->0->>'pseudo' = 'Joueur5', 'le spectateur ne lit que son chat');
  perform t_ok(jsonb_array_length(t_call(2, format('hg_plat_messages(%L)', pid))) = 2, 'le joueur lit les deux chats');
  perform t_ok((t_call(5, format('(select count(*) from hg_plat_messages where partie = %L)', pid)))::int = 1, 'règle : chat de la table fermé au spectateur');

  -- Arrêter de regarder.
  perform t_call(5, format('hg_spect_arreter(%L)', pid));
  perform t_ok(t_err(5, format('hg_plat_messages(%L)', pid)) is not null, 'arrêter : plus de chat');

  -- Blackjack : la carte cachée de la banque reste « ?? » chez le spectateur.
  c := t_call(1, format('hg_plat_creer(%L::jsonb)', '{"jeu":"blackjack","nb_places":2,"visibilite":"publique"}')) #>> '{}';
  pid := t_pid(c);
  perform t_call(2, format('hg_plat_rejoindre(%L)', c)); perform t_call(2, format('hg_plat_pret(%L, true)', c));
  perform t_call(1, format('hg_plat_lancer(%L)', c));
  update hg_plat_parties set etat = jsonb_set(jsonb_set(etat, '{phase}', '"jeu"'), '{banque}', '["AS", "KH"]') where id = pid;
  e := t_etat(t_uid(5), c);
  perform t_ok(e->'jeu'->'banque' = '["AS", "??"]'::jsonb and e->'jeu'->'banque_total' = 'null'::jsonb, 'blackjack : carte cachée de la banque');
  perform t_ok(e::text !~ 'KH', 'blackjack : la carte cachée ne part pas');

  -- Destins : se regarde aussi.
  c := t_call(1, format('hg_plat_creer(%L::jsonb)', '{"jeu":"destins","nb_places":2,"visibilite":"publique"}')) #>> '{}';
  perform t_call(2, format('hg_plat_rejoindre(%L)', c)); perform t_call(2, format('hg_plat_pret(%L, true)', c));
  perform t_call(1, format('hg_plat_lancer(%L)', c));
  perform t_ok((t_etat(t_uid(6), c)->'moi'->>'spectateur')::boolean, 'destins : se regarde');

  -- Jeux fermés aux spectateurs : Cluedo public en cours.
  c_cl := t_partie('cluedo', 3);
  update hg_plat_parties set visibilite = 'publique' where id = t_pid(c_cl);
  perform t_ok(t_erru(t_uid(6), format('hg_plat_etat(%L)', c_cl)) like '%ne joues pas%', 'cluedo : pas de spectateur');
  perform t_ok(jsonb_array_length(t_call(6, format('hg_plat_en_direct(%L)', 'cluedo'))) = 0, 'cluedo : rien en direct');
  perform t_ok(not exists (select 1 from jsonb_array_elements(t_call(6, 'hg_jeux_en_direct()')) x where x->>'jeu' = 'cluedo'), 'page Jeux : pas de Cluedo');

  -- Case décochée.
  c := t_call(1, format('hg_plat_creer(%L::jsonb)', '{"jeu":"destins","nb_places":2,"visibilite":"publique","spectateurs":false}')) #>> '{}';
  perform t_call(2, format('hg_plat_rejoindre(%L)', c)); perform t_call(2, format('hg_plat_pret(%L, true)', c));
  perform t_call(1, format('hg_plat_lancer(%L)', c));
  perform t_ok(t_erru(t_uid(6), format('hg_plat_etat(%L)', c)) like '%n''accepte pas de spectateurs%', 'case décochée : refusé');
end $$;
