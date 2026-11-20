# Bilan 3 × 500 m : bouton de validation désactivé

Une différence de difficulté ou un passage course/marche chez un seul élève bloquait l'enregistrement du bilan entier. Le motif se trouvait au-dessus de la longue liste des élèves.

La vérification apparaît désormais près du bouton et nomme les élèves concernés. Le professeur peut retirer les séances non comparables ou confirmer explicitement les notes affichées sans bonus/malus d'évolution pour ces élèves. Le calcul des autres élèves, les séances d'origine, les malus d'incomplétude et les justifications ne changent pas. La confirmation est réinitialisée si la sélection ou les réglages changent ; sa portée figure dans le libellé du critère enregistré.

Une saisie invalide explique maintenant le blocage près du bouton et révèle le champ concerné, même dans un détail replié. Aucun enregistrement ne démarre avant correction.

Site et PWA uniquement, sans SQL supplémentaire. Tests à 1280, 390 et 320 px : reproduction du blocage, confirmation, notes enregistrées, contrôle /20, nouvelle confirmation après changement de méthode, refus d'une note de 21, reprise après interruption sans doublon.
