// ===== Humane Gang — Duels : morceaux d'écran partagés par les tables (Puissance 4, Morpion, Mastermind) =====
/*
 * Rôle : barre du duel (jeu, code, score, joueurs face à face, chrono, chat, abandon), panneau latéral (journal + chat),
 * bandeau de fin de manche, avatars et chrono. Les tables (vues/p4.js, vues/morpion.js, vues/mastermind.js) s'en servent
 * pour avoir le même cadre ; elles ne dessinent que leur plateau.
 * Classes CSS : assets/espaces/duels/table.css (cadre), assets/espaces/duels/duels.css (avatar, chrono, chat).
 * Signal « à toi de jouer » (son + titre d'onglet) : commun/tour-signal.js, branché sur le cadre (maj / detruire).
 * Le cadre signale aussi tout seul : partie vue en cours (fin-fx.js, pour les effets de fin), tic des 5 dernières secondes à mon
 * tour (CH1, S14 et S15, le chrono bat très légèrement), « Le jeu a joué pour toi » quand mon temps est écoulé (TP1, S12, ligne
 * « auto » du journal ; les points de coups manqués demandent joueurs[].manques, migration 185, et s'effacent sans elle).
 * Dépendances : core.js (esc, toast), ../api.js (duel, erreurTexte, estInvite), ./chat.js (creerChat), ../../../commun/tour-signal.js,
 *   ../../../commun/effets-duels.js (son, creerEffets, creerTicChrono), ./fin-fx.js (vuEnCours).
 * Exporte : avatarHtml, couleurJoueur, nomJoueur, deJoueur, deNom, creerCadre, ICONE_DRAPEAU, ICONE_SABLIER.
 */
import { esc, toast } from '../../../commun/core.js';
import { duel, erreurTexte, estInvite } from '../api.js';
import { creerChat } from './chat.js';
import { creerSignalTour } from '../../../commun/tour-signal.js';
import { creerEffets, creerTicChrono, son } from '../../../commun/effets-duels.js';
import { vuEnCours } from './fin-fx.js';

/** Icônes de l'abandon, du forfait et du temps écoulé. */
export const ICONE_DRAPEAU = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V4"/><path d="M6 5c4-2 7 2 12 0v9c-5 2-8-2-12 0" fill="currentColor" fill-opacity=".18"/></svg>';
export const ICONE_SABLIER = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9s8 3 8 9"/></svg>';

