// ===== Humane Gang — Jeux de plateau : chat de partie (partagé par la salle, la table et la fin) =====
/*
 * Rôle : chat d'une partie. creerChat monte le fil et la saisie dans un conteneur ; tiroirChat fait la même chose
 * dans un tiroir ouvert par un bouton « Chat » avec une pastille de messages non lus (tables sur téléphone).
 * Les messages arrivent par le temps réel (message(m)) ; ils sont dédoublonnés par id. Pseudos dans leur couleur
 * de profil (gris et « invité » pour un invité), tirés de etat.joueurs. 300 caractères au plus.
 * Chat des spectateurs (migration 214) : les messages marqués spect portent le pseudo et la couleur de leur auteur.
 *   Un spectateur (etat.moi.spectateur) n'a que ce chat et y écrit ; un joueur d'une partie qui admet les spectateurs
 *   (etat.spectateurs.admis) a deux onglets, « Table » (choisi au départ) et « Spectateurs » (lecture seule).
 * Dépendances : core.js (esc, toast), plateaux/api.js (plat, erreurTexte, estInvite), commun/spectateurs.js (onglets).
 * Exporte : creerChat, tiroirChat.
 */
import { esc, toast } from '../../../commun/core.js';
import { plat, erreurTexte } from '../api.js';
import { ongletsChatHtml, brancherOnglets } from '../../../commun/spectateurs.js';

const LONGUEUR_MAX = 300;
const COULEUR = /^#[0-9a-f]{6}$/i;
let compteur = 0;

/**
 * Monte le chat dans conteneur.
 * @param {HTMLElement} conteneur zone vidée puis remplie.
 * @param {{ code: string, moi?: object|null }} opts code de la partie ; moi = profil connecté (repérer mes messages).
 * @returns {{ message(m: object): boolean, maj(etat: object): void, detruire(): void }}
 *   message : un message {id, user_id, pseudo, texte, created_at, spect, couleur}, vrai s'il s'affiche dans le fil ouvert ;
 *   maj : l'état de la partie.
 */
