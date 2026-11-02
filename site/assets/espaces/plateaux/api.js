// ===== Humane Gang — Jeux de plateau : accès aux données (fonctions serveur hg_plat_*, temps réel) =====
/*
 * Rôle : seul point de contact avec Supabase pour les 10 jeux de plateau (Cluedo, Shadow Hunters, Destins, Monopoly, Risk,
 * Blackjack, Poker, Catan, Pictionary…). Toute la logique est côté serveur (migrations 125 à 131, 143 pour blackjack et poker) :
 * on envoie des intentions (plat.agir) et on relit l'état. Le salon (créer, rejoindre, temps réel, mode invité) vient de
 * commun/jeux-salon.js.
 * Le jeu de la page est fixé une fois au démarrage (choisirJeu), d'après <body data-jeu="…">.
 * Contenus (noms des suspects, rues, territoires…) : modifiables dans le panel admin, chargés une fois (contenus()).
 * Dépendances : core.js (notify : annonce Discord de la partie), commun/jeux-salon.js.
 * Exporte : JEUX, choisirJeu, jeu, plat, contenus, nomDe, suivrePartie, messages, erreurTexte, activerInvite, estInvite, jetonInvite, imageExiste.
 */
import { notify } from '../../commun/core.js';
import { creerSalon } from '../../commun/jeux-salon.js';

/** Description fixe des jeux (le nom affiché vient des contenus, modifiable en admin). Blackjack et poker : en développement (admins). */
/** Description fixe des jeux (le nom affiché vient des contenus, modifiable en admin). Blackjack et poker : en développement (admins). */
export const JEUX = {
  cluedo: { id: 'cluedo', page: '/pages/jeux/cluedo.html', slug: 'cluedo', nom: 'Cluedo', min: 3, max: 6, prefixe: 'HGCLU',
    accroche: 'Une victime, six suspects, six armes, neuf pièces. Mène l\'enquête.' },
  shadow: { id: 'shadow', page: '/pages/jeux/shadow-hunters.html', slug: 'shadow-hunters', nom: 'Shadow Hunters', min: 4, max: 8, prefixe: 'HGSHH',
    accroche: 'Hunters, Shadows et Neutres : personne ne sait qui est qui.' },
  destins: { id: 'destins', page: '/pages/jeux/destins.html', slug: 'destins', nom: 'Destins', min: 2, max: 6, prefixe: 'HGDES',
    accroche: 'Études, métier, mariage, maison : fais tourner la roue de la vie.' },
  monopoly: { id: 'monopoly', page: '/pages/jeux/monopoly.html', slug: 'monopoly', nom: 'Monopoly', min: 2, max: 6, prefixe: 'HGMON',
    accroche: 'Achète, construis, échange… et ruine tes amis en une heure.' },
  risk: { id: 'risk', page: '/pages/jeux/risk.html', slug: 'risk', nom: 'Risk', min: 2, max: 6, prefixe: 'HGRSK',
    accroche: '42 territoires, 6 continents, une mission secrète.' },
  blackjack: { id: 'blackjack', page: '/pages/jeux/blackjack.html', slug: 'blackjack', nom: 'Blackjack', min: 1, max: 7, prefixe: 'HGBJK',
    accroche: 'Vingt-et-un contre la banque : tire, reste, double ou sépare.' },
  poker: { id: 'poker', page: '/pages/jeux/poker.html', slug: 'poker', nom: 'Poker', min: 2, max: 8, prefixe: 'HGPOK',
    accroche: 'Texas Hold\'em : deux cartes, cinq cartes communes et l\'art du bluff.' },
  catan: { id: 'catan', page: '/pages/jeux/catan.html', slug: 'catan', nom: 'Catan du gang', min: 2, max: 4, prefixe: 'HGCAT',
    accroche: 'Récolte, construis routes, colonies et villes : le premier à 10 points gagne.' },
  pictionary: { id: 'pictionary', page: '/pages/jeux/pictionary.html', slug: 'pictionary', nom: 'Pictionary', min: 2, max: 10, prefixe: 'HGPIC',
    accroche: 'Un dessine, les autres devinent. Le temps file.' },
};

