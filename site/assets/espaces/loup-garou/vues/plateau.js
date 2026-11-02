// ===== Humane Gang — Loup-Garou : écran de partie en cours, côté joueur (plateau) =====
/*
 * Rôle : le plateau pendant la partie. Bandeau de phase et minuteur, table autour du feu, panneau d'action
 * (actions.js), annonce du matin, rôle et rôles restants, chat (chat.js), journal, et l'écran ensanglanté
 * quand on meurt. Le HTML n'est réécrit que si son contenu change (pas de saut de page toutes les 4 s).
 * Thème du rôle (version « Horizon ») : couleur d'accent, emblème en filigrane derrière la table, motif dans le panneau
 *   d'action, devise sur la carte du rôle et paysage dessiné en bas de page (themes.js).
 * Signal « à toi de jouer » (son + titre d'onglet) : commun/tour-signal.js, branché sur doitAgir (actions.js).
 * Effets (vues/effets.js) : passage nuit / jour, victime à l'aube, votes en jetons, « Éliminé », carte de la voyante,
 * surlignage du panneau « à toi ». Déclenchés par la différence avec l'état précédent (jamais au premier état reçu).
 * Dépendances : core.js (esc), ui.js, table.js, chat.js, roles.js, themes.js, actions.js, api.js (erreurTexte), commun/tour-signal.js,
 *   effets.js.
 * Exporte : monter.
 */
import { esc } from '../../../commun/core.js';
import { icone, pseudo, vignetteRole, pastilleCamp, chrono, libellePhase, estNuit, libelleCause, notifier } from '../ui.js';
import { tableHtml } from '../table.js';
import { monterChat } from '../chat.js';
import { creerSignalTour } from '../../../commun/tour-signal.js';
import { roleById } from '../roles.js';
import { themeDe, imagesTheme } from '../themes.js';
import { erreurTexte } from '../api.js';
import { creerEffets } from './effets.js';
import { meneurPartiHtml } from '../../../commun/hote-msg.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';
import {
  typeAction, choisissable, badgesCible, comptesVote, panneauAction, choisir, executer, LIENS, doitAgir,
} from './actions.js';

const TITRE_MORT = {
  loups: 'Tu as été dévoré·e',
  vote: 'Tu as été éliminé·e au vote',
  poison: 'Tu as été empoisonné·e',
  chagrin: 'Tu es mort·e de chagrin',
  chasseur: 'Tu as été abattu·e par le Chasseur',
  loup_blanc: 'Tu as été dévoré·e par le Loup blanc',
  meneur: 'Tu as été éliminé·e par le meneur',
};

const SQUELETTE = `<div class="lg-pl" data-ambiance="nuit">
  <div class="lg-pl-horizon" data-ref="horizon" aria-hidden="true"></div>
  <section class="lg-pl-carte lg-pl-bandeau" aria-label="Étape en cours">
    <div class="lg-pl-phase">
      <span class="lg-pl-lueur" data-ref="lueur" aria-hidden="true"></span>
      <div class="lg-pl-phase-texte">
        <h1 class="lg-pl-titre" data-ref="titre"></h1>
        <p class="lg-pl-sous" data-ref="sous"></p>
      </div>
    </div>
    <div class="lg-pl-temps">
      <span class="lg-pl-temps-l" data-ref="tlabel">Temps restant</span>
      <span class="lg-pl-chrono" data-ref="chrono" role="timer">--:--</span>
    </div>
    <div class="lg-pl-barre" role="progressbar" aria-label="Temps restant" aria-valuemin="0" data-ref="barre"><span data-ref="fill"></span></div>
  </section>
  <div class="lg-pl-table"><img class="lg-pl-embleme" data-ref="embleme" alt="" aria-hidden="true" hidden><div class="lg-pl-table-corps" data-ref="table"></div></div>
  <div class="lg-pl-colonne">
    <div class="lg-pl-annonce-zone" data-ref="annonce"></div>
    <div data-ref="meneur-parti" hidden></div>
    <div class="lg-pl-action-zone" data-ref="action"></div>
    <section class="lg-pl-carte lg-pl-role" aria-labelledby="lg-pl-role-t">
      <h2 id="lg-pl-role-t" class="lg-pl-h">Ton rôle</h2>
      <div data-ref="role"></div>
    </section>
    <section class="lg-pl-carte lg-pl-restants" aria-labelledby="lg-pl-rest-t">
      <h2 id="lg-pl-rest-t" class="lg-pl-h">Rôles restants</h2>
      <ul class="lg-pl-restes" data-ref="restants"></ul>
    </section>
  </div>
  <div class="lg-pl-chat lg-pl-carte" data-ref="chat"></div>
  <section class="lg-pl-carte lg-pl-journal" aria-labelledby="lg-pl-jour-t">
    <h2 id="lg-pl-jour-t" class="lg-pl-h">Journal</h2>
    <div class="lg-pl-journal-corps" data-ref="journalCorps"><ol class="lg-pl-journal-liste" data-ref="journal"></ol></div>
  </section>
</div>`;

