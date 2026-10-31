// ===== Humane Gang — Loup-Garou : écran de fin de partie (statut terminee) =====
/*
 * Rôle : bannière du vainqueur, carte personnelle (rôle final, victoire, Paillettes, MVP), « Qui était qui » par camp,
 * chronologie du journal (Nuit N / Jour N), chiffres de la partie, chat général, puis retour au Loup-Garou ou nouvelle partie.
 * Tous les rôles sont visibles à la fin de la partie (joueurs[].role, joueurs[].camp).
 * Effet de fin (LG1, LG2), une seule fois et seulement si la partie vient de se terminer sous mes yeux (s.vueEnCours) : ciel qui s'éclaire
 *   ou reste sombre, son déjà sur le site, bandeau neutre ; autres vainqueurs : ciel neutre et vrai titre, sans son. Il ne lit que partie.vainqueur, déjà public : même effet pour tous, joueur,
 *   invité ou meneur, aucun rôle, camp ni résultat personnel. Mouvement réduit : pas de ciel ni de bandeau, le son reste.
 * Dépendances : core.js (esc), commun/effets-duels.js, commun/sons-jeux.js,
 *   loup-garou/ui.js (icone, vignetteRole, pastilleCamp, pseudo, avatar, libelleCause, filAriane),
 *   loup-garou/roles.js (roleById, CAMPS), loup-garou/chat.js (monterChat).
 * Exporte : monter.
 */
import { esc } from '../../../commun/core.js';
import { anime, creerEffets, premiereFois } from '../../../commun/effets-duels.js';
import { jouerSonJeu, sonsPrets } from '../../../commun/sons-jeux.js';
import { icone, vignetteRole, pastilleCamp, pseudo, avatar, libelleCause, filAriane } from '../ui.js';
import { roleById, CAMPS } from '../roles.js';
import { monterChat } from '../chat.js';
import { estInvite } from '../api.js';

/** Bannière par vainqueur : ton (clé de CAMPS, ou neutre), icône et titre. */
const BANNIERES = {
  village: { ton: 'village', titre: 'Le village l\'emporte', icone: 'trophee' },
  loups: { ton: 'loups', titre: 'Les loups-garous l\'emportent', icone: 'trophee' },
  loup_blanc: { ton: 'solo', titre: 'Le Loup blanc l\'emporte', icone: 'trophee' },
  flute: { ton: 'solo', titre: 'Le Joueur de flûte l\'emporte', icone: 'trophee' },
  ange: { ton: 'solo', titre: 'L\'Ange l\'emporte', icone: 'trophee' },
  amoureux: { ton: 'solo', titre: 'Les amoureux l\'emportent', icone: 'coeur' },
  personne: { ton: null, titre: 'Personne ne survit', icone: 'croix' },
  annulee: { ton: null, titre: 'Partie arrêtée par le meneur', icone: 'info' },
};

/** Effet de fin : ciel, titre du bandeau, son du groupe « loup-garou » (2 Le jour se lève, 6 Hurlement lointain). */
const EFFET_FIN = {
  village: { ciel: 'jour', titre: 'Le jour se lève', son: 2 },
  loups: { ciel: 'nuit', titre: 'La nuit reste', son: 6, couleur: '#C2606C' },
};
/** Vainqueur sans fiche (solo, amoureux, personne) : ciel neutre, le bandeau reprend le vrai titre de fin, sans son. */
const EFFET_FIN_AUTRE = { ciel: 'neutre' };
const DUREE_CIEL = 2400;

/**
 * Joue l'effet de fin une fois par partie. Partie arrêtée par le meneur : rien.
 * @param {object} fx effets de l'écran (commun/effets-duels.js)
 * @param {object} p partie (seul vainqueur est lu pour le contenu de l'effet)
 */
function effetFin(fx, p) {
  const b = BANNIERES[p.vainqueur];
  if (!b || p.vainqueur === 'annulee' || !premiereFois(`lg-fin:${p.id}`)) return;
  const f = EFFET_FIN[p.vainqueur] || EFFET_FIN_AUTRE;
  if (f.son && sonsPrets()) jouerSonJeu('loup-garou', f.son);
  if (anime()) {
    const ciel = document.createElement('div');
    ciel.className = `lg-fin-ciel ${f.ciel}`;
    fx.vol(ciel, DUREE_CIEL);
  }
  fx.bandeau(f.titre || b.titre, f.titre ? b.titre : '', { ton: 'n', couleur: f.couleur });
}

