// ===== Humane Gang : fil de discussion d'une demande (zone principale) =====
// createThread(el, { messages, me, onSend, onNote, placeholder?, hint?, label?, noteLabel? }) → { update(messages), setHint(texte), destroy() }
//   messages : [{ id, type: 'message' | 'event', author { id, pseudo, color, avatar_url }, body, at, internal?, mine?, text? }]
//              type 'event' : séparateur centré, ex. { type:'event', text:'Domu a pris en charge', at } → « Domu a pris en charge · 14:18 ».
//              mine : force le côté admin (sinon, author.id === me).
//   me       : identifiant de l'admin connecté (affiché à droite, en accent).
//   onSend(texte) / onNote(texte) : appelés à l'envoi ; une promesse rejetée affiche une erreur et garde le texte.
//   Bascule « Note interne » : le message part en note (visible seulement dans le panel, teinte différente).
//   Ctrl+Entrée (ou ⌘+Entrée) envoie ; Entrée seule saute une ligne.
//   composer : false pour un fil en lecture seule (pas de zone de réponse, rien à envoyer en base).
//   files : pièces jointes du message [{ path, name, mime, size }] (assistance) : vignettes ou PDF, liens signés.
//   rowAction(m) : HTML optionnel sous la bulle (ex. bouton « Supprimer » avec data-row-act="<id>") ; onRowAction(message, bouton).
// Utilisé par support.js (fil de l'assistance) et ideas.js (idée en lecture seule). Dépend de core/util.js, core/ui.js, time.js, common.js.
import { esc, avatarHtml } from '../../../commun/core/util.js';
import { toast } from '../../../commun/core/ui.js';
import { clock } from './time.js';
import { ICON } from './common.js';
// support-files.js (et donc core.js, Supabase) n'est chargé qu'au premier message avec pièces jointes : le composant reste autonome.
let SF = null;

// Identifiant unique par fil (pour relier le libellé à la zone de saisie).
let seq = 0;

/**
 * Affiche le fil dans `el` et renvoie son API.
 * @returns {{update: (messages: object[]) => void, setHint: (texte: string) => void, destroy: () => void}}
 */
