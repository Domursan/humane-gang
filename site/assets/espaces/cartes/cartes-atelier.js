// ===== Cartes : l'Atelier, recettes de fabrication thématiques (idée C10, migration 081) =====
// Panneau en tête de l'onglet Collection : chaque recette montre ses ingrédients (cartes précises ou « 3 cartes
// Minecraft au choix »), les exemplaires que la page propose d'utiliser (doubles d'abord ; jamais un exemplaire en
// échange ou en vitrine, ni une carte Identité ou unique), la carte obtenue et le bouton « Fabriquer ».
// Un ingrédient qui consommerait le dernier exemplaire d'une carte est marqué en orange : il faut cocher
// « Oui, j'utilise mon dernier … » (le serveur le vérifie aussi : p_confirm_last).
// RPC : hg_card_recipes_me (recettes ouvertes et exemplaires en vitrine), hg_card_recipe_craft.
// Exporte : initAtelier(ctx), drawAtelier(), vitrine(). ctx = { app, copies: () => [], card: (id) => object|null, refresh, toast }.
import { sb, esc, toast, errMsg } from '../../commun/core.js';
import { cardHtml, rarityLabel, fmtP } from './cartes-ui.js';
import { tagLabel } from './cartes-jeux.js';
import { confirmBox } from '../../commun/ui-confirm.js';

let C = null;
// recipes : null = pas chargé, [] = aucune ; open : recette dépliée ; confirm : recettes où « dernier exemplaire » est coché.
const A = { recipes: null, showcase: new Set(), open: null, confirm: new Set(), busy: false, err: '', plie: true };
/** Carte connue d'après son identifiant (collection), ou une fiche minimale. */
const cardOf = (id, fallback = {}) => C.card(id) || { id, name: fallback.name || 'Carte', rarity: fallback.rarity || 'commune', family: 'objet' };
const blocked = (r) => r === 'identite' || r === 'unique';

/**
 * Choisit les exemplaires d'une recette : ingrédients « carte précise » d'abord, puis par tag (la carte qui a le plus
 * d'exemplaires libres d'abord). Exemplaires libres seulement ; non brillants d'abord.
 * @param {object} r recette (inputs)
 * @returns {{picks: Array<{copy: object, card: object, last: boolean, spare: number}>, missing: string[]}}
 */
export function plan(r) {
  const live = C.copies();
  const free = live.filter((cp) => !cp.locked_trade && !A.showcase.has(Number(cp.id)) && !blocked(cardOf(cp.card_id).rarity))
    .sort((a, b) => Number(a.shiny) - Number(b.shiny) || Number(a.id) - Number(b.id));
  const total = new Map();
  for (const cp of live) total.set(cp.card_id, (total.get(cp.card_id) || 0) + 1);
  const taken = new Set(); const used = new Map(); const picks = []; const missing = [];
  const take = (cardId) => {
    const cp = free.find((x) => x.card_id === cardId && !taken.has(x.id));
    if (!cp) return false;
    taken.add(cp.id); used.set(cardId, (used.get(cardId) || 0) + 1);
    picks.push({ copy: cp, card: cardOf(cardId) });
    return true;
  };
  /** Pourquoi une carte que je possède n'est pas proposée : en vitrine ou bloquée par un échange (sinon ''). */
  const held = (cardId) => {
    const mine = live.filter((x) => x.card_id === cardId && !taken.has(x.id));
    if (mine.some((x) => A.showcase.has(Number(x.id)))) return 'dans ta vitrine : retire-la de ta vitrine pour pouvoir l’utiliser';
    if (mine.some((x) => x.locked_trade)) return 'bloquée par une offre d’échange en cours';
    return '';
  };
  const inputs = [...(r.inputs || [])].sort((a, b) => Number(!!b.card) - Number(!!a.card));
  for (const inp of inputs) {
    for (let i = 0; i < inp.qty; i++) {
      if (inp.card) {
        if (!take(inp.card)) { const name = inp.name || cardOf(inp.card).name; const why = held(inp.card); missing.push(why ? `« ${name} » (${why})` : name); break; }
        continue;
      }
      const cands = (inp.cards || []).map((id) => ({ id, left: free.filter((x) => x.card_id === id && !taken.has(x.id)).length, spare: (total.get(id) || 0) - (used.get(id) || 0) }))
        .filter((x) => x.left > 0).sort((a, b) => b.spare - a.spare);
      if (!cands.length || !take(cands[0].id)) { missing.push(`${inp.qty - i} carte${inp.qty - i > 1 ? 's' : ''} ${inp.label || tagLabel(inp.tag)}`); break; }
    }
  }
  // Dernier exemplaire : après la fabrication, il ne resterait plus aucun exemplaire de la carte.
  const after = new Map();
  for (const p of picks) {
    const k = p.card.id; after.set(k, (after.get(k) ?? total.get(k) ?? 0) - 1);
  }
  for (const p of picks) { p.left = after.get(p.card.id); p.last = p.left <= 0; p.spare = (total.get(p.card.id) || 0); }
  return { picks, missing };
}

