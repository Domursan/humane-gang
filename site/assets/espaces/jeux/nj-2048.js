// ===== Humane Gang — Jeux › 2048 Paillettes (solo, classement de la semaine) =====
/*
 * Rôle : le 2048 sur une grille 4 × 4. Les tuiles sont des « Paillettes » de rareté croissante : 2 commune (gris), 4 peu
 * commune (vert sauge), 8 rare (ardoise), 16 épique (prune), 32 légendaire (sable), 64 mythique (arc-en-ciel), puis des
 * dégradés de plus en plus brillants. Flèches du clavier ou glissement du doigt (seuil 30 px ; la page ne défile pas).
 * Animations légères (glissement, fusion, apparition), désactivées si le système demande moins de mouvement.
 * Fusions : un effet qui monte en gamme avec la rareté (étincelles, anneaux, halo doré, arc-en-ciel, rayons pour Au-delà),
 * dessiné en DOM (CSS + WAAPI) dans un calque au-dessus de la grille, avec « +N » qui monte et le nom de la rareté.
 * Plusieurs fusions au même coup : un seul son, celui de la plus haute (TU1 sans fusion, TU2 à TU7 sinon).
 * Mouvement réduit : pas d'animation, seulement « +N » et le nom, immobiles. Fin : carte (plus grande tuile, score, record).
 * Score : somme des fusions ; meilleur score : le plus haut de ce navigateur et de ta place au classement de la semaine.
 * La partie se termine quand plus aucun coup n'est possible, ou avec « Terminer et enregistrer ». Le serveur reçoit
 * le score (hg_nj_solo_fin) ; la première partie du jour donne des Paillettes. Le temps de jeu est mesuré par le serveur
 * (hg_nj_solo_debut au premier coup).
 * Onglet : /pages/jeux/jeux.html#2048. Contrat : mount(panel, ctx), unmount(), resume(ctx).
 * Dépendances : core.js (errMsg, motionAllowed), jeux/commun.js (chargerCss, nf, classementHtml), arcade/fx.js (sonFlash).
 * Données : RPC hg_nj_solo_etat, hg_nj_solo_debut, hg_nj_solo_fin (migration 138). Variante : 'classique'.
 * Exporte : mount, unmount, resume.
 */
import { paillSym } from '../../commun/paillettes.js';
import { esc, errMsg, motionAllowed, lireLocal, ecrireLocal } from '../../commun/core.js';
import { sonFlash } from '../arcade/fx.js';
import { chargerCss, nf, classementHtml } from './commun.js';

/* ---------- Constantes ---------- */
/** Taille de la grille (cases par côté). */
const TAILLE = 4;
/** Glissement minimal au doigt (px) pour déclencher un coup. */
const SEUIL = 30;
/** Clé du meilleur score mémorisé dans ce navigateur (convenance seulement), rangée par compte (lireLocal). */
const CLE_MEILLEUR = 'hg_2048_meilleur';
/** Échelle des raretés, pour la légende (valeur de départ, nom, fond, texte). */
const RARETES = [
  { v: 2, nom: 'Commune', seuil: 'départ', fond: '#2B2B31', txt: '#ABA7A0' },
  { v: 4, nom: 'Peu commune', seuil: '4', fond: '#6FA37F', txt: '#0E0E10' },
  { v: 8, nom: 'Rare', seuil: '8', fond: '#7E93C9', txt: '#0E0E10' },
  { v: 16, nom: 'Épique', seuil: '16', fond: '#9A88C4', txt: '#0E0E10' },
  { v: 32, nom: 'Légendaire', seuil: '32', fond: '#E2C77E', txt: '#0E0E10' },
  { v: 64, nom: 'Mythique', seuil: '64', fond: 'linear-gradient(135deg, #FE3104, #FCA301, #FBD32D, #159946, #2B5AE2, #4E2398)', txt: '#FFFFFF' },
  { v: 128, nom: 'Au-delà', seuil: '128 et plus', fond: 'linear-gradient(135deg, #E2C77E, #FFF1BE 50%, #D8A75E)', txt: '#0E0E10' },
];

/** Couleurs de l'arc-en-ciel (le logo) et or de la rareté légendaire. */
const LOGO = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
const OR = '#E2C77E';
/** Couleurs des fusions par rang (2 à 7) : principale, puis claires. */
const COUL_FX = [null, null, ['#6FA37F', '#B5E0C2'], ['#7E93C9', '#C4D1F2'], ['#9A88C4', '#D6CCF0'], [OR, '#FFF1BE'], LOGO, ['#FFF6D5', OR, '#FFFFFF']];
/** Bordure de la carte de fin selon la rareté de la plus grande tuile (rang 1 à 7). */
const BORD_FIN = [null, '#ABA7A0', '#6FA37F', '#7E93C9', '#9A88C4', OR, '#FBD32D', '#FFF1BE'];

