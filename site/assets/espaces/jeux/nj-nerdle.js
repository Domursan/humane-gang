// ===== Humane Gang — page « Jeux » : Nerdle du gang, grille du jour (idée N14) =====
/*
 * Rôle : trouver le calcul caché de huit caractères (chiffres, + - * / et =) en six essais. Chaque essai doit être un calcul
 * juste (le serveur refuse les autres, sans compter d'essai). Couleurs comme Wordle : vert = bonne place, ambre = présent
 * ailleurs, gris = absent ; le clavier à l'écran prend la meilleure couleur connue de chaque touche. Saisie au clavier à
 * l'écran (0-9, + - × ÷ =, Effacer, Entrer) ou au clavier physique (* et / acceptés, × et ÷ affichés). Le chrono ne sert
 * qu'au classement du jour. Effets (réponse du serveur seulement) : cases retournées une à une (230 ms d'écart, couleur à mi-retournement,
 * sons G1/G2/G3), clavier mis à jour après ; calcul refusé = ligne secouée + G4. Indice à la demande (migration 149) : révèle une case, 3 par jour, −1 point chacun. Moteur : nj-grilles.js (hg_nj_grille_etat / hg_nj_grille_essai).
 * Exporte : mount(panel, ctx), resume(ctx).
 */
import { monterGrille, resumerGrille, voisinFleche } from './nj-grilles.js';
import { sonJour, secouer, rejoue, enCascade } from './effets-jour.js';
import { motionAllowed } from '../../commun/core.js';

const JEU = 'nerdle';
/** Longueur du calcul et nombre d'essais. */
const LONGUEUR = 8, ESSAIS = 6;
/** Indices à la demande par jour (migration 149) : chacun révèle une case et retire 1 point. */
const INDICES_MAX = 3;
/** Touches du clavier à l'écran, ligne par ligne (Effacer et Entrer ont leur propre largeur). */
const LIGNES = [['1', '2', '3', '4', '5', '6'], ['7', '8', '9', '0', '+', '-'], ['×', '÷', '=', 'Effacer'], ['Entrer']];
/** Libellés des couleurs (texte lu par les lecteurs d'écran). */
const LIBELLE = { v: 'bonne place', j: 'présent ailleurs', g: 'absent' };
/** Rang des couleurs : la meilleure connue d'une touche l'emporte. */
const RANG = { g: 1, j: 2, v: 3 };

/** Affichage d'un caractère : * et / deviennent × et ÷. */
const aff = (ch) => (ch === '*' ? '×' : ch === '/' ? '÷' : ch);
/** Saisie vers le serveur : × et ÷ deviennent * et /. */
const envoi = (s) => s.replace(/×/g, '*').replace(/÷/g, '/');

/**
 * Ajoute un caractère à la saisie (huit au plus), puis redessine. Le focus reste sur la touche cliquée (clavier à l'écran).
 * @param {boolean} [depuisTouche] vrai si la saisie vient d'une touche à l'écran.
 */
function ajoute(ui, env, t, depuisTouche = true) {
  if ((ui.saisie || '').length >= LONGUEUR) { env.dire('Le calcul fait huit caractères.'); return; }
  ui.saisie = (ui.saisie || '') + t;
  env.rerendre(depuisTouche ? `[data-touche="${t}"]` : null);
}

/** Efface le dernier caractère de la saisie. */
function efface(ui, env) {
  ui.saisie = (ui.saisie || '').slice(0, -1);
  env.rerendre('[data-act="effacer"]');
}

/** Envoie la saisie si elle fait huit caractères. */
async function entrer(ui, env) {
  if ((ui.saisie || '').length !== LONGUEUR) {
    env.dire('Un calcul fait huit caractères.');
    secouer(env.panel?.querySelector('.ng-ligne.is-saisie'));
    sonJour('G4');
    return;
  }
  await env.envoyer({ calcul: envoi(ui.saisie) }, '[data-act="entrer"]');
}

/** Meilleure couleur connue de chaque touche d'après les essais (clé : caractère affiché). */
function etatsTouches(essais) {
  const etat = {};
  essais.forEach((x) => [...x.calcul].forEach((ch, j) => {
    const k = aff(ch), v = x.couleurs[j];
    if (!etat[k] || RANG[v] > RANG[etat[k]]) etat[k] = v;
  }));
  return etat;
}

/** Délai entre deux cases retournées, et moment du changement de couleur dans le retournement (ms). */
const PAS_CASES = 230, MI_FLIP = 180;
const SON_COULEUR = { v: 'G1', j: 'G2', g: 'G3' };

