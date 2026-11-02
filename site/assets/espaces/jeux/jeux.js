// ===== Humane Gang — page « Jeux » (/pages/jeux/jeux.html) : tous les jeux en cartes, « Les missions du jour » et un onglet par jeu flash =====
/*
 * Rôle : la vue de départ (/pages/jeux/jeux.html, ou /pages/jeux/jeux.html#tous) présente tous les jeux en cartes, rangés en sections
 * (catalogue : assets/espaces/jeux/catalogue.js) : Jeux quotidiens et Jeux flash (les onglets de cette page), Jeux multijoueurs, Jeux spéciaux
 * (pages à part). Une carte n'est affichée que si le membre y a droit : accès de sa page (comme le menu), et les jeux
 * pas encore sortis (« bientot ») pour les seuls admins. Ce qui n'est visible que des admins (jeu en préparation,
 * page encore en mode admin) a une ambiance « chantier » : bandes jaunes et noires et petit panneau de travaux. Le menu « Jeux » du haut mène à cette vue et à ses sections.
 * Construit aussi la barre d'onglets (liste de assets/espaces/jeux/onglets.js), précédée de l'onglet « Les missions du jour »
 * (programme du jour : chaque jeu avec son état, Paillettes gagnées aujourd'hui). Charge le module d'un jeu à la
 * première ouverture de son onglet et lui confie son panneau. L'onglet choisi est dans l'adresse (/pages/jeux/jeux.html#geo) ;
 * sans adresse, la page s'ouvre sur tous les jeux. Un choix propre à un jeu suit le nom de l'onglet dans l'adresse
 * (/pages/jeux/jeux.html#arcade-raclette) : il est passé au module dans ctx.sub, et l'événement « jeux:sub » le signale quand il change.
 * Au-dessus de la vue de départ, filtre « Tous » seulement : la barre « Reprendre ma partie » (reprendre.js).
 * La barre d'onglets est masquée (CSS) : on navigue par les cartes de la vue de départ. Le panneau de l'onglet
 * choisi occupe toute la largeur ; le tableau de bord et chaque jeu portent leur titre. L'Arène n'est plus ici (/pages/cartes/cartes.html#arene) :
 * l'ancienne adresse /pages/jeux/jeux.html#bataille y redirige.
 * Un lien « Tous les jeux » ramène à la vue de départ depuis un jeu.
 * Vue « Mes stats » (/pages/jeux/jeux.html#mes-stats, module mes-stats.js, idée 18) : mes chiffres des jeux du jour, ouverte
 * depuis « Ma carte » ; un panneau sans onglet, absent du tableau de bord.
 * Ancres de section (menu « Jeux » de l'en-tête) : /pages/jeux/jeux.html#quotidien, #flash, #multi, #speciaux (id de SECTIONS)
 * ouvrent la vue de départ, remettent filtres et recherche à zéro et font défiler jusqu'à la section.
 * Accessibilité : motif ARIA des onglets, flèches (gauche/droite et haut/bas), Début et Fin, un seul onglet dans
 * l'ordre de tabulation.
 * Page : /pages/jeux/jeux.html (session membre requise).
 * Dépendances : core.js (initPage, sb, toast, esc, $), jeux/onglets.js, jeux/commun.js, modules jeux/<id>.js.
 * Le fichier n'exporte rien.
 */
import { paillSym } from '../../commun/paillettes.js';
import { sb, initPage, toast, esc, $ } from '../../commun/core.js';
import { ONGLETS } from './onglets.js';
import { nf, jourLong, zurichIso } from './commun.js';
import { SECTIONS, CARTES, BONUS, LIBELLE_ETAT } from './catalogue.js';
import { CLE_JEU, monterClassement } from './classement-jeux.js'; // classements des jeux du jour (migration 157)
import { canAccess, pageLabel, pageMode } from '../../commun/core/pages-access.js';
import { getCachedProfile } from '../../commun/core/profile.js';
import { viewAsActive } from '../../commun/core/view-as.js';
import { setCompteurs } from '../../commun/core/badges-compteur.js';
import { creerReprise } from './reprendre.js';
import { creerEnDirect } from './en-direct.js'; // parties à regarder en spectateur (migration 214)
import { chargerSeries, seriesJeux } from './serie-jeux.js'; // séries des jeux du jour (migration 206)

/* ---------- Ancienne adresse de l'Arène : elle vit dans la page Cartes ---------- */
if (location.hash === '#bataille') location.replace('/pages/cartes/cartes.html#arene');

/* ---------- Initialisation : session membre requise ---------- */
const me = await initPage();

