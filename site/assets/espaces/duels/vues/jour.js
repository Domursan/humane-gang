// ===== Humane Gang — Duels : code du jour (#jour, Mastermind solo) =====
/*
 * Rôle : écran autonome du code du jour, même plateau et même palette que la table Mastermind.
 * Un code secret par jour pour tout le gang, 10 essais. Affiche la série de jours consécutifs,
 * le classement du jour (ma ligne en or) et le nombre de trouveurs. Une fois fini : le code dévoilé.
 * Interrupteur « Mode daltonien » partagé avec la table (clé localStorage hg_duel_daltonien).
 * Effets (maquette des jeux quotidiens) : après un essai, les pions se posent un à un (son « pion posé » du Mastermind), puis
 * les indices apparaissent un par un (sons « bien placé » / « mal placé ») ; si la partie est finie, finDePartie (tampon de
 * points : 11 moins le numéro de l'essai, 0 si le code n'est pas trouvé). Rien de tout cela à l'ouverture d'un jour déjà fini :
 * le tampon est posé sans animation. Les Paillettes ne sont pas renvoyées par le serveur : pas de ligne de gain.
 * Dépendances : core.js (esc, toast, motionAllowed), ../api.js (duel, erreurTexte, COULEURS_MM), ./commun.js (nomJoueur),
 *   ../../../commun/sons-jeux.js (jouerSonJeu), ../../jeux/effets-jour.js (rejoue, finDePartie).
 * Exporte : afficher.
 */
import { esc, toast, motionAllowed } from '../../../commun/core.js';
import { duel, erreurTexte, COULEURS_MM } from '../api.js';
import { nomJoueur } from './commun.js';
import { boutonReponses } from '../../../commun/core/admin-reponses.js';
import { jouerSonJeu } from '../../../commun/sons-jeux.js';
import { rejoue, finDePartie } from '../../jeux/effets-jour.js';

const CLE_DALTO = 'hg_duel_daltonien';
const ESSAIS_MAX = 10;
const LETTRES = COULEURS_MM.map((x) => x.c);

/** Mode daltonien mémorisé dans le navigateur (sans effet si le stockage est refusé). */
function lireDalto() { try { return localStorage.getItem(CLE_DALTO) === '1'; } catch { return false; } }
function ecrireDalto(v) { try { localStorage.setItem(CLE_DALTO, v ? '1' : '0'); } catch { /* navigation privée stricte */ } }

