-- ============================================================================
-- Alex EPS Outils — Import de classes depuis le web
-- A coller UNE FOIS dans le SQL Editor d'un nouveau projet Supabase.
-- Principe : le prof se connecte (email/mot de passe), depose un CSV, le
-- valide sur la page, puis l'app Android vient recuperer l'import et cree la
-- classe + les eleves localement. Rien d'autre ne transite par le cloud.
-- ============================================================================

-- ── 1. Un import de classe = 1 ligne (classe + niveau + annee) ─────────────
create table public.pending_class_imports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  grade         text not null,          -- ex: 'CINQUIEME' (SchoolGrade cote app)
  class_number  integer not null check (class_number between 1 and 8),
  school_year   text not null,
  status        text not null default 'pending' check (status in ('pending', 'imported')),
  created_at    timestamptz not null default now()
);

alter table public.pending_class_imports enable row level security;

create policy "select own imports" on public.pending_class_imports
  for select using (auth.uid() = user_id);
create policy "insert own imports" on public.pending_class_imports
  for insert with check (auth.uid() = user_id);
create policy "update own imports" on public.pending_class_imports
  for update using (auth.uid() = user_id);
create policy "delete own imports" on public.pending_class_imports
  for delete using (auth.uid() = user_id);

-- ── 2. Les eleves rattaches a un import ─────────────────────────────────────
create table public.pending_students (
  id             uuid primary key default gen_random_uuid(),
  import_id      uuid not null references public.pending_class_imports(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  last_name      text not null,
  first_name     text not null,
  sex            text not null default 'NON_PRECISE',
  eps_level      text not null default 'MOYEN',
  student_email  text,
  parent_emails  text
);

alter table public.pending_students enable row level security;

create policy "select own students" on public.pending_students
  for select using (auth.uid() = user_id);
create policy "insert own students" on public.pending_students
  for insert with check (auth.uid() = user_id);
create policy "delete own students" on public.pending_students
  for delete using (auth.uid() = user_id);

create index idx_pending_students_import on public.pending_students(import_id);
create index idx_pending_imports_user_status on public.pending_class_imports(user_id, status);
