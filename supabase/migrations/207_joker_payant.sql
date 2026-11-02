-- ===== Humane Gang — migration 207 : joker payant pour sauver une série (idée 9) =====
-- Demande d'Ethan (lot 5, validé le 02.11.2026). S'appuie sur la série commune (migration 206).
-- 1. Quand une série vient de casser (le jour d'hier n'est ni joué ni couvert par un joker), le membre peut racheter ce
--    jour, et seulement lui, jusqu'à la bascule d'aujourd'hui (minuit, ou 6 h pour la Question du jour et GeoGuessr).
--    Le jour racheté relie la série sans compter comme un jour joué.
-- 2. Prix selon la longueur de la série cassée, réglable comme les autres plafonds (hg_eco_cap) :
--    7 à 13 jours 200 ✦ ('joker_7'), 14 à 29 400 ✦ ('joker_14'), 30 à 59 700 ✦ ('joker_30'), 60 à 99 1 000 ✦ ('joker_60'),
--    100 jours et plus 1 500 ✦ ('joker_100', plafond). Pas d'offre sous 7 jours.
-- 3. Un joker payant par semaine (lundi à dimanche, semaine du jour racheté) et par jeu.
-- 4. Toutes les séries de l'idée 10 : la Question du jour (dont le joker gratuit automatique ne change pas ; le jour
--    racheté y apparaît comme joker, « paye ») et les 18 autres jeux.
-- 5. hg_jeux_joker_payer(p_jeu) : verrou du solde (hg_eco_lock), vérification des conditions, débit et jour racheté dans
--    la même transaction ; clé unique (jeu, jour, membre) et référence unique du débit : un double clic ne paie qu'une fois.
--    Aucune Paillette n'est créée ; un palier de la Question du jour ne se paie qu'une fois par série (ref liée à son
--    premier jour), racheter un jour ne repaie donc pas un palier déjà touché.
-- 6. hg_jeux_series() renvoie en plus, par jeu, l'offre (« joker ») et le solde du membre.
-- Rejouable.

create table if not exists public.hg_jeux_jokers (
  jeu text not null,
  day date not null,
  user_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  prix int not null check (prix >= 0),
  serie int not null default 0,
  created_at timestamptz not null default now(),
  primary key (jeu, day, user_id)
);
create index if not exists hg_jeux_jokers_user_idx on public.hg_jeux_jokers (user_id, jeu, day);
alter table public.hg_jeux_jokers enable row level security;
revoke all on public.hg_jeux_jokers from public, anon, authenticated;

-- Prix d'un joker payant selon la série cassée (null sous 7 jours).
create or replace function public.hg_jeux_joker_prix(p_serie int)
returns int language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p_serie, 0) < 7 then null
    when p_serie < 14 then least(hg_eco_cap('joker_7', 200), 100000)
    when p_serie < 30 then least(hg_eco_cap('joker_14', 400), 100000)
    when p_serie < 60 then least(hg_eco_cap('joker_30', 700), 100000)
    when p_serie < 100 then least(hg_eco_cap('joker_60', 1000), 100000)
    else least(hg_eco_cap('joker_100', 1500), 100000) end $$;

