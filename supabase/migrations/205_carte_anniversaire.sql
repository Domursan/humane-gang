-- 205 : carte d'anniversaire commune (idée 52). Trois jours avant l'anniversaire d'un membre qui partage sa date, une carte
-- s'ouvre : les autres membres y écrivent un mot (15 à 280 caractères, modifiable jusqu'à 23 h 59 le jour J, heure de Zurich).
-- La personne fêtée ne voit rien avant le jour J, même si elle est admin : aucune lecture admin, aucune exception.
-- Le jour J, elle trouve la carte en haut de son accueil (2 mots au moins), puis la garde dans « Mes souvenirs » de son compte ;
-- les signataires peuvent la relire. Refus possible : hg_profiles.carte_anniv (case de son profil).
-- Notifications du site, catégorie « anniversaires » (coupable par la clé anniversaires.site) : à l'ouverture, à tous sauf la
-- personne fêtée ; la veille, une seule fois, à ceux qui n'ont pas signé. Jamais sur Discord : hg-birthdays ne change pas.
-- hg_set_notif_prefs (reprise de la 200) accepte la clé anniversaires.site. hg_export_my_data (reprise de la version en ligne)
-- exporte les mots dont le membre est l'auteur (cartes_anniversaire_mots), jamais ceux des autres. Passage horaire pg_cron « hg-cartes-anniv ».
-- Ordre : cette migration avant le site (Mon compte enregistre la clé anniversaires.site et la colonne carte_anniv).
-- Tables fermées aux clients (aucune policy) : tout passe par les fonctions ci-dessous. Idempotente.

alter table public.hg_profiles add column if not exists carte_anniv boolean not null default true;
comment on column public.hg_profiles.carte_anniv is 'Faux : le membre refuse la carte d’anniversaire commune (migration 205).';

create table if not exists public.hg_cartes_anniv (
  id bigint generated always as identity primary key,
  fete_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  jour date not null,
  ouverte_at timestamptz not null default now(),
  rappel_at timestamptz,
  unique (fete_id, jour)
);
alter table public.hg_cartes_anniv enable row level security;
revoke all on table public.hg_cartes_anniv from anon, authenticated;
comment on table public.hg_cartes_anniv is 'Cartes d’anniversaire communes : une par membre fêté et par anniversaire (jour = date fêtée). Migration 205.';

create table if not exists public.hg_cartes_anniv_mots (
  carte_id bigint not null references public.hg_cartes_anniv(id) on delete cascade,
  auteur_id uuid not null references public.hg_profiles(id) on update cascade on delete cascade,
  texte text not null check (char_length(texte) between 15 and 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (carte_id, auteur_id)
);
create index if not exists hg_cartes_anniv_mots_auteur_idx on public.hg_cartes_anniv_mots (auteur_id);
alter table public.hg_cartes_anniv_mots enable row level security;
revoke all on table public.hg_cartes_anniv_mots from anon, authenticated;
comment on table public.hg_cartes_anniv_mots is 'Mots des cartes d’anniversaire communes, un par signataire. Lus seulement par les RPC hg_carte_anniv*. Migration 205.';

/* Prochaine date fêtée à partir de p_auj (aujourd'hui compris). Le 29 février est fêté le 28 les années non bissextiles,
   comme sur l'accueil (anniversaires-liste.js). */
create or replace function public.hg_carte_anniv__jour(p_naissance date, p_auj date)
returns date language sql immutable set search_path = public as $$
  select min(j) from (
    select case when extract(month from p_naissance) = 2 and extract(day from p_naissance) = 29
                      and not (y % 4 = 0 and (y % 100 <> 0 or y % 400 = 0))
                 then make_date(y, 2, 28)
                 else make_date(y, extract(month from p_naissance)::int, extract(day from p_naissance)::int) end as j
      from (values (extract(year from p_auj)::int), (extract(year from p_auj)::int + 1)) a(y)) d
   where j >= p_auj $$;

/* Vrai si la carte vaut encore pour la personne fêtée : date partagée et inchangée, carte acceptée, pas un fantôme. */
create or replace function public.hg_carte_anniv__valide(p_fete uuid, p_jour date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from hg_profiles p
                  where p.id = p_fete and p.share_birthday and p.carte_anniv and not p.is_ghost and p.birthday is not null
                    and hg_carte_anniv__jour(p.birthday, p_jour) = p_jour) $$;

/* « jeudi 5 novembre » (sans dépendre de la langue du serveur). */
create or replace function public.hg_carte_anniv__date(p date)
returns text language sql immutable set search_path = public as $$
  select (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from p)::int + 1]
      || ' ' || extract(day from p)::int || ' '
      || (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from p)::int] $$;

