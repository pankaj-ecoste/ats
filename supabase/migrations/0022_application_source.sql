-- 0022 Where a lead came from now belongs to the APPLICATION, not only to the person. One person can reach one opening through LinkedIn and
-- another through an ad; each application keeps its own source. candidates.source stays as the first source the person ever had.
-- Until the intake functions (public form, live sheet) set it themselves, a new application with no source copies the person's source.

alter table public.applications add column source text not null default '';

update public.applications a set source = c.source from public.candidates c where c.id = a.candidate_id and a.source = '';

create function app.application_source_default() returns trigger language plpgsql as $$
begin
  if coalesce(new.source, '') = '' then
    select c.source into new.source from public.candidates c where c.id = new.candidate_id;
    new.source := coalesce(new.source, '');
  end if;
  return new;
end $$;
create trigger application_source_default before insert on public.applications for each row execute function app.application_source_default();
