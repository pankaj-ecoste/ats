-- 0004 Row level security: who may read and write what.   Roles: admin, recruiter, interviewer, hiring_manager, management (pending sees nothing).
--
--   admin, recruiter ("staff")  everything day to day; only admin deletes people's data and reads the audit log
--   hiring_manager              their own openings, the applications and candidates on them, and approves offers
--   interviewer                 only interviews they are on, and the candidates of those interviews; writes their own scorecard
--   management                  read-only: openings, applications, stages and the report tables. No candidate details, no salary, no offers.
--
-- Salary (candidate_compensation) and offers are visible to staff, and offers also to the opening's hiring manager.
-- Helpers are security definer so a policy on one table can look at another without re-entering that table's policies.

create function app.manages_opening(opening text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.openings where id = opening and manager_id = (select auth.uid()))
$$;
create function app.manages_application(application text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications a join public.openings o on o.id = a.opening_id
                 where a.id = application and o.manager_id = (select auth.uid()))
$$;
create function app.interviews_application(application text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.interviews where application_id = application and (select auth.uid()) = any (interviewer_ids))
$$;
create function app.interviews_opening(opening text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.interviews i join public.applications a on a.id = i.application_id
                 where a.opening_id = opening and (select auth.uid()) = any (i.interviewer_ids))
$$;
create function app.interviews_interview(interview text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.interviews where id = interview and (select auth.uid()) = any (interviewer_ids))
$$;
create function app.manages_interview(interview text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.interviews i where i.id = interview and app.manages_application(i.application_id))
$$;
create function app.sees_candidate(candidate text) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.applications a where a.candidate_id = candidate
                 and (app.manages_application(a.id) or app.interviews_application(a.id)))
$$;

-- a task's owner may tick it off but not rewrite it
create function app.guard_task() returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null and not app.is_staff() and (to_jsonb(new) - 'done' - 'updated_at') is distinct from (to_jsonb(old) - 'done' - 'updated_at') then
    raise exception 'You can only mark your own task done or not done';
  end if;
  return new;
end $$;
create trigger guard before update on public.tasks for each row execute function app.guard_task();

-- the role of the signed-in user, for the management check used in several policies
create function app.is_management() returns boolean language sql stable as $$ select coalesce(app.current_role() = 'management', false) $$;

