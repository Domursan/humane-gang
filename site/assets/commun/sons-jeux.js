// ===== Humane Gang — sons des jeux (WebAudio, aucun fichier) =====
/*
 * Rôle : les sons validés sur les maquettes des jeux (oct. 2026), joués par les tables de jeu.
 * Usage : import { jouerSonJeu } from '…/commun/sons-jeux.js' ; jouerSonJeu('echecs', 3) (jeu, numéro du son sur la maquette).
 * Suit la préférence « Sons des jeux » (sonTour, active par défaut) et le volume des préférences ; jamais avant un geste
 * de l'utilisateur (le navigateur l'exige) ; silencieux si WebAudio manque. Anti-rafale : un même son 60 ms au plus.
 * Dépendances : aucune (lit localStorage « hg_prefs »).
 * Exporte : jouerSonJeu, reveillerSons, sonsPrets, SONS_JEUX (liste par jeu : numéro → nom ; « quotidien » : codes de effets-jour.js ; « uno » : UN1 à UN14, joués par espaces/uno ; « duels » : S01 à S20, duels, plateaux et salles, voir commun/effets-duels.js).
 */
let A = null; let M = null; const dernier = {};
function prefs() {
  try { const p = JSON.parse(localStorage.getItem('hg_prefs') || 'null') || {}; const v = Number(p.volume);
    return { on: p.sonTour !== false, volume: Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.6 }; }
  catch { return { on: true, volume: 0.6 }; }
}
function ctx() {
  if (!A) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; A = new AC(); M = A.createGain(); M.connect(A.destination); }
  if (A.state === 'suspended') A.resume().catch(() => {});
  return A;
}
const note = (f, t, d, o = {}) => { const { type = 'sine', vol = .3, att = .005, f2 = null } = o; const a = A, os = a.createOscillator(), g = a.createGain();
  os.type = type; os.frequency.setValueAtTime(f, a.currentTime + t); if (f2) os.frequency.exponentialRampToValueAtTime(f2, a.currentTime + t + d);
  g.gain.setValueAtTime(0.0001, a.currentTime + t); g.gain.linearRampToValueAtTime(vol, a.currentTime + t + att); g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t + d);
  os.connect(g).connect(M); os.start(a.currentTime + t); os.stop(a.currentTime + t + d + .05); };
const bruit = (t, d, freq, vol = .4, q = 1, type = 'bandpass') => { const a = A, n = Math.max(1, Math.floor(a.sampleRate * d)), buf = a.createBuffer(1, n, a.sampleRate), x = buf.getChannelData(0);
  for (let i = 0; i < n; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2); const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  s.buffer = buf; fl.type = type; fl.frequency.value = freq; fl.Q.value = q; g.gain.value = vol; s.connect(fl).connect(g).connect(M); s.start(a.currentTime + t); };
const cloche = (f, t, d, vol = .22) => { const a = A, c = a.createOscillator(), m = a.createOscillator(), mg = a.createGain(), g = a.createGain();
  c.frequency.value = f; m.frequency.value = f * 3.5; mg.gain.setValueAtTime(f * 2, a.currentTime + t); mg.gain.exponentialRampToValueAtTime(1, a.currentTime + t + d);
  m.connect(mg).connect(c.frequency); g.gain.setValueAtTime(0, a.currentTime + t); g.gain.linearRampToValueAtTime(vol, a.currentTime + t + .004);
  g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + t + d); c.connect(g).connect(M); [c, m].forEach((o) => { o.start(a.currentTime + t); o.stop(a.currentTime + t + d + .05); }); };

/** Arpège : notes l'une après l'autre (l fréquences, pas écart, d durée, t0 départ). */
const arpege = (l, pas, d, vol = .15, type = 'triangle', t0 = 0) => l.forEach((f, i) => note(f, t0 + i * pas, d, { type, vol }));

