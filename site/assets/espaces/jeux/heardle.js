// ===== Humane Gang — page « Jeux », onglet Heardle du gang (idée J10) =====
/*
 * Rôle : deviner le morceau du jour (partagé dans le salon musique ou passé au blind test) à partir d'un extrait :
 * 1 s au départ, puis 2, 4, 7, 11 et 16 s à chaque erreur ou « Passer ». 6 essais, même barème que Framed.
 * Lecteur : API iframe YouTube chargée à la demande, domaine youtube-nocookie, vidéo cachée derrière une pochette
 * dessinée jusqu'à la fin. Les tests remplacent le lecteur par window.__HG_FAKE_YT (aucun appel à YouTube).
 * Les membres peuvent proposer un morceau (le Staff « souvenirs » valide). Sous le jeu : l'historique de toutes les manches
 * passées avec les scores du gang (heardle-historique.js).
 * Effets (effets-jour.js), seulement après un essai confirmé par le serveur, jamais à l'ouverture : segment débloqué qui s'éclaire,
 * champ secoué, sons D1 à D4, vidéo dévoilée en pop, puis finDePartie (tampon, Paillettes).
 * RPC : hg_heardle_state, hg_heardle_guess, hg_heardle_propose, hg_heardle_signaler (vidéo qui ne se lit plus). Exporte : mount(panel, ctx), unmount().
 */
import { paillSym } from '../../commun/paillettes.js';
import { motionAllowed } from '../../commun/core.js';
import { sonJour, pointsDeGain, rejoue, secouer, finDePartie } from './effets-jour.js';
import { loadCss, guessFormHtml, bindGuess, boardHtml, shareText, copyText } from './devine.js';
import { boutonReponses } from '../../commun/core/admin-reponses.js';
import { monterHistorique, relireHistorique } from './heardle-historique.js';
import { serieHtml, jokerHtml } from './serie-jeux.js'; // série commune et joker payant (migrations 206 et 207)
// Manches passées pour l'honneur (idée 13, migration 213) : #heardle-AAAA-MM-JJ (bouton « Jouer » de l'historique),
// sans Paillettes, classement ni série.
import { jourVoulu, sousTitreHonneur, retourHtml, modeHonneur, suivreJour } from './archives-jeux.js';

const STEPS = [1, 2, 4, 7, 11, 16];
const dateLong = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });
let P = null, C = null;
// jour : manche passée jouée pour l'honneur (null = manche du jour).
const S = { jour: null, st: null, busy: false, err: null, player: null, playerP: null, ready: false, playing: false, pos: 0, timer: null, forVideo: null, propose: false, vol: 70, muted: false, attendFin: false };
const VOL_KEY = 'hg_heardle_volume';

/** Monte l'onglet. */
export async function mount(panel, ctx) {
  P = panel; C = ctx;
  S.jour = jourVoulu(ctx.sub);
  suivreJour(panel, ctx, () => S.jour, (j) => {
    S.jour = j; S.busy = false; S.attendFin = false;
    load().then(() => { if (j) P.scrollIntoView?.({ block: 'start' }); });
  });
  S.vol = lireVolume();
  loadCss('jeux-devine');
  panel.innerHTML = '<p class="muted">Chargement du Heardle…</p>';
  panel.addEventListener('click', onClick);
  panel.addEventListener('input', onInput);
  panel.addEventListener('submit', onPropose);
  await load();
}

/** Volume mémorisé (0 à 100), 70 par défaut. */
function lireVolume() {
  try {
    const v = localStorage.getItem(VOL_KEY);
    if (v !== null && v.trim() !== '' && Number.isFinite(Number(v))) return Math.min(100, Math.max(0, Math.round(Number(v))));
  } catch { /* stockage bloqué : volume par défaut */ }
  return 70;
}

/** Mémorise le volume choisi. */
function ecrireVolume(v) {
  try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* stockage bloqué : sans mémoire */ }
}

