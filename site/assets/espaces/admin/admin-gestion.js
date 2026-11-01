// =====================================================================
// Admin : Le jeu de cartes › Gestion globale (route #fabrique/gestion, section #cartes-gestion, racine #gestion-root).
// Trois blocs : « Give » (le panier, admin/give-panier.js : même confirmation et même RPC que la fenêtre Give), « Résumé de l’économie » (hg_eco_health via admin/eco-health.js, hg_booster_type_stats,
// hg_auctions_admin : seulement ce que la base renvoie) et « Derniers gives » (hg_admin_log : actions « don_groupe » et « carte_donnee »).
// Droit : « cartes ». Écritures : RPC uniquement (hg_cards_admin_give_panier). Lectures : hg_staff_directory, hg_cards,
// hg_card_sets, hg_card_copies (restants), hg_booster_types, hg_admin_log (lecture seule).
// Dépendances : core.js (sb, toast, errMsg, esc, $), admin/give-panier.js (creerGive),
// admin-cards/helpers.js (check, fetchAll, nf, fmtWhen), admin/eco-health.js (loadEco, alertesEco), admin/visual-pick.js (lectures).
// Exporte : mountGestionSection.
// =====================================================================
import { paillSym } from '../../commun/paillettes.js';
import { sb, toast, errMsg, esc, $ } from '../../commun/core.js';
import { creerGive } from './give-panier.js';
import { check, fetchAll, nf, fmtWhen } from './cartes/helpers.js';
import { loadEco, alertesEco } from './eco-health.js';
import { chargerBoosters, chargerRestants } from './visual-pick.js';

const nf1 = new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1 });
/* Texte normalisé pour la recherche : minuscules et sans accents. */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/* Nombre suivi du mot au singulier ou au pluriel. */
const plur = (n, one, many) => `${nf(n)} ${Number(n) > 1 ? many : one}`;
/* Libellé de la sorte de don dans le journal (valeur de p_kind). */
const QUOI = { paillettes: 'Paillettes', boosters: 'Boosters offerts', carte: 'Carte' };

/* Données lues : membres actifs, cartes, séries, exemplaires restants et types de boosters (index par identifiant). */
const D = { root: null, membres: [], membresById: new Map(), cartes: [], cartesById: new Map(), sets: [], restants: new Map(), types: null };

/** Membres actifs (hors fantômes), triés par pseudo, puis catalogue des cartes, séries, restants et boosters. */
async function chargerDonnees() {
  const [staff, cartes, sets] = await Promise.all([
    sb.rpc('hg_staff_directory'),
    fetchAll(() => sb.from('hg_cards').select('*').order('id')),
    fetchAll(() => sb.from('hg_card_sets').select('id, name, code, sort').order('id')),
  ]);
  D.membres = (check(staff) ?? []).filter((p) => !p.is_ghost).sort((a, b) => a.pseudo.localeCompare(b.pseudo, 'fr'));
  D.membresById = new Map(D.membres.map((p) => [p.id, p]));
  D.cartes = cartes;
  D.cartesById = new Map(cartes.map((k) => [k.id, k]));
  D.sets = sets.sort((a, b) => (a.sort - b.sort) || a.code.localeCompare(b.code));
  const setsById = new Map(D.sets.map((s) => [s.id, s]));
  D.cartes.forEach((k) => { k.set_name = setsById.get(k.set_id)?.name; });
  // Restants et boosters : un échec ne bloque pas le bloc Give (le sélecteur concerné reste indisponible).
  const [rest, boost] = await Promise.allSettled([chargerRestants(D.cartes), chargerBoosters()]);
  D.restants = rest.status === 'fulfilled' ? rest.value.restants : new Map();
  D.types = boost.status === 'fulfilled' ? boost.value : null;
  D.typesErreur = boost.status === 'fulfilled' ? '' : errMsg(boost.reason);
}

/* ---------- Bloc « Give » ---------- */

