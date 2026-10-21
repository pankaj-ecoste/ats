-- 0002 Domain tables: everything the app keeps in its in-memory state S today, as real tables.
-- Names are snake_case versions of the app's fields. Ids stay the app's own text ids. Row level security is added in 0004.

-- position of a stage in the hiring journey; Rejected and On Hold are outside it (null)
create function app.stage_rank(stage text) returns int language sql immutable as $$
  select nullif(array_position(array['New','Shortlisted','Screening','Group Interview','Personal Interview','Selected','Offer','Offer Accepted','Joining','Onboarding','Employee Ready'], stage), 0) - 1
$$;

/* ---------- openings ---------- */
create table public.openings (
  id            text primary key,
  title         text not null,
  dept          text not null default '',
  positions     int  not null default 1 check (positions >= 1),
  location      text not null default '',
  mode          text not null default 'Onsite' check (mode in ('Onsite', 'Hybrid', 'Remote')),
  type          text not null default 'Full-time' check (type in ('Full-time', 'Contract', 'Internship', 'Part-time')),
  exp_min       numeric not null default 0,
  exp_max       numeric not null default 0,
  sal_min       numeric not null default 0,            -- lakh per annum
  sal_max       numeric not null default 0,
  education     text not null default 'Graduate',
  mandatory     text[] not null default '{}',
  preferred     text[] not null default '{}',
  description   text not null default '',
  responsibilities text not null default '',
  requirements  text not null default '',
  recruiter_id  uuid references public.profiles (id) on delete set null,
  manager_id    uuid references public.profiles (id) on delete set null,
  opened_on     date not null default current_date,
  target_on     date,
  priority      text not null default 'Medium' check (priority in ('Low', 'Medium', 'High', 'Urgent')),
  status        text not null default 'Open' check (status in ('Draft', 'Open', 'Screening', 'Interviewing', 'Offer', 'Filled', 'On Hold', 'Closed')),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

/* ---------- candidates ---------- */
create table public.candidates (
  id             text primary key,
  name           text not null,
  email          text not null default '',
  phone          text not null default '',
  designation    text not null default '',
  company        text not null default '',
  exp_years      numeric not null default 0,
  location       text not null default '',
  relocate       boolean not null default false,
  education      text not null default '',
  edu_field      text not null default '',
  university     text not null default '',
  grad_year      int,
  skills         text[] not null default '{}',
  notice_days    int not null default 30,
  certifications text[] not null default '{}',
  achievements   text[] not null default '{}',
  source         text not null default '',
  history        jsonb not null default '[]',             -- previous jobs: [{company, designation, from, to, summary}]
  notes          jsonb not null default '[]',             -- recruiter notes: [{text, by, ts}]
  resume_text    text not null default '',
  created_on     date not null default current_date,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index candidates_email_unique on public.candidates (lower(email)) where email <> '';

-- salary lives apart from the profile so it can be hidden from roles that may see the rest
create table public.candidate_compensation (
  candidate_id  text primary key references public.candidates (id) on delete cascade,
  current_lpa   numeric not null default 0,
  expected_lpa  numeric not null default 0,
  updated_at    timestamptz not null default now()
);

create table public.candidate_documents (
  id            bigint generated always as identity primary key,
  candidate_id  text not null references public.candidates (id) on delete cascade,
  name          text not null,
  status        text not null default 'Pending' check (status in ('Pending', 'Received', 'Verified')),
  storage_path  text,                                     -- file in the private "documents" bucket (Phase 3)
  url           text,
  created_at    timestamptz not null default now()
);
create index on public.candidate_documents (candidate_id);

/* ---------- applications ---------- */
create table public.applications (
  id             text primary key,
  candidate_id   text not null references public.candidates (id) on delete cascade,
  opening_id     text not null references public.openings (id) on delete cascade,
  applied_on     date not null default current_date,
  stage          text not null default 'New' check (stage in ('New', 'Shortlisted', 'Screening', 'Group Interview', 'Personal Interview', 'Selected', 'Offer', 'Offer Accepted', 'Joining', 'Onboarding', 'Employee Ready', 'Rejected', 'On Hold')),
  max_stage      int not null default 0,                  -- furthest stage reached (index in the journey)
  stage_since    date not null default current_date,
  recruiter_id   uuid references public.profiles (id) on delete set null,
  joining_on     date,
  joined_on      date,
  dropped_on     date,
  drop_risk      text check (drop_risk in ('Low', 'Med', 'High')),
  backup_application_id text references public.applications (id) on delete set null,
  backup_status  text check (backup_status in ('Ready', 'In process', 'Offered')),
  match_score    int check (match_score between 0 and 100),
  match_reasons  jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (candidate_id, opening_id)
);
create index on public.applications (opening_id, stage);
create index on public.applications (candidate_id);

-- every stage change, written by a trigger (0003). Append only.
create table public.stage_events (
  id             bigint generated always as identity primary key,
  application_id text not null references public.applications (id) on delete cascade,
  from_stage     text,
  to_stage       text not null,
  actor_id       uuid references public.profiles (id) on delete set null,
  at             timestamptz not null default now()
);
create index on public.stage_events (application_id, at);

create table public.screenings (
  application_id   text primary key references public.applications (id) on delete cascade,
  outcome          text not null,
  answers          jsonb not null default '[]',
  notes            text not null default '',
  screened_on      date not null default current_date,
  duration_seconds int not null default 0,
  screened_by      uuid references public.profiles (id) on delete set null
);

/* ---------- interviews ---------- */
create table public.interview_groups (
  id             text primary key,
  opening_id     text not null references public.openings (id) on delete cascade,
  on_date        date not null,
  at_time        time not null,
  duration_min   int not null default 60,
  mode           text not null default 'Office',
  location       text not null default '',
  link           text not null default '',
  panel          text not null default '',
  interviewer_ids uuid[] not null default '{}',
  evaluated      boolean not null default false,
  created_at     timestamptz not null default now()
);

create table public.interviews (
  id             text primary key,
  application_id text not null references public.applications (id) on delete cascade,
  kind           text not null check (kind in ('Group', 'Personal')),
  round          text not null default '',
  group_id       text references public.interview_groups (id) on delete set null,
  on_date        date not null,
  at_time        time not null,
  duration_min   int not null default 60,
  mode           text not null default '',
  location       text not null default '',
  link           text not null default '',
  interviewer_ids uuid[] not null default '{}',
  status         text not null default 'Scheduled' check (status in ('Scheduled', 'Completed', 'Cancelled', 'No-show')),
  invite         text not null default 'Sent' check (invite in ('Pending', 'Sent', 'Confirmed', 'Declined')),
  scores         int[],
  recommendation text,
  decision       text,
  feedback       text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.interviews (application_id);
create index on public.interviews using gin (interviewer_ids);

-- one scorecard per interviewer per interview, so a panel can score without touching each other's rows
create table public.interview_scores (
  interview_id   text not null references public.interviews (id) on delete cascade,
  interviewer_id uuid not null references public.profiles (id) on delete cascade,
  scores         int[] not null,
  recommendation text,
  decision       text,
  feedback       text not null default '',
  submitted_at   timestamptz not null default now(),
  primary key (interview_id, interviewer_id)
);

/* ---------- offers and onboarding ---------- */
create table public.offers (
  id             text primary key,
  application_id text not null references public.applications (id) on delete cascade,
  designation    text not null default '',
  dept           text not null default '',
  location       text not null default '',
  joining_on     date,
  manager_id     uuid references public.profiles (id) on delete set null,
  emp_type       text not null default 'Full-time',
  ctc            numeric not null default 0,              -- rupees per year
  breakup        jsonb not null default '{}',
  status         text not null default 'Draft' check (status in ('Draft', 'Generated', 'Sent', 'Accepted', 'Declined', 'Negotiation', 'Withdrawn')),
  created_on     date not null default current_date,
  sent_on        date,
  custom_letter  text,
  probation_months int not null default 6,
  validity_days  int not null default 7,
  approval_status text not null default 'Not required' check (approval_status in ('Not required', 'Pending', 'Approved', 'Rejected')),
  approved_by    uuid references public.profiles (id) on delete set null,
  approved_at    timestamptz,
  letter_path    text,                                    -- generated PDF in the private "offer-letters" bucket (Phase 3)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.offers (application_id);

create table public.onboarding_checklists (
  application_id text primary key references public.applications (id) on delete cascade,
  started_on     date not null default current_date
);
create table public.onboarding_items (
  id             bigint generated always as identity primary key,
  application_id text not null references public.onboarding_checklists (application_id) on delete cascade,
  position       int not null default 0,
  category       text not null,
  title          text not null,
  done           boolean not null default false,
  done_at        timestamptz,
  done_by        uuid references public.profiles (id) on delete set null
);
create index on public.onboarding_items (application_id, position);

/* ---------- work, messages, feeds ---------- */
create table public.tasks (
  id          text primary key,
  title       text not null,
  due_on      date,
  related     text not null default 'General',
  priority    text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  owner_id    uuid references public.profiles (id) on delete set null,
  done        boolean not null default false,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.tasks (owner_id, done);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  text        text not null,
  link        jsonb not null default '["dashboard"]',      -- arguments for go(), e.g. ["candidate","C-2001"]
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, read, created_at desc);

-- the readable feed shown on dashboards and candidate timelines ("Meera moved to Offer")
create table public.activity (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  text           text not null,
  type           text not null default 'info',
  application_id text references public.applications (id) on delete set null,
  actor_id       uuid references public.profiles (id) on delete set null
);
create index on public.activity (at desc);
create index on public.activity (application_id);

-- who changed what, kept for good (filled by a trigger in 0003). Append only.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_id    uuid,
  table_name  text not null,
  row_id      text,
  op          text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb
);
create index on public.audit_log (table_name, row_id);
create index on public.audit_log (at desc);

create table public.messages (
  id             uuid primary key default gen_random_uuid(),
  candidate_id   text references public.candidates (id) on delete set null,
  application_id text references public.applications (id) on delete set null,
  channel        text not null check (channel in ('Email', 'WhatsApp', 'SMS')),
  template       text not null default '',
  subject        text not null default '',
  body           text not null default '',
  status         text not null default 'Composed' check (status in ('Composed', 'Queued', 'Sent', 'Failed')),
  provider_id    text,
  sent_by        uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

/* ---------- posting, sourcing, reporting ---------- */
create table public.job_boards (
  id          text primary key,
  name        text not null,
  type        text not null default 'board',
  format      text not null default 'full',
  color       text not null default '',
  source_name text not null default '',                    -- candidates from this site are counted by this source name
  url         text not null default '',
  custom      boolean not null default false,
  position    int not null default 0
);
create table public.postings (
  id          text primary key,
  opening_id  text not null references public.openings (id) on delete cascade,
  board_id    text not null,
  status      text not null default 'Posted' check (status in ('Posted', 'Paused', 'Closed')),
  posted_on   date not null default current_date,
  url         text not null default '',
  expires_on  date,
  cost        numeric not null default 0,
  demo        boolean not null default false
);
create index on public.postings (opening_id);

create table public.report_events (
  id             bigint generated always as identity primary key,
  on_date        date not null default current_date,
  type           text not null,                            -- shortlist, gi, interview, noshow, selected, offer, accepted, joined, backup, dropped
  application_id text references public.applications (id) on delete set null,
  opening_id     text references public.openings (id) on delete set null,
  days           int,
  source         text,
  demo           boolean not null default false
);
create index on public.report_events (on_date);
create table public.call_log (
  id          text primary key,
  on_date     date not null,
  opening_id  text references public.openings (id) on delete set null,
  made        int not null check (made >= 0),
  connected   int not null check (connected >= 0 and connected <= made),
  demo        boolean not null default false
);
create table public.monthly_targets (
  month       text primary key check (month ~ '^\d{4}-\d{2}$'),
  target      int not null default 0,
  budget      numeric not null default 0,
  other       numeric not null default 0
);

create table public.intake_batches (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('google_form', 'sheet', 'workbook', 'api')),
  received_at timestamptz not null default now(),
  rows_read   int not null default 0,
  rows_added  int not null default 0,
  rows_skipped int not null default 0,
  error       text,
  detail      jsonb
);
create table public.sheet_log (
  id    bigint generated always as identity primary key,
  at    timestamptz not null default now(),
  text  text not null
);

-- keep updated_at honest
do $$
declare t text;
begin
  foreach t in array array['openings', 'candidates', 'candidate_compensation', 'applications', 'interviews', 'offers', 'tasks'] loop
    execute format('create trigger touch before update on public.%I for each row execute function app.touch_updated_at()', t);
  end loop;
end $$;
