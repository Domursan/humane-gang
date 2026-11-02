// ===== Humane Gang — Jeux de plateau : salle d'attente (statut « attente ») =====
/*
 * Rôle : écran d'une partie pas encore lancée. Nom, code et « Copier le lien » (page du jeu + ?code=CODE),
 * joueurs (avatar, pseudo dans sa couleur, « invité », « Hôte », « Prêt »), places libres, bouton Prêt / Pas prêt,
 * et pour l'hôte : retirer un joueur, Lancer (actif si le minimum est atteint et tous sont prêts), Quitter.
 * Chat : colonne à droite sur ordinateur, tiroir sur téléphone (vues/chat.js). Les deux reçoivent les mêmes messages.
 * Un invité qui quitte voit un au revoir à la place de la salle.
 * Les zones ne sont réécrites que si leurs données changent (le focus reste en place).
 * Effets : un joueur rejoint, sa ligne glisse et S18 sonne (SA1) ; tout le monde est prêt, S19 pour l'hôte (SA2) ; la salle se ferme
 * parce que la partie démarre, 3, 2, 1, S20, titre d'onglet (SA3). Jamais sur le premier état reçu, ni au retour de veille (fin-fx.js).
 * Dépendances : core.js (esc, toast), plateaux/api.js (plat, erreurTexte, estInvite, jeu), vues/commun.js, vues/chat.js,
 *   commun/effets-duels.js, ./fin-fx.js (estRecent).
 * Exporte : creer.
 */
import { esc, toast } from '../../../commun/core.js';
import { plat, estInvite, jeu } from '../api.js';
import { avatarHtml, pseudoHtml, envoyer } from './commun.js';
import { creerChat, tiroirChat } from './chat.js';
import { creerEffets, departPartie, premiereFois, son } from '../../../commun/effets-duels.js';
import { estRecent } from './fin-fx.js';
import { majHoteMsg } from '../../../commun/hote-msg.js';
import { boutonQuitter, libelleQuitter, departSalle, confirmerDepart } from '../../../commun/quitter.js';
import { confirmBox } from '../../../commun/ui-confirm.js';

/** Met à jour un bloc seulement si son contenu a changé (évite de casser le focus). */
function zone(el, cle, html) {
  if (!el || el.dataset.cle === cle) return;
  el.dataset.cle = cle;
  el.innerHTML = html;
}

/** Joueurs inscrits (ceux qui ont quitté ne comptent pas). */
const actifs = (e) => (e?.joueurs || []).filter((j) => !j.parti);

/**
 * Monte la salle d'attente dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object, contenus: object }} ctx contexte (partie.js).
 * @returns {{ maj(etat: object): void, message(msg: object): void, detruire(): void }}
 */
