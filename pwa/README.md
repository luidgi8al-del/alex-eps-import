# Moteur hors connexion PWA — phase 1, non active

Cette arborescence est indépendante de `index.html`. Aucun module n'est chargé par le site public.

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

## Non connecté à ce stade

- aucun appel Supabase ;
- aucune modification d'Android ;
- aucune activation dans la page Web ;
- aucune migration SQL.

Le laboratoire `tests/offline-sync-demo.html` fonctionne uniquement en mémoire. Il ne lit et n'efface aucune donnée locale.

## Tests

`pwa/tests/engine.test.html` — à ouvrir dans un navigateur. Le moteur repose sur IndexedDB et ne
peut donc pas être testé sous Node. Vingt-deux cas couvrent le chemin complet : saisie hors ligne,
envoi, échec et report, fusion, conflit, puis résolution.

Attention en développement : le navigateur garde les modules en cache. Après avoir modifié un
fichier de `pwa/`, servez le dossier sur un autre port plutôt que de recharger — un rechargement
forcé ne suffit pas toujours, et les tests semblent alors échouer sur du code déjà corrigé.
