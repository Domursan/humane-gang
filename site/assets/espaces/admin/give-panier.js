// =====================================================================
// Admin : le give en panier. Un seul don donne des Paillettes, plusieurs cartes (à l'unité, une série entière, un type
// entier), brillantes ou non, et plusieurs sortes de boosters, à un membre, à plusieurs ou à tout le gang.
// Utilisé par Gestion globale (admin-gestion.js), la fenêtre Give du plateau (quick.js) et le tiroir de don (cartes/bulk.js).
// Écriture : RPC hg_cards_admin_give_panier (migration 196), tout ou rien, une ligne au journal et une ligne groupée au fil.
// Les cartes limitées peuvent dépasser leur maximum : le panier et la confirmation l'annoncent, la base continue les numéros.
// Exporte : creerGive, MAX_MEMBRES.
// Dépendances : core.js (sb, esc, errMsg), cartes-ui.js (RARITIES, FAMILIES, rarityLabel, familyLabel, cardHtml),
// admin/visual-pick.js (sélecteurs), admin/cartes/helpers.js (check, nf). Styles : admin-give.css, admin-quick.css.
// =====================================================================
import { paillSym } from '../../commun/paillettes.js';
import { sb, esc, errMsg } from '../../commun/core.js';
import { rarityLabel, familyLabel, cardHtml } from '../cartes/cartes-ui.js';
import { cardPicker, boosterPicker, boosterVisualHtml } from './visual-pick.js';
import { check, nf } from './cartes/helpers.js';

export const MAX_MEMBRES = 200; // doit correspondre à la migration 196
const MAX_EXEMPLAIRES = 100000; // doit correspondre à la migration 196
const MAX_PAILLETTES = 2147483647; // limite de la colonne hg_wallets.paillettes
const CSS_HREF = new URL('./admin-give.css', import.meta.url).href;

/** Texte normalisé pour la recherche : minuscules, sans accents. */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Nombre suivi du mot au singulier ou au pluriel. */
const plur = (n, one, many) => `${nf(n)} ${n > 1 ? many : one}`;

