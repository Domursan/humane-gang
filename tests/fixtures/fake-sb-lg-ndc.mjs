// Faux client Supabase du parcours des fins du Loup-Garou et de Nom de code (parcours-lg-ndc-fins.cjs) : enveloppe fake-sb.mjs et répond à
// hg_lg_etat et hg_ndc_etat avec window.__FIN.etat, que le test remplace à volonté. Les règles ne sont pas rejouées : le test écrit l'état
// que le serveur renverrait (formes de hg_lg_etat, migration 119, et de hg_ndc_etat, migration 123).
// window.__FIN.pousser(etat) remplace l'état et déclenche une relecture, comme un signal temps réel.
// Exporte createClient().
const racine = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${racine}/tests/fixtures/fake-sb.mjs`);

const ok = (data) => ({ data, error: null });
window.__FIN = window.__FIN || { etat: null };
window.__FIN.pousser = (e) => { window.__FIN.etat = e; document.dispatchEvent(new Event('visibilitychange')); };

/** Appels d'un invité (une seule fonction serveur, l'action en argument). */
function invite(a) {
  if (a.p_action === 'etat') return ok(window.__FIN.etat);
  return ok(a.p_action === 'messages' ? [] : null);
}

const HANDLERS = {
  hg_lg_etat: () => ok(window.__FIN.etat),
  hg_lg_avancer: () => ok(null),
  hg_lg_invite: invite,
  hg_ndc_etat: () => ok(window.__FIN.etat),
  hg_ndc_messages: () => ok([]),
  hg_ndc_invite: invite,
};

/** Client : celui du faux de base, avec ces RPC en plus ; le chat du Loup-Garou lit sa table directement. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => (HANDLERS[fn] ? HANDLERS[fn](a) : rpc0(fn, a));
  return c;
}