/* ---------- Constantes et état ---------- */
/** Identifiant réservé au tableau de bord. */
const HUB = 'aujourdhui';
/** Identifiant réservé à la vue de départ (tous les jeux en cartes). */
const TOUS = 'tous';
/** Forme d'un identifiant d'onglet valide. */
const ID_RE = /^[a-z0-9][a-z0-9-]{0,30}$/;
/** Groupes de la colonne d'onglets (grand écran) et du tableau de bord, dans l'ordre. */
const GROUPES = [['jour', 'Chaque jour'], ['semaine', 'Chaque semaine'], ['competition', 'Compétition']];
/** Icône du tableau de bord (étincelle). */
const ICONE_HUB = '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>';
/** Icône par défaut d'un jeu (manette). */
const ICONE_DEF = '<rect x="2" y="7" width="20" height="10" rx="4"/><path d="M7 10v4M5 12h4M15 11h.01M18 13h.01"/>';
/** Jeux valides, sans doublon, rangés par groupe (l'ordre de onglets.js est gardé dans chaque groupe). */
/** Vrai pour un admin qui ne regarde pas le site « en tant que » un membre (jeux en développement, cartes « admin »). */
const adminVrai = () => !viewAsActive() && !!getCachedProfile()?.is_admin;
const JEUX = GROUPES.flatMap(([g]) => ONGLETS.filter((o, i, a) => o && ID_RE.test(o.id) && o.id !== HUB && o.id !== TOUS && o.module && (!o.admin || adminVrai()) && (!o.page || (canAccess(o.page) && !!pageLabel(o.page)))
  && a.findIndex((x) => x.id === o.id) === i && (GROUPES.some(([k]) => k === o.rythme) ? o.rythme : 'jour') === g)
  .map((o) => ({ ...o, rythme: GROUPES.some(([k]) => k === o.rythme) ? o.rythme : 'jour' })));
/** Identifiant réservé à la vue « Mes stats » (idée 18) : un panneau sans onglet, pas un jeu (absent du tableau de bord). */
const MES_STATS = 'mes-stats';
/** Tous les onglets : la vue de départ, le tableau de bord, la vue « Mes stats » puis les jeux. */
const LISTE = [{ id: TOUS, titre: 'Tous les jeux', icone: ICONE_DEF, catalogue: true },
  { id: HUB, titre: 'Les missions quotidiennes', icone: ICONE_HUB, hub: true },
  { id: MES_STATS, titre: 'Mes stats', module: './mes-stats.js', vue: true }, ...JEUX];
/** Dossier des modules (les chemins de onglets.js lui sont relatifs). */
const BASE = new URL('./', import.meta.url);
/** Contexte passé aux modules. sub : choix propre à un jeu tiré de l'adresse (null si aucun). */
const CTX = { sb, me, toast, esc, sub: null };
// État : onglet affiché ; modules montés (id -> module) ; montages en cours ; modules importés ; résumés (id -> résumé) ;
// notes : jeux notés aujourd'hui (clé de hg_jeux_resultats -> { score, points… }).
// filtre : section choisie dans la vue de départ ('' : Tous).
const S = { cur: null, mods: new Map(), loading: new Map(), imports: new Map(), resumes: new Map(), classements: new Map(), notes: null, filtre: '' };

const tablist = $('#jeux-tabs');
const panels = $('#jeux-panels');
const app = $('#app');
const retour = $('#jeux-retour');
/** Barre « Reprendre ma partie » (reprendre.js) : vue de départ seulement, pas sur un filtre. */
const reprise = creerReprise(me?.id);
/** Bloc « En direct » (en-direct.js, migration 214) : mêmes moments que la barre, seulement s'il y a des parties à regarder. */
const direct = creerEnDirect();
const majReprise = () => { reprise.afficher(S.cur === TOUS && !S.filtre); direct.afficher(S.cur === TOUS && !S.filtre); };

