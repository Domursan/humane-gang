// Contrôle sans navigateur de outils/plan-depot.mjs : seules les parties entre marqueurs sont réécrites, le texte à la main
// reste intact, les workflows absents du tableau sont signalés, et le vrai PLAN-DU-DEPOT.md est à jour.
// Lancer : node tests/unitaires/check-plan-depot.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calculer, dateFr, lireDepot } from '../../outils/plan-depot.mjs';

let ko = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) ko++; };

const texte = `# Plan
Version : <!-- plan:derniere -->état du dépôt au 3 mars 2020 (dernière migration : 1)<!-- /plan:derniere -->.
Texte à la main (dernière migration : 7) intact.
Migrations de <!-- plan:plage -->001 à 002<!-- /plan:plage -->.

## Workflows GitHub

| Fichier | Rôle |
| --- | --- |
| \`ci.yml\` | tests |

## Suite
\`sonde.yml\` cité hors du tableau.
`;
const migrations = ['001_a.sql', '002_b.sql', '003_c.sql', 'README.md'];
const appliquees = '2026-10-01T10:00:00.000Z ok supabase/migrations/002_b.sql\n'
  + '2026-11-01T23:30:00.000Z ok supabase/migrations/003_c.sql\n';
const r = calculer({ texte, migrations, appliquees, workflows: ['ci.yml', 'sonde.yml', 'notes.md'] });

const sansMarqueurs = (t) => t.replace(/<!-- plan:(\w+) -->[^]*?<!-- \/plan:\1 -->/g, '');
check(r.texte.includes('<!-- plan:derniere -->état du dépôt au 2 novembre 2026 (dernière migration : 3)<!-- /plan:derniere -->'),
  'dernière migration : numéro et date (heure de Zurich, minuit passé)');
check(r.texte.includes('<!-- plan:plage -->001 à 003<!-- /plan:plage -->'), 'plage des migrations');
check(r.texte.includes('Texte à la main (dernière migration : 7) intact.'), 'texte hors marqueurs inchangé');
check(sansMarqueurs(r.texte) === sansMarqueurs(texte), 'rien ne change hors des marqueurs');
check(r.absents.join() === 'sonde.yml', 'workflow absent du tableau signalé (cité hors de la section : absent ; fichier non yml : ignoré)');
check(calculer({ texte: r.texte, migrations, appliquees, workflows: ['ci.yml'] }).texte === r.texte, 'idempotent');

const sansDate = calculer({ texte, migrations: ['001_a.sql', '009_z.sql'], appliquees: '', workflows: [] });
check(sansDate.texte.includes('au 3 mars 2020 (dernière migration : 9)'), 'migration non journalisée : ancienne date gardée');

check(dateFr('2026-11-01T12:39:01.265Z') === '1er novembre 2026' && dateFr('2026-10-28T08:00:00Z') === '28 octobre 2026', 'date en français, 1er');
check(dateFr('pas une date') === '', 'date invalide : vide');
let leve = false;
try { calculer({ texte: '# vide', migrations, appliquees, workflows: [] }); } catch { leve = true; }
check(leve, 'marqueur absent : erreur claire');

// Le vrai document du dépôt doit être à jour (sinon : node outils/plan-depot.mjs).
const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const vrai = lireDepot(racine);
check(vrai.texte === vrai.ancien, 'PLAN-DU-DEPOT.md à jour (node outils/plan-depot.mjs)');
check(vrai.absents.length === 0, `tous les workflows sont dans le tableau${vrai.absents.length ? ' (absents : ' + vrai.absents.join(', ') + ')' : ''}`);

console.log(ko ? `${ko} ECHEC(S)` : 'Tout est OK');
process.exit(ko ? 1 : 0);
