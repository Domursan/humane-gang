// =====================================================================
// Réglages du lot 3 (Secret Santa, sorties IRL, souvenirs et albums).
// Les valeurs sont stockées dans la table hg_settings (une ligne par clé).
// Sans réglage enregistré, ou si la lecture échoue, chaque valeur reste le défaut codé dans keys-lot3.js.
// Usage : await chargerReglagesLot3() au démarrage d'une page, puis reglage('irl.delai_passee_heures') en synchrone.
// Dépendances : core/supabase.js (client Supabase), keys-lot3.js (liste des champs et défauts).
// Rangé dans commun/ : lu par les pages des membres ; l'ancienne adresse (espaces/admin/reglages-valeurs-lot3.js) le réexporte.
// Exporte : chargerReglagesLot3, reglage, majReglagesLot3, objetLot3 et les raccourcis (delaiPassee, etc.).
// =====================================================================
import { sb } from '../core/supabase.js';
import { CHAMPS_LOT3, CLES_LOT3 } from './keys-lot3.js';

/* ---------- État en mémoire ---------- */
// Index « cle.champ » -> définition du champ, pour retrouver vite un réglage par son nom.
const PAR_NOM = Object.fromEntries(CHAMPS_LOT3.map((c) => [`${c.cle}.${c.champ}`, c]));
let brut = {};          // { ss: {...}, irl: {...}, ... } tel que stocké
let chargement = null;  // promesse en cours ou terminée

/* ---------- Chargement ---------- */
/**
 * Charge les clés du lot 3 depuis hg_settings. Ne relit la base qu'une fois par page,
 * sauf si on passe { force: true }. Ne lève jamais d'erreur : en cas de panne, les défauts restent.
 * @param {{force?: boolean}} [options]
 * @returns {Promise<Object>} les valeurs brutes lues (vide en cas d'échec).
 */
export function chargerReglagesLot3({ force = false } = {}) {
  if (chargement && !force) return chargement;
  chargement = (async () => {
    try {
      const { data, error } = await sb.from('hg_settings').select('key, value').in('key', CLES_LOT3);
      if (error) throw error;
      const next = {};
      // On ne garde que les valeurs qui sont bien des objets (pas des nombres ni des tableaux).
      for (const r of data ?? []) if (r.value && typeof r.value === 'object' && !Array.isArray(r.value)) next[r.key] = r.value;
      brut = next;
    } catch (e) {
      console.warn('[réglages] lecture impossible, défauts appliqués :', e?.message || e);
      brut = {};
      // On remet la promesse à zéro : le prochain appel retentera la lecture.
      chargement = null;
    }
    return brut;
  })();
  return chargement;
}

/* ---------- Validation ---------- */
/**
 * Valeur normalisée d'un champ, ou undefined si elle est absente ou invalide.
 * Les entiers sont arrondis vers le bas ; les textes sont rognés et limités à c.max caractères.
 * @param {Object} c définition du champ (type, min, max, nullable...).
 * @param {*} v valeur lue en base.
 * @returns {*} la valeur utilisable, ou undefined pour dire « prendre le défaut ».
 */
function valide(c, v) {
  if (v === undefined) return undefined;
  // Un champ « nullable » accepte une valeur vide, et la garde comme null.
  if (c.nullable && (v === null || v === '')) return null;
  if (c.type === 'bool') return typeof v === 'boolean' ? v : undefined;
  if (c.type === 'texte') {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t.length <= c.max ? t : undefined;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  const n = c.type === 'entier' ? Math.floor(v) : v;
  return n >= c.min && n <= c.max ? n : undefined;
}

/* ---------- Lecture ---------- */
/**
 * Valeur effective d'un réglage, « cle.champ » (ex. 'irl.delai_passee_heures').
 * Si la valeur enregistrée est absente ou invalide, on renvoie le défaut.
 * @param {string} nom nom complet du réglage.
 * @returns {*} la valeur à utiliser.
 * @throws {Error} si le nom ne correspond à aucun réglage connu (erreur de programmation).
 */
export function reglage(nom) {
  const c = PAR_NOM[nom];
  if (!c) throw new Error(`Réglage inconnu : ${nom}`);
  const v = valide(c, brut[c.cle]?.[c.champ]);
  return v === undefined ? c.defaut : v;
}

/**
 * Remplace en mémoire la valeur d'une clé après un enregistrement dans l'admin,
 * pour que la page affiche tout de suite la nouvelle valeur sans recharger.
 * @param {string} cle nom de la clé (ex. 'ss').
 * @param {Object} valeur nouvel objet de la clé.
 */
export function majReglagesLot3(cle, valeur) {
  brut = { ...brut, [cle]: valeur };
}

/* ----- Raccourcis lus par le site ----- */
// Délai (en ms) après le début d'une sortie, au bout duquel elle passe dans l'historique.
export const delaiPassee = () => reglage('irl.delai_passee_heures') * 3600 * 1000;
// Durée par défaut (en ms) d'une sortie sans heure de fin. Sert à l'export .ics.
export const dureeDefautMs = () => reglage('irl.duree_defaut_heures') * 3600 * 1000;
/** Bornes (min, max) du nombre de choix d'un sondage de sortie. Le max n'est jamais sous le min. */
export function bornesSondage() {
  const min = reglage('irl.sondage_min');
  return { min, max: Math.max(min, reglage('irl.sondage_max')) };
}
// Réglages de réduction des photos avant envoi : côté le plus long (px) et qualité de compression (0,5 à 1).
export const optionsPhoto = () => ({ max: reglage('photos.cote_max'), quality: reglage('photos.qualite') });

/** Copie de l'objet stocké pour une clé (ex. 'ss'), tel qu'il est en base. L'admin s'en sert pour ne pas perdre les champs inconnus à l'enregistrement. */
export const objetLot3 = (cle) => ({ ...(brut[cle] ?? {}) });
