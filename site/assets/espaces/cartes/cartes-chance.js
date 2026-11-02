// ===== Cartes à collectionner — « Ma chance en chiffres » (idée C14) =====
// Encart repliable en tête de l'onglet Collection (/pages/cartes/cartes.html) : mes tirages comparés aux taux annoncés, rareté par rareté
// (barre grise = annoncé, barre de couleur = obtenu), verdict honnête (seulement à partir de 100 cartes, écart en écarts-types
// calculé côté serveur), taux de brillantes, garanties Épique en cours, plus longue série sans Épique, meilleure ouverture,
// et une petite image « Ma chance » à partager (sans solde), dessinée en canvas.
// RPC (migration 082) : hg_card_luck_me() — personnel, lecture seule. Sans la fonction (migration pas déployée) : rien n'est affiché.
// Seules les cartes tirées dans les boosters du membre comptent (pas les cadeaux, drops, fabrications) : c'est dit sous l'encart.
// Exporte : mountLuck(slot) — remplit slot (rendu immédiat depuis le cache, rechargement si les données ont plus d'une minute).
import { sb, esc, fmtDate } from '../../commun/core.js';
import { cardHtml, rarityLabel } from './cartes-ui.js';
import { TINT } from './cartes-zoom.js';
import { downloadCanvas } from '../irl/ss-card.js';

const nf1 = new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const nf = new Intl.NumberFormat('fr-CH');
const monthFmt = new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'Europe/Zurich' });
/** Libellés du verdict (identifiants renvoyés par hg_card_luck_me) et ton de la pastille. */
const VERDICT = {
  tres_chanceux: ['Le RNG t’adore', 'up'], chanceux: ['Légèrement chanceux', 'up'], moyenne: ['Dans la moyenne', 'mid'],
  malchanceux: ['Légèrement malchanceux', 'down'], boude: ['Le RNG te boude', 'down'], pas_assez: ['Pas encore assez de tirages', 'mid'],
};
/** Cache : données, heure du chargement, chargement en cours, absence de la fonction ; ouvert : replié à chaque arrivée, sans mémoire. */
const L = { data: null, at: 0, loading: null, missing: false, ouvert: false };

const pct = (v) => (v == null ? '–' : `${nf1.format(Number(v))} %`);
/** Largeur d'une barre : racine carrée (les petites raretés restent visibles), relative au plus grand taux affiché. */
const barW = (v, max) => (v > 0 && max > 0 ? Math.max(2, Math.sqrt(v / max) * 100) : 0);

/** Lignes à afficher : commune → mythique, et l'identité seulement si on en a tiré une. */
const shownRarities = (d) => (d.rarities || []).filter((r) => r.id !== 'identite' || Number(r.count) > 0);

/** HTML d'une rareté : libellé, « annoncé → obtenu », deux barres. */
function rarityRow(r, max) {
  const exp = Number(r.expected), obs = Number(r.observed);
  const hi = ['rare', 'epique', 'legendaire', 'mythique', 'identite'].includes(r.id);
  const cls = r.observed == null || r.expected == null ? '' : hi && obs > exp ? ' luck-up' : hi && obs < exp ? ' luck-down' : '';
  return `<li class="luck-row">
    <div class="luck-line"><span>${esc(rarityLabel(r.id))}</span><span class="luck-vals"><span class="muted">${pct(r.expected)}</span> → <strong class="luck-obs${cls}">${pct(r.observed)}</strong></span></div>
    <span class="luck-bar luck-bar-exp" style="width:${barW(exp, max)}%" aria-hidden="true"></span>
    <span class="luck-bar" style="width:${barW(obs, max)}%;background:${TINT[r.id] || '#c4c9d6'}" aria-hidden="true"></span>
    <span class="visually-hidden">${esc(rarityLabel(r.id))} : ${pct(r.expected)} annoncés, ${pct(r.observed)} pour toi (${nf.format(Number(r.count) || 0)} cartes)</span>
  </li>`;
}

