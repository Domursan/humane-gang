// ===== Humane Gang — Jeux › « Mes stats » (idée 18) =====
/*
 * Rôle : la vue /pages/jeux/jeux.html#mes-stats, ouverte depuis « Ma carte » (bouton « Mes stats de jeux ») : mes chiffres
 * des 19 jeux du jour notés dans hg_jeux_resultats, sur une période au choix (7 jours, ce mois, depuis le début).
 * Quatre tuiles (parties, moyenne sur 10, Paillettes gagnées avec les bonus « 16 jeux », meilleure série), « Ton rival »
 * (le membre juste au-dessus de moi au classement de la période, même calcul que hg_jeux_classement), puis un tableau
 * jeu par jeu : parties, réussies, moyenne, meilleur score sur 10, série en cours et record ; sous le nom du jeu,
 * Paillettes, essais moyens (jeux à essais) et temps moyen. Duels, Uno et plateaux gardent leur page : liens seulement.
 * Visible par le membre seul : la fonction serveur ne lit que auth.uid(). Une seule lecture par affichage.
 * États : chargement (squelettes), nouveau membre sans partie, période sans partie, erreur avec « Réessayer ».
 * Ce n'est pas un jeu : pas d'onglet dans la barre, pas de ligne dans « Les missions quotidiennes » (jeux.js, LISTE).
 * Contrat : mount(panel, ctx). Dépendances : core.js (esc, errMsg, avatarHtml), jeux/commun.js, jeux/catalogue.js (titres et images),
 * jeux/classement-jeux.js (CLE_JEU). Données : RPC hg_jeux_mes_stats(p_periode) (migration 208).
 */
import { esc, errMsg, avatarHtml } from '../../commun/core.js';
import { paillSym } from '../../commun/paillettes.js';
import { chargerCss, nf } from './commun.js';
import { CARTES } from './catalogue.js';
import { CLE_JEU } from './classement-jeux.js';

