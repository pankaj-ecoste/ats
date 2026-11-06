-- 0039 A password for the lead sheet connection.
-- Showing the script, making a new script, switching the connection on or off and changing the password need the connection password (set by an admin, changed only by an admin).
-- The check is made here, in the database, so a signed-in admin who skips the screen is stopped too. Only a salted hash is kept (bcrypt).
-- Five wrong passwords in a row lock it for 10 minutes. Reading the status (workbooks, last report) needs no password.
-- A wrong password answers {ok: false, message}, it does not raise, so the count of wrong tries is kept.

alter table public.lead_feed add column panel_pass_hash text;
alter table public.lead_feed add column pw_fails int not null default 0;
alter table public.lead_feed add column pw_locked_until timestamptz;

-- '' when the password is right; otherwise the reason, in words
create function app.panel_password_check(p text) returns text language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare f public.lead_feed; fails int;
begin
  select * into f from public.lead_feed;
  if f.singleton is null or f.panel_pass_hash is null then return 'No password is set for the lead sheet connection yet. Set one first'; end if;
  if f.pw_locked_until is not null and f.pw_locked_until > now() then
    return 'Too many wrong passwords. Try again in ' || ceil(extract(epoch from (f.pw_locked_until - now())) / 60)::int || ' minute(s)';
  end if;
  if f.panel_pass_hash = crypt(coalesce(p, ''), f.panel_pass_hash) then
    if f.pw_fails <> 0 or f.pw_locked_until is not null then update public.lead_feed set pw_fails = 0, pw_locked_until = null where singleton; end if;
    return '';
  end if;
  fails := case when f.pw_locked_until is not null and f.pw_locked_until <= now() then 1 else f.pw_fails + 1 end;
  update public.lead_feed set pw_fails = fails, pw_locked_until = case when fails >= 5 then now() + interval '10 minutes' else null end where singleton;
  if fails = 5 then insert into public.activity (text, type, actor_id) values ('The lead sheet connection was locked for 10 minutes after 5 wrong passwords', 'info', auth.uid()); end if;
  return 'Wrong password';
end $$;
revoke all on function app.panel_password_check(text) from public;

-- the old open versions are removed: the password is part of every call now
drop function public.lead_feed_connect(boolean, boolean);
drop function public.lead_feed_token();

create function public.lead_feed_unlock(p_password text) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare why text;
begin
  if not app.is_admin() then raise exception 'Only an admin can open the lead sheet settings'; end if;
  why := app.panel_password_check(p_password);
  return case when why = '' then jsonb_build_object('ok', true) else jsonb_build_object('ok', false, 'message', why) end;
end $$;
revoke all on function public.lead_feed_unlock(text) from public, anon;
grant execute on function public.lead_feed_unlock(text) to authenticated;

-- the secret of the connection, so the same script can be shown again
create function public.lead_feed_token(p_password text) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare why text;
begin
  if not app.is_admin() then raise exception 'Only an admin can see the lead sheet script'; end if;
  why := app.panel_password_check(p_password);
  if why <> '' then return jsonb_build_object('ok', false, 'message', why); end if;
  return jsonb_build_object('ok', true, 'token', (select token_text from public.lead_feed));
end $$;
revoke all on function public.lead_feed_token(text) from public, anon;
grant execute on function public.lead_feed_token(text) to authenticated;

-- Switch the connection on or off. A new token is made when asked, or the first time; it is returned with the answer.
create function public.lead_feed_connect(p_enabled boolean, p_new_token boolean, p_password text) returns jsonb
language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare tok text; first_time boolean; why text;
begin
  if not app.is_admin() then raise exception 'Only an admin can change the lead sheet settings'; end if;
  why := app.panel_password_check(p_password);
  if why <> '' then return jsonb_build_object('ok', false, 'message', why); end if;
  first_time := (select token_hash is null from public.lead_feed);
  if p_new_token or first_time then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.lead_feed set token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex'), token_text = tok, token_made_at = now() where singleton;
    insert into public.activity (text, type, actor_id) values (case when first_time then 'The lead sheet connection was set up' else 'A new lead sheet token was made; the old script stopped working' end, 'info', auth.uid());
  end if;
  update public.lead_feed set enabled = coalesce(p_enabled, false) where singleton;
  return jsonb_build_object('ok', true, 'token', tok);
end $$;
revoke all on function public.lead_feed_connect(boolean, boolean, text) from public, anon;
grant execute on function public.lead_feed_connect(boolean, boolean, text) to authenticated;

-- Set the password (the first time: no old one is needed) or change it (the old one is needed). At least 8 characters.
create function public.lead_feed_set_password(p_old text, p_new text) returns jsonb language plpgsql security definer set search_path = public, app, extensions, pg_temp as $$
declare why text;
begin
  if not app.is_admin() then raise exception 'Only an admin can set the lead sheet password'; end if;
  insert into public.lead_feed (singleton) values (true) on conflict do nothing;
  if (select panel_pass_hash from public.lead_feed) is not null then
    why := app.panel_password_check(p_old);
    if why <> '' then return jsonb_build_object('ok', false, 'message', why); end if;
  end if;
  if char_length(coalesce(p_new, '')) < 8 then return jsonb_build_object('ok', false, 'message', 'The password needs at least 8 characters'); end if;
  if char_length(p_new) > 72 then return jsonb_build_object('ok', false, 'message', 'The password can have at most 72 characters'); end if;
  update public.lead_feed set panel_pass_hash = crypt(p_new, gen_salt('bf')), pw_fails = 0, pw_locked_until = null where singleton;
  insert into public.activity (text, type, actor_id) values ('The password of the lead sheet connection was set or changed', 'info', auth.uid());
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.lead_feed_set_password(text, text) from public, anon;
grant execute on function public.lead_feed_set_password(text, text) to authenticated;

-- the status tells whether a password is set
create or replace function public.lead_feed_status() returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare f public.lead_feed; n int; seen timestamptz; wb jsonb; refused int;
begin
  if not app.is_admin() then raise exception 'Only an admin can see the lead sheet settings'; end if;
  select * into f from public.lead_feed;
  select count(*), max(seen_at) into n, seen from public.sheet_tabs where seen_at > now() - interval '3 days';
  select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'tabs', w.tabs, 'last_seen_at', w.seen) order by w.seen desc), '[]'::jsonb) into wb
    from (select split_part(tab_key, '/', 1) as id, coalesce(max(nullif(book_name, '')), 'Workbook') as name, count(*) as tabs, max(seen_at) as seen
            from public.sheet_tabs where seen_at > now() - interval '30 days' group by 1) w;
  select count(*) into refused from public.intake_batches where source = 'sheet' and error like 'Refused%' and received_at > now() - interval '1 hour';
  return jsonb_build_object('set_up', f.token_hash is not null, 'enabled', coalesce(f.enabled, false), 'token_made_at', f.token_made_at,
                            'last_received_at', f.last_received_at, 'tabs_seen', n, 'last_seen_at', seen,
                            'workbooks', wb, 'refused_recently', refused, 'can_show_script', f.token_text is not null,
                            'password_set', f.panel_pass_hash is not null);
end $$;
