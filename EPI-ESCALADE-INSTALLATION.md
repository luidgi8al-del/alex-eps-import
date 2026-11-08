# Fiches EPI escalade et QR codes

1. Dans le projet Supabase EPS LVH, ouvrir **SQL Editor → New query**.
2. Copier **tout** le fichier `supabase/migrations/20261108090000_epi_inventory_qr.sql` et l’exécuter.
3. Sur le site : **Équipement → EPI escalade → Préparer les fiches**. Dans l’APK 1.3.44 : **Équipement → EPI escalade → Préparer les 90 fiches**.

Cette préparation complète les familles jusqu’à 20 baudriers, 20 descendeurs, 20 mousquetons et 30 casques. Les fiches existantes et leurs contrôles sont conservés. Les anciennes fiches supprimées ne sont pas recréées. Répéter la préparation ne crée pas de doublons. Le nombre de cordes est libre.

Les nouvelles fiches se trouvent dans **Inactifs**. Ouvrir une fiche, renseigner ses caractéristiques et ses contrôles, puis activer son affichage dans la grille. Une activation ne valide jamais la conformité.

- Vert : en service, contrôle renseigné, prochaine échéance à plus de 30 jours et aucun commentaire de surveillance.
- Orange : à contrôler, observation notée, contrôle non renseigné, échéance dépassée ou dans les 30 prochains jours.
- Rouge : quarantaine, réforme ou fin de vie atteinte. Retirer l’équipement du service.

Chaque fiche contient son QR code et le téléchargement de son étiquette. Le site propose le PNG individuel et une planche HTML imprimable en PDF pour une famille ou tout l’inventaire. L’APK propose l’étiquette PDF individuelle à enregistrer, partager ou imprimer.

Le lien utilise l’identifiant technique permanent de la fiche, jamais son nom ni l’identifiant local du téléphone. Renommer une fiche ou modifier un contrôle ne change pas son QR. Les anciens codes internes déjà imprimés restent reconnus par le scanner de l’APK.

Un scan avec la caméra ouvre le site et demande la connexion si nécessaire avant d’afficher la fiche. Le scanner intégré à l’APK ouvre la fiche native disponible dans la copie locale. Un compte d’un autre établissement ne reçoit pas les données de la fiche. Hors connexion, la fiche doit déjà être disponible dans la copie locale du compte.

La migration est préparée dans le dépôt ; elle n’est pas exécutée automatiquement sur le projet Supabase.
