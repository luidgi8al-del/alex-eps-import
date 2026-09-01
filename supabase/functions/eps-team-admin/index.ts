import { createClient } from "npm:@supabase/supabase-js@2";
import { teamAdminHandler } from "./handler.mjs";

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
