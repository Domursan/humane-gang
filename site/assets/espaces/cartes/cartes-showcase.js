// ===== Humane Gang — vitrine de cartes (3 emplacements) sur la fiche membre =====
// Lecture : hg_card_showcase → hg_card_copies → hg_cards (tous les membres peuvent lire, voir 018 c).
// Édition (sur sa propre fiche seulement) : une <dialog> qui liste ses exemplaires non recyclés.
// Rendu : cardHtml() de cartes-ui.js. Styles : cartes-card.css + cartes-showcase.css (préfixe shw-).
// Exporte : mountShowcase(el, { userId, isMe, pseudo }) qui affiche la vitrine dans un élément de la fiche membre ;
// withMeta, loadShowcase et CARD_COLS, repris par cartes-vitrine-image.js (vitrine en image, idée 58).
import { sb, esc, errMsg, toast, canAccess } from '../../commun/core.js';
import { cardHtml, rarityRank } from './cartes-ui.js';

/* ---------- Constantes ---------- */
const SLOTS = [1, 2, 3]; // numéros des 3 emplacements de la vitrine
// Colonnes lues sur hg_cards (on évite select('*') pour ne pas charger de champs inutiles).
export const CARD_COLS = 'id, set_id, number, name, family, rarity, image_url, flavor, caption, member_id, max_copies';
// Icône du bouton « Créer une image » (idée 58).
const ICON_IMG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';

/* ---------- Données d'affichage (mises en cache) ---------- */
/* Données d'affichage communes à la page : noms des séries (quelques lignes) et nombre de cartes par série
   (un comptage par série, sans lire les cartes). Mises en cache. */
let metaP = null, sinceP = null; // promesses mises en cache : une seule lecture par page
/**
 * Charge les noms des séries et leur nombre de cartes. Facultatif : en cas d'erreur, les cartes
 * s'affichent sans nom de série ni total. Mis en cache.
 * @returns {Promise<{names: Map, totals: Map}>} noms et totaux par identifiant de série
 */
function loadMeta() {
  return metaP ??= (async () => {
    const names = new Map(), totals = new Map();
    try {
      const { data: sets, error } = await sb.from('hg_card_sets').select('id, name');
      if (error) throw error;
      for (const x of sets || []) if (x.name) names.set(x.id, x.name);
      await Promise.all((sets || []).map(async (x) => {
        const { count, error: e } = await sb.from('hg_cards').select('id', { count: 'exact', head: true }).eq('set_id', x.id);
        if (!e) totals.set(x.id, count || 0);
      }));
    } catch { /* facultatif : la carte s'affiche sans nom ni total de série */ }
    return { names, totals };
  })();
}
/**
 * Date d'arrivée de chaque membre (pour la carte Identité). Mis en cache. Vide en cas d'erreur.
 * @returns {Promise<Map<string, string>>} date d'arrivée par identifiant de membre
 */
function loadSince() {
  return sinceP ??= (async () => {
    try {
      const { data, error } = await sb.rpc('hg_members');
      if (error) throw error;
      return new Map((data || []).map((m) => [m.id, m.member_since]));
    } catch { return new Map(); }
  })();
}
/**
 * Charge les données communes, puis renvoie une fonction qui complète une carte avec ses champs d'affichage
 * (série, total, arrivée du membre pour une Identité). Le chargement de l'arrivée n'a lieu que si une Identité figure dans la liste.
 * @param {object[]} cards cartes concernées (sert seulement à savoir si une Identité est présente)
 * @returns {Promise<(card: object) => object>} fonction de complétion (renvoie la carte telle quelle si elle est vide)
 */
export async function withMeta(cards) {
  const [meta, since] = await Promise.all([loadMeta(), cards.some((c) => c?.rarity === 'identite') ? loadSince() : null]);
  /** Complète une carte avec sa série, son total et l'arrivée du membre (Identité). Une carte vide est renvoyée telle quelle. */
  const decorate = (card) => (card ? {
    ...card,
    set_name: meta.names.get(card.set_id), set_total: meta.totals.get(card.set_id),
    member_since: card.rarity === 'identite' ? (since?.get(card.member_id) ?? null) : null,
  } : card);
  return decorate;
}

/** Emplacements : slot → { copy_id, shiny, serial, card }. Ignore tout exemplaire qui n'est plus à ce membre. */
export async function loadShowcase(userId) {
  const { data, error } = await sb.from('hg_card_showcase')
    .select(`slot, copy_id, hg_card_copies(id, owner_id, shiny, serial, recycled_at, hg_cards(${CARD_COLS}))`)
    .eq('user_id', userId).order('slot');
  if (error) throw error;
  const bySlot = new Map();
  for (const row of data || []) {
    const c = row.hg_card_copies;
    if (!c?.hg_cards || c.owner_id !== userId || c.recycled_at) continue;
    bySlot.set(row.slot, { copy_id: c.id, shiny: !!c.shiny, serial: c.serial, card: c.hg_cards });
  }
  return bySlot;
}

