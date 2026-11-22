alter table public.walkers
  add column if not exists local_address text,
  add column if not exists permanent_address text;

alter table public.walkers
  add constraint walkers_local_address_length_check
    check (local_address is null or char_length(local_address) between 5 and 500),
  add constraint walkers_permanent_address_length_check
    check (permanent_address is null or char_length(permanent_address) between 5 and 500);

comment on column public.walkers.local_address is
  'Walker current/local residential address; visible only through Admin-authorized access.';
comment on column public.walkers.permanent_address is
  'Walker permanent residential address; visible only through Admin-authorized access.';