export function creerChat(conteneur, { code, moi = null } = {}) {
  const uid = `plat-chat-${++compteur}`;
  let fini = false;
  let envoi = false;
  const moiId = moi?.id || moi?.user_id || null;
  // mode : 'table' (chat de la table seul), 'onglets' (joueur, partie qui admet les spectateurs), 'spect' (spectateur).
  const st = { msgs: [], ids: new Set(), joueurs: new Map(), cle: '', moiId, etat: null, mode: 'table', onglet: 'table' };

  conteneur.classList.add('plat-chat');
  conteneur.innerHTML = `
    <div data-sp-onglets></div>
    <h2 class="plat-chat-titre">Chat</h2>
    <div class="plat-chat-panneau" id="${uid}-table" data-panneau-table>
      <div class="plat-chat-fil" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Messages de la partie" data-fil></div>
      <p class="plat-chat-lecture small muted" data-lecture hidden></p>
      <form class="plat-chat-form" autocomplete="off" data-form>
        <label class="visually-hidden" for="${uid}-champ" data-etiquette>Ton message</label>
        <input id="${uid}-champ" class="plat-chat-champ" type="text" maxlength="${LONGUEUR_MAX}" placeholder="Écris un message" data-champ>
        <button type="submit" class="btn btn-primary plat-chat-envoyer" data-envoyer>Envoyer</button>
      </form>
    </div>
    <div class="plat-chat-panneau" id="${uid}-spect" hidden data-panneau-spect>
      <div class="plat-chat-fil" role="log" aria-live="polite" aria-relevant="additions" tabindex="0" aria-label="Messages des spectateurs" data-fil-spect></div>
      <p class="small muted sp-lecture">Tu lis le chat des spectateurs sans y écrire. Ils ne voient pas le chat de la table.</p>
    </div>`;

  const titre = conteneur.querySelector('.plat-chat-titre');
  const zoneOnglets = conteneur.querySelector('[data-sp-onglets]');
  const fil = conteneur.querySelector('[data-fil]');
  const filSpect = conteneur.querySelector('[data-fil-spect]');
  const form = conteneur.querySelector('[data-form]');
  const etiquette = conteneur.querySelector('[data-etiquette]');
  const champ = conteneur.querySelector('[data-champ]');
  const envoyer = conteneur.querySelector('[data-envoyer]');
  const lecture = conteneur.querySelector('[data-lecture]');
  let onglets = null;

  /** Pseudo et couleur d'un auteur : spectateur d'après le message, joueur d'après l'état, sinon d'après le message. */
  function auteur(m) {
    if (m.spect) return { pseudo: m.pseudo || '?', couleur: COULEUR.test(m.couleur || '') ? m.couleur : '#F2EFEA', invite: false };
    const j = st.joueurs.get(m.user_id);
    if (j) {
      const couleur = j.invite ? '#9A968F' : (COULEUR.test(j.couleur || '') ? j.couleur : '#F2EFEA');
      return { pseudo: j.pseudo || '?', couleur, invite: !!j.invite };
    }
    return { pseudo: m.pseudo || '?', couleur: '#F2EFEA', invite: false };
  }

  /** HTML d'une ligne de message (texte échappé). */
  function ligne(m) {
    const a = auteur(m);
    const estMoi = !!st.moiId && m.user_id === st.moiId;
    return `<p class="plat-chat-msg${estMoi ? ' is-moi' : ''}" data-id="${esc(m.id)}">
      <strong class="plat-chat-auteur" style="color:${a.couleur}">${esc(a.pseudo)}</strong>${a.invite ? ' <span class="plat-invite">invité</span>' : ''}
      <span class="plat-chat-texte">${esc(m.texte)}</span></p>`;
  }

  /** Le fil principal montre les messages des spectateurs pour un spectateur, ceux de la table sinon. */
  const pourFil = (m) => !!m.spect === (st.mode === 'spect');

  /** Reconstruit un fil et le fait défiler en bas. */
  function peindreFil(f, msgs) {
    f.innerHTML = msgs.length
      ? msgs.map(ligne).join('')
      : '<p class="plat-chat-vide small muted">Aucun message pour l\'instant.</p>';
    f.scrollTop = f.scrollHeight;
  }
  function peindre() {
    peindreFil(fil, st.msgs.filter(pourFil));
    if (st.mode === 'onglets') peindreFil(filSpect, st.msgs.filter((m) => m.spect));
  }

  /** Ajoute une ligne à un fil (défile si l'on était en bas, ou si c'est mon message). */
  function ajouterA(f, m) {
    const pres = f.scrollHeight - f.scrollTop - f.clientHeight < 60;
    const vide = f.querySelector('.plat-chat-vide');
    if (vide) vide.remove();
    f.insertAdjacentHTML('beforeend', ligne(m));
    const estMoi = !!st.moiId && m.user_id === st.moiId;
    if (pres || estMoi) f.scrollTop = f.scrollHeight;
  }

  /** Saisie ou phrase de lecture seule selon mon état dans la partie. */
  function rendreSaisie() {
    const e = st.etat?.moi;
    let texte = '';
    if (e && e.parti) texte = 'Tu as quitté la partie.';
    else if (e && !e.joue && !e.spectateur) texte = 'Rejoins la partie pour écrire.';
    const ouverte = !texte;
    form.hidden = !ouverte;
    lecture.hidden = ouverte;
    lecture.textContent = texte;
    champ.disabled = envoi;
    envoyer.disabled = envoi;
  }

  /** Mode du chat d'après l'état : spectateur, joueur avec onglets, ou table seule. */
  function rendreMode() {
    const e = st.etat;
    const mode = e?.moi?.spectateur ? 'spect' : (e?.spectateurs?.admis && e?.moi?.joue ? 'onglets' : 'table');
    if (mode !== st.mode) {
      st.mode = mode;
      titre.textContent = mode === 'spect' ? 'Chat des spectateurs' : (mode === 'onglets' ? 'Chats de la partie' : 'Chat');
      titre.classList.toggle('visually-hidden', mode === 'onglets');
      champ.placeholder = mode === 'spect' ? 'Écris aux spectateurs' : 'Écris un message';
      etiquette.textContent = mode === 'spect' ? 'Ton message aux spectateurs' : 'Ton message';
      fil.setAttribute('aria-label', mode === 'spect' ? 'Messages des spectateurs' : 'Messages de la partie');
      if (mode === 'onglets' && !onglets) {
        zoneOnglets.innerHTML = ongletsChatHtml(uid);
        conteneur.querySelector(`#${CSS.escape(uid)}-table`).setAttribute('role', 'tabpanel');
        conteneur.querySelector(`#${CSS.escape(uid)}-spect`).setAttribute('role', 'tabpanel');
        onglets = brancherOnglets(conteneur, uid, (o) => { st.onglet = o; });
      } else if (mode !== 'onglets' && onglets) {
        zoneOnglets.innerHTML = '';
        onglets = null;
        conteneur.querySelector('[data-panneau-table]').hidden = false;
        conteneur.querySelector('[data-panneau-spect]').hidden = true;
      }
      peindre();
    }
    onglets?.nb(e?.spectateurs?.nb || 0);
  }

  async function surEnvoi(ev) {
    ev.preventDefault();
    const texte = champ.value.trim().slice(0, LONGUEUR_MAX);
    if (!texte || envoi || fini) return;
    envoi = true;
    rendreSaisie();
    try {
      await plat.message(code, texte);
      champ.value = '';
    } catch (e) {
      toast(erreurTexte(e), 'error');
    } finally {
      envoi = false;
      if (!fini) { rendreSaisie(); champ.focus(); }
    }
  }
  form.addEventListener('submit', surEnvoi);

  peindre();
  rendreSaisie();

  return {
    /** Ajoute un message (une seule fois par id). Vrai s'il arrive dans le fil principal. */
    message(m) {
      if (fini || !m || m.id == null || st.ids.has(m.id)) return false;
      st.ids.add(m.id);
      st.msgs.push(m);
      if (st.mode === 'onglets' && m.spect) ajouterA(filSpect, m);
      if (!pourFil(m)) return false;
      ajouterA(fil, m);
      return true;
    },
    /** Pseudos, couleurs, mode (spectateur, onglets) et droits d'écriture. Ne reconstruit le fil que si c'est utile. */
    maj(etat) {
      if (fini || !etat) return;
      st.etat = etat;
      st.moiId = etat.moi?.user_id || st.moiId;
      const joueurs = etat.joueurs || [];
      st.joueurs = new Map(joueurs.map((j) => [j.user_id, j]));
      const cle = joueurs.map((j) => `${j.user_id}|${j.pseudo}|${j.couleur}|${j.invite}`).join(';');
      if (cle !== st.cle) { st.cle = cle; peindre(); }
      rendreMode();
      rendreSaisie();
    },
    /** Retire le chat de la page. */
    detruire() {
      fini = true;
      conteneur.classList.remove('plat-chat');
      conteneur.innerHTML = '';
    },
  };
}

