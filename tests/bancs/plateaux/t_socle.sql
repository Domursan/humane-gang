-- Tests du socle des jeux de plateau (125) : salle, invités, chat, admin, accès.
\set ON_ERROR_STOP 1
do $$
declare c text; pid uuid; r jsonb; v_jeton text; v_inv uuid; v text; n bigint;
begin
  c := t_call(1, $q$hg_plat_creer('{"jeu":"cluedo","nb_places":4,"visibilite":"publique","nom":"Soirée"}'::jsonb)$q$) #>> '{}';
  pid := t_pid(c);
  perform t_ok(jsonb_array_length(t_call(2, $q$hg_plat_publiques('cluedo')$q$)) = 1, 'partie publique listée');
  perform t_ok(t_err(2, format('hg_plat_lancer(%L)', c)) like '%hôte%', 'seul l''hôte lance');
  perform t_call(2, format('hg_plat_rejoindre(%L)', c));
  perform t_ok(t_err(1, format('hg_plat_lancer(%L)', c)) like '%au moins 3%', 'minimum de joueurs');
  -- Invité
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  execute 'set local role anon';
  r := hg_plat_invite('apercu', c, null, '{}');
  perform t_ok(r->>'nom' = 'Soirée' and r->>'jeu' = 'cluedo', 'aperçu invité');
  r := hg_plat_invite('rejoindre', c, null, '{"pseudo":"Zoé"}');
  v_jeton := r->>'jeton'; v_inv := (r->>'user_id')::uuid;
  perform hg_plat_invite('pret', c, v_jeton, '{"pret":true}');
  perform t_ok((hg_plat_invite('contenus', c, null, '{}'))->'suspects'->0->>'nom' = 'Colonel Moutarde', 'contenus lisibles en invité');
  begin perform hg_plat_invite('etat', c, 'faux', '{}'); v := null; exception when others then v := sqlerrm; end;
  perform t_ok(v like '%Invitation expirée%', 'jeton faux refusé');
  execute 'reset role';
  perform t_ok(t_err(1, format('hg_plat_lancer(%L)', c)) like '%prêts%', 'tous prêts requis');
  perform t_call(2, format('hg_plat_pret(%L, true)', c));
  perform t_call(1, format('hg_plat_lancer(%L)', c));
  perform t_ok((select statut from hg_plat_parties where id = pid) = 'en_cours', 'partie lancée avec un invité');
  -- Chat
  perform t_call(2, format('hg_plat_message(%L, %L)', c, 'Bonsoir'));
  perform t_ok(jsonb_array_length(t_call(1, format('hg_plat_messages(%L)', pid))) = 1, 'chat');
  perform t_ok(t_err(3, format('hg_plat_messages(%L)', pid)) is not null, 'chat fermé aux autres');
  -- Quitter en cours : le jeu joue pour lui
  perform t_call(2, format('hg_plat_quitter(%L)', c));
  perform t_ok((select parti and absent from hg_plat_joueurs where partie = pid and user_id = t_uid(2)), 'quitter en cours : joué par le jeu');
  -- Migration 198 : quitter est définitif, agir ne ramène plus le joueur
  perform t_ok(t_err(2, format('hg_plat_agir(%L, %L)', c, 'rien')) like '%quitté cette partie%', 'quitter en cours : plus de retour en agissant');
  perform t_ok((select parti and absent from hg_plat_joueurs where partie = pid and user_id = t_uid(2)), 'quitter en cours : toujours parti après le refus');
  -- Migration 198 : un joueur déjà parti ne repart pas (ni journal ni signe de vie)
  n := (select count(*) from hg_plat_coups where partie = pid);
  perform t_call(2, format('hg_plat_quitter(%L)', c));
  perform t_ok((select count(*) from hg_plat_coups where partie = pid) = n, 'quitter deux fois : pas de ligne de journal');
  -- Admin
  perform t_ok(t_err(2, $q$hg_plat_admin_reglages('cluedo')$q$) like '%administrateurs%', 'réglages réservés aux admins');
  perform t_ok(jsonb_array_length(t_call(1, $q$hg_plat_admin_reglages('cluedo')$q$)->'contenus') = 6, 'admin : 6 contenus');
  perform t_call(1, $q$hg_plat_admin_contenu('cluedo', 'victime', '"Monsieur Personne"'::jsonb)$q$);
  perform t_ok(hg_plat__c('cluedo', 'victime') #>> '{}' = 'Monsieur Personne', 'admin : texte modifié');
  perform t_ok(t_err(1, $q$hg_plat_admin_contenu('cluedo', 'armes', '[{"id":"corde","nom":"Fil"}]'::jsonb)$q$) like '%garder ses 6%', 'admin : liste de même taille');
  perform t_call(1, format('hg_plat_admin_contenu(%L, %L, %L::jsonb)', 'cluedo', 'suspects', (select jsonb_agg(case when x->>'id'='rose' then x || '{"nom":"Mlle Rosa","couleur":"#FF0000"}' else x end) from jsonb_array_elements(hg_plat__c('cluedo','suspects')) x)::text));
  perform t_ok(hg_plat__n('cluedo', 'suspects', 'rose') = 'Mlle Rosa', 'admin : nom d''un suspect modifié');
  perform t_ok(t_err(1, format('hg_plat_admin_contenu(%L, %L, %L::jsonb)', 'cluedo', 'suspects', (select jsonb_agg(x || '{"couleur":"rouge"}') from jsonb_array_elements(hg_plat__c('cluedo','suspects')) x)::text)) like '%Couleur invalide%', 'admin : couleur vérifiée');
  perform t_call(1, $q$hg_plat_admin_contenu('cluedo', 'suspects', null)$q$);
  perform t_call(1, $q$hg_plat_admin_contenu('cluedo', 'victime', null)$q$);
  perform t_ok(hg_plat__n('cluedo', 'suspects', 'rose') = 'Mademoiselle Rose', 'admin : rétablir');
  perform t_call(1, format('hg_plat_admin_arreter(%L)', c));
  perform t_ok((select statut from hg_plat_parties where id = pid) = 'annulee', 'admin : arrêter');
  -- Accès : page en mode admin
  update hg_pages set mode = 'admin' where slug = 'cluedo';
  perform t_ok(t_err(3, $q$hg_plat_creer('{"jeu":"cluedo"}'::jsonb)$q$) like '%Accès réservé%', 'page admin : membre refusé');
  perform t_ok(t_err(1, $q$hg_plat_creer('{"jeu":"cluedo"}'::jsonb)$q$) is null, 'page admin : admin accepté');
  update hg_pages set mode = 'membres' where slug = 'cluedo';
  -- Droits
  perform t_ok(not exists (select 1 from pg_proc p where p.proname like 'hg\_plat\_\_%' and has_function_privilege('authenticated', p.oid, 'execute')), 'fonctions internes fermées');
  perform t_ok((select count(*) from pg_proc p where p.proname like 'hg\_plat%' and has_function_privilege('anon', p.oid, 'execute')) = 2, 'anon : 2 fonctions seulement');
end $$;
