// ===== Humane Gang — Uno : créer une partie (#creer) =====
/*
 * Rôle : formulaire de création (nom, places, visibilité, invités, spectateurs admis (partie publique, migration 214),
 * durée du tour, mode, variantes, annonce Discord)
 * avec le résumé « Ta partie » qui se met à jour à chaque réglage. « Créer la partie » envoie les réglages au serveur
 * (uno.creer). Si l'annonce Discord est demandée, elle part sans bloquer ; ensuite on ouvre la salle d'attente.
 * Dépendances : core.js (esc, notify, getProfile), uno/api.js (uno, erreurTexte).
 * Exporte : afficher.
 */
import { esc, notify, getProfile } from '../../../commun/core.js';
import { uno, erreurTexte } from '../api.js';

const VISIBILITES = [{ valeur: 'publique', libelle: 'Publique' }, { valeur: 'privee', libelle: 'Privée' }];
const DUREES = [15, 30, 60];
const MODES = [{ valeur: 'manche', libelle: 'Manche simple' }, { valeur: 'points', libelle: 'Partie en 500 points' }];
const VARIANTES = [
  { id: 'cumul', nom: 'Cumul des +2 et +4', aide: 'Un +2 ou +4 peut être contré par une carte semblable. Les pénalités s\'additionnent.', coche: true },
  { id: 'pioche_jusqu', nom: 'Pioche jusqu\'à jouer', aide: 'Tu piocheras jusqu\'à tomber sur une carte jouable, au lieu d\'une seule.' },
  { id: 'sept_zero', nom: 'Sept-zéro', aide: 'Un 7 échange ta main avec un autre joueur, un 0 fait tourner toutes les mains.' },
  { id: 'interception', nom: 'Interception', aide: 'Tu peux poser une carte identique à la défausse, même hors de ton tour.' },
];
const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>';

/** Groupe de boutons radio présentés en segments. */
function segments(nom, titre, options, valeur) {
  return `<fieldset class="uno-groupe">
    <legend>${esc(titre)}</legend>
    <div class="uno-seg">${options.map((o) => `<label class="uno-seg-choix">
      <input class="uno-vh" type="radio" name="${nom}" value="${esc(o.valeur)}"${String(o.valeur) === String(valeur) ? ' checked' : ''}>
      <span>${esc(o.libelle)}</span></label>`).join('')}</div>
  </fieldset>`;
}

/** Interrupteur (case à cocher stylée en bouton). */
function interrupteur(nom, titre, aide, coche) {
  return `<label class="uno-switch">
    <span class="uno-switch-texte"><strong>${esc(titre)}</strong><span class="uno-aide" id="uno-${nom}-aide">${esc(aide)}</span></span>
    <input class="uno-vh" type="checkbox" role="switch" name="${nom}" aria-describedby="uno-${nom}-aide"${coche ? ' checked' : ''}>
    <span class="uno-piste" aria-hidden="true"></span>
  </label>`;
}

/** Une variante : case à cocher avec son explication. */
function variante(v) {
  return `<label class="uno-variante">
    <input class="uno-vh" type="checkbox" name="v-${v.id}" aria-describedby="uno-v-${v.id}-aide"${v.coche ? ' checked' : ''}>
    <span class="uno-case-boite" aria-hidden="true">${CHECK_SVG}</span>
    <span class="uno-variante-texte"><strong>${esc(v.nom)}</strong><span class="uno-aide" id="uno-v-${v.id}-aide">${esc(v.aide)}</span></span>
  </label>`;
}

/** Ligne du résumé « Ta partie ». */
const ligne = (cle, titre) => `<div class="uno-resume-ligne"><dt>${esc(titre)}</dt><dd data-r="${cle}"></dd></div>`;

/** Lit les réglages du formulaire. */
function lire(form) {
  const fd = new FormData(form);
  return {
    nom: String(fd.get('nom') || '').trim(),
    nb_places: Number(fd.get('nb_places')) || 8,
    visibilite: fd.get('visibilite') || 'publique',
    invites: fd.has('invites'),
    spectateurs: fd.has('spectateurs'),
    t_tour: Number(fd.get('t_tour')) || 30,
    mode: fd.get('mode') || 'manche',
    variantes: Object.fromEntries(VARIANTES.map((v) => [v.id, fd.has(`v-${v.id}`)])),
    annonce_discord: fd.has('discord'),
  };
}

/** Écrit le résumé « Ta partie » d'après les réglages lus. */
function majResume(root, p, pseudo) {
  const set = (cle, texte) => { const el = root.querySelector(`[data-r="${cle}"]`); if (el) el.textContent = texte; };
  const nbVariantes = Object.values(p.variantes).filter(Boolean).length;
  set('nom', p.nom || 'À nommer');
  set('hote', pseudo ? `${pseudo} (toi)` : 'Toi');
  set('places', String(p.nb_places));
  set('visibilite', p.visibilite === 'privee' ? 'Privée' : 'Publique');
  set('invites', p.invites ? 'Acceptés' : 'Refusés');
  set('tour', `${p.t_tour} s`);
  set('mode', MODES.find((m) => m.valeur === p.mode)?.libelle || '');
  set('variantes', nbVariantes === 0 ? 'Aucune' : nbVariantes === 1 ? '1 active' : `${nbVariantes} actives`);
  set('discord', p.annonce_discord ? 'Annonce prévue' : 'Pas d\'annonce');
}

/**
 * Affiche l'écran de création et gère l'envoi.
 * @param {HTMLElement} root Zone d'affichage (#app).
 * @param {{ naviguer: Function }} ctx Changement d'écran (hash).
 */
