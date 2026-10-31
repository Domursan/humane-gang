// ===== Humane Gang — page « Jeux » : moteur commun des grilles du jour (Connexions, Mots croisés, Mot mêlé, Anagramme, Nerdle) =====
/*
 * Rôle : briques communes des trois grilles du jour, une seule partie par personne et par jour, la même grille pour tous.
 * Le moteur charge l'état (hg_nj_grille_etat), envoie les essais (hg_nj_grille_essai) et dessine la mise en page :
 * en-tête « GRILLE DU JOUR · N°<numéro> », pastilles (gain, chrono), jeu à gauche ; règles en bref et classement de la
 * semaine à droite ; fin de partie avec Paillettes, temps, classement du jour et « Copier le résultat ». Le bouton
 * « Réponses » (administrateurs) est posé dans l'en-tête. Les réponses s'affichent dans la page ; seules les erreurs du serveur
 * (messages en français) font un toast. Chaque jeu fournit sa configuration (voir cfg dans monterGrille) : corps du jeu, interactions, texte
 * de partage. Le chrono ne sert qu'au classement du jour : il n'empêche jamais de jouer.
 * Fin de partie : le moment de fin (tampon de points, son, Paillettes qui défilent, confettis à 10) vient de effets-jour.js et ne se
 * joue que si la partie se termine sous les yeux du membre ; à l'ouverture d'une partie déjà finie, la carte s'affiche sans effet.
 * Effets propres à un jeu (facultatifs, dans cfg) : avantRendu({ res, avant, apres, panel, env }) → Promise (animation sur
 * l'ancien dessin, avant le redessin) ; apresRendu({ res, avant, apres, panel, env }) → durée en ms de l'animation jouée après
 * le redessin (la carte de fin attend la fin de cette durée) ; refus({ err, p, panel, env }) après un essai refusé par le serveur.
 * env.retarderFin(ms) rallonge ce délai depuis n'importe où (ex. dans cfg.reponse ou apresEssai).
 * Dépendances : jeux/devine.js (loadCss, boardHtml, copyText), core/admin-reponses.js, effets-jour.js. Styles : jeux-grilles.css.
 * Exporte : monterGrille, lireEtat, resumerGrille, formatDuree, classementJourHtml.
 */
import { paillSym } from '../../commun/paillettes.js';
import { loadCss, boardHtml, copyText } from './devine.js';
import { boutonReponses } from '../../commun/core/admin-reponses.js';
import { finDePartie, pointsDeGain } from './effets-jour.js';

/**
 * Durée affichée : « 1:05 », ou « 1:02:05 » au-delà d'une heure.
 * @param {number} s Secondes.
 * @returns {string}
 */
