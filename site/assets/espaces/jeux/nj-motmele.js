// ===== Humane Gang — page « Jeux » : Mot mêlé, grille du jour (idée N12) =====
/*
 * Rôle : une grille de 12 × 12 lettres cache des mots sur le thème du jour (horizontal, vertical, diagonal, dans les deux
 * sens). On trouve un mot en sélectionnant de la première à la dernière lettre, en ligne droite : en glissant (souris ou
 * doigt), ou en touchant deux cases (départ puis arrivée), ou au clavier (flèches, puis Entrée). Un mot trouvé se surligne
 * dans la grille (couleurs du site) et se barre dans la liste. Le chrono ne sert qu'au classement du jour : il n'empêche
 * jamais de jouer. Fin quand tous les mots sont trouvés. Moteur : nj-grilles.js (hg_nj_grille_etat / hg_nj_grille_essai).
 * Effets (effets-jour.js), seulement après la réponse du serveur : un mot trouvé colore ses cases une à une (saut, son M1 par
 * lettre) puis se barre dans la liste (M2) ; une sélection fausse ou hors ligne droite secoue la grille (G4).
 * Exporte : mount(panel, ctx), resume(ctx).
 */
import { monterGrille, resumerGrille, formatDuree } from './nj-grilles.js';
import { motionAllowed } from '../../commun/core.js';
import { sonJour, secouer, rejoue, enCascade } from './effets-jour.js';

const JEU = 'motmele';
/** Côté de la grille (lettres). */
const TAILLE = 12;
/** Couleurs des mots trouvés (variables du thème, semi-transparentes à l'affichage). */
const COULEURS = ['--rose', '--sand', '--sage', '--slate', '--plum', '--amber', '--rust', '--rb-5'];

/** Cases d'un segment en ligne droite, de a à b inclus. */
function casesLigne(a, b) {
  const n = Math.max(Math.abs(b.r - a.r), Math.abs(b.c - a.c));
  const dr = Math.sign(b.r - a.r), dc = Math.sign(b.c - a.c);
  return Array.from({ length: n + 1 }, (_, k) => ({ r: a.r + dr * k, c: a.c + dc * k }));
}

/** Vrai si a et b sont sur une même ligne (horizontale, verticale ou diagonale) et distinctes. */
function alignes(a, b) {
  const dr = Math.abs(b.r - a.r), dc = Math.abs(b.c - a.c);
  return (dr || dc) && (dr === 0 || dc === 0 || dr === dc);
}

/** Borne une coordonnée à la grille. */
const borne = (n) => Math.min(TAILLE - 1, Math.max(0, n));

/** Corps du jeu : thème, grille (rôle grid, une ligne par rangée), mots à trouver, aide. */
function corps(st, ui, esc) {
  const g = st.grille;
  const fini = !!st.partie?.fini;
  const trouves = g.trouves || {};
  const couleurDe = {};
  g.mots.forEach((m, i) => { couleurDe[m] = COULEURS[i % COULEURS.length]; });
  const dejaColore = new Map();
  Object.entries(trouves).forEach(([m, [r1, c1, r2, c2]]) => {
    casesLigne({ r: r1, c: c1 }, { r: r2, c: c2 }).forEach(({ r, c }) => {
      if (!dejaColore.has(`${r},${c}`)) dejaColore.set(`${r},${c}`, couleurDe[m]);
    });
  });
  ui.curseur = ui.curseur || { r: 0, c: 0 };
  const cur = ui.curseur;
  const lignes = g.grille.map((ligne, r) => `<div class="ng-row" role="row">${[...ligne].map((lettre, c) => {
    const couleur = dejaColore.get(`${r},${c}`);
    const actif = !fini && r === cur.r && c === cur.c;
    return `<div class="ng-cell${couleur ? ' is-trouve' : ''}" role="gridcell" data-r="${r}" data-c="${c}" tabindex="${actif ? 0 : -1}"
      aria-label="ligne ${r + 1}, colonne ${c + 1}, ${esc(lettre)}"${couleur ? ` style="--c: var(${couleur})"` : ''}>${esc(lettre)}</div>`;
  }).join('')}</div>`).join('');
  const liste = g.mots.map((m) => `<li class="${trouves[m] ? 'is-trouve' : ''}" style="--c: var(${couleurDe[m]})">${esc(m)}</li>`).join('');
  const nb = Object.keys(trouves).length;
  return `<p class="ng-theme">Thème : <strong>${esc(g.theme || '—')}</strong></p>
    <div class="ng-plateau"><div class="ng-grille" role="grid" aria-label="Grille de ${TAILLE} par ${TAILLE} lettres">${lignes}</div></div>
    <section class="ng-liste" aria-label="Mots à trouver">
      <h3 class="ng-label">Mots à trouver · ${nb}/${g.mots.length}</h3>
      <ul class="ng-mots">${liste}</ul>
    </section>
    ${fini ? '' : '<p class="ng-aide muted small">Glisse de la première à la dernière lettre, ou touche deux cases (départ puis arrivée). Au clavier : flèches, puis Entrée.</p>'}`;
}

