const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..'),elements=new Map(),requests=[];
function element(id){if(!elements.has(id))elements.set(id,{style:{},value:'',addEventListener(type,cb){this[type]=cb;}});return elements.get(id);}
let saved;
const ctx={document:{getElementById:element},localStorage:{removeItem(){}},SUPABASE_URL:'https://db.test',SUPABASE_KEY:'public-test-key',
 location:{origin:'https://school.test',pathname:'/'},fetch:async(url,opts)=>{requests.push([url,opts]);return{ok:true,json:async()=>({access_token:'access-test',refresh_token:'refresh-test',user:{id:'test',email:'synthetic@example.invalid'}})};},saveSession:s=>saved=s};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(root,'compte.js'),'utf8'),ctx);
vm.runInContext('showMainView = () => {};',ctx);
(async()=>{
 element('email').value='synthetic@example.invalid';element('password').value='synthetic-only';
 await element('authSubmitBtn').click();
 assert(requests[0][0].endsWith('/token?grant_type=password'));assert.equal(saved.refresh_token,'refresh-test');
 await element('authRecoverBtn').click();assert(requests.at(-1)[0].includes('/recover?redirect_to='));
 assert(!requests.some(([u])=>u.includes('/signup')));
 vm.runInContext('passwordLinkSession = {access_token:"invite-test",refresh_token:"refresh-invite",user:{id:"test"}};',ctx);
 ctx.history={replaceState(){}};ctx.location.search='';
 await element('authSubmitBtn').click();assert(requests.at(-1)[0].endsWith('/auth/v1/user'));assert.equal(requests.at(-1)[1].method,'PUT');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');assert(!html.includes('id="authToggleBtn"'));
 console.log('invite-only: login, refresh token, recovery and invitation password setup preserved; no public signup OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
