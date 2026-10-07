-- ZuuTrans Duty Checker wallet hardening.
-- Run in Supabase SQL Editor after reviewing your existing duty_customers schema.

create table if not exists public.duty_customers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  phone text not null default '',
  token_balance integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists duty_customers_email_lower_uidx
  on public.duty_customers (lower(email));

alter table public.duty_customers
  add column if not exists phone text not null default '';
alter table public.duty_customers
  add column if not exists token_balance integer not null default 0;

create or replace function public.consume_duty_token(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_email text := lower(trim(p_email));
begin
  update public.duty_customers
     set token_balance = token_balance - 1
   where lower(email) = v_email
     and token_balance > 0
   returning token_balance into v_balance;

  if found then
    return jsonb_build_object('success', true, 'token_balance', v_balance);
  end if;

  if exists (select 1 from public.duty_customers where lower(email)=v_email) then
    return jsonb_build_object('success', false, 'error', 'INSUFFICIENT_TOKENS');
  end if;

  return jsonb_build_object('success', false, 'error', 'CUSTOMER_NOT_FOUND');
end;
$$;

revoke all on function public.consume_duty_token(text) from public;
