// ===== Humane Gang — Heardle du gang : historique des morceaux (sous le jeu du jour) =====
/*
 * Rôle : la section « Historique du Heardle » de l'onglet Heardle (maquette validée le 30/10/2026) : toutes les manches
 * passées, de la plus récente à la plus ancienne, avec mes chiffres (trouvés, moyenne, série), une recherche par titre
 * ou artiste et les filtres Tous / Trouvés / Ratés. Au départ, les 3 dernières manches seulement ; « Voir tout
 * l'historique » montre les autres (une recherche ou un filtre cherche toujours dans tout l'historique). Chaque ligne s'ouvre en menu déroulant : joueurs, moyenne,
 * répartition des essais, scores du gang (carrés des essais, Paillettes) et lien pour réécouter le morceau sur YouTube.
 * Les données (RPC hg_heardle_historique, migration 178) sont chargées une fois ; la section se redessine depuis la
 * mémoire à chaque rendu de l'onglet. La manche du jour n'y est jamais.
 * Manches pas encore jouées (idée 13, migration 213) : le serveur ne donne ni titre, ni artiste, ni vidéo (cache) ; la
 * ligne ne s'ouvre pas et propose « Jouer » (#heardle-AAAA-MM-JJ) si la manche est dans les 30 dernières (jouable).
 * Dépendances : core.js (avatarHtml), paillettes.js (paillSym), devine.js (loadCss). Exporte : monterHistorique(box, ctx), relireHistorique().
 */
import { avatarHtml } from '../../commun/core.js';
import { paillSym } from '../../commun/paillettes.js';
import { loadCss } from './devine.js';
import { stylesArchives } from './archives-jeux.js';

/** Manches montrées au départ (« Voir tout l'historique » montre les autres). */
const DEBUT = 3;
const jourCourt = new Intl.DateTimeFormat('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Zurich' });
/** État de la section : données, chargement, lignes ouvertes, recherche, filtre, nombre de lignes montrées. */
const H = { data: null, err: null, charge: null, ouvertes: new Set(), q: '', f: 'tous', tout: false };
let C = null, box = null;

/**
 * Pose la section dans box (rappelé à chaque rendu de l'onglet) et charge l'historique la première fois.
 * @param {HTMLElement|null} el Emplacement de la section.
 * @param {object} ctx Contexte de la page Jeux (sb, esc, me).
 */
export function monterHistorique(el, ctx) {
  if (!el) return;
  C = ctx; box = el;
  loadCss('heardle-historique');
  stylesArchives();
  el.addEventListener('click', onClick);
  el.addEventListener('input', onInput);
  dessiner();
  if (!H.data && !H.err && !H.charge) {
    H.charge = C.sb.rpc('hg_heardle_historique').then(({ data, error }) => {
      if (error) throw error;
      H.data = data;
    }).catch((e) => { H.err = e?.message || String(e); }).finally(() => { H.charge = null; if (box?.isConnected) dessiner(); });
  }
}

/** L'historique sera relu au prochain rendu (après une manche jouée pour l'honneur). */
export function relireHistorique() { H.data = null; H.err = null; }

/** Essais d'un joueur (« xso ») : trouvé, mauvaise réponse, passé ; vide = pas utilisé. */
const carres = (essais, cls) => Array.from({ length: 6 }, (_, i) => {
  const c = (essais || '')[i];
  return `<span class="${cls} ${c === 'o' ? 'is-ok' : c === 'x' ? 'is-x' : c === 's' ? 'is-s' : 'is-vide'}"></span>`;
}).join('');
/** Moyenne « 2,4 ». */
const virgule = (n) => String(n).replace('.', ',');
/** Résumé de mes essais pour le lecteur d'écran (les carrés sont décoratifs). */
const monTexte = (j) => (!j ? 'Toi : pas joué' : j.solved ? `Toi : trouvé en ${j.essais.length}` : 'Toi : pas trouvé');
/** Ma partie : celle du jour même, sinon celle pour l'honneur une fois finie (mêmes champs). */
const maPartie = (m, me) => m.joueurs.find((x) => x.user_id === me) || (m.honneur?.fini ? { solved: !!m.honneur.solved, essais: m.honneur.essais || '' } : null);

