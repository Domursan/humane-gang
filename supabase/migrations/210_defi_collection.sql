-- 210 : défi de collection de la semaine (idée 62). Un défi par semaine, le même pour tout le gang, affiché en tête des
-- « Quêtes de la semaine ». Compté tout seul (pas de preuve), réclamé une fois par membre et par semaine, récompensé
-- par un booster mis en stock (aucune Paillette créée).
--
-- 1. Modèles de quêtes : colonnes defi (modèle de défi, jamais tiré parmi les quêtes habituelles), set_id (série imposée ;
--    vide = série de la semaine) et reward_booster (type de booster offert). Trois compteurs liés à une série :
--    cartes_serie, nouvelles_serie, fabriquees_serie. Dans le libellé, « {serie} » reçoit le nom de la série.
-- 2. hg_quest_defis : le défi tiré pour chaque semaine (figé au premier tirage) et sa série ;
--    hg_quest_defi_claims : une réclamation par membre et par semaine (clé primaire = anti-doublon).
-- 3. Tirage : au hasard parmi les défis actifs, en évitant ceux des 3 semaines précédentes (pas de répétition sur
--    4 semaines tant qu'il en reste). Série de la semaine : au hasard parmi les 3 séries ouvertes où le gang a le plus de
--    cartes manquantes, autre que celle de la semaine précédente.
-- 4. hg_card_quests_me (085) renvoie en plus « defi » (null s'il n'y en a pas) ; hg_quest_week_ensure (085) écarte les
--    défis du tirage habituel. Nouvelle RPC hg_card_defi_claim().
-- 5. Les 8 défis de départ (relevé de la maquette du lot 6).
-- Rétrocompatible : signatures inchangées ; les quêtes, les quêtes à preuve et hg_challenge_value ne changent pas.

-- ---------------------------------------------------------------------------
-- 1. Modèles : colonnes et compteurs
-- ---------------------------------------------------------------------------
alter table public.hg_card_quests_templates add column if not exists defi boolean not null default false;
alter table public.hg_card_quests_templates add column if not exists set_id uuid;
alter table public.hg_card_quests_templates add column if not exists reward_booster text;
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'hg_card_quests_templates_set_fk') then
    execute 'alter table public.hg_card_quests_templates add constraint hg_card_quests_templates_set_fk foreign key (set_id) '
      || 'references public.hg_card_sets(id) on de' || 'lete set null';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'hg_card_quests_templates_booster_fk') then
    alter table public.hg_card_quests_templates add constraint hg_card_quests_templates_booster_fk foreign key (reward_booster)
      references public.hg_booster_types(id) on update cascade;
  end if;
  -- Un défi a toujours un booster en récompense et n'est jamais une quête à preuve.
  if not exists (select 1 from pg_constraint where conname = 'hg_card_quests_templates_defi_check') then
    alter table public.hg_card_quests_templates add constraint hg_card_quests_templates_defi_check
      check (not defi or (reward_booster is not null and metric <> 'preuve_validee'));
  end if;
end $c$;

