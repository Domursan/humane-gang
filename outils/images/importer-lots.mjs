// Importe en production les lots d'images des jeux (lancé à la main par .github/workflows/importer-lots.yml).
// Listes : lots/framed.json (affiches, zones du titre, écartées) et lots/geo.json (photos Wikimedia Commons, auteur, licence, lien).
// Usage : node outils/images/importer-lots.mjs espace | framed | geo | tout [--limite N]
//   espace : lecture seule. Place occupée par bucket, comparée au plafond ; rien n'est écrit.
//   framed : 6 images par affiche dans le bucket privé hg-jeux (framed/<dossier au hasard>/<n>.webp), puis une ligne hg_framed_films.
//   geo    : une photo dans hg-photos (<dossier neutre>/geo/<nom au hasard>.webp), puis une ligne hg_geo_rounds en réserve.
//   essai <dossier> : traitement local d'un échantillon, sans jeton ni base (--limite N, 12 par défaut).
// Idempotent et reprenable : ce qui existe déjà en base est sauté (film par son titre, photo par sa source dans credit). Un titre
// déjà présent (sans casse, accents ni ponctuation) n'est jamais recréé. Les fichiers portent des noms tirés au hasard : un dépôt
// interrompu avant sa ligne est refait ailleurs et laisse quelques fichiers orphelins, sans effet sur les jeux.
// La base fait foi ; outils/images/rapport-lots.json garde le compte rendu.
// Base : API de gestion Supabase (secret SUPABASE_ACCESS_TOKEN, comme rapatrier-cartes.mjs). Stockage : clé de service, lue en
// mémoire par cette même API (ou secret SUPABASE_SERVICE_ROLE_KEY), masquée dans les journaux, jamais écrite.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const RAPPORT = path.join(ICI, 'rapport-lots.json');
const UA = 'HumaneGangImport/1.0 (+https://humane-gang.com; import ponctuel)';
const jeton = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.PROJECT_REF;
/** Plan gratuit Supabase : 1 Go. Au-delà de ce total après import, rien ne part. */
const PLAFOND_TOTAL = 700 * 1024 * 1024;
/** Poids maximal envoyé par ce script, tous lots confondus. */
const BUDGET_LOTS = 300 * 1024 * 1024;
/** Dossier de la réserve : le chemin exige un uuid, mais ces photos n'appartiennent à aucun membre. */
const GEO_DOSSIER = uuidStable('hg-geo-commons');
/** Échelle du score des photos du monde (hg_geo_rounds.echelle_km) : à 50 km, presque toutes vaudraient 0 point. */
const ECHELLE_GEO_KM = 1500;
/** Lignes de films écrites en une requête. */
const PAQUET = 20;
const MO = 1024 * 1024;

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lire = (nom) => JSON.parse(fs.readFileSync(path.join(ICI, 'lots', nom), 'utf8'));
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
/** Titre comparable : sans casse, accents ni ponctuation (normalize de devine.js). */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Uuid stable déduit d'un texte (mêmes règles qu'un uuid v5). */
function uuidStable(texte) {
  const h = crypto.createHash('sha1').update(texte).digest('hex');
  const v = ((parseInt(h[16], 16) & 3) | 8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Nom neutre d'une photo : le chemin est lisible avant le vote, le dépôt est public et geo.json aussi. Tiré au hasard, jamais déduit de la source. */
const nomPhoto = () => `${crypto.randomBytes(12).toString('hex')}.webp`;

/** Requête SQL en tant que propriétaire de la base. */
async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`SQL : ${r.status} ${txt.slice(0, 400)}`);
  return JSON.parse(txt);
}

/** Clé de service pour le stockage. Jamais journalisée. */
async function cleStockage() {
  let cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${jeton}` } });
    if (!r.ok) throw new Error(`Clé de service inaccessible (${r.status}) : ajouter le secret SUPABASE_SERVICE_ROLE_KEY au dépôt`);
    const liste = await r.json();
    cle = (liste.find((k) => k.name === 'service_role') || liste.find((k) => k.type === 'secret'))?.api_key;
    if (!cle) throw new Error('Clé de service absente de la réponse : ajouter le secret SUPABASE_SERVICE_ROLE_KEY au dépôt');
  }
  if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${cle}`);
  return cle;
}

