// ===== Humane Gang — Shadow Hunters : dessin du plateau (plateaux/jeux/shadow/plateau.js) =====
/*
 * Rôle : HTML de la table de Shadow Hunters, sans logique de jeu (table.js décide quand le refaire).
 *   Table ronde (maquette « Table de veillée ») : anneau de la piste des blessures (0 à 14) avec les pions,
 *   médaillons des joueurs autour (personnage, camp et PV une fois connus), et sous la table les 6 lieux rangés par zone
 *   (image assets/images/plateaux/shadow/<lieu>.webp si elle existe, sinon dessin de la maquette, avec l'effet du lieu),
 *   et le visuel d'un personnage.
 *   Règles fixes : points de vie maximum, camps, dés des lieux. Les noms et textes viennent des contenus (table.js).
 * Dépendances : core.js (esc, initials).
 * Exporte : LIEUX, GROUPES, PV_MAX, CAMP_LIBELLE, campDe, couleurCamp, lieuxAplatis, voisinsDe, zoneDe,
 *           zonesHtml, pisteHtml, medaillonsHtml, persoVisuelHtml.
 */
import { esc, initials } from '../../../../commun/core.js';

/** Dés de chaque lieu (règle fixe, affichée sur la carte du lieu). */
export const LIEUX = {
  ermite: { des: 'Dés 2-3' },
  porte: { des: 'Dés 4-5' },
  monastere: { des: 'Dé 6' },
  cimetiere: { des: 'Dé 8' },
  foret: { des: 'Dé 9' },
  sanctuaire: { des: 'Dés 10' },
};
/** Groupes par défaut (ordre de la maquette) : on n'attaque que dans son groupe. Le serveur fournit zones. */
export const GROUPES = [['ermite', 'porte'], ['monastere', 'cimetiere'], ['foret', 'sanctuaire']];
/** Points de vie maximum par personnage (règle fixe ; les PV actuels = maximum - blessures). */
export const PV_MAX = { emi: 10, franklin: 12, georges: 14, inconnu: 11, vampire: 13, loupgarou: 14, allie: 8, bob: 10, charles: 11, daniel: 13 };
const CAMP_FIXE = { emi: 'hunter', franklin: 'hunter', georges: 'hunter', inconnu: 'shadow', vampire: 'shadow', loupgarou: 'shadow' };
const COULEUR_CAMP = { hunter: '#4E73C4', shadow: '#B2433A', neutre: '#8A9A7A' };
/** Libellé écrit d'un camp (la couleur n'est jamais seule). */
export const CAMP_LIBELLE = { hunter: 'Hunter', shadow: 'Shadow', neutre: 'Neutre' };
const COULEUR = /^#[0-9a-f]{6}$/i;

/** Camp d'un personnage (règle fixe) : hunter, shadow ou neutre ; null si le personnage est inconnu. */
export function campDe(perso) {
  if (!perso) return null;
  return CAMP_FIXE[perso] || 'neutre';
}
/** Couleur d'un camp (gris si inconnu). */
export const couleurCamp = (camp) => COULEUR_CAMP[camp] || '#9A968F';
/** Couleur d'un pion : couleur de profil, gris pour un invité. */
function couleurPion(j) {
  if (j?.invite) return '#9A968F';
  return COULEUR.test(j?.couleur || '') ? j.couleur : '#F2EFEA';
}

/** Lieux dans l'ordre du plateau, à plat (3 groupes → 6 lieux). */
export function lieuxAplatis(zones) {
  const z = Array.isArray(zones) && zones.length ? zones : GROUPES;
  return z.flat();
}

/** Les deux lieux voisins (circulaire) d'un lieu, dans l'ordre à plat. */
export function voisinsDe(lieu, zones) {
  const l = lieuxAplatis(zones);
  const i = l.indexOf(lieu);
  if (i < 0) return [];
  const n = l.length;
  const avant = l[(i - 1 + n) % n];
  const apres = l[(i + 1) % n];
  return avant === apres ? [avant] : [avant, apres];
}

