// Read-only negative authentication smoke. Does not use any user's credentials.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync('public/assets/js/desktop-operations.js','utf8');
const anon=source.match(/(?:var|const)\s+SUPABASE_ANON\s*=\s*['"]([^'"]+)['"]/)[1];
const endpoint=source.match(/(?:var|const)\s+SUPABASE_API\s*=\s*['"]([^'"]+)['"]/)[1];
const base=endpoint.replace(/\/api$/,'');
const cases=[
 ['api',null,400],['api',[],400],['admin-api',null,400],['liff-api',null,400],
 ['api',{action:'getSystemHealth',role:'admin'},401],
 ['api',{action:'getMyRole',token:'invalid-audit-session'},null],
 ['admin-api',{action:'getRoleAssignments',role:'admin'},null],
 ['liff-api',{},401],
 ['cron-jobs',{},401],
];
for(const [slug,body,status] of cases){
 const response=await fetch(base+'/'+slug,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+anon,apikey:anon},body:JSON.stringify(body)});
 const text=await response.text();
 let data;try{data=JSON.parse(text);}catch{}
 assert.ok(response.status<500,`${slug}: unexpected server error ${response.status}`);
 if(status)assert.equal(response.status,status,`${slug}: response status`);
 if(slug!=='cron-jobs')assert.equal(data?.ok,false,`${slug}: request must not succeed`);
 assert.ok(!data?.rows&&!data?.members&&!data?.token,`${slug}: denied request must not expose data`);
 console.log('PASS',slug,body?.action||'invalid/missing body',response.status);
}
console.log('PASS production negative-auth smoke; no member writes, messages or valid-user credentials used');
