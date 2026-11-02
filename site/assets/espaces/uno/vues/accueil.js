// ===== Humane Gang — Uno : accueil (#, sans adresse de partie) =====
/*
 * Rôle : écran d'accueil du Uno. Héros avec un éventail de cartes et les boutons « Créer une partie » et « Rappel des
 * règles », rejoindre avec un code, parties en cours du membre, parties publiques en attente (rafraîchies toutes les
 * 15 s), statistiques résumées et lien vers #stats. Chaque bloc charge ses données à part : une erreur n'empêche pas les autres.
 * Partie où un robot tient ma place (parti, migration 211) : « un robot joue pour toi depuis 4 min », étiquette Robot, « Reprendre ma place ».
 * « En direct » (migration 214, membres seulement) : parties publiques en cours qui admettent les spectateurs, bouton « Regarder ».
 * Dépendances : core.js (esc, avatarHtml), uno/api.js (uno, erreurTexte, estInvite), uno/cartes.js (carteHtml, dosHtml),
 *   commun/robot-place.js (ICONE_ROBOT, depuisTexte), commun/spectateurs.js (compteurHtml, sousTitreDirect).
 * Exporte : afficher.
 */
import { esc, avatarHtml } from '../../../commun/core.js';
import { uno, erreurTexte, estInvite } from '../api.js';
import { carteHtml, dosHtml } from '../cartes.js';
import { brancherRejoindre, chargerBloc, suivrePubliques } from '../../../commun/jeux-accueil.js';
import { ICONE_ROBOT, depuisTexte } from '../../../commun/robot-place.js';
import { compteurHtml, sousTitreDirect } from '../../../commun/spectateurs.js';

/** Intervalle de rafraîchissement des parties publiques (ms). */
const INTERVALLE_PUBLIQUES = 15000;

/** Libellés des variantes affichées sur une partie publique. */
const VARIANTES = {
  cumul: 'cumul des +2',
  pioche_jusqu: "pioche jusqu'à pouvoir jouer",
  sept_zero: 'sept-zéro',
  interception: 'interception',
};

/** Cartes de l'éventail du héros (de gauche à droite, après le dos). */
const EVENTAIL = [
  { couleur: 'b', valeur: '4' },
  { couleur: 'y', valeur: '+2' },
  { couleur: 'k', valeur: '+4' },
  { couleur: 'r', valeur: '7' },
];

const nombre = (n) => Number(n || 0).toLocaleString('fr-CH');
const urlPartie = (code) => `#partie/${encodeURIComponent(code)}`;
const urlRejoindre = (code) => `#rejoindre/${encodeURIComponent(code)}`;

/** « 4821 », « hguno4821 » ou « HGUNO-4821 » donnent « HGUNO-4821 ». Renvoie null si le format ne colle pas. */
function normaliserCode(saisie) {
  const m = String(saisie || '').toUpperCase().replace(/\s+/g, '').match(/^(?:HGUNO-?)?(\d{4})$/);
  return m ? `HGUNO-${m[1]}` : null;
}

/** Pseudo dans sa couleur de profil (couleur refusée si ce n'est pas un hexadécimal à six chiffres). */
function pseudoHtml(nom, couleur) {
  const c = /^#[0-9a-f]{6}$/i.test(couleur || '') ? couleur : '#F2EFEA';
  return `<span class="uno-acc-pseudo" style="color:${c}">${esc(nom || '?')}</span>`;
}

/** Résumé des réglages d'une partie publique : mode, temps de tour, variantes. */
function resumePublique(p) {
  const variantes = Object.entries(p.variantes || {})
    .filter(([cle, on]) => on && VARIANTES[cle])
    .map(([cle]) => VARIANTES[cle]);
  const mode = p.mode === 'points' ? 'en points' : 'en manches';
  return [mode, `tours de ${nombre(p.t_tour)} s`, ...variantes].join(' · ');
}

/* ---------- Blocs ---------- */

function htmlEventail() {
  return `<div class="uno-acc-eventail" aria-hidden="true">
    ${dosHtml({ taille: 'l', classe: 'uno-acc-ev' })}
    ${EVENTAIL.map((c) => carteHtml(c, { taille: 'l', classe: 'uno-acc-ev' })).join('')}
  </div>`;
}