/* Passage horaire (pg_cron) : ouvre les cartes à J−3 et envoie le rappel de la veille. Entre 9 h et 22 h (Zurich) seulement,
   pour ne réveiller personne. Idempotente : une carte n'est ouverte qu'une fois (unique), un rappel n'est envoyé qu'une fois. */
create or replace function public.hg_carte_anniv__tick()
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_maintenant timestamp := now() at time zone 'Europe/Zurich';
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
  v_ouvertes int := 0;
  v_rappels int := 0;
  v_id bigint;
  r record;
begin
  if extract(hour from v_maintenant) < 9 or extract(hour from v_maintenant) >= 22 then
    return jsonb_build_object('hors_heures', true);
  end if;
  for r in
    select p.id, p.pseudo, hg_carte_anniv__jour(p.birthday, v_auj) as jour
      from hg_profiles p
     where p.share_birthday and p.carte_anniv and not p.is_ghost and p.birthday is not null
       and hg_carte_anniv__jour(p.birthday, v_auj) - v_auj between 0 and 3
  loop
    v_id := null;
    insert into hg_cartes_anniv (fete_id, jour) values (r.id, r.jour)
      on conflict (fete_id, jour) do nothing returning id into v_id;
    if v_id is null then continue; end if;
    v_ouvertes := v_ouvertes + 1;
    perform hg_site_notif(u.id, 'anniversaires', 'Carte d’anniversaire de ' || r.pseudo,
        r.pseudo || ' fête son anniversaire ' || case when r.jour = v_auj then 'aujourd’hui' else hg_carte_anniv__date(r.jour) end
          || '. Écris un mot sur sa carte commune : elle reste une surprise jusqu’au jour J.',
        '/pages/compte/accueil.html')
      from hg_profiles u
     where u.id <> r.id and not u.is_ghost and hg_notif_allowed(u.id, 'anniversaires', 'site');
  end loop;
  for r in
    select c.id, c.fete_id, p.pseudo
      from hg_cartes_anniv c join hg_profiles p on p.id = c.fete_id
     where c.jour = v_auj + 1 and c.rappel_at is null
       and (c.ouverte_at at time zone 'Europe/Zurich')::date < v_auj
       and hg_carte_anniv__valide(c.fete_id, c.jour)
  loop
    update hg_cartes_anniv set rappel_at = now() where id = r.id;
    v_rappels := v_rappels + 1;
    perform hg_site_notif(u.id, 'anniversaires', 'Demain, c’est l’anniversaire de ' || r.pseudo,
        'Tu n’as pas encore signé sa carte commune. Tu peux le faire jusqu’à demain, 23 h 59.', '/pages/compte/accueil.html')
      from hg_profiles u
     where u.id <> r.fete_id and not u.is_ghost
       and not exists (select 1 from hg_cartes_anniv_mots m where m.carte_id = r.id and m.auteur_id = u.id)
       and hg_notif_allowed(u.id, 'anniversaires', 'site');
  end loop;
  return jsonb_build_object('ouvertes', v_ouvertes, 'rappels', v_rappels);
end $$;

/* Accueil : cartes à signer (les autres membres, J−3 à J) et, le jour J, la carte de la personne connectée (2 mots au moins). */
create or replace function public.hg_carte_anniv_ouvertes()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
begin
  if not hg_is_member() then return jsonb_build_object('cartes', '[]'::jsonb, 'ma_carte', null); end if;
  return jsonb_build_object(
    'cartes', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'fete_id', c.fete_id, 'jour', c.jour,
                  'mots', (select count(*) from hg_cartes_anniv_mots m where m.carte_id = c.id),
                  'mon_mot', (select m.texte from hg_cartes_anniv_mots m where m.carte_id = c.id and m.auteur_id = me))
                  order by c.jour), '[]'::jsonb)
                 from hg_cartes_anniv c
                where c.fete_id <> me and c.jour between v_auj and v_auj + 3 and hg_carte_anniv__valide(c.fete_id, c.jour)),
    'ma_carte', (select jsonb_build_object('id', c.id, 'jour', c.jour, 'mots', count(*))
                   from hg_cartes_anniv c join hg_cartes_anniv_mots m on m.carte_id = c.id
                  where c.fete_id = me and c.jour = v_auj and hg_carte_anniv__valide(c.fete_id, c.jour)
                  group by c.id, c.jour having count(*) >= 2));
