-- Extension hors connexion : outils et incidents. Aucun droit de partage modifié.
begin;
do $$
declare t text;
begin
  foreach t in array array['eps_saved_tool_works', 'sport_installation_contacts', 'sport_installation_incidents'] loop
    if to_regclass('public.' || t) is null then
      raise exception 'Table requise absente : %', t;
    end if;
    execute format('alter table public.%I add column if not exists version bigint not null default 1', t);
    execute format('alter table public.%I add column if not exists deleted boolean not null default false', t);
    execute format('alter table public.%I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('create index if not exists %I on public.%I(updated_at, id)', t || '_maj_idx', t);
    execute format('drop trigger if exists eps_bump_version on public.%I', t);
    execute format('drop trigger if exists eps_version_guard on public.%I', t);
    execute format('create trigger eps_version_guard before insert or update on public.%I for each row execute function public.eps_bump_version()', t);
  end loop;
end $$;
insert into public.eps_schema_marks(name) values ('hors_connexion_3')
on conflict(name) do update set applied_at = now();
commit;
