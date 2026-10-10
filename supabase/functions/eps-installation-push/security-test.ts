// Only local dummy credentials; unauthorized requests must never access the database.
let handler:(request:Request)=>Promise<Response>;
Deno.env.set('SUPABASE_URL','http://127.0.0.1:9');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','dummy-local-test-key');
Deno.env.set('EPS_PUSH_DISPATCH_SECRET','test-only-secret-at-least-thirty-two-characters');
const serve=Deno.serve;
(Deno as any).serve=(fn:any)=>{handler=fn;};
await import('./index.ts');
(Deno as any).serve=serve;
Deno.test('public callers cannot trigger deliveries',async()=>{
 const response=await handler(new Request('http://localhost/',{method:'POST',body:'{}'}));
 if(response.status!==401)throw Error('Unauthorized request accepted');
});
Deno.test('wrong secret cannot claim queue',async()=>{
 const response=await handler(new Request('http://localhost/',{method:'POST',headers:{'x-eps-push-secret':'wrong'}}));
 if(response.status!==401)throw Error('Wrong secret accepted');
});
Deno.test('valid secret does not permit GET',async()=>{
 const response=await handler(new Request('http://localhost/',{headers:{'x-eps-push-secret':Deno.env.get('EPS_PUSH_DISPATCH_SECRET')!}}));
 if(response.status!==405)throw Error('Invalid method accepted');
});
