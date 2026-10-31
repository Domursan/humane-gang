// ===== Humane Gang — page « Jeux » : Connexions, grille du jour (idée N10) =====
/*
 * Rôle : seize mots cachent quatre groupes de quatre. On sélectionne quatre mots (quatre au plus) et on valide : un groupe
 * trouvé s'affiche en bandeau de couleur (sable, sauge, ardoise, prune, selon le niveau de difficulté). Trois mots sur quatre
 * dans un même groupe = « À un mot près ». Quatre erreurs et la grille est perdue ; en fin de partie, les quatre groupes
 * sont montrés. « Mélanger » réordonne les tuiles en local. Moteur : nj-grilles.js (hg_nj_grille_etat / hg_nj_grille_essai).
 * Effets (réponse du serveur seulement, jamais à l'ouverture) : tuile choisie = son C1 ; groupe juste = les quatre tuiles sautent
 * (90 ms d'écart) puis le bandeau apparaît en pop avec C2 ; « à un mot près » = secousse + C3 ; erreur = secousse + C4.
 * Exporte : mount(panel, ctx), resume(ctx).
 */
import { monterGrille, resumerGrille, voisinFleche } from './nj-grilles.js';
import { motionAllowed } from '../../commun/core.js';
import { sonJour, secouer, rejoue, enCascade } from './effets-jour.js';

const JEU = 'connexions';
/** Erreurs permises avant la défaite. */
const ERREURS_MAX = 4;
/** Classe de couleur et carré de partage selon le niveau (1 à 4). */
const NIVEAU = {
  1: { cls: 'ng-n1', carre: '🟨' },
  2: { cls: 'ng-n2', carre: '🟩' },
  3: { cls: 'ng-n3', carre: '🟦' },
  4: { cls: 'ng-n4', carre: '🟪' },
};

