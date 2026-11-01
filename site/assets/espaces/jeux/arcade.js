// ===== Humane Gang — page Jeux, onglet « Arcade » (idée J18 : les mini-jeux de la borne) =====
/*
 * Rôle : les mini-jeux (« Paillettes », « Raclette », « Domu-mobile », et ceux en développement réservés aux admins :
 * Flappy Domu, Casse-briques, Snake, Tetris, Space Invaders, Tape-taupe), jouables tous les jours. Le joueur choisit le sien
 * (sélecteur) ; au départ, c'est celui de l'adresse (/pages/jeux/jeux.html#arcade-<jeu>, ctx.sub), sinon le jeu du jour (game_of_day).
 * Le serveur fixe le jeu de chaque tableau (hg_arcade_board(p_game)) et de chaque partie (hg_arcade_start(p_game)) ;
 * la partie est fermée par le serveur (hg_arcade_finish : durée et score vérifiés). Une seule partie par jour est
 * récompensée, tous jeux confondus ; Paillettes et Raclette paient en plus chaque prise (300 par jour, migration 190). Record personnel (navigateur) par jeu et meilleurs scores du gang de la semaine (5 lignes).
 * Un changement de jeu ou d'adresse pendant une partie l'interrompt (sans score). Les écrans de la borne (départ, compte, pause,
 * fin) sont dessinés par le moteur : la page lui donne le record (option record) et l'accès au sélecteur (option onAutres).
 * Maquette : idees-design/project/J18.dc.html.
 * Dépendances : ctx = { sb, me, toast, esc, sub } (jeux.js) ; eggs/arcade.js (moteur) ; eggs/jeu-*.js (mini-jeux) ;
 * core/util.js (avatarHtml) ; core/pages-access.js (accès des nouveaux jeux).
 * Exporte : mount(panel, ctx), unmount().
 */
import { paillSym } from '../../commun/paillettes.js';
import { creeArcade } from '../arcade/arcade.js';
import { avatarHtml } from '../../commun/core/util.js';
import { canAccess, pageLabel, pageMode } from '../../commun/core/pages-access.js';

