// ===== Humane Gang — Cluedo : la table de jeu (plateaux/jeux/cluedo/table.js) =====
/*
 * Rôle : affiche une partie de Cluedo en cours (règles officielles, sans dés).
 *   Bandeau (joueurs, chrono, quitter), plan du manoir, panneau « Ton tour » selon la phase,
 *   montrer une carte (quand c'est à moi), mes cartes, carnet du détective (cases à cocher locales),
 *   historique des hypothèses, journal, chat (à droite sur ordinateur, en tiroir sur téléphone).
 *   La mise en page est dans assets/espaces/plateaux/cluedo.css ; ici, le contenu et les actions.
 *   Les zones sont reconstruites seulement quand leur contenu change (le focus et les listes restent en place).
 *   Effets visuels (« à toi », pion qui glisse, carte montrée, accusation fausse) : ./effets.js, appelé après chaque rendu.
 * Dépendances : commun/tour-signal.js (creerSignalTour), core.js (esc, initials, toast), ../../api.js (plat, erreurTexte, nomDe, imageExiste),
 *   ../../vues/commun.js (bandeauHtml, brancherChrono, journalHtml, imagePlateau, envoyer, moiJoueur, joueurDe, avatarHtml),
 *   ../../vues/chat.js (creerChat, tiroirChat), ./plateau.js (plateauHtml), ./effets.js (creerEffets).
 * Exporte : creer(root, ctx) -> { maj(etat), message(msg), detruire() }.
 *   ctx = { code, naviguer, moi, suivi, contenus } ; suivi = retour de suivrePartie.
 */
import { esc, initials, toast, lireLocal, ecrireLocal } from '../../../../commun/core.js';
import { plat, erreurTexte, nomDe, imageExiste } from '../../api.js';
import { bandeauHtml, brancherChrono, journalHtml, imagePlateau, envoyer, moiJoueur, joueurDe, quitterPartie } from '../../vues/commun.js';
import { boutonQuitter } from '../../../../commun/quitter.js';
import { creerChat, tiroirChat } from '../../vues/chat.js';
import { creerSignalTour } from '../../../../commun/tour-signal.js';
import { plateauHtml } from './plateau.js';
import { creerEffets } from './effets.js';
import { voisinSpatial } from '../../../../commun/grille-clavier.js';

const ECRAN_GRAND = '(min-width: 761px)';
const CARNET_CLE = (code) => `hg_cluedo_carnet:${String(code || '').toUpperCase()}`;
/** Couleur de fond et de texte des cartes en main, par type. */
const STYLE_CARTE = {
  s: { fond: '#ECE8E0', texte: '#121212', type: 'Suspect' },
  a: { fond: '#4A3F37', texte: '#F2EFEA', type: 'Arme' },
  p: { fond: '#2F7A66', texte: '#F2EFEA', type: 'Pièce' },
};
const LISTE_DE = { s: 'suspects', a: 'armes', p: 'pieces' };
/** Marques du carnet dans l'ordre du cycle (vide, ✗, ?, ✓). */
const CYCLE = ['', 'x', 'q', 'v'];
const SYMBOLE = { '': '?', x: '✗', q: '?', v: '✓' };
const CLASSE = { '': 'ch-q', x: 'ch-x', q: 'ch-q', v: 'ch-v' };
const LIBELLE_MARQUE = { '': 'inconnu', x: 'écarté', q: 'inconnu', v: 'coché' };

/** Lettre du pion : initiale du nom de famille (Colonel Moutarde → M). */
const initialePion = (nom) => {
  const mots = String(nom || '?').trim().split(/\s+/);
  return [...(mots[mots.length - 1] || '?')][0]?.toUpperCase() || '?';
};
/** Clé stable d'une carte (« s:…, a:…, p:… ») et son type. */
const typeDe = (carte) => String(carte).split(':')[0];
const idDe = (carte) => String(carte).slice(2);

