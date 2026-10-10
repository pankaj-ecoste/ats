-- 0006 A switched-off or pending account must see and change nothing, however the other policies are worded.
-- The per-person rules in 0004 ("this is my opening", "I am on this interview", "this task is mine") only compare ids.
-- A restrictive policy is ANDed with all the permissive ones, so this one gate covers every table at once.
-- When you add a table, add its name to the list below in the migration that creates it (or a later one).

do $$
declare t text;
begin
  foreach t in array array['openings', 'candidates', 'candidate_compensation', 'candidate_documents', 'applications', 'stage_events', 'screenings',
    'interview_groups', 'interviews', 'interview_scores', 'offers', 'onboarding_checklists', 'onboarding_items', 'tasks', 'notifications', 'activity',
    'audit_log', 'messages', 'job_boards', 'postings', 'report_events', 'call_log', 'monthly_targets', 'intake_batches', 'sheet_log', 'company_settings'] loop
    execute format('create policy members_only on public.%I as restrictive for all to authenticated using (app.is_member()) with check (app.is_member())', t);
  end loop;
end $$;

-- profiles are the exception: a pending or switched-off user still reads their own row (so the app can tell them what is wrong)
