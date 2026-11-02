// ===== Humane Gang — Jeux de plateau : aides partagées par toutes les tables =====
/*
 * Rôle : petites fonctions communes à Cluedo, Shadow Hunters, Destins, Monopoly et Risk (avatars, pseudos,
 * bandeau du haut de table, chrono, journal, envoi sécurisé, lecture de l'état).
 * Les signatures sont fixes : les tables (/assets/espaces/plateaux/jeux/<jeu>/table.js) les importent telles quelles.
 * Dépendances : core.js (esc, avatarHtml, toast), plateaux/api.js (jeu, erreurTexte), commun/effets-duels.js (creerTicChrono).
 * Exporte : avatarHtml, pseudoHtml, couleurPseudo, texteSur, joueurDe, bandeauHtml, brancherChrono, journalHtml, imagePlateau,
 *           envoyer, moiJoueur, estMonTour.
 */
import { esc, avatarHtml as avatarCore, toast } from '../../../commun/core.js';
import { erreurTexte } from '../api.js';
import { creerTicChrono } from '../../../commun/effets-duels.js';
import { DEPART, ACTION_EN_COURS, confirmerDepart, tableLibre } from '../../../commun/quitter.js';

const GRIS_INVITE = '#9A968F';
const COULEUR = /^#[0-9a-f]{6}$/i;
/** Contraste minimal du texte (WCAG AA, texte courant). */
const CONTRASTE_MIN = 4.5;
/** Fonds de lecture par défaut (sombre) si le thème ne donne pas de couleurs lisibles. */
const FONDS_DEFAUT = ['#0E0E10', '#17171A', '#1F1F23'];

/** Luminance relative WCAG (0 à 1) d'une couleur #rrggbb. */
function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Rapport de contraste WCAG entre deux couleurs #rrggbb. */
function contraste(a, b) {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Mélange deux couleurs #rrggbb : k part de b, le reste de a. */
function melange(a, b, k) {
  const [ca, cb] = [a, b].map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return '#' + ca.map((v, i) => Math.round(v + (cb[i] - v) * k).toString(16).padStart(2, '0')).join('');
}
/**
 * Fonds sur lesquels les pseudos sont lus : les couleurs de surface du thème en cours (fond, carte, carte claire),
 * et ces mêmes surfaces sous la teinte du tour (--plat-tour à 12 %, bandeau du joueur dont c'est le tour).
 * @returns {string[]} couleurs #rrggbb.
 */
function fondsLecture() {
  const st = getComputedStyle(document.documentElement);
  const surfaces = ['--bg', '--surface', '--surface-2'].map((v) => st.getPropertyValue(v).trim().toLowerCase()).filter((c) => COULEUR.test(c));
  if (!surfaces.length) return FONDS_DEFAUT;
  const tour = st.getPropertyValue('--plat-tour').trim().toLowerCase();
  const teintes = COULEUR.test(tour) ? [tour] : [];
  return [...surfaces, ...surfaces.flatMap((s) => teintes.map((t) => melange(s, t, 0.12)))];
}

/**
 * Couleur d'un pseudo, éclaircie (fond sombre) ou assombrie (fond clair) jusqu'à 4,5:1 sur tous les fonds de lecture.
 * La couleur du membre reste reconnaissable : on ne fait que la rapprocher du blanc ou du noir.
 * @param {string} hex couleur #rrggbb du membre.
 * @returns {string} #rrggbb.
 */
export function couleurPseudo(hex) {
  const fonds = fondsLecture();
  if (fonds.every((f) => contraste(hex, f) >= CONTRASTE_MIN)) return hex;
  const cible = fonds.every((f) => luminance(f) < 0.18) ? 255 : 0;
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const m = '#' + c.map((v) => Math.round(v + (cible - v) * t).toString(16).padStart(2, '0')).join('');
    if (fonds.every((f) => contraste(m, f) >= CONTRASTE_MIN)) return m;
  }
  return cible ? '#ffffff' : '#000000';
}

/**
 * Texte lisible sur une pastille de couleur de fond : noir ou blanc, le plus contrasté (au moins 4,5:1 pour toute couleur).
 * @param {string} fond couleur #rrggbb de la pastille.
 * @returns {string} #121212 ou #ffffff.
 */
export function texteSur(fond) {
  if (!COULEUR.test(fond || '')) return '#121212';
  return contraste(fond, '#121212') >= contraste(fond, '#ffffff') ? '#121212' : '#ffffff';
}

/**
 * Rond avec initiales (ou image avatar_url), fond j.couleur ; gris pour un invité.
 * @param {object} j joueur de etat.joueurs.
 * @param {number} [taille=32] côté en pixels.
 * @returns {string} HTML.
 */
