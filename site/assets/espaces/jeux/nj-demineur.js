// ===== Humane Gang — Jeux › Démineur (solo, classement de la semaine) =====
/*
 * Rôle : démineur en trois niveaux : facile (9 × 9, 10 cœurs), moyen (16 × 16, 40 cœurs), difficile (16 lignes × 30
 * colonnes, 99 cœurs ; sur écran étroit il s'affiche en 30 lignes × 16 colonnes). Les cœurs du logo en pixel art sont
 * les mines, les drapeaux sont des drapeaux arc-en-ciel. Premier clic jamais sur un cœur (zone 3 × 3 libre), ouverture en
 * cascade des zones vides, et clic sur un chiffre entouré du bon nombre de drapeaux : ouvre les voisines.
 * Clic droit, appui long ou « Mode drapeau » : drapeau. Clavier : flèches, Entrée (ouvrir), F (drapeau).
 * Le temps officiel est celui du serveur : hg_nj_solo_debut au premier coup, hg_nj_solo_fin à la fin. Le chrono affiché
 * pendant la partie est local ; à la fin, c'est le temps renvoyé par le serveur qui s'affiche.
 * Onglet : /pages/jeux/jeux.html#demineur. Contrat : mount(panel, ctx), unmount(), resume(ctx).
 * Dépendances : core.js (esc, errMsg, motionAllowed), jeux/commun.js (chargerCss, nf, classementHtml), arcade/fx.js (sonFlash),
 * effets-jour.js (rejoue).
 * Données : RPC hg_nj_solo_etat, hg_nj_solo_debut, hg_nj_solo_fin (migration 138).
 * Effets (tous sur des éléments du DOM, jamais de canevas) : ouverture en vague depuis la case touchée, drapeau qui retombe en
 * rebondissant, anneau sur un chiffre qui ouvre ses voisines, cœur qui explose puis révèle les autres du plus proche au plus
 * loin, victoire où les cœurs deviennent des drapeaux arc-en-ciel (confettis), carte de fin dans la page. L'état du jeu est
 * toujours juste tout de suite : seuls l'affichage et la carte de fin attendent la fin de l'effet. Sans mouvement
 * (motionAllowed faux) : aucun effet visuel, les sons restent (sonFlash DE1 à DE7). Un effet ne part que sur un geste du joueur.
 * Tests : window.__SCN.demineurCoeurs, liste de couples [ligne, colonne], remplace la pose au hasard (jamais en production).
 * Exporte : mount, unmount, resume.
 */
import { paillSym } from '../../commun/paillettes.js';
import { esc, errMsg, motionAllowed } from '../../commun/core.js';
import { chargerCss, nf, classementHtml } from './commun.js';
import { sonFlash } from '../arcade/fx.js';
import { rejoue } from './effets-jour.js';

/* ---------- Constantes ---------- */
/** Niveaux : dimensions (lignes × colonnes) et nombre de cœurs cachés. */
const NIVEAUX = {
  facile: { titre: 'Facile', lignes: 9, colonnes: 9, coeurs: 10, detail: 'Grille 9 × 9 · 10 cœurs cachés' },
  moyen: { titre: 'Moyen', lignes: 16, colonnes: 16, coeurs: 40, detail: 'Grille 16 × 16 · 40 cœurs cachés' },
  difficile: { titre: 'Difficile', lignes: 16, colonnes: 30, coeurs: 99, detail: 'Grille 16 × 30 · 99 cœurs cachés' },
};
/** Écran étroit : au-dessous de cette largeur, un plateau plus long que large s'affiche couché (30 × 16). */
const ETROIT = '(max-width: 600px)';
/** Déplacement au clavier, en lignes et colonnes logiques (dl, dc). */
const DEP = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
/** Durée d'appui pour poser un drapeau au doigt (ms). */
const APPUI_LONG = 450;
/** Bandes du drapeau arc-en-ciel, de haut en bas. */
const BANDES = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'];
/** Forme du cœur du logo, en pixel art (X = plein). Le contour noir est ajouté autour. */
const FORME_COEUR = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

