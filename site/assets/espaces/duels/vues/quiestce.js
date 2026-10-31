// ===== Humane Gang — Duels : table « Qui est-ce ? » (#partie/CODE, jeu quiestce) =====
/*
 * Rôle : une table « Qui est-ce ? » dans le cadre commun (vues/commun.js).
 *   Plateau : 24 personnages (portrait + prénom). Un clic baisse ou relève une carte (dos de carte Uno) ;
 *   les changements partent groupés (600 ms sans clic) vers duel.baisser, liste complète. Aide-mémoire seulement.
 *   « Baisser automatiquement » : baisse les personnages éliminés par mes questions déjà répondues.
 *   Côté (ordinateur) : mon personnage secret, personnages debout, poser une question, historique de la manche.
 *   Téléphone (le panneau est replié) : barre compacte au-dessus du plateau, questions collées en bas du plateau.
 *   Mon tour : poser une question (toute prête, ou libre si permise), « Je sais qui c'est ! ».
 *   Question libre reçue : bandeau « X te demande… » avec Oui / Non, avant le reste.
 *   Spectateur : plateau seul, sans action ni personnage secret.
 *   Nouvelle manche (partie.manche change) : personnages rechargés, baisses remises à zéro.
 *   Effets (ajouts à la maquette validée), déclenchés par les vrais changements d'état (le premier état reçu n'anime rien) :
 *   mon tour commence : mon nom pulse, la zone des questions s'éclaire, et la bulle « À toi de demander ? » si je pose la question ;
 *   personnages nouvellement baissés : ils basculent (dos « HG ») un à un ; question nouvelle : cloche (son 4) ; réponse
 *   arrivée : oui (son 2) ou non (son 3), la réponse rebondit dans l'historique ; manche gagnée par moi : bandeau
 *   « Personnage trouvé ! », son 5, confettis ; défaite vue en direct (QE1, effetsFin) : mon portrait de l'écran de fin est désigné,
 *   puis son « non » (S39), S16 et bandeau sobre, d'après la vraie dernière ligne « devine » du journal (une mauvaise proposition
 *   de ma part ne désigne rien). Animations coupées par mouvement réduit (matchMedia), préférence « effets »
 *   ou body.duels-calme ; les sons restent. Le signal « à toi de jouer » (son + titre) reste celui du cadre (commun/tour-signal.js).
 * Dépendances : core.js (esc, toast, motionAllowed), ../api.js (duel, erreurTexte), ./commun.js (creerCadre, nomJoueur, deNom),
 *   ./portrait.js (portraitSvg : SVG viewBox 100 × 120 d'après les attributs), ../../../commun/sons-jeux.js (jouerSonJeu),
 *   ../../../commun/effets-duels.js (anime, son), ./fin-fx.js.
 * Exporte : creer, effetsFin (fin de duel, via ./fin-fx.js).
 */
import { esc, toast, motionAllowed } from '../../../commun/core.js';
import { duel, erreurTexte } from '../api.js';
import { creerCadre, nomJoueur, deNom } from './commun.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';
import { portraitSvg } from './portrait.js';
import { voisinSpatial } from '../../../commun/grille-clavier.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { anime as animePermis, son as sonDuels } from '../../../commun/effets-duels.js';
import { vuEnCours, effetsFinDuel, fxFin } from './fin-fx.js';

const DELAI_ENVOI = 600;
const ANNONCE_MS = 6000;
const LIBRE_MIN = 4;
const LIBRE_MAX = 140;
/** Son du jeu (numéros de la maquette : sons-jeux.js). */
const SON = 'qui-est-ce';
/** Durées des effets (ms) : chacune reste sous 3 s. */
const DUREE_TOUR = 2400;      // « à toi » : pulsation de mon nom et zone des questions
const DUREE_BULLE = 2600;     // bulle « À toi de demander ? »
const DUREE_BANDEAU = 2300;   // bandeau « Personnage trouvé ! »
const DECALAGE_BASC = 120;    // retard entre deux portraits qui basculent (ms)
/** Attente des portraits de l'écran de fin : fin.js les charge après son premier rendu (nombre d'essais, écart en ms). */
const ESSAIS_PORTRAIT = 25;
const PAS_PORTRAIT = 60;
/** Parties (ids) où mon portrait a été désigné : fin.js redessine son bloc à chaque état, effetsFin le redésigne, sans animation. */
const DESIGNES = new Set();
const COULEURS_CONFETTI = ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398', '#E2C77E'];
/** Groupes des questions toutes prêtes ; les clés absentes d'ici vont dans « Autres ». */
const GROUPES = [
  ['Tête', ['chapeau']],
  ['Cheveux', ['cheveux', 'longs']],
  ['Yeux', ['yeux', 'lunettes']],
  ['Visage', ['barbe', 'boucles', 'peau']],
];
/** Attributs booléens (oui / non). */
const BOOLEENS = ['lunettes', 'barbe', 'boucles', 'longs'];
/** Dos de carte Uno (règles recopiées dans quiestce.css, classes qec-dos*). */
const DOS = '<span class="qec-dos" aria-hidden="true"><span class="qec-dos-f"><span class="qec-dos-bande"></span>'
  + '<span class="qec-dos-rond"><span class="qec-dos-hg">HG</span></span></span></span>';

