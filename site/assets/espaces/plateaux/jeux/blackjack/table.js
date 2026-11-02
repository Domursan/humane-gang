// ===== Humane Gang — Blackjack : la table de jeu (plateaux/jeux/blackjack/table.js) =====
/*
 * Rôle : affiche une partie de blackjack en cours (1 à 7 joueurs contre la banque).
 *   Bandeau (joueurs, chrono, manche n / N), barre (code, quitter), tapis (banque, sièges, mains : plateau.js),
 *   panneau d'action selon la phase : mise (curseur, boutons rapides, « Miser ») ; jeu (Tirer, Rester, Doubler,
 *   Séparer) pour la main active ; résultats de la dernière manche, classement aux jetons, journal, chat
 *   (à droite sur ordinateur, en tiroir sur téléphone). Mise en page : assets/espaces/plateaux/blackjack.css.
 *   Les zones sont reconstruites seulement quand leur contenu change (le focus et le curseur restent en place).
 *   Effets visuels (« à toi », cartes qui glissent, carte retournée, jetons, gagnant) : ./effets.js, après chaque rendu.
 *   Fin de partie (BJ1) : avantFin garde le tapis le temps que les jetons rejoignent mon siège ou la banque. Le serveur règle la banque
 *   et termine la partie dans la même opération : la table montre encore la carte cachée, jamais le total de la banque.
 * Dépendances : commun/tour-signal.js (creerSignalTour), core.js (esc, initials, toast), ../../api.js (plat, erreurTexte), ../../vues/commun.js (bandeauHtml,
 *   brancherChrono, journalHtml, envoyer, moiJoueur, joueurDe), ../../vues/chat.js (creerChat, tiroirChat), commun/effets-duels.js (anime), ../../vues/fin-fx.js (effetsFinPlateau, fxFin, issuePlateau), ./fin.js (finFx), ./plateau.js, ./effets.js.
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire(), avantFin(etat) }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 */
import { esc, initials, toast } from '../../../../commun/core.js';
import { plat, erreurTexte } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, envoyer, moiJoueur, joueurDe, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { tapisHtml, valeurCarte } from './plateau.js';
import { creerEffets } from './effets.js';
import { anime } from '../../../../commun/effets-duels.js';
import { effetsFinPlateau, fxFin, issuePlateau } from '../../vues/fin-fx.js';
import { finFx } from './fin.js';

const ECRAN_GRAND = '(min-width: 761px)';
const MISE_MIN = 10;                                  // mise minimale (serveur)
const MISE_MAX = 500;                                 // mise maximale (serveur)
const PAS_CURSEUR = 5;
const RAPIDES = [10, 25, 50, 100, 250, 500];         // boutons de mise rapide
/** Lignes du journal qui annoncent le résultat d'une manche (gain, perte, banque, égalité). */
const RESULTAT = / (gagne|perd) \d+ jetons|récupère sa mise|^La banque a \d|Blackjack de la banque/;
const GARDE_FIN = 1900;                               // ms : la table reste à l'écran après la fin, le temps du vol des jetons

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="bj-bandeau" data-bandeau></header>
  <div class="bj-barre" role="toolbar" aria-label="Actions de la partie">
    <span class="bj-code small muted" data-code></span>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <p class="bj-alerte" data-alerte hidden></p>
  <div class="bj-corps">
    <div class="bj-colonne-jeu">
      <div data-tapis></div>
      <section class="bj-bloc bj-panneau" aria-labelledby="bj-action-titre" aria-live="polite" data-panneau></section>
    </div>
    <aside class="bj-colonne-cote" aria-label="Résultats, classement, journal et chat">
      <section class="bj-bloc" aria-labelledby="bj-derniere-titre" data-derniere></section>
      <section class="bj-bloc" aria-labelledby="bj-classement-titre" data-classement></section>
      <section class="bj-bloc" aria-labelledby="bj-journal-titre">
        <h2 id="bj-journal-titre" class="bj-bloc-titre">Journal</h2>
        <div data-journal></div>
      </section>
      <div class="bj-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="bj-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/** Montant en jetons, format suisse. */
