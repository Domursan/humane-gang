// ===== Humane Gang — carte d'anniversaire commune (idée 52, migration 205) =====
/*
 * Rôle : trois jours avant l'anniversaire d'un membre qui partage sa date, sa ligne de « Anniversaires à venir » (accueil)
 * propose de signer sa carte commune ; chaque membre y écrit un mot (15 à 280 caractères), modifiable jusqu'à minuit le jour J.
 * Le jour J, la personne fêtée trouve un bandeau en haut de son accueil (2 mots au moins) et lit le mur des mots ; la carte
 * reste ensuite dans « Mes souvenirs » de son compte, et les signataires peuvent la relire.
 * Surprise : le serveur refuse la carte à la personne fêtée avant le jour J, admin compris. En « Voir le site comme… », rien ne
 * s'affiche (l'admin verrait sinon les cartes de son propre compte sous le nom d'un autre).
 * Pages : accueil (mountCartesAnniv), compte (mountSouvenirs). Styles : accueil.css (ligne, bandeau), social.css (boîtes).
 * Dépendances : core.js, view-as.js, social.js (openDialog), icons.js.
 * RPC : hg_carte_anniv_ouvertes, hg_carte_anniv, hg_carte_anniv_signer, hg_carte_anniv_souvenirs.
 * Exporte : mountCartesAnniv, ouvrirMur, mountSouvenirs.
 */
import { sb, esc, toast, errMsg, avatarHtml } from '../../commun/core.js';
import { viewAsActive } from '../../commun/core/view-as.js';
import { openDialog } from '../compte/social.js';
import { svg } from '../../commun/icons.js';

/** Longueur d'un mot (comme le serveur). */
const MIN = 15, MAX = 280;
const CAKE = svg('cake', { size: 20, stroke: 1.7 });
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** Couleurs du haut des cartes du mur, à tour de rôle. */
const COULEURS = ['var(--rb-1)', 'var(--rb-2)', 'var(--rb-4)', 'var(--rb-5)', 'var(--rb-6)'];

