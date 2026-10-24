-- 0018 Live lead sheet. The ad leads land in a Google Sheet; a small script inside that sheet sends each new row here, so the leads
-- reach the app without anyone opening it. The sheet proves itself with a secret token (only its hash is kept); an admin makes and
-- changes the token from Settings. Rows are tidied and checked for repeats the same way as the Import leads screen (src/domain/lead-import.js,
-- src/services/lead-import.js). Every batch, accepted or refused, is written to intake_batches (source 'sheet').

-- a phone number is found by its last 10 digits; this keeps that search fast with thousands of candidates
create index candidates_phone_key on public.candidates (right(regexp_replace(phone, '\D', '', 'g'), 10));

-- one row of settings; nobody reads or writes it directly (no policy), only the functions below
create table public.lead_feed (
  singleton       boolean primary key default true check (singleton),
  token_hash      text,
  token_made_at   timestamptz,
  opening_id      text references public.openings (id) on delete set null,
  source          text not null default 'Ad campaign',
  enabled         boolean not null default false,
  last_received_at timestamptz
);
alter table public.lead_feed enable row level security;

/* ---------- reading what people type in a sheet (same rules as cleanLeadPhone, toLPA, toNotice, leadDate in the app) ---------- */

-- shown: how the phone is stored (+91 98765 43210); key: its last 10 digits, used to spot repeats. Both empty when it cannot be a phone.
create function app.lead_phone(v text, out shown text, out key text) language plpgsql immutable as $$
declare s text := btrim(coalesce(v, '')); d text; plus boolean;
begin
  if length(s) < 25 and s ~* '^\d+(\.\d+)?e\+?\d+$' then s := round(s::numeric)::text; end if;   -- Excel's 9.87654321E9
  plus := left(s, 1) = '+';
  d := regexp_replace(s, '\D', '', 'g');
  if length(d) = 12 and left(d, 2) = '91' then d := substr(d, 3);
  elsif length(d) = 11 and left(d, 1) = '0' then d := substr(d, 2);
  elsif length(d) = 13 and left(d, 3) = '091' then d := substr(d, 4);
  end if;
  if d ~ '^[6-9]\d{9}$' then shown := '+91 ' || substr(d, 1, 5) || ' ' || substr(d, 6); key := d; return; end if;
  if length(d) between 7 and 15 and (plus or length(d) <> 10) then shown := case when plus then '+' else '' end || d; key := right(d, 10); return; end if;
  shown := ''; key := '';
end $$;

-- the first number inside some text ("about 4.5 yrs" -> 4.5)
create function app.lead_num(v text) returns numeric language sql immutable as $$
  select nullif(substring(replace(coalesce(v, ''), ',', '') from '-?\d+(?:\.\d+)?'), '')::numeric $$;

-- a salary as lakhs per year ("10 LPA", "50000 per month", "1200000")
create function app.lead_lpa(v text) returns numeric language plpgsql immutable as $$
declare s text := lower(btrim(coalesce(v, ''))); n numeric;
begin
  if s = '' then return 0; end if;
  n := app.lead_num(s);
  if n is null then return 0; end if;
  if s ~ 'lakh|lac|lpa|\yl\y' then return n; end if;
  if s ~ 'k\y|thousand' then n := n * 1000; end if;
  if s ~ 'month|pm|p\.m' then n := n * 12; end if;
  if n >= 1000 then return round(n / 1000) / 100; end if;
  return n;
end $$;

-- a notice period in days ("1 month", "2 weeks", "immediate")
create function app.lead_notice(v text) returns int language plpgsql immutable as $$
declare s text := lower(btrim(coalesce(v, ''))); n numeric;
begin
  if s = '' then return 30; end if;
  n := app.lead_num(s);
  if s ~ 'immediate|serving|0' and coalesce(n, 0) = 0 then return 0; end if;
  if n is null then return 30; end if;
  n := case when s ~ 'month' then n * 30 when s ~ 'week' then n * 7 else n end;
  return least(365, greatest(0, round(n)))::int;
end $$;

-- a date as typed: 2026-10-12 (Excel) or 12/10/2026 (day first). Anything else, or a date that does not exist, gives the fallback.
create function app.lead_date(v text, fallback date) returns date language plpgsql immutable as $$
declare s text := btrim(coalesce(v, '')); m text[]; x text[];
begin
  m := regexp_match(s, '^(\d{4})-(\d{1,2})-(\d{1,2})');
  if m is null then
    x := regexp_match(s, '^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})');
    if x is not null then m := array[case when length(x[3]) = 2 then '20' || x[3] else x[3] end, x[2], x[1]]; end if;
  end if;
  if m is null or m[1]::int < 2000 or m[1]::int > 2100 then return fallback; end if;
  return make_date(m[1]::int, m[2]::int, m[3]::int);
exception when others then
  return fallback;
end $$;

/* ---------- one row ---------- */