export async function afficher(root, { naviguer }) {
  const profil = await getProfile().catch(() => null);
  const pseudo = profil?.pseudo || '';

  root.innerHTML = `
    <p class="uno-fil">Jeux › <a href="/pages/jeux/uno.html">Uno</a> › Créer</p>
    <h1 class="uno-titre">Créer une partie</h1>
    <p class="uno-sous-titre">Règle ta partie, puis invite tes amis avec le code.</p>

    <form id="uno-creer" class="uno-creer" novalidate>
      <div class="uno-creer-grille">
        <div class="uno-creer-colonne">
          <section class="card uno-bloc" aria-labelledby="uno-reglages-titre">
            <h2 id="uno-reglages-titre" class="uno-bloc-titre">Réglages</h2>
            <div class="uno-reglages">
              <div class="uno-champ uno-champ-large">
                <label for="uno-nom">Nom de la partie</label>
                <input id="uno-nom" class="uno-input" type="text" name="nom" value="Uno du dimanche" autocomplete="off" required>
              </div>

              <div class="uno-champ">
                <div class="uno-champ-entete">
                  <label for="uno-places">Nombre de places</label>
                  <output id="uno-places-val" for="uno-places">8</output>
                </div>
                <input id="uno-places" type="range" name="nb_places" min="2" max="20" value="8" aria-describedby="uno-places-echelle">
                <div id="uno-places-echelle" class="uno-echelle" aria-hidden="true"><span>2</span><span>20</span></div>
              </div>

              ${segments('visibilite', 'Visibilité', VISIBILITES, 'publique')}
              ${segments('t_tour', 'Durée d\'un tour', DUREES.map((d) => ({ valeur: d, libelle: `${d} s` })), 30)}
              ${segments('mode', 'Mode', MODES, 'manche')}
              ${interrupteur('invites', 'Invités acceptés', 'Des joueurs sans compte peuvent rejoindre.', true)}
              <div data-sp-reglage>${interrupteur('spectateurs', 'Spectateurs admis', 'Les membres peuvent regarder la partie sans jouer. Ils ne voient aucune main.', true)}</div>
              ${interrupteur('discord', 'Annonce sur Discord', 'Publie la partie dans le salon des joueurs.', false)}
            </div>
          </section>

          <section class="card uno-bloc" aria-labelledby="uno-variantes-titre">
            <h2 id="uno-variantes-titre" class="uno-bloc-titre">Variantes</h2>
            <div class="uno-variantes">${VARIANTES.map(variante).join('')}</div>
          </section>
        </div>

        <aside class="card uno-resume" aria-labelledby="uno-resume-titre">
          <h2 id="uno-resume-titre" class="uno-bloc-titre">Ta partie</h2>
          <dl class="uno-resume-liste">
            ${ligne('nom', 'Nom')}
            ${ligne('hote', 'Hôte')}
            ${ligne('places', 'Places')}
            ${ligne('visibilite', 'Visibilité')}
            ${ligne('invites', 'Invités')}
            ${ligne('tour', 'Tour')}
            ${ligne('mode', 'Mode')}
            ${ligne('variantes', 'Variantes')}
            ${ligne('discord', 'Discord')}
          </dl>
          <p class="uno-creer-erreur" data-erreur role="alert" hidden></p>
          <button type="submit" class="btn btn-primary uno-creer-bouton" data-envoyer>Créer la partie</button>
          <p class="uno-aide uno-centre">Un code de partie est créé avec la partie.</p>
        </aside>
      </div>
    </form>`;

  const form = root.querySelector('#uno-creer');
  const champNom = root.querySelector('#uno-nom');
  const curseur = root.querySelector('#uno-places');
  const sortie = root.querySelector('#uno-places-val');
  const erreurEl = root.querySelector('[data-erreur]');
  const bouton = root.querySelector('[data-envoyer]');
  let occupe = false;

  /** Affiche ou efface le message d'erreur du formulaire. */
  const erreur = (msg) => { erreurEl.textContent = msg; erreurEl.hidden = !msg; };

  // Spectateurs (migration 214) : seulement pour une partie publique.
  const reglageSpect = root.querySelector('[data-sp-reglage]');
  const majTout = () => {
    const p = lire(form);
    reglageSpect.hidden = p.visibilite === 'privee';
    majResume(root, p, pseudo);
  };
  curseur.addEventListener('input', () => { sortie.textContent = curseur.value; });
  form.addEventListener('input', majTout);
  form.addEventListener('change', majTout);

  /** Envoi : création côté serveur, annonce Discord facultative, puis salle d'attente. */
  async function envoyer(e) {
    e.preventDefault();
    if (occupe) return;
    const p = lire(form);
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
      const code = await uno.creer({
        nom: p.nom,
        nb_places: p.nb_places,
        visibilite: p.visibilite,
        invites: p.invites,
        spectateurs: p.spectateurs,   // sans effet tant que la partie est privée
        t_tour: p.t_tour,
        mode: p.mode,
        variantes: p.variantes,
        annonce_discord: p.annonce_discord,
      });
      if (!code) throw new Error('La partie est créée, mais son code est introuvable. Recharge la page.');
      if (p.annonce_discord) {
        // L'annonce ne bloque pas la partie : une erreur Discord est ignorée.
        try { await notify('uno_party', { code }); } catch { /* sans effet */ }
      }
      naviguer(`#partie/${code}`);
    } catch (err) {
      occupe = false;
      bouton.disabled = false;
      bouton.textContent = 'Créer la partie';
      erreur(erreurTexte(err));
    }
  }
  form.addEventListener('submit', envoyer);

  sortie.textContent = curseur.value;
  majTout();
}
