-- 0009 Staff may change the working configuration, admins keep the company details.
-- company_settings.config holds SLA days, report alert levels, the job-posting setup and the Google Sheet connection:
-- things recruiters adjust every day. The other columns (company name, address, signatory, match threshold and weights)
-- stay with admins. The trigger enforces the split, the same way guard_task limits a task owner.

drop policy settings_write on public.company_settings;
create policy settings_write on public.company_settings for update to authenticated
  using (app.is_staff()) with check (app.is_staff());

create function app.guard_settings() returns trigger language plpgsql as $$
begin
  -- a change from the server or the console (no signed-in user) is trusted, as everywhere else
  if (select auth.uid()) is not null and not app.is_admin()
     and (to_jsonb(new) - 'config' - 'updated_at') is distinct from (to_jsonb(old) - 'config' - 'updated_at') then
    raise exception 'Only an admin can change the company details, the offer letter signatory or the match scoring.';
  end if;
  return new;
end $$;
create trigger guard before update on public.company_settings for each row execute function app.guard_settings();
