// ===== Humane Gang — présence (en ligne / hors ligne) et notifications du site (migration 153) =====
/*
 * Rôle :
 *   1. Signal de vie : tant qu'une page du site est ouverte et visible, hg_presence_ping() toutes les 50 s. Le membre est
 *      « en ligne » pendant 2 minutes après le dernier signal ; le bot Discord ne lui envoie alors pas de MP (une
 *      notification du site suffit, voir supabase/functions/_shared/presence.ts).
 *   2. Voyant de statut sur la photo du membre (#statut-btn, dans .nav-me-wrap, posé ici) : vert = en ligne, rouge barré =
 *      statut masqué (« Masquer mon statut »). Son badge = nombre de notifications non lues. Sur ordinateur, le voyant est
 *      un bouton : un clic ouvre le panneau (#notif-panel) : liste (hg_mes_notifs), « Tout marquer comme lu » (hg_notifs_lues),
 *      réglage « Masquer mon statut en ligne » (hg_presence_masquer). Sur téléphone (760 px et moins), le voyant n'est qu'un
 *      indicateur (aria-hidden, sans clic ni focus) : le statut et le panneau s'ouvrent depuis l'entrée « Statut » du menu
 *      en arc de la photo, et la photo porte alors le libellé du statut. Une nouvelle notification arrive en direct (canal
 *      privé Realtime « notif:<id> ») et s'affiche aussi en message temporaire. L'historique complet est sur
 *      /pages/compte/notifications.html (espaces/compte/notifications.js), qui reprend notifHtml et marquerLues, appelle
 *      rafraichirNotifs après ses suppressions et écoute l'événement « hg-notifs » du document (changement venu du panneau ou du direct).
 *   3. Pastilles de statut : tout élément [data-presence="<uuid>"] reçoit la classe is-online et un libellé « En ligne »
 *      ou « Hors ligne » (hg_en_ligne, par lots, rafraîchi toutes les 60 s et à chaque ajout dans la page).
 *      presenceDot(id) fabrique cette pastille ; avatarPresence(html, id) l'ajoute sur un avatar.
 * Page : toutes (init.js appelle startPresence(profil) pour un membre connecté).
 * Dépendances : supabase.js (sb), ui.js (toast), util.js (esc).
 * Exporte : startPresence, presenceDot, avatarPresence, catNom, notifHtml, marquerLues, rafraichirNotifs.
 */
import { sb } from './supabase.js';
import { toast } from './ui.js';
import { esc } from './util.js';

/** Intervalle du signal de vie (ms) : sous les 2 minutes de la fenêtre « en ligne ». */
const PING_MS = 50000;
/** Intervalle de rafraîchissement des pastilles (ms). */
const STATUTS_MS = 60000;
/** Libellés des catégories (petite étiquette dans la liste). */
const CATS = { messages: 'Message', sorties: 'Sortie', echanges: 'Échange', souhaits: 'Cartes', santa: 'Secret Santa',
  anniversaires: 'Anniversaire', jeux: 'Jeux', annonces: 'Annonce', info: 'Info' };

/**
 * Libellé d'une catégorie. Les catégories ne sont pas une liste fermée : une catégorie inconnue s'affiche sous son propre nom.
 * @param {string} cat Catégorie de la notification.
 * @returns {string}
 */
export function catNom(cat) {
  const c = String(cat || '');
  return CATS[c] || (c ? c[0].toUpperCase() + c.slice(1) : CATS.info);
}

/**
 * Feuille de style de la cloche et des pastilles (/assets/commun/notifs.css), ajoutée une fois.
 * Renvoie une promesse résolue quand elle est appliquée : sans elle, le voyant serait posé en ligne (sans style)
 * puis repositionné, ce qui fait bouger l'en-tête (CLS).
 * @returns {Promise<void>}
 */
function chargerCss() {
  let l = document.querySelector('link[data-css="notifs"]');
  if (!l) {
    l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = new URL('../notifs.css', import.meta.url).href; l.dataset.css = 'notifs';
    document.head.append(l);
  }
  if (l.sheet) return Promise.resolve();
  return new Promise((ok) => { l.addEventListener('load', ok, { once: true }); l.addEventListener('error', ok, { once: true }); });
}

