-- ===== Humane Gang — migration 209 : « Il te manque N cartes pour finir la série » (Mes cartes, idée 57) =====
-- hg_serie_manquantes(p_set) : pour le membre connecté et une série ouverte, ses cartes manquantes (cartes actives,
-- Identité exclue, comme la barre de progression) et, pour chacune, les membres qui en ont au moins 2 exemplaires libres
-- (vivants, pas bloqués par une offre ; carte échangeable). Fantômes et membre connecté exclus, comme hg_trade_suggestions.
-- Lecture seule. Le site ne l'appelle que quand une série est choisie dans les filtres et qu'il y manque 1 à 5 cartes :
-- au-delà de 5 manquantes (ou 0), la fonction rend une liste vide sans chercher les doubles.
-- Rien de nouveau n'est révélé : les exemplaires et les souhaits sont déjà lisibles entre membres (RLS, migration 018).
-- Résultat : { manquantes: n, cartes: [ { card_id, chez: [ { user_id, pseudo, n, copy_id } ] } ] }, cartes par numéro,
-- membres par nombre d'exemplaires libres puis pseudo (5 au plus par carte). copy_id : l'exemplaire libre à demander.
-- Ajout seulement, rejouable.

create or replace function public.hg_serie_manquantes(p_set uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  v_n int;
  res jsonb;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres'; end if;
  -- Série ouverte seulement (active, commencée) : les cartes d'une série à venir restent cachées
  if not exists (select 1 from hg_card_sets s where s.id = p_set and s.active and (s.starts_at is null or s.starts_at <= now())) then
    return jsonb_build_object('manquantes', 0, 'cartes', '[]'::jsonb);
  end if;

  select count(*) into v_n
    from hg_cards k
   where k.set_id = p_set and k.active and k.rarity not in ('identite', 'unique')
     and not exists (select 1 from hg_card_copies x where x.owner_id = me and x.card_id = k.id and x.recycled_at is null);
  if v_n = 0 or v_n > 5 then return jsonb_build_object('manquantes', v_n, 'cartes', '[]'::jsonb); end if;

  with
  manq as (
    select k.id, k.number, k.tradeable
      from hg_cards k
     where k.set_id = p_set and k.active and k.rarity not in ('identite', 'unique')
       and not exists (select 1 from hg_card_copies x where x.owner_id = me and x.card_id = k.id and x.recycled_at is null)
  ),
  -- Exemplaires libres des autres membres actifs, par carte manquante et par membre
  libres as (
    select x.card_id, x.owner_id, count(*)::int as n, min(x.id) as copy_id
      from hg_card_copies x
      join manq m on m.id = x.card_id and m.tradeable
      join hg_profiles p on p.id = x.owner_id and not p.is_ghost and p.id <> me
     where x.recycled_at is null and x.locked_trade is null
     group by x.card_id, x.owner_id
    having count(*) >= 2
  ),
  classes as (
    select l.*, p.pseudo, row_number() over (partition by l.card_id order by l.n desc, p.pseudo, l.owner_id) as rg
      from libres l join hg_profiles p on p.id = l.owner_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'card_id', m.id,
           'chez', coalesce((select jsonb_agg(jsonb_build_object('user_id', c.owner_id, 'pseudo', c.pseudo, 'n', c.n, 'copy_id', c.copy_id) order by c.rg)
                               from classes c where c.card_id = m.id and c.rg <= 5), '[]'::jsonb))
         order by m.number, m.id), '[]'::jsonb)
    into res
    from manq m;

  return jsonb_build_object('manquantes', v_n, 'cartes', res);
end $$;

revoke all on function public.hg_serie_manquantes(uuid) from public, anon;
grant execute on function public.hg_serie_manquantes(uuid) to authenticated;
