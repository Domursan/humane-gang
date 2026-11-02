-- ===== Humane Gang — migration 211 : Uno, un robot tient la place d'un joueur parti =====
-- Avant : partir en cours de partie (bouton Quitter, ou 3 tours manqués) excluait le joueur : ses cartes repartaient sous la
-- pioche, sans retour (hg_uno__exclure_en_jeu). Désormais le joueur garde sa place et sa main : le robot de hg_uno__auto joue
-- pour lui, sans attendre la fin du chrono (3 secondes, pour que la table voie le coup), et le joueur reprend sa main s'il
-- revient avant la fin (hg_uno_reprendre). Règles (idée 6, validée le 02.11.2026) :
--   - une place tenue par le robot à la fin ne reçoit rien : ni participation, ni victoire, ni badge, ni statistique ;
--   - si le robot vide la main, la partie se termine normalement pour les autres (participation), mais la victoire n'est donnée à personne ;
--   - celui qui revient reçoit les Paillettes normales s'il a joué lui-même au moins la moitié de ses tours (colonnes tours et
--     tours_robot), sinon seulement la participation, sans badge ;
--   - 3 tours manqués : le robot prend la place, comme pour un départ ;
--   - une partie ne continue pas avec un seul humain : elle se termine comme avant (le dernier présent gagne).
-- hg_uno__exclure_en_jeu reste définie mais n'est plus appelée. Les invités partent de la même façon (leur jeton est oublié par
-- le site : ils ne reviennent pas). Les plateaux (Blackjack d'abord) suivront dans une autre migration.
-- Fonctions réécrites depuis leur dernière version en ligne (121, 171, 191, 199) : hg_uno__donner_tour, hg_uno__auto,
-- hg_uno__ma_partie, hg_uno_quitter, hg_uno__terminer, hg_uno_mes_parties, hg_uno_stats ; retouchées par hg__patch (141) :
-- hg_uno_etat, hg_uno_invite, hg_jeux_mes_parties (197, si elle existe). Rejouable.

/* =====================================================================
   1. Colonnes
   ===================================================================== */
alter table public.hg_uno_joueurs add column if not exists parti boolean not null default false;      -- un robot tient la place
alter table public.hg_uno_joueurs add column if not exists parti_at timestamptz;                        -- depuis quand
alter table public.hg_uno_joueurs add column if not exists tours int not null default 0;               -- tours reçus dans la partie
alter table public.hg_uno_joueurs add column if not exists tours_robot int not null default 0;         -- dont joués par le robot

/* =====================================================================
   2. Moteur
   ===================================================================== */

-- Donne le tour à un joueur (chrono relancé) ; 3 secondes seulement quand un robot tient sa place. Compte le tour reçu.
create or replace function public.hg_uno__donner_tour(p_id uuid, p_user uuid)
returns void language sql security definer set search_path = public as $$
  update hg_uno_parties set tour = p_user, a_pioche = false, pioche_carte = null,
    tour_fin = now() + make_interval(secs => case when exists (select 1 from hg_uno_joueurs where partie = p_id and user_id = p_user and parti)
      then least(t_tour, 3) else t_tour end)
  where id = p_id;
  update hg_uno_joueurs set tours = tours + 1 where partie = p_id and user_id = p_user;
$$;

-- Un joueur part (départ volontaire ou 3 tours manqués) : il garde sa place et sa main, le robot joue pour lui.
-- Avec un seul humain restant, la partie se termine : il gagne, comme avant (hg_uno__terminer décide des Paillettes).
create or replace function public.hg_uno__partir(p_id uuid, p_user uuid, p_texte text)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; v_dernier uuid;
begin
  select * into p from hg_uno_parties where id = p_id;
  update hg_uno_joueurs set parti = true, parti_at = now() where partie = p_id and user_id = p_user and not parti and not exclu;
  if not found then return; end if;
  perform hg_uno__log(p_id, p_user, 'info', p_texte);
  if (select count(*) from hg_uno_joueurs where partie = p_id and not exclu and not parti) <= 1 then
    select user_id into v_dernier from hg_uno_joueurs where partie = p_id and not exclu and not parti limit 1;
    perform hg_uno__terminer(p_id, v_dernier);
    return;
  end if;
  -- C'était son tour : le robot joue dans 3 secondes au plus.
  if p.tour = p_user then
    update hg_uno_parties set tour_fin = least(tour_fin, now() + interval '3 seconds') where id = p_id;
  end if;
end $$;

-- Le robot joue pour le joueur dont le chrono est écoulé. Joueur présent : 3 tours manqués d'affilée, le robot prend sa place
-- (plus d'exclusion) et joue ce tour tout de suite. Place déjà tenue par le robot : il joue sans compter de tour manqué ni l'annoncer.
create or replace function public.hg_uno__auto(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; u uuid; c hg_uno_cartes; v_coul text; v_cible uuid; v_manques int; v_parti boolean;
begin
  select * into p from hg_uno_parties where id = p_id for update;
  if p.statut <> 'en_cours' or p.tour is null then return; end if;
  u := p.tour;
  select parti into v_parti from hg_uno_joueurs where partie = p_id and user_id = u;
  if not v_parti then
    update hg_uno_joueurs set manques = manques + 1 where partie = p_id and user_id = u returning manques into v_manques;
    if v_manques >= 3 then
      perform hg_uno__partir(p_id, u, hg_uno__nom(p_id, u) || ' a manqué 3 tours : un robot joue sa main jusqu''à son retour.');
      select * into p from hg_uno_parties where id = p_id;
      if p.statut <> 'en_cours' or p.tour <> u then perform hg_uno__bump(p_id); return; end if;
      v_parti := true;
    else
      perform hg_uno__log(p_id, u, 'auto', 'Temps écoulé : le jeu joue pour ' || hg_uno__nom(p_id, u) || '.');
    end if;
  end if;
  update hg_uno_joueurs set tours_robot = tours_robot + 1 where partie = p_id and user_id = u;
  if p.defi is not null and (p.defi->>'cible')::uuid = u then
    perform hg_uno__repondre_defi(p_id, false);
  elsif p.cumul > 0 then
    perform hg_uno__piocher(p_id, u);
  else
    if p.a_pioche then
      select * into c from hg_uno_cartes where id = p.pioche_carte;
    else
      select * into c from hg_uno_cartes x where x.partie = p_id and x.lieu = 'main' and x.user_id = u and hg_uno__jouable(p, x)
        order by (x.couleur = 'k'), random() limit 1;
      if not found then
        if hg_uno__piocher(p_id, u) then
          select * into p from hg_uno_parties where id = p_id;
          select * into c from hg_uno_cartes where id = p.pioche_carte;
        else
          c := null;
        end if;
      end if;
    end if;
    if c.id is not null then
      select couleur into v_coul from hg_uno_cartes where partie = p_id and lieu = 'main' and user_id = u and couleur <> 'k' and id <> c.id
        group by couleur order by count(*) desc, random() limit 1;
      select user_id into v_cible from hg_uno_joueurs where partie = p_id and not exclu and user_id <> u order by nb_cartes, random() limit 1;
      perform hg_uno__poser(p_id, u, c.id, coalesce(v_coul, 'r'), v_cible);
    elsif (select tour from hg_uno_parties where id = p_id) = u then
      perform hg_uno__donner_tour(p_id, hg_uno__suivant(p_id, u, 1));
    end if;
  end if;
  -- Le robot n'efface pas le compteur de tours manqués d'un joueur présent mais lent (une place tenue par le robot n'en a plus besoin).
  if not v_parti then update hg_uno_joueurs set manques = v_manques where partie = p_id and user_id = u; end if;
  perform hg_uno__bump(p_id);
end $$;

-- Partie en cours où je joue (verrouillée), sinon erreur. Place tenue par le robot : il faut d'abord la reprendre.
create or replace function public.hg_uno__ma_partie(p_code text)
returns public.hg_uno_parties language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; j hg_uno_joueurs;
begin
  p := hg_uno__partie(p_code, true);
  if not hg_uno_dans(p.id) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  if p.statut <> 'en_cours' then raise exception 'La partie n''est pas en cours.'; end if;
  select * into j from hg_uno_joueurs where partie = p.id and user_id = auth.uid();
  if j.exclu then raise exception 'Tu as quitté la table.'; end if;
  if j.parti then raise exception 'Un robot joue ta main : reprends d''abord ta place.'; end if;
  -- Un tour expiré est d'abord joué par le robot.
  if p.tour_fin is not null and now() >= p.tour_fin then
    perform hg_uno__essayer(p.id);
    select * into p from hg_uno_parties where id = p.id;
    if p.statut <> 'en_cours' then raise exception 'La partie est terminée.'; end if;
  end if;
  return p;
end $$;

/* =====================================================================
   3. Partir, revenir
   ===================================================================== */

-- Salle d'attente : comme avant (l'hôte passe au premier membre, migration 199). En cours : le robot prend la place.
create or replace function public.hg_uno_quitter(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; v_nouvel uuid;
begin
  p := hg_uno__partie(p_code, true);
  if not hg_uno_dans(p.id) then return; end if;
  if p.statut = 'attente' then
    delete from hg_uno_joueurs where partie = p.id and user_id = auth.uid();
    perform hg_uno__log(p.id, auth.uid(), 'info', 'Un joueur quitte la salle.');
    if p.hote = auth.uid() then
      select user_id into v_nouvel from hg_uno_joueurs where partie = p.id and not invite order by place limit 1;
      if v_nouvel is null then
        update hg_uno_parties set statut = 'annulee' where id = p.id;
      else
        update hg_uno_parties set hote = v_nouvel, etat = etat - 'hote_passe' where id = p.id;
        update hg_uno_joueurs set pret = true where partie = p.id and user_id = v_nouvel;
        perform hg_uno__log(p.id, v_nouvel, 'info', hg_uno__nom(p.id, v_nouvel) || ' devient l''hôte.');
      end if;
    end if;
  elsif p.statut = 'en_cours' then
    perform hg_uno__partir(p.id, auth.uid(), hg_uno__nom(p.id, auth.uid()) || ' quitte la table : un robot joue à sa place jusqu''à son retour.');
  end if;
  perform hg_uno__bump(p.id);
end $$;

-- Le joueur parti reprend sa main. Renvoie ce que le robot a fait pendant son absence ({ tours, resume }), null si rien à reprendre.
-- resume : « posé Jaune 9 et pioché une carte », lu dans le journal (lignes jouer et pioche depuis parti_at), 6 coups au plus.
create or replace function public.hg_uno_reprendre(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; j hg_uno_joueurs; r record; v_nom text; v_frags text[] := '{}'; v_n int := 0; v_resume text; v_tours int;
begin
  p := hg_uno__partie(p_code, true);
  if not hg_uno_dans(p.id) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  select * into j from hg_uno_joueurs where partie = p.id and user_id = auth.uid();
  if p.statut <> 'en_cours' or not j.parti then return null; end if;
  v_nom := hg_uno__nom(p.id, j.user_id);
  for r in select type, texte from hg_uno_coups where partie = p.id and user_id = j.user_id and created_at >= j.parti_at
           and type in ('jouer', 'pioche') order by id loop
    v_n := v_n + 1;
    if v_n <= 6 then
      v_frags := v_frags || case when r.type = 'jouer'
        then 'posé ' || replace(rtrim(substr(r.texte, length(v_nom) + 7), '.'), 'choisit', 'choisi')
        else 'pioché ' || replace(rtrim(substr(r.texte, length(v_nom) + 9), '.'), ' et passe son tour', '') end;
    end if;
  end loop;
  v_resume := case when v_n = 0 then null
    when v_n > 6 then 'joué ' || v_n || ' tours pour toi'
    when v_n = 1 then v_frags[1]
    else array_to_string(v_frags[1:v_n - 1], ', ') || ' et ' || v_frags[v_n] end;
  select count(*) into v_tours from hg_uno_coups where partie = p.id and user_id = j.user_id and created_at >= j.parti_at and type = 'jouer';
  update hg_uno_joueurs set parti = false, parti_at = null, manques = 0 where partie = p.id and user_id = j.user_id;
  -- C'est son tour : il retrouve un chrono entier.
  update hg_uno_parties set tour_fin = now() + make_interval(secs => t_tour) where id = p.id and tour = j.user_id;
  perform hg_uno__log(p.id, j.user_id, 'info', v_nom || ' reprend sa place.');
  perform hg_uno__bump(p.id);
  return jsonb_build_object('tours', v_n, 'resume', v_resume);
end $$;

/* =====================================================================
   4. Lectures : état, mes parties, statistiques
   ===================================================================== */

do $do$
declare f regprocedure;
begin
  -- hg_uno_etat (171, retouchée par 199) : parti, parti_at et tours_robot de chaque joueur ; moi.parti.
  f := 'public.hg_uno_etat(text)'::regprocedure;
  if pg_get_functiondef(f) !~ 'tours_robot' then
    perform public.hg__patch(f, $o$'exclu', j.exclu, 'points', j.points,$o$,
      $n$'exclu', j.exclu, 'parti', j.parti, 'parti_at', j.parti_at, 'tours_robot', j.tours_robot, 'points', j.points,$n$);
    perform public.hg__patch(f, $o$'invite', exists (select 1 from hg_uno_invites where user_id = v_moi), 'joue', v_joue),$o$,
      $n$'invite', exists (select 1 from hg_uno_invites where user_id = v_moi), 'joue', v_joue,
      'parti', coalesce((select parti from hg_uno_joueurs where partie = p.id and user_id = v_moi), false)),$n$);
  end if;

  -- hg_uno_invite (121) : un invité qui a manqué 3 tours reprend sa place depuis sa table.
  f := 'public.hg_uno_invite(text, text, text, jsonb)'::regprocedure;
  if pg_get_functiondef(f) !~ 'hg_uno_reprendre' then
    perform public.hg__patch(f, $o$when 'quitter' then perform hg_uno_quitter(p.code);$o$,
      $n$when 'quitter' then perform hg_uno_quitter(p.code);
    when 'reprendre' then v_out := hg_uno_reprendre(p.code);$n$);
  end if;

  -- hg_jeux_mes_parties (197, barre « Reprendre ma partie ») : robot_depuis sur la ligne Uno, et « À toi » seulement si je joue moi-même.
  f := to_regprocedure('public.hg_jeux_mes_parties()');
  if f is not null and pg_get_functiondef(f) !~ 'robot_depuis' then
    perform public.hg__patch(f, $o$'tour_pseudo', case when p.tour is null then null else hg_uno__nom(p.id, p.tour) end),
        coalesce(p.tour = v_moi, false), p.activite_at$o$,
      $n$'tour_pseudo', case when p.tour is null then null else hg_uno__nom(p.id, p.tour) end, 'robot_depuis', j.parti_at),
        coalesce(p.tour = v_moi and not j.parti, false), p.activite_at$n$);
  end if;
end $do$;

-- Mes parties (accueil du Uno) : robot_depuis quand un robot tient ma place ; « c'est ton tour » seulement si je joue moi-même.
create or replace function public.hg_uno_mes_parties()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not hg_uno_peut() then raise exception 'Accès réservé.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'nom', p.nom, 'statut', p.statut,
      'inscrits', (select count(*) from hg_uno_joueurs where partie = p.id and not exclu), 'mes_cartes', j.nb_cartes,
      'tour_pseudo', case when p.tour is null then null else hg_uno__nom(p.id, p.tour) end, 'mon_tour', p.tour = auth.uid() and not j.parti,
      'robot_depuis', j.parti_at)
      order by p.created_at desc)
    from hg_uno_parties p join hg_uno_joueurs j on j.partie = p.id and j.user_id = auth.uid()
    where p.statut in ('attente', 'en_cours') and not j.exclu), '[]'::jsonb);
