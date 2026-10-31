// ===== Humane Gang — Loup-Garou : pilotage d'une partie (#partie/CODE) =====
/*
 * Rôle : suit la partie en temps réel (api.js) et affiche le bon écran selon son état :
 *   attente → vues/salle.js · revelation → vues/revelation.js · en cours → vues/plateau.js (joueur) ou vues/meneur.js (meneur)
 *   · terminée → vues/fin.js. Quand on n'est pas encore dans la partie : renvoie vers #rejoindre/CODE.
 * Contrat des écrans de partie : export function monter(root, s) → { maj(etat), message(msg), detruire() }.
 *   s = { code, lg, messages, etat(), precedent(), secondesRestantes(), rafraichir(), naviguer }.
 *   precedent() : l'état reçu juste avant le dernier (null à l'ouverture de la page) ; sert aux effets d'une transition d'écran.
 *   vueEnCours() : vrai si la partie a été vue en cours depuis cette ouverture ; l'écran de fin ne joue ses effets qu'à cette condition.
 * Dépendances : api.js, ui.js.
 * Exporte : afficher.
 */
import { esc } from '../../commun/core.js';
import { lg, messages, suivrePartie, estInvite } from './api.js';
import { filAriane } from './ui.js';

const ECRANS = {
  salle: () => import('./vues/salle.js'),
  revelation: () => import('./vues/revelation.js'),
  plateau: () => import('./vues/plateau.js'),
  meneur: () => import('./vues/meneur.js'),
  fin: () => import('./vues/fin.js'),
};

/** Quel écran pour cet état ? */
function ecranPour(e) {
  const p = e?.partie;
  if (!p) return null;
  if (p.statut === 'attente' || p.statut === 'annulee') return 'salle';
  if (p.statut === 'terminee') return 'fin';
  if (e.moi?.meneur) return 'meneur';
  if (p.statut === 'revelation') return 'revelation';
  return 'plateau';
}

export async function afficher(root, { code, naviguer }) {
  if (!code) { naviguer(''); return; }
  root.innerHTML = `${estInvite() ? '' : filAriane('Partie')}<p class="lg-chargement">Connexion à la partie ${esc(code)}…</p>`;
  let courant = null;          // { nom, vue }
  let charge = null;           // chargement d'écran en cours
  let file = [];               // messages arrivés pendant un chargement
  let fini = false;
  let vuEtat = null;      // dernier état reçu
  let avantEtat = null;   // celui d'avant
  let vueEnCours = false; // la partie a été vue en cours depuis l'ouverture : un second état « terminee » reçu pendant le chargement de la fin ne l'efface pas

  const session = suivrePartie(code, {
    onEtat: async (e) => {
      if (fini) return;
      avantEtat = vuEtat;
      vuEtat = e;
      if (e?.partie?.statut === 'en_cours') vueEnCours = true;
      if (!e?.moi) { naviguer(`#rejoindre/${encodeURIComponent(code)}`); return; }
      const nom = ecranPour(e);
      if (courant?.nom === nom) { courant.vue.maj(e); return; }
      if (charge) return;
      charge = (async () => {
        const mod = await ECRANS[nom]();
        if (fini) return;
        try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
        root.innerHTML = '';
        const vue = mod.monter(root, s);
        courant = { nom, vue };
        vue.maj(session.etat() || e);
        for (const m of file) vue.message?.(m);
        file = [];
      })().catch((err) => {
        console.error('[loup-garou] écran', err);
        root.innerHTML = '<section class="card lg-erreur"><p>Cet écran n\'a pas pu s\'afficher.</p></section>';
      }).finally(() => { charge = null; });
    },
    onMessage: (m) => { if (courant && !charge) courant.vue.message?.(m); else file.push(m); },
    onErreur: (err) => {
      if (!courant) {
        root.innerHTML = `${estInvite() ? '' : filAriane('Partie')}<section class="card lg-erreur"><h1 class="display">Partie introuvable</h1>
          <p>${esc(err?.message || 'Cette partie n\'existe pas ou n\'est plus disponible.')}</p>
          <p><a class="btn btn-primary" href="${estInvite() ? `/pages/jeux/loup-garou.html#rejoindre/${encodeURIComponent(code)}` : '/pages/jeux/loup-garou.html'}">${estInvite() ? 'Rejoindre à nouveau' : 'Retour au Loup-Garou'}</a></p></section>`;
      }
    },
  });

  const s = {
    code, lg, naviguer,
    messages: (canal, depuis = 0) => messages(session.etat()?.partie?.id, canal, depuis, code),
    etat: () => session.etat(),
    precedent: () => avantEtat,
    vueEnCours: () => vueEnCours,
    secondesRestantes: () => session.secondesRestantes(),
    rafraichir: () => session.rafraichir(),
  };

  return () => {
    fini = true;
    session.arreter();
    try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
  };
}
