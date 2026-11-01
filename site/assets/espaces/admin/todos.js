// Admin : éléments « À faire » des 7 lieux (registerTodo, admin/lieux.js). Un fournisseur par source, tous dans ce fichier.
// Règles communes :
//   - un élément n'existe que si une action d'admin est attendue (pas de simple information) ;
//   - droit vérifié comme le reste du panel (canSub, admin/perms.js) avant toute requête ;
//   - une requête qui échoue = aucun élément de cette source + console.warn, jamais d'exception vers la page ;
//   - seules les RPC et tables déjà appelées par les modules admin sont lues (admin-*.js, admin/*.js) ;
//   - le nombre d'éléments d'un lieu est sa pastille du plateau (lieux.js, todoCount).
// Fenêtres de temps : demande d'échange « en attente » après 3 jours ; enchère « bientôt » dans les 24 h ;
// Framed, Heardle : 3 prochains jours ; Sutom : 7 prochains jours.
// Pages sans source d'action retenue (Membres IRL, Secrets, Arcade…) : aucun élément, voir le compte rendu de l'ajout.
// Dépend de core.js (sb), admin/state.js (S : demandes, idées, éditions), admin/perms.js, admin/lieux.js, admin/eco-health.js.
import { sb } from '../../commun/core.js';
import { S } from './state.js';
import { LIEUX, canSub } from './perms.js';
import { registerTodo } from './lieux.js';
import { ecoTodoItems } from './eco-health.js';

const DAY = 864e5;
const fmtFin = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Zurich' });

/** Sous-section du panel par identifiant, puis son droit (canSub). */
const allowed = (id) => { const s = LIEUX.flatMap((l) => l.subs).find((x) => x.id === id); return !!s && canSub(s); };

/** Lit une requête Supabase : les données, ou null (erreur signalée dans la console, sans exception). */
async function read(lieu, pending) {
  try {
    const { data, error } = await pending;
    if (error) throw error;
    return data ?? null;
  } catch (e) { console.warn('[à faire]', lieu, e?.message || e); return null; }
}

/** « n mot » ou « n mots » (pluriel français). */
const nombre = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/** Jour « AAAA-MM-JJ » décalé de n jours (calcul en UTC, sans heure). */
function ajouterJours(jour, n) {
  const t = new Date(`${jour}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/**
 * Jours sans manche/mot programmé parmi les `n` prochains jours (à partir de `aujourdhui`).
 * @param {string} aujourdhui « AAAA-MM-JJ » (donné par la base pour chaque jeu)
 * @param {Set<string>} programmes Jours déjà couverts
 * @param {number} n Taille de la fenêtre
 */
const joursLibres = (aujourdhui, programmes, n) => {
  let libres = 0;
  for (let i = 0; i < n; i++) if (!programmes.has(ajouterJours(aujourdhui, i))) libres++;
  return libres;
};

/* ---------- Poste : demandes d'assistance et boîte à idées ---------- */

// Chaque demande ouverte (assistance) : une ligne, avec « Répondre ».
registerTodo('poste', async () => {
  if (!allowed('assistance')) return [];
  return (S.support || []).filter((s) => s.status === 'ouverte').map((s) => ({
    title: s.subject || 'Demande sans titre',
    meta: 'Demande à traiter dans l’assistance',
    actions: [{ label: 'Répondre', href: `#poste/assistance/${s.id}` }],
  }));
});

// Idées nouvelles (boîte à idées) : une seule ligne, avec le nombre.
registerTodo('poste', async () => {
  if (!allowed('idees')) return [];
  const n = (S.ideas || []).filter((i) => i.status === 'nouvelle').length;
  return n ? [{ title: nombre(n, 'nouvelle idée à relire', 'nouvelles idées à relire'), meta: 'Boîte à idées : lire, trier ou répondre',
    actions: [{ label: 'Ouvrir la boîte à idées', href: '#poste/idees' }] }] : [];
});

/* ---------- Ventes : enchères et échanges entre membres ---------- */

// Enchères ouvertes qui se terminent dans les 24 h : une ligne chacune (clôturer ou prolonger).
registerTodo('ventes', async () => {
  if (!allowed('encheres')) return [];
  const liste = await read('ventes', sb.rpc('hg_auctions_admin'));
  const maintenant = Date.now();
  return (Array.isArray(liste) ? liste : [])
    .filter((a) => a.status === 'ouverte' && a.ends_at && new Date(a.ends_at) > maintenant && new Date(a.ends_at) - maintenant <= DAY)
    .map((a) => ({
      title: `Enchère « ${a.card_name} » : fin ${fmtFin.format(new Date(a.ends_at))}`,
      meta: 'Se termine dans moins de 24 h : à clôturer ou à prolonger',
      actions: [{ label: 'Ouvrir les enchères', href: '#ventes/encheres' }],
    }));
});

// Échanges proposés depuis plus de 3 jours sans réponse : une ligne chacun (à surveiller, annulable).
registerTodo('ventes', async () => {
  if (!allowed('echanges')) return [];
  const lignes = await read('ventes', sb.from('hg_card_trades').select('id, created_at').eq('status', 'proposee'));
  return (lignes || []).filter((t) => Date.now() - new Date(t.created_at) > 3 * DAY).map((t) => {
    const jours = Math.floor((Date.now() - new Date(t.created_at)) / DAY);
    return {
      title: `Échange entre membres proposé depuis ${nombre(jours, 'jour', 'jours')}`,
      meta: 'Sans réponse : à surveiller, à annuler si besoin',
      actions: [{ label: 'Ouvrir les échanges', href: '#ventes/echanges' }],
    };
  });
});

/* ---------- Fabrique de cartes : économie et propositions ---------- */