/** HTML complet de l'encart (données chargées). */
function luckHtml(d, open) {
  const [vLabel, vTone] = VERDICT[d.verdict] || VERDICT.pas_assez;
  const n = Number(d.total) || 0;
  if (!n) {
    return `<details class="card luck" data-luck ${open ? 'open' : ''}><summary class="luck-sum"><span class="luck-h">Ma chance</span><span class="luck-pill luck-mid">Aucun tirage</span></summary>
      <p class="muted small">Ouvre tes premiers boosters : on comparera ici tes tirages aux taux annoncés.</p></details>`;
  }
  const rows = shownRarities(d);
  const max = Math.max(...rows.map((r) => Math.max(Number(r.expected) || 0, Number(r.observed) || 0)), 1);
  const sh = d.shiny || {};
  const pity = (d.pity || []).filter((p) => Number(p.every) > 0);
  const best = d.best?.cards?.length ? d.best : null;
  return `<details class="card luck" data-luck ${open ? 'open' : ''}>
    <summary class="luck-sum"><span class="luck-h">Ma chance</span><span class="luck-pill luck-${vTone}">${esc(vLabel)}</span></summary>
    <p class="small muted luck-intro">${nf.format(n)} carte${n > 1 ? 's' : ''} tirée${n > 1 ? 's' : ''} dans ${nf.format(Number(d.boosters) || 0)} booster${Number(d.boosters) > 1 ? 's' : ''} · taux annoncés (gris) et les tiens (couleur)${d.verdict === 'pas_assez' ? ` · verdict à partir de ${nf.format(Number(d.min) || 100)} cartes` : ''}</p>
    <ul class="luck-rows">${rows.map((r) => rarityRow(r, max)).join('')}</ul>
    <p class="small muted">Brillantes : ${pct(sh.expected)} annoncés, <strong class="luck-strong">${pct(sh.observed)}</strong> pour toi (${nf.format(Number(sh.count) || 0)}).</p>
    ${pity.length ? `<section class="luck-sub" aria-label="Garanties en cours"><h3 class="luck-sub-h">Garanties en cours</h3>
      <ul class="luck-pity">${pity.map((p) => {
        const left = Number(p.left), every = Number(p.every), done = Math.max(0, Math.min(100, (every - left) / every * 100));
        return `<li><div class="luck-line"><span>${esc(p.name)}</span><span>Épique garantie dans <strong>${nf.format(left)}</strong> booster${left > 1 ? 's' : ''}</span></div>
          <div class="progress luck-pbar" role="progressbar" aria-label="Garantie Épique ${esc(p.name)}" aria-valuemin="0" aria-valuemax="${every}" aria-valuenow="${every - left}"><span style="width:${done}%"></span></div></li>`;
      }).join('')}</ul>
      ${d.dry?.length ? `<p class="small muted">Plus longue série sans Épique : ${nf.format(Number(d.dry.length))} booster${Number(d.dry.length) > 1 ? 's' : ''} (${esc(monthFmt.format(new Date(d.dry.ended_at)))}).</p>` : ''}
    </section>` : ''}
    ${best ? `<section class="luck-sub" aria-label="Meilleure ouverture"><div class="luck-line"><h3 class="luck-sub-h">Meilleure ouverture</h3><span class="small muted">${esc([best.type_name, fmtDate(best.at)].filter(Boolean).join(' · '))}</span></div>
      <div class="luck-best">${best.cards.map((c) => cardHtml(c, { size: 'sm', shiny: !!c.shiny })).join('')}</div></section>` : ''}
    <button type="button" class="btn btn-ghost luck-share" data-luck-act="share">Partager ma chance</button>
    <p class="small muted luck-note">Seules les cartes tirées dans tes boosters comptent (pas les cadeaux, drops ni fabrications). Personne d’autre ne voit cet encart.</p>
  </details>`;
}

