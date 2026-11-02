// ===== Planche imprimable d'une collection de cartes (idée C16) — page /pages/cartes/collection-a4.html =====
// Page A4 portrait prête à imprimer ou à enregistrer en PDF : en-tête (« Collection de <pseudo> », séries, version),
// progression (« 41 / 60 cartes possédées »), bande arc-en-ciel, grille de 6 × 5 cases par page : cartes possédées en couleur
// (brillante = pastille étoilée, rendu fixe : pas d'effet animé à l'impression), manquantes en cases pointillées avec leur
// numéro et leur nom (pour cocher à la main), pied de page (légende, date, numéro de page).
// Adresse : /pages/cartes/collection-a4.html?user=<uuid>&set=<uuid|all>&theme=clair|sombre&missing=1|0 (sans user : ma collection),
// plus par=9|16|30, tri=numero|rarete|famille, rarete, famille, cartes=all|own|miss|dup|fav|wish, titre et compteur=1|0 (lirePlanche, cartes-planche.js).
// Ma collection : réglages choisis dans la fenêtre de la page Cartes (cartes-planche.js), barre réduite ici. Collection d'un autre membre :
// options dans la barre d'outils (cachée à l'impression) ; l'adresse suit, pour pouvoir la partager. Favoris, souhaits et titre : ma collection seulement.
// Lectures existantes seulement (aucune migration) : hg_card_sets, hg_cards, hg_card_copies (exemplaires non recyclés), hg_card_favorites,
// hg_card_wishlist, RPC hg_members (pseudo d'un autre membre). Aucune donnée privée : ni solde, ni date d'arrivée des cartes.
// Accès : comme la page Cartes (canAccess('cartes')). Tout texte venant de la base passe par esc() (cardHtml échappe aussi).
// Exporte : rien (page). Styles : collection-a4.css (+ cartes-card.css pour les cartes).
import { sb, initPage, esc, errMsg, $, canAccess } from '../../commun/core.js';
import { cardHtml } from './cartes-ui.js';
import { lirePlanche, requetePlanche, filtrerPlanche, pagesPlanche } from './cartes-planche.js';

