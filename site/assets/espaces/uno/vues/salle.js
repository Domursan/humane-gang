// ===== Humane Gang — Uno : salle d'attente (statut « attente ») =====
/*
 * Rôle : écran d'une partie pas encore lancée. Code et lien à partager, joueurs et leur « prêt »,
 * règles de la partie, chat du salon, actions (être prêt, lancer si hôte, quitter).
 * L'hôte peut retirer un joueur et modifier les règles (durée du tour, mode, variantes) tant que la partie n'est pas
 * lancée : chaque changement remet les autres joueurs « pas prêts » (règle serveur hg_uno_regles, migration 171).
 * Les autres voient les mêmes réglages en lecture seule, avec « Modifié par l'hôte » quand une règle change. Un invité qui quitte voit un message d'au revoir à la place de la salle.
 * Les zones qui changent ne sont réécrites que si leurs données ont changé, pour ne pas perdre le focus.
 * Dépendances : core.js (esc, avatarHtml, toast), uno/api.js (uno, erreurTexte, estInvite), uno/vues/chat.js (creerChat).
 * Exporte : creer.
 */
import { esc, toast, avatarHtml } from '../../../commun/core.js';
import { uno, erreurTexte, estInvite } from '../api.js';
import { creerChat } from './chat.js';
import { majHoteMsg } from '../../../commun/hote-msg.js';
import { boutonQuitter, libelleQuitter, departSalle, confirmerDepart } from '../../../commun/quitter.js';
import { confirmBox } from '../../../commun/ui-confirm.js';

/** Un joueur est-il prêt ? */
const estPret = (j) => !!j.pret;

/** Met à jour un bloc seulement si son contenu a changé (évite de casser le focus). */
function zone(el, cle, html) {
  if (!el || el.dataset.cle === cle) return;
  el.dataset.cle = cle;
  el.innerHTML = html;
}

/** Vignette d'un joueur (avatar ou initiales), couleur de profil ; invités en gris. */
function vignette(j) {
  return avatarHtml({ pseudo: j.pseudo, color: j.invite ? '#3A3A40' : j.couleur, avatar_url: j.avatar_url }, 40);
}

