-- ===== Humane Gang — migration 182 : Paillettes et Raclette paient chaque prise =====
-- Demande d'Ethan (31.10.2026) : dans ces deux jeux d'arcade, chaque paillette ou tranche de fromage attrapée donne
-- 1 Paillette au joueur (le score de la partie compte exactement les prises). Plafond commun aux deux jeux :
-- hg_eco_cap('arcade_prises_jour', 1500) par jour. Ce gain s'ajoute à la récompense quotidienne de l'arcade, qui ne change pas.
-- Une partie refusée (score impossible, expirée) ne paie rien. hg_arcade_finish renvoie prises : les Paillettes versées.
-- Aucune donnée modifiée. Rejouable : le remplacement ne se fait que s'il n'a pas déjà eu lieu.

do $do$
begin
  if pg_get_functiondef('public.hg_arcade_finish(uuid, integer)'::regprocedure) not like '%arcade_prises%' then
    perform public.hg__patch('public.hg_arcade_finish(uuid, integer)'::regprocedure,
      $o$gain int := 0; wk date; old int; paid boolean := false;$o$,
      $n$gain int := 0; wk date; old int; paid boolean := false; prises int := 0;$n$);
    perform public.hg__patch('public.hg_arcade_finish(uuid, integer)'::regprocedure,
      $o$  update hg_arcade_runs set finished_at = now(), score = p_score, rewarded = case when paid then gain else 0 end where id = r.id;$o$,
      $n$  -- Paillettes et Raclette : 1 Paillette par prise, dans la limite du plafond du jour.
  if r.game in ('paillettes', 'raclette') and p_score >= 1 then
    prises := greatest(0, least(p_score, hg_eco_cap('arcade_prises_jour', 1500) - coalesce((select sum(delta) from hg_wallet_log
      where user_id = me and reason = 'arcade_prises' and created_at >= hg_eco_day_start()), 0)));
    if prises > 0 and not hg_wallet_add(me, prises, 'arcade_prises', 'arcade_prises:' || r.id::text) then prises := 0; end if;
  end if;
  update hg_arcade_runs set finished_at = now(), score = p_score, rewarded = case when paid then gain else 0 end where id = r.id;$n$);
    perform public.hg__patch('public.hg_arcade_finish(uuid, integer)'::regprocedure,
      $o$'reward', case when paid then gain else 0 end,
    'new_best'$o$,
      $n$'reward', case when paid then gain else 0 end, 'prises', prises,
    'new_best'$n$);
  end if;
end $do$;
