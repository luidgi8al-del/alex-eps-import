-- ============================================================================
-- Alex EPS Outils — Planning hebdomadaire (onglet Programmation > Planning)
-- A coller UNE FOIS dans le SQL Editor Supabase, apres schema_sync.sql (classes).
-- Miroir de ClassScheduleSlotEntity / PeriodActivityEntity cote app Android.
-- ============================================================================

create table if not exists class_schedule_slots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references classes(id) on delete cascade,
  day_of_week text not null,        -- LUNDI..SAMEDI
  start_time text not null,         -- "HH:mm"
  duration_minutes int not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists period_activities (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  slot_id text not null references class_schedule_slots(id) on delete cascade,
  period_number int not null,
  apsa_name text not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  unique (slot_id, period_number)
);

create index if not exists idx_class_schedule_slots_user_id on class_schedule_slots(user_id);
create index if not exists idx_class_schedule_slots_class_id on class_schedule_slots(class_id);
create index if not exists idx_period_activities_user_id on period_activities(user_id);
create index if not exists idx_period_activities_slot_id on period_activities(slot_id);

alter table class_schedule_slots enable row level security;
alter table period_activities enable row level security;

drop policy if exists "select own schedule slots" on class_schedule_slots;
drop policy if exists "insert own schedule slots" on class_schedule_slots;
drop policy if exists "update own schedule slots" on class_schedule_slots;
drop policy if exists "delete own schedule slots" on class_schedule_slots;
create policy "select own schedule slots" on class_schedule_slots for select using (auth.uid() = user_id);
create policy "insert own schedule slots" on class_schedule_slots for insert with check (auth.uid() = user_id);
create policy "update own schedule slots" on class_schedule_slots for update using (auth.uid() = user_id);
create policy "delete own schedule slots" on class_schedule_slots for delete using (auth.uid() = user_id);

drop policy if exists "select own period activities" on period_activities;
drop policy if exists "insert own period activities" on period_activities;
drop policy if exists "update own period activities" on period_activities;
drop policy if exists "delete own period activities" on period_activities;
create policy "select own period activities" on period_activities for select using (auth.uid() = user_id);
create policy "insert own period activities" on period_activities for insert with check (auth.uid() = user_id);
create policy "update own period activities" on period_activities for update using (auth.uid() = user_id);
create policy "delete own period activities" on period_activities for delete using (auth.uid() = user_id);
