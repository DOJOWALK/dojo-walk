alter table public.walkers
  add column if not exists account_status text not null default 'active',
  add column if not exists status_changed_at timestamptz;

alter table public.walkers
  add constraint walkers_account_status_check
  check (account_status in ('active', 'on_hold', 'suspended', 'deactivated'));

-- Existing legacy review values are left unchanged; new Admin-created accounts are marked approved by the creation function.

create or replace function public.walker_start_booking(p_booking_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_started_at timestamptz;
  v_status public.booking_status;
  v_account_status text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  -- Serialize Walker start against Admin status changes. Both operations lock
  -- the Walker row before inspecting/updating bookings.
  select w.account_status into v_account_status
  from public.walkers w
  where w.id = auth.uid()
  for update;

  if not found or v_account_status <> 'active' then
    raise exception 'Walker account is not active';
  end if;

  select b.status, b.actual_started_at into v_status, v_started_at
  from public.bookings b
  where b.id = p_booking_id and b.walker_id = auth.uid()
  for update;

  if not found then raise exception 'Walk not found or not assigned to this walker'; end if;
  if v_status not in ('assigned'::public.booking_status, 'accepted'::public.booking_status)
     or v_started_at is not null then
    raise exception 'This walk cannot be started in its current state';
  end if;

  v_started_at := clock_timestamp();
  update public.bookings
     set status = 'in_progress'::public.booking_status,
         actual_started_at = v_started_at,
         actual_ended_at = null,
         actual_duration_minutes = null,
         walk_report = null
   where id = p_booking_id and walker_id = auth.uid();

  insert into public.walk_events (booking_id, actor_id, event_type, note)
  values (p_booking_id, auth.uid(), 'started', 'Walker started the walk');
  return v_started_at;
end;
$function$;


-- Atomic Admin status change: lock the Walker row, check active walks, and
-- update status in one transaction so a new walk cannot race the Admin check.
create or replace function public.admin_set_walker_account_status(
  p_admin_id uuid,
  p_walker_id uuid,
  p_account_status text
)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_current_status text;
begin
  if p_admin_id is null or not exists (
    select 1 from public.profiles p
    where p.id = p_admin_id and p.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_account_status is null or p_account_status not in ('active', 'on_hold', 'suspended', 'deactivated') then
    raise exception 'Invalid account status';
  end if;

  select w.account_status into v_current_status
  from public.walkers w
  where w.id = p_walker_id
  for update;

  if not found then
    raise exception 'Walker account not found';
  end if;

  if v_current_status = 'deactivated' and p_account_status <> 'deactivated' then
    raise exception 'Deactivated Walker accounts cannot be reactivated';
  end if;

  if p_account_status <> 'active' and exists (
    select 1 from public.bookings b
    where b.walker_id = p_walker_id
      and b.status = 'in_progress'::public.booking_status
  ) then
    raise exception 'Walker has an in-progress walk';
  end if;

  update public.walkers
  set account_status = p_account_status,
      status_changed_at = pg_catalog.clock_timestamp()
  where id = p_walker_id;

  return p_account_status;
end;
$function$;

revoke all on function public.admin_set_walker_account_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_walker_account_status(uuid, uuid, text) to service_role;
