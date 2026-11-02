-- ===== Humane Gang — migration 197 : barre « Reprendre ma partie » de la page Jeux, parties fantômes des plateaux =====
-- 1. hg_plat_parties.humain_at : dernier geste d'une personne à une table (coup, salle d'attente, départ, message du chat). Le jeu qui joue
--    pour un absent ne le touche jamais.
-- 2. hg_plat__echeances ne rafraîchit plus activite_at : à chaque minute le tick la remettait à maintenant, l'arrêt à 6 h n'arrivait donc
--    jamais et des parties sans personne tournaient sans fin. La version monte toujours, les tables ouvertes se mettent à jour comme avant.
-- 3. hg_plat__echeances annule une partie quand plus personne n'est présent (absent, parti ou éliminé pour tous) et qu'aucun geste humain
--    n'a eu lieu depuis 30 minutes. Passage par hg_plat__terminer(annulee = true), qui s'arrête avant les Paillettes et les badges :
--    personne ne gagne ni ne perd quoi que ce soit, et les tables n'ont aucune mise en Paillettes (jetons internes à la partie).
--    Les robots sont marqués absents dès le départ (migration 131) : une table avec un seul membre parti ou absent se ferme aussi.
-- 4. Parties déjà fantômes : leur humain_at part de leur lancement, elles se ferment donc au premier passage du tick après cette migration.
-- 5. hg_plat_mes_parties ne montre plus une partie quittée (parti) : mon_tour restait vrai pour un joueur parti.
-- 6. hg_jeux_mes_parties() : toutes mes parties ouvertes, tous jeux confondus, en un seul appel. Un jeu fermé au membre est ignoré sans erreur.
-- Le tick (hg_plat_tick) et les fonctions de départ ne changent pas. Rejouable.

/* =====================================================================
   1. Activité humaine
   ===================================================================== */

alter table public.hg_plat_parties add column if not exists humain_at timestamptz not null default now();

-- Partie déjà sans personne : aucune trace d'un geste humain (hg_plat_coups note aussi les coups du jeu), on repart de son lancement.
update public.hg_plat_parties p set humain_at = coalesce(p.started_at, p.created_at)
  where p.statut = 'en_cours'
    and not exists (select 1 from public.hg_plat_joueurs j where j.partie = p.id and not j.absent and not j.parti and not j.elimine);

