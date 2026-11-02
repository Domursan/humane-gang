// ===== Humane Gang — page « Jeux » : barre « Reprendre ma partie » (vue de départ) =====
/*
 * Rôle : réunit en une barre toutes les parties ouvertes du membre (duels, Uno, Nom de code, Loup-Garou, plateaux), lues en un seul
 * appel (hg_jeux_mes_parties, migration 197, qui fixe le filtre et le tri : « À toi » d'abord, puis dernière activité).
 * Sans partie, la barre n'existe pas et la page ne change pas. Plafond : 6 lignes au bureau, 3 au téléphone, puis « Voir mes N autres parties ».
 * Chargement : le squelette n'apparaît que si le membre avait des parties à sa dernière visite (mémoire de cet appareil), sinon la page
 * sauterait pour tous les membres sans partie. Erreur : un message et « Réessayer ». Une relecture ratée garde la liste déjà affichée.
 * Le temps restant d'un duel défile chaque seconde tant que la barre est visible.
 * Dépendances : core.js (sb, esc). loup-garou/ui.js (libellePhase) et nom-de-code/api.js (EQUIPES) sont chargés seulement si une partie de ces jeux est listée.
 * Exporte : creerReprise.
 */
import { sb, esc } from '../../commun/core.js';

/** Lignes montrées avant « Voir mes N autres parties ». */
const PLAFOND = { bureau: 6, telephone: 3 };
/** Même seuil que le CSS de la barre. */
const TELEPHONE = matchMedia('(max-width: 760px)');
/** Vignette d'un jeu, quand elle ne porte pas le nom du jeu (dossier assets/images/jeux/petit). */
const IMAGE = { bataille: 'bataille-navale', quiestce: 'qui-est-ce', shadow: 'shadow-hunter' };
/** Page d'un espace ; un plateau a la sienne, au nom du jeu. */
const PAGE = { duel: 'duels', uno: 'uno', ndc: 'nom-de-code', lg: 'loup-garou' };

const pluriel = (n, mot) => `${Number(n || 0).toLocaleString('fr-CH')} ${mot}${Number(n) > 1 ? 's' : ''}`;
const statutTexte = (p) => (p.statut === 'attente' ? 'Salle d’attente' : 'En cours');
const urlPartie = (p) => `/pages/jeux/${PAGE[p.espace] || (p.jeu === 'shadow' ? 'shadow-hunters' : p.jeu)}.html#partie/${encodeURIComponent(p.code)}`;

