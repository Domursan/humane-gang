// ===== Humane Gang — série commune des jeux du jour (idée 10) et joker payant (idée 9) =====
/*
 * Rôle : une pastille de série, à la même place dans chaque jeu du jour (première pastille à droite de l'en-tête), et
 *   l'encart « Sauver ma série » quand une série vient de casser.
 *   Règle unique (migration 206) : un jour compte si la partie du jour est finie, réussie ou ratée. La Question du jour
 *   garde son calcul avec le joker gratuit de la semaine. Bascule : minuit à Zurich, 6 h pour la Question du jour et GeoGuessr.
 *   États de la pastille : fait (joué aujourd'hui), attente (à jouer), danger (les 6 dernières heures avant la bascule, série
 *   d'au moins 1 jour), zero (pas de série : « 0 jour », toujours affichée pour garder la place), perdue (série cassée hier
 *   qu'un joker payant peut encore sauver).
 *   Joker payant (migration 207) : seulement le jour d'hier, jusqu'à la bascule, un par semaine et par jeu, à partir de
 *   7 jours ; prix selon la série (200 à 1 500 ✦). Confirmation (ui-confirm.js), puis hg_jeux_joker_payer.
 * Données : RPC hg_jeux_series() (une lecture par page, relue après une partie finie ou un joker payé), hg_jeux_joker_payer(p_jeu).
 * Usage : un jeu pose serieHtml(cle) dans son en-tête et jokerHtml(cle) sous son en-tête (ou jokerHtml(cle, 'semaine') dans
 *   « Ta semaine ») ; les emplacements sont remplis dès que les séries arrivent, et à chaque redessin du jeu.
 *   Après un joker payé, l'événement « jeux:serie » (detail.cle) part sur document.
 * Dépendances : core.js (sb, esc, toast, errMsg), paillettes.js (paillSym), ui-confirm.js (chargé au clic).
 * Exporte : chargerSeries, rafraichirSeries, seriesJeux, serieHtml, jokerHtml, etatSerie.
 */
import { sb, esc, toast, errMsg } from '../../commun/core.js';
import { paillSym } from '../../commun/paillettes.js';

const nf = new Intl.NumberFormat('fr-CH');
const JOUR_LONG = new Intl.DateTimeFormat('fr-CH', { weekday: 'long', timeZone: 'UTC' });
const JOUR_ZH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' });
/** Flamme de la série (dessin, sans emoji). */
const FLAMME = '<svg class="sj-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 1-6 1-8z" fill="currentColor"/></svg>';
/** Dernières heures avant la bascule où la série est « en danger ». */
const DANGER_MS = 6 * 3600e3;

/** État partagé de la page : séries lues, lecture en cours, minuteur de repeinte. */
const S = { data: null, promesse: null, minuteur: null, paiement: false };

/** Feuille de style (/assets/espaces/jeux/jeux-serie.css), ajoutée une fois. */
function css() {
  if (document.querySelector('link[data-jeux-css="serie"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('./jeux-serie.css', import.meta.url).href; l.dataset.jeuxCss = 'serie';
  document.head.append(l);
}

/** « 12 jours », « 1 jour », « 0 jour ». */
const jours = (n) => `${nf.format(n)} jour${n > 1 ? 's' : ''}`;
/** Reste avant la bascule : « 2 h 40 », « 45 min ». */
function reste(ms) {
  const min = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}` : `${m} min`;
}
/** Échéance lisible d'un jeu : « minuit », « 6 h » ou « demain 6 h » (bascule de 6 h tombant un autre jour que maintenant). */
function echeance(s) {
  if (s?.bascule !== '6h') return 'minuit';
  const fin = new Date(s.fin);
  return !Number.isNaN(fin.getTime()) && JOUR_ZH.format(fin) !== JOUR_ZH.format(new Date()) ? 'demain 6 h' : '6 h';
}
/** Date AAAA-MM-JJ → nom du jour (« vendredi »). */
const nomJour = (iso) => { const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`); return Number.isNaN(d.getTime()) ? '' : JOUR_LONG.format(d); };

/**
 * Lit les séries (une fois par page, ou à nouveau avec force) et repeint les emplacements.
 * @param {boolean} [force]
 * @returns {Promise<object|null>} { solde, jeux: { <clé>: { n, joue, jour, bascule, fin, joker? } } } ou null
 */
export function chargerSeries(force = false) {
  css();
  if (S.promesse && !force) return S.promesse;
  S.promesse = (async () => {
    try {
      const { data, error } = await sb.rpc('hg_jeux_series');
      if (error) throw error;
      S.data = data && typeof data === 'object' && data.jeux ? data : null;
    } catch (e) {
      console.warn('[séries]', e);
      S.promesse = null; // nouvelle tentative au prochain appel
    }
    peindre();
    if (!S.minuteur) S.minuteur = setInterval(veiller, 60000);
    return S.data;
  })();
  return S.promesse;
}
/** Relit les séries (après une partie finie, un joker payé). */
export const rafraichirSeries = () => chargerSeries(true);
/** Dernières séries lues (null avant la première lecture ou si elle a échoué). */
export const seriesJeux = () => S.data;

