/**
 * Le parcours du banc d'essai : ce qu'on ouvre, et dans quel ordre.
 *
 * Chaque etape porte un nom lisible et une action. Une etape echoue si elle leve, si la console
 * du site remonte une erreur pendant son execution, ou si le controle final n'est pas satisfait.
 *
 * On ne verifie pas les valeurs affichees - ce n'est pas le but. On verifie que l'ecran se
 * construit. C'est exactement ce qu'il faut pour decouper index.html : si une fonction part dans
 * un fichier qui se charge trop tard, un ecran cesse de se construire, et le banc le dit.
 */
(function () {

  /** Attend que la condition soit vraie, ou echoue au bout du delai. */
  async function attendre(condition, message, delai) {
    const fin = Date.now() + (delai || 4000);
    while (Date.now() < fin) {
      if (condition()) return;
      await new Promise(r => setTimeout(r, 60));
    }
    throw new Error(message);
  }

  const visible = el => !!el && el.offsetParent !== null;
  const rempli = el => !!el && el.innerHTML.trim().length > 0;

  /**
   * Construit le parcours pour une fenetre de site donnee.
   * @param {Window} f la fenetre du cadre qui porte le site
   */
  function parcours(f) {
    const $ = id => f.document.getElementById(id);
    const onglet = async (nom, controle) => {
      f.showTab(nom);
      await new Promise(r => setTimeout(r, 350));
      if (controle) await controle();
    };

    return [
      {
        nom: "Le site demarre et affiche l'accueil",
        action: async () => {
          await attendre(() => visible($("mainView")), "la vue principale ne s'affiche pas");
          await attendre(() => rempli($("tab-home")), "l'accueil reste vide");
        }
      },
      {
        nom: "Onglet CLASSE · rangee des classes",
        action: async () => {
          await onglet("classes");
          f.showSubtab("classes");
          await attendre(() => f.document.querySelectorAll("#importsList .classePuce").length > 0,
            "aucune classe dans la rangee");
        }
      },
      {
        nom: "Classe ouverte · tableau de bord",
        action: async () => {
          // On ouvre explicitement la classe du jeu d'essai qui a une activite, un cycle et une
          // dispense. Prendre "la premiere de la liste" faisait dependre le resultat de l'ordre
          // d'affichage, et un vrai defaut pouvait passer inapercu derriere une classe vide.
          const cible = [...f.document.querySelectorAll("#importsList .classePuce")]
            .find(b => b.textContent.startsWith("3e6"));
          if (!cible) throw new Error("la classe 3e6 du jeu d'essai est absente de la rangee");
          cible.click();
          await attendre(() => visible($("classDashboardPanel")) && rempli($("classDashboardPanel")),
            "le tableau de bord ne s'ouvre pas");
          await attendre(() => f.document.querySelector(".dashSeance"), "la carte de seance manque");
        }
      },
      {
        nom: "Tableau de bord · changement de periode",
        action: async () => {
          const p2 = f.document.querySelector('[data-dash-period="2"]');
          if (!p2) throw new Error("pas de selecteur de periode");
          p2.click();
          await new Promise(r => setTimeout(r, 250));
          if (!f.document.querySelector(".dashSeance")) throw new Error("la carte disparait en periode 2");
        }
      },
      {
        nom: "Tableau de bord · recapitulatif et dispenses",
        action: async () => {
          f.document.querySelector('[data-dash-period="1"]').click();
          await new Promise(r => setTimeout(r, 250));
          $("dashRecapBtn").click();
          await attendre(() => rempli($("dashDetail")), "le recapitulatif reste vide");
          $("dashDispenseBtn").click();
          await attendre(() => rempli($("dashDetail")), "les dispenses restent vides");
        }
      },
      {
        nom: "Tableau de bord · grilles d'evaluation proposees",
        action: async () => {
          $("dashEvalPonctuelle").click();
          // Le panneau lit la fiche de cycle sur le disque : il peut mettre un moment. On attend
          // qu'il ait fini de charger, puis on dit ce qu'il montre - un message precis vaut mieux
          // qu'un delai depasse, qui ne distingue pas la lenteur de l'absence.
          await attendre(() => !/Chargement/.test($("dashDetail").innerText),
            "le panneau des grilles reste sur Chargement", 12000);
          const proposees = f.document.querySelectorAll("#dashDetail [data-modele]").length;
          if (proposees < 1) throw new Error("aucune grille proposee — le panneau affiche : "
            + $("dashDetail").innerText.slice(0, 160));
        }
      },
      {
        nom: "Classe ouverte · emploi du temps",
        action: async () => {
          const bouton = f.document.querySelector('#classDashboardPanel [data-classe-action="schedule"]');
          if (!bouton) throw new Error("le bouton Emploi du temps a disparu du tableau de bord");
          bouton.click();
          await attendre(() => visible($("classSchedulePanel")) && rempli($("classSchedulePanel")),
            "l'emploi du temps ne s'affiche pas", 6000);
          await attendre(() => !/Chargement/.test($("classSchedulePanel").innerText),
            "l'emploi du temps reste sur Chargement", 6000);
        }
      },
      {
        nom: "Onglet CLASSE · liste des eleves",
        action: async () => {
          await onglet("classes");
          f.showSubtab("liste");
          await attendre(() => rempli($("listeEleveList")), "la liste des eleves reste vide", 6000);
        }
      },
      {
        nom: "Onglet CLASSE · creation de classe",
        action: async () => {
          f.showSubtab("newimport");
          await attendre(() => visible($("subtab-newimport")), "l'ecran de creation ne s'affiche pas");
        }
      },
      {
        nom: "Onglet COURS · apercu d'un cycle",
        action: async () => {
          await onglet("cours");
          f.showCoursTab("cycles");
          await attendre(() => rempli($("cyclePreview")), "l'apercu du cycle reste vide", 6000);
        }
      },
      {
        nom: "Onglet COURS · liste des cours et fiche de seance",
        action: async () => {
          f.showCoursTab("cours");
          await attendre(() => f.document.querySelector('#cyclesList [data-action="open"]'),
            "aucun cours dans la liste", 6000);
          f.document.querySelector('#cyclesList [data-action="open"]').click();
          await attendre(() => f.document.querySelectorAll("#createdCoursePanel [data-session]").length > 0,
            "le cours ne liste pas ses seances", 6000);
          f.document.querySelector("#createdCoursePanel [data-session]").click();
          await attendre(() => visible($("sessionSheet")) && rempli($("sessionSheet")),
            "la fiche de seance ne s'affiche pas", 6000);
        }
      },
      {
        nom: "Onglet COURS · evaluations d'un cours",
        action: async () => {
          f.showCoursTab("cours");
          await attendre(() => f.document.querySelector('#cyclesList [data-action="evaluations"]:not([disabled])'),
            "aucun cours avec evaluations", 6000);
          f.document.querySelector('#cyclesList [data-action="evaluations"]').click();
          await attendre(() => visible($("evaluationPanel")) && f.document.querySelector(".accType"),
            "le panneau d'evaluations n'affiche pas ses types de grille", 8000);
        }
      },
      {
        nom: "Onglet COURS · tableau de notes d'une grille",
        action: async () => {
          // Le chemin le plus utile hors connexion : ouvrir une grille et voir ses criteres.
          // Il lit trois tables d'un coup, dont les notes effacees, qu'on garde pour reutiliser
          // leur ligne au lieu d'en creer une nouvelle a chaque resaisie.
          //
          // Les grilles sont repliees par type : il faut deplier avant de pouvoir en ouvrir une.
          await attendre(() => f.document.querySelector(".accType"),
            "le panneau d'evaluations n'affiche aucun type de grille", 8000);
          (f.document.querySelector('.accType[data-type="PONCTUELLE"]')
            || f.document.querySelector(".accType")).click();
          await attendre(() => f.document.querySelector("[data-open-eval]"),
            "aucune grille a ouvrir dans le panneau d'evaluations", 6000);
          f.document.querySelector("[data-open-eval]").click();
          await attendre(() => rempli($("evalTableWrap")), "le tableau de notes reste vide", 6000);
          await attendre(() => !/Chargement/.test($("evalTableWrap").innerText),
            "le tableau de notes reste sur Chargement", 6000);
        }
      },
      {
        nom: "Onglet PLANNING · emploi du temps",
        action: async () => {
          await onglet("planning");
          await attendre(() => rempli($("tab-programmation")), "le planning reste vide", 6000);
        }
      },
      {
        nom: "Onglet PLANNING · planning global EPS",
        action: async () => {
          f.showPlanningTab("eps");
          await attendre(() => rempli($("planningEpsWrap")) || rempli($("tab-programmation")),
            "le planning EPS reste vide", 6000);
        }
      },
      {
        nom: "Onglet PROGRAMMATION",
        action: async () => {
          await onglet("programmation");
          await attendre(() => rempli($("tab-programmation")), "la programmation reste vide", 6000);
        }
      },
      {
        nom: "Onglet EQUIPEMENT · installations",
        action: async () => {
          await onglet("equipement");
          await attendre(() => rempli($("installationsList")), "les installations restent vides", 6000);
        }
      },
      {
        nom: "Onglet ASLVH",
        action: async () => {
          await onglet("unss");
          // Sur son propre conteneur, et pas sur celui de "Liste eleve" sous Classe : les deux
          // affichent le meme repertoire, et l'ecran restait vide quand la cible n'etait pas
          // remise en place en ouvrant l'onglet.
          await attendre(() => rempli($("unssList")), "la liste ASLVH reste vide", 6000);
        }
      },
      {
        nom: "ASLVH · l'import annonce ce qu'il va faire",
        action: async () => {
          // On va jusqu'au recapitulatif, puis on annule : le banc ne doit rien enregistrer.
          //
          // Les en-tetes sont ceux d'un vrai export d'etablissement, parentheses et pluriels
          // compris. "Ne(e) le" et "Mail parents" n'etaient pas reconnus : les deux colonnes
          // restaient muettes, et reimporter un fichier enrichi n'ajoutait aucun mail parent.
          await onglet("unss");
          const lignes = [
            "Nom;Prénom;Né(e) le;Classe;Sexe;Mail élève;Mail parents",
            "MARTIN;Lea;12/05/2011;3-06;Féminin;lea.martin@lycee.fr;famille.martin@exemple.fr",
            "NOUVEAU;Eleve;01/01/2012;5-01;Masculin;nouveau@lycee.fr;famille.nouveau@exemple.fr"
          ];
          await f.importUnssCsv(lignes.join(String.fromCharCode(10)), false);
          await attendre(() => $("importValider"), "le recapitulatif d'import ne s'affiche pas", 6000);
          const texte = $("unssList").innerText;
          if (!/doublon cree/.test(texte)) throw new Error("le recapitulatif ne compte pas les doublons");
          if (!/eleve\(s\) reconnu\(s\)/.test(texte)) throw new Error("le recapitulatif ne compte pas les reconnus");

          // Une colonne lue apparait soit comme un trou a combler, soit comme une divergence -
          // selon ce que porte deja la fiche. Ce qu'on verifie ici, c'est qu'elle est lue.
          const lues = f.eval(`importEnCours.reconnus.map(r =>
            r.aCompleter.map(c => c.champ).concat(r.divergences.map(d => d.champ)).join(",")).join(" | ")`);
          for (const attendu of ["parent_email", "birth_date_epoch_millis", "division"]) {
            if (!lues.includes(attendu)) {
              throw new Error(`la colonne ${attendu} n'est pas lue — lues : ${lues || "aucune"}`);
            }
          }

          $("importAnnuler").click();
          await attendre(() => !$("importValider"), "l'annulation ne referme pas le recapitulatif");
        }
      },
      {
        nom: "Onglet OUTILS",
        action: async () => {
          await onglet("outils");
          await attendre(() => rempli($("tab-outils")), "les outils restent vides");
        }
      },
      {
        nom: "Onglet SANTE / ACCIDENT",
        action: async () => {
          await onglet("health");
          await attendre(() => rempli($("healthBody")), "l'ecran sante reste vide", 6000);
        }
      },
      {
        nom: "Recherche generale",
        action: async () => {
          const bouton = $("searchBtn");
          if (!bouton) throw new Error("le bouton Rechercher a disparu");
          bouton.click();
          await new Promise(r => setTimeout(r, 300));
        }
      },
      {
        // Tout le raccordement hors connexion passe desormais par ces trois fonctions. Le banc
        // verifiait que les ecrans se construisent, pas qu'une saisie ressorte : c'est par ce
        // trou que sont passees les regressions de la nuit du 3 au 4 septembre 2026.
        nom: "Hors connexion · lecture d'une table non suivie",
        action: async () => {
          if (typeof f.lireTable !== "function") throw new Error("lireTable a disparu");
          const appels = (f.__fauxServeur || {}).appels;
          const avant = appels ? appels.length : null;
          const lignes = await f.lireTable("table_inexistante", "classes?deleted=eq.false&select=*");
          if (!Array.isArray(lignes)) throw new Error("lireTable doit rendre un tableau");
          if (avant !== null && appels.length === avant) {
            throw new Error("une table non suivie doit etre lue sur le serveur");
          }
        }
      },
      {
        nom: "Hors connexion · une saisie part bien vers le serveur",
        action: async () => {
          if (typeof f.enregistrerLigne !== "function") throw new Error("enregistrerLigne a disparu");
          const appels = (f.__fauxServeur || {}).appels;
          const avant = appels ? appels.length : 0;
          // Table volontairement non suivie : une table suivie partirait dans la file locale, et
          // le faux serveur ne verrait rien - ce qui est justement le bon comportement.
          await f.enregistrerLigne("table_inexistante", { id: "essai-banc", name: "Essai" });
          if (appels && appels.length <= avant) throw new Error("rien n'a ete envoye");
        }
      },
      {
        nom: "Hors connexion · un effacement laisse une trace",
        action: async () => {
          if (typeof f.supprimerLigne !== "function") throw new Error("supprimerLigne a disparu");
          await f.supprimerLigne("table_inexistante", "essai-banc");
          const appels = ((f.__fauxServeur || {}).appels) || [];
          const dernier = appels[appels.length - 1];
          // Un DELETE effacerait la ligne pour de bon : elle reviendrait a la synchronisation
          // suivante, puisque la copie locale la porte encore.
          if (dernier && dernier.methode === "DELETE") {
            throw new Error("l'effacement doit marquer la ligne, pas la retirer");
          }
        }
      },
      {
        nom: "Hors connexion · une table suivie ne part pas en direct",
        action: async () => {
          if (typeof f.tableSuivie !== "function") throw new Error("tableSuivie a disparu");
          if (!f.tableSuivie("classes")) return; // mode hors connexion absent : rien a verifier
          const appels = (f.__fauxServeur || {}).appels || [];
          const avant = appels.length;
          await f.enregistrerLigne("classes", { id: "essai-suivi", name: "Essai" });
          // Elle doit entrer dans la file locale. Un envoi direct court-circuiterait le moteur,
          // et la saisie serait perdue des qu'il n'y a plus de reseau.
          const envoisDirects = appels.slice(avant).filter(a => a.methode !== "GET");
          if (envoisDirects.length) throw new Error("une table suivie doit passer par la file locale");
        }
      },
      {
        // Le contexte d'equipe est une fonction SQL couteuse. Rejoue a chaque affichage de la
        // liste des classes, il devenait un appel par rafraichissement d'ecran - donc toutes les
        // secondes pendant une synchronisation. Il est retenu le temps de la session ; ce
        // controle mesure qu'il l'est vraiment, sur un parcours qui ouvre tous les onglets.
        nom: "Le contexte d'equipe n'est demande qu'une fois",
        action: async () => {
          const appels = ((f.__fauxServeur || {}).appels) || [];
          if (!appels.length) return; // faux serveur absent : rien a mesurer
          if (typeof f.loadTeamContext === "function") { await f.loadTeamContext(); await f.loadTeamContext(); }
          const demandes = appels.filter(a => String(a.url).includes("eps_team_context")).length;
          if (demandes > 1) throw new Error(`${demandes} appels au contexte d'equipe, un seul est attendu`);
        }
      },
      {
        // Un niveau peut porter deux activites dans la meme periode : natation le mercredi,
        // escalade le vendredi. Le tableau de bord n'en montrait qu'une et enchainait les seances
        // sur tous les jours confondus, si bien que la seance du vendredi s'affichait en natation.
        nom: "Tableau de bord · deux activites dans une periode",
        action: async () => {
          if (typeof f.groupesDuJour !== "function") throw new Error("groupesDuJour a disparu");
          const creneaux = [{ id: "s1", day_of_week: "MERCREDI" }, { id: "s2", day_of_week: "VENDREDI" }];
          const act = (a, b) => [{ slot_id: "s1", period_number: 1, apsa_name: a },
                                 { slot_id: "s2", period_number: 1, apsa_name: b }];

          const meme = f.groupesDuJour(1, creneaux, act("Natation", "Natation"));
          if (meme.length !== 1) throw new Error("une seule activite doit rester un seul compteur");
          if (meme[0].creneaux.length !== 2) throw new Error("les deux creneaux doivent se rejoindre");
          if (f.ongletsJourHtml(meme, meme[0]) !== "") throw new Error("pas d'onglets pour une seule activite");

          const deux = f.groupesDuJour(1, creneaux, act("Natation", "Escalade"));
          if (deux.length !== 2) throw new Error("deux activites doivent donner deux groupes");
          if (deux[0].jour !== "MERCREDI" || deux[1].jour !== "VENDREDI") throw new Error("groupes mal ordonnes");
          if (deux[0].creneaux.length !== 1) throw new Error("chaque jour ne garde que son creneau");

          // Le cycle est cree dans Cours, l'activite posee dans Programmation : casse et accents
          // different sans que personne ait rien fait d'incoherent.
          if (f.groupesDuJour(1, creneaux, act("Éducation", "education")).length !== 1) {
            throw new Error("accents et casse ne doivent pas separer deux fois la meme activite");
          }

          const html = f.ongletsJourHtml(deux, deux[0]);
          if (!html.includes("Mercredi") || !html.includes("Natation")) throw new Error("libelle d'onglet incomplet");
          if ((html.match(/<svg/g) || []).length !== 2) throw new Error("il manque un pictogramme");
        }
      },
      {
        // Le repertoire AS ecrit le sexe "M" ou "F", les eleves de classe "GARCON" ou "FILLE".
        // Le versement recopiait tel quel : aucune option ne reconnaissait la valeur, et le
        // navigateur affichait la premiere - "FILLE" - pour tous les eleves verses.
        nom: "Le sexe se traduit entre le repertoire AS et les classes",
        action: async () => {
          if (typeof f.sexFromValue !== "function") throw new Error("sexFromValue a disparu");
          if (f.sexFromValue("M") !== "GARCON") throw new Error("M doit devenir GARCON");
          if (f.sexFromValue("F") !== "FILLE") throw new Error("F doit devenir FILLE");
          if (f.sexFromValue("") !== null) throw new Error("une valeur vide n'est pas un sexe");

          // Et l'affichage ne doit jamais faire passer une valeur inconnue pour la premiere option.
          const ligne = f.editStudentRowHtml(0, { last_name: "X", first_name: "Y", sex: "M" });
          const selectionne = (ligne.match(/<option value="(\w+)" selected>/) || [])[1];
          if (selectionne === "FILLE") throw new Error("un garcon ne doit pas s'afficher en fille");
        }
      },
      {
        // Les actions de la classe vivaient tout en bas du panneau : il fallait derouler pour
        // ouvrir l'emploi du temps d'une classe qu'on venait d'ouvrir.
        nom: "Classe · les actions sont sur la ligne du titre",
        action: async () => {
          await onglet("classes");
          const puce = $("importsList")?.querySelector(".classePuce");
          if (!puce) return; // aucune classe dans le jeu d'essai
          puce.click();
          await attendre(() => $("classDashboardPanel")?.querySelector(".dashActions"),
            "les actions de la classe ont disparu", 6000);
          const titre = $("classDashboardPanel").querySelector("h2").getBoundingClientRect();
          const premier = $("classDashboardPanel").querySelector(".dashActions > button").getBoundingClientRect();
          const memeLigne = Math.abs((titre.top + titre.height / 2) - (premier.top + premier.height / 2)) < 40;
          if (!memeLigne) throw new Error("les actions ne sont plus sur la ligne du titre");
          if (premier.left < titre.right) throw new Error("les actions chevauchent le nom de la classe");
        }
      },
      {
        nom: "Classe · Modifier s'ouvre en fenetre",
        action: async () => {
          const bouton = $("classDashboardPanel")?.querySelector('[data-classe-action="edit"]');
          if (!bouton) return;
          bouton.click();
          await attendre(() => f.document.getElementById("editImportOverlay")?.classList.contains("open"),
            "la fenetre de modification ne s'ouvre pas", 6000);
          const voile = f.document.getElementById("editImportOverlay");
          if (!voile.contains(f.document.getElementById("editImportPanel"))) {
            throw new Error("le panneau n'est pas dans la fenetre");
          }
          if (f.getComputedStyle(voile).position !== "fixed") throw new Error("la fenetre ne recouvre pas la page");

          // Neuf colonnes dans une feuille de 620 px : les noms se reduisaient a une lettre. La
          // fenetre prend la place disponible, et le tableau glisse au lieu d'etre ecrase.
          const feuille = voile.querySelector(".searchSheet");
          if (feuille.getBoundingClientRect().width < 700) throw new Error("la fenetre est restee etroite");
          const zone = f.document.querySelector("#editImportPanel .tableDefilante");
          if (!zone) throw new Error("le tableau n'a plus de zone de defilement");
          if (f.getComputedStyle(zone).overflowX !== "auto") throw new Error("le tableau ne glisse pas");

          f.document.getElementById("closeEditBtn")?.click();
          await attendre(() => !f.document.getElementById("editImportOverlay").classList.contains("open"),
            "la fenetre ne se ferme pas", 4000);
        }
      },
      {
        // Licencier un eleve, ajouter un membre, ouvrir un groupe : sept panneaux partagent le
        // meme conteneur et s'affichaient dans le flux de l'onglet, plus bas, hors de vue.
        nom: "ASLVH · les panneaux s'ouvrent en fenetre",
        action: async () => {
          await onglet("unss");
          if (typeof f.openUnssPickPanel !== "function") throw new Error("le choix d'un licencie a disparu");
          f.openUnssPickPanel();
          await attendre(() => f.document.getElementById("unssPanelOverlay")?.classList.contains("open"),
            "la fenetre ASLVH ne s'ouvre pas", 6000);
          const voile = f.document.getElementById("unssPanelOverlay");
          if (!voile.contains(f.document.getElementById("unssPanel"))) {
            throw new Error("le panneau n'est pas dans la fenetre");
          }
          if (f.getComputedStyle(voile).position !== "fixed") throw new Error("la fenetre ne recouvre pas la page");
          // Le bandeau de recherche doit rester : c'est par lui qu'on retrouve un eleve.
          if (!f.document.querySelector("#unssPanel input[type=search]")) {
            throw new Error("le champ de recherche a disparu");
          }
          // Et le meme tableau que la Liste eleve : dans un repertoire de mille huit cents noms,
          // une liste de noms seuls ne permet pas de distinguer deux homonymes.
          const colonnes = [...f.document.querySelectorAll("#unssPanel .eleveTable thead th")]
            .map(t => t.textContent.trim().replace(/[▲▼]/g, "").trim());
          ["Nom", "Prenom", "Naissance", "Division", "Sexe"].forEach(attendue => {
            if (!colonnes.includes(attendue)) throw new Error(`colonne ${attendue} absente du tableau de licence`);
          });
          if (!f.document.getElementById("unssPickCount")) throw new Error("le compteur a disparu");
          f.document.getElementById("unssPickCancel")?.click();
          await attendre(() => !f.document.getElementById("unssPanelOverlay").classList.contains("open"),
            "la fenetre ASLVH ne se ferme pas", 4000);
        }
      },
      {
        nom: "Reglages",
        action: async () => {
          f.openSettings();
          await attendre(() => rempli($("settingsBody")) || rempli($("settingsOverlay")),
            "les reglages restent vides", 8000);
          const fermer = $("closeSettingsBtn");
          if (fermer) fermer.click();
        }
      }
    ];
  }

  window.__parcours = parcours;
})();
