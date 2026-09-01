// Version en un seul fichier, pour l'editeur en ligne de Supabase.
// La source de reference reste index.ts + handler.mjs dans le depot.

import { createClient } from "npm:@supabase/supabase-js@2";

// Dependency-injected server handler: no secret key or admin capability reaches a client.
function teamAdminHandler({verifyUser,rpc,invite,recover,deleteUser,allowedOrigin}) {
 return async function(req) {
  const origin=req.headers.get('origin');
  const headers={'Content-Type':'application/json','Vary':'Origin'};
  if(origin && origin!==allowedOrigin)return new Response(JSON.stringify({error:'Origin refused'}),{status:403,headers});
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS'}});
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(req.method!=='POST')return reply({error:'POST required'},405);
  try {
   const match=/^Bearer (\S+)$/i.exec(req.headers.get('authorization')||'');
   if(!match)return reply({error:'Connexion requise'},401);
   const actor=await verifyUser(match[1]);
   if(!actor?.id)return reply({error:'Connexion expirée'},401);
   const body=await req.json();
   if(!['invite','reserve','send_invite','pending_invites','reset_password','delete'].includes(body.action))return reply({error:'Action inconnue'},400);
   // Places reservees dont le mail n'est pas encore parti.
   if(body.action==='pending_invites')return reply({ok:true,invites:await rpc('eps_pending_invites',{p_actor:actor.id})});
   if(body.action==='invite'||body.action==='reserve') {
    const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>150)return reply({error:'Nom et e-mail valides requis'},400);
    await rpc('eps_reserve_invite',{p_actor:actor.id,p_email:email,p_name:name});
    // 'reserve' s'arrete la : l'administrateur prepare le compte, et declenche l'envoi plus tard.
    if(body.action==='reserve')return reply({ok:true,message:'Compte réservé. Préparez ses classes, puis envoyez l’invitation.'});
    await invite(email);
    return reply({ok:true,message:'Invitation envoyée. Le collègue définit son propre mot de passe.'});
   }
   if(body.action==='send_invite') {
    const email=String(body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'E-mail valide requis'},400);
    // Sans ce controle, l'envoi deviendrait un moyen d'expedier des mails a n'importe qui.
    if(await rpc('eps_pending_invite_exists',{p_actor:actor.id,p_email:email})!==true)
     return reply({error:'Aucune place réservée pour cette adresse'},400);
    await invite(email);
    return reply({ok:true,message:'Invitation envoyée. Le collègue définit son propre mot de passe.'});
   }
   const target=String(body.target_id||'');
   if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(target))return reply({error:'Compte invalide'},400);
   if(target===actor.id)return reply({error:'Cette action ne permet pas de supprimer votre propre compte.'},400);
   const context=await rpc('eps_admin_target',{p_actor:actor.id,p_target:target});
   if(body.action==='reset_password') {
    if(!context.email)return reply({error:'Aucun e-mail pour ce compte'},400);
    await recover(context.email);
    return reply({ok:true,message:'Lien de création ou réinitialisation du mot de passe envoyé.'});
   }
   if(body.confirm!==true)return reply({error:'Confirmation de suppression requise'},400);
   const preservation=await rpc('eps_prepare_remove_teacher',{p_actor:actor.id,p_target:target});
   try { await deleteUser(target); }
   catch { return reply({ok:false,blocked:true,error:'Accès bloqué et historique AS préservé. La suppression du compte doit être réessayée.'},503); }
   await rpc('eps_finish_remove_teacher',{p_actor:actor.id,p_target:target});
   return reply({ok:true,...preservation,message:'Compte supprimé. Groupes et anciens appels conservés.'});
  } catch(e) {
   // No raw tokens, SQL bodies, service errors or student information in client responses/logs.
   return reply({error:'Opération non confirmée. Vérifiez vos droits administrateur et la configuration du service.'},403);
  }
 };
}

const url=Deno.env.get("SUPABASE_URL")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const redirect=Deno.env.get("EPS_PASSWORD_REDIRECT_URL");
const origin=Deno.env.get("EPS_WEB_ORIGIN");
if(!redirect || !origin || !redirect.startsWith(origin+"/"))throw Error("Configure a fixed, allowed EPS password redirect");
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=async(promise:Promise<any>)=>{const {data,error}=await promise;if(error)throw error;return data;};
Deno.serve(teamAdminHandler({
 allowedOrigin:origin,
 verifyUser:async(jwt:string)=>(await checked(auth.auth.getUser(jwt)))?.user,
 rpc:async(name:string,args:object)=>checked(admin.rpc(name,args)),
 invite:async(email:string)=>checked(admin.auth.admin.inviteUserByEmail(email,{redirectTo:redirect})),
 recover:async(email:string)=>checked(auth.auth.resetPasswordForEmail(email,{redirectTo:redirect})),
 deleteUser:async(id:string)=>checked(admin.auth.admin.deleteUser(id,false)),
}));