/* Dessins de repli des lieux (maquette OmbresPlateau, viewBox 314 × 161). */
const DESSIN = {
  ermite: `<rect width="314" height="161" fill="#16120F"/><path d="M40 161 Q60 60 160 40 Q270 60 290 161 Z" fill="#0A0807"/><path d="M40 161 Q60 60 160 40 Q270 60 290 161" fill="none" stroke="#3B3129" stroke-width="6"/><polygon points="90,60 98,20 106,60" fill="#3B3129"/><polygon points="150,44 158,8 166,44" fill="#3B3129"/><polygon points="210,62 218,26 226,62" fill="#3B3129"/><polygon points="120,150 128,116 136,150" fill="#2E251E"/><polygon points="200,150 208,122 216,150" fill="#2E251E"/><circle cx="160" cy="132" r="26" fill="#E0603A" opacity=".18"/><circle cx="160" cy="134" r="5" fill="#E0603A"/><rect x="0" y="146" width="314" height="15" fill="#100C0A"/>`,
  porte: `<defs><linearGradient id="sky-porte" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140F24"/><stop offset="1" stop-color="#07060F"/></linearGradient><radialGradient id="portal-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#B98CF0" stop-opacity=".9"/><stop offset="1" stop-color="#7E4FD0" stop-opacity="0"/></radialGradient></defs><rect width="314" height="161" fill="url(#sky-porte)"/><ellipse cx="157" cy="84" rx="70" ry="70" fill="#7E4FD0" opacity=".18"/><path d="M118 140 V70 Q118 26 157 26 Q196 26 196 70 V140 Z" fill="#0B0814" stroke="#5A4A7A" stroke-width="8"/><ellipse cx="157" cy="84" rx="30" ry="48" fill="url(#portal-glow)"/><rect x="0" y="140" width="314" height="21" fill="#0A0814"/><circle cx="60" cy="50" r="2" fill="#B98CF0"/><circle cx="270" cy="40" r="2" fill="#B98CF0"/>`,
  monastere: `<defs><linearGradient id="sky-monastere" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2540"/><stop offset="1" stop-color="#0A0F1E"/></linearGradient></defs><rect width="314" height="161" fill="url(#sky-monastere)"/><circle cx="262" cy="34" r="16" fill="#E9E4D0" opacity=".85"/><rect x="96" y="92" width="150" height="46" fill="#2A3140"/><polygon points="90,92 171,76 252,92" fill="#2E3749"/><rect x="190" y="40" width="34" height="52" fill="#262E3E"/><polygon points="186,40 207,16 228,40" fill="#2E3749"/><rect x="112" y="108" width="12" height="18" rx="6" fill="#E8B04B" opacity=".55"/><rect x="140" y="108" width="12" height="18" rx="6" fill="#E8B04B" opacity=".55"/><rect x="200" y="58" width="12" height="16" rx="6" fill="#E8B04B" opacity=".6"/><rect x="184" y="112" width="20" height="26" fill="#161C28"/><rect x="0" y="134" width="314" height="27" fill="#131A16"/><ellipse cx="160" cy="142" rx="200" ry="14" fill="#AFC0D6" opacity=".1"/>`,
  cimetiere: `<defs><linearGradient id="sky-cimetiere" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141B2B"/><stop offset="1" stop-color="#0A0E18"/></linearGradient></defs><rect width="314" height="161" fill="url(#sky-cimetiere)"/><circle cx="60" cy="40" r="14" fill="#E9E4D0" opacity=".8"/><rect x="0" y="122" width="314" height="39" fill="#161B22"/><path d="M34 122 V104 Q34 94 44 94 Q54 94 54 104 V122 Z" fill="#3B4455"/><path d="M84 122 V110 Q84 102 92 102 Q100 102 100 110 V122 Z" fill="#343C4C"/><path d="M190 122 V106 Q190 96 200 96 Q210 96 210 106 V122 Z" fill="#3B4455"/><path d="M236 122 V110 Q236 102 244 102 Q252 102 252 110 V122 Z" fill="#343C4C"/><rect x="132" y="82" width="6" height="40" fill="#4A5366"/><rect x="122" y="92" width="26" height="6" fill="#4A5366"/><rect x="268" y="86" width="5" height="36" fill="#4A5366"/><rect x="261" y="94" width="19" height="5" fill="#4A5366"/><path d="M290 122 L292 70 M292 92 L278 74 M292 80 L304 66 M291 100 L304 92" stroke="#0E1218" stroke-width="4" fill="none" stroke-linecap="round"/><ellipse cx="157" cy="118" rx="180" ry="16" fill="#B8C4D8" opacity=".12"/>`,
  foret: `<defs><linearGradient id="sky-foret" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1A2A"/><stop offset="1" stop-color="#07101C"/></linearGradient></defs><rect width="314" height="161" fill="url(#sky-foret)"/><circle cx="30" cy="20" r="1.5" fill="#FFFFFF" opacity=".6"/><circle cx="120" cy="14" r="1.5" fill="#FFFFFF" opacity=".6"/><circle cx="200" cy="28" r="1.5" fill="#FFFFFF" opacity=".6"/><circle cx="276" cy="12" r="1.5" fill="#FFFFFF" opacity=".6"/><rect x="0" y="134" width="314" height="27" fill="#0A1812"/><polygon points="20,140 46,70 72,140" fill="#0C2219"/><polygon points="58,140 88,46 118,140" fill="#10291F"/><polygon points="100,140 126,80 152,140" fill="#0C2219"/><polygon points="170,140 200,40 230,140" fill="#10291F"/><polygon points="218,140 244,78 270,140" fill="#0C2219"/><polygon points="256,140 286,58 316,140" fill="#10291F"/><rect x="0" y="120" width="314" height="30" fill="#9DB2C8" opacity=".1"/>`,
  sanctuaire: `<defs><linearGradient id="sky-sanctuaire" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A2440"/><stop offset="1" stop-color="#0D0C18"/></linearGradient></defs><rect width="314" height="161" fill="url(#sky-sanctuaire)"/><circle cx="236" cy="36" r="18" fill="#E9E4D0" opacity=".75"/><rect x="0" y="130" width="314" height="31" fill="#171525"/><rect x="92" y="82" width="16" height="50" fill="#4A4560"/><rect x="122" y="66" width="16" height="66" fill="#4A4560"/><rect x="176" y="66" width="16" height="66" fill="#4A4560"/><rect x="206" y="82" width="16" height="50" fill="#4A4560"/><rect x="84" y="78" width="32" height="8" fill="#5A5470"/><rect x="168" y="62" width="32" height="8" fill="#5A5470"/><rect x="140" y="112" width="34" height="18" fill="#3A3550"/><circle cx="157" cy="104" r="10" fill="#B98CF0" opacity=".35"/><circle cx="157" cy="104" r="3" fill="#B98CF0"/>`,
};

