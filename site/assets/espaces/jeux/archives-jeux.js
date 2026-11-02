// ===== Humane Gang — manches passées des jeux du jour, jouables « pour l'honneur » (idée 13, migration 213) =====
// Les 30 dernières manches d'un jeu, sous le jeu : liste (Sutom, Code du jour, jeux à deviner en mots, grilles, Sudoku)
// ou grille d'images (Framed, Pochette, Plat, Jeu vidéo, Carte mystère), reprises de l'historique Heardle et de l'archive
// GeoGuessr. La réponse d'une manche n'apparaît que si le membre l'a jouée (le serveur ne l'envoie pas sinon).
// Une manche passée s'ouvre par l'adresse de l'onglet suivie du jour (#sutom-2026-10-31, #jour/2026-10-31 sur Duels) :
// le jeu se joue alors « pour l'honneur » (hg_jeux_honneur_etat / hg_jeux_honneur_essai) : pas de Paillettes, pas de
// classement, pas de série.
// RPC : hg_jeux_archive(p_jeu). Exporte : jourVoulu, dateCourte, dateLongue, sousTitreHonneur, retourHtml, modeHonneur,
// monterArchives, suivreJour, stylesArchives.

/** Le choix tiré de l'adresse est-il un jour « AAAA-MM-JJ » ? Renvoie ce jour, sinon null. */
export function jourVoulu(sub) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(sub || '')) ? String(sub) : null;
}

const enDate = (day) => new Date(`${day}T12:00:00`);
/** « dim. 1 nov. » */
export function dateCourte(day) {
  return enDate(day).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
}
/** « samedi 31 octobre » */
export function dateLongue(day) {
  return enDate(day).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
}
/** Sous-titre d'une manche passée : « Grille n°40 · samedi 31 octobre · pour l’honneur, sans Paillettes ». */
export function sousTitreHonneur(debut, day) {
  return `${debut} · ${dateLongue(day)} · pour l’honneur, sans Paillettes`;
}
/** Lien de retour vers la manche du jour, à la place de la pastille de série. */
export function retourHtml(href, texte = 'Grille du jour') {
  return `<a class="btn btn-ghost ar-retour" href="${href}">${texte}</a>`;
}