/** Manches qui passent la recherche et le filtre (sur mon résultat). */
function filtrees() {
  const q = H.q.trim().toLowerCase();
  const me = C.me?.id;
  return (H.data?.manches || []).filter((m) => {
    if (q && !`${m.title || ''} ${m.artist || ''}`.toLowerCase().includes(q)) return false;
    if (H.f === 'tous') return true;
    const j = maPartie(m, me);
    return H.f === 'trouves' ? !!j?.solved : !!j && !j.solved;
  });
}

/** Panneau déroulant d'une manche : chiffres, répartition des essais, scores du gang, lien YouTube. */
function panneauHtml(m) {
  const esc = C.esc, me = C.me?.id;
  const trouves = m.joueurs.filter((j) => j.solved);
  const moy = trouves.length ? virgule((trouves.reduce((s, j) => s + j.essais.length, 0) / trouves.length).toFixed(1)) : '—';
  const repartition = [1, 2, 3, 4, 5, 6].map((k) => ({ l: String(k), n: trouves.filter((j) => j.essais.length === k).length }))
    .concat([{ l: '✗', n: m.joueurs.length - trouves.length, rate: true }]);
  const max = Math.max(1, ...repartition.map((r) => r.n));
  const yt = `https://www.youtube.com/watch?v=${encodeURIComponent(m.youtube_id)}${m.start_s ? `&t=${Number(m.start_s)}s` : ''}`;
  const credit = m.proposed_by || m.shared_on ? `Proposé par ${esc(m.proposed_by || 'le gang')}${m.shared_on ? ` dans ${esc(m.shared_on)}` : ''}` : '';
  let rang = 0;
  const scores = m.joueurs.map((j) => {
    if (j.solved) rang += 1;
    const moi = j.user_id === me;
    return `<li class="jhh-score${moi ? ' is-me' : ''}">
        <span class="jhh-rang">${j.solved ? String(rang).padStart(2, '0') : '··'}</span>
        ${avatarHtml(j, 28)}
        <span class="jhh-nom">${esc(j.pseudo)}${moi ? ' (toi)' : ''}</span>
        <span class="jhh-carres" aria-hidden="true">${carres(j.essais, 'jhh-c')}</span>
        <span class="jhh-res ${j.solved ? 'is-ok' : 'is-x'}">${j.solved ? `${j.essais.length}/6` : 'raté'}</span>
        <span class="jhh-gain">${j.points != null ? `+${esc(j.points)} ${paillSym()}` : ''}</span>
      </li>`;
  }).join('');
  return `<div class="jhh-panneau" id="jhh-p-${esc(m.day)}">
      <div class="jhh-gauche">
        <div class="jhh-chiffres">
          <p class="jhh-chiffre"><span class="jhh-k">Joueurs</span><b>${m.joueurs.length}</b></p>
          <p class="jhh-chiffre"><span class="jhh-k">Moyenne</span><b>${trouves.length ? `${moy} essais` : '—'}</b></p>
        </div>
        <div class="jhh-histo" role="img" aria-label="Trouvé par ${trouves.length} sur ${m.joueurs.length}${trouves.length ? `, en ${moy} essais en moyenne` : ''}">
          <p class="jhh-k">Trouvé en…</p>
          ${repartition.map((r) => `<div class="jhh-barre"><span>${r.l}</span><span class="jhh-piste"><span class="${r.rate ? 'is-x' : ''}" style="width:${(r.n / max) * 100}%"></span></span><b>${r.n}</b></div>`).join('')}
        </div>
        ${credit ? `<p class="muted small">${credit}</p>` : ''}
        <a class="btn btn-sand jhh-yt" href="${esc(yt)}" target="_blank" rel="noopener">Réécouter le morceau</a>
      </div>
      <div class="jhh-droite">
        <p class="jhh-k">Scores du gang</p>
        ${m.joueurs.length ? `<ol class="jhh-scores">${scores}</ol>` : '<p class="muted small">Personne n’a joué ce jour-là.</p>'}
        <p class="jhh-legende" aria-hidden="true"><span><i class="jhh-c is-ok"></i>trouvé</span><span><i class="jhh-c is-x"></i>mauvaise réponse</span>
          <span><i class="jhh-c is-s"></i>passé</span><span><i class="jhh-c is-vide"></i>pas utilisé</span></p>
      </div>
    </div>`;
}

