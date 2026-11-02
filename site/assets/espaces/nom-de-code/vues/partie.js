// ===== Humane Gang — Nom de code : pilotage d'une partie (#partie/CODE) =====
/*
 * Rôle : suit la partie en temps réel (nom-de-code/api.js) et affiche la bonne vue selon son statut :
 *   attente → vues/salle.js · en_cours → vues/table.js · terminee / annulee → vues/fin.js.
 * La vue n'est recréée que si le statut change ; sinon on appelle vue.maj(etat).
 * Les messages du chat (anciens puis nouveaux) sont passés à la vue par vue.message(msg).
 * Quand on n'est pas (encore) inscrit dans une partie en attente, renvoie vers #rejoindre/CODE.
 * Contrat des vues : export function creer(root, ctx) → { maj(etat), message(msg), detruire() },
 *   ctx = { code, naviguer, moi, suivi, avant } (suivi : rafraichir, secondesRestantes, etat ;
 *   avant : dernier état vu par la vue précédente, null si aucune — sert à détecter la fin d'une partie).
 * Dépendances : core.js (esc), nom-de-code/api.js (suivrePartie, messages, estInvite).
 * Exporte : afficher.
 */
import { esc } from '../../../commun/core.js';
import { suivrePartie, messages, estInvite, jetonInvite } from '../api.js';
import { sortieInvite } from '../../../commun/quitter.js';

const VUES = {
  salle: () => import('./salle.js'),
  table: () => import('./table.js'),
  fin: () => import('./fin.js'),
};

/** Nom de la vue à afficher pour cet état. */
function vuePour(e) {
  const statut = e?.partie?.statut;
  if (statut === 'attente') return 'salle';
  if (statut === 'en_cours') return 'table';
  if (statut === 'terminee' || statut === 'annulee') return 'fin';
  return null;
}

/** Carte d'erreur « Partie introuvable » avec le lien de retour. */
function erreurCarte(root, code, message) {
  const invite = estInvite();
  const lien = invite
    ? `/pages/jeux/nom-de-code.html#rejoindre/${encodeURIComponent(code)}`
    : '/pages/jeux/nom-de-code.html';
  root.innerHTML = `<section class="card ndc-erreur">
    <h1 class="display">Partie introuvable</h1>
    <p>${esc(message || 'Cette partie n\'existe pas ou n\'est plus disponible.')}</p>
    <p><a class="btn btn-primary" href="${lien}">${invite ? 'Rejoindre à nouveau' : 'Retour à Nom de code'}</a></p>
  </section>`;
}

/**
 * Affiche la partie code dans root et suit ses changements.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string|null, naviguer: Function, moi: object }} ctx contexte fourni par nom-de-code.js.
 * @returns {Function} nettoyage (arrête le suivi, détruit la vue).
 */
export async function afficher(root, { code, naviguer, moi }) {
  if (!code) { naviguer(''); return () => {}; }
  root.innerHTML = `<p class="ndc-chargement">Connexion à la partie ${esc(code)}…</p>`;

  let fini = false;
  let courant = null;            // { nom, vue }
  let suivi = null;              // rempli dès le premier appel de suivrePartie
  let dernier = null;            // dernier état reçu (pour réaligner la vue après un chargement)
  let vu = null;                 // dernier état donné à la vue affichée : la vue suivante s'en sert pour détecter un changement
  let charge = null;             // chargement de vue en cours (promesse)
  let historique = null;         // chargement unique des anciens messages
  const msgs = [];               // tous les messages connus, du plus ancien au plus récent
  const vus = new Set();         // ids déjà passés (évite les doublons temps réel / historique)

  /** Envoie un message à la vue courante (ou le garde pour la prochaine vue). */
  function ajouterMessage(m) {
    if (!m || vus.has(m.id)) return;
    vus.add(m.id);
    msgs.push(m);
    if (courant && !charge) courant.vue.message?.(m);
  }

  /** Charge les anciens messages une seule fois, dès que la partie est connue. */
  function chargerHistorique(partieId) {
    if (historique || !partieId) return;
    historique = messages(partieId, 0, code)
      .then((liste) => {
        if (fini) return;
        [...liste].sort((a, b) => a.id - b.id).forEach(ajouterMessage);
      })
      .catch((err) => console.warn('[nom-de-code] messages', err));
  }

  /** Donne un état à la vue affichée et le retient comme « dernier vu ». */
  function pousser(vue, e) {
    vu = e;
    vue.maj(e);
  }

  /** Aligne la vue affichée sur le dernier état connu. */
  async function aligner() {
    if (fini || !dernier || charge) return;
    const e = dernier;
    if (!e.moi) { naviguer(`#rejoindre/${encodeURIComponent(code)}`); return; }
    if (e.partie?.statut === 'attente' && !e.moi.joue) { naviguer(`#rejoindre/${encodeURIComponent(code)}`); return; }
    const nom = vuePour(e);
    if (!nom) return;
    if (courant?.nom === nom) { pousser(courant.vue, e); return; }

    charge = (async () => {
      const mod = await VUES[nom]();
      if (fini) return;
      const avant = vu;          // dernier état vu par la vue qui s'en va (la fin s'en sert pour ses effets)
      try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
      root.innerHTML = '';
      const vue = mod.creer(root, { code, naviguer, moi, suivi, avant });
      courant = { nom, vue };
      pousser(vue, dernier || e);
      msgs.forEach((m) => vue.message?.(m));
    })()
      .catch((err) => {
        console.error('[nom-de-code] vue', err);
        root.innerHTML = '<section class="card ndc-erreur"><p>Cet écran n\'a pas pu s\'afficher.</p></section>';
      })
      .finally(() => { charge = null; });
    await charge;
    // Le statut a pu changer pendant le chargement : on réaligne.
    if (!fini && dernier && dernier !== e) aligner();
  }

  suivi = suivrePartie(code, {
    onEtat: (e) => {
      if (fini) return;
      dernier = e;
      chargerHistorique(e?.partie?.id);
      if (courant && courant.nom === vuePour(e) && e?.moi && !charge) pousser(courant.vue, e);
      else aligner();
    },
    onMessage: (m) => ajouterMessage(m),
    onErreur: (err) => {
      if (fini) return;
      if (!courant) erreurCarte(root, code, err?.message);
      // Invité parti de la table : la salle a son propre au revoir, la table n'en a pas et ne reçoit plus rien.
      else if (courant.nom === 'table' && estInvite() && !jetonInvite(code)) {
        fini = true;
        try { suivi.arreter(); } catch { /* sans effet */ }
        try { courant.vue.detruire?.(); } catch { /* sans effet */ }
        courant = null;
        sortieInvite(root, 'ndc-erreur', '/pages/jeux/nom-de-code.html');
      }
    },
  });

  return () => {
    fini = true;
    try { suivi.arreter(); } catch { /* sans effet */ }
    try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
  };
}