/** Mini-jeux connus : identifiant du serveur → module, nom, icône en pixel art (SVG 16 × 16). */
const JEUX = {
  paillettes: { module: '../arcade/jeu-paillettes.js', nom: 'Paillettes',
    icone: (c) => `<rect x="7" y="1" width="2" height="14" fill="${c[0]}"/><rect x="1" y="7" width="14" height="2" fill="${c[0]}"/><rect x="5" y="5" width="6" height="6" fill="${c[1]}"/>`,
    couleurs: ['#FCA301', '#FBD32D'] },
  raclette: { module: '../arcade/jeu-raclette.js', nom: 'Raclette',
    icone: (c) => `<rect x="2" y="4" width="12" height="7" fill="${c[1]}"/><rect x="2" y="4" width="12" height="2" fill="${c[0]}"/><rect x="5" y="7" width="2" height="2" fill="${c[2]}"/><rect x="10" y="8" width="2" height="2" fill="${c[2]}"/><rect x="1" y="11" width="14" height="2" fill="${c[3]}"/>`,
    couleurs: ['#FCA301', '#FBD32D', '#e2a52c', '#6b3a12'] },
  domu: { module: '../arcade/jeu-domu.js', nom: 'Domu-mobile',
    icone: (c) => `<rect x="3" y="5" width="10" height="4" fill="${c[0]}"/><rect x="5" y="3" width="6" height="3" fill="${c[1]}"/><rect x="4" y="9" width="3" height="3" fill="${c[2]}"/><rect x="9" y="9" width="3" height="3" fill="${c[2]}"/>`,
    couleurs: ['#9E3543', '#7E93C9', '#121212'] },
  // Nouveaux jeux (page) : accès réglé dans « Accès aux pages » du panel (hg_pages, migration 150 ; le serveur le vérifie aussi).
  flappy: { module: '../arcade/jeu-flappy.js', nom: 'Flappy Domu', page: 'arcade-flappy',
    icone: (c) => `<rect x="1" y="6" width="2" height="1" fill="${c[1]}"/><rect x="1" y="7" width="2" height="1" fill="${c[2]}"/><rect x="1" y="8" width="2" height="1" fill="${c[3]}"/><rect x="4" y="4" width="3" height="2" fill="${c[0]}"/><rect x="8" y="4" width="3" height="2" fill="${c[0]}"/><rect x="3" y="6" width="9" height="3" fill="${c[0]}"/><rect x="4" y="9" width="7" height="2" fill="${c[0]}"/><rect x="6" y="11" width="3" height="2" fill="${c[0]}"/>`,
    couleurs: ['#B0102A', '#FE3104', '#FBD32D', '#2B5AE2'] },
  briques: { module: '../arcade/jeu-briques.js', nom: 'Casse-briques', page: 'arcade-briques',
    icone: (c) => `<rect x="1" y="2" width="4" height="2" fill="${c[0]}"/><rect x="6" y="2" width="4" height="2" fill="${c[1]}"/><rect x="11" y="2" width="4" height="2" fill="${c[2]}"/><rect x="3" y="5" width="4" height="2" fill="${c[1]}"/><rect x="8" y="5" width="4" height="2" fill="${c[0]}"/><rect x="7" y="10" width="2" height="2" fill="${c[3]}"/><rect x="4" y="13" width="8" height="2" fill="${c[3]}"/>`,
    couleurs: ['#FE3104', '#FBD32D', '#2B5AE2', '#F2EFEA'] },
  snake: { module: '../arcade/jeu-snake.js', nom: 'Snake', page: 'arcade-snake',
    icone: (c) => `<rect x="2" y="3" width="8" height="2" fill="${c[0]}"/><rect x="8" y="5" width="2" height="5" fill="${c[0]}"/><rect x="3" y="10" width="7" height="2" fill="${c[0]}"/><rect x="2" y="3" width="2" height="2" fill="${c[1]}"/><rect x="12" y="10" width="2" height="2" fill="${c[2]}"/>`,
    couleurs: ['#159946', '#0B5A2A', '#FCA301'] },
  tetris: { module: '../arcade/jeu-tetris.js', nom: 'Tetris du gang', page: 'arcade-tetris',
    icone: (c) => `<rect x="2" y="10" width="4" height="4" fill="${c[0]}"/><rect x="6" y="10" width="4" height="4" fill="${c[1]}"/><rect x="10" y="10" width="4" height="4" fill="${c[2]}"/><rect x="6" y="6" width="4" height="4" fill="${c[1]}"/><rect x="10" y="2" width="4" height="4" fill="${c[3]}"/><rect x="10" y="6" width="4" height="4" fill="${c[3]}"/>`,
    couleurs: ['#FE3104', '#FBD32D', '#2B5AE2', '#4E2398'] },
  invaders: { module: '../arcade/jeu-invaders.js', nom: 'Space Invaders', page: 'arcade-invaders',
    icone: (c) => `<rect x="4" y="2" width="8" height="2" fill="${c[0]}"/><rect x="2" y="4" width="12" height="3" fill="${c[0]}"/><rect x="4" y="5" width="2" height="1" fill="${c[1]}"/><rect x="10" y="5" width="2" height="1" fill="${c[1]}"/><rect x="2" y="7" width="2" height="2" fill="${c[0]}"/><rect x="12" y="7" width="2" height="2" fill="${c[0]}"/><rect x="7" y="12" width="2" height="3" fill="${c[2]}"/>`,
    couleurs: ['#6FA37F', '#121212', '#E2C77E'] },
  taupe: { module: '../arcade/jeu-taupe.js', nom: 'Tape-taupe', page: 'arcade-taupe',
    icone: (c) => `<rect x="2" y="12" width="12" height="2" fill="${c[0]}"/><rect x="5" y="5" width="6" height="7" fill="${c[1]}"/><rect x="6" y="7" width="1" height="1" fill="${c[2]}"/><rect x="9" y="7" width="1" height="1" fill="${c[2]}"/><rect x="7" y="9" width="2" height="1" fill="${c[3]}"/>`,
    couleurs: ['#5A3A24', '#9E3543', '#121212', '#E0909A'] },
};
/** Mini-jeux proposés au membre connecté : un jeu avec une page d'accès seulement si elle lui est ouverte. */
const visibles = () => Object.fromEntries(Object.entries(JEUX).filter(([, j]) => !j.page || (canAccess(j.page) && !!pageLabel(j.page))));
/** Vrai si le jeu est encore réservé aux admins (pastille de chantier). */
const enDev = (j) => !!j.page && pageMode(j.page) === 'admin';
const jourFmt = new Intl.DateTimeFormat('fr-CH', { timeZone: 'Europe/Zurich', weekday: 'long', day: 'numeric', month: 'short' });
/** Moteur de la partie en cours (une seule borne à la fois). */
let borne = null;

