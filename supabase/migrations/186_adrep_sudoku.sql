-- ===== Humane Gang — migration 186 : réponse du sudoku du jour pour les administrateurs =====
-- Demande d'Ethan (01.11.2026) : le Sudoku n'avait pas de bouton « Réponses ». hg_admin_reponses('sudoku') lit la grille du
-- jour de hg_nj__sudoku : neuf lignes de chiffres, avec le niveau. Comme les autres hg_adrep_*, appelable seulement par
-- hg_admin_reponses, réservé aux administrateurs et noté dans le journal.

create or replace function public.hg_adrep_sudoku(p_ref text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d date := hg_jeux_today();
  g jsonb := hg_nj__sudoku(d);
  s text := g->>'solution';
begin
  return jsonb_build_object('titre', 'Sudoku du jour : réponses',
    'note', 'Jour : ' || to_char(d, 'DD.MM.YYYY') || ' · niveau ' || (g->>'niveau'),
    'sections', jsonb_build_array(jsonb_build_object('titre', 'Grille complète',
      'grille', (select jsonb_agg((select jsonb_agg(substr(s, l * 9 + c + 1, 1) order by c) from generate_series(0, 8) c) order by l)
        from generate_series(0, 8) l))));
end $$;

revoke all on function public.hg_adrep_sudoku(text) from public, anon, authenticated;
