-- ===== Humane Gang — migration 199 : salle d'attente dont l'hôte a disparu, revanche Uno ouverte à tout membre =====
-- 1. Uno, plateaux, Nom de code, Loup-Garou, en salle d'attente seulement : un hôte sans signal de présence depuis 5 minutes
--    (hg_presence.seen_at) passe la main au premier membre de la salle présent depuis moins de 2 minutes. Mêmes gestes
--    que le départ volontaire (hg_*_quitter) : nouvel hôte, prêt d'office, ligne de journal. Un invité ne devient jamais hôte.
--    Personne de présent : rien ne change, on réessaie à la minute suivante (la salle finit annulée à 6 h, comme avant).
--    L'ancien hôte qui revient reste joueur et ne reprend pas la main.
-- 2. Loup-Garou avec meneur humain, en salle : 15 minutes au lieu de 5 (il prépare sa salle, l'onglet parfois caché, et il y perd
--    ses rôles et sa place de meneur). Le meneur ne joue pas : le premier membre présent reprend la salle en meneur automatique.
--    Les rôles réservés à un meneur humain (refusés en automatique par hg_lg_creer) deviennent des Villageois.
-- 3. Le message reste affiché tant que la salle est ouverte : le transfert est noté dans etat->'hote_passe', relu par les
--    hg_*_etat (clé hote_passe de la réponse). Un nouveau changement d'hôte le rend caduc : un autre transfert remplace la note, un
--    départ volontaire (hg_*_quitter) la retire, sans quoi elle réapparaîtrait si la main revenait plus tard au même membre.
-- 4. Loup-Garou en cours avec un meneur parti : aucun transfert (il voit tous les rôles), hg_lg_etat renvoie meneur_parti,
--    calculé à la lecture. La partie avance seule sur ses temps et la pause est levée à 30 min (migration 176).
-- 5. Uno : tout membre de la partie peut lancer la revanche et en devient l'hôte, comme aux plateaux et à Nom de code.
-- Aucune tâche cron de plus : le passage est porté par hg_lg_tick, qui tourne déjà chaque minute (chaque tâche ajoutée
-- coûte une connexion et 1 440 lignes par jour de cron.job_run_details). Sans salle en attente, il ne fait qu'un SELECT par jeu.
-- Aucune RPC nouvelle. Rejouable : chaque remplacement n'est fait que si la fonction ne le contient pas encore.

