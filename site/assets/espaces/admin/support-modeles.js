// Admin : menu « Modèles » de la zone de réponse de l'Assistance (idée 99, migration 194). Choisir un modèle insère son texte dans
// la zone, réponse ou note interne : rien ne part sans le bouton d'envoi. Déjà du texte dans la zone : le modèle s'ajoute à la suite.
// {prenom} devient le pseudo du membre. Les modèles sont relus à chaque ouverture : une modification se voit tout de suite.
// Clavier : flèches, Début, Fin ; Échap ferme et rend le focus au bouton ; Tab ferme et continue depuis le bouton.
// Utilisé par support.js (menu) et admin-modeles-reponse.js (lecture de la liste). Dépend de core.js et common.js.
import { sb, esc, toast, errMsg } from '../../commun/core.js';
import { check } from './common.js';

const ICONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v16H5zM9 9h6M9 13h6"/></svg>';

/** Les modèles, dans l'ordre de création. */
export const lireModeles = async () => check(await sb.from('hg_modeles_reponse').select('id, titre, categorie, texte').order('id'));

/** Texte d'un modèle pour ce membre : chaque {prenom} devient son pseudo, écrit tel quel (une fonction ignore les « $ » du pseudo). */
export const remplirModele = (texte, pseudo) => texte.replace(/\{prenom\}/g, () => pseudo);

/** Met le texte dans la zone, à la suite de ce qui y est écrit, et y place le curseur. Vrai si du texte était déjà là. */
function inserer(ta, texte) {
  const deja = ta.value.trim() !== '';
  ta.value = deja ? `${ta.value.trimEnd()}\n\n${texte}` : texte;
  ta.rows = Math.max(ta.rows, 4);
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
  ta.scrollTop = ta.scrollHeight;
  return deja;
}

/**
 * Ajoute le bouton « Modèles » à la zone de réponse d'un fil (ui/thread.js).
 * @param {HTMLElement} fil Élément du fil.
 * @param {() => string} pseudo Pseudo du membre, lu au moment du choix.
 */
export function brancherModeles(fil, pseudo) {
  const ta = fil.querySelector('.ui-textarea');
  const wrap = document.createElement('span');
  wrap.className = 'ui-tpl';
  wrap.innerHTML = `<button type="button" class="ui-chip ui-tpl-btn" aria-haspopup="menu" aria-expanded="false">${ICONE}<span>Modèles</span></button>`;
  fil.querySelector('.ui-box-tools').prepend(wrap);
  const btn = wrap.firstElementChild;
  let menu = null;
  let lecture = false;

  const items = () => [...menu.querySelectorAll('.ui-tpl-item')];
  /** Donne le focus à l'entrée i, en boucle aux extrémités. */
  function viser(i) {
    const l = items();
    if (!l.length) return;
    const cible = l[(i + l.length) % l.length];
    l.forEach((x) => { x.classList.toggle('is-actif', x === cible); x.tabIndex = x === cible ? 0 : -1; });
    cible.focus();
  }
  /** Ferme le menu ; rendre : le focus revient au bouton. */
  function fermer(rendre) {
    if (!menu) return;
    menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', dehors);
    if (rendre) btn.focus();
  }
  /** Un clic hors du menu le ferme, sans reprendre le focus. */
  function dehors(e) { if (!wrap.contains(e.target)) fermer(false); }

  /** Lit les modèles puis ouvre le menu, sur la première entrée (ou la dernière, avec la flèche haut). */
  async function ouvrir(dernier) {
    if (lecture) return;
    lecture = true;
    let liste;
    try { liste = await lireModeles(); } catch (e) { toast(errMsg(e), 'error'); return; } finally { lecture = false; }
    if (!wrap.isConnected) return; // fil fermé pendant la lecture
    menu = document.createElement('div');
    menu.className = 'ui-tpl-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Modèles de réponse');
    menu.innerHTML = `${liste.map((m, i) => `<button type="button" role="menuitem" tabindex="-1" class="ui-tpl-item" data-i="${i}">${esc(m.titre)}${m.categorie ? `<small>${esc(m.categorie)}</small>` : ''}</button>`).join('')}
      <p class="ui-tpl-gerer" role="none">${liste.length ? 'Le texte reste modifiable avant l’envoi.' : 'Aucun modèle pour l’instant. Crée le premier dans La Poste › Modèles de réponse.'}</p>`;
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('.ui-tpl-item');
      if (!b) return;
      fermer(false);
      if (ta.readOnly) return; // envoi en cours : la zone va être vidée
      if (inserer(ta, remplirModele(liste[+b.dataset.i].texte, pseudo()))) toast('Modèle ajouté à la suite de ton texte.', 'ok');
    });
    wrap.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', dehors);
    if (liste.length) viser(dernier ? -1 : 0);
  }

  btn.addEventListener('click', () => { if (menu) fermer(true); else ouvrir(false); });
  wrap.addEventListener('keydown', (e) => {
    if (!menu) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ouvrir(e.key === 'ArrowUp'); }
      return;
    }
    if (e.key === 'Tab') { fermer(true); return; } // le navigateur continue depuis le bouton
    const pos = items().indexOf(document.activeElement);
    const cible = { ArrowDown: pos + 1, ArrowUp: pos - 1, Home: 0, End: -1 }[e.key];
    if (e.key === 'Escape') fermer(true);
    else if (cible !== undefined) viser(cible);
    else return;
    e.preventDefault();
    e.stopPropagation();
  });
}