/** Bandeau d'un groupe (titre et mots). */
function bandeau(g, esc, etat = '') {
  // Le niveau est écrit (« Niveau 2 ») : la couleur du bandeau ne suffit pas à le dire aux daltoniens.
  const niveau = NIVEAU[g.niveau] ? `<p class="ng-band-n">Niveau ${g.niveau}</p>` : '';
  return `<li class="ng-band ${NIVEAU[g.niveau]?.cls || 'ng-n1'}${etat ? ` ${etat}` : ''}">${niveau}<p class="ng-band-t">${esc(g.titre)}</p>
    <p class="ng-band-m">${esc((g.mots || []).join(' · '))}</p></li>`;
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

/** Corps du jeu : erreurs restantes, groupes trouvés, tuiles (ou les quatre groupes en fin de partie). */
function corps(st, ui, esc) {
  const p = st.partie || {};
  const fini = !!p.fini;
  const trouves = st.grille.trouves || [];
  const dejaMots = new Set(trouves.flatMap((t) => t.mots));
  const restants = st.grille.mots.filter((m) => !dejaMots.has(m));
  ui.ordre = ui.ordre ? ui.ordre.filter((m) => restants.includes(m)) : [...st.grille.mots];
  ui.sel = (ui.sel || []).filter((m) => restants.includes(m));
  const restantes = Math.max(0, ERREURS_MAX - (p.erreurs || 0));
  const points = Array.from({ length: ERREURS_MAX }, (_, i) => `<span class="ng-dot${i < restantes ? ' is-on' : ''}" aria-hidden="true"></span>`).join('');
  const erreurs = `<p class="ng-err"><span>Erreurs restantes</span>
    <span class="ng-dots" role="img" aria-label="${restantes} sur ${ERREURS_MAX}">${points}</span></p>`;
  if (fini) {
    const titres = new Set(trouves.map((t) => t.titre));
    const groupes = [...(st.solution?.groupes || [])].sort((a, b) => a.niveau - b.niveau);
    return `${erreurs}<ul class="ng-bands" aria-label="Les quatre groupes">${groupes.map((g) => bandeau(g, esc, titres.has(g.titre) ? 'is-trouve' : 'is-rate')).join('')}</ul>`;
  }
  const bandes = trouves.map((t) => bandeau(t, esc, 'is-trouve')).join('');
  const tuiles = ui.ordre.map((m) => {
    const on = ui.sel.includes(m);
    return `<button type="button" class="ng-tile${on ? ' is-sel' : ''}" data-mot="${esc(m)}" aria-pressed="${on}">${esc(m)}</button>`;
  }).join('');
  return `${erreurs}
    ${bandes ? `<ul class="ng-bands" aria-label="Groupes trouvés">${bandes}</ul>` : ''}
    <div class="ng-tiles" role="group" aria-label="Mots à classer">${tuiles}</div>
    <div class="ng-actions">
      <button type="button" class="btn btn-ghost" data-act="melanger">Mélanger</button>
      <button type="button" class="btn btn-ghost" data-act="vider"${ui.sel.length ? '' : ' disabled'}>Désélectionner</button>
      <button type="button" class="btn btn-sand" data-act="valider"${ui.sel.length === ERREURS_MAX ? '' : ' disabled'}>Valider</button>
    </div>`;
}

/** Écouteurs : sélection (quatre au plus), Mélanger, Désélectionner, Valider. */
function lier(racine, st, ui, env) {
  if (st.partie?.fini) return;
  const majSelection = () => {
    racine.querySelectorAll('[data-mot]').forEach((b) => {
      const on = ui.sel.includes(b.dataset.mot);
      b.classList.toggle('is-sel', on);
      b.setAttribute('aria-pressed', String(on));
    });
    racine.querySelector('[data-act="valider"]').disabled = ui.sel.length !== ERREURS_MAX;
    racine.querySelector('[data-act="vider"]').disabled = !ui.sel.length;
  };
  racine.querySelectorAll('[data-mot]').forEach((b) => b.addEventListener('click', () => {
    const m = b.dataset.mot;
    if (ui.sel.includes(m)) ui.sel = ui.sel.filter((x) => x !== m);
    else if (ui.sel.length >= ERREURS_MAX) { env.dire('Quatre mots au plus : désélectionne-en un pour en choisir un autre.'); return; }
    else { ui.sel = [...ui.sel, m]; sonJour('C1'); }
    majSelection();
  }));
  racine.querySelector('[data-act="vider"]').addEventListener('click', () => { ui.sel = []; majSelection(); });
  racine.querySelector('[data-act="melanger"]').addEventListener('click', () => {
    ui.ordre = melange(ui.ordre);
    env.rerendre('[data-act="melanger"]');
  });
  racine.querySelector('[data-act="valider"]').addEventListener('click', () => {
    if (ui.sel.length === ERREURS_MAX) env.envoyer({ mots: [...ui.sel] }, '[data-act="melanger"]');
  });
  // Flèches : d'une tuile à l'autre dans la grille (Entrée et Espace sélectionnent, par le bouton).
  const tuiles = racine.querySelector('.ng-tiles');
  tuiles?.addEventListener('keydown', (ev) => {
    if (!ev.key.startsWith('Arrow')) return;
    ev.preventDefault();
    voisinFleche(ev.target, ev.key, [...tuiles.querySelectorAll('.ng-tile')])?.focus();
  });
}

/** Message après un essai : groupe trouvé, « à un mot près », ou pas un groupe. */
function reponse(res) {
  if (res.ok && res.groupe) return { texte: `Groupe trouvé : ${res.groupe.titre}.`, ton: 'ok' };
  if (res.presque) return { texte: 'À un mot près !' };
  return { texte: 'Pas un groupe cette fois.', ton: 'error' };
}

/** Pause (ms) ; 0 n'attend pas. */
const pause = (ms) => new Promise((r) => { if (ms > 0) setTimeout(r, ms); else r(); });

/**
 * Avant le redessin : groupe juste = les tuiles choisies sautent l'une après l'autre ; sinon secousse de la grille de tuiles.
 * Les sons des erreurs partent ici, en même temps que la secousse. Sans mouvement : aucune attente, les sons restent.
 */
async function avantRendu({ res, panel }) {
  const choisies = [...panel.querySelectorAll('.ng-tile.is-sel')];
  if (res.ok && res.groupe) {
    const ms = enCascade(choisies, (t) => rejoue(t, 'fxj-saut'), 90);
    await pause(ms ? ms + 260 : 0);
    return;
  }
  sonJour(res.presque ? 'C3' : 'C4');
  secouer(panel.querySelector('.ng-tiles'));
  await pause(motionAllowed() ? 420 : 0);
}

/** Après le redessin : le bandeau du groupe trouvé apparaît en pop avec C2 ; la carte de fin attend un instant. */
function apresRendu({ res, apres, panel }) {
  if (!(res.ok && res.groupe)) return 0;
  sonJour('C2');
  const bande = [...panel.querySelectorAll('.ng-bands .ng-band.is-trouve')].find((b) => b.querySelector('.ng-band-t')?.textContent === res.groupe.titre);
  rejoue(bande, 'fxj-pop');
  return apres.partie?.fini ? 500 : 0;
}

/** Texte de partage : une ligne de quatre carrés par essai (couleur du groupe trouvé, gris sinon). */
function copie(st) {
  const p = st.partie;
  if (!p?.fini) return null;
  const sol = st.solution?.groupes || [];
  const lignes = (p.etat?.essais || []).map((essai) => {
    const ens = new Set(essai);
    const g = sol.find((x) => x.mots.length === ens.size && x.mots.every((m) => ens.has(m)));
    // Le niveau est aussi écrit en chiffre (et ✗ pour un essai raté) : les carrés de couleur seuls ne le disent pas aux daltoniens.
    return g ? `${NIVEAU[g.niveau].carre.repeat(4)} ${g.niveau}` : '⬜⬜⬜⬜ ✗';
  });
  const bilan = p.gagne ? `trouvé, ${p.erreurs} erreur${p.erreurs > 1 ? 's' : ''}` : 'perdu';
  return [`Connexions #${st.numero} ${bilan}`, ...lignes].join('\n');
}

/** Configuration du jeu (voir monterGrille). */
const CFG = {
  jeu: JEU,
  titre: 'Connexions',
  regles: [
    'Seize mots cachent quatre groupes de quatre.',
    'Choisis quatre mots, puis valide : un groupe trouvé s’affiche en bandeau de couleur.',
    'Trois mots sur quatre dans un même groupe : « à un mot près ».',
    'Quatre erreurs et la grille est perdue. Les quatre groupes sont montrés à la fin.',
    'Le chrono ne sert qu’au classement du jour.',
  ],
  chrono: true,
  corps,
  lier,
  apresEssai: (ui) => { ui.sel = []; },
  avantRendu,
  apresRendu,
  reponse,
  finTexte: (st) => (st.partie.gagne ? 'Grille trouvée !' : 'Grille perdue : quatre erreurs.'),
  copie,
};

/**
 * Monte le jeu Connexions dans son onglet.
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
    fini: (p) => (p.gagne ? 'Grille trouvée' : 'Grille perdue'),
    enCours: (p) => `${(p.etat?.trouves || []).length} groupe${(p.etat?.trouves || []).length > 1 ? 's' : ''} trouvé${(p.etat?.trouves || []).length > 1 ? 's' : ''} sur 4`,
    aFaire: '16 mots, 4 groupes cachés',
    badgeMax: '10 pts max',
  });
}
