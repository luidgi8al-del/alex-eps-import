const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

test('EPPCS loads the lesson model before its view and controller, including the offline manifest', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const sources = [...index.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  const model = sources.findIndex(source => source.startsWith('eppcs-lesson-model.js?'));
  const view = sources.findIndex(source => source.startsWith('eppcs-ui.js?'));
  const controller = sources.findIndex(source => source.startsWith('eppcs.js?'));
  assert(model >= 0 && model < view && view < controller, 'Model must be available before the view is mounted');
  const context = { self: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'offline-assets.js'), 'utf8'), context);
  for (const source of [sources[model], sources[view], sources[controller]]) {
    assert(context.self.EPS_OFFLINE_ASSETS.includes('./' + source), 'Exact versioned URL must be available offline');
    assert(fs.existsSync(path.join(root, source.split('?')[0])));
  }
  assert(!context.self.EPS_OFFLINE_ASSETS.some(source => /\.docx|\.eppcs\.json|atelier-eppcs\//i.test(source)), 'Private course documents never enter the public cache');
});