/** Sous-titre de l'étape. */
function sousTitre(e) {
  const t = typeAction(e);
  switch (e.partie.phase) {
    case 'nuit_1':
    case 'nuit':
      if (t === 'devorer') return 'Les loups choisissent leur victime';
      return t ? 'Tu es réveillé·e : agis en silence' : 'Le village dort';
    case 'reveil': return 'Certains se réveillent encore avant l’aube';
    case 'debat': return 'Débattez, puis votez';
    case 'vote': return 'Votez pour éliminer un suspect';
    case 'chasseur': return 'Le Chasseur tire avant de mourir';
    case 'succession': return 'Le Capitaine désigne son successeur';
    default: return '';
  }
}

/** Salons visibles selon l'état (la base ne renvoie de toute façon que ce qui est permis). */
function canauxPour(e) {
  const m = e?.moi || {};
  const nuit = estNuit(e?.partie);
  const vivant = !!m.vivant;
  const liste = [{
    canal: 'general',
    ecrire: vivant && !nuit,
    raison: !vivant ? 'Les morts ne parlent plus ici' : (nuit ? 'Le village dort' : ''),
  }];
  if (m.camp === 'loups') {
    liste.push({ canal: 'loups', ecrire: vivant && nuit, raison: !vivant ? 'Tu es mort·e' : (nuit ? '' : 'Les loups parlent la nuit') });
  } else if (m.role === 'petite-fille' && nuit) {
    liste.push({ canal: 'loups', ecrire: false, raison: 'Tu espionnes en silence' });
  }
  if (m.allies?.some((a) => a.lien === 'famille')) {
    liste.push({ canal: 'famille', ecrire: vivant, raison: vivant ? '' : 'Tu es mort·e' });
  }
  if (!vivant) liste.push({ canal: 'morts', ecrire: true, raison: '' });
  return liste;
}

/** Annonce du matin (phase débat) : morts de la manche, ou personne. */
function htmlAnnonce(e) {
  const p = e.partie;
  if (p.phase !== 'debat') return '';
  const morts = (e.journal || []).filter((x) => x.type === 'mort' && x.manche == p.manche);
  const corps = morts.length
    ? morts.map((x) => `<p>${esc(x.texte)}</p>`).join('')
    : "<p>Personne n'est mort cette nuit.</p>";
  return `<section class="lg-pl-annonce" aria-labelledby="lg-pl-annonce-t"><h2 id="lg-pl-annonce-t" class="lg-pl-h">Ce matin</h2>`
    + `<div class="lg-pl-annonce-corps">${corps}</div></section>`;
}

/** Table : les sièges, les voix et le texte au centre. */
function htmlTable(e, sel) {
  const p = e.partie;
  const nuit = estNuit(p);
  const t = typeAction(e);
  let centre = '';
  if (nuit) centre = 'Le village dort';
  else if (p.phase === 'debat') centre = 'Le village débat';
  else if (p.phase === 'vote') {
    const c = comptesVote(e);
    const n = c.votants.size;
    centre = `${n} vote${n > 1 ? 's' : ''} sur ${c.eligibles.length}`;
  }
  const victime = t === 'sorciere' ? e.moi?.action?.victime : null;
  return tableHtml(e.joueurs || [], {
    ambiance: nuit ? 'nuit' : 'jour',
    moi: e.moi?.user_id,
    cible: sel.cible || null,
    anneau: nuit ? '#7E93C9' : '#E2C77E',
    choisissable: (j) => choisissable(e, sel, j),
    votes: badgesCible(e),
    aToi: doitAgir(e) ? e.moi?.user_id : null,
    centre,
    sous: victime ? (j) => (j.user_id === victime ? '<span class="lg-etiquette ambre">Victime</span>' : '') : undefined,
  });
}