/** Cœur du logo en SVG (chaque pixel est un rectangle, bords nets). */
function coeurSvg() {
  const H = FORME_COEUR.length + 2, W = FORME_COEUR[0].length + 2;
  const at = (r, c) => (r >= 0 && r < FORME_COEUR.length && c >= 0 && c < FORME_COEUR[0].length ? FORME_COEUR[r][c] : '.');
  const rects = [];
  for (let R = 0; R < H; R++) for (let C = 0; C < W; C++) {
    const r = R - 1, c = C - 1;
    let fill = null;
    if (at(r, c) === 'X') fill = r === 1 && c === 1 ? '#D8405A' : '#B0102A';
    else if (at(r - 1, c) === 'X' || at(r + 1, c) === 'X' || at(r, c - 1) === 'X' || at(r, c + 1) === 'X') fill = '#000000';
    if (fill) rects.push(`<rect x="${C}" y="${R}" width="1" height="1" fill="${fill}"/>`);
  }
  return `<svg class="sol-coeur" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" aria-hidden="true" focusable="false">${rects.join('')}</svg>`;
}
const COEUR_SVG = coeurSvg();
const DRAPEAU_SVG = `<svg class="sol-drapeau" viewBox="0 0 12 14" shape-rendering="crispEdges" aria-hidden="true" focusable="false"><rect x="1" y="0" width="1.4" height="14" fill="#5A5A63"/>${BANDES.map((c, i) => `<rect x="2.4" y="${1 + i * 2}" width="8" height="2" fill="${c}"/>`).join('')}</svg>`;

/* ---------- État ---------- */
// panel, ctx : panneau et contexte de la page ; niveau : niveau affiché ; L, C : lignes et colonnes ; coeurs : cœurs prévus ;
// mine, nb, ouvert, drap : tableaux (un octet par case, index = ligne × C + colonne) ; cases : boutons ; place : cœurs posés ;
// fini : partie terminée ; explose : case du cœur touché (-1 sinon) ; run : promesse de l'identifiant de partie ;
// t0 : instant du premier coup (ms) ; horloge : minuteur du chrono ; officiel : réponse de hg_nj_solo_fin ;
// gain, recompense, board : Paillettes, déjà reçues, classement ; gen : numéro de partie (ignore les réponses tardives) ;
// attente : cœurs pas encore changés en drapeaux pendant la victoire ; finPret : instant où la carte de fin peut s'afficher.
let D = null;

/* ---------- Outils ---------- */
/** Élément du panneau. */
const q = (sel) => D.panel.querySelector(sel);

