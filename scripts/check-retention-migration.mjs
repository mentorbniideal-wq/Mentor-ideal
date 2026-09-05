import fs from 'node:fs';

const schema = fs.readFileSync('supabase/migrations/20260904000111_system_job_runs.sql', 'utf8');
const fix = fs.readFileSync('supabase/migrations/20260906000001_fix_mobile_retention_job_timestamp.sql', 'utf8');

if (!/started_at\s+TIMESTAMPTZ/.test(schema)) throw new Error('system_job_runs lifecycle column changed');
if (!/system_job_runs[\s\S]*WHERE started_at\s*</.test(fix)) throw new Error('retention function must use system_job_runs.started_at');
if (/system_job_runs[\s\S]{0,80}created_at\s*</.test(fix)) throw new Error('invalid system_job_runs.created_at reference returned');
if (!/SET search_path = public/.test(fix)) throw new Error('SECURITY DEFINER function must pin search_path');

console.log('Mobile retention migration contract passed.');