/** Carte « Ton rôle » : vignette, camp, alliés, envoûtement. */
function htmlRole(e) {
  const m = e.moi;
  const r = roleById(m.role);
  const alliés = (m.allies || []).map((a) => {
    const j = (e.joueurs || []).find((x) => x.user_id === a.user_id) || { pseudo: a.pseudo };
    const lien = a.role ? roleById(a.role).nom : (LIENS[a.lien] || '');
    return `<li>${pseudo(j)} <span class="small muted">· ${esc(lien)}</span></li>`;
  }).join('');
  return `<div class="lg-pl-role-tete">${vignetteRole(r.id, 56)}<div>`
    + `<p class="lg-pl-role-nom">${esc(r.nom)}</p>${pastilleCamp(r.camp)}</div></div>`
    + (themeDe(r.id)?.devise ? `<p class="lg-pl-devise">${esc(themeDe(r.id).devise)}</p>` : '')
    + (m.envoute ? '<p class="lg-pl-note">Tu es envoûté·e.</p>' : '')
    + (m.amoureux ? '<p class="lg-pl-note">Tu es amoureux·se.</p>' : '')
    + (r.description ? `<p class="small muted lg-pl-desc">${esc(r.description)}</p>` : '')
    + (alliés ? `<h3 class="lg-pl-sous-titre">Tes alliés</h3><ul class="lg-pl-liste">${alliés}</ul>` : '');
}

/** Rôles restants : (total − morts) / total, grisé quand il n'en reste plus. */
function htmlRestants(e) {
  const liste = (e.restants || []).map((x) => {
    const r = roleById(x.role);
    const total = x.total || 0;
    const reste = Math.max(0, total - (x.morts || 0));
    return `<li class="lg-pl-reste${reste === 0 ? ' epuise' : ''}">${vignetteRole(r.id, 30)}`
      + `<span class="lg-pl-reste-nom">${esc(r.nom)}</span><span class="lg-pl-reste-n">${reste}/${total}</span></li>`;
  });
  return liste.join('') || '<li class="small muted">Aucun rôle à afficher.</li>';
}

/** Une ligne du journal. Les entrées privées portent l'icône œil et le libellé « Pour toi ». */
function ligneJournal(x) {
  const prive = !!(x.prive || x.type === 'prive');
  const type = x.type || 'info';
  const quand = `${estNuit({ phase: x.phase }) ? 'Nuit' : 'Jour'} ${x.manche ?? ''}`.trim();
  return `<li class="lg-pl-j lg-pl-j-${esc(type)}${prive ? ' lg-pl-j-prive' : ''}">`
    + (prive ? `<span class="lg-pl-pour-toi">${icone('oeil', 14)}<span>Pour toi</span></span> ` : '')
    + `<span class="lg-pl-j-texte">${esc(x.texte)}</span> <span class="lg-pl-j-quand small muted">${esc(quand)}</span></li>`;
}

/** Écrit du HTML seulement s'il a changé ; garde le focus sur le bouton utilisé. */
const memo = new WeakMap();
function remplacer(conteneur, html) {
  if (memo.get(conteneur) === html) return;
  memo.set(conteneur, html);
  const f = document.activeElement;
  let cle = null;
  if (f && conteneur.contains(f)) {
    if (f.dataset?.k) cle = `[data-k="${CSS.escape(f.dataset.k)}"]`;
    else if (f.dataset?.cible) cle = `[data-cible="${CSS.escape(f.dataset.cible)}"]`;
  }
  conteneur.innerHTML = html;
  if (cle) conteneur.querySelector(cle)?.focus({ preventScroll: true });
}

const TITRE_CAUSE = (c) => TITRE_MORT[c] || 'Tu es mort·e';