let JEU = null;
/** Fixe le jeu de la page ('cluedo', 'shadow', 'destins', 'monopoly', 'risk'). */
export function choisirJeu(id) { JEU = JEUX[id] || null; return JEU; }
/** Jeu de la page (objet de JEUX). */
export function jeu() { return JEU; }

const salon = creerSalon({ prefixe: 'hg_plat', canal: 'plat', etiquette: '[plateaux]' });
const { rpc, rpcInvite, deux, commun } = salon;

/** Appels (noms calqués sur les fonctions serveur de la migration 125). Le jeu de la page est passé à chaque appel. */
export const plat = Object.assign(commun, {
  /** Crée une partie : p = { nom, visibilite, nb_places, invites, t_tour, annonce_discord, options }. Renvoie le code. */
  async creer(p) {
    const code = await rpc('hg_plat_creer', { p: { ...p, jeu: JEU.id } });
    if (p?.annonce_discord) notify('plat_party', { code }).catch(() => {});
    return code;
  },
  /** Administrateur hôte : ajoute un robot (joue automatiquement) pour tester seul. */
  ajouterRobot: (code) => rpc('hg_plat_ajouter_robot', { p_code: code }),
  /** Action de jeu (voir le moteur du jeu) : agir(code, 'deplacer', { piece: 'hall' }). */
  agir: deux((code, action, args = {}) => rpc('hg_plat_agir', { p_code: code, p_action: action, p_args: args }),
    (code, action, args = {}) => rpcInvite('agir', code, { action, args })),
  message: deux((code, texte) => rpc('hg_plat_message', { p_code: code, p_texte: texte }), (code, texte) => rpcInvite('message', code, { texte })),
  publiques: () => rpc('hg_plat_publiques', { p_jeu: JEU.id }),
  /** Parties publiques en cours qui admettent les spectateurs, hors les miennes (migration 214 ; Blackjack, Monopoly, Destins). */
  enDirect: () => rpc('hg_plat_en_direct', { p_jeu: JEU.id }),
  /** Spectateur : arrête de regarder la partie (id). */
  arreterDeRegarder: (partieId) => rpc('hg_spect_arreter', { p_partie: partieId }),
  mesParties: () => rpc('hg_plat_mes_parties', { p_jeu: JEU.id }),
  stats: (user = null) => rpc('hg_plat_stats', { p_jeu: JEU.id, p_user: user }),
  // Administration (/assets/espaces/admin/admin-plateaux.js)
  adminReglages: (jeuId) => rpc('hg_plat_admin_reglages', { p_jeu: jeuId }),
  adminEnregistrer: (jeuId, p) => rpc('hg_plat_admin_enregistrer', { p_jeu: jeuId, p }),
  adminContenu: (jeuId, cle, valeur) => rpc('hg_plat_admin_contenu', { p_jeu: jeuId, p_cle: cle, p_valeur: valeur }),
});

export const { erreurTexte, activerInvite, estInvite, jetonInvite, messages, suivrePartie } = salon;

/* ---------- Contenus paramétrables ---------- */
let cacheContenus = null;
/**
 * Contenus du jeu de la page : { nom, victime, suspects: [{id, nom, couleur}], … } (selon le jeu).
 * @param {string|null} code partie (utile en invité). Chargé une seule fois.
 */
export async function contenus(code = null) {
  if (cacheContenus) return cacheContenus;
  cacheContenus = salon.estInvite() && code
    ? await rpc('hg_plat_invite', { p_action: 'contenus', p_code: code })
    : await rpc('hg_plat_contenus', { p_jeu: JEU.id });
  return cacheContenus || {};
}
/** Nom d'un élément d'une liste de contenus (ou l'identifiant s'il manque). */
export function nomDe(c, liste, id) {
  return (c?.[liste] || []).find((x) => x.id === id)?.nom || id || '';
}

/** Vrai si l'image existe (sert aux visuels fournis plus tard : sinon on garde le dessin de repli). */
export function imageExiste(src) {
  return new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(true);
    i.onerror = () => ok(false);
    i.src = src;
  });
}
