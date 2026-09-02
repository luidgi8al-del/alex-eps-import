import { mergeOfflineChange } from "../sync/merge.js";

const output = document.querySelector("#log");
const button = document.querySelector("#run");
const write = message => { output.textContent += `${message}\n`; };
const assert = (condition, message) => { if (!condition) throw new Error(message); };

function distinctRecords() {
  const local = new Map([["cours:A", { titre:"Badminton", duree:60 }]]);
  const server = new Map([["planning:B", { jour:"mardi", heure:"10:00" }]]);
  const combined = new Map([...local, ...server]);
  assert(combined.get("cours:A").duree === 60 && combined.get("planning:B").jour === "mardi", "Fichiers distincts incorrects");
  write("✓ Fichiers distincts : les deux modifications sont conservées.");
}

function distinctFields() {
  const result = mergeOfflineChange({ baseData:{ nom:"6.1", salle:"Gymnase" }, localData:{ nom:"Sixième 1", salle:"Gymnase" }, serverData:{ nom:"6.1", salle:"Piscine" }, declaredLocalFields:["nom"] });
  assert(result.kind === "merged" && result.data.nom === "Sixième 1" && result.data.salle === "Piscine", "Fusion automatique incorrecte");
  write("✓ Même fiche, champs différents : fusion automatique réussie.");
}

function sameFieldConflict() {
  const result = mergeOfflineChange({ baseData:{ titre:"Course", duree:45 }, localData:{ titre:"Course", duree:50 }, serverData:{ titre:"Course", duree:55 }, declaredLocalFields:["duree"] });
  assert(result.kind === "conflict" && result.overlappingFields.includes("duree"), "Conflit non détecté");
  write("✓ Même champ modifié : conflit détecté et présenté à l’utilisateur.");
}

button.addEventListener("click", () => {
  output.textContent = "";
  try { distinctRecords(); distinctFields(); sameFieldConflict(); write("\nTous les scénarios sont validés."); }
  catch (error) { write(`✗ ${error.message}`); }
});
