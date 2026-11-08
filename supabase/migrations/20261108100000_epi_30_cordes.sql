-- À exécuter après 20261108090000_epi_inventory_qr.sql.
-- Ajoute les 30 cordes à la préparation, sans modifier les autres fiches.
begin;
create or replace function public.eps_prepare_epi_inventory()
returns integer language plpgsql security definer set search_path=public as $$
declare
  actor uuid := auth.uid(); school uuid := public.eps_institution();
  family record; number integer; existing integer; created integer := 0; changed integer;
  reference text; stable_id text;
begin
  if actor is null or school is null or not public.eps_account_active()
    or exists(select 1 from public.eps_installation_managers where user_id=actor)
  then raise exception 'Compte professeur actif nécessaire' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(school::text || ':epi-inventory',0));
  for family in select * from (values
    ('BAUDRIER','BAU',20),('CORDE','COR',30),('SYSTEME_ASSURAGE','ASS',20),('MOUSQUETON','MOU',20),('CASQUE','CAS',30)
  ) as f(category,prefix,target) loop
    select count(*) into existing from public.epi_items where institution_id=school and category=family.category;
    number := 1;
    while existing < family.target loop
      reference := family.prefix || '-' || lpad(number::text,3,'0');
      stable_id := 'epi-' || school::text || '-' || lower(reference);
      if not exists(select 1 from public.epi_items where institution_id=school and upper(internal_id)=reference)
        and not exists(select 1 from public.epi_items where id=stable_id) then
        insert into public.epi_items(id,user_id,institution_id,internal_id,category,status,active,qr_code_value)
        values(stable_id,actor,school,reference,family.category,'A_CONTROLER',false,
          'https://luidgi8al-del.github.io/alex-eps-import/?epi=' || stable_id || '#equipement')
        on conflict(id) do nothing;
        get diagnostics changed = row_count;
        existing := existing + changed; created := created + changed;
      end if;
      number := number+1;
      if number>10000 then raise exception 'Numérotation EPI indisponible'; end if;
    end loop;
  end loop;
  return created;
end;
$$;
revoke all on function public.eps_prepare_epi_inventory() from public,anon;
grant execute on function public.eps_prepare_epi_inventory() to authenticated;
notify pgrst,'reload schema';
commit;
