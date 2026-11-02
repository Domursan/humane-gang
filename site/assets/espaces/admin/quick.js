// =====================================================================
// Panel d'administration : actions rapides du plateau (Give, Nouvelle enchère, Lancer un drop).
// Le plateau (accueil du panel) envoie : document.dispatchEvent(new CustomEvent('hg:quick', { detail: { action } })),
// action = 'give' | 'enchere' | 'drop'. Si la personne a la permission « cartes », ce module appelle preventDefault()
// et ouvre une petite fenêtre (<dialog>) ; sans la permission, il ne fait rien et le bouton suit son lien (repli).
// Chaque fenêtre garde les mêmes contrôles et la même charge (RPC) que la page complète, qu'elle renvoie en lien
// « Ouvrir la page complète » :
//   give    : le panier (admin/give-panier.js), RPC hg_cards_admin_give_panier. Page : Fabrique › Gestion globale.
//   enchere : le lot composé comme un give (creerEnchereLot d'admin-cards/auctions.js), hg_auctions_admin (lecture),
//             hg_auction_create. Page : Ventes › Enchères.
//   drop    : hg_drop_create, puis hg-notify « card_drop » si la case Discord est cochée. Carte choisie sur ses visuels.
//             Page : Fabrique › Drops.
// Lectures : hg_members, hg_card_sets, hg_cards, hg_card_copies (restants), hg_booster_types, hg_settings (clé « cards », bornes des drops).
// Focus : la fenêtre est modale (<dialog>), Tab reste dedans, Échap ferme, le focus revient au bouton d'origine.
// Exporte : initQuick (à appeler une fois, dans admin.js), QUICK_PERM.
// Dépendances : core.js, cartes-ui.js (rarityLabel), admin-cards/helpers.js (check, fetchAll, nf),
// admin/give-panier.js, admin-cards/auctions.js (creerEnchereLot), admin/visual-pick.js (sélecteurs visuels).
// =====================================================================
import { sb, toast, errMsg, esc, notify, getCachedPerms, hasPerm } from '../../commun/core.js';
import { check, fetchAll, nf } from './cartes/helpers.js';
import { creerGive } from './give-panier.js';
import { creerEnchereLot } from './cartes/auctions.js';
import { cardPicker, chargerBoosters, chargerRestants, visuelHtml, libelleEpuisee } from './visual-pick.js';

/** Permission exigée pour les trois actions (Jeu de cartes). */
export const QUICK_PERM = 'cartes';
/** Feuille de style du module, chargée une fois à l'initialisation. */
const CSS_HREF = new URL('./admin-quick.css', import.meta.url).href;

/** Fenêtre ouverte (une seule à la fois). */
let current = null;
/** Compteur pour des identifiants uniques. */
let seq = 0;

/* ---------- Petits utilitaires ---------- */
/** Texte normalisé pour la recherche : minuscules, sans accents. */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Nombre suivi du mot au singulier ou au pluriel. */
const plur = (n, one, many) => `${nf(n)} ${n > 1 ? many : one}`;
/** Nombre entier formaté (locale suisse), comme dans la page des drops. */
const fmtN = (n) => new Intl.NumberFormat('fr-CH').format(n);
/** Bornes des drops : hg_settings.cards.drops, avec les valeurs de base en repli (comme admin-cards/drops.js). */
function limitsOf(cfg) {
  const d = cfg?.drops || {};
  const num = (v, def) => (Number.isInteger(v) && v > 0 ? v : def);
  const qmax = Math.min(num(d.quantite_max, 50), 1000), dmax = num(d.duree_max_min, 1440);
  return { qmax, dmax, dflt: Math.min(num(d.duree_defaut_min, 30), dmax) };
}

/* ---------- Coquille de fenêtre (commune aux trois actions) ---------- */
/**
 * Ouvre la fenêtre modale : titre, lien vers la page complète, zone de contenu (« Chargement… » au début) et pied.
 * @returns {{dlg: HTMLDialogElement, form: HTMLFormElement, body: HTMLElement, btns: HTMLElement, close: () => void}}
 */