-- Question du jour : la série de 084, avec les jours rachetés (joker payant) qui relient la série sans compter.
-- Ajouts au retour : payes (jours rachetés) ; dans week, paye = true sur un jour racheté (state 'joker').
-- p_extra : un jour compté comme racheté sans l'être (prix et longueur de la série qu'un rachat rendrait). Fonction interne.
create or replace function public.hg_quiz_daily__serie(p_user uuid, p_today date, p_extra date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ans date[]; pay date[]; first_day date; d date; n int := 0; st date; used date[] := '{}'; jok date[] := '{}'; jp date[] := '{}'; i int := 0;
  wk date := date_trunc('week', p_today)::date; week jsonb := '[]'::jsonb; x date; s text;
begin
  select coalesce(array_agg(day order by day desc), '{}'), min(day) into ans, first_day
    from hg_quiz_daily_answers where user_id = p_user and answered_at is not null and day <= p_today;
  select coalesce(array_agg(day), '{}') into pay from hg_jeux_jokers where user_id = p_user and jeu = 'quiz_jour' and day <= p_today;
  if p_extra is not null then pay := pay || p_extra; end if;
  if cardinality(ans) > 0 then
    d := p_today;
    if not (d = any (ans)) then d := d - 1; end if;   -- aujourd'hui pas encore répondu : la série tient jusqu'à ce soir
    while d >= first_day and i < 2000 loop
      i := i + 1;
      if d = any (ans) then
        n := n + 1; st := d;
      elsif d = any (pay) then
        jp := jp || d;                                   -- jour racheté (joker payant) : couvert, sans compter
      elsif not (date_trunc('week', d)::date = any (used)) and (d - 1) = any (ans) then
        used := used || date_trunc('week', d)::date; jok := jok || d;   -- joker de la semaine de ce jour
      else
        exit;
      end if;
      d := d - 1;
    end loop;
  end if;
  for k in 0..6 loop
    x := wk + k;
    s := case when x = any (ans) then 'ok' when x = any (jok) or x = any (pay) then 'joker' when x = p_today then 'today'
              when x > p_today then 'future' else 'miss' end;
    week := week || jsonb_build_object('day', x, 'state', s, 'paye', x = any (pay) and not (x = any (ans)));
  end loop;
  return jsonb_build_object('current', n, 'start', st, 'jokers', to_jsonb(jok), 'payes', to_jsonb(jp),
    'joker_left', case when wk = any (used) then 0 else 1 end, 'week', week);
end $$;

-- Série de la Question du jour (signature de 084, appelée par hg_quiz_daily_today, hg_quiz_daily_answer, le bot).
create or replace function public.hg_quiz_daily_streak_of(p_user uuid, p_today date)
returns jsonb language sql stable security definer set search_path = public as $$
  select hg_quiz_daily__serie(p_user, p_today, null) $$;

-- État de la série d'un jeu pour un membre : { n, joue, jour, six, casse (hier ni joué ni couvert), avant (série
-- cassée hier, 0 sinon) }. Fonction interne (même règle que hg_jeux_series de la migration 206).
create or replace function public.hg_jeux__etat(p_jeu text, p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare six boolean := p_jeu in ('quiz_jour', 'geo'); j date; jours date[]; payes date[]; joue boolean; n int; casse boolean;
  avant int := 0; st jsonb;
begin
  j := case p_jeu when 'quiz_jour' then hg_quiz_daily_day() when 'geo' then hg_geo_day() else hg_jeux_today() end;
  select coalesce(array_agg(x.day), '{}') into payes from hg_jeux_jokers x where x.jeu = p_jeu and x.user_id = p_user and x.day <= j;
  if p_jeu = 'quiz_jour' then
    st := hg_quiz_daily_streak_of(p_user, j);
    n := coalesce((st->>'current')::int, 0);
    joue := exists (select 1 from hg_quiz_daily_answers a where a.user_id = p_user and a.day = j and a.answered_at is not null);
    casse := not exists (select 1 from hg_quiz_daily_answers a where a.user_id = p_user and a.day = j - 1 and a.answered_at is not null)
      and not ((j - 1) = any (payes)) and not coalesce(st->'jokers' ? (j - 1)::text, false);
    -- Série que le rachat d'hier rendrait (le joker gratuit peut alors se placer autrement), sans compter aujourd'hui.
    if casse then avant := coalesce((hg_quiz_daily__serie(p_user, j, j - 1)->>'current')::int, 0) - case when joue then 1 else 0 end; end if;
  else
    select coalesce(array_agg(x.day), '{}') into jours from hg_jeux_resultats x where x.jeu = p_jeu and x.user_id = p_user and x.day <= j;
    joue := j = any (jours);
    n := hg_jeux__serie(jours, payes, case when joue then j else j - 1 end);
    casse := not ((j - 1) = any (jours)) and not ((j - 1) = any (payes));
    if casse then avant := hg_jeux__serie(jours, payes, j - 2); end if;
  end if;
  return jsonb_build_object('n', n, 'joue', joue, 'jour', j, 'six', six, 'casse', casse, 'avant', avant);
end $$;

-- Les 19 séries du membre connecté, avec l'offre de joker payant et le solde.
-- { solde, jeux: { <clé>: { n, joue, jour, bascule, fin, joker?: { jour, serie, prix, deja, possible } } } }
-- joker : seulement quand une série d'au moins 1 jour a cassé hier. prix null sous 7 jours (pas d'offre, le site le dit) ;
-- deja = true : un joker payant a déjà servi cette semaine pour ce jeu ; possible = prix connu et pas deja.
create or replace function public.hg_jeux_series()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); r jsonb := '{}'::jsonb; k text; e jsonb; j date; six boolean; o jsonb; v_prix int; v_deja boolean;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  foreach k in array hg_jeux_liste() loop
    e := hg_jeux__etat(k, me);
    j := (e->>'jour')::date; six := (e->>'six')::boolean;
    o := null;
    if (e->>'casse')::boolean and (e->>'avant')::int >= 1 then
      v_prix := hg_jeux_joker_prix((e->>'avant')::int);
      v_deja := exists (select 1 from hg_jeux_jokers x where x.jeu = k and x.user_id = me
        and date_trunc('week', x.day)::date = date_trunc('week', j - 1)::date);
      o := jsonb_build_object('jour', j - 1, 'serie', (e->>'avant')::int, 'prix', v_prix, 'deja', v_deja,
        'possible', v_prix is not null and not v_deja);
    end if;
    r := r || jsonb_build_object(k, jsonb_build_object('n', (e->>'n')::int, 'joue', (e->>'joue')::boolean, 'jour', j,
      'bascule', case when six then '6h' else 'minuit' end,
      'fin', ((j + 1)::timestamp + case when six then interval '6 hours' else interval '0 hours' end) at time zone 'Europe/Zurich',
      'joker', o));
  end loop;
  return jsonb_build_object('jeux', r, 'solde', coalesce((select w.paillettes from hg_wallets w where w.user_id = me), 0));
