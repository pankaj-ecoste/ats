-- 0026 The application form of an opening: which of the usual questions its form asks, and extra questions of the recruiter's own.
--
-- openings.form = {"hide": ["cur", "expected"], "questions": [{"id": "q7k2", "label": "Do you have a bike?", "type": "yesno", "required": true, "options": []}]}
--   hide       the usual optional questions switched off for this opening: location, exp, notice, cur, expected, edu, skills, resume
--              (name, email, phone and the consent are always asked: the person is found again by them)
--   questions  up to 15 extra questions; type is text, long, number, yesno or choice (a choice has 2 to 10 options)
-- An empty form ({}) is the form as it always was: every usual question, no extra one.
-- The careers page shows the form; submit_application checks the answers against it and keeps them on the application (applications.answers, question -> answer),
-- where the candidate's page already shows them.

create function app.valid_apply_question(q jsonb) returns boolean language sql immutable as $$
  select case when jsonb_typeof(q) is distinct from 'object' then false else
         (q - 'id' - 'label' - 'type' - 'required' - 'options') = '{}'::jsonb
     and jsonb_typeof(q -> 'id') = 'string' and (q ->> 'id') ~ '^[a-z0-9]{1,12}$'
     and jsonb_typeof(q -> 'label') = 'string' and char_length(btrim(q ->> 'label')) between 1 and 200 and (q ->> 'label') = btrim(q ->> 'label')
     and jsonb_typeof(q -> 'type') = 'string' and (q ->> 'type') in ('text', 'long', 'number', 'yesno', 'choice')
     and (not (q ? 'required') or jsonb_typeof(q -> 'required') = 'boolean')
     and case when (q ->> 'type') = 'choice'
           then jsonb_typeof(q -> 'options') = 'array' and jsonb_array_length(q -> 'options') between 2 and 10
                and not exists (select 1 from jsonb_array_elements(q -> 'options') o where jsonb_typeof(o) <> 'string' or char_length(btrim(o #>> '{}')) not between 1 and 100)
           else not (q ? 'options') or (jsonb_typeof(q -> 'options') = 'array' and jsonb_array_length(q -> 'options') = 0)
         end
     end
$$;

create function app.valid_apply_form(f jsonb) returns boolean language sql immutable as $$
  select case when jsonb_typeof(f) is distinct from 'object' then false else
         (f - 'hide' - 'questions') = '{}'::jsonb
     and (not (f ? 'hide') or (jsonb_typeof(f -> 'hide') = 'array'
          and not exists (select 1 from jsonb_array_elements(f -> 'hide') h
                           where jsonb_typeof(h) <> 'string' or (h #>> '{}') not in ('location', 'exp', 'notice', 'cur', 'expected', 'edu', 'skills', 'resume'))))
     and (not (f ? 'questions') or (jsonb_typeof(f -> 'questions') = 'array' and jsonb_array_length(f -> 'questions') <= 15
          and not exists (select 1 from jsonb_array_elements(f -> 'questions') q where not app.valid_apply_question(q))
          and (select count(distinct q ->> 'id') = count(*) and count(distinct lower(q ->> 'label')) = count(*) from jsonb_array_elements(f -> 'questions') q)))
     end
$$;

alter table public.openings add column form jsonb not null default '{}';
alter table public.openings add constraint openings_form_valid check (app.valid_apply_form(form));

-- the public may read the form of an open role (it holds nothing but questions)
create or replace view public.careers_openings as
  select o.id, o.title, o.dept, o.location, o.mode, o.type, o.exp_min, o.exp_max, o.education, o.mandatory, o.preferred,
         o.description, o.responsibilities, o.requirements, o.opened_on, (select s.company from public.company_settings s limit 1) as company, o.form
  from public.openings o
  where o.status in ('Open', 'Screening', 'Interviewing');

-- the answers of one application against the opening's form: {question -> answer}, or the first problem in words
create function app.apply_answers(form jsonb, p_answers jsonb, out answers jsonb, out problem text) language plpgsql immutable as $$
declare q jsonb; raw text; val text; lbl text; src jsonb := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;
begin
  answers := '{}'::jsonb; problem := null;
  for q in select value from jsonb_array_elements(case when jsonb_typeof(form -> 'questions') = 'array' then form -> 'questions' else '[]'::jsonb end) loop
    lbl := q ->> 'label';
    raw := btrim(coalesce(src ->> (q ->> 'id'), ''));
    if raw = '' then
      if coalesce((q ->> 'required')::boolean, false) then problem := 'Please answer: ' || lbl; return; end if;
      continue;
    end if;
    case q ->> 'type'
      when 'number' then
        if raw !~ '^-?[0-9]{1,12}(\.[0-9]{1,6})?$' then problem := 'Please enter a number for: ' || lbl; return; end if;
        val := raw;
      when 'yesno' then
        if lower(raw) not in ('yes', 'no') then problem := 'Please answer Yes or No: ' || lbl; return; end if;
        val := initcap(lower(raw));
      when 'choice' then
        if not exists (select 1 from jsonb_array_elements_text(q -> 'options') o where o = raw) then problem := 'Please choose one of the options for: ' || lbl; return; end if;
        val := raw;
      when 'long' then val := left(raw, 1000);
      else val := left(raw, 300);
    end case;
    answers := answers || jsonb_build_object(lbl, val);
  end loop;
end $$;

/* ---------- the public form: the same as 0025, plus p_answers ---------- */
drop function public.submit_application(text, text, text, text, text, numeric, int, numeric, numeric, text[], text, text, text, boolean, text, text);

create function public.submit_application(
  p_opening text, p_name text, p_email text, p_phone text, p_location text, p_experience numeric, p_notice int,
  p_current_lpa numeric, p_expected_lpa numeric, p_skills text[], p_education text, p_resume_path text, p_resume_name text,
  p_consent boolean, p_website text default '', p_source text default '', p_answers jsonb default '{}'
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
  src     text := app.pick_source(p_source);
  via     text;
  prev    public.applications;
  ans     record;
begin
  via := case when src = 'Careers Page' then '' else ' (' || src || ')' end;
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
  -- the opening's own questions
  if refuse is null then
    select * into ans from app.apply_answers(o.form, p_answers);
    refuse := ans.problem;
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
            skills, left(btrim(coalesce(p_education, '')), 80), src, '[]', '[]', path, case when path is not null then left(coalesce(p_resume_name, ''), 120) end, now(),
            'Agreed on the careers page to the storing and use of their details for hiring.');
    insert into public.candidate_compensation (candidate_id, current_lpa, expected_lpa) values (cid, greatest(0, least(coalesce(p_current_lpa, 0), 1000)), greatest(0, least(coalesce(p_expected_lpa, 0), 1000)));
    insert into public.candidate_documents (candidate_id, name, status) values (cid, 'Resume', case when path is null then 'Pending' else 'Received' end), (cid, 'ID proof', 'Pending');
  end if;

  select * into prev from public.applications where candidate_id = cid and opening_id = o.id limit 1;
  if prev.id is not null then
    was := true; aid := prev.id;
    -- the same person came again for this role by another link: the first source and the first answers stay, and the activity says so
    if prev.source is distinct from src then
      insert into public.activity (text, type, application_id) values (nm || ' also came through ' || src || ' (careers page)', 'application', aid);
    end if;
  else
    aid := app.new_id('APP');
    insert into public.applications (id, candidate_id, opening_id, recruiter_id, source, answers) values (aid, cid, o.id, o.recruiter_id, src, ans.answers);
    insert into public.activity (text, type, application_id) values (nm || ' applied for ' || o.title || ' on the careers page' || via, 'application', aid);
    if o.recruiter_id is not null then
      insert into public.notifications (user_id, text, link) values (o.recruiter_id, 'New application from the careers page' || via || ': ' || left(nm, 120) || ' for ' || o.title, jsonb_build_array('candidate', cid));
    end if;
  end if;

  insert into public.intake_batches (source, rows_read, rows_added, rows_skipped, detail)
    values ('careers_page', 1, case when was then 0 else 1 end, case when was then 1 else 0 end, jsonb_build_object('email', v_email, 'opening', o.id, 'candidate', cid, 'application', aid, 'repeat', was, 'source', src));
  return jsonb_build_object('ok', true, 'message', case when was then 'You had already applied for this role. We have your application.' else 'Thank you. Your application has been received.' end);
end $$;
revoke all on function public.submit_application(text, text, text, text, text, numeric, int, numeric, numeric, text[], text, text, text, boolean, text, text, jsonb) from public;
grant execute on function public.submit_application(text, text, text, text, text, numeric, int, numeric, numeric, text[], text, text, text, boolean, text, text, jsonb) to anon, authenticated;
