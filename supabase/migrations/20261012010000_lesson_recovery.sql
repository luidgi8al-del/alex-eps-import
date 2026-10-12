-- Reprise du contenu rédigé des séances. Ne modifie ni les notes ni les droits existants.
begin;
create table if not exists public.eps_lesson_archives (
  id text primary key,
  cycle_id text not null unique references public.cycles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null default 1,
  version bigint not null default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.eps_lesson_archives enable row level security;
revoke all on public.eps_lesson_archives from anon,authenticated;
grant select on public.eps_lesson_archives to authenticated;
drop policy if exists eps_lesson_archive_owner on public.eps_lesson_archives;
create policy eps_lesson_archive_owner on public.eps_lesson_archives for select to authenticated
  using(user_id=auth.uid() and public.eps_account_active() and not exists(select 1 from public.eps_installation_managers m where m.user_id=auth.uid()));
create or replace function public.eps_save_lesson_archive(p_cycle_id text,p_expected bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result_revision bigint;
begin
  if auth.uid() is null or not public.eps_account_active() or
     exists(select 1 from public.eps_installation_managers m where m.user_id=auth.uid()) or
     not exists(select 1 from public.cycles c where c.id=p_cycle_id and c.user_id=auth.uid() and not c.deleted)
  then raise exception 'Compte professeur propriétaire nécessaire' using errcode='42501'; end if;
  if p_expected is null or p_expected<0 or octet_length(p_payload::text)>2097152 or p_payload->>'formatVersion' is distinct from '1' or
     jsonb_typeof(p_payload->'lessons') is distinct from 'array' or jsonb_array_length(p_payload->'lessons')>100
  then raise exception 'Contenu de séances invalide'; end if;
  if p_expected=0 then
    insert into public.eps_lesson_archives(id,cycle_id,user_id,payload) values(p_cycle_id,p_cycle_id,auth.uid(),p_payload)
      on conflict(cycle_id) do nothing returning revision into result_revision;
  else
    update public.eps_lesson_archives set payload=p_payload,revision=revision+1,version=version+1,updated_at=now()
      where cycle_id=p_cycle_id and user_id=auth.uid() and revision=p_expected returning revision into result_revision;
  end if;
  return jsonb_build_object('saved',result_revision is not null,'revision',result_revision);
end;
$$;
revoke all on function public.eps_save_lesson_archive(text,bigint,jsonb) from public,anon;
grant execute on function public.eps_save_lesson_archive(text,bigint,jsonb) to authenticated;
commit;
