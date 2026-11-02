// ===== Humane Gang — Loup-Garou : composants d'affichage partagés =====
/*
 * Rôle : petits morceaux de HTML réutilisés par tous les écrans (vignette de rôle, pastille de camp, pseudo coloré,
 * avatar, icônes, minuteur, fenêtre), pour que tous les écrans se ressemblent.
 * Règle : tout texte venant de la base passe par esc(). Les couleurs ne portent jamais seules l'information.
 * Dépendances : core.js (esc, avatarHtml, toast), roles.js.
 * Exporte : ICONES, icone, vignetteRole, pastilleCamp, pseudo, avatar, chrono, ouvrirFenetre, confirmer, notifier,
 *   libellePhase, libelleCause, filAriane, CANAUX.
 */
import { esc, avatarHtml, toast } from '../../commun/core.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { roleById, CAMPS } from './roles.js';

/** Chemins d'icônes (trait 24×24). */
export const ICONES = {
  maison: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  patte: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 16c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5c0 1.7-1.3 3-3 3h-2c-1.7 0-3-1.3-3-3z"/>',
  etoile: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
  lune: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  soleil: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  crane: '<path d="M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><path d="M10 20v-2M14 20v-2"/>',
  horloge: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cartes: '<rect x="3" y="5" width="12" height="16" rx="2"/><path d="M9 3h10a2 2 0 0 1 2 2v14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  moins: '<path d="M5 12h14"/>',
  croix: '<path d="M6 6l12 12M18 6L6 18"/>',
  coche: '<path d="M5 12l5 5L20 7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  envoyer: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  cadenas: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  couronne: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  bouclier: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  oeil: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  oeilBarre: '<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4.3-1"/>',
  trophee: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  lien: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  copier: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  coeur: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  micro: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  sortie: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>',
  discord: '<path d="M8 17c-2 0-4-1-5-2 0-5 1.5-9 3-10 1.5-.5 3-1 3-1l.5 1.5h5L15 4s1.5.5 3 1c1.5 1 3 5 3 10-1 1-3 2-5 2l-1-2M8.5 12.5h.01M15.5 12.5h.01"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  lecture: '<path d="M7 5l12 7-12 7z"/>',
  suivant: '<path d="M5 5l10 7-10 7zM19 5v14"/>',
};

/** SVG d'icône décorative (aria-hidden). */
export function icone(nom, taille = 18, cls = '') {
  return `<svg class="lg-ico ${cls}" width="${taille}" height="${taille}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONES[nom] || ''}</svg>`;
}

const ICONE_CAMP = { village: 'maison', loups: 'patte', solo: 'etoile' };

