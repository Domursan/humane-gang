// ===== Informations diverses (Secret Santa) — liste unique des champs =====
// Stockées dans hg_profile_info.data (jsonb, clé = id). Visibles par la personne et l'admin uniquement.
// L'admin choisit, par édition, les clés transmises au Santa (hg_ss_editions.shared_fields).
// type : 'text' (une ligne) | 'textarea' (plusieurs lignes)
/*
 * Rôle : liste des champs du formulaire « Mes informations » (livraison, tailles, goûts, réseaux, contraintes).
 * Cette liste est la source unique : la page compte et les pages Secret Santa s'en servent pour afficher et pour
 * savoir quels champs peuvent être transmis au Santa.
 * Pages : /pages/compte/compte.html (saisie), /pages/irl/secret-santa.html, et la fiche d'un membre dans l'administration (admin-accounts/).
 * Dépendances : core.js (client Supabase, pour lire le réglage « profile_fields »).
 * Table : hg_settings (clé 'profile_fields') ; hg_profile_info (données de chaque membre).
 * Exporte : INFO_GROUPS, INFO_FIELDS, INFO_LABEL, validateInfoGroups.
 */
import { sb } from '../../commun/core.js';

/* ---------- Liste d'origine ---------- */

/** Liste d'origine des champs, groupés. Elle sert de repli si le réglage admin est absent ou invalide. */
export const DEFAULT_INFO_GROUPS = [
  { id: 'livraison', label: 'Livraison', fields: [
    { id: 'nom_complet', label: 'Nom et prénom (pour le colis)', type: 'text' },
    { id: 'adresse', label: 'Adresse postale', type: 'textarea', placeholder: 'Rue, numéro\nNPA Ville\nPays' },
    { id: 'telephone', label: 'Téléphone (pour le livreur)', type: 'text' },
    { id: 'point_relais', label: 'Point relais / préférences de livraison', type: 'text' },
    { id: 'remise_main_propre', label: 'Remise en main propre possible ? Où / quand', type: 'text' },
  ] },
  { id: 'tailles', label: 'Tailles', fields: [
    { id: 'taille_haut', label: 'Haut (t-shirt, pull)', type: 'text', placeholder: 'Ex. M' },
    { id: 'taille_bas', label: 'Bas (pantalon)', type: 'text', placeholder: 'Ex. 32/32 ou 40' },
    { id: 'pointure', label: 'Pointure', type: 'text', placeholder: 'Ex. 42' },
    { id: 'taille_bague', label: 'Taille de bague', type: 'text' },
    { id: 'taille_autre', label: 'Autres tailles (chapeau, gants…)', type: 'text' },
  ] },
  { id: 'gouts', label: 'Goûts', fields: [
    { id: 'couleurs', label: 'Couleurs préférées', type: 'text' },
    { id: 'style', label: 'Style (vêtements, déco…)', type: 'text' },
    { id: 'hobbies', label: 'Hobbies et passions', type: 'textarea' },
    { id: 'univers', label: 'Univers préférés (films, séries, jeux, musique, livres…)', type: 'textarea' },
    { id: 'gourmandises', label: 'Gourmandises, boissons, snacks préférés', type: 'text' },
    { id: 'parfums', label: 'Parfums / odeurs aimés', type: 'text' },
    { id: 'adore', label: 'J\'adore…', type: 'textarea' },
    { id: 'naime_pas', label: 'Je n\'aime pas…', type: 'textarea' },
  ] },
  { id: 'reseaux', label: 'Réseaux sociaux & gaming', fields: [
    { id: 'discord_pseudo', label: 'Discord', type: 'text', placeholder: 'pseudo' },
    { id: 'instagram', label: 'Instagram', type: 'text', placeholder: '@pseudo' },
    { id: 'tiktok', label: 'TikTok', type: 'text', placeholder: '@pseudo' },
    { id: 'snapchat', label: 'Snapchat', type: 'text' },
    { id: 'x_twitter', label: 'X (Twitter)', type: 'text', placeholder: '@pseudo' },
    { id: 'facebook', label: 'Facebook', type: 'text' },
    { id: 'youtube', label: 'YouTube', type: 'text' },
    { id: 'twitch', label: 'Twitch', type: 'text' },
    { id: 'steam', label: 'Steam', type: 'text', placeholder: 'pseudo ou code ami' },
    { id: 'epic', label: 'Epic Games', type: 'text' },
    { id: 'psn', label: 'PlayStation Network', type: 'text' },
    { id: 'xbox', label: 'Xbox (Gamertag)', type: 'text' },
    { id: 'nintendo', label: 'Nintendo (code ami)', type: 'text', placeholder: 'SW-0000-0000-0000' },
    { id: 'battlenet', label: 'Battle.net', type: 'text', placeholder: 'Pseudo#1234' },
    { id: 'riot', label: 'Riot ID', type: 'text', placeholder: 'Pseudo#TAG' },
    { id: 'rockstar', label: 'Pseudo en ligne', type: 'text' },
    { id: 'ea', label: 'EA / Ubisoft', type: 'text' },
    { id: 'autres_reseaux', label: 'Autres plateformes', type: 'textarea' },
  ] },
  { id: 'contraintes', label: 'À savoir', fields: [
    { id: 'allergies', label: 'Allergies ou intolérances (alimentaires, matières…)', type: 'text' },
    { id: 'regime', label: 'Régime alimentaire', type: 'text', placeholder: 'Ex. végétarien, sans alcool' },
    { id: 'animaux', label: 'Animaux à la maison', type: 'text' },
    { id: 'deja_possede', label: 'Ce que j\'ai déjà / à éviter', type: 'textarea' },
    { id: 'idees_libres', label: 'Autres idées ou remarques', type: 'textarea' },
  ] },
];
/* ---------- Réglage admin « profile_fields » (hg_settings, lot 2) ---------- */
// Les exports ci-dessous restent les mêmes (tableaux mis à jour sur place) : les pages qui les importent ne changent pas.
// Sans la clé, ou si la valeur est invalide, la liste d'origine (DEFAULT_INFO_GROUPS) est utilisée.
/** Groupes de champs en cours (copie de la liste d'origine, remplaçable par le réglage admin). */
export const INFO_GROUPS = structuredClone(DEFAULT_INFO_GROUPS);
/** Tous les champs à plat, avec leur groupe. Mis à jour sur place par flatten(). */
export const INFO_FIELDS = [];
/** Libellé de chaque champ, par identifiant. Mis à jour sur place par flatten(). */
export const INFO_LABEL = {};
/** Forme d'un identifiant de champ : minuscules, chiffres et « _ », 2 à 41 caractères. */
const ID_RE = /^[a-z][a-z0-9_]{1,40}$/;