/** Durée lisible « mm:ss » (ou « h:mm:ss »), tronquée à la seconde. */
function fmtTemps(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

/** Vrai sur écran étroit. */
const etroit = () => { try { return matchMedia(ETROIT).matches; } catch { return false; } };
/** Vrai si le plateau s'affiche couché : écran étroit et niveau plus long que large (difficile). */
const couche = () => etroit() && D.C > D.L;

/* ---------- Effets ---------- */
/** Vrai si le mouvement est réduit ou coupé. */
const doux = () => !motionAllowed();
/** Joue un son du Démineur (DE1 à DE7). */
const son = (code) => { try { sonFlash(code); } catch { /* son indisponible */ } };
/** Exécute fn dans ms, sauf si la partie a changé entre-temps. */
function plus(fn, ms) { const gen = D.gen; setTimeout(() => { if (D && gen === D.gen) fn(); }, ms); }
/** Anime un élément (WAAPI) ; ne fait rien sans mouvement. */
function anime(el, kf, opt) {
  if (!el || doux() || !el.animate) return null;
  try { return el.animate(kf, opt); } catch { return null; }
}
/** Anneau qui s'élargit autour d'une case. */
function anneau(b, couleur, rayon, ms = 450) {
  if (!b || doux()) return;
  b.style.zIndex = '3';
  const a = anime(b, [{ boxShadow: `0 0 0 0 ${couleur}` }, { boxShadow: `0 0 0 ${rayon}px transparent` }], { duration: ms, easing: 'ease-out' });
  if (a) a.onfinish = a.oncancel = () => { b.style.zIndex = ''; }; else b.style.zIndex = '';
}
/** Le drapeau retombe en rebondissant. */
function rebondDrapeau(b) {
  anime(b?.firstElementChild, [{ transform: 'translateY(-90%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1, offset: .5 }, { transform: 'translateY(-18%)', offset: .72 }, { transform: 'translateY(0)' }], { duration: 380, easing: 'ease-in' });
}
/** Ouverture en vague : chaque case s'ouvre avec un retard proportionnel à sa distance (35 ms par pas). */
function animerOuverture(liste, depart = -1) {
  if (doux() || !liste.length) return;
  /* Pas de transform sur la case : elle garde sa zone cliquable (un clic d'accord ne se perd pas). */
  if (liste.length > 120) {
    /* Grande ouverture : opacité seule, retard par tranches de 4 pas, sans fond. */
    for (const [j, d] of liste) {
      anime(D.cases[j], [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: Math.min(Math.floor(d / 4) * 140, 700), fill: 'backwards', easing: 'ease-out' });
    }
  } else {
    for (const [j, d] of liste) {
      anime(D.cases[j], [{ opacity: .3, backgroundColor: '#2B2B31', color: 'transparent' }, { opacity: 1, backgroundColor: 'rgba(255,241,190,.35)', offset: .6 }, { opacity: 1 }],
        { duration: 260, delay: Math.min(d * 35, 700), fill: 'backwards', easing: 'ease-out' });
    }
  }
  if (liste.length > 1 && depart >= 0) { rejoue(q('#dm-champ'), 'fxj-lueur'); anneau(D.cases[depart], 'rgba(226,199,126,.55)', 36, 520); }
}
/** Pluie de confettis aux couleurs du drapeau (victoire), retirée toute seule. */
function confettis() {
  if (doux()) return;
  const c = document.createElement('div');
  c.className = 'sol-confettis';
  c.setAttribute('aria-hidden', 'true');
  for (let k = 0; k < 40; k++) {
    const e = document.createElement('i');
    e.style.left = `${Math.random() * 100}%`;
    e.style.background = BANDES[k % BANDES.length];
    c.append(e);
    anime(e, [{ transform: 'translateY(0) rotate(0deg)' }, { transform: `translateY(105vh) rotate(${Math.round(360 + Math.random() * 360)}deg)`, opacity: .7 }], { duration: 1400 + Math.random() * 900, delay: Math.random() * 300, easing: 'linear', fill: 'forwards' });
  }
  document.body.append(c);
  setTimeout(() => c.remove(), 2800);
}
/** Explosion : secousse, éclair rouge, cœur touché agrandi, puis les autres cœurs révélés du plus proche au plus loin, puis les faux drapeaux. */
function exploser(i) {
  son('DE6');
  D.finPret = 0;
  if (doux()) return;
  const mines = [];
  for (let k = 0; k < D.mine.length; k++) if (D.mine[k] && k !== i && !D.drap[k]) mines.push(k);
  const r0 = Math.floor(i / D.C), c0 = i % D.C;
  const dist = (k) => Math.hypot(Math.floor(k / D.C) - r0, (k % D.C) - c0);
  mines.sort((a, b) => dist(a) - dist(b));
  const champ = q('#dm-champ'), b = D.cases[i];
  champ?.classList.remove('fxj-lueur');
  rejoue(champ, 'fxj-secoue');
  anime(champ, [{ backgroundColor: 'rgba(176,16,42,.45)' }, { backgroundColor: 'rgba(176,16,42,0)' }], { duration: 450 });
  anneau(b, 'rgba(226,199,126,.7)', 40, 520);
  anneau(b, 'rgba(176,16,42,.6)', 24, 380);
  anime(b.firstElementChild, [{ transform: 'scale(.4)' }, { transform: 'scale(1.6)', offset: .4 }, { transform: 'scale(1.35)' }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  const dep = 250, n = mines.length, pas = Math.min(120, 700 / Math.max(1, n)), cadence = Math.max(2, Math.ceil(n / 8));
  mines.forEach((j, k) => {
    anime(D.cases[j].firstElementChild, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1.2)', opacity: 1, offset: .6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, delay: dep + k * pas, fill: 'backwards' });
    if (k % cadence === 0) plus(() => son('DE1'), dep + k * pas);
  });
  const fin = dep + n * pas;
  for (let k = 0; k < D.drap.length; k++) if (D.drap[k] && !D.mine[k]) anime(D.cases[k], [{ boxShadow: 'inset 0 0 0 0 rgba(233,132,157,0)' }, { boxShadow: 'inset 0 0 0 2px rgba(233,132,157,1)' }], { duration: 300, delay: fin + 100, fill: 'backwards' });
  D.finPret = performance.now() + fin + 350;
}
/** Victoire : les cœurs deviennent des drapeaux arc-en-ciel en diagonale, confettis, lueur. */
function celebrer(mines) {
  if (doux()) { son('DE7'); D.finPret = 0; return; }
  plus(() => son('DE7'), 200);
  rejoue(q('#dm-champ'), 'fxj-lueur');
  const ordre = mines.slice().sort((a, b) => (Math.floor(a / D.C) + (a % D.C)) - (Math.floor(b / D.C) + (b % D.C)));
  const dep = 300, pas = Math.min(90, 800 / Math.max(1, ordre.length));
  ordre.forEach((j, n) => plus(() => {
    D.attente?.delete(j);
    majCase(j);
    rebondDrapeau(D.cases[j]);
    anneau(D.cases[j], `${BANDES[n % BANDES.length]}99`, 12, 400);
  }, dep + n * pas));
  plus(confettis, dep + 100);
  D.finPret = performance.now() + dep + ordre.length * pas + 500;
}

/** Cases voisines (jusqu'à 8) d'un index. */
function voisins(i) {
  const r = Math.floor(i / D.C), c = i % D.C, out = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const rr = r + dr, cc = c + dc;
    if (rr >= 0 && rr < D.L && cc >= 0 && cc < D.C) out.push(rr * D.C + cc);
  }
  return out;
}

/* ---------- Montage ---------- */
/**
 * Monte l'onglet Démineur : mise en page, plateau du niveau facile, classement de la semaine.
 * @param {HTMLElement} panel Panneau vide de l'onglet.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte de la page.
 */
export async function mount(panel, ctx) {
  chargerCss('solo');
  D = { panel, ctx, gen: 0, niveau: 'facile', L: 9, C: 9, coeurs: 10, totalCoeurs: 10, gain: 0, recompense: false, board: [], officiel: null, drapMode: false, appuiLong: false, minuterie: null, horloge: null, cases: [] };
  panel.innerHTML = `<div class="jg sol sol-demineur">
    <header class="sol-head">
      <div>
        <p class="sol-eyebrow">Solo · classement de la semaine</p>
        <h2 class="sol-titre">Démineur</h2>
        <p class="small muted jg-sub" id="dm-sub">Chargement…</p>
      </div>
      <div class="sol-pills">
        <span class="sol-pill">Cœurs restants <strong id="dm-coeurs">–</strong></span>
        <span class="sol-pill">Chrono <strong id="dm-chrono">00:00</strong></span>
        <span class="sol-gain" id="dm-gain"></span>
      </div>
    </header>
    <div class="jg-grid2">
      <div class="jg-col">
        <section class="jg-card sol-jeu" id="dm-jeu" aria-labelledby="dm-jeu-h">
          <h3 class="jg-h3 visually-hidden" id="dm-jeu-h">Plateau du démineur</h3>
          <p class="sol-statut" id="dm-statut" role="status" aria-live="polite"></p>
          <div class="sol-champ" id="dm-champ" role="group" aria-label="Plateau du démineur"></div>
          <div class="sol-boutons">
            <button type="button" class="btn btn-ghost" id="dm-drap" aria-pressed="false">Mode drapeau</button>
            <button type="button" class="btn btn-sand" id="dm-nouv">Nouvelle partie</button>
          </div>
          <p class="sol-aide small muted">Toucher une case l’ouvre ; clic droit ou appui long pose un drapeau. Clavier : flèches pour te déplacer, Entrée pour ouvrir, F pour un drapeau.</p>
          <section class="sol-fin" id="dm-fin" aria-label="Résultat" hidden></section>
        </section>
      </div>
      <div class="jg-col">
        <section class="jg-card" aria-labelledby="dm-niv-h">
          <h3 class="jg-h3" id="dm-niv-h">Niveau</h3>
          <div class="jg-seg sol-seg-niv" role="group" aria-label="Niveau de difficulté">
            ${Object.keys(NIVEAUX).map((k) => `<button type="button" data-niv="${k}" aria-pressed="${k === 'facile'}">${esc(NIVEAUX[k].titre)}</button>`).join('')}
          </div>
          <p class="small muted sol-niv-detail" id="dm-niv-detail"></p>
        </section>
        <section class="jg-card" aria-labelledby="dm-regles-h">
          <h3 class="jg-h3" id="dm-regles-h">Règles en bref</h3>
          <ol class="sol-regles">
            <li data-n="1">Le plateau cache des cœurs. Ouvre toutes les cases sans cœur, le plus vite possible.</li>
            <li data-n="2">Un chiffre indique combien de cœurs cachés touchent la case, parmi ses 8 voisines.</li>
            <li data-n="3">Un cœur ouvert met fin à la partie, et le chrono s’arrête.</li>
            <li data-n="4">Marque une case suspecte avec un drapeau. Le compteur indique les cœurs qui restent à trouver.</li>
            <li data-n="5">Classement : le meilleur temps de la semaine, niveau par niveau.</li>
          </ol>
          <p class="sol-legende"><span aria-hidden="true">${COEUR_SVG}</span>Cœur caché : à éviter</p>
          <p class="sol-legende"><span aria-hidden="true">${DRAPEAU_SVG}</span>Drapeau : marque une case suspecte</p>
        </section>
        <section class="jg-card" aria-labelledby="dm-board-h">
          <h3 class="jg-h3" id="dm-board-h">Meilleurs temps de la semaine</h3>
          <p class="small muted" id="dm-board-niv"></p>
          <div id="dm-board" aria-live="polite"><p class="jg-empty-row">Chargement…</p></div>
        </section>
      </div>
    </div>
  </div>`;

  const section = q('#dm-jeu');
  panel.addEventListener('click', onClic);
  panel.addEventListener('contextmenu', onContext);
  q('#dm-champ').addEventListener('pointerdown', onAppui);
  q('#dm-champ').addEventListener('pointerup', annulerAppui);
  q('#dm-champ').addEventListener('pointercancel', annulerAppui);
  q('#dm-champ').addEventListener('pointerleave', annulerAppui);
  section.addEventListener('keydown', onClavier);

  try { matchMedia(ETROIT).addEventListener('change', () => { if (D) disposer(); }); } catch { /* sans écoute : ordre figé */ }
  preparer('facile');
  await chargerEtat('facile');
}

/** Libère le minuteur (appelé en quittant la page). */
export function unmount() {
  arreterHorloge();
  clearTimeout(D?.minuterie);
  D = null;
}

/* ---------- Résumé pour l'onglet « Les missions du jour » ---------- */
/**
 * Record de la semaine, pour le tableau de bord (le démineur n'a pas de partie du jour).
 * @param {{sb: object}} ctx Contexte de la page.
 * @returns {Promise<{etat: string, texte: string, badge: string, gain: number}>}
 */
export async function resume({ sb }) {
  const { data, error } = await sb.rpc('hg_nj_solo_etat', { p_jeu: 'demineur', p_var: 'facile' });
  if (error) throw error;
  const top = data?.board?.[0];
  return { etat: 'info', texte: top ? `Record de la semaine : ${top.pseudo || '—'}, ${fmtTemps(top.secondes)}` : 'Pas encore de temps cette semaine', badge: 'Semaine', gain: 0 };
}

/* ---------- Données ---------- */
/** Lit l'état du niveau (classement de la semaine, Paillettes) : hg_nj_solo_etat. */
async function chargerEtat(niv) {
  const gen = D.gen;
  const { sb, toast } = D.ctx;
  let data = null, error = null;
  try { ({ data, error } = await sb.rpc('hg_nj_solo_etat', { p_jeu: 'demineur', p_var: niv })); } catch (e) { error = e; }
  if (!D || gen !== D.gen) return;
  if (error) {
    q('#dm-statut').textContent = `Le démineur n’a pas pu se charger : ${errMsg(error)}`;
    toast(`Démineur : ${errMsg(error)}`, 'error');
    return;
  }
  D.gain = Number(data?.gain) || 0;
  D.recompense = !!data?.recompense_aujourdhui;
  D.board = data?.board || [];
  majGain();
  majBoard();
}

/** Ouvre la partie côté serveur au premier coup (hg_nj_solo_debut) : renvoie l'identifiant, ou null si refusé. */
function demarrer() {
  if (D.t0) return;
  D.t0 = performance.now();
  const { sb, toast } = D.ctx;
  const niv = D.niveau;
  D.run = (async () => {
    const { data, error } = await sb.rpc('hg_nj_solo_debut', { p_jeu: 'demineur', p_var: niv });
    if (error) throw error;
    return data;
  })().catch((e) => { toast(`Démineur : ${errMsg(e)}`, 'error'); return null; });
  arreterHorloge();
  D.horloge = setInterval(() => { const c = q('#dm-chrono'); if (c) c.textContent = fmtTemps((performance.now() - D.t0) / 1000); }, 250);
}

/** Arrête le chrono local. */
function arreterHorloge() {
  if (D?.horloge) clearInterval(D.horloge);
  if (D) D.horloge = null;
}

/** Termine la partie : envoie le résultat (hg_nj_solo_fin) et affiche le temps officiel et les Paillettes. */
async function finir(gagne) {
  const gen = D.gen;
  const { sb, toast } = D.ctx;
  const sansEnvoi = { gagne, ok: false, secondes: 0, sansEnvoi: true };
  try {
    const id = await D.run;
    if (!D || gen !== D.gen) return;
    if (!id) { majFin(sansEnvoi); return; }
    const { data, error } = await sb.rpc('hg_nj_solo_fin', { p_run: id, p_res: { gagne } });
    if (!D || gen !== D.gen) return;
    if (error) throw error;
    if (data?.reward > 0) D.recompense = true;
    D.board = data?.board || D.board;
    majBoard();
    majGain();
    majFin({ gagne, ok: !!data?.ok, secondes: data?.secondes, reward: Number(data?.reward) || 0 });
  } catch (e) {
    toast(`Démineur : ${errMsg(e)}`, 'error');
    if (D && gen === D.gen) majFin(sansEnvoi);
  }
}

/* ---------- Plateau ---------- */
/** Prépare un niveau : grille vide, cases créées, chrono remis à zéro. */
function preparer(niv) {
  const n = NIVEAUX[niv];
  arreterHorloge();
  D.gen++;
  D.niveau = niv; D.L = n.lignes; D.C = n.colonnes; D.coeurs = n.coeurs; D.totalCoeurs = n.coeurs;
  const N = D.L * D.C;
  D.mine = new Uint8Array(N); D.nb = new Uint8Array(N); D.ouvert = new Uint8Array(N); D.drap = new Uint8Array(N);
  D.attente = null; D.finPret = 0; D.nOuvert = 0; D.place = false; D.fini = false; D.explose = -1; D.run = null; D.t0 = 0; D.officiel = null; D.focus = 0;
  const champ = q('#dm-champ');
  champ.innerHTML = '';
  D.cases = [];
  for (let i = 0; i < N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sol-case';
    b.dataset.i = String(i);
    b.tabIndex = i === 0 ? 0 : -1;
    D.cases.push(b);
  }
  disposer();
  q('#dm-chrono').textContent = '00:00';
  q('#dm-fin').hidden = true;
  q('#dm-sub').textContent = `${NIVEAUX[niv].titre} · ${NIVEAUX[niv].detail}`;
  q('#dm-niv-detail').textContent = NIVEAUX[niv].detail;
  q('#dm-board-niv').textContent = `Niveau ${NIVEAUX[niv].titre.toLowerCase()}, ${NIVEAUX[niv].detail.toLowerCase()}.`;
  maj();
}

/** Place les cases dans l'ordre d'affichage (couché sur écran étroit pour le difficile) et fixe le nombre de colonnes. */
function disposer() {
  const champ = q('#dm-champ');
  const t = couche();
  const ordre = [];
  if (t) { for (let c = 0; c < D.C; c++) for (let r = 0; r < D.L; r++) ordre.push(r * D.C + c); }
  else for (let i = 0; i < D.L * D.C; i++) ordre.push(i);
  champ.style.setProperty('--cols', String(t ? D.L : D.C));
  for (const i of ordre) champ.appendChild(D.cases[i]);
}

/**
 * Pose les cœurs après le premier clic, pour que la zone 3 × 3 autour de ce clic reste libre.
 * Pour les tests, window.__SCN.demineurCoeurs (couples [ligne, colonne]) remplace le tirage.
 * @param {number} depart Index de la case ouverte en premier.
 */
function poser(depart) {
  const N = D.L * D.C;
  const fixes = typeof window !== 'undefined' && Array.isArray(window.__SCN?.demineurCoeurs) ? window.__SCN.demineurCoeurs : null;
  if (fixes) {
    for (const [r, c] of fixes) if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < D.L && c >= 0 && c < D.C) D.mine[r * D.C + c] = 1;
  } else {
    const r0 = Math.floor(depart / D.C), c0 = depart % D.C;
    let n = 0;
    while (n < D.coeurs) {
      const i = Math.floor(Math.random() * N);
      const r = Math.floor(i / D.C), c = i % D.C;
      if (D.mine[i] || (Math.abs(r - r0) <= 1 && Math.abs(c - c0) <= 1)) continue;
      D.mine[i] = 1; n++;
    }
  }
  D.totalCoeurs = D.mine.reduce((s, v) => s + v, 0);
  for (let i = 0; i < N; i++) D.nb[i] = voisins(i).reduce((s, j) => s + D.mine[j], 0);
}

/** Ouvre une case (premier coup : pose des cœurs et démarrage de la partie). */
function ouvrir(i) {
  if (D.fini || D.drap[i]) return;
  if (D.ouvert[i]) { accorder(i); return; }
  if (!D.place) { poser(i); D.place = true; }
  demarrer();
  if (D.mine[i]) { perdre(i); return; }
  const liste = reveler(i);
  son(liste.length > 1 ? 'DE2' : 'DE1');
  verifierGain();
  maj();
  animerOuverture(liste, i);
}

/** Ouvre une case et, de proche en proche, les zones vides qui l'entourent (drapeaux épargnés). Renvoie les cases ouvertes avec leur distance. */
function reveler(i) {
  const file = [[i, 0]], ouvertes = [];
  for (let h = 0; h < file.length; h++) {
    const [j, d] = file[h];
    if (D.ouvert[j] || D.drap[j] || D.mine[j]) continue;
    D.ouvert[j] = 1; D.nOuvert++;
    ouvertes.push([j, d]);
    if (D.nb[j] === 0) for (const k of voisins(j)) if (!D.ouvert[k] && !D.drap[k]) file.push([k, d + 1]);
  }
  return ouvertes;
}

/** Clic sur un chiffre entouré du bon nombre de drapeaux : ouvre les voisines non marquées. */
function accorder(i) {
  if (D.nb[i] === 0) return;
  const vs = voisins(i);
  if (vs.reduce((s, j) => s + D.drap[j], 0) !== D.nb[i]) return;
  const toutes = [];
  let n = 0;
  for (const j of vs) {
    if (D.ouvert[j] || D.drap[j]) continue;
    if (D.mine[j]) { perdre(j); return; }
    for (const [k, d] of reveler(j)) toutes.push([k, d + n * 1.3]);
    n++;
  }
  if (toutes.length) { son('DE5'); anneau(D.cases[i], 'rgba(226,199,126,.45)', 14, 400); }
  verifierGain();
  maj();
  animerOuverture(toutes);
}

/** Pose ou retire un drapeau (ne démarre pas la partie). */
function basculer(i) {
  if (D.fini || D.ouvert[i]) return;
  const pose = !D.drap[i];
  D.drap[i] = pose ? 1 : 0;
  maj();
  son(pose ? 'DE3' : 'DE4');
  if (pose) { rebondDrapeau(D.cases[i]); anneau(D.cases[i], 'rgba(233,132,157,.6)', 8, 380); }
}

/** Toutes les cases sans cœur sont ouvertes : gagné. */
function verifierGain() {
  if (D.fini || D.nOuvert !== D.L * D.C - D.totalCoeurs) return;
  D.fini = true;
  arreterHorloge();
  const mines = [];
  for (let i = 0; i < D.L * D.C; i++) if (D.mine[i]) { D.drap[i] = 1; mines.push(i); }
  if (!doux()) D.attente = new Set(mines);
  maj();
  finir(true);
  celebrer(mines);
}

/** Un cœur a été ouvert : perdu. */
function perdre(i) {
  D.fini = true;
  D.explose = i;
  arreterHorloge();
  maj();
  exploser(i);
  finir(false);
}

/* ---------- Affichage ---------- */
/** Libellé d'une case pour les lecteurs d'écran. */
function etiquette(i) {
  const pos = `ligne ${Math.floor(i / D.C) + 1}, colonne ${(i % D.C) + 1}`;
  if (D.ouvert[i]) return D.nb[i] ? `${pos} : ${D.nb[i]} cœur${D.nb[i] > 1 ? 's' : ''} autour` : `${pos} : vide`;
  if (D.drap[i]) return `${pos} : drapeau`;
  if (D.fini && D.mine[i]) return `${pos} : cœur`;
  return `${pos} : case cachée`;
}

/** Met à jour une case. */
function majCase(i) {
  const b = D.cases[i];
  const cls = ['sol-case'];
  let html = '', n = '';
  if (D.ouvert[i]) {
    cls.push('is-ouverte');
    if (D.nb[i]) { html = String(D.nb[i]); n = html; }
  } else if (D.attente?.has(i)) {
    cls.push('is-coeur');
    html = COEUR_SVG;
  } else if (D.drap[i]) {
    cls.push('is-drapeau');
    html = DRAPEAU_SVG;
    if (D.fini && !D.mine[i]) cls.push('is-faux');
  } else if (D.fini && D.mine[i]) {
    cls.push('is-coeur');
    html = COEUR_SVG;
    if (i === D.explose) cls.push('is-explose');
  }
  const nom = cls.join(' ');
  if (b.className !== nom) b.className = nom;
  if (n) b.dataset.n = n; else delete b.dataset.n;
  if (b._h !== html) { b.innerHTML = html; b._h = html; }
  b.setAttribute('aria-label', etiquette(i));
}

/** Rafraîchit le plateau, le compteur, le statut et les boutons. */
function maj() {
  if (!D?.cases?.length) return;
  for (let i = 0; i < D.L * D.C; i++) majCase(i);
  let drapeaux = 0;
  for (const v of D.drap) drapeaux += v;
  q('#dm-coeurs').textContent = nf(D.totalCoeurs - drapeaux);
  let texte, ton = '';
  if (D.fini && D.explose >= 0) { texte = 'Boum ! Un cœur a explosé : partie perdue.'; ton = 'is-ko'; }
  else if (D.fini) { texte = 'Gagné ! Toutes les cases sans cœur sont ouvertes.'; ton = 'is-ok'; }
  else if (!D.t0) texte = 'Touche une case pour commencer : le chrono part au premier coup.';
  else texte = 'Partie en cours. Ouvre les cases sans cœur.';
  const st = q('#dm-statut');
  st.className = `sol-statut ${ton}`.trim();
  st.textContent = texte;
  const drap = q('#dm-drap');
  drap.setAttribute('aria-pressed', String(D.drapMode));
  drap.classList.toggle('btn-sand', D.drapMode);
  drap.classList.toggle('btn-ghost', !D.drapMode);
  for (const b of D.panel.querySelectorAll('[data-niv]')) b.setAttribute('aria-pressed', String(b.dataset.niv === D.niveau));
}

/** Pastille des Paillettes : « +10 ✦ par jour », et l'état « déjà reçues ». */
function majGain() {
  const el = q('#dm-gain');
  if (!el) return;
  el.innerHTML = `<span>+${esc(nf(D.gain))} ${paillSym()} par jour</span>${D.recompense ? '<small>Déjà reçues aujourd’hui</small>' : ''}`;
}

/** Classement de la semaine pour le niveau affiché. */
function majBoard() {
  const el = q('#dm-board');
  if (!el) return;
  el.innerHTML = classementHtml(D.board, {
    me: D.ctx.me?.id ?? null,
    droite: (r) => `<span class="sol-board-val">${esc(fmtTemps(r.secondes))}</span>`,
    vide: 'Personne n’a encore gagné ce niveau cette semaine.',
    label: 'Meilleurs temps de la semaine',
  });
}

/** Résultat de la partie : temps officiel, Paillettes. */
function majFin({ gagne, ok, secondes, reward = 0, sansEnvoi = false }) {
  const box = q('#dm-fin');
  if (!box) return;
  const t = fmtTemps(secondes);
  const ou = D.explose >= 0 ? `Un cœur caché était là, ligne ${Math.floor(D.explose / D.C) + 1}, colonne ${(D.explose % D.C) + 1}.` : '';
  let titre, detail = '', ton = 'is-ko';
  if (sansEnvoi) { titre = gagne ? 'Gagné' : 'Perdu'; detail = 'Partie non enregistrée : le serveur n’a pas ouvert la partie.'; }
  else if (gagne && ok) {
    titre = `Gagné en ${t}`; ton = 'is-ok';
    detail = reward > 0 ? `Paillettes reçues : +${nf(reward)} ${paillSym()}` : (D.recompense ? 'Paillettes déjà reçues aujourd’hui.' : 'Partie enregistrée.');
  } else if (gagne) { titre = 'Partie non comptée'; detail = 'Le serveur n’a pas accepté ce temps.'; }
  else { titre = `Perdu en ${t}`; detail = ou || 'Le temps est mesuré par le serveur.'; }
  box.className = `sol-fin ${ton}`;
  box.innerHTML = `<p class="sol-grand ${ton === 'is-ok' ? 'jg-sand' : ''}">${esc(titre)}</p><p class="small muted">${esc(detail)}</p>`;
  // La carte attend la fin de l'effet (explosion ou victoire), sans jamais retarder l'état de la partie.
  const montrer = () => { box.hidden = false; rejoue(box, 'fxj-pop'); };
  const attente = (D.finPret || 0) - performance.now();
  if (attente > 0 && !doux()) plus(montrer, attente); else montrer();
}

/* ---------- Événements ---------- */
/** Donne le focus à une case (roving tabindex : une seule case dans l'ordre de tabulation). */
function focuser(i) {
  D.focus = i;
  D.cases.forEach((b, k) => { b.tabIndex = k === i ? 0 : -1; });
  D.cases[i].focus();
}

/** Déplace le focus d'une case dans l'affichage (le couché inverse les axes). */
function deplacer(i, touche) {
  let [dl, dc] = DEP[touche];
  if (couche()) [dl, dc] = [dc, dl];
  const r = Math.min(D.L - 1, Math.max(0, Math.floor(i / D.C) + dl));
  const c = Math.min(D.C - 1, Math.max(0, (i % D.C) + dc));
  focuser(r * D.C + c);
}

/** Clics : niveaux, nouvelle partie, mode drapeau, cases. */
function onClic(e) {
  const niv = e.target.closest('[data-niv]');
  if (niv && D.panel.contains(niv)) {
    if (niv.dataset.niv !== D.niveau) { preparer(niv.dataset.niv); chargerEtat(niv.dataset.niv); }
    return;
  }
  if (e.target.closest('#dm-nouv')) { preparer(D.niveau); return; }
  if (e.target.closest('#dm-drap')) { D.drapMode = !D.drapMode; maj(); return; }
  const c = e.target.closest('.sol-case');
  if (!c) return;
  if (D.appuiLong) { D.appuiLong = false; return; } // l'appui long a déjà posé le drapeau
  const i = Number(c.dataset.i);
  focuser(i);
  if (D.drapMode) basculer(i); else ouvrir(i);
}

/** Clic droit : drapeau (sans menu du navigateur). */
function onContext(e) {
  const c = e.target.closest?.('.sol-case');
  if (!c) return;
  e.preventDefault();
  if (D.appuiLong) return; // un appui long a déjà posé le drapeau (le navigateur peut aussi ouvrir le menu)
  const i = Number(c.dataset.i);
  focuser(i);
  basculer(i);
}

/** Appui long au doigt : pose un drapeau après APPUI_LONG ms. */
function onAppui(e) {
  const c = e.target.closest('.sol-case');
  if (!c || e.button > 0) return;
  D.appuiLong = false;
  clearTimeout(D.minuterie);
  D.minuterie = setTimeout(() => {
    D.appuiLong = true;
    const i = Number(c.dataset.i);
    focuser(i);
    basculer(i);
    try { navigator.vibrate?.(15); } catch { /* vibration non disponible */ }
  }, APPUI_LONG);
}

/** Annule l'appui long si le doigt lève ou quitte la grille. */
function annulerAppui() { clearTimeout(D?.minuterie); }

/** Clavier : flèches entre les cases, F pose un drapeau (Entrée et Espace ouvrent, par le bouton). */
function onClavier(e) {
  if (!e.target.classList?.contains('sol-case')) return;
  const i = Number(e.target.dataset.i);
  if (DEP[e.key]) { e.preventDefault(); deplacer(i, e.key); }
  else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); basculer(i); }
}
