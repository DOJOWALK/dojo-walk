-- Server-side rate limiting for the public phone-eligibility endpoint.
-- IP addresses are rate-limit keys; stale rows are pruned on later endpoint calls.
create table if not exists private.login_phone_rate_limits (
  client_ip inet primary key,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts >= 1),
  updated_at timestamptz not null default now()
);

alter table private.login_phone_rate_limits enable row level security;
revoke all on table private.login_phone_rate_limits from public, anon, authenticated, service_role;

create or replace function public.consume_login_phone_attempt(p_client_ip inet)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_attempts integer;
begin
  if p_client_ip is null then
    return false;
  end if;

  insert into private.login_phone_rate_limits as limits
    (client_ip, window_started_at, attempts, updated_at)
  values
    (p_client_ip, v_now, 1, v_now)
  on conflict (client_ip) do update
    set window_started_at = case
          when limits.window_started_at <= v_now - interval '15 minutes' then v_now
          else limits.window_started_at
        end,
        attempts = case
          when limits.window_started_at <= v_now - interval '15 minutes' then 1
          else limits.attempts + 1
        end,
        updated_at = v_now
    where limits.window_started_at <= v_now - interval '15 minutes'
       or limits.attempts < 10
  returning attempts into v_attempts;

  -- No returned row means the IP already used all 10 attempts in this window.
  if not found then
    return false;
  end if;

  -- Bound table growth; stale IP entries are not needed after one day.
  delete from private.login_phone_rate_limits
  where window_started_at < v_now - interval '1 day';

  return true;
end;
$$;

revoke all on function public.consume_login_phone_attempt(inet) from public, anon, authenticated;
grant execute on function public.consume_login_phone_attempt(inet) to service_role;
