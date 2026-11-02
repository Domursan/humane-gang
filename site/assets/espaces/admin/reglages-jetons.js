// =====================================================================
// Réglages affichés dans les textes : lecture des valeurs du site et remplacement dans les tutos et les affiches.
// Une valeur absente, illisible ou invalide donne le repli écrit à côté (la valeur actuelle du site).
// Dépendances : core/supabase.js (client Supabase). Lectures : RPC hg_card_cfg (réglages du jeu de cartes)
// et table hg_settings (clés badges, irl, invites, ss : lecture publique ou membre selon la clé, voir migrations 052, 051, 059) ;
// RPC hg_support_public et hg_eggs_public pour « support » et « eggs » (migration 072).
// Exporte : chargerReglages, valeur, evaluer, fmt, jetons, appliquerReglages.
// =====================================================================
import { sb, hasSession } from '../../commun/core/supabase.js';

/* ---------- Sources ---------- */
// Espaces de noms utilisés dans les jetons : « cartes.<champ> » lit hg_card_cfg(), les autres lisent hg_settings[<clé>].
// Les clés sont celles de hg_settings ; « cartes » n'est pas une clé (la RPC hg_card_cfg lit hg_settings.cards).
const CLES_SETTINGS = ['badges', 'irl', 'invites', 'ss'];
// Lues par RPC (migration 072) : « support » (sujets et longueurs, sans les seuils anti-spam) et « eggs »
// (récompenses seulement, sans le mot secret ni la date d'anniversaire ; membres connectés).
const RPC_SETTINGS = { support: 'hg_support_public', eggs: 'hg_eggs_public' };

/** Valeurs lues, par espace de noms : { cartes: {...}, badges: {...}, irl: {...}, invites: {...}, ss: {...} }. Vide tant que non chargées. */
let lues = { cartes: {}, badges: {}, irl: {}, invites: {}, ss: {}, support: {}, eggs: {}, anciennete: {} };
let chargement = null; // promesse de la lecture (une seule par page)

/** Vrai pour un objet simple (pas un tableau, pas null). */
const estObjet = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Liste lisible en français : « a », « a ou b », « a, b ou c ».
 * @param {string[]} items éléments déjà mis en forme
 * @returns {string} la liste
 */