const jetons = (n) => Math.round(Number(n) || 0).toLocaleString('fr-CH');

/** Valeur de la carte pour une paire (figures réunies). */
const memeValeur = (a, b) => !!a && !!b && valeurCarte(a) === valeurCarte(b);

/**
 * Monte la table de blackjack dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const grand = window.matchMedia(ECRAN_GRAND);

  const el = document.createElement('section');
  el.className = 'bj-table';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), code: q('[data-code]'), quitter: q('[data-quitter]'), alerte: q('[data-alerte]'),
    tapis: q('[data-tapis]'), panneau: q('[data-panneau]'), derniere: q('[data-derniere]'),
    classement: q('[data-classement]'), journal: q('[data-journal]'), chatZone: q('[data-chat]'),
    tiroirChatZone: q('[data-tiroir-chat]'), annonce: q('[data-annonce]'),
  };
  refs.code.textContent = `Code ${code}`;

  let etat = null;
  let occupe = false;
  let finie = false;               // état final reçu : la table reste un instant à l'écran, plus aucune action (jamais remis à faux)
  let arretChrono = null;
  const cles = {};                 // clé du dernier rendu de chaque zone
  let miseChoisie = 50;            // curseur de mise, gardé entre deux rendus
  let dernierTour = null;          // pour annoncer « À toi de jouer »

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

  /* ---------- Lecture de l'état ---------- */

  const monId = () => moiJoueur(etat)?.user_id ?? null;
  const jeu = () => etat?.jeu || {};
  const phase = () => jeu().phase;
  const monTour = () => !!monId() && jeu().actif === monId();
  const jeAiSorti = () => !!moiJoueur(etat)?.elimine;
  const peutAgir = () => !moiJoueur(etat)?.parti && !finie && !occupe && !jeAiSorti() && etat?.partie?.statut === 'en_cours';
  const pseudoDe = (uid) => (uid == null ? '' : (joueurDe(etat, uid)?.pseudo || '?'));
  const acteurPseudo = () => pseudoDe(jeu().actif);
  const jetonsMoi = () => Number(moiJoueur(etat)?.etat?.jetons) || 0;
  /** Mes mains (liste), et la main active (celle que le serveur attend). */
  const mesMains = () => moiJoueur(etat)?.etat?.mains || [];
  const monIndex = () => (Number.isInteger(jeu().main) ? jeu().main : 0);
  const maMain = () => mesMains()[monIndex()] || null;

  /** Sièges : un par joueur (ordre des places), avec ses mains et leurs totaux. */
  function sieges() {
    const J = jeu();
    const totaux = J.totaux || {};
    return (etat.joueurs || []).map((j) => {
      const e = j.etat || {};
      const mains = (e.mains || []).map((m, i) => ({
        cartes: Array.isArray(m.cartes) ? m.cartes : [],
        mise: Number(m.mise) || 0,
        statut: m.statut,
        total: (totaux[j.user_id] || [])[i] ?? null,
        active: J.phase === 'jeu' && J.actif === j.user_id && monIndex() === i,
      }));
      return {
        id: j.user_id, pseudo: j.pseudo, couleur: j.couleur, invite: !!j.invite, initiale: initials(j.pseudo || '?'),
        jetons: Number(e.jetons) || 0, mise: Number(e.mise) || 0,
        tour: !!J.actif && J.actif === j.user_id, moi: j.user_id === monId(), sorti: !!j.elimine, parti: !!j.parti, mains,
      };
    }).filter((s) => !s.parti || s.mains.length || s.mise);
  }

  /* ---------- Rendu : bandeau et chrono ---------- */

  function rendreBandeau() {
    const J = jeu();
    const sous = J.manches ? `Manche ${J.manche ?? 0} sur ${J.manches}` : '';
    const html = bandeauHtml(etat, { titre: 'Blackjack', sousTitre: sous });
    if (cles.bandeau === html) return;
    cles.bandeau = html;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  function rendreAlerte() {
    const on = jeAiSorti();
    refs.alerte.hidden = !on;
    refs.alerte.textContent = on ? 'Tu n\'as plus de quoi miser : tu regardes la suite.' : '';
    refs.quitter.disabled = !moiJoueur(etat) || moiJoueur(etat)?.parti === true;
  }

  /* ---------- Rendu : tapis ---------- */

  function rendreTapis() {
    const J = jeu();
    const liste = sieges();
    const opts = { banque: J.banque || [], totalBanque: J.banque_total ?? null, phase: J.phase, sieges: liste };
    const cle = JSON.stringify([opts, monId()]);
    if (cles.tapis === cle) return;
    cles.tapis = cle;
    refs.tapis.innerHTML = tapisHtml(opts);
  }

  /* ---------- Rendu : résultats de la dernière manche ---------- */

  /** Lignes du journal qui forment le dernier règlement (les plus récentes d'abord). */
  function derniereManche() {
    const lignes = etat.journal || [];
    const debut = lignes.findIndex((l) => RESULTAT.test(l.texte || ''));
    if (debut < 0) return [];
    const bloc = [];
    for (let i = debut; i < lignes.length && RESULTAT.test(lignes[i].texte || ''); i++) bloc.push(lignes[i]);
    return bloc;
  }

  function rendreDerniere() {
    const bloc = derniereManche();
    const cle = JSON.stringify(bloc.map((l) => [l.id, l.texte]));
    if (cles.derniere === cle) return;
    cles.derniere = cle;
    refs.derniere.innerHTML = `<h2 id="bj-derniere-titre" class="bj-bloc-titre">Dernière manche</h2>
      ${bloc.length ? journalHtml(bloc, etat) : '<p class="bj-note">Pas encore de manche réglée.</p>'}`;
  }

  /* ---------- Rendu : classement aux jetons, journal ---------- */

  function rendreClassement() {
    const lignes = [...(etat.joueurs || [])].filter((j) => !j.parti)
      .sort((a, b) => (Number(b.etat?.jetons) || 0) - (Number(a.etat?.jetons) || 0));
    const cle = JSON.stringify([lignes.map((j) => [j.user_id, j.etat?.jetons, j.elimine]), monId()]);
    if (cles.classement === cle) return;
    cles.classement = cle;
    refs.classement.innerHTML = `<h2 id="bj-classement-titre" class="bj-bloc-titre">Classement aux jetons</h2>
      <ol class="bj-classement">${lignes.map((j) => `<li>
        <strong>${esc(j.pseudo || '?')}</strong>
        ${j.invite ? ' <span class="bj-etiquette">invité</span>' : ''}${j.user_id === monId() ? ' <span class="bj-etiquette">toi</span>' : ''}
        ${j.elimine ? ' <span class="bj-etiquette">éliminé</span>' : ''}
        <span class="bj-classement-jetons">${esc(Math.round(Number(j.etat?.jetons) || 0).toLocaleString('fr-CH'))}</span></li>`).join('') || '<li class="bj-vide">Pas encore de classement.</li>'}</ol>`;
  }

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  /* ---------- Rendu : panneau d'action ---------- */

  /** Curseur de mise et boutons rapides (mise de 10 à 500 jetons, sans dépasser mon tapis). */
  function vueMise() {
    const max = Math.min(MISE_MAX, jetonsMoi());
    miseChoisie = Math.min(max, Math.max(MISE_MIN, Math.round(miseChoisie / PAS_CURSEUR) * PAS_CURSEUR));
    const rapides = RAPIDES.map((m) => `<button type="button" class="bj-rapide" data-rapide="${esc(m)}"${m > max ? ' disabled' : ''}
      aria-label="Miser ${esc(m)} jetons">${esc(m)}</button>`).join('');
    return `<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">Fais ta mise</h2>
      <p class="bj-note">Tu as ${esc(jetons(jetonsMoi()))} jetons. Mise entre ${MISE_MIN} et ${esc(max)}.</p>
      <form class="bj-form-mise" data-form-mise>
        <div class="bj-curseur-tete">
          <label for="bj-mise-curseur">Montant</label>
          <output id="bj-mise-val" for="bj-mise-curseur" class="bj-curseur-val" aria-live="polite">${esc(miseChoisie)}</output>
        </div>
        <input id="bj-mise-curseur" class="bj-curseur" type="range" min="${MISE_MIN}" max="${esc(max)}" step="${PAS_CURSEUR}" value="${esc(miseChoisie)}">
        <div class="bj-rapides" role="group" aria-label="Mises rapides">${rapides}</div>
        <div class="bj-pied"><button type="submit" class="bj-btn bj-btn-primary bj-grand" data-miser${peutAgir() ? '' : ' disabled'}>Miser <span data-mise-texte>${esc(miseChoisie)}</span> jetons</button></div>
      </form>`;
  }

  /** Actions sur la main active : tirer, rester, doubler, séparer (selon les cartes et les jetons). */
  function vueJeu() {
    const h = maMain();
    const mains = mesMains();
    const cartes = h?.cartes || [];
    const misesTotal = mains.reduce((s, m) => s + (Number(m.mise) || 0), 0);
    const total = (jeu().totaux?.[monId()] || [])[monIndex()];
    const peutDoubler = cartes.length === 2 && jetonsMoi() >= misesTotal + (Number(h?.mise) || 0);
    const peutSeparer = mains.length === 1 && cartes.length === 2 && memeValeur(cartes[0], cartes[1])
      && jetonsMoi() >= (Number(h?.mise) || 0) * 2;
    const dis = peutAgir() ? '' : ' disabled';
    return `<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">Ton tour</h2>
      <p class="bj-note">Ta main : total <strong>${esc(total ?? '–')}</strong>, mise <strong>${esc(jetons(h?.mise || 0))}</strong> jetons.</p>
      <div class="bj-actions" role="group" aria-label="Actions sur ta main">
        <button type="button" class="bj-btn bj-btn-primary" data-action="tirer"${dis}>Tirer</button>
        <button type="button" class="bj-btn" data-action="rester"${dis}>Rester</button>
        ${peutDoubler ? `<button type="button" class="bj-btn" data-action="doubler"${dis}>Doubler</button>` : ''}
        ${peutSeparer ? `<button type="button" class="bj-btn" data-action="separer"${dis}>Séparer</button>` : ''}
      </div>`;
  }

  /** Contenu du panneau selon la phase et mon rôle. */
  function contenuPanneau() {
    if (jeAiSorti()) return '<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">Tu regardes la suite</h2>';
    if (!monId()) return `<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">La partie continue</h2><p class="bj-note">${esc(acteurPseudo())} joue.</p>`;
    if (etat.partie?.statut !== 'en_cours' || phase() === 'fin') return '<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">Partie terminée</h2>';
    if (phase() === 'mise') {
      if (monTour()) return vueMise();
      return `<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">C'est à ${esc(acteurPseudo())} de miser</h2><p class="bj-note">Les mises sont en cours.</p>`;
    }
    if (phase() === 'jeu') {
      if (monTour()) return vueJeu();
      return `<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">C'est à ${esc(acteurPseudo())} de jouer</h2><p class="bj-note">${esc(acteurPseudo())} décide de sa main.</p>`;
    }
    return '<h2 id="bj-action-titre" class="bj-titre" tabindex="-1">La banque joue</h2><p class="bj-note">Les mains se règlent.</p>';
  }

  /** Redessine le panneau si son contenu a changé (pas pendant un envoi, sauf forcé). */
  function rendrePanneau(force = false) {
    if (finie || (occupe && !force)) return;
    const h = maMain();
    const cle = JSON.stringify([phase(), jeu().actif, jeu().main, monId(), monTour(), jeAiSorti(), etat?.partie?.statut,
      jetonsMoi(), (h?.cartes || []).join(','), mesMains().map((m) => `${m.statut}:${m.mise}`).join('|'), !!peutAgir()]);
    if (!force && cles.panneau === cle) return;
    cles.panneau = cle;
    refs.panneau.innerHTML = contenuPanneau();
  }

  /* ---------- Actions ---------- */

  /** Envoie une action de jeu : un seul envoi à la fois, boutons désactivés, puis relecture. */
  function agir(bouton, action, args = {}) {
    if (occupe || finie) return;
    occupe = true;
    envoyer(bouton, async () => {
      try {
        await plat.agir(code, action, args);
      } catch (e) {
        toast(erreurTexte(e), 'error');
      } finally {
        occupe = false;
        cles.panneau = null;
        rendrePanneau(true);
        suivi.rafraichir();
      }
    }, suivi);
  }

  /** Clics du panneau : mises rapides et actions de la main. */
  function surPanneau(ev) {
    const r = ev.target.closest('button[data-rapide]');
    if (r && !r.disabled) {
      miseChoisie = Number(r.dataset.rapide);
      const cur = refs.panneau.querySelector('#bj-mise-curseur');
      if (cur) cur.value = String(miseChoisie);
      majMise();
      return;
    }
    const b = ev.target.closest('button[data-action]');
    if (!b || b.disabled || occupe) return;
    agir(b, b.dataset.action, {});
  }

  /** Met à jour le montant affiché (curseur, bouton « Miser »). */
  function majMise() {
    const sortie = refs.panneau.querySelector('#bj-mise-val');
    const texte = refs.panneau.querySelector('[data-mise-texte]');
    if (sortie) sortie.textContent = String(miseChoisie);
    if (texte) texte.textContent = String(miseChoisie);
  }

  /** Curseur : garde le montant choisi. */
  function surSaisie(ev) {
    if (ev.target.id !== 'bj-mise-curseur') return;
    miseChoisie = Number(ev.target.value) || MISE_MIN;
    majMise();
  }

  /** Envoi de la mise. */
  function surSubmit(ev) {
    ev.preventDefault();
    if (!ev.target.hasAttribute('data-form-mise') || occupe) return;
    agir(ev.submitter || ev.target.querySelector('[data-miser]'), 'miser', { montant: miseChoisie });
  }

  function surQuitter(ev) {
    if (occupe || finie) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  }

  /* ---------- Écouteurs ---------- */

  refs.panneau.addEventListener('click', surPanneau);
  refs.panneau.addEventListener('input', surSaisie);
  refs.panneau.addEventListener('submit', surSubmit);
  refs.quitter.addEventListener('click', surQuitter);

  /* ---------- Contrat de la vue ---------- */

  const signal = creerSignalTour();
  const effets = creerEffets(refs.tapis, refs.panneau);

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      etat = e;
      rendreBandeau();
      rendreAlerte();
      rendreTapis();
      rendrePanneau();
      rendreDerniere();
      rendreClassement();
      rendreJournal();
      const tour = jeu().actif ?? null;
      if (tour !== dernierTour) {
        if (monTour()) refs.annonce.textContent = 'À toi de jouer.';
        dernierTour = tour;
      }
      chat.maj(e);
      signal.maj(monTour());
      try { effets.maj(e, monId()); } catch (err) { console.warn('[blackjack] effets visuels', err); }
    },
    /** BJ1 : la partie est finie, les jetons volent sur le tapis, puis l'écran de fin. Sans animation ou onglet masqué : rien à attendre. */
    avantFin(e) {
      finie = true;
      refs.quitter.disabled = true;
      if (document.hidden) return null;
      const joue = effetsFinPlateau(e, { ...finFx,
        apres: (issue) => {
          const banque = q('.bj-banque');
          const siege = q('.bj-siege.is-moi');
          if (issue === 'gagnant') fxFin.jetons('bj-anim-jeton', 6, banque, siege);
          else if (issue === 'perdant') fxFin.jetons('bj-anim-jeton', 5, siege, banque);
        } });
      const issue = issuePlateau(e, finFx);
      if (!joue || !anime() || (issue !== 'gagnant' && issue !== 'perdant')) return null;
      return new Promise((ok) => { fxFin.plus(ok, GARDE_FIN); });
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