/** Applique le volume et le son coupé au lecteur, s'il existe. */
function appliquerVolume(p) {
  try { p?.setVolume?.(S.vol); if (S.muted) p?.mute?.(); else p?.unMute?.(); } catch { /* lecteur absent */ }
}

/** Coupe la lecture quand on quitte l'onglet. */
export function unmount() { stop(); }

/** Charge l'état du jour. */
async function load() {
  const jour = S.jour;
  try {
    const { data, error } = jour
      ? await C.sb.rpc('hg_jeux_honneur_etat', { p_jeu: 'heardle', p_day: jour })
      : await C.sb.rpc('hg_heardle_state');
    if (error) throw error;
    if (S.jour !== jour) return;
    S.st = data; S.err = null;
  } catch (e) { S.err = e?.message || String(e); }
  render();
}

/** Morceau dans les suggestions : « Artiste — Titre ». */
const label = (t) => `${t.artist} — ${t.title}`;
/** Durée « 0:04 ». */
const mmss = (s) => `0:${String(Math.floor(s)).padStart(2, '0')}`;

/* ---------- Lecteur ---------- */
/** Charge l'API iframe YouTube une fois (ou le lecteur simulé des tests). */
function ytApi() {
  if (window.__HG_FAKE_YT) return Promise.resolve(window.__HG_FAKE_YT);
  if (window.YT?.Player) return Promise.resolve(window.YT);
  return new Promise((res, rej) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => rej(new Error('Lecteur YouTube indisponible'));
    document.head.append(s);
    setTimeout(() => rej(new Error('Lecteur YouTube indisponible')), 15000);
  });
}

/** Erreur déjà annoncée (vidéo illisible : videoBloquee) : play() ne la répète pas. */
const DEJA_DIT = new Error('vidéo illisible');

/**
 * Crée le lecteur (une fois par vidéo) dans #jh-player et attend qu'il soit prêt : avant onReady, l'objet YouTube n'a
 * pas encore ses méthodes (seekTo, playVideo…). Un second clic pendant la préparation attend la même promesse.
 * Si la vidéo ne se lit pas, la promesse échoue (DEJA_DIT) et le prochain clic recrée le lecteur.
 */
function ensurePlayer() {
  const st = S.st;
  if (S.playerP && S.forVideo === st.youtube_id) return S.playerP;
  S.forVideo = st.youtube_id;
  S.ready = false;
  const p = S.playerP = ytApi().then((YT) => new Promise((res, rej) => {
    S.player = new YT.Player('jh-player', {
      host: 'https://www.youtube-nocookie.com', videoId: st.youtube_id, width: '100%', height: '100%',
      playerVars: { start: st.start_s, controls: 0, disablekb: 1, modestbranding: 1, playsinline: 1, rel: 0, fs: 0, iv_load_policy: 3 },
      events: {
        onReady: () => { S.ready = true; appliquerVolume(S.player); res(S.player); },
        onError: (e) => { if (S.playerP === p) { S.playerP = null; S.forVideo = null; } rej(DEJA_DIT); videoBloquee(e?.data); },
      },
    });
  }));
  p.catch(() => { if (S.playerP === p) { S.playerP = null; S.forVideo = null; } });
  return p;
}

/**
 * La vidéo ne se lit pas. Codes YouTube 100 (vidéo introuvable), 101 / 150 / 153 (lecture intégrée refusée) : le
 * morceau ne marchera pour personne, on le signale (hg_heardle_signaler, migration 135) ; le serveur met un autre
 * morceau à la place si personne n'a encore joué aujourd'hui, sinon il annule la manche. Autres codes : problème
 * de ce navigateur (réseau, extension…), on le dit simplement.
 * @param {number|undefined} code code d'erreur du lecteur YouTube
 */
