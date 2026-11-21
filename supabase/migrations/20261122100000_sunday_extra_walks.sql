-- Sunday extra walks use the existing Admin-managed per-duration pricing.
-- Payment remains pending until an Admin checks the UPI reference against the bank/UPI statement.

create table if not exists public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  amount_inr integer not null check (amount_inr > 0),
  upi_transaction_ref text not null check (length(btrim(upi_transaction_ref)) between 6 and 100),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  submitted_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  admin_note text,
  constraint booking_payments_verification_consistency check (
    (status = 'pending' and verified_by is null and verified_at is null)
    or (status in ('verified','rejected') and verified_by is not null and verified_at is not null)
  )
);

create unique index if not exists booking_payments_unique_upi_ref
  on public.booking_payments (lower(btrim(upi_transaction_ref)));

alter table public.booking_payments enable row level security;

drop policy if exists booking_payments_participant_read on public.booking_payments;
create policy booking_payments_participant_read
  on public.booking_payments for select to authenticated
  using (customer_id = (select auth.uid()) or private.is_admin());

revoke insert, update, delete on public.booking_payments from anon, authenticated;
grant select on public.booking_payments to authenticated;

create or replace function public.customer_submit_sunday_extra_walk(
  p_dog_id uuid,
  p_scheduled_at timestamptz,
  p_duration_minutes integer,
  p_service_address text,
  p_customer_notes text,
  p_upi_transaction_ref text,
  p_latitude double precision default null,
  p_longitude double precision default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_customer_id uuid := auth.uid();
  v_price integer;
  v_local_date date;
  v_booking_id uuid;
begin
  if v_customer_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_customer_id and p.role = 'customer') then
    raise exception 'Customer account required';
  end if;
  perform 1 from public.dogs d where d.id = p_dog_id and d.customer_id = v_customer_id for update;
  if not found then
    raise exception 'Dog not found for this customer';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= clock_timestamp()
     or p_scheduled_at > clock_timestamp() + interval '30 days' then
    raise exception 'Choose a future Sunday walk within the next 30 days';
  end if;
  v_local_date := (p_scheduled_at at time zone 'Asia/Kolkata')::date;
  if extract(dow from v_local_date)::integer <> 0 then
    raise exception 'Sunday extra walk can only be booked for Sunday (India time)';
  end if;
  if p_duration_minutes not in (30,45,60) then raise exception 'Choose 30, 45 or 60 minutes'; end if;
  if nullif(btrim(p_service_address),'') is null or length(p_service_address) > 300 then
    raise exception 'A valid service address (up to 300 characters) is required';
  end if;
  if p_customer_notes is not null and length(p_customer_notes) > 1000 then
    raise exception 'Customer notes must be 1000 characters or fewer';
  end if;
  if (p_latitude is null) <> (p_longitude is null)
     or (p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180)) then
    raise exception 'Map coordinates are invalid';
  end if;
  if p_upi_transaction_ref is null or length(btrim(p_upi_transaction_ref)) < 6
     or length(btrim(p_upi_transaction_ref)) > 100 then
    raise exception 'Enter the UPI transaction reference after successful payment';
  end if;

  -- Serialize Sunday submissions using the same normalized reference.
  -- The unique index below remains the final guard within booking_payments.
  perform pg_advisory_xact_lock(hashtextextended(lower(btrim(p_upi_transaction_ref)), 0));

  select price_inr into v_price from public.pricing
  where duration_minutes = p_duration_minutes and is_active = true and price_inr > 0
  for share;
  if not found then raise exception 'This walk duration is not currently priced by Admin'; end if;

  if exists (
    select 1 from public.bookings b
    where b.dog_id = p_dog_id
      and (b.scheduled_at at time zone 'Asia/Kolkata')::date = v_local_date
      and b.service_type = 'sunday_extra'
      and b.status <> 'cancelled'
  ) then raise exception 'This dog already has a Sunday extra walk booked for that date'; end if;

  if exists (select 1 from public.subscription_payments sp
    where lower(btrim(sp.upi_transaction_ref)) = lower(btrim(p_upi_transaction_ref))) then
    raise exception 'This UPI transaction reference has already been submitted';
  end if;

  insert into public.bookings (
    customer_id,dog_id,subscription_id,scheduled_at,duration_minutes,service_address,
    customer_notes,status,walker_id,price_inr,service_type,service_latitude,service_longitude,service_slot
  ) values (
    v_customer_id,p_dog_id,p_scheduled_at,p_duration_minutes,btrim(p_service_address),
    nullif(btrim(p_customer_notes),''),'requested',null,v_price,'sunday_extra',p_latitude,p_longitude,null
  ) returning id into v_booking_id;

  insert into public.booking_payments (booking_id,customer_id,amount_inr,upi_transaction_ref)
  values (v_booking_id,v_customer_id,v_price,btrim(p_upi_transaction_ref));

  insert into public.walk_events (booking_id,actor_id,event_type,note)
  values (v_booking_id,v_customer_id,'requested','Sunday extra walk submitted; UPI payment awaits Admin verification');

  return v_booking_id;
end;
$function$;

