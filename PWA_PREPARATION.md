# Socle PWA — non active

Les fichiers PWA sont préparés mais **aucune ligne d'activation n'a été ajoutée à `index.html`**.
Le site public, Supabase et les données existantes ne sont donc pas modifiés par ce socle.

## Fichiers préparés

- `manifest.webmanifest` : identité de l'application installable.
- `service-worker.js` : cache prudent des fichiers publics et statiques.
- `offline.html` : écran de secours sans donnée personnelle.
- `icons/` : icônes normale et adaptable.

## Garanties de cette première étape

- aucune requête d'écriture n'est interceptée ;
- aucune réponse Supabase n'est mise en cache ;
- aucune donnée d'élève ou donnée authentifiée n'est enregistrée par le service worker ;
- la météo reste dépendante d'Internet ;
- le service worker reste inactif tant qu'il n'est pas enregistré dans `index.html`.

## Étape d'activation ultérieure

Après validation, il faudra relier le manifeste dans `<head>`, enregistrer le service worker et
ajouter une interface claire pour l'installation, l'état hors connexion et les mises à jour.