/**
 * Après le redessin d'un essai accepté : les cases de la nouvelle ligne se retournent une à une, la couleur apparaît à
 * mi-retournement avec son son, puis le clavier prend ses nouvelles couleurs. Sans mouvement : tout est coloré d'un coup.
 * @returns {number} durée de l'animation en ms (la carte de fin attend)
 */
function apresRendu({ avant, apres, panel }) {
  const nouveaux = apres.partie?.etat?.essais || [], anciens = avant.partie?.etat?.essais || [];
  if (nouveaux.length <= anciens.length) return 0; // indice : rien à retourner
  const ligne = panel.querySelectorAll('.ng-essais .ng-ligne')[nouveaux.length - 1];
  if (!ligne) return 0;
  const bouge = motionAllowed();
  // La solution attend les couleurs de la dernière ligne.
  const calcul = panel.querySelector('.ng-calcul');
  if (calcul && bouge) { calcul.style.visibility = 'hidden'; setTimeout(() => { calcul.style.visibility = ''; }, 2240); }
  const cases = [...ligne.querySelectorAll('.ng-c')].map((el) => {
    const couleur = /is-([vjg])\b/.exec(el.className)?.[1];
    if (couleur && bouge) el.classList.remove(`is-${couleur}`);
    return { el, couleur };
  });
  // Clavier : les touches qui changent gardent leur ancienne couleur jusqu'à ce que leur case se révèle.
  const avantT = etatsTouches(anciens), apresT = etatsTouches(nouveaux);
  const finales = new Map();
  panel.querySelectorAll('.ng-key[data-touche]').forEach((b) => {
    const k = b.dataset.touche;
    if (apresT[k] === avantT[k]) return;
    finales.set(k, apresT[k]);
    if (bouge) { b.classList.remove(`is-${apresT[k]}`); if (avantT[k]) b.classList.add(`is-${avantT[k]}`); }
  });
  const majTouche = (ch) => {
    const k = aff(ch), b = panel.querySelector(`.ng-key[data-touche="${k}"]`);
    if (!b || !finales.has(k)) return;
    ['v', 'j', 'g'].forEach((c) => b.classList.remove(`is-${c}`));
    b.classList.add(`is-${finales.get(k)}`);
  };
  const revele = ({ el, couleur }, i) => {
    const fin = () => { if (couleur) el.classList.add(`is-${couleur}`); majTouche(nouveaux[nouveaux.length - 1].calcul[i]); };
    if (!bouge) { fin(); return; }
    rejoue(el, 'fxj-flip');
    setTimeout(fin, MI_FLIP);
    sonJour(SON_COULEUR[couleur] || 'G3');
  };
  const ms = enCascade(cases, revele, PAS_CASES);
  if (!bouge) {
    // Sans mouvement : un seul son par couleur, pas huit à la fois.
    [...new Set(cases.map((c) => c.couleur))].filter(Boolean).forEach((c) => sonJour(SON_COULEUR[c]));
    return 0;
  }
  return ms + 380;
}

/** Calcul refusé par le serveur : la ligne en cours est secouée, son G4. Un indice refusé ne secoue rien. */
function refus({ p, panel }) {
  if (!p?.calcul) return;
  secouer(panel.querySelector('.ng-ligne.is-saisie'));
  sonJour('G4');
}

