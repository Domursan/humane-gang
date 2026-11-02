// ===== Humane Gang — Jeux de plateau : accueil d'un jeu (#, sans adresse de partie) =====
/*
 * Rôle : en-tête du jeu (image, nom, accroche, nombre de joueurs), boutons Créer / Rejoindre avec un code
 * (format PREFIXE-1234 ; « 1234 » ou « prefixe 1234 » sont acceptés), Mes stats, « Mes parties en cours »,
 * « Parties publiques » (rafraîchies toutes les 15 s) et un lien « Règles » qui déplie un court résumé.
 * Chaque bloc charge ses données à part : une erreur n'empêche pas les autres.
 * « En direct » (Blackjack, Monopoly, Destins ; migration 214) : parties publiques en cours à regarder, bouton « Regarder ».
 * Dépendances : core.js (esc), plateaux/api.js (plat, contenus, erreurTexte, jeu, JEUX), commun/spectateurs.js.
 * Exporte : afficher.
 */
import { esc } from '../../../commun/core.js';
import { brancherRejoindre, chargerBloc, suivrePubliques } from '../../../commun/jeux-accueil.js';
import { plat, contenus, erreurTexte, jeu } from '../api.js';
import { JEUX_SPECTATEURS, compteurHtml, sousTitreDirect } from '../../../commun/spectateurs.js';

/** Intervalle de rafraîchissement des parties publiques (ms). */
const INTERVALLE_PUBLIQUES = 15000;

/** Image d'en-tête par jeu (dossier assets/img/jeux). */
const IMAGE = { cluedo: 'cluedo', shadow: 'shadow-hunter', destins: 'destins', monopoly: 'monopoly', risk: 'risk', blackjack: 'blackjack', poker: 'poker', catan: 'catan', pictionary: 'pictionary' };

