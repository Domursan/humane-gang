-- Données personnelles des nouveautés (migration 216) : plafond des Paillettes reçues avec les enchères en cours, export,
-- suppression d'un compte vendeur ou en tête d'une enchère, purges à durée fixe.
-- Demande les migrations 204, 205, 207, 210, 212, 213, 214 et 216 : rebuild.sh s'arrête aujourd'hui à la 166. Sur un poste
-- sans PostgreSQL, le banc PGlite de la session charge un socle réduit, ces migrations et ce fichier.
-- À lancer en dernier : il supprime deux membres (5 et un membre 6 créé ici).
do $$
declare
  u2 uuid := t_uid(2); u3 uuid := t_uid(3); u4 uuid := t_uid(4); u5 uuid := t_uid(5); u6 uuid := t_uid(6);
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
  a1 uuid; a2 uuid; a5 uuid; a6 uuid; vclose uuid; vold uuid; c1 bigint; c2 bigint; c5 bigint; c6 bigint;
  v_recv bigint; msg text; e jsonb; b4 int; r jsonb; n bigint;
begin
  -- A. Plafond de 5 000 reçues par 7 jours : les meilleures offres des ventes ouvertes du receveur comptent.
  c1 := t_copie(u2, 1); c2 := t_copie(u2, 2);
  a1 := (t_call(u2, format('hg_enchere_vendre(%s, 60, 10)', c1)) #>> '{}')::uuid;
  perform t_call(u3, format('hg_enchere_offre(%L, 300)', a1));
  v_recv := hg_encheres__recu_semaine(u2);
  -- Plafond ramené à « déjà reçu + 500 » le temps du test : 270 (net de 300) sont en attente.
  update hg_settings set value = value || jsonb_build_object('paillettes_max_semaine', v_recv + 500) where key = 'echanges';
  msg := null;
  begin perform hg_trade_paillettes_check(u4, u2, 250); exception when others then msg := sqlerrm; end;
  perform t_ok(msg like 'Plafond atteint%', 'plafond : un échange de 250 est refusé quand 270 sont déjà en tête d''une enchère (plafond reçu + 500)');
  msg := 'pas d''erreur';
  begin perform hg_trade_paillettes_check(u4, u2, 200); exception when others then msg := sqlerrm; end;
  perform t_ok(msg = 'pas d''erreur', 'plafond : un échange de 200 passe (270 + 200 sous le plafond)');
  a2 := (t_call(u2, format('hg_enchere_vendre(%s, 60, 10)', c2)) #>> '{}')::uuid;
  msg := t_err(u4, format('hg_enchere_offre(%L, 300)', a2));
  perform t_ok(msg like 'Plafond atteint%', 'plafond : une offre sur une autre vente du même vendeur compte celle déjà en tête');
  update hg_settings set value = value || '{"paillettes_max_semaine": 5000}'::jsonb where key = 'echanges';

  -- B. Export : nouvelles clés ; la carte d'anniversaire reçue n'apparaît qu'à partir du jour J.
  insert into hg_cartes_anniv (fete_id, jour) values (u3, v_auj - 1), (u3, v_auj + 2);
  insert into hg_cartes_anniv_mots (carte_id, auteur_id, texte)
    select c.id, u4, 'Joyeux anniversaire, carte du ' || c.jour from hg_cartes_anniv c where c.fete_id = u3;
  e := t_call(u3, 'hg_export_my_data()');
  perform t_ok(e ? 'reactions_messages' and e ? 'cartes_anniversaire_recues', 'export : réactions et cartes reçues présentes');
  perform t_ok(e -> 'jeux' ?& array['jokers', 'parties_honneur', 'spectateur'], 'export : jokers, parties pour l''honneur, spectateur');
  perform t_ok(e -> 'jeu_de_cartes' ?& array['encheres', 'offres_encheres', 'defis_collection'], 'export : enchères, offres, défis de collection');
  perform t_ok(jsonb_array_length(e #> '{jeu_de_cartes,offres_encheres}') >= 1
    and (e #> '{jeu_de_cartes,offres_encheres}') @> jsonb_build_array(jsonb_build_object('enchere', a1, 'montant', 300)), 'export : l''offre de 300 du membre 3 y est');
  perform t_ok(jsonb_array_length(e -> 'cartes_anniversaire_recues') = 1
    and (e -> 'cartes_anniversaire_recues' -> 0 ->> 'jour')::date = v_auj - 1
    and jsonb_array_length(e -> 'cartes_anniversaire_recues' -> 0 -> 'mots') = 1, 'export : la carte d''hier et son mot, pas celle d''après-demain (surprise)');
  e := t_call(u2, 'hg_export_my_data()');
  perform t_ok((e #> '{jeu_de_cartes,encheres}') @> jsonb_build_array(jsonb_build_object('enchere', a1, 'role', 'vendeur')), 'export : la vente du membre 2 y est, rôle vendeur');

  -- C. Suppression d'un compte vendeur d'une enchère ouverte : meilleure offre remboursée, exemplaire débloqué.
  c5 := hg_card_give(u5, (select card_id from hg_card_copies where id = c1), false, 'admin');
  a5 := (t_call(u5, format('hg_enchere_vendre(%s, 60, 10)', c5)) #>> '{}')::uuid;
  b4 := t_pl(u4);
  perform t_call(u4, format('hg_enchere_offre(%L, 100)', a5));
  perform t_ok(t_pl(u4) = b4 - 100, 'vendeur supprimé : l''offre de 100 est débitée');
  msg := null;
  begin delete from hg_profiles where id = u5; exception when others then msg := sqlerrm; end;
  perform t_ok(msg is null, 'vendeur supprimé : la suppression du profil passe (' || coalesce(msg, 'ok') || ')');
  perform t_ok(t_pl(u4) = b4, 'vendeur supprimé : les 100 Paillettes sont rendues');
  perform t_ok((select status from hg_card_member_auctions where id = a5) = 'annulee', 'vendeur supprimé : l''enchère est annulée');
  perform t_ok((select seller from hg_card_member_auctions where id = a5) is null, 'vendeur supprimé : la vente ne garde plus le vendeur');
  perform t_ok((select locked_trade from hg_card_copies where id = c5) is null, 'vendeur supprimé : l''exemplaire est débloqué');
  perform t_ok(exists (select 1 from hg_site_notifs where user_id = u4 and titre = 'Enchère annulée' and lien like '%' || a5), 'vendeur supprimé : l''enchérisseur est prévenu');

  -- D. Suppression d'un compte en tête de l'enchère d'un autre : enchère annulée (règle de la clôture de la 212).
  insert into auth.users (id, email, created_at) values (u6, 'membre6@banc.invalid', now() - interval '30 days') on conflict (id) do nothing;
  insert into hg_profiles (id, pseudo, is_admin, joined_on, account_created_at) values (u6, 'Banc6', false, current_date - 30, now() - interval '30 days')
    on conflict (id) do nothing;
  insert into hg_wallets (user_id, paillettes) values (u6, 2000) on conflict (user_id) do update set paillettes = 2000;
  c6 := t_copie(u4, 1);
  a6 := (t_call(u4, format('hg_enchere_vendre(%s, 60, 10)', c6)) #>> '{}')::uuid;
  perform t_call(u6, format('hg_enchere_offre(%L, 150)', a6));
  insert into hg_spect_vus (partie, user_id, jeu) values (gen_random_uuid(), u6, 'uno');
  insert into hg_card_member_auctions (seller, copy_id, card_id, duree_min, min_bid, fin_prevue, ends_at, hard_end_at, status, winner, price, fee, closed_at)
    values (u2, t_copie(u2, 3), (select card_id from hg_card_copies where id = t_copie(u2, 3)), 60, 10, now() - interval '2 days',
            now() - interval '2 days', now() - interval '2 days', 'vendue', u6, 50, 5, now() - interval '2 days') returning id into vclose;
  b4 := t_pl(u4);
  msg := null;
  begin delete from hg_profiles where id = u6; exception when others then msg := sqlerrm; end;
  perform t_ok(msg is null, 'enchérisseur supprimé : la suppression du profil passe (' || coalesce(msg, 'ok') || ')');
  perform t_ok((select status from hg_card_member_auctions where id = a6) = 'annulee', 'enchérisseur supprimé : l''enchère est annulée');
  perform t_ok((select owner_id from hg_card_copies where id = c6) = u4 and (select locked_trade from hg_card_copies where id = c6) is null,
    'enchérisseur supprimé : la carte reste au vendeur, débloquée');
  perform t_ok(t_pl(u4) = b4, 'enchérisseur supprimé : le vendeur ne reçoit rien');
  perform t_ok(not exists (select 1 from hg_card_member_bids where user_id = u6), 'enchérisseur supprimé : ses offres sont effacées');
  perform t_ok((select winner from hg_card_member_auctions where id = vclose) is null and (select price from hg_card_member_auctions where id = vclose) = 50,
    'enchérisseur supprimé : la vente close garde la carte et le prix, sans l''acheteur');
  perform t_ok(not exists (select 1 from hg_spect_vus where user_id = u6), 'enchérisseur supprimé : ses passages de spectateur sont effacés');
  perform t_ok(exists (select 1 from hg_site_notifs where user_id = u4 and titre = 'Enchère annulée' and lien like '%' || a6), 'enchérisseur supprimé : le vendeur est prévenu');

  -- E. Purges à durée fixe.
  insert into hg_card_member_auctions (seller, copy_id, card_id, duree_min, min_bid, fin_prevue, ends_at, hard_end_at, status, closed_at, created_at)
    values (u2, c1, (select card_id from hg_card_copies where id = c1), 60, 10, now() - interval '13 months', now() - interval '13 months',
            now() - interval '13 months', 'sans_offre', now() - interval '13 months', now() - interval '13 months') returning id into vold;
  insert into hg_card_member_bids (auction_id, user_id, amount, refunded_at, created_at) values (vold, u3, 20, now() - interval '13 months', now() - interval '13 months');
  insert into hg_cartes_anniv (fete_id, jour) values (u4, v_auj - 400);
  insert into hg_cartes_anniv_mots (carte_id, auteur_id, texte) select id, u3, 'Un mot de plus d''un an' from hg_cartes_anniv where fete_id = u4 and jour = v_auj - 400;
  insert into hg_spect_vus (partie, user_id, jeu, vu_at) values (gen_random_uuid(), u3, 'uno', now() - interval '40 days'), (gen_random_uuid(), u3, 'uno', now() - interval '1 day');
  -- Joker du membre 3 : série cassée depuis (aucune partie) ; joker du membre 4 : série tenue jusqu'à aujourd'hui.
  insert into hg_jeux_jokers (jeu, day, user_id, prix) values ('sutom', v_auj - 400, u3, 200), ('sutom', v_auj - 400, u4, 200);
  insert into hg_jeux_resultats (jeu, day, user_id) select 'sutom', d::date, u4 from generate_series(v_auj - 399, v_auj, interval '1 day') d on conflict do nothing;
  r := hg_entretien__passage('apercu');
  perform t_ok((r #>> '{tables,hg_spect_vus}')::int >= 1 and (r #>> '{tables,hg_card_member_bids}')::int >= 1
    and (r #>> '{tables,hg_cartes_anniv}')::int >= 1 and (r #>> '{tables,hg_jeux_jokers}')::int = 1, 'purge (aperçu) : spectateurs, offres, cartes, un seul joker : ' || (r -> 'tables')::text);
  r := hg_entretien__passage('main');
  perform t_ok(not exists (select 1 from hg_card_member_auctions where id = vold) and not exists (select 1 from hg_card_member_bids where auction_id = vold),
    'purge : l''enchère close depuis 13 mois et son offre sont effacées');
  perform t_ok(exists (select 1 from hg_card_member_auctions where id = vclose), 'purge : la vente close il y a 2 jours reste');
  perform t_ok(not exists (select 1 from hg_cartes_anniv where fete_id = u4 and jour = v_auj - 400)
    and exists (select 1 from hg_cartes_anniv where fete_id = u3 and jour = v_auj - 1), 'purge : la carte de plus de 12 mois part, celle d''hier reste');
  perform t_ok((select count(*) from hg_spect_vus where user_id = u3) = 1, 'purge : le passage de spectateur de 40 jours part, celui d''hier reste');
  perform t_ok(not exists (select 1 from hg_jeux_jokers where user_id = u3 and jeu = 'sutom')
    and exists (select 1 from hg_jeux_jokers where user_id = u4 and jeu = 'sutom'), 'purge : le joker d''une série cassée part, celui d''une série en cours reste');
end $$;
select t_bilan_fin();
