-- Challenges de la semaine (migration 218) : phases, quota, type refusé, participation hors délai, vote réservé aux
-- participants et jamais pour soi, changement de voix, ex æquo payé une fois à chacun (passage relancé sans double
-- paiement), aucune voix puis choix de l'admin, retrait admin avec motif, anonymat pendant le vote (ni auteur ni voix dans
-- hg_wch_page, chemins sans identifiant de membre), annulation, droits directs, stockage, export, purge, compte supprimé.
-- Demande les migrations 192, 216 et 218 : rebuild.sh s'arrête aujourd'hui à la 166. Sur un poste sans PostgreSQL, le banc
-- PGlite de la session charge un socle réduit (stockage imité : storage.buckets, storage.objects avec RLS), ces migrations et
-- ce fichier. Les envois de fichiers sont écrits directement dans storage.objects (comme le ferait l'API de stockage :
-- owner_id et metadata posés), sauf les essais de la politique d'insertion, faits en tant que membre.
-- Le temps ne passe pas dans une transaction : t7_phase déplace les dates d'un challenge pour le mettre dans une phase.
-- Crée les membres 6 (admin) et 7.

/* Un fichier envoyé par u dans le dossier du challenge ch (nom aléatoire, extension et type donnés). Rend son nom. */
create or replace function t7_obj(u uuid, ch uuid, ext text, mime text) returns text language plpgsql as $$
declare v text := ch::text || '/' || replace(gen_random_uuid()::text, '-', '') || '.' || ext;
begin
  insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
    values ('hg-challenges', v, u, u::text, jsonb_build_object('mimetype', mime, 'size', 1000));
  return v;
end $$;

/* Participe en tant que u : rend l'identifiant de la participation, ou « ERR : message ». */
create or replace function t7_enter(u uuid, ch uuid, p text, mime text, body text default null) returns text language plpgsql as $$
begin
  return t_call(u, format('hg_wch_enter(%L::uuid, %L, %L, %L, %s, %L, %L)', ch, p, 'photo de test', mime, 1000, body, 'légende')) #>> '{}';
exception when others then return 'ERR : ' || sqlerrm;
end $$;

/* Met le challenge ch dans une phase en déplaçant ses dates (superutilisateur : le garde-fou du panel ne s'applique pas). */
create or replace function t7_phase(ch uuid, ph text) returns void language plpgsql as $$
declare d int := (select vote_days from hg_weekly_challenges where id = ch);
begin
  update hg_weekly_challenges set
    starts_at = case ph when 'a_venir' then now() + interval '1 day' when 'participation' then now() - interval '1 hour'
                        when 'vote' then now() - interval '3 days' else now() - make_interval(days => d + 5) end,
    ends_at = case ph when 'a_venir' then now() + interval '2 days' when 'participation' then now() + interval '1 day'
                      when 'vote' then now() - interval '1 hour' else now() - make_interval(days => d) - interval '1 hour' end
   where id = ch;
end $$;

create or replace function t7_ph(ch uuid) returns text language sql stable as $$
  select hg_wch_phase(c) from hg_weekly_challenges c where c.id = ch $$;

create or replace function t7_nb_notifs(u uuid, motif text default '%') returns bigint language sql stable as $$
  select count(*) from hg_site_notifs where user_id = u and cat = 'challenges' and (titre || ' ' || coalesce(texte, '')) like motif $$;

do $$
declare
  u2 uuid := t_uid(2); u3 uuid := t_uid(3); u4 uuid := t_uid(4); u5 uuid := t_uid(5); u6 uuid := t_uid(6); u7 uuid := t_uid(7);
  a uuid; b uuid; c uuid; d uuid; e uuid; z uuid;
  o text; o2 text; o3 text; o4 text; o7 text; opdf text; obad text;
  e2 text; e2b text; e3 text; e4 text; e7 text; eb2 text; eb3 text; ec text; ed text;
  r jsonb; msg text; n bigint; pl2 int; pl3 int; pl4 int; pl7 int;