const listeEnFrancais = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ou ${items[items.length - 1]}`);

/* ---------- Chargement ---------- */
/**
 * Lit les réglages utiles aux textes : la configuration du jeu de cartes (RPC hg_card_cfg) puis les clés
 * de hg_settings listées dans CLES_SETTINGS. Une seule lecture par page. Ne jette jamais : sans session,
 * ou si la base ne répond pas, les repli des textes restent affichés.
 * @returns {Promise<Object>} les valeurs lues (les espaces de noms vides en cas d'échec).
 */
export function chargerReglages() {
  if (chargement) return chargement;
  chargement = (async () => {
    const out = { cartes: {}, badges: {}, irl: {}, invites: {}, ss: {}, support: {}, eggs: {}, anciennete: {} };
    const membre = await hasSession();
    try {
      if (membre) { // sans session la RPC rend 401 : on garde le repli des textes, sans appel
        const { data, error } = await sb.rpc('hg_card_cfg');
        if (!error && estObjet(data)) out.cartes = data;
      }
    } catch (e) {
      console.warn('[réglages] jeu de cartes illisible, valeurs actuelles affichées :', e?.message || e);
    }
    try {
      const { data, error } = await sb.from('hg_settings').select('key, value').in('key', CLES_SETTINGS);
      if (error) throw error;
      for (const r of data ?? []) if (CLES_SETTINGS.includes(r.key) && estObjet(r.value)) out[r.key] = r.value;
    } catch (e) {
      console.warn('[réglages] réglages du site illisibles, valeurs actuelles affichées :', e?.message || e);
    }
    await Promise.all(Object.entries(RPC_SETTINGS).map(async ([cle, rpc]) => {
      if (cle === 'eggs' && !membre) return; // réservée aux membres connectés (migration 072) : pas d’appel refusé pour un visiteur
      try {
        const { data, error } = await sb.rpc(rpc);
        if (!error && estObjet(data)) out[cle] = data;
      } catch { /* sans session ou sans réponse : repli des textes */ }
    }));
    // Textes calculés de l'assistance (hg_settings.support, lisible sans compte) : minimum de caractères et liste des sujets.
    const sup = out.support;
    const mini = Number(sup.message_min);
    if (Number.isInteger(mini) && mini >= 1) sup.message_min_texte = `${fmt(mini)} caractère${mini > 1 ? 's' : ''}`;
    const sujets = Array.isArray(sup.sujets) ? sup.sujets.filter((x) => typeof x === 'string' && x.trim()) : [];
    if (sujets.length) sup.sujets_texte = listeEnFrancais(sujets.map((x) => `« ${x.trim()} »`));
    // Paliers du badge Ancienneté (hg_badges.levels, réglables dans l'admin ; lecture réservée aux membres).
    try {
      const { data, error } = await sb.from('hg_badges').select('levels').eq('code', 'anciennete').maybeSingle();
      if (error) throw error;
      const niveaux = (Array.isArray(data?.levels) ? data.levels : [])
        .filter((l) => l && typeof l.name === 'string' && l.name.trim() && Number.isFinite(Number(l.threshold)))
        .sort((a, b) => Number(a.threshold) - Number(b.threshold));
      if (niveaux.length) {
        const an = (n) => `${fmt(n)} an${Number(n) > 1 ? 's' : ''}`;
        out.anciennete.noms_texte = listeEnFrancais(niveaux.map((l) => l.name.trim()));
        out.anciennete.paliers_texte = niveaux
          .map((l, i) => `${l.name.trim()} à ${an(Number(l.threshold))}${i === 0 ? ' dans le gang' : ''}`).join(', ');
      }
    } catch (e) {
      console.warn('[réglages] paliers d’ancienneté illisibles, valeurs actuelles affichées :', e?.message || e);
    }
    lues = out;
    return lues;
  })();
  return chargement;
}

/* ---------- Lecture d'une valeur ---------- */
/**
 * Valeur d'un réglage à partir de son chemin pointé, ex. « cartes.rewards.daily » ou « badges.criteres.paparazzi_photos ».
 * Un nombre fini ou un texte non vide est renvoyé ; sinon le repli (ou undefined si aucun repli).
 * @param {string} chemin premier segment = espace de noms, le reste = chemin dans la valeur.
 * @param {*} [repli] valeur à renvoyer si le réglage est absent ou invalide.
 * @returns {number|string|*} la valeur, ou le repli.
 */
export function valeur(chemin, repli = undefined) {
  const [ns, ...reste] = String(chemin).split('.');
  let v = lues[ns];
  for (const p of reste) v = v?.[p];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) return v.trim();
  return repli;
}

/* ---------- Mise en forme ---------- */
/**
 * Nombre à la française : espace insécable pour les milliers, virgule pour les décimales (au plus 2).
 * Ex. 1000 → « 1 000 », 0.88 → « 0,88 », 250 → « 250 ».
 * @param {number} n le nombre
 * @returns {string} le texte
 */
export function fmt(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n);
  const [entier, decimales] = String(Math.round(Math.abs(v) * 100) / 100).split('.');
  const milliers = entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '-' : '') + milliers + (decimales ? ',' + decimales : '');
}

/* ---------- Calcul simple ---------- */
// Expression : nombres, chemins de réglages (cartes.rewards.daily), + - * et parenthèses.
// Exemple : « cartes.rewards.daily+cartes.rewards.streak_bonus*(cartes.rewards.streak_max-1) ».
/**
 * Valeur d'une expression. Renvoie undefined si un réglage manque, si la syntaxe est fausse ou si un terme n'est pas un nombre.
 * Priorité : parenthèses, puis *, puis + et -.
 * @param {string} expr l'expression
 * @returns {number|undefined} le résultat
 */
export function evaluer(expr) {
  const src = String(expr).trim();
  const re = /\s*(\d+(?:\.\d+)?|[a-z_][a-z_0-9]*(?:\.[a-z_0-9]+)+|[+\-*()])/gi;
  const jetonsLus = [];
  let pos = 0;
  while (pos < src.length) {
    re.lastIndex = pos;
    const m = re.exec(src);
    if (!m || m.index !== pos) return undefined;
    jetonsLus.push(m[1]);
    pos = re.lastIndex;
  }
  let i = 0;
  const facteur = () => {
    const t = jetonsLus[i++];
    if (t === undefined) return undefined;
    if (t === '(') {
      const v = somme();
      return jetonsLus[i++] === ')' ? v : undefined;
    }
    if (/^\d/.test(t)) return Number(t);
    const v = valeur(t);
    return typeof v === 'number' ? v : undefined;
  };
  const produit = () => {
    let v = facteur();
    while (jetonsLus[i] === '*') {
      i++;
      const r = facteur();
      v = v === undefined || r === undefined ? undefined : v * r;
    }
    return v;
  };
  const somme = () => {
    let v = produit();
    while (jetonsLus[i] === '+' || jetonsLus[i] === '-') {
      const op = jetonsLus[i++];
      const r = produit();
      v = v === undefined || r === undefined ? undefined : op === '+' ? v + r : v - r;
    }
    return v;
  };
  const resultat = somme();
  return i === jetonsLus.length ? resultat : undefined;
}

/* ---------- Jetons dans les textes ---------- */
// Jeton : {{expression|repli}}. Le repli (après la barre) est la valeur écrite dans le texte d'origine.
const RE_JETON = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/g;

/**
 * Remplace les jetons {{expression|repli}} d'un texte par la valeur du réglage (ou par le repli si elle manque).
 * Un texte sans jeton, ou qui n'est pas une chaîne, est renvoyé tel quel.
 * @param {*} texte le texte d'origine
 * @returns {*} le texte avec les valeurs
 */
export function jetons(texte) {
  if (typeof texte !== 'string' || !texte.includes('{{')) return texte;
  return texte.replace(RE_JETON, (_, expr, repli = '') => {
    const v = /^[a-z_][a-z_0-9]*(\.[a-z_0-9]+)+$/i.test(expr) ? valeur(expr) : evaluer(expr);
    return v === undefined ? repli : typeof v === 'number' ? fmt(v) : String(v);
  });
}

/* ---------- Valeurs dans une page (affiches) ---------- */
/**
 * Remplit les éléments marqués dans la page. Les éléments gardent leur texte d'origine (repli) si la valeur manque.
 * Attributs : data-cfg="chemin" (valeur d'un réglage), data-expr="expression" (calcul, voir evaluer),
 * data-cfg-calc="nom" (calcul fourni par la page : calculs[nom](élément) renvoie un nombre ou undefined).
 * @param {ParentNode} [racine=document] zone à remplir
 * @param {Object<string, function(HTMLElement): (number|undefined)>} [calculs={}] calculs nommés de la page
 */
export function appliquerReglages(racine = document, calculs = {}) {
  racine.querySelectorAll('[data-cfg], [data-expr], [data-cfg-calc]').forEach((el) => {
    let n;
    if (el.dataset.cfgCalc) n = calculs[el.dataset.cfgCalc]?.(el);
    else if (el.dataset.expr) n = evaluer(el.dataset.expr);
    else n = valeur(el.dataset.cfg);
    if (n === undefined || n === null || n === '') return; // repli : le texte d'origine reste
    el.textContent = typeof n === 'number' ? fmt(n) : String(n);
  });
}