/** Vrai si la valeur d'une question vaut « oui ». */
const vaut = (v) => v === true || v === 'oui' || v === 'true' || v === 1;

/**
 * Le personnage correspond-il à la question (clé, valeur) ?
 * Booléens : le trait est présent. Chapeau : « oui » = porte un chapeau, quel qu'il soit. Sinon égalité.
 * @param {object} a attributs du personnage.
 * @returns {boolean}
 */
function correspond(a = {}, cle, valeur) {
  if (BOOLEENS.includes(cle)) return !!a[cle] === vaut(valeur);
  if (cle === 'chapeau') {
    if (valeur === 'oui') return a.chapeau !== 'aucun';
    if (valeur === 'non') return a.chapeau === 'aucun';
  }
  return a[cle] === valeur;
}

/**
 * Répartit les questions toutes prêtes par groupe (en gardant leur index dans le catalogue).
 * @returns {Array<[string, Array<{qu: object, i: number}>]>} groupes non vides.
 */
function groupesDe(liste) {
  const indexees = liste.map((qu, i) => ({ qu, i }));
  const sortie = GROUPES.map(([titre, cles]) => [titre, indexees.filter(({ qu }) => cles.includes(qu.cle))]);
  const reste = indexees.filter(({ qu }) => !GROUPES.some(([, cles]) => cles.includes(qu.cle)));
  if (reste.length) sortie.push(['Autres', reste]);
  return sortie.filter(([, items]) => items.length);
}

/**
 * Crée la table « Qui est-ce ? ».
 * @param {HTMLElement} root conteneur de la vue.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @returns {{maj(etat: object): void, message(msg: object): void, detruire(): void}}
 */
