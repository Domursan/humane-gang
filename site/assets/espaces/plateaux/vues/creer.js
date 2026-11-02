// ===== Humane Gang — Jeux de plateau : créer une partie (#creer) =====
/*
 * Rôle : formulaire de création (nom, places, durée d'un tour, visibilité, invités, spectateurs admis (Blackjack, Monopoly,
 * Destins, partie publique : migration 214), annonce Discord) et, pour
 * chaque jeu, ses options propres. « Créer la partie » envoie plat.creer puis ouvre la salle d'attente.
 * OPTIONS (exporté) : réglages propres à chaque jeu, indexés par id de jeu. Vide pour cluedo, shadow, destins.
 *   monopoly : { duree: { valeurs: [45, 60, 90], defaut: 60, titre?, unite? } }   (unité par défaut : minutes)
 *   risk     : { missions: { defaut: true } }
 *   blackjack: { manches: { valeurs: [5, 8, 12], defaut: 8, titre, unite: ' manches' } }
 *   poker    : { jetons: { valeurs: [500, 1000, 2000], defaut: 1000, titre, unite: ' jetons' },
 *                montee: { valeurs: [5, 8, 12], defaut: 8, titre, unite: ' mains' } }
 * Un réglage à valeurs est présenté en segments (titre = légende du groupe, unite = suffixe de chaque valeur).
 * Le formulaire envoie options = { duree: 60 } ou { missions: true } ou { manches: 8 }.
 * Dépendances : core.js (esc), plateaux/api.js (plat, contenus, erreurTexte, jeu).
 * Exporte : afficher, OPTIONS.
 */
import { esc } from '../../../commun/core.js';
import { plat, contenus, erreurTexte, jeu } from '../api.js';
import { JEUX_SPECTATEURS } from '../../../commun/spectateurs.js';

/** Options propres à chaque jeu (voir l'en-tête). */
export const OPTIONS = {
  cluedo: {},
  shadow: {},
  destins: {},
  monopoly: { duree: { valeurs: [45, 60, 90], defaut: 60 } },
  risk: { missions: { defaut: true } },
  blackjack: { manches: { valeurs: [5, 8, 12], defaut: 8, titre: 'Nombre de manches', unite: ' manches' } },
  poker: {
    jetons: { valeurs: [500, 1000, 2000], defaut: 1000, titre: 'Jetons de départ', unite: ' jetons' },
    montee: { valeurs: [5, 8, 12], defaut: 8, titre: 'Blindes doublées toutes les', unite: ' mains' },
  },
  catan: { objectif: { valeurs: [8, 10], defaut: 10, titre: 'Points pour gagner', unite: ' points' } },
  pictionary: {
    manches: { valeurs: [1, 2, 3], defaut: 2, titre: 'Manches (chacun dessine une fois par manche)', unite: '' },
    duree: { valeurs: [60, 80, 100], defaut: 80, titre: 'Temps par dessin', unite: ' s' },
  },
};

const DUREES_TOUR = [30, 60, 90, 120];

/** Groupe de boutons radio présentés en segments. */
function segments(nom, titre, options, valeur) {
  return `<fieldset class="plat-groupe">
    <legend>${esc(titre)}</legend>
    <div class="plat-seg">${options.map((o) => `<label class="plat-seg-choix">
      <input class="plat-vh" type="radio" name="${esc(nom)}" value="${esc(o.valeur)}"${String(o.valeur) === String(valeur) ? ' checked' : ''}>
      <span>${esc(o.libelle)}</span></label>`).join('')}</div>
  </fieldset>`;
}

/** Interrupteur (case à cocher stylée). */
function interrupteur(nom, titre, aide, coche) {
  return `<label class="plat-switch">
    <span class="plat-switch-texte"><strong>${esc(titre)}</strong><span class="small muted" id="plat-${esc(nom)}-aide">${esc(aide)}</span></span>
    <input class="plat-vh" type="checkbox" role="switch" name="${esc(nom)}" aria-describedby="plat-${esc(nom)}-aide"${coche ? ' checked' : ''}>
    <span class="plat-piste" aria-hidden="true"></span>
  </label>`;
}

