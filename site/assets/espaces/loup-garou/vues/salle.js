// ===== Humane Gang — Loup-Garou : salle d'attente (statut « attente ») =====
/*
 * Rôle : écran d'une partie pas encore lancée. Code à partager (lien et code), joueurs et leur « prêt »,
 * chat du salon, composition des rôles (lecture seule) et actions (être prêt, lancer, quitter ou annuler).
 * Statut « annulee » : une carte « Cette partie a été annulée » avec le lien vers l'accueil.
 * Les zones qui changent ne sont réécrites que si leurs données ont changé, pour ne pas perdre le focus.
 * Dépendances : core.js (esc), api.js (lg, erreurTexte), ui.js, roles.js, chat.js.
 * Exporte : monter.
 */
import { esc } from '../../../commun/core.js';
import { erreurTexte, estInvite } from '../api.js';
import { icone, avatar, pseudo, vignetteRole, confirmer, notifier } from '../ui.js';
import { boutonQuitter, libelleQuitter, departSalle, confirmerDepart } from '../../../commun/quitter.js';
import { ROLES, roleById, CAMPS } from '../roles.js';
import { monterChat } from '../chat.js';
import { majHoteMsg } from '../../../commun/hote-msg.js';

/** Un joueur est-il prêt ? L'hôte en mode automatique l'est d'office. */
function estPret(j, p) {
  return !!j.pret || (p.mode === 'auto' && j.user_id === p.hote);
}

/** Met à jour un bloc seulement si son contenu a changé (évite de casser le focus). */
function zone(el, cle, html) {
  if (!el || el.dataset.cle === cle) return;
  el.dataset.cle = cle;
  el.innerHTML = html;
}

