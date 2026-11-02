// ===== Humane Gang — Jeux : mode spectateur (migration 214) =====
/*
 * Rôle : ce que partagent les écrans du mode spectateur (Uno, Blackjack, Monopoly, Destins ; page Jeux) : l'icône de l'œil,
 *   le compteur de spectateurs, le message « Tu regardes en spectateur », le bouton « Arrêter de regarder », les onglets
 *   Table / Spectateurs du chat d'un joueur, et les lignes des listes « En direct ».
 * Le nombre vient du serveur (etat.spectateurs.nb : spectateurs dont l'état a été relu depuis moins d'une minute).
 * Dépendances : core.js (esc), quitter.js (boutonQuitter).
 * Exporte : ICONE_OEIL, JEUX_SPECTATEURS, compteurHtml, compteurBarreHtml, messageSpectateurHtml, boutonArreterHtml,
 *   ongletsChatHtml, brancherOnglets, listeNoms, sousTitreDirect.
 */
import { esc } from './core.js';
import { boutonQuitter } from './quitter.js';

/** Icône de l'œil (maquette validée), à poser dans un conteneur qui lui donne sa taille. */
export const ICONE_OEIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

/** Jeux ouverts aux spectateurs (premier lot ; même liste que hg_spect__jeu_ok côté serveur). */
export const JEUX_SPECTATEURS = ['uno', 'blackjack', 'monopoly', 'destins'];

const nombre = (n) => Math.max(0, Math.floor(Number(n) || 0));

/** Pastille « œil + nombre » des listes (rien sous 1). */
export function compteurHtml(n) {
  const v = nombre(n);
  return v ? `<span class="sp-nb">${ICONE_OEIL}${v}<span class="visually-hidden"> spectateur${v > 1 ? 's' : ''}</span></span>` : '';
}

/** Compteur de la barre d'une table, vu par les joueurs (rien sous 1). */
export function compteurBarreHtml(n) {
  const v = nombre(n);
  if (!v) return '';
  const titre = v > 1 ? `${v} membres regardent la partie` : '1 membre regarde la partie';
  return `<span class="sp-nb sp-nb-barre" title="${titre}" data-sp-compteur>${ICONE_OEIL}${v}<span class="visually-hidden"> spectateur${v > 1 ? 's' : ''}</span></span>`;
}

/** Message sous la barre, vu par un spectateur (il se compte lui-même). */
export function messageSpectateurHtml(n) {
  const v = nombre(n);
  const suite = v > 1 ? `${v} membres regardent cette partie.` : 'Tu es seul à regarder pour l’instant.';
  return `<div class="hote-msg rb-msg sp-msg" role="status" data-sp-message>${ICONE_OEIL}<p><strong>Tu regardes en spectateur.</strong> ${suite}</p></div>`;
}

/** Bouton « Arrêter de regarder » (même allure que Quitter). */
export function boutonArreterHtml() {
  return boutonQuitter('Arrêter de regarder', { classe: 'sp-partir', attrs: 'data-sp-arreter' });
}

/**
 * Onglets du chat d'un joueur : la table (choisie au départ) et les spectateurs (lecture seule).
 * @param {string} id préfixe des identifiants (unique dans la page).
 * @returns {string}
 */
export function ongletsChatHtml(id) {
  return `<div class="sp-onglets" role="tablist" aria-label="Chats">
    <button type="button" role="tab" class="sp-onglet" id="${esc(id)}-t" aria-controls="${esc(id)}-table" aria-selected="true" data-sp-onglet="table">Table</button>
    <button type="button" role="tab" class="sp-onglet" id="${esc(id)}-s" aria-controls="${esc(id)}-spect" aria-selected="false" tabindex="-1" data-sp-onglet="spect">Spectateurs <span class="sp-onglet-nb" data-sp-onglet-nb hidden></span></button>
  </div>`;
}

/**
 * Branche les onglets : clic et flèches gauche/droite. Les panneaux portent les ids `${id}-table` et `${id}-spect`.
 * @param {HTMLElement} racine conteneur des onglets et des panneaux.
 * @param {string} id préfixe donné à ongletsChatHtml.
 * @param {(onglet: string) => void} [apres] appelé après un changement.
 * @returns {{ nb(n: number): void }} met à jour le nombre de l'onglet Spectateurs.
 */
export function brancherOnglets(racine, id, apres = () => {}) {
  const onglets = [...racine.querySelectorAll('[data-sp-onglet]')];
  const choisir = (b, focus = false) => {
    for (const o of onglets) {
      const actif = o === b;
      o.setAttribute('aria-selected', String(actif));
      o.tabIndex = actif ? 0 : -1;
      const panneau = racine.querySelector(`#${CSS.escape(`${id}-${o.dataset.spOnglet}`)}`);
      if (panneau) panneau.hidden = !actif;
    }
    if (focus) b.focus();
    apres(b.dataset.spOnglet);
  };
  onglets.forEach((b, i) => {
    b.addEventListener('click', () => choisir(b));
    b.addEventListener('keydown', (ev) => {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      ev.preventDefault();
      choisir(onglets[(i + (ev.key === 'ArrowRight' ? 1 : onglets.length - 1)) % onglets.length], true);
    });
  });
  const pastille = racine.querySelector('[data-sp-onglet-nb]');
  return {
    nb(n) {
      const v = nombre(n);
      if (!pastille) return;
      pastille.hidden = !v;
      if (pastille.textContent !== String(v)) pastille.textContent = String(v);
    },
  };
}

/** « Alice, Bruno et Chloé ». */
export function listeNoms(noms) {
  const n = (noms || []).filter(Boolean);
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} et ${n[n.length - 1]}`;
}

/**
 * Sous-titre d'une ligne « En direct » : les joueurs (ou leur nombre au-delà de 4), puis où en est la partie.
 * @param {object} d ligne de hg_uno_en_direct / hg_plat_en_direct / hg_jeux_en_direct.
 * @param {string} jeu 'uno', 'blackjack', 'monopoly', 'destins'.
 * @returns {string} texte brut (à échapper).
 */
export function sousTitreDirect(d, jeu) {
  const joueurs = d?.joueurs || [];
  const qui = joueurs.length > 4 ? `${joueurs.length} joueurs` : joueurs.join(', ');
  let ou = '';
  if (jeu === 'uno') ou = d.mode === 'points' ? 'partie en 500 points' : `manche ${Math.max(1, d.manche || 1)}`;
  else if (jeu === 'blackjack') ou = `manche ${Math.max(1, d.nb_tours || 1)} sur ${d.manches || 8}`;
  else ou = `tour ${Math.max(1, d.nb_tours || 1)}${d.tour_pseudo ? ` · ${d.tour_pseudo} joue` : ''}`;
  return [qui, ou].filter(Boolean).join(' · ');
}
