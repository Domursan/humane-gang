// ===== Humane Gang — Poker : la table de jeu (plateaux/jeux/poker/table.js) =====
/*
 * Rôle : affiche une partie de Texas Hold'em en cours (2 à 8 joueurs).
 *   Bandeau (joueurs, chrono, main n°), barre (code, quitter), table ovale (plateau.js : cartes communes, pot, sièges),
 *   « Tes cartes » en grand avec la force de ta main, dernier abattage (cartes montrées et nom de chaque main), panneau
 *   d'action : quand c'est ton tour, Se coucher, Suivre ou Parole, Relancer (curseur de relance minimale à ton tapis,
 *   boutons ½ pot et pot) et Tapis. Classement aux jetons, journal, chat (à droite sur ordinateur, en tiroir sur téléphone).
 *   Mise en page : assets/espaces/plateaux/poker.css. Les zones sont reconstruites seulement quand leur contenu change.
 *   Effets de la maquette (à toi de parler, cartes qui se retournent, mises vers le pot, pot au gagnant) : effets.js,
 *   appelé à chaque nouvel état avec l'état précédent, pour ne jouer que les vrais changements.
 *   Fin de partie (PK1) : avantFin garde la table le temps que le pot rejoigne le dernier joueur à table. La table reste sur la dernière
 *   mise : le serveur enchaîne l'abattage et la fin dans la même opération.
 * Dépendances : commun/tour-signal.js (creerSignalTour), core.js (esc, initials, toast), ../../api.js (plat, erreurTexte), ../../vues/commun.js (bandeauHtml,
 *   brancherChrono, journalHtml, envoyer, moiJoueur, joueurDe), ../../vues/chat.js (creerChat, tiroirChat),
 *   commun/effets-duels.js (anime), ../../vues/fin-fx.js (effetsFinPlateau, fxFin, gagnantsDe, issuePlateau), ./fin.js (finFx),
 *   ../cartes.js (carteHtml), ./plateau.js (tableHtml, PHASES), ./effets.js (creerEffets).
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire(), avantFin(etat) }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 */
import { esc, initials, toast } from '../../../../commun/core.js';
import { plat, erreurTexte } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, envoyer, moiJoueur, joueurDe, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter, DEPART } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { carteHtml } from '../cartes.js';
import { tableHtml, PHASES } from './plateau.js';
import { creerEffets } from './effets.js';
import { anime } from '../../../../commun/effets-duels.js';
import { effetsFinPlateau, fxFin, gagnantsDe, issuePlateau } from '../../vues/fin-fx.js';
import { finFx } from './fin.js';

const ECRAN_GRAND = '(min-width: 761px)';
const GARDE_FIN = 1900;      // ms : la table reste à l'écran après la fin, le temps du vol du pot

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="pk-bandeau" data-bandeau></header>
  <div class="pk-barre" role="toolbar" aria-label="Actions de la partie">
    <span class="pk-code small muted" data-code></span>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <p class="pk-alerte" data-alerte hidden></p>
  <div class="pk-corps">
    <div class="pk-colonne-jeu">
      <div data-tapis></div>
      <section class="pk-bloc pk-abattage" aria-labelledby="pk-abattage-titre" data-abattage hidden></section>
      <section class="pk-bloc pk-panneau" aria-label="Ton action" aria-live="polite" data-panneau></section>
    </div>
    <aside class="pk-colonne-cote" aria-label="Classement, journal et chat">
      <section class="pk-bloc" aria-labelledby="pk-classement-titre" data-classement></section>
      <section class="pk-bloc" aria-labelledby="pk-journal-titre">
        <h2 id="pk-journal-titre" class="pk-bloc-titre">Journal</h2>
        <div data-journal></div>
      </section>
      <div class="pk-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="pk-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/** Montant en jetons, format suisse. */
const jetons = (n) => Math.round(Number(n) || 0).toLocaleString('fr-CH');

