// ===== Humane Gang — page « Jeux » : Anagramme, grille du jour (idée N13) =====
/*
 * Rôle : cinq mots à retrouver, chacun à partir de ses lettres mélangées et de sa définition (de 5 à 9 lettres). On pose les
 * lettres dans l'ordre, en touchant les tuiles ou au clavier (la saisie tape la première tuile disponible de la bonne lettre) ;
 * un clic sur une lettre posée la retire et décale la suite. « Valider » envoie le mot : un mot faux fait trembler la ligne,
 * sans être dévoilé. « Passer » révèle le mot, qui ne compte pas dans le score. « Mélanger » réordonne les tuiles en local.
 * Les mots trouvés ou passés sont gardés sur l'appareil (par jour) pour rester visibles après un rechargement.
 * Le chrono ne sert qu'au classement du jour. Moteur : nj-grilles.js (hg_nj_grille_etat / hg_nj_grille_essai).
 * Effets (effets-jour.js), seulement après la réponse du serveur : un mot trouvé s'allume lettre après lettre (saut, M1 par
 * lettre, M2 à la fin) ; un mauvais mot garde sa secousse et ajoute le son G4 ; « Passer » joue D2.
 * Exporte : mount(panel, ctx), resume(ctx).
 */
import { monterGrille, resumerGrille, formatDuree, voisinFleche } from './nj-grilles.js';
import { motionAllowed } from '../../commun/core.js';
import { sonJour, rejoue, enCascade } from './effets-jour.js';

const JEU = 'anagramme';

/** Lettres sans accent, en capitales : la comparaison de la saisie avec les tuiles. */
const sansAccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
/** Lettres d'un mot (tuiles), dans l'ordre de la grille. */
const lettresDe = (m) => Array.from(m.lettres || '');
/** Mots de la grille du jour. */
const mots = (st) => st.grille?.mots || [];
/** Statut d'un mot : 'trouve', 'passe' ou null. */
const statutDe = (st, i) => st.partie?.etat?.mots?.[i] || null;
/** Clé de stockage local des mots révélés (trouvés ou passés), par jour. */
const cleLocale = (day) => `hg-anagramme:${day}`;

/** Lit les mots révélés gardés sur l'appareil (vide si indisponible). */
function lireRevele(day) {
  try { return JSON.parse(localStorage.getItem(cleLocale(day)) || '{}') || {}; } catch { return {}; }
}
/** Garde les mots révélés sur l'appareil (sans bloquer le jeu si le stockage est refusé). */
function sauveRevele(ui, day) {
  try { localStorage.setItem(cleLocale(day), JSON.stringify(ui.revele)); } catch { /* stockage refusé : rien à faire */ }
}