async function videoBloquee(code) {
  stop();
  // Manche passée : rien à signaler au serveur (la manche du jour n'est pas concernée).
  if (S.jour) { C.toast('Cette vidéo ne se lit plus : impossible de rejouer cette manche.', 'error'); return; }
  if (![100, 101, 150, 153].includes(Number(code))) { C.toast('Cette vidéo ne se lit pas sur cet appareil. Réessaie un peu plus tard.', 'error'); return; }
  try {
    const { data, error } = await C.sb.rpc('hg_heardle_signaler', { p_code: Number(code) });
    if (error) throw error;
    if (data?.action === 'remplacee') C.toast('Ce morceau ne se lit plus sur YouTube : il est remplacé par un autre. Bonne chance !', 'success');
    else if (data?.action === 'annulee') C.toast('Ce morceau ne se lit plus sur YouTube : la manche du jour est annulée.', 'error');
    else C.toast('Cette vidéo ne se lit pas : préviens le Staff.', 'error');
    if (data?.ok) await load();
  } catch {
    C.toast('Cette vidéo ne se lit pas : préviens le Staff.', 'error');
  }
}

/** Arrête la lecture et le compteur. */
function stop() {
  clearInterval(S.timer); S.timer = null;
  if (S.playing) try { S.player?.pauseVideo(); } catch { /* lecteur absent */ }
  S.playing = false;
  paintPlay();
}

/** Joue l'extrait débloqué depuis l'instant de départ. */
async function play() {
  if (S.playing) { stop(); return; }
  try {
    const p = await ensurePlayer();
    if (typeof p?.seekTo !== 'function' || (p.getIframe && !p.getIframe()?.isConnected)) return; // onglet redessiné entre-temps : lecteur abandonné
    const st = S.st, lim = st.finished ? 16 : st.seconds;
    appliquerVolume(p);
    p.seekTo(st.start_s, true); p.playVideo();
    S.playing = true; S.pos = 0;
    const t0 = performance.now();
    S.timer = setInterval(() => {
      let cur = (performance.now() - t0) / 1000;
      try { const t = p.getCurrentTime?.(); if (typeof t === 'number' && t >= st.start_s) cur = t - st.start_s; } catch { /* temps inconnu */ }
      S.pos = Math.min(cur, lim);
      if (cur >= lim) stop(); else paintPlay();
    }, 100);
    paintPlay();
  } catch (e) { if (e !== DEJA_DIT) C.toast(e?.message || String(e), 'error'); }
}

/** Met à jour le bouton et le compteur sans tout redessiner. */
function paintPlay() {
  const st = S.st; if (!st?.round) return;
  const lim = st.finished ? 16 : st.seconds;
  const b = P.querySelector('#jh-play'), t = P.querySelector('#jh-time'), bar = P.querySelector('#jh-prog');
  if (b) { b.setAttribute('aria-label', S.playing ? 'Arrêter' : `Écouter ${lim} seconde${lim > 1 ? 's' : ''}`); b.classList.toggle('is-playing', S.playing); }
  if (t) t.textContent = `${mmss(S.playing ? S.pos : 0)} / ${mmss(lim)}`;
  if (bar) bar.style.width = `${(Math.min(S.pos, 16) / 16) * 100}%`;
}

/** Curseur de volume, valeur affichée et bouton muet. */
function volHtml() {
  return `<div class="jh-vol">
          <label for="jh-vol">Volume</label>
          <input type="range" id="jh-vol" min="0" max="100" step="1" value="${S.vol}" aria-valuetext="${S.vol} %">
          <output id="jh-vol-val" for="jh-vol">${S.vol}</output>
          <button type="button" class="btn btn-ghost jh-mute" id="jh-mute" data-act="mute" aria-pressed="${S.muted}">${S.muted ? 'Rétablir le son' : 'Couper le son'}</button>
        </div>`;
}

