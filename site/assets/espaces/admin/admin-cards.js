// ===== Humane Gang — administration : cartes à collectionner =====
// Séries (hg_card_sets), cartes (hg_cards), exemplaires (hg_card_copies), portefeuilles (hg_wallets, hg_wallet_log),
// échanges (hg_card_trades, hg_card_trade_items) et réglages (hg_settings.cards).
// Actions sensibles par RPC : hg_cards_admin_give_panier, hg_cards_admin_paillettes, hg_cards_admin_take, hg_trade_cancel.
// Rendu d'une carte : cardHtml de cartes-ui.js. Images : bucket public hg-assets, dossier cards/.
// Point d'entrée (importé par admin.js) : le code est réparti dans assets/js/admin-cards/.
export { mountCardsSection, openCardsTab } from './cartes/view.js';
export { mountPlayersList } from './cartes/players.js';
export { mountDropsSection } from './cartes/drops.js';
