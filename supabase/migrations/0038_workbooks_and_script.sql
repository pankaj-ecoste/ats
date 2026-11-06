-- 0038 More than one workbook, and the script can be shown again.
-- * sheet_tabs.book_name: the script now sends the workbook's name with every tab, so tabs of two workbooks can be told apart (the key already includes the workbook id).
-- * lead_feed.token_text: the secret of the connection, kept so an admin can see the same script again (and paste it into a second workbook) without making a new key.
--   The table is closed to everyone but the functions below; only an admin can read it, through lead_feed_token(). The hash stays what the checks use.
--   A key made before this migration is not known as text: "Make a new script" once, and it can be shown from then on.
-- * lead_feed_status now also tells the workbooks seen (name, tabs, last report) and whether the workbook was refused lately, for a plain warning in the app.

alter table public.sheet_tabs add column book_name text not null default '';
alter table public.lead_feed add column token_text text;

create or replace function public.sheet_sync_plan(p_token text, p_tabs jsonb) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare t jsonb; keys text[] := '{}'; links jsonb; hs jsonb;
begin
  if not app.feed_ok(p_token) then
    perform app.feed_refused();
    return jsonb_build_object('ok', false, 'message', 'This connection is not valid, or the lead sheet is switched off. Ask an admin for a new script.');
  end if;
  if jsonb_typeof(p_tabs) is distinct from 'array' then return jsonb_build_object('ok', false, 'message', 'The tabs must be sent as a list.'); end if;
  if jsonb_array_length(p_tabs) > 300 then return jsonb_build_object('ok', false, 'message', 'Send at most 300 tabs.'); end if;
  for t in select value from jsonb_array_elements(p_tabs) loop
    if jsonb_typeof(t) is distinct from 'object' or coalesce(t ->> 'key', '') = '' then continue; end if;
    hs := case when jsonb_typeof(t -> 'headings') = 'array' and jsonb_array_length(t -> 'headings') <= 200 then t -> 'headings' else '[]'::jsonb end;
    keys := keys || left(t ->> 'key', 200);
    insert into public.sheet_tabs (tab_key, tab_name, headings, seen_at, book_name) values (left(t ->> 'key', 200), left(coalesce(t ->> 'name', ''), 200), hs, now(), left(btrim(coalesce(t ->> 'book', '')), 200))
      on conflict (tab_key) do update set tab_name = excluded.tab_name, headings = excluded.headings, seen_at = now(),
        book_name = case when excluded.book_name <> '' then excluded.book_name else public.sheet_tabs.book_name end;   -- an older script does not send the workbook name: keep what is known
  end loop;
  update public.sheet_links l set tab_name = s.tab_name from public.sheet_tabs s where s.tab_key = l.tab_key and s.tab_key = any (keys) and l.tab_name <> s.tab_name;
  select coalesce(jsonb_agg(jsonb_build_object('key', l.tab_key, 'name', l.tab_name, 'source', l.source, 'map', l.map, 'extra', l.extra)), '[]'::jsonb) into links
    from public.sheet_links l join public.openings o on o.id = l.opening_id where l.enabled and o.status <> 'Closed' and l.tab_key = any (keys);
  return jsonb_build_object('ok', true, 'links', links);
end $$;

create or replace function public.lead_feed_connect(p_enabled boolean, p_new_token boolean default false) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare tok text; first_time boolean;
begin
  if not app.is_admin() then raise exception 'Only an admin can change the lead sheet settings'; end if;
  insert into public.lead_feed (singleton) values (true) on conflict do nothing;
  first_time := (select token_hash is null from public.lead_feed);
  if p_new_token or first_time then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.lead_feed set token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex'), token_text = tok, token_made_at = now() where singleton;
    insert into public.activity (text, type, actor_id) values (case when first_time then 'The lead sheet connection was set up' else 'A new lead sheet token was made; the old script stopped working' end, 'info', auth.uid());
  end if;
  update public.lead_feed set enabled = coalesce(p_enabled, false) where singleton;
  return jsonb_build_object('token', tok);
end $$;

create function public.lead_feed_token() returns text language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_admin() then raise exception 'Only an admin can see the lead sheet script'; end if;
  return (select token_text from public.lead_feed);
end $$;
revoke all on function public.lead_feed_token() from public, anon;
grant execute on function public.lead_feed_token() to authenticated;

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
                            'workbooks', wb, 'refused_recently', refused, 'can_show_script', f.token_text is not null);
end $$;
