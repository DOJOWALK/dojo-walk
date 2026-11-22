create table if not exists public.walker_private_details (
  walker_id uuid primary key references public.walkers(id) on delete cascade,
  local_address text not null check (char_length(local_address) between 5 and 500),
  permanent_address text not null check (char_length(permanent_address) between 5 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.walker_private_details enable row level security;

drop policy if exists "Admins manage walker private details" on public.walker_private_details;
create policy "Admins manage walker private details"
on public.walker_private_details
for all
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  )
);

comment on table public.walker_private_details is
  'Private Walker residential details. RLS permits Admins only; never expose this table in Walker app.';
