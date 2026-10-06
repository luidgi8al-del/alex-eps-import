const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "..", "cours.js"), "utf8");
const render = source.slice(source.indexOf("function renderEvaluationTable("), source.indexOf("function formatScoreWeb("));
const save = source.slice(source.indexOf("async function setScore("), source.indexOf("async function addCriterion("));

assert(render.includes('event.key !== "Enter"'), "Entrée doit piloter le déplacement");
assert(render.includes("cases[index + (event.shiftKey ? -1 : 1)]"), "les cases doivent suivre l'ordre ligne puis colonne");
assert(render.includes('enterkeyhint="${derniereCase ? "done" : "next"}"'), "le clavier mobile doit afficher Suivant");
assert(render.includes('input.dataset.crit === String(focusTarget.criterionId)'), "la case suivante doit retrouver le bon critère");
assert(render.includes('input.dataset.student === String(focusTarget.studentId)'), "la case suivante doit retrouver le bon élève");
assert(save.includes("renderEvaluationTable(focusTarget)"), "le focus doit être restauré après l'enregistrement");

console.log("evaluation-enter-navigation: criterion then next student navigation OK");
