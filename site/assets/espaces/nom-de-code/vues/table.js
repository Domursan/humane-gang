// ===== Humane Gang — Nom de code : la table de jeu (#partie, partie en cours) =====
/*
 * Rôle : affiche une partie en cours. Bandeau du haut (score, équipe au tour, chrono, indice, Quitter),
 *   grille 5 × 5 de cartes-mots, actions de l'agent (proposer, valider, arrêter) ou de l'espion (indice),
 *   côté droit (ordinateur) : équipes, historique des indices, aide-mémoire de l'espion, journal, chat.
 *   Téléphone : grille pleine largeur, indice et boutons sous la grille, équipes / historique / chat dans un tiroir.
 *   La mise en page est dans assets/espaces/nom-de-code/table.css ; ici, seulement le contenu et les actions.
 *   La grille est construite une fois : chaque mise à jour change les classes et le texte des cartes existantes
 *   (le focus reste sur la même carte).
 * Signal « à toi de jouer » (son + titre d'onglet) : commun/tour-signal.js, quand je dois agir (espion qui donne l'indice,
 *   agent qui cherche). Ce signal n'est pas dupliqué : l'effet visuel « à toi » (pouls du titre, de l'indice ou des cartes)
 *   est joué en plus, à chaque passage à « à moi d'agir ».
 * Effets des vrais changements (jamais au premier état reçu) : bandeau aux couleurs de l'équipe et bannière « Au tour des… »
 *   au changement de tour ; indice en grand et son à chaque nouvel indice ; carte qui se retourne, son, et flash + secousse
 *   pour l'assassin (le texte du résultat, qui dépend de mon équipe, vient de l'écran de fin). Mise en forme : mot trop long réduit
 *   (jamais coupé). Voir vues/effets.js et nom-de-code.css. Calques et minuteurs des effets arrêtés avec la vue (arreterEffets).
 * Dépendances : core.js (esc, initials, toast), nom-de-code/api.js (ndc, erreurTexte, EQUIPES),
 *   ./chat.js (creerChat), ./effets.js (effets), commun/tour-signal.js.
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire() }.
 *   ctx = { code, naviguer, moi, suivi } ; suivi = retour de suivrePartie (rafraichir, secondesRestantes, etat).
 */
import { esc, initials, toast } from '../../../commun/core.js';
import { ndc, erreurTexte, EQUIPES } from '../api.js';
import { creerChat } from './chat.js';
import { animationsOk, son, banniere, grandIndice, flashRouge, secouer, arreterEffets } from './effets.js';
import { creerSignalTour } from '../../../commun/tour-signal.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';

const RAYON = 16;
const CIRCONFERENCE = 2 * Math.PI * RAYON;
const ECRAN_GRAND = '(min-width: 761px)';
const JOURNAL_MAX = 15;
const HEX = /^#[0-9a-f]{6}$/i;
const NOM_TYPE = { jaune: 'Jaune', rose: 'Rose', neutre: 'Neutre', assassin: 'Assassin' };

const ICONE_CHAT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"></path></svg>';
const ICONE_CHECK = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#2F7D45" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l5 5 9-10"></path></svg>';
const ICONE_PASSANT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#121212" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle><path d="M3 3l18 18"></path></svg>';
const ICONE_TETE = '<svg width="30" height="30" viewBox="0 0 24 24" fill="#F2EFEA" aria-hidden="true"><path d="M12 2a9 9 0 0 0-9 9c0 3.1 1.6 5.6 4 7v3h2v-2h2v2h2v-2h2v2h2v-3c2.4-1.4 4-3.9 4-7a9 9 0 0 0-9-9z"></path><circle cx="8.5" cy="11" r="2" fill="#111111"></circle><circle cx="15.5" cy="11" r="2" fill="#111111"></circle><path d="M12 13.5l-1 2h2z" fill="#111111"></path></svg>';
const ICONE_QUITTER = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4v16M6 5h11l-2 4 2 4H6"></path></svg>';

