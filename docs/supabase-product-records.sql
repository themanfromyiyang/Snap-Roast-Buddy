create table if not exists public.product_records (
  id text primary key,
  original_image_url text not null,
  created_at timestamptz not null,
  description text,
  layout_type text not null,
  generation_mode text not null,
  roast_level text not null,
  sketch_mode text not null,
  ticket_html text,
  ticket_text text,
  sketch_image_url text,
  caption text,
  record jsonb not null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_records_created_at_idx
  on public.product_records (created_at desc);

create or replace function public.set_product_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists product_records_set_updated_at on public.product_records;

create trigger product_records_set_updated_at
before update on public.product_records
for each row
execute function public.set_product_records_updated_at();

alter table public.product_records enable row level security;

drop policy if exists "product_records_no_public_access" on public.product_records;

create policy "product_records_no_public_access"
on public.product_records
for all
to anon, authenticated
using (false)
with check (false);