/**
 * Monte la table de poker dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const grand = window.matchMedia(ECRAN_GRAND);

  const el = document.createElement('section');
  el.className = 'pk-table';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), code: q('[data-code]'), quitter: q('[data-quitter]'), alerte: q('[data-alerte]'),
    tapis: q('[data-tapis]'), abattage: q('[data-abattage]'), panneau: q('[data-panneau]'),
    classement: q('[data-classement]'), journal: q('[data-journal]'), chatZone: q('[data-chat]'),
    tiroirChatZone: q('[data-tiroir-chat]'), annonce: q('[data-annonce]'),
  };
  refs.code.textContent = `Code ${code}`;

  let etat = null;
  let occupe = false;
  let finie = false;               // état final reçu : la table reste un instant à l'écran, plus aucune action (jamais remis à faux)
  let arretChrono = null;
  const cles = {};                 // clé du dernier rendu de chaque zone
  let relanceChoisie = 0;          // curseur de relance, gardé entre deux rendus
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
  const moiE = () => moiJoueur(etat)?.etat || {};
  const jeu = () => etat?.jeu || {};
  const monTour = () => !!monId() && jeu().actif === monId() && etat?.partie?.tour === monId();
  const jeAiSorti = () => !!moiJoueur(etat)?.elimine;
  const jeSuisCouche = () => !!moiE().couche;
  const peutAgir = () => !moiJoueur(etat)?.parti && !finie && !occupe && !jeAiSorti() && etat?.partie?.statut === 'en_cours';
  const pseudoDe = (uid) => (uid == null ? '' : (joueurDe(etat, uid)?.pseudo || '?'));
  const acteurPseudo = () => pseudoDe(jeu().actif);
  const jetonsMoi = () => Number(moiE().jetons) || 0;
  const maMise = () => Number(moiE().mise) || 0;
  const miseMax = () => Number(jeu().mise_max) || 0;
  const relanceMin = () => Number(jeu().relance_min) || Number(jeu().blinde) || 10;
  const pot = () => Number(jeu().pot) || 0;

  /** Sièges dans l'ordre de la table, moi en premier (en bas de l'ovale). */
  function sieges() {
    const J = jeu();
    const tous = [...(etat.joueurs || [])];
    const i = tous.findIndex((j) => j.user_id === monId());
    const ordre = i > 0 ? [...tous.slice(i), ...tous.slice(0, i)] : tous;
    return ordre.map((j) => {
      const e = j.etat || {};
      return {
        id: j.user_id, pseudo: j.pseudo, couleur: j.couleur, invite: !!j.invite, initiale: initials(j.pseudo || '?'),
        jetons: Number(e.jetons) || 0, mise: Number(e.mise) || 0, action: e.action || null,
        couche: !!e.couche, tapis: !!e.tapis, sorti: !!j.elimine, parti: !!j.parti,
        tour: !!J.actif && J.actif === j.user_id, moi: j.user_id === monId(), donneur: J.donneur === j.user_id,
        carteVisibles: false, cartes: null, nomMain: null,
      };
    });
  }

  /* ---------- Rendu : bandeau et chrono ---------- */

  function rendreBandeau() {
    const J = jeu();
    const sous = PHASES[J.phase] ? `${PHASES[J.phase]} · pot ${jetons(pot())} jetons` : '';
    const html = bandeauHtml(etat, { titre: 'Poker', sousTitre: sous });
    if (cles.bandeau === html) return;
    cles.bandeau = html;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  function rendreAlerte() {
    const sorti = jeAiSorti();
    const couche = !sorti && jeSuisCouche() && etat?.partie?.statut === 'en_cours';
    const texte = sorti ? 'Tu es éliminé : tu regardes la suite.' : couche ? 'Tu es couché pour cette main.' : '';
    refs.alerte.hidden = !texte;
    refs.alerte.textContent = texte;
    refs.quitter.disabled = !moiJoueur(etat) || moiJoueur(etat)?.parti === true;
  }

  /* ---------- Rendu : table ---------- */

  function rendreTapis() {
    const J = jeu();
    const liste = sieges();
    const opts = { board: J.board || [], pot: pot(), phase: J.phase, main: J.main ?? null, blinde: J.blinde ?? null, sieges: liste };
    const cle = JSON.stringify([opts, monId()]);
    if (cles.tapis === cle) return;
    cles.tapis = cle;
    refs.tapis.innerHTML = tableHtml(opts);
  }

  /* ---------- Rendu : dernier abattage (cartes montrées, nom des mains) ---------- */

  function rendreAbattage() {
    const pre = jeu().precedente || {};
    const abat = Array.isArray(pre.abattage) && pre.abattage.length ? pre.abattage : null;
    const cle = JSON.stringify([abat, pre.board || []]);
    if (cles.abattage === cle) return;
    cles.abattage = cle;
    refs.abattage.hidden = !abat;
    if (!abat) { refs.abattage.innerHTML = ''; return; }
    const board = (pre.board || []).map((c) => carteHtml(c, { petite: true })).join('');
    const lignes = abat.map((a) => {
      const j = joueurDe(etat, a.user_id);
      const cartes = (a.cartes || []).map((c) => carteHtml(c, { petite: true })).join('');
      return `<li class="pk-abat-ligne${a.user_id === monId() ? ' is-moi' : ''}">
          <span class="pk-abat-nom"><strong>${esc(j?.pseudo || '?')}</strong>${a.user_id === monId() ? ' <span class="pk-etiquette">toi</span>' : ''}</span>
          <span class="pk-cartes" role="group" aria-label="Cartes de ${esc(j?.pseudo || '?')}">${cartes}</span>
          <span class="pk-abat-main">${esc(a.main || '')}</span>
        </li>`;
    }).join('');
    refs.abattage.innerHTML = `<h2 id="pk-abattage-titre" class="pk-bloc-titre">Dernier abattage</h2>
      <p class="pk-note small">Main n° ${esc(Math.max(0, (jeu().main || 1) - 1))} · cartes communes :</p>
      <div class="pk-cartes pk-cartes-communes" role="group" aria-label="Cartes communes de la main précédente">${board}</div>
      <ul class="pk-abat-liste">${lignes}</ul>`;
  }

  /* ---------- Rendu : classement, journal ---------- */

  function rendreClassement() {
    const lignes = [...(etat.joueurs || [])].filter((j) => !j.parti)
      .sort((a, b) => (a.elimine - b.elimine) || (Number(b.etat?.jetons) || 0) - (Number(a.etat?.jetons) || 0));
    const cle = JSON.stringify([lignes.map((j) => [j.user_id, j.etat?.jetons, j.elimine]), monId()]);
    if (cles.classement === cle) return;
    cles.classement = cle;
    refs.classement.innerHTML = `<h2 id="pk-classement-titre" class="pk-bloc-titre">Jetons de chacun</h2>
      <ol class="pk-classement">${lignes.map((j) => `<li>
        <strong>${esc(j.pseudo || '?')}</strong>
        ${j.invite ? ' <span class="pk-etiquette">invité</span>' : ''}${j.user_id === monId() ? ' <span class="pk-etiquette">toi</span>' : ''}
        ${j.elimine ? ' <span class="pk-etiquette">éliminé</span>' : ''}
        <span class="pk-classement-jetons">${esc(jetons(j.etat?.jetons))}</span></li>`).join('') || '<li class="pk-vide">Pas encore de classement.</li>'}</ol>`;
  }

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  /* ---------- Rendu : panneau d'action ---------- */

  /** « Tes cartes » en grand, force de la main, mise et jetons. */
  function blocMesCartes() {
    const cartes = Array.isArray(jeu().mes_cartes) ? jeu().mes_cartes : [];
    const force = jeu().ma_force;
    const corps = cartes.length === 2
      ? `<div class="pk-mes-cartes" role="group" aria-label="Tes deux cartes">${cartes.map((c) => carteHtml(c)).join('')}</div>`
      : '<p class="pk-note">Tu n\'as pas de cartes dans cette main.</p>';
    const forceTxt = cartes.length === 2
      ? (force ? `Ta main : <strong>${esc(force)}</strong>` : 'Avant le flop : deux cartes cachées')
      : '';
    return `<div class="pk-mes">
      <h2 class="pk-bloc-titre">Tes cartes</h2>
      ${corps}
      <p class="pk-note">${forceTxt}${forceTxt ? ' · ' : ''}Tes jetons : <strong>${esc(jetons(jetonsMoi()))}</strong>${maMise() > 0 ? ` · ta mise : <strong>${esc(jetons(maMise()))}</strong>` : ''}</p>
    </div>`;
  }

  /** Curseur de relance et boutons ½ pot / pot, si je peux relancer. */
  function blocRelance() {
    const c = miseMax() - maMise();
    const min = miseMax() + relanceMin();
    const max = maMise() + jetonsMoi();
    if (max < min) return '';
    relanceChoisie = Math.min(max, Math.max(min, relanceChoisie || min));
    const demi = Math.min(max, Math.max(min, miseMax() + Math.round((pot() + c) / 2)));
    const plein = Math.min(max, Math.max(min, miseMax() + pot() + c));
    return `<form class="pk-relance" data-form-relance>
      <div class="pk-curseur-tete">
        <label for="pk-relance-curseur">Relancer à</label>
        <output id="pk-relance-val" for="pk-relance-curseur" class="pk-curseur-val" aria-live="polite">${esc(jetons(relanceChoisie))}</output>
      </div>
      <input id="pk-relance-curseur" class="pk-curseur" type="range" min="${esc(min)}" max="${esc(max)}" step="1" value="${esc(relanceChoisie)}">
      <div class="pk-rapides" role="group" aria-label="Relances rapides">
        <button type="button" class="pk-btn" data-rapide="${esc(demi)}">½ pot · ${esc(jetons(demi))}</button>
        <button type="button" class="pk-btn" data-rapide="${esc(plein)}">Pot · ${esc(jetons(plein))}</button>
      </div>
      <div class="pk-pied"><button type="submit" class="pk-btn pk-btn-primary" data-relancer${peutAgir() ? '' : ' disabled'}>Relancer à <span data-relance-texte>${esc(jetons(relanceChoisie))}</span></button></div>
    </form>`;
  }

  /** Actions quand c'est mon tour : se coucher, suivre ou parole, relancer, tapis. */
  function vueMonTour() {
    const c = miseMax() - maMise();
    const suivre = Math.min(c, jetonsMoi());
    const dis = peutAgir() ? '' : ' disabled';
    const libelleSuivre = c > 0 ? `Suivre ${jetons(suivre)}` : 'Parole';
    const peutRelancer = jetonsMoi() > c && (maMise() + jetonsMoi()) >= miseMax() + relanceMin();
    return `<h2 class="pk-titre" tabindex="-1">À toi de parler</h2>
      <p class="pk-note">Mise à suivre : <strong>${esc(jetons(Math.max(0, c)))}</strong> · relance minimale : <strong>${esc(jetons(relanceMin()))}</strong></p>
      <div class="pk-actions" role="group" aria-label="Actions de la main">
        <button type="button" class="pk-btn" data-action="se_coucher"${dis}>Se coucher</button>
        <button type="button" class="pk-btn pk-btn-primary" data-action="suivre"${dis}>${esc(libelleSuivre)}</button>
        <button type="button" class="pk-btn pk-btn-tapis" data-action="tapis"${dis}>Tapis · ${esc(jetons(maMise() + jetonsMoi()))}</button>
      </div>
      ${peutRelancer ? blocRelance() : ''}`;
  }

  /** Contenu du panneau selon mon rôle et l'état de la main. */
  function contenuPanneau() {
    const titre = (t) => `<h2 class="pk-titre" tabindex="-1">${esc(t)}</h2>`;
    if (jeAiSorti()) return titre('Tu regardes la suite');
    if (!monId()) return `${titre('La partie continue')}<p class="pk-note">${esc(acteurPseudo())} parle.</p>`;
    if (etat.partie?.statut !== 'en_cours') return titre('Partie terminée');
    if (jeSuisCouche()) return `${blocMesCartes()}${titre('Tu es couché')}<p class="pk-note">La main continue sans toi.</p>`;
    if (monTour()) return `${blocMesCartes()}${vueMonTour()}`;
    return `${blocMesCartes()}${titre(`C'est à ${acteurPseudo()} de parler`)}<p class="pk-note">Attends ton tour.</p>`;
  }

  /** Redessine le panneau si son contenu a changé (pas pendant un envoi, sauf forcé). */
  function rendrePanneau(force = false) {
    if (finie || (occupe && !force)) return;
    const cle = JSON.stringify([jeu().phase, jeu().actif, jeu().main, monId(), monTour(), jeAiSorti(), jeSuisCouche(),
      etat?.partie?.statut, jeu().mes_cartes, jeu().ma_force, miseMax(), relanceMin(), pot(), maMise(), jetonsMoi(), !!peutAgir(),
      jeu().board]);
    if (!force && cles.panneau === cle) return;
    cles.panneau = cle;
    refs.panneau.innerHTML = contenuPanneau();
    majRelance();
  }

  /** Affiche le montant choisi sur le curseur et le bouton (sans relancer le rendu). */
  function majRelance() {
    const sortie = refs.panneau.querySelector('#pk-relance-val');
    const cur = refs.panneau.querySelector('#pk-relance-curseur');
    const texte = refs.panneau.querySelector('[data-relance-texte]');
    if (cur) cur.value = String(relanceChoisie);
    if (sortie) sortie.textContent = jetons(relanceChoisie);
    if (texte) texte.textContent = jetons(relanceChoisie);
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

  /** Clics du panneau : se coucher, suivre, tapis, relances rapides. */
  function surPanneau(ev) {
    const r = ev.target.closest('button[data-rapide]');
    if (r && !r.disabled) {
      relanceChoisie = Number(r.dataset.rapide) || relanceChoisie;
      majRelance();
      return;
    }
    const b = ev.target.closest('button[data-action]');
    if (!b || b.disabled || occupe) return;
    agir(b, b.dataset.action, {});
  }

  /** Curseur de relance : garde le montant. */
  function surSaisie(ev) {
    if (ev.target.id !== 'pk-relance-curseur') return;
    relanceChoisie = Number(ev.target.value) || relanceChoisie;
    majRelance();
  }

  /** Envoi de la relance. */
  function surSubmit(ev) {
    ev.preventDefault();
    if (!ev.target.hasAttribute('data-form-relance') || occupe) return;
    agir(ev.submitter || ev.target.querySelector('[data-relancer]'), 'relancer', { montant: relanceChoisie });
  }

  function surQuitter(ev) {
    if (occupe || finie) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi, DEPART.poker);
  }

  /* ---------- Écouteurs ---------- */

  refs.panneau.addEventListener('click', surPanneau);
  refs.panneau.addEventListener('input', surSaisie);
  refs.panneau.addEventListener('submit', surSubmit);
  refs.quitter.addEventListener('click', surQuitter);

  /* ---------- Contrat de la vue ---------- */

  const signal = creerSignalTour();
  const effets = creerEffets(el, {
    monTour: (x) => {
      const u = moiJoueur(x)?.user_id ?? null;
      return !!u && x.jeu?.actif === u && x.partie?.tour === u;
    },
  });

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      const avant = etat;
      etat = e;
      rendreBandeau();
      rendreAlerte();
      rendreTapis();
      rendreAbattage();
      rendrePanneau();
      rendreClassement();
      rendreJournal();
      const tour = jeu().actif ?? null;
      if (tour !== dernierTour) {
        if (monTour()) refs.annonce.textContent = 'À toi de parler.';
        dernierTour = tour;
      }
      chat.maj(e);
      signal.maj(monTour());
      effets.maj(avant, e);
    },
    /** PK1 : la partie est finie, le pot part vers le gagnant, puis l'écran de fin. Sans animation ou onglet masqué : rien à attendre. */
    avantFin(e) {
      finie = true;
      refs.quitter.disabled = true;
      if (document.hidden) return null;
      const joue = effetsFinPlateau(e, { ...finFx,
        apres: (issue) => {
          if (issue !== 'gagnant' && issue !== 'perdant') return;
          const uid = gagnantsDe(e.joueurs || [])[0]?.user_id;
          fxFin.jetons('pk-jeton-vol', issue === 'gagnant' ? 7 : 5, q('.pk-pot'), q(`.pk-siege[data-uid="${CSS.escape(String(uid))}"]`));
        } });
      const issue = issuePlateau(e);
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
