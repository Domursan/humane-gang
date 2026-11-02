// =====================================================================
// Cartes admin : quêtes de la semaine (table hg_card_quests_templates). Liste, création, modification, activation.
// Pas de suppression : une quête inactive ne sort plus, et son identifiant garde la trace des récompenses déjà versées.
// Chaque semaine, des quêtes actives sont tirées au sort pour tous les membres (le nombre est un réglage).
// Dépendances : core.js (sb, toast, esc, $), constants.js (ICON), state.js (H), helpers.js (check, act, friendly, nf),
// admin/ui/drawer.js (tiroir du formulaire).
// Exporte : QUEST_METRICS (actions qu'une quête peut compter), Q (état de la liste), loadQuests, questsPanel,
// openQuestDialog, questActions (gestionnaires des boutons data-act).
// =====================================================================
import { paillSym } from '../../../commun/paillettes.js';
import { sb, toast, esc, $ } from '../../../commun/core.js';
import { ICON, CFG_DEFAULT } from './constants.js';
import { H, C } from './state.js';
import { check, act, friendly, nf } from './helpers.js';
import { refresh } from './data.js';
import { openDrawer } from '../ui/drawer.js';
import { ecrireReglage } from '../reglages-merge.js';

export const QUEST_METRICS = [
  ["boosters_ouverts", "Boosters ouverts", "Nombre de boosters ouverts pendant la semaine."],
  ["echanges_conclus", "Échanges conclus", "Échanges de cartes acceptés par les deux personnes (les dons comptent aussi)."],
  ["photos_ajoutees", "Photos ajoutées", "Photos publiées dans la galerie."],
  ["cartes_recyclees", "Cartes recyclées", "Exemplaires recyclés contre des Paillettes."],
  ["passages_du_jour", "Passages du jour", "Passages au « passage du jour » (récompense quotidienne)."],
  ["sorties_oui", "Réponses « oui » aux sorties", "Réponses « oui » données avant la sortie."],
  ["sorties_repondues", "Réponses aux sorties", "Réponses (oui, non, peut-être) données avant la sortie."],
  ["votes_dates", "Votes de date", "Sondages de date auxquels le membre a voté."],
  ["sorties_creees", "Sorties proposées", "Sorties à venir créées par le membre."],
  ["participations", "Présences aux sorties", "Sorties passées de la semaine où le membre était présent."],
  ["rencontres_ajoutees", "Rencontres passées ajoutées", "Rencontres ajoutées après coup à l'historique."],
  ["presents_renseignes", "Présents renseignés", "Sorties passées du membre dont il a renseigné les présents."],
  ["souvenirs_publies", "Moments cultes publiés", "Moments cultes publiés."],
  ["reactions_souvenirs", "Réactions aux moments cultes", "Moments cultes différents auxquels le membre a réagi."],
  ["reactions_photos", "Réactions aux photos", "Photos différentes auxquelles le membre a réagi."],
  ["reactions_recues", "Réactions reçues", "Réactions des autres sur ses photos et moments cultes."],
  ["captures", "Images d'événement attrapées", "Images d'événement attrapées."],
  ["cartes_fabriquees", "Cartes fabriquées", "Cartes fabriquées contre des Paillettes."],
  ["fabrications_rares", "Cartes rares fabriquées", "Cartes fabriquées de rareté rare ou plus."],
  ["epiques_obtenues", "Cartes épiques obtenues", "Cartes épiques obtenues (boosters, drops, fabrication, dons du gang)."],
  ["legendaires_obtenues", "Cartes légendaires obtenues", "Cartes légendaires ou mieux obtenues."],
  ["brillantes_obtenues", "Cartes brillantes obtenues", "Cartes brillantes obtenues."],
  ["cartes_nouvelles", "Cartes nouvelles", "Cartes jamais possédées auparavant."],
  ["series_completees", "Séries complétées", "Séries de cartes complétées."],
  ["drops_attrapes", "Cartes sauvages attrapées", "Cartes sauvages (drops) attrapées."],
  ["souhaits_ajoutes", "Souhaits de cartes ajoutés", "Cartes ajoutées à la liste de souhaits."],
  ["souhaits_obtenus", "Souhaits obtenus", "Cartes de sa liste de souhaits obtenues."],
  ["vitrine_emplacements", "Emplacements de vitrine changés", "Emplacements de la vitrine remplis ou changés."],
  ["echanges_proposes", "Échanges proposés", "Offres d'échange envoyées (hors annulées)."],
  ["contre_propositions", "Contre-propositions", "Contre-propositions envoyées."],
  ["offres_repondues", "Offres traitées", "Offres reçues acceptées ou refusées."],
  ["cartes_offertes", "Cartes offertes", "Cartes offertes à d'autres membres."],
  ["echanges_souhaits", "Échanges de souhaits", "Échanges qui ont apporté une carte de sa liste de souhaits."],
  ["partenaires_echange", "Partenaires d'échange", "Membres différents avec qui un échange a été conclu."],
  ["echanges_rares", "Échanges de cartes rares", "Échanges qui ont apporté une carte rare ou mieux."],
  ["paillettes_depensees", "Paillettes dépensées", "Paillettes dépensées en boosters et fabrication."],
  ["paillettes_gagnees", "Paillettes gagnées", "Paillettes gagnées (hors quêtes, échanges et dons de l'admin)."],
  ["serie_jours", "Série de passages", "Longueur de la série de passages du jour en cours."],
  ["classement_top10", "Top 10 du classement", "1 si le membre est dans le top 10 du classement des cartes."],
  ["classement_places", "Places gagnées au classement", "Places gagnées au classement depuis le début de la semaine."],
  ["defi_contribution", "Contribution au défi", "Points apportés par le membre aux défis du gang en cours."],
  ["messages_envoyes", "Messages envoyés", "Messages privés envoyés."],
  ["interlocuteurs", "Membres contactés", "Membres différents à qui un message a été envoyé."],
  ["reponses_messages", "Réponses aux messages", "Conversations où le membre a répondu à un message reçu."],
  ["anniversaires_souhaites", "Anniversaires souhaités", "Messages privés envoyés à un membre le jour de son anniversaire."],
  ["fiches_consultees", "Fiches consultées", "Fiches de membres consultées."],
  ["idees_proposees", "Idées proposées", "Idées envoyées à l'admin."],
  ["idees_retenues", "Idées retenues", "Idées retenues par l'admin."],
  ["bugs_traites", "Bugs traités", "Bugs signalés via l'assistance et traités."],
  ["invitations_utilisees", "Invitations utilisées", "Codes d'invitation du membre utilisés par un nouveau membre."],
  ["profil_complet", "Profil complété", "Profil enregistré complet (avatar, couleur, anniversaire, infos)."],
  ["anniversaire_renseigne", "Anniversaire renseigné", "Date d'anniversaire renseignée ou modifiée."],
  ["discord_lie", "ID Discord lié", "ID Discord renseigné ou modifié."],
  ["carte_identite", "Carte d'identité téléchargée", "Carte d'identité du gang téléchargée."],
  ["app_installee", "App installée", "Site ouvert depuis l'app installée."],
  ["tutos_lus", "Tutos lus", "Tutos différents ouverts dans l'aide."],
  ["theme_change", "Thème changé", "Changement de thème d'affichage."],
  ["ss_inscription", "Inscription au Secret Santa", "Inscription à l'édition en cours."],
  ["ss_souhaits", "Souhaits Secret Santa", "Souhaits ajoutés à sa liste Secret Santa."],
  ["ss_messages", "Messages à sa cible", "Messages secrets envoyés à sa cible Secret Santa."],
  ["ss_cadeau_a_temps", "Cadeau envoyé à temps", "Cadeau Secret Santa marqué envoyé avant la date limite."],
  ["preuve_validee", "Preuve validée par le Staff (capture)", "Quête à preuve : le membre envoie une capture, un membre du Staff « preuves » la valide. Tirée à part ({{preuve}} par semaine, réglage de cette page)."],
  // Défis de collection (migration 210) : comptés dans la série du défi. « {serie} » dans le libellé reçoit son nom.
  ["cartes_serie", "Cartes d'une série obtenues (défi)", "Défi de collection : cartes de la série du défi obtenues dans la semaine (boosters, échanges, cadeaux, cartes sauvages). Écris {serie} dans le libellé pour afficher son nom."],
  ["nouvelles_serie", "Cartes nouvelles d'une série (défi)", "Défi de collection : cartes de la série du défi que le membre n'avait jamais eues. Écris {serie} dans le libellé pour afficher son nom."],
  ["fabriquees_serie", "Cartes fabriquées dans une série (défi)", "Défi de collection : cartes de la série du défi fabriquées dans la semaine. Écris {serie} dans le libellé pour afficher son nom."],
];
/* Libellé court de chaque action, par identifiant. */
const METRIC_LABEL = Object.fromEntries(QUEST_METRICS.map(([v, l]) => [v, l]));
/* Phrase d'aide de chaque action, affichée sous la liste déroulante (le marqueur {{preuve}} reçoit le nombre de quêtes à preuve). */
const METRIC_HELP = Object.fromEntries(QUEST_METRICS.map(([v, , h]) => [v, h]));
/** Phrase d'aide d'une action, avec le nombre de quêtes à preuve tiré chaque semaine. */
const helpOf = (metric) => (METRIC_HELP[metric] || METRIC_HELP.boosters_ouverts).replaceAll('{{preuve}}', String(proofPerWeek()));
/** Nom d'un type de booster (récompense d'un défi), sinon son identifiant. */
const boosterName = (id) => Q.types.find((t) => t.id === id)?.name || id || '';
/* Forme d'un identifiant technique : minuscules, chiffres et tiret bas, de 2 à 40 caractères. */
const CODE_RE = /^[a-z0-9_]{2,40}$/;

