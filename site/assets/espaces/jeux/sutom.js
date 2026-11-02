// ===== Humane Gang — onglet « Sutom » (J8) de la page Jeux =====
// Un mot par jour (5 à 9 lettres) à trouver en 6 essais, première lettre donnée. Le mot n'est jamais envoyé au
// navigateur : chaque essai est vérifié par le serveur, qui renvoie seulement les couleurs.
// Bien placée : carré rouge ; mal placée : rond jaune ; absente : gris (formes en plus des couleurs, lecteur d'écran
// informé de chaque lettre). Clavier à l'écran (AZERTY) et clavier physique. Partage « Sutom du gang #42 4/6 ».
// Effets (réponse du serveur seulement, jamais à l'ouverture) : cases retournées une à une (230 ms, couleur à mi-retournement,
// sons G1/G2/G3), clavier mis à jour après, puis carte de fin (tampon, gain) ; mot refusé = ligne secouée + G4.
// RPC : hg_sutom_state(), hg_sutom_guess(p_word) (migration 084). Mot du jour pour l'admin : bouton « Réponses » (migration 134).
// Exporte : mount(panel, ctx).
import { errMsg } from '../../commun/core.js';
import { boutonReponses } from '../../commun/core/admin-reponses.js';
import { motionAllowed } from '../../commun/core.js';
import { paillSym } from '../../commun/paillettes.js';
import { sonJour, secouer, rejoue, enCascade, finDePartie, pointsDeGain } from './effets-jour.js';
import { serieHtml, jokerHtml } from './serie-jeux.js'; // série commune et joker payant (migrations 206 et 207)
// Grilles passées pour l'honneur (idée 13, migration 213) : #sutom-AAAA-MM-JJ, sans Paillettes, classement ni série.
import { jourVoulu, sousTitreHonneur, retourHtml, modeHonneur, monterArchives, suivreJour } from './archives-jeux.js';

const RANGEES = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];
const ETAT = { 2: 'bien placée', 1: 'mal placée', 0: 'absente' };

