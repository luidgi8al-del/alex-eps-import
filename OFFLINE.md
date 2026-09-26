# Utilisation sans connexion

Depuis Réglage → Utiliser sans connexion, lancer « Préparer cet appareil pour le mode hors connexion » avec Internet et attendre la confirmation. Cette préparation est propre à l'appareil, au navigateur et au compte utilisés. Vérifier cet état avant de partir ; une mise à jour des outils ou un nettoyage du navigateur peut nécessiter une nouvelle préparation.

Le cache du service worker contient uniquement des ressources publiques. Les données autorisées par le serveur sont conservées dans la base IndexedDB du compte. Les tables raccordées couvrent notamment classes, élèves, planning, cycles, évaluations, AS, santé et équipement. Les écritures passant par le moteur local restent en attente puis sont synchronisées au retour du réseau. Les conflits doivent être tranchés avant une confirmation de préparation complète.

Ce n'est pas une équivalence complète avec Room/Android : les écrans non raccordés, certaines vues complexes, les ressources externes, l'administration et les envois d'e-mails nécessitent Internet. Aucun e-mail n'est envoyé par la préparation. Ne pas se déconnecter avant le travail hors réseau : la déconnexion efface les copies locales. Elles ne sont pas chiffrées par l'application ; utiliser un appareil personnel protégé et ne pas confondre cache local et sauvegarde.

Les inscriptions publiques sont retirées de l'interface. Il faut aussi désactiver « Allow new users to sign up » dans Supabase ; les invitations administrateur et la connexion des comptes existants sont conservées. `node scripts/check-public-auth.cjs` vérifie ce réglage public sans créer de compte ni envoyer d'e-mail.

## Maintenance et vérification

- Après ajout d'une ressource publique : `node scripts/build-offline-assets.cjs` et incrémenter `PWA_VERSION` du service worker.
- Tests : `node --test tests/*.test.cjs`.
- Essai navigateur isolé : lancer `node scripts/serve-preview.cjs`, puis `node scripts/test-offline-browser.cjs`. Il utilise Playwright et Chrome ; `PLAYWRIGHT_MODULE` peut désigner le module Playwright installé. Aucune vraie donnée ni session n'est utilisée.
- Cet essai prépare l'application, coupe réellement le réseau, conserve une absence après rechargement et vérifie sa synchronisation vers un serveur simulé à la reconnexion.
