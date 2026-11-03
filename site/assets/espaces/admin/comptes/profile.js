// =====================================================================
// Comptes admin : onglets « Profil » et « Informations » d'une fiche (formulaires et enregistrement).
// Le profil (table hg_profiles) et les informations diverses (table hg_profile_info, champ data en JSON).
// Dépendances : core.js (sb, toast, esc, avatarHtml, isGodMode), profile-fields.js (INFO_GROUPS, INFO_FIELDS),
// ui-confirm.js, utils.js (safeUrl), common.js, state.js (A, H), admin/perms.js (isAdminView).
// Exporte : profileHtml, saveProfile, infosHtml, saveInfos.
// =====================================================================
import { sb, toast, esc, fmtDateTime, avatarHtml, isGodMode, godLimitAttr, godTag } from '../../../commun/core.js';
import { INFO_GROUPS, INFO_FIELDS } from '../../compte/profile-fields.js';
import { confirmBox } from '../../../commun/ui-confirm.js';
import { safeUrl } from '../../../commun/utils.js';
import { check, nullIfEmpty, tabError } from './common.js';
import { A, H, dropFicheCache } from './state.js';
import { isAdminView } from '../perms.js';
import { NOTIF_ROWS } from '../../compte/notif-prefs.js';

/* ---------- Profil ---------- */
/**
 * Résumé en lecture seule des notifications par catégorie du membre (idée Q6), pour répondre à « je ne reçois rien ».
 * @param {object|null|undefined} n ligne hg_notif_prefs (null : réglages par défaut ; undefined : non lue)
 * @param {object} p profil (bot_optin, remind_irl, notify_card_wish)
 * @returns {string} HTML
 */
function notifSummaryHtml(n, p) {
  if (n === undefined) return '';
  const prefs = n?.prefs || {};
  const off = [];
  for (const [k, label] of NOTIF_ROWS) {
    const canaux = [];
    if (prefs[`${k}.push`] === false) canaux.push('téléphone');
    const discord = typeof prefs[`${k}.discord`] === 'boolean' ? prefs[`${k}.discord`]
      : k === 'sorties' ? !!p.remind_irl : k === 'souhaits' ? !!p.notify_card_wish : true;
    if (!discord) canaux.push('Discord');
    if (canaux.length) off.push(`${label} (${canaux.join(', ')})`);
  }
  if (prefs['carte_proposee.site'] === false) off.push('Carte de sa liste proposée (site)');
  if (prefs['challenges.site'] === false) off.push('Challenge de la semaine (site)');
  const quiet = n?.quiet_start != null ? ` · heures calmes ${String(n.quiet_start).padStart(2, '0')}:00 – ${String(n.quiet_end).padStart(2, '0')}:00` : '';
  const txt = !p.bot_optin ? 'Le bot ne peut pas lui écrire (tous les MP coupés).' : off.length ? `Catégories coupées : ${off.join(' · ')}.` : 'Aucune catégorie coupée.';
  return `<div class="acc-notif" role="note"><p class="label">Notifications (lecture seule)</p><p class="small">${esc(txt + quiet)}</p></div>`;
}
/** HTML de l'onglet Profil : pseudo, couleur, avatar, anniversaire, date d'arrivée, options et statut admin. */
export function profileHtml() {
  const p = A.d.profile, self = p.id === A.me.id, ghost = !!p.is_ghost;
  const color = /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : '#9E3543';
  // Le profil d'un admin ne se modifie que par un admin (garde hg_profiles_guard, migration 073) : lecture seule pour le Staff.
  const locked = !!p.is_admin && !isAdminView();
  return `
    <form class="stack" data-form="profile" novalidate>
      ${locked ? '<p class="small muted" role="note">Profil d’un administrateur : seul un admin peut le modifier.</p>' : ''}
      <fieldset class="acc-lock"${locked ? ' disabled' : ''}>
      <div class="grid-2">
        <div class="field"><label for="ap-pseudo">Pseudo</label><input id="ap-pseudo" name="pseudo" required minlength="2" maxlength="32" value="${esc(p.pseudo)}"></div>
        <div class="field"><label for="ap-color">Couleur</label>
          <div class="acc-color"><input id="ap-color" name="color" type="color" value="${esc(color)}"><span class="small muted">${esc(p.color || 'par défaut')}</span></div></div>
        <div class="field acc-span"><label for="ap-avatar">Adresse de l'avatar (URL)</label>
          <div class="acc-avatar-edit">${avatarHtml(p, 44)}<input id="ap-avatar" name="avatar_url" type="url" inputmode="url" value="${esc(p.avatar_url ?? '')}" placeholder="Vide = initiales"></div></div>
        <div class="field"><label for="ap-bday">Anniversaire</label><input id="ap-bday" name="birthday" type="date" value="${esc(p.birthday ?? '')}"></div>
        <div class="field"><label for="ap-joined">Date d'arrivée dans le gang${godTag()}</label>
          <div class="acc-joined"><input id="ap-joined" name="joined_on" type="date" ${godLimitAttr('max', new Date().toISOString().slice(0, 10))} value="${esc(p.joined_on ?? '')}" aria-describedby="ap-joined-help">
            <button class="btn btn-ghost btn-sm" type="button" data-act="clear-joined"${p.joined_on ? '' : ' disabled'}>Effacer</button></div>
          <span class="small muted" id="ap-joined-help">Utilisée sur la carte d'identité (membre depuis). Vide = date d'inscription sur le site.</span></div>
        <div class="field"><label for="ap-discord">ID Discord</label><input id="ap-discord" name="discord_id" inputmode="numeric" autocomplete="off" value="${esc(p.discord_id ?? '')}" placeholder="17 à 20 chiffres"></div>
      </div>
      <fieldset class="toggles">
        <legend class="label">Options</legend>
        <label class="check"><input type="checkbox" name="share_birthday"${p.share_birthday ? ' checked' : ''}> <span>Partage son anniversaire avec le gang (jour et mois)</span></label>
        <label class="check"><input type="checkbox" name="bot_optin"${p.bot_optin ? ' checked' : ''}> <span>Accepte les messages privés du bot</span></label>
        <label class="check"><input type="checkbox" name="intro_seen"${p.intro_seen ? ' checked' : ''}> <span>Intro déjà vue</span></label>
        ${'tour_done_at' in p ? `<label class="check"><input type="checkbox" name="tour_done"${p.tour_done_at ? ' checked' : ''}> <span>Visite guidée déjà vue <span class="muted small">(décocher la relance à sa prochaine visite de l’accueil)</span></span></label>` : ''}
        ${ghost || !isAdminView() ? '' : `<label class="check"><input type="checkbox" name="is_admin"${p.is_admin ? ' checked' : ''}${self ? ' disabled' : ''}> <span>Administrateur${self ? ' <span class="muted small">(tu ne peux pas te retirer ce statut toi-même)</span>' : ''}</span></label>`}
      </fieldset>
      ${notifSummaryHtml(A.d.notif, p)}
      <p class="small muted">Identifiant : <span class="code acc-uid">${esc(p.id)}</span>${ghost ? ' · fantôme (pas encore inscrit)' : ` · profil créé le ${esc(fmtDateTime(p.created_at))}`}${p.updated_at ? ` · modifié le ${esc(fmtDateTime(p.updated_at))}` : ''}</p>
      <div class="btn-row"><button class="btn btn-primary" type="submit">Enregistrer le profil</button></div>
      </fieldset>
    </form>`;
}
/**
 * Valide le formulaire Profil puis l'enregistre dans hg_profiles.
 * Refuse les avatars qui ne viennent pas du stockage du site, et demande confirmation avant de changer le statut admin.
 * Met à jour la fiche et la liste sans recharger la page.
 * @param {HTMLFormElement} form formulaire du profil.
 * @param {HTMLElement|null} btn bouton d'envoi (transmis par busy ; la fonction ne s'en sert pas).
 */