export function formatDuree(s) {
  const t = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/**
 * Lit l'état de la grille du jour (RPC hg_nj_grille_etat). Lève une erreur si le serveur refuse.
 * @param {{sb: object}} ctx Contexte des modules d'onglet.
 * @param {string} jeu connexions, motmele ou nerdle.
 * @returns {Promise<object>} L'état : grille (null sans grille du jour), partie, board, solution en fin de partie.
 */
export async function lireEtat(ctx, jeu) {
  const { data, error } = await ctx.sb.rpc('hg_nj_grille_etat', { p_jeu: jeu });
  if (error) throw error;
  return data || {};
}

/**
 * Élément voisin dans la direction d'une flèche, parmi des boutons en grille (tuiles, touches du clavier à l'écran) :
 * le plus proche dans cette direction, l'écart latéral comptant double. Les éléments désactivés sont ignorés.
 * @param {HTMLElement} el Élément actif.
 * @param {string} touche « ArrowLeft », « ArrowRight », « ArrowUp » ou « ArrowDown ».
 * @param {HTMLElement[]} candidats Éléments parmi lesquels chercher (el est ignoré).
 * @returns {HTMLElement|null} Le voisin, ou null s'il n'y en a pas dans cette direction.
 */
export function voisinFleche(el, touche, candidats) {
  const sens = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[touche];
  if (!sens || !el) return null;
  const centre = (x) => { const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const o = centre(el);
  let meilleur = null, score = Infinity;
  for (const x of candidats) {
    if (x === el || x.disabled) continue;
    const c = centre(x);
    const dx = c.x - o.x, dy = c.y - o.y;
    const devant = dx * sens[0] + dy * sens[1];
    if (devant <= 1) continue;
    const cote = Math.abs(dx * sens[1]) + Math.abs(dy * sens[0]);
    const s = devant + 2 * cote;
    if (s < score) { score = s; meilleur = x; }
  }
  return meilleur;
}

/**
 * Classement du jour (temps des parties gagnées), affiché en fin de partie.
 * @param {Array} rows Lignes { user_id, pseudo, secondes, score }.
 * @param {string} meId Identifiant du membre connecté.
 * @param {Function} esc Échappement HTML.
 * @returns {string} HTML.
 */
export function classementJourHtml(rows, meId, esc) {
  if (!rows?.length) return '<p class="muted small">Personne n’a encore gagné aujourd’hui.</p>';
  return `<ol class="jd-board">${rows.map((r, i) => `<li class="jd-board-row${r.user_id === meId ? ' is-me' : ''}">
    <span class="jd-rank">${i + 1}</span><span class="jd-name">${esc(r.pseudo)}</span>
    <span class="jd-pts">${esc(formatDuree(r.secondes))}</span><span class="muted small">${esc(r.score)} pt${r.score > 1 ? 's' : ''}</span></li>`).join('')}</ol>`;
}

/**
 * Carte d'accueil « Les missions du jour » d'une grille : état, texte, pastille, Paillettes gagnées.
 * @param {{sb: object}} ctx Contexte des modules d'onglet.
 * @param {string} jeu Identifiant du jeu.
 * @param {{fini: Function, enCours: Function, aFaire: string, badgeMax?: string}} textes Textes selon l'état de la partie.
 * @returns {Promise<{etat: string, texte: string, badge: string, gain?: number}>}
 */
export async function resumerGrille(ctx, jeu, textes) {
  try {
    const st = await lireEtat(ctx, jeu);
    if (!st.grille) return { etat: 'info', texte: 'Pas de grille aujourd’hui', badge: '' };
    const p = st.partie;
    if (p?.fini) return { etat: 'fait', texte: textes.fini(p), badge: `${p.points ?? p.score} pt${(p.points ?? p.score) > 1 ? 's' : ''}`, gain: Number(p.reward) || 0 };
    if (p) return { etat: 'en_cours', texte: textes.enCours(p), badge: '' };
    return { etat: 'a_jouer', texte: textes.aFaire, badge: textes.badgeMax || '' };
  } catch {
    return { etat: 'info', texte: 'Indisponible pour le moment', badge: '' };
  }
}

/**
 * Pastilles de l'en-tête : valeurs propres au jeu, gain avant la fin, chrono dès le premier essai.
 * @param {object} st État de la grille.
 * @param {object} cfg Configuration du jeu.
 * @param {Function} esc Échappement HTML.
 * @returns {string} HTML.
 */
function pastillesHtml(st, cfg, esc) {
  if (!st.grille) return '';
  const fini = !!st.partie?.fini;
  const liste = [...(cfg.pills?.(st) || [])];
  if (!fini) liste.push(['Jusqu’à', `${Number(st.gain) || 0} ${paillSym()}`]);
  if (st.partie?.debut) liste.push(['Chrono', { html: `<span data-chrono>${fini ? esc(formatDuree(st.partie.secondes)) : '0:00'}</span>` }]);
  return liste.map(([l, v]) => `<span class="pill ng-pill">${esc(l)} <strong>${typeof v === 'object' ? v.html : esc(v)}</strong></span>`).join('');
}

/**
 * Monte une grille du jour dans son onglet.
 * cfg (une configuration par jeu) :
 *   jeu, titre, regles (liste de phrases), chrono (vrai : mention du chrono dans les règles) ;
 *   corps(st, ui, esc) → HTML du jeu (fonctionne aussi en fin de partie) ; lier(racine, st, ui, env) → écouteurs ;
 *   pills(st) → [libellé, valeur] ; apresEssai(ui, res, st) → remise à zéro après un essai accepté par le serveur ;
 *   reponse(res, st) → { texte } | null (message affiché dans la page après un essai) ; finTexte(st) → titre de fin ;
 *   copie(st) → texte de partage ou null ; init(panneau, env) → une fois, au montage (clavier physique, etc.).
 * env : { ctx, ui, etat(), visible(), envoyer(p, selecteurFocus), dire(texte), rerendre(selecteurFocus) }.
 * @param {HTMLElement} panel Panneau de l'onglet.
 * @param {{sb: object, me: object, toast: Function, esc: Function}} ctx Contexte des modules d'onglet.
 * @param {object} cfg Configuration du jeu.
 */
export async function monterGrille(panel, ctx, cfg) {
  loadCss('jeux-devine');
  loadCss('jeux-grilles');
  const esc = ctx.esc;
  const e = { st: null, err: null, busy: false, msg: '', ui: {}, fin: null, retard: 0 };
  let minuteur = null;
  const env = {
    ctx,
    ui: e.ui,
    etat: () => e.st,
    visible: () => panel.isConnected && panel.getClientRects().length > 0,
    envoyer,
    dire: (t) => { const l = panel.querySelector('.ng-live'); if (l) l.textContent = t; },
    rerendre: (sel = null) => dessiner(sel),
    panel,
    retarderFin: (ms) => { e.retard = Math.max(e.retard, Number(ms) || 0); },
  };

  panel.innerHTML = '<p class="muted">Chargement de la grille…</p>';
  panel.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act="copier"]') && e.st && cfg.copie) copier();
  });
  cfg.init?.(panel, env);
  await charger();

  /** Lit l'état du jour puis dessine. */
  async function charger() {
    try {
      e.st = await lireEtat(ctx, cfg.jeu);
      e.err = null;
    } catch (err) { e.err = err?.message || String(err); }
    dessiner();
  }

  /**
   * Envoie un essai au serveur, puis redessine avec l'état renvoyé. Une erreur du serveur s'affiche en toast.
   * @returns {Promise<object|null>} Le résultat de l'essai, ou null en cas d'erreur.
   */
  async function envoyer(p, focusSel = null) {
    if (e.busy || !e.st?.grille || e.st.partie?.fini) return null;
    e.busy = true;
    e.retard = 0;
    const avant = JSON.parse(JSON.stringify(e.st)); // copie : l'état d'avant l'essai, pour comparer avec la réponse
    let res = null, refus = null;
    try {
      const { data, error } = await ctx.sb.rpc('hg_nj_grille_essai', { p_jeu: cfg.jeu, p });
      if (error) throw error;
      res = data?.resultat || {};
      const apres = data.etat;
      // Animation sur l'ancien dessin (tuiles qui sautent, etc.) avant de montrer le nouvel état.
      try { await cfg.avantRendu?.({ res, avant, apres, panel, env }); } catch (x) { console.warn('[grilles] animation', x); }
      e.st = apres;
      cfg.apresEssai?.(e.ui, res, e.st);
      // Le message de la réponse reste dans la page (zone « live ») : pas de toast, qui recouvrirait la grille sur téléphone.
      e.msg = cfg.reponse?.(res, e.st)?.texte || '';
      // La partie vient de se terminer sous les yeux du membre : la carte de fin attend l'animation, puis joue son moment.
      e.fin = !avant.partie?.fini && e.st.partie?.fini ? { attente: true } : null;
    } catch (err) {
      res = null;
      refus = err;
      ctx.toast(err?.message || String(err), 'error');
    }
    e.busy = false;
    dessiner(focusSel);
    if (refus) { try { cfg.refus?.({ err: refus, p, panel, env }); } catch (x) { console.warn('[grilles] refus', x); } return res; }
    let ms = 0;
    try { ms = Number(cfg.apresRendu?.({ res, avant, apres: e.st, panel, env })) || 0; } catch (x) { console.warn('[grilles] animation', x); }
    if (e.fin) setTimeout(libererFin, Math.max(ms, e.retard));
    return res;
  }

  /** Montre la carte de fin et joue son moment (tampon, son, Paillettes). */
  function libererFin() {
    if (!e.fin) return;
    e.fin = null;
    const carte = panel.querySelector('.ng-fin');
    if (!carte) return;
    carte.style.display = '';
    habillerFin(carte, true);
  }

  /** Branche finDePartie sur la carte de fin dessinée : points, gain (dans la ligne « crédités »), effets si animer. */
  function habillerFin(carte, animer) {
    const p = e.st?.partie;
    if (!p) return;
    const gain = Number(p.reward) || 0;
    finDePartie(carte, { points: p.points ?? p.score ?? pointsDeGain(gain), gain: gain || null, animer, cibleGain: gain ? carte.querySelector('[data-gain]') : null });
  }

  /** Texte de partage dans le presse-papiers. */
  function copier() {
    const txt = cfg.copie(e.st);
    if (!txt) return;
    copyText(txt).then((ok) => ctx.toast(ok ? 'Résultat copié, colle-le sur Discord.' : 'Copie impossible sur cet appareil.', ok ? 'ok' : 'error'));
  }

  /** Bloc de fin de partie : titre, temps et score, Paillettes, copie, classement du jour. */
  function finHtml(st) {
    const p = st.partie;
    const gagne = !!p.gagne;
    const texte = cfg.finTexte ? cfg.finTexte(st) : (gagne ? 'Bien joué !' : 'Pas cette fois.');
    const stats = [gagne && p.secondes != null ? `Temps ${formatDuree(p.secondes)}` : null, `Score ${p.points ?? p.score} pt${(p.points ?? p.score) > 1 ? 's' : ''}`].filter(Boolean).join(' · ');
    return `<section class="ng-fin${gagne ? ' is-win' : ''}" aria-label="Fin de partie">
      <p class="ng-fin-t">${esc(texte)}</p>
      <p class="ng-fin-s">${esc(stats)}</p>
      <p class="ng-reward">${p.reward ? `<span data-gain>+${esc(p.reward)} ${paillSym()}</span> crédités` : 'Aucune Paillette cette fois'}</p>
      ${cfg.copie ? '<div class="ng-actions"><button type="button" class="btn btn-sand" data-act="copier">Copier le résultat</button></div>' : ''}
      <h3 class="ng-label">Classement du jour</h3>${classementJourHtml(st.board?.jour || [], ctx.me?.id, esc)}
    </section>`;
  }

  /** Dessine tout l'onglet d'après e.st ; focusSel : élément à reprendre au clavier après le rendu. */
  function dessiner(focusSel = null) {
    if (minuteur) { clearInterval(minuteur); minuteur = null; }
    if (e.err) { panel.innerHTML = `<p class="card ng-erreur" role="alert">Jeu indisponible : ${esc(e.err)}</p>`; return; }
    const st = e.st;
    if (!st) return;
    const jour = !!st.grille;
    const fini = !!st.partie?.fini;
    const head = `<div class="ng-head"><div class="ng-head-t"><p class="ng-kicker">GRILLE DU JOUR${st.numero ? ` · N°${esc(st.numero)}` : ''}</p>
      <h2 class="ng-title">${esc(cfg.titre)}</h2></div><div class="ng-pills">${pastillesHtml(st, cfg, esc)}</div></div>`;
    const main = jour
      ? `<section class="card ng-jeu" aria-label="${esc(cfg.titre)}">${cfg.corps(st, e.ui, esc)}${fini ? finHtml(st) : ''}<p class="ng-live" role="status" aria-live="polite">${esc(e.msg)}</p></section>`
      : '<div class="card ng-vide"><p>Pas de grille aujourd’hui, reviens demain.</p></div>';
    const regles = `<section class="card ng-regles" aria-labelledby="ng-regles-h"><h2 id="ng-regles-h" class="jd-h2">Règles en bref</h2>
      <ul class="ng-rules">${cfg.regles.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>`;
    const semaine = `<section class="card ng-board" aria-labelledby="ng-board-h"><h2 id="ng-board-h" class="jd-h2">Classement de la semaine</h2>${boardHtml(st.board?.semaine || [], ctx.me?.id, esc)}</section>`;
    panel.innerHTML = `<div class="ng ng-${cfg.jeu}">${head}<div class="ng-main">${main}</div><aside class="ng-aside">${regles}${semaine}</aside></div>`;
    boutonReponses(panel.querySelector('.ng-head'), 'njg', () => cfg.jeu);
    if (jour) cfg.lier?.(panel.querySelector('.ng-jeu'), st, e.ui, env);
    if (fini) {
      const carte = panel.querySelector('.ng-fin');
      if (carte && e.fin) carte.style.display = 'none'; // en attente de l'animation du jeu
      else if (carte) habillerFin(carte, false);
    }
    demarrerChrono(st);
    if (focusSel) panel.querySelector(focusSel)?.focus({ preventScroll: true });
  }

  /** Chrono de la partie (affichage seulement) : figé à la fin, arrêté quand l'onglet disparaît. */
  function demarrerChrono(st) {
    const el = panel.querySelector('[data-chrono]');
    const p = st.partie;
    if (!el || !p?.debut) return;
    if (p.fini) { el.textContent = formatDuree(p.secondes); return; }
    const t0 = Date.parse(String(p.debut).replace(/(\.\d{3})\d+/, '$1'));
    if (Number.isNaN(t0)) return;
    const tick = () => {
      if (!panel.isConnected) { clearInterval(minuteur); minuteur = null; return; }
      el.textContent = formatDuree((Date.now() - t0) / 1000);
    };
    tick();
    minuteur = setInterval(tick, 1000);
  }
}