/* ---------- État ---------- */
// panel, ctx : panneau et contexte ; gen : numéro de partie (ignore les réponses tardives) ; plateau, zone : éléments ;
// tuiles : Map identifiant -> tuile { id, v, r, c, el } ; grille : 16 identifiants (0 = vide) ; nextId : dernier identifiant ;
// score ; over : plus aucun coup ; fini : partie terminée et envoyée ; run : promesse de l'identifiant de partie ;
// t0 : premier coup ; officiel : réponse de hg_nj_solo_fin ; gain, recompense, board ; touche : départ du glissement au doigt ;
// fx : calque des effets ; record : meilleur score connu au début de la partie (pour « nouveau record » en fin).
let G = null;

/* ---------- Outils ---------- */
/** Élément du panneau. */
const q = (sel) => G.panel.querySelector(sel);

/** Meilleur score mémorisé dans ce navigateur (0 si rien ou stockage bloqué). */
function meilleurLocal() {
  return Number(lireLocal(CLE_MEILLEUR)) || 0;
}

/** Mémorise le meilleur score dans ce navigateur (sans importance si le stockage est bloqué). */
function memoriserMeilleur(v) {
  ecrireLocal(CLE_MEILLEUR, String(v)); // stockage bloqué : sans importance
}

/** Rang de rareté d'une valeur : 2 → 1, 4 → 2, … (log2). */
const rang = (v) => Math.round(Math.log2(v));

/** Nom de la rareté d'une valeur. */
const nomRarete = (v) => RARETES[Math.min(rang(v), 7) - 1].nom;

/** Index d'une case (ligne, colonne) dans la grille à plat. */
const idx = (r, c) => r * TAILLE + c;

/** Lignes à traiter pour un glissement, du bord d'arrivée vers le fond (l'ordre compte pour les fusions). */
function lignes(dir) {
  const out = [];
  for (let k = 0; k < TAILLE; k++) {
    const ligne = [];
    for (let s = 0; s < TAILLE; s++) {
      if (dir === 'gauche') ligne.push([k, s]);
      else if (dir === 'droite') ligne.push([k, TAILLE - 1 - s]);
      else if (dir === 'haut') ligne.push([s, k]);
      else ligne.push([TAILLE - 1 - s, k]);
    }
    out.push(ligne);
  }
  return out;
}

/** Vrai s'il reste un coup : une case vide, ou deux tuiles voisines identiques. */
function peutJouer() {
  for (let r = 0; r < TAILLE; r++) for (let c = 0; c < TAILLE; c++) {
    const id = G.grille[idx(r, c)];
    if (!id) return true;
    const v = G.tuiles.get(id).v;
    if (c + 1 < TAILLE && G.tuiles.get(G.grille[idx(r, c + 1)])?.v === v) return true;
    if (r + 1 < TAILLE && G.tuiles.get(G.grille[idx(r + 1, c)])?.v === v) return true;
  }
  return false;
}

/* ---------- Montage ---------- */
/**
 * Monte l'onglet 2048 Paillettes : grille, score, règles, raretés, classement de la semaine.
 * @param {HTMLElement} panel Panneau vide de l'onglet.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte de la page.
 */