/** Lit les réglages du formulaire. */
function lire(form, options) {
  const fd = new FormData(form);
  const reglesJeu = {};
  for (const [cle, spec] of Object.entries(options)) {
    if (spec.valeurs) reglesJeu[cle] = Number(fd.get(`opt-${cle}`)) || spec.defaut;
    else reglesJeu[cle] = fd.has(`opt-${cle}`);
  }
  return {
    nom: String(fd.get('nom') || '').trim(),
    nb_places: Number(fd.get('nb_places')) || 0,
    t_tour: Number(fd.get('t_tour')) || 60,
    visibilite: fd.get('visibilite') === 'privee' ? 'privee' : 'publique',
    invites: fd.has('invites'),
    spectateurs: fd.has('spectateurs'),
    annonce_discord: fd.has('discord'),
    options: reglesJeu,
  };
}

/** Bloc des options propres au jeu (vide pour les jeux sans option). */
function blocOptions(options) {
  const lignes = Object.entries(options).map(([cle, spec]) => {
    if (spec.valeurs) {
      return segments(`opt-${cle}`, spec.titre || 'Durée de la partie', spec.valeurs.map((v) => ({ valeur: v, libelle: `${v}${spec.unite ?? ' min'}` })), spec.defaut);
    }
    return interrupteur(`opt-${cle}`, 'Missions secrètes', 'Chaque joueur reçoit une mission secrète à accomplir.', !!spec.defaut);
  });
  return lignes.length ? `<section class="card plat-carte" aria-labelledby="plat-options-titre">
    <h2 id="plat-options-titre">Options du jeu</h2>${lignes.join('')}</section>` : '';
}

/**
 * Affiche l'écran de création et gère l'envoi.
 * @param {HTMLElement} root zone d'affichage (#app).
 * @param {{ naviguer: Function }} ctx changement d'écran (hash).
 */