end $$;

/* Une carte et ses mots. La personne fêtée : à partir du jour J seulement. Les autres : pendant l'ouverture, puis s'ils ont signé. */
create or replace function public.hg_carte_anniv(p_carte bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
  c hg_cartes_anniv;
  v_signe boolean;
  v_ouverte boolean;
begin
  select * into c from hg_cartes_anniv where id = p_carte;
  if not found or not hg_is_member() then raise exception 'Carte introuvable.'; end if;
  v_signe := exists (select 1 from hg_cartes_anniv_mots m where m.carte_id = c.id and m.auteur_id = me);
  v_ouverte := c.fete_id <> me and c.jour >= v_auj and hg_carte_anniv__valide(c.fete_id, c.jour);
  if c.fete_id = me then
    if c.jour > v_auj then raise exception 'Surprise : ta carte se découvre le jour de ton anniversaire.'; end if;
  elsif not v_signe and not v_ouverte then
    raise exception 'Carte introuvable.';
  end if;
  return jsonb_build_object(
    'id', c.id, 'jour', c.jour, 'a_moi', c.fete_id = me, 'ouverte', v_ouverte,
    'fete', (select jsonb_build_object('id', p.id, 'pseudo', p.pseudo) from hg_profiles p where p.id = c.fete_id),
    'mon_mot', (select m.texte from hg_cartes_anniv_mots m where m.carte_id = c.id and m.auteur_id = me),
    'mots', (select coalesce(jsonb_agg(jsonb_build_object('auteur_id', m.auteur_id, 'pseudo', p.pseudo, 'avatar_url', p.avatar_url,
                'color', p.color, 'texte', m.texte, 'a_moi', m.auteur_id = me) order by m.created_at), '[]'::jsonb)
               from hg_cartes_anniv_mots m join hg_profiles p on p.id = m.auteur_id where m.carte_id = c.id));
end $$;

/* Signer (ou modifier son mot) : 15 à 280 caractères, de l'ouverture à 23 h 59 le jour J (Zurich). */
create or replace function public.hg_carte_anniv_signer(p_carte bigint, p_texte text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
  v_txt text := btrim(coalesce(p_texte, ''));
  c hg_cartes_anniv;
begin
  if not hg_is_member() then raise exception 'Réservé aux membres.'; end if;
  select * into c from hg_cartes_anniv where id = p_carte;
  if not found or not hg_carte_anniv__valide(c.fete_id, c.jour) then raise exception 'Carte introuvable.'; end if;
  if c.fete_id = me then raise exception 'Tu ne peux pas signer ta propre carte.'; end if;
  if c.jour < v_auj then raise exception 'La carte est fermée : on pouvait la signer jusqu’à minuit le jour J.'; end if;
  if char_length(v_txt) < 15 then raise exception 'Écris au moins 15 caractères : un vrai mot fera plus plaisir qu’un « joyeux anniv ».'; end if;
  if char_length(v_txt) > 280 then raise exception 'Ton mot fait au plus 280 caractères.'; end if;
  insert into hg_cartes_anniv_mots (carte_id, auteur_id, texte) values (c.id, me, v_txt)
    on conflict (carte_id, auteur_id) do update set texte = excluded.texte, updated_at = now();
  return jsonb_build_object('mots', (select count(*) from hg_cartes_anniv_mots m where m.carte_id = c.id), 'mon_mot', v_txt);
end $$;

/* « Mes souvenirs » du compte : ma carte (à partir du jour J, si elle a au moins un mot) et celles que j'ai signées. */
create or replace function public.hg_carte_anniv_souvenirs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_auj date := (now() at time zone 'Europe/Zurich')::date;
begin
  if not hg_is_member() then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'jour', c.jour, 'fete_id', c.fete_id, 'pseudo', p.pseudo,
              'a_moi', c.fete_id = me, 'mots', (select count(*) from hg_cartes_anniv_mots m where m.carte_id = c.id))
              order by c.jour desc, c.id desc), '[]'::jsonb)
            from hg_cartes_anniv c join hg_profiles p on p.id = c.fete_id
           where (c.fete_id = me and c.jour <= v_auj and exists (select 1 from hg_cartes_anniv_mots m where m.carte_id = c.id))
              or exists (select 1 from hg_cartes_anniv_mots m where m.carte_id = c.id and m.auteur_id = me));