/* ---------- Outils ---------- */
/** SVG d'icône (trait, 24 × 24). */
const svg = (inner, cls = 'jeux-ico') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner || ICONE_DEF}</svg>`;
/** Couleur d'icône sûre : variable CSS ou hexadécimal, sinon sable. */
const couleur = (c) => (/^(var\(--[a-z0-9-]+\)|#[0-9a-f]{3,8})$/i.test(c || '') ? c : 'var(--sand)');
/**
 * Onglet et choix lus dans l'adresse : #geo → { id: 'geo', sub: null } ; #arcade-raclette → { id: 'arcade', sub: 'raclette' } ;
 * #quotidien (section de la vue de départ) → { id: 'tous', sub: null, section: 'quotidien' } ; adresse inconnue → { id: null, sub: null }.
 */
function lireAdresse() {
  const h = decodeURIComponent(location.hash.slice(1)).split('/')[0];
  if (LISTE.some((o) => o.id === h)) return { id: h, sub: null };
  if (SECTIONS.some((s) => s.id === h)) return { id: TOUS, sub: null, section: h };
  const o = LISTE.find((x) => !x.hub && !x.catalogue && h.startsWith(`${x.id}-`) && h.length > x.id.length + 1);
  return o ? { id: o.id, sub: h.slice(o.id.length + 1) } : { id: null, sub: null };
}
/**
 * Importe le module d'un jeu (une seule fois).
 * @param {object} o Ligne de ONGLETS.
 * @returns {Promise<object>} Le module.
 */
function importer(o) {
  if (!S.imports.has(o.id)) {
    const p = import(new URL(o.module, BASE).href);
    p.catch(() => S.imports.delete(o.id)); // nouvelle tentative possible
    S.imports.set(o.id, p);
  }
  return S.imports.get(o.id);
}

/* ---------- Construction ---------- */
/** Bouton d'onglet. */
function tabHtml(o) {
  return `<button class="jeux-tab" type="button" role="tab" id="jeux-tab-${o.id}" aria-controls="jeux-panel-${o.id}"
      aria-selected="false" tabindex="-1" data-id="${o.id}" data-cpt="jeux.${o.id}" data-cpt-label="à jouer">${svg(o.icone)}<span class="jeux-tab-t">${esc(o.titre)}</span><span class="jeux-tab-st" data-st="${o.id}"></span></button>`;
}

/** Barre d'onglets (groupes décoratifs pour le grand écran) et panneaux vides. */
function construire() {
  let h = tabHtml(LISTE[0]) + tabHtml(LISTE[1]);
  for (const [g, label] of GROUPES) {
    const jeux = JEUX.filter((o) => o.rythme === g);
    if (!jeux.length) continue;
    h += `<span class="jeux-tabs-grp" aria-hidden="true">${esc(label)}</span>${jeux.map(tabHtml).join('')}`;
  }
  tablist.innerHTML = h;
  // Une vue sans onglet (« Mes stats ») est nommée par son propre titre (id ms-h, posé par le module)
  panels.innerHTML = LISTE.map((o) => `<section class="jeux-panel" role="tabpanel" id="jeux-panel-${o.id}"
      aria-labelledby="${o.vue ? 'ms-h' : `jeux-tab-${o.id}`}" tabindex="0" data-id="${o.id}" hidden></section>`).join('');
  document.querySelector('.jeux-layout').before(direct.zone, reprise.zone); // « Reprendre ma partie » reste juste au-dessus de la liste
  // Orientation annoncée selon la mise en page (colonne à gauche sur grand écran)
  const mq = matchMedia('(min-width: 1024px)');
  const orient = () => tablist.setAttribute('aria-orientation', mq.matches ? 'vertical' : 'horizontal');
  orient();
  mq.addEventListener?.('change', orient);
}

/* ---------- Tableau de bord « Les missions du jour » ---------- */
/** Pastille d'état d'un jeu : sans état du jour, pas de pastille (comme dans le catalogue). Libellés : catalogue.js. */
function badgeHtml(r) {
  if (!['fait', 'a_jouer', 'en_cours'].includes(r?.etat)) return '';
  const t = esc(r.badge || LIBELLE_ETAT[r.etat]);
  if (!t) return '';
  if (r.etat === 'fait') return `<span class="pill pill-ok"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>${t}</span>`;
  if (r.etat === 'a_jouer') return `<span class="pill jeux-pill-sand">${t}</span>`;
  if (r.etat === 'en_cours') return `<span class="pill jeux-pill-amber">${t}</span>`;
  return `<span class="pill">${t}</span>`;
}

/** Monte le tableau de bord (structure), puis le remplit avec les résumés des jeux. */
function monterHub(panel) {
  panel.innerHTML = `<div class="jeux-hub">
      <h2 class="jeux-hub-title">Les missions quotidiennes</h2>
      <section class="jg-card jeux-prog" aria-labelledby="jeux-prog-h">
        <div class="jg-between"><h2 class="jg-h3" id="jeux-prog-h">Ton programme du jour</h2>
          <span class="jeux-serie" id="jeux-serie" hidden></span></div>
        <div class="jeux-bar" role="progressbar" aria-labelledby="jeux-prog-h" aria-valuemin="0" aria-valuemax="${BONUS.length}" aria-valuenow="0" id="jeux-bar"><i></i></div>
        <p class="small muted" id="jeux-prog-txt">Chargement de tes jeux…</p>
      </section>
      <div class="jeux-hub-cards" id="jeux-hub-cards"></div>
      ${GROUPES.map(([g, label]) => {
        const jeux = JEUX.filter((o) => o.rythme === g);
        return jeux.length ? `<section class="jg-card jeux-hub-list" aria-labelledby="jeux-grp-${g}">
          <h2 class="jeux-lbl" id="jeux-grp-${g}">${esc(label)}</h2>
          <ul class="jeux-rows">${jeux.map((o) => `<li><button class="jeux-row" type="button" data-open="${o.id}">
              <span class="jeux-tile" style="color:${couleur(o.couleur)}">${svg(o.icone, 'jeux-gi')}</span>
              <span class="jeux-row-txt"><span class="jeux-row-t">${esc(o.titre)}</span><span class="small muted jeux-row-s" data-sub="${o.id}">…</span></span>
              <span class="jeux-row-b" data-badge="${o.id}"></span></button></li>`).join('')}</ul></section>` : '';
      }).join('')}
    </div>`;
  panel.addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) choisir(b.dataset.open, { focus: true }); });
  return rafraichirHub();
}

/** Demande à chaque jeu son résumé du jour (en parallèle) et met à jour le tableau de bord et les onglets. */
async function rafraichirHub() {
  // Séries des jeux du jour (serie-jeux.js, migration 206) : la flamme de « Ton programme du jour »
  const series = chargerSeries(true).catch(() => null);
  await Promise.all([series, ...JEUX.map(async (o) => {
    try {
      const m = await importer(o);
      const r = typeof m.resume === 'function' ? await m.resume(CTX) : null;
      S.resumes.set(o.id, r && typeof r === 'object' ? r : null);
    } catch (e) {
      console.warn('[jeux] résumé', o.id, e);
      S.resumes.set(o.id, { etat: 'info', texte: 'Indisponible pour le moment', badge: '' });
    }
  })]);
  peindreHub();
}

/** Applique les résumés : lignes, cartes « à jouer », barre de progression, gains du jour, états des onglets. */
function peindreHub() {
  // Compteurs : les 16 jeux du bonus (catalogue.js, comme le classement) ; un jeu compte s'il est fait aujourd'hui
  const faits = BONUS.filter((c) => S.resumes.get(c.onglet || c.id)?.etat === 'fait').length;
  const descr = new Map(CARTES.map((c) => [c.onglet || c.id, c.texte]));
  const gain = JEUX.reduce((t, o) => t + (Number(S.resumes.get(o.id)?.gain) || 0), 0);
  // Flamme : la plus longue série en cours parmi tous les jeux du jour (hg_jeux_series), ou celle d'un résumé
  const serie = Math.max(0, ...JEUX.map((o) => Number(S.resumes.get(o.id)?.serie) || 0),
    ...Object.values(seriesJeux()?.jeux || {}).map((x) => Number(x?.n) || 0));
  for (const o of JEUX) {
    const r = S.resumes.get(o.id);
    const sub = document.querySelector(`[data-sub="${o.id}"]`);
    if (sub) sub.textContent = r?.texte || descr.get(o.id) || '';
    const b = document.querySelector(`[data-badge="${o.id}"]`);
    if (b) b.innerHTML = badgeHtml(r);
    const st = document.querySelector(`[data-st="${o.id}"]`);
    if (st) st.textContent = r?.etat === 'fait' ? (r.badge || 'Fait') : r?.etat === 'en_cours' ? (r.badge || '') : '';
  }
  // Cartes de la vue « Tous les jeux » : un jeu noté aujourd'hui (hg_jeux_classement, migration 179) prend le cadre vert et
  // ses points sur 10 ; un jeu quotidien pas encore joué affiche « 10 pts max », avec ou sans résumé (sauf s'il n'a pas de
  // partie aujourd'hui) ; sinon la pastille du résumé (en cours, ou fait avant d'être noté).
  for (const cb of document.querySelectorAll('[data-cbadge]')) {
    const k = cb.dataset.cbadge;
    const res = S.notes?.[CLE_JEU[k] || (k === 'code-du-jour' ? 'code_jour' : '')];
    const r = S.resumes.get(k);
    const quotidien = cb.closest('[data-s]')?.dataset.s === 'quotidien';
    const aJouer = quotidien && S.notes && (!r || r.etat === 'a_jouer');
    cb.innerHTML = res ? badgeHtml({ etat: 'fait', badge: `${nf(res.score)} pt${res.score > 1 ? 's' : ''}` })
      : aJouer ? badgeHtml({ etat: 'a_jouer', badge: '10 pts max' })
        : r && ['fait', 'a_jouer', 'en_cours'].includes(r.etat) ? badgeHtml(r) : '';
  }
  const total = BONUS.length;
  const bar = $('#jeux-bar');
  if (bar) {
    bar.setAttribute('aria-valuemax', String(total || 1));
    bar.setAttribute('aria-valuenow', String(faits));
    bar.setAttribute('aria-valuetext', `${faits} jeu${faits > 1 ? 'x' : ''} sur ${total}`);
    bar.querySelector('i').style.width = `${total ? Math.round((100 * faits) / total) : 0}%`;
  }
  const txt = $('#jeux-prog-txt');
  if (txt) txt.textContent = `${nf(faits)} jeu${faits > 1 ? 'x' : ''} sur ${nf(total)} fait${faits > 1 ? 's' : ''} · ${jourLong(zurichIso())}`;
  const se = $('#jeux-serie');
  if (se) { se.hidden = !serie; se.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3 1-6 1-8z" fill="currentColor"/></svg>${nf(serie)} jour${serie > 1 ? 's' : ''}`; se.setAttribute('aria-label', `Série : ${serie} jours`); }
  // Cartes « à jouer » (grand écran) : trois jeux au plus
  const cards = $('#jeux-hub-cards');
  if (cards) {
    const aJouer = JEUX.filter((o) => S.resumes.get(o.id)?.etat === 'a_jouer').slice(0, 3);
    cards.innerHTML = aJouer.map((o) => {
      const r = S.resumes.get(o.id);
      return `<div class="jg-card jeux-card"><div class="jg-between"><span class="jeux-tile" style="color:${couleur(o.couleur)}">${svg(o.icone, 'jeux-gi')}</span>${badgeHtml(r)}</div>
        <div><p class="jeux-card-t">${esc(o.titre)}</p><p class="small muted">${esc(r.texte || '')}</p></div>
        <button class="btn btn-sand" type="button" data-open="${o.id}">Jouer</button></div>`;
    }).join('');
    cards.hidden = !aJouer.length;
  }
  // Pastille « à jouer » sur chaque onglet de jeu (badges-compteur.js) : 1 si le jeu est à jouer aujourd'hui
  setCompteurs('jeux', Object.fromEntries(JEUX.map((o) => [o.id, S.resumes.get(o.id)?.etat === 'a_jouer' ? 1 : 0])));
  // Paillettes gagnées aujourd'hui (en-tête)
  const bal = $('#jeux-bal');
  if (bal) { bal.hidden = false; $('#jeux-bal-v').textContent = `+${nf(gain)} ${paillSym()}`; }
}

