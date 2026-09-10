import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verificationHelp } from './verification-help.ts';

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const pair = { id:'pair-a', member_a_id:'member-a', member_b_id:'member-b', status:'awaiting_verification' };
function fixture(options: { versionError?: boolean; readError?: boolean; insertError?: boolean; race?: boolean } = {}) {
  const records: Record<string, unknown>[] = [];
  const versions = [{ pair_id:'pair-a', code_version:1 }];
  let reads = 0;
  const db = { from(table: string) {
    const filters: [string, unknown][] = [];
    let insert: Record<string, unknown> | undefined;
    const query = {
      select() { return this; },
      eq(key: string, value: unknown) { filters.push([key, value]); return this; },
      like() { return this; }, order() { return this; },
      insert(value: Record<string, unknown>) { insert=value; return this; },
      single() { return this; },
      then(resolve: (value: unknown) => unknown) {
        reads++;
        if (insert) {
          if (options.insertError) return Promise.resolve(resolve({data:null,error:{code:'XX'}}));
          if (options.race || records.some(row=>row.idempotency_key===insert!.idempotency_key)) return Promise.resolve(resolve({data:null,error:{code:'23505'}}));
          const row={id:'request-'+records.length,...insert}; records.push(row);
          return Promise.resolve(resolve({data:{id:row.id},error:null}));
        }
        const failure=table==='one_to_one_verifications'?options.versionError:options.readError;
        const source=table==='one_to_one_verifications'?versions:records;
        const data=source.filter(row=>filters.every(([key,value])=>(row as Record<string,unknown>)[key]===value));
        return Promise.resolve(resolve({data:failure?null:data,error:failure?{message:'database unavailable'}:null}));
      },
    };
    return query;
  } } as unknown as SupabaseClient;
  return {db,records,versions,reads:()=>reads};
}

Deno.test('verification request denies unrelated members and closed pairs before database access', async () => {
  const f=fixture();
  assert(!(await verificationHelp(f.db,pair,'outsider',true)).ok,'cross-pair request must fail');
  assert(!(await verificationHelp(f.db,{...pair,status:'cancelled'},'member-a',true)).ok,'cancelled pair must fail');
  assert(!(await verificationHelp(f.db,{...pair,archived_at:'2026-01-01'},'member-a',true)).ok,'archived pair must fail');
  assert(f.reads()===0,'Denied pairs must not read request data');
});
Deno.test('both members share one request per code generation; duplicate clicks do not notify again', async () => {
  const f=fixture();
  const first=await verificationHelp(f.db,pair,'member-a',true);
  const second=await verificationHelp(f.db,pair,'member-b',true);
  const read=await verificationHelp(f.db,pair,'member-b',false);
  assert(first.created&&!second.created&&f.records.length===1,'only creator triggers notification');
  assert(read.state==='pending','Status survives reload for either participant');
  const row=f.records[0];
  assert(row.member_id==='member-a'&&row.pair_id==='pair-a','Auditable requester and authorized pair');
  assert(!JSON.stringify(row).includes('code_hash')&&!('code' in row),'No codes or hashes in request');
});
Deno.test('trio participant can request help; other pairs do not share deduplication keys', async () => {
  const f=fixture();
  assert((await verificationHelp(f.db,{...pair,optional_member_c_id:'member-c'},'member-c',true)).created,'trio participant allowed');
  assert((await verificationHelp(f.db,{...pair,id:'pair-b'},'member-a',true)).created,'separate pair request');
  assert(f.records.length===2,'one request per pair');
});
Deno.test('reset generation is visible to members and allows a new request only for the new code', async () => {
  const f=fixture(); await verificationHelp(f.db,pair,'member-a',true);
  f.versions[0].code_version=2;
  assert((await verificationHelp(f.db,pair,'member-a',false)).state==='reset','New code generation reported');
  assert((await verificationHelp(f.db,pair,'member-a',true)).created,'New generation can report a fresh issue');
  assert(f.records.length===2,'Retain request history');
});
Deno.test('complete and reviewed requests explain status without creating another request', async () => {
  const f=fixture();
  assert((await verificationHelp(f.db,{...pair,status:'verified'},'member-a',true)).state==='complete','Complete pairs do not reset');
  await verificationHelp(f.db,pair,'member-a',true);f.records[0].status='no_action_required';
  assert((await verificationHelp(f.db,pair,'member-a',true)).state==='reviewed','Reviewed request stays deduplicated');
  assert(f.records.length===1,'No extra request');
});
Deno.test('concurrent unique conflict is success without duplicate notification; storage failures are not success', async () => {
  const concurrent=fixture({race:true});const result=await verificationHelp(concurrent.db,pair,'member-a',true);
  assert(result.ok&&result.state==='pending'&&!result.created,'Concurrent duplicate stays successful');
  for (const options of [{versionError:true},{readError:true},{insertError:true}]) {
    const f=fixture(options); assert(!(await verificationHelp(f.db,pair,'member-a',true)).ok,'Storage failure must be visible');
  }
});
