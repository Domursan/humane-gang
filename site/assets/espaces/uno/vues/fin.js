// ===== Humane Gang — Uno : fin de manche ou de partie (statut « terminee » ou « annulee ») =====
/*
 * Rôle : titre du vainqueur (ou « partie arrêtée »), podium des trois premiers, tableau de tous les joueurs
 * (cartes restantes, points de la manche ou cumul en mode points), récompense du joueur (membres seulement),
 * puis revanche (tout membre de la partie peut la lancer, migration 199) ou retour à l'accueil.
 * Mise en scène (scènes UNo et UNp, sons UN14 et UN3) quand on arrive de la table (ctx.depuisTable) : les marches montent de
 * la 3e à la 1re, un tampon tombe sur ma marche (VICTOIRE, ou ma place en gris ; jamais sur un autre joueur), le podium encaisse
 * le coup, puis les Paillettes défilent. Elle n'est jouée qu'une fois : ouverture directe, rechargement, onglet masqué : le
 * résultat s'affiche d'un bloc, tampon compris. Mouvement réduit : pas d'animation, sons conservés.
 * Dépendances : core.js (esc, avatarHtml, toast), uno/api.js (uno, erreurTexte, estInvite), uno/effets.js.
 * Exporte : creer.
 */
import { esc, toast, avatarHtml } from '../../../commun/core.js';
import { uno, erreurTexte, estInvite } from '../api.js';
import { mouvementReduit, son, rejouer } from '../effets.js';

const DEPART_TAMPON = 1500;        // ms après le début de la montée (maquette)
const DEPART_GAIN = 1800;
const DUREE_GAIN = 700;

/** Couleur de pseudo (profil ; invités en gris). */
const couleurPseudo = (j) => (j.invite ? '#9A968F' : (/^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA'));

/** Pseudo dans sa couleur, avec l'étiquette « invité » si besoin. */
function pseudoHtml(j) {
  return `<strong class="uno-pseudo" style="color:${couleurPseudo(j)}">${esc(j.pseudo || '?')}</strong>`
    + (j.invite ? ' <span class="uno-invite-tag">invité</span>' : '');
}

/** Clé de rendu : on ne réécrit une zone que si ses données ont changé. */
function zone(el, cle, html) {
  if (!el || el.dataset.cle === cle) return;
  el.dataset.cle = cle;
  el.innerHTML = html;
}

/** Joueurs classés (rang croissant, les sans rang à la fin). */
const classes = (joueurs) => [...joueurs].sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99));

/**
 * Monte l'écran de fin dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object }} ctx contexte de la partie (partie.js).
 * @returns {{ maj(etat: object): void, message(msg: object): void, detruire(): void }}
 */