export async function mount(panel, ctx) {
  chargerCss('solo');
  G = { panel, ctx, gen: 0, tuiles: new Map(), grille: new Array(TAILLE * TAILLE).fill(0), nextId: 0, score: 0, over: false, fini: false,
    run: null, t0: 0, officiel: null, gain: 0, recompense: false, board: [], touche: null, timers: new Set(), fx: null, record: 0 };
  panel.innerHTML = `<div class="jg sol sol-jeu2048">
    <header class="sol-head">
      <div>
        <p class="sol-eyebrow">Solo · classement de la semaine</p>
        <h2 class="sol-titre">2048 Paillettes</h2>
        <p class="small muted jg-sub">Fusionne les Paillettes jusqu’à la légendaire et plus haut encore.</p>
      </div>
      <div class="sol-pills">
        <span class="sol-pill">Score <strong id="g-score">0</strong></span>
        <span class="sol-pill">Meilleur <strong id="g-meilleur">0</strong></span>
        <span class="sol-gain" id="g-gain"></span>
      </div>
    </header>
    <div class="jg-grid2">
      <div class="jg-col">
        <section class="jg-card sol-jeu" id="g-jeu" aria-labelledby="g-jeu-h">
          <h3 class="jg-h3 visually-hidden" id="g-jeu-h">Grille du 2048</h3>
          <p class="sol-statut" id="g-statut" role="status" aria-live="polite"></p>
          <div class="sol-plateau2048" id="g-plateau" tabindex="0" role="application" aria-label="Grille 2048 : flèches du clavier ou glisser le doigt pour déplacer les tuiles" aria-describedby="g-resume">
            <div class="sol-2048-zone" id="g-zone">
              <div class="sol-2048-fond" aria-hidden="true">${'<span></span>'.repeat(TAILLE * TAILLE)}</div>
            </div>
          </div>
          <p class="visually-hidden" id="g-resume">Aucune tuile.</p>
          <div class="sol-boutons">
            <button type="button" class="btn btn-sand" id="g-nouv">Nouvelle partie</button>
            <button type="button" class="btn btn-ghost" id="g-finir" disabled>Terminer et enregistrer</button>
          </div>
          <p class="sol-aide small muted">Flèches du clavier ou glisse le doigt sur la grille. Le compte démarre au premier coup.</p>
          <section class="sol-fin" id="g-fin" aria-label="Résultat" hidden></section>
        </section>
      </div>
      <div class="jg-col">
        <section class="jg-card" aria-labelledby="g-regles-h">
          <h3 class="jg-h3" id="g-regles-h">Règles en bref</h3>
          <ol class="sol-regles">
            <li data-n="1">Glisse les tuiles dans une direction. Elles s’arrêtent contre le bord ou contre une autre tuile.</li>
            <li data-n="2">Deux tuiles identiques se fondent en une seule, de valeur double. La fusion rapporte sa valeur en points.</li>
            <li data-n="3">Chaque coup fait apparaître une nouvelle tuile, 2 ou 4.</li>
            <li data-n="4">Atteins la Paillette légendaire (32), puis continue : la partie s’arrête quand plus aucun coup n’est possible.</li>
            <li data-n="5">Termine et enregistre quand tu veux. Une récompense par jour, et le meilleur score de la semaine est classé.</li>
          </ol>
        </section>
        <section class="jg-card" aria-labelledby="g-rar-h">
          <h3 class="jg-h3" id="g-rar-h">Échelle des raretés</h3>
          <div class="sol-rarete-liste">
            ${RARETES.map((r) => `<div class="sol-rarete"><span class="sol-rarete-v" style="background:${r.fond};color:${r.txt}" aria-hidden="true">${r.v}</span><span class="sol-rarete-n">${esc(r.nom)}</span><span class="sol-rarete-s">${esc(r.seuil)}</span></div>`).join('')}
          </div>
        </section>
        <section class="jg-card" aria-labelledby="g-board-h">
          <h3 class="jg-h3" id="g-board-h">Meilleurs scores de la semaine</h3>
          <div id="g-board" aria-live="polite"><p class="jg-empty-row">Chargement…</p></div>
        </section>
      </div>
    </div>
  </div>`;

  G.plateau = q('#g-plateau');
  G.zone = q('#g-zone');
  G.fx = document.createElement('div');
  G.fx.className = 'sol-2048-fx';
  G.fx.setAttribute('aria-hidden', 'true');
  G.zone.appendChild(G.fx);
  panel.addEventListener('click', onClic);
  q('#g-jeu').addEventListener('keydown', onClavier);
  G.plateau.addEventListener('pointerdown', onAppui);
  G.plateau.addEventListener('pointerup', onRelache);
  G.plateau.addEventListener('pointercancel', () => { G.touche = null; });

  await chargerEtat();
  nouvellePartie();
}

/** Libère les minuteurs d'animation (appelé en quittant la page). */
export function unmount() {
  if (G) for (const t of G.timers) clearTimeout(t);
  G = null;
}

/* ---------- Résumé pour l'onglet « Les missions du jour » ---------- */
/**
 * Récompense du jour et record de la semaine, pour le tableau de bord.
 * @param {{sb: object}} ctx Contexte de la page.
 * @returns {Promise<{etat: string, texte: string, badge: string, gain: number}>}
 */
