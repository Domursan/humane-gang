-- ===== Humane Gang — migration 190 : prises de l'arcade plafonnées à 300 Paillettes par jour =====
-- hg_arcade_finish paie 1 Paillette par prise sur le score déclaré par le navigateur : un script qui ouvre une partie, attend et
-- envoie le score permis par la cadence touchait tout le plafond. Le serveur ne rejoue pas la partie : on réduit l'enjeu.
-- Plafond commun à Paillettes et Raclette : 300 par jour au lieu de 1 500 (migration 182). C'est la valeur par défaut :
-- hg_settings.cards.plafonds.arcade_prises_jour, s'il existe, prime. Il n'existait pas en production le 01.11.2026.
-- Aucune donnée modifiée. La récompense quotidienne de l'arcade ne change pas.

do $do$
begin
  -- Une migration relancée ne repasse pas ici : hg__patch refuse un texte déjà remplacé.
  if pg_get_functiondef('public.hg_arcade_finish(uuid, integer)'::regprocedure) not like '%arcade_prises_jour'', 300)%' then
    perform public.hg__patch('public.hg_arcade_finish(uuid, integer)'::regprocedure,
      $o$hg_eco_cap('arcade_prises_jour', 1500)$o$,
      $n$hg_eco_cap('arcade_prises_jour', 300)$n$);
  end if;
end $do$;
