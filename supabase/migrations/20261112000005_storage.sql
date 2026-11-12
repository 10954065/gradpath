-- Storage buckets and access rules. All buckets are private; files are served through signed URLs.
--   avatars/<user_id>/...            profile photos (owner only)
--   assignment-files/<user_id>/...   personal assignment attachments (owner only)
--   course-materials/<course-slug>/  lecturer/institutional uploads (admins write; students read only
--                                    files whose uploaded_course_materials row is published)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('assignment-files', 'assignment-files', false, 10485760, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'image/png', 'image/jpeg']),
  ('course-materials', 'course-materials', false, 26214400, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Owner-only folders: the first path segment must be the caller's user id.
create policy "avatars: owner select" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "assignment files: owner select" on storage.objects for select to authenticated
  using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assignment files: owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assignment files: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "assignment files: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'assignment-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "course materials: admin or published read" on storage.objects for select to authenticated
  using (
    bucket_id = 'course-materials' and (
      public.is_admin() or exists (
        select 1 from public.uploaded_course_materials m
        where m.storage_path = storage.objects.name and m.is_published
      )
    )
  );
create policy "course materials: admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-materials' and public.is_admin());
create policy "course materials: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'course-materials' and public.is_admin());
create policy "course materials: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'course-materials' and public.is_admin());
