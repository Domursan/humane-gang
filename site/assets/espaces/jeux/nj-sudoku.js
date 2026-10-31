// ===== Humane Gang — Jeux › Sudoku du jour (solo, la même grille pour tout le gang) =====
/*
 * Rôle : la grille 9 × 9 du jour, donnée par le serveur (etat.sudoku.donnes, 81 caractères, « 0 » = case vide), niveau
 * affiché (facile, moyen ou difficile). Les chiffres donnés sont en gras et ne bougent pas ; les tiens sont en sable.
 * Case active, sa ligne, sa colonne et son bloc 3 × 3 sont surlignés ; les conflits sont en rouge. Pavé 1-9, Effacer,
 * mode Notes (petits chiffres). Clavier : flèches, chiffres, Retour arrière, N pour les notes.
 * Quand les 81 cases sont pleines sans conflit, la grille part au serveur (hg_nj_solo_fin) : le serveur la compare à la
 * solution. Refusée : « Grille incorrecte », on corrige et une nouvelle partie chronométrée démarre (hg_nj_solo_debut).
 * Si la grille du jour est déjà terminée (sudoku_fait), elle se rejoue pour le plaisir, sans score.
 * Le temps officiel est celui du serveur (au premier chiffre posé) ; le chrono affiché pendant la partie est local.
 * Effets (effets-jour.js), seulement sur un vrai changement pendant la visite : une ligne, une colonne ou un bloc qui vient
 * d'être complété s'éclaire (éclat, son M3) ; une grille refusée secoue la grille (G4) ; la fin gagnée habille la carte de
 * résultat (finDePartie : tampon, son, Paillettes qui défilent) ; la grille déjà terminée à l'ouverture reçoit le tampon seul ;
 * la grille rejouée sans score ne change rien à la fin.
 * Onglet : /pages/jeux/jeux.html#sudoku. Contrat : mount(panel, ctx), unmount(), resume(ctx).
 * Dépendances : core.js (errMsg), jeux/commun.js (chargerCss, nf, classementHtml, zurichIso, jourLong).
 * Données : RPC hg_nj_solo_etat, hg_nj_solo_debut, hg_nj_solo_fin (migration 138).
 * Exporte : mount, unmount, resume.
 */
import { paillSym } from '../../commun/paillettes.js';
import { esc, errMsg } from '../../commun/core.js';
import { chargerCss, nf, classementHtml, zurichIso, jourLong } from './commun.js';
import { sonJour, pointsDeGain, rejoue, secouer, finDePartie } from './effets-jour.js';

/* ---------- Constantes ---------- */
/** Déplacement au clavier (ligne, colonne). */
const DEP = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
/** Niveau affiché (libellé). */
const NIVEAU = { facile: 'facile', moyen: 'moyen', difficile: 'difficile' };

/* ---------- État ---------- */
// panel, ctx : panneau et contexte de la page ; gen : numéro de partie (ignore les réponses tardives) ; jour : grille du jour
// (AAAA-MM-JJ, renvoyé par le serveur) ; niveau ; donnes : chiffres donnés (0 = vide) ; val : chiffres posés (donnés compris) ;
// notes : candidats par case (bits 1 à 9) ; actif : case sélectionnée ; modeNotes : mode Notes ; t0 : premier chiffre posé
// (ms) ; run : promesse de l'identifiant de partie ; horloge : minuteur ; fini : grille complète et juste envoyée ;
// entrainement : grille du jour déjà terminée, rejouée sans score ; officiel : réponse de hg_nj_solo_fin ; gain, recompense, board.
let S = null;

/* ---------- Outils ---------- */
/** Élément du panneau. */
const q = (sel) => S.panel.querySelector(sel);

/** Durée lisible « mm:ss » (ou « h:mm:ss »), tronquée à la seconde. */
function fmtTemps(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}

/** Vrai si les deux cases partagent une ligne, une colonne ou un bloc 3 × 3. */
function memeZone(i, j) {
  const ri = Math.floor(i / 9), ci = i % 9, rj = Math.floor(j / 9), cj = j % 9;
  return ri === rj || ci === cj || (Math.floor(ri / 3) === Math.floor(rj / 3) && Math.floor(ci / 3) === Math.floor(cj / 3));
}

/** Cases en conflit (même chiffre dans une même ligne, colonne ou bloc) : tableau d'octets. */
function conflits() {
  const bad = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    const v = S.val[i];
    if (!v) continue;
    for (let j = i + 1; j < 81; j++) if (S.val[j] === v && memeZone(i, j)) { bad[i] = 1; bad[j] = 1; }
  }
  return bad;
}

