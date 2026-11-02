// ===== Humane Gang — Jeux de plateau : barre d'une table vue par un spectateur (migration 214) =====
/*
 * Rôle : ce que les tables ouvertes aux spectateurs (Blackjack, Monopoly, Destins) ajoutent à leur barre.
 *   Spectateur (etat.moi.spectateur) : le bouton Quitter disparaît, « Arrêter de regarder » prend sa place (fenêtre de
 *   confirmation, hg_spect_arreter, retour à l'accueil du jeu), et le message « Tu regardes en spectateur » s'affiche sous la barre.
 *   Joueur d'une partie qui admet les spectateurs : compteur (œil + nombre) dans la barre, à côté de Quitter.
 *   Les mains et les secrets ne sont jamais envoyés au spectateur : le serveur appelle la vue du jeu sans joueur.
 * Dépendances : core.js (toast), ../api.js (plat, erreurTexte), commun/quitter.js (DEPART, confirmerDepart),
 *   commun/spectateurs.js (compteurBarreHtml, messageSpectateurHtml, boutonArreterHtml).
 * Exporte : brancherSpectateur.
 */
import { toast } from '../../../commun/core.js';
import { plat, erreurTexte } from '../api.js';
import { DEPART, confirmerDepart } from '../../../commun/quitter.js';
import { compteurBarreHtml, messageSpectateurHtml, boutonArreterHtml } from '../../../commun/spectateurs.js';

/**
 * Branche le mode spectateur sur la barre d'une table.
 * @param {{ barre: HTMLElement, quitter: HTMLElement, naviguer: Function }} o barre de la table, son bouton Quitter,
 *   navigation de l'espace (naviguer('') : accueil du jeu).
 * @returns {{ maj(etat: object): void, spectateur(): boolean }} maj : à appeler à chaque état ; spectateur : vrai pour un spectateur.
 */
export function brancherSpectateur({ barre, quitter, naviguer }) {
  let etat = null;
  let monte = false;
  let message = null;
  let compteur = null;
  let html = '';

  async function arreter() {
    if (!await confirmerDepart(DEPART.spectateur)) return;
    try {
      await plat.arreterDeRegarder(etat?.partie?.id);
    } catch (e) {
      toast(erreurTexte(e), 'error');
      return;
    }
    naviguer('');
  }

  function monter() {
    monte = true;
    if (etat.moi?.spectateur) {
      quitter.insertAdjacentHTML('afterend', boutonArreterHtml());
      quitter.nextElementSibling.addEventListener('click', arreter);
      message = document.createElement('div');
      message.className = 'sp-zone';
      barre.after(message);
    } else {
      compteur = document.createElement('span');
      compteur.className = 'sp-barre-zone';
      quitter.before(compteur);
    }
  }

  return {
    maj(e) {
      if (!e?.partie) return;
      etat = e;
      if (!monte) monter();
      const nb = e.spectateurs?.nb || 0;
      let h = '';
      if (e.moi?.spectateur) { quitter.hidden = true; h = messageSpectateurHtml(nb); }
      else if (e.spectateurs?.admis) h = compteurBarreHtml(nb);
      if (h === html) return;
      html = h;
      (message || compteur).innerHTML = h;
    },
    spectateur: () => !!etat?.moi?.spectateur,
  };
}
