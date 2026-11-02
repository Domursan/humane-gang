-- hg__patch, copie de la migration 141 (duels) : la migration 211 du Uno retouche hg_uno_etat et hg_uno_invite avec elle.
-- Le banc ne charge pas la 141 (tables des duels) ; cette copie doit rester identique à l'original.
create or replace function public.hg__patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql set search_path = public as $$
declare d text := pg_get_functiondef(p_fn); motif text;
begin
  -- Les espaces et retours à la ligne ne comptent pas (l'indentation enregistrée peut différer du fichier source).
  motif := regexp_replace(btrim(p_old), '([.^$*+?()\[\]{}|\\])', '\\\1', 'g');
  motif := regexp_replace(motif, '\s+', '\\s+', 'g');
  if not d ~ motif then raise exception 'hg__patch : texte introuvable dans % : %', p_fn, left(p_old, 120); end if;
  execute regexp_replace(d, motif, replace(p_new, '\', '\\'));
end $$;
revoke all on function public.hg__patch(regprocedure, text, text) from public, anon, authenticated;
