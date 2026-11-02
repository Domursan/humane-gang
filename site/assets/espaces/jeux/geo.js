// ===== Humane Gang — Jeux › GeoGuessr du gang (idée J1) =====
/*
 * Rôle : la manche du jour (une photo d'une sortie passée, ou une photo libre du monde entier), une épingle à poser sur la carte, une seule tentative ;
 * puis le résultat : vraie position, ligne entre les deux points, distance, score sur 5 000, Paillettes, sortie
 * d'origine. Classements du jour et de la semaine ; archive des manches passées jouable « pour l'honneur ».
 * La réponse ne quitte le serveur qu'après le vote (RPC hg_geo_guess).
 * Après le vote (effets de la maquette des jeux quotidiens) : épingle posée + son, trajet tracé + son, vraie épingle + son,
 * score qui défile + son, puis finDePartie (tampon de points, Paillettes) ; une manche « pour l'honneur » n'a pas de fin.
 * Rien de tout cela à l'ouverture d'une manche déjà jouée : résultat direct, tampon sans animation. Sans mouvement : résultat
 * immédiat, sons conservés.
 * Onglet : /pages/jeux/jeux.html#geo. Contrat : mount(panel, ctx), unmount().
 * Dépendances : photos.js (adresses signées, visionneuse), leaflet-load.js (carte), jeux/commun.js, core.js (errMsg, motionAllowed),
 *   jeux/effets-jour.js (sons, compteur, fin de partie).
 * Données : RPC hg_geo_today, hg_geo_guess, hg_geo_board, hg_geo_archive (migration 083).
 */
import { errMsg, motionAllowed } from '../../commun/core.js';
import { signedUrl, signedUrls, openLightbox } from '../irl/photos.js';
import { loadLeaflet, addOsmTiles } from '../../commun/leaflet-load.js';
import { chargerCss, nf, km, gainHtml, classementHtml, jourLong } from './commun.js';
import { boutonReponses } from '../../commun/core/admin-reponses.js';
import { serieHtml, jokerHtml } from './serie-jeux.js'; // série commune et joker payant (migrations 206 et 207)
import { sonJour, rejoue, compteur, finDePartie } from './effets-jour.js';

/* ---------- Constantes ---------- */
/** Vue de départ de la carte : Suisse et pays voisins. */
const VUE = { centre: [46.6, 7.2], zoom: 6 };

/* ---------- État ---------- */
// panel, ctx : panneau et contexte ; today : réponse de hg_geo_today ; round : manche affichée
// ({ id, day, number, image_path, honor, mine }) ; pin : épingle posée [lat, lon] ; map, L, layer : carte Leaflet ;
// scope : classement affiché (jour | semaine) ; archive : manches passées (null = pas encore chargées) ; busy : envoi en cours.
let G = null;

/* ---------- Outils ---------- */
/** Élément du panneau. */
const q = (sel) => G.panel.querySelector(sel);

