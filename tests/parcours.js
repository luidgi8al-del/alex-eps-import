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
    /**
     * Ouvrir une classe mene a son tableau de bord, comme dans l'application ; les seances sont
     * derriere la carte "Progression du cycle" (data-vue="cours").
     */
    /** Revenir au tableau de bord, depuis l'ecran Cours ou depuis l'un de ses ecrans. */
    async function entrerDansMenu() {
      const surLeTableauDeBord = () => f.document.querySelector('#classDashboardPanel [data-vue="evaluations"].ec-indic');
      // Depuis le tableau de bord, la fleche ferme la classe : on ne la touche qu'ailleurs.
      for (let i = 0; i < 3 && !surLeTableauDeBord(); i++) {
        const retour = f.document.getElementById("retourMenuDepuisCours")
          || f.document.querySelector("#classDashboardPanel [data-ec-retour]");
        if (!retour) break;
        retour.click();
        await new Promise(r => setTimeout(r, 150));
      }
      await attendre(surLeTableauDeBord, "le tableau de bord de la classe ne revient pas", 6000);
    }

    async function entrerDansCours() {
      // Le menu arrive apres la lecture du serveur : on l'attend, au lieu de conclure trop tot
      // qu'il manque.
      await attendre(() => f.document.querySelector('#classDashboardPanel [data-vue="cours"]')
        || f.document.querySelector("#classDashboardPanel .periodBar"),
        "le menu de la classe ne s'affiche pas", 8000);
      const carte = f.document.querySelector('#classDashboardPanel [data-vue="cours"]');
      if (carte) {
        carte.click();
        await attendre(() => f.document.querySelector("#classDashboardPanel .periodBar"),
          "l'ecran Cours ne s'ouvre pas depuis le menu", 6000);
      }
    }
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
            "le tableau de bord de la classe ne s'ouvre pas");
          // Le tableau de bord d'abord, comme dans l'application : ses cartes menent aux ecrans.
          await attendre(() => f.document.querySelector('#classDashboardPanel [data-vue="cours"]'),
            "le tableau de bord de la classe ne s'affiche pas", 8000);
          ["eleves", "cours", "evaluations", "documents", "dispenses"].forEach(vue => {
            if (!f.document.querySelector(`#classDashboardPanel [data-vue="${vue}"]`)) {
              throw new Error(`la carte ${vue} manque au tableau de bord`);
            }
          });
          await attendre(() => f.document.querySelector("#classDashboardPanel [data-ec-note]"), "le bloc-notes ne montre pas la note", 4000);
          await attendre(() => f.document.querySelector("#classDashboardPanel [data-ec-equipe]"), "les equipes enregistrees manquent", 4000);
          await entrerDansCours();
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
          await entrerDansMenu();
          const panneau = $("classDashboardPanel");
          // Le recapitulatif vit dans Evaluations / Tests : le tableau de bord de l'application
          // a remplace le menu qui y menait.
          panneau.querySelector('[data-vue="evaluations"]').click();
          await attendre(() => f.document.getElementById("ecCreerPonctuelle"), "l'ecran Evaluations / Tests ne s'ouvre pas", 4000);
          await attendre(() => /1 \/ \d+ élèves évalués/.test(panneau.innerText),
            "la jauge de la grille ne compte pas l'eleve note", 6000);
          panneau.querySelector('[data-vue="recap"]').click();
          await attendre(() => f.document.querySelector("#ecRecap [data-ec-recap-test]"), "le recapitulatif ne liste pas le test", 6000);
          f.document.querySelector("[data-ec-recap-test]").click();
          await attendre(() => f.document.getElementById("ecExportCsv"), "le test ne s'ouvre pas avec ses exports", 4000);
          ["ecExportPdf", "ecExportMail"].forEach(id => {
            if (!f.document.getElementById(id)) throw new Error(`l'export ${id} manque`);
          });
          if (!f.document.querySelectorAll("#ecRecap tbody tr").length) throw new Error("le tableau du test est vide");

          // Les evaluations, dans le second onglet, eleve par eleve avec leur note.
          f.document.querySelector('[data-ec-onglet-recap="evaluations"]').click();
          await attendre(() => f.document.querySelector("[data-ec-recap-eval]"), "l'onglet Evaluations est vide", 4000);
          f.document.querySelector("[data-ec-recap-eval]").click();
          await attendre(() => [...f.document.querySelectorAll("#ecRecap th")].some(th => /note/i.test(th.textContent)),
            "la grille ne s'affiche pas avec ses notes", 4000);

          // Redessiner garde l'ecran ouvert, sur ce qu'on regardait.
          panneau.innerHTML = "";
          await f.renderClassDashboard();
          await attendre(() => f.document.querySelector("#ecRecap th"), "le recapitulatif ne se redessine pas", 4000);

          // Le retour ramene a Evaluations / Tests, puis au tableau de bord.
          panneau.querySelector("[data-ec-retour]").click();
          await attendre(() => f.document.getElementById("ecCreerPonctuelle"), "le retour ne ramene pas a Evaluations / Tests", 4000);
          await entrerDansMenu();
          panneau.querySelector('[data-vue="dispenses"]').click();
          await attendre(() => panneau.querySelector("[data-dispense]"), "les dispenses restent vides", 4000);
        }
      },
      {
        // Une colonne par document, un eleve par ligne : un clic sur la case le marque rendu.
        nom: "Tableau de bord · documents a rendre en grille",
        action: async () => {
          await entrerDansMenu();
          const panneau = $("classDashboardPanel");
          panneau.querySelector('[data-vue="documents"]').click();
          await attendre(() => panneau.querySelector("[data-ec-case]"), "la grille des documents ne s'affiche pas", 4000);
          const avant = panneau.querySelector(".ec-grille-doc small").textContent;
          const manquant = panneau.querySelector("[data-ec-case].ko");
          if (!manquant) throw new Error("aucune case manquante dans le jeu d'essai");
          manquant.click();
          await attendre(() => panneau.querySelector(".ec-grille-doc small").textContent !== avant,
            "cocher une case ne change pas le compte des rendus", 4000);
          panneau.querySelector('[data-ec-onglet-docs="archives"]').click();
          await attendre(() => panneau.querySelector(".ec-ligne[data-ec-doc]"), "les archives ne listent pas le document classe", 4000);
          panneau.querySelector(".ec-ligne[data-ec-doc]").click();
          await attendre(() => panneau.querySelector("[data-ec-rendu]"), "le suivi d'un document archive ne s'ouvre pas", 4000);
          if (!f.document.getElementById("ecArchiverSuivi")) throw new Error("on ne peut pas restaurer un document archive");
          panneau.querySelector("[data-ec-retour]").click();
          await attendre(() => panneau.querySelector("[data-ec-onglet-docs]"), "le retour ne ramene pas aux documents", 4000);
          panneau.querySelector('[data-ec-onglet-docs="rendre"]').click();
        }
      },
      {
        nom: "Tableau de bord · liste des eleves et bloc-notes",
        action: async () => {
          await entrerDansMenu();
          const panneau = $("classDashboardPanel");
          // Le bloc-notes s'ecrit dans une fenetre du site, pas dans un prompt du navigateur.
          f.document.getElementById("ajoutNote").click();
          await attendre(() => f.document.getElementById("ecDialogueChamp"), "la fenetre de saisie de note ne s'ouvre pas", 4000);
          f.document.getElementById("ecDialogueAnnuler").click();
          panneau.querySelector('[data-vue="eleves"]').click();
          await attendre(() => panneau.querySelector("[data-ec-dossier]"), "la liste des eleves ne s'affiche pas", 4000);
          const tous = panneau.querySelectorAll("[data-ec-dossier]").length;
          panneau.querySelector('[data-ec-filtre-eleves="DISPENSES"]').click();
          await attendre(() => panneau.querySelectorAll("[data-ec-dossier]").length < tous,
            "le filtre Dispenses ne retient pas seulement les dispenses", 4000);
          if (!panneau.querySelector("[data-ec-niveau]")) throw new Error("le niveau EPS n'est plus modifiable");
          panneau.querySelector('[data-ec-filtre-eleves="TOUS"]').click();
          await entrerDansMenu();
        }
      },
      {
        // Les trois gestes de l'application : evaluer une composition, en modifier les groupes,
        // et dupliquer une grille vers une autre classe.
        nom: "Tableau de bord · equipes et copie d'une grille",
        action: async () => {
          await entrerDansMenu();
          const panneau = $("classDashboardPanel");
          panneau.querySelector("[data-ec-equipe]").click();
          await attendre(() => f.document.getElementById("ecEvaluerEquipe"), "la composition ne s'ouvre pas", 4000);
          if (f.document.getElementById("ecEvaluerEquipe").disabled) throw new Error("Créer une évaluation est grisé alors que la classe a un cycle");
          f.document.getElementById("ecModifierGroupes").click();
          await attendre(() => f.document.querySelector("[data-ec-groupe]"), "la modification des groupes ne s'ouvre pas", 4000);
          f.document.getElementById("ecAnnulerGroupes").click();
          await attendre(() => f.document.getElementById("ecEvaluerEquipe"), "annuler ne ramene pas a la composition", 4000);
          f.document.getElementById("ecEvaluerEquipe").click();
          await attendre(() => f.document.querySelector("[data-ec-note-groupe]"), "l'evaluation d'equipe ne propose pas les groupes", 4000);
          f.document.getElementById("ecEqAnnuler").click();
          await attendre(() => f.document.getElementById("ecFermerEquipe"), "annuler l'evaluation ne ramene pas a la composition", 4000);
          f.document.getElementById("ecFermerEquipe").click();

          panneau.querySelector('[data-vue="evaluations"]').click();
          await attendre(() => panneau.querySelector("[data-ec-grille]"), "aucune grille a dupliquer", 4000);
          panneau.querySelector("[data-ec-grille]").dispatchEvent(new f.MouseEvent("contextmenu", { bubbles: true }));
          await attendre(() => f.document.querySelector("[data-ec-cible]"), "la copie ne propose aucune classe", 4000);
          f.document.querySelector("[data-ec-cible]").click();
          await attendre(() => f.document.getElementById("ecCopieFaite"), "la copie n'aboutit pas : "
            + (f.document.getElementById("dashDetailContenu")?.innerText || "").slice(0, 120), 6000);
          f.document.getElementById("ecFinCopie").click();
          await entrerDansMenu();
        }
      },
      {
        // Un test se reprend par-dessus la classe, comme dans l'application : il ouvrait l'onglet
        // Outils, et on perdait la classe de vue. Et chaque test a un vrai bouton Supprimer.
        nom: "Tableau de bord · un test s'ouvre par-dessus la classe, avec Supprimer",
        action: async () => {
          await entrerDansMenu();
          const panneau = $("classDashboardPanel");
          panneau.querySelector('[data-vue="evaluations"]').click();
          await attendre(() => f.document.getElementById("ecTests"), "l'ecran Evaluations / Tests ne s'ouvre pas", 4000);
          f.document.getElementById("ecTests").click();
          await attendre(() => f.document.querySelector("[data-ec-test]"), "la liste des tests ne s'ouvre pas", 4000);
          if (!f.document.querySelector("[data-ec-test-suppr]")) throw new Error("les tests n'ont pas de bouton Supprimer");
          const onglet = () => f.document.querySelector(".tabbtn.active")?.textContent;
          const avant = onglet();
          const condition = [...f.document.querySelectorAll("[data-ec-test]")].find(b => /Condition physique/.test(b.textContent));
          if (!condition) throw new Error("le test de condition physique du jeu d'essai est absent");
          condition.click();
          await attendre(() => f.document.getElementById("ecOutilFenetre")
            && f.document.getElementById("ecOutilFenetre").contains($("toolPanel"))
            && /Condition physique/.test($("toolPanel").innerText), "le test ne s'ouvre pas par-dessus la classe", 8000);
          if (onglet() !== avant) throw new Error("ouvrir le test a fait quitter l'onglet de la classe");
          f.document.getElementById("ecOutilRetour").click();
          await attendre(() => !f.document.getElementById("ecOutilFenetre") && $("tab-outils").contains($("toolPanel")),
            "le retour ne referme pas la fenetre du test", 4000);
          if (f.eval("vueClasse") !== "evaluations") throw new Error("le retour ne ramene pas a la classe");
          await entrerDansMenu();
        }
      },
      {
        // Une ligne saisie dans l'application et envoyee tard arrive avec une date deja depassee
        // par le curseur de lecture : sans rattrapage, elle n'apparait jamais sur le site.
        nom: "Hors connexion · une ligne arrivee tard est rattrapee",
        action: async () => {
          const mode = f.eval("typeof modeHorsConnexion !== 'undefined' && modeHorsConnexion");
          if (!mode || typeof mode.rattraper !== "function") throw new Error("le rattrapage des lignes tardives a disparu");
          const bases = await f.indexedDB.databases();
          const nom = bases.map(b => b.name).find(n => /eps-lvh-offline/.test(n));
          if (!nom) return;
          const base = await new Promise((ok, ko) => { const q = f.indexedDB.open(nom); q.onsuccess = () => ok(q.result); q.onerror = () => ko(q.error); });
          const present = cle => new Promise(ok => { const q = base.transaction("records").objectStore("records").get(cle); q.onsuccess = () => ok(!!q.result); });
          const retirer = cle => new Promise((ok, ko) => { const t = base.transaction("records", "readwrite"); t.objectStore("records").delete(cle); t.oncomplete = ok; t.onerror = () => ko(t.error); });
          await attendre(() => present("eps_test_sessions:ts-2"), "le test du jeu d'essai n'est pas dans la copie locale", 8000);
          await retirer("eps_test_sessions:ts-2");
          await retirer("health_dispensations:hd-1");
          const n = await mode.rattraper();
          if (!(await present("eps_test_sessions:ts-2"))) throw new Error("un test absent de la copie locale n'est pas rattrape");
          if (!(await present("health_dispensations:hd-1"))) throw new Error("une dispense absente de la copie locale n'est pas rattrapee");
          if (n < 2) throw new Error(`le rattrapage annonce ${n} ligne(s) au lieu de 2`);
        }
      },
      {
        nom: "Tableau de bord · grilles d'evaluation proposees",
        action: async () => {
          await entrerDansCours();
          $("dashEvalPonctuelle").click();
          // Le panneau lit la fiche de cycle sur le disque : il peut mettre un moment. On attend
          // qu'il ait fini de charger, puis on dit ce qu'il montre - un message precis vaut mieux
          // qu'un delai depasse, qui ne distingue pas la lenteur de l'absence.
          await attendre(() => !/Chargement/.test($("dashDetailContenu").innerText),
            "le panneau des grilles reste sur Chargement", 12000);
          const proposees = f.document.querySelectorAll("#dashDetailContenu [data-modele]").length;
          if (proposees < 1) throw new Error("aucune grille proposee — le panneau affiche : "
            + $("dashDetailContenu").innerText.slice(0, 160));
        }
      },
      {
        // Changer de type redessinait la carte fermee : on cliquait "Exercice / Jeu" et tout
        // se repliait, ce qui se lit comme "il ne se passe rien".
        nom: "Tableau de bord · changer de type d'exercice ne replie pas la carte",
        action: async () => {
          await entrerDansCours();
          if (typeof f.renderDashboardExercises !== "function") throw new Error("les fiches d'exercices ont disparu");
          f.renderDashboardExercises({ apsa_name: "Natation" });
          const hote = $("dashExercises");
          const carte = hote.querySelector("details");
          if (!carte) throw new Error("la carte des fiches ne se construit pas");
          carte.open = true;
          const echauffements = hote.querySelectorAll("details details").length;
          if (echauffements === 0) throw new Error("aucune fiche d'echauffement");

          hote.querySelector('[data-ex-type="GAME"]').click();
          await attendre(() => {
            const actif = [...$("dashExercises").querySelectorAll("[data-ex-type]")]
              .find(b => b.classList.contains("active"));
            return actif && actif.dataset.exType === "GAME";
          }, "le type ne bascule pas sur Exercice / Jeu", 4000);

          const apres = $("dashExercises").querySelector("details");
          if (!apres.open) throw new Error("la carte s'est refermee en changeant de type");
          if ($("dashExercises").querySelectorAll("details details").length === 0) {
            throw new Error("aucun exercice apres la bascule");
          }

          // Et une fiche s'ouvre bien, avec son schema dessine.
          const fiche = $("dashExercises").querySelector("details details");
          fiche.open = true;
          await attendre(() => fiche.querySelector("canvas[data-diagram]")?.dataset.drawn === "1",
            "le schema de la fiche ne se dessine pas", 4000);
        }
      },
      {
        nom: "Classe ouverte · emploi du temps",
        action: async () => {
          await entrerDansCours();
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
        nom: "Onglet REPERTOIRE · liste des eleves",
        action: async () => {
          // Depuis le 16/09, la liste des eleves vit dans son propre onglet, le Repertoire.
          await onglet("students");
          await attendre(() => rempli($("studentsDirectoryList")), "la liste des eleves reste vide", 6000);
        }
      },
      {
        // Verser une classe entiere : sans filtre, il fallait cocher les eleves un par un, et
        // une page de cent noms melange plusieurs divisions.
        nom: "Liste eleve · on coche une division entiere d'un geste",
        action: async () => {
          // Depuis le 16/09, la liste des eleves vit dans son propre onglet, le Repertoire.
          await onglet("students");
          await attendre(() => rempli($("studentsDirectoryList")), "la liste des eleves reste vide", 6000);

          const choix = f.document.getElementById("filtreDivision");
          if (!choix) throw new Error("le choix de la division a disparu");
          const proposees = [...choix.options].map(o => o.value).filter(Boolean);
          ["3e6", "6e1"].forEach(d => {
            if (!proposees.includes(d)) throw new Error(`la division ${d} n'est pas proposee`);
          });

          // Choisir une division n'affiche qu'elle.
          choix.value = "3e6";
          choix.dispatchEvent(new f.Event("change"));
          await attendre(() => f.document.getElementById("cocherDivision"),
            "le bouton pour cocher la division n'apparait pas", 4000);
          const divisions = [...f.document.querySelectorAll("#studentsDirectoryList .eleveTable tbody tr")]
            .map(tr => tr.children[4]?.textContent.trim());
          if (divisions.length === 0) throw new Error("le tableau est vide apres le filtre");
          if (divisions.some(d => d !== "3e6")) throw new Error("le filtre laisse passer une autre division");

          // Un clic coche toute la division, et le bouton d'ajout compte le meme nombre.
          f.document.getElementById("cocherDivision").click();
          await attendre(() => f.document.getElementById("eleveVersClasseBtn")
            && !f.document.getElementById("eleveVersClasseBtn").disabled,
            "l'ajout a une classe reste inactif apres avoir coche la division", 4000);
          const libelle = f.document.getElementById("eleveVersClasseBtn").textContent;
          if (!/\(2\)/.test(libelle)) throw new Error(`deux eleves attendus, bouton : ${libelle}`);

          // Le choix de la classe est une fenetre ou l'on clique, plus un prompt() du navigateur
          // qui obligeait a taper un numero.
          f.document.getElementById("eleveVersClasseBtn").click();
          await attendre(() => f.document.getElementById("classPickOverlay")?.classList.contains("open"),
            "la fenetre de choix de la classe ne s'ouvre pas", 6000);
          await attendre(() => f.document.querySelectorAll("#classPickBody [data-classe]").length > 0,
            "aucune classe cliquable dans la fenetre", 6000);
          const titre = f.document.getElementById("classPickTitre").textContent;
          if (!/2 eleve/.test(titre)) throw new Error(`le titre ne rappelle pas la selection : ${titre}`);
          f.document.getElementById("classPickClose").click();
          await attendre(() => !f.document.getElementById("classPickOverlay").classList.contains("open"),
            "la fenetre de choix ne se ferme pas", 4000);

          // Recliquer decoche, sinon on ne peut pas revenir en arriere sans recharger.
          f.document.getElementById("cocherDivision").click();
          await attendre(() => f.document.getElementById("eleveVersClasseBtn").disabled,
            "recliquer ne decoche pas la division", 4000);

          choix.value = "";
          choix.dispatchEvent(new f.Event("change"));
          await attendre(() => !f.document.getElementById("cocherDivision"),
            "le filtre ne se retire pas", 4000);
        }
      },
      {
        nom: "Onglet CLASSE · creation de classe",
        action: async () => {
          await onglet("classes");
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
        // Trois demandes d'un coup : pas deux fois la meme dispense, un motif, et un bilan
        // separe "les miennes" / "toutes celles de l'etablissement".
        nom: "SANTE · dispenses : motif, doublon refuse, bilan par onglet",
        action: async () => {
          await onglet("health");
          await attendre(() => rempli($("healthBody")), "l'ecran sante reste vide", 6000);
          await attendre(() => f.document.querySelector('[data-dispense-vue="miennes"]'),
            "les onglets de bilan n'apparaissent pas", 4000);

          // Le motif est propose des que le schema est marque comme applique.
          // La saisie se fait en trois etapes : carte de la classe, puis eleve, puis dispense.
          await attendre(() => f.document.querySelector("[data-health-class]"), "la saisie ne s'affiche pas", 4000);
          f.document.querySelector("[data-health-class]").click();
          await attendre(() => f.document.querySelector("[data-health-student]"), "la classe ne montre pas ses eleves", 4000);
          const eleve = f.document.querySelector("[data-health-student]");
          if (!eleve) throw new Error("aucun eleve dans la classe de test");
          eleve.click();
          await attendre(() => f.document.getElementById("dispenseKind"),
            "le choix du motif n'apparait pas alors que le schema est applique", 4000);

          // Le garde-fou : reproposer une periode qui recouvre une dispense existante.
          const dispenses = f.healthDispensesPourTest ? f.healthDispensesPourTest() : null;
          if (typeof f.chevaucheDispense !== "function") throw new Error("la regle de chevauchement a disparu");
          if (!f.chevaucheDispense({ start_date: "2026-09-01", end_date: "2026-12-01" },
                                   { start_date: "2026-10-01", end_date: "2026-10-05" })) {
            throw new Error("un chevauchement n'est pas reconnu");
          }
          if (f.chevaucheDispense({ start_date: "2026-09-01", end_date: "2026-09-10" },
                                  { start_date: "2026-09-11", end_date: "2026-09-20" })) {
            throw new Error("deux periodes qui ne se touchent pas sont vues comme un doublon");
          }

          // "Mes dispenses" ne montre que les siennes ; "Tous" ajoute celle du collegue.
          f.document.querySelector('[data-dispense-vue="miennes"]').click();
          await attendre(() => f.document.querySelectorAll("#dispenseVueBody [data-fiche]").length > 0,
            "le bilan personnel reste vide", 4000);
          const miennes = f.document.querySelectorAll("#dispenseVueBody [data-fiche]").length;
          f.document.querySelector('[data-dispense-vue="toutes"]').click();
          await attendre(() => f.document.querySelectorAll("#dispenseVueBody [data-fiche]").length > miennes,
            "les dispenses des collegues n'apparaissent pas dans \"Tous\"", 4000);

          // En cours et Passees sont bien separees.
          const titres = [...f.document.querySelectorAll("#dispenseVueBody h2")].map(h => h.textContent);
          ["En cours", "Passées"].forEach(t => {
            if (!titres.some(x => x.includes(t))) throw new Error(`la section ${t} manque`);
          });

          // Un clic sur un nom ouvre sa fiche, avec le motif.
          f.document.querySelector("#dispenseVueBody [data-fiche]").click();
          await attendre(() => f.document.getElementById("dispenseFicheOverlay")?.classList.contains("open"),
            "la fiche ne s'ouvre pas", 4000);
          const fiche = f.document.getElementById("dispenseFicheBody").innerText;
          if (!/Motif/.test(fiche)) throw new Error("la fiche ne dit pas le motif");
          f.document.getElementById("dispenseFicheClose").click();
          await attendre(() => !f.document.getElementById("dispenseFicheOverlay").classList.contains("open"),
            "la fiche ne se ferme pas", 4000);
          f.document.querySelector('[data-dispense-vue="saisie"]').click();
        }
      },
      {
        // Un eleve dispense ne peut pas faire la seance : l'appel AS doit le dire avant qu'on
        // le pointe. Les dispenses portent sur l'eleve de classe, l'appel sur le membre AS :
        // c'est la meme personne, rapprochee par nom, prenom et date de naissance.
        nom: "ASLVH · l'appel previent qu'un eleve est dispense",
        action: async () => {
          if (typeof f.dispensesDuJour !== "function") throw new Error("le rapprochement des dispenses a disparu");
          const elevesDeClasse = [
            { id: "el-0", last_name: "Martin", first_name: "Lea", birth_date_epoch_millis: 1070000000000 },
            { id: "el-9", last_name: "Autre", first_name: "Personne", birth_date_epoch_millis: 999 }
          ];
          const dispenses = [
            { student_id: "el-0", start_date: "2026-09-01", end_date: "2026-12-01", reason_kind: "BLESSURE", deleted: false },
            { student_id: "el-9", start_date: "2026-01-01", end_date: "2026-01-31", reason_kind: "MALADIE", deleted: false }
          ];
          const index = f.dispensesDuJour(dispenses, elevesDeClasse, "2026-09-15");
          const cle = f.cleEleve("MARTIN", " lea ", 1070000000000);
          if (!index.get(cle)) throw new Error("la dispense en cours n'est pas retrouvee malgre la casse et les espaces");
          if (index.get(f.cleEleve("Autre", "Personne", 999))) {
            throw new Error("une dispense terminee est comptee comme en cours");
          }
          // Une dispense effacee ne doit plus rien signaler.
          const efface = f.dispensesDuJour(
            [{ student_id: "el-0", start_date: "2026-09-01", end_date: "2026-12-01", deleted: true }],
            elevesDeClasse, "2026-09-15");
          if (efface.size !== 0) throw new Error("une dispense supprimee previent encore");

          // Et l'ecran d'appel se construit toujours.
          await onglet("unss");
          f.unssMode = "appel";
          f.renderUnssAppelTab();
          await attendre(() => f.document.getElementById("unssAppelGroupSelect"),
            "l'ecran d'appel ne se construit plus", 4000);
        }
      },
      {
        // La carte Dispenses d'une classe listait sans rien permettre : il fallait repasser par
        // l'onglet Sante pour corriger une date ou supprimer.
        nom: "CLASSE · une dispense s'ouvre et se modifie depuis la classe",
        action: async () => {
          await onglet("classes");
          f.showSubtab("classes");
          await attendre(() => f.document.querySelector(".classePuce"), "la rangee des classes est vide", 6000);
          // La classe qui porte les dispenses du faux serveur, pas la premiere venue.
          const puce = [...f.document.querySelectorAll(".classePuce")].find(b => b.textContent.includes("3e6"));
          if (!puce) throw new Error("la classe 3e6 n'est pas dans la rangee");
          // Recliquer la classe deja ouverte la referme : on s'assure d'etre bien dedans, sur son
          // menu, plutot que de conclure a tort que l'entree a disparu.
          if (!f.document.querySelector('#classDashboardPanel [data-vue="dispenses"]')) {
            puce.click();
            await attendre(() => rempli($("classDashboardPanel")), "le tableau de bord ne s'ouvre pas", 8000);
          }
          if (!f.document.querySelector('#classDashboardPanel [data-vue="dispenses"]')) {
            puce.click();
          }
          await attendre(() => f.document.querySelector('[data-vue="dispenses"]'),
            "l'entree Dispenses a disparu du menu", 8000);

          await entrerDansMenu();
          f.document.querySelector('#classDashboardPanel [data-vue="dispenses"]').click();
          await attendre(() => f.document.querySelector("#classDashboardPanel [data-dispense]"), "la liste des dispenses ne s'ouvre pas", 4000);
          // Une des siennes : la fiche d une dispense saisie par un collegue est en lecture seule.
          const lignes = [...f.document.querySelectorAll("#classDashboardPanel [data-dispense]")].filter(b => !b.querySelector("em"));
          if (lignes.length === 0) throw new Error("les dispenses ne sont pas cliquables");

          lignes[0].click();
          await attendre(() => f.document.getElementById("dispenseFicheOverlay")?.classList.contains("open"),
            "la fiche ne s'ouvre pas depuis la classe", 4000);
          // Modifiable : dates, et suppression a portee de main.
          await attendre(() => f.document.getElementById("ficheStart"), "la fiche n'est pas modifiable", 4000);
          ["ficheEnd", "ficheSuppr"].forEach(id => {
            if (!f.document.getElementById(id)) throw new Error(`${id} manque dans la fiche`);
          });
          f.document.getElementById("dispenseFicheClose").click();
          await attendre(() => !f.document.getElementById("dispenseFicheOverlay").classList.contains("open"),
            "la fiche ne se ferme pas", 4000);

          // Et on doit pouvoir en poser une sans quitter la classe.
          const ajout = f.document.getElementById("ajoutDispense");
          if (!ajout) throw new Error("on ne peut pas creer une dispense depuis la classe");
          ajout.click();
          await attendre(() => f.document.getElementById("ficheEleve"),
            "le choix de l'eleve n'apparait pas", 4000);
          if (f.document.querySelectorAll("#ficheEleve option").length < 2) {
            throw new Error("aucun eleve propose pour la nouvelle dispense");
          }
          // Le motif doit etre propose ici aussi : il n'etait demande qu'a l'ouverture de
          // l'onglet Sante, donc depuis une classe l'ecran annoncait a tort que le SQL
          // n'etait pas applique.
          if (!f.document.getElementById("ficheKind")) {
            throw new Error("le motif n'est pas propose depuis la classe alors que le schema est applique");
          }
          f.document.getElementById("dispenseFicheClose").click();
          await attendre(() => !f.document.getElementById("dispenseFicheOverlay").classList.contains("open"),
            "la fenetre de creation ne se ferme pas", 4000);
          $("dashDetailClose")?.click();
        }
      },
      {
        // Un groupe AS se compose de licencies : la fenetre proposait les 1811 eleves du
        // repertoire sans distinction, et les licencies y etaient noyes.
        nom: "ASLVH · ajouter un membre propose d'abord les licencies",
        action: async () => {
          await onglet("unss");
          if (typeof f.openUnssAddMemberPanel !== "function") throw new Error("l'ajout de membre a disparu");
          // unssGroups est un "let" de haut niveau : invisible depuis le banc. On fournit donc
          // le groupe du faux serveur, la fonction n'a besoin que de son identifiant.
          f.openUnssAddMemberPanel({ id: "ug-1", activity_name: "Volley" }, []);
          await attendre(() => f.document.getElementById("unssMemberResults"),
            "la fenetre d'ajout ne s'ouvre pas", 6000);
          await attendre(() => f.document.querySelectorAll("[data-add-member]").length > 0,
            "aucun licencie propose d'emblee", 4000);
          const proposes = [...f.document.querySelectorAll("[data-add-member]")].map(e => e.textContent.trim());
          if (proposes.some(t => /MARTIN/i.test(t))) {
            throw new Error("un eleve non licencie est propose alors qu'on n'a pas elargi");
          }
          // La case doit permettre d'elargir a tout le repertoire.
          const tous = f.document.getElementById("unssMemberTous");
          if (!tous) throw new Error("on ne peut pas elargir au repertoire complet");
          tous.checked = true;
          tous.dispatchEvent(new f.Event("change"));
          await attendre(() => [...f.document.querySelectorAll("[data-add-member]")]
            .some(e => /MARTIN/i.test(e.textContent)), "elargir ne montre pas le reste du repertoire", 4000);
          f.document.getElementById("unssAddMemberCancel").click();
        }
      },
      {
        // Un <option> sans value renvoie son texte : la phrase "Aucun creneau AS..." partait
        // dans wish1_slot_id, et le serveur refusait la fiche entiere.
        nom: "ASLVH · un choix vide n'envoie pas sa phrase d'explication",
        action: async () => {
          if (typeof f.menuCreneaux !== "function") throw new Error("le menu des creneaux a disparu");
          // Sans creneau, le menu affiche une phrase d'explication. Elle ne doit jamais devenir
          // la valeur envoyee : un <option> sans value renvoie son texte, et la phrase partait
          // dans wish1_slot_id, faisant refuser la fiche entiere par le serveur.
          const cadre = f.document.createElement("div");
          cadre.innerHTML = f.menuCreneaux("essaiVoeu", null, null);
          const options = [...cadre.querySelectorAll("option")];
          if (options.length === 0) throw new Error("le menu ne propose rien du tout");
          const fautives = options.filter(o => o.value.trim() !== "" && /creneau|Creez/i.test(o.value));
          if (fautives.length) {
            throw new Error(`un choix renvoie sa phrase au lieu d'une valeur vide : ${fautives[0].value}`);
          }
        }
      },
      {
        // L'AS s'organise autour du creneau : ses eleves, ses appels et son bilan y sont
        // attaches. Il y avait deux objets, creneau et groupe, qu'il fallait saisir deux fois.
        nom: "ASLVH · le creneau porte ses eleves, ses appels et son bilan",
        action: async () => {
          await onglet("unss");
          f.showUnssTab("slots");
          // Chaque creneau est une carte ; un clic ouvre sa fiche, qui porte Eleves, Appel et Bilan.
          await attendre(() => f.document.querySelector(".as-slot-tile[data-slot]"),
            "le creneau ne propose pas ses eleves", 6000);

          // L'onglet Groupe doit avoir disparu de la barre.
          if (f.document.querySelector('#unssSubtabs [data-unsstab="groups"]')) {
            throw new Error("l'onglet Groupe est encore la alors que le creneau porte tout");
          }

          // Le creneau qui a des eleves, pas le premier venu : un autre controle a pu en creer.
          const carte = [...f.document.querySelectorAll(".as-slot-tile[data-slot]")]
            .find(b => !/(^|\D)0 inscrit/.test(b.textContent)) || f.document.querySelector(".as-slot-tile[data-slot]");
          const creneauId = carte.dataset.slot;
          const ouvrirFiche = async () => {
            f.document.querySelector(`.as-slot-tile[data-slot="${creneauId}"]`).click();
            await attendre(() => f.document.getElementById("asStudents"), "la fiche du creneau ne s'ouvre pas", 4000);
          };
          await ouvrirFiche();
          f.document.getElementById("asStudents").click();
          await attendre(() => f.document.getElementById("unssCreneauEleves"),
            "la liste des eleves du creneau ne s'ouvre pas", 4000);
          if (!f.document.querySelector("[data-retirer]")) {
            throw new Error("les eleves inscrits n'apparaissent pas");
          }
          if (!f.document.getElementById("unssCreneauAddBtn")) {
            throw new Error("on ne peut pas ajouter d'eleve au creneau");
          }
          f.document.getElementById("unssCreneauCloseBtn").click();

          // Le bilan de presence, sur le meme creneau.
          await ouvrirFiche();
          f.document.getElementById("asBalance").click();
          await attendre(() => f.document.querySelector("#unssPanel table tbody tr"),
            "le bilan ne liste aucun eleve", 6000);
          // Comparaison sans accent : ce fichier peut etre decode autrement que la page testee,
          // et un "e" accentue ne doit pas faire echouer un controle qui porte sur autre chose.
          const sansAccent = t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
          const colonnes = [...f.document.querySelectorAll("#unssPanel th")].map(th => sansAccent(th.textContent));
          // Depuis le 21/09, le bilan est une grille : l'eleve, une colonne datee par appel, le taux.
          if (!colonnes.some(c => c.includes("eleve"))) throw new Error(`la colonne eleve manque au bilan : ${colonnes.join(", ")}`);
          if (!colonnes.includes("%")) throw new Error(`le taux de presence manque au bilan : ${colonnes.join(", ")}`);
          const dates = colonnes.filter(c => /^\d{2}\/\d{2}$/.test(c));
          if (dates.length === 0) throw new Error(`aucune colonne datee dans le bilan : ${colonnes.join(", ")}`);
          if (colonnes.some(c => /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/.test(c))) {
            throw new Error(`un en-tete donne le jour au lieu de la date : ${colonnes.join(", ")}`);
          }
          f.document.getElementById("unssBilanClose").click();

          // L'appel : les seances du creneau, datees.
          f.showUnssTab("appel");
          await attendre(() => f.document.getElementById("unssAppelSlotSelect"),
            "l'appel ne propose pas les creneaux", 6000);
          const choix = f.document.getElementById("unssAppelSlotSelect");
          choix.value = creneauId;
          choix.dispatchEvent(new f.Event("change"));
          await attendre(() => f.document.querySelectorAll("[data-seance]").length >= 2,
            "les seances deja pointees ne sont pas listees", 4000);
          f.document.querySelector("[data-seance]").click();
          await attendre(() => f.document.querySelectorAll("[data-present]").length > 0,
            "rouvrir une seance ne montre pas ses eleves", 4000);
          if (!/corrections/i.test(f.document.getElementById("unssAppelSaveBtn").textContent)) {
            throw new Error("rouvrir une seance doit proposer de corriger, pas de recreer");
          }
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
        // Le navigateur ferme la connexion IndexedDB des qu'une autre fenetre ouvre la base, ou
        // a une bascule de compte. La connexion morte restait en cache : plus aucune lecture
        // n'aboutissait, et l'ecran affichait "The database connection is closing" jusqu'au
        // rechargement complet.
        nom: "Hors connexion · une connexion fermee se rouvre toute seule",
        action: async () => {
          if (typeof f.tableSuivie !== "function") throw new Error("tableSuivie a disparu");
          if (!f.tableSuivie("classes")) return; // mode hors connexion absent : rien a verifier
          const base = await f.__baseHorsConnexion?.();
          if (!base) return; // la base n'est pas exposee : rien a verifier ici
          // On simule ce que fait le navigateur : la connexion se ferme sous les pieds.
          await base.fermerConnexion();
          const lues = await f.lireTable("classes", "classes?deleted=eq.false&select=*");
          if (!Array.isArray(lues)) throw new Error("la lecture ne repart pas apres une fermeture");
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
          await entrerDansCours();
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
        // Cliquer sur "Evaluation ponctuelle" depuis une classe affichait aussi la finale juste
        // en dessous : on demandait une chose et on en obtenait deux, avec le risque de noter
        // dans la mauvaise grille.
        nom: "COURS · le tableau de notes s'ouvre en fenetre, sur le type demande",
        action: async () => {
          await onglet("cours");
          if (typeof f.openEvaluationPanel !== "function") throw new Error("openEvaluationPanel a disparu");
          const cycle = { id: "cy-essai", class_id: "c1", apsa_name: "Natation" };
          await f.openEvaluationPanel(cycle, { type: "FINALE" });
          await attendre(() => rempli($("evaluationPanel")), "le panneau d'evaluations reste vide", 6000);

          const texte = $("evaluationPanel").innerText;
          if (!texte.includes("Evaluation finale")) throw new Error("le type demande doit etre affiche");
          if (texte.includes("Evaluation ponctuelle")) throw new Error("l'autre type ne doit pas apparaitre");
          // Accordeon ferme : on vient pour une grille, pas pour la liste. Elle reste a un clic.
          if (texte.includes("Nouvelle grille")) throw new Error("l'accordeon doit s'ouvrir ferme");

          // Le tableau de notes vient par-dessus la page : on note pendant un cours, sans quitter
          // la classe qu'on regardait.
          const voile = f.document.getElementById("evaluationOverlay");
          if (!voile || !voile.classList.contains("open")) throw new Error("la fenetre ne s'ouvre pas");
          if (voile.parentElement !== f.document.body) throw new Error("la fenetre doit tenir hors des onglets");
          if (!voile.contains($("evaluationPanel"))) throw new Error("le panneau n'est pas dans la fenetre");
          if (!$("saveEvalBtn")) throw new Error("le bouton Enregistrer a disparu");
          $("saveEvalBtn").click();
          await attendre(() => !f.document.getElementById("evaluationOverlay").classList.contains("open"),
            "Enregistrer ne referme pas la fenetre", 4000);
        }
      },
      {
        // Le bandeau "Conflit a verifier" s'affiche dans l'en-tete, mais le panneau vivait dans
        // Equipement > Installations : il annoncait sans dire ou aller, et une saisie a trancher
        // restait en suspens sans que personne la voie.
        nom: "Les conflits s'ouvrent depuis le bandeau",
        action: async () => {
          if (typeof f.ouvrirFenetreConflits !== "function") return; // mode hors connexion absent
          await f.ouvrirFenetreConflits();
          await attendre(() => f.document.getElementById("conflictOverlay")?.classList.contains("open"),
            "la fenetre des conflits ne s'ouvre pas", 5000);
          const voile = f.document.getElementById("conflictOverlay");
          if (voile.parentElement !== f.document.body) throw new Error("elle doit s'ouvrir depuis n'importe quel onglet");
          if (!voile.contains($("conflictPanel"))) throw new Error("le panneau des conflits n'est pas dedans");
          $("conflictClose").click();
          await attendre(() => !f.document.getElementById("conflictOverlay").classList.contains("open"),
            "la fenetre des conflits ne se ferme pas", 4000);
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