/** Phases du journal rattachées à la nuit ou au jour (les autres suivent l'étape précédente). */
const PHASES_NUIT = new Set(['nuit_1', 'nuit', 'reveil']);
const PHASES_JOUR = new Set(['debat', 'vote']);
const TYPES_FRISE = new Set(['phase', 'mort', 'vote', 'fin']);

/** Variables de couleur d'un camp (fond, texte, bordure) ; neutre si pas de camp. */
function teinte(camp) {
  const c = CAMPS[camp];
  return c
    ? `--lg-fin-fond:${c.fond};--lg-fin-texte:${c.texte};--lg-fin-bord:${c.bord}`
    : '--lg-fin-fond:var(--surface-2);--lg-fin-texte:var(--muted);--lg-fin-bord:var(--border-strong)';
}

/** Journal filtré et regroupé par Nuit N / Jour N, dans l'ordre de la partie. */
function chronologie(journal) {
  const entrees = (journal || [])
    .filter((e) => TYPES_FRISE.has(e.type))
    .sort((a, b) => Number(a.id) - Number(b.id));
  const groupes = [];
  let courant = null;
  for (const e of entrees) {
    let cle = null;
    if (e.type === 'fin' || e.phase === 'fin') cle = { genre: 'Fin', n: null };
    else if (PHASES_NUIT.has(e.phase)) cle = { genre: 'Nuit', n: e.manche };
    else if (PHASES_JOUR.has(e.phase)) cle = { genre: 'Jour', n: e.manche };
    else if (courant) cle = { genre: courant.genre, n: courant.n };   // chasseur, succession : suit l'étape précédente
    if (!cle || (cle.genre !== 'Fin' && !cle.n)) continue;
    const id = `${cle.genre}-${cle.n}`;
    if (!courant || courant.id !== id) {
      courant = { id, ...cle, entrees: [] };
      groupes.push(courant);
    }
    courant.entrees.push(e);
  }
  return groupes.map((g) => ({ ...g, titre: g.genre === 'Fin' ? 'Fin de partie' : `${g.genre} ${g.n}` }));
}

/** Carte « Tu étais … » (seulement si je joue). */
function carteMoi(e) {
  const moi = e.moi;
  const mon = (e.joueurs || []).find((j) => j.user_id === moi.user_id);
  if (!mon) return '';
  const p = e.partie;
  const ancien = moi.role_initial && moi.role_initial !== moi.role ? roleById(moi.role_initial).nom : null;
  const pailles = mon.paillettes || 0;
  let recompense = '';
  if (estInvite()) {
    recompense = '';   // invité : pas de Paillettes
  } else if (pailles > 0) {
    recompense = `<strong class="lg-fin-pailles">+ ${pailles} ${pailles > 1 ? 'Paillettes' : 'Paillette'}</strong>`;
  } else if ((p.nb_joueurs || 0) < 6) {
    recompense = '<p class="small muted lg-fin-note">Pas de Paillettes pour les parties de moins de 6 joueurs.</p>';
  }
  const issue = mon.gagne
    ? `<span class="lg-pastille lg-fin-issue" style="${teinte('village')}">${icone('coche', 13)}Victoire</span>`
    : `<span class="lg-pastille lg-fin-issue" style="${teinte('loups')}">${icone('croix', 13)}Défaite</span>`;
  const etat = mon.vivant ? 'Survivant·e' : libelleCause(mon.mort_cause, mon.mort_manche);
  return `<section class="lg-fin-carte lg-fin-moi" aria-labelledby="lg-fin-moi-titre">
    <div class="lg-fin-moi-tete">
      ${vignetteRole(moi.role, 72)}
      <div class="lg-fin-moi-texte">
        <h2 id="lg-fin-moi-titre">Tu étais ${esc(roleById(moi.role).nom)}</h2>
        <div class="lg-fin-moi-tags">
          ${issue}
          ${ancien ? `<span class="lg-etiquette">ancien ${esc(ancien)}</span>` : ''}
        </div>
        <p class="lg-fin-camp-txt">Camp ${esc(CAMPS[mon.camp]?.label || '?')} · ${esc(etat)}</p>
      </div>
    </div>
    <div class="lg-fin-tuiles">
      ${recompense ? `<div class="lg-fin-tuile"><span class="lg-fin-tuile-label">Récompense</span>${recompense}</div>` : ''}
      ${p.mvp && p.mvp === moi.user_id ? `<div class="lg-fin-tuile"><span class="lg-fin-tuile-label">Distinction</span><span class="lg-etiquette sable">${icone('etoile', 13)}MVP de la partie</span></div>` : ''}
    </div>
  </section>`;
}