/** Manche pas encore jouée : titre caché, ligne fermée, bouton « Jouer » (ou « Reprendre ») si elle est rejouable. */
function ligneCacheeHtml(m, nb) {
  const esc = C.esc;
  const enCours = m.honneur && !m.honneur.fini;
  return `<li class="jhh-ligne is-ajouer"><div class="jhh-tete ar-tete">
      <span class="jhh-num">#${esc(m.round)}</span>
      <span class="jhh-date">${esc(jourCourt.format(new Date(`${m.day}T12:00:00Z`)))}</span>
      <span class="jhh-titre"><b><span aria-hidden="true">???</span><span class="visually-hidden">Titre caché</span></b><span>titre caché jusqu’à ta partie</span></span>
      <span class="jhh-moi"><span>${enCours ? 'En cours' : 'Pas joué'}</span></span>
      <span class="jhh-qui"><b>${nb}</b> / ${m.joueurs.length} ont trouvé</span>
      ${m.jouable ? `<a class="btn btn-sand ar-btn" href="#heardle-${esc(m.day)}" aria-label="${enCours ? 'Reprendre' : 'Jouer'} la manche n°${esc(m.round)}">${enCours ? 'Reprendre' : 'Jouer'}</a>` : ''}
    </div></li>`;
}

/** Liste des manches (recherche, filtre et nombre de lignes appliqués). */
function listeHtml() {
  const esc = C.esc, me = C.me?.id;
  const liste = filtrees();
  if (!liste.length) return `<p class="jhh-vide">${H.data?.manches?.length ? 'Aucun morceau ne correspond.' : 'Pas encore de morceau passé.'}</p>`;
  // Tout l'historique : demandé, ou recherche / filtre en cours (ils parcourent toutes les manches)
  const tout = H.tout || !!H.q.trim() || H.f !== 'tous';
  const lignes = (tout ? liste : liste.slice(0, DEBUT)).map((m) => {
    const ouverte = H.ouvertes.has(m.day);
    const j = maPartie(m, me);
    const nb = m.joueurs.filter((x) => x.solved).length;
    if (m.cache) return ligneCacheeHtml(m, nb);
    return `<li class="jhh-ligne${ouverte ? ' is-open' : ''}">
        <button type="button" class="jhh-tete" data-hist="ligne" data-day="${esc(m.day)}" aria-expanded="${ouverte}" aria-controls="jhh-p-${esc(m.day)}">
          <span class="jhh-num">#${esc(m.round)}</span>
          <span class="jhh-date">${esc(jourCourt.format(new Date(`${m.day}T12:00:00Z`)))}</span>
          <span class="jhh-titre"><b>${esc(m.title)}</b><span>${esc(m.artist)}</span></span>
          <span class="jhh-moi"><span class="jhh-carres" aria-hidden="true">${carres(j?.essais, 'jhh-c jhh-mini')}</span><span>${monTexte(j)}</span></span>
          <span class="jhh-qui"><b>${nb}</b> / ${m.joueurs.length} ont trouvé</span>
          <svg class="jhh-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        ${ouverte ? panneauHtml(m) : ''}
      </li>`;
  }).join('');
  const bouton = !tout && liste.length > DEBUT
    ? `<button type="button" class="btn btn-ghost jhh-plus" data-hist="tout">Voir tout l’historique (${liste.length} morceaux)</button>`
    : H.tout && !H.q.trim() && H.f === 'tous' && liste.length > DEBUT
      ? '<button type="button" class="btn btn-ghost jhh-plus" data-hist="reduire">Réduire aux 3 derniers</button>' : '';
  return `<ul class="jhh-liste" role="list">${lignes}</ul>${bouton}`;
}