/** Dessin de repli d'un lieu (SVG décoratif). */
function dessinLieu(id) {
  return `<svg class="sh-lieu-svg" viewBox="0 0 314 161" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${DESSIN[id] || DESSIN.ermite}</svg>`;
}

/** Rayons en % du côté : cases de la piste (anneau intérieur) et médaillons des joueurs (anneau extérieur). */
const R_PISTE = 33;
const R_MEDAILLON = 48;
const pct = (n) => `${n.toFixed(2)}%`;
/** Point (en %) d'un cercle de rayon r à l'angle deg (0 = droite, sens des aiguilles ; -90 = haut). */
function surCercle(r, deg) {
  const a = (deg * Math.PI) / 180;
  return [50 + r * Math.cos(a), 50 + r * Math.sin(a)];
}
/** Angle de la case n de la piste (15 cases, la case 0 en haut, sens des aiguilles). */
const angleCase = (n) => -90 + n * (360 / 15);

/** Pion d'un joueur : rond aux initiales dans sa couleur ; « (toi) » pour moi. zone sert aux animations de déplacement. */
function pionHtml(j, { moiId = null, tour = null, mort = false, zone = '' } = {}) {
  const moi = !!moiId && j.user_id === moiId;
  const nom = `${j.pseudo || '?'}${moi ? ' (toi)' : ''}`;
  const classes = ['sh-pion'];
  if (moi) classes.push('is-moi');
  if (tour && j.user_id === tour) classes.push('is-tour');
  if (mort) classes.push('is-mort');
  return `<span class="${classes.join(' ')}" data-uid="${esc(j.user_id)}" data-zone="${esc(zone)}" style="--pion:${couleurPion(j)}" role="img" aria-label="${esc(nom)}" title="${esc(nom)}">${esc(initials(j.pseudo))}</span>`;
}

