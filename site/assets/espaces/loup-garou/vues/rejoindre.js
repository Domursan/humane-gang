// ===== Humane Gang — Loup-Garou : rejoindre une partie (#rejoindre/CODE) =====
/*
 * Rôle : lit l'état de la partie demandée et propose de la rejoindre. Si l'on est déjà dans la partie, renvoie
 * directement vers la salle. Si le code est inconnu, ou absent de l'adresse, propose de saisir un code. Le lien
 * « Entrer un autre code » déplie le champ pour quitter cette partie-ci.
 * Dépendances : core.js (esc), loup-garou/api.js (lg, erreurTexte), loup-garou/ui.js (icone, pseudo, filAriane).
 * Exporte : afficher.
 */
import { esc } from '../../../commun/core.js';
import { lg, erreurTexte, estInvite, jetonInvite } from '../api.js';
import { icone, pseudo, filAriane } from '../ui.js';
import { hoteMsgHtml } from '../../../commun/hote-msg.js';

/** « 4821 », « hglg4821 » ou « HGLG-4821 » donnent « HGLG-4821 ». Renvoie null si le format ne colle pas. */
function normaliserCode(saisie) {
  const m = String(saisie || '').toUpperCase().replace(/\s+/g, '').match(/^(?:HGLG-?)?(\d{4})$/);
  return m ? `HGLG-${m[1]}` : null;
}

/** Formulaire de saisie d'un code. visible : libellé affiché (sinon seulement pour les lecteurs d'écran). */
function formulaireCode({ visible = true, id = 'lg-code-form' } = {}) {
  return `<form class="lg-code-form" id="${id}" novalidate>
    <label for="${id}-champ" class="${visible ? 'lg-code-libelle' : 'visually-hidden'}">Code de partie</label>
    <div class="lg-code-ligne">
      <input id="${id}-champ" class="lg-champ-code" type="text" name="code" placeholder="HGLG-4821"
        autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button type="submit" class="btn btn-ghost lg-code-bouton">Entrer</button>
    </div>
  </form>`;
}

/** Vue sans partie chargée : saisie d'un code (avec un message si le code précédent était mauvais). */
function vueSaisie(message = '') {
  return `<section class="card lg-invitation" aria-labelledby="lg-titre-saisie">
    <p class="lg-surtitre">Rejoindre une partie</p>
    <h1 id="lg-titre-saisie" class="lg-invitation-titre display">Entre le code de la partie</h1>
    ${message ? `<p class="lg-alerte" role="alert">${icone('info', 18)}<span>${esc(message)}</span></p>` : ''}
    ${formulaireCode({ visible: true })}
    <p class="lg-aide">Le code est donné par la personne qui a créé la partie.</p>
  </section>`;
}

/** Carte d'invitation : nom, hôte, code, joueurs et mode. */
function vueInvitation(p, code) {
  const inscrits = Array.isArray(p.joueurs) ? p.joueurs.length : (Number(p.joueurs) || 0);
  const commencee = Boolean(p.statut) && p.statut !== 'attente';
  const meneur = p.mode === 'mj' ? 'Meneur humain' : 'Meneur automatique';
  return `<section class="card lg-invitation" aria-labelledby="lg-titre-partie">
    <p class="lg-surtitre">Tu es invité·e à rejoindre</p>
    <h1 id="lg-titre-partie" class="lg-invitation-titre display">${esc(p.nom || 'Partie')}</h1>
    <p class="lg-invitation-hote">Créée par <strong>${pseudo({ pseudo: p.hote_pseudo })}</strong> · code <span class="lg-code">${esc(code)}</span></p>
    <ul class="lg-pastilles" aria-label="Infos sur la partie">
      <li class="lg-pastille-info">${inscrits} / ${esc(p.nb_joueurs ?? '?')} joueurs</li>
      <li class="lg-pastille-info">${meneur}</li>
    </ul>
    ${commencee
      ? `<p class="lg-alerte" role="status">${icone('info', 18)}<span>La partie a déjà commencé.</span></p>`
      : `<div class="lg-rejoindre-action">
          <button type="button" class="btn btn-primary lg-rejoindre-bouton" id="lg-rejoindre-bouton">Rejoindre la partie</button>
          <p class="lg-mention">Tu joues avec ton compte du gang : tes statistiques et Paillettes sont comptées.</p>
          <p class="lg-alerte" id="lg-rejoindre-erreur" role="alert" hidden></p>
        </div>`}
    <div class="lg-autre">
      <p>Ce n'est pas la bonne partie ? <button type="button" class="lg-lien" id="lg-autre" aria-expanded="false" aria-controls="lg-autre-form">Entrer un autre code</button></p>
      <div id="lg-autre-form" hidden>${formulaireCode({ visible: false, id: 'lg-autre-code' })}</div>
    </div>
  </section>`;
}