/** Met à jour la valeur, le bouton muet et l'état audio sans redessiner l'onglet. */
function paintVol() {
  const out = P.querySelector('#jh-vol-val'), b = P.querySelector('#jh-mute'), r = P.querySelector('#jh-vol');
  if (out) out.textContent = String(S.vol);
  if (r) { r.value = String(S.vol); r.setAttribute('aria-valuetext', `${S.vol} %`); }
  if (b) { b.textContent = S.muted ? 'Rétablir le son' : 'Couper le son'; b.setAttribute('aria-pressed', String(S.muted)); }
}

/* ---------- Rendu ---------- */
/** Barre segmentée des durées (1, 2, 4, 7, 11, 16 s). */
function barHtml(st) {
  const lim = st.finished ? 16 : st.seconds;
  let prev = 0;
  const seg = STEPS.map((s, i) => { const w = s - prev; prev = s; const cls = s <= lim ? (i === STEPS.indexOf(lim) ? 'is-now' : 'is-open') : ''; return `<span class="jh-seg ${cls}" style="flex:${w}"></span>`; }).join('');
  prev = 0;
  const lab = STEPS.map((s) => { const w = s - prev; prev = s; return `<span style="flex:${w}">${s} s</span>`; }).join('');
  return `<div class="jh-bar" role="img" aria-label="Durée de l’extrait : ${lim} seconde${lim > 1 ? 's' : ''} sur 16"><div class="jh-segs">${seg}<span class="jh-prog" id="jh-prog"></span></div><div class="jh-labs" aria-hidden="true">${lab}</div></div>`;
}

/** Liste des essais. */
function triesHtml(st) {
  const g = st.guesses || [];
  const rows = g.map((x, i) => {
    const win = st.solved && i === g.length - 1;
    const plus = i < 5 ? `+${STEPS[i + 1] - STEPS[i]} s` : '';
    return `<li class="jd-try${win ? ' is-win' : x.id ? ' is-miss' : ''}"><span class="jd-dot" aria-hidden="true"></span>
      <span class="jd-try-t">${i + 1} · ${x.id ? C.esc(label(x)) : 'Passé'}</span><span class="jd-try-s">${win ? 'Trouvé' : x.id ? 'Raté' : plus}</span></li>`;
  });
  if (!st.finished) rows.push(`<li class="jd-try is-cur"><span class="jd-dot" aria-hidden="true"></span><span class="jd-try-t muted">${g.length + 1} · …</span><span></span></li>`);
  return `<ul class="jd-tries">${rows.join('')}</ul>`;
}

/** Formulaire « Proposer un morceau ». */
function proposeHtml() {
  if (!S.propose) return '<p><button type="button" class="btn btn-ghost" data-act="propose">Proposer un morceau</button></p>';
  return `<form class="card jh-propose" id="jh-propose"><h2 class="jd-h2">Proposer un morceau</h2>
    <p class="muted small">Un morceau partagé dans #musique ou passé au blind test. Le Staff le valide avant qu’il tombe un jour.</p>
    <div class="field"><label for="jh-p-title">Titre</label><input class="input" id="jh-p-title" maxlength="120" required></div>
    <div class="field"><label for="jh-p-artist">Artiste</label><input class="input" id="jh-p-artist" maxlength="120" required></div>
    <div class="field"><label for="jh-p-url">Lien YouTube</label><input class="input" id="jh-p-url" inputmode="url" maxlength="200" required placeholder="https://youtu.be/…"></div>
    <div class="field"><label for="jh-p-start">Départ de l’extrait (secondes)</label><input class="input" id="jh-p-start" type="number" min="0" max="36000" value="0"></div>
    <div class="field"><label for="jh-p-where">Où et quand (facultatif)</label><input class="input" id="jh-p-where" maxlength="60" placeholder="#musique, mars 2023"></div>
    <div class="jd-actions"><button type="submit" class="btn btn-primary">Envoyer</button><button type="button" class="btn btn-ghost" data-act="propose-off">Annuler</button></div></form>`;
}

