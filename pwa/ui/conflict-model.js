import { chooseConflictVersion } from "../sync/merge.js";
export function conflictPresentation(conflict, labels = {}) {
  return { title: labels[conflict.entity] || conflict.entity, recordId: conflict.id, overlappingFields: conflict.overlappingFields.map(field => labels[field] || field), local: { authorId: conflict.localAuthorId, modifiedAt: conflict.localModifiedAt, data: conflict.localData }, server: { authorId: conflict.serverAuthorId, modifiedAt: conflict.serverModifiedAt, data: conflict.serverData }, resolve(choice, mergedData) { return chooseConflictVersion(conflict, choice, mergedData); } };
}