/** État de la liste (chargée à l'ouverture de l'onglet). */
export const Q = { rows: [], types: [], loaded: false, loading: null, error: null };
/* Compteurs liés à la série du défi (migration 210). */
const SERIE_METRICS = ['cartes_serie', 'nouvelles_serie', 'fabriquees_serie'];

/**
 * Nombre de quêtes tirées chaque semaine : réglage cards.quetes_par_semaine (lu dans hg_settings.cards),
 * sinon la valeur par défaut de CFG_DEFAULT.
 * @returns {number}
 */
export function questsPerWeek() {
  const v = C.cfgRaw?.quetes_par_semaine;
  return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : CFG_DEFAULT.quetes_par_semaine;
}

/**
 * Nombre de quêtes à preuve tirées chaque semaine : réglage cards.quetes_preuve_par_semaine (0 à 5), sinon 2.
 * @returns {number}
 */
export function proofPerWeek() {
  const v = C.cfgRaw?.quetes_preuve_par_semaine;
  return v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : CFG_DEFAULT.quetes_preuve_par_semaine;
}

/** Charge les modèles de quêtes puis redessine l'onglet. */
export function loadQuests(force = false) {
  if (Q.loading) return Q.loading;
  if (Q.loaded && !force) return Promise.resolve();
  Q.loading = (async () => {
    try {
      const [rows, types] = await Promise.all([sb.from('hg_card_quests_templates').select('*').order('sort').order('code'),
        sb.from('hg_booster_types').select('id,name,sort').order('sort')]);
      Q.rows = check(rows) ?? [];
      Q.types = types?.data ?? []; // types de boosters, pour la récompense des défis (liste vide : défis en lecture seule)
      Q.loaded = true;
      Q.error = null;
    } catch (e) {
      Q.error = friendly(e);
    } finally {
      Q.loading = null;
      H.render();
    }
  })();
  return Q.loading;
}

