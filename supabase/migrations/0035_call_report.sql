-- The recruiter-wise call report: how many calls each recruiter logged between two (Indian) days, and how many of each status, optionally for one opening.
-- It counts call_events (migration 0034) and returns only totals, no candidate data, so management can read it (they have no access to the leads themselves).
-- Every call is a status other than NA, so a recruiter's total is the sum of their statuses ("engaged").
-- Returns a list: [{"recruiter_id": "...", "recruiter": "Name", "status": "Connected", "n": 12}, ...]

create function public.call_report(p_from date, p_to date, p_opening text default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not (app.is_staff() or app.is_management()) then
    raise exception 'Only staff and management can read the call report';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a range of dates, at most 400 days';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('recruiter_id', x.recruiter_id, 'recruiter', x.name, 'status', x.status, 'n', x.n) order by x.name, x.status)
    from (
      select e.recruiter_id, coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.username), ''), 'Unknown') as name, e.status, count(*) as n
      from public.call_events e
      left join public.profiles p on p.id = e.recruiter_id
      where e.called_on between p_from and p_to
        and (p_opening is null or p_opening = '' or e.opening_id = p_opening)
      group by e.recruiter_id, 2, e.status
    ) x
  ), '[]'::jsonb);
end $$;

revoke all on function public.call_report(date, date, text) from public, anon;
grant execute on function public.call_report(date, date, text) to authenticated;
