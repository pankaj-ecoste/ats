-- 0017 Why a candidate was rejected. Every rejection records a reason (a short phrase, optionally with a note), so reports and
-- any review of a hiring decision can say why. Empty unless the application is Rejected.
alter table public.applications add column rejection_reason text;
