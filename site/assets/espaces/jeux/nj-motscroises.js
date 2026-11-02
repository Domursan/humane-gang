// ===== Humane Gang — page « Jeux » : Mots croisés, grille du jour (idée N11) =====
/*
 * Rôle : une mini grille (jusqu'à 9 × 9) à remplir à partir des définitions horizontales et verticales. Les cases noires ne
 * se remplissent pas ; les numéros sont dans les coins ; la case active et le mot actif sont surlignés, et la définition
 * active est rappelée au-dessus de la grille. Saisie au clavier (lettres, flèches, Retour arrière, Tab = mot suivant) et au
 * doigt : une case touchée ouvre le clavier du téléphone (champ caché). Toucher une définition va à son mot.
 * « Vérifier » signale les cases remplies qui sont fausses, en rouge, et compte comme une erreur. La grille est aussi
 * envoyée toute seule quand elle est pleine : les fautes sont signalées, sans compter d'erreur. La saisie est gardée sur
 * l'appareil, par jour, pour ne pas la perdre. Moteur : nj-grilles.js (hg_nj_grille_etat / hg_nj_grille_essai).
 * Effets (effets-jour.js), seulement après la réponse du serveur à un essai, jamais à l'ouverture : un mot complet et juste
 * s'allume lettre après lettre (saut, son M1 par lettre, M2 à la fin du mot) ; les cases fausses secouent avec le son C4.
 * Exporte : mount(panel, ctx), resume(ctx).
 */
import { monterGrille, resumerGrille, formatDuree } from './nj-grilles.js';
import { motionAllowed, lireLocal, ecrireLocal } from '../../commun/core.js';
import { sonJour, secouer, rejoue, enCascade } from './effets-jour.js';

const JEU = 'motscroises';

