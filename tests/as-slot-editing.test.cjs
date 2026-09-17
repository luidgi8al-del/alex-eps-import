const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const aslvh = fs.readFileSync(path.join(root, "aslvh.js"), "utf8");

assert(aslvh.includes("function normaliserHeureCreneau(valeur)"),
  "les horaires venant du serveur doivent être normalisés");
assert(aslvh.includes('value="${normaliserHeureCreneau(slot?.start_time)}"'),
  "l'heure de début existante doit rester visible en modification");
assert(aslvh.includes('value="${normaliserHeureCreneau(slot?.end_time)}"'),
  "l'heure de fin existante doit rester visible en modification");
assert(aslvh.includes('id="unssSlotTeacher"'),
  "le formulaire doit proposer un professeur responsable");
assert(aslvh.includes("const professeurs = contexte?.members || []"),
  "les professeurs doivent venir des comptes de l'établissement");
assert(aslvh.includes('responsible_teacher: document.getElementById("unssSlotTeacher").value'),
  "le professeur choisi doit être enregistré dans le créneau partagé");

console.log("as-slot-editing: OK");
