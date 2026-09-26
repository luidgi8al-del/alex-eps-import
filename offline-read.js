/* Strict read-only fallback for legacy screens. Unsupported queries require the network. */
function offlineSchemaKey(url) {
  const parsed = new URL(url, location.href);
  if (parsed.origin !== new URL(SUPABASE_URL).origin) return null;
  if (!['/rest/v1/eps_schema_marks','/rest/v1/rpc/eps_as_roster_version'].includes(parsed.pathname)) return null;
  return `eps:offline-schema-response:${session?.user_id}:${parsed.href}`;
}
async function rememberOfflineSchema(url, response) {
  const key = offlineSchemaKey(url);
  if (key) try { localStorage.setItem(key, JSON.stringify(await response.clone().json())); } catch {}
}
function offlineFilter(params) {
  const predicates = [];
  for (const [field, expression] of params) {
    if (['select','order','limit','offset'].includes(field)) continue;
    if (!/^[a-z_]+$/.test(field)) throw Error("Cette recherche nécessite une connexion Internet.");
    const match = /^(eq|neq|is|in)\.(.*)$/.exec(expression);
    if (!match) throw Error("Ce filtre nécessite une connexion Internet.");
    const [,operator,value] = match;
    if (operator === 'in' && !/^\([^"()]*\)$/.test(value)) throw Error("Ce filtre nécessite Internet.");
    predicates.push(row => {
      const actual = row[field];
      if (operator === 'is') return value === 'null' ? actual == null : String(actual) === value;
      if (actual == null) return false;
      if (operator === 'in') return value.slice(1,-1).split(',').includes(String(actual));
      return operator === 'eq' ? String(actual) === value : String(actual) !== value;
    });
  }
  return row => predicates.every(test=>test(row));
}
async function offlineReadResponse(url, options = {}) {
  const schemaKey = offlineSchemaKey(url);
  if (schemaKey) {
    const data = localStorage.getItem(schemaKey);
    if (data !== null) return new Response(data,{headers:{'Content-Type':'application/json'}});
    throw Error("Préparez cet appareil avec Internet avant d’ouvrir cette rubrique hors connexion.");
  }
  const parsed = new URL(url,location.href);
  if (parsed.origin !== new URL(SUPABASE_URL).origin) return null;
  const table = /^\/rest\/v1\/([a-z_]+)$/.exec(parsed.pathname)?.[1];
  if (!table || ![...TABLES_HORS_CONNEXION,...TABLES_HORS_CONNEXION_VAGUE_2].includes(table)) return null;
  const engine = await demarrerModeHorsConnexion();
  if (!engine?.adapter.tables.includes(table)) return null;
  const params = parsed.searchParams;
  const projection = params.get('select') || '*';
  if (projection !== '*' && !/^[a-z_,]+$/.test(projection)) throw Error("Cette vue détaillée nécessite une connexion Internet.");
  const predicate = offlineFilter(params);
  let rows = (await engine.lire(table,{ou:predicate,avecSupprimes:true})).rows;
  const orders = (params.get('order') || '').split(',').filter(Boolean).map(order=>{
    if (!/^[a-z_]+(?:\.(?:asc|desc))?$/.test(order)) throw Error("Ce tri nécessite Internet.");
    return order.split('.');
  });
  rows.sort((a,b)=>{
    for (const [field,direction] of orders) {
      const av=a[field],bv=b[field];
      const comparison=av===bv?0:av==null?1:bv==null?-1:av<bv?-1:1;
      if (comparison) return direction==='desc'?-comparison:comparison;
    }
    return 0;
  });
  const offset = Number(params.get('offset') || 0), limit = Number(params.get('limit') || rows.length);
  rows = rows.slice(offset, offset+limit);
  const range = new Headers(options.headers || {}).get('Range');
  if (range) {
    if (!/^\d+-\d+$/.test(range)) throw Error("Pagination non disponible hors connexion.");
    const [start,end]=range.split('-').map(Number); rows=rows.slice(start,end+1);
  }
  if (projection !== '*') rows=rows.map(row=>Object.fromEntries(projection.split(',').map(field=>[field,row[field]??null])));
  return new Response(JSON.stringify(rows),{headers:{'Content-Type':'application/json'}});
}
