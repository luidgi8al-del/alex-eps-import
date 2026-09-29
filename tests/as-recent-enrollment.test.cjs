const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'aslvh.js'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/eps-as-slot-email/index.ts'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20260929150000_as_membership_enrolled_at.sql'), 'utf8');
const debut = Date.parse('2026-09-29T00:00:00Z');
const records = [
  { student_id: 'old-modified', enrolled_at: '2026-09-15T08:00:00Z', updated_at: '2026-09-29T12:00:00Z' },
  { student_id: 'legacy', updated_at: '2026-09-29T12:00:00Z' },
  { student_id: 'unknown', enrolled_at: null, updated_at: '2026-09-29T12:00:00Z' },
  { student_id: 'invalid', enrolled_at: 'invalid' },
  { student_id: 'new', enrolled_at: '2026-09-29T00:00:00Z' },
  { student_id: 'offline', enrolled_at: '2026-09-28T23:00:00Z', updated_at: '2026-09-29T12:00:00Z' },
].map(row => ({ slot_id: 'active', deleted: false, ...row }));
const expression = ui.match(/const idsRecents = new Set\(([\s\S]*?)\);\s*return rows/)[1];
function frontend(rows) {
  return Array.from(vm.runInNewContext(`Array.from(new Set(${expression}))`, {
    unssInscriptions: rows, debut, unssSlots: [{id: 'active', active: true}]
  }));
}
assert.deepEqual(frontend(records), ['new']);
assert.deepEqual(frontend([
  {...records[4], deleted: true}, {...records[4], slot_id: 'removed'}
]), []);
const serverExpression = edge.match(/const recentStudentIds = ([\s\S]*?);/)[1];
assert.deepEqual(Array.from(vm.runInNewContext(serverExpression, {
  memberships: records, enrolledSinceMillis: debut
})), ['new']);
assert.match(sql, /NEW\.enrolled_at := OLD\.enrolled_at/);
assert.match(sql, /coalesce\(NEW\.enrolled_at, now\(\)\)/);
assert.doesNotMatch(sql, /update\s+public\.unss_memberships\s+set/i);
assert.equal((ui.match(/enrolled_at: new Date\(\)\.toISOString\(\)/g) || []).length, 4);
console.log('PASS: immutable enrollment filter, legacy/invalid dates excluded, boundary inclusive, offline date preserved, inactive/deleted excluded; SQL invariants checked (not executed).');