export function monter(root, s) {
  const code = s.code;
  const invite = estInvite();
  let busy = false;
  let fini = false;

  // Invité : pas de fil d'Ariane (il mène aux pages membres).
  const ariane = invite ? '' : `<nav class="lg-ariane" aria-label="Fil d'Ariane"><a href="/pages/jeux/jeux.html">Jeux</a> › <a href="/pages/jeux/loup-garou.html">Loup-Garou</a> › <span>Salle d'attente</span></nav>`;
  const retourAnnulee = invite ? '' : '<p><a class="btn btn-primary" href="/pages/jeux/loup-garou.html">Retour au Loup-Garou</a></p>';

  root.innerHTML = `
    <div class="lg-salle">
      ${ariane}
      <div data-zone="hote-msg" hidden></div>
      <h1 class="lg-salle-titre display" data-zone="titre"></h1>

      <div data-zone-annulee hidden class="card lg-salle-annulee">
        <h2>Cette partie a été annulée</h2>
        <p>Le code <span class="lg-code">${esc(code)}</span> ne mène plus à cette partie.</p>
        ${retourAnnulee}
      </div>

      <div data-zone-normale class="lg-salle-grille">
        <section class="card lg-sa-carte lg-sa-carte-code" aria-labelledby="lg-salle-code-titre">
          <div class="lg-salle-bloc">
            <span class="lg-salle-etiq" id="lg-salle-code-titre">Code de partie</span>
            <p class="lg-code lg-salle-code" data-zone="code"></p>
          </div>
          <div class="lg-salle-boutons">
            <button type="button" class="btn btn-ghost" data-copier-lien>${icone('lien', 18)} Copier le lien</button>
            <button type="button" class="btn btn-ghost" data-copier-code>${icone('copier', 18)} Copier le code</button>
          </div>
          <div class="lg-salle-pastilles" data-zone="pastilles"></div>
        </section>

        <section class="card lg-sa-carte lg-sa-carte-joueurs" aria-labelledby="lg-salle-joueurs-titre">
          <div data-zone="joueurs"></div>
        </section>

        <section class="card lg-sa-carte lg-sa-carte-roles" aria-labelledby="lg-salle-roles-titre">
          <div data-zone="roles"></div>
        </section>

        <div class="lg-salle-chat" data-zone="chat"></div>
      </div>

      <div data-zone-actions class="card lg-salle-actions">
        <div class="lg-salle-actions-ligne">
          <button type="button" class="btn btn-primary lg-bouton-pret" data-pret aria-pressed="false">${icone('coche', 20)} <span data-pret-texte>Je suis prêt</span></button>
          <div class="lg-salle-lancer" data-lancer-bloc hidden>
            <button type="button" class="btn btn-sand" data-lancer disabled aria-describedby="lg-salle-raison">Lancer la partie</button>
            <span id="lg-salle-raison" class="small muted" data-raison></span>
          </div>
        </div>
        <p class="lg-salle-quitter">${boutonQuitter('Quitter la salle', { attrs: 'data-quitter' })}</p>
      </div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const zTitre = q('[data-zone="titre"]');
  const zHoteMsg = q('[data-zone="hote-msg"]');
  const zAnnulee = q('[data-zone-annulee]');
  const zNormale = q('[data-zone-normale]');
  const zCode = q('[data-zone="code"]');
  const zPastilles = q('[data-zone="pastilles"]');
  const zJoueurs = q('[data-zone="joueurs"]');
  const zRoles = q('[data-zone="roles"]');
  const zChat = q('[data-zone="chat"]');
  const zActions = q('[data-zone-actions]');
  const btnPret = q('[data-pret]');
  const txtPret = q('[data-pret-texte]');
  const blocLancer = q('[data-lancer-bloc]');
  const btnLancer = q('[data-lancer]');
  const raison = q('[data-raison]');
  const btnQuitter = q('[data-quitter]');

  zCode.textContent = code;

  const chat = monterChat(zChat, s, {
    titre: 'Chat du salon',
    canaux: () => [{ canal: 'salon', ecrire: true }],
  });

  // ----- Actions : copier -----
  async function copier(texte, ok) {
    try {
      await navigator.clipboard.writeText(texte);
      notifier(ok);
    } catch {
      notifier('Copie impossible. Sélectionne le texte à la main.', 'error');
    }
  }
  q('[data-copier-lien]').addEventListener('click', () => {
    copier(`${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`, 'Lien copié');
  });
  q('[data-copier-code]').addEventListener('click', () => copier(code, 'Code copié'));

  // ----- Actions : prêt, lancer, quitter -----
  async function essayer(action) {
    if (busy) return;
    busy = true;
    maj(s.etat());
    try { await action(); } catch (e) { notifier(erreurTexte(e), 'error'); }
    finally { busy = false; maj(s.etat()); }
  }
  btnPret.addEventListener('click', () => {
    const e = s.etat();
    const monPret = !!e?.joueurs?.find((j) => j.user_id === e?.moi?.user_id)?.pret;
    essayer(() => s.lg.pret(code, !monPret));
  });
  btnLancer.addEventListener('click', () => essayer(() => s.lg.lancer(code)));
  btnQuitter.addEventListener('click', async () => {
    if (!await confirmerDepart(departSalle(s.etat(), { annuleTout: true }))) return;
    // Lancée pendant que la fenêtre était ouverte : le serveur refuserait ce départ.
    if (s.etat()?.partie?.statut !== 'attente') return;
    essayer(async () => {
      await s.lg.quitter(code);
      // Invité : retour à son lien d'invitation (il peut rejoindre à nouveau) ; membre : accueil.
      s.naviguer(invite ? `#rejoindre/${code}` : '');
    });
  });

  // ----- Liste des joueurs : retirer (hôte) -----
  zJoueurs.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-exclure]');
    if (!b) return;
    const uid = b.dataset.exclure;
    const nom = b.dataset.pseudo;
    const ok = await confirmer(`Retirer ${nom} de la partie ?`, { oui: 'Retirer', danger: true });
    if (!ok) return;
    essayer(() => s.lg.exclure(code, uid));
  });

  // ----- Rendus -----
  function rendreTitre(p) {
    zTitre.textContent = p.nom || 'Partie';
  }

  function rendrePastilles(p) {
    const modeTxt = p.mode === 'auto' ? 'Meneur automatique' : 'Meneur humain';
    const visTxt = p.visibilite === 'publique' ? 'Publique' : 'Privée';
    const html = `<span class="pill">${esc(modeTxt)}</span>
      <span class="pill">Nuit ${esc(p.t_nuit)} s · Jour ${esc(p.t_jour)} s</span>
      <span class="pill">${esc(visTxt)}</span>`;
    zone(zPastilles, html, html);
  }

  function rendreJoueurs(e) {
    const p = e.partie;
    const moi = e.moi || {};
    const joueurs = e.joueurs || [];
    const nb = p.nb_joueurs || 0;
    const n = joueurs.length;
    const pct = nb ? Math.min(100, Math.round((n / nb) * 100)) : 0;
    const estHote = !!moi.hote;
    const meneurHumain = p.mode === 'mj';
    const meneurPseudo = p.hote_pseudo || joueurs.find((j) => j.user_id === p.hote)?.pseudo || 'le meneur';

    const lignes = joueurs.map((j) => {
      const pret = estPret(j, p);
      const etiquettes = [];
      if (j.user_id === p.hote) etiquettes.push(`<span class="lg-etiquette sable">${icone('couronne', 13)} Hôte</span>`);
      if (j.user_id === moi.user_id) etiquettes.push('<span class="lg-etiquette">Toi</span>');
      if (j.invite) etiquettes.push('<span class="lg-etiquette">Invité</span>');
      const statut = pret
        ? `<span class="pill pill-ok lg-statut">${icone('coche', 14)} Prêt</span>`
        : '<span class="pill pill-todo lg-statut">Pas prêt</span>';
      const retirer = estHote && j.user_id !== moi.user_id && j.user_id !== p.hote
        ? `<button type="button" class="lg-btn-icone lg-retirer" data-exclure="${esc(j.user_id)}" data-pseudo="${esc(j.pseudo)}" aria-label="Retirer ${esc(j.pseudo)} de la partie">${icone('croix', 18)}</button>`
        : '';
      return `<li class="lg-joueur${j.user_id === moi.user_id ? ' moi' : ''}">
        ${avatar(j, 40)}
        <div class="lg-joueur-infos"><span class="lg-joueur-nom">${pseudo(j)}</span>${etiquettes.join('')}</div>
        ${statut}${retirer}
      </li>`;
    }).join('');

    const html = `
      <div class="lg-salle-entete-joueurs">
        <h2 id="lg-salle-joueurs-titre">Joueurs</h2>
        <strong>${esc(n)} / ${esc(nb)} joueurs</strong>
      </div>
      <div class="lg-progres" role="progressbar" aria-label="Joueurs dans la partie" aria-valuemin="0" aria-valuemax="${esc(nb)}" aria-valuenow="${esc(n)}" aria-valuetext="${esc(n)} joueurs sur ${esc(nb)}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="small muted">La partie peut commencer quand tout le monde est prêt.</p>
      ${meneurHumain ? `<p class="lg-meneur-ligne">${icone('etoile', 14)} Meneur : <strong>${esc(meneurPseudo)}</strong> (anime la partie sans jouer, il n'occupe pas de place)</p>` : ''}
      <ul class="lg-joueurs">${lignes || '<li class="small muted">Personne n\'a encore rejoint la partie.</li>'}</ul>`;
    const cle = JSON.stringify([n, nb, meneurHumain, meneurPseudo, estHote, moi.user_id, p.hote, p.mode,
      joueurs.map((j) => [j.user_id, j.pseudo, j.pret, j.invite, j.couleur, j.avatar_url, j.user_id === p.hote])]);
    zone(zJoueurs, cle, html);
  }

  function rendreRoles(e) {
    const p = e.partie;
    const compo = p.composition || {};
    const entrees = Object.entries(compo)
      .filter(([, nbr]) => nbr > 0)
      .sort(([a], [b]) => ROLES.findIndex((r) => r.id === a) - ROLES.findIndex((r) => r.id === b));
    const total = entrees.reduce((somme, [, nbr]) => somme + nbr, 0);
    const lignes = entrees.map(([id, nbr]) => {
      const r = roleById(id);
      const camp = CAMPS[r.camp] || CAMPS.village;
      return `<li class="lg-sa-role-ligne">
        <span class="lg-sa-role-vignette">${vignetteRole(id, 40)}</span>
        <div class="lg-sa-role-infos"><strong>${esc(r.nom)}</strong><span class="small muted">${esc(camp.label)}</span></div>
        ${nbr > 1 ? `<strong class="lg-sa-role-nombre">×${esc(nbr)}</strong>` : ''}
      </li>`;
    }).join('');
    const html = `
      <div class="lg-salle-entete-joueurs">
        <h2 id="lg-salle-roles-titre">Rôles de la partie</h2>
        <p class="small muted">Lecture seule · ${esc(total)} cartes</p>
      </div>
      <ul class="lg-sa-roles">${lignes}</ul>
      ${compo.voleur ? '<p class="small muted">+ 2 cartes au centre (Voleur)</p>' : ''}`;
    zone(zRoles, JSON.stringify([p.composition, p.nb_joueurs]), html);
  }

  function rendreActions(e) {
    const p = e.partie;
    const moi = e.moi || {};
    const joueurs = e.joueurs || [];
    const nb = p.nb_joueurs || 0;
    const n = joueurs.length;
    const estHote = !!moi.hote;
    const meneur = !!moi.meneur;
    const monPret = !!joueurs.find((j) => j.user_id === moi.user_id)?.pret;

    // « Je suis prêt » : pas pour le meneur, ni pour l'hôte en mode automatique (prêt d'office).
    const afficherPret = !meneur && !(estHote && p.mode === 'auto');
    btnPret.hidden = !afficherPret;
    btnPret.setAttribute('aria-pressed', String(monPret));
    btnPret.classList.toggle('btn-sand', monPret);
    btnPret.classList.toggle('btn-primary', !monPret);
    txtPret.textContent = monPret ? 'Pas prêt' : 'Je suis prêt';
    btnPret.disabled = busy;

    // Lancer : hôte seulement, avec la raison écrite quand c'est désactivé.
    let raisonTexte = '';
    const manque = nb - n;
    const pasPrets = joueurs.filter((j) => !estPret(j, p)).length;
    if (manque > 0) raisonTexte = `Encore ${manque} place${manque > 1 ? 's' : ''}`;
    else if (pasPrets > 0) raisonTexte = `${pasPrets} joueur${pasPrets > 1 ? 's ne sont pas prêts' : ' n\'est pas prêt'}`;
    blocLancer.hidden = !estHote;
    btnLancer.disabled = busy || !!raisonTexte;
    raison.textContent = raisonTexte;

    libelleQuitter(btnQuitter, estHote ? 'Annuler la partie' : 'Quitter la salle');
    btnQuitter.disabled = busy;
  }

  function maj(e) {
    if (fini || !e?.partie) return;
    const p = e.partie;
    rendreTitre(p);
    majHoteMsg(zHoteMsg, e);
    const annulee = p.statut === 'annulee';
    zAnnulee.hidden = !annulee;
    zNormale.hidden = annulee;
    zActions.hidden = annulee;
    if (!annulee) {
      rendrePastilles(p);
      rendreJoueurs(e);
      rendreRoles(e);
      rendreActions(e);
    }
    chat.maj(e);
  }

  maj(s.etat());

  return {
    maj,
    message(msg) { chat.message(msg); },
    detruire() {
      fini = true;
      try { chat.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
    },
  };
}