/** Règles en bref, par jeu (règles officielles, versions adaptées à l'appli). */
const REGLES = {
  cluedo: [
    'Un meurtre a eu lieu au manoir. Trois cartes cachées (un suspect, une arme, une pièce) forment la solution.',
    'Les autres cartes sont réparties entre les joueurs, qui les gardent secrètes.',
    'Sans dés : à ton tour, tu vas dans une pièce voisine ou tu passes par un passage secret qui relie deux coins.',
    'En entrant dans une pièce, tu peux suggérer un suspect et une arme pour cette pièce.',
    'Un autre joueur doit montrer, en privé, une carte qui réfute la suggestion, si elle en a une.',
    'Tu peux accuser à tout moment. Si l\'accusation est juste, tu gagnes. Sinon tu es éliminé, mais tu réponds encore aux suggestions.',
  ],
  shadow: [
    'Trois camps : les Hunters, les Shadows et les Neutres. Personne ne sait qui est qui au départ.',
    'Chaque joueur reçoit un personnage caché, avec ses capacités et son camp.',
    'À ton tour, le lieu où tu vas est tiré aux dés.',
    'Les cartes Vision permettent de découvrir l\'identité d\'un joueur.',
    'Les cartes Lumière et Ténèbres font gagner ou perdre des points de vie et changent le cours de la partie.',
    'Chaque camp a sa condition de victoire. Trouve les tiens et protège-les.',
  ],
  destins: [
    'Tu avances sur le plateau de la vie en faisant tourner la roue, de 1 à 10 cases.',
    'Au début, tu choisis l\'université ou la carrière. Chaque choix change tes gains.',
    'Un jour de paie te rapporte de l\'argent à chaque tour sur la case dédiée.',
    'Le mariage, les enfants et la maison sont des étapes qui coûtent ou rapportent.',
    'La retraite marque la fin de ta vie active, avec un bilan final.',
    'Le joueur qui a le plus de bien-être et d\'argent à la fin gagne.',
  ],
  monopoly: [
    'Version courte, d\'environ une heure. La partie s\'arrête au bout d\'un nombre de tours choisi à la création.',
    'Achète les propriétés sur lesquelles tu tombes, puis construis des maisons et des hôtels.',
    'Payer un loyer à un autre joueur le fait s\'enrichir. Évite les faillites.',
    'Les échanges entre joueurs sont possibles, pendant ton tour comme entre les tours.',
    'Quand la partie s\'arrête, le plus riche gagne.',
    'Le temps de chaque tour est limité : passé le chrono, la partie joue pour toi.',
  ],
  risk: [
    'Version complète : 42 territoires répartis en 6 continents.',
    'Chaque joueur reçoit une mission secrète à accomplir. Elle peut être activée ou non selon le réglage de la partie.',
    'Renforce tes territoires, puis attaque les voisins avec des dés.',
    'Un continent entièrement conquis rapporte des renforts supplémentaires.',
    'Gagne en accomplissant ta mission secrète ou, sans mission, en conquérant le monde.',
    'Un joueur éliminé est retiré, et ses cartes vont à celui qui l\'a éliminé.',
  ],
  blackjack: [
    'Tu joues contre la banque. Le but : approcher 21 sans le dépasser, et faire mieux que la banque.',
    'À ton tour, mise de 10 à 500 jetons. Chacun reçoit deux cartes ; la banque en montre une, l\'autre reste cachée.',
    'Les figures valent 10, l\'as vaut 1 ou 11. Un blackjack (as et figure dès la distribution) rapporte 3 pour 2.',
    'Tire une carte, reste, double (une seule carte de plus, mise doublée) ou sépare une paire en deux mains.',
    'La banque tire jusqu\'à 17 et reste sur 17 souple. Battre la banque rapporte la mise ; une égalité ne change rien.',
    'La partie dure le nombre de manches choisi. Le joueur qui a le plus de jetons à la fin gagne. Avec moins de 10 jetons, on ne peut plus miser.',
  ],
  poker: [
    'Texas Hold\'em : chacun reçoit deux cartes cachées, puis cinq cartes communes sont posées au centre.',
    'Les deux joueurs après le donneur paient les blindes (petite et grosse) pour lancer la main.',
    'À ton tour : suivre la mise, relancer, te coucher, ou faire tapis (tout ton tapis).',
    'Il y a un tour de parole après le préflop, le flop, le turn et la river.',
    'À l\'abattage, la meilleure main de cinq cartes parmi sept gagne le pot. Les pots secondaires vont aux meilleures mains encore en lice.',
    'Les blindes doublent à intervalles réguliers. Un joueur sans jetons est éliminé ; le dernier qui reste gagne.',
  ],
  catan: [
    'Chacun pose une colonie et une route, puis une deuxième dans l\'ordre inverse ; la deuxième rapporte les ressources voisines.',
    'À ton tour, lance les dés : le total désigne les tuiles qui produisent. Une colonie rapporte une ressource, une ville deux.',
    'Un 7 déplace le voleur : tu voles une carte à un voisin, et ceux qui ont plus de 7 cartes en défaussent la moitié.',
    'Construis une route (bois et argile), une colonie (bois, argile, blé, mouton) ou une ville (2 blés et 3 pierres).',
    'Échange 4 cartes identiques contre une carte de ton choix avec la banque, puis finis ton tour.',
    'Une colonie vaut 1 point, une ville 2 points. Le premier à 10 points (ou 8, réglé à la création) gagne.',
  ],
  pictionary: [
    'Chacun dessine à son tour un mot choisi parmi trois ; les autres écrivent leur proposition pour le deviner.',
    'Le dessinateur a 20 secondes pour choisir ; sans choix, le premier mot est pris.',
    'Le dessin dure 60, 80 ou 100 secondes. Des lettres du mot se dévoilent à mi-temps et aux trois quarts.',
    'Trouver rapporte 10 points, plus un point par tranche de 10 secondes restantes. Le dessinateur gagne 4 points par joueur qui trouve.',
    'Une proposition presque juste n\'est montrée qu\'à son auteur. Le tour finit quand tout le monde a trouvé ou quand le temps est écoulé.',
    'Le joueur qui a le plus de points à la fin gagne.',
  ],
};

const nombre = (n) => Number(n || 0).toLocaleString('fr-CH');

/** « 1234 », « prefixe 1234 » ou « PREFIXE-1234 » donnent « PREFIXE-1234 ». Renvoie null si le format ne colle pas. */
function normaliserCode(saisie, prefixe) {
  const brut = String(saisie || '').toUpperCase().replace(/\s+/g, '');
  const m = brut.match(/^(?:[A-Z]+-?)?(\d{4})$/);
  return m ? `${prefixe}-${m[1]}` : null;
}