/** Case noire dans le motif. */
const noire = (g, r, c) => g.motif[r][c] === '.';
/** Nombre de cases à remplir. */
const blanches = (g) => (g.motif.join('').match(/#/g) || []).length;
/** Clé de stockage local de la saisie, par jour ; rangée par compte (lireLocal, comptes-etat.js). */
const cleLocale = (day) => `hg-motscroises:${day}`;

/** Saisie gardée sur l'appareil (null si absente ou d'une autre taille). */
function lireLocale(day, n) {
  try {
    const v = lireLocal(cleLocale(day));
    return v && v.length === n ? v : null;
  } catch { return null; }
}
/** Garde la saisie sur l'appareil (sans bloquer le jeu si le stockage est refusé). */
function sauveLocale(day, flat) {
  ecrireLocal(cleLocale(day), flat); // stockage refusé : rien à faire
}

/**
 * Modèle de la grille : liste des mots (horizontaux puis verticaux, avec leurs cases) et, pour chaque case, le mot
 * horizontal et le mot vertical qui la contiennent (index dans la liste, -1 si aucun).
 */
function modele(g) {
  const liste = [];
  ['h', 'v'].forEach((dir) => (g.defs?.[dir] || []).forEach((d) => {
    const cases = [];
    for (let k = 0; k < d.len; k++) {
      const r = dir === 'v' ? d.r + k : d.r;
      const c = dir === 'h' ? d.c + k : d.c;
      cases.push({ r, c, idx: r * g.w + c });
    }
    liste.push({ dir, n: d.n, def: d.def, len: d.len, r: d.r, c: d.c, cases });
  }));
  const par = new Map();
  liste.forEach((m, k) => m.cases.forEach(({ r, c }) => {
    const cle = `${r},${c}`;
    if (!par.has(cle)) par.set(cle, { h: -1, v: -1 });
    par.get(cle)[m.dir] = k;
  }));
  return { liste, par };
}

/** Mot actif : celui de la direction courante, ou l'autre si la case n'en a pas dans cette direction. */
function motActif(ui, mod) {
  if (!ui.pos) return -1;
  const e = mod.par.get(`${ui.pos.r},${ui.pos.c}`);
  if (!e) return -1;
  if (e[ui.dir] < 0) {
    const autre = ui.dir === 'h' ? 'v' : 'h';
    if (e[autre] >= 0) ui.dir = autre;
  }
  return e[ui.dir];
}

/** Lignes de la grille telles que le serveur les attend (w caractères par ligne, « . » noire, espace vide). */
const lignesDe = (g, flat) => Array.from({ length: g.h }, (_, r) => flat.slice(r * g.w, (r + 1) * g.w));

/**
 * Prépare la saisie avant le rendu : grille terminée (solution), saisie locale du jour, ou grille vierge.
 * La case de départ est la première case blanche.
 */
function prepare(st, ui) {
  const g = st.grille;
  const n = g.w * g.h;
  if (st.partie?.fini) {
    ui.flat = (st.solution?.solution || []).join('');
    ui.jour = st.day;
    return;
  }
  ui.allumes = ui.allumes || new Set();
  ui.cJustes = ui.cJustes || new Set();
  if (ui.flat == null || ui.jour !== st.day || ui.flat.length !== n) {
    ui.allumes = new Set();
    ui.cJustes = new Set();
    const base = g.motif.map((l) => l.replace(/#/g, ' ')).join('');
    ui.flat = lireLocale(st.day, n) || base;
    ui.jour = st.day;
    ui.faux = new Set();
    ui.dir = 'h';
    ui.pos = null;
  }
  if (!ui.pos) {
    outer: for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) {
      if (!noire(g, r, c)) { ui.pos = { r, c }; break outer; }
    }
  }
}

/** Corps du jeu : la grille (cases, numéros), les définitions, « Vérifier ». Les classes de surbrillance viennent de majCases. */
function corps(st, ui, esc) {
  prepare(st, ui);
  const g = st.grille;
  const fini = !!st.partie?.fini;
  const mod = modele(g);
  const numeros = new Map((g.numeros || []).map(([r, c, n]) => [`${r},${c}`, n]));
  let cases = '';
  for (let r = 0; r < g.h; r++) {
    for (let c = 0; c < g.w; c++) {
      if (noire(g, r, c)) { cases += '<span class="mc-case is-noire" aria-hidden="true"></span>'; continue; }
      const lettre = ui.flat[r * g.w + c] === ' ' ? '' : ui.flat[r * g.w + c];
      const n = numeros.get(`${r},${c}`);
      cases += `<span class="mc-case" data-r="${r}" data-c="${c}">${n ? `<span class="mc-num">${esc(n)}</span>` : ''}<span class="mc-lettre">${esc(lettre)}</span></span>`;
    }
  }
  const colonne = (dir, titre) => {
    const items = mod.liste.map((m, k) => ({ m, k })).filter(({ m }) => m.dir === dir);
    const lignes = items.map(({ m, k }) => (fini
      ? `<li class="mc-def-ligne"><span class="mc-def-n">${esc(m.n)}</span> <span class="mc-def-t">${esc(m.def)}</span> <span class="mc-def-l">(${esc(m.len)})</span></li>`
      : `<li><button type="button" class="mc-def" data-m="${k}"><span class="mc-def-n">${esc(m.n)}</span> <span class="mc-def-t">${esc(m.def)}</span> <span class="mc-def-l">(${esc(m.len)})</span></button></li>`)).join('');
    return `<section class="mc-col" aria-labelledby="mc-titre-${dir}"><h3 class="ng-label" id="mc-titre-${dir}">${titre}</h3><ol class="mc-liste">${lignes}</ol></section>`;
  };
  const saisie = fini ? '' : '<input class="mc-saisie" id="mc-saisie" type="text" value=" " inputmode="text" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Saisie de la grille">';
  return `<div class="mc">
    ${fini ? '' : '<p class="mc-rappel" aria-hidden="true"></p>'}
    <div class="mc-zone">
      <div class="mc-grille" style="--w:${Number(g.w) || 9}" aria-hidden="true">${cases}</div>
      ${saisie}
    </div>
    <div class="mc-defs">${colonne('h', 'Horizontalement')}${colonne('v', 'Verticalement')}</div>
    ${fini ? '' : `<div class="ng-actions"><button type="button" class="btn btn-ghost" data-act="verifier">Vérifier</button></div>
      <p class="mc-progres muted small"></p>
      <p class="ng-aide muted small">Clique une case, puis tape les lettres. Tab ou Entrée passe au mot suivant, Espace change de sens, les flèches déplacent la case.</p>`}
  </div>`;
}

/**
 * Met à jour l'affichage sans reconstruire la grille (le clavier du téléphone reste ouvert) : lettres, case active,
 * mot actif, définition rappelée, cases fausses, compteur.
 */
function majCases(racine, ui, st) {
  const g = st.grille;
  const mod = modele(g);
  const act = motActif(ui, mod);
  const dansMot = new Set(act >= 0 ? mod.liste[act].cases.map((c) => c.idx) : []);
  racine.querySelectorAll('.mc-case:not(.is-noire)').forEach((el) => {
    const r = Number(el.dataset.r), c = Number(el.dataset.c), idx = r * g.w + c;
    el.classList.toggle('is-pos', !!ui.pos && ui.pos.r === r && ui.pos.c === c);
    el.classList.toggle('is-mot', dansMot.has(idx));
    el.classList.toggle('is-faux', !!ui.faux?.has(idx));
    el.classList.toggle('is-juste', !!ui.cJustes?.has(idx));
    el.querySelector('.mc-lettre').textContent = ui.flat[idx] === ' ' ? '' : ui.flat[idx];
  });
  racine.querySelectorAll('.mc-def').forEach((b) => {
    const on = Number(b.dataset.m) === act;
    b.classList.toggle('is-actif', on);
    b.setAttribute('aria-current', on ? 'true' : 'false');
  });
  const m = mod.liste[act];
  const rappel = racine.querySelector('.mc-rappel');
  if (rappel) rappel.textContent = m ? `${m.n} · ${m.dir === 'h' ? 'Horizontalement' : 'Verticalement'} : ${m.def} (${m.len} lettres)` : 'Touche une case pour commencer.';
  const saisie = racine.querySelector('.mc-saisie');
  if (saisie && m) {
    const k = m.cases.findIndex((c) => c.r === ui.pos.r && c.c === ui.pos.c) + 1;
    saisie.setAttribute('aria-label', `${m.dir === 'h' ? 'Horizontalement' : 'Verticalement'} ${m.n} : ${m.def}. Case ${k} sur ${m.len}.`);
  }
  const remplies = ui.flat.split('').filter((ch) => ch !== ' ' && ch !== '.').length;
  const prog = racine.querySelector('.mc-progres');
  if (prog) prog.textContent = `Cases remplies : ${remplies} / ${blanches(g)}`;
}

/** Une lettre change : les mots allumés qui la contiennent s'éteignent (le serveur les revérifiera). */
function eteint(ui, mod, idx) {
  mod.liste.forEach((m, k) => { if (ui.allumes?.has(k) && m.cases.some((c) => c.idx === idx)) ui.allumes.delete(k); });
  ui.cJustes = new Set();
  ui.allumes?.forEach((k) => mod.liste[k].cases.forEach((c) => ui.cJustes.add(c.idx)));
}

/**
 * Effets de la réponse du serveur (posés par apresEssai, joués une seule fois après le dessin) : cases fausses secouées avec C4,
 * puis chaque mot complet et juste s'allume lettre après lettre. Sans mouvement, un seul M2 par mot.
 */
function jouerEffets(racine, st, ui) {
  const fx = ui.effet;
  ui.effet = null;
  if (!fx) return;
  const w = st.grille.w;
  const mod = modele(st.grille);
  const caseDe = (idx) => racine.querySelector(`.mc-case[data-r="${Math.floor(idx / w)}"][data-c="${idx % w}"]`);
  if (fx.faux.length) {
    fx.faux.forEach((idx) => secouer(caseDe(idx)));
    sonJour('C4');
  }
  if (!fx.justes.length) return;
  const etapes = [];
  fx.justes.forEach((k) => mod.liste[k].cases.forEach((c, j, tab) => etapes.push({ k, idx: c.idx, dernier: j === tab.length - 1 })));
  const lance = () => enCascade(etapes, ({ k, idx, dernier }) => {
    ui.cJustes.add(idx);
    const el = caseDe(idx);
    if (el?.isConnected) { el.classList.add('is-juste'); rejoue(el, 'fxj-saut'); }
    if (motionAllowed()) sonJour('M1');
    if (dernier) {
      ui.allumes.add(k);
      setTimeout(() => sonJour('M2'), motionAllowed() ? 100 : 0);
    }
  }, Math.min(80, 1400 / etapes.length)); // une grande grille reste sous 1,4 s
  if (fx.faux.length && motionAllowed()) setTimeout(lance, 450); else lance();
}

/** Écouteurs : cases, définitions, saisie (clavier physique, clavier tactile), Tab, flèches, « Vérifier ». */
function lier(racine, st, ui, env) {
  jouerEffets(racine, st, ui);
  if (st.partie?.fini) return;
  const g = st.grille;
  const mod = modele(g);
  const saisie = racine.querySelector('.mc-saisie');
  const grille = racine.querySelector('.mc-grille');
  const rafraichis = () => majCases(racine, ui, st);
  const focus = () => saisie?.focus({ preventScroll: true });

  /** Case cliquée : elle devient la case active ; une seconde fois, on change de direction si elle a un autre mot. */
  grille.addEventListener('click', (ev) => {
    const el = ev.target.closest('.mc-case:not(.is-noire)');
    if (!el) return;
    const r = Number(el.dataset.r), c = Number(el.dataset.c);
    const e = mod.par.get(`${r},${c}`) || { h: -1, v: -1 };
    const autre = ui.dir === 'h' ? 'v' : 'h';
    if (ui.pos && ui.pos.r === r && ui.pos.c === c) {
      if (e[autre] >= 0) ui.dir = autre;
    } else {
      ui.pos = { r, c };
      if (e[ui.dir] < 0 && e[autre] >= 0) ui.dir = autre;
    }
    rafraichis();
    focus();
  });

  /** Définition touchée : on va à la première case de son mot (ou à la première case vide). */
  racine.querySelectorAll('.mc-def').forEach((b) => b.addEventListener('click', () => {
    const m = mod.liste[Number(b.dataset.m)];
    if (!m) return;
    const vide = m.cases.find((c) => ui.flat[c.idx] === ' ') || m.cases[0];
    ui.pos = { r: vide.r, c: vide.c };
    ui.dir = m.dir;
    rafraichis();
    focus();
  }));

  /** Écrit une lettre dans la case active, avance dans le mot ; grille pleine = envoi automatique. */
  const ecrit = (lettre) => {
    if (!ui.pos || noire(g, ui.pos.r, ui.pos.c)) return;
    const idx = ui.pos.r * g.w + ui.pos.c;
    ui.flat = ui.flat.slice(0, idx) + lettre + ui.flat.slice(idx + 1);
    ui.faux = new Set();
    eteint(ui, mod, idx);
    const act = motActif(ui, mod);
    if (act >= 0) {
      const cases = mod.liste[act].cases;
      const k = cases.findIndex((c) => c.r === ui.pos.r && c.c === ui.pos.c);
      if (k >= 0 && k < cases.length - 1) ui.pos = { r: cases[k + 1].r, c: cases[k + 1].c };
    }
    sauveLocale(st.day, ui.flat);
    rafraichis();
    if (!ui.flat.includes(' ')) {
      ui.mode = 'auto';
      env.envoyer({ lignes: lignesDe(g, ui.flat) }, '.mc-saisie');
    }
  };

  /** Efface la case active ; si elle est vide, recule d'une case dans le mot et efface celle-là. */
  const efface = () => {
    if (!ui.pos) return;
    let idx = ui.pos.r * g.w + ui.pos.c;
    if (ui.flat[idx] === ' ') {
      const act = motActif(ui, mod);
      const cases = act >= 0 ? mod.liste[act].cases : [];
      const k = cases.findIndex((c) => c.r === ui.pos.r && c.c === ui.pos.c);
      if (k > 0) { ui.pos = { r: cases[k - 1].r, c: cases[k - 1].c }; idx = cases[k - 1].idx; }
    }
    ui.flat = ui.flat.slice(0, idx) + ' ' + ui.flat.slice(idx + 1);
    ui.faux = new Set();
    eteint(ui, mod, idx);
    sauveLocale(st.day, ui.flat);
    rafraichis();
  };

  /** Flèches : la case se déplace vers la prochaine case blanche ; la direction suit la flèche. */
  const fleche = (touche) => {
    const d = { ArrowLeft: [0, -1, 'h'], ArrowRight: [0, 1, 'h'], ArrowUp: [-1, 0, 'v'], ArrowDown: [1, 0, 'v'] }[touche];
    if (!d || !ui.pos) return;
    let r = ui.pos.r + d[0], c = ui.pos.c + d[1];
    while (r >= 0 && r < g.h && c >= 0 && c < g.w && noire(g, r, c)) { r += d[0]; c += d[1]; }
    if (r >= 0 && r < g.h && c >= 0 && c < g.w) ui.pos = { r, c };
    ui.dir = d[2];
    rafraichis();
  };

  /** Tab : mot suivant (ou précédent avec Maj), sur sa première case vide. */
  const motSuivant = (delta) => {
    const n = mod.liste.length;
    if (!n) return;
    const act = motActif(ui, mod);
    const m = mod.liste[act < 0 ? 0 : (act + delta + n) % n];
    const vide = m.cases.find((c) => ui.flat[c.idx] === ' ') || m.cases[0];
    ui.pos = { r: vide.r, c: vide.c };
    ui.dir = m.dir;
    rafraichis();
  };

  /** Espace : bascule le sens (horizontal, vertical) quand la case appartient aussi à l'autre mot. */
  const changeSens = () => {
    if (!ui.pos) return;
    const e = mod.par.get(`${ui.pos.r},${ui.pos.c}`);
    const autre = ui.dir === 'h' ? 'v' : 'h';
    if (e && e[autre] >= 0) { ui.dir = autre; rafraichis(); }
  };

  if (saisie) {
    saisie.addEventListener('keydown', (ev) => {
      const k = ev.key;
      if (k === 'Tab') { ev.preventDefault(); motSuivant(ev.shiftKey ? -1 : 1); return; }
      if (k === 'Enter') { ev.preventDefault(); motSuivant(1); return; }
      if (k === ' ') { ev.preventDefault(); changeSens(); return; }
      if (k.startsWith('Arrow')) { ev.preventDefault(); fleche(k); return; }
      if (k === 'Backspace') { ev.preventDefault(); efface(); return; }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (/^\p{L}$/u.test(k)) { ev.preventDefault(); ecrit(k.toLocaleUpperCase('fr')); }
    });
    // Claviers tactiles : la touche arrive comme une saisie dans le champ (qui garde un espace pour détecter l'effacement).
    saisie.addEventListener('input', (ev) => {
      const v = saisie.value;
      saisie.value = ' ';
      if (ev.inputType === 'deleteContentBackward' || v === '') { efface(); return; }
      const dernier = Array.from(v).pop();
      if (/^\p{L}$/u.test(dernier)) ecrit(dernier.toLocaleUpperCase('fr'));
    });
  }

  racine.querySelector('[data-act="verifier"]')?.addEventListener('click', () => {
    ui.mode = 'verifier';
    env.envoyer({ lignes: lignesDe(g, ui.flat), verifier: true }, '.mc-saisie');
  });

  rafraichis();
}

/**
 * Après un essai : la grille acceptée se termine toute seule ; sinon les cases remplies fausses passent en rouge.
 * Le message est rangé dans res.texte pour la zone « live ».
 */
/** La carte de fin attend que le dernier mot ait fini de s'allumer (effet joué par lier, après le dessin). */
const apresRendu = () => (motionAllowed() ? 1900 : 0);

function apresEssai(ui, res, st) {
  ui.faux = new Set();
  ui.allumes = ui.allumes || new Set();
  ui.cJustes = ui.cJustes || new Set();
  const mod = modele(st.grille);
  const vide = (ch) => !ch || ch === ' ' || ch === '.';
  // Mots à allumer : grille juste = tous ceux qui ne le sont pas déjà ; sinon les mots pleins sans case fausse.
  const justes = (faux) => mod.liste.map((m, k) => k).filter((k) => !ui.allumes.has(k)
    && mod.liste[k].cases.every((c) => !vide(ui.flat[c.idx]) && !faux.includes(c.idx)));
  if (res.ok) { ui.effet = { faux: [], justes: justes([]) }; return; }
  const verifier = ui.mode === 'verifier';
  ui.mode = null;
  const fausses = (res.faux || []).filter((idx) => ui.flat[idx] && ui.flat[idx] !== ' ' && ui.flat[idx] !== '.');
  ui.faux = new Set(fausses);
  ui.effet = { faux: fausses, justes: justes(fausses) };
  const s = fausses.length > 1 ? 's' : '';
  if (fausses.length) {
    res.texte = `${fausses.length} case${s} fausse${s} en rouge. ${verifier ? 'Compte comme une erreur.' : 'Corrige-les : la grille se revérifie quand elle est pleine.'}`;
  } else if (verifier) {
    res.texte = 'Les cases remplies sont justes, mais la grille n’est pas finie. Compte comme une erreur.';
  } else {
    res.texte = 'La grille n’est pas encore juste.';
  }
  sauveLocale(st.day, ui.flat);
}

/** Message après un essai : seulement quand la grille n'est pas juste (la fin de partie se montre d'elle-même). */
function reponse(res) {
  return res.texte ? { texte: res.texte, ton: 'error' } : null;
}

/** Texte de partage : numéro, temps et erreurs. */
function copie(st) {
  const p = st.partie;
  if (!p?.fini) return null;
  const bilan = p.erreurs ? `${p.erreurs} erreur${p.erreurs > 1 ? 's' : ''}` : 'sans erreur';
  return `Mots croisés #${st.numero} : grille terminée en ${formatDuree(p.secondes)}, ${bilan}`;
}

/** Configuration du jeu (voir monterGrille). */
const CFG = {
  jeu: JEU,
  titre: 'Mots croisés',
  regles: [
    'Remplis la grille à partir des définitions : une case par lettre, les cases noires restent vides.',
    'Clique une case, puis tape les lettres. Tab ou Entrée passe au mot suivant, Espace change de sens, les flèches déplacent la case.',
    'Clique une définition pour aller à son mot.',
    '« Vérifier » signale les cases fausses en rouge et compte comme une erreur.',
    'La grille se vérifie toute seule quand elle est pleine. Ta saisie est gardée sur cet appareil.',
    'Le chrono ne sert qu’au classement du jour.',
  ],
  chrono: true,
  pills: (st) => {
    const liste = [['Grille', `${st.grille.w} × ${st.grille.h}`]];
    if (st.partie?.fini) liste.push(['Erreurs', st.partie.erreurs]);
    return liste;
  },
  corps,
  lier,
  apresEssai,
  apresRendu,
  reponse,
  finTexte: () => 'Grille complète !',
  copie,
};

/**
 * Monte les Mots croisés dans leur onglet.
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
    fini: (p) => (p.erreurs ? `Grille complète · ${p.erreurs} erreur${p.erreurs > 1 ? 's' : ''}` : 'Grille complète sans erreur'),
    enCours: () => 'Grille commencée',
    aFaire: 'Une mini grille à remplir',
    badgeMax: '10 pts max',
  });
}