export async function resume({ sb }) {
  const { data, error } = await sb.rpc('hg_nj_solo_etat', { p_jeu: '2048', p_var: 'classique' });
  if (error) throw error;
  const gain = data?.recompense_aujourdhui ? Number(data.gain) || 0 : 0;
  if (data?.recompense_aujourdhui) {
    const top = data.board?.[0];
    return { etat: 'fait', texte: `Paillettes du jour reçues${top ? ` · record de la semaine : ${nf(top.score)} pts` : ''}`, badge: 'Fait', gain };
  }
  return { etat: 'a_jouer', texte: 'Fusionne jusqu’à la Paillette légendaire', badge: 'À jouer', gain: 0 };
}

/* ---------- Données ---------- */
/** Lit la récompense du jour et le classement : hg_nj_solo_etat. */
async function chargerEtat() {
  const gen = G.gen;
  const { sb, toast } = G.ctx;
  let data = null, error = null;
  try { ({ data, error } = await sb.rpc('hg_nj_solo_etat', { p_jeu: '2048', p_var: 'classique' })); } catch (e) { error = e; }
  if (!G || gen !== G.gen) return;
  if (error) {
    q('#g-statut').textContent = `Le classement n’a pas pu se charger : ${errMsg(error)}`;
    toast(`2048 : ${errMsg(error)}`, 'error');
    return;
  }
  G.gain = Number(data?.gain) || 0;
  G.recompense = !!data?.recompense_aujourdhui;
  G.board = data?.board || [];
  majGain();
  majBoard();
  majMeilleur();
}

/** Ouvre la partie côté serveur au premier coup (hg_nj_solo_debut). */
function demarrer() {
  if (G.run) return;
  G.t0 = performance.now();
  const { sb, toast } = G.ctx;
  G.run = (async () => {
    const { data, error } = await sb.rpc('hg_nj_solo_debut', { p_jeu: '2048', p_var: 'classique' });
    if (error) throw error;
    return data;
  })().catch((e) => { toast(`2048 : ${errMsg(e)}`, 'error'); return null; });
}

/**
 * Termine la partie : envoie le score (hg_nj_solo_fin) et affiche le résultat, les Paillettes et le classement.
 * @param {string} cause « fin » (bouton) ou « bloquee » (plus aucun coup).
 */
async function terminer(cause) {
  if (G.fini || !G.run) return;
  G.fini = true;
  const gen = G.gen;
  const { sb, toast } = G.ctx;
  const score = G.score;
  maj();
  try {
    const id = await G.run;
    if (!G || gen !== G.gen) return;
    if (!id) { majFin({ type: 'non_envoye', score }); return; }
    const { data, error } = await sb.rpc('hg_nj_solo_fin', { p_run: id, p_res: { gagne: true, score } });
    if (!G || gen !== G.gen) return;
    if (error) throw error;
    if (data?.reward > 0) G.recompense = true;
    G.officiel = data;
    G.board = data?.board || G.board;
    majBoard();
    majGain();
    majFin({ type: data?.ok ? 'ok' : 'refuse', cause, score, reward: Number(data?.reward) || 0 });
    majMeilleur();
  } catch (e) {
    toast(`2048 : ${errMsg(e)}`, 'error');
    if (G && gen === G.gen) majFin({ type: 'non_envoye', score });
  }
}

/* ---------- Plateau ---------- */
/** Remet la partie à zéro : deux tuiles au départ. Avec animation si demandée. */
function nouvellePartie() {
  G.gen++;
  for (const t of G.tuiles.values()) t.el?.remove();
  G.tuiles.clear();
  G.grille.fill(0);
  G.fx?.replaceChildren();
  G.record = recordActuel();
  G.score = 0; G.over = false; G.fini = false; G.run = null; G.t0 = 0; G.officiel = null;
  q('#g-fin').hidden = true;
  apparaitre();
  apparaitre();
  maj();
}

/** Ajoute une tuile (2 ou 4) sur une case vide au hasard. */
function apparaitre() {
  const vides = [];
  for (let i = 0; i < G.grille.length; i++) if (!G.grille[i]) vides.push(i);
  if (!vides.length) return null;
  const i = vides[Math.floor(Math.random() * vides.length)];
  const v = Math.random() < 0.9 ? 2 : 4;
  return creer(Math.floor(i / TAILLE), i % TAILLE, v, true);
}

