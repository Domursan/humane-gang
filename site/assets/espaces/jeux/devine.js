// ===== Humane Gang — page « Jeux » : briques communes des jeux « devine en 6 essais » (Framed, Heardle) =====
/*
 * Rôle : champ de réponse avec suggestions (liste fermée : films du ciné-club, morceaux du gang), pastilles des essais,
 * texte de partage, classement de la semaine, chargement unique d'une feuille de style.
 * Utilisé par jeux/framed.js et jeux/heardle.js. Tout texte venant de la base passe par esc().
 * Exporte : loadCss, boardHtml, shareText, copyText, bindGuess, guessFormHtml, normalize.
 */

/** Dossier de chaque feuille de style, relatif à ce module (les CSS sont à côté des JS de leur espace). */
const FEUILLES = {
  'jeux-devine': './', 'jeux-nj': './', 'jeux-grilles': './', 'jeux-bataille': './', 'jeux-arene': './',
  'cartes-card': '../cartes/',
};

/** Ajoute une feuille de style une seule fois (<espace>/<nom>.css). */
export function loadCss(name) {
  const href = new URL(`${FEUILLES[name] ?? './'}${name}.css`, import.meta.url).href;
  if (document.querySelector(`link[data-jeux-css="${name}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = href; l.dataset.jeuxCss = name;
  document.head.append(l);
}

/** Texte sans accents ni ponctuation, en minuscules (recherche dans les suggestions). */
export const normalize = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Classement de la semaine (10 premiers).
 * @param {Array} board Lignes { user_id, pseudo, points, wins }.
 * @param {string} meId Identifiant du membre connecté.
 * @param {Function} esc Échappement HTML.
 */
export function boardHtml(board, meId, esc) {
  if (!board?.length) return '<p class="muted small">Personne n’a encore joué cette semaine.</p>';
  return `<ol class="jd-board">${board.map((r, i) => `<li class="jd-board-row${r.user_id === meId ? ' is-me' : ''}">
      <span class="jd-rank">${i + 1}</span><span class="jd-name">${esc(r.pseudo)}</span>
      <span class="jd-pts">${esc(r.points)} pt${r.points > 1 ? 's' : ''}</span><span class="muted small">${esc(r.wins)} trouvé${r.wins > 1 ? 's' : ''}</span></li>`).join('')}</ol>`;
}

/** Texte de partage : « Framed du gang #18 3/6 » suivi d'une ligne de carrés. */
export function shareText(name, st) {
  const g = st.guesses || [];
  const line = g.map((x, i) => (st.solved && i === g.length - 1 ? '🟩' : x.id ? '🟥' : '⬛')).join('') + '⬜'.repeat(Math.max(0, 6 - g.length));
  return `${name} #${st.round} ${st.solved ? g.length : 'X'}/6\n${line}`;
}

/** Copie un texte dans le presse-papiers ; renvoie vrai si c'est fait. */
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

/**
 * Formulaire de réponse : champ combobox (liste de suggestions), boutons Valider et Passer.
 * @param {string} id Préfixe des identifiants.
 * @param {string} label Libellé du champ.
 * @param {boolean} busy Envoi en cours.
 */
export function guessFormHtml(id, label, busy) {
  return `<form class="jd-form" id="${id}-form" autocomplete="off">
      <label for="${id}-input" class="jd-label">${label}</label>
      <div class="jd-combo">
        <input id="${id}-input" class="input" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" maxlength="120" placeholder="Tape quelques lettres…" ${busy ? 'disabled' : ''}>
        <ul class="jd-list" id="${id}-list" role="listbox" aria-label="Suggestions" hidden></ul>
      </div>
      <div class="jd-actions">
        <button type="button" class="btn btn-ghost" data-act="passer" ${busy ? 'disabled' : ''}>Passer</button>
        <button type="submit" class="btn btn-sand" ${busy ? 'disabled' : ''}>Valider</button>
      </div>
      <p class="jd-hint muted small" id="${id}-hint" role="status"></p>
    </form>`;
}

/**
 * Branche le combobox : filtre les suggestions, flèches haut/bas, Entrée, clic. Un choix doit venir de la liste.
 * @param {HTMLElement} root Conteneur du formulaire.
 * @param {string} id Préfixe des identifiants.
 * @param {{items: Array, label: Function, sub?: Function, onPick: Function, onSkip: Function, exclude: Set, esc: Function}} o
 */
export function bindGuess(root, id, o) {
  const form = root.querySelector(`#${id}-form`);
  if (!form) return;
  const input = form.querySelector(`#${id}-input`);
  const list = form.querySelector(`#${id}-list`);
  const hint = form.querySelector(`#${id}-hint`);
  // Avec plusieurs centaines de réponses, les 8 premières par ordre alphabétique cacheraient « It » ou « Her » : le titre exact
  // passe d'abord, puis les titres qui commencent par la saisie, puis ceux dont un mot commence par elle.
  const cles = o.items.map((it) => ({ it, texte: normalize(o.label(it)), titre: normalize(it.title ?? o.label(it)) }));
  const rang = (c, q) => (c.titre === q ? 0 : c.titre.startsWith(q) ? 1 : ` ${c.texte}`.includes(` ${q}`) ? 2 : 3);
  let shown = [], active = -1, picked = null;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
  const paint = () => {
    list.innerHTML = shown.map((it, i) => `<li role="option" id="${id}-opt-${i}" data-i="${i}" aria-selected="${i === active}" class="jd-opt${i === active ? ' is-active' : ''}">${o.esc(o.label(it))}${o.sub?.(it) ? `<span class="jd-opt-sub">${o.esc(o.sub(it))}</span>` : ''}</li>`).join('');
    list.hidden = !shown.length;
    input.setAttribute('aria-expanded', String(!!shown.length));
    if (active >= 0) { input.setAttribute('aria-activedescendant', `${id}-opt-${active}`); list.children[active]?.scrollIntoView({ block: 'nearest' }); }
    else input.removeAttribute('aria-activedescendant');
  };
  const filter = () => {
    const q = normalize(input.value);
    picked = null;
    if (q.length < 1) { shown = []; close(); return; }
    shown = cles.filter((c) => !o.exclude.has(String(c.it.id)) && c.texte.includes(q))
      .sort((a, b) => rang(a, q) - rang(b, q)).slice(0, 8).map((c) => c.it);
    active = shown.length ? 0 : -1;
    paint();
  };
  const choose = (i) => { const it = shown[i]; if (!it) return; picked = it; input.value = o.label(it); close(); };
  input.addEventListener('input', filter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && shown.length) { e.preventDefault(); active = (active + 1) % shown.length; paint(); }
    else if (e.key === 'ArrowUp' && shown.length) { e.preventDefault(); active = (active - 1 + shown.length) % shown.length; paint(); }
    else if (e.key === 'Enter' && !list.hidden && active >= 0) { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') close();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault());
  list.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) { choose(Number(li.dataset.i)); input.focus(); } });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) close(); }, 150));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!picked) {
      // Saisie exacte d'un titre de la liste : acceptée sans passer par la liste.
      const q = normalize(input.value);
      picked = cles.find((c) => c.texte === q || c.titre === q)?.it || null;
    }
    if (!picked) { hint.textContent = 'Choisis une réponse dans la liste des suggestions.'; input.focus(); return; }
    if (o.exclude.has(String(picked.id))) { hint.textContent = 'Tu as déjà proposé cette réponse.'; return; }
    hint.textContent = '';
    o.onPick(picked.id);
  });
  form.querySelector('[data-act="passer"]').addEventListener('click', () => o.onSkip());
}