/** Surcouche « Tu as été dévoré·e » : coulures SVG (aléatoires en longueur), focus piégé, Échap ferme. */
function coulures() {
  const id = `lg-sang-d-${Math.random().toString(36).slice(2, 8)}`;
  let d = 'M0,0 H1200 V40';
  for (let x = 1200, i = 0; x > 0; x -= 100, i++) {
    const cy = 40 + (i % 3 === 0 ? 34 : i % 3 === 1 ? 14 : 24);
    d += ` Q${x - 50},${cy} ${x - 100},40`;
  }
  d += ' Z';
  const gouttes = [[90, 40], [230, 95], [360, 60], [470, 120], [600, 30], [700, 80], [820, 50], [930, 110], [1050, 70], [1150, 35]];
  const traits = gouttes.map(([x, L], i) => `<path d="M${x - 5},40 H${x + 5} V${40 + L - 6} Q${x + 5},${40 + L} ${x},${40 + L} Q${x - 5},${40 + L} ${x - 5},${40 + L - 6} Z" fill="url(#${id})" style="animation-delay:${(i * 0.12).toFixed(2)}s"/>`).join('');
  return `<svg class="lg-sang-coulures" viewBox="0 0 1200 140" preserveAspectRatio="none" aria-hidden="true">`
    + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A0A10"/><stop offset="1" stop-color="#4A0509"/></linearGradient></defs>`
    + `<path d="${d}" fill="url(#${id})"/>${traits}</svg>`;
}

