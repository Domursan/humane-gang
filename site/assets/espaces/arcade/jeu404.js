// ===== Humane Gang — secret de la page 404 : le jeu des paillettes (même règles que l'arcade) =====
/*
 * Rôle : petit jeu sur la page introuvable (/404.html), le même Paillettes que l'arcade (eggs/jeu-paillettes.js) :
 * pas de chrono, trois vies, pièges (fausses paillettes violettes, grêlons). Le joueur déplace le chapeau du gang
 * (souris, doigt ou flèches) pour attraper les paillettes. Fin de partie (zéro vie) avec au moins une paillette :
 * le score est signalé au serveur (secret « jeu404 », une récompense par jour). Sans compte, le jeu reste jouable
 * et un message invite à se connecter.
 * Moteur : eggs/arcade.js (creeArcade) ; animation réduite : chute plus lente, pas d'étincelles ni de secousse.
 * Page : /404.html uniquement (module chargé en fin de page).
 * Dépendances : eggs/arcade.js (moteur), eggs/jeu-paillettes.js (règles), eggs/api.js (eggFound), core/supabase.js (hasSession).
 * Exporte : rien (effets de bord : lance le jeu sur le canevas #jeu-canvas).
 */
import { creeArcade } from './arcade.js';
import { JEU } from './jeu-paillettes.js';
import { eggFound } from './api.js';
import { hasSession } from '../../commun/core/supabase.js';

/* ---------- Éléments de la page ---------- */

const canvas = document.getElementById('jeu-canvas');
const scoreEl = document.getElementById('jeu-score');
const coeursEl = document.getElementById('jeu-coeurs');
const viesTxt = document.getElementById('jeu-vies-txt');
const bouton = document.getElementById('jeu-bouton');
const message = document.getElementById('jeu-message');
if (canvas && scoreEl && coeursEl && viesTxt && bouton && message) demarrageJeu();

/**
 * Initialise le jeu : moteur d'arcade sur le canevas, affichage des vies, fin de partie et secret.
 * Appelée une seule fois, quand la page contient le canevas.
 */
function demarrageJeu() {
  const arcade = creeArcade({
    canvas,
    jeu: { ...JEU, accroche: 'Attrape les paillettes, évite le reste !' },
    onHud: (score, vies) => {
      if (scoreEl.textContent !== String(score)) scoreEl.textContent = String(score);
      // Vies : cœurs (♥ pleins, ♡ perdus) ; le texte est lu par les lecteurs d'écran.
      if (!vies) return;
      const coeurs = '♥'.repeat(vies.left) + '♡'.repeat(vies.max - vies.left);
      if (coeursEl.textContent !== coeurs) {
        coeursEl.textContent = coeurs;
        viesTxt.textContent = `${vies.left} vie${vies.left > 1 ? 's' : ''} sur ${vies.max}`;
      }
    },
    onDebut: () => {
      message.textContent = '';
      bouton.hidden = true;
    },
    onFin: (score) => fin(score),
  });

  /**
   * Termine la partie : affiche le score, propose de rejouer et signale le score au serveur
   * (une récompense par jour). Sans compte, un message invite à se connecter.
   * @param {number} score points de la partie
   */
  async function fin(score) {
    bouton.textContent = 'Rejouer';
    bouton.hidden = false;
    if (score < 1) { message.textContent = 'Aucune paillette cette fois. Rejoue, le chapeau est patient !'; return; }
    message.textContent = `Tu as attrapé ${score} paillette${score > 1 ? 's' : ''} !`;
    if (!(await hasSession())) { message.textContent += ' Connecte-toi pour gagner des Paillettes.'; return; }
    eggFound('jeu404', { score });
  }

  bouton.addEventListener('click', () => arcade.demarre());
}
