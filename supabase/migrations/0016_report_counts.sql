-- 0016 Report counts: the management report's numbers, counted by the database.
-- Why: leadership (role management) may not read screenings, interviews or offers, so the report built in their browser
-- under-counted calls, interviews and offers. This function counts for them and returns only totals, no candidate data.
-- It mirrors metrics() in src/features/management-report/report-metrics.js; tests/db/report.test.mjs holds the two together.

create function public.report_counts(p_from date, p_to date) returns jsonb
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
    'calls',  coalesce((select sum(made) from public.call_log where on_date between p_from and p_to), 0)
            + (select count(*) from public.screenings where screened_on between p_from and p_to),
    'conn',   coalesce((select sum(connected) from public.call_log where on_date between p_from and p_to), 0)
            + (select count(*) from public.screenings where screened_on between p_from and p_to and outcome in ('Connected', 'Interested', 'Call Back')),
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

revoke all on function public.report_counts(date, date) from public, anon;
grant execute on function public.report_counts(date, date) to authenticated;
