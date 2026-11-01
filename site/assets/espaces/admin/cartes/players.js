// =====================================================================
// Cartes admin : sous-section « Joueurs » en liste + détail. La liste des membres est en colonne 2 ; le détail
// (portefeuille, exemplaires, journal) occupe la zone principale. Paillettes et cartes se donnent dans un tiroir.
// Dépendances : core.js (sb, toast, errMsg, esc, $, avatarHtml), cartes-ui.js (libellés, numéros, Paillettes),
// ui-confirm.js, admin/ui/drawer.js, admin/ui/list.js, admin/shell.js (navigate), constants.js, state.js, data.js,
// helpers.js.
// Lit : hg_wallet_log (journal). RPC : hg_cards_admin_paillettes, hg_cards_admin_take. Le bouton Give ouvre le panier (bulk.js).
// Exporte : mountPlayersList, refreshPlayersList, playersPanel, refreshLog, playerActions, takeCopy.
// =====================================================================
import { paillSym } from '../../../commun/paillettes.js';
import { sb, toast, errMsg, esc, $, avatarHtml } from '../../../commun/core.js';
import { rarityLabel, serialLabel, fmtP } from '../../cartes/cartes-ui.js';
import { confirmBox } from '../../../commun/ui-confirm.js';
import { openDrawer } from '../ui/drawer.js';
import { createList } from '../ui/list.js';
import { navigate } from '../shell.js';
import { ICON, REASON_LABEL } from './constants.js';
import { C } from './state.js';
import { refresh } from './data.js';
import { check, act, nf, tile, pseudo, fmtWhen, activeProfiles } from './helpers.js';
import { openBulkGift } from './bulk.js';

/* Libellé lisible d'une raison de mouvement de Paillettes ; à défaut, la raison telle quelle. */
const REASON = (r) => REASON_LABEL[r] || r;
/* Référence à la liste de la colonne 2 ; null tant qu'elle n'est pas montée. */
const PL = { list: null };

/* =========================================================
   Colonne 2 : liste des membres
   ========================================================= */
/** Lignes de la liste des membres : nombre d'exemplaires et solde de chacun. */
function playersListItems() {
  // Comptes actifs seulement : un fantôme n'apparaît pas dans la liste (son adresse reste ouvrable pour son historique).
  return activeProfiles().map((p) => {
    /* Nombre d'exemplaires possédés par le membre. */
    const n = (C.copiesByOwner.get(p.id) || []).length;
    return {
      id: p.id, member: p, name: p.pseudo,
      title: `${nf(n)} exemplaire${n > 1 ? 's' : ''} · ${fmtP(C.walletById.get(p.id)?.paillettes ?? 0)}`,
      status: null,
    };
  });
}
/** Colonne 2 (registerSub list) : liste des membres ; le choix d'un membre change l'adresse (#fabrique/joueurs/<id>). */
export function mountPlayersList(el) {
  PL.list = createList(el, {
    items: playersListItems(),
    label: 'Membres',
    empty: 'Aucun membre.',
    search: { placeholder: 'Rechercher un membre', label: 'Rechercher un membre' },
    selectedId: C.playerId || null,
    onSelect: (it) => navigate(`cartes/joueurs/${it.id}`),
  });
}
/** Met la liste à jour après chaque chargement (soldes, exemplaires) et marque le membre affiché. */
export function refreshPlayersList() {
  PL.list?.update(playersListItems());
  PL.list?.select(C.playerId || null);
}

/* =========================================================
   Zone principale : détail d'un membre
   ========================================================= */
