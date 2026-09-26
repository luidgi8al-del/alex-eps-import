# Utilisation sans connexion

La préparation démarre automatiquement après connexion au compte. Elle reprend après une coupure réseau, avec des tentatives espacées en cas d'échec, sans télécharger à nouveau les ressources déjà présentes pour cette version. Elle est propre à l'appareil, au navigateur et au compte utilisés. Garder Internet le temps du premier téléchargement.

Dans Réglage, un voyant discret à droite de « Utiliser sans connexion » devient vert quand l'appareil est prêt. Celui de « Compte web / synchronisation » devient vert quand la synchronisation est à jour. Un voyant en attente n'affirme pas que la copie est prête. Seule une erreur ou un conflit déclenche une notification invitant à ouvrir les réglages et la rubrique concernée. Le bouton secondaire « Vérifier / relancer » reste disponible dans l'accordéon hors connexion.

Le cache du service worker contient uniquement des ressources publiques. Les données autorisées par le serveur sont conservées dans la base IndexedDB du compte. Les tables raccordées couvrent notamment classes, élèves, planning, cycles, évaluations, AS, santé et équipement. Les écritures passant par le moteur local restent en attente puis sont synchronisées au retour du réseau. Les conflits doivent être tranchés avant une confirmation de préparation complète.

Ce n'est pas une équivalence complète avec Room/Android : les écrans non raccordés, certaines vues complexes, les ressources externes, l'administration et les envois d'e-mails nécessitent Internet. Aucun e-mail n'est envoyé par la préparation. Les données déjà synchronisées restent au serveur. La déconnexion efface les copies locales non chiffrées pour protéger les élèves sur un ordinateur partagé, mais elle est refusée s'il reste une écriture à envoyer ou un conflit à régler. Utiliser un appareil personnel protégé et ne pas confondre cache local et sauvegarde.

Les inscriptions publiques sont retirées de l'interface. Il faut aussi désactiver « Allow new users to sign up » dans Supabase ; les invitations administrateur et la connexion des comptes existants sont conservées. `node scripts/check-public-auth.cjs` vérifie ce réglage public sans créer de compte ni envoyer d'e-mail.

## Maintenance et vérification

- Après ajout d'une ressource publique : `node scripts/build-offline-assets.cjs` et incrémenter `PWA_VERSION` du service worker.
- Tests : `node --test tests/*.test.cjs`.
- Essai navigateur isolé : lancer `node scripts/serve-preview.cjs`, puis `node scripts/test-offline-browser.cjs`. Il utilise Playwright et Chrome ; `PLAYWRIGHT_MODULE` peut désigner le module Playwright installé. Aucune vraie donnée ni session n'est utilisée.
- Cet essai prépare l'application, coupe réellement le réseau, conserve une absence après rechargement et vérifie sa synchronisation vers un serveur simulé à la reconnexion.
