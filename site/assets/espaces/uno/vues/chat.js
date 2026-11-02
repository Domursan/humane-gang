// ===== Humane Gang — Uno : chat de table (partagé par la salle d'attente et la table) =====
/*
 * Rôle : affiche les messages d'une partie et envoie les nouveaux (champ + bouton « Envoyer »).
 * Le pseudo est pris dans etat.joueurs (couleur de profil, gris pour un invité) ; à défaut, dans le message lui-même.
 * Les messages arrivent par le temps réel (table.message), jamais en double : on garde leurs ids.
 * Défilement automatique vers le bas, sauf si l'on a remonté le fil ; ses propres messages défilent toujours.
 * Chat des spectateurs (migration 214) : spect = vrai ne garde que les messages marqués spect (pseudo et couleur dans le message),
 *   sinon ils sont écartés ; lecture = vrai (un joueur lit le chat des spectateurs) remplace le champ par une phrase.
 * Dépendances : core.js (esc, toast), ../api.js (uno, erreurTexte).
 * Exporte : creerChat.
 */
import { esc, toast } from '../../../commun/core.js';
import { uno, erreurTexte } from '../api.js';

const LONGUEUR_MAX = 300;
let compteur = 0;

/**
 * Monte le chat dans el.
 * @param {HTMLElement} el conteneur (vidé puis rempli).
 * @param {{code: string, moi?: object|null, spect?: boolean, lecture?: boolean}} o code de la partie ; moi = profil connecté
 *   (sert à repérer ses messages) ; spect : chat des spectateurs ; lecture : sans champ pour écrire.
 * @returns {{ ajouter(msg: object): void, maj(etat: object): void, detruire(): void }}
 *   ajouter : un message {id, user_id, pseudo, texte, created_at, spect, couleur} ; maj : l'état de la partie (pseudos et couleurs).
 */
export function creerChat(el, { code, moi = null, spect = false, lecture = false } = {}) {
  const id = `uno-chat-${++compteur}`;
  el.classList.add('uno-chat-corps');
  el.innerHTML = `
    <div class="uno-chat-fil" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="${spect ? 'Messages des spectateurs' : 'Messages'}"></div>
    ${lecture ? '<p class="small muted sp-lecture">Tu lis le chat des spectateurs sans y écrire. Ils ne voient pas le chat de la table.</p>' : `
    <form class="uno-chat-form" autocomplete="off">
      <label class="visually-hidden" for="${id}-champ">${spect ? 'Ton message aux spectateurs' : 'Ton message'}</label>
      <input id="${id}-champ" class="uno-chat-champ" type="text" maxlength="${LONGUEUR_MAX}" placeholder="${spect ? 'Écris aux spectateurs' : 'Écris un message'}" data-champ>
      <button type="submit" class="btn btn-primary uno-chat-envoyer" data-envoyer>Envoyer</button>
    </form>`}`;
  const fil = el.querySelector('.uno-chat-fil');
  const form = el.querySelector('.uno-chat-form');
  const champ = el.querySelector('[data-champ]');
  const envoyer = el.querySelector('[data-envoyer]');

  const st = { msgs: [], ids: new Set(), joueurs: new Map(), cle: '', envoi: false, moiId: moi?.id || moi?.user_id || null };

  /** Pseudo et couleur d'un auteur : d'après l'état, sinon d'après le message. */
  function auteur(m) {
    if (m.spect) return { pseudo: m.pseudo || '?', couleur: /^#[0-9a-f]{6}$/i.test(m.couleur || '') ? m.couleur : '#F2EFEA' };
    const j = st.joueurs.get(m.user_id);
    if (j) {
      const couleur = j.invite ? '#9A968F' : (/^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA');
      return { pseudo: j.pseudo || '?', couleur };
    }
    return { pseudo: m.pseudo || '?', couleur: '#F2EFEA' };
  }

  /** HTML d'une ligne de message (texte échappé). */
  function ligne(m) {
    const a = auteur(m);
    const estMoi = !!st.moiId && m.user_id === st.moiId;
    return `<p class="uno-chat-msg${estMoi ? ' uno-chat-moi' : ''}" data-id="${esc(m.id)}">
      <strong class="uno-chat-auteur" style="color:${a.couleur}">${esc(a.pseudo)}</strong>
      <span class="uno-chat-texte">${esc(m.texte)}</span></p>`;
  }

  function peindre() {
    fil.innerHTML = st.msgs.length
      ? st.msgs.map(ligne).join('')
      : '<p class="uno-chat-vide">Aucun message pour l\'instant.</p>';
    fil.scrollTop = fil.scrollHeight;
  }

  async function surEnvoi(ev) {
    ev.preventDefault();
    const texte = champ.value.trim().slice(0, LONGUEUR_MAX);
    if (!texte || st.envoi) return;
    st.envoi = true;
    champ.disabled = true; envoyer.disabled = true;
    try {
      await uno.message(code, texte);
      champ.value = '';
    } catch (e) {
      toast(erreurTexte(e), 'error');
    } finally {
      st.envoi = false;
      champ.disabled = false; envoyer.disabled = false;
      champ.focus();
    }
  }
  form?.addEventListener('submit', surEnvoi);

  return {
    /** Ajoute un message s'il n'est pas déjà affiché (et s'il est de ce chat : table ou spectateurs). */
    ajouter(m) {
      if (!m || m.id == null || st.ids.has(m.id) || !!m.spect !== spect) return;
      st.ids.add(m.id);
      st.msgs.push(m);
      const pres = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60;
      const vide = fil.querySelector('.uno-chat-vide');
      if (vide) vide.remove();
      fil.insertAdjacentHTML('beforeend', ligne(m));
      const estMoi = !!st.moiId && m.user_id === st.moiId;
      if (pres || estMoi) fil.scrollTop = fil.scrollHeight;
    },
    /** Met à jour les pseudos et couleurs (état de la partie). Ne reconstruit le fil que si les joueurs ont changé. */
    maj(etat) {
      if (!etat) return;
      st.moiId = etat.moi?.user_id || st.moiId;
      const joueurs = etat.joueurs || [];
      st.joueurs = new Map(joueurs.map((j) => [j.user_id, j]));
      const cle = joueurs.map((j) => `${j.user_id}|${j.pseudo}|${j.couleur}|${j.invite}`).join(';');
      if (cle !== st.cle) { st.cle = cle; peindre(); }
    },
    /** Retire le chat de la page. */
    detruire() {
      el.classList.remove('uno-chat-corps');
      el.innerHTML = '';
    },
  };
}
