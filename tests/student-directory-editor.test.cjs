const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const aslvh = fs.readFileSync(path.join(root, "aslvh.js"), "utf8");
const css = fs.readFileSync(path.join(root, "styles", "site.css"), "utf8");

assert(aslvh.includes('data-directory-edit="${e.id}"'), "le repertoire doit proposer Modifier sur chaque ligne");
assert(aslvh.includes("openUnssStudentPanel(student, false, true)"), "Modifier doit ouvrir la fiche complete du repertoire");
assert(aslvh.includes("if (emailEleveField) body.student_email"), "le mail eleve doit etre sauvegarde hors licence AS");
assert(aslvh.includes("if (emailParentField) body.parent_email"), "le mail parent doit etre sauvegarde hors licence AS");
assert(aslvh.includes('await enregistrerLigne("unss_students", { ...student, ...body })'), "la modification doit conserver l'identifiant existant");
assert(css.includes(".student-editor-hero") && css.includes(".student-editor-actions"), "la fiche doit employer le design harmonise");

console.log("student-directory-editor: OK");