/** Recette encore possible pour moi (pas déjà faite si une fois par membre, pas épuisée). */
const available = (r) => !(r.once_per_user && r.done) && !(r.max_total != null && r.used_total >= r.max_total);
/** Ligne d'aide d'une recette : ingrédients et date de fin. */
function summary(r) {
  const parts = (r.inputs || []).map((i) => (i.card ? `${i.qty > 1 ? i.qty + ' × ' : ''}${i.name || 'carte'}` : `${i.qty} ${i.label || tagLabel(i.tag)} au choix`));
  if (r.paillettes) parts.push(fmtP(r.paillettes));
  const end = r.ends_at ? ` · jusqu’au ${new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'short', timeZone: 'Europe/Zurich' }).format(new Date(r.ends_at))}` : '';
  return parts.join(' + ') + end;
}

/** Recette réalisable tout de suite avec mes cartes et mes Paillettes. */
function realisable(r) {
  const { picks, missing } = plan(r);
  return available(r) && !missing.length && picks.length === (r.inputs || []).reduce((a, i) => a + i.qty, 0) && (C.god() || r.paillettes <= C.balance());
}

/** Recette dépliée : ingrédients choisis, Paillettes, carte obtenue, confirmation et bouton. */
function openHtml(r) {
  const { picks, missing } = plan(r);
  const need = (r.inputs || []).reduce((a, i) => a + i.qty, 0);
  const lasts = [...new Set(picks.filter((p) => p.last).map((p) => p.card.name))];
  const conf = A.confirm.has(r.id);
  const bal = C.balance();
  const short = !C.god() && r.paillettes > bal;
  const can = available(r) && !missing.length && picks.length === need && (!lasts.length || conf) && !short && !A.busy;
  const ing = picks.map((p) => `<li class="c2-ing${p.last ? ' is-last' : ''}">
      <span class="c2-ing-card">${cardHtml(p.card, { size: 'sm', shiny: p.copy.shiny })}<span class="c2-ing-badge" aria-hidden="true">${p.last ? '!' : '✓'}</span></span>
      <span class="c2-ing-cap">${p.last ? 'Ton dernier exemplaire' : `×${p.spare}, en double`}</span></li>`).join('');
  const why = !available(r) ? (r.done ? 'Tu as déjà fabriqué cette recette.' : 'Cette recette est épuisée.')
    : missing.length ? `Il te manque : ${missing.join(', ')}.` : short ? `Il te faut ${fmtP(r.paillettes)}.` : '';
  return `<article class="card c2-rec-open" aria-labelledby="c2-rec-${esc(r.id)}">
      <div class="c2-rec-head"><h3 id="c2-rec-${esc(r.id)}" class="c2-rec-name">${esc(r.name)}</h3>
        <span class="pill pill-sand">${esc(rarityLabel(r.output?.rarity))}</span></div>
      ${r.description ? `<p class="muted small">${esc(r.description)}</p>` : ''}
      <ul class="c2-ings" aria-label="Ingrédients">${ing}${missing.map((m) => `<li class="c2-ing is-miss"><span class="c2-ing-cap">Manque : ${esc(m)}</span></li>`).join('')}</ul>
      <p class="c2-rec-gives">${r.paillettes ? `<span class="pill">+ ${esc(fmtP(r.paillettes))}</span>` : ''}<span class="muted" aria-hidden="true">↓</span><span class="muted">donne</span></p>
      <div class="c2-rec-out">
        <div class="c2-rec-card">${cardHtml(r.output || {}, { size: 'md', shiny: r.output_shiny })}</div>
        <div class="c2-rec-act">
          ${lasts.length ? `<label class="check c2-rec-last"><input type="checkbox" data-c2="rec-last" data-id="${esc(r.id)}" ${conf ? 'checked' : ''}>
            <span>Oui, j’utilise mon dernier ${lasts.map((n) => `« ${esc(n)} »`).join(', ')}</span></label>` : ''}
          <p class="muted small">Les cartes en vitrine ou en échange ne sont jamais proposées. Les cartes utilisées disparaissent de ta collection.</p>
          ${why ? `<p class="c2-rec-why" role="status">${esc(why)}</p>` : ''}
          <button type="button" class="btn btn-sand c2-rec-go" data-c2="rec-craft" data-id="${esc(r.id)}" ${can ? '' : 'disabled'}>${A.busy ? 'Fabrication…' : `Fabriquer${r.paillettes ? ' · ' + esc(fmtP(r.paillettes)) : ''}`}</button>
        </div>
      </div>
    </article>`;
}

/** Recette repliée : nom, ingrédients, avancement (cartes disponibles / demandées). */
function rowHtml(r) {
  const { picks } = plan(r);
  const need = (r.inputs || []).reduce((a, i) => a + i.qty, 0);
  return `<li><button type="button" class="c2-rec-row" data-c2="rec-open" data-id="${esc(r.id)}">
      <span class="c2-rec-row-t"><strong>${esc(r.name)}</strong><span class="muted small">${esc(summary(r))}</span></span>
      <span class="pill">${available(r) ? `${Math.min(picks.length, need)} / ${need}` : r.done ? 'Faite' : 'Épuisée'}</span>
    </button></li>`;
}

