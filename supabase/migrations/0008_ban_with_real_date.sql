-- 0008 Switching an account off must give a clean "this account is switched off" at sign-in.
-- Supabase's login service cannot read the timestamp 'infinity' and fails with a server error (500) instead of refusing politely.
-- A date 100 years ahead means the same thing and is understood.

create or replace function public.admin_set_active(p_user uuid, p_active boolean) returns void
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if not app.is_admin() then raise exception 'Only an admin can switch accounts on or off'; end if;
  if p_user = (select auth.uid()) and not p_active then raise exception 'You cannot switch off your own account'; end if;
  update public.profiles set active = p_active where id = p_user;
  if not found then raise exception 'No such account'; end if;
  update auth.users set banned_until = case when p_active then null else now() + interval '100 years' end where id = p_user;
  if not p_active then delete from auth.sessions where user_id = p_user; end if;
end $$;
