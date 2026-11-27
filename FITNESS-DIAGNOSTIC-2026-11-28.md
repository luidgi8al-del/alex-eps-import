# Vérification des séances de condition physique

Le signalement concerne une séance du 21 septembre dont plusieurs mesures ne sont plus visibles. La cause réelle n'est pas encore établie : aucune lecture de la base du compte de l'utilisateur ni restauration n'a été effectuée pendant le développement.

Une séance enregistrée affiche désormais sa date et un bouton « Vérifier les résultats enregistrés ». Ce contrôle lit la séance et ses résultats sur le serveur, y compris les lignes marquées supprimées. Il compare les nombres de lignes et de fiches complètes avec la copie chargée, signale les identifiants d'élèves sans correspondance et les contenus illisibles. Il ne modifie ni les saisies en cours, ni la base, ni les anciennes lignes.

Le diagnostic téléchargeable contient uniquement des compteurs, des dates, l'identifiant de séance et les indicateurs de présence/suppression. Aucun nom, aucune mesure individuelle et aucune note ne sont exportés. Le bouton nécessite une connexion au serveur. Aucune migration SQL nécessaire.

Le contrôle permet notamment d'examiner une faiblesse existante : à l'ouverture, le recours direct au serveur n'intervient que lorsque la copie locale ne contient aucune ligne, et non lorsqu'elle en contient seulement une partie. Cette observation ne prouve pas qu'elle explique le cas signalé.

Protection complémentaire : l'enregistrement d'une séance dont des lignes chargées sont illisibles est bloqué pour éviter de les remplacer par des valeurs vides. Le codage conserve aussi les zéros numériques.

Validation avec données fictives : barèmes et codage, contrôle sur ordinateur et mobile, copie locale partielle, mesures présentes sur le serveur, anciennes lignes supprimées, identifiants différents, conservation de la saisie en cours, diagnostic sans notes ni noms, absence d'écriture et blocage de l'enregistrement d'un contenu illisible. La présence effective des résultats du compte réel reste à vérifier avec le diagnostic.
