-- 0003 Rules that must hold no matter which client writes: stage bookkeeping, opening status, audit trail, offer approval.
-- These are the same rules the app applies today in src/services/stages.js and offers.js; the database now guarantees them.

/* ---------- applications: furthest stage, date in stage, history ---------- */
create function app.application_before() returns trigger language plpgsql as $$
declare r int := app.stage_rank(new.stage);
begin
  if r is not null and r > new.max_stage then new.max_stage := r; end if;
  if tg_op = 'UPDATE' and new.stage is distinct from old.stage then new.stage_since := current_date; end if;
  return new;
end $$;
create trigger before_write before insert or update on public.applications for each row execute function app.application_before();

-- an opening's status follows its furthest candidate, unless someone parked it (Draft, On Hold, Closed, Filled)
create function app.refresh_opening_status(opening text) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o public.openings%rowtype;
  hired int;
  furthest int;
  next text;
begin
  select * into o from public.openings where id = opening;
  if not found or o.status in ('Draft', 'On Hold', 'Closed', 'Filled') then return; end if;
  select count(*) filter (where app.stage_rank(stage) >= app.stage_rank('Joining')),
         coalesce(max(coalesce(app.stage_rank(stage), -1)), -1)
    into hired, furthest from public.applications where opening_id = opening;
  next := case when hired >= o.positions then 'Filled'
               when furthest >= 6 then 'Offer'
               when furthest >= 3 then 'Interviewing'
               when furthest >= 1 then 'Screening'
               else 'Open' end;
  if next is distinct from o.status then update public.openings set status = next where id = opening; end if;
end $$;

create function app.application_after() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.stage is distinct from old.stage then
    insert into public.stage_events (application_id, from_stage, to_stage, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.stage end, new.stage, (select auth.uid()));
    perform app.refresh_opening_status(new.opening_id);
  end if;
  return null;
end $$;
create trigger after_write after insert or update on public.applications for each row execute function app.application_after();

/* ---------- audit trail ---------- */
create function app.audit() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  changed_old jsonb;
  changed_new jsonb;
  j jsonb := coalesce(n, o);
begin
  if tg_op = 'UPDATE' then
    -- keep only the fields that changed, and ignore updated_at on its own
    select coalesce(jsonb_object_agg(key, o -> key), '{}'), coalesce(jsonb_object_agg(key, value), '{}')
      into changed_old, changed_new from jsonb_each(n) where key <> 'updated_at' and (o -> key) is distinct from value;
    if changed_new = '{}'::jsonb then return null; end if;
    o := changed_old; n := changed_new;
  end if;
  insert into public.audit_log (actor_id, table_name, row_id, op, old_data, new_data)
  values ((select auth.uid()), tg_table_name, coalesce(j ->> 'id', j ->> 'candidate_id', j ->> 'application_id', j ->> 'singleton'), tg_op, o, n);
  return null;
end $$;
do $$
declare t text;
begin
  foreach t in array array['candidates', 'candidate_compensation', 'applications', 'offers', 'profiles', 'company_settings'] loop
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function app.audit()', t);
  end loop;
end $$;

/* ---------- offers: approval rules ---------- */
-- A hiring manager (or admin) approves. The person who prepared the offer cannot approve their own,
-- a manager may change nothing but the approval fields, and an offer waiting for approval cannot be sent.
create function app.guard_offer() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  me   uuid := (select auth.uid());
  role public.app_role := app.current_role();
  mgr  uuid;
begin
  if me is null then return new; end if;   -- server or console change: trusted
  if new.approval_status is distinct from old.approval_status and new.approval_status in ('Approved', 'Rejected') then
    select o.manager_id into mgr from public.applications a join public.openings o on o.id = a.opening_id where a.id = new.application_id;
    if not (role = 'admin' or (role = 'hiring_manager' and mgr = me)) then
      raise exception 'Only the hiring manager of this opening or an admin can approve or reject an offer';
    end if;
    new.approved_by := me;
    new.approved_at := now();
  end if;
  if role = 'hiring_manager' and
     (to_jsonb(new) - 'approval_status' - 'approved_by' - 'approved_at' - 'updated_at') is distinct from (to_jsonb(old) - 'approval_status' - 'approved_by' - 'approved_at' - 'updated_at') then
    raise exception 'A hiring manager can only change the approval of an offer';
  end if;
  if new.status = 'Sent' and old.status is distinct from 'Sent' and new.approval_status in ('Pending', 'Rejected') then
    raise exception 'This offer needs approval before it can be sent';
  end if;
  return new;
end $$;
create trigger guard before update on public.offers for each row execute function app.guard_offer();

/* ---------- append-only tables ---------- */
-- Nobody edits history. Deleting a whole application (a candidate's data-deletion request) removes its stage events
-- through the foreign key cascade, which runs at trigger depth 2; a direct delete runs at depth 1 and is refused.
create function app.deny_update() returns trigger language plpgsql as $$
begin
  raise exception '% is append only', tg_table_name;
end $$;
create function app.deny_direct_delete() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() <= 1 then raise exception '% is append only', tg_table_name; end if;
  return old;
end $$;
create trigger no_update before update on public.audit_log for each row execute function app.deny_update();
create trigger no_delete before delete on public.audit_log for each row execute function app.deny_direct_delete();
create trigger no_update before update on public.stage_events for each row execute function app.deny_update();
create trigger no_delete before delete on public.stage_events for each row execute function app.deny_direct_delete();
