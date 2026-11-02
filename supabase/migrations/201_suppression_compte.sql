-- 201 : la suppression d'un compte n'est plus bloquée par ses notifications, sa présence ni ses résultats de jeux.
-- Ces quatre tables référençaient hg_profiles sans règle ON DELETE : hg_delete_my_account (migration 113) échouait
-- dès qu'une de leurs lignes existait. Les lignes du membre partent désormais avec son profil.
do $$
declare
  t text;
begin
  foreach t in array array['hg_site_notifs', 'hg_presence', 'hg_jeux_resultats', 'hg_jeux_bonus'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_user_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (user_id) references public.hg_profiles(id) on update cascade on delete cascade', t, t || '_user_id_fkey');
  end loop;
end $$;
