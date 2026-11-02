// Contrôle sans réseau de l'envoi « c'est ton tour » (supabase/functions/_shared/ton-tour.ts, idée 2 du lot 3) : validation de l'appel,
// choix du canal (push, sinon MP), repli sur le MP, préférences et heures calmes, texte du MP, lien accepté par sw.js,
// écran où mène le lien écrit par la migration 200 (le vrai route() de uno.js et plateaux.js).
// Le push et le MP sont des faux qui notent les appels : rien ne part.
// Lancer : node --experimental-strip-types tests/unitaires/check-ton-tour.mjs
import fs from 'node:fs';
import { lireTonTour, texteMP, pushPret, envoyerTonTour } from '../../supabase/functions/_shared/ton-tour.ts';

let ko = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) ko++; };

const U = 'aaaaaaaa-0000-4000-8000-000000000001';
const base = { type: 'ton_tour', user_id: U, titre: 'À toi de jouer : Échecs contre Léo', suite: 'Encore 2 tours manqués et c’est le forfait.',
  lien: '/pages/jeux/duels.html#partie/HGEC-1234', tag: `hg-tour-${U}` };
const T = lireTonTour(base);
check(!!T, 'appel valide accepté');
check(!lireTonTour({ ...base, type: 'autre' }), 'autre type refusé');
check(!lireTonTour({ ...base, user_id: 'x' }), 'membre invalide refusé');
check(!lireTonTour({ ...base, lien: 'https://exemple.test/piege' }), 'lien externe refusé');
check(!lireTonTour({ ...base, lien: '/pages/compte/compte.html' }), 'lien hors parties refusé');
check(!!lireTonTour({ ...base, lien: '/pages/jeux/uno.html#partie/HGUNO-1234' }), 'lien Uno accepté');
check(!!lireTonTour({ ...base, lien: '/pages/jeux/shadow-hunters.html#partie/HGSHH-1234' }), 'lien de plateau accepté');

const mp = texteMP(T, 'https://site.test');
check(mp === 'À toi de jouer : Échecs contre Léo. Encore 2 tours manqués et c’est le forfait.\nhttps://site.test/pages/jeux/duels.html#partie/HGEC-1234', 'texte du MP : ' + mp);
check(texteMP({ ...T, titre: 'À toi de jouer : [piège](https://x.test) *gras*' }, '').includes('\\[piège\\]\\(https://x.test\\) \\*gras\\*'), 'Markdown neutralisé dans le titre');

/** Faux client : tables hg_notif_prefs, hg_push_subscriptions et hg_profiles. */
const faux = ({ prefs = [], subs = [], profil = { discord_id: '123456789012345678', bot_optin: true } }) => ({
  from: (t) => ({ select: () => ({
    in: async () => ({ data: t === 'hg_notif_prefs' ? prefs : [], error: null }),
    eq: () => (t === 'hg_push_subscriptions' ? Promise.resolve({ data: subs, error: null }) : { maybeSingle: async () => ({ data: profil, error: null }) }),
  }) }),
});
const lance = async (opts, sent = 1) => {
  const push = [], dm = [];
  const r = await envoyerTonTour(T, { db: faux(opts), site: 'https://site.test',
    push: async (s, p) => { push.push(JSON.parse(p)); return { sent, failed: sent ? 0 : s.length, removed: 0 }; },
    dm: async (id, m) => { dm.push([id, m]); } });
  return { r, push, dm };
};
const SUB = [{ id: 1, endpoint: 'https://push.test/1', p256dh: 'a', auth: 'b' }];
const PREF = (prefs, q = {}) => [{ user_id: U, prefs, ...q }];