/** Temps restant, « 0:31 ». Vide si l'échéance n'est pas valable. */
function reste(fin) {
  const t = new Date(fin).getTime();
  if (isNaN(t)) return '';
  const s = Math.max(0, Math.ceil((t - Date.now()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Sous-titre d'un duel, mêmes états que l'accueil des duels. HTML : le temps restant y est une zone à part. */
function sousDuel(p) {
  const adv = p.robot ? 'le robot' : (p.adversaire || '');
  const temps = reste(p.tour_fin);
  let etat;
  if (p.statut === 'attente') etat = esc(p.defi_en_attente ? 'en attente de sa réponse' : 'salle d’attente, personne n’a encore rejoint');
  else if (p.a_toi) etat = `à toi de jouer${temps ? ` · reste <span data-fin="${esc(p.tour_fin)}">${temps}</span>` : ''}`;
  else if (p.jeu === 'mastermind') etat = 'chacun joue de son côté';
  else if (p.jeu === 'pfc') etat = 'chacun choisit de son côté';
  else etat = 'à l’autre de jouer';
  return adv ? `Contre ${esc(adv)} · ${etat}` : etat;
}

/** Morceaux du sous-titre, mêmes libellés que le bloc « Mes parties » de chaque jeu. */
function morceaux(p, textes) {
  if (p.espace === 'lg') {
    const debut = p.statut === 'attente' ? [statutTexte(p)]
      : [textes.phase ? textes.phase(p) : statutTexte(p), `${Number(p.vivants || 0).toLocaleString('fr-CH')} en vie sur ${Number(p.nb_joueurs || 0).toLocaleString('fr-CH')}`];
    return [...debut, p.mode === 'mj' ? 'meneur humain' : 'meneur automatique'];
  }
  const m = [statutTexte(p), pluriel(p.inscrits, 'joueur')];
  if (p.espace === 'uno') {
    if (p.mes_cartes != null && p.statut !== 'attente') m.push(`il te reste ${pluriel(p.mes_cartes, 'carte')}`);
    if (p.a_toi) m.push('c’est ton tour');
    else if (p.tour_pseudo) m.push(`c’est au tour de ${p.tour_pseudo}`);
  } else if (p.espace === 'ndc') {
    const equipe = textes.equipes?.[p.tour_equipe];
    if (p.statut === 'en_cours' && !p.a_toi && equipe) m.push(`tour de l’équipe ${equipe.nom}`);
  } else if (!p.a_toi && p.tour_pseudo) m.push(`Tour de ${p.tour_pseudo}`);
  return m;
}

/** Une ligne de la barre. */
function ligneHtml(p, textes) {
  const nom = esc(p.nom), sous = p.espace === 'duel' ? sousDuel(p) : esc([p.nom_jeu, ...morceaux(p, textes)].join(' · '));
  const image = `/assets/images/jeux/petit/${encodeURIComponent(IMAGE[p.jeu] || p.jeu)}.webp`;
  return `<li class="rp-ligne${p.a_toi ? ' is-tour' : ''}"><img class="rp-vig" src="${esc(image)}" alt="" width="48" height="48" loading="lazy" decoding="async">
    <div class="rp-txt"><strong>${nom}${p.a_toi ? ' <span class="rp-etiquette">À toi</span>' : ''}</strong><span class="rp-sous">${sous}</span></div>
    <a class="btn ${p.a_toi ? 'btn-sand' : 'btn-ghost'} rp-bouton" href="${esc(urlPartie(p))}">Reprendre<span class="visually-hidden"> ${nom}</span></a></li>`;
}

const teteHtml = (n) => `<div class="rp-tete"><h2 class="rp-titre" id="rp-titre">Reprendre ma partie</h2>${n
  ? `<span class="rp-nb"><span class="visually-hidden">Nombre de parties : </span>${esc(String(n))}</span>` : ''}</div>`;

/**
 * Crée la barre, cachée. Le premier affichage lance la lecture.
 * @param {string} [membre] Identifiant du membre (mémoire de sa dernière visite, par appareil).
 * @returns {{zone: HTMLElement, afficher: function(boolean): void, relire: function(): Promise<void>}}
 */
export function creerReprise(membre) {
  const CLE = `hg_jeux_parties:${membre || ''}`;
  const zone = document.createElement('section');
  zone.className = 'rp';
  zone.setAttribute('aria-labelledby', 'rp-titre');
  zone.hidden = true;
  // etat : rien (rien à montrer), charge (squelette), erreur, liste.
  let etat = 'rien', lignes = null, textes = {}, visible = false, ouvert = false, jeton = 0, minuteur = null;

  const memoire = {
    lire() { try { return localStorage.getItem(CLE) === '1'; } catch { return false; } },
    ecrire(oui) { try { if (oui) localStorage.setItem(CLE, '1'); else localStorage.removeItem(CLE); } catch { /* sans importance */ } },
  };

  /** Temps restants : une seconde de moins, tant que la barre est à l'écran. */
  function suivreTemps() {
    clearInterval(minuteur);
    minuteur = null;
    if (!visible || !zone.querySelector('[data-fin]')) return;
    minuteur = setInterval(() => { for (const e of zone.querySelectorAll('[data-fin]')) e.textContent = reste(e.dataset.fin); }, 1000);
  }

  function peindre() {
    if (etat === 'charge') zone.innerHTML = `${teteHtml(0)}<ul class="rp-liste" aria-busy="true"><li class="rp-sk"></li><li class="rp-sk"></li></ul>`;
    else if (etat === 'erreur') zone.innerHTML = `${teteHtml(0)}<div class="rp-erreur" role="alert"><p>Tes parties n’ont pas pu être lues.</p><button type="button" class="btn btn-ghost rp-bouton" data-rp="reessayer">Réessayer</button></div>`;
    else if (etat === 'liste') {
      const max = TELEPHONE.matches ? PLAFOND.telephone : PLAFOND.bureau;
      const vues = ouvert ? lignes : lignes.slice(0, max), reduites = lignes.length - vues.length;
      const plus = reduites === 1 ? 'Voir mon autre partie' : `Voir mes ${reduites} autres parties`;
      zone.innerHTML = `${teteHtml(lignes.length)}<ul class="rp-liste" id="rp-liste">${vues.map((p) => ligneHtml(p, textes)).join('')}</ul>${reduites
        ? `<button type="button" class="btn btn-ghost rp-plus" data-rp="plus" aria-controls="rp-liste" aria-expanded="false">${esc(plus)}</button>`
        : ouvert ? '<button type="button" class="btn btn-ghost rp-plus" data-rp="plus" aria-controls="rp-liste" aria-expanded="true">Réduire</button>' : ''}`;
    } else zone.innerHTML = '';
    zone.hidden = !visible || etat === 'rien';
    suivreTemps();
  }

  async function lire({ squelette = memoire.lire() } = {}) {
    const n = ++jeton;
    if (!lignes && squelette) { etat = 'charge'; peindre(); }
    try {
      const { data, error } = await sb.rpc('hg_jeux_mes_parties');
      if (error) throw error;
      const liste = Array.isArray(data) ? data : [];
      const [lg, ndc] = await Promise.all([
        liste.some((p) => p.espace === 'lg') ? import('../loup-garou/ui.js') : null,
        liste.some((p) => p.espace === 'ndc') ? import('../nom-de-code/api.js') : null,
      ]);
      if (n !== jeton) return;
      textes = { phase: lg?.libellePhase, equipes: ndc?.EQUIPES };
      lignes = liste;
      etat = liste.length ? 'liste' : 'rien';
      memoire.ecrire(liste.length > 0);
    } catch (e) {
      if (n !== jeton) return;
      console.warn('[jeux] mes parties', e);
      if (!lignes) etat = 'erreur';
    }
    peindre();
  }

  zone.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rp]');
    if (!b) return;
    if (b.dataset.rp === 'reessayer') { lire({ squelette: true }); return; }
    ouvert = !ouvert;
    peindre();
    zone.querySelector('[data-rp="plus"]')?.focus({ preventScroll: true });
  });
  TELEPHONE.addEventListener?.('change', () => { if (etat === 'liste') peindre(); });

  return {
    zone,
    /** Montre ou cache la barre (vue de départ, filtre « Tous »). */
    afficher(oui) { visible = !!oui; zone.hidden = !visible || etat === 'rien'; suivreTemps(); },
    relire: lire,
  };
}