/** Exemplaires non recyclés du membre (pour l'éditeur), les plus rares d'abord. */
async function loadCollection(userId) {
  const { data, error } = await sb.from('hg_card_copies')
    .select(`id, shiny, serial, hg_cards(${CARD_COLS})`)
    .eq('owner_id', userId).is('recycled_at', null).limit(1000);
  if (error) throw error;
  return (data || []).filter((r) => r.hg_cards)
    .sort((a, b) => rarityRank(b.hg_cards.rarity) - rarityRank(a.hg_cards.rarity)
      || (a.hg_cards.number ?? 0) - (b.hg_cards.number ?? 0) || a.id - b.id);
}

/**
 * Affiche la vitrine dans `el`. Pour un autre membre sans vitrine, la section est masquée.
 * Sur sa propre fiche : « Créer une image » (idée 58, cartes-vitrine-image.js, chargé au clic) et « Modifier ma vitrine ».
 */
export async function mountShowcase(el, { userId, isMe, pseudo = '' }) {
  if (!el || !userId) return;
  if (!canAccess('cartes')) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.add('shw');
  el.setAttribute('aria-labelledby', 'shw-title');
  el.innerHTML = `
    <div class="shw-head">
      <h2 class="mb-section-title" id="shw-title">Vitrine</h2>
      ${isMe ? `<div class="shw-btns"><button type="button" class="btn btn-ghost shw-img">${ICON_IMG}Créer une image</button><button type="button" class="btn btn-ghost shw-edit">Modifier ma vitrine</button></div>` : ''}
    </div>
    <div class="shw-body" aria-busy="true"><div class="shw-skel" aria-hidden="true"></div></div>`;
  const body = el.querySelector('.shw-body');

  /** Dessine les 3 emplacements. Un visiteur ne voit pas la section si la vitrine est vide. */
  const paint = (bySlot, decorate) => {
    if (!isMe && !bySlot.size) { el.hidden = true; return; }
    const items = SLOTS.filter((s) => bySlot.has(s) || isMe).map((s) => {
      const hit = bySlot.get(s);
      return `<li>${hit
        ? cardHtml(decorate(hit.card), { shiny: hit.shiny, serial: hit.serial })
        : `<div class="shw-empty" aria-label="Emplacement ${s} libre"><span>Emplacement ${s} libre</span></div>`}</li>`;
    });
    body.innerHTML = `<ul class="shw-slots">${items.join('')}</ul>`;
  };
  /** Relit la vitrine depuis la base et la redessine (aussi appelée après un enregistrement). */
  const refresh = async () => {
    body.setAttribute('aria-busy', 'true');
    try {
      const bySlot = await loadShowcase(userId);
      paint(bySlot, await withMeta([...bySlot.values()].map((h) => h.card)));
    }
    catch (e) { body.innerHTML = `<p class="empty">Vitrine indisponible (${esc(errMsg(e))}).</p>`; }
    body.setAttribute('aria-busy', 'false');
  };

  el.querySelector('.shw-edit')?.addEventListener('click', (e) => openEditor(userId, refresh, e.currentTarget));
  el.querySelector('.shw-img')?.addEventListener('click', async (e) => {
    const b = e.currentTarget;
    try { (await import('./cartes-vitrine-image.js')).openVitrineImage({ userId, pseudo }, b); }
    catch (err) { toast(`Image : ${errMsg(err)}`, 'error'); }
  });
  await refresh();
}

/* ---------- Éditeur (dialogue « Ma vitrine ») ---------- */
/**
 * Éditeur : choisir jusqu'à 3 exemplaires (un par emplacement), puis enregistrer.
 * La fenêtre est créée à l'ouverture et retirée de la page à sa fermeture.
 * @param {string} userId membre dont on modifie la vitrine
 * @param {() => Promise<void>} onSaved rafraîchit la vitrine affichée après un enregistrement
 * @param {HTMLButtonElement} btn bouton qui a ouvert l'éditeur (désactivé pendant le chargement)
 */
