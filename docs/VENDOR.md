# Bibliothèques servies localement (`assets/vendor/`)

Ces fichiers remplacent les chargements depuis un CDN (jsDelivr). Le site les sert lui-même, donc il ne dépend plus
d'un CDN tiers pour le client Supabase ni pour le générateur de QR codes.

| Fichier | Bibliothèque | Version | Licence |
|---|---|---|---|
| `supabase-js-2.45.4.js` | `@supabase/supabase-js`, build UMD (pose `window.supabase`) | 2.45.4 | MIT |
| `supabase-js-2.45.4.mjs` | Wrapper ESM : importe le `.js` voisin et exporte `createClient` (et `default`) | 2.45.4 | MIT |
| `qrcode-generator-1.4.4.mjs` | `qrcode-generator` (Kazuhiko Arase), source inchangée + `export default qrcode` | 1.4.4 | MIT |
| `html-to-image-1.11.11.mjs` | `html-to-image` (bubkoo), build UMD inchangé (pose `globalThis.htmlToImage`) + exports `toBlob`, `toPng`, `toCanvas`, `default` ; licence MIT en tête | 1.11.11 | MIT |

## Source

- supabase-js : paquet npm `@supabase/supabase-js@2.45.4`, fichier `dist/umd/supabase.js`, fourni par le propriétaire du site.
- qrcode-generator : paquet npm `qrcode-generator@1.4.4`, fichier `qrcode.js`, fourni par le propriétaire du site.
- html-to-image : paquet npm `html-to-image@1.11.11` (registry.npmjs.org, empreinte sha1 `c0f8a34dc9e4b97b93ff7ea286eb8562642ebbea`),
  fichier `dist/html-to-image.js` sans la ligne `sourceMappingURL`.

Le contenu n'a pas été modifié, sauf l'ajout du wrapper ESM (`.mjs`) et de l'en-tête de commentaire.

## Utilisation

- Le client Supabase est chargé par `assets/commun/core/supabase.js` :
  `await import('../../vendor/supabase-js-2.45.4.mjs')`.
  Le `.mjs` charge le `.js` UMD comme script classique (et non par `import`) : son runtime webpack a besoin de
  `document.currentScript`, absent dans un module. Le `.js` n'est donc pas modifié.
- Les pages le précharge avec `<link rel="modulepreload" href="assets/vendor/supabase-js-2.45.4.mjs">`.
- Le QR code est chargé au premier usage par `assets/espaces/admin/cartes/codes.js` et `assets/espaces/admin/admin-invite-links.js`
  (`import('…/qrcode-generator-1.4.4.mjs')`, `.default(0, 'M')`).
- html-to-image est chargé au clic sur « Télécharger l’image » par `assets/espaces/cartes/cartes-vitrine-image.js`
  (vitrine en image de la fiche membre, `toBlob`) ; les polices lui sont données en `fontEmbedCSS` (fichiers du site
  en `data:`), il ne lit donc aucune feuille d'un autre site.
- Les fichiers sont mis en cache hors ligne par `sw.js` (liste `PRECACHE`).

## Mise à jour

1. Télécharger le nouveau build (`dist/umd/supabase.js` pour supabase-js, `qrcode.js` pour qrcode-generator)
   et vérifier la version exacte dans le fichier.
2. Remplacer le `.js` (supabase) ou le `.mjs` (qrcode, en gardant `export default qrcode;` à la fin).
3. Renommer le fichier avec la nouvelle version et mettre à jour partout les chemins :
   `grep -rn "supabase-js-2\.45\.4\|qrcode-generator-1\.4\.4" --include=*.html --include=*.js --include=*.cjs --include=*.mjs .`
   (pages HTML, `sw.js`, `assets/js/`, `tests/`, ce README).
4. Lancer `node tests/vendor-check.cjs` puis les parcours (`tests/parcours-j8.cjs`, etc.).
5. Changer le numéro de version du cache dans `sw.js` (`CACHE_VERSION`) pour que les visiteurs reçoivent les nouveaux fichiers.

Licences MIT : les en-têtes de copyright des fichiers source sont conservés.
