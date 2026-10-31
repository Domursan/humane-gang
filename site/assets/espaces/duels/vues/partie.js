// ===== Humane Gang — Duels : pilotage d'un duel (#partie/CODE) =====
/*
 * Rôle : suit la partie en temps réel (duels/api.js) et affiche la bonne vue selon son statut :
 *   attente → vues/salle.js · en_cours → vues/p4.js, vues/morpion.js, vues/mastermind.js,
 *   vues/bataille.js, vues/quiestce.js, vues/dames.js, vues/echecs.js, vues/othello.js ou vues/pfc.js (selon le jeu) ·
 *   terminee / annulee → vues/fin.js. Un spectateur (duel public) voit la même table, sans pouvoir jouer.
 * La vue n'est recréée que si le statut change ; sinon on appelle vue.maj(etat).
 * Les messages du chat (anciens puis nouveaux) sont passés à la vue par vue.message(msg).
 * Duel en attente où je ne joue pas (défi reçu, code partagé) : renvoie vers #rejoindre/CODE.
 * Contrat des vues : export function creer(root, ctx) → { maj(etat), message(msg), detruire() },
 *   ctx = { code, naviguer, moi, suivi } (suivi : rafraichir, secondesRestantes, etat).
 *   Facultatif pour une table : avantFin(etat) → promesse. Reçoit l'état final et garde la table à l'écran le temps d'un dernier
 *   effet (4 s au plus), puis l'écran de fin s'affiche.
 * Dépendances : core.js (esc), duels/api.js (suivrePartie, messages, estInvite), ./fin-fx.js (arreterEffetsFin, oublierPartie).
 * Exporte : afficher.
 */
import { esc } from '../../../commun/core.js';
import { suivrePartie, messages, estInvite } from '../api.js';
import { arreterEffetsFin, oublierPartie } from './fin-fx.js';

/** Temps maximal qu'une table peut garder l'écran après la fin (avantFin). */
const DELAI_AVANT_FIN = 4000;

const VUES = {
  salle: () => import('./salle.js'),
  p4: () => import('./p4.js'),
  morpion: () => import('./morpion.js'),
  mastermind: () => import('./mastermind.js'),
  bataille: () => import('./bataille.js'),
  quiestce: () => import('./quiestce.js'),
  dames: () => import('./dames.js'),
  echecs: () => import('./echecs.js'),
  othello: () => import('./othello.js'),
  pfc: () => import('./pfc.js'),
  fin: () => import('./fin.js'),
};

/** Nom de la vue à afficher pour cet état (la table dépend du jeu). */
function vuePour(e) {
  const statut = e?.partie?.statut;
  if (statut === 'attente') return 'salle';
  if (statut === 'en_cours') return VUES[e.partie.jeu] ? e.partie.jeu : null;
  if (statut === 'terminee' || statut === 'annulee') return 'fin';
  return null;
}

/** Carte d'erreur « Partie introuvable » avec le lien de retour. */
function erreurCarte(root, code, message) {
  const invite = estInvite();
  const lien = invite
    ? `/pages/jeux/duels.html#rejoindre/${encodeURIComponent(code)}`
    : '/pages/jeux/duels.html';
  root.innerHTML = `<section class="card duels-erreur">
    <h1 class="display">Duel introuvable</h1>
    <p>${esc(message || 'Ce duel n\'existe pas ou n\'est plus disponible.')}</p>
    <p><a class="btn btn-primary" href="${lien}">${invite ? 'Rejoindre à nouveau' : 'Retour aux duels'}</a></p>
  </section>`;
}

/**
 * Affiche la partie code dans root et suit ses changements.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string|null, naviguer: Function, moi: object }} ctx contexte fourni par duels.js.
 * @returns {Function} nettoyage (arrête le suivi, détruit la vue).
 */
export async function afficher(root, { code, naviguer, moi }) {
  if (!code) { naviguer(''); return () => {}; }
  root.innerHTML = `<p class="duels-chargement">Connexion au duel ${esc(code)}…</p>`;

  let fini = false;
  let courant = null;            // { nom, vue }
  let suivi = null;              // rempli dès le premier appel de suivrePartie
  let dernier = null;            // dernier état reçu (pour réaligner la vue après un chargement)
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
      .catch((err) => console.warn('[duels] messages', err));
  }

  /** Aligne la vue affichée sur le dernier état connu. */
  async function aligner() {
    if (fini || !dernier || charge) return;
    const e = dernier;
    if (!e.moi) { naviguer(`#rejoindre/${encodeURIComponent(code)}`); return; }
    if (e.partie?.statut === 'attente' && !e.moi.joue) { naviguer(`#rejoindre/${encodeURIComponent(code)}`); return; }
    const nom = vuePour(e);
    if (!nom) return;
    if (courant?.nom === nom) { courant.vue.maj(e); return; }

    charge = (async () => {
      const mod = await VUES[nom]();
      if (fini) return;
      if (nom === 'fin' && courant?.vue.avantFin) {
        await Promise.race([Promise.resolve().then(() => courant.vue.avantFin(e)).catch(() => {}),
          new Promise((ok) => { setTimeout(ok, DELAI_AVANT_FIN); })]);
        if (fini) return;
      }
      try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
      root.innerHTML = '';
      const vue = mod.creer(root, { code, naviguer, moi, suivi });
      courant = { nom, vue };
      vue.maj(dernier || e);
      msgs.forEach((m) => vue.message?.(m));
    })()
      .catch((err) => {
        console.error('[duels] vue', err);
        root.innerHTML = '<section class="card duels-erreur"><p>Cet écran n\'a pas pu s\'afficher.</p></section>';
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
      if (courant && courant.nom === vuePour(e) && e?.moi && !charge) courant.vue.maj(e);
      else aligner();
    },
    onMessage: (m) => ajouterMessage(m),
    onErreur: (err) => {
      if (!courant && !fini) erreurCarte(root, code, err?.message);
    },
  });

  return () => {
    fini = true;
    try { suivi.arreter(); } catch { /* sans effet */ }
    try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
    arreterEffetsFin();
    // Parti avant la fin : une fin découverte plus tard n'est plus jouée comme une fin vue en direct.
    if (courant?.nom !== 'fin' && dernier?.partie?.id) oublierPartie(dernier.partie.id);
  };
}