function htmlHero() {
  return `<section class="uno-acc-hero" aria-labelledby="uno-acc-titre">
    <div class="uno-acc-hero-texte">
      <span class="eyebrow">Jeux du gang</span>
      <h1 id="uno-acc-titre" class="uno-acc-hero-titre display">Uno</h1>
      <p class="uno-acc-intro">De 2 à 20 joueurs, 7 cartes chacun. Vide ta main le premier, sans oublier de crier UNO.</p>
      <div class="uno-acc-actions">
        <a class="btn btn-primary uno-acc-grand" href="#creer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          <span>Créer une partie</span>
        </a>
        <button type="button" class="btn btn-ghost uno-acc-grand" id="uno-acc-btn-regles" aria-controls="uno-acc-regles">Rappel des règles</button>
      </div>
    </div>
    ${htmlEventail()}
  </section>`;
}

function htmlRejoindre() {
  return `<section class="card uno-acc-carte" aria-labelledby="uno-acc-rejoindre-titre">
    <h2 id="uno-acc-rejoindre-titre" class="uno-acc-titre">Rejoindre avec un code</h2>
    <form class="uno-acc-rejoindre" id="uno-acc-form" novalidate>
      <label for="uno-acc-code" class="visually-hidden">Code de partie</label>
      <input id="uno-acc-code" class="uno-acc-code" type="text" name="code" placeholder="HGUNO-4821" autocomplete="off"
        autocapitalize="characters" spellcheck="false" aria-describedby="uno-acc-aide uno-acc-erreur">
      <button type="submit" class="btn btn-light uno-acc-grand">Rejoindre</button>
    </form>
    <p id="uno-acc-erreur" class="uno-acc-erreur" role="alert" hidden></p>
    <p id="uno-acc-aide" class="uno-acc-aide">Le code est donné par l'hôte de la partie. Un lien d'invitation fonctionne aussi.</p>
  </section>`;
}

function ligneMaPartie(p) {
  const robot = !!p.robot_depuis && p.statut === 'en_cours';
  const infos = [p.statut === 'attente' ? "Salle d'attente" : 'En cours'];
  if (robot) infos.push(`un robot joue pour toi depuis ${depuisTexte(p.robot_depuis)}`);
  else infos.push(`${nombre(p.inscrits)} joueur${Number(p.inscrits) > 1 ? 's' : ''}`);
  if (p.mes_cartes != null && p.statut !== 'attente') infos.push(`il te reste ${nombre(p.mes_cartes)} carte${Number(p.mes_cartes) > 1 ? 's' : ''}`);
  if (!robot) infos.push(p.mon_tour ? "c'est ton tour" : p.tour_pseudo ? `c'est au tour de ${p.tour_pseudo}` : '');
  const etiquette = robot ? `<span class="uno-acc-etiquette rb-etiq">${ICONE_ROBOT}Robot</span>`
    : p.mon_tour ? '<span class="uno-acc-etiquette">À toi</span>' : '';
  return `<li class="uno-acc-ligne${robot ? ' rb-ligne' : ''}">
    <span class="uno-acc-puce" aria-hidden="true">${dosHtml({ taille: 's' })}</span>
    <div class="uno-acc-ligne-texte">
      <strong>${esc(p.nom)}</strong>
      <span class="uno-acc-sous">${esc(infos.filter(Boolean).join(' · '))}</span>
    </div>
    ${etiquette}
    <a class="btn btn-sand uno-acc-bouton" href="${esc(urlPartie(p.code))}">${robot ? 'Reprendre ma place' : 'Reprendre'}<span class="visually-hidden"> ${esc(p.nom)}</span></a>
  </li>`;
}

function htmlMesParties(parties) {
  if (!parties.length) return '<p class="uno-acc-aide">Aucune partie en cours. Crée la tienne ou rejoins une table publique.</p>';
  return `<ul class="uno-acc-liste">${parties.map(ligneMaPartie).join('')}</ul>`;
}

function lignePublique(p) {
  return `<li class="uno-acc-ligne">
    ${avatarHtml({ pseudo: p.hote_pseudo, color: p.hote_couleur }, 40)}
    <div class="uno-acc-ligne-texte">
      <strong>${esc(p.nom)}</strong>
      <span class="uno-acc-sous">Par ${pseudoHtml(p.hote_pseudo, p.hote_couleur)} · ${esc(resumePublique(p))}</span>
    </div>
    <span class="uno-acc-nb">${nombre(p.inscrits)}/${nombre(p.nb_places)}<span class="visually-hidden"> joueurs</span></span>
    <a class="btn btn-ghost uno-acc-bouton" href="${esc(urlRejoindre(p.code))}">Rejoindre<span class="visually-hidden"> ${esc(p.nom)}</span></a>
  </li>`;
}