-- Tous les appels restants viennent d'un geste d'une personne : hg_plat__echeances ne passe plus par ici.
create or replace function public.hg_plat__bump(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update hg_plat_parties set version = version + 1, activite_at = now(), humain_at = now() where id = p_id
$$;

create or replace function public.hg_plat_message(p_code text, p_texte text)
returns void language plpgsql security definer set search_path = public as $$
declare p hg_plat_parties; t text;
begin
  p := hg_plat__partie(p_code);
  if not hg_plat_dans(p.id) then raise exception 'Tu ne joues pas dans cette partie.'; end if;
  t := left(trim(coalesce(p_texte, '')), 300);
  if t = '' then raise exception 'Message vide.'; end if;
  if (select count(*) from hg_plat_messages where partie = p.id and user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 5 then
    raise exception 'Doucement : attends quelques secondes avant d''écrire.';
  end if;
  insert into hg_plat_messages(partie, user_id, texte) values (p.id, auth.uid(), t);
  -- Une table qui discute n'est pas abandonnée. Une écriture par minute au plus : chaque mise à jour de la partie part en temps réel.
  update hg_plat_parties set humain_at = now() where id = p.id and humain_at < now() - interval '1 minute';
end $$;

/* =====================================================================
   2. Échéances : plus de faux signe de vie, fermeture des tables vides
   ===================================================================== */

-- Échéance dépassée : le jeu joue pour le joueur attendu (3 fois de suite → absent, il joue alors vite).
-- Plus personne de présent depuis 30 minutes : la partie est annulée, sans Paillettes.
create or replace function public.hg_plat__echeances(p_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare p hg_plat_parties; n int := 0; v_ok boolean; v_dernier uuid;
begin
  -- La ligne est verrouillée avant de lire les joueurs : un coup en cours passe d'abord, et il remet tout le monde à jour.
  select * into p from hg_plat_parties where id = p_id for update;
  if p.statut = 'en_cours' and p.humain_at < now() - interval '30 minutes'
     and not exists (select 1 from hg_plat_joueurs j where j.partie = p_id and not j.absent and not j.parti and not j.elimine) then
    perform hg_plat__terminer(p_id, null, 'abandon', true);
    return true;
  end if;
  loop
    select * into p from hg_plat_parties where id = p_id for update;
    exit when p.statut <> 'en_cours' or p.tour_fin is null or now() < p.tour_fin or n >= 30;
    -- Un tour manqué compte une seule fois, même si le jeu joue plusieurs étapes pour ce joueur.
    if p.tour is not null and p.tour is distinct from v_dernier then
      v_dernier := p.tour;
      update hg_plat_joueurs set manques = manques + 1, absent = absent or manques + 1 >= 3 where partie = p_id and user_id = p.tour;
    end if;
    execute format('select public.hg_plat__%s_auto($1)', p.jeu) into v_ok using p_id;
    n := n + 1;
    if not coalesce(v_ok, false) then
      -- Le jeu n'a rien pu jouer : on passe la main pour ne jamais bloquer.
      update hg_plat_parties set tour_fin = now() + make_interval(secs => t_tour) where id = p_id;
      exit;
    end if;
  end loop;
  -- Pas de hg_plat__bump ici : la version prévient les tables ouvertes, mais activite_at et humain_at ne bougent pas sans personne.
  if n > 0 then update hg_plat_parties set version = version + 1 where id = p_id; end if;
  return n > 0;
end $$;

/* =====================================================================
   3. Mes parties d'un jeu : plus de partie quittée
   ===================================================================== */

create or replace function public.hg_plat_mes_parties(p_jeu text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not hg_plat_peut(p_jeu) then raise exception 'Accès réservé.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('code', p.code, 'nom', p.nom, 'statut', p.statut,
      'inscrits', (select count(*) from hg_plat_joueurs where partie = p.id), 'mon_tour', p.tour = auth.uid() and not j.parti,
      'tour_pseudo', case when p.tour is null then null else hg_plat__nom(p.id, p.tour) end) order by p.created_at desc)
    from hg_plat_parties p join hg_plat_joueurs j on j.partie = p.id and j.user_id = auth.uid()
    where p.jeu = p_jeu and p.statut in ('attente', 'en_cours') and not j.parti), '[]'::jsonb);
end $$;

/* =====================================================================
   4. Toutes mes parties ouvertes (barre « Reprendre ma partie »)
   ===================================================================== */

