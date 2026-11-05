-- 0023 Link a Google Sheet tab to an opening (replaces the single-tab live lead sheet of 0018 to 0020).
--
-- One script in the workbook reports every tab (its name and headings) and sends the new rows of the tabs that are LINKED. A link says:
-- this tab belongs to this opening, its leads come from this source, these columns are the standard fields, these extra columns are kept
-- as form answers. One tab can be linked to one opening only (unique tab_key); an opening may have several tabs.
-- tab_key is the spreadsheet id plus the tab's own id, so renaming a tab does not break the link.
--
-- Each application also gets: campaign (the tab's name, so "CRM Updated ad" stays visible) and answers (the extra columns, question -> answer).

alter table public.applications add column campaign text not null default '';
alter table public.applications add column answers jsonb not null default '{}';

create table public.sheet_tabs (
  tab_key  text primary key,
  tab_name text not null,
  headings jsonb not null default '[]',
  seen_at  timestamptz not null default now()
);
create table public.sheet_links (
  id               uuid primary key default gen_random_uuid(),
  opening_id       text not null references public.openings (id) on delete cascade,
  tab_key          text not null unique,
  tab_name         text not null,
  source           text not null,
  map              jsonb not null default '{}',     -- standard field -> heading, e.g. {"name": "Full Name", "phone": "Mobile"}
  extra            jsonb not null default '[]',     -- headings kept as form answers
  known            jsonb not null default '[]',     -- the headings the tab had when the columns were last chosen (a later one is "new")
  enabled          boolean not null default true,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  last_received_at timestamptz
);
create index on public.sheet_links (opening_id);

alter table public.sheet_tabs enable row level security;
alter table public.sheet_links enable row level security;
create policy sheet_tabs_read on public.sheet_tabs for select to authenticated using (app.is_staff());
create policy sheet_links_read on public.sheet_links for select to authenticated using (app.is_staff());
create policy members_only on public.sheet_tabs as restrictive for all to authenticated using (app.is_member()) with check (app.is_member());
create policy members_only on public.sheet_links as restrictive for all to authenticated using (app.is_member()) with check (app.is_member());
revoke insert, update, delete on public.sheet_tabs, public.sheet_links from authenticated;   -- written only by the functions below
create trigger audit after insert or update or delete on public.sheet_links for each row execute function app.audit();

/* ---------- the old single-tab functions go ---------- */
drop function public.ingest_leads(text, jsonb);
drop function app.ingest_one_lead(jsonb, public.lead_feed);
drop function public.lead_feed_save(text, text, boolean, boolean);
alter table public.lead_feed drop column opening_id, drop column source;

/* ---------- helpers ---------- */

-- the sheet proves itself with the secret token (only its hash is kept) and the connection must be switched on
create function app.feed_ok(p_token text) returns boolean language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (select 1 from public.lead_feed f where f.token_hash is not null and f.enabled is true
                   and f.token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex'))
$$;

-- a note of a refused try, but never more than a few per ten minutes, so nobody can fill the log
create function app.feed_refused() returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if (select count(*) from public.intake_batches where source = 'sheet' and error like 'Refused%' and received_at > now() - interval '10 minutes') < 5 then
    insert into public.intake_batches (source, rows_read, rows_skipped, error) values ('sheet', 0, 0, 'Refused: the token is wrong, or the lead sheet connection is switched off');
  end if;
end $$;

-- the form answers of one lead: at most 40, each question up to 120 characters, each answer up to 500; empty answers are left out
create function app.lead_answers(a jsonb) returns jsonb language sql immutable as $$
  select case when jsonb_typeof(a) = 'object'
    then coalesce((select jsonb_object_agg(left(k, 120), left(v, 500)) from (select key k, btrim(value) v from jsonb_each_text(a) where btrim(value) <> '' limit 40) q), '{}'::jsonb)
    else '{}'::jsonb end
$$;

-- is this a list of headings (strings), and which of them does the tab have
create function app.headings_of(t jsonb) returns text[] language sql immutable as $$
  select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(case when jsonb_typeof(t) = 'array' then t else '[]'::jsonb end) x
$$;

/* ---------- one lead (the rules are those of 0019; the opening, source and campaign now come from the link) ---------- */
create function app.ingest_one_lead(r jsonb, l public.sheet_links) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  nm     text := left(btrim(coalesce(r ->> 'name', '')), 120);
  ph     record;
  mail   text := lower(btrim(coalesce(r ->> 'email', '')));
  op     public.openings;
  ex     public.candidates;
  cid    text;
  aid    text;
  st     text;
  why    text := '';
  d      date;
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  skills text[];
  loc    text;
  remark text := left(btrim(coalesce(r ->> 'notes', '')), 500);
  ans    jsonb := app.lead_answers(r -> 'answers');
  prev   public.applications;
begin
  if nm = '' then return jsonb_build_object('status', 'skipped', 'why', 'No name'); end if;
  select * into ph from app.lead_phone(r ->> 'phone');
  if mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(mail) > 200 then mail := ''; end if;
  if ph.key = '' and mail = '' then
    return jsonb_build_object('status', 'skipped', 'why',
      case when btrim(coalesce(r ->> 'phone', '')) <> '' or btrim(coalesce(r ->> 'email', '')) <> '' then 'Phone or email is not valid' else 'No phone or email' end);
  end if;

  select * into op from public.openings where id = l.opening_id and status <> 'Closed';
  if op.id is null then return jsonb_build_object('status', 'skipped', 'why', 'The opening is closed'); end if;

  select * into ex from public.candidates
    where (mail <> '' and lower(email) = mail) or (ph.key <> '' and right(regexp_replace(phone, '\D', '', 'g'), 10) = ph.key) limit 1;

  if ex.id is not null then
    select * into prev from public.applications where candidate_id = ex.id and opening_id = op.id;
    if prev.id is not null then
      -- the same person came again for this opening by another way: keep the first source, but say so
      if prev.source is distinct from l.source or prev.campaign is distinct from l.tab_name then
        insert into public.activity (text, type, application_id) values (ex.name || ' also came through ' || l.source || ' (' || l.tab_name || ')', 'application', prev.id);
      end if;
      return jsonb_build_object('status', 'duplicate', 'why', 'Already applied for this opening (' || ex.name || ')');
    end if;
    cid := ex.id; st := 'existing'; why := 'Already in the system as ' || ex.name; d := today;
  else
    cid := app.new_id('C'); st := 'added'; d := app.lead_date(r ->> 'date', today);
    loc := coalesce(nullif(left(btrim(coalesce(r ->> 'location', '')), 80), ''), '—');
    skills := coalesce((select array_agg(x order by o) from (select btrim(s) x, min(o) o from unnest(regexp_split_to_array(coalesce(r ->> 'skills', ''), '[,;|/\n]')) with ordinality t(s, o)
                         where btrim(s) <> '' and char_length(btrim(s)) <= 60 group by btrim(s)) q), '{}');
    skills := skills[1:40];
    insert into public.candidates (id, name, email, phone, designation, company, exp_years, location, education, edu_field, university, skills, notice_days, source, history, notes, resume_text, created_on)
    values (cid, nm, mail, ph.shown,
            coalesce(nullif(left(btrim(coalesce(r ->> 'designation', '')), 120), ''), '—'), coalesce(nullif(left(btrim(coalesce(r ->> 'company', '')), 120), ''), '—'),
            least(60, greatest(0, coalesce(app.lead_num(r ->> 'exp'), 0))), loc,
            coalesce(nullif(left(btrim(coalesce(r ->> 'education', '')), 80), ''), '—'), 'General', '—', skills, app.lead_notice(r ->> 'notice'), l.source, '[]',
            case when remark <> '' then jsonb_build_array(jsonb_build_object('text', remark, 'by', 'Lead sheet', 'ts', (extract(epoch from now()) * 1000)::bigint)) else '[]'::jsonb end,
            nm || E'\n' || concat_ws(' · ', nullif(ph.shown, ''), nullif(mail, ''), nullif(loc, '—')) || E'\nLead from ' || l.source || ', ' || to_char(d, 'DD Mon YYYY') || '. No resume yet.', d);
    insert into public.candidate_compensation (candidate_id, current_lpa, expected_lpa)
      values (cid, least(1000, greatest(0, app.lead_lpa(r ->> 'curSal'))), least(1000, greatest(0, app.lead_lpa(r ->> 'expSal'))));
    insert into public.candidate_documents (candidate_id, name, status) values (cid, 'Resume', 'Pending');
  end if;

  aid := app.new_id('APP');
  insert into public.applications (id, candidate_id, opening_id, recruiter_id, applied_on, source, campaign, answers)
    values (aid, cid, op.id, op.recruiter_id, d, l.source, l.tab_name, ans);
  return jsonb_build_object('status', st, 'why', why, 'opening', op.id);
end $$;

/* ---------- what the script in the workbook calls (anon key and the secret token) ---------- */

-- Reports every tab (key, name, headings) and answers with the links to work on: the enabled links of tabs just reported, whose opening is not closed.
create function public.sheet_sync_plan(p_token text, p_tabs jsonb) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
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
    insert into public.sheet_tabs (tab_key, tab_name, headings, seen_at) values (left(t ->> 'key', 200), left(coalesce(t ->> 'name', ''), 200), hs, now())
      on conflict (tab_key) do update set tab_name = excluded.tab_name, headings = excluded.headings, seen_at = now();
  end loop;
  update public.sheet_links l set tab_name = s.tab_name from public.sheet_tabs s where s.tab_key = l.tab_key and s.tab_key = any (keys) and l.tab_name <> s.tab_name;
  select coalesce(jsonb_agg(jsonb_build_object('key', l.tab_key, 'name', l.tab_name, 'source', l.source, 'map', l.map, 'extra', l.extra)), '[]'::jsonb) into links
    from public.sheet_links l join public.openings o on o.id = l.opening_id where l.enabled and o.status <> 'Closed' and l.tab_key = any (keys);
  return jsonb_build_object('ok', true, 'links', links);
end $$;
revoke all on function public.sheet_sync_plan(text, jsonb) from public;
grant execute on function public.sheet_sync_plan(text, jsonb) to anon, authenticated;

-- New rows of one linked tab. Each row: the standard fields by their names, and "answers": {heading: value}.
create function public.ingest_tab_leads(p_token text, p_tab_key text, p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  l public.sheet_links; o public.openings; r jsonb; res jsonb; results jsonb := '[]';
  n_read int := 0; n_added int := 0; n_existing int := 0; n_dup int := 0; n_skip int := 0;
begin
  if not app.feed_ok(p_token) then
    perform app.feed_refused();
    return jsonb_build_object('ok', false, 'message', 'This connection is not valid, or the lead sheet is switched off. Ask an admin for a new script.');
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then return jsonb_build_object('ok', false, 'message', 'The rows must be sent as a list.'); end if;
  if jsonb_array_length(p_rows) > 500 then return jsonb_build_object('ok', false, 'message', 'Send at most 500 rows at a time.'); end if;
  select * into l from public.sheet_links where tab_key = p_tab_key and enabled;
  if l.id is null then return jsonb_build_object('ok', false, 'message', 'This tab is not linked to an opening, or its link is switched off.'); end if;
  select * into o from public.openings where id = l.opening_id;

  for r in select value from jsonb_array_elements(p_rows) loop
    n_read := n_read + 1;
    begin
      res := app.ingest_one_lead(r, l);
    exception when others then
      res := jsonb_build_object('status', 'skipped', 'why', 'Could not save this row: ' || sqlerrm);
    end;
    case res ->> 'status'
      when 'added' then n_added := n_added + 1;
      when 'existing' then n_existing := n_existing + 1;
      when 'duplicate' then n_dup := n_dup + 1;
      else n_skip := n_skip + 1;
    end case;
    results := results || jsonb_build_array(jsonb_build_object('status', res ->> 'status', 'why', coalesce(res ->> 'why', '')));
  end loop;

  if n_read > 0 then
    insert into public.intake_batches (source, rows_read, rows_added, rows_skipped, detail)
      values ('sheet', n_read, n_added + n_existing, n_dup + n_skip,
              jsonb_build_object('added', n_added, 'existing', n_existing, 'duplicates', n_dup, 'skipped', n_skip, 'tab', l.tab_name, 'opening', o.title));
    update public.sheet_links set last_received_at = now() where id = l.id;
    update public.lead_feed set last_received_at = now() where singleton;
    if n_added + n_existing > 0 then
      if o.recruiter_id is not null then
        insert into public.notifications (user_id, text, link)
          values (o.recruiter_id, (n_added + n_existing) || ' new lead' || case when n_added + n_existing = 1 then '' else 's' end || ' from ' || l.tab_name || ' for ' || o.title, jsonb_build_array('candidates'));
      end if;
      insert into public.activity (text, type)
        values ((n_added + n_existing) || ' lead' || case when n_added + n_existing = 1 then '' else 's' end || ' added from ' || l.tab_name || ' (' || l.source || ') for ' || o.title, 'application');
    end if;
  end if;
  return jsonb_build_object('ok', true, 'added', n_added, 'existing', n_existing, 'duplicates', n_dup, 'skipped', n_skip, 'rows', results);
end $$;
revoke all on function public.ingest_tab_leads(text, text, jsonb) from public;
grant execute on function public.ingest_tab_leads(text, text, jsonb) to anon, authenticated;

/* ---------- what a recruiter or admin does from an opening ---------- */

-- checks shared by link and relink: the columns must exist in the tab, name and a phone or email are needed, an extra column cannot also be a field
create function app.check_link_columns(p_tab_key text, p_map jsonb, p_extra jsonb) returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare hs jsonb; have text[]; k text; v text; x text; used text[] := '{}';
begin
  select headings into hs from public.sheet_tabs where tab_key = p_tab_key;
  if hs is null then raise exception 'That tab has not been seen yet. Wait a minute for the script to report it, or check the script is installed'; end if;
  have := app.headings_of(hs);
  if jsonb_typeof(p_map) is distinct from 'object' then raise exception 'Choose the columns'; end if;
  if coalesce(p_map ->> 'name', '') = '' then raise exception 'Choose the Name column'; end if;
  if coalesce(p_map ->> 'phone', '') = '' and coalesce(p_map ->> 'email', '') = '' then raise exception 'Choose the Phone column or the Email column'; end if;
  for k, v in select key, value from jsonb_each_text(p_map) loop
    if k not in ('name', 'phone', 'email', 'location', 'exp', 'company', 'designation', 'education', 'skills', 'notice', 'curSal', 'expSal', 'notes', 'date') then
      raise exception '% is not a field the app knows', k;
    end if;
    if v <> '' then
      if not (v = any (have)) then raise exception 'The tab has no column called "%"', v; end if;
      if v = any (used) then raise exception 'The column "%" is chosen for two fields', v; end if;
      used := used || v;
    end if;
  end loop;
  if jsonb_typeof(p_extra) is distinct from 'array' then raise exception 'The extra columns must be a list'; end if;
  if jsonb_array_length(p_extra) > 40 then raise exception 'Keep at most 40 extra columns'; end if;
  for x in select jsonb_array_elements_text(p_extra) loop
    if not (x = any (have)) then raise exception 'The tab has no column called "%"', x; end if;
    if x = any (used) then raise exception 'The column "%" is already used for a field', x; end if;
  end loop;
  return hs;
end $$;

create function public.sheet_link_save(p_opening text, p_tab_key text, p_source text, p_map jsonb, p_extra jsonb) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare o public.openings; src text := left(btrim(coalesce(p_source, '')), 80); hs jsonb; nm text; at_title text; lid uuid;
begin
  if not app.is_staff() then raise exception 'Only an admin or a recruiter can link a sheet'; end if;
  select * into o from public.openings where id = p_opening;
  if o.id is null then raise exception 'That opening does not exist'; end if;
  if o.status = 'Closed' then raise exception 'That opening is closed'; end if;
  if src = '' then raise exception 'Choose where these leads come from'; end if;
  select t.title into at_title from public.sheet_links l join public.openings t on t.id = l.opening_id where l.tab_key = p_tab_key;
  if at_title is not null then raise exception 'This tab is already linked to "%". One tab can belong to one opening only', at_title; end if;
  hs := app.check_link_columns(p_tab_key, p_map, coalesce(p_extra, '[]'::jsonb));
  select tab_name into nm from public.sheet_tabs where tab_key = p_tab_key;
  insert into public.sheet_links (opening_id, tab_key, tab_name, source, map, extra, known, created_by)
    values (o.id, p_tab_key, nm, src, p_map, coalesce(p_extra, '[]'::jsonb), hs, auth.uid()) returning id into lid;
  insert into public.activity (text, type, actor_id) values ('Sheet tab "' || nm || '" was linked to ' || o.title || ' (' || src || ')', 'info', auth.uid());
  return lid;
end $$;
revoke all on function public.sheet_link_save(text, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.sheet_link_save(text, text, text, jsonb, jsonb) to authenticated;

-- Change the source, the columns or the switch of a link. Saving the columns also settles "new columns": the tab's current headings become the known ones.
create function public.sheet_link_update(p_id uuid, p_source text, p_map jsonb, p_extra jsonb, p_enabled boolean) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare l public.sheet_links; src text := left(btrim(coalesce(p_source, '')), 80); hs jsonb;
begin
  if not app.is_staff() then raise exception 'Only an admin or a recruiter can change a link'; end if;
  select * into l from public.sheet_links where id = p_id;
  if l.id is null then raise exception 'That link does not exist'; end if;
  if src = '' then raise exception 'Choose where these leads come from'; end if;
  hs := app.check_link_columns(l.tab_key, p_map, coalesce(p_extra, '[]'::jsonb));
  update public.sheet_links set source = src, map = p_map, extra = coalesce(p_extra, '[]'::jsonb), known = hs, enabled = coalesce(p_enabled, true) where id = p_id;
end $$;
revoke all on function public.sheet_link_update(uuid, text, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.sheet_link_update(uuid, text, jsonb, jsonb, boolean) to authenticated;

-- Unlink. The leads already received stay. The tab can then be linked to another opening.
create function public.sheet_link_remove(p_id uuid) returns void language plpgsql security definer set search_path = public, app, pg_temp as $$
declare l public.sheet_links; t text;
begin
  if not app.is_staff() then raise exception 'Only an admin or a recruiter can unlink a sheet'; end if;
  select * into l from public.sheet_links where id = p_id;
  if l.id is null then return; end if;
  select title into t from public.openings where id = l.opening_id;
  delete from public.sheet_links where id = p_id;
  insert into public.activity (text, type, actor_id) values ('Sheet tab "' || l.tab_name || '" was unlinked from ' || coalesce(t, 'an opening'), 'info', auth.uid());
end $$;
revoke all on function public.sheet_link_remove(uuid) from public, anon;
grant execute on function public.sheet_link_remove(uuid) to authenticated;

/* ---------- Settings: the connection (token and switch) ---------- */

create or replace function public.lead_feed_status() returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare f public.lead_feed; n int; seen timestamptz;
begin
  if not app.is_admin() then raise exception 'Only an admin can see the lead sheet settings'; end if;
  select * into f from public.lead_feed;
  select count(*), max(seen_at) into n, seen from public.sheet_tabs where seen_at > now() - interval '3 days';
  return jsonb_build_object('set_up', f.token_hash is not null, 'enabled', coalesce(f.enabled, false), 'token_made_at', f.token_made_at,
                            'last_received_at', f.last_received_at, 'tabs_seen', n, 'last_seen_at', seen);
end $$;

-- Switch the connection on or off. A new token is made when asked, or the first time; it is returned once and only its hash is kept.
create function public.lead_feed_connect(p_enabled boolean, p_new_token boolean default false) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare tok text; first_time boolean;
begin
  if not app.is_admin() then raise exception 'Only an admin can change the lead sheet settings'; end if;
  insert into public.lead_feed (singleton) values (true) on conflict do nothing;
  first_time := (select token_hash is null from public.lead_feed);
  if p_new_token or first_time then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.lead_feed set token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex'), token_made_at = now() where singleton;
    insert into public.activity (text, type, actor_id) values (case when first_time then 'The lead sheet connection was set up' else 'A new lead sheet token was made; the old script stopped working' end, 'info', auth.uid());
  end if;
  update public.lead_feed set enabled = coalesce(p_enabled, false) where singleton;
  return jsonb_build_object('token', tok);
end $$;
revoke all on function public.lead_feed_connect(boolean, boolean) from public, anon;
grant execute on function public.lead_feed_connect(boolean, boolean) to authenticated;