export async function afficher(root, { naviguer }) {
  const J = jeu();
  const c = await contenus().catch(() => ({}));
  const nomJeu = c?.nom || J.nom;
  const options = OPTIONS[J.id] || {};
  const spectables = JEUX_SPECTATEURS.includes(J.id);   // migration 214 : Blackjack, Monopoly, Destins

  root.innerHTML = `
    <p class="plat-fil">Jeux › <a href="${esc(J.page)}">${esc(nomJeu)}</a> › Créer</p>
    <h1 class="plat-titre display">Créer une partie</h1>
    <p class="plat-sous-titre">Règle ta partie, puis invite tes amis avec le code.</p>

    <form id="plat-creer" class="plat-creer" novalidate>
      <div class="plat-creer-grille">
        <div class="plat-creer-colonne">
          <section class="card plat-carte" aria-labelledby="plat-reglages-titre">
            <h2 id="plat-reglages-titre">Réglages</h2>
            <div class="plat-champ plat-champ-large">
              <label for="plat-nom">Nom de la partie</label>
              <input id="plat-nom" class="plat-input" type="text" name="nom" maxlength="60" value="Partie de ${esc(nomJeu)}" autocomplete="off" required>
            </div>

            <div class="plat-champ">
              <div class="plat-champ-entete">
                <label for="plat-places">Nombre de places</label>
                <output id="plat-places-val" for="plat-places">${esc(J.max)}</output>
              </div>
              <input id="plat-places" type="range" name="nb_places" min="${esc(J.min)}" max="${esc(J.max)}" value="${esc(J.max)}" aria-describedby="plat-places-echelle">
              <div id="plat-places-echelle" class="plat-echelle small muted" aria-hidden="true"><span>${esc(J.min)}</span><span>${esc(J.max)}</span></div>
            </div>

            ${segments('t_tour', 'Durée d\'un tour', DUREES_TOUR.map((d) => ({ valeur: d, libelle: `${d} s` })), 60)}
            ${segments('visibilite', 'Visibilité', [{ valeur: 'publique', libelle: 'Publique' }, { valeur: 'privee', libelle: 'Privée' }], 'publique')}
            ${interrupteur('invites', 'Invités acceptés', 'Des joueurs sans compte peuvent rejoindre avec le lien.', true)}
            ${spectables ? `<div data-sp-reglage>${interrupteur('spectateurs', 'Spectateurs admis', 'Les membres peuvent regarder la partie sans jouer. Ils ne voient rien de caché.', true)}</div>` : ''}
            ${interrupteur('discord', 'Annonce sur Discord', 'Publie la partie dans le salon des joueurs.', false)}
          </section>

          ${blocOptions(options)}
        </div>

        <aside class="card plat-carte plat-resume" aria-labelledby="plat-resume-titre">
          <h2 id="plat-resume-titre">Ta partie</h2>
          <dl class="plat-resume-liste">
            <div><dt>Jeu</dt><dd>${esc(nomJeu)}</dd></div>
            <div><dt>Nom</dt><dd data-r="nom"></dd></div>
            <div><dt>Places</dt><dd data-r="places"></dd></div>
            <div><dt>Tour</dt><dd data-r="tour"></dd></div>
            <div><dt>Visibilité</dt><dd data-r="visibilite"></dd></div>
            <div><dt>Invités</dt><dd data-r="invites"></dd></div>
            <div><dt>Discord</dt><dd data-r="discord"></dd></div>
          </dl>
          <p class="plat-erreur-ligne" data-erreur role="alert" hidden></p>
          <button type="submit" form="plat-creer" class="btn btn-primary plat-creer-bouton" data-envoyer>Créer la partie</button>
          <p class="small muted plat-centre">Un code de partie est créé avec la partie.</p>
        </aside>
      </div>
    </form>`;

  const form = root.querySelector('#plat-creer');
  const champNom = root.querySelector('#plat-nom');
  const curseur = root.querySelector('#plat-places');
  const sortie = root.querySelector('#plat-places-val');
  const erreurEl = root.querySelector('[data-erreur]');
  const bouton = root.querySelector('[data-envoyer]');
  let occupe = false;

  /** Affiche ou efface le message d'erreur du formulaire. */
  const erreur = (msg) => { erreurEl.textContent = msg; erreurEl.hidden = !msg; };

  /** Écrit le résumé « Ta partie » d'après les réglages lus. */
  const reglageSpect = root.querySelector('[data-sp-reglage]');
  const majResume = () => {
    const p = lire(form, options);
    if (reglageSpect) reglageSpect.hidden = p.visibilite === 'privee';   // spectateurs : partie publique seulement
    const set = (cle, texte) => { const el = root.querySelector(`[data-r="${cle}"]`); if (el) el.textContent = texte; };
    set('nom', p.nom || 'À nommer');
    set('places', String(p.nb_places));
    set('tour', `${p.t_tour} s`);
    set('visibilite', p.visibilite === 'privee' ? 'Privée' : 'Publique');
    set('invites', p.invites ? 'Acceptés' : 'Refusés');
    set('discord', p.annonce_discord ? 'Annonce prévue' : 'Pas d\'annonce');
  };
  curseur.addEventListener('input', () => { sortie.textContent = curseur.value; });
  form.addEventListener('input', majResume);
  form.addEventListener('change', majResume);

  /** Envoi : création côté serveur, puis salle d'attente. */
  async function envoyer(e) {
    e.preventDefault();
    if (occupe) return;
    const p = lire(form, options);
    if (!p.nom) {
      erreur('Donne un nom à la partie.');
      champNom.focus();
      return;
    }
    erreur('');
    occupe = true;
    bouton.disabled = true;
    bouton.textContent = 'Création…';
    try {
      const code = await plat.creer({
        nom: p.nom,
        nb_places: p.nb_places,
        t_tour: p.t_tour,
        visibilite: p.visibilite,
        invites: p.invites,
        ...(spectables ? { spectateurs: p.spectateurs } : {}),
        annonce_discord: p.annonce_discord,
        options: p.options,
      });
      if (!code) throw new Error('La partie est créée, mais son code est introuvable. Recharge la page.');
      naviguer(`#partie/${encodeURIComponent(code)}`);
    } catch (err) {
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = 'Créer la partie';
      erreur(erreurTexte(err));
    }
  }
  form.addEventListener('submit', envoyer);

  sortie.textContent = curseur.value;
  majResume();
}
