// Faux client du parcours des fins de duels spéciaux (parcours-duels-speciaux.cjs) : fake-sb-fins.mjs, plus le plateau de Qui est-ce ?
// (hg_duel_plateau), rendu après window.__FIN.delaiPlateau ms pour imiter le chargement des portraits de l'écran de fin.
// Exporte createClient().
const racine = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${racine}/tests/fixtures/fake-sb-fins.mjs`);

/** Client : celui de fake-sb-fins, avec le plateau en plus. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (fn !== 'hg_duel_plateau') return rpc0(fn, a);
    await new Promise((ok) => { setTimeout(ok, window.__FIN.delaiPlateau || 0); });
    return { data: window.__FIN.plateau, error: null };
  };
  return c;
}
