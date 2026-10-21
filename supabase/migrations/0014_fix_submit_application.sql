-- 0014 Fix: a variable named email clashed with the column of the same name in submit_application (found by the intake tests).
-- 0013 is already applied and must not change, so the function is replaced here.

create or replace function public.submit_application(
  p_opening text, p_name text, p_email text, p_phone text, p_location text, p_experience numeric, p_notice int,
  p_current_lpa numeric, p_expected_lpa numeric, p_skills text[], p_education text, p_resume_path text, p_resume_name text,
  p_consent boolean, p_website text default ''
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  o       public.openings;
  v_email text := lower(btrim(coalesce(p_email, '')));
  nm      text := btrim(coalesce(p_name, ''));
  digits  text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  cid     text;
  aid     text;
  was     boolean := false;
  skills  text[];
  path    text;
  refuse  text;
begin
  -- the door is shut when busy: too many tries from anyone, or from one address
  if (select count(*) from public.intake_batches where source = 'careers_page' and received_at > now() - interval '10 minutes') > 200 then
    return jsonb_build_object('ok', false, 'message', 'We are receiving a lot of applications right now. Please try again in a few minutes.');
  end if;
  if (select count(*) from public.intake_batches where source = 'careers_page' and detail ->> 'email' = v_email and received_at > now() - interval '1 hour') >= 5 then
    return jsonb_build_object('ok', false, 'message', 'Too many attempts from this email address. Please try again later.');
  end if;

  -- a hidden field only a robot fills in: pretend it worked, keep a note, create nothing
  if btrim(coalesce(p_website, '')) <> '' then
    insert into public.intake_batches (source, rows_read, rows_skipped, error, detail) values ('careers_page', 1, 1, 'Refused: hidden field filled in', jsonb_build_object('email', v_email, 'opening', p_opening));
    return jsonb_build_object('ok', true, 'message', 'Thank you. Your application has been received.');
  end if;

  select * into o from public.openings where id = p_opening and status in ('Open', 'Screening', 'Interviewing');
  if not found then refuse := 'This opening is no longer accepting applications.';
  elsif char_length(nm) < 2 or char_length(nm) > 120 then refuse := 'Please enter your full name.';
  elsif v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 200 then refuse := 'Please enter a valid email address.';
  elsif char_length(digits) < 7 or char_length(digits) > 15 then refuse := 'Please enter a valid phone number.';
  elsif p_consent is not true then refuse := 'Please agree to the use of your details before applying.';
  end if;
  if refuse is not null then
    insert into public.intake_batches (source, rows_read, rows_skipped, error, detail) values ('careers_page', 1, 1, 'Refused: ' || refuse, jsonb_build_object('email', v_email, 'opening', p_opening));
    return jsonb_build_object('ok', false, 'message', refuse);
  end if;

  skills := coalesce((select array_agg(distinct btrim(s)) from unnest(coalesce(p_skills, '{}')) s where btrim(s) <> '' and char_length(s) <= 60), '{}');
  skills := skills[1:40];
  path := case when p_resume_path ~ '^intake/[0-9a-fA-F-]{36}/[^/]{1,120}$' then p_resume_path else null end;

  select id into cid from public.candidates where lower(email) = v_email limit 1;
  if cid is null then
    cid := app.new_id('C');
    insert into public.candidates (id, name, email, phone, location, exp_years, notice_days, skills, education, source, history, notes, resume_path, resume_name, consent_at, consent_text)
    values (cid, left(nm, 120), v_email, left(btrim(coalesce(p_phone, '')), 30), left(btrim(coalesce(p_location, '')), 80), greatest(0, least(coalesce(p_experience, 0), 60)), greatest(0, least(coalesce(p_notice, 30), 365)),
            skills, left(btrim(coalesce(p_education, '')), 80), 'Careers Page', '[]', '[]', path, case when path is not null then left(coalesce(p_resume_name, ''), 120) end, now(),
            'Agreed on the careers page to the storing and use of their details for hiring.');
    insert into public.candidate_compensation (candidate_id, current_lpa, expected_lpa) values (cid, greatest(0, least(coalesce(p_current_lpa, 0), 1000)), greatest(0, least(coalesce(p_expected_lpa, 0), 1000)));
    insert into public.candidate_documents (candidate_id, name, status) values (cid, 'Resume', case when path is null then 'Pending' else 'Received' end), (cid, 'ID proof', 'Pending');
  end if;

  select id into aid from public.applications where candidate_id = cid and opening_id = o.id limit 1;
  if aid is not null then
    was := true;
  else
    aid := app.new_id('APP');
    insert into public.applications (id, candidate_id, opening_id, recruiter_id) values (aid, cid, o.id, o.recruiter_id);
    insert into public.activity (text, type, application_id) values (nm || ' applied for ' || o.title || ' on the careers page', 'application', aid);
    if o.recruiter_id is not null then
      insert into public.notifications (user_id, text, link) values (o.recruiter_id, 'New application from the careers page: ' || left(nm, 120) || ' for ' || o.title, jsonb_build_array('candidate', cid));
    end if;
  end if;

  insert into public.intake_batches (source, rows_read, rows_added, rows_skipped, detail)
    values ('careers_page', 1, case when was then 0 else 1 end, case when was then 1 else 0 end, jsonb_build_object('email', v_email, 'opening', o.id, 'candidate', cid, 'application', aid, 'repeat', was));
  return jsonb_build_object('ok', true, 'message', case when was then 'You had already applied for this role. We have your application.' else 'Thank you. Your application has been received.' end);
end $$;