function htmlPubliques(liste) {
  if (!liste.length) {
    return `<div class="uno-acc-vide">
      <p>Personne n'attend de joueurs pour le moment.</p>
      <p class="uno-acc-aide">Lance la tienne : elle apparaîtra ici en direct.</p>
      <a class="btn btn-ghost uno-acc-bouton" href="#creer">Créer une partie</a>
    </div>`;
  }
  return `<ul class="uno-acc-liste">${liste.map(lignePublique).join('')}</ul>`;
}

/** « En direct » (migration 214) : parties publiques en cours qui admettent les spectateurs. */
function ligneDirect(d) {
  return `<li class="uno-acc-ligne">
    <span class="uno-acc-puce" aria-hidden="true">${dosHtml({ taille: 's' })}</span>
    <div class="uno-acc-ligne-texte">
      <strong>${esc(d.nom)}</strong>
      <span class="uno-acc-sous">${esc(sousTitreDirect(d, 'uno'))}</span>
    </div>
    ${compteurHtml(d.spectateurs)}
    <a class="btn btn-ghost uno-acc-bouton" href="${esc(urlPartie(d.code))}">Regarder<span class="visually-hidden"> ${esc(d.nom)}</span></a>
  </li>`;
}

function htmlDirect(liste) {
  if (!liste.length) return '<p class="uno-acc-aide">Aucune partie publique en cours. Les parties privées ne se regardent pas.</p>';
  return `<ul class="uno-acc-liste">${liste.map(ligneDirect).join('')}</ul>`;
}

/** Carte « Mes statistiques » : corps déjà prêt en HTML. */
function htmlCarteStats(corps) {
  return `<section class="card uno-acc-carte" aria-labelledby="uno-acc-stats-titre">
    <h2 id="uno-acc-stats-titre" class="uno-acc-titre">Mes statistiques</h2>
    ${corps}
  </section>`;
}

function htmlStatsResume(s) {
  const parties = Number(s.parties) || 0;
  const victoires = Number(s.victoires) || 0;
  const serie = Number(s.serie) || 0;
  const badges = Array.isArray(s.badges) ? s.badges : [];
  const obtenus = badges.filter((b) => b.obtenu).length;
  return `
    <div class="uno-acc-tuiles">
      <div class="uno-acc-tuile"><span class="uno-acc-chiffre">${nombre(parties)}</span><span class="uno-acc-tuile-nom">parties</span></div>
      <div class="uno-acc-tuile vert"><span class="uno-acc-chiffre">${nombre(victoires)}</span><span class="uno-acc-tuile-nom">victoires</span></div>
      <div class="uno-acc-tuile or"><span class="uno-acc-chiffre">${nombre(serie)}</span><span class="uno-acc-tuile-nom">série</span></div>
    </div>
    ${parties
      ? `<p class="uno-acc-sous">Badges obtenus : ${nombre(obtenus)} sur ${nombre(badges.length)}</p>`
      : '<p class="uno-acc-aide">Pas encore de partie jouée. Tes statistiques apparaîtront ici après ta première partie.</p>'}
    <a class="uno-acc-lien" href="#stats">Voir toutes mes statistiques</a>`;
}

function htmlRegles() {
  return `<section class="card uno-acc-regles" aria-label="Règles du Uno">
    <details id="uno-acc-regles">
      <summary>Rappel des règles</summary>
      <ul class="uno-acc-regles-liste">
        <li>Chacun reçoit 7 cartes. Le but : vider ta main le premier.</li>
        <li>Tu poses une carte de même couleur, de même chiffre ou de même symbole que la carte du dessus, ou un Joker.</li>
        <li><strong>+2</strong> : le joueur suivant pioche 2 cartes et passe son tour.</li>
        <li><strong>Inversion</strong> : le sens du jeu s'inverse.</li>
        <li><strong>Passe</strong> : le joueur suivant passe son tour.</li>
        <li><strong>Joker</strong> : tu choisis la couleur de la suite.</li>
        <li><strong>Joker +4</strong> : le joueur suivant pioche 4 et passe son tour. Il peut contester le +4 : le serveur vérifie alors si le +4 était permis.</li>
        <li>Si tu ne peux pas jouer, tu pioches. Si la carte piochée est jouable, tu peux la poser ou passer.</li>
        <li>Quand il ne te reste qu'une carte, dis UNO. Si tu oublies et qu'un adversaire te contre, tu pioches 2 cartes.</li>
      </ul>
    </details>
  </section>`;
}

/* ---------- Écran ---------- */

/**
 * Affiche l'accueil dans root. Renvoie la fonction de nettoyage (arrêt du rafraîchissement).
 * @param {HTMLElement} root
 * @param {{ naviguer: (hash: string) => void }} ctx
 */