end $$;

-- Statistiques : une partie finie avec un robot à ma place ne compte pas.
create or replace function public.hg_uno_stats(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_u uuid := coalesce(p_user, auth.uid()); r record; v_serie int := 0; v_best int := 0; v_cur int := 0; v_fini boolean := false;
  v_parties int; v_vict int;
begin
  if not hg_uno_peut() then raise exception 'Accès réservé.' using errcode = '42501'; end if;
  select count(*), count(*) filter (where j.gagne) into v_parties, v_vict
    from hg_uno_joueurs j join hg_uno_parties p on p.id = j.partie where j.user_id = v_u and p.statut = 'terminee' and not j.parti;
  for r in select j.gagne from hg_uno_joueurs j join hg_uno_parties p on p.id = j.partie
           where j.user_id = v_u and p.statut = 'terminee' and not j.parti order by p.ended_at desc loop
    if r.gagne then v_cur := v_cur + 1; if not v_fini then v_serie := v_serie + 1; end if;
    else v_cur := 0; v_fini := true; end if;
    v_best := greatest(v_best, v_cur);
  end loop;
  return jsonb_build_object(
    'parties', v_parties, 'victoires', v_vict,
    'taux', case when v_parties > 0 then round(100.0 * v_vict / v_parties) else 0 end,
    'serie', v_serie, 'meilleure_serie', v_best,
    'cartes_jouees', (select coalesce(sum(j.cartes_jouees), 0) from hg_uno_joueurs j join hg_uno_parties p on p.id = j.partie
                      where j.user_id = v_u and p.statut = 'terminee' and not j.parti),
    'oublis_uno', (select coalesce(sum(j.oublis_uno), 0) from hg_uno_joueurs j join hg_uno_parties p on p.id = j.partie
                   where j.user_id = v_u and p.statut = 'terminee' and not j.parti),
    'defis_gagnes', (select coalesce(sum(j.defis_gagnes), 0) from hg_uno_joueurs j join hg_uno_parties p on p.id = j.partie
                     where j.user_id = v_u and p.statut = 'terminee' and not j.parti),
    'badges', coalesce((select jsonb_agg(jsonb_build_object('code', b.code, 'nom', b.name, 'description', b.description,
        'obtenu', ub.user_id is not null, 'date', ub.awarded_at) order by b.sort)
      from hg_badges b left join hg_user_badges ub on ub.badge_code = b.code and ub.user_id = v_u where b.code like 'uno\_%'), '[]'::jsonb),
    'dernieres', coalesce((select jsonb_agg(x order by (x->>'date') desc) from (
        select jsonb_build_object('code', p.code, 'date', p.ended_at,
          'joueurs', (select count(*) from hg_uno_joueurs j2 where j2.partie = p.id), 'rang', j.rang, 'paillettes', j.paillettes) x
        from hg_uno_joueurs j join hg_uno_parties p on p.id = j.partie
        where j.user_id = v_u and p.statut = 'terminee' and not j.parti order by p.ended_at desc limit 5) s), '[]'::jsonb)
  );
end $$;

/* =====================================================================
   5. Fin de partie et Paillettes
   ===================================================================== */

-- Reprise de la version en ligne (121 + Migration 191), plus : une place tenue par le robot ne gagne rien (ni victoire, ni
-- Paillettes, ni badge) ; si le robot a vidé la main, personne ne gagne ; un joueur revenu qui a laissé le robot jouer plus de
-- la moitié de ses tours garde la participation seulement, sans badge.
create or replace function public.hg_uno__terminer(p_id uuid, p_vainqueur uuid, p_annulee boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; cfg jsonb; pts jsonb; r record; v_gain int; v_jour int; v_plafond int; v_min int; v_n int; v_off jsonb; v_membres int;
  v_robot boolean; v_moitie boolean;
begin
  select * into p from hg_uno_parties where id = p_id for update;
  if p.statut in ('terminee', 'annulee') then return; end if;
  cfg := coalesce((select value from hg_settings where key = 'uno'), '{}'::jsonb);
  pts := coalesce(cfg->'paillettes', '{}'::jsonb);
  v_plafond := coalesce((cfg->>'plafond_jour')::int, 1000);
  v_min := coalesce((cfg->>'min_joueurs')::int, 2);
  v_off := coalesce(cfg->'badges_inactifs', '[]'::jsonb);
  select count(*) into v_n from hg_uno_joueurs where partie = p_id;
  -- Migration 211 : le vainqueur est une place tenue par le robot.
  v_robot := p_vainqueur is not null and exists (select 1 from hg_uno_joueurs where partie = p_id and user_id = p_vainqueur and parti);

  -- Points restant en main (pour l'affichage et le classement d'une manche simple)
  update hg_uno_joueurs j set main_points = coalesce((select sum(hg_uno__points(c.valeur)) from hg_uno_cartes c
    where c.partie = p_id and c.lieu = 'main' and c.user_id = j.user_id), 0) where j.partie = p_id;

  -- Classement : vainqueur premier ; puis (partie en points) le plus de points, ou (manche) le moins de points en main ; exclus derniers.
  with cl as (
    select user_id, row_number() over (order by (user_id = p_vainqueur) desc, exclu,
      case when p.mode = 'points' then -points else main_points end, nb_cartes, place) rn
    from hg_uno_joueurs where partie = p_id)
  update hg_uno_joueurs j set rang = cl.rn, gagne = (j.user_id = p_vainqueur and not j.parti) from cl where j.partie = p_id and j.user_id = cl.user_id;

  update hg_uno_parties set statut = case when p_annulee then 'annulee' else 'terminee' end, vainqueur = p_vainqueur,
    tour = null, tour_fin = null, ended_at = now(), version = version + 1 where id = p_id;
  perform hg_uno__log(p_id, p_vainqueur, 'fin', case when p_annulee then 'La partie a été arrêtée.'
    when v_robot then 'Le robot a vidé la main de ' || hg_uno__nom(p_id, p_vainqueur) || ' : personne ne gagne.'
    else hg_uno__nom(p_id, p_vainqueur) || ' gagne la partie !' end);

  -- Migration 191 : 2 membres au moins, une manche finie et 3 minutes de jeu.
  select count(*) into v_membres from hg_uno_joueurs x join hg_profiles pr on pr.id = x.user_id
    where x.partie = p_id and not x.invite and not pr.is_ghost;
  if p_annulee or p_vainqueur is null or v_n < v_min or v_membres < 2 or p.started_at is null or now() - p.started_at < interval '3 minutes'
     or not exists (select 1 from hg_uno_coups c where c.partie = p_id and c.type = 'manche') then return; end if;

  -- Migration 211 : une place tenue par le robot à la fin ne reçoit rien.
  for r in select x.* from hg_uno_joueurs x where x.partie = p_id and not x.invite and not x.exclu and not x.parti
           and exists (select 1 from hg_profiles pr where pr.id = x.user_id and not pr.is_ghost) loop
    -- Au moins la moitié de ses tours joués par lui-même, sinon participation seulement.
    v_moitie := r.tours_robot * 2 <= r.tours;
    v_gain := coalesce((pts->>'partie')::int, 50)
      + case when r.gagne and v_moitie then coalesce((pts->>'victoire')::int, 150) + greatest(0, v_membres - 3) * coalesce((pts->>'bonus_adversaire')::int, 10) else 0 end;
    select coalesce(sum(delta), 0) into v_jour from hg_wallet_log
      where user_id = r.user_id and reason = 'uno' and created_at >= date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
    v_gain := greatest(0, least(v_gain, v_plafond - v_jour));
    if v_gain > 0 and hg_wallet_add(r.user_id, v_gain, 'uno', 'uno:' || p_id || ':' || r.user_id) then
      update hg_uno_joueurs set paillettes = v_gain where partie = p_id and user_id = r.user_id;
    end if;
    if not v_moitie then continue; end if;

    if r.gagne and not v_off ? 'uno_premiere_victoire' then
      insert into hg_user_badges(user_id, badge_code) values (r.user_id, 'uno_premiere_victoire') on conflict do nothing;
    end if;
    if r.max_cartes >= 20 and not v_off ? 'uno_main_pleine' then
      insert into hg_user_badges(user_id, badge_code) values (r.user_id, 'uno_main_pleine') on conflict do nothing;
    end if;
    if r.defis_gagnes > 0 and not v_off ? 'uno_arroseur_arrose' then
      insert into hg_user_badges(user_id, badge_code) values (r.user_id, 'uno_arroseur_arrose') on conflict do nothing;
    end if;
    if r.gagne and v_membres >= 10 and not v_off ? 'uno_grande_table' then
      insert into hg_user_badges(user_id, badge_code) values (r.user_id, 'uno_grande_table') on conflict do nothing;
    end if;
    if not v_off ? 'uno_jamais_sans' and (select count(*) from hg_uno_joueurs x2 join hg_uno_parties p2 on p2.id = x2.partie
        where x2.user_id = r.user_id and p2.statut = 'terminee' and not x2.exclu and not x2.parti and x2.oublis_uno = 0) >= 20 then
      insert into hg_user_badges(user_id, badge_code) values (r.user_id, 'uno_jamais_sans') on conflict do nothing;
    end if;
    if not v_off ? 'uno_habitue' and (select count(*) from hg_uno_joueurs x3 join hg_uno_parties p3 on p3.id = x3.partie
        where x3.user_id = r.user_id and p3.statut = 'terminee' and not x3.parti) >= 50 then
      insert into hg_user_badges(user_id, badge_code) values (r.user_id, 'uno_habitue') on conflict do nothing;
    end if;
  end loop;
end $$;

/* =====================================================================
   6. Droits
   ===================================================================== */
revoke all on function public.hg_uno__donner_tour(uuid, uuid), public.hg_uno__partir(uuid, uuid, text), public.hg_uno__auto(uuid),
  public.hg_uno__ma_partie(text), public.hg_uno__terminer(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.hg_uno_quitter(text), public.hg_uno_reprendre(text), public.hg_uno_mes_parties(), public.hg_uno_stats(uuid)
  from public, anon;
grant execute on function public.hg_uno_quitter(text), public.hg_uno_reprendre(text), public.hg_uno_mes_parties(), public.hg_uno_stats(uuid)
  to authenticated;