/** Couleur d'après sa lettre serveur (r o y g b p). */
function infoCouleur(c) { return COULEURS_MM.find((x) => x.c === c) || { c, nom: '?', hex: '#9A9A9F', lettre: '?' }; }
/** Rond coloré ; la lettre n'est affichée qu'en mode daltonien. */
function pion(c, { petit = false, dalto = false } = {}) {
  const i = infoCouleur(c);
  return `<span class="mm-pion${petit ? ' is-petit' : ''}" role="img" aria-label="${esc(i.nom)}" style="--mm-c:${i.hex}">${dalto ? esc(i.lettre) : ''}</span>`;
}
/** Indices : pleins = bien placés, cerclés = mal placés, plus le texte « 2 bien, 1 mal ». */
function indices(bien, mal) {
  const pts = '<span class="mm-fb mm-fb-ok" aria-hidden="true"></span>'.repeat(bien)
    + '<span class="mm-fb mm-fb-no" aria-hidden="true"></span>'.repeat(mal);
  return `<span class="mm-indices"><span class="mm-fbs">${pts}</span><span class="mm-indices-txt">${bien} bien, ${mal} mal</span></span>`;
}
const vide = () => [null, null, null, null];
const heure = (iso) => {
  try { return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

/**
 * Affiche le code du jour dans root.
 * @param {HTMLElement} root conteneur de l'écran.
 * @returns {Promise<Function>} nettoyage (retire les écouteurs).
 */
export async function afficher(root) {
  const st = { jour: null, occupe: false, brouillon: vide(), dalto: lireDalto(), vivant: true, anim: false };

  /** Le jour est-il terminé pour moi (code trouvé ou plus d'essais) ? */
  const fini = () => !!st.jour && (!!st.jour.fini || !!st.jour.trouve_en || (st.jour.essais || []).length >= ESSAIS_MAX);

  /** Ajoute une couleur dans le premier trou libre. */
  const ajouter = (c) => {
    const i = st.brouillon.indexOf(null);
    if (i < 0) return;
    st.brouillon[i] = c;
    rendre();
  };
  const vider = (i) => { st.brouillon[i] = null; rendre(); };

  /** Points sur 10 de la partie finie : 11 moins le numéro de l'essai gagnant (1 au moins), 0 si le code n'est pas trouvé. */
  const pointsFin = () => (st.jour?.trouve_en ? Math.max(1, 11 - st.jour.trouve_en) : 0);

  /** Envoie l'essai du jour ; la réponse contient le nouvel état du jour. */
  async function valider() {
    if (!st.brouillon.every(Boolean) || st.occupe || fini()) return;
    const texte = st.brouillon.join('');
    const avant = (st.jour?.essais || []).length;
    let nouveau = false;
    st.occupe = true; rendre();
    try {
      st.jour = await duel.jourEssayer(texte);
      st.brouillon = vide();
      nouveau = (st.jour?.essais || []).length > avant;
    } catch (err) {
      toast(erreurTexte(err), 'error');
    } finally {
      st.occupe = false;
      if (st.vivant) { if (nouveau) st.anim = true; rendre(); }
    }
    if (nouveau && st.vivant) effetsEssai();
  }

  /**
   * Effets du dernier essai (le plateau est déjà dessiné dans son état final) : pions posés un à un, indices un par un,
   * puis, si la partie est finie, la carte de bilan avec son tampon. Sans mouvement : seuls les sons sont espacés.
   */
  function effetsEssai() {
    const essais = st.jour?.essais || [];
    const n = essais.length ? essais[essais.length - 1].n : 0;
    const ligne = root.querySelectorAll('.mm-plateau > .mm-rangee')[n - 1];
    const pions = [...(ligne?.querySelectorAll('.mm-pion') || [])];
    const indicesPts = [...(ligne?.querySelectorAll('.mm-fb') || [])];
    const texte = ligne?.querySelector('.mm-indices-txt') || null;
    const anime = motionAllowed();
    const essai = (st.seq = (st.seq || 0) + 1); // un essai plus récent reprend la main sur la fin de séquence
    if (anime) [...pions, ...indicesPts, texte].forEach((x) => x?.classList.add('jour-cache'));
    const reveler = (x, cls) => { if (!anime || !x) return; x.classList.remove('jour-cache'); rejoue(x, cls); };
    pions.forEach((x, k) => setTimeout(() => { if (!st.vivant) return; jouerSonJeu('mastermind', 3); reveler(x, 'fxj-pop'); }, k * 130));
    indicesPts.forEach((x, i) => setTimeout(() => {
      if (!st.vivant) return;
      jouerSonJeu('mastermind', x.classList.contains('mm-fb-ok') ? 1 : 2);
      reveler(x, 'fxj-pop');
    }, 600 + i * 420));
    setTimeout(() => {
      texte?.classList.remove('jour-cache');
      if (essai !== st.seq) return;
      st.anim = false;
      if (!st.vivant) return;
      const bilan = root.querySelector('.duels-jour-bilan');
      if (!bilan) return;
      bilan.classList.remove('jour-cache');
      finDePartie(bilan, { points: pointsFin(), gain: st.jour?.gain ?? null, animer: true });
    }, 800 + indicesPts.length * 420);
  }

  /** Plateau : 10 rangées, la rangée en cours surlignée tant que le jour n'est pas fini. */
  function plateauHtml() {
    const essais = st.jour?.essais || [];
    const termine = fini();
    const lignes = [];
    for (let n = 1; n <= ESSAIS_MAX; n += 1) {
      const e = essais.find((x) => x.n === n);
      if (e) {
        const cases = [...String(e.essai)].map((c) => pion(c, { dalto: st.dalto })).join('');
        lignes.push(`<li class="mm-rangee"><span class="mm-num">${n}</span><span class="mm-cases">${cases}</span><span class="mm-droite">${indices(e.bien, e.mal)}</span></li>`);
      } else if (n === essais.length + 1 && !termine) {
        const cases = st.brouillon.map((c, i) => (c
          ? `<button type="button" class="mm-case-btn" data-act="trou" data-i="${i}" data-k="trou-${i}" aria-label="${esc(infoCouleur(c).nom)}, vider ce trou" style="--mm-c:${infoCouleur(c).hex}">${st.dalto ? esc(infoCouleur(c).lettre) : ''}</button>`
          : `<button type="button" class="mm-case-btn is-trou" data-act="trou" data-i="${i}" data-k="trou-${i}" aria-label="Trou ${i + 1} vide"></button>`)).join('');
        lignes.push(`<li class="mm-rangee is-cur"><span class="mm-num">${n}</span><span class="mm-cases">${cases}</span><span class="mm-droite"><span class="mm-droite-txt">En cours</span></span></li>`);
      } else {
        lignes.push(`<li class="mm-rangee is-vide"><span class="mm-num">${n}</span><span class="mm-cases">${'<span class="mm-trou"></span>'.repeat(4)}</span></li>`);
      }
    }
    return `<ol class="mm-plateau" aria-label="Essais du jour">${lignes.join('')}</ol>
      <p class="mm-legende"><span class="mm-fb mm-fb-ok" aria-hidden="true"></span>Bien placé
        <span class="mm-fb mm-fb-no" aria-hidden="true"></span>Mal placé</p>`;
  }

  /** Bas du plateau : commandes, ou le bilan une fois fini (code dévoilé). */
  function basHtml() {
    if (!fini()) {
      const pal = COULEURS_MM.map((x) => `<button type="button" class="mm-pal" data-act="pal" data-c="${x.c}" data-k="pal-${x.c}" style="--mm-c:${x.hex}"
          aria-label="${esc(x.nom)}${st.dalto ? ' (' + x.lettre + ')' : ''}">${st.dalto ? esc(x.lettre) : ''}</button>`).join('');
      const complet = st.brouillon.every(Boolean);
      return `<div class="mm-palette" role="group" aria-label="Palette de couleurs">${pal}</div>
        <div class="mm-commandes">
          <button type="button" class="btn btn-ghost" data-act="effacer" data-k="effacer" ${st.occupe ? 'disabled' : ''}>Effacer</button>
          <button type="button" class="btn btn-primary" data-act="valider" data-k="valider" ${complet && !st.occupe ? '' : 'disabled'}>Valider l'essai</button>
        </div>`;
    }
    const trouve = st.jour.trouve_en;
    const titre = trouve ? `Code trouvé en ${trouve} essai${trouve > 1 ? 's' : ''} !` : 'Plus d\'essais.';
    const secret = st.jour.secret ? [...String(st.jour.secret)].map((c) => pion(c, { dalto: st.dalto })).join('') : '';
    return `<div class="duels-jour-bilan" aria-live="polite">
        <p class="mm-fin">${esc(titre)}</p>
        ${secret ? `<p class="mm-aide">Le code était</p><div class="mm-codes" aria-label="Code du jour : ${esc(st.jour.secret)}">${secret}</div>` : ''}
        <p class="duels-jour-suite">Reviens demain pour un nouveau code.</p>
      </div>`;
  }

  /** Classement du jour : rang, pseudo coloré, essais, heure ; ma ligne en or. */
  function classementHtml() {
    const liste = st.jour?.classement || [];
    const n = st.jour?.trouveurs ?? liste.length;
    const items = liste.map((x, i) => `<li class="duels-jour-ligne${x.moi ? ' is-moi' : ''}">
        <span class="duels-jour-rang">${i + 1}</span>
        <span class="duels-jour-pseudo">${nomJoueur(x)}</span>
        <span class="duels-jour-essais">${x.essais} essai${x.essais > 1 ? 's' : ''}</span>
        <time datetime="${esc(x.at)}">${esc(heure(x.at))}</time></li>`).join('');
    return `<h2 class="duels-h3">Classement du jour</h2>
      <p class="duels-jour-nb">${n} trouveur${n > 1 ? 's' : ''}</p>
      ${items ? `<ol class="duels-jour-liste">${items}</ol>` : '<p class="muted">Personne n\'a encore trouvé le code.</p>'}`;
  }

  /** Dessine tout l'écran (les écouteurs restent attachés à root). */
  function rendre() {
    if (!st.jour) return;
    const j = st.jour;
    const serie = Number(j.serie) || 0;
    const focus = root.contains(document.activeElement) ? document.activeElement.dataset.k : null;
    root.innerHTML = `<section class="duels-jour">
      <header class="duels-jour-tete">
        <p class="duels-fil"><a href="/pages/jeux/jeux.html#tous">Retour aux jeux</a></p>
        <h1 class="duels-titre">Code du jour</h1>
        <p class="duels-jour-expl">Un code secret par jour, le même pour tout le gang. 10 essais. Trouve-le vite pour grimper au classement.</p>
        ${serie > 0 ? `<p class="duels-jour-serie"><strong>${serie} jour${serie > 1 ? 's' : ''} de suite</strong></p>` : ''}
      </header>
      <div class="duels-jour-corps">
        <section class="card duels-jour-plateau" aria-label="Ton plateau">
          <div class="mm-titre"><h2 class="duels-h3">Ton plateau</h2><span class="mm-sous">${esc(j.jour ? `Jour ${j.jour}` : '')}</span></div>
          ${plateauHtml()}
          ${basHtml()}
        </section>
        <aside class="duels-jour-cote">
          <section class="card duels-jour-classement">${classementHtml()}</section>
          <section class="card mm-bloc mm-dalto">
            <div><span id="jour-dalto-titre" class="mm-dalto-titre">Mode daltonien</span>
              <span id="jour-dalto-aide" class="mm-aide">Affiche une lettre sur chaque couleur</span></div>
            <button type="button" role="switch" data-act="dalto" data-k="dalto" aria-checked="${st.dalto}"
              aria-labelledby="jour-dalto-titre" aria-describedby="jour-dalto-aide" class="mm-switch${st.dalto ? ' is-on' : ''}"><span class="mm-switch-bille"></span></button>
          </section>
        </aside>
      </div>
    </section>`;
    if (focus) root.querySelector(`[data-k="${focus}"]:not([disabled])`)?.focus();
    boutonReponses(root.querySelector('.duels-jour-tete'), 'codejour');
    // Bilan : caché pendant les effets du dernier essai (il est révélé avec son tampon), sinon tampon posé sans animation.
    const bilan = root.querySelector('.duels-jour-bilan');
    if (bilan) {
      if (st.anim) bilan.classList.add('jour-cache');
      else finDePartie(bilan, { points: pointsFin(), gain: st.jour?.gain ?? null, animer: false });
    }
  }

  /** Clics : palette, trous, effacer, valider, interrupteur daltonien. */
  function surClic(ev) {
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    const act = b.dataset.act;
    if (act === 'dalto') { st.dalto = !st.dalto; ecrireDalto(st.dalto); rendre(); return; }
    if (st.occupe || fini()) return;
    if (act === 'pal') ajouter(b.dataset.c);
    else if (act === 'trou') vider(Number(b.dataset.i));
    else if (act === 'effacer') { st.brouillon = vide(); rendre(); }
    else if (act === 'valider') valider();
  }

  /** Touches 1 à 6, Retour arrière, Entrée : seulement quand le focus est dans l'écran. */
  function surTouche(ev) {
    if (st.occupe || fini() || ev.target.closest('input, textarea')) return;
    if (/^[1-6]$/.test(ev.key)) { ev.preventDefault(); ajouter(LETTRES[Number(ev.key) - 1]); return; }
    if (ev.key === 'Backspace') {
      const i = st.brouillon.reduce((acc, c, k) => (c ? k : acc), -1);
      if (i >= 0) { ev.preventDefault(); vider(i); }
      return;
    }
    if (ev.key === 'Enter' && st.brouillon.every(Boolean)) { ev.preventDefault(); valider(); }
  }

  root.innerHTML = '<p class="duels-chargement">Chargement du code du jour…</p>';
  try {
    st.jour = await duel.jour();
  } catch (err) {
    root.innerHTML = `<section class="card duels-erreur"><h1 class="display">Code du jour</h1>
      <p>${esc(erreurTexte(err))}</p><p><a class="btn btn-primary" href="/pages/jeux/jeux.html#tous">Retour aux jeux</a></p></section>`;
    return () => {};
  }
  root.addEventListener('click', surClic);
  root.addEventListener('keydown', surTouche);
  rendre();

  return () => {
    st.vivant = false;
    root.removeEventListener('click', surClic);
    root.removeEventListener('keydown', surTouche);
  };
}
