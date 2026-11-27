create table if not exists public.payment_orders (
  id text primary key,
  provider text not null check (provider in ('stripe', 'paypal')),
  service_id text not null check (service_id = 'test_service'),
  amount_cents integer not null check (amount_cents = 100),
  currency text not null check (currency = 'EUR'),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from anon, authenticated;
grant all on public.payment_orders to service_role;
