-- 217 : défi « Obtiens N cartes de la série » (compteur cartes_serie de la 210) : seules les cartes réellement nouvelles
-- pour le membre comptent (checkup du 02.11.2026). Avant, un exemplaire reçu par un échange ou un cadeau accepté dans la
-- semaine comptait toujours : un aller-retour A→B puis B→A faisait réussir le défi aux deux membres (un booster chacun
-- par semaine), sans aucune carte gagnée.
-- Reprise entière de hg_quest_serie_value (210, identique à la version en ligne). Pour cartes_serie seulement :
-- 1. Exemplaire tiré, fabriqué… dans la semaine (branche « à soi » de la 210) : compte aussi s'il est revenu au membre qui
--    l'a tiré dans un booster (drawn_by, 082), puisque sa source est alors « echange » ; une seule fois (même exemplaire).
-- 2. Exemplaire reçu par un échange ou un cadeau conclu dans la semaine : écarté si le membre
--    - l'a déjà donné dans un échange ou un cadeau accepté avant la fin de la fenêtre : il l'avait avant (retour à l'ancien
--      propriétaire, même dans la semaine) ou il l'a fait repartir (simple passage pour faire le compte) ;
--    - l'a vendu dans une enchère entre membres (212, « vendue ») close avant la fin de la fenêtre (même raison) ;
--    - a donné, dans le même échange, un exemplaire de la même carte (carte contre la même carte : rien de gagné).
--    Même règle d'historique que « Nouvelles cartes » (nouvelles_serie) : les échanges acceptés (hg_card_trades /
--    hg_card_trade_items), lus à l'exemplaire au lieu de la carte.
-- nouvelles_serie et fabriquees_serie ne changent pas. Signature, droits et réglages identiques. Rejouable.

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
  ),
  -- cartes_serie (217) : exemplaires réellement nouveaux pour le membre dans la fenêtre.
  nouveaux as (
    select x.id from hg_card_copies x join hg_cards k on k.id = x.card_id
      where x.owner_id = p_user and k.set_id = p_set and k.rarity <> 'identite'
        and (x.source not in ('echange', 'cadeau', 'admin') or x.drawn_by = p_user)
        and x.obtained_at >= p_start and x.obtained_at < p_end
    union
    select x.id from hg_card_trades t
      join hg_card_trade_items i on i.trade_id = t.id
      join hg_card_copies x on x.id = i.copy_id
      join hg_cards k on k.id = x.card_id
      where t.status = 'acceptee' and t.resolved_at >= p_start and t.resolved_at < p_end
        and k.set_id = p_set and k.rarity <> 'identite'
        and ((i.side = 'from' and t.to_user = p_user) or (i.side = 'to' and t.from_user = p_user))
        -- Le membre l'a donné (avant ou dans la fenêtre) : il l'avait déjà, ou il l'a fait repartir.
        and not exists (select 1 from hg_card_trades t2 join hg_card_trade_items i2 on i2.trade_id = t2.id
          where i2.copy_id = x.id and t2.status = 'acceptee' and t2.resolved_at < p_end
            and ((i2.side = 'from' and t2.from_user = p_user) or (i2.side = 'to' and t2.to_user = p_user)))
        -- Le membre l'a vendu aux enchères (avant ou dans la fenêtre).
        and not exists (select 1 from hg_card_member_auctions a
          where a.copy_id = x.id and a.seller = p_user and a.status = 'vendue' and a.closed_at < p_end)
        -- Dans le même échange, le membre a donné un exemplaire de la même carte.
        and not exists (select 1 from hg_card_trade_items i3 join hg_card_copies y on y.id = i3.copy_id
          where i3.trade_id = t.id and y.card_id = x.card_id
            and ((i3.side = 'from' and t.from_user = p_user) or (i3.side = 'to' and t.to_user = p_user)))
  )
  select (case
    when p_user is null or p_set is null then 0
    when p_metric = 'cartes_serie' then (select count(distinct n.id) from nouveaux n)
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