export function creer(root, ctx) {
  const { code, naviguer, moi, suivi } = ctx;
  const invite = estInvite();
  const J = jeu();
  let fini = false;
  let dernierEtat = suivi.etat();
  const fx = creerEffets();
  let joueursVus = null;         // ids déjà dans la salle (null : aucun état encore)
  let tousPrets = null;          // tout le monde était prêt à l'état précédent

  root.innerHTML = `
    <div class="plat-salle">
      <nav class="plat-fil" aria-label="Fil d'Ariane" ${invite ? 'hidden' : ''}><a href="${esc(J.page)}">${esc(J.nom)}</a> › <span>Salle d'attente</span></nav>
      <div data-zone="hote-msg" hidden></div>
      <h1 class="plat-titre display" data-zone="titre"></h1>

      <div class="card plat-adieu" data-zone-adieu hidden>
        <h2>Tu as quitté la salle</h2>
        <p>Merci d'être passé. Tu peux revenir par le lien d'invitation si la partie n'est pas encore lancée.</p>
      </div>

      <div class="plat-salle-corps" data-zone-normale>
        <div class="plat-salle-principal">
          <section class="card plat-carte" aria-labelledby="plat-salle-code-titre">
            <span class="plat-etiquette-haut" id="plat-salle-code-titre">Code de partie</span>
            <p class="plat-code-grand" data-zone="code"></p>
            <div class="plat-boutons">
              <button type="button" class="btn btn-ghost" data-copier>Copier le lien d'invitation</button>
            </div>
          </section>

          <section class="card plat-carte" aria-labelledby="plat-salle-joueurs-titre">
            <div data-zone="joueurs"></div>
          </section>
        </div>

        <aside class="plat-salle-chat" data-zone="chat-large"></aside>
      </div>

      <div class="plat-salle-tiroir" data-zone="chat-tiroir" data-zone-normale-tiroir></div>

      <div class="card plat-actions" data-zone-actions>
        <p class="small muted" data-bilan aria-live="polite"></p>
        <div class="plat-boutons">
          <button type="button" class="btn btn-primary" data-pret aria-pressed="false">Je suis prêt</button>
          <button type="button" class="btn btn-sand" data-lancer disabled hidden aria-describedby="plat-salle-raison">Lancer la partie</button>
          <button type="button" class="btn btn-ghost" data-robot hidden>Ajouter un robot</button>
        </div>
        <p id="plat-salle-raison" class="small muted" data-raison></p>
        <p class="plat-quitter">${boutonQuitter('Quitter la salle', { attrs: 'data-quitter' })}</p>
      </div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const zTitre = q('[data-zone="titre"]');
  const zHoteMsg = q('[data-zone="hote-msg"]');
  const zAdieu = q('[data-zone-adieu]');
  const zNormale = q('[data-zone-normale]');
  const zCode = q('[data-zone="code"]');
  const zJoueurs = q('[data-zone="joueurs"]');
  const zActions = q('[data-zone-actions]');
  const bilan = q('[data-bilan]');
  const btnPret = q('[data-pret]');
  const btnLancer = q('[data-lancer]');
  const btnRobot = q('[data-robot]');
  const raison = q('[data-raison]');
  const btnQuitter = q('[data-quitter]');
  const btnCopier = q('[data-copier]');
  const zTiroirNormale = q('[data-zone-normale-tiroir]');

  zCode.textContent = code;

  const chatLarge = creerChat(q('[data-zone="chat-large"]'), { code, moi });
  const chatTiroir = tiroirChat(q('[data-zone="chat-tiroir"]'), { code, moi });
  chatLarge.maj(dernierEtat);
  chatTiroir.maj(dernierEtat);

  // ----- Copier le lien d'invitation (page du jeu + ?code=CODE) -----
  btnCopier.addEventListener('click', async () => {
    const lien = `${new URL(J.page, location.href).href}?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(lien);
      toast('Lien copié', 'ok');
    } catch {
      toast('Copie impossible. Sélectionne le lien à la main.', 'error');
    }
  });

  // ----- Actions -----
  btnPret.addEventListener('click', () => {
    const monPret = !!dernierEtat?.joueurs?.find((j) => j.user_id === dernierEtat?.moi?.user_id)?.pret;
    envoyer(btnPret, () => plat.pret(code, !monPret), suivi);
  });
  btnLancer.addEventListener('click', () => envoyer(btnLancer, () => plat.lancer(code), suivi));
  // Robots (administrateurs seulement) : pour tester un jeu seul ; ils jouent automatiquement au bout de 5 secondes.
  btnRobot.addEventListener('click', () => envoyer(btnRobot, () => plat.ajouterRobot(code), suivi));

  btnQuitter.addEventListener('click', async () => {
    if (!await confirmerDepart(departSalle(dernierEtat))) return;
    // Lancée pendant que la fenêtre était ouverte : ce départ-là n'est plus celui que la fenêtre annonçait.
    if (suivi.etat()?.partie?.statut !== 'attente') return;
    const ok = await envoyer(btnQuitter, () => plat.quitter(code), suivi);
    if (!ok) return;
    if (invite) {
      // Invité : on affiche l'au revoir ; le lien d'invitation reste valable tant que la partie est ouverte.
      fini = true;
      zNormale.hidden = true;
      zTiroirNormale.hidden = true;
      zActions.hidden = true;
      zAdieu.hidden = false;
      chatLarge.detruire();
      chatTiroir.detruire();
    } else {
      naviguer('');
    }
  });

  // ----- Retirer un joueur (hôte) -----
  zJoueurs.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-exclure]');
    if (!b) return;
    const uid = b.dataset.exclure;
    const nom = b.dataset.pseudo;
    if (!await confirmBox(`Retirer ${nom} de la partie ?`, '', { ok: 'Retirer', danger: true })) return;
    envoyer(b, () => plat.exclure(code, uid), suivi);
  });

  // ----- Rendus -----
  function rendreJoueurs(e) {
    const p = e.partie;
    const mon = e.moi || {};
    const joueurs = actifs(e);
    const nb = p.nb_places || 0;
    const n = joueurs.length;
    const pct = nb ? Math.min(100, Math.round((n / nb) * 100)) : 0;
    const estHote = !!mon.hote;

    const lignes = joueurs.map((j) => {
      const etiquettes = [];
      if (j.user_id === p.hote) etiquettes.push('<span class="plat-etiquette">Hôte</span>');
      if (j.user_id === mon.user_id) etiquettes.push('<span class="plat-etiquette">Toi</span>');
      if (j.invite) etiquettes.push('<span class="plat-etiquette">invité</span>');
      const statut = j.pret
        ? '<span class="pill pill-ok">Prêt</span>'
        : '<span class="pill pill-todo">Pas prêt</span>';
      const retirer = estHote && j.user_id !== mon.user_id && j.user_id !== p.hote
        ? `<button type="button" class="plat-icone" data-exclure="${esc(j.user_id)}" data-pseudo="${esc(j.pseudo)}" aria-label="Retirer ${esc(j.pseudo)} de la partie">×</button>`
        : '';
      return `<li class="plat-joueur${j.user_id === mon.user_id ? ' is-moi' : ''}" data-uid="${esc(j.user_id)}">
        ${avatarHtml(j, 40)}
        <div class="plat-joueur-infos">${pseudoHtml(j)} ${etiquettes.join(' ')}</div>
        ${statut}${retirer}
      </li>`;
    });
    for (let i = 0; i < Math.max(0, nb - n); i++) {
      lignes.push('<li class="plat-joueur plat-place-libre"><span class="plat-place-vide" aria-hidden="true"></span><span class="small muted">Place libre</span></li>');
    }

    const html = `
      <div class="plat-entete-liste">
        <h2 id="plat-salle-joueurs-titre">Joueurs</h2>
        <strong>${esc(n)} sur ${esc(nb)}</strong>
      </div>
      <div class="plat-progres" role="progressbar" aria-label="Joueurs dans la salle" aria-valuemin="0" aria-valuemax="${esc(nb)}" aria-valuenow="${esc(n)}" aria-valuetext="${esc(n)} joueurs sur ${esc(nb)}">
        <span style="width:${pct}%"></span>
      </div>
      <ul class="plat-joueurs">${lignes.join('') || '<li class="small muted">Personne n\'a encore rejoint la salle.</li>'}</ul>`;
    zone(zJoueurs, JSON.stringify([n, nb, estHote, mon.user_id, p.hote,
      joueurs.map((j) => [j.user_id, j.pseudo, j.pret, j.invite, j.couleur, j.avatar_url])]), html);
  }

  function rendreActions(e) {
    if (!e?.partie) return;
    const p = e.partie;
    const mon = e.moi || {};
    const joueurs = actifs(e);
    const n = joueurs.length;
    const estHote = !!mon.hote;
    const monPret = !!joueurs.find((j) => j.user_id === mon.user_id)?.pret;
    const pretsN = joueurs.filter((j) => j.pret).length;

    // Prêt : pour les joueurs inscrits, hôte compris (le serveur exige que tous soient prêts pour lancer).
    const afficherPret = !!mon.joue;
    btnPret.hidden = !afficherPret;
    btnPret.setAttribute('aria-pressed', String(monPret));
    btnPret.classList.toggle('btn-sand', monPret);
    btnPret.classList.toggle('btn-primary', !monPret);
    btnPret.textContent = monPret ? 'Je ne suis plus prêt' : 'Je suis prêt';

    // Lancer : hôte seulement, avec la raison écrite quand c'est désactivé.
    let raisonTexte = '';
    if (n < J.min) raisonTexte = `Il faut au moins ${J.min} joueurs pour lancer la partie.`;
    else if (pretsN < n) raisonTexte = `${n - pretsN} joueur${n - pretsN > 1 ? 's ne sont pas prêts' : ' n\'est pas prêt'}.`;
    btnLancer.hidden = !estHote;
    btnRobot.hidden = !(estHote && moi?.is_admin && !estInvite() && n < (p.nb_places || 0));
    btnLancer.disabled = !!raisonTexte;
    raison.textContent = estHote ? raisonTexte : '';
    bilan.textContent = `${pretsN} joueur${pretsN > 1 ? 's' : ''} sur ${n} ${pretsN > 1 ? 'sont prêts' : 'est prêt'}${p.nb_places ? ` (${p.nb_places} places)` : ''}`;

    libelleQuitter(btnQuitter, departSalle(e).ok);
  }

  /** SA1 et SA2 : compare à l'état précédent, après le dessin. Le premier état ne fait que retenir la salle. */
  function effets(e) {
    const joueurs = actifs(e);
    const nouveaux = joueursVus ? joueurs.filter((j) => !joueursVus.has(j.user_id)) : [];
    joueursVus = new Set(joueurs.map((j) => j.user_id));
    if (nouveaux.length) {
      son('S18');
      nouveaux.forEach((j) => fx.classe([...zJoueurs.querySelectorAll('[data-uid]')].find((li) => li.dataset.uid === j.user_id), 'plat-arrive', 600));
    }
    const prets = joueurs.length >= J.min && joueurs.every((j) => j.pret);
    if (prets && tousPrets === false && e.moi?.hote) son('S19');
    tousPrets = prets;
  }

  function maj(e) {
    if (fini || !e?.partie) return;
    dernierEtat = e;
    zTitre.textContent = e.partie.nom || `Partie de ${J.nom}`;
    majHoteMsg(zHoteMsg, e);
    rendreJoueurs(e);
    rendreActions(e);
    effets(e);
    chatLarge.maj(e);
    chatTiroir.maj(e);
  }

  maj(dernierEtat);

  return {
    maj,
    message(msg) {
      if (fini) return;
      chatLarge.message(msg);
      chatTiroir.message(msg);
    },
    detruire() {
      fini = true;
      fx.nettoyer();
      try { chatLarge.detruire(); } catch { /* sans effet */ }
      try { chatTiroir.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
      // Fermée parce que la partie vient de démarrer : le départ se joue par-dessus la table.
      const e = suivi.etat();
      if (e?.partie?.statut === 'en_cours' && estRecent(e.partie.started_at, e) && premiereFois(`depart:${e.partie.id}`)) departPartie('Bonne partie');
    },
  };
}
