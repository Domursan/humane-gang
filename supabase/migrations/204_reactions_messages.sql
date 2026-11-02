-- 204 : réactions émoji sur les messages (idée 66). Table à part : hg_reactions (souvenirs, photos) est lisible par tous
-- les membres et attend un autre identifiant. Ici, une réaction ne se lit que dans sa conversation, par ses membres,
-- et seulement par les deux fonctions ci-dessous (aucun accès direct à la table).
-- Six émojis : ❤️ 😂 👍 😮 🔥 🎉. Un membre peut mettre plusieurs émojis différents sur un même message.
-- Dans un Secret Santa, la réaction du Santa s'affiche « Ton Santa ». Pas de réactions dans l'assistance, ni sur un message
-- système ou masqué. Aucune notification, aucun compteur de non-lus, last_message_at inchangé (la conversation ne remonte pas).
-- L'admin n'y a pas d'autre accès : il ne les voit qu'en ouvrant la conversation par l'accès admin journalisé (hg_admin_message_reactions).
create table if not exists public.hg_message_reactions (
  message_id bigint not null references public.hg_messages(id) on delete cascade,
  user_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  emoji text not null check (emoji in ('❤️', '😂', '👍', '😮', '🔥', '🎉')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists hg_message_reactions_user_idx on public.hg_message_reactions(user_id);
alter table public.hg_message_reactions enable row level security;
revoke all on public.hg_message_reactions from public, anon, authenticated;

-- Réactions d'une conversation : une ligne par réaction, avec le nom à afficher (« Ton Santa » pour le Santa vu par sa cible).
create or replace function public.hg_message_reactions_get(p_conv uuid)
returns table(message_id bigint, emoji text, mine boolean, label text)
language sql stable security definer set search_path = public as $$
  select r.message_id, r.emoji, r.user_id = auth.uid(),
         case when r.user_id = auth.uid() then 'toi'
              when c.kind = 'santa' and r.user_id = c.santa_id then 'Ton Santa'
              else coalesce(p.pseudo, 'Ancien membre') end
  from public.hg_message_reactions r
  join public.hg_messages x on x.id = r.message_id
  join public.hg_conversations c on c.id = x.conversation_id
  left join public.hg_profiles p on p.id = r.user_id
  where x.conversation_id = p_conv and c.kind <> 'support' and x.hidden_at is null and not x.system
    and public.hg_is_member()
    and exists (select 1 from public.hg_conversation_members m where m.conversation_id = p_conv and m.user_id = auth.uid())
  order by r.message_id, r.created_at, r.emoji $$;

-- Ajoute ou retire ma réaction (bascule). Renvoie true si elle est posée, false si elle est retirée.
create or replace function public.hg_message_react(p_message bigint, p_emoji text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_conv uuid; v_kind text; v_hidden timestamptz; v_system boolean;
begin
  if me is null or not public.hg_is_member() then raise exception 'Réservé aux membres'; end if;
  if p_emoji is null or p_emoji not in ('❤️', '😂', '👍', '😮', '🔥', '🎉') then raise exception 'Réaction inconnue'; end if;
  select x.conversation_id, c.kind, x.hidden_at, x.system into v_conv, v_kind, v_hidden, v_system
    from public.hg_messages x join public.hg_conversations c on c.id = x.conversation_id where x.id = p_message;
  if v_conv is null or not exists (select 1 from public.hg_conversation_members m where m.conversation_id = v_conv and m.user_id = me) then
    raise exception 'Message introuvable';
  end if;
  if v_kind = 'support' then raise exception 'Pas de réactions dans l''assistance'; end if;
  if v_hidden is not null or v_system then raise exception 'On ne peut pas réagir à ce message'; end if;
  if exists (select 1 from public.hg_message_reactions r where r.message_id = p_message and r.user_id = me and r.emoji = p_emoji) then
    delete from public.hg_message_reactions r where r.message_id = p_message and r.user_id = me and r.emoji = p_emoji;
    return false;
  end if;
  insert into public.hg_message_reactions(message_id, user_id, emoji) values (p_message, me, p_emoji) on conflict do nothing;
  return true;
end $$;

-- Lecture admin, seul autre accès : mêmes droits que hg_admin_read_conversation (permission « messages ») et même journal
-- (hg_admin_access_log) ; appelée avec la lecture des messages, à l'ouverture de la conversation dans le panel.
-- Le vrai membre est renvoyé (le panel affiche « (Santa) », comme pour l'expéditeur des messages).
create or replace function public.hg_admin_message_reactions(p_conv uuid)
returns table(message_id bigint, emoji text, user_id uuid, pseudo text)
language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if not public.hg_has_perm('messages') then raise exception 'Réservé à l''admin'; end if;
  select c.kind into v_kind from public.hg_conversations c where c.id = p_conv;
  if not found then raise exception 'Conversation introuvable'; end if;
  insert into public.hg_admin_access_log(admin_id, conversation_id, conversation_kind) values (auth.uid(), p_conv, v_kind);
  return query select r.message_id, r.emoji, r.user_id, coalesce(p.pseudo, 'Ancien membre')
    from public.hg_message_reactions r
    join public.hg_messages x on x.id = r.message_id
    left join public.hg_profiles p on p.id = r.user_id
    where x.conversation_id = p_conv
    order by r.message_id, r.created_at, r.emoji;
end $$;

revoke all on function public.hg_message_reactions_get(uuid), public.hg_message_react(bigint, text), public.hg_admin_message_reactions(uuid) from public, anon;
grant execute on function public.hg_message_reactions_get(uuid), public.hg_message_react(bigint, text), public.hg_admin_message_reactions(uuid) to authenticated;