/** Numéro de zone (1 à 3) d'un lieu, d'après les groupes tirés par le serveur ; null si le lieu est inconnu. */
export function zoneDe(lieu, zones) {
  const z = Array.isArray(zones) && zones.length ? zones : GROUPES;
  const i = z.findIndex((g) => Array.isArray(g) && g.includes(lieu));
  return i < 0 ? null : i + 1;
}

/**
 * Lieux, rangés par zone (les deux lieux d'une zone côte à côte, dans l'ordre tiré par le serveur) : visuel, dés, nom,
 * effet du lieu et pions des joueurs qui s'y trouvent. On attaque les joueurs de sa zone.
 * @param {object} o
 *   zones : etat.jeu.zones (3 groupes de 2 lieux) ; lieux : { id: {id, nom, texte} } ; joueurs : etat.joueurs ;
 *   options : lieux proposés (phase choisir_zone) ; choix : lieu coché par moi, ou null ;
 *   images : { id: url } des visuels qui existent ; moiId ; tour : qui doit agir ; maZone : numéro de ma zone, ou null.
 * @returns {string} HTML (<ol class="sh-zones">).
 */
export function zonesHtml({ zones = null, lieux = {}, joueurs = [], options = [], choix = null, images = {}, moiId = null, tour = null, maZone = null } = {}) {
  const z = Array.isArray(zones) && zones.length ? zones : GROUPES;
  const surLieu = (id) => joueurs.filter((j) => !j.parti && !j.elimine && j.etat?.lieu === id);
  const tuile = (id) => {
    const estOption = options.includes(id);
    const estChoix = choix === id;
    const nom = lieux[id]?.nom || id;
    const texte = lieux[id]?.texte || '';
    const img = images[id];
    const pions = surLieu(id).map((j) => pionHtml(j, { moiId, tour, zone: 'lieu' })).join('');
    const etiquette = estChoix
      ? '<span class="sh-tag is-choix">Choisi</span>'
      : (estOption ? '<span class="sh-tag">Possible</span>' : '');
    return `<article class="sh-lieu${estOption ? ' is-option' : ''}${estChoix ? ' is-choix' : ''}" aria-labelledby="sh-lieu-${esc(id)}" data-lieu="${esc(id)}">
      <div class="sh-lieu-scene">${img
        ? `<img class="sh-lieu-img" src="${esc(img)}" alt="" width="1200" height="560" loading="lazy">`
        : dessinLieu(id)}${etiquette}<span class="sh-lieu-des">${esc(LIEUX[id]?.des || '')}</span></div>
      <div class="sh-lieu-infos">
        <h4 class="sh-lieu-nom" id="sh-lieu-${esc(id)}">${esc(nom)}</h4>
        ${texte ? `<p class="sh-lieu-effet">${esc(texte)}</p>` : ''}
        ${pions ? `<div class="sh-pions">${pions}</div>` : ''}
      </div>
    </article>`;
  };
  return `<ol class="sh-zones">${z.map((g, i) => {
    const mienne = maZone === i + 1;
    return `<li class="sh-zone${mienne ? ' is-mienne' : ''}" data-zone-n="${i + 1}">
      <div class="sh-zone-tete"><h3 class="sh-zone-titre">Zone ${i + 1}</h3>${mienne ? '<span class="sh-tag-zone">Ta zone</span>' : ''}</div>
      <div class="sh-zone-lieux">${(g || []).filter((id) => LIEUX[id]).map(tuile).join('')}</div>
    </li>`;
  }).join('')}</ol>`;
}