/* ---------- Vue de départ : tous les jeux en cartes ---------- */
/** Vrai pour un admin qui ne regarde pas le site « en tant que » un membre. */
const estAdmin = adminVrai;
/**
 * Vrai si le membre peut voir la carte : jeu pas encore sorti → admins seulement ; page à part → accès de la page,
 * qui doit être déclarée (comme les entrées « strict » du menu).
 */
function carteVisible(c) {
  if (c.bientot || c.admin) return estAdmin();
  if (c.page) return canAccess(c.page) && !!pageLabel(c.page);
  return true;
}
/** Vrai si la carte n'est visible que des admins (jeu en préparation, ou page encore réservée aux admins) : ambiance chantier. */
const reserveAdmin = (c) => !!c.bientot || !!c.admin || (!!c.page && pageMode(c.page) === 'admin');
/** Petit panneau de chantier (triangle « travaux » avec un ouvrier qui pelle). */
const PANNEAU = `<svg class="jx-panneau" viewBox="0 0 64 58" aria-hidden="true" focusable="false">
  <path d="M32 3L61 54H3z" fill="#FFFFFF" stroke="#D93A3F" stroke-width="5" stroke-linejoin="round"/>
  <circle cx="34" cy="21" r="3.6" fill="#121212"/>
  <path d="M33 25.5l-7 9 3 1.6 4.4-5.4 1.8 6.5-6 9.8 3 1.8 6.6-10.6 4.4 9.8 3.1-1.4-5.2-12.2-1.6-7z" fill="#121212"/>
  <path d="M24.5 34.5l-6 9.5" stroke="#121212" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M15 43.5l5.5 2.6-2.3 3.6z" fill="#121212"/>
  <path d="M38 47h9l-4.5-5z" fill="#121212"/>
</svg>`;
/** Version 320 px (dossier petit/) d'une image de jeu, en srcset avec l'originale : vignette plus légère sur téléphone. */
const srcsetVignette = (src) => (src.startsWith('/assets/images/jeux/')
  ? ` srcset="${esc(src.replace('/assets/images/jeux/', '/assets/images/jeux/petit/'))} 320w, ${esc(src)} 600w" sizes="(max-width: 600px) 40vw, 300px"`
  : '');
