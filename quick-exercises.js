/* Port fidèle de QuickExerciseCatalog.kt / QuickExerciseGuidance.kt / QuickExerciseDiagram.kt
   (module Android AlexEpsOutils) vers du JavaScript navigateur sans dépendance. */

const QuickExercises = (function () {
  "use strict";

  // Même normalisation que le Normalizer NFD de Kotlin : minuscules puis suppression des diacritiques.
  function normalize(value) {
    return String(value == null ? "" : value).toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "");
  }

  function anyContains(list, value) {
    return list.some(function (needle) { return value.indexOf(needle) !== -1; });
  }

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  const QuickExerciseType = {
    WARMUP: { name: "WARMUP", label: "Échauffement" },
    GAME: { name: "GAME", label: "Exercice / Jeu" }
  };

  const QuickDiagramKind = {
    SHUTTLE: "SHUTTLE",
    RELAY_ZONE: "RELAY_ZONE",
    LANES: "LANES",
    GRID: "GRID",
    SMALL_GAME: "SMALL_GAME",
    TARGETS: "TARGETS",
    CIRCUIT: "CIRCUIT",
    WALL: "WALL",
    POOL: "POOL",
    MAT_DUO: "MAT_DUO",
    COURT: "COURT",
    MAP: "MAP",
    DANCE: "DANCE",
    JUGGLE: "JUGGLE",
    BALANCE_ROUTE: "BALANCE_ROUTE",
    DEVIL_STICK: "DEVIL_STICK",
    DUO_THROW: "DUO_THROW",
    CIRCUS_STAGE: "CIRCUS_STAGE",
    GENERIC: "GENERIC"
  };

  function seed(title, instruction, material, duration) {
    return {
      title: title,
      instruction: instruction,
      material: material === undefined ? "Coupelles" : material,
      duration: duration === undefined ? 8 : duration
    };
  }

  function pack(warmups, games, organization, success, safety) {
    return {
      warmups: warmups,
      games: games,
      organization: organization,
      success: success,
      safety: safety === undefined ? "" : safety
    };
  }

  // ---------------------------------------------------------------------------
  // Guidance (QuickExerciseGuidance.kt)
  // ---------------------------------------------------------------------------

  function g(steps, success, easier, harder, diagram) {
    return { steps: steps, success: success, easier: easier, harder: harder, diagram: diagram };
  }

  function climbingGuidance(t, instruction, duration) {
    if (t.indexOf("couleur") !== -1) {
      return g([
        "Choisir une traversée basse de 6 à 8 m et désigner une couleur de prises.",
        "Un grimpeur évolue, un observateur vérifie les prises et la hauteur des pieds.",
        instruction,
        "Changer de rôle après chaque traversée."
      ], "Couleur respectée, bassin proche du mur, trois appuis conservés.",
        "Autoriser une seconde couleur.",
        "Interdire une main ou imposer une pause de 3 secondes.", QuickDiagramKind.WALL);
    }
    if (t.indexOf("memoire") !== -1) {
      return g([
        "Tracer une traversée basse avec 6 à 10 prises repérées.",
        "Observer le parcours pendant 10 secondes sans grimper.",
        "Masquer les repères puis réaliser le trajet, yeux ouverts.",
        "Comparer l’itinéraire annoncé et réalisé."
      ], "Itinéraire mémorisé, aucune prise ajoutée, déplacement contrôlé.",
        "Conserver les repères visibles.",
        "Augmenter le nombre de prises ou limiter le temps d’observation.", QuickDiagramKind.WALL);
    }
    return g([
      "Choisir une zone très basse, tapis dégagés et sens de circulation unique.",
      "Former des binômes grimpeur-observateur.",
      instruction,
      "Changer de rôle après chaque passage de " + duration + " min maximum."
    ], "Déplacement contrôlé, consigne respectée et communication claire avec l’observateur.",
      "Ajouter des prises ou réduire la longueur.",
      "Allonger la traversée ou imposer une contrainte d’appuis précise.", QuickDiagramKind.WALL);
  }

  function swimmingGuidance(t, instruction) {
    return g([
      "Attribuer une ligne d’eau et rappeler le sens de circulation.",
      "Répartir les départs avec 5 à 10 secondes d’écart.",
      instruction,
      "Sortir ou récupérer le matériel uniquement au signal."
    ], "Distance terminée sans gêne, respiration maîtrisée et consigne technique visible.",
      "Réduire la distance et autoriser du matériel de flottaison adapté.",
      "Augmenter la distance ou réduire les respirations sans apnée dangereuse.", QuickDiagramKind.POOL);
  }

  function gymnasticsGuidance(t, instruction) {
    return g([
      "Installer des tapis jointifs et définir entrée, sortie et sens de passage.",
      "Démontrer l’élément et les critères de placement.",
      instruction,
      "Un élève agit, un observe, puis permutation."
    ], "Début et fin stabilisés, posture maîtrisée, aucune sortie de tapis.",
      "Décomposer l’élément et utiliser une aide matérielle.",
      "Enchaîner avec une liaison ou maintenir la position 3 secondes.", QuickDiagramKind.MAT_DUO);
  }

  function combatGuidance(t, instruction) {
    return g([
      "Former des binômes de gabarit proche sur tapis délimité.",
      "Rappeler signal de début, signal d’arrêt et actions interdites.",
      instruction,
      "Manches de 30 à 45 secondes puis changement de rôle."
    ], "Engagement contrôlé, arrêt immédiat au signal, technique réalisée sans action dangereuse.",
      "Partenaire coopératif et zone plus grande.",
      "Résistance progressive ou zone réduite, sans modifier les interdictions.", QuickDiagramKind.MAT_DUO);
  }

  function racketGuidance(t, instruction) {
    return g([
      "Attribuer un demi-terrain par binôme et une zone d’attente latérale.",
      "Réaliser trois échanges coopératifs avant le défi.",
      instruction,
      "Mini-manches puis changement de serveur et de côté."
    ], "Replacement central, frappe préparée tôt et trajectoire conforme à la cible.",
      "Agrandir la cible ou autoriser un rebond.",
      "Réduire la cible ou imposer une alternance long-court.", QuickDiagramKind.COURT);
  }

  function orientationGuidance(t, instruction) {
    return g([
      "Définir précisément zone, limites et heure de retour.",
      "Distribuer une carte par binôme et faire orienter la carte au départ.",
      instruction,
      "Contrôler chaque retour avant un nouveau départ."
    ], "Carte orientée, balise correcte et retour avant l’heure limite.",
      "Balises visibles et proches de lignes directrices.",
      "Balises plus éloignées et choix d’itinéraire chronométré.", QuickDiagramKind.MAP);
  }

  function danceGuidance(t, instruction) {
    return g([
      "Dégager l’espace et répartir les groupes dans des zones distinctes.",
      "Donner le thème, la durée et le nombre d’actions attendues.",
      instruction,
      "Présenter aux autres puis donner un retour sur un critère."
    ], "Début et fin lisibles, actions mémorisées, espace utilisé sans collision.",
      "Réduire à deux actions et travailler en miroir.",
      "Ajouter un canon, un changement de niveau ou une contrainte d’espace.", QuickDiagramKind.DANCE);
  }

  function circusGuidance(t, instruction) {
    if (t.indexOf("cascade") !== -1 || t.indexOf("lancer-rattraper") !== -1) {
      return g([
        "Placer chaque élève dans une zone de 2 m, tous orientés dans le même sens.",
        "Commencer avec des foulards : lancer en diagonale jusqu’à hauteur des yeux, sans avancer.",
        instruction,
        "Ramasser seulement quand les voisins ont arrêté, puis reprendre par séries de 5 essais."
      ], "Les objets culminent à hauteur identique, se croisent au centre et sont rattrapés près du corps.",
        "Utiliser deux foulards et marquer une pause après chaque rattrapé.",
        "Passer aux balles puis enchaîner dix lancers réguliers sans déplacement.", QuickDiagramKind.JUGGLE);
    }
    if (t.indexOf("assiette") !== -1 || t.indexOf("equilibre") !== -1) {
      return g([
        "Tracer un chemin large avec départ, slalom et zone d’arrêt.",
        "Stabiliser l’objet cinq secondes avant de s’engager.",
        instruction,
        "Sortir du parcours avant de recommencer ; un observateur replace le matériel."
      ], "Objet stable, parcours suivi sans courir et regard alterné entre l’objet et le trajet.",
        "Supprimer le slalom et réduire la distance.",
        "Ajouter un demi-tour ou changer de main dans une zone large.", QuickDiagramKind.BALANCE_ROUTE);
    }
    if (t.indexOf("baton du diable") !== -1) {
      return g([
        "Installer un carré individuel de 3 m, baguettes posées au sol devant soi.",
        "Faire rouler puis soulever le bâton central avant les touches alternées.",
        instruction,
        "Après dix touches, bloquer le bâton entre les baguettes et sortir de la zone."
      ], "Touches souples alternées, bâton central sous la hauteur des épaules et arrêt maîtrisé.",
        "Travailler le roulement au sol puis trois touches maximum.",
        "Ajouter un déplacement latéral sans augmenter la hauteur des lancers.", QuickDiagramKind.DEVIL_STICK);
    }
    if (t.indexOf("massue") !== -1 || t.indexOf("duo") !== -1) {
      return g([
        "Former des duos face à face à 2 m, chacun dans une zone repérée.",
        "Viser la main extérieure du partenaire avec un lancer en cloche bas.",
        instruction,
        "Récupérer les massues tombées uniquement quand les deux partenaires sont arrêtés."
      ], "Massue saisie par le manche, rotation régulière et réception bras souple sans déplacement.",
        "Réduire la distance et utiliser un anneau avant la massue.",
        "Alterner main droite-main gauche ou réaliser deux passes synchronisées.", QuickDiagramKind.DUO_THROW);
    }
    if (t.indexOf("circuit") !== -1) {
      return g([
        "Installer trois ateliers en triangle : lancer, équilibre, manipulation.",
        "Répartir les groupes et démontrer la réussite attendue à chaque poste.",
        instruction,
        "Tourner au signal toutes les 90 secondes dans un seul sens."
      ], "Chaque atelier est tenté plusieurs fois, matériel remis en place et rotation sans attente.",
        "Choisir un seul défi simple par atelier.",
        "Imposer un contrat de réussites avant la rotation.", QuickDiagramKind.CIRCUIT);
    }
    return g([
      "Délimiter une scène face à une zone public et une coulisse de chaque côté.",
      "Choisir deux actions réellement maîtrisées et fixer l’ordre des artistes.",
      instruction,
      "Présenter sans recommencer après une chute, saluer ensemble puis sortir par la coulisse opposée."
    ], "Entrée et sortie nettes, enchaînement sans temps mort, regard vers le public et chute intégrée sans commentaire.",
      "Présenter une seule action par artiste avec un salut commun.",
      "Ajouter une transition collective ou une action simultanée parfaitement repérée.", QuickDiagramKind.CIRCUS_STAGE);
  }

  function fitnessGuidance(t, instruction) {
    return g([
      "Installer des ateliers espacés avec une fiche de posture à chaque poste.",
      "Former des binômes pratiquant-observateur.",
      instruction,
      "Travailler 30 secondes, récupérer 30 secondes puis changer de rôle."
    ], "Posture stable, respiration continue et amplitude contrôlée sur toute la série.",
      "Réduire la durée ou utiliser une variante sans charge.",
      "Augmenter légèrement la durée ou l’instabilité, jamais la charge maximale.", QuickDiagramKind.CIRCUIT);
  }

  /* Consignes déterminées par la tâche réelle, jamais par le seul niveau scolaire. */
  function guidanceForExercise(activity, title, instruction, organization, duration) {
    const a = normalize(activity);
    const t = normalize(title);
    let specific = null;

    if (t.indexOf("relais navette") !== -1) {
      specific = g([
        "Former deux files face à face, espacées de 20 à 30 m.",
        "Le premier de la file A traverse avec le témoin.",
        "Il transmet presque à l’arrêt devant la file B puis s’y range en dernier.",
        "Le nouveau porteur repart vers la file A. Alterner pendant " + duration + " min."
      ], "Témoin transporté sans chute ; transmission devant la bonne file ; départ seulement après réception.",
        "Distance de 15 m et transmission complètement arrêtée.",
        "Créer au centre une zone de 10 m : receveur lancé et transmission en mouvement uniquement dans cette zone.",
        QuickDiagramKind.SHUTTLE);
    } else if (t.indexOf("frequence sur lattes") !== -1) {
      specific = g([
        "Poser 6 à 10 lattes plates dans un couloir, espacées selon la taille des élèves.",
        "Prévoir 8 m d’élan puis 10 m d’accélération après les lattes.",
        "Passer avec un seul appui entre deux lattes, bras actifs et regard loin devant.",
        "Revenir hors du couloir et réaliser 4 passages avec récupération complète."
      ], "Un appui par intervalle ; aucune latte touchée ; fréquence régulière ; 3 passages propres sur 4.",
        "Six lattes plus espacées, passage d’abord à vitesse modérée.",
        "Rapprocher légèrement les lattes puis chronométrer uniquement la zone d’accélération finale.",
        QuickDiagramKind.LANES);
    } else if (t.indexOf("poursuite") !== -1) {
      specific = g([
        "Tracer deux couloirs de 25 à 30 m et une ligne d’arrivée.",
        "Placer le poursuivi 2 m devant le poursuivant.",
        "Au signal, les deux sprintent jusqu’à la ligne sans changer de couloir.",
        "Changer les rôles après chaque course et ajuster l’écart de départ."
      ], "Réagir au signal, rester dans son couloir et courir jusqu’après la ligne ; écart final réduit.",
        "Donner 3 m d’avance au poursuivi ou réduire la distance à 20 m.",
        "Départ du poursuivant retardé d’une seconde et distance portée à 35 m.",
        QuickDiagramKind.LANES);
    } else if (t.indexOf("signal") !== -1 || t.indexOf("feux tricolores") !== -1 || t.indexOf("depart mystere") !== -1) {
      specific = g([
        "Délimiter une zone de départ et une ligne à 10–15 m.",
        "Associer clairement chaque signal à une action avant le premier essai.",
        "Donner des signaux espacés ; les élèves exécutent uniquement le signal valide.",
        "Changer le signal attendu toutes les 3 répétitions."
      ], "Bonne action au bon signal, sans faux départ, corps équilibré dès les premiers appuis.",
        "Utiliser deux signaux très différents et supprimer la pression du temps.",
        "Ajouter des signaux pièges et imposer une position de départ différente.",
        QuickDiagramKind.LANES);
    } else if (t.indexOf("contrat") !== -1 || t.indexOf("distance") !== -1) {
      specific = g([
        "Matérialiser la distance et annoncer la règle de mesure.",
        "Chaque élève choisit un contrat réaliste avant son passage.",
        instruction,
        "Noter le résultat, récupérer, puis autoriser un second contrat ajusté."
      ], "Contrat annoncé avant l’action et résultat dans la marge fixée ; technique conservée jusqu’à la fin.",
        "Élargir la marge de réussite et proposer deux contrats prédéfinis.",
        "Réduire la marge et demander deux réussites consécutives.",
        QuickDiagramKind.LANES);
    } else if (t.indexOf("toro") !== -1) {
      specific = g([
        "Former un carré de 8 à 10 m avec quatre attaquants autour et un défenseur dedans.",
        "Les attaquants jouent en deux touches maximum et restent mobiles sur leur côté.",
        "Le défenseur change après interception ou 45 secondes.",
        "Compter les séries de 5 passes réussies."
      ], "Joueur disponible avant la réception ; passe au sol précise ; 5 passes sans interception.",
        "Agrandir le carré et autoriser trois touches.",
        "Réduire le carré, passer en une touche ou ajouter un second défenseur.",
        QuickDiagramKind.GRID);
    } else if (t.indexOf("conservation") !== -1 || t.indexOf("passe a dix") !== -1 || t.indexOf("passe a cinq") !== -1) {
      specific = g([
        "Délimiter un carré de 12 à 18 m et former deux équipes en surnombre offensif si nécessaire.",
        "L’équipe en possession se démarque et compte ses passes à voix haute.",
        "Perte de balle : changement immédiat de rôle.",
        "Manches de 90 secondes puis bilan sur l’écartement et les solutions de passe."
      ], "Porteur avec deux solutions ; partenaires écartés ; objectif de passes atteint sans ballon rendu.",
        "Agrandir l’espace ou ajouter un joueur joker toujours attaquant.",
        "Réduire l’espace, limiter les touches ou imposer une passe dans une zone cible.",
        QuickDiagramKind.GRID);
    } else if (t.indexOf("duel") !== -1 || t.indexOf("1 contre 1") !== -1) {
      specific = g([
        "Créer des couloirs séparés pour éviter les collisions.",
        "Un attaquant part avec l’objet ; un défenseur se place à distance adaptée.",
        instruction,
        "Arrêter dès la ligne franchie ou l’objet récupéré puis inverser les rôles."
      ], "Attaquant progresse sans sortir ; défenseur contrôle sa distance sans contact interdit.",
        "Élargir le couloir et donner une avance à l’attaquant.",
        "Réduire le couloir ou donner au défenseur un départ plus proche.",
        QuickDiagramKind.GRID);
    } else if (t.indexOf("3 contre 2") !== -1 || t.indexOf("surnombre") !== -1 || t.indexOf("montee de balle") !== -1) {
      specific = g([
        "Former un trio attaquant et un duo défenseur sur demi-terrain.",
        "Les attaquants partent ensemble avec couloirs occupés.",
        "Fixer un défenseur avant de passer ; terminer par un tir proche.",
        "Rotation : tireur devient défenseur, puis changer les groupes."
      ], "Largeur utilisée, défenseur fixé avant la passe, tir obtenu sans interception.",
        "Défenseurs retardés ou joker offensif supplémentaire.",
        "Départ simultané des défenseurs et temps limité pour tirer.",
        QuickDiagramKind.SMALL_GAME);
    } else if (t.indexOf("tir") !== -1 || t.indexOf("service") !== -1 || t.indexOf("cible") !== -1 || t.indexOf("horloge") !== -1) {
      specific = g([
        "Installer plusieurs cibles ou zones clairement numérotées.",
        "Définir une zone d’attente hors des trajectoires.",
        instruction,
        "Après chaque série, récupérer au signal puis changer de cible ou de rôle."
      ], "Geste équilibré, cible annoncée avant l’action et au moins 3 réussites sur 5.",
        "Rapprocher la cible, l’agrandir ou autoriser un essai sans opposition.",
        "Éloigner ou réduire la cible et imposer une réussite sur plusieurs zones.",
        QuickDiagramKind.TARGETS);
    } else if (t.indexOf("relais") !== -1) {
      specific = g([
        "Créer des couloirs identiques et répartir équitablement les équipes.",
        "Montrer le trajet et la zone où l’action doit être validée.",
        instruction,
        "Le suivant part uniquement après validation ; retour en dehors des couloirs."
      ], "Trajet respecté, action validée avant le départ suivant, équipe organisée sans gêner les autres.",
        "Raccourcir le trajet et supprimer une difficulté technique.",
        "Ajouter une contrainte technique précise ou une zone de validation plus petite.",
        QuickDiagramKind.CIRCUIT);
    } else if (t.indexOf("parcours") !== -1 || t.indexOf("circuit") !== -1 || t.indexOf("ateliers") !== -1) {
      specific = g([
        "Installer 4 ateliers espacés et numérotés avec un sens unique.",
        "Répartir les groupes avant l’explication de chaque poste.",
        instruction,
        "Tourner au signal après 45 à 60 secondes et laisser le matériel en place."
      ], "Ordre respecté, ateliers réalisés sans attente longue et qualité maintenue jusqu’au signal.",
        "Réduire à trois ateliers et augmenter le temps de réalisation.",
        "Ajouter un atelier ou un contrat de répétitions sans dégrader la technique.",
        QuickDiagramKind.CIRCUIT);
    } else if (a.indexOf("escalade") !== -1) {
      specific = climbingGuidance(t, instruction, duration);
    } else if (a.indexOf("natation") !== -1) {
      specific = swimmingGuidance(t, instruction);
    } else if (anyContains(["gym", "acrosport"], a)) {
      specific = gymnasticsGuidance(t, instruction);
    } else if (anyContains(["lutte", "judo", "combat", "boxe"], a)) {
      specific = combatGuidance(t, instruction);
    } else if (anyContains(["badminton", "tennis", "raquette"], a)) {
      specific = racketGuidance(t, instruction);
    } else if (a.indexOf("orientation") !== -1) {
      specific = orientationGuidance(t, instruction);
    } else if (a.indexOf("cirque") !== -1) {
      specific = circusGuidance(t, instruction);
    } else if (anyContains(["danse", "expression"], a)) {
      specific = danceGuidance(t, instruction);
    } else if (anyContains(["musculation", "renforcement", "crossfit"], a)) {
      specific = fitnessGuidance(t, instruction);
    }

    if (specific) return specific;
    return g([
      "Installer précisément : " + organization,
      "Démontrer l’action attendue puis faire reformuler la règle.",
      instruction,
      "Faire une manche de " + Math.min(duration, 8) + " min, changer les rôles et recommencer."
    ], "Consigne respectée et action réussie de manière stable au moins 3 fois sur 5.",
      "Augmenter l’espace ou le temps disponible et diminuer l’opposition.",
      "Réduire l’espace ou le temps disponible et ajouter une seule contrainte clairement annoncée.",
      QuickDiagramKind.GENERIC);
  }

  // ---------------------------------------------------------------------------
  // Packs par activité (QuickExerciseCatalog.kt)
  // ---------------------------------------------------------------------------

  const football = pack(
    [
      seed("Conduite libre et signaux", "Conduire le ballon ; au signal changer de pied, direction ou vitesse."),
      seed("Portes en mouvement", "Franchir un maximum de portes différentes en conduite contrôlée."),
      seed("Passe et suis", "Passer puis suivre son ballon vers le plot suivant.", "1 ballon pour 4, coupelles")
    ],
    [
      seed("Toro 4 contre 1", "Quatre joueurs conservent le ballon autour d’un défenseur.", "1 ballon, coupelles"),
      seed("Conservation 4 contre 2", "Réaliser cinq passes consécutives sans interception.", "Chasubles, 1 ballon"),
      seed("Béret ballon", "À l’appel du numéro, gagner le ballon puis marquer dans une porte."),
      seed("Duel 1 contre 1", "Franchir une ligne en conduite sans perdre le ballon.", "Ballons, coupelles"),
      seed("Match à quatre buts", "Marquer dans l’une des deux petites portes adverses.", "4 mini-buts, chasubles"),
      seed("Passe dans l’intervalle", "Trouver un partenaire lancé entre deux défenseurs passifs."),
      seed("Relais conduite-tir", "Conduire, contourner un plot puis cadrer sa frappe.", "Ballons, plots, buts")
    ],
    "Groupes de 4 à 6 sur espaces délimités.",
    "Lever la tête, conserver la maîtrise et enchaîner rapidement.",
    "Espacer les ateliers et récupérer les ballons sans traverser une zone de tir."
  );

  const basketball = pack(
    [
      seed("Miroir de dribble", "Par deux, reproduire les changements de main et de hauteur du meneur.", "1 ballon par élève"),
      seed("Feux tricolores", "Vert : dribbler ; orange : ralentir ; rouge : arrêt simultané."),
      seed("Passe et déplacement", "Passer puis occuper un espace libre.", "1 ballon pour 3")
    ],
    [
      seed("Épervier dribbleur", "Traverser sans perdre son ballon face aux éperviers."),
      seed("Passe à dix", "Réaliser dix passes sans marcher ni rendre le ballon."),
      seed("3 contre 2 continu", "Exploiter le surnombre pour obtenir un tir proche."),
      seed("Relais double pas", "Finir chaque parcours par un tir en double pas."),
      seed("Horloge de tirs", "Marquer depuis plusieurs positions autour de la raquette."),
      seed("Duel couloir", "Déborder son défenseur dans un couloir limité."),
      seed("Match bonus passe", "Le panier compte double après une passe décisive.")
    ],
    "Demi-terrains et ateliers de 4 à 6 élèves.",
    "Contrôler le ballon, regarder avant d’agir et choisir une action efficace.",
    "Interdire les contacts et maintenir les zones de tir dégagées."
  );

  const handball = pack(
    [
      seed("Passe en mouvement", "Par trois, avancer en passes sans dribbler.", "1 ballon pour 3"),
      seed("Manipulations et appuis", "Changer de main puis réaliser trois appuis contrôlés."),
      seed("Cibles mobiles", "Toucher doucement la cible annoncée après une passe.")
    ],
    [
      seed("Balle au capitaine", "Progresser pour transmettre au capitaine dans sa zone."),
      seed("Montée de balle 3 contre 2", "Atteindre la zone de tir avant le retour des défenseurs."),
      seed("Passe à cinq orientée", "Après cinq passes, attaquer une porte libre."),
      seed("Tir après intervalle", "Fixer un plot-défenseur puis tirer dans l’espace libéré."),
      seed("Duel tireur-gardien", "Varier les impacts sans tirer à la tête."),
      seed("Relais passes-tirs", "Enchaîner course, réception et tir équilibré."),
      seed("Match zones bonus", "Valoriser les tirs construits depuis différentes zones.")
    ],
    "Groupes réduits sur demi-terrain.",
    "Recevoir en mouvement, identifier l’espace libre et tirer équilibré.",
    "Aucun contact dangereux ; tirs contrôlés et jamais dirigés vers la tête."
  );

  const volleyball = pack(
    [
      seed("Ballon vivant", "Maintenir le ballon en l’air avec différents contacts.", "1 ballon pour 2"),
      seed("Déplacements sous ballon", "Lancer, se déplacer puis se placer sous la trajectoire."),
      seed("Passe et cible", "Envoyer haut vers une cible tenue par le partenaire.")
    ],
    [
      seed("Ballon prisonnier volley", "Éliminer par une frappe contrôlée après lancer."),
      seed("1 contre 1 rebond autorisé", "Construire l’échange avec un rebond possible."),
      seed("Deux touches obligatoires", "Contrôler puis renvoyer vers une zone libre."),
      seed("Service sur zones", "Viser successivement des zones numérotées."),
      seed("Passe au passeur", "Orienter la première touche vers une cible centrale."),
      seed("Montante-descendante", "Gagner un échange pour monter de terrain."),
      seed("Défi trois contacts", "Réussir réception, passe puis renvoi.")
    ],
    "Terrains réduits, groupes de 2 à 4.",
    "Produire une trajectoire haute et orientée, se replacer après chaque contact.",
    "Écarter les ballons inutilisés et ne pas passer sous les filets."
  );

  const climbing = pack(
    [
      seed("Mobilité du grimpeur", "Au sol : poignets, épaules, hanches puis déplacements quadrupédiques.", "Tapis"),
      seed("Miroir d’appuis au sol", "Reproduire lentement les positions du partenaire sans monter."),
      seed("Lecture de prises", "Depuis le sol, annoncer une suite de prises et la mémoriser.", "Mur, repères couleur")
    ],
    [
      seed("Traversée par couleur", "Traverser bas en utilisant uniquement la couleur annoncée.", "SAE, tapis"),
      seed("Le moins de prises", "Réaliser une traversée avec le moins de prises possible.", "SAE, tapis"),
      seed("Main interdite", "Sur une zone basse, progresser en limitant une main.", "SAE, tapis"),
      seed("Mémoire d’itinéraire", "Observer dix secondes puis réaliser la traversée mémorisée.", "SAE, tapis"),
      seed("Guide verbal", "Un observateur annonce les prises au grimpeur qui garde les yeux ouverts.", "SAE, tapis"),
      seed("Pause équilibre", "Tenir trois secondes sur chaque position repérée.", "SAE, tapis"),
      seed("Relais sécurité", "Au sol, remettre dans l’ordre les étapes du contrôle mutuel.", "Baudriers, cartes sécurité")
    ],
    "Binômes ou trinômes : grimpeur, observateur et rôle de sécurité.",
    "Rester équilibré, choisir ses appuis et respecter le protocole annoncé.",
    "Traversées très basses uniquement, tapis dégagés, yeux toujours ouverts sur le mur et protocole de sécurité de l’établissement strictement appliqué."
  );

  const swimming = pack(
    [
      seed("Entrées variées", "Entrer en sécurité puis rejoindre un repère en nage souple.", "Frites, repères"),
      seed("Bulles et glissées", "Alterner expiration longue et coulée ventrale."),
      seed("Nages contrastées", "Alterner 25 m lent et 25 m plus dynamique.")
    ],
    [
      seed("Chasse au trésor", "Rapporter un objet à la fois depuis une zone adaptée.", "Anneaux lestés"),
      seed("Relais coulée", "Aller le plus loin possible en coulée maîtrisée."),
      seed("Parcours respiratoire", "Franchir des repères avec une expiration aquatique continue."),
      seed("Nage puzzle", "Associer bras d’une nage et jambes d’une autre sur courte distance."),
      seed("Course aux appuis", "Se déplacer sans toucher le fond dans une zone sécurisée."),
      seed("Relais technique", "Valider une consigne technique différente à chaque longueur."),
      seed("Contrat distance", "Choisir puis réussir une distance adaptée sans arrêt.")
    ],
    "Lignes d’eau ou couloirs adaptés au niveau réel des nageurs.",
    "Respirer sans rupture, conserver l’alignement et terminer la distance choisie.",
    "Comptage permanent des élèves, profondeur connue, départs espacés et protocole piscine respecté."
  );

  const athletics = pack(
    [
      seed("Gammes en couloir", "Enchaîner montées de genoux, talons-fesses et foulées bondissantes.", "Plots, lattes"),
      seed("Réactions aux signaux", "Démarrer selon un signal visuel, sonore ou gestuel."),
      seed("Relais progressif", "Transmettre un témoin à allure progressivement accélérée.", "Témoins, plots")
    ],
    [
      seed("Poursuite décalée", "Le poursuivant part une seconde après et tente de rattraper avant la ligne."),
      seed("Relais navette", "Enchaîner des navettes courtes avec transmission dans une zone."),
      seed("Fréquence sur lattes", "Courir vite sans toucher les lattes régulièrement espacées.", "Lattes"),
      seed("Départ mystère", "Réagir uniquement au bon signal parmi plusieurs."),
      seed("Contrat de vitesse", "Annoncer puis tenir un temps cible sur une distance courte.", "Chronomètre, plots"),
      seed("Relais déménageur", "Transporter un objet à chaque aller sans ralentir la zone de transmission."),
      seed("Course aux zones", "Marquer des points selon la zone atteinte au signal.")
    ],
    "Couloirs clairement séparés, groupes de 4 à 6.",
    "Réagir vite, rester relâché et franchir la ligne sans ralentir.",
    "Sens de circulation unique, zones de freinage libres et retours en dehors des couloirs."
  );

  const gymnastics = pack(
    [
      seed("Mobilité articulée", "Mobiliser poignets, épaules, dos et chevilles sans à-coups.", "Tapis"),
      seed("Formes en miroir", "Reproduire les formes corporelles tenues par le partenaire."),
      seed("Parcours locomoteur", "Enchaîner quadrupédie, saut, rotation simple et équilibre.")
    ],
    [
      seed("Statues à trois niveaux", "Créer rapidement une forme basse, moyenne puis haute."),
      seed("Chemin d’équilibres", "Tenir trois secondes sur chaque zone matérialisée."),
      seed("Puzzle gymnique", "Assembler trois éléments imposés avec des liaisons fluides."),
      seed("Miroir synchronisé", "Réaliser une courte séquence exactement ensemble."),
      seed("Défi roulades", "Choisir la roulade adaptée et finir stabilisé."),
      seed("Acrosport sécurisé", "Construire une figure simple avec montage et démontage contrôlés."),
      seed("Présentation minute", "Présenter un mini-enchaînement avec début et fin identifiables.")
    ],
    "Ateliers sur tapis, binômes ou petits groupes.",
    "Maîtriser les positions, rester gainé et terminer chaque élément stabilisé.",
    "Tapis jointifs, parades enseignées, figures adaptées et aucun élément interdit par le professeur."
  );

  const combat = pack(
    [
      seed("Jeu des appuis", "Déplacer ses appuis sans croiser les jambes face au partenaire.", "Tapis"),
      seed("Miroir garde-distance", "Maintenir une distance constante sans contact."),
      seed("Toucher épaules", "Toucher doucement l’épaule adverse tout en protégeant les siennes.")
    ],
    [
      seed("Sumo à genoux", "Faire sortir une partie du corps adverse d’une zone réduite."),
      seed("Prise de foulard", "Saisir le foulard sans action brutale."),
      seed("Retourner la tortue", "Retourner un partenaire résistant modérément."),
      seed("Garder le trésor", "Protéger un objet placé derrière soi."),
      seed("Déséquilibre contrôlé", "Créer un déséquilibre sans projection."),
      seed("Immobilisation dix secondes", "Stabiliser une position sans action sur le cou."),
      seed("Duel à thème", "Marquer uniquement avec la technique travaillée.")
    ],
    "Binômes de gabarit proche sur surfaces délimitées.",
    "Contrôler son engagement, créer un déséquilibre et respecter immédiatement l’arrêt.",
    "Salut et signal d’arrêt obligatoires ; aucune action sur tête, cou ou articulations."
  );

  const racket = pack(
    [
      seed("Raquette jonglage", "Jongler en variant hauteur et face de raquette.", "1 raquette et 1 volant/balle par élève"),
      seed("Échanges coopératifs", "Maintenir le plus long échange possible."),
      seed("Déplacements six directions", "Rejoindre puis revenir au centre sur signal.")
    ],
    [
      seed("Montante-descendante", "Gagner pour monter d’un terrain, perdre pour descendre."),
      seed("Zones bonus", "Viser une zone annoncée pour doubler le point."),
      seed("Service cible", "Atteindre plusieurs cibles depuis la zone réglementaire."),
      seed("Roi du terrain", "Conserver le terrain par mini-matchs de trois points."),
      seed("Long-court", "Alterner volontairement une trajectoire longue et une courte."),
      seed("Duel sans smash", "Construire le point uniquement par placement."),
      seed("Relais précision", "Réussir une cible avant de passer la raquette.")
    ],
    "Terrains réduits, binômes de niveau proche.",
    "Se replacer, préparer tôt et produire une trajectoire intentionnelle.",
    "Distances entre terrains suffisantes et volants/balles ramassés au signal."
  );

  const orientation = pack(
    [
      seed("Carte orientée", "Orienter la carte puis pointer trois repères visibles.", "Cartes"),
      seed("Mémo-balises", "Observer un emplacement puis le retrouver sans carte."),
      seed("Rose des directions", "Rejoindre rapidement la direction annoncée.")
    ],
    [
      seed("Course en étoile", "Revenir au poste central après chaque balise.", "Cartes, balises"),
      seed("Pose-dépose", "Un binôme pose une balise, l’autre la retrouve."),
      seed("Score limité", "Choisir les balises les plus rentables dans le temps imparti."),
      seed("Itinéraire imposé", "Suivre une ligne directrice et valider les repères."),
      seed("Photo-balises", "Associer une photo du terrain à son emplacement."),
      seed("Relais mémoire", "Mémoriser un tronçon avant de partir."),
      seed("Vrai-faux poste", "Identifier la balise conforme à la définition.")
    ],
    "Binômes, zone connue et limites matérialisées.",
    "Orienter la carte, choisir un itinéraire simple et revenir dans le temps.",
    "Limites, heure de retour et conduite à tenir explicitement vérifiées avant le départ."
  );

  const dance = pack(
    [
      seed("Réveil corporel musical", "Mobiliser progressivement chaque partie du corps.", "Enceinte"),
      seed("Marche contrastée", "Changer énergie, niveau et direction au signal."),
      seed("Miroir dansé", "Suivre lentement les mouvements d’un partenaire.")
    ],
    [
      seed("Statues émotion", "Créer une statue correspondant à l’émotion annoncée."),
      seed("Phrase à quatre actions", "Assembler quatre verbes d’action en une phrase."),
      seed("Canon", "Réaliser la même phrase avec un départ décalé."),
      seed("Question-réponse", "Un danseur propose, l’autre répond par un mouvement."),
      seed("Chemins croisés", "Traverser l’espace sans collision en variant les trajectoires."),
      seed("Objet imaginaire", "Transformer un objet imaginaire par le mouvement."),
      seed("Mini-composition", "Créer début, développement et fin en groupe.")
    ],
    "Espace dégagé, solos, duos puis groupes de 4.",
    "Rendre l’intention lisible, mémoriser et rester engagé jusqu’à la fin.",
    "Espace vérifié, distances conservées et portés uniquement s’ils sont enseignés."
  );

  const circus = pack(
    [
      seed("Réveil de l’artiste", "Se déplacer dans l’espace en mobilisant poignets, épaules et regard, puis s’immobiliser en posture d’artiste.", "Enceinte, coupelles"),
      seed("Lancer-rattraper progressif", "Lancer un foulard puis une balle à hauteur des yeux et la rattraper sans poursuivre l’objet.", "1 foulard et 1 balle par élève"),
      seed("Équilibres en déplacement", "Suivre un chemin matérialisé en maintenant un objet stable sur la main ou la tête.", "Coupelles, anneaux ou sacs de graines")
    ],
    [
      seed("Cascade trois balles", "Construire progressivement la trajectoire croisée de la cascade à trois balles.", "3 balles ou foulards par élève", 10),
      seed("Parcours assiette chinoise", "Faire tourner l’assiette puis franchir un petit parcours sans la faire tomber.", "Assiettes chinoises, coupelles"),
      seed("Bâton du diable contrôlé", "Maintenir le bâton central par touches alternées et l’arrêter dans une zone définie.", "Bâtons du diable"),
      seed("Passes de massues en duo", "Face à face, lancer une massue par le manche vers la main cible du partenaire.", "2 massues par duo"),
      seed("Défi équilibre d’objet", "Tenir puis déplacer un objet en équilibre sur différentes parties du corps.", "Plumes, anneaux, sacs de graines"),
      seed("Circuit des trois familles", "Enchaîner un atelier lancer, un atelier équilibre et un atelier manipulation.", "Matériel de jonglage, coupelles", 12),
      seed("Mini-numéro entrée-salut-sortie", "Présenter en petit groupe une entrée, deux actions maîtrisées, un salut commun et une sortie.", "Matériel choisi, enceinte", 12)
    ],
    "Zones de pratique espacées, matériel attribué et espace de présentation clairement orienté.",
    "Objet contrôlé, regard disponible, action poursuivie après une chute et début-fin lisibles.",
    "Matériel souple pour débuter, sens de circulation défini et personne dans la trajectoire des lancers."
  );

  const fitness = pack(
    [
      seed("Circuit mobilité", "Alterner mobilité de hanches, épaules et chevilles.", "Tapis"),
      seed("Activation progressive", "Enchaîner marche, squat partiel et gainage court."),
      seed("Jeu du coach", "Reproduire une posture correcte montrée par un camarade.")
    ],
    [
      seed("Défi technique 30 secondes", "Réaliser proprement un maximum de répétitions contrôlées."),
      seed("Circuit quatre ateliers", "Tourner entre jambes, poussée, tirage et gainage."),
      seed("Relais qualité", "Valider cinq répétitions correctes avant de passer."),
      seed("Bingo renforcement", "Compléter une ligne de mouvements différents."),
      seed("Duo coach-pratiquant", "Observer puis donner un seul conseil précis."),
      seed("Échelle d’effort", "Adapter la variante pour rester dans l’intensité demandée."),
      seed("Challenge posture", "Tenir une position correcte sans apnée.")
    ],
    "Ateliers espacés, binômes observateur-pratiquant.",
    "Posture stable, respiration régulière et mouvement contrôlé.",
    "Sans charge maximale ; arrêter en cas de douleur et respecter les placements enseignés."
  );

  const generic = pack(
    [
      seed("Mobilité dynamique", "Mobiliser progressivement puis accélérer les déplacements."),
      seed("Jeu des signaux", "Changer d’action, de direction ou de rythme au signal."),
      seed("Relais coopératif", "Réaliser un parcours simple en équipe.")
    ],
    [
      seed("Défi précision", "Atteindre plusieurs cibles en variant la distance."),
      seed("Parcours à contraintes", "Réaliser le parcours avec une contrainte annoncée."),
      seed("Duel aménagé", "S’opposer dans un espace et avec des règles sécurisées."),
      seed("Défi collectif", "Atteindre ensemble un nombre d’actions réussies."),
      seed("Relais technique", "Valider le geste demandé avant de transmettre."),
      seed("Contrat personnel", "Choisir puis réussir un niveau de difficulté."),
      seed("Mini-rencontre", "Réinvestir l’apprentissage dans une opposition courte.")
    ],
    "Petits groupes et ateliers clairement délimités.",
    "Respecter la consigne et stabiliser la réussite avant de complexifier.",
    "Adapter l’espace, le matériel et l’opposition au niveau réel des élèves."
  );

  function packFor(key) {
    if (anyContains(["football", "futsal"], key)) return football;
    if (key.indexOf("basket") !== -1) return basketball;
    if (anyContains(["handball", "hand"], key)) return handball;
    if (key.indexOf("volley") !== -1) return volleyball;
    if (anyContains(["escalade", "grimpe"], key)) return climbing;
    if (anyContains(["natation", "nage"], key)) return swimming;
    if (anyContains(["athle", "sprint", "relais", "course", "demi-fond"], key)) return athletics;
    if (anyContains(["gym", "acrosport"], key)) return gymnastics;
    if (anyContains(["lutte", "judo", "combat", "boxe"], key)) return combat;
    if (anyContains(["badminton", "tennis", "raquette"], key)) return racket;
    if (anyContains(["orientation", "raid"], key)) return orientation;
    if (key.indexOf("cirque") !== -1) return circus;
    if (anyContains(["danse", "expression"], key)) return dance;
    if (anyContains(["musculation", "renforcement", "crossfit"], key)) return fitness;
    return generic;
  }

  const DURATION_MINUTES_LABEL = "8 min";

  function infoFor(activity, title, material) {
    const normalizedTitle = normalize(title);
    if (normalizedTitle.indexOf("relais navette") !== -1) return ["2 files", "1 témoin", "20–30 m", "6–10 élèves"];
    if (activity.indexOf("escalade") !== -1) return ["Binômes", "Mur bas", material, "8–12 min"];
    if (activity.indexOf("natation") !== -1) return ["1–2 lignes", material, "Départs espacés", "8–12 min"];
    if (anyContains(["football", "futsal", "basket", "handball", "volley"], activity)) return ["4–6 élèves", material, "Terrain réduit", "8 min"];
    if (anyContains(["gym", "acrosport", "lutte", "judo", "combat"], activity)) return ["Binômes", material, "Zone sécurisée", "8 min"];
    if (activity.indexOf("orientation") !== -1) return ["Binômes", material, "Zone délimitée", "10 min"];
    return ["4–8 élèves", material, "1 atelier", DURATION_MINUTES_LABEL];
  }

  function toExercise(item, type, sportPack, activityKey) {
    const guidance = guidanceForExercise(activityKey, item.title, item.instruction, sportPack.organization, item.duration);
    return {
      type: type.name,
      typeLabel: type.label,
      title: item.title,
      durationMinutes: item.duration,
      material: item.material,
      organization: sportPack.organization,
      instructions: item.instruction,
      steps: guidance.steps,
      infoChips: infoFor(activityKey, item.title, item.material),
      diagramKind: guidance.diagram,
      successCriteria: guidance.success,
      easier: guidance.easier,
      harder: guidance.harder,
      safety: sportPack.safety
    };
  }

  function forActivity(activityName, grade) {
    const activityKey = normalize(activityName);
    const sportPack = packFor(activityKey);
    // Textes de niveau calculés comme dans le Kotlin : ils restent des replis, la guidance
    // par tâche fournit les versions retenues dans chaque exercice.
    const gradeEasier = (grade === "SIXIEME" || grade === "CINQUIEME")
      ? "Réduire l’espace, la vitesse ou le nombre de contraintes ; démontrer avant de commencer."
      : "Réduire l’opposition ou la contrainte technique.";
    const gradeHarder = (grade === "QUATRIEME" || grade === "TROISIEME" || grade === "SECONDE" ||
      grade === "PREMIERE" || grade === "TERMINALE")
      ? "Ajouter une contrainte de temps, de précision ou une opposition raisonnée."
      : "Augmenter progressivement la distance, la vitesse ou le nombre d’actions.";
    void gradeEasier; void gradeHarder;

    const out = [];
    sportPack.warmups.slice(0, 3).forEach(function (item) {
      out.push(toExercise(item, QuickExerciseType.WARMUP, sportPack, activityKey));
    });
    sportPack.games.slice(0, 7).forEach(function (item) {
      out.push(toExercise(item, QuickExerciseType.GAME, sportPack, activityKey));
    });
    return out;
  }

  // ---------------------------------------------------------------------------
  // Schémas (QuickExerciseDiagram.kt)
  // ---------------------------------------------------------------------------

  const DiagramBlue = "#2F86DE";
  const DiagramOrange = "#F28A2C";
  const DiagramGreen = "#42A56F";
  const DiagramLine = "#9DB4C7";
  const DiagramBackground = "#F1F8FC";

  // Repère de dessin identique au Compose Canvas (ratio 1.85) ; tout est remis à l'échelle du canvas.
  const BASE_W = 555;
  const BASE_H = 300;

  function ctxOf(canvas) {
    return canvas.getContext("2d");
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function fillRoundRect(ctx, x, y, w, h, r, color) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeRoundRect(ctx, x, y, w, h, r, color, width) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function fillRect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function strokeRect(ctx, x, y, w, h, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.strokeRect(x, y, w, h);
  }

  function fillCircle(ctx, cx, cy, radius, color) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }

  function strokeCircle(ctx, cx, cy, radius, color, width) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function line(ctx, x1, y1, x2, y2, color, width) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function player(ctx, x, y, color) {
    fillCircle(ctx, BASE_W * x, BASE_H * y, 9, color);
  }

  function cone(ctx, x, y, color) {
    const cx = BASE_W * x;
    const cy = BASE_H * y;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 11);
    ctx.lineTo(cx - 9, cy + 8);
    ctx.lineTo(cx + 9, cy + 8);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    line(ctx, cx - 12, cy + 9, cx + 12, cy + 9, color, 4);
  }

  function arrow(ctx, x1, y1, x2, y2, color) {
    line(ctx, x1, y1, x2, y2, color, 6);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
    const ux = dx / length;
    const uy = dy / length;
    line(ctx, x2, y2, x2 - ux * 18 - uy * 10, y2 - uy * 18 + ux * 10, color, 6);
    line(ctx, x2, y2, x2 - ux * 18 + uy * 10, y2 - uy * 18 - ux * 10, color, 6);
  }

  // Raccourcis en coordonnées relatives (comme les Offset(size.width * x, …) du Kotlin).
  function ax(ctx, x1, y1, x2, y2, color) {
    arrow(ctx, BASE_W * x1, BASE_H * y1, BASE_W * x2, BASE_H * y2, color);
  }

  function drawShuttle(ctx, harder) {
    for (let i = 0; i < 5; i++) {
      player(ctx, 0.14, 0.30 + i * 0.10, DiagramBlue);
      player(ctx, 0.86, 0.30 + i * 0.10, DiagramOrange);
    }
    cone(ctx, 0.22, 0.20, DiagramBlue); cone(ctx, 0.78, 0.20, DiagramOrange);
    cone(ctx, 0.22, 0.82, DiagramBlue); cone(ctx, 0.78, 0.82, DiagramOrange);
    if (harder) {
      fillRect(ctx, BASE_W * 0.42, BASE_H * 0.16, BASE_W * 0.16, BASE_H * 0.68, "rgba(56,166,106,0.333)");
      ax(ctx, 0.28, 0.42, 0.56, 0.42, DiagramBlue);
      player(ctx, 0.48, 0.42, DiagramOrange);
    } else {
      ax(ctx, 0.24, 0.42, 0.75, 0.42, DiagramBlue);
      ax(ctx, 0.76, 0.64, 0.25, 0.64, DiagramOrange);
      fillRoundRect(ctx, BASE_W * 0.25, BASE_H * 0.37, 22, 7, 4, DiagramBlue);
    }
  }

  function drawRelayZone(ctx) {
    drawShuttle(ctx, true);
  }

  function drawLanes(ctx) {
    for (let i = 0; i < 4; i++) {
      line(ctx, BASE_W * 0.08, BASE_H * (0.2 + i * 0.18), BASE_W * 0.92, BASE_H * (0.2 + i * 0.18), DiagramLine, 3);
    }
    for (let i = 0; i < 3; i++) {
      player(ctx, 0.18, 0.29 + i * 0.18, i % 2 === 0 ? DiagramBlue : DiagramOrange);
      ax(ctx, 0.25, 0.29 + i * 0.18, 0.76, 0.29 + i * 0.18, DiagramBlue);
    }
  }

  function drawGrid(ctx) {
    strokeRect(ctx, BASE_W * 0.12, BASE_H * 0.12, BASE_W * 0.76, BASE_H * 0.76, "#FFFFFF", 4);
    for (let i = 0; i < 4; i++) {
      player(ctx, 0.30 + (i % 2) * 0.18, 0.34 + Math.floor(i / 2) * 0.26, DiagramBlue);
    }
    for (let i = 0; i < 2; i++) player(ctx, 0.64, 0.40 + i * 0.25, DiagramOrange);
    ax(ctx, 0.35, 0.5, 0.58, 0.5, DiagramGreen);
  }

  function drawSmallGame(ctx) {
    strokeRect(ctx, BASE_W * 0.08, BASE_H * 0.12, BASE_W * 0.84, BASE_H * 0.76, "#FFFFFF", 4);
    line(ctx, BASE_W * 0.5, BASE_H * 0.12, BASE_W * 0.5, BASE_H * 0.88, DiagramLine, 3);
    [[0.25, 0.32], [0.34, 0.62], [0.45, 0.43]].forEach(function (p) { player(ctx, p[0], p[1], DiagramBlue); });
    [[0.62, 0.34], [0.72, 0.62], [0.56, 0.58]].forEach(function (p) { player(ctx, p[0], p[1], DiagramOrange); });
    fillCircle(ctx, BASE_W * 0.5, BASE_H * 0.5, 6, DiagramGreen);
  }

  function drawTargets(ctx) {
    for (let i = 0; i < 3; i++) {
      strokeCircle(ctx, BASE_W * 0.78, BASE_H * 0.5, 28 - i * 8, i === 2 ? DiagramGreen : DiagramLine, 5);
    }
    player(ctx, 0.18, 0.5, DiagramBlue);
    ax(ctx, 0.25, 0.5, 0.67, 0.5, DiagramOrange);
  }

  function drawCircuit(ctx) {
    const points = [[0.2, 0.25], [0.72, 0.25], [0.72, 0.72], [0.2, 0.72]];
    points.forEach(function (p, i) { cone(ctx, p[0], p[1], i % 2 === 0 ? DiagramBlue : DiagramOrange); });
    for (let i = 0; i < points.length - 1; i++) {
      ax(ctx, points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], DiagramGreen);
    }
    ax(ctx, 0.68, 0.72, 0.25, 0.72, DiagramGreen);
  }

  function drawWall(ctx, variant) {
    fillRect(ctx, BASE_W * 0.12, BASE_H * 0.12, BASE_W * 0.76, BASE_H * 0.76, "#E8D8C8");
    for (let i = 0; i < 18; i++) {
      fillCircle(ctx, BASE_W * (0.18 + (i % 6) * 0.12), BASE_H * (0.25 + Math.floor(i / 6) * 0.22), 7,
        i % 3 === 0 ? DiagramOrange : DiagramBlue);
    }
    if (variant.indexOf("mémoire") !== -1 || variant.indexOf("lecture") !== -1) {
      const route = [[0.2, 0.7], [0.32, 0.48], [0.55, 0.55], [0.74, 0.3]];
      for (let i = 0; i < route.length - 1; i++) {
        ax(ctx, route[i][0], route[i][1], route[i + 1][0], route[i + 1][1], DiagramGreen);
      }
      for (let i = 0; i < 3; i++) player(ctx, 0.18 + i * 0.12, 0.94, DiagramLine);
    } else if (variant.indexOf("sécurité") !== -1) {
      for (let i = 0; i < 4; i++) {
        strokeRoundRect(ctx, BASE_W * (0.16 + i * 0.18), BASE_H * 0.75, BASE_W * 0.12, BASE_H * 0.1, 8,
          i === 3 ? DiagramGreen : DiagramLine, 4);
      }
      player(ctx, 0.18, 0.94, DiagramBlue);
      player(ctx, 0.3, 0.94, DiagramOrange);
    } else if (variant.indexOf("pause") !== -1) {
      [[0.25, 0.65], [0.48, 0.48], [0.7, 0.3]].forEach(function (p) {
        strokeCircle(ctx, BASE_W * p[0], BASE_H * p[1], 15, DiagramGreen, 5);
      });
      ax(ctx, 0.2, 0.72, 0.75, 0.32, DiagramGreen);
    } else {
      ax(ctx, 0.2, 0.72, 0.75, 0.32, DiagramGreen);
    }
  }

  function drawPool(ctx, variant) {
    fillRect(ctx, BASE_W * 0.08, BASE_H * 0.12, BASE_W * 0.84, BASE_H * 0.76, "#D9F4FF");
    for (let i = 0; i < 4; i++) {
      line(ctx, BASE_W * 0.1, BASE_H * (0.23 + i * 0.18), BASE_W * 0.9, BASE_H * (0.23 + i * 0.18), "rgba(47,134,222,0.55)", 3);
    }
    if (variant.indexOf("trésor") !== -1) {
      for (let i = 0; i < 5; i++) {
        strokeCircle(ctx, BASE_W * (0.62 + (i % 3) * 0.08), BASE_H * (0.3 + Math.floor(i / 3) * 0.25), 7, DiagramOrange, 4);
      }
      for (let i = 0; i < 3; i++) player(ctx, 0.16, 0.28 + i * 0.18, DiagramBlue);
      ax(ctx, 0.22, 0.46, 0.62, 0.46, DiagramGreen);
    } else if (variant.indexOf("coulée") !== -1) {
      for (let i = 0; i < 3; i++) {
        ax(ctx, 0.14, 0.25 + i * 0.18, 0.55 + i * 0.1, 0.25 + i * 0.18, DiagramOrange);
      }
    } else if (variant.indexOf("respiratoire") !== -1) {
      for (let i = 0; i < 4; i++) {
        strokeCircle(ctx, BASE_W * (0.3 + i * 0.14), BASE_H * 0.48, 8, DiagramGreen, 4);
      }
      ax(ctx, 0.16, 0.48, 0.82, 0.48, DiagramOrange);
    } else if (variant.indexOf("relais") !== -1) {
      for (let i = 0; i < 3; i++) player(ctx, 0.13, 0.27 + i * 0.18, DiagramBlue);
      ax(ctx, 0.2, 0.45, 0.8, 0.45, DiagramOrange);
      ax(ctx, 0.8, 0.63, 0.2, 0.63, DiagramGreen);
    } else {
      ax(ctx, 0.18, 0.41, 0.78, 0.41, DiagramOrange);
    }
  }

  function drawMatDuo(ctx, variant) {
    fillRoundRect(ctx, BASE_W * 0.14, BASE_H * 0.16, BASE_W * 0.72, BASE_H * 0.68, 18, "#E8F4EA");
    if (variant.indexOf("parcours") !== -1 || variant.indexOf("chemin") !== -1) {
      [[0.25, 0.3], [0.48, 0.5], [0.72, 0.32]].forEach(function (p) { cone(ctx, p[0], p[1], DiagramOrange); });
      ax(ctx, 0.2, 0.7, 0.76, 0.27, DiagramGreen);
      for (let i = 0; i < 3; i++) player(ctx, 0.18, 0.72 + i * 0.06, DiagramBlue);
    } else if (variant.indexOf("acrosport") !== -1) {
      player(ctx, 0.4, 0.58, DiagramBlue);
      player(ctx, 0.6, 0.58, DiagramBlue);
      player(ctx, 0.5, 0.38, DiagramOrange);
      player(ctx, 0.76, 0.7, DiagramLine);
    } else if (variant.indexOf("tortue") !== -1 || variant.indexOf("immobilisation") !== -1) {
      player(ctx, 0.48, 0.52, DiagramBlue);
      player(ctx, 0.55, 0.47, DiagramOrange);
      player(ctx, 0.78, 0.66, DiagramLine);
    } else if (variant.indexOf("foulard") !== -1 || variant.indexOf("trésor") !== -1) {
      player(ctx, 0.4, 0.5, DiagramBlue);
      player(ctx, 0.6, 0.5, DiagramOrange);
      fillCircle(ctx, BASE_W * 0.5, BASE_H * 0.5, 8, DiagramGreen);
      player(ctx, 0.78, 0.7, DiagramLine);
    } else {
      player(ctx, 0.4, 0.5, DiagramBlue);
      player(ctx, 0.6, 0.5, DiagramOrange);
      ax(ctx, 0.44, 0.5, 0.55, 0.5, DiagramGreen);
      player(ctx, 0.78, 0.7, DiagramLine);
    }
  }

  function drawCourt(ctx, variant) {
    strokeRect(ctx, BASE_W * 0.12, BASE_H * 0.12, BASE_W * 0.76, BASE_H * 0.76, "#FFFFFF", 4);
    line(ctx, BASE_W * 0.5, BASE_H * 0.12, BASE_W * 0.5, BASE_H * 0.88, DiagramLine, 5);
    if (variant.indexOf("service") !== -1 || variant.indexOf("zone") !== -1 || variant.indexOf("précision") !== -1) {
      player(ctx, 0.25, 0.68, DiagramBlue);
      [[0.68, 0.28], [0.78, 0.5], [0.68, 0.72]].forEach(function (p) {
        strokeCircle(ctx, BASE_W * p[0], BASE_H * p[1], 16, DiagramOrange, 5);
      });
      ax(ctx, 0.3, 0.63, 0.65, 0.32, DiagramGreen);
    } else if (variant.indexOf("montante") !== -1 || variant.indexOf("roi") !== -1) {
      for (let i = 0; i < 3; i++) {
        strokeRect(ctx, BASE_W * (0.1 + i * 0.29), BASE_H * 0.25, BASE_W * 0.22, BASE_H * 0.5, DiagramLine, 3);
      }
      for (let i = 0; i < 3; i++) {
        player(ctx, 0.16 + i * 0.29, 0.5, DiagramBlue);
        player(ctx, 0.26 + i * 0.29, 0.5, DiagramOrange);
      }
      ax(ctx, 0.25, 0.82, 0.74, 0.82, DiagramGreen);
    } else if (variant.indexOf("long-court") !== -1) {
      player(ctx, 0.25, 0.5, DiagramBlue);
      player(ctx, 0.72, 0.5, DiagramOrange);
      ax(ctx, 0.3, 0.42, 0.78, 0.25, DiagramGreen);
      ax(ctx, 0.3, 0.58, 0.58, 0.68, DiagramOrange);
    } else {
      player(ctx, 0.28, 0.5, DiagramBlue);
      player(ctx, 0.72, 0.5, DiagramOrange);
      ax(ctx, 0.34, 0.42, 0.67, 0.58, DiagramGreen);
    }
  }

  function drawMap(ctx, variant) {
    const centerX = BASE_W * 0.5;
    const centerY = BASE_H * 0.5;
    if (variant.indexOf("étoile") !== -1) {
      const posts = [[0.18, 0.2], [0.82, 0.2], [0.86, 0.7], [0.18, 0.78]];
      posts.forEach(function (p) {
        strokeCircle(ctx, BASE_W * p[0], BASE_H * p[1], 11, DiagramOrange, 5);
        line(ctx, centerX, centerY, BASE_W * p[0], BASE_H * p[1], DiagramGreen, 5);
      });
      for (let i = 0; i < 4; i++) {
        player(ctx, 0.45 + (i % 2) * 0.1, 0.45 + Math.floor(i / 2) * 0.1, DiagramBlue);
      }
    } else if (variant.indexOf("pose-dépose") !== -1) {
      strokeRect(ctx, BASE_W * 0.1, BASE_H * 0.12, BASE_W * 0.8, BASE_H * 0.76, "#FFFFFF", 3);
      player(ctx, 0.18, 0.75, DiagramBlue);
      player(ctx, 0.25, 0.75, DiagramOrange);
      [[0.3, 0.3], [0.55, 0.58], [0.78, 0.25]].forEach(function (p) {
        strokeCircle(ctx, BASE_W * p[0], BASE_H * p[1], 10, DiagramOrange, 5);
      });
      ax(ctx, 0.24, 0.68, 0.72, 0.3, DiagramGreen);
    } else if (variant.indexOf("score") !== -1) {
      for (let i = 0; i < 5; i++) {
        const x = 0.18 + (i % 3) * 0.3;
        const y = 0.25 + Math.floor(i / 3) * 0.45;
        strokeCircle(ctx, BASE_W * x, BASE_H * y, 11, i > 2 ? DiagramOrange : DiagramGreen, 5);
      }
      player(ctx, 0.5, 0.5, DiagramBlue);
    } else {
      ctx.beginPath();
      ctx.moveTo(BASE_W * 0.15, BASE_H * 0.72);
      ctx.bezierCurveTo(BASE_W * 0.3, BASE_H * 0.2, BASE_W * 0.55, BASE_H * 0.8, BASE_W * 0.82, BASE_H * 0.28);
      ctx.strokeStyle = DiagramGreen;
      ctx.lineWidth = 6;
      ctx.stroke();
      [[0.15, 0.72], [0.48, 0.52], [0.82, 0.28]].forEach(function (p) {
        strokeCircle(ctx, BASE_W * p[0], BASE_H * p[1], 11, DiagramOrange, 5);
      });
      for (let i = 0; i < 2; i++) player(ctx, 0.12 + i * 0.07, 0.8, DiagramBlue);
    }
  }

  function drawDance(ctx, variant) {
    strokeRect(ctx, BASE_W * 0.08, BASE_H * 0.1, BASE_W * 0.84, BASE_H * 0.75, "#FFFFFF", 3);
    if (variant.indexOf("miroir") !== -1 || variant.indexOf("question") !== -1) {
      for (let i = 0; i < 3; i++) {
        player(ctx, 0.32, 0.25 + i * 0.23, DiagramBlue);
        player(ctx, 0.68, 0.25 + i * 0.23, DiagramOrange);
      }
      for (let i = 0; i < 3; i++) {
        ax(ctx, 0.4, 0.25 + i * 0.23, 0.6, 0.25 + i * 0.23, DiagramGreen);
      }
    } else if (variant.indexOf("canon") !== -1) {
      for (let i = 0; i < 5; i++) {
        player(ctx, 0.2 + i * 0.14, 0.68 - i * 0.1, i === 0 ? DiagramOrange : DiagramBlue);
      }
      ax(ctx, 0.2, 0.75, 0.78, 0.25, DiagramGreen);
    } else if (variant.indexOf("chemins") !== -1 || variant.indexOf("marche") !== -1) {
      player(ctx, 0.18, 0.25, DiagramBlue);
      player(ctx, 0.18, 0.72, DiagramOrange);
      player(ctx, 0.82, 0.25, DiagramBlue);
      player(ctx, 0.82, 0.72, DiagramOrange);
      ax(ctx, 0.2, 0.28, 0.78, 0.68, DiagramGreen);
      ax(ctx, 0.2, 0.68, 0.78, 0.28, DiagramOrange);
    } else if (variant.indexOf("composition") !== -1 || variant.indexOf("phrase") !== -1) {
      for (let i = 0; i < 4; i++) {
        player(ctx, 0.32 + (i % 2) * 0.25, 0.32 + Math.floor(i / 2) * 0.28, i % 2 === 0 ? DiagramBlue : DiagramOrange);
      }
      fillRect(ctx, BASE_W * 0.08, BASE_H * 0.86, BASE_W * 0.84, BASE_H * 0.08, "#D8E7F2");
    } else {
      for (let i = 0; i < 5; i++) {
        player(ctx, 0.2 + i * 0.15, i % 2 === 0 ? 0.35 : 0.65, i % 2 === 0 ? DiagramBlue : DiagramOrange);
      }
      ax(ctx, 0.2, 0.5, 0.78, 0.5, DiagramGreen);
    }
  }

  function drawJuggle(ctx) {
    // Quatre zones individuelles vues du dessus : personne ne traverse l'espace de lancer voisin.
    [[0.08, 0.12], [0.52, 0.12], [0.08, 0.54], [0.52, 0.54]].forEach(function (p, index) {
      strokeRoundRect(ctx, BASE_W * p[0], BASE_H * p[1], BASE_W * 0.36, BASE_H * 0.32, 14, "#FFFFFF", 3);
      const cx = p[0] + 0.18;
      const cy = p[1] + 0.23;
      player(ctx, cx, cy, index % 2 === 0 ? DiagramBlue : DiagramOrange);
      fillCircle(ctx, BASE_W * (cx - 0.055), BASE_H * (cy - 0.11), 6, DiagramGreen);
      fillCircle(ctx, BASE_W * (cx + 0.055), BASE_H * (cy - 0.11), 6, DiagramOrange);
    });
  }

  function drawBalanceRoute(ctx) {
    ctx.beginPath();
    ctx.moveTo(BASE_W * 0.12, BASE_H * 0.7);
    ctx.bezierCurveTo(BASE_W * 0.3, BASE_H * 0.25, BASE_W * 0.55, BASE_H * 0.8, BASE_W * 0.84, BASE_H * 0.3);
    ctx.strokeStyle = DiagramLine;
    ctx.lineWidth = 8;
    ctx.stroke();
    [[0.18, 0.57], [0.43, 0.51], [0.7, 0.5]].forEach(function (p) { cone(ctx, p[0], p[1], DiagramOrange); });
    for (let i = 0; i < 3; i++) player(ctx, 0.1, 0.72 + i * 0.06, DiagramBlue);
    player(ctx, 0.28, 0.45, DiagramOrange);
    strokeCircle(ctx, BASE_W * 0.28, BASE_H * 0.35, 11, DiagramGreen, 5);
    ax(ctx, 0.32, 0.45, 0.76, 0.34, DiagramGreen);
  }

  function drawDevilStick(ctx) {
    // Binômes répartis dans quatre carrés de sécurité : un pratique, un observe hors de la trajectoire.
    [[0.08, 0.12], [0.52, 0.12], [0.08, 0.54], [0.52, 0.54]].forEach(function (p, index) {
      strokeRect(ctx, BASE_W * p[0], BASE_H * p[1], BASE_W * 0.36, BASE_H * 0.32, "#FFFFFF", 3);
      player(ctx, p[0] + 0.18, p[1] + 0.23, DiagramBlue);
      player(ctx, p[0] + 0.31, p[1] + 0.25, DiagramLine);
      line(ctx, BASE_W * (p[0] + 0.13), BASE_H * (p[1] + 0.12), BASE_W * (p[0] + 0.23), BASE_H * (p[1] + 0.09), DiagramOrange, 7);
      if (index === 0) ax(ctx, p[0] + 0.14, p[1] + 0.18, p[0] + 0.22, p[1] + 0.13, DiagramGreen);
    });
  }

  function drawDuoThrow(ctx) {
    player(ctx, 0.2, 0.62, DiagramBlue);
    player(ctx, 0.8, 0.62, DiagramOrange);
    ctx.beginPath();
    ctx.moveTo(BASE_W * 0.26, BASE_H * 0.57);
    ctx.bezierCurveTo(BASE_W * 0.4, BASE_H * 0.12, BASE_W * 0.62, BASE_H * 0.12, BASE_W * 0.74, BASE_H * 0.57);
    ctx.strokeStyle = DiagramGreen;
    ctx.lineWidth = 6;
    ctx.stroke();
    line(ctx, BASE_W * 0.48, BASE_H * 0.23, BASE_W * 0.55, BASE_H * 0.31, DiagramOrange, 11);
    cone(ctx, 0.14, 0.76, DiagramBlue);
    cone(ctx, 0.86, 0.76, DiagramOrange);
  }

  function drawCircusStage(ctx) {
    strokeRoundRect(ctx, BASE_W * 0.12, BASE_H * 0.12, BASE_W * 0.76, BASE_H * 0.58, 20, "#FFFFFF", 5);
    fillRect(ctx, BASE_W * 0.12, BASE_H * 0.76, BASE_W * 0.76, BASE_H * 0.12, "#D8E7F2");
    for (let i = 0; i < 4; i++) player(ctx, 0.31 + i * 0.13, 0.82, DiagramLine);
    player(ctx, 0.36, 0.4, DiagramBlue);
    player(ctx, 0.5, 0.32, DiagramOrange);
    player(ctx, 0.64, 0.4, DiagramGreen);
    ax(ctx, 0.17, 0.5, 0.3, 0.5, DiagramBlue);
    ax(ctx, 0.68, 0.5, 0.83, 0.5, DiagramOrange);
  }

  function drawDiagram(canvas, diagramKind, options) {
    if (!canvas || typeof canvas.getContext !== "function") return;
    const opts = options || {};
    const variant = String(opts.exerciseTitle || opts.title || "").toLowerCase();
    const harder = opts.harder === true;

    const dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    const cssW = canvas.clientWidth || canvas.width || BASE_W;
    const cssH = canvas.clientHeight || canvas.height || Math.round(cssW / 1.85);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);

    const ctx = ctxOf(canvas);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    // Le dessin est écrit dans le repère Compose d'origine puis étiré sur le canvas réel.
    ctx.scale(cssW / BASE_W, cssH / BASE_H);
    ctx.lineCap = "butt";

    fillRoundRect(ctx, 0, 0, BASE_W, BASE_H, 18, DiagramBackground);

    switch (diagramKind) {
      case QuickDiagramKind.SHUTTLE: drawShuttle(ctx, harder); break;
      case QuickDiagramKind.RELAY_ZONE: drawRelayZone(ctx); break;
      case QuickDiagramKind.LANES: drawLanes(ctx); break;
      case QuickDiagramKind.SMALL_GAME: drawSmallGame(ctx); break;
      case QuickDiagramKind.TARGETS: drawTargets(ctx); break;
      case QuickDiagramKind.CIRCUIT: drawCircuit(ctx); break;
      case QuickDiagramKind.WALL: drawWall(ctx, variant); break;
      case QuickDiagramKind.POOL: drawPool(ctx, variant); break;
      case QuickDiagramKind.MAT_DUO: drawMatDuo(ctx, variant); break;
      case QuickDiagramKind.COURT: drawCourt(ctx, variant); break;
      case QuickDiagramKind.MAP: drawMap(ctx, variant); break;
      case QuickDiagramKind.DANCE: drawDance(ctx, variant); break;
      case QuickDiagramKind.JUGGLE: drawJuggle(ctx); break;
      case QuickDiagramKind.BALANCE_ROUTE: drawBalanceRoute(ctx); break;
      case QuickDiagramKind.DEVIL_STICK: drawDevilStick(ctx); break;
      case QuickDiagramKind.DUO_THROW: drawDuoThrow(ctx); break;
      case QuickDiagramKind.CIRCUS_STAGE: drawCircusStage(ctx); break;
      case QuickDiagramKind.GRID:
      default: drawGrid(ctx); break;
    }
  }

  return {
    TYPE: QuickExerciseType,
    DIAGRAM_KINDS: QuickDiagramKind,
    forActivity: forActivity,
    drawDiagram: drawDiagram
  };
})();

// Exposition explicite : le fichier est chargé en script classique, sans module ni build.
if (typeof globalThis !== "undefined") globalThis.QuickExercises = QuickExercises;
