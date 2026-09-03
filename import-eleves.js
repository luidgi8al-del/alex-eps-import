/*
 * Rapprochement d'un fichier d'eleves avec le repertoire deja enregistre.
 *
 * Un second fichier n'est pas un nouvel import : c'est une mise a jour. Un export d'etablissement
 * arrive rarement complet du premier coup - les mails des parents manquent, les dates de naissance
 * aussi - et il faut pouvoir le reimporter enrichi sans se retrouver avec deux fois le college.
 *
 * Ce fichier ne touche ni au reseau ni a l'ecran : il compare deux listes et dit ce qu'il faut
 * faire. C'est ce qui permet de le mettre a l'epreuve sur des cas precis - homonymes, dates
 * contradictoires, colonnes absentes - plutot que de les decouvrir sur un vrai etablissement.
 */
(function () {

  /**
   * Les champs qu'un import peut renseigner, et leur libelle a l'ecran.
   *
   * La categorie UNSS n'y figure pas : elle se deduit de la date de naissance, donc elle se
   * recalcule apres coup au lieu d'etre comparee. La rapprocher reviendrait a demander au
   * professeur d'arbitrer entre deux resultats du meme calcul.
   */
  const CHAMPS = [
    ["last_name", "Nom"],
    ["first_name", "Prenom"],
    ["birth_date_epoch_millis", "Date de naissance"],
    ["sex", "Sexe"],
    ["division", "Division"],
    ["student_email", "Mail eleve"],
    ["parent_email", "Mail parent"],
    ["wish1", "Voeu 1"],
    ["wish2", "Voeu 2"],
    ["wish3", "Voeu 3"]
  ];
  const LIBELLES = Object.fromEntries(CHAMPS);

  const ACCENTS = /[̀-ͯ]/g;

  function texteNormalise(valeur) {
    return String(valeur ?? "").normalize("NFD").replace(ACCENTS, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  /** Vide au sens de l'import : rien a apporter, rien a ecraser. */
  function estVide(valeur) {
    return valeur === null || valeur === undefined || String(valeur).trim() === "";
  }

  /**
   * Deux dates de naissance designent-elles le meme jour ?
   *
   * Une date de naissance est un jour, pas un instant. Comparer les millisecondes faisait
   * apparaitre le 12 mai comme different du 12 mai des que les deux valeurs n'avaient pas ete
   * enregistrees par le meme chemin - l'import du repertoire retient minuit heure locale, celui
   * d'une classe minuit UTC. Deux heures d'ecart suffisaient a reclamer un arbitrage sur chaque
   * fiche, ou pire, a prendre une personne pour une autre.
   */
  function memeJour(a, b) {
    const jourDe = valeur => {
      const d = new Date(Number(valeur));
      return isNaN(d) ? null : `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    };
    const jourA = jourDe(a), jourB = jourDe(b);
    return jourA !== null && jourA === jourB;
  }

  /** Deux valeurs disent-elles la meme chose ? Les mails se comparent sans casse ni espaces. */
  function memeValeur(champ, a, b) {
    if (champ.endsWith("email")) return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    if (champ === "birth_date_epoch_millis") return memeJour(a, b);
    return texteNormalise(a) === texteNormalise(b);
  }

  function cleIdentite(eleve) {
    return texteNormalise(eleve.last_name) + "|" + texteNormalise(eleve.first_name);
  }

  function mailNormalise(eleve) {
    const mail = String(eleve.student_email ?? "").trim().toLowerCase();
    return mail.includes("@") ? mail : "";
  }

  /**
   * Les deux dates peuvent-elles designer la meme personne ?
   * Une date absente d'un cote ne prouve rien : elle ne doit ni confirmer ni infirmer.
   */
  function datesCompatibles(a, b) {
    if (estVide(a) || estVide(b)) return true;
    return memeJour(a, b);
  }

  /**
   * Rapproche les eleves d'un fichier de ceux deja enregistres.
   *
   * Deux criteres, du plus sur au plus fragile : le mail de l'eleve, puis nom + prenom avec la
   * date de naissance comme garde-fou. Les exports d'etablissement ne portent pas d'identifiant
   * national : le mail est donc la seule cle vraiment stable dont on dispose.
   *
   * Des qu'un rapprochement n'est pas sur, il n'est pas fait : il est pose de cote pour que le
   * professeur tranche. Mieux vaut une question qu'une fusion silencieuse entre deux personnes.
   *
   * @param {object[]} existants eleves deja au repertoire
   * @param {object[]} importes  eleves lus dans le fichier
   */
  function rapprocherEleves(existants, importes) {
    const candidats = existants.map(eleve => ({ eleve, pris: false }));

    const parMail = new Map();
    const parNom = new Map();
    const ranger = (index, cle, candidat) => {
      if (!cle) return;
      if (!index.has(cle)) index.set(cle, []);
      index.get(cle).push(candidat);
    };
    for (const candidat of candidats) {
      ranger(parMail, mailNormalise(candidat.eleve), candidat);
      ranger(parNom, cleIdentite(candidat.eleve), candidat);
    }

    const reconnus = [];
    const nouveaux = [];
    const ambigus = [];

    /** Cherche l'eleve deja enregistre qui correspond a une ligne du fichier. */
    function chercher(importe) {
      const libres = liste => (liste || []).filter(c => !c.pris);

      const mail = mailNormalise(importe);
      if (mail) {
        const trouves = libres(parMail.get(mail));
        if (trouves.length === 1) return { statut: "sur", candidat: trouves[0], critere: "mail" };
        if (trouves.length > 1) {
          return { statut: "ambigu", candidats: trouves,
                   raison: "Plusieurs eleves du repertoire portent deja ce mail." };
        }
      }

      const memeNom = libres(parNom.get(cleIdentite(importe)));
      // Une date de naissance qui contredit ecarte le candidat : c'est un homonyme, pas la meme
      // personne. Une date absente d'un cote ne tranche rien, dans un sens comme dans l'autre -
      // sans cette tolerance, un premier import sans dates rendrait tout le fichier ambigu.
      const compatibles = memeNom.filter(c =>
        datesCompatibles(c.eleve.birth_date_epoch_millis, importe.birth_date_epoch_millis));
      if (compatibles.length === 1) return { statut: "sur", candidat: compatibles[0], critere: "nom" };
      if (compatibles.length > 1) {
        return { statut: "ambigu", candidats: compatibles,
                 raison: "Plusieurs eleves portent ce nom et ce prenom, sans date de naissance pour les distinguer." };
      }
      // Meme nom mais dates contradictoires : ce sont d'autres personnes, l'eleve est nouveau.
      return { statut: "nouveau" };
    }

    for (const importe of importes) {
      const trouve = chercher(importe);
      if (trouve.statut === "sur") {
        trouve.candidat.pris = true;
        reconnus.push(comparer(trouve.candidat.eleve, importe, trouve.critere));
      } else if (trouve.statut === "ambigu") {
        ambigus.push({ importe, raison: trouve.raison, candidats: trouve.candidats.map(c => c.eleve) });
      } else {
        nouveaux.push(importe);
      }
    }

    return {
      reconnus, nouveaux, ambigus,
      // Un eleve present au repertoire et absent du fichier n'est pas touche : un export partiel
      // ne vaut pas suppression. C'est ce qui permet d'importer une classe a la fois.
      absentsDuFichier: candidats.filter(c => !c.pris).map(c => c.eleve),
      resume: {
        reconnus: reconnus.length,
        completes: reconnus.filter(r => r.aCompleter.length > 0).length,
        divergences: reconnus.reduce((total, r) => total + r.divergences.length, 0),
        nouveaux: nouveaux.length,
        ambigus: ambigus.length,
        doublons: 0
      }
    };
  }

  /** Ce que le fichier apporte a une fiche : des trous a combler, et parfois un desaccord. */
  function comparer(existant, importe, critere) {
    const aCompleter = [];
    const divergences = [];
    for (const [champ] of CHAMPS) {
      const nouvelle = importe[champ];
      if (estVide(nouvelle)) continue;
      const ancienne = existant[champ];
      if (estVide(ancienne)) { aCompleter.push({ champ, valeur: nouvelle }); continue; }
      if (!memeValeur(champ, ancienne, nouvelle)) divergences.push({ champ, ancienne, nouvelle });
    }
    return { existant, importe, critere, aCompleter, divergences };
  }

  /**
   * Construit la fiche a enregistrer, une fois les desaccords tranches.
   *
   * Par defaut l'ancienne valeur reste : une divergence non tranchee ne doit rien changer.
   * @param {object} choix par champ : "nouvelle" pour prendre celle du fichier
   */
  function ficheFusionnee(reconnu, choix = {}) {
    const fiche = { ...reconnu.existant };
    reconnu.aCompleter.forEach(({ champ, valeur }) => { fiche[champ] = valeur; });
    reconnu.divergences.forEach(({ champ, nouvelle }) => {
      if (choix[champ] === "nouvelle") fiche[champ] = nouvelle;
    });
    return fiche;
  }

  // Surface publique du module.
  globalThis.ImportEleves = {
    CHAMPS, LIBELLES, estVide, memeValeur, memeJour, texteNormalise,
    rapprocherEleves, ficheFusionnee
  };
})();