/** Crée une tuile du modèle et son élément à l'écran. */
function creer(r, c, v, neuve = false) {
  const id = ++G.nextId;
  const el = document.createElement('div');
  el.className = 'sol-tuile' + (neuve ? ' is-neuve' : '');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<span class="sol-tuile-v"></span><span class="sol-tuile-s">${paillSym()}</span>`;
  G.zone.appendChild(el);
  const t = { id, v, r, c, el };
  G.tuiles.set(id, t);
  G.grille[idx(r, c)] = id;
  peindre(t);
  if (neuve) minuterie(() => el.classList.remove('is-neuve'), 200);
  return t;
}

/** Donne à l'élément d'une tuile sa position, sa valeur et sa rareté. */
function peindre(t) {
  const el = t.el;
  el.style.setProperty('--r', String(t.r));
  el.style.setProperty('--c', String(t.c));
  const r = rang(t.v);
  el.dataset.rang = String(Math.min(r, 6));
  if (r >= 7) el.dataset.brille = String(Math.min(4, r - 6)); else delete el.dataset.brille;
  el.dataset.len = String(String(t.v).length);
  el.querySelector('.sol-tuile-v').textContent = String(t.v);
}

/** Programme une action après ms millisecondes (annulée au changement de partie). */
function minuterie(fn, ms) {
  const t = setTimeout(() => { G?.timers?.delete(t); fn(); }, ms);
  G.timers.add(t);
}

/**
 * Glisse toutes les tuiles dans une direction : fusions, positions, points.
 * @param {string} dir « gauche », « droite », « haut » ou « bas ».
 * @returns {{gagne: number}|null} Points marqués, ou null si rien ne bouge.
 */
function glisser(dir) {
  let bouge = false, gagne = 0;
  const nouvelle = new Array(TAILLE * TAILLE).fill(0);
  const absorbees = [], survivantes = [];
  for (const ligne of lignes(dir)) {
    let dest = 0;
    let dernier = null; // { t, pos, fusion }
    for (const [r, c] of ligne) {
      const id = G.grille[idx(r, c)];
      if (!id) continue;
      const t = G.tuiles.get(id);
      if (dernier && !dernier.fusion && dernier.t.v === t.v) {
        // Fusion : t glisse sur la tuile d'arrivée, qui double
        dernier.t.v *= 2;
        dernier.fusion = true;
        gagne += dernier.t.v;
        survivantes.push(dernier.t);
        absorbees.push({ t, cible: dernier.t, pos: dernier.pos });
        bouge = true;
        continue;
      }
      const [dr, dc] = ligne[dest];
      if (t.r !== dr || t.c !== dc) bouge = true;
      t.r = dr; t.c = dc;
      nouvelle[idx(dr, dc)] = t.id;
      dernier = { t, pos: [dr, dc], fusion: false };
      dest++;
    }
  }
  if (!bouge) return null;
  // Tuiles absorbées : elles glissent jusqu'à la cible puis disparaissent
  for (const a of absorbees) {
    a.t.r = a.pos[0]; a.t.c = a.pos[1];
    G.tuiles.delete(a.t.id);
    a.t.el.classList.add('is-absorbee');
    peindre(a.t);
    minuterie(() => a.t.el.remove(), 140);
  }
  G.grille = nouvelle;
  for (const t of G.tuiles.values()) peindre(t);
  // Fusions : la tuile d'arrivée pulse
  for (const t of survivantes) {
    t.el.classList.remove('is-fusion');
    void t.el.offsetWidth;
    t.el.classList.add('is-fusion');
    minuterie(() => t.el.classList.remove('is-fusion'), 200);
  }
  return { gagne, fusions: survivantes.map((t) => ({ t, v: t.v })) };
}

/* ---------- Effets de fusion (DOM, calque au-dessus de la grille) ---------- */
/** Petit élément du calque, avec ses propriétés CSS. */
function piece(parent, cls, css) {
  const e = document.createElement('span');
  e.className = 'sol-fx-e ' + cls;
  if (css) e.style.cssText = css;
  parent.appendChild(e);
  return e;
}

/** Anime un élément (WAAPI) ; il reste invisible avant son départ (opacité de base 0). */
function anime(e, images, duree, delai = 0) {
  e.animate(images, { duration: duree, delay: delai, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
}

/** Éclats carrés ou étoiles qui partent du centre. */
function eclatsFx(pt, k, n, cols, v, vie, cls, taille) {
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + Math.random(), d = v * k * (.5 + Math.random() * .7) * vie / 1000 * 1.4;
    const e = piece(pt, cls, `background:${cols[i % cols.length]};width:${taille}px;height:${taille}px;margin:-${taille / 2}px 0 0 -${taille / 2}px`);
    anime(e, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 22 * k}px) scale(.4)`, opacity: 0 }], vie);
  }
}

