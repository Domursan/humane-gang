-- 203 : recherche dans les messages (idée 67). Le membre cherche un mot dans SES conversations seulement
-- (privées, groupes, Secret Santa, ses demandes d'assistance), comme la lecture de hg_get_messages.
-- Règles : 3 lettres au moins (80 au plus), 50 résultats au plus, les plus récents d'abord ; % et _ sont cherchés tels quels.
-- Les messages masqués par le Staff et les messages système des groupes sont exclus. Dans un Secret Santa, le Santa reste « Ton Santa ».
-- Pas de recherche admin dans les conversations des autres : la lecture d'une autre conversation reste hg_admin_read_conversation (journalisée).
-- Recherche simple en ilike (pas de nouvelle extension, volume faible). p_conv limite la recherche à une conversation.
create or replace function public.hg_search_messages(p_q text, p_conv uuid default null)
returns table(conversation_id uuid, message_id bigint, conv_kind text, conv_title text, mine boolean, sender_label text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  q text := btrim(coalesce(p_q, ''));
  motif text;
begin
  if me is null or not public.hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if char_length(q) < 3 then return; end if;
  q := left(q, 80);
  motif := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  return query
    select x.conversation_id, x.id, c.kind, public.hg_conv_title(c, me), x.sender_id = me,
           case when x.sender_id = me then 'Moi'
                when c.kind = 'santa' and x.sender_id = c.santa_id then 'Ton Santa'
                else coalesce(p.pseudo, 'Ancien membre') end,
           x.body, x.created_at
    from public.hg_messages x
    join public.hg_conversation_members m on m.conversation_id = x.conversation_id and m.user_id = me
    join public.hg_conversations c on c.id = x.conversation_id
    left join public.hg_profiles p on p.id = x.sender_id
    where (p_conv is null or x.conversation_id = p_conv)
      and x.hidden_at is null and not x.system
      and x.body ilike motif escape '\'
    order by x.created_at desc, x.id desc
    limit 50;
end $$;

revoke all on function public.hg_search_messages(text, uuid) from public, anon;
grant execute on function public.hg_search_messages(text, uuid) to authenticated;
