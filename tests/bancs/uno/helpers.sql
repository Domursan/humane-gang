-- Outils de test du Uno (superutilisateur) : identités, assertions, pilote automatique.
create or replace function t_ok(c boolean, msg text) returns void language plpgsql as $$
begin if c is not true then raise exception 'ÉCHEC : %', msg; end if; raise notice 'ok : %', msg; end $$;
create or replace function t_uid(n int) returns uuid language sql immutable as $$ select ('00000000-0000-0000-0000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;
create or replace function t_as(n int) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', t_uid(n), 'role', 'authenticated')::text, false); end $$;
create or replace function t_asu(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false); end $$;
create or replace function t_pid(p_code text) returns uuid language sql as $$ select id from hg_uno_parties where code = p_code order by (statut in ('attente', 'en_cours')) desc, created_at desc limit 1 $$;
create or replace function t_call(n int, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform t_as(n); execute 'set local role authenticated';
  execute 'select to_jsonb((' || p_sql || '))' into r;
  execute 'reset role'; return r;
exception when others then execute 'reset role'; raise;
end $$;
create or replace function t_callu(u uuid, p_sql text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform t_asu(u); execute 'set local role authenticated';
  execute 'select to_jsonb((' || p_sql || '))' into r;
  execute 'reset role'; return r;
exception when others then execute 'reset role'; raise;
end $$;
create or replace function t_err(n int, p_sql text) returns text language plpgsql as $$
begin perform t_call(n, p_sql); return null; exception when others then return sqlerrm; end $$;

-- Invariants d'une partie en cours : nombre total de cartes, compteurs, joueur du tour valide.
create or replace function t_invariants(p_id uuid) returns text language plpgsql as $$
declare p hg_uno_parties; v_tot int; v_att int; v_bad int;
begin
  select * into p from hg_uno_parties where id = p_id;
  select count(*) into v_tot from hg_uno_cartes where partie = p_id;
  v_att := 108 * case when (select count(*) from hg_uno_joueurs where partie = p_id) >= 11
                 and exists (select 1 from hg_uno_cartes where partie = p_id) and v_tot > 108 then 2 else 1 end;
  if v_tot not in (108, 216) then return 'total de cartes ' || v_tot; end if;
  select count(*) into v_bad from hg_uno_joueurs j where j.partie = p_id
    and j.nb_cartes <> (select count(*) from hg_uno_cartes c where c.partie = p_id and c.lieu = 'main' and c.user_id = j.user_id);
  if v_bad > 0 then return 'compteur de cartes faux'; end if;
  if exists (select 1 from hg_uno_cartes where partie = p_id and lieu = 'main' and user_id in (select user_id from hg_uno_joueurs where partie = p_id and exclu)) then
    return 'un exclu a encore des cartes'; end if;
  if p.statut = 'en_cours' then
    if p.tour is null or not exists (select 1 from hg_uno_joueurs where partie = p_id and user_id = p.tour and not exclu) then return 'tour invalide'; end if;
    if (select count(*) from hg_uno_cartes where partie = p_id and lieu = 'defausse') < 1 then return 'défausse vide'; end if;
    if p.couleur is null then return 'couleur nulle'; end if;
  end if;
  return null;
end $$;

-- Pilote : joue une partie complète avec n joueurs (profils 1..n), variantes et mode donnés. Renvoie un résumé.
create or replace function t_simuler(n int, p_var jsonb, p_mode text default 'manche', p_absents boolean default false) returns text language plpgsql as $$
declare v_code text; v_id uuid; e jsonb; p hg_uno_parties; u uuid; un int; carte jsonb; i int; v_pas int := 0; v_err text;
  v_coul text; v_cible uuid; v_inv text; v_n2 int;
begin
  v_code := t_call(1, format('hg_uno_creer(%L::jsonb)', jsonb_build_object('nom', 'Simu', 'nb_places', greatest(n, 2), 'variantes', p_var, 'mode', p_mode, 't_tour', 15)::text)) #>> '{}';
  v_id := t_pid(v_code);
  for i in 2..n loop
    perform t_call(i, format('hg_uno_rejoindre(%L)', v_code));
    perform t_call(i, format('hg_uno_pret(%L, true)', v_code));
  end loop;
  perform t_call(1, format('hg_uno_lancer(%L)', v_code));
  loop
    v_pas := v_pas + 1;
    select * into p from hg_uno_parties where id = v_id;
    exit when p.statut <> 'en_cours' or v_pas > 6000;
    v_inv := t_invariants(v_id);
    if v_inv is not null then raise exception 'ÉCHEC invariant (% joueurs, pas %) : %', n, v_pas, v_inv; end if;
    u := p.tour; un := (right(u::text, 2))::int;
    -- Place tenue par le robot (3 tours manqués, migration 211) : le joueur revient avant de jouer.
    if (select parti from hg_uno_joueurs where partie = v_id and user_id = u) then
      perform t_callu(u, format('hg_uno_reprendre(%L)', v_code));
      continue;
    end if;
    -- Absent simulé : chrono écoulé, un autre joueur demande d'avancer.
    if p_absents and random() < 0.05 then
      update hg_uno_parties set tour_fin = now() - interval '1 second' where id = v_id;
      perform t_callu((select user_id from hg_uno_joueurs where partie = v_id and not exclu and user_id <> u limit 1), format('hg_uno_avancer(%L)', v_code));
      continue;
    end if;
    -- Contre : un autre joueur contre parfois un oubli de UNO.
    if p.uno_attente is not null and random() < 0.5 then
      update hg_uno_parties set uno_depuis = now() - interval '5 seconds' where id = v_id;  -- délai de grâce écoulé
      perform t_callu((select user_id from hg_uno_joueurs where partie = v_id and not exclu and user_id <> p.uno_attente order by random() limit 1),
        format('hg_uno_contrer(%L, %L)', v_code, p.uno_attente));
      continue;
    end if;
    e := t_callu(u, format('hg_uno_etat(%L)', v_code));
    if p.defi is not null then
      perform t_callu(u, format('hg_uno_contester(%L, %s)', v_code, (random() < 0.4)::text));
      continue;
    end if;
    select c into carte from jsonb_array_elements(e->'main') c where (c->>'jouable')::boolean order by random() limit 1;
    if carte is not null then
      select couleur into v_coul from (values ('r'),('y'),('g'),('b')) t(couleur) order by random() limit 1;
      select user_id into v_cible from hg_uno_joueurs where partie = v_id and not exclu and user_id <> u order by random() limit 1;
      perform t_callu(u, format('hg_uno_jouer(%L, %s, %L, %L)', v_code, carte->>'id', v_coul, v_cible));
      -- UNO juste après avoir posé l'avant-dernière carte (souvent).
      if (select nb_cartes from hg_uno_joueurs where partie = v_id and user_id = u) = 1 and random() < 0.8 then
        perform t_callu(u, format('hg_uno_uno(%L)', v_code));
      end if;
    elsif (e->'partie'->>'a_pioche')::boolean then
      perform t_callu(u, format('hg_uno_passer(%L)', v_code));
    else
      perform t_callu(u, format('hg_uno_piocher(%L)', v_code));
    end if;
  end loop;
  select * into p from hg_uno_parties where id = v_id;
  v_inv := t_invariants(v_id);
  if v_inv is not null then raise exception 'ÉCHEC invariant final (% joueurs) : %', n, v_inv; end if;
  if p.statut <> 'terminee' then raise exception 'ÉCHEC : partie de % joueurs non terminée après % pas (statut %)', n, v_pas, p.statut; end if;
  if (select count(*) from hg_uno_joueurs where partie = v_id and gagne) <> 1 then raise exception 'ÉCHEC : pas exactement un gagnant'; end if;
  return format('%s joueurs, %s pas, %s manche(s), gagnant %s', n, v_pas, p.manche, hg_uno__nom(v_id, p.vainqueur));
end $$;

insert into hg_profiles(id, pseudo, color, is_admin) select t_uid(i), 'Joueur' || i, '#ABCDEF', i = 1 from generate_series(1, 21) i on conflict do nothing;
update hg_settings set value = jsonb_set(value, '{testeurs}', (select jsonb_agg(t_uid(i)::text) from generate_series(2, 20) i)) where key = 'uno';
