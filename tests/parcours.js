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
