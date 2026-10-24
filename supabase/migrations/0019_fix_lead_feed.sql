-- 0019 Fix: in app.ingest_one_lead a variable named status clashed with the status column of openings (found by the lead sheet tests).
-- 0018 is already applied and must not change, so the function is replaced here.

create or replace function app.ingest_one_lead(r jsonb, f public.lead_feed) returns jsonb language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  nm     text := left(btrim(coalesce(r ->> 'name', '')), 120);
  ph     record;
  mail   text := lower(btrim(coalesce(r ->> 'email', '')));
  pos    text := btrim(coalesce(r ->> 'position', ''));
  op     public.openings;
  ex     public.candidates;
  cid    text;
  aid    text;
  st     text;
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
    cid := ex.id; st := 'existing'; why := 'Already in the system as ' || ex.name; d := today;
  else
    cid := app.new_id('C'); st := 'added'; d := app.lead_date(r ->> 'date', today);
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
  return jsonb_build_object('status', st, 'why', why, 'opening', op.id);
end $$;
