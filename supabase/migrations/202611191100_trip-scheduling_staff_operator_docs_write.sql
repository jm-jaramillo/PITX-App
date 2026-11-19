-- Trip Scheduling: staff can add and remove files in the operator-docs bucket.
--
-- Until now only an operator could write to their own folder
-- (<operator id>/...); staff could read everything. Staff now edit an
-- operator's profile photo on their behalf (Operator profiles -> Edit profile),
-- so staff need to upload into, and clean up, any operator's folder. Reading is
-- unchanged (operator_docs_select already allows staff); operators keep their own
-- insert/update/delete policies.

drop policy if exists operator_docs_staff_insert on storage.objects;
create policy operator_docs_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'operator-docs' and (select public.is_staff()));

drop policy if exists operator_docs_staff_delete on storage.objects;
create policy operator_docs_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'operator-docs' and (select public.is_staff()));
