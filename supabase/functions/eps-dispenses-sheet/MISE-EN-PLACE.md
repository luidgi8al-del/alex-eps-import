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

Lancer `schema_sante_4_sport_adapte.sql` dans l'éditeur SQL (colonnes *aptitude* et *sport
adapté*), déployer la fonction, désactiver **Verify JWT** dessus, puis poser deux secrets dans
**Edge Functions > Secrets** :

| Secret | Valeur |
|---|---|
| `EPS_SHEET_SECRET` | le mot de passe inventé à l'étape 1 |
| `EPS_SHEET_USER_ID` | l'identifiant de votre compte (Supabase > Authentication > Users) |

`SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà fournis automatiquement.

### 3. Côté Google Sheet

1. Créer un Sheet, le partager **avec l'infirmerie uniquement**, en droit de modification.
2. **Extensions > Apps Script**, remplacer tout le contenu par `google-apps-script.gs`.
3. **Paramètres du projet > Propriétés du script**, ajouter :

   | Propriété | Valeur |
   |---|---|
   | `URL_PASSERELLE` | `https://<votre-projet>.supabase.co/functions/v1/eps-dispenses-sheet` |
   | `SECRET` | le même mot de passe qu'à l'étape 1 |

4. **Déclencheurs** (l'icône réveil), ajouter deux déclencheurs :

   | Fonction | Source | Type |
   |---|---|---|
   | `auSurEdition` | Depuis la feuille de calcul | **Sur modification** |
   | `actualiser` | Déclencheur horaire | Toutes les 5 minutes |

   Le déclencheur « Sur modification » est indispensable : le `onEdit` simple de Google n'a pas
   le droit d'appeler un service extérieur.

5. Recharger le Sheet : un menu **Dispenses EPS** apparaît. Cliquer sur **Actualiser maintenant**.

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
