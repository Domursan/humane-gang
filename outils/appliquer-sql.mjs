// Applique les fichiers SQL de supabase/appliquer.txt pas encore notés dans supabase/appliquees.txt
// (lancé par .github/workflows/appliquer-sql.yml). API de gestion Supabase : POST /v1/projects/<ref>/database/query.
// Chaque fichier est envoyé en une seule requête (une transaction : tout ou rien). Résultat noté ligne par ligne :
// « <date> ok <chemin> » ou « <date> ERREUR <chemin> : <message> ». Un fichier en erreur est relancé au passage suivant (il n'a pas
// de ligne « ok ») : le corriger, ou le commenter dans appliquer.txt. Toute erreur met le job en échec, une fois le résultat noté.
//
// Maintenance à la demande : jamais automatique. Un fichier dont la première ligne est « -- hg:maintenance » active l'écran de
// maintenance du site (réglage site_identite.maintenance_active de hg_settings, lu par site-etat.js) juste avant lui et le retire
// après, même s'il échoue. Si la maintenance était déjà active, rien n'est touché (c'est celle de l'admin). Si le retrait échoue,
// l'exécution finit en échec avec un message clair : le job prévient alors le salon Staff.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/* ---------- Maintenance à la demande ---------- */

/** Vrai si la première ligne non vide du fichier est le marqueur « -- hg:maintenance ». */
export function veutMaintenance(sql) {
  const premiere = String(sql).replace(/^\uFEFF/, '').split('\n').find((l) => l.trim() !== '');
  return /^--\s*hg:maintenance\s*$/.test((premiere ?? '').trim());
}

const SQL_LIRE = "select value -> 'maintenance_active' as m from hg_settings where key = 'site_identite'";
/** Pose maintenance_active à $1 (true ou false) en gardant les autres champs du réglage ; crée la ligne au besoin. */
const sqlPoser = (valeur) => `insert into hg_settings (key, value, updated_at) values ('site_identite', '{"maintenance_active": ${valeur}}'::jsonb, now())
on conflict (key) do update set value = case when jsonb_typeof(hg_settings.value) = 'object' then hg_settings.value else '{}'::jsonb end
  || '{"maintenance_active": ${valeur}}'::jsonb, updated_at = now()`;
/** Retire le champ (le réglage retrouve son état d'avant quand il n'existait pas). */
const SQL_EFFACER = "update hg_settings set value = value - 'maintenance_active', updated_at = now() where key = 'site_identite' and jsonb_typeof(value) = 'object'";

/**
 * Active la maintenance si elle ne l'est pas. Lève une erreur si la lecture ou l'écriture échoue : une migration qui demande
 * la maintenance ne passe pas sans elle, et le fichier en erreur est relancé au passage suivant.
 * @param {(sql: string) => Promise<{ok: boolean, detail: string}>} requete Envoi d'une requête SQL.
 * @returns {Promise<null | {avant: null | boolean}>} null : rien à retirer ; sinon l'état d'avant (null = champ absent).
 */
export async function activerMaintenance(requete, log = console.log) {
  const lu = await requete(SQL_LIRE);
  if (!lu.ok) throw new Error(`état illisible : ${lu.detail.slice(0, 200)}`);
  const lignes = JSON.parse(lu.detail || '[]');
  const avant = Array.isArray(lignes) && lignes.length ? lignes[0].m : null;
  if (avant === true) { log('Maintenance déjà active (admin) : on n\'y touche pas.'); return null; }
  const ecrit = await requete(sqlPoser('true'));
  if (!ecrit.ok) throw new Error(ecrit.detail.slice(0, 200));
  log('Maintenance activée pour la migration.');
  return { avant: typeof avant === 'boolean' ? avant : null };
}

/**
 * Remet la maintenance dans l'état d'avant (3 essais). Ne lève jamais d'erreur.
 * @returns {Promise<string>} Vide si le retrait a réussi, sinon le message d'échec.
 */
export async function retirerMaintenance(requete, { avant }, log = console.log, pause = 3000) {
  let detail = '';
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await requete(avant === false ? sqlPoser('false') : SQL_EFFACER);
      if (r.ok) { log('Maintenance retirée.'); return ''; }
      detail = r.detail;
    } catch (e) { detail = e.message; }
    if (i < 3 && pause) await new Promise((ok) => setTimeout(ok, pause));
  }
  return detail.replace(/\s+/g, ' ').slice(0, 300);
}

/**
 * Applique un fichier SQL, avec la maintenance autour si son marqueur le demande.
 * @returns {Promise<{ok: boolean, detail: string, retrait: string}>} retrait : vide, ou message si la maintenance est restée active.
 */
export async function appliquerFichier(requete, sql, log = console.log, pause = 3000) {
  let etat = null;
  if (veutMaintenance(sql)) {
    try {
      etat = await activerMaintenance(requete, log);
    } catch (e) {
      return { ok: false, detail: `maintenance non activée, migration non lancée : ${e.message}`, retrait: '' };
    }
  }
  let r = { ok: false, detail: '' }, retrait = '';
  try {
    r = await requete(sql);
  } catch (e) {
    r = { ok: false, detail: `réseau : ${e.message}` }; // les fichiers déjà passés doivent rester notés
  } finally {
    if (etat) retrait = await retirerMaintenance(requete, etat, log, pause);
  }
  return { ok: r.ok, detail: r.detail, retrait };
}

/* ---------- Programme principal ---------- */

async function main() {
  const jeton = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.PROJECT_REF;
  if (!jeton) { console.error('Secret SUPABASE_ACCESS_TOKEN manquant'); process.exit(1); }
  const requete = async (query) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return { ok: r.ok, detail: await r.text() };
  };
  const lire = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const liste = lire('supabase/appliquer.txt').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const faits = new Set(lire('supabase/appliquees.txt').split('\n').filter((l) => / ok /.test(l)).map((l) => l.split(' ok ')[1]?.trim()));
  let journal = lire('supabase/appliquees.txt');
  let enEchec = false;
  const noter = (ligne) => { console.log(ligne); journal += ligne + '\n'; };
  for (const f of liste) {
    if (faits.has(f)) continue;
    if (!fs.existsSync(f)) { noter(`${new Date().toISOString()} ERREUR ${f} : fichier introuvable`); enEchec = true; continue; }
    const { ok, detail, retrait } = await appliquerFichier(requete, fs.readFileSync(f, 'utf8'));
    noter(ok ? `${new Date().toISOString()} ok ${f}` : `${new Date().toISOString()} ERREUR ${f} : ${detail.replace(/\s+/g, ' ').slice(0, 600)}`);
    if (retrait) {
      // Sans retrait, les membres restent devant l'écran de maintenance : à défaire à la main.
      noter(`${new Date().toISOString()} ERREUR maintenance restée active après ${f} : la retirer dans Admin › Site › État du site (${retrait})`);
      enEchec = true;
    }
    if (!ok) { enEchec = true; break; } // les suivants dépendent souvent de celui-ci
  }
  fs.writeFileSync('supabase/appliquees.txt', journal);
  if (enEchec) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
