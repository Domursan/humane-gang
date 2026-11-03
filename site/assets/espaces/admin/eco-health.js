// Admin : alertes « Santé de l'économie » (idée A7). Staff « cartes » et administrateur.
// Calcule les alertes rouges (booster trop rentable au recyclage, Paillettes en hausse, recyclage élevé, gains concentrés)
// à partir de RPC hg_eco_health() (lecture seule, migration 093) : compteur des lieux (counts.js), « À faire » de La Fabrique
// de cartes (ecoTodoItems) et section Gestion globale (alertesEco). « Ignorer cette semaine » : hg_eco_alerts_ignore.
// Le détail des gains concentrés (qui, d'où) n'est renvoyé par la base qu'à l'administrateur, sans jugement.
// Utilisé par counts.js (loadEco, ecoTile, ecoTodoItems via admin.js), admin-gestion.js (alertesEco). Dépend de core.js
// (sb, toast, errMsg) et perms.js.
import { sb, toast, errMsg } from '../../commun/core.js';
import { canSection } from './perms.js';

// Dernière réponse de hg_eco_health (null : pas encore chargée ou pas de droit), et erreur éventuelle.
const H = { data: null, error: null };
const nf = new Intl.NumberFormat('fr-CH');
const nf1 = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1 });
/** Libellés des raisons du journal des Paillettes (détail des gains concentrés). */
const REASON = { quete: 'quêtes', defi: 'défis', challenge: 'challenges', booster: 'boosters', quotidien: 'passage du jour', recyclage: 'recyclage', fabrication: 'fabrication',
  echange: 'échanges', photo: 'photos', moment: 'moments', badge: 'badges', capture: 'captures', admin: 'ajustements admin', serie_complete: 'séries complètes' };

/** Charge la santé de l'économie (si la personne a le droit « cartes »). Une erreur est gardée pour l'affichage. */
export async function loadEco() {
  if (!canSection('cartes')) return;
  try {
    const { data, error } = await sb.rpc('hg_eco_health');
    if (error) throw error;
    H.data = data || null;
    H.error = null;
  } catch (e) { H.error = errMsg(e); }
}

/** Les alertes sont-elles suspendues (« Ignorer cette semaine ») ? */
const ignored = () => !!H.data?.ignore_until && new Date(H.data.ignore_until) > new Date();

/**
 * Alertes rouges, expliquées, avec le lien vers le réglage concerné.
 * @returns {Array<{key: string, title: string, text: string, href: string, act: string}>}
 */
function alerts() {
  const d = H.data;
  if (!d) return [];
  const s = d.seuils || {};
  const out = [];
  const w = d.booster_max;
  if (w && (d.boosters || []).some((b) => b.id === w.id && b.level === 'bad')) {
    out.push({ key: 'booster', title: `Le booster ${w.name} rapporte ${nf.format(w.ratio)} % de son prix au recyclage.`,
      text: `Valeur attendue ${nf.format(w.ev)} Paillettes pour un prix de ${nf.format(w.price)} : ouvrir puis tout recycler fait gagner des Paillettes (seuil ${nf.format(s.booster_pct)} %).`,
      href: '#fabrique/boosters', act: 'Ouvrir Boosters' });
  }
  if (d.paillettes?.level === 'bad') {
    out.push({ key: 'paillettes', title: `Les Paillettes en jeu ont augmenté de ${nf1.format(d.paillettes.pct)} % en 7 jours.`,
      text: `Seuil ${nf.format(s.paillettes_pct)} %. Un événement (Noël, drop) peut l’expliquer ; sinon, une récompense est peut-être trop généreuse.`,
      href: '#fabrique/economie', act: 'Ouvrir Paillettes et dons' });
  }
  if (d.recyclage?.level === 'bad') {
    out.push({ key: 'recyclage', title: `${nf1.format(d.recyclage.pct)} % des cartes obtenues cette semaine ont été recyclées.`,
      text: `Seuil ${nf.format(s.recyclage_pct)} % : les cartes ne valent peut-être plus grand-chose aux yeux du gang.`,
      href: '#fabrique/recyclage', act: 'Ouvrir Recyclage' });
  }
  const c = d.concentration;
  if (c?.level === 'bad') {
    const top = c.top;
    const src = top ? Object.entries(top.sources || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${REASON[k] || k} ${nf.format(n)}`).join(', ') : '';
    out.push({ key: 'concentration', title: `Un membre a gagné ${nf1.format(c.ratio)} fois la médiane des gains de la semaine.`,
      text: top ? `${top.pseudo} : ${nf.format(top.gains)} Paillettes (${src}). Souvent un bug ou un réglage trop généreux.` : 'Souvent un bug ou un réglage trop généreux.',
      href: top ? `#fabrique/joueurs/${encodeURIComponent(top.user_id)}` : '#fabrique/recyclage', act: top ? 'Voir le joueur' : 'Ouvrir les seuils' });
  }
  return out;
}

/**
 * Alertes rouges du moment (après loadEco) pour la section Gestion globale : liste expliquée, et suspension en cours.
 * @returns {{liste: Array<{key: string, title: string, text: string, href: string, act: string}>, suspendues: boolean, erreur: string, donnees: object|null}}
 *   donnees : la réponse de hg_eco_health (null si pas encore chargée).
 */
export function alertesEco() {
  return { liste: alerts(), suspendues: ignored(), erreur: H.error || '', donnees: H.data };
}

/** Tuile de la vue d'ensemble (nombre d'alertes rouges), ou null sans droit / sans données. */
export function ecoTile() {
  if (!canSection('cartes') || !H.data) return null;
  const list = ignored() ? [] : alerts();
  const n = list.length;
  return { value: n, label: n > 1 ? 'alertes économie' : 'alerte économie', warn: n > 0, href: list[0]?.href || '#fabrique/recyclage' };
}

/**
 * Éléments « À faire » de La Fabrique de cartes (registerTodo) : une ligne par alerte rouge non suspendue, avec le lien
 * vers le réglage ; la première porte « Ignorer cette semaine ». Vide sans droit « cartes » ou sans données.
 */
export function ecoTodoItems() {
  if (!canSection('cartes') || !H.data || ignored()) return [];
  return alerts().map((a, i) => ({
    title: a.title,
    meta: a.text,
    actions: [
      { label: a.act, href: a.href },
      ...(i === 0 ? [{ label: 'Ignorer cette semaine', onClick: () => ignoreEco(7) }] : []),
    ],
  }));
}

/**
 * Suspend les alertes économie pour `days` jours (0 : les reprend). Recharge la santé de l'économie et prévient le reste
 * du panel (compteurs, « À faire »).
 */
export async function ignoreEco(days) {
  try {
    const { error } = await sb.rpc('hg_eco_alerts_ignore', { p_days: days });
    if (error) throw error;
    toast(days ? 'Alertes économie suspendues pour 7 jours' : 'Alertes économie reprises', 'ok');
    await loadEco();
    document.dispatchEvent(new CustomEvent('hg:eco-changed'));
  } catch (ex) { toast(errMsg(ex), 'error'); }
}