export async function afficher(root, { naviguer }) {
  let actif = true;
  const invite = estInvite();

  root.innerHTML = `<div class="uno-acc">
    ${htmlHero()}
    <div class="uno-acc-grille">
      <div class="uno-acc-colonne">
        ${htmlRejoindre()}
        <section class="card uno-acc-carte" aria-labelledby="uno-acc-encours-titre">
          <h2 id="uno-acc-encours-titre" class="uno-acc-titre">Mes parties en cours</h2>
          <div id="uno-acc-encours" aria-live="polite"><p class="uno-acc-aide">Chargement…</p></div>
        </section>
      </div>
      <div class="uno-acc-colonne">
        <section class="card uno-acc-carte" aria-labelledby="uno-acc-publiques-titre">
          <div class="uno-acc-carte-tete">
            <h2 id="uno-acc-publiques-titre" class="uno-acc-titre">Parties publiques en attente</h2>
            <span class="uno-acc-sous" aria-hidden="true">En direct</span>
          </div>
          <div id="uno-acc-publiques" aria-live="polite"><p class="uno-acc-aide">Chargement…</p></div>
        </section>
        ${invite ? '' : `<section class="card uno-acc-carte sp-direct" aria-labelledby="sp-direct-titre">
          <h2 id="sp-direct-titre" class="uno-acc-titre">En direct</h2>
          <div id="uno-acc-direct"><p class="uno-acc-aide">Chargement…</p></div>
        </section>`}
        ${invite ? '' : `<div id="uno-acc-stats">${htmlCarteStats('<p class="uno-acc-aide">Chargement…</p>')}</div>`}
      </div>
    </div>
    ${htmlRegles()}
  </div>`;

  const zoneEnCours = root.querySelector('#uno-acc-encours');
  const zonePubliques = root.querySelector('#uno-acc-publiques');
  const zoneStats = root.querySelector('#uno-acc-stats');
  const formulaire = root.querySelector('#uno-acc-form');
  const champ = root.querySelector('#uno-acc-code');
  const erreur = root.querySelector('#uno-acc-erreur');
  const regles = root.querySelector('#uno-acc-regles');

  // Rappel des règles : ouvre le bloc, le place en haut de l'écran et donne le focus au titre.
  root.querySelector('#uno-acc-btn-regles').addEventListener('click', () => {
    regles.open = true;
    regles.scrollIntoView({ block: 'start' });
    regles.querySelector('summary').focus();
  });

  // Rejoindre avec un code : normalisation puis navigation vers l'écran de rejoindre.
  brancherRejoindre({ formulaire, champ, erreur, normaliser: normaliserCode, naviguer, url: urlRejoindre,
    messageErreur: 'Le code ressemble à HGUNO-4821 : quatre chiffres, avec ou sans « HGUNO ».' });

  // Chaque bloc charge ses données à part ; une erreur ne bloque pas les autres.
  chargerBloc({ zone: zoneEnCours, charger: () => uno.mesParties(), rendre: (p) => htmlMesParties(Array.isArray(p) ? p : []),
    messageErreur: (m) => `<p class="uno-acc-aide">Parties en cours indisponibles pour l'instant. ${esc(m)}</p>`,
    erreurTexte, actif: () => actif });
  const arretPubliques = suivrePubliques({ zone: zonePubliques, charger: () => uno.publiques(),
    rendre: (l) => htmlPubliques(Array.isArray(l) ? l : []), intervalle: INTERVALLE_PUBLIQUES,
    messageErreur: (m) => `<p class="uno-acc-aide">Liste indisponible pour l'instant. ${esc(m)}</p>`,
    erreurTexte, actif: () => actif });
  const zoneDirect = root.querySelector('#uno-acc-direct');
  const arretDirect = zoneDirect ? suivrePubliques({ zone: zoneDirect, charger: () => uno.enDirect(),
    rendre: (l) => htmlDirect(Array.isArray(l) ? l : []), intervalle: INTERVALLE_PUBLIQUES,
    messageErreur: (m) => `<p class="uno-acc-aide">Liste indisponible pour l'instant. ${esc(m)}</p>`,
    erreurTexte, actif: () => actif }) : () => {};
  if (zoneStats) {
    chargerBloc({ zone: zoneStats, charger: () => uno.stats(),
      rendre: (s) => htmlCarteStats(s ? htmlStatsResume(s) : '<p class="uno-acc-aide">Tes statistiques ne sont pas disponibles pour ton compte.</p>'),
      messageErreur: (m) => htmlCarteStats(`<p class="uno-acc-aide">Statistiques indisponibles pour l'instant. ${esc(m)}</p>`),
      erreurTexte, actif: () => actif });
  }

  return () => {
    actif = false;
    arretPubliques();
    arretDirect();
  };
}