/** Date du jour à Zurich (« AAAA-MM-JJ »), comme le serveur. */
const aujourdhui = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
/** « jeudi 5 novembre » (avec l'année si demandé) à partir de « 2026-11-05 ». */
function dateLongue(jour, annee = false) {
  const [y, m, d] = String(jour).split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${JOURS[w]} ${d} ${MOIS[m - 1]}${annee ? ` ${y}` : ''}`;
}
/** « 1 mot », « 5 mots ». */
const motsTxt = (n) => `${n} mot${n > 1 ? 's' : ''}`;

/* ---------- Accueil : lignes « Anniversaires à venir » et bandeau du jour J ---------- */
/**
 * Ajoute la carte commune sous la ligne de chaque membre fêté (J−3 à J) et, le jour J, le bandeau de la personne connectée.
 * @param {{ul: HTMLElement|null, me: object, membres: Map<string, object>}} o ul : liste #bdays (absente si le bloc est retiré de
 *   l'accueil : seul le bandeau s'affiche) ; me : profil ; membres : annuaire par id
 */
export async function mountCartesAnniv({ ul, me, membres = new Map() }) {
  if (viewAsActive()) return;
  let d;
  try {
    const { data, error } = await sb.rpc('hg_carte_anniv_ouvertes');
    if (error) throw error;
    d = data || {};
  } catch (e) { console.warn('[carte d’anniversaire]', e?.message || e); return; }
  const auj = aujourdhui();
  for (const c of d.cartes || []) {
    const li = ul?.querySelector(`.bday[data-membre="${CSS.escape(String(c.fete_id))}"]`);
    if (!li) continue;
    const pseudo = membres.get(c.fete_id)?.pseudo || li.querySelector('.bday-name')?.textContent.trim() || '';
    dessineLigne(li, c, pseudo, auj, me);
  }
  if (d.ma_carte && !document.querySelector('.anv-ban')) banniere(d.ma_carte, me);
}

/** Bloc « carte commune » sous une ligne d'anniversaire (texte et bouton Signer / Modifier mon mot). */
function dessineLigne(li, c, pseudo, auj, me) {
  const n = Number(c.mots) || 0, signe = !!c.mon_mot, jourJ = c.jour === auj;
  let txt;
  if (jourJ) txt = `${n >= 2 ? `Carte remise ce matin · ${motsTxt(n)}` : `Sa carte commune : ${n ? motsTxt(n) : 'pas encore de mot'}`}. ${signe ? 'Tu peux modifier ton mot jusqu’à minuit.' : 'Tu peux encore signer jusqu’à minuit.'}`;
  else if (signe) txt = `Tu as signé sa carte commune · ${motsTxt(n)}`;
  else txt = `Sa carte commune : ${n ? motsTxt(n) : 'pas encore de mot'}`;
  li.classList.add('has-carte');
  li.querySelector('.bday-carte')?.remove();
  li.insertAdjacentHTML('beforeend', `<div class="bday-carte"><p class="bday-carte-txt">${CAKE}<span>${esc(txt)}</span></p>
      <button type="button" class="btn ${signe ? 'btn-ghost' : 'btn-sand'} btn-sm" aria-label="${esc(`${signe ? 'Modifier mon mot sur' : 'Signer'} la carte de ${pseudo}`)}">${signe ? 'Modifier mon mot' : 'Signer la carte'}</button></div>`);
  const btn = li.querySelector('.bday-carte .btn');
  btn.addEventListener('click', () => ouvrirSignature(c, pseudo, auj, (r) => {
    dessineLigne(li, { ...c, mots: r.mots, mon_mot: r.mon_mot }, pseudo, auj, me);
    li.querySelector('.bday-carte .btn')?.focus();
  }, btn));
}

/** Bandeau « Joyeux anniversaire » en haut de l'accueil (jour J, 2 mots au moins). */
function banniere(carte, me) {
  const head = document.querySelector('.home-head');
  if (!head) return;
  const n = Number(carte.mots) || 0;
  head.insertAdjacentHTML('afterend', `<section class="anv-ban" aria-labelledby="anv-ban-t"><span class="anv-ban-ic" aria-hidden="true">🎂</span>
      <div class="anv-ban-txt"><h2 id="anv-ban-t">Joyeux anniversaire ${esc(me?.pseudo || '')} !</h2><p>${n} membres du gang t’ont écrit une carte.</p></div>
      <button type="button" class="btn btn-sand" id="anv-ban-ouvrir">Ouvrir ma carte</button></section>`);
  const b = document.getElementById('anv-ban-ouvrir');
  b.addEventListener('click', () => ouvrirMur(carte.id, b));
}

/* ---------- Boîte « Signer la carte » ---------- */
/**
 * Ouvre la boîte de signature : mots déjà écrits, champ du mot (15 à 280 caractères), Annuler / Signer.
 * @param {object} c carte (id, jour, mon_mot)
 * @param {string} pseudo personne fêtée
 * @param {string} auj date du jour (Zurich)
 * @param {Function} apres appelé avec { mots, mon_mot } après l'enregistrement
 * @param {HTMLElement} [retour] élément qui reprend le focus si on annule
 */
async function ouvrirSignature(c, pseudo, auj, apres, retour) {
  let carte;
  try {
    const { data, error } = await sb.rpc('hg_carte_anniv', { p_carte: c.id });
    if (error) throw error;
    carte = data;
  } catch (e) { toast(errMsg(e), 'error'); return; }
  const jourJ = c.jour === auj;
  const autres = (carte.mots || []).filter((m) => !m.a_moi);
  const val = carte.mon_mot || '';
  const dlg = openDialog({
    id: 'anv-dlg',
    title: `Carte d’anniversaire de ${pseudo}`,
    body: `
      <p class="small">${jourJ
        ? `${esc(pseudo)} fête son anniversaire <strong>aujourd’hui</strong>. Tu peux signer jusqu’à minuit.`
        : `${esc(pseudo)} fête son anniversaire le <strong>${esc(dateLongue(c.jour))}</strong> et découvrira la carte ce jour-là, avec tous les mots.`}</p>
      ${autres.length ? `<ul class="anv-mots" aria-label="Déjà signé">${autres.map((m) => `<li class="anv-mot">${avatarHtml({ id: m.auteur_id, pseudo: m.pseudo, avatar_url: m.avatar_url, color: m.color }, 32)}<div><b>${esc(m.pseudo)}</b><p>${esc(m.texte)}</p></div></li>`).join('')}</ul>` : ''}
      <form class="stack anv-form" novalidate>
        <div class="field"><label for="anv-txt">Ton mot</label>
          <textarea id="anv-txt" rows="3" maxlength="${MAX}" placeholder="${esc(`Un souvenir avec ${pseudo}, un vœu, une blague entre vous…`)}" aria-describedby="anv-aide anv-nb">${esc(val)}</textarea>
          <span class="small muted anv-bas"><span id="anv-aide">${jourJ ? `${esc(pseudo)} voit déjà la carte.` : `${esc(pseudo)} ne voit rien avant le jour J.`} Les autres signataires lisent ton mot.</span><span id="anv-nb" aria-live="polite">${val.length} / ${MAX}</span></span></div>
        <p class="form-error" id="anv-err" role="alert" hidden></p>
        <div class="btn-row"><button type="button" class="btn btn-ghost" data-anv-annuler>Annuler</button><button type="submit" class="btn btn-sand">${val ? 'Enregistrer mon mot' : 'Signer la carte'}</button></div>
      </form>`,
  });
  const ta = dlg.querySelector('#anv-txt'), err = dlg.querySelector('#anv-err');
  ta.addEventListener('input', () => { dlg.querySelector('#anv-nb').textContent = `${ta.value.length} / ${MAX}`; });
  dlg.querySelector('[data-anv-annuler]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { if (!dlg.dataset.ok) retour?.focus?.(); });
  ta.focus();
  dlg.querySelector('.anv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const txt = ta.value.trim();
    if (txt.length < MIN) {
      err.textContent = 'Écris au moins 15 caractères : un vrai mot fera plus plaisir qu’un « joyeux anniv ».';
      err.hidden = false; ta.setAttribute('aria-invalid', 'true'); ta.focus();
      return;
    }
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true; err.hidden = true; ta.removeAttribute('aria-invalid');
    try {
      const { data, error } = await sb.rpc('hg_carte_anniv_signer', { p_carte: c.id, p_texte: txt });
      if (error) throw error;
      dlg.dataset.ok = '1';
      dlg.close();
      toast(val ? 'Ton mot est modifié.' : `Ton mot est sur la carte de ${pseudo}.`, 'ok');
      apres?.(data || { mots: (Number(c.mots) || 0) + (val ? 0 : 1), mon_mot: txt });
    } catch (ex) { err.textContent = errMsg(ex); err.hidden = false; btn.disabled = false; }
  });
}

/* ---------- Mur des mots (personne fêtée, puis signataires) ---------- */
/**
 * Ouvre la carte : tous les mots en mur de petites cartes.
 * @param {number|string} id carte
 * @param {HTMLElement} [retour] élément qui reprend le focus à la fermeture
 */
export async function ouvrirMur(id, retour) {
  let c;
  try {
    const { data, error } = await sb.rpc('hg_carte_anniv', { p_carte: id });
    if (error) throw error;
    c = data;
  } catch (e) { toast(errMsg(e), 'error'); return; }
  const mots = c.mots || [];
  const dlg = openDialog({
    id: 'anv-mur',
    wide: true,
    title: c.a_moi ? 'Ta carte d’anniversaire' : `Carte d’anniversaire de ${c.fete?.pseudo || ''}`,
    body: `<p class="small muted">${esc(`${mots.length} ${mots.length > 1 ? 'mots' : 'mot'} du gang, ${dateLongue(c.jour, true)}.`)}${c.a_moi ? ' La carte reste dans ton compte, sous « Mes souvenirs ».' : ''}</p>
      <ul class="anv-mur">${mots.map((m, i) => `<li class="anv-carte" style="--c:${COULEURS[i % COULEURS.length]}"><p>${esc(m.texte)}</p>
        <span class="anv-sign">${avatarHtml({ id: m.auteur_id, pseudo: m.pseudo, avatar_url: m.avatar_url, color: m.color }, 28)}<b>${esc(m.pseudo)}</b></span></li>`).join('')}</ul>
      <div class="btn-row"><button type="button" class="btn btn-ghost" data-anv-fermer>Fermer</button></div>`,
  });
  dlg.querySelector('[data-anv-fermer]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => retour?.focus?.());
}

/* ---------- Compte : « Mes souvenirs » ---------- */
/**
 * Rubrique « Mes souvenirs » du compte : ma carte d'anniversaire (à partir du jour J) et celles que j'ai signées.
 * Sans carte, la rubrique reste masquée.
 * @param {HTMLElement} el section #souvenirs
 */
export async function mountSouvenirs(el) {
  if (!el || viewAsActive()) return;
  let list;
  try {
    const { data, error } = await sb.rpc('hg_carte_anniv_souvenirs');
    if (error) throw error;
    list = Array.isArray(data) ? data : [];
  } catch (e) { console.warn('[souvenirs]', e?.message || e); return; }
  if (!list.length) return;
  el.innerHTML = `<h2 class="card-title" id="souv-title">${CAKE} Mes souvenirs</h2>
    <p class="small muted">Tes cartes d’anniversaire du gang, et celles que tu as signées.</p>
    <ul class="anv-souv">${list.map((s) => `<li>
        <span class="anv-souv-txt"><b>${s.a_moi ? 'Ta carte d’anniversaire' : `Carte de ${esc(s.pseudo)}`}</b><span class="small muted">${esc(`${dateLongue(s.jour, true)} · ${motsTxt(Number(s.mots) || 0)}`)}</span></span>
        <button type="button" class="btn btn-ghost btn-sm" data-anv-souv="${esc(s.id)}" aria-label="${esc(s.a_moi ? 'Ouvrir ta carte d’anniversaire' : `Ouvrir la carte de ${s.pseudo}`)}">Ouvrir</button></li>`).join('')}</ul>`;
  el.hidden = false;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-anv-souv]');
    if (b) ouvrirMur(b.dataset.anvSouv, b);
  });
}