-- Adds one lead. Returns {status: added | existing | duplicate | skipped, why, opening}. Called only from ingest_leads.
create function app.ingest_one_lead(r jsonb, f public.lead_feed) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  nm     text := left(btrim(coalesce(r ->> 'name', '')), 120);
  ph     record;
  mail   text := lower(btrim(coalesce(r ->> 'email', '')));
  pos    text := btrim(coalesce(r ->> 'position', ''));
  op     public.openings;
  ex     public.candidates;
  cid    text;
  aid    text;
  status text;
  why    text := '';
  d      date;
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  src    text;
  skills text[];
  loc    text;
  remark text := left(btrim(coalesce(r ->> 'notes', '')), 500);
begin
  if nm = '' then return jsonb_build_object('status', 'skipped', 'why', 'No name'); end if;
  select * into ph from app.lead_phone(r ->> 'phone');
  if mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(mail) > 200 then mail := ''; end if;
  if ph.key = '' and mail = '' then
    return jsonb_build_object('status', 'skipped', 'why',
      case when btrim(coalesce(r ->> 'phone', '')) <> '' or btrim(coalesce(r ->> 'email', '')) <> '' then 'Phone or email is not valid' else 'No phone or email' end);
  end if;

  -- the opening: the row names one (id or exact title), or the lead sheet's own opening
  if pos <> '' then select * into op from public.openings where status <> 'Closed' and (lower(id) = lower(pos) or lower(title) = lower(pos)) limit 1; end if;
  if op.id is null and f.opening_id is not null then select * into op from public.openings where id = f.opening_id and status <> 'Closed'; end if;
  if op.id is null then return jsonb_build_object('status', 'skipped', 'why', 'No open opening to add this lead to'); end if;

  select * into ex from public.candidates
    where (mail <> '' and lower(email) = mail) or (ph.key <> '' and right(regexp_replace(phone, '\D', '', 'g'), 10) = ph.key) limit 1;

  if ex.id is not null then
    if exists (select 1 from public.applications where candidate_id = ex.id and opening_id = op.id) then
      return jsonb_build_object('status', 'duplicate', 'why', 'Already applied for this opening (' || ex.name || ')');
    end if;
    cid := ex.id; status := 'existing'; why := 'Already in the system as ' || ex.name; d := today;
  else
    cid := app.new_id('C'); status := 'added'; d := app.lead_date(r ->> 'date', today);
    src := left(coalesce(nullif(btrim(r ->> 'source'), ''), f.source, 'Ad campaign'), 80);
    loc := coalesce(nullif(left(btrim(coalesce(r ->> 'location', '')), 80), ''), '—');
    skills := coalesce((select array_agg(x order by o) from (select btrim(s) x, min(o) o from unnest(regexp_split_to_array(coalesce(r ->> 'skills', ''), '[,;|/\n]')) with ordinality t(s, o)
                         where btrim(s) <> '' and char_length(btrim(s)) <= 60 group by btrim(s)) q), '{}');
    skills := skills[1:40];
    insert into public.candidates (id, name, email, phone, designation, company, exp_years, location, education, edu_field, university, skills, notice_days, source, history, notes, resume_text, created_on)
    values (cid, nm, mail, ph.shown,
            coalesce(nullif(left(btrim(coalesce(r ->> 'designation', '')), 120), ''), '—'), coalesce(nullif(left(btrim(coalesce(r ->> 'company', '')), 120), ''), '—'),
            least(60, greatest(0, coalesce(app.lead_num(r ->> 'exp'), 0))), loc,
            coalesce(nullif(left(btrim(coalesce(r ->> 'education', '')), 80), ''), '—'), 'General', '—', skills, app.lead_notice(r ->> 'notice'), src, '[]',
            case when remark <> '' then jsonb_build_array(jsonb_build_object('text', remark, 'by', 'Lead sheet', 'ts', (extract(epoch from now()) * 1000)::bigint)) else '[]'::jsonb end,
            nm || E'\n' || concat_ws(' · ', nullif(ph.shown, ''), nullif(mail, ''), nullif(loc, '—')) || E'\nLead from ' || src || ', ' || to_char(d, 'DD Mon YYYY') || '. No resume yet.', d);
    insert into public.candidate_compensation (candidate_id, current_lpa, expected_lpa)
      values (cid, least(1000, greatest(0, app.lead_lpa(r ->> 'curSal'))), least(1000, greatest(0, app.lead_lpa(r ->> 'expSal'))));
    insert into public.candidate_documents (candidate_id, name, status) values (cid, 'Resume', 'Pending');
  end if;

  aid := app.new_id('APP');
  insert into public.applications (id, candidate_id, opening_id, recruiter_id, applied_on) values (aid, cid, op.id, op.recruiter_id, d);
  return jsonb_build_object('status', status, 'why', why, 'opening', op.id);
end $$;
revoke all on function app.ingest_one_lead(jsonb, public.lead_feed) from public, anon, authenticated;

/* ---------- the door the sheet knocks on ---------- */

create function public.ingest_leads(p_token text, p_rows jsonb) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  f public.lead_feed;
  r jsonb; res jsonb; results jsonb := '[]'; per jsonb := '{}';
  n_read int := 0; n_added int := 0; n_existing int := 0; n_dup int := 0; n_skip int := 0;
  k text; v text;
