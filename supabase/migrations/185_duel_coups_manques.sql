-- ===== Humane Gang — migration 185 : le nombre de coups manqués arrive à l'écran =====
-- Demande d'Ethan (31.10.2026, fiche TP1) : quand le temps est écoulé, le message « Le jeu a joué pour toi » montre où en est le joueur
-- sur les 3 coups manqués qui donnent le forfait. Le compte existe (hg_duel_joueurs.manques) mais hg_duel_etat ne l'envoyait pas.
-- Affichage seulement : aucune règle ni aucune donnée ne change. Sans cette migration, le message s'affiche sans les points.
select public.hg__patch('public.hg_duel_etat(text)'::regprocedure,
  $o$'pret', j.pret, 'radar', j.radar,$o$,
  $n$'pret', j.pret, 'radar', j.radar, 'manques', j.manques,$n$);
