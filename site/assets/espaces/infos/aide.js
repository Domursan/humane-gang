// ===== Humane Gang — aide et tutos (/pages/infos/aide.html) =====
// Liste des tutos par groupe, recherche (titre, résumé, mots-clés), tuto ouvert par l'adresse /pages/infos/aide.html#<slug>.
// Accessible sans compte : seuls les groupes PUBLIC_GROUP_IDS (« premiers pas ») sont visibles aux visiteurs.
// Dépendances : core.js (initPage, esc, $) et tutos/index.js (chargement des groupes de tutos).
// Les données des tutos viennent de assets/js/tutos/ ; cette page ne fait que les afficher. N'exporte rien.
// Les chiffres des tutos sont des jetons {{chemin|repli}} remplacés par les réglages du site (commun/reglages/jetons.js).
import { initPage, esc, $ } from '../../commun/core.js';
import { loadTutoGroups, PUBLIC_GROUP_IDS } from './tutos/index.js';
import { chargerReglages, jetons } from '../../commun/reglages/jetons.js';
import { questTrack } from '../../commun/quest-track.js';

/* ---------- Initialisation : session facultative (les visiteurs voient « premiers pas ») ---------- */
const me = await initPage({ auth: 'optional' });

/* ---------- Constantes et outils ---------- */
const BASE_TITLE = 'Aide et tutos · Humane Gang';
const SAFE_PAGE = /^(\/pages\/[a-z0-9-]+\/)?[a-z0-9-]+\.html(#[\w-]*)?$/i; // lien « Y aller » : une page du site, rien d'autre
const SAFE_IMG = /^assets\/tutos\/[\w.-]+$/;        // capture : un fichier du dépôt, rien d'autre
/** Met en minuscules et retire les accents, pour que « Sortie » trouve « sortie » ou « Séance ». */
/* ---------- Affiches A3 à côté des tutos ---------- */
// Chaque affiche (dossier affiches/) illustre un thème ; un tuto absent de cette table s'affiche sans affiche.
// Les affiches lisent elles-mêmes les réglages du site : leurs chiffres suivent les prix et gains réglés.
const AFFICHES = {
  paillettes: { fichier: '/affiches/paillettes-a3.html', titre: 'Gagner des Paillettes' },
  boosters: { fichier: '/affiches/boosters-a3.html', titre: 'Obtenir des boosters' },
  cartes: { fichier: '/affiches/cartes-a3.html', titre: 'Gagner des cartes' },
  badges: { fichier: '/affiches/badges-a3.html', titre: 'Les badges du Humane Gang' },
};
const AFFICHE_PAR_TUTO = {
  'paillettes-passage-du-jour': 'paillettes', 'quetes-de-la-semaine': 'paillettes', 'defis-du-gang': 'paillettes', 'classement': 'paillettes',
  'ouvrir-un-booster': 'boosters',
  'lire-une-carte': 'cartes', 'collection-filtres-et-loupe': 'cartes', 'recycler-ses-doublons': 'cartes', 'fabriquer-une-carte': 'cartes',
  'liste-de-souhaits': 'cartes', 'attraper-une-carte-sauvage': 'cartes', 'series-completees': 'cartes', 'vitrine': 'cartes',
  'proposer-un-echange': 'cartes', 'repondre-a-une-offre': 'cartes', 'contre-proposition': 'cartes', 'offrir-une-carte': 'cartes', 'preparer-un-echange': 'cartes',
  'gagner-des-badges': 'badges', 'monter-les-niveaux-d-anciennete': 'badges', 'badges-et-paillettes-secret-santa': 'badges',
};
const AFFICHE_L = 1123, AFFICHE_H = 1587; // taille d'une affiche A3 en pixels (body des pages affiches/)

/**
 * Bloc « affiche » d'un tuto : l'affiche A3 dans un cadre, réduite à la largeur de la colonne, et un lien pour l'ouvrir en grand.
 * @param {string} slug identifiant du tuto
 * @returns {string} HTML, ou '' si le tuto n'a pas d'affiche
 */
function afficheHtml(slug) {
  const a = AFFICHES[AFFICHE_PAR_TUTO[slug]];
  if (!a) return '';
  return `<aside class="card aide-affiche" aria-label="Affiche : ${esc(a.titre)}">
    <div class="aide-affiche-cadre"><iframe src="${esc(a.fichier)}" title="Affiche : ${esc(a.titre)}" width="${AFFICHE_L}" height="${AFFICHE_H}" loading="lazy" scrolling="no" tabindex="-1"></iframe></div>
    <a class="btn btn-ghost aide-affiche-lien" href="${esc(a.fichier)}" target="_blank" rel="noopener">Ouvrir l'affiche en grand</a>
  </aside>`;
}

/** Réduit l'affiche à la largeur de son cadre (l'affiche garde sa mise en page A3, seule l'échelle change). */
const ajusteAffiche = new ResizeObserver((entries) => {
  for (const e of entries) {
    const f = e.target.querySelector('iframe');
    if (f) f.style.transform = `scale(${e.contentRect.width / AFFICHE_L})`;
  }
});

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const listView = $('#aide-list-view');
const tutoView = $('#aide-tuto-view');
const groupsBox = $('#aide-groups');
const emptyBox = $('#aide-empty');
const countBox = $('#aide-count');
const guestNote = $('#aide-guest');
const qInput = $('#aide-q');

/* ---------- Données : groupes valides, avec au moins un tuto ---------- */
// Filtre les entrées mal formées (slug non conforme, titre absent) pour ne jamais afficher une donnée cassée.
const loaded = await loadTutoGroups();
// Les réglages (prix, délais, seuils…) sont lus une fois, avant d'écrire les textes des tutos.
await chargerReglages();
/**
 * Un tuto avec ses jetons remplacés (titre, résumé, mots-clés, étapes, astuces). Les autres champs passent tels quels.
 * @param {object} t le tuto tel que livré par tutos/*.js
 * @returns {object} une copie du tuto avec les valeurs des réglages
 */
const avecReglages = (t) => ({
  ...t,
  title: jetons(t.title),
  summary: jetons(t.summary),
  keywords: Array.isArray(t.keywords) ? t.keywords.map(jetons) : t.keywords,
  steps: Array.isArray(t.steps) ? t.steps.map((s) => (s && typeof s === 'object' ? { ...s, title: jetons(s.title), text: jetons(s.text) } : s)) : t.steps,
  tips: Array.isArray(t.tips) ? t.tips.map(jetons) : t.tips,
});
const groups = loaded.map((g) => ({
  id: String(g.id ?? ''),
  title: String(g.title ?? ''),
  icon: String(g.icon ?? ''),
  tutos: (Array.isArray(g.tutos) ? g.tutos : []).filter((t) => t && /^[a-z0-9-]+$/.test(t.slug ?? '') && t.title).map(avecReglages),
})).filter((g) => g.id && g.tutos.length);
/** Vrai si je peux voir ce groupe : je suis connecté, ou le groupe est public. */
const canSee = (g) => !!me || PUBLIC_GROUP_IDS.includes(g.id);
const visibleGroups = groups.filter(canSee);
const bySlug = new Map();
groups.forEach((g) => g.tutos.forEach((t) => bySlug.set(t.slug, { t, g })));

if (!me) guestNote.hidden = false;
else $('.page-head')?.insertAdjacentHTML('beforeend', '<a class="btn btn-ghost aide-visite" href="/pages/compte/accueil.html#visite">Revoir la visite</a>'); // Q1 : relance la visite guidée sur l'accueil

/* ---------- Liste et recherche ---------- */
/**
 * Texte de recherche d'un tuto : titre, résumé et mots-clés, sans accents et en minuscules.
 * @param {{title: string, summary?: string, keywords?: string[]}} t le tuto
 * @returns {string}
 */
const haystack = (t) => fold([t.title, t.summary, ...(Array.isArray(t.keywords) ? t.keywords : [])].join(' '));

/**
 * Affiche la liste des tutos, filtrée par la recherche, et le message « aucun résultat » ou le compteur.
 * @param {string} [query=''] texte tapé dans la recherche
 */
function renderList(query = '') {
  const q = query.trim();
  const needle = fold(q);
  let total = 0;
  groupsBox.innerHTML = visibleGroups.map((g) => {
    const items = g.tutos.filter((t) => !needle || haystack(t).includes(needle));
    if (!items.length) return '';
    total += items.length;
    return `<section class="card aide-group" aria-labelledby="g-${esc(g.id)}">
      <h2 class="aide-group-title" id="g-${esc(g.id)}"><span class="aide-group-icon" aria-hidden="true">${esc(g.icon)}</span>${esc(g.title)}</h2>
      <ul class="aide-tuto-list">
        ${items.map((t) => `<li><a class="aide-tuto-link" href="/pages/infos/aide.html#${esc(t.slug)}">
          <span class="aide-tuto-title">${esc(t.title)}</span>
          ${t.summary ? `<span class="aide-tuto-sum">${esc(t.summary)}</span>` : ''}</a></li>`).join('')}
      </ul>
    </section>`;
  }).join('');
  if (!visibleGroups.length) {
    emptyBox.textContent = 'Les tutos arrivent bientôt.';
    emptyBox.hidden = false;
  } else if (total === 0) {
    emptyBox.textContent = `Aucun tuto ne correspond à « ${q} ». Essaie un autre mot, ou écris à l'assistance plus bas.`;
    emptyBox.hidden = false;
  } else {
    emptyBox.hidden = true;
  }
  countBox.textContent = !visibleGroups.length ? '' : needle ? (total === 1 ? '1 tuto trouvé' : `${total} tutos trouvés`) : '';
}

qInput.addEventListener('input', () => renderList(qInput.value));

/* ---------- Un tuto (adresse /pages/infos/aide.html#<slug>) ---------- */
/**
 * HTML d'un tuto complet : fil d'Ariane, étapes numérotées, astuces, bouton « Y aller ».
 * Le lien « Y aller » et les captures ne passent que si leur chemin est sûr (SAFE_PAGE, SAFE_IMG).
 * @param {object} t le tuto
 * @param {object} g le groupe auquel il appartient
 * @returns {string} HTML
 */
function tutoHtml(t, g) {
  const steps = (Array.isArray(t.steps) ? t.steps : []).filter((s) => s && s.title);
  const tips = (Array.isArray(t.tips) ? t.tips : []).filter(Boolean);
  const page = typeof t.page === 'string' && SAFE_PAGE.test(t.page) ? t.page : '';
  return `<article class="card aide-tuto">
    <p class="aide-crumb"><a href="/pages/infos/aide.html">Tous les tutos</a> <span aria-hidden="true">›</span> ${esc(g.icon)} ${esc(g.title)}</p>
    <h2 class="aide-tuto-heading display" id="aide-tuto-heading" tabindex="-1">${esc(t.title)}</h2>
    ${t.summary ? `<p class="aide-summary">${esc(t.summary)}</p>` : ''}
    <ol class="aide-steps">
      ${steps.map((s, i) => `<li class="aide-step">
        <span class="aide-step-num" aria-hidden="true">${i + 1}</span>
        <div class="aide-step-body">
          <h3>${esc(s.title)}</h3>
          ${s.text ? `<p>${esc(s.text)}</p>` : ''}
          ${typeof s.img === 'string' && SAFE_IMG.test(s.img) ? `<img class="aide-shot" src="${esc(s.img)}" alt="Capture de l'étape ${i + 1}" loading="lazy" data-on-error="remove">` : ''}
        </div>
      </li>`).join('')}
    </ol>
    ${tips.length ? `<div class="aide-tips"><h3>Astuces</h3><ul>${tips.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="btn-row aide-actions">
      ${page ? `<a class="btn btn-primary" href="${esc(page)}">Y aller</a>` : ''}
      <a class="btn btn-ghost" href="/pages/infos/aide.html">← Tous les tutos</a>
    </div>
  </article>`;
}

/**
 * Affiche un message à la place d'un tuto (inexistant, réservé aux membres), avec un retour à la liste.
 * @param {string} html contenu du message (HTML construit ici, pas de saisie utilisateur)
 */
function showMessage(html) {
  tutoView.innerHTML = `<div class="card aide-tuto aide-missing">${html}
    <div class="btn-row"><a class="btn btn-ghost" href="/pages/infos/aide.html">← Tous les tutos</a></div></div>`;
}

/**
 * Ouvre un tuto par son slug (adresse /pages/infos/aide.html#<slug>) : le tuto, un message « n'existe pas », ou « réservé aux membres ».
 * @param {string} slug identifiant du tuto
 */
function showTuto(slug) {
  const hit = bySlug.get(slug);
  listView.hidden = true;
  tutoView.hidden = false;
  if (!hit) {
    showMessage(`<h2 class="display" tabindex="-1">Ce tuto n'existe pas</h2><p>Il a peut-être changé de nom. Choisis-en un dans la liste.</p>`);
  } else if (!canSee(hit.g)) {
    showMessage(`<h2 class="display" tabindex="-1">Tuto réservé aux membres</h2><p>Connecte-toi pour voir ce tuto.</p>
      <div class="btn-row"><a class="btn btn-primary" href="/pages/compte/compte.html">Me connecter</a></div>`);
  } else {
    const affiche = afficheHtml(hit.t.slug);
    tutoView.innerHTML = affiche ? `<div class="aide-tuto-duo">${tutoHtml(hit.t, hit.g)}${affiche}</div>` : tutoHtml(hit.t, hit.g);
    const cadre = tutoView.querySelector('.aide-affiche-cadre');
    if (cadre) ajusteAffiche.observe(cadre);
    document.title = `${hit.t.title} · ${BASE_TITLE}`;
    if (me) questTrack('tuto_lu', hit.t.slug); // quête « tutos lus » : seulement pour un membre connecté
    tutoView.querySelector('#aide-tuto-heading')?.focus({ preventScroll: false });
    window.scrollTo({ top: 0 });
    return;
  }
  document.title = BASE_TITLE;
  tutoView.querySelector('h2')?.focus();
}

/** Revient à la liste des tutos (/pages/infos/aide.html sans slug) et remet le titre de page par défaut. */
function showList() {
  tutoView.hidden = true;
  ajusteAffiche.disconnect();
  tutoView.innerHTML = '';
  listView.hidden = false;
  document.title = BASE_TITLE;
  renderList(qInput.value);
}

/**
 * Choisit la vue selon l'adresse : /pages/infos/aide.html#<slug> ouvre un tuto, sans slug la liste.
 * Appelée au chargement et à chaque changement d'ancre.
 */
function route() {
  let slug = '';
  try { slug = decodeURIComponent(location.hash.slice(1)); } catch { slug = ''; }
  if (slug) showTuto(slug);
  else showList();
}
window.addEventListener('hashchange', route);
route();
