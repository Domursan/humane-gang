-- ===== Humane Gang — migration 187 : photos libres du GeoGuessr, crédit et échelle du score =====
-- Le lot de photos Wikimedia Commons (outils/images/importer-lots.mjs) est sous CC BY, CC BY-SA, CC0 ou domaine public : CC BY
-- exige l'auteur, la licence et le lien. Une colonne facultative les garde, et la solution les renvoie après le vote seulement.
-- credit : { auteur, licence, licence_url, source }. Null pour les photos des sorties du gang : rien ne change pour elles.
--
-- Ces photos couvrent le monde : à l'échelle du gang (geo_echelle_km, 50 km), presque toutes les tentatives vaudraient 0 point.
-- echelle_km : échelle propre à une manche, en km. Null : le réglage global, comme aujourd'hui. Le lot pose 1500.
-- Seul hg_geo_guess calcule le score. Tout le reste en découle : la tentative stocke score et reward, et le classement, le bonus
-- de semaine et l'archive lisent ces valeurs ; hg_jeux_fin paie d'après le score ; une manche « pour l'honneur » passe aussi par
-- hg_geo_guess. geo.js n'affiche pas l'échelle, et hg_geo_today ne la renvoie pas : elle trahirait l'origine de la photo.
-- hg_geo_round_save et hg_geo_programme nomment leurs colonnes : ils laissent echelle_km intacte (null pour une manche créée au panel).
-- Seule exception : remplacer la photo au panel efface crédit et échelle, qui ne valaient que pour l'ancienne.
alter table public.hg_geo_rounds add column if not exists credit jsonb;
alter table public.hg_geo_rounds add column if not exists echelle_km int check (echelle_km between 1 and 20000);

create or replace function public.hg_geo_solution(r public.hg_geo_rounds)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('lat', r.lat, 'lon', r.lon, 'label', r.label, 'event_id', r.event_id,
    'event_title', e.title, 'event_date', e.starts_at, 'credit', r.credit)
  from (select 1) x left join hg_events e on e.id = r.event_id $$;

-- Une migration relancée ne repasse pas ici : hg__patch refuse un texte déjà remplacé.
do $d$
begin
  if pg_get_functiondef('public.hg_geo_guess(uuid, double precision, double precision)'::regprocedure) not like '%r.echelle_km%' then
    perform public.hg__patch('public.hg_geo_guess(uuid, double precision, double precision)'::regprocedure,
      $o$sc := hg_geo_score(dist, hg_jeux_cap('geo_echelle_km', 50, 1, 20000));$o$,
      $n$sc := hg_geo_score(dist, coalesce(r.echelle_km, hg_jeux_cap('geo_echelle_km', 50, 1, 20000)));$n$);
  end if;
  if pg_get_functiondef('public.hg_geo_round_save(uuid, jsonb)'::regprocedure) not like '%echelle_km%' then
    perform public.hg__patch('public.hg_geo_round_save(uuid, jsonb)'::regprocedure,
      $o$label = v_label, event_id = v_event, active = v_active, updated_at = now()$o$,
      $n$label = v_label, event_id = v_event, active = v_active, updated_at = now(),
      credit = case when image_path = v_path then credit end, echelle_km = case when image_path = v_path then echelle_km end$n$);
  end if;
end $d$;