/** Vignette d'une carte : image, ou icône sur un fond de la couleur du jeu. */
function vignetteHtml(c) {
  if (c.image) return `<img class="jx-img" src="${esc(c.image)}"${srcsetVignette(c.image)} alt="" loading="lazy" decoding="async" width="900" height="600">`;
  return `<span class="jx-img jx-ico" style="--jx:${couleur(c.couleur)}">${svg(c.icone, 'jx-gi')}</span>`;
}
/** HTML d'une carte de jeu (lien, ou bloc inerte si le jeu est en préparation). */
function carteHtml(c) {
  const corps = `<span class="jx-vig">${vignetteHtml(c)}
      <span class="jx-pills">${reserveAdmin(c) ? `<span class="pill jx-prep">${c.bientot ? 'En préparation' : c.admin ? 'En développement' : '<span class="jx-l-long">Admins seulement</span><span class="jx-l-court" aria-hidden="true">Admins</span>'}</span>` : ''}<span data-cbadge="${esc(c.onglet || c.id)}"></span></span></span>
    <span class="jx-txt"><span class="jx-t">${esc(c.titre)}</span><span class="jx-s">${esc(c.texte)}</span></span>`;
  return c.bientot
    ? `<li class="jx-carte is-prep is-chantier" data-nom="${esc(c.titre.toLowerCase())}" aria-label="${esc(`${c.titre} : en préparation, visible des admins seulement`)}">${corps}</li>`
    : `<li class="jx-carte${reserveAdmin(c) ? ' is-chantier' : ''}" data-nom="${esc(c.titre.toLowerCase())}"><a class="jx-lien" href="${esc(c.href)}">${corps}</a></li>`;
}
/**
 * Monte la vue de départ : filtres par section, recherche, puis une grille de cartes par section visible.
 * @param {HTMLElement} panel Panneau de la vue.
 */
