// Faux client Supabase du parcours des écrans communs (parcours-duels-socle.cjs) : enveloppe fake-sb.mjs et répond à hg_duel_etat
// et hg_plat_etat avec window.__FIN.etat, que le test remplace à volonté. Les règles ne sont pas rejouées : le test écrit l'état
// que le serveur renverrait (forme de hg_duel_etat, migrations 122 et 141, et de hg_plat_etat, migration 125).
// window.__FIN.pousser(etat) remplace l'état et déclenche une relecture, comme un signal temps réel.
// hg_plat_agir répond après window.__FIN.delai ms et compte ses appels dans window.__FIN.agir (action en vol quand la partie finit).
// Exporte createClient().
const racine = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${racine}/tests/fixtures/fake-sb.mjs`);

const ok = (data) => ({ data, error: null });
window.__FIN = window.__FIN || { etat: null };
window.__FIN.agir = 0;
window.__FIN.pousser = (e) => { window.__FIN.etat = e; document.dispatchEvent(new Event('visibilitychange')); };

const HANDLERS = {
  hg_duel_etat: () => ok(window.__FIN.etat),
  hg_duel_messages: () => ok([]),
  hg_duel_avancer: () => ok(null),
  hg_duel_possibles: () => ok([]),
  hg_plat_etat: () => ok(window.__FIN.etat),
  hg_plat_messages: () => ok([]),
  hg_plat_contenus: () => ok({}),
  hg_plat_avancer: () => ok(null),
  hg_plat_agir: async () => { window.__FIN.agir += 1; await new Promise((r) => { setTimeout(r, window.__FIN.delai || 0); }); return ok({ ok: true }); },
  hg_duel_invite: invite,
  hg_plat_invite: invite,
};

/** Appels d'un invité (une seule fonction serveur, l'action en argument). */
function invite(a) {
  if (a.p_action === 'etat') return ok(window.__FIN.etat);
  return ok(a.p_action === 'messages' ? [] : null);
}

/** Client : celui du faux de base, avec ces RPC en plus. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => (HANDLERS[fn] ? HANDLERS[fn](a) : rpc0(fn, a));
  return c;
}
