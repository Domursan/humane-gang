// ===== Humane Gang — Pictionary : la table de jeu (plateaux/jeux/pictionary/table.js) =====
/*
 * Rôle : une partie de Pictionary. Le dessinateur choisit un mot parmi trois (phase « choix », 20 s), puis dessine
 *   sur la toile (palette de 8 couleurs, 3 épaisseurs, gomme, annuler le dernier trait, tout effacer). Les traits
 *   partent en direct sur le canal temps réel « pict:<id> » (par paquets, au plus 20 envois par seconde) et le dessin
 *   complet est enregistré toutes les 5 s (action 'dessin', et à chaque annulation ou effacement).
 *   Les devineurs voient la toile en lecture seule (traits reçus en direct, dessin enregistré chargé à l'ouverture),
 *   l'indice en lettres espacées, un champ « Ta proposition » et le fil des propositions. Quand un tour commence,
 *   le mot du tour précédent et son dessin s'affichent quelques secondes.
 *   Bandeau (manche, dessinateur, chrono), scores (points ; coche pour ceux qui ont trouvé), chat à droite
 *   (en tiroir sur téléphone). Mise en page : assets/espaces/plateaux/pictionary.css.
 *   Effets (sur les vrais changements d'état, jamais au premier état reçu) : « À toi de dessiner » (toile qui pulse,
 *   puce) pour le dessinateur au début du dessin, « À toi de deviner » (champ qui pulse, puce) pour les devineurs ;
 *   une lettre de l'indice qui se dévoile ; « Trouvé ! » (ligne de score qui s'éclaire, et bandeau pour moi, son) ;
 *   « Temps écoulé » (son) quand le temps finit sans que tout le monde ait trouvé ; son « Mot choisi » pour les devineurs ;
 *   son « Trait de crayon » à chaque trait posé. Le signal « à toi de jouer » reste celui de commun/tour-signal.js.
 *   Fin de partie (PI1) : avantFin garde la dernière toile le temps de son cadre doré, pour le gagnant.
 *   Animations coupées si le mouvement réduit est demandé (motionAllowed) ; sons par commun/sons-jeux.js.
 * Dépendances : commun/tour-signal.js (creerSignalTour), commun/sons-jeux.js (jouerSonJeu), core.js (esc, toast, sb,
 *   motionAllowed), ../../api.js (plat, erreurTexte), ../../vues/commun.js (avatarHtml, pseudoHtml,
 *   joueurDe, moiJoueur, brancherChrono, envoyer), ../../vues/chat.js (creerChat, tiroirChat), commun/effets-duels.js (anime),
 *   ../../vues/fin-fx.js (effetsFinPlateau, fxFin, issuePlateau), ./fin.js (finFx), ./plateau.js (toile, palette).
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire(), avantFin(etat) }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 *   Canal : sb.channel('pict:<id>', { config: { broadcast: { self: false } } }). Événements :
 *   'trait' { n, s, c, e, k, p } (points p à partir du rang k du trait s), 'annuler' { n, s }, 'effacer' { n }.
 *   n est le numéro du tour : un message d'un tour plus ancien est ignoré ; un tour plus récent remet la toile à zéro.
 */
