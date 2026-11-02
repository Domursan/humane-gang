-- ===== Humane Gang — migration 214 : mode spectateur et son chat (idée 7, lot 7 validé le 02.11.2026) =====
-- Un membre regarde une partie publique en cours sans y jouer, et discute avec les autres spectateurs sur un chat à part.
-- Règles validées :
--   - premier lot : Uno, Blackjack, Monopoly, Destins (rien de caché ne part chez un spectateur : main vide au Uno, carte cachée
--     de la banque « ?? » pour tous au Blackjack, aucun secret au Monopoly ni à Destins ; les vues des plateaux reçoivent
--     « moi » = null pour un spectateur, le journal ne lui montre que les lignes publiques). Poker, Risk, Catan plus tard ;
--     jamais Cluedo, Shadow Hunters, Pictionary, Loup-Garou, Nom de code ;
--   - seulement les parties publiques, et l'hôte peut refuser les spectateurs à la création (colonne spectateurs, vraie par défaut) ;
--     pas d'invités sans compte ni de fantômes ;
--   - chat des spectateurs : les mêmes tables de messages, lignes marquées spect. Les joueurs les lisent sans y écrire, les
--     spectateurs ne lisent jamais le chat de la table ;
--   - compteur calculé par le serveur : spectateurs dont l'état a été relu depuis moins d'une minute (hg_spect_vus, mis à jour
--     par les relectures que le spectateur fait déjà) ; pas de temps réel en plus, le spectateur écoute le canal de la partie ;
--   - 20 spectateurs par partie au plus ; « Arrêter de regarder » efface la ligne du spectateur.
-- Fonctions retouchées par hg__patch (141), depuis leur dernière version : hg_uno_etat (171, 199, 211), hg_plat_etat (125, 199),
-- hg_uno_creer (121), hg_uno_rejouer (121, 199), hg_plat_creer (136), hg_plat_rejouer (125). Réécrites depuis leur dernière
-- version : hg_uno_message, hg_uno_messages (121), hg_plat_message (125, 197), hg_plat_messages (125). Règles de lecture des
-- parties et des messages (121, 125) élargies aux spectateurs. Rejouable.

/* =====================================================================
   1. Colonnes et table des spectateurs
   ===================================================================== */
alter table public.hg_uno_parties add column if not exists spectateurs boolean not null default true;    -- spectateurs admis
alter table public.hg_plat_parties add column if not exists spectateurs boolean not null default true;
alter table public.hg_uno_messages add column if not exists spect boolean not null default false;      -- chat des spectateurs
alter table public.hg_uno_messages add column if not exists pseudo text;                                -- auteur spectateur (pas à la table)
alter table public.hg_uno_messages add column if not exists couleur text;
alter table public.hg_plat_messages add column if not exists spect boolean not null default false;
alter table public.hg_plat_messages add column if not exists pseudo text;
alter table public.hg_plat_messages add column if not exists couleur text;

-- Un spectateur par partie (Uno ou plateau : les identifiants ne se croisent pas). vu_at : dernière relecture de l'état.
create table if not exists public.hg_spect_vus (
  partie uuid not null,
  user_id uuid not null,
  jeu text not null,
  vu_at timestamptz not null default now(),
  primary key (partie, user_id)
);
create index if not exists hg_spect_vus_user on public.hg_spect_vus(user_id);
alter table public.hg_spect_vus enable row level security;
revoke all on public.hg_spect_vus from anon, authenticated;

/* =====================================================================
   2. Outils
   ===================================================================== */

-- Jeux qui se regardent (premier lot).
create or replace function public.hg_spect__jeu_ok(p_jeu text)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(p_jeu in ('uno', 'blackjack', 'monopoly', 'destins'), false)
$$;

-- Un membre avec un compte : ni invité sans compte, ni fantôme.
create or replace function public.hg_spect__membre()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
    and exists (select 1 from hg_profiles where id = auth.uid() and not is_ghost)
    and not exists (select 1 from hg_uno_invites where user_id = auth.uid())
    and not exists (select 1 from hg_plat_invites where user_id = auth.uid())
