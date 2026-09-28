const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'home-navigation.css'),'utf8');

assert.match(html,/class="homeAlert"/);
assert.match(html,/id="homeAlertContent"/);
assert.match(html,/>ALERTE</);
assert.match(css,/grid-template-columns:minmax\(150px,\.75fr\).*minmax\(115px,\.55fr\)/);
assert.match(css,/body \.header \{[^}]*padding:10px 26px 9px/);
assert.match(css,/\.homeAlert \{/);
assert.match(css,/\.homeAlert h2 \{[^}]*text-align:center/);
assert.match(css,/@media\(max-width:850px\)[\s\S]*\.homeAlert/);
console.log('PASS compact home header, four-part summary row and future alert card');