/** Dessine le panneau (dans #cartes-atelier, posé par drawCollection), replié à l'arrivée. Sans recette ouverte : rien. */
export function drawAtelier() {
  const el = document.getElementById('cartes-atelier');
  if (!el || !C) return;
  if (A.recipes === null) { el.innerHTML = ''; return; }
  if (!A.recipes.length) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  const cur = A.recipes.find((r) => r.id === A.open) || A.recipes.find(available) || A.recipes[0];
  A.open = cur.id;
  const n = A.recipes.length, ok = A.recipes.filter(realisable).length;
  el.innerHTML = `<details class="card luck mc-plie" data-atelier${A.plie ? '' : ' open'}>
      <summary class="luck-sum"><span class="luck-h">Atelier</span><span class="luck-pill luck-${ok ? 'up' : 'mid'}">${ok} réalisable${ok > 1 ? 's' : ''}</span></summary>
      <p class="small muted luck-intro">${n} recette${n > 1 ? 's' : ''} active${n > 1 ? 's' : ''}</p>
      <div class="mc-corps"><section class="c2-atelier" aria-label="Recettes de l’Atelier">
        ${openHtml(cur)}
        ${n > 1 ? `<ul class="card c2-rec-list">${A.recipes.filter((r) => r !== cur).map(rowHtml).join('')}</ul>` : ''}
      </section></div>
    </details>`;
  el.querySelector('[data-atelier]').addEventListener('toggle', (e) => { A.plie = !e.currentTarget.open; });
}

/** Exemplaires en vitrine, jamais proposés au recyclage (vide tant que les recettes ne sont pas chargées). */
export const vitrine = () => A.showcase;

/** Charge les recettes ouvertes (sans erreur visible si la fonction n'existe pas encore). */
export async function loadAtelier() {
  try {
    const { data, error } = await sb.rpc('hg_card_recipes_me');
    if (error) throw error;
    A.recipes = Array.isArray(data?.recipes) ? data.recipes : [];
    A.showcase = new Set((data?.showcase || []).map(Number));
  } catch (e) {
    console.warn('[atelier]', e?.message || e);
    A.recipes = [];
  }
  drawAtelier();
}

/** Fabrique la recette ouverte avec les exemplaires choisis, après confirmation. */
async function craft(id) {
  const r = A.recipes?.find((x) => x.id === id);
  if (!r || A.busy) return;
  const { picks, missing } = plan(r);
  if (missing.length) return;
  const lost = picks.map((p) => `${p.card.name}${p.copy.shiny ? ' (brillante)' : ''}`).join(', ');
  const ok = await confirmBox(`Fabriquer « ${r.output?.name || r.name} » ?`,
    `Tu utilises : ${lost}${r.paillettes ? ` et ${fmtP(r.paillettes)}` : ''}. Ces cartes disparaissent de ta collection.`, { ok: 'Fabriquer' });
  if (!ok) return;
  A.busy = true; drawAtelier();
  try {
    const { error } = await sb.rpc('hg_card_recipe_craft', { p_recipe: r.id, p_copies: picks.map((p) => Number(p.copy.id)), p_confirm_last: A.confirm.has(r.id) });
    if (error) throw error;
    toast(`« ${r.output?.name || 'Carte'} » fabriquée à l’Atelier !`, 'ok');
    A.confirm.delete(r.id);
  } catch (e) {
    toast(errMsg(e), 'error');
  }
  A.busy = false;
  await C.refresh();
  await loadAtelier();
}

/**
 * Branche les écouteurs et charge les recettes. Une seule fois.
 * @param {{app: HTMLElement, copies: () => object[], card: (id: string) => object|null, balance: () => number, god: () => boolean, refresh: () => Promise<void>}} ctx
 */
export function initAtelier(ctx) {
  if (C) return;
  C = ctx;
  ctx.app.addEventListener('click', (e) => {
    const b = e.target.closest('[data-c2^="rec-"]');
    if (!b || b.disabled) return;
    if (b.dataset.c2 === 'rec-open') { A.open = b.dataset.id; drawAtelier(); document.querySelector('.c2-rec-open .c2-rec-name')?.focus?.(); document.getElementById(`c2-rec-${b.dataset.id}`)?.scrollIntoView({ block: 'nearest' }); }
    if (b.dataset.c2 === 'rec-craft') craft(b.dataset.id);
  });
  ctx.app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset?.c2 !== 'rec-last') return;
    if (t.checked) A.confirm.add(t.dataset.id); else A.confirm.delete(t.dataset.id);
    drawAtelier();
    document.querySelector(`[data-c2="rec-last"][data-id="${CSS.escape(t.dataset.id)}"]`)?.focus();
  });
  loadAtelier();
}
