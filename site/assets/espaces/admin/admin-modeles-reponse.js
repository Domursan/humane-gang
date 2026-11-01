// Admin : La Poste › Modèles de réponse (idée 99, migration 194). Liste des réponses types, édition dans un tiroir, suppression après
// confirmation. Le droit « support » suffit pour tout, sur la table hg_modeles_reponse : le journal est écrit par un déclencheur.
// Les modèles servent dans le menu « Modèles » de l'Assistance (support-modeles.js). Mise en page reprise des Messages types du bot.
// Exporte : mountModelesReponseSection(root). Utilisé par admin.js. Dépend de core.js, ui-confirm.js, common.js, ui/drawer.js.
import { sb, esc, toast, errMsg } from '../../commun/core.js';
import { confirmBox } from '../../commun/ui-confirm.js';
import { check, sectionError } from './common.js';
import { lireModeles } from './support-modeles.js';
import { openDrawer } from './ui/drawer.js';

// Longueurs permises, les mêmes qu'en base (migration 194).
const TITRE_MAX = 60;
const CAT_MAX = 30;
const TEXTE_MAX = 2000;

const INTRO = '<p class="muted small">Le Staff les choisit dans la zone de réponse d’une demande, puis adapte le texte avant l’envoi. <code>{prenom}</code> est remplacé par le pseudo du membre.</p>';

/** Ajoute la feuille des listes et du tiroir du bot, une seule fois (même repère que admin-bot.js). */
function loadStyles() {
  if (document.querySelector('link[data-admin-bot]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = new URL('./admin-bot.css', import.meta.url).href; l.dataset.adminBot = '';
  document.head.append(l);
}

/** Affiche la page dans root : liste des modèles, puis tiroir à la demande. */
export function mountModelesReponseSection(root) {
  loadStyles();
  let liste = [];

  /** Dessine la liste, ou le message d'accueil s'il n'y a aucun modèle. */
  function dessiner() {
    root.innerHTML = `<div class="tpl-page">${INTRO}
      <div class="bt-listbar"><button type="button" class="btn btn-ghost btn-sm" data-tpl-nouveau>Nouveau modèle</button></div>
      ${liste.length ? `<div class="bt-list tpl-liste" role="list" aria-label="Modèles de réponse"><div class="bt-group"><div class="bt-group-label">Réponses de l’Assistance</div>
        ${liste.map((m, i) => `<div role="listitem"><button type="button" class="bt-item" data-i="${i}" aria-label="Modifier « ${esc(m.titre)} »"><span class="bt-item-main"><span class="bt-item-label">${esc(m.titre)}</span><span class="bt-item-sub">${esc(m.categorie)}</span></span><span class="bt-item-state"></span><span class="bt-item-go" aria-hidden="true">Modifier</span></button></div>`).join('')}
      </div></div>` : '<p class="empty">Aucun modèle pour l’instant. Crée le premier : il apparaîtra dans le menu « Modèles » de chaque demande.</p>'}
    </div>`;
  }

  /** Relit les modèles et redessine. En cas d'échec : le message, avec Réessayer. */
  async function charger() {
    try {
      liste = await lireModeles();
      dessiner();
    } catch (e) {
      root.innerHTML = `${sectionError(e)}<button type="button" class="btn btn-ghost btn-sm" data-tpl-reessayer>Réessayer</button>`;
    }
  }

  /** Relit la liste, puis rend le focus à la ligne du modèle (ou à « Nouveau modèle » s'il n'existe plus) : le tiroir vient de se fermer. */
  async function apresEcriture(id) {
    await charger();
    const i = liste.findIndex((m) => m.id === id);
    root.querySelector(i >= 0 ? `.bt-item[data-i="${i}"]` : '[data-tpl-nouveau]')?.focus();
  }

  /** Ouvre le tiroir : modification de m, ou nouveau modèle sans m. */
  function ouvrir(m, ligne) {
    const body = document.createElement('div');
    body.className = 'bt-editor stack';
    body.innerHTML = `
      <div class="field"><div class="bt-label-row"><label for="tpl-titre">Nom du modèle</label><span class="muted small bt-count" data-compte="tpl-titre"></span></div><input id="tpl-titre" maxlength="${TITRE_MAX}" autocomplete="off" value="${esc(m?.titre ?? '')}"></div>
      <div class="field"><label for="tpl-cat">Rangé dans</label><input id="tpl-cat" maxlength="${CAT_MAX}" autocomplete="off" value="${esc(m?.categorie ?? '')}"></div>
      <div class="field"><div class="bt-label-row"><label for="tpl-texte">Texte</label><span class="muted small bt-count" data-compte="tpl-texte"></span></div><textarea id="tpl-texte" rows="6" maxlength="${TEXTE_MAX}">${esc(m?.texte ?? '')}</textarea><p class="small muted bt-hint"><code>{prenom}</code> devient le pseudo du membre. Le Staff peut tout modifier avant l’envoi.</p></div>
      ${m ? '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm" data-tpl-suppr>Supprimer ce modèle</button></div>' : ''}`;
    const champ = (id) => body.querySelector(`#${id}`);
    /** Met à jour le compteur d'un champ. */
    const compter = (el) => { body.querySelector(`[data-compte="${el.id}"]`).textContent = `${el.value.length} / ${el.maxLength}`; };
    for (const el of [champ('tpl-titre'), champ('tpl-texte')]) { compter(el); el.addEventListener('input', () => compter(el)); }
    ligne?.setAttribute('aria-current', 'true');

    const d = openDrawer({
      title: m ? m.titre : 'Nouveau modèle', subtitle: 'Modèle de réponse de l’Assistance', body, wide: true,
      submitLabel: m ? 'Enregistrer' : 'Créer',
      onClose: () => ligne?.removeAttribute('aria-current'),
      onSubmit: async () => {
        const ligneBase = { titre: champ('tpl-titre').value.trim(), categorie: champ('tpl-cat').value.trim(), texte: champ('tpl-texte').value.trim() };
        const vide = !ligneBase.titre ? 'tpl-titre' : !ligneBase.texte ? 'tpl-texte' : null;
        if (vide) { toast(vide === 'tpl-titre' ? 'Donne un nom au modèle.' : 'Écris le texte du modèle.', 'error'); champ(vide).focus(); return false; }
        const ecrites = check(await (m ? sb.from('hg_modeles_reponse').update(ligneBase).eq('id', m.id) : sb.from('hg_modeles_reponse').insert(ligneBase)).select('id'));
        if (!ecrites?.length) { toast('Ce modèle n’existe plus.', 'error'); apresEcriture(null); return undefined; }
        toast(m ? 'Modèle enregistré' : 'Modèle créé', 'ok');
        apresEcriture(ecrites[0].id);
        return undefined;
      },
    });

    body.querySelector('[data-tpl-suppr]')?.addEventListener('click', async () => {
      if (!(await confirmBox('Supprimer ce modèle ?', `« ${m.titre} » disparaîtra du menu « Modèles » pour tout le Staff. C’est définitif.`, { ok: 'Supprimer', danger: true }))) return;
      try {
        check(await sb.from('hg_modeles_reponse').delete().eq('id', m.id));
      } catch (e) { toast(errMsg(e), 'error'); return; }
      d.close();
      toast('Modèle supprimé', 'ok');
      apresEcriture(null);
    });
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-tpl-nouveau]')) ouvrir(null, null);
    else if (b.matches('[data-tpl-reessayer]')) charger();
    else if (b.dataset.i !== undefined) ouvrir(liste[+b.dataset.i], b);
  });
  return charger();
}
