/**
 * Lance toute la suite de tests, l'un après l'autre : vérifications statiques, tests de fumée,
 * puis chaque parcours/<catégorie>/parcours-*.cjs (les vérifications sont dans unitaires/ et controles/).
 * Chaque fichier a une limite de temps (4 min) et, s'il échoue ou dépasse la limite, il est relancé une fois :
 * un navigateur lent ou bloqué (fréquent sur les machines de GitHub) ne fait pas échouer toute la suite.
 * Sur un poste : s'arrête au premier fichier qui échoue deux fois.
 *
 * Options (utilisées par la CI GitHub, .github/workflows/ci.yml) :
 *   --shard=K/N   ne lance que le morceau K sur N de la suite (découpe déterministe de la liste triée,
 *                 un fichier sur N à partir du K-ième). Les vérifications statiques (check-js, check-rpc) sont
 *                 alors laissées à la tâche « Vérifications » de la CI.
 *   --continuer   va jusqu'au bout même après un échec, puis sort en erreur (implicite avec --shard ou CI=true) :
 *                 le résumé liste alors tous les fichiers en échec, pas seulement le premier.
 * Résumé : si GITHUB_STEP_SUMMARY est défini (GitHub Actions), un tableau Markdown y est ajouté (fichier,
 * résultat, durée, relancé ou non). Le bilan JSON est aussi écrit dans tests/shots/resultats[-K].json, pour le
 * résumé global de la CI (tests/ci-resume.cjs).
 * Lancer, depuis tests/ : npm test   (ou : node run-all.cjs [--shard=1/4] [--continuer])
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
/** Limite de temps d'un fichier de test, en millisecondes. */
const LIMITE_MS = 4 * 60_000;

/* ---------- Options ---------- */
const args = process.argv.slice(2);
const shardArg = args.find((a) => a.startsWith('--shard='));
let shard = null; // { k, n }
if (shardArg) {
  const m = /^--shard=(\d+)\/(\d+)$/.exec(shardArg);
  const k = m ? Number(m[1]) : 0, n = m ? Number(m[2]) : 0;
  if (!m || n < 1 || k < 1 || k > n) { console.error(`Option invalide : ${shardArg} (attendu --shard=K/N, 1 ≤ K ≤ N)`); process.exit(2); }
  shard = { k, n };
}
const continuer = args.includes('--continuer') || !!shard || process.env.CI === 'true';

