-- ---------------------------------------------------------------------------------------------
-- Tableau de bord d'une classe : bloc-notes et documents a rendre.
--
-- Deux besoins de terrain :
--   1. Noter ce qui ne tient dans aucune case - un binome qui fonctionne, une salle indisponible.
--   2. Suivre ce que les eleves doivent rapporter (autorisation, fiche sante) sans le noter :
--      on coche qui a rendu, et le cours suivant rappelle ceux qui manquent.
--
-- Prive : ces lignes appartiennent a l'enseignant qui les ecrit, pas a l'etablissement. Un
-- collegue qui recupere la classe l'annee suivante n'a pas a lire les notes de son predecesseur.
--
-- Les documents valent pour l'annee, pas pour une periode : une autorisation rendue en septembre
-- l'est encore en juin.
--
-- Idempotent : le relancer ne casse rien. A coller en entier dans le SQL Editor.
-- ---------------------------------------------------------------------------------------------
begin;

create table if not exists public.class_notes (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

create table if not exists public.class_documents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id text not null references public.classes(id) on delete cascade,
  title text not null default '',
  school_year text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Qui a rendu quoi. Une ligne par eleve et par document, creee au premier appui.
create table if not exists public.class_document_returns (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null references public.class_documents(id) on delete cascade,
  student_id text not null references public.students(id) on delete cascade,
  returned boolean not null default true,
  returned_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

-- Deux appuis de suite ne doivent pas creer deux lignes : le compte des rendus serait faux.
create unique index if not exists uq_class_document_returns
  on public.class_document_returns(document_id, student_id) where deleted = false;

create index if not exists idx_class_notes_classe on public.class_notes(class_id) where deleted = false;
create index if not exists idx_class_documents_classe on public.class_documents(class_id) where deleted = false;
create index if not exists idx_class_document_returns_doc on public.class_document_returns(document_id) where deleted = false;

-- Lecture et ecriture strictement personnelles.
do $$ declare t text; begin
  foreach t in array array['class_notes','class_documents','class_document_returns'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists eps_read on public.%I', t);
    execute format('drop policy if exists eps_insert on public.%I', t);
    execute format('drop policy if exists eps_update on public.%I', t);
    execute format('drop policy if exists eps_delete on public.%I', t);
    execute format('create policy eps_read on public.%I for select to authenticated using (user_id = auth.uid() and eps_account_active())', t);
    execute format('create policy eps_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and eps_account_active())', t);
    execute format('create policy eps_update on public.%I for update to authenticated using (user_id = auth.uid() and eps_account_active()) with check (user_id = auth.uid() and eps_account_active())', t);
    execute format('create policy eps_delete on public.%I for delete to authenticated using (user_id = auth.uid() and eps_account_active())', t);
    execute format('grant select,insert,update,delete on public.%I to authenticated', t);
  end loop;
end $$;

analyze public.class_notes;
analyze public.class_documents;
analyze public.class_document_returns;

insert into public.eps_schema_marks (name) values ('classe_tableau_de_bord')
  on conflict (name) do update set applied_at = now();

commit;

-- ---------------------------------------------------------------------------------------------
-- Verification :
--   select name, applied_at from public.eps_schema_marks where name = 'classe_tableau_de_bord';
-- ---------------------------------------------------------------------------------------------