export async function saveProfile(form, btn) {
  const p = A.d.profile, self = p.id === A.me.id, ghost = !!p.is_ghost;
  if (p.is_admin && !isAdminView()) throw new Error('Seul un admin peut modifier le profil d’un admin.');
  const pseudo = form.pseudo.value.trim();
  if (pseudo.length < 2 || pseudo.length > 32) throw new Error('Le pseudo doit faire entre 2 et 32 caractères.');
  const discord = form.discord_id.value.trim();
  if (discord && !/^\d{17,20}$/.test(discord)) throw new Error('L\'ID Discord doit être un nombre de 17 à 20 chiffres.');
  const avatarRaw = form.avatar_url.value.trim();
  const avatar = avatarRaw ? safeUrl(avatarRaw) : null;
  if (avatarRaw && !avatar) throw new Error('Adresse d\'avatar invalide (http ou https uniquement).');
  // La base n'accepte que les images envoyées dans le stockage des avatars du site (contrainte hg_profiles_avatar_bucket).
  if (avatar && !/^https:\/\/[a-z0-9]+\.supabase\.co\/storage\/v1\/object\/public\/hg-avatars\/[^\s"'<>]+$/.test(avatar)) {
    throw new Error('L\'avatar doit être une image envoyée sur le site (le membre la choisit depuis Mon compte). Laisse le champ vide ou remets l\'adresse d\'origine.');
  }
  const patch = {
    pseudo, color: form.color.value, avatar_url: avatar, birthday: nullIfEmpty(form.birthday.value),
    discord_id: discord || null, share_birthday: form.share_birthday.checked, bot_optin: form.bot_optin.checked,
    intro_seen: form.intro_seen.checked, joined_on: nullIfEmpty(form.joined_on.value),
  };
  // Q1 : décocher « Visite guidée déjà vue » remet la date à vide (la visite se relance) ; cocher garde la date existante.
  if (form.tour_done) patch.tour_done_at = form.tour_done.checked ? (p.tour_done_at || new Date().toISOString()) : null;
  if (patch.joined_on && !/^\d{4}-\d{2}-\d{2}$/.test(patch.joined_on)) throw new Error('Date d\'arrivée invalide.');
  if (patch.joined_on && patch.joined_on > new Date().toISOString().slice(0, 10) && !isGodMode()) throw new Error('La date d\'arrivée ne peut pas être dans le futur.');
  if (!self && !ghost && isAdminView()) patch.is_admin = form.is_admin.checked; // un fantôme n'a pas de droits à gérer ; le Staff ne touche pas au statut admin
  if (self && p.is_admin && patch.is_admin === false) throw new Error('Tu ne peux pas te retirer le statut admin.');
  if (!self && !ghost && isAdminView() && patch.is_admin !== p.is_admin) {
    const ok = await confirmBox(
      patch.is_admin ? `Nommer ${pseudo} admin ?` : `Retirer le statut admin à ${pseudo} ?`,
      patch.is_admin ? 'Cette personne aura accès à toute l\'administration, y compris aux données privées de tous les membres et aux attributions du Secret Santa.' : 'Cette personne n\'aura plus accès à l\'administration.',
      { ok: patch.is_admin ? 'Nommer admin' : 'Retirer le statut', danger: !patch.is_admin },
    );
    if (!ok) return;
  }
  const row = check(await sb.from('hg_profiles').update(patch).eq('id', p.id).select().single());
  dropFicheCache();
  A.d.profile = row;
  const acc = A.accounts.find((a) => a.id === p.id);
  if (acc) { acc.pseudo = row.pseudo; acc.is_admin = row.is_admin; acc.joined_on = row.joined_on ?? null; }
  A.avatars.set(row.id, { ...(A.avatars.get(row.id) || {}), id: row.id, pseudo: row.pseudo, avatar_url: row.avatar_url, color: row.color });
  H.renderDetail();
  toast('Profil enregistré', 'ok');
  await A.onChange('members');
}

/* ---------- Informations diverses ---------- */
/** HTML de l'onglet Informations : un groupe de champs par thème, ceux inconnus restent affichés à part. */
export function infosHtml() {
  if (A.d.info.error) return tabError(A.d.info);
  const data = A.d.info.data?.data || {};
  const known = new Set(INFO_FIELDS.map((f) => f.id));
  const extra = Object.keys(data).filter((k) => !known.has(k));
  return `
    <form class="stack" data-form="infos">
      <p class="small muted">Visibles par le membre et par toi. Pour chaque édition, tu choisis lesquelles sont transmises au Santa.${A.d.info.data?.updated_at ? ` Dernière mise à jour : ${esc(fmtDateTime(A.d.info.data.updated_at))}.` : ' Rien de rempli pour l\'instant.'}</p>
      ${INFO_GROUPS.map((g) => `
        <fieldset class="acc-group">
          <legend>${esc(g.label)}</legend>
          <div class="grid-2">${g.fields.map((f) => {
            const id = `ai-${f.id}`, v = data[f.id] ?? '';
            const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
            return `<div class="field${f.type === 'textarea' ? ' acc-span' : ''}"><label for="${id}">${esc(f.label)}</label>${f.type === 'textarea'
              ? `<textarea id="${id}" name="${esc(f.id)}" rows="3" maxlength="2000"${ph}>${esc(v)}</textarea>`
              : `<input id="${id}" name="${esc(f.id)}" maxlength="300" autocomplete="off" value="${esc(v)}"${ph}>`}</div>`;
          }).join('')}</div>
        </fieldset>`).join('')}
      ${extra.length ? `<p class="small muted">Autres clés conservées telles quelles : ${esc(extra.join(', '))}.</p>` : ''}
      <div class="btn-row"><button class="btn btn-primary" type="submit">Enregistrer les informations</button></div>
    </form>`;
}
/**
 * Enregistre les informations diverses. Les clés inconnues déjà stockées sont gardées telles quelles
 * (on n'efface pas ce que l'interface ne connaît pas), puis les champs connus sont remplacés par la saisie.
 * @param {HTMLFormElement} form formulaire des informations.
 */
export async function saveInfos(form) {
  const old = A.d.info.data?.data || {};
  const known = new Set(INFO_FIELDS.map((f) => f.id));
  const data = Object.fromEntries(Object.entries(old).filter(([k]) => !known.has(k)));
  for (const f of INFO_FIELDS) {
    const v = String(form.elements[f.id]?.value ?? '').trim();
    if (v) data[f.id] = v;
  }
  const row = check(await sb.from('hg_profile_info')
    .upsert({ user_id: A.uid, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('data, updated_at').single());
  dropFicheCache();
  A.d.info = { data: row, error: null };
  H.renderPanel();
  toast('Informations enregistrées', 'ok');
}