/** Ordre aléatoire d'une liste (Mélanger). */
function melange(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Premier mot non résolu (trouvé ou passé), ou -1. */
function premierAFaire(st) {
  return mots(st).findIndex((_, i) => !statutDe(st, i));
}

/** Mot actif : celui choisi par l'utilisateur s'il reste à faire, sinon le premier à faire. */
function actifDe(ui, st) {
  if (ui.actif != null && ui.actif >= 0 && mots(st)[ui.actif] && !statutDe(st, ui.actif)) return ui.actif;
  return premierAFaire(st);
}

/** Prépare l'état local (ordre des tuiles, mots révélés) avant le rendu. */
function prepare(st, ui) {
  ui.pose = ui.pose || {};
  ui.ordre = ui.ordre || {};
  if (!ui.revele || ui.jour !== st.day) { ui.revele = lireRevele(st.day); ui.jour = st.day; }
  ui.actif = actifDe(ui, st);
}

/** Lettres posées pour le mot i, sous forme de texte. */
function poseTexte(ui, st, i) {
  const L = lettresDe(mots(st)[i]);
  return (ui.pose[i] || []).map((t) => L[t]).join('');
}

/** Une carte « mot » : définition, cases de réponse, tuiles, actions. */
function carte(st, ui, esc, i, fini) {
  const m = mots(st)[i];
  const L = lettresDe(m);
  const statut = statutDe(st, i);
  const trouve = statut === 'trouve';
  const revele = ui.revele?.[i];
  const pose = ui.pose[i] || [];
  const ordre = ui.ordre[i] || L.map((_, k) => k);
  const secoue = ui.secoue === i;
  const actif = !fini && i === ui.actif;
  const libelle = trouve ? 'Trouvé' : statut === 'passe' ? 'Passé' : 'À trouver';
  const mot = fini ? st.solution?.mots?.[i]?.mot : (statut ? revele?.mot : null);
  const cls = ['ang-mot', trouve ? 'is-trouve' : '', statut === 'passe' ? 'is-passe' : '', actif ? 'is-actif' : '', secoue ? 'is-secoue' : ''].join(' ');
  const entete = `<header class="ang-entete"><p class="ng-label">Mot ${i + 1} · ${m.n} lettres</p><span class="ang-statut">${esc(libelle)}</span></header>`;
  const definition = `<p class="ang-def"><span class="ang-def-t">Définition</span> ${esc(m.def)}</p>`;
  if (fini || statut) {
    const texte = mot ? `<p class="ang-mot-revele" aria-label="Le mot : ${esc(mot)}">${esc(mot)}</p>` : '';
    return `<article class="${cls}" data-i="${i}" aria-label="Mot ${i + 1}">${entete}${definition}${texte}</article>`;
  }
  const cases = Array.from({ length: m.n }, (_, k) => {
    if (k >= pose.length) return '<span class="ang-case" aria-hidden="true"></span>';
    const lettre = L[pose[k]];
    return `<button type="button" class="ang-case is-pleine" data-act="retirer" data-i="${i}" data-k="${k}" aria-label="Lettre ${k + 1} : ${esc(lettre)}, retirer">${esc(lettre)}</button>`;
  }).join('');
  const tuiles = ordre.map((t) => {
    const posee = pose.includes(t);
    return `<button type="button" class="ang-tuile${posee ? ' is-posee' : ''}" data-act="poser" data-i="${i}" data-t="${t}" aria-disabled="${posee}"
      aria-label="${esc(L[t])}${posee ? ', déjà posée' : ''}">${esc(L[t])}</button>`;
  }).join('');
  return `<article class="${cls}" data-i="${i}" aria-label="Mot ${i + 1}">${entete}${definition}
    <div class="ang-cases" role="group" aria-label="Ta réponse, ${m.n} lettres">${cases}</div>
    <div class="ang-tuiles" role="group" aria-label="Lettres à placer">${tuiles}</div>
    <div class="ng-actions ang-actions">
      <button type="button" class="btn btn-ghost" data-act="melanger" data-i="${i}">Mélanger</button>
      <button type="button" class="btn btn-ghost" data-act="effacer" data-i="${i}"${pose.length ? '' : ' disabled'}>Effacer</button>
      <button type="button" class="btn btn-ghost" data-act="passer" data-i="${i}">Passer</button>
      <button type="button" class="btn btn-sand" data-act="valider" data-i="${i}"${pose.length === m.n ? '' : ' disabled'}>Valider</button>
    </div>
    <p class="ang-aide-mot muted small">Touche les lettres dans l’ordre, ou tape-les au clavier.</p>
  </article>`;
}

/** Corps du jeu : les cinq mots, dans l'ordre (le mot actif est en surbrillance). */
function corps(st, ui, esc) {
  const fini = !!st.partie?.fini;
  prepare(st, ui);
  const liste = mots(st).map((_, i) => carte(st, ui, esc, i, fini)).join('');
  return `<div class="ang-liste">${liste}</div>`;
}

/** Envoie le mot i s'il est complet ; sinon le signale sans rien envoyer. */
function valider(env, st, i) {
  const m = mots(st)[i];
  if (!m || statutDe(st, i)) return;
  const pose = env.ui.pose[i] || [];
  if (pose.length < m.n) { env.dire('Il manque des lettres : pose-les toutes avant de valider.'); return; }
  env.ui.envoi = i;
  env.envoyer({ i, mot: poseTexte(env.ui, st, i) }, '.ang-mot.is-actif .ang-tuile');
}

/** Passe le mot i : le serveur le révèle. */
function passer(env, st, i) {
  if (!mots(st)[i] || statutDe(st, i)) return;
  env.ui.envoi = i;
  env.envoyer({ i, passer: true }, '.ang-mot.is-actif .ang-tuile');
}

/** Lettre tapée au clavier : pose la première tuile disponible de cette lettre dans le mot actif. */
function lettreClavier(env, st, i, ch) {
  const m = mots(st)[i];
  if (!m) return;
  const pose = (env.ui.pose[i] = env.ui.pose[i] || []);
  if (pose.length >= m.n) { env.dire('La réponse est pleine : retire une lettre (Retour arrière) ou valide.'); return; }
  const L = lettresDe(m);
  const ordre = env.ui.ordre[i] || L.map((_, k) => k);
  const cible = sansAccent(ch);
  const t = ordre.find((x) => !pose.includes(x) && sansAccent(L[x]) === cible);
  if (t === undefined) { env.dire(`Pas de ${sansAccent(ch)} disponible parmi les lettres de ce mot.`); return; }
  env.ui.pose[i] = [...pose, t];
  env.rerendre(`.ang-mot[data-i="${i}"] .ang-tuile[data-t="${t}"]`);
}

/**
 * Joue l'effet noté par apresEssai (une seule fois, après le dessin). Mot trouvé : le mot révélé est écrit lettre après
 * lettre ; le texte final est remis en place à la fin (et tout de suite sans mouvement).
 */
function jouerEffets(racine, ui) {
  const fx = ui.effet;
  ui.effet = null;
  if (!fx) return;
  if (fx.type === 'faux') { sonJour('G4'); return; }
  if (fx.type === 'passe') { sonJour('D2'); return; }
  const carteMot = racine.querySelector(`.ang-mot[data-i="${fx.i}"]`);
  const revele = carteMot?.querySelector('.ang-mot-revele');
  if (!revele || !motionAllowed()) { sonJour('M2'); return; }
  const texte = revele.textContent;
  revele.setAttribute('aria-label', `Le mot : ${texte}`);
  revele.innerHTML = Array.from(texte).map((l) => `<span style="visibility:hidden" aria-hidden="true">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('');
  const lettres = [...revele.children];
  const duree = enCascade(lettres, (s) => {
    s.style.visibility = '';
    s.style.display = 'inline-block';
    rejoue(s, 'fxj-saut');
    sonJour('M1');
  }, 90);
  setTimeout(() => {
    sonJour('M2');
    if (revele.isConnected) revele.textContent = texte;
    rejoue(carteMot, 'fxj-bon');
  }, duree + 80);
}

/** Écouteurs : tuiles, cases de réponse, Mélanger, Effacer, Passer, Valider ; le mot cliqué devient le mot actif. */
function lier(racine, st, ui, env) {
  jouerEffets(racine, ui);
  if (st.partie?.fini) return;
  const choisir = (i) => {
    if (ui.actif === i) return;
    ui.actif = i;
    racine.querySelectorAll('.ang-mot').forEach((c) => c.classList.toggle('is-actif', Number(c.dataset.i) === i));
  };
  racine.addEventListener('pointerdown', (ev) => {
    const c = ev.target.closest('.ang-mot');
    if (c && !statutDe(env.etat(), Number(c.dataset.i))) choisir(Number(c.dataset.i));
  });
  racine.addEventListener('focusin', (ev) => {
    const c = ev.target.closest('.ang-mot');
    if (c && !statutDe(env.etat(), Number(c.dataset.i))) choisir(Number(c.dataset.i));
  });
  // Flèches : d'une tuile à l'autre dans le groupe de tuiles du mot (Entrée et Espace posent la tuile, par le bouton).
  racine.addEventListener('keydown', (ev) => {
    const t = ev.target;
    if (!ev.key.startsWith('Arrow') || !t.classList?.contains('ang-tuile')) return;
    ev.preventDefault();
    voisinFleche(t, ev.key, [...t.parentElement.querySelectorAll('.ang-tuile')])?.focus();
  });
  racine.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-act]');
    if (!b || !racine.contains(b) || b.getAttribute('aria-disabled') === 'true') return;
    const etat = env.etat();
    const i = Number(b.dataset.i);
    const act = b.dataset.act;
    if (act === 'poser') {
      const t = Number(b.dataset.t);
      const pose = env.ui.pose[i] || [];
      if (pose.length >= mots(etat)[i].n) { env.dire('La réponse est pleine : retire une lettre pour en poser une autre.'); return; }
      env.ui.pose[i] = [...pose, t];
      env.rerendre(`.ang-mot[data-i="${i}"] .ang-tuile[data-t="${t}"]`);
    } else if (act === 'retirer') {
      const k = Number(b.dataset.k);
      env.ui.pose[i] = (env.ui.pose[i] || []).filter((_, j) => j !== k);
      env.rerendre(`.ang-mot[data-i="${i}"] [data-act="retirer"][data-k="${k}"], .ang-mot[data-i="${i}"] [data-act="effacer"]`);
    } else if (act === 'effacer') {
      env.ui.pose[i] = [];
      env.rerendre(`.ang-mot[data-i="${i}"] [data-act="effacer"]`);
    } else if (act === 'melanger') {
      const L = lettresDe(mots(etat)[i]);
      env.ui.ordre[i] = melange(L.map((_, k) => k));
      env.rerendre(`.ang-mot[data-i="${i}"] [data-act="melanger"]`);
    } else if (act === 'passer') {
      passer(env, etat, i);
    } else if (act === 'valider') {
      valider(env, etat, i);
    }
  });
  choisir(ui.actif ?? -1);
}

/**
 * Clavier physique : lettres (accents ignorés), Retour arrière, Échap (vide le mot actif), Entrée (valide).
 * Actif seulement quand l'onglet est affiché, qu'aucun champ n'a le focus et que le focus est dans la page des jeux.
 */
function init(panel, env) {
  if (panel._angClavier) return;
  panel._angClavier = true;
  document.addEventListener('keydown', (ev) => {
    if (!env.visible() || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const st = env.etat();
    if (!st?.grille || st.partie?.fini) return;
    const el = document.activeElement;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
    if (el && el !== document.body && !panel.contains(el)) return;
    const i = env.ui.actif;
    if (i == null || i < 0) return;
    const k = ev.key;
    if (/^\p{L}$/u.test(k)) { ev.preventDefault(); lettreClavier(env, st, i, k); }
    else if (k === 'Backspace') {
      ev.preventDefault();
      const pose = env.ui.pose[i] || [];
      if (!pose.length) return;
      const t = pose[pose.length - 1];
      env.ui.pose[i] = pose.slice(0, -1);
      env.rerendre(`.ang-mot[data-i="${i}"] .ang-tuile[data-t="${t}"]`);
    } else if (k === 'Escape' && (env.ui.pose[i] || []).length) {
      ev.preventDefault();
      env.ui.pose[i] = [];
      env.rerendre(`.ang-mot[data-i="${i}"] [data-act="effacer"]`);
    } else if (k === 'Enter' && !(el && el.tagName === 'BUTTON')) {
      ev.preventDefault();
      valider(env, st, i);
    }
  });
}

/** Après un essai : mot trouvé ou passé => révélé et retiré de la saisie ; mot faux => secousse, saisie gardée. */
/** La carte de fin attend que le dernier mot ait fini de s'allumer (effet joué par lier, après le dessin). */
const apresRendu = () => (motionAllowed() ? 1000 : 0);

function apresEssai(ui, res, st) {
  const i = ui.envoi;
  ui.envoi = null;
  if (i == null) return;
  if (res.ok || res.passe) {
    ui.pose[i] = [];
    ui.revele[i] = { mot: res.mot, passe: !!res.passe };
    sauveRevele(ui, st.day);
    ui.effet = res.passe ? { type: 'passe', i } : { type: 'trouve', i };
  } else {
    ui.secoue = i;
    setTimeout(() => { ui.secoue = null; }, 450); // une seule secousse : les dessins suivants ne la rejouent pas
    ui.effet = { type: 'faux', i };
  }
}

/** Message après un essai (zone « live ») : mot trouvé, mot passé, ou mauvais mot sans le dévoiler. */
function reponse(res) {
  if (res.passe) return { texte: `Mot passé : ${res.mot}. Il ne compte pas dans le score.` };
  if (res.ok) return { texte: `Bravo, c’est ${res.mot}.`, ton: 'ok' };
  return { texte: 'Ce n’est pas le bon mot. Essaie encore.', ton: 'error' };
}

/** Texte de partage : score, temps, et un carré par mot (vert trouvé, noir passé). */
function copie(st) {
  const p = st.partie;
  if (!p?.fini) return null;
  const carres = mots(st).map((_, i) => (statutDe(st, i) === 'trouve' ? '🟩' : '⬛')).join('');
  return `Anagramme #${st.numero} ${p.score}/${mots(st).length} en ${formatDuree(p.secondes)}\n${carres}`;
}

/** Configuration du jeu (voir monterGrille). */
const CFG = {
  jeu: JEU,
  titre: 'Anagramme',
  regles: [
    'Cinq mots sont mélangés : retrouve-les à partir de leur définition.',
    'Pose les lettres dans l’ordre, en touchant les tuiles ou au clavier. Un clic sur une lettre posée la retire.',
    'Un mot faux fait trembler la ligne, sans être dévoilé. « Passer » révèle le mot, sans point.',
    'Le score est le nombre de mots trouvés, sur cinq.',
    'Le chrono ne sert qu’au classement du jour.',
  ],
  chrono: true,
  pills: (st) => [['Trouvés', `${mots(st).filter((_, i) => statutDe(st, i) === 'trouve').length} / ${mots(st).length}`]],
  corps,
  lier,
  init,
  apresEssai,
  apresRendu,
  reponse,
  finTexte: (st) => {
    const p = st.partie;
    const total = mots(st).length;
    return p.gagne ? 'Les cinq mots sont trouvés !' : `${p.score} mot${p.score > 1 ? 's' : ''} sur ${total} trouvé${p.score > 1 ? 's' : ''}.`;
  },
  copie,
};

/**
 * Monte l'Anagramme dans son onglet.
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
    fini: (p) => `${p.score} mot${p.score > 1 ? 's' : ''} sur 5 trouvé${p.score > 1 ? 's' : ''}`,
    enCours: (p) => {
      const n = Object.values(p.etat?.mots || {}).filter((v) => v === 'trouve').length;
      return `${n} mot${n > 1 ? 's' : ''} trouvé${n > 1 ? 's' : ''} sur 5`;
    },
    aFaire: 'Cinq mots mélangés à retrouver',
    badgeMax: '10 pts max',
  });
}