/** Meilleur score personnel (navigateur) d'un mini-jeu ; lecture et écriture prudentes. */
const record = {
  lire: (g) => { try { return Number(localStorage.getItem(`hg_arcade_best_${g}`)) || 0; } catch { return 0; } },
  ecrire: (g, n) => { try { localStorage.setItem(`hg_arcade_best_${g}`, String(n)); } catch { /* stockage bloqué */ } },
};

/** Charge la feuille de style de l'onglet une seule fois. */
function css() {
  if (document.querySelector('link[data-jeux-css="arcade"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('./jeux-arcade.css', import.meta.url).href;
  l.dataset.jeuxCss = 'arcade';
  document.head.append(l);
}

/** Numéro de semaine ISO d'une date « AAAA-MM-JJ ». */
function semaine(day) {
  const d = new Date(`${day}T12:00:00Z`);
  const j = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - j + 3);
  const premier = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - premier) / 864e5 - 3 + ((premier.getUTCDay() + 6) % 7)) / 7);
}

/**
 * Meilleurs scores du gang de la semaine (5 lignes au plus).
 * @param {Array} top lignes { user_id, pseudo, avatar_url, color, best }
 * @param {string} meId membre connecté
 * @param {Function} esc échappement HTML
 */
function topHtml(top, meId, esc) {
  if (!Array.isArray(top) || !top.length) return '<li class="arc-empty muted small">Personne n’a encore joué cette semaine : à toi l’honneur !</li>';
  return top.map((r, i) => `<li class="arc-row${r.user_id === meId ? ' is-me' : ''}"${r.user_id === meId ? ' aria-current="true"' : ''}>
      <span class="arc-rank">${i + 1}</span>
      ${avatarHtml({ pseudo: r.pseudo, avatar_url: r.avatar_url, color: r.color }, 24)}
      <span class="arc-name">${esc(r.pseudo)}</span>
      <span class="arc-best">${esc(String(r.best))}</span>
    </li>`).join('');
}

/**
 * Monte l'onglet : sélecteur des trois mini-jeux, puis la borne du jeu choisi (écran, record, récompense, meilleurs scores).
 * @param {HTMLElement} panel section role="tabpanel" vide
 * @param {{sb: object, me: object, toast: Function, esc: Function, sub: string|null}} ctx contexte de la page Jeux
 */