/** Dessine l'onglet. */
function render() {
  const esc = C.esc, st = S.st, honneur = !!S.jour;
  modeHonneur(P, honneur);
  if (S.err) { P.innerHTML = `<p class="card">Heardle indisponible : ${esc(S.err)}</p>`; return; }
  stop();
  S.player = null; S.playerP = null; S.forVideo = null;
  const hier = st.hier ? `<div class="card jd-hier"><p class="jd-hier-t">Hier · #${esc(st.hier.round)} ${esc(st.hier.title)}</p>
      <p class="muted small">trouvé par ${esc(st.hier.solvers)} membre${st.hier.solvers > 1 ? 's' : ''}${st.hier.avg ? ` · moyenne ${esc(String(st.hier.avg).replace('.', ','))} / 6` : ''}</p></div>` : '';
  const board = honneur ? '' : `<section class="card jd-board-box" aria-labelledby="jh-board-h"><h2 id="jh-board-h" class="jd-h2">Classement de la semaine</h2>${boardHtml(st.board, C.me?.id, esc)}</section>`;
  if (!st.round) {
    P.innerHTML = `<div class="jd"><div class="jd-head"><h2 class="jd-title">Heardle du gang</h2></div>
      <p class="card muted">${st.cancelled ? 'Manche annulée aujourd’hui (la vidéo ne se lit plus). Rendez-vous demain !' : 'Pas de morceau aujourd’hui.'}${st.next_day ? ` Prochain Heardle le ${esc(dateLong.format(new Date(st.next_day + 'T12:00:00Z')))}.` : ''}</p>
      ${hier}${board}${proposeHtml()}</div><div id="jh-hist" class="jh-hist"></div>`;
    boutonReponses(P.querySelector('.jd-head'), 'heardle');
    monterHistorique(P.querySelector('#jh-hist'), C);
    return;
  }
  const lim = st.finished ? 16 : st.seconds;
  const essai = (st.guesses?.length || 0) + 1;
  const head = `<div class="jd-head"><h2 class="jd-title">Heardle du gang #${esc(st.round)}</h2>
    <div class="jd-sub"><span class="muted small">${honneur ? esc(sousTitreHonneur(`Manche n°${st.round}`, S.jour)) : `Un morceau du salon musique · ${st.finished ? 'partie terminée' : `${essai}${essai === 1 ? 'er' : 'e'} essai`}`}</span>
    <div class="sj-pills">${honneur ? retourHtml('#heardle', 'Morceau du jour') : serieHtml('heardle')}<span class="pill jd-pts-pill">${esc(lim)} s débloquée${lim > 1 ? 's' : ''}</span></div></div></div>
    ${honneur ? '' : jokerHtml('heardle')}`;
  const t = st.track || {};
  const playerBox = `<div class="card jh-box${st.finished ? ' is-open' : ''}">
      <div class="jh-cover" aria-hidden="${st.finished ? 'false' : 'true'}"><div class="jh-video"><div id="jh-player"></div></div>
        ${st.finished ? '' : '<div class="jh-sleeve"><span class="jh-disc"></span><span class="jh-sleeve-t">#' + esc(st.round) + ' · ???</span></div>'}</div>
      <div class="jh-ctrl">
        <button type="button" class="btn btn-sand jh-play" id="jh-play" data-act="play" aria-label="Écouter ${esc(lim)} seconde${lim > 1 ? 's' : ''}"><span class="jh-ico" aria-hidden="true"></span></button>
        <p class="small"><strong>Écouter</strong> · <span id="jh-time">0:00 / ${mmss(lim)}</span></p>
        <p class="small muted">${st.finished ? 'La vidéo est dévoilée : réécoute le morceau en entier.' : 'La vidéo reste cachée derrière la pochette jusqu’à la fin.'}</p>
        ${volHtml()}
      </div></div>`;
  let bottom;
  if (st.finished) {
    bottom = `<div class="card jd-end${st.solved ? ' is-win' : ''}" role="status">
      <p class="jd-end-t">${st.solved ? `Trouvé en ${esc(st.guesses.length)} essai${st.guesses.length > 1 ? 's' : ''} !` : 'Pas trouvé cette fois.'}</p>
      <p class="jd-end-ans">${esc(t.artist || '')} — ${esc(t.title || '')}</p>
      ${t.proposed_by || t.shared_on ? `<p class="muted small">« proposé par ${esc(t.proposed_by || 'le gang')}${t.shared_on ? ` dans ${esc(t.shared_on)}` : ''} »</p>` : ''}
      <p class="small">${st.reward ? `<span class="jd-gain-v">+${esc(st.reward)} ${paillSym()}</span> crédités` : ''}</p>
      <div class="jd-actions"><button type="button" class="btn btn-sand" data-act="share">Partager le résultat</button></div></div>`;
  } else {
    bottom = guessFormHtml('jh', 'Titre ou artiste', S.busy)
      + `<p class="muted small jd-note">Seuls les ${esc(st.tracks.length)} morceaux du gang sont proposés. ${honneur ? 'Manche passée, pour l’honneur : sans Paillettes.' : `Trouvé : ${esc(st.gain)} ${paillSym()} · pas trouvé : ${esc(st.consolation)} ${paillSym()}.`}</p>`;
  }
  P.innerHTML = `<div class="jd">${head}${playerBox}${barHtml(st)}${triesHtml(st)}${bottom}${hier}${board}${honneur ? '' : proposeHtml()}</div><div id="jh-hist" class="jh-hist"></div>`;
  if (!honneur) boutonReponses(P.querySelector('.jd-head'), 'heardle');
  monterHistorique(P.querySelector('#jh-hist'), C);
  if (!st.finished) {
    const g = st.guesses?.length || 0;
    const passBtn = P.querySelector('[data-act="passer"]');
    if (passBtn && g < 5) passBtn.textContent = `Passer · +${STEPS[g + 1] - STEPS[g]} s`;
    bindGuess(P, 'jh', {
      items: st.tracks, esc, label,
      exclude: new Set((st.guesses || []).map((x) => String(x.id)).filter(Boolean)),
      onPick: (id) => guess(id), onSkip: () => guess(null),
    });
  } else {
    // Fin : la vidéo se dévoile (lecteur visible, avec ses commandes).
    ensurePlayer().catch(() => {});
    if (!S.attendFin) habillerFin(false);
  }
}