export function createThread(el, opts = {}) {
  const uid = `ui-thread-${++seq}`;
  const state = { messages: opts.messages || [], me: opts.me ?? null, busy: false };
  const label = opts.label || 'Fil de discussion';
  const noteLabel = opts.noteLabel || 'Note interne';

  el.classList.add('ui-thread');
  el.innerHTML = `
    <div class="ui-thread-log" role="log" aria-label="${esc(label)}" aria-live="polite"></div>
    <form class="ui-composer" autocomplete="off"${opts.composer === false ? ' hidden' : ''}>
      <div class="ui-box" data-internal="false">
        <label class="ui-sr" for="${uid}-ta">Votre réponse</label>
        <textarea id="${uid}-ta" class="ui-textarea" rows="2" placeholder="${esc(opts.placeholder || 'Votre réponse…')}"></textarea>
        <div class="ui-box-tools">
          <button type="button" class="ui-chip ui-note-toggle" aria-pressed="false">${ICON.note()}<span>${esc(noteLabel)}</span></button>
          <span class="ui-sp"></span>
          <button type="submit" class="ui-send"><span class="ui-send-txt">Envoyer</span>${ICON.send()}</button>
        </div>
      </div>
      ${opts.hint ? `<p class="ui-hint">${esc(opts.hint)}</p>` : ''}
    </form>`;

  const $log = el.querySelector('.ui-thread-log');
  const $form = el.querySelector('.ui-composer');
  const $box = el.querySelector('.ui-box');
  const $ta = el.querySelector('textarea');
  const $note = el.querySelector('.ui-note-toggle');
  const $send = el.querySelector('.ui-send');
  const $sendTxt = el.querySelector('.ui-send-txt');

  /** Vrai si le message est celui de l'admin (côté droit) : `mine` s'il est fixé, sinon l'auteur est l'admin connecté. */
  function isMine(m) {
    if (typeof m.mine === 'boolean') return m.mine;
    return state.me != null && m.author?.id === state.me;
  }

  /**
   * Dessine le journal. Deux messages d'affilée du même auteur (même côté, même type de note) se suivent
   * sans répéter l'avatar ni le nom (classe is-cont). Puis le journal défile tout en bas.
   */
  function paintLog() {
    let prev = null;
    $log.innerHTML = state.messages.map((m) => {
      if (m.type === 'event') {
        prev = null;
        const txt = `${m.text || ''}${m.at ? ` · ${clock(m.at)}` : ''}`;
        return `<div class="ui-evt">${esc(txt)}</div>`;
      }
      const mine = isMine(m);
      const cont = !!prev && prev.author?.id === m.author?.id && prev.mine === mine && !!prev.internal === !!m.internal;
      prev = { ...m, mine };
      const cls = ['ui-msg', mine && 'is-admin', cont && 'is-cont', m.internal && 'is-note'].filter(Boolean).join(' ');
      const who = m.author?.pseudo || '';
      const meta = [who, mine ? 'admin' : '', clock(m.at), m.internal ? noteLabel : ''].filter(Boolean);
      return `<div class="${cls}" data-id="${esc(m.id ?? '')}">
        <div class="ui-av-wrap">${avatarHtml(m.author || {}, 34)}</div>
        <div class="ui-stack">
          <div class="ui-meta">${esc(meta[0])}${meta.slice(1).map((x) => ` · ${esc(x)}`).join('')}</div>
          <div class="ui-bubble">${esc(m.body)}</div>
          ${m.files?.length && SF ? SF.attachmentsHtml(m.files) : ''}
          ${opts.rowAction ? opts.rowAction(m) : ''}
        </div>
      </div>`;
    }).join('');
    $log.scrollTop = $log.scrollHeight;
    if (state.messages.some((m) => m.files?.length)) {
      if (SF) SF.hydrateAttachments($log);
      else import('../../infos/support-files.js').then((mod) => { SF = mod; paintLog(); }).catch(() => {});
    }
  }

  // Actions par message (rowAction) : délégation sur le journal, le message est retrouvé par son identifiant
  $log.addEventListener('click', (e) => {
    const b = e.target.closest('[data-row-act]');
    if (!b || !opts.onRowAction) return;
    const m = state.messages.find((x) => String(x.id) === b.dataset.rowAct);
    if (m) opts.onRowAction(m, b);
  });

  // Bascule « note interne » : change le libellé du bouton d'envoi et le placeholder.
  $note.addEventListener('click', () => {
    const on = $note.getAttribute('aria-pressed') !== 'true';
    $note.setAttribute('aria-pressed', String(on));
    $box.dataset.internal = String(on);
    $ta.placeholder = on ? 'Note visible seulement par l’équipe admin…' : (opts.placeholder || 'Votre réponse…');
    $sendTxt.textContent = on ? 'Ajouter la note' : 'Envoyer';
  });

  // Ctrl+Entrée (ou ⌘+Entrée) envoie ; Entrée seule saute une ligne.
  $ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $form.requestSubmit();
    }
  });

  // Envoi : verrouille la zone pendant l'écriture ; le texte n'est effacé qu'en cas de succès.
  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $ta.value.trim();
    if (!text || state.busy) return;
    const internal = $note.getAttribute('aria-pressed') === 'true';
    const fn = internal ? opts.onNote : opts.onSend;
    if (!fn) return;
    state.busy = true;
    $send.disabled = true;
    $ta.readOnly = true;
    try {
      await fn(text, { internal });
      $ta.value = '';
    } catch (err) {
      toast(err?.message || 'Envoi impossible', 'error');
    } finally {
      state.busy = false;
      $send.disabled = false;
      $ta.readOnly = false;
      $ta.focus();
    }
  });

  paintLog();

  return {
    /** Remplace les messages affichés et redessine le journal. */
    update(messages) {
      state.messages = messages || [];
      paintLog();
    },
    /** Change la mention sous la zone de réponse, sans toucher au brouillon. */
    setHint(texte) {
      const hint = el.querySelector('.ui-hint');
      if (hint) hint.textContent = texte;
    },
    /** Vide le fil de l'élément (le brouillon de réponse est perdu). */
    destroy() {
      el.innerHTML = '';
      el.classList.remove('ui-thread');
    },
  };
}
