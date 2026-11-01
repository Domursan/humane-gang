// Applique les fichiers SQL de supabase/appliquer.txt pas encore notés dans supabase/appliquees.txt
// (lancé par .github/workflows/appliquer-sql.yml). API de gestion Supabase : POST /v1/projects/<ref>/database/query.
// Chaque fichier est envoyé en une seule requête (une transaction : tout ou rien). Résultat noté ligne par ligne :
// « <date> ok <chemin> » ou « <date> ERREUR <chemin> : <message> ». Un fichier en erreur est relancé au passage suivant (il n'a pas
// de ligne « ok ») : le corriger, ou le commenter dans appliquer.txt. Toute erreur met le job en échec, une fois le résultat noté.
import fs from 'node:fs';

const jeton = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.PROJECT_REF;
if (!jeton) { console.error('Secret SUPABASE_ACCESS_TOKEN manquant'); process.exit(1); }
const lire = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
const liste = lire('supabase/appliquer.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
const faits = new Set(lire('supabase/appliquees.txt').split('\n').filter((l) => / ok /.test(l)).map((l) => l.split(' ok ')[1]?.trim()));
let journal = lire('supabase/appliquees.txt');
let enEchec = false;
const noter = (ligne) => { console.log(ligne); journal += ligne + '\n'; };
for (const f of liste) {
  if (faits.has(f)) continue;
  if (!fs.existsSync(f)) { noter(`${new Date().toISOString()} ERREUR ${f} : fichier introuvable`); enEchec = true; continue; }
  let ok = false, detail = '';
  try {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: fs.readFileSync(f, 'utf8') }),
    });
    ok = r.ok;
    detail = await r.text();
  } catch (e) {
    detail = `réseau : ${e.message}`; // les fichiers déjà passés doivent rester notés
  }
  noter(ok ? `${new Date().toISOString()} ok ${f}` : `${new Date().toISOString()} ERREUR ${f} : ${detail.replace(/\s+/g, ' ').slice(0, 600)}`);
  if (!ok) { enEchec = true; break; } // les suivants dépendent souvent de celui-ci
}
fs.writeFileSync('supabase/appliquees.txt', journal);
if (enEchec) process.exitCode = 1;
