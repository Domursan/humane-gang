// ===== Humane Gang — Monopoly : la table de jeu (plateaux/jeux/monopoly/table.js) =====
/*
 * Rôle : affiche une partie de Monopoly en cours (règles officielles, dés, achats, constructions, hypothèques,
 *   échanges, dettes). Plateau carré vintage « Paris · Édition 1936 » (plateau.js) avec, au centre, les paquets
 *   Chance et Caisse, les dés et la dernière carte tirée. À droite : « Argent de moi » (billets empilés), le tour
 *   (joueurs, soldes, texte d'aide, boutons d'action), puis mes titres, le journal et le chat (en tiroir sur téléphone).
 *   Les pions sont dessinés dans une couche au-dessus des cases et avancent case par case jusqu'à leur nouvelle case.
 *   Animations (dés qui roulent, carte qui apparaît, achat) : seulement quand l'état change, jamais au rafraîchissement.
 *   La mise en page est dans assets/espaces/plateaux/monopoly.css ; ici, le contenu, les actions et les animations.
 *   Les zones sont reconstruites seulement quand leur contenu change (le focus et les saisies restent en place).
 *   Effets « vrais écrans » (à toi, pion case par case, achat, prison) : ./effets.js, après chaque rendu. Le pion attend la
 *   fin du roulement des dés avant d'avancer (DELAI_DES_MS). Mouvement réduit (body.plat-calme) : le pion saute à sa case.
 * Dépendances : commun/tour-signal.js (creerSignalTour), core.js (esc, initials, toast), ../../api.js (plat, erreurTexte, nomDe),
 *   ../../vues/commun.js (bandeauHtml, brancherChrono, journalHtml, envoyer, moiJoueur, joueurDe, pseudoHtml, texteSur),
 *   ../../vues/chat.js (creerChat, tiroirChat), ./plateau.js (plateauHtml, pointCase), ./effets.js (creerEffets),
 *   ../../../../commun/grille-clavier.js.
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire() }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 */
import { esc, initials, toast } from '../../../../commun/core.js';
import { plat, erreurTexte, nomDe } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, envoyer, moiJoueur, joueurDe, pseudoHtml, texteSur, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { plateauHtml, pointCase } from './plateau.js';
import { voisinSpatial } from '../../../../commun/grille-clavier.js';
import { creerEffets } from './effets.js';

const ECRAN_GRAND = '(min-width: 761px)';
const MOUVEMENT_REDUIT = '(prefers-reduced-motion: reduce)';
const CAUTION_PRISON = 50;
const PAS_MARCHE_MS = 150;                 // durée d'une case pendant le déplacement d'un pion
const DELAI_DES_MS = 1300;                 // attente, après un nouveau lancer, avant que le pion avance (fin du roulement)
const DUREE_TITRE_MS = 3200;               // durée d'affichage de la carte de propriété achetée
const LIBELLE_CASE = { rue: 'Rue', gare: 'Gare', compagnie: 'Compagnie', caisse: 'Caisse de communauté', chance: 'Chance', impot: 'Impôt', depart: 'Départ', prison: 'Prison', parc: 'Parc gratuit', allez_prison: 'Allez en prison' };
const LIBELLES_LOYER = ['Loyer nu', 'Avec 1 maison', 'Avec 2 maisons', 'Avec 3 maisons', 'Avec 4 maisons', 'Avec un hôtel'];
const BILLETS = [500, 100, 50, 20];        // coupures affichées, de la plus grosse à la plus petite
const PIONS_PIPS = {
  1: [[32, 32]],
  2: [[16, 16], [48, 48]],
  3: [[16, 16], [32, 32], [48, 48]],
  4: [[16, 16], [48, 16], [16, 48], [48, 48]],
  5: [[16, 16], [48, 16], [32, 32], [16, 48], [48, 48]],
  6: [[16, 16], [48, 16], [16, 32], [48, 32], [16, 48], [48, 48]],
};

