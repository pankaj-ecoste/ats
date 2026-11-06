-- Screening questions of an opening: a recruiter adds questions of their own for the screening call of one opening (different openings need different questions).
-- A list of texts. The answers are kept on each application (applications.custom, question -> answer) and shown as columns in the Applications list.

create function app.valid_screen_questions(q jsonb) returns boolean language sql immutable as $$
  select jsonb_typeof(q) = 'array'
     and jsonb_array_length(q) <= 10
     and not exists (select 1 from jsonb_array_elements(q) e where jsonb_typeof(e) <> 'string' or char_length(btrim(e #>> '{}')) not between 1 and 200)
     and (select count(distinct lower(btrim(e #>> '{}'))) from jsonb_array_elements(q) e) = jsonb_array_length(q)
$$;

alter table public.openings add column screen_questions jsonb not null default '[]' check (app.valid_screen_questions(screen_questions));