/** Les trois zones (ligne, colonne, bloc) d'une case : listes d'indices. */
function zonesDe(i) {
  const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3);
  const ligne = [], colonne = [], bloc = [];
  for (let k = 0; k < 9; k++) {
    ligne.push(r * 9 + k);
    colonne.push(k * 9 + c);
    bloc.push((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
  }
  return [ligne, colonne, bloc];
}

/** Vrai si la zone est pleine avec les neuf chiffres, chacun une fois. */
const zoneComplete = (zone) => zone.every((k) => S.val[k] > 0) && new Set(zone.map((k) => S.val[k])).size === 9;

/** Éclat de la ligne, de la colonne ou du bloc qui vient d'être complété par la case i (son M3). */
function eclatZones(i, avant) {
  const neuves = zonesDe(i).filter((z, n) => !avant[n] && zoneComplete(z));
  if (!neuves.length) return;
  const cases = [...new Set(neuves.flat())];
  sonJour('M3');
  cases.forEach((k, n) => { const b = S.cases[k]; b.style.animationDelay = `${n * 35}ms`; rejoue(b, 'fxj-eclat'); });
}

/** Points d'une grille d'après son temps : tranches de 2 minutes au-delà de 5 minutes (palier 1 = 10 points). */
const pointsDeTemps = (secondes) => Math.max(1, 10 - Math.max(0, Math.floor((Number(secondes) - 300) / 120)));

/* ---------- Montage ---------- */
/**
 * Monte l'onglet Sudoku du jour : grille, pavé, règles, classement du jour.
 * @param {HTMLElement} panel Panneau vide de l'onglet.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte de la page.
 */
export async function mount(panel, ctx) {
  chargerCss('solo');
  S = { panel, ctx, gen: 0, jour: zurichIso(), niveau: 'facile', donnes: new Array(81).fill(0), val: new Array(81).fill(0), notes: new Array(81).fill(0),
    actif: 0, modeNotes: false, t0: 0, run: null, horloge: null, fini: false, entrainement: false, officiel: null, gain: 0, recompense: false, board: [], cases: [] };
  panel.innerHTML = `<div class="jg sol sol-sudoku">
    <header class="sol-head">
      <div>
        <p class="sol-eyebrow">Solo · grille du jour</p>
        <h2 class="sol-titre">Sudoku du jour</h2>
        <p class="small muted jg-sub" id="su-sub">Chargement…</p>
      </div>
      <div class="sol-pills">
        <span class="sol-pill">Chrono <strong id="su-chrono">00:00</strong></span>
        <span class="sol-pill">Niveau <strong id="su-niveau">–</strong></span>
        <span class="sol-gain" id="su-gain"></span>
      </div>
    </header>
    <div class="jg-grid2">
      <div class="jg-col">
        <section class="jg-card sol-jeu" id="su-jeu" aria-labelledby="su-jeu-h">
          <h3 class="jg-h3 visually-hidden" id="su-jeu-h">Grille du sudoku</h3>
          <p class="sol-banniere">La même grille pour tout le gang aujourd’hui</p>
          <p class="sol-statut" id="su-statut" role="status" aria-live="polite"></p>
          <div class="sol-grille" id="su-grille" role="group" aria-label="Grille de sudoku, 9 lignes et 9 colonnes"></div>
          <div class="sol-pave" id="su-pave" role="group" aria-label="Chiffres à placer">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => `<button type="button" class="btn btn-ghost" data-chiffre="${v}" aria-label="Chiffre ${v}">${v}</button>`).join('')}
            <button type="button" class="btn btn-ghost sol-effacer" data-act="effacer">Effacer</button>
          </div>
          <div class="sol-outils">
            <button type="button" class="btn btn-ghost" id="su-notes" aria-pressed="false">Notes : désactivé</button>
            <button type="button" class="btn btn-ghost" id="su-rejouer" hidden>Rejouer sans score</button>
          </div>
          <p class="sol-aide small muted">Chaque chiffre se place une seule fois par ligne, par colonne et par bloc 3 × 3. Clavier : flèches, chiffres, Retour arrière, N pour les notes.</p>
          <section class="sol-fin" id="su-fin" aria-label="Résultat" hidden></section>
        </section>
      </div>
      <div class="jg-col">
        <section class="jg-card" aria-labelledby="su-regles-h">
          <h3 class="jg-h3" id="su-regles-h">Règles en bref</h3>
          <ol class="sol-regles">
            <li data-n="1">Remplis la grille avec les chiffres de 1 à 9.</li>
            <li data-n="2">Chaque chiffre n’apparaît qu’une fois par ligne, par colonne et par bloc 3 × 3.</li>
            <li data-n="3">Les chiffres en gras sont donnés. Les tiens sont en sable.</li>
            <li data-n="4">Un conflit s’affiche en rouge. Le mode Notes sert à noter les candidats en petits chiffres.</li>
            <li data-n="5">Grille pleine et juste : la partie est finie, et le temps du serveur compte.</li>
          </ol>
        </section>
        <section class="jg-card" aria-labelledby="su-board-h">
          <h3 class="jg-h3" id="su-board-h">Classement du jour</h3>
          <p class="small muted">Le temps de chacun sur la grille du jour.</p>
          <div id="su-board" aria-live="polite"><p class="jg-empty-row">Chargement…</p></div>
        </section>
      </div>
    </div>
  </div>`;

  const grille = q('#su-grille');
  for (let i = 0; i < 81; i++) {
    const b = document.createElement('button');
    const r = Math.floor(i / 9), c = i % 9;
    b.type = 'button';
    b.dataset.i = String(i);
    b.className = `sol-s${c % 3 === 2 && c < 8 ? ' is-br' : ''}${r % 3 === 2 && r < 8 ? ' is-bb' : ''}`;
    b.tabIndex = i === 0 ? 0 : -1;
    grille.appendChild(b);
    S.cases.push(b);
  }

  panel.addEventListener('click', onClic);
  q('#su-jeu').addEventListener('keydown', onClavier);
  grille.addEventListener('focusin', (e) => { const b = e.target.closest?.('.sol-s'); if (b) S.actif = Number(b.dataset.i); });

  await chargerEtat();
}

/** Libère le minuteur (appelé en quittant la page). */
export function unmount() {
  arreterHorloge();
  S = null;
}

/* ---------- Résumé pour l'onglet « Les missions du jour » ---------- */
/**
 * État de la grille du jour, pour le tableau de bord.
 * @param {{sb: object}} ctx Contexte de la page.
 * @returns {Promise<{etat: string, texte: string, badge: string, gain: number}>}
 */
export async function resume({ sb }) {
  const { data, error } = await sb.rpc('hg_nj_solo_etat', { p_jeu: 'sudoku', p_var: zurichIso() });
  if (error) throw error;
  const gain = data?.recompense_aujourdhui ? Number(data.gain) || 0 : 0;
  if (data?.sudoku_fait) return { etat: 'fait', texte: `Grille du jour terminée en ${fmtTemps(data.sudoku_fait.secondes)}`, badge: 'Fait', gain };
  // Le niveau n'est affiché que s'il existe (sans lui : « Grille du jour » seul, sans « · niveau » suspendu)
  const niveau = data?.sudoku?.niveau;
  const texte = niveau != null && String(niveau).trim() !== '' ? `Grille du jour · niveau ${niveau}` : 'Grille du jour';
  return { etat: 'a_jouer', texte, badge: 'À jouer', gain };
}

/* ---------- Données ---------- */
/** Lit la grille du jour, le classement et les Paillettes : hg_nj_solo_etat. */
async function chargerEtat() {
  const gen = S.gen;
  const { sb, toast } = S.ctx;
  let data = null, error = null;
  try { ({ data, error } = await sb.rpc('hg_nj_solo_etat', { p_jeu: 'sudoku', p_var: S.jour })); } catch (e) { error = e; }
  if (!S || gen !== S.gen) return;
  if (error || !data?.sudoku) {
    const msg = errMsg(error || 'grille indisponible');
    q('#su-statut').textContent = `Le sudoku n’a pas pu se charger : ${msg}`;
    toast(`Sudoku : ${msg}`, 'error');
    return;
  }
  S.jour = data.day || S.jour;
  S.niveau = data.sudoku.niveau || 'facile';
  const donnes = String(data.sudoku.donnes || '');
  for (let i = 0; i < 81; i++) {
    const v = Number(donnes.charAt(i)) || 0;
    S.donnes[i] = v;
    S.val[i] = v;
  }
  S.notes.fill(0);
  S.entrainement = !!data.sudoku_fait;
  S.officiel = null;
  S.gain = Number(data.gain) || 0;
  S.recompense = !!data.recompense_aujourdhui;
  S.board = data.board || [];
  q('#su-sub').textContent = `Grille du ${jourLong(S.jour)}`;
  q('#su-niveau').textContent = NIVEAU[S.niveau] || S.niveau;
  majGain();
  majBoard();
  if (S.entrainement) {
    majFin({ type: 'deja', secondes: data.sudoku_fait.secondes });
  }
  maj();
}

/** Lance une partie chronométrée côté serveur (hg_nj_solo_debut) : renvoie la promesse de l'identifiant (null si refusée). */
function lancerDebut() {
  const { sb, toast } = S.ctx;
  const jour = S.jour;
  return (async () => {
    const { data, error } = await sb.rpc('hg_nj_solo_debut', { p_jeu: 'sudoku', p_var: jour });
    if (error) throw error;
    return data;
  })().catch((e) => { toast(`Sudoku : ${errMsg(e)}`, 'error'); return null; });
}

/** Premier chiffre posé : démarre la partie (serveur, sauf grille déjà terminée) et le chrono local. */
function demarrer() {
  if (S.t0) return;
  S.run = S.entrainement ? null : lancerDebut();
  demarrerHorloge();
}

/** Chrono local : part du premier chiffre posé (ou de la nouvelle partie après une grille refusée). */
function demarrerHorloge() {
  arreterHorloge();
  S.t0 = performance.now();
  S.horloge = setInterval(() => { const c = q('#su-chrono'); if (c) c.textContent = fmtTemps((performance.now() - S.t0) / 1000); }, 250);
}

/** Arrête le chrono local. */
function arreterHorloge() {
  if (S?.horloge) clearInterval(S.horloge);
  if (S) S.horloge = null;
}

/** Grille complète et sans conflit : envoie la grille au serveur (hg_nj_solo_fin) pour vérification. */
async function finir() {
  const gen = S.gen;
  const { sb, toast } = S.ctx;
  arreterHorloge();
  const local = (performance.now() - S.t0) / 1000;
  if (S.entrainement) { majFin({ type: 'rejoue', secondes: local }); return; }
  try {
    const id = await S.run;
    if (!S || gen !== S.gen) return;
    if (!id) { majFin({ type: 'non_envoye' }); return; }
    const grille = S.val.join('');
    const { data, error } = await sb.rpc('hg_nj_solo_fin', { p_run: id, p_res: { gagne: true, grille } });
    if (!S || gen !== S.gen) return;
    if (error) throw error;
    if (!data?.ok) {
      // Grille refusée : on corrige, et une nouvelle partie chronométrée démarre
      S.fini = false;
      S.run = lancerDebut();
      demarrerHorloge();
      majFin({ type: 'incorrecte' });
      maj();
      secouer(q('#su-grille'));
      sonJour('G4');
      return;
    }
    if (data.reward > 0) S.recompense = true;
    S.officiel = data;
    S.board = data.board || S.board;
    majBoard();
    majGain();
    majFin({ type: 'gagne', secondes: data.secondes, reward: Number(data.reward) || 0 });
  } catch (e) {
    toast(`Sudoku : ${errMsg(e)}`, 'error');
    majFin({ type: 'non_envoye' });
  }
}

/* ---------- Saisie ---------- */
/** Vérifie si la grille est pleine et juste (sans conflit) : envoie alors la partie. */
function verifierFin() {
  if (S.fini || S.val.some((v) => !v) || conflits().some((x) => x)) return;
  S.fini = true;
  finir();
}

/**
 * Pose un chiffre (1-9) ou efface (0) dans la case active. Les chiffres donnés ne bougent pas.
 * En mode Notes, un chiffre bascule le candidat correspondant.
 * @param {number} v Chiffre, ou 0 pour effacer.
 */
function saisir(v) {
  if (S.fini && !S.entrainement) return;
  const i = S.actif;
  if (S.donnes[i]) return;
  S.fini = false; // toute modification rouvre la grille (rejeu sans score compris)
  if (S.modeNotes && v) {
    if (S.val[i]) return;
    S.notes[i] ^= 1 << v;
    maj();
    return;
  }
  if (v === 0) { S.val[i] = 0; S.notes[i] = 0; maj(); return; }
  const avant = zonesDe(i).map(zoneComplete);
  S.val[i] = v;
  S.notes[i] = 0;
  demarrer();
  maj();
  eclatZones(i, avant);
  verifierFin();
}

/** Sélectionne une case (et lui donne le focus). */
function activer(i) {
  S.actif = i;
  S.cases.forEach((b, k) => { b.tabIndex = k === i ? 0 : -1; });
  S.cases[i].focus();
  maj();
}

/* ---------- Affichage ---------- */
/** Libellé d'une case pour les lecteurs d'écran. */
function etiquette(i, bad) {
  const pos = `ligne ${Math.floor(i / 9) + 1}, colonne ${(i % 9) + 1}`;
  if (S.val[i]) return `${pos} : chiffre ${S.val[i]}${S.donnes[i] ? ', donné' : ''}${bad[i] ? ', en conflit' : ''}`;
  const n = [];
  for (let v = 1; v <= 9; v++) if (S.notes[i] & (1 << v)) n.push(v);
  return `${pos} : vide${n.length ? `, notes ${n.join(' ')}` : ''}`;
}

/** Rafraîchit la grille, le pavé et les boutons. */
function maj() {
  if (!S?.cases?.length) return;
  const bad = conflits();
  const a = S.actif, ar = Math.floor(a / 9), ac = a % 9, av = S.val[a];
  for (let i = 0; i < 81; i++) {
    const b = S.cases[i];
    const cls = ['sol-s'];
    const c = i % 9, r = Math.floor(i / 9);
    if (c % 3 === 2 && c < 8) cls.push('is-br');
    if (r % 3 === 2 && r < 8) cls.push('is-bb');
    if (S.donnes[i]) cls.push('is-donnee');
    if (bad[i]) cls.push('is-conflit');
    if (i === a) cls.push('is-active');
    else if (memeZone(i, a)) cls.push('is-meme-bloc');
    else if (av && S.val[i] === av) cls.push('is-meme-val');
    if (b.classList.contains('fxj-eclat')) cls.push('fxj-eclat'); // l'éclat en cours survit aux rafraîchissements
    const nom = cls.join(' ');
    if (b.className !== nom) b.className = nom;
    // Contenu : le chiffre posé, ou les notes (petits chiffres), ou rien. Reconstruit seulement si ça change.
    const sig = S.val[i] ? `v${S.val[i]}` : S.notes[i] ? `n${S.notes[i]}` : '';
    if (b.dataset.sig !== sig) {
      b.dataset.sig = sig;
      if (S.val[i]) b.textContent = String(S.val[i]);
      else if (S.notes[i]) b.innerHTML = '<span class="sol-s-notes" aria-hidden="true">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => `<span>${S.notes[i] & (1 << v) ? v : ''}</span>`).join('') + '</span>';
      else b.textContent = '';
    }
    b.setAttribute('aria-label', etiquette(i, bad));
  }
  const notesBtn = q('#su-notes');
  notesBtn.setAttribute('aria-pressed', String(S.modeNotes));
  notesBtn.textContent = `Notes : ${S.modeNotes ? 'activé' : 'désactivé'}`;
  q('#su-rejouer').hidden = !S.entrainement;
  const st = q('#su-statut');
  let texte = '', ton = '';
  if (S.entrainement && !S.t0) { texte = 'Grille du jour déjà terminée : tu peux la rejouer pour le plaisir, sans score.'; }
  else if (!S.t0) texte = 'Choisis une case, puis place un chiffre : le chrono part au premier chiffre.';
  else if (S.fini) texte = 'Grille complète : vérification en cours…';
  else texte = 'Partie en cours.';
  if (S.officiel) { texte = 'Grille du jour terminée.'; ton = 'is-ok'; }
  st.className = `sol-statut ${ton}`.trim();
  st.textContent = texte;
}

/** Pastille des Paillettes : « +10 ✦ par jour », et l'état « déjà reçues ». */
function majGain() {
  const el = q('#su-gain');
  if (!el) return;
  el.innerHTML = `<span>+${esc(nf(S.gain))} ${paillSym()} par jour</span>${S.recompense ? '<small>Déjà reçues aujourd’hui</small>' : ''}`;
}

/** Classement du jour (temps). */
function majBoard() {
  const el = q('#su-board');
  if (!el) return;
  el.innerHTML = classementHtml(S.board, {
    me: S.ctx.me?.id ?? null,
    droite: (r) => `<span class="sol-board-val">${esc(fmtTemps(r.secondes))}</span>`,
    vide: 'Personne n’a encore terminé la grille du jour.',
    label: 'Classement du jour',
  });
}

/**
 * Résultat : grille terminée (temps officiel), refusée, rejouée, déjà terminée ou non envoyée.
 * @param {{type: string, secondes?: number, reward?: number}} r
 */
function majFin({ type, secondes, reward = 0 }) {
  const box = q('#su-fin');
  if (!box) return;
  let titre, detail = '', ton = 'is-ko', detailHtml = null;
  if (type === 'gagne') {
    titre = `Grille du jour terminée en ${fmtTemps(secondes)}`; ton = 'is-ok';
    if (reward > 0) detailHtml = `Paillettes reçues : <span id="su-fin-gain">+${esc(nf(reward))} ${paillSym()}</span>`;
    else detail = S.recompense ? 'Paillettes déjà reçues aujourd’hui.' : 'Grille enregistrée.';
  } else if (type === 'incorrecte') { titre = 'Grille incorrecte'; detail = 'Corrige une case, puis valide à nouveau : une nouvelle partie chronométrée a démarré.'; }
  else if (type === 'deja') { titre = `Grille du jour terminée en ${fmtTemps(secondes)}`; ton = 'is-ok'; detail = 'Tu peux la rejouer pour le plaisir : sans score ni Paillettes.'; }
  else if (type === 'rejoue') { titre = 'Bravo, grille rejouée'; ton = 'is-ok'; detail = `Temps local : ${fmtTemps(secondes)}. Pas de score : la grille du jour est déjà terminée.`; }
  else { titre = 'Partie non enregistrée'; detail = 'Le serveur n’a pas ouvert la partie. Rafraîchis la page pour réessayer.'; }
  box.hidden = false;
  box.innerHTML = `<p class="sol-grand ${ton === 'is-ok' ? 'jg-sand' : ''}">${esc(titre)}</p><p class="small muted">${detailHtml ?? esc(detail)}</p>`;
  if (type === 'gagne') {
    // Partie gagnée sous les yeux du membre : le gain défile dans la ligne existante (pas de doublon)
    finDePartie(box, { points: reward > 0 ? pointsDeGain(reward) : pointsDeTemps(secondes), gain: reward > 0 ? reward : null, cibleGain: box.querySelector('#su-fin-gain') });
  } else if (type === 'deja') {
    finDePartie(box, { points: pointsDeTemps(secondes), animer: false });
  }
  if (type === 'incorrecte') q('#su-statut').className = 'sol-statut is-ko';
}

/* ---------- Événements ---------- */
/** Clics : cases, pavé, notes, rejouer. */
function onClic(e) {
  const b = e.target.closest?.('.sol-s');
  if (b && S.panel.contains(b)) { activer(Number(b.dataset.i)); return; }
  const p = e.target.closest?.('[data-chiffre],[data-act]');
  if (p && S.panel.contains(p)) {
    if (p.dataset.act === 'effacer') saisir(0);
    else saisir(Number(p.dataset.chiffre));
    return;
  }
  if (e.target.closest?.('#su-notes')) { S.modeNotes = !S.modeNotes; maj(); return; }
  if (e.target.closest?.('#su-rejouer')) { rejouer(); }
}

/** Rejoue la grille du jour déjà terminée, pour le plaisir (sans score). */
function rejouer() {
  arreterHorloge();
  for (let i = 0; i < 81; i++) { S.val[i] = S.donnes[i]; S.notes[i] = 0; }
  S.fini = false; S.t0 = 0; S.run = null;
  q('#su-chrono').textContent = '00:00';
  q('#su-fin').hidden = true;
  S.gen++;
  maj();
}

/** Clavier : flèches, chiffres 1-9, Retour arrière ou Suppr, N pour le mode Notes. */
function onClavier(e) {
  if (e.target.classList?.contains('sol-s')) {
    if (DEP[e.key]) {
      e.preventDefault();
      const [dl, dc] = DEP[e.key];
      const r = Math.min(8, Math.max(0, Math.floor(S.actif / 9) + dl));
      const c = Math.min(8, Math.max(0, (S.actif % 9) + dc));
      activer(r * 9 + c);
      return;
    }
  }
  if (/^[1-9]$/.test(e.key)) { e.preventDefault(); saisir(Number(e.key)); return; }
  if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); saisir(0); return; }
  if (e.key === 'n' || e.key === 'N') { e.preventDefault(); S.modeNotes = !S.modeNotes; maj(); }
}