function monterCatalogue(panel) {
  const parSection = SECTIONS.map((s) => ({ ...s, court: s.titre.replace(/^Jeux /, '').replace(/^./, (x) => x.toUpperCase()),
    cartes: CARTES.filter((c) => c.section === s.id && carteVisible(c)) }))
    .filter((s) => s.cartes.length);
  const total = parSection.reduce((n, s) => n + s.cartes.length, 0);
  // Filtres avec leur nombre de jeux ; sections avec petit titre pixel (« // QUOTIDIENS ») et ancre (#quotidien…) ;
  // classement du jour en colonne à droite sur grand écran, sous les jeux sur téléphone.
  panel.innerHTML = `<div class="jx">
      <div class="jx-outils">
        <div class="jx-filtres" role="group" aria-label="Afficher">
          <button class="jx-filtre" type="button" data-f="" aria-pressed="true">Tous <span class="jx-nb">${nf(total)}</span></button>
          ${parSection.map((s) => `<button class="jx-filtre" type="button" data-f="${s.id}" aria-pressed="false">${esc(s.court)} <span class="jx-nb">${nf(s.cartes.length)}</span></button>`).join('')}
        </div>
        <label class="jx-cherche"><span class="visually-hidden">Rechercher un jeu</span>
          <input type="search" id="jx-q" placeholder="Rechercher un jeu" autocomplete="off"></label>
      </div>
      <div class="jx-corps">
        <div class="jx-main">
      ${parSection.map((s) => {
        // Section entièrement réservée aux admins : ambiance chantier (bandes, panneau) ; sinon seules ses cartes réservées
        const chantier = s.cartes.every(reserveAdmin);
        return `<section class="jx-section${chantier ? ' is-chantier' : ''}" id="${s.id}" data-s="${s.id}" aria-labelledby="jx-h-${s.id}">
          <div class="jx-sh"><div class="jx-sh-t"><span class="jx-code" aria-hidden="true">// ${esc(s.court)}</span>
              <h2 class="jx-h" id="jx-h-${s.id}" tabindex="-1">${esc(s.titre)} <span class="jx-h-nb" data-nb="${s.id}">${nf(s.cartes.length)}</span></h2></div>
            <p class="small muted">${esc(s.texte)}</p>
            ${chantier ? `<p class="jx-chantier">${PANNEAU}<span><strong>Chantier en cours</strong> · visible des admins seulement</span></p>` : ''}</div>
          <ul class="jx-grille" role="list">${s.cartes.map(carteHtml).join('')}</ul>
        </section>`;
      }).join('')}
          <p class="card jx-vide" id="jx-vide" role="status" hidden>Aucun jeu ne correspond à ta recherche.</p>
        </div>
        <div class="jx-classement" id="jx-classement"></div>
      </div>
    </div>`;
  // Classement général des jeux du jour et progression vers le bonus « 16 jeux terminés » (migration 157)
  S.classements.set(TOUS, monterClassement(panel.querySelector('#jx-classement'), null,
    { onData: (d) => { S.notes = d?.moi?.jeux || {}; peindreHub(); } }));
  let filtre = '';
  const appliquer = () => {
    const q = (panel.querySelector('#jx-q').value || '').trim().toLowerCase();
    let n = 0;
    for (const sec of panel.querySelectorAll('.jx-section')) {
      let vis = 0;
      for (const li of sec.querySelectorAll('.jx-carte')) {
        const on = (!filtre || sec.dataset.s === filtre) && (!q || li.dataset.nom.includes(q));
        li.hidden = !on; if (on) vis += 1;
      }
      sec.hidden = !vis; n += vis;
      const nb = sec.querySelector('[data-nb]');
      if (nb) nb.textContent = nf(vis);
    }
    panel.querySelector('#jx-vide').hidden = n > 0;
  };
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('.jx-filtre');
    if (!b) return;
    filtre = b.dataset.f;
    S.filtre = filtre;
    for (const x of panel.querySelectorAll('.jx-filtre')) x.setAttribute('aria-pressed', String(x === b));
    appliquer();
    majReprise();
  });
  panel.querySelector('#jx-q').addEventListener('input', appliquer);
  peindreHub();
}