// Alertes économie (rouges, non suspendues) : une ligne par alerte, avec le réglage et « Ignorer cette semaine ».
registerTodo('fabrique', async () => ecoTodoItems());

// Propositions de cartes des membres en attente : une seule ligne, dans les séries.
registerTodo('fabrique', async () => {
  if (!allowed('series')) return [];
  const lignes = await read('fabrique', sb.from('hg_card_proposals').select('id').eq('status', 'en_attente'));
  const n = (lignes || []).length;
  return n ? [{ title: nombre(n, 'proposition de carte à relire', 'propositions de cartes à relire'), meta: 'Propositions des membres pour les séries',
    actions: [{ label: 'Ouvrir les séries', href: '#fabrique/series' }] }] : [];
});

/* ---------- Place : relances ---------- */

// Membres à relancer (même liste que la page À relancer, 30 jours par défaut) : une seule ligne.
registerTodo('place', async () => {
  if (!allowed('relance')) return [];
  const d = await read('place', sb.rpc('hg_admin_to_remind', { p_days: 30 }));
  const n = d?.todo?.length || 0;
  return n ? [{ title: nombre(n, 'membre à relancer', 'membres à relancer'), meta: 'Inactifs depuis un moment : un message à leur envoyer',
    actions: [{ label: 'Ouvrir À relancer', href: '#place/relance' }] }] : [];
});

/* ---------- Camp IRL : sorties et Secret Santa ---------- */

// Sorties sans date (hors historique) : une ligne chacune, à fixer.
registerTodo('camp', async () => {
  if (!allowed('sorties')) return [];
  const lignes = await read('camp', sb.from('hg_events').select('id, title, retro').is('starts_at', null));
  return (lignes || []).filter((e) => !e.retro).map((e) => ({
    title: e.title || 'Sortie sans titre',
    meta: 'Pas encore de date : à fixer',
    actions: [{ label: 'Ouvrir les sorties', href: '#camp/sorties' }],
  }));
});

// Secret Santa : tirage à lancer (édition en cours au statut « tirage »).
registerTodo('camp', async () => {
  if (!allowed('secret-santa')) return [];
  const ed = S.editions?.[0];
  return ed?.status === 'tirage' ? [{ title: `Le tirage du Secret Santa ${ed.year} est à lancer`, meta: 'Tirage à faire dans la section Secret Santa',
    actions: [{ label: 'Ouvrir le Secret Santa', href: '#camp/secret-santa' }] }] : [];
});

/* ---------- Fête foraine : preuves, Sutom, Framed, Heardle ---------- */

// Preuves de quêtes en attente de validation : une seule ligne, avec le nombre.
registerTodo('fete', async () => {
  if (!allowed('preuves')) return [];
  const d = await read('fete', sb.rpc('hg_proof_queue', { p_status: 'en_attente' }));
  const n = d?.counts?.en_attente ?? d?.items?.length ?? 0;
  return n ? [{ title: nombre(n, 'preuve de quête à valider', 'preuves de quêtes à valider'), meta: 'Preuves envoyées par les membres',
    actions: [{ label: 'Ouvrir les preuves', href: '#fete/preuves' }] }] : [];
});

// Sutom : mots programmés sur les 7 prochains jours (sans mot, un mot est tiré automatiquement).
registerTodo('fete', async () => {
  if (!allowed('sutom')) return [];
  const d = await read('fete', sb.rpc('hg_sutom_admin'));
  if (!d?.today) return [];
  const programmes = new Set((d.planned || []).map((p) => p.day));
  const libres = joursLibres(d.today, programmes, 7);
  return libres ? [{ title: `Sutom : ${nombre(libres, 'jour sans mot programmé', 'jours sans mot programmé')} sur les 7 prochains`,
    meta: 'Sans mot programmé, un mot de la banque est tiré automatiquement',
    actions: [{ label: 'Programmer un mot', href: '#fete/sutom' }] }] : [];
});

// Framed et Heardle : manches non programmées sur les 3 prochains jours (une ligne par jeu).
const manchesLibres = (nom, d, valide, meta = 'Une manche se programme dans la page Framed et Heardle') => {
  if (!d?.today) return [];
  const programmes = new Set((d.rounds || []).filter(valide).map((r) => r.day));
  const libres = joursLibres(d.today, programmes, 3);
  return libres ? [{ title: `${nom} : ${nombre(libres, 'jour sans manche', 'jours sans manche')} sur les 3 prochains`,
    meta,
    actions: [{ label: `Ouvrir ${nom}`, href: '#fete/framed-heardle' }] }] : [];
};
registerTodo('fete', async () => {
  if (!allowed('framed-heardle')) return [];
  return manchesLibres('Framed', await read('fete', sb.rpc('hg_framed_admin')), () => true, 'Sans manche programmée, un film de la réserve est tiré automatiquement');
});
registerTodo('fete', async () => {
  if (!allowed('framed-heardle')) return [];
  return manchesLibres('Heardle', await read('fete', sb.rpc('hg_heardle_admin')), (r) => !r.cancelled);
});

/* ---------- Mairie : erreurs du site ---------- */

// Erreurs du site au statut « nouvelle » : une seule ligne, avec le nombre.
registerTodo('mairie', async () => {
  if (!allowed('erreurs')) return [];
  const lignes = await read('mairie', sb.from('hg_client_errors').select('id').eq('status', 'nouvelle'));
  const n = (lignes || []).length;
  return n ? [{ title: nombre(n, 'erreur nouvelle du site', 'erreurs nouvelles du site'), meta: 'Erreurs remontées par les navigateurs : à regarder',
    actions: [{ label: 'Voir les erreurs', href: '#mairie/erreurs' }] }] : [];
});
