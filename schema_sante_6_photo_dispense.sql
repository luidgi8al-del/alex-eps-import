-- Photo du justificatif d'une dispense (formulaire Infirmerie, site et application).
--
-- La photo est rangee a part de la dispense : un certificat medical ne doit etre lisible que
-- par le compte qui l'a photographie, alors que la dispense elle-meme est vue par l'equipe.
-- Aucune URL publique, aucun bucket : l'image est un JPEG compact (data URL), comme les photos
-- des signalements d'installations.
--
-- Idempotent : ce fichier peut etre relance sans risque. A executer APRES
-- schema_sante_5_saisie_infirmerie.sql (provenance « Infirmerie » des dispenses).
begin;

create table if not exists public.health_dispensation_photos (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Pas de cle etrangere : la dispense part par la file hors connexion et peut arriver au
  -- serveur APRES sa photo ; une cle etrangere ferait alors refuser la photo.
  dispensation_id uuid not null,
  photo_data text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false
);

alter table public.health_dispensation_photos drop constraint if exists health_dispensation_photo_format;
alter table public.health_dispensation_photos add constraint health_dispensation_photo_format
  check (length(photo_data) <= 300000 and photo_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$');

create index if not exists idx_health_dispensation_photos_dispense
  on public.health_dispensation_photos(dispensation_id) where deleted = false;
-- Index (updated_at, id) : la regle de toute table synchronisee.
create index if not exists idx_health_dispensation_photos_sync
  on public.health_dispensation_photos(updated_at, id);

alter table public.health_dispensation_photos enable row level security;
drop policy if exists eps_read on public.health_dispensation_photos;
drop policy if exists eps_insert on public.health_dispensation_photos;
drop policy if exists eps_update on public.health_dispensation_photos;
drop policy if exists eps_delete on public.health_dispensation_photos;
-- Seul le compte qui a pris la photo la voit, la remplace ou l'efface.
create policy eps_read on public.health_dispensation_photos for select to authenticated
  using (user_id = auth.uid() and eps_account_active());
create policy eps_insert on public.health_dispensation_photos for insert to authenticated
  with check (user_id = auth.uid() and eps_account_active());
create policy eps_update on public.health_dispensation_photos for update to authenticated
  using (user_id = auth.uid() and eps_account_active()) with check (user_id = auth.uid() and eps_account_active());
create policy eps_delete on public.health_dispensation_photos for delete to authenticated
  using (user_id = auth.uid() and eps_account_active());
grant select, insert, update, delete on public.health_dispensation_photos to authenticated;

insert into public.eps_schema_marks (name) values ('sante_6')
  on conflict (name) do update set applied_at = now();

notify pgrst, 'reload schema';
commit;

-- Verification apres coup (lecture seule) :
-- select name, applied_at from public.eps_schema_marks where name in ('sante_5','sante_6');
