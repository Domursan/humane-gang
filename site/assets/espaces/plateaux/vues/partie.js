// ===== Humane Gang — Jeux de plateau : pilotage d'une partie (#partie/CODE) =====
/*
 * Rôle : suit la partie en temps réel (plateaux/api.js) et affiche la bonne vue selon son statut :
 *   attente → ./salle.js · en_cours → ../jeux/<jeu>/table.js · terminee / annulee → ./fin.js.
 * Les contenus du jeu (noms, rues, territoires…) sont chargés une fois, avant la première vue.
 * La vue n'est recréée que si le statut change ; sinon on appelle vue.maj(etat).
 * Les messages du chat (anciens puis nouveaux) sont passés à la vue par vue.message(msg).
 * Quand on n'est pas (encore) inscrit dans une partie en attente, renvoie vers #rejoindre/CODE.
 * Contrat des vues : export function creer(root, ctx) → { maj(etat), message(msg), detruire() },
 *   ctx = { code, naviguer, moi, suivi, contenus } (suivi : rafraichir, secondesRestantes, etat).
 * Les tables (../jeux/<jeu>/table.js) suivent le même contrat. Facultatif pour une table : avantFin(etat) → promesse. Reçoit
 *   l'état final et garde la table à l'écran le temps d'un dernier effet (4 s au plus), puis l'écran de fin s'affiche.
 * Dépendances : core.js (esc), plateaux/api.js (suivrePartie, messages, estInvite, contenus, jeu), ./fin-fx.js (vuEnCours, arreterEffetsFin).
 * Exporte : afficher.
 */
import { esc } from '../../../commun/core.js';
import { suivrePartie, messages, estInvite, contenus, jeu } from '../api.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';
import { vuEnCours, arreterEffetsFin } from './fin-fx.js';

/** Temps maximal qu'une table peut garder l'écran après la fin (avantFin). */
const DELAI_AVANT_FIN = 4000;

const VUES = {
  salle: () => import('./salle.js'),
  table: () => import(`../jeux/${jeu().id}/table.js`),
  fin: () => import('./fin.js'),
};

/* Jeux dont la partie a de l'information cachée (migration 134 : hg_adrep_<jeu>). Destins n'en a pas : pas de bouton. */
const JEUX_AVEC_REPONSES = new Set(['cluedo', 'shadow', 'monopoly', 'risk']);

/**
 * Pose le bouton « Réponses » (administrateurs seulement) en tête de la vue, après chaque création de vue.
 * La référence est l'id de la partie suivie, lue au moment du clic.
 */
function ajouterReponses(root, refDe) {
  if (!JEUX_AVEC_REPONSES.has(jeu()?.id)) return;
  root.querySelector(':scope > .plat-reponses-admin')?.remove();
  const barre = document.createElement('div');
  barre.className = 'plat-reponses-admin';
  root.prepend(barre);
  boutonReponses(barre, jeu().id, refDe).catch((err) => console.warn('[plateaux] réponses', err));
}

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
    ? `${jeu().page}#rejoindre/${encodeURIComponent(code)}`
    : jeu().page;
  root.innerHTML = `<section class="card plat-erreur">
    <h1 class="display">Partie introuvable</h1>
    <p>${esc(message || 'Cette partie n\'existe pas ou n\'est plus disponible.')}</p>
    <p><a class="btn btn-primary" href="${esc(lien)}">${invite ? 'Rejoindre à nouveau' : `Retour à ${esc(jeu().nom)}`}</a></p>
  </section>`;
}

/**
 * Affiche la partie code dans root et suit ses changements.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string|null, naviguer: Function, moi: object }} ctx contexte fourni par plateaux.js.
 * @returns {Function} nettoyage (arrête le suivi, détruit la vue).
 */
export async function afficher(root, { code, naviguer, moi }) {
  if (!code) { naviguer(''); return () => {}; }
  root.innerHTML = `<p class="plat-chargement">Connexion à la partie ${esc(code)}…</p>`;

  let fini = false;
  let courant = null;            // { nom, vue }
  let suivi = null;              // rempli dès le premier appel de suivrePartie
  let dernier = null;            // dernier état reçu
  let charge = null;             // chargement de vue en cours (promesse)
  let historique = null;         // chargement unique des anciens messages
  let contenusCache = null;      // contenus du jeu, chargés une fois
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
      .catch((err) => console.warn('[plateaux] messages', err));
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
      if (!contenusCache) contenusCache = await contenus(code);
      if (fini) return;
      if (nom === 'fin' && courant?.vue.avantFin) {
        await Promise.race([Promise.resolve().then(() => courant.vue.avantFin(e)).catch(() => {}),
          new Promise((ok) => { setTimeout(ok, DELAI_AVANT_FIN); })]);
        if (fini) return;
      }
      try { courant?.vue.detruire?.(); } catch { /* sans effet */ }
      root.innerHTML = '';
      const vue = mod.creer(root, { code, naviguer, moi, suivi, contenus: contenusCache });
      courant = { nom, vue };
      ajouterReponses(root, () => dernier?.partie?.id ?? null);
      vue.maj(dernier || e);
      msgs.forEach((m) => vue.message?.(m));
    })()
      .catch((err) => {
        console.error('[plateaux] vue', err);
        root.innerHTML = '<section class="card plat-erreur"><p>Cet écran n\'a pas pu s\'afficher.</p></section>';
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
      vuEnCours(e?.partie);
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
  };
}
