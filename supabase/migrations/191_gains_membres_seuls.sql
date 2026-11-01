-- ===== Humane Gang — migration 191 : seules les parties entre membres paient =====
-- Avant : un membre créait une partie, un invité anonyme rejoignait puis partait, et le membre touchait Paillettes et badges,
-- car invités et robots comptaient comme joueurs. Règle (Paillettes et badges) : au moins 2 membres à la table, ni invités,
-- ni robots, ni comptes fantômes. Un membre parti en cours de partie compte : il s'est assis, et la partie reste payée à ceux qui
-- restent. La partie reste jouable : seul le paiement s'arrête, et les fins lisent paillettes = 0.
-- Uno : il faut en plus une manche finie (une main vidée, ligne « manche » de hg_uno_coups, comme hg_duel_manches pour les duels) et
-- 3 minutes de jeu (la durée de hg_plat__terminer : les duels n'ont pas de durée minimale). Le bonus par adversaire et le badge
-- « grande table » comptent les membres seulement.
-- Plateaux : v_n compte désormais les membres ; le seuil de 2 et les 3 minutes ne bougent pas. Blackjack seul ne payait déjà rien
-- (un joueur : v_n < 2) et ne change pas. Le badge d'hôtel de Monopoly, donné en cours de partie, suit la même règle.
-- Nom de code et Loup-Garou : le minimum réglable reste un nombre de joueurs, la règle des 2 membres s'y ajoute.
-- Duels : contre un invité il n'y avait pas de Paillettes mais les badges passaient. La fonction s'arrête désormais avant la boucle.
-- Le badge duel_robot reste : il récompense une victoire contre le robot difficile, sans Paillettes.
-- Aucune donnée modifiée : les gains passés restent acquis.

do $do$
begin
  -- Une migration relancée ne repasse pas ici : hg__patch refuse un texte déjà remplacé.
  if pg_get_functiondef('public.hg_uno__terminer(uuid, uuid, boolean)'::regprocedure) not like '%Migration 191%' then
    perform public.hg__patch('public.hg_uno__terminer(uuid, uuid, boolean)'::regprocedure,
      $o$v_n int; v_off jsonb;$o$,
      $n$v_n int; v_off jsonb; v_membres int;$n$);
    perform public.hg__patch('public.hg_uno__terminer(uuid, uuid, boolean)'::regprocedure,
      $o$if p_annulee or p_vainqueur is null or v_n < v_min then return; end if;$o$,
      $n$-- Migration 191 : 2 membres au moins, une manche finie et 3 minutes de jeu.
  select count(*) into v_membres from hg_uno_joueurs x join hg_profiles pr on pr.id = x.user_id
    where x.partie = p_id and not x.invite and not pr.is_ghost;
  if p_annulee or p_vainqueur is null or v_n < v_min or v_membres < 2 or p.started_at is null or now() - p.started_at < interval '3 minutes'
     or not exists (select 1 from hg_uno_coups c where c.partie = p_id and c.type = 'manche') then return; end if;$n$);
    perform public.hg__patch('public.hg_uno__terminer(uuid, uuid, boolean)'::regprocedure,
      $o$greatest(0, v_n - 3)$o$,
      $n$greatest(0, v_membres - 3)$n$);
    perform public.hg__patch('public.hg_uno__terminer(uuid, uuid, boolean)'::regprocedure,
      $o$if r.gagne and v_n >= 10 and$o$,
      $n$if r.gagne and v_membres >= 10 and$n$);
  end if;

  if pg_get_functiondef('public.hg_ndc__terminer(uuid, text, text, boolean)'::regprocedure) not like '%Migration 191%' then
    perform public.hg__patch('public.hg_ndc__terminer(uuid, text, text, boolean)'::regprocedure,
      $o$if p_annulee or p_equipe is null or v_n < v_min then return; end if;$o$,
      $n$if p_annulee or p_equipe is null or v_n < v_min then return; end if;
-- Migration 191 : 2 membres au moins dans les équipes.
if (select count(*) from hg_ndc_joueurs x join hg_profiles pr on pr.id = x.user_id
    where x.partie = p_id and x.equipe is not null and not x.invite and not pr.is_ghost) < 2 then return; end if;$n$);
  end if;

  if pg_get_functiondef('public.hg_plat__terminer(uuid, uuid[], text, boolean)'::regprocedure) not like '%Migration 191%' then
    perform public.hg__patch('public.hg_plat__terminer(uuid, uuid[], text, boolean)'::regprocedure,
      $o$select count(*) into v_n from hg_plat_joueurs where partie = p_id;$o$,
      $n$-- Migration 191 : seuls les membres comptent pour le paiement.
  select count(*) into v_n from hg_plat_joueurs x join hg_profiles pr on pr.id = x.user_id
    where x.partie = p_id and not x.invite and not pr.is_ghost;$n$);
  end if;

  if pg_get_functiondef('public.hg_plat__monopoly_agir(uuid, uuid, text, jsonb)'::regprocedure) not like '%Migration 191%' then
    perform public.hg__patch('public.hg_plat__monopoly_agir(uuid, uuid, text, jsonb)'::regprocedure,
      $o$if v_m = 4 then perform hg_plat__badge(p_u, 'plat_monopoly_hotel'); end if;$o$,
      $n$-- Migration 191 : badge réservé aux parties entre 2 membres au moins.
      if v_m = 4 and (select count(*) from hg_plat_joueurs x join hg_profiles pr on pr.id = x.user_id
          where x.partie = p_id and not x.invite and not pr.is_ghost) >= 2 then perform hg_plat__badge(p_u, 'plat_monopoly_hotel'); end if;$n$);
  end if;

  if pg_get_functiondef('public.hg_lg__terminer(uuid, text)'::regprocedure) not like '%Migration 191%' then
    perform public.hg__patch('public.hg_lg__terminer(uuid, text)'::regprocedure,
      $o$if p_vainqueur = 'annulee' or p.nb_joueurs < v_min then return; end if;$o$,
      $n$if p_vainqueur = 'annulee' or p.nb_joueurs < v_min then return; end if;
  -- Migration 191 : 2 membres au moins parmi ceux qui ont reçu un rôle.
  if (select count(*) from hg_lg_joueurs x join hg_lg_cartes k using (partie, user_id) join hg_profiles pr on pr.id = x.user_id
      where x.partie = p_id and not x.invite and not pr.is_ghost) < 2 then return; end if;$n$);
  end if;

  if pg_get_functiondef('public.hg_duel__terminer(uuid, uuid, boolean)'::regprocedure) not like '%Migration 191%' then
    perform public.hg__patch('public.hg_duel__terminer(uuid, uuid, boolean)'::regprocedure,
      $o$if not exists (select 1 from hg_duel_manches m where m.partie = p_id) then return; end if;$o$,
      $n$if not exists (select 1 from hg_duel_manches m where m.partie = p_id) then return; end if;
-- Migration 191 : deux membres, sinon ni Paillettes ni badges.
if (select count(*) from hg_duel_joueurs x join hg_profiles pr on pr.id = x.user_id
    where x.partie = p_id and not x.invite and not x.robot and not pr.is_ghost) < 2 then return; end if;$n$);
  end if;
end $do$;
