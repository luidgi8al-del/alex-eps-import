const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.join(__dirname, "..");
const aslvh = fs.readFileSync(path.join(root, "aslvh.js"), "utf8");
const sql = fs.readFileSync(path.join(root, "schema_as_slot_assignments.sql"), "utf8");

assert(aslvh.includes("slot?.assigned_teacher_id === session?.user_id"),
  "l'appel doit être lié à l'identifiant du compte connecté");
assert(aslvh.includes("s => !s.deleted && peutFaireAppelCreneau(s)"),
  "la liste Appel doit être filtrée, administrateur compris");
assert(aslvh.includes("body.assigned_teacher_id = professeurChoisi.value || null"),
  "le compte choisi doit être enregistré dans le créneau");
assert(aslvh.includes("Professeur non attribué"),
  "les cartes doivent rendre l'affectation visible");
assert(sql.includes("add column if not exists assigned_teacher_id"),
  "la base doit porter l'affectation nominative");
assert(sql.includes("s.assigned_teacher_id=auth.uid()"),
  "la sécurité serveur doit réserver l'appel au professeur affecté");

console.log("as-slot-assignment: OK");