/** Branche le lien « Entrer un autre code » et les formulaires de saisie. */
function brancherSaisie(zone, naviguer) {
  const lien = zone.querySelector('#lg-autre');
  const bloc = zone.querySelector('#lg-autre-form');
  if (lien && bloc) {
    lien.addEventListener('click', () => {
      const ouvert = bloc.hidden;
      bloc.hidden = !ouvert;
      lien.setAttribute('aria-expanded', String(ouvert));
      if (ouvert) bloc.querySelector('input')?.focus();
    });
  }
  zone.querySelectorAll('.lg-code-form').forEach((f) => f.addEventListener('submit', (e) => {
    e.preventDefault();
    const champ = f.querySelector('input');
    const code = normaliserCode(champ.value);
    let msg = f.querySelector('.lg-champ-erreur');
    if (!code) {
      if (!msg) {
        msg = document.createElement('p');
        msg.className = 'lg-alerte lg-champ-erreur';
        msg.setAttribute('role', 'alert');
        f.append(msg);
      }
      msg.textContent = 'Le code ressemble à HGLG-4821 : quatre chiffres, avec ou sans « HGLG ».';
      return;
    }
    naviguer(`#rejoindre/${code}`);
  }));
}

/* ---------- Invité : lien d'invitation, sans compte ---------- */

/** Carte invité : contenu (HTML) puis lien secondaire vers la connexion. */
function carteInvite(code, contenu) {
  const suite = encodeURIComponent(`/pages/jeux/loup-garou.html?code=${code}`);
  return `<section class="card lg-invitation" aria-labelledby="lg-titre-partie">
    ${contenu}
    <p class="lg-invite-compte"><a class="lg-invite-lien" href="${esc(`/pages/compte/compte.html?next=${suite}`)}">J'ai un compte : me connecter</a></p>
  </section>`;
}

/** Carte d'un message seul (partie introuvable, annulée, réservée, commencée, complète, erreur). */
function carteInviteMessage(code, titre, texte) {
  return carteInvite(code, `<h1 id="lg-titre-partie" class="lg-invitation-titre display">${esc(titre)}</h1>
    <p class="lg-alerte" role="status">${icone('info', 18)}<span>${esc(texte)}</span></p>`);
}

/** Carte d'invitation avec le formulaire « Ton pseudo ». */
function carteInvitePartie(code, ap) {
  const inscrits = Number(ap.inscrits) || 0;
  const places = ap.nb_joueurs ?? '?';
  const meneur = ap.mode === 'mj' ? 'Meneur humain' : 'Meneur automatique';
  return carteInvite(code, `<p class="lg-surtitre">Tu es invité·e à rejoindre</p>
    <h1 id="lg-titre-partie" class="lg-invitation-titre display">${esc(ap.nom || 'Partie')}</h1>
    <p class="lg-invitation-hote">Créée par <strong>${pseudo({ pseudo: ap.hote_pseudo })}</strong> · code <span class="lg-code">${esc(code)}</span></p>
    <ul class="lg-pastilles" aria-label="Infos sur la partie">
      <li class="lg-pastille-info">${inscrits} / ${esc(places)} joueurs</li>
      <li class="lg-pastille-info">${meneur}</li>
    </ul>
    <form class="lg-invite-form" id="lg-invite-form" novalidate autocomplete="off">
      <label class="lg-invite-libelle" for="lg-invite-pseudo">Ton pseudo</label>
      <input id="lg-invite-pseudo" class="lg-champ-pseudo" type="text" name="pseudo" autocomplete="off" spellcheck="false" aria-describedby="lg-invite-aide">
      <p class="lg-aide" id="lg-invite-aide">De 2 à 24 caractères.</p>
      <button type="submit" class="btn btn-primary lg-rejoindre-bouton" id="lg-invite-bouton">Jouer en invité</button>
      <p class="lg-alerte" id="lg-invite-erreur" role="alert" hidden></p>
    </form>
    <p class="lg-mention">En invité, tu joues sans compte : pas de Paillettes ni de statistiques.</p>`);
}