/** Dépose (ou remplace) un fichier WebP. */
async function deposer(cle, bucket, chemin, buf) {
  for (let essai = 1; ; essai++) {
    const r = await fetch(`https://${ref}.supabase.co/storage/v1/object/${bucket}/${chemin}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, apikey: cle, 'Content-Type': 'image/webp', 'x-upsert': 'true', 'Cache-Control': '3600' },
      body: buf,
    });
    if (r.ok) return;
    if (essai >= 3) throw new Error(`stockage : ${r.status} ${(await r.text()).slice(0, 200)}`);
    await pause(2000 * essai);
  }
}

/** Télécharge une image de Wikimedia, doucement (une par seconde), en respectant Retry-After. */
async function telecharger(url) {
  for (let essai = 1; ; essai++) {
    await pause(1100);
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(40000) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if ((r.status !== 429 && r.status < 500) || essai >= 4) throw new Error(`téléchargement : HTTP ${r.status}`);
    await pause((Number(r.headers.get('retry-after')) || 10 * essai) * 1000);
  }
}

/** Compte rendu, gardé sur disque à chaque étape : une coupure n'en perd rien. */
const rapport = fs.existsSync(RAPPORT) ? JSON.parse(fs.readFileSync(RAPPORT, 'utf8')) : {};
function noter(cle, valeur) {
  rapport[cle] = valeur;
  rapport.date = new Date().toISOString();
  fs.writeFileSync(RAPPORT, JSON.stringify(rapport, null, 2) + '\n');
}

/** Place occupée par bucket et taille de la base. */
async function mesure() {
  const buckets = await sql(`select bucket_id, count(*)::int as fichiers, coalesce(sum((metadata->>'size')::bigint), 0)::bigint as octets
    from storage.objects group by 1 order by 3 desc`);
  const [{ base }] = await sql('select pg_database_size(current_database())::bigint as base');
  const total = buckets.reduce((a, b) => a + Number(b.octets), 0);
  return { total, base: Number(base), buckets };
}

/** Vérifie la place : stoppe si le total prévu dépasse le plafond. */
async function espace(prevu = 0) {
  const m = await mesure();
  const libre = PLAFOND_TOTAL - m.total - prevu;
  console.log(`Stockage : ${(m.total / MO).toFixed(1)} Mo occupés, ${(prevu / MO).toFixed(1)} Mo prévus, plafond ${PLAFOND_TOTAL / MO} Mo, marge ${(libre / MO).toFixed(1)} Mo. Base : ${(m.base / MO).toFixed(1)} Mo.`);
  for (const b of m.buckets) console.log(`  ${b.bucket_id} : ${b.fichiers} fichiers, ${(Number(b.octets) / MO).toFixed(1)} Mo`);
  noter('espace', { ...m, prevu, plafond: PLAFOND_TOTAL, marge: libre });
  if (libre < 0) throw new Error('Pas assez de place : import arrêté, rien n’a été envoyé');
}

/** Écrit un paquet de films ; on conflict : une reprise ne double rien. */
async function ecrireFilms(paquet) {
  if (!paquet.length) return 0;
  const valeurs = paquet.map((f) => `(${q(f.id)}::uuid, ${q(f.titre)}, ${f.annee ?? 'null'}, array[${f.frames.map(q).join(',')}]::text[], true)`).join(',\n');
  const r = await sql(`insert into public.hg_framed_films (id, title, year, frames, active) values ${valeurs}
    on conflict (id) do nothing returning id`);
  return r.length;
}

/** Lot 1 : affiches Framed. */
async function framed(limite, envoye) {
  const { imagesAffiche, refusAffiche } = await import('./lots-images.mjs');
  const { affiches, poids_prevu_mo: prevu } = lire('framed.json');
  await espace(prevu * MO);
  const cle = await cleStockage();
  const presents = await sql('select title from public.hg_framed_films');
  const titres = new Set(presents.map((f) => norm(f.title)));
  const bilan = { lignes_avant: presents.length, ajoutes: 0, deja_la: [], ecartes: [], echecs: [], octets: 0 };
  let paquet = [], faits = 0;
  for (const e of affiches) {
    if (faits >= limite) break;
    if (titres.has(norm(e.titre))) { bilan.deja_la.push(e.titre); continue; }
    if (envoye.octets > BUDGET_LOTS) throw new Error('Budget de 300 Mo atteint : import arrêté');
    faits++;
    try {
      const buf = await telecharger(e.url);
      const refus = await refusAffiche(buf);
      if (refus) { bilan.ecartes.push({ titre: e.titre, motif: refus }); continue; }
      const { images } = await imagesAffiche(buf, e.zones);
      // hg_framed_state donne les chemins des images et l'id de chaque film proposé : le dossier ne doit pas être l'id du film.
      const id = uuidStable(`hg-framed:${norm(e.titre)}`), dossier = crypto.randomUUID(), frames = [];
      for (let i = 0; i < images.length; i++) {
        const chemin = `framed/${dossier}/${i + 1}.webp`;
        await deposer(cle, 'hg-jeux', chemin, images[i]);
        frames.push(chemin);
        envoye.octets += images[i].length; bilan.octets += images[i].length;
      }
      // La ligne part en dernier, images envoyées : le tirage du jour (migration 188) ne voit jamais un film incomplet.
      paquet.push({ id, titre: e.titre, annee: e.annee, frames });
      titres.add(norm(e.titre));
    } catch (err) {
      bilan.echecs.push({ titre: e.titre, erreur: String(err.message || err) });
    }
    if (paquet.length >= PAQUET) {
      bilan.ajoutes += await ecrireFilms(paquet); paquet = [];
      noter('framed', bilan);
      console.log(`Framed : ${bilan.ajoutes} ajoutés, ${(bilan.octets / MO).toFixed(1)} Mo`);
    }
  }
  bilan.ajoutes += await ecrireFilms(paquet);
  noter('framed', bilan);
  console.log(`Framed : ${bilan.ajoutes} ajoutés, ${bilan.deja_la.length} déjà là, ${bilan.ecartes.length} écartés, ${bilan.echecs.length} échecs, ${(bilan.octets / MO).toFixed(1)} Mo`);
}

/** Lot 2 : photos GeoGuessr, en réserve (day null). */
async function geo(limite, envoye) {
  const { imagePhoto } = await import('./lots-images.mjs');
  const { photos, poids_prevu_mo: prevu } = lire('geo.json');
  const [{ n }] = await sql(`select count(*)::int as n from information_schema.columns
    where table_schema = 'public' and table_name = 'hg_geo_rounds' and column_name in ('credit', 'echelle_km')`);
  if (n < 2) throw new Error('Migration 187 pas encore appliquée : colonne credit ou echelle_km absente');
  await espace(prevu * MO);
  const cle = await cleStockage();
  const presents = new Set((await sql(`select credit->>'source' as source from public.hg_geo_rounds where credit is not null`)).map((r) => r.source));
  const bilan = { ajoutes: 0, deja_la: 0, echecs: [], octets: 0 };
  let faits = 0;
  for (const p of photos) {
    if (faits >= limite) break;
    if (presents.has(p.page)) { bilan.deja_la++; continue; }
    if (envoye.octets > BUDGET_LOTS) throw new Error('Budget de 300 Mo atteint : import arrêté');
    faits++;
    try {
      const webp = await imagePhoto(await telecharger(p.image));
      const chemin = `${GEO_DOSSIER}/geo/${nomPhoto()}`;
      await deposer(cle, 'hg-photos', chemin, webp);
      envoye.octets += webp.length; bilan.octets += webp.length;
      const credit = { auteur: p.auteur, licence: p.licence, licence_url: p.licence_url, source: p.page };
      await sql(`insert into public.hg_geo_rounds (day, image_path, lat, lon, label, active, credit, echelle_km)
        values (null, ${q(chemin)}, ${Number(p.lat)}, ${Number(p.lon)}, ${q(p.label)}, true, ${q(JSON.stringify(credit))}::jsonb, ${ECHELLE_GEO_KM})`);
      bilan.ajoutes++;
    } catch (err) {
      bilan.echecs.push({ lieu: p.label, erreur: String(err.message || err) });
    }
    noter('geo', bilan);
  }
  noter('geo', bilan);
  console.log(`GeoGuessr : ${bilan.ajoutes} ajoutées, ${bilan.deja_la} déjà là, ${bilan.echecs.length} échecs, ${(bilan.octets / MO).toFixed(1)} Mo`);
}

/** Échantillon local : mêmes traitements, aucune écriture distante. */
async function essai(dossier, limite) {
  const { imagesAffiche, imagePhoto } = await import('./lots-images.mjs');
  let octets = 0;
  for (const e of lire('framed.json').affiches.slice(0, limite)) {
    const { images } = await imagesAffiche(await telecharger(e.url), e.zones);
    const d = path.join(dossier, 'framed', uuidStable(`hg-framed:${norm(e.titre)}`));
    fs.mkdirSync(d, { recursive: true });
    images.forEach((b, i) => { fs.writeFileSync(path.join(d, `${i + 1}.webp`), b); octets += b.length; });
  }
  for (const p of lire('geo.json').photos.slice(0, limite)) {
    const webp = await imagePhoto(await telecharger(p.image));
    const d = path.join(dossier, 'geo');
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, nomPhoto()), webp);
    octets += webp.length;
  }
  console.log(`Essai : ${(octets / MO).toFixed(1)} Mo dans ${dossier}`);
}

const [etape, arg] = process.argv.slice(2);
const iLimite = process.argv.indexOf('--limite');
const limite = iLimite > 0 ? Number(process.argv[iLimite + 1]) : null;
if (limite !== null && !(Number.isInteger(limite) && limite > 0)) { console.error('--limite attend un entier positif'); process.exit(1); }
const envoye = { octets: 0 };
if (etape === 'essai') {
  await essai(arg, limite ?? 12);
} else if (['espace', 'framed', 'geo', 'tout'].includes(etape)) {
  if (!jeton || !ref) { console.error('SUPABASE_ACCESS_TOKEN ou PROJECT_REF manquant'); process.exit(1); }
  const n = limite ?? Infinity;
  if (etape === 'espace') await espace(0);
  if (etape === 'framed' || etape === 'tout') await framed(n, envoye);
  if (etape === 'geo' || etape === 'tout') await geo(n, envoye);
  if (etape !== 'espace') await espace(0);
} else {
  console.error('Usage : node importer-lots.mjs espace|framed|geo|tout [--limite N] | essai <dossier> [--limite N]');
  process.exit(1);
}
