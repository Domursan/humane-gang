// Changer de compte (core/comptes-etat.js), sans navigateur : node tests/unitaires/check-comptes-garde.mjs
// - fetchGarde : rien ne part d'un onglet figé, ni une requête signée par un autre compte que celui de la page (le jeton ne
//   paraît jamais dans l'erreur) ; la clé publique et le compte de la page passent.
// - Comptes de l'appareil : 2 au plus, ni e-mail ni mot de passe gardés, clé effacée quand il ne reste qu'un compte.
// - Clés locales des jeux par compte : anciennes clés rangées au compte d'alors, jamais lues par l'autre compte.
let ok = 0, ko = 0;
const check = (c, m) => { if (c) { ok++; console.log('OK     ' + m); } else { ko++; console.log('ECHEC  ' + m); } };

// Stockage et fetch simulés (le module n'en lit pas d'autres)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
const partis = [];
globalThis.fetch = async (url) => { partis.push(String(url)); return { ok: true }; };
const E = await import('../../site/assets/commun/core/comptes-etat.js');

const A = '11111111-1111-4111-8111-111111111111', B = '00000002-0000-4000-8000-000000000002';
/** Jeton factice au format JWT (en-tête.charge.signature), charge { sub }. */
const jwt = (sub) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(sub ? { sub, role: 'authenticated' } : { role: 'anon' })).toString('base64url')}.signature-factice`;
const req = (tok) => ({ headers: { Authorization: `Bearer ${tok}`, apikey: 'cle' } });
const essai = async (tok) => { try { await E.fetchGarde('https://x.supabase.co/rest/v1/rpc/f', req(tok)); return 'parti'; } catch (e) { return e.message; } };

// 1. Sujet d'un jeton
check(E.sujetJeton(jwt(A)) === A && E.sujetJeton(jwt(null)) === null && E.sujetJeton('pas-un-jeton') === null, 'sujetJeton : identifiant du jeton, rien pour la clé publique ou un texte illisible');

// 2. Garde : compte de la page fixé
let change = null;
E.surChangementCompte((uid) => { change = uid; });
E.fixerComptePage(A);
check(await essai(jwt(A)) === 'parti', 'requête du compte de la page : part');
check(await essai(jwt(null)) === 'parti', 'requête avec la clé publique (renouvellement, connexion) : part');
const n = partis.length;
const msg = await essai(jwt(B));
check(msg !== 'parti' && partis.length === n, 'requête signée par un autre compte : bloquée avant de partir');
check(!msg.includes('signature-factice') && !msg.includes('eyJ'), `l'erreur ne contient aucun jeton (« ${msg} »)`);
check(change === B && E.estFige(), 'autre compte détecté : la page se fige et la boîte est demandée une fois');
check(await essai(jwt(A)) !== 'parti' && partis.length === n, 'page figée : plus rien ne part, même avec son propre compte');
E.debutBascule();
check(!E.estFige() && await essai(jwt(A)) === 'parti', 'retour au compte de la page (bascule demandée ici) : les requêtes repartent');
change = null;
check(await essai(jwt(B)) !== 'parti' && change === null, 'pendant une bascule demandée ici : l\'autre compte reste bloqué, sans boîte');
E.finBascule();

// 3. Comptes de l'appareil
E.ecrireComptes({ actif: { id: A, pseudo: 'Ethan', color: '#B70127', role: 'Admin', email: 'x@y.z', password: 'secret' },
  autres: [{ id: B, pseudo: 'Kiwi', color: '#159946', role: 'Membre', rt: 'rt-factice', email: 'k@y.z' }, { id: '00000003-0000-4000-8000-000000000003', pseudo: 'Trois', rt: 'r3' }] });
const brut = localStorage.getItem(E.CLE_COMPTES) || '';
const st = E.lireComptes();
check(st?.actif?.id === A && st.autres.length === 1 && st.autres[0].rt === 'rt-factice', '2 comptes au plus : un actif, un en attente avec son jeton');
check(!/@|secret|password|email/.test(brut), 'ni e-mail ni mot de passe gardés sur l\'appareil');
E.ecrireComptes({ ...st, autres: [] });
check(localStorage.getItem(E.CLE_COMPTES) === null, 'plus qu\'un compte : rien n\'est gardé');

// 4. Clés locales des jeux par compte
mem.clear();
localStorage.setItem('hg_2048_meilleur', '512');
localStorage.setItem('hg-anagramme:2026-11-02', '{"0":"trouve"}');
E.fixerComptePage(A);
check(E.lireLocal('hg_2048_meilleur') === '512', 'appareil à un seul compte : l\'ancienne clé sans compte sert encore');
E.migrerClesLocales(A);
E.ecrireComptes({ actif: { id: B, pseudo: 'Kiwi' }, autres: [{ id: A, pseudo: 'Ethan', rt: 'rt' }] });
check(localStorage.getItem('hg_2048_meilleur') === null && localStorage.getItem(`hg_2048_meilleur@${A}`) === '512', 'second compte ajouté : anciennes clés rangées au compte d\'alors');
E.fixerComptePage(B);
check(E.lireLocal('hg_2048_meilleur') === null && E.lireLocal('hg-anagramme:2026-11-02') === null, 'l\'autre compte ne voit ni le record ni les mots révélés');
E.ecrireLocal('hg_2048_meilleur', '64');
E.fixerComptePage(A);
check(E.lireLocal('hg_2048_meilleur') === '512' && E.lireLocal('hg-anagramme:2026-11-02') === '{"0":"trouve"}', 'retour au premier compte : ses valeurs sont intactes');

console.log(`\n${ok} OK, ${ko} ECHEC(S)`);
process.exitCode = ko ? 1 : 0;