/** Pseudo dans sa couleur de profil (invité : gris, avec l'étiquette « invité »). */
function pseudoHtml(j) {
  const couleur = j.invite ? '#9A968F' : (/^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA');
  return `<strong class="uno-pseudo" style="color:${couleur}">${esc(j.pseudo || '?')}</strong>`
    + (j.invite ? ' <span class="uno-invite-tag">invité</span>' : '');
}

/** Variantes : clé, libellé, explication (même texte qu'à la création). */
const VARIANTES = [
  ['cumul', 'Cumul des +2 et +4', 'Un +2 ou +4 peut être contré par une carte semblable. Les pénalités s\'additionnent.'],
  ['pioche_jusqu', 'Pioche jusqu\'à jouer', 'On pioche jusqu\'à tomber sur une carte jouable, au lieu d\'une seule.'],
  ['sept_zero', 'Sept-zéro', 'Un 7 échange ta main avec un autre joueur, un 0 fait tourner toutes les mains.'],
  ['interception', 'Interception', 'On peut poser une carte identique à la défausse, même hors de son tour.'],
];
const DUREES = [15, 30, 60];
const MODES = [['manche', 'Manche simple'], ['points', '500 points']];

/**
 * Monte la salle d'attente dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object }} ctx contexte de la partie (partie.js).
 * @returns {{ maj(etat: object): void, message(msg: object): void, detruire(): void }}
 */
export function creer(root, ctx) {
  const { code, naviguer, moi, suivi } = ctx;
  const invite = estInvite();
  let busy = false;
  let fini = false;
  let dernierEtat = suivi.etat();
  let reglesVues = null;      // règles au premier affichage (pour signaler « Modifié par l'hôte »)

  root.innerHTML = `
    <div class="uno-salle">
      <nav class="uno-fil" aria-label="Fil d'Ariane" ${invite ? 'hidden' : ''}><a href="/pages/jeux/uno.html">Uno</a> › <span>Salle d'attente</span></nav>
      <div data-zone="hote-msg" hidden></div>
      <h1 class="uno-titre display" data-zone="titre"></h1>

      <div data-zone-adieu hidden class="card uno-salle-adieu">
        <h2>Tu as quitté la salle</h2>
        <p>Merci d'être passé. Tu peux revenir par le lien d'invitation si la partie n'est pas encore lancée.</p>
      </div>

      <div data-zone-normale class="uno-salle-grille">
        <section class="card uno-salle-carte uno-salle-code" aria-labelledby="uno-salle-code-titre">
          <span class="uno-salle-etiq" id="uno-salle-code-titre">Code de partie</span>
          <p class="uno-code uno-salle-codeaff" data-zone="code"></p>
          <div class="uno-salle-boutons">
            <button type="button" class="btn btn-ghost" data-copier-lien>Copier le lien</button>
          </div>
        </section>

        <section class="card uno-salle-carte" aria-labelledby="uno-salle-joueurs-titre">
          <div data-zone="joueurs"></div>
        </section>

        <section class="card uno-salle-carte" aria-labelledby="uno-salle-regles-titre">
          <div data-zone="regles"></div>
        </section>

        <div class="card uno-salle-chat" data-zone="chat"></div>
      </div>

      <div data-zone-actions class="card uno-salle-actions">
        <p class="uno-salle-bilan small muted" data-bilan aria-live="polite"></p>
        <div class="uno-salle-actions-ligne">
          <button type="button" class="btn btn-primary" data-pret aria-pressed="false"><span data-pret-texte>Je suis prêt</span></button>
          <button type="button" class="btn btn-sand" data-lancer disabled hidden aria-describedby="uno-salle-raison">Lancer la partie</button>
        </div>
        <p id="uno-salle-raison" class="small muted" data-raison></p>
        <p class="uno-salle-quitter">${boutonQuitter('Quitter la salle', { attrs: 'data-quitter' })}</p>
      </div>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const zTitre = q('[data-zone="titre"]');
  const zHoteMsg = q('[data-zone="hote-msg"]');
  const zAdieu = q('[data-zone-adieu]');
  const zNormale = q('[data-zone-normale]');
  const zCode = q('[data-zone="code"]');
  const zJoueurs = q('[data-zone="joueurs"]');
  const zRegles = q('[data-zone="regles"]');
  const zChat = q('[data-zone="chat"]');
  const zActions = q('[data-zone-actions]');
  const bilan = q('[data-bilan]');
  const btnPret = q('[data-pret]');
  const txtPret = q('[data-pret-texte]');
  const btnLancer = q('[data-lancer]');
  const raison = q('[data-raison]');
  const btnQuitter = q('[data-quitter]');
  const btnCopier = q('[data-copier-lien]');

  zCode.textContent = code;

  const chat = creerChat(zChat, { code, moi });

  // ----- Copier le lien d'invitation -----
  btnCopier.addEventListener('click', async () => {
    const lien = `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(lien);
      toast('Lien copié', 'ok');
    } catch {
      toast('Copie impossible. Sélectionne le lien à la main.', 'error');
    }
  });

  // ----- Actions communes : occupation, erreurs affichées en toast -----
  async function essayer(action) {
    if (busy) return;
    busy = true;
    rendreActions(dernierEtat);
    try { await action(); }
    catch (e) { toast(erreurTexte(e), 'error'); }
    finally { busy = false; rendreActions(dernierEtat); }
  }

  btnPret.addEventListener('click', () => {
    const monPret = !!dernierEtat?.joueurs?.find((j) => j.user_id === dernierEtat?.moi?.user_id)?.pret;
    essayer(() => uno.pret(code, !monPret));
  });
  btnLancer.addEventListener('click', () => essayer(() => uno.lancer(code)));

  btnQuitter.addEventListener('click', async () => {
    if (!await confirmerDepart(departSalle(dernierEtat))) return;
    // Lancée pendant que la fenêtre était ouverte : ce départ-là n'est plus celui que la fenêtre annonçait.
    if (suivi.etat()?.partie?.statut !== 'attente') return;
    await essayer(async () => {
      await uno.quitter(code);
      if (invite) {
        // Invité : on affiche l'au revoir ; le lien d'invitation reste valable tant que la partie est ouverte.
        fini = true;
        zNormale.hidden = true;
        zActions.hidden = true;
        zAdieu.hidden = false;
        chat.detruire();
      } else {
        naviguer('');
      }
    });
  });

  // ----- Liste des joueurs : retirer (hôte) -----
  zJoueurs.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-exclure]');
    if (!b) return;
    const uid = b.dataset.exclure;
    const nom = b.dataset.pseudo;
    if (!await confirmBox(`Retirer ${nom} de la partie ?`, '', { ok: 'Retirer', danger: true })) return;
    essayer(() => uno.exclure(code, uid));
  });

  // ----- Règles : l'hôte les modifie (segments et interrupteurs) -----
  zRegles.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-regle]');
    if (!b || b.disabled || !dernierEtat?.moi?.hote) return;
    const p = dernierEtat.partie;
    const cle = b.dataset.regle;
    let changement;
    if (cle === 't_tour') changement = { t_tour: Number(b.dataset.valeur) };
    else if (cle === 'mode') changement = { mode: b.dataset.valeur };
    else changement = { variantes: { ...(p.variantes || {}), [cle]: b.getAttribute('aria-checked') !== 'true' } };
    if (cle === 't_tour' && changement.t_tour === p.t_tour) return;
    if (cle === 'mode' && changement.mode === p.mode) return;
    const focus = `${cle}:${b.dataset.valeur || ''}`;
    essayer(async () => {
      await uno.regles(code, changement);
      await suivi.rafraichir();
      zRegles.querySelector(`[data-focus="${CSS.escape(focus)}"]`)?.focus();
    });
  });

  // ----- Rendus -----
  function rendreTitre(p) {
    zTitre.textContent = p.nom || 'Partie d\'Uno';
  }

  function rendreJoueurs(e) {
    const p = e.partie;
    const mon = e.moi || {};
    const joueurs = e.joueurs || [];
    const nb = p.nb_places || 0;
    const n = joueurs.length;
    const pct = nb ? Math.min(100, Math.round((n / nb) * 100)) : 0;
    const estHote = !!mon.hote;

    const lignes = joueurs.map((j) => {
      const etiquettes = [];
      if (j.user_id === p.hote) etiquettes.push('<span class="uno-etiquette">Hôte</span>');
      if (j.user_id === mon.user_id) etiquettes.push('<span class="uno-etiquette">Toi</span>');
      const statut = estPret(j)
        ? '<span class="pill pill-ok uno-statut">Prêt</span>'
        : '<span class="pill pill-todo uno-statut">Pas prêt</span>';
      const retirer = estHote && j.user_id !== mon.user_id && j.user_id !== p.hote
        ? `<button type="button" class="uno-btn-icone uno-retirer" data-exclure="${esc(j.user_id)}" data-pseudo="${esc(j.pseudo)}" aria-label="Retirer ${esc(j.pseudo)} de la partie">×</button>`
        : '';
      return `<li class="uno-joueur${j.user_id === mon.user_id ? ' moi' : ''}">
        ${vignette(j)}
        <div class="uno-joueur-infos">${pseudoHtml(j)}${etiquettes.join('')}</div>
        ${statut}${retirer}
      </li>`;
    });
    // Places libres en pointillés (affichage seul).
    for (let i = 0; i < Math.max(0, nb - n); i++) {
      lignes.push('<li class="uno-joueur uno-place-libre" aria-label="Place libre"><span class="uno-place-vide" aria-hidden="true"></span><span class="uno-joueur-infos small muted">Place libre</span></li>');
    }

    const html = `
      <div class="uno-salle-entete">
        <h2 id="uno-salle-joueurs-titre">Joueurs</h2>
        <strong>${esc(n)} sur ${esc(nb)}</strong>
      </div>
      <div class="uno-progres" role="progressbar" aria-label="Joueurs dans la salle" aria-valuemin="0" aria-valuemax="${esc(nb)}" aria-valuenow="${esc(n)}" aria-valuetext="${esc(n)} joueurs sur ${esc(nb)}">
        <span style="width:${pct}%"></span>
      </div>
      <ul class="uno-joueurs">${lignes.join('') || '<li class="small muted">Personne n\'a encore rejoint la salle.</li>'}</ul>`;
    zone(zJoueurs, JSON.stringify([n, nb, estHote, mon.user_id, p.hote,
      joueurs.map((j) => [j.user_id, j.pseudo, j.pret, j.invite, j.couleur, j.avatar_url])]), html);
  }

  function rendreRegles(e) {
    const p = e.partie;
    const v = p.variantes || {};
    const hote = !!e.moi?.hote && p.statut === 'attente';
    const signature = JSON.stringify([v, p.t_tour, p.mode]);
    if (reglesVues == null) reglesVues = signature;
    const modifie = !hote && reglesVues !== signature;
    const seg = (cle, titre, aide, options, valeur) => `
      <div class="uno-regle">
        <div class="uno-regle-txt"><span id="uno-r-${cle}">${esc(titre)}</span><small>${esc(aide)}</small></div>
        <div class="uno-regle-seg" role="group" aria-labelledby="uno-r-${cle}">${options.map(([val, lib]) => `
          <button type="button" data-regle="${cle}" data-valeur="${esc(val)}" data-focus="${cle}:${esc(val)}"
            aria-pressed="${String(String(val) === String(valeur))}"${hote ? '' : ' disabled'}>${esc(lib)}</button>`).join('')}</div>
      </div>`;
    const interr = ([cle, titre, aide]) => `
      <div class="uno-regle">
        <button type="button" class="uno-interr" data-regle="${cle}" data-focus="${cle}:" role="switch" aria-checked="${String(!!v[cle])}" aria-label="${esc(titre)}"${hote ? '' : ' disabled'}></button>
        <div class="uno-regle-txt"><span>${esc(titre)}</span><small>${esc(aide)}</small></div>
      </div>`;
    const html = `
      <h2 id="uno-salle-regles-titre">Règles de la partie</h2>
      ${seg('t_tour', 'Temps par tour', 'Le jeu joue à ta place quand le temps est écoulé.', DUREES.map((d) => [d, `${d} s`]), p.t_tour)}
      ${seg('mode', 'Mode', 'Une manche, ou le premier à 500 points.', MODES, p.mode)}
      ${VARIANTES.map(interr).join('')}
      <p class="small muted uno-regles-note">${hote
    ? 'Tu peux changer les règles jusqu\'au lancement. Chaque changement remet les autres joueurs « pas prêts ».'
    : (modifie ? '<strong class="uno-modifie">Modifié par l\'hôte</strong> : relis les règles avant de te dire prêt.' : 'Seul l\'hôte peut changer les règles.')}</p>`;
    zone(zRegles, JSON.stringify([signature, hote, modifie, busy]), html);
  }

  function rendreActions(e) {
    if (!e?.partie) return;
    rendreRegles(e);
    const p = e.partie;
    const mon = e.moi || {};
    const joueurs = e.joueurs || [];
    const nb = p.nb_places || 0;
    const n = joueurs.length;
    const estHote = !!mon.hote;
    const monPret = !!joueurs.find((j) => j.user_id === mon.user_id)?.pret;
    const pretsN = joueurs.filter(estPret).length;

    // « Je suis prêt » : seulement pour les joueurs inscrits (pas l'hôte, qui lance).
    const afficherPret = !!mon.joue && !mon.hote;
    btnPret.hidden = !afficherPret;
    btnPret.setAttribute('aria-pressed', String(monPret));
    btnPret.classList.toggle('btn-sand', monPret);
    btnPret.classList.toggle('btn-primary', !monPret);
    txtPret.textContent = monPret ? 'Je ne suis plus prêt' : 'Je suis prêt';
    btnPret.disabled = busy;

    // Lancer : hôte seulement, avec la raison écrite quand c'est désactivé.
    let raisonTexte = '';
    if (n < 2) raisonTexte = 'Il faut au moins 2 joueurs pour lancer la partie.';
    else if (pretsN < n) raisonTexte = `${n - pretsN} joueur${n - pretsN > 1 ? 's ne sont pas prêts' : ' n\'est pas prêt'}.`;
    btnLancer.hidden = !estHote;
    btnLancer.disabled = busy || !!raisonTexte;
    raison.textContent = estHote ? raisonTexte : '';
    bilan.textContent = `${pretsN} joueur${pretsN > 1 ? 's' : ''} sur ${Math.max(n, 0)} ${pretsN > 1 ? 'sont prêts' : 'est prêt'}${nb ? ` (${nb} places)` : ''}`;

    libelleQuitter(btnQuitter, departSalle(e).ok);
    btnQuitter.disabled = busy;
  }

  function maj(e) {
    if (fini || !e?.partie) return;
    dernierEtat = e;
    const p = e.partie;
    rendreTitre(p);
    majHoteMsg(zHoteMsg, e, 'Tu peux lancer la partie, retirer un joueur et changer les règles.');
    rendreJoueurs(e);
    rendreRegles(e);
    rendreActions(e);
    chat.maj(e);
  }

  maj(dernierEtat);

  return {
    maj,
    message(msg) { if (!fini) chat.ajouter(msg); },
    detruire() {
      fini = true;
      try { chat.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
    },
  };
}
