-- 215 : enchères du Staff dont le lot est un panier, comme le give (maquette « Enchères en panier », validée le 02.11.2026).
-- S'applique après 081 et 097 (enchères du Staff), 196 (give en panier) et 212 (enchères des membres : hg_auction_close et
-- hg_encheres_liste en sont repris).
--
-- Le lot se compose comme un give (hg_cards_admin_give_panier, 196) : des Paillettes, des cartes à l'unité, une série ou un type
-- entier, brillantes ou non, des boosters. Règles validées :
--   - Lot fait seulement de Paillettes : refusé. Paillettes du lot : strictement sous la mise de départ.
--   - Contenu figé à la création : une série ou un type entier devient la liste exacte de ses cartes ce jour-là (lot_cartes).
--     Rien n'est créé avant la clôture ; sans offre, rien n'est créé ni donné.
--   - Une carte unique doit être libre à la création (exemplaires restants, comme chargerRestants côté site), hors drop en cours,
--     et reste réservée jusqu'à la fin (lot_uniques) : le give, les drops et les autres enchères la refusent. Les cartes
--     limitées peuvent dépasser leur maximum, comme dans le give.
--   - Boosters ajoutés au stock du gagnant, non ouverts. Paillettes du lot sur son solde (journal enchere_lot, réf. auc:<id>).
--   - Une seule enchère du Staff à la fois : des dates qui se chevauchent (début → fin + prolongation au plus) sont refusées.
--   - Le Staff qui crée l'enchère ne peut pas enchérir dessus. Offre gagnante détruite en entier ; plafond par défaut 50 %.
--   - Remise : tout en une transaction ; si elle échoue, l'offre est remboursée et l'enchère annulée (règle de 081).
-- Le give et la clôture partagent deux fonctions internes : hg_panier__lire (lecture et contrôle du panier) et
-- hg_panier__creer (exemplaires et boosters). Le give garde exactement son comportement, plus le refus d'une unique réservée.
-- Une enchère d'une seule carte (card_id, avant 215) reste lisible et se clôt comme avant.
-- Rejouable : add column if not exists, create or replace, blocs do.

-- ---------------------------------------------------------------------------
-- 1. Colonnes
-- ---------------------------------------------------------------------------
alter table public.hg_card_auctions alter column card_id drop not null;
alter table public.hg_card_auctions add column if not exists lot_nom text;
alter table public.hg_card_auctions add column if not exists lot_paillettes integer not null default 0;
alter table public.hg_card_auctions add column if not exists lot jsonb;
alter table public.hg_card_auctions add column if not exists lot_cartes jsonb;
alter table public.hg_card_auctions add column if not exists lot_boosters jsonb;
alter table public.hg_card_auctions add column if not exists lot_uniques uuid[] not null default '{}';
alter table public.hg_card_auctions add column if not exists lot_annonce boolean not null default true;
alter table public.hg_card_auctions add column if not exists fil_ouverture_at timestamptz;
alter table public.hg_card_auctions add column if not exists remise jsonb;
comment on column public.hg_card_auctions.lot is 'Lignes du lot, figées à la création (215) : carte, lot (série ou type, n cartes), booster ; titre lisible.';
comment on column public.hg_card_auctions.lot_cartes is 'Exemplaires à créer à la clôture : { "<carte>|<brillante>": quantité } (215).';
comment on column public.hg_card_auctions.lot_uniques is 'Cartes uniques réservées par l''enchère jusqu''à sa fin (215).';
comment on column public.hg_card_auctions.remise is 'Ce que le gagnant a reçu (215) : paillettes, cartes, boosters, nouvelles, series.';
do $c$ begin
  if not exists (select 1 from pg_constraint where conname = 'hg_card_auctions_lot_chk') then
    alter table public.hg_card_auctions add constraint hg_card_auctions_lot_chk check (
      (card_id is not null or lot is not null)
      and (lot_nom is null or char_length(lot_nom) between 1 and 60)
      and lot_paillettes >= 0);
  end if;
end $c$;

-- ---------------------------------------------------------------------------
-- 2. Panier : fonctions internes partagées par le give et les enchères
-- ---------------------------------------------------------------------------
/*
 * Lit et contrôle un panier (format de hg_cards_admin_give_panier, 196). Rend
 * { cartes: { "<carte>|<brillante>": qté }, boosters: { "<type>": qté }, ex, bo, resume: [texte du give],
 *   lignes: [ligne figée + titre (+ n pour un lot)] }. Un lot prend les cartes actives à cet instant.
 */
create or replace function public.hg_panier__lire(p_lignes jsonb)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_l jsonb; v_type text; v_qte bigint; v_shiny boolean; v_set uuid; v_rar text; v_fam text; v_nom text; v_famille text; v_nb int;
  v_card hg_cards; v_booster hg_booster_types; v_detail jsonb; v_cle text; v_titre text;
  v_cartes jsonb := '{}'::jsonb; v_boosters jsonb := '{}'::jsonb; v_ex bigint := 0; v_bo bigint := 0;
  v_resume text[] := '{}'; v_figees jsonb := '[]'::jsonb;
