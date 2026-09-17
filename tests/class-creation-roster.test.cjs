const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const classes = fs.readFileSync(path.join(root, "classes.js"), "utf8");
const aslvh = fs.readFileSync(path.join(root, "aslvh.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles", "site.css"), "utf8");

assert(classes.includes("await proposerAjoutElevesApresCreation(nouvelleClasse)"),
  "la creation doit proposer l'ajout d'eleves");
assert(aslvh.includes("Voulez-vous ajouter des élèves maintenant ?"),
  "la confirmation apres creation doit etre explicite");
assert(aslvh.includes('id="postClassDivision"'), "une division doit pouvoir etre choisie");
assert(aslvh.includes('data-post-student="${e.id}"'), "les eleves doivent pouvoir etre choisis individuellement");
assert(aslvh.includes("await verserDansClasse(classe, corps)"),
  "le parcours doit reutiliser l'ajout sans doublon");
assert(css.includes(".post-create-roster") && css.includes(".post-create-actions"),
  "le nouveau parcours doit employer une presentation harmonisee");

console.log("class-creation-roster: OK");