/** Charge la feuille de style une seule fois. */
function styles() {
  if (document.querySelector('link[data-jeux-css="sutom"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('./jeux-sutom.css', import.meta.url).href; l.dataset.jeuxCss = 'sutom';
  document.head.append(l);
}

/**
 * Monte l'onglet.
 * @param {HTMLElement} panel Panneau vide.
 * @param {{sb: object, toast: Function, esc: Function}} ctx Contexte de la page Jeux.
 */
export async function mount(panel, ctx) {
  const { sb, toast, esc } = ctx;
  styles();
  // jour : grille passée jouée pour l'honneur (null = grille du jour).
  const S = { d: null, saisie: '', busy: false, msg: '', jour: jourVoulu(ctx.sub) };
  const root = document.createElement('div');
  root.className = 'su';
  const archives = document.createElement('div');
  panel.append(root, archives);
  const liste = monterArchives(archives, { sb, esc, jeu: 'sutom', lien: (d) => `#sutom-${d}`, code: 'Sutom du gang',
    titre: 'Grilles passées', unite: 'mot du jour', essais: 6, actuel: S.jour });

  /** États connus de chaque lettre (meilleur état vu) pour colorer le clavier. */
  function lettres() {
    const m = {};
    for (const g of S.d.guesses) [...g.word].forEach((c, i) => { m[c] = Math.max(m[c] ?? -1, Number(g.colors[i])); });
    return m;
  }

  /** Une case de la grille. */
  function cellule(c, col) {
    if (col == null) return `<span class="su-cell${c ? ' is-typed' : ''}" role="gridcell">${esc(c || '')}</span>`;
    return `<span class="su-cell is-${col}" role="gridcell" aria-label="${esc(c)} ${ETAT[col]}"><span class="su-l">${esc(c)}</span></span>`;
  }

  /** Grille : essais joués, ligne en cours, lignes vides. */
  function grille() {
    const d = S.d, n = d.length, rows = [];
    for (const g of d.guesses) rows.push([...g.word].map((c, i) => cellule(c, g.colors[i])).join(''));
    if (!d.finished && rows.length < d.max) {
      const s = S.saisie || d.first;
      rows.push(Array.from({ length: n }, (_, i) => cellule(s[i] || (i === 0 ? d.first : ''), null)).join(''));
    }
    while (rows.length < d.max) rows.push(Array.from({ length: n }, () => cellule('', null)).join(''));
    return `<div class="su-grid" role="grid" aria-label="Grille Sutom, ${n} lettres" style="--n:${n}">${rows.map((r, i) => `<div class="su-row" role="row" aria-rowindex="${i + 1}">${r}</div>`).join('')}</div>`;
  }

  /** Clavier à l'écran. */
  function clavier() {
    const m = lettres();
    const t = (c) => `<button type="button" class="su-key${m[c] != null ? ` is-${m[c]}` : ''}" data-key="${c}" aria-label="${c}${m[c] != null ? ` (${ETAT[m[c]]})` : ''}">${c}</button>`;
    return `<div class="su-kbd" aria-label="Clavier">
      <div class="su-krow">${[...RANGEES[0]].map(t).join('')}</div>
      <div class="su-krow">${[...RANGEES[1]].map(t).join('')}</div>
      <div class="su-krow"><button type="button" class="su-key su-wide" data-key="Backspace">Effacer</button>${[...RANGEES[2]].map(t).join('')}<button type="button" class="su-key su-wide su-enter" data-key="Enter">Entrée</button></div>
    </div>`;
  }

  /** Texte à partager (sans le mot). */
  function partage() {
    const d = S.d;
    const lignes = d.guesses.map((g) => [...g.colors].map((c) => ({ 2: '🟥', 1: '🟡', 0: '🟦' }[c])).join(''));
    return `Sutom du gang #${d.num} ${d.solved ? d.guesses.length : 'X'}/${d.max}\n\n${lignes.join('\n')}`;
  }

  /** Dessine l'onglet. */
  function dessine() {
    const d = S.d;
    const honneur = !!S.jour;
    modeHonneur(panel, honneur, 'Grilles passées');
    if (!d.available) { root.innerHTML = '<div class="card"><h2 class="su-h">Sutom du gang</h2><p class="muted">Pas de grille aujourd’hui : le Staff n’a pas encore ajouté de mots. Reviens demain !</p></div>'; return; }
    const essai = d.finished ? (d.solved ? `trouvé en ${d.guesses.length}` : 'perdu') : `${d.guesses.length + 1}e essai en cours`;
    const fin = d.finished ? `<section class="card su-end ${d.solved ? 'is-ok' : 'is-ko'}" aria-labelledby="su-end-h">
        <h3 id="su-end-h" class="su-h3">${d.solved ? 'Bravo !' : 'Perdu pour aujourd’hui'}</h3>
        <p><span class="su-word">${esc(d.word || '')}</span>${d.definition ? ` : ${esc(d.definition)}` : ''}</p>
        ${d.gain ? `<p class="small su-gain">+${esc(String(d.gain))} ${paillSym()}</p>` : ''}
        <div class="btn-row"><button type="button" class="btn btn-sand" data-share>Partager</button></div>
        <p class="small muted">${honneur ? (d.du_jour ? 'Ta partie du jour même.' : 'Grille passée, jouée pour l’honneur : sans Paillettes ni classement.') : 'Nouvelle grille demain à minuit.'}</p></section>` : '';
    const sous = honneur ? sousTitreHonneur(`Grille n°${d.num}`, S.jour) : `Grille n°${d.num} · ${d.length} lettres · ${essai}`;
    root.innerHTML = `<div class="su-head"><div><h2 class="su-h">Sutom du gang</h2>
        <p class="small muted">${esc(sous)}</p></div>
        ${honneur ? retourHtml('#sutom') : serieHtml('sutom')}</div>
      ${honneur ? '' : jokerHtml('sutom')}
      ${grille()}
      <div class="su-legend small muted" aria-hidden="true"><span><span class="su-sq"></span>bien placée</span><span><span class="su-ci"></span>mal placée</span></div>
      <p class="su-msg small" role="status" aria-live="polite">${esc(S.msg)}</p>
      ${fin}
      ${d.finished ? '' : clavier()}`;
    if (!honneur) boutonReponses(root.querySelector('.su-head > div'), 'sutom');
    // Partie déjà finie (ouverture, rechargement, message) : carte de fin sans effet. L'essai gagnant la gère lui-même (revele).
    if (d.finished && !S.busy) habilleFin(false);
  }

  /** Mot refusé par le serveur : la ligne en cours est secouée, son G4. */
  function refuse() {
    secouer(root.querySelectorAll('.su-row')[S.d.guesses.length]);
    sonJour('G4');
  }

  /** Habille la carte de fin (tampon, gain, son) ; animer: false pour une partie déjà finie. */
  function habilleFin(animer) {
    const carte = root.querySelector('.su-end');
    const d = S.d;
    if (!carte || S.jour) return; // grille passée : ni points, ni Paillettes, ni série
    const gain = Number(d.gain) || 0;
    finDePartie(carte, { points: d.points ?? pointsDeGain(gain), gain: gain || null, animer, cibleGain: gain ? carte.querySelector('.su-gain') : null });
  }

  /**
   * Révèle l'essai qui vient d'être joué : les cases se retournent une à une (230 ms d'écart), la couleur apparaît à
   * mi-retournement avec son son (G1 bien placée, G2 mal placée, G3 absente), puis le clavier se met à jour, puis la carte
   * de fin s'il y en a une. Sans mouvement : tout est coloré d'un coup. Attend la fin de l'animation (la saisie reste bloquée).
   * @param {object} data réponse du serveur
   * @param {object} avant états des lettres avant cet essai (pour le clavier)
   */
  async function revele(data, avant) {
    const d = S.d, bouge = motionAllowed();
    const carte = root.querySelector('.su-end');
    const ligne = root.querySelectorAll('.su-row')[d.guesses.length - 1];
    const cases = [...(ligne?.querySelectorAll('.su-cell') || [])].map((el) => ({ el, classe: [...el.classList].find((c) => /^is-[012]$/.test(c)) }));
    const touches = new Map();
    const apres = lettres();
    root.querySelectorAll('.su-key[data-key]').forEach((b) => {
      const k = b.dataset.key, f = apres[k];
      if (!/^[A-Z]$/.test(k) || f === avant[k]) return;
      touches.set(k, b.className);
      if (bouge) { b.classList.remove(`is-${f}`); if (avant[k] != null) b.classList.add(`is-${avant[k]}`); }
    });
    if (bouge) {
      cases.forEach(({ el, classe }) => { if (classe) el.classList.remove(classe); });
      if (carte) carte.style.display = 'none';
    }
    const SON = { 2: 'G1', 1: 'G2', 0: 'G3' };
    const finCase = ({ el, classe }, i) => {
      if (classe) el.classList.add(classe);
      const b = root.querySelector(`.su-key[data-key="${data.word[i]}"]`);
      if (b && touches.has(b.dataset.key)) b.className = touches.get(b.dataset.key);
    };
    const ms = enCascade(cases, (c, i) => {
      if (!bouge) { finCase(c, i); return; }
      rejoue(c.el, 'fxj-flip');
      setTimeout(() => finCase(c, i), 180);
      sonJour(SON[data.colors[i]]);
    }, 230);
    if (!bouge) [...new Set([...data.colors].map(Number))].forEach((c) => sonJour(SON[c]));
    if (carte) {
      if (bouge) await new Promise((r) => setTimeout(r, ms + 380));
      carte.style.display = '';
      habilleFin(true);
    } else if (bouge) await new Promise((r) => setTimeout(r, ms + 380));
  }

  /** Ajoute ou retire une lettre, ou envoie l'essai. */
  async function touche(k) {
    const d = S.d;
    if (!d?.available || d.finished || S.busy) return;
    if (!S.saisie) S.saisie = d.first;
    if (k === 'Backspace') { if (S.saisie.length > 1) S.saisie = S.saisie.slice(0, -1); S.msg = ''; dessine(); return; }
    if (k === 'Enter') {
      if (S.saisie.length < d.length) { S.msg = `Il faut ${d.length} lettres.`; dessine(); return; }
      S.busy = true;
      const jour = S.jour;
      try {
        const { data, error } = jour
          ? await sb.rpc('hg_jeux_honneur_essai', { p_jeu: 'sutom', p_day: jour, p: { mot: S.saisie } })
          : await sb.rpc('hg_sutom_guess', { p_word: S.saisie });
        if (error) throw error;
        if (S.jour !== jour) return; // l'adresse a changé pendant l'envoi
        if (!data?.valid) { S.msg = data?.message || 'Mot refusé.'; dessine(); refuse(); return; }
        const avant = lettres();
        d.guesses.push({ word: data.word, colors: data.colors });
        S.saisie = '';
        S.msg = [...data.word].map((c, i) => `${c} ${ETAT[data.colors[i]]}`).join(', ');
        if (data.finished) Object.assign(d, { finished: true, solved: data.solved, word: data.answer, definition: data.definition, gain: data.gain, streak: data.streak ?? d.streak, points: data.points });
        dessine();
        await revele(data, avant);
        if (jour && data.finished) liste.rafraichir();
      } catch (e) {
        console.warn('[sutom]', e);
        S.msg = errMsg(e); dessine();
      } finally {
        S.busy = false;
      }
      return;
    }
    if (/^[A-Z]$/.test(k) && S.saisie.length < d.length) { S.saisie += k; S.msg = ''; dessine(); }
  }

  root.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-key]');
    if (k) { touche(k.dataset.key); return; }
    if (e.target.closest('[data-share]')) {
      try { await navigator.clipboard.writeText(partage()); toast?.('Résultat copié : colle-le sur Discord !', 'ok'); }
      catch { toast?.('Copie impossible sur cet appareil.', 'error'); }
    }
  });
  // Clavier physique : seulement quand l'onglet est visible et que le focus n'est pas dans un champ.
  document.addEventListener('keydown', (e) => {
    if (!root.isConnected || root.closest('[hidden]') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key === 'Enter' && e.target.closest?.('button')) return; // Entrée sur un bouton : son clic suffit
    const k = e.key === 'Backspace' || e.key === 'Enter' ? e.key : e.key.length === 1 ? e.key.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase() : '';
    if (!k || !(k === 'Backspace' || k === 'Enter' || /^[A-Z]$/.test(k))) return;
    e.preventDefault();
    touche(k);
  });

  /** Charge la grille du jour, ou la grille passée S.jour (pour l'honneur). */
  async function charger() {
    const jour = S.jour;
    root.innerHTML = '<p class="muted">Chargement de la grille…</p>';
    try {
      const { data, error } = jour
        ? await sb.rpc('hg_jeux_honneur_etat', { p_jeu: 'sutom', p_day: jour })
        : await sb.rpc('hg_sutom_state');
      if (error) throw error;
      if (S.jour !== jour) return;
      S.d = data || { available: false };
      S.d.guesses ||= [];
      dessine();
    } catch (e) {
      console.warn('[sutom]', e);
      root.innerHTML = `<p class="card muted">Sutom indisponible pour le moment (${esc(errMsg(e))}).</p>`;
    }
  }
  // Grille passée ouverte depuis la liste (#sutom-AAAA-MM-JJ) ou retour à la grille du jour (#sutom).
  suivreJour(panel, ctx, () => S.jour, (j) => {
    Object.assign(S, { jour: j, saisie: '', msg: '', busy: false });
    charger();
    liste.rafraichir(j);
    if (j) root.scrollIntoView?.({ block: 'start' });
  });
  await charger();
}
