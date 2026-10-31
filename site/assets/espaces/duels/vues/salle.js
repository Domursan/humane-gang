// ===== Humane Gang — Duels : salle d'attente (duel en statut « attente ») =====
/*
 * Rôle : l'hôte attend que l'autre joueur arrive. Deux cas :
 *   Défi à un membre (partie.defie renseigné) : « En attente de la réponse de X », décompte de l'expiration,
 *     « Annuler le défi » (duel.quitter). Quand le défi expire, on demande au serveur de constater l'échéance (duel.avancer).
 *   Code à partager : le code en grand, « Copier le lien » (/pages/jeux/duels.html?code=CODE), réglages du duel, « Annuler ».
 * Quand l'adversaire rejoint, le statut passe à en_cours : partie.js change de vue tout seul, et la salle lance en se fermant le
 * départ (SA3 : 3, 2, 1, S20, bandeau « Bruno a rejoint », titre d'onglet). Pas de chat ici.
 * Contrat (vues/partie.js) : export function creer(root, ctx) → { maj(etat), message(msg), detruire() }, ctx = { code, naviguer, moi, suivi }.
 * Dépendances : core.js (esc, toast), duels/api.js (duel, erreurTexte, JEUX), commun/effets-duels.js (departPartie, premiereFois),
 *   ./fin-fx.js (vuEnAttente : le refus ou l'expiration d'un défi vu ici sonne sur l'écran de fin).
 * Exporte : creer.
 */
import { esc, toast } from '../../../commun/core.js';
import { duel, erreurTexte, JEUX } from '../api.js';
import { departPartie, premiereFois } from '../../../commun/effets-duels.js';
import { vuEnAttente } from './fin-fx.js';

const FORMATS = { 1: '1 manche', 3: 'Au meilleur des 3', 5: 'Au meilleur des 5' };

/** Réglages du duel en liste (défini par l'hôte, lecture seule). */
function reglagesHtml(p) {
  const variante = JEUX[p.jeu]?.variantes.find(([id]) => id === p.variante)?.[1] || p.variante || '';
  const items = [['Jeu', p.nom], ['Variante', variante], ['Format', FORMATS[p.format] || `${p.format} manches`], ['Temps par coup', `${p.t_coup} s`]];
  if (!p.defie) {
    items.push(['Partie', p.visibilite === 'publique' ? 'Publique : les membres peuvent regarder' : 'Privée']);
    items.push(['Invités', p.invites ? 'Acceptés' : 'Refusés']);
  }
  return `<dl class="duels-salle-reglages">${items.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
}

/**
 * Crée la salle d'attente dans root.
 * @param {HTMLElement} root zone de la vue (vidée puis remplie).
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object }} ctx contexte fourni par vues/partie.js.
 * @returns {{ maj: Function, message: Function, detruire: Function }}
 */
export function creer(root, ctx) {
  const { code, naviguer, suivi } = ctx;
  let etat = null;
  let occupe = false;
  let avanceDemandee = false;
  const lien = () => new URL(`/pages/jeux/duels.html?code=${encodeURIComponent(code)}`, location.href).href;

  /** Décompte de l'expiration du défi. Demande au serveur de constater l'échéance une seule fois. */
  function majCompte() {
    const el = root.querySelector('[data-compte]');
    if (!el || !etat?.partie?.defi_expire) return;
    const reste = suivi?.secondesRestantes(etat.partie.defi_expire);
    if (reste === null || reste === undefined) return;
    if (reste <= 0) {
      el.textContent = 'Le défi a expiré.';
      if (!avanceDemandee) {
        avanceDemandee = true;
        duel.avancer(code).then(() => suivi?.rafraichir()).catch(() => { /* le suivi réessaie */ });
      }
      return;
    }
    el.textContent = `Le défi expire dans ${Math.floor(reste / 60)}:${String(reste % 60).padStart(2, '0')}`;
  }

  /** Affiche la salle selon le mode (défi ou code) et branche les boutons. */
  function rendre(e) {
    const p = e.partie;
    if (p.defie) {
      root.innerHTML = `<section class="card duels-salle" aria-labelledby="salle-titre">
        <h1 id="salle-titre" class="duels-titre">Défi envoyé</h1>
        <p class="duels-salle-attente" role="status">En attente de la réponse de <strong>${esc(e.defie_pseudo || 'ton adversaire')}</strong></p>
        <p class="duels-decompte" data-compte></p>
        ${reglagesHtml({ ...p, defie: true })}
        <button type="button" class="btn btn-ghost duels-pleine" data-annuler>Annuler le défi</button>
      </section>`;
    } else {
      root.innerHTML = `<section class="card duels-salle" aria-labelledby="salle-titre">
        <h1 id="salle-titre" class="duels-titre">Ton duel attend</h1>
        <p class="duels-salle-attente">Partage ce code. Le duel démarre quand quelqu'un le rejoint.</p>
        <p class="duels-salle-code duels-code" aria-label="Code du duel : ${esc(code)}">${esc(code)}</p>
        <div class="duels-salle-lien-bloc">
          <button type="button" class="btn btn-primary" data-copier>Copier le lien</button>
          <p class="muted small duels-salle-lien">${esc(lien())}</p>
        </div>
        ${reglagesHtml({ ...p, defie: false })}
        <button type="button" class="btn btn-ghost duels-pleine" data-annuler>Annuler</button>
      </section>`;
      root.querySelector('[data-copier]').addEventListener('click', copier);
    }
    root.querySelector('[data-annuler]').addEventListener('click', annuler);
    majCompte();
  }

  /** Copie le lien d'invitation (repli : le lien reste affiché pour une copie à la main). */
  async function copier() {
    try {
      await navigator.clipboard.writeText(lien());
      toast('Lien copié.', 'ok');
    } catch {
      toast('Copie impossible. Copie le lien affiché.', 'error');
    }
  }

  /** Annule le défi ou le duel en attente, puis revient à l'accueil des duels. */
  async function annuler(ev) {
    if (occupe) return;
    const bouton = ev.currentTarget;
    occupe = true;
    bouton.disabled = true;
    try {
      await duel.quitter(code);
      naviguer('');
    } catch (err) {
      occupe = false;
      bouton.disabled = false;
      toast(erreurTexte(err), 'error');
    }
  }

  const tic = setInterval(majCompte, 500);

  return {
    /** Nouvel état : redessine la salle (le décompte se met à jour tout seul). */
    maj(e) {
      etat = e;
      vuEnAttente(e.partie);
      rendre(e);
    },
    /** Pas de chat dans la salle d'attente. */
    message() {},
    detruire() {
      clearInterval(tic);
      root.innerHTML = '';
      // Fermée parce que l'adversaire vient de rejoindre : le départ se joue par-dessus la table.
      const e = suivi?.etat?.();
      if (e?.partie?.statut === 'en_cours' && e.moi?.joue && premiereFois(`depart:${e.partie.id}`)) {
        const autre = (e.joueurs || []).find((j) => j.user_id !== e.moi.user_id);
        departPartie(autre ? `${autre.pseudo || '?'} a rejoint` : 'Bonne partie');
      }
    },
  };
}