export async function mount(panel, ctx) {
  const { sb, me, toast, esc } = ctx;
  css();
  panel.innerHTML = `
    <div class="arc">
      <div><p class="eyebrow">Borne d’arcade</p><h2 class="arc-titre">Arcade 404</h2></div>
      <section class="card arc-tirage" aria-labelledby="arc-choix-h">
        <div class="arc-between"><h3 class="arc-h" id="arc-choix-h">Choisis ton mini-jeu</h3><span class="small muted" id="arc-jour"></span></div>
        <div class="arc-choix" role="group" aria-labelledby="arc-choix-h">
          ${Object.entries(visibles()).map(([id, j]) => `<button class="arc-jeu${enDev(j) ? ' is-dev' : ''}" type="button" data-game="${id}" aria-pressed="false"${enDev(j) ? ' title="En développement : visible des admins seulement"' : ''}>
            <span class="arc-tire-badge" hidden>Jeu du jour</span>
            <svg width="34" height="34" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">${j.icone(j.couleurs)}</svg>
            <span class="arc-tire-nom">${esc(j.nom)}</span></button>`).join('')}
        </div>
        <p class="small muted">Les mini-jeux sont jouables chaque jour. Une seule partie par jour est récompensée, tous jeux confondus. Paillettes et Raclette paient en plus 1 ${paillSym()} par prise, jusqu’à 300 ${paillSym()} par jour.</p>
      </section>
      <div class="arc-partie" id="arc-partie" aria-busy="true"></div>
    </div>`;

  const $ = (s) => panel.querySelector(s);
  const zone = $('#arc-partie');
  // État de l'onglet : version du dernier chargement (une réponse tardive est ignorée), jeu affiché, jeu du jour, partie en cours.
  let version = 0, courant = null, duDuJour = null, enPartie = false;

  /** Sélecteur : jeu choisi marqué (aria-pressed), jeu du jour étiqueté, boutons bloqués pendant une partie. */
  const peindreChoix = () => {
    for (const b of panel.querySelectorAll('.arc-jeu')) {
      b.setAttribute('aria-pressed', String(b.dataset.game === courant));
      b.disabled = enPartie;
      b.querySelector('.arc-tire-badge').hidden = b.dataset.game !== duDuJour;
    }
  };

  /**
   * Monte la borne d'un jeu : tableau du serveur (hg_arcade_board), module du jeu, partie.
   * @param {string|null} demande jeu voulu ; null : le jeu du jour
   */
  async function charger(demande) {
    const v = ++version;
    if (borne) { borne.arrete(); borne = null; }
    enPartie = false; // une partie interrompue par ce changement n'a pas de score
    zone.setAttribute('aria-busy', 'true');
    zone.innerHTML = '<p class="card arc-wait">Chargement de la borne…</p>';
    let B, JEU, g;
    try {
      const { data, error } = await sb.rpc('hg_arcade_board', { p_game: demande });
      if (error) throw error;
      B = data;
      g = JEUX[B?.game] ? B.game : 'paillettes';
      ({ JEU } = await import(JEUX[g].module));
    } catch (e) {
      if (v !== version) return;
      zone.innerHTML = `<p class="card">Impossible de charger l’arcade (${esc(e?.message || String(e))}).</p>`;
      zone.removeAttribute('aria-busy');
      peindreChoix();
      return;
    }
    if (v !== version) return;
    courant = g;
    duDuJour = JEUX[B.game_of_day] ? B.game_of_day : null;
    $('#arc-jour').textContent = jourFmt.format(B.day ? new Date(`${B.day}T12:00:00Z`) : new Date());
    peindreChoix();
    montePartie(B, g, JEU);
    zone.removeAttribute('aria-busy');
  }

  /**
   * Écran, commandes et boîtes d'un jeu (remplace la borne précédente).
   * @param {object} B réponse de hg_arcade_board
   * @param {string} g identifiant du jeu
   * @param {object} JEU module du mini-jeu
   */
  function montePartie(B, g, JEU) {
    let recu = !!B.rewarded_today;
    const gain = Number(B.reward) || 0;
    zone.innerHTML = `
      <div class="arc-ecran">
        <canvas id="arc-canvas" class="arc-canvas" width="360" height="420" tabindex="0" role="application"
          aria-label="${esc(`Jeu : ${JEU.titre}. ${JEU.aide}`)}" aria-describedby="arc-aide"></canvas>
        <div class="arc-hud"><span>SCORE <span id="arc-score">0</span></span><span id="arc-vies" hidden><span class="arc-coeurs" aria-hidden="true"></span><span class="visually-hidden" id="arc-vies-txt"></span></span></div>
      </div>
      <p id="arc-aide" class="small muted">${esc(JEU.aide)} Entrée lance la partie, Échap la met en pause.</p>
      <p id="arc-msg" class="arc-msg" role="status"></p>
      <div class="arc-boutons">
        <button id="arc-pause" class="btn btn-ghost" type="button" disabled>Pause</button>
        <button id="arc-jouer" class="btn btn-primary" type="button">Jouer</button>
      </div>
      <div class="arc-boites">
        <div class="arc-boite"><p class="small muted">Ton record ${esc(JEU.titre)}</p><p class="arc-chiffre" id="arc-record">${esc(String(Math.max(record.lire(g), Number(B.my_best) || 0)))}</p></div>
        <div class="arc-boite"><p class="small muted">Partie récompensée : une par jour, tous jeux confondus</p><p class="arc-chiffre arc-sand" id="arc-gain"></p></div>
      </div>
      <section class="card arc-scores" aria-labelledby="arc-scores-h">
        <div class="arc-between"><h3 class="arc-h" id="arc-scores-h">Meilleurs scores · ${esc(JEU.titre)}</h3><span class="small muted">semaine ${esc(String(semaine(B.day || new Date().toISOString().slice(0, 10))))}</span></div>
        <ol class="arc-list" id="arc-top">${topHtml(B.top, me?.id, esc)}</ol>
      </section>`;

    const $z = (s) => zone.querySelector(s);
    const scoreEl = $z('#arc-score'), viesEl = $z('#arc-vies'), coeursEl = $z('.arc-coeurs'), viesTxt = $z('#arc-vies-txt'), msg = $z('#arc-msg'), bouton = $z('#arc-jouer'), pause = $z('#arc-pause');
    /** Boîte de récompense : à gagner, ou déjà reçue aujourd'hui (une partie par jour, tous jeux confondus). */
    const peintGain = () => {
      $z('#arc-gain').innerHTML = gain <= 0 ? '<span class="small muted">pour la gloire</span>'
        : `+${gain} ${paillSym()} <span class="small muted arc-unite">${recu ? 'reçue aujourd’hui' : 'à gagner aujourd’hui'}</span>`;
    };
    peintGain();

    let run = null;
    let meilleur = Math.max(record.lire(g), Number(B.my_best) || 0); // record affiché par la borne et la boîte « Ton record »
    borne = creeArcade({
      canvas: $z('#arc-canvas'),
      jeu: JEU,
      record: () => meilleur,
      onAutres: () => {
        const choix = $('.arc-tirage');
        choix.scrollIntoView({ block: 'center' });
        choix.querySelector('.arc-jeu:not([aria-pressed="true"])')?.focus({ preventScroll: true });
      },
      onPause: (enPause) => {
        pause.textContent = enPause ? 'Reprendre' : 'Pause';
        msg.textContent = enPause ? 'Pause. Reprends quand tu veux.' : '';
      },
      onHud: (sc, v) => {
        if (scoreEl.textContent !== String(sc)) scoreEl.textContent = String(sc);
        // Vies : cœurs à l'écran (♥ pleins, ♡ perdus) et texte pour les lecteurs d'écran ; absentes si le jeu n'en a pas.
        viesEl.hidden = !v;
        if (!v) return;
        const coeurs = '♥'.repeat(v.left) + '♡'.repeat(v.max - v.left);
        if (coeursEl.textContent !== coeurs) {
          coeursEl.textContent = coeurs;
          viesTxt.textContent = `${v.left} vie${v.left > 1 ? 's' : ''} sur ${v.max}`;
        }
      },
      onDebut: () => {
        enPartie = true;
        peindreChoix();
        msg.textContent = '';
        bouton.textContent = 'Rejouer';
        bouton.disabled = true;
        pause.disabled = false;
        pause.textContent = 'Pause';
        // Le serveur ouvre la partie (heure de départ fixée par lui, jeu demandé par le joueur).
        run = sb.rpc('hg_arcade_start', { p_game: g }).then(({ data, error }) => (error ? null : data?.run || null)).catch(() => null);
      },
      onFin: async (sc) => {
        enPartie = false;
        peindreChoix();
        bouton.disabled = false;
        pause.disabled = true;
        pause.textContent = 'Pause';
        if (sc > record.lire(g)) record.ecrire(g, sc);
        meilleur = Math.max(meilleur, sc);
        $z('#arc-record').textContent = String(meilleur);
        msg.textContent = sc > 0 ? `Score : ${sc} !` : 'Aucun point cette fois. Rejoue !';
        const id = await run;
        if (!id) { msg.textContent += ' Score non enregistré (connexion au serveur impossible).'; return; }
        try {
          const { data, error } = await sb.rpc('hg_arcade_finish', { p_run: id, p_score: sc });
          if (error) throw error;
          if (data?.ok === false) { msg.textContent += ` Score non retenu : ${data.error}.`; return; }
          if (data?.reward > 0) { recu = true; peintGain(); toast(`🕹️ Arcade : +${data.reward} ${paillSym()}`, 'success'); msg.textContent += ` +${data.reward} ${paillSym()}`; }
          // Paillettes et Raclette : 1 Paillette par prise (migration 182).
          if (data?.prises > 0) { msg.textContent += ` +${data.prises} ${paillSym()} pour tes prises.`; toast(`🕹️ Prises : +${data.prises} ${paillSym()}`, 'success'); }
          if (data?.new_best) msg.textContent += ' Nouveau record de la semaine !';
          if (Array.isArray(data?.top)) $z('#arc-top').innerHTML = topHtml(data.top, me?.id, esc);
          meilleur = Math.max(meilleur, Number(data?.best) || 0);
          $z('#arc-record').textContent = String(meilleur);
        } catch (e) {
          msg.textContent += ` Score non enregistré (${e?.message || e}).`;
        }
      },
    });
    bouton.addEventListener('click', () => borne.demarre());
    pause.addEventListener('click', () => borne.pause());
  }

  // Sélecteur : un clic charge le jeu choisi (sans effet pendant une partie, boutons bloqués)
  $('.arc-choix').addEventListener('click', (e) => {
    const b = e.target.closest('.arc-jeu');
    if (!b || b.disabled || b.dataset.game === courant) return;
    charger(b.dataset.game);
  });
  // Adresse /pages/jeux/jeux.html#arcade-<jeu> (ou #arcade) suivie alors que l'onglet est ouvert : null = jeu du jour
  panel.addEventListener('jeux:sub', (e) => {
    const cible = visibles()[e.detail?.sub] ? e.detail.sub : duDuJour;
    if (cible && cible !== courant) charger(cible);
  });
  await charger(visibles()[ctx.sub] ? ctx.sub : null);
}

/** Quitte l'onglet : la boucle d'animation de la borne s'arrête. */
export function unmount() { borne?.arrete(); borne = null; }
