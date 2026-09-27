-- Un responsable WhatsApp commun a toutes les installations du professeur.
create table if not exists public.sport_installation_contacts (
  id text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  contact_name text not null,
  whatsapp_phone text not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  version bigint not null default 1
);

-- Historique interne : ouvrir WhatsApp ne prouve pas que le message a ete envoye. Le statut
-- est donc confirme explicitement par l'enseignant apres son retour dans le site.
create table if not exists public.sport_installation_incidents (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null references public.sport_installations(id) on delete cascade,
  installation_name text not null,
  incident_type text not null,
  description text not null,
  urgency text not null default 'NORMAL' check (urgency in ('NORMAL','URGENT')),
  status text not null default 'A_ENVOYER' check (status in ('A_ENVOYER','SIGNALE','EN_COURS','RESOLU')),
  message_text text not null,
  whatsapp_phone text not null,
  reported_by text,
  reported_at timestamptz not null default now(),
  sent_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  version bigint not null default 1
);

create index if not exists idx_sport_installation_incidents_owner
  on public.sport_installation_incidents(user_id, installation_id, reported_at desc);

alter table public.sport_installation_contacts enable row level security;
alter table public.sport_installation_incidents enable row level security;

drop policy if exists eps_installation_contact_owner on public.sport_installation_contacts;
create policy eps_installation_contact_owner on public.sport_installation_contacts
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists eps_installation_incident_owner on public.sport_installation_incidents;
create policy eps_installation_incident_owner on public.sport_installation_incidents
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if to_regprocedure('public.eps_bump_version()') is not null then
    drop trigger if exists eps_bump_version on public.sport_installation_contacts;
    create trigger eps_bump_version before update on public.sport_installation_contacts
      for each row execute function public.eps_bump_version();
    drop trigger if exists eps_bump_version on public.sport_installation_incidents;
    create trigger eps_bump_version before update on public.sport_installation_incidents
      for each row execute function public.eps_bump_version();
  end if;
end $$;
