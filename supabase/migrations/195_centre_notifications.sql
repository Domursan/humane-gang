-- Centre de notifications (/pages/compte/notifications.html) : lecture par pages, suppression par le membre et nettoyage à 90 jours.
--
-- hg_mes_notifs (migration 153) ne change pas : le panneau de l'en-tête la garde, limitée à 100 lignes.
-- hg_notifs_page() lit l'historique par pages, avec catégorie et recherche sur le titre et le texte. Le curseur (created_at, id)
-- reste juste quand des lignes sont supprimées entre deux pages, ce qu'un décalage ne ferait pas. Les catégories ne sont pas une
-- liste fermée : celles rendues dans « comptes » sont celles trouvées dans les lignes du membre.
-- hg_notif_supprimer() et hg_notifs_supprimer_lues() suppriment pour de bon, il n'y a pas de corbeille. La table n'a qu'un droit de
-- lecture (migrations 153 et 176) : ces deux fonctions sont la seule écriture du membre, et elles ne touchent que ses lignes.
--
-- hg_entretien__passage() est reprise de la migration 192 à l'identique, plus une table : hg_site_notifs, 90 jours quel que soit
-- l'état de lecture. Cette durée est fixe : le site l'annonce au membre, elle n'entre donc pas dans les réglages de la page Entretien.
-- Mêmes modes, même plafond par table et par passage, et le résultat garde sa forme, avec notifs_jours en plus.
-- Rejouable : uniquement des « create or replace » et des droits.

/*
 * Une page de mes notifications, les plus récentes d'abord.
 * p_cat : une catégorie, ou toutes. p_q : recherche sans distinction de casse dans le titre et le texte, 100 caractères au plus ;
 * % et _ y sont des caractères ordinaires. p_avant_at et p_avant_id : dernière ligne de la page précédente. p_limite : de 1 à 50.
 * Rend { liste, suite, comptes: { <cat>: n }, total, tout, non_lues, lues } :
 *   comptes et total : lignes qui répondent à la recherche, sans tenir compte de la catégorie (ce qu'afficheraient les filtres) ;
 *   tout, non_lues, lues : toutes les lignes du membre, recherche et catégorie mises à part.
 */
create or replace function public.hg_notifs_page(p_cat text default null, p_q text default null,
  p_avant_at timestamptz default null, p_avant_id bigint default null, p_limite integer default 30)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  me uuid := auth.uid();
  v_limite int := least(greatest(coalesce(p_limite, 30), 1), 50);
  v_cat text := nullif(p_cat, '');
  v_q text := left(nullif(btrim(coalesce(p_q, '')), ''), 100);
  v_motif text;
  v_lignes jsonb;
  v_suite boolean;
  v_comptes jsonb;
  v_total int;
  v_etat record;
begin
  if me is null then raise exception 'Connexion requise'; end if;
  if v_q is not null then v_motif := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'; end if;

  select count(*)::int as tout, count(*) filter (where lu_at is null)::int as non_lues, count(*) filter (where lu_at is not null)::int as lues
    into v_etat from hg_site_notifs where user_id = me;

  select coalesce(jsonb_object_agg(c.cat, c.n), '{}'::jsonb), coalesce(sum(c.n), 0)::int into v_comptes, v_total
    from (select cat, count(*)::int as n from hg_site_notifs
           where user_id = me and (v_motif is null or titre ilike v_motif escape '\' or texte ilike v_motif escape '\')
           group by cat) c;

  -- Une ligne de plus que demandé : sa présence dit qu'il reste une page.
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'cat', n.cat, 'titre', n.titre, 'texte', n.texte, 'lien', n.lien,
      'created_at', n.created_at, 'lu', n.lu_at is not null) order by n.created_at desc, n.id desc) filter (where n.rang <= v_limite), '[]'::jsonb),
      count(*) > v_limite
    into v_lignes, v_suite
    from (select s.*, row_number() over (order by s.created_at desc, s.id desc) as rang
            from (select * from hg_site_notifs
                   where user_id = me
                     and (v_cat is null or cat = v_cat)
                     and (v_motif is null or titre ilike v_motif escape '\' or texte ilike v_motif escape '\')
                     and (p_avant_at is null or p_avant_id is null or (created_at, id) < (p_avant_at, p_avant_id))
                   order by created_at desc, id desc limit v_limite + 1) s) n;

  return jsonb_build_object('liste', v_lignes, 'suite', v_suite, 'comptes', v_comptes, 'total', v_total,
    'tout', v_etat.tout, 'non_lues', v_etat.non_lues, 'lues', v_etat.lues);
end $$;

/* Supprime une de mes notifications. Rend le nombre de lignes supprimées : 0 si elle n'existe plus ou n'est pas la mienne. */
create or replace function public.hg_notif_supprimer(p_id bigint)
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  delete from hg_site_notifs where id = p_id and user_id = auth.uid();
  get diagnostics n = row_count;
  return n;
end $$;

/* Supprime toutes mes notifications déjà lues, quels que soient les filtres de la page. Les non lues restent. */
create or replace function public.hg_notifs_supprimer_lues()
returns integer language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Connexion requise'; end if;
  delete from hg_site_notifs where user_id = auth.uid() and lu_at is not null;
  get diagnostics n = row_count;
  return n;
end $$;

/*
 * Un passage de purge. p_mode : apercu (compte sans rien supprimer), nuit ou main (supprime et note le passage).
 * Rend { plafond, journal_jours, coups_jours, notifs_jours, tables: { <table>: n } } : lignes concernées (aperçu, sans plafond) ou supprimées.
 * Sans contrôle de droit : fermée aux comptes, appelée seulement par les fonctions de la migration 192.
 */
create or replace function public.hg_entretien__passage(p_mode text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_lot constant int := 50000;
  v_notifs_jours constant int := 90;
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
      ('hg_ndc_coups', 'public.hg_ndc_coups', 'id', 'public.hg_ndc_parties'),
      ('hg_site_notifs', 'public.hg_site_notifs', 'id', null)) as x(cle, cible, pk, parties) loop
    if to_regclass(t.cible) is null or (t.parties is not null and to_regclass(t.parties) is null) then continue; end if;

    if t.cle = 'hg_site_notifs' then
      v_sel := format('select l.%I from %s l where l.created_at < now() - make_interval(days => %s)', t.pk, t.cible, v_notifs_jours);
    elsif t.parties is null then
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
  return v_d || jsonb_build_object('plafond', v_lot, 'notifs_jours', v_notifs_jours, 'tables', v_tables);
end $$;

-- Fonction interne : reste fermée aux comptes.
revoke all on function public.hg_entretien__passage(text) from public, anon, authenticated;

-- Fonctions du centre de notifications : comptes connectés seulement, chacune limitée aux lignes de auth.uid().
do $$
declare f text;
begin
  foreach f in array array['public.hg_notifs_page(text, text, timestamptz, bigint, integer)',
      'public.hg_notif_supprimer(bigint)', 'public.hg_notifs_supprimer_lues()'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