let x = await lance({ subs: SUB });
check(x.r.canal === 'push' && x.push.length === 1 && !x.dm.length, 'appareil : push seul');
check(x.push[0].title === 'Humane Gang' && x.push[0].body === T.titre && x.push[0].lien === T.lien && x.push[0].tag === T.tag, 'charge du push : texte de la maquette, lien, tag');
check(!('conversation_id' in x.push[0]), 'pas de conversation dans la charge');
x = await lance({});
check(x.r.canal === 'discord' && !x.push.length && x.dm.length === 1, 'sans appareil : MP');
check(x.dm[0][0] === '123456789012345678' && x.dm[0][1].allowed_mentions.parse.length === 0 && /Encore 2 tours/.test(x.dm[0][1].content), 'contenu du MP, sans mention');
x = await lance({ subs: SUB }, 0);
check(x.r.canal === 'discord' && x.push.length === 1 && x.dm.length === 1, 'push arrivé sur aucun appareil : MP');
x = await lance({ subs: SUB, prefs: PREF({ 'tours.push': false }) });
check(x.r.canal === 'discord' && !x.push.length, 'push coupé : MP');
x = await lance({ subs: SUB, prefs: PREF({ 'tours.push': false, 'tours.discord': false }) });
check(x.r.canal === null && !x.push.length && !x.dm.length, 'deux canaux coupés : rien');
x = await lance({ profil: { discord_id: '123456789012345678', bot_optin: false } });
check(x.r.canal === null && !x.dm.length, 'bot refusé : pas de MP');
x = await lance({ profil: { discord_id: null, bot_optin: true } });
check(x.r.canal === null && !x.dm.length, 'sans identifiant Discord : pas de MP');
// Créneau [h, h + 1[ qui contient l'heure du test.
const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', hour: '2-digit', hourCycle: 'h23' }).format(new Date())) % 24;
x = await lance({ subs: SUB, prefs: PREF({}, { quiet_start: h, quiet_end: (h + 1) % 24 }) });
check(x.r.canal === null && !x.push.length && !x.dm.length, 'heures calmes : ni push ni MP');

const sw = fs.readFileSync(new URL('../../site/sw.js', import.meta.url), 'utf8');
const re = sw.match(/new URL\((\/.*?\/)\.test\(lien/);
check(!!re, 'sw.js : contrôle du lien présent');
const motif = new RegExp(re[1].slice(1, -1));
check(motif.test(T.lien) && motif.test('/pages/jeux/uno.html#partie/HGUNO-1234'), 'sw.js accepte les liens de partie');
check(!motif.test('https://exemple.test/') && !motif.test('//exemple.test/pages/jeux/a.html?x') && !motif.test(''), 'sw.js refuse un lien externe');
check(/lien: data\.lien/.test(sw), 'sw.js garde le lien de la charge');

// Destination : les liens de la migration 200, passés au vrai route() de la page. « ?code= » y mène à l'écran Rejoindre, qui refuse une partie commencée.
const lire = (f) => fs.readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const sql = lire('supabase/migrations/200_notif_ton_tour.sql');
const LIENS = [...sql.matchAll(/v_lien := '(\/pages\/jeux\/[^']*)'(?: \|\| v_lien \|\| '([^']*)')? \|\| v_code;/g)].map((m) => (m[2] === undefined ? m[1] : `${m[1]}catan${m[2]}`));
check(LIENS.length === 3, `migration 200 : 3 liens de partie (${LIENS.length})`);
const routeDe = (f) => new Function('location', 'history', lire(f).match(/function route\(\) \{([\s\S]*?)\n\}/)[1]);
const vers = (f, lien) => {
  const u = new URL(lien, 'https://site.test');
  const location = { pathname: u.pathname, search: u.search, hash: u.hash };
  return routeDe(f)(location, { replaceState: (_, __, a) => { location.hash = new URL(a, 'https://site.test').hash; } });
};
for (const l of LIENS.filter((x) => !x.includes('duels'))) {
  const r = vers(l.includes('uno') ? 'site/assets/espaces/uno/uno.js' : 'site/assets/espaces/plateaux/plateaux.js', `${l}HGXXX-1234`);
  check(r.nom === 'partie' && r.arg === 'HGXXX-1234', `${l} mène à la partie (${r.nom})`);
  check(!!lireTonTour({ ...base, lien: `${l}HGXXX-1234` }), `${l} accepté par hg-push`);
  check(motif.test(`${l}HGXXX-1234`), `${l} accepté par sw.js`);
}

// Clé VAPID mal formée : pas de signature, le MP prend le relais.
check(await pushPret(async () => ({ a: 1 }), () => { throw new Error('clé mal formée'); }) === false, 'clé VAPID mal formée : pas de push, pas d\'erreur');
check(await pushPret(async () => null, () => true) === false && await pushPret(async () => ({ a: 1 }), () => true) === true, 'clés absentes ou bonnes');
const hgPush = lire('supabase/functions/hg-push/index.ts');
check(/await pushPret\(vapidKeys, preparerVapid\)/.test(hgPush) && !/!!keys && preparerVapid/.test(hgPush), 'hg-push passe par pushPret pour « c\'est ton tour »');

console.log(ko ? `\n${ko} échec(s)` : '\nTout est bon.');
process.exit(ko ? 1 : 0);
