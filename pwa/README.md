# Moteur hors connexion PWA — intégré au site

Le site démarre ce moteur via `hors-connexion.js` et `pwa/bootstrap.js` après connexion.
`offline-preparation.js` vérifie les ressources publiques, le compte et les tables locales.
Les migrations serveur activent les rubriques progressivement ; un cache de fichiers seul ne
permet pas d'annoncer que les données sont prêtes hors connexion.

## Architecture

- `core/` : constantes, connectivité et événements d'état.
- `storage/` : IndexedDB et enregistrements locaux. Sans chiffrement : la clé dormait dans la même
  base que les données, elle ne protégeait donc de rien, et coûtait un déchiffrement par fiche à
  chaque affichage. `vault.js` garde la frontière si le besoin revenait.
- `sync/` : file d'attente, comparaison par champ, conflits et synchronisation par lots.
- `ui/` : indicateur d'état et écran de résolution des conflits.
- `tests/` : scénarios purs, exécutables sans Supabase.

## Règles implémentées

1. Deux enregistrements différents sont fusionnés automatiquement.
2. Deux champs différents d'un même enregistrement sont fusionnés automatiquement.
3. Le même champ modifié localement et sur le serveur crée un conflit explicite.
4. Une suppression opposée à une modification crée toujours un conflit.
5. Les opérations sont envoyées par lots sans bloquer l'interface.
6. Les erreurs utilisent un délai progressif avant nouvelle tentative.
7. Les données locales sont écrites telles quelles dans IndexedDB, par choix assumé.
8. Un conflit résolu repart dans la file en se basant sur la version du serveur, sans se
   redéclencher. Sans cette étape, une saisie hors connexion restait bloquée dans la fiche de
   conflit et n'était jamais renvoyée.

## Utilisation et limites

- Préparer l'appareil connecté avec le bon compte avant de partir sans réseau.
- Utiliser **Enregistrer** : le brouillon affiché ne prouve pas qu'une sauvegarde a réussi.
- Les saisies et leurs opérations d'envoi sont conservées ensemble dans une transaction locale
  stricte ; une panne de stockage annule les deux et permet de réessayer la même saisie.
- Les envois reprennent au retour du réseau quand l'application est active. Ne pas promettre
  l'envoi d'une PWA complètement fermée : le navigateur maîtrise son exécution.
- Ne pas effacer les données du navigateur ni désinstaller avant synchronisation/sauvegarde.
- Les copies locales ne constituent ni une sauvegarde externe ni une protection contre
  l'effacement du stockage par le système.
- Android utilise sa propre base Room ; les essais PWA ne valident pas l'APK sur téléphone.

Le laboratoire `tests/offline-sync-demo.html` reste une démonstration en mémoire, séparée du site.

## Tests

- `node tests/offline-atomic.browser.cjs` : panne de stockage injectée, aucune fiche orpheline,
  nouvelle tentative et séparation des comptes.
- `node tests/offline-full-session.browser.cjs` : vrai profil Chrome temporaire, classe/groupe et
  trois temps saisis sans réseau, fermeture complète du navigateur, réouverture hors connexion
  depuis le disque, puis envoi unique au serveur simulé. Aucun compte réel utilisé.
- `node tests/running-observation-offline.browser.cjs` et `node tests/bac-grids-offline.browser.cjs` :
  travaux, groupes et critères conservés après rechargement, puis transmission simulée.
- Ces tests sur ordinateur ne remplacent pas un essai de clavier ou de reprise sur téléphone.

`pwa/tests/engine.test.html` — à ouvrir dans un navigateur. Le moteur repose sur IndexedDB.
Les tests couvrent le chemin complet : saisie hors ligne,
envoi, échec et report, fusion, conflit, puis résolution.

Attention en développement : le navigateur garde les modules en cache. Après avoir modifié un
fichier de `pwa/`, servez le dossier sur un autre port plutôt que de recharger — un rechargement
forcé ne suffit pas toujours, et les tests semblent alors échouer sur du code déjà corrigé.