/**
 * Écouteurs : glisser, deux appuis, clavier. Les aperçus (départ, ligne survolée) se mettent à jour sans redessiner.
 * Une sélection hors ligne droite n'est pas envoyée.
 */
function lier(racine, st, ui, env) {
  jouerEffets(racine, st, ui);
  if (st.partie?.fini) return;
  const grille = racine.querySelector('.ng-grille');
  const cases = new Map();
  racine.querySelectorAll('.ng-cell').forEach((el) => cases.set(`${el.dataset.r},${el.dataset.c}`, el));
  const cle = (c) => `${c.r},${c.c}`;

  /** Case sous le pointeur (ou null hors grille). */
  const caseSous = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.ng-cell');
    return el && grille.contains(el) ? { r: Number(el.dataset.r), c: Number(el.dataset.c) } : null;
  };

  /** Met en évidence le départ et la ligne en cours de sélection. */
  const apercu = () => {
    racine.querySelectorAll('.is-apercu, .is-depart').forEach((el) => el.classList.remove('is-apercu', 'is-depart'));
    const a = ui.glisse?.debut || ui.depart;
    if (!a) return;
    cases.get(cle(a))?.classList.add('is-depart');
    const b = ui.glisse ? ui.survol : ui.curseur;
    if (b && alignes(a, b)) casesLigne(a, b).forEach((c) => cases.get(cle(c))?.classList.add('is-apercu'));
  };

  /** Envoie une ligne au serveur (ou signale qu'elle n'est pas droite). */
  const envoie = (a, b) => {
    ui.depart = null; ui.glisse = null;
    if (!alignes(a, b)) {
      env.dire('Sélection hors ligne droite : horizontale, verticale ou diagonale.');
      apercu();
      secouer(grille);
      sonJour('G4');
      return;
    }
    env.envoyer({ r1: a.r, c1: a.c, r2: b.r, c2: b.c }, `.ng-cell[data-r="${ui.curseur.r}"][data-c="${ui.curseur.c}"]`);
  };

  /** Case de focus : elle devient le curseur clavier (une seule case est dans l'ordre de tabulation). */
  const placeCurseur = (c) => {
    ui.curseur = c;
    cases.forEach((el) => { el.tabIndex = -1; });
    const el = cases.get(cle(c));
    if (el) el.tabIndex = 0;
    apercu();
  };
  /** Déplace le curseur clavier et donne le focus à la case. */
  const aller = (r, c) => {
    placeCurseur({ r: borne(r), c: borne(c) });
    cases.get(cle(ui.curseur))?.focus({ preventScroll: true });
  };
  grille.addEventListener('focusin', (ev) => {
    const el = ev.target.closest?.('.ng-cell');
    if (el && grille.contains(el)) placeCurseur({ r: Number(el.dataset.r), c: Number(el.dataset.c) });
  });

  grille.addEventListener('pointerdown', (ev) => {
    const c = caseSous(ev);
    if (!c) return;
    ev.preventDefault();
    try { grille.setPointerCapture(ev.pointerId); } catch { /* sans importance */ }
    ui.curseur = c;
    if (ui.depart) {
      const d = ui.depart;
      ui.depart = null;
      if (d.r === c.r && d.c === c.c) { apercu(); return; }
      envoie(d, c);
      return;
    }
    ui.glisse = { debut: c, moved: false };
    ui.survol = c;
    apercu();
  });
  grille.addEventListener('pointermove', (ev) => {
    if (!ui.glisse) return;
    const c = caseSous(ev);
    if (!c || (c.r === ui.survol.r && c.c === ui.survol.c)) return;
    ui.survol = c;
    ui.glisse.moved = true;
    apercu();
  });
  const termineGlisse = () => {
    if (!ui.glisse) return;
    const g = ui.glisse;
    ui.glisse = null;
    if (!g.moved) {
      ui.depart = g.debut;
      env.dire('Case de départ choisie : touche la case d’arrivée.');
      apercu();
      return;
    }
    envoie(g.debut, ui.survol);
  };
  grille.addEventListener('pointerup', termineGlisse);
  grille.addEventListener('pointercancel', () => { ui.glisse = null; apercu(); });

  grille.addEventListener('keydown', (ev) => {
    const { r, c } = ui.curseur;
    const deplacements = { ArrowRight: [r, c + 1], ArrowLeft: [r, c - 1], ArrowDown: [r + 1, c], ArrowUp: [r - 1, c] };
    if (deplacements[ev.key]) { ev.preventDefault(); aller(...deplacements[ev.key]); return; }
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      if (ui.depart) {
        const d = ui.depart;
        ui.depart = null;
        if (d.r === r && d.c === c) apercu();
        else envoie(d, { r, c });
      } else {
        ui.depart = { r, c };
        env.dire(`Départ : ligne ${r + 1}, colonne ${c + 1}. Va sur la case d’arrivée, puis appuie sur Entrée.`);
        apercu();
      }
      return;
    }
    if (ev.key === 'Escape' && ui.depart) {
      ev.preventDefault();
      ui.depart = null;
      env.dire('Sélection annulée.');
      apercu();
    }
  });

  apercu();
}