/**
 * Piste des blessures (0 à 14) en anneau : pion plein de chaque joueur à son nombre de blessures ;
 * marque (anneau doré) au PV maximum des personnages révélés.
 * @param {object} o joueurs : etat.joueurs ; pv : etat.pv (PV maximum des révélés, sinon null) ; moiId ; tour.
 * @returns {string} HTML (<ol class="sh-piste">).
 */
export function pisteHtml({ joueurs = [], pv = {}, moiId = null, tour = null } = {}) {
  const liste = joueurs.filter((j) => !j.parti);
  const cases = [];
  for (let n = 0; n <= 14; n++) {
    const a = angleCase(n);
    const rad = (a * Math.PI) / 180;
    const [x, y] = surCercle(R_PISTE, a);
    const [px, py] = [x - 5 * Math.cos(rad), y - 5 * Math.sin(rad)];   // pions : juste à l'intérieur de la case
    const [mx, my] = [x + 6 * Math.cos(rad), y + 6 * Math.sin(rad)];   // marques de PV : à l'extérieur
    const blessures = liste.filter((j) => (j.etat?.degats ?? 0) === n);
    const marques = liste.filter((j) => j.etat?.revele && pv?.[j.user_id] != null && pv[j.user_id] === n);
    cases.push(`<li class="sh-case" style="left:${pct(x)};top:${pct(y)}">
      <span class="sh-case-num">${n}</span>
      ${blessures.length ? `<div class="sh-case-pions" style="left:${pct(px)};top:${pct(py)}">${blessures.map((j) => pionHtml(j, { moiId, tour, mort: !!j.elimine, zone: 'piste' })).join('')}</div>` : ''}
      ${marques.length ? `<div class="sh-case-pv" style="left:${pct(mx)};top:${pct(my)}">${marques.map((j) => `<span class="sh-marque-pv" role="img" aria-label="PV maximum de ${esc(j.pseudo || '?')} : ${n}" title="PV maximum de ${esc(j.pseudo || '?')} : ${n}">${esc(initials(j.pseudo))}</span>`).join('')}</div>` : ''}
    </li>`);
  }
  return `<ol class="sh-piste" aria-label="Piste des blessures, de 0 à 14">${cases.join('')}</ol>`;
}