/** Chaque minute : repeint (passage en « danger ») et relit après une bascule. */
function veiller() {
  if (document.hidden || !document.querySelector('[data-sj], [data-sjk]')) return;
  const passe = Object.values(S.data?.jeux || {}).some((s) => new Date(s.fin).getTime() <= Date.now());
  if (passe) rafraichirSeries(); else peindre();
}

/**
 * État de la pastille d'un jeu.
 * @param {object|null} s série d'un jeu (hg_jeux_series)
 * @param {number} [maintenant]
 * @returns {{etat: string, n: number, reste?: string}|null}
 */
export function etatSerie(s, maintenant = Date.now()) {
  if (!s) return null;
  const n = Math.max(0, Number(s.n) || 0);
  if (s.joker?.possible && !s.joue) return { etat: 'perdue', n: Number(s.joker.serie) || 0 };
  if (!n) return { etat: 'zero', n };
  if (s.joue) return { etat: 'fait', n };
  const ms = new Date(s.fin).getTime() - maintenant;
  if (Number.isFinite(ms) && ms > 0 && ms <= DANGER_MS) return { etat: 'danger', n, reste: reste(ms) };
  return { etat: 'attente', n };
}

/** HTML de la pastille d'un jeu (vide tant que les séries ne sont pas lues). */
function pastilleHtml(cle) {
  const s = S.data?.jeux?.[cle];
  const e = etatSerie(s);
  if (!e) return '';
  const quand = `avant ${echeance(s)}`;
  const lib = {
    fait: [jours(e.n), 'joué aujourd’hui', `Série : ${jours(e.n)}, partie du jour jouée.`],
    attente: [jours(e.n), `à jouer ${quand}`, `Série : ${jours(e.n)}. Joue ${quand} pour la garder.`],
    danger: [jours(e.n), `en danger · plus que ${e.reste}`, `Série de ${jours(e.n)} en danger : joue ${quand}, il reste ${e.reste}.`],
    zero: ['0 jour', 'joue pour lancer ta série', 'Pas encore de série : joue aujourd’hui pour la lancer.'],
    perdue: [jours(e.n), `à sauver ${quand}`, `Série de ${jours(e.n)} arrêtée ${s.bascule === '6h' ? nomJour(s.joker?.jour) : 'hier'} : tu peux encore la sauver.`],
  }[e.etat];
  return `<span class="sj is-${e.etat}" role="img" aria-label="${esc(lib[2])}">${FLAMME}<span class="sj-n">${esc(lib[0])}</span><span class="sj-x">${esc(lib[1])}</span></span>`;
}

/**
 * Encart du joker payant (vide sans offre).
 * @param {string} cle clé du jeu
 * @param {'bandeau'|'semaine'} mode bandeau sous l'en-tête, ou encart de « Ta semaine » (Question du jour)
 * @param {{jokerGratuit?: string}} [o] jour du joker gratuit de la semaine (« mercredi »), pour la Question du jour
 */
function encartHtml(cle, mode, o = {}) {
  const s = S.data?.jeux?.[cle];
  const k = s?.joker;
  if (!k || (s.joue && !k.possible)) return '';
  const prix = Number(k.prix) || 0, serie = Number(k.serie) || 0, solde = Number(S.data?.solde) || 0;
  // Série de moins de 7 jours : pas d'offre ; « Ta semaine » le dit simplement.
  if (k.prix == null) {
    return mode === 'semaine' ? `<p class="small muted">Ta série de ${esc(jours(serie))} s’est arrêtée ${esc(nomJour(k.jour))}. Une série se rachète à partir de 7 jours : la tienne repart aujourd’hui.</p>` : '';
  }
  const quand = echeance(s);
  const jusqua = quand === 'minuit' ? 'ce soir minuit' : quand;
  const P = esc(paillSym());
  const id = `jk-t-${esc(cle)}`;
  const tete = mode === 'semaine'
    ? `<b>Ta série de ${esc(jours(serie))} s’est arrêtée ${esc(nomJour(k.jour))}.</b> ${o.jokerGratuit ? `Ton joker gratuit de la semaine est déjà pris (${esc(o.jokerGratuit)}).` : 'Le joker gratuit ne couvre qu’un jour d’oubli.'}`
    : `<b>Ta série de ${esc(jours(serie))} s’est arrêtée hier.</b> Tu peux la sauver jusqu’à ${esc(jusqua)}.`;
  let bas;
  if (k.deja) {
    bas = '<p class="small jk-n">Tu as déjà utilisé ton joker payant de la semaine pour ce jeu.</p>';
  } else if (solde < prix) {
    bas = `<button type="button" class="btn btn-sand jk-btn" disabled aria-describedby="jk-n-${esc(cle)}">Sauver ma série · ${esc(nf.format(prix))} ${P}</button>
      <p class="small jk-n" id="jk-n-${esc(cle)}">Il te manque ${esc(nf.format(prix - solde))} ${P} (ton solde : ${esc(nf.format(solde))} ${P}). Possible jusqu’à ${esc(jusqua)}.</p>`;
  } else {
    bas = `<button type="button" class="btn btn-sand jk-btn" data-sjk-payer="${esc(cle)}">Sauver ma série · ${esc(nf.format(prix))} ${P}</button>
      ${mode === 'semaine' ? `<p class="small muted jk-n">Possible jusqu’à ${esc(jusqua)} · un joker payant par semaine · ton solde : ${esc(nf.format(solde))} ${P}</p>` : ''}`;
  }
  return `<div class="jk${mode === 'semaine' ? '' : ' jk-bandeau'}" role="group" aria-labelledby="${id}"><p class="jk-t" id="${id}">${tete}</p>${bas}</div>`;
}

