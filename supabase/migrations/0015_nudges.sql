-- 0015 Nudges: the database raises notifications on its own, once a day, so nobody has to open the app to find out.
--   SLA        a candidate has sat in a stage longer than the SLA days (company_settings.config.sla, same defaults as the app)
--   Reminder   an interview is tomorrow (interviewers and the opening's recruiter)
--   Feedback   an interview date has passed and it is still Scheduled (nobody recorded the outcome)
-- Each nudge is sent once: app.nudge_log remembers the key (e.g. "sla:APP-3101:Screening:2026-10-12").
-- Days are counted in India time. Runs by pg_cron when the extension is available; otherwise call select app.run_nudges().

create table app.nudge_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);

create function app.run_nudges() returns jsonb language plpgsql security definer set search_path = public, app as $$
declare
  today date := (now() at time zone 'Asia/Kolkata')::date;
  sla   jsonb := coalesce((select config -> 'sla' from public.company_settings), '{}'::jsonb);
  defaults jsonb := '{"app":2,"short":2,"screen":3,"gi":5,"pi":7,"sel":2,"offer":5,"onb":10}';
  n_sla int := 0; n_rem int := 0; n_fb int := 0; r record; uid uuid; k text;
begin
  -- 1. stuck over SLA: tell the application's recruiter once per stay in a stage
  for r in
    select a.id, a.stage, a.stage_since, a.recruiter_id, c.name,
           (today - a.stage_since) as days,
           coalesce((sla ->> s.key)::int, (defaults ->> s.key)::int) as limit_days
      from public.applications a
      join public.candidates c on c.id = a.candidate_id
      join lateral (select case a.stage when 'New' then 'app' when 'Shortlisted' then 'short' when 'Screening' then 'screen'
                      when 'Group Interview' then 'gi' when 'Personal Interview' then 'pi' when 'Selected' then 'sel'
                      when 'Offer' then 'offer' when 'Offer Accepted' then 'offer' when 'Joining' then 'onb' when 'Onboarding' then 'onb' end as key) s on s.key is not null
     where a.recruiter_id is not null
  loop
    continue when r.days <= r.limit_days;
    k := 'sla:' || r.id || ':' || r.stage || ':' || r.stage_since;
    insert into app.nudge_log (key) values (k) on conflict do nothing;
    continue when not found;
    insert into public.notifications (user_id, text, link)
      values (r.recruiter_id, r.name || ' has been in ' || r.stage || ' for ' || r.days || ' days (limit ' || r.limit_days || ')', jsonb_build_array('candidate', (select candidate_id from public.applications where id = r.id)));
    n_sla := n_sla + 1;
  end loop;

  -- 2. interview tomorrow, and 3. interview date passed with no outcome
  for r in
    select i.id, i.on_date, i.at_time, i.interviewer_ids, a.recruiter_id, a.candidate_id, c.name
      from public.interviews i
      join public.applications a on a.id = i.application_id
      join public.candidates c on c.id = a.candidate_id
     where i.status = 'Scheduled' and i.on_date <= today + 1
  loop
    if r.on_date = today + 1 then
      k := 'remind:' || r.id || ':' || r.on_date;
      insert into app.nudge_log (key) values (k) on conflict do nothing;
      if found then
        for uid in select distinct x from unnest(r.interviewer_ids || coalesce(array[r.recruiter_id], '{}')) x where x is not null loop
          insert into public.notifications (user_id, text, link)
            values (uid, 'Interview tomorrow at ' || to_char(r.at_time, 'HH24:MI') || ' with ' || r.name, jsonb_build_array('candidate', r.candidate_id));
        end loop;
        n_rem := n_rem + 1;
      end if;
    elsif r.on_date < today then
      k := 'feedback:' || r.id;
      insert into app.nudge_log (key) values (k) on conflict do nothing;
      if found then
        for uid in select distinct x from unnest(r.interviewer_ids || coalesce(array[r.recruiter_id], '{}')) x where x is not null loop
          insert into public.notifications (user_id, text, link)
            values (uid, 'Interview with ' || r.name || ' on ' || to_char(r.on_date, 'DD Mon') || ' has no outcome yet', jsonb_build_array('candidate', r.candidate_id));
        end loop;
        n_fb := n_fb + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('sla', n_sla, 'reminders', n_rem, 'feedback', n_fb);
end $$;

-- nobody but the database owner (and the schedule) runs this
revoke all on function app.run_nudges() from public, anon, authenticated;
alter table app.nudge_log enable row level security;

-- every morning at 09:00 India time (03:30 UTC), when pg_cron can be used
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('ats-nudges', '30 3 * * *', 'select app.run_nudges()');
exception when others then
  raise notice 'pg_cron not available (%); run select app.run_nudges() from another scheduler', sqlerrm;
end $$;