/**
 * Même chat, dans un tiroir ouvert par un bouton « Chat » (pastille = messages non lus).
 * @param {HTMLElement} conteneur zone du bouton et du tiroir.
 * @param {{ code: string, moi?: object|null }} opts comme creerChat.
 * @returns {{ message(m: object): void, maj(etat: object): void, detruire(): void, ouvrir(): void, fermer(): void }}
 */
export function tiroirChat(conteneur, opts = {}) {
  const uid = `plat-tiroir-${++compteur}`;
  let ouvert = false;
  let non_lus = 0;
  const vus = new Set();
  const moiId = opts.moi?.id || opts.moi?.user_id || null;

  conteneur.classList.add('plat-tiroir-zone');
  conteneur.innerHTML = `
    <button type="button" class="btn btn-ghost plat-tiroir-bouton" data-bouton aria-expanded="false" aria-controls="${uid}">
      <span>Chat</span><span class="plat-pastille" data-pastille aria-hidden="true" hidden></span>
    </button>
    <div class="plat-tiroir" id="${uid}" role="dialog" aria-label="Chat de la partie" hidden data-tiroir>
      <div class="plat-tiroir-tete">
        <h2 class="plat-chat-titre">Chat</h2>
        <button type="button" class="btn btn-ghost plat-tiroir-fermer" data-fermer>Fermer le chat</button>
      </div>
      <div data-corps></div>
    </div>`;

  const bouton = conteneur.querySelector('[data-bouton]');
  const pastille = conteneur.querySelector('[data-pastille]');
  const tiroir = conteneur.querySelector('[data-tiroir]');
  const fermerBtn = conteneur.querySelector('[data-fermer]');
  const chat = creerChat(conteneur.querySelector('[data-corps]'), opts);

  function rendrePastille() {
    pastille.hidden = !non_lus;
    pastille.textContent = non_lus > 9 ? '9+' : String(non_lus);
    bouton.setAttribute('aria-label', non_lus ? `Chat, ${non_lus} non lu${non_lus > 1 ? 's' : ''}` : 'Chat');
  }

  function ouvrir() {
    if (ouvert) return;
    ouvert = true;
    non_lus = 0;
    rendrePastille();
    tiroir.hidden = false;
    bouton.setAttribute('aria-expanded', 'true');
    conteneur.querySelector('[data-champ]')?.focus();
  }

  function fermer() {
    if (!ouvert) return;
    ouvert = false;
    tiroir.hidden = true;
    bouton.setAttribute('aria-expanded', 'false');
    bouton.focus();
  }

  bouton.addEventListener('click', () => (ouvert ? fermer() : ouvrir()));
  fermerBtn.addEventListener('click', fermer);
  tiroir.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') fermer(); });
  rendrePastille();

  return {
    /** Message : compté comme non lu si le tiroir est fermé, qu'il arrive dans le fil principal et que ce n'est pas le mien. */
    message(m) {
      if (!m || m.id == null || vus.has(m.id)) return;
      vus.add(m.id);
      const montre = chat.message(m);
      if (montre && !ouvert && !(moiId && m.user_id === moiId)) { non_lus += 1; rendrePastille(); }
    },
    maj(etat) {
      chat.maj(etat);
      // Spectateur : le tiroir s'appelle aussi « Chat des spectateurs ».
      const titre = tiroir.querySelector('.plat-tiroir-tete .plat-chat-titre');
      const t = etat?.moi?.spectateur ? 'Chat des spectateurs' : 'Chat';
      if (titre.textContent !== t) titre.textContent = t;
    },
    detruire() { chat.detruire(); conteneur.classList.remove('plat-tiroir-zone'); conteneur.innerHTML = ''; },
    ouvrir,
    fermer,
  };
}
