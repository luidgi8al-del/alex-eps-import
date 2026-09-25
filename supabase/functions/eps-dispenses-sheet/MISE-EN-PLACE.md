# Dispenses ↔ Google Sheet de l'infirmerie

Le Sheet est un **miroir** de vos dispenses, dans les deux sens :

- ce que vous saisissez dans l'application ou le site apparaît dans le Sheet ;
- ce que l'infirmerie saisit dans le Sheet entre dans votre base.

La base reste la référence : le Sheet se réécrit à partir d'elle.

## Ce qui circule

Élève, classe, date de naissance, dates de dispense, famille du motif, motif, aptitude et sport
adapté. Le motif médical en fait partie — c'est ce que l'infirmerie a besoin de connaître.
**Le Sheet ne doit donc être partagé qu'avec elle.**

## Mise en place, une seule fois

### 1. Le secret

Inventez un mot de passe long (30 caractères au hasard, par exemple). Il ne sert qu'à ce pont :
il ne donne accès ni à votre compte, ni au reste de la base.

### 2. Côté Supabase

Lancer dans l'éditeur SQL, dans cet ordre :

| Fichier | Ce qu'il apporte |
|---|---|
| `schema_sante_4_sport_adapte.sql` | aptitude et sport adapté |
| `schema_sante_5_saisie_infirmerie.sql` | la colonne « Fait par » |
| `schema_sante_6_dispense_repertoire.sql` | la dispense pour un élève sans classe |

Puis déployer la fonction, désactiver **Verify JWT** dessus, et poser deux secrets dans
**Edge Functions > Secrets** :

| Secret | Valeur |
|---|---|
| `EPS_SHEET_SECRET` | le mot de passe inventé à l'étape 1 |
| `EPS_SHEET_USER_ID` | l'identifiant d'un compte de l'établissement (Supabase > Authentication > Users) |

`EPS_SHEET_USER_ID` sert uniquement à **désigner l'établissement**. Le Sheet couvre ensuite les
élèves et les dispenses de **tous les collègues** : c'est déjà ce que chacun voit dans
« Tous les dispensés », et l'infirmerie doit pouvoir saisir pour n'importe quel élève.
Une dispense saisie dans le Sheet est attribuée **au professeur de l'élève**, pas au compte
ci-dessus : elle apparaît dans *ses* dispenses, et lui seul peut la corriger depuis l'application.

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà fournis automatiquement.

### 3. Côté Google Sheet

1. Créer un Sheet, le partager **avec l'infirmerie uniquement**, en droit de modification.
2. **Extensions > Apps Script**, remplacer tout le contenu par `google-apps-script.gs`.
3. **Paramètres du projet > Propriétés du script**, ajouter :

   | Propriété | Valeur |
   |---|---|
   | `URL_PASSERELLE` | `https://<votre-projet>.supabase.co/functions/v1/eps-dispenses-sheet` |
   | `SECRET` | le même mot de passe qu'à l'étape 1 |

4. Exécuter la fonction **`installerDeclencheurs`** depuis l'éditeur. Google demande alors une
   autorisation — l'accorder : c'est celle qui permet au script de tourner sans vous.

   Elle pose les deux déclencheurs elle-même, et ce n'est pas un raccourci : le menu de Google
   propose « Lors de la modification » et « Lors d'un changement », qui se ressemblent alors que
   seul le premier dit quelle cellule a changé. Choisir le second donne un Sheet qui ne réagit à
   rien, **sans erreur nulle part** — une demi-heure perdue à chercher.

5. Exécuter **`verifier`** : le journal doit être tout en `✓`. Puis **`actualiser`**.

En cas de doute plus tard, deux relevés répondent sans qu'il faille deviner :
`diagnostic` (ce que contient la base, et si les déclencheurs sont posés) et `chercherEleve`
(ce que la base sait d'un élève, face à ce que le Sheet en a fait).

## Les trois onglets

| Onglet | À quoi il sert |
|---|---|
| **En cours** | La saisie. Les dispenses en cours ou à venir. Seul onglet où écrire. |
| **Passées** | Les dispenses terminées. Rempli tout seul, en lecture. |
| `Élèves` | Masqué. La liste qui alimente le menu déroulant. Ne pas y toucher. |

Une dispense passe de **En cours** à **Passées** toute seule le jour où elle se termine :
personne n'a rien à déplacer. Pour corriger une dispense déjà terminée, passer par
l'application ou le site — la supprimer reste possible depuis l'onglet **Passées**.

## À l'usage

- **Vous saisissez une dispense** → elle apparaît dans le Sheet à la prochaine actualisation
  (5 minutes), ou tout de suite via *Dispenses EPS > Actualiser maintenant*.
- **L'infirmerie saisit une ligne** → elle part immédiatement. La colonne **État** affiche `✓` ou,
  en cas de refus, la raison sur la ligne concernée.
- **Supprimer** : se placer sur la ligne, puis *Dispenses EPS > Supprimer la ligne sélectionnée*.
  Effacer une ligne à la main ne supprime rien dans la base — elle reviendra à l'actualisation.

### Ce qu'il faut savoir

- **La colonne Élève est une liste déroulante.** On tape quelques lettres du nom *ou* du prénom,
  la liste se filtre, on choisit — et la **classe** et la **date de naissance** se remplissent
  toutes seules. La liste se met à jour à chaque actualisation.
- **La liste couvre tout le répertoire des élèves** (onglet ÉLÈVES), pas seulement ceux déjà
  versés dans une classe. La classe affichée est la **division** de l'élève ; à défaut, la classe
  du professeur qui l'a pris. Un élève sans ni l'une ni l'autre reste sans classe — la dispense se
  pose quand même, et la classe apparaîtra le jour où l'information existera.
- **Début et Fin ouvrent un calendrier** (double-clic). **Famille** et **Aptitude** sont des
  listes de choix, les mêmes que dans l'application et le site.
- **On peut aussi taper un nom à la main**, pour un élève arrivé en cours d'année et pas encore
  synchronisé. Accents, casse et ordre (« DUPONT Léa » ou « Léa Dupont ») n'ont pas d'importance.
  En revanche, si deux élèves portent le même nom, il faut renseigner la classe — sinon la ligne
  est refusée plutôt que posée sur le mauvais élève.
- **L'onglet `Élèves` est masqué** : il porte la liste qui alimente le menu déroulant. Ne pas le
  remplir à la main, il est réécrit à chaque actualisation.
- **Le sens base → Sheet n'est pas instantané.** Google ne permet pas de pousser vers un Sheet :
  c'est le Sheet qui vient lire, toutes les 5 minutes. L'autre sens, lui, est immédiat.
- **La colonne `id` est masquée** et ne doit pas être modifiée : c'est elle qui relie une ligne du
  Sheet à la dispense correspondante. Sans elle, une correction créerait un doublon.
