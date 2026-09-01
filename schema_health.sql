begin;
create table if not exists public.health_dispensations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_dispense_dates check(end_date>=start_date)
);
create index if not exists idx_health_dispensations_user on public.health_dispensations(user_id);
create index if not exists idx_health_dispensations_class on public.health_dispensations(class_id);
create index if not exists idx_health_dispensations_student on public.health_dispensations(student_id);
alter table public.health_dispensations enable row level security;
drop policy if exists health_dispensations_read on public.health_dispensations;
drop policy if exists health_dispensations_insert on public.health_dispensations;
drop policy if exists health_dispensations_update on public.health_dispensations;
drop policy if exists health_dispensations_delete on public.health_dispensations;
create policy health_dispensations_read on public.health_dispensations for select to authenticated using(user_id=auth.uid() and eps_account_active());
create policy health_dispensations_insert on public.health_dispensations for insert to authenticated with check(user_id=auth.uid() and eps_account_active());
create policy health_dispensations_update on public.health_dispensations for update to authenticated using(user_id=auth.uid() and eps_account_active()) with check(user_id=auth.uid() and eps_account_active());
create policy health_dispensations_delete on public.health_dispensations for delete to authenticated using(user_id=auth.uid() and eps_account_active());
grant select,insert,update,delete on public.health_dispensations to authenticated;

create table if not exists public.health_accidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  facts_nature text not null,
  occurred_at timestamptz not null,
  damage_type text not null check(damage_type in ('MATERIEL','PHYSIQUE')),
  course_context text not null check(course_context in ('EPS','AS','AUTRE')),
  course_other text,
  time_context text not null,
  activity_nature text not null,
  responsible_name text not null,
  diagram_data text,
  witnesses text,
  urgency_code text not null check(urgency_code in ('VERT','ORANGE','ROUGE')),
  decision_taken text not null,
  created_at timestamptz not null default now()
);
alter table public.health_accidents enable row level security;
drop policy if exists health_accidents_owner on public.health_accidents;
create policy health_accidents_owner on public.health_accidents for all to authenticated
using(user_id=auth.uid() and eps_account_active())
with check(user_id=auth.uid() and eps_account_active());
grant select,insert,update,delete on public.health_accidents to authenticated;
commit;