/** HTML du bloc Give : le panier se monte dans #gest-panier une fois les données lues. */
function giveHtml() {
  return `<section class="card gest-give" aria-labelledby="gest-give-h">
    <div>
      <h2 class="card-title" id="gest-give-h">Give</h2>
      <p class="small muted">Donner à un ou plusieurs membres, puis inscrire le geste au journal.</p>
    </div>
    <div id="gest-panier"><p class="small muted">Chargement…</p></div>
  </section>`;
}

/** Monte le panier et son bouton « Donner » ; après un don, le journal et le résumé sont relus. */
function monterGive(root) {
  const give = creerGive($('#gest-panier', root), {
    membres: D.membres, cards: D.cartes.filter((k) => k.active), sets: D.sets, restants: D.restants,
    types: D.types, typesErreur: D.typesErreur, idp: 'gest', envoi: true,
  });
  give.bouton.addEventListener('click', async () => {
    give.bouton.disabled = true;
    try {
      const res = await give.donner();
      if (!res) return;
      toast(`Don envoyé à ${plur(Number(res.membres) || 1, 'membre', 'membres')}`, 'ok');
      give.vider();
      await Promise.all([rendreEco(), rendreJournal()]);
    } finally {
      give.bouton.disabled = false;
    }
  });
}

/* ---------- Bloc « Résumé de l’économie » ---------- */

/** Lecture d’une réponse Supabase : la donnée, ou l’erreur levée. */
const reponse = async (p) => { const r = await p; if (r.error) throw r.error; return r.data; };

/** Dessine le résumé : Paillettes en circulation, boosters ouverts sur 7 jours, enchère en cours, alertes, liens. Le sous-texte de chaque tuile est déjà échappé. */
async function rendreEco() {
  const el = $('#gest-eco', D.root);
  el.innerHTML = '<p class="small muted">Chargement…</p>';
  const [eco, stats, encheres] = await Promise.allSettled([
    loadEco().then(() => alertesEco()),
    reponse(sb.rpc('hg_booster_type_stats')),
    reponse(sb.rpc('hg_auctions_admin')),
  ]);
  const chiffres = [];
  // Paillettes en circulation et variation sur 7 jours (hg_eco_health)
  const donnees = eco.status === 'fulfilled' ? eco.value.donnees : null;
  if (donnees?.paillettes) {
    const p = donnees.paillettes;
    const pct = p.pct == null ? 'pas de référence' : `${p.pct >= 0 ? '+' : ''}${nf1.format(p.pct)} % sur 7 jours`;
    chiffres.push(['Paillettes en circulation', `${nf(p.total ?? 0)} ${paillSym()}`, esc(pct)]);
  } else {
    chiffres.push(['Paillettes en circulation', '–', esc(eco.status === 'rejected' ? errMsg(eco.reason) : 'indisponible')]);
  }
  // Boosters ouverts sur les 7 derniers jours (hg_booster_type_stats, somme des types)
  if (stats.status === 'fulfilled') {
    const ouverts = (stats.value?.types ?? []).reduce((s, t) => s + (Number(t.opens?.d7) || 0), 0);
    chiffres.push(['Boosters ouverts', nf(ouverts), 'sur les 7 derniers jours']);
  } else {
    chiffres.push(['Boosters ouverts', '–', esc(errMsg(stats.reason))]);
  }
  // Enchères ouvertes (hg_auctions_admin, statut « ouverte »)
  if (encheres.status === 'fulfilled') {
    const ouvertes = (encheres.value ?? []).filter((a) => a.status === 'ouverte');
    const premiere = ouvertes[0];
    chiffres.push(['Enchères en cours', nf(ouvertes.length),
      premiere ? `${esc(premiere.card_name)}, fin ${esc(fmtWhen(premiere.ends_at))}` : 'aucune enchère ouverte']);
  } else {
    chiffres.push(['Enchères en cours', '–', esc(errMsg(encheres.reason))]);
  }
  // Alertes rouges expliquées (eco-health), avec le lien vers le réglage
  const alertes = eco.status === 'fulfilled' ? eco.value : { liste: [], suspendues: false, erreur: errMsg(eco.reason) };
  const erreurEco = alertes.erreur ? `<p class="form-error" role="alert">Alertes indisponibles : ${esc(alertes.erreur)}</p>` : '';
  el.innerHTML = `<h2 class="card-title" id="gest-eco-h">Résumé de l’économie</h2>
    <div class="acd-tiles">
      ${chiffres.map(([label, valeur, sous]) => `<div class="acd-tile"><strong>${esc(valeur)}</strong><span>${esc(label)}</span><span class="small muted">${sous}</span></div>`).join('')}
    </div>
    ${erreurEco}
    <div>
      <p class="gest-titre-petit">À surveiller</p>
      ${alertes.liste.length ? alertes.liste.map((a) => `<div class="eco-alert" data-tone="${alertes.suspendues ? 'off' : 'bad'}">
          <div class="eco-alert-txt"><strong>${esc(a.title)}</strong><span class="small">${esc(a.text)}</span></div>
          <div class="eco-alert-act"><a class="btn btn-sand btn-sm" href="${esc(a.href)}">${esc(a.act)}</a></div></div>`).join('')
        : `<p class="small muted">${alertes.suspendues ? 'Alertes suspendues pour le moment.' : 'Aucune alerte rouge pour le moment.'}</p>`}
    </div>
    <div class="btn-row">
      <a class="btn btn-ghost btn-sm" href="#fabrique/limites">Économie › Limites</a>
      <a class="btn btn-ghost btn-sm" href="#fabrique/stats">Suivi › Statistiques</a>
    </div>`;
}

