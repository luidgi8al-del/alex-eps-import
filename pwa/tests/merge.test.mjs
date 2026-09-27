import assert from "node:assert/strict";
import { changedFieldsBetween, mergeOfflineChange } from "../sync/merge.js";
assert.deepEqual(changedFieldsBetween({ title: "A", room: "Gym" }, { title: "B", room: "Gym" }), ["title"]);
const records = [{ entity: "course", id: "A" }, { entity: "planning", id: "B" }];
assert.equal(new Set(records.map(item => `${item.entity}:${item.id}`)).size, 2);
const disjoint = mergeOfflineChange({ baseData: { title: "Cours", room: "Gym", duration: 60 }, localData: { title: "Cours PWA", room: "Gym", duration: 60 }, serverData: { title: "Cours", room: "Stade", duration: 60 } });
assert.equal(disjoint.kind, "merged");
assert.deepEqual(disjoint.data, { title: "Cours PWA", room: "Stade", duration: 60 });
const overlap = mergeOfflineChange({ baseData: { title: "Cours", room: "Gym" }, localData: { title: "Version PWA", room: "Gym" }, serverData: { title: "Version Web", room: "Gym" } });
assert.equal(overlap.kind, "conflict");
assert.deepEqual(overlap.overlappingFields, ["title"]);
const sameFinalValue = mergeOfflineChange({
  baseData: {},
  localData: { host_available: false, host_age_max: null },
  serverData: { host_available: false, host_age_max: null }
});
assert.equal(sameFinalValue.kind, "merged");
assert.deepEqual(sameFinalValue.overlappingFields, []);
const technicalDates = mergeOfflineChange({
  baseData: { title: "Cours", updated_at: "2026-09-01" },
  localData: { title: "Cours local", updated_at: "2026-09-27T23:26:00Z" },
  serverData: { title: "Cours", updated_at: "2026-09-15T22:48:00Z" }
});
assert.equal(technicalDates.kind, "merged");
assert.deepEqual(technicalDates.overlappingFields, []);
console.log("PWA merge tests: OK");
