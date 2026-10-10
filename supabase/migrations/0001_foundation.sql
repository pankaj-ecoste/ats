-- 0001 Foundation: private helper schema, roles, user profiles, company settings, sign-up guard.
-- Conventions for every migration:
--   * ids are text (the app's own ids such as OP-1001) unless a row belongs to a login, which uses the auth user's uuid
--   * every table has row level security switched on in the migration that creates it
--   * anon (not signed in) gets nothing; the public application form will go through a server function with the service key

create schema if not exists app;                       -- helpers used by policies. Not exposed through the API.
grant usage on schema app to authenticated, service_role;

create type public.app_role as enum ('pending', 'admin', 'recruiter', 'interviewer', 'hiring_manager', 'management');

-- keeps updated_at honest on every table that has the column
create function app.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

/* ---------- company settings (one row) ---------- */
create table public.company_settings (
  singleton            boolean primary key default true check (singleton),
  company              text not null default '',
  address              text not null default '',
  signatory            text not null default '',
  sign_title           text not null default '',
  match_threshold      int  not null default 65 check (match_threshold between 0 and 100),
  match_weights        jsonb not null default '{"skills":45,"experience":20,"education":10,"location":10,"salary":10,"notice":5}',
  allowed_email_domains text[] not null default array['ecoste.in'],
  config               jsonb not null default '{}',   -- SLA days, report alert levels, posting config, sheet auto-import connection
  updated_at           timestamptz not null default now()
);
insert into public.company_settings default values;
create trigger touch before update on public.company_settings for each row execute function app.touch_updated_at();

/* ---------- people who can sign in ---------- */
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text not null default '',
  role        public.app_role not null default 'pending',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger touch before update on public.profiles for each row execute function app.touch_updated_at();

-- the role of whoever is signed in; null when not signed in, switched off, or not yet in profiles
create function app.current_role() returns public.app_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from public.profiles where id = (select auth.uid()) and active
$$;
create function app.is_admin() returns boolean language sql stable as $$ select coalesce(app.current_role() = 'admin', false) $$;
-- admin and recruiter: the people who run hiring day to day
create function app.is_staff() returns boolean language sql stable as $$ select coalesce(app.current_role() in ('admin', 'recruiter'), false) $$;
-- anyone with a real role (not pending, not switched off)
create function app.is_member() returns boolean language sql stable as $$ select coalesce(app.current_role() <> 'pending', false) $$;

-- Sign-up guard: only company email domains may create an account. The first account becomes the admin,
-- everyone after that waits as 'pending' until an admin gives them a role.
create function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  dom   text := lower(split_part(new.email, '@', 2));
  first boolean;
begin
  if not exists (select 1 from public.company_settings s where dom = any (s.allowed_email_domains)) then
    raise exception 'Sign-up is limited to company email addresses';
  end if;
  first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, full_name, role)
  values (new.id, lower(new.email), coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
          case when first then 'admin'::public.app_role else 'pending'::public.app_role end);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function app.handle_new_user();

-- a user may rename themselves, but only an admin may change roles or switch accounts on or off.
-- Guards like this one apply to signed-in app users only. A change made by the server or from the database console
-- (no signed-in user) is trusted: it is how an admin gets back in if they lock themselves out.
create function app.guard_profile_update() returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null and not app.is_admin() and (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email) then
    raise exception 'Only an admin can change roles or activate accounts';
  end if;
  return new;
end $$;
create trigger guard before update on public.profiles for each row execute function app.guard_profile_update();

/* ---------- row level security ---------- */
alter table public.company_settings enable row level security;
alter table public.profiles enable row level security;

-- settings: every member reads (offer letters need the company name); only admin changes
create policy settings_read  on public.company_settings for select to authenticated using (app.is_member());
create policy settings_write on public.company_settings for update to authenticated using (app.is_admin()) with check (app.is_admin());

-- profiles: members see each other (dropdowns, names on records); a user sees their own row even while pending
create policy profiles_read   on public.profiles for select to authenticated using (app.is_member() or id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (app.is_admin() or id = (select auth.uid())) with check (app.is_admin() or id = (select auth.uid()));
create policy profiles_admin_delete on public.profiles for delete to authenticated using (app.is_admin());

revoke all on public.company_settings, public.profiles from anon;
grant select, update on public.company_settings to authenticated;
grant select, update, delete on public.profiles to authenticated;
grant all on public.company_settings, public.profiles to service_role;