/**
 * Fait défiler la vue de départ jusqu'à une section (ancre #quotidien, #flash…, menu « Jeux » de l'en-tête) :
 * filtres et recherche remis à zéro pour que la section soit visible, puis focus sur son titre.
 * @param {string} id Identifiant de la section (SECTIONS de catalogue.js).
 */
function allerSection(id) {
  const panel = document.getElementById(`jeux-panel-${TOUS}`);
  const sec = panel?.querySelector(`.jx-section[data-s="${id}"]`);
  if (!sec) return;
  const q = panel.querySelector('#jx-q');
  if (q?.value) q.value = '';
  panel.querySelector('.jx-filtre[data-f=""]')?.click(); // réapplique aussi la recherche vidée
  const calme = document.documentElement.dataset.fx === 'off' || matchMedia('(prefers-reduced-motion: reduce)').matches;
  sec.scrollIntoView({ behavior: calme ? 'auto' : 'smooth', block: 'start' });
  sec.querySelector('.jx-h')?.focus({ preventScroll: true });
}

/* ---------- Chargement d'un jeu ---------- */
/**
 * Monte le panneau d'un onglet (une seule fois). En cas d'échec : l'erreur et un bouton « Réessayer ».
 * @param {object} o Ligne de LISTE.
 * @returns {Promise<void>}
 */
function monter(o) {
  if (S.mods.has(o.id)) return Promise.resolve();
  if (S.loading.has(o.id)) return S.loading.get(o.id);
  const panel = document.getElementById(`jeux-panel-${o.id}`);
  panel.setAttribute('aria-busy', 'true');
  panel.innerHTML = '<p class="card jeux-empty">Chargement…</p>';
  const p = (async () => {
    try {
      if (o.hub) { await monterHub(panel); S.mods.set(o.id, {}); return; }
      if (o.catalogue) { monterCatalogue(panel); S.mods.set(o.id, {}); return; }
      const mod = await importer(o);
      if (typeof mod.mount !== 'function') throw new Error('module de jeu incomplet');
      panel.innerHTML = '';
      // Jeux du jour classés (migration 157) : le jeu se monte dans sa propre zone, le classement en dessous
      // (le jeu peut redessiner sa zone sans effacer le classement).
      const cle = CLE_JEU[o.id];
      let zone = panel;
      if (cle) {
        zone = document.createElement('div');
        zone.className = 'jeux-zone';
        const classement = document.createElement('div');
        classement.className = 'jeux-classement';
        panel.append(zone, classement);
        S.classements.set(o.id, monterClassement(classement, cle));
      }
      await mod.mount(zone, CTX);
      S.mods.set(o.id, mod);
    } catch (e) {
      console.warn('[jeux]', o.id, e);
      panel.innerHTML = `<div class="card jeux-error" role="alert"><p><strong>Ce jeu n’a pas pu se charger.</strong></p>
        <p class="small muted">${esc(e?.message || String(e))}</p>
        <button class="btn btn-ghost" type="button" data-jeux-retry>Réessayer</button></div>`;
      panel.querySelector('[data-jeux-retry]').addEventListener('click', () => { if (S.cur === o.id) monter(o); }, { once: true });
    } finally {
      panel.removeAttribute('aria-busy');
      S.loading.delete(o.id);
    }
  })();
  S.loading.set(o.id, p);
  return p;
}