const P = { me: null, timer: null, nonLues: 0, liste: null, masque: false, canal: null, ouvert: false, demarre: false, docBound: false, css: false };
/** Téléphone : même seuil que le menu replié et l'éventail de la photo (header.js). */
const TEL = '(max-width: 760px)';
const surTel = () => matchMedia(TEL).matches;

/** Où rendre le focus quand le panneau se ferme : la photo au téléphone (le voyant n'est pas focusable), le voyant sinon. */
function retourFocus() {
  (surTel() ? document.querySelector('.site-header .nav-me') : document.getElementById('statut-btn'))?.focus();
}

/* ---------- Pastilles de statut ---------- */

/**
 * Pastille de statut d'un membre (mise à jour automatiquement : « En ligne » / « Hors ligne »).
 * @param {string} id Identifiant du membre.
 * @returns {string} HTML
 */
export function presenceDot(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return '';
  return `<span class="presence-dot" data-presence="${esc(id)}" role="img" aria-label="Hors ligne" title="Hors ligne"></span>`;
}

/**
 * Ajoute la pastille de statut en bas à droite d'un avatar.
 * @param {string} avatar HTML de l'avatar (avatarHtml).
 * @param {string} id Identifiant du membre.
 * @returns {string} HTML
 */
export function avatarPresence(avatar, id) {
  const dot = presenceDot(id);
  return dot ? `<span class="presence-wrap">${avatar}${dot}</span>` : avatar;
}

/** « il y a 5 min », « il y a 3 h », « le 12 oct. ». */
function depuis(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 60) return `il y a ${Math.max(1, min)} min`;
  if (min < 24 * 60) return `il y a ${Math.round(min / 60)} h`;
  return `le ${new Date(t).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}`;
}

let statutsTimer = null, statutsAttente = null;
/** Met à jour toutes les pastilles de la page (une requête pour tous les membres affichés). */
async function majStatuts() {
  const els = [...document.querySelectorAll('[data-presence]')];
  const ids = [...new Set(els.map((el) => el.dataset.presence))].slice(0, 500);
  if (!ids.length) return;
  try {
    const { data, error } = await sb.rpc('hg_en_ligne', { p_ids: ids });
    if (error) throw error;
    const m = new Map((data || []).map((r) => [r.user_id, r]));
    for (const el of els) {
      const r = m.get(el.dataset.presence);
      const on = !!r?.en_ligne;
      el.classList.toggle('is-online', on);
      const txt = on ? 'En ligne' : `Hors ligne${r?.vu_at ? ` (vu ${depuis(r.vu_at)})` : ''}`;
      el.setAttribute('aria-label', txt);
      el.title = txt;
    }
  } catch (e) {
    console.warn('[présence] statuts', e?.message || e);
  }
}
/** Mise à jour groupée (plusieurs ajouts dans la page = une seule requête). */
function majStatutsBientot() {
  clearTimeout(statutsAttente);
  statutsAttente = setTimeout(majStatuts, 300);
}

/* ---------- Signal de vie ---------- */

/** Envoie le signal de vie et met à jour le badge de non lues du voyant. */
async function ping() {
  if (document.hidden) return;
  try {
    const { data, error } = await sb.rpc('hg_presence_ping');
    if (error) throw error;
    if (Number.isFinite(Number(data)) && Number(data) !== P.nonLues) { P.nonLues = Number(data); P.liste = null; peindreVoyant(); }
  } catch (e) {
    console.warn('[présence] signal', e?.message || e);
  }
}

/* ---------- Voyant, liste et actions des notifications ---------- */

/** Relit mes notifications (liste et non lues). */
async function charger() {
  const { data, error } = await sb.rpc('hg_mes_notifs', { p_limite: 30 });
  if (error) throw error;
  P.liste = data?.liste || [];
  P.nonLues = Number(data?.non_lues) || 0;
  P.masque = !!data?.masque;
  return data;
}

/** Prévient la page ouverte qu'une notification a changé depuis le panneau ou le direct (centre de notifications). */
const annoncer = () => document.dispatchEvent(new CustomEvent('hg-notifs'));

