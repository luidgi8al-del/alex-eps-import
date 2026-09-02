function comparable(value) { return value === undefined ? "__undefined__" : JSON.stringify(value); }
export function changedFieldsBetween(base = {}, next = {}) {
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(next || {})]);
  return [...keys].filter(key => comparable(base?.[key]) !== comparable(next?.[key])).sort();
}
export function mergeOfflineChange({ baseData = {}, localData = {}, serverData = {}, declaredLocalFields = [] }) {
  const localFields = declaredLocalFields.length ? [...new Set(declaredLocalFields)].sort() : changedFieldsBetween(baseData, localData);
  const serverFields = changedFieldsBetween(baseData, serverData);
  const overlappingFields = localFields.filter(field => serverFields.includes(field));
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
