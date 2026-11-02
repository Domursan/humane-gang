-- Robot qui tient la place d'un joueur parti (migration 211) : départ, robot en 3 secondes, retour, 3 tours manqués, dernier humain,
-- Paillettes (place tenue par le robot, robot qui gagne, moitié des tours), statistiques, lectures (état, mes parties).
-- Mise en place commune : 4 joueurs, mains choisies, tour au joueur 1, dessus Rouge 5. Renvoie le code de la partie.
create or replace function t_table4() returns text language plpgsql as $$
declare v_code text; v_id uuid; k int;
begin
  v_code := t_call(1, 'hg_uno_creer(''{"nb_places":4}''::jsonb)') #>> '{}';
  v_id := t_pid(v_code);
  for k in 2..4 loop perform t_call(k, format('hg_uno_rejoindre(%L)', v_code)); perform t_call(k, format('hg_uno_pret(%L, true)', v_code)); end loop;
  perform t_call(1, format('hg_uno_lancer(%L)', v_code));
  update hg_uno_joueurs set place = right(user_id::text, 1)::int where partie = v_id;
  update hg_uno_cartes set lieu = 'pioche', user_id = null where partie = v_id and lieu in ('main', 'defausse');
  update hg_uno_cartes set lieu = 'defausse', ordre = 100 where id = (select id from hg_uno_cartes where partie = v_id and couleur = 'r' and valeur = '5' limit 1);
  -- Chacun : trois cartes rouges (toujours jouables sur Rouge), le joueur 4 en a une de plus.
  for k in 1..4 loop
    update hg_uno_cartes set lieu = 'main', user_id = t_uid(k) where id in (select id from hg_uno_cartes where partie = v_id and lieu = 'pioche'
      and couleur = 'r' and valeur ~ '^[0-9]$' limit 3 + (k = 4)::int);
  end loop;
  perform hg_uno__compter(v_id);
  update hg_uno_joueurs set tours = 0, tours_robot = 0, manques = 0 where partie = v_id;
  update hg_uno_parties set tour = t_uid(1), couleur = 'r', sens = 1, tour_fin = now() + interval '30 seconds', cumul = 0, defi = null, uno_attente = null,
    a_pioche = false, started_at = now() - interval '10 minutes' where id = v_id;
  perform hg_uno__log(v_id, t_uid(1), 'manche', 'Manche du banc.');   -- migration 191 : une manche finie pour le paiement
  return v_code;
end $$;

