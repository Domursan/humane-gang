// ===== Humane Gang — Nom de code : fin de partie (statut « terminee » ou « annulee ») =====
/*
 * Rôle : titre selon le résultat (et mon équipe), raison de la fin, carte secrète complète 5 × 5 (mots trouvés
 * marqués d'une coche), mes Paillettes et mes badges (membres seulement), historique des indices par équipe,
 * équipes avec rôle, mots trouvés et Paillettes, puis revanche ou retour. Le chat reste ouvert en dessous.
 * Effets, joués une seule fois quand la partie vient de se terminer pendant que je la suis (la table précédente
 *   a vu une partie en cours, reçue via ctx.avant) :
 *   assassin, mon équipe l'a touché → flash rouge, secousse, bannière « Partie perdue », son ;
 *   assassin, l'autre équipe l'a touché (ou spectateur) → son, puis son de victoire, bandeau selon l'équipe, confettis (ND2) ;
 *   mon équipe perd sans assassin → bandeau sobre et son (ND1) ;
 *   victoire → confettis, titre qui brille, bannière, son, pour l'équipe gagnante (ou un spectateur).
 *   Le résultat vient de partie.vainqueur et de moi.equipe, comme le titre de l'écran : le joueur parti garde celui de son équipe.
 * Dépendances : core.js (esc, avatarHtml, toast), commun/effets-duels.js, nom-de-code/api.js (ndc, erreurTexte, estInvite, EQUIPES),
 *   vues/chat.js (creerChat), vues/effets.js (effets visuels et sons).
 * Exporte : creer.
 */
import { esc, avatarHtml, toast } from '../../../commun/core.js';
import { creerEffets, premiereFois, son as sonCommun } from '../../../commun/effets-duels.js';
import { ndc, erreurTexte, estInvite, EQUIPES } from '../api.js';
import { creerChat } from './chat.js';
import { son, banniere, flashRouge, secouer, confettis, brille, arreterEffets } from './effets.js';

const ICONE_COCHE = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F2EFEA" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"></path></svg>';
const ICONE_OEIL = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle><path d="M3 3l18 18"></path></svg>';
const ICONE_TETE = '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a9 9 0 0 0-9 9c0 3.2 1.7 5.6 4 6.7V21h2v-2h2v2h2v-2h2v2h2v-3.3c2.3-1.1 4-3.5 4-6.7a9 9 0 0 0-9-9z"></path></svg>';
const ICONE_MEDAILLE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3A2D10" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"></circle><path d="M8.5 14 7 22l5-2.5 5 2.5-1.5-8"></path></svg>';

/** Mise en forme de chaque couleur de carte (libellé texte, classe de couleur, icône). */
const COULEURS = {
  jaune: { lib: 'Jaune', cls: 'is-jaune', icone: '' },
  rose: { lib: 'Rose', cls: 'is-rose', icone: '' },
  neutre: { lib: 'Neutre', cls: 'is-neutre', icone: ICONE_OEIL },
  assassin: { lib: 'Assassin', cls: 'is-assassin', icone: ICONE_TETE },
};