/** Gabarit statique : les zones variables sont remplies à chaque mise à jour. */
function squelette() {
  return `
  <header class="ch-bandeau" data-bandeau></header>
  <div class="ch-barre" role="toolbar" aria-label="Actions de la partie">
    <div class="ch-onglets" role="group" aria-label="Affichage">
      <button type="button" class="ch-onglet" data-onglet-jeu aria-pressed="true">Plateau</button>
      <button type="button" class="ch-onglet" data-onglet-carnet aria-pressed="false">Carnet et journal</button>
    </div>
    ${boutonQuitter('Quitter la partie', { attrs: 'data-quitter' })}
  </div>
  <p class="ch-elimine" data-elimine hidden></p>

  <div class="ch-corps">
    <div class="ch-colonne-jeu">
      <section class="ch-plateau-zone" aria-label="Plan du jeu" data-plateau></section>
      <section class="ch-panneau" aria-labelledby="ch-tour-titre" aria-live="polite" data-panneau></section>
      <section class="ch-mes-cartes" aria-labelledby="ch-mes-titre" data-mes-cartes></section>
    </div>
    <aside class="ch-colonne-cote" aria-label="Carnet, historique et journal">
      <section class="ch-bloc ch-carnet-zone" aria-labelledby="ch-carnet-titre">
        <h2 id="ch-carnet-titre" class="ch-bloc-titre">Carnet du détective</h2>
        <div class="ch-carnet-scroll" data-carnet></div>
        <p class="ch-legende">✓ coché · ✗ écarté · ? inconnu · « à moi » : ta carte. Clique une case pour la marquer.</p>
      </section>
      <section class="ch-bloc" aria-labelledby="ch-histo-titre">
        <h2 id="ch-histo-titre" class="ch-bloc-titre">Historique des hypothèses</h2>
        <ul class="ch-histo" data-histo></ul>
      </section>
      <section class="ch-bloc" aria-labelledby="ch-journal-titre">
        <h2 id="ch-journal-titre" class="ch-bloc-titre">Journal</h2>
        <div data-journal></div>
      </section>
      <div class="ch-chat-zone" data-chat></div>
    </aside>
  </div>
  <div class="ch-tiroir-chat" data-tiroir-chat></div>
  <p class="visually-hidden" aria-live="polite" data-annonce></p>`;
}

/**
 * Monte la table de Cluedo dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object, contenus: object}} ctx
 * @returns {{ maj: (etat: object) => void, message: (msg: object) => void, detruire: () => void }}
 */
