// Version en un seul fichier, pour l'editeur en ligne de Supabase.
// La source de reference reste index.ts + handler.mjs dans le depot.
import { createClient } from "npm:@supabase/supabase-js@2";

function teamAdminHandler({verifyUser,rpc,invite,inviteManager,recover,recoverManager,deleteUser,createUser,magicLink,allowedOrigin}) {
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
   if(!['invite','reserve','send_invite','pending_invites','cancel_invite','impersonate','reset_password','delete','invite_manager','reset_manager_password'].includes(body.action))return reply({error:'Action inconnue'},400);
   if(body.action==='invite_manager') {
    const email=String(body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'E-mail valide requis'},400);
    await rpc('eps_validate_installation_manager_invite',{p_actor:actor.id,p_email:email});
    try { await inviteManager(email); } catch { await recoverManager(email); }
    await rpc('eps_assign_installation_manager_by_admin',{p_actor:actor.id,p_email:email});
    return reply({ok:true,message:'Invitation du responsable envoyée. Il choisira son mot de passe depuis le lien reçu.'});
   }
   if(body.action==='reset_manager_password') {
    const context=await rpc('eps_installation_manager_admin_context_for_service',{p_actor:actor.id});
    if(!context?.email)return reply({error:'Aucun responsable autorisé'},400);
    await recoverManager(context.email);
    return reply({ok:true,message:'Un nouveau lien de mot de passe a été envoyé au responsable.'});
   }
   if(body.action==='pending_invites')return reply({ok:true,invites:await rpc('eps_pending_invites',{p_actor:actor.id})});
   if(body.action==='invite'||body.action==='reserve') {
    const email=String(body.email||'').trim().toLowerCase(),name=String(body.name||'').trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!name||name.length>150)return reply({error:'Nom et e-mail valides requis'},400);
    await rpc('eps_reserve_invite',{p_actor:actor.id,p_email:email,p_name:name});
    if(body.action==='reserve') {
     await createUser(email);
     return reply({ok:true,message:'Compte créé. Préparez ses classes, puis envoyez son lien de mot de passe.'});
    }
    await invite(email);
    return reply({ok:true,message:'Invitation envoyée. Le collègue définit son propre mot de passe.'});
   }
   if(body.action==='cancel_invite') {
    const email=String(body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'E-mail valide requis'},400);
    await rpc('eps_cancel_invite',{p_actor:actor.id,p_email:email});
    return reply({ok:true,message:'Réservation annulée.'});
   }
   if(body.action==='send_invite') {
    const email=String(body.email||'').trim().toLowerCase();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:'E-mail valide requis'},400);
    if(await rpc('eps_pending_invite_exists',{p_actor:actor.id,p_email:email})!==true)return reply({error:'Aucune place réservée pour cette adresse'},400);
    await recover(email);
    return reply({ok:true,message:'Lien envoyé. Le collègue définit son propre mot de passe.'});
   }
   const target=String(body.target_id||'');
   if(body.action==='impersonate') {
    if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(target))return reply({error:'Compte invalide'},400);
    const ctx=await rpc('eps_begin_impersonation',{p_actor:actor.id,p_target:target});
    const link=await magicLink(ctx.email);
    const hash=link?.properties?.hashed_token;
    if(!hash)return reply({error:'Bascule impossible pour ce compte'},400);
    return reply({ok:true,token_hash:hash,email:ctx.email});
   }
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
  } catch {
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
const managerRedirect=`${origin}/responsable-installations.html`;
const admin=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
const checked=async(promise:Promise<any>)=>{const {data,error}=await promise;if(error)throw error;return data;};
Deno.serve(teamAdminHandler({
 allowedOrigin:origin,
 verifyUser:async(jwt:string)=>(await checked(auth.auth.getUser(jwt)))?.user,
 rpc:async(name:string,args:object)=>checked(admin.rpc(name,args)),
 invite:async(email:string)=>checked(admin.auth.admin.inviteUserByEmail(email,{redirectTo:redirect})),
 inviteManager:async(email:string)=>checked(admin.auth.admin.inviteUserByEmail(email,{redirectTo:managerRedirect})),
 recover:async(email:string)=>checked(auth.auth.resetPasswordForEmail(email,{redirectTo:redirect})),
 recoverManager:async(email:string)=>checked(auth.auth.resetPasswordForEmail(email,{redirectTo:managerRedirect})),
 createUser:async(email:string)=>checked(admin.auth.admin.createUser({email,email_confirm:true})),
 magicLink:async(email:string)=>checked(admin.auth.admin.generateLink({type:'magiclink',email})),
 deleteUser:async(id:string)=>checked(admin.auth.admin.deleteUser(id,false)),
}));
