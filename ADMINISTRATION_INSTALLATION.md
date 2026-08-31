# Administration des professeurs EPS

L’application Android et le site utilisent la même administration sécurisée. L’administrateur est exclusivement le compte qui a créé l’établissement dans `institutions.created_by` ; connaître le code établissement ne donne jamais ce droit.

## Installation Supabase

1. Faire une sauvegarde de la base.
2. Exécuter `schema_team_administration_1.sql`, puis `schema_team_administration_2.sql` dans l’éditeur SQL Supabase.
3. Déployer le dossier `supabase/functions/eps-team-admin` comme Edge Function nommée `eps-team-admin`, avec la vérification JWT activée.
4. Définir `EPS_WEB_ORIGIN` avec l’origine exacte du site, sans barre finale, et `EPS_PASSWORD_REDIRECT_URL` avec une page du même site.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux Edge Functions Supabase. La clé de service ne doit jamais être copiée dans GitHub, le site ou l’application Android.

## Comportement

- Invitation : le professeur reçoit un lien et choisit son propre mot de passe.
- Renvoi : l’administrateur envoie un nouveau lien sans voir ni connaître le mot de passe.
- Suppression : le compte est bloqué avant le nettoyage ; même un jeton encore valide ne peut plus écrire.
- Les données pédagogiques et les créneaux personnels sont supprimés avec le compte.
- Les groupes et appels AS historiques sont conservés, verrouillés et réattribués à l’administrateur.
- Une ancienne copie locale ne peut plus être renvoyée au serveur.