export function creer(root, ctx) {
  const cadre = creerCadre(root, ctx, { classe: 'duels-qec' });
  boutonReponses(root.querySelector('.duels-barre-outils'), 'quiestce', () => st.etat?.partie?.id ?? null);
  const st = {
    etat: null,
    detruit: false,
    plateau: null, chargement: null, jeton: 0,        // personnages et questions (chargés une fois par manche)
    manche: null, baisses: new Set(),                 // manche vue ; mes personnages baissés (ids)
    timerEnvoi: null, envoi: Promise.resolve(),       // envoi groupé des baisses, dans l'ordre
    mode: 'normal',                                   // 'normal' | 'designation' (« Je sais qui c'est ! »)
    occupe: false, libre: '', reponse: null,          // envoi en cours ; brouillon de question libre ; dernière réponse
    annonce: null, timerAnnonce: null,                // message annoncé aux lecteurs d'écran (statut)
    telOuvert: false,                                 // volet « Poser une question » sur téléphone
    /* effets : tourAvant (mon tour à l'état précédent), tourDebut / tTour (pulsation, surlignage), bulle / tBulle,
       vuQ (réponses déjà vues : id → oui/non/null), aPoper (réponses à faire rebondir), nbManches (manches vues),
       montre (baisses déjà affichées : basculent seulement quand elles changent), timers et fx (à nettoyer) */
    tourAvant: undefined, tourDebut: false, tTour: null, bulle: false, tBulle: null,
    vuQ: null, aPoper: new Set(), nbManches: null,
    montre: null, timers: [], fx: [],
  };

  const joue = (e) => !!e?.moi?.joue && e?.partie?.statut === 'en_cours';
  const monTour = (e) => cadre.monTour(e);
  /** Une question libre attend-elle une réponse ? */
  const attente = (e) => (e?.quiestce?.question_en_attente ?? null) !== null;
  const questions = () => st.etat?.quiestce?.questions || [];
  const catalogue = () => st.plateau?.questions || [];
  const persos = () => st.plateau?.persos || [];
  const adversaire = () => cadre.adversaire(st.etat);
  const pseudoA = () => adversaire()?.pseudo || 'ton adversaire';
  const monRestant = () => persos().filter((p) => !st.baisses.has(p.id)).length;
  const textePose = (q) => q.texte
    || catalogue().find((x) => x.cle === q.cle && String(x.valeur) === String(q.valeur))?.texte || q.cle;
  const dejaPosee = (qu) => questions().some((x) => x.type === 'attribut' && x.cle === qu.cle && String(x.valeur) === String(qu.valeur));

  /** Texte de statut (lu par les lecteurs d'écran) selon la situation. */
  function statutTexte(e) {
    if (!e?.moi?.joue) return 'Tu regardes ce duel en spectateur.';
    const adv = pseudoA();
    if (attente(e)) return monTour(e) ? `${adv} te demande : réponds oui ou non.` : `En attente de la réponse ${deNom(adv)}.`;
    if (monTour(e)) return st.mode === 'designation' ? `Clique sur le personnage ${deNom(adv)}.` : 'À toi : pose une question ou désigne le personnage.';
    return `${adv} réfléchit…`;
  }
  const majStatut = () => cadre.statut(st.annonce || (st.etat ? statutTexte(st.etat) : ''));
  /** Annonce une information (réponse, envoi) dans le statut, quelques secondes. */
  function annoncer(texte) {
    st.annonce = texte;
    cadre.statut(texte);
    clearTimeout(st.timerAnnonce);
    st.timerAnnonce = setTimeout(() => { st.annonce = null; majStatut(); }, ANNONCE_MS);
  }

  /* ---------- Personnages baissés : envoi groupé ---------- */

  /** Programme l'envoi de la liste des baisses après un temps sans clic. */
  function planifierEnvoi() {
    clearTimeout(st.timerEnvoi);
    const manche = st.manche;
    st.timerEnvoi = setTimeout(() => { st.timerEnvoi = null; envoyerBaisses(manche); }, DELAI_ENVOI);
  }
  /** Envoie la liste complète des baisses (une manche donnée ; sans effet si la manche a changé). */
  function envoyerBaisses(manche) {
    if (manche !== st.manche) return;
    const ids = [...st.baisses];
    st.envoi = st.envoi
      .then(() => duel.baisser(ctx.code, ids))
      .catch((err) => toast(erreurTexte(err), 'error'));
  }

  /** Charge les personnages et les questions toutes prêtes (une fois par manche). */
  function charger() {
    if (st.plateau || st.chargement) return;
    const jeton = ++st.jeton;
    st.chargement = duel.plateau(ctx.code)
      .then((p) => { if (jeton === st.jeton && !st.detruit) st.plateau = p; })
      .catch((err) => { if (jeton === st.jeton) toast(erreurTexte(err), 'error'); })
      .finally(() => {
        if (jeton !== st.jeton) return;
        st.chargement = null;
        if (st.plateau) rendre();
      });
  }

  /** Baisse les personnages éliminés par mes questions déjà répondues. */
  function baisserAuto() {
    const mon = st.etat.moi.user_id;
    const mes = questions().filter((x) => x.auteur === mon && x.type === 'attribut' && x.reponse != null);
    if (!mes.length) { toast('Aucune de tes questions n’a encore de réponse.'); return; }
    let n = 0;
    for (const p of persos()) {
      if (st.baisses.has(p.id)) continue;
      if (mes.some((x) => correspond(p.attributs, x.cle, x.valeur) !== !!x.reponse)) { st.baisses.add(p.id); n += 1; }
    }
    if (n) planifierEnvoi();
    rendre();
    toast(n ? `${n} personnage${n > 1 ? 's' : ''} baissé${n > 1 ? 's' : ''}.` : 'Les personnages éliminés sont déjà baissés.');
  }

  /** Clic sur une carte : baisse ou relève ; en mode désignation, c'est une proposition. */
  function cliqueCarte(id) {
    const p = persos().find((x) => String(x.id) === id);
    if (!p || !joue(st.etat)) return;
    if (st.mode === 'designation') { deviner(p); return; }
    if (st.baisses.has(p.id)) st.baisses.delete(p.id); else st.baisses.add(p.id);
    planifierEnvoi();
    rendre();
  }

  /* ---------- Actions de jeu ---------- */

  /** Envoie une action au serveur, boutons désactivés pendant l'envoi. Renvoie true si elle a réussi. */
  async function agir(fn) {
    if (st.occupe) return false;
    st.occupe = true;
    rendre();
    try { await fn(); return true; } catch (err) { toast(erreurTexte(err), 'error'); return false; } finally {
      st.occupe = false;
      ctx.suivi?.rafraichir();
      rendre();
    }
  }

  /** Question toute prête : la réponse s'affiche tout de suite, puis le tour passe. */
  async function poser(i) {
    const qu = catalogue()[i];
    if (!qu || dejaPosee(qu)) return;
    let reponse = null;
    const ok = await agir(async () => { reponse = await duel.question(ctx.code, qu.cle, qu.valeur); });
    if (!ok || typeof reponse !== 'boolean') return;
    st.reponse = { texte: qu.texte, oui: reponse };
    annoncer(`Réponse : ${reponse ? 'Oui' : 'Non'} à « ${qu.texte} ».`);
    rendre();
  }

  /** Question libre : l'adversaire doit répondre. */
  async function envoyerLibre(brut) {
    const texte = String(brut || '').trim();
    if (texte.length < LIBRE_MIN || texte.length > LIBRE_MAX) {
      toast(`La question doit faire entre ${LIBRE_MIN} et ${LIBRE_MAX} caractères.`, 'error');
      return;
    }
    const ok = await agir(() => duel.questionLibre(ctx.code, texte));
    if (ok) {
      st.libre = '';
      annoncer(`Question envoyée. En attente de la réponse ${deNom(pseudoA())}.`);
    }
    rendre();
  }

  /** Réponse à la question libre qui m'attend. */
  async function repondre(oui) {
    const ok = await agir(() => duel.repondre(ctx.code, oui));
    if (ok) annoncer(`Tu as répondu ${oui ? 'oui' : 'non'}.`);
  }

  /** « Je pense que c'est… » : juste → manche gagnée, faux → manche perdue. */
  async function deviner(p) {
    if (!confirm(`Tu penses que c'est ${p.prenom} ? Si tu te trompes, tu perds la manche.`)) return;
    st.mode = 'normal';
    let juste = null;
    const ok = await agir(async () => { juste = await duel.deviner(ctx.code, p.id); });
    if (ok) toast(juste ? 'Bien joué, tu gagnes la manche !' : 'Raté, tu perds la manche.', juste ? 'ok' : 'error');
  }

  /* ---------- Effets (ajouts à la maquette) ---------- */

  /** Son du jeu (numéro de la maquette). */
  const son = (n) => jouerSonJeu(SON, n);
  /** Animations permises : préférence « effets », mouvement réduit et body.duels-calme les coupent (les sons restent). */
  const anim = () => motionAllowed() && !document.body.classList.contains('duels-calme');

  /** Zone « Poser une question » visible : colonne (ordinateur) ou bloc du téléphone. */
  function zoneQuestions() {
    const titre = [...cadre.cote.querySelectorAll('h2')].find((h) => /Poser une question/.test(h.textContent))?.closest('section');
    const tel = root.querySelector('.qec-ask-tel');
    return [titre, tel].find((z) => z && z.getClientRects().length) || null;
  }

  /** Bandeau au centre de l'écran, retiré tout seul. Animé seulement si les animations sont permises. sous est déjà échappé. */
  function bandeau(titre, sous) {
    const b = document.createElement('div');
    b.className = `qec-fx-ban${anim() ? ' is-anime' : ''}`;
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = `${esc(titre)}${sous ? `<small>${sous}</small>` : ''}`;
    document.body.append(b);
    st.fx.push(b);
    st.timers.push(setTimeout(() => b.remove(), DUREE_BANDEAU));
  }

  /** Confettis : 70 petits rectangles qui tombent, retirés d'eux-mêmes (moins de 3 s). */
  function confettis() {
    for (let i = 0; i < 70; i++) {
      const c = document.createElement('i');
      c.className = 'qec-fx-conf';
      c.setAttribute('aria-hidden', 'true');
      c.style.left = `${Math.random() * 100}vw`;
      c.style.background = COULEURS_CONFETTI[i % COULEURS_CONFETTI.length];
      c.style.animationDuration = `${(1.2 + Math.random()).toFixed(2)}s`;
      c.style.animationDelay = `${(Math.random() * 0.4).toFixed(2)}s`;
      document.body.append(c);
      st.fx.push(c);
      st.timers.push(setTimeout(() => c.remove(), 2800));
    }
  }

  /** Mon tour commence : mon nom pulse, la zone des questions s'éclaire ; bulle si c'est à moi de poser la question. */
  function debutTour(aMoi) {
    if (!anim()) return;
    st.tourDebut = true;
    st.bulle = aMoi;
    clearTimeout(st.tTour);
    clearTimeout(st.tBulle);
    st.tTour = setTimeout(() => { st.tourDebut = false; retirerTour(); }, DUREE_TOUR);
    st.tBulle = setTimeout(() => { st.bulle = false; retirerBulle(); }, DUREE_BULLE);
  }
  function retirerTour() {
    root.querySelectorAll('.qec-fx-tour, .qec-fx-surligne').forEach((el) => el.classList.remove('qec-fx-tour', 'qec-fx-surligne'));
  }
  function retirerBulle() {
    root.querySelectorAll('.qec-fx-bulle').forEach((el) => el.remove());
  }

  /** J'ai gagné la manche (personnage trouvé) : son, bandeau, confettis. */
  function celebrer(e) {
    son(5);
    const adv = cadre.adversaire(e);
    const nom = adv?.robot ? 'Le robot' : (adv?.pseudo || 'ton adversaire');
    bandeau('Personnage trouvé !', esc(`Tu as deviné le personnage ${deNom(nom)}`));
    if (anim()) confettis();
  }

  /** Effets d'un nouvel état, sur les vrais changements seulement (le premier état reçu n'anime rien). */
  function effets(e) {
    const mt = monTour(e);
    if (st.tourAvant === false && mt) debutTour(mt && !attente(e));
    st.tourAvant = mt;
    // Questions : nouvelle question (cloche), réponse arrivée (oui ou non, la réponse rebondit).
    const qs = questions();
    if (st.vuQ) {
      qs.forEach((x) => {
        const avant = st.vuQ.get(x.id);
        if (avant === undefined) {
          if (x.reponse == null) son(4);
          else { son(x.reponse ? 2 : 3); st.aPoper.add(x.id); }
        } else if (avant == null && x.reponse != null) {
          son(x.reponse ? 2 : 3);
          st.aPoper.add(x.id);
        }
      });
    }
    st.vuQ = new Map(qs.map((x) => [x.id, x.reponse ?? null]));
    // Manche finie : je l'ai gagnée → personnage trouvé.
    const h = e.partie?.historique || [];
    if (st.nbManches === null) st.nbManches = h.length;
    else if (h.length > st.nbManches) {
      st.nbManches = h.length;
      const gagnant = h[h.length - 1]?.gagnant;
      if (gagnant && gagnant === e.moi?.user_id) celebrer(e);
    }
  }

  /** Portraits qui basculent : les personnages qui viennent d'être baissés se retournent un à un ; le portrait cède la place
   *  au dos « HG » à mi-tour. ids : baissés nouvellement ; avant : portraits d'avant (id → HTML). */
  function basculer(ids, avant) {
    ids.forEach((id, i) => {
      const b = cadre.plateau.querySelector(`[data-act="carte"][data-id="${CSS.escape(String(id))}"]`);
      if (!b) return;
      const delai = Math.min(i, 12) * DECALAGE_BASC;
      const dos = b.querySelector('.qec-dos');
      const portrait = avant.get(String(id));
      b.style.animationDelay = `${delai}ms`;
      b.classList.add('qec-fx-bascule');
      const fin = (ev) => {
        if (ev.target !== b) return;   // les animations des enfants (dos) remontent aussi jusqu'ici
        b.classList.remove('qec-fx-bascule');
        b.style.animationDelay = '';
        b.removeEventListener('animationend', fin);
      };
      b.addEventListener('animationend', fin);
      if (dos && portrait) {
        dos.style.display = 'none';
        dos.insertAdjacentHTML('beforebegin', portrait);
        const p = b.querySelector('.qec-portrait');
        st.timers.push(setTimeout(() => { p?.remove(); dos.style.display = ''; }, delai + 330));
      }
    });
  }

  /** Effets en cours, posés après chaque redessin (le cadre et les zones sont reconstruits) : pulsation, zone, bulle, rebond. */
  function decorer() {
    const e = st.etat;
    if (!e) return;
    const monTourMaint = st.tourDebut && monTour(e);
    if (monTourMaint) {
      const i = (e.joueurs || []).findIndex((j) => j.user_id === e.moi?.user_id);
      root.querySelectorAll('.duels-face-j')[i]?.classList.add('qec-fx-tour');
    }
    const zone = zoneQuestions();
    if (zone) {
      zone.classList.add('qec-fx-zone');
      if (monTourMaint) zone.classList.add('qec-fx-surligne');
      if (st.bulle && !zone.querySelector('.qec-fx-bulle')) {
        const b = document.createElement('div');
        b.className = 'qec-fx-bulle';
        b.setAttribute('aria-hidden', 'true');
        b.textContent = 'À toi de demander ?';
        zone.append(b);
      }
    }
    if (st.aPoper.size) {
      if (anim()) {
        const qs = questions();
        cadre.cote.querySelectorAll('.qec-histo > li').forEach((li, i) => {
          if (st.aPoper.has(qs[i]?.id)) li.querySelector('.qec-rep')?.classList.add('qec-fx-pop');
        });
      }
      st.aPoper.clear();
    }
  }

  /* ---------- Rendu ---------- */

  /** Carte d'un personnage : portrait (levé) ou dos de carte (baissé). */
  function carte(p, { ouvert, mon, designation }) {
    const baisse = st.baisses.has(p.id);
    const moiPerso = p.id === mon;
    const bloque = !ouvert || (designation && (baisse || st.occupe));
    const label = `${p.prenom}, ${baisse ? 'baissé' : 'levé'}${moiPerso ? ', ton personnage' : ''}`;
    const id = esc(String(p.id));
    const visuel = baisse ? DOS : `<span class="qec-portrait" aria-hidden="true">${portraitSvg(p.attributs, { titre: p.prenom })}</span>`;
    return `<button type="button" class="qec-carte${baisse ? ' is-baisse' : ''}${moiPerso ? ' is-mon' : ''}${designation && !baisse ? ' is-cible' : ''}"
        data-act="carte" data-id="${id}" data-k="carte-${id}" aria-pressed="${baisse}" aria-label="${esc(label)}" ${bloque ? 'disabled' : ''}>
      ${visuel}<span class="qec-nom">${esc(p.prenom)}</span>${moiPerso ? '<span class="qec-tag">Ton perso</span>' : ''}
    </button>`;
  }

  /** Barre compacte de téléphone : mon personnage et les compteurs. */
  function barreTel(p, nbMoi, nbAdv) {
    return `<div class="qec-tel qec-barre-tel">
      <span class="qec-mini" aria-hidden="true">${portraitSvg(p.attributs, { titre: p.prenom })}</span>
      <div><span class="qec-petit">Ton personnage</span><strong class="qec-grand-nom">${esc(p.prenom)}</strong></div>
      <span class="qec-petit qec-droite">Il te reste ${nbMoi ?? '…'}${adversaire()?.robot ? '' : `<br>${esc(pseudoA())} en a ${nbAdv ?? '?'}`}</span>
    </div>`;
  }

  /** Bloc « question » : réponse attendue, attente, ou commandes de question (selon le tour). */
  function blocQuestions(e, tel) {
    const q = e.quiestce || {};
    const adv = esc(pseudoA());
    const occ = st.occupe;
    const tour = monTour(e);
    if (attente(e)) {
      const pend = questions().find((x) => x.id === q.question_en_attente);
      if (tour) {
        return `<div class="qec-attend" role="group" aria-label="Répondre à ${adv}">
          <p><strong>${adv} te demande :</strong> « ${esc(pend?.texte || '')} »</p>
          <div class="qec-oui-non">
            <button type="button" class="btn btn-primary qec-btn" data-act="repondre" data-oui="1" data-k="rep-oui" ${occ ? 'disabled' : ''}>Oui</button>
            <button type="button" class="btn btn-ghost qec-btn" data-act="repondre" data-oui="0" data-k="rep-non" ${occ ? 'disabled' : ''}>Non</button>
          </div></div>`;
      }
      return pend?.auteur === e.moi.user_id
        ? `<p class="qec-attente">En attente de la réponse ${deNom(adv)} à « ${esc(pend.texte || '')} ».</p>`
        : `<p class="qec-attente">${adv} réfléchit…</p>`;
    }
    if (!tour) return `<p class="qec-attente">${adv} réfléchit…</p>`;
    if (st.mode === 'designation') {
      return `<div class="qec-desig" role="group" aria-label="Désigner un personnage">
        <p>Clique sur le personnage que tu penses être celui ${deNom(adv)}. Une erreur fait perdre la manche.</p>
        <button type="button" class="btn btn-ghost qec-btn" data-act="annuler" data-k="annuler">Annuler</button></div>`;
    }
    return controles(e, tel);
  }

  /** Commandes de mon tour : questions toutes prêtes, question libre, « Je sais qui c'est ! ». */
  function controles(e, tel) {
    const occ = st.occupe;
    const groupes = groupesDe(catalogue()).map(([titre, items]) => `
      <div class="qec-groupe"><h3 class="qec-groupe-titre">${titre}</h3>
        <div class="qec-chips">${items.map(({ qu, i }) => {
          const deja = dejaPosee(qu);
          return `<button type="button" class="qec-chip" data-act="question" data-i="${i}" data-k="q-${i}" ${occ || deja ? 'disabled' : ''}>`
            + `${esc(qu.texte)}${deja ? ' <span class="qec-deja">(déjà posée)</span>' : ''}</button>`;
        }).join('')}</div></div>`).join('');
    const retour = st.reponse
      ? `<p class="qec-retour">Dernière réponse : <strong>${st.reponse.oui ? 'Oui' : 'Non'}</strong> à « ${esc(st.reponse.texte)} ».</p>`
      : '';
    const libre = e.quiestce?.libres ? `<form class="qec-libre" data-act="libre">
        <label class="qec-libre-lab">Question libre
          <input type="text" name="texte" value="${esc(st.libre)}" maxlength="${LIBRE_MAX}" autocomplete="off" data-k="libre"
            placeholder="Ex. Il a un air sérieux ?" ${occ ? 'disabled' : ''}>
        </label>
        <button type="submit" class="btn btn-ghost qec-btn" data-k="libre-envoyer" ${occ ? 'disabled' : ''}>Envoyer</button>
      </form>` : '';
    const corps = `${retour}<div class="qec-groupes">${groupes}</div>${libre}`;
    const designer = `<div class="qec-actions"><button type="button" class="btn btn-primary qec-btn" data-act="designer" data-k="designer" ${occ ? 'disabled' : ''}>Je sais qui c'est !</button></div>`;
    if (tel) return `<details class="qec-details" ${st.telOuvert ? 'open' : ''}><summary>Poser une question</summary>${corps}</details>${designer}`;
    return `<h2 class="duels-h3">Poser une question</h2>${corps}${designer}`;
  }

  /** Historique des questions de la manche (les deux joueurs). */
  function historique(e) {
    const liste = questions();
    if (!liste.length) return '<p class="qec-attente">Aucune question pour l’instant.</p>';
    const moi = e.moi.user_id;
    return `<ol class="qec-histo" aria-label="Questions de la manche">${liste.map((x) => {
      const j = (e.joueurs || []).find((jj) => jj.user_id === x.auteur);
      const qui = x.auteur === moi && e.moi.joue ? 'Toi' : nomJoueur(j);
      const rep = x.reponse === true ? '<span class="qec-rep is-oui">Oui</span>'
        : x.reponse === false ? '<span class="qec-rep is-non">Non</span>'
          : '<span class="qec-rep is-attente">sans réponse</span>';
      return `<li><span class="qec-histo-qui">${qui} :</span> <span>${esc(textePose(x))}</span> ${rep}</li>`;
    }).join('')}</ol>`;
  }

  /** Retient l'élément qui a le focus (pour le retrouver après un nouveau rendu). */
  function focusCourant() {
    const a = document.activeElement;
    if (!a || !root.contains(a) || !a.dataset) return null;
    return { k: a.dataset.k, debut: a.selectionStart ?? null };
  }
  /** Rend le focus à l'élément de même clé (la copie visible si le plateau existe en deux exemplaires). */
  function restaurerFocus(f) {
    if (!f?.k) return;
    const el = [...root.querySelectorAll('[data-k]')]
      .find((x) => x.dataset.k === f.k && !x.disabled && x.getClientRects().length);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (f.debut !== null && el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length);
  }

  /** Redessine le plateau et le côté selon l'état courant. */
  function rendre() {
    const e = st.etat;
    if (!e || st.detruit) return;
    const f = focusCourant();
    const q = e.quiestce || {};
    const ouvert = joue(e);
    const liste = persos();
    const mon = q.mon_perso;
    const monPerso = liste.find((p) => p.id === mon);
    const designation = st.mode === 'designation';
    const nbMoi = st.plateau ? monRestant() : null;
    const advId = (e.joueurs || []).find((j) => j.user_id !== e.moi.user_id)?.user_id;
    const nbAdv = advId ? q.restants_adverses?.[advId] : undefined;
    const nomAdv = esc(pseudoA());
    const cartes = liste.map((p) => carte(p, { ouvert, mon, designation })).join('');
    // Baissés en plus depuis le dernier affichage : ils basculent (sauf au premier affichage d'une manche).
    const nouveaux = st.montre && st.plateau ? [...st.baisses].filter((id) => !st.montre.has(id)) : [];
    const basc = anim() ? nouveaux : [];   // le son joue même sans animation ; le basculement non
    const avant = new Map(basc.length ? [...cadre.plateau.querySelectorAll('.qec-carte')]
      .map((b) => [b.dataset.id, b.querySelector('.qec-portrait')?.outerHTML || '']) : []);
    if (st.plateau) st.montre = new Set(st.baisses);

    cadre.plateau.innerHTML = `
      <div class="qec-entete">
        <h2 class="duels-h3">Les habitants du quartier</h2>
        ${ouvert ? `<button type="button" class="btn btn-ghost qec-btn" data-act="auto" data-k="auto" ${st.occupe || !liste.length ? 'disabled' : ''}>Baisser automatiquement</button>` : ''}
      </div>
      ${ouvert && monPerso ? barreTel(monPerso, nbMoi, nbAdv) : ''}
      ${st.plateau ? `<div class="qec-grille" role="group" aria-label="Personnages">${cartes}</div>` : '<p class="qec-attente">Chargement des personnages…</p>'}
      ${ouvert ? `<div class="qec-tel qec-ask-tel">${blocQuestions(e, true)}</div>` : ''}`;

    cadre.cote.innerHTML = `
      ${ouvert && monPerso ? `<section class="qec-bloc qec-perso qec-ord" aria-label="Ton personnage">
          <p class="qec-petit">Ton personnage</p>
          <div class="qec-portrait qec-portrait-grand" role="img" aria-label="Portrait de ${esc(monPerso.prenom)}">${portraitSvg(monPerso.attributs, { titre: monPerso.prenom })}</div>
          <strong class="qec-grand-nom">${esc(monPerso.prenom)}</strong>
          <p class="qec-aide">${nomAdv} doit deviner ce personnage.</p>
        </section>` : ''}
      ${ouvert && st.plateau ? `<section class="qec-bloc qec-ord">
          <h2 class="duels-h3">Personnages debout</h2>
          <p class="qec-aide">Il te reste <strong>${nbMoi}</strong>.${adversaire()?.robot ? '' : ` Chez ${nomAdv} : <strong>${nbAdv ?? '?'}</strong>.`}</p>
        </section>` : ''}
      ${ouvert ? `<section class="qec-bloc qec-ord">${blocQuestions(e, false)}</section>` : ''}
      <section class="qec-bloc">
        <h2 class="duels-h3">Questions de la manche</h2>
        ${historique(e)}
      </section>`;
    restaurerFocus(f);
    if (nouveaux.length) son(1);   // portrait baissé (son 1 de la maquette)
    basculer(basc, avant);
    decorer();
  }

  /* ---------- Écouteurs (délégation sur la racine) ---------- */

  function surClic(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled || !st.etat) return;
    switch (b.dataset.act) {
      case 'carte': cliqueCarte(b.dataset.id); break;
      case 'auto': baisserAuto(); break;
      case 'question': poser(Number(b.dataset.i)); break;
      case 'repondre': repondre(b.dataset.oui === '1'); break;
      case 'designer': st.mode = 'designation'; majStatut(); rendre(); break;
      case 'annuler': st.mode = 'normal'; majStatut(); rendre(); break;
      default: break;
    }
  }
  function surSoumission(ev) {
    const formulaire = ev.target;
    if (formulaire.dataset?.act !== 'libre') return;
    ev.preventDefault();
    envoyerLibre(formulaire.querySelector('input[name="texte"]')?.value);
  }
  function surSaisie(ev) {
    if (ev.target.dataset?.k === 'libre') st.libre = ev.target.value;
  }
  function surTouche(ev) {
    if (ev.key === 'Escape' && st.mode === 'designation') { st.mode = 'normal'; majStatut(); rendre(); }
    // Flèches entre les cartes de personnages actives (les copies masquées et les cartes désactivées sont sautées).
    if (ev.key.startsWith('Arrow') && ev.target.closest?.('[data-act="carte"]')) {
      const voisine = voisinSpatial(ev.key, ev.target, [...root.querySelectorAll('[data-act="carte"]:not(:disabled)')]);
      if (voisine) { ev.preventDefault(); voisine.focus({ preventScroll: true }); }
    }
  }
  function surOuverture(ev) {
    if (ev.target.classList?.contains('qec-details')) st.telOuvert = ev.target.open;
  }

  root.addEventListener('click', surClic);
  root.addEventListener('submit', surSoumission);
  root.addEventListener('input', surSaisie);
  root.addEventListener('keydown', surTouche);
  root.addEventListener('toggle', surOuverture, true);

  return {
    /** Nouvel état : nouvelle manche = personnages rechargés et baisses à zéro ; puis barre, statut et rendu. */
    maj(e) {
      vuEnCours(e.partie);
      if (st.detruit) return;
      st.etat = e;
      const manche = e.partie?.manche;
      if (st.manche !== manche) {
        st.manche = manche;
        st.baisses = new Set(e.quiestce?.mes_baisses || []);
        clearTimeout(st.timerEnvoi); st.timerEnvoi = null;
        st.mode = 'normal'; st.reponse = null;
        st.plateau = null; st.chargement = null;
        st.montre = null; st.vuQ = null;   // nouvelle manche : son état de départ n'anime rien
      }
      if (st.mode === 'designation' && !(monTour(e) && !attente(e))) st.mode = 'normal';
      charger();
      cadre.maj(e);
      majStatut();
      effets(e);
      rendre();
    },
    message(m) { cadre.message(m); },
    detruire() {
      if (st.detruit) return;
      st.detruit = true;
      root.removeEventListener('click', surClic);
      root.removeEventListener('submit', surSoumission);
      root.removeEventListener('input', surSaisie);
      root.removeEventListener('keydown', surTouche);
      root.removeEventListener('toggle', surOuverture, true);
      clearTimeout(st.timerAnnonce);
      clearTimeout(st.tTour);
      clearTimeout(st.tBulle);
      st.timers.forEach((t) => clearTimeout(t));
      st.fx.forEach((el) => el.remove());
      if (st.timerEnvoi) { clearTimeout(st.timerEnvoi); st.timerEnvoi = null; envoyerBaisses(st.manche); }
      cadre.detruire();
    },
  };
}