/* ---------- Bloc « Derniers gives » ---------- */

/** Noms des destinataires : trois au plus, puis le nombre restant. */
function nomsDestinataires(ids) {
  const noms = ids.map((id) => D.membresById.get(id)?.pseudo ?? 'Ancien membre');
  if (noms.length <= 3) return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : noms.join('');
  return `${noms[0]}, ${noms[1]} et ${noms.length - 2} autres`;
}

/**
 * Une ligne « carte donnée » (un destinataire, une carte) : écrite par hg_cards_admin_give (migration 040),
 * target_user = destinataire, target_ref = id de la carte, details = { exemplaires, brillante, annonce }.
 */
function ligneCarteDonnee(r) {
  const d = r.details || {};
  const dest = D.membresById.get(r.target_user)?.pseudo ?? 'Ancien membre';
  const carte = D.cartesById.get(r.target_ref)?.name ?? 'carte';
  const n = Math.max(1, Number(d.exemplaires) || 1);
  return `<li class="acd-item acd-item-tight">
      <div class="acd-item-main">
        <p><strong>${esc(dest)}</strong> <span class="small muted">Carte donnée</span></p>
        <p class="small">${esc(plur(n, 'exemplaire', 'exemplaires'))} de « ${esc(carte)} »${d.brillante ? ' (brillante)' : ''}</p>
      </div>
      <span class="small muted">${esc(fmtWhen(r.created_at))}</span>
    </li>`;
}

/** Une ligne « panier » (migration 196) : qui, le détail du don, les totaux, quand, motif. */
function lignePanier(r, d, ids, membres) {
  const qui = d.tout_le_gang ? `Tout le gang (${plur(membres, 'membre', 'membres')})` : nomsDestinataires(ids);
  const p = Number(d.paillettes) || 0, ex = Number(d.exemplaires) || 0, bo = Number(d.boosters) || 0;
  const total = [p && `${nf(p * membres)} Paillettes`, ex && plur(ex * membres, 'exemplaire', 'exemplaires'), bo && plur(bo * membres, 'booster', 'boosters')].filter(Boolean).join(', ');
  return `<li class="acd-item acd-item-tight">
      <div class="acd-item-main">
        <p><strong>${esc(qui)}</strong> <span class="small muted">Panier</span></p>
        <p class="small">${esc((Array.isArray(d.resume) ? d.resume : []).join(' · '))}</p>
        <p class="small">Total : ${esc(total)}</p>
        ${d.note ? `<p class="small muted">Motif : ${esc(d.note)}</p>` : ''}
      </div>
      <span class="small muted">${esc(fmtWhen(r.created_at))}</span>
    </li>`;
}