$$;

-- Spectateurs d'une partie : état relu depuis moins d'une minute.
create or replace function public.hg_spect__nb(p_partie uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from hg_spect_vus where partie = p_partie and vu_at > now() - interval '1 minute'
$$;

-- Note mon passage de spectateur. Une nouvelle entrée (ou un retour après plus d'une minute) : partie en cours seulement,
-- 20 spectateurs au plus. Mes lignes d'autres parties vieilles d'une heure sont effacées au passage.
create or replace function public.hg_spect__vu(p_partie uuid, p_jeu text, p_en_cours boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_vu timestamptz;
begin
  select vu_at into v_vu from hg_spect_vus where partie = p_partie and user_id = auth.uid();
  if v_vu is null and not p_en_cours then
    raise exception 'Cette partie est terminée : elle ne se regarde plus.' using errcode = '42501';
  end if;
  if p_en_cours and (v_vu is null or v_vu <= now() - interval '1 minute')
     and (select count(*) from hg_spect_vus where partie = p_partie and user_id <> auth.uid() and vu_at > now() - interval '1 minute') >= 20 then
    raise exception 'Cette partie a déjà 20 spectateurs. Réessaie dans un moment.';
  end if;
  insert into hg_spect_vus(partie, user_id, jeu, vu_at) values (p_partie, auth.uid(), p_jeu, now())
    on conflict (partie, user_id) do update set vu_at = now();
  delete from hg_spect_vus where user_id = auth.uid() and partie <> p_partie and vu_at < now() - interval '1 hour';
end $$;

-- Je regarde cette partie (règles de lecture, temps réel compris) : je m'y suis inscrit comme spectateur et elle les admet encore.
create or replace function public.hg_uno_regarde(p_partie uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from hg_spect_vus v join hg_uno_parties p on p.id = v.partie
    where v.partie = p_partie and v.user_id = auth.uid() and p.visibilite = 'publique' and p.spectateurs)
$$;

create or replace function public.hg_plat_regarde(p_partie uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from hg_spect_vus v join hg_plat_parties p on p.id = v.partie
    where v.partie = p_partie and v.user_id = auth.uid() and p.visibilite = 'publique' and p.spectateurs and hg_spect__jeu_ok(p.jeu))
$$;

-- Arrêter de regarder.
create or replace function public.hg_spect_arreter(p_partie uuid)
returns void language sql security definer set search_path = public as $$
  delete from hg_spect_vus where partie = p_partie and user_id = auth.uid()
$$;

/* =====================================================================
   3. Lecture de l'état (hg__patch) et création des parties
   ===================================================================== */
do $do$
declare f regprocedure;
begin
  -- Uno : le spectateur reçoit l'état d'un non-joueur (main vide), moi.spectateur, et le compteur à la racine.
  f := 'public.hg_uno_etat(text)'::regprocedure;
  if pg_get_functiondef(f) !~ 'hg_spect__vu' then
    perform public.hg__patch(f, $o$declare p hg_uno_parties; d hg_uno_cartes; v_moi uuid := auth.uid(); v_joue boolean;$o$,
      $n$declare p hg_uno_parties; d hg_uno_cartes; v_moi uuid := auth.uid(); v_joue boolean; v_spect boolean := false;$n$);
    perform public.hg__patch(f, $o$if not v_joue and not (p.visibilite = 'publique' and p.statut = 'attente' and hg_uno_peut()) then$o$,
      $n$-- Migration 214 : un membre regarde une partie publique en cours qui admet les spectateurs (ou la fin de celle qu'il regardait).
  v_spect := not v_joue and p.visibilite = 'publique' and p.spectateurs and p.statut in ('en_cours', 'terminee') and hg_uno_peut()
    and hg_spect__membre() and (p.statut = 'en_cours' or exists (select 1 from hg_spect_vus where partie = p.id and user_id = v_moi));
  if v_spect then perform hg_spect__vu(p.id, 'uno', p.statut = 'en_cours'); end if;
  if not v_joue and not v_spect and p.statut = 'en_cours' and p.visibilite = 'publique' and not p.spectateurs then
    raise exception 'Cette partie n''accepte pas de spectateurs.' using errcode = '42501';
  end if;
  if not v_joue and not v_spect and not (p.visibilite = 'publique' and p.statut = 'attente' and hg_uno_peut()) then$n$);
    perform public.hg__patch(f, $o$c.lieu = 'main' and c.user_id = v_moi;$o$, $n$c.lieu = 'main' and c.user_id = v_moi and v_joue;$n$);
    perform public.hg__patch(f, $o$'invite', exists (select 1 from hg_uno_invites where user_id = v_moi), 'joue', v_joue$o$,
      $n$'invite', exists (select 1 from hg_uno_invites where user_id = v_moi), 'joue', v_joue, 'spectateur', v_spect$n$);
    perform public.hg__patch(f, $o$'maintenant', now(),$o$,
      $n$'maintenant', now(),
    'spectateurs', jsonb_build_object('admis', p.visibilite = 'publique' and p.spectateurs,
      'nb', case when p.visibilite = 'publique' and p.spectateurs then hg_spect__nb(p.id) else 0 end),$n$);
    perform public.hg__patch(f, $o$when p.statut = 'terminee' and v_moi is not null then$o$,
      $n$when p.statut = 'terminee' and v_moi is not null and v_joue then$n$);
  end if;

  -- Plateaux : même accès pour les jeux du premier lot ; la vue du jeu reçoit moi = null (aucune part privée).
  f := 'public.hg_plat_etat(text)'::regprocedure;
  if pg_get_functiondef(f) !~ 'hg_spect__vu' then
    perform public.hg__patch(f, $o$declare p hg_plat_parties; v_moi uuid := auth.uid(); v_joue boolean; v_jeu jsonb := null;$o$,
      $n$declare p hg_plat_parties; v_moi uuid := auth.uid(); v_joue boolean; v_jeu jsonb := null; v_spect boolean := false;$n$);
    perform public.hg__patch(f, $o$if not v_joue and not (p.visibilite = 'publique' and p.statut = 'attente' and hg_plat_peut(p.jeu)) then$o$,
      $n$-- Migration 214 : un membre regarde une partie publique en cours d'un jeu ouvert aux spectateurs.
  v_spect := not v_joue and p.visibilite = 'publique' and p.spectateurs and hg_spect__jeu_ok(p.jeu) and p.statut in ('en_cours', 'terminee')
    and hg_plat_peut(p.jeu) and hg_spect__membre() and (p.statut = 'en_cours' or exists (select 1 from hg_spect_vus where partie = p.id and user_id = v_moi));
  if v_spect then perform hg_spect__vu(p.id, p.jeu, p.statut = 'en_cours'); end if;
  if not v_joue and not v_spect and p.statut = 'en_cours' and p.visibilite = 'publique' and hg_spect__jeu_ok(p.jeu) and not p.spectateurs then
    raise exception 'Cette partie n''accepte pas de spectateurs.' using errcode = '42501';
  end if;
  if not v_joue and not v_spect and not (p.visibilite = 'publique' and p.statut = 'attente' and hg_plat_peut(p.jeu)) then$n$);
    perform public.hg__patch(f, $o$into v_jeu using p.id, v_moi;$o$, $n$into v_jeu using p.id, case when v_joue then v_moi end;$n$);
    perform public.hg__patch(f, $o$'moi', jsonb_build_object('user_id', v_moi, 'joue', v_joue,$o$,
      $n$'moi', jsonb_build_object('user_id', v_moi, 'joue', v_joue, 'spectateur', v_spect,$n$);
    perform public.hg__patch(f, $o$'maintenant', now(),$o$,
      $n$'maintenant', now(),
    'spectateurs', jsonb_build_object('admis', p.visibilite = 'publique' and p.spectateurs and hg_spect__jeu_ok(p.jeu),
      'nb', case when p.visibilite = 'publique' and p.spectateurs and hg_spect__jeu_ok(p.jeu) then hg_spect__nb(p.id) else 0 end),$n$);
  end if;

  -- Création : case « Spectateurs admis » (cochée par défaut). Revanche : même réglage que la partie finie.
  f := 'public.hg_uno_creer(jsonb)'::regprocedure;
  if pg_get_functiondef(f) !~ 'spectateurs' then
    perform public.hg__patch(f, $o$perform hg_uno__entrer(v_id, null);$o$,
      $n$update hg_uno_parties set spectateurs = coalesce((p->>'spectateurs')::boolean, true) where id = v_id;
  perform hg_uno__entrer(v_id, null);$n$);
  end if;
  f := 'public.hg_uno_rejouer(text)'::regprocedure;
  if pg_get_functiondef(f) !~ 'spectateurs' then
    perform public.hg__patch(f, $o$perform hg_uno__entrer(v_id, null);$o$,
      $n$update hg_uno_parties set spectateurs = p.spectateurs where id = v_id;
  perform hg_uno__entrer(v_id, null);$n$);
  end if;
  f := 'public.hg_plat_creer(jsonb)'::regprocedure;
  if pg_get_functiondef(f) !~ 'spectateurs' then
    perform public.hg__patch(f, $o$perform hg_plat__entrer(v_id, null);$o$,
      $n$update hg_plat_parties set spectateurs = coalesce((p->>'spectateurs')::boolean, true) where id = v_id;
  perform hg_plat__entrer(v_id, null);$n$);
  end if;
  f := 'public.hg_plat_rejouer(text)'::regprocedure;
  if pg_get_functiondef(f) !~ 'spectateurs' then
    perform public.hg__patch(f, $o$perform hg_plat__entrer(v_id, null);$o$,
      $n$update hg_plat_parties set spectateurs = p.spectateurs where id = v_id;
  perform hg_plat__entrer(v_id, null);$n$);
  end if;
end $do$;

/* =====================================================================
   4. Chats : une table de messages par jeu, lignes des spectateurs marquées spect
   ===================================================================== */

-- Uno (121) : un joueur écrit à la table, un spectateur au chat des spectateurs (avec son pseudo et sa couleur de profil).
create or replace function public.hg_uno_message(p_code text, p_texte text)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_uno_parties; t text; v_spect boolean; pr hg_profiles;
begin
  p := hg_uno__partie(p_code);
  v_spect := not hg_uno_dans(p.id);
  if v_spect and not hg_uno_regarde(p.id) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  t := left(trim(coalesce(p_texte, '')), 300);
  if t = '' then raise exception 'Message vide.'; end if;
  if (select count(*) from hg_uno_messages where partie = p.id and user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Doucement : attends quelques secondes avant d''écrire.';
  end if;
  if v_spect then select * into pr from hg_profiles where id = auth.uid(); end if;
  insert into hg_uno_messages(partie, user_id, texte, spect, pseudo, couleur) values (p.id, auth.uid(), t, v_spect, pr.pseudo, pr.color);
end $$;

-- Un joueur lit les deux chats (la table, et celui des spectateurs en lecture) ; un spectateur ne lit que le sien.
create or replace function public.hg_uno_messages(p_partie uuid, p_apres bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_joue boolean := hg_uno_dans(p_partie);
begin
  if not v_joue and not hg_uno_regarde(p_partie) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'pseudo', coalesce(m.pseudo, hg_uno__nom(p_partie, m.user_id)),
      'couleur', m.couleur, 'spect', m.spect, 'texte', m.texte, 'created_at', m.created_at) order by m.id)
    from (select * from hg_uno_messages where partie = p_partie and id > coalesce(p_apres, 0) and (v_joue or spect) order by id desc limit 200) m), '[]'::jsonb);
end $$;

-- Plateaux (125, 197 : une table qui discute n'est pas abandonnée ; un spectateur qui discute ne la garde pas ouverte).
create or replace function public.hg_plat_message(p_code text, p_texte text)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_plat_parties; t text; v_spect boolean; pr hg_profiles;
begin
  p := hg_plat__partie(p_code);
  v_spect := not hg_plat_dans(p.id);
  if v_spect and not hg_plat_regarde(p.id) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  t := left(trim(coalesce(p_texte, '')), 300);
  if t = '' then raise exception 'Message vide.'; end if;
  if (select count(*) from hg_plat_messages where partie = p.id and user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Doucement : attends quelques secondes avant d''écrire.';
  end if;
  if v_spect then select * into pr from hg_profiles where id = auth.uid(); end if;
  insert into hg_plat_messages(partie, user_id, texte, spect, pseudo, couleur) values (p.id, auth.uid(), t, v_spect, pr.pseudo, pr.color);
  -- Une table qui discute n'est pas abandonnée. Une écriture par minute au plus : chaque mise à jour de la partie part en temps réel.
  if not v_spect then
    update hg_plat_parties set humain_at = now() where id = p.id and humain_at < now() - interval '1 minute';
  end if;
end $$;

create or replace function public.hg_plat_messages(p_partie uuid, p_apres bigint default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_joue boolean := hg_plat_dans(p_partie);
begin
  if not v_joue and not hg_plat_regarde(p_partie) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id, 'pseudo', coalesce(m.pseudo, hg_plat__nom(p_partie, m.user_id)),
      'couleur', m.couleur, 'spect', m.spect, 'texte', m.texte, 'created_at', m.created_at) order by m.id)
    from (select * from hg_plat_messages where partie = p_partie and id > coalesce(p_apres, 0) and (v_joue or spect) order by id desc limit 200) m), '[]'::jsonb);
end $$;

/* =====================================================================
   5. Règles de lecture (temps réel) : le spectateur écoute le canal de la partie et le chat des spectateurs
   ===================================================================== */
drop policy if exists hg_uno_parties_read on public.hg_uno_parties;
create policy hg_uno_parties_read on public.hg_uno_parties for select to authenticated
  using (public.hg_uno_peut() and (public.hg_uno_dans(id) or (visibilite = 'publique' and statut = 'attente') or public.hg_uno_regarde(id)));
drop policy if exists hg_uno_messages_read on public.hg_uno_messages;
create policy hg_uno_messages_read on public.hg_uno_messages for select to authenticated
  using (public.hg_uno_peut() and (public.hg_uno_dans(partie) or (spect and public.hg_uno_regarde(partie))));
drop policy if exists hg_plat_parties_read on public.hg_plat_parties;
create policy hg_plat_parties_read on public.hg_plat_parties for select to authenticated
  using (public.hg_plat_peut(jeu) and (public.hg_plat_dans(id) or (visibilite = 'publique' and statut = 'attente') or public.hg_plat_regarde(id)));
drop policy if exists hg_plat_messages_read on public.hg_plat_messages;
create policy hg_plat_messages_read on public.hg_plat_messages for select to authenticated
  using (public.hg_plat_dans(partie) or (spect and public.hg_plat_regarde(partie)));

/* =====================================================================
   6. Où trouver les parties : « En direct »
   ===================================================================== */

-- Accueil du Uno : parties publiques en cours qui admettent les spectateurs, hors les miennes.
create or replace function public.hg_uno_en_direct()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not hg_uno_peut() then raise exception 'Accès réservé.' using errcode = '42501'; end if;
  if not hg_spect__membre() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by (x->>'spectateurs')::int desc, x->>'nom') from (
      select jsonb_build_object('code', p.code, 'nom', p.nom, 'mode', p.mode, 'manche', p.manche,
        'joueurs', (select coalesce(jsonb_agg(j.pseudo order by j.place), '[]'::jsonb) from hg_uno_joueurs j where j.partie = p.id and not j.exclu),
        'spectateurs', hg_spect__nb(p.id)) x
      from hg_uno_parties p where p.statut = 'en_cours' and p.visibilite = 'publique' and p.spectateurs and not hg_uno_dans(p.id)
      order by p.started_at desc nulls last limit 20) s), '[]'::jsonb);