/** Bloc « Mes parties en cours ». */
function htmlMesParties(liste) {
  if (!liste.length) return '<p class="plat-aide">Aucune partie en cours.</p>';
  return `<ul class="plat-liste-parties">${liste.map((p) => `<li class="plat-partie${p.mon_tour ? ' is-tour' : ''}">
      <a href="#partie/${encodeURIComponent(p.code)}">
        <span class="plat-partie-nom">${esc(p.nom)}</span>
        <span class="plat-code small">${esc(p.code)}</span>
        <span class="plat-etiquette">${p.statut === 'attente' ? 'En attente' : 'En cours'}</span>
        ${p.mon_tour ? '<span class="plat-etiquette is-tour">À toi de jouer</span>' : (p.tour_pseudo ? `<span class="small muted">Tour de ${esc(p.tour_pseudo)}</span>` : '')}
      </a>
      <span class="small muted">${nombre(p.inscrits)} joueur${Number(p.inscrits) > 1 ? 's' : ''}</span>
    </li>`).join('')}</ul>`;
}

/** Bloc « Parties publiques ». */
function htmlPubliques(liste) {
  if (!liste.length) return '<p class="plat-aide">Aucune partie publique en attente pour le moment.</p>';
  return `<ul class="plat-liste-parties">${liste.map((p) => `<li class="plat-partie">
      <a href="#rejoindre/${encodeURIComponent(p.code)}">
        <span class="plat-partie-nom">${esc(p.nom)}</span>
        <span class="plat-code small">${esc(p.code)}</span>
        <span class="small muted">Hôte : ${esc(p.hote_pseudo || '?')}</span>
      </a>
      <span class="small muted">${nombre(p.inscrits)} / ${nombre(p.nb_places)}</span>
    </li>`).join('')}</ul>`;
}

/** Bloc « En direct » (migration 214) : parties publiques en cours qui admettent les spectateurs. */
function htmlDirect(liste, image) {
  if (!liste.length) return '<p class="plat-aide">Aucune partie publique en cours. Les parties privées ne se regardent pas.</p>';
  const J = jeu();
  return `<ul class="sp-liste">${liste.map((d) => `<li class="sp-ligne">
      ${image ? `<img class="sp-vig" src="/assets/images/jeux/${esc(image)}.webp" alt="" width="40" height="40">` : ''}
      <div class="sp-txt"><strong>${esc(d.nom)}</strong><span class="sp-sous">${esc(sousTitreDirect(d, J.id))}</span></div>
      ${compteurHtml(d.spectateurs)}
      <a class="btn btn-ghost sp-bouton" href="#partie/${encodeURIComponent(d.code)}">Regarder<span class="visually-hidden"> ${esc(d.nom)}</span></a>
    </li>`).join('')}</ul>`;
}

/**
 * Affiche l'accueil du jeu de la page dans root. Renvoie la fonction de nettoyage.
 * @param {HTMLElement} root zone d'affichage (#app).
 */
