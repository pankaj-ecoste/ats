-- A row sent again for a person who already applied to this opening keeps everything but refreshes the call status.
-- (Clear the "Synced to ATS" cells of the rows to send them again.)
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
      -- sending the row again refreshes the call status of the person who is already here
      if btrim(coalesce(r ->> 'callStatus', '')) <> '' and prev.call_status is distinct from left(btrim(r ->> 'callStatus'), 60) then
        update public.applications set call_status = left(btrim(r ->> 'callStatus'), 60) where id = prev.id;
        return jsonb_build_object('status', 'duplicate', 'why', 'Already applied for this opening (' || ex.name || '). Call status updated');
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