import { esc, toast, sb, motionAllowed } from '../../../../commun/core.js';
import { plat, erreurTexte } from '../../api.js';
import { avatarHtml, pseudoHtml, joueurDe, moiJoueur, brancherChrono, envoyer, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { jouerSonJeu } from '../../../../commun/sons-jeux.js';
import { anime } from '../../../../commun/effets-duels.js';
import { effetsFinPlateau, fxFin, issuePlateau } from '../../vues/fin-fx.js';
import { finFx } from './fin.js';
import { LARGEUR, HAUTEUR, FOND, PALETTE, EPAISSEURS, GOMME, tracerToile, indiceHtml, nombreCachees, arrondi, borne, couleurValide } from './plateau.js';

const ECRAN_GRAND = '(min-width: 761px)';
const PAS_ENVOI = 50;           // ms entre deux paquets de traits : au plus 20 envois par seconde
const GARDE_FIN = 2200;         // ms : la dernière toile reste à l'écran après la fin, le temps du cadre doré (PI1)
const PAS_SAUVEGARDE = 5000;    // ms entre deux enregistrements du dessin complet
const DUREE_REVELE = 6000;      // ms d'affichage du mot du tour précédent

let compteur = 0;
let seq = 0;

/** Copie sûre d'un trait reçu du serveur ou du canal (les données distantes ne sont jamais prises telles quelles). */
function copieTrait(t) {
  if (!t || typeof t !== 'object') return null;
  const p = (Array.isArray(t.p) ? t.p : [])
    .filter((x) => Array.isArray(x) && x.length >= 2)
    .map(([x, y]) => [borne(Number(x)), borne(Number(y))]);
  return {
    s: String(t.s ?? ''),
    c: couleurValide(t.c) ? t.c : PALETTE[0].couleur,
    e: borne(Number(t.e) || EPAISSEURS[1].valeur, 0.001, 0.05),
    p,
    envoye: p.length,
  };
}

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour, la toile et la saisie restent en place. */
function squelette(uid) {
  const couleurs = PALETTE.map((c, i) => `<button type="button" class="pi-couleur" data-couleur="${i}" aria-label="${esc(c.nom)}" title="${esc(c.nom)}" aria-pressed="${i === 0}" style="--pi-c:${c.couleur}"></button>`).join('');
  const epaisseurs = EPAISSEURS.map((ep, i) => `<button type="button" class="pi-epaisseur" data-epaisseur="${i}" aria-label="${esc(ep.nom)}" title="${esc(ep.nom)}" aria-pressed="${i === 1}"><span class="pi-point" style="--pi-d:${6 + i * 6}px" aria-hidden="true"></span></button>`).join('');
  return `
  <header class="pi-bandeau" data-bandeau></header>
  <div class="pi-barre" role="toolbar" aria-label="Actions de la partie">
    <span class="pi-code small muted" data-code></span>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <div class="pi-corps">
    <div class="pi-colonne-jeu">
      <p class="pi-revele" data-revele role="status" hidden></p>
      <section class="pi-bloc pi-scene" aria-label="Le jeu">
        <div class="pi-zone" data-zone="choix" hidden>
          <h2 class="pi-titre" id="${uid}-choix">Choisis le mot à dessiner</h2>
          <p class="pi-note small muted">Tu as 20 secondes. Sans choix, le premier mot est pris.</p>
          <div class="pi-mots" role="group" aria-labelledby="${uid}-choix" data-mots></div>
        </div>
        <div class="pi-zone" data-zone="attente" hidden>
          <p class="pi-attente" data-attente role="status"></p>
        </div>
        <div class="pi-zone" data-zone="dessin" hidden>
          <div class="pi-entete">
            <div class="pi-mot-dessin" data-mot-dessin hidden>
              <span class="pi-label">À dessiner</span>
              <strong class="pi-mot-grand" data-mot-grand></strong>
            </div>
            <div class="pi-indice-zone" data-indice-zone hidden>
              <span class="pi-label">Indice</span>
              <div class="pi-cases" role="group" aria-label="Indice" data-indice></div>
            </div>
            <p class="pi-dessinateur small muted" data-dessinateur></p>
          </div>
          <div class="pi-toile-zone">
            <canvas class="pi-toile" data-toile width="${LARGEUR}" height="${HAUTEUR}" role="img" aria-label="Toile"></canvas>
          </div>
          <div class="pi-outils" data-outils hidden>
            <div class="pi-palette" role="group" aria-label="Couleurs" data-palette>${couleurs}</div>
            <div class="pi-epaisseurs" role="group" aria-label="Épaisseur du trait" data-epaisseurs>${epaisseurs}</div>
            <div class="pi-actions-dessin">
              <button type="button" class="pi-btn" data-gomme aria-pressed="false">Gomme</button>
              <button type="button" class="pi-btn pi-btn-ghost" data-annuler>Annuler le dernier trait</button>
              <button type="button" class="pi-btn pi-btn-ghost" data-effacer>Tout effacer</button>
            </div>
          </div>
          <form class="pi-devine" data-devine autocomplete="off" hidden>
            <label class="pi-label" for="${uid}-champ">Ta proposition</label>
            <div class="pi-devine-ligne">
              <input id="${uid}-champ" class="pi-champ" type="text" maxlength="60" data-proposition>
              <button type="submit" class="pi-btn pi-btn-primary" data-proposer>Envoyer</button>
            </div>
          </form>
          <p class="pi-bravo" data-bravo role="status" hidden></p>
        </div>
      </section>
    </div>
    <aside class="pi-colonne-cote" aria-label="Scores, propositions et chat">
      <section class="pi-bloc" aria-labelledby="${uid}-scores">
        <h2 id="${uid}-scores" class="pi-bloc-titre">Scores</h2>
        <div data-scores></div>
      </section>
      <section class="pi-bloc" aria-labelledby="${uid}-fil">
        <h2 id="${uid}-fil" class="pi-bloc-titre">Propositions</h2>
        <div data-fil role="log" aria-live="polite" aria-relevant="additions"></div>
      </section>
      <div class="pi-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="pi-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de Pictionary dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const grand = window.matchMedia(ECRAN_GRAND);
  const uid = `pi-${++compteur}`;

  const el = document.createElement('section');
  el.className = 'pi-table';
  el.innerHTML = squelette(uid);
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), code: q('[data-code]'), quitter: q('[data-quitter]'), revele: q('[data-revele]'),
    zoneChoix: q('[data-zone="choix"]'), zoneAttente: q('[data-zone="attente"]'), zoneDessin: q('[data-zone="dessin"]'),
    mots: q('[data-mots]'), attente: q('[data-attente]'), motDessin: q('[data-mot-dessin]'), motGrand: q('[data-mot-grand]'),
    dessinateur: q('[data-dessinateur]'), indiceZone: q('[data-indice-zone]'), indice: q('[data-indice]'),
    toile: q('[data-toile]'), outils: q('[data-outils]'), palette: q('[data-palette]'), epaisseurs: q('[data-epaisseurs]'),
    gomme: q('[data-gomme]'), annuler: q('[data-annuler]'), effacer: q('[data-effacer]'),
    devine: q('[data-devine]'), champ: q('[data-proposition]'), envoyer: q('[data-proposer]'), bravo: q('[data-bravo]'),
    scores: q('[data-scores]'), fil: q('[data-fil]'), chatZone: q('[data-chat]'), tiroirZone: q('[data-tiroir-chat]'),
    annonce: q('[data-annonce]'),
  };
  refs.code.textContent = `Code ${code}`;

  let etat = null;
  // Toile : traits du tour en cours (local.n = numéro du tour), suppressions reçues (annulations et effacements).
  const local = { n: null, traits: [], effaces: new Set() };
  let courant = null;            // trait en train d'être tracé (dessinateur)
  const aEnvoyer = new Set();    // traits dont des points ne sont pas encore partis sur le canal
  let modifie = false;           // toile modifiée depuis le dernier enregistrement
  let enregistrement = null;     // enregistrement en cours
  const outil = { couleur: 0, epaisseur: 1, gomme: false };
  let occupe = false;            // choix du mot en cours
  let finie = false;             // état final reçu : la table reste un instant à l'écran, plus aucune action
  let envoiDevine = false;       // proposition en cours
  let canal = null, canalNom = null, canalPret = false;
  let rafId = 0;
  let dernierRevele = undefined; // tour dont le mot précédent a déjà été montré
  let timerRevele = null;
  let choixCourants = [];
  let cleChoix = '', cleBandeau = '', cleScores = '', cleFil = '', cleIndice = '';
  const minuteries = new Set();  // délais des effets visuels (annulés à la destruction de la table)

  /* ---------- Chat : colonne (ordinateur) ou tiroir (téléphone) ---------- */

  let chat = null;
  const messagesVus = [];
  function monterChat() {
    chat?.detruire();
    refs.chatZone.innerHTML = '';
    refs.tiroirZone.innerHTML = '';
    chat = grand.matches
      ? creerChat(refs.chatZone, { code, moi: ctx.moi })
      : tiroirChat(refs.tiroirZone, { code, moi: ctx.moi });
    messagesVus.forEach((m) => chat.message(m));
    if (etat) chat.maj(etat);
  }
  monterChat();
  const surEcran = () => monterChat();
  grand.addEventListener('change', surEcran);

  /* ---------- Lecture de l'état ---------- */

  const jeu = () => etat?.jeu || {};
  const phase = () => jeu().phase;
  const monId = () => moiJoueur(etat)?.user_id ?? etat?.moi?.user_id ?? null;
  const estDessinateur = () => !!monId() && jeu().dessinateur === monId();
  const aTrouve = () => !!monId() && (jeu().trouves || []).includes(monId());
  const pseudoDe = (u) => (u == null ? '' : (joueurDe(etat, u)?.pseudo || '?'));
  const dessinEnCours = () => etat?.partie?.statut === 'en_cours' && phase() === 'dessin';
  const peutDessiner = () => !finie && dessinEnCours() && estDessinateur() && !moiJoueur(etat)?.parti;
  const peutDeviner = () => !finie && dessinEnCours() && !!monId() && !estDessinateur() && !aTrouve() && !moiJoueur(etat)?.parti;

  /** Message pour le lecteur d'écran (zone aria-live). */
  const annoncer = (texte) => { refs.annonce.textContent = texte; };

  /* ---------- Toile : tours, traits reçus, fusion ---------- */

  /** Remet la toile à zéro pour le tour n, avec les traits donnés. */
  function reinitialiser(n, traits) {
    local.n = n;
    local.traits = traits;
    local.effaces = new Set();
    courant = null;
    aEnvoyer.clear();
    modifie = false;
    planifierRedessin();
  }

  /** Vrai si un message du canal appartient au tour courant (un tour plus récent remet la toile à zéro). */
  function accepterTour(n) {
    if (!Number.isFinite(n)) return false;
    if (local.n === null || n > local.n) { reinitialiser(n, []); return true; }
    return n === local.n;
  }

  /** Aligne la toile sur le tour de l'état (dessin enregistré du tour courant). */
  function synchroniserTour() {
    const j = jeu();
    if (j.tour_n == null || j.tour_n === local.n) return;
    reinitialiser(j.tour_n, (j.traits || []).map(copieTrait).filter(Boolean));
  }

  /** Complète la toile avec le dessin enregistré : ajoute les traits inconnus, prolonge ceux qui ont reçu des points. */
  function fusionner(liste) {
    let change = false;
    for (const d of liste || []) {
      const t0 = copieTrait(d);
      if (!t0 || !t0.s || local.effaces.has(t0.s)) continue;
      const t = local.traits.find((x) => x.s === t0.s);
      if (!t) { local.traits.push(t0); change = true; }
      else if (t0.p.length > t.p.length) { t.p.push(...t0.p.slice(t.p.length)); change = true; }
    }
    if (change) planifierRedessin();
  }

  /** Redessine la toile après le prochain rafraîchissement d'écran (une seule fois même si plusieurs traits arrivent). */
  function planifierRedessin() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; redessiner(); });
  }
  function redessiner() {
    const ctx2d = refs.toile.getContext('2d');
    if (ctx2d) tracerToile(ctx2d, local.traits);
  }

  /* ---------- Canal temps réel ---------- */

  /** Ouvre le canal du tour (une seule fois par partie) ; les événements arrivent par surTrait, surAnnuler, surEffacer. */
  function ouvrirCanal(nom) {
    if (canal && canalNom === nom) return;
    fermerCanal();
    canalNom = nom;
    try {
      canal = sb.channel(nom, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'trait' }, (m) => surTrait(m?.payload))
        .on('broadcast', { event: 'annuler' }, (m) => surAnnuler(m?.payload))
        .on('broadcast', { event: 'effacer' }, (m) => surEffacer(m?.payload))
        .subscribe((statut) => { canalPret = statut === 'SUBSCRIBED'; });
    } catch (err) {
      console.warn('[pictionary] canal indisponible', err);
      canal = null;
      canalNom = null;
    }
  }
  function fermerCanal() {
    if (canal) { try { sb.removeChannel(canal); } catch { /* sans effet */ } }
    canal = null;
    canalNom = null;
    canalPret = false;
  }
  /** Envoie un message sur le canal (sans effet tant qu'il n'est pas confirmé : la toile enregistrée prendra le relais). */
  function diffuser(evenement, charge) {
    if (!canal || !canalPret) return;
    try {
      const r = canal.send({ type: 'broadcast', event: evenement, payload: charge });
      r?.catch?.(() => { /* la prochaine sauvegarde rattrape */ });
    } catch (err) {
      console.warn('[pictionary] envoi', err);
    }
  }

  /** Trait reçu : ajoute les points à partir du rang k (les points déjà reçus ne sont pas comptés deux fois). */
  function surTrait(d) {
    if (!d || !accepterTour(Number(d.n))) return;
    const s = String(d.s ?? '');
    if (!s || local.effaces.has(s)) return;
    let t = local.traits.find((x) => x.s === s);
    if (!t) {
      t = { s, c: couleurValide(d.c) ? d.c : PALETTE[0].couleur, e: borne(Number(d.e) || EPAISSEURS[1].valeur, 0.001, 0.05), p: [], envoye: 0 };
      local.traits.push(t);
    }
    const k = Math.max(0, Math.floor(Number(d.k) || 0));
    const recus = (Array.isArray(d.p) ? d.p : [])
      .filter((x) => Array.isArray(x) && x.length >= 2)
      .map(([x, y]) => [borne(Number(x)), borne(Number(y))]);
    t.p.push(...recus.slice(Math.max(0, t.p.length - k)));
    planifierRedessin();
  }
  function surAnnuler(d) {
    if (!d || !accepterTour(Number(d.n))) return;
    const s = String(d.s ?? '');
    local.effaces.add(s);
    local.traits = local.traits.filter((t) => t.s !== s);
    planifierRedessin();
  }
  function surEffacer(d) {
    if (!d || !accepterTour(Number(d.n))) return;
    local.traits.forEach((t) => local.effaces.add(t.s));
    local.traits = [];
    planifierRedessin();
  }

  /** Envoie les points qui n'ont pas encore quitté le poste (un paquet par trait, toutes les 50 ms au plus). */
  function vider() {
    if (!aEnvoyer.size) return;
    for (const t of aEnvoyer) {
      if (t.p.length <= t.envoye) continue;
      diffuser('trait', { n: local.n, s: t.s, c: t.c, e: t.e, k: t.envoye, p: t.p.slice(t.envoye) });
      t.envoye = t.p.length;
    }
    aEnvoyer.clear();
  }

  /* ---------- Enregistrement du dessin complet ---------- */

  /** Enregistre la toile (action 'dessin') si elle a changé et si je dessine. */
  async function enregistrer() {
    if (!modifie || enregistrement || !peutDessiner()) return;
    modifie = false;
    const traits = local.traits.map(({ s, c, e, p }) => ({ s, c, e, p }));
    enregistrement = plat.agir(code, 'dessin', { traits })
      .catch((err) => {
        modifie = true;
        if (dessinEnCours()) toast(erreurTexte(err), 'error');
      })
      .finally(() => { enregistrement = null; });
    await enregistrement;
  }

  /* ---------- Dessin (pointeur : souris, doigt, stylet) ---------- */

  /** Position normalisée (0-1) du pointeur sur la toile. */
  function pointe(ev) {
    const r = refs.toile.getBoundingClientRect();
    return [arrondi(borne((ev.clientX - r.left) / (r.width || 1))), arrondi(borne((ev.clientY - r.top) / (r.height || 1)))];
  }

  function surPointerBas(ev) {
    if (!peutDessiner() || courant || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    ev.preventDefault();
    try { refs.toile.setPointerCapture(ev.pointerId); } catch { /* sans effet */ }
    const gomme = outil.gomme;
    courant = {
      s: `${monId()}-${Date.now().toString(36)}-${++seq}`,
      c: gomme ? FOND : PALETTE[outil.couleur].couleur,
      e: gomme ? GOMME : EPAISSEURS[outil.epaisseur].valeur,
      p: [pointe(ev)],
      envoye: 0,
    };
    local.traits.push(courant);
    aEnvoyer.add(courant);
    modifie = true;
    planifierRedessin();
  }

  function surPointerDeplace(ev) {
    if (!courant) return;
    const pt = pointe(ev);
    const dernier = courant.p[courant.p.length - 1];
    if (dernier[0] === pt[0] && dernier[1] === pt[1]) return;
    courant.p.push(pt);
    aEnvoyer.add(courant);
    planifierRedessin();
  }

  function surPointerFin() {
    if (!courant) return;
    courant = null;
    jouerSonJeu('pictionary', 1);  // trait de crayon posé
  }

  /** Annule le dernier trait (le retrait part sur le canal, puis la toile est enregistrée). */
  function annulerDernier() {
    if (!peutDessiner() || courant || !local.traits.length) return;
    const t = local.traits.pop();
    aEnvoyer.delete(t);
    local.effaces.add(t.s);
    diffuser('annuler', { n: local.n, s: t.s });
    modifie = true;
    planifierRedessin();
    enregistrer();
  }

  /** Efface toute la toile (diffusé, puis enregistré). */
  function toutEffacer() {
    if (!peutDessiner() || courant || !local.traits.length) return;
    diffuser('effacer', { n: local.n });
    local.traits.forEach((t) => local.effaces.add(t.s));
    local.traits = [];
    aEnvoyer.clear();
    modifie = true;
    planifierRedessin();
    enregistrer();
  }

  /** Affiche la couleur, l'épaisseur et la gomme choisies. */
  function rendreOutils() {
    refs.palette.querySelectorAll('[data-couleur]').forEach((b) => b.setAttribute('aria-pressed', String(!outil.gomme && Number(b.dataset.couleur) === outil.couleur)));
    refs.epaisseurs.querySelectorAll('[data-epaisseur]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.epaisseur) === outil.epaisseur)));
    refs.gomme.setAttribute('aria-pressed', String(outil.gomme));
  }

  /* ---------- Rendus ---------- */

  /** Bandeau : titre, manche, code, et chrono (mis à jour par brancherChrono). */
  function rendreBandeau() {
    const p = etat.partie || {};
    const j = jeu();
    const cle = [p.nom, p.nom_jeu, p.code, j.manche, j.manches].join('|');
    if (cle === cleBandeau) return;
    cleBandeau = cle;
    refs.bandeau.innerHTML = `<div class="pi-bandeau-tete">
      <div class="pi-bandeau-titres">
        <p class="pi-bandeau-jeu small muted">${esc(p.nom_jeu || 'Pictionary')} · <span class="plat-code">${esc(p.code || code)}</span> · Manche ${esc(j.manche ?? 1)} sur ${esc(j.manches ?? '?')}</p>
        <h1 class="pi-bandeau-titre display">${esc(p.nom || p.nom_jeu || 'Pictionary')}</h1>
      </div>
      <span class="pi-chrono" data-chrono></span>
    </div>`;
  }

  /** Zone principale selon la phase et mon rôle (choix du mot, attente, dessin, devinette). */
  function rendreScene() {
    const j = jeu();
    const ph = j.phase;
    const dess = estDessinateur();
    refs.zoneChoix.hidden = !(ph === 'choix' && dess);
    refs.zoneAttente.hidden = !(ph === 'choix' && !dess);
    refs.zoneDessin.hidden = ph !== 'dessin';

    if (ph === 'choix') {
      if (dess) rendreMots(j);
      else refs.attente.textContent = `${pseudoDe(j.dessinateur) || 'Le dessinateur'} choisit le mot à dessiner…`;
      return;
    }
    if (ph !== 'dessin') return;

    refs.motDessin.hidden = !dess;
    if (dess) refs.motGrand.textContent = j.mot || '';
    refs.indiceZone.hidden = dess;
    if (!dess) {
      // Reconstruit seulement quand l'indice change : les animations des lettres ne doivent pas repartir à chaque mise à jour.
      const cle = `${j.tour_n}|${j.indice}`;
      if (cle !== cleIndice) {
        cleIndice = cle;
        refs.indice.innerHTML = indiceHtml(j.indice);
      }
      refs.indice.setAttribute('aria-label', `Indice : ${nombreCachees(j.indice)} lettre(s) à trouver`);
    }
    refs.dessinateur.textContent = dess ? 'Tu dessines.' : `${pseudoDe(j.dessinateur) || 'Un joueur'} dessine.`;
    refs.outils.hidden = !dess;
    refs.toile.classList.toggle('is-dessin', peutDessiner());
    refs.toile.setAttribute('aria-label', dess ? 'Ta toile : dessine le mot indiqué au-dessus' : 'Dessin en cours, lecture seule');

    refs.devine.hidden = dess || !monId();
    refs.champ.disabled = !peutDeviner();
    refs.envoyer.disabled = !peutDeviner() || envoiDevine;
    refs.bravo.hidden = !aTrouve() || dess;
    if (!refs.bravo.hidden) refs.bravo.textContent = j.mot ? `Bravo, tu as trouvé : ${j.mot}` : 'Bravo, tu as trouvé !';
  }

  /** Les trois mots à choisir (boutons ; recréés seulement quand la liste change). */
  function rendreMots(j) {
    const liste = Array.isArray(j.choix) ? j.choix.map(String) : [];
    const cle = `${j.tour_n}:${liste.join('|')}`;
    if (cle !== cleChoix) {
      cleChoix = cle;
      choixCourants = liste;
      refs.mots.innerHTML = liste.map((m, i) => `<button type="button" class="pi-mot-choix" data-mot="${i}">${esc(m)}</button>`).join('');
    }
    refs.mots.querySelectorAll('button').forEach((b) => { b.disabled = occupe; });
  }

  /** Scores : points de chacun, classement, coche pour ceux qui ont trouvé, marque du dessinateur. */
  function rendreScores() {
    const j = jeu();
    const trouves = j.trouves || [];
    const joueurs = (etat.joueurs || [])
      .filter((x) => !x.parti)
      .map((x) => ({ ...x, points: Number(x.etat?.points) || 0 }))
      .sort((a, b) => b.points - a.points || (Number(a.place) || 0) - (Number(b.place) || 0));
    const cle = JSON.stringify([joueurs.map((x) => [x.user_id, x.points, x.pseudo]), trouves, j.dessinateur, j.phase, monId()]);
    if (cle === cleScores) return;
    cleScores = cle;
    refs.scores.innerHTML = joueurs.length ? `<ol class="pi-scores">${joueurs.map((x, i) => `<li data-uid="${esc(x.user_id)}" class="pi-score${x.user_id === j.dessinateur && j.phase === 'dessin' ? ' is-dessin' : ''}${x.user_id === monId() ? ' is-moi' : ''}">
        <span class="pi-rang" aria-hidden="true">${i + 1}</span>
        ${avatarHtml(x, 28)}
        <span class="pi-score-nom">${pseudoHtml(x)}</span>
        ${x.user_id === j.dessinateur && j.phase === 'dessin' ? '<span class="pi-etiquette">dessine</span>' : ''}
        ${trouves.includes(x.user_id) ? '<span class="pi-coche"><span aria-hidden="true">✓</span><span class="visually-hidden"> a trouvé</span></span>' : ''}
        <span class="pi-points"><span class="visually-hidden">Points : </span>${esc(x.points)}</span>
      </li>`).join('')}</ol>` : '<p class="pi-vide small muted">Pas encore de joueur.</p>';
  }

  /** Fil des propositions : propositions, trouvailles, annonces et ligne privée « presque ! » (newest first). */
  function rendreFil() {
    const lignes = (etat.journal || []).slice(0, 40);
    const cle = lignes.map((l) => `${l.id}`).join(',');
    if (cle === cleFil) return;
    cleFil = cle;
    refs.fil.innerHTML = lignes.length ? `<ul class="pi-fil-liste">${lignes.map((l) => `<li class="pi-fil-ligne is-${esc(l.type || 'info')}${l.prive ? ' is-prive' : ''}">
        ${l.prive ? '<span class="pi-tag">pour toi</span> ' : ''}<span>${esc(l.texte || '')}</span>
      </li>`).join('')}</ul>` : '<p class="pi-vide small muted">Pas encore de proposition.</p>';
  }

  /** Affiche, quelques secondes, le mot et le dessin du tour précédent (au début d'un nouveau tour). */
  function verifierRevele() {
    const j = jeu();
    if (j.phase !== 'choix' || !j.precedent || j.tour_n === dernierRevele) return;
    dernierRevele = j.tour_n;
    const r = j.precedent;
    const nb = (r.trouves || []).length;
    refs.revele.innerHTML = `<span class="pi-revele-carte">
      <span class="pi-revele-titre">Le mot était : <strong class="pi-revele-mot">${esc(r.mot || '')}</strong></span>
      <canvas class="pi-revele-toile" width="${LARGEUR}" height="${HAUTEUR}" aria-hidden="true"></canvas>
      <span class="small muted">Dessiné par ${esc(pseudoDe(r.dessinateur) || '?')} · ${esc(nb)} joueur(s) ont trouvé</span>
    </span>`;
    const ctx2d = refs.revele.querySelector('canvas').getContext('2d');
    if (ctx2d) tracerToile(ctx2d, (r.traits || []).map(copieTrait).filter(Boolean));
    refs.revele.hidden = false;
    clearTimeout(timerRevele);
    timerRevele = setTimeout(() => { refs.revele.hidden = true; }, DUREE_REVELE);
  }

  /* ---------- Actions ---------- */

  refs.mots.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-mot]');
    if (!b || occupe || finie) return;
    const mot = choixCourants[Number(b.dataset.mot)];
    if (!mot) return;
    occupe = true;
    refs.mots.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      await plat.agir(code, 'choisir', { mot });
    } catch (err) {
      toast(erreurTexte(err), 'error');
      occupe = false;
      rendreScene();
    } finally {
      occupe = false;
      suivi?.rafraichir?.();
    }
  });

  refs.devine.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const texte = refs.champ.value.trim();
    if (!texte || envoiDevine || !peutDeviner()) return;
    envoiDevine = true;
    refs.envoyer.disabled = true;
    try {
      const r = await plat.agir(code, 'deviner', { texte });
      refs.champ.value = '';
      annoncer(r?.ok ? 'Bravo !' : 'Pas tout à fait.');
    } catch (err) {
      toast(erreurTexte(err), 'error');
    } finally {
      envoiDevine = false;
      refs.envoyer.disabled = !peutDeviner();
      suivi?.rafraichir?.();
    }
  });

  refs.palette.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-couleur]');
    if (!b) return;
    outil.couleur = Number(b.dataset.couleur);
    outil.gomme = false;
    rendreOutils();
  });
  refs.epaisseurs.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-epaisseur]');
    if (!b) return;
    outil.epaisseur = Number(b.dataset.epaisseur);
    rendreOutils();
  });
  refs.gomme.addEventListener('click', () => { outil.gomme = !outil.gomme; rendreOutils(); });
  refs.annuler.addEventListener('click', annulerDernier);
  refs.effacer.addEventListener('click', toutEffacer);

  refs.toile.addEventListener('pointerdown', surPointerBas);
  refs.toile.addEventListener('pointermove', surPointerDeplace);
  refs.toile.addEventListener('pointerup', surPointerFin);
  refs.toile.addEventListener('pointercancel', surPointerFin);

  refs.quitter.addEventListener('click', (ev) => {
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  });

  rendreOutils();
  const arretChrono = brancherChrono(refs.bandeau, suivi);
  const tEnvoi = setInterval(vider, PAS_ENVOI);
  const tSauvegarde = setInterval(enregistrer, PAS_SAUVEGARDE);

  /* ---------- Effets visuels et sonores ---------- */

  /** Programme une action dans quelques millisecondes ; annulée si la table est détruite. */
  function plus(fn, ms) {
    const t = setTimeout(() => { minuteries.delete(t); fn(); }, ms);
    minuteries.add(t);
  }

  /** Rejoue une classe d'animation sur un élément (la retire, force le recalcul, la remet, puis la retire après duree ms). */
  function animer(el, classe, duree) {
    if (!el) return;
    el.classList.remove(classe);
    void el.offsetWidth;
    el.classList.add(classe);
    plus(() => el.classList.remove(classe), duree);
  }

  /** Puce « À toi de … » posée dans un bloc : ne bloque aucun clic, disparaît après quelques secondes. */
  function puce(parent, texte) {
    if (!parent) return;
    parent.querySelector(':scope > .pi-puce')?.remove();
    const p = document.createElement('span');
    p.className = 'pi-puce';
    p.textContent = texte;
    parent.append(p);
    plus(() => p.remove(), 4500);
  }

  /**
   * Ce qui a changé entre l'état précédent (avant) et le nouvel (etat, déjà posé). Vide quand il n'y a pas d'état
   * précédent : le premier état reçu, à l'ouverture de la page, n'annonce rien.
   */
  function changements(avant) {
    const ev = { cloche: false, aDessiner: false, aDeviner: false, indice: [], trouves: [], temps: false };
    if (!avant) return ev;
    const a = avant.jeu || {};
    const n = jeu();
    const memeTour = a.tour_n != null && a.tour_n === n.tour_n;

    // Début du dessin : le dessinateur voit « À toi de dessiner », les devineurs « À toi de deviner ».
    if (a.phase !== 'dessin' && n.phase === 'dessin') {
      ev.aDessiner = estDessinateur();
      ev.aDeviner = peutDeviner();
      // Le mot est choisi : cloche pour les devineurs (le dessinateur entend déjà son signal de tour).
      if (memeTour && a.phase === 'choix') ev.cloche = !estDessinateur();
    }

    // Fin du temps : le dessin finit sans que tous les devineurs aient trouvé.
    if (a.phase === 'dessin' && n.phase !== 'dessin') {
      const devineurs = (avant.joueurs || []).filter((x) => !x.parti && x.user_id !== a.dessinateur).length;
      ev.temps = (a.trouves || []).length < devineurs;
    }

    // Nouvelle lettre de l'indice (pour les devineurs, pendant le même dessin).
    if (memeTour && a.phase === 'dessin' && n.phase === 'dessin' && !estDessinateur() && a.indice && n.indice) {
      const avantMots = String(a.indice).split(' ');
      const maintenant = String(n.indice).split(' ');
      if (avantMots.length === maintenant.length) {
        let k = 0;  // rang de la case (les espaces entre les mots ne sont pas des cases)
        maintenant.forEach((c, i) => {
          if (c === '') return;
          if (avantMots[i] === '_' && c !== '_') ev.indice.push(k);
          k++;
        });
      }
    }

    // Nouveaux joueurs qui ont trouvé pendant ce dessin.
    if (n.phase === 'dessin') {
      const deja = memeTour ? (a.trouves || []) : [];
      ev.trouves = (n.trouves || []).filter((u) => !deja.includes(u));
    }
    return ev;
  }

  /** Joue les effets d'un changement (après le rendu, pour que les éléments à animer existent). */
  function appliquerEffets(ev) {
    const anime = motionAllowed();
    if (ev.cloche) jouerSonJeu('pictionary', 5);
    if (ev.aDessiner) {
      puce(refs.toile.closest('.pi-toile-zone'), 'À toi de dessiner');
      if (anime) animer(refs.toile, 'is-joue', 2400);
    }
    if (ev.aDeviner) {
      puce(refs.devine, 'À toi de deviner');
      if (anime) animer(refs.devine, 'is-joue', 2400);
    }
    if (ev.indice.length) {
      jouerSonJeu('pictionary', 2);
      if (anime) {
        const cases = refs.indice.querySelectorAll('.pi-case');
        ev.indice.forEach((k, i) => plus(() => {
          const c = cases[k];
          if (!c) return;
          c.classList.add('is-revele');
          plus(() => c.classList.remove('is-revele'), 800);
        }, i * 120));
      }
    }
    if (ev.trouves.length) {
      const lignes = [...refs.scores.querySelectorAll('[data-uid]')];
      for (const u of ev.trouves) {
        const li = lignes.find((x) => x.dataset.uid === String(u));
        if (li && anime) animer(li, 'is-eclaire', 1800);
      }
      // « Trouvé ! » sonne pour tout le monde (choix d'Ethan) ; le bandeau « Bravo » seulement pour celui qui a trouvé.
      jouerSonJeu('pictionary', 3);
      if (ev.trouves.includes(monId()) && anime) animer(refs.bravo, 'is-anime', 2400);
    }
    if (ev.temps) jouerSonJeu('pictionary', 4);
  }

  /* ---------- Mise à jour depuis l'état ---------- */

  /** Nouvel état : tour, canal, zones, scores, fil, mot précédent au début d'un tour, puis effets des changements. */
  function maj(nouvel) {
    if (!nouvel) return;
    const avant = etat;
    etat = nouvel;
    const ev = changements(avant);
    synchroniserTour();
    if (!estDessinateur() && phase() === 'dessin') fusionner(jeu().traits);
    if (etat.partie?.statut === 'en_cours' && jeu().canal) ouvrirCanal(jeu().canal);
    else fermerCanal();
    rendreBandeau();
    rendreScene();
    rendreScores();
    rendreFil();
    refs.quitter.disabled = !moiJoueur(etat) || moiJoueur(etat)?.parti === true;
    verifierRevele();
    appliquerEffets(ev);
    chat?.maj(etat);
    // « À toi » : le dessinateur qui dessine, et aussi ceux qui devinent (choix d'Ethan).
    signal.maj(peutDessiner() || peutDeviner());
  }

  const signal = creerSignalTour();

  return {
    maj,
    message(m) {
      messagesVus.push(m);
      chat?.message(m);
    },
    /** PI1 : le gagnant voit la dernière toile recevoir son cadre doré, puis l'écran de fin. Sans animation, onglet masqué ou autre issue : rien à attendre. */
    avantFin(e) {
      finie = true;
      refs.quitter.disabled = true;
      if (document.hidden) return null;
      const joue = effetsFinPlateau(e, { ...finFx,
        apres: (issue) => { if (issue === 'gagnant') fxFin.classe(refs.toile, 'pi-toile-fin', GARDE_FIN); } });
      if (!joue || !anime() || issuePlateau(e) !== 'gagnant') return null;
      return new Promise((ok) => { fxFin.plus(ok, GARDE_FIN); });
    },
    detruire() {
      signal.arreter();
      clearInterval(tEnvoi);
      clearInterval(tSauvegarde);
      clearTimeout(timerRevele);
      for (const t of minuteries) clearTimeout(t);
      minuteries.clear();
      if (rafId) cancelAnimationFrame(rafId);
      arretChrono?.();
      fermerCanal();
      chat?.detruire();
      grand.removeEventListener('change', surEcran);
    },
  };
}