/**
 * Dernière proposition de la partie, lue dans le journal (hg_duel__qec_deviner ; le journal arrive du plus récent au plus ancien).
 * @returns {{trouve: boolean, prenom: string}|null} trouve : la proposition était juste ; prenom : le vrai personnage.
 */
function derniereProposition(e) {
  const texte = String((e.journal || []).find((l) => l.type === 'devine')?.texte || '');
  const juste = texte.match(/ pense que c'est (.+) : gagné !$/);
  if (juste) return { trouve: true, prenom: juste[1] };
  const fausse = texte.match(/ : perdu, c'était (.+)\.$/);
  return fausse ? { trouve: false, prenom: fausse[1] } : null;
}

/** Désigne mon portrait sur l'écran de fin (ma carte, pas forcément la première). Rend false s'il n'est pas encore là. */
function designer(root, e, vif) {
  const c = root.querySelectorAll('.duels-fin-perso')[(e.joueurs || []).findIndex((j) => j.user_id === e.moi?.user_id)];
  if (!c) return false;
  c.classList.add('qec-fx-trouve');
  if (vif) fxFin.classe(c, 'fxd-secoue', 500);
  return true;
}

/**
 * QE1 : défaite vue en direct. L'adversaire a trouvé : mon portrait est désigné, puis S39, S16 et bandeau. J'ai proposé le mauvais
 * personnage : personne n'a deviné le mien, rien à désigner ; mêmes sons, bandeau qui dit le vrai.
 */
function defaite(root, e) {
  const adv = (e.joueurs || []).find((j) => j.user_id !== e.moi?.user_id);
  const nom = adv?.robot ? 'Le robot' : (adv?.pseudo || 'Ton adversaire');
  const prop = derniereProposition(e);
  const texte = !prop ? ['Duel perdu', `${nom} gagne le duel`]
    : prop.trouve ? ['Personnage découvert', `${nom} a deviné ${prop.prenom}`] : ['Duel perdu', `C’était ${prop.prenom}`];
  const suite = () => {
    jouerSonJeu(SON, 3);
    fxFin.plus(() => {
      sonDuels('S16');
      fxFin.plus(() => fxFin.bandeau(texte[0], texte[1], { ton: 'd' }), 300);
    }, 400);
  };
  if (!prop?.trouve) { suite(); return; }
  const id = e.partie?.id;
  if (id) DESIGNES.add(id);
  const tenter = (n) => {
    if (designer(root, e, animePermis()) || !n) suite();
    else fxFin.plus(() => tenter(n - 1), PAS_PORTRAIT);
  };
  tenter(root.querySelector('[data-grille]')?.hidden ? 0 : ESSAIS_PORTRAIT);   // invité : pas de portraits
}

/** Fin de duel vue en direct (appelé par vues/fin.js à chaque état) : gagnant : « Personnage trouvé ! », son, brillance, confettis ;
 *  perdant : QE1. son() n'est appelé qu'une fois, partie vue en direct : c'est là que part l'effet. */
export function effetsFin(root, e) {
  if (DESIGNES.has(e.partie?.id)) designer(root, e, false);
  effetsFinDuel(root, e, {
    jeu: SON,
    son: (issue) => {
      if (issue === 'perdant') defaite(root, e);
      return issue === 'gagnant' ? 5 : null;
    },
    titre: (issue) => (issue === 'gagnant' ? ['Personnage trouvé !', 'Duel gagné'] : null),
  });
}
