// ===== Humane Gang — Risk : encart de fin (plateaux/jeux/risk/fin.js) =====
/*
 * Rôle : HTML de l'encart de fin du Risk : le vainqueur et la façon dont il a gagné, la mission de chacun
 *   révélée, les territoires et les armées finales. Le classement et les récompenses sont dans l'écran de fin commun.
 * Dépendances : core.js (esc), ../../vues/commun.js (avatarHtml).
 * Exporte : recap(etat, contenus) -> HTML (chaîne).
 *   etat.joueurs[i] = { user_id, pseudo, etat: {armee}, gagne, elimine } ; etat.jeu.territoires = {id: {j, a}} ;
 *   etat.jeu.missions_fin = {user_id: {id, type, cible}} ; etat.partie.raison = 'mission' | 'monde' (autres : fin anticipée).
 *   Effets de fin (la fête du gagnant, le bandeau sobre du perdant) : ./effets.js (jouerFin), déclenchés ici seulement si la partie a été vue en cours.
 * Dépendances (ajout) : ./effets.js (jouerFin).
 */
import { esc } from '../../../../commun/core.js';
import { avatarHtml } from '../../vues/commun.js';
import { jouerFin } from './effets.js';

/** Armée (nom et couleur) d'un joueur, d'après ses contenus. */
function armeeDe(etat, contenus, uid) {
  const id = (etat?.joueurs || []).find((j) => j.user_id === uid)?.etat?.armee;
  return (contenus?.armees || []).find((a) => a.id === id) || null;
}

/** Encart de fin de partie (vainqueur, missions, carte finale en chiffres). */
export function recap(etat, contenus) {
  try { jouerFin(etat); } catch (err) { console.warn('[risk] fin', err); }
  const joueurs = etat?.joueurs || [];
  const jeu = etat?.jeu || {};
  const raison = etat?.partie?.raison;
  const missions = jeu.missions_fin || {};
  const terr = jeu.territoires || {};
  const vainqueurs = joueurs.filter((j) => j.gagne);
  const pseudo = (uid) => joueurs.find((j) => j.user_id === uid)?.pseudo || '?';

  // Bilan par joueur : territoires et troupes finales.
  const bilan = joueurs.map((j) => {
    const mes = Object.keys(terr).filter((t) => terr[t]?.j === j.user_id);
    return {
      uid: j.user_id, joueur: j, territoires: mes.length,
      troupes: mes.reduce((s, t) => s + (terr[t]?.a || 0), 0), armee: armeeDe(etat, contenus, j.user_id),
    };
  }).sort((a, b) => b.territoires - a.territoires || b.troupes - a.troupes);

  let titre = 'Partie terminée';
  let sous = '';
  if (vainqueurs.length) {
    const v = vainqueurs[0];
    const comment = raison === 'mission' ? 'en remplissant sa mission secrète' : 'en conquérant le monde';
    titre = `${v.pseudo} a gagné ${comment}`;
    const prise = bilan.find((b) => b.uid === v.user_id);
    sous = prise ? `${prise.territoires} territoire${prise.territoires > 1 ? 's' : ''} à la fin, ${prise.troupes} troupe${prise.troupes > 1 ? 's' : ''}.` : '';
  }

  const lignesMissions = joueurs.map((j) => {
    const m = missions[j.user_id] || {};
    const texte = (contenus?.missions || []).find((x) => x.id === m.id)?.texte || 'Aucune mission connue.';
    const cible = m.type === 'detruire' && m.cible ? ` Cible : ${esc(pseudo(m.cible))}.` : '';
    const issue = j.gagne ? '<span class="rk-fin-issue is-ok">Remplie</span>' : '<span class="rk-fin-issue">Non remplie</span>';
    return `<li class="rk-fin-mission">
      <span class="rk-fin-qui">${esc(j.pseudo || '?')}</span>
      <span class="rk-fin-texte">${esc(texte)}${cible}</span>
      ${issue}
    </li>`;
  }).join('');

  const lignesBilan = bilan.map((b, i) => `<li class="rk-fin-rang${b.joueur.gagne ? ' is-gagnant' : ''}${b.joueur.elimine ? ' is-elimine' : ''}">
      <span class="rk-fin-place">${i + 1}</span>
      ${avatarHtml(b.joueur, 30)}
      <span class="rk-fin-nom"><strong>${esc(b.joueur.pseudo || '?')}</strong>${b.armee ? `<span class="rk-fin-armee">Armée ${esc(b.armee.nom)}</span>` : ''}</span>
      <span class="rk-fin-chiffres">${b.territoires} terr. · ${b.troupes} troupes</span>
    </li>`).join('');

  return `<div class="rk-fin">
    <section class="rk-bloc rk-fin-entete" aria-labelledby="rk-fin-titre">
      <h2 id="rk-fin-titre" class="rk-fin-titre">${esc(titre)}</h2>
      ${sous ? `<p class="rk-note">${esc(sous)}</p>` : ''}
    </section>
    <section class="rk-bloc" aria-labelledby="rk-fin-missions">
      <h2 id="rk-fin-missions" class="rk-bloc-titre">Les missions</h2>
      <ul class="rk-fin-liste">${lignesMissions || '<li class="rk-vide">Aucune mission.</li>'}</ul>
    </section>
    <section class="rk-bloc" aria-labelledby="rk-fin-bilan">
      <h2 id="rk-fin-bilan" class="rk-bloc-titre">Le monde à la fin</h2>
      <ol class="rk-fin-liste">${lignesBilan}</ol>
    </section>
  </div>`;
}