/** Sons par jeu et numéro (numéros des maquettes validées). */
const SONS = {
  'loup-garou': {
    1: () => { bruit(0,1.6,500,.25,.6,'lowpass');note(392,0,1.6,{vol:.18,f2:196});note(587,.3,1.4,{type:'triangle',vol:.06,f2:294}); }, // La nuit tombe
    2: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.16,.9,{type:'triangle',vol:.14})); }, // Le jour se lève
    3: () => { bruit(0,.35,120,.9,.8,'lowpass');note(110,0,.8,{vol:.3,f2:70});note(233,.25,1.2,{type:'sawtooth',vol:.05});note(247,.25,1.2,{type:'sawtooth',vol:.05}); }, // Mort à l’aube
    4: () => { [0,.65,1.3,1.95].forEach((t)=>{bruit(t,.06,2200,.6,1.2);note(660,t,.12,{type:'triangle',vol:.1});}); }, // Vote (jeton posé)
    5: () => { bruit(0,.12,3000,.35,.8,'highpass');cloche(880,.15,1.2,.16); }, // Carte retournée
    6: () => { note(300,0,1.8,{type:'sawtooth',vol:.05,f2:520});note(520,1.2,1.2,{type:'sawtooth',vol:.04,f2:260});bruit(0,1.8,400,.12,.5,'lowpass'); }, // Hurlement lointain
  },
  'morpion': {
    1: () => { bruit(0,.12,3500,.35,1.5,'highpass');note(740,.02,.1,{type:'triangle',vol:.08}); }, // Marque posée (craie)
    2: () => { [659,784,1047].forEach((f,i)=>note(f,i*.12,.5,{type:'triangle',vol:.16})); }, // Victoire
    3: () => { note(440,0,.3,{type:'triangle',vol:.14});note(330,.25,.6,{type:'triangle',vol:.14}); }, // Défaite
    4: () => { note(600,0,.12,{type:'square',vol:.07});note(600,.18,.12,{type:'square',vol:.07}); }, // Égalité
    5: () => { bruit(0,.06,900,.8,2);note(320,0,.12,{vol:.25,f2:180}); }, // Marque posée (bois)
  },
  'nom-de-code': {
    1: () => { note(784,0,.12,{type:'triangle',vol:.16});note(1046,.1,.35,{type:'triangle',vol:.14}); }, // Indice donné
    2: () => { cloche(660,0,1,.16);cloche(990,.12,.9,.09); }, // Carte de l’équipe
    3: () => { bruit(0,.09,1200,.5,1.2,'lowpass');note(260,0,.25,{type:'sine',vol:.12,f2:200}); }, // Carte passante
    4: () => { bruit(0,1.4,80,.9,.8,'lowpass');note(110,0,1.5,{type:'sawtooth',vol:.22,f2:41});note(116,0,1.5,{type:'sawtooth',vol:.12,f2:45}); }, // Assassin
    5: () => { [523,659,784,1047,1319].forEach((f,i)=>note(f,i*.1,.6,{type:'triangle',vol:.14})); }, // Victoire
  },
  'blackjack': {
    1: () => { [0,.22,.44,.66].forEach((t)=>bruit(t,.08,3000,.35,.9,'highpass')); }, // Cartes distribuées
    2: () => { bruit(0,.12,3000,.35,.8,'highpass');cloche(880,.15,1.2,.16); }, // Carte retournée
    3: () => { [0,.12,.24].forEach((t)=>{bruit(t,.05,2500,.5,1.4);note(1200,t,.06,{type:'triangle',vol:.06});}); }, // Jetons
    4: () => { [659,784,1047].forEach((f,i)=>note(f,i*.12,.5,{type:'triangle',vol:.16})); }, // Gain
    5: () => { note(523,0,.3,{type:'triangle',vol:.14});note(392,.25,.6,{type:'triangle',vol:.14}); }, // Banque saute
  },
  'poker': {
    1: () => { bruit(0,.07,2600,.5,1.6);note(520,0,.08,{type:'triangle',vol:.1}); }, // Carte posée sur le tapis
    2: () => { [0,.1,.2,.3].forEach((t)=>{bruit(t,.05,2500,.5,1.4);note(1200,t,.06,{type:'triangle',vol:.06});}); }, // Jetons vers le pot
    3: () => { note(440,0,.1,{type:'triangle',vol:.12}); }, // Parole (check)
    4: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.1,.6,{type:'triangle',vol:.15})); }, // Pot gagné
    5: () => { cloche(196,.1,1.6,.22);bruit(.3,.6,1500,.25,.7); }, // Tapis (all-in)
  },
  'catan': {
    1: () => { [0,.14,.31].forEach((t)=>{bruit(t,.05,1800,.7,2.5);}); }, // Dés qui roulent
    2: () => { [0,.1,.2,.3].forEach((t)=>{note(880+Math.random()*300,t,.07,{type:'triangle',vol:.08});}); }, // Ressources reçues
    3: () => { bruit(0,.06,900,.8,2);note(320,0,.12,{vol:.25,f2:180}); }, // Route ou colonie posée
    4: () => { note(784,0,.25,{type:'triangle',vol:.14});note(1047,.18,.4,{type:'triangle',vol:.14}); }, // Point gagné
    5: () => { note(330,0,.5,{type:'sawtooth',vol:.07,f2:165}); }, // Voleur
  },
  'pictionary': {
    1: () => { bruit(0,.18,4000,.2,.8,'highpass'); }, // Trait de crayon
    2: () => { note(1046,0,.09,{type:'triangle',vol:.12}); }, // Lettre dévoilée
    3: () => { [659,784,1047].forEach((f,i)=>note(f,i*.1,.45,{type:'triangle',vol:.16})); }, // Trouvé !
    4: () => { note(494,0,.25,{type:'triangle',vol:.14});note(392,.22,.5,{type:'triangle',vol:.14}); }, // Temps écoulé
    5: () => { cloche(988,0,.9,.18); }, // Mot choisi
  },
  'puissance-4': {
    1: () => { bruit(0,.04,900,.6,1,'lowpass');note(200,0,.14,{type:'sine',vol:.28,f2:110});bruit(.5,.035,1100,.3,1,'lowpass');note(240,.5,.08,{type:'sine',vol:.12,f2:150}); }, // Jeton qui tombe
    2: () => { note(660,0,.05,{type:'square',vol:.08});note(990,.05,.05,{type:'square',vol:.05}); }, // Colonne choisie
    3: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.1,.6,{type:'triangle',vol:.16})); }, // Victoire
    4: () => { [1319,1568,2093,2637].forEach((f,i)=>note(f,i*.06,.3,{type:'sine',vol:.07}));bruit(.05,.3,6000,.08,2,'highpass'); }, // Ligne alignée
    5: () => { cloche(659,0,1.8,.2);cloche(988,.12,1.6,.12); }, // Fin de duel
  },
  'othello': {
    1: () => { bruit(0,.05,2500,.5,1.5,'highpass');note(520,0,.08,{type:'triangle',vol:.14}); }, // Pion posé
    2: () => { bruit(0,.04,3000,.4,2,'highpass');note(880,.02,.06,{type:'sine',vol:.06}); }, // Pion retourné
    3: () => { note(1046,0,.07,{type:'sine',vol:.08}); }, // Compte qui change
    4: () => { cloche(659,0,1.8,.2);cloche(988,.12,1.6,.12); }, // Fin de partie
  },
  'dames': {
    1: () => { bruit(0,.05,1800,.6,1.2,'bandpass');note(260,0,.1,{type:'triangle',vol:.2,f2:140}); }, // Pièce prise
    2: () => { bruit(0,.35,700,.25,.7,'lowpass');note(330,0,.35,{type:'sine',vol:.08,f2:260}); }, // Glissement
    3: () => { note(740,0,.05,{type:'square',vol:.08}); }, // Sélection
    4: () => { cloche(523,0,1.6,.18);cloche(784,.15,1.4,.12); }, // Fin de partie
  },
  'echecs': {
    1: () => { bruit(0,.04,1200,.5,1,'lowpass');note(300,0,.12,{type:'sine',vol:.25,f2:120}); }, // Pièce prise
    2: () => { bruit(0,.03,1500,.5,3);note(330,0,.09,{type:'triangle',vol:.22,f2:180}); }, // Pièce posée (bois)
    3: () => { note(110,0,1.8,{type:'sine',vol:.25,f2:98});cloche(220,.05,1.6,.1); }, // Échec (gong grave)
    4: () => { [392,523,659,784].forEach((f,i)=>note(f,i*.14,.5,{type:'square',vol:.09})); }, // Échec et mat
    5: () => { note(600,0,.12,{type:'square',vol:.07});note(600,.18,.12,{type:'square',vol:.07}); }, // Nulle
  },
  'bataille-navale': {
    1: () => { bruit(0,.3,700,.5,1,'lowpass');note(330,0,.35,{type:'sine',vol:.22,f2:110}); }, // Plouf (à l’eau)
    2: () => { bruit(0,.9,900,.9,.6,'lowpass');note(120,0,.8,{vol:.35,f2:40}); }, // Touché (explosion)
    3: () => { bruit(0,1.4,500,1,.5,'lowpass');note(110,0,1.4,{vol:.3,f2:35});[330,277,220].forEach((f,i)=>note(f,.5+i*.22,.4,{type:'triangle',vol:.1})); }, // Coulé (fond de mer)
    4: () => { cloche(1320,0,1.2,.16);cloche(1320,.7,1.0,.1); }, // Tir reçu (sonar)
    5: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.1,.5,{type:'triangle',vol:.14})); }, // Victoire
  },
  'mastermind': {
    1: () => { note(880,0,.12,{type:'triangle',vol:.12}); }, // Indice bien placé
    2: () => { note(560,0,.14,{type:'sine',vol:.1}); }, // Indice mal placé
    3: () => { bruit(0,.05,2600,.5,1.5);note(700,0,.06,{type:'square',vol:.05}); }, // Pion posé
    4: () => { [523,659,784,988,1319].forEach((f,i)=>note(f,i*.09,.45,{type:'triangle',vol:.13})); }, // Code percé
    5: () => { [392,349,311].forEach((f,i)=>note(f,i*.22,.45,{type:'triangle',vol:.12})); }, // Le robot perce ton code
  },
  'qui-est-ce': {
    1: () => { bruit(0,.08,1800,.4,1.2,'highpass');note(520,.02,.1,{type:'triangle',vol:.08}); }, // Portrait baissé
    2: () => { note(660,0,.15,{type:'triangle',vol:.14});note(990,.12,.3,{type:'triangle',vol:.14}); }, // Réponse « oui »
    3: () => { note(220,0,.35,{type:'square',vol:.07,f2:160}); }, // Réponse « non »
    4: () => { cloche(1046,0,.6,.12); }, // Question posée
    5: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.1,.5,{type:'triangle',vol:.14})); }, // Personnage trouvé
  },
  'pierre-feuille-ciseaux': {
    1: () => { [0,.45,.9].forEach((t)=>bruit(t,.06,2000,.6,1.4));note(988,1.25,.3,{type:'square',vol:.1}); }, // Compte à trois
    2: () => { bruit(0,.25,900,.6,.8,'bandpass');note(440,.05,.3,{type:'triangle',vol:.12});note(660,.18,.35,{type:'triangle',vol:.12}); }, // Révélation des mains
    3: () => { [523,659,784].forEach((f,i)=>note(f,i*.09,.4,{type:'triangle',vol:.14})); }, // Lancer gagné
    4: () => { note(600,0,.12,{type:'square',vol:.07});note(600,.18,.12,{type:'square',vol:.07}); }, // Égalité, on relance
    5: () => { [659,784,988,1319].forEach((f,i)=>note(f,i*.11,.55,{type:'triangle',vol:.14})); }, // Duel gagné
  },
  'cluedo': {
    1: () => { bruit(0,.05,900,.7,2);note(260,0,.08,{type:'triangle',vol:.12}); }, // Pas sur le plateau
    2: () => { bruit(0,.25,2500,.25,.9,'highpass');bruit(.22,.08,1800,.2,1.2); }, // Carte montrée
    3: () => { cloche(523,0,1.4,.2);cloche(784,.15,1.2,.12); }, // Hypothèse posée
    4: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.12,.7,{type:'triangle',vol:.14})); }, // Solution révélée
    5: () => { note(392,0,.4,{type:'triangle',vol:.14});note(294,.3,.4,{type:'triangle',vol:.14});note(220,.6,.8,{type:'sawtooth',vol:.05}); }, // Éliminé
  },
  'destins': {
    1: () => { bruit(0,.05,1800,.5,2);note(660,0,.05,{type:'triangle',vol:.08}); }, // Pas sur la case
    2: () => { [0,.09,.18,.28,.39,.52,.66,.82,1.0,1.2,1.42,1.66].forEach((t)=>bruit(t,.03,2600,.35,3,'highpass')); }, // Roulette
    3: () => { cloche(1047,0,1.2,.18);note(1319,.05,.6,{type:'triangle',vol:.08}); }, // Résultat de la roue
    4: () => { bruit(0,.2,1200,.3,.8);cloche(659,.15,1.4,.14);cloche(988,.3,1.2,.08); }, // Carte Événement
    5: () => { [523,659,784,1047].forEach((f,i)=>note(f,i*.14,.5,{type:'triangle',vol:.16}));note(1047,.6,1,{type:'triangle',vol:.1}); }, // Victoire
  },
  'monopoly': {
    1: () => { [0,.07,.15,.22,.31,.4].forEach((t)=>bruit(t,.04,3000,.5,2,'highpass'));bruit(.45,.08,400,.6,1,'lowpass'); }, // Dés qui roulent
    2: () => { bruit(0,.04,2200,.5,2);note(780,0,.05,{type:'triangle',vol:.08}); }, // Pion posé
    3: () => { note(1568,0,.08,{type:'square',vol:.1});note(2093,.07,.25,{type:'square',vol:.1});bruit(0,.05,4000,.3,3,'highpass'); }, // Billets
    4: () => { note(180,0,.6,{type:'sawtooth',vol:.1,f2:120});bruit(.3,.06,900,.8,4);bruit(.65,.06,900,.8,4); }, // Prison
    5: () => { [392,523,659,784].forEach((f,i)=>note(f,i*.12,.5,{type:'triangle',vol:.16}));note(784,.5,1.2,{type:'triangle',vol:.12}); }, // Victoire
  },
  'risk': {
    1: () => { bruit(0,.06,1200,.6,2);note(330,0,.1,{type:'triangle',vol:.14}); }, // Troupe posée
    2: () => { [0,.05,.11,.19,.28,.38,.5].forEach((t)=>bruit(t,.035,2000,.5,3,'bandpass'));bruit(.56,.1,400,.7,1,'lowpass'); }, // Dés qui roulent
    3: () => { bruit(0,.12,300,.9,1,'lowpass');note(146,0,.25,{type:'sawtooth',vol:.12,f2:70}); }, // Choc de bataille
    4: () => { [262,330,392,523].forEach((f,i)=>note(f,i*.1,.35,{type:'triangle',vol:.16})); }, // Territoire conquis
    5: () => { [262,330,392,523,659].forEach((f,i)=>note(f,i*.08,1.4,{type:'triangle',vol:.1}));cloche(523,.4,1.8,.18); }, // Victoire du monde
  },
  'shadow-hunters': {
    1: () => { [0,.06,.13,.21,.3].forEach((t)=>bruit(t,.035,2400,.5,2.5,'highpass'));bruit(.4,.08,500,.6,1,'lowpass');note(440,.5,.1,{type:'triangle',vol:.1}); }, // Dés (d6 + d4)
    2: () => { cloche(392,0,1.6,.14);cloche(587,.5,1.4,.1); }, // Vision révélée
    3: () => { bruit(0,.14,260,.9,1,'lowpass');note(120,0,.35,{type:'sawtooth',vol:.12,f2:60}); }, // Blessure
    4: () => { note(900,0,.35,{type:'sine',vol:.08,f2:300});bruit(.25,.12,2000,.25,1,'highpass'); }, // Attaque ratée
    5: () => { [330,415,494,659].forEach((f,i)=>note(f,i*.12,.6,{type:'triangle',vol:.14}));note(659,.5,1.2,{type:'triangle',vol:.1}); }, // Victoire
  },
  'quotidien': { // Jeux quotidiens (effets-jour.js) : codes de la maquette validée
    F1: () => { [523,659,784,1047,1319].forEach((f,i)=>note(f,i*.09,.55,{type:'triangle',vol:.15}));cloche(1319,.48,1.1,.12); }, // Parfait (10 points)
    F2: () => { [659,784,1047].forEach((f,i)=>note(f,i*.11,.45,{type:'triangle',vol:.15})); }, // Trouvé
    F3: () => { [523,659].forEach((f,i)=>note(f,i*.13,.4,{type:'triangle',vol:.15})); }, // Trouvé juste à temps
    F4: () => { note(392,0,.3,{type:'triangle',vol:.14});note(330,.25,.6,{type:'triangle',vol:.14}); }, // Raté
    F5: () => { for(let i=0;i<8;i++)note(1100+i*70,i*.07,.05,{type:'triangle',vol:.07}); }, // Paillettes qui défilent
    G1: () => { note(880,0,.12,{type:'triangle',vol:.13}); }, // Lettre bien placée
    G2: () => { note(587,0,.12,{type:'triangle',vol:.11}); }, // Lettre mal placée
    G3: () => { bruit(0,.05,500,.4,1,'lowpass'); }, // Lettre absente
    G4: () => { note(220,0,.28,{type:'square',vol:.06,f2:160}); }, // Refusé
    D1: () => { note(247,0,.25,{type:'triangle',vol:.16,f2:165}); }, // Essai raté
    D2: () => { bruit(0,.12,2500,.22,.8,'highpass'); }, // Passer
    D3: () => { cloche(988,0,.7,.12); }, // Indice dévoilé
    D4: () => { note(420,0,.6,{type:'sine',vol:.08,f2:1320});cloche(1319,.5,.8,.1); }, // Image dévoilée
    C1: () => { note(740,0,.05,{type:'square',vol:.06}); }, // Tuile choisie
    C2: () => { [659,880,1175].forEach((f,i)=>note(f,i*.08,.4,{type:'triangle',vol:.15})); }, // Groupe trouvé
    C3: () => { note(659,0,.12,{type:'triangle',vol:.12});note(622,.14,.22,{type:'triangle',vol:.12}); }, // À un mot près
    C4: () => { note(196,0,.3,{type:'square',vol:.06}); }, // Erreur
    M1: () => { note(1046,0,.06,{type:'triangle',vol:.09}); }, // Lettre allumée
    M2: () => { [784,1047].forEach((f,i)=>note(f,i*.09,.35,{type:'triangle',vol:.15})); }, // Mot trouvé
    M3: () => { cloche(880,0,.9,.13);cloche(1320,.1,.8,.08); }, // Bloc complet
    P1: () => { bruit(0,.05,900,.7,2);note(320,0,.12,{vol:.22,f2:180}); }, // Épingle posée
    P2: () => { note(500,0,.7,{type:'sine',vol:.06,f2:900}); }, // Trajet tracé
    P3: () => { for(let i=0;i<9;i++)note(900+i*60,i*.06,.04,{type:'triangle',vol:.06}); }, // Score qui défile
    Q1: () => { note(784,0,.12,{type:'triangle',vol:.15});note(1175,.1,.35,{type:'triangle',vol:.15}); }, // Bonne réponse
    Q2: () => { note(233,0,.35,{type:'sawtooth',vol:.06,f2:175}); }, // Mauvaise réponse
  },
  'flash': { // Jeux flash : codes de la maquette validée (socle SO, puis un préfixe par jeu)
    SO1: () => { note(660, 0, .14, { type: 'square', vol: .08 }); }, // Compte
    SO2: () => { note(880, 0, .1, { type: 'square', vol: .08 }); note(1319, .08, .35, { type: 'square', vol: .09 }); cloche(1760, .08, .6, .08); }, // Go !
    SO3: () => { note(660, 0, .09, { type: 'square', vol: .07 }); note(440, .09, .18, { type: 'square', vol: .07 }); }, // Pause
    SO4: () => { note(440, 0, .09, { type: 'square', vol: .07 }); note(660, .09, .18, { type: 'square', vol: .07 }); }, // Reprise
    SO5: () => { [523, 440, 370].forEach(function (f, i) { note(f, i * .16, .2, { type: 'triangle', vol: .13 }); }); note(262, .48, .7, { type: 'triangle', vol: .14, f2: 233 }); }, // Fin de partie
    SO6: () => { arpege([523, 659, 784, 1047, 1319, 1568], .07, .5, .13); cloche(1568, .45, 1.1, .12); for (var i = 0; i < 6; i++) note(2000 + i * 90, .5 + i * .06, .05, { type: 'triangle', vol: .05 }); }, // Nouveau record
    SO7: () => { arpege([392, 523, 659, 784], .09, .22, .07, 'square'); cloche(1047, .36, .7, .08); }, // Titre
    PA1: () => { note(1175, 0, .07, { type: 'triangle', vol: .14 }); note(1568, .06, .16, { type: 'triangle', vol: .12 }); }, // Prise
    PA2: () => { note(300, 0, .12, { vol: .1, f2: 180 }); bruit(0, .04, 1200, .15, 1, 'lowpass'); }, // Tombée au sol
    PA3: () => { note(180, 0, .32, { type: 'sawtooth', vol: .09, f2: 70 }); note(190, 0, .3, { type: 'square', vol: .05, f2: 80 }); bruit(0, .12, 700, .25, 1.5); }, // Fausse paillette
    PA4: () => { bruit(0, .09, 5200, .35, 3, 'highpass'); cloche(2093, 0, .5, .1); cloche(1568, .07, .45, .07); }, // Grêlon
    PA5: () => { note(494, 0, .12, { type: 'triangle', vol: .15 }); note(370, .12, .12, { type: 'triangle', vol: .15 }); note(247, .24, .4, { type: 'triangle', vol: .15, f2: 200 }); }, // Cœur perdu
    PA6: () => { note(400, 0, .5, { vol: .1, f2: 1200 }); cloche(1200, .45, .5, .06); }, // Palier de vitesse
    RA1: () => { bruit(0, .05, 900, .35, 1, 'lowpass'); note(330, 0, .14, { vol: .22, f2: 520 }); }, // Fromage attrapé
    RA2: () => { bruit(0, .35, 1800, .12, .7, 'highpass'); note(220, 0, .35, { vol: .05, f2: 260 }); }, // Fromage qui fond
    RA3: () => { bruit(0, .07, 3000, .5, 2, 'highpass'); note(150, 0, .2, { type: 'square', vol: .08, f2: 90 }); }, // Cornichon
    RA4: () => { note(392, 0, .15, { type: 'triangle', vol: .15 }); note(294, .15, .5, { type: 'triangle', vol: .15, f2: 250 }); }, // Cœur perdu
    RA5: () => { note(520, 0, .06, { vol: .1, f2: 260 }); bruit(0, .03, 600, .2); }, // Tranche au sol
    RA6: () => { bruit(0, .5, 6000, .1, .5, 'highpass'); bruit(.12, .3, 5200, .07, .5, 'highpass'); }, // Poêlon qui grésille
    DE1: () => { note(880, 0, .04, { type: 'square', vol: .05 }); bruit(0, .02, 3000, .2, 1); }, // Case ouverte
    DE2: () => { for (var i = 0; i < 6; i++) note(500 + i * 90, i * .05, .07, { type: 'triangle', vol: .1 }); }, // Ouverture en vague
    DE3: () => { bruit(0, .04, 1500, .4, 2); note(300, 0, .1, { vol: .2, f2: 200 }); note(1200, .06, .1, { type: 'triangle', vol: .08 }); }, // Drapeau posé
    DE4: () => { note(900, 0, .08, { vol: .1, f2: 500 }); }, // Drapeau retiré
    DE5: () => { arpege([440, 554, 659], .05, .2, .12); }, // Accord des voisines
    DE6: () => { bruit(0, .5, 300, .7, .8, 'lowpass'); note(120, 0, .5, { type: 'sawtooth', vol: .12, f2: 40 }); bruit(.05, .15, 2500, .3, 1); note(262, .45, .3, { type: 'triangle', vol: .12 }); note(196, .7, .5, { type: 'triangle', vol: .12 }); }, // Cœur qui explose
    DE7: () => { arpege([523, 659, 784, 1047], .09, .5, .14); cloche(1568, .4, 1, .1); cloche(2093, .55, 1, .07); }, // Victoire
    TU1: () => { bruit(0, .09, 1800, .12, .6); }, // Glissement
    TU2: () => { arpege([523, 659], .06, .16, .13); }, // Fusion peu commune
    TU3: () => { arpege([523, 659, 784], .06, .22, .14); }, // Fusion rare
    TU4: () => { arpege([587, 740, 880, 1175], .06, .26, .14); cloche(1175, .2, .5, .08); }, // Fusion épique
    TU5: () => { arpege([659, 831, 988, 1319], .065, .3, .14); cloche(1319, .25, .9, .13); cloche(1976, .3, .8, .06); }, // Fusion légendaire
    TU6: () => { arpege([523, 659, 784, 1047, 1319, 1568], .055, .4, .13); cloche(1047, .3, 1.1, .12); cloche(1568, .34, 1.1, .1); }, // Fusion mythique
    TU7: () => { arpege([392, 523, 659, 784, 1047, 1319, 1568, 2093], .05, .5, .12); cloche(262, 0, 1.6, .2); cloche(2093, .4, 1.4, .1); cloche(3136, .5, 1.2, .05); }, // Fusion au-delà
    FL1: () => { note(300, 0, .12, { vol: .13, f2: 620 }); bruit(0, .05, 2200, .12, .8, 'highpass'); }, // Battement d’ailes
    FL2: () => { note(988, 0, .07, { type: 'square', vol: .07 }); note(1319, .07, .16, { type: 'square', vol: .07 }); }, // Tuyau franchi
    FL3: () => { bruit(0, .12, 500, .5, 1, 'lowpass'); note(140, 0, .18, { type: 'square', vol: .12, f2: 70 }); }, // Contact tuyau
    FL4: () => { bruit(0, .2, 2400, .35, 1); note(900, 0, .3, { type: 'triangle', vol: .12, f2: 150 }); [1319, 1047, 784, 659, 523, 392].forEach(function (f, i) { note(f, .08 + i * .05, .12, { vol: .08 }); }); }, // Cœur qui éclate
    FL5: () => { note(110, 0, .2, { vol: .28, f2: 55 }); bruit(0, .06, 400, .3, 1, 'lowpass'); }, // Chute au sol
    FL6: () => { note(500, 0, .35, { vol: .08, f2: 1000 }); }, // Palier de vitesse
    CB1: () => { note(330, 0, .07, { type: 'square', vol: .08, f2: 420 }); }, // Rebond raquette
    CB2: () => { note(240, 0, .04, { type: 'square', vol: .05 }); }, // Rebond mur
    CB3: (r) => { var f = [1319, 1175, 1047, 880, 784, 659][r == null ? 2 : r]; note(f, 0, .06, { type: 'square', vol: .07 }); bruit(0, .07, 3500, .35, 1.5, 'highpass'); }, // Carte cassée
    CB4: () => { cloche(520, 0, .25, .16); bruit(0, .04, 1800, .3, 3); }, // Blindée touchée
    CB5: () => { arpege([1175, 1568, 2093], .05, .25, .12); }, // Paillette +15
    CB6: () => { note(440, 0, .5, { type: 'triangle', vol: .15, f2: 110 }); }, // Balle perdue
    CB7: () => { arpege([392, 494, 587, 784], .08, .35, .14); cloche(1175, .3, .8, .09); }, // Niveau suivant
    SN1: () => { note(520, 0, .03, { type: 'square', vol: .05 }); }, // Tourner
    SN2: () => { bruit(0, .05, 1400, .3, 1.5, 'lowpass'); note(392, 0, .08, { type: 'square', vol: .08 }); note(587, .07, .14, { type: 'square', vol: .08 }); }, // Raclette mangée
    SN3: () => { arpege([523, 659, 784], .05, .14, .1, 'square'); }, // Il grandit
    SN4: () => { note(120, 0, .25, { type: 'square', vol: .12, f2: 60 }); bruit(0, .08, 500, .4, 1, 'lowpass'); }, // Mur
    SN5: () => { bruit(0, .06, 2800, .5, 2, 'highpass'); note(260, 0, .25, { type: 'sawtooth', vol: .09, f2: 130 }); }, // Queue mordue
    SN6: () => { note(330, 0, .3, { type: 'triangle', vol: .1, f2: 660 }); }, // Palier de vitesse
    TE1: () => { note(300, 0, .025, { type: 'square', vol: .04 }); }, // Déplacer
    TE2: () => { note(600, 0, .05, { type: 'square', vol: .06, f2: 750 }); }, // Tourner
    TE3: () => { note(170, 0, .08, { type: 'square', vol: .1, f2: 90 }); bruit(0, .03, 800, .2, 1, 'lowpass'); }, // Pose
    TE4: () => { for (var i = 0; i < 3; i++) note(880, i * .09, .05, { type: 'square', vol: .06 }); arpege([523, 659, 784], .07, .2, .13, 'triangle', .3); }, // Ligne effacée
    TE5: () => { for (var i = 0; i < 6; i++) note(i % 2 ? 1047 : 784, i * .09, .05, { type: 'square', vol: .06 }); arpege([523, 659, 784, 1047, 1319], .07, .3, .13, 'triangle', .55); cloche(1047, .55, 1.2, .14); cloche(1568, .62, 1, .08); }, // Tetris, 4 lignes
    TE6: () => { note(900, 0, .12, { vol: .08, f2: 200 }); note(110, .12, .1, { type: 'square', vol: .12, f2: 70 }); bruit(.12, .05, 700, .3, 1, 'lowpass'); }, // Chute d’un coup
    TE7: () => { arpege([440, 554, 659, 880], .06, .2, .1, 'square'); }, // Niveau de vitesse
    IN1: () => { note(1200, 0, .14, { type: 'square', vol: .07, f2: 240 }); }, // Tir
    IN2: () => { bruit(0, .12, 1800, .45, 1.2); note(300, 0, .14, { type: 'square', vol: .08, f2: 90 }); }, // Cornichon touché
    IN3: () => { [98, 87, 82, 73].forEach(function (f, i) { note(f, i * .12, .08, { type: 'square', vol: .05 }); }); }, // Marche des cornichons
    IN4: () => { for (var i = 0; i < 8; i++) note(i % 2 ? 700 : 520, i * .06, .07, { vol: .07 }); }, // Soucoupe qui passe
    IN5: () => { bruit(0, .2, 1500, .4, 1); arpege([784, 1047, 1319, 1568], .06, .3, .13); cloche(1568, .25, .9, .1); }, // Soucoupe touchée
    IN6: () => { bruit(0, .35, 4000, .3, .8, 'highpass'); note(220, 0, .35, { type: 'sawtooth', vol: .09, f2: 80 }); }, // Goutte sur le vaisseau
    IN7: () => { arpege([330, 392, 494, 659, 784], .08, .3, .12, 'square'); }, // Vague suivante
    TA1: () => { note(200, 0, .12, { vol: .14, f2: 420 }); bruit(0, .06, 500, .2, 1, 'lowpass'); }, // Terrier qui s’ouvre
    TA2: () => { bruit(0, .06, 1800, .5, 1); note(180, 0, .12, { type: 'square', vol: .14, f2: 90 }); note(900, .02, .1, { type: 'triangle', vol: .1, f2: 1400 }); }, // Paf !
    TA3: () => { note(160, 0, .3, { type: 'sawtooth', vol: .08, f2: 80 }); bruit(0, .14, 900, .4, 1.5); }, // Cornichon tapé
    TA4: () => { note(500, 0, .2, { vol: .1, f2: 200 }); }, // Membre qui rentre
    TA5: () => { note(440, 0, .1, { type: 'square', vol: .06 }); note(440, .16, .1, { type: 'square', vol: .06 }); note(330, .32, .35, { type: 'square', vol: .07 }); }, // Cinq ratés de suite
    TA6: () => { note(330, 0, .12, { type: 'triangle', vol: .15 }); note(247, .12, .4, { type: 'triangle', vol: .15, f2: 200 }); }, // Cœur perdu
    DO1: () => { bruit(0, .16, 2200, .2, .7); note(300, 0, .14, { vol: .06, f2: 500 }); }, // Changer de voie
    DO2: () => { note(300, 0, .08, { type: 'triangle', vol: .12, f2: 400 }); note(220, .06, .1, { vol: .1, f2: 300 }); cloche(1319, .1, .5, .1); }, // Jerrican
    DO3: () => { note(70, 0, .5, { type: 'sawtooth', vol: .07, f2: 140 }); note(72, 0, .5, { type: 'square', vol: .03, f2: 145 }); }, // Moteur
    DO4: () => { note(440, 0, .3, { type: 'square', vol: .07 }); note(554, 0, .3, { type: 'square', vol: .07 }); }, // Klaxon
    DO5: () => { bruit(0, .5, 600, .7, .7, 'lowpass'); bruit(0, .15, 3500, .4, 1, 'highpass'); note(90, 0, .4, { type: 'sawtooth', vol: .14, f2: 40 }); }, // Accrochage
    DO6: () => { note(260, 0, .5, { type: 'sawtooth', vol: .05, f2: 520 }); }, // Palier de vitesse
  },
  'uno': { // Uno : codes de la maquette validée (UN1 à UN14)
    UN1: () => { bruit(0, .17, 3400, .2, .7, 'highpass'); bruit(.02, .13, 1500, .1, .8); }, // Carte qui glisse
    UN2: () => { bruit(0, .04, 1500, .75, 1.2); note(155, 0, .09, { vol: .26, f2: 72 }); bruit(0, .02, 5200, .2, 1, 'highpass'); }, // Carte sur la table
    UN3: () => { note(112, 0, .13, { vol: .32, f2: 54 }); bruit(0, .06, 700, .75, 1.5); bruit(.05, .03, 2600, .18); }, // Tampon
    UN4: () => { note(300, 0, .24, { type: 'triangle', vol: .11, f2: 840 }); note(840, .24, .28, { type: 'triangle', vol: .11, f2: 280 }); bruit(.02, .46, 2100, .08, .7); }, // Le sens s’inverse
    UN5: () => { note(168, 0, .14, { type: 'triangle', vol: .22, f2: 84 }); bruit(0, .05, 900, .5, 1.4); }, // Coup +N (une fois par carte)
    UN6: () => { for (let i = 0; i < 5; i++) note(1250 + i * 130, i * .045, .03, { type: 'square', vol: .04 }); }, // La roue s’ouvre
    UN7: () => { note(250, 0, .62, { vol: .11, f2: 790 }); bruit(0, .52, 1400, .07, .6); cloche(1047, .38, .6, .07); }, // Onde de couleur
    UN8: () => { bruit(0, .08, 2500, .2, .8, 'highpass'); note(540, .03, .05, { type: 'triangle', vol: .06, f2: 390 }); }, // Carte piochée
    UN9: () => { [523, 784, 1047].forEach((f, i) => { note(f, i * .08, .22, { type: 'sawtooth', vol: .05 }); note(f, i * .08, .3, { type: 'triangle', vol: .13 }); }); cloche(1319, .24, .7, .1); }, // UNO !
    UN10: () => { note(330, 0, .12, { type: 'square', vol: .07 }); note(247, .13, .24, { type: 'square', vol: .07, f2: 196 }); bruit(.13, .04, 1200, .6, 1.2); }, // Contre-UNO
    UN11: () => { arpege([587, 880, 1175], .09, .3); bruit(0, .04, 1500, .4, 1.2); }, // Défi gagné
    UN12: () => { note(294, 0, .2, { type: 'sawtooth', vol: .06, f2: 247 }); note(220, .2, .42, { type: 'sawtooth', vol: .06, f2: 147 }); }, // Défi perdu
    UN13: () => { bruit(0, .05, 1300, .7, 1.2); note(120, 0, .14, { vol: .26, f2: 60 }); arpege([659, 880, 1109, 1319], .07, .34); cloche(1760, .3, .9, .08); }, // Main vide
    UN14: () => { [392, 523, 659].forEach((f, i) => { note(f / 4, i * .42, .16, { type: 'triangle', vol: .2, f2: f / 6 }); note(f, i * .42, .28, { type: 'triangle', vol: .14 }); }); [523, 659, 784, 1047].forEach((f) => { note(f, 1.26, .7, { type: 'triangle', vol: .08 }); }); cloche(1319, 1.26, 1, .09); }, // Podium
  },
  'duels': { // Duels, plateaux et salles : codes de la maquette validée (S01 à S20)
    S01: () => { arpege([523, 659, 784, 1047], .1, .5, .15); cloche(1319, .42, 1, .11); }, // Victoire de plateau
    S02: () => { note(392, 0, .32, { type: 'triangle', vol: .13 }); note(311, .26, .7, { type: 'triangle', vol: .13, f2: 294 }); }, // Défaite de plateau
    S03: () => { [523, 659, 880].forEach((f, i) => cloche(f, i * .26, .7, .12)); }, // Podium
    S04: () => { cloche(659, 0, 1.1, .14); }, // Fin neutre
    S05: () => { [0, .12, .24].forEach((t) => { bruit(t, .05, 2500, .5, 1.4); note(1200, t, .06, { type: 'triangle', vol: .06 }); }); }, // Accent Blackjack
    S06: () => { [0, .1, .2, .3].forEach((t) => { bruit(t, .05, 2500, .5, 1.4); note(1200, t, .06, { type: 'triangle', vol: .06 }); }); }, // Accent Poker
    S07: () => { note(784, 0, .25, { type: 'triangle', vol: .14 }); note(1047, .18, .4, { type: 'triangle', vol: .14 }); }, // Accent Catan
    S08: () => { arpege([659, 784, 1047], .1, .45, .16); }, // Accent Pictionary
    S09: () => { bruit(0, .25, 1800, .12, .7); note(523, .03, .16, { type: 'triangle', vol: .13 }); note(659, .17, .4, { type: 'triangle', vol: .13 }); }, // Abandon adverse
    S10: () => { note(330, 0, .4, { vol: .1, f2: 247 }); }, // J’abandonne
    S11: () => { cloche(392, 0, .9, .12); note(294, .3, .6, { type: 'triangle', vol: .1 }); }, // Forfait
    S12: () => { note(880, 0, .08, { type: 'square', vol: .05 }); note(660, .1, .16, { type: 'square', vol: .05 }); }, // Temps écoulé
    S13: () => { note(523, 0, .2, { type: 'triangle', vol: .1 }); note(440, .2, .4, { type: 'triangle', vol: .1 }); }, // Défi sans réponse
    S14: () => { bruit(0, .018, 3200, .18, 2.5, 'highpass'); note(1250, 0, .04, { type: 'square', vol: .035 }); }, // Tic d’alerte
    S15: () => { note(1250, 0, .05, { type: 'square', vol: .05 }); note(1568, .06, .1, { type: 'square', vol: .05 }); }, // Dernier tic
    S16: () => { [392, 330, 262].forEach((f, i) => note(f, i * .2, .45, { type: 'triangle', vol: .12 })); }, // Défaite de duel
    S17: () => { note(600, 0, .12, { type: 'square', vol: .07 }); note(600, .18, .12, { type: 'square', vol: .07 }); }, // Nulle
    S18: () => { bruit(0, .05, 2600, .25, 1.5); note(660, .02, .08, { type: 'triangle', vol: .1 }); note(880, .08, .14, { type: 'triangle', vol: .1 }); }, // Joueur rejoint
    S19: () => { cloche(784, 0, .7, .1); cloche(1175, .12, .6, .07); }, // Tout le monde prêt
    S20: () => { arpege([523, 659, 784, 1047], .07, .22, .07, 'square'); cloche(1568, .3, .9, .1); }, // Départ
  },
};
/** Noms des sons (pour les réglages et la documentation). */
export const SONS_JEUX = {
 "loup-garou": {
  "1": "La nuit tombe",
  "2": "Le jour se lève",
  "3": "Mort à l’aube",
  "4": "Vote (jeton posé)",
  "5": "Carte retournée",
  "6": "Hurlement lointain"
 },
 "morpion": {
  "1": "Marque posée (craie)",
  "2": "Victoire",
  "3": "Défaite",
  "4": "Égalité",
  "5": "Marque posée (bois)"
 },
 "nom-de-code": {
  "1": "Indice donné",
  "2": "Carte de l’équipe",
  "3": "Carte passante",
  "4": "Assassin",
  "5": "Victoire"
 },
 "blackjack": {
  "1": "Cartes distribuées",
  "2": "Carte retournée",
  "3": "Jetons",
  "4": "Gain",
  "5": "Banque saute"
 },
 "poker": {
  "1": "Carte posée sur le tapis",
  "2": "Jetons vers le pot",
  "3": "Parole (check)",
  "4": "Pot gagné",
  "5": "Tapis (all-in)"
 },
 "catan": {
  "1": "Dés qui roulent",
  "2": "Ressources reçues",
  "3": "Route ou colonie posée",
  "4": "Point gagné",
  "5": "Voleur"
 },
 "pictionary": {
  "1": "Trait de crayon",
  "2": "Lettre dévoilée",
  "3": "Trouvé !",
  "4": "Temps écoulé",
  "5": "Mot choisi"
 },
 "puissance-4": {
  "1": "Jeton qui tombe",
  "2": "Colonne choisie",
  "3": "Victoire",
  "4": "Ligne alignée",
  "5": "Fin de duel"
 },
 "othello": {
  "1": "Pion posé",
  "2": "Pion retourné",
  "3": "Compte qui change",
  "4": "Fin de partie"
 },
 "dames": {
  "1": "Pièce prise",
  "2": "Glissement",
  "3": "Sélection",
  "4": "Fin de partie"
 },
 "echecs": {
  "1": "Pièce prise",
  "2": "Pièce posée (bois)",
  "3": "Échec (gong grave)",
  "4": "Échec et mat",
  "5": "Nulle"
 },
 "bataille-navale": {
  "1": "Plouf (à l’eau)",
  "2": "Touché (explosion)",
  "3": "Coulé (fond de mer)",
  "4": "Tir reçu (sonar)",
  "5": "Victoire"
 },
 "mastermind": {
  "1": "Indice bien placé",
  "2": "Indice mal placé",
  "3": "Pion posé",
  "4": "Code percé",
  "5": "Le robot perce ton code"
 },
 "qui-est-ce": {
  "1": "Portrait baissé",
  "2": "Réponse « oui »",
  "3": "Réponse « non »",
  "4": "Question posée",
  "5": "Personnage trouvé"
 },
 "pierre-feuille-ciseaux": {
  "1": "Compte à trois",
  "2": "Révélation des mains",
  "3": "Lancer gagné",
  "4": "Égalité, on relance",
  "5": "Duel gagné"
 },
 "cluedo": {
  "1": "Pas sur le plateau",
  "2": "Carte montrée",
  "3": "Hypothèse posée",
  "4": "Solution révélée",
  "5": "Éliminé"
 },
 "destins": {
  "1": "Pas sur la case",
  "2": "Roulette",
  "3": "Résultat de la roue",
  "4": "Carte Événement",
  "5": "Victoire"
 },
 "monopoly": {
  "1": "Dés qui roulent",
  "2": "Pion posé",
  "3": "Billets",
  "4": "Prison",
  "5": "Victoire"
 },
 "risk": {
  "1": "Troupe posée",
  "2": "Dés qui roulent",
  "3": "Choc de bataille",
  "4": "Territoire conquis",
  "5": "Victoire du monde"
 },
 "shadow-hunters": {
  "1": "Dés (d6 + d4)",
  "2": "Vision révélée",
  "3": "Blessure",
  "4": "Attaque ratée",
  "5": "Victoire"
 },
 "quotidien": {
  "F1": "Parfait (10 points)",
  "F2": "Trouvé",
  "F3": "Trouvé juste à temps",
  "F4": "Raté",
  "F5": "Paillettes qui défilent",
  "G1": "Lettre bien placée",
  "G2": "Lettre mal placée",
  "G3": "Lettre absente",
  "G4": "Refusé",
  "D1": "Essai raté",
  "D2": "Passer",
  "D3": "Indice dévoilé",
  "D4": "Image dévoilée",
  "C1": "Tuile choisie",
  "C2": "Groupe trouvé",
  "C3": "À un mot près",
  "C4": "Erreur",
  "M1": "Lettre allumée",
  "M2": "Mot trouvé",
  "M3": "Bloc complet",
  "P1": "Épingle posée",
  "P2": "Trajet tracé",
  "P3": "Score qui défile",
  "Q1": "Bonne réponse",
  "Q2": "Mauvaise réponse"
 },
 "flash": {
  "SO1": "Compte",
  "SO2": "Go !",
  "SO3": "Pause",
  "SO4": "Reprise",
  "SO5": "Fin de partie",
  "SO6": "Nouveau record",
  "SO7": "Titre",
  "PA1": "Prise",
  "PA2": "Tombée au sol",
  "PA3": "Fausse paillette",
  "PA4": "Grêlon",
  "PA5": "Cœur perdu",
  "PA6": "Palier de vitesse",
  "RA1": "Fromage attrapé",
  "RA2": "Fromage qui fond",
  "RA3": "Cornichon",
  "RA4": "Cœur perdu",
  "RA5": "Tranche au sol",
  "RA6": "Poêlon qui grésille",
  "DE1": "Case ouverte",
  "DE2": "Ouverture en vague",
  "DE3": "Drapeau posé",
  "DE4": "Drapeau retiré",
  "DE5": "Accord des voisines",
  "DE6": "Cœur qui explose",
  "DE7": "Victoire",
  "TU1": "Glissement",
  "TU2": "Fusion peu commune",
  "TU3": "Fusion rare",
  "TU4": "Fusion épique",
  "TU5": "Fusion légendaire",
  "TU6": "Fusion mythique",
  "TU7": "Fusion au-delà",
  "FL1": "Battement d’ailes",
  "FL2": "Tuyau franchi",
  "FL3": "Contact tuyau",
  "FL4": "Cœur qui éclate",
  "FL5": "Chute au sol",
  "FL6": "Palier de vitesse",
  "CB1": "Rebond raquette",
  "CB2": "Rebond mur",
  "CB3": "Carte cassée",
  "CB4": "Blindée touchée",
  "CB5": "Paillette +15",
  "CB6": "Balle perdue",
  "CB7": "Niveau suivant",
  "SN1": "Tourner",
  "SN2": "Raclette mangée",
  "SN3": "Il grandit",
  "SN4": "Mur",
  "SN5": "Queue mordue",
  "SN6": "Palier de vitesse",
  "TE1": "Déplacer",
  "TE2": "Tourner",
  "TE3": "Pose",
  "TE4": "Ligne effacée",
  "TE5": "Tetris, 4 lignes",
  "TE6": "Chute d’un coup",
  "TE7": "Niveau de vitesse",
  "IN1": "Tir",
  "IN2": "Cornichon touché",
  "IN3": "Marche des cornichons",
  "IN4": "Soucoupe qui passe",
  "IN5": "Soucoupe touchée",
  "IN6": "Goutte sur le vaisseau",
  "IN7": "Vague suivante",
  "TA1": "Terrier qui s’ouvre",
  "TA2": "Paf !",
  "TA3": "Cornichon tapé",
  "TA4": "Membre qui rentre",
  "TA5": "Cinq ratés de suite",
  "TA6": "Cœur perdu",
  "DO1": "Changer de voie",
  "DO2": "Jerrican",
  "DO3": "Moteur",
  "DO4": "Klaxon",
  "DO5": "Accrochage",
  "DO6": "Palier de vitesse"
 },
 "uno": {
  "UN1": "Carte qui glisse",
  "UN2": "Carte sur la table",
  "UN3": "Tampon",
  "UN4": "Le sens s’inverse",
  "UN5": "Coup +N",
  "UN6": "La roue s’ouvre",
  "UN7": "Onde de couleur",
  "UN8": "Carte piochée",
  "UN9": "UNO !",
  "UN10": "Contre-UNO",
  "UN11": "Défi gagné",
  "UN12": "Défi perdu",
  "UN13": "Main vide",
  "UN14": "Podium"
 },
 "duels": {
  "S01": "Victoire de plateau",
  "S02": "Défaite de plateau",
  "S03": "Podium",
  "S04": "Fin neutre",
  "S05": "Accent Blackjack",
  "S06": "Accent Poker",
  "S07": "Accent Catan",
  "S08": "Accent Pictionary",
  "S09": "Abandon adverse",
  "S10": "J’abandonne",
  "S11": "Forfait",
  "S12": "Temps écoulé",
  "S13": "Défi sans réponse",
  "S14": "Tic d’alerte",
  "S15": "Dernier tic",
  "S16": "Défaite de duel",
  "S17": "Nulle",
  "S18": "Joueur rejoint",
  "S19": "Tout le monde prêt",
  "S20": "Départ"
 }
};

/** À appeler sur un geste de l'utilisateur : crée ou relance le contexte audio (iOS ne le relance que pendant un geste). */
export function reveillerSons() {
  if (!prefs().on) return;
  try { ctx(); } catch (e) { console.warn('[son]', e); }
}

/** Vrai si le contexte audio tourne : un son joué sinon resterait en attente, puis partirait avec tous les autres. */
export const sonsPrets = () => A?.state === 'running';

/**
 * Joue un son de jeu. Ne lève jamais d'erreur.
 * @param {string} jeu identifiant du jeu (clé de SONS_JEUX)
 * @param {number|string} n numéro ou code du son
 * @param {*} [x] réglage propre au son (ex. rangée de la carte cassée)
 */
export function jouerSonJeu(jeu, n, x) {
  const f = SONS[jeu]?.[n]; const p = prefs();
  if (!f || !p.on || p.volume <= 0) return;
  const k = jeu + n; const t = performance.now(); if (t - (dernier[k] || 0) < 60) return; dernier[k] = t;
  try { if (!ctx()) return; M.gain.setValueAtTime(p.volume * p.volume, A.currentTime); f(x); } catch (e) { console.warn('[son]', e); }
}