export function avatarHtml(j, taille = 32) {
  return avatarCore({
    pseudo: j?.pseudo,
    color: j?.invite ? '#3A3A40' : j?.couleur,
    avatar_url: j?.invite ? null : j?.avatar_url,
  }, taille);
}

/**
 * Pseudo dans la couleur du joueur ; gris et « invité » pour un invité.
 * @param {object} j joueur.
 * @returns {string} HTML (<span class="plat-pseudo">).
 */
export function pseudoHtml(j) {
  const couleur = couleurPseudo(j?.invite ? GRIS_INVITE : (COULEUR.test(j?.couleur || '') ? j.couleur : '#F2EFEA'));
  const tag = j?.invite ? ' <span class="plat-invite">invité</span>' : '';
  return `<span class="plat-pseudo" style="color:${couleur}">${esc(j?.pseudo || '?')}${tag}</span>`;
}

/**
 * Joueur de etat.joueurs qui a cet identifiant.
 * @param {object} etat état renvoyé par plat.etat.
 * @param {string} userId identifiant du membre.
 * @returns {object|null}
 */
export function joueurDe(etat, userId) {
  return (etat?.joueurs || []).find((j) => j.user_id === userId) || null;
}

/** Mm:ss pour un nombre de secondes. */
function formatChrono(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Barre du haut de table : nom du jeu, code, tour n°, joueurs (tour en cours, éliminés, absents), chrono.
 * @param {object} etat état de la partie.
 * @param {{ titre?: string, sousTitre?: string }} [opts] titre affiché et sous-titre facultatif.
 * @returns {string} HTML (<header class="plat-bandeau">).
 */
export function bandeauHtml(etat, { titre = '', sousTitre = '' } = {}) {
  const p = etat?.partie || {};
  const moiId = etat?.moi?.user_id;
  const joueurs = (etat?.joueurs || []).filter((j) => !j.parti);
  const liste = joueurs.map((j) => {
    const tour = !!p.tour && p.tour === j.user_id;
    const estMoi = !!moiId && j.user_id === moiId;
    const classes = ['plat-bandeau-joueur'];
    if (tour) classes.push('is-tour');
    if (j.elimine) classes.push('is-elimine');
    const etiquettes = [];
    if (tour) etiquettes.push(`<span class="plat-etiquette is-tour">${estMoi ? 'À toi de jouer' : 'Son tour'}</span>`);
    if (j.absent) etiquettes.push('<span class="plat-etiquette">absent</span>');
    return `<li class="${classes.join(' ')}"${tour ? ' aria-current="step"' : ''}>
      ${avatarHtml(j, 28)}
      <span class="plat-bandeau-nom">${j.elimine ? `<s>${pseudoHtml(j)}</s>` : pseudoHtml(j)}${j.elimine ? ' <span class="plat-etiquette">éliminé</span>' : ''}</span>
      ${etiquettes.join('')}
    </li>`;
  }).join('');
  return `<header class="plat-bandeau">
    <div class="plat-bandeau-tete">
      <div class="plat-bandeau-titres">
        <p class="plat-bandeau-jeu small muted">${esc(p.nom_jeu || '')} · <span class="plat-code">${esc(p.code || '')}</span> · Tour n° ${esc(p.nb_tours ?? 0)}</p>
        <h1 class="plat-bandeau-titre display">${esc(titre || p.nom || '')}</h1>
        ${sousTitre ? `<p class="plat-bandeau-sous small muted">${esc(sousTitre)}</p>` : ''}
      </div>
      <span class="plat-chrono" data-chrono></span>
    </div>
    <ul class="plat-bandeau-joueurs" aria-label="Joueurs">${liste}</ul>
  </header>`;
}

/**
 * Met à jour chaque [data-chrono] de root (m:ss ; vide si pas de tour ; classe is-urgent sous 10 s).
 * À mon tour, tic discret à 5 s et moins (CH2, S14 et S15), une fois par seconde même si le chrono repeint plus souvent.
 * @param {HTMLElement} root zone contenant les chronos.
 * @param {{ secondesRestantes: Function }} suivi objet renvoyé par suivrePartie.
 * @returns {Function} fonction d'arrêt (à appeler au nettoyage).
 */
export function brancherChrono(root, suivi) {
  const ticChrono = creerTicChrono();
  const maj = () => {
    const s = suivi?.secondesRestantes?.();
    const e = suivi?.etat?.();
    ticChrono(s, estMonTour(e), e?.partie?.tour_fin, root.querySelector('[data-chrono]'));
    root.querySelectorAll('[data-chrono]').forEach((el) => {
      if (s == null) {
        el.textContent = '';
        el.classList.remove('is-urgent');
        return;
      }
      el.textContent = formatChrono(s);
      el.classList.toggle('is-urgent', s < 10);
    });
  };
  maj();
  const t = setInterval(maj, 500);
  return () => clearInterval(t);
}

/**
 * Dernières lignes du journal : lignes privées marquées « pour toi » dans un style distinct.
 * @param {Array<{texte: string, prive?: boolean, type?: string}>} journal lignes, du plus récent.
 * @param {object} [etat] état courant (accepté pour la signature commune ; le filtrage privé est fait par le serveur).
 * @returns {string} HTML (<ul class="plat-journal">).
 */
export function journalHtml(journal, etat) { // eslint-disable-line no-unused-vars
  const lignes = Array.isArray(journal) ? journal : [];
  if (!lignes.length) return '<p class="plat-journal-vide small muted">Rien pour l\'instant.</p>';
  return `<ul class="plat-journal" aria-label="Journal de la partie">${lignes.map((l) => `<li class="plat-journal-ligne${l.prive ? ' is-prive' : ''}">
      ${l.prive ? '<span class="plat-journal-tag">pour toi</span> ' : ''}<span class="plat-journal-texte">${esc(l.texte)}</span>
    </li>`).join('')}</ul>`;
}

/**
 * Chemin d'un visuel de plateau (visuels fournis plus tard).
 * @param {string} jeuId cluedo | shadow | destins | monopoly | risk.
 * @param {string} nom nom du fichier sans extension.
 * @returns {string} chemin relatif.
 */
export function imagePlateau(jeuId, nom) {
  return `/assets/images/plateaux/${jeuId}/${nom}.webp`;
}

/** Suivis (une table = un suivi) dont un envoi ou sa relecture est en cours : pas de second envoi. */
const envoisEnCours = new WeakSet();

/**
 * Désactive le bouton, exécute fn, affiche une erreur en toast, puis relit l'état et n'autorise un nouvel envoi
 * qu'une fois la relecture terminée (sinon la table serait reconstruite depuis un état périmé).
 * Un envoi déjà en cours sur la même table est ignoré.
 * @param {HTMLButtonElement} bouton bouton à désactiver pendant l'envoi.
 * @param {Function} fn action asynchrone (appel plat.*).
 * @param {{ rafraichir: Function }} suivi objet renvoyé par suivrePartie.
 * @returns {Promise<boolean>} vrai si l'action a réussi (faux aussi si l'envoi a été ignoré).
 */
export async function envoyer(bouton, fn, suivi) {
  if (suivi && envoisEnCours.has(suivi)) return false;
  if (suivi) envoisEnCours.add(suivi);
  if (bouton) bouton.disabled = true;
  let ok = true;
  try {
    await fn();
  } catch (e) {
    ok = false;
    toast(erreurTexte(e), 'error');
  } finally {
    try {
      await suivi?.rafraichir?.();
    } finally {
      if (suivi) envoisEnCours.delete(suivi);
      if (bouton) bouton.disabled = false;
    }
  }
  return ok;
}

/**
 * Partir d'une partie en cours : la fenêtre commune, puis l'envoi. Le bouton est lu avant l'attente (l'événement ne le garde pas).
 * @param {HTMLButtonElement} bouton bouton Quitter de la table.
 * @param {Function} fn appelle plat.quitter.
 * @param {object} suivi suivi de la partie.
 * @param {{titre: string, texte: string, ok: string}} [cas] phrase propre au jeu (poker).
 * @returns {Promise<boolean>} vrai si le départ a été envoyé.
 */
export async function quitterPartie(bouton, fn, suivi, cas = DEPART.plateau) {
  if (!await confirmerDepart(cas)) return false;
  if (!await tableLibre(() => envoisEnCours.has(suivi))) { toast(ACTION_EN_COURS, 'error'); return false; }
  const ok = await envoyer(bouton, fn, suivi);
  // envoyer rend le bouton actif après la relecture, donc après le rendu de la table : parti, il reste éteint.
  if (ok && bouton) bouton.disabled = true;
  return ok;
}

/**
 * Mon joueur dans l'état (null si je ne joue pas).
 * @param {object} etat état de la partie.
 * @returns {object|null}
 */
export function moiJoueur(etat) {
  return joueurDe(etat, etat?.moi?.user_id);
}

/**
 * Vrai si c'est mon tour.
 * @param {object} etat état de la partie.
 * @returns {boolean}
 */
export function estMonTour(etat) {
  return !!etat?.moi?.user_id && etat?.partie?.tour === etat.moi.user_id;
}