function openShell({ title, sub, color, href, trigger }) {
  const id = `qk-${++seq}`;
  const dlg = document.createElement('dialog');
  dlg.className = 'qk-dlg';
  dlg.style.setProperty('--qk-c', color);
  dlg.setAttribute('aria-labelledby', `${id}-t`);
  dlg.setAttribute('aria-describedby', `${id}-s`);
  dlg.innerHTML = `<form class="qk-form" novalidate>
      <header class="qk-head">
        <div><h2 class="qk-title" id="${id}-t">${esc(title)}</h2><p class="qk-sub" id="${id}-s">${esc(sub)}</p></div>
        <button class="qk-x" type="button" data-qk-close aria-label="Fermer">×</button>
      </header>
      <div class="qk-body"><p class="small muted">Chargement…</p></div>
      <footer class="qk-foot">
        <a class="qk-link" href="${esc(href)}">Ouvrir la page complète</a>
        <div class="qk-btns"></div>
      </footer>
    </form>`;
  document.body.append(dlg);
  const form = dlg.querySelector('form');
  const ui = { dlg, form, body: dlg.querySelector('.qk-body'), btns: dlg.querySelector('.qk-btns'), close };
  /** Ferme la fenêtre si elle est ouverte. */
  function close() { if (dlg.open) dlg.close(); }
  // Fermeture (croix, Annuler, Échap, voile) : la fenêtre se retire du DOM et le focus revient au bouton d'origine.
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (current === ui) current = null;
    if (trigger && trigger.isConnected) trigger.focus();
  });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-qk-close]')) { e.preventDefault(); close(); return; }
    if (e.target === dlg) close(); // clic sur le voile
  });
  dlg.addEventListener('keydown', trapTab);
  dlg.showModal();
  current = ui;
  return ui;
}

/** Garde le focus dans la fenêtre : Tab et Maj+Tab bouclent sur les éléments atteignables. */
function trapTab(e) {
  if (e.key !== 'Tab') return;
  const dlg = e.currentTarget;
  const f = [...dlg.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
    .filter((el) => el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  const inside = dlg.contains(document.activeElement);
  if (e.shiftKey && (!inside || document.activeElement === first)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (!inside || document.activeElement === last)) { e.preventDefault(); first.focus(); }
}

/** Affiche le message d'erreur en haut du contenu ; vide = masqué. */
function showErr(ui, msg) {
  const err = ui.body.querySelector('.qk-err');
  if (!err) return;
  err.textContent = msg || '';
  err.hidden = !msg;
}

/** Affiche une erreur à la place du contenu (chargement échoué). */
function failLoad(ui, e) {
  ui.body.innerHTML = `<p class="qk-err" role="alert">Impossible de charger : ${esc(errMsg(e))}</p>`;
  ui.btns.innerHTML = '<button class="btn btn-ghost" type="button" data-qk-close>Fermer</button>';
}

/**
 * Deux volets dans le contenu (formulaire, confirmation) : on n'affiche que le volet demandé et le pied suit.
 * @param {object} ui fenêtre (openShell)
 * @param {'form'|'confirm'} pane volet à afficher
 * @param {{submit: string, confirm?: string}} labels libellés des boutons du pied
 */
function showPane(ui, pane, labels) {
  ui.body.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== pane; });
  showErr(ui, '');
  ui.btns.innerHTML = pane === 'form'
    ? `<button class="btn btn-ghost" type="button" data-qk-close>Annuler</button><button class="btn btn-primary" type="submit" data-qk-submit>${esc(labels.submit)}</button>`
    : `<button class="btn btn-ghost" type="button" data-qk-back>Retour</button><button class="btn btn-primary" type="button" data-qk-confirm>${esc(labels.confirm)}</button>`;
  const target = ui.body.querySelector(`[data-pane="${pane}"] [data-focus]`) || ui.btns.querySelector(pane === 'form' ? '[data-qk-submit]' : '[data-qk-confirm]');
  target?.focus();
}

/**
 * Branche le pied (Retour, Confirmer) et la soumission du formulaire.
 * @param {object} ui fenêtre
 * @param {() => void} onBack retour au formulaire
 * @param {(btn: HTMLButtonElement) => void} onConfirm confirmation et envoi
 * @param {() => void} onReview passage au récapitulatif (soumission du formulaire)
 */
function bindActions(ui, { onBack, onConfirm, onReview }) {
  ui.btns.addEventListener('click', (e) => {
    if (e.target.closest('[data-qk-back]')) { onBack(); return; }
    const c = e.target.closest('[data-qk-confirm]');
    if (c) onConfirm(c);
  });
  ui.form.addEventListener('submit', (e) => { e.preventDefault(); onReview(); });
}

/** Passe le bouton d'envoi en attente (désactivé, aria-busy) ; rétablit ensuite. */
function busyOn(btn) { if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); } }
function busyOff(btn) { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }

/* =========================================================
   1. Give : le panier (cartes, boosters, Paillettes) pour un ou plusieurs membres
   ========================================================= */
/** Ouvre « Give » : même panier et même RPC que Gestion globale (admin/give-panier.js). */
async function openGive(trigger) {
  const ui = openShell({ title: 'Give', sub: 'Offrir quelque chose à des membres', color: '#159946', href: '/pages/admin/admin.html#fabrique/gestion', trigger });
  ui.dlg.classList.add('gv-dlg');
  let members, sets, cards;
  try {
    [members, sets, cards] = await Promise.all([
      sb.rpc('hg_members').then(check),
      fetchAll(() => sb.from('hg_card_sets').select('id, name, sort').order('sort')),
      fetchAll(() => sb.from('hg_cards').select('*').eq('active', true).order('number')),
    ]);
  } catch (e) { failLoad(ui, e); return; }
  sets = (sets ?? []).sort((a, b) => a.sort - b.sort);
  cards = cards ?? [];
  const setsById = new Map(sets.map((s) => [s.id, s]));
  cards.forEach((k) => { k.set_name = setsById.get(k.set_id)?.name; });
  // Exemplaires restants et boosters : une lecture qui échoue ne bloque pas la fenêtre (le sélecteur reste utilisable).
  const [rest, boost] = await Promise.allSettled([chargerRestants(cards), chargerBoosters()]);
  const give = creerGive(ui.body, {
    membres: members ?? [], cards, sets, restants: rest.status === 'fulfilled' ? rest.value.restants : new Map(),
    types: boost.status === 'fulfilled' ? boost.value : null, typesErreur: boost.status === 'rejected' ? errMsg(boost.reason) : '',
    idp: 'qk-g', puces: true,
  });
  ui.btns.innerHTML = '<button class="btn btn-ghost" type="button" data-qk-close>Annuler</button><button class="btn btn-primary" type="submit" data-qk-submit>Donner</button>';
  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = ui.btns.querySelector('[data-qk-submit]');
    busyOn(btn);
    const res = await give.donner();
    busyOff(btn);
    if (!res) return;
    toast(`Don envoyé à ${plur(Number(res.membres) || 1, 'membre', 'membres')}`, 'ok');
    ui.close();
  });
}

/* =========================================================
   2. Nouvelle enchère : un lot composé comme un give, planifié
   ========================================================= */
/** Ouvre « Nouvelle enchère ». Même composition, mêmes contrôles et même RPC que admin-cards/auctions.js (creerEnchereLot). */
async function openEnchere(trigger) {
  const ui = openShell({ title: 'Nouvelle enchère', sub: 'Un lot composé comme un give, aux enchères pour le week-end par défaut.', color: '#FCA301', href: '/pages/admin/admin.html#ventes/encheres', trigger });
  ui.dlg.classList.add('gv-dlg');
  let sets, cards, auctions;
  try {
    [sets, cards, auctions] = await Promise.all([
      fetchAll(() => sb.from('hg_card_sets').select('id, name, sort').order('sort')),
      fetchAll(() => sb.from('hg_cards').select('*').eq('active', true).order('number')),
      sb.rpc('hg_auctions_admin').then(check),
    ]);
  } catch (e) { failLoad(ui, e); return; }
  sets = (sets ?? []).sort((a, b) => a.sort - b.sort);
  cards = cards ?? [];
  const setsById = new Map(sets.map((s) => [s.id, s]));
  cards.forEach((k) => { k.set_name = setsById.get(k.set_id)?.name; });
  // Exemplaires restants et boosters : une lecture qui échoue ne bloque pas la fenêtre.
  const [rest, boost] = await Promise.allSettled([chargerRestants(cards), chargerBoosters()]);
  if (!ui.dlg.isConnected) return;
  ui.body.innerHTML = '<p class="qk-err" role="alert" hidden></p><div data-qk-lot></div>';
  const compo = creerEnchereLot(ui.body.querySelector('[data-qk-lot]'), {
    idp: 'qk-a', cards, sets, restants: rest.status === 'fulfilled' ? rest.value.restants : new Map(),
    types: boost.status === 'fulfilled' ? boost.value : null, typesErreur: boost.status === 'rejected' ? errMsg(boost.reason) : '',
    encheres: auctions ?? [],
  });
  ui.btns.innerHTML = '<button class="btn btn-ghost" type="button" data-qk-close>Annuler</button><button class="btn btn-primary" type="submit" data-qk-submit>Planifier l’enchère</button>';
  ui.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = compo.lire();
    if (r.erreur) { showErr(ui, r.erreur); compo.give.signaler(r.erreur); return; }
    showErr(ui, '');
    const btn = ui.btns.querySelector('[data-qk-submit]');
    busyOn(btn);
    const res = await compo.give.confirmerLot({ phrase: r.phrase, envoi: () => sb.rpc('hg_auction_create', { p: r.p }) });
    busyOff(btn);
    if (!res) return;
    toast('Enchère planifiée', 'ok');
    ui.close();
  });
}

