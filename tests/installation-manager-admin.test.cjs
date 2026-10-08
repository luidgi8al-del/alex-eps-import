const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const { teamAdminHandler } = await import(pathToFileURL(path.resolve(__dirname, '../supabase/functions/eps-team-admin/handler.mjs')).href);
  const calls = [];
  const rpc = async (name, args) => {
    calls.push(['rpc', name, args]);
    if (name === 'eps_installation_manager_admin_context_for_service') return {email:'responsable@example.fr'};
    return true;
  };
  const handler = teamAdminHandler({
    allowedOrigin:'https://school.test',
    verifyUser:async () => ({id:'11111111-1111-1111-1111-111111111111'}),
    rpc,
    invite:async () => {},
    inviteManager:async email => calls.push(['inviteManager',email]),
    recover:async () => {},
    recoverManager:async email => calls.push(['recoverManager',email]),
    createUser:async () => {},
    deleteUser:async () => {},
    magicLink:async () => ({properties:{hashed_token:'test'}})
  });
  const request = body => new Request('https://function.test', {
    method:'POST',
    headers:{origin:'https://school.test',authorization:'Bearer admin-token','content-type':'application/json'},
    body:JSON.stringify(body)
  });

  let response = await handler(request({action:'invite_manager',email:'Responsable@Example.fr'}));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.slice(0,3).map(call => call.slice(0,2)), [
    ['rpc','eps_validate_installation_manager_invite'],
    ['inviteManager','responsable@example.fr'],
    ['rpc','eps_assign_installation_manager_by_admin']
  ]);
  calls.length = 0;

  response = await handler(request({action:'reset_manager_password'}));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map(call => call.slice(0,2)), [
    ['rpc','eps_installation_manager_admin_context_for_service'],
    ['recoverManager','responsable@example.fr']
  ]);

  response = await handler(new Request('https://function.test', {
    method:'POST',headers:{origin:'https://evil.test',authorization:'Bearer admin-token','content-type':'application/json'},
    body:JSON.stringify({action:'invite_manager',email:'x@example.fr'})
  }));
  assert.equal(response.status, 403);
  console.log('PASS Administration responsable : invitation admin, renvoi et origine protégée');
})().catch(error => { console.error(error); process.exitCode = 1; });