/** Carte « Cette partie » : jours, durée, éliminations, MVP. */
function carteChiffres(e, aussi) {
  const p = e.partie;
  const joueurs = e.joueurs || [];
  const minutes = p.started_at && p.ended_at
    ? Math.max(0, Math.round((new Date(p.ended_at) - new Date(p.started_at)) / 60000))
    : null;
  const eliminations = joueurs.filter((j) => !j.vivant).length;
  const mvp = p.mvp ? joueurs.find((j) => j.user_id === p.mvp) : null;
  return `<section class="lg-fin-carte${aussi ? '' : ' lg-fin-seule'}" aria-labelledby="lg-fin-chiffres-titre">
    <h2 id="lg-fin-chiffres-titre">Cette partie</h2>
    <div class="lg-fin-chiffres">
      <div class="lg-fin-chiffre"><strong>${p.manche || 0}</strong><span>jours</span></div>
      <div class="lg-fin-chiffre"><strong>${minutes ?? '—'}</strong><span>min</span></div>
      <div class="lg-fin-chiffre"><strong>${eliminations}</strong><span>éliminations</span></div>
    </div>
    ${mvp ? `<p class="lg-fin-mvp">${icone('etoile', 18)}<span><strong>MVP :</strong> ${pseudo(mvp)}</span></p>` : ''}
  </section>`;
}

/** Une carte de joueur dans « Qui était qui ». */
function carteJoueur(j, mvp) {
  const r = roleById(j.role);
  const gagnant = j.gagne ? `<span class="lg-fin-gagnant">${icone('coche', 12)}Gagnant</span>` : '';
  const ancien = j.role_initial && j.role_initial !== j.role ? `<span class="lg-etiquette">ancien ${esc(roleById(j.role_initial).nom)}</span>` : '';
  const etat = j.vivant ? 'Survivant·e' : libelleCause(j.mort_cause, j.mort_manche);
  return `<li class="lg-fin-joueur${j.vivant ? '' : ' mort'}">
    ${avatar(j, 40)}
    <div class="lg-fin-joueur-corps">
      <div class="lg-fin-joueur-nom">${pseudo(j)}${j.invite ? '<span class="lg-etiquette">Invité</span>' : ''}${mvp ? '<span class="lg-etiquette sable">MVP</span>' : ''}${gagnant}</div>
      <div class="lg-fin-joueur-role">${vignetteRole(j.role, 28)}<span>${esc(r.nom)}</span>${ancien}</div>
      <p class="lg-fin-joueur-etat">${esc(etat)}</p>
    </div>
  </li>`;
}

/** « Qui était qui » : joueurs groupés par camp final (sections vides masquées). */
function quiEtaitQui(e) {
  const joueurs = e.joueurs || [];
  const mvp = e.partie.mvp;
  const sections = ['village', 'loups', 'solo'].map((camp) => {
    const liste = joueurs.filter((j) => (j.camp || 'village') === camp);
    if (!liste.length) return '';
    return `<section class="lg-fin-camp" aria-label="Camp ${esc(CAMPS[camp].label)}">
      <h3 class="lg-fin-camp-titre">${pastilleCamp(camp, `${CAMPS[camp].label} · ${liste.length}`)}</h3>
      <ul class="lg-fin-joueurs">${liste.map((j) => carteJoueur(j, mvp && j.user_id === mvp)).join('')}</ul>
    </section>`;
  }).join('');
  const centre = Array.isArray(e.partie.centre) ? e.partie.centre : [];
  const cartesCentre = centre.length
    ? `<p class="lg-fin-centre small muted">Cartes restées au centre : ${centre.map((c) => esc(roleById(typeof c === 'string' ? c : c.role).nom)).join(', ')}</p>`
    : '';
  return `<section class="lg-fin-carte" aria-labelledby="lg-fin-qui-titre">
    <h2 id="lg-fin-qui-titre">Qui était qui</h2>
    <div class="lg-fin-camps">${sections}</div>
    ${cartesCentre}
  </section>`;
}

/** Chronologie : frise horizontale défilante sur ordinateur, verticale sur téléphone. */
function frise(e) {
  const groupes = chronologie(e.journal);
  if (!groupes.length) return '<p class="small muted">Aucun événement enregistré.</p>';
  return `<div class="lg-frise" role="region" tabindex="0" aria-label="Chronologie, défilable horizontalement">
    ${groupes.map((g) => `<section class="lg-frise-case ${g.genre === 'Jour' ? 'jour' : g.genre === 'Nuit' ? 'nuit' : 'fin'}">
      <h3 class="lg-frise-titre">${esc(g.titre)}</h3>
      <ul class="lg-frise-liste">${g.entrees.map((x) => `<li${x.type === 'mort' ? ' class="lg-frise-mort"' : ''}>${esc(x.texte)}</li>`).join('')}</ul>
    </section>`).join('')}
  </div>`;
}

