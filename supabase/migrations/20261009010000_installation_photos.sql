-- À exécuter après 20261008010000_installation_shared_manager.sql.
-- Photo compacte liée au signalement : aucune URL publique ni bucket public.
begin;
alter table public.sport_installation_incidents add column if not exists photo_data text;
alter table public.sport_installation_incidents drop constraint if exists installation_photo_size;
alter table public.sport_installation_incidents add constraint installation_photo_size
  check (photo_data is null or (length(photo_data)<=300000 and photo_data ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'));
-- Les mêmes politiques RLS protègent la photo et le signalement. Une photo ne peut
-- pas être remplacée par le responsable lors d'un changement de statut.
create or replace function public.eps_installation_photo_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.photo_data is distinct from old.photo_data and auth.role() <> 'service_role' then
    raise exception 'La photo du signalement ne peut pas être remplacée' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists eps_installation_photo_immutable on public.sport_installation_incidents;
create trigger eps_installation_photo_immutable before update on public.sport_installation_incidents
  for each row execute function public.eps_installation_photo_immutable();
notify pgrst, 'reload schema';
commit;
