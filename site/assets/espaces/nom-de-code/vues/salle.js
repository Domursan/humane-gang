// ===== Humane Gang — Nom de code : salle d'attente (statut « attente ») =====
/*
 * Rôle : écran d'une partie pas encore lancée, fidèle à la maquette NDCSalle. Panneau central avec le code,
 * « Copier le lien » et les réglages ; colonnes Équipe Jaune et Équipe Rose ; zone « Sans équipe » ;
 * « Tes actions » (équipe, espion, prêt, quitter) ; pour l'hôte, « Lancer la partie » avec la raison
 * s'il n'est pas prêt, et les menus de chaque joueur (mettre dans une équipe, espion, retirer).
 * Le chat à onglets (vues/chat.js) est en dessous. Un invité qui quitte voit un au revoir à la place.
 * Les zones ne sont réécrites que si leurs données changent (le focus reste en place) ; les menus gardent leur état ouvert.
 * Dépendances : core.js (esc, avatarHtml, toast), nom-de-code/api.js (ndc, erreurTexte, estInvite, EQUIPES), vues/chat.js (creerChat).
 * Exporte : creer.
 */
import { esc, avatarHtml, toast } from '../../../commun/core.js';
import { ndc, erreurTexte, estInvite, EQUIPES } from '../api.js';
import { creerChat } from './chat.js';
import { majHoteMsg } from '../../../commun/hote-msg.js';
import { boutonQuitter, departSalle, confirmerDepart } from '../../../commun/quitter.js';
import { confirmBox } from '../../../commun/ui-confirm.js';

const PLURIEL = { jaune: 'Jaunes', rose: 'Roses' };
const PAQUETS = { classique: 'Classique' };
const COULEUR = /^#[0-9a-f]{6}$/i;
const ICONE_LOUPE = '<svg class="ndc-icone" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="10" cy="10" r="6"></circle><path d="M14.5 14.5 20 20"></path></svg>';

/** Joueurs inscrits (ceux qui ont quitté ne comptent pas). */
const actifs = (e) => (e?.joueurs || []).filter((j) => !j.parti);
/** Données d'un joueur qui changent l'affichage de sa ligne (sert de clé de rendu). */
const cleLigne = (j) => [j.user_id, j.pseudo, j.pret, j.espion, j.invite, j.couleur, j.avatar_url, j.equipe];
/** Couleur du pseudo : celle du profil si valide ; invité en gris. */
const couleurPseudo = (j) => (j.invite ? '#9A968F' : (COULEUR.test(j.couleur || '') ? j.couleur : ''));

/** Raison pour laquelle la partie ne peut pas être lancée (chaîne vide si elle peut l'être). */
function raisonLancement(e) {
  const liste = actifs(e);
  const n = liste.length;
  if (n < 4) return 'Il faut au moins 4 joueurs.';
  // Les joueurs sans équipe complètent la plus petite au lancement (comme le serveur).
  let jaune = liste.filter((j) => j.equipe === 'jaune').length;
  let rose = liste.filter((j) => j.equipe === 'rose').length;
  for (let s = liste.filter((j) => !j.equipe).length; s > 0; s -= 1) { if (jaune <= rose) jaune += 1; else rose += 1; }
  if (jaune < 2 || rose < 2) return 'Chaque équipe a besoin de 2 joueurs : un espion et un agent.';
  const pasPrets = liste.filter((j) => !j.pret).length;
  if (pasPrets) return `Il manque ${pasPrets} joueur${pasPrets > 1 ? 's' : ''} prêt${pasPrets > 1 ? 's' : ''}.`;
  return '';
}

/** Copie un texte ; repli sur une zone de texte et execCommand si l'API presse-papiers est absente. */
async function copierTexte(texte) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(texte); return true; }
  } catch { /* on tente le repli */ }
  const zone = document.createElement('textarea');
  zone.value = texte;
  zone.setAttribute('readonly', '');
  zone.style.position = 'fixed';
  zone.style.opacity = '0';
  document.body.append(zone);
  zone.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  zone.remove();
  return ok;
}

/**
 * Monte la salle d'attente dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object }} ctx contexte de la partie (partie.js).
 * @returns {{ maj(etat: object): void, message(msg: object): void, detruire(): void }}
 */
