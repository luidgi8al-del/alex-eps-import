// Read-only public settings check. Never prints the application key.
const fs=require('node:fs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
const url=html.match(/const SUPABASE_URL = "([^"]+)/)[1];
const key=html.match(/const SUPABASE_KEY = "([^"]+)/)[1];
fetch(url+'/auth/v1/settings',{headers:{apikey:key}}).then(async response=>{
 const settings=await response.json();
 console.log(JSON.stringify({http:response.status,disable_signup:settings.disable_signup,email_enabled:settings.external?.email}));
 if(!response.ok || settings.disable_signup!==true)process.exitCode=1;
}).catch(error=>{console.error(error.message);process.exitCode=1;});