/**
 * Emplacement de la pastille de série d'un jeu (rempli dès que les séries sont lues).
 * @param {string} cle clé du jeu dans hg_jeux_resultats (sutom, framed, nj_pays, quiz_jour…)
 * @returns {string} HTML
 */
export function serieHtml(cle) {
  chargerSeries();
  return `<span class="sj-place" data-sj="${esc(cle)}">${pastilleHtml(cle)}</span>`;
}
/**
 * Emplacement de l'encart « Sauver ma série » d'un jeu (vide sans offre).
 * @param {string} cle clé du jeu
 * @param {'bandeau'|'semaine'} [mode]
 * @param {{jokerGratuit?: string}} [o]
 * @returns {string} HTML
 */
export function jokerHtml(cle, mode = 'bandeau', o = {}) {
  chargerSeries();
  return `<div class="sj-jk" data-sjk="${esc(cle)}" data-sjk-mode="${mode === 'semaine' ? 'semaine' : 'bandeau'}" data-sjk-gratuit="${esc(o.jokerGratuit || '')}">${encartHtml(cle, mode, o)}</div>`;
}

/** Remplit tous les emplacements de la page avec les séries lues. */
function peindre() {
  for (const el of document.querySelectorAll('[data-sj]')) el.innerHTML = pastilleHtml(el.dataset.sj);
  for (const el of document.querySelectorAll('[data-sjk]')) {
    if (S.paiement && el.contains(document.activeElement)) continue; // ne pas retirer le bouton pendant le paiement
    el.innerHTML = encartHtml(el.dataset.sjk, el.dataset.sjkMode, { jokerGratuit: el.dataset.sjkGratuit });
  }
}

/** Clic sur « Sauver ma série » : confirmation, paiement, séries relues. */
async function payer(bouton) {
  const cle = bouton.dataset.sjkPayer;
  const s = S.data?.jeux?.[cle];
  if (!s?.joker?.possible || S.paiement) return;
  const prix = Number(s.joker.prix) || 0, serie = Number(s.joker.serie) || 0, solde = Number(S.data?.solde) || 0;
  const P = paillSym();
  const jour = s.bascule === '6h' ? nomJour(s.joker.jour) : 'hier';
  const { confirmBox } = await import('../../commun/ui-confirm.js');
  const oui = await confirmBox(`Sauver ta série pour ${nf.format(prix)} ${P} ?`,
    `${jour.charAt(0).toUpperCase()}${jour.slice(1)} compte comme un joker : ta série de ${jours(serie)} continue. Ton solde passe de ${nf.format(solde)} ${P} à ${nf.format(solde - prix)} ${P}. Ce joker ne se rembourse pas.`,
    { ok: `Payer ${nf.format(prix)} ${P}`, cancel: 'Laisser tomber' });
  if (!oui) return;
  S.paiement = true;
  bouton.disabled = true;
  try {
    const { data, error } = await sb.rpc('hg_jeux_joker_payer', { p_jeu: cle });
    if (error) throw error;
    toast?.(`Série sauvée : ${jours(Number(data?.serie) || serie)}.`, 'ok');
    document.dispatchEvent(new CustomEvent('jeux:serie', { detail: { cle } }));
  } catch (e) {
    console.warn('[joker]', e);
    toast?.(errMsg(e), 'error');
  } finally {
    S.paiement = false;
    await rafraichirSeries();
  }
}

document.addEventListener('click', (e) => {
  const b = e.target.closest?.('[data-sjk-payer]');
  if (b && !b.disabled) payer(b);
});