end $$;

-- Droits : fonctions internes fermées ; les quatre RPC du site aux membres connectés seulement.
revoke all on function public.hg_carte_anniv__jour(date, date) from public, anon, authenticated;
revoke all on function public.hg_carte_anniv__valide(uuid, date) from public, anon, authenticated;
revoke all on function public.hg_carte_anniv__date(date) from public, anon, authenticated;
revoke all on function public.hg_carte_anniv__tick() from public, anon, authenticated;
revoke all on function public.hg_carte_anniv_ouvertes() from public, anon;
revoke all on function public.hg_carte_anniv(bigint) from public, anon;
revoke all on function public.hg_carte_anniv_signer(bigint, text) from public, anon;
revoke all on function public.hg_carte_anniv_souvenirs() from public, anon;
grant execute on function public.hg_carte_anniv_ouvertes() to authenticated;
grant execute on function public.hg_carte_anniv(bigint) to authenticated;
grant execute on function public.hg_carte_anniv_signer(bigint, text) to authenticated;
grant execute on function public.hg_carte_anniv_souvenirs() to authenticated;

-- Passage toutes les heures (à la 5e minute) ; la fonction ne fait rien hors de 9 h à 22 h, heure de Zurich.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'hg-cartes-anniv') then perform cron.unschedule('hg-cartes-anniv'); end if;
    perform cron.schedule('hg-cartes-anniv', '5 * * * *', 'select public.hg_carte_anniv__tick()');
  end if;
end $$;

