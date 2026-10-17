-- 0010 An interviewer's own scorecard is rolled up onto the interview.
-- Interviewers may not change the interview row (only staff may), but they write their own row in interview_scores.
-- This trigger copies the result onto the interview, so every screen reads one place:
--   scores          the average of every submitted scorecard, per criterion (rounded)
--   recommendation, decision, feedback   from the scorecard just submitted (the latest word)
--   status          Completed once every listed interviewer has submitted (or at once when none are listed)
-- It runs as the table owner, because the interviewer who triggers it cannot update interviews themselves.

create function app.roll_up_scores() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  panel int;
  done  int;
begin
  select coalesce(cardinality(interviewer_ids), 0) into panel from public.interviews where id = new.interview_id;
  select count(*) into done from public.interview_scores where interview_id = new.interview_id;

  update public.interviews i set
    scores = (select array_agg(avg_score order by n)
              from (select t.n, round(avg(t.v))::int as avg_score
                    from public.interview_scores s, unnest(s.scores) with ordinality as t(v, n)
                    where s.interview_id = new.interview_id and t.v > 0
                    group by t.n) q),
    recommendation = new.recommendation,
    decision = new.decision,
    feedback = new.feedback,
    status = case when i.status = 'Scheduled' and done >= greatest(panel, 1) then 'Completed' else i.status end
  where i.id = new.interview_id;
  return null;
end $$;

create trigger roll_up after insert or update on public.interview_scores
  for each row execute function app.roll_up_scores();

-- A panel member's scorecard also leaves an activity entry and tells the recruiter, so any active member may write those
-- (reading the activity feed stays with staff; a notification is only ever readable by the person it is for).
drop policy activity_insert on public.activity;
create policy activity_insert on public.activity for insert to authenticated
  with check (app.is_member() and (actor_id is null or actor_id = (select auth.uid())));
drop policy notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated with check (app.is_member());
