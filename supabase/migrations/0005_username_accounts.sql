-- 0005 Username and password accounts, created and managed by an admin.
--
-- People sign in with a username and a password. Supabase Auth identifies users by an email field, so each username
-- maps to a hidden internal address  <username>@ats.ecoste.in  (nothing is ever sent to it; the app adds the suffix).
-- There is no sign-up page: an account exists only if an admin created it with admin_create_user() below, or the
-- server created the first admin with app.create_login() (npm run db:create-admin). The database refuses every other way in.

alter table public.company_settings alter column allowed_email_domains set default array['ats.ecoste.in'];
update public.company_settings set allowed_email_domains = array['ats.ecoste.in'];

alter table public.profiles add column username text;
update public.profiles set username = lower(split_part(email, '@', 1));
alter table public.profiles alter column username set not null;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
create unique index profiles_username_unique on public.profiles (username);

/* ---------- the only door in: accounts must be created on purpose ---------- */
create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  dom   text := lower(split_part(new.email, '@', 2));
  uname text := lower(split_part(new.email, '@', 1));
  first boolean;
begin
  if coalesce(current_setting('app.allow_user_create', true), '') <> 'on' then
    raise exception 'Accounts are created by an admin';
  end if;
  if not exists (select 1 from public.company_settings s where dom = any (s.allowed_email_domains)) then
    raise exception 'Sign-up is limited to company accounts';
  end if;
  first := not exists (select 1 from public.profiles);
  insert into public.profiles (id, email, username, full_name, role)
  values (new.id, lower(new.email), uname, coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), uname),
          case when first then 'admin'::public.app_role else 'pending'::public.app_role end);
  return new;
end $$;

-- there must always be somebody who can manage accounts
create or replace function app.guard_profile_update() returns trigger language plpgsql as $$
begin
  if (select auth.uid()) is not null and not app.is_admin() and (new.role is distinct from old.role or new.active is distinct from old.active or new.email is distinct from old.email or new.username is distinct from old.username) then
    raise exception 'Only an admin can change roles, usernames or activate accounts';
  end if;
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active)
     and not exists (select 1 from public.profiles where id <> old.id and role = 'admin' and active) then
    raise exception 'There must be at least one active admin';
  end if;
  return new;
end $$;

/* ---------- creating a login (shared by the admin function and the server script) ---------- */
-- Writes the Supabase auth user and its identity row the way Supabase Auth itself does. The empty-string token columns
-- matter: Supabase Auth fails to read a user whose token columns are NULL.
create function app.create_login(p_username text, p_password text, p_full_name text, p_role public.app_role) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  uname text := lower(trim(p_username));
  dom   text := (select allowed_email_domains[1] from public.company_settings);
  uid   uuid := gen_random_uuid();
  mail  text;
begin
  if uname !~ '^[a-z0-9][a-z0-9._-]{2,29}$' then
    raise exception 'Username must be 3 to 30 characters: lowercase letters, digits, dot, dash or underscore';
  end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if p_role = 'pending' then raise exception 'Choose a real role for the new account'; end if;
  if exists (select 1 from public.profiles where username = uname) then raise exception 'The username "%" is already taken', uname; end if;
  mail := uname || '@' || dom;

  perform set_config('app.allow_user_create', 'on', true);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail, crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', coalesce(nullif(trim(p_full_name), ''), uname), 'username', uname),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
  perform set_config('app.allow_user_create', 'off', true);

  update public.profiles set role = p_role where id = uid;      -- the sign-up trigger made the profile; give it the chosen role
  return uid;
end $$;
revoke all on function app.create_login(text, text, text, public.app_role) from public, anon, authenticated;
grant execute on function app.create_login(text, text, text, public.app_role) to service_role;

/* ---------- what an admin can do from the app ---------- */
create function public.admin_create_user(p_username text, p_password text, p_full_name text default '', p_role public.app_role default 'recruiter')
returns uuid language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not app.is_admin() then raise exception 'Only an admin can create accounts'; end if;
  return app.create_login(p_username, p_password, p_full_name, p_role);
end $$;

-- Sets a new password and signs that person out everywhere, so the old password and any open session stop working.
create function public.admin_set_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not app.is_admin() then raise exception 'Only an admin can reset passwords'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Password must be at least 8 characters'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'No such account'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  delete from auth.sessions where user_id = p_user;
  insert into public.audit_log (actor_id, table_name, row_id, op, new_data)
  values ((select auth.uid()), 'auth.password', p_user::text, 'UPDATE', '{"event":"password reset by admin"}');
end $$;

-- Switches an account off (it can no longer sign in and sees no data) or back on.
create function public.admin_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not app.is_admin() then raise exception 'Only an admin can switch accounts on or off'; end if;
  if p_user = (select auth.uid()) and not p_active then raise exception 'You cannot switch off your own account'; end if;
  update public.profiles set active = p_active where id = p_user;
  if not found then raise exception 'No such account'; end if;
  update auth.users set banned_until = case when p_active then null else 'infinity'::timestamptz end where id = p_user;
  if not p_active then delete from auth.sessions where user_id = p_user; end if;
end $$;

revoke all on function public.admin_create_user(text, text, text, public.app_role), public.admin_set_password(uuid, text), public.admin_set_active(uuid, boolean) from public, anon;
grant execute on function public.admin_create_user(text, text, text, public.app_role), public.admin_set_password(uuid, text), public.admin_set_active(uuid, boolean) to authenticated, service_role;
