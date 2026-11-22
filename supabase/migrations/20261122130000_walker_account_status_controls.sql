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

  select w.account_status into v_account_status
  from public.walkers w
  where w.id = auth.uid();

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