create or replace function public.customer_list_sunday_extra_walk_payments()
returns table (
  booking_id uuid,
  dog_name text,
  scheduled_at timestamptz,
  duration_minutes integer,
  amount_inr integer,
  upi_transaction_ref text,
  payment_status text,
  submitted_at timestamptz,
  admin_note text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'customer'
  ) then raise exception 'Customer access required'; end if;

  return query
  select b.id,d.name,b.scheduled_at,b.duration_minutes,p.amount_inr,p.upi_transaction_ref,p.status,p.submitted_at,p.admin_note
  from public.booking_payments p
  join public.bookings b on b.id=p.booking_id
  join public.dogs d on d.id=b.dog_id
  where p.customer_id=auth.uid() and b.service_type='sunday_extra'
  order by p.submitted_at desc
  limit 50;
end;
$function$;

create or replace function public.admin_list_pending_booking_payments()
returns table (
  payment_id uuid,
  booking_id uuid,
  customer_name text,
  customer_phone text,
  dog_name text,
  scheduled_at timestamptz,
  duration_minutes integer,
  service_address text,
  amount_inr integer,
  upi_transaction_ref text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  return query
  select p.id,b.id,pr.full_name,pr.phone,d.name,b.scheduled_at,b.duration_minutes,b.service_address,
         p.amount_inr,p.upi_transaction_ref,p.submitted_at
  from public.booking_payments p
  join public.bookings b on b.id=p.booking_id
  join public.dogs d on d.id=b.dog_id
  join public.profiles pr on pr.id=p.customer_id
  where p.status='pending' and b.service_type='sunday_extra'
  order by p.submitted_at asc
  limit 100;
end;
$function$;

create or replace function public.admin_list_assignable_sunday_extra_walks()
returns table (
  id uuid,
  scheduled_at timestamptz,
  duration_minutes integer,
  service_address text,
  service_slot text,
  service_latitude double precision,
  service_longitude double precision,
  status public.booking_status,
  walker_id uuid,
  dog_name text,
  customer_name text,
  customer_phone text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  return query
  select b.id,b.scheduled_at,b.duration_minutes,b.service_address,b.service_slot,b.service_latitude,
         b.service_longitude,b.status,b.walker_id,d.name,pr.full_name,pr.phone
  from public.bookings b
  join public.booking_payments p on p.booking_id=b.id and p.status='verified'
  join public.dogs d on d.id=b.dog_id
  join public.profiles pr on pr.id=b.customer_id
  where b.service_type='sunday_extra' and b.status='requested'
  order by b.scheduled_at asc
  limit 100;
end;
$function$;

create or replace function public.admin_review_booking_payment(
  p_payment_id uuid,
  p_decision text,
  p_admin_note text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_booking_id uuid;
  v_customer_id uuid;
begin
  if not private.is_admin() then raise exception 'Admin access required'; end if;
  if p_decision not in ('verified','rejected') then raise exception 'Decision must be verified or rejected'; end if;

  select booking_id,customer_id into v_booking_id,v_customer_id
  from public.booking_payments
  where id=p_payment_id and status='pending'
  for update;
  if not found then raise exception 'Pending Sunday payment not found or already reviewed'; end if;
  if not exists (
    select 1 from public.bookings b
    where b.id=v_booking_id and b.customer_id=v_customer_id
      and b.service_type='sunday_extra' and b.status='requested'
  ) then
    raise exception 'Sunday booking is no longer awaiting payment review';
  end if;

  update public.booking_payments
  set status=p_decision,verified_by=auth.uid(),verified_at=now(),
      admin_note=nullif(btrim(p_admin_note),'')
  where id=p_payment_id;

  if p_decision='rejected' then
    update public.bookings set status='cancelled',updated_at=now()
    where id=v_booking_id and customer_id=v_customer_id and status='requested';
    insert into public.walk_events (booking_id,actor_id,event_type,note)
    values (v_booking_id,auth.uid(),'cancelled','Sunday extra payment rejected by Admin');
  else
    insert into public.walk_events (booking_id,actor_id,event_type,note)
    values (v_booking_id,auth.uid(),'requested','Sunday extra payment verified by Admin; booking is ready for walker assignment');
  end if;
end;
$function$;

revoke all on function public.customer_submit_sunday_extra_walk(uuid,timestamptz,integer,text,text,text,double precision,double precision) from public,anon;
revoke all on function public.customer_list_sunday_extra_walk_payments() from public,anon;
revoke all on function public.admin_list_pending_booking_payments() from public,anon;
revoke all on function public.admin_list_assignable_sunday_extra_walks() from public,anon;
revoke all on function public.admin_review_booking_payment(uuid,text,text) from public,anon;
grant execute on function public.customer_submit_sunday_extra_walk(uuid,timestamptz,integer,text,text,text,double precision,double precision) to authenticated;
grant execute on function public.customer_list_sunday_extra_walk_payments() to authenticated;
grant execute on function public.admin_list_pending_booking_payments() to authenticated;
grant execute on function public.admin_list_assignable_sunday_extra_walks() to authenticated;
grant execute on function public.admin_review_booking_payment(uuid,text,text) to authenticated;
