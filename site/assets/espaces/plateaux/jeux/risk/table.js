// ===== Humane Gang — Risk : la table de jeu (plateaux/jeux/risk/table.js) =====
/*
 * Rôle : affiche une partie de Risk en cours : bandeau (joueurs, chrono, quitter), barre des 3 phases, bandeau
 *   d'instruction (à qui le tour, quelle phase), carte du monde (42 territoires, vraies formes), checklist « Ton action
 *   en 3 étapes », panneau d'action selon la phase (mise en place, renforts, attaque, conquête, déplacement), bataille
 *   (dés, comparaison des paires, bilan), mes cartes et échanges, légende des joueurs, continents et bonus, journal,
 *   infos utiles, ma mission secrète, chat (à droite sur ordinateur, en tiroir sur téléphone).
 *   Le style est dans assets/espaces/plateaux/risk.css ; ici, le contenu, les actions et les animations.
 *   Les animations se déclenchent sur les vrais changements d'état (nouveau combat, troupes qui bougent) et ne
 *   bloquent jamais une action. Rien ne bouge si l'on demande moins de mouvement (prefers-reduced-motion).
 *   Les zones ne sont reconstruites que si leur contenu change. Les choix (territoires, dés, curseurs, cartes)
 *   se mettent à jour sur place, pour garder le focus et les saisies en cours.
 *   Effets de la maquette (à toi, troupes posées, dés, conquête) : ./effets.js, appelé après chaque rendu (maj).
 * Dépendances : commun/tour-signal.js (creerSignalTour), core.js (esc, toast), ../../api.js (plat, erreurTexte, nomDe, imageExiste),
 *   ../../vues/commun.js (bandeauHtml, brancherChrono, journalHtml, imagePlateau, envoyer, moiJoueur, joueurDe, avatarHtml,
 *   pseudoHtml), ../../vues/chat.js (creerChat, tiroirChat), ./plateau.js (plateauHtml, marquer, fleche, animations),
 *   ./effets.js (creerEffets), ../../../../commun/grille-clavier.js (voisinSpatial).
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire() }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 */
import { esc, toast } from '../../../../commun/core.js';
import { plat, erreurTexte, nomDe, imageExiste } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, imagePlateau, envoyer, moiJoueur, joueurDe, avatarHtml, pseudoHtml, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { plateauHtml, marquer, fleche, animerMouvement, animerChutes, animerCompteur } from './plateau.js';
import { creerEffets } from './effets.js';
import { voisinSpatial } from '../../../../commun/grille-clavier.js';

const ECRAN_GRAND = '(min-width: 761px)';
const MOUVEMENT_REDUIT = '(prefers-reduced-motion: reduce)';
const ICONE_FAIT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
const ICONE_FLECHE = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"></path></svg>';
/** Phases de l'écran : 3 étapes (Renforts, Attaques, Déplacement), chacune regroupe les phases techniques. */
const NUM_PHASE = { placement: 1, renforts: 1, attaque: 2, conquete: 2, manoeuvre: 3 };
const TITRE_PHASE = { placement: 'Mise en place', renforts: 'Renforts', attaque: 'Attaques', conquete: 'Conquête', manoeuvre: 'Déplacement' };
const PHASES_BARRE = [[1, 'Renforts'], [2, 'Attaques'], [3, 'Déplacement']];
/** Noms courts des pastilles de la barre sur téléphone. */
const COURT = { 1: 'Renforts', 2: 'Attaques', 3: 'Dépl.' };
const SYMBOLES_DEFAUT = { infanterie: 'Infanterie', cavalerie: 'Cavalerie', artillerie: 'Artillerie', joker: 'Joker' };
/** Faces d'un dé : 4 tours de 1 à 6 ; la face v se trouve à l'indice 18 + (v - 1). */
const FACES_DE = Array.from({ length: 24 }, (_, k) => `<span>${(k % 6) + 1}</span>`).join('');
const decalageFace = (v) => -(18 + v - 1) * 44;

/** Texte noir sur fond clair, blanc sur fond foncé (lisible sur les couleurs d'armée). */
function estClair(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}
const troupes = (n) => `${n} troupe${n > 1 ? 's' : ''}`;
const armees = (n) => `${n} armée${n > 1 ? 's' : ''}`;
const plur = (n, mot) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/**
 * Combinaison valable pour un échange : trois identiques, trois différentes, ou avec un joker.
 * @param {string[]} ids cartes choisies.
 * @param {Array<{id: string, symbole: string}>} cartes mes cartes.
 */
function combinaisonValable(ids, cartes) {
  if (ids.length !== 3) return false;
  const symboles = ids.map((id) => cartes.find((c) => c.id === id)?.symbole);
  if (symboles.some((s) => !s)) return false;
  if (symboles.includes('joker')) return true;
  const differents = new Set(symboles).size;
  return differents === 1 || differents === 3;
}

