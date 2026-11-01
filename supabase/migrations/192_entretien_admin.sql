-- Page Entretien du panel (La Mairie › Technique) : quotas, tâches planifiées et purge réglable.
--
-- Réglage hg_settings.entretien (jsonb) :
--   journal_jours        durée du journal des tâches (cron.job_run_details), 3 par défaut, de 1 à 30
--   coups_jours          durée des journaux de coups après la fin de la partie, 30 par défaut, de 14 à 365
--   quotas_ignore_until  « Ignorer cette semaine » des alertes de quotas
--   dernier              dernier passage de la purge { at, mode (nuit | main), lignes }
-- La clé reste volontairement absente de hg_settings_perm : toute clé non listée y vaut null, donc l'administrateur seul
-- l'écrit ou la lit en direct (politique hg_settings_admin). Le Staff « reglages » la lit par hg_entretien_reglages().
-- Une durée absente, illisible, décimale ou hors bornes vaut sa valeur par défaut : la purge ne dépend jamais d'une saisie brute.
--
-- Une seule logique de purge : hg_entretien__passage(), appelée par la purge de nuit, l'aperçu et la purge manuelle. Les durées,
-- les filtres, les tables et le plafond n'y sont écrits qu'une fois : l'aperçu ne peut pas s'écarter de ce que la purge supprime.
-- Conservé de la migration 189 : le Loup-Garou (journal, actions, votes) et les parties annulées ne sont jamais purgés,
-- 50 000 lignes au plus par table et par passage. La tâche pg_cron hg-housekeeping ne change pas.
--
-- hg_entretien_taches() ne lit jamais cron.job.command ni cron.job_run_details.return_message : ces colonnes peuvent contenir des clés.
-- Le rôle authenticated a un statement_timeout de 8 s. La purge et l'aperçu portent le leur : PostgREST le remonte à la transaction.
-- Rejouable : uniquement des « create or replace » et des droits.

/* Valeur par défaut et bornes de chaque durée. Source unique, relue par le panel. */
create or replace function public.hg_entretien__bornes()
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select '{"journal_jours": {"defaut": 3, "min": 1, "max": 30}, "coups_jours": {"defaut": 30, "min": 14, "max": 365}}'::jsonb
$$;

