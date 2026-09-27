const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const js = fs.readFileSync(path.join(root, "health-incident-pro.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles/site.css"), "utf8");

assert.match(js, /<select id="istudent">/,
  "l'eleve concerne doit etre choisi dans un menu deroulant");
assert.doesNotMatch(js, /name="istudent"/,
  "l'ancienne longue liste de boutons radio ne doit plus etre affichee");
assert.match(js, /id="iwitnessclass"/);
assert.match(js, /id="iwitnessstudent"/);
assert.match(js, /id="iaddwitness"/);
assert.match(js, /data-remove-witness/);
assert.match(js, /id="iwitnessfree"/,
  "un temoin libre doit toujours pouvoir etre saisi");
assert.match(js, /witness_student_ids:\[\]/);
assert.match(js, /updateWitnessText\(\)/);
assert.match(css, /\.incident-witness-picker/);
assert.match(css, /\.incident-witness-chips/);

console.log("Rapport d'incident : menus eleve et temoins valides");
