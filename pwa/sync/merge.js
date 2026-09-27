function comparable(value) { return value === undefined ? "__undefined__" : JSON.stringify(value); }
// Ces champs changent à chaque enregistrement et servent au transport/suivi de version. Ils ne
// représentent jamais un choix métier que le professeur devrait avoir à arbitrer.
const CHAMPS_TECHNIQUES = new Set(["id", "version", "created_at", "updated_at"]);
export function changedFieldsBetween(base = {}, next = {}) {
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
  return [...keys].filter(key => comparable(base?.[key]) !== comparable(next?.[key])).sort();
}
export function mergeOfflineChange({ baseData = {}, localData = {}, serverData = {}, declaredLocalFields = [] }) {
  const localFields = declaredLocalFields.length ? [...new Set(declaredLocalFields)].sort() : changedFieldsBetween(baseData, localData);
  const serverFields = changedFieldsBetween(baseData, serverData);
  // Deux côtés peuvent avoir « changé » depuis une ancienne copie tout en aboutissant à la même
  // valeur (par exemple `null` ajouté lors d'une évolution du formulaire). Ce n'est pas un
  // conflit. De même, une différence de date technique ne doit jamais ouvrir la fenêtre.
  const overlappingFields = localFields.filter(field => serverFields.includes(field)
    && !CHAMPS_TECHNIQUES.has(field)
    && comparable(localData?.[field]) !== comparable(serverData?.[field]));
  if (overlappingFields.length) return { kind: "conflict", localFields, serverFields, overlappingFields };
  const merged = { ...serverData };
  localFields.forEach(field => Object.prototype.hasOwnProperty.call(localData, field) ? merged[field] = localData[field] : delete merged[field]);
  return { kind: "merged", data: merged, localFields, serverFields, overlappingFields: [] };
}
export function chooseConflictVersion(conflict, choice, customData) {
  if (choice === "local") return conflict.localData;
  if (choice === "server") return conflict.serverData;
  if (choice === "merged" && customData && typeof customData === "object") return customData;
  throw new TypeError("Choix de conflit invalide");
}