/** Corps du jeu : essais passés, ligne en cours, clavier à l'écran, calcul en fin de partie. */
function corps(st, ui, esc) {
  const p = st.partie || {};
  const fini = !!p.fini;
  const essais = p.etat?.essais || [];
  const indices = p.etat?.indices || [];
  /** Caractère révélé par un indice à la position j (ou undefined). */
  const revele = (j) => indices.find((x) => x.pos === j)?.ch;
  ui.saisie = ui.saisie || '';
  const cellules = (texte, classe, extra = '', indice = false) => Array.from({ length: LONGUEUR }, (_, j) => {
    // Ligne en cours : une case vide montre en pâle le caractère révélé par un indice.
    const r = indice && !texte[j] ? revele(j) : undefined;
    const ch = texte[j] ? aff(texte[j]) : (r ? aff(r) : '');
    if (r) return `<span class="ng-c is-indice ${classe(j)}" role="gridcell" aria-label="Indice : ${esc(aff(r))}">${esc(ch)}</span>`;
    return `<span class="ng-c ${classe(j)}" role="gridcell"${extra ? ` aria-label="${extra(j)}"` : ''}>${esc(ch)}</span>`;
  }).join('');
  let lignes = '';
  for (let i = 0; i < ESSAIS; i++) {
    const x = essais[i];
    if (x) {
      lignes += `<div class="ng-ligne" role="row" aria-label="Essai ${i + 1} : ${esc(aff(x.calcul).split('').join(' '))}">
        ${cellules(x.calcul, (j) => `is-${x.couleurs[j]}`, (j) => `${esc(aff(x.calcul[j]))}, ${LIBELLE[x.couleurs[j]]}`)}</div>`;
    } else if (i === essais.length && !fini) {
      lignes += `<div class="ng-ligne is-saisie" role="row" aria-label="Saisie en cours : ${esc(ui.saisie || 'vide')}">
        ${cellules(ui.saisie, (j) => (j === ui.saisie.length ? 'is-cur' : ''), '', true)}</div>`;
    } else {
      lignes += `<div class="ng-ligne" role="row">${cellules('', () => '')}</div>`;
    }
  }
  const etatTouche = etatsTouches(essais);
  const touches = LIGNES.map((ligne) => `<div class="ng-touches">${ligne.map((k) => {
    const cls = k === 'Effacer' ? 'ng-key-large' : k === 'Entrer' ? 'ng-key-full' : (etatTouche[k] ? `is-${etatTouche[k]}` : '');
    const attr = k === 'Effacer' ? 'data-act="effacer"' : k === 'Entrer' ? 'data-act="entrer"' : `data-touche="${esc(k)}"`;
    // L'état (couleur + symbole) est aussi dit au lecteur d'écran : « A, présent ailleurs ».
    const nom = etatTouche[k] && LIBELLE[etatTouche[k]] ? ` aria-label="${esc(k)}, ${LIBELLE[etatTouche[k]]}"` : '';
    return `<button type="button" class="ng-key ${cls}" ${attr}${nom}${fini ? ' disabled' : ''}>${esc(k)}</button>`;
  }).join('')}</div>`).join('');
  const listeIndices = indices.length
    ? `<span class="ng-indices">${indices.slice().sort((a, b) => a.pos - b.pos).map((x) => `case ${x.pos + 1} : <strong>${esc(aff(x.ch))}</strong>`).join(' · ')}</span>` : '';
  const zoneIndice = fini ? (indices.length ? `<p class="ng-indice muted small">Indices pris : ${indices.length}</p>` : '')
    : `<div class="ng-indice">
      <button type="button" class="btn btn-ghost btn-sm" data-act="indice"${indices.length >= INDICES_MAX ? ' disabled' : ''}>Indice (−1 point) · ${indices.length}/${INDICES_MAX}</button>
      ${listeIndices}</div>`;
  const solution = fini ? `<p class="ng-calcul">Calcul : <strong>${esc(aff(st.solution?.calcul || ''))}</strong></p>` : '';
  return `<div class="ng-essais" role="grid" aria-label="Essais, ${LONGUEUR} caractères, ${ESSAIS} essais">${lignes}</div>
    ${solution}
    ${zoneIndice}
    ${fini ? '' : `<div class="ng-clavier" role="group" aria-label="Clavier du calcul">${touches}</div>`}`;
}

/** Écouteurs du clavier à l'écran. */
function lier(racine, st, ui, env) {
  if (st.partie?.fini) return;
  racine.querySelectorAll('[data-touche]').forEach((b) => b.addEventListener('click', () => ajoute(ui, env, b.dataset.touche, true)));
  racine.querySelector('[data-act="effacer"]').addEventListener('click', () => efface(ui, env));
  racine.querySelector('[data-act="entrer"]').addEventListener('click', () => entrer(ui, env));
  racine.querySelector('[data-act="indice"]')?.addEventListener('click', () => env.envoyer({ indice: true }, '[data-act="indice"]'));
  // Flèches : d'une touche à l'autre sur le clavier à l'écran (Espace tape la touche, Entrée envoie le calcul).
  const clavier = racine.querySelector('.ng-clavier');
  clavier?.addEventListener('keydown', (ev) => {
    if (!ev.key.startsWith('Arrow')) return;
    ev.preventDefault();
    voisinFleche(ev.target, ev.key, [...clavier.querySelectorAll('.ng-key')])?.focus();
  });
}

/**
 * Clavier physique : chiffres, + - = ; * et x donnent ×, / donne ÷ ; Retour arrière efface, Entrée envoie, Échap vide.
 * Actif seulement quand l'onglet est affiché et qu'aucun champ de texte n'a le focus.
 */