/** Feuilles de style (une seule fois) : historique Heardle pour la liste, archive GeoGuessr pour la grille, ajouts communs. */
export function stylesArchives(geo = false) {
  const lien = (cle, fichier) => {
    if (document.querySelector(`link[data-jeux-css="${cle}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL(fichier, import.meta.url).href; l.dataset.jeuxCss = cle;
    document.head.append(l);
  };
  lien('heardle-historique', './heardle-historique.css');
  if (geo) lien('jeux-geo', './jeux-geo.css');
  lien('archives-jeux', './archives-jeux.css');
}

/**
 * Mode « pour l'honneur » d'un jeu classé : cache le classement du jour (frère .jeux-classement de la zone) et montre
 * une note à sa place ; le retire au retour à la manche du jour.
 * @param {HTMLElement} zone zone du jeu
 * @param {boolean} on
 * @param {string} [liste] nom de la liste (« Grilles passées », « Manches passées »)
 */
export function modeHonneur(zone, on, liste = 'Manches passées') {
  const cl = zone?.parentElement?.querySelector(':scope > .jeux-classement');
  if (cl && cl !== zone) cl.hidden = on;
  let note = zone?.querySelector(':scope > .ar-note');
  if (on && !note && zone) {
    note = document.createElement('p');
    note.className = 'card muted small ar-note';
    zone.append(note);
  }
  if (note) {
    note.hidden = !on;
    note.textContent = `${liste === 'Grilles passées' ? 'Grille passée' : 'Manche passée'} : pas de classement ni de Paillettes. Ta partie reste visible dans « ${liste} ».`;
  }
}

/** Carrés des essais (mini) : raté = rouge, trouvé = vert au dernier essai, gris = pas utilisé (6 essais ; au-delà, les seuls utilisés). */
function carresHtml(m, max) {
  const n = m.reussi ? Math.min(Number(m.palier) || 1, max) : max;
  const total = max > 6 ? n : max;
  return `<span class="jhh-carres" aria-hidden="true">${Array.from({ length: total }, (_, i) => `<span class="jhh-c jhh-mini ${i >= n ? 'is-vide' : m.reussi && i === n - 1 ? 'is-ok' : 'is-x'}"></span>`).join('')}</span>`;
}
/** Points sur 10 d'une partie finie (même barème que hg_jeux_score). */
const points = (m) => (m.reussi ? Math.max(1, 11 - (Number(m.palier) || 1)) : 0);

/**
 * Monte la liste (ou la grille d'images) des manches passées d'un jeu dans hote. Rien n'est montré si le serveur ne
 * renvoie rien (jeu fermé, RPC absente).
 * @param {HTMLElement} hote conteneur (vidé à chaque dessin)
 * @param {{sb: object, esc: Function, jeu: string, lien: (day: string) => string, code: string, titre?: string,
 *   unite?: string, forme?: 'liste'|'grille', essais?: number|null, actuel?: string|null, texteTitre?: (t: string) => string}} o
 *   jeu : clé (sutom, nj_pays…) ; lien : adresse d'une manche passée ; code : nom du jeu (petit titre) ;
 *   unite : ce que montre la réponse (« mot du jour ») ; essais : nombre d'essais (carrés), null = pas de carrés ;
 *   actuel : jour ouvert en ce moment (marqué) ; texteTitre : mise en mots de la réponse (code de couleurs…).
 * @returns {{rafraichir: (actuel?: string|null) => Promise<void>}}
 */
export function monterArchives(hote, o) {
  const { sb, esc, jeu, lien, code } = o;
  const titre = o.titre || 'Manches passées';
  const forme = o.forme || 'liste';
  const DEBUT = 5;
  const S = { manches: [], recu: false, tout: false, actuel: o.actuel || null, ouvert: true };
  stylesArchives(forme === 'grille');

  function moiTexte(m) {
    if (m.en_cours) return 'En cours';
    if (!m.joue) return 'Pas joué';
    if (o.essais) return m.reussi ? `Toi : trouvé en ${m.palier}` : 'Toi : raté';
    return m.reussi ? `Toi : réussie · ${points(m)}/10` : 'Toi : ratée';
  }

  function ligneHtml(m) {
    const rep = m.joue;
    const t = rep ? esc(m.titre ? (o.texteTitre ? o.texteTitre(m.titre) : m.titre) : 'Grille terminée') : '<span aria-hidden="true">???</span><span class="visually-hidden">Réponse cachée</span>';
    const btn = rep ? 'Revoir' : m.en_cours ? 'Reprendre' : 'Jouer';
    return `<li class="jhh-ligne ar-ligne${rep ? '' : ' is-ajouer'}"><div class="jhh-tete ar-tete">
        <span class="jhh-num">#${esc(String(m.num))}</span><span class="jhh-date">${esc(dateCourte(m.day))}</span>
        <span class="jhh-titre"><b>${t}</b><span>${rep ? esc(o.unite || '') : 'réponse cachée jusqu’à ta partie'}</span></span>
        <span class="jhh-moi">${rep && o.essais ? carresHtml(m, o.essais) : ''}<span>${esc(moiTexte(m))}</span></span>
        <span class="jhh-qui"><b>${esc(String(m.trouves ?? 0))}</b> / ${esc(String(m.joueurs ?? 0))} ont trouvé</span>
        <a class="btn ${rep ? 'btn-ghost' : 'btn-sand'} ar-btn" href="${esc(lien(m.day))}"${m.day === S.actuel ? ' aria-current="true"' : ''}
          aria-label="${esc(`${btn} la manche n°${m.num} du ${dateLongue(m.day)}`)}">${btn}</a>
      </div></li>`;
  }

  function caseHtml(m) {
    const bas = m.joue ? `<span class="small muted">${points(m)} pt${points(m) > 1 ? 's' : ''} · ${esc(m.titre || '')}</span>`
      : `<span class="small jg-sand">${m.en_cours ? 'En cours' : 'À jouer'}</span>`;
    return `<a class="geo-arch ar-case" href="${esc(lien(m.day))}"${m.day === S.actuel ? ' aria-current="true"' : ''}>
        <span class="geo-arch-img ar-img" aria-hidden="true"><span class="ar-num">#${esc(String(m.num))}</span></span>
        <span class="geo-arch-txt"><b>N°${esc(String(m.num))}</b> · ${esc(dateCourte(m.day))}</span>${bas}</a>`;
  }

  function dessine() {
    const L = S.manches;
    if (forme === 'grille') {
      if (!L.length) { hote.innerHTML = ''; return; }
      hote.innerHTML = `<details class="jg-card geo-archive ar-framed"${S.ouvert ? ' open' : ''}>
          <summary><span class="jg-h3">${esc(titre)}</span> <span class="small muted">pour l’honneur, sans Paillettes</span></summary>
          <div class="geo-archive-grid">${L.map(caseHtml).join('')}</div></details>`;
      hote.querySelector('details').addEventListener('toggle', (e) => { S.ouvert = e.target.open; });
      return;
    }
    if (!L.length) {
      hote.innerHTML = `<section class="card jhh ar"><div class="jhh-haut"><div><p class="jhh-code">// ${esc(code)}</p>
          <h2 class="jhh-h">${esc(titre)}</h2><p class="muted small">Pas encore de ${titre === 'Grilles passées' ? 'grille passée : la première arrive demain' : 'manche passée : la première arrive demain'}.</p></div></div></section>`;
      return;
    }
    const vues = S.tout ? L : L.slice(0, DEBUT);
    hote.innerHTML = `<section class="card jhh ar" aria-labelledby="ar-h-${esc(jeu)}">
        <div class="jhh-haut"><div><p class="jhh-code">// ${esc(code)}</p><h2 class="jhh-h" id="ar-h-${esc(jeu)}">${esc(titre)}</h2>
          <p class="muted small">${L.length} manche${L.length > 1 ? 's' : ''} passée${L.length > 1 ? 's' : ''} · pour l’honneur : sans Paillettes, sans classement, sans série.</p></div></div>
        <ul class="jhh-liste" role="list">${vues.map(ligneHtml).join('')}</ul>
        ${L.length > DEBUT ? `<button type="button" class="btn btn-ghost jhh-plus" aria-expanded="${S.tout}">${S.tout ? 'Voir moins' : `Voir les ${L.length} manches`}</button>` : ''}</section>`;
    hote.querySelector('.jhh-plus')?.addEventListener('click', () => { S.tout = !S.tout; dessine(); });
  }

  async function rafraichir(actuel) {
    if (actuel !== undefined) S.actuel = actuel;
    try {
      const { data, error } = await sb.rpc('hg_jeux_archive', { p_jeu: jeu });
      if (error) throw error;
      S.recu = Array.isArray(data?.manches);
      S.manches = S.recu ? data.manches : [];
      // La manche ouverte reste visible dans la liste courte.
      if (S.actuel && S.manches.findIndex((m) => m.day === S.actuel) >= DEBUT) S.tout = true;
    } catch (e) {
      console.warn('[archives]', jeu, e);
      S.recu = false; S.manches = [];
    }
    // Rien reçu (jeu fermé, serveur pas à jour) : rien n'est montré plutôt qu'une liste vide trompeuse.
    if (!S.recu) { hote.innerHTML = ''; return; }
    dessine();
  }
  rafraichir();
  return { rafraichir };
}

/**
 * Suit le jour demandé dans l'adresse (ctx.sub) : appelle changer(jour|null) quand il diffère du jour affiché.
 * @param {HTMLElement} cible élément qui reçoit « jeux:show » et « jeux:sub » (la zone du jeu)
 * @param {object} ctx contexte partagé de la page Jeux (ctx.sub à jour)
 * @param {() => string|null} actuel jour affiché (null = manche du jour)
 * @param {(jour: string|null) => void} changer
 */
export function suivreJour(cible, ctx, actuel, changer) {
  const voir = () => { const j = jourVoulu(ctx.sub); if (j !== actuel()) changer(j); };
  cible.addEventListener('jeux:show', voir);
  cible.addEventListener('jeux:sub', voir);
}
