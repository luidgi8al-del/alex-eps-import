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

Modifier `index.html` localement, puis `git push` — GitHub Pages redeploie automatiquement.