/** Couleur d'affichage d'un joueur : sa couleur de profil, gris pour un invité. */
const couleurJoueur = (j) => (j?.invite ? '#9A968F' : (HEX.test(j?.couleur || '') ? j.couleur : '#F2EFEA'));
/** Chrono « 0:18 », ou un tiret quand il n'y a pas de chrono. */
const chrono = (s) => (s == null ? '–' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
const ligneJournal = (j) => `<li class="ndc-journal-ligne">${esc(j.texte)}</li>`;
/** Avatar rond : photo si fournie, sinon initiales sur la couleur du membre. */
const avatar = (j) => {
  const c = couleurJoueur(j);
  const img = j?.avatar_url && !j?.invite ? `<img src="${esc(j.avatar_url)}" alt="" loading="lazy" decoding="async">` : esc(initials(j?.pseudo));
  return `<span class="ndc-av" style="--ndc-av:${c}" aria-hidden="true">${img}</span>`;
};
/** Pseudo dans sa couleur, « invité » pour un invité. */
const pseudoHtml = (j) => `<strong class="ndc-pseudo" style="color:${couleurJoueur(j)}">${esc(j?.pseudo || '?')}</strong>${j?.invite ? ' <span class="ndc-invite-tag">invité</span>' : ''}`;
/** Pastille d'équipe (texte + couleur). */
const pastille = (eq) => `<span class="ndc-eq is-${eq}">${EQUIPES[eq].nom}</span>`;
/** Libellé des essais restants d'un indice (« illimité » si le nombre est 0 ou si les 25 essais sont disponibles). */
const libelleEssais = (ind, essais) => (ind.nombre === 0 || essais === 25 ? 'illimité' : `essais restants : ${essais ?? 0}`);
/** Plus petite police d'un mot de carte : au-dessous, le mot reste coupé (mots très longs, rare). */
const POLICE_MIN = 9;

/**
 * Le texte de l'élément tient-il dans sa largeur utile ? (un mot trop long déborde : il ne passe pas à la ligne au milieu)
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function tient(el) {
  const st = getComputedStyle(el);
  const utile = el.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight);
  const r = document.createRange();
  r.selectNodeContents(el);
  return r.getBoundingClientRect().width <= utile + 0.5;
}

/**
 * Mot de carte : police réduite pas à pas (0,5 px) jusqu'à ce que le mot tienne, sans descendre sous POLICE_MIN.
 * Sans style en ligne quand le mot tient déjà (taille du design conservée).
 * @param {HTMLElement} el élément .ndc-carte-mot.
 */
function ajusterMot(el) {
  if (!el || !el.clientWidth) return;   // non visible : rien à mesurer
  el.style.fontSize = '';
  if (tient(el)) return;
  let taille = parseFloat(getComputedStyle(el).fontSize);
  while (!tient(el) && taille > POLICE_MIN) {
    taille -= 0.5;
    el.style.fontSize = `${taille}px`;
  }
}

/** Squelette statique (les zones variables sont remplies à chaque mise à jour). */
function squelette(idChat) {
  return `
  <header class="ndc-bandeau">
    <div class="ndc-score" aria-live="polite">
      <span class="ndc-score-cas is-jaune" data-score-jaune><span class="ndc-score-nom">Jaune</span><span class="ndc-score-nb"><strong data-restants-jaune>0</strong> restants</span></span>
      <span class="ndc-score-cas is-rose" data-score-rose><span class="ndc-score-nom">Rose</span><span class="ndc-score-nb"><strong data-restants-rose>0</strong> restants</span></span>
    </div>
    <p class="ndc-au-tour" data-au-tour></p>
    <div class="ndc-chrono" role="timer" aria-label="Temps restant">
      <svg class="ndc-anneau" width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="${RAYON}" fill="none" stroke="#2A2A2F" stroke-width="4"></circle>
        <circle data-anneau cx="20" cy="20" r="${RAYON}" fill="none" stroke="#E2C77E" stroke-width="4" stroke-linecap="round"
          stroke-dasharray="0 ${CIRCONFERENCE.toFixed(2)}" transform="rotate(-90 20 20)"></circle>
      </svg>
      <span class="ndc-chrono-texte" data-chrono>–</span>
      <span class="visually-hidden" aria-live="polite" data-chrono-annonce></span>
    </div>
    <button type="button" class="btn btn-ghost ndc-bouton-equipes" data-tiroir-ouvrir aria-haspopup="dialog">Équipes et historique</button>
    <button type="button" class="btn btn-ghost ndc-bouton-quitter" data-quitter>${ICONE_QUITTER}<span>Quitter</span></button>
    <button type="button" class="btn btn-ghost ndc-bouton-chat" data-chat-bouton aria-controls="${idChat}" aria-expanded="false">${ICONE_CHAT}<span class="ndc-chat-libelle">Chat</span><span class="ndc-pastille-nonlu" data-non-lus hidden></span></button>
  </header>

  <div class="ndc-corps">
    <section class="ndc-plateau" aria-label="Grille des mots">
      <div class="ndc-indice-zone" data-indice-zone></div>
      <div class="ndc-grille" role="group" aria-label="Cartes" data-grille></div>
      <div class="ndc-actions" data-actions></div>
    </section>

    <aside class="ndc-cote" aria-label="Équipes et historique">
      <div class="ndc-cote-contenu" data-cote></div>
      <section class="ndc-bloc ndc-journal-zone" aria-labelledby="ndc-journal-titre">
        <h2 class="ndc-bloc-titre" id="ndc-journal-titre">Journal</h2>
        <ol class="ndc-journal" aria-live="polite" aria-relevant="additions" data-journal></ol>
      </section>
    </aside>

    <aside class="ndc-chat" id="${idChat}" aria-label="Chat de la partie">
      <div class="ndc-chat-tete">
        <h2 class="ndc-bloc-titre">Chat</h2>
        <button type="button" class="btn btn-ghost ndc-chat-fermer" data-chat-fermer>Fermer le chat</button>
      </div>
      <div class="ndc-chat-zone" data-chat></div>
    </aside>
  </div>

  <div class="ndc-tiroir" data-tiroir hidden>
    <div class="ndc-tiroir-fond" data-tiroir-fond></div>
    <div class="ndc-tiroir-feuille" role="dialog" aria-modal="true" aria-label="Équipes, historique et chat">
      <div class="ndc-tiroir-tete">
        <h2 class="ndc-bloc-titre">Équipes et historique</h2>
        <button type="button" class="btn btn-ghost" data-tiroir-fermer>Fermer</button>
      </div>
      <div class="ndc-tiroir-cote" data-tiroir-cote></div>
    </div>
  </div>

  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de jeu dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const code = ctx.code;
  const suivi = ctx.suivi;
  const grand = window.matchMedia(ECRAN_GRAND);
  const idChat = `ndc-chat-zone-${code}`;

  const el = document.createElement('section');
  el.className = 'ndc-table';
  el.innerHTML = squelette(idChat);
  root.append(el);
  boutonReponses(el.querySelector('.ndc-bandeau'), 'codenames', () => etat?.partie?.id ?? null);

  const q = (s) => el.querySelector(s);
  const refs = {
    restantsJaune: q('[data-restants-jaune]'), restantsRose: q('[data-restants-rose]'),
    scoreJaune: q('[data-score-jaune]'), scoreRose: q('[data-score-rose]'),
    auTour: q('[data-au-tour]'), anneau: q('[data-anneau]'), chrono: q('[data-chrono]'), chronoAnnonce: q('[data-chrono-annonce]'),
    quitter: q('[data-quitter]'), chatBouton: q('[data-chat-bouton]'), chatFermer: q('[data-chat-fermer]'), nonLus: q('[data-non-lus]'),
    indiceZone: q('[data-indice-zone]'), grille: q('[data-grille]'), actions: q('[data-actions]'),
    cote: q('[data-cote]'), journal: q('[data-journal]'), annonce: q('[data-annonce]'),
    tiroir: q('[data-tiroir]'), tiroirFond: q('[data-tiroir-fond]'), tiroirFermer: q('[data-tiroir-fermer]'), tiroirCote: q('[data-tiroir-cote]'),
  };
  const chat = creerChat(q('[data-chat]'), { code, moi: ctx.moi });

  /** Cases de la grille, créées une fois : pos 0..24. */
  const cellules = Array.from({ length: 25 }, (_, pos) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ndc-carte';
    b.dataset.pos = String(pos);
    b.innerHTML = '<span class="ndc-carte-tokens" aria-hidden="true"></span><span class="ndc-carte-haut"></span><span class="ndc-carte-mot"></span>';
    refs.grille.append(b);
    return b;
  });
  refs.grille.addEventListener('click', (ev) => {
    const b = ev.target.closest('button.ndc-carte');
    if (b) surCarte(Number(b.dataset.pos));
  });

  let etat = null;
  let occupe = false;
  let dernierS;
  let journalPret = false;
  const journalVus = new Set();
  let nonLus = 0;
  let tiroirOuvert = false;
  let dernierTour;
  let monTourAvant;                                // « à moi d'agir » à l'état précédent (undefined : aucun état)
  let cleIndiceAvant = '';                         // identité de l'indice affiché (pour détecter un nouvel indice)
  let detruit = false;
  let voirChat = grand.matches;                    // ordinateur : chat visible au départ ; téléphone : fermé
  let proposition = { code: null, pos: null };     // ma proposition en mode libre (affiche « Valider »)
  let saisieIndice = { mot: '', nombre: '1' };     // garde ce qui est tapé pendant une mise à jour

  /* ---------- Lecture de l'état ---------- */

  const monId = () => etat?.moi?.user_id ?? null;
  const monEquipe = () => etat?.moi?.equipe ?? null;
  const monEspion = () => !!etat?.moi?.espion;
  const aMoi = () => !!etat?.partie && !!monEquipe() && etat.partie.tour_equipe === monEquipe();
  const estAgentAuTour = () => aMoi() && !monEspion() && etat.partie.phase === 'devine';
  const estEspionAuTour = () => aMoi() && monEspion() && etat.partie.phase === 'indice';
  const joueurPar = (uid) => etat?.joueurs?.find((j) => j.user_id === uid) || null;
  const jeAiParti = () => !!etat?.moi?.parti;
  const peutCliquer = () => !occupe && estAgentAuTour() && !jeAiParti() && etat?.partie?.statut === 'en_cours';

  /* ---------- Rendu : bandeau ---------- */

  function rendreBandeau() {
    const p = etat.partie;
    refs.restantsJaune.textContent = p.restants?.jaune ?? 0;
    refs.restantsRose.textContent = p.restants?.rose ?? 0;
    refs.scoreJaune.setAttribute('aria-label', `Jaune : ${p.restants?.jaune ?? 0} mots restants sur ${p.totaux?.jaune ?? '?'}`);
    refs.scoreRose.setAttribute('aria-label', `Rose : ${p.restants?.rose ?? 0} mots restants sur ${p.totaux?.rose ?? '?'}`);
    const eq = p.tour_equipe;
    const role = p.phase === 'indice' ? 'l\'espion réfléchit' : 'les agents cherchent';
    refs.auTour.innerHTML = eq ? `Au tour des ${EQUIPES[eq].nom === 'Rose' ? 'Roses' : 'Jaunes'} · ${role}` : '';
    refs.quitter.disabled = jeAiParti();
  }

  /** Chrono : anneau, texte ; « sans limite » en phase devine sans chrono. */
  function tic() {
    if (!etat?.partie) return;
    const s = suivi.secondesRestantes();
    if (s === dernierS) return;
    dernierS = s;
    const tour = etat.partie.phase === 'indice' ? etat.partie.t_espion : etat.partie.t_equipe;
    const sansLimite = s == null;
    refs.chrono.textContent = sansLimite ? 'sans limite' : chrono(s);
    const fraction = sansLimite || !tour ? 0 : Math.min(1, s / tour);
    refs.anneau.setAttribute('stroke-dasharray', `${(fraction * CIRCONFERENCE).toFixed(2)} ${CIRCONFERENCE.toFixed(2)}`);
    if (s === 10) refs.chronoAnnonce.textContent = 'Il reste 10 secondes.';
    if (s === 0) refs.chronoAnnonce.textContent = 'Temps écoulé.';
  }

  /* ---------- Rendu : indice en cours et actions ---------- */

  function rendreIndice() {
    const ind = etat.indice;
    const zone = refs.indiceZone;
    if (!ind) {
      zone.innerHTML = '<p class="ndc-indice-vide">Pas d\'indice pour le moment.</p>';
      return;
    }
    const reste = libelleEssais(ind, etat.partie.essais);
    zone.innerHTML = `
      <p class="ndc-indice-ligne"><span class="ndc-indice-eq">${pastille(ind.equipe)}</span>
        <strong class="ndc-indice-mot">${esc(ind.mot)} · ${ind.nombre === 0 ? '0' : esc(ind.nombre)}</strong></p>
      <p class="ndc-indice-essais">${esc(reste)}</p>`;
  }

  /** Formulaire de l'espion (phase indice) ou bouton d'arrêt / valider de l'agent. */
  function rendreActions() {
    const zone = refs.actions;
    if (occupe && zone.dataset.mode === 'occupe') return;
    if (!etat?.partie || jeAiParti() || !aMoi()) {
      const eq = etat?.partie?.tour_equipe;
      const msg = !eq ? '' : (etat.partie.phase === 'indice'
        ? `L'espion ${EQUIPES[eq].nom} réfléchit…`
        : `Les ${EQUIPES[eq].nom === 'Rose' ? 'Roses' : 'Jaunes'} cherchent…`);
      zone.dataset.mode = 'attente';
      zone.innerHTML = `<p class="ndc-attente">${esc(msg)}</p>`;
      return;
    }
    if (estEspionAuTour()) {
      zone.dataset.mode = 'indice';
      zone.innerHTML = `
        <form class="ndc-form-indice" data-form-indice novalidate>
          <div class="ndc-champ-indice">
            <label for="ndc-indice-mot-${code}">Ton indice</label>
            <input id="ndc-indice-mot-${code}" type="text" name="mot" autocomplete="off" maxlength="30" required
              placeholder="Un seul mot" value="${esc(saisieIndice.mot)}"${occupe ? ' disabled' : ''}>
          </div>
          <div class="ndc-champ-nombre">
            <label for="ndc-indice-nombre-${code}">Nombre</label>
            <select id="ndc-indice-nombre-${code}" name="nombre"${occupe ? ' disabled' : ''}>
              ${Array.from({ length: 10 }, (_, n) => `<option value="${n}"${String(n) === saisieIndice.nombre ? ' selected' : ''}>${n === 0 ? '0 (illimité)' : n}</option>`).join('')}
            </select>
          </div>
          <button type="submit" class="btn btn-primary ndc-bouton-indice"${occupe ? ' disabled' : ''}>Donner l'indice</button>
        </form>`;
      return;
    }
    if (estAgentAuTour()) {
      const libre = etat.partie.validation === 'libre';
      const arretOk = (etat.indice?.mots?.length || 0) > 0;
      // Ma proposition, lue dans l'état serveur (survit à un rechargement)
      const moiPos = (etat.cartes || []).findIndex((c) => !c.revelee && c.propositions?.includes(monId()));
      proposition = moiPos >= 0 ? { code, pos: moiPos } : { code: null, pos: null };
      zone.dataset.mode = 'agent';
      zone.innerHTML = `
        <p class="ndc-consigne">${etat.indice ? 'Clique sur un mot. Re-clique pour retirer ton jeton.' : 'En attente de l\'indice.'}</p>
        <div class="ndc-agent-boutons">
          ${libre && proposition.pos != null ? `<button type="button" class="btn btn-primary ndc-bouton-valider" data-valider${occupe ? ' disabled' : ''}>Valider ${esc(etat.cartes?.[proposition.pos]?.mot || '')}</button>` : ''}
          <button type="button" class="btn btn-ghost ndc-bouton-arreter" data-arreter${(!arretOk || occupe) ? ' disabled' : ''}>On s'arrête</button>
        </div>`;
      return;
    }
    zone.dataset.mode = 'attente';
    zone.innerHTML = '';
  }

  /* ---------- Rendu : grille ---------- */

  /** Les jetons de proposition d'une carte : avatars (initiales) ; le mien en premier et mis en évidence. */
  function jetonsHtml(carte) {
    const uids = carte.propositions || [];
    if (!uids.length) return '';
    const liste = [...uids].sort((a, b) => (a === monId() ? -1 : b === monId() ? 1 : 0));
    return liste.map((uid) => {
      const j = joueurPar(uid);
      const moi = uid === monId();
      return `<span class="ndc-jeton${moi ? ' is-moi' : ''}" style="--ndc-av:${couleurJoueur(j)}" title="${esc(j?.pseudo || '?')}${moi ? ' (toi)' : ''}"><span class="visually-hidden">${esc(j?.pseudo || '?')}${moi ? ' (toi)' : ''}</span><span aria-hidden="true">${esc(initials(j?.pseudo))}</span></span>`;
    }).join('');
  }

  /** Cases en cours de retournement → dernière carte reçue (elles seront peintes à la fin du retournement). */
  const enRetournement = new Map();

  /** Son d'une carte révélée : 2 équipe, 3 passant, 4 assassin. */
  const sonRevelation = (carte) => son(carte.couleur === 'assassin' ? 4 : carte.couleur === 'neutre' ? 3 : 2);

  /**
   * Retourne une case qui vient d'être révélée : elle se couche (ancien aspect), change de couleur au milieu du mouvement,
   * puis se relève. Pour l'assassin, flash rouge et secousse de la grille à la fin du mouvement.
   * @param {HTMLElement} b case.
   * @param {object} carte carte révélée.
   */
  function retournerCase(b, carte) {
    enRetournement.set(b, carte);
    b.classList.add('ndc-fx-retourne');
    setTimeout(() => {
      if (detruit) return;
      const c = enRetournement.get(b);
      enRetournement.delete(b);
      b.classList.remove('ndc-fx-retourne');
      b.dataset.revelee = '1';
      peindreCase(b, c);
      b.classList.add('ndc-fx-revient');
      setTimeout(() => b.classList.remove('ndc-fx-revient'), 380);
      if (c.couleur === 'assassin') {
        flashRouge();
        secouer(refs.grille);
      }
    }, 260);
  }

  /** Met à jour une case existante (aucune recréation : le focus reste en place). */
  function peindreCase(b, carte) {
    if (enRetournement.has(b)) { enRetournement.set(b, carte); return; }
    // Vraie révélation (la case était cachée à l'état précédent) : son, puis retournement si les animations sont permises.
    if (carte.revelee && b.dataset.revelee === '0') {
      sonRevelation(carte);
      if (animationsOk()) { retournerCase(b, carte); return; }
    }
    const espion = monEspion() && !jeAiParti();
    const revelee = !!carte.revelee;
    const couleur = carte.couleur;                                  // connue si revelee ou si je suis espion
    const teinte = couleur && (revelee || espion) ? couleur : null;
    const estMoi = carte.propositions?.includes(monId());
    const classes = ['ndc-carte'];
    if (revelee) classes.push('is-revelee');
    if (teinte) classes.push(`is-${teinte}`);
    if (!revelee && !espion) classes.push('is-cache');
    if (espion && !revelee) classes.push('is-espion');
    if (estMoi) classes.push('is-ma-proposition');
    // Retournement discret quand la carte vient d'être révélée (coupé par ndc-calme / reduced-motion en CSS)
    if (revelee && b.dataset.revelee !== '1') { if (b.dataset.revelee === '0') classes.push('is-tourne'); }
    b.dataset.revelee = revelee ? '1' : '0';
    if (teinte === 'assassin') classes.push('is-assassin');
    if (teinte === 'neutre') classes.push('is-passant');
    // Les classes d'effet (ndc-fx-*) en cours sont gardées : un nouvel affichage ne coupe pas une animation.
    const fx = [...b.classList].filter((c) => c.startsWith('ndc-fx-'));
    const voulues = [...classes, ...fx].join(' ');
    if (b.className !== voulues) b.className = voulues;

    const cliquable = !revelee && peutCliquer();
    b.disabled = !cliquable;
    b.setAttribute('aria-disabled', String(!cliquable));

    const nomEq = teinte && teinte !== 'neutre' && teinte !== 'assassin' ? EQUIPES[teinte].nom : (teinte ? NOM_TYPE[teinte] : null);
    let libelle = carte.mot;
    if (revelee && teinte === 'assassin') libelle += ', assassin';
    else if (revelee && teinte === 'neutre') libelle += ', passant';
    else if (revelee && nomEq) libelle += `, mot de l'équipe ${nomEq}`;
    else if (espion && teinte) libelle += `, mot ${teinte === 'assassin' ? 'assassin' : `de l'équipe ${nomEq}`}`;
    if (estMoi) libelle += ', ta proposition';
    if (carte.propositions?.length) libelle += `, ${carte.propositions.length} jeton${carte.propositions.length > 1 ? 's' : ''}`;
    b.setAttribute('aria-label', libelle);

    b.querySelector('.ndc-carte-tokens').innerHTML = jetonsHtml(carte);
    const haut = b.querySelector('.ndc-carte-haut');
    let texteHaut = '';
    if (revelee && teinte === 'assassin') texteHaut = '<span class="ndc-carte-icone">' + ICONE_TETE + '</span><span class="visually-hidden">Assassin</span>';
    else if (revelee && teinte === 'neutre') texteHaut = `<span class="ndc-carte-icone">${ICONE_PASSANT}</span><span class="visually-hidden">Passant</span>`;
    else if (revelee && nomEq) texteHaut = `<span class="ndc-carte-etiq">${ICONE_CHECK}${nomEq}</span>`;
    else if (espion && teinte === 'assassin') texteHaut = `<span class="ndc-carte-icone ndc-carte-icone-fond">${ICONE_TETE}</span>`;
    else if (espion && teinte) texteHaut = `<span class="ndc-carte-etiq ndc-carte-etiq-fond">${nomEq}</span>`;
    if (haut.innerHTML !== texteHaut) haut.innerHTML = texteHaut;

    const mot = b.querySelector('.ndc-carte-mot');
    if (mot.textContent !== carte.mot) {
      mot.textContent = carte.mot;
      ajusterMot(mot);
    }
  }

  /** Recalcule la police de tous les mots (taille de l'écran ou police web chargée). */
  const recalculerMots = () => cellules.forEach((b) => ajusterMot(b.querySelector('.ndc-carte-mot')));

  function rendreGrille() {
    const cartes = etat.cartes || [];
    cellules.forEach((b, pos) => {
      const carte = cartes[pos];
      if (carte) peindreCase(b, carte);
    });
  }

  /** Bouton « Valider » en mode libre : seule la carte proposée par moi. */
  function surCarte(pos) {
    if (!peutCliquer()) return;
    const carte = etat.cartes?.[pos];
    if (!carte || carte.revelee) return;
    const dejaMoi = carte.propositions?.includes(monId());
    if (dejaMoi) {
      proposition = { code: null, pos: null };
      agir(() => ndc.proposer(code, null));
    } else {
      proposition = { code: code, pos };
      agir(() => ndc.proposer(code, pos));
    }
  }

  /* ---------- Rendu : côté (ordinateur) et tiroir (téléphone) ---------- */

  /** Liste d'une équipe : espion marqué, agents, joueurs partis grisés. */
  function listeEquipe(eq) {
    const membres = (etat.joueurs || []).filter((j) => j.equipe === eq);
    const espion = membres.filter((j) => j.espion);
    const agents = membres.filter((j) => !j.espion);
    const ligne = (j, role) => `<li class="ndc-membre${j.parti ? ' is-parti' : ''}">${avatar(j)}<span class="ndc-membre-nom">${pseudoHtml(j)}${role === 'espion' ? ' <span class="ndc-tag-espion">Espion</span>' : ''}${j.parti ? ' <span class="ndc-tag-parti">parti</span>' : ''}</span>${role === 'espion' ? '' : `<span class="visually-hidden">, ${role}</span>`}</li>`;
    const corps = [
      ...espion.map((j) => ligne(j, 'espion')),
      ...agents.map((j) => ligne(j, 'agent')),
    ].join('') || '<li class="ndc-vide">Personne pour l\'instant.</li>';
    return `
      <section class="ndc-equipe is-${eq}" aria-label="Équipe ${EQUIPES[eq].nom}">
        <h3 class="ndc-equipe-titre">${EQUIPES[eq].nom}${eq === monEquipe() ? ' · ton équipe' : ''}</h3>
        <ul class="ndc-membres">${corps}</ul>
      </section>`;
  }

  /** Historique des indices et, pour l'espion, l'aide-mémoire des mots de son équipe encore à trouver. */
  function historiqueHtml() {
    const liste = etat.indices || [];
    const lignes = liste.map((i) => `<li><strong>${pastille(i.equipe)} ${esc(i.mot)} ${i.nombre === 0 ? '0' : esc(i.nombre)}</strong>${i.mots?.length ? ' → ' + i.mots.map((m) => esc(m)).join(', ') : ''}</li>`).join('');
    return `<section class="ndc-bloc ndc-histo" aria-labelledby="ndc-histo-titre">
      <h2 class="ndc-bloc-titre" id="ndc-histo-titre">Historique des indices</h2>
      <ul class="ndc-histo-liste">${lignes || '<li class="ndc-vide">Aucun indice pour l\'instant.</li>'}</ul>
    </section>`;
  }

  function aideMemoire() {
    if (!monEspion() || !monEquipe()) return '';
    const mots = (etat.cartes || []).filter((c) => c.couleur === monEquipe() && !c.revelee).map((c) => c.mot);
    return `<section class="ndc-bloc ndc-aide" aria-labelledby="ndc-aide-titre">
      <h2 class="ndc-bloc-titre" id="ndc-aide-titre">Mots de ton équipe encore à trouver</h2>
      <p class="ndc-aide-liste">${mots.length ? mots.map((m) => esc(m)).join(' · ') : 'Tous trouvés.'}</p>
    </section>`;
  }

  /** Contenu des équipes et de l'historique : rendu une fois dans le côté, une fois dans le tiroir. */
  function contenuCote() {
    return `${listeEquipe('jaune')}${listeEquipe('rose')}${aideMemoire()}${historiqueHtml()}`;
  }

  function rendreCote() {
    const html = contenuCote();
    if (refs.cote.dataset.h !== html) { refs.cote.innerHTML = html; refs.cote.dataset.h = html; }
    if (tiroirOuvert) {
      refs.tiroirCote.innerHTML = html;
    }
  }

  /** Journal : les nouvelles lignes seulement (aria-relevant=additions). */
  function rendreJournal() {
    const liste = etat.journal || [];
    if (!journalPret) {
      refs.journal.innerHTML = liste.map(ligneJournal).join('');
      liste.forEach((j) => journalVus.add(j.id));
      journalPret = true;
      return;
    }
    const nouveaux = liste.filter((j) => !journalVus.has(j.id)).reverse();
    for (const j of nouveaux) {
      refs.journal.insertAdjacentHTML('afterbegin', ligneJournal(j));
      journalVus.add(j.id);
    }
    while (refs.journal.children.length > JOURNAL_MAX) refs.journal.lastElementChild.remove();
  }

  /* ---------- Chat et tiroir (téléphone) ---------- */

  function peindreNonLus() {
    refs.nonLus.hidden = nonLus === 0;
    refs.nonLus.textContent = String(nonLus);
    refs.chatBouton.setAttribute('aria-label', nonLus ? `Chat, ${nonLus} non lu${nonLus > 1 ? 's' : ''}` : 'Chat');
  }

  function ouvrirTiroir() {
    if (grand.matches) return;
    tiroirOuvert = true;
    refs.tiroir.hidden = false;
    refs.tiroirCote.innerHTML = refs.cote.innerHTML;
    el.classList.add('tiroir-ouvert');
    refs.tiroirFermer.focus();
  }

  function fermerTiroir() {
    if (!tiroirOuvert) return;
    tiroirOuvert = false;
    refs.tiroir.hidden = true;
    refs.tiroirCote.innerHTML = '';
    el.classList.remove('tiroir-ouvert');
    refs.chatBouton.focus();
  }

  /** Ordinateur : affiche ou masque le chat (colonne de droite). Téléphone : ouvre ou ferme le volet. */
  function peindreChat() {
    if (grand.matches) el.classList.toggle('chat-masque', !voirChat);
    else el.classList.toggle('chat-ouvert', voirChat);
    refs.chatBouton.setAttribute('aria-expanded', String(voirChat));
    refs.chatBouton.querySelector('.ndc-chat-libelle').textContent = voirChat ? 'Fermer le chat' : 'Chat';
    if (voirChat) { nonLus = 0; peindreNonLus(); }
  }
  function surBoutonChat() {
    voirChat = !voirChat;
    peindreChat();
  }

  /* ---------- Actions ---------- */

  /** Lance une action serveur : une seule à la fois, erreurs en toast, puis relecture de l'état. */
  async function agir(fn) {
    if (occupe) return;
    occupe = true;
    rendreActions();
    rendreGrille();
    try {
      await fn();
    } catch (e) {
      toast(erreurTexte(e), 'error');
    } finally {
      occupe = false;
      rendreActions();
      rendreGrille();
      suivi.rafraichir();
    }
  }

  function surActions(ev) {
    const v = ev.target.closest('[data-valider],[data-arreter]');
    if (!v || occupe) return;
    if (v.hasAttribute('data-valider') && proposition.pos != null) {
      const pos = proposition.pos;
      proposition = { code: null, pos: null };
      agir(() => ndc.valider(code, pos));
    } else if (v.hasAttribute('data-arreter')) {
      agir(() => ndc.arreter(code));
    }
  }

  function surIndice(ev) {
    ev.preventDefault();
    if (occupe) return;
    const f = ev.target;
    const mot = (f.elements.mot.value || '').trim();
    const nombre = Number(f.elements.nombre.value || 0);
    saisieIndice = { mot, nombre: String(nombre) };
    if (!mot || /\s/.test(mot)) { toast('Ton indice tient en un seul mot, sans espace.', 'error'); return; }
    occupe = true;
    rendreActions();
    ndc.indice(code, mot, nombre)
      .then(() => { saisieIndice = { mot: '', nombre: '1' }; })
      .catch((e) => toast(erreurTexte(e), 'error'))
      .finally(() => { occupe = false; rendreActions(); suivi.rafraichir(); });
  }

  function surQuitter() {
    if (occupe) return;
    if (!confirm('Quitter la partie ? Tu ne pourras plus jouer dans cette manche.')) return;
    agir(() => ndc.quitter(code));
  }

  /* ---------- Écouteurs ---------- */

  refs.quitter.addEventListener('click', surQuitter);
  q('[data-tiroir-ouvrir]').addEventListener('click', ouvrirTiroir);
  refs.chatBouton.addEventListener('click', surBoutonChat);
  refs.chatFermer.addEventListener('click', () => {
    voirChat = false;
    peindreChat();
    refs.chatBouton.focus();
  });
  grand.addEventListener('change', () => { voirChat = grand.matches; peindreChat(); });
  refs.tiroirFermer.addEventListener('click', fermerTiroir);
  refs.tiroirFond.addEventListener('click', fermerTiroir);
  refs.tiroir.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fermerTiroir(); });
  refs.actions.addEventListener('click', surActions);
  refs.actions.addEventListener('submit', surIndice);
  refs.actions.addEventListener('input', (ev) => {
    if (ev.target.name === 'mot') saisieIndice.mot = ev.target.value;
  });

  /* ---------- Contrat de la vue ---------- */

  peindreNonLus();
  peindreChat();
  window.addEventListener('resize', recalculerMots);
  // La police web peut arriver après le premier calcul : on recalcule quand elle est prête.
  document.fonts?.ready?.then(recalculerMots);
  const minuterie = setInterval(tic, 250);
  const signal = creerSignalTour();

  /** Changement de tour : bandeau aux couleurs de l'équipe qui joue et bannière « Au tour des… » (2,5 s). */
  function effetChangementTour(eq) {
    if (!animationsOk()) return;
    banniere(`Au tour des ${EQUIPES[eq].nom === 'Rose' ? 'Roses' : 'Jaunes'}`, 'Changement d’équipe', eq);
    const bandeau = el.querySelector('.ndc-bandeau');
    if (!bandeau) return;
    bandeau.style.setProperty('--ndc-fx-c', `var(--ndc-${eq})`);
    bandeau.style.setProperty('--ndc-fx-t', eq === 'jaune' ? '#2A1C00' : '#FFFFFF');
    bandeau.classList.add('ndc-fx-equipe');
    setTimeout(() => {
      bandeau.classList.remove('ndc-fx-equipe');
      bandeau.style.removeProperty('--ndc-fx-c');
      bandeau.style.removeProperty('--ndc-fx-t');
    }, 2600);
  }

  /** « À toi » : titre « Au tour… » et formulaire d'indice qui pulsent (espion), ou cartes cachées qui s'éclairent (agent). */
  function effetATo() {
    if (!animationsOk()) return;
    const pulse = (node, cls) => {
      if (!node) return;
      node.classList.add(cls);
      setTimeout(() => node.classList.remove(cls), 2600);
    };
    pulse(el.querySelector('.ndc-au-tour'), 'ndc-fx-pouls');
    if (estEspionAuTour()) pulse(el.querySelector('.ndc-form-indice'), 'ndc-fx-pouls');
    else el.querySelectorAll('.ndc-carte:not(.is-revelee):not(:disabled)').forEach((b) => pulse(b, 'ndc-fx-libre'));
  }

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      const prec = etat;                           // état précédent : null au premier état (rien n'est animé)
      etat = e;
      rendreBandeau();
      rendreIndice();
      rendreActions();
      rendreGrille();
      rendreCote();
      rendreJournal();
      // Annonce du changement de tour (sans l'annoncer à l'ouverture).
      const tour = e.partie.tour_equipe;
      if (tour !== dernierTour && dernierTour !== undefined && tour) {
        refs.annonce.textContent = `Au tour des ${EQUIPES[tour].nom === 'Rose' ? 'Roses' : 'Jaunes'}.`;
        if (prec) effetChangementTour(tour);
      }
      dernierTour = tour;
      chat.maj(e);
      // J'ai à agir : espion au tour de donner l'indice, ou agent au tour de chercher (pas si je suis parti).
      const monTour = !jeAiParti() && e.partie.statut === 'en_cours' && (estEspionAuTour() || estAgentAuTour());
      signal.maj(monTour);
      if (prec && monTour && !monTourAvant) effetATo();
      monTourAvant = monTour;
      // Nouvel indice (identité : rang dans l'historique + mot, nombre, équipe) : en grand et son, sauf pour l'espion qui l'a donné.
      const cle = e.indice ? `${(e.indices || []).length}|${e.indice.equipe}|${e.indice.mot}|${e.indice.nombre}` : '';
      if (prec && cle && cle !== cleIndiceAvant && !monEspion()) {
        grandIndice(e.indice.mot, libelleEssais(e.indice, e.partie.essais));
        son(1);
      }
      cleIndiceAvant = cle;
      tic();
    },
    /** Message du chat (ancien ou nouveau). */
    message(msg) {
      chat.ajouter(msg);
      if (!voirChat && msg?.user_id !== monId()) { nonLus += 1; peindreNonLus(); }
    },
    /** Arrête le chrono et retire la table de la page. */
    detruire() {
      detruit = true;
      clearInterval(minuterie);
      arreterEffets();
      window.removeEventListener('resize', recalculerMots);
      signal.arreter();
      chat.detruire();
      el.remove();
    },
  };
}