do $$
declare v_code text; v_id uuid; e jsonb; r jsonb; u1 uuid := t_uid(1); u2 uuid := t_uid(2); u3 uuid := t_uid(3); u4 uuid := t_uid(4); i int; c bigint;
begin
  delete from hg_wallet_log where reason = 'uno';
  delete from hg_user_badges where badge_code like 'uno\_%';

  -- ----- Départ : la place reste, le robot joue en 3 secondes, le journal le dit -----
  v_code := t_table4(); v_id := t_pid(v_code);
  perform t_call(1, format('hg_uno_quitter(%L)', v_code));
  perform t_ok((select parti and not exclu and parti_at is not null from hg_uno_joueurs where partie = v_id and user_id = u1), 'départ : la place est tenue par le robot, pas exclue');
  perform t_ok((select nb_cartes from hg_uno_joueurs where partie = v_id and user_id = u1) = 3, 'départ : il garde sa main');
  perform t_ok((select tour from hg_uno_parties where id = v_id) = u1 and (select tour_fin from hg_uno_parties where id = v_id) <= now() + interval '3 seconds',
    'départ pendant son tour : le robot joue dans 3 secondes');
  perform t_ok((select texte from hg_uno_coups where partie = v_id order by id desc limit 1) = 'Joueur1 quitte la table : un robot joue à sa place jusqu''à son retour.', 'départ : ligne du journal');
  perform t_ok(t_err(1, format('hg_uno_piocher(%L)', v_code)) like 'Un robot joue ta main%', 'parti : il ne peut pas jouer sans reprendre sa place');
  e := t_call(2, format('hg_uno_etat(%L)', v_code));
  perform t_ok((select (x->>'parti')::boolean from jsonb_array_elements(e->'joueurs') x where x->>'user_id' = u1::text) and (e->'moi'->>'parti')::boolean = false,
    'état : parti de chaque joueur, moi.parti');
  update hg_uno_parties set tour_fin = now() - interval '1 second' where id = v_id;
  perform t_call(2, format('hg_uno_avancer(%L)', v_code));
  perform t_ok((select nb_cartes from hg_uno_joueurs where partie = v_id and user_id = u1) = 2 and (select tour from hg_uno_parties where id = v_id) = u2,
    'le robot a posé une carte pour lui et le tour passe');
  perform t_ok((select tours_robot from hg_uno_joueurs where partie = v_id and user_id = u1) = 1 and (select manques from hg_uno_joueurs where partie = v_id and user_id = u1) = 0,
    'robot : tour compté, aucun tour manqué');
  perform t_ok(not exists (select 1 from hg_uno_coups where partie = v_id and user_id = u1 and type = 'auto'), 'place tenue par le robot : pas de ligne « Temps écoulé »');
  e := t_call(1, format('hg_uno_etat(%L)', v_code));
  perform t_ok((e->'moi'->>'parti')::boolean and jsonb_array_length(e->'main') = 2, 'parti : il lit toujours sa main');
  r := t_call(1, 'hg_uno_mes_parties()');
  perform t_ok(r->0->>'robot_depuis' is not null and (r->0->>'mon_tour')::boolean = false, 'mes parties : robot_depuis, jamais « à toi »');

  -- Tour suivant du robot : la partie tourne (2 pose, 3 pose, 4 pose, puis 1 par le robot).
  for i in 2..4 loop
    c := (select id from hg_uno_cartes where partie = v_id and user_id = t_uid(i) and couleur = 'r' limit 1);
    perform t_callu(t_uid(i), format('hg_uno_jouer(%L, %s)', v_code, c));
  end loop;
  perform t_ok((select tour from hg_uno_parties where id = v_id) = u1 and (select tour_fin from hg_uno_parties where id = v_id) <= now() + interval '3 seconds',
    'le tour revient au robot avec 3 secondes');
  update hg_uno_parties set tour_fin = now() - interval '1 second' where id = v_id;
  perform t_call(2, format('hg_uno_avancer(%L)', v_code));

  -- ----- Retour : il reprend sa main, le résumé dit ce que le robot a fait -----
  r := t_call(1, format('hg_uno_reprendre(%L)', v_code));
  perform t_ok((r->>'tours')::int = 2 and r->>'resume' ~ '^posé Rouge [0-9] et posé Rouge [0-9]$', 'retour : résumé des coups du robot (' || (r->>'resume') || ')');
  perform t_ok((select not parti and parti_at is null from hg_uno_joueurs where partie = v_id and user_id = u1), 'retour : la place est reprise');
  perform t_ok((select texte from hg_uno_coups where partie = v_id order by id desc limit 1) = 'Joueur1 reprend sa place.', 'retour : ligne du journal');
  perform t_ok(t_call(1, format('hg_uno_reprendre(%L)', v_code)) is null, 'retour : rien à reprendre une seconde fois');
  -- Le premier tour a été donné à la main par t_table4 : un seul tour reçu par hg_uno__donner_tour, deux joués par le robot.
  perform t_ok((select tours from hg_uno_joueurs where partie = v_id and user_id = u1) = 1 and (select tours_robot from hg_uno_joueurs where partie = v_id and user_id = u1) = 2,
    'tours reçus et tours du robot comptés');

  -- Retour pendant son tour : chrono entier.
  update hg_uno_parties set tour = u1, tour_fin = now() + interval '2 seconds' where id = v_id;
  -- (now() ne bouge pas dans ce bloc : le départ est daté juste après les lignes déjà écrites)
  update hg_uno_joueurs set parti = true, parti_at = now() + interval '1 millisecond' where partie = v_id and user_id = u1;
  r := t_call(1, format('hg_uno_reprendre(%L)', v_code));
  perform t_ok(r->>'resume' is null and (r->>'tours')::int = 0 and (select tour_fin from hg_uno_parties where id = v_id) > now() + interval '20 seconds',
    'retour pendant son tour : aucun coup à résumer, chrono entier');

  -- ----- 3 tours manqués : le robot prend la place et joue ce tour -----
  -- Le joueur 1 reçoit deux cartes de plus : sa main ne doit pas se vider à ce tour.
  update hg_uno_cartes set lieu = 'main', user_id = u1 where id in (select id from hg_uno_cartes where partie = v_id and lieu = 'pioche' and couleur = 'r' and valeur ~ '^[0-9]$' limit 2);
  perform hg_uno__compter(v_id);
  update hg_uno_joueurs set manques = 2 where partie = v_id and user_id = u1;
  update hg_uno_parties set tour_fin = now() - interval '1 second' where id = v_id;
  perform t_call(2, format('hg_uno_avancer(%L)', v_code));
  perform t_ok((select parti and not exclu from hg_uno_joueurs where partie = v_id and user_id = u1), '3 tours manqués : le robot tient la place, sans exclusion');
  perform t_ok(exists (select 1 from hg_uno_coups where partie = v_id and texte = 'Joueur1 a manqué 3 tours : un robot joue sa main jusqu''à son retour.'), '3 tours manqués : ligne du journal');
  perform t_ok((select tour from hg_uno_parties where id = v_id) = u2, '3 tours manqués : le robot a joué le tour tout de suite');
  perform t_ok(t_invariants(v_id) is null, 'cartes et compteurs cohérents');

  -- ----- Dernier humain : la partie se termine, il gagne, la place tenue par le robot ne reçoit rien -----
  perform t_call(2, format('hg_uno_quitter(%L)', v_code));
  perform t_ok((select statut from hg_uno_parties where id = v_id) = 'en_cours', 'deux humains restent : la partie continue');
  perform t_call(3, format('hg_uno_quitter(%L)', v_code));
  perform t_ok((select statut from hg_uno_parties where id = v_id) = 'terminee' and (select vainqueur from hg_uno_parties where id = v_id) = u4, 'un seul humain : la partie se termine, il gagne');
  perform t_ok((select count(*) from hg_uno_joueurs where partie = v_id and gagne) = 1 and (select gagne from hg_uno_joueurs where partie = v_id and user_id = u4),
    'un seul gagnant, le joueur présent');
  perform t_ok((select paillettes from hg_uno_joueurs where partie = v_id and user_id = u4) > 50, 'le dernier humain reçoit participation et victoire');
  perform t_ok((select sum(paillettes) from hg_uno_joueurs where partie = v_id and user_id in (u1, u2, u3)) = 0
    and not exists (select 1 from hg_wallet_log where reason = 'uno' and user_id in (u1, u2, u3)), 'places tenues par le robot : aucune Paillette');
  perform t_ok(not exists (select 1 from hg_user_badges where user_id in (u1, u2, u3) and badge_code like 'uno\_%'), 'places tenues par le robot : aucun badge');
  perform t_ok((t_call(1, 'hg_uno_stats()')->>'parties')::int = 0 and (t_call(4, 'hg_uno_stats()')->>'parties')::int = 1, 'statistiques : la partie ne compte pas pour une place tenue par le robot');
  perform t_ok(t_err(1, format('hg_uno_reprendre(%L)', v_code)) is null and t_call(1, format('hg_uno_reprendre(%L)', v_code)) is null, 'partie finie : plus rien à reprendre');

  -- ----- Le robot vide la main : personne ne gagne, les autres gardent la participation -----
  v_code := t_table4(); v_id := t_pid(v_code);
  update hg_uno_cartes set lieu = 'pioche', user_id = null where partie = v_id and user_id = u1 and id <> (select min(id) from hg_uno_cartes where partie = v_id and user_id = u1);
  perform hg_uno__compter(v_id);
  perform t_call(1, format('hg_uno_quitter(%L)', v_code));
  update hg_uno_parties set tour_fin = now() - interval '1 second' where id = v_id;
  perform t_call(2, format('hg_uno_avancer(%L)', v_code));
  perform t_ok((select statut from hg_uno_parties where id = v_id) = 'terminee' and (select vainqueur from hg_uno_parties where id = v_id) = u1, 'le robot a vidé la main : la partie est finie');
  perform t_ok((select count(*) from hg_uno_joueurs where partie = v_id and gagne) = 0 and (select rang from hg_uno_joueurs where partie = v_id and user_id = u1) = 1,
    'robot gagnant : la victoire n''est donnée à personne');
  perform t_ok((select texte from hg_uno_coups where partie = v_id and type = 'fin') = 'Le robot a vidé la main de Joueur1 : personne ne gagne.', 'robot gagnant : ligne du journal');
  perform t_ok((select paillettes from hg_uno_joueurs where partie = v_id and user_id = u1) = 0
    and (select min(paillettes) = 50 and max(paillettes) = 50 from hg_uno_joueurs where partie = v_id and user_id in (u2, u3, u4)),
    'robot gagnant : rien pour sa place, participation pour les autres');
  perform t_ok(not exists (select 1 from hg_user_badges where user_id = u1 and badge_code = 'uno_premiere_victoire'), 'robot gagnant : pas de badge de victoire');

  -- ----- Revenu, mais le robot a joué plus de la moitié de ses tours : participation seulement -----
  v_code := t_table4(); v_id := t_pid(v_code);
  update hg_uno_cartes set lieu = 'pioche', user_id = null where partie = v_id and user_id = u1 and id <> (select min(id) from hg_uno_cartes where partie = v_id and user_id = u1);
  perform hg_uno__compter(v_id);
  update hg_uno_joueurs set tours = 4, tours_robot = 3 where partie = v_id and user_id = u1;
  c := (select id from hg_uno_cartes where partie = v_id and user_id = u1);
  perform t_call(1, format('hg_uno_uno(%L)', v_code));
  perform t_call(1, format('hg_uno_jouer(%L, %s)', v_code, c));
  perform t_ok((select statut from hg_uno_parties where id = v_id) = 'terminee' and (select gagne from hg_uno_joueurs where partie = v_id and user_id = u1), 'il gagne la manche lui-même');
  perform t_ok((select paillettes from hg_uno_joueurs where partie = v_id and user_id = u1) = 50, 'moins de la moitié de ses tours : participation seulement');
  perform t_ok(not exists (select 1 from hg_user_badges where user_id = u1 and badge_code = 'uno_premiere_victoire'), 'moins de la moitié : pas de badge');

  -- La moitié exactement : Paillettes normales et badge.
  delete from hg_wallet_log where reason = 'uno';
  v_code := t_table4(); v_id := t_pid(v_code);
  update hg_uno_cartes set lieu = 'pioche', user_id = null where partie = v_id and user_id = u1 and id <> (select min(id) from hg_uno_cartes where partie = v_id and user_id = u1);
  perform hg_uno__compter(v_id);
  update hg_uno_joueurs set tours = 4, tours_robot = 2 where partie = v_id and user_id = u1;
  c := (select id from hg_uno_cartes where partie = v_id and user_id = u1);
  perform t_call(1, format('hg_uno_uno(%L)', v_code));
  perform t_call(1, format('hg_uno_jouer(%L, %s)', v_code, c));
  perform t_ok((select paillettes from hg_uno_joueurs where partie = v_id and user_id = u1) > 150, 'la moitié de ses tours : Paillettes normales');
  perform t_ok(exists (select 1 from hg_user_badges where user_id = u1 and badge_code = 'uno_premiere_victoire'), 'la moitié de ses tours : badge');

  -- ----- Invité parti : même traitement, et il peut reprendre sa place depuis sa table -----
  v_code := t_call(1, 'hg_uno_creer(''{"nb_places":3}''::jsonb)') #>> '{}';
  perform t_call(2, format('hg_uno_rejoindre(%L)', v_code)); perform t_call(2, format('hg_uno_pret(%L, true)', v_code));
  e := hg_uno_invite('rejoindre', v_code, null, '{"pseudo":"Mélo"}');
  perform hg_uno_invite('pret', v_code, e->>'jeton', '{"pret":true}');
  perform set_config('request.jwt.claims', '', false);
  perform t_call(1, format('hg_uno_lancer(%L)', v_code));
  v_id := t_pid(v_code);
  perform hg_uno_invite('quitter', v_code, e->>'jeton');
  perform set_config('request.jwt.claims', '', false);
  perform t_ok((select parti from hg_uno_joueurs where partie = v_id and invite), 'invité parti : le robot tient sa place');
  r := hg_uno_invite('reprendre', v_code, e->>'jeton');
  perform set_config('request.jwt.claims', '', false);
  perform t_ok(r is not null and (select not parti from hg_uno_joueurs where partie = v_id and invite), 'invité : reprend sa place par hg_uno_invite');
end $$;