/** Vignette d'un rôle : illustration sur la couleur du camp (repli : icône du camp). */
export function vignetteRole(roleId, taille = 48, { rond = false } = {}) {
  const r = roleById(roleId);
  const c = CAMPS[r.camp] || CAMPS.village;
  const forme = rond ? '50%' : `${Math.round(taille / 4)}px`;
  return `<span class="lg-vignette" style="width:${taille}px;height:${taille}px;border-radius:${forme};background:${c.fond};color:${c.texte}">`
    + (r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy" decoding="async" width="${taille}" height="${taille}" data-on-error="remove">` : '')
    + icone(ICONE_CAMP[r.camp] || 'maison', Math.round(taille * 0.45)) + '</span>';
}

/** Pastille de camp : icône + libellé (la couleur renforce seulement). */
export function pastilleCamp(camp, libelle = null) {
  const c = CAMPS[camp] || CAMPS.village;
  return `<span class="lg-pastille" style="background:${c.fond};color:${c.texte}">${icone(ICONE_CAMP[camp] || 'maison', 13)}${esc(libelle || c.label)}</span>`;
}

/** Pseudo coloré avec la couleur du profil (invités : gris). */
export function pseudo(j) {
  const couleur = j?.invite ? '#9A968F' : (/^#[0-9a-f]{6}$/i.test(j?.couleur || '') ? j.couleur : '#F2EFEA');
  return `<span class="lg-pseudo" style="color:${couleur}">${esc(j?.pseudo || '?')}</span>`;
}

/** Avatar d'un joueur (photo de profil, sinon initiales). */
export function avatar(j, taille = 40) {
  return avatarHtml({ pseudo: j?.pseudo, color: j?.invite ? '#3A3A40' : j?.couleur, avatar_url: j?.avatar_url }, taille);
}

/** Minuteur mm:ss. */
export function chrono(secondes) {
  if (secondes == null) return '--:--';
  const s = Math.max(0, secondes | 0);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Libellé d'une étape. */
export function libellePhase(p) {
  const n = p?.manche || 0;
  return ({
    revelation: 'Découverte des rôles', nuit_1: `Nuit ${n} · Préparatifs`, nuit: `Nuit ${n}`, reveil: `Nuit ${n} · Avant l’aube`,
    debat: `Jour ${n} · Débat`, vote: `Jour ${n} · Vote`, chasseur: 'Le Chasseur tire', succession: 'Succession du Capitaine', fin: 'Partie terminée',
  })[p?.phase] || 'Salle d\'attente';
}

/** La partie est-elle de nuit ? */
export const estNuit = (p) => ['nuit_1', 'nuit', 'reveil', 'revelation'].includes(p?.phase);

/** Cause de mort lisible. */
export function libelleCause(c, manche) {
  const m = manche ? ` (${c === 'vote' || c === 'chasseur' ? 'jour' : 'nuit'} ${manche})` : '';
  return ({ loups: 'Dévoré·e', vote: 'Éliminé·e au vote', poison: 'Empoisonné·e', chagrin: 'Mort·e de chagrin', chasseur: 'Abattu·e par le Chasseur',
    loup_blanc: 'Dévoré·e par le Loup blanc', meneur: 'Éliminé·e par le meneur' }[c] || 'Mort·e') + m;
}

/** Salons de discussion. */
export const CANAUX = {
  salon: 'Salon', general: 'Général', loups: 'Loups', morts: 'Morts', famille: 'Famille', meneur: 'Meneur',
};

/** Fil d'Ariane « Jeux › Loup-Garou › écran ». */
export function filAriane(ecran) {
  return `<nav class="lg-ariane" aria-label="Fil d'Ariane"><a href="/pages/jeux/jeux.html">Jeux</a> › <a href="/pages/jeux/loup-garou.html">Loup-Garou</a>${ecran ? ` › <span>${esc(ecran)}</span>` : ''}</nav>`;
}

/**
 * Ouvre une fenêtre (dialog natif, feuille en bas sur téléphone). contenu : HTML ; renvoie l'élément <dialog>.
 * La fenêtre se ferme avec Échap, la croix, ou fermer().
 */
export function ouvrirFenetre(titre, contenu, { large = false, onFerme } = {}) {
  const d = document.createElement('dialog');
  d.className = `lg-fenetre${large ? ' lg-fenetre-large' : ''}`;
  const id = `lg-f-${Math.random().toString(36).slice(2, 8)}`;
  d.setAttribute('aria-labelledby', id);
  d.innerHTML = `<div class="lg-fenetre-tete"><h2 id="${id}">${esc(titre)}</h2>
    <button type="button" class="lg-btn-icone" data-fermer aria-label="Fermer">${icone('croix')}</button></div>
    <div class="lg-fenetre-corps">${contenu}</div>`;
  document.body.appendChild(d);
  const fermer = () => { if (d.open) d.close(); };
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-fermer]')) fermer(); });
  d.addEventListener('close', () => { onFerme?.(); d.remove(); });
  d.showModal();
  d.fermer = fermer;
  return d;
}

/** Demande de confirmation dans la fenêtre commune ; renvoie une promesse booléenne. */
export function confirmer(question, { oui = 'Confirmer', non = 'Annuler', danger = false } = {}) {
  return confirmBox(question, '', { ok: oui, cancel: non, danger });
}

/** Message bref (toast du site). */
export function notifier(texte, type = 'info') {
  try { toast(texte, type); } catch { /* sans effet */ }
}
