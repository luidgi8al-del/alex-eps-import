const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "cours.js"), "utf8");
const start = source.slice(source.indexOf("async function startPronoteSplitScreen()"), source.indexOf("function renderPronoteExport()"));

assert(source.includes("const evalScoreSaves = new Set()"), "les enregistrements en cours doivent être suivis");
assert(source.includes("active.blur()"), "la dernière case active doit être validée avant le transfert");
assert(source.includes("await Promise.all(pending)"), "le transfert doit attendre les écritures en cours");
assert(start.indexOf("await flushEvaluationScoreSaves()") < start.indexOf("pronoteTransferData(false)"),
  "les notes doivent être enregistrées avant de construire le transfert PRONOTE");

console.log("pronote-save-before-transfer: pending score saves are flushed before payload OK");
