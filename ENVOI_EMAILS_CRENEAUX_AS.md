# E-mails des créneaux AS

La fonction `eps-as-slot-email` envoie les messages depuis le serveur. Les clés Resend ne sont jamais placées dans le site.

## Configuration

1. Conserver les secrets déjà utilisés par `eps-as-absence-email` : `RESEND_API_KEY`, `EPS_EMAIL_FROM`, `EPS_EMAIL_REPLY_TO` et `EPS_WEB_ORIGIN`.
2. Déployer `supabase/functions/eps-as-slot-email/index.ts` avec la vérification JWT active.
3. Tester d’abord un créneau contenant uniquement des adresses contrôlées.

La fonction vérifie que le compte connecté est bien le professeur affecté au créneau. Elle relit les inscriptions et les adresses dans Supabase, limite les pièces jointes à 3 Mo et envoie chaque message séparément. Une relance avec le même identifiant ne duplique pas les messages acceptés par Resend.