/** Relit mes notifications, puis met à jour le badge et le panneau. Ne lève pas d'erreur. */
export async function rafraichirNotifs() {
  try {
    await charger();
    peindreVoyant();
    const box = document.getElementById('notif-panel');
    if (box && !box.hidden) box.innerHTML = panneauHtml();
  } catch (e) { console.warn('[notifs]', e?.message || e); }
}

/**
 * Voyant de statut du membre, posé sur sa photo : vert plein = en ligne, rouge barré = statut masqué (les autres
 * membres le voient hors ligne). Son badge affiche le nombre de notifications non lues, quand il y en a.
 */
function peindreVoyant() {
  const n = P.nonLues;
  const nb = n ? `${n} non lue${n > 1 ? 's' : ''}` : 'aucune non lue';
  const etat = P.masque ? 'statut masqué' : 'en ligne';
  const compte = n > 99 ? '99+' : String(n);
  const b = document.getElementById('statut-btn');
  if (b) {
    const badge = b.querySelector('.statut-n');
    badge.textContent = compte;
    badge.hidden = n <= 0;
    b.querySelector('.presence-dot').classList.toggle('is-online', !P.masque);
    // Ordinateur (bouton) : le libellé est sur le voyant. Téléphone (indicateur aria-hidden) : c'est la photo qui le porte.
    if (b.tagName === 'BUTTON') { b.setAttribute('aria-label', `Statut et notifications : ${etat}, ${nb}`); b.title = b.getAttribute('aria-label'); }
  }
  const photo = document.querySelector('.site-header .nav-me');
  if (photo && P.me?.pseudo) photo.setAttribute('aria-label', surTel() ? `Mon menu (${P.me.pseudo}), statut : ${etat}, ${nb}` : `Mon menu (${P.me.pseudo})`);
  // Entrée « Statut » du menu en arc (téléphone seulement, voir header.js)
  const entree = document.querySelector('.site-header .nav-statut-open');
  if (entree) {
    entree.setAttribute('aria-label', `Statut et notifications : ${etat}, ${nb}`);
    const bd = entree.querySelector('.nav-badge');
    if (bd) { bd.textContent = compte; bd.hidden = n <= 0; }
  }
}

/**
 * Une notification : lien si elle en a un, simple bloc sinon. Sert au panneau et au centre de notifications.
 * @param {{id: number, cat: string, titre: string, texte: ?string, lien: ?string, created_at: string, lu: boolean}} n Notification.
 * @returns {string} HTML
 */
export function notifHtml(n) {
  const corps = `<span class="notif-cat">${esc(catNom(n.cat))}</span>
    <strong class="notif-titre">${esc(n.titre)}</strong>
    ${n.texte ? `<span class="notif-texte">${esc(n.texte)}</span>` : ''}
    <span class="notif-quand">${esc(depuis(n.created_at))}</span>`;
  const cls = `notif-item${n.lu ? '' : ' is-new'}`;
  const nonLu = n.lu ? '' : '<span class="visually-hidden">Non lue. </span>';
  return n.lien
    ? `<a class="${cls}" href="${esc(n.lien)}" data-notif="${esc(n.id)}">${nonLu}${corps}</a>`
    : `<div class="${cls}" data-notif="${esc(n.id)}">${nonLu}${corps}</div>`;
}

/** Contenu du panneau (liste, actions, réglage du statut). */
function panneauHtml() {
  const liste = P.liste === null ? '<p class="small muted notif-vide">Chargement…</p>'
    : !P.liste.length ? '<p class="small muted notif-vide">Aucune notification pour l’instant.</p>'
    : `<ul class="notif-liste">${P.liste.map((n) => `<li>${notifHtml(n)}</li>`).join('')}</ul>`;
  return `<div class="notif-head"><h2 class="notif-h" id="notif-h">Notifications</h2>
      <button type="button" class="btn btn-ghost btn-sm" data-notif-act="lire"${P.nonLues ? '' : ' disabled'}>Tout marquer comme lu</button></div>
    ${liste}
    <a class="btn btn-ghost btn-sm notif-tout" href="/pages/compte/notifications.html">Voir tout l’historique</a>
    <label class="check notif-statut"><input type="checkbox" data-notif-act="masquer"${P.masque ? ' checked' : ''}>
      <span>Masquer mon statut « en ligne » aux autres membres</span></label>
    <p class="small muted notif-aide">Quand tu es sur le site, le bot ne t’envoie pas de message privé : la notification arrive ici.</p>`;
}

