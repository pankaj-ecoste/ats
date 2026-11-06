-- 0037 Scale and housekeeping (closing version 1)
--   1. data_stamp()  a short fingerprint of "has anything been written to the tables the app reads". Every open tab asks this tiny question once a
--                    minute and downloads the data again only when the answer changed. Before this, every tab re-read the whole database every minute.
--   2. indexes       the foreign keys that had none (they slow deleting an opening or a candidate, and joins, as the tables grow), and the one the
--                    public doors use to count recent tries.
--   3. prune_logs()  operational logs are kept for a limited time (applicant e-mails sit inside the intake log, so it must not grow for ever).
--                    The audit log and the stage history are NOT touched: how long those are kept is the owner's decision (plan D12 and D17).

/* ---------- 1. the change stamp ---------- */
-- Built from Postgres's own write counters (inserts + updates + deletes per table), so it needs no trigger and no column on any table, and
-- it cannot miss a table that has no updated_at. It says nothing about the content: only whether something was written.
-- Counters start again after a database restart, which just causes one extra reload. They can lag by about a second; the app also reloads fully
-- every ten minutes whatever the stamp says.
create function public.data_stamp() returns text language sql stable security definer set search_path = pg_catalog, public as $$
  select md5(coalesce(string_agg(relname || ':' || (n_tup_ins + n_tup_upd + n_tup_del), ',' order by relname), ''))
  from pg_stat_user_tables
  where schemaname = 'public' and relname in (
    'company_settings', 'profiles', 'openings', 'candidates', 'candidate_compensation', 'candidate_documents', 'applications', 'screenings',
    'interview_groups', 'interviews', 'interview_scores', 'offers', 'onboarding_checklists', 'onboarding_items', 'tasks', 'notifications',
    'job_boards', 'postings', 'report_events', 'call_log', 'monthly_targets', 'messages', 'activity', 'sheet_log', 'intake_batches')
$$;
revoke all on function public.data_stamp() from public, anon;
grant execute on function public.data_stamp() to authenticated;

/* ---------- 2. indexes on foreign keys ---------- */
create index if not exists applications_recruiter_id_idx on public.applications (recruiter_id);
create index if not exists openings_recruiter_id_idx on public.openings (recruiter_id);
create index if not exists openings_manager_id_idx on public.openings (manager_id);
create index if not exists offers_manager_id_idx on public.offers (manager_id);
create index if not exists interview_groups_opening_id_idx on public.interview_groups (opening_id);
create index if not exists interviews_group_id_idx on public.interviews (group_id);
create index if not exists messages_application_id_idx on public.messages (application_id);
create index if not exists messages_candidate_id_idx on public.messages (candidate_id);
create index if not exists report_events_application_id_idx on public.report_events (application_id);
create index if not exists report_events_opening_id_idx on public.report_events (opening_id);
-- the public application door and the lead-sheet door each count the last few minutes of this log on every call (to turn a flood away),
-- so that count has to stay cheap however big the log gets
create index if not exists intake_batches_source_received_idx on public.intake_batches (source, received_at desc);

/* ---------- 3. log retention ---------- */
create function app.prune_logs() returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  n_intake int; n_sheet int; n_notes int; n_activity int; n_nudge int;
begin
  delete from public.intake_batches where received_at < now() - interval '90 days';
  get diagnostics n_intake = row_count;
  delete from public.sheet_log where at < now() - interval '180 days';
  get diagnostics n_sheet = row_count;
  delete from public.notifications where (read and created_at < now() - interval '60 days') or created_at < now() - interval '180 days';
  get diagnostics n_notes = row_count;
  delete from public.activity where at < now() - interval '365 days';
  get diagnostics n_activity = row_count;
  delete from app.nudge_log where sent_at < now() - interval '60 days';
  get diagnostics n_nudge = row_count;
  return jsonb_build_object('intake_batches', n_intake, 'sheet_log', n_sheet, 'notifications', n_notes, 'activity', n_activity, 'nudge_log', n_nudge);
end $$;
revoke all on function app.prune_logs() from public, anon, authenticated;

-- every night at 04:30 India time (23:00 UTC), when pg_cron can be used; otherwise run select app.prune_logs() from another scheduler
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('ats-prune-logs', '0 23 * * *', 'select app.prune_logs()');
exception when others then
  raise notice 'pg_cron not available (%); run select app.prune_logs() from another scheduler', sqlerrm;
end $$;
