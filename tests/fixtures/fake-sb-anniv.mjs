// Faux client Supabase pour la carte d'anniversaire commune (idée 52, migration 205).
// Enveloppe tests/fixtures/fake-sb.mjs : les RPC hg_carte_anniv* sont simulées ici avec les règles de la migration (jour de Zurich,
// surprise jusqu'au jour J, 15 à 280 caractères, signature jusqu'à 23 h 59 le jour J), le reste part vers le faux client commun.
// Scénario : bdays ({ id: 'JJ.MM' } : dates partagées, renvoyées par hg_members), cartes ([{ id, fete_id, jour, mots: [{ auteur_id,
// texte }] }]), annivKo (hg_carte_anniv_ouvertes en erreur), refus (ids qui refusent la carte). État dans window.__ANV.
const base = await import(`${location.origin}${window.__HG_RACINE || ''}/tests/fixtures/fake-sb.mjs`);
const S = window.__SCN || {};
const ME = '11111111-1111-4111-8111-111111111111';
const ok = (data) => ({ data, error: null });
const ko = (message) => ({ data: null, error: { message, code: 'P0001' } });
const ANV = window.__ANV = { cartes: (S.cartes || []).map((c) => ({ ...c, mots: (c.mots || []).map((m, i) => ({ created_at: new Date(Date.now() - (10 - i) * 6e4).toISOString(), ...m })) })) };
/** Date du jour à Zurich (« AAAA-MM-JJ »). */
const auj = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** Ajoute n jours à « AAAA-MM-JJ ». */
const plus = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

export function createClient() {
  const c = base.createClient();
  const DB = window.__DB;
  DB.hg_profiles.forEach((p) => { if (!('carte_anniv' in p)) p.carte_anniv = !(S.refus || []).includes(p.id); }); // colonne de la migration 205
  const rpc = c.rpc.bind(c);
  const uid = () => S.uid || ME;
  const prof = (u) => DB.hg_profiles.find((p) => p.id === u);
  const valide = (k) => !!(S.bdays || {})[k.fete_id] && !(S.refus || []).includes(k.fete_id);
  const monMot = (k) => k.mots.find((m) => m.auteur_id === uid())?.texte ?? null;
  c.rpc = async (fn, a = {}) => {
    if (fn === 'hg_members') {
      const r = await rpc(fn, a);
      (r.data || []).forEach((m) => { if ((S.bdays || {})[m.id]) m.birthday_dm = S.bdays[m.id]; });
      return r;
    }
    if (fn === 'hg_carte_anniv_ouvertes') {
      if (S.annivKo) return ko('Failed to fetch');
      const j = auj(), me = uid();
      const cartes = ANV.cartes.filter((k) => k.fete_id !== me && k.jour >= j && k.jour <= plus(j, 3) && valide(k))
        .map((k) => ({ id: k.id, fete_id: k.fete_id, jour: k.jour, mots: k.mots.length, mon_mot: monMot(k) }));
      const mienne = ANV.cartes.find((k) => k.fete_id === me && k.jour === j && valide(k) && k.mots.length >= 2);
      return ok({ cartes, ma_carte: mienne ? { id: mienne.id, jour: mienne.jour, mots: mienne.mots.length } : null });
    }
    if (fn === 'hg_carte_anniv') {
      const k = ANV.cartes.find((x) => String(x.id) === String(a.p_carte)), me = uid(), j = auj();
      if (!k) return ko('Carte introuvable.');
      const ouverte = k.fete_id !== me && k.jour >= j && valide(k);
      if (k.fete_id === me) { if (k.jour > j) return ko('Surprise : ta carte se découvre le jour de ton anniversaire.'); }
      else if (!monMot(k) && !ouverte) return ko('Carte introuvable.');
      const p = prof(k.fete_id);
      return ok({ id: k.id, jour: k.jour, a_moi: k.fete_id === me, ouverte, fete: { id: k.fete_id, pseudo: p?.pseudo }, mon_mot: monMot(k),
        mots: k.mots.map((m) => ({ auteur_id: m.auteur_id, pseudo: prof(m.auteur_id)?.pseudo || 'Ancien membre', avatar_url: null, color: prof(m.auteur_id)?.color, texte: m.texte, a_moi: m.auteur_id === me })) });
    }
    if (fn === 'hg_carte_anniv_signer') {
      const k = ANV.cartes.find((x) => String(x.id) === String(a.p_carte)), me = uid(), txt = String(a.p_texte || '').trim();
      if (!k || !valide(k)) return ko('Carte introuvable.');
      if (k.fete_id === me) return ko('Tu ne peux pas signer ta propre carte.');
      if (k.jour < auj()) return ko('La carte est fermée : on pouvait la signer jusqu’à minuit le jour J.');
      if (txt.length < 15) return ko('Écris au moins 15 caractères : un vrai mot fera plus plaisir qu’un « joyeux anniv ».');
      if (txt.length > 280) return ko('Ton mot fait au plus 280 caractères.');
      const m = k.mots.find((x) => x.auteur_id === me);
      if (m) m.texte = txt; else k.mots.push({ auteur_id: me, texte: txt, created_at: new Date().toISOString() });
      return ok({ mots: k.mots.length, mon_mot: txt });
    }
    if (fn === 'hg_carte_anniv_souvenirs') {
      const me = uid(), j = auj();
      return ok(ANV.cartes.filter((k) => (k.fete_id === me && k.jour <= j && k.mots.length) || k.mots.some((m) => m.auteur_id === me))
        .sort((x, y) => y.jour.localeCompare(x.jour))
        .map((k) => ({ id: k.id, jour: k.jour, fete_id: k.fete_id, pseudo: prof(k.fete_id)?.pseudo, a_moi: k.fete_id === me, mots: k.mots.length })));
    }
    return rpc(fn, a);
  };
  return c;
}