/** Ouvre ou ferme le panneau. */
async function basculer(ouvrir = !P.ouvert) {
  const b = document.getElementById('statut-btn');
  const box = document.getElementById('notif-panel');
  if (!b || !box) return;
  P.ouvert = ouvrir;
  if (b.tagName === 'BUTTON') b.setAttribute('aria-expanded', String(ouvrir));
  document.querySelector('.site-header .nav-statut-open')?.setAttribute('aria-expanded', String(ouvrir));
  box.hidden = !ouvrir;
  if (!ouvrir) return;
  box.innerHTML = panneauHtml();
  try { await charger(); } catch (e) { console.warn('[notifs]', e?.message || e); }
  if (!P.ouvert) return;
  box.innerHTML = panneauHtml();
  peindreVoyant();
  box.querySelector('.notif-item, button, input')?.focus({ preventScroll: true });
}

/**
 * Marque des notifications non lues comme lues (toutes si ids est absent), puis met à jour le badge et le panneau.
 * @param {?number[]} [ids] Identifiants.
 * @returns {Promise<boolean>} Faux si la base a refusé (message déjà affiché).
 */
export async function marquerLues(ids = null) {
  try {
    const { error } = await sb.rpc('hg_notifs_lues', { p_ids: ids });
    if (error) throw error;
    for (const n of P.liste || []) if (!ids || ids.includes(Number(n.id))) n.lu = true;
    P.nonLues = ids ? Math.max(0, P.nonLues - ids.length) : 0;
    peindreVoyant();
    const box = document.getElementById('notif-panel');
    if (box && !box.hidden) box.innerHTML = panneauHtml();
    return true;
  } catch (e) {
    toast(e?.message || String(e), 'error');
    return false;
  }
}

/**
 * Pose le voyant de statut sur la photo du membre (dans .nav-me-wrap, créé par header.js) et le panneau des notifications.
 * Idempotent : refait sans effet si le voyant existe déjà ; à rappeler si l'en-tête a été reconstruit.
 */
function monterVoyant() {
  const wrap = document.querySelector('.site-header .nav-me-wrap');
  if (!wrap || document.getElementById('statut-btn')) return;
  P.ouvert = false;
  // Voyant : sur ordinateur, un bouton distinct de la photo (qui, elle, ouvre toujours le menu en arc).
  // Sur téléphone, un simple indicateur (span aria-hidden, sans clic ni focus) : le statut s'ouvre depuis le menu de la photo.
  const tel = surTel();
  const b = document.createElement(tel ? 'span' : 'button');
  b.id = 'statut-btn';
  b.className = tel ? 'statut-voyant statut-voyant--indicateur' : 'statut-voyant';
  if (tel) {
    b.setAttribute('aria-hidden', 'true');
  } else {
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.setAttribute('aria-controls', 'notif-panel');
  }
  b.innerHTML = '<span class="statut-n" aria-hidden="true" hidden>0</span><span class="presence-dot" aria-hidden="true"></span>';
  // Panneau des notifications : rattaché au même conteneur (positionné sous la photo sur ordinateur, en bandeau sur téléphone).
  const box = document.createElement('div');
  box.className = 'notif-panel';
  box.id = 'notif-panel';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-labelledby', 'notif-h');
  box.hidden = true;
  wrap.append(b, box);
  if (!tel) b.addEventListener('click', () => {
    // Le voile du menu en arc couvre la page : on le referme d'abord, sinon le panneau s'ouvre sous le voile.
    if (document.querySelector('.site-header.fan-open')) document.querySelector('.me-fan .fan-scrim')?.click();
    basculer();
  });
  box.addEventListener('click', (ev) => {
    const lien = ev.target.closest('[data-notif]');
    if (lien) { const n = (P.liste || []).find((x) => String(x.id) === lien.dataset.notif); if (n && !n.lu) marquerLues([Number(n.id)]).then(annoncer); }
    if (ev.target.closest('[data-notif-act="lire"]')) marquerLues().then(annoncer);
  });
  box.addEventListener('change', async (ev) => {
    const c = ev.target.closest('[data-notif-act="masquer"]');
    if (!c) return;
    try {
      const { error } = await sb.rpc('hg_presence_masquer', { p_masque: c.checked });
      if (error) throw error;
      P.masque = c.checked;
      peindreVoyant();
      toast(c.checked ? 'Ton statut en ligne est masqué.' : 'Ton statut en ligne est visible.', 'ok');
    } catch (e) { c.checked = !c.checked; toast(e?.message || String(e), 'error'); }
  });
  // Écouteurs de la page, posés une seule fois (le voyant peut être reconstruit avec l'en-tête).
  if (!P.docBound) {
    P.docBound = true;
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && P.ouvert) { basculer(false); retourFocus(); }
    });
    // Téléphone : l'entrée « Statut » du menu en arc ouvre le panneau (l'arc se referme, voir header.js). Traitée avant le
    // contrôle « clic ailleurs », pour que ce clic ne referme pas le panneau qu'il vient d'ouvrir.
    document.addEventListener('click', (ev) => {
      if (ev.target.closest?.('.site-header .nav-statut-open')) { basculer(true); return; }
      if (!P.ouvert) return;
      const chemin = ev.composedPath();
      const dedans = chemin.includes(document.getElementById('statut-btn')) || chemin.includes(document.getElementById('notif-panel'));
      if (!dedans) basculer(false);
    });
    // Passage du téléphone à l'ordinateur (ou l'inverse) : le voyant est reconstruit dans la bonne forme.
    matchMedia(TEL).addEventListener('change', () => {
      document.getElementById('statut-btn')?.remove();
      document.getElementById('notif-panel')?.remove();
      monterVoyant();
    });
  }
  peindreVoyant();
}

