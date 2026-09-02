/**
 * Rangement des donnees locales, sans chiffrement.
 *
 * Il y en avait un : AES-GCM, avec une cle rangee dans la meme base IndexedDB que les donnees
 * chiffrees. Qui pouvait lire les unes pouvait lire l'autre - la protection etait donc apparente
 * plutot que reelle. Elle coutait en revanche un dechiffrement par fiche : afficher mille quatre
 * cents eleves demandait autant d'operations de crypto, plus un aller-retour JSON a chaque lecture
 * comme a chaque ecriture.
 *
 * L'equipe a tranche : ces donnees vivent sur les machines personnelles des professeurs, et la
 * fluidite compte davantage. On garde les deux fonctions au lieu de les effacer partout : la
 * frontiere reste au meme endroit, et un vrai chiffrement pourra revenir ici seul si le besoin
 * change - en le posant alors sur une cle qui ne dort pas a cote des donnees.
 */

/** Range la valeur telle quelle. Le second argument, jadis la donnee authentifiee, est ignore. */
export async function seal(value) {
  return value ?? null;
}

export async function unseal(envelope) {
  return envelope ?? null;
}