/** Parcours invité : aperçu, pseudo, puis la salle. Les membres ne passent jamais ici. */
async function afficherInvite(root, code, naviguer) {
  root.innerHTML = '<div class="lg-rejoindre" id="lg-rejoindre-zone"></div>';
  const zone = root.querySelector('#lg-rejoindre-zone');

  // Déjà inscrit dans ce navigateur : on va directement à la salle.
  if (jetonInvite(code)) { naviguer(`#partie/${code}`); return; }

  zone.innerHTML = '<p class="lg-chargement" role="status">Chargement de la partie…</p>';
  let ap;
  try {
    ap = await lg.apercu(code);
  } catch (err) {
    zone.innerHTML = carteInviteMessage(code, 'Impossible d\'ouvrir la partie', erreurTexte(err));
    return;
  }
  if (!ap) {
    zone.innerHTML = carteInviteMessage(code, 'Partie introuvable', 'Vérifie le lien, ou demande un nouveau lien à la personne qui a créé la partie.');
    return;
  }
  if (ap.statut === 'annulee') {
    zone.innerHTML = carteInviteMessage(code, 'Cette partie a été annulée', 'Ce lien ne mène plus à une partie.');
    return;
  }
  if (!ap.invites) {
    zone.innerHTML = carteInviteMessage(code, 'Cette partie est réservée aux membres', 'Connecte-toi si tu fais partie du gang.');
    return;
  }
  if (ap.statut !== 'attente') {
    zone.innerHTML = carteInviteMessage(code, 'La partie a déjà commencé', 'Demande une nouvelle invitation pour la prochaine partie.');
    return;
  }
  if ((Number(ap.inscrits) || 0) >= (Number(ap.nb_joueurs) || 0)) {
    zone.innerHTML = carteInviteMessage(code, 'La partie est complète', 'Toutes les places sont prises.');
    return;
  }

  zone.innerHTML = carteInvitePartie(code, ap);
  const form = zone.querySelector('#lg-invite-form');
  const champ = zone.querySelector('#lg-invite-pseudo');
  const bouton = zone.querySelector('#lg-invite-bouton');
  const erreur = zone.querySelector('#lg-invite-erreur');
  let envoi = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (envoi) return;
    const saisi = champ.value.trim();
    if (saisi.length < 2 || saisi.length > 24) {
      champ.setAttribute('aria-invalid', 'true');
      erreur.textContent = 'Ton pseudo doit faire entre 2 et 24 caractères.';
      erreur.hidden = false;
      champ.focus();
      return;
    }
    champ.removeAttribute('aria-invalid');
    envoi = true;
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    erreur.hidden = true;
    try {
      const codeRejoint = await lg.rejoindreInvite(code, saisi);
      naviguer(`#partie/${codeRejoint || code}`);
    } catch (err) {
      envoi = false;
      bouton.disabled = false;
      bouton.textContent = 'Jouer en invité';
      erreur.textContent = erreurTexte(err);
      erreur.hidden = false;
    }
  });
}

export async function afficher(root, { code, naviguer }) {
  if (estInvite()) { await afficherInvite(root, code, naviguer); return; }
  root.innerHTML = `${filAriane('Rejoindre')}<div class="lg-rejoindre" id="lg-rejoindre-zone"></div>`;
  const zone = root.querySelector('#lg-rejoindre-zone');

  if (!code) {
    zone.innerHTML = vueSaisie();
    brancherSaisie(zone, naviguer);
    return;
  }

  zone.innerHTML = '<p class="lg-chargement" role="status">Chargement de la partie…</p>';
  let etat;
  try {
    etat = await lg.etat(code);
  } catch (err) {
    zone.innerHTML = vueSaisie(erreurTexte(err));
    brancherSaisie(zone, naviguer);
    return;
  }

  // Déjà dans la partie : on va directement à la salle.
  if (etat?.moi) {
    naviguer(`#partie/${code}`);
    return;
  }
  if (!etat?.partie) {
    zone.innerHTML = vueSaisie('Cette partie est introuvable.');
    brancherSaisie(zone, naviguer);
    return;
  }

  // L'ancien meneur n'est pas joueur : seul lui reçoit hote_passe ici.
  zone.innerHTML = hoteMsgHtml({ ...etat, moi: { user_id: etat.hote_passe?.ancien } }) + vueInvitation(etat.partie, code);
  brancherSaisie(zone, naviguer);

  const bouton = zone.querySelector('#lg-rejoindre-bouton');
  if (!bouton) return;
  const erreur = zone.querySelector('#lg-rejoindre-erreur');
  bouton.addEventListener('click', async () => {
    bouton.disabled = true;
    bouton.textContent = 'Connexion…';
    erreur.hidden = true;
    try {
      await lg.rejoindre(code);
      naviguer(`#partie/${code}`);
    } catch (err) {
      bouton.disabled = false;
      bouton.textContent = 'Rejoindre la partie';
      erreur.textContent = erreurTexte(err);
      erreur.hidden = false;
    }
  });
}
