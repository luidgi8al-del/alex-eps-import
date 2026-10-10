import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { SignJWT, importPKCS8 } from 'npm:jose@5.9.6';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
const checked=async(p:PromiseLike<any>)=>{const {data,error}=await p;if(error)throw error;return data};
const labels:Record<string,string>={SIGNALE:'Un nouveau problème d’installation a été signalé.',EN_COURS:'Votre signalement est pris en charge.',RESOLU:'Votre signalement est résolu.'};
let oauth:{token:string,until:number}|null=null;
async function fcmToken(service:any) {
 if(oauth&&oauth.until>Date.now())return oauth.token;
 const key=await importPKCS8(service.private_key,'RS256');
 const jwt=await new SignJWT({scope:'https://www.googleapis.com/auth/firebase.messaging'}).setProtectedHeader({alg:'RS256'}).setIssuer(service.client_email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt().setExpirationTime('1h').sign(key);
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
 if(!response.ok)throw Error('FCM authentication failed');const data=await response.json();oauth={token:data.access_token,until:Date.now()+3000000};return oauth.token;
}
Deno.serve(async request=>{
 const secret=Deno.env.get('EPS_PUSH_DISPATCH_SECRET');
 if(!secret || secret.length<32 || request.headers.get('x-eps-push-secret')!==secret)return new Response('Unauthorized',{status:401});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 try {
  const events=await checked(db.rpc('eps_push_claim'));let sent=0,failed=0;
  const firebase=Deno.env.get('EPS_FIREBASE_SERVICE_ACCOUNT');const service=firebase?JSON.parse(firebase):null;
  for(const event of events) {
   try {
    const incident=await checked(db.from('sport_installation_incidents').select('id,institution_id,user_id,deleted').eq('id',event.incident_id).single());
    const active=await checked(db.rpc('eps_push_recipient_active',{p_user:event.user_id}));
    const scope=await checked(db.from('profiles').select('institution_id').eq('id',event.user_id).maybeSingle());
    const manager=await checked(db.from('eps_installation_managers').select('institution_id').eq('user_id',event.user_id).maybeSingle());
    if(!active || incident.deleted || (scope?.institution_id!==incident.institution_id && manager?.institution_id!==incident.institution_id)) {await checked(db.from('eps_push_events').update({sent_at:new Date().toISOString(),last_error:'Recipient no longer authorized'}).eq('id',event.id));continue}
    const devices=await checked(db.from('eps_push_devices').select('*').eq('user_id',event.user_id));
    const deliveries=await checked(db.from('eps_push_deliveries').select('device_id').eq('event_id',event.id));
    const delivered=new Set(deliveries.map((d:any)=>d.device_id));
    if(!devices.length)throw Error('No subscribed device');
    for(const device of devices.filter((d:any)=>!delivered.has(d.id))) {
     const payload={id:event.id,recipient:event.user_id,title:'EPS LVH · Installations',body:labels[event.kind]||'Suivi mis à jour',manager:event.kind==='SIGNALE'};
     try {
      if(device.platform==='web') {
       const host=new URL(device.subscription.endpoint).hostname;
       if(!['fcm.googleapis.com','updates.push.services.mozilla.com','web.push.apple.com'].includes(host))throw Error('Invalid push host');
       const pub=Deno.env.get('EPS_VAPID_PUBLIC_KEY'),priv=Deno.env.get('EPS_VAPID_PRIVATE_KEY'),subject=Deno.env.get('EPS_VAPID_SUBJECT');
       if(!pub||!priv||!subject)throw Error('Web push not configured');
       await webpush.sendNotification(device.subscription,JSON.stringify(payload),{TTL:3600,vapidDetails:{subject,publicKey:pub,privateKey:priv}});
      } else {
       if(!service)throw Error('Android push not configured');
       const token=await fcmToken(service);
       const response=await fetch(`https://fcm.googleapis.com/v1/projects/${service.project_id}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token:device.subscription.token,data:Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,String(v)])),android:{priority:'high',ttl:'3600s'}}})});
       if(!response.ok){const data=await response.json();if(data.error?.details?.some((d:any)=>d.errorCode==='UNREGISTERED')){await checked(db.from('eps_push_devices').delete().eq('id',device.id));continue}throw Error('FCM send failed')}
      }
      await checked(db.from('eps_push_deliveries').insert({event_id:event.id,device_id:device.id}));
     }catch(error:any){if([404,410].includes(error.statusCode)){await checked(db.from('eps_push_devices').delete().eq('id',device.id));continue}throw error}
    }
    await checked(db.from('eps_push_events').update({sent_at:new Date().toISOString(),lease_until:null,last_error:null}).eq('id',event.id));sent++;
   }catch(error:any){failed++;await checked(db.from('eps_push_events').update({last_error:String(error.message).slice(0,200)}).eq('id',event.id))}
  }
  return Response.json({sent,failed});
 }catch {return new Response('Dispatch failed',{status:500})}
});
