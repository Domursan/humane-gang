// ===== Humane Gang — Jeux de plateau : fin de partie (statut « terminee » ou « annulee ») =====
/*
 * Rôle : titre selon ma place (« Victoire ! », « Défaite », « Partie terminée » pour un joueur parti, « Partie arrêtée »), tampon de
 * rang (« 3e sur 4 »), gagnant(s) mis en avant, podium des trois premiers, classement au vrai rang (etat.rang, voir fin-fx.js),
 * Paillettes gagnées et badges débloqués (membres seulement), revanche ou retour à l'accueil du jeu.
 * Au milieu, un encart propre au jeu : ../jeux/<jeu>/fin.js, export recap(etat, contenus) → HTML (facultatif).
 * Ce même fichier peut exporter finFx = { ac, ligne(e), conf, c, apres(issue), mesure(j, e), perdu(moi, e) } (voir effetsFinPlateau) :
 *   mesure : « 3 450 jetons », après « Tu gagnes la partie avec » et sous chaque marche du podium ; perdu : « à 1 200 jetons », après
 *   « Tu finis 3e, ».
 *   sobre(e) : voir fin-fx.js, sa ligne remplace le sous-titre, sans tampon ni gagnant. classer(joueurs) : rangs à afficher, pour un jeu
 *   dont le serveur écrit un rang à retraiter (Poker). Tout le monde à zéro : pas de gagnant, donc ni podium ni rang (« – »).
 * Module du jeu : un fichier absent est retenu ; un échec réseau est retenté à l'état suivant, l'encart n'est pas perdu.
 * Effets (PV1 à PV4) : seulement pour une partie vue en cours dans la page, une seule fois. Les jeux de FIN_PROPRE gardent leur propre
 * mise en scène : ils ont le titre et le rang, pas d'effet ni de podium ici.
 * Chat en bas.
 * Dépendances : core.js (esc, toast), plateaux/api.js (plat, erreurTexte, estInvite, jeu), vues/commun.js, vues/chat.js, ./fin-fx.js,
 *   commun/effets-duels.js (son).
 * Exporte : creer.
 */
import { esc, toast } from '../../../commun/core.js';
import { plat, erreurTexte, estInvite, jeu } from '../api.js';
import { avatarHtml, pseudoHtml } from './commun.js';
import { creerChat } from './chat.js';
import { son } from '../../../commun/effets-duels.js';
import { classes, effetsFinPlateau, fxFin, gagnantsDe, issuePlateau, rangReel, rangsFiables } from './fin-fx.js';

/** Jeux qui ont déjà leur fin animée (retournement, carte, podium…) : ./fin.js n'y ajoute ni son, ni bandeau, ni podium. */
const FIN_PROPRE = new Set(['cluedo', 'risk', 'monopoly', 'destins', 'shadow']);

/** Rang en toutes lettres : 1er, 2e… */
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);

/** Clé de rendu : on ne réécrit une zone que si ses données ont changé. */
function zone(el, cle, html) {
  if (!el || el.dataset.cle === cle) return;
  el.dataset.cle = cle;
  el.innerHTML = html;
}

/**
 * Monte l'écran de fin dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object, contenus: object }} ctx contexte (partie.js).
 * @returns {{ maj(etat: object): void, message(msg: object): void, detruire(): void }}
 */