/** Dessine toute la section (chiffres, recherche, filtres, liste). */
function dessiner() {
  const esc = C.esc;
  if (H.err) { box.innerHTML = `<section class="card jhh"><p class="muted">Historique indisponible : ${esc(H.err)}</p></section>`; return; }
  if (!H.data) { box.innerHTML = '<section class="card jhh"><p class="muted">Chargement de l’historique…</p></section>'; return; }
  const moi = H.data.moi || {}, total = H.data.manches.length;
  const filtre = (id, l) => `<button type="button" class="jhh-filtre" data-hist="filtre" data-f="${id}" aria-pressed="${H.f === id}">${l}</button>`;
  box.innerHTML = `<section class="card jhh" aria-labelledby="jhh-h">
      <div class="jhh-haut">
        <div>
          <p class="jhh-code">// Tous les morceaux</p>
          <h2 class="jhh-h" id="jhh-h">Historique du Heardle</h2>
          <p class="muted small">${total} morceau${total > 1 ? 'x' : ''} joué${total > 1 ? 's' : ''} · ouvre une ligne pour voir les scores du gang.</p>
        </div>
        <div class="jhh-stats">
          <p class="jhh-stat"><span class="jhh-k">Mes trouvés</span><b class="is-ok">${esc(moi.trouves ?? 0)} / ${esc(moi.joues ?? 0)}</b></p>
          <p class="jhh-stat"><span class="jhh-k">Ma moyenne</span><b>${moi.moyenne != null ? esc(virgule(moi.moyenne)) : '—'}</b></p>
          <p class="jhh-stat"><span class="jhh-k">Série</span><b class="is-sand">${esc(moi.serie ?? 0)} jour${moi.serie > 1 ? 's' : ''}</b></p>
        </div>
      </div>
      <div class="jhh-outils">
        <label class="jhh-cherche"><span class="visually-hidden">Rechercher un morceau</span>
          <input type="search" id="jhh-q" placeholder="Rechercher un titre ou un artiste" autocomplete="off" value="${esc(H.q)}"></label>
        <div class="jhh-filtres" role="group" aria-label="Afficher">${filtre('tous', 'Tous')}${filtre('trouves', 'Trouvés')}${filtre('rates', 'Ratés')}</div>
      </div>
      <div id="jhh-liste">${listeHtml()}</div>
    </section>`;
}

/** Redessine seulement la liste (la recherche garde le focus et le curseur). */
function majListe() { const l = box.querySelector('#jhh-liste'); if (l) l.innerHTML = listeHtml(); }

function onClick(e) {
  const b = e.target.closest('[data-hist]');
  if (!b || !box.contains(b)) return;
  const a = b.dataset.hist;
  if (a === 'ligne') {
    const d = b.dataset.day;
    if (H.ouvertes.has(d)) H.ouvertes.delete(d); else H.ouvertes.add(d);
    majListe();
    box.querySelector(`[data-hist="ligne"][data-day="${CSS.escape(d)}"]`)?.focus();
  } else if (a === 'filtre') {
    H.f = b.dataset.f;
    box.querySelectorAll('.jhh-filtre').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    majListe();
  } else if (a === 'tout' || a === 'reduire') {
    H.tout = a === 'tout';
    majListe();
    box.querySelector('.jhh-plus')?.focus();
  }
}

function onInput(e) {
  if (e.target.id !== 'jhh-q') return;
  H.q = e.target.value;
  majListe();
}