export function monter(root, s) {
  root.innerHTML = SQUELETTE;
  const el = root.querySelector('.lg-pl');
  boutonReponses(root.querySelector('.lg-pl-bandeau'), 'loupgarou', () => s.etat()?.partie?.id ?? null);
  const ref = (nom) => root.querySelector(`[data-ref="${nom}"]`);
  const refs = {
    lueur: ref('lueur'), titre: ref('titre'), sous: ref('sous'), tlabel: ref('tlabel'), chrono: ref('chrono'),
    barre: ref('barre'), fill: ref('fill'), table: ref('table'), annonce: ref('annonce'), action: ref('action'),
    role: ref('role'), restants: ref('restants'), horizon: ref('horizon'), embleme: ref('embleme'), chat: ref('chat'), journal: ref('journal'), journalCorps: ref('journalCorps'),
  };

  // Calque des effets (cartes, jetons, tampons) : posé dans la zone de table, sans interaction.
  const calque = document.createElement('div');
  calque.className = 'lg-fx-calque';
  calque.setAttribute('aria-hidden', 'true');
  root.querySelector('.lg-pl-table').append(calque);
  const effets = creerEffets({ calque, racine: refs.table, panneau: refs.action });

  const st = { etat: null, sel: {}, cle: '', cleAct: '', depart: 0, envoi: false, nuit: null, sigChat: '', sangVu: false };
  let sangEl = null;
  let inertes = [];
  let surTouche = null;

  const chat = monterChat(refs.chat, s, { canaux: canauxPour, titre: 'Discussion' });
  const signal = creerSignalTour();

  /** Thème du rôle : posé une fois par rôle (le Voleur ou le Chien-loup peuvent en changer). */
  function appliquerTheme(role) {
    if (st.theme === role) return;
    st.theme = role;
    const th = themeDe(role);
    if (!th) { delete el.dataset.theme; refs.embleme.hidden = true; return; }
    const img = imagesTheme(role);
    el.dataset.theme = role;
    el.style.setProperty('--th-a', th.a);
    el.style.setProperty('--th-rgb', th.rgb);
    el.style.setProperty('--th-bg', th.bg);
    // Adresses absolues : une url() dans une variable CSS se résout par rapport à la feuille qui l'utilise
    const abs = (u) => new URL(u, document.baseURI).href;
    el.style.setProperty('--th-motif', `url("${abs(img.motif)}")`);
    el.style.setProperty('--th-scene', `url("${abs(img.scene)}")`);
    refs.embleme.src = img.embleme;
    refs.embleme.hidden = false;
  }

  /** Redessine ce qui dépend de l'état (sans toucher au minuteur ni au chat). */
  function maj(e) {
    if (!e?.partie || !e.moi) return;
    // Avant : l'état précédent de cet écran, ou celui de l'écran d'avant (premier affichage après une transition).
    const avant = e === st.etat ? null : (st.etat || s.precedent?.() || null);
    st.etat = e;
    const p = e.partie;
    const m = e.moi;
    const nuit = estNuit(p);
    const amb = nuit ? 'nuit' : 'jour';
    document.body.dataset.lgAmbiance = amb;
    el.dataset.ambiance = amb;
    appliquerTheme(m.role);
    const zMeneur = el.querySelector('[data-ref="meneur-parti"]');
    zMeneur.hidden = !e.meneur_parti;
    remplacer(zMeneur, meneurPartiHtml(e));

    const cle = `${p.phase}|${p.manche}`;
    if (cle !== st.cle) { st.cle = cle; st.depart = s.secondesRestantes() || 0; st.sel = {}; }
    const cleAct = `${cle}|${m.action?.type || ''}|${!!m.action?.fait}`;
    if (cleAct !== st.cleAct) { st.cleAct = cleAct; st.sel = {}; }

    if (nuit !== st.nuit) {
      st.nuit = nuit;
      refs.lueur.className = `lg-pl-lueur ${nuit ? 'lg-lueur-lune' : 'lg-lueur-soleil'}`;
      refs.lueur.innerHTML = icone(nuit ? 'lune' : 'soleil', 30);
    }
    refs.titre.textContent = libellePhase(p);
    refs.sous.textContent = sousTitre(e);

    remplacer(refs.table, htmlTable(e, st.sel));
    marquerSieges();
    remplacer(refs.annonce, htmlAnnonce(e));
    remplacer(refs.action, panneauAction(e, st.sel, st.envoi));
    signal.maj(doitAgir(e));
    remplacer(refs.role, htmlRole(e));
    remplacer(refs.restants, htmlRestants(e));
    rendreJournal(e);

    const sig = JSON.stringify(canauxPour(e));
    if (sig !== st.sigChat) { st.sigChat = sig; chat.maj(e); }
    verifierSang(e);
    fondSang(e);
    effets.appliquer(avant, e);
    tick();
  }

  /** Met en évidence les sièges choisis (deux pour Cupidon et l'Envoûteur). */
  function marquerSieges() {
    refs.table.querySelectorAll('[data-cible]').forEach((b) => {
      const uid = b.dataset.cible;
      const choisi = uid === st.sel.cible || uid === st.sel.cible2;
      b.classList.toggle('cible', choisi);
      b.setAttribute('aria-pressed', String(choisi));
    });
  }

  function rendreJournal(e) {
    const liste = (e.journal || []).slice(-80);
    const corps = refs.journalCorps;
    const pres = corps.scrollTop + corps.clientHeight >= corps.scrollHeight - 40;
    remplacer(refs.journal, liste.length ? liste.map(ligneJournal).join('') : '<li class="small muted">Rien pour l\'instant.</li>');
    if (pres) corps.scrollTop = corps.scrollHeight;
  }

  /** Minuteur et barre de temps (chaque seconde). */
  function tick() {
    const r = s.secondesRestantes();
    const pause = st.etat?.partie?.pause_reste != null;
    refs.tlabel.textContent = pause ? 'En pause' : 'Temps restant';
    if (r == null) {
      refs.chrono.textContent = '--:--';
      refs.fill.style.width = '0%';
      return;
    }
    if (r > st.depart) st.depart = r;
    refs.chrono.textContent = chrono(r);
    refs.fill.style.width = `${st.depart ? Math.round((100 * r) / st.depart) : 0}%`;
    refs.barre.setAttribute('aria-valuemax', String(st.depart || 1));
    refs.barre.setAttribute('aria-valuenow', String(r));
  }
  const timer = setInterval(tick, 1000);

  /** Relance le dessin avec le choix en cours (clic local, sans attendre le serveur). */
  const rendreTout = () => { if (st.etat) maj(st.etat); };

  /* ---------- Clics : table et panneau (délégation, pas de handler inline) ---------- */

  function cliquerSiege(uid) {
    const sel = st.sel;
    const t = typeAction(st.etat);
    if (t === 'cupidon' || t === 'envouter') {
      if (sel.cible === uid) { sel.cible = sel.cible2 || null; sel.cible2 = null; }
      else if (sel.cible2 === uid) sel.cible2 = null;
      else if (!sel.cible) sel.cible = uid;
      else sel.cible2 = uid;
    } else {
      sel.cible = sel.cible === uid ? null : uid;
    }
  }

  const surTable = (ev) => {
    const b = ev.target.closest('[data-cible]');
    if (!b || b.disabled || st.envoi) return;
    cliquerSiege(b.dataset.cible);
    rendreTout();
  };
  refs.table.addEventListener('click', surTable);

  const surPanneau = async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled || st.envoi) return;
    const act = b.dataset.act;
    if (act === 'confirmer' || act === 'passer') {
      st.envoi = true;
      rendreTout();
      try {
        await executer(s, st.etat, st.sel, { passer: act === 'passer' });
        st.sel = {};
      } catch (err) {
        notifier(erreurTexte(err), 'error');
      } finally {
        st.envoi = false;
        rendreTout();
      }
      return;
    }
    if (choisir(b, st.sel)) rendreTout();
  };
  refs.action.addEventListener('click', surPanneau);

  /* ---------- Écran ensanglanté (une seule fois par partie et joueur) ---------- */

  /* Effet ensanglanté permanent tant que le joueur est mort et observe la partie (ne bloque aucun clic). */
  let fondEl = null;
  function fondSang(e) {
    const mort = e?.moi?.joueur && e.moi.vivant === false && e.partie?.statut !== 'terminee';
    if (mort && !fondEl) {
      fondEl = document.createElement('div');
      fondEl.className = 'lg-sang-fond';
      fondEl.setAttribute('aria-hidden', 'true');
      fondEl.innerHTML = coulures();
      document.body.appendChild(fondEl);
      document.body.classList.add('lg-spectateur');
    } else if (!mort && fondEl) {
      fondEl.remove(); fondEl = null;
      document.body.classList.remove('lg-spectateur');
    }
  }

  function verifierSang(e) {
    const m = e.moi;
    if (m.vivant !== false || st.sangVu) return;
    const cle = `lg-sang:${e.partie.id}:${m.user_id}`;
    st.sangVu = true;
    try {
      if (sessionStorage.getItem(cle)) return;
      sessionStorage.setItem(cle, '1');
    } catch { /* stockage indisponible : on montre quand même */ }
    afficherSang(e);
  }

  function afficherSang(e) {
    const m = e.moi;
    const j = (e.joueurs || []).find((x) => x.user_id === m.user_id) || {};
    const r = roleById(m.role);
    const ov = document.createElement('div');
    ov.className = 'lg-sang';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-labelledby', 'lg-sang-titre');
    ov.innerHTML = `${coulures()}
      <div class="lg-sang-carte">
        <p class="lg-pl-eyebrow">${esc(libelleCause(j.mort_cause, j.mort_manche))}</p>
        <h2 id="lg-sang-titre" class="lg-sang-titre">${esc(TITRE_CAUSE(j.mort_cause))}</h2>
        <p class="lg-sang-role">Ton rôle est révélé à tous : <strong>${esc(r.nom)}</strong></p>
        <ul class="lg-sang-liste">
          <li>${icone('cadenas', 18)}<span>Tu ne peux plus voter ni parler dans le chat général.</span></li>
          <li>${icone('lune', 18)}<span>Tu rejoins le chat des Morts.</span></li>
          <li>${icone('oeil', 18)}<span>Tu vois maintenant les rôles révélés.</span></li>
        </ul>
        <div class="lg-actions">
          <button type="button" class="btn btn-ghost" data-sang="continuer">Continuer en spectateur</button>
          <button type="button" class="btn btn-primary" data-sang="morts">Ouvrir le chat des Morts</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    sangEl = ov;
    inertes = [...document.body.children].filter((x) => x !== ov && !x.inert);
    inertes.forEach((x) => { x.inert = true; });
    ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-sang]');
      if (b) fermerSang(b.dataset.sang === 'morts');
    });
    surTouche = (ev) => { if (ev.key === 'Escape') fermerSang(false); };
    document.addEventListener('keydown', surTouche);
    ov.querySelector('[data-sang]')?.focus();
  }

  function fermerSang(versMorts) {
    if (!sangEl) return;
    sangEl.remove();
    sangEl = null;
    inertes.forEach((x) => { x.inert = false; });
    inertes = [];
    if (surTouche) document.removeEventListener('keydown', surTouche);
    surTouche = null;
    if (versMorts) refs.chat.querySelector('[data-canal="morts"]')?.click();
  }

  return {
    maj,
    message(msg) { chat.message(msg); },
    detruire() {
      clearInterval(timer);
      signal.arreter();
      effets.arreter();
      fermerSang(false);
      if (fondEl) { fondEl.remove(); fondEl = null; }
      document.body.classList.remove('lg-spectateur');
      chat.detruire();
      delete document.body.dataset.lgAmbiance;
      root.innerHTML = '';
    },
  };
}