export function creer(root, ctx) {
  const { code, naviguer, moi, suivi, contenus } = ctx;
  const invite = estInvite();
  const J = jeu();
  let fini = false;
  let busy = false;

  root.innerHTML = `
    <div class="plat-fin">
      <nav class="plat-fil" aria-label="Fil d'Ariane" ${invite ? 'hidden' : ''}><a href="${esc(J.page)}">${esc(J.nom)}</a> › <span>Fin de partie</span></nav>
      <div data-zone="entete"></div>
      <div class="plat-fin-grille">
        <section class="card plat-carte" aria-labelledby="plat-fin-classement-titre">
          <h2 id="plat-fin-classement-titre">Classement</h2>
          <div data-zone="podium"></div>
          <div data-zone="classement"></div>
        </section>
        <div class="plat-fin-cote">
          <div data-zone="recompense"></div>
          <div data-zone="recap" class="plat-recap"></div>
        </div>
      </div>
      <div class="plat-fin-chat" data-zone="chat"></div>
      <div class="plat-fin-actions" data-zone="actions"></div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const zEntete = q('[data-zone="entete"]');
  const zClassement = q('[data-zone="classement"]');
  const zPodium = q('[data-zone="podium"]');
  const zRecompense = q('[data-zone="recompense"]');
  const zRecap = q('[data-zone="recap"]');
  const zActions = q('[data-zone="actions"]');

  const chat = creerChat(q('[data-zone="chat"]'), { code, moi });
  const propre = FIN_PROPRE.has(J.id);
  /** Module de fin du jeu : undefined tant qu'il n'est pas chargé, null s'il n'existe pas. */
  let modJeu;
  let essais = 0;              // tentatives de chargement du module
  let chargement = false;      // tentative en cours
  let effetsFaits = false;

  /** L'état tel que l'écran l'affiche : rangs retraités par le jeu s'il le demande. */
  const lu = (e) => (modJeu?.finFx?.classer ? { ...e, joueurs: modJeu.finFx.classer(e.joueurs || []) } : e);

  // ----- Actions -----
  async function rejouer(btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const nouveau = await plat.rejouer(code);
      if (nouveau) naviguer(`#partie/${encodeURIComponent(nouveau)}`);
      else toast('La revanche n\'a pas pu être créée.', 'error');
    } catch (e) {
      toast(erreurTexte(e), 'error');
    } finally {
      busy = false;
      btn.disabled = false;
    }
  }
  zActions.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rejouer]');
    if (b) rejouer(b);
  });

  // ----- Rendus -----
  function rendreEntete(etat) {
    const e = lu(etat);
    const p = e.partie;
    const joueurs = classes(e.joueurs || []);
    const annulee = p.statut === 'annulee';
    const fxJeu = modJeu?.finFx || {};
    const sobre = annulee ? '' : fxJeu.sobre?.(e) || '';
    const gagnants = sobre ? [] : gagnantsDe(joueurs);
    const issue = issuePlateau(e, fxJeu);
    const monJ = joueurs.find((j) => j.user_id === e.moi?.user_id);
    const fiable = rangsFiables(joueurs);
    const monRang = monJ ? rangReel(monJ) : null;
    const gagne = gagnants.length ? `${gagnants.map((j) => j.pseudo).join(', ')} ${gagnants.length > 1 ? 'gagnent' : 'gagne'} la partie.` : '';
    const titre = annulee ? 'Partie arrêtée' : issue === 'gagnant' ? 'Victoire !' : issue === 'perdant' ? 'Défaite' : 'Partie terminée';
    let sous;
    if (annulee) sous = 'La partie a été arrêtée avant la fin.';
    else if (sobre) sous = `${sobre}.`;
    else if (issue === 'gagnant' && gagnants.length === 1) {
      const m = fxJeu.mesure?.(monJ, e);
      sous = `Tu gagnes la partie${m ? ` avec ${m}` : ''}.`;
    } else if (issue === 'perdant' && fiable && monRang) {
      const m = fxJeu.perdu?.(monJ, e);
      sous = `${gagne} Tu finis ${ordinal(monRang)}${m ? `, ${m}` : ''}.`;
    } else sous = gagne || 'Pas de gagnant désigné.';
    const tampon = !annulee && !sobre && fiable && monRang && (issue === 'gagnant' || issue === 'perdant')
      ? `<span class="plat-fin-tampon${issue === 'perdant' ? ' is-gris' : ''}">${esc(ordinal(monRang))} sur ${esc(joueurs.length)}</span>` : '';
    const html = `
      ${tampon}
      <h1 class="plat-titre display${issue === 'gagnant' ? ' is-gagne' : ''}">${esc(titre)}</h1>
      <p class="plat-fin-sous">${esc(sous)}</p>
      <div class="plat-gagnants">${gagnants.map((j) => `<div class="plat-gagnant">${avatarHtml(j, 56)}<span>${pseudoHtml(j)}</span></div>`).join('')}</div>
      <p class="small muted">${esc(p.nom_jeu || J.nom)} · <span class="plat-code">${esc(code)}</span> · ${esc(joueurs.length)} joueurs</p>`;
    zone(zEntete, JSON.stringify([titre, sous, tampon, gagnants.map((j) => j.user_id), code]), html);
  }

  /** PV3 : les trois premiers sur leurs marches, pour tous. Le tableau de classement reste dessous. */
  function rendrePodium(etat) {
    const e = lu(etat);
    const joueurs = classes(e.joueurs || []);
    if (propre || e.partie.statut !== 'terminee' || joueurs.length < 3 || !rangsFiables(joueurs) || !gagnantsDe(joueurs).length) { zone(zPodium, 'aucun', ''); return; }
    const haut = joueurs.slice(0, 3);
    const mesure = (j) => modJeu?.finFx?.mesure?.(j, e) || '';
    const marche = (j, m) => `<div class="plat-marche m${m}">${avatarHtml(j, 44)}${pseudoHtml(j)}<small class="small muted">${esc(mesure(j))}</small><i>${esc(rangReel(j))}</i></div>`;
    const texte = haut.map((j) => `${j.pseudo} ${ordinal(rangReel(j))}`).join(', ');
    const html = `<div class="plat-podium" role="img" aria-label="${esc(`Podium : ${texte}`)}">${marche(haut[1], 2)}${marche(haut[0], 1)}${marche(haut[2], 3)}</div>`;
    zone(zPodium, JSON.stringify(haut.map((j) => [j.user_id, rangReel(j), mesure(j)])), html);
  }

  /** Une seule fois, le module du jeu connu : effets si la partie a été vue en cours (ou déjà joués par la table). */
  function jouerEffets(e) {
    if (effetsFaits || propre || !essais || e.partie.statut !== 'terminee') return;
    effetsFaits = true;
    if (!effetsFinPlateau(e, modJeu?.finFx || {})) return;
    fxFin.classe(q('.plat-fin-tampon'), 'fxd-tampon', 800);
    fxFin.classe(q('.plat-fin .plat-titre'), 'fxd-pop', 600);
    const podium = q('.plat-podium');
    if (podium) { podium.classList.add('is-anime'); fxFin.plus(() => son('S03'), 1300); }
  }

  function rendreClassement(etat) {
    const e = lu(etat);
    const p = e.partie;
    if (p.statut === 'annulee') { zone(zClassement, 'annulee', '<p class="small muted">Pas de classement : la partie a été arrêtée.</p>'); return; }
    const joueurs = classes(e.joueurs || []);
    if (!joueurs.length) { zone(zClassement, 'vide', '<p class="small muted">Pas encore de classement.</p>'); return; }
    const sansGagnant = !gagnantsDe(joueurs).length;
    const rangDe = (j) => (sansGagnant ? null : rangReel(j));
    const lignes = joueurs.map((j) => `<tr>
        <th scope="row">${rangDe(j) != null ? esc(rangDe(j)) : '–'}</th>
        <td>${pseudoHtml(j)}</td>
        ${invite ? '' : `<td class="num">${j.invite ? '–' : `+${esc(j.paillettes || 0)}`}</td>`}
      </tr>`).join('');
    const html = `<table class="plat-classement">
        <caption class="visually-hidden">Classement de la partie</caption>
        <thead><tr><th scope="col">Rang</th><th scope="col">Joueur</th>${invite ? '' : '<th scope="col" class="num">Paillettes</th>'}</tr></thead>
        <tbody>${lignes}</tbody>
      </table>`;
    zone(zClassement, JSON.stringify([joueurs.map((j) => [j.user_id, rangDe(j), j.place, j.pseudo, j.paillettes])]), html);
  }

  function rendreRecompense(e) {
    // Membres seulement : pas de Paillettes ni de badges pour les invités.
    if (invite) { zone(zRecompense, 'invite', ''); return; }
    const mon = (e.joueurs || []).find((j) => j.user_id === e.moi?.user_id);
    if (!mon) { zone(zRecompense, 'spectateur', ''); return; }
    const pailles = Number(mon.paillettes || 0);
    const badges = e.badges || [];
    const lignesBadges = badges.length
      ? `<p>${badges.length > 1 ? 'Badges débloqués' : 'Badge débloqué'} : <strong class="plat-or">${badges.map((b) => esc(b.nom)).join(', ')}</strong></p>`
      : '';
    const html = `
      <section class="card plat-recompense" aria-labelledby="plat-fin-gain-titre">
        <h2 id="plat-fin-gain-titre">Tes gains</h2>
        <p>${pailles > 0 ? `${esc(pailles)} Paillette${pailles > 1 ? 's' : ''} gagnée${pailles > 1 ? 's' : ''}.` : 'Aucune Paillette cette fois.'}</p>
        ${lignesBadges}
      </section>`;
    zone(zRecompense, JSON.stringify([pailles, badges.map((b) => b.code)]), html);
  }

  /**
   * Module de fin du jeu. Un import() raté ne dit pas pourquoi : un 404 confirme l'absence (null), sinon undefined, à retenter.
   * Le navigateur peut garder en mémoire un import raté : la nouvelle tentative prend une autre adresse.
   */
  async function chargerModule() {
    const chemin = `../jeux/${J.id}/fin.js`;
    essais += 1;
    try {
      return await import(essais > 1 ? `${chemin}?essai=${essais}` : chemin);
    } catch {
      const absent = await fetch(new URL(chemin, import.meta.url), { method: 'HEAD' }).then((r) => r.status === 404).catch(() => false);
      return absent ? null : undefined;
    }
  }

  /** Encart propre au jeu (facultatif) : ../jeux/<jeu>/fin.js, export recap(etat, contenus). */
  async function chargerRecap(e) {
    if (modJeu === undefined) {
      if (chargement) return;
      chargement = true;
      modJeu = await chargerModule();
      chargement = false;
      if (fini) return;
      if (modJeu !== undefined) {
        rendreEntete(e);
        rendrePodium(e);
        rendreClassement(e);
      }
    }
    jouerEffets(e);
    const mod = modJeu;
    if (fini || typeof mod?.recap !== 'function') return;
    try {
      const html = mod.recap(lu(e), contenus || {});
      zone(zRecap, `recap:${JSON.stringify(e.partie?.version ?? '')}`, html || '');
    } catch (err) {
      console.warn('[plateaux] recap', err);
    }
  }

  function rendreActions(e) {
    const p = e.partie;
    const moiE = e.moi || {};
    const suite = p.suite || null;
    let rejouerHtml = '';
    if (!invite) {
      if (suite) {
        rejouerHtml = `<a class="btn btn-primary" href="#partie/${encodeURIComponent(suite)}">Rejoindre la revanche</a>`;
      } else if (moiE.joue) {
        rejouerHtml = '<button type="button" class="btn btn-primary" data-rejouer>Revanche</button>';
      }
    }
    const accueil = invite ? '' : `<a class="btn btn-ghost" href="${esc(J.page)}">Retour à l'accueil de ${esc(J.nom)}</a>`;
    // Le bouton peut être désactivé pendant une requête : on le reconstruit seulement si la clé change.
    zone(zActions, JSON.stringify([suite, invite, !!moiE.joue]), `${rejouerHtml}${accueil}`);
  }

  function maj(e) {
    if (fini || !e?.partie) return;
    rendreEntete(e);
    rendrePodium(e);
    rendreClassement(e);
    rendreRecompense(e);
    rendreActions(e);
    chat.maj(e);
    chargerRecap(e);
  }

  maj(suivi.etat());

  return {
    maj,
    message(msg) { if (!fini) chat.message(msg); },
    detruire() {
      fini = true;
      try { chat.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
    },
  };
}