/** HTML de la zone principale pour le membre choisi : solde, exemplaires et journal. */
export function playersPanel() {
  const uid = C.playerId;
  const p = uid ? C.byId.get(uid) : null;
  if (!p) return '<div class="empty acd-pl-empty">Choisis un membre dans la liste pour voir son portefeuille et ses cartes.</div>';
  const w = C.walletById.get(uid) || { paillettes: 0, boosters_opened: 0, pity_epique: 0 };
  /* Exemplaires du membre, triés par numéro de carte. */
  const copies = (C.copiesByOwner.get(uid) || []).slice().sort((a, b) => (C.cardById.get(a.card_id)?.number ?? 0) - (C.cardById.get(b.card_id)?.number ?? 0));
  const copyRows = copies.map((x) => {
    const k = C.cardById.get(x.card_id);
    if (!k) return '';
    const meta = [x.shiny ? 'Brillante' : '', x.serial ? serialLabel(x.serial, k.max_copies) : '', x.locked_trade ? 'En échange' : ''].filter(Boolean).join(' · ');
    return `<li class="acd-item acd-item-tight">
      <div class="acd-item-main"><p><strong>${esc(k.name)}</strong> <span class="small muted">${esc(rarityLabel(k.rarity))}</span></p>
        <p class="small muted">${esc(meta || 'Exemplaire standard')} · ${esc(x.source)}</p></div>
      <button class="btn btn-danger btn-sm" type="button" data-act="copy-take" data-id="${esc(x.id)}">${ICON.trash} Retirer</button>
    </li>`;
  }).join('');
  return `
    <section class="card acd-player" aria-labelledby="acd-pl-h">
      <div class="acd-player-head">${avatarHtml(p, 48)}
        <div class="acd-player-id"><h3 class="card-title" id="acd-pl-h">${esc(p.pseudo)}${p.is_ghost ? ' <span class="pill">Fantôme</span>' : ''}</h3>
        <p class="small muted">${nf(copies.length)} exemplaire${copies.length > 1 ? 's' : ''} · ${nf(w.boosters_opened)} booster${w.boosters_opened > 1 ? 's' : ''} ouvert${w.boosters_opened > 1 ? 's' : ''}</p></div>
        <div class="btn-row acd-player-actions">
          <button class="btn btn-primary" type="button" data-act="pay-open" data-sign="1">Donner des Paillettes</button>
          <button class="btn btn-ghost" type="button" data-act="pay-open" data-sign="-1">Retirer des Paillettes</button>
          <button class="btn btn-ghost" type="button" data-act="give-open">${ICON.plus} Give</button>
        </div>
      </div>
      <div class="acd-tiles">${tile(fmtP(w.paillettes), 'Paillettes')}${tile(nf(w.boosters_opened), 'Boosters ouverts')}${tile(nf(w.pity_epique), 'Boosters sans épique')}</div>
    </section>
    <section class="card" aria-labelledby="acd-ex-h">
      <h3 class="card-title" id="acd-ex-h">Exemplaires <span class="muted">(${nf(copies.length)})</span></h3>
      ${copies.length ? `<ul class="acd-list acd-scroll-y">${copyRows}</ul>` : '<p class="small muted">Aucun exemplaire.</p>'}
    </section>
    <section class="card" aria-labelledby="acd-log-h">
      <h3 class="card-title" id="acd-log-h">Journal des Paillettes</h3>
      <div id="acd-pl-log"><p class="small muted">Chargement…</p></div>
    </section>`;
}
/** Charge le journal des Paillettes du membre affiché (60 dernières lignes). La réponse est ignorée si le membre a changé. */
export async function refreshLog() {
  const box = $('#acd-pl-log', C.panel);
  if (!box) return;
  const uid = C.playerId;
  try {
    const rows = check(await sb.from('hg_wallet_log').select('delta, reason, ref, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(60)) ?? [];
    if (uid !== C.playerId) return;
    box.innerHTML = rows.length
      ? `<ul class="acd-list">${rows.map((r) => `<li class="acd-log-row">
          <span class="acd-log-delta ${r.delta < 0 ? 'is-neg' : 'is-pos'}">${r.delta > 0 ? '+' : ''}${esc(nf(r.delta))} ${paillSym()}</span>
          <span>${esc(REASON(r.reason))}</span><span class="small muted">${esc(fmtWhen(r.created_at))}</span></li>`).join('')}</ul>`
      : '<p class="small muted">Aucun mouvement de Paillettes.</p>';
  } catch (e) { if (box.isConnected) box.innerHTML = `<p class="small muted">Journal indisponible : ${esc(errMsg(e))}</p>`; }
}

/* =========================================================
   Actions (tiroirs)
   ========================================================= */
/* Gestionnaires des boutons du détail membre : ouvrent les tiroirs. */
export const playerActions = {
  'pay-open': (t) => openPaillettesDrawer(t.dataset.sign === '-1' ? -1 : 1),
  'give-open': () => openBulkGift({ choisis: [C.playerId], titre: 'Give', sousTitre: pseudo(C.playerId) }),
};

/** Ouvre le tiroir pour donner (sign = 1) ou retirer (sign = -1) des Paillettes. */
function openPaillettesDrawer(sign) {
  const uid = C.playerId;
  openDrawer({
    title: sign > 0 ? 'Donner des Paillettes' : 'Retirer des Paillettes',
    subtitle: pseudo(uid),
    submitLabel: sign > 0 ? 'Donner' : 'Retirer',
    body: `<div class="stack acd-form" id="acd-pl-pay">
      <p class="form-error" role="alert" hidden></p>
      <div class="acd-grid-2">
        <div class="field"><label for="acd-pay-amount">Nombre de Paillettes</label><input id="acd-pay-amount" name="amount" type="number" min="1" step="1" inputmode="numeric" required></div>
        <div class="field"><label for="acd-pay-reason">Motif <span class="muted small">(facultatif)</span></label><input id="acd-pay-reason" name="reason" maxlength="60" autocomplete="off" placeholder="ex. Gagnant du concours"></div>
      </div>
    </div>`,
    onSubmit: (form) => adjustPaillettes(form, sign, uid),
  });
}
/** Ajoute ou retire des Paillettes au membre ; renvoie false (tiroir ouvert) en cas d'échec. */
async function adjustPaillettes(form, sign, uid) {
  const err = $('.form-error', form);
  /* Affiche le message d'erreur dans le formulaire, ou le masque si le message est vide. */
  const showErr = (m) => { err.textContent = m; err.hidden = !m; };
  showErr('');
  const n = Number(String(form.elements.amount.value).trim());
  if (!Number.isInteger(n) || n <= 0) { showErr('Indique un nombre entier de Paillettes (1 ou plus).'); return false; }
  const reason = String(form.elements.reason.value).trim() || 'admin';
  try {
    const bal = check(await sb.rpc('hg_cards_admin_paillettes', { p_user: uid, p_delta: sign * n, p_reason: reason }));
    toast(`Solde de ${pseudo(uid)} : ${fmtP(bal)}`, 'ok');
    await refresh();
  } catch (e) { showErr(errMsg(e)); return false; }
}

/** Retire un exemplaire de la collection après confirmation. Il n'est ni recyclé ni remboursé. */
export async function takeCopy(btn, id) {
  const x = C.copies.find((c) => String(c.id) === id);
  const k = x && C.cardById.get(x.card_id);
  if (!x || !k) return;
  const ok = await confirmBox('Retirer cet exemplaire ?',
    `« ${k.name} »${x.serial ? ` ${serialLabel(x.serial, k.max_copies)}` : ''} sera retiré de la collection de ${pseudo(x.owner_id)}. Il n'est ni recyclé ni remboursé, et son numéro reste attribué.`,
    { ok: 'Retirer', danger: true });
  if (!ok) return;
  await act(btn, async () => {
    check(await sb.rpc('hg_cards_admin_take', { p_copy: Number(x.id) }));
    toast('Exemplaire retiré', 'ok');
    await refresh();
  });
}