/** Après un essai accepté : plus de départ ni de glissement en cours ; l'effet à jouer après le dessin est noté. */
/** La carte de fin attend que le dernier mot ait fini de s'allumer (effet joué par lier, après le dessin). */
const apresRendu = () => (motionAllowed() ? 1000 : 0);

function apresEssai(ui, res) {
  ui.depart = null; ui.glisse = null; ui.survol = null;
  ui.effet = res?.ok ? { mot: res.mot } : { faux: true };
}

/**
 * Joue l'effet noté par apresEssai (une seule fois, après le dessin). Mot trouvé : les cases du mot sont décolorées puis
 * colorées une à une, et le mot est barré à la fin. Sans mouvement, l'état final est déjà là : seul M2 est joué.
 */
function jouerEffets(racine, st, ui) {
  const fx = ui.effet;
  ui.effet = null;
  if (!fx) return;
  if (fx.faux) { secouer(racine.querySelector('.ng-grille')); sonJour('G4'); return; }
  const place = st.grille.trouves?.[fx.mot];
  const li = racine.querySelectorAll('.ng-mots li')[st.grille.mots.indexOf(fx.mot)];
  if (!place || !motionAllowed()) { sonJour('M2'); return; }
  const [r1, c1, r2, c2] = place;
  const autres = new Set();
  Object.entries(st.grille.trouves).forEach(([m, [a, b, c, d]]) => {
    if (m !== fx.mot) casesLigne({ r: a, c: b }, { r: c, c: d }).forEach(({ r, c: k }) => autres.add(`${r},${k}`));
  });
  const caseDe = ({ r, c }) => racine.querySelector(`.ng-cell[data-r="${r}"][data-c="${c}"]`);
  const lettres = casesLigne({ r: r1, c: c1 }, { r: r2, c: c2 });
  lettres.forEach((p) => { if (!autres.has(`${p.r},${p.c}`)) caseDe(p)?.classList.remove('is-trouve'); });
  li?.classList.remove('is-trouve');
  const duree = enCascade(lettres, (p) => {
    const el = caseDe(p);
    if (!el?.isConnected) return;
    el.classList.add('is-trouve');
    rejoue(el, 'fxj-saut');
    sonJour('M1');
  }, 70);
  setTimeout(() => {
    sonJour('M2');
    if (li?.isConnected) { li.classList.add('is-trouve'); rejoue(li, 'fxj-pop'); }
  }, duree + 120);
}

/** Message après un essai : mot trouvé, ou pas un mot de la grille. */
function reponse(res) {
  if (res.ok) return { texte: `Mot trouvé : ${res.mot}.`, ton: 'ok' };
  return { texte: 'Pas un mot de la grille, essaie une autre ligne.' };
}

/** Texte de partage : mots trouvés et temps. */
function copie(st) {
  const p = st.partie;
  if (!p?.fini) return null;
  const n = Object.keys(st.grille.trouves || {}).length;
  return `Mot mêlé #${st.numero} : ${n}/${st.grille.mots.length} mots en ${formatDuree(p.secondes)}`;
}

/** Configuration du jeu (voir monterGrille). */
const CFG = {
  jeu: JEU,
  titre: 'Mot mêlé',
  regles: [
    'Trouve tous les mots cachés dans la grille, sur le thème du jour.',
    'Un mot se lit en ligne droite : horizontale, verticale ou diagonale, dans les deux sens.',
    'Glisse de la première à la dernière lettre, ou touche deux cases (départ puis arrivée).',
    'Un mot trouvé se surligne dans la grille et se barre dans la liste.',
    'Le chrono ne sert qu’au classement du jour : il n’empêche jamais de jouer.',
  ],
  chrono: true,
  corps,
  lier,
  apresEssai,
  apresRendu,
  reponse,
  finTexte: () => 'Tous les mots sont trouvés !',
  copie,
};

/**
 * Monte le Mot mêlé dans son onglet.
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
    fini: () => 'Tous les mots trouvés',
    enCours: (p) => `${(p.etat?.trouves || []).length} mot${(p.etat?.trouves || []).length > 1 ? 's' : ''} trouvé${(p.etat?.trouves || []).length > 1 ? 's' : ''}`,
    aFaire: 'Retrouve les mots cachés',
    badgeMax: '10 pts max',
  });
}
