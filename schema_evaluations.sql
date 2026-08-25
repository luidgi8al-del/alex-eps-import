-- Grilles d'evaluation d'un cycle, en miroir des tables Room de l'application (EvaluationEntity,
-- EvaluationCriterionEntity, EvaluationScoreEntity). A executer apres schema_cycles.sql.

create table if not exists evaluations (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  cycle_id text not null references cycles(id) on delete cascade,
  type text not null check (type in ('PONCTUELLE','FINALE')),
  label text not null,
  date_epoch_millis bigint not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists evaluation_criteria (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  evaluation_id text not null references evaluations(id) on delete cascade,
  label text not null,
  max_points int not null,
  order_index int not null default 0,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists evaluation_scores (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  criterion_id text not null references evaluation_criteria(id) on delete cascade,
  student_id text not null references students(id) on delete cascade,
  points numeric,
  updated_at timestamptz not null default now(),
  unique (criterion_id, student_id)
);

create index if not exists idx_evaluations_cycle_id on evaluations(cycle_id);
create index if not exists idx_evaluation_criteria_evaluation_id on evaluation_criteria(evaluation_id);
create index if not exists idx_evaluation_scores_criterion_id on evaluation_scores(criterion_id);
create index if not exists idx_evaluation_scores_student_id on evaluation_scores(student_id);

alter table evaluations enable row level security;
alter table evaluation_criteria enable row level security;
alter table evaluation_scores enable row level security;

create policy "select own evaluations" on evaluations for select using (auth.uid() = user_id);
create policy "insert own evaluations" on evaluations for insert with check (auth.uid() = user_id);
create policy "update own evaluations" on evaluations for update using (auth.uid() = user_id);
create policy "delete own evaluations" on evaluations for delete using (auth.uid() = user_id);

create policy "select own criteria" on evaluation_criteria for select using (auth.uid() = user_id);
create policy "insert own criteria" on evaluation_criteria for insert with check (auth.uid() = user_id);
create policy "update own criteria" on evaluation_criteria for update using (auth.uid() = user_id);
create policy "delete own criteria" on evaluation_criteria for delete using (auth.uid() = user_id);

create policy "select own scores" on evaluation_scores for select using (auth.uid() = user_id);
create policy "insert own scores" on evaluation_scores for insert with check (auth.uid() = user_id);
create policy "update own scores" on evaluation_scores for update using (auth.uid() = user_id);
create policy "delete own scores" on evaluation_scores for delete using (auth.uid() = user_id);