const euros = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} €`;
/** Dé en SVG (points) ; l'entier est lu par les lecteurs d'écran à part. */
const de = (v) => `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="10" fill="#FFFFFF" stroke="#1B1B1B" stroke-width="3"></rect>${(PIONS_PIPS[v] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5.5" fill="#1B1B1B"></circle>`).join('')}</svg>`;
/** Répartition d'une somme en billets (gloutonne, de 500 à 20 €) : { 500: n, 100: n, … }. */
function billets(somme) {
  let reste = Math.max(0, Math.floor(Number(somme) || 0));
  const compte = {};
  BILLETS.forEach((v) => { compte[v] = Math.floor(reste / v); reste -= compte[v] * v; });
  return compte;
}

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="mo-bandeau" data-bandeau></header>
  <div class="mo-barre" role="toolbar" aria-label="Actions de la partie">
    <div class="mo-onglets" role="group" aria-label="Affichage">
      <button type="button" class="mo-onglet" data-onglet-jeu aria-pressed="true">Plateau</button>
      <button type="button" class="mo-onglet" data-onglet-cote aria-pressed="false">Joueurs et journal</button>
    </div>
    <div class="mo-barre-droite">
      ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
    </div>
  </div>
  <p class="mo-elimine" data-elimine hidden></p>

  <div class="mo-corps">
    <div class="mo-colonne-jeu">
      <section class="mo-plan-zone" aria-label="Plateau de jeu">
        <div class="mo-plan" data-plan>
          <div class="mo-cases" data-cases></div>
          <div class="mo-pions" data-pions aria-hidden="true"></div>
          <div class="mo-centre" data-centre>
            <p class="mo-logo" aria-hidden="true">MONOPOLY</p>
            <div class="mo-paquet mo-paquet-chance" aria-hidden="true"><span class="mo-paquet-pt">?</span><span class="mo-paquet-nom">CHANCE</span></div>
            <div class="mo-paquet mo-paquet-caisse" aria-hidden="true"><span class="mo-paquet-nom">CAISSE DE COMMUNAUTÉ</span></div>
            <div class="mo-zone-des" data-zone-des></div>
            <div class="mo-zone-carte" data-zone-carte></div>
          </div>
        </div>
      </section>
      <section class="mo-fiche" data-fiche hidden aria-labelledby="mo-fiche-titre"></section>
    </div>

    <div class="mo-droite">
      <section class="mo-argent" aria-label="Mon argent" data-argent hidden></section>
      <section class="mo-tour" aria-label="Tour de jeu">
        <p class="mo-tour-tete" data-tour-tete></p>
        <section class="mo-bloc-joueurs" aria-labelledby="mo-joueurs-titre"><h2 id="mo-joueurs-titre" class="visually-hidden">Joueurs</h2><div data-joueurs></div></section>
        <div class="mo-panneau" aria-live="polite" data-panneau></div>
        <div class="mo-raccourcis" data-raccourcis></div>
      </section>
    </div>

    <aside class="mo-colonne-cote" aria-label="Titres, journal et chat">
      <section class="mo-bloc" aria-labelledby="mo-titres-titre"><h2 id="mo-titres-titre" class="mo-bloc-titre">Mes titres</h2><div data-titres></div></section>
      <section class="mo-bloc" aria-labelledby="mo-journal-titre"><h2 id="mo-journal-titre" class="mo-bloc-titre">Journal</h2><div data-journal></div></section>
      <div class="mo-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="mo-echange-zone" data-echange hidden></div>
  <div class="mo-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de Monopoly dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const contenus = ctx.contenus || {};
  const grand = window.matchMedia(ECRAN_GRAND);
  const reduit = window.matchMedia(MOUVEMENT_REDUIT);

  const el = document.createElement('section');
  el.className = 'mo-table';
  el.dataset.onglet = 'jeu';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), elimine: q('[data-elimine]'), plan: q('[data-plan]'), cases: q('[data-cases]'),
    pions: q('[data-pions]'), zoneDes: q('[data-zone-des]'), zoneCarte: q('[data-zone-carte]'),
    fiche: q('[data-fiche]'), argent: q('[data-argent]'), tourTete: q('[data-tour-tete]'), joueurs: q('[data-joueurs]'),
    panneau: q('[data-panneau]'), titres: q('[data-titres]'), journal: q('[data-journal]'), raccourcis: q('[data-raccourcis]'),
    chatZone: q('[data-chat]'), tiroirChatZone: q('[data-tiroir-chat]'), echange: q('[data-echange]'), annonce: q('[data-annonce]'),
    ongletJeu: q('[data-onglet-jeu]'), ongletCote: q('[data-onglet-cote]'), quitter: q('[data-quitter]'),
  };

  let etat = null;
  let occupe = false;
  let premiere = true;                     // vrai tant que le premier état n'est pas affiché : pas d'animation à l'arrivée
  let arretChrono = null;
  let caseOuverte = null;                  // numéro de la case dont la fiche est ouverte
  let fenetreEchange = false;              // fenêtre « proposer un échange » ouverte
  let titreMontre = null;                  // { c, t } : titre de propriété affiché en grand après un achat
  let minuteurTitre = null;
  const brouillon = { a: null, argent: 0, donne: [], recoit: [], cartesDonne: 0, cartesRecoit: 0 };
  const cles = {};                         // clé du dernier rendu de chaque zone
  const pions = new Map();                 // user_id -> { el, visu (case affichée), cible (case de l'état), marche }
  const messagesVus = [];
  let retardPions = 0;                     // ms avant le premier pas des pions de ce rendu (dés qui roulent)
  const calme = () => document.body.classList.contains('plat-calme');

  /* ---------- Chat : colonne (ordinateur) ou tiroir (téléphone) ---------- */

  let chat = null;
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

  /* ---------- Outils de lecture ---------- */

  const monId = () => moiJoueur(etat)?.user_id ?? null;
  const moiEst = (uid) => !!uid && uid === monId();
  const pseudoDe = (uid) => (uid == null ? '' : (joueurDe(etat, uid)?.pseudo || '?'));
  const jeu = () => etat?.jeu || {};
  const phase = () => jeu().phase;
  const monMoi = () => moiJoueur(etat);
  const monTour = () => !!monId() && jeu().actif === monId();
  const jeSuisSorti = () => !!monMoi()?.elimine || !!monMoi()?.parti;
  const peutAgir = () => !occupe && !jeSuisSorti() && etat?.partie?.statut === 'en_cours';
  const peutGerer = () => peutAgir() && ['lancer', 'gestion', 'dette'].includes(phase());
  const posDe = (j) => Number(j?.etat?.pos) || 0;
  const caseDef = (i) => (jeu().plateau || [])[i] || {};
  const nomCase = (i) => nomDe(contenus, 'cases', `c${i}`) || `Case ${i}`;
  const proprietesDe = (uid) => Object.entries(jeu().proprietes || {})
    .filter(([, p]) => p?.proprio === uid)
    .map(([c, p]) => ({ c: Number(c), p }))
    .sort((a, b) => a.c - b.c);
  const couleurGroupe = (id) => (contenus.groupes || []).find((g) => g.id === id) || null;
  const couleurJ = (j) => (/^#[0-9a-f]{6}$/i.test(j?.couleur || '') && !j?.invite ? j.couleur : '#F2EFEA');
  const joueursVivants = () => (etat?.joueurs || []).filter((j) => !j.parti && !j.elimine);

  /* ---------- Rendu : bandeau et chrono ---------- */

  function rendreBandeau() {
    const html = bandeauHtml(etat, { titre: esc(contenus.nom || 'Monopoly'), sousTitre: `Code ${esc(code)}` });
    if (cles.bandeau === html) return;
    cles.bandeau = html;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  function rendreElimine() {
    const on = jeSuisSorti() && etat?.partie?.statut === 'en_cours';
    refs.elimine.hidden = !on;
    refs.elimine.textContent = on ? 'Tu es ruiné : tu regardes la suite de la partie.' : '';
    refs.quitter.disabled = !monMoi() || monMoi()?.parti === true;
  }

  /* ---------- Rendu : plateau (cases) ---------- */

  /** Cases : reconstruites quand les lieux, les joueurs ou les propriétés changent ; le focus est gardé. */
  function rendreCases() {
    const joueurs = (etat.joueurs || []).map((j) => [j.user_id, posDe(j), j.couleur, j.pseudo, !!j.parti, !!j.elimine, j.invite]);
    const cle = JSON.stringify([jeu().proprietes, joueurs, monId(), jeu().plateau?.length]);
    if (cles.cases === cle) return;
    cles.cases = cle;
    const actif = document.activeElement;
    const refocus = actif && refs.cases.contains(actif) ? actif.dataset.case : null;
    refs.cases.innerHTML = plateauHtml({
      plateau: jeu().plateau || [], contenus, joueurs: etat.joueurs || [], proprietes: jeu().proprietes || {}, maCase: posDe(monMoi()),
    });
    if (refocus != null) refs.cases.querySelector(`[data-case="${refocus}"]`)?.focus();
  }

  /* ---------- Rendu : pions (couche au-dessus des cases, déplacement case par case) ---------- */

  /** Range les pions : ceux qui sont sur la même case s'écartent les uns des autres. */
  function disposerPions() {
    const nombre = new Map();
    pions.forEach((p) => nombre.set(p.visu, (nombre.get(p.visu) || 0) + 1));
    const rangs = new Map();
    pions.forEach((p) => {
      const k = rangs.get(p.visu) || 0;
      rangs.set(p.visu, k + 1);
      const pt = pointCase(p.visu, k, nombre.get(p.visu));
      p.el.style.left = pt.left;
      p.el.style.top = pt.top;
      p.el.style.setProperty('--f', String(pt.f));
    });
  }

  /** Fait avancer un pion, case par case, jusqu'à sa case de l'état. */
  function marcher(p) {
    if (p.marche) return;
    p.marche = true;
    const pas = () => {
      if (!pions.has(p.uid)) { p.marche = false; return; }
      if (p.visu === p.cible) { p.marche = false; return; }
      p.visu = (p.visu + 1) % 40;
      disposerPions();
      effets.caseAtteinte(p.visu);
      setTimeout(pas, PAS_MARCHE_MS);
    };
    setTimeout(pas, PAS_MARCHE_MS + retardPions);
  }

  /** Synchronise les pions avec les joueurs ; un changement de case déclenche la marche (sauf à l'arrivée). */
  function rendrePions() {
    const vivants = new Set();
    (etat.joueurs || []).forEach((j) => {
      if (j.parti || j.elimine || typeof j.etat?.pos !== 'number') return;
      vivants.add(j.user_id);
      const couleur = couleurJ(j);
      let p = pions.get(j.user_id);
      if (!p) {
        const el = document.createElement('span');
        el.className = 'mo-pion';
        el.dataset.uid = j.user_id;
        refs.pions.append(el);
        p = { uid: j.user_id, el, visu: posDe(j), cible: posDe(j), marche: false };
        pions.set(j.user_id, p);
      }
      p.cible = posDe(j);
      if (reduit.matches || calme()) p.visu = p.cible;
      const ini = initials(j.pseudo);
      p.el.textContent = ini;
      p.el.title = j.pseudo || '?';
      p.el.style.background = couleur;
      p.el.style.color = texteSur(couleur);
      if (p.visu !== p.cible) marcher(p);
    });
    pions.forEach((p, uid) => { if (!vivants.has(uid)) { p.el.remove(); pions.delete(uid); } });
    disposerPions();
  }

  /* ---------- Rendu : joueurs (dans le tour) ---------- */

  function rendreJoueurs() {
    const liste = (etat.joueurs || []).map((j) => {
      const nb = proprietesDe(j.user_id).length;
      const pion = (contenus.pions || []).find((p) => p.id === j.etat?.pion)?.nom || '';
      const tags = [];
      if (j.user_id === jeu().actif) tags.push('<span class="mo-etiquette is-tour">Son tour</span>');
      if (j.etat?.prison) tags.push('<span class="mo-etiquette">En prison</span>');
      if (j.elimine) tags.push('<span class="mo-etiquette">Ruiné</span>');
      if (j.parti) tags.push('<span class="mo-etiquette">Parti</span>');
      const argent = j.etat?.argent != null ? euros(j.etat.argent) : '';
      return `<li class="mo-joueur${moiEst(j.user_id) ? ' is-moi' : ''}${j.elimine ? ' is-elimine' : ''}">
        <div class="mo-joueur-corps">
          ${pseudoHtml(j)} ${moiEst(j.user_id) ? '<span class="mo-etiquette">Toi</span>' : ''} ${tags.join(' ')}
          <span class="small muted">${nb} lieu${nb > 1 ? 'x' : ''}${pion ? ` · ${esc(pion)}` : ''}</span>
        </div>
        <strong class="mo-joueur-argent">${esc(argent)}</strong>
      </li>`;
    }).join('');
    const cle = JSON.stringify([etat.joueurs, jeu().actif, jeu().proprietes, contenus.pions]);
    if (cles.joueurs === cle) return;
    cles.joueurs = cle;
    refs.joueurs.innerHTML = `<ul class="mo-liste-joueurs" aria-label="Joueurs">${liste}</ul>`;
  }

  /** En-tête du tour : numéro et joueur dont c'est le tour. */
  function rendreTourTete() {
    const texte = `Tour n°${etat.partie?.nb_tours ?? 0} · ${pseudoDe(jeu().actif) || '?'}`;
    if (cles.tourTete === texte) return;
    cles.tourTete = texte;
    refs.tourTete.textContent = texte;
  }

  /* ---------- Rendu : argent de moi (billets empilés) ---------- */

  function rendreArgent() {
    const me = monMoi();
    if (!monId()) { refs.argent.hidden = true; refs.argent.innerHTML = ''; cles.argent = null; return; }
    const argent = Number(me?.etat?.argent) || 0;
    const cle = JSON.stringify([argent, monId(), me?.pseudo, etat.partie?.nb_tours]);
    if (cles.argent === cle) return;
    cles.argent = cle;
    refs.argent.hidden = false;
    const compte = billets(argent);
    const pile = BILLETS.slice().reverse().map((v, n) => `<span class="mo-billet mo-billet-${v}${compte[v] ? '' : ' is-vide'}" style="--r:${[-5, 3, -3, 5][n]}deg">
        <strong>${v} €</strong><small>× ${compte[v]}</small></span>`).join('');
    const detail = BILLETS.filter((v) => compte[v]).map((v) => `${compte[v]} billet${compte[v] > 1 ? 's' : ''} de ${v} €`).join(', ');
    refs.argent.innerHTML = `<div class="mo-argent-tete"><span class="mo-argent-titre">Argent de ${esc(me?.pseudo || '?')}</span>
        <span class="mo-argent-tour">Tour n°${esc(etat.partie?.nb_tours ?? 0)}</span></div>
      <p class="mo-argent-montant${argent < 0 ? ' is-negatif' : ''}">${esc(euros(argent))}</p>
      <div class="mo-billets" aria-hidden="true">${pile}</div>
      <p class="visually-hidden">${esc(detail || 'Aucun billet')}</p>`;
  }

  /* ---------- Rendu : mes titres groupés par couleur ---------- */

  function rendreTitres() {
    const mes = proprietesDe(monId());
    const cle = JSON.stringify([mes, monId(), contenus.groupes]);
    if (cles.titres === cle) return;
    cles.titres = cle;
    if (!monId()) { refs.titres.innerHTML = '<p class="mo-vide small muted">Tu ne joues pas dans cette partie.</p>'; return; }
    if (!mes.length) { refs.titres.innerHTML = '<p class="mo-vide small muted">Aucun titre pour l\'instant.</p>'; return; }
    const parGroupe = new Map();
    mes.forEach((t) => {
      const g = caseDef(t.c).groupe || (caseDef(t.c).type === 'gare' ? 'gare' : caseDef(t.c).type === 'compagnie' ? 'compagnie' : 'autres');
      if (!parGroupe.has(g)) parGroupe.set(g, []);
      parGroupe.get(g).push(t);
    });
    refs.titres.innerHTML = [...parGroupe.entries()].map(([g, items]) => {
      const info = couleurGroupe(g);
      const titre = info?.nom || (g === 'gare' ? 'Gares' : g === 'compagnie' ? 'Compagnies' : 'Autres');
      const couleur = info?.couleur || '#6B6660';
      const lignes = items.map(({ c, p }) => {
        const etiq = [p.maisons >= 5 ? 'Hôtel' : p.maisons ? `${p.maisons} maison${p.maisons > 1 ? 's' : ''}` : '', p.hypotheque ? 'Hypothéquée' : ''].filter(Boolean).join(' · ');
        return `<li><button type="button" class="mo-titre-bouton" data-ouvrir="${c}" aria-label="${esc(nomCase(c))}${etiq ? `, ${esc(etiq)}` : ''}. Voir la fiche">
          <span class="mo-titre-nom">${esc(nomCase(c))}</span><span class="mo-titre-info">${esc(etiq || 'Libre de construction')}</span></button></li>`;
      }).join('');
      return `<div class="mo-groupe"><p class="mo-groupe-titre"><span class="mo-pastille" style="background:${esc(couleur)}" aria-hidden="true"></span>${esc(titre)}</p><ul class="mo-titres">${lignes}</ul></div>`;
    }).join('');
  }

  /* ---------- Rendu : journal ---------- */

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  /* ---------- Rendu : dés et cartes (au centre du plateau) ---------- */

  /** Dés : roulent seulement quand la valeur change (un nouveau lancer), pas au rafraîchissement. */
  function rendreDes() {
    const des = jeu().des;
    const cle = JSON.stringify(des || null);
    if (cles.des === cle) return;
    const roule = !premiere && !!des;
    cles.des = cle;
    if (!des) { refs.zoneDes.innerHTML = ''; return; }
    const faux = () => 1 + Math.floor(Math.random() * 6);
    const unDe = (v) => `<div class="mo-de${roule ? ' is-roule' : ''}">${roule ? `<span class="mo-face mo-faux">${de(faux())}</span>` : ''}<span class="mo-face mo-vrai">${de(v)}</span></div>`;
    refs.zoneDes.innerHTML = `<div class="mo-des" role="img" aria-label="Dés : ${des[0]} et ${des[1]}${jeu().doubles ? ', doubles' : ''}">${unDe(des[0])}${unDe(des[1])}</div>`;
  }

  /** Carte tirée (Chance, Caisse) ou titre de propriété acheté : apparaît en grand, une fois par nouveauté. */
  function rendreCarte() {
    const c = jeu().carte;
    const jeton = titreMontre ? `${titreMontre.c}/${titreMontre.t}` : '';
    const cle = JSON.stringify([c, jeton]);
    if (cles.carte === cle) return;
    const anime = !premiere && (c || titreMontre) ? ' is-neuve' : '';
    cles.carte = cle;
    if (titreMontre) {
      const def = caseDef(titreMontre.c);
      const g = couleurGroupe(def.groupe);
      const p = jeu().proprietes?.[String(titreMontre.c)] || {};
      refs.zoneCarte.innerHTML = `<article class="mo-titre-carte${anime}" aria-hidden="true">
        <div class="mo-titre-bande" style="background:${esc(g?.couleur || '#6B6660')}"></div>
        <p class="mo-titre-nomcase">${esc(nomCase(titreMontre.c))}</p>
        <p class="mo-titre-prix">${esc(euros(def.prix))}</p>
        <p class="mo-titre-pied">Titre de propriété<br>${p.proprio ? `Propriétaire : ${esc(pseudoDe(p.proprio))}` : ''}</p></article>`;
      return;
    }
    if (!c) { refs.zoneCarte.innerHTML = ''; return; }
    const chance = c.pioche === 'chance';
    refs.zoneCarte.innerHTML = `<article class="mo-carte ${chance ? 'is-chance' : 'is-caisse'}${anime}" aria-label="Dernière carte tirée">
      <p class="mo-carte-pioche">${chance ? 'Carte Chance' : 'Caisse de communauté'}${c.pour ? ` · ${esc(pseudoDe(c.pour))}` : ''}</p>
      <p class="mo-carte-texte">${esc(c.texte || '')}</p></article>`;
  }

  /** Achat d'un terrain : le titre s'affiche en grand un instant. */
  function montrerTitre(c) {
    titreMontre = { c, t: Date.now() };
    clearTimeout(minuteurTitre);
    minuteurTitre = setTimeout(() => { titreMontre = null; rendreCarte(); }, DUREE_TITRE_MS);
  }

  /* ---------- Rendu : panneau d'action (dans le tour) ---------- */

  /** Texte court de ce qu'on donne ou reçoit dans un échange. */
  function descOffre(part) {
    const morceaux = [];
    if (part?.argent) morceaux.push(euros(part.argent));
    (part?.proprietes || []).forEach((c) => morceaux.push(nomCase(c)));
    if (part?.cartes) morceaux.push(`${part.cartes} carte${part.cartes > 1 ? 's' : ''} de sortie`);
    return morceaux.length ? morceaux.join(', ') : 'rien';
  }

  /** Offre reçue : Accepter / Refuser, bien visibles. */
  function blocOffreRecue() {
    const o = jeu().offre;
    if (!o || o.a !== monId()) return '';
    return `<div class="mo-offre" role="group" aria-label="Offre reçue">
      <p><strong>${esc(pseudoDe(o.de))}</strong> te propose un échange.</p>
      <p class="small">Il te donne : ${esc(descOffre(o.donne))}.<br>Il demande : ${esc(descOffre(o.recoit))}.</p>
      <div class="mo-pied">
        <button type="button" class="mo-btn mo-btn-primary" data-act="accepter_echange"${peutAgir() ? '' : ' disabled'}>Accepter l'échange</button>
        <button type="button" class="mo-btn mo-btn-ghost" data-act="refuser_echange"${peutAgir() ? '' : ' disabled'}>Refuser</button>
      </div></div>`;
  }

  /** Dette : en rouge, avec ce qu'il manque. */
  function blocDette() {
    const d = jeu().dette;
    if (!d) return '';
    if (d.debiteur !== monId()) {
      return `<p class="mo-alerte-douce">${esc(pseudoDe(d.debiteur))} doit régler une dette à ${esc(pseudoDe(d.creancier))}.</p>`;
    }
    const argent = Number(monMoi()?.etat?.argent) || 0;
    const ok = argent >= 0;
    return `<div class="mo-dette" role="group" aria-label="Dette à régler">
      <p><strong>Tu dois régler une dette à ${esc(pseudoDe(d.creancier))}.</strong></p>
      <p class="small">${ok ? 'Tu as de quoi payer. Règle la dette.' : `Il te manque ${esc(euros(-argent))}. Vends une maison ou hypothèque un titre.`}</p>
      <div class="mo-pied">
        <button type="button" class="mo-btn mo-btn-primary" data-act="regler"${ok && peutAgir() ? '' : ' disabled'}>Régler la dette</button>
        <button type="button" class="mo-btn mo-btn-danger" data-act="faillite"${peutAgir() ? '' : ' disabled'}>Déclarer faillite</button>
      </div></div>`;
  }

  /** Panneau d'action selon la phase et mon rôle. */
  function panneau() {
    const j = jeu();
    const me = monMoi();
    const tour = monTour();
    const titre = (t) => `<h2 id="mo-tour-titre" class="mo-titre-panneau" tabindex="-1">${esc(t)}</h2>`;
    if (!monId()) return titre('Tu regardes la partie') + `<p>${esc(pseudoDe(etat.partie?.tour || j.actif))} joue.</p>`;
    if (me?.parti) return titre('Tu as quitté la partie') + '<p>Tu regardes la suite.</p>';
    if (me?.elimine) return titre('Tu es ruiné') + '<p>Tu regardes la suite de la partie.</p>' + blocOffreRecue();
    const haut = blocOffreRecue() + blocDette();
    if (j.dette && j.dette.debiteur === monId()) return haut;
    if (!tour) {
      const attente = j.phase === 'achat' ? 'Il décide d\'acheter ou non.' : 'Patiente, la partie continue.';
      return haut + titre(`C'est à ${pseudoDe(j.actif)} de jouer`) + `<p class="small muted">${esc(attente)}</p>`;
    }
    const argent = Number(me?.etat?.argent) || 0;
    const pos = posDe(me);
    const prix = Number(caseDef(pos).prix) || 0;
    if (j.phase === 'lancer') {
      const prison = me?.etat?.prison
        ? `<p class="mo-note">Tu es en prison. Tu peux payer ${CAUTION_PRISON} € ou utiliser une carte de sortie.</p>
           <div class="mo-pied">
             <button type="button" class="mo-btn" data-act="payer_prison"${argent >= CAUTION_PRISON && peutAgir() ? '' : ' disabled'}>Payer ${CAUTION_PRISON} €</button>
             <button type="button" class="mo-btn" data-act="carte_prison"${(Number(me.etat.cartes_sortie) || 0) > 0 && peutAgir() ? '' : ' disabled'}>Utiliser une carte de sortie</button>
           </div>`
        : '';
      return haut + titre('Ton tour') + `<p>Lance les dés pour avancer.</p>${prison}
        <div class="mo-pied"><button type="button" class="mo-btn mo-btn-primary" data-act="lancer"${peutAgir() ? '' : ' disabled'}>Lancer les dés</button></div>`;
    }
    if (j.phase === 'achat') {
      return haut + titre('Tu peux acheter') + `<p><strong>${esc(nomCase(pos))}</strong> coûte ${esc(euros(prix))}. Tu as ${esc(euros(argent))}.</p>
        <div class="mo-pied">
          <button type="button" class="mo-btn mo-btn-primary" data-act="acheter"${peutAgir() && argent >= prix ? '' : ' disabled'}>Acheter pour ${esc(euros(prix))}</button>
          <button type="button" class="mo-btn mo-btn-ghost" data-act="refuser"${peutAgir() ? '' : ' disabled'}>Passer</button>
        </div>`;
    }
    return haut + titre('Ton tour') + `<p class="mo-note">Tu peux encore construire, vendre ou hypothéquer tes titres. Fais ensuite « Finir mon tour ».</p>
      <div class="mo-pied"><button type="button" class="mo-btn mo-btn-primary" data-act="finir"${peutAgir() ? '' : ' disabled'}>Finir mon tour</button></div>`;
  }

  /** Panneau d'action : reconstruit seulement si son contenu change. */
  function rendrePanneau(force = false) {
    if (occupe && !force) return;
    const j = jeu();
    const cle = JSON.stringify([j.phase, j.actif, j.offre, j.dette, monId(), etat.partie?.statut,
      monMoi()?.etat?.argent, monMoi()?.etat?.prison, monMoi()?.etat?.cartes_sortie, posDe(monMoi()), monMoi()?.elimine, monMoi()?.parti,
      (etat.joueurs || []).map((x) => x.etat?.argent).join(',')]);
    if (!force && cles.panneau === cle) return;
    cles.panneau = cle;
    refs.panneau.innerHTML = panneau();
  }

  /* ---------- Rendu : raccourcis (proposer un échange, annuler mon offre) ---------- */

  function rendreRaccourcis() {
    const offre = jeu().offre;
    const aMoi = !!offre && offre.de === monId();
    const peut = monTour() && peutAgir() && !offre;
    const cle = JSON.stringify([peut, aMoi, peutAgir()]);
    if (cles.raccourcis === cle) return;
    cles.raccourcis = cle;
    refs.raccourcis.innerHTML = `${peut ? '<button type="button" class="mo-btn mo-btn-ghost mo-pleine" data-echange-ouvrir>Proposer un échange</button>' : ''}
      ${aMoi ? `<button type="button" class="mo-btn mo-btn-ghost mo-pleine" data-act="annuler_echange"${peutAgir() ? '' : ' disabled'}>Annuler ma proposition</button>` : ''}`;
  }

  /* ---------- Rendu : fiche d'un lieu (au clic sur une case ou un titre) ---------- */

  function rendreFiche() {
    const c = caseOuverte;
    if (c == null || !etat) {
      refs.fiche.hidden = true;
      refs.fiche.innerHTML = '';
      cles.fiche = null;
      return;
    }
    const def = caseDef(c);
    const p = jeu().proprietes?.[String(c)] || {};
    const estMoi = !!p.proprio && p.proprio === monId();
    const gerable = estMoi && peutGerer();
    const cle = JSON.stringify([c, def, p, pseudoDe(p.proprio), gerable, jeu().phase, monId(), etat.partie?.statut, monMoi()?.etat?.argent]);
    if (cles.fiche === cle) return;
    cles.fiche = cle;
    refs.fiche.hidden = false;
    const g = couleurGroupe(def.groupe);
    const maisons = Number(p.maisons) || 0;
    const loyers = Array.isArray(def.loyers) && def.loyers.length
      ? `<dl class="mo-loyers">${def.loyers.map((v, i) => `<div><dt>${esc(LIBELLES_LOYER[i] || '')}</dt><dd>${esc(euros(v))}</dd></div>`).join('')}</dl>`
      : '';
    const actions = gerable ? [
      def.type === 'rue' && maisons < 5 ? `<button type="button" class="mo-btn mo-btn-primary" data-act="construire" data-case="${c}"${peutAgir() ? '' : ' disabled'}>Construire ${maisons >= 4 ? 'un hôtel' : 'une maison'}</button>` : '',
      maisons > 0 ? `<button type="button" class="mo-btn" data-act="vendre_maison" data-case="${c}"${peutAgir() ? '' : ' disabled'}>Vendre ${maisons >= 5 ? 'l\'hôtel' : 'une maison'}</button>` : '',
      !p.hypotheque && maisons === 0 ? `<button type="button" class="mo-btn" data-act="hypothequer" data-case="${c}"${peutAgir() ? '' : ' disabled'}>Hypothéquer</button>` : '',
      p.hypotheque ? `<button type="button" class="mo-btn" data-act="lever_hypotheque" data-case="${c}"${peutAgir() ? '' : ' disabled'}>Lever l'hypothèque (+10 %)</button>` : '',
    ].filter(Boolean).join('') : '';
    refs.fiche.innerHTML = `<div class="mo-fiche-carte">
      <div class="mo-fiche-bande" style="background:${esc(g?.couleur || '#6B6660')}" aria-hidden="true"></div>
      <div class="mo-fiche-corps">
        <div class="mo-fiche-tete">
          <h2 id="mo-fiche-titre" class="mo-fiche-titre" tabindex="-1">${esc(nomCase(c))}</h2>
          <button type="button" class="mo-btn mo-btn-ghost" data-fermer-fiche>Fermer</button>
        </div>
        <p class="small muted">${esc(g?.nom || LIBELLE_CASE[def.type] || '')}${def.prix ? ` · ${esc(euros(def.prix))}` : ''}${def.montant ? ` · ${esc(euros(def.montant))}` : ''}</p>
        ${def.maison ? `<p class="small">Une maison coûte ${esc(euros(def.maison))}.</p>` : ''}
        ${loyers}
        <p class="small">${p.proprio ? `Propriétaire : ${esc(pseudoDe(p.proprio))}` : 'Pas de propriétaire.'}${maisons ? ` · ${maisons >= 5 ? 'hôtel' : `${maisons} maison${maisons > 1 ? 's' : ''}`}` : ''}${p.hypotheque ? ' · hypothéquée' : ''}</p>
        ${actions ? `<div class="mo-pied mo-pied-fiche">${actions}</div>` : ''}
      </div></div>`;
  }

  /* ---------- Rendu : fenêtre d'échange (comme PolyEchange) ---------- */

  const vivantsAutres = () => joueursVivants().filter((j) => !moiEst(j.user_id));

  /** Lignes de cases à cocher pour un des deux côtés (boutons à aria-pressed). */
  function casesEchange(liste, choisies, attr) {
    if (!liste.length) return '<p class="small muted">Aucun lieu.</p>';
    return liste.map(({ c, p }) => `<button type="button" class="mo-ech-lieu" aria-pressed="${choisies.includes(c)}" ${attr}="${c}">
      <span class="mo-ech-lieu-nom">${esc(nomCase(c))}</span><span class="small muted">${p.maisons ? (p.maisons >= 5 ? 'hôtel' : `${p.maisons} maison${p.maisons > 1 ? 's' : ''}`) : esc(euros(caseDef(c).prix))}</span>
      <span class="mo-ech-coche" aria-hidden="true">${choisies.includes(c) ? 'Choisi' : ''}</span></button>`).join('');
  }

  function rendreEchange() {
    const ouvert = fenetreEchange && monTour() && !jeSuisSorti();
    if (!ouvert) {
      if (fenetreEchange && !monTour()) fenetreEchange = false;
      refs.echange.hidden = true;
      refs.echange.innerHTML = '';
      cles.echange = null;
      return;
    }
    const partenaires = vivantsAutres();
    if (!partenaires.some((j) => j.user_id === brouillon.a)) brouillon.a = partenaires[0]?.user_id ?? null;
    const b = brouillon;
    const cle = JSON.stringify([b.a, b.donne, b.recoit, b.cartesDonne, b.cartesRecoit, jeu().offre, monId(), proprietesDe(monId()), partenaires.map((x) => x.user_id)]);
    if (cles.echange === cle) return;
    cles.echange = cle;
    refs.echange.hidden = false;
    const moi = monMoi();
    const argentMax = Math.max(0, Number(moi?.etat?.argent) || 0);
    b.argent = Math.min(b.argent || 0, argentMax);
    const cartesMoi = Number(moi?.etat?.cartes_sortie) || 0;
    const lieuxMoi = proprietesDe(monId());
    const lieuxAutre = proprietesDe(b.a).filter(({ c }) => !(jeu().proprietes?.[String(c)]?.maisons > 0));
    const enCours = jeu().offre;
    const impossible = !b.a || (!b.donne.length && !b.recoit.length && !b.argent && !b.cartesDonne && !b.cartesRecoit) || !!enCours;
    const valeur = (liste) => liste.reduce((s, c) => s + (Number(caseDef(c).prix) || 0), 0);
    refs.echange.innerHTML = `<div class="mo-echange-fond" aria-hidden="true"></div>
      <div class="mo-echange" role="dialog" aria-modal="true" aria-labelledby="mo-ech-titre">
        <div class="mo-echange-tete">
          <div><h2 id="mo-ech-titre" class="mo-echange-titre" tabindex="-1">Proposer un échange</h2>
          <p class="small muted">Tu donnes un lieu et de l'argent, tu reçois un lieu.</p></div>
          <button type="button" class="mo-btn mo-btn-ghost" data-echange-fermer>Fermer</button>
        </div>
        <div class="mo-echange-corps">
          <section class="mo-ech-col" aria-labelledby="mo-donne-titre">
            <h3 id="mo-donne-titre" class="mo-ech-titre">Tu donnes</h3>
            <p class="small muted">Ton argent : ${esc(euros(argentMax))}</p>
            <label class="mo-ech-label" for="mo-ech-argent-${esc(code)}">Argent ajouté : <span data-ech-argent-val>${esc(euros(b.argent))}</span></label>
            <input id="mo-ech-argent-${esc(code)}" class="mo-range" type="range" min="0" max="${argentMax}" step="10" value="${b.argent}" data-ech-argent>
            <div class="mo-ech-liste">${casesEchange(lieuxMoi.map((x) => x), b.donne, 'data-ech-donne')}</div>
            <label class="mo-ech-label" for="mo-ech-cd-${esc(code)}">Cartes de sortie données (${cartesMoi} en main)</label>
            <input id="mo-ech-cd-${esc(code)}" class="mo-ech-nombre" type="number" min="0" max="${cartesMoi}" value="${Math.min(b.cartesDonne, cartesMoi)}" data-ech-cartes="donne">
          </section>
          <section class="mo-ech-col" aria-labelledby="mo-recois-titre">
            <h3 id="mo-recois-titre" class="mo-ech-titre">Tu reçois</h3>
            <label class="mo-ech-label" for="mo-ech-a-${esc(code)}">Avec</label>
            <select id="mo-ech-a-${esc(code)}" class="mo-select" data-ech-a>${partenaires.map((j) => `<option value="${esc(j.user_id)}"${j.user_id === b.a ? ' selected' : ''}>${esc(j.pseudo || '?')}</option>`).join('')}</select>
            <div class="mo-ech-liste">${casesEchange(lieuxAutre, b.recoit, 'data-ech-recoit')}</div>
            <label class="mo-ech-label" for="mo-ech-cr-${esc(code)}">Cartes de sortie demandées</label>
            <input id="mo-ech-cr-${esc(code)}" class="mo-ech-nombre" type="number" min="0" max="10" value="${b.cartesRecoit}" data-ech-cartes="recoit">
          </section>
          <aside class="mo-ech-cote" aria-labelledby="mo-nego-titre">
            <h3 id="mo-nego-titre" class="mo-ech-titre">Bilan</h3>
            <p class="mo-ech-bilan">Valeur donnée : <strong>${esc(euros(valeur(b.donne) + b.argent))}</strong><br>Valeur reçue : <strong>${esc(euros(valeur(b.recoit)))}</strong></p>
            ${enCours ? `<p class="mo-alerte-douce">Une proposition attend une réponse. Annule-la avant d'en faire une autre.</p>` : ''}
          </aside>
        </div>
        <div class="mo-echange-pied">
          <button type="button" class="mo-btn mo-btn-ghost" data-echange-fermer>Annuler</button>
          <button type="button" class="mo-btn mo-btn-primary" data-echange-envoyer${impossible || !peutAgir() ? ' disabled' : ''}>Envoyer la proposition</button>
        </div>
      </div>`;
    if (refs.echange.dataset.focus) refs.echange.querySelector(`[${refs.echange.dataset.focus}]`)?.focus();
    refs.echange.dataset.focus = '';
  }

  /* ---------- Actions et écouteurs ---------- */

  /** Envoie une action de jeu (bouton data-act ; data-case donne le numéro de case). */
  function agirBouton(b) {
    if (occupe) return;
    const action = b.dataset.act;
    const args = b.dataset.case != null ? { case: Number(b.dataset.case) } : {};
    occupe = true;
    envoyer(b, async () => {
      try {
        await plat.agir(code, action, args);
      } catch (e) {
        toast(erreurTexte(e), 'error');
      } finally {
        occupe = false;
        cles.panneau = null;
        cles.fiche = null;
        rendrePanneau(true);
        rendreFiche();
        suivi.rafraichir();
      }
    }, suivi);
  }

  /** Envoie la proposition d'échange du brouillon. */
  function envoyerEchange(b) {
    if (occupe) return;
    const payload = {
      a: brouillon.a,
      donne: { argent: brouillon.argent, proprietes: [...brouillon.donne], cartes: brouillon.cartesDonne },
      recoit: { argent: 0, proprietes: [...brouillon.recoit], cartes: brouillon.cartesRecoit },
    };
    occupe = true;
    envoyer(b, async () => {
      try {
        await plat.agir(code, 'proposer_echange', payload);
        Object.assign(brouillon, { argent: 0, donne: [], recoit: [], cartesDonne: 0, cartesRecoit: 0 });
        fenetreEchange = false;
      } catch (e) {
        toast(erreurTexte(e), 'error');
      } finally {
        occupe = false;
        cles.echange = null;
        rendreEchange();
        suivi.rafraichir();
      }
    }, suivi);
  }

  /** Clics de la table : boutons d'action, cases, titres, fiche, échange. */
  function surClic(ev) {
    const b = ev.target.closest('button');
    if (!b || !el.contains(b)) return;
    if (b.hasAttribute('data-act')) return agirBouton(b);
    if (b.hasAttribute('data-echange-ouvrir')) {
      fenetreEchange = true;
      cles.echange = null;
      rendreEchange();
      refs.echange.querySelector('#mo-ech-titre')?.focus();
      return;
    }
    if (b.hasAttribute('data-echange-fermer')) {
      fenetreEchange = false;
      cles.echange = null;
      rendreEchange();
      refs.raccourcis.querySelector('[data-echange-ouvrir]')?.focus();
      return;
    }
    if (b.hasAttribute('data-echange-envoyer')) return envoyerEchange(b);
    if (b.hasAttribute('data-fermer-fiche')) {
      caseOuverte = null;
      rendreFiche();
      return;
    }
    if (b.hasAttribute('data-ech-donne')) return basculer(brouillon.donne, Number(b.dataset.echDonne), 'echange');
    if (b.hasAttribute('data-ech-recoit')) return basculer(brouillon.recoit, Number(b.dataset.echRecoit), 'echange');
    const cible = b.classList.contains('mo-case') ? b.dataset.case : b.dataset.ouvrir;
    if (cible != null) {
      caseOuverte = Number(cible);
      cles.fiche = null;
      rendreFiche();
      refs.fiche.querySelector('#mo-fiche-titre')?.focus();
    }
  }

  /** Coche ou décoche un lieu du brouillon, puis redessine la fenêtre (le focus revient sur le lieu). */
  function basculer(liste, c, zone) {
    const i = liste.indexOf(c);
    if (i >= 0) liste.splice(i, 1); else liste.push(c);
    cles.echange = null;
    refs.echange.dataset.focus = `data-ech-${zone === 'echange' && liste === brouillon.donne ? 'donne' : 'recoit'}="${c}"`;
    rendreEchange();
  }

  /** Saisies de la fenêtre d'échange : valeurs gardées sans redessiner (pas de perte de focus). */
  function surSaisie(ev) {
    const t = ev.target;
    if (!refs.echange.contains(t)) return;
    if (t.hasAttribute('data-ech-argent')) {
      brouillon.argent = Number(t.value) || 0;
      const sortie = refs.echange.querySelector('[data-ech-argent-val]');
      if (sortie) sortie.textContent = euros(brouillon.argent);
      return;
    }
    if (t.hasAttribute('data-ech-cartes')) {
      const n = Math.max(0, Math.floor(Number(t.value) || 0));
      if (t.dataset.echCartes === 'donne') brouillon.cartesDonne = n; else brouillon.cartesRecoit = n;
      return;
    }
    if (t.hasAttribute('data-ech-a') && ev.type === 'change') {
      brouillon.a = t.value;
      brouillon.recoit = [];
      cles.echange = null;
      rendreEchange();
    }
  }

  /** Clic sur une case : fiche, fermée si on clique la même. */
  refs.cases.addEventListener('click', surClic);
  // Clavier : flèches vers la case la plus proche dans la direction (les 40 cases forment un anneau) ; Entrée ou Espace ouvrent la fiche.
  refs.cases.addEventListener('keydown', (ev) => {
    const b = ev.target.closest?.('button[data-case]');
    if (!b || !ev.key.startsWith('Arrow')) return;
    const voisine = voisinSpatial(ev.key, b, [...refs.cases.querySelectorAll('button[data-case]')]);
    if (voisine) { ev.preventDefault(); voisine.focus({ preventScroll: true }); }
  });
  refs.fiche.addEventListener('click', surClic);
  refs.titres.addEventListener('click', surClic);
  refs.raccourcis.addEventListener('click', surClic);
  refs.panneau.addEventListener('click', surClic);
  refs.echange.addEventListener('click', surClic);
  refs.echange.addEventListener('input', surSaisie);
  refs.echange.addEventListener('change', surSaisie);
  refs.quitter.addEventListener('click', (ev) => {
    if (occupe) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  });
  refs.ongletJeu.addEventListener('click', () => ongletPour('jeu'));
  refs.ongletCote.addEventListener('click', () => ongletPour('cote'));

  function ongletPour(nomOnglet) {
    el.dataset.onglet = nomOnglet;
    refs.ongletJeu.setAttribute('aria-pressed', String(nomOnglet === 'jeu'));
    refs.ongletCote.setAttribute('aria-pressed', String(nomOnglet === 'cote'));
  }

  /* ---------- Titres achetés : détection à partir de l'état précédent ---------- */

  /** Terrains dont le propriétaire vient de changer (un achat) : à montrer en grand. */
  function achatsDepuis(precedent) {
    if (!precedent) return null;
    const avant = precedent.jeu?.proprietes || {};
    const apres = jeu().proprietes || {};
    return Object.entries(apres).find(([c, p]) => p?.proprio && (!avant[c] || avant[c].proprio !== p.proprio));
  }

  /* ---------- Chat et contrat de la vue ---------- */

  const signal = creerSignalTour();
  const effets = creerEffets(el);

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      const avant = etat?.jeu?.actif;
      const precedent = etat;
      etat = e;
      const achat = achatsDepuis(precedent);
      // Un nouveau lancer : le pion attend la fin du roulement des dés avant d'avancer.
      retardPions = !premiere && !!e.jeu?.des && JSON.stringify(e.jeu.des) !== cles.des ? DELAI_DES_MS : 0;
      rendreBandeau();
      rendreElimine();
      rendreCases();
      rendrePions();
      retardPions = 0;
      rendreArgent();
      rendreTourTete();
      rendreJoueurs();
      rendreTitres();
      rendreJournal();
      rendreRaccourcis();
      rendreDes();
      if (achat) montrerTitre(Number(achat[0]));
      rendreCarte();
      rendrePanneau();
      rendreFiche();
      rendreEchange();
      premiere = false;
      if (avant !== undefined && e.jeu?.actif !== avant && monTour()) refs.annonce.textContent = 'À toi de jouer.';
      chat.maj(e);
      signal.maj(monTour());
      try { effets.maj(e, monId()); } catch (err) { console.warn('[monopoly] effets visuels', err); }
    },
    /** Message du chat (ancien ou nouveau). */
    message(msg) {
      messagesVus.push(msg);
      if (messagesVus.length > 200) messagesVus.shift();
      chat.message(msg);
    },
    /** Arrête le chrono, les déplacements et le chat ; retire la table de la page. */
    detruire() {
      signal.arreter();
      effets.detruire();
      arretChrono?.();
      clearTimeout(minuteurTitre);
      pions.forEach((p) => { p.marche = true; });
      pions.clear();
      grand.removeEventListener('change', surEcran);
      chat?.detruire();
      el.remove();
    },
  };
}
