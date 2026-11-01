// =====================================================================
// Cartes admin : tiroir de don. Ouvert depuis Économie (« Don groupé ») et depuis la fiche d'un membre, membre déjà coché.
// Le contenu est le panier du give (admin/give-panier.js), avec la même RPC et la même confirmation que Gestion globale.
// Dépendances : core.js (toast, errMsg), admin/ui/drawer.js (tiroir), admin/give-panier.js, admin/visual-pick.js (lectures),
// state.js (C), data.js (refresh), helpers.js (nf, activeProfiles).
// Exporte : openBulkGift.
// =====================================================================
import { toast, errMsg } from '../../../commun/core.js';
import { openDrawer } from '../ui/drawer.js';
import { creerGive } from '../give-panier.js';
import { chargerBoosters, chargerRestants } from '../visual-pick.js';
import { C } from './state.js';
import { refresh } from './data.js';
import { nf, activeProfiles } from './helpers.js';

/**
 * Ouvre le tiroir de don.
 * @param {object} [o]
 * @param {string[]} [o.choisis] membres déjà cochés
 * @param {string} [o.titre] titre du tiroir
 * @param {string} [o.sousTitre] ligne sous le titre
 */
export function openBulkGift({ choisis = [], titre = 'Don groupé', sousTitre = 'Paillettes, cartes et boosters, en un seul don' } = {}) {
  let give = null;
  const d = openDrawer({
    title: titre, subtitle: sousTitre, wide: true, submitLabel: 'Donner',
    body: '<p class="small muted">Chargement…</p>',
    onSubmit: async () => {
      if (!give) return false;
      const res = await give.donner();
      if (!res) return false;
      const n = Number(res.membres) || 1;
      toast(`Don envoyé à ${nf(n)} membre${n > 1 ? 's' : ''}`, 'ok');
      await refresh();
      return true;
    },
  });
  monter(d, { choisis }).then((g) => { give = g; });
}

/** Lit les restants et les boosters, puis monte le panier dans le tiroir. */
async function monter(d, { choisis }) {
  const cards = C.cards.filter((k) => k.active);
  const setsById = new Map(C.sets.map((s) => [s.id, s]));
  cards.forEach((k) => { k.set_name = setsById.get(k.set_id)?.name; });
  const [r, b] = await Promise.allSettled([chargerRestants(cards), chargerBoosters()]);
  if (!d.el.isConnected) return null;
  return creerGive(d.body, {
    membres: activeProfiles().map((p) => ({ id: p.id, pseudo: p.pseudo })), cards, sets: C.sets,
    restants: r.status === 'fulfilled' ? r.value.restants : new Map(),
    types: b.status === 'fulfilled' ? b.value : null, typesErreur: b.status === 'rejected' ? errMsg(b.reason) : '',
    idp: 'acd-bulk', choisis,
  });
}
