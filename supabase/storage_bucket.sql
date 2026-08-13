-- Run once in Supabase → SQL Editor.
-- Creates the public storage bucket used as the fallback for file uploads
-- (large files > 30 MB or when the Google Drive Apps Script is unreachable).

insert into storage.buckets (id, name, public)
values ('project-files', 'project-files', true)
on conflict (id) do nothing;

-- Anonymous upload/read access (this project runs with RLS off everywhere else).
drop policy if exists "dd-anon-insert" on storage.objects;
create policy "dd-anon-insert" on storage.objects
  for insert
  with check (true);

drop policy if exists "dd-anon-select" on storage.objects;
create policy "dd-anon-select" on storage.objects
  for select
  using (true);
