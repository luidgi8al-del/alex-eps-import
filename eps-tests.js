// Catalogue des tests EPS — miroir de AdditionalToolsScreens.kt (EpsTestType, ClassTestCalculator,
// TestCalculator). Les formules sont celles de l'application, a la virgule pres : un meme eleve
// doit obtenir la meme VMA sur le telephone et sur le site.

const EpsTests = (function () {

  const fr = (value, decimals) => value.toFixed(decimals).replace(".", ",");

  /** Vitesse et allure d'une course de demi-fond, a partir de la distance et du temps. */
  function runningResult(distanceMeters, seconds) {
    const speed = (distanceMeters * 3.6) / seconds;
    const paceSeconds = (seconds * 1000) / distanceMeters;
    const minutes = Math.floor(paceSeconds / 60);
    const remaining = Math.floor(paceSeconds % 60);
    return `Vitesse moyenne : ${fr(speed, 2)} km/h · Allure : ${minutes} min ${String(remaining).padStart(2, "0")} s/km`;
  }

  // Chaque test porte : son libelle, son protocole, le libelle du champ en usage libre et en
  // mode classe, la formule (valeur saisie -> valeur calculee + unite) et le texte affiche
  // en usage libre.
  const TESTS = {
    ESCALADE: {label:'Escalade /20',protocol:'Progression, difficulté de la voie, technique de grimpe et assurage.',special:'climbing'},
    DEMI_COOPER: {
      label: "Demi-Cooper · 6 min",
      protocol: "Courir la plus grande distance possible pendant 6 minutes sur un parcours mesure.",
      fieldLabel: "Distance parcourue (m)",
      inputLabel: "Distance (m)",
      compute: v => ({ value: v / 100, unit: "km/h VMA" }),
      freeText: v => `VMA estimée : ${fr(v / 100, 2)} km/h`
    },
    COOPER: {
      label: "Cooper · 12 min",
      protocol: "Courir la plus grande distance possible pendant 12 minutes à allure régulière.",
      fieldLabel: "Distance parcourue (m)",
      inputLabel: "Distance (m)",
      compute: v => ({ value: v / 200, unit: "km/h VMA" }),
      freeText: v => `VMA estimée : ${fr(v / 200, 2)} km/h`
    },
    VAMEVAL: {
      label: "VAMEVAL",
      protocol: "Suivre une vitesse progressive imposée sur une piste balisée et relever la dernière vitesse entièrement tenue.",
      fieldLabel: "Dernier palier entièrement validé",
      inputLabel: "Palier atteint",
      compute: v => ({ value: 8 + v * 0.5, unit: "km/h VMA" }),
      freeText: v => `VMA : ${fr(8 + v * 0.5, 1)} km/h`,
      audio: "VAMEVAL"
    },
    LUC_LEGER: {
      label: "Luc Leger · navette 20 m",
      protocol: "Effectuer des navettes de 20 mètres au rythme des signaux et relever le dernier palier entièrement terminé.",
      fieldLabel: "Dernier palier terminé",
      inputLabel: "Palier atteint",
      compute: v => ({ value: 8 + v * 0.5, unit: "km/h VMA" }),
      freeText: v => `Vitesse du palier : ${fr(8 + v * 0.5, 1)} km/h · VMA estimée selon ce protocole`,
      audio: "Luc Leger"
    },
    SPRINT_30: {
      label: "Sprint 30 metres",
      protocol: "Départ debout, courir 30 mètres en ligne droite sans ralentir avant la ligne.",
      fieldLabel: "Temps mesure (secondes)",
      inputLabel: "Temps (s)",
      compute: v => ({ value: v > 0 ? 108 / v : 0, unit: "km/h" }),
      freeText: v => v > 0 ? `Vitesse moyenne : ${fr(108 / v, 2)} km/h` : null
    },
    SPRINT_50: {
      label: "Sprint 50 metres",
      protocol: "Départ identique pour tous, courir 50 mètres et relever le temps au centième.",
      fieldLabel: "Temps mesure (secondes)",
      inputLabel: "Temps (s)",
      compute: v => ({ value: v > 0 ? 180 / v : 0, unit: "km/h" }),
      freeText: v => v > 0 ? `Vitesse moyenne : ${fr(180 / v, 2)} km/h · ${fr(50 / v, 2)} m/s` : null
    },
    COURSE_1000: {
      label: "Demi-fond · 1 000 m",
      protocol: "Courir 1 000 mètres et saisir le temps total pour obtenir vitesse et allure.",
      fieldLabel: "Temps total (secondes)",
      inputLabel: "Temps (s)",
      compute: v => ({ value: v > 0 ? 3600 / v : 0, unit: "km/h" }),
      freeText: v => v > 0 ? runningResult(1000, v) : null
    },
    COURSE_1500: {
      label: "Demi-fond · 1 500 m",
      protocol: "Courir 1 500 mètres et saisir le temps total pour obtenir vitesse et allure.",
      fieldLabel: "Temps total (secondes)",
      inputLabel: "Temps (s)",
      compute: v => ({ value: v > 0 ? 5400 / v : 0, unit: "km/h" }),
      freeText: v => v > 0 ? runningResult(1500, v) : null
    },
    HAIES_INDEX: {
      label: "Indice haies",
      protocol: "Comparer un parcours plat et le même parcours avec haies afin de mesurer la perte liée aux franchissements.",
      fieldLabel: "Temps (secondes)",
      inputLabel: "Écart haies/plat (s)",
      compute: v => ({ value: v, unit: "s de perte" }),
      // En usage libre, ce test compare deux temps au lieu d'en saisir un seul.
      dual: {
        firstLabel: "Temps sur le plat (s)",
        secondLabel: "Temps avec haies (s)",
        result: (flat, hurdles) => {
          const loss = hurdles - flat;
          const percent = flat > 0 ? (loss / flat) * 100 : 0;
          return `Perte liée aux haies : ${fr(loss, 2)} s · ${fr(percent, 1)} %`;
        }
      }
    },
    RELAIS_INDEX: {
      label: "Efficacite du relais",
      protocol: "Comparer la somme des temps individuels au temps du relais pour mesurer le gain des transmissions lancées.",
      fieldLabel: "Temps (secondes)",
      inputLabel: "Gain du relais (s)",
      compute: v => ({ value: v, unit: "s gagnee(s)" }),
      dual: {
        firstLabel: "Somme des temps individuels (s)",
        secondLabel: "Temps du relais (s)",
        result: (individual, relay) => {
          const gain = individual - relay;
          const percent = individual > 0 ? (gain / individual) * 100 : 0;
          return `Gain collectif : ${fr(gain, 2)} s · ${fr(percent, 1)} %`;
        }
      }
    },
    SAUT_LONGUEUR: {
      label: "Saut en longueur sans elan",
      protocol: "Pieds derrière la ligne, sauter pieds joints et mesurer la distance jusqu'au point d'appui le plus proche.",
      fieldLabel: "Distance mesurée (cm)",
      inputLabel: "Distance (cm)",
      compute: v => ({ value: v, unit: "cm" }),
      freeText: v => `Performance relevée : ${fr(v, 0)} cm`
    },
    NAVETTE_4X10: {
      label: "Navette 4 × 10 metres",
      protocol: "Effectuer quatre longueurs de 10 mètres avec changements de direction et relever le temps total.",
      fieldLabel: "Temps mesure (secondes)",
      inputLabel: "Temps (s)",
      compute: v => ({ value: v > 0 ? 144 / v : 0, unit: "km/h" }),
      freeText: v => `Temps relevé : ${fr(v, 2)} s`
    },
    SOUPLESSE: {
      label: "Souplesse chaine posterieure",
      protocol: "Jambes tendues, effectuer une flexion progressive sans a-coup et relever la distance atteinte.",
      fieldLabel: "Distance mesurée (cm)",
      inputLabel: "Distance atteinte (cm)",
      compute: v => ({ value: v, unit: "cm" }),
      freeText: v => `Mesure relevée : ${fr(v, 1)} cm`
    },
    ARRET_COURSE: {
      label: "Arrêt course",
      protocol: "Touchez le nom de l’élève à chaque arrêt. Choisissez le barème (sur 20, 15, 10 ou 5), le nombre d’arrêts par palier et les points retirés à chaque palier.",
      fieldLabel: "Nombre d’arrêts",
      inputLabel: "Arrêts",
      compute: v => ({ value: Math.max(0, 20 - Math.floor(v / 2) * 0.5), unit: "/20" }),
      freeText: v => `Note : ${fr(Math.max(0, 20 - Math.floor(v / 2) * 0.5), 1)} / 20`,
      special: "stops"
    },
    TROIS_500: {
      label: "3 × 500 m",
      protocol: "Saisissez 315 pour 3 min 15 s. La moyenne utilise toutes les courses et la régularité additionne les écarts successifs.",
      fieldLabel: "Temps",
      inputLabel: "Temps",
      compute: v => ({ value: v, unit: "/12" }),
      special: "running-series"
    }
  };

  const CATEGORIES = [
    { name: 'Escalade', subtitle: 'Évaluation sur 20 · quatre critères', color: '#E5F5EB', tests: ['ESCALADE'] },
    {
      name: "Athle",
      subtitle: "Vitesse, demi-fond, force, coordination, haies et relais",
      color: "#FFF0DD",
      tests: ["SPRINT_30", "SPRINT_50", "COURSE_1000", "COURSE_1500",
              "HAIES_INDEX", "RELAIS_INDEX", "SAUT_LONGUEUR", "NAVETTE_4X10", "SOUPLESSE",
              "ARRET_COURSE", "TROIS_500"]
    }
  ];

  // Protocoles VMA : paliers de 0,5 km/h par minute a partir de 8 km/h, comme VmaAudioRunner.
  const VMA_PROTOCOLS = [
    { key: "VAMEVAL", label: "VAMEVAL", startSpeed: 8, step: 0.5, stageSeconds: 60,
      hint: "Piste balisée tous les 20 m · départ 8 km/h · +0,5 km/h par minute. Saisir le dernier palier atteint." },
    { key: "Leger-Boucher", label: "Leger-Boucher", startSpeed: 8, step: 0.5, stageSeconds: 60,
      hint: "Navettes de 20 m · paliers d'une minute · +0,5 km/h. Saisir le dernier palier validé." },
    { key: "Cooper", label: "Cooper", startSpeed: null, step: null, stageSeconds: null,
      hint: "Course libre de 12 minutes. Saisir la distance parcourue en mètres." },
    { key: "Demi-Cooper", label: "Demi-Cooper", startSpeed: null, step: null, stageSeconds: null,
      hint: "Course libre de 6 minutes. Saisir la distance parcourue en mètres." }
  ];

  /** VMA du module Tests VMA : distance pour Cooper, palier pour les protocoles progressifs. */
  function computeVma(protocol, value) {
    if (protocol === "Cooper") return value / 200;
    if (protocol === "Demi-Cooper") return value / 100;
    return 8 + value * 0.5;
  }

  // Savoir Nager : les 10 etapes du parcours, dans l'ordre.
  const SWIM_STEPS = [
    "Chute arrière", "Déplacement 3,5 m", "Immersion 1,5 m", "Ventre 20 m", "Surplace vertical 15 s",
    "Dos 20 m", "Surplace dorsal 15 s", "Retour ventre", "Retour au départ", "Ancrage sécurisé"
  ];

  // Aptitudes 6e : trois mesures, trois baremes.
  const APTITUDE_LEVELS = {
    sprint:    v => v < 6 ? "Satisfaisant" : v <= 6.8 ? "Fragile" : "à renforcer",
    endurance: v => v >= 4 ? "Satisfaisant" : v >= 2 ? "Fragile" : "à renforcer",
    jump:      v => v > 140 ? "Satisfaisant" : v >= 110 ? "Fragile" : "à renforcer"
  };

  return { TESTS, CATEGORIES, VMA_PROTOCOLS, SWIM_STEPS, APTITUDE_LEVELS, computeVma, runningResult, fr };
})();

if (typeof globalThis !== "undefined") globalThis.EpsTests = EpsTests;