/** Anneau qui s'élargit (rayons r0 à r1 en px de maquette). */
function anneauFx(pt, k, r0, r1, c, vie, delai = 0) {
  const e = piece(pt, 'sol-fx-anneau', `border-color:${c}`);
  anime(e, [{ transform: `scale(${r0 * k / 50})`, opacity: 1 }, { transform: `scale(${r1 * k / 50})`, opacity: 0 }], vie, delai);
}

/** Rayons qui partent du centre. */
function rayonsFx(pt, k, n, r0, r1, c, vie) {
  for (let i = 0; i < n; i++) {
    const a = (360 * i) / n, e = piece(pt, 'sol-fx-rayon', `background:${c}`);
    anime(e, [{ transform: `rotate(${a}deg) translateX(${r0 * k}px) scaleX(.2)`, opacity: 1 }, { transform: `rotate(${a}deg) translateX(${r1 * k}px) scaleX(1)`, opacity: 0 }], vie);
  }
}

/** Halo lumineux qui s'éteint. */
function haloFx(pt, k, r, rgb) {
  const e = piece(pt, 'sol-fx-halo', `background:radial-gradient(circle, rgba(${rgb},.55), rgba(${rgb},0) 70%)`);
  anime(e, [{ transform: `scale(${.3 * r * k / 100})`, opacity: 1 }, { transform: `scale(${r * k / 100})`, opacity: 0 }], 700);
}

/** Texte qui monte (« +N », nom de la rareté) ; immobile en mouvement réduit. */
function texteFx(pt, k, txt, c, haut, taille, anim) {
  const e = piece(pt, 'sol-fx-txt', `color:${c};font-size:${taille}px;opacity:1;margin-top:-${haut}px`);
  e.textContent = txt;
  if (anim) anime(e, [{ transform: 'translate(-50%,0)', opacity: 1, offset: 0 }, { transform: `translate(-50%,${-34 * k}px)`, opacity: 1, offset: .65 }, { transform: `translate(-50%,${-40 * k}px)`, opacity: 0 }], 950);
}

