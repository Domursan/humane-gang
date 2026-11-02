// ===== Humane Gang : icônes SVG partagées =====
// Un seul jeu de tracés (contenu de la balise <svg>, viewBox 0 0 24 24) et une seule fonction de rendu.
// svg(nom, { size, stroke }) renvoie la chaîne HTML. size : largeur et hauteur en px (absent = taille CSS) ;
// stroke : épaisseur du trait (défaut 2). Les tracés qui différaient sous un même nom sont gardés
// sous des noms distincts (ex. trash, trash2, trash3) pour ne rien changer visuellement.

/*
 * Rôle : fournit les icônes SVG du site. Un seul dictionnaire de tracés (PATHS) et une fonction svg()
 * qui assemble la balise complète. Les icônes sont décoratives (aria-hidden) et prennent la couleur du texte.
 * Page : toutes les pages (les pages d'administration et les pages membre les importent).
 * Dépendances : aucune.
 * Exporte : svg.
 */

/**
 * Tracés des icônes, par nom court (contenu de la balise <svg>, sans la balise elle-même).
 * Un nom inconnu fait échouer svg() : vérifier l'orthographe avant d'ajouter un appel.
 */
const PATHS = {
  arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrow2: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  arrow3: '<path d="M4 12h15"/><path d="M13 6l6 6-6 6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  back2: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  badge: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  box: '<path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  cake: '<path d="M4 21h16M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M5 16c2 1.5 3.5 1.5 5 0s3.5-1.5 5 0 3 1.5 4 0"/><path d="M12 12V8M12 5.5v.01"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5z"/><path d="M8 9.5h8M8 12.5h5"/>',
  chat2: '<path d="M4 5h16v11H9l-5 4V5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  check2: '<path d="M5 12l5 5 9-10"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  close2: '<path d="M6 6l12 12M18 6 6 18"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  data: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  download2: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  download3: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  edit2: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  edit3: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
  err: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.8 8.3 2 12 2 12s3.5 7 10 7c1.7 0 3.2-.4 4.5-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  flip: '<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>',
  gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9.5 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  gift2: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8"/><path d="M12 8v12"/><path d="M12 8c-2-4-6-4-6-1.5S9 8 12 8zM12 8c2-4 6-4 6-1.5S15 8 12 8z"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  info: '<path d="M4 7h16M4 12h16M4 17h10"/><circle cx="19" cy="17" r="2"/>',
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  link2: '<path d="M7 12h10M13 8l4 4-4 4"/>',
  link3: '<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  lock2: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  mask2: '<path d="M3 8c3-1.5 6-1.5 9 0 3-1.5 6-1.5 9 0v3c0 4-3 6-5.5 6-1.6 0-2.6-1.3-3.5-3-.9 1.7-1.9 3-3.5 3C6 17 3 15 3 11V8z"/><path d="M7 11.5h2M15 11.5h2"/>',
  megaphone: '<path d="M3 11v3l12 5V6L3 11z"/><path d="M15 9a3 3 0 0 1 0 6M6 15l1 5h3l-1-4"/>',
  msg: '<path d="M4 5h16v11H9l-5 4z"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  no: '<path d="M7 7l10 10M17 7L7 17"/>',
  off: '<circle cx="12" cy="12" r="8"/><path d="M6 6l12 12"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.6 3.6-5.5 6.5-5.5s5.5 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.7 3 2.4 3.5 5.2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  play2: '<path d="M7 4.5v15l12-7.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  prev: '<path d="M15 18l-6-6 6-6"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3M17.5 17.5h.01"/>',
  replay: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  search2: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7-7-1z"/>',
  send2: '<path d="M4 12l16-8-6 16-2.5-6.5L4 12z"/><path d="M11.5 13.5L20 4"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  trash2: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  trash3: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 21h8M9 17h6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  upload2: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  user2: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  users2: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.6-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.7.7 3 2.4 3.5 5.2"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/>',
  warn2: '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17h.01"/>',
};

/**
 * Renvoie le HTML d'une icône SVG.
 * @param {string} name Nom de l'icône (clé de PATHS). Jette une erreur si le nom est inconnu.
 * @param {{size?: number, stroke?: number}} [options] size : largeur et hauteur en px (absent = taille CSS) ;
 *   stroke : épaisseur du trait (défaut 2).
 * @returns {string} Balise <svg> prête à insérer dans un innerHTML.
 */
export function svg(name, { size, stroke = 2 } = {}) {
  const inner = PATHS[name];
  if (inner === undefined) throw new Error(`icône inconnue : ${name}`);
  const dim = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${dim} fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
