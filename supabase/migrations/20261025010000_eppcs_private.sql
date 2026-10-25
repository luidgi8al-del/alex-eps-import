-- Atelier EPPCS privé : aucun cours n'est publié dans les fichiers du site.
-- Prérequis : comptes actifs et rôle responsable installation déjà déployés.
begin;
create table if not exists public.eps_eppcs_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key(user_id, document_id),
  constraint eps_eppcs_document_key check (document_id = 'library' or document_id ~ '^note:[a-zA-Z0-9._-]{1,100}$'),
  constraint eps_eppcs_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint eps_eppcs_payload_size check (octet_length(payload::text) <= case when document_id = 'library' then 4194304 else 65536 end)
);
alter table public.eps_eppcs_documents enable row level security;
revoke all on public.eps_eppcs_documents from public, anon, authenticated;
grant select on public.eps_eppcs_documents to authenticated;
drop policy if exists eps_eppcs_owner on public.eps_eppcs_documents;
create policy eps_eppcs_owner on public.eps_eppcs_documents for select to authenticated
  using(user_id = auth.uid() and public.eps_account_active() and
    not exists(select 1 from public.eps_installation_managers m where m.user_id = auth.uid()));

create or replace function public.eps_save_eppcs_document(p_document_id text, p_expected bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  saved_revision bigint;
  current_record public.eps_eppcs_documents%rowtype;
begin
  if actor is null or not public.eps_account_active() or
    exists(select 1 from public.eps_installation_managers m where m.user_id = actor)
  then raise exception 'Compte professeur actif nécessaire' using errcode = '42501'; end if;
  if p_document_id is null or not (p_document_id = 'library' or p_document_id ~ '^note:[a-zA-Z0-9._-]{1,100}$') or
    p_expected is null or p_expected < 0 or p_payload is null or jsonb_typeof(p_payload) is distinct from 'object' or
    octet_length(p_payload::text) > (case when p_document_id = 'library' then 4194304 else 65536 end)
  then raise exception 'Contenu EPPCS invalide' using errcode = '22023'; end if;
  if p_document_id <> 'library' then
    if jsonb_typeof(p_payload->'text') is distinct from 'string' or
      p_payload - array['text','status','savedAt'] <> '{}'::jsonb or
      (p_payload ? 'status' and (jsonb_typeof(p_payload->'status') is distinct from 'string' or p_payload->>'status' not in ('preparer','enseigne'))) or
      (p_payload ? 'savedAt' and (jsonb_typeof(p_payload->'savedAt') is distinct from 'string' or
        p_payload->>'savedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'))
    then raise exception 'Note EPPCS invalide' using errcode = '22023'; end if;
  end if;
  -- Serialize creations and updates for this account, including the bounded note count.
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':eppcs', 0));
  if p_expected = 0 then
    if not exists(select 1 from public.eps_eppcs_documents where user_id=actor and document_id=p_document_id) and
       (select count(*) from public.eps_eppcs_documents where user_id=actor) >= 501
    then raise exception 'Limite de documents EPPCS atteinte' using errcode = '22023'; end if;
    insert into public.eps_eppcs_documents(user_id,document_id,payload)
      values(actor,p_document_id,p_payload)
      on conflict(user_id,document_id) do nothing returning revision into saved_revision;
  else
    update public.eps_eppcs_documents set payload=p_payload, revision=revision+1, updated_at=now()
      where user_id=actor and document_id=p_document_id and revision=p_expected
      returning revision into saved_revision;
  end if;
  if saved_revision is not null then
    return jsonb_build_object('saved', true, 'revision', saved_revision);
  end if;
  select * into current_record from public.eps_eppcs_documents where user_id=actor and document_id=p_document_id;
  return jsonb_build_object('saved', false, 'current', case when current_record.document_id is null then null else to_jsonb(current_record) end);
end;
$$;
revoke all on function public.eps_save_eppcs_document(text,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.eps_save_eppcs_document(text,bigint,jsonb) to authenticated;
commit;
