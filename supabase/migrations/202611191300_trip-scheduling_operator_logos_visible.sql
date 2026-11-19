-- Trip Scheduling: operators' profile photos show next to their name on the
-- daily schedule, for everyone who can see the schedule.
--
-- The schedule already shows every operator's name and trips to every signed-in
-- user (a departures board), but an operator profile row (and the operator-docs
-- bucket) is private to its owner and staff. A photo is a brand mark, so:
--   * list_operator_logos(ids) returns only operator_id + logo_path, nothing else
--     from the profile;
--   * the storage policy lets any signed-in user READ files named logo* (the
--     profile photo), and only those. Uploads, replacement and deletion stay with
--     the owner and staff, and every other document in the bucket stays private.

create or replace function public.list_operator_logos(p_operator_ids uuid[])
returns table (operator_id uuid, logo_path text)
language sql
security definer
set search_path = public
stable
as $$
  select o.operator_id, o.logo_path
  from public.operator_profiles o
  where auth.uid() is not null
    and o.operator_id = any(p_operator_ids)
    and o.logo_path is not null;
$$;

revoke all on function public.list_operator_logos(uuid[]) from public, anon;
grant execute on function public.list_operator_logos(uuid[]) to authenticated;

drop policy if exists operator_docs_logo_select on storage.objects;
create policy operator_docs_logo_select on storage.objects for select to authenticated
  using (bucket_id = 'operator-docs' and (storage.filename(name)) like 'logo%');

notify pgrst, 'reload schema';
