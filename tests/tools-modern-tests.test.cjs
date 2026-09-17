const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const tools = read("outils.js");
const catalog = read("eps-tests.js");
const board = read("classe-tableau-bord.js");
const navigation = read("index.html");
const workspace = read("tools-workspace.js");
const css = read("styles/tools-workspace.css");

assert(!/name:\s*["']VMA["']/.test(catalog), "VMA ne doit plus être dupliqué dans Tests EPS");
assert(tools.includes("Usage libre (sans classe)"), "les tests doivent conserver l’utilisation libre");
assert(tools.includes("data-generic-student-group"), "les groupes des tests génériques doivent être modifiables");
assert(tools.includes("epsSaveAsBtn"), "un test générique doit pouvoir être enregistré comme nouvelle session");
assert(tools.includes("data-delete-generic-session"), "un test générique doit pouvoir être supprimé");
assert(tools.includes("data-vma-student-group"), "les groupes VMA doivent être modifiables");
assert(tools.includes("data-vma-session"), "une session VMA doit pouvoir être reprise");
assert(tools.includes("data-stop-session"), "une session arrêt-course doit pouvoir être reprise");
assert(tools.includes("ouvrirSessionTestDepuisClasse"), "les tests doivent être ouvrables depuis une classe");
assert(board.includes("data-recap-test"), "le tableau de bord doit rendre chaque test cliquable");
assert(navigation.includes('name === "outils"') && navigation.includes("resetToolsWorkspace"), "Outils doit revenir à son écran d’accueil");
assert(workspace.includes("function resetToolsWorkspace"), "le retour à l’accueil Outils doit être centralisé");
assert(css.includes(".modern-tool-hero") && css.includes(".modern-test-student"), "les écrans internes doivent utiliser le nouveau langage visuel");

console.log("Outils web : navigation, design moderne et cycle de vie des tests validés.");