/** Corps de l'écran (tout sauf le chat et les boutons, recalculé à chaque changement). */
function corps(e) {
  const p = e.partie;
  const b = BANNIERES[p.vainqueur] || BANNIERES.annulee;
  const fins = (e.journal || []).filter((x) => x.type === 'fin');
  const sousTitre = [fins.at(-1)?.texte, p.manche ? `Jour ${p.manche}` : ''].filter(Boolean).join(' · ');
  const moiJoue = !!e.moi?.joueur;
  return `<section class="lg-fin-banniere" style="${teinte(b.ton)}" aria-labelledby="lg-fin-titre">
      <span class="lg-fin-banniere-ico" aria-hidden="true">${icone(b.icone, 44)}</span>
      <div class="lg-fin-banniere-texte">
        <span class="lg-fin-kicker">Fin de partie</span>
        <h1 id="lg-fin-titre" class="display lg-fin-titre">${esc(b.titre)}</h1>
        ${sousTitre ? `<p class="lg-fin-sous">${esc(sousTitre)}</p>` : ''}
      </div>
    </section>
    <div class="lg-fin-duo${moiJoue ? '' : ' seul'}">
      ${moiJoue ? carteMoi(e) : ''}
      ${carteChiffres(e, moiJoue)}
    </div>
    ${quiEtaitQui(e)}
    <section class="lg-fin-carte" aria-labelledby="lg-fin-frise-titre">
      <h2 id="lg-fin-frise-titre">Chronologie de la partie</h2>
      ${frise(e)}
    </section>`;
}

/**
 * Monte l'écran de fin de partie dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @param {object} s session de partie (partie.js) : code, lg, messages, etat(), …
 * @returns {{ maj(etat:object):void, message(msg:object):void, detruire():void }}
 */
export function monter(root, s) {
  const invite = estInvite();
  // Invité : pas de fil d'Ariane ni de liens vers les pages membres, seulement un message et l'inscription.
  const pied = invite
    ? `<section class="card lg-invite-fin" aria-labelledby="lg-invite-fin-titre">
        <h2 id="lg-invite-fin-titre" class="lg-invite-fin-titre">Merci d'avoir joué !</h2>
        <p>Tu as joué sans compte. Crée ou connecte-toi à ton compte pour garder tes statistiques et tes Paillettes.</p>
        <a class="btn btn-primary" href="/pages/compte/compte.html">Rejoindre le gang</a>
      </section>`
    : `<nav class="lg-fin-actions" aria-label="Après la partie">
        <a class="btn btn-ghost" href="/pages/jeux/loup-garou.html">Retour au Loup-Garou</a>
        <a class="btn btn-primary" href="/pages/jeux/loup-garou.html#creer">Nouvelle partie</a>
      </nav>`;
  root.innerHTML = `<div class="lg-fin">
    ${invite ? '' : filAriane('Fin de partie')}
    <div class="lg-fin-corps"></div>
    <div class="card lg-fin-chat"></div>
    ${pied}
  </div>`;
  const zoneCorps = root.querySelector('.lg-fin-corps');
  const chat = monterChat(root.querySelector('.lg-fin-chat'), s, {
    canaux: () => [{ canal: 'general', ecrire: true }],
    titre: 'Discussion',
  });
  const fx = creerEffets();
  let enDirect = !!s.vueEnCours?.();   // la partie vient de finir sous mes yeux : l'effet se joue au premier état affiché

  return {
    maj(etat) {
      if (!etat?.partie) return;
      // Ambiance : jour si le village gagne, nuit sinon.
      document.body.dataset.lgAmbiance = etat.partie.vainqueur === 'village' ? 'jour' : 'nuit';
      // Le fil de la frise garde sa position de défilement au rafraîchissement.
      const ancienFil = zoneCorps.querySelector('.lg-frise');
      const defilement = ancienFil ? ancienFil.scrollLeft : 0;
      zoneCorps.innerHTML = corps(etat);
      const nouveauFil = zoneCorps.querySelector('.lg-frise');
      if (nouveauFil) nouveauFil.scrollLeft = defilement;
      chat.maj(etat);
      if (enDirect) { enDirect = false; effetFin(fx, etat.partie); }
    },
    message(msg) {
      chat.message(msg);
    },
    detruire() {
      fx.nettoyer();
      try { chat.detruire(); } catch { /* sans effet */ }
      delete document.body.dataset.lgAmbiance;
      root.innerHTML = '';
    },
  };
}