/**
 * Recalcule INFO_FIELDS et INFO_LABEL à partir de la liste de groupes, en gardant les mêmes objets
 * (les pages qui les ont importés voient donc les changements).
 * @param {Array<object>} groups Groupes { id, label, fields }.
 */
function flatten(groups) {
  INFO_FIELDS.splice(0, INFO_FIELDS.length, ...groups.flatMap((g) => g.fields.map((f) => ({ ...f, group: g.id, groupLabel: g.label }))));
  for (const k of Object.keys(INFO_LABEL)) delete INFO_LABEL[k];
  for (const f of INFO_FIELDS) INFO_LABEL[f.id] = f.label;
}
flatten(INFO_GROUPS);

/**
 * Vérifie une liste de groupes (réglage) : 1 à 12 groupes, 1 à 60 champs par groupe, identifiants de groupes et de champs uniques,
 * libellés non vides, type 'text' ou 'textarea'. Les espaces de bord sont retirés des libellés.
 * @param {*} raw Liste brute lue en base.
 * @returns {Array<object>|null} Groupes normalisés, ou null si la liste est invalide.
 */
export function validateInfoGroups(raw) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 12) return null;
  const seen = new Set();
  const seenGroups = new Set();
  const out = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object' || !ID_RE.test(g.id) || seenGroups.has(g.id) || typeof g.label !== 'string' || !g.label.trim() || !Array.isArray(g.fields) || !g.fields.length || g.fields.length > 60) return null;
    seenGroups.add(g.id);
    const fields = [];
    for (const f of g.fields) {
      if (!f || typeof f !== 'object' || !ID_RE.test(f.id) || seen.has(f.id) || typeof f.label !== 'string' || !f.label.trim() || f.label.length > 160) return null;
      if (f.type !== 'text' && f.type !== 'textarea') return null;
      if (f.placeholder !== undefined && (typeof f.placeholder !== 'string' || f.placeholder.length > 80)) return null;
      seen.add(f.id);
      fields.push({ id: f.id, label: f.label.trim(), type: f.type, ...(f.placeholder ? { placeholder: f.placeholder } : {}) });
    }
    out.push({ id: g.id, label: g.label.trim(), fields });
  }
  return out;
}

/** Charge le réglage « profile_fields » (une fois, au chargement du module). Ne lève jamais. */
async function loadProfileFields() {
  try {
    const { data, error } = await sb.from('hg_settings').select('value').eq('key', 'profile_fields').maybeSingle();
    if (error) throw error;
    if (!data) return;
    const groups = validateInfoGroups(data.value?.groups);
    if (!groups) { console.warn('[profil] réglage « profile_fields » invalide : liste d\'origine utilisée'); return; }
    INFO_GROUPS.splice(0, INFO_GROUPS.length, ...groups);
    flatten(INFO_GROUPS);
  } catch (e) {
    console.warn('[profil] champs non lus, liste d\'origine utilisée :', e?.message || e);
  }
}
await loadProfileFields();