/** Icône d'épingle de la carte (pastille ronde, couleur selon le rôle). */
function pinIcon(kind) {
  return G.L.divIcon({ className: `geo-pin geo-pin-${kind}`, html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
}

/* ---------- Montage ---------- */
/**
 * Monte l'onglet GeoGuessr.
 * @param {HTMLElement} panel Panneau vide de l'onglet.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte de la page.
 */
export async function mount(panel, ctx) {
  chargerCss('geo');
  G = { panel, ctx, today: null, round: null, pin: null, map: null, L: null, layer: null, pinMarker: null, scope: 'jour', archive: null, busy: false };
  panel.innerHTML = `<div class="jg geo">
    <header class="sj-tete">
      <div><h2 class="jg-title">GeoGuessr du gang</h2>
      <p class="small muted jg-sub" id="geo-sub">Chargement de la manche…</p></div>
      ${serieHtml('geo')}${jokerHtml('geo')}
    </header>
    <div class="jg-grid2">
      <div class="jg-col">
        <figure class="geo-photo" id="geo-photo" hidden>
          <button class="geo-photo-btn" type="button" data-geo="zoom" aria-label="Agrandir la photo"><img id="geo-img" alt="Photo de la manche : où a-t-elle été prise ?" decoding="async"></button>
          <figcaption class="geo-photo-tag">Photo de la manche</figcaption>
        </figure>
        <section class="jg-card geo-play" id="geo-play" aria-labelledby="geo-play-h">
          <div class="jg-between geo-play-head">
            <h3 class="jg-h3" id="geo-play-h">Où a-t-elle été prise ?</h3>
            <button class="btn btn-ghost geo-back" type="button" data-geo="today" hidden>Manche du jour</button>
          </div>
          <p class="small muted geo-hint" id="geo-hint">Touche la carte pour poser ton épingle, puis valide. Une seule tentative.</p>
          <div class="geo-map" id="geo-map" role="application" aria-label="Carte : touche l’endroit où la photo a été prise" aria-describedby="geo-hint"></div>
          <p class="small muted geo-map-status" id="geo-status" role="status" aria-live="polite"></p>
          <div class="btn-row geo-actions" id="geo-actions">
            <button class="btn btn-ghost" type="button" data-geo="centre">Épingle au centre</button>
            <button class="btn btn-primary geo-valider" type="button" data-geo="valider" disabled>Valider mon épingle</button>
          </div>
          <div class="geo-result" id="geo-result" hidden tabindex="-1"></div>
        </section>
      </div>
      <div class="jg-col">
        <section class="jg-card geo-board" aria-labelledby="geo-board-h">
          <div class="jg-between">
            <h3 class="jg-h3" id="geo-board-h">Classement du jour</h3>
            <div class="jg-seg" role="group" aria-label="Période du classement">
              <button type="button" data-geo="scope" data-scope="jour" aria-pressed="true">Jour</button>
              <button type="button" data-geo="scope" data-scope="semaine" aria-pressed="false">Semaine</button>
            </div>
          </div>
          <div id="geo-board" aria-live="polite"><p class="jg-empty-row">Chargement…</p></div>
        </section>
        <details class="jg-card geo-archive" id="geo-archive">
          <summary><span class="jg-h3">Manches passées</span> <span class="small muted">pour l’honneur, sans Paillettes</span></summary>
          <div class="geo-archive-grid" id="geo-archive-grid"><p class="jg-empty-row">Chargement…</p></div>
        </details>
        <p class="small muted geo-rules" id="geo-rules"></p>
      </div>
    </div>
  </div>`;
  panel.addEventListener('click', onClick);
  q('#geo-archive').addEventListener('toggle', () => { if (q('#geo-archive').open && !G.archive) chargerArchive(); });
  panel.addEventListener('jeux:show', () => G?.map?.invalidateSize());
  boutonReponses(panel.querySelector('.geo > header'), 'geo');
  await charger();
}

/** Libère la carte (appelé en quittant la page). */
export function unmount() {
  try { G?.map?.remove(); } catch { /* carte déjà retirée */ }
  G = null;
}

/* ---------- Chargement ---------- */
/** Lit la manche du jour, puis affiche la manche, les règles et le classement. */
async function charger() {
  const { sb, toast } = G.ctx;
  const { data, error } = await sb.rpc('hg_geo_today');
  if (error) {
    q('#geo-sub').textContent = 'La manche n’a pas pu être chargée.';
    toast(`GeoGuessr : ${errMsg(error)}`, 'error');
    return;
  }
  G.today = data || {};
  regles(G.today.reglages || {});
  if (G.today.round) await afficher({ ...G.today.round, honor: false, mine: G.today.mine || null });
  else aucuneManche();
  await chargerClassement();
}

/** Règles du jeu, avec les réglages du serveur. */
function regles(r) {
  const b = Array.isArray(r.bonus) ? r.bonus : [100, 60, 30];
  q('#geo-rules').textContent = `Une nouvelle manche chaque jour à 6 h. Score sur 5 000 selon la distance, ramené sur 10 points (500 = 1 point) ; 200 Paillettes à 10 points, 15 de moins par point manquant. Le lundi, le podium de la semaine reçoit ${b.map(nf).join(', ')} Paillettes.`;
}

/** Pas de manche aujourd'hui : message, pas de carte. */
function aucuneManche() {
  q('#geo-sub').textContent = `${jourLong(G.today.day)} · pas de manche aujourd’hui`;
  q('#geo-photo').hidden = true;
  q('#geo-play').innerHTML = '<h3 class="jg-h3">Pas de manche aujourd’hui</h3><p class="small muted">Le Staff n’a pas encore préparé de photo. Reviens demain à 6 h, ou rejoue une manche passée pour l’honneur.</p>';
}

/* ---------- Affichage d'une manche ---------- */
/**
 * Affiche une manche (du jour ou de l'archive) : photo, carte, et le résultat si elle a déjà été jouée.
 * @param {{id: string, day: string, number: number, image_path: string, honor: boolean, mine: object|null}} r
 */
async function afficher(r) {
  G.round = r;
  G.pin = null;
  const sub = `Manche n°${nf(r.number)} · ${jourLong(r.day)} · ${r.honor ? 'pour l’honneur, sans Paillettes' : 'une tentative par jour'}`;
  q('#geo-sub').textContent = sub;
  q('.geo-back').hidden = !r.honor || !G.today?.round;
  const img = q('#geo-img');
  q('#geo-photo').hidden = false;
  img.removeAttribute('src');
  signedUrl(r.image_path).then((u) => { if (G?.round === r && u) img.src = u; });
  q('#geo-result').hidden = true;
  q('#geo-actions').hidden = !!r.mine;
  q('#geo-hint').hidden = !!r.mine;
  q('.geo-valider').disabled = true;
  await carte();
  if (!G.map) return;
  G.layer.clearLayers();
  G.pinMarker = null;
  if (r.mine) resultat(r.mine, false);
  else {
    G.map.setView(VUE.centre, VUE.zoom);
    q('#geo-status').textContent = '';
  }
}

/** Prépare la carte Leaflet (une fois). En cas d'échec : message et bouton « Réessayer ». */
async function carte() {
  if (G.map) { G.map.invalidateSize(); return; }
  const status = q('#geo-status');
  status.textContent = 'Chargement de la carte…';
  try {
    G.L = await loadLeaflet();
  } catch (e) {
    if (!G) return;
    status.innerHTML = '';
    status.append(`Carte indisponible pour le moment (${e.message}). `);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn-ghost'; b.textContent = 'Réessayer'; b.dataset.geo = 'retry-map';
    status.append(b);
    q('#geo-map').classList.add('is-off');
    return;
  }
  if (!G) return;
  q('#geo-map').classList.remove('is-off');
  status.textContent = '';
  const L = G.L;
  G.map = L.map(q('#geo-map'), { scrollWheelZoom: false, worldCopyJump: true }).setView(VUE.centre, VUE.zoom);
  addOsmTiles(L, G.map);
  G.layer = L.layerGroup().addTo(G.map);
  G.map.on('click', (e) => poser(e.latlng.lat, e.latlng.lng));
}

/**
 * Pose (ou déplace) l'épingle du membre, tant qu'il n'a pas validé.
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 */
function poser(lat, lon) {
  if (!G?.round || G.round.mine || G.busy) return;
  const lng = ((((lon + 180) % 360) + 360) % 360) - 180; // carte répétée : longitude ramenée dans [-180, 180]
  G.pin = [lat, lng];
  if (G.pinMarker) G.pinMarker.setLatLng(G.pin);
  else G.pinMarker = G.L.marker(G.pin, { icon: pinIcon('moi'), title: 'Ton épingle', alt: 'Ton épingle', keyboard: false }).addTo(G.layer);
  q('.geo-valider').disabled = false;
  q('#geo-status').textContent = 'Épingle posée. Touche ailleurs pour la déplacer, puis valide.';
}

/* ---------- Vote et résultat ---------- */
/** Envoie l'épingle (une seule tentative) et affiche le résultat. */
async function valider() {
  if (!G.pin || G.busy || !G.round || G.round.mine) return;
  const { sb, toast } = G.ctx;
  const btn = q('.geo-valider');
  G.busy = true; btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  const { data, error } = await sb.rpc('hg_geo_guess', { p_round: G.round.id, p_lat: G.pin[0], p_lon: G.pin[1] });
  if (!G) return;
  G.busy = false; btn.removeAttribute('aria-busy');
  if (error) { btn.disabled = false; toast(errMsg(error), 'error'); return; }
  G.round.mine = data;
  if (!G.round.honor && G.today) G.today.mine = data;
  q('#geo-actions').hidden = true;
  q('#geo-hint').hidden = true;
  resultat(data, true, true);
  G.archive = null;
  if (q('#geo-archive').open) chargerArchive();
  chargerClassement();
}

/**
 * Résultat d'une manche jouée : deux épingles et la ligne qui les relie, score, distance, gain et sortie d'origine.
 * Juste après le vote (animer) : épingle posée, trajet tracé, vraie épingle, score qui défile, puis finDePartie.
 * @param {object} m Tentative { lat, lon, distance_m, score, reward, honor, solution }.
 * @param {boolean} focus Donne le focus au résultat (juste après le vote).
 * @param {boolean} [animer] true seulement juste après le vote du membre (jamais à l'ouverture d'une manche déjà jouée).
 */
function resultat(m, focus, animer = false) {
  const { esc } = G.ctx;
  const manche = G.round;
  const sol = m.solution || {};
  const points = Math.max(0, Math.min(10, Math.round((Number(m.score) || 0) / 500))); // 500 points sur 5 000 = 1 point
  const avecGain = !m.honor && m.reward > 0;
  const placee = G.map && Number.isFinite(sol.lat) && Number.isFinite(sol.lon);
  const moi = [m.lat, m.lon], vrai = [sol.lat, sol.lon];
  const fx = animer && motionAllowed();
  const vivant = () => !!G && G.round === manche;
  const mettre = (kind, pos, titre, tip) => {
    const mk = G.L.marker(pos, { icon: pinIcon(kind), title: titre, alt: titre, keyboard: false }).addTo(G.layer);
    mk.bindTooltip(titre, tip);
    return mk;
  };
  const tipVrai = { permanent: true, direction: 'top', className: 'geo-tip geo-tip-vrai', offset: [0, -10] };
  const tipMoi = { permanent: true, direction: 'bottom', className: 'geo-tip geo-tip-moi', offset: [0, 10] };
  const cadrer = () => G.map.fitBounds([moi, vrai], { padding: [48, 48], maxZoom: 15, animate: false });
  const trait = { color: '#F2EFEA', weight: 2, dashArray: '6 5', interactive: false };
  const date = sol.event_date ? ` (${new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' }).format(new Date(sol.event_date))})` : '';
  const origine = sol.label ? `<div class="geo-origin">
      <span class="small">C’était : <b>${esc(sol.label)}</b>${sol.event_title ? `, ${esc(sol.event_title)}${esc(date)}` : ''}</span>
      ${sol.event_id ? `<a class="small geo-album" href="/pages/irl/irl.html#event-${encodeURIComponent(sol.event_id)}">Voir l’album</a>` : ''}
    </div>` : '';
  // Photo libre (Wikimedia Commons) : auteur, licence et source, exigés par CC BY. Montrés après le vote seulement.
  const cr = sol.credit;
  const lien = (u, t) => (String(u || '').startsWith('https://') ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` : esc(t));
  const credit = cr ? `<p class="small muted geo-credit">Photo : ${lien(cr.source, cr.auteur || 'Wikimedia Commons')}, ${lien(cr.licence_url, cr.licence || '')}, réduite.</p>` : '';
  // Le gain est écrit par finDePartie dans la pastille (+ N, qui défile) ; sinon pastille fixe.
  const gain = m.honor ? '<span class="pill">Pour l’honneur</span>' : avecGain ? '<span class="pill jg-gain" data-geo-gain></span>' : '<span class="pill">0 Paillette</span>';
  const box = q('#geo-result');
  const ecrireScore = (v) => `${nf(v)} <span class="small muted">/ 5 000</span>`;
  /** Carte de résultat (la fin de partie précédente est effacée : la carte est réutilisée d'une manche à l'autre). */
  const remplir = (score) => {
    delete box.dataset.fxj;
    box.classList.remove('fxj-carte', 'fxj-entree');
    box.innerHTML = `<div class="jg-between">
      <div><div class="jg-display geo-score">${ecrireScore(score)}</div>
      <div class="small muted">Ton épingle est à ${esc(km(m.distance_m))}</div></div>
      ${gain}
    </div>${origine}${credit}`;
    box.hidden = false;
  };
  /** Dernier temps : message d'état, tampon et gain (sauf manche pour l'honneur), toast, focus. */
  const finir = () => {
    if (!vivant()) return;
    q('#geo-status').textContent = `Résultat : ${nf(m.score)} points sur 5 000, à ${km(m.distance_m)} du vrai lieu${sol.label ? ` (${sol.label})` : ''}.`;
    const cible = box.querySelector('[data-geo-gain]');
    if (cible) cible.style.visibility = '';
    if (!m.honor) finDePartie(box, { points, gain: avecGain ? m.reward : null, animer, cibleGain: avecGain ? cible : null });
    if (animer && avecGain) G.ctx.toast(`+${nf(m.reward)} Paillettes`, 'success');
    if (focus) box.focus({ preventScroll: false });
  };

  if (!fx) {
    // Ouverture d'une manche déjà jouée, ou mouvement réduit : résultat direct.
    if (placee) {
      G.layer.clearLayers();
      G.pinMarker = null;
      G.L.polyline([moi, vrai], trait).addTo(G.layer);
      mettre('vrai', vrai, 'Vrai lieu', tipVrai);
      mettre('moi', moi, 'Ton épingle', tipMoi);
      cadrer();
    }
    remplir(m.score);
    if (animer && m.honor) sonJour('P3');
    finir();
    return;
  }

  // Juste après le vote : la séquence de la maquette (0 ms, 450 ms, 1150 ms, 1500 ms, 2350 ms).
  const etape = (ms, fn) => setTimeout(() => { if (vivant()) fn(); }, ms);
  q('#geo-status').textContent = 'Résultat en cours…';
  if (placee) {
    cadrer();
    if (G.pinMarker) G.pinMarker.bindTooltip('Ton épingle', tipMoi);
    else G.pinMarker = mettre('moi', moi, 'Ton épingle', tipMoi);
    rejoue(G.pinMarker.getElement?.()?.firstElementChild, 'fxj-pop');
  }
  sonJour('P1');
  etape(450, () => {
    sonJour('P2');
    if (!placee) return;
    const ligne = G.L.polyline([moi, vrai], trait).addTo(G.layer);
    const el = ligne.getElement?.();
    if (!el?.getTotalLength) return;
    const lg = el.getTotalLength();
    el.style.strokeDasharray = String(lg);
    el.style.strokeDashoffset = String(lg);
    void el.getBoundingClientRect();
    el.style.transition = 'stroke-dashoffset .7s ease';
    el.style.strokeDashoffset = '0';
    setTimeout(() => { el.style.transition = ''; el.style.strokeDasharray = ''; el.style.strokeDashoffset = ''; }, 760);
  });
  etape(1150, () => {
    sonJour('P1');
    if (!placee) return;
    const mk = mettre('vrai', vrai, 'Vrai lieu', tipVrai);
    rejoue(mk.getElement?.()?.firstElementChild, 'fxj-pop');
  });
  etape(1500, () => {
    sonJour('P3');
    remplir(0);
    const cible = box.querySelector('[data-geo-gain]');
    if (cible) cible.style.visibility = 'hidden';
    compteur(box.querySelector('.geo-score'), Number(m.score) || 0, ecrireScore, 700);
  });
  etape(2350, finir);
}

/* ---------- Classement ---------- */
/** Charge et affiche le classement (jour, semaine, ou la manche de l'archive affichée). */
async function chargerClassement() {
  if (!G) return;
  const { sb, me, esc } = G.ctx;
  const archive = G.round?.honor ? G.round : null;
  const scope = archive ? 'jour' : G.scope;
  q('#geo-board-h').textContent = archive ? `Classement de la manche n°${nf(archive.number)}` : scope === 'semaine' ? 'Classement de la semaine' : 'Classement du jour';
  q('.geo-board .jg-seg').hidden = !!archive;
  const box = q('#geo-board');
  const { data, error } = await sb.rpc('hg_geo_board', { p_scope: scope, p_round: archive ? archive.id : null });
  if (!G) return;
  if (error) { box.innerHTML = `<p class="jg-empty-row">Classement indisponible : ${esc(errMsg(error))}</p>`; return; }
  const rows = Array.isArray(data) ? data : [];
  const vide = archive && !archive.mine ? 'Joue cette manche pour voir son classement.' : scope === 'semaine' ? 'Personne n’a encore joué cette semaine.' : 'Personne n’a encore joué aujourd’hui. À toi !';
  box.innerHTML = classementHtml(rows, {
    me: me?.id, vide, label: q('#geo-board-h').textContent,
    droite: (r) => scope === 'semaine'
      ? `<span class="small muted">${nf(r.manches)} manche${r.manches > 1 ? 's' : ''}</span><span class="jg-score">${nf(r.score)}</span>`
      : `<span class="small muted">${esc(km(r.distance_m))}</span><span class="jg-score">${nf(r.score)}</span>`,
  });
}

/* ---------- Archive ---------- */
/** Charge les manches passées (vignettes, mon score). */
async function chargerArchive() {
  const { sb, esc } = G.ctx;
  const grid = q('#geo-archive-grid');
  const { data, error } = await sb.rpc('hg_geo_archive');
  if (!G) return;
  if (error) { grid.innerHTML = `<p class="jg-empty-row">Archive indisponible : ${esc(errMsg(error))}</p>`; return; }
  G.archive = Array.isArray(data) ? data : [];
  if (!G.archive.length) { grid.innerHTML = '<p class="jg-empty-row">Pas encore de manche passée.</p>'; return; }
  grid.innerHTML = G.archive.map((r, i) => `<button class="geo-arch" type="button" data-geo="arch" data-i="${i}"${G.round?.id === r.id ? ' aria-current="true"' : ''}>
      <span class="geo-arch-img"><img alt="" data-path="${esc(r.image_path)}" loading="lazy" decoding="async"></span>
      <span class="geo-arch-txt"><b>N°${nf(r.number)}</b> · ${esc(jourLong(r.day))}</span>
      <span class="small ${r.score == null ? 'jg-sand' : 'muted'}">${r.score == null ? 'À jouer' : `${nf(r.score)} pts${r.label ? ` · ${esc(r.label)}` : ''}`}</span>
    </button>`).join('');
  const urls = await signedUrls(G.archive.map((r) => r.image_path));
  if (!G) return;
  for (const img of grid.querySelectorAll('img[data-path]')) { const u = urls.get(img.dataset.path); if (u) img.src = u; }
}

/* ---------- Clics ---------- */
/** Délégation des clics du panneau. */
function onClick(e) {
  const b = e.target.closest('[data-geo]');
  if (!b || !G) return;
  const act = b.dataset.geo;
  if (act === 'valider') valider();
  else if (act === 'centre' && G.map) { const c = G.map.getCenter(); poser(c.lat, c.lng); }
  else if (act === 'zoom') { const src = q('#geo-img').src; if (src) openLightbox([{ url: src, alt: 'Photo de la manche' }]); }
  else if (act === 'retry-map') { carte().then(() => { if (G?.round) afficher(G.round); }); }
  else if (act === 'scope') {
    G.scope = b.dataset.scope;
    for (const x of G.panel.querySelectorAll('[data-geo="scope"]')) x.setAttribute('aria-pressed', String(x === b));
    chargerClassement();
  } else if (act === 'arch') {
    const r = G.archive?.[Number(b.dataset.i)];
    if (!r) return;
    for (const x of G.panel.querySelectorAll('.geo-arch')) x.toggleAttribute('aria-current', x === b);
    afficher({ id: r.id, day: r.day, number: r.number, image_path: r.image_path, honor: true, mine: r.mine || null })
      .then(() => { chargerClassement(); q('#geo-play').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  } else if (act === 'today' && G.today?.round) {
    for (const x of G.panel.querySelectorAll('.geo-arch')) x.removeAttribute('aria-current');
    afficher({ ...G.today.round, honor: false, mine: G.today.mine || null }).then(chargerClassement);
  }
}

/* ---------- Résumé pour l'onglet « Aujourd'hui » ---------- */
/**
 * État de la manche du jour pour le tableau de bord.
 * @param {{sb: object}} ctx Contexte de la page.
 * @returns {Promise<{etat: string, texte: string, badge: string, gain?: number}>}
 */
export async function resume({ sb }) {
  const { data, error } = await sb.rpc('hg_geo_today');
  if (error) throw error;
  const r = data?.round;
  if (!r) return { etat: 'info', texte: 'Pas de manche aujourd’hui', badge: 'Demain 6 h' };
  if (data.mine) return { etat: 'fait', texte: `Manche n°${nf(r.number)} · ${km(data.mine.distance_m)} · ${nf(data.mine.score)} pts`, badge: 'Fait', gain: Number(data.mine.reward) || 0 };
  return { etat: 'a_jouer', texte: `Manche n°${nf(r.number)} · une photo à situer`, badge: 'À jouer' };
}
