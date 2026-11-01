-- Purge de nuit : hg_housekeeping(), lancée par pg_cron à 3 h 37 UTC (Supabase plan gratuit, 500 Mo).
--
-- 1. cron.job_run_details : pg_cron n'y fait jamais de ménage (environ 1,5 Mo par jour). Garde 3 jours.
-- 2. Journaux de coups des parties terminées depuis plus de 30 jours : hg_plat_coups, hg_uno_coups, hg_duel_coups, hg_ndc_coups.
--
-- Qui lit ces tables (migrations et pg_proc de la base réelle) :
-- - hg_*_etat : les 15 à 25 dernières lignes, pour le journal de la table. Les écrans de fin de ces jeux ne l'affichent pas :
--   une vieille partie rouverte par son code garde son résultat, sans journal.
-- - hg_plat__shadow_badges et hg_duel__terminer : badges calculés à la fin de la partie, sur cette seule partie.
-- Aucun classement, aucune statistique, aucune archive (hg-archive) ne les lit.
--
-- Ne sont PAS purgées :
-- - hg_lg_journal : le badge lg_grand_mechant (hg_lg__terminer, migration 119) compte les victimes de toutes les parties d'un
--   joueur, et l'écran de fin du Loup-Garou affiche la chronologie de la partie à partir de ce journal.
-- - hg_lg_actions et hg_lg_votes : hg_lg_etat les rend pour la fin de partie, avec le journal.
-- - les parties annulées : causeFin (duels/vues/fin-fx.js) retrouve dans le journal la raison d'un défi annulé.
--
-- Lots : une fonction appelée par pg_cron est une seule transaction. Chaque table est donc plafonnée à v_lot lignes par nuit :
-- un gros retard s'écoule sur plusieurs nuits sans longue transaction. Le plafond dépasse largement ce que pg_cron écrit par jour.
--
-- DELETE ne rend pas la place au système : l'espace libéré est réutilisé par les nouvelles lignes, la base cesse de grossir.
-- Rejouable : remplace la fonction et replanifie la tâche.
create or replace function public.hg_housekeeping()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot constant int := 50000;
  v_bilan jsonb := '{}'::jsonb;
  v_n bigint;
  t record;
begin
  if to_regclass('cron.job_run_details') is not null then
    -- end_time reste vide si le serveur a redémarré pendant la tâche : on se rabat sur start_time.
    delete from cron.job_run_details where runid in (
      select runid from cron.job_run_details where coalesce(end_time, start_time) < now() - interval '3 days' limit v_lot);
    get diagnostics v_n = row_count;
    v_bilan := v_bilan || jsonb_build_object('job_run_details', v_n);
  end if;

  for t in select * from (values ('hg_plat_coups', 'hg_plat_parties'), ('hg_uno_coups', 'hg_uno_parties'),
                                 ('hg_duel_coups', 'hg_duel_parties'), ('hg_ndc_coups', 'hg_ndc_parties')) as x(coups, parties) loop
    if to_regclass('public.' || t.coups) is null or to_regclass('public.' || t.parties) is null then continue; end if;
    execute format($f$delete from public.%1$I where id in (
        select c.id from public.%1$I c join public.%2$I p on p.id = c.partie
        where p.statut = 'terminee' and p.ended_at < now() - interval '30 days' limit %3$s)$f$, t.coups, t.parties, v_lot);
    get diagnostics v_n = row_count;
    v_bilan := v_bilan || jsonb_build_object(t.coups, v_n);
  end loop;
  return v_bilan;
end $$;

revoke all on function public.hg_housekeeping() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'hg-housekeeping') then perform cron.unschedule('hg-housekeeping'); end if;
    perform cron.schedule('hg-housekeeping', '37 3 * * *', 'select public.hg_housekeeping()');
  end if;
end $$;
