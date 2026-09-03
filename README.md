# Alex EPS Outils — page d'import de classe

Page statique (HTML/JS pur, aucune compilation) qui permet de deposer un CSV de classe
depuis un ordinateur, le previsualiser, puis l'envoyer vers Supabase pour que l'app
Android vienne le recuperer.

Meme principe que la page coach de l'app Alex (velo) : Supabase pour l'auth/la base,
GitHub Pages pour l'hebergement (pas de serveur a maintenir).

## Mise en place (a faire une seule fois)

1. **Supabase** : creer un nouveau projet sur https://supabase.com (gratuit).
2. Dans le projet, ouvrir **SQL Editor** et coller le contenu de `schema.sql`, executer.
3. Dans **Project Settings → API**, recuperer :
   - Project URL (ex : `https://xxxxx.supabase.co`)
   - la cle publique (`anon` / `publishable`)
4. Dans **Authentication → Providers → Email**, verifier que "Confirm email" est
   desactive pour le confort (sinon chaque compte doit valider un email avant de se
   connecter) — a activer plus tard si besoin de securite supplementaire.
5. Ouvrir `index.html` et remplacer les deux lignes :
   ```js
   const SUPABASE_URL = "REPLACE_WITH_SUPABASE_URL";
   const SUPABASE_KEY = "REPLACE_WITH_SUPABASE_ANON_KEY";
   ```
   par les vraies valeurs.
6. **GitHub** : creer un nouveau depot public (ex : `alex-eps-import`), y pousser ce
   dossier (`index.html`, `schema.sql`, `README.md`).
7. Dans le depot GitHub : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`. Au bout d'une minute, la page est disponible a
   `https://<utilisateur>.github.io/alex-eps-import/`.

## Mettre a jour la page

Modifier le fichier concerne localement, puis `git push` — GitHub Pages redeploie
automatiquement.

## Organisation des fichiers

`index.html` ne porte plus que la structure de la page, la configuration Supabase, l'acces
au reseau (`apiFetch`), la navigation entre onglets et le demarrage. Chaque rubrique vit
dans son fichier, charge avant le script principal :

| Fichier | Contenu |
| --- | --- |
| `styles/site.css` | toute la feuille de style, hors accueil et barre d'onglets (`home-navigation.css`) |
| `compte.js` | connexion, lien de mot de passe, rattachement a un etablissement |
| `accueil.js` | verrouillage par code, recherche globale, carte du jour |
| `classes.js` | sous-onglets Classe, lecture de CSV, liste et modification d'une classe |
| `classe-tableau-bord.js` | tableau de bord d'une classe : periodes, seances datees, grilles proposees, emploi du temps |
| `cours.js` | apercu d'un cycle, fiches de seance, mode cours en cours, evaluations |
| `planning.js` | emploi du temps, planning EPS, programmes, calendrier, grille annuelle, periodes, installations |
| `equipement.js` | installations sportives, materiel EPS, EPI escalade |
| `aslvh.js` | licencies, creneaux, groupes, appels, statistiques |
| `outils.js` | outils de terrain, tests EPS, VMA, savoir-nager, chronos |
| `health.js` | Sante / Accident (deja separe auparavant) |

Ce sont des **scripts classiques**, pas des modules : les fonctions y restent globales et
visibles des autres fichiers sans rien exporter. C'est le meme fonctionnement que les dix
fichiers qui existaient deja — melanger deux styles couterait plus cher que d'en garder un.

Deux consequences a garder en tete :

- **L'ordre des balises compte** pour tout ce qui s'execute au chargement. Une ligne de
  premier niveau qui appelle une fonction definie dans un fichier charge plus tard echoue.
  Dans le doute, mettre le code dans le fichier de la fonction qu'il appelle.
- **Le banc d'essai est la pour ca.** Ouvrir `tests/site.test.html` : il charge le vrai
  site dans un cadre avec un faux serveur, surveille le chargement, puis ouvre chaque
  onglet et chaque panneau. Aucune requete ne part et la session du vrai compte n'est ni
  ecrite ni effacee. A lancer apres toute modification qui deplace du code.
