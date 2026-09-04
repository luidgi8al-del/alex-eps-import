# Envoi automatique des absences AS

1. Executer `schema_as_absence_emails.sql` dans le SQL Editor Supabase.
2. Dans Resend, verifier le domaine professionnel `citescolairehugorenoir.org` avec les enregistrements DNS demandes. Une adresse d'un domaine non verifie ne peut pas etre utilisee comme expediteur.
3. Dans Supabase > Edge Functions > Secrets, ajouter :
   - `RESEND_API_KEY` : cle API Resend ;
   - `EPS_EMAIL_FROM` : `EPS LVH <louita@citescolairehugorenoir.org>` ;
   - `EPS_EMAIL_REPLY_TO` : `louita@citescolairehugorenoir.org` ;
   - `EPS_TIME_ZONE` : `Africa/Casablanca`.
4. Deployer `supabase/functions/eps-as-absence-email/index.ts` sous le nom `eps-as-absence-email`, verification JWT activee.
5. Faire un appel d'essai avec une adresse parent controlee. Le bouton de validation enregistre d'abord l'appel puis demande a la fonction d'envoyer les messages en attente.

La cle Resend et la cle service Supabase ne doivent jamais etre placees dans le site, l'application Android ou GitHub.
