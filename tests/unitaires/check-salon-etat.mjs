// Contrôle sans navigateur de site/assets/commun/salon-etat.js (idée 3), à la fausse horloge : coupure courte ou longue, retour,
// onglet caché, réveil, invité, canal absent avec relectures bonnes, nettoyage. Le branchement sur les vraies tables est dans parcours/jeux/parcours-salon-etat.cjs.
// Lancer : node tests/unitaires/check-salon-etat.mjs
import { suivreConnexion, SEUIL_COUPURE, DUREE_RETOUR, DELAI_REVEIL, DUREE_SANS_CANAL } from '../../site/assets/commun/salon-etat.js';

let ko = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) ko++; };

/** Indicateur branché sur une fausse horloge ; .avance(ms) fait passer le temps, .etat est ce qui est affiché. */
function banc() {
  let t = 0;
  let suivant = 1;
  const minuteurs = new Map();
  const b = { etat: null, cache: false, vus: [] };
  b.i = suivreConnexion({
    afficher: (e) => { b.etat = e; b.vus.push(e); },
    dort: () => b.cache,
    attendre: (f, ms) => { minuteurs.set(suivant, { f, quand: t + ms }); return suivant++; },
    annuler: (id) => { minuteurs.delete(id); },
  });
  b.avance = (ms) => {
    const fin = t + ms;
    for (;;) {
      const prochain = [...minuteurs.entries()].filter(([, m]) => m.quand <= fin).sort((x, y) => x[1].quand - y[1].quand)[0];
      if (!prochain) break;
      minuteurs.delete(prochain[0]);
      t = prochain[1].quand;
      prochain[1].f();
    }
    t = fin;
  };
  b.minuteurs = () => minuteurs.size;
  b.cacher = (oui) => { b.cache = oui; b.i.visibilite(); };
  return b;
}
const branche = () => { const b = banc(); b.i.canal('SUBSCRIBED'); return b; };

let b = branche();
check(b.etat === null && b.vus.length === 0 && b.minuteurs() === 0, 'état normal : rien');

// Coupure courte
b = branche();
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE - 1);
b.i.canal('SUBSCRIBED');
b.avance(60000);
check(b.vus.length === 0, 'coupure de moins de 4 s : rien, ni pastille ni « rétablie »');

// Coupure longue, reprise, retour
b = branche();
b.i.canal('TIMED_OUT');
b.avance(SEUIL_COUPURE - 1);
check(b.etat === null, 'avant 4 s : rien');
b.avance(1);
check(b.etat === 'coupure', 'à 4 s : coupure');
b.i.canal('CHANNEL_ERROR');
b.avance(30000);
check(b.etat === 'coupure', 'la coupure reste tant que rien ne revient');
b.i.lecture(true);
check(b.etat === 'reprise', 'une relecture répond, le canal pas encore : reprise');
b.i.lecture(false);
check(b.etat === 'coupure', 'la relecture suivante échoue : retour à la coupure');
b.i.reseau(true);
check(b.etat === 'coupure', 'navigateur en ligne mais relecture ratée : toujours la coupure');
b.i.lecture(true);
check(b.etat === 'reprise', 'relecture réussie : reprise');
b.i.canal('SUBSCRIBED');
check(b.etat === 'retour', 'canal revenu : rétablie');
b.avance(DUREE_RETOUR - 1);
check(b.etat === 'retour', 'rétablie reste presque 3 s');
b.avance(1);
check(b.etat === null && b.minuteurs() === 0, 'puis disparaît');

// Relecture réussie avant que la pastille soit montrée : pas de pastille orange
b = branche();
b.i.canal('CHANNEL_ERROR');
b.i.lecture(true);
b.avance(SEUIL_COUPURE);
check(b.etat === 'reprise' && !b.vus.includes('coupure'), 'une relecture vient de réussir : reconnexion d\'emblée, pas de coupure');
b = branche();
b.i.lecture(true);
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE);
check(b.etat === 'coupure', 'une relecture d\'avant la chute ne prouve rien : coupure');

// Le canal ne revient pas, les relectures restent bonnes : la partie se joue, la pastille s'efface
b = branche();
b.i.canal('CHANNEL_ERROR');
b.i.lecture(true);
for (let i = 0; i < 3; i++) { b.avance(4000); b.i.canal('CHANNEL_ERROR'); b.i.lecture(true); }
b.avance(DUREE_SANS_CANAL - 12000 - 1);
check(b.etat === 'reprise', 'canal absent, relectures bonnes : reconnexion pendant 15 s');
b.avance(1);
check(b.etat === 'retour', 'puis la pastille s\'efface par « rétablie »');
b.avance(DUREE_RETOUR);
check(b.etat === null && b.minuteurs() === 0, 'et plus rien');
b.i.canal('CLOSED');
b.i.lecture(true);
b.avance(120000);
check(b.etat === null, 'canal toujours absent : plus de pastille');
b.i.lecture(false);
b.avance(2000);
b.i.lecture(true);
b.avance(120000);
check(b.etat === null, 'canal absent : une relecture ratée isolée ne ramène rien');
b.i.lecture(false);
b.avance(SEUIL_COUPURE);
check(b.etat === 'coupure', 'canal absent, relectures ratées : coupure');
b.i.lecture(true);
check(b.etat === 'retour', 'la relecture revient : rétablie, sans attendre le canal');
b.avance(DUREE_RETOUR);
b.i.canal('SUBSCRIBED');
b.avance(60000);
check(b.etat === null, 'canal neuf branché : rien à dire');
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE);
check(b.etat === 'coupure', 'nouvelle chute après un canal neuf : elle compte de nouveau');

