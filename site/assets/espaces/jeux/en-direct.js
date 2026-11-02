// ===== Humane Gang — page « Jeux » : bloc « En direct » (vue de départ, migration 214) =====
/*
 * Rôle : parties publiques en cours qu'un membre peut regarder en spectateur (Uno, Blackjack, Monopoly, Destins), lues en un
 *   seul appel (hg_jeux_en_direct : jeux que le membre peut ouvrir, hors ses propres parties, les plus regardées d'abord).
 *   Le bloc n'existe que s'il y a au moins une partie à regarder ; sinon la page ne change pas. Même allure que « Reprendre ma
 *   partie » (classes rp-*). Relu à l'arrivée sur la vue de départ, comme cette barre ; aucune écoute en temps réel.
 * Dépendances : core.js (sb, esc), commun/spectateurs.js (compteurHtml, sousTitreDirect).
 * Exporte : creerEnDirect.
 */
import { sb, esc } from '../../commun/core.js';
import { compteurHtml, sousTitreDirect } from '../../commun/spectateurs.js';

const NOM = { uno: 'Uno', blackjack: 'Blackjack', monopoly: 'Monopoly', destins: 'Destins' };
/** Lignes montrées au plus (les plus regardées d'abord). */
const PLAFOND = 6;

const urlPartie = (d) => `/pages/jeux/${encodeURIComponent(d.jeu)}.html#partie/${encodeURIComponent(d.code)}`;

/** Une ligne : vignette du jeu, nom, « Jeu · joueurs · où en est la partie », compteur, « Regarder ». */
function ligneHtml(d) {
  const nom = esc(d.nom);
  const sous = esc([NOM[d.jeu] || d.jeu, sousTitreDirect(d, d.jeu)].filter(Boolean).join(' · '));
  return `<li class="rp-ligne"><img class="rp-vig" src="/assets/images/jeux/petit/${encodeURIComponent(d.jeu)}.webp" alt="" width="48" height="48" loading="lazy" decoding="async">
    <div class="rp-txt"><strong>${nom}</strong><span class="rp-sous">${sous}</span></div>${compteurHtml(d.spectateurs)}
    <a class="btn btn-ghost rp-bouton" href="${esc(urlPartie(d))}">Regarder<span class="visually-hidden"> ${nom}</span></a></li>`;
}

/**
 * Crée le bloc, caché. Le premier affichage lance la lecture.
 * @returns {{zone: HTMLElement, afficher: function(boolean): void, relire: function(): Promise<void>}}
 */
export function creerEnDirect() {
  const zone = document.createElement('section');
  zone.className = 'sp-jeux'; // pas la classe .rp : elle désigne la seule barre « Reprendre ma partie »
  zone.setAttribute('aria-labelledby', 'sp-jeux-titre');
  zone.hidden = true;
  let lignes = [], visible = false, lu = false, jeton = 0;

  function peindre() {
    const vues = lignes.slice(0, PLAFOND);
    zone.innerHTML = vues.length ? `<div class="rp-tete"><h2 class="rp-titre" id="sp-jeux-titre">En direct</h2><span class="rp-nb"><span class="visually-hidden">Parties en cours : </span>${esc(String(lignes.length))}</span></div>
      <ul class="rp-liste">${vues.map(ligneHtml).join('')}</ul>` : '';
    zone.hidden = !visible || !vues.length;
  }

  async function lire() {
    const n = ++jeton;
    lu = true;
    try {
      const { data, error } = await sb.rpc('hg_jeux_en_direct');
      if (error) throw error;
      if (n !== jeton) return;
      lignes = (Array.isArray(data) ? data : []).filter((d) => NOM[d?.jeu] && d.code);
    } catch (e) {
      if (n !== jeton) return;
      console.warn('[jeux] en direct', e);   // bloc facultatif : une erreur le laisse tel quel
    }
    peindre();
  }

  return {
    zone,
    /** Montre ou cache le bloc (vue de départ, filtre « Tous ») ; la première fois, lit la liste. */
    afficher(oui) { visible = !!oui; if (visible && !lu) lire(); else zone.hidden = !visible || !lignes.length; },
    relire: lire,
  };
}