-- Une ligne par partie : espace (duel, uno, ndc, lg, plat), jeu, nom_jeu, code, nom, statut, a_toi, activite, et ce qu'il faut pour le
-- sous-titre (mêmes champs que les blocs « Mes parties » de chaque jeu). Tri : « À toi » d'abord, puis dernière activité ; 30 lignes au plus.
-- Masquées : partie quittée (uno : exclu, ndc et plateaux : parti) ; aux plateaux, moi absent, ou personne de présent.
-- Duels, Uno, Nom de code et Loup-Garou n'ont pas d'état « absent » : un joueur qui ne répond plus y est sorti ou la partie finit.
-- Duels contre le robot compris.
create or replace function public.hg_jeux_mes_parties()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_moi uuid := auth.uid();
begin
  if v_moi is null then raise exception 'Accès réservé.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(t.ligne || jsonb_build_object('a_toi', t.a_toi, 'activite', t.activite)
      order by t.a_toi desc, t.activite desc, t.ligne->>'code')
    from (select x.ligne, x.a_toi, x.activite from (
      select jsonb_build_object('espace', 'duel', 'jeu', p.jeu, 'nom_jeu', hg_duel__jeu_nom(p.jeu, p.variante), 'code', p.code,
          'nom', hg_duel__jeu_nom(p.jeu, p.variante), 'statut', p.statut, 'robot', p.robot > 0,
          'adversaire', coalesce((select pseudo from hg_duel_joueurs where partie = p.id and user_id <> v_moi), (select pseudo from hg_profiles where id = p.defie)),
          'defi_en_attente', p.defie is not null and p.statut = 'attente', 'tour_fin', coalesce(p.tour_fin, j.fin)) as ligne,
        coalesce(p.tour = v_moi or (p.jeu = 'mastermind' and j.fin is not null), false) as a_toi, p.activite_at as activite
      from hg_duel_parties p join hg_duel_joueurs j on j.partie = p.id and j.user_id = v_moi
      where p.statut in ('attente', 'en_cours') and hg_duel_peut()

      union all
      select jsonb_build_object('espace', 'uno', 'jeu', 'uno', 'nom_jeu', 'Uno', 'code', p.code, 'nom', p.nom, 'statut', p.statut,
          'inscrits', (select count(*) from hg_uno_joueurs where partie = p.id and not exclu), 'mes_cartes', j.nb_cartes,
          'tour_pseudo', case when p.tour is null then null else hg_uno__nom(p.id, p.tour) end),
        coalesce(p.tour = v_moi, false), p.activite_at
      from hg_uno_parties p join hg_uno_joueurs j on j.partie = p.id and j.user_id = v_moi
      where p.statut in ('attente', 'en_cours') and not j.exclu and hg_uno_peut()

      union all
      select jsonb_build_object('espace', 'ndc', 'jeu', 'nom-de-code', 'nom_jeu', 'Nom de code', 'code', p.code, 'nom', p.nom, 'statut', p.statut,
          'inscrits', (select count(*) from hg_ndc_joueurs where partie = p.id and not parti), 'tour_equipe', p.tour_equipe),
        coalesce(p.statut = 'en_cours' and p.tour_equipe = j.equipe and ((p.phase = 'indice') = j.espion), false), p.activite_at
      from hg_ndc_parties p join hg_ndc_joueurs j on j.partie = p.id and j.user_id = v_moi
      where p.statut in ('attente', 'en_cours') and not j.parti and hg_ndc_peut()

      union all
      select jsonb_build_object('espace', 'lg', 'jeu', 'loup-garou', 'nom_jeu', 'Loup-Garou', 'code', p.code, 'nom', p.nom, 'statut', p.statut,
          'phase', p.phase, 'manche', p.manche, 'mode', p.mode, 'nb_joueurs', p.nb_joueurs,
          'vivants', (select count(*) from hg_lg_joueurs v where v.partie = p.id and v.vivant)),
        -- Même règle que hg_lg__complet : une action attendue et pas encore faite (ni « passer »), ou un vote pas encore posé.
        coalesce(j.user_id is not null and p.statut <> 'attente' and (
          (p.phase <> 'vote' and exists (select 1 from hg_lg__attendus(p.id) a where a.user_id = v_moi
            and not exists (select 1 from hg_lg_actions x where x.partie = p.id and x.manche = p.manche and x.etape = p.phase
              and x.user_id = v_moi and (x.type = a.type or x.type = 'passer'))))
          or (p.phase = 'vote' and j.vivant and j.peut_voter
            and not exists (select 1 from hg_lg_votes v where v.partie = p.id and v.manche = p.manche and v.user_id = v_moi))), false),
        coalesce(p.started_at, p.created_at)
      from hg_lg_parties p left join hg_lg_joueurs j on j.partie = p.id and j.user_id = v_moi
      where p.statut in ('attente', 'revelation', 'en_cours') and hg_lg_peut()
        and (j.user_id is not null or (p.mode = 'mj' and p.hote = v_moi))

      union all
      select jsonb_build_object('espace', 'plat', 'jeu', p.jeu, 'nom_jeu', hg_plat__jeu_nom(p.jeu), 'code', p.code, 'nom', p.nom, 'statut', p.statut,
          'inscrits', (select count(*) from hg_plat_joueurs where partie = p.id and not parti),
          'tour_pseudo', case when p.tour is null then null else hg_plat__nom(p.id, p.tour) end),
        coalesce(p.tour = v_moi, false), p.humain_at
      from hg_plat_parties p join hg_plat_joueurs j on j.partie = p.id and j.user_id = v_moi
      where p.statut in ('attente', 'en_cours') and not j.absent and not j.parti and hg_plat_peut(p.jeu)
        and exists (select 1 from hg_plat_joueurs z where z.partie = p.id and not z.absent and not z.parti and not z.elimine)
    ) x order by x.a_toi desc, x.activite desc limit 30) t), '[]'::jsonb);
end $$;

revoke all on function public.hg_jeux_mes_parties() from public, anon;
grant execute on function public.hg_jeux_mes_parties() to authenticated;

-- Referme les fonctions internes remplacées ci-dessus et rouvre les fonctions publiques des plateaux aux seuls membres connectés.
select public.hg_plat__droits();
