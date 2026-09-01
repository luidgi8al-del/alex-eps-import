-- Additive migration. Run in the existing EPS Supabase project before publishing the clients.
-- No row or existing policy is removed. Existing student RLS continues to protect these fields.
begin;
alter table public.students add column if not exists birth_date_epoch_millis bigint;
alter table public.students add column if not exists parent_phone text;
alter table public.students add column if not exists extended_data_updated_at timestamptz;
create table if not exists public.teacher_period_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  period_counts jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.teacher_period_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='teacher_period_settings' and policyname='teacher owns period settings') then
    create policy "teacher owns period settings" on public.teacher_period_settings for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
  end if;
end $$;
grant select,insert,update on public.teacher_period_settings to authenticated;
create or replace function public.save_teacher_period_settings(p_revision bigint,p_counts jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare new_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_counts) <> 'object' or p_counts = '{}'::jsonb then raise exception 'Invalid periods'; end if;
  if exists(select 1 from jsonb_each_text(p_counts) x where x.value not in ('3','4','5')) then raise exception 'Invalid period count'; end if;
  if p_revision=0 then
    insert into public.teacher_period_settings(user_id,period_counts) values(auth.uid(),p_counts)
    on conflict(user_id) do nothing returning revision into new_revision;
  else
    update public.teacher_period_settings set period_counts=p_counts,revision=revision+1,updated_at=now()
    where user_id=auth.uid() and revision=p_revision returning revision into new_revision;
  end if;
  return jsonb_build_object('saved',new_revision is not null,'revision',new_revision);
end $$;
revoke all on function public.save_teacher_period_settings(bigint,jsonb) from public;
grant execute on function public.save_teacher_period_settings(bigint,jsonb) to authenticated;
commit;