-- Reprise de la migration 200 (version en ligne) : clé « anniversaires.site » ajoutée à la liste blanche, pour couper les
-- notifications des cartes communes depuis Mon compte. Rien d'autre ne change.
create or replace function public.hg_set_notif_prefs(p_prefs jsonb, p_quiet_start int default null, p_quiet_end int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_allowed text[] := array[
    'messages.push', 'messages.discord', 'sorties.push', 'sorties.discord', 'echanges.push', 'echanges.discord',
    'souhaits.push', 'souhaits.discord', 'santa.push', 'santa.discord', 'anniversaires.push', 'anniversaires.discord',
    'quiz.push', 'quiz.discord', 'jeux.push', 'jeux.discord', 'carte_proposee.site', 'tours.push', 'tours.discord', 'anniversaires.site'];
  v_key text;
  v_val jsonb;
  v_row public.hg_notif_prefs;
begin
  if v_uid is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if not exists (select 1 from public.hg_profiles where id = v_uid) then raise exception 'Profil introuvable' using errcode = '42501'; end if;
  if p_prefs is null or jsonb_typeof(p_prefs) <> 'object' then raise exception 'Préférences invalides' using errcode = '22023'; end if;
  if octet_length(p_prefs::text) > 2000 then raise exception 'Préférences trop longues' using errcode = '22023'; end if;
  for v_key, v_val in select key, value from jsonb_each(p_prefs) loop
    if not (v_key = any (v_allowed)) then raise exception 'Catégorie inconnue : %', left(v_key, 40) using errcode = '22023'; end if;
    if jsonb_typeof(v_val) <> 'boolean' then raise exception 'Valeur invalide pour %', v_key using errcode = '22023'; end if;
  end loop;
  if (p_quiet_start is null) <> (p_quiet_end is null) then raise exception 'Heures calmes incomplètes' using errcode = '22023'; end if;
  if p_quiet_start is not null and (p_quiet_start not between 0 and 23 or p_quiet_end not between 0 and 23 or p_quiet_start = p_quiet_end) then
    raise exception 'Heures calmes invalides (0 à 23, début différent de la fin)' using errcode = '22023';
  end if;

  insert into public.hg_notif_prefs as n (user_id, prefs, quiet_start, quiet_end, updated_at)
  values (v_uid, p_prefs, p_quiet_start, p_quiet_end, now())
  on conflict (user_id) do update set prefs = excluded.prefs, quiet_start = excluded.quiet_start,
    quiet_end = excluded.quiet_end, updated_at = now()
  returning * into v_row;

  -- Colonnes encore lues par les fonctions edge (rappels de sortie, alerte de souhait)
  update public.hg_profiles set
    remind_irl = coalesce((p_prefs ->> 'sorties.discord')::boolean, remind_irl),
    notify_card_wish = coalesce((p_prefs ->> 'souhaits.discord')::boolean, notify_card_wish)
  where id = v_uid
    and (remind_irl is distinct from coalesce((p_prefs ->> 'sorties.discord')::boolean, remind_irl)
      or notify_card_wish is distinct from coalesce((p_prefs ->> 'souhaits.discord')::boolean, notify_card_wish));

  return jsonb_build_object('prefs', v_row.prefs, 'quiet_start', v_row.quiet_start, 'quiet_end', v_row.quiet_end, 'updated_at', v_row.updated_at);
end $$;
comment on function public.hg_set_notif_prefs(jsonb, int, int) is 'Enregistre les notifications par catégorie du membre connecté (liste blanche, heures 0 à 23). Migrations 095, 122 (catégorie « jeux »), 193 (carte_proposee.site), 200 (catégorie « tours ») et 205 (anniversaires.site).';
revoke all on function public.hg_set_notif_prefs(jsonb, int, int) from public, anon;
grant execute on function public.hg_set_notif_prefs(jsonb, int, int) to authenticated;

-- Reprise de hg_export_my_data (version en ligne, migration 021) : ajout de « cartes_anniversaire_mots », les mots dont le membre
-- est l'auteur (carte, personne fêtée, date fêtée, texte, dates). Jamais les mots des autres. Rien d'autre ne change.
create or replace function public.hg_export_my_data()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
select jsonb_build_object(
  'profil', (select to_jsonb(p) from hg_profiles p where id = auth.uid()),
  'infos_profil', (select to_jsonb(x) from hg_profile_info x where user_id = auth.uid()),
  'secret_santa_participations', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_ss_participants x where user_id = auth.uid()),
  'souhaits', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_ss_wishes x where user_id = auth.uid()),
  'reponses_irl', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_event_rsvps x where user_id = auth.uid()),
  'sorties_creees', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_events x where created_by = auth.uid()),
  'votes_dates', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_event_date_votes x where user_id = auth.uid()),
  'photos', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_photos x where user_id = auth.uid()),
  'moments_crees', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_moments x where created_by = auth.uid()),
  'messages_envoyes', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from hg_messages x where sender_id = auth.uid()),
  'conversations', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_conversation_members x where user_id = auth.uid()),
  'idees', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_ideas x where user_id = auth.uid()),
  'assistance', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_support x where user_id = auth.uid()),
  'badges', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_user_badges x where user_id = auth.uid()),
  'captures_evenements', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_dyn_captures x where user_id = auth.uid()),
  'cartes_anniversaire_mots', (select coalesce(jsonb_agg(jsonb_build_object('carte', m.carte_id, 'pour', p.pseudo, 'jour', c.jour,
      'texte', m.texte, 'ecrit_le', m.created_at, 'modifie_le', m.updated_at) order by c.jour, m.carte_id), '[]')
      from hg_cartes_anniv_mots m join hg_cartes_anniv c on c.id = m.carte_id left join hg_profiles p on p.id = c.fete_id
     where m.auteur_id = auth.uid()),
  'jeu_de_cartes', jsonb_build_object(
    'portefeuille', (select to_jsonb(w) from hg_wallets w where user_id = auth.uid()),
    'journal', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id),'[]') from hg_wallet_log x where user_id = auth.uid()),
    'exemplaires', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_copies x where owner_id = auth.uid()),
    'echanges', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_trades x where from_user = auth.uid() or to_user = auth.uid()),
    'liste_souhaits', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_wishlist x where user_id = auth.uid()),
    'vitrine', (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from hg_card_showcase x where user_id = auth.uid())
  )
);
$function$;
revoke all on function public.hg_export_my_data() from public, anon;
grant execute on function public.hg_export_my_data() to authenticated;