begin
  for v_l in select value from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    v_type := v_l->>'type';
    v_qte := case when v_l->>'qte' ~ '^[0-9]{1,9}$' then (v_l->>'qte')::bigint end;
    if v_qte is null or v_qte < 1 then raise exception 'Quantité invalide dans le panier'; end if;
    v_shiny := coalesce((v_l->>'shiny')::boolean, false);

    if v_type = 'carte' then
      select * into v_card from hg_cards where id = (v_l->>'card')::uuid;
      if not found then raise exception 'Carte introuvable'; end if;
      v_cle := v_card.id::text || '|' || (v_shiny and v_card.can_shiny)::text;
      v_cartes := jsonb_set(v_cartes, array[v_cle], to_jsonb(coalesce((v_cartes->>v_cle)::bigint, 0) + v_qte));
      v_ex := v_ex + v_qte;
      v_resume := v_resume || ((case when v_qte > 1 then v_qte || ' exemplaires de ' else '' end)
        || '« ' || v_card.name || ' » (' || hg_rarity_label(v_card.rarity)
        || case when v_shiny and v_card.can_shiny then ', brillante' else '' end || ')');
      v_figees := v_figees || jsonb_build_object('type', 'carte', 'card', v_card.id, 'qte', v_qte, 'shiny', v_shiny and v_card.can_shiny,
        'titre', v_card.name || case when v_shiny and v_card.can_shiny then ' brillante' else '' end);

    elsif v_type = 'lot' then
      v_set := nullif(v_l->>'set', '')::uuid;
      v_rar := nullif(v_l->>'rarity', '');
      v_fam := nullif(v_l->>'family', '');
      if v_set is null and v_rar is null and v_fam is null then raise exception 'Un lot demande une série, une rareté ou un type'; end if;
      v_nom := null;
      v_famille := replace(initcap(v_fam), 'Evenement', 'Événement');
      if v_set is not null then
        select s.name into v_nom from hg_card_sets s where s.id = v_set;
        if not found then raise exception 'Série introuvable'; end if;
      end if;
      select coalesce(jsonb_object_agg(l.cle, coalesce((v_cartes->>l.cle)::bigint, 0) + v_qte), '{}'::jsonb), count(*)
        into v_detail, v_nb
        from (select k.id::text || '|' || (v_shiny and k.can_shiny)::text as cle from hg_cards k
              where k.active and (v_set is null or k.set_id = v_set)
                and (v_rar is null or k.rarity = v_rar) and (v_fam is null or k.family = v_fam)) l;
      if v_nb = 0 then raise exception 'Aucune carte active dans ce lot'; end if;
      v_cartes := v_cartes || v_detail;
      v_ex := v_ex + v_nb * v_qte;
      v_titre := case
             when v_set is not null and v_rar is null and v_fam is null then 'toute la série « ' || v_nom || ' »'
             when v_set is null and v_rar is not null and v_fam is null then 'tout le type ' || hg_rarity_label(v_rar)
             when v_set is null and v_rar is null then 'tout le type ' || v_famille
             else concat_ws(' · ', '« ' || v_nom || ' »', case when v_rar is not null then hg_rarity_label(v_rar) end, v_famille)
           end;
      v_resume := v_resume || (
        (case when v_qte > 1 then v_qte || ' exemplaires de chaque carte de ' else '' end) || v_titre
        || ' (' || v_nb || ' carte' || case when v_nb > 1 then 's' else '' end
        || case when v_shiny then ', brillantes' else '' end || ')');
      v_figees := v_figees || jsonb_build_object('type', 'lot', 'set', v_set, 'rarity', v_rar, 'family', v_fam, 'qte', v_qte,
        'shiny', v_shiny, 'n', v_nb, 'titre', upper(left(v_titre, 1)) || substr(v_titre, 2));

    elsif v_type = 'booster' then
      select * into v_booster from hg_booster_types where id = v_l->>'booster';
      if not found then raise exception 'Type de booster inconnu'; end if;
      v_boosters := jsonb_set(v_boosters, array[v_booster.id], to_jsonb(coalesce((v_boosters->>v_booster.id)::bigint, 0) + v_qte));
      v_bo := v_bo + v_qte;
      v_resume := v_resume || (v_qte || ' booster' || case when v_qte > 1 then 's' else '' end || ' « ' || v_booster.name || ' »');
      v_figees := v_figees || jsonb_build_object('type', 'booster', 'booster', v_booster.id, 'qte', v_qte, 'titre', v_booster.name);

    else
      raise exception 'Ligne de panier inconnue';
    end if;
  end loop;
  return jsonb_build_object('cartes', v_cartes, 'boosters', v_boosters, 'ex', v_ex, 'bo', v_bo,
    'resume', to_jsonb(v_resume), 'lignes', v_figees);
end $$;

/*
 * Crée les exemplaires et les boosters d'un panier pour chaque membre de p_users (source des exemplaires : p_source),
 * puis vérifie les séries complétées (bonus habituel). Les cartes limitées continuent leurs numéros au-delà du maximum.
 */
create or replace function public.hg_panier__creer(p_users uuid[], p_cartes jsonb, p_boosters jsonb, p_source text)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_u uuid;
begin
  if exists (select 1 from jsonb_each_text(coalesce(p_boosters, '{}'::jsonb))) then
    insert into hg_booster_stock(user_id, type_id, qty)
      select u, b.key, b.value::bigint::int from unnest(p_users) as u cross join jsonb_each_text(p_boosters) b
      on conflict (user_id, type_id) do update set qty = hg_booster_stock.qty + excluded.qty;
  end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_cartes, '{}'::jsonb))) then
    -- Les cartes numérotées sont verrouillées dans un ordre fixe : deux dons simultanés ne prennent pas le même numéro.
    perform 1 from hg_cards k
      where k.max_copies is not null and k.id in (select split_part(e.key, '|', 1)::uuid from jsonb_each_text(p_cartes) e)
      order by k.id for update;
    insert into hg_card_copies(card_id, owner_id, shiny, serial, source)
      with voulu as (
        select split_part(e.key, '|', 1)::uuid as card_id, split_part(e.key, '|', 2)::boolean as shiny, e.value::bigint as qte
          from jsonb_each_text(p_cartes) e
      ), base as (
        select v.card_id, v.shiny, v.qte, k.max_copies,
          case when k.max_copies is not null
            then (select coalesce(max(x.serial), 0) from hg_card_copies x where x.card_id = v.card_id) end as dernier
        from voulu v join hg_cards k on k.id = v.card_id
      )
      select b.card_id, u, b.shiny,
        case when b.max_copies is not null
          then b.dernier + row_number() over (partition by b.card_id order by u, b.shiny, g) end,
        p_source
      from base b
      cross join unnest(p_users) as u
      cross join lateral generate_series(1::bigint, b.qte) as g;
    foreach v_u in array p_users loop
      perform hg_card_check_sets(v_u);
    end loop;
  end if;
end $$;