/* ---------- Sélection d'un onglet ---------- */
/**
 * Affiche un onglet : état ARIA, panneau visible, adresse et mémoire à jour, module chargé si besoin.
 * @param {string} id Identifiant de l'onglet.
 * @param {{focus?: boolean, adresse?: boolean, sub?: string|null, section?: string}} [opts] focus : donne le focus à l'onglet ; adresse : met #id dans l'URL ;
 *   sub : choix propre au jeu (ctx.sub) ; s'il est fourni, le module déjà monté est prévenu par « jeux:sub » ;
 *   section : section de la vue de départ où défiler (ancre #quotidien…).
 */
function choisir(id, { focus = false, adresse = true, sub = undefined, section = null } = {}) {
  const o = LISTE.find((x) => x.id === id) || LISTE[0];
  const avant = S.cur;
  S.cur = o.id;
  CTX.sub = sub ?? null;
  for (const t of tablist.querySelectorAll('[role="tab"]')) {
    const on = t.dataset.id === o.id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) {
      if (focus) t.focus({ preventScroll: true });
      // Onglet visible dans la barre (défilement horizontal de la barre seulement, jamais de la page)
      if (tablist.scrollWidth > tablist.clientWidth) {
        const l = t.offsetLeft - tablist.offsetLeft, r = l + t.offsetWidth;
        if (l < tablist.scrollLeft) tablist.scrollLeft = l - 16;
        else if (r > tablist.scrollLeft + tablist.clientWidth) tablist.scrollLeft = r - tablist.clientWidth + 48;
      }
    }
  }
  for (const p of panels.querySelectorAll('[role="tabpanel"]')) p.hidden = p.dataset.id !== o.id;
  majReprise();
  if (o.catalogue && avant !== o.id) { reprise.relire(); direct.relire(); } // à l'arrivée sur la vue de départ, jamais depuis un jeu ouvert directement
  if (adresse && lireAdresse().id !== o.id) history.replaceState(null, '', `#${o.id}`);
  document.title = `${o.catalogue ? 'Jeux' : `${o.titre} · Jeux`} · Humane Gang`;
  if (retour) retour.hidden = !!o.catalogue;
  // Retour au tableau de bord ou aux cartes : les états ont pu changer (jeu joué entre-temps)
  if ((o.hub || o.catalogue) && avant && avant !== o.id && S.mods.has(o.id)) rafraichirHub();
  // Le panneau est prévenu à chaque affichage (une carte cachée doit recalculer sa taille)
  monter(o).then(() => {
    // Jeu classé : le module écoute sa zone (.jeux-zone), pas le panneau ; le classement est relu à chaque affichage.
    const panneau = document.getElementById(`jeux-panel-${o.id}`)?.querySelector(':scope > .jeux-zone') || document.getElementById(`jeux-panel-${o.id}`);
    panneau?.dispatchEvent(new CustomEvent('jeux:show'));
    if (sub !== undefined) panneau?.dispatchEvent(new CustomEvent('jeux:sub', { detail: { sub: CTX.sub } }));
    if (avant !== o.id) S.classements.get(o.id)?.rafraichir();
    if (section && o.catalogue) allerSection(section);
  });
}

/* ---------- Clavier et clics ---------- */
tablist.addEventListener('click', (e) => {
  const t = e.target.closest('[role="tab"]');
  if (t) choisir(t.dataset.id);
});
tablist.addEventListener('keydown', (e) => {
  const tabs = [...tablist.querySelectorAll('[role="tab"]')];
  const i = tabs.findIndex((t) => t.dataset.id === S.cur);
  let j = null;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = tabs.length - 1;
  if (j === null) return;
  e.preventDefault();
  choisir(tabs[j].dataset.id, { focus: true });
});
// Lien direct ou retour arrière vers /pages/jeux/jeux.html#<id> ou /pages/jeux/jeux.html#<id>-<choix>
window.addEventListener('hashchange', () => { const a = lireAdresse(); if (a.id) choisir(a.id, { adresse: false, sub: a.sub, section: a.section }); });
// En quittant la page : chaque module chargé peut libérer ses ressources (minuteurs, abonnements…)
window.addEventListener('pagehide', () => { for (const m of S.mods.values()) { try { m.unmount?.(); } catch { /* sans importance */ } } });
// Retour arrière depuis une table : la page revient telle quelle, mais la partie a pu finir.
window.addEventListener('pageshow', (e) => { if (e.persisted && S.cur === TOUS) reprise.relire(); });

/* ---------- Démarrage ---------- */
construire();
const depart = lireAdresse();
// Sans adresse : la vue de départ (tous les jeux), et non plus le dernier jeu ouvert
choisir(depart.id || TOUS, { sub: depart.sub, adresse: !!depart.id, section: depart.section });
// Les états des jeux (« Fait »…) et les gains du jour sont utiles même sans ouvrir le tableau de bord
if (S.cur !== HUB) rafraichirHub();
app.setAttribute('aria-busy', 'false');
