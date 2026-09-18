const assert = require("assert");
const fs = require("fs");

const workspace = fs.readFileSync("tools-workspace.js", "utf8");
const tools = fs.readFileSync("outils.js", "utf8");
const course = fs.readFileSync("cours.js", "utf8");

assert(workspace.includes('tools-section-back" id="toolsActivityBack"'),
  "la flèche activité doit être placée sur la seconde ligne");
assert(!workspace.includes('tools-hero"><button class="tools-back" id="toolsActivityBack"'),
  "la flèche ne doit plus apparaître au-dessus du titre de l’activité");
assert(tools.includes('setAttribute("hidden", "")'),
  "ouvrir un outil doit masquer la liste des outils");
assert(course.includes('removeAttribute("hidden")'),
  "fermer un outil doit restaurer la liste des outils");
assert(tools.includes('data-eps-favorite="${key}"'),
  "chaque test EPS doit proposer son étoile favori");
assert(workspace.includes('id.startsWith("eps-test:")'),
  "un test EPS favori doit pouvoir être rouvert directement");

console.log("tools-fullscreen-favorites: OK");
