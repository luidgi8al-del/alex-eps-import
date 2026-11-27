# Extension 0.2.3 : transférer les élèves reconnus sans bloquer toute la classe

Les élèves absents du tableau, homonymes, cellules non reconnues et annotations non prises en charge sont signalés individuellement dans l'aperçu comme « Ignorée », avec un motif. Les homonymes du transfert EPS sont tous ignorés. Une cellule partagée par plusieurs correspondances n'est attribuée à personne. Les lignes initialement ignorées restent exclues même si leur correspondance réapparaît après confirmation.

Après confirmation, seules les cellules vides reconnues sont remplies. Une note déjà présente ou changée depuis l'aperçu est conservée ; la ligne est signalée et les autres continuent. Le bilan indique les notes saisies et les élèves à vérifier. Après le test d'une seule note, le transfert des autres lignes reconnues reste disponible. Si aucune ligne n'est transférable, les boutons restent désactivés.

Un changement global de classe/groupe, service, période, devoir ou barème arrête le transfert. Une tentative d'écriture dont l'affichage n'est pas confirmé arrête également l'opération : l'état de cette case doit être vérifié avant toute nouvelle tentative.

La sélection manuelle d'un devoir autorise des libellés EPS/PRONOTE différents, par exemple un groupe EPS nommé d'après le jour. Le service EPS et les métadonnées du devoir restent reconnus et figés, et l'utilisateur doit confirmer le groupe, le devoir et le barème. La recherche automatique conserve son rapprochement strict des libellés. La navigation automatique cesse dès qu'une sélection manuelle est commencée.

Tests sur des tableaux fictifs : reconnaissance exacte, noms dans un panneau fixe, élève introuvable, homonyme PRONOTE, homonyme EPS, annotation non reconnue, absence de toute correspondance, note existante ou modifiée, test d'une note et poursuite, groupe manuel avec libellé différent, changement de groupe/devoir/service et refus d'un enregistrement non confirmé. Aucune note envoyée dans le PRONOTE réel pendant cette livraison.

Installation : décompresser `extensions/pronote-lvh-0.2.3.zip` dans le dossier de l'extension, recharger celle-ci dans Chrome, puis actualiser PRONOTE après avoir conservé les saisies en cours. La mise à jour du site ne recharge pas une extension déjà installée. Cette livraison concerne l'extension Chrome ; l'APK n'a pas été reconstruite.