// Les 15 s repartent après une relecture ratée
b = branche();
b.i.canal('CHANNEL_ERROR');
b.i.lecture(true);
b.avance(DUREE_SANS_CANAL - 1000);
b.i.lecture(false);
b.avance(2000);
b.i.lecture(true);
b.avance(DUREE_SANS_CANAL - 1);
check(b.etat === 'reprise', 'une relecture ratée remet les 15 s à zéro');
b.avance(1);
check(b.etat === 'retour', 'et elles repartent de la relecture suivante');

// Canal revenu pendant les 15 s
b = branche();
b.i.canal('CHANNEL_ERROR');
b.i.lecture(true);
b.i.canal('SUBSCRIBED');
b.avance(60000);
check(b.vus.length === 0 && b.minuteurs() === 0, 'canal revenu vite : compte des 15 s abandonné');

// Le navigateur seul, sans le canal
b = branche();
b.i.reseau(false);
b.avance(SEUIL_COUPURE);
check(b.etat === 'coupure', 'navigateur hors ligne : coupure, même canal encore branché');
b.i.reseau(true);
check(b.etat === 'retour', 'navigateur revenu, canal resté branché : rétablie');

// Le canal seul, navigator.onLine ne bouge pas : couvert plus haut. Canal jamais branché : pas de pastille.
b = banc();
b.i.canal('CHANNEL_ERROR');
b.i.canal('CLOSED');
b.avance(60000);
check(b.vus.length === 0, 'canal jamais branché : la relecture de secours suffit, rien à montrer');

// Relecture ratée alors que le canal va bien
b = branche();
b.i.lecture(false);
check(b.i.lectureRatee(), 'relecture ratée : le suivi réessaie vite');
b.avance(2000);
b.i.lecture(true);
b.avance(60000);
check(b.vus.length === 0, 'une relecture ratée isolée : rien');

// Retour interrompu par une nouvelle coupure
b = branche();
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE);
b.i.canal('SUBSCRIBED');
b.avance(1000);
b.i.canal('CHANNEL_ERROR');
check(b.etat === null, 'nouvelle coupure pendant « rétablie » : on ne dit plus que c\'est rétabli');
b.avance(SEUIL_COUPURE);
check(b.etat === 'coupure', 'et les 4 s repartent');

// Onglet caché
b = branche();
b.cacher(true);
b.i.canal('CHANNEL_ERROR');
b.avance(120000);
check(b.vus.length === 0, 'onglet caché : aucune pastille, même après 2 min');
b = branche();
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE - 1000);
b.cacher(true);
b.avance(60000);
check(b.vus.length === 0 && b.minuteurs() === 0, 'compte en cours quand l\'onglet se cache : abandonné');
b = branche();
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE);
b.cacher(true);
check(b.etat === null, 'pastille montrée puis onglet caché : retirée');
b.i.canal('SUBSCRIBED');
b.cacher(false);
b.avance(60000);
check(!b.vus.includes('retour'), 'réveil après rétablissement pendant le sommeil : pas de « rétablie »');

// Réveil : le canal tombe en général juste après, et revient vite
b = branche();
b.cacher(true);
b.avance(600000);
b.cacher(false);
b.avance(500);
b.i.canal('CHANNEL_ERROR');
b.avance(DELAI_REVEIL + SEUIL_COUPURE - 501);
check(b.etat === null, 'réveil : le délai du canal passe avant les 4 s');
b.i.canal('SUBSCRIBED');
b.avance(60000);
check(b.vus.length === 0, 'réveil avec reconnexion dans le délai : aucun faux positif');
b = branche();
b.i.canal('CHANNEL_ERROR');
b.cacher(true);
b.cacher(false);
b.avance(DELAI_REVEIL + SEUIL_COUPURE - 1);
check(b.etat === null, 'réveil coupé : rien avant délai + 4 s');
b.avance(1);
check(b.etat === 'coupure', 'réveil, coupure qui dure : montrée après délai + 4 s');

// Invité : ni canal ni réseau, seulement les relectures
b = banc();
b.i.lecture(false);
b.avance(2000);
b.i.lecture(true);
b.avance(60000);
check(b.vus.length === 0, 'invité : une relecture ratée isolée, rien');
b.i.lecture(false);
b.avance(2000);
b.i.lecture(false);
b.avance(SEUIL_COUPURE - 2000);
check(b.etat === 'coupure', 'invité : relectures ratées pendant 4 s, coupure');
b.i.lecture(true);
check(b.etat === 'retour', 'invité : la relecture revient, rétablie (pas de canal à attendre)');
b.avance(DUREE_RETOUR);
check(b.etat === null, 'invité : puis rien');

// Nettoyage
b = branche();
b.i.canal('CHANNEL_ERROR');
b.avance(SEUIL_COUPURE);
b.i.arreter();
check(b.etat === null && b.minuteurs() === 0, 'en quittant : plus de pastille ni de minuteur');
b.i.canal('CLOSED');
b.i.lecture(false);
b.cacher(false);
b.avance(60000);
check(b.etat === null && b.minuteurs() === 0, 'les signaux tardifs (CLOSED de la fermeture du canal) sont ignorés');
b = branche();
b.i.canal('CHANNEL_ERROR');
b.i.arreter();
b.avance(60000);
check(b.vus.every((e) => e === null), 'en quittant pendant le compte : rien n\'apparaît ensuite');
b = branche();
b.i.canal('CHANNEL_ERROR');
b.i.lecture(true);
b.i.arreter();
b.i.lecture(true);
check(b.minuteurs() === 0, 'en quittant : le compte des 15 s s\'arrête aussi');

console.log(ko ? `${ko} échec(s)` : 'Tout est bon');
process.exit(ko ? 1 : 0);
