-- Profil propre au professeur. Ne contient ni mot de passe, ni PIN, ni signature.
begin;
create table if not exists public.teacher_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);
alter table public.teacher_profiles enable row level security;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='teacher_profiles' and policyname='own teacher profile') then
    create policy "own teacher profile" on public.teacher_profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
  end if;
end $$;
grant select,insert,update on public.teacher_profiles to authenticated;
create or replace function public.save_teacher_profile(p_revision bigint,p_profile jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare new_revision bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(p_profile) <> 'object' then raise exception 'Invalid profile'; end if;
  if p_revision=0 then
    insert into public.teacher_profiles(user_id,profile) values(auth.uid(),p_profile)
    on conflict(user_id) do nothing returning revision into new_revision;
  else
    update public.teacher_profiles set profile=p_profile,revision=revision+1,updated_at=now()
    where user_id=auth.uid() and revision=p_revision returning revision into new_revision;
  end if;
  return jsonb_build_object('saved',new_revision is not null,'revision',new_revision);
end $$;
revoke all on function public.save_teacher_profile(bigint,jsonb) from public;
grant execute on function public.save_teacher_profile(bigint,jsonb) to authenticated;
commit;