begin
  select * into f from public.lead_feed;
  if f.token_hash is null or f.enabled is not true or f.token_hash <> encode(sha256(convert_to(coalesce(p_token, ''), 'utf8')), 'hex') then
    -- a note of the refused try, but never more than a few per ten minutes, so nobody can fill the log
    if (select count(*) from public.intake_batches where source = 'sheet' and error like 'Refused%' and received_at > now() - interval '10 minutes') < 5 then
      insert into public.intake_batches (source, rows_read, rows_skipped, error) values ('sheet', 0, 0, 'Refused: the token is wrong, or the live lead sheet is switched off');
    end if;
    return jsonb_build_object('ok', false, 'message', 'This connection is not valid, or the live lead sheet is switched off. Ask an admin for a new script.');
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then return jsonb_build_object('ok', false, 'message', 'The rows must be sent as a list.'); end if;
  if jsonb_array_length(p_rows) > 500 then return jsonb_build_object('ok', false, 'message', 'Send at most 500 rows at a time.'); end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    n_read := n_read + 1;
    begin
      res := app.ingest_one_lead(r, f);
    exception when others then
      res := jsonb_build_object('status', 'skipped', 'why', 'Could not save this row: ' || sqlerrm);
    end;
    case res ->> 'status'
      when 'added' then n_added := n_added + 1;
      when 'existing' then n_existing := n_existing + 1;
      when 'duplicate' then n_dup := n_dup + 1;
      else n_skip := n_skip + 1;
    end case;
    if res ->> 'status' in ('added', 'existing') then
      per := per || jsonb_build_object(res ->> 'opening', coalesce((per ->> (res ->> 'opening'))::int, 0) + 1);
    end if;
    results := results || jsonb_build_array(jsonb_build_object('status', res ->> 'status', 'why', coalesce(res ->> 'why', '')));
  end loop;

  if n_read > 0 then
    insert into public.intake_batches (source, rows_read, rows_added, rows_skipped, detail)
      values ('sheet', n_read, n_added + n_existing, n_dup + n_skip, jsonb_build_object('added', n_added, 'existing', n_existing, 'duplicates', n_dup, 'skipped', n_skip));
    update public.lead_feed set last_received_at = now();
    -- tell each opening's recruiter, once per batch
    for k, v in select key, value from jsonb_each_text(per) loop
      insert into public.notifications (user_id, text, link)
        select o.recruiter_id, v || ' new lead' || case when v = '1' then '' else 's' end || ' from the lead sheet for ' || o.title, jsonb_build_array('candidates')
          from public.openings o where o.id = k and o.recruiter_id is not null;
      insert into public.activity (text, type) select v || ' lead' || case when v = '1' then '' else 's' end || ' added from the lead sheet for ' || o.title, 'application' from public.openings o where o.id = k;
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'added', n_added, 'existing', n_existing, 'duplicates', n_dup, 'skipped', n_skip, 'rows', results);
end $$;
revoke all on function public.ingest_leads(text, jsonb) from public;
grant execute on function public.ingest_leads(text, jsonb) to anon, authenticated;

/* ---------- what an admin does from Settings ---------- */

create function public.lead_feed_status() returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare f public.lead_feed;
begin
  if not app.is_admin() then raise exception 'Only an admin can see the lead sheet settings'; end if;
  select * into f from public.lead_feed;
  return jsonb_build_object('set_up', f.token_hash is not null, 'enabled', coalesce(f.enabled, false), 'opening', f.opening_id,
                            'source', coalesce(f.source, 'Ad campaign'), 'token_made_at', f.token_made_at, 'last_received_at', f.last_received_at);
end $$;
revoke all on function public.lead_feed_status() from public, anon;
grant execute on function public.lead_feed_status() to authenticated;

-- Saves the settings. A new token is made when asked, or the first time; it is returned once and only its hash is kept.
create function public.lead_feed_save(p_opening text, p_source text, p_enabled boolean, p_new_token boolean default false) returns jsonb
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare tok text; src text := left(btrim(coalesce(p_source, '')), 80); first_time boolean;
begin
  if not app.is_admin() then raise exception 'Only an admin can change the lead sheet settings'; end if;
  if coalesce(p_opening, '') <> '' and not exists (select 1 from public.openings where id = p_opening) then raise exception 'That opening does not exist'; end if;
  insert into public.lead_feed (singleton) values (true) on conflict do nothing;
  first_time := (select token_hash is null from public.lead_feed);
  if p_new_token or first_time then
    tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.lead_feed set token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex'), token_made_at = now();
    insert into public.activity (text, type, actor_id) values (case when first_time then 'The live lead sheet was set up' else 'A new lead sheet token was made; the old script stopped working' end, 'info', auth.uid());
  end if;
  update public.lead_feed set opening_id = nullif(p_opening, ''), source = case when src = '' then 'Ad campaign' else src end, enabled = coalesce(p_enabled, false);
  return jsonb_build_object('token', tok);
end $$;
revoke all on function public.lead_feed_save(text, text, boolean, boolean) from public, anon;
grant execute on function public.lead_feed_save(text, text, boolean, boolean) to authenticated;