export function creer(root, ctx) {
  const { code, naviguer, moi, suivi } = ctx;
  const invite = estInvite();
  const ouverts = new Set();          // menus joueur ouverts (gardés entre deux rendus)
  let busy = false;
  let fini = false;
  let lancerBloque = true;
  let dernier = suivi?.etat?.() || null;

  root.innerHTML = `
    <div class="ndc-salle">
      <nav class="ndc-fil" aria-label="Fil d'Ariane" ${invite ? 'hidden' : ''}><a href="/pages/jeux/nom-de-code.html">Nom de code</a> › <span>Salle d'attente</span></nav>
      <div data-zone="hote-msg" hidden></div>

      <div data-zone-adieu hidden class="card ndc-salle-adieu">
        <h2>Tu as quitté la salle</h2>
        <p>Merci d'être passé. Tu peux revenir par le lien d'invitation si la partie n'est pas encore lancée.</p>
      </div>

      <div data-zone-normale class="ndc-salle-corps">
        <div class="ndc-salle-centre">
          <section class="ndc-salle-panneau" aria-labelledby="ndc-salle-titre">
            <div class="ndc-salle-entete">
              <h1 id="ndc-salle-titre" class="ndc-titre ndc-salle-titre">Salle d'attente</h1>
              <p class="ndc-salle-sous">Nom de code · Partage le code pour inviter tes amis.</p>
            </div>

            <div class="ndc-salle-codeligne">
              <div class="ndc-salle-codebloc">
                <span class="ndc-salle-etiq" id="ndc-code-etiq">Code</span>
                <span class="ndc-code ndc-salle-codeaff" aria-labelledby="ndc-code-etiq" data-code></span>
              </div>
              <button type="button" class="btn btn-ghost" data-act="copier">Copier le lien</button>
            </div>
            <div class="ndc-lien" data-lien hidden>
              <label class="ndc-salle-etiq" for="ndc-lien-champ">Lien d'invitation</label>
              <input id="ndc-lien-champ" class="ndc-champ-lien" type="text" readonly data-champ-lien>
            </div>

            <dl class="ndc-reglages" data-zone="reglages"></dl>
            <p class="ndc-salle-bilan" data-bilan aria-live="polite"></p>

            <section class="ndc-salle-actions" aria-labelledby="ndc-actions-titre">
              <h2 id="ndc-actions-titre" class="ndc-salle-sous-titre">Tes actions</h2>
              <div data-zone="actions"></div>
            </section>

            <div class="ndc-lancement" data-zone="lancement"></div>
          </section>

          <section class="ndc-salle-sans" aria-labelledby="ndc-sans-titre">
            <h2 id="ndc-sans-titre" class="ndc-sans-titre">Sans équipe</h2>
            <div data-zone="sans"></div>
          </section>
        </div>

        <section class="ndc-salle-equipe is-jaune" aria-labelledby="ndc-eq-jaune-titre">
          <header class="ndc-eq-tete">
            <h2 id="ndc-eq-jaune-titre" class="ndc-eq-titre">Équipe ${EQUIPES.jaune.nom}</h2>
            <span class="ndc-eq-compte" data-compte="jaune"></span>
          </header>
          <div data-zone="eq-jaune"></div>
        </section>

        <section class="ndc-salle-equipe is-rose" aria-labelledby="ndc-eq-rose-titre">
          <header class="ndc-eq-tete">
            <h2 id="ndc-eq-rose-titre" class="ndc-eq-titre">Équipe ${EQUIPES.rose.nom}</h2>
            <span class="ndc-eq-compte" data-compte="rose"></span>
          </header>
          <div data-zone="eq-rose"></div>
        </section>

        <div class="ndc-salle-chat" data-chat></div>
      </div>
    </div>`;

  const top = root.firstElementChild;
  const q = (sel) => top.querySelector(sel);
  q('[data-code]').textContent = code;
  const chat = creerChat(q('[data-chat]'), { code, moi, suivi });

  /** Réécrit une zone seulement si sa clé a changé. */
  function zone(nom, cle, html) {
    const el = q(`[data-zone="${nom}"]`);
    if (!el || el.dataset.cle === cle) return;
    el.dataset.cle = cle;
    el.innerHTML = html;
  }

  /** Désactive les boutons pendant une action ; le bouton « Lancer » reste bloqué si la partie ne peut pas démarrer. */
  function majOccupe() {
    top.querySelectorAll('button[data-act]').forEach((b) => {
      b.disabled = busy || (b.dataset.act === 'lancer' && lancerBloque);
    });
  }

  /** Ligne d'un joueur (avatar, pseudo, étiquettes, Prêt, menu de l'hôte). */
  function ligneJoueur(j, mon, p) {
    const estMoi = j.user_id === mon.user_id;
    const estHote = j.user_id === p.hote;
    const couleur = couleurPseudo(j);
    const tags = [];
    if (estHote) tags.push('<span class="ndc-tag">Hôte</span>');
    if (estMoi) tags.push('<span class="ndc-tag">Toi</span>');
    if (j.invite) tags.push('<span class="ndc-invite-tag">invité</span>');
    if (j.espion) tags.push(`<span class="ndc-insigne">${ICONE_LOUPE}Espion</span>`);
    const statut = j.pret
      ? '<span class="pill pill-ok ndc-statut">Prêt</span>'
      : '<span class="pill pill-todo ndc-statut">Pas prêt</span>';
    const menu = mon.hote && !estMoi ? menuHote(j) : '';
    return `<li class="ndc-joueur${estMoi ? ' is-moi' : ''}">
      ${avatarHtml({ pseudo: j.pseudo, color: j.invite ? '#3A3A40' : j.couleur, avatar_url: j.avatar_url }, 40)}
      <div class="ndc-joueur-infos"><strong class="ndc-pseudo"${couleur ? ` style="color:${couleur}"` : ''}>${esc(j.pseudo || '?')}</strong>${tags.join('')}</div>
      ${statut}${menu}
    </li>`;
  }

  /** Menu de l'hôte pour un autre joueur : équipe, espion, retirer. */
  function menuHote(j) {
    const bouton = (act, attrs, texte) => `<button type="button" class="ndc-menu-bouton" data-act="${act}" ${attrs}>${esc(texte)}</button>`;
    const id = esc(j.user_id);
    const items = [];
    if (j.equipe !== 'jaune') items.push(bouton('equipe', `data-eq="jaune" data-user="${id}"`, 'Mettre chez les Jaunes'));
    if (j.equipe !== 'rose') items.push(bouton('equipe', `data-eq="rose" data-user="${id}"`, 'Mettre chez les Roses'));
    if (j.equipe) {
      items.push(j.espion
        ? bouton('espion', `data-oui="0" data-user="${id}"`, 'Redevenir agent')
        : bouton('espion', `data-oui="1" data-user="${id}"`, 'Nommer espion'));
    }
    items.push(bouton('exclure', `data-user="${id}" data-pseudo="${esc(j.pseudo)}"`, 'Retirer de la partie'));
    const ouvert = ouverts.has(j.user_id) ? ' open' : '';
    return `<details class="ndc-menu" data-menu="${id}"${ouvert}>
      <summary class="ndc-menu-ouvrir">Gérer<span class="visually-hidden"> ${esc(j.pseudo || '')}</span></summary>
      <div class="ndc-menu-liste">${items.join('')}</div>
    </details>`;
  }

  /** Réglages de la partie (rappel). */
  function rendreReglages(e) {
    const p = e.partie;
    const paquet = PAQUETS[p.paquet] || p.paquet || 'Classique';
    const chrono = `Espion ${p.t_espion} s · ${p.t_equipe ? `Équipe ${p.t_equipe} s` : 'Équipe sans limite'}`;
    const revelation = p.validation === 'libre' ? 'Libre : un clic révèle le mot' : "Majorité de l'équipe";
    zone('reglages', JSON.stringify([paquet, p.t_espion, p.t_equipe, p.validation]), `
      <div><dt>Paquet de mots</dt><dd>${esc(paquet)}</dd></div>
      <div><dt>Chrono</dt><dd>${esc(chrono)}</dd></div>
      <div><dt>Révélation</dt><dd>${esc(revelation)}</dd></div>`);
  }

  /** Bilan : nombre de joueurs, places et prêts. */
  function rendreBilan(e) {
    const liste = actifs(e);
    const n = liste.length;
    const nb = e.partie.nb_places || 0;
    const prets = liste.filter((j) => j.pret).length;
    q('[data-bilan]').textContent = `${n} joueur${n > 1 ? 's' : ''} sur ${nb} place${nb > 1 ? 's' : ''} · ${prets} prêt${prets > 1 ? 's' : ''}`;
  }

  /** Colonne d'une équipe : l'espion en premier, avec son insigne. */
  function rendreEquipe(eq, e) {
    const p = e.partie;
    const mon = e.moi || {};
    const membres = actifs(e).filter((j) => j.equipe === eq);
    const liste = [...membres.filter((j) => j.espion), ...membres.filter((j) => !j.espion)];
    q(`[data-compte="${eq}"]`).textContent = `${membres.length} joueur${membres.length > 1 ? 's' : ''}`;
    const cle = JSON.stringify([liste.map(cleLigne), mon.user_id || null, !!mon.hote, p.hote || null]);
    zone(`eq-${eq}`, cle, liste.length
      ? `<ul class="ndc-liste">${liste.map((j) => ligneJoueur(j, mon, p)).join('')}</ul>`
      : '<p class="ndc-vide">Personne dans cette équipe pour l\'instant.</p>');
  }

  /** Joueurs sans équipe. */
  function rendreSans(e) {
    const p = e.partie;
    const mon = e.moi || {};
    const liste = actifs(e).filter((j) => !j.equipe);
    const cle = JSON.stringify([liste.map(cleLigne), mon.user_id || null, !!mon.hote, p.hote || null]);
    zone('sans', cle, liste.length
      ? `<p class="ndc-sans-note">Pas encore dans une équipe. Chacun peut rejoindre Jaune ou Rose ; sinon, il est placé dans la plus petite équipe au lancement.</p><ul class="ndc-liste">${liste.map((j) => ligneJoueur(j, mon, p)).join('')}</ul>`
      : '<p class="ndc-vide">Tout le monde a une équipe.</p>');
  }

  /** Mes actions : équipe, espion, prêt, quitter. */
  function rendreActions(e) {
    const mon = e.moi || {};
    if (!mon.joue) {
      zone('actions', 'hors', '<p class="ndc-salle-note">Tu regardes la salle. Rejoins la partie pour jouer.</p>');
      return;
    }
    const monPret = !!actifs(e).find((j) => j.user_id === mon.user_id)?.pret;
    const eq = mon.equipe || null;
    const depart = departSalle(e);
    const cle = JSON.stringify([eq, !!mon.espion, monPret, !!mon.hote, depart.ok]);
    const bouton = (classe, act, attrs, texte) => `<button type="button" class="btn ${classe}" data-act="${act}" ${attrs}>${esc(texte)}</button>`;

    const equipes = ['jaune', 'rose'].filter((x) => x !== eq)
      .map((x) => bouton('btn-ghost', 'equipe', `data-eq="${x}"`, `Rejoindre les ${PLURIEL[x]}`));
    if (eq) equipes.push(bouton('btn-ghost', 'equipe', 'data-eq=""', "Quitter l'équipe"));

    const espion = eq
      ? (mon.espion
        ? bouton('btn-ghost', 'espion', 'data-oui="0"', 'Redevenir agent')
        : bouton('btn-ghost', 'espion', 'data-oui="1"', 'Devenir espion'))
      : '<p class="ndc-salle-note">Choisis d\'abord une équipe pour devenir espion.</p>';

    const pret = bouton(monPret ? 'btn-sand' : 'btn-primary', 'pret', `aria-pressed="${monPret}"`, monPret ? 'Je ne suis plus prêt' : 'Je suis prêt');
    const quitter = boutonQuitter(depart.ok, { attrs: 'data-act="quitter"' });

    zone('actions', cle, `
      <div class="ndc-actions-groupe">
        <span class="ndc-salle-etiq">Équipe</span>
        <div class="ndc-actions-liste">${equipes.join('')}</div>
      </div>
      <div class="ndc-actions-groupe">
        <span class="ndc-salle-etiq">Rôle</span>
        ${espion}
      </div>
      <div class="ndc-actions-liste ndc-actions-fin">${pret}${quitter}</div>`);
  }

  /** Bouton « Lancer la partie » (hôte) avec la raison ; pour les autres, une simple phrase. */
  function rendreLancement(e) {
    const mon = e.moi || {};
    if (!mon.hote) {
      lancerBloque = true;
      zone('lancement', 'non-hote', '<p class="ndc-attente-hote">Seul l\'hôte peut lancer la partie.</p>');
      return;
    }
    const raison = raisonLancement(e);
    lancerBloque = !!raison;
    zone('lancement', `hote|${raison}`, `
      <button type="button" class="ndc-lancer" data-act="lancer" aria-describedby="ndc-raison">Lancer la partie</button>
      <p id="ndc-raison" class="ndc-raison">${esc(raison)}</p>
      <button type="button" class="btn btn-ghost ndc-equilibrer" data-act="equilibrer">Équilibrer les équipes</button>`);
  }

  /** Copie le lien d'invitation ; si c'est impossible, il s'affiche à sélectionner à la main. */
  async function copierLien() {
    const lien = `${location.origin}${location.pathname}?code=${encodeURIComponent(code)}`;
    const champ = q('[data-champ-lien]');
    if (await copierTexte(lien)) {
      q('[data-lien]').hidden = true;
      toast('Lien copié', 'ok');
      return;
    }
    champ.value = lien;
    q('[data-lien]').hidden = false;
    champ.focus();
    champ.select();
    toast('Copie impossible. Le lien est affiché, sélectionne-le à la main.', 'error');
  }

  /** Passe la salle en mode « au revoir » (invité qui a quitté). */
  function adieu() {
    fini = true;
    q('[data-zone-normale]').hidden = true;
    q('[data-zone-adieu]').hidden = false;
    chat.detruire();
  }

  /** Exécute une action en la verrouillant ; l'erreur s'affiche en toast. */
  async function essayer(action, b) {
    if (busy) return;
    busy = true;
    majOccupe();
    try { await action(); }
    catch (e) { toast(erreurTexte(e), 'error'); }
    finally {
      busy = false;
      majOccupe();
      suivi?.rafraichir?.();
      if (!fini && b?.isConnected && !b.disabled) b.focus();
    }
  }

  /** Dispatch des boutons (délégation sur la racine de la salle). */
  async function agir(b) {
    const { act, eq, user, oui } = b.dataset;
    if (act === 'copier') return copierLien();
    if (act === 'quitter') {
      if (!await confirmerDepart(departSalle(dernier))) return;
      // Lancée pendant que la fenêtre était ouverte : ce départ-là n'est plus celui que la fenêtre annonçait.
      if ((suivi?.etat?.() || dernier)?.partie?.statut !== 'attente') return;
      return essayer(async () => {
        await ndc.quitter(code);
        if (invite) adieu();
        else naviguer('');
      }, b);
    }
    if (act === 'exclure') {
      if (!await confirmBox(`Retirer ${b.dataset.pseudo || 'ce joueur'} de la partie ?`, '', { ok: 'Retirer', danger: true })) return;
      return essayer(() => ndc.exclure(code, user), b);
    }
    if (act === 'equipe') return essayer(() => ndc.equipe(code, eq || null, user || null), b);
    if (act === 'espion') return essayer(() => ndc.espion(code, oui === '1', user || null), b);
    if (act === 'pret') {
      const monPret = !!dernier?.joueurs?.find((j) => j.user_id === dernier?.moi?.user_id)?.pret;
      return essayer(() => ndc.pret(code, !monPret), b);
    }
    if (act === 'lancer') return essayer(() => ndc.lancer(code), b);
    if (act === 'equilibrer') return essayer(() => ndc.equilibrer(code), b);
  }

  top.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-act]');
    if (!b || b.disabled) return;
    agir(b);
  });
  // Les menus joueur (details) ne bulle pas : on écoute en phase de capture pour retenir s'ils sont ouverts.
  top.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (!d.matches?.('details[data-menu]')) return;
    if (d.open) ouverts.add(d.dataset.menu); else ouverts.delete(d.dataset.menu);
  }, true);

  /** Met la salle à jour avec l'état de la partie. */
  function maj(e) {
    if (fini || !e?.partie) return;
    dernier = e;
    majHoteMsg(q('[data-zone="hote-msg"]'), e);
    rendreReglages(e);
    rendreBilan(e);
    rendreEquipe('jaune', e);
    rendreEquipe('rose', e);
    rendreSans(e);
    rendreActions(e);
    rendreLancement(e);
    chat.maj(e);
    majOccupe();
  }

  if (dernier) maj(dernier);

  return {
    maj,
    /** Message du chat (historique ou temps réel). */
    message(msg) { if (!fini) chat.ajouter(msg); },
    detruire() {
      fini = true;
      try { chat.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
    },
  };
}