end $$;

-- Accueil d'un plateau : même liste, pour un jeu ouvert aux spectateurs.
create or replace function public.hg_plat_en_direct(p_jeu text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not hg_plat_peut(p_jeu) then raise exception 'Accès réservé.' using errcode = '42501'; end if;
  if not hg_spect__jeu_ok(p_jeu) or not hg_spect__membre() then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by (x->>'spectateurs')::int desc, x->>'nom') from (
      select jsonb_build_object('code', p.code, 'nom', p.nom, 'nb_tours', p.nb_tours,
        'manches', case when p.jeu = 'blackjack' then coalesce((p.options->>'manches')::int, 8) end,
        'tour_pseudo', case when p.tour is null then null else hg_plat__nom(p.id, p.tour) end,
        'joueurs', (select coalesce(jsonb_agg(j.pseudo order by j.place), '[]'::jsonb) from hg_plat_joueurs j where j.partie = p.id and not j.parti),
        'spectateurs', hg_spect__nb(p.id)) x
      from hg_plat_parties p where p.jeu = p_jeu and p.statut = 'en_cours' and p.visibilite = 'publique' and p.spectateurs and not hg_plat_dans(p.id)
      order by p.started_at desc nulls last limit 20) s), '[]'::jsonb);
end $$;

-- Page Jeux : tous les jeux du premier lot que je peux ouvrir, les plus regardés d'abord.
create or replace function public.hg_jeux_en_direct()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb := '[]'::jsonb; j text;
begin
  if not hg_spect__membre() then return v; end if;
  if hg_uno_peut() then
    v := v || (select coalesce(jsonb_agg(x || '{"jeu": "uno"}'::jsonb), '[]'::jsonb) from jsonb_array_elements(hg_uno_en_direct()) x);
  end if;
  foreach j in array array['blackjack', 'monopoly', 'destins'] loop
    if hg_plat_peut(j) then
      v := v || (select coalesce(jsonb_agg(x || jsonb_build_object('jeu', j)), '[]'::jsonb) from jsonb_array_elements(hg_plat_en_direct(j)) x);
    end if;
  end loop;
  return coalesce((select jsonb_agg(x order by (x->>'spectateurs')::int desc, x->>'nom') from jsonb_array_elements(v) x), '[]'::jsonb);
end $$;

/* =====================================================================
   7. Droits
   ===================================================================== */
revoke all on function public.hg_spect__jeu_ok(text), public.hg_spect__membre(), public.hg_spect__nb(uuid),
  public.hg_spect__vu(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.hg_uno_regarde(uuid), public.hg_plat_regarde(uuid), public.hg_spect_arreter(uuid),
  public.hg_uno_en_direct(), public.hg_plat_en_direct(text), public.hg_jeux_en_direct(),
  public.hg_uno_message(text, text), public.hg_uno_messages(uuid, bigint), public.hg_plat_message(text, text),
  public.hg_plat_messages(uuid, bigint) from public, anon;
grant execute on function public.hg_uno_regarde(uuid), public.hg_plat_regarde(uuid), public.hg_spect_arreter(uuid),
  public.hg_uno_en_direct(), public.hg_plat_en_direct(text), public.hg_jeux_en_direct(),
  public.hg_uno_message(text, text), public.hg_uno_messages(uuid, bigint), public.hg_plat_message(text, text),
  public.hg_plat_messages(uuid, bigint) to authenticated;