/* Première carte unique du panier réservée par une enchère du Staff prévue ou ouverte (sauf p_sauf), ou null. */
create or replace function public.hg_panier__reservee(p_cartes jsonb, p_sauf uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select k.name from hg_cards k
   where k.rarity = 'unique'
     and k.id in (select split_part(e.key, '|', 1)::uuid from jsonb_each_text(coalesce(p_cartes, '{}'::jsonb)) e)
     and exists (select 1 from hg_card_auctions a
                  where a.status in ('prevue', 'ouverte') and a.id is distinct from p_sauf
                    and (a.card_id = k.id or k.id = any(a.lot_uniques)))
   order by k.name limit 1
$$;

-- ---------------------------------------------------------------------------
-- 3. Give en panier (reprise de 196) : mêmes contrôles, même résultat, plus le refus d'une carte unique réservée
-- ---------------------------------------------------------------------------
create or replace function public.hg_cards_admin_give_panier(p_users uuid[] default null, p_paillettes integer default 0,
  p_lignes jsonb default '[]'::jsonb, p_announce boolean default true, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  c_max_exemplaires constant bigint := 100000;
  c_max_lignes constant int := 500;
  v_me uuid := auth.uid();
  v_batch text := gen_random_uuid()::text;
  v_paill int := coalesce(p_paillettes, 0);
  v_lignes jsonb := coalesce(p_lignes, '[]'::jsonb);
  v_announce boolean := coalesce(p_announce, true);
  v_ids uuid[];
  v_n int;
  v_nb int;
  r jsonb;
  v_ex_par_membre bigint;
  v_bo_par_membre bigint;
  v_resume text[] := '{}';
  v_noms text[];
  v_giver text;
  v_who text;
  v_obj text;
  v_reservee text;
  v_u uuid;
begin
  if not public.hg_has_perm('cartes') then raise exception 'Réservé à l''admin'; end if;
  if p_note is not null and char_length(p_note) > 200 then raise exception 'La note fait au plus 200 caractères'; end if;
  if v_paill < 0 then raise exception 'Le nombre de Paillettes ne peut pas être négatif'; end if;
  if jsonb_typeof(v_lignes) <> 'array' then raise exception 'Panier illisible'; end if;
  if jsonb_array_length(v_lignes) > c_max_lignes then raise exception 'Au plus % lignes par don', c_max_lignes; end if;

  if p_users is null then
    select array_agg(p.id order by p.pseudo) into v_ids from hg_profiles p where not p.is_ghost;
  else
    select array_agg(x.id) into v_ids
      from (select distinct u.id from unnest(p_users) as u(id)) x
      join hg_profiles p on p.id = x.id
      where not p.is_ghost;
  end if;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then raise exception 'Aucun destinataire valide'; end if;
  if v_n > 200 then raise exception 'Au plus 200 membres par don (% choisis)', v_n; end if;

  if v_paill > 0 then
    v_resume := v_resume || (v_paill || ' Paillettes');
  end if;

  -- Lecture du panier (215 : fonction partagée avec les enchères du Staff).
  r := hg_panier__lire(v_lignes);
  v_ex_par_membre := (r->>'ex')::bigint;
  v_bo_par_membre := (r->>'bo')::bigint;
  v_resume := v_resume || array(select jsonb_array_elements_text(r->'resume'));

  if v_paill = 0 and v_ex_par_membre = 0 and v_bo_par_membre = 0 then raise exception 'Le panier est vide'; end if;
  if v_ex_par_membre * v_n > c_max_exemplaires then
    raise exception 'Ce don crée % exemplaires : le maximum est de % par don', v_ex_par_membre * v_n, c_max_exemplaires;
  end if;
  -- 215 : une carte unique mise aux enchères est réservée jusqu'à la fin de l'enchère.
  v_reservee := hg_panier__reservee(r->'cartes', null);
  if v_reservee is not null then
    raise exception '« % » est réservée par une enchère du Staff jusqu’à sa fin', v_reservee;
  end if;

  if v_paill > 0 or v_bo_par_membre > 0 then
    insert into hg_wallets(user_id) select u from unnest(v_ids) as u on conflict do nothing;
    perform 1 from hg_wallets where user_id = any(v_ids) order by user_id for update;
  end if;
  if v_paill > 0 then
    if exists (select 1 from hg_wallets w where w.user_id = any(v_ids) and w.paillettes::bigint + v_paill > 2147483647) then
      raise exception 'Ce don dépasse le solde maximum de Paillettes d''un membre';
    end if;
    foreach v_u in array v_ids loop
      perform hg_wallet_add(v_u, v_paill, 'don_admin', 'don_groupe:' || v_batch);
    end loop;
  end if;

  perform hg_panier__creer(v_ids, r->'cartes', r->'boosters', 'admin');

  perform hg_admin_audit('don_groupe', null, 'panier', jsonb_build_object(
    'lot', v_batch, 'paillettes', v_paill, 'exemplaires', v_ex_par_membre, 'boosters', v_bo_par_membre,
    'resume', to_jsonb(v_resume), 'lignes', v_lignes,
    'membres', v_n, 'tout_le_gang', p_users is null, 'annonce', v_announce,
    'note', nullif(btrim(coalesce(p_note, '')), ''), 'destinataires', to_jsonb(v_ids)));

  select array_agg(p.pseudo order by p.pseudo) into v_noms from hg_profiles p where p.id = any(v_ids);
  if v_announce then
    select p.pseudo into v_giver from hg_profiles p where p.id = v_me;
    v_nb := array_length(v_resume, 1);
    if v_nb = 1 then
      v_obj := v_resume[1];
    elsif v_nb <= 3 then
      v_obj := array_to_string(v_resume[1:v_nb - 1], ', ') || ' et ' || v_resume[v_nb];
    else
      v_obj := array_to_string(v_resume[1:3], ', ') || ' et ' || (v_nb - 3) || ' autre' || case when v_nb > 4 then 's' else '' end
        || ' cadeau' || case when v_nb > 4 then 'x' else '' end;
    end if;
    if p_users is null then
      v_who := 'tout le gang';
    elsif v_n = 1 then
      v_who := v_noms[1];
    elsif v_n <= 3 then
      v_who := array_to_string(v_noms[1:v_n - 1], ', ') || ' et ' || v_noms[v_n];
    else
      v_who := v_noms[1] || ', ' || v_noms[2] || ' et ' || (v_n - 2) || ' autres';
    end if;
    insert into hg_activity(user_id, kind, text)
      values (v_me, 'cartes', coalesce(v_giver, 'L''admin') || ' a offert ' || v_obj || ' à ' || v_who || ' !');
  end if;

  return jsonb_build_object('membres', v_n, 'paillettes', v_paill, 'exemplaires', v_ex_par_membre, 'boosters', v_bo_par_membre,
    'annonce', v_announce, 'batch', v_batch, 'resume', to_jsonb(v_resume));
end $function$;

-- ---------------------------------------------------------------------------
-- 4. Drops (reprise de 055) : une carte unique réservée par une enchère ne se lance pas en drop
-- ---------------------------------------------------------------------------
create or replace function public.hg_drop_create(p_card uuid, p_shiny boolean default false, p_quantity integer default 1, p_minutes integer default 30, p_announce boolean default true)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare k hg_cards; did uuid; ann boolean := coalesce(p_announce, true); sh boolean := coalesce(p_shiny, false);
  -- Plafond lu dans cards.drops.quantite_max (défaut 50) ; borné à 1000 par la contrainte technique de la table
  v_qmax int := least(coalesce((hg_card_cfg()#>>'{drops,quantite_max}')::int, 50), 1000);
  v_dmax int := coalesce((hg_card_cfg()#>>'{drops,duree_max_min}')::int, 1440);
begin
  if not public.hg_has_perm('cartes') then raise exception 'Réservé à l''admin'; end if;
  select * into k from hg_cards where id = p_card;
  if not found or not k.active then raise exception 'Carte introuvable ou inactive'; end if;
  if coalesce(p_quantity, 0) < 1 or p_quantity > v_qmax then raise exception 'La quantité doit être entre 1 et %.', v_qmax; end if;
  if coalesce(p_minutes, 0) < 1 or p_minutes > v_dmax then raise exception 'La durée doit être entre 1 et % minutes.', v_dmax; end if;
  if sh and not k.can_shiny then raise exception 'Cette carte ne peut pas être brillante.'; end if;
  -- 215 : carte unique réservée par une enchère du Staff.
  if hg_panier__reservee(jsonb_build_object(k.id::text || '|false', 1), null) is not null then
    raise exception 'Cette carte unique est réservée par une enchère du Staff jusqu’à sa fin.';
  end if;
  insert into hg_card_drops(card_id, shiny, quantity, starts_at, ends_at, created_by, announce)
    values (p_card, sh, p_quantity, now(), now() + make_interval(mins => p_minutes), auth.uid(), ann)
    returning id into did;
  if ann then
    insert into hg_activity(user_id, kind, text) values (null, 'cartes', 'Une carte sauvage est apparue !');
  end if;
  perform public.hg_admin_audit('drop_lance', null, did::text,
    jsonb_build_object('carte', k.name, 'brillante', sh, 'exemplaires', p_quantity, 'minutes', p_minutes, 'annonce', ann));
  return did;
end $function$;

-- ---------------------------------------------------------------------------
-- 5. Enchères du Staff : outils internes
-- ---------------------------------------------------------------------------
/* Enchère du Staff dont les dates (début → fin + prolongation au plus) chevauchent [p_debut, p_fin), sauf p_sauf ; rend
   un texte « « nom » (du jj.mm hh:mm au jj.mm hh:mm) », ou null. */
create or replace function public.hg_auction__chevauche(p_debut timestamptz, p_fin timestamptz, p_sauf uuid)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select '« ' || coalesce(a.lot_nom, k.name, 'enchère') || ' » (du '
      || to_char(a.starts_at at time zone 'Europe/Zurich', 'DD.MM HH24:MI') || ' au '
      || to_char(a.ends_at at time zone 'Europe/Zurich', 'DD.MM HH24:MI') || ')'
    from hg_card_auctions a left join hg_cards k on k.id = a.card_id
   where a.status in ('prevue', 'ouverte') and a.id is distinct from p_sauf
     and tstzrange(a.starts_at, a.hard_end_at) && tstzrange(p_debut, p_fin)
   order by a.starts_at limit 1
$$;

/* Lot d'une enchère, tel qu'envoyé aux pages : nom, Paillettes, nombres, lignes enrichies (carte : hg_encheres__carte,
   booster : nom, taille, style). Null pour une enchère d'une seule carte (avant 215). */
create or replace function public.hg_auction__lot_json(a public.hg_card_auctions)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when a.lot is null then null else jsonb_build_object(
    'nom', a.lot_nom, 'paillettes', a.lot_paillettes,
    'cartes', (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(coalesce(a.lot_cartes, '{}'::jsonb)) e),
    'boosters', (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(coalesce(a.lot_boosters, '{}'::jsonb)) e),
    'lignes', (select coalesce(jsonb_agg(case l.v->>'type'
        when 'carte' then l.v || jsonb_build_object('card', hg_encheres__carte((l.v->>'card')::uuid, null))
        when 'booster' then l.v || jsonb_build_object('type_booster',
          (select jsonb_build_object('id', t.id, 'name', t.name, 'size', t.size, 'style', t.style) from hg_booster_types t where t.id = l.v->>'booster'))
        else l.v end order by l.i), '[]'::jsonb)
      from jsonb_array_elements(a.lot) with ordinality as l(v, i))) end
$$;

/*
 * Remise du lot au gagnant (clôture). Vérifie que les cartes uniques sont toujours libres, verse les Paillettes du lot,
 * crée les exemplaires (source « evenement ») et les boosters. Rend ce qui a été reçu : paillettes, cartes, boosters,
 * nouvelles (cartes que le gagnant n'avait pas), series (séries complétées par ce lot).
 */
create or replace function public.hg_auction__remettre(a public.hg_card_auctions, p_user uuid)
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare u record; v_nouv int; v_series jsonb;
begin
  for u in
    select k.id, k.name, coalesce(k.max_copies, 1) - greatest(
        (select coalesce(max(x.serial), 0) from hg_card_copies x where x.card_id = k.id),
        (select count(*) from hg_card_copies x where x.card_id = k.id and x.recycled_at is null)) as restant,
      (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(a.lot_cartes) e where split_part(e.key, '|', 1)::uuid = k.id) as qte
      from hg_cards k where k.id = any(a.lot_uniques) order by k.id for update of k
  loop
    if u.qte > u.restant then raise exception '« % » a déjà été attribuée', u.name; end if;
  end loop;
  select count(distinct split_part(e.key, '|', 1)) into v_nouv from jsonb_each_text(coalesce(a.lot_cartes, '{}'::jsonb)) e
   where not exists (select 1 from hg_card_copies x where x.card_id = split_part(e.key, '|', 1)::uuid and x.owner_id = p_user and x.recycled_at is null);
  if a.lot_paillettes > 0 then
    perform 1 from hg_wallets where user_id = p_user for update;
    if not hg_wallet_add(p_user, a.lot_paillettes, 'enchere_lot', 'auc:' || a.id) then raise exception 'Lot déjà remis'; end if;
  end if;
  perform hg_panier__creer(array[p_user], coalesce(a.lot_cartes, '{}'::jsonb), coalesce(a.lot_boosters, '{}'::jsonb), 'evenement');
  -- Séries complétées par ce lot : bonus versé dans cette transaction (même now()).
  select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb) into v_series
    from hg_wallet_log l join hg_card_sets s on l.ref = 'set:' || s.id
   where l.user_id = p_user and l.reason = 'serie_complete' and l.created_at = now();
  return jsonb_build_object('paillettes', a.lot_paillettes,
    'cartes', (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(coalesce(a.lot_cartes, '{}'::jsonb)) e),
    'boosters', (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(coalesce(a.lot_boosters, '{}'::jsonb)) e),
    'nouvelles', v_nouv, 'series', v_series);
end $$;

-- ---------------------------------------------------------------------------
-- 6. Création (reprise de 097) : le lot est un panier
-- ---------------------------------------------------------------------------
/*
 * Staff « cartes » : planifie une enchère. p = { nom, paillettes, lignes (format du give), annonce, starts_at, ends_at,
 * min_bid, step, max_bid?, cap_pct?, extend_min?, extend_cap_min?, max_bids_user?, block_last_winner? }.
 * Repli (avant 215) : p.card_id seul devient un lot d'une ligne, nommé comme la carte.
 */
create or replace function public.hg_auction_create(p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare v_start timestamptz; v_end timestamptz; v_min int; v_step int; v_id uuid;
  v_max int; v_pct int; v_ext int; v_extcap int; v_nb int; v_block boolean;
  v_lignes jsonb; v_nom text; v_paill int; r jsonb; v_ex bigint; v_bo bigint; u record; v_uniq uuid[] := '{}'; v_txt text;
begin
  if not hg_has_perm('cartes') then raise exception 'Réservé au Staff « cartes »'; end if;
  -- Une création à la fois : le contrôle des dates qui se chevauchent ne court pas.
  perform pg_advisory_xact_lock(hashtextextended('hg_auction_create', 0));
  if nullif(p->>'card_id', '') is not null and not (p ? 'lignes') then
    select k.name into v_nom from hg_cards k where k.id = (p->>'card_id')::uuid;
    if not found then raise exception 'Choisis une carte'; end if;
    v_lignes := jsonb_build_array(jsonb_build_object('type', 'carte', 'card', p->>'card_id', 'qte', 1));
  else
    v_lignes := coalesce(p->'lignes', '[]'::jsonb);
    v_nom := btrim(coalesce(p->>'nom', ''));
  end if;
  if coalesce(v_nom, '') = '' then raise exception 'Donne un nom au lot'; end if;
  if char_length(v_nom) > 60 then raise exception 'Le nom du lot fait au plus 60 caractères'; end if;
  if btrim(coalesce(p->>'paillettes', '')) = '' then v_paill := 0;
  elsif btrim(p->>'paillettes') ~ '^\d{1,9}$' then v_paill := btrim(p->>'paillettes')::int;
  else raise exception 'Indique un nombre entier de Paillettes';
  end if;
  if jsonb_typeof(v_lignes) <> 'array' then raise exception 'Lot illisible'; end if;
  if jsonb_array_length(v_lignes) > 500 then raise exception 'Au plus 500 lignes par lot'; end if;
  r := hg_panier__lire(v_lignes);
  v_ex := (r->>'ex')::bigint; v_bo := (r->>'bo')::bigint;
  if v_ex = 0 and v_bo = 0 then
    if v_paill > 0 then raise exception 'Un lot fait seulement de Paillettes n’est pas accepté : ajoute au moins une carte ou un booster.'; end if;
    raise exception 'Le lot est vide : ajoute des cartes, des boosters ou des Paillettes.';
  end if;
  if v_ex > 100000 then raise exception 'Ce lot crée % exemplaires : le maximum est de 100 000', v_ex; end if;

  v_start := coalesce(nullif(p->>'starts_at', '')::timestamptz, now());
  v_end := nullif(p->>'ends_at', '')::timestamptz;
  if v_end is null then raise exception 'Indique la fin de l’enchère'; end if;
  if v_end <= greatest(v_start, now()) + interval '30 minutes' then raise exception 'L’enchère dure au moins 30 minutes'; end if;
  if v_end - v_start > interval '7 days' then raise exception 'L’enchère dure 7 jours au plus'; end if;
  if v_start > now() + interval '60 days' then raise exception 'Début : dans 60 jours au plus'; end if;
  v_min := hg_auction_opt_int(p, 'min_bid', 1, 100000, 'Mise de départ');
  v_step := hg_auction_opt_int(p, 'step', 1, 10000, 'Pas minimal');
  if v_min is null then raise exception 'Mise de départ : de 1 à 100 000'; end if;
  if v_step is null then raise exception 'Pas minimal : de 1 à 10 000'; end if;
  if v_paill >= v_min then
    raise exception 'La mise de départ doit dépasser les Paillettes du lot (% Paillettes) : sinon le gagnant repart avec plus de Paillettes qu’il n’en a payé.', v_paill;
  end if;
  v_max := hg_auction_opt_int(p, 'max_bid', 1, 1000000, 'Mise maximale');
  if v_max is not null and v_max < v_min then raise exception 'La mise maximale doit être au moins la mise de départ'; end if;
  v_pct := case when p ? 'cap_pct' then hg_auction_opt_int(p, 'cap_pct', 1, 100, 'Plafond (% du solde)') else 50 end;
  v_ext := coalesce(hg_auction_opt_int(p, 'extend_min', 0, 60, 'Prolongation'), 5);
  v_extcap := coalesce(hg_auction_opt_int(p, 'extend_cap_min', 0, 1440, 'Prolongation totale'), 60);
  v_nb := hg_auction_opt_int(p, 'max_bids_user', 1, 1000, 'Offres par membre');
  v_block := coalesce((p->>'block_last_winner')::boolean, true);

  -- Cartes uniques : libres (exemplaires restants), hors drop en cours, pas déjà dans une autre enchère.
  for u in
    select k.id, k.name, coalesce(k.max_copies, 1) - greatest(
        (select coalesce(max(x.serial), 0) from hg_card_copies x where x.card_id = k.id),
        (select count(*) from hg_card_copies x where x.card_id = k.id and x.recycled_at is null)) as restant,
      (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(r->'cartes') e where split_part(e.key, '|', 1)::uuid = k.id) as qte
      from hg_cards k
     where k.rarity = 'unique' and k.id in (select split_part(e.key, '|', 1)::uuid from jsonb_each_text(r->'cartes') e)
     order by k.id for update of k
  loop
    if u.restant <= 0 then
      raise exception '« % » a été attribuée entre-temps : une carte unique déjà attribuée ne se met pas aux enchères. Retire-la du lot.', u.name;
    end if;
    if u.qte > u.restant then raise exception 'Plus que % exemplaires libres de « % » : retire les autres du lot.', u.restant, u.name; end if;
    if exists (select 1 from hg_card_drops d where d.card_id = u.id and d.ends_at > now()) then
      raise exception '« % » est dans un drop en cours : attends sa fin.', u.name;
    end if;
    v_uniq := v_uniq || u.id;
  end loop;
  v_txt := hg_panier__reservee(r->'cartes', null);
  if v_txt is not null then raise exception '« % » est déjà réservée par une autre enchère du Staff', v_txt; end if;
  v_txt := hg_auction__chevauche(v_start, v_end + make_interval(mins => v_extcap), null);
  if v_txt is not null then
    raise exception 'Une seule enchère du Staff à la fois : % occupe déjà ces dates.', v_txt;
  end if;

  insert into hg_card_auctions(card_id, starts_at, ends_at, hard_end_at, min_bid, step, created_by,
      max_bid, cap_pct, extend_min, extend_cap_min, max_bids_user, block_last_winner,
      lot_nom, lot_paillettes, lot, lot_cartes, lot_boosters, lot_uniques, lot_annonce)
    values (null, v_start, v_end, v_end + make_interval(mins => v_extcap), v_min, v_step, auth.uid(),
      v_max, v_pct, v_ext, v_extcap, v_nb, v_block,
      v_nom, v_paill, r->'lignes', r->'cartes', r->'boosters', v_uniq, coalesce((p->>'annonce')::boolean, true)) returning id into v_id;
  perform hg_admin_audit('enchere_creee', null, v_id::text, jsonb_build_object('nom', v_nom, 'paillettes', v_paill,
    'exemplaires', v_ex, 'boosters', v_bo, 'resume', r->'resume', 'debut', v_start, 'fin', v_end,
    'mise', v_min, 'pas', v_step, 'max', v_max, 'plafond_pct', v_pct, 'prolongation', v_ext, 'prolongation_max', v_extcap,
    'offres_par_membre', v_nb, 'gagnant_exclu', v_block));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Modification (reprise de 097) : mise de départ au-dessus des Paillettes du lot, dates sans chevauchement
-- ---------------------------------------------------------------------------
create or replace function public.hg_auction_update(p_id uuid, p jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare a hg_card_auctions; v_start timestamptz; v_end timestamptz; v_min int; v_step int;
  v_max int; v_pct int; v_ext int; v_extcap int; v_nb int; v_block boolean; v_started boolean; v_top int; v_txt text;
begin
  if not hg_has_perm('cartes') then raise exception 'Réservé au Staff « cartes »'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hg_auction_create', 0));
  perform pg_advisory_xact_lock(hashtextextended('hg_auction:' || coalesce(p_id::text, ''), 0));
  select * into a from hg_card_auctions where id = p_id for update;
  if not found then raise exception 'Enchère introuvable'; end if;
  if a.status not in ('prevue', 'ouverte') then raise exception 'Cette enchère est déjà terminée'; end if;
  v_started := a.starts_at <= now();
  v_start := case when v_started then a.starts_at else coalesce(nullif(p->>'starts_at', '')::timestamptz, a.starts_at) end;
  v_end := coalesce(nullif(p->>'ends_at', '')::timestamptz, a.ends_at);
  if v_started then
    if v_end < now() + interval '5 minutes' then raise exception 'La fin doit être dans 5 minutes au moins'; end if;
  else
    if v_end <= greatest(v_start, now()) + interval '30 minutes' then raise exception 'L’enchère dure au moins 30 minutes'; end if;
    if v_start > now() + interval '60 days' then raise exception 'Début : dans 60 jours au plus'; end if;
  end if;
  if v_end - v_start > interval '7 days' then raise exception 'L’enchère dure 7 jours au plus'; end if;
  v_min := coalesce(hg_auction_opt_int(p, 'min_bid', 1, 100000, 'Mise de départ'), a.min_bid);
  if a.top_bid is not null and v_min <> a.min_bid then raise exception 'La mise de départ ne change plus après la première offre'; end if;
  if a.lot is not null and a.lot_paillettes >= v_min then
    raise exception 'La mise de départ doit dépasser les Paillettes du lot (% Paillettes) : sinon le gagnant repart avec plus de Paillettes qu’il n’en a payé.', a.lot_paillettes;
  end if;
  v_step := coalesce(hg_auction_opt_int(p, 'step', 1, 10000, 'Pas minimal'), a.step);
  v_max := hg_auction_opt_int(p, 'max_bid', 1, 1000000, 'Mise maximale');
  if v_max is not null and v_max < v_min then raise exception 'La mise maximale doit être au moins la mise de départ'; end if;
  select b.amount into v_top from hg_card_bids b where b.id = a.top_bid;
  if v_max is not null and v_top is not null and v_max < v_top then raise exception 'La mise maximale est sous la meilleure offre (% Paillettes)', v_top; end if;
  v_pct := hg_auction_opt_int(p, 'cap_pct', 1, 100, 'Plafond (% du solde)');
  v_ext := coalesce(hg_auction_opt_int(p, 'extend_min', 0, 60, 'Prolongation'), 0);
  v_extcap := coalesce(hg_auction_opt_int(p, 'extend_cap_min', 0, 1440, 'Prolongation totale'), 0);
  v_nb := hg_auction_opt_int(p, 'max_bids_user', 1, 1000, 'Offres par membre');
  v_block := coalesce((p->>'block_last_winner')::boolean, a.block_last_winner);
  v_txt := hg_auction__chevauche(v_start, v_end + make_interval(mins => v_extcap), a.id);
  if v_txt is not null then
    raise exception 'Une seule enchère du Staff à la fois : % occupe déjà ces dates.', v_txt;
  end if;
  update hg_card_auctions set starts_at = v_start, ends_at = v_end, hard_end_at = v_end + make_interval(mins => v_extcap),
      min_bid = v_min, step = v_step, max_bid = v_max, cap_pct = v_pct, extend_min = v_ext, extend_cap_min = v_extcap,
      max_bids_user = v_nb, block_last_winner = v_block
    where id = a.id returning * into a;
  perform hg_admin_audit('enchere_modifiee', null, a.id::text, hg_auction_rules_json(a)
    || jsonb_build_object('carte', a.card_id, 'nom', a.lot_nom, 'debut', a.starts_at, 'fin', a.ends_at));
  return hg_auction_rules_json(a) || jsonb_build_object('starts_at', a.starts_at, 'ends_at', a.ends_at);
end $$;

-- ---------------------------------------------------------------------------
-- 8. Offre (reprise de 097) : le Staff qui a créé l'enchère ne peut pas enchérir dessus
-- ---------------------------------------------------------------------------
create or replace function public.hg_auction_bid(p_auction uuid, p_amount integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid(); a hg_card_auctions; top hg_card_bids; v_min int; v_cap int; bal int; v_bid bigint; last_win uuid;
  v_end timestamptz; v_mine int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000 then raise exception 'Montant invalide'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hg_auction:' || coalesce(p_auction::text, ''), 0));
  select * into a from hg_card_auctions where id = p_auction for update;
  if not found or a.status not in ('prevue', 'ouverte') or a.starts_at > now() then raise exception 'Cette enchère n’est pas ouverte'; end if;
  if a.ends_at <= now() then raise exception 'L’enchère est terminée'; end if;
  if a.created_by = me then raise exception 'Tu as créé cette enchère : tu ne peux pas enchérir dessus'; end if;
  select * into top from hg_card_bids where id = a.top_bid;
  if top.user_id = me then raise exception 'Tu as déjà la meilleure offre'; end if;
  v_min := case when top.id is null then a.min_bid else top.amount + a.step end;
  if p_amount < v_min then raise exception 'L’offre minimale est de % Paillettes', v_min; end if;
  if a.max_bid is not null and p_amount > a.max_bid then raise exception 'Mise maximale de cette enchère : % Paillettes', a.max_bid; end if;
  if a.block_last_winner then
    select x.winner into last_win from hg_card_auctions x where x.status = 'close' and x.winner is not null and x.id <> a.id order by x.closed_at desc limit 1;
    if last_win = me then raise exception 'Tu as gagné la dernière enchère : laisse sa chance aux autres cette fois'; end if;
  end if;
  if a.max_bids_user is not null then
    select count(*) into v_mine from hg_card_bids where auction_id = a.id and user_id = me;
    if v_mine >= a.max_bids_user then raise exception 'Tu as fait le nombre maximal d’offres pour cette enchère (%)', a.max_bids_user; end if;
  end if;
  insert into hg_wallets(user_id) values (me) on conflict do nothing;
  perform 1 from hg_wallets where user_id in (me, top.user_id) order by user_id for update;
  select paillettes into bal from hg_wallets where user_id = me;
  if a.cap_pct is not null then
    v_cap := hg_auction_cap(me, a.cap_pct);
    if p_amount > v_cap then raise exception 'Plafond : % Paillettes (% %% de ton solde de lundi)', v_cap, a.cap_pct; end if;
  end if;
  if p_amount > bal then raise exception 'Pas assez de Paillettes (il en faut %)', p_amount; end if;
  insert into hg_card_bids(auction_id, user_id, amount) values (a.id, me, p_amount) returning id into v_bid;
  if not hg_wallet_add(me, -p_amount, 'enchere', 'bid:' || v_bid) then raise exception 'Offre déjà enregistrée'; end if;
  if top.id is not null then
    perform hg_wallet_add(top.user_id, top.amount, 'enchere_remboursee', 'bid:' || top.id);
    update hg_card_bids set refunded_at = now() where id = top.id;
  end if;
  v_end := a.ends_at;
  if a.extend_min > 0 and a.ends_at - now() < make_interval(mins => a.extend_min) then
    v_end := least(now() + make_interval(mins => a.extend_min), a.hard_end_at);
  end if;
  update hg_card_auctions set top_bid = v_bid, status = 'ouverte', ends_at = greatest(v_end, a.ends_at) where id = a.id;
  return jsonb_build_object('bid', v_bid, 'amount', p_amount, 'ends_at', greatest(v_end, a.ends_at),
    'outbid', case when top.id is null then null else top.user_id end);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Clôture (reprise de 212) : annonce d'ouverture et remise du lot
-- ---------------------------------------------------------------------------
create or replace function public.hg_auction_close()
returns integer
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare a hg_card_auctions; b hg_card_bids; cp bigint; n int := 0; v_name text; v_remise jsonb;
begin
  -- 215 : ouverture d'une enchère en lot annoncée une fois dans le fil (si l'admin l'a demandé).
  for a in select * from hg_card_auctions where status in ('prevue', 'ouverte') and lot is not null and lot_annonce
             and fil_ouverture_at is null and starts_at <= now() and ends_at > now() for update skip locked loop
    update hg_card_auctions set fil_ouverture_at = now() where id = a.id;
    insert into hg_activity(user_id, kind, text) values (null, 'cartes', 'L’enchère de la semaine est ouverte : « ' || a.lot_nom || ' » !');
  end loop;
  for a in select * from hg_card_auctions where status in ('prevue', 'ouverte') and ends_at <= now() order by ends_at for update skip locked loop
    select * into b from hg_card_bids where id = a.top_bid;
    if b.id is null then
      -- Sans offre : rien n'est créé ni donné.
      update hg_card_auctions set status = 'close', closed_at = now() where id = a.id;
    else
      begin
        if a.lot is null then
          cp := hg_card_give(b.user_id, a.card_id, false, 'evenement');
          update hg_card_auctions set status = 'close', closed_at = now(), winner = b.user_id, price = b.amount, copy_id = cp where id = a.id;
          select k.name into v_name from hg_cards k where k.id = a.card_id;
          perform hg_card_check_sets(b.user_id);
        else
          v_remise := hg_auction__remettre(a, b.user_id);
          update hg_card_auctions set status = 'close', closed_at = now(), winner = b.user_id, price = b.amount, remise = v_remise where id = a.id;
          v_name := a.lot_nom;
        end if;
        if a.lot is null or a.lot_annonce then
          insert into hg_activity(user_id, kind, text)
            select b.user_id, 'cartes', p.pseudo || ' remporte l’enchère de « ' || v_name || ' » pour ' || b.amount || ' Paillettes !'
              from hg_profiles p where p.id = b.user_id and not p.is_ghost;
        end if;
      exception when others then
        perform hg_wallet_add(b.user_id, b.amount, 'enchere_remboursee', 'bid:' || b.id);
        update hg_card_bids set refunded_at = now() where id = b.id;
        update hg_card_auctions set status = 'annulee', closed_at = now() where id = a.id;
      end;
    end if;
    n := n + 1;
  end loop;
  -- 212 : enchères des membres (clôture et alertes de fin proche).
  n := n + hg_encheres__cloture();
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Lectures (reprises de 097 et 212)
-- ---------------------------------------------------------------------------
-- Membre : enchère en cours (ou la prochaine, ou la dernière close depuis 2 jours), 10 dernières offres, règles, lot,
-- et pour moi : plafond effectif, offres restantes, gagnant de la précédente, créateur de l'enchère, ce que j'ai reçu.
create or replace function public.hg_auction_current()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare me uuid := auth.uid(); a hg_card_auctions; top hg_card_bids; last_win uuid; v_cap int; v_mine int;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_auction_close();
  -- 215 : l'enchère ouverte d'abord ; sinon la dernière close depuis 2 jours (le gagnant voit ce qu'il a reçu même si la
  -- suivante est déjà préparée) ; sinon la prochaine prévue.
  select * into a from hg_card_auctions where status in ('ouverte', 'prevue') and starts_at <= now() order by starts_at limit 1;
  if a.id is null then
    select * into a from hg_card_auctions where status = 'close' and closed_at > now() - interval '2 days' order by closed_at desc limit 1;
  end if;
  if a.id is null then
    select * into a from hg_card_auctions where status = 'prevue' order by starts_at limit 1;
  end if;
  if a.id is null then return jsonb_build_object('auction', null, 'can_admin', hg_has_perm('cartes')); end if;
  select * into top from hg_card_bids where id = a.top_bid;
  select x.winner into last_win from hg_card_auctions x where x.status = 'close' and x.winner is not null and x.id <> a.id order by x.closed_at desc limit 1;
  v_cap := least(hg_auction_cap(me, a.cap_pct), coalesce(a.max_bid, 1000000), coalesce((select w.paillettes from hg_wallets w where w.user_id = me), 0));
  select count(*) into v_mine from hg_card_bids where auction_id = a.id and user_id = me;
  return jsonb_build_object(
    'can_admin', hg_has_perm('cartes'),
    'rules', hg_auction_rules_json(a),
    'auction', jsonb_build_object('id', a.id, 'status', case when a.status = 'prevue' and a.starts_at <= now() then 'ouverte' else a.status end,
      'starts_at', a.starts_at, 'ends_at', a.ends_at, 'hard_end_at', a.hard_end_at, 'min_bid', a.min_bid, 'step', a.step,
      'next_min', case when top.id is null then a.min_bid else top.amount + a.step end,
      'price', a.price, 'winner', (select p.pseudo from hg_profiles p where p.id = a.winner), 'won', a.winner = me,
      'card', (select jsonb_build_object('id', k.id, 'name', k.name, 'rarity', k.rarity, 'family', k.family, 'image_url', k.image_url,
                 'flavor', k.flavor, 'caption', k.caption, 'number', k.number, 'max_copies', k.max_copies, 'set_id', k.set_id)
               from hg_cards k where k.id = a.card_id),
      'lot', hg_auction__lot_json(a),
      'remise', case when a.winner = me then a.remise end,
      'top', case when top.id is null then null else jsonb_build_object('amount', top.amount, 'mine', top.user_id = me,
        'pseudo', (select p.pseudo from hg_profiles p where p.id = top.user_id),
        'avatar_url', (select p.avatar_url from hg_profiles p where p.id = top.user_id),
        'color', (select p.color from hg_profiles p where p.id = top.user_id)) end),
    'bids', (select coalesce(jsonb_agg(jsonb_build_object('amount', b.amount, 'created_at', b.created_at, 'mine', b.user_id = me,
               'pseudo', p.pseudo, 'avatar_url', p.avatar_url, 'color', p.color) order by b.created_at desc), '[]'::jsonb)
             from (select * from hg_card_bids where auction_id = a.id order by created_at desc limit 10) b
             left join hg_profiles p on p.id = b.user_id),
    'me', jsonb_build_object('cap', greatest(v_cap, 0), 'last_winner', a.block_last_winner and last_win = me,
      'createur', a.created_by = me,
      'bids', v_mine, 'bids_left', case when a.max_bids_user is null then null else greatest(a.max_bids_user - v_mine, 0) end,
      'balance', (select w.paillettes from hg_wallets w where w.user_id = me)));
end $$;

-- Staff « cartes » : 50 dernières enchères, avec leurs règles et leur lot (card_name : nom du lot, ou de la carte avant 215).
create or replace function public.hg_auctions_admin()
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public'
as $$
declare res jsonb;
begin
  if not hg_has_perm('cartes') then raise exception 'Réservé au Staff « cartes »'; end if;
  perform hg_auction_close();
  select coalesce(jsonb_agg(x order by x->>'starts_at' desc), '[]'::jsonb) into res from (
    select jsonb_build_object('id', a.id, 'card_id', a.card_id, 'card_name', coalesce(a.lot_nom, k.name), 'starts_at', a.starts_at, 'ends_at', a.ends_at,
      'min_bid', a.min_bid, 'step', a.step, 'status', a.status, 'price', a.price,
      'started', a.starts_at <= now(), 'rules', hg_auction_rules_json(a),
      'lot', hg_auction__lot_json(a), 'lot_uniques', to_jsonb(a.lot_uniques), 'remise', a.remise,
      'winner', (select p.pseudo from hg_profiles p where p.id = a.winner),
      'top', (select b.amount from hg_card_bids b where b.id = a.top_bid),
      'top_pseudo', (select p.pseudo from hg_card_bids b join hg_profiles p on p.id = b.user_id where b.id = a.top_bid),
      'bids', (select count(*) from hg_card_bids b where b.auction_id = a.id)) as x
    from hg_card_auctions a left join hg_cards k on k.id = a.card_id order by a.starts_at desc limit 50) s;
  return res;
end $$;

/* Enchères ouvertes (reprise de 212) : l'encart de l'enchère de la semaine reçoit le nom et le contenu du lot. */
create or replace function public.hg_encheres_liste()
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v_sem jsonb;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  perform hg_encheres__cloture();
  select jsonb_build_object('name', coalesce(s.lot_nom, k.name), 'ends_at', s.ends_at, 'top', (select b.amount from hg_card_bids b where b.id = s.top_bid),
      'lot', case when s.lot is null then null else jsonb_build_object('paillettes', s.lot_paillettes,
        'cartes', (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(coalesce(s.lot_cartes, '{}'::jsonb)) e),
        'boosters', (select coalesce(sum(e.value::bigint), 0) from jsonb_each_text(coalesce(s.lot_boosters, '{}'::jsonb)) e)) end) into v_sem
    from hg_card_auctions s left join hg_cards k on k.id = s.card_id
   where s.status in ('prevue', 'ouverte') and s.starts_at <= now() and s.ends_at > now()
   order by s.ends_at limit 1;
  return jsonb_build_object('now', now(), 'semaine', v_sem,
    'encheres', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'card', hg_encheres__carte(a.card_id, a.copy_id),
        'vendeur', hg_encheres__membre(a.seller), 'mine', a.seller = me, 'ends_at', a.ends_at, 'fin_prevue', a.fin_prevue,
        'duree_min', a.duree_min, 'min_bid', a.min_bid,
        'top', (select jsonb_build_object('amount', b.amount, 'pseudo', p.pseudo, 'mine', b.user_id = me)
                  from hg_card_member_bids b left join hg_profiles p on p.id = b.user_id where b.id = a.top_bid),
        'n', (select count(*) from hg_card_member_bids b where b.auction_id = a.id)) order by a.ends_at)
      from hg_card_member_auctions a where a.status = 'ouverte'), '[]'::jsonb),
    'me', jsonb_build_object('ventes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'copy_id', copy_id))
      from hg_card_member_auctions where seller = me and status = 'ouverte'), '[]'::jsonb)));
end $$;

-- ---------------------------------------------------------------------------
-- 11. Droits
-- ---------------------------------------------------------------------------
-- Fonctions internes : fermées à tous.
revoke all on function public.hg_panier__lire(jsonb), public.hg_panier__creer(uuid[], jsonb, jsonb, text),
  public.hg_panier__reservee(jsonb, uuid), public.hg_auction__chevauche(timestamptz, timestamptz, uuid),
  public.hg_auction__lot_json(public.hg_card_auctions), public.hg_auction__remettre(public.hg_card_auctions, uuid)
  from public, anon, authenticated;

do $g$
declare f text;
begin
  foreach f in array array['hg_auction_current()', 'hg_auction_bid(uuid, integer)', 'hg_auction_create(jsonb)',
    'hg_auction_update(uuid, jsonb)', 'hg_auctions_admin()', 'hg_encheres_liste()',
    'hg_cards_admin_give_panier(uuid[], integer, jsonb, boolean, text)',
    'hg_drop_create(uuid, boolean, integer, integer, boolean)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Reprise de 212 : clôture réservée au service (tâche planifiée).
  revoke all on function public.hg_auction_close() from public, anon, authenticated;
  grant execute on function public.hg_auction_close() to service_role;
end $g$;
