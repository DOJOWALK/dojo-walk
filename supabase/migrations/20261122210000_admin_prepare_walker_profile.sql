-- Allow the trusted Admin onboarding Edge Function to prepare a new Walker profile
-- without weakening the profile-role guard for ordinary API clients.
create or replace function public.admin_prepare_walker_profile(
  p_admin_id uuid,
  p_walker_id uuid,
  p_full_name text,
  p_phone text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = p_admin_id
      and role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_full_name is null
     or char_length(btrim(p_full_name)) < 2
     or char_length(btrim(p_full_name)) > 100 then
    raise exception 'Invalid Walker name';
  end if;

  if p_phone is null or p_phone !~ '^\\+91[6-9][0-9]{9}$' then
    raise exception 'Invalid Indian mobile number';
  end if;

  update public.profiles
  set role = 'walker',
      full_name = btrim(p_full_name),
      phone = p_phone
  where id = p_walker_id;

  if not found then
    raise exception 'Walker profile does not exist';
  end if;
end;
$$;

revoke all on function public.admin_prepare_walker_profile(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_prepare_walker_profile(uuid, uuid, text, text)
  to service_role;

comment on function public.admin_prepare_walker_profile(uuid, uuid, text, text) is
  'Service-role-only helper for Admin-verified Walker onboarding. Validates the Admin id and performs the role update under the function owner so profile-role guard triggers remain effective for ordinary clients.';
