# Santé : conserver la saisie de dispense pendant la synchronisation

Le rafraîchissement automatique appelait `chargerSante`, qui remplaçait immédiatement le contenu par « Chargement », puis recréait les champs avec leurs valeurs initiales. Les dates, le motif et les autres saisies disparaissaient, alors que l'élève restait sélectionné.

Lors d'une synchronisation, les listes de données sont actualisées en arrière-plan et le formulaire de dispense déjà ouvert conserve ses éléments, ses valeurs, sa photo et son focus. Les navigations explicites continuent à ouvrir la vue demandée. Un changement de compte efface la sélection et la photo ; les lectures retardées d'un ancien chargement ne remplacent plus les données courantes. Aucun brouillon médical supplémentaire n'est écrit dans le stockage du navigateur.

Tests navigateur 1280 et 390 px : reproduction préalable de la perte, conservation des dates, motif, précision, aptitude, activité adaptée, photo et case infirmerie ; saisie pendant une lecture retardée ; vérification des données réellement enregistrées ; nouvelle saisie vide ; changement de compte et accès aux listes. Les tests d'identité partagée et d'affichage du sport adapté passent également.

Portée : site et PWA. Aucun SQL ni modification de l'APK native.
