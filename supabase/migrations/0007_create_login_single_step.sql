-- 0007 Create a login in one step.
-- Before: the sign-up trigger made every profile 'pending' (or 'admin' for the very first one) and create_login then
-- updated the role. For the first account that update tried to demote the only admin and the last-admin guard refused it.
-- Now create_login hands the wanted role to the trigger, which writes the profile once with the right role.
-- The very first account is always an admin, whatever was asked for, so the system can never start with nobody in charge.

create or replace function app.handle_new_user() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  dom   text := lower(split_part(new.email, '@', 2));
  uname text := lower(split_part(new.email, '@', 1));
  want  text := nullif(current_setting('app.new_user_role', true), '');
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
          case when first then 'admin'::public.app_role else coalesce(want::public.app_role, 'pending'::public.app_role) end);
  return new;
end $$;

create or replace function app.create_login(p_username text, p_password text, p_full_name text, p_role public.app_role) returns uuid
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
  perform set_config('app.new_user_role', p_role::text, true);
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail, crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', coalesce(nullif(trim(p_full_name), ''), uname), 'username', uname),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid::text, uid, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true), 'email', now(), now(), now());
  perform set_config('app.allow_user_create', 'off', true);
  perform set_config('app.new_user_role', '', true);
  return uid;
end $$;