/** HTML de l'onglet Quêtes : explication du tirage, liste des modèles et alerte si peu sont actifs. */
export function questsPanel() {
  if (Q.error) return `<div class="empty">Impossible de charger les quêtes : ${esc(Q.error)} <button class="btn btn-ghost btn-sm" type="button" data-act="quest-retry">Réessayer</button></div>`;
  if (!Q.loaded) return '<div class="empty">Chargement des quêtes…</div>';
  const active = Q.rows.filter((q) => q.active && !q.defi).length;
  const perWeek = questsPerWeek();
  const warn = active === 0
    ? 'Aucune quête active : les membres n\'en verront aucune cette semaine.'
    : active < perWeek ? `Seulement ${active} quête${active > 1 ? 's' : ''} active${active > 1 ? 's' : ''} : chaque semaine, les membres n'en auront que ${active}.` : '';
  return `<div class="acd-head">
      <p class="small muted">Chaque semaine (du lundi au dimanche, heure suisse), ${perWeek} quête${perWeek > 1 ? 's' : ''} sont tirées au sort parmi les modèles <strong>actifs</strong> ; le tirage est le même pour tout le monde. Un membre touche les Paillettes une fois par quête et par semaine, en réclamant la quête une fois atteinte. En plus, un <strong>défi de collection</strong> actif est tiré chaque semaine (pas le même pendant 4 semaines s'il y en a assez) : sa récompense est un booster.</p>
      <button class="btn btn-primary" type="button" data-act="quest-new">${ICON.plus} Nouvelle quête</button>
    </div>
    <form class="acd-proof" id="acd-proof-form" novalidate>
      <p class="form-error" role="alert" hidden></p>
      <div class="field"><label for="acd-proof-n">Quêtes à preuve tirées chaque semaine</label>
        <input id="acd-proof-n" name="n" type="number" min="0" max="5" step="1" inputmode="numeric" value="${esc(proofPerWeek())}" aria-describedby="acd-proof-h">
        <span class="small muted" id="acd-proof-h">Quêtes que le membre valide par une capture (0 à 5). Elles sont tirées à part des quêtes ci-dessus.</span></div>
      <div class="btn-row"><button class="btn btn-ghost" type="submit">Enregistrer</button></div>
    </form>
    ${warn ? `<p class="acd-note" role="note">${esc(warn)}</p>` : ''}
    ${Q.rows.length ? `<ul class="acd-list">${Q.rows.map((q) => `<li class="acd-item">
        <div class="acd-item-main">
          <p><strong>${esc(q.label)}</strong> <code class="acd-code">${esc(q.code)}</code> <span class="pill ${q.active ? 'pill-ok' : 'pill-todo'}">${q.active ? 'Active' : 'Inactive'}</span></p>
          <p class="small muted">${q.defi ? 'Défi de collection · ' : ''}${esc(METRIC_LABEL[q.metric] || q.metric)} · objectif ${esc(nf(q.target))} · ${q.defi ? `1 booster ${esc(boosterName(q.reward_booster))}${SERIE_METRICS.includes(q.metric) ? ` · ${esc(q.set_id ? (C.setById.get(q.set_id)?.name || 'série choisie') : 'série de la semaine')}` : ''}` : `${esc(nf(q.reward))} ${paillSym()}`} · ordre ${esc(q.sort)}</p>
        </div>
        <div class="btn-row acd-set-actions">
          <button class="btn ${q.active ? 'btn-ghost' : 'btn-primary'} acd-set-toggle" type="button" data-act="quest-toggle" data-id="${esc(q.code)}" aria-pressed="${q.active ? 'true' : 'false'}">${q.active ? `${ICON.off} Désactiver` : `${ICON.on} Activer`}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-act="quest-edit" data-id="${esc(q.code)}">${ICON.edit} Modifier</button>
        </div>
      </li>`).join('')}</ul>` : '<div class="empty">Aucun modèle de quête. Crée-en une pour alimenter le tirage de la semaine.</div>'}`;
}

