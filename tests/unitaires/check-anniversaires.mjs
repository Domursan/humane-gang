// Contrôle sans navigateur de site/assets/espaces/accueil/anniversaires-liste.js (idée 75) : anniversaires des 30 prochains jours,
// passage d'année, 29 février, jour même, carte vide.
// Lancer : node tests/unitaires/check-anniversaires.mjs
import { prochainsAnniversaires } from '../../site/assets/espaces/accueil/anniversaires-liste.js';

let ko = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) ko++; };

const GENS = [['Lina', '01.11'], ['Karim', '03.11'], ['Noé', '14.11'], ['Sacha', '30.12'], ['Maya', '01.01'], ['Théo', '04.01'], ['Inès', '29.02'], ['Zoé', '12.06'], ['Sans', null]]
  .map(([pseudo, birthday_dm]) => ({ pseudo, birthday_dm }));
const noms = (l) => l.map((m) => `${m.pseudo} ${m.quand.getDate()}.${m.quand.getMonth() + 1}`).join(', ');
const a = (y, m, d) => noms(prochainsAnniversaires(GENS, new Date(y, m - 1, d, 15)));

check(a(2026, 11, 1) === 'Lina 1.11, Karim 3.11, Noé 14.11', 'le jour même : Lina d\'abord (dans = 0), puis les suivants');
check(prochainsAnniversaires(GENS, new Date(2026, 10, 1, 23, 59))[0].dans === 0, 'aujourd\'hui : dans = 0, même tard le soir');
check(a(2026, 11, 2) === 'Karim 3.11, Noé 14.11', 'les jours passés sont retirés (Lina du 1er)');
check(a(2026, 10, 28) === 'Lina 1.11, Karim 3.11, Noé 14.11', 'fin octobre : les anniversaires de novembre apparaissent');
check(a(2026, 12, 20) === 'Sacha 30.12, Maya 1.1, Théo 4.1', 'décembre vers janvier : passage d\'année, sans plafond de lignes');
check(a(2027, 1, 31) === 'Inès 28.2', 'année non bissextile : le 29 février est fêté le 28 (31 janvier → 28 février, 28 jours)');
check(a(2027, 2, 28) === 'Inès 28.2', 'année non bissextile : le 28 février lui-même');
check(a(2028, 1, 31) === 'Inès 29.2', 'année bissextile : le 29 février reste le 29');
check(a(2027, 12, 31) === 'Maya 1.1, Théo 4.1', 'du 31 décembre : année suivante');
check(a(2027, 12, 20) === 'Sacha 30.12, Maya 1.1, Théo 4.1', 'décembre 2027, mêmes personnes');
check(a(2027, 2, 1) === 'Inès 28.2', '1er février 2027 : Inès le 28');
check(a(2027, 2, 15) === 'Inès 28.2', 'mi-février 2027 : Inès le 28');
check(a(2028, 2, 29) === 'Inès 29.2', 'le 29 février 2028 : jour même');
check(a(2029, 3, 1) === '', 'le 1er mars : le 29 février est passé, loin');
check(a(2026, 7, 1) === '', 'carte vide : personne dans les 30 jours');
check(prochainsAnniversaires([], new Date()).length === 0 && prochainsAnniversaires(null, new Date()).length === 0, 'aucun membre : liste vide');
const dans30 = prochainsAnniversaires([{ pseudo: 'A', birthday_dm: '01.12' }, { pseudo: 'B', birthday_dm: '02.12' }], new Date(2026, 10, 1));
check(noms(dans30) === 'A 1.12', 'borne : 30 jours inclus (1er décembre), 31 jours exclu (2 décembre)');
const beaucoup = Array.from({ length: 12 }, (_, i) => ({ pseudo: `M${String(i).padStart(2, '0')}`, birthday_dm: `${String(5 + i).padStart(2, '0')}.11` }));
check(prochainsAnniversaires(beaucoup, new Date(2026, 10, 1)).length === 12, 'pas de plafond de lignes');
const mmeJour = prochainsAnniversaires([{ pseudo: 'Zed', birthday_dm: '05.11' }, { pseudo: 'Ana', birthday_dm: '05.11' }], new Date(2026, 10, 1));
check(mmeJour.map((m) => m.pseudo).join() === 'Ana,Zed', 'même jour : ordre alphabétique');

console.log(ko ? `${ko} ECHEC(S)` : 'Tout est OK');
process.exit(ko ? 1 : 0);
