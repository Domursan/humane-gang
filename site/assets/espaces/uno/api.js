// ===== Humane Gang — Uno : accès aux données (fonctions serveur hg_uno_*, temps réel) =====
/*
 * Rôle : seul point de contact avec Supabase pour le Uno. Les écrans n'appellent jamais sb directement.
 * Toute la logique de jeu est côté serveur (migration 121) : ici on envoie des intentions et on relit l'état.
 * Le salon (créer, rejoindre, temps réel, mode invité) vient de commun/jeux-salon.js.
 * Dépendances : commun/jeux-salon.js.
 * Exporte : uno (appels), suivrePartie, messages, erreurTexte, activerInvite, estInvite, jetonInvite.
 */
import { creerSalon } from '../../commun/jeux-salon.js';

const salon = creerSalon({ prefixe: 'hg_uno', canal: 'uno', etiquette: '[uno]' });
const { rpc, rpcInvite, deux, commun } = salon;

/** Appels du jeu (noms calqués sur les fonctions serveur, voir la migration 121). */
export const uno = Object.assign(commun, {
  /** Pose une carte. couleur : obligatoire pour un Joker ; cible : pour un 7 en Sept-zéro. */
  jouer: deux((code, carte, { couleur = null, cible = null } = {}) =>
    rpc('hg_uno_jouer', { p_code: code, p_carte: carte, p_couleur: couleur, p_cible: cible }),
  (code, carte, { couleur = null, cible = null } = {}) => rpcInvite('jouer', code, { carte, couleur, cible })),
  piocher: deux((code) => rpc('hg_uno_piocher', { p_code: code }), (code) => rpcInvite('piocher', code)),
  passer: deux((code) => rpc('hg_uno_passer', { p_code: code }), (code) => rpcInvite('passer', code)),
  direUno: deux((code) => rpc('hg_uno_uno', { p_code: code }), (code) => rpcInvite('uno', code)),
  contrer: deux((code, cible) => rpc('hg_uno_contrer', { p_code: code, p_cible: cible }), (code, cible) => rpcInvite('contrer', code, { cible })),
  contester: deux((code, oui) => rpc('hg_uno_contester', { p_code: code, p_contester: !!oui }), (code, oui) => rpcInvite('contester', code, { contester: !!oui })),
  /** Joueur parti : reprend sa main tenue par le robot (migration 211). Renvoie { tours, resume } ou null si rien à reprendre. */
  reprendre: deux((code) => rpc('hg_uno_reprendre', { p_code: code }), (code) => rpcInvite('reprendre', code)),
  /** Hôte, salle d'attente : change les règles (t_tour, nb_places, mode, visibilite, invites, variantes). */
  regles: (code, p) => rpc('hg_uno_regles', { p_code: code, p }),
  message: deux((code, texte) => rpc('hg_uno_message', { p_code: code, p_texte: texte }), (code, texte) => rpcInvite('message', code, { texte })),
  /** Parties publiques en cours qui admettent les spectateurs, hors les miennes (migration 214). */
  enDirect: () => rpc('hg_uno_en_direct'),
  /** Spectateur : arrête de regarder la partie (id). */
  arreterDeRegarder: (partieId) => rpc('hg_spect_arreter', { p_partie: partieId }),
});

export const { erreurTexte, activerInvite, estInvite, jetonInvite, messages, suivrePartie } = salon;
