#!/bin/bash
# Connexion : voir tests/bancs/pg-env.sh (serveur local par défaut, ou PGHOST/PGPORT/PGPASSWORD).
. "$(dirname "$0")/../pg-env.sh"
# Recrée la base de test « plat » (ou celle donnée en argument) : environnement simulé + socle 125 + moteurs des jeux de plateau + outils de test.
D=$(dirname "$0")
B=${1:-plat}
P="psql -v ON_ERROR_STOP=1 -q"
bash $D/../loup-garou/start.sh >/dev/null
$P -c "drop database if exists $B" -c "create database $B" 2>&1 | grep -v NOTICE
$P -d $B -f $D/../loup-garou/mock.sql 2>&1 | grep -E "ERROR"
for f in $D/../../../supabase/migrations/12[5-9]_*.sql $D/../../../supabase/migrations/130_*.sql; do
  [ -f "$f" ] && $P -d $B -f "$f" 2>&1 | grep -E "ERROR|LINE|^\s+\^"
done
# Robots, socle des nouveaux jeux, Blackjack, Poker, Catan, Pictionary, puis fermeture de leurs fonctions internes
# (165 et 166 : sans elles, le banc t_socle échoue sur « fonctions internes fermées », faille S0). Sans ON_ERROR_STOP : les
# tables des autres jeux n'existent pas dans la base de test ; seules comptent les fonctions des plateaux.
for m in 131_plateaux_robots 136_nouveaux_jeux_socle 137_nj_devine 140_nj_grilles 141_duels_nouveaux 143_plateaux_cartes 144_catan 145_pictionary 165_plateaux_droits 166_plateaux_droits_internes; do
  psql -d $B -X -q -f $D/../../../supabase/migrations/$m.sql >/dev/null 2>&1
done
# Corrections de règles (Blackjack, Pictionary, Monopoly) relevées par l'audit de jouabilité.
$P -d $B -f $D/../../../supabase/migrations/172_jeux_regles_audit.sql 2>&1 | grep -E "ERROR|LINE"
# Activité humaine, fermeture des tables vides, plus de partie quittée dans Mes parties (migration 197).
$P -d $B -f $D/../../../supabase/migrations/197_jeux_mes_parties.sql 2>&1 | grep -E "ERROR|LINE"
# Quitter une partie est définitif (migration 198).
$P -d $B -f $D/../../../supabase/migrations/198_quitter_plateaux.sql 2>&1 | grep -E "ERROR|LINE"
# Spectateurs (migration 214, banc t_spectateurs.sql) : elle touche aussi le Uno, chargé avant elle (121, 171, 211 avec hg__patch).
for f in 121_uno 171_uno_jouabilite; do $P -d $B -f $D/../../../supabase/migrations/$f.sql 2>&1 | grep -E "ERROR|LINE"; done
$P -d $B -f $D/../uno/patch.sql 2>&1 | grep -E "ERROR"
for f in 211_uno_robot_remplacant 214_spectateurs; do $P -d $B -f $D/../../../supabase/migrations/$f.sql 2>&1 | grep -E "ERROR|LINE"; done
$P -d $B -f $D/helpers.sql 2>&1 | grep -E "ERROR"
# Robot de test du Risk (fonction t_rk_tour, utilisée par s3) : seulement sa définition (lignes 1 à 38 de t_risk.sql),
# pas les simulations de t_risk.sql, qui durent plusieurs minutes.
sed -n '1,38p' $D/t_risk.sql | $P -d $B 2>&1 | grep -E "ERROR|LINE"
echo "base $B prête"
