# Extension PRONOTE 0.2.2 : noms dans une colonne fixe séparée

Le rapprochement cherchait les noms exclusivement dans le bloc des notes. Un tableau dont la colonne fixe des noms se trouve dans un autre panneau du même composant produisait « Élève introuvable ou ambigu », même avec un nom affiché. Les anciennes copies de noms masquées pouvaient également créer de fausses ambiguïtés.

La recherche utilise désormais le texte visible des en-têtes des lignes, dans les panneaux visibles appartenant exactement au même composant PRONOTE. Les identifiants de ligne doivent toujours désigner une cellule unique dans la colonne choisie. Une autre grille, un homonyme visible ou une cellule non modifiable bloque toujours le transfert. Aucun rapprochement approximatif ni sélection du premier homonyme.

Tests sur tableaux fictifs : colonne fixe séparée, en-têtes masqués, doublon visible, noms manquants/modifiés, notes existantes, changement de cellule, devoir et service, conversion de barème et confirmation avant écriture. Aucune écriture effectuée sur le PRONOTE réel pour cette correction.

La capture utilisateur montre aussi des libellés différents entre la classe EPS et le groupe PRONOTE. La reconnaissance automatique ne considère pas ces libellés comme équivalents. Le secours manuel reste disponible : choisir une case de note du devoir, vérifier le groupe et le barème, puis consulter l'aperçu avant confirmation.

Installation : télécharger `extensions/pronote-lvh-0.2.2.zip`, décompresser, charger ce dossier via Chrome → Extensions → Mode développeur → Charger l'extension non empaquetée, ou remplacer les fichiers dans le dossier existant puis recharger son extension. Actualiser PRONOTE après avoir conservé les éventuelles saisies en cours. Le panneau doit indiquer 0.2.2.

Portée de cette livraison : extension Chrome. Le pont embarqué de l'APK n'a pas été reconstruit dans cette livraison.