/** HTML du formulaire d'une quête. L'identifiant ne se modifie plus après la création. */
function formHtml(q, isNew) {
  const v = q || {};
  const metricOpts = QUEST_METRICS.map(([val, l]) => `<option value="${val}"${v.metric === val ? ' selected' : ''}>${esc(l)}</option>`).join('');
  return `<div class="stack acd-form" id="acd-quest-form">
    <p class="form-error" role="alert" hidden></p>
    <div class="field"><label for="aq-code">Identifiant technique</label>
      <input id="aq-code" name="code" maxlength="40" autocomplete="off" placeholder="ex. boosters_10" value="${esc(v.code ?? '')}"${isNew ? ' required' : ' readonly'} aria-describedby="aq-code-h">
      <span class="small muted" id="aq-code-h">${isNew
        ? 'Lettres minuscules, chiffres et tiret bas (2 à 40). Il ne peut plus être changé ensuite : il sert à savoir quelles récompenses ont déjà été versées.'
        : 'Ne peut pas être modifié : il sert à savoir quelles récompenses ont déjà été versées.'}</span></div>
    <div class="field"><label for="aq-label">Libellé affiché aux membres</label>
      <input id="aq-label" name="label" required maxlength="120" autocomplete="off" value="${esc(v.label ?? '')}" aria-describedby="aq-label-h">
      <span class="small muted" id="aq-label-h">Le texte de la quête dans la liste de la semaine (120 caractères au maximum).</span></div>
    <div class="field"><label for="aq-metric">Action à compter</label>
      <select id="aq-metric" name="metric" aria-describedby="aq-metric-h">${metricOpts}</select>
      <span class="small" id="aq-metric-h">${esc(helpOf(v.metric))}</span></div>
    <div class="field"><label for="aq-kind">Genre</label>
      <select id="aq-kind" name="kind" aria-describedby="aq-kind-h">
        <option value="quete"${v.defi ? '' : ' selected'}>Quête de la semaine (Paillettes)</option>
        <option value="defi"${v.defi ? ' selected' : ''}>Défi de collection (un booster)</option>
      </select>
      <span class="small muted" id="aq-kind-h">Un défi de collection est tiré à part, un par semaine pour tout le gang, et affiché en tête des quêtes.</span></div>
    <div class="acd-grid-2" id="aq-defi"${v.defi ? '' : ' hidden'}>
      <div class="field"><label for="aq-booster">Booster offert</label>
        <select id="aq-booster" name="booster">${Q.types.map((t) => `<option value="${esc(t.id)}"${(v.reward_booster || 'classique') === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="aq-set">Série du défi</label>
        <select id="aq-set" name="set" aria-describedby="aq-set-h"><option value="">Série de la semaine (tirée au sort)</option>${C.sets.map((s) => `<option value="${esc(s.id)}"${v.set_id === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <span class="small muted" id="aq-set-h">Sert seulement aux actions « (défi) » liées à une série.</span></div>
    </div>
    <div class="acd-grid-2">
      <div class="field"><label for="aq-target">Objectif</label>
        <input id="aq-target" name="target" type="number" min="1" max="1000000" step="1" inputmode="numeric" required value="${esc(v.target ?? 1)}" aria-describedby="aq-target-h">
        <span class="small muted" id="aq-target-h">Nombre d'actions à faire dans la semaine pour terminer la quête.</span></div>
      <div class="field" id="aq-reward-f"${v.defi ? ' hidden' : ''}><label for="aq-reward">Récompense (Paillettes)</label>
        <input id="aq-reward" name="reward" type="number" min="1" max="10000" step="1" inputmode="numeric" required value="${esc(v.reward ?? 10)}" aria-describedby="aq-reward-h">
        <span class="small muted" id="aq-reward-h">Versée une fois par membre et par semaine, quand il réclame la quête (1 à 10 000).</span></div>
    </div>
    <div class="acd-grid-2">
      <div class="field"><label for="aq-sort">Ordre d'affichage</label>
        <input id="aq-sort" name="sort" type="number" step="1" value="${esc(v.sort ?? (Q.rows.reduce((m, r) => Math.max(m, r.sort), 0) + 1))}" aria-describedby="aq-sort-h">
        <span class="small muted" id="aq-sort-h">Plus petit = affichée en premier. N'influence pas le tirage au sort.</span></div>
      <label class="switch"><input type="checkbox" name="active"${(v.active ?? true) ? ' checked' : ''} aria-describedby="aq-active-h"><span class="switch-ui" aria-hidden="true"></span><span>Quête active</span></label>
    </div>
    <p class="small muted" id="aq-active-h">Une quête inactive n'est jamais tirée. Les quêtes actives sont tirées au sort, ${questsPerWeek()} par semaine.</p>
  </div>`;
}

/** Quête : formulaire dans le tiroir. */
export function openQuestDialog(q = null) {
  const isNew = !q;
  const dr = openDrawer({
    title: isNew ? 'Nouvelle quête' : `Modifier « ${q.label} »`,
    submitLabel: isNew ? 'Créer la quête' : 'Enregistrer',
    body: formHtml(q, isNew),
    onSubmit: (form) => saveQuest(form, q),
  });
  const E = dr.form.elements;
  // L'aide de l'action change avec le choix
  E.metric.addEventListener('change', () => { $('#aq-metric-h', dr.body).textContent = helpOf(E.metric.value); });
  // Défi de collection : booster et série à la place des Paillettes
  E.kind.addEventListener('change', () => {
    const defi = E.kind.value === 'defi';
    $('#aq-defi', dr.body).hidden = !defi;
    $('#aq-reward-f', dr.body).hidden = defi;
  });
  (isNew ? E.code : E.label).focus();
}

/** Enregistre la quête saisie ; renvoie false (tiroir ouvert, erreur affichée) en cas d'échec. */
async function saveQuest(form, q) {
  const isNew = !q;
  const E = form.elements;
  const err = $('.form-error', form);
  /* Affiche le message d'erreur dans le formulaire et renvoie false pour arrêter l'envoi. */
  const fail = (m) => { err.textContent = m; err.hidden = false; return false; };
  err.hidden = true;
  const code = E.code.value.trim().toLowerCase();
  const label = E.label.value.trim();
  const target = Number(E.target.value);
  const reward = Number(E.reward.value);
  const sort = Number(E.sort.value);
  if (isNew && !CODE_RE.test(code)) return fail('L\'identifiant doit faire 2 à 40 caractères : lettres minuscules, chiffres ou tiret bas.');
  if (isNew && Q.rows.some((r) => r.code === code)) return fail('Cet identifiant existe déjà. Choisis-en un autre.');
  if (!label || label.length > 120) return fail('Donne un libellé (120 caractères au maximum).');
  if (!METRIC_LABEL[E.metric.value]) return fail('Choisis une action dans la liste.');
  if (!Number.isInteger(target) || target < 1 || target > 1000000) return fail('L\'objectif doit être un nombre entier positif.');
  const defi = E.kind.value === 'defi';
  if (!defi && (!Number.isInteger(reward) || reward < 1 || reward > 10000)) return fail('La récompense doit être un nombre entier entre 1 et 10 000 Paillettes.');
  if (!Number.isInteger(sort)) return fail('L\'ordre d\'affichage doit être un nombre entier.');
  if (defi && !E.booster.value) return fail('Choisis le booster offert.');
  if (defi && E.metric.value === 'preuve_validee') return fail('Un défi de collection se compte tout seul : choisis une autre action.');
  if (!defi && SERIE_METRICS.includes(E.metric.value)) return fail('Cette action est réservée aux défis de collection.');
  // Défi : la colonne reward (Paillettes) n'est jamais versée ; elle garde une valeur valide (1 à 10 000).
  const row = { label, metric: E.metric.value, target, reward: defi ? Math.min(10000, Math.max(1, Number.isInteger(reward) ? reward : 1)) : reward, sort, active: E.active.checked,
    defi, reward_booster: defi ? E.booster.value : null, set_id: defi && E.set.value ? E.set.value : null };
  try {
    if (isNew) {
      check(await sb.from('hg_card_quests_templates').insert({ code, ...row }));
      toast('Quête créée.', 'ok');
    } else {
      check(await sb.from('hg_card_quests_templates').update(row).eq('code', q.code));
      toast('Quête enregistrée.', 'ok');
    }
    await loadQuests(true);
  } catch (ex) {
    return fail(`Enregistrement impossible : ${friendly(ex)}`);
  }
}

/**
 * Enregistre le nombre de quêtes à preuve (cards.quetes_preuve_par_semaine, 0 à 5) par fusion dans hg_settings.cards.
 * @param {HTMLFormElement} form formulaire de la page Quêtes.
 * @param {HTMLElement|null} btn bouton d'envoi.
 */
export async function saveProofCount(form, btn) {
  const v = form.elements.n.value.trim(), n = Number(v);
  if (v === '' || !Number.isInteger(n) || n < 0 || n > 5) return toast('Indique un nombre entier de 0 à 5.', 'error');
  await act(btn, async () => {
    await ecrireReglage('cards', (c) => { c.quetes_preuve_par_semaine = n; });
    toast('Quêtes à preuve enregistrées.', 'ok');
    await refresh();
  });
}

export const questActions = {
  'quest-new': () => openQuestDialog(null),
  'quest-edit': (t, id) => {
    const q = Q.rows.find((r) => r.code === id);
    if (q) openQuestDialog(q);
  },
  'quest-toggle': (t, id) => act(t, async () => {
    const q = Q.rows.find((r) => r.code === id);
    if (!q) return;
    check(await sb.from('hg_card_quests_templates').update({ active: !q.active }).eq('code', id));
    toast(q.active ? 'Quête désactivée.' : 'Quête activée.', 'ok');
    await loadQuests(true);
  }),
  'quest-retry': () => loadQuests(true),
};
