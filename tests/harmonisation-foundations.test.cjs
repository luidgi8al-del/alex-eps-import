const fs = require("fs");
const path = require("path");
const assert = require("assert");
const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "styles", "site.css"), "utf8");
const classes = fs.readFileSync(path.join(root, "classes.js"), "utf8");
const tools = fs.readFileSync(path.join(root, "tools-workspace.js"), "utf8");

for (const token of ["--primary-hover", "--primary-soft", "--success-soft", "--radius-md", "--shadow-card", "--focus-ring"])
  assert(css.includes(token), `jeton visuel manquant: ${token}`);
assert(css.includes("button:focus-visible"), "la navigation clavier doit rester visible");
assert(classes.includes("replace(/^\\uFEFF/"), "le BOM CSV doit etre retire");
assert(classes.includes('const candidates = [";", ",", "\\t"]'), "CSV et TSV doivent etre reconnus");
assert(classes.includes("slice(0, 5)"), "le separateur doit etre choisi sur plusieurs lignes");

// Garde-fou : l'harmonisation ne doit pas retirer les outils deja livres.
for (const tool of ["3x500", "Condition physique générale", "Groupes Acrosport", "Savoir Nager"])
  assert(tools.includes(tool), `outil conserve attendu: ${tool}`);
console.log("harmonisation-foundations: OK");