/* ---------- Liste des fichiers ---------- */
/** Fichiers parcours-*.cjs de parcours/<catégorie>/, chemins relatifs à tests/ (triés). */
const parcours = fs.readdirSync(path.join(dir, 'parcours'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .flatMap((d) => fs.readdirSync(path.join(dir, 'parcours', d.name)).filter((f) => /^parcours-.*\.cjs$/.test(f)).map((f) => `parcours/${d.name}/${f}`))
  .sort();
const STATIQUES = ['controles/check-js.cjs', 'controles/check-rpc.mjs', 'controles/check-migrations.cjs', 'controles/check-echappement.cjs', 'controles/check-polices.cjs', 'unitaires/check-hg-discord.mjs', 'unitaires/check-hg-calendar.mjs', 'unitaires/check-notif-prefs.mjs', 'unitaires/check-ton-tour.mjs', 'unitaires/check-anniversaires.mjs', 'unitaires/check-salon-etat.mjs', 'unitaires/hg-archive-lib.mjs', 'unitaires/check-plan-depot.mjs', 'unitaires/check-maintenance-sql.mjs', 'unitaires/check-comptes-garde.mjs'];
/** Site construit (outils/build/construire.mjs) : contrôles lancés sur _site/ seulement s'il existe, sinon sautés. */
const SITE_CONSTRUIT = path.resolve(dir, '..', '_site');
const CONSTRUIT = ['controles/check-build.cjs'];
const constructionPresente = fs.existsSync(SITE_CONSTRUIT);
const NAVIGATEUR = ['controles/smoke.cjs', 'controles/smoke-admin.cjs', 'controles/composants-admin-ui.cjs', 'controles/contraste-plateaux.cjs', ...(constructionPresente ? CONSTRUIT : []), ...parcours];
/** Suite complète, ou le morceau demandé (un fichier sur N, liste triée : la découpe ne dépend que des noms). */
const suite = shard
  ? NAVIGATEUR.filter((_, i) => i % shard.n === shard.k - 1)
  : [...STATIQUES, ...NAVIGATEUR];

/**
 * Lance un fichier de test et indique s'il a réussi dans le temps imparti.
 * @param {string} f Nom du fichier dans tests/.
 * @returns {{ ok: boolean, ms: number, delai: boolean }} Réussite, durée, limite de temps dépassée.
 */
function lancer(f) {
  const t0 = Date.now();
  // Les contrôles du site construit testent _site/ (la version publiée), pas les sources.
  const env = CONSTRUIT.includes(f) ? { ...process.env, HG_ROOT: SITE_CONSTRUIT } : process.env;
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit', timeout: LIMITE_MS, killSignal: 'SIGKILL', env });
  const delai = !!(r.error && r.error.code === 'ETIMEDOUT');
  if (delai) console.error(`\nLimite de temps dépassée : ${f}`);
  return { ok: r.status === 0, ms: Date.now() - t0, delai };
}

/** Durée lisible : « 42 s » ou « 3 min 05 ». */
const duree = (ms) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`;
};

/* ---------- Exécution ---------- */
if (!constructionPresente) console.log('Site construit (_site/) absent : check-build.cjs sauté (lancer outils/build/construire.mjs pour l\'inclure).');
const t0 = Date.now();
/** Résultat de chaque fichier lancé : { f, ok, relance, ms, delai }. */
const resultats = [];
let arret = false;
for (const f of suite) {
  process.stdout.write(`\n=== ${f}\n`);
  const a = lancer(f);
  if (a.ok) { resultats.push({ f, ok: true, relance: false, ms: a.ms, delai: false }); continue; }
  console.error(`\nNouvel essai : ${f}`);
  const b = lancer(f);
  resultats.push({ f, ok: b.ok, relance: true, ms: a.ms + b.ms, delai: a.delai && b.delai });
  if (!b.ok) {
    console.error(`\nÉchec : ${f}`);
    if (!continuer) { arret = true; break; }
  }
}

/* ---------- Bilan ---------- */
const echecs = resultats.filter((r) => !r.ok).map((r) => r.f);
const relances = resultats.filter((r) => r.ok && r.relance).map((r) => r.f);
const total = Date.now() - t0;
const nom = shard ? `morceau ${shard.k} / ${shard.n}` : 'suite complète';

// Bilan JSON (lu par tests/ci-resume.cjs) : dans tests/shots/, déposé par la CI avec les captures.
try {
  const shots = path.join(dir, 'shots');
  fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, `resultats${shard ? `-${shard.k}` : ''}.json`),
    JSON.stringify({ shard: shard ? `${shard.k}/${shard.n}` : null, ms: total, prevus: suite.length, resultats }, null, 2));
} catch (e) { console.error('Bilan JSON non écrit : ' + e.message); }

// Résumé GitHub Actions (onglet « Summary » de la tâche) : tableau Markdown.
if (process.env.GITHUB_STEP_SUMMARY) {
  const ligne = (r) => `| \`${r.f}\` | ${r.ok ? (r.relance ? 'OK au second essai' : 'OK') : (r.delai ? '**Échec (délai)**' : '**Échec**')} | ${duree(r.ms)} | ${r.relance ? 'oui' : 'non'} |`;
  const md = [
    `### Tests : ${nom}`,
    '',
    `${resultats.length} fichiers · ${resultats.length - echecs.length - relances.length} OK · ${relances.length} réussis au second essai · ${echecs.length} en échec · durée ${duree(total)}`,
    '',
    '| Fichier | Résultat | Durée | Relancé |',
    '|---|---|---|---|',
    ...[...resultats].sort((x, y) => (x.ok - y.ok) || (y.relance - x.relance) || x.f.localeCompare(y.f)).map(ligne),
    '',
  ].join('\n');
  try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); } catch (e) { console.error('Résumé non écrit : ' + e.message); }
}

if (echecs.length) {
  console.error(`\n${nom} : ${echecs.length} fichier(s) en échec : ${echecs.join(', ')}.${arret ? ' Arrêt au premier échec (option --continuer pour tout lancer).' : ''}`);
  process.exit(1);
}
console.log(`\n${shard ? `Morceau ${shard.k} / ${shard.n}` : 'Suite complète'} : ${suite.length} fichiers, tous OK.${relances.length ? ` Réussis au second essai : ${relances.join(', ')}.` : ''}`);
