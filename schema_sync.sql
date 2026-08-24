-- Tables de synchronisation bidirectionnelle site <-> application (remplacent pending_class_imports /
-- pending_students, qui n'etaient qu'une file d'attente a sens unique). A executer dans l'editeur SQL
-- de Supabase.

create table if not exists classes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  grade text not null,
  class_number int not null check (class_number between 1 and 8),
  school_year text not null,
  name text not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists students (
  id text primary key,
  class_id text not null references classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_name text not null,
  first_name text not null,
  sex text not null default 'NON_PRECISE',
  eps_level text not null default '3',
  student_email text,
  parent1_email text,
  parent2_email text,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create index if not exists idx_students_class_id on students(class_id);
create index if not exists idx_classes_user_id on classes(user_id);
create index if not exists idx_students_user_id on students(user_id);

alter table classes enable row level security;
alter table students enable row level security;

create policy "select own classes" on classes for select using (auth.uid() = user_id);
create policy "insert own classes" on classes for insert with check (auth.uid() = user_id);
create policy "update own classes" on classes for update using (auth.uid() = user_id);
create policy "delete own classes" on classes for delete using (auth.uid() = user_id);

create policy "select own students" on students for select using (auth.uid() = user_id);
create policy "insert own students" on students for insert with check (auth.uid() = user_id);
create policy "update own students" on students for update using (auth.uid() = user_id);
create policy "delete own students" on students for delete using (auth.uid() = user_id);