/** Éclair de couleur sur toute la grille. */
function eclairFx(rgb, alpha) {
  const e = piece(G.fx, 'sol-fx-eclair', `background:rgb(${rgb})`);
  const a = e.animate([{ opacity: alpha }, { opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' });
  a.onfinish = a.oncancel = () => e.remove();
}

/** Petite secousse de la grille. */
function secoueFx(ms = 260, a = 5) {
  G.plateau.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${a}px,${-a / 2}px)` }, { transform: `translate(${-a}px,${a / 2}px)` },
    { transform: `translate(${a / 2}px,0)` }, { transform: 'translate(0,0)' }], { duration: ms, easing: 'ease-out' });
}

/**
 * Effet d'une fusion : monte en gamme avec la rareté (2 = Peu commune … 7 et plus = Au-delà).
 * @param {{r: number, c: number, el: HTMLElement}} t Tuile d'arrivée.
 * @param {number} v Valeur obtenue.
 */
function effetFusion(t, v) {
  const r = Math.min(rang(v), 7);
  if (r < 2) return;
  const anim = motionAllowed(), nom = nomRarete(v), cols = COUL_FX[r];
  const pt = document.createElement('div');
  pt.className = 'sol-fx-pt';
  pt.style.setProperty('--r', String(t.r));
  pt.style.setProperty('--c', String(t.c));
  G.fx.appendChild(pt);
  const k = (t.el.offsetWidth || 69) / 69;
  texteFx(pt, k, `+${nf(v)}`, cols[0], 40 * k, 20, anim);
  if (r >= 4) texteFx(pt, k, `${nom} !`, r === 4 ? cols[1] : r === 5 ? OR : '#fff', 62 * k, r === 4 ? 14 : 16, anim);
  if (anim) {
    if (r === 2) { eclatsFx(pt, k, 6, cols, 80, 450, 'sol-fx-p', 3); anneauFx(pt, k, 10, 46, cols[0], 350); }
    else if (r === 3) { eclatsFx(pt, k, 9, cols, 95, 500, 'sol-fx-p', 3); eclatsFx(pt, k, 2, [cols[1]], 60, 500, 'sol-fx-etoile', 8); anneauFx(pt, k, 10, 54, cols[0], 400); }
    else if (r === 4) { eclatsFx(pt, k, 12, cols, 110, 550, 'sol-fx-p', 3); eclatsFx(pt, k, 4, [cols[1]], 80, 600, 'sol-fx-etoile', 8); anneauFx(pt, k, 10, 60, cols[0], 400); anneauFx(pt, k, 6, 80, cols[1], 500); }
    else if (r === 5) {
      eclatsFx(pt, k, 14, [cols[1]], 130, 800, 'sol-fx-etoile', 8); eclatsFx(pt, k, 12, cols, 120, 600, 'sol-fx-p', 3);
      anneauFx(pt, k, 10, 70, OR, 500); rayonsFx(pt, k, 12, 30, 80, cols[1], 500); haloFx(pt, k, 180, '251,211,45');
    } else if (r === 6) {
      LOGO.forEach((c, i) => anneauFx(pt, k, 10, 60 + i * 12, c, 550, i * 60));
      eclatsFx(pt, k, 24, LOGO, 150, 800, 'sol-fx-p', 4); eclatsFx(pt, k, 10, ['#fff'], 140, 800, 'sol-fx-etoile', 8);
      haloFx(pt, k, 240, '255,255,255'); eclairFx('255,255,255', .22);
    } else {
      rayonsFx(pt, k, 18, 34, 150, '#FFF6D5', 900); rayonsFx(pt, k, 12, 20, 110, OR, 700);
      eclatsFx(pt, k, 20, ['#fff'], 170, 1000, 'sol-fx-etoile', 8); eclatsFx(pt, k, 24, LOGO.concat(['#fff']), 170, 900, 'sol-fx-p', 4);
      for (let j = 0; j < 4; j++) anneauFx(pt, k, 10, 70 + j * 25, j % 2 ? OR : '#fff', 600, j * 90);
      haloFx(pt, k, 320, '255,241,190'); eclairFx('255,246,213', .4); secoueFx();
    }
  }
  minuterie(() => pt.remove(), 1500);
}

/** Effets et son d'un coup : un seul son, celui de la fusion la plus haute (TU1 si rien ne fusionne). */
function retourCoup(fusions) {
  let max = 0;
  for (const f of fusions) { max = Math.max(max, f.v); effetFusion(f.t, f.v); }
  sonFlash('TU' + (max ? Math.min(7, rang(max)) : 1));
}

/** Un coup : glisse, fait apparaître une tuile, et termine si plus rien n'est possible. */
function jouer(dir) {
  if (G.over || G.fini) return;
  const res = glisser(dir);
  if (!res) return;
  demarrer();
  G.score += res.gagne;
  retourCoup(res.fusions);
  apparaitre();
  if (G.score > meilleurLocal()) memoriserMeilleur(G.score);
  maj();
  if (!peutJouer()) {
    G.over = true;
    if (motionAllowed()) { secoueFx(350); eclairFx('78,35,152', .3); }
    maj();
    terminer('bloquee');
  }
}

/* ---------- Affichage ---------- */
/** Rafraîchit le score, le statut, la tuile la plus haute et les boutons. */
function maj() {
  if (!G?.zone) return;
  let max = 0;
  for (const t of G.tuiles.values()) max = Math.max(max, t.v);
  q('#g-score').textContent = nf(G.score);
  majMeilleur();
  q('#g-resume').textContent = max ? `Plus grande tuile : ${max}. Score : ${G.score}.` : 'Aucune tuile.';
  let texte;
  if (G.fini) texte = G.over ? 'Plus aucun coup possible : partie terminée.' : 'Partie terminée.';
  else if (G.over) texte = 'Plus aucun coup possible : partie terminée.';
  else if (!G.run) texte = 'Glisse une tuile pour commencer : le compte démarre au premier coup.';
  else texte = 'Partie en cours.';
  const st = q('#g-statut');
  if (st.textContent !== texte) st.textContent = texte;
  q('#g-finir').disabled = !G.run || G.fini;
}

/** Meilleur score connu : ce navigateur et ta place au classement de la semaine. */
function recordActuel() {
  const moi = G.ctx.me?.id;
  return Math.max(meilleurLocal(), G.board.find((r) => r.user_id === moi)?.score || 0);
}

/** Meilleur score : le plus haut entre ce navigateur, la partie en cours et le classement de la semaine. */
function majMeilleur() {
  const moi = G.ctx.me?.id;
  const ma = G.board.find((r) => r.user_id === moi)?.score || 0;
  const best = Math.max(meilleurLocal(), ma, G.score);
  const el = q('#g-meilleur');
  if (el) el.textContent = nf(best);
}

/** Pastille des Paillettes : « +10 ✦ par jour », et l'état « déjà reçues ». */
function majGain() {
  const el = q('#g-gain');
  if (!el) return;
  el.innerHTML = `<span>+${esc(nf(G.gain))} ${paillSym()} par jour</span>${G.recompense ? '<small>Déjà reçues aujourd’hui</small>' : ''}`;
}

/** Classement de la semaine, par score. */
function majBoard() {
  const el = q('#g-board');
  if (!el) return;
  el.innerHTML = classementHtml(G.board, {
    me: G.ctx.me?.id ?? null,
    droite: (r) => `<span class="jg-score">${esc(nf(r.score))}</span>`,
    vide: 'Personne n’a encore enregistré de score cette semaine.',
    label: 'Meilleurs scores de la semaine',
  });
}

/**
 * Résultat : partie enregistrée, refusée, ou non envoyée.
 * @param {{type: string, cause?: string, score?: number, reward?: number}} r
 */
function majFin({ type, cause, score = 0, reward = 0 }) {
  const box = q('#g-fin');
  if (!box) return;
  let titre, detail = '', ton = 'is-ko';
  if (type === 'ok') {
    titre = `Partie enregistrée : ${nf(score)} pts`; ton = 'is-ok';
    detail = reward > 0 ? `Paillettes reçues : +${nf(reward)} ${paillSym()}` : (G.recompense ? 'Paillettes déjà reçues aujourd’hui.' : 'Score enregistré dans le classement.');
  } else if (type === 'refuse') {
    titre = 'Partie non comptée'; detail = 'Le serveur n’a pas accepté ce score.';
  } else {
    titre = 'Partie non enregistrée'; detail = 'Le serveur n’a pas ouvert la partie. Rafraîchis la page pour réessayer.';
  }
  if (cause === 'bloquee' && type === 'ok') detail = `Plus aucun coup possible. ${detail}`;
  let max = 0;
  for (const t of G.tuiles.values()) max = Math.max(max, t.v);
  const compte = type === 'ok';
  const nouveau = compte && score > G.record, ecart = G.record - score;
  const stats = max ? `<p class="sol-fin-tuile">Plus grande tuile : ${esc(nf(max))}, ${esc(nomRarete(max))}.</p>` : '';
  const scoreJoue = !compte ? `<p class="small muted">Score joué : ${esc(nf(score))}.</p>` : '';
  const record = !compte ? scoreJoue : nouveau ? '<p class="sol-fin-record">Nouveau record</p>'
    : G.record > 0 ? `<p class="small muted">Meilleur score ${esc(nf(G.record))}. Il t’a manqué ${esc(nf(ecart))} point${ecart > 1 ? 's' : ''}.</p>` : '';
  box.style.setProperty('--bord', BORD_FIN[Math.min(rang(max || 2), 7)]);
  box.hidden = false;
  box.innerHTML = `<p class="sol-grand ${ton === 'is-ok' ? 'jg-sand' : ''}">${esc(titre)}</p>${stats}${record}<p class="small muted">${esc(detail)}</p>`;
  box.classList.remove('is-entree');
  void box.offsetWidth;
  if (motionAllowed()) box.classList.add('is-entree');
  sonFlash('SO5');
}

/* ---------- Événements ---------- */
/** Direction selon la touche (flèches). */
const TOUCHES = { ArrowLeft: 'gauche', ArrowRight: 'droite', ArrowUp: 'haut', ArrowDown: 'bas' };

/** Clavier : flèches (la page ne défile pas). */
function onClavier(e) {
  const dir = TOUCHES[e.key];
  if (!dir) return;
  e.preventDefault();
  jouer(dir);
}

/** Début d'un glissement au doigt ou à la souris, sur la grille. */
function onAppui(e) {
  if (e.button > 0) return;
  G.touche = { x: e.clientX, y: e.clientY };
}

/** Fin du glissement : direction dominante si le trajet dépasse le seuil. */
function onRelache(e) {
  const t = G.touche;
  G.touche = null;
  if (!t) return;
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SEUIL) return;
  if (Math.abs(dx) > Math.abs(dy)) jouer(dx > 0 ? 'droite' : 'gauche');
  else jouer(dy > 0 ? 'bas' : 'haut');
}

/** Clics : nouvelle partie, terminer et enregistrer. */
function onClic(e) {
  if (!G) return;
  if (e.target.closest?.('#g-nouv')) { nouvellePartie(); return; }
  if (e.target.closest?.('#g-finir')) { terminer('fin'); }
}