/* =========================================================
   3. Lancer un drop : une carte sauvage pour les premiers qui cliquent
   ========================================================= */
/** Ouvre « Lancer un drop ». Mêmes bornes, mêmes contrôles et même RPC que admin-cards/drops.js. */
async function openDrop(trigger) {
  const ui = openShell({ title: 'Lancer un drop', sub: 'La carte apparaît sur le site pour les membres connectés.', color: '#2B5AE2', href: '/pages/admin/admin.html#fabrique/drops', trigger });
  let cards, sets, restants, cfg;
  try {
    [cards, sets, cfg] = await Promise.all([
      fetchAll(() => sb.from('hg_cards').select('*').order('id')),
      fetchAll(() => sb.from('hg_card_sets').select('id, name, sort').order('sort')),
      sb.from('hg_settings').select('value').eq('key', 'cards').maybeSingle(),
    ]);
    ({ restants } = await chargerRestants(cards));
  } catch (e) { failLoad(ui, e); return; }
  const limits = limitsOf(cfg.error ? null : cfg.data?.value);
  const actives = cards.filter((k) => k.active).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const setsById = new Map((sets ?? []).map((s) => [s.id, s]));
  actives.forEach((k) => { k.set_name = setsById.get(k.set_id)?.name; });
  if (!actives.length) {
    ui.body.innerHTML = '<p class="qk-empty">Aucune carte active : crée ou active une carte d’abord.</p>';
    ui.btns.innerHTML = '<button class="btn btn-ghost" type="button" data-qk-close>Fermer</button>';
    return;
  }
  /** Motif qui interdit le choix : tous les exemplaires attribués (unique), ou plus aucun exemplaire (numéros épuisés). */
  const bloque = (k) => (restants.has(k.id) && restants.get(k.id) <= 0 ? libelleEpuisee(k) : '');
  /** Message d'erreur pour une carte bloquée (même texte que la page des drops). */
  const motifRefus = (k) => (k?.rarity === 'unique'
    ? (Number(k.max_copies) > 1 ? 'Tous les exemplaires de cette carte unique sont attribués : plus aucun exemplaire disponible.' : 'Cette carte unique est déjà attribuée : plus aucun exemplaire disponible.')
    : 'Cette carte n’a plus d’exemplaire disponible.');
  /** Sélecteur visuel de carte (monté après le contenu). */
  let pick = null;

  ui.body.innerHTML = `
    <p class="qk-err" role="alert" hidden></p>
    <div class="qk-pane" data-pane="form">
      <section class="qk-sec">
        <p class="qk-label">Carte</p>
        <div id="qk-d-pick"></div>
        <div class="qk-pair">
          <div class="field"><label for="qk-d-qty">Exemplaires à attraper</label>
            <input id="qk-d-qty" type="number" min="1" max="${limits.qmax}" step="1" inputmode="numeric" value="1">
            <p class="small muted">De 1 à ${fmtN(limits.qmax)}. Les premiers qui cliquent les gagnent.</p></div>
          <div class="field"><label for="qk-d-min">Durée (minutes)</label>
            <input id="qk-d-min" type="number" min="1" max="${limits.dmax}" step="1" inputmode="numeric" value="${limits.dflt}">
            <p class="small muted">De 1 à ${fmtN(limits.dmax)} minutes.</p></div>
        </div>
        <label class="check"><input type="checkbox" name="announce" checked> <span>Annoncer dans le fil d'actualité</span></label>
        <label class="check"><input type="checkbox" name="discord" checked> <span>Annoncer sur Discord</span></label>
      </section>
    </div>
    <div class="qk-pane" data-pane="confirm" hidden>
      <div class="vp-preview" data-confirm-visual></div>
      <p class="qk-sum qk-sum-strong" data-confirm></p>
      <p class="small muted" data-confirm-opts></p>
    </div>`;

  pick = cardPicker(ui.body.querySelector('#qk-d-pick'), { cards: actives, sets, restants, bloque, idp: 'qk-d' });
  ui.body.querySelector('#qk-d-q')?.setAttribute('data-focus', '');

  /** Lecture et contrôle, mêmes messages que la page des drops. Renvoie { error } ou les valeurs. */
  const lire = () => {
    const v = pick.value();
    const qty = Number(ui.body.querySelector('#qk-d-qty').value);
    const minutes = Number(ui.body.querySelector('#qk-d-min').value);
    if (!v.card) return { error: 'Choisis une carte dans la liste.' };
    if (bloque(v.obj)) return { error: motifRefus(v.obj) };
    if (!Number.isInteger(qty) || qty < 1 || qty > limits.qmax) return { error: `Le nombre d'exemplaires doit être entre 1 et ${fmtN(limits.qmax)}.` };
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > limits.dmax) return { error: `La durée doit être entre 1 et ${fmtN(limits.dmax)} minutes.` };
    return {
      card: v.card, obj: v.obj, qty, minutes,
      shiny: !!v.shiny,
      announce: ui.body.querySelector('[name="announce"]').checked,
      discord: ui.body.querySelector('[name="discord"]').checked,
    };
  };

  bindActions(ui, {
    onBack: () => showPane(ui, 'form', { submit: 'Lancer le drop' }),
    onReview: () => {
      const v = lire();
      if (v.error) { showErr(ui, v.error); return; }
      ui.body.querySelector('[data-confirm]').textContent =
        `Lancer « ${v.obj?.name ?? 'cette carte'} »${v.shiny ? ' (brillante)' : ''} : ${plur(v.qty, 'exemplaire à attraper', 'exemplaires à attraper')} pendant ${nf(v.minutes)} min.`;
      ui.body.querySelector('[data-confirm-opts]').textContent =
        `${v.announce ? 'Annoncé dans le fil.' : 'Hors du fil.'} ${v.discord ? 'Annonce Discord : oui (le bot poste dans le salon).' : 'Annonce Discord : non.'}`;
      ui.body.querySelector('[data-confirm-visual]').innerHTML = visuelHtml('carte', v.obj);
      showPane(ui, 'confirm', { submit: 'Lancer le drop', confirm: 'Lancer le drop' });
    },
    onConfirm: (btn) => { const v = lire(); if (v.error) { showErr(ui, v.error); return; } sendDrop(ui, v, btn); },
  });
  showPane(ui, 'form', { submit: 'Lancer le drop' });
}