/** Dessine l'image « Ma chance » (sans solde) : verdict, raretés, brillantes. */
function drawShare(d) {
  const W = 1080, rows = shownRarities(d), H = 300 + rows.length * 86 + 110;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#0E0E10'; x.fillRect(0, 0, W, H);
  ['#FE3104', '#FCA301', '#FBD32D', '#159946', '#2B5AE2', '#4E2398'].forEach((col, i) => { x.fillStyle = col; x.fillRect(i * W / 6, 0, W / 6 + 1, 12); });
  x.fillStyle = '#E2C77E'; x.font = '600 28px Inter, system-ui, sans-serif'; x.fillText('HUMANE GANG · MA CHANCE', 64, 84);
  x.fillStyle = '#F2EFEA'; x.font = '64px "Archivo Black", Impact, sans-serif'; x.fillText((VERDICT[d.verdict] || VERDICT.pas_assez)[0], 64, 170);
  x.fillStyle = '#ABA7A0'; x.font = '28px Inter, system-ui, sans-serif';
  x.fillText(`${nf.format(Number(d.total))} cartes · ${nf.format(Number(d.boosters))} boosters`, 64, 222);
  const max = Math.max(...rows.map((r) => Math.max(Number(r.expected) || 0, Number(r.observed) || 0)), 1);
  rows.forEach((r, i) => {
    const y = 290 + i * 86;
    x.fillStyle = '#F2EFEA'; x.font = '600 30px Inter, system-ui, sans-serif'; x.fillText(rarityLabel(r.id), 64, y);
    x.textAlign = 'right'; x.fillText(`${pct(r.expected)} → ${pct(r.observed)}`, W - 64, y); x.textAlign = 'left';
    x.fillStyle = '#3A3A40'; x.fillRect(64, y + 16, (W - 128) * barW(Number(r.expected), max) / 100, 12);
    x.fillStyle = TINT[r.id] || '#c4c9d6'; x.fillRect(64, y + 34, (W - 128) * barW(Number(r.observed), max) / 100, 12);
  });
  x.fillStyle = '#ABA7A0'; x.font = '26px Inter, system-ui, sans-serif';
  x.fillText(`Brillantes : ${pct(d.shiny?.expected)} annoncés, ${pct(d.shiny?.observed)} pour moi`, 64, H - 60);
  return c;
}

/** Partage l'image : feuille de partage du téléphone si elle accepte les fichiers, sinon téléchargement du PNG. */
async function share(btn) {
  const d = L.data;
  if (!d) return;
  btn.disabled = true;
  try {
    const canvas = drawShare(d);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const file = blob && typeof File === 'function' ? new File([blob], 'ma-chance-hg.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Ma chance · Humane Gang' }).catch(() => {});
    } else {
      await downloadCanvas(canvas, 'ma-chance-hg.png');
    }
  } finally {
    btn.disabled = false;
  }
}

/** Charge les données (une seule requête à la fois). */
async function load() {
  if (L.loading) return L.loading;
  L.loading = (async () => {
    try {
      const { data, error } = await sb.rpc('hg_card_luck_me');
      if (error) throw error;
      L.data = data && typeof data === 'object' ? data : null;
      L.missing = !L.data;
    } catch (e) {
      console.warn('[ma chance]', e);
      L.missing = true;
    }
    L.at = Date.now();
    L.loading = null;
  })();
  return L.loading;
}

/** Branche les écouteurs de l'encart (repli gardé d'un dessin à l'autre, partage). */
function wire(slot) {
  const det = slot.querySelector('[data-luck]');
  det?.addEventListener('toggle', () => { L.ouvert = det.open; });
  slot.querySelector('[data-luck-act="share"]')?.addEventListener('click', (e) => share(e.currentTarget));
}

/**
 * Remplit slot avec l'encart « Ma chance ». Rendu immédiat si les données sont en cache ; rechargement après une minute.
 * @param {HTMLElement} slot conteneur (recréé à chaque rendu de la collection)
 * @returns {Promise<void>}
 */
export async function mountLuck(slot) {
  if (!slot) return;
  const paint = () => {
    if (!slot.isConnected) slot = document.getElementById(slot.id) || slot;
    slot.innerHTML = L.data && !L.missing ? luckHtml(L.data, L.ouvert) : '';
    wire(slot);
  };
  if (L.data) paint();
  if (!L.data || Date.now() - L.at > 60000) {
    await load();
    paint();
  }
}
