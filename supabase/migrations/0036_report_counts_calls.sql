-- The management report's call numbers now come from the calls recruiters log with "Call status via app" (migration 0034), not from the manual call log or the screenings.
--   calls = every call logged in the range (call_events, Indian days); conn = those with the status Connected.
-- A screening call sets Call status via app too, so it is counted once, as a call. The old manual "Log calls" entries (call_log) are no longer read.
-- Everything else in the totals is exactly as in 0016.

create or replace function public.report_counts(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  ev  jsonb;
  res jsonb;
begin
  if not (app.is_staff() or app.is_management()) then
    raise exception 'Only staff and management can read the report';
  end if;
  select coalesce(jsonb_object_agg(type, n), '{}') into ev
    from (select type, count(*) n from public.report_events where on_date between p_from and p_to group by type) x;
  res := jsonb_build_object(
    'calls',  (select count(*) from public.call_events where called_on between p_from and p_to),
    'conn',   (select count(*) from public.call_events where called_on between p_from and p_to and status = 'Connected'),
    'short',  coalesce((ev ->> 'shortlist')::int, 0),
    'gi',     coalesce((ev ->> 'gi')::int, 0)
            + (select count(*) from public.interviews where kind = 'Group' and status = 'Completed' and on_date between p_from and p_to),
    'int',    coalesce((ev ->> 'interview')::int, 0)
            + (select count(*) from public.interviews where kind = 'Personal' and status = 'Completed' and on_date between p_from and p_to),
    'noshow', coalesce((ev ->> 'noshow')::int, 0)
            + (select count(*) from public.interviews where status = 'No-show' and on_date between p_from and p_to),
    'sel',    coalesce((ev ->> 'selected')::int, 0),
    'offer',  coalesce((ev ->> 'offer')::int, 0)
            + (select count(*) from public.offers where sent_on between p_from and p_to),
    'acc',    coalesce((ev ->> 'accepted')::int, 0),
    'join',   coalesce((ev ->> 'joined')::int, 0),
    'backup', coalesce((ev ->> 'backup')::int, 0),
    'tth',    coalesce((select round(avg(days))::int from public.report_events where type = 'joined' and days is not null and on_date between p_from and p_to), 0)
  );
  return res;
end $$;
