-- ===== Humane Gang — migration 188 : tirage automatique du Framed =====
-- Décision d'Ethan (01.11.2026) : un jour sans manche, le premier passage tire au sort un film de la réserve, comme hg_geo_current.
-- hg_framed__jour() : la manche d'aujourd'hui, tirée si besoin. Un film actif, avec 3 images au moins, jamais servi (index unique
-- hg_framed_rounds_film). Sans paramètre : il ne peut viser ni un jour passé ni un jour futur. Une ligne déjà là prime sur tout
-- (Framed n'a pas d'état « annulé » : retirer une manche vide le jour, et le passage suivant retire au sort).
-- Réserve épuisée : rien n'est écrit, et les RPC répondent comme avant (pas de partie).
-- created_by null : la ligne est un tirage ; hg_jeux_programme l'affiche « auto ». hg_framed_round_save écrit toujours un auteur.
-- Entrées : hg_framed_state et hg_framed_guess. Le numéro de manche et hg_daily_hier comptent les lignes : rien à changer.
-- hg_jeux_obj_visible lit la ligne que hg_framed_state vient d'écrire : les images suivent. hg_adrep_framed est stable et lit sans
-- tirer, comme hg_adrep_geo. hg_jeux_programme_jour lit la ligne telle quelle : « par » reste vide, le statut vient du calendrier.

create or replace function public.hg_framed__jour()
returns public.hg_framed_rounds language plpgsql volatile security definer set search_path = public as $$
declare r hg_framed_rounds; d date := hg_jeux_today(); v_film uuid;
begin
  select * into r from hg_framed_rounds where day = d;
  if found then return r; end if;
  perform pg_advisory_xact_lock(hashtextextended('hg_framed_day', 0));
  select * into r from hg_framed_rounds where day = d;
  if found then return r; end if;
  select f.id into v_film from hg_framed_films f
    where f.active and cardinality(f.frames) >= 3 and not exists (select 1 from hg_framed_rounds x where x.film_id = f.id)
    order by random() limit 1;
  if v_film is null then return null; end if;
  insert into hg_framed_rounds (day, film_id, created_by) values (d, v_film, null) returning * into r;
  return r;
end $$;
revoke all on function public.hg_framed__jour() from public, anon, authenticated;

-- Une migration relancée ne repasse pas ici : hg__patch refuse un texte déjà remplacé.
do $d$
begin
  if pg_get_functiondef('public.hg_framed_state()'::regprocedure) not like '%hg_framed__jour%' then
    perform public.hg__patch('public.hg_framed_state()'::regprocedure,
      $o$select * into r from hg_framed_rounds where day = d;
  if not found then
    return jsonb_build_object('day', d, 'round', null,$o$,
      $n$r := hg_framed__jour();
  if r.day is null then
    return jsonb_build_object('day', d, 'round', null,$n$);
  end if;

  if pg_get_functiondef('public.hg_framed_guess(uuid)'::regprocedure) not like '%hg_framed__jour%' then
    perform public.hg__patch('public.hg_framed_guess(uuid)'::regprocedure,
      $o$select * into r from hg_framed_rounds where day = d;
  if not found then raise exception 'Pas de Framed aujourd''hui.'; end if;$o$,
      $n$r := hg_framed__jour();
  if r.day is null then raise exception 'Pas de Framed aujourd''hui.'; end if;$n$);
  end if;

  -- Même verrou que le tirage : programmer un film pendant qu'il est tiré n'échoue pas sur l'index unique.
  if pg_get_functiondef('public.hg_framed_round_save(date, uuid)'::regprocedure) not like '%hg_framed_day%' then
    perform public.hg__patch('public.hg_framed_round_save(date, uuid)'::regprocedure,
      $o$if exists (select 1 from hg_daily_games where game = 'framed' and day = p_day) then$o$,
      $n$perform pg_advisory_xact_lock(hashtextextended('hg_framed_day', 0));
  if exists (select 1 from hg_daily_games where game = 'framed' and day = p_day) then$n$);
  end if;

  -- Les affiches du lot vivent dans un dossier au hasard, pas celui de l'id du film (hg_framed_state donne les deux) : les garder au panel.
  if pg_get_functiondef('public.hg_framed_film_save(jsonb)'::regprocedure) like '%''^framed/'' || v_id::text%' then
    perform public.hg__patch('public.hg_framed_film_save(jsonb)'::regprocedure,
      $o$if x !~ ('^framed/' || v_id::text || '/[1-6]\.(webp|jpg|png)$') then$o$,
      $n$if x !~ '^framed/[0-9a-f-]{36}/[1-6]\.(webp|jpg|png)$' then$n$);
  end if;

  if pg_get_functiondef('public.hg_jeux_programme(date, int)'::regprocedure) like '%''fete/framed-heardle/framed'', ''filet'', false%' then
    perform public.hg__patch('public.hg_jeux_programme(date, int)'::regprocedure,
      $o$'route', 'fete/framed-heardle/framed', 'filet', false,$o$,
      $n$'route', 'fete/framed-heardle/framed', 'filet', true,$n$);
    perform public.hg__patch('public.hg_jeux_programme(date, int)'::regprocedure,
      $o$jsonb_build_object('day', r.day, 'statut', 'programme', 'titre', f.title, 'par', pr.pseudo)$o$,
      $n$jsonb_build_object('day', r.day, 'statut', case when r.created_by is null then 'auto' else 'programme' end, 'titre', f.title, 'par', pr.pseudo)$n$);
  end if;
end $d$;