/** Couleur de pseudo (profil ; invités en gris). */
const couleurPseudo = (j) => (j.invite ? '#9A968F' : (/^#[0-9a-f]{6}$/i.test(j.couleur || '') ? j.couleur : '#F2EFEA'));
/** Équipe adverse. */
const autre = (eq) => (eq === 'jaune' ? 'rose' : 'jaune');
/** Nom affiché d'une équipe. */
const nomEq = (eq) => EQUIPES[eq]?.nom || '';
/** Nom d'une équipe au pluriel. */
const nomPluriel = (eq) => (eq === 'rose' ? 'Roses' : 'Jaunes');

/** Confettis de l'équipe qui gagne sur l'assassin de l'autre (ND2). */
const CONFETTIS_ASSASSIN = ['#F2B71F', '#FFD970', '#F1EFE9'];
/** Délai entre le son de l'assassin et celui de la victoire (ND2). */
const DELAI_VICTOIRE = 900;

/** Clé de rendu : on ne réécrit une zone que si son HTML a changé (les boutons gardent leur état). */
function zone(el, html) {
  if (!el || el.dataset.cle === html) return;
  el.dataset.cle = html;
  el.innerHTML = html;
}

/**
 * Monte l'écran de fin dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {{ code: string, naviguer: Function, moi: object, suivi: object }} ctx contexte de la partie (partie.js).
 * @returns {{ maj(etat: object): void, message(msg: object): void, detruire(): void }}
 */
export function creer(root, ctx) {
  const { code, naviguer, suivi } = ctx;
  const avant = ctx.avant || null;             // dernier état vu avant la fin (partie.js), null si on arrive directement
  const invite = estInvite();
  let fini = false;
  let busy = false;

  root.innerHTML = `
    <div class="ndc-fin">
      <nav class="ndc-fil ndc-fin-fil" aria-label="Fil d'Ariane" ${invite ? 'hidden' : ''}><a href="/pages/jeux/nom-de-code.html">Nom de code</a> › <span>Fin de partie</span></nav>

      <div class="ndc-fin-entete" data-zone="entete"></div>

      <div class="ndc-fin-grille">
        <div class="ndc-fin-gauche">
          <section class="card ndc-fin-panneau" aria-labelledby="ndc-fin-carte-titre">
            <h2 id="ndc-fin-carte-titre" class="ndc-fin-h2">Carte secrète</h2>
            <div data-zone="cartes"></div>
          </section>
          <div class="ndc-fin-actions" data-zone="actions"></div>
        </div>

        <div class="ndc-fin-cote">
          <section class="card ndc-fin-panneau ndc-fin-gain" aria-labelledby="ndc-fin-gain-titre" ${invite ? 'hidden' : ''}>
            <h2 id="ndc-fin-gain-titre" class="ndc-fin-h2">Tu gagnes</h2>
            <div data-zone="gain"></div>
          </section>
          <section class="card ndc-fin-panneau" aria-labelledby="ndc-fin-hist-titre">
            <h2 id="ndc-fin-hist-titre" class="ndc-fin-h2">Historique des indices</h2>
            <div data-zone="historique"></div>
          </section>
        </div>
      </div>

      <div class="ndc-fin-equipes" data-zone="equipes"></div>

      <section class="ndc-fin-chat" aria-label="Discussion"><div data-zone="chat"></div></section>
    </div>`;

  const q = (sel) => root.querySelector(sel);
  const zEntete = q('[data-zone="entete"]');
  const zCartes = q('[data-zone="cartes"]');
  const zGain = q('[data-zone="gain"]');
  const zHistorique = q('[data-zone="historique"]');
  const zEquipes = q('[data-zone="equipes"]');
  const zActions = q('[data-zone="actions"]');

  // Le chat vit dans son propre élément : il est créé une seule fois et reçoit maj / ajouter.
  const chat = creerChat(q('[data-zone="chat"]'), { code, moi: ctx.moi });
  const fx = creerEffets();

  // ----- Actions -----
  async function rejouer(btn) {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      const nouveau = await ndc.rejouer(code);
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

  // ----- Titre et raison -----
  /** Titre (HTML), classe de couleur du titre et sous-titre selon le résultat et la raison. */
  function entete(e) {
    const p = e.partie;
    const moi = e.moi || {};
    const joueurs = e.joueurs || [];
    const v = EQUIPES[p.vainqueur] ? p.vainqueur : null;
    let titre = esc('Partie terminée');
    let classe = '';
    let sous = '';

    if (p.statut === 'annulee') {
      titre = esc('Partie arrêtée');
      sous = 'La partie a été arrêtée.';
    } else if (v) {
      classe = `is-${v}`;
      if (moi.equipe) {
        titre = esc(moi.equipe === v ? 'Ton équipe gagne !' : 'Ton équipe perd');
      } else {
        titre = `${esc("Victoire de l'équipe")} <span class="ndc-fin-team is-${v}">${esc(nomEq(v))}</span> !`;
      }
      if (p.raison === 'mots') {
        const perd = autre(v);
        const t = p.totaux || {};
        const r = p.restants || {};
        const trouvesPerd = (t[perd] ?? 0) - (r[perd] ?? 0);
        sous = `L'équipe ${nomEq(v)} a trouvé tous ses mots. L'équipe ${nomEq(perd)} en trouve ${trouvesPerd}`
          + (typeof t[perd] === 'number' ? ` sur ${t[perd]}.` : '.');
      } else if (p.raison === 'assassin') {
        const nom = joueurs.find((j) => j.user_id === p.assassin)?.pseudo || 'Quelqu\'un';
        sous = `${nom} a révélé l'assassin.`;
      } else if (p.raison === 'forfait') {
        if (!moi.equipe) sous = `L'équipe ${nomEq(autre(v))} n'avait plus assez de joueurs.`;
        else sous = moi.equipe === v ? 'L\'autre équipe n\'avait plus assez de joueurs.' : 'Ton équipe n\'avait plus assez de joueurs.';
      } else if (p.raison === 'arret') {
        sous = 'La partie a été arrêtée.';
      }
    }
    return { titre, classe, sous };
  }

  function rendreEntete(e) {
    const p = e.partie;
    const { titre, classe, sous } = entete(e);
    zone(zEntete, `
      <h1 class="ndc-fin-titre ${classe}">${titre}</h1>
      ${sous ? `<p class="ndc-fin-sous">${esc(sous)}</p>` : ''}
      <p class="ndc-fin-meta">${esc(p.nom || 'Partie')} · <span class="ndc-code">${esc(code)}</span></p>`);
  }

  // ----- Carte secrète complète -----
  function rendreCartes(e) {
    const cartes = [...(e.cartes || [])].sort((a, b) => a.pos - b.pos);
    const items = cartes.map((c) => {
      const info = COULEURS[c.couleur] || { lib: 'Inconnue', cls: 'is-inconnue', icone: '' };
      const trouve = !!c.revelee;
      return `<li class="ndc-fin-mot ${info.cls}${trouve ? ' is-trouve' : ''}">
        <span class="ndc-fin-mot-in">
          <span class="ndc-fin-camp">${info.icone}<span>${esc(info.lib)}</span></span>
          <span class="ndc-fin-plaque">${esc(c.mot)}</span>
        </span>
        ${trouve ? `<span class="ndc-fin-coche" aria-hidden="true">${ICONE_COCHE}</span>` : ''}
        <span class="visually-hidden">${trouve ? 'trouvé' : 'non trouvé'}</span>
      </li>`;
    }).join('');
    zone(zCartes, `<ul class="ndc-fin-cartes" role="list" aria-label="Carte secrète">${items}</ul>`);
  }

  // ----- Mes Paillettes et mes badges (membres seulement) -----
  function rendreGain(e) {
    if (invite) { zone(zGain, ''); return; }
    const moi = e.moi || {};
    const mon = (e.joueurs || []).find((j) => j.user_id === moi.user_id);
    const pailles = Number(mon?.paillettes || 0);
    const badges = e.badges || [];
    const paillettesHtml = pailles > 0
      ? `<span class="ndc-fin-gain-pailles">+${esc(pailles)} PAILLETTES</span>`
      : '<p class="ndc-fin-note">Aucune Paillette cette fois.</p>';
    const badgesHtml = badges.length
      ? `<ul class="ndc-fin-badges" aria-label="Badges débloqués">${badges.map((b) =>
        `<li class="ndc-fin-badge"><span class="ndc-fin-medaille" aria-hidden="true">${ICONE_MEDAILLE}</span>Badge « ${esc(b.nom)} »</li>`).join('')}</ul>`
      : '';
    zone(zGain, `${paillettesHtml}${badgesHtml}`);
  }

  // ----- Historique des indices par équipe -----
  function rendreHistorique(e) {
    const indices = e.indices || [];
    const joueurs = e.joueurs || [];
    const bloc = (eq) => {
      const liste = indices.filter((i) => i.equipe === eq);
      const items = liste.length ? liste.map((i) => {
        const nombre = Number(i.nombre) === 0 ? 'illimité' : esc(i.nombre);
        const mots = Array.isArray(i.mots) && i.mots.length ? esc(i.mots.join(', ')) : 'aucun mot';
        const espion = joueurs.find((j) => j.user_id === i.espion)?.pseudo || '';
        return `<li><strong>${esc(i.mot)}</strong> · ${nombre} → ${mots}`
          + (espion ? ` <span class="ndc-fin-par">par ${esc(espion)}</span>` : '')
          + '</li>';
      }).join('') : '<li class="ndc-fin-vide">Aucun indice.</li>';
      return `<div class="ndc-fin-hist-eq">
        <h3 class="ndc-fin-eq-titre is-${eq}">Équipe ${esc(nomEq(eq))}</h3>
        <ul class="ndc-fin-hist-liste">${items}</ul>
      </div>`;
    };
    zone(zHistorique, bloc('jaune') + bloc('rose'));
  }

  // ----- Équipes : rôle, mots trouvés, Paillettes (jamais pour un invité) -----
  function rendreEquipes(e) {
    const joueurs = e.joueurs || [];
    const colonne = (eq) => {
      const liste = joueurs.filter((j) => j.equipe === eq);
      const lignes = liste.map((j) => {
        const trouves = Number(j.trouves || 0);
        const pailles = !invite && !j.invite && Number(j.paillettes || 0) > 0
          ? `<span class="ndc-fin-pl">+${esc(j.paillettes)} Paillettes</span>`
          : '';
        return `<li class="ndc-fin-joueur">
          ${avatarHtml({ pseudo: j.pseudo, color: j.invite ? '#3A3A40' : j.couleur, avatar_url: j.avatar_url }, 36)}
          <span class="ndc-fin-joueur-nom">
            <strong style="color:${couleurPseudo(j)}">${esc(j.pseudo || '?')}</strong>
            ${j.invite ? '<span class="ndc-invite-tag">invité</span>' : ''}
            ${j.parti ? '<span class="ndc-invite-tag">parti</span>' : ''}
          </span>
          <span class="ndc-fin-role${j.espion ? ' is-espion' : ''}">${j.espion ? 'Espion' : 'Agent'}</span>
          <span class="ndc-fin-stat">${trouves} ${trouves > 1 ? 'mots trouvés' : 'mot trouvé'}</span>
          ${pailles}
        </li>`;
      }).join('');
      return `<section class="card ndc-fin-panneau" aria-labelledby="ndc-fin-eq-${eq}">
        <h2 id="ndc-fin-eq-${eq}" class="ndc-fin-eq-titre is-${eq}">Équipe ${esc(nomEq(eq))}</h2>
        ${lignes ? `<ul class="ndc-fin-liste">${lignes}</ul>` : '<p class="small muted">Personne dans cette équipe.</p>'}
      </section>`;
    };
    zone(zEquipes, colonne('jaune') + colonne('rose'));
  }

  // ----- Revanche ou retour -----
  function rendreActions(e) {
    const suite = e.partie.suite || null;
    let html = '';
    if (suite) {
      html += `<a class="btn btn-primary" href="/pages/jeux/nom-de-code.html#rejoindre/${encodeURIComponent(suite)}">Rejoindre la revanche</a>`;
    } else if (!invite) {
      html += '<button type="button" class="btn btn-primary" data-rejouer>Revanche</button>';
    }
    if (!invite) {
      html += '<a class="btn btn-ghost" href="/pages/jeux/nom-de-code.html">Retour à Nom de code</a>'
        + '<a class="btn btn-ghost" href="/pages/jeux/nom-de-code.html#stats">Mes statistiques</a>';
    }
    zone(zActions, html);
  }

  function maj(e) {
    if (fini || !e?.partie) return;
    rendreEntete(e);
    rendreCartes(e);
    rendreGain(e);
    rendreHistorique(e);
    rendreEquipes(e);
    rendreActions(e);
    chat?.maj(e);
  }

  /**
   * Effets de la fin, une seule fois, seulement si la partie vient de se terminer sous mes yeux
   * (dernier état vu avant = partie en cours). Voir l'en-tête du fichier.
   * @param {object} e état de la fin.
   */
  function effetsFin(e) {
    if (avant?.partie?.statut !== 'en_cours' || !e?.partie) return;
    const p = e.partie;
    const moi = e.moi || {};
    const v = EQUIPES[p.vainqueur] ? p.vainqueur : null;
    if (!v || !premiereFois(`ndc-fin:${p.id}`)) return;
    const perdu = !!moi.equipe && moi.equipe !== v;
    if (p.raison === 'assassin' && perdu) {
      son(4);
      flashRouge();
      secouer(root.querySelector('.ndc-fin-cartes'));
      banniere('Assassin !', 'Partie perdue', 'rouge');
    } else if (p.raison === 'assassin') {
      son(4);
      fx.plus(() => {
        son(5);
        fx.bandeau('Assassin !', moi.equipe ? 'Ton équipe gagne' : `Victoire des ${nomPluriel(v)}`, { ton: 'n' });
        fx.confettis(CONFETTIS_ASSASSIN);
      }, DELAI_VICTOIRE);
    } else if (perdu) {
      sonCommun('S02');
      const sous = p.raison === 'mots' ? `Les ${nomPluriel(v)} ont trouvé tous leurs mots` : 'Ton équipe n’avait plus assez de joueurs';
      fx.bandeau('Ton équipe perd', sous, { ton: 'd' });
    } else {
      son(5);
      confettis();
      brille(root.querySelector('.ndc-fin-titre'));
      banniere(`Victoire des ${nomPluriel(v)}`, `Bravo à l’équipe ${nomEq(v).toLowerCase()}`, v);
    }
  }

  const etatInitial = suivi.etat();
  maj(etatInitial);
  effetsFin(etatInitial);

  return {
    maj,
    message(msg) {
      if (fini) return;
      chat?.ajouter(msg);
    },
    detruire() {
      fini = true;
      fx.nettoyer();
      arreterEffets();
      try { chat?.detruire(); } catch { /* sans effet */ }
      root.innerHTML = '';
    },
  };
}