/* ---------- Constantes ---------- */
/** Périodes proposées : valeur envoyée au serveur, libellé du bouton, tournure dans les phrases. */
const PERIODES = [['7', '7 jours', 'sur 7 jours'], ['mois', 'Ce mois', 'ce mois-ci'], ['tout', 'Depuis le début', 'depuis le début']];
/** Jeux où le palier est un nombre d'essais (les grilles, le Sudoku et la Question du jour n'ont pas d'essais). */
const A_ESSAIS = new Set(['sutom', 'framed', 'heardle', 'code_jour', 'nj_carte', 'nj_jv', 'nj_pochette', 'nj_replique', 'nj_pays', 'nj_plat', 'nj_nerdle']);
/** Clé de hg_jeux_resultats → carte du catalogue (titre, image). Le Code du jour n'a pas d'onglet ici (page des duels). */
const INFO = new Map(CARTES.filter((c) => c.onglet && CLE_JEU[c.onglet]).map((c) => [CLE_JEU[c.onglet], c]));
INFO.set('code_jour', CARTES.find((c) => c.id === 'code-du-jour') || { titre: 'Code du jour' });
/** Flamme de série (même dessin que « Ton programme du jour »). */
const FLAMME = '<svg class="ms-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 1-6 1-8z" fill="currentColor"/></svg>';
/** « 7,3 » (une décimale au plus). */
const nf1 = (n) => new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 1 }).format(Number(n) || 0);
const fmtLong = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'long', timeZone: 'Europe/Zurich' });
const fmtCourt = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'Europe/Zurich' });
/** Date « 27 octobre » ou « 27 oct. » d'un jour AAAA-MM-JJ (midi UTC : jamais de changement de jour). */
const jour = (iso, court = false) => { const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`); return Number.isNaN(d.getTime()) ? '' : (court ? fmtCourt : fmtLong).format(d).replace(/^1 /, '1er '); };
/** « 1er », « 4e ». */
const rang = (n) => `${nf(n)}${n === 1 ? 'er' : 'e'}`;
/** « 45 s », « 1 min 05 ». */
const duree = (s) => { const n = Math.round(Number(s) || 0); return n < 60 ? `${n} s` : `${Math.floor(n / 60)} min ${String(n % 60).padStart(2, '0')}`; };
const jours = (n) => `${nf(n)} jour${n > 1 ? 's' : ''}`;

/* ---------- État ---------- */
// panel, ctx ; periode : période choisie ; data : dernière réponse ; busy : lecture en cours.
let C = null;

/* ---------- Montage ---------- */
/**
 * Monte la vue « Mes stats ».
 * @param {HTMLElement} panel Panneau vide de la vue.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte de la page.
 */
export async function mount(panel, ctx) {
  chargerCss('mes-stats');
  C = { panel, ctx, periode: 'tout', data: null, busy: false };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ms-per]');
    if (b) { if (b.dataset.msPer !== C.periode) { C.periode = b.dataset.msPer; charger(); } return; }
    if (e.target.closest('[data-ms-retry]')) charger();
  });
  await charger();
}

/* ---------- Lecture ---------- */
/** Lit les stats de la période choisie (une seule RPC) et dessine. */
async function charger() {
  if (!C || C.busy) return;
  C.busy = true;
  peindreChargement();
  try {
    const { data, error } = await C.ctx.sb.rpc('hg_jeux_mes_stats', { p_periode: C.periode });
    if (error) throw error;
    if (!data || typeof data !== 'object') throw new Error('Réponse vide');
    C.data = data;
    peindre();
  } catch (e) {
    peindreErreur(errMsg(e));
  } finally {
    C.busy = false;
  }
}

/* ---------- Dessin ---------- */
/** En-tête : petit titre, « Mes stats », sous-titre, boutons de période. */
function teteHtml(sous) {
  return `<div class="ms-tete"><div><p class="ms-code">// Jeux du jour</p><h2 class="ms-h" id="ms-h">Mes stats</h2>
      <p class="small muted">${sous}</p></div>
    <div class="jg-seg" role="group" aria-label="Période">${PERIODES.map(([v, l]) => `<button type="button" data-ms-per="${v}" aria-pressed="${String(v === C.periode)}">${l}</button>`).join('')}</div></div>`;
}
/** Une tuile : libellé, valeur (HTML déjà sûr), sous-texte. */
const tuileHtml = (k, v, s = '') => `<div class="ms-tuile"><span class="ms-k">${k}</span><b class="ms-v">${v}</b>${s ? `<span class="ms-s">${s}</span>` : ''}</div>`;

function peindreChargement() {
  C.panel.innerHTML = `<section class="ms" aria-labelledby="ms-h" aria-busy="true">${teteHtml('Chargement de tes chiffres…')}
    <div class="ms-tuiles">${'<div class="ms-tuile ms-sk"></div>'.repeat(4)}</div><div class="jg-card ms-sk ms-sk-l"></div></section>`;
}

function peindreErreur(msg) {
  C.panel.innerHTML = `<section class="ms" aria-labelledby="ms-h">${teteHtml('Visible par toi seul')}
    <div class="jg-card ms-vide" role="alert"><p><strong>Tes stats n’ont pas pu se charger.</strong></p><p class="small muted">${esc(msg)}</p>
      <button class="btn btn-ghost" type="button" data-ms-retry>Réessayer</button></div></section>`;
}

/** Sous-titre selon la période : d'où partent les chiffres. */
function sousTitre(d) {
  const de = d.de ? jour(d.de) : '';
  if (!de) return 'Visible par toi seul';
  if (C.periode === '7') return `Les 7 derniers jours, depuis le ${de} · visible par toi seul`;
  if (C.periode === 'mois') return `Depuis le ${de} · visible par toi seul`;
  return `Depuis le ${de}, date des premiers résultats enregistrés · visible par toi seul`;
}

/** Ligne du tableau d'un jeu. */
function ligneHtml(j, d) {
  const info = INFO.get(j.jeu) || { titre: j.jeu };
  const img = info.image ? `<img src="${esc(info.image)}" alt="" width="40" height="27" loading="lazy" decoding="async">` : '';
  const parties = Number(j.parties) || 0;
  // Sous le nom : date de début si le jeu est arrivé après les autres, Paillettes, essais moyens, temps moyen
  const notes = [];
  if (parties && j.depuis && d.de && j.depuis > d.de) notes.push(`depuis le ${jour(j.depuis, true)}`);
  if (parties) {
    notes.push(`${nf(j.paillettes)} ${paillSym()}`);
    if (A_ESSAIS.has(j.jeu) && j.essais != null) notes.push(`${nf1(j.essais)} essai${Number(j.essais) >= 2 ? 's' : ''} en moyenne`);
    if (j.secondes != null) notes.push(`${duree(j.secondes)} en moyenne${j.sans_temps ? ` (${nf(parties - j.sans_temps)} partie${parties - j.sans_temps > 1 ? 's' : ''} chronométrée${parties - j.sans_temps > 1 ? 's' : ''})` : ''}`);
    else notes.push('temps non noté');
  }
  const nom = `<th scope="row"><span class="ms-jeu">${img}<span>${esc(info.titre)}${notes.length ? `<span class="ms-dep">${notes.join(' · ')}</span>` : ''}</span></span></th>`;
  if (!parties) return `<tr class="is-vide">${nom}<td colspan="5" data-k="">Pas encore de partie notée</td></tr>`;
  const serie = Number(j.serie) || 0;
  return `<tr>${nom}
    <td data-k="Parties">${nf(parties)}</td><td data-k="Réussies">${nf(j.reussies)}</td>
    <td data-k="Moyenne">${nf1(j.moyenne)}<span class="ms-sur"> / 10</span></td><td data-k="Meilleur">${nf(j.meilleur)}</td>
    <td data-k="Série">${serie ? `<span class="ms-fl">${FLAMME}${nf(serie)}</span>` : '0'}<span class="ms-sur"> · record ${nf(j.record)}</span></td></tr>`;
}

/** Carte « Ton rival » : le membre juste devant moi au classement de la période. */
function rivalHtml(d) {
  const tournure = PERIODES.find(([v]) => v === C.periode)?.[2] || '';
  const moi = d.moi, r = d.rival;
  let phrase, note;
  if (!moi) {
    phrase = 'Pas encore de classement : joue un jeu du jour sur cette période.';
    note = 'Rival = le membre juste au-dessus de toi au classement de la période.';
  } else if (r) {
    const e = Number(r.ecart) || 0;
    phrase = `${avatarHtml(r, 36)}<span><b>${esc(r.pseudo || 'Membre')}</b> est juste devant toi : ${nf(r.points)} pt${r.points > 1 ? 's' : ''}, ${nf(e)} de plus.</span>`;
    note = `Toi : ${nf(moi.points)} pt${moi.points > 1 ? 's' : ''}, ${rang(moi.rang)} sur ${nf(moi.total)} ${tournure}. Rival = le membre juste au-dessus de toi au classement de la période.`;
  } else {
    phrase = `<span><b>Personne devant toi</b> : tu es ${rang(1)} sur ${nf(moi.total)} ${tournure}, avec ${nf(moi.points)} pt${moi.points > 1 ? 's' : ''}.</span>`;
    note = 'Rival = le membre juste au-dessus de toi au classement de la période. À toi de garder la place.';
  }
  return `<div class="jg-card ms-rival"><div><p class="ms-k">Ton rival</p><p class="ms-rv">${phrase}</p></div><p class="small muted">${note}</p></div>`;
}

function peindre() {
  const d = C.data;
  const P = paillSym();
  const tete = teteHtml(sousTitre(d));
  // Nouveau membre : aucune partie, toutes périodes confondues
  if (!(Number(d.toutes_parties) || 0)) {
    C.panel.innerHTML = `<section class="ms" aria-labelledby="ms-h">${teteHtml('Visible par toi seul')}
      <div class="jg-card ms-vide"><p><b>Pas encore de chiffres.</b></p>
        <p class="muted small">Tes stats apparaissent après ta première partie d’un jeu du jour : parties, moyenne sur 10, meilleur score et série, jeu par jeu.</p>
        <a class="btn btn-sand" href="/pages/jeux/jeux.html#quotidien">Voir les jeux du jour</a></div></section>`;
    return;
  }
  const jeux = (Array.isArray(d.jeux) ? d.jeux : []).slice()
    .sort((a, b) => (Number(b.parties) || 0) - (Number(a.parties) || 0) || (INFO.get(a.jeu)?.titre || a.jeu).localeCompare(INFO.get(b.jeu)?.titre || b.jeu, 'fr'));
  const t = d.total || {}, bonus = d.bonus || {};
  const parties = Number(t.parties) || 0, reussies = Number(t.reussies) || 0;
  const paillettes = (Number(t.paillettes) || 0) + (Number(bonus.paillettes) || 0);
  // Meilleure série en cours, et les jeux qui la tiennent
  const best = Math.max(0, ...jeux.map((j) => Number(j.serie) || 0));
  const record = Math.max(0, ...jeux.map((j) => Number(j.record) || 0));
  const tenants = best ? jeux.filter((j) => Number(j.serie) === best).map((j) => INFO.get(j.jeu)?.titre || j.jeu) : [];
  const nomsSerie = tenants.length <= 3 ? tenants.join(tenants.length === 2 ? ' et ' : ', ') : `${tenants.slice(0, 2).join(', ')} et ${nf(tenants.length - 2)} autres`;
  const tuiles = `<div class="ms-tuiles">
    ${tuileHtml('Parties', nf(parties), parties ? `${nf(reussies)} réussie${reussies > 1 ? 's' : ''}` : 'aucune sur cette période')}
    ${tuileHtml('Moyenne', parties ? `${nf1(t.moyenne)} <small>/ 10</small>` : '–')}
    ${tuileHtml('Paillettes gagnées', `${nf(paillettes)} ${P}`, Number(bonus.n) ? `dont ${nf(bonus.n)} bonus « 16 jeux »` : '')}
    ${tuileHtml('Meilleure série', best ? `<span class="ms-fl">${FLAMME}${nf(best)}</span> jour${best > 1 ? 's' : ''}` : '0 jour', best ? esc(nomsSerie) : record ? `record : ${jours(record)}` : 'joue pour lancer une série')}
  </div>`;
  const tableau = parties
    ? `<div class="ms-wrap"><table class="ms-t"><thead><tr><th scope="col">Jeu</th><th scope="col">Parties</th><th scope="col">Réussies</th><th scope="col">Moyenne</th><th scope="col">Meilleur</th><th scope="col">Série</th></tr></thead>
        <tbody>${jeux.map((j) => ligneHtml(j, d)).join('')}</tbody></table></div>`
    : '<p class="small muted ms-wrap">Aucune partie sur cette période. Change de période pour voir tes chiffres.</p>';
  C.panel.innerHTML = `<section class="ms" aria-labelledby="ms-h">${tete}
    ${tuiles}
    ${rivalHtml(d)}
    <div class="jg-card ms-carte"><div class="jg-between"><h3 class="jg-h3">Jeu par jeu</h3><span class="small muted">${nf(jeux.length)} jeux · trié par parties</span></div>${tableau}</div>
    <div class="jg-card ms-autres"><h3 class="jg-h3">Tes autres stats</h3><p class="small muted">Les jeux à plusieurs gardent leur page : mêmes chiffres qu’aujourd’hui.</p>
      <div class="ms-liens"><a class="btn btn-ghost" href="/pages/jeux/duels.html#stats">Duels</a><a class="btn btn-ghost" href="/pages/jeux/uno.html#stats">Uno</a><a class="btn btn-ghost" href="/pages/jeux/blackjack.html#stats">Plateaux</a></div></div>
  </section>`;
}

/** Rien à libérer : aucun minuteur ni abonnement. */
export function unmount() { C = null; }
