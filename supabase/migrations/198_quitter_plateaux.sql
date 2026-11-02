-- ===== Humane Gang — migration 198 : quitter une partie de plateau est définitif =====
-- Avant : hg_plat_agir remettait parti = false dès que le joueur parti envoyait une action, alors que l'interface et le chat
-- annoncent le contraire. Désormais l'action est refusée : le jeu continue de jouer pour lui jusqu'à la fin et il ne reçoit pas
-- de Paillettes (hg_plat__terminer écarte les joueurs partis).
-- Seul changement par rapport à la version de la 125 (identique en production) : le refus remplace la remise à zéro. Les droits
-- de la fonction ne bougent pas (create or replace les conserve), l'appel par les invités passe toujours par hg_plat_invite.
-- hg_plat_quitter : un joueur déjà parti ne repart pas (sans cette garde : une ligne de journal de plus et humain_at remis à maintenant,
-- donc une table sans personne qui se croit encore occupée). Seul changement par rapport à la production ; même remarque pour les droits.

create or replace function public.hg_plat_agir(p_code text, p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p hg_plat_parties; v jsonb;
begin
  p := hg_plat__partie(p_code, true);
  if not hg_plat_dans(p.id) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  if p.statut <> 'en_cours' then raise exception 'La partie n''est pas en cours.'; end if;
  if (select parti from hg_plat_joueurs where partie = p.id and user_id = auth.uid()) then
    raise exception 'Tu as quitté cette partie.';
  end if;
  if (select elimine from hg_plat_joueurs where partie = p.id and user_id = auth.uid()) and p_action not in ('montrer', 'rien') then
    raise exception 'Tu es éliminé de cette partie.';
  end if;
  if p.tour_fin is not null and now() >= p.tour_fin then
    perform hg_plat__echeances(p.id);
    select * into p from hg_plat_parties where id = p.id;
    if p.statut <> 'en_cours' then raise exception 'La partie est terminée.'; end if;
  end if;
  if coalesce(trim(p_action), '') !~ '^[a-z_]{2,30}$' then raise exception 'Action inconnue.'; end if;
  execute format('select public.hg_plat__%s_agir($1, $2, $3, $4)', p.jeu) into v using p.id, auth.uid(), p_action, coalesce(p_args, '{}'::jsonb);
  perform hg_plat__present(p.id, auth.uid());
  perform hg_plat__bump(p.id);
  return v;
end $$;

create or replace function public.hg_plat_quitter(p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_plat_parties; v_nouvel uuid; v_restants int;
begin
  p := hg_plat__partie(p_code, true);
  if not hg_plat_dans(p.id) then return; end if;
  if exists (select 1 from hg_plat_joueurs where partie = p.id and user_id = auth.uid() and parti) then return; end if;
  if p.statut = 'attente' then
    delete from hg_plat_joueurs where partie = p.id and user_id = auth.uid();
    perform hg_plat__log(p.id, auth.uid(), 'info', 'Un joueur quitte la salle.');
    if p.hote = auth.uid() then
      select user_id into v_nouvel from hg_plat_joueurs where partie = p.id and not invite order by place limit 1;
      if v_nouvel is null then update hg_plat_parties set statut = 'annulee' where id = p.id;
      else
        update hg_plat_parties set hote = v_nouvel where id = p.id;
        update hg_plat_joueurs set pret = true where partie = p.id and user_id = v_nouvel;
        perform hg_plat__log(p.id, v_nouvel, 'info', hg_plat__nom(p.id, v_nouvel) || ' devient l''hôte.');
      end if;
    end if;
  elsif p.statut = 'en_cours' then
    update hg_plat_joueurs set parti = true, absent = true where partie = p.id and user_id = auth.uid();
    perform hg_plat__log(p.id, auth.uid(), 'info', hg_plat__nom(p.id, auth.uid()) || ' quitte la partie : le jeu jouera pour lui.');
    select count(*) into v_restants from hg_plat_joueurs where partie = p.id and not parti and not elimine;
    if v_restants = 0 then perform hg_plat__terminer(p.id, null, 'abandon', true);
    elsif p.tour = auth.uid() then update hg_plat_parties set tour_fin = least(tour_fin, now() + interval '5 seconds') where id = p.id;
    end if;
  end if;
  perform hg_plat__bump(p.id);
end $$;