/** Une ligne du journal : qui, quoi (par membre et total), quand, motif. */
function ligneDon(r) {
  const d = r.details || {};
  const ids = Array.isArray(d.destinataires) ? d.destinataires : [];
  const membres = Number(d.membres) || ids.length;
  if (r.target_ref === 'panier') return lignePanier(r, d, ids, membres);
  const par = Number(d.montant) || 0;
  const quoi = r.target_ref === 'paillettes' ? `${nf(par)} Paillettes par membre`
    : r.target_ref === 'boosters' ? `${plur(par, 'booster offert', 'boosters offerts')} par membre`
    : `${plur(par, 'exemplaire', 'exemplaires')} de « ${D.cartesById.get(d.carte)?.name ?? 'carte'} »${d.brillante ? ' (brillante)' : ''} par membre`;
  const qui = d.tout_le_gang ? `Tout le gang (${plur(membres, 'membre', 'membres')})` : nomsDestinataires(ids);
  const total = membres * par;
  const totalTxt = membres > 1 ? ` · ${r.target_ref === 'paillettes' ? `${nf(total)} Paillettes`
    : r.target_ref === 'boosters' ? plur(total, 'booster', 'boosters') : plur(total, 'exemplaire', 'exemplaires')} au total` : '';
  return `<li class="acd-item acd-item-tight">
      <div class="acd-item-main">
        <p><strong>${esc(qui)}</strong> <span class="small muted">${esc(QUOI[r.target_ref] ?? r.target_ref)}</span></p>
        <p class="small">${esc(quoi)}${esc(totalTxt)}</p>
        ${d.note ? `<p class="small muted">Motif : ${esc(d.note)}</p>` : ''}
      </div>
      <span class="small muted">${esc(fmtWhen(r.created_at))}</span>
    </li>`;
}

/** Dessine les 10 derniers dons (hg_admin_log : « don_groupe » et « carte_donnee », un seul destinataire). */
async function rendreJournal() {
  const el = $('#gest-journal', D.root);
  el.innerHTML = '<p class="small muted">Chargement…</p>';
  try {
    const { data, error } = await sb.from('hg_admin_log').select('id, admin_id, action, target_user, target_ref, details, created_at')
      .in('action', ['don_groupe', 'carte_donnee']).order('created_at', { ascending: false }).limit(10);
    if (error) throw error;
    const lignes = (data ?? []).slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 10);
    el.innerHTML = `<div class="gest-entete"><h2 class="card-title" id="gest-journal-h">Derniers gives</h2>
        <a class="small" href="#mairie/journal">Voir le journal</a></div>
      ${lignes.length ? `<ul class="acd-list">${lignes.map((r) => (r.action === 'carte_donnee' ? ligneCarteDonnee(r) : ligneDon(r))).join('')}</ul>` : '<p class="small muted">Aucun don pour l’instant.</p>'}`;
  } catch (e) {
    el.innerHTML = `<div class="gest-entete"><h2 class="card-title" id="gest-journal-h">Derniers gives</h2></div>
      <p class="form-error" role="alert">Journal indisponible : ${esc(errMsg(e))}</p>`;
  }
}

/* ---------- Montage ---------- */

/**
 * Monte la section Gestion globale.
 * @param {HTMLElement} root Conteneur #gestion-root.
 */
export async function mountGestionSection(root) {
  D.root = root;
  root.innerHTML = `<div id="gest-give-zone">${giveHtml()}</div>
    <div class="gest">
      <section class="card gest-eco" id="gest-eco" aria-labelledby="gest-eco-h"><p class="small muted">Chargement…</p></section>
      <section class="card gest-journal" id="gest-journal" aria-labelledby="gest-journal-h"><p class="small muted">Chargement…</p></section>
    </div>`;
  try {
    await chargerDonnees();
  } catch (e) {
    $('#gest-give-zone', root).innerHTML = `<div class="empty">Impossible de charger les membres et les cartes : ${esc(errMsg(e))}</div>`;
    toast(errMsg(e), 'error');
    return;
  }
  monterGive(root);
  await Promise.all([rendreEco(), rendreJournal()]);
}