/** Un médaillon de joueur autour de la table : portrait, pseudo, et pour un personnage connu son nom, son camp et ses PV. */
function medaillonHtml(j, [x, y], { moiId, tour, portrait, aPortee }) {
  const moi = !!moiId && j.user_id === moiId;
  const estTour = !!tour && j.user_id === tour;
  const s = j.etat || {};
  const camp = portrait?.camp || null;
  const cadre = portrait?.url
    ? `<img src="${esc(portrait.url)}" alt="" width="84" height="84" loading="lazy">`
    : '<span class="sh-med-inconnu" aria-hidden="true">?</span>';
  let etat = '';
  if (j.elimine) etat = 'Mort';
  else if (estTour) etat = moi ? 'À toi' : 'Son tour';
  else if (!s.lieu) etat = 'Pas encore entré';
  const pv = portrait?.max != null ? `${Math.max(0, portrait.max - (s.degats ?? 0))}/${portrait.max} PV` : '';
  const perso = portrait?.nom ? [portrait.nom, pv].filter(Boolean).join(' · ') : '';
  const classes = ['sh-med', `is-camp-${camp || 'inconnu'}`];
  if (moi) classes.push('is-moi');
  if (estTour) classes.push('is-tour');
  if (j.elimine) classes.push('is-mort');
  if (aPortee) classes.push('is-portee');
  return `<li class="${classes.join(' ')}" data-uid="${esc(j.user_id)}" data-zone="med" style="left:${pct(x)};top:${pct(y)};--camp:${couleurCamp(camp)}">
      <div class="sh-med-cadre">${cadre}</div>
      <span class="sh-med-nom">${esc(j.pseudo || '?')}${moi ? ' <span class="sh-etiquette">Toi</span>' : ''}</span>
      ${perso ? `<span class="sh-med-perso">${esc(perso)}</span>` : ''}
      ${camp ? `<span class="sh-med-camp">${esc(CAMP_LIBELLE[camp])}</span>` : ''}
      ${aPortee ? '<span class="sh-med-portee">À portée</span>' : ''}
      ${etat ? `<span class="sh-med-etat">${esc(etat)}</span>` : ''}
    </li>`;
}

/**
 * Médaillons des joueurs autour de la table : moi en bas, les autres à la suite, dans le sens des aiguilles.
 * @param {object} o joueurs : etat.joueurs ; moiId ; tour ;
 *   portraits : { user_id: { url, camp, nom, max } } (personnage connu : le mien, ou un personnage révélé) ;
 *   portee : joueurs que je peux attaquer (marqués « À portée »).
 * @returns {string} HTML (<ul class="sh-medaillons">).
 */
export function medaillonsHtml({ joueurs = [], moiId = null, tour = null, portraits = {}, portee = [] } = {}) {
  const liste = joueurs.filter((j) => !j.parti);
  const ordre = [...liste.filter((j) => j.user_id === moiId), ...liste.filter((j) => j.user_id !== moiId)];
  const pas = 360 / Math.max(ordre.length, 1);
  return `<ul class="sh-medaillons" aria-label="Joueurs autour de la table">${ordre.map((j, i) =>
    medaillonHtml(j, surCercle(R_MEDAILLON, 90 + i * pas), { moiId, tour, portrait: portraits[j.user_id] || null, aPortee: portee.includes(j.user_id) })).join('')}</ul>`;
}

/**
 * Visuel d'un personnage : image assets/img/plateaux/shadow/perso-<id>.webp si elle existe, sinon dessin de la maquette
 * (teinté de la couleur du camp).
 * @param {string} camp hunter | shadow | neutre | null.
 * @param {string|null} image URL de l'image, ou null.
 * @returns {string} HTML.
 */
export function persoVisuelHtml(camp, image = null) {
  if (image) return `<img class="sh-perso-img" src="${esc(image)}" alt="" width="800" height="600">`;
  const teinte = couleurCamp(camp);
  return `<svg class="sh-perso-svg" viewBox="0 0 232 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs><linearGradient id="sky-perso" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22345C"/><stop offset="1" stop-color="#0B1020"/></linearGradient></defs>
    <rect width="232" height="100" fill="url(#sky-perso)"/>
    <circle cx="196" cy="22" r="10" fill="#E9E4D0" opacity=".85"/>
    <path d="M0 92 Q60 84 120 90 T232 88 L232 100 L0 100 Z" fill="#070B14"/>
    <circle cx="116" cy="46" r="13" fill="#070B14"/>
    <rect x="98" y="30" width="36" height="7" rx="3" fill="#070B14"/>
    <path d="M86 100 L90 62 Q116 54 142 62 L146 100 Z" fill="#070B14"/>
    <circle cx="136" cy="72" r="9" fill="${teinte}" stroke="#E2C77E" stroke-width="2"/>
    <path d="M136 67l1.6 3.4 3.7.4-2.8 2.5.8 3.7-3.3-1.9-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="#E2C77E"/>
  </svg>`;
}
