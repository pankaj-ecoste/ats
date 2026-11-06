-- Call status: what the team's sheet says about the call (Connected, Not Interested, Call Back Requested ...), kept on the application so it can be shown and filtered in the list.
-- It is text the team types, so it only informs: it never moves a stage. A tab column can be chosen for it when linking.
alter table public.applications add column call_status text not null default '' check (char_length(call_status) <= 60);

create or replace function app.check_link_columns(p_tab_key text, p_map jsonb, p_extra jsonb) returns jsonb language plpgsql stable security definer set search_path = public, app, pg_temp as $$
declare hs jsonb; have text[]; k text; v text; x text; used text[] := '{}';
begin
  select headings into hs from public.sheet_tabs where tab_key = p_tab_key;
  if hs is null then raise exception 'That tab has not been seen yet. Wait a minute for the script to report it, or check the script is installed'; end if;
  have := app.headings_of(hs);
  if jsonb_typeof(p_map) is distinct from 'object' then raise exception 'Choose the columns'; end if;
  if coalesce(p_map ->> 'name', '') = '' then raise exception 'Choose the Name column'; end if;
  if coalesce(p_map ->> 'phone', '') = '' and coalesce(p_map ->> 'email', '') = '' then raise exception 'Choose the Phone column or the Email column'; end if;
  for k, v in select key, value from jsonb_each_text(p_map) loop
    if k not in ('name', 'phone', 'email', 'location', 'exp', 'company', 'designation', 'education', 'skills', 'notice', 'curSal', 'expSal', 'notes', 'date', 'callStatus') then
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

create or replace function app.ingest_one_lead(r jsonb, l public.sheet_links) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
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
  insert into public.applications (id, candidate_id, opening_id, recruiter_id, applied_on, source, campaign, answers, call_status)
    values (aid, cid, op.id, op.recruiter_id, d, l.source, l.tab_name, ans, left(btrim(coalesce(r ->> 'callStatus', '')), 60));
  return jsonb_build_object('status', st, 'why', why, 'opening', op.id);
end $$;