async function openEditor(userId, onSaved, btn) {
  btn.disabled = true;
  let collection, current;
  try {
    [collection, current] = await Promise.all([loadCollection(userId), loadShowcase(userId)]);
  } catch (e) {
    btn.disabled = false;
    toast(`Vitrine : ${errMsg(e)}`, 'error');
    return;
  }
  btn.disabled = false;

  const picks = SLOTS.map((s) => current.get(s)?.copy_id ?? null);
  const decorate = await withMeta(collection.map((r) => r.hg_cards));
  const byCopy = new Map(collection.map((r) => [String(r.id), r]));

  const dlg = document.createElement('dialog');
  dlg.className = 'shw-dlg';
  dlg.setAttribute('aria-labelledby', 'shw-dlg-title');
  dlg.innerHTML = `
    <div class="shw-dlg-inner">
      <header>
        <h2 id="shw-dlg-title" class="shw-dlg-title">Ma vitrine</h2>
        <p class="muted small">Choisis jusqu'à 3 cartes dans ta collection. Touche une carte pour l'ajouter ou la retirer, touche un emplacement pour le libérer.</p>
      </header>
      <div class="shw-dlg-picks" role="group" aria-label="Emplacements de la vitrine"></div>
      <h3 class="shw-sub">Ma collection <span class="muted small shw-count"></span></h3>
      <div class="shw-dlg-grid" role="group" aria-label="Ma collection"></div>
      <p class="shw-dlg-msg" role="status" aria-live="polite"></p>
      <div class="btn-row shw-dlg-actions">
        <button class="btn btn-ghost" type="button" data-cancel>Annuler</button>
        <button class="btn btn-primary" type="button" data-save>Enregistrer</button>
      </div>
    </div>`;
  document.body.append(dlg);
  const picksEl = dlg.querySelector('.shw-dlg-picks');
  const gridEl = dlg.querySelector('.shw-dlg-grid');
  const msgEl = dlg.querySelector('.shw-dlg-msg');
  const saveBtn = dlg.querySelector('[data-save]');
  /** Affiche un message d'état dans le dialogue (chaîne vide pour l'effacer). */
  const say = (t) => { msgEl.textContent = t; };

  /** Redessine les emplacements choisis et la grille de la collection (badge = numéro d'emplacement). */
  const paint = () => {
    picksEl.innerHTML = SLOTS.map((s, i) => {
      const r = picks[i] != null ? byCopy.get(String(picks[i])) : null;
      return r
        ? `<button type="button" class="shw-pick" data-slot="${i}" aria-label="Libérer l'emplacement ${s} (${esc(r.hg_cards.name)})">${cardHtml(decorate(r.hg_cards), { shiny: r.shiny, serial: r.serial, size: 'sm' })}<span class="shw-pick-x">Libérer</span></button>`
        : `<div class="shw-pick shw-pick-empty"><span>Emplacement ${s}</span></div>`;
    }).join('');
    gridEl.innerHTML = collection.length ? collection.map((r) => {
      const idx = picks.findIndex((p) => p != null && String(p) === String(r.id));
      const label = `${r.hg_cards.name}${idx >= 0 ? `, dans la vitrine, emplacement ${idx + 1}` : ', ajouter à la vitrine'}`;
      return `<button type="button" class="shw-pickable${idx >= 0 ? ' is-picked' : ''}" data-copy="${esc(r.id)}" aria-label="${esc(label)}">${cardHtml(decorate(r.hg_cards), { shiny: r.shiny, serial: r.serial, size: 'sm' })}${idx >= 0 ? `<span class="shw-badge" aria-hidden="true">${idx + 1}</span>` : ''}</button>`;
    }).join('') : '<p class="empty">Tu n\'as pas encore de carte. Ouvre un booster pour commencer.</p>';
    dlg.querySelector('.shw-count').textContent = collection.length ? `(${collection.length} exemplaire${collection.length > 1 ? 's' : ''})` : '';
  };

  // Toucher une carte de la collection l'ajoute au premier emplacement libre, ou la retire si elle est déjà choisie.
  gridEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    const idx = picks.findIndex((p) => p != null && String(p) === b.dataset.copy);
    if (idx >= 0) picks[idx] = null;
    else {
      const free = picks.indexOf(null);
      if (free < 0) { say('La vitrine est pleine : libère un emplacement d\'abord.'); return; }
      picks[free] = byCopy.get(b.dataset.copy).id;
    }
    say('');
    paint();
  });
  // Toucher un emplacement rempli le libère (la carte ne part qu'à l'enregistrement).
  picksEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-slot]');
    if (!b) return;
    picks[Number(b.dataset.slot)] = null;
    say('');
    paint();
  });

  dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // clic sur le fond
  dlg.addEventListener('close', () => dlg.remove(), { once: true });

  // Enregistrement : d'abord les emplacements remplis (upsert), puis suppression des emplacements vidés.
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    say('');
    try {
      const rows = SLOTS.flatMap((s, i) => (picks[i] != null ? [{ user_id: userId, slot: s, copy_id: picks[i] }] : []));
      const emptied = SLOTS.filter((s, i) => picks[i] == null);
      if (rows.length) {
        const { error } = await sb.from('hg_card_showcase').upsert(rows, { onConflict: 'user_id,slot' });
        if (error) throw error;
      }
      if (emptied.length) {
        const { error } = await sb.from('hg_card_showcase').delete().eq('user_id', userId).in('slot', emptied);
        if (error) throw error;
      }
      dlg.close();
      toast('Vitrine mise à jour', 'ok');
      await onSaved();
    } catch (e) {
      say(`Enregistrement impossible : ${errMsg(e)}`);
      saveBtn.disabled = false;
    }
  });

  paint();
  dlg.showModal();
}
