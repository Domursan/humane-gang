// ===== Humane Gang — Catan du gang : la table de jeu (plateaux/jeux/catan/table.js) =====
/*
 * Rôle : affiche une partie de Catan du gang (version simplifiée) : bandeau, plateau SVG (plateau.js), panneau d'action
 *   selon la phase (placement, lancer, voleur, action), dés, « Comment on joue », « Ce que ça coûte », ta main,
 *   points de chacun, journal, chat (à droite sur ordinateur, en tiroir sur téléphone).
 *   Seuls les emplacements permis sont cliquables sur le plateau (sommets, arêtes, tuiles) : calculés ici, avec les
 *   mêmes règles que le serveur. Tout se fait au clavier (Entrée ou Espace ; Échap annule un mode).
 *   La mise en page est dans assets/espaces/plateaux/catan.css ; ici, le contenu et les actions.
 * Dépendances : commun/tour-signal.js (creerSignalTour), core.js (esc, toast), ../../api.js (plat, erreurTexte), ../../vues/commun.js (bandeauHtml, brancherChrono,
 *   journalHtml, envoyer, moiJoueur, estMonTour, joueurDe), ../../vues/chat.js (creerChat, tiroirChat), ./plateau.js,
 *   ./effets.js (changements, jouerEffets : dés, production, ressources, constructions, voleur, « à toi »),
 *   commun/effets-duels.js (anime), ../../vues/fin-fx.js (effetsFinPlateau, fxFin, issuePlateau), ./fin.js (finFx).
 *   Fin de partie (CT1) : avantFin garde le plateau du gagnant le temps que les tuiles s'allument l'une après l'autre.
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire(), avantFin(etat) }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 *   etat.jeu = forme de hg_plat__catan_vue (geo, tuiles, voleur, colonies, villes, routes, phase, sous, dernier, de,
 *   objectif, mes_ressources, couts) ; etat.partie.tour = joueur dont c'est le tour.
 */
import { esc, toast } from '../../../../commun/core.js';
import { plat, erreurTexte } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, envoyer, moiJoueur, estMonTour, joueurDe, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { plateauSvg, RESSOURCES, nomTuile } from './plateau.js';
import { changements, jouerEffets } from './effets.js';
import { anime } from '../../../../commun/effets-duels.js';
import { effetsFinPlateau, fxFin, issuePlateau } from '../../vues/fin-fx.js';
import { finFx } from './fin.js';
import { voisinSpatial } from '../../../../commun/grille-clavier.js';

const ECRAN_GRAND = '(min-width: 761px)';
const RES = ['bois', 'argile', 'ble', 'mouton', 'pierre'];
/** Plafonds du moteur (migration 144) : routes, colonies, villes par joueur. */
const LIMITES = { route: 15, colonie: 5, ville: 4 };
/** Coûts de repli si le serveur n'en envoie pas (mêmes valeurs que hg_plat__catan_vue). */
const COUTS_DEFAUT = { route: { bois: 1, argile: 1 }, colonie: { bois: 1, argile: 1, ble: 1, mouton: 1 }, ville: { ble: 2, pierre: 3 } };
const LIBELLE_COUT = { route: 'Route', colonie: 'Colonie (1 point)', ville: 'Ville (2 points, sur une colonie)' };
const AIDE_MODE = {
  route: 'Touche une route mise en valeur sur le plateau. Elle doit partir d\'une de tes colonies ou routes.',
  colonie: 'Touche un sommet mis en valeur pour y poser une colonie. Deux colonies doivent être séparées d\'au moins deux arêtes.',
  ville: 'Touche une de tes colonies pour la transformer en ville.',
};
const PHASE_TAG = { placement: 'Mise en place', lancer: 'Production', voleur: 'Le voleur bouge', action: 'Construire et échanger' };
const COULEUR = /^#[0-9a-f]{6}$/i;
const PAS_TUILE_FIN = 110;      // ms entre deux tuiles qui s'allument à la fin de la partie (CT1)
const DUREE_TUILE_FIN = 800;    // ms : allumage d'une tuile (catan.css, .ct-tuile-fin)

/** Pastille colorée d'une ressource : « 2 bois » ; la couleur reprend celle de la tuile. */
const pastille = (r, n) => {
  const c = RESSOURCES[r] || RESSOURCES.desert;
  return `<span class="ct-pastille" style="background:${esc(c.couleur)};color:${esc(c.texte)}">${esc(n)} ${esc(c.nom)}</span>`;
};
/** Pastilles d'un coût : une par ressource. */
const coutHtml = (cout) => Object.entries(cout || {}).map(([r, n]) => pastille(r, n)).join(' ');
/** Couleur de profil sûre (sinon crème). */
const couleurDe = (j) => (COULEUR.test(j?.couleur || '') && !j?.invite ? j.couleur : '#F2EFEA');
/** Titre de panneau (échappé ici). */
const titre = (t) => `<h2 id="ct-tour-titre" class="ct-titre" tabindex="-1">${esc(t)}</h2>`;