/** Charge la feuille du panier (une seule fois). */
function ensureCss() {
  if (document.querySelector('link[data-gv-css]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = CSS_HREF; l.dataset.gvCss = '1';
  document.head.append(l);
}

/**
 * Monte le panier dans host.
 * @param {HTMLElement} host conteneur (vidé et rempli)
 * @param {object} o
 *   membres : [{ id, pseudo }] (actifs) ; cards : cartes actives (avec set_name) ; sets : séries ; restants : Map de chargerRestants ;
 *   types : boosters (null = lecture échouée, typesErreur dit pourquoi) ; idp : préfixe des identifiants HTML ;
 *   puces : membres en pastilles (fenêtre) plutôt qu'en liste à cocher ; choisis : identifiants déjà cochés ; envoi : affiche le bouton Donner.
 * @returns {{donner: () => Promise<object|null>, vider: () => void, bouton: HTMLElement|null}}
 */
export function creerGive(host, { membres = [], cards = [], sets = [], restants = new Map(), types = null, typesErreur = '', idp = 'gv', puces = false, choisis = [], envoi = false } = {}) {
  ensureCss();
  const cartesParId = new Map(cards.map((k) => [k.id, k]));
  const typesParId = new Map((types ?? []).map((t) => [t.id, t]));
  const seriesParId = new Map(sets.map((s) => [s.id, s]));
  const S = { ids: new Set(choisis), all: false, q: '', paill: '', lignes: [], onglet: 'cartes', vue: choisis.length ? 'ajouter' : 'membres', motif: '', annonce: true };
  let picker = null, boost = null;

  /* ---------- Calculs ---------- */
  const nMembres = () => (S.all ? membres.length : S.ids.size);
  const pseudo = (id) => membres.find((m) => m.id === id)?.pseudo ?? 'Ancien membre';
  const cartesLot = (l) => cards.filter((k) => (!l.set || k.set_id === l.set) && (!l.rar || k.rarity === l.rar) && (!l.fam || k.family === l.fam));
  const parMembre = (l) => (l.type === 'lot' ? cartesLot(l).length * l.qte : l.qte);
  const paillettes = () => { const v = Number(String(S.paill).trim() || 0); return Number.isInteger(v) && v > 0 ? v : 0; };
  const totaux = () => S.lignes.reduce((t, l) => { if (l.type === 'booster') t.bo += l.qte; else t.ex += parMembre(l); return t; }, { ex: 0, bo: 0 });
  const titreLot = (l) => {
    const serie = seriesParId.get(l.set)?.name;
    if (l.set && !l.rar && !l.fam) return `Toute la série « ${serie} »`;
    if (!l.set && l.rar && !l.fam) return `Tout le type ${rarityLabel(l.rar)}`;
    if (!l.set && !l.rar && l.fam) return `Tout le type ${familyLabel(l.fam)}`;
    return [l.set && `« ${serie} »`, l.rar && rarityLabel(l.rar), l.fam && familyLabel(l.fam)].filter(Boolean).join(' · ');
  };
  /** Première raison qui empêche le don, ou ''. */
  const erreur = () => {
    const n = nMembres(), t = totaux();
    const brut = String(S.paill).trim();
    if (!n) return 'Choisis au moins un membre, ou « Tout le gang ».';
    if (n > MAX_MEMBRES) return `Au plus ${MAX_MEMBRES} membres par don (${nf(n)} choisis).`;
    if (brut && (!Number.isInteger(Number(brut)) || Number(brut) < 0)) return 'Indique un nombre entier de Paillettes.';
    if (Number(brut) > MAX_PAILLETTES) return `Au plus ${nf(MAX_PAILLETTES)} Paillettes par don.`;
    if (!paillettes() && !S.lignes.length) return 'Le panier est vide : indique des Paillettes ou ajoute des cartes et des boosters.';
    if (t.ex * n > MAX_EXEMPLAIRES) return `Ce don crée ${nf(t.ex * n)} exemplaires. Le maximum est de ${nf(MAX_EXEMPLAIRES)} par don : donne en plusieurs fois.`;
    return '';
  };
  /** Phrase de récapitulatif (ou l'erreur en cours). */
  const recap = () => {
    const e = erreur(); if (e) return e;
    const n = nMembres(), t = totaux(), p = paillettes();
    const quoi = [p && `${nf(p)} Paillettes`, t.ex && plur(t.ex, 'carte', 'cartes'), t.bo && plur(t.bo, 'booster', 'boosters')].filter(Boolean).join(', ');
    if (n === 1 && !S.all) return `${pseudo([...S.ids][0])} recevra ${quoi}.`;
    const qui = S.all ? `Tout le gang (${plur(n, 'membre', 'membres')}) recevra` : `${nf(n)} membres recevront`;
    const tot = [p && `${nf(p * n)} Paillettes`, t.ex && plur(t.ex * n, 'exemplaire', 'exemplaires'), t.bo && plur(t.bo * n, 'booster', 'boosters')].filter(Boolean).join(', ');
    return `${qui} chacun ${quoi}. Soit ${tot} au total.`;
  };
  /** Alerte de dépassement d'une carte limitée, pour la ligne donnée ; '' si la limite tient. */
  const depassement = (l) => {
    if (l.type !== 'carte' || !restants.has(l.id)) return '';
    const reste = restants.get(l.id);
    const demande = S.lignes.filter((x) => x.type === 'carte' && x.id === l.id).reduce((s, x) => s + x.qte, 0) * nMembres();
    if (demande <= reste) return '';
    return `Dépassement : ${plur(demande, 'exemplaire demandé', 'exemplaires demandés')}, ${reste > 0 ? plur(reste, 'restant', 'restants') : 'aucun restant'}. ${plur(demande - reste, 'exemplaire ira', 'exemplaires iront')} au-delà du maximum.`;
  };

  /* ---------- Panier ---------- */
  const ligneEgale = (a, b) => a.type === b.type && a.id === b.id && a.set === b.set && a.rar === b.rar && a.fam === b.fam && a.br === b.br;
  /** Ajoute une ligne, ou augmente celle qui existe déjà. Les boosters restent après les cartes. */
  function ajouter(o) {
    const n = { qte: 1, br: false, id: null, set: null, rar: null, fam: null, ...o };
    const e = S.lignes.find((l) => ligneEgale(l, n));
    if (e) e.qte += 1; else S.lignes.push(n);
    S.lignes.sort((a, b) => (a.type === 'booster') - (b.type === 'booster'));
    maj();
  }
  const quantiteCarte = (k) => S.lignes.filter((l) => l.type === 'carte' && l.id === k.id).reduce((s, l) => s + l.qte, 0);
  const quantiteBooster = (t) => S.lignes.find((l) => l.type === 'booster' && l.id === t.id)?.qte ?? 0;

  /** Une ligne du panier. */
  const ligneHtml = (l, i) => {
    const qte = `<div class="gv-qte"><button type="button" data-gv-moins="${i}" aria-label="Diminuer">−</button><input type="number" min="1" step="1" inputmode="numeric" value="${l.qte}" data-gv-qte="${i}" aria-label="Quantité par membre"><button type="button" data-gv-plus="${i}" aria-label="Augmenter">+</button></div>`;
    const brillance = (t) => `<label class="gv-br"><input type="checkbox" data-gv-br="${i}"${l.br ? ' checked' : ''}> <span>${t}</span></label>`;
    const retirer = (nom) => // nom déjà échappé
      `<button class="gv-x" type="button" data-gv-x="${i}" aria-label="Retirer ${nom}">×</button>`;
    if (l.type === 'booster') {
      const t = typesParId.get(l.id);
      return `<li class="gv-l"><span class="gv-vis">${boosterVisualHtml(t)}</span><div class="gv-txt"><strong>Booster ${esc(t.name)}</strong><span>${plur(Number(t.size) || 5, 'carte', 'cartes')}${t.active === false ? ' · événement passé' : ''}</span></div>${retirer(esc(t.name))}<div class="gv-bas"><span class="small muted">par membre</span>${qte}</div></li>`;
    }
    if (l.type === 'lot') {
      const c = cartesLot(l).length;
      return `<li class="gv-l"><span class="gv-vis"><span class="gv-pile">${nf(c)}</span></span><div class="gv-txt"><strong>${esc(titreLot(l))}</strong><span>${plur(c, 'carte', 'cartes')}, ${plur(l.qte, 'exemplaire', 'exemplaires')} de chaque</span></div>${retirer(esc(titreLot(l)))}<div class="gv-bas">${brillance('Brillantes')}${qte}</div></li>`;
    }
    const k = cartesParId.get(l.id), w = depassement(l);
    return `<li class="gv-l"><span class="gv-vis">${cardHtml(k, { size: 'sm', shiny: l.br })}</span><div class="gv-txt"><strong>${esc(k.name)}</strong><span>${esc(rarityLabel(k.rarity))}${k.set_name ? ` · ${esc(k.set_name)}` : ''}</span></div>${retirer(esc(k.name))}<div class="gv-bas">${k.can_shiny ? brillance('Brillante') : '<span class="small muted">Sans version brillante</span>'}${qte}</div>${w ? `<p class="gv-warn">${esc(w)}</p>` : ''}</li>`;
  };
  const panierHtml = () => `<div class="gv-panier-h"><h3>Le panier</h3>${S.lignes.length ? '<button class="gv-vider" type="button" data-gv-vider>Tout retirer</button>' : ''}</div>
    <ul class="gv-ls">
      <li class="gv-l"><span class="gv-vis"><span class="gv-etoile" aria-hidden="true">${paillSym()}</span></span><div class="gv-txt"><strong>Paillettes</strong><span>par membre</span></div>
        <div class="gv-qte"><input class="gv-p" id="${idp}-paill" type="number" min="0" step="1" inputmode="numeric" placeholder="0" value="${esc(S.paill)}" aria-label="Paillettes par membre"></div>
        <div class="gv-rapides">${[100, 1000, 10000].map((v) => `<button type="button" data-gv-ajp="${v}">+${nf(v)}</button>`).join('')}</div></li>
      ${S.lignes.map(ligneHtml).join('')}
    </ul>
    ${S.lignes.length ? '' : '<p class="gv-vide">Ajoute des cartes ou des boosters depuis le catalogue.</p>'}`;

  /** Bouton « Ajouter toute la sélection » sous les filtres (une série, un type, ou leur combinaison). */
  const majLot = () => {
    const zone = picker?.lotHost; if (!zone) return;
    const { set, rar, fam } = picker.filtres();
    const l = { set: set || null, rar: rar || null, fam: fam || null };
    const c = set || rar || fam ? cartesLot(l).length : 0;
    const html = c ? `<button class="btn btn-sand gv-lot" type="button" data-gv-lot>Ajouter : ${esc(titreLot(l))} (${plur(c, 'carte', 'cartes')})</button>` : '';
    // Le bouton ne change pas quand on ajoute au panier : il garde le focus.
    if (zone.dataset.gvHtml !== html) { zone.innerHTML = html; zone.dataset.gvHtml = html; }
  };

  const membresHtml = () => {
    if (puces) {
      return `<section class="qk-sec"><p class="qk-label">Pour qui · <span data-gv-compte aria-live="polite"></span></p>
        <div class="field"><label for="${idp}-q">Rechercher un membre</label><input id="${idp}-q" type="search" autocomplete="off" placeholder="Pseudo"></div>
        <label class="check"><input type="checkbox" data-gv-all> <span>Tout le gang (${plur(membres.length, 'membre actif', 'membres actifs')})</span></label>
        <div class="qk-chips" role="group" aria-label="Membres" data-gv-liste></div></section>`;
    }
    return `<fieldset class="acd-fs"><legend>Membres</legend>
      <label class="switch acd-switch"><input type="checkbox" data-gv-all><span class="switch-ui" aria-hidden="true"></span><span>Tout le gang (tous les membres actifs)</span></label>
      <div class="gest-chips" data-gv-pastilles aria-live="polite"></div>
      <div class="field"><label for="${idp}-q">Rechercher un membre</label><input id="${idp}-q" type="search" autocomplete="off" placeholder="Pseudo"></div>
      <div class="acd-bulk-list gv-liste" data-gv-liste></div></fieldset>`;
  };
  /** Redessine la liste des membres (les cases gardent la sélection). */
  const majMembres = () => {
    const needle = norm(S.q.trim());
    const liste = membres.filter((m) => !needle || norm(m.pseudo).includes(needle));
    const zone = host.querySelector('[data-gv-liste]');
    zone.classList.toggle('is-off', S.all);
    zone.innerHTML = puces
      ? (liste.map((m) => `<button type="button" class="qk-chip" data-gv-puce="${esc(m.id)}" aria-pressed="${S.ids.has(m.id)}"${S.all ? ' disabled' : ''}>${esc(m.pseudo)}</button>`).join('') || '<p class="small muted">Aucun membre ne correspond.</p>')
      : (liste.map((m) => `<label class="acd-bulk-row"><input type="checkbox" name="${idp}-who" value="${esc(m.id)}"${S.ids.has(m.id) ? ' checked' : ''}${S.all ? ' disabled' : ''}> <span>${esc(m.pseudo)}</span></label>`).join('') || '<p class="small muted">Aucun membre ne correspond.</p>');
    majChoisis();
  };
  /** Compteur et pastilles des membres choisis. */
  const majChoisis = () => {
    const c = host.querySelector('[data-gv-compte]');
    if (c) c.textContent = S.all ? `tout le gang (${plur(membres.length, 'membre', 'membres')})` : `${nf(S.ids.size)} choisi${S.ids.size > 1 ? 's' : ''}`;
    const p = host.querySelector('[data-gv-pastilles]');
    if (p) {
      p.innerHTML = S.all ? `<p class="small muted">Tout le gang : ${plur(membres.length, 'membre actif', 'membres actifs')}.</p>`
        : [...S.ids].map((id) => ({ id, nom: pseudo(id) })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
          .map((m) => `<button type="button" class="chip gest-chip" data-gv-retire="${esc(m.id)}" aria-label="Retirer ${esc(m.nom)}">${esc(m.nom)} <span aria-hidden="true">×</span></button>`).join('') || '<p class="small muted">Aucun membre choisi.</p>';
    }
  };

  /** Met à jour ce qui dépend du panier, sans toucher aux champs de saisie des filtres. */
  function maj({ panier = true } = {}) {
    if (panier) host.querySelector('[data-gv-panier]').innerHTML = panierHtml();
    picker?.rafraichir();
    boost?.rafraichir();
    const nc = S.lignes.filter((l) => l.type !== 'booster').length, nb = S.lignes.length - nc;
    const onglet = { cartes: `Cartes${nc ? ` · ${nc}` : ''}`, boosters: `Boosters${nb ? ` · ${nb}` : ''}` };
    host.querySelectorAll('[data-gv-onglet]').forEach((b) => { b.textContent = onglet[b.dataset.gvOnglet]; b.setAttribute('aria-pressed', String(b.dataset.gvOnglet === S.onglet)); });
    const nbPanier = S.lignes.length + (paillettes() ? 1 : 0);
    const vues = { membres: `Membres · ${nf(nMembres())}`, ajouter: 'Ajouter', panier: `Panier · ${nf(nbPanier)}` };
    host.querySelectorAll('[data-gv-vue]').forEach((b) => { b.textContent = vues[b.dataset.gvVue]; b.setAttribute('aria-pressed', String(b.dataset.gvVue === S.vue)); });
    host.querySelector('.gv').dataset.vue = S.vue;
    host.querySelector('[data-gv-oc]').hidden = S.onglet !== 'cartes';
    host.querySelector('[data-gv-ob]').hidden = S.onglet !== 'boosters';
    const s = host.querySelector('[data-gv-sum]');
    s.textContent = recap();
    s.classList.toggle('is-warn', !!erreur());
  }

  host.innerHTML = `<div class="gv-zone">
    <div class="qk-seg gv-vues" role="group" aria-label="Étapes du give">
      <button type="button" data-gv-vue="membres"></button><button type="button" data-gv-vue="ajouter"></button><button type="button" data-gv-vue="panier"></button>
    </div>
    <div class="gv">
      <div class="gv-g">
        <div class="gv-p-mbr">${membresHtml()}</div>
        <div class="gv-p-ajout">
          <p class="gv-t">Ajouter au panier</p>
          <div class="filters gest-tabs" role="group" aria-label="Catalogue"><button class="chip" type="button" data-gv-onglet="cartes"></button><button class="chip" type="button" data-gv-onglet="boosters"></button></div>
          <div class="gv-cat" data-gv-oc></div>
          <div class="gv-cat" data-gv-ob>${types ? '' : `<p class="form-error" role="alert">Impossible de charger les boosters : ${esc(typesErreur)}</p>`}</div>
        </div>
      </div>
      <div class="gv-d">
        <div class="gv-panier" data-gv-panier></div>
        <div class="gv-opts">
          <div class="field"><label for="${idp}-motif">Motif <span class="muted small">(facultatif, inscrit au journal)</span></label><input id="${idp}-motif" maxlength="200" autocomplete="off" placeholder="Ex. récompense de quête"></div>
          <label class="switch acd-switch"><input type="checkbox" id="${idp}-ann" checked><span class="switch-ui" aria-hidden="true"></span><span>Annoncer dans le fil (une seule ligne groupée)</span></label>
        </div>
        <p class="gv-sum" data-gv-sum aria-live="polite"></p>
        <p class="form-error gv-err" role="alert" hidden></p>
        ${envoi ? '<div class="gest-go"><button class="btn btn-primary" type="button" data-gv-go>Donner</button><p class="small muted">Inscrit au journal · visible dans Pilotage › Journal</p></div>' : ''}
      </div>
    </div>
  </div>`;

  picker = cardPicker(host.querySelector('[data-gv-oc]'), {
    cards, sets, restants, idp: `${idp}-c`, types: true,
    ajout: (k) => ajouter({ type: 'carte', id: k.id }), quantite: quantiteCarte, onFiltre: () => majLot(),
  });
  if (types) boost = boosterPicker(host.querySelector('[data-gv-ob]'), { types, idp: `${idp}-b`, ajout: (t) => ajouter({ type: 'booster', id: t.id }), quantite: quantiteBooster });

  const montrerErreur = (m) => {
    const e = host.querySelector('.gv-err');
    e.textContent = m || ''; e.hidden = !m;
    if (m) e.scrollIntoView?.({ block: 'nearest' });
  };

  /* ---------- Événements ---------- */
  // Dans une fenêtre ou un tiroir, Entrée dans un champ ne doit pas lancer le don.
  host.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.preventDefault(); });
  host.addEventListener('click', (e) => {
    const on = (s) => e.target.closest(s);
    let b;
    if (on('[data-gv-lot]')) { const f = picker.filtres(); ajouter({ type: 'lot', set: f.set || null, rar: f.rar || null, fam: f.fam || null }); return; }
    if ((b = on('[data-gv-onglet]'))) { S.onglet = b.dataset.gvOnglet; maj({ panier: false }); return; }
    if ((b = on('[data-gv-vue]'))) { S.vue = b.dataset.gvVue; maj({ panier: false }); return; }
    if ((b = on('[data-gv-moins]'))) { const l = S.lignes[+b.dataset.gvMoins]; l.qte = Math.max(1, l.qte - 1); maj(); return; }
    if ((b = on('[data-gv-plus]'))) { S.lignes[+b.dataset.gvPlus].qte += 1; maj(); return; }
    if ((b = on('[data-gv-x]'))) { S.lignes.splice(+b.dataset.gvX, 1); maj(); return; }
    if (on('[data-gv-vider]')) { S.lignes = []; maj(); return; }
    if ((b = on('[data-gv-ajp]'))) { S.paill = String(paillettes() + Number(b.dataset.gvAjp)); maj(); return; }
    if ((b = on('[data-gv-retire]'))) { S.ids.delete(b.dataset.gvRetire); majMembres(); maj({ panier: false }); return; }
    if ((b = on('[data-gv-puce]'))) { const id = b.dataset.gvPuce; if (S.ids.has(id)) S.ids.delete(id); else S.ids.add(id); b.setAttribute('aria-pressed', String(S.ids.has(id))); majChoisis(); maj({ panier: false }); }
  });
  host.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === `${idp}-paill`) { S.paill = t.value; maj({ panier: false }); } else if (t.dataset.gvQte) {
      S.lignes[+t.dataset.gvQte].qte = Math.max(1, parseInt(t.value, 10) || 1); maj({ panier: false });
    } else if (t.id === `${idp}-q`) { S.q = t.value; majMembres(); } else if (t.id === `${idp}-motif`) S.motif = t.value;
  });
  host.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-gv-all]')) { S.all = t.checked; majMembres(); maj(); } else if (t.name === `${idp}-who`) {
      if (t.checked) S.ids.add(t.value); else S.ids.delete(t.value);
      majChoisis(); maj();
    } else if (t.id === `${idp}-ann`) S.annonce = t.checked;
    else if (t.dataset.gvQte) maj();
    else if (t.dataset.gvBr) {
      // Même carte et même brillance déjà présentes : les deux lignes fusionnent.
      const i = +t.dataset.gvBr, l = S.lignes[i];
      l.br = t.checked;
      const j = S.lignes.findIndex((x, n) => n !== i && ligneEgale(x, l));
      if (j >= 0) { S.lignes[j].qte += l.qte; S.lignes.splice(i, 1); }
      maj();
    }
  });

  /* ---------- Confirmation et envoi ---------- */
  /** Arguments de hg_cards_admin_give_panier. */
  const args = () => ({
    p_users: S.all ? null : [...S.ids],
    p_paillettes: paillettes(),
    p_lignes: S.lignes.map((l) => {
      if (l.type === 'booster') return { type: 'booster', booster: l.id, qte: l.qte };
      if (l.type === 'lot') return { type: 'lot', set: l.set, rarity: l.rar, family: l.fam, qte: l.qte, shiny: l.br };
      return { type: 'carte', card: l.id, qte: l.qte, shiny: l.br };
    }),
    p_announce: S.annonce,
    p_note: S.motif.trim() || null,
  });
  /** Contenu de la confirmation : visuels, détail par membre, alertes, destinataires. */
  const confirmHtml = () => {
    const visuel = (l) => {
      if (l.type === 'booster') return boosterVisualHtml(typesParId.get(l.id));
      if (l.type === 'lot') return `<span class="gv-pile">${nf(cartesLot(l).length)}</span>`;
      return cardHtml(cartesParId.get(l.id), { size: 'sm', shiny: l.br });
    };
    const texte = (l) => {
      if (l.type === 'booster') return `${plur(l.qte, 'booster', 'boosters')} ${typesParId.get(l.id).name}`;
      if (l.type === 'lot') return `${titreLot(l)} : ${plur(cartesLot(l).length, 'carte', 'cartes')}${l.qte > 1 ? `, ${l.qte} exemplaires de chaque` : ''}${l.br ? ', brillantes' : ''}`;
      return `${plur(l.qte, 'exemplaire', 'exemplaires')} de « ${cartesParId.get(l.id).name} »${l.br ? ' (brillante)' : ''}`;
    };
    const p = paillettes();
    const lignes = [...(p ? [`${nf(p)} Paillettes`] : []), ...S.lignes.map(texte)];
    const alertes = S.lignes.filter(depassement).map((l) => `${cartesParId.get(l.id).name}. ${depassement(l)}`);
    const reste = S.lignes.length - 8;
    const qui = S.all ? `Tout le gang (${plur(membres.length, 'membre', 'membres')}).` : `${[...S.ids].map(pseudo).sort((a, b) => a.localeCompare(b, 'fr')).join(', ')}.`;
    return `<div class="gv-strip">${S.lignes.slice(0, 8).map((l) => `<span class="gv-vis">${visuel(l)}</span>`).join('')}${reste > 0 ? `<span class="gv-plus">+${nf(reste)}</span>` : ''}</div>
      <p class="qk-sum qk-sum-strong" data-gv-confirm-sum>${esc(recap())}</p>
      <div><p class="qk-label">Chaque membre reçoit</p><ul class="gv-recu">${lignes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      ${alertes.map((w) => `<p class="gv-warn">${esc(w)}</p>`).join('')}
      ${S.lignes.some((l) => l.type === 'lot') ? '<p class="small muted">Un lot prend les cartes actives au moment du don. Ses cartes limitées peuvent dépasser leur maximum. Une série complétée rapporte le bonus habituel.</p>' : ''}
      <p class="small muted" data-gv-confirm-qui>Destinataires : ${esc(qui)}</p>
      <p class="small muted">Tout passe ou rien ne passe. Le don est définitif. Aucun message privé n’est envoyé.</p>
      <p class="qk-err" role="alert" hidden></p>`;
  };
  /** Ouvre la confirmation ; la promesse donne la réponse de la RPC, ou null si la personne revient en arrière. */
  const confirmer = () => new Promise((fin) => {
    const d = document.createElement('dialog');
    d.className = 'qk-dlg gv-confirm';
    d.style.setProperty('--qk-c', '#159946');
    d.setAttribute('aria-labelledby', `${idp}-ct`);
    let res = null;
    d.innerHTML = `<div class="qk-form"><header class="qk-head"><div><h2 class="qk-title" id="${idp}-ct">Confirmer le don</h2><p class="qk-sub">Vérifie avant de donner</p></div><button class="qk-x" type="button" data-gv-retour aria-label="Fermer">×</button></header>
      <div class="qk-body">${confirmHtml()}</div>
      <footer class="qk-foot"><div class="qk-btns"><button class="btn btn-ghost" type="button" data-gv-retour>Retour</button><button class="btn btn-primary" type="button" data-gv-ok>Confirmer le don</button></div></footer></div>`;
    document.body.append(d);
    d.addEventListener('close', () => { d.remove(); fin(res); });
    d.addEventListener('click', async (e) => {
      if (e.target.closest('[data-gv-retour]')) { d.close(); return; }
      const ok = e.target.closest('[data-gv-ok]');
      if (!ok) return;
      const err = d.querySelector('.qk-err');
      err.hidden = true; ok.disabled = true; ok.setAttribute('aria-busy', 'true');
      try {
        res = check(await sb.rpc('hg_cards_admin_give_panier', args()));
        d.close();
      } catch (ex) {
        err.textContent = errMsg(ex); err.hidden = false;
        ok.disabled = false; ok.removeAttribute('aria-busy');
        err.scrollIntoView?.({ block: 'nearest' });
      }
    });
    d.showModal();
  });

  /** Contrôle, confirmation et envoi. Renvoie la réponse de la RPC, ou null s'il n'y a pas eu de don. */
  async function donner() {
    montrerErreur('');
    const e = erreur();
    // En colonne étroite, l'erreur est sur l'étape Panier : on y amène la personne.
    if (e) { S.vue = 'panier'; maj({ panier: false }); montrerErreur(e); return null; }
    return confirmer();
  }
  /** Vide le panier et la sélection, après un don réussi. */
  function vider() {
    S.ids.clear(); S.all = false; S.lignes = []; S.paill = ''; S.motif = '';
    const all = host.querySelector('[data-gv-all]'); if (all) all.checked = false;
    host.querySelector(`#${idp}-motif`).value = '';
    montrerErreur('');
    majMembres(); maj();
  }

  majMembres();
  maj();
  majLot();
  return { donner, vider, bouton: host.querySelector('[data-gv-go]') };
}
