/**
 * Le rapprochement d'un fichier avec le repertoire deja enregistre.
 *
 * On verifie surtout ce qui doit NE PAS arriver : creer un doublon, fusionner deux personnes,
 * ecraser une donnee saisie a la main. Ces cas ne se voient pas a l'oeil sur un export de mille
 * lignes - ils se decouvrent trois mois plus tard, quand un mail part au mauvais parent.
 */
import { test, assert, assertEgal } from "../pwa/tests/harness.js";

const { rapprocherEleves, ficheFusionnee } = globalThis.ImportEleves;

const NAISSANCE_LEA = Date.UTC(2011, 4, 12);
const NAISSANCE_AUTRE = Date.UTC(2012, 8, 3);

/** Un eleve du repertoire : tel qu'il est enregistre, souvent incomplet. */
function auRepertoire(champs) {
  return {
    id: "r-" + (champs.last_name || "x") + "-" + (champs.first_name || "y"),
    last_name: "Martin", first_name: "Lea", birth_date_epoch_millis: null,
    sex: "", division: "", student_email: null, parent_email: null,
    wish1: "", wish2: "", wish3: "", category: "MINIME", licensed: false,
    ...champs
  };
}

/** Une ligne du fichier : ce que l'export d'etablissement fournit. */
function duFichier(champs) {
  return {
    last_name: "Martin", first_name: "Lea", birth_date_epoch_millis: null,
    sex: "", division: "", student_email: null, parent_email: null,
    wish1: "", wish2: "", wish3: "",
    ...champs
  };
}

// ------------------------------------------------------------------ reconnaissance

test("le meme fichier reimporte ne cree aucun doublon", () => {
  const existant = auRepertoire({ birth_date_epoch_millis: NAISSANCE_LEA, division: "3e6" });
  const r = rapprocherEleves([existant], [duFichier({ birth_date_epoch_millis: NAISSANCE_LEA, division: "3e6" })]);
  assertEgal(r.resume.nouveaux, 0, "aucun eleve ne doit etre ajoute");
  assertEgal(r.resume.reconnus, 1, "il doit etre reconnu");
  assertEgal(r.resume.completes, 0, "et rien a completer, tout y est deja");
  assertEgal(r.resume.divergences, 0, "sans desaccord");
});

test("le mail de l'eleve suffit meme si le nom a change", () => {
  // Un nom d'usage qui change en cours d'annee ne doit pas creer une seconde fiche.
  const existant = auRepertoire({ student_email: "lea.martin@lycee.fr" });
  const r = rapprocherEleves([existant],
    [duFichier({ last_name: "Martin-Dubois", student_email: "LEA.MARTIN@lycee.fr" })]);
  assertEgal(r.resume.reconnus, 1, "reconnu par le mail");
  assertEgal(r.reconnus[0].critere, "mail", "et c'est bien le mail qui a servi");
  assertEgal(r.reconnus[0].divergences.map(d => d.champ), ["last_name"], "le nom differe : on demande");
});

test("nom et prenom suffisent quand la date manque d'un cote", () => {
  // Cas courant : le premier import n'avait pas les dates, le second les apporte. Exiger la date
  // des deux cotes rendrait tout le fichier ambigu, et personne ne lirait 800 confirmations.
  const r = rapprocherEleves([auRepertoire({})], [duFichier({ birth_date_epoch_millis: NAISSANCE_LEA })]);
  assertEgal(r.resume.reconnus, 1, "reconnu par le nom");
  assertEgal(r.reconnus[0].aCompleter.map(c => c.champ), ["birth_date_epoch_millis"],
    "la date vient completer la fiche");
});

test("deux dates differentes designent deux personnes", () => {
  const r = rapprocherEleves(
    [auRepertoire({ birth_date_epoch_millis: NAISSANCE_LEA })],
    [duFichier({ birth_date_epoch_millis: NAISSANCE_AUTRE })]
  );
  assertEgal(r.resume.nouveaux, 1, "l'homonyme est un nouvel eleve");
  assertEgal(r.resume.reconnus, 0, "et surtout pas une fusion des deux");
});

test("deux homonymes sans date demandent une confirmation", () => {
  const r = rapprocherEleves(
    [auRepertoire({ id: "a" }), auRepertoire({ id: "b" })],
    [duFichier({})]
  );
  assertEgal(r.resume.ambigus, 1, "on ne devine pas laquelle des deux fiches");
  assertEgal(r.resume.nouveaux, 0, "et on n'en cree pas une troisieme au passage");
  assertEgal(r.ambigus[0].candidats.length, 2, "les deux candidates sont proposees");
});

test("un eleve vraiment nouveau est ajoute", () => {
  const r = rapprocherEleves([auRepertoire({})],
    [duFichier({ last_name: "Diouch", first_name: "Tom" })]);
  assertEgal(r.resume.nouveaux, 1, "ajoute");
  assertEgal(r.resume.reconnus, 0, "sans rapprochement force");
});

// ------------------------------------------------------------------ ce qui est apporte

test("les champs vides se remplissent, les champs remplis ne bougent pas", () => {
  const existant = auRepertoire({ sex: "F", division: "3e6" });
  const r = rapprocherEleves([existant], [duFichier({
    sex: "F", division: "3e6", parent_email: "parent@exemple.fr", student_email: "lea@lycee.fr"
  })]);
  const [reconnu] = r.reconnus;
  assertEgal(reconnu.aCompleter.map(c => c.champ).sort(), ["parent_email", "student_email"],
    "seuls les trous sont combles");
  assertEgal(reconnu.divergences.length, 0, "une valeur identique n'est pas un desaccord");
});