/**
 * Garde le focus sur l'élément équivalent après une reconstruction de zone (même attributs data-*).
 * @param {HTMLElement} zone zone reconstruite.
 * @param {Function} rendu fonction qui réécrit la zone.
 */
function gardeFocus(zone, rendu) {
  const a = document.activeElement;
  const garde = a && zone.contains(a) ? [...a.attributes].filter((x) => x.name.startsWith('data-')) : [];
  rendu();
  if (!garde.length) return;
  const sel = garde.map((x) => `[${x.name}="${CSS.escape(x.value)}"]`).join('');
  zone.querySelector(sel)?.focus({ preventScroll: true });
}

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="ct-bandeau" data-bandeau></header>
  <div class="ct-barre" role="toolbar" aria-label="Actions de la partie">
    <span class="ct-code small muted" data-code></span>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <div class="ct-corps">
    <div class="ct-colonne-jeu">
      <section class="ct-bloc ct-zone-plateau" aria-labelledby="ct-plateau-titre">
        <div class="ct-plateau-tete"><h2 id="ct-plateau-titre" class="ct-bloc-titre">Plateau</h2><span class="ct-tag" data-tag></span></div>
        <div class="ct-plateau" data-plateau></div>
      </section>
      <section class="ct-panneau" aria-labelledby="ct-tour-titre" aria-live="polite" data-panneau></section>
    </div>
    <aside class="ct-colonne-cote" aria-label="Règles, coûts, main, points et journal">
      <section class="ct-bloc" aria-labelledby="ct-regles-titre">
        <h2 id="ct-regles-titre" class="ct-bloc-titre">Comment on joue</h2>
        <ol class="ct-etapes">
          <li><strong>Lancer les dés.</strong> Le total désigne les tuiles qui produisent.</li>
          <li><strong>Produire.</strong> Une colonie touchant une tuile gagne une ressource, une ville en gagne deux. Sur un 7, le voleur bouge : ceux qui ont plus de 7 cartes en défaussent la moitié.</li>
          <li><strong>Construire ou échanger.</strong> Route, colonie, ville, ou échange 4 contre 1 avec la banque. Puis finir le tour.</li>
          <li><strong>Atteindre l'objectif.</strong> Le premier à 10 points gagne (8 si la partie est réglée ainsi).</li>
        </ol>
      </section>
      <section class="ct-bloc" aria-labelledby="ct-couts-titre">
        <h2 id="ct-couts-titre" class="ct-bloc-titre">Ce que ça coûte</h2>
        <dl class="ct-couts" data-couts></dl>
      </section>
      <section class="ct-bloc" aria-labelledby="ct-main-titre" data-main></section>
      <section class="ct-bloc" aria-labelledby="ct-points-titre" data-points></section>
      <section class="ct-bloc" aria-labelledby="ct-journal-titre">
        <h2 id="ct-journal-titre" class="ct-bloc-titre">Journal</h2>
        <div data-journal></div>
      </section>
      <div class="ct-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="ct-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de Catan du gang dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const grand = window.matchMedia(ECRAN_GRAND);

  const el = document.createElement('section');
  el.className = 'ct-table';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), code: q('[data-code]'), quitter: q('[data-quitter]'), plateau: q('[data-plateau]'),
    tag: q('[data-tag]'), panneau: q('[data-panneau]'), couts: q('[data-couts]'), main: q('[data-main]'),
    points: q('[data-points]'), journal: q('[data-journal]'), chatZone: q('[data-chat]'),
    tiroirChatZone: q('[data-tiroir-chat]'), annonce: q('[data-annonce]'),
  };
  refs.code.textContent = `Code ${code}`;

  let etat = null;
  let occupe = false;                 // un envoi est en cours
  let finie = false;                  // état final reçu : la table reste à l'écran, plus d'action ni de rendu forcé (jamais remis à faux)
  let arretChrono = null;
  let mode = null;                    // 'route' | 'colonie' | 'ville' : construction choisie (phase action)
  let choixVoleur = null;             // { hexe, victimes: [uid] } : tuile choisie, reste à choisir la personne volée
  let echange = { donne: 'bois', recoit: 'ble' };
  let dernierTour = null;
  const cles = {};                    // dernier rendu de chaque zone (évite de tout reconstruire)
  /* Géométrie du plateau, indexée par identifiant (reconstruite à chaque état). */
  let geo = { hexes: [], sommets: [], aretes: [] };
  let S = new Map();
  let H = new Map();

  /* ---------- Chat : colonne (ordinateur) ou tiroir (téléphone) ---------- */

  let chat = null;
  const messagesVus = [];
  function monterChat() {
    chat?.detruire();
    refs.chatZone.innerHTML = '';
    refs.tiroirChatZone.innerHTML = '';
    chat = grand.matches
      ? creerChat(refs.chatZone, { code, moi: ctx.moi })
      : tiroirChat(refs.tiroirChatZone, { code, moi: ctx.moi });
    messagesVus.forEach((m) => chat.message(m));
    if (etat) chat.maj(etat);
  }
  monterChat();
  const surEcran = () => monterChat();
  grand.addEventListener('change', surEcran);

  /* ---------- Lectures ---------- */

  const monId = () => etat?.moi?.user_id ?? null;
  const jeu = () => etat?.jeu || {};
  const phase = () => jeu().phase;
  /** Mon tour dans un état donné (sert à repérer le passage « à toi »). */
  const monTourDe = (x) => !!x?.moi?.user_id && estMonTour(x) && x?.partie?.statut === 'en_cours';
  const monTour = () => monTourDe(etat);
  const peutAgir = () => !finie && monTour() && !occupe && !moiJoueur(etat)?.parti;
  const estMoi = (uid) => uid != null && String(uid) === String(monId());
  const pseudoDe = (uid) => (uid == null ? '' : (joueurDe(etat, uid)?.pseudo || '?'));
  const mesRes = () => jeu().mes_ressources || {};
  const couts = () => jeu().couts || COUTS_DEFAUT;
  const objectif = () => Number(jeu().objectif) || 10;
  const tuile = (id) => jeu().tuiles?.[id] || { res: 'desert', num: null };
  /** Bâtiment posé sur un sommet (uid du joueur), ou null. */
  const occupant = (v) => jeu().colonies?.[v] ?? jeu().villes?.[v] ?? null;
  /** Nombre d'éléments à moi dans une table (routes, colonies, villes). */
  const compte = (table) => Object.values(table || {}).filter(estMoi).length;
  /** Sommet libre, sans voisin occupé (règle de distance). */
  const libreDistance = (v) => occupant(v) == null && (S.get(v)?.voisins || []).every((w) => occupant(w) == null);
  const des = () => (Array.isArray(jeu().de) && jeu().de.length === 2 ? jeu().de : ['?', '?']);

  /** Reconstruit les index du plateau à partir du plan reçu. */
  function indexer() {
    const g = jeu().geo;
    geo = { hexes: g?.hexes || [], sommets: g?.sommets || [], aretes: g?.aretes || [] };
    S = new Map(geo.sommets.map((s) => [s.id, s]));
    H = new Map(geo.hexes.map((h) => [h.id, h]));
  }

  /** Sommets où je peux poser une colonie (en mise en place, sans lien ; sinon relié à une de mes routes). */
  function sommetsColonie(placement) {
    return geo.sommets.filter((s) => libreDistance(s.id) && (placement || s.aretes.some((a) => estMoi(jeu().routes?.[a]))))
      .map((s) => s.id);
  }
  /** Mes colonies (à transformer en villes). */
  const sommetsVille = () => Object.entries(jeu().colonies || {}).filter(([, u]) => estMoi(u)).map(([v]) => Number(v));
  /** Arête libre : en mise en place, qui part de la dernière colonie ; sinon reliée à mon réseau. */
  function aretesRoute(placement) {
    if (placement) {
      const d = jeu().dernier;
      if (d == null) return [];
      return (S.get(d)?.aretes || []).filter((a) => jeu().routes?.[a] == null);
    }
    return geo.aretes.filter((ar) => {
      if (jeu().routes?.[ar.id] != null) return false;
      return [ar.a, ar.b].some((x) => estMoi(jeu().colonies?.[x]) || estMoi(jeu().villes?.[x]) ||
        (occupant(x) == null && (S.get(x)?.aretes || []).some((b) => estMoi(jeu().routes?.[b]))));
    }).map((ar) => ar.id);
  }
  /** Joueurs à qui je peux voler sur une tuile (ils ont des bâtiments dessus et au moins une carte). */
  function victimesDe(h) {
    const uids = [];
    (H.get(h)?.sommets || []).forEach((v) => {
      const u = occupant(v);
      if (u == null || estMoi(u) || uids.includes(u)) return;
      if ((Number(joueurDe(etat, u)?.etat?.cartes) || 0) > 0) uids.push(u);
    });
    return uids;
  }
  /** Ce que je peux toucher sur le plateau maintenant (rien hors de mon tour). */
  function cibles() {
    const vide = { sommets: [], aretes: [], hexes: [] };
    if (!peutAgir() || !geo.hexes.length) return vide;
    const p = phase();
    if (p === 'placement') {
      return jeu().sous === 'route' ? { ...vide, aretes: aretesRoute(true) } : { ...vide, sommets: sommetsColonie(true) };
    }
    if (p === 'voleur') {
      return choixVoleur ? vide : { ...vide, hexes: geo.hexes.map((h) => h.id).filter((id) => id !== jeu().voleur) };
    }
    if (p === 'action') {
      if (mode === 'route') return { ...vide, aretes: aretesRoute(false) };
      if (mode === 'colonie') return { ...vide, sommets: sommetsColonie(false) };
      if (mode === 'ville') return { ...vide, sommets: sommetsVille() };
    }
    return vide;
  }
  /** Constructions possibles maintenant : ressources, plafond et emplacement libre. */
  function dispo() {
    const r = mesRes();
    const payable = (k) => Object.entries(couts()[k] || {}).every(([x, n]) => (Number(r[x]) || 0) >= n);
    return {
      route: payable('route') && compte(jeu().routes) < LIMITES.route && aretesRoute(false).length > 0,
      colonie: payable('colonie') && compte(jeu().colonies) < LIMITES.colonie && sommetsColonie(false).length > 0,
      ville: payable('ville') && compte(jeu().villes) < LIMITES.ville && sommetsVille().length > 0,
    };
  }
  const echangeOk = () => echange.donne !== echange.recoit && (Number(mesRes()[echange.donne]) || 0) >= 4;
  const aideEchange = () => {
    const nom = (r) => RESSOURCES[r]?.nom || r;
    if (echange.donne === echange.recoit) return 'Choisis deux ressources différentes.';
    const n = Number(mesRes()[echange.donne]) || 0;
    if (n < 4) return `Il te faut 4 ${nom(echange.donne)} (tu en as ${n}).`;
    return `Tu donnes 4 ${nom(echange.donne)} et reçois 1 ${nom(echange.recoit)}.`;
  };

  /* ---------- Rendu : bandeau, coûts, plateau ---------- */

  function rendreBandeau() {
    const html = bandeauHtml(etat, { titre: 'Catan du gang' });
    if (cles.bandeau === html) return;
    cles.bandeau = html;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  function rendreCouts() {
    const c = couts();
    const html = Object.keys(LIBELLE_COUT).map((k) => `<div class="ct-cout-ligne"><dt>${esc(LIBELLE_COUT[k])}</dt><dd>${coutHtml(c[k])}</dd></div>`).join('');
    if (cles.couts === html) return;
    cles.couts = html;
    refs.couts.innerHTML = html;
  }

  function rendrePlateau(force = false) {
    if (finie) return;                // les tuiles qui s'allument restent en place
    const j = jeu();
    const html = plateauSvg({
      geo: j.geo, tuiles: j.tuiles, voleur: j.voleur, colonies: j.colonies || {}, villes: j.villes || {}, routes: j.routes || {},
      couleurs: Object.fromEntries((etat?.joueurs || []).map((x) => [x.user_id, x.couleur])), dernier: j.dernier ?? null, cibles: cibles(),
    });
    if (!force && cles.plateau === html) return;
    cles.plateau = html;
    gardeFocus(refs.plateau, () => { refs.plateau.innerHTML = html; });
  }

  function rendreTag() {
    const t = PHASE_TAG[phase()] || '';
    refs.tag.textContent = `Tour n° ${etat.partie?.nb_tours ?? 0}${t ? ` · ${t}` : ''}`;
  }

  /* ---------- Rendu : dés, panneau d'action ---------- */

  /** Dés et dernier lancer (visibles par tous). */
  function blocDes() {
    const d = des();
    const lance = Number.isFinite(d[0]) && Number.isFinite(d[1]);
    return `<div class="ct-des-zone">
      <div class="ct-des" aria-hidden="true"><span class="ct-de">${esc(d[0])}</span><span class="ct-de">${esc(d[1])}</span></div>
      <p class="ct-note">${lance ? `Dernier lancer : ${esc(d[0])} + ${esc(d[1])} = ${esc(d[0] + d[1])}.` : 'Pas encore de lancer.'}</p>
    </div>`;
  }

  function vuePlacement() {
    if (jeu().sous === 'route') {
      return `${titre('Pose ta route')}<p>Touche une route qui part de la colonie que tu viens de poser.</p>`;
    }
    return `${titre('Pose ta colonie')}<p>Touche un sommet mis en valeur. Deux colonies doivent être séparées d'au moins deux arêtes.</p>`;
  }

  function vueLancer() {
    return `${titre('Ton tour')}<p>Lance les dés : le total désigne les tuiles qui produisent.</p>
      ${blocDes()}
      <div class="ct-pied"><button type="button" class="ct-btn ct-btn-primary ct-grand" data-lancer${occupe ? ' disabled' : ''}>Lancer les dés</button></div>`;
  }

  function vueVoleur() {
    if (choixVoleur) {
      const items = choixVoleur.victimes.map((u) => {
        const n = Number(joueurDe(etat, u)?.etat?.cartes) || 0;
        return `<button type="button" class="ct-btn ct-carte-choix" data-cible="${esc(u)}"><strong style="color:${esc(couleurDe(joueurDe(etat, u)))}">${esc(pseudoDe(u))}</strong><span>${n} carte${n > 1 ? 's' : ''}</span></button>`;
      }).join('');
      return `${titre('Qui voles-tu ?')}
        <p>Le voleur est sur ${esc(nomTuile(tuile(choixVoleur.hexe)))}. Tu prends une carte au hasard à la personne choisie.</p>
        <div class="ct-choix" role="group" aria-label="Personnes à qui voler une carte">${items}</div>
        <div class="ct-pied"><button type="button" class="ct-btn ct-btn-ghost" data-annuler-voleur>Annuler</button></div>`;
    }
    return `${titre('Déplace le voleur')}
      <p>Touche une tuile mise en valeur. Elle ne produit plus tant que le voleur y est.</p>
      ${blocDes()}`;
  }

  function vueAction() {
    const d = dispo();
    const bouton = (m, libelle) => `<button type="button" class="ct-btn" data-mode="${m}" aria-pressed="${mode === m}"${d[m] ? '' : ' disabled'}>${esc(libelle)}</button>`;
    const bandeau = mode
      ? `<p class="ct-mode" role="status"><span>${esc(AIDE_MODE[mode])}</span> <button type="button" class="ct-btn ct-btn-ghost ct-petit" data-annuler-mode>Annuler</button></p>`
      : '';
    const ops = (val) => RES.map((r) => `<option value="${r}"${r === val ? ' selected' : ''}>${esc(RESSOURCES[r].nom)}</option>`).join('');
    return `${titre('Construire, échanger ou finir')}
      ${bandeau}
      <div class="ct-actions" role="group" aria-label="Construire">
        ${bouton('route', 'Construire une route')}
        ${bouton('colonie', 'Construire une colonie')}
        ${bouton('ville', 'Transformer une colonie en ville')}
      </div>
      <p class="ct-note">Un bouton grisé : ressources insuffisantes, plafond atteint ou aucun emplacement libre.</p>
      <form class="ct-form-echange" data-form-echange>
        <fieldset class="ct-fieldset">
          <legend>Échanger avec la banque : 4 contre 1</legend>
          <div class="ct-champs">
            <label class="ct-label">Je donne (4)<select name="donne" aria-describedby="ct-echange-aide">${ops(echange.donne)}</select></label>
            <label class="ct-label">Je reçois (1)<select name="recoit" aria-describedby="ct-echange-aide">${ops(echange.recoit)}</select></label>
          </div>
          <p class="ct-note" id="ct-echange-aide">${esc(aideEchange())}</p>
          <div class="ct-pied"><button type="submit" class="ct-btn"${echangeOk() ? '' : ' disabled'}>Échanger</button></div>
        </fieldset>
      </form>
      <div class="ct-pied"><button type="button" class="ct-btn ct-btn-primary" data-finir${occupe ? ' disabled' : ''}>Finir le tour</button></div>`;
  }

  /** Contenu du panneau selon la phase et mon rôle. */
  function contenuPanneau() {
    if (!monId()) return `${titre('La partie continue')}<p>${esc(pseudoDe(etat.partie?.tour))} joue.</p>${blocDes()}`;
    if (etat.partie?.statut !== 'en_cours') return titre('Partie terminée');
    if (!monTour()) {
      return `${titre(`C'est à ${pseudoDe(etat.partie?.tour)} de jouer`)}<p>Tu peux suivre le plateau et le journal.</p>${phase() === 'placement' ? '' : blocDes()}`;
    }
    switch (phase()) {
      case 'placement': return vuePlacement();
      case 'lancer': return vueLancer();
      case 'voleur': return vueVoleur();
      case 'action': return vueAction();
      default: return `${titre('Ton tour')}<p>Attends la suite de la partie.</p>`;
    }
  }

  /** Redessine le panneau si son contenu a changé (pas pendant un envoi, sauf forcé). */
  function rendrePanneau(force = false) {
    if (finie || (occupe && !force)) return;
    const html = contenuPanneau();
    if (!force && cles.panneau === html) return;
    cles.panneau = html;
    gardeFocus(refs.panneau, () => { refs.panneau.innerHTML = html; });
  }

  /** Met à jour l'aide et le bouton d'échange sans reconstruire le formulaire (la saisie reste en place). */
  function majEchange() {
    const f = refs.panneau.querySelector('[data-form-echange]');
    if (!f) return;
    f.querySelector('#ct-echange-aide').textContent = aideEchange();
    f.querySelector('button[type=submit]').disabled = !echangeOk() || occupe;
    cles.panneau = contenuPanneau();
  }

  /* ---------- Rendu : ma main, points, journal ---------- */

  function rendreMain() {
    const r = mesRes();
    const html = `<h2 id="ct-main-titre" class="ct-bloc-titre">Ta main</h2>` + (monId()
      ? `<ul class="ct-main">${RES.map((k) => `<li>${pastille(k, Number(r[k]) || 0)}</li>`).join('')}</ul>`
      : '<p class="ct-note">Tu ne joues pas dans cette partie.</p>');
    if (cles.main === html) return;
    cles.main = html;
    refs.main.innerHTML = html;
  }

  function rendrePoints() {
    const obj = objectif();
    const liste = (etat.joueurs || []).filter((j) => !j.parti)
      .map((j) => ({ j, p: Number(j.etat?.points) || 0 }))
      .sort((a, b) => b.p - a.p);
    const lignes = liste.map(({ j, p }) => {
      const e = j.etat || {};
      const moi = estMoi(j.user_id) ? ' (toi)' : '';
      const tag = j.invite ? ' <span class="ct-invite">invité</span>' : '';
      return `<li class="ct-point-ligne">
        <div class="ct-point-tete"><strong style="color:${esc(couleurDe(j))}">${esc(j.pseudo || '?')}${tag}${esc(moi)}</strong><span>${esc(p)} / ${esc(obj)}</span></div>
        <progress class="ct-barre-pts" max="${esc(obj)}" value="${esc(p)}" aria-label="${esc(`Progression de ${j.pseudo || '?'} vers ${obj} points`)}">${esc(p)}</progress>
        <p class="ct-note">${esc(e.colonies || 0)} colonie${(e.colonies || 0) > 1 ? 's' : ''} · ${esc(e.villes || 0)} ville${(e.villes || 0) > 1 ? 's' : ''} · ${esc(e.routes || 0)} route${(e.routes || 0) > 1 ? 's' : ''} · ${esc(e.cartes || 0)} carte${(e.cartes || 0) > 1 ? 's' : ''} en main</p>
      </li>`;
    }).join('');
    const html = `<h2 id="ct-points-titre" class="ct-bloc-titre">Points · objectif ${esc(obj)}</h2>
      <ol class="ct-points">${lignes || '<li class="ct-note">Pas encore de joueurs.</li>'}</ol>`;
    if (cles.points === html) return;
    cles.points = html;
    refs.points.innerHTML = html;
  }

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  /* ---------- Actions ---------- */

  /**
   * Envoie une action de jeu : un seul envoi à la fois. Une fois la réponse reçue, le mode est refermé (si l'action
   * a réussi) et la table est reconstruite.
   * @param {HTMLElement|null} bouton bouton désactivé pendant l'envoi (ou null pour un clic sur le plateau).
   * @param {string} action nom de l'action serveur (colonie, route, ville, lancer, voleur, echanger, finir).
   * @param {object} args arguments de l'action.
   * @param {Function|null} apres appelé à la fin de l'envoi (arrête l'animation des dés).
   */
  function agir(bouton, action, args = {}, apres = null) {
    if (occupe || finie) return;
    occupe = true;
    envoyer(bouton, () => plat.agir(code, action, args), suivi).then((ok) => {
      occupe = false;
      apres?.();
      if (ok) { mode = null; choixVoleur = null; }
      rendrePlateau(true);
      rendrePanneau(true);
    });
  }

  /** Fait défiler des faces au hasard pendant le lancer (rien si la préférence « mouvement réduit » est active). */
  function animerDes() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return null;
    const t = setInterval(() => {
      refs.panneau.querySelectorAll('.ct-de').forEach((d) => { d.textContent = String(1 + Math.floor(Math.random() * 6)); });
    }, 90);
    refs.panneau.querySelector('.ct-des')?.classList.add('is-roule');
    return () => {
      clearInterval(t);
      refs.panneau.querySelector('.ct-des')?.classList.remove('is-roule');
    };
  }

  /** Clics du panneau d'action (un bouton = une intention envoyée au serveur). */
  function surPanneau(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.hasAttribute('data-lancer')) {
      if (!peutAgir()) return;
      return agir(b, 'lancer', {}, animerDes());
    }
    if (b.hasAttribute('data-mode')) {
      mode = mode === b.dataset.mode ? null : b.dataset.mode;
      choixVoleur = null;
      rendrePlateau(true);
      return rendrePanneau(true);
    }
    if (b.hasAttribute('data-annuler-mode')) { mode = null; rendrePlateau(true); return rendrePanneau(true); }
    if (b.hasAttribute('data-finir')) return agir(b, 'finir');
    if (b.hasAttribute('data-annuler-voleur')) { choixVoleur = null; rendrePlateau(true); return rendrePanneau(true); }
    if (b.hasAttribute('data-cible') && choixVoleur) {
      return agir(b, 'voleur', { hexe: choixVoleur.hexe, cible: b.dataset.cible });
    }
  }

  /** Validation de l'échange 4 contre 1. */
  function surSubmit(ev) {
    const f = ev.target;
    if (!f.hasAttribute?.('data-form-echange')) return;
    ev.preventDefault();
    if (occupe || !echangeOk()) return;
    agir(ev.submitter || f.querySelector('button[type=submit]'), 'echanger', { donne: echange.donne, recoit: echange.recoit });
  }

  /** Choix dans les listes de l'échange : on garde la saisie, on met à jour l'aide. */
  function surChangement(ev) {
    const s = ev.target;
    if (!(s.name in echange)) return;
    echange[s.name] = s.value;
    majEchange();
  }

  /** Clic sur le plateau : sommet, arête ou tuile selon la phase et le mode. */
  function cliquerPlateau(cible) {
    if (!peutAgir()) return;
    if (cible.dataset.sommet !== undefined) {
      const v = Number(cible.dataset.sommet);
      if (phase() === 'placement' && jeu().sous === 'colonie') return agir(null, 'colonie', { sommet: v });
      if (phase() === 'action' && mode === 'colonie') return agir(null, 'colonie', { sommet: v });
      if (phase() === 'action' && mode === 'ville') return agir(null, 'ville', { sommet: v });
      return undefined;
    }
    if (cible.dataset.arete !== undefined) {
      const a = Number(cible.dataset.arete);
      if ((phase() === 'placement' && jeu().sous === 'route') || (phase() === 'action' && mode === 'route')) {
        return agir(null, 'route', { arete: a });
      }
      return undefined;
    }
    if (cible.dataset.hexe !== undefined && phase() === 'voleur' && !choixVoleur) {
      const h = Number(cible.dataset.hexe);
      const victimes = victimesDe(h);
      if (victimes.length > 1) {
        choixVoleur = { hexe: h, victimes };
        rendrePlateau(true);
        rendrePanneau(true);
        refs.panneau.querySelector('[data-cible]')?.focus({ preventScroll: true });
        return undefined;
      }
      return agir(null, 'voleur', { hexe: h });
    }
    return undefined;
  }

  /**
   * Cible la plus proche du pointeur, parmi les sommets (ou les arêtes) : les zones de clic voisines se recouvrent.
   * Coordonnées du pointeur ramenées dans le repère du plateau (unités du viewBox).
   */
  function laPlusProche(ev, cible) {
    const genre = cible.dataset.sommet !== undefined ? 'sommet' : cible.dataset.arete !== undefined ? 'arete' : null;
    const svg = refs.plateau.querySelector('svg');
    const ctm = svg?.getScreenCTM?.();
    if (!genre || !ctm || !Number.isFinite(ev.clientX)) return cible;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const u = pt.matrixTransform(ctm.inverse());
    /** Distance du pointeur à la cible (au point pour un sommet, au segment pour une arête). */
    const distance = (g) => {
      const z = g.querySelector('.ct-zone');
      if (genre === 'sommet') return Math.hypot(Number(z.getAttribute('cx')) - u.x, Number(z.getAttribute('cy')) - u.y);
      const x1 = Number(z.getAttribute('x1'));
      const y1 = Number(z.getAttribute('y1'));
      const dx = Number(z.getAttribute('x2')) - x1;
      const dy = Number(z.getAttribute('y2')) - y1;
      const t = Math.max(0, Math.min(1, ((u.x - x1) * dx + (u.y - y1) * dy) / ((dx * dx + dy * dy) || 1)));
      return Math.hypot(u.x - (x1 + t * dx), u.y - (y1 + t * dy));
    };
    let meilleur = cible;
    let dmin = Infinity;
    refs.plateau.querySelectorAll(`[data-${genre === 'sommet' ? 'sommet' : 'arete'}]`).forEach((g) => {
      const d = distance(g);
      if (d < dmin) { dmin = d; meilleur = g; }
    });
    return meilleur;
  }

  function surPlateau(ev) {
    const trouve = ev.target.closest?.('[data-sommet],[data-arete],[data-hexe]');
    if (!trouve || !refs.plateau.contains(trouve)) return;
    cliquerPlateau(laPlusProche(ev, trouve));
  }

  /** Entrée ou Espace sur un élément du plateau ; Échap annule le mode en cours. */
  function surClavier(ev) {
    if (ev.key === 'Escape' && (mode || choixVoleur)) {
      mode = null;
      choixVoleur = null;
      rendrePlateau(true);
      rendrePanneau(true);
      return;
    }
    const cible = ev.target.closest?.('[data-sommet],[data-arete],[data-hexe]');
    if ((ev.key === 'Enter' || ev.key === ' ') && cible && refs.plateau.contains(cible)) {
      ev.preventDefault();
      cliquerPlateau(cible);
      return;
    }
    // Flèches : la cible cliquable la plus proche dans la direction (sommets, routes et tuiles mêlés).
    if (ev.key.startsWith('Arrow') && cible && refs.plateau.contains(cible)) {
      const voisine = voisinSpatial(ev.key, cible, [...refs.plateau.querySelectorAll('[data-sommet],[data-arete],[data-hexe]')]);
      if (voisine) { ev.preventDefault(); voisine.focus({ preventScroll: true }); }
    }
  }

  /** Clics de la quitter : confirmation puis départ de la partie. */
  function surQuitter(ev) {
    if (occupe || finie) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  }

  /* ---------- Écouteurs ---------- */

  refs.plateau.addEventListener('click', surPlateau);
  el.addEventListener('keydown', surClavier);
  refs.panneau.addEventListener('click', surPanneau);
  refs.panneau.addEventListener('submit', surSubmit);
  refs.panneau.addEventListener('change', surChangement);
  refs.quitter.addEventListener('click', surQuitter);

  /* ---------- Contrat de la vue ---------- */

  const signal = creerSignalTour();

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      // Effets : seulement entre deux états réels (le premier état reçu n'anime rien).
      const avant = etat;
      const fx = avant ? changements(avant, e, e.moi?.user_id ?? null) : null;
      const etaitMonTour = monTourDe(avant);
      etat = e;
      indexer();
      rendreBandeau();
      refs.quitter.disabled = !moiJoueur(etat) || moiJoueur(etat)?.parti === true;
      rendreCouts();
      rendrePlateau();
      rendreTag();
      rendrePanneau();
      rendreMain();
      rendrePoints();
      rendreJournal();
      const tour = e.partie.tour ?? null;
      if (tour !== dernierTour) {
        if (monTour()) refs.annonce.textContent = 'À toi de jouer.';
        dernierTour = tour;
      }
      if (avant) jouerEffets(fx, { plateau: refs.plateau, panneau: refs.panneau, main: refs.main, bandeau: refs.bandeau },
        { aToi: !etaitMonTour && monTour() });
      chat.maj(e);
      signal.maj(monTour());
    },
    /** CT1 : le gagnant voit ses tuiles s'allumer, puis l'écran de fin. Sans animation, onglet masqué ou autre issue : rien à attendre. */
    avantFin(e) {
      finie = true;
      refs.quitter.disabled = true;
      if (document.hidden) return null;
      const tuiles = [...refs.plateau.querySelectorAll('.ct-hex')];
      const joue = effetsFinPlateau(e, { ...finFx,
        apres: (issue) => {
          if (issue === 'gagnant') fxFin.cascade(tuiles, (h) => fxFin.classe(h, 'ct-tuile-fin', DUREE_TUILE_FIN), PAS_TUILE_FIN);
        } });
      if (!joue || !anime() || issuePlateau(e) !== 'gagnant') return null;
      return new Promise((ok) => { fxFin.plus(ok, 320 + Math.max(0, tuiles.length - 1) * PAS_TUILE_FIN + DUREE_TUILE_FIN); });
    },
    /** Message du chat (ancien ou nouveau). */
    message(msg) {
      messagesVus.push(msg);
      if (messagesVus.length > 200) messagesVus.shift();
      chat.message(msg);
    },
    /** Arrête le chrono, retire le chat et la table de la page. */
    detruire() {
      signal.arreter();
      arretChrono?.();
      grand.removeEventListener('change', surEcran);
      chat?.detruire();
      el.remove();
    },
  };
}
