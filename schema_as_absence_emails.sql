-- Envoi automatique et idempotent des absences AS.
-- A executer une fois dans le SQL Editor Supabase avant de deployer la fonction
-- eps-as-absence-email. Le script ne cree aucun envoi pour les appels historiques.

begin;

create table if not exists public.unss_absence_email_queue (
  id uuid primary key default gen_random_uuid(),
  attendance_id text not null references public.unss_attendance(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null references public.unss_sessions(id) on delete cascade,
  student_id text not null references public.unss_students(id) on delete restrict,
  recipient text not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','cancelled')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique(attendance_id, recipient)
);

create index if not exists idx_unss_absence_email_pending
  on public.unss_absence_email_queue(user_id, status, created_at);

alter table public.unss_absence_email_queue enable row level security;
drop policy if exists "read own AS absence emails" on public.unss_absence_email_queue;
create policy "read own AS absence emails" on public.unss_absence_email_queue
  for select to authenticated using (auth.uid() = user_id);

create or replace function public.eps_queue_as_absence_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_emails text;
  v_recipient text;
begin
  if new.present then
    update public.unss_absence_email_queue
       set status='cancelled', last_error=null
     where attendance_id=new.id and status in ('pending','failed');
    return new;
  end if;

  select parent_email into v_parent_emails
    from public.unss_students
   where id=new.student_id and deleted=false;

  for v_recipient in
    select lower(trim(value))
      from regexp_split_to_table(coalesce(v_parent_emails,''), E'\\s*[;,]\\s*|\\s+') value
     where trim(value) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$'
  loop
    insert into public.unss_absence_email_queue(
      attendance_id,user_id,session_id,student_id,recipient,status
    ) values(new.id,new.user_id,new.session_id,new.student_id,v_recipient,'pending')
    on conflict(attendance_id,recipient) do update
      set status=case
        when public.unss_absence_email_queue.status='sent' then 'sent'
        else 'pending'
      end,
      last_error=null;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_queue_as_absence_email on public.unss_attendance;
create trigger trg_queue_as_absence_email
after insert or update of present on public.unss_attendance
for each row execute function public.eps_queue_as_absence_email();

revoke all on table public.unss_absence_email_queue from anon, authenticated;
grant select on table public.unss_absence_email_queue to authenticated;

commit;
