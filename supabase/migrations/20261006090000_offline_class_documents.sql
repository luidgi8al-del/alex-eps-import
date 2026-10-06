-- Documents de classe hors connexion : documents demandes et etat rendu/manquant.
begin;

do $$
begin
  if to_regclass('public.class_documents') is null
     or to_regclass('public.class_document_returns') is null then
    raise exception 'Appliquer d’abord schema_classe_tableau_de_bord.sql';
  end if;
  if to_regprocedure('public.eps_bump_version()') is null then
    raise exception 'Appliquer d’abord schema_versions_hors_connexion.sql';
  end if;
end $$;

alter table public.class_documents add column if not exists version bigint not null default 1;
alter table public.class_documents add column if not exists deleted boolean not null default false;
alter table public.class_documents add column if not exists updated_at timestamptz not null default now();
alter table public.class_documents add column if not exists archived boolean not null default false;
alter table public.class_documents add column if not exists archived_at timestamptz;
create index if not exists class_documents_maj_idx on public.class_documents(updated_at,id);
drop trigger if exists eps_bump_version on public.class_documents;
drop trigger if exists eps_version_guard on public.class_documents;
create trigger eps_version_guard before insert or update on public.class_documents
for each row execute function public.eps_bump_version();

alter table public.class_document_returns add column if not exists version bigint not null default 1;
alter table public.class_document_returns add column if not exists deleted boolean not null default false;
alter table public.class_document_returns add column if not exists updated_at timestamptz not null default now();
create index if not exists class_document_returns_maj_idx on public.class_document_returns(updated_at,id);
drop trigger if exists eps_bump_version on public.class_document_returns;
drop trigger if exists eps_version_guard on public.class_document_returns;
create trigger eps_version_guard before insert or update on public.class_document_returns
for each row execute function public.eps_bump_version();

insert into public.eps_schema_marks(name) values ('hors_connexion_5')
on conflict(name) do update set applied_at=now();

commit;