export async function afficher(root) {
  let actif = true;
  const J = jeu();
  const c = await contenus().catch(() => ({}));
  const nomJeu = c?.nom || J.nom;
  const image = IMAGE[J.id];
  const regles = REGLES[J.id] || [];
  const direct = JEUX_SPECTATEURS.includes(J.id);

  root.innerHTML = `<div class="plat-accueil">
    <header class="plat-accueil-tete">
      <img class="plat-accueil-image" alt="" width="160" height="160" hidden data-image>
      <div>
        <h1 class="plat-titre display">${esc(nomJeu)}</h1>
        <p class="plat-accroche">${esc(J.accroche)}</p>
        <p class="small muted">De ${esc(J.min)} à ${esc(J.max)} joueurs</p>
      </div>
    </header>
    <div class="plat-accueil-actions">
      <a class="btn btn-primary" href="#creer">Créer une partie</a>
      <a class="btn btn-ghost" href="#stats">Mes stats</a>
    </div>

    <div class="plat-accueil-grille">
      <section class="card plat-carte" aria-labelledby="plat-rejoindre-titre">
        <h2 id="plat-rejoindre-titre">Rejoindre avec un code</h2>
        <form class="plat-code-form" data-rejoindre-form novalidate>
          <label for="plat-code-champ">Code de la partie</label>
          <div class="plat-boutons">
            <input id="plat-code-champ" class="plat-input" type="text" inputmode="text" autocomplete="off"
              placeholder="${esc(J.prefixe)}-1234" maxlength="24" aria-describedby="plat-code-aide" data-code>
            <button type="submit" class="btn btn-primary">Rejoindre</button>
          </div>
          <p id="plat-code-aide" class="small muted">Format ${esc(J.prefixe)}-1234. Le chiffre seul suffit.</p>
          <p class="plat-erreur-ligne" role="alert" data-erreur hidden></p>
        </form>
      </section>

      <section class="card plat-carte" aria-labelledby="plat-mes-titre">
        <h2 id="plat-mes-titre">Mes parties en cours</h2>
        <div data-mes aria-live="polite"><p class="plat-aide">Chargement…</p></div>
      </section>

      <section class="card plat-carte" aria-labelledby="plat-pub-titre">
        <h2 id="plat-pub-titre">Parties publiques</h2>
        <div data-pub aria-live="polite"><p class="plat-aide">Chargement…</p></div>
      </section>
      ${direct ? `<section class="card plat-carte sp-direct" aria-labelledby="sp-plat-titre">
        <h2 id="sp-plat-titre">En direct</h2>
        <div data-direct><p class="plat-aide">Chargement…</p></div>
      </section>` : ''}

      <section class="card plat-carte plat-regles" aria-labelledby="plat-regles-titre">
        <div class="plat-regles-tete">
          <h2 id="plat-regles-titre">Règles</h2>
          <button type="button" class="btn btn-ghost" data-regles-bouton aria-expanded="false" aria-controls="plat-regles-corps">Voir les règles</button>
        </div>
        <div id="plat-regles-corps" data-regles-corps hidden>
          <ul class="plat-regles-liste">${regles.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
        </div>
      </section>
    </div>
  </div>`;

  // Image d'en-tête : affichée seulement si le fichier existe (sinon on garde le texte seul).
  const img = root.querySelector('[data-image]');
  if (image) {
    img.src = `/assets/images/jeux/${image}.webp`;
    img.addEventListener('load', () => { img.hidden = false; });
  }

  // Règles : bouton qui déplie le résumé.
  const boutonRegles = root.querySelector('[data-regles-bouton]');
  const corpsRegles = root.querySelector('[data-regles-corps]');
  boutonRegles.addEventListener('click', () => {
    const ouvert = boutonRegles.getAttribute('aria-expanded') === 'true';
    boutonRegles.setAttribute('aria-expanded', String(!ouvert));
    boutonRegles.textContent = ouvert ? 'Voir les règles' : 'Masquer les règles';
    corpsRegles.hidden = ouvert;
  });

  // Rejoindre avec un code.
  brancherRejoindre({ formulaire: root.querySelector('[data-rejoindre-form]'), champ: root.querySelector('[data-code]'),
    erreur: root.querySelector('[data-erreur]'), normaliser: (saisie) => normaliserCode(saisie, J.prefixe),
    messageErreur: `Le code doit ressembler à ${J.prefixe}-1234.`, naviguer: (hash) => { location.hash = hash; },
    url: (code) => `#rejoindre/${encodeURIComponent(code)}` });

  // Mes parties en cours.
  const alerte = (m) => `<p class="plat-aide" role="alert">${esc(m)}</p>`;
  chargerBloc({ zone: root.querySelector('[data-mes]'), charger: () => plat.mesParties(),
    rendre: (liste) => htmlMesParties(Array.isArray(liste) ? liste : []), messageErreur: alerte, erreurTexte, actif: () => actif });

  // Parties publiques, rafraîchies régulièrement.
  const arretPubliques = suivrePubliques({ zone: root.querySelector('[data-pub]'), charger: () => plat.publiques(),
    rendre: (liste) => htmlPubliques(Array.isArray(liste) ? liste : []), intervalle: INTERVALLE_PUBLIQUES,
    messageErreur: alerte, erreurTexte, actif: () => actif });

  // En direct (migration 214) : parties publiques en cours à regarder, rafraîchies comme les publiques.
  const arretDirect = direct ? suivrePubliques({ zone: root.querySelector('[data-direct]'), charger: () => plat.enDirect(),
    rendre: (liste) => htmlDirect(Array.isArray(liste) ? liste : [], image), intervalle: INTERVALLE_PUBLIQUES,
    messageErreur: alerte, erreurTexte, actif: () => actif }) : () => {};

  return () => {
    actif = false;
    arretPubliques();
    arretDirect();
  };
}
