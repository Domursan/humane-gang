-- Défi de collection « Obtiens N cartes de la série » (compteur cartes_serie, migrations 210 et 217) : un aller-retour
-- d'exemplaires entre deux membres ne fait réussir le défi à personne ; une vraie carte reçue et une carte tirée ou
-- fabriquée dans la semaine comptent toujours.
-- Demande les migrations 210, 212 et 217 : rebuild.sh s'arrête aujourd'hui à la 166. Sur un poste sans PostgreSQL, le
-- banc PGlite de la session charge un socle réduit, ces migrations et ce fichier. Les échanges et les cadeaux acceptés
-- sont écrits directement (t6_echange, même effet que l'acceptation de la 074 : propriétaire et source changent).
-- Crée les membres 6 et 7.
create or replace function t6_echange(de uuid, a uuid, donnes bigint[], recues bigint[], quand timestamptz) returns uuid
language plpgsql as $$
declare t uuid;
begin
  insert into hg_card_trades (from_user, to_user, status, message, created_at, resolved_at)
    values (de, a, 'acceptee', 'banc t6', quand, quand) returning id into t;
  insert into hg_card_trade_items (trade_id, copy_id, side)
    select t, c, 'from' from unnest(donnes) c union all select t, c, 'to' from unnest(coalesce(recues, '{}')) c;
  update hg_card_copies set owner_id = a, source = case when recues is null then 'cadeau' else 'echange' end where id = any(donnes);
  update hg_card_copies set owner_id = de, source = 'echange' where id = any(coalesce(recues, '{}'));
  return t;
end $$;
-- Exemplaire de la carte n° n du membre u (le plus ancien).
create or replace function t6_ex(u uuid, n int) returns bigint language sql stable as $$
  select id from hg_card_copies where owner_id = u and card_id = md5('banc-' || n)::uuid and recycled_at is null order by id limit 1 $$;

do $$
declare
  u2 uuid := t_uid(2); u3 uuid := t_uid(3); u4 uuid := t_uid(4); u5 uuid := t_uid(5); u6 uuid := t_uid(6); u7 uuid := t_uid(7);
  s uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  wk date := hg_quest_week();
  ws timestamptz := (wk::timestamp) at time zone 'Europe/Zurich';
  pe timestamptz := least(((wk + 7)::timestamp) at time zone 'Europe/Zurich', now());
  v_t timestamptz;      -- un instant de la semaine en cours, avant maintenant
  v_avant timestamptz := ws - interval '10 days';
  ex bigint[]; c bigint; msg text; r jsonb;
begin
  v_t := ws + (now() - ws) / 2;
  -- Les cartes de départ du banc datent d'avant la semaine ; défi de la semaine : 5 cartes de la série de test.
  update hg_card_copies set obtained_at = ws - interval '30 days';
  insert into hg_quest_defis (week, code, set_id) values (wk, 'defi_serie_5', s) on conflict (week) do update set code = excluded.code, set_id = excluded.set_id;
  insert into auth.users (id, email, created_at) values (u6, 'membre6@banc.invalid', now() - interval '30 days'), (u7, 'membre7@banc.invalid', now() - interval '30 days')
    on conflict (id) do nothing;
  insert into hg_profiles (id, pseudo, is_admin, joined_on, account_created_at)
    values (u6, 'Banc6', false, current_date - 30, now() - interval '30 days'), (u7, 'Banc7', false, current_date - 30, now() - interval '30 days')
    on conflict (id) do nothing;

  -- A. Aller-retour dans la semaine : le membre 2 offre 5 cartes au membre 4, qui les lui rend.
  ex := array[t6_ex(u2, 6), t6_ex(u2, 7), t6_ex(u2, 8), t6_ex(u2, 9), t6_ex(u2, 10)];
  perform t6_echange(u2, u4, ex, null, v_t);
  perform t6_echange(u4, u2, ex, null, v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u2, ws, pe) = 0, 'aller-retour : les 5 cartes revenues au membre 2 ne comptent pas ('
    || hg_quest_serie_value('cartes_serie', s, u2, ws, pe) || ')');
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u4, ws, pe) = 0, 'aller-retour : les 5 cartes passées chez le membre 4 et rendues ne comptent pas ('
    || hg_quest_serie_value('cartes_serie', s, u4, ws, pe) || ')');
  msg := t_err(u2, 'hg_card_defi_claim()');
  perform t_ok(msg like 'Défi pas encore réussi%', 'aller-retour : le membre 2 ne peut pas réclamer le booster (' || coalesce(msg, 'réclamé') || ')');
  msg := t_err(u4, 'hg_card_defi_claim()');
  perform t_ok(msg like 'Défi pas encore réussi%', 'aller-retour : le membre 4 ne peut pas réclamer le booster (' || coalesce(msg, 'réclamé') || ')');

  -- B. Retour d'un exemplaire donné avant la semaine (membre 3 → 5 il y a 10 jours, 5 → 3 cette semaine).
  c := t6_ex(u3, 1);
  perform t6_echange(u3, u5, array[c], null, v_avant);
  perform t6_echange(u5, u3, array[c], null, v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u3, ws, pe) = 0, 'retour : l''exemplaire donné avant la semaine et revenu ne compte pas');

  -- C. Même carte contre même carte dans un échange : rien de gagné. Cartes différentes : chacun en a une de plus.
  perform t6_echange(u3, u4, array[t6_ex(u3, 2)], array[t6_ex(u4, 2)], v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u3, ws, pe) = 0 and hg_quest_serie_value('cartes_serie', s, u4, ws, pe) = 0,
    'échange carte n° 2 contre carte n° 2 : ne compte pour aucun des deux');
  perform t6_echange(u3, u4, array[t6_ex(u3, 9)], array[t6_ex(u4, 3)], v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u3, ws, pe) = 1 and hg_quest_serie_value('cartes_serie', s, u4, ws, pe) = 1,
    'échange carte n° 9 contre carte n° 3 : un exemplaire nouveau pour chacun');

  -- D. Vraies cartes reçues : 3 du membre 3 et 2 du membre 2 pour le membre 6 (aucune carte avant).
  perform t6_echange(u3, u6, array[t6_ex(u3, 3), t6_ex(u3, 4), t6_ex(u3, 5)], null, v_t);
  perform t6_echange(u2, u6, array[t6_ex(u2, 1), t6_ex(u2, 2)], null, v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u6, ws, pe) = 5, 'cartes reçues : 5 exemplaires nouveaux comptés pour le membre 6 ('
    || hg_quest_serie_value('cartes_serie', s, u6, ws, pe) || ')');
  perform t_ok(hg_quest_serie_value('nouvelles_serie', s, u6, ws, pe) = 5, 'cartes reçues : « nouvelles cartes » inchangé (5)');
  r := t_call(u6, 'hg_card_defi_claim()');
  perform t_ok(r ->> 'booster' = 'serie' and (select qty from hg_booster_stock where user_id = u6 and type_id = 'serie') = 1,
    'cartes reçues : le membre 6 réclame son booster de série');

  -- E. Cartes tirées ou fabriquées dans la semaine (membre 7) : comptées comme avant ; celle d'avant la semaine non.
  insert into hg_card_copies (card_id, owner_id, source, obtained_at) values
    (md5('banc-1')::uuid, u7, 'booster', v_t), (md5('banc-2')::uuid, u7, 'booster', v_t),
    (md5('banc-3')::uuid, u7, 'fabrication', v_t), (md5('banc-4')::uuid, u7, 'booster', v_avant);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u7, ws, pe) = 3, 'tirées et fabriquée dans la semaine : 3 comptées ('
    || hg_quest_serie_value('cartes_serie', s, u7, ws, pe) || ')');
  perform t_ok(hg_quest_serie_value('fabriquees_serie', s, u7, ws, pe) = 1, 'fabriquée : « fabrique une carte » inchangé (1)');
  -- Tirée cette semaine, prêtée au membre 2 puis rendue : toujours comptée une fois pour le membre 7, jamais pour le 2.
  c := t6_ex(u7, 1);
  perform t6_echange(u7, u2, array[c], null, v_t);
  perform t6_echange(u2, u7, array[c], null, v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u7, ws, pe) = 3 and hg_quest_serie_value('cartes_serie', s, u2, ws, pe) = 0,
    'tirée, prêtée et rendue : toujours 3 pour le membre 7, 0 pour le membre 2');

  -- F. Carte du membre 3 vendue aux enchères entre membres (212) au membre 5, qui la rend par un cadeau : ne compte pas.
  c := t6_ex(u3, 6);
  insert into hg_card_member_auctions (seller, copy_id, card_id, duree_min, min_bid, fin_prevue, ends_at, hard_end_at, status, winner, price, fee, closed_at)
    values (u3, c, md5('banc-6')::uuid, 60, 10, v_t, v_t, v_t, 'vendue', u5, 50, 5, v_t);
  update hg_card_copies set owner_id = u5, source = 'echange' where id = c;
  perform t6_echange(u5, u3, array[c], null, v_t);
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u3, ws, pe) = 1, 'vendue aux enchères puis rendue : le membre 3 en reste à 1 ('
    || hg_quest_serie_value('cartes_serie', s, u3, ws, pe) || ')');
  perform t_ok(hg_quest_serie_value('cartes_serie', s, u5, ws, pe) = 0, 'achetée aux enchères puis rendue : rien pour le membre 5');
end $$;
drop function t6_echange(uuid, uuid, bigint[], bigint[], timestamptz);
drop function t6_ex(uuid, int);
select t_bilan_fin();
