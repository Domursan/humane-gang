-- ===== Humane Gang — migration 181 : gain du jour visible pour Qui a dit ça ? et le Code du jour =====
-- Les écrans de fin des jeux quotidiens affichent les points et les Paillettes (effets-jour.js). Deux jeux ne les donnaient pas :
-- 1. hg_quiz_answer renvoie jour_gain : les Paillettes de la partie du jour de Qui a dit ça ? (première citation répondue du
--    jour), 0 sinon.
-- 2. hg_duel_jour renvoie gain : les Paillettes de la partie du jour du Code du jour, une fois notée (null avant).
-- Aucune donnée modifiée. Rejouable : chaque remplacement ne se fait que si l'ancien texte est encore là.

do $do$
begin
  if pg_get_functiondef('public.hg_quiz_answer(uuid, jsonb)'::regprocedure) not like '%v_jour%' then
    perform public.hg__patch('public.hg_quiz_answer(uuid, jsonb)'::regprocedure,
      $o$k jsonb; ok boolean; gain int := 0;$o$,
      $n$k jsonb; ok boolean; gain int := 0; v_jour int := 0;$n$);
    perform public.hg__patch('public.hg_quiz_answer(uuid, jsonb)'::regprocedure,
      $o$then perform hg_jeux_fin('citations', hg_jeux_today(), me, ok, 1, null); end if;$o$,
      $n$then v_jour := hg_jeux_fin('citations', hg_jeux_today(), me, ok, 1, null); end if;$n$);
    perform public.hg__patch('public.hg_quiz_answer(uuid, jsonb)'::regprocedure,
      $o$return jsonb_build_object('correct', ok, 'reward', gain,$o$,
      $n$return jsonb_build_object('correct', ok, 'reward', gain, 'jour_gain', v_jour,$n$);
  end if;
  if pg_get_functiondef('public.hg_duel_jour()'::regprocedure) not like '%''gain''%' then
    perform public.hg__patch('public.hg_duel_jour()'::regprocedure,
      $o$'trouveurs', (select count(*) from hg_duel_jour_essais where jour = d and bien = 4));$o$,
      $n$'trouveurs', (select count(*) from hg_duel_jour_essais where jour = d and bien = 4),
'gain', (select points from hg_jeux_resultats where jeu = 'code_jour' and day = d and user_id = auth.uid()));$n$);
  end if;
end $do$;
