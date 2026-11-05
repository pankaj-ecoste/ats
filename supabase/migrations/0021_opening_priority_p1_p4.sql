-- 0021 Opening priority is now P1 (highest) to P4 (lowest), replacing Urgent / High / Medium / Low.
-- Existing openings are converted: Urgent -> P1, High -> P2, Medium -> P3, Low -> P4. Tasks keep Low / Medium / High.

alter table public.openings drop constraint if exists openings_priority_check;
alter table public.openings alter column priority drop default;

update public.openings set priority = case priority
  when 'Urgent' then 'P1' when 'High' then 'P2' when 'Medium' then 'P3' when 'Low' then 'P4' else priority end
where priority in ('Urgent', 'High', 'Medium', 'Low');

alter table public.openings alter column priority set default 'P3';
alter table public.openings add constraint openings_priority_check check (priority in ('P1', 'P2', 'P3', 'P4'));
