// ===== Humane Gang — Jeux à salon : pastille de connexion commune à toutes les tables =====
/*
 * Rôle : dire au joueur que la connexion a sauté, sans toucher aux barres de jeu ni griser les boutons.
 *   Rien d'affiché quand tout va bien. Une coupure ne se montre qu'au bout de 4 s, jamais onglet caché ;
 *   au réveil de l'onglet, le canal a 5 s pour se rebrancher avant que les 4 s commencent à compter.
 *   « Connexion rétablie » reste 3 s, et seulement si une coupure a été montrée.
 *   Canal tombé mais relectures bonnes : la partie se joue. « Reconnexion… » plutôt que la coupure dès qu'une relecture a réussi depuis
 *   la chute, et au bout de 15 s de bonnes relectures le canal ne compte plus jusqu'à son retour (jeux-salon.js en ouvre un neuf).
 * Sources d'une coupure : statut du canal temps réel, événements offline/online du navigateur, relectures ratées pour
 *   cause de réseau. Le canal ne compte qu'après un premier SUBSCRIBED : un canal qui n'a jamais démarré laisse la relecture
 *   de secours faire le travail, sans rien afficher. Un invité n'a pas de temps réel : seules les relectures comptent.
 * Le CSS (.salon-etat) est dans base.css. jeux-salon.js crée l'indicateur à chaque suivi de partie et l'arrête en sortant.
 * Dépendances : aucune.
 * Exporte : suivreConnexion (logique seule), indicateurConnexion (logique + pastille dans <body>),
 *   SEUIL_COUPURE, DUREE_RETOUR, DELAI_REVEIL, DUREE_SANS_CANAL.
 */

export const SEUIL_COUPURE = 4000;   // durée d'une coupure avant de la montrer (ms)
export const DUREE_RETOUR = 3000;    // durée de « Connexion rétablie » (ms)
export const DELAI_REVEIL = 5000;    // temps laissé au canal pour se rebrancher quand l'onglet se réveille (ms)
export const DUREE_SANS_CANAL = 15000; // relectures bonnes pendant ce temps : le canal absent ne compte plus (ms)

const TEXTES = { coupure: 'Connexion perdue, on réessaie', reprise: 'Reconnexion…', retour: 'Connexion rétablie' };
const ICONES = {
  coupure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 5-3M22 8.5A15 15 0 0 0 11 4.6M5.5 12.5a10 10 0 0 1 3-2M18.5 12.5a10 10 0 0 0-4.6-2.6M9 16.3a5 5 0 0 1 5.6-.6M12 20h.01M3 3l18 18"/></svg>',
  reprise: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5"/></svg>',
  retour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" aria-hidden="true"><path d="M4 12.5 10 18 20 6"/></svg>',
};

/**
 * Logique de l'indicateur, sans page : testable avec une fausse horloge.
 * @param {object} o
 * @param {(etat: ?string) => void} o.afficher reçoit 'coupure', 'reprise', 'retour' ou null (rien à montrer).
 * @param {() => boolean} o.dort vrai quand l'onglet est caché.
 * @param {Function} [o.attendre] (fonction, ms) => identifiant de minuteur.
 * @param {Function} [o.annuler] (identifiant) => annule le minuteur.
 * @returns {{ canal: Function, lecture: Function, reseau: Function, visibilite: Function, lectureRatee: Function, arreter: Function }}
 */
