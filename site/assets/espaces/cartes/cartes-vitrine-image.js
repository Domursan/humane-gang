// ===== Vitrine en image (idée 58) : « Créer une image » sous sa vitrine, sur sa propre fiche seulement =====
// Une seule image fixe, 1080 × 1350 (portrait), aux couleurs du thème actif : la vitrine (ou les 3 cartes les plus
// rares si elle est vide), 5 autres cartes parmi les plus rares, 4 chiffres et la progression des 4 séries les plus
// avancées. Rien n'est envoyé ni stocké : l'image est fabriquée dans le navigateur (html-to-image, servi depuis
// assets/vendor), puis téléchargée ou partagée par le menu du système. Aucun lien public.
// Aucun pseudo d'un autre membre : les cartes d'un autre membre (Identité liée, famille « membre ») sont écartées.
// Lecture : hg_card_copies (+ hg_cards), hg_card_showcase (loadShowcase), hg_card_sets, nombre de cartes par série.
// Exporte : openVitrineImage({ userId, pseudo }) ; vitrineImageHtml (le gabarit, pour les tests).
import { sb, esc, errMsg, toast, currentLogo } from '../../commun/core.js';
import { cardHtml, rarityRank } from './cartes-ui.js';
import { withMeta, loadShowcase, CARD_COLS } from './cartes-showcase.js';