const me = await initPage({ auth: 'member' });
const app = $('#app');
const nf = new Intl.NumberFormat('fr-CH');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const today = new Intl.DateTimeFormat('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());

/** Options lues dans l'adresse (valeurs bornées). */
function readOpts() {
  const q = new URLSearchParams(location.search);
  const user = UUID.test(q.get('user') || '') ? q.get('user') : me.id;
  const o = lirePlanche(q);
  if (user !== me.id) { o.titre = ''; if (o.cartes === 'fav' || o.cartes === 'wish') o.cartes = 'all'; }
  return { user, ...o };
}
const O = readOpts();
const miens = O.user === me.id;
/** Données : séries ouvertes, cartes, exemplaires possédés par carte, favoris, souhaits, pseudo. */
const D = { sets: [], cards: [], owned: new Map(), favs: new Set(), wish: new Set(), pseudo: '' };

/** Lit toutes les lignes d'une requête paginée (1000 lignes au plus par appel). */
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/** Charge séries, cartes, exemplaires et pseudo. */
async function load() {
  const sets = await sb.from('hg_card_sets').select('id,code,name,sort,starts_at,active').eq('active', true).order('sort');
  if (sets.error) throw sets.error;
  D.sets = (sets.data || []).filter((s) => (!s.starts_at || new Date(s.starts_at) <= new Date()) && s.code !== 'secrets');
  const ids = D.sets.map((s) => s.id);
  D.cards = ids.length ? await fetchAll(() => sb.from('hg_cards').select('id,set_id,number,name,family,rarity,image_url,flavor,caption,max_copies')
    .eq('active', true).in('set_id', ids).order('number').order('id')) : [];
  const copies = await fetchAll(() => sb.from('hg_card_copies').select('id,card_id,shiny').eq('owner_id', O.user).is('recycled_at', null).order('id'));
  D.owned = new Map();
  for (const c of copies) {
    const o = D.owned.get(c.card_id) || { n: 0, shiny: false, nShiny: 0 };
    o.n += 1; o.shiny = o.shiny || c.shiny; o.nShiny += c.shiny ? 1 : 0;
    D.owned.set(c.card_id, o);
  }
  if (miens && O.cartes === 'fav') D.favs = new Set((await fetchAll(() => sb.from('hg_card_favorites').select('card_id').eq('user_id', O.user).order('card_id'))).map((x) => x.card_id));
  if (miens && O.cartes === 'wish') D.wish = new Set((await fetchAll(() => sb.from('hg_card_wishlist').select('card_id').eq('user_id', O.user).order('card_id'))).map((x) => x.card_id));
  if (miens) D.pseudo = me.pseudo;
  else {
    const { data, error } = await sb.rpc('hg_members');
    if (error) throw error;
    const m = (data || []).find((x) => x.id === O.user);
    if (!m) throw new Error('Ce membre est introuvable.');
    D.pseudo = m.pseudo;
  }
}

/** Séries affichées selon l'option « set ». */
const shownSets = () => (O.set === 'all' ? D.sets : D.sets.filter((s) => s.id === O.set));

/** Case d'une carte manquante (numéro, nom, « à trouver »). */
const missingCell = (c) => `<div class="a4-miss" role="img" aria-label="N° ${esc(String(c.number).padStart(3, '0'))} ${esc(c.name)} : à trouver">
  <span class="a4-miss-n">N° ${esc(String(c.number).padStart(3, '0'))}</span><span class="a4-miss-name">${esc(c.name)}</span><span class="a4-miss-t">à trouver</span></div>`;

/** Case d'une carte possédée : la carte en rendu fixe, pastille étoilée si brillante. */
function ownedCell(c, o) {
  const set = D.sets.find((s) => s.id === c.set_id);
  const k = { ...c, set_name: set?.name || '' };
  return `<div class="a4-cell">${cardHtml(k, { size: 'sm', shiny: false })}${o.shiny ? '<span class="a4-shiny" title="Brillante" aria-label="brillante">★</span>' : ''}</div>`;
}

/** Vrai si j'ai au moins deux exemplaires simples, ou deux brillants (comme le filtre « Doublons » de la collection). */
function aDoublon(id) {
  const o = D.owned.get(id);
  return !!o && (o.nShiny >= 2 || o.n - o.nShiny >= 2);
}

/** Cartes des séries affichées, et celles que la planche montre d'après les réglages. */
function contenu() {
  const sets = shownSets();
  const cards = D.cards.filter((c) => sets.some((s) => s.id === c.set_id));
  const etat = { own: (id) => D.owned.has(id), dup: aDoublon, fav: (id) => D.favs.has(id), wish: (id) => D.wish.has(id) };
  return { sets, cards, items: filtrerPlanche(cards, O, etat) };
}

/** HTML des pages : en-tête sur la première, grille de O.par cases, pied sur chaque page. */
function pagesHtml() {
  const { sets, cards, items } = contenu();
  const scored = cards.filter((c) => c.rarity !== 'identite');
  const have = scored.filter((c) => D.owned.has(c.id)).length;
  const titre = O.titre || `Collection de ${D.pseudo}`;
  const pages = [];
  for (let i = 0; i < Math.max(1, items.length); i += O.par) pages.push(items.slice(i, i + O.par));
  const names = sets.map((s) => `« ${esc(s.name)} »`);
  const series = !sets.length ? 'Aucune série' : names.length === 1 ? `Série ${names[0]}` : names.length <= 3 ? `Séries ${names.slice(0, -1).join(', ')} et ${names.at(-1)}` : `${nf.format(names.length)} séries`;
  return pages.map((list, p) => `<section class="a4-page a4-${O.theme}${O.par === 30 ? '' : ` mc-g${O.par}`}" aria-label="Page ${p + 1} sur ${pages.length}">
    ${p === 0 ? `<header class="a4-head">
      <div><p class="a4-kicker">Humane Gang · Le jeu de cartes</p>
        <h1 class="a4-title">${esc(titre)}</h1>
        <p class="a4-sub">${series} · version ${O.theme === 'clair' ? 'claire' : 'sombre'}</p></div>
      ${O.compteur ? `<div class="a4-count"><span class="a4-count-n">${nf.format(have)} / ${nf.format(scored.length)}</span><span class="a4-count-l">cartes possédées</span></div>` : ''}
    </header>
    <div class="a4-rule"></div><div class="a4-rainbow" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>`
    : `<header class="a4-head a4-head-mini"><p class="a4-kicker">${esc(titre)} · suite</p></header>`}
    <div class="a4-grid">${list.length ? list.map((c) => (D.owned.has(c.id) ? ownedCell(c, D.owned.get(c.id)) : missingCell(c))).join('') : '<p class="a4-empty">Aucune carte à montrer avec ces options.</p>'}</div>
    <footer class="a4-foot"><span>Pastille ★ : brillante · cases en pointillés : à trouver (coche-les au RDV)</span><span>Imprimé le ${today} · page ${p + 1} / ${pages.length}</span></footer>
  </section>`).join('');
}

/** Réglages sans le membre, pour l'adresse. */
const reglages = () => { const { user, ...o } = O; return o; };

/** Barre d'outils de ma planche (écran seulement) : les réglages se changent dans la fenêtre de la page Cartes. */
function toolsMiensHtml() {
  const n = pagesPlanche(contenu().items.length, O.par);
  return `<section class="a4-tools card" aria-labelledby="a4-tools-h">
    <div class="a4-tools-head"><a class="btn btn-ghost" href="/pages/cartes/cartes.html?planche=1&amp;${esc(String(requetePlanche(reglages())))}#collection">← Changer les paramètres</a>
      <h2 id="a4-tools-h" class="a4-tools-h">Ta planche · ${nf.format(n)} page${n > 1 ? 's' : ''} A4</h2></div>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-act="print">Imprimer ou enregistrer en PDF</button></div>
    <p class="small muted">Conseil : format A4 portrait, marges « aucune », graphiques d’arrière-plan activés.</p>
  </section>`;
}

/** Barre d'outils de la planche d'un autre membre (écran seulement). */
function toolsHtml() {
  const back = `/pages/cartes/cartes.html#collection/${esc(O.user)}`;
  return `<section class="a4-tools card" aria-labelledby="a4-tools-h">
    <div class="a4-tools-head"><a class="btn btn-ghost" href="${back}">← Retour à la collection</a>
      <h2 id="a4-tools-h" class="a4-tools-h">Planche à imprimer</h2></div>
    <div class="a4-opts">
      <div class="field"><label for="a4-set">Série</label>
        <select id="a4-set" data-opt="set"><option value="all" ${O.set === 'all' ? 'selected' : ''}>Toutes les séries</option>
          ${D.sets.map((s) => `<option value="${esc(s.id)}" ${O.set === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <fieldset class="a4-fs"><legend>Fond</legend>
        <label class="a4-radio"><input type="radio" name="a4-theme" value="clair" data-opt="theme" ${O.theme === 'clair' ? 'checked' : ''}> Clair (économie d’encre)</label>
        <label class="a4-radio"><input type="radio" name="a4-theme" value="sombre" data-opt="theme" ${O.theme === 'sombre' ? 'checked' : ''}> Sombre</label></fieldset>
      <label class="a4-check"><input type="checkbox" data-opt="missing" ${O.cartes !== 'own' ? 'checked' : ''}> Avec les cartes manquantes</label>
    </div>
    <div class="btn-row"><button type="button" class="btn btn-primary" data-act="print">Imprimer ou enregistrer en PDF</button></div>
    <p class="small muted">Conseil : format A4 portrait, marges « aucune », graphiques d’arrière-plan activés.</p>
  </section>`;
}

/** Met la prévisualisation à l'échelle de l'écran (la page A4 garde sa taille réelle à l'impression). */
function fit() {
  const wrap = $('#a4-sheets');
  if (!wrap) return;
  const pageW = wrap.querySelector('.a4-page')?.offsetWidth || 794;
  const k = Math.min(1, wrap.clientWidth / pageW);
  wrap.style.setProperty('--k', k);
  const inner = wrap.querySelector('.a4-sheets-in');
  if (inner) wrap.style.height = `${inner.offsetHeight * k}px`;
}

/** Redessine la planche (après un changement d'option) et met l'adresse à jour. */
function renderSheets() {
  const q = requetePlanche(reglages());
  if (!miens) q.set('user', O.user);
  history.replaceState(null, '', `${location.pathname}?${q}`);
  $('#a4-sheets').innerHTML = `<div class="a4-sheets-in">${pagesHtml()}</div>`;
  // Pour l'impression, toutes les images doivent être chargées : pas de chargement différé
  for (const img of app.querySelectorAll('.a4-page img')) img.loading = 'eager';
  fit();
}

/** Attend que les images de la planche soient chargées (8 s au plus), puis ouvre l'impression. */
async function printNow(btn) {
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Chargement des images…';
  const imgs = [...app.querySelectorAll('.a4-page img')].filter((i) => !i.complete);
  await Promise.race([
    Promise.all(imgs.map((i) => new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); }))),
    new Promise((r) => setTimeout(r, 8000)),
  ]);
  btn.textContent = old;
  btn.disabled = false;
  window.print();
}

/** Démarrage : accès, données, barre d'outils, planche. */
async function boot() {
  if (!canAccess('cartes')) { location.replace('/pages/compte/accueil.html?refus=cartes'); return; }
  try {
    await load();
  } catch (e) {
    app.innerHTML = `<p class="empty">${esc(errMsg(e))}</p>`;
    app.removeAttribute('aria-busy');
    return;
  }
  if (O.set !== 'all' && !D.sets.some((s) => s.id === O.set)) O.set = 'all';
  app.innerHTML = `${miens ? toolsMiensHtml() : toolsHtml()}<div class="a4-sheets" id="a4-sheets"></div>`;
  renderSheets();
  app.removeAttribute('aria-busy');
  app.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.opt === 'set') O.set = t.value;
    else if (t.dataset.opt === 'theme') O.theme = t.value;
    else if (t.dataset.opt === 'missing') O.cartes = t.checked ? 'all' : 'own';
    else return;
    renderSheets();
  });
  app.addEventListener('click', (e) => { const b = e.target.closest('[data-act="print"]'); if (b && !b.disabled) printNow(b); });
  window.addEventListener('resize', fit);
  // Les cartes sont mises à l'échelle par container queries : on refait la mesure une fois les polices chargées.
  document.fonts?.ready?.then(fit);
}

boot();