/**
 * Habille la carte de fin (tampon, gain). animer: false pour une partie déjà finie à l'ouverture.
 * @param {boolean} animer Vrai juste après le dernier essai du membre.
 */
function habillerFin(animer) {
  const st = S.st, carte = P.querySelector('.jd-end');
  if (!st || !carte || S.jour) return; // manche passée : ni points, ni Paillettes, ni série
  const gain = Number(st.reward) > 0 ? Number(st.reward) : null;
  const points = st.score != null && Number.isFinite(Number(st.score)) ? Number(st.score) : pointsDeGain(st.reward);
  finDePartie(carte, { points, gain, animer, cibleGain: gain ? carte.querySelector('.jd-gain-v') : null });
}

/**
 * Effets d'un essai confirmé par le serveur : segment débloqué qui s'éclaire, champ secoué, sons, vidéo dévoilée en pop.
 * @param {object} avant État avant l'essai.
 * @param {object} st État après l'essai.
 */
function effets(avant, st) {
  const g = st.guesses || [], x = g[g.length - 1];
  if (!x) return;
  const anime = motionAllowed();
  const type = st.solved && st.finished ? 'ok' : x.id ? 'ko' : 'pas';
  sonJour(type === 'ok' ? 'D4' : type === 'pas' ? 'D2' : 'D1');
  if (type === 'ko') secouer(P.querySelector('.jd-combo'));
  if (st.finished) {
    rejoue(P.querySelector('.jh-cover'), 'fxj-pop');
    const carte = P.querySelector('.jd-end');
    const delai = anime && type !== 'ok' ? 500 : 0;
    if (delai && carte) carte.style.visibility = 'hidden';
    setTimeout(() => {
      const c = P.querySelector('.jd-end');
      if (c) c.style.visibility = '';
      S.attendFin = false;
      habillerFin(true);
    }, delai);
  } else if (st.seconds > (avant?.seconds || 0)) {
    rejoue(P.querySelector('.jh-seg.is-now'), 'fxj-lueur');
  }
}

