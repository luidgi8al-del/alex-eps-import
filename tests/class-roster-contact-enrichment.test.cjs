const fs = require("fs");
const path = require("path");
const assert = require("assert");

const classes = fs.readFileSync(path.join(__dirname, "..", "classes.js"), "utf8");
assert(classes.includes("function enrichirElevesClasseDepuisRepertoire"));
assert(classes.includes("student_email: eleve.student_email || source.student_email || null"));
assert(classes.includes("parent1_email: eleve.parent1_email || parent1"));
assert(classes.includes("parent2_email: eleve.parent2_email || parent2"));
assert(classes.includes('modeHorsConnexion.lire("unss_students"'));
console.log("class-roster-contact-enrichment: OK");