test("une valeur differente devient une question, jamais un ecrasement", () => {
  const existant = auRepertoire({ parent_email: "ancien@exemple.fr" });
  const r = rapprocherEleves([existant], [duFichier({ parent_email: "nouveau@exemple.fr" })]);
  const [reconnu] = r.reconnus;
  assertEgal(reconnu.divergences.length, 1, "un desaccord");
  assertEgal(reconnu.aCompleter.length, 0, "et rien de complete d'office");

  // Sans decision, l'ancienne valeur reste : c'est ce qui rend l'import sans danger.
  assertEgal(ficheFusionnee(reconnu).parent_email, "ancien@exemple.fr", "par defaut on garde");
  assertEgal(ficheFusionnee(reconnu, { parent_email: "nouvelle" }).parent_email, "nouveau@exemple.fr",
    "et on peut choisir la nouvelle");
});

test("une colonne absente du fichier n'efface rien", () => {
  // Le fichier des mails parents n'a pas de colonne Division : la division deja saisie doit rester.
  const existant = auRepertoire({ division: "3e6", sex: "F" });
  const r = rapprocherEleves([existant], [duFichier({ parent_email: "p@exemple.fr" })]);
  const fiche = ficheFusionnee(r.reconnus[0]);
  assertEgal(fiche.division, "3e6", "la division survit");
  assertEgal(fiche.sex, "F", "le sexe aussi");
  assertEgal(fiche.parent_email, "p@exemple.fr", "et le mail arrive");
});

test("un eleve absent du fichier n'est pas touche", () => {
  // Indispensable pour importer une classe a la fois sans que le reste du repertoire disparaisse.
  const reste = auRepertoire({ last_name: "Abbas", first_name: "Ines" });
  const r = rapprocherEleves([auRepertoire({}), reste], [duFichier({})]);
  assertEgal(r.absentsDuFichier.map(e => e.last_name), ["Abbas"], "il est signale, pas supprime");
});

// ------------------------------------------------------------------ a l'echelle d'un etablissement

test("une fiche deja rapprochee ne sert pas deux fois", () => {
  // Deux lignes identiques dans le fichier - un export colle deux fois - ne doivent pas se
  // rapprocher toutes les deux de la meme fiche : la seconde est une vraie question.
  const r = rapprocherEleves([auRepertoire({})], [duFichier({}), duFichier({})]);
  assertEgal(r.resume.reconnus, 1, "la premiere est reconnue");
  assertEgal(r.resume.reconnus + r.resume.nouveaux + r.resume.ambigus, 2, "les deux lignes sont traitees");
  assertEgal(r.resume.nouveaux, 1, "la seconde ne peut plus l'etre : elle devient un nouvel eleve");
});

test("le rapprochement tient sur huit cents eleves", () => {
  const repertoire = Array.from({ length: 800 }, (_, i) => auRepertoire({
    id: "r" + i, last_name: "Nom" + i, first_name: "Prenom" + i,
    birth_date_epoch_millis: NAISSANCE_LEA + i
  }));
  const fichier = repertoire.map(e => duFichier({
    last_name: e.last_name, first_name: e.first_name,
    birth_date_epoch_millis: e.birth_date_epoch_millis,
    parent_email: "p" + e.id + "@exemple.fr"
  }));
  const debut = performance.now();
  const r = rapprocherEleves(repertoire, fichier);
  const duree = performance.now() - debut;
  assertEgal(r.resume.reconnus, 800, "tous reconnus");
  assertEgal(r.resume.nouveaux, 0, "aucun doublon");
  assertEgal(r.resume.completes, 800, "chacun recoit son mail parent");
  assert(duree < 2000, `le rapprochement doit rester instantane (mesure : ${Math.round(duree)} ms)`);
});

test("les accents et la casse ne separent pas deux fois le meme eleve", () => {
  const existant = auRepertoire({ last_name: "MÜLLER", first_name: "Léa" });
  const r = rapprocherEleves([existant], [duFichier({ last_name: "muller", first_name: "lea" })]);
  assertEgal(r.resume.reconnus, 1, "c'est la meme personne");
  assertEgal(r.resume.nouveaux, 0, "pas de seconde fiche");
});

test("le meme jour reste le meme jour, quel que soit le chemin d'enregistrement", () => {
  // L'import du repertoire retient minuit heure locale, celui d'une classe minuit UTC. Comparees
  // en millisecondes, ces deux valeurs du 12 mai 2011 differaient : chaque fiche reclamait un
  // arbitrage, et deux personnes pouvaient etre prises l'une pour l'autre.
  const localMinuit = new Date(2011, 4, 12).getTime();
  const utcMinuit = Date.UTC(2011, 4, 12);
  const r = rapprocherEleves(
    [auRepertoire({ birth_date_epoch_millis: localMinuit })],
    [duFichier({ birth_date_epoch_millis: utcMinuit })]
  );
  assertEgal(r.resume.reconnus, 1, "c'est la meme personne");
  assertEgal(r.resume.divergences, 0, "et la meme date : rien a arbitrer");
});

test("une veritable autre date reste une autre personne", () => {
  const veille = new Date(2011, 4, 11).getTime();
  const r = rapprocherEleves(
    [auRepertoire({ birth_date_epoch_millis: new Date(2011, 4, 12).getTime() })],
    [duFichier({ birth_date_epoch_millis: veille })]
  );
  assertEgal(r.resume.nouveaux, 1, "un jour d'ecart reste un jour d'ecart");
  assertEgal(r.resume.reconnus, 0, "aucune fusion");
});
