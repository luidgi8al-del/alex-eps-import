const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/ui-system.css'),'utf8');
const page=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(css.includes('.searchSheet.ui-modal>#unssPanel.ui-modal-panel'));
for(const rule of ['position:static!important','transform:none!important','max-height:none!important','overflow:visible!important'])assert(css.includes(rule));
assert(page.includes('styles/ui-system.css?v=20260927-3'));
console.log('as-license-scroll: legacy fixed panel is restored to the scrolling modal flow OK');
