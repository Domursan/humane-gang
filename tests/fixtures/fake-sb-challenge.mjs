// Faux client Supabase pour le challenge de la semaine (migration 218) : page /pages/compte/challenge.html, carte de
// l'accueil, section du panel (La Fabrique › Animations › Challenges de la semaine).
// Enveloppe tests/fixtures/fake-sb.mjs : les RPC hg_wch_* et le bucket hg-challenges sont simulés ici, tout le reste part
// vers le faux client commun. Lit window.__SCN (scénario) ; état dans window.__WCH (entries, votes, winners, files) et
// window.__DB.hg_weekly_challenges (la table, écrite directement par le panel). La phase se calcule comme hg_wch_phase.
// Scénario S.wch :
//   phase   : 'participation' (défaut), 'a_venir', 'vote', 'cloture', 'attente', 'termine', 'sans_gagnant', 'vide' (aucun challenge)
//   type    : answer_type du challenge courant (défaut 'image') ; max : participations par membre (défaut 1)
//   mine    : nombre de participations déjà envoyées par le membre connecté (défaut 0 ; en vote : 1, sauf mine: 0)
//   voted   : en vote, le membre a déjà voté (pour la participation de Bruno)
//   fail    : hg_wch_enter échoue (le fichier envoyé doit être retiré) ; archives : false pour n'en mettre aucune
//   orphelins : chemins renvoyés par hg_wch_admin_orphelins ; uploadDelay : délai de l'envoi simulé (ms)
// Le scénario ajoute la page « challenge » à hg_pages (membres, menu Autres) avant le chargement du faux commun.
const SCN = window.__SCN = window.__SCN || {};
SCN.pagesExtra = [...(SCN.pagesExtra || []), { slug: 'challenge', label: 'Challenge de la semaine', mode: 'membres', in_nav: true, sort: 9.5 }];
const base = await import(`${location.origin}${window.__HG_RACINE || ''}/tests/fixtures/fake-sb.mjs`);
const S = SCN;
const W0 = S.wch || {};
const ME = '11111111-1111-4111-8111-111111111111';
const U = (n) => `0000000${n}-0000-4000-8000-00000000000${n}`;
const DAY = 864e5;
const at = (d) => new Date(Date.now() + d * DAY).toISOString();
const ok = (data) => ({ data, error: null });
const ko = (message) => ({ data: null, error: { message, code: 'P0001' } });
let seq = 100;
const nid = () => `cccccccc-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const hex = () => `${String(++seq).padStart(8, '0')}aaaaaaaabbbbbbbbccccccccdddddddd`.slice(0, 32);
/** Image de remplacement (le vrai lien signé n'existe pas hors ligne). */
const IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#6f5f8c"/></svg>');

/* ---------- Données de départ ---------- */
const CUR = 'c0000000-0000-4000-8000-000000000001';
const phase0 = W0.phase || 'participation';
// Dates du challenge courant selon la phase voulue (vote de 2 jours).
const DATES = {
  a_venir: [3, 10], participation: [-2, 5], vote: [-8, -1], cloture: [-9, -2.01], attente: [-9, -2.1],
  termine: [-10, -3], sans_gagnant: [-10, -3],
};
const challenges = [];
const entries = [];
const votes = [];
const winners = [];
const files = {};
const row = (o) => ({ how_to: null, why: null, answer_type: 'image', max_entries: 1, vote_days: 2, reward_paillettes: 300, reward_text: null,
  cancelled_at: null, closed_at: null, no_winner: false, vote_notified_at: null, created_by: ME, created_at: at(-30), ...o });
const entry = (o) => ({ id: nid(), path: null, file_name: null, mime: null, size: null, body: null, caption: null, created_at: at(-1.5), ...o });
const img = (cid, user, caption, extra = {}) => {
  const path = `${cid}/${hex()}.webp`;
  files[path] = { size: 412000, type: 'image/webp' };
  return entry({ challenge_id: cid, user_id: user, path, file_name: `photo-${caption.split(' ')[0].toLowerCase()}.webp`, mime: 'image/webp', size: 412000, caption, ...extra });
};

if (phase0 !== 'vide') {
  const [s, e] = DATES[phase0];
  challenges.push(row({ id: CUR, title: 'La nuit en une image', answer_type: W0.type || 'image', max_entries: W0.max || 1, starts_at: at(s), ends_at: at(e),
    how_to: 'Une photo prise de nuit, par toi, cette semaine.\nPas de retouche lourde.', why: 'Pour voir la ville comme on ne la voit jamais.',
    reward_paillettes: 500, reward_text: 'un resto offert',
    closed_at: ['attente', 'termine', 'sans_gagnant'].includes(phase0) ? at(e + 2) : null, no_winner: phase0 === 'sans_gagnant' }));
  // Participations des autres membres (aucune avant le début).
  if (phase0 !== 'a_venir') {
    const autres = [[U(3), 'Le pont sous la pluie'], [U(4), 'Néons du quai'], [U(5), 'Lune sur le lac'], [U(6), 'Ma rue à 2 h']];
    for (const [u, c] of autres) entries.push(img(CUR, u, c));
  }
  const me = S.uid || ME;
  const nMine = W0.mine ?? (['vote', 'termine', 'cloture', 'attente'].includes(phase0) ? 1 : 0);
  for (let i = 0; i < nMine; i++) entries.push(img(CUR, me, i ? 'Deuxième essai' : 'Ma fenêtre la nuit'));
  // Voix : en vote, Chloé et David ont voté ; terminé : Chloé gagne (3 voix) ; attente : aucune voix.
  const by = (u) => entries.find((x) => x.user_id === u && x.challenge_id === CUR);
  if (phase0 === 'vote') {
    votes.push({ challenge_id: CUR, voter_id: U(4), entry_id: by(U(3)).id }, { challenge_id: CUR, voter_id: U(5), entry_id: by(U(4)).id });
    if (W0.voted) votes.push({ challenge_id: CUR, voter_id: me, entry_id: by(U(3)).id });
  }
  if (phase0 === 'termine') {
    votes.push({ challenge_id: CUR, voter_id: U(3), entry_id: by(U(4)).id }, { challenge_id: CUR, voter_id: U(5), entry_id: by(U(4)).id },
      { challenge_id: CUR, voter_id: U(6), entry_id: by(U(4)).id }, { challenge_id: CUR, voter_id: U(4), entry_id: by(U(3)).id });
    winners.push({ challenge_id: CUR, user_id: U(4), entry_id: by(U(4)).id, votes: 3, chosen_by_admin: false, credited_at: at(-3) });
  }
}
// Archives : deux challenges clos (un gagnant, un sans gagnant), un annulé.
if (W0.archives !== false) {
  const A1 = 'c0000000-0000-4000-8000-000000000002', A2 = 'c0000000-0000-4000-8000-000000000003', A3 = 'c0000000-0000-4000-8000-000000000004';
  challenges.push(row({ id: A1, title: 'Ton plat du dimanche', starts_at: at(-24), ends_at: at(-17), closed_at: at(-15), reward_paillettes: 300 }));
  challenges.push(row({ id: A2, title: 'Le mème du mois', starts_at: at(-31), ends_at: at(-24), closed_at: at(-22), no_winner: true, max_entries: 3, reward_paillettes: 200 }));
  challenges.push(row({ id: A3, title: 'Ta plus belle photo de vacances', starts_at: at(-38), ends_at: at(-31), cancelled_at: at(-37) }));
  const e1 = img(A1, U(4), 'Raclette maison'), e2 = img(A1, U(2), 'Tarte aux pommes');
  entries.push(e1, e2);
  votes.push({ challenge_id: A1, voter_id: U(2), entry_id: e1.id });
  winners.push({ challenge_id: A1, user_id: U(4), entry_id: e1.id, votes: 1, chosen_by_admin: false, credited_at: at(-15) });
}

const WCH = window.__WCH = { entries, votes, winners, files, notifs: [] };

/* ---------- Outils ---------- */
const DB = () => window.__DB;
const tab = () => DB().hg_weekly_challenges || (DB().hg_weekly_challenges = challenges);
/** Complète les lignes écrites par le panel (identifiant, date de fin du vote), comme la base et son trigger. */
function norm() {
  for (const c of tab()) {
    if (!c.id) c.id = nid();
    if (!c.created_at) c.created_at = new Date().toISOString();
    if (c.no_winner === undefined) c.no_winner = false;
    c.vote_ends_at = new Date(new Date(c.ends_at).getTime() + (Number(c.vote_days) || 2) * DAY).toISOString();
  }
}
const now = () => Date.now();
/** Même règle que hg_wch_phase. */
function phase(c) {
  if (c.cancelled_at) return 'annule';
  if (now() < new Date(c.starts_at)) return 'a_venir';
  if (now() < new Date(c.ends_at)) return 'participation';
  if (now() < new Date(c.vote_ends_at)) return 'vote';
  if (winners.some((w) => w.challenge_id === c.id)) return 'termine';
  if (c.no_winner) return 'sans_gagnant';
  if (c.closed_at) return 'attente';
  return 'cloture';
}
const prof = (u) => DB().hg_profiles.find((p) => p.id === u) || {};
const ofC = (cid) => entries.filter((e) => e.challenge_id === cid);
const nVotes = (eid) => votes.filter((v) => v.entry_id === eid).length;
const fileOf = (e) => ({ id: e.id, path: e.path, file_name: e.file_name, mime: e.mime, size: e.size, body: e.body, caption: e.caption });
/** Ordre mélangé propre au membre (comme md5(id || uid)). */
const melange = (list, me) => [...list].sort((a, b) => hash(a.id + me) - hash(b.id + me));
function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }

/** Faux bucket hg-challenges : envoi (avec délai éventuel), retrait, liens signés. */
function bucket() {
  return {
    upload: async (path, blob, opts = {}) => {
      window.__LOG.push(['wch-upload', path, blob?.size, opts.contentType]);
      if (W0.uploadDelay) await new Promise((r) => setTimeout(r, W0.uploadDelay));
      if (files[path]) return { data: null, error: { message: 'The resource already exists', statusCode: 409 } };
      files[path] = { size: blob?.size || 0, type: opts.contentType };
      return { data: { path }, error: null };
    },
    remove: async (paths) => { window.__LOG.push(['wch-remove', paths]); for (const p of paths) delete files[p]; return { data: [], error: null }; },
    createSignedUrls: async (paths = []) => ok(paths.map((p) => ({ path: p, signedUrl: files[p] ? IMG : null, error: files[p] ? null : 'not found' }))),
    createSignedUrl: async (p) => ok({ signedUrl: files[p] ? IMG : null }),
  };
}

export function createClient(...args) {
  const c = base.createClient(...args);
  if (!DB().hg_weekly_challenges) DB().hg_weekly_challenges = challenges; // table lue et écrite par le panel (from())
  const uid = () => S.uid || ME;
  const from = c.storage.from.bind(c.storage);
  c.storage.from = (b) => (b === 'hg-challenges' ? bucket() : from(b));
  const rpc = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (!fn.startsWith('hg_wch_')) return rpc(fn, a);
    window.__LOG.push(['rpc', fn, a]);
    norm();
    const me = uid();
    const isAdmin = !!prof(me).is_admin;
    switch (fn) {
      case 'hg_wch_page': {
        const list = tab().filter((c) => !c.cancelled_at).map((c) => ({ c, ph: phase(c) }));
        const cur = list.find((x) => ['participation', 'vote'].includes(x.ph))
          || list.filter((x) => x.ph === 'a_venir').sort((x, y) => new Date(x.c.starts_at) - new Date(y.c.starts_at))[0]
          || list.filter((x) => ['termine', 'sans_gagnant', 'attente', 'cloture'].includes(x.ph) && now() - new Date(x.c.vote_ends_at) < 3 * DAY)
            .sort((x, y) => new Date(y.c.vote_ends_at) - new Date(x.c.vote_ends_at))[0];
        let current = null;
        if (cur) {
          const { c: ch, ph } = cur;
          const es = ofC(ch.id);
          const mine = es.filter((e) => e.user_id === me);
          let out = [];
          if (ph === 'vote') out = melange(es, me).map((e) => ({ ...fileOf(e), is_mine: e.user_id === me }));
          else if (['termine', 'sans_gagnant', 'attente', 'cloture'].includes(ph)) {
            out = es.map((e) => ({ ...fileOf(e), is_mine: e.user_id === me, user_id: e.user_id, pseudo: prof(e.user_id).pseudo, avatar_url: null,
              votes: nVotes(e.id), winner: winners.some((w) => w.entry_id === e.id) })).sort((x, y) => y.votes - x.votes);
          }
          current = { id: ch.id, title: ch.title, how_to: ch.how_to, why: ch.why, answer_type: ch.answer_type, max_entries: ch.max_entries,
            starts_at: ch.starts_at, ends_at: ch.ends_at, vote_ends_at: ch.vote_ends_at, reward_paillettes: ch.reward_paillettes, reward_text: ch.reward_text,
            phase: ph, participants_count: new Set(es.map((e) => e.user_id)).size, entries_count: es.length,
            my_entries: mine.map((e) => ({ ...fileOf(e), created_at: e.created_at })),
            can_vote: ph === 'vote' && mine.length > 0,
            my_vote: votes.find((v) => v.challenge_id === ch.id && v.voter_id === me)?.entry_id || null,
            entries: out,
            winners: ph === 'termine' ? winners.filter((w) => w.challenge_id === ch.id).map((w) => ({ user_id: w.user_id, pseudo: prof(w.user_id).pseudo, avatar_url: null, entry_id: w.entry_id, votes: w.votes, chosen_by_admin: w.chosen_by_admin })) : [] };
        }
        const archives = list.filter((x) => ['termine', 'sans_gagnant'].includes(x.ph) && x.c.id !== current?.id)
          .sort((x, y) => new Date(y.c.vote_ends_at) - new Date(x.c.vote_ends_at)).slice(0, 12)
          .map(({ c: ch, ph }) => {
            const ws = winners.filter((w) => w.challenge_id === ch.id);
            return { id: ch.id, title: ch.title, answer_type: ch.answer_type, vote_ends_at: ch.vote_ends_at, reward_paillettes: ch.reward_paillettes, reward_text: ch.reward_text,
              participants_count: new Set(ofC(ch.id).map((e) => e.user_id)).size,
              outcome: ph === 'sans_gagnant' ? 'sans_gagnant' : ws.length > 1 ? 'ex_aequo' : 'gagnant', chosen_by_admin: ws.some((w) => w.chosen_by_admin),
              winners: ws.map((w) => ({ pseudo: prof(w.user_id).pseudo, votes: w.votes })) };
          });
        return ok({ current, archives });
      }
      case 'hg_wch_enter': {
        const ch = tab().find((x) => x.id === a.p_challenge);
        if (!ch || ch.cancelled_at) return ko('Challenge introuvable');
        if (phase(ch) !== 'participation') return ko('La participation est fermée');
        if (W0.fail) return ko('La participation est fermée');
        const n = ofC(ch.id).filter((e) => e.user_id === me).length;
        if (n >= ch.max_entries) return ko(`Tu as déjà ${n} participation(s) : c’est le maximum pour ce challenge`);
        if (ch.answer_type === 'texte') { if (a.p_path) return ko('Ce challenge attend un texte, pas un fichier'); if (!a.p_body) return ko('Écris ton texte'); }
        else {
          if (!a.p_path) return ko('Ajoute un fichier');
          if (!/^[0-9a-f-]{36}\/[A-Za-z0-9_-]{8,64}\.[a-z0-9]+$/.test(a.p_path) || !a.p_path.startsWith(`${ch.id}/`)) return ko('Fichier refusé');
          if (!files[a.p_path]) return ko('Fichier introuvable : envoie-le d’abord');
        }
        const e = entry({ challenge_id: ch.id, user_id: me, path: a.p_path, file_name: a.p_file_name, mime: a.p_mime, size: a.p_size, body: a.p_body, caption: a.p_caption, created_at: new Date().toISOString() });
        entries.push(e);
        return ok(e.id);
      }
      case 'hg_wch_withdraw': {
        const i = entries.findIndex((e) => e.id === a.p_entry && e.user_id === me);
        if (i < 0) return ko('Participation introuvable');
        const [e] = entries.splice(i, 1);
        return ok(e.path);
      }
      case 'hg_wch_vote': {
        const e = entries.find((x) => x.id === a.p_entry);
        if (!e) return ko('Participation introuvable');
        if (!ofC(e.challenge_id).some((x) => x.user_id === me)) return ko('Seuls les participants votent');
        if (e.user_id === me) return ko('Tu ne peux pas voter pour ta propre participation');
        const v = votes.find((x) => x.challenge_id === e.challenge_id && x.voter_id === me);
        if (v) v.entry_id = e.id; else votes.push({ challenge_id: e.challenge_id, voter_id: me, entry_id: e.id });
        return ok(null);
      }
      case 'hg_wch_mes_fichiers': return ok(entries.filter((e) => e.user_id === me && e.path).map((e) => e.path));
      default: break;
    }
    if (!isAdmin) return ko('Réservé à l’administrateur');
    switch (fn) {
      case 'hg_wch_admin_list':
        return ok([...tab()].sort((x, y) => new Date(y.starts_at) - new Date(x.starts_at)).map((ch) => {
          const es = ofC(ch.id);
          return { ...ch, phase: phase(ch), entries_count: es.length, participants_count: new Set(es.map((e) => e.user_id)).size,
            voters_count: new Set(votes.filter((v) => v.challenge_id === ch.id).map((v) => v.voter_id)).size,
            winners: winners.filter((w) => w.challenge_id === ch.id).map((w) => prof(w.user_id).pseudo) };
        }));
      case 'hg_wch_admin_detail': {
        const ch = tab().find((x) => x.id === a.p_challenge);
        if (!ch) return ko('Challenge introuvable');
        return ok({ challenge: { ...ch, phase: phase(ch) },
          entries: ofC(ch.id).map((e) => ({ ...fileOf(e), user_id: e.user_id, pseudo: prof(e.user_id).pseudo, created_at: e.created_at, votes: nVotes(e.id) })),
          voters_count: new Set(votes.filter((v) => v.challenge_id === ch.id).map((v) => v.voter_id)).size,
          winners: winners.filter((w) => w.challenge_id === ch.id).map((w) => ({ ...w, pseudo: prof(w.user_id).pseudo })) });
      }
      case 'hg_wch_admin_remove': {
        const motif = String(a.p_reason || '').trim();
        if (motif.length < 3) return ko('Indique le motif du retrait');
        const i = entries.findIndex((e) => e.id === a.p_entry);
        if (i < 0) return ko('Participation introuvable');
        const [e] = entries.splice(i, 1);
        for (let k = votes.length - 1; k >= 0; k--) if (votes[k].entry_id === e.id) votes.splice(k, 1);
        WCH.notifs.push({ user_id: e.user_id, motif });
        return ok(e.path);
      }
      case 'hg_wch_admin_pick': {
        const ch = tab().find((x) => x.id === a.p_challenge);
        if (!ch) return ko('Challenge introuvable');
        if (phase(ch) !== 'attente') return ko('Ce challenge n’attend pas de choix de l’admin');
        if (a.p_entry) {
          const e = ofC(ch.id).find((x) => x.id === a.p_entry);
          if (!e) return ko('Participation introuvable dans ce challenge');
          winners.push({ challenge_id: ch.id, user_id: e.user_id, entry_id: e.id, votes: 0, chosen_by_admin: true, credited_at: new Date().toISOString() });
        } else ch.no_winner = true;
        return ok(null);
      }
      case 'hg_wch_admin_orphelins': return ok(W0.orphelins || []);
      default: return ko(`RPC inconnue : ${fn}`);
    }
  };
  return c;
}