export function creer(root, ctx) {
  const { code, naviguer, suivi } = ctx;
  const invite = estInvite();
  let fini = false;
  let busy = false;
  // Mise en scène à venir : le tampon et le gain attendent leur tour.
  let scene = !!ctx.depuisTable && !document.hidden && suivi.etat()?.partie?.statut === 'terminee';
  let tamponMontre = !scene;
  let gainMontre = !scene;
  let image = 0;
  const minuteurs = new Set();
  const plus = (fn, ms) => { const t = setTimeout(() => { minuteurs.delete(t); fn(); }, ms); minuteurs.add(t); };

  root.innerHTML = `
    <div class="uno-fin">
      <nav class="uno-fil" aria-label="Fil d'Ariane" ${invite ? 'hidden' : ''}><a href="/pages/jeux/uno.html">Uno</a> › <span>Fin de partie</span></nav>
      <div data-zone="entete"></div>

      <div class="uno-fin-grille">
        <section class="card uno-fin-carte" aria-labelledby="uno-fin-podium-titre">
          <h2 id="uno-fin-podium-titre">Podium</h2>
          <div data-zone="podium"></div>
        </section>
        <section class="card uno-fin-carte" aria-labelledby="uno-fin-points-titre">
          <h2 id="uno-fin-points-titre">Points restants</h2>
          <div data-zone="tableau"></div>
        </section>
      </div>

      <div data-zone="recompense"></div>

      <div class="uno-fin-actions" data-zone="actions"></div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const zEntete = q('[data-zone="entete"]');
  const zPodium = q('[data-zone="podium"]');
  const zTableau = q('[data-zone="tableau"]');
  const zRecompense = q('[data-zone="recompense"]');
  const zActions = q('[data-zone="actions"]');

  // ----- Actions -----
  async function lancerRevanche(btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const nouveau = await uno.rejouer(code);
      // Revanche déjà lancée par un autre : le serveur renvoie son code, mais je n'en suis pas encore membre.
      if (nouveau) naviguer(`#rejoindre/${encodeURIComponent(nouveau)}`);
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
    if (b) lancerRevanche(b);
  });

  // ----- Rendus -----
  function rendreEntete(e) {
    const p = e.partie;
    const joueurs = classes(e.joueurs || []);
    const gagnant = joueurs.find((j) => j.rang === 1 || j.gagne === true);
    const annulee = p.statut === 'annulee';
    const titre = annulee
      ? 'La partie a été arrêtée'
      : (gagnant ? `${gagnant.pseudo} gagne la manche !` : 'Manche terminée');
    const modeTxt = p.mode === 'points' ? 'Mode points' : 'Mode manche simple';
    const sous = [p.nom, code, `${joueurs.length} joueurs`, modeTxt].filter(Boolean).join(' · ');
    const html = `
      <h1 class="uno-titre display">${esc(titre)}</h1>
      <p class="uno-fin-sous small muted">${esc(sous)}</p>`;
    zone(zEntete, JSON.stringify([titre, sous]), html);
  }

  function rendrePodium(e) {
    const p = e.partie;
    if (p.statut === 'annulee') { zone(zPodium, 'annulee', '<p class="small muted">Pas de podium : la partie a été arrêtée.</p>'); return; }
    const joueurs = classes(e.joueurs || []).filter((j) => j.rang && j.rang <= 3);
    if (!joueurs.length) { zone(zPodium, 'vide', '<p class="small muted">Pas encore de classement.</p>'); return; }
    // Ordre d'affichage : 2e à gauche, 1er au centre, 3e à droite.
    const place = (rang) => joueurs.find((j) => j.rang === rang);
    const monId = e.moi?.user_id;
    /** Tampon de ma marche, décoratif : le rang est déjà lu sur la marche. */
    const tampon = (j, rang) => (j.user_id === monId
      ? `<span class="uno-fx-tampon${rang === 1 ? '' : ' gris'}" aria-hidden="true"${tamponMontre ? '' : ' hidden'}>${rang === 1 ? 'VICTOIRE' : `${rang}E PLACE`}</span>`
      : '');
    const colonne = (j, rang, taille, hauteur) => {
      if (!j) return '<div class="uno-podium-col vide"></div>';
      return `<div class="uno-podium-col rang-${rang}">
        <span class="uno-podium-avatar" style="width:${taille}px;height:${taille}px;border-color:${rang === 1 ? '#E2C77E' : '#3A3A40'}">${avatarHtml({ pseudo: j.pseudo, color: j.invite ? '#3A3A40' : j.couleur, avatar_url: j.avatar_url }, taille)}</span>
        <span class="uno-podium-nom">${pseudoHtml(j)}</span>
        <div class="uno-podium-marche" style="height:${hauteur}px">
          <span class="uno-podium-rang"><span class="visually-hidden">${rang === 1 ? 'Premier' : rang === 2 ? 'Deuxième' : 'Troisième'} : </span>${rang}</span>
          ${tampon(j, rang)}
        </div>
      </div>`;
    };
    const html = `<div class="uno-podium">
        ${colonne(place(2), 2, 56, 150)}
        ${colonne(place(1), 1, 68, 210)}
        ${colonne(place(3), 3, 56, 100)}
      </div>`;
    zone(zPodium, JSON.stringify(joueurs.map((j) => [j.user_id, j.rang, j.pseudo, j.couleur])), html);
  }

  function rendreTableau(e) {
    const p = e.partie;
    const enPoints = p.mode === 'points';
    const joueurs = classes(e.joueurs || []);
    const lignes = joueurs.map((j) => {
      const points = enPoints ? (j.points ?? 0) : (j.main_points ?? 0);
      return `<tr>
        <th scope="row">${pseudoHtml(j)}</th>
        <td class="num">${esc(j.nb_cartes ?? 0)}</td>
        <td class="num"><strong>${esc(points)}</strong></td>
      </tr>`;
    }).join('');
    const html = `
      <table class="uno-tableau">
        <caption class="small muted">${enPoints ? 'Cartes restantes et cumul de points de la partie' : 'Cartes restantes et points de la manche'}</caption>
        <thead><tr><th scope="col">Joueur</th><th scope="col" class="num">Cartes</th><th scope="col" class="num">${enPoints ? 'Cumul' : 'Points'}</th></tr></thead>
        <tbody>${lignes}</tbody>
      </table>`;
    zone(zTableau, JSON.stringify([enPoints, joueurs.map((j) => [j.user_id, j.nb_cartes, j.points, j.main_points, j.pseudo])]), html);
  }

  function rendreRecompense(e) {
    // Membres seulement : pas de Paillettes ni de badges pour les invités.
    if (invite) { zone(zRecompense, 'invite', ''); return; }
    const moi = e.moi || {};
    const mon = (e.joueurs || []).find((j) => j.user_id === moi.user_id);
    if (!mon) { zone(zRecompense, 'spectateur', ''); return; }
    const pailles = Number(mon.paillettes || 0);
    const badges = e.badges || [];
    const badgesTxt = badges.length
      ? `, et ${badges.length > 1 ? 'les badges' : 'le badge'} <strong class="uno-or">${badges.map((b) => esc(b.nom)).join(', ')}</strong> ${badges.length > 1 ? 'viennent' : 'vient'} d'être débloqué${badges.length > 1 ? 's' : ''}`
      : '';
    const texte = pailles > 0 || badges.length
      ? `${pailles > 0 ? `${pailles} Paillette${pailles > 1 ? 's' : ''} gagnée${pailles > 1 ? 's' : ''}` : 'Partie terminée'}${badgesTxt}.`
      : 'Partie terminée. Aucune Paillette cette fois.';
    const html = `
      <section class="card uno-fin-recompense" aria-labelledby="uno-fin-gain-titre">
        <div class="uno-fin-recompense-texte">
          <h2 id="uno-fin-gain-titre">Tes gains</h2>
          <p>${texte}</p>
        </div>
        ${pailles > 0 ? `<span class="uno-fin-pailles" aria-label="${esc(pailles)} Paillettes" data-gain="${esc(pailles)}">+${gainMontre ? esc(pailles) : 0}</span>` : ''}
      </section>`;
    zone(zRecompense, JSON.stringify([pailles, badges.map((b) => b.code)]), html);
  }

  function rendreActions(e) {
    const p = e.partie;
    const moi = e.moi || {};
    const hote = !!moi.hote;
    const suite = p.suite || null;
    let rejouerHtml;
    if (suite) {
      rejouerHtml = `<a class="btn btn-primary" href="/pages/jeux/uno.html#rejoindre/${encodeURIComponent(suite)}">Rejoindre la revanche</a>`;
    } else if (hote) {
      rejouerHtml = `<button type="button" class="btn btn-primary" data-rejouer>Rejouer avec la même table</button>`;
    } else if (invite) {
      rejouerHtml = '<p class="small muted uno-attente-revanche">En attente d\'un membre pour la revanche.</p>';
    } else {
      rejouerHtml = '<button type="button" class="btn btn-primary" data-rejouer>Revanche</button>';
    }
    const accueil = invite ? '' : '<a class="btn btn-ghost" href="/pages/jeux/uno.html">Retour à l\'accueil</a>';
    // Le bouton hôte peut être désactivé pendant une requête : on le reconstruit seulement si la clé change.
    zone(zActions, JSON.stringify([hote, suite, invite]), `${rejouerHtml}${accueil}`);
  }

  function maj(e) {
    if (fini || !e?.partie) return;
    rendreEntete(e);
    rendrePodium(e);
    rendreTableau(e);
    rendreRecompense(e);
    rendreActions(e);
  }

  /** Les Paillettes défilent jusqu'au gain. */
  function compterGain() {
    gainMontre = true;
    const n = q('[data-gain]');
    if (!n) return;
    const gain = Number(n.dataset.gain);
    if (mouvementReduit()) { n.textContent = `+${gain}`; return; }
    const debut = performance.now();
    const pas = (t) => {
      const p = Math.max(0, Math.min(1, (t - debut) / DUREE_GAIN));
      n.textContent = `+${Math.round(gain * p)}`;
      if (p < 1) image = requestAnimationFrame(pas);
    };
    image = requestAnimationFrame(pas);
  }

  /** Montée du podium (une seule fois, à l'arrivée depuis la table). */
  function jouerScene() {
    scene = false;
    const reduit = mouvementReduit();
    const podium = q('.uno-podium');
    if (podium && !reduit) {
      [['.rang-3', 0], ['.rang-2', 420], ['.rang-1', 840]].forEach(([sel, retard]) => {
        const col = podium.querySelector(sel);
        const marche = col?.querySelector('.uno-podium-marche');
        if (!marche) return;
        marche.animate([{ height: '0px' }, { height: `${marche.offsetHeight}px` }], { duration: 380, delay: retard, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'backwards' });
        [col.querySelector('.uno-podium-avatar'), col.querySelector('.uno-podium-nom')].forEach((n) => {
          n?.animate([{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }], { duration: 300, delay: retard + 220, fill: 'backwards' });
        });
      });
    }
    if (podium) son('UN14');
    const tampon = q('.uno-fx-tampon');
    plus(() => {
      tamponMontre = true;
      if (!tampon) return;
      tampon.hidden = false;
      son('UN3');
      if (reduit) return;
      rejouer(tampon, 'go');
      rejouer(podium, 'uno-fx-cogne');
      plus(() => { tampon.classList.remove('go'); podium.classList.remove('uno-fx-cogne'); }, 500);
    }, reduit ? 200 : DEPART_TAMPON);
    plus(compterGain, reduit ? 300 : DEPART_GAIN);
  }

  maj(suivi.etat());
  if (scene) jouerScene();

  return {
    maj,
    message() { /* pas de chat sur l'écran de fin */ },
    detruire() {
      fini = true;
      minuteurs.forEach(clearTimeout);
      minuteurs.clear();
      cancelAnimationFrame(image);
      root.innerHTML = '';
    },
  };
}
