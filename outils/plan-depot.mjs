// Tient à jour les parties factuelles de PLAN-DU-DEPOT.md : celles qui sont entre des marqueurs de commentaire HTML
//   <!-- plan:derniere -->…<!-- /plan:derniere -->   date et numéro de la dernière migration
//   <!-- plan:plage -->…<!-- /plan:plage -->         plage des migrations (première à dernière)
// Tout le reste du document est écrit à la main et n'est jamais touché. Signale aussi les workflows de .github/workflows/
// absents du tableau de la section « Workflows GitHub » (à compléter à la main).
// La date est celle de l'application de la dernière migration dans supabase/appliquees.txt (sinon l'ancienne date est gardée).
// Lancé par .github/workflows/appliquer-sql.yml (étape « Noter le résultat »). À la main : node outils/plan-depot.mjs
// Option --verifier : n'écrit rien, sort en erreur si le document n'est pas à jour.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** Date d'un horodatage ISO en français, à l'heure de Zurich : « 1er novembre 2026 ». */
export function dateFr(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Zurich', day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(d).map((x) => [x.type, x.value]));
  const jour = Number(p.day);
  return `${jour === 1 ? '1er' : jour} ${MOIS[Number(p.month) - 1]} ${p.year}`;
}

/** Remplace le contenu entre les deux marqueurs d'un nom (chaque marqueur doit exister une fois). */
function remplacer(texte, nom, contenu) {
  const re = new RegExp(`(<!-- plan:${nom} -->)([^]*?)(<!-- /plan:${nom} -->)`);
  if (!re.test(texte)) throw new Error(`marqueur plan:${nom} absent de PLAN-DU-DEPOT.md`);
  return texte.replace(re, (_, ouvre, ancien, ferme) => ouvre + contenu(ancien) + ferme);
}

/**
 * Calcule le document à jour.
 * @param {{texte: string, migrations: string[], appliquees: string, workflows: string[]}} e
 *   migrations : noms des fichiers de supabase/migrations/ ; appliquees : contenu de supabase/appliquees.txt ;
 *   workflows : noms des fichiers de .github/workflows/.
 * @returns {{texte: string, absents: string[]}} Nouveau texte, et workflows absents du tableau.
 */
export function calculer({ texte, migrations, appliquees, workflows }) {
  const numeros = migrations.map((f) => /^(\d+)_.*\.sql$/.exec(f)).filter(Boolean).map((m) => ({ n: m[1], f: m[0] }))
    .sort((a, b) => Number(a.n) - Number(b.n) || a.f.localeCompare(b.f));
  if (!numeros.length) throw new Error('aucune migration trouvée');
  const premiere = numeros[0].n, derniere = numeros.at(-1);
  // Application la plus récente d'un fichier portant ce numéro maximal.
  const dates = appliquees.split('\n').map((l) => /^(\S+) ok \S*\/(\d+)_[^/\s]*\.sql\s*$/.exec(l)).filter((m) => m && m[2] === derniere.n).map((m) => m[1]);
  const date = dates.length ? dateFr(dates.at(-1)) : '';
  let out = remplacer(texte, 'derniere', (ancien) => {
    const avant = date || (/au (.+?) \(/.exec(ancien) || [])[1] || '';
    return `état du dépôt au ${avant} (dernière migration : ${Number(derniere.n)})`;
  });
  out = remplacer(out, 'plage', () => `${premiere} à ${derniere.n}`);

  // Section des workflows : un workflow y figure s'il apparaît en code (`nom.yml`) dans le tableau.
  const debut = out.indexOf('## Workflows GitHub');
  const fin = debut < 0 ? -1 : out.indexOf('\n## ', debut + 1);
  const section = debut < 0 ? '' : out.slice(debut, fin < 0 ? undefined : fin);
  const absents = workflows.filter((w) => /\.ya?ml$/.test(w) && !section.includes('`' + w + '`')).sort();
  return { texte: out, absents };
}

/** Lit le dépôt à partir de sa racine et renvoie le calcul. */
export function lireDepot(racine) {
  const lire = (f) => (fs.existsSync(path.join(racine, f)) ? fs.readFileSync(path.join(racine, f), 'utf8') : '');
  const liste = (d) => (fs.existsSync(path.join(racine, d)) ? fs.readdirSync(path.join(racine, d)) : []);
  const texte = lire('PLAN-DU-DEPOT.md');
  return { ancien: texte, ...calculer({ texte, migrations: liste('supabase/migrations'), appliquees: lire('supabase/appliquees.txt'), workflows: liste('.github/workflows') }) };
}

function main() {
  const verifier = process.argv.includes('--verifier');
  const { ancien, texte, absents } = lireDepot(process.cwd());
  for (const w of absents) console.log(`${process.env.GITHUB_ACTIONS ? '::warning::' : ''}Workflow absent du tableau de PLAN-DU-DEPOT.md : ${w}`);
  if (texte === ancien) { console.log('PLAN-DU-DEPOT.md déjà à jour.'); return; }
  if (verifier) { console.error('PLAN-DU-DEPOT.md n\'est pas à jour : lancer node outils/plan-depot.mjs'); process.exitCode = 1; return; }
  fs.writeFileSync('PLAN-DU-DEPOT.md', texte);
  console.log('PLAN-DU-DEPOT.md mis à jour.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