/* ---------- switch RLS on everywhere ---------- */
do $$
declare t text;
begin
  foreach t in array array['openings', 'candidates', 'candidate_compensation', 'candidate_documents', 'applications', 'stage_events', 'screenings',
    'interview_groups', 'interviews', 'interview_scores', 'offers', 'onboarding_checklists', 'onboarding_items', 'tasks', 'notifications', 'activity',
    'audit_log', 'messages', 'job_boards', 'postings', 'report_events', 'call_log', 'monthly_targets', 'intake_batches', 'sheet_log'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

/* ---------- openings ---------- */
create policy openings_read on public.openings for select to authenticated
  using (app.is_staff() or app.is_management() or app.manages_opening(id) or app.interviews_opening(id));
create policy openings_insert on public.openings for insert to authenticated with check (app.is_staff());
create policy openings_update on public.openings for update to authenticated using (app.is_staff()) with check (app.is_staff());
create policy openings_delete on public.openings for delete to authenticated using (app.is_admin());

/* ---------- candidates ---------- */
create policy candidates_read on public.candidates for select to authenticated using (app.is_staff() or app.sees_candidate(id));
create policy candidates_insert on public.candidates for insert to authenticated with check (app.is_staff());
create policy candidates_update on public.candidates for update to authenticated using (app.is_staff()) with check (app.is_staff());
create policy candidates_delete on public.candidates for delete to authenticated using (app.is_admin());

create policy compensation_all on public.candidate_compensation for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy documents_all on public.candidate_documents for all to authenticated using (app.is_staff()) with check (app.is_staff());

/* ---------- applications and what hangs off them ---------- */
create policy applications_read on public.applications for select to authenticated
  using (app.is_staff() or app.is_management() or app.manages_opening(opening_id) or app.interviews_application(id));
create policy applications_insert on public.applications for insert to authenticated with check (app.is_staff());
create policy applications_update on public.applications for update to authenticated using (app.is_staff()) with check (app.is_staff());
create policy applications_delete on public.applications for delete to authenticated using (app.is_admin());

-- written only by the trigger in 0003, so there is deliberately no insert policy
create policy stage_events_read on public.stage_events for select to authenticated
  using (app.is_staff() or app.is_management() or app.manages_application(application_id));

create policy screenings_all on public.screenings for all to authenticated using (app.is_staff()) with check (app.is_staff());

/* ---------- interviews ---------- */
create policy groups_read on public.interview_groups for select to authenticated
  using (app.is_staff() or app.manages_opening(opening_id) or (select auth.uid()) = any (interviewer_ids));
create policy groups_write on public.interview_groups for all to authenticated using (app.is_staff()) with check (app.is_staff());

create policy interviews_read on public.interviews for select to authenticated
  using (app.is_staff() or app.manages_application(application_id) or (select auth.uid()) = any (interviewer_ids));
create policy interviews_write on public.interviews for all to authenticated using (app.is_staff()) with check (app.is_staff());

create policy scores_read on public.interview_scores for select to authenticated
  using (app.is_staff() or interviewer_id = (select auth.uid()) or app.manages_interview(interview_id));
-- an interviewer writes only their own scorecard, and only for an interview they are on
create policy scores_insert on public.interview_scores for insert to authenticated
  with check (app.is_staff() or (interviewer_id = (select auth.uid()) and app.interviews_interview(interview_id)));
create policy scores_update on public.interview_scores for update to authenticated
  using (app.is_staff() or interviewer_id = (select auth.uid()))
  with check (app.is_staff() or (interviewer_id = (select auth.uid()) and app.interviews_interview(interview_id)));
create policy scores_delete on public.interview_scores for delete to authenticated using (app.is_staff());

/* ---------- offers and onboarding ---------- */
create policy offers_read on public.offers for select to authenticated using (app.is_staff() or app.manages_application(application_id));
create policy offers_insert on public.offers for insert to authenticated with check (app.is_staff());
-- the hiring manager may update (the trigger limits them to the approval fields)
create policy offers_update on public.offers for update to authenticated
  using (app.is_staff() or app.manages_application(application_id)) with check (app.is_staff() or app.manages_application(application_id));
create policy offers_delete on public.offers for delete to authenticated using (app.is_admin());

create policy onboarding_checklists_all on public.onboarding_checklists for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy onboarding_items_all on public.onboarding_items for all to authenticated using (app.is_staff()) with check (app.is_staff());

/* ---------- tasks, notifications, feeds ---------- */
create policy tasks_read on public.tasks for select to authenticated using (app.is_staff() or owner_id = (select auth.uid()));
create policy tasks_insert on public.tasks for insert to authenticated with check (app.is_staff());
create policy tasks_update on public.tasks for update to authenticated
  using (app.is_staff() or owner_id = (select auth.uid())) with check (app.is_staff() or owner_id = (select auth.uid()));
create policy tasks_delete on public.tasks for delete to authenticated using (app.is_staff());

create policy notifications_read on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_insert on public.notifications for insert to authenticated with check (app.is_staff() or user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy activity_read on public.activity for select to authenticated using (app.is_staff());
create policy activity_insert on public.activity for insert to authenticated with check (app.is_staff());

create policy audit_read on public.audit_log for select to authenticated using (app.is_admin());   -- rows come from the trigger only

create policy messages_all on public.messages for all to authenticated using (app.is_staff()) with check (app.is_staff());

/* ---------- posting, reporting, intake ---------- */
create policy boards_all on public.job_boards for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy postings_read on public.postings for select to authenticated using (app.is_staff() or app.is_management());
create policy postings_write on public.postings for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy report_events_read on public.report_events for select to authenticated using (app.is_staff() or app.is_management());
create policy report_events_write on public.report_events for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy call_log_read on public.call_log for select to authenticated using (app.is_staff() or app.is_management());
create policy call_log_write on public.call_log for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy targets_read on public.monthly_targets for select to authenticated using (app.is_staff() or app.is_management());
create policy targets_write on public.monthly_targets for all to authenticated using (app.is_staff()) with check (app.is_staff());
create policy intake_read on public.intake_batches for select to authenticated using (app.is_staff());   -- written by the server with the service key
create policy sheet_log_read on public.sheet_log for select to authenticated using (app.is_staff());
create policy sheet_log_insert on public.sheet_log for insert to authenticated with check (app.is_staff());

/* ---------- privileges ---------- */
-- nothing for anon. authenticated gets table rights, and the policies above narrow them per row.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log, public.stage_events, public.intake_batches from authenticated;
revoke delete on public.company_settings from authenticated;
revoke insert on public.company_settings from authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