/** Envoie un essai (null = passer). */
async function guess(id) {
  if (S.busy) return;
  const avant = S.st;
  let nouveau = false;
  S.busy = true; render();
  const jour = S.jour;
  try {
    const { data, error } = jour
      ? await C.sb.rpc('hg_jeux_honneur_essai', { p_jeu: 'heardle', p_day: jour, p: { track: id } })
      : await C.sb.rpc('hg_heardle_guess', { p_track: id });
    if (error) throw error;
    if (S.jour !== jour) { S.busy = false; return; }
    S.st = data;
    nouveau = (data.guesses?.length || 0) > (avant?.guesses?.length || 0);
    S.attendFin = nouveau && !!data.finished;
    if (data.finished && jour) relireHistorique();
    if (data.finished && jour) C.toast(data.solved ? 'Bravo, trouvé pour l’honneur !' : `C’était « ${data.track?.title} ».`, 'ok');
    else if (data.finished) C.toast(data.solved ? `Bravo ! +${data.reward} ${paillSym()}` : `C’était « ${data.track?.title} ». +${data.reward} ${paillSym()}`, 'ok');
  } catch (e) { C.toast(e?.message || String(e), 'error'); }
  S.busy = false; render();
  if (nouveau && S.st) effets(avant, S.st);
  P.querySelector('#jh-input')?.focus();
}

/** Clics. */
async function onClick(e) {
  const b = e.target.closest('button');
  if (!b || !P.contains(b)) return;
  const a = b.dataset.act;
  if (a === 'play') return play();
  if (a === 'mute') { S.muted = !S.muted; appliquerVolume(S.player); paintVol(); return; }
  if (a === 'share') C.toast(await copyText(shareText('Heardle du gang', S.st)) ? 'Résultat copié, colle-le sur Discord.' : 'Copie impossible sur cet appareil.', 'ok');
  if (a === 'propose' || a === 'propose-off') {
    S.propose = a === 'propose'; render();
    if (S.propose) P.querySelector('#jh-p-title')?.focus();
  }
}

/** Curseur de volume : mémorise la valeur, la règle sur le lecteur et retire le son coupé. */
function onInput(e) {
  if (e.target.id !== 'jh-vol') return;
  S.vol = Math.min(100, Math.max(0, Math.round(Number(e.target.value)) || 0));
  if (S.vol > 0) S.muted = false;
  ecrireVolume(S.vol);
  appliquerVolume(S.player);
  paintVol();
}

/** Envoi d'une proposition de morceau. */
async function onPropose(e) {
  if (e.target.id !== 'jh-propose') return;
  e.preventDefault();
  const v = (id) => P.querySelector(id).value.trim();
  const { error } = await C.sb.rpc('hg_heardle_propose', {
    p_title: v('#jh-p-title'), p_artist: v('#jh-p-artist'), p_youtube: v('#jh-p-url'),
    p_start: Number(v('#jh-p-start')) || 0, p_shared_on: v('#jh-p-where') || null,
  });
  if (error) { C.toast(error.message, 'error'); return; }
  C.toast('Merci ! Le Staff va écouter ta proposition.', 'ok');
  S.propose = false; render();
}
