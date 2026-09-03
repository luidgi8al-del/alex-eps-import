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
          f.document.querySelector("#importsList .classePuce").click();
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
          await attendre(() => f.document.querySelectorAll("#dashDetail [data-modele]").length >= 1,
            "aucune grille ponctuelle proposee", 6000);
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
          await attendre(() => visible($("evaluationPanel")) && rempli($("evaluationPanel")),
            "le panneau d'evaluations reste vide", 6000);
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
          await attendre(() => rempli($("tab-unss")), "l'ecran ASLVH reste vide", 6000);
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