begin
  insert into auth.users (id, email, created_at) values (u6, 'membre6@banc.invalid', now() - interval '30 days'),
    (u7, 'membre7@banc.invalid', now() - interval '30 days') on conflict (id) do nothing;
  insert into hg_profiles (id, pseudo, is_admin, joined_on) values (u6, 'Admin6', true, current_date - 30), (u7, 'Banc7', false, current_date - 30)
    on conflict (id) do nothing;
  insert into hg_wallets (user_id, paillettes) values (u6, 2000), (u7, 2000) on conflict (user_id) do nothing;

  -- ===== Mise en place : page, bucket, création par l'admin =====
  perform t_ok(exists (select 1 from hg_pages where slug = 'challenge' and mode = 'membres' and in_nav), 'page « challenge » ouverte aux membres et dans le menu');
  perform t_ok((select not public and file_size_limit = 26214400 and 'video/quicktime' = any (allowed_mime_types)
                  and not ('image/svg+xml' = any (allowed_mime_types)) and not ('text/html' = any (allowed_mime_types))
                from storage.buckets where id = 'hg-challenges'), 'bucket privé, 25 Mo, ni SVG ni HTML');
  msg := t_exec(u2, format('insert into hg_weekly_challenges (title, starts_at, ends_at) values (%L, now(), now() + interval ''1 day'')', 'Pirate'));
  perform t_ok(msg like 'ERR%', 'un membre ne crée pas de challenge (' || msg || ')');
  msg := t_exec(u6, format('insert into hg_weekly_challenges (title, how_to, answer_type, max_entries, starts_at, ends_at, vote_days, reward_paillettes, reward_text, closed_at)
    values (%L, %L, %L, 2, now() + interval ''1 day'', now() + interval ''2 days'', 2, 500, %L, now())', 'Photo A', 'Une photo du ciel', 'image', 'Un mug'));
  perform t_ok(msg = '1 ligne(s)', 'l’admin crée un challenge en direct (' || msg || ')');
  select id into a from hg_weekly_challenges where title = 'Photo A';
  perform t_ok((select vote_ends_at = ends_at + interval '2 days' and closed_at is null and created_by = u6 from hg_weekly_challenges where id = a),
    'vote_ends_at posé par le déclencheur, closed_at écrit en direct ignoré, created_by = l’admin');
  perform t_ok(t_count(u2, 'select count(*) from hg_weekly_challenges') = 0, 'un membre ne lit pas la table des challenges');

  -- ===== Phase à venir =====
  perform t_ok(t7_ph(a) = 'a_venir', 'phase a_venir');
  o := t7_obj(u2, a, 'webp', 'image/webp');
  msg := t7_enter(u2, a, o, 'image/webp');
  perform t_ok(msg like 'ERR%pas encore ouverte%', 'participation refusée avant l’ouverture (' || msg || ')');
  r := t_call(u2, 'hg_wch_page()');
  perform t_ok(r->'current'->>'id' = a::text and r->'current'->>'phase' = 'a_venir', 'hg_wch_page montre le prochain challenge à venir');

  -- ===== Participation =====
  perform t7_phase(a, 'participation');
  perform t_ok(t7_ph(a) = 'participation', 'phase participation');
  -- Politique d'insertion du bucket, en tant que membre.
  msg := t_exec(u3, format('insert into storage.objects (bucket_id, name, owner_id, metadata) values (''hg-challenges'', %L, %L, ''{}'')',
    a::text || '/0123456789abcdef.png', u3::text));
  perform t_ok(msg = '1 ligne(s)', 'un membre dépose un fichier dans le dossier d’un challenge ouvert (' || msg || ')');
  msg := t_exec(u3, format('insert into storage.objects (bucket_id, name, owner_id, metadata) values (''hg-challenges'', %L, %L, ''{}'')',
    u3::text || '/' || a::text || '/0123456789abcdef.png', u3::text));
  perform t_ok(msg like 'ERR%', 'dépôt refusé hors du format <challenge>/<nom>.<ext> (' || msg || ')');
  msg := t_exec(u3, format('insert into storage.objects (bucket_id, name, owner_id, metadata) values (''hg-challenges'', %L, %L, ''{}'')',
    a::text || '/0123456789abcdef.svg', u3::text));
  perform t_ok(msg like 'ERR%', 'dépôt d’un SVG refusé (' || msg || ')');
  msg := t_exec(u3, format('insert into storage.objects (bucket_id, name, owner_id, metadata) values (''hg-challenges'', %L, %L, ''{}'')',
    a::text || '/fedcba9876543210.png', u2::text));
  perform t_ok(msg like 'ERR%', 'dépôt au nom d’un autre membre refusé (' || msg || ')');

  e2 := t7_enter(u2, a, o, 'image/webp');
  perform t_ok(e2 ~ '^[0-9a-f-]{36}$', 'participation avec un fichier (' || e2 || ')');
  o2 := t7_obj(u2, a, 'jpg', 'image/jpeg');
  e2b := t7_enter(u2, a, o2, 'image/jpeg');
  perform t_ok(e2b ~ '^[0-9a-f-]{36}$', 'deuxième participation (quota 2)');
  msg := t7_enter(u2, a, t7_obj(u2, a, 'png', 'image/png'), 'image/png');
  perform t_ok(msg like 'ERR%maximum%', 'troisième participation refusée : quota (' || msg || ')');
  opdf := t7_obj(u3, a, 'pdf', 'application/pdf');
  msg := t7_enter(u3, a, opdf, 'image/png');
  perform t_ok(msg like 'ERR%type de fichier%', 'type refusé : PDF pour un challenge image, même annoncé image/png (' || msg || ')');
  msg := t7_enter(u3, a, o2, 'image/jpeg');
  perform t_ok(msg like 'ERR%introuvable%', 'le fichier d’un autre membre est refusé (' || msg || ')');
  msg := t7_enter(u3, a, null, null, 'un texte');
  perform t_ok(msg like 'ERR%Ajoute un fichier%', 'challenge image : un texte seul est refusé (' || msg || ')');
  o3 := t7_obj(u3, a, 'png', 'image/png'); e3 := t7_enter(u3, a, o3, 'image/png');
  o4 := t7_obj(u4, a, 'gif', 'image/gif'); e4 := t7_enter(u4, a, o4, 'image/gif');
  o7 := t7_obj(u7, a, 'webp', 'image/webp'); e7 := t7_enter(u7, a, o7, 'image/webp');
  perform t_ok(e3 ~ '^[0-9a-f-]{36}$' and e4 ~ '^[0-9a-f-]{36}$' and e7 ~ '^[0-9a-f-]{36}$', 'participations de 3, 4 et 7');
  r := t_call(u2, 'hg_wch_page()');
  perform t_ok(jsonb_array_length(r->'current'->'entries') = 0 and jsonb_array_length(r->'current'->'my_entries') = 2
    and (r->'current'->>'participants_count')::int = 4 and (r->'current'->>'entries_count')::int = 5,
    'pendant la participation : celles des autres cachées, les miennes visibles, compteurs justes');
  perform t_ok(t_count(u5, format('select count(*) from storage.objects where name = %L', o3)) = 0
    and t_count(u3, format('select count(*) from storage.objects where name = %L', o3)) = 1,
    'stockage : le fichier n’est lu que par son propriétaire pendant la participation');
  msg := t_call(u2, format('hg_wch_withdraw(%L::uuid)', e2b)) #>> '{}';
  perform t_ok(msg = o2 and not exists (select 1 from hg_weekly_challenge_entries where id = e2b::uuid), 'retrait de sa participation : chemin rendu');
  msg := t_err(u3, format('hg_wch_withdraw(%L::uuid)', e2));
  perform t_ok(msg like '%introuvable%', 'on ne retire pas la participation d’un autre (' || coalesce(msg, 'accepté') || ')');
  msg := t_exec(u6, format('update hg_weekly_challenges set answer_type = %L where id = %L', 'video', a));
  perform t_ok(msg like 'ERR%type de réponse%', 'le type ne change plus après des participations (' || msg || ')');

  -- ===== Vote =====
  perform t7_phase(a, 'vote');
  perform t_ok(t7_ph(a) = 'vote', 'phase vote');
  msg := t7_enter(u5, a, t7_obj(u5, a, 'png', 'image/png'), 'image/png');
  perform t_ok(msg like 'ERR%fermée%', 'participation hors délai refusée (' || msg || ')');
  msg := t_err(u2, format('hg_wch_withdraw(%L::uuid)', e2));
  perform t_ok(msg like '%fermée%', 'plus de retrait pendant le vote (' || coalesce(msg, 'accepté') || ')');
  perform hg_wch_tick();
  perform t_ok((select vote_notified_at is not null from hg_weekly_challenges where id = a)
    and t7_nb_notifs(u2, '%vote est ouvert%') = 1 and t7_nb_notifs(u7, '%vote est ouvert%') = 1 and t7_nb_notifs(u5) = 0,
    'ouverture du vote annoncée aux participants seulement');
  perform hg_wch_tick();
  perform t_ok(t7_nb_notifs(u2, '%vote est ouvert%') = 1, 'ouverture annoncée une seule fois');

  msg := t_err(u5, format('hg_wch_vote(%L::uuid)', e3));
  perform t_ok(msg like '%participants votent%', 'vote d’un non-participant refusé (' || coalesce(msg, 'accepté') || ')');
  msg := t_err(u2, format('hg_wch_vote(%L::uuid)', e2));
  perform t_ok(msg like '%propre participation%', 'vote pour soi refusé (' || coalesce(msg, 'accepté') || ')');
  perform t_do(u2, format('hg_wch_vote(%L::uuid)', e4));
  perform t_do(u2, format('hg_wch_vote(%L::uuid)', e3));
  perform t_ok((select count(*) from hg_weekly_challenge_votes where challenge_id = a and voter_id = u2) = 1
    and (select entry_id::text from hg_weekly_challenge_votes where challenge_id = a and voter_id = u2) = e3, 'changement de voix : une seule voix, la dernière');
  perform t_do(u3, format('hg_wch_vote(%L::uuid)', e2));
  perform t_do(u4, format('hg_wch_vote(%L::uuid)', e3));
  perform t_do(u7, format('hg_wch_vote(%L::uuid)', e2));

  r := t_call(u5, 'hg_wch_page()');
  perform t_ok(r->'current'->>'phase' = 'vote' and jsonb_array_length(r->'current'->'entries') = 4
    and not exists (select 1 from jsonb_array_elements(r->'current'->'entries') x
                     where x ? 'user_id' or x ? 'pseudo' or x ? 'avatar_url' or x ? 'votes' or x ? 'winner')
    and (r->'current'->>'can_vote')::boolean is false,
    'anonymat pendant le vote : ni auteur ni voix ; un non-participant ne peut pas voter');
  perform t_ok(not exists (select 1 from jsonb_array_elements(r->'current'->'entries') x
                            where x->>'path' like '%' || u2::text || '%' or x->>'path' like '%' || u3::text || '%'
                               or x->>'path' like '%' || u4::text || '%' or x->>'path' like '%' || u7::text || '%'),
    'anonymat : aucun chemin ne contient l’identifiant de son auteur');
  perform t_ok(r::text not like '%' || u3::text || '%' and r::text not like '%Banc3%', 'anonymat : ni identifiant ni pseudo d’un auteur dans la réponse');
  r := t_call(u2, 'hg_wch_page()');
  perform t_ok((r->'current'->>'can_vote')::boolean and r->'current'->>'my_vote' = e3
    and (select count(*) from jsonb_array_elements(r->'current'->'entries') x where (x->>'is_mine')::boolean) = 1,
    'un participant voit sa voix et reconnaît sa participation (is_mine)');
  perform t_ok(t_count(u5, format('select count(*) from storage.objects where name = %L', o3)) = 1,
    'stockage : pendant le vote, tout membre lit les fichiers des participations');
  perform t_ok(t_count(u5, format('select count(*) from storage.objects where name = %L', o2)) = 0,
    'stockage : un fichier retiré (sans participation) reste privé');
  perform t_ok(t_count(u2, 'select count(*) from hg_weekly_challenge_votes') = 0
    and t_count(u2, 'select count(*) from hg_weekly_challenge_entries') = 0, 'un membre ne lit ni les voix ni les participations en direct');

  -- ===== Fin : ex æquo =====
  perform t7_phase(a, 'fini');
  perform t_ok(t7_ph(a) = 'cloture', 'vote fini, pas encore dépouillé : cloture');
  pl2 := t_pl(u2); pl3 := t_pl(u3); pl4 := t_pl(u4); pl7 := t_pl(u7);
  perform hg_wch_tick();
  perform t_ok(t7_ph(a) = 'termine', 'dépouillé : termine');
  perform t_ok((select count(*) from hg_weekly_challenge_winners where challenge_id = a) = 2
    and exists (select 1 from hg_weekly_challenge_winners where challenge_id = a and user_id = u2 and votes = 2 and credited_at is not null)
    and exists (select 1 from hg_weekly_challenge_winners where challenge_id = a and user_id = u3 and votes = 2 and credited_at is not null),
    'ex æquo : deux gagnants à 2 voix');
  perform t_ok(t_pl(u2) = pl2 + 500 and t_pl(u3) = pl3 + 500 and t_pl(u4) = pl4 and t_pl(u7) = pl7, 'gain complet pour chaque gagnant, rien pour les autres');
  perform hg_wch_tick(); perform hg_wch_tick();
  perform t_ok(t_pl(u2) = pl2 + 500 and t_pl(u3) = pl3 + 500
    and (select count(*) from hg_wallet_log where reason = 'challenge' and ref = 'challenge:' || a::text) = 2, 'passage relancé : pas de double paiement');
  perform t_ok(t7_nb_notifs(u2, '%Tu as gagné%') = 1 and t7_nb_notifs(u4, '%Résultat%Banc2, Banc3%') = 1, 'résultat annoncé une fois (gagnants, autres participants)');
  r := t_call(u5, 'hg_wch_page()');
  perform t_ok(r->'current'->>'id' = a::text and r->'current'->>'phase' = 'termine' and jsonb_array_length(r->'current'->'winners') = 2
    and (r->'current'->'entries'->0->>'votes')::int = 2 and r->'current'->'entries'->0 ? 'pseudo'
    and (select count(*) from jsonb_array_elements(r->'current'->'entries') x where (x->>'winner')::boolean) = 2,
    'après le vote : auteurs, voix, gagnants, tri par voix');
  msg := t_exec(u6, format('update hg_weekly_challenges set reward_paillettes = 9999 where id = %L', a));
  perform t_ok(msg like 'ERR%clos%', 'challenge clos : le gain ne change plus (' || msg || ')');
  msg := t_exec(u6, format('update hg_weekly_challenges set cancelled_at = now() where id = %L', a));
  perform t_ok(msg like 'ERR%clos%', 'challenge clos : il ne s’annule plus (' || msg || ')');
  msg := t_exec(u6, format('update hg_weekly_challenges set title = %L where id = %L', 'Photo A (ciel)', a));
  perform t_ok(msg = '1 ligne(s)', 'challenge clos : le nom change encore');

  -- ===== Aucune voix → attente → choix de l'admin (challenge texte) =====
  insert into hg_weekly_challenges (title, answer_type, starts_at, ends_at, vote_days, reward_paillettes)
    values ('Texte B', 'texte', now() - interval '1 hour', now() + interval '1 day', 1, 300) returning id into b;
  msg := t7_enter(u2, b, b::text || '/abcdefgh12345678.txt', 'text/plain', 'texte');
  perform t_ok(msg like 'ERR%pas un fichier%', 'challenge texte : un fichier est refusé (' || msg || ')');
  msg := t7_enter(u2, b, null, null, '   ');
  perform t_ok(msg like 'ERR%Écris%', 'challenge texte : texte vide refusé (' || msg || ')');
  eb2 := t7_enter(u2, b, null, null, 'Mon poème');
  eb3 := t7_enter(u3, b, null, null, 'Ma nouvelle');
  perform t_ok(eb2 ~ '^[0-9a-f-]{36}$' and eb3 ~ '^[0-9a-f-]{36}$', 'deux participations texte');
  perform t7_phase(b, 'fini');
  perform hg_wch_tick();
  perform t_ok(t7_ph(b) = 'attente' and t7_nb_notifs(u6, '%sans voix%') = 1, 'aucune voix : attente, l’admin est prévenu');
  msg := t_err(u2, format('hg_wch_admin_pick(%L::uuid, %L::uuid)', b, eb2));
  perform t_ok(msg like '%administrateur%', 'un membre ne choisit pas le gagnant (' || coalesce(msg, 'accepté') || ')');
  msg := t_err(u6, format('hg_wch_admin_pick(%L::uuid, %L::uuid)', b, e3));
  perform t_ok(msg like '%introuvable dans ce challenge%', 'choix d’une participation d’un autre challenge refusé (' || coalesce(msg, 'accepté') || ')');
  pl3 := t_pl(u3);
  perform t_do(u6, format('hg_wch_admin_pick(%L::uuid, %L::uuid)', b, eb3));
  perform t_ok(t7_ph(b) = 'termine' and t_pl(u3) = pl3 + 300
    and exists (select 1 from hg_weekly_challenge_winners where challenge_id = b and user_id = u3 and chosen_by_admin), 'choix de l’admin : gagnant payé, « choisi par l’admin »');
  msg := t_err(u6, format('hg_wch_admin_pick(%L::uuid, null)', b));
  perform t_ok(msg like '%n’attend pas%', 'pas de second choix (' || coalesce(msg, 'accepté') || ')');
  perform hg_wch_tick();
  perform t_ok(t_pl(u3) = pl3 + 300, 'choix de l’admin payé une seule fois');
  -- Sans gagnant, choisi par l'admin.
  insert into hg_weekly_challenges (title, answer_type, starts_at, ends_at, vote_days) values ('Texte Z', 'texte', now() - interval '1 hour', now() + interval '1 day', 1)
    returning id into z;
  perform t7_enter(u4, z, null, null, 'Seul');
  perform t7_phase(z, 'fini'); perform hg_wch_tick();
  perform t_do(u6, format('hg_wch_admin_pick(%L::uuid, null)', z));
  perform t_ok(t7_ph(z) = 'sans_gagnant' and t7_nb_notifs(u4, '%sans gagnant%') = 1, 'admin : clos sans gagnant, participant prévenu');
  r := t_call(u2, 'hg_wch_page()');
  perform t_ok(r->'current'->>'id' in (a::text, b::text, z::text), 'fini depuis moins de 3 jours : encore le challenge courant');
  -- Les trois challenges finis il y a plus de 3 jours : plus de challenge courant, tous en archives.
  update hg_weekly_challenges set starts_at = starts_at - interval '5 days', ends_at = ends_at - interval '5 days' where id in (a, b, z);
  r := t_call(u2, 'hg_wch_page()');
  perform t_ok(r->'current' = 'null'::jsonb, 'plus rien de courant au-delà de 3 jours');
  perform t_ok(exists (select 1 from jsonb_array_elements(r->'archives') x where x->>'id' = b::text and x->>'outcome' = 'gagnant' and (x->>'chosen_by_admin')::boolean)
    and exists (select 1 from jsonb_array_elements(r->'archives') x where x->>'id' = z::text and x->>'outcome' = 'sans_gagnant')
    and exists (select 1 from jsonb_array_elements(r->'archives') x where x->>'id' = a::text and x->>'outcome' = 'ex_aequo'
                  and jsonb_array_length(x->'winners') = 2 and (x->>'participants_count')::int = 4),
    'archives : ex æquo, gagnant choisi par l’admin, sans gagnant');

  -- ===== Retrait admin (challenge « tout ») =====
  insert into hg_weekly_challenges (title, answer_type, max_entries, starts_at, ends_at) values ('Tout C', 'tout', 3, now() - interval '1 hour', now() + interval '1 day')
    returning id into c;
  o := t7_obj(u4, c, 'pdf', 'application/pdf');
  ec := t7_enter(u4, c, o, 'application/pdf');
  perform t_ok(ec ~ '^[0-9a-f-]{36}$', 'challenge « tout » : un PDF est accepté');
  msg := t_err(u6, format('hg_wch_admin_remove(%L::uuid, %L)', ec, ' '));
  perform t_ok(msg like '%motif%', 'retrait sans motif refusé (' || coalesce(msg, 'accepté') || ')');
  msg := t_err(u2, format('hg_wch_admin_remove(%L::uuid, %L)', ec, 'Hors sujet'));
  perform t_ok(msg like '%administrateur%', 'un membre ne retire pas une participation (' || coalesce(msg, 'accepté') || ')');
  msg := t_call(u6, format('hg_wch_admin_remove(%L::uuid, %L)', ec, 'Hors sujet')) #>> '{}';
  perform t_ok(msg = o and not exists (select 1 from hg_weekly_challenge_entries where id = ec::uuid)
    and t7_nb_notifs(u4, '%retirée%Motif : Hors sujet%') = 1
    and exists (select 1 from hg_admin_log where action = 'challenge_retrait' and target_user = u4), 'retrait admin : chemin rendu, membre prévenu avec le motif, journal');
  r := t_call(u6, format('hg_wch_admin_detail(%L::uuid)', a));
  perform t_ok(jsonb_array_length(r->'entries') = 4 and (r->>'voters_count')::int = 4 and r->'entries'->0 ? 'pseudo'
    and jsonb_array_length(r->'winners') = 2, 'détail admin : auteurs, voix, votants, gagnants');
  r := t_call(u6, 'hg_wch_admin_list()');
  perform t_ok(jsonb_array_length(r) >= 4 and exists (select 1 from jsonb_array_elements(r) x where x->>'id' = a::text and x->>'phase' = 'termine'
    and (x->>'voters_count')::int = 4 and x->'winners' @> '["Banc2", "Banc3"]'::jsonb), 'liste admin : phase, compteurs, pseudos gagnants');
  msg := t_err(u2, 'hg_wch_admin_list()');
  perform t_ok(msg like '%administrateur%', 'liste admin fermée aux membres');

  -- ===== Annulation, suppression =====
  insert into hg_weekly_challenges (title, answer_type, starts_at, ends_at) values ('Annulé D', 'image', now() - interval '1 hour', now() + interval '1 day')
    returning id into d;
  ed := t7_enter(u2, d, t7_obj(u2, d, 'png', 'image/png'), 'image/png');
  msg := t_exec(u6, format('de' || 'lete from hg_weekly_challenges where id = %L', d));
  perform t_ok(msg like 'ERR%annule-le%', 'un challenge avec des participations ne se supprime pas (' || msg || ')');
  msg := t_exec(u6, format('update hg_weekly_challenges set cancelled_at = now() where id = %L', d));
  perform t_ok(msg = '1 ligne(s)' and t7_ph(d) = 'annule', 'annulation par l’admin');
  msg := t7_enter(u3, d, t7_obj(u3, d, 'png', 'image/png'), 'image/png');
  perform t_ok(msg like 'ERR%introuvable%', 'challenge annulé : plus de participation (' || msg || ')');
  r := t_call(u2, 'hg_wch_page()');
  perform t_ok(coalesce(r->'current'->>'id', '') <> d::text and not exists (select 1 from jsonb_array_elements(r->'archives') x where x->>'id' = d::text),
    'challenge annulé : absent de la page');
  perform t7_phase(d, 'vote');
  perform t_ok(t_count(u5, format('select count(*) from storage.objects o where o.name in (select path from hg_weekly_challenge_entries where id = %L)', ed)) = 0,
    'challenge annulé : fichiers jamais visibles des autres membres');
  insert into hg_weekly_challenges (title, starts_at, ends_at) values ('Vide E', now() + interval '1 day', now() + interval '2 days') returning id into e;
  msg := t_exec(u6, format('de' || 'lete from hg_weekly_challenges where id = %L', e));
  perform t_ok(msg = '1 ligne(s)', 'un challenge sans participation se supprime');
  insert into hg_weekly_challenges (title, starts_at, ends_at, vote_days) values ('Vide F', now() - interval '9 days', now() - interval '5 days', 1) returning id into e;
  perform hg_wch_tick();
  perform t_ok(t7_ph(e) = 'sans_gagnant', 'aucune participation : clos sans gagnant par le passage');

  -- ===== Export, compte supprimé, purge, fichiers orphelins =====
  r := t_call(u2, 'hg_export_my_data()');
  perform t_ok(jsonb_array_length(r->'challenges'->'participations') = 3 and jsonb_array_length(r->'challenges'->'voix') = 1
    and jsonb_array_length(r->'challenges'->'gains') = 1 and r ? 'jeu_de_cartes' and r ? 'jeux' and r ? 'cartes_anniversaire_recues',
    'export : participations, voix et gains du membre, rien de perdu de la 216');
  perform t_ok(r->'challenges'->'voix'->0->>'participation' = e3 and r::text not like '%' || u7::text || '%', 'export : sa voix, jamais celle des autres');

  execute 'de' || 'lete from hg_profiles where id = $1' using u7;
  perform t_ok(not exists (select 1 from hg_weekly_challenge_entries where user_id = u7) and not exists (select 1 from hg_weekly_challenge_votes where voter_id = u7)
    and (select count(*) from hg_weekly_challenge_winners where challenge_id = a) = 2, 'compte supprimé : participations et voix parties (gagnants intacts)');
  perform t_ok(t_count(u6, format('select count(*) from storage.objects where name = %L', o7)) = 1, 'compte supprimé : son fichier reste dans le stockage (orphelin)');

  update hg_weekly_challenges set closed_at = now() - interval '13 months' where id = a;
  r := hg_entretien__passage('apercu');
  perform t_ok((r->'tables'->>'hg_weekly_challenge_entries')::int = 3 and (r->'tables'->>'hg_weekly_challenge_votes')::int = 3
    and (r->'tables'->>'hg_weekly_challenge_winners')::int = 2, 'aperçu de purge : le challenge fini depuis 13 mois seulement');
  r := hg_entretien__passage('main');
  perform t_ok(not exists (select 1 from hg_weekly_challenge_entries where challenge_id = a) and not exists (select 1 from hg_weekly_challenge_winners where challenge_id = a)
    and exists (select 1 from hg_weekly_challenges where id = a) and exists (select 1 from hg_weekly_challenge_entries where challenge_id = b),
    'purge : participations, voix, gagnants partis, le challenge et les plus récents restent');
  update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'hg-challenges';
  r := t_call(u6, 'hg_wch_admin_orphelins()');
  perform t_ok(r ? o2 and r ? o7 and r ? o3 and not (r ? (select path from hg_weekly_challenge_entries where id = ed::uuid)),
    'orphelins : fichiers retirés, purgés, de compte supprimé (et pas ceux d’une participation)');
  msg := t_err(u2, 'hg_wch_admin_orphelins()');
  perform t_ok(msg like '%administrateur%', 'orphelins : réservé à l’admin');
  perform t_ok(t_exec(u2, format('de' || 'lete from storage.objects where name = %L', o3)) = '0 ligne(s)'
    and t_exec(u6, format('de' || 'lete from storage.objects where name = %L', o3)) = '1 ligne(s)', 'stockage : seul le propriétaire ou l’admin retire un fichier');
  r := t_call(u4, 'hg_wch_mes_fichiers()');
  perform t_ok(r ? o4 and not (r ? o2), 'hg_wch_mes_fichiers : mes fichiers seulement');

  -- Droits d'exécution.
  perform t_ok(not has_function_privilege('authenticated', 'hg_wch_tick()', 'execute')
    and not has_function_privilege('anon', 'hg_wch_page()', 'execute')
    and not has_function_privilege('authenticated', 'hg_wch__payer(uuid)', 'execute'), 'tick et fonctions internes fermés aux comptes');
  perform t_bilan_fin();
end $$;
