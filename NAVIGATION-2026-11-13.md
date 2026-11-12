# Bouton Retour du téléphone — site et PWA

Les changements de rubrique ajoutent maintenant une entrée dans l’historique du navigateur, au lieu de remplacer systématiquement l’entrée courante. Le bouton Retour Android, le geste Retour et le bouton Retour du navigateur utilisent ainsi la même navigation.

L’ouverture d’un outil ajoute une étape. Reprendre un travail depuis l’accueil revient directement à l’accueil ; ouvrir un outil depuis une activité revient à cette liste. Les activités et favoris des outils ont aussi leur historique. Les listes précédentes et leur position de défilement sont conservées lorsqu’elles sont encore présentes en mémoire.

Un outil sans modification ne demande pas de confirmation. Pour une saisie modifiée, Retour propose d’annuler le départ ; le tableau reste alors en place avec ses valeurs. Un retour confirmé utilise la capture de brouillon existante du 3×500. Cette capture ne remplace pas l’enregistrement explicite pour tous les outils. Les notes et les élèves ne sont pas stockés dans l’historique de navigation.

Vérifications sur navigateur en 390 et 1440 px : reprise depuis l’accueil, outil depuis Athlétisme, retour entre catégories et rubriques, départ annulé avec saisie conservée, départ confirmé avec brouillon récupérable. Régressions vérifiées : accueil compact, reprise et groupes du 3×500, réglages, et vrai cache PWA après coupure réseau. Aucun téléphone physique n’a été utilisé.

Version PWA : `eps-lvh-pwa-2026-11-13-back-116`. Aucun SQL ni nouvel APK natif n’est nécessaire.