export function creer(root, ctx) {
  const { code, suivi } = ctx;
  const contenus = ctx.contenus || {};
  const grand = window.matchMedia(ECRAN_GRAND);

  const el = document.createElement('section');
  el.className = 'ch-table';
  el.dataset.onglet = 'jeu';
  el.innerHTML = squelette();
  root.append(el);

  const q = (s) => el.querySelector(s);
  const refs = {
    bandeau: q('[data-bandeau]'), elimine: q('[data-elimine]'), plateau: q('[data-plateau]'), panneau: q('[data-panneau]'),
    mesCartes: q('[data-mes-cartes]'), carnet: q('[data-carnet]'), histo: q('[data-histo]'), journal: q('[data-journal]'),
    chatZone: q('[data-chat]'), tiroirChatZone: q('[data-tiroir-chat]'), annonce: q('[data-annonce]'),
    ongletJeu: q('[data-onglet-jeu]'), ongletCarnet: q('[data-onglet-carnet]'), quitter: q('[data-quitter]'),
  };

  let etat = null;
  let occupe = false;
  let arretChrono = null;
  let imageFond = null;                    // URL de l'image du plateau, si elle existe
  const cles = {};                         // clé du dernier rendu de chaque zone (évite les reconstructions inutiles)
  const saisie = { suspect: null, arme: null, piece: null };   // choix des listes (gardés entre deux rendus)
  let choixMontre = null;                  // carte sélectionnée pour montrer
  let accusation = false;                  // formulaire d'accusation ouvert
  const messagesVus = [];                  // pour recréer le chat si l'écran change de taille
  let dernierCote = null;

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
  const nom = (liste, id) => nomDe(contenus, liste, id);
  const nomCarte = (carte) => nom(LISTE_DE[typeDe(carte)], idDe(carte));
  const jeu = () => etat?.jeu || {};
  const phase = () => jeu().phase;
  const monTour = () => !!monId() && jeu().actif === monId();
  const jeAiSorti = () => !!moiJoueur(etat)?.elimine;
  const peutAgir = () => !moiJoueur(etat)?.parti && !occupe && !jeAiSorti() && etat?.partie?.statut === 'en_cours';
  /** Vrai quand je dois montrer une carte. */
  const jeMontre = () => phase() === 'montrer' && !!monId() && etat?.partie?.tour === monId() && !!jeu().hypothese?.a_montrer;
  /** Nom de la personne qui doit agir (pour les textes « C'est à X de jouer »). */
  const acteurPseudo = () => pseudoDe(etat?.partie?.tour || jeu().actif);

  /* ---------- Rendu : bandeau et chrono ---------- */

  function rendreBandeau() {
    const titre = esc(contenus.nom || 'Cluedo');
    const sous = `Code ${esc(code)}`;
    const html = bandeauHtml(etat, { titre, sousTitre: sous });
    const cle = `${html}`;
    if (cles.bandeau === cle) return;
    cles.bandeau = cle;
    arretChrono?.();
    refs.bandeau.innerHTML = html;
    arretChrono = brancherChrono(refs.bandeau, suivi);
  }

  /* ---------- Rendu : joueurs éliminés ---------- */

  function rendreElimine() {
    const on = jeAiSorti();
    refs.elimine.hidden = !on;
    refs.elimine.textContent = on ? 'Tu as été éliminé : tu montres encore tes cartes.' : '';
    refs.quitter.disabled = !moiJoueur(etat) || moiJoueur(etat)?.parti === true;
  }

  /* ---------- Rendu : plan du manoir ---------- */

  function rendrePlateau() {
    const j = jeu();
    const pions = [];
    for (const s of contenus.suspects || []) {
      const piece = j.pions?.[s.id];
      if (!piece) continue;
      const incarne = (etat.joueurs || []).find((x) => x.etat?.suspect === s.id);
      pions.push({ suspect: s.id, nom: s.nom, couleur: s.couleur || '#ECE8E0', initiale: initialePion(s.nom), piece, pseudo: incarne?.pseudo || '' });
    }
    const armes = [];
    for (const a of contenus.armes || []) {
      const piece = j.armes?.[a.id];
      if (piece) armes.push({ arme: a.id, nom: a.nom, piece });
    }
    const cliquable = phase() === 'deplacer' && monTour() && peutAgir();
    const opts = {
      image: imageFond,
      noms: Object.fromEntries((contenus.pieces || []).map((p) => [p.id, p.nom])),
      pions, armes,
      voisines: phase() === 'deplacer' && monTour() ? (j.voisines || []) : [],
      maPiece: j.ma_piece || null,
      cliquable,
    };
    const cle = JSON.stringify(opts);
    if (cles.plateau === cle) return;
    cles.plateau = cle;
    refs.plateau.innerHTML = plateauHtml(opts);
  }

  /* ---------- Rendu : mes cartes ---------- */

  function rendreMesCartes() {
    const cartes = jeu().mes_cartes || [];
    const cle = JSON.stringify(cartes);
    if (cles.mesCartes === cle) return;
    cles.mesCartes = cle;
    const vignettes = cartes.map((c) => {
      const st = STYLE_CARTE[typeDe(c)] || STYLE_CARTE.s;
      return `<li class="ch-carte" style="background:${st.fond};color:${st.texte}"><small>${esc(st.type)}</small><span>${esc(nomCarte(c))}</span></li>`;
    }).join('');
    refs.mesCartes.innerHTML = `<h2 id="ch-mes-titre" class="ch-bloc-titre">Tes cartes</h2>
      <ul class="ch-liste-cartes">${vignettes || '<li class="ch-vide">Aucune carte.</li>'}</ul>`;
  }

  /* ---------- Rendu : historique et journal ---------- */

  function rendreHisto() {
    const liste = jeu().historique || [];
    const cle = JSON.stringify(liste);
    if (cles.histo === cle) return;
    cles.histo = cle;
    refs.histo.innerHTML = liste.map((h) => {
      const par = pseudoDe(h.par);
      const montre = h.montre_par == null ? 'personne n\'a pu répondre' : `${pseudoDe(h.montre_par)} a montré une carte`;
      return `<li><strong>${esc(par)}</strong> : ${esc(nom('suspects', h.suspect))}, ${esc(nom('pieces', h.piece))}, ${esc(nom('armes', h.arme))}. <span class="ch-histo-issue">${esc(montre)}</span></li>`;
    }).reverse().join('') || '<li class="ch-vide">Aucune hypothèse pour l\'instant.</li>';
  }

  function rendreJournal() {
    const html = journalHtml(etat.journal || [], etat);
    if (cles.journal === html) return;
    cles.journal = html;
    refs.journal.innerHTML = html;
  }

  /* ---------- Rendu : carnet du détective ---------- */

  /** Marques posées à la main (localStorage, en try/catch). */
  function lireMarques() {
    try { return JSON.parse(lireLocal(CARNET_CLE(code)) || '{}') || {}; } catch { return {}; } // rangé par compte (comptes-etat.js)
  }
  function ecrireMarques(m) {
    ecrireLocal(CARNET_CLE(code), JSON.stringify(m)); // navigation privée stricte : sans effet
  }

  /**
   * Contenu d'une case du carnet : { valeur, texte, classe, fixe }.
   * « à moi » pour mes cartes, le nom du joueur pour les cartes qu'on m'a montrées, sinon la marque posée à la main.
   */
  function caseCarnet(carte, uid, marques) {
    if (moiEst(uid) && (jeu().mes_cartes || []).includes(carte)) return { texte: 'à moi', classe: 'ch-me', fixe: true };
    const vu = (jeu().vu || []).find((v) => v.carte === carte);
    if (vu && vu.par === uid) return { texte: pseudoDe(uid), classe: 'ch-vu', fixe: true, titre: `${pseudoDe(uid)} t'a montré cette carte` };
    const v = marques[`${carte}|${uid}`] || '';
    return { valeur: v, texte: SYMBOLE[v], classe: CLASSE[v], libelle: LIBELLE_MARQUE[v], fixe: false };
  }

  function lignesCarnet(joueurs, marques) {
    const groupes = [
      ['Suspects', 's', contenus.suspects || []],
      ['Armes', 'a', contenus.armes || []],
      ['Pièces', 'p', contenus.pieces || []],
    ];
    return groupes.map(([titre, type, items]) => {
      const lignes = items.map((it) => {
        const carte = `${type}:${it.id}`;
        const cases = joueurs.map((j) => {
          const c = caseCarnet(carte, j.user_id, marques);
          const label = `${it.nom}, ${j.pseudo || '?'} : ${c.fixe ? c.texte : c.libelle}`;
          if (c.fixe) return `<td class="ch-c ${c.classe}" title="${esc(c.titre || '')}" aria-label="${esc(label)}">${esc(c.texte)}</td>`;
          return `<td class="ch-c"><button type="button" class="ch-marque ${c.classe}" data-carte="${esc(carte)}" data-uid="${esc(j.user_id)}" aria-label="${esc(label)}. Cliquer pour changer">${esc(c.texte)}</button></td>`;
        }).join('');
        return `<tr><th scope="row" class="ch-row">${esc(it.nom)}</th>${cases}</tr>`;
      }).join('');
      return `<tr><th scope="row" class="ch-sec" colspan="${joueurs.length + 1}">${esc(titre)}</th></tr>${lignes}`;
    }).join('');
  }

  function rendreCarnet() {
    const joueurs = etat.joueurs || [];
    const marques = lireMarques();
    const cle = JSON.stringify([joueurs.map((j) => j.user_id), marques, jeu().mes_cartes, jeu().vu, monId()]);
    if (cles.carnet === cle) return;
    cles.carnet = cle;
    const entetes = joueurs.map((j) => {
      const moi = moiEst(j.user_id);
      return `<th scope="col" class="ch-entete${moi ? ' is-moi' : ''}" title="${esc(j.pseudo || '?')}">${esc(initials(j.pseudo))}${moi ? '<span class="visually-hidden"> (toi)</span>' : ''}</th>`;
    }).join('');
    refs.carnet.innerHTML = `<table class="ch-carnet">
      <caption class="visually-hidden">Carnet du détective : cartes et joueurs</caption>
      <thead><tr><th scope="col" class="ch-carte-titre">Carte</th>${entetes}</tr></thead>
      <tbody>${lignesCarnet(joueurs, marques)}</tbody>
    </table>`;
  }

  /** Clic sur une case du carnet : cycle vide → ✗ → ? → ✓ → vide. Pas de rendu complet : seule la case change. */
  function surCarnet(ev) {
    const b = ev.target.closest('button.ch-marque');
    if (!b) return;
    const carte = b.dataset.carte;
    const uid = b.dataset.uid;
    const marques = lireMarques();
    const cle = `${carte}|${uid}`;
    const suivant = CYCLE[(CYCLE.indexOf(marques[cle] || '') + 1) % CYCLE.length];
    if (suivant) marques[cle] = suivant; else delete marques[cle];
    ecrireMarques(marques);
    cles.carnet = null;
    rendreCarnet();
    const i = Array.from(refs.carnet.querySelectorAll('button.ch-marque')).find((x) => x.dataset.carte === carte && x.dataset.uid === uid);
    i?.focus();
  }

  /* ---------- Rendu : panneau « Ton tour » ---------- */

  /** Phrase sur l'hypothèse : suspect, pièce, arme. */
  const hypoTexte = (h) => `${nom('suspects', h.suspect)}, ${nom('pieces', h.piece)}, ${nom('armes', h.arme)}`;

  /** Résultat de la dernière hypothèse, vu de moi. */
  function resultatTexte() {
    const h = jeu().hypothese;
    if (!h || h.attente) return '';
    if (h.montre_par == null) return `Personne n'a pu répondre à l'hypothèse de ${pseudoDe(h.par)} : ${hypoTexte(h)}.`;
    if (moiEst(h.par)) {
      return h.carte_montree
        ? `${pseudoDe(h.montre_par)} t'a montré : ${nomCarte(h.carte_montree)}.`
        : `${pseudoDe(h.montre_par)} t'a montré une carte.`;
    }
    return `${pseudoDe(h.montre_par)} a montré une carte à ${pseudoDe(h.par)}.`;
  }

  /** Listes de choix (suspect, arme, pièce), avec la valeur gardée en mémoire. */
  function options(liste, valeur) {
    return (contenus[liste] || []).map((x) => {
      const v = valeur ?? (contenus[liste]?.[0]?.id);
      return `<option value="${esc(x.id)}"${x.id === v ? ' selected' : ''}>${esc(x.nom)}</option>`;
    }).join('');
  }
  const champ = (id, libelle, nomCh, liste, valeur) => `
    <div class="ch-champ"><label for="${id}-${code}">${esc(libelle)}</label>
      <select id="${id}-${code}" name="${nomCh}" class="ch-select">${options(liste, valeur)}</select></div>`;
  const piecesOptions = (valeur) => (contenus.pieces || []).map((x) => `<option value="${esc(x.id)}"${x.id === valeur ? ' selected' : ''}>${esc(x.nom)}</option>`).join('');

  const peutAccuser = () => monTour() && ['deplacer', 'hypothese', 'apres'].includes(phase());

  function piedActions() {
    const acc = peutAccuser() ? `<button type="button" class="ch-btn ch-btn-ghost" data-accuser>Accuser</button>` : '';
    const fin = ['hypothese', 'apres'].includes(phase()) ? `<button type="button" class="ch-btn ch-btn-ghost" data-finir>Finir mon tour</button>` : '';
    return acc || fin ? `<div class="ch-pied">${acc}${fin}</div>` : '';
  }

  function vueAccusation() {
    return `<form class="ch-form-acc" data-form-acc>
      <h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">Accuser</h2>
      <p class="ch-alerte">Une seule accusation : si tu te trompes, tu es éliminé.</p>
      ${champ('ch-acc-sus', 'Suspect', 'suspect', 'suspects', saisie.suspect)}
      ${champ('ch-acc-arme', 'Arme', 'arme', 'armes', saisie.arme)}
      <div class="ch-champ"><label for="ch-acc-piece-${code}">Pièce</label>
        <select id="ch-acc-piece-${code}" name="piece" class="ch-select">${piecesOptions(saisie.piece || jeu().ma_piece)}</select></div>
      <div class="ch-pied">
        <button type="button" class="ch-btn ch-btn-ghost" data-annuler-acc>Annuler</button>
        <button type="submit" class="ch-btn ch-btn-danger">Confirmer l'accusation</button>
      </div>
    </form>`;
  }

  function vueMontrer() {
    const h = jeu().hypothese;
    const choix = (h.a_montrer || []).map((c) => {
      const st = STYLE_CARTE[typeDe(c)] || STYLE_CARTE.s;
      const on = choixMontre === c;
      return `<button type="button" class="ch-carte-choix" aria-pressed="${on}" data-montre="${esc(c)}" style="background:${st.fond};color:${st.texte}">
        <small>${esc(st.type)}</small><span>${esc(nomCarte(c))}</span></button>`;
    }).join('');
    return `<h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">Montre une carte à ${esc(pseudoDe(h.par))}</h2>
      <p>${esc(pseudoDe(h.par))} soupçonne ${esc(hypoTexte(h))}. Tu as ${(h.a_montrer || []).length} de ces cartes : choisis celle que tu montres. Les autres joueurs ne verront pas laquelle.</p>
      <div class="ch-choix" role="group" aria-label="Tes cartes possibles">${choix}</div>
      <div class="ch-pied"><button type="button" class="ch-btn" data-montrer${choixMontre ? '' : ' disabled'}>${choixMontre ? `Montrer ${esc(nomCarte(choixMontre))} à ${esc(pseudoDe(h.par))}` : 'Choisis une carte'}</button></div>`;
  }

  function vueAttente(texte) {
    return `<h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">C'est à ${esc(acteurPseudo())} de jouer</h2>
      <p>${esc(texte)}</p>`;
  }

  /** Contenu du panneau selon la phase et mon rôle. */
  function contenuPanneau() {
    const j = jeu();
    if (jeAiSorti()) return `<h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">Tu regardes la suite</h2><p>${esc(resultatTexte())}</p>`;
    if (!monId()) return vueAttente(`${acteurPseudo()} joue.`);
    if (accusation && monTour() && peutAccuser()) return vueAccusation();
    if (phase() === 'montrer') {
      if (jeMontre()) return vueMontrer();
      const h = j.hypothese || {};
      return vueAttente(`${acteurPseudo()} doit montrer une carte à ${pseudoDe(h.par)}.`) + (h.par ? `<p class="ch-note">${esc(resultatTexte())}</p>` : '');
    }
    if (!monTour()) return vueAttente(`${acteurPseudo()} joue.`) + `<p class="ch-note">${esc(resultatTexte())}</p>`;

    const warn = `<p class="ch-note">Une seule accusation : si tu te trompes, tu es éliminé.</p>`;
    if (phase() === 'deplacer') {
      const voisines = (j.voisines || []).map((p) => `<button type="button" class="ch-btn ch-btn-piece" data-deplacer="${esc(p)}">${esc(nom('pieces', p))}</button>`).join('');
      const rester = j.peut_rester ? `<button type="button" class="ch-btn ch-btn-ghost" data-rester>Rester ici</button>` : '';
      return `<h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">Ton tour</h2>
        <p>Tu es dans ${esc(nom('pieces', j.ma_piece))}. Choisis une pièce voisine, encadrée d'or.</p>
        <div class="ch-pieces-voisines" role="group" aria-label="Pièces voisines">${voisines}${rester}</div>
        ${warn}${piedActions()}`;
    }
    if (phase() === 'hypothese') {
      return `<h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">Ton tour</h2>
        <form class="ch-form-hyp" data-form-hyp>
          ${champ('ch-hyp-sus', 'Suspect', 'suspect', 'suspects', saisie.suspect)}
          ${champ('ch-hyp-arme', 'Arme', 'arme', 'armes', saisie.arme)}
          <p class="ch-piece-hyp"><span>Pièce</span> <strong>${esc(nom('pieces', j.ma_piece))}</strong></p>
          <button type="submit" class="ch-btn ch-btn-primary">Proposer l'hypothèse</button>
        </form>
        ${piedActions()}`;
    }
    // apres : résultat de l'hypothèse, puis accuser ou finir
    return `<h2 id="ch-tour-titre" class="ch-titre" tabindex="-1">Ton tour</h2>
      <p>${esc(resultatTexte() || 'Tu as fini de chercher ce tour-ci.')}</p>
      ${warn}${piedActions()}`;
  }

  /** Redessine le panneau si son contenu a changé (pas pendant un envoi, sauf forcé). */
  function rendrePanneau(force = false) {
    if (occupe && !force) return;
    const j = jeu();
    const cle = JSON.stringify([phase(), j.actif, etat?.partie?.tour, monId(), monTour(), accusation, jeAiSorti(), jeMontre(),
      j.hypothese?.par, j.hypothese?.montre_par, j.hypothese?.attente, j.hypothese?.a_montrer, j.voisines, j.ma_piece, j.peut_rester,
      (j.accusations || []).length, etat?.partie?.statut, resultatTexte()]);
    if (!force && cles.panneau === cle) return;
    cles.panneau = cle;
    refs.panneau.classList.toggle('is-montrer', jeMontre());
    // Le formulaire d'hypothèse garde les choix faits avant la mise à jour (saisie).
    refs.panneau.innerHTML = contenuPanneau();
  }

  /* ---------- Actions ---------- */

  /** Envoie une action de jeu : un seul envoi à la fois, boutons désactivés, puis relecture. */
  function agir(bouton, action, args = {}) {
    if (occupe) return;
    occupe = true;
    envoyer(bouton, async () => {
      try {
        await plat.agir(code, action, args);
        accusation = false;
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

  function surPanneau(ev) {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-deplacer')) return agir(b, 'deplacer', { piece: b.dataset.deplacer });
    if (b.hasAttribute('data-rester')) return agir(b, 'rester');
    if (b.hasAttribute('data-finir')) return agir(b, 'finir');
    if (b.hasAttribute('data-accuser')) {
      accusation = true;
      cles.panneau = null;
      rendrePanneau(true);
      refs.panneau.querySelector('h2')?.focus();
      return;
    }
    if (b.hasAttribute('data-annuler-acc')) {
      accusation = false;
      cles.panneau = null;
      rendrePanneau(true);
      return;
    }
    if (b.hasAttribute('data-montre')) {
      choixMontre = b.dataset.montre;
      refs.panneau.querySelectorAll('[data-montre]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.montre === choixMontre)));
      const sortie = refs.panneau.querySelector('[data-montrer]');
      if (sortie) {
        sortie.disabled = false;
        sortie.textContent = `Montrer ${nomCarte(choixMontre)} à ${pseudoDe(jeu().hypothese?.par)}`;
      }
      return;
    }
    if (b.hasAttribute('data-montrer') && choixMontre) return agir(b, 'montrer', { carte: choixMontre });
  }

  function surSubmitPanneau(ev) {
    ev.preventDefault();
    const f = ev.target;
    if (f.hasAttribute('data-form-hyp')) {
      if (occupe) return;
      // Valeurs lues dans le formulaire : la première option affichée compte même si l'on n'a rien changé.
      const d = new FormData(f);
      return agir(ev.submitter || f.querySelector('button[type=submit]'), 'hypothese', { suspect: d.get('suspect') || saisie.suspect, arme: d.get('arme') || saisie.arme });
    }
    if (f.hasAttribute('data-form-acc')) {
      if (occupe) return;
      const d = new FormData(f);
      return agir(ev.submitter || f.querySelector('button[type=submit]'), 'accuser',
        { suspect: d.get('suspect') || saisie.suspect, arme: d.get('arme') || saisie.arme, piece: d.get('piece') || saisie.piece });
    }
  }

  /** Listes : garde la valeur choisie (sans relancer le rendu). */
  function surChoix(ev) {
    const s = ev.target;
    if (s.name in saisie) saisie[s.name] = s.value;
  }

  function surQuitter(ev) {
    if (occupe) return;
    quitterPartie(ev.currentTarget, () => plat.quitter(code), suivi);
  }

  /* ---------- Écouteurs ---------- */

  refs.panneau.addEventListener('click', surPanneau);
  refs.panneau.addEventListener('submit', surSubmitPanneau);
  refs.panneau.addEventListener('change', surChoix);
  refs.panneau.addEventListener('input', surChoix);
  refs.carnet.addEventListener('click', surCarnet);
  refs.quitter.addEventListener('click', surQuitter);
  refs.ongletJeu.addEventListener('click', () => ongletPour('jeu'));
  refs.ongletCarnet.addEventListener('click', () => ongletPour('carnet'));

  function ongletPour(nomOnglet) {
    el.dataset.onglet = nomOnglet;
    refs.ongletJeu.setAttribute('aria-pressed', String(nomOnglet === 'jeu'));
    refs.ongletCarnet.setAttribute('aria-pressed', String(nomOnglet === 'carnet'));
  }

  // Plan du manoir : clic sur une pièce voisine.
  refs.plateau.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-piece]');
    if (!b || !peutAgir() || !(phase() === 'deplacer' && monTour())) return;
    agir(b, 'deplacer', { piece: b.dataset.piece });
  });
  // Clavier : flèches entre les pièces voisines où l'on peut aller (boutons natifs : Entrée ou Espace pour y aller).
  refs.plateau.addEventListener('keydown', (ev) => {
    const b = ev.target.closest?.('button[data-piece]');
    if (!b || !ev.key.startsWith('Arrow')) return;
    const voisin = voisinSpatial(ev.key, b, [...refs.plateau.querySelectorAll('button[data-piece]')]);
    if (voisin) { ev.preventDefault(); voisin.focus({ preventScroll: true }); }
  });

  // Image du plateau si elle existe (sinon, le dessin de repli).
  const urlImage = imagePlateau('cluedo', 'plateau');
  imageExiste(urlImage).then((ok) => {
    if (!ok) return;
    imageFond = urlImage;
    cles.plateau = null;
    if (etat) rendrePlateau();
  });

  /* ---------- Contrat de la vue ---------- */

  const signal = creerSignalTour();
  const effets = creerEffets(el, code);

  return {
    /** Nouvel état de la partie (appelé à chaque changement de version). */
    maj(e) {
      if (!e?.partie) return;
      const avant = etat?.jeu?.actif;
      etat = e;
      rendreBandeau();
      rendreElimine();
      rendrePlateau();
      rendrePanneau();
      rendreMesCartes();
      rendreCarnet();
      rendreHisto();
      rendreJournal();
      if (avant !== undefined && e.jeu?.actif !== avant && monTour()) refs.annonce.textContent = 'À toi de jouer.';
      chat.maj(e);
      signal.maj(monTour() || jeMontre());
      try { effets.maj(e, monId()); } catch (err) { console.warn('[cluedo] effets visuels', err); }
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
