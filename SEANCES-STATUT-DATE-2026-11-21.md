# Site et PWA : fin de séance et date

Dans Classe → Évaluations / Tests → ••• :

- **Marquer comme terminée**, même si certains élèves n'ont pas de note. Le compteur réel reste affiché et aucune note n'est créée ou modifiée.
- **Remettre dans À reprendre** pour poursuivre une séance déjà terminée.
- **Modifier la date** pour attribuer une date antérieure à un test ou à une évaluation. L'heure d'origine est conservée. Cette date sert au tri et à la chronologie du bilan 3 × 500 m.

Le filtre Terminées complète les filtres existants. Une évaluation finale reste dans Finales indépendamment de son statut d'avancement.

Le statut utilise une ligne réservée `assessment-status` dans la table existante `eps_saved_tool_works`, masquée des bibliothèques d'outils. Les dates modifient les champs existants, sans migration SQL. Chaque compte conserve ses propres statuts. Les commandes passent par l'enregistrement local et la file de synchronisation habituels lorsque le mode hors connexion est préparé.

Portée : site ordinateur, site mobile et PWA. L'APK native n'a pas été modifiée dans cette livraison.

Vérifications : menus sur 1280 et 390 px, fin/réouverture, notes inchangées, date de test standard et de travail portable, date invalide et échec d'enregistrement, séparation des comptes. PWA : sauvegarde effective de la date et du statut réseau coupé, file d'attente, rechargement et récupération du statut.
