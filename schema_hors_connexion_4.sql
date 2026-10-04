-- Suivi de classe hors connexion. Conserve les lignes et les droits existants.
-- À exécuter une fois dans le SQL Editor Supabase, puis rouvrir le site connecté.
begin;
do $$
begin
  if to_regclass('public.class_notes') is null then
    raise exception 'La table class_notes doit déjà exister';
  end if;
  if to_regprocedure('public.eps_bump_version()') is null then
    raise exception 'Appliquer d’abord schema_versions_hors_connexion.sql';
  end if;
end $$;
alter table public.class_notes add column if not exists version bigint not null default 1;
alter table public.class_notes add column if not exists deleted boolean not null default false;
alter table public.class_notes add column if not exists updated_at timestamptz not null default now();
create index if not exists class_notes_maj_idx on public.class_notes(updated_at,id);
drop trigger if exists eps_bump_version on public.class_notes;
drop trigger if exists eps_version_guard on public.class_notes;
create trigger eps_version_guard before insert or update on public.class_notes
for each row execute function public.eps_bump_version();
insert into public.eps_schema_marks(name) values ('hors_connexion_4')
on conflict(name) do update set applied_at=now();
commit;