/* Une durée lue : un entier dans ses bornes, sinon la valeur par défaut. */
create or replace function public.hg_entretien__duree(p_valeur jsonb, p_regle jsonb)
returns int language plpgsql immutable set search_path = public, pg_temp as $$
declare v numeric;
begin
  if p_valeur is null or jsonb_typeof(p_valeur) <> 'number' then return (p_regle ->> 'defaut')::int; end if;
  v := (p_valeur #>> '{}')::numeric;
  if v <> trunc(v) or v < (p_regle ->> 'min')::int or v > (p_regle ->> 'max')::int then return (p_regle ->> 'defaut')::int; end if;
  return v::int;
end $$;

/* Les deux durées en vigueur, avec retour à la valeur par défaut. */
create or replace function public.hg_entretien__durees()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v jsonb := (select value from public.hg_settings where key = 'entretien');
  b jsonb := public.hg_entretien__bornes();
begin
  return jsonb_build_object(
    'journal_jours', public.hg_entretien__duree(v -> 'journal_jours', b -> 'journal_jours'),
    'coups_jours', public.hg_entretien__duree(v -> 'coups_jours', b -> 'coups_jours'));
end $$;

/* Fusionne des champs dans le réglage, même si sa valeur actuelle n'est pas un objet. */
create or replace function public.hg_entretien__ecrire(p_champs jsonb)
returns void language sql security definer set search_path = public, pg_temp as $$
  insert into public.hg_settings (key, value, updated_at) values ('entretien', p_champs, now())
  on conflict (key) do update
    set value = case when jsonb_typeof(public.hg_settings.value) = 'object' then public.hg_settings.value else '{}'::jsonb end || p_champs,
        updated_at = now()
$$;

/*
 * Un passage de purge. p_mode : apercu (compte sans rien supprimer), nuit ou main (supprime et note le passage).
 * Rend { plafond, journal_jours, coups_jours, tables: { <table>: n } } : lignes concernées (aperçu, sans plafond) ou supprimées.
 * Sans contrôle de droit : fermée aux comptes, appelée seulement par les fonctions ci-dessous.
 */
create or replace function public.hg_entretien__passage(p_mode text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot constant int := 50000;
  v_d jsonb := public.hg_entretien__durees();
  v_sel text;
  v_tables jsonb := '{}'::jsonb;
  v_total bigint := 0;
  v_n bigint;
  t record;
begin
  if p_mode is null or p_mode not in ('apercu', 'nuit', 'main') then raise exception 'Mode de purge inconnu'; end if;

  for t in select * from (values
      ('job_run_details', 'cron.job_run_details', 'runid', null),
      ('hg_plat_coups', 'public.hg_plat_coups', 'id', 'public.hg_plat_parties'),
      ('hg_uno_coups', 'public.hg_uno_coups', 'id', 'public.hg_uno_parties'),
      ('hg_duel_coups', 'public.hg_duel_coups', 'id', 'public.hg_duel_parties'),
      ('hg_ndc_coups', 'public.hg_ndc_coups', 'id', 'public.hg_ndc_parties')) as x(cle, cible, pk, parties) loop
    if to_regclass(t.cible) is null or (t.parties is not null and to_regclass(t.parties) is null) then continue; end if;

    if t.parties is null then
      -- end_time reste vide si le serveur a redémarré pendant la tâche : on se rabat sur start_time.
      v_sel := format('select l.%I from %s l where coalesce(l.end_time, l.start_time) < now() - make_interval(days => %s)',
        t.pk, t.cible, (v_d ->> 'journal_jours')::int);
    else
      v_sel := format($f$select l.%I from %s l join %s p on p.id = l.partie
        where p.statut = 'terminee' and p.ended_at < now() - make_interval(days => %s)$f$, t.pk, t.cible, t.parties, (v_d ->> 'coups_jours')::int);
    end if;

    if p_mode = 'apercu' then
      execute format('select count(*) from (%s) s', v_sel) into v_n;
    else
      execute format('delete from %s where %I in (%s limit %s)', t.cible, t.pk, v_sel, v_lot);
      get diagnostics v_n = row_count;
      v_total := v_total + v_n;
    end if;
    v_tables := v_tables || jsonb_build_object(t.cle, v_n);
  end loop;

  if p_mode <> 'apercu' then
    perform public.hg_entretien__ecrire(jsonb_build_object('dernier',
      jsonb_build_object('at', now(), 'mode', p_mode, 'lignes', v_total)));
  end if;
  return v_d || jsonb_build_object('plafond', v_lot, 'tables', v_tables);
end $$;

-- La purge de nuit : même nom et même bilan qu'en 189, pour la tâche pg_cron.
create or replace function public.hg_housekeeping()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return public.hg_entretien__passage('nuit') -> 'tables';
end $$;

/* Quotas : taille de la base et place occupée par bucket. Administrateur et Staff « reglages ». */
create or replace function public.hg_entretien_quotas()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_b jsonb;
begin
  if not public.hg_has_perm('reglages') then raise exception 'droit insuffisant'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket_id', x.bucket_id, 'fichiers', x.fichiers, 'octets', x.octets) order by x.octets desc), '[]'::jsonb)
    into v_b
    from (select bucket_id, count(*)::int as fichiers, coalesce(sum((metadata ->> 'size')::bigint), 0)::bigint as octets
            from storage.objects group by 1) x;
  return jsonb_build_object('base_octets', pg_database_size(current_database()), 'buckets', v_b, 'releve_at', now(),
    'ignore_until', (select value -> 'quotas_ignore_until' from public.hg_settings where key = 'entretien'));
end $$;

/*
 * Tâches planifiées : nom, planning, état, dernière exécution, exécutions et échecs sur la durée gardée au journal.
 * Jamais cron.job.command ni cron.job_run_details.return_message. Administrateur et Staff « reglages ».
 */
create or replace function public.hg_entretien_taches()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_jours int := (public.hg_entretien__durees() ->> 'journal_jours')::int;
  v_depuis timestamptz := now() - make_interval(days => v_jours);
  v_t jsonb;
begin
  if not public.hg_has_perm('reglages') then raise exception 'droit insuffisant'; end if;
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then
    return jsonb_build_object('jours', v_jours, 'releve_at', now(), 'taches', '[]'::jsonb);
  end if;
  with compte as (
    select d.jobid, count(*) filter (where d.start_time >= v_depuis) as executions,
           count(*) filter (where d.start_time >= v_depuis and d.status = 'failed') as erreurs
      from cron.job_run_details d group by d.jobid
  ), dernier as (
    select distinct on (d.jobid) d.jobid, d.status, d.start_time, d.end_time
      from cron.job_run_details d order by d.jobid, d.start_time desc nulls last
  )
  select coalesce(jsonb_agg(jsonb_build_object('jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'status', der.status, 'start_time', der.start_time, 'end_time', der.end_time,
      'executions', coalesce(c.executions, 0), 'erreurs', coalesce(c.erreurs, 0)) order by j.jobname), '[]'::jsonb)
    into v_t
    from cron.job j left join compte c on c.jobid = j.jobid left join dernier der on der.jobid = j.jobid;
  return jsonb_build_object('jours', v_jours, 'releve_at', now(), 'taches', v_t);
end $$;

/* Réglages de la purge : durées en vigueur, bornes, dernier passage. Administrateur et Staff « reglages » (lecture). */
create or replace function public.hg_entretien_reglages()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_nuit jsonb;
begin
  if not public.hg_has_perm('reglages') then raise exception 'droit insuffisant'; end if;
  -- Secours pour le « Dernier passage » : une nuit passée avant cette migration n'a rien noté dans le réglage.
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    select to_jsonb(d.start_time) into v_nuit
      from cron.job_run_details d join cron.job j on j.jobid = d.jobid
      where j.jobname = 'hg-housekeeping' and d.status = 'succeeded'
      order by d.start_time desc nulls last limit 1;
  end if;
  return public.hg_entretien__durees() || jsonb_build_object('bornes', public.hg_entretien__bornes(),
    'dernier', (select value -> 'dernier' from public.hg_settings where key = 'entretien'), 'derniere_nuit', v_nuit);
end $$;

/* Enregistre les deux durées. Administrateur seulement ; une valeur hors bornes est refusée. */
create or replace function public.hg_entretien_regler(p_journal_jours integer, p_coups_jours integer)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  b jsonb := public.hg_entretien__bornes();
  v_avant jsonb := public.hg_entretien__durees();
  v_apres jsonb := jsonb_build_object('journal_jours', p_journal_jours, 'coups_jours', p_coups_jours);
begin
  if not public.hg_is_admin() then raise exception 'droit insuffisant'; end if;
  if p_journal_jours is null or p_journal_jours not between (b #>> '{journal_jours,min}')::int and (b #>> '{journal_jours,max}')::int then
    raise exception 'Journal des tâches : entre % et % jours.', b #>> '{journal_jours,min}', b #>> '{journal_jours,max}' using errcode = '22023';
  end if;
  if p_coups_jours is null or p_coups_jours not between (b #>> '{coups_jours,min}')::int and (b #>> '{coups_jours,max}')::int then
    raise exception 'Journaux de coups : entre % et % jours.', b #>> '{coups_jours,min}', b #>> '{coups_jours,max}' using errcode = '22023';
  end if;
  perform public.hg_entretien__ecrire(v_apres);
  perform public.hg_admin_audit('entretien_durees', null, 'entretien', jsonb_build_object('avant', v_avant, 'apres', v_apres));
  return public.hg_entretien_reglages();
end $$;

/* « Ignorer cette semaine » des alertes de quotas : p_days jours, 0 pour reprendre. Administrateur seulement. */
create or replace function public.hg_entretien_ignorer(p_days integer default 7)
returns timestamptz language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_days int := least(14, greatest(0, coalesce(p_days, 7)));
  v_until timestamptz := case when v_days > 0 then now() + make_interval(days => v_days) end;
begin
  if not public.hg_is_admin() then raise exception 'droit insuffisant'; end if;
  perform public.hg_entretien__ecrire(jsonb_build_object('quotas_ignore_until', v_until));
  perform public.hg_admin_audit('entretien_alertes_ignorees', null, 'entretien', jsonb_build_object('jours', v_days));
  return v_until;
end $$;

/* Aperçu de la purge : ce que supprimerait un passage, sans rien supprimer. Administrateur seulement, journalisé. */
create or replace function public.hg_entretien_apercu()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '60s' as $$
declare v jsonb;
begin
  if not public.hg_is_admin() then raise exception 'droit insuffisant'; end if;
  v := public.hg_entretien__passage('apercu');
  perform public.hg_admin_audit('entretien_apercu', null, 'entretien', jsonb_build_object('tables', v -> 'tables'));
  return v;
end $$;

/* Purge manuelle : le même passage que la nuit. Administrateur seulement, journalisée. */
create or replace function public.hg_entretien_purger()
returns jsonb language plpgsql security definer set search_path = public, pg_temp set statement_timeout = '120s' as $$
declare v jsonb;
begin
  if not public.hg_is_admin() then raise exception 'droit insuffisant'; end if;
  v := public.hg_entretien__passage('main');
  perform public.hg_admin_audit('entretien_purge', null, 'entretien', jsonb_build_object('tables', v -> 'tables'));
  return v;
end $$;

-- Fonctions internes et purge de nuit : fermées aux comptes.
revoke all on function public.hg_entretien__bornes() from public, anon, authenticated;
revoke all on function public.hg_entretien__duree(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.hg_entretien__durees() from public, anon, authenticated;
revoke all on function public.hg_entretien__ecrire(jsonb) from public, anon, authenticated;
revoke all on function public.hg_entretien__passage(text) from public, anon, authenticated;
revoke all on function public.hg_housekeeping() from public, anon, authenticated;

-- Fonctions du panel : ouvertes aux comptes connectés, le droit est vérifié à l'intérieur.
do $$
declare f text;
begin
  foreach f in array array['public.hg_entretien_quotas()', 'public.hg_entretien_taches()', 'public.hg_entretien_reglages()',
      'public.hg_entretien_regler(integer, integer)', 'public.hg_entretien_ignorer(integer)',
      'public.hg_entretien_apercu()', 'public.hg_entretien_purger()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
