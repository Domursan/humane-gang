#!/bin/bash
# Connexion : voir tests/bancs/pg-env.sh (serveur local par défaut, ou PGHOST/PGPORT/PGPASSWORD).
. "$(dirname "$0")/../pg-env.sh"
# Recrée la base de test « uno » : environnement simulé (mock du Loup-Garou) + migrations 121, 171 et 211 (avec hg__patch, patch.sql) + outils de test.
D=$(dirname "$0")
P="psql -v ON_ERROR_STOP=1 -q"
bash $D/../loup-garou/start.sh
$P -c "drop database if exists uno" -c "create database uno" 2>&1 | grep -v NOTICE
$P -d uno -f $D/../loup-garou/mock.sql 2>&1 | grep -E "ERROR"
$P -d uno -f $D/../../../supabase/migrations/121_uno.sql 2>&1 | grep -E "ERROR"
$P -d uno -f $D/../../../supabase/migrations/171_uno_jouabilite.sql 2>&1 | grep -E "ERROR"
$P -d uno -f $D/patch.sql 2>&1 | grep -E "ERROR"
$P -d uno -f $D/../../../supabase/migrations/211_uno_robot_remplacant.sql 2>&1 | grep -E "ERROR"
# Spectateurs (migration 214, t5_spectateurs.sql) : elle touche aussi les plateaux, dont les tables viennent de la 125.
$P -d uno -f $D/../../../supabase/migrations/125_plateaux.sql 2>&1 | grep -E "ERROR"
$P -d uno -f $D/../../../supabase/migrations/214_spectateurs.sql 2>&1 | grep -E "ERROR"
$P -d uno -f $D/helpers.sql 2>&1 | grep -E "ERROR"
echo "base uno prête"
