-- 0012 Files: private storage buckets, who may open them, and the columns that point at them.
-- Nothing is public. The app asks for a short-lived signed link each time someone opens a file.
--   resumes        <candidate id>/<file>      staff write; staff, and the manager / interviewers who may see the candidate, read
--   documents      <candidate id>/<file>      ID proofs, payslips, certificates: staff only
--   offer-letters  <application id>/<file>    the letter as it was sent; staff write; staff and the opening's hiring manager read

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('resumes', 'resumes', false, 10485760, array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword', 'text/plain', 'text/markdown']),
  ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword']),
  ('offer-letters', 'offer-letters', false, 5242880, array['text/html', 'application/pdf'])
on conflict (id) do nothing;

-- which candidate or application a file belongs to is the first folder of its path
create policy resumes_read on storage.objects for select to authenticated
  using (bucket_id = 'resumes' and (app.is_staff() or app.sees_candidate((storage.foldername(name))[1])));
create policy resumes_write on storage.objects for insert to authenticated with check (bucket_id = 'resumes' and app.is_staff());
create policy resumes_change on storage.objects for update to authenticated using (bucket_id = 'resumes' and app.is_staff()) with check (bucket_id = 'resumes' and app.is_staff());
create policy resumes_remove on storage.objects for delete to authenticated using (bucket_id = 'resumes' and app.is_staff());

create policy documents_read on storage.objects for select to authenticated using (bucket_id = 'documents' and app.is_staff());
create policy documents_write on storage.objects for insert to authenticated with check (bucket_id = 'documents' and app.is_staff());
create policy documents_change on storage.objects for update to authenticated using (bucket_id = 'documents' and app.is_staff()) with check (bucket_id = 'documents' and app.is_staff());
create policy documents_remove on storage.objects for delete to authenticated using (bucket_id = 'documents' and app.is_staff());

create policy letters_read on storage.objects for select to authenticated
  using (bucket_id = 'offer-letters' and (app.is_staff() or app.manages_application((storage.foldername(name))[1])));
create policy letters_write on storage.objects for insert to authenticated with check (bucket_id = 'offer-letters' and app.is_staff());
create policy letters_change on storage.objects for update to authenticated using (bucket_id = 'offer-letters' and app.is_staff()) with check (bucket_id = 'offer-letters' and app.is_staff());
create policy letters_remove on storage.objects for delete to authenticated using (bucket_id = 'offer-letters' and app.is_staff());

-- where the files are recorded
alter table public.candidates add column resume_path text, add column resume_name text;
alter table public.candidate_documents add column file_name text;