function init(panel, env) {
  document.addEventListener('keydown', (ev) => {
    if (!env.visible() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const st = env.etat();
    if (!st?.grille || st.partie?.fini) return;
    const el = document.activeElement;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
    const k = ev.key;
    if (/^[0-9+=-]$/.test(k)) ajoute(env.ui, env, k, false);
    else if (k === '*' || k === 'x' || k === 'X') ajoute(env.ui, env, '×', false);
    else if (k === '/') { ev.preventDefault(); ajoute(env.ui, env, '÷', false); }
    else if (k === 'Backspace') { ev.preventDefault(); efface(env.ui, env); }
    else if (k === 'Enter') { ev.preventDefault(); entrer(env.ui, env); }
    else if (k === 'Escape' && env.ui.saisie) { env.ui.saisie = ''; env.rerendre(); }
  });
}

/** Message après un essai : bravo, ou rien (la ligne suffit). */
function reponse(res) {
  if (res.indice) return { texte: `Indice : case ${res.indice.pos + 1} = ${aff(res.indice.ch)}`, ton: 'ok' };
  if (res.ok) return { texte: 'Bravo, c’est le bon calcul !', ton: 'ok' };
  return null;
}

/** Après un essai accepté par le serveur : la saisie repart à zéro. */
function apresEssai(ui, res) {
  if (res?.indice) return; // un indice ne vide pas la saisie en cours
  ui.saisie = '';
}

/** Texte de partage : une ligne de carrés par essai (vert, ambre, noir). */
function copie(st) {
  const p = st.partie;
  if (!p?.fini) return null;
  const essais = p.etat?.essais || [];
  const carres = { v: '🟩', j: '🟨', g: '⬛' };
  const lignes = essais.map((x) => [...x.couleurs].map((c) => carres[c]).join(''));
  const nb = (p.etat?.indices || []).length;
  return [`Nerdle #${st.numero} ${p.gagne ? essais.length : 'X'}/${ESSAIS}${nb ? ` · ${nb} indice${nb > 1 ? 's' : ''}` : ''}`, ...lignes].join('\n');
}

/** Configuration du jeu (voir monterGrille). */
const CFG = {
  jeu: JEU,
  titre: 'Nerdle du gang',
  regles: [
    'Trouve le calcul caché de huit caractères, en six essais.',
    'Chiffres, + - × ÷ et = : chaque essai doit être un calcul juste, par ex. 12+35=47.',
    'Vert : bonne place. Ambre : présent ailleurs. Gris : absent.',
    'Bloqué ? « Indice » révèle une case du calcul (3 au plus, −1 point chacun).',
    'Au clavier physique, * et / remplacent × et ÷.',
    'Le chrono ne sert qu’au classement du jour.',
  ],
  chrono: true,
  pills: (st) => {
    const n = (st.partie?.etat?.essais || []).length;
    if (st.partie?.fini) return [['Essais', `${n} / ${ESSAIS}`]];
    const ni = (st.partie?.etat?.indices || []).length;
    return [['Essai', `${Math.min(n + 1, ESSAIS)} / ${ESSAIS}`], ['Points max', Math.max(1, 10 - n - ni)]];
  },
  corps,
  lier,
  init,
  apresEssai,
  apresRendu,
  refus,
  reponse,
  finTexte: (st) => (st.partie.gagne ? 'Calcul trouvé !' : 'Pas trouvé cette fois.'),
  copie,
};

/**
 * Monte le Nerdle dans son onglet.
 * @param {HTMLElement} panel Panneau de l'onglet.
 * @param {object} ctx Contexte des modules d'onglet.
 */
export async function mount(panel, ctx) {
  return monterGrille(panel, ctx, CFG);
}

/**
 * Résumé pour « Les missions du jour ».
 * @param {{sb: object}} ctx Contexte des modules d'onglet.
 */
export async function resume(ctx) {
  return resumerGrille(ctx, JEU, {
    fini: (p) => (p.gagne ? `Trouvé en ${(p.etat?.essais || []).length} essai${(p.etat?.essais || []).length > 1 ? 's' : ''}` : 'Pas trouvé cette fois'),
    enCours: (p) => `${(p.etat?.essais || []).length} essai${(p.etat?.essais || []).length > 1 ? 's' : ''} sur ${ESSAIS}`,
    aFaire: 'Calcul de 8 caractères, 6 essais',
    badgeMax: '10 pts max',
  });
}
