const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "aslvh.js"), "utf8");
const init = source.slice(source.indexOf("async function initUnssTab()"), source.indexOf("async function showUnssTab("));

assert(init.includes('unssMode = "licensed";'), "l'entree ASLVH doit forcer la liste des licencies");
assert(init.includes('b.dataset.unsstab === "licensed"'), "l'onglet Licencies AS doit etre visuellement actif");
assert(init.indexOf('unssMode = "licensed";') < init.indexOf("renderUnssTab();"), "le mode doit etre choisi avant le rendu");

console.log("as-default-tab: ASLVH opens directly on Licencies AS OK");