const nf = new Intl.NumberFormat('fr-CH');
const jour = new Intl.DateTimeFormat('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
const W = 1080, H = 1350; // taille de l'image
const VENDOR = '../../vendor/html-to-image-1.11.11.mjs';

/** « Collection d’Alice », « Collection de Bruno ». */
const titre = (pseudo) => `Collection ${/^[aeiouyhàâäéèêëîïôöùûü]/i.test(pseudo || '') ? 'd’' : 'de '}${pseudo || ''}`;

/** Tous mes exemplaires non recyclés, avec leur carte (pages de 1 000). */
async function loadCopies(userId) {
  const out = [];
  for (let a = 0; a < 20000; a += 1000) {
    const { data, error } = await sb.from('hg_card_copies').select(`id, card_id, shiny, hg_cards(${CARD_COLS})`)
      .eq('owner_id', userId).is('recycled_at', null).order('id').range(a, a + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out.filter((r) => r.hg_cards);
}

/**
 * Données de l'image : grandes cartes (vitrine ou 3 plus rares), petites (5 plus rares ensuite), chiffres, séries.
 * @param {string} userId membre (soi-même)
 */
async function loadImage(userId) {
  const [copies, bySlot, sets] = await Promise.all([loadCopies(userId), loadShowcase(userId),
    sb.from('hg_card_sets').select('id, name').then((r) => { if (r.error) throw r.error; return r.data || []; })]);
  // Une carte d'un autre membre (liée à son compte, ou de la famille « membre », souvent à son nom) n'entre pas dans
  // l'image : elle montrerait son pseudo. Sa propre carte reste permise.
  const permise = (k) => (k.member_id ? k.member_id === userId : k.family !== 'membre');
  const parCarte = new Map(); // carte → { k, shiny } (brillante si au moins un exemplaire l'est)
  for (const c of copies) {
    const x = parCarte.get(c.hg_cards.id);
    if (!x) parCarte.set(c.hg_cards.id, { k: c.hg_cards, shiny: !!c.shiny }); else x.shiny ||= !!c.shiny;
  }
  const vit = [1, 2, 3].map((s) => bySlot.get(s)).filter((h) => h && permise(h.card)).map((h) => ({ k: h.card, shiny: h.shiny }));
  const rares = [...parCarte.values()].filter((x) => permise(x.k) && !vit.some((v) => v.k.id === x.k.id))
    .sort((a, b) => rarityRank(b.k.rarity) - rarityRank(a.k.rarity) || (a.k.number ?? 0) - (b.k.number ?? 0));
  const grandes = vit.length ? vit : rares.splice(0, 3);
  const petites = rares.slice(0, 5);
  // Séries commencées : cartes différentes (hors Identité) sur le total de la série (hors Identité).
  const have = new Map();
  for (const { k } of parCarte.values()) if (k.rarity !== 'identite') have.set(k.set_id, (have.get(k.set_id) || 0) + 1);
  const series = (await Promise.all(sets.filter((s) => have.get(s.id)).map(async (s) => {
    const { count, error } = await sb.from('hg_cards').select('id', { count: 'exact', head: true }).eq('set_id', s.id).neq('rarity', 'identite');
    if (error) throw error;
    return { name: s.name, have: have.get(s.id), total: Math.max(count || 0, have.get(s.id)) };
  }))).sort((a, b) => b.have / b.total - a.have / a.total || b.have - a.have);
  const decorate = await withMeta([...grandes, ...petites].map((x) => x.k));
  return {
    grandes: grandes.map((x) => ({ ...x, k: decorate(x.k) })), petites: petites.map((x) => ({ ...x, k: decorate(x.k) })), vitrine: vit.length > 0,
    differentes: parCarte.size, brillantes: copies.filter((c) => c.shiny).length,
    commencees: series.length, completes: series.filter((s) => s.have >= s.total).length, series: series.slice(0, 4),
  };
}

/**
 * Gabarit de l'image (1080 × 1350). Les cartes sont celles du site (cardHtml), inchangées.
 * @param {object} D données (loadImage)
 * @param {string} pseudo pseudo du membre (soi-même)
 * @returns {string}
 */
export function vitrineImageHtml(D, pseudo) {
  const t = titre(pseudo);
  return `<div class="vimg" role="img" aria-label="${esc(`Image de la ${t.charAt(0).toLowerCase()}${t.slice(1)} : vitrine, cartes les plus rares et progression par série`)}">
    <div class="vimg-arc" aria-hidden="true"></div>
    <header class="vimg-tete"><img class="vimg-logo" src="${esc(currentLogo())}" alt="" width="88" height="88"><div><p class="vimg-club">HUMANE GANG · JEU DE CARTES</p><h1 class="vimg-nom">${esc(t)}</h1></div></header>
    <ul class="vimg-chiffres">
      <li><b>${nf.format(D.differentes)}</b><span>carte${D.differentes > 1 ? 's' : ''} différente${D.differentes > 1 ? 's' : ''}</span></li>
      <li><b>${nf.format(D.commencees)}</b><span>série${D.commencees > 1 ? 's' : ''} commencée${D.commencees > 1 ? 's' : ''}</span></li>
      <li><b>${nf.format(D.completes)}</b><span>série${D.completes > 1 ? 's' : ''} complète${D.completes > 1 ? 's' : ''}</span></li>
      <li><b>${nf.format(D.brillantes)}</b><span>brillante${D.brillantes > 1 ? 's' : ''}</span></li>
    </ul>
    <section class="vimg-sec"><h2 class="vimg-h">${D.vitrine ? 'Ma vitrine' : 'Mes plus belles cartes'}</h2>
      <div class="vimg-grandes">${D.grandes.map((x) => `<div class="vimg-c">${cardHtml(x.k, { size: 'lg', shiny: x.shiny })}</div>`).join('')}</div></section>
    ${D.petites.length ? `<section class="vimg-sec"><h2 class="vimg-h">${D.vitrine ? 'Mes plus rares' : 'Et aussi'}</h2>
      <div class="vimg-petites">${D.petites.map((x) => `<div class="vimg-c">${cardHtml(x.k, { size: 'sm', shiny: x.shiny })}</div>`).join('')}</div></section>` : ''}
    ${D.series.length ? `<section class="vimg-sec"><h2 class="vimg-h">Progression par série</h2>
      <ul class="vimg-series">${D.series.map((s) => `<li><span class="vimg-sn">${esc(s.name)}</span><span class="vimg-sv">${nf.format(s.have)} / ${nf.format(s.total)}</span><div class="progress"><span style="width:${Math.round(s.have / s.total * 100)}%"></span></div></li>`).join('')}</ul></section>` : ''}
    <footer class="vimg-pied">Image créée le ${esc(jour.format(new Date()))}</footer>
  </div>`;
}

/** Lit un fichier du site en « data: » (police incluse dans l'image). */
const enData = async (url) => {
  const b = await (await fetch(url)).blob();
  return new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ko; r.readAsDataURL(b); });
};
/**
 * Polices du site pour l'image : les @font-face des feuilles du site (pas celles d'un autre site, illisibles),
 * fichiers inclus en « data: ». Donné à html-to-image, qui ne parcourt alors pas lui-même les feuilles.
 * @returns {Promise<string>}
 */
async function policesCss() {
  const regles = [];
  for (const sh of document.styleSheets) {
    if (sh.href && new URL(sh.href).origin !== location.origin) continue;
    let rules;
    try { rules = sh.cssRules; } catch { continue; }
    for (const r of rules) if (r instanceof CSSFontFaceRule) regles.push({ css: r.cssText, base: sh.href || location.href });
  }
  const vus = new Map();
  const out = await Promise.all(regles.map(async ({ css, base }) => {
    let t = css;
    for (const [m, , u] of css.matchAll(/url\((['"]?)([^'")]+)\1\)/g)) {
      if (u.startsWith('data:')) continue;
      const abs = new URL(u, base).href;
      if (new URL(abs).origin !== location.origin) return '';
      if (!vus.has(abs)) vus.set(abs, enData(abs));
      t = t.replace(m, `url(${await vus.get(abs)})`);
    }
    return t;
  }));
  return out.filter(Boolean).join('\n');
}

/** Attend les images de l'aperçu (sinon elles manqueraient dans l'image). */
const imagesPretes = (el) => Promise.all([...el.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));

/**
 * Ouvre la fenêtre « Image de ma collection » : aperçu, « Télécharger l’image », « Partager… » (téléphone).
 * @param {{userId: string, pseudo: string}} o membre (soi-même seulement)
 * @param {HTMLButtonElement} [btn] bouton qui l'ouvre (désactivé pendant le chargement)
 */
export async function openVitrineImage({ userId, pseudo }, btn) {
  if (btn) btn.disabled = true;
  let D;
  try { D = await loadImage(userId); }
  catch (e) { toast(`Image : ${errMsg(e)}`, 'error'); return; }
  finally { if (btn) btn.disabled = false; }
  const vide = !D.grandes.length;
  const dlg = document.createElement('dialog');
  dlg.className = 'shw-dlg vi-dlg';
  dlg.setAttribute('aria-labelledby', 'vi-h');
  dlg.innerHTML = `<div class="shw-dlg-inner">
      <header><h2 id="vi-h" class="shw-dlg-title">Image de ma collection</h2>
        <p class="muted small">Ta vitrine, tes cartes les plus rares et ta progression par série. L’image reste sur ton appareil : aucun lien n’est créé.</p></header>
      ${vide ? '<p class="empty">Tu n’as pas encore de carte à montrer. Ouvre un booster pour commencer.</p>'
        : `<div class="vi-apercu"><div class="vi-echelle">${vitrineImageHtml(D, pseudo)}</div></div>`}
      <p class="shw-dlg-msg" role="status" aria-live="polite"></p>
      <div class="btn-row shw-dlg-actions vi-actions">
        <button class="btn btn-ghost" type="button" data-cancel>Fermer</button>
        <button class="btn btn-ghost vi-partager" type="button" data-share hidden>Partager…</button>
        <button class="btn btn-primary" type="button" data-dl${vide ? ' disabled' : ''}>Télécharger l’image</button>
      </div>
    </div>`;
  document.body.append(dlg);
  const msg = dlg.querySelector('.shw-dlg-msg');
  const ap = dlg.querySelector('.vi-apercu'), ech = dlg.querySelector('.vi-echelle');
  /** L'aperçu montre l'image entière, réduite à la largeur de la fenêtre. */
  const ajuste = () => { if (ap) ech.style.transform = `scale(${(ap.clientWidth / W).toFixed(4)})`; };
  const ro = ap && 'ResizeObserver' in window ? new ResizeObserver(ajuste) : null;
  ro?.observe(ap);
  dlg.querySelector('[data-cancel]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { ro?.disconnect(); dlg.remove(); }, { once: true });
  dlg.showModal();
  ajuste();

  let blob = null;
  /** Fabrique l'image une fois (puis la réutilise). */
  const fabrique = async () => {
    if (blob) return blob;
    msg.textContent = 'Je prépare l’image…';
    const { toBlob } = await import(VENDOR);
    const node = ech.firstElementChild;
    await document.fonts?.ready;
    await imagesPretes(node);
    blob = await toBlob(node, { width: W, height: H, canvasWidth: W, canvasHeight: H, pixelRatio: 1,
      backgroundColor: getComputedStyle(node).backgroundColor, fontEmbedCSS: await policesCss() });
    if (!blob) throw new Error('image vide');
    msg.textContent = '';
    return blob;
  };
  const nom = 'collection-humane-gang.png';
  const dl = dlg.querySelector('[data-dl]'), share = dlg.querySelector('[data-share]');
  // Partage (téléphone surtout) : seulement si le système sait partager un fichier image.
  try { share.hidden = vide || !navigator.canShare?.({ files: [new File([''], nom, { type: 'image/png' })] }); } catch { share.hidden = true; }
  dl.addEventListener('click', async () => {
    dl.disabled = true;
    try {
      const url = URL.createObjectURL(await fabrique());
      const a = document.createElement('a');
      a.href = url; a.download = nom;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      msg.textContent = 'Image téléchargée.';
    } catch (e) { msg.textContent = `Impossible de créer l’image : ${errMsg(e)}`; }
    dl.disabled = false;
  });
  share.addEventListener('click', async () => {
    share.disabled = true;
    try {
      await navigator.share({ files: [new File([await fabrique()], nom, { type: 'image/png' })], title: 'Ma collection' });
    } catch (e) { if (e?.name !== 'AbortError') msg.textContent = `Partage impossible : ${errMsg(e)}`; }
    share.disabled = false;
  });
}
