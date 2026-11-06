-- "Call status via app": the status a recruiter sets in the app when they call a lead, separate from the call status that comes from the sheet (applications.call_status).
-- applications.app_call_status is the current value (NA until someone calls); applications.app_call_at is when it was last set (a new value is the signal "a call was logged").
-- Every call is kept in call_events: written by a trigger from the database's own clock and the signed-in person, so nobody can write a call for someone else or for another day.
-- A call is a status other than NA. Setting NA clears the current value and logs nothing; calls already logged stay. Setting the same status again later is a new call,
-- because the app sends a newer app_call_at. A save that only echoes the old app_call_at (an old screen saving something else) logs nothing.
-- The days are Indian days (Asia/Kolkata). The report of step 2 reads call_events.

create function app.call_status_ok(s text) returns boolean language sql immutable as $$
  select coalesce(s in ('NA', 'Call not connected', 'Connected', 'Busy', 'Switched Off', 'Wrong Number', 'Call Back Requested', 'Not Interested',
                        'Number Not Reachable', 'High Salary', 'Duplicate', 'Follow-UP', 'Not okay with 15 k Salary'), false)
$$;

alter table public.applications add column app_call_status text not null default 'NA' check (app.call_status_ok(app_call_status));
alter table public.applications add column app_call_at timestamptz;

create table public.call_events (
  id             bigint generated always as identity primary key,
  application_id text not null references public.applications (id) on delete cascade,
  opening_id     text references public.openings (id) on delete set null,
  recruiter_id   uuid references public.profiles (id) on delete set null,
  status         text not null check (status <> 'NA' and app.call_status_ok(status)),
  called_on      date not null default ((now() at time zone 'Asia/Kolkata')::date),
  at             timestamptz not null default now()
);
create index on public.call_events (called_on, recruiter_id);
create index on public.call_events (application_id, at);
create index on public.call_events (opening_id, called_on);

alter table public.call_events enable row level security;
create policy call_events_read on public.call_events for select to authenticated using (app.is_staff() or app.is_management());
-- no insert policy for people: only the trigger below writes (it runs with the rights of its owner). No update, no delete: calls are a record.
grant select on public.call_events to authenticated;
grant all on public.call_events to service_role;
grant usage, select on sequence public.call_events_id_seq to service_role;

create function app.log_app_call() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.app_call_at is not null and new.app_call_at > clock_timestamp() then new.app_call_at := clock_timestamp(); end if;   -- a clock set ahead cannot block later calls
  if new.app_call_at is not null
     and new.app_call_at > coalesce(old.app_call_at, '-infinity'::timestamptz)
     and new.app_call_status <> 'NA' then
    insert into public.call_events (application_id, opening_id, recruiter_id, status)
    values (new.id, new.opening_id, auth.uid(), new.app_call_status);
  end if;
  return new;
end $$;
create trigger log_app_call before update of app_call_status, app_call_at on public.applications for each row execute function app.log_app_call();