/**
 * Lance le drop (hg_drop_create), puis l'annonce Discord si la case est cochée. L'annonce ne bloque jamais le lancement.
 * @param {object} ui fenêtre
 * @param {object} v valeurs lues (carte, quantité, durée, options)
 * @param {HTMLButtonElement} btn bouton de confirmation
 */
async function sendDrop(ui, v, btn) {
  busyOn(btn);
  try {
    const { data: dropId, error } = await sb.rpc('hg_drop_create', {
      p_card: v.card, p_shiny: v.shiny, p_quantity: v.qty, p_minutes: v.minutes, p_announce: v.announce,
    });
    if (error) throw error;
    toast('Drop lancé : la carte apparaît sur le site.', 'ok');
    if (v.discord && typeof dropId === 'string') notify('card_drop', { drop_id: dropId });
    ui.close();
  } catch (e) {
    showErr(ui, errMsg(e));
    busyOff(btn);
  }
}

/* =========================================================
   Écoute de l'événement du plateau
   ========================================================= */
/** Ouverture par action. */
const OPENERS = { give: openGive, enchere: openEnchere, drop: openDrop };

/**
 * Gestionnaire de « hg:quick ». Sans la permission, ou pour une action inconnue, rien n'est fait :
 * l'appelant (le plateau) suit son lien habituel.
 * @param {CustomEvent} e
 */
function onQuick(e) {
  const action = e?.detail?.action;
  const open = OPENERS[action];
  if (!open) return;
  if (!hasPerm(QUICK_PERM, getCachedPerms())) return; // pas de droit : repli (navigation)
  e.preventDefault();
  if (current?.dlg?.open) return; // une fenêtre est déjà ouverte
  open(document.activeElement);
}

/** Branche le module : feuille de style et écoute de « hg:quick ». À appeler une fois, dans admin.js. */
let inited = false;
export function initQuick() {
  if (inited) return;
  inited = true;
  if (!document.querySelector(`link[data-qk-css]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = CSS_HREF;
    link.dataset.qkCss = '';
    document.head.append(link);
  }
  document.addEventListener('hg:quick', onQuick);
}