export function suivreConnexion({ afficher, dort, attendre = (f, ms) => setTimeout(f, ms), annuler = (id) => clearTimeout(id) }) {
  let actif = true;
  let canalCoupe = false;        // le canal, déjà branché une fois, est tombé
  let canalVu = false;           // le canal a été branché au moins une fois
  let lectureRatee = false;      // la dernière relecture a échoué pour cause de réseau
  let horsLigne = false;         // le navigateur se dit hors ligne
  let signeDeVie = false;        // le réseau a répondu depuis la chute du canal
  let sansCanal = false;         // le canal n'est pas revenu mais les relectures suffisent
  let montre = null;             // état affiché
  let compte = null;             // minuteur des 4 s avant de montrer la coupure
  let effacement = null;         // minuteur des 3 s de « Connexion rétablie »
  let reveil = null;             // minuteur du délai laissé au canal après le réveil de l'onglet
  let bonnes = null;             // minuteur des 15 s de bonnes relectures, canal tombé

  const coupe = () => (canalCoupe && !sansCanal) || lectureRatee || horsLigne;
  const pastilleCoupure = () => (canalCoupe && signeDeVie && !lectureRatee && !horsLigne ? 'reprise' : 'coupure');
  const montrer = (etat) => { if (etat !== montre) { montre = etat; afficher(etat); } };
  const annulerTout = () => {
    annuler(compte); annuler(effacement); annuler(reveil); annuler(bonnes);
    compte = null; effacement = null; reveil = null; bonnes = null;
  };

  const evaluer = () => {
    if (!actif || dort()) return;
    const enCoupure = montre === 'coupure' || montre === 'reprise';
    if (!coupe()) {
      annuler(compte); compte = null;
      if (enCoupure) {
        montrer('retour');
        effacement = attendre(() => { effacement = null; montrer(null); }, DUREE_RETOUR);
      }
      return;
    }
    if (montre === 'retour') { annuler(effacement); effacement = null; montrer(null); }
    if (enCoupure) {
      montrer(pastilleCoupure());
      return;
    }
    if (compte === null && reveil === null) {
      compte = attendre(() => {
        compte = null;
        if (coupe() && !dort()) montrer(pastilleCoupure());
      }, SEUIL_COUPURE);
    }
  };

  /** Compte les 15 s de bonnes relectures, canal tombé : une relecture ratée les annule. */
  const compterBonnes = (ok) => {
    if (!ok) { annuler(bonnes); bonnes = null; return; }
    if (bonnes !== null || !actif || !canalCoupe || sansCanal) return;
    bonnes = attendre(() => { bonnes = null; sansCanal = true; evaluer(); }, DUREE_SANS_CANAL);
  };

  return {
    /** Statut du canal temps réel (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT, CLOSED). */
    canal(statut) {
      if (statut === 'SUBSCRIBED') {
        canalVu = true; canalCoupe = false; sansCanal = false;
        annuler(bonnes); bonnes = null;
      } else if (canalVu && !canalCoupe) {
        canalCoupe = true; signeDeVie = false;   // une relecture d'avant la chute ne prouve rien
      }
      evaluer();
    },
    /** Résultat d'une relecture : ok, ou raté pour cause de réseau. */
    lecture(ok) { lectureRatee = !ok; signeDeVie = !!ok; compterBonnes(ok); evaluer(); },
    /** Événements online / offline du navigateur. */
    reseau(enLigne) { horsLigne = !enLigne; signeDeVie = !!enLigne; if (!enLigne) compterBonnes(false); evaluer(); },
    /** À appeler quand l'onglet est caché ou réaffiché. */
    visibilite() {
      if (!actif) return;
      if (dort()) { annulerTout(); montrer(null); return; }
      annuler(reveil);
      reveil = attendre(() => { reveil = null; evaluer(); }, DELAI_REVEIL);
    },
    /** Vrai si la dernière relecture a raté : le suivi réessaie alors sans attendre le délai espacé. */
    lectureRatee: () => lectureRatee,
    /** Plus de minuteur ni de pastille. */
    arreter() { actif = false; annulerTout(); montrer(null); },
  };
}

/** Pose et retire la pastille dans <body>. Elle est posée vide puis remplie, sans quoi les lecteurs d'écran ne l'annoncent pas. */
function pastille() {
  let el = null;
  let remplissage = null;
  return (etat) => {
    clearTimeout(remplissage);
    if (!etat) { el?.remove(); el = null; return; }
    const remplir = () => { el.dataset.etat = etat; el.innerHTML = `${ICONES[etat]}<span>${TEXTES[etat]}</span>`; };
    if (el) { remplir(); return; }
    el = document.createElement('div');
    el.className = 'salon-etat';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.append(el);
    remplissage = setTimeout(remplir, 60);
  };
}

/** Indicateur de connexion d'une table, branché sur la pastille et sur la visibilité de l'onglet. */
export const indicateurConnexion = () => suivreConnexion({ afficher: pastille(), dort: () => document.hidden });
