-- 196 : le give en panier. Une seule action donne, à un membre ou à tout le gang, des Paillettes, plusieurs cartes
-- (à l'unité, une série entière, un type entier), brillantes ou non, et plusieurs sortes de boosters. Tout ou rien.
-- Quantités libres ; seul garde-fou : 100 000 exemplaires par don (la base coupe les requêtes après 8 secondes).
-- Les cartes limitées peuvent dépasser leur maximum : les numéros continuent au-delà (décision d'Ethan, 01/11/2026).
-- Les insertions sont faites d'un seul bloc, et non carte par carte avec hg_card_give, pour tenir dans ce délai.
-- p_lignes : tableau JSON de
--   { "type": "carte", "card": uuid, "qte": n, "shiny": bool }
--   { "type": "lot", "set": uuid|null, "rarity": texte|null, "family": texte|null, "qte": n, "shiny": bool }
--   { "type": "booster", "booster": identifiant, "qte": n }
-- Un lot prend les cartes actives au moment du don. Une carte présente deux fois s'additionne.
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
  v_l jsonb;
  v_type text;
  v_qte bigint;
  v_shiny boolean;
  v_set uuid;
  v_rar text;
  v_fam text;
  v_nom text;
  v_famille text;
  v_nb int;
  v_card hg_cards;
  v_booster hg_booster_types;
  -- Cartes à créer pour chaque membre, regroupées par carte et brillance ; boosters par sorte.
  v_cartes jsonb := '{}'::jsonb;
  v_boosters jsonb := '{}'::jsonb;
  v_cle text;
  v_ex_par_membre bigint := 0;
  v_bo_par_membre bigint := 0;
  v_resume text[] := '{}';
  v_noms text[];
  v_giver text;
  v_who text;
  v_obj text;
  v_detail jsonb;
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

  -- Lecture du panier : chaque ligne est contrôlée, puis ajoutée aux totaux.
  for v_l in select value from jsonb_array_elements(v_lignes) loop
    v_type := v_l->>'type';
    v_qte := case when v_l->>'qte' ~ '^[0-9]{1,9}$' then (v_l->>'qte')::bigint end;
    if v_qte is null or v_qte < 1 then raise exception 'Quantité invalide dans le panier'; end if;
    v_shiny := coalesce((v_l->>'shiny')::boolean, false);

    if v_type = 'carte' then
      select * into v_card from hg_cards where id = (v_l->>'card')::uuid;
      if not found then raise exception 'Carte introuvable'; end if;
      v_cle := v_card.id::text || '|' || (v_shiny and v_card.can_shiny)::text;
      v_cartes := jsonb_set(v_cartes, array[v_cle], to_jsonb(coalesce((v_cartes->>v_cle)::bigint, 0) + v_qte));
      v_ex_par_membre := v_ex_par_membre + v_qte;
      v_resume := v_resume || ((case when v_qte > 1 then v_qte || ' exemplaires de ' else '' end)
        || '« ' || v_card.name || ' » (' || hg_rarity_label(v_card.rarity)
        || case when v_shiny and v_card.can_shiny then ', brillante' else '' end || ')');

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
      v_ex_par_membre := v_ex_par_membre + v_nb * v_qte;
      v_resume := v_resume || (
        (case when v_qte > 1 then v_qte || ' exemplaires de chaque carte de ' else '' end)
        || case
             when v_set is not null and v_rar is null and v_fam is null then 'toute la série « ' || v_nom || ' »'
             when v_set is null and v_rar is not null and v_fam is null then 'tout le type ' || hg_rarity_label(v_rar)
             when v_set is null and v_rar is null then 'tout le type ' || v_famille
             else concat_ws(' · ', '« ' || v_nom || ' »', case when v_rar is not null then hg_rarity_label(v_rar) end, v_famille)
           end
        || ' (' || v_nb || ' carte' || case when v_nb > 1 then 's' else '' end
        || case when v_shiny then ', brillantes' else '' end || ')');

    elsif v_type = 'booster' then
      select * into v_booster from hg_booster_types where id = v_l->>'booster';
      if not found then raise exception 'Type de booster inconnu'; end if;
      v_boosters := jsonb_set(v_boosters, array[v_booster.id], to_jsonb(coalesce((v_boosters->>v_booster.id)::bigint, 0) + v_qte));
      v_bo_par_membre := v_bo_par_membre + v_qte;
      v_resume := v_resume || (v_qte || ' booster' || case when v_qte > 1 then 's' else '' end || ' « ' || v_booster.name || ' »');

    else
      raise exception 'Ligne de panier inconnue';
    end if;
  end loop;

  if v_paill = 0 and v_ex_par_membre = 0 and v_bo_par_membre = 0 then raise exception 'Le panier est vide'; end if;
  if v_ex_par_membre * v_n > c_max_exemplaires then
    raise exception 'Ce don crée % exemplaires : le maximum est de % par don', v_ex_par_membre * v_n, c_max_exemplaires;
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

  if v_bo_par_membre > 0 then
    insert into hg_booster_stock(user_id, type_id, qty)
      select u, b.key, b.value::bigint::int from unnest(v_ids) as u cross join jsonb_each_text(v_boosters) b
      on conflict (user_id, type_id) do update set qty = hg_booster_stock.qty + excluded.qty;
  end if;

  if v_ex_par_membre > 0 then
    -- Les cartes numérotées sont verrouillées dans un ordre fixe : deux dons simultanés ne prennent pas le même numéro.
    perform 1 from hg_cards k
      where k.max_copies is not null and k.id in (select split_part(e.key, '|', 1)::uuid from jsonb_each_text(v_cartes) e)
      order by k.id for update;
    insert into hg_card_copies(card_id, owner_id, shiny, serial, source)
      with voulu as (
        select split_part(e.key, '|', 1)::uuid as card_id, split_part(e.key, '|', 2)::boolean as shiny, e.value::bigint as qte
          from jsonb_each_text(v_cartes) e
      ), base as (
        select v.card_id, v.shiny, v.qte, k.max_copies,
          case when k.max_copies is not null
            then (select coalesce(max(x.serial), 0) from hg_card_copies x where x.card_id = v.card_id) end as dernier
        from voulu v join hg_cards k on k.id = v.card_id
      )
      select b.card_id, u, b.shiny,
        case when b.max_copies is not null
          then b.dernier + row_number() over (partition by b.card_id order by u, b.shiny, g) end,
        'admin'
      from base b
      cross join unnest(v_ids) as u
      cross join lateral generate_series(1::bigint, b.qte) as g;
    foreach v_u in array v_ids loop
      perform hg_card_check_sets(v_u);
    end loop;
  end if;

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
revoke all on function public.hg_cards_admin_give_panier(uuid[], integer, jsonb, boolean, text) from public, anon;
grant execute on function public.hg_cards_admin_give_panier(uuid[], integer, jsonb, boolean, text) to authenticated;