end $$;

-- Rachète le jour d'hier d'une série cassée. Renvoie { jeu, jour, prix, serie (après rachat), solde }.
create or replace function public.hg_jeux_joker_payer(p_jeu text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); e jsonb; k date; avant int; v_prix int; v_solde int; n int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if p_jeu is null or not (p_jeu = any (hg_jeux_liste())) then raise exception 'Jeu inconnu'; end if;
  perform hg_eco_lock(me);
  e := hg_jeux__etat(p_jeu, me);
  k := (e->>'jour')::date - 1;
  if exists (select 1 from hg_jeux_jokers x where x.jeu = p_jeu and x.day = k and x.user_id = me) then
    raise exception 'Ce jour est déjà racheté : ta série continue';
  end if;
  if not (e->>'casse')::boolean then raise exception 'Rien à sauver : ta série tient toujours'; end if;
  avant := (e->>'avant')::int;
  v_prix := hg_jeux_joker_prix(avant);
  if v_prix is null then raise exception 'Une série se rachète à partir de 7 jours'; end if;
  if exists (select 1 from hg_jeux_jokers x where x.jeu = p_jeu and x.user_id = me
      and date_trunc('week', x.day)::date = date_trunc('week', k)::date) then
    raise exception 'Un seul joker payant par semaine pour ce jeu';
  end if;
  select w.paillettes into v_solde from hg_wallets w where w.user_id = me for update;
  if coalesce(v_solde, 0) < v_prix then raise exception 'Pas assez de Paillettes (il en faut %)', v_prix; end if;
  insert into hg_jeux_jokers (jeu, day, user_id, prix, serie) values (p_jeu, k, me, v_prix, avant) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Ce jour est déjà racheté : ta série continue'; end if;
  if v_prix > 0 and not hg_wallet_add(me, -v_prix, 'jeux_joker', 'joker:' || p_jeu || ':' || k::text) then
    raise exception 'Ce jour est déjà racheté : ta série continue';
  end if;
  e := hg_jeux__etat(p_jeu, me);
  return jsonb_build_object('jeu', p_jeu, 'jour', k, 'prix', v_prix, 'serie', (e->>'n')::int,
    'solde', coalesce((select w.paillettes from hg_wallets w where w.user_id = me), 0));
end $$;

revoke all on function public.hg_quiz_daily__serie(uuid, date, date) from public, anon, authenticated;
revoke all on function public.hg_jeux__etat(text, uuid), public.hg_jeux_joker_prix(int) from public, anon, authenticated;
revoke all on function public.hg_quiz_daily_streak_of(uuid, date) from public, anon, authenticated;
revoke all on function public.hg_jeux_series(), public.hg_jeux_joker_payer(text) from public, anon;
grant execute on function public.hg_jeux_series(), public.hg_jeux_joker_payer(text) to authenticated;
