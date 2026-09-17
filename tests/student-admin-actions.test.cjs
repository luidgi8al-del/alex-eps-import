const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const classes = fs.readFileSync(path.join(root, "classes.js"), "utf8");
const aslvh = fs.readFileSync(path.join(root, "aslvh.js"), "utf8");

assert(classes.includes("async function estAdministrateur(force = false)"),
  "le contrôle administrateur doit pouvoir être relu");
assert(classes.includes("if (!force && estAdminCache === true) return true"),
  "un faux négatif ne doit pas masquer durablement les actions");
assert(aslvh.includes('unssAdmin || unssCibleRendu === "studentsDirectoryList"'),
  "l'import doit rester visible dans le répertoire");
assert(aslvh.includes('unssMode === "licensed" || unssCibleRendu === "studentsDirectoryList"'),
  "l'ajout manuel doit rester visible dans le répertoire");
assert(aslvh.includes("await autoriserGestionRepertoire()"),
  "les droits doivent être revérifiés au clic");

console.log("student-admin-actions: OK");
