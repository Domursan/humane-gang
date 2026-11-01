// Contrôle sans réseau de la maintenance à la demande de outils/appliquer-sql.mjs (faux client SQL, aucune base réelle) :
// marqueur « -- hg:maintenance », activation avant le fichier, retrait après (même en cas d'échec), maintenance déjà active
// laissée telle quelle, retrait impossible signalé, autres champs du réglage conservés.
// Lancer : node tests/unitaires/check-maintenance-sql.mjs
import { veutMaintenance, appliquerFichier } from '../../outils/appliquer-sql.mjs';

let ko = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK ' : 'KO '} ${msg}`); if (!ok) ko++; };
const muet = () => {};

/**
 * Faux client : garde le réglage site_identite en mémoire et interprète les requêtes de maintenance ; toute autre requête
 * est « la migration » (réussit, échoue avec migration.echec, ou lève avec migration.leve). Journal dans etat.appels.
 */
function faux({ reglage, migration = {}, echecEcriture = false, echecLecture = false }) {
  const etat = { reglage: reglage === undefined ? undefined : { ...reglage }, appels: [], maintenanceVueDansMigration: null };
  const requete = async (sql) => {
    etat.appels.push(sql.trim().split('\n')[0].slice(0, 40));
    if (/^select value -> 'maintenance_active'/.test(sql)) {
      if (echecLecture) return { ok: false, detail: 'illisible' };
      return { ok: true, detail: JSON.stringify(etat.reglage === undefined ? [] : [{ m: etat.reglage.maintenance_active ?? null }]) };
    }
    if (/^insert into hg_settings/.test(sql)) {
      if (echecEcriture) return { ok: false, detail: 'écriture refusée' };
      etat.reglage = { ...(etat.reglage || {}), maintenance_active: /"maintenance_active": true/.test(sql) };
      return { ok: true, detail: '[]' };
    }
    if (/^update hg_settings set value = value - 'maintenance_active'/.test(sql)) {
      if (echecEcriture) return { ok: false, detail: 'écriture refusée' };
      delete etat.reglage.maintenance_active;
      return { ok: true, detail: '[]' };
    }
    etat.maintenanceVueDansMigration = etat.reglage?.maintenance_active === true;
    if (migration.leve) throw new Error('coupure');
    return migration.echec ? { ok: false, detail: 'erreur SQL' } : { ok: true, detail: '[]' };
  };
  return { etat, requete };
}
const AVEC = '-- hg:maintenance\ncreate table t();';
const SANS = 'create table t();';

check(veutMaintenance(AVEC) && veutMaintenance('\n  -- hg:maintenance  \nselect 1;') && veutMaintenance('﻿-- hg:maintenance\nselect 1;'), 'marqueur reconnu en première ligne');
check(!veutMaintenance(SANS) && !veutMaintenance('select 1;\n-- hg:maintenance') && !veutMaintenance('-- hg:maintenance-plus\nselect 1;')
  && !veutMaintenance('-- maintenance\nselect 1;'), 'pas de marqueur : jamais de maintenance');

{ // Sans marqueur : une seule requête, le réglage n'est pas lu.
  const { etat, requete } = faux({ reglage: { bandeau_actif: true } });
  const r = await appliquerFichier(requete, SANS, muet, 0);
  check(r.ok && etat.appels.length === 1 && etat.maintenanceVueDansMigration === false, 'sans marqueur : la base n\'est pas touchée');
}
{ // Avec marqueur : active avant, retire après, garde les autres champs.
  const { etat, requete } = faux({ reglage: { bandeau_actif: true, bandeau_texte: 'Salut', maintenance_message: 'Retour vite' } });
  const r = await appliquerFichier(requete, AVEC, muet, 0);
  check(r.ok && r.retrait === '' && etat.maintenanceVueDansMigration === true, 'maintenance active pendant la migration');
  check(!('maintenance_active' in etat.reglage) && etat.reglage.bandeau_actif === true && etat.reglage.bandeau_texte === 'Salut'
    && etat.reglage.maintenance_message === 'Retour vite', 'retirée après, autres champs conservés');
}
{ // Champ explicitement à false avant : remis à false.
  const { etat, requete } = faux({ reglage: { maintenance_active: false, nom: 'HG' } });
  await appliquerFichier(requete, AVEC, muet, 0);
  check(etat.reglage.maintenance_active === false && etat.reglage.nom === 'HG', 'était à false : remis à false');
}
{ // Ligne absente : maintenance posée quand même.
  const { etat, requete } = faux({ reglage: undefined });
  const r = await appliquerFichier(requete, AVEC, muet, 0);
  check(r.ok && etat.maintenanceVueDansMigration === true, 'réglage absent : maintenance posée quand même');
}
{ // Migration en échec : retrait quand même.
  const { etat, requete } = faux({ reglage: { nom: 'HG' }, migration: { echec: true } });
  const r = await appliquerFichier(requete, AVEC, muet, 0);
  check(!r.ok && r.detail === 'erreur SQL' && r.retrait === '' && !('maintenance_active' in etat.reglage), 'migration en échec : maintenance retirée');
}
{ // Coupure réseau pendant la migration : retrait quand même, échec noté.
  const { etat, requete } = faux({ reglage: { nom: 'HG' }, migration: { leve: true } });
  const r = await appliquerFichier(requete, AVEC, muet, 0);
  check(!r.ok && /coupure/.test(r.detail) && !('maintenance_active' in etat.reglage), 'exception réseau : maintenance retirée');
}
{ // Déjà active (admin) : on n'y touche pas, ni avant ni après.
  const { etat, requete } = faux({ reglage: { maintenance_active: true, maintenance_message: 'Travaux' } });
  const r = await appliquerFichier(requete, AVEC, muet, 0);
  check(r.ok && r.retrait === '' && etat.reglage.maintenance_active === true && etat.reglage.maintenance_message === 'Travaux'
    && etat.appels.length === 2, 'déjà active : laissée telle quelle (lecture + migration seulement)');
}
{ // Lecture ou activation impossible : la migration n'est pas lancée, le fichier sera relancé au passage suivant.
  const a = faux({ reglage: { nom: 'HG' }, echecLecture: true });
  const ra = await appliquerFichier(a.requete, AVEC, muet, 0);
  const b = faux({ reglage: { nom: 'HG' }, echecEcriture: true });
  const rb = await appliquerFichier(b.requete, AVEC, muet, 0);
  check(!ra.ok && !rb.ok && ra.retrait === '' && rb.retrait === '' && /non lancée/.test(ra.detail) && /non lancée/.test(rb.detail),
    'maintenance non activée : fichier en erreur, aucun retrait');
  const envoyee = (l) => l.some((s) => s.startsWith('-- hg:maintenance'));
  check(!envoyee(a.etat.appels) && !envoyee(b.etat.appels), 'maintenance non activée : migration non envoyée');
}
{ // Retrait impossible : signalé (le programme finit alors en échec).
  const { etat, requete } = faux({ reglage: { nom: 'HG' } });
  const r = await appliquerFichier(async (sql) => (/^update hg_settings set value = value -/.test(sql) ? { ok: false, detail: 'base injoignable' } : requete(sql)), AVEC, muet, 0);
  check(r.ok && /base injoignable/.test(r.retrait) && etat.reglage.maintenance_active === true, 'retrait impossible : message dans retrait');
}

console.log(ko ? `${ko} ECHEC(S)` : 'Tout est OK');
process.exit(ko ? 1 : 0);