/** Mouvement de troupes entre deux états : un seul territoire perd n troupes, un autre (même propriétaire) gagne n. */
function mouvementEntre(a, b) {
  const ta = a?.jeu?.territoires || {};
  const tb = b?.jeu?.territoires || {};
  const sources = [];
  const cibles = [];
  for (const id of Object.keys(tb)) {
    const x = ta[id];
    const y = tb[id];
    if (!x || !y || x.j !== y.j) continue;
    const d = (x.a || 0) - (y.a || 0);
    if (d > 0) sources.push([id, d]);
    else if (d < 0) cibles.push([id, -d]);
  }
  if (sources.length === 1 && cibles.length === 1 && sources[0][1] === cibles[0][1]) {
    return { de: sources[0][0], vers: cibles[0][0], n: cibles[0][1] };
  }
  return null;
}

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="rk-bandeau" data-bandeau></header>
  <div class="rk-barre" role="toolbar" aria-label="Actions de la partie">
    <div class="rk-onglets" role="group" aria-label="Affichage">
      <button type="button" class="rk-onglet" data-onglet-carte aria-pressed="true">Carte et actions</button>
      <button type="button" class="rk-onglet" data-onglet-infos aria-pressed="false">Joueurs et journal</button>
    </div>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <p class="rk-elimine" data-elimine hidden></p>

  <ol class="rk-phases" data-phases aria-label="Phases du tour"></ol>
  <section class="rk-banniere" aria-labelledby="rk-banniere-titre" data-banniere></section>

  <div class="rk-corps">
    <div class="rk-colonne-carte">
      <div class="rk-zoom" role="group" aria-label="Zoom de la carte" data-zone="carte">
        <button type="button" class="rk-btn rk-btn-ghost rk-rond" data-zoom="-1" aria-label="Dézoomer la carte">−</button>
        <button type="button" class="rk-btn rk-btn-ghost rk-rond" data-zoom="1" aria-label="Zoomer la carte">+</button>
      </div>
      <section class="rk-carte-zone" data-zone="carte" aria-label="Carte du monde, 42 territoires" data-carte></section>
      <section class="rk-bloc rk-legende" data-zone="infos" aria-labelledby="rk-joueurs-titre" data-joueurs></section>
      <section class="rk-bloc" data-zone="infos" aria-labelledby="rk-continents-titre">
        <h2 id="rk-continents-titre" class="rk-bloc-titre">Continents et bonus</h2>
        <ul class="rk-continents" data-continents></ul>
        <p class="rk-note">Chaque bulle indique les troupes du territoire. Pointillés : routes maritimes.</p>
      </section>
      <div class="rk-bas" data-zone="infos">
        <section class="rk-bloc" aria-labelledby="rk-journal-titre">
          <h2 id="rk-journal-titre" class="rk-bloc-titre">Journal</h2>
          <div data-journal></div>
        </section>
        <section class="rk-bloc" aria-labelledby="rk-infos-titre" data-infos>
          <h2 id="rk-infos-titre" class="rk-bloc-titre">Infos utiles</h2>
          <div data-infos-contenu></div>
        </section>
      </div>
    </div>

    <div class="rk-colonne-cote">
      <section class="rk-bloc rk-checklist" data-zone="carte" aria-labelledby="rk-checklist-titre" data-checklist></section>
      <section class="rk-panneau" data-zone="carte" aria-labelledby="rk-action-titre" aria-live="polite" data-panneau></section>
      <section class="rk-bloc rk-bataille" data-zone="carte" aria-labelledby="rk-bataille-titre" data-bataille></section>
      <section class="rk-bloc" data-zone="carte" aria-labelledby="rk-cartes-titre" data-cartes></section>
      <section class="rk-bloc" data-zone="infos" aria-labelledby="rk-mission-titre" data-mission></section>
      <div class="rk-chat-zone" data-chat></div>
    </div>
  </div>
  <div class="rk-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de Risk dans root.
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
  el.className = 'rk-table';
  el.dataset.onglet = 'carte';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), elimine: q('[data-elimine]'), phases: q('[data-phases]'), banniere: q('[data-banniere]'),
    carte: q('[data-carte]'), continents: q('[data-continents]'), panneau: q('[data-panneau]'), checklist: q('[data-checklist]'),
    bataille: q('[data-bataille]'), cartes: q('[data-cartes]'), joueurs: q('[data-joueurs]'), mission: q('[data-mission]'),
    journal: q('[data-journal]'), infos: q('[data-infos-contenu]'), chatZone: q('[data-chat]'), tiroirChatZone: q('[data-tiroir-chat]'),
    annonce: q('[data-annonce]'), ongletCarte: q('[data-onglet-carte]'), ongletInfos: q('[data-onglet-infos]'), quitter: q('[data-quitter]'),
    zoom: q('.rk-zoom'),
  };

  let etat = null;
  let occupe = false;
  let arretChrono = null;
  let imageFond = null;                  // URL de l'image de carte, si elle existe
  const cles = {};                       // clé du dernier rendu de chaque zone
  let brouillon = {};                    // troupes à placer ce tour : {territoire: n}, avant envoi
  let cartesSel = new Set();             // cartes choisies pour un échange
  let zoom = 1;                          // zoom de la carte (téléphone)
  let cleTour = '';                      // tour en cours : au changement, on oublie les choix
  let phaseVue = '';
  const choix = { de: null, vers: null, des: 3, conquete: null, manoeuvre: null };
  const messagesVus = [];                // pour recréer le chat si l'écran change de taille
  let dernierActif = null;

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

  /* ---------- Lecture de l'état ---------- */

  const jeu = () => etat?.jeu || {};
  const jm = () => jeu().moi || {};
  const monId = () => moiJoueur(etat)?.user_id ?? null;
  const moi = () => moiJoueur(etat);
  const phase = () => jeu().phase;
  const monTour = () => !!monId() && jeu().actif === monId();
  const peutAgir = () => !occupe && etat?.partie?.statut === 'en_cours' && !!moi() && !moi().elimine && !moi().parti;
  const terr = () => jeu().territoires || {};
  const proprio = (t) => terr()[t]?.j ?? null;
  const armees_ = (t) => terr()[t]?.a ?? 0;
  const nomT = (t) => nomDe(contenus, 'territoires', t);
  const nomJ = (uid) => joueurDe(etat, uid)?.pseudo || '?';
  const armeeDe = (uid) => {
    const id = joueurDe(etat, uid)?.etat?.armee;
    return (contenus.armees || []).find((a) => a.id === id) || null;
  };
  const couleurJoueur = (uid) => armeeDe(uid)?.couleur || '#5A5650';
  const nomArmee = (uid) => armeeDe(uid)?.nom || '';
  const symboleNom = (s) => nomDe(contenus, 'symboles', s) || SYMBOLES_DEFAUT[s] || '';
  /** Territoires voisins ennemis d'un territoire (à moi). */
  const ennemisDe = (t) => (jeu().voisins?.[t] || []).filter((v) => proprio(v) !== monId());
  /** Territoires de mon groupe reliés à t par mes territoires (déplacement de fin de tour). */
  const relies = (t) => {
    const vus = new Set([t]);
    const file = [t];
    while (file.length) {
      const x = file.shift();
      for (const v of jeu().voisins?.[x] || []) {
        if (!vus.has(v) && proprio(v) === monId()) { vus.add(v); file.push(v); }
      }
    }
    return vus;
  };
  const mesTerritoires = () => Object.keys(terr()).filter((t) => proprio(t) === monId());
  /** Troupes à placer maintenant (mise en place : mon stock ; renforts : ceux du tour). */
  const disponible = () => (phase() === 'placement'
    ? (jm().a_placer ?? moi()?.etat?.a_placer ?? 0)
    : (jeu().renforts ?? 0));
  const totalBrouillon = () => Object.values(brouillon).reduce((s, n) => s + n, 0);
  const cartes = () => jm().cartes || [];

  /** Cibles possibles selon la phase et le choix en cours (surlignées sur la carte). */
  function cibles() {
    if (!monTour() || !choix.de) return [];
    if (phase() === 'attaque') return ennemisDe(choix.de);
    if (phase() === 'manoeuvre') return [...relies(choix.de)].filter((t) => t !== choix.de);
    return [];
  }

  /** Territoires sur lesquels on peut cliquer maintenant. */
  function clicsCalcules() {
    const set = new Set();
    if (!peutAgir()) return set;
    const p = phase();
    if (p === 'placement') {
      if (disponible() > 0) mesTerritoires().forEach((t) => set.add(t));
      return set;
    }
    if (!monTour()) return set;
    if (p === 'renforts') mesTerritoires().forEach((t) => set.add(t));
    if (p === 'attaque' || p === 'manoeuvre') {
      mesTerritoires().filter((t) => armees_(t) >= 2).forEach((t) => set.add(t));
      cibles().forEach((t) => set.add(t));
    }
    return set;
  }

  /* ---------- Suivi du tour : on oublie les choix quand le tour change ---------- */

  function suivreTour() {
    const j = jeu();
    const cle = `${etat.partie?.nb_tours}|${j.actif}`;
    if (cle !== cleTour) {
      cleTour = cle;
      brouillon = {};
      cartesSel = new Set();
      choix.de = null; choix.vers = null; choix.conquete = null; choix.manoeuvre = null;
    }
    if (j.phase !== phaseVue) {
      // Entre l'attaque et la conquête, le territoire de départ reste utile.
      if (!(j.phase === 'conquete' && phaseVue === 'attaque')) { choix.de = null; choix.vers = null; }
      choix.conquete = null; choix.manoeuvre = null;
      if (j.phase !== 'placement' && j.phase !== 'renforts') brouillon = {};
      phaseVue = j.phase;
    }
    // Choix devenus invalides (territoire perdu, plus assez de troupes).
    if (j.phase !== 'conquete' && choix.de && (proprio(choix.de) !== monId() || armees_(choix.de) < 2)) {
      choix.de = null;
      choix.vers = null;
    }
    if (choix.vers && !cibles().includes(choix.vers)) choix.vers = null;
    // Cartes envoyées ou disparues : on retire de la sélection.
    const ids = new Set(cartes().map((c) => c.id));
    cartesSel = new Set([...cartesSel].filter((id) => ids.has(id)));
  }

  /* ---------- Rendu : bandeau et chrono ---------- */

  function rendreBandeau() {
    const titre = esc(contenus.nom || 'Risk');
    const html = bandeauHtml(etat, { titre, sousTitre: `Code ${esc(code)}` });
    if (cles.bandeau === html) return;
    cles.bandeau = html;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  function rendreElimine() {
    const m = moi();
    const on = !!m?.elimine;
    refs.elimine.hidden = !on;
    refs.elimine.textContent = on ? 'Tu as été éliminé : tu peux regarder la suite.' : '';
    refs.quitter.disabled = !m || m.parti === true;
  }

  /* ---------- Rendu : barre des 3 phases ---------- */

  function rendrePhases() {
    const p = phase();
    const rang = NUM_PHASE[p] ?? 0;
    const actif = jeu().actif ?? null;
    const cle = JSON.stringify([rang, actif, etat.partie?.statut]);
    if (cles.phases === cle) return;
    cles.phases = cle;
    const sous = (n) => {
      if (n < rang) return n === 1 ? 'Troupes reçues et posées' : 'Attaques terminées';
      if (n > rang) return n === 2 ? 'Attaquer un voisin, avec des dés' : '1 mouvement, après les attaques';
      if (n === 1) return p === 'placement' ? 'Tout le monde pose en même temps' : `Tour de ${nomJ(actif)}`;
      if (n === 2) return p === 'conquete' ? 'Conquête : déplacer les troupes' : `Tour de ${nomJ(actif)}`;
      return `Tour de ${nomJ(actif)}`;
    };
    const etatPhase = (n) => (n < rang ? 'fait' : (n === rang ? 'actuelle' : 'venir'));
    const libelle = { fait: 'terminée', actuelle: 'en cours', venir: 'à venir' };
    refs.phases.innerHTML = PHASES_BARRE.map(([n, nom], i) => {
      const ea = etatPhase(n);
      const fleche = i < PHASES_BARRE.length - 1 ? `<li class="rk-phase-fleche${ea === 'fait' ? ' is-fait' : ''}" aria-hidden="true">${ICONE_FLECHE}</li>` : '';
      return `<li class="rk-phase is-${ea}"${ea === 'actuelle' ? ' aria-current="step"' : ''}>
        <span class="rk-phase-etat">${ea === 'fait' ? ICONE_FAIT : ''}Phase ${n} · ${libelle[ea]}</span>
        <span class="rk-phase-nom">${esc(nom)}</span>
        <span class="rk-phase-court">${n} · ${esc(COURT[n])}</span>
        <span class="rk-phase-sous">${esc(sous(n))}</span>
      </li>${fleche}`;
    }).join('');
  }

  /* ---------- Rendu : bandeau d'instruction et checklist ---------- */

  /** Étapes de mon action (checklist) selon la phase, ou un message quand il n'y a rien à faire. */
  function etapesAction() {
    const m = moi();
    if (!m || m.parti) return { intro: 'Tu regardes la partie : pas d\'action à faire.', etapes: null };
    if (m.elimine) return { intro: 'Tu es éliminé : tu peux suivre la partie.', etapes: null };
    if (etat?.partie?.statut !== 'en_cours') return { intro: 'La partie est terminée.', etapes: null };
    const p = phase();
    const total = totalBrouillon();
    const reste = Math.max(0, disponible() - total);
    if (p === 'placement') {
      return { etapes: [
        { titre: 'Pose tes troupes sur tes territoires', etat: reste > 0 ? 'actuel' : 'fait', detail: reste > 0 ? `Il te reste ${plur(reste, 'troupe')} à poser (+1 par clic)` : 'Tout est posé' },
        { titre: 'Valide tes troupes', etat: disponible() <= 0 ? 'fait' : (total > 0 ? 'actuel' : 'attente'), detail: total > 0 ? `${plur(total, 'troupe')} à valider` : 'Rien de posé pour l\'instant' },
        { titre: 'Attends les autres joueurs', etat: 'attente', detail: 'Chacun pose en même temps' },
      ] };
    }
    if (!monTour()) return { intro: `C'est à ${nomJ(jeu().actif)} de jouer. Tu peux suivre la carte et le journal.`, etapes: null };
    if (p === 'renforts') {
      const obligatoire = cartes().length >= 5;
      return { etapes: [
        { titre: 'Pose tes renforts sur tes territoires', etat: reste > 0 ? 'actuel' : 'fait', detail: reste > 0 ? `Il te reste ${plur(reste, 'troupe')} à poser (+1 par clic)` : 'Tout est posé' },
        { titre: 'Échange 3 cartes si tu peux', etat: obligatoire ? 'actuel' : 'attente', detail: obligatoire ? 'Obligatoire : tu as 5 cartes ou plus' : `Tu as ${plur(cartes().length, 'carte')}` },
        { titre: 'Valide tes troupes', etat: !obligatoire && total > 0 ? 'actuel' : 'attente', detail: total > 0 ? `${plur(total, 'troupe')} à valider` : 'Rien de posé pour l\'instant' },
      ] };
    }
    if (p === 'attaque') {
      const de = choix.de;
      const vers = choix.vers;
      return { etapes: [
        { titre: 'Choisis un territoire d\'où attaquer', etat: de ? 'fait' : 'actuel', detail: de ? `Fait : ${nomT(de)}, ${armees(armees_(de))}` : 'Un de tes territoires avec au moins 2 armées' },
        { titre: 'Choisis un voisin ennemi', etat: vers ? 'fait' : (de ? 'actuel' : 'attente'), detail: vers ? `Fait : ${nomT(vers)}, ${armees(armees_(vers))}, à ${nomJ(proprio(vers))}` : (de ? 'Un voisin en surbrillance sur la carte' : 'Après le territoire de départ') },
        { titre: 'Lance les dés', etat: de && vers ? 'actuel' : 'attente', detail: de && vers ? `À faire : tu lances ${plur(choix.des, 'dé')}, ${nomJ(proprio(vers))} ${plur(Math.min(2, armees_(vers)), 'dé')}` : 'Après les deux choix' },
      ] };
    }
    if (p === 'conquete') {
      const c = jeu().conquete;
      return { etapes: [
        { titre: 'Territoire conquis', etat: 'fait', detail: c ? nomT(c.vers) : '' },
        { titre: 'Choisis combien de troupes avancer', etat: 'actuel', detail: c ? `Entre ${c.min} et ${Math.max(c.min, armees_(c.de) - 1)}` : '' },
        { titre: 'Valide le déplacement', etat: 'attente', detail: '' },
      ] };
    }
    if (p === 'manoeuvre') {
      const de = choix.de;
      const vers = choix.vers;
      return { etapes: [
        { titre: 'Choisis ton territoire de départ', etat: de ? 'fait' : 'actuel', detail: de ? `Fait : ${nomT(de)}, ${armees(armees_(de))}` : 'Un de tes territoires avec au moins 2 armées' },
        { titre: 'Choisis un territoire relié', etat: vers ? 'fait' : (de ? 'actuel' : 'attente'), detail: vers ? `Fait : ${nomT(vers)}` : (de ? 'Un territoire relié, en surbrillance' : 'Après le départ') },
        { titre: 'Valide le déplacement, ou finis ton tour', etat: de && vers ? 'actuel' : 'attente', detail: '' },
      ] };
    }
    return { intro: '', etapes: null };
  }

  /** Bandeau d'instruction : « À toi, X — Phase N : ... » et une ligne d'aide. */
  function rendreBanniere() {
    const p = phase();
    const n = NUM_PHASE[p] ?? '';
    const titre = TITRE_PHASE[p] || '';
    const m = moi();
    const info = etapesAction();
    let principal;
    let indice;
    if (!m || m.elimine || m.parti || etat?.partie?.statut !== 'en_cours') {
      principal = `Tour de ${nomJ(jeu().actif)} — Phase ${n} : ${titre}`;
      indice = m?.elimine ? 'Tu regardes la suite.' : 'Tu regardes la partie.';
    } else if (p === 'placement') {
      const reste = Math.max(0, disponible() - totalBrouillon());
      principal = reste > 0 || totalBrouillon() > 0
        ? `À toi, ${m.pseudo} — Phase 1 : Mise en place`
        : `En attente des autres — Phase 1 : Mise en place`;
      indice = reste > 0 || totalBrouillon() > 0 ? 'Pose tes troupes sur tes territoires, puis valide.' : 'Tes troupes sont posées.';
    } else if (monTour()) {
      principal = `À toi, ${m.pseudo} — Phase ${n} : ${titre}`;
      const actuelle = info.etapes?.find((e) => e.etat === 'actuel');
      indice = actuelle ? actuelle.titre : '';
    } else {
      principal = `Tour de ${nomJ(jeu().actif)} — Phase ${n} : ${titre}`;
      indice = 'Tu peux suivre la carte et le journal.';
    }
    const cle = JSON.stringify([principal, indice]);
    if (cles.banniere === cle) return;
    cles.banniere = cle;
    refs.banniere.innerHTML = `<span class="rk-banniere-icone" aria-hidden="true"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="3.5"></circle></svg></span>
      <div class="rk-banniere-texte"><h2 id="rk-banniere-titre" class="rk-banniere-titre">${esc(principal)}</h2>${indice ? `<p class="rk-banniere-indice">${esc(indice)}</p>` : ''}</div>`;
  }

  /** Checklist « Ton action en 3 étapes ». */
  function rendreChecklist() {
    const info = etapesAction();
    const cle = JSON.stringify(info);
    if (cles.checklist === cle) return;
    cles.checklist = cle;
    if (!info.etapes) {
      refs.checklist.innerHTML = `<h2 id="rk-checklist-titre" class="rk-bloc-titre">Ton action</h2><p class="rk-note">${esc(info.intro)}</p>`;
      return;
    }
    const liste = info.etapes.map((s, i) => {
      const libelle = s.etat === 'fait' ? '(fait)' : (s.etat === 'actuel' ? '(à faire)' : '');
      const rond = s.etat === 'fait' ? ICONE_FAIT : esc(i + 1);
      return `<li class="rk-etape is-${s.etat}"${s.etat === 'actuel' ? ' aria-current="step"' : ''}>
        <span class="rk-etape-rond" aria-hidden="true">${rond}</span>
        <span class="rk-etape-texte"><strong>${esc(s.titre)}${libelle ? `<span class="visually-hidden"> ${libelle}</span>` : ''}</strong>${s.detail ? `<span>${esc(s.detail)}</span>` : ''}</span>
      </li>`;
    }).join('');
    refs.checklist.innerHTML = `<h2 id="rk-checklist-titre" class="rk-bloc-titre">Ton action en 3 étapes</h2><ol class="rk-checklist-liste">${liste}</ol>`;
  }

  /* ---------- Rendu : carte ---------- */

  /** Territoires pour la carte : propriétaire, armée, troupes, état cliquable à la construction. */
  function territoiresVue() {
    return (contenus.territoires || []).map((t) => {
      const pr = proprio(t.id);
      const couleur = pr != null ? couleurJoueur(pr) : '#5A5650';
      return {
        id: t.id, nom: t.nom, couleur, clair: estClair(couleur), a: armees_(t.id),
        mine: pr != null && pr === monId(), clic: false,
        proprietaire: pr != null ? nomJ(pr) : '', armee: pr != null ? nomArmee(pr) : '',
      };
    });
  }

  function continentsVue() {
    const par = jeu().continents || {};
    return (contenus.continents || []).map((c) => ({
      id: c.id, nom: c.nom, couleur: c.couleur || '#777',
      membres: Object.keys(par).filter((t) => par[t] === c.id),
    }));
  }

  function rendreCarte() {
    const terrs = territoiresVue();
    const cle = JSON.stringify([terrs, imageFond]);
    if (cles.carte === cle) return;
    cles.carte = cle;
    cles.fleche = null;
    refs.carte.innerHTML = plateauHtml({ image: imageFond, terrs });
    majMarquage();
    majBrouillon();
  }

  /** Active les territoires cliquables, marque la sélection (sans reconstruire la carte). */
  function majMarquage() {
    const clics = clicsCalcules();
    const liste = cibles();
    refs.carte.querySelectorAll('[data-terr]').forEach((b) => {
      const id = b.dataset.terr;
      const ok = clics.has(id);
      b.disabled = !ok;
      b.classList.toggle('is-clic', ok);
    });
    marquer(refs.carte, { de: choix.de, vers: choix.vers, cibles: liste, clics: [...clics] });
    majFleche();
  }

  /** Flèche sur la carte : la sélection en cours, sinon le combat (départ vers arrivée). */
  function majFleche() {
    const c = jeu().combat;
    let sel = { de: null, vers: null };
    if (choix.de && choix.vers) sel = { de: choix.de, vers: choix.vers, style: 'choix' };
    else if (c && ['attaque', 'conquete'].includes(phase())) sel = { de: c.de, vers: c.vers, style: 'attaque' };
    const cle = JSON.stringify(sel);
    if (cles.fleche === cle) return;
    cles.fleche = cle;
    fleche(refs.carte, sel);
  }

  function rendreContinents() {
    const par = jeu().continents || {};
    const cle = JSON.stringify([terr(), par]);
    if (cles.continents === cle) return;
    cles.continents = cle;
    const bonus = jeu().bonus || {};
    refs.continents.innerHTML = (contenus.continents || []).map((c) => {
      const membres = Object.keys(par).filter((t) => par[t] === c.id);
      const compte = {};
      membres.forEach((t) => { const pr = proprio(t); if (pr != null) compte[pr] = (compte[pr] || 0) + 1; });
      const [meilleur, n] = Object.entries(compte).sort((a, b) => b[1] - a[1])[0] || [null, 0];
      const tenu = meilleur != null && n === membres.length;
      const texte = tenu
        ? `${esc(nomJ(meilleur))}, ${membres.length} sur ${membres.length}`
        : (meilleur != null ? `${esc(nomJ(meilleur))}, ${n} sur ${membres.length}` : 'personne');
      return `<li class="rk-continent${tenu ? ' is-tenu' : ''}">
        <span class="rk-swatch" style="background:${esc(c.couleur)}" aria-hidden="true"></span>
        <span class="rk-continent-nom"><strong>${esc(c.nom)}</strong><span class="rk-continent-etat">${texte}</span></span>
        <span class="rk-continent-bonus">${tenu ? `+${esc(bonus[c.id] ?? '')}` : `+${esc(bonus[c.id] ?? '')} si tenu`}</span>
      </li>`;
    }).join('');
  }

  /* ---------- Rendu : légende des joueurs ---------- */

  function rendreJoueurs() {
    const joueurs = etat.joueurs || [];
    const j = jeu();
    const lignes = joueurs.map((x) => {
      const mais = Object.keys(terr()).filter((t) => proprio(t) === x.user_id);
      return {
        uid: x.user_id, couleur: couleurJoueur(x.user_id), armee: nomArmee(x.user_id),
        nbTerr: mais.length, nbTroupes: mais.reduce((s, t) => s + armees_(t), 0),
        nbCartes: x.etat?.nb_cartes ?? 0, tour: j.actif === x.user_id, elimine: !!x.elimine,
      };
    });
    const cle = JSON.stringify([lignes, etat.partie?.statut]);
    if (cles.joueurs === cle) return;
    cles.joueurs = cle;
    const liste = lignes.map((l) => {
      const jx = joueurDe(etat, l.uid);
      const statut = l.elimine ? '<span class="rk-etiquette">éliminé</span>'
        : (l.tour ? `<span class="rk-etiquette is-tour">${l.uid === monId() ? 'À toi' : 'Son tour'}</span>` : '');
      return `<li class="rk-legende-ligne${l.tour ? ' is-tour' : ''}${l.elimine ? ' is-elimine' : ''}">
        <span class="rk-legende-couleur" style="background:${esc(l.couleur)}" aria-hidden="true"></span>
        <span class="rk-legende-nom">
          <span class="rk-joueur-ligne">${avatarHtml(jx, 22)} ${pseudoHtml(jx)} ${statut}</span>
          <span class="rk-legende-armee">Armée ${esc(l.armee || '?')}</span>
        </span>
        <span class="rk-legende-chiffres">
          <span><strong>${esc(l.nbTroupes)}</strong> armée${l.nbTroupes > 1 ? 's' : ''}</span>
          <span>${esc(l.nbTerr)} territoire${l.nbTerr > 1 ? 's' : ''}</span>
          <span>${esc(l.nbCartes)} carte${l.nbCartes > 1 ? 's' : ''}</span>
        </span>
      </li>`;
    }).join('');
    refs.joueurs.innerHTML = `<h2 id="rk-joueurs-titre" class="rk-bloc-titre">Joueurs et armées</h2><ul class="rk-liste-joueurs">${liste}</ul>`;
  }

  /* ---------- Rendu : ma mission ---------- */

  function rendreMission() {
    const missions = contenus.missions || [];
    const m = jm().mission || {};
    const actif = jeu().missions !== false;
    const cle = JSON.stringify([actif, m.id, m.type, m.cible, moi() ? 1 : 0]);
    if (cles.mission === cle) return;
    cles.mission = cle;
    if (!moi()) {
      refs.mission.innerHTML = `<h2 id="rk-mission-titre" class="rk-bloc-titre">Mission secrète</h2><p class="rk-note">Tu regardes la partie : pas de mission.</p>`;
      return;
    }
    if (!actif) {
      refs.mission.innerHTML = `<h2 id="rk-mission-titre" class="rk-bloc-titre">Mission secrète</h2><p class="rk-note">Pas de mission cette fois : conquiers le monde.</p>`;
      return;
    }
    const texte = missions.find((x) => x.id === m.id)?.texte || '';
    const detruit = m.type === 'detruire' && m.cible;
    const sansCible = m.type === 'm6' && /^m(9|1[0-4])$/.test(String(m.id || ''));
    const complement = detruit
      ? `<p class="rk-note">Ta cible : ${esc(nomJ(m.cible))}. Si elle est éliminée avant toi, ta mission devient : conquérir 24 territoires.</p>`
      : (sansCible ? '<p class="rk-note">Ta cible n\'est plus en jeu : conquiers 24 territoires.</p>' : '');
    refs.mission.innerHTML = `<h2 id="rk-mission-titre" class="rk-bloc-titre">Ma mission secrète</h2>
      <details class="rk-mission">
        <summary>Voir mon objectif</summary>
        <p>${esc(texte || 'Mission inconnue.')}</p>
        ${complement}
      </details>`;
  }

  /* ---------- Rendu : mes cartes et échange ---------- */

  function rendreCartes() {
    const liste = cartes();
    const mon = monId() != null;
    const cle = JSON.stringify([liste, mon, phase(), monTour(), etat.partie?.statut]);
    if (cles.cartes === cle) { majEchange(); return; }
    cles.cartes = cle;
    if (!mon) { refs.cartes.innerHTML = ''; return; }
    const items = liste.map((c) => {
      const libelle = c.symbole === 'joker' ? symboleNom('joker') : symboleNom(c.symbole);
      const sous = c.symbole === 'joker' ? 'Joker' : nomT(c.id);
      return `<li><button type="button" class="rk-carte-main" data-carte-id="${esc(c.id)}" aria-pressed="${cartesSel.has(c.id)}">
        <span class="rk-carte-symbole">${esc(libelle)}</span><span class="rk-carte-nom">${esc(sous)}</span></button></li>`;
    }).join('');
    refs.cartes.innerHTML = `<h2 id="rk-cartes-titre" class="rk-bloc-titre">Mes cartes</h2>
      <ul class="rk-liste-cartes">${items || '<li class="rk-vide">Aucune carte.</li>'}</ul>
      <p class="rk-note" data-alerte-cartes></p>
      <div class="rk-pied"><button type="button" class="rk-btn rk-btn-primary" data-echanger disabled>Échanger ces 3 cartes</button></div>`;
    majEchange();
  }

  /** Met à jour l'état des cartes et du bouton d'échange sans reconstruire la zone. */
  function majEchange() {
    const liste = cartes();
    const renforts = phase() === 'renforts' && monTour() && peutAgir();
    const obligatoire = liste.length >= 5;
    const valable = renforts && combinaisonValable([...cartesSel], liste);
    const alerte = refs.cartes.querySelector('[data-alerte-cartes]');
    if (alerte) {
      alerte.textContent = obligatoire && renforts
        ? 'Tu as 5 cartes ou plus : échange une combinaison avant de placer tes troupes.'
        : (liste.length >= 3 ? 'Choisis trois cartes en même temps : trois identiques, trois différentes, ou un joker.' : '');
    }
    const bouton = refs.cartes.querySelector('[data-echanger]');
    if (bouton) bouton.disabled = !valable || occupe;
    refs.cartes.querySelectorAll('[data-carte-id]').forEach((b) => {
      b.setAttribute('aria-pressed', String(cartesSel.has(b.dataset.carteId)));
      b.disabled = !renforts;
    });
  }

  /* ---------- Rendu : bataille (dés, paires, bilan) ---------- */

  /** Une paire de dés comparée : le plus haut gagne, égalité au défenseur. */
  function htmlBataille(c, lancer) {
    const att = c.des_att || [];
    const def = c.des_def || [];
    const n = Math.min(att.length, def.length);
    const de = (v, camp, i) => `<span class="rk-de is-${camp}" data-valeur="${esc(v)}" style="--end:${decalageFace(v)}px;--delai:${(i * 0.12).toFixed(2)}s"><span class="rk-roule" aria-hidden="true">${FACES_DE}</span></span>`;
    const dAtt = att.map((v, i) => de(v, 'att', i)).join('');
    const dDef = def.map((v, i) => de(v, 'def', i)).join('');
    const gagneAtt = new Set();
    const gagneDef = new Set();
    const paires = [];
    for (let i = 0; i < n; i += 1) {
      const attGagne = att[i] > def[i];
      if (attGagne) { gagneAtt.add(i); } else { gagneDef.add(i); }
      const perdant = attGagne ? nomJ(c.defenseur) : nomJ(c.attaquant);
      paires.push(`<li class="rk-paire">
        <span class="rk-paire-des"><span class="rk-paire-val">${esc(att[i])}</span> contre <span class="rk-paire-val">${esc(def[i])}</span></span>
        <span class="rk-paire-texte">${esc(perdant)} perd 1 armée.</span></li>`);
    }
    for (let i = n; i < att.length; i += 1) paires.push(`<li class="rk-paire is-seul">${esc(att[i])} n'est pas comparé (${plur(att.length, 'dé')} contre ${plur(def.length, 'dé')}).</li>`);
    for (let i = n; i < def.length; i += 1) paires.push(`<li class="rk-paire is-seul">${esc(def[i])} n'est pas comparé (${plur(att.length, 'dé')} contre ${plur(def.length, 'dé')}).</li>`);
    const dAttMarque = att.map((v, i) => de(v, gagneAtt.has(i) ? 'att is-gagne' : (i < n ? 'att is-perd' : 'att'), i)).join('');
    const dDefMarque = def.map((v, i) => de(v, gagneDef.has(i) ? 'def is-gagne' : (i < n ? 'def is-perd' : 'def'), i)).join('');
    const sujet = `${nomT(c.de)} contre ${nomT(c.vers)}`;
    return `<h2 id="rk-bataille-titre" class="rk-bloc-titre rk-bataille-entete">Bataille
        <button type="button" class="rk-btn rk-btn-ghost rk-rejouer" data-rejouer>Rejouer</button></h2>
      <div class="rk-bataille${lancer ? ' is-lancer' : ''}">
        <p class="rk-bataille-sujet">${esc(sujet)}</p>
        <div class="rk-des-duel">
          <div class="rk-des-camp">
            <span class="rk-des-nom">${esc(nomJ(c.attaquant))} · attaque</span>
            <div class="rk-des-ligne">${dAttMarque || dAtt}</div>
          </div>
          <span class="rk-des-contre">contre</span>
          <div class="rk-des-camp is-droite">
            <span class="rk-des-nom">${esc(nomJ(c.defenseur))} · défend</span>
            <div class="rk-des-ligne">${dDefMarque || dDef}</div>
          </div>
        </div>
        <ul class="rk-paires" aria-label="Comparaison des dés">${paires.join('')}</ul>
        <p class="rk-bilan">Bilan : ${esc(nomJ(c.attaquant))} perd ${troupes(c.pertes_att || 0)}, ${esc(nomJ(c.defenseur))} perd ${troupes(c.pertes_def || 0)}.</p>
        <p class="rk-note">Le plus haut dé gagne, égalité au défenseur. ${esc(nomT(c.vers))} : ${troupes(armees_(c.vers))}.</p>
      </div>`;
  }

  /** La bataille du dernier combat ; le lancer n'est joué que pour un nouveau combat (ou « Rejouer »). */
  function rendreBataille(lancer = false) {
    const c = jeu().combat || null;
    const cle = JSON.stringify(c);
    if (cles.bataille === cle && !lancer) return;
    cles.bataille = cle;
    refs.bataille.innerHTML = c
      ? htmlBataille(c, lancer && !reduit.matches)
      : `<h2 id="rk-bataille-titre" class="rk-bloc-titre">Bataille</h2><p class="rk-note">Pas de bataille pour l'instant. Les dés et le bilan apparaissent ici.</p>`;
  }

  /* ---------- Rendu : journal et infos utiles ---------- */

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  function rendreInfos() {
    const j = jeu();
    const cle = JSON.stringify([j.renforts, j.prochain_echange, cartes().length, j.phase, j.actif, !!moi()]);
    if (cles.infos === cle) return;
    cles.infos = cle;
    const lignes = [];
    if (j.phase === 'renforts' || j.phase === 'placement') {
      lignes.push(`<p>Renforts de ${esc(nomJ(j.actif))} : <strong>${esc(j.renforts ?? 0)}</strong> armée${(j.renforts ?? 0) > 1 ? 's' : ''}.</p>`);
    }
    lignes.push(`<p>Prochain échange de cartes : <strong>${esc(j.prochain_echange ?? '—')}</strong> armées.</p>`);
    if (moi()) {
      const n = cartes().length;
      lignes.push(`<p>${n >= 5
        ? '<strong class="rk-alerte-texte">Tu as 5 cartes ou plus : l\'échange est obligatoire.</strong>'
        : `Tes cartes : <strong>${esc(n)}</strong>. L'échange est obligatoire à partir de 5.`}</p>`);
    }
    refs.infos.innerHTML = lignes.join('');
  }

  /* ---------- Rendu : panneau d'action ---------- */

  /** Mise en place et renforts : liste des troupes posées, boutons − et + (sans reconstruire la liste au focus). */
  function vueDeploiement({ titre, texte, bloquerValider = false, extra = '' }) {
    return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">${esc(titre)}</h2>
      <p>${texte}</p>
      ${extra}
      <ul class="rk-brouillon" data-brouillon aria-label="Troupes posées ce tour"></ul>
      <p class="rk-compte"><span>Il te reste</span> <strong data-reste>0</strong> <span>à placer.</span></p>
      <div class="rk-pied">
        <button type="button" class="rk-btn rk-btn-ghost" data-effacer>Effacer</button>
        <button type="button" class="rk-btn rk-btn-primary" data-valider ${bloquerValider ? 'disabled' : ''}>Valider mes troupes</button>
      </div>`;
  }

  function vueAttente(texte = '') {
    const actif = jeu().actif;
    return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">C'est à ${esc(nomJ(actif))} de jouer</h2>
      <p>${esc(texte)}</p>`;
  }

  function vueAttaque() {
    const de = choix.de;
    const vers = choix.vers;
    const max = de ? Math.max(1, Math.min(3, armees_(de) - 1)) : 3;
    if (choix.des > max) choix.des = max;
    const options = [1, 2, 3].filter((n) => n <= max).map((n) => `<button type="button" class="rk-btn rk-choix" aria-pressed="${n === choix.des}" data-des="${n}">${n} dé${n > 1 ? 's' : ''}</button>`).join('');
    const intro = de
      ? `Depuis <strong>${esc(nomT(de))}</strong> (${troupes(armees_(de))}).`
      : 'Clique un de tes territoires avec au moins 2 troupes, puis un voisin ennemi en surbrillance.';
    const cible = de && vers
      ? `<p>Contre <strong>${esc(nomT(vers))}</strong> : ${troupes(armees_(vers))}, à ${esc(nomJ(proprio(vers)))} (armée ${esc(nomArmee(proprio(vers)))}).</p>`
      : (de ? '<p class="rk-note">Choisis un voisin ennemi en surbrillance sur la carte.</p>' : '');
    return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Attaque</h2>
      <p>${intro}</p>${cible}
      ${de ? `<div class="rk-des" role="group" aria-label="Nombre de dés">${options}</div>` : ''}
      <div class="rk-pied">
        <button type="button" class="rk-btn rk-btn-primary rk-btn-grand" data-attaquer ${de && vers ? '' : 'disabled'}>Lancer l'attaque (${plur(choix.des, 'dé')})</button>
        <button type="button" class="rk-btn rk-btn-ghost" data-arreter>Terminer les attaques → Déplacement</button>
      </div>`;
  }

  function vueConquete() {
    const c = jeu().conquete;
    if (!c) return vueAttente();
    const max = Math.max(c.min, armees_(c.de) - 1);
    const n = Math.min(max, Math.max(c.min, choix.conquete ?? c.min));
    choix.conquete = n;
    return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Conquête</h2>
      <p><strong>${esc(nomT(c.vers))}</strong> est à toi. Déplace des troupes de ${esc(nomT(c.de))} vers lui : au moins ${c.min}, au plus ${max}.</p>
      <div class="rk-curseur">
        <label for="rk-avancer-${esc(code)}">Troupes déplacées</label>
        <input type="range" id="rk-avancer-${esc(code)}" min="${c.min}" max="${max}" value="${n}" data-curseur="avancer">
        <output data-sortie="avancer">${n}</output>
      </div>
      <div class="rk-pied"><button type="button" class="rk-btn rk-btn-primary rk-btn-grand" data-avancer>Déplacer ${n} troupe${n > 1 ? 's' : ''}</button></div>`;
  }

  function vueManoeuvre() {
    const de = choix.de;
    const vers = choix.vers;
    const reste = de ? Math.max(0, armees_(de) - 1) : 0;
    const n = de && vers ? Math.min(reste, Math.max(1, choix.manoeuvre ?? 1)) : 1;
    choix.manoeuvre = n;
    const texte = !de
      ? 'Clique un de tes territoires de départ (au moins 2 troupes), puis un territoire relié, en surbrillance.'
      : (!vers ? `Depuis <strong>${esc(nomT(de))}</strong> : clique le territoire d'arrivée, en surbrillance.`
        : `De <strong>${esc(nomT(de))}</strong> vers <strong>${esc(nomT(vers))}</strong>.`);
    const curseur = de && vers && reste >= 1 ? `<div class="rk-curseur">
        <label for="rk-manoeuvre-${esc(code)}">Troupes déplacées</label>
        <input type="range" id="rk-manoeuvre-${esc(code)}" min="1" max="${reste}" value="${n}" data-curseur="manoeuvre">
        <output data-sortie="manoeuvre">${n}</output>
      </div>` : '';
    return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Déplacement</h2>
      <p>${texte}</p>
      <p class="rk-note">Un seul déplacement : il termine ton tour.</p>
      ${curseur}
      <div class="rk-pied">
        <button type="button" class="rk-btn rk-btn-primary rk-btn-grand" data-manoeuvrer ${de && vers && reste >= 1 ? '' : 'disabled'}>Déplacer ${n} troupe${n > 1 ? 's' : ''}</button>
        <button type="button" class="rk-btn rk-btn-ghost" data-finir>Finir mon tour sans déplacer</button>
      </div>`;
  }

  /** Contenu du panneau selon la phase et mon rôle. */
  function contenuPanneau() {
    if (etat?.partie?.statut !== 'en_cours') return '';
    const m = moi();
    if (!m) return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Tu regardes la partie</h2><p>Tu n'as pas de place dans cette partie : tu peux suivre le chat et le journal.</p>`;
    if (m.parti) return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Tu as quitté la partie</h2>`;
    if (m.elimine) return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Tu regardes la suite</h2><p>Tu es éliminé, mais tu peux suivre la partie.</p>`;
    const p = phase();
    if (p === 'placement') {
      const dispo = disponible();
      if (dispo <= 0) {
        return `<h2 id="rk-action-titre" class="rk-titre" tabindex="-1">Mise en place</h2>
          <p>Tes troupes sont posées. En attente des autres joueurs.</p>`;
      }
      return vueDeploiement({
        titre: 'Mise en place',
        texte: 'Pose tes troupes sur tes territoires. Tout le monde place en même temps : tu peux poser en plusieurs fois.',
      });
    }
    if (!monTour()) {
      const texte = p === 'renforts' ? 'Il reçoit ses renforts.' : (p === 'conquete' ? 'Il déplace ses troupes.' : 'Il joue.');
      return vueAttente(texte);
    }
    if (p === 'renforts') {
      const obligatoire = cartes().length >= 5;
      const extra = `<p>Prochain échange : <strong>${esc(jeu().prochain_echange ?? '')}</strong> troupes.</p>
        ${obligatoire ? '<p class="rk-alerte">Tu as 5 cartes : échange une combinaison avant de placer.</p>' : ''}`;
      return vueDeploiement({
        titre: 'Renforts',
        texte: 'Clique tes territoires sur la carte (+1), ou utilise les boutons, puis valide.',
        bloquerValider: obligatoire,
        extra,
      });
    }
    if (p === 'attaque') return vueAttaque();
    if (p === 'conquete') return vueConquete();
    if (p === 'manoeuvre') return vueManoeuvre();
    return vueAttente();
  }

  /** Redessine le panneau si son contenu a changé (pas pendant un envoi, sauf forcé). */
  function rendrePanneau(force = false) {
    if (occupe && !force) return;
    const j = jeu();
    const cle = JSON.stringify([j.phase, j.actif, etat.partie?.nb_tours, monId(), monTour(), etat.partie?.statut, !!moi()?.elimine,
      !!moi()?.parti, disponible(), cartes().length, choix.de, choix.vers, choix.des, choix.conquete, choix.manoeuvre,
      j.territoires]);
    if (!force && cles.panneau === cle) { majBrouillon(); return; }
    cles.panneau = cle;
    refs.panneau.innerHTML = contenuPanneau();
    majBrouillon();
  }

  /* ---------- Troupes à placer (brouillon) ---------- */

  /** Met à jour la liste, le reste, les boutons et les chiffres de la carte, sans perdre le focus. */
  function majBrouillon() {
    const total = totalBrouillon();
    const reste = Math.max(0, disponible() - total);
    const liste = refs.panneau.querySelector('[data-brouillon]');
    if (liste) {
      garderFocus(liste, () => {
        liste.innerHTML = Object.entries(brouillon).map(([t, n]) => {
          const nom = esc(nomT(t));
          return `<li class="rk-brouillon-ligne">
            <span class="rk-brouillon-nom">${nom}</span>
            <button type="button" class="rk-btn rk-btn-ghost rk-rond" data-retirer="${esc(t)}" aria-label="Retirer une troupe de ${nom}">−</button>
            <span class="rk-brouillon-n" aria-live="off">${n}</span>
            <button type="button" class="rk-btn rk-btn-ghost rk-rond" data-ajouter="${esc(t)}" aria-label="Ajouter une troupe à ${nom}"${reste > 0 ? '' : ' disabled'}>+</button>
          </li>`;
        }).join('') || '<li class="rk-vide">Aucune troupe posée. Clique tes territoires sur la carte.</li>';
      });
    }
    const compte = refs.panneau.querySelector('[data-reste]');
    if (compte) compte.textContent = String(reste);
    const valider = refs.panneau.querySelector('[data-valider]');
    if (valider) valider.disabled = total === 0 || occupe || (phase() === 'renforts' && cartes().length >= 5);
    // Chiffres de la carte : troupes actuelles plus les troupes posées ce tour.
    refs.carte.querySelectorAll('[data-terr]').forEach((b) => {
      const id = b.dataset.terr;
      const pastille = b.querySelector('.rk-pastille');
      if (!pastille) return;
      const d = brouillon[id] || 0;
      pastille.innerHTML = `${esc(armees_(id) + d)}${d ? `<small class="rk-plus">+${d}</small>` : ''}`;
    });
  }

  /** Repositionne le focus sur le même bouton après une reconstruction de la liste. */
  function garderFocus(zone, faire) {
    const actif = document.activeElement;
    const cle = actif && zone.contains(actif) ? (actif.dataset.ajouter ? `ajouter:${actif.dataset.ajouter}` : (actif.dataset.retirer ? `retirer:${actif.dataset.retirer}` : null)) : null;
    faire();
    if (!cle) return;
    const [sorte, id] = cle.split(/:(.*)/s);
    const attribut = sorte === 'ajouter' ? 'data-ajouter' : 'data-retirer';
    zone.querySelector(`[${attribut}="${CSS.escape(id)}"]`)?.focus();
  }

  function ajouterBrouillon(t, delta) {
    if (delta > 0 && totalBrouillon() >= disponible()) { toast('Tu n\'as plus de troupes à placer.'); return; }
    const n = (brouillon[t] || 0) + delta;
    if (n <= 0) delete brouillon[t]; else brouillon[t] = n;
    majBrouillon();
  }

  /* ---------- Actions ---------- */

  /** Envoie une action de jeu : un seul envoi à la fois, boutons désactivés, puis relecture. */
  function agir(bouton, action, args = {}) {
    if (occupe) return;
    occupe = true;
    envoyer(bouton, async () => {
      let ok = false;
      try {
        await plat.agir(code, action, args);
        ok = true;
      } catch (e) {
        toast(erreurTexte(e), 'error');
      } finally {
        occupe = false;
        if (ok) apresSucces(action);
        cles.panneau = null;
        cles.cartes = null;
        rendrePanneau(true);
        majMarquage();
        suivi.rafraichir();
      }
    }, suivi);
  }

  /** Après une action réussie : on oublie ce qui a été envoyé. */
  function apresSucces(action) {
    if (action === 'placer') brouillon = {};
    if (action === 'echanger') cartesSel = new Set();
    if (action === 'avancer') choix.conquete = null;
    if (['fin_attaque', 'manoeuvrer', 'finir'].includes(action)) { choix.de = null; choix.vers = null; choix.manoeuvre = null; }
  }

  /** Clic sur un territoire de la carte, selon la phase. */
  function surTerritoire(t) {
    if (!peutAgir()) return;
    const p = phase();
    if (p === 'placement' || (p === 'renforts' && monTour())) {
      ajouterBrouillon(t, 1);
      return;
    }
    if (!monTour()) return;
    if (p === 'attaque' || p === 'manoeuvre') {
      if (proprio(t) === monId()) {
        choix.de = choix.de === t ? null : t;
        choix.vers = null;
      } else if (choix.de && cibles().includes(t)) {
        choix.vers = t;
      }
    }
    rendrePanneau();
    majMarquage();
  }

  /** Clic sur la bulle d'un territoire, ou sur sa forme : même action que le bouton. */
  function surCarte(ev) {
    const forme = ev.target.closest?.('[data-forme]');
    const b = ev.target.closest?.('button[data-terr]')
      || (forme ? refs.carte.querySelector(`button[data-terr="${CSS.escape(forme.dataset.forme)}"]`) : null);
    if (!b || b.disabled) return;
    surTerritoire(b.dataset.terr);
  }

  function surPanneau(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.ajouter) return ajouterBrouillon(b.dataset.ajouter, 1);
    if (b.dataset.retirer) return ajouterBrouillon(b.dataset.retirer, -1);
    if (b.hasAttribute('data-effacer')) { brouillon = {}; return majBrouillon(); }
    if (b.hasAttribute('data-valider')) {
      if (!Object.keys(brouillon).length) return;
      return agir(b, 'placer', { placements: { ...brouillon } });
    }
    if (b.dataset.des) {
      choix.des = Number(b.dataset.des);
      b.parentElement?.querySelectorAll('[data-des]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      return;
    }
    if (b.hasAttribute('data-attaquer')) return agir(b, 'attaquer', { de: choix.de, vers: choix.vers, des: choix.des });
    if (b.hasAttribute('data-arreter')) return agir(b, 'fin_attaque');
    if (b.hasAttribute('data-avancer')) return agir(b, 'avancer', { armees: choix.conquete });
    if (b.hasAttribute('data-manoeuvrer')) return agir(b, 'manoeuvrer', { de: choix.de, vers: choix.vers, armees: choix.manoeuvre });
    if (b.hasAttribute('data-finir')) return agir(b, 'finir');
  }

  /** Curseurs (conquête, déplacement) : on garde la valeur, sans reconstruire le panneau. */
  function surCurseur(ev) {
    const s = ev.target;
    if (!s.dataset?.curseur) return;
    const n = Number(s.value);
    if (s.dataset.curseur === 'avancer') choix.conquete = n;
    if (s.dataset.curseur === 'manoeuvre') choix.manoeuvre = n;
    const sortie = refs.panneau.querySelector(`[data-sortie="${s.dataset.curseur}"]`);
    if (sortie) sortie.textContent = String(n);
    const bouton = refs.panneau.querySelector(s.dataset.curseur === 'avancer' ? '[data-avancer]' : '[data-manoeuvrer]');
    if (bouton) bouton.textContent = `Déplacer ${n} troupe${n > 1 ? 's' : ''}`;
  }

  function surCartes(ev) {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.carteId) {
      const id = b.dataset.carteId;
      if (cartesSel.has(id)) cartesSel.delete(id);
      else if (cartesSel.size < 3) cartesSel.add(id);
      majEchange();
      return;
    }
    if (b.hasAttribute('data-echanger')) {
      if (!combinaisonValable([...cartesSel], cartes())) return;
      agir(b, 'echanger', { cartes: [...cartesSel] });
    }
  }

  /** « Rejouer » : relance l'animation de la dernière bataille (sans rien envoyer au serveur). */
  function surBataille(ev) {
    if (!ev.target.closest?.('[data-rejouer]')) return;
    rendreBataille(true);
  }

  function surQuitter(ev) {
    if (occupe) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  }

  /** Zoom de la carte (téléphone) : seule la variable CSS change. */
  function surZoom(ev) {
    const b = ev.target.closest('button[data-zoom]');
    if (!b) return;
    zoom = Math.min(3, Math.max(1, zoom + Number(b.dataset.zoom) * 0.5));
    refs.carte.style.setProperty('--rk-zoom', String(zoom));
  }

  /* ---------- Écouteurs ---------- */

  refs.carte.addEventListener('click', surCarte);
  // Clavier : flèches vers le territoire cliquable le plus proche ; Entrée ou Espace le choisissent (boutons natifs).
  // Échap annule la sélection : d'abord l'arrivée, puis le départ.
  refs.carte.addEventListener('keydown', (ev) => {
    const b = ev.target.closest?.('button[data-terr]');
    if (!b) return;
    if (ev.key === 'Escape' && (choix.vers || choix.de)) {
      ev.preventDefault();
      if (choix.vers) choix.vers = null; else choix.de = null;
      rendrePanneau();
      majMarquage();
      b.focus({ preventScroll: true });
      return;
    }
    if (!ev.key.startsWith('Arrow')) return;
    const voisin = voisinSpatial(ev.key, b, [...refs.carte.querySelectorAll('button[data-terr]:not(:disabled)')]);
    if (voisin) { ev.preventDefault(); voisin.focus({ preventScroll: true }); }
  });
  refs.panneau.addEventListener('click', surPanneau);
  refs.panneau.addEventListener('input', surCurseur);
  refs.panneau.addEventListener('change', surCurseur);
  refs.cartes.addEventListener('click', surCartes);
  refs.bataille.addEventListener('click', surBataille);
  refs.quitter.addEventListener('click', surQuitter);
  refs.zoom.addEventListener('click', surZoom);
  refs.ongletCarte.addEventListener('click', () => ongletPour('carte'));
  refs.ongletInfos.addEventListener('click', () => ongletPour('infos'));

  function ongletPour(nomOnglet) {
    el.dataset.onglet = nomOnglet;
    refs.ongletCarte.setAttribute('aria-pressed', String(nomOnglet === 'carte'));
    refs.ongletInfos.setAttribute('aria-pressed', String(nomOnglet === 'infos'));
  }

  // Image de carte si elle existe (sinon, le fond de mer seul : les formes restent lisibles).
  const urlImage = imagePlateau('risk', 'carte');
  imageExiste(urlImage).then((ok) => {
    if (!ok) return;
    imageFond = urlImage;
    cles.carte = null;
    if (etat) { rendreCarte(); rendrePanneau(true); }
  });

  /* ---------- Animations sur les vrais changements ---------- */

  /**
   * Compare l'état précédent au nouveau : un nouveau combat fait rouler les dés (déjà rendus), baisser les compteurs
   * et tomber les pertes ; un déplacement de troupes envoie le cortège de l'origine à l'arrivée.
   * Rien n'est joué au premier affichage, ni si l'utilisateur préfère moins de mouvement.
   */
  function animerChangements(avant, nouveauCombat) {
    if (reduit.matches) return;
    const c = jeu().combat;
    if (nouveauCombat && c) {
      const t0 = avant.jeu?.territoires || {};
      const t1 = terr();
      const a = (t, id) => t?.[id]?.a ?? 0;
      if (a(t0, c.vers) !== a(t1, c.vers)) animerCompteur(refs.carte, c.vers, a(t0, c.vers));
      if (a(t0, c.de) !== a(t1, c.de)) animerCompteur(refs.carte, c.de, a(t0, c.de));
      if (c.pertes_att) animerChutes(refs.carte, c.de, c.pertes_att);
      if (c.pertes_def) animerChutes(refs.carte, c.vers, c.pertes_def);
      return;
    }
    if (!nouveauCombat) {
      const m = mouvementEntre(avant, etat);
      if (m) animerMouvement(refs.carte, m.de, m.vers, m.n);
    }
  }

  /* ---------- Contrat de la vue ---------- */

  const signal = creerSignalTour();
  const effets = creerEffets(el, { nomTerritoire: nomT, nomJoueur: nomJ });

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      const avant = etat;
      etat = e;
      suivreTour();
      rendreBandeau();
      rendreElimine();
      rendrePhases();
      rendreBanniere();
      rendreChecklist();
      const cleCombat = JSON.stringify(jeu().combat || null);
      const premiere = cles.combatVu === undefined;
      const nouveauCombat = !premiere && cleCombat !== cles.combatVu;
      cles.combatVu = cleCombat;
      rendreCarte();
      rendrePanneau();
      rendreBataille(nouveauCombat);
      rendreCartes();
      rendreContinents();
      rendreJoueurs();
      rendreMission();
      rendreJournal();
      rendreInfos();
      majMarquage();
      if (avant && !premiere) animerChangements(avant, nouveauCombat);
      const actif = jeu().actif ?? null;
      if (dernierActif !== null && actif !== dernierActif && monTour()) refs.annonce.textContent = 'À toi de jouer.';
      dernierActif = actif;
      chat.maj(e);
      signal.maj(monTour());
      try { effets.maj(e, monId()); } catch (err) { console.warn('[risk] effets visuels', err); }
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
      effets.detruire();
      arretChrono?.();
      grand.removeEventListener('change', surEcran);
      chat?.detruire();
      el.remove();
    },
  };
}
