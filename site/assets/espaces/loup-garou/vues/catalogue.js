// ===== Humane Gang — Loup-Garou : catalogue des 39 rôles (#roles) =====
/*
 * Rôle : affiche les rôles de roles.js en cartes, filtrables par extension et par camp, et cherchables par nom
 * (sans accents ni casse). Les cartes sont créées une seule fois : filtrer les cache ou les montre sans les refaire,
 * donc une carte dépliée reste dépliée. « Lire la suite » n'apparaît que si le texte dépasse 3 lignes.
 * Dépendances : core.js (esc), ui.js (filAriane, icone, vignetteRole, pastilleCamp), roles.js (ROLES, EXTENSIONS, CAMPS).
 * Exporte : afficher.
 */
import { esc } from '../../../commun/core.js';
import { filAriane, icone, vignetteRole, pastilleCamp } from '../ui.js';
import { ROLES, EXTENSIONS, CAMPS } from '../roles.js';

/** Texte prêt à comparer : sans accents, en minuscules, sans espaces autour. */
function normaliser(texte) {
  return String(texte || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** « 1 rôle », « 12 rôles ». */
const compter = (n) => `${n} rôle${n > 1 ? 's' : ''}`;

/** Bouton de filtre en pilule ; aria-pressed dit s'il est actif (la couleur ne suffit pas). */
function pilule(filtre, valeur, libelle, actif, couleur = '') {
  return `<button type="button" class="lg-pilule" data-filtre="${esc(filtre)}" data-valeur="${esc(valeur)}" aria-pressed="${actif}"${couleur ? ` style="--lg-c:${esc(couleur)}"` : ''}>${esc(libelle)}</button>`;
}

/** HTML d'une carte de rôle. Le texte long est coupé par CSS (3 lignes) ; le bouton est affiché par verifier(). */
function carteHtml(r) {
  const camp = CAMPS[r.camp] || CAMPS.village;
  const ext = EXTENSIONS.find((e) => e.id === r.extension)?.label || r.extension;
  const etiquettes = [];
  if (r.mjSeul) etiquettes.push(`<span class="lg-etiquette ambre">${icone('micro', 12)}Meneur humain uniquement</span>`);
  if (r.gagneSeul) etiquettes.push('<span class="lg-etiquette">Gagne seul</span>');
  if (r.voisins) etiquettes.push('<span class="lg-etiquette">Utilise les voisins</span>');
  if (!r.actif) etiquettes.push('<span class="lg-etiquette">Bientôt disponible</span>');
  const idDesc = `lg-role-desc-${r.id}`;
  return `<article class="lg-role${r.actif ? '' : ' is-inactif'}" data-role="${esc(r.id)}" style="--lg-bord:${esc(camp.bord)}">
    ${vignetteRole(r.id, 64)}
    <h2 class="lg-role-nom">${esc(r.nom)}</h2>
    <div class="lg-role-etiquettes">${pastilleCamp(r.camp)}${etiquettes.join('')}</div>
    <p class="lg-role-ext">${esc(ext)}</p>
    <p class="lg-role-desc" id="${idDesc}">${esc(r.description)}</p>
    <button type="button" class="lg-role-plus" aria-expanded="false" aria-controls="${idDesc}" hidden>Lire la suite</button>
  </article>`;
}

/**
 * Affiche le catalogue dans root. Renvoie une fonction de nettoyage (arrête l'observation des cartes).
 */
export async function afficher(root) {
  const etat = { extension: 'toutes', camp: 'tous' };
  const pillesExt = [{ id: 'toutes', label: 'Toutes' }, ...EXTENSIONS.map((e) => ({ id: e.id, label: e.label }))]
    .map((o, i) => pilule('extension', o.id, o.label, i === 0)).join('');
  const pillesCamp = [{ id: 'tous', label: 'Tous' }, ...Object.entries(CAMPS).map(([id, c]) => ({ id, label: c.label, couleur: c.texte }))]
    .map((o, i) => pilule('camp', o.id, o.label, i === 0, o.couleur)).join('');

  root.innerHTML = `<div class="lg-catalogue">
    ${filAriane('Les 39 rôles')}
    <header class="lg-catalogue-intro">
      <h1 class="page-title">Les 39 rôles</h1>
      <p>Chaque rôle a son pouvoir, son camp et ses règles. Filtrez par extension ou par camp pour préparer votre partie.</p>
    </header>
    <div class="lg-filtres">
      <div class="lg-filtre-ligne">
        <span class="lg-filtre-titre" id="lg-cat-ext">Extension</span>
        <div class="lg-pilules" role="group" aria-labelledby="lg-cat-ext">${pillesExt}</div>
      </div>
      <div class="lg-filtre-ligne">
        <span class="lg-filtre-titre" id="lg-cat-camp">Camp</span>
        <div class="lg-pilules" role="group" aria-labelledby="lg-cat-camp">${pillesCamp}</div>
        <div class="lg-recherche-bloc">
          <label class="visually-hidden" for="lg-cat-recherche">Rechercher un rôle</label>
          <input id="lg-cat-recherche" class="lg-recherche" type="search" placeholder="Rechercher un rôle" autocomplete="off">
        </div>
      </div>
    </div>
    <p class="lg-compteur" aria-live="polite"></p>
    <div class="lg-grille">${ROLES.map(carteHtml).join('')}</div>
    <p class="empty lg-catalogue-vide" hidden>Aucun rôle ne correspond.</p>
  </div>`;

  const recherche = root.querySelector('#lg-cat-recherche');
  const compteur = root.querySelector('.lg-compteur');
  const vide = root.querySelector('.lg-catalogue-vide');
  const els = [...root.querySelectorAll('.lg-role')];

  // Une entrée par carte : rôle, élément, texte, bouton, état (déplié ou non, texte coupé ou non).
  const cartes = ROLES.map((r, i) => ({
    r,
    el: els[i],
    desc: els[i].querySelector('.lg-role-desc'),
    bouton: els[i].querySelector('.lg-role-plus'),
    nomNorm: normaliser(r.nom),
    ouvert: false,
    tronque: false,
  }));

  /** Libellé, aria-expanded et visibilité du bouton « Lire la suite » / « Réduire ». */
  function peindreBouton(c) {
    const libelle = c.ouvert ? 'Réduire' : 'Lire la suite';
    c.bouton.textContent = libelle;
    c.bouton.setAttribute('aria-expanded', String(c.ouvert));
    c.bouton.setAttribute('aria-label', `${libelle} : ${c.r.nom}`);
    c.bouton.hidden = !(c.ouvert || c.tronque);
  }

  /** Le texte dépasse-t-il 3 lignes ? (une carte cachée mesure 0 : on recalcule quand elle s'affiche). */
  function verifier(c) {
    if (!c.ouvert) c.tronque = c.desc.scrollHeight > c.desc.clientHeight + 1;
    peindreBouton(c);
  }

  for (const c of cartes) {
    c.bouton.addEventListener('click', () => {
      c.ouvert = !c.ouvert;
      c.el.classList.toggle('is-ouvert', c.ouvert);
      peindreBouton(c);
    });
  }

  // Applique les filtres : cache ou montre chaque carte, met à jour le compteur et l'état vide.
  function filtrer() {
    const q = normaliser(recherche.value);
    let n = 0;
    for (const c of cartes) {
      const visible = (etat.extension === 'toutes' || c.r.extension === etat.extension)
        && (etat.camp === 'tous' || c.r.camp === etat.camp)
        && (!q || c.nomNorm.includes(q));
      c.el.hidden = !visible;
      if (visible) n += 1;
    }
    compteur.textContent = compter(n);
    vide.hidden = n > 0;
  }

  root.querySelector('.lg-filtres').addEventListener('click', (ev) => {
    const b = ev.target.closest('.lg-pilule');
    if (!b) return;
    const filtre = b.dataset.filtre;
    etat[filtre] = b.dataset.valeur;
    root.querySelectorAll(`.lg-pilule[data-filtre="${filtre}"]`)
      .forEach((p) => p.setAttribute('aria-pressed', String(p === b)));
    filtrer();
  });
  recherche.addEventListener('input', filtrer);

  // Mesure le texte quand la carte change de taille (affichage par filtre, redimensionnement, polices).
  const parDesc = new Map(cartes.map((c) => [c.desc, c]));
  const toutes = () => cartes.forEach(verifier);
  let observateur = null;
  if ('ResizeObserver' in window) {
    // À l'image suivante : afficher ou cacher le bouton dans le rappel change la taille observée (boucle « ResizeObserver loop »).
    observateur = new ResizeObserver((entrees) => requestAnimationFrame(() => {
      entrees.forEach((e) => { const c = parDesc.get(e.target); if (c) verifier(c); });
    }));
    cartes.forEach((c) => observateur.observe(c.desc));
  } else {
    window.addEventListener('resize', toutes);
    toutes();
  }

  filtrer();

  return () => {
    observateur?.disconnect();
    window.removeEventListener('resize', toutes);
  };
}