-- Sans signal depuis 5 minutes, et là depuis au moins autant (salle ou partie à peine créée : la présence n'a pas encore battu).
-- Le meneur humain d'une salle a droit à 15 minutes : voir hg_salles__hote_passer.
create or replace function public.hg_salles__absent(p_user uuid, p_depuis timestamptz)
returns boolean language sql stable security definer set search_path = public as $$
  select p_depuis < now() - interval '5 minutes'
    and not exists (select 1 from hg_presence where user_id = p_user and seen_at >= now() - interval '5 minutes')
$$;

-- Le transfert à afficher : celui qui a donné la salle à son hôte actuel, et seulement tant qu'elle est ouverte.
create or replace function public.hg_salles__hote_vue(p_statut text, p_hote uuid, p_etat jsonb)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p_statut = 'attente' and p_etat->'hote_passe'->>'nouveau' = p_hote::text then p_etat->'hote_passe' end
$$;

-- Passe la main dans une salle (p_jeu : uno, ndc, plat ou lg, jamais une saisie). Faux si rien n'a changé.
create or replace function public.hg_salles__hote_passer(p_jeu text, p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hote uuid; v_depuis timestamptz; v_nouvel uuid; v_nom text; v_ancien text; v_mj boolean := false; v_compo jsonb; v_retires int;
begin
  -- Verrou : un départ ou un lancement en cours de l'hôte passe d'abord, la salle est revue à la minute suivante.
  execute format('select hote, created_at from hg_%s_parties where id = $1 and statut = ''attente'' for update skip locked', p_jeu)
    into v_hote, v_depuis using p_id;
  if v_hote is null or not hg_salles__absent(v_hote, v_depuis) then return false; end if;
  if p_jeu = 'lg' then
    select mode = 'mj', composition into v_mj, v_compo from hg_lg_parties where id = p_id;
    if v_mj and (v_depuis >= now() - interval '15 minutes'
        or exists (select 1 from hg_presence where user_id = v_hote and seen_at >= now() - interval '15 minutes')) then
      return false;
    end if;
  end if;
  -- Les places du Loup-Garou ne sont tirées qu'au lancement : là, l'ordre d'arrivée.
  execute format('select j.user_id, j.pseudo from hg_%s_joueurs j join hg_presence h on h.user_id = j.user_id
      where j.partie = $1 and not j.invite and j.user_id <> $2 and h.seen_at > now() - interval ''2 minutes''
      order by j.%s limit 1', p_jeu, case p_jeu when 'lg' then 'rejoint_at' else 'place' end)
    into v_nouvel, v_nom using p_id, v_hote;
  if v_nouvel is null then return false; end if;
  execute format('select pseudo from hg_%s_joueurs where partie = $1 and user_id = $2', p_jeu) into v_ancien using p_id, v_hote;
  v_ancien := coalesce(v_ancien, (select pseudo from hg_profiles where id = v_hote), '?');

  if p_jeu = 'lg' then
    if v_mj then
      select coalesce(sum(c.value::int), 0) into v_retires
        from jsonb_each_text(v_compo) c join hg_lg_roles r on r.id = c.key where r.mj_seul;
      if v_retires > 0 then
        v_compo := (v_compo - (select array_agg(id) from hg_lg_roles where mj_seul))
          || jsonb_build_object('villageois', coalesce((v_compo->>'villageois')::int, 0) + v_retires);
      end if;
      update hg_lg_parties set mode = 'auto', composition = v_compo where id = p_id;
    end if;
  end if;

  execute format('update hg_%s_parties set hote = $2, etat = etat || jsonb_build_object(''hote_passe'', $3::jsonb) where id = $1', p_jeu)
    using p_id, v_nouvel, jsonb_build_object('ancien', v_hote, 'ancien_nom', v_ancien, 'nouveau', v_nouvel, 'nouveau_nom', v_nom, 'meneur', v_mj);
  execute format('update hg_%s_joueurs set pret = true where partie = $1 and user_id = $2', p_jeu) using p_id, v_nouvel;

  if p_jeu = 'lg' then
    -- hg_lg_lancer ne dispense que l'hôte d'être prêt : l'ancien, absent, bloquerait le lancement. Un meneur n'a pas de ligne de joueur.
    update hg_lg_joueurs set pret = true where partie = p_id and user_id = v_hote;
    perform hg_lg__log(p_id, 'info', v_nom || case when v_mj then ' reprend la salle : la partie passe en meneur automatique.' else ' devient l''hôte.' end);
    if v_retires > 0 then perform hg_lg__log(p_id, 'info', 'Les rôles réservés à un meneur humain deviennent des Villageois.'); end if;
    perform hg_lg__bump(p_id);
  else
    execute format('select hg_%s__log($1, $2, ''info'', $3)', p_jeu) using p_id, v_nouvel, v_nom || ' devient l''hôte.';
    execute format('select hg_%s__bump($1)', p_jeu) using p_id;
  end if;
  return true;
end $$;

-- Passage de chaque minute, sur toutes les salles d'attente. Une salle en erreur ne bloque ni les autres ni le tick qui l'appelle.
create or replace function public.hg_salles__hote_absent()
returns int language plpgsql security definer set search_path = public as $$
declare v_jeu text; r record; n int := 0;
begin
  foreach v_jeu in array array['uno', 'ndc', 'plat', 'lg'] loop
    for r in execute format('select id from hg_%s_parties where statut = ''attente'' and hg_salles__absent(hote, created_at)', v_jeu) loop
      begin
        if hg_salles__hote_passer(v_jeu, r.id) then n := n + 1; end if;
      exception when others then
        raise warning 'hg_salles__hote_absent : % % : %', v_jeu, r.id, sqlerrm;
      end;
    end loop;
  end loop;
  return n;
end $$;

revoke all on function public.hg_salles__absent(uuid, timestamptz), public.hg_salles__hote_vue(text, uuid, jsonb),
  public.hg_salles__hote_passer(text, uuid), public.hg_salles__hote_absent() from public, anon, authenticated;

do $m$
declare f regprocedure; v_jeu text;
begin
  -- Le tick du Loup-Garou porte le passage de toutes les salles, après l'annulation des salles trop vieilles.
  f := 'public.hg_lg_tick()'::regprocedure;
  if pg_get_functiondef(f) !~ 'hg_salles__hote_absent' then
    perform public.hg__patch(f,
      $o$update hg_lg_parties set statut = 'annulee', version = version + 1 where statut = 'attente' and created_at < now() - interval '6 hours';$o$,
      $n$update hg_lg_parties set statut = 'annulee', version = version + 1 where statut = 'attente' and created_at < now() - interval '6 hours';
  -- Salles de tous les jeux dont l'hôte a disparu (migration 199) : ici pour ne pas ajouter une tâche cron.
  perform hg_salles__hote_absent();$n$);
  end if;

  -- Lecture : le transfert à afficher, à la racine de la réponse.
  foreach f in array array['public.hg_uno_etat(text)'::regprocedure, 'public.hg_ndc_etat(text)'::regprocedure, 'public.hg_plat_etat(text)'::regprocedure] loop
    if pg_get_functiondef(f) !~ 'hg_salles__hote_vue' then
      perform public.hg__patch(f, $o$'maintenant', now(),$o$,
        $n$'maintenant', now(), 'hote_passe', hg_salles__hote_vue(p.statut, p.hote, p.etat),$n$);
    end if;
  end loop;

  f := 'public.hg_lg_etat(text)'::regprocedure;
  if pg_get_functiondef(f) !~ 'hg_salles__hote_vue' then
    -- L'ancien meneur n'est pas joueur : il reçoit la réponse courte, celle de l'écran « Rejoindre ». Un autre visiteur n'a pas ce message.
    perform public.hg__patch(f, $o$'joueurs', (select count(*) from hg_lg_joueurs where partie = p.id)), 'moi', null);$o$,
      $n$'joueurs', (select count(*) from hg_lg_joueurs where partie = p.id)), 'moi', null,
        'hote_passe', case when p.etat->'hote_passe'->>'ancien' = auth.uid()::text then hg_salles__hote_vue(p.statut, p.hote, p.etat) end);$n$);
    perform public.hg__patch(f, $o$'joueurs', coalesce(v_joueurs, '[]'::jsonb),$o$,
      $n$'joueurs', coalesce(v_joueurs, '[]'::jsonb),
    'hote_passe', hg_salles__hote_vue(p.statut, p.hote, p.etat),
    'meneur_parti', p.mode = 'mj' and p.statut in ('revelation', 'en_cours') and hg_salles__absent(p.hote, p.started_at),$n$);
  end if;

  -- Départ volontaire de l'hôte : le transfert noté n'a plus lieu d'être. Le Loup-Garou n'est pas concerné, son hôte qui part annule la salle.
  foreach v_jeu in array array['uno', 'ndc', 'plat'] loop
    f := format('public.hg_%s_quitter(text)', v_jeu)::regprocedure;
    if pg_get_functiondef(f) !~ 'hote_passe' then
      perform public.hg__patch(f, format($o$update hg_%s_parties set hote = v_nouvel where id = p.id;$o$, v_jeu),
        format($n$update hg_%s_parties set hote = v_nouvel, etat = etat - 'hote_passe' where id = p.id;$n$, v_jeu));
    end if;
  end loop;

  -- Revanche Uno : mêmes droits qu'aux plateaux et à Nom de code, celui qui la lance en est l'hôte.
  f := 'public.hg_uno_rejouer(text)'::regprocedure;
  if pg_get_functiondef(f) ~ 'Seul l''''hôte' then
    perform public.hg__patch(f, $o$if p.hote <> auth.uid() then raise exception 'Seul l''hôte peut lancer la revanche.'; end if;$o$,
      $n$if not hg_uno_dans(p.id) or exists (select 1 from hg_uno_invites where user_id = auth.uid()) then
    raise exception 'Seul un membre de la partie peut lancer la revanche.';
  end if;$n$);
    perform public.hg__patch(f, $o$values (v_code, p.nom, p.hote, p.visibilite,$o$, $n$values (v_code, p.nom, auth.uid(), p.visibilite,$n$);
  end if;
end $m$;
