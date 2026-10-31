// Faux client Supabase du parcours des fins de plateaux (parcours-fins-plateaux.cjs) : enveloppe fake-sb-fins.mjs et sert en plus
// les vrais contenus du jeu (window.__FIN.contenus), que les vraies tables lisent à l'ouverture, membre comme invité.
// Exporte createClient().
const racine = window.__HG_RACINE || ''; // préfixe du site servi (HG_PREFIX), injecté par le harnais
const base = await import(`${location.origin}${racine}/tests/fixtures/fake-sb-fins.mjs`);

const contenus = () => ({ data: window.__FIN?.contenus || {}, error: null });

/** Client : celui de fake-sb-fins.mjs, avec les contenus du jeu. */
export function createClient(...args) {
  const c = base.createClient(...args);
  const rpc0 = c.rpc.bind(c);
  c.rpc = async (fn, a = {}) => {
    if (fn === 'hg_plat_contenus' || (fn === 'hg_plat_invite' && a.p_action === 'contenus')) return contenus();
    return rpc0(fn, a);
  };
  return c;
}
