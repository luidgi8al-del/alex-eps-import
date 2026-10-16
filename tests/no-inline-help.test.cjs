const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
for(const file of ['index.html','responsable-installations.html']){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert(!/(?:src|href)="(?:styles\/)?(?:section-guides|running-quick-guide)\./.test(html),file+' must not load inline help');
}
const android=path.join(root,'../installation-manager-current/app/src/main/java/com/alex/epsoutils');
for(const file of ['MainActivity.kt','ui/equipement/InstallationManagerScreen.kt','ui/tools/AdditionalToolsScreens.kt']){
 assert(!/SectionGuide\(|RunningQuickGuideCard\(|rememberRunningQuickGuide\(/.test(fs.readFileSync(path.join(android,file),'utf8')),file+' must not add a help row');
}
assert(fs.readFileSync(path.join(root,'index.html'),'utf8').includes('aide.js?v=20261016-central-help-2'));
console.log('PASS inline help removed across web and APK; main help retained');