/** Canal privé « notif:<moi> » : une nouvelle notification met le voyant à jour et s'affiche en message temporaire. */
function ecouter() {
  try {
    P.canal = sb.channel(`notif:${P.me.id}`, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'notif' }, async () => {
        try {
          const avant = new Set((P.liste || []).map((n) => String(n.id)));
          await charger();
          peindreVoyant();
          const nouvelle = (P.liste || []).find((n) => !n.lu && !avant.has(String(n.id)));
          if (nouvelle) toast(`🔔 ${nouvelle.titre}`);
          const box = document.getElementById('notif-panel');
          if (box && !box.hidden) box.innerHTML = panneauHtml();
          annoncer();
        } catch (e) { console.warn('[notifs] direct', e?.message || e); }
      });
    P.canal.subscribe();
  } catch (e) {
    console.warn('[notifs] temps réel indisponible', e?.message || e);
  }
}

/**
 * Démarre la présence pour le membre connecté : signal de vie, voyant de statut, notifications en direct, pastilles de statut.
 * Sans effet pour un visiteur ; ne lève jamais d'erreur.
 * @param {{id: string}|null} profile Profil connecté.
 */
export function startPresence(profile) {
  if (!profile?.id || P.demarre) return;
  P.demarre = true;
  P.me = profile;
  try {
    // Voyant posé une fois la feuille de style appliquée ; état du membre au départ (statut masqué ou non, non lues)
    // lu ensuite : une lecture de la liste, sans bloquer le reste
    chargerCss()
      .then(() => { P.css = true; monterVoyant(); return charger(); })
      .then(peindreVoyant)
      .catch((e) => console.warn('[notifs] état initial', e?.message || e));
    ping();
    P.timer = setInterval(ping, PING_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { ping(); majStatuts(); } });
    ecouter();
    // Pastilles : premier passage, puis à chaque ajout dans la page et toutes les 60 s.
    majStatuts();
    statutsTimer = setInterval(() => { if (!document.hidden) majStatuts(); }, STATUTS_MS);
    new MutationObserver((muts) => {
      // En-tête reconstruit (renderHeader) : le voyant est reposé sur la nouvelle photo
      if (P.css && !document.getElementById('statut-btn') && document.querySelector('.site-header .nav-me-wrap')) monterVoyant();
      if (muts.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches?.('[data-presence]') || n.querySelector?.('[data-presence]'))))) majStatutsBientot();
    }).observe(document.body, { childList: true, subtree: true });
  } catch (e) {
    console.warn('[présence]', e?.message || e);
  }
}