/** Couleur d'affichage d'un joueur : couleur de profil, gris pour un invité ou le robot. */
export function couleurJoueur(j) {
  if (!j || j.invite || j.robot) return '#9A9A9F';
  return /^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA';
}
/** Pseudo d'un joueur (échappé) dans sa couleur, avec l'étiquette « invité » au besoin. */
export function nomJoueur(j) {
  if (!j) return '?';
  return `<span style="color:${couleurJoueur(j)}">${esc(j.pseudo || '?')}</span>${j.invite ? ' <span class="duels-invite-tag">invité</span>' : ''}`;
}
/** « de X » avec le nom en couleur, « du robot » pour le robot. */
export function deJoueur(j) {
  return j?.robot ? 'du <span style="color:#9A9A9F">robot</span>' : `de ${nomJoueur(j)}`;
}
/** « de X » pour un pseudo en texte (déjà échappé ou non), « du robot » pour le robot. */
export function deNom(pseudo) {
  return pseudo === 'Le robot' ? 'du robot' : `de ${pseudo}`;
}
/** Avatar rond : photo de profil, sinon initiales sur la couleur du joueur. */
export function avatarHtml(j, { tour = false, taille = 44 } = {}) {
  const ini = esc(String(j?.pseudo || '?').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?');
  const img = j?.avatar_url && /^https:\/\//.test(j.avatar_url) ? `<img src="${esc(j.avatar_url)}" alt="" loading="lazy" decoding="async">` : ini;
  return `<span class="duels-av${tour ? ' is-tour' : ''}" aria-hidden="true" style="--duels-av:${couleurJoueur(j)};width:${taille}px;height:${taille}px">${img}</span>`;
}

const RAYON = 15;
const CIRC = 2 * Math.PI * RAYON;

/**
 * Cadre commun d'une table : barre du haut, zone du plateau, panneau (journal + chat), bandeau de manche.
 * @param {HTMLElement} root conteneur de la vue.
 * @param {{code: string, naviguer: Function, moi: object|null, suivi: object}} ctx contexte de vues/partie.js.
 * @param {{classe?: string}} [o] classe ajoutée au cadre (ex. 'duels-p4').
 * @returns {{plateau: HTMLElement, cote: HTMLElement, maj(etat): void, message(msg): void, detruire(): void,
 *   joueurMoi(etat): object|null, adversaire(etat): object|null, monTour(etat): boolean}}
 *   maj(etat, aAgir?) : aAgir (booléen) dit si j'ai à agir maintenant ; par défaut, c'est mon tour (partie.tour === moi).
 *   plateau : où la vue dessine son jeu ; cote : colonne sous le journal pour des infos propres au jeu.
 */
export function creerCadre(root, ctx, { classe = '' } = {}) {
  root.innerHTML = `<div class="duels-table ${esc(classe)}">
    <header class="duels-barre card">
      <div class="duels-barre-jeu"><strong class="duels-barre-nom" data-nom></strong>
        <span class="duels-barre-sous"><span class="duels-code" data-code></span> · <span data-score></span></span></div>
      <div class="duels-face" data-face></div>
      <div class="duels-barre-outils">
        <span class="duels-chrono" data-chrono hidden><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="fond" cx="18" cy="18" r="${RAYON}"/><circle class="arc" cx="18" cy="18" r="${RAYON}" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg><span data-chrono-txt aria-live="off"></span></span>
        <button type="button" class="btn btn-ghost duels-btn-icone" data-ouvrir-chat aria-label="Chat et journal" aria-expanded="false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
          <span class="duels-badge" data-nonlus hidden></span></button>
        <button type="button" class="btn btn-ghost" data-abandon>Abandonner</button>
      </div>
    </header>
    <p class="duels-statut" data-statut role="status" aria-live="polite"></p>
    <div class="duels-corps">
      <section class="duels-plateau" data-plateau aria-label="Plateau"></section>
      <aside class="duels-cote" data-panneau>
        <div class="card duels-cote-jeu" data-cote></div>
        <section class="card duels-journal"><h2 class="duels-h3">Journal</h2><ol class="duels-journal-liste" data-journal aria-live="polite"></ol></section>
        <section class="card duels-chat-boite" data-chat-boite><h2 class="duels-h3">Chat</h2><div data-chat></div></section>
      </aside>
    </div>
    <div class="duels-manche" data-manche hidden role="status" aria-live="assertive"></div>
  </div>`;
  const q = (s) => root.querySelector(s);
  const el = {
    nom: q('[data-nom]'), code: q('[data-code]'), score: q('[data-score]'), face: q('[data-face]'), chrono: q('[data-chrono]'),
    chronoTxt: q('[data-chrono-txt]'), arc: q('[data-chrono] .arc'), statut: q('[data-statut]'), plateau: q('[data-plateau]'),
    cote: q('[data-cote]'), journal: q('[data-journal]'), manche: q('[data-manche]'), panneau: q('[data-panneau]'),
    ouvrirChat: q('[data-ouvrir-chat]'), nonlus: q('[data-nonlus]'), abandon: q('[data-abandon]'), chatBoite: q('[data-chat-boite]'),
  };
  const chat = creerChat(q('[data-chat]'), { code: ctx.code, moi: ctx.moi });
  const signal = creerSignalTour();
  const fx = creerEffets();
  const ticChrono = creerTicChrono();
  const st = { etat: null, mancheVue: null, nonlus: 0, panneauOuvert: false, timerManche: null, aAgir: false, journalVu: null };

  const joueurMoi = (e) => (e?.joueurs || []).find((j) => j.user_id === e?.moi?.user_id) || null;
  const adversaire = (e) => (e?.joueurs || []).find((j) => j.user_id !== e?.moi?.user_id) || null;
  const monTour = (e) => e?.partie?.statut === 'en_cours' && !!e?.moi?.joue && e.partie.tour === e.moi.user_id;

  // Téléphone : le panneau (journal + chat) s'ouvre par le bouton de la barre.
  el.ouvrirChat.addEventListener('click', () => {
    st.panneauOuvert = !st.panneauOuvert;
    root.querySelector('.duels-table').classList.toggle('panneau-ouvert', st.panneauOuvert);
    el.ouvrirChat.setAttribute('aria-expanded', String(st.panneauOuvert));
    if (st.panneauOuvert) { st.nonlus = 0; el.nonlus.hidden = true; }
  });
  el.abandon.addEventListener('click', async () => {
    if (!confirm('Abandonner ce duel ? Ton adversaire gagnera.')) return;
    el.abandon.disabled = true;
    try { await duel.quitter(ctx.code); ctx.suivi?.rafraichir(); } catch (err) { toast(erreurTexte(err), 'error'); el.abandon.disabled = false; }
  });

  /** Chrono : échéance du tour (grilles) ou mon échéance personnelle (Mastermind). */
  const peindreChrono = () => {
    const e = st.etat; if (!e) return;
    const moiJ = joueurMoi(e);
    const fin = e.partie.tour_fin || (e.partie.jeu === 'mastermind' ? (moiJ?.fin || adversaire(e)?.fin)
      : e.partie.jeu === 'pfc' ? (moiJ?.fin || null) : null);
    if (!fin || e.partie.statut !== 'en_cours') { el.chrono.hidden = true; return; }
    const reste = ctx.suivi?.secondesRestantes(fin) ?? 0;
    const total = e.partie.phase === 'codes' ? 60 : e.partie.t_coup;
    el.chrono.hidden = false;
    el.chronoTxt.textContent = `${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`;
    el.arc.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, reste / Math.max(1, total))));
    el.chrono.classList.toggle('is-urgent', reste <= 5);
    el.chrono.setAttribute('aria-label', `${reste} secondes restantes`);
    ticChrono(reste, st.aAgir && !!e.moi?.joue, fin, el.chrono);
  };
  const tic = setInterval(peindreChrono, 500);

  /** Mon temps est écoulé (ligne « auto » du journal à mon nom, jamais vue) : message bref, une fois même après une rafale. */
  const signalerTemps = (e) => {
    const lignes = e.journal || [];
    const vu = st.journalVu ?? 0;
    const premier = st.journalVu === null;
    st.journalVu = Math.max(vu, ...lignes.map((x) => Number(x.id) || 0));
    if (premier || !e.moi?.joue || e.partie.statut !== 'en_cours') return;
    if (!lignes.some((x) => Number(x.id) > vu && x.type === 'auto' && x.user_id === e.moi.user_id)) return;
    toast('Temps écoulé : le jeu a joué pour toi.', '', 'duels-toast-temps');
    const t = [...document.querySelectorAll('.duels-toast-temps')].pop();
    t?.insertAdjacentHTML('afterbegin', ICONE_SABLIER);
    const n = Number(joueurMoi(e)?.manques);
    if (t && n >= 1) {
      t.insertAdjacentHTML('beforeend', `<span class="duels-manques" role="img" aria-label="${n} coup${n > 1 ? 's' : ''} manqué${n > 1 ? 's' : ''} sur 3">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`);
    }
    son('S12');
  };

  /** Bandeau de fin de manche (affiché quelques secondes quand une manche se termine). */
  const montrerManche = (e) => {
    const h = e.partie.historique || [];
    const derniere = h[h.length - 1];
    if (!derniere || st.mancheVue === derniere.manche) return;
    const premiere = st.mancheVue === null;
    st.mancheVue = derniere.manche;
    if (premiere && e.partie.manche > derniere.manche && h.length) return; // arrivée en cours de duel : pas de bandeau ancien
    const g = (e.joueurs || []).find((j) => j.user_id === derniere.gagnant);
    el.manche.innerHTML = `<p><strong>Manche ${derniere.manche}</strong> : ${g ? `${nomJoueur(g)} gagne` : 'nulle'}${e.partie.jeu === 'mastermind' && g ? ` en ${derniere.coups} essai${derniere.coups > 1 ? 's' : ''}` : ''}.</p>`;
    el.manche.hidden = false;
    clearTimeout(st.timerManche);
    st.timerManche = setTimeout(() => { el.manche.hidden = true; }, 3500);
  };

  return {
    plateau: el.plateau,
    cote: el.cote,
    joueurMoi, adversaire, monTour,
    /** Met à jour la barre, le statut, le journal et le chat. */
    maj(e, aAgir = monTour(e)) {
      st.etat = e;
      st.aAgir = !!aAgir;
      const p = e.partie;
      const js = e.joueurs || [];
      vuEnCours(p);
      el.nom.textContent = p.nom;
      el.code.textContent = p.code;
      const [a, b] = [js.find((j) => j.place === 1), js.find((j) => j.place === 2)];
      el.score.textContent = p.format > 1 ? `Manche ${p.manche} · au meilleur des ${p.format} · ${a?.manches ?? 0} – ${b?.manches ?? 0}` : `Manche unique`;
      el.face.innerHTML = js.map((j) => {
        const pfc = p.jeu === 'pfc';
        const aChoisi = !!e.pfc?.a_choisi?.[j.user_id];
        const tour = p.tour === j.user_id || (p.jeu === 'mastermind' && !!j.fin) || (pfc && !!j.fin);
        const moi = j.user_id === e.moi.user_id;
        const etatTxt = p.jeu === 'mastermind'
          ? (j.trouve_en ? `Code trouvé en ${j.trouve_en}` : `${j.essais} essai${j.essais > 1 ? 's' : ''} sur 10`)
          : pfc ? (aChoisi ? (moi ? 'Choix fait, gardé secret' : 'A choisi') : (moi ? 'À toi de choisir' : 'Réfléchit…'))
          : (p.tour === j.user_id ? (moi ? 'À toi de jouer' : 'À son tour') : 'En attente');
        return `<div class="duels-face-j${tour ? ' is-tour' : ''}">${avatarHtml(j, { tour })}
          <span class="duels-face-txt"><strong>${nomJoueur(j)}</strong><span class="duels-face-etat">${esc(etatTxt)}</span></span>
          ${p.format > 1 ? `<span class="duels-face-score" aria-label="${j.manches} manches gagnées">${j.manches}</span>` : ''}</div>`;
      }).join('<span class="duels-contre" aria-hidden="true">contre</span>');
      el.abandon.hidden = !e.moi.joue || p.statut !== 'en_cours';
      el.journal.innerHTML = (e.journal || []).slice(0, 8).map((x) => `<li>${esc(x.texte)}</li>`).join('');
      el.chatBoite.hidden = !e.moi.joue;
      el.ouvrirChat.hidden = false;
      if (!e.moi.joue) el.statut.textContent = 'Tu regardes ce duel en spectateur.';
      chat.maj(e);
      peindreChrono();
      montrerManche(e);
      signalerTemps(e);
      signal.maj(!!aAgir);
    },
    /** Texte de statut sous la barre (lu par les lecteurs d'écran). */
    statut(t) { el.statut.textContent = t || ''; },
    message(m) {
      chat.ajouter(m);
      if (!st.panneauOuvert && m?.user_id !== st.etat?.moi?.user_id && matchMedia('(max-width: 900px)').matches) {
        st.nonlus += 1; el.nonlus.textContent = String(st.nonlus); el.nonlus.hidden = false;
      }
    },
    detruire() {
      clearInterval(tic); clearTimeout(st.timerManche);
      fx.nettoyer();
      signal.arreter();
      try { chat.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
    },
    estInvite,
  };
}