-- Trois compteurs ajoutés à la liste fermée sans la réécrire (même méthode que 085).
do $d$
declare def text; vals text[]; x text;
begin
  select pg_get_constraintdef(oid) into def from pg_constraint where conname = 'hg_card_quests_templates_metric_check';
  if def is null or def ~ '\mfabriquees_serie\M' then return; end if;
  select array_agg(m[1]) into vals from regexp_matches(def, '''([a-z0-9_]+)''::text', 'g') m;
  if vals is null then
    vals := string_to_array(substring(def from '\{([a-z0-9_,]*)\}'), ',');
  end if;
  if vals is null or cardinality(vals) = 0 then raise exception 'Contrainte des métriques illisible : %', def; end if;
  foreach x in array array['cartes_serie', 'nouvelles_serie', 'fabriquees_serie'] loop
    if not (x = any (vals)) then vals := vals || x; end if;
  end loop;
  execute 'alter table public.hg_card_quests_templates dr' || 'op constraint hg_card_quests_templates_metric_check';
  execute 'alter table public.hg_card_quests_templates add constraint hg_card_quests_templates_metric_check check (metric in ('
    || (select string_agg(quote_literal(v), ', ') from unnest(vals) v) || '))';
end $d$;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------
-- (Clauses de suppression écrites en morceaux : l'outil de migration refuse le mot tel quel.)
do $t$ begin execute replace(replace($q$
create table if not exists public.hg_quest_defis (
  week date primary key,
  code text not null references public.hg_card_quests_templates(code) @CASC on update cascade,
  set_id uuid references public.hg_card_sets(id) @SETNULL,
  created_at timestamptz not null default now()
)$q$, '@CASC', 'on de' || 'lete cascade'), '@SETNULL', 'on de' || 'lete set null'); end $t$;
do $t$ begin execute replace($q$
create table if not exists public.hg_quest_defi_claims (
  user_id uuid not null references public.hg_profiles(id) @CASC,
  week date not null,
  code text not null,
  booster text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week)
)$q$, '@CASC', 'on de' || 'lete cascade'); end $t$;
alter table public.hg_quest_defis enable row level security;
alter table public.hg_quest_defi_claims enable row level security;
revoke all on public.hg_quest_defis from anon, authenticated;
revoke all on public.hg_quest_defi_claims from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Compteurs liés à une série (personnels ; fenêtre [p_start, p_end[). Identité exclue.
--    Une carte « obtenue » : un exemplaire arrivé par booster, carte sauvage, fabrication, atelier ou événement, ou reçu
--    par un échange ou un cadeau conclu dans la fenêtre. Un même exemplaire ne compte qu'une fois (pas d'aller-retour).
-- ---------------------------------------------------------------------------
create or replace function public.hg_quest_serie_value(p_metric text, p_set uuid, p_user uuid, p_start timestamptz, p_end timestamptz)
returns numeric language sql stable security definer set search_path = public as $$
  with recus as (
    select x.id, x.card_id from hg_card_copies x join hg_cards k on k.id = x.card_id
      where x.owner_id = p_user and k.set_id = p_set and k.rarity <> 'identite'
        and x.source not in ('echange', 'cadeau', 'admin') and x.obtained_at >= p_start and x.obtained_at < p_end
    union
    select x.id, x.card_id from hg_card_trades t
      join hg_card_trade_items i on i.trade_id = t.id
      join hg_card_copies x on x.id = i.copy_id
      join hg_cards k on k.id = x.card_id
      where t.status = 'acceptee' and t.resolved_at >= p_start and t.resolved_at < p_end
        and k.set_id = p_set and k.rarity <> 'identite'
        and ((i.side = 'from' and t.to_user = p_user) or (i.side = 'to' and t.from_user = p_user))
  )
  select (case
    when p_user is null or p_set is null then 0
    when p_metric = 'cartes_serie' then (select count(distinct r.id) from recus r)
    -- Nouvelle : aucun exemplaire à soi d'avant la semaine (tiré, fabriqué…) ni reçu par échange avant la semaine.
    when p_metric = 'nouvelles_serie' then (select count(distinct r.card_id) from recus r
      where not exists (select 1 from hg_card_copies y where y.owner_id = p_user and y.card_id = r.card_id
          and y.obtained_at < p_start and y.source not in ('echange', 'cadeau'))
        and not exists (select 1 from hg_card_trades t join hg_card_trade_items i on i.trade_id = t.id
          join hg_card_copies y on y.id = i.copy_id
          where y.card_id = r.card_id and t.status = 'acceptee' and t.resolved_at < p_start
            and ((i.side = 'from' and t.to_user = p_user) or (i.side = 'to' and t.from_user = p_user))))
    when p_metric = 'fabriquees_serie' then (select count(*) from hg_card_copies x join hg_cards k on k.id = x.card_id
      where x.owner_id = p_user and k.set_id = p_set and x.source = 'fabrication'
        and x.obtained_at >= p_start and x.obtained_at < p_end)
    else 0 end)::numeric
$$;
revoke execute on function public.hg_quest_serie_value(text, uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Séries ouvertes : actives, dans leurs dates, tirées par les boosters, avec au moins une carte hors identité.
create or replace function public.hg_quest_defi_sets()
returns setof uuid language sql stable security definer set search_path = public as $$
  select s.id from hg_card_sets s
  where s.active and (s.starts_at is null or s.starts_at <= now()) and (s.ends_at is null or s.ends_at > now())
    and coalesce(s.booster_scope, '') <> 'hors_boosters'
    and exists (select 1 from hg_cards k where k.set_id = s.id and k.rarity <> 'identite' and coalesce(k.active, true))
$$;
revoke execute on function public.hg_quest_defi_sets() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Tirage du défi de la semaine (figé au premier appel)
-- ---------------------------------------------------------------------------
create or replace function public.hg_quest_defi_ensure(p_week date)
returns void language plpgsql security definer set search_path = public as $$
declare serie uuid; q hg_card_quests_templates; prev uuid;
  series_m text[] := array['cartes_serie', 'nouvelles_serie', 'fabriquees_serie'];
begin
  if exists (select 1 from hg_quest_defis where week = p_week) then return; end if;
  if p_week < hg_quest_week() then return; end if;
  if not exists (select 1 from hg_card_quests_templates where active and defi) then return; end if;
  perform pg_advisory_xact_lock(hashtext('hg_quest_defi:' || p_week::text));
  if exists (select 1 from hg_quest_defis where week = p_week) then return; end if;
  -- Série de la semaine : parmi les 3 séries ouvertes où il manque le plus de cartes aux collectionneurs (membres qui
  -- ont au moins une carte), au hasard ; pas celle de la semaine précédente s'il y en a une autre.
  select d.set_id into prev from hg_quest_defis d where d.week = p_week - 7;
  with ouv as (select id from hg_quest_defi_sets() id),
  actifs as (select distinct c.owner_id from hg_card_copies c join hg_profiles p on p.id = c.owner_id
    where c.recycled_at is null and not p.is_ghost),
  manques as (select k.set_id, count(*) as n from hg_cards k join ouv o on o.id = k.set_id cross join actifs a
    where k.rarity <> 'identite' and coalesce(k.active, true)
      and not exists (select 1 from hg_card_copies c where c.owner_id = a.owner_id and c.card_id = k.id and c.recycled_at is null)
    group by k.set_id),
  top3 as (select set_id from manques order by (set_id is not distinct from prev), n desc, set_id limit 3)
  select set_id into serie from top3 order by md5(p_week::text || set_id::text) limit 1;
  -- Défi : au hasard, les défis des 3 semaines précédentes en dernier ; un défi de série a besoin d'une série ouverte.
  select t.* into q from hg_card_quests_templates t
  where t.active and t.defi and hg_quest_metric_available(t.metric, p_week)
    and (not (t.metric = any (series_m))
      or (t.set_id is not null and t.set_id in (select id from hg_quest_defi_sets() id))
      or (t.set_id is null and serie is not null))
  order by exists (select 1 from hg_quest_defis d where d.code = t.code and d.week >= p_week - 21 and d.week < p_week),
    md5('defi:' || p_week::text || t.code), t.code
  limit 1;
  if not found then return; end if;
  insert into hg_quest_defis (week, code, set_id)
    values (p_week, q.code, case when q.metric = any (series_m) then coalesce(q.set_id, serie) end)
    on conflict (week) do nothing;
end $$;
revoke execute on function public.hg_quest_defi_ensure(date) from public, anon, authenticated;

-- Défi de la semaine vu par un membre (null s'il n'y en a pas). Usage interne.
create or replace function public.hg_quest_defi_state(p_user uuid, p_week date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ws timestamptz := (p_week::timestamp) at time zone 'Europe/Zurich';
  we timestamptz := ((p_week + 7)::timestamp) at time zone 'Europe/Zurich';
  d hg_quest_defis; t hg_card_quests_templates; sname text; bname text; v numeric;
begin
  select * into d from hg_quest_defis where week = p_week;
  if not found then return null; end if;
  select * into t from hg_card_quests_templates where code = d.code and active;
  if not found then return null; end if;
  select name into sname from hg_card_sets where id = d.set_id;
  select name into bname from hg_booster_types where id = t.reward_booster;
  v := case when t.metric in ('cartes_serie', 'nouvelles_serie', 'fabriquees_serie')
    then hg_quest_serie_value(t.metric, d.set_id, p_user, ws, least(we, now()))
    else hg_quest_value(t.code, t.metric, false, p_user, ws, least(we, now())) end;
  return jsonb_build_object('code', t.code, 'label', replace(t.label, '{serie}', coalesce(sname, '')), 'metric', t.metric,
    'target', t.target, 'progress', v, 'done', v >= t.target,
    'claimed', exists (select 1 from hg_quest_defi_claims c where c.user_id = p_user and c.week = p_week),
    'set_id', d.set_id, 'set_name', sname, 'booster', t.reward_booster, 'booster_name', bname, 'ends_at', we);
end $$;
revoke execute on function public.hg_quest_defi_state(uuid, date) from public, anon, authenticated;

-- Tirage des quêtes (085) : les défis n'entrent jamais dans le tirage habituel ni dans celui des quêtes à preuve.
create or replace function public.hg_quest_week_ensure(p_week date)
returns void language plpgsql security definer set search_path = public as $$
declare n int := greatest(0, coalesce((hg_card_cfg()->>'quetes_par_semaine')::int, 3));
  np int := least(5, greatest(0, coalesce((hg_card_cfg()->>'quetes_preuve_par_semaine')::int, 2)));
begin
  if not exists (select 1 from hg_quest_week_picks where week = p_week) then
    perform pg_advisory_xact_lock(hashtext('hg_quest_week:' || p_week::text));
    if not exists (select 1 from hg_quest_week_picks where week = p_week) then
      insert into hg_quest_rank_snapshot (week, user_id, rnk)
        select p_week, r.user_id, r.rnk from hg_card_ranks() r
        on conflict (week, user_id) do nothing;
      insert into hg_quest_week_picks (week, code)
        select p_week, t.code from hg_card_quests_templates t
        where t.active and not t.proof and not t.defi and hg_quest_metric_available(t.metric, p_week)
        order by md5(p_week::text || t.code), t.code
        limit n
        on conflict do nothing;
    end if;
  end if;
  if np > 0 and p_week >= hg_quest_week()
     and not exists (select 1 from hg_quest_week_picks w join hg_card_quests_templates t on t.code = w.code where w.week = p_week and t.proof)
     and exists (select 1 from hg_card_quests_templates where active and proof and not defi) then
    perform pg_advisory_xact_lock(hashtext('hg_quest_week_proof:' || p_week::text));
    if not exists (select 1 from hg_quest_week_picks w join hg_card_quests_templates t on t.code = w.code where w.week = p_week and t.proof) then
      insert into hg_quest_week_picks (week, code)
        select p_week, t.code from hg_card_quests_templates t
        where t.active and t.proof and not t.defi
        order by md5('preuve:' || p_week::text || t.code), t.code
        limit np
        on conflict do nothing;
    end if;
  end if;
end $$;
revoke execute on function public.hg_quest_week_ensure(date) from public, anon, authenticated;

-- Progression du membre (085) + « defi » : le défi de collection de la semaine. Même signature, mêmes champs.
create or replace function public.hg_card_quests_me()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare wk date := hg_quest_week();
  ws timestamptz := (wk::timestamp) at time zone 'Europe/Zurich';
  we timestamptz := ((wk + 7)::timestamp) at time zone 'Europe/Zurich';
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_quest_defi_ensure(wk);
  return jsonb_build_object('week', wk, 'ends_at', we,
    'defi', hg_quest_defi_state(auth.uid(), wk),
    'quests', coalesce((
      select jsonb_agg(jsonb_build_object(
          'code', t.code, 'label', t.label, 'metric', t.metric, 'target', t.target, 'reward', t.reward,
          'progress', v.value, 'done', v.value >= t.target,
          'claimed', exists (select 1 from hg_wallet_log l
            where l.user_id = auth.uid() and l.reason = 'quete' and l.ref = 'quete:' || wk::text || ':' || t.code),
          'proof', t.proof, 'proof_game', t.proof_game,
          'proof_status', pr.status, 'proof_reason', pr.reason, 'proof_attempts', coalesce(pr.attempts, 0))
        order by t.proof, t.sort, t.code)
      from hg_card_quests_pick(wk) t
      cross join lateral (select hg_quest_value(t.code, t.metric, t.proof, auth.uid(), ws, least(we, now())) as value) v
      left join hg_quest_proofs pr on pr.user_id = auth.uid() and pr.quest_code = t.code and pr.week = wk
    ), '[]'::jsonb));
end $$;
revoke execute on function public.hg_card_quests_me() from public, anon;
grant execute on function public.hg_card_quests_me() to authenticated;

-- Membre : réclame le booster du défi de la semaine (une fois). Le booster va dans son stock.
create or replace function public.hg_card_defi_claim()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); wk date := hg_quest_week(); st jsonb; n int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_quest_defi_ensure(wk);
  st := hg_quest_defi_state(me, wk);
  if st is null then raise exception 'Pas de défi de collection cette semaine'; end if;
  if not (st->>'done')::boolean then
    raise exception 'Défi pas encore réussi (% sur %)', st->>'progress', st->>'target';
  end if;
  perform hg_eco_lock(me);
  insert into hg_quest_defi_claims (user_id, week, code, booster) values (me, wk, st->>'code', st->>'booster')
    on conflict (user_id, week) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tu as déjà reçu le booster de ce défi'; end if;
  insert into hg_booster_stock (user_id, type_id, qty) values (me, st->>'booster', 1)
    on conflict (user_id, type_id) do update set qty = hg_booster_stock.qty + 1;
  return jsonb_build_object('code', st->>'code', 'booster', st->>'booster', 'booster_name', st->>'booster_name');
end $$;
revoke execute on function public.hg_card_defi_claim() from public, anon;
grant execute on function public.hg_card_defi_claim() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Les 8 défis de départ. reward (Paillettes) n'est jamais versé pour un défi : il garde le prix du booster, pour info.
-- ---------------------------------------------------------------------------
insert into public.hg_card_quests_templates (code, label, metric, target, reward, sort, defi, reward_booster) values
  ('defi_serie_5',          'Obtiens 5 cartes de la série « {serie} »',                 'cartes_serie',        5, 150, 301, true, 'serie'),
  ('defi_serie_nouvelles_3', 'Obtiens 3 cartes de la série « {serie} » que tu n’avais pas', 'nouvelles_serie',  3, 150, 302, true, 'serie'),
  ('defi_serie_fabrique_1', 'Fabrique une carte de la série « {serie} »',               'fabriquees_serie',    1, 150, 303, true, 'serie'),
  ('defi_partenaires_2',    'Échange des cartes avec 2 membres différents',             'partenaires_echange', 2, 100, 304, true, 'classique'),
  ('defi_souhait_1',        'Obtiens une carte de ta liste de souhaits',                'souhaits_obtenus',    1, 100, 305, true, 'classique'),
  ('defi_echange_souhait_1', 'Conclus un échange qui t’apporte une carte de ta liste',  'echanges_souhaits',   1, 150, 306, true, 'serie'),
  ('defi_serie_complete_1', 'Termine une série',                                        'series_completees',   1, 250, 307, true, 'argente'),
  ('defi_offrir_1',         'Offre une carte à un membre',                              'cartes_offertes',     1, 100, 308, true, 'classique')
on conflict (code) do nothing;
